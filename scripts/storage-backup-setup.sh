#!/usr/bin/env bash
# ============================================================================
#  سدُّ فجوةِ النسخ الاحتياطي لـ Cloud Storage — الإعداد
#  (الطبقات الثلاث: داخلَ الحاوية · حاويةٌ ثانيةٌ في مشروعٍ منفصل · إثباتُ الاستعادة)
#
#  المرجع: NOTES.md §5 «النسخُ الاحتياطي والتعافي» و docs/storage-backup-plan-2026-08.md
#
#  السكربتُ **عديمُ الأثرِ عند التكرار** (idempotent): كلُّ خطوةٍ تفحص الحالةَ القائمة
#  قبل أن تكتب، فتشغيلُه مرّتين لا يُنشئ شيئاً مرّتين ولا يُسقط خطأً.
#
#  التشغيل (من Cloud Shell):
#      bash scripts/storage-backup-setup.sh --layer1-only   # المرحلة ١ — دقيقتان
#      bash scripts/storage-backup-setup.sh --vault-only    # المرحلة ٢ — بعد الفوترة
#      bash scripts/storage-backup-setup.sh                 # الاثنتان معاً
#  أو بمتغيّراتٍ مخصَّصة:
#      VAULT_PROJECT=my-vault bash scripts/storage-backup-setup.sh
#
#  ⚠ **لماذا مرحلتان؟** المرحلةُ ١ أمران على الحاوية القائمة: بلا مشروعٍ جديدٍ ولا
#  فوترةٍ ولا صلاحيات — تنقل الحمايةَ من ٧ أيامٍ إلى ١٢٠ في دقيقتين. أمّا المرحلةُ ٢
#  فتحتاج إنشاءَ مشروعٍ وربطَ فوترة — قرارٌ إداريٌّ قد يتأجّل أسابيع.
#  **وربطُهما في أمرٍ واحدٍ كان يُبقي ٩٠٪ من الحماية رهينةَ إجراءٍ إداريّ** — ولذلك
#  فحصُ مشروع الخزنة يجري **بعد** تطبيق المرحلة ١ لا قبلها، وحارسٌ في hail-tests
#  يمنع ارتدادَ هذا الترتيب.
# ============================================================================
set -euo pipefail

# ⚠ **بلا أسئلةٍ تفاعلية.** بعضُ أوامر gcloud — و`transfer authorize` منها — تسأل
#   «هل تريد المتابعة؟» وتنتظر. وفي سكربتٍ يُكتَم فيه المخرَجُ يصير السؤالُ **تعليقاً
#   صامتاً**: لا رسالةَ ولا خطأَ ولا تقدُّم، والمستخدمُ ينتظر شيئاً لا يأتي.
#   هذا المتغيّرُ يجعل gcloud كلَّها غيرَ تفاعلية، فتُجيب بالافتراض أو تسقط بخطأ صريح.
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

# ── الوضع ───────────────────────────────────────────────────────────────────
MODE="full"
case "${1:-}" in
  --layer1-only|--layer-1|-1) MODE="layer1" ;;
  --vault-only|--layer-2|-2)  MODE="vault"  ;;
  ""|--full)                  MODE="full"   ;;
  -h|--help)
    sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
    exit 0 ;;
  *) echo "وسيطٌ غيرُ معروف: $1   (جرّب --help)" >&2; exit 2 ;;
esac

# ── الثوابت ─────────────────────────────────────────────────────────────────
SRC_PROJECT="${SRC_PROJECT:-fast-buildings}"
SRC_BUCKET="${SRC_BUCKET:-fast-buildings.firebasestorage.app}"

VAULT_PROJECT="${VAULT_PROJECT:-fast-buildings-vault}"
VAULT_BUCKET="${VAULT_BUCKET:-fast-buildings-storage-vault}"
VAULT_LOCATION="${VAULT_LOCATION:-us-central1}"

# أفقُ Firestore ٩٨ يوماً — وكلُّ مددِ Storage تتجاوزه بهامش، فلا يبقى يومٌ
# تُستعاد فيه المستنداتُ بلا صورِها. (انظر §5: «الفجوةُ كانت ٩٨ مقابل ٧».)
FIRESTORE_RETENTION_DAYS=98
NONCURRENT_KEEP_DAYS="${NONCURRENT_KEEP_DAYS:-120}"   # > ٩٨ بهامش ٢٢ يوماً
SOFT_DELETE_DURATION="${SOFT_DELETE_DURATION:-90d}"   # ٩٠ يوماً = السقفُ الذي يسمح به GCS
VAULT_RETENTION="${VAULT_RETENTION:-100d}"            # سياسةُ احتجازٍ **غيرُ مقفلة**

