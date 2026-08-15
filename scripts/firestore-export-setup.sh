#!/usr/bin/env bash
# ============================================================================
#  تصديرُ Firestore إلى الخزنة — سدُّ آخرِ طريقٍ يضيع فيه كلُّ شيءٍ دفعةً واحدة
#
#  المرجع: NOTES.md §5 · docs/storage-backup-plan-2026-08.md
#
#  **المشكلة:** النسخُ المُدارةُ (`firestore backups`) موردٌ **داخلَ المشروع نفسِه**.
#  ممتازةٌ ضدّ الخطأ البشريّ وعطلِ الإقليم — **ولا تنجو من فقدِ المشروع**. فلو حُذف
#  `fast-buildings` أو وقفت فوترتُه، ذهب الأصلُ والنسخةُ معاً. وبعد أن صارت **صورُك**
#  في مشروعين، بقيت **بياناتُك** — وهي الأثمن — في مشروعٍ واحد.
#
#  **وفرقٌ عمليٌّ حاسم:** النسخةُ المُدارة تُستعاد إلى **مشروعها وحدَه**. أمّا التصديرُ
#  فملفّاتٌ محمولةٌ **تُستورَد إلى أيّ مشروعٍ وأيّ قاعدة** — فلا يبقى شيءٌ رهينةَ مشروع.
#
#  التشغيل:  bash scripts/firestore-export-setup.sh
# ============================================================================
set -euo pipefail

# ⚠ درسُ المرحلة ٢: سؤالٌ تفاعليٌّ في سكربتٍ مكتومِ المخرَج = تعليقٌ صامتٌ بلا رسالة.
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

SRC_PROJECT="${SRC_PROJECT:-fast-buildings}"
VAULT_PROJECT="${VAULT_PROJECT:-fast-buildings-vault}"

# حاويةٌ **مستقلّةٌ** عن خزنة الملفّات. لماذا لا نجمعهما؟ لأن Firestore يولّد بادئةً
# زمنيةً تلقائيةً **فقط** حين يكون الهدفُ حاويةً بلا مسار. فلو وجّهناه إلى مجلّدٍ
# داخل خزنة الملفّات، كتب كلَّ يومٍ فوق سابقه في المسار نفسِه. حاويةٌ مستقلّةٌ تعني
# **مجلّداً بتاريخه لكلّ تصدير** — واستعادةُ يومٍ بعينه تصير اختيارَ مجلّد.
EXPORT_BUCKET="${EXPORT_BUCKET:-fast-buildings-firestore-vault}"
EXPORT_LOCATION="${EXPORT_LOCATION:-us-central1}"
EXPORT_RETENTION="${EXPORT_RETENTION:-100d}"

SA_NAME="firestore-export"
SA_EMAIL="${SA_NAME}@${SRC_PROJECT}.iam.gserviceaccount.com"
JOB_NAME="firestore-daily-export"
JOB_LOCATION="${JOB_LOCATION:-us-central1}"
SCHEDULE="${SCHEDULE:-0 3 * * *}"     # ٠٣:٠٠ UTC — بعد نقلة الملفّات (٠٢:٠٠) بساعة

