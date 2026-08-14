#!/usr/bin/env bash
# ============================================================================
#  فحصُ صحّةِ نسخِ Cloud Storage — حكمٌ فوريٌّ بلا قراءةِ لوحات
#
#  يجيب سؤالاً واحداً: «لو ضاع مرفقٌ اليومَ، هل أستعيده؟ وإلى أيّ عمق؟»
#  ويقيس **المدى الزمنيَّ الفعليّ** ويقارنه بأفق نسخ Firestore (٩٨ يوماً):
#  فأيُّ انحرافٍ يُعيد الفجوةَ التي سُدّت — بياناتٌ تُستعاد بلا صورِها.
#
#  التشغيل:
#      bash scripts/storage-backup-check.sh --layer1-only   # بعد المرحلة ١ وحدَها
#      bash scripts/storage-backup-check.sh                 # الفحصُ الكامل
#  يُرجع 0 إن كان كلُّ شيءٍ سليماً، و1 إن سقط فحص — فيصلح للجدولة.
# ============================================================================
set -uo pipefail

MODE="full"
case "${1:-}" in
  --layer1-only|--layer-1|-1) MODE="layer1" ;;
  ""|--full)                  MODE="full"   ;;
  -h|--help) sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "وسيطٌ غيرُ معروف: $1   (جرّب --help)" >&2; exit 2 ;;
esac

SRC_PROJECT="${SRC_PROJECT:-fast-buildings}"
SRC_BUCKET="${SRC_BUCKET:-fast-buildings.firebasestorage.app}"
VAULT_PROJECT="${VAULT_PROJECT:-fast-buildings-vault}"
VAULT_BUCKET="${VAULT_BUCKET:-fast-buildings-storage-vault}"
JOB_NAME="transferJobs/fast-buildings-storage-vault-daily"
FIRESTORE_RETENTION_DAYS=98

PASS=0; FAIL=0
T() { if [ "$2" = "0" ]; then PASS=$((PASS+1)); printf '  \033[0;32m✅ %s\033[0m\n' "$1"
      else FAIL=$((FAIL+1)); printf '  \033[0;31m❌ %s\033[0m\n' "$1"; fi }
say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

command -v gcloud >/dev/null || { echo "لا gcloud — شغّل من Cloud Shell"; exit 1; }

# ── الحاويةُ المصدر ─────────────────────────────────────────────────────────
say "الحاويةُ المصدر — gs://$SRC_BUCKET"

VERS="$(gcloud storage buckets describe "gs://$SRC_BUCKET" --project="$SRC_PROJECT" \
        --format="value(versioning_enabled)" 2>/dev/null)"
T "Versioning مُفعَّل" "$([ "$VERS" = "True" ] && echo 0 || echo 1)"

SD="$(gcloud storage buckets describe "gs://$SRC_BUCKET" --project="$SRC_PROJECT" \
      --format="value(soft_delete_policy.retentionDurationSeconds)" 2>/dev/null)"
SD_DAYS=$(( ${SD:-0} / 86400 ))
T "Soft Delete = ${SD_DAYS} يوماً (كان ٧ — والسقفُ الذي يسمح به GCS ٩٠)" \
  "$([ "$SD_DAYS" -ge 30 ] && echo 0 || echo 1)"

# المدى الحقيقيُّ للتعافي داخلَ الحاوية = عمرُ النسخِ غيرِ الحالية في lifecycle.
# (الحذفُ الليّن سقفُه ٩٠ < ٩٨، فهو وحدَه لا يسدّ الفجوةَ أبداً.)
LC="$(gcloud storage buckets describe "gs://$SRC_BUCKET" --project="$SRC_PROJECT" \
      --format="value(lifecycle_config)" 2>/dev/null)"
NC_DAYS="$(printf '%s' "$LC" | grep -o "daysSinceNoncurrentTime[^0-9]*[0-9]*" \
           | grep -o '[0-9]*$' | head -1)"
NC_DAYS="${NC_DAYS:-0}"
T "النسخُ غيرُ الحالية تُحفظ ${NC_DAYS} يوماً ≥ أفق Firestore (${FIRESTORE_RETENTION_DAYS})" \
  "$([ "$NC_DAYS" -ge "$FIRESTORE_RETENTION_DAYS" ] && echo 0 || echo 1)"

# lifecycle يحذف كائناتٍ **حيّة**؟ ذاك عطلٌ لا إعداد.
T "لا قاعدةَ lifecycle تحذف نسخةً حيّة" \
  "$(printf '%s' "$LC" | grep -q "isLive.*[Tt]rue" && echo 1 || echo 0)"

# ── حاويةُ الخزنة ───────────────────────────────────────────────────────────
if [ "$MODE" = "layer1" ]; then
  say "حاويةُ الخزنة — **متجاوَزة** (--layer1-only)"
  printf '  \033[0;33m↷ المرحلة ٢ لم تُنفَّذ بعد: لا حمايةَ من ضياع الحاوية كلِّها\n'
  printf '     ولا من حذف المشروع ولا من عطل الإقليم.\033[0m\n'
  printf '\n════════════════════════════════════\n'
  printf '  ناجحة: %s   ساقطة: %s   (المرحلة ١ وحدَها)\n' "$PASS" "$FAIL"
  [ "$FAIL" -eq 0 ] && exit 0 || exit 1
