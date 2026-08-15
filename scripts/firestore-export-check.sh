#!/usr/bin/env bash
# ============================================================================
#  فحصُ صحّةِ تصدير Firestore إلى الخزنة
#
#  يجيب: «لو ضاع المشروعُ اليومَ، هل عندي نسخةٌ خارجَه؟ وكم عمرُها؟»
#
#  التشغيل:  bash scripts/firestore-export-check.sh
#  يُرجع 0 إن كان كلُّ شيءٍ سليماً و1 إن سقط فحص — فيصلح للجدولة.
# ============================================================================
set -uo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

SRC_PROJECT="${SRC_PROJECT:-fast-buildings}"
VAULT_PROJECT="${VAULT_PROJECT:-fast-buildings-vault}"
EXPORT_BUCKET="${EXPORT_BUCKET:-fast-buildings-firestore-vault}"
JOB_NAME="firestore-daily-export"
JOB_LOCATION="${JOB_LOCATION:-us-central1}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-48}"

PASS=0; FAIL=0
T() { if [ "$2" = "0" ]; then PASS=$((PASS+1)); printf '  \033[0;32m✅ %s\033[0m\n' "$1"
      else FAIL=$((FAIL+1)); printf '  \033[0;31m❌ %s\033[0m\n' "$1"; fi }
say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

command -v gcloud >/dev/null || { echo "لا gcloud — شغّل من Cloud Shell"; exit 1; }

say "حاويةُ التصدير — gs://$EXPORT_BUCKET"

# ★ الفحصُ الجوهريّ: الحاويةُ **خارجَ** المشروع المصدر. لو صارت داخله يوماً، عاد
#   العطلُ الذي أنشأنا البندَ لأجله — نسخةٌ تموت مع مشروعها — **بلا أن يتغيّر شيءٌ
#   ظاهر**: التصديرُ يعمل، والفحصُ أخضر، والحمايةُ صفر.
#
# ⚠ والصياغةُ الأولى سألت `buckets describe` عن حقل `project_number` — **حقلٌ لا
#   تعرضه الأداة**، فرجع فارغاً و**أعلن سقوطاً كاذباً** على إعدادٍ سليم. نفسُ صنفِ
#   العطل الذي أوقعنا في `metadata` مقابل `custom_fields`: **فحصٌ يقرأ اسمَ حقلٍ
#   يحكم على الواقع بما لا يعرفه.** فصار السؤالُ عن **انتماءٍ** لا عن حقل: هل يظهر
#   اسمُ الحاوية في قائمة حاويات المشروع المصدر؟ — سؤالٌ لا يعتمد على تسميةٍ داخلية.
SRC_BUCKETS="$(gcloud storage buckets list --project="$SRC_PROJECT" \
               --format="value(name)" 2>/dev/null)"
if [ -z "$SRC_BUCKETS" ]; then
  # قائمةٌ فارغةٌ ليست دليلَ براءة: قد تكون صلاحيةً ناقصةً أو عطلاً في النداء.
  # والحكمُ بالنجاح هنا كان سيُنتج «أخضرَ» لا يعرف شيئاً — وهو ما نحرسه أصلاً.
  T "★ حاويةُ التصدير خارجَ مشروع $SRC_PROJECT" 1
  printf '     \033[0;33m(تعذّر سردُ حاويات %s — لا حكمَ بلا معرفة)\033[0m\n' "$SRC_PROJECT"
else
  T "★ حاويةُ التصدير خارجَ مشروع $SRC_PROJECT (وإلّا فالنسخةُ تموت مع مشروعها)" \
    "$(printf '%s\n' "$SRC_BUCKETS" | grep -qx "$EXPORT_BUCKET" && echo 1 || echo 0)"
fi

RP="$(gcloud storage buckets describe "gs://$EXPORT_BUCKET" --project="$VAULT_PROJECT" \
      --format="value(retention_policy.retentionPeriod)" 2>/dev/null)"