say()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[0;32m✅ %s\033[0m\n' "$*"; }
skip() { printf '  \033[0;33m↷ %s\033[0m\n' "$*"; }
die()  { printf '\n\033[0;31m❌ %s\033[0m\n' "$*" >&2; exit 1; }

say "(٠) تحقُّقٌ قبليّ"
command -v gcloud >/dev/null || die "لا gcloud — شغّل من Cloud Shell."
gcloud auth print-access-token >/dev/null 2>&1 || die "لا جلسةَ دخول: gcloud auth login"
gcloud projects describe "$VAULT_PROJECT" --format="value(projectId)" >/dev/null 2>&1 \
  || die "مشروعُ الخزنة «$VAULT_PROJECT» غيرُ موجود. نفّذ المرحلةَ ٢ أوّلاً."
ok "المشروعان مرئيّان"

gcloud services enable cloudscheduler.googleapis.com --project="$SRC_PROJECT"
gcloud services enable storage.googleapis.com --project="$VAULT_PROJECT"
ok "الواجهاتُ مُفعَّلة"

# ── حاويةُ التصدير ─────────────────────────────────────────────────────────
say "(١) حاويةُ التصدير — gs://$EXPORT_BUCKET في $EXPORT_LOCATION"
if gcloud storage buckets describe "gs://$EXPORT_BUCKET" --project="$VAULT_PROJECT" \
     --format="value(name)" >/dev/null 2>&1; then
  skip "موجودةٌ سلفاً"
else
  gcloud storage buckets create "gs://$EXPORT_BUCKET" \
    --project="$VAULT_PROJECT" \
    --location="$EXPORT_LOCATION" \
    --default-storage-class=STANDARD \
    --uniform-bucket-level-access \
    --public-access-prevention
  ok "أُنشئت في مشروع الخزنة — خارجَ $SRC_PROJECT عمداً"
fi

gcloud storage buckets update "gs://$EXPORT_BUCKET" --project="$VAULT_PROJECT" --versioning
gcloud storage buckets update "gs://$EXPORT_BUCKET" --project="$VAULT_PROJECT" \
  --retention-period="$EXPORT_RETENTION"
ok "Versioning + احتجاز $EXPORT_RETENTION (غيرُ مقفل) · ولا lifecycle فتحتفظ بلا مدّة"

# ── حسابُ الخدمة ───────────────────────────────────────────────────────────
say "(٢) حسابُ خدمةِ التصدير وصلاحياتُه"
if gcloud iam service-accounts describe "$SA_EMAIL" --project="$SRC_PROJECT" \
     >/dev/null 2>&1; then
  skip "الحسابُ موجودٌ سلفاً: $SA_EMAIL"
else
  # ⚠ درسُ المرحلة ٢: اسمُ العرض لاتينيٌّ بسيطٌ — شرطةٌ طويلةٌ أو حرفٌ عربيٌّ يُردّان.
  gcloud iam service-accounts create "$SA_NAME" --project="$SRC_PROJECT" \
    --display-name="Firestore Export to Vault"
  ok "أُنشئ: $SA_EMAIL"
fi

# على المشروع المصدر: تصديرٌ واستيرادٌ فقط — لا قراءةَ مستنداتٍ ولا كتابةَ بيانات.
gcloud projects add-iam-policy-binding "$SRC_PROJECT" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/datastore.importExportAdmin" --condition=None >/dev/null
ok "على $SRC_PROJECT: datastore.importExportAdmin (تصديرٌ فقط لا قراءةُ بيانات)"

gcloud storage buckets add-iam-policy-binding "gs://$EXPORT_BUCKET" \
  --project="$VAULT_PROJECT" \
  --member="serviceAccount:$SA_EMAIL" --role="roles/storage.objectAdmin" >/dev/null
ok "على حاوية التصدير: كتابة"

# ── الجدولة ────────────────────────────────────────────────────────────────
say "(٣) وظيفةُ التصدير اليومية — $SCHEDULE UTC"
# `(default)` مُرمَّزٌ %28default%29: قوسان في مسارِ URL قد يُساءُ تفسيرُهما.
URI="https://firestore.googleapis.com/v1/projects/${SRC_PROJECT}/databases/%28default%29:exportDocuments"
BODY="{\"outputUriPrefix\":\"gs://${EXPORT_BUCKET}\"}"

if gcloud scheduler jobs describe "$JOB_NAME" --project="$SRC_PROJECT" \
     --location="$JOB_LOCATION" --format="value(name)" >/dev/null 2>&1; then
  skip "الوظيفةُ موجودةٌ سلفاً — تُحدَّث"
  gcloud scheduler jobs update http "$JOB_NAME" --project="$SRC_PROJECT" \
    --location="$JOB_LOCATION" --schedule="$SCHEDULE" --time-zone="UTC" \
    --uri="$URI" --http-method=POST \
    --oauth-service-account-email="$SA_EMAIL" \
    --headers="Content-Type=application/json" \
    --message-body="$BODY" >/dev/null
else
  gcloud scheduler jobs create http "$JOB_NAME" --project="$SRC_PROJECT" \
    --location="$JOB_LOCATION" --schedule="$SCHEDULE" --time-zone="UTC" \
    --uri="$URI" --http-method=POST \
    --oauth-service-account-email="$SA_EMAIL" \
    --headers="Content-Type=application/json" \
    --message-body="$BODY" >/dev/null
fi
ok "مجدولةٌ يومياً $SCHEDULE UTC — الهدفُ gs://$EXPORT_BUCKET (بادئةٌ زمنيةٌ لكلّ تصدير)"

say "(٤) تصديرٌ أوّلُ الآن (لا ننتظر الجدولة)"
gcloud firestore export "gs://$EXPORT_BUCKET" --project="$SRC_PROJECT" --async
ok "بدأ — يعمل في الخلفية (دقائق). تابعه بـ scripts/firestore-export-check.sh"

cat <<EOF

════════════════════════════════════════════════════════════════════════════
  تمّ الإعداد. **ولم يُثبَت شيءٌ بعد.**

  تصديرٌ لم يُستورَد ليس نسخةً بل افتراضٌ أنّ الملفّات سليمة — وهو درسُ §5
  حرفياً، وقد أثبته يومُ الملفّات: فحصٌ يقرأ حقلاً أعلن كارثةً وهمية،
  والحقيقةُ كانت مع الفحص الذي يقيس السلوك.

  انتظر انتهاءَ التصدير الأوّل ثمّ:
      bash scripts/firestore-export-check.sh    # هل تمّ؟ وما عمرُه؟
      bash scripts/firestore-export-drill.sh    # الاستيرادُ الفعليّ — يُثبت أو يُسقط

  وبروفةُ العبور بين المشاريع (تُشغَّل مرّةً على الأقلّ — وهي جوهرُ البند):
      bash scripts/firestore-export-drill.sh --cross-project
════════════════════════════════════════════════════════════════════════════
EOF
