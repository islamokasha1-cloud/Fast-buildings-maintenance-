// فحصُ سطح الأنماط — ضابطُ نقل CSS، ونظيرُ `global-surface-check.mjs` للطبقة المرئية.
//
//   node css-surface-check.mjs snapshot /tmp/before.json
//   node css-surface-check.mjs snapshot /tmp/after.json
//   node css-surface-check.mjs diff /tmp/before.json /tmp/after.json --expect-changed 1
//
// ── المشكلة التي بُني لها ──
// نقلُ CSS لا يُسقط اسماً من النطاق العام، فـ`global-surface-check` **لا يرى شيئاً**
// هنا. الخطرُ مختلفٌ تماماً: **ترتيبُ التتالي (cascade)**. خمسُ وحداتٍ تحقن `<style>`
// في `<head>` وقتَ التشغيل، فتغلب الأنماطَ الأساسيةَ عند تساوي الأولوية. فلو انتقلت
// الورقةُ الأساسيةُ إلى موضعٍ آخر في الترتيب، تبدّلت عشراتُ القواعد **بلا خطأٍ واحد**
// في وحدة التحكّم — الصفحةُ تُرسَم، لكن بغير ما صُمّمت.
//
// فالمقياسُ ليس النصَّ بل **النمطَ المحسوب لكل عنصرٍ فعلاً** بعد حلّ التتالي كلِّه.
// المطلوبُ من نقلٍ حرفيّ: **صفرُ عنصرٍ تغيّر** — عدا وسمَ الورقة نفسِه (`<style>`
// صار `<link>`)، ويُعلَن عددُه بـ`--expect-changed`.

import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const REPO = process.env.REPO_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname));
const [MODE, ...REST] = process.argv.slice(2);
const usage = () => {
  console.error('الاستعمال:\n  node css-surface-check.mjs snapshot <out.json>\n' +
                '  node css-surface-check.mjs diff <before.json> <after.json> [--expect-changed N]');
  process.exit(2);
};

const PROPS = ['display','position','color','background-color','font-size','font-family','font-weight',
  'padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-right','margin-bottom',
  'margin-left','border-top-width','border-radius','border-color','width','height','flex-direction','flex-grow',
  'justify-content','align-items','gap','grid-template-columns','opacity','visibility','z-index','box-shadow',
  'text-align','direction','overflow-x','overflow-y','white-space','line-height','transform','inset-inline-start'];

async function snapshot(out) {
  if (!out) usage();
  const bsrc = fs.readFileSync(path.join(REPO, 'browser-scenarios.mjs'), 'utf8');
  const a = bsrc.indexOf('const MOCK_FIREBASE = `');
  const s = bsrc.indexOf('`', a) + 1, e = bsrc.indexOf('`;', s);
  const MOCK = bsrc.slice(s, e);
  if (!MOCK.includes('window.__store')) { console.error('تعذّر استخراج مُحاكي Firebase'); process.exit(1); }
  const STUBS = `window.Chart=function(){return{destroy(){},update(){},resize(){},data:{},options:{}}};
    window.Chart.register=function(){};window.Chart.defaults={font:{}};
    window.XLSX={utils:{book_new:()=>({}),json_to_sheet:()=>({}),book_append_sheet(){},aoa_to_sheet:()=>({})},writeFile(){},write(){}};
    window.PptxGenJS=function(){return{addSlide:()=>({addText(){},addImage(){},addTable(){}}),writeFile(){return Promise.resolve()}}};`;

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  await page.addInitScript(MOCK);
  await page.addInitScript(STUBS);
  const errors = [];
  const IGNORE = /ServiceWorker|net::ERR_FAILED|Failed to load resource|ERR_BLOCKED|reCAPTCHA|AppCheck/i;
  page.on('pageerror', x => { const m = String(x.message).slice(0, 200); if (!IGNORE.test(m)) errors.push(m); });
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.includes('workers.dev/login')) {
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ token: 't', profile: { user: 'admin', name: 'المسؤول', role: 'admin' } }) });
    }
    if (/^https?:/.test(u)) return r.abort();
    return r.continue();
  });
  await page.goto('file://' + REPO + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);

  const snap = await page.evaluate(PROPS => {
    const out = [], els = document.querySelectorAll('*');
    for (let i = 0; i < els.length; i++) {
      const el = els[i], cs = getComputedStyle(el);
      const cls = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || '';
      out.push(`${i}|${el.tagName}|${el.id || ''}|${cls}::` + PROPS.map(p => cs.getPropertyValue(p)).join('|'));
    }
    // ترتيبُ أوراق الأنماط — الخطرُ الأصليّ: ورقةٌ تنزلق في الترتيب فتغلب أو تُغلَب
    const sheets = [...document.querySelectorAll('style,link[rel=stylesheet]')]
      .map(el => el.tagName.toLowerCase() + ':' + (el.id || el.getAttribute('href') || '(inline)'));
    return { count: els.length, styles: out, sheets };
  }, PROPS);

  fs.writeFileSync(out, JSON.stringify({ count: snap.count, sheets: snap.sheets, styles: snap.styles, errors }, null, 0));
  console.log(`  عناصر مفحوصة:     ${snap.count}`);
  console.log(`  أوراق أنماط:      ${snap.sheets.length}  [${snap.sheets.join(' · ')}]`);
  console.log(`  أخطاء جافاسكربت:  ${errors.length}`);
  errors.slice(0, 5).forEach(x => console.log('     ❌', x));
  console.log(`  كُتبت إلى: ${out}`);
  await browser.close();
  return errors.length === 0 ? 0 : 1;
}

