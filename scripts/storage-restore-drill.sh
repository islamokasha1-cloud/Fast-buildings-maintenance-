#!/usr/bin/env bash
# ============================================================================
#  بروفةُ استعادةٍ فعليةٌ لمرفقات Cloud Storage
#
#  المبدأ (NOTES §5): نسخةٌ لم تُستعَد ليست نسخةً بل افتراضٌ أنّ الملفَّ سليم.
#
#  والمعيارُ هنا ليس «هل عادت البايتات؟» بل **«هل عاد الرابطُ يعمل؟»**:
#  التطبيقُ يخزّن في Firestore ناتجَ getDownloadURL() لا المسارَ — أي رابطاً
#  يحمل token يعيش في ميتاداتا الكائن (firebaseStorageDownloadTokens).
#  فاستعادةٌ تُعيد البايتاتِ وتُسقط الميتاداتا تُنتج أسوأَ حالةٍ ممكنة:
#  الملفُّ موجود · الاستعادةُ تقول «تمّت» · وكلُّ رابطٍ في النظام يردّ 403.
#
#  البروفةُ تعمل على كائنِ اختبارٍ وحدَه تحت restore-drill/ — لا تلمس بياناتِ
#  الإنتاج بحال، وتحذف أثرَها في النهاية.
#
#  التشغيل:  bash scripts/storage-restore-drill.sh
# ============================================================================
set -uo pipefail

SRC_PROJECT="${SRC_PROJECT:-fast-buildings}"
SRC_BUCKET="${SRC_BUCKET:-fast-buildings.firebasestorage.app}"
VAULT_PROJECT="${VAULT_PROJECT:-fast-buildings-vault}"
VAULT_BUCKET="${VAULT_BUCKET:-fast-buildings-storage-vault}"

PASS=0; FAIL=0
T() { # T "الوصف" "شرط"  — شرطٌ صفريُّ الخروج = نجاح
  if [ "$2" = "0" ]; then PASS=$((PASS+1)); printf '  \033[0;32m✅ %s\033[0m\n' "$1"
  else FAIL=$((FAIL+1)); printf '  \033[0;31m❌ %s\033[0m\n' "$1"; fi
}
say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

command -v gcloud >/dev/null || { echo "لا gcloud — شغّل من Cloud Shell"; exit 1; }

# ── تحضيرُ كائنِ الاختبار ───────────────────────────────────────────────────
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OBJ="restore-drill/${STAMP}.txt"
OBJ_ENC="restore-drill%2F${STAMP}.txt"
TOKEN="$( (command -v uuidgen >/dev/null && uuidgen) \
          || cat /proc/sys/kernel/random/uuid )"
TOKEN="$(printf '%s' "$TOKEN" | tr 'A-Z' 'a-z')"
WORK="$(mktemp -d)"
BODY="fast-buildings restore drill ${STAMP}"
printf '%s\n' "$BODY" > "$WORK/payload.txt"

# الرابطُ الذي «يخزّنه التطبيقُ في Firestore» — نبنيه بيدنا بالصيغة نفسِها
URL="https://firebasestorage.googleapis.com/v0/b/${SRC_BUCKET}/o/${OBJ_ENC}?alt=media&token=${TOKEN}"

cleanup() {
  gcloud storage rm --all-versions "gs://$SRC_BUCKET/$OBJ"   --project="$SRC_PROJECT"   >/dev/null 2>&1
  gcloud storage rm --all-versions "gs://$VAULT_BUCKET/$OBJ" --project="$VAULT_PROJECT" >/dev/null 2>&1
  rm -rf "$WORK"
}
trap cleanup EXIT

url_code() { curl -s -o /dev/null -w '%{http_code}' "$URL"; }

say "(٠) بذرُ كائنِ اختبارٍ يحمل توكِنَ تنزيلٍ كما يفعل التطبيق"
gcloud storage cp "$WORK/payload.txt" "gs://$SRC_BUCKET/$OBJ" \
  --project="$SRC_PROJECT" \
  --custom-metadata="firebaseStorageDownloadTokens=${TOKEN}" \
  --content-type="text/plain" >/dev/null 2>&1
C="$(url_code)"; T "الرابطُ المبنيُّ يعمل قبل أيّ عطل (200 — وإلّا فالبروفةُ نفسُها باطلة، رُدّ: $C)" \
  "$([ "$C" = "200" ] && echo 0 || echo 1)"
if [ "$C" != "200" ]; then
  echo "  ⚠ توقّفنا: كائنُ الاختبار لا يُقرأ أصلاً، فأيُّ نتيجةٍ بعده بلا معنى."
  exit 1
fi

# ── (١) الطبقةُ الداخلية: الاستعادةُ من نسخةٍ غيرِ حالية بعد **استبدال** ────
say "(١) استبدالٌ ثمّ استعادةٌ من نسخةٍ غيرِ حالية (Versioning)"
printf 'CORRUPTED\n' > "$WORK/bad.txt"
gcloud storage cp "$WORK/bad.txt" "gs://$SRC_BUCKET/$OBJ" --project="$SRC_PROJECT" >/dev/null 2>&1
# النسخةُ الحيّةُ الآن تالفةٌ وبلا توكِن — فالرابطُ يجب أن ينكسر
C="$(url_code)"; T "بعد الاستبدال ينكسر الرابط (تأكيدُ أنّ الفحصَ يقيس شيئاً — رُدّ: $C)" \
  "$([ "$C" != "200" ] && echo 0 || echo 1)"