T "سياسةُ احتجاز $(( ${RP:-0} / 86400 )) يوماً" \
  "$([ "$(( ${RP:-0} / 86400 ))" -ge 90 ] && echo 0 || echo 1)"

say "أحدثُ تصدير"
# ⚠ افرز دائماً — القوائمُ لا تُرتَّب بالتاريخ (مصيدةُ §5 نفسُها).
LATEST="$(gcloud storage ls "gs://$EXPORT_BUCKET/" --project="$VAULT_PROJECT" 2>/dev/null \
          | grep '/$' | sort -r | head -1)"
if [ -n "$LATEST" ]; then
  # اسمُ المجلّد هو زمنُ البدء: 2026-08-14T21:57:33_12345/
  STAMP="$(printf '%s' "$LATEST" | sed 's#.*/\([0-9-]*T[0-9:]*\)_.*#\1#')"
  AGE_H="$(( ( $(date -u +%s) - $(date -u -d "${STAMP}Z" +%s 2>/dev/null || echo 0) ) / 3600 ))"
  printf '  %s\n' "$LATEST"
  T "عمرُ أحدثِ تصدير ${AGE_H} ساعة (يجب < $MAX_AGE_HOURS)" \
    "$([ "$AGE_H" -lt "$MAX_AGE_HOURS" ] && [ "$AGE_H" -ge 0 ] && echo 0 || echo 1)"

  # ملفُّ الفهرس دليلُ اكتمال التصدير: تصديرٌ انقطع في منتصفه يترك مجلّداً بلا فهرس
  # — ويبدو في القائمة **تصديراً سليماً** حتى تحاول استيرادَه.
  # ⚠ الصياغةُ الأولى بحثت بنمط `**overall_export_metadata` — و`**` في أنماط gcloud
  #   تعبر المجلّدات ولا تُكمل **جزءَ اسمِ ملفّ**، والملفُّ اسمُه `<البادئة>.overall_…`.
  #   فرجع فارغاً و**أعلن نقصاً في تصديرٍ مكتمل**. نفسُ درسِ `project_number`:
  #   **الاتّكاءُ على دلالةٍ خاصّةٍ بالأداة يحكم بما لا يعرف.** فصار السردُ صريحاً
  #   والبحثُ بـgrep — دلالةٌ واحدةٌ لا لبسَ فيها.
  META="$(gcloud storage ls -r "$LATEST" --project="$VAULT_PROJECT" 2>/dev/null \
          | grep -c 'overall_export_metadata')"
  T "★ التصديرُ مكتمل (فيه ملفُّ الفهرس — والمنقطعُ يبدو سليماً في القائمة)" \
    "$([ "${META:-0}" -ge 1 ] && echo 0 || echo 1)"
else
  T "يوجد تصديرٌ واحدٌ على الأقلّ" 1
fi

say "الوظيفةُ المجدولة — $JOB_NAME"
JSTATE="$(gcloud scheduler jobs describe "$JOB_NAME" --project="$SRC_PROJECT" \
          --location="$JOB_LOCATION" --format="value(state)" 2>/dev/null)"
T "الوظيفةُ مفعَّلة (الحالة: ${JSTATE:-غير موجودة})" \
  "$([ "$JSTATE" = "ENABLED" ] && echo 0 || echo 1)"

printf '\n════════════════════════════════════\n'
printf '  ناجحة: %s   ساقطة: %s\n' "$PASS" "$FAIL"
if [ "$FAIL" -eq 0 ]; then
  printf '  \033[0;32mالإعدادُ سليم — وهذا لا يُغني عن البروفة:\033[0m\n'
  printf '  bash scripts/firestore-export-drill.sh --cross-project\n\n'
  exit 0
fi
printf '  \033[0;31mسقط فحص — راجع أعلاه قبل أن تطمئنّ.\033[0m\n\n'
exit 1