JOB_NAME="transferJobs/fast-buildings-storage-vault-daily"

TMPDIR_="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_"' EXIT

say()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[0;32m✅ %s\033[0m\n' "$*"; }
skip() { printf '  \033[0;33m↷ %s\033[0m\n' "$*"; }
die()  { printf '\n\033[0;31m❌ %s\033[0m\n' "$*" >&2; exit 1; }

# ============================================================================
#  المرحلةُ ١ — داخلَ الحاوية المصدر (آليةُ التعافي اليومية)
#  لماذا هي الأولى: الاستعادةُ داخلَ الحاوية تُعيد الكائنَ **بميتاداتاه**، ومنها
#  firebaseStorageDownloadTokens — فتعمل الروابطُ المخزَّنةُ في Firestore فوراً
#  بلا لمسِ مستندٍ واحد. الحاويةُ الثانيةُ ملاذٌ أخير لا أداةٌ أولى.
# ============================================================================
layer1_apply() {
  say "(١) الحاويةُ المصدر — Versioning + Soft Delete + lifecycle"

  local VERS
  VERS="$(gcloud storage buckets describe "gs://$SRC_BUCKET" --project="$SRC_PROJECT" \
          --format="value(versioning_enabled)" 2>/dev/null || echo "")"
  if [ "$VERS" = "True" ]; then
    skip "Versioning مُفعَّلٌ سلفاً"
  else
    gcloud storage buckets update "gs://$SRC_BUCKET" --project="$SRC_PROJECT" --versioning
    ok "Versioning مُفعَّل"
  fi

  # ٩٠ يوماً هو السقفُ الذي يسمح به GCS لسياسة الحذف الليّن. ولذلك **لا يكفي وحدَه**:
  # ٩٠ < ٩٨، فتبقى ثمانيةُ أيامٍ عمياء. Versioning هو الذي يغطّيها (بلا سقف).
  gcloud storage buckets update "gs://$SRC_BUCKET" --project="$SRC_PROJECT" \
    --soft-delete-duration="$SOFT_DELETE_DURATION"
  ok "Soft Delete = $SOFT_DELETE_DURATION"

  # lifecycle: يحذف **النسخَ غيرَ الحالية** بعد $NONCURRENT_KEEP_DAYS يوماً — ولا يمسّ
  # النسخةَ الحيّة أبداً. مصيدة: قاعدةٌ بلا isLive:false كانت ستحذف الملفّاتِ العاملة.
  cat > "$TMPDIR_/src-lifecycle.json" <<EOF
{
  "rule": [
    {
      "action": { "type": "Delete" },
      "condition": { "daysSinceNoncurrentTime": $NONCURRENT_KEEP_DAYS, "isLive": false }
    }
  ]
}
EOF
  gcloud storage buckets update "gs://$SRC_BUCKET" --project="$SRC_PROJECT" \
    --lifecycle-file="$TMPDIR_/src-lifecycle.json"
  ok "lifecycle: حذفُ النسخِ غيرِ الحالية بعد $NONCURRENT_KEEP_DAYS يوماً (النسخةُ الحيّة لا تُمسّ)"
}

# ============================================================================
#  المرحلةُ ٢ — حاويةٌ ثانيةٌ في مشروعٍ منفصلٍ وإقليمٍ آخر (الكارثة)
#  ⚠ كلُّ ما يخصّ الخزنة — بما فيه **فحصُ وجود المشروع** — يعيش هنا وحدَه.
#     نقلُ ذاك الفحص إلى التحقُّق القبليّ يُعيد ربطَ المرحلة ١ بقرارٍ إداريّ.
# ============================================================================
require_vault_project() {
  if gcloud projects describe "$VAULT_PROJECT" --format="value(projectId)" >/dev/null 2>&1; then
    ok "مشروعُ الخزنة موجود: $VAULT_PROJECT"
    return 0
  fi
  cat >&2 <<EOF

  ❌ المشروعُ «$VAULT_PROJECT» غيرُ موجودٍ أو غيرُ مرئيّ.
     أنشئه أوّلاً واربطه بحسابِ فوترة (خطوةٌ يدويةٌ مقصودة — إنشاءُ مشروعٍ
     وربطُ فوترةٍ قرارٌ إداريٌّ لا يُؤتمَت):

       gcloud projects create $VAULT_PROJECT --name="Fast Buildings Storage Vault"
       gcloud billing projects link $VAULT_PROJECT --billing-account=<BILLING_ACCOUNT_ID>

     ⚠ اسمُ العرض لاتينيٌّ بسيطٌ عمداً: Google تقبل فيه الحروفَ اللاتينيةَ والأرقامَ
       والمسافةَ والشرطةَ العاديةَ فقط — فشرطةٌ طويلة «—» أو حرفٌ عربيٌّ يُردّان بـ
       INVALID_ARGUMENT: project display name contains invalid characters.
       (وقعنا فيها فعلاً: الشرطةُ الطويلةُ في الأمر المقترَح أسقطت الإنشاء.)

     ثم:  bash scripts/storage-backup-setup.sh --vault-only
EOF
  if [ "$MODE" = "full" ]; then
    cat >&2 <<EOF

  ℹ️ والمرحلةُ ١ (Versioning + Soft Delete + lifecycle) **طُبِّقت سلفاً أعلاه** —
     فحمايتُك الآن $NONCURRENT_KEEP_DAYS يوماً لا ٧، والمتبقّي الخزنةُ وحدَها.
EOF
  fi
  exit 1
}

vault_apply() {
  say "(٢) مشروعُ الخزنة — تفعيلُ الواجهات"
  require_vault_project
  # ⚠ و`cloudresourcemanager` ليست زائدة: `transfer authorize` يقرأ سياسةَ صلاحيات
  #   **المشروع** ليمنح وكيلَ النقل، وبدونها يسقط بـSERVICE_DISABLED — **ورسالتُه
  #   تبدأ بـ«does not have permission»** فتُرسل التشخيصَ إلى الصلاحيات لا إلى واجهةٍ
  #   معطَّلة. الواجهاتُ الثلاثُ معاً، فلا يُكتشَف النقصُ عند رابعِ خطوة.
  gcloud services enable storage.googleapis.com storagetransfer.googleapis.com \
    cloudresourcemanager.googleapis.com \
    --project="$VAULT_PROJECT"
  ok "storage + storagetransfer مُفعَّلتان في $VAULT_PROJECT"

  say "(٣) حاويةُ الخزنة — gs://$VAULT_BUCKET في $VAULT_LOCATION"
  if gcloud storage buckets describe "gs://$VAULT_BUCKET" --project="$VAULT_PROJECT" \
       --format="value(name)" >/dev/null 2>&1; then
    skip "الحاويةُ موجودةٌ سلفاً"
  else
    gcloud storage buckets create "gs://$VAULT_BUCKET" \
      --project="$VAULT_PROJECT" \
      --location="$VAULT_LOCATION" \
      --default-storage-class=STANDARD \
      --uniform-bucket-level-access \
      --public-access-prevention
    ok "أُنشئت (STANDARD — لا فئةَ باردة: التوفيرُ سنتٌ شهرياً والاحتكاكُ وقتَ الكارثة حقيقيّ)"
  fi

  # Versioning على الخزنة **شرطٌ لا تحسين**: مع سياسةِ الاحتجاز أدناه، حاويةٌ بلا
  # versioning تمنع استبدالَ أيّ ملفٍّ تغيّر — فتسقط النقلةُ اليوميةُ كلَّ يوم.
  local VVERS
  VVERS="$(gcloud storage buckets describe "gs://$VAULT_BUCKET" --project="$VAULT_PROJECT" \
           --format="value(versioning_enabled)" 2>/dev/null || echo "")"
  if [ "$VVERS" = "True" ]; then
    skip "Versioning على الخزنة مُفعَّلٌ سلفاً"
  else
    gcloud storage buckets update "gs://$VAULT_BUCKET" --project="$VAULT_PROJECT" --versioning
    ok "Versioning على الخزنة مُفعَّل (شرطُ عملِ الاحتجاز مع النقل)"
  fi

  # سياسةُ احتجازٍ **غيرُ مقفلة**: تمنع الحذفَ قبل المدّة (خطأً أو باعتمادٍ مخترَق)
  # وتبقى قابلةً للإزالة عند الحاجة. القفلُ بابٌ ذو اتجاهٍ واحد — لم نسلكه بقرار.
  gcloud storage buckets update "gs://$VAULT_BUCKET" --project="$VAULT_PROJECT" \
    --retention-period="$VAULT_RETENTION"
  ok "سياسةُ احتجاز $VAULT_RETENTION — غيرُ مقفلة (قابلةٌ للإزالة: --clear-retention-period)"

  # ولا قاعدةَ lifecycle على الخزنة إطلاقاً: تحتفظ بكلّ شيءٍ إلى الأبد.
  # ٧٠٨ ميغابايت ≈ سنتٌ ونصفٌ شهرياً — فالحذفُ هنا تعقيدٌ بلا مقابل.
  skip "لا lifecycle على الخزنة بقرار — تحتفظ بكلّ شيء (الحجمُ لا يستدعي حذفاً)"

  # ── حسابُ خدمة النقل وصلاحياتُه عبر المشروعين ────────────────────────────
  say "(٤) حسابُ خدمةِ النقل وصلاحياتُه"
  # الوظيفةُ تعيش في **مشروع الخزنة** لا في مشروع التطبيق — فنطاقُ الانفجار أصغر:
  # اختراقُ fast-buildings لا يملك تعديلَ جدولةِ النسخ ولا حذفَ الخزنة.
  # ولا نكتم مخرَجَ هذا الأمر: كتمُه هو ما حوّل سؤالَه التفاعليَّ إلى تعليقٍ صامت.
  # `|| true` تكفي لتجاوز فشلٍ غيرِ مؤثّر — أمّا الإخفاءُ فيُعمي عن سببِ التوقّف.
  gcloud transfer authorize --project="$VAULT_PROJECT" || true

  local STS_SA
  STS_SA="$(curl -s -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    "https://storagetransfer.googleapis.com/v1/googleServiceAccounts/${VAULT_PROJECT}" \
    | grep -o '"accountEmail": *"[^"]*"' | cut -d'"' -f4)"
  [ -n "$STS_SA" ] || die "تعذّر استخراجُ حساب خدمة النقل لمشروع $VAULT_PROJECT"
  ok "حسابُ الخدمة: $STS_SA"

  # على المصدر: قراءةٌ فقط — لا صلاحيةَ كتابةٍ ولا حذفٍ على بيانات الإنتاج.
  local ROLE
  for ROLE in roles/storage.objectViewer roles/storage.legacyBucketReader; do
    gcloud storage buckets add-iam-policy-binding "gs://$SRC_BUCKET" \
      --project="$SRC_PROJECT" --member="serviceAccount:$STS_SA" --role="$ROLE" >/dev/null
  done
  ok "على المصدر: قراءةٌ فقط (objectViewer + legacyBucketReader)"

  for ROLE in roles/storage.objectViewer roles/storage.legacyBucketWriter; do
    gcloud storage buckets add-iam-policy-binding "gs://$VAULT_BUCKET" \
      --project="$VAULT_PROJECT" --member="serviceAccount:$STS_SA" --role="$ROLE" >/dev/null
  done
  ok "على الخزنة: كتابةٌ (objectViewer + legacyBucketWriter)"

  # ── الوظيفةُ المجدولة ────────────────────────────────────────────────────
  say "(٥) وظيفةُ النقل اليومية"
  if gcloud transfer jobs describe "$JOB_NAME" --project="$VAULT_PROJECT" \
       --format="value(name)" >/dev/null 2>&1; then
    skip "الوظيفةُ موجودةٌ سلفاً: $JOB_NAME"
  else
    # **بلا حذفٍ في الوجهة**: التطبيقُ يحذف ملفّاتٍ في سياقه الطبيعيّ
    # (stocktake.js:914 · index.html:21693) — ومرآةٌ حقيقيةٌ كانت ستنشر ذاك الحذفَ
    # إلى الخزنة فتُبطل الغرضَ كلَّه. الخزنةُ تُراكم ولا تُطابق.
    gcloud transfer jobs create "gs://$SRC_BUCKET" "gs://$VAULT_BUCKET" \
      --project="$VAULT_PROJECT" \
      --name="$JOB_NAME" \
      --description="نسخةٌ يوميةٌ لمرفقات التطبيق — تراكميةٌ بلا حذف (NOTES §5)" \
      --schedule-repeats-every=1d \
      --schedule-starts="$(date -u -d 'tomorrow 02:00' +%Y-%m-%dT%H:%M:%SZ)" \
      --overwrite-when=different
    ok "أُنشئت — يومياً ٠٢:٠٠ UTC · تراكميةٌ بلا حذفٍ في الوجهة"
  fi

  say "(٦) نقلةٌ أولى الآن (لا ننتظر الجدولة)"
  gcloud transfer jobs run "$JOB_NAME" --project="$VAULT_PROJECT" --no-async || \
    gcloud transfer jobs run "$JOB_NAME" --project="$VAULT_PROJECT"
  ok "النقلةُ الأولى انتهت"
}

