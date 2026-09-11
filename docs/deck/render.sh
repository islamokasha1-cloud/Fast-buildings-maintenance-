#!/usr/bin/env bash
# توليدُ ملفّ العرض PDF من `platform-deck.html`.
#
# لماذا Chromium مباشرةً: مقاسُ الصفحة يأتي من `@page{size:1600px 900px}` في الورقة
# نفسِها، فلا حاجةَ لتمرير مقاسٍ من سطر الأوامر ولا لخطرِ اختلافه عن التصميم.
# و`--no-pdf-header-footer` يمنع ترويسةَ المتصفّح وتذييلَه من تلويث الشريحة.
#
# تنبيهٌ إن عُدِّلت الخطوط: الخطوطُ مضمَّنةٌ base64 داخل الورقة و**ثابتةُ الوزن**
# (لا variable). أيُّ رجوعٍ إلى خطٍّ متغيّرٍ أو إلى ملفٍّ مرتبطٍ يُخرج الـPDF
# برسمِ Type3 أو بخطٍّ احتياطيّ — بلا خطأٍ ظاهر. الفحصُ أدناه يمسك ذلك.
set -euo pipefail
cd "$(dirname "$0")"
CHROME="${CHROME:-/opt/pw-browsers/chromium-1194/chrome-linux/chrome}"
[ -x "$CHROME" ] || CHROME="$(command -v chromium || command -v google-chrome)"

"$CHROME" --headless --disable-gpu --no-sandbox --no-pdf-header-footer \
  --virtual-time-budget=20000 \
  --print-to-pdf=hail-platform-deck.pdf \
  "file://$PWD/platform-deck.html" 2>/dev/null

python3 - <<'PY'
import re,sys
# عددُ الصفحات المتوقَّع يُشتقّ من الورقة نفسِها لا يُكتب رقماً: شريحةٌ تُضاف
# أو تُحذَف فيتبعها الفحصُ بلا تعديل — والرقمُ المكتوبُ بيدٍ يتقادم فيصير
# الفحصُ إمّا كاذباً أو مزعجاً، وكلاهما يُفقده معناه.
html = open('platform-deck.html', encoding='utf-8').read()
want = html.count('<section class="slide')
d = open('hail-platform-deck.pdf','rb').read()
pages = len(re.findall(rb'/Type\s*/Page[^s]', d))
box = set(re.findall(rb'/MediaBox\s*\[([^\]]*)\]', d))
imgs = len(re.findall(rb'/Subtype\s*/Image', d))
want_imgs = html.count('<img src="screens/')
ok = pages == want and box == {b'0 0 1200 675.12'} and imgs >= want_imgs
print('الصفحات: %d/%d | الصور: %d/%d | المقاس: %s'
      % (pages, want, imgs, want_imgs, ', '.join(b.decode() for b in box)))
if not ok: print('⛔ لا يطابق المتوقَّع')
sys.exit(0 if ok else 1)
PY
echo "تمّ: hail-platform-deck.pdf"
