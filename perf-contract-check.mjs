// perf-contract-check.mjs — تحقّقٌ موجّه للعقد القائم على الأداء: مشروعان — تقليديٌّ وقائمٌ على الأداء — في متصفّح حقيقي.
//   node perf-contract-check.mjs   (يحتاج Chromium — كبقية فحوص المتصفّح)
// العهد المحروس: التقليديُّ لا يرى شيئاً، والقائمُ على الأداء يرى القسم بأرقامٍ صحيحة.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const REPO = '/home/user/Fast-buildings-maintenance-';
const SHOTS = '/tmp/perf-shots';
fs.mkdirSync(SHOTS, { recursive: true });

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
const L = (...a) => console.log(...a);
const check = (n, ok, d) => { if (ok) { pass++; L('  ✅', n, d ? '— ' + d : ''); } else { fail++; L('  ❌', n, d ? '— ' + d : ''); } };

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

L('\n════════ المرحلة ١: العقد القائم على الأداء ════════');
await page.goto('file://' + REPO + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);

// مشروعان: تقليديٌّ وقائمٌ على الأداء (بدأ قبل ١٤ شهراً ⇒ السنة الثانية، خارج المهلة)
await page.evaluate(() => {
  window.__store[PROJECTS_DOC] = { projects: [
    { id: 'trad', name: 'مشروع تقليدي', desc: 'صيانة عادية', icon: '', type: 'maintenance' },
    { id: 'perf', name: 'حائل — المرحلة الثانية', desc: 'عقد أداء', icon: '', type: 'maintenance',
      contractStart: '2025-06-01', contractMonths: 60,
      perfContract: true, perfMinScore: 0.70, perfMonthlyAmount: 550000, perfStartDate: '2025-06-01' },
    { id: 'fake', name: 'مشروع بعَلَمٍ نصّي', desc: 'حارس', icon: '', type: 'maintenance', perfContract: 'false' }
  ]};
  window.__store[_meta('settings')] = { buildings: ['مبنى الإدارة'], supervisors: ['أسامة'], workTypes: { 'كهرباء': ['لمبة'] } };
});

L('\n=== ١) دوالّ النواة (مصدرٌ واحدٌ للحقيقة) ===');
const core = await page.evaluate(() => {
  const trad = { id: 'trad', name: 'تقليدي' };
  const perf = { id: 'perf', perfContract: true, perfMinScore: 0.70, perfMonthlyAmount: 550000, perfStartDate: '2025-06-01' };
  const fake = { id: 'fake', perfContract: 'false' };
  const at = (s) => new Date(s + 'T12:00:00');
  return {
    tradNull:   perfConfig(trad) === null,
    fakeNull:   perfConfig(fake) === null,
    perfOn:     isPerfProject(perf),
    y1:         perfContractYear(at('2026-05-31'), perf),   // قبل الذكرى ⇒ السنة ١
    y2:         perfContractYear(at('2026-06-01'), perf),   // يوم الذكرى ⇒ السنة ٢
    min1:       perfMinScore(at('2026-05-31'), perf),
    min2:       perfMinScore(at('2026-06-01'), perf),
    m1:         perfContractMonth(at('2025-06-15'), perf),
    m3:         perfContractMonth(at('2025-08-02'), perf),
    graceM2:    perfInGrace(at('2025-07-15'), perf),
    graceM3:    perfInGrace(at('2025-08-15'), perf),
    graceTrad:  perfInGrace(at('2025-07-15'), trad),
    minNullTrad: perfMinScore(at('2026-01-01'), trad)
  };
});
check('مشروع تقليدي ⇒ perfConfig = null', core.tradNull);
check('★ العَلَم النصّي "false" لا يُشعل عقداً', core.fakeNull);
check('مشروع الأداء ⇒ isPerfProject = true', core.perfOn);
check('★ سنة العقد قبل يوم الذكرى = ١', core.y1 === 1, 'y=' + core.y1);
check('★ سنة العقد في يوم الذكرى = ٢', core.y2 === 2, 'y=' + core.y2);
check('الحد الأدنى للسنة ١ = ٧٠٪', Math.abs(core.min1 - 0.70) < 1e-9, (core.min1 * 100).toFixed(0) + '%');
check('★ الحد الأدنى للسنة ٢ = ٧٥٪', Math.abs(core.min2 - 0.75) < 1e-9, (core.min2 * 100).toFixed(0) + '%');
check('شهر العقد الأول = ١', core.m1 === 1, 'm=' + core.m1);
check('شهر العقد الثالث = ٣', core.m3 === 3, 'm=' + core.m3);
check('★ المهلة سارية في الشهر ٢ ومنتهية في الشهر ٣', core.graceM2 === true && core.graceM3 === false);
check('المشروع التقليدي خارج منطق المهلة والحد الأدنى', core.graceTrad === false && core.minNullTrad === null);

