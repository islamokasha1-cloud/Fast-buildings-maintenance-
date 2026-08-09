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

/* ═════════ ٥) المرحلة ٢: الجدولة والطوابع والتجربة ═════════ */
L('\n=== ٥) جدولةُ الوقائي لا تنزاح ===');
const sched = await page.evaluate(() => {
  // خطةٌ شهريةٌ استحقاقُها ١ يناير، تُنفَّذ متأخرةً — يجب أن يبقى الجدول على مرساته
  const plan = { id:'P1', freq:'شهري', nextDueDate:'2026-01-01T12:00:00.000Z' };
  const a = ppmNextDue(plan, new Date().toISOString());
  // خطةٌ متأخّرةٌ جداً: يجب أن تلحق الدورات حتى تتجاوز اليوم لا أن تبقى في الماضي
  const late = ppmNextDue({ id:'P2', freq:'شهري', nextDueDate:'2020-01-01T12:00:00.000Z' }, null);
  const DAY = 86400000;
  // خطةٌ بلا استحقاقٍ سابق: تُبنى من **التاريخ المُمرَّر** لا من اليوم. والمرساةُ في
  // المستقبل قصداً: بتاريخٍ ماضٍ يلحق الجدولُ دوراتَه فتُطمَس الخاصيةُ المقصودة، ثم
  // يصير التوقّعُ رهنَ يومِ التشغيل. (وهو ما وقع فعلاً: كان التوقّعُ محفوراً «يوم ٨»
  // على مرساةِ ١ أغسطس، فسقط الفحصُ من نفسه يومَ تجاوزه التاريخُ الحقيقي.)
  const anchor = new Date(Date.now() + 60*DAY);
  const fresh = ppmNextDue({ id:'P3', freq:'أسبوعي' }, anchor.toISOString());
  const freshWant = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()+7, 12, 0, 0);
  const today = new Date(); const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // ثباتُ المرساة = الفارقُ بين الاستحقاق الجديد والأصلي **مضاعفٌ تامٌّ للتكرار**.
  // (السلوكُ القائم: «شهري» = ٣٠ يوماً لا شهراً تقويمياً — لم تُغيَّر دلالتُه هنا.)
  const deltaDays = Math.round((new Date(a) - new Date('2026-01-01T12:00:00.000Z')) / DAY);
  return { a, late, fresh, lateFuture: new Date(late) > t0, deltaDays,
           anchored: deltaDays > 0 && deltaDays % 30 === 0,
           freshOk: new Date(fresh).getTime() === freshWant.getTime(),
           freshSeen: fresh.slice(0,10), freshWant: freshWant.toISOString().slice(0,10) };
});
check('★ الاستحقاق الجديد مضاعفٌ تامٌّ للتكرار من المرساة الأصلية (لا انزياح)',
  sched.anchored === true, sched.deltaDays + ' يوماً = ' + (sched.deltaDays/30) + ' دورة');
check('★ خطةٌ متأخّرةٌ سنواتٍ تلحق دوراتها ولا تبقى في الماضي', sched.lateFuture === true, sched.late.slice(0,10));
check('★ خطةٌ بلا استحقاقٍ سابق تُبنى من التاريخ المُمرَّر (توقُّعٌ محسوبٌ لا محفور)',
  sched.freshOk === true, 'مرسوم ' + sched.freshSeen + ' · متوقَّع ' + sched.freshWant);

L('\n=== ٦) الطوابع الزمنية ===');
const stamps = await page.evaluate(() => {
  const now = new Date().toISOString();
  const t = { id:'TK-PERF', building:'مبنى الإدارة', workType:'كهرباء', desc:'اختبار',
              priority:'عادي 🟢 (48 ساعة)', status:'مفتوح', createdAt:now, timeline:[] };
  tickets.push(t);
  perfStamp('TK-PERF','respondedAt');
  const first = t.respondedAt;
  perfStamp('TK-PERF','respondedAt');          // محاولةٌ ثانية — يجب أن تُرفض
  perfStamp('TK-PERF','restoredAt');
  const pausedBefore = perfClockPaused(t);
  t.clockStops = [{ from: now, to: null, reason:'بانتظار موافقة الجهة' }];
  const pausedAfter = perfClockPaused(t);
  t.clockStops[0].to = now;
  const pausedResumed = perfClockPaused(t);
  return { first, second: t.respondedAt, restored: !!t.restoredAt, pausedBefore, pausedAfter, pausedResumed,
           tl: (t.timeline||[]).map(e=>e.event) };
});
check('★ زمن الاستجابة يُسجَّل', !!stamps.first);
check('★ لا يُعاد كتابتُه (لا تجميل للرقم)', stamps.first === stamps.second);
check('عودة الخدمة تُسجَّل مستقلةً', stamps.restored === true);
check('الخط الزمني يوثّق الفعلين', stamps.tl.includes('وصل الفني للموقع') && stamps.tl.includes('عادت الخدمة للعمل'));
check('★ قارئُ حالة الساعة: مفتوح ⇒ موقوف، مُغلق ⇒ يعمل',
  stamps.pausedBefore === false && stamps.pausedAfter === true && stamps.pausedResumed === false);

L('\n=== ٧) الوضع التجريبي ===');
// أغلِق نافذةَ التعديل من الخطوة السابقة — وإلا حجبت لقطةَ الإثبات
await page.evaluate(() => { document.getElementById('modal-edit-project')?.remove(); });
const trial = await page.evaluate(() => {
  const before = isPerfTrial();
  CURRENT_PROJECT.perfTrial = true;
  const after = isPerfTrial();
  performanceContract.render();
  const el = document.getElementById('page-performance');
  const txt = el ? el.textContent.replace(/\s+/g,' ') : '';
  return { before, after, banner: txt.includes('وضعٌ تجريبيّ — قياسٌ بلا غرامات'),
           tagged: txt.includes('تدريبيّ'), coverage: txt.includes('تغطيةُ البيانات'),
           notScore: !txt.includes('درجتك الآن') };
});
check('العَلَم مطفأٌ افتراضياً', trial.before === false);
check('★ تفعيلُه يُشعل الوضع التجريبي', trial.after === true);
check('★ شريطٌ صريحٌ «قياسٌ بلا غرامات»', trial.banner === true);
check('★ المبالغ موسومةٌ «تدريبيّ»', trial.tagged === true);
check('بطاقةُ تغطية البيانات معروضة', trial.coverage === true);
check('★ ولا درجةَ محسوبةٌ تُعرَض', trial.notScore === true);
await page.screenshot({ path: `${SHOTS}/05-trial.png`, fullPage: true });

L('\n════════════════════════════════════════');
if (errors.length) { L('  ⚠️ أخطاء جافاسكربت:'); errors.slice(0, 5).forEach(e => L('     • ' + e)); }
else L('  ✨ لا أخطاء جافاسكربت');
L(fail === 0 ? `✅ ${pass}/${pass} فحصاً ناجحاً` : `❌ ${fail} فشل من ${pass + fail}`);
L(`   اللقطات: ${SHOTS}`);
L('════════════════════════════════════════\n');
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