# ============================================================================
#  التنفيذ
# ============================================================================
say "(٠) تحقُّقٌ قبليّ"
command -v gcloud >/dev/null || die "لا gcloud في المسار. شغّل السكربت من Cloud Shell."
gcloud auth print-access-token >/dev/null 2>&1 || die "لا جلسةَ دخول. شغّل: gcloud auth login"
gcloud storage buckets describe "gs://$SRC_BUCKET" --project="$SRC_PROJECT" \
  --format="value(name)" >/dev/null 2>&1 \
  || die "تعذّر الوصولُ إلى gs://$SRC_BUCKET في المشروع $SRC_PROJECT"
ok "الحاويةُ المصدر موجودةٌ ومقروءة: gs://$SRC_BUCKET"
# ولا فحصَ لمشروع الخزنة هنا بقصد — انظر تعليقَ رأس الملفّ.

# ⚠ `[ cond ] && func` هنا **عطلٌ صامت**: مع set -e تُنهي القائمةُ الكاذبةُ السكربتَ
#   قبل السطر التالي — فكان --vault-only يخرج بلا أن يفعل شيئاً ويبدو ناجحاً.
if [ "$MODE" != "vault"  ]; then layer1_apply; else skip "المرحلة ١ متجاوَزة (--vault-only)"; fi
if [ "$MODE" != "layer1" ]; then vault_apply; fi