L('\n=== ٢) المشروع التقليدي: صفر أثر ===');
AUTH_OK = true;
await page.fill('#login-user', 'admin'); await page.fill('#login-pass', 'Passw0rd!');
await page.click('.login-btn');
await page.waitForTimeout(3500);
const gridTxt = (await page.textContent('#project-grid').catch(() => '')) || '';
check('بطاقتا المشروعين معروضتان', gridTxt.includes('مشروع تقليدي') && gridTxt.includes('المرحلة الثانية'));
const badges = await page.evaluate(() => document.querySelectorAll('#project-grid').length
  ? [...document.querySelectorAll('.project-card')].map(c => c.textContent.includes('عقد قائم على الأداء')) : []);
check('★ شارة «عقد قائم على الأداء» على بطاقةٍ واحدةٍ فقط',
  badges.filter(Boolean).length === 1, badges.filter(Boolean).length + ' من ' + badges.length);
await page.screenshot({ path: `${SHOTS}/01-projects.png` });

await page.evaluate(() => selectProject('trad'));
await page.waitForTimeout(3000);
const trad = await page.evaluate(() => ({
  btn:  !!document.getElementById('nav-performance-btn'),
  page: !!document.getElementById('page-performance'),
  active: !!(document.getElementById('page-performance') || {}).classList?.contains('active'),
  isPerf: isPerfProject()
}));
check('★ لا زرَّ «تقييم الأداء» في المشروع التقليدي', trad.btn === false);
check('isPerfProject() = false في المشروع التقليدي', trad.isPerf === false);
await page.evaluate(() => showPage('performance'));
await page.waitForTimeout(900);
const blocked = await page.evaluate(() => ({
  perfActive: !!(document.getElementById('page-performance') || {}).classList?.contains('active'),
  dashActive: !!(document.getElementById('page-dashboard') || {}).classList?.contains('active')
}));
check('★ فتحُ الصفحة قسراً يُحوَّل للوحة المعلومات', blocked.perfActive === false && blocked.dashActive === true);
await page.screenshot({ path: `${SHOTS}/02-traditional.png` });