function diff(bf, af, argv) {
  if (!bf || !af) usage();
  const i = argv.indexOf('--expect-changed');
  const allowed = i < 0 ? 0 : parseInt(argv[i + 1] || '0', 10);
  const b = JSON.parse(fs.readFileSync(bf, 'utf8'));
  const a = JSON.parse(fs.readFileSync(af, 'utf8'));
  let bad = 0;

  console.log(`── عناصر: قبل ${b.count} · بعد ${a.count}`);
  if (b.count !== a.count) { bad++; console.log('   ❌ اختلف عددُ العناصر — ليس نقلاً حرفياً'); }

  console.log(`── أوراق الأنماط وترتيبُها:`);
  console.log(`   قبل: ${b.sheets.join(' · ')}`);
  console.log(`   بعد: ${a.sheets.join(' · ')}`);
  if (b.sheets.length !== a.sheets.length) { bad++; console.log('   ❌ تغيّر عددُ الأوراق'); }

  const n = Math.min(b.styles.length, a.styles.length);
  const changed = [];
  for (let k = 0; k < n; k++) if (b.styles[k] !== a.styles[k]) changed.push(k);
  console.log(`── عناصر تغيّر نمطُها المحسوب: ${changed.length}  (المسموح ${allowed})`);
  for (const k of changed.slice(0, 8)) {
    const [kb, vb] = b.styles[k].split('::'), [ka, va] = a.styles[k].split('::');
    const d = vb.split('|').map((x, j) => x !== va.split('|')[j] ? `${PROPS[j]}: ${x} ← ${va.split('|')[j]}` : null).filter(Boolean);
    console.log(`   • ${kb}${ka !== kb ? `  ⇐ صار ${ka}` : ''}${d.length ? '  ' + JSON.stringify(d.slice(0, 4)) : ''}`);
  }
  if (changed.length > allowed) { bad++; console.log(`   ❌ تغيّرٌ يفوق المُعلَن — فسِّره أو أعلِنه بـ--expect-changed`); }

  const ed = (a.errors || []).length - (b.errors || []).length;
  console.log(`── أخطاء جافاسكربت: قبل ${(b.errors || []).length} · بعد ${(a.errors || []).length}`);
  if (ed > 0) { bad++; console.log('   ❌ أخطاءٌ جديدة'); }

  console.log(bad === 0 ? '\n✅ سطحُ الأنماط سليم — التتالي والنمطُ المحسوب كما كانا.'
                        : `\n❌ ${bad} اختلافاً غيرَ مقبول — لا تدفع قبل تفسيره.`);
  return bad === 0 ? 0 : 1;
}

let code = 2;
if (MODE === 'snapshot') code = await snapshot(REST[0]);
else if (MODE === 'diff') code = diff(REST[0], REST[1], process.argv);
else usage();
process.exit(code);