GEN="$(gcloud storage ls -a "gs://$SRC_BUCKET/$OBJ" --project="$SRC_PROJECT" 2>/dev/null \
       | grep '#' | head -1 | sed 's/.*#//')"
gcloud storage cp "gs://$SRC_BUCKET/$OBJ#$GEN" "gs://$SRC_BUCKET/$OBJ" \
  --project="$SRC_PROJECT" >/dev/null 2>&1
C="$(url_code)"
T "الاستعادةُ من النسخة غيرِ الحالية تُعيد الرابطَ للعمل (200 — أي التوكِنُ نجا؛ رُدّ: $C)" \
  "$([ "$C" = "200" ] && echo 0 || echo 1)"
T "والمحتوى هو الأصلُ لا التالف" \
  "$(curl -s "$URL" | grep -q "$STAMP" && echo 0 || echo 1)"

# ── (٢) الطبقةُ الخارجية: الاستعادةُ من الخزنة بعد **حذفٍ كامل** ────────────
say "(٢) نقلٌ إلى الخزنة ثمّ حذفٌ كاملٌ ثمّ استعادةٌ منها"
gcloud storage cp "gs://$SRC_BUCKET/$OBJ" "gs://$VAULT_BUCKET/$OBJ" \
  --project="$VAULT_PROJECT" >/dev/null 2>&1
RC=$?
T "الكائنُ نُسخ إلى الخزنة gs://$VAULT_BUCKET" "$RC"

# الفحصُ الجوهريّ: هل حملت النسخةُ ميتاداتا التوكِن معها؟
VTOK="$(gcloud storage objects describe "gs://$VAULT_BUCKET/$OBJ" --project="$VAULT_PROJECT" \
        --format="value(metadata.firebaseStorageDownloadTokens)" 2>/dev/null)"
T "★ نسخةُ الخزنة تحمل firebaseStorageDownloadTokens (وإلّا فكلُّ استعادةٍ منها روابطُ ميتة)" \
  "$([ "$VTOK" = "$TOKEN" ] && echo 0 || echo 1)"

gcloud storage rm --all-versions "gs://$SRC_BUCKET/$OBJ" --project="$SRC_PROJECT" >/dev/null 2>&1
C="$(url_code)"; T "بعد الحذف الكامل ينكسر الرابط (رُدّ: $C)" \
  "$([ "$C" != "200" ] && echo 0 || echo 1)"

# الاستعادةُ **إلى المسار نفسِه في الحاوية نفسِها** — لا إلى مكانٍ آخر:
# أيُّ مسارٍ مختلفٍ يعني إعادةَ كتابةِ روابطَ في آلاف مستندات Firestore.
gcloud storage cp "gs://$VAULT_BUCKET/$OBJ" "gs://$SRC_BUCKET/$OBJ" \
  --project="$SRC_PROJECT" >/dev/null 2>&1
C="$(url_code)"
T "★★ الاستعادةُ من الخزنة تُعيد **الرابطَ الأصليَّ نفسَه** للعمل (200؛ رُدّ: $C)" \
  "$([ "$C" = "200" ] && echo 0 || echo 1)"
T "والمحتوى سليم" "$(curl -s "$URL" | grep -q "$STAMP" && echo 0 || echo 1)"

# ── (٣) الطبقةُ الثالثة: الحذفُ الليّن ─────────────────────────────────────
say "(٣) الحذفُ الليّن — هل يُرى المحذوفُ ويُستعاد؟"
gcloud storage rm --all-versions "gs://$SRC_BUCKET/$OBJ" --project="$SRC_PROJECT" >/dev/null 2>&1
SOFT="$(gcloud storage ls --soft-deleted "gs://$SRC_BUCKET/restore-drill/" \
        --project="$SRC_PROJECT" 2>/dev/null | grep -c "$STAMP")"
T "الكائنُ المحذوفُ يظهر في قائمة المحذوف الليّن" \
  "$([ "${SOFT:-0}" -ge 1 ] && echo 0 || echo 1)"

printf '\n════════════════════════════════════\n'
printf '  ناجحة: %s   ساقطة: %s\n' "$PASS" "$FAIL"
if [ "$FAIL" -eq 0 ]; then
  printf '  \033[0;32mالنسخُ مُثبَتٌ باستعادةٍ فعلية — قيّد النتيجةَ في NOTES §5.\033[0m\n\n'
  exit 0
else
  printf '  \033[0;31mسقط فحص — لا تقل «النسخُ يعمل» قبل أن يعود أخضرَ كلَّه.\033[0m\n'
  printf '  إن كان الساقطُ فحصَ التوكِن ★: تصميمُ الطبقة ٢ يحتاج نسخاً حافظاً\n'
  printf '  للميتاداتا، وإلّا فالاستعادةُ تحتاج إعادةَ إصدارِ توكِناتٍ وتحديثَ\n'
  printf '  مستندات Firestore — عملٌ أكبرُ بكثيرٍ يجب أن يُخطَّط قبل الحاجة.\n\n'
  exit 1
fi
