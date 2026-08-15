#!/usr/bin/env bash
# ============================================================================
#  بروفةُ استيرادٍ فعليةٌ لتصديرات Firestore
#
#  المبدأ (NOTES §5): **تصديرٌ لم يُستورَد ليس نسخةً بل افتراضٌ أنّ الملفّات سليمة.**
#
#  والبروفةُ آمنةٌ تماماً: تستورد إلى **قاعدةٍ جديدةٍ منفصلة** ولا تلمس `(default)`
#  بأيّ حال — كما في إجراء استعادة النسخ المُدارة الموثَّق في §5.
#
#  وضعان:
#    bash scripts/firestore-export-drill.sh                  # داخلَ المشروع — سريع
#    bash scripts/firestore-export-drill.sh --cross-project  # **جوهرُ البند**
#
#  ⚠ **ولماذا وضعُ العبور مهمّ:** البندُ كلُّه نشأ لحماية البيانات من **فقد المشروع**.
#    واستيرادٌ ناجحٌ داخلَ المشروع **لا يُثبت** أنّ الملفّات تُستورَد في مشروعٍ آخر —
#    مسلكان مختلفان. وهذا خطأٌ وقعنا فيه حرفياً مع الملفّات: نجاةُ التوكِن داخلَ
#    الحاوية لم تكن تُثبت نجاتَه عبر الحاويتين. **شغّل وضعَ العبور مرّةً على الأقلّ.**
# ============================================================================
set -uo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

MODE="local"
case "${1:-}" in
  --cross-project|-x) MODE="cross" ;;
  ""|--local)         MODE="local" ;;
  -h|--help) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "وسيطٌ غيرُ معروف: $1   (جرّب --help)" >&2; exit 2 ;;
esac

SRC_PROJECT="${SRC_PROJECT:-fast-buildings}"
VAULT_PROJECT="${VAULT_PROJECT:-fast-buildings-vault}"
EXPORT_BUCKET="${EXPORT_BUCKET:-fast-buildings-firestore-vault}"
DB_LOCATION="${DB_LOCATION:-nam5}"
DRILL_DB="export-drill"
COLLECTIONS="global_purchases global_contracts global_vendors global_inventory audit_log"

if [ "$MODE" = "cross" ]; then TARGET_PROJECT="$VAULT_PROJECT"; else TARGET_PROJECT="$SRC_PROJECT"; fi

PASS=0; FAIL=0
T() { if [ "$2" = "0" ]; then PASS=$((PASS+1)); printf '  \033[0;32m✅ %s\033[0m\n' "$1"
      else FAIL=$((FAIL+1)); printf '  \033[0;31m❌ %s\033[0m\n' "$1"; fi }
say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

command -v gcloud >/dev/null || { echo "لا gcloud — شغّل من Cloud Shell"; exit 1; }

cleanup() {
  printf '\n  ↻ تنظيف: حذفُ قاعدة البروفة %s من %s\n' "$DRILL_DB" "$TARGET_PROJECT"
  gcloud firestore databases delete --database="$DRILL_DB" --project="$TARGET_PROJECT" \
    >/dev/null 2>&1 || true
}
trap cleanup EXIT

say "(٠) أحدثُ تصديرٍ في gs://$EXPORT_BUCKET"
# ⚠ مصيدةُ §5 نفسُها: القوائمُ **لا تُرتَّب بالتاريخ**. افرزها دائماً — وإلّا استوردتَ
#   أقدمَ تصديرٍ عندك وأنت تظنّه أحدثَه، فتحكم على النسخ بنتيجةٍ لا تخصّها.
# ⚠⚠ **ورشِّح شكلَ المجلّد قبل الفرز.** ختمُ البروفات أنشأ `_drills/` في الحاوية،
#    و`_` يسبق الأرقام تنازلياً — فكانت البروفةُ ستستورد من **مجلّد الختم** لا من
#    تصدير. ميزةُ الرقابة كسرت كاشفَ التصدير في الفحص والبروفة معاً.
LATEST="$(gcloud storage ls "gs://$EXPORT_BUCKET/" --project="$VAULT_PROJECT" 2>/dev/null \
          | grep -E '/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]+_[0-9]+/$' | sort -r | head -1)"
T "يوجد تصديرٌ واحدٌ على الأقلّ" "$([ -n "$LATEST" ] && echo 0 || echo 1)"
if [ -z "$LATEST" ]; then
  echo "  ⚠ لا تصديرَ بعد. شغّل: bash scripts/firestore-export-setup.sh"
  exit 1
fi
printf '  المصدر: %s\n' "$LATEST"

say "(١) قاعدةُ بروفةٍ جديدةٍ في $TARGET_PROJECT (لا تُمسّ (default) بحال)"
if [ "$MODE" = "cross" ]; then
  gcloud services enable firestore.googleapis.com --project="$TARGET_PROJECT" >/dev/null 2>&1
fi
gcloud firestore databases delete --database="$DRILL_DB" --project="$TARGET_PROJECT" >/dev/null 2>&1 || true
gcloud firestore databases create --database="$DRILL_DB" --project="$TARGET_PROJECT" \
  --location="$DB_LOCATION" --type=firestore-native >/dev/null 2>&1
