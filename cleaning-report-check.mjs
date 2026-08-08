// فحصُ تشغيلٍ حقيقيّ للتقرير المصوّر المجمّع (v18.9ag) في Chromium.
// يبني تنفيذاتِ نظافةٍ وهمية، يجمّعها بالوحدة، ثم يرسم التقرير بنواة index.html
// ويتحقّق من الـDOM الناتج — لا من النصّ المصدري.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const REPO = process.env.REPO_DIR || '/home/user/Fast-buildings-maintenance-';
const bsrc = fs.readFileSync(path.join(REPO, 'browser-scenarios.mjs'), 'utf8');
const _a = bsrc.indexOf('const MOCK_FIREBASE = `');
const _s = bsrc.indexOf('`', _a) + 1, _e = bsrc.indexOf('`;', _s);
const MOCK_FIREBASE = bsrc.slice(_s, _e);

const CDN_STUBS = `
  window.Chart = function(){ return { destroy(){}, update(){}, resize(){}, data:{}, options:{} }; };
  window.Chart.register = function(){}; window.Chart.defaults = { font:{} };
  window.XLSX = { utils:{ book_new:()=>({}), json_to_sheet:()=>({}), book_append_sheet(){}, aoa_to_sheet:()=>({}) }, writeFile(){}, write(){} };
  window.PptxGenJS = function(){ return { addSlide:()=>({ addText(){}, addImage(){}, addTable(){} }), writeFile(){ return Promise.resolve(); } }; };
`;

let pass = 0, fail = 0;
const check = (n, ok, d) => { if (ok) { pass++; console.log('  ✅', n, d ? '— ' + d : ''); } else { fail++; console.log('  ❌', n, d ? '— ' + d : ''); } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(MOCK_FIREBASE);
await page.addInitScript(CDN_STUBS);
const errors = [];
const IGNORE = /ServiceWorkerRegistration|net::ERR_FAILED|Failed to load resource|ERR_BLOCKED|reCAPTCHA|AppCheck/i;
page.on('pageerror', e => { const m = String(e.message).slice(0, 200); if (!IGNORE.test(m)) errors.push(m); });
page.on('console', m => { if (m.type() !== 'error') return; const t = String(m.text()).slice(0, 200); if (!IGNORE.test(t)) errors.push(t); });
let AUTH_OK = false;
await page.route('**/*', route => {
  const u = route.request().url();
  if (u.includes('workers.dev/login')) {
    return AUTH_OK
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'tkn', profile: { user: 'admin', name: 'المسؤول', role: 'admin' } }) })
      : route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
  }
  if (/^https?:/.test(u)) return route.abort();
  return route.continue();
});

await page.goto('file://' + REPO + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  window.__store[PROJECTS_DOC] = { projects: [{ id: 'hail', name: 'مشروع النظافة', desc: 'نظافة', icon: '' }] };
  window.__store[_meta('settings')] = { buildings: ['مبنى أ', 'مبنى ب'], supervisors: ['خالد'], workTypes: { 'نظافة الأرضيات': [] } };
});
AUTH_OK = true;
await page.fill('#login-user', 'admin'); await page.fill('#login-pass', 'Passw0rd!');
await page.click('.login-btn');
await page.waitForTimeout(4000);

console.log('\n=== التقرير المصوّر المجمّع (v18.9ag) ===');
check('الوحدة تعرّض _aggCardHTML و_aggregateLog',
  await page.evaluate(() => !!(window.cleaningOps && typeof window.cleaningOps._aggCardHTML === 'function' && typeof window.cleaningOps._aggregateLog === 'function')));

const res = await page.evaluate(() => {
  // ٣٠ تنفيذاً في مبنيين × نوعي عمل، بأربع صورٍ لكلٍّ = ١٢٠ صورة
  const recs = [];
  const combos = [['مبنى أ', 'نظافة الأرضيات'], ['مبنى أ', 'إدارة النفايات'], ['مبنى ب', 'نظافة الأرضيات']];
  combos.forEach(([b, w], ci) => {
    for (let d = 1; d <= 10; d++) {
      const ds = '2026-08-' + String(d).padStart(2, '0');
      recs.push({ id: 'r' + ci + d, building: b, workType: w, date: ds, at: ds + 'T08:00:00Z',
        floor: 'الدور ' + ci, supervisor: 'خالد', by: 'أحمد', taskName: 'مسح', doneItems: 4, totalItems: 4,
        photos: ['p' + ci + d + 'a', 'p' + ci + d + 'b', 'p' + ci + d + 'c', 'p' + ci + d + 'd'] });
    }
  });
  const rawPhotos = recs.reduce((a, r) => a + r.photos.length, 0);
  const agg = window.cleaningOps._aggregateLog(recs);
  const full = recs.map(r => window.cleaningOps._logAsTicket(r));

  photoReportTickets = agg;
  renderPhotoReportOutput(agg);
  const out = document.getElementById('photo-report-output');
  const html = out.innerHTML;
  const cards = out.querySelectorAll('.pr-card').length;
  const imgsAgg = out.querySelectorAll('.pr-photos-grid img').length;
  const sizeBar = (out.querySelector('.no-print') || {}).textContent || '';
  const coverTotal = (out.querySelector('.prc-mono') || {}).textContent || '';
  const kpiLabels = Array.from(out.querySelectorAll('.pr-sm-kpi .l')).map(e => e.textContent.trim());
  const kpiVals = Array.from(out.querySelectorAll('.pr-sm-kpi .n')).map(e => e.textContent.trim());
  const secTitles = Array.from(out.querySelectorAll('.pr-sm-sec-title')).map(e => e.textContent.trim());
  const coverTitle = (out.querySelector('.pr-cover-report-title') || {}).textContent || '';

  // حذفُ صورةٍ من بطاقةٍ مجمّعة يجب أن يسري فوراً
  const firstId = agg[0].id;
  removePhotoFromCard(firstId, 'closing', 0);
  const afterDel = document.getElementById('photo-report-output').querySelectorAll('.pr-photos-grid img').length;

  // الوضع المفصّل للمقارنة
  photoReportTickets = full;
  renderPhotoReportOutput(full);
  const out2 = document.getElementById('photo-report-output');
  return { rawPhotos, aggCards: agg.length, cards, imgsAgg, afterDel, sizeBar: sizeBar.replace(/\s+/g, ' ').trim(),
    coverTotal, kpiLabels, kpiVals, secTitles, coverTitle: coverTitle.trim(),
    fullCards: out2.querySelectorAll('.pr-card').length, fullImgs: out2.querySelectorAll('.pr-photos-grid img').length,
    fullBar: ((out2.querySelector('.no-print') || {}).textContent || '').replace(/\s+/g, ' ').trim() };
});