if [ "$MODE" = "layer1" ]; then
  cat <<EOF

════════════════════════════════════════════════════════════════════════════
  ✅ المرحلةُ ١ طُبِّقت — الحمايةُ انتقلت من **٧ أيامٍ إلى $NONCURRENT_KEEP_DAYS**.

  ما صار ممكناً الآن: التراجعُ عن حذفِ أيّ مرفقٍ أو استبدالِه خلال $NONCURRENT_KEEP_DAYS يوماً،
  **بميتاداتاه** — أي أنّ الروابطَ المخزَّنةَ في Firestore تعود للعمل فوراً.

  وما لم يُغطَّ بعد: ضياعُ الحاوية كلِّها · حذفُ المشروع · وقفُ الفوترة · عطلُ
  الإقليم. تلك تحتاج المرحلةَ ٢ (الخزنة في مشروعٍ منفصل).

  الخطوةُ التالية **الآن** — لا بعد شهر:
      bash scripts/storage-restore-drill.sh --layer1-only

  فجزؤها الأوّلُ يعمل بلا خزنةٍ أصلاً، ويجيب السؤالَ الحاسم: هل تعود الروابطُ
  للعمل بعد الاستعادة؟ وهو المجهولُ الوحيدُ الذي قد يُبطل التصميمَ كلَّه.
════════════════════════════════════════════════════════════════════════════
EOF
  exit 0
fi

cat <<EOF

════════════════════════════════════════════════════════════════════════════
  تمّ الإعداد. **ولم يُثبَت شيءٌ بعد.**

  نسخةٌ لم تُستعَد ليست نسخةً بل افتراضٌ أنّ الملفَّ سليم (NOTES §5).
  والفحصُ الحاسمُ هنا ليس وجودَ البايتات بل **نجاةَ الـtoken**: التطبيقُ يخزّن
  في Firestore ناتجَ getDownloadURL() لا المسار، والتوكِنُ يعيش في ميتاداتا
  الكائن — فاستعادةٌ تُعيد البايتاتِ دون الميتاداتا تقول «تمّت» وكلُّ رابطٍ
  في النظام يردّ 403.

  شغّل الآن:
      bash scripts/storage-restore-drill.sh      # البروفة — تُثبت أو تُسقط
      bash scripts/storage-backup-check.sh       # الصحّةُ الدورية

  ثمّ قيّد **النتائجَ المقيسةَ فعلاً** في NOTES.md §5 — لا المتوقَّعة.
════════════════════════════════════════════════════════════════════════════
EOF