L('\n=== ٣) مشروع الأداء: القسم يعمل ===');
await page.evaluate(() => switchProject());
await page.waitForTimeout(2500);
await page.evaluate(() => selectProject('perf'));
await page.waitForTimeout(3500);
const btnOk = await page.evaluate(() => !!document.getElementById('nav-performance-btn'));
check('★ زرّ «تقييم الأداء» ظهر في مشروع الأداء', btnOk === true);
// الزرّ ابنٌ في مجموعة «الأداء» المطويّة — نفتح المجموعة أولاً كما يفعل المستخدم
const inGroup = await page.evaluate(() => {
  const b = document.getElementById('nav-performance-btn');
  return !!(b && b.closest('#grp-kpi'));
});
check('★ الزرّ داخل مجموعة «الأداء» بجوار «مؤشرات الأداء»', inGroup === true);
if (inGroup) { await page.click('#hdr-grp-kpi'); await page.waitForTimeout(700); }
if (btnOk) await page.click('#nav-performance-btn');
await page.waitForTimeout(1200);
const pf = await page.evaluate(() => {
  const el = document.getElementById('page-performance');
  const txt = el ? el.textContent.replace(/\s+/g, ' ') : '';
  return {
    active: !!el && el.classList.contains('active'),
    txt,
    groups: el ? el.querySelectorAll('.pf-grp').length : 0,
    api: !!(window.performanceContract && window.performanceContract.isActive())
  };
});
check('الصفحة فُتحت وفُعّلت بالنقر الفعلي', pf.active === true);
check('★ المجموعات الخمس معروضة', pf.groups === 5, pf.groups + ' مجموعة');
check('المبلغ الشهري معروضٌ منسَّقاً', pf.txt.includes('550,000'), '550,000');
check('★ الحد الأدنى المحسوب للسنة الحالية معروض', /الحد الأدنى للنجاح/.test(pf.txt));
check('الأوزان الخمسة معروضة', ['30%', '25%', '20%', '15%', '10%'].every(w => pf.txt.includes(w)));
check('★ النتيجة السنوية المستهدفة تُحسب من الأوزان', pf.txt.includes('78.5%'), '78.5%');
check('مقياس الغرامة معروضٌ بالريال (١٢٪ من ٥٥٠ ألف = ٦٦٬٠٠٠)', pf.txt.includes('66,000'));
check('واجهة الوحدة تعلن أن العقد نشط', pf.api === true);
check('★ لا درجةً محسوبةً معروضة (لا رقمَ كاذباً)', !/الدرجة الحالية|درجتك الآن/.test(pf.txt));
await page.screenshot({ path: `${SHOTS}/03-performance.png`, fullPage: true });

L('\n=== ٤) نافذة تعديل المشروع ===');
const modal = await page.evaluate(() => {
  openEditProjectModal('perf');
  const on = (document.getElementById('ep-perf') || {}).checked;
  const min = (document.getElementById('ep-perf-min') || {}).value;
  const amt = (document.getElementById('ep-perf-amount') || {}).value;
  const shown = (document.getElementById('ep-perf-fields') || {}).style?.display !== 'none';
  return { on, min, amt, shown };
});
check('★ العَلَم مُحمَّلٌ مفعّلاً من سجلّ المشروع', modal.on === true);
check('الحقول ظاهرةٌ عند التفعيل', modal.shown === true);
check('★ النسبة تُعرض مئويةً (٧٠) والمخزَّن كسرٌ (٠٫٧٠)', modal.min === '70', modal.min);
check('المبلغ الشهري مُحمَّل', modal.amt === '550000', modal.amt);
const toggled = await page.evaluate(() => {
  const cb = document.getElementById('ep-perf'); cb.checked = false; togglePerfFields('ep');
  const hidden = (document.getElementById('ep-perf-fields') || {}).style.display === 'none';
  const read = _readPerfFields('ep');
  cb.checked = true; togglePerfFields('ep');
  return { hidden, read };
});
check('إطفاء العَلَم يُخفي الحقول', toggled.hidden === true);
check('★ القارئ يعيد perfContract=false عند الإطفاء', toggled.read.perfContract === false);
await page.screenshot({ path: `${SHOTS}/04-edit-modal.png` });

L('\n════════════════════════════════════════');
if (errors.length) { L('  ⚠️ أخطاء جافاسكربت:'); errors.slice(0, 5).forEach(e => L('     • ' + e)); }
else L('  ✨ لا أخطاء جافاسكربت');
L(fail === 0 ? `✅ ${pass}/${pass} فحصاً ناجحاً` : `❌ ${fail} فشل من ${pass + fail}`);
L(`   اللقطات: ${SHOTS}`);
L('════════════════════════════════════════\n');
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
