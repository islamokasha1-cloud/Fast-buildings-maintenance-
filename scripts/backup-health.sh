#!/usr/bin/env bash
# ============================================================================
#  فحصُ صحّةِ النسخ الشامل — أمرٌ واحدٌ شهريّ
#
#  يجمع فحصَي الملفّات والبيانات، **ويضيف ما لا يفعله أيٌّ منهما: عمرَ آخرِ بروفة.**
#
#  ولماذا هذا الأخيرُ جوهريّ: الإعدادُ السليمُ ليس استعادةً مُثبَتة، و**النسخُ يتعفّن
#  بصمت** — تتغيّر صلاحيةٌ أو ينكسر مسارٌ فيبقى كلُّ شيءٍ أخضرَ حتى تحتاجَه فعلاً.
#  والبروفاتُ لا تترك أثراً في ذاتها، فـ«أعِدها كلَّ ٣ أشهر» يبقى رهينَ الذاكرة.
#  فصارت كلُّ بروفةٍ ناجحةٍ **تختم تاريخَها** في الخزنة، وهذا الفحصُ يقرؤه — فتحوّل
#  التذكيرُ إلى **رقابة**.
#
#  التشغيل:  bash scripts/backup-health.sh
#  يُرجع 0 إن كان كلُّ شيءٍ سليماً و1 إن سقط شيء — فيصلح للجدولة.
# ============================================================================
set -uo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

HERE="$(cd "$(dirname "$0")" && pwd)"
VAULT_PROJECT="${VAULT_PROJECT:-fast-buildings-vault}"
VAULT_BUCKET="${VAULT_BUCKET:-fast-buildings-storage-vault}"
EXPORT_BUCKET="${EXPORT_BUCKET:-fast-buildings-firestore-vault}"

DRILL_WARN_DAYS="${DRILL_WARN_DAYS:-90}"    # الإيقاعُ المتَّفق عليه: كلَّ ٣ أشهر
DRILL_FAIL_DAYS="${DRILL_FAIL_DAYS:-120}"   # وبعد أربعةٍ: لم يعد تأخّراً بل انقطاعاً

RC=0
hdr() { printf '\n\033[1;35m══════ %s ══════\033[0m\n' "$*"; }

command -v gcloud >/dev/null || { echo "لا gcloud — شغّل من Cloud Shell"; exit 1; }

hdr "١) الملفّات — نسخُ Cloud Storage"
bash "$HERE/storage-backup-check.sh" || RC=1

hdr "٢) البيانات — تصديرُ Firestore"
bash "$HERE/firestore-export-check.sh" || RC=1

# ── عمرُ آخر بروفة ─────────────────────────────────────────────────────────
hdr "٣) متى أُثبتت النسخُ آخرَ مرّة؟"

drill_age() { # drill_age "الاسم" "الحاوية" "البادئة"
  local LABEL="$1" BUCKET="$2" PREFIX="$3" LAST STAMP AGE
  # ⚠ افرز صراحةً — القوائمُ لا تُرتَّب بالتاريخ (مصيدةُ §5 نفسُها).
  LAST="$(gcloud storage ls "gs://$BUCKET/_drills/${PREFIX}-*" --project="$VAULT_PROJECT" \
          2>/dev/null | sort -r | head -1)"
  if [ -z "$LAST" ]; then
    printf '  \033[0;33m⚠ %-28s لا سجلَّ بعد — شغّل البروفةَ مرّةً لتأسيس التاريخ\033[0m\n' "$LABEL"
    return 0
  fi
  STAMP="$(printf '%s' "$LAST" | sed 's/.*-\([0-9]\{8\}T[0-9]\{6\}\)Z\.txt$/\1/')"
  AGE=$(( ( $(date -u +%s) - $(date -u -d "${STAMP:0:8} ${STAMP:9:2}:${STAMP:11:2}:${STAMP:13:2}" +%s 2>/dev/null || echo 0) ) / 86400 ))
  if [ "$AGE" -ge "$DRILL_FAIL_DAYS" ]; then
    printf '  \033[0;31m❌ %-28s منذ %s يوماً — انقطاعٌ لا تأخّر\033[0m\n' "$LABEL" "$AGE"; RC=1
  elif [ "$AGE" -ge "$DRILL_WARN_DAYS" ]; then
    printf '  \033[0;33m⚠ %-28s منذ %s يوماً — حان موعدُ الإعادة\033[0m\n' "$LABEL" "$AGE"
  else
    printf '  \033[0;32m✅ %-28s منذ %s يوماً\033[0m\n' "$LABEL" "$AGE"
  fi
}

drill_age "استعادةُ الملفّات" "$VAULT_BUCKET"  "storage-restore"
drill_age "استيرادُ البيانات (عبور)" "$EXPORT_BUCKET" "firestore-import"

printf '\n════════════════════════════════════════════════\n'
if [ "$RC" -eq 0 ]; then
  printf '  \033[0;32m✅ المنظومةُ سليمة.\033[0m\n\n'
else
  printf '  \033[0;31m❌ يوجد ما يستدعي النظر — راجع أعلاه.\033[0m\n\n'
fi
printf '  الإيقاع: هذا الفحصُ **شهرياً**، والبروفتان **كلَّ ٣ أشهر**:\n'
printf '      bash scripts/storage-restore-drill.sh\n'
printf '      bash scripts/firestore-export-drill.sh --cross-project\n'
printf '  ويُفضَّل في اليوم نفسِه الذي تُعاد فيه بروفةُ استعادة Firestore (§5).\n\n'
exit "$RC"