check('★ ٣٠ تنفيذاً بـ١٢٠ صورة ⟵ ٣ بطاقات مجمّعة', res.aggCards === 3 && res.cards === 3, `بطاقات=${res.cards}`);
check('★ الصور المعروضة ٩ بدل ١٢٠ (−٩٢٪)', res.imgsAgg === 9 && res.rawPhotos === 120, `معروضة=${res.imgsAgg} من ${res.rawPhotos}`);
check('★ حذف صورةٍ من بطاقةٍ مجمّعة يسري فوراً', res.afterDel === 8, `بعد الحذف=${res.afterDel}`);
check('★ الغلاف يعدّ التنفيذات (٣٠) لا البطاقات (٣)', res.coverTotal.trim() === '30', `الغلاف=${res.coverTotal.trim()}`);
check('الملخّص يعرض «إجمالي التنفيذات» و«أيام عمل مغطّاة»',
  res.kpiLabels.includes('إجمالي التنفيذات') && res.kpiLabels.includes('أيام عمل مغطّاة') && res.kpiLabels.includes('بطاقات مجمّعة'),
  res.kpiLabels.join(' · '));
check('أيام العمل اتّحادٌ لا مجموع (١٠ لا ٣٠)', res.kpiVals[3] === '10', 'القيم=' + res.kpiVals.join('/'));
check('لوحة الأولوية استُبدلت بتوزيع المباني', res.secTitles.some(t => /حسب المبنى/.test(t)), res.secTitles.join(' · '));
check('عنوان الغلاف صار «أعمال النظافة»', /أعمال النظافة/.test(res.coverTitle), res.coverTitle);
check('★ عدّاد الحجم يظهر ويقدّر الحجم', /9 صورة/.test(res.sizeBar) && /ميجابايت/.test(res.sizeBar), res.sizeBar);
check('★ الوضع المفصّل ما زال يعمل (٣٠ بطاقة/١٢٠ صورة)', res.fullCards === 30 && res.fullImgs === 120, `${res.fullCards} بطاقة · ${res.fullImgs} صورة`);
check("العدّاد يحذّر من الملف الثقيل في الوضع المفصّل", /ملفٌّ ثقيل/.test(res.fullBar), res.fullBar.slice(0, 90));
check('✨ لا أخطاء جافاسكربت', errors.length === 0, errors[0] || '');

await page.evaluate(() => { photoReportTickets = window.cleaningOps._aggregateLog([
  { id: 'a', building: 'مبنى أ', workType: 'نظافة الأرضيات', date: '2026-08-01', at: '2026-08-01T08:00:00Z', supervisor: 'خالد', doneItems: 4, totalItems: 4, photos: ['x1'] },
  { id: 'b', building: 'مبنى أ', workType: 'نظافة الأرضيات', date: '2026-08-05', at: '2026-08-05T08:00:00Z', supervisor: 'خالد', doneItems: 3, totalItems: 4, photos: ['x2'] }
]); renderPhotoReportOutput(photoReportTickets); });
await page.click('#project-grid .project-card, #project-grid > div').catch(()=>{});
await page.waitForTimeout(2500);
await page.evaluate(() => { try{ showPage('photo-report'); }catch(e){} });
await page.waitForTimeout(800);
const el = await page.$('#photo-report-output');
if (el) await el.screenshot({ path: '/tmp/ui-shots/agg-report.png' });

console.log('\n════════════════════════════════════════');
console.log(fail === 0 ? `✅ ${pass}/${pass} فحصاً ناجحاً` : `❌ ${fail} فشلت من ${pass + fail}`);
console.log('════════════════════════════════════════');
await browser.close();
process.exit(fail === 0 ? 0 : 1);