fi

say "حاويةُ الخزنة — gs://$VAULT_BUCKET (مشروع $VAULT_PROJECT)"

if gcloud storage buckets describe "gs://$VAULT_BUCKET" --project="$VAULT_PROJECT" \
     --format="value(name)" >/dev/null 2>&1; then
  T "الحاويةُ موجودة" 0

  VLOC="$(gcloud storage buckets describe "gs://$VAULT_BUCKET" --project="$VAULT_PROJECT" \
          --format="value(location)" 2>/dev/null)"
  SLOC="$(gcloud storage buckets describe "gs://$SRC_BUCKET" --project="$SRC_PROJECT" \
          --format="value(location)" 2>/dev/null)"
  T "الخزنةُ في موقعٍ مختلفٍ عن المصدر ($SLOC ← $VLOC)" \
    "$([ -n "$VLOC" ] && [ "$VLOC" != "$SLOC" ] && echo 0 || echo 1)"

  VV="$(gcloud storage buckets describe "gs://$VAULT_BUCKET" --project="$VAULT_PROJECT" \
        --format="value(versioning_enabled)" 2>/dev/null)"
  T "Versioning على الخزنة (شرطُ عملِ الاحتجاز مع النقل — بدونه تسقط كلُّ نقلةٍ فيها ملفٌّ تغيّر)" \
    "$([ "$VV" = "True" ] && echo 0 || echo 1)"

  RP="$(gcloud storage buckets describe "gs://$VAULT_BUCKET" --project="$VAULT_PROJECT" \
        --format="value(retention_policy.retentionPeriod)" 2>/dev/null)"
  RP_DAYS=$(( ${RP:-0} / 86400 ))
  T "سياسةُ احتجاز ${RP_DAYS} يوماً ≥ ${FIRESTORE_RETENTION_DAYS}" \
    "$([ "$RP_DAYS" -ge "$FIRESTORE_RETENTION_DAYS" ] && echo 0 || echo 1)"

  # حجمُ الخزنة يجب ألّا يقلَّ عن المصدر — فهي تُراكم ولا تحذف.
  SN="$(gcloud storage ls -r "gs://$SRC_BUCKET/**"   --project="$SRC_PROJECT"   2>/dev/null | grep -c '^gs://')"
  VN="$(gcloud storage ls -r "gs://$VAULT_BUCKET/**" --project="$VAULT_PROJECT" 2>/dev/null | grep -c '^gs://')"
  T "عددُ كائنات الخزنة (${VN}) ≥ المصدر (${SN})" \
    "$([ "${VN:-0}" -ge "${SN:-0}" ] && echo 0 || echo 1)"
else
  T "الحاويةُ موجودة" 1
fi

# ── الوظيفةُ المجدولة ونقلتُها الأخيرة ─────────────────────────────────────
say "وظيفةُ النقل — $JOB_NAME"

JSTATE="$(gcloud transfer jobs describe "$JOB_NAME" --project="$VAULT_PROJECT" \
          --format="value(status)" 2>/dev/null)"
T "الوظيفةُ مفعَّلة (الحالة: ${JSTATE:-غير موجودة})" \
  "$([ "$JSTATE" = "ENABLED" ] && echo 0 || echo 1)"

# ⚠ مصيدةُ §5 نفسُها: القوائمُ لا تُرتَّب بالتاريخ. **افرزها دائماً** — وإلّا
# حكمتَ بأنّ الجدولةَ متوقّفةٌ وهي تعمل، أو العكس.
LAST="$(gcloud transfer operations list --job-names="$JOB_NAME" --project="$VAULT_PROJECT" \
        --format="value(metadata.endTime)" 2>/dev/null | sort -r | head -1)"
if [ -n "$LAST" ]; then
  AGE_H=$(( ( $(date -u +%s) - $(date -u -d "$LAST" +%s) ) / 3600 ))
  T "آخرُ نقلةٍ منذ ${AGE_H} ساعة (يجب < ٤٨)" \
    "$([ "$AGE_H" -lt 48 ] && echo 0 || echo 1)"
else
  T "توجد نقلةٌ منتهيةٌ واحدةٌ على الأقلّ" 1
fi

printf '\n════════════════════════════════════\n'
printf '  ناجحة: %s   ساقطة: %s\n' "$PASS" "$FAIL"
if [ "$FAIL" -eq 0 ]; then
  printf '  \033[0;32mالإعدادُ سليم. وهذا لا يُغني عن البروفة:\033[0m\n'
  printf '  bash scripts/storage-restore-drill.sh — إعدادٌ سليمٌ ليس استعادةً مُثبَتة.\n\n'
  exit 0
fi
printf '  \033[0;31mسقط فحص — راجع أعلاه قبل أن تطمئنّ.\033[0m\n\n'
exit 1