RC=$?
T "أُنشئت قاعدةُ البروفة $DRILL_DB" "$RC"
[ "$RC" = "0" ] || { echo "  ⚠ تعذّر الإنشاء — راجع الصلاحياتِ في $TARGET_PROJECT"; exit 1; }

say "(٢) صلاحيةُ القراءة لوكيل خدمة Firestore في مشروع الهدف"
# ★★ العطلُ نفسُه الذي أوقف التصدير، مقلوباً: **الاستيرادَ ينفّذه وكيلُ خدمة
#    Firestore الخاصُّ بمشروع الهدف** لا أنت ولا حسابُ خدمةٍ أنشأتَه. وبلا هذه
#    المنحة يردّ PERMISSION_DENIED برسالةٍ تقول «حساب خدمة» فتظنّها حسابَك.
TGT_NUM="$(gcloud projects describe "$TARGET_PROJECT" --format="value(projectNumber)" 2>/dev/null)"
TGT_AGENT="service-${TGT_NUM}@gcp-sa-firestore.iam.gserviceaccount.com"
gcloud storage buckets add-iam-policy-binding "gs://$EXPORT_BUCKET" \
  --project="$VAULT_PROJECT" \
  --member="serviceAccount:$TGT_AGENT" --role="roles/storage.admin" >/dev/null 2>&1
T "مُنح وكيلُ خدمة الهدف قراءةَ الحاوية ($TGT_AGENT)" "$([ -n "$TGT_NUM" ] && echo 0 || echo 1)"

say "(٣) الاستيرادُ الفعليّ"
gcloud firestore import "$LATEST" --database="$DRILL_DB" --project="$TARGET_PROJECT"
RC=$?
T "★ الاستيرادُ انتهى بلا خطأ" "$RC"

say "(٤) والحكمُ ليس رسالة «تمّت» بل وجودُ البيانات فعلاً"
# نفسُ منهج §5 حرفياً: نسأل القاعدةَ المستوردةَ عن مجموعاتها بدل تصديق سجلّ التمرير.
TOKEN="$(gcloud auth print-access-token)"
BASE="https://firestore.googleapis.com/v1/projects/$TARGET_PROJECT/databases/$DRILL_DB/documents"
EMPTY=0
for C in $COLLECTIONS; do
  N="$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/$C?pageSize=5" | grep -c '"name"')"
  if [ "${N:-0}" -gt 0 ]; then printf '    %-20s ✅\n' "$C"
  else printf '    %-20s ❌ فارغة\n' "$C"; EMPTY=$((EMPTY+1)); fi
done
T "★★ المجموعاتُ الخمسُ كلُّها فيها بيانات (فارغة: $EMPTY)" \
  "$([ "$EMPTY" -eq 0 ] && echo 0 || echo 1)"

printf '\n════════════════════════════════════\n'
printf '  ناجحة: %s   ساقطة: %s   (الوضع: %s)\n' "$PASS" "$FAIL" \
  "$([ "$MODE" = "cross" ] && echo "عبورٌ بين المشاريع" || echo "داخلَ المشروع")"
if [ "$FAIL" -eq 0 ]; then
  if [ "$MODE" = "cross" ]; then
    # ★ يُختَم **وضعُ العبور وحدَه**: البروفةُ المحلّيةُ لا تُثبت جوهرَ البند، فختمُها
    #   كان سيجعل السجلَّ يقول «مُثبَتٌ» عن شيءٍ لم يُثبَت — وهو أسوأُ من غياب السجلّ.
    gcloud storage cp - "gs://$EXPORT_BUCKET/_drills/firestore-import-$(date -u +%Y%m%dT%H%M%SZ).txt" \
      --project="$VAULT_PROJECT" >/dev/null 2>&1 <<EOF || true
بروفةُ استيراد Firestore عبرَ المشاريع — ناجحة $PASS · ساقطة $FAIL
الهدف: $TARGET_PROJECT · $(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
    printf '  \033[0;32mالتصديرُ مُثبَتٌ باستيرادٍ في مشروعٍ آخر — وهو جوهرُ البند.\033[0m\n'
    printf '  ✍ خُتم تاريخُ البروفة في gs://%s/_drills/\n' "$EXPORT_BUCKET"
    printf '  قيّد النتيجةَ في NOTES §5.\n\n'
  else
    printf '  \033[0;33mالملفّاتُ سليمةٌ وتُستورَد. لكنّ هذا **داخلَ المشروع** —\033[0m\n'
    printf '  ولم يُثبت بعدُ أنّها تعبر إلى مشروعٍ آخر، وهو سببُ البند أصلاً.\n'
    printf '  شغّل:  bash scripts/firestore-export-drill.sh --cross-project\n\n'
  fi
  exit 0
fi
printf '  \033[0;31mسقط فحص — لا تقل «النسخُ يعمل» قبل أن يعود أخضرَ كلَّه.\033[0m\n\n'
exit 1
