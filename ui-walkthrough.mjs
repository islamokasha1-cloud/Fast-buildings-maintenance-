// رحلة مستخدم حقيقية في متصفّح Chromium — دخولٌ من الشاشة، ثم بوّابة المشاريع،
// ثم تصفّحُ كلّ الصفحات بالنقر الفعلي، ثم تفاعلاتٌ حقيقية (فتح طلب، مخزون، خروج).
// Firestore وهميّ في الذاكرة (نفس مُحاكي browser-scenarios.mjs) — لا يلمس الإنتاج إطلاقاً.
//   node ui-walkthrough.mjs
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const REPO = process.env.REPO_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname));
const SHOTS = process.env.SHOTS_DIR || '/tmp/ui-shots';
fs.mkdirSync(SHOTS, { recursive: true });

// ── أعِد استخدام مُحاكي Firebase من browser-scenarios.mjs (مصدر واحد للحقيقة) ──
const bsrc = fs.readFileSync(path.join(REPO, 'browser-scenarios.mjs'), 'utf8');
const _a = bsrc.indexOf('const MOCK_FIREBASE = `');
const _s = bsrc.indexOf('`', _a) + 1, _e = bsrc.indexOf('`;', _s);
const MOCK_FIREBASE = bsrc.slice(_s, _e);
if (!MOCK_FIREBASE.includes('window.__store')) { console.error('تعذّر استخراج المُحاكي'); process.exit(1); }

// مكتبات الـCDN غير متاحة دون إنترنت — بدائل صامتة حتى لا تُنسَب أخطاؤها للتطبيق.
const CDN_STUBS = `
  window.Chart = function(){ return { destroy(){}, update(){}, resize(){}, data:{}, options:{} }; };
  window.Chart.register = function(){}; window.Chart.defaults = { font:{} };
  window.XLSX = { utils:{ book_new:()=>({}), json_to_sheet:()=>({}), book_append_sheet(){}, aoa_to_sheet:()=>({}) }, writeFile(){}, write(){} };
  window.PptxGenJS = function(){ return { addSlide:()=>({ addText(){}, addImage(){}, addTable(){} }), writeFile(){ return Promise.resolve(); } }; };
`;

let pass = 0, fail = 0, warn = 0;
const L = (...a) => console.log(...a);
const check = (n, ok, d) => { if (ok) { pass++; L('  ✅', n, d ? '— ' + d : ''); } else { fail++; L('  ❌', n, d ? '— ' + d : ''); } };
const note = (n, d) => { warn++; L('  ⚠️ ', n, d ? '— ' + d : ''); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(MOCK_FIREBASE);
await page.addInitScript(CDN_STUBS);

let CURRENT = 'boot';
let AUTH_OK = false;                 // يتحكّم بردّ خادم المصادقة
const errors = [];
const IGNORE = /ServiceWorkerRegistration|net::ERR_FAILED|Failed to load resource|ERR_BLOCKED|reCAPTCHA|AppCheck/i;
page.on('pageerror', e => { const m = String(e.message).slice(0, 200); if (!IGNORE.test(m)) errors.push({ page: CURRENT, type: 'pageerror', msg: m }); });
page.on('console', m => { if (m.type() !== 'error') return; const t = String(m.text()).slice(0, 200); if (!IGNORE.test(t)) errors.push({ page: CURRENT, type: 'console', msg: t }); });

// مُعالِج شبكة واحد: يردّ على المصادقة، ويُجهض كل نداءٍ خارجيٍّ آخر (لا إنترنت).
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

L('\n══════════════════════════════════════════════════════');
L('  رحلة مستخدم في متصفّح حقيقي — ' + new Date().toISOString().slice(0, 16));
L('══════════════════════════════════════════════════════');

await page.goto('file://' + REPO + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);

/* ═════════ ١) الإقلاع وشاشة الدخول ═════════ */
L('\n=== ١) الإقلاع وشاشة الدخول ===');
check('التطبيق أقلع بلا خطأ جافاسكربت', errors.length === 0, errors[0]?.msg || '');
check('db مربوط بالمخزن الوهمي', await page.evaluate(() => typeof db !== 'undefined' && !!db && typeof db.runTransaction === 'function'));
check('شاشة تسجيل الدخول ظاهرة', await page.isVisible('#login-screen').catch(() => false));
const verTxt = (await page.textContent('#login-version-footer').catch(() => '')) || '';
const APPV = await page.evaluate(() => (typeof APP_VERSION === 'string' ? APP_VERSION : ''));
check('الإصدار في التذييل يطابق الثابت', !!APPV && verTxt.includes(APPV), verTxt.trim());
await page.screenshot({ path: `${SHOTS}/01-login.png` });

/* ═════════ ٢) رفض بيانات خاطئة ═════════ */
L('\n=== ٢) محاولة دخول خاطئة ===');
CURRENT = 'login';
await page.fill('#login-user', 'ghost'); await page.fill('#login-pass', 'wrong');
await page.click('.login-btn'); await page.waitForTimeout(1000);
check('★ بيانات خاطئة تُرفض برسالة واضحة', await page.isVisible('#login-error').catch(() => false),
  ((await page.textContent('#login-error').catch(() => '')) || '').trim().slice(0, 55));
check('★ لا يدخل النظام ببيانات خاطئة', await page.isVisible('#login-screen').catch(() => false));

/* ═════════ ٣) زرع بيانات ثم دخول صحيح ═════════ */
const seeded = await page.evaluate(() => {
  const PC = PURCHASES_COLLECTION(), INV = INVENTORY_COLLECTION(), LOG = INVENTORY_LOG_COLLECTION();
  const now = '2026-07-20T09:00:00.000Z';
  window.__store[PROJECTS_DOC] = { projects: [{ id: 'hail', name: 'مشروع حائل', desc: 'صيانة مبانٍ', icon: '' }] };
  window.__store[_meta('settings')] = {
    buildings: ['مبنى الإدارة', 'مبنى السكن أ', 'مبنى الورشة'],
    supervisors: ['أسامة السادات', 'أشرف عشري'],
    workTypes: { 'كهرباء': ['لمبة', 'قاطع'], 'سباكة': ['تسريب', 'صنبور'] }
  };
  window.__store[INV + '/itm-cable'] = { itemId: 'itm-cable', itemName: 'كابل نحاس 2.5', unit: 'متر', currentQty: 120, warehouseName: 'المستودع الرئيسي' };
  window.__store[INV + '/itm-lamp'] = { itemId: 'itm-lamp', itemName: 'لمبة LED 18w', unit: 'قطعة', currentQty: 40, warehouseName: 'المستودع الرئيسي' };
  window.__store[LOG + '/lg1'] = { type: 'in', itemId: 'itm-cable', qty: 120, itemName: 'كابل نحاس 2.5', unit: 'متر', date: now };
  const mk = (id, status, cost, vendor, extra) => Object.assign({
    id, status, building: 'مبنى الإدارة', projectId: 'hail', vendor, supervisor: 'أسامة السادات',
    itemName: 'كابل نحاس 2.5', qty: 10, unit: 'متر', createdAt: now, estCost: cost, actualCost: cost,
    items: [{ itemName: 'كابل نحاس 2.5', qty: 10, unit: 'متر', unitCost: 100, itemCost: 1150, vat: 150, rcvQty: 10 }]
  }, extra || {});
  window.__store[PC + '/PO-001'] = mk('PO-001', 'closed', 1150, 'مؤسسة النور', { auditedBy: 'أمين المستودع', receivedQty: 10 });
  window.__store[PC + '/PO-002'] = mk('PO-002', 'pending_pm', 800, 'شركة البناء');
  window.__store[PC + '/PO-003'] = mk('PO-003', 'wh_reviewed', 2300, 'مؤسسة النور');
  const T = 'hail_tickets';
  window.__store[T + '/TK-1'] = { id: 'TK-1', status: 'مفتوح', building: 'مبنى السكن أ', workType: 'كهرباء', desc: 'انقطاع إنارة', priority: 'عادي 🟢 (48 ساعة)', createdAt: now, supervisor: 'أسامة السادات' };
  window.__store[T + '/TK-2'] = { id: 'TK-2', status: 'مغلق', building: 'مبنى الورشة', workType: 'سباكة', desc: 'تسريب ماء', priority: 'عاجل 🔴 (4 ساعات)', createdAt: now, closedAt: '2026-07-20T11:00:00.000Z', supervisor: 'أشرف عشري' };
  return Object.keys(window.__store).length;
});
await page.evaluate(() => {
  /* نعدّ ما يُنزَّل فعلاً من مجموعة الشراء: عدّادُ البوّابة كان يجلبها كاملةً
     ليكتب رقماً. الفحصُ الصادق هنا **حمولةٌ صفر** لا نصُّ الشارة وحدَه. */
  window.__poReads = 0;
  const real = db.collection.bind(db);
  db.collection = function (c) {
    const q = real(c);
    if (!/purchases/i.test(c)) return q;
    const g = q.get.bind(q);
    q.get = function () { return g().then(sn => { window.__poReads += (sn.size || 0); return sn; }); };
    return q;
  };
});
L(`\n=== ٣) دخول صحيح (زُرع ${seeded} مستنداً) ===`);
AUTH_OK = true;
await page.fill('#login-user', 'admin'); await page.fill('#login-pass', 'Passw0rd!');
await page.click('.login-btn');
await page.waitForTimeout(4000);
check('★ الدخول نجح وتهيّأ المستخدم', await page.evaluate(() => !!(typeof currentUser !== 'undefined' && currentUser && currentUser.role)),
  await page.evaluate(() => { try { return currentUser.name + ' / ' + currentUser.role; } catch (e) { return ''; } }));
check('شاشة الدخول اختفت', !(await page.isVisible('#login-screen').catch(() => false)));

/* ═════════ ٤) بوّابة المشاريع ═════════ */
L('\n=== ٤) بوّابة اختيار المشروع ===');
CURRENT = 'project-screen';
check('★ شاشة المشاريع ظهرت بعد الدخول', await page.isVisible('#project-screen').catch(() => false));
const gridTxt = (await page.textContent('#project-grid').catch(() => '')) || '';
check('بطاقة المشروع المزروع معروضة', gridTxt.includes('مشروع حائل'), gridTxt.trim().slice(0, 50).replace(/\s+/g, ' '));
check('زر «المشتريات المركزية» ظاهر للمسؤول', await page.isVisible('#global-purchases-btn-wrap').catch(() => false));
/* عدّادُ طلبات الشراء يعمل بعد نصف ثانية من رسم البوّابة */
await page.waitForTimeout(1400);
const poBadge = (await page.textContent('#global-po-count-badge').catch(() => '') || '').trim();
const poReads = await page.evaluate(() => window.__poReads);
check('★★ عدّادُ طلبات الشراء يعرض الرقم الصحيح', /^3 طلب$/.test(poBadge), poBadge);
check('★★★ ولا يُنزِّل مستنداً واحداً ليكتبه (عدُّ خادمٍ لا جلبةُ مجموعة)',
  poReads === 0, poReads + ' مستنداً نُزّل من مجموعة الشراء');
/* وشبكةُ الأمان تُختبَر لا يُوعَد بها: نُغيّب `count` كما لو كانت نسخةُ SDK أقدم
   أو رُدّت القاعدةُ — فالعدّادُ يسقط إلى الطريقة القديمة **ولا يختفي الرقم**. */
const poFallback = await page.evaluate(async () => {
  const real = db.collection.bind(db);
  db.collection = function (c) {
    const q = real(c);
    if (/purchases/i.test(c)) q.count = undefined;   // كأنّ العدّ غيرُ مدعوم
    return q;
  };
  document.getElementById('global-po-count-badge').textContent = '—';
  loadGlobalPOCount();
  await new Promise(r => setTimeout(r, 900));
  return (document.getElementById('global-po-count-badge').textContent || '').trim();
});
check('★★★ وبلا دعم count يسقط إلى الطريقة القديمة — الرقمُ لا يختفي',
  /^3 طلب$/.test(poFallback), poFallback);
await page.screenshot({ path: `${SHOTS}/02-projects.png` });

// نقرٌ حقيقيّ على «إدارة المشتريات المركزية»
await page.click('#global-purchases-btn-wrap button');
await page.waitForTimeout(3000);
CURRENT = 'global-purchases';
const gp = await page.evaluate(() => ({
  poLen: typeof purchases !== 'undefined' ? purchases.length : -1,
  screenGone: !!(document.getElementById('project-screen') || {}).classList?.contains('hidden')
}));
check('★ دخول المشتريات المركزية حمّل الطلبات فعلاً', gp.poLen >= 3, gp.poLen + ' طلب');
check('شاشة المشاريع أُغلقت', gp.screenGone === true);
await page.screenshot({ path: `${SHOTS}/03-central-purchases.png` });

/* ═════════ ٥) تصفّح كلّ صفحة بالنقر الفعلي ═════════ */
L('\n=== ٥) تصفّح الصفحات (نقرٌ فعليٌّ على القائمة) ===');
const navItems = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('[onclick*="showPage("]').forEach(el => {
    const m = /showPage\(['"]([a-z0-9-]+)['"]\)/i.exec(el.getAttribute('onclick') || '');
    if (!m || out.some(x => x.id === m[1])) return;
    out.push({ id: m[1], label: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30) });
  });
  return out;
});
L('     ' + navItems.length + ' صفحة');

const results = [];
for (const nav of navItems) {
  CURRENT = nav.id;
  const before = errors.length;
  let clicked = false;
  try {
    // افتح مجموعة القائمة الحاوية (كما يفعل المستخدم) ثم انقر الزرّ
    await page.evaluate(id => {
      const el = document.querySelector(`[onclick*="showPage('${id}')"]`);
      if (!el) return;
      const g = el.closest('.nav-group,.sidebar-group,[id^="grp-"]');
      if (g) { g.style.display = ''; g.querySelectorAll('div,ul').forEach(b => { if (b.style.display === 'none') b.style.display = ''; }); }
      el.scrollIntoView({ block: 'center' });
    }, nav.id);
    const el = await page.$(`[onclick*="showPage('${nav.id}')"]`);
    if (el && await el.isVisible().catch(() => false)) { await el.click({ timeout: 2500 }); clicked = true; }
    else await page.evaluate(id => showPage(id), nav.id);
  } catch (e) {
    try { await page.evaluate(id => showPage(id), nav.id); } catch (_) { }
  }
  await page.waitForTimeout(600);
  const info = await page.evaluate(id => {
    const el = document.getElementById('page-' + id);
    if (!el) return { missing: true };
    const txt = (el.innerText || '').trim();
    return {
      missing: false, active: el.classList.contains('active'), textLen: txt.length,
      nodes: el.querySelectorAll('*').length, head: txt.slice(0, 55).replace(/\s+/g, ' '),
      spinner: /جارٍ التحميل|جاري التحميل/.test(txt)
    };
  }, nav.id);
  const ne = errors.slice(before);
  results.push({ ...nav, ...info, clicked, errs: ne.length, errMsg: ne[0]?.msg || '' });
}
let clickedCount = 0;
for (const r of results) {
  if (r.clicked) clickedCount++;
  const t = r.id + (r.clicked ? '' : ' ⌨');
  if (r.missing) { note(`«${r.id}» بلا حاوية page-${r.id}`); continue; }
  if (r.errs) { check(`«${t}» بلا أخطاء`, false, r.errMsg); continue; }
  if (!r.active) { note(`«${t}» لم تُفعَّل (قد تكون محجوبة بالصلاحية)`); continue; }
  if (r.spinner) { check(`«${t}» انتهى تحميلها`, false, 'عالقة على «جارٍ التحميل»'); continue; }
  if (r.textLen < 15 && r.nodes < 8) { check(`«${t}» عرضت محتوى`, false, `فارغة (${r.nodes} عنصر)`); continue; }
  check(`«${t}» فُتحت وعرضت محتوى`, true, `${r.nodes} عنصر · ${r.head}`);
}
// ملاحظة لا فحص: في «المشتريات المركزية» يُخفي النظام عمداً أقسامَ القائمة غير المتعلّقة
// بالمشتريات، فلا تُنقَر أزرارها — تُفتَح برمجياً (⌨). العدد المنقور يتبع الوضع الحالي.
L(`     (${clickedCount}/${results.length} فُتحت بنقرٍ فعليّ — الباقي أقسامٌ مخفيّة عمداً في وضع المشتريات المركزية)`);
check('★ كلّ الصفحات فُتحت وعرضت محتوى بلا خطأ', results.every(r => !r.missing && !r.errs && !r.spinner),
  `${results.length} صفحة`);

/* ═════════ ٦) تفاعلات حقيقية ═════════ */
L('\n=== ٦) تفاعلات المستخدم ===');
CURRENT = 'purchases';
await page.evaluate(() => showPage('purchases'));
await page.waitForTimeout(900);

const listTxt = await page.evaluate(() => (document.getElementById('page-purchases').innerText || ''));
check('أ) قائمة الطلبات تعرض الطلب PO-001', listTxt.includes('PO-001'));

const detail = await page.evaluate(async () => {
  try { openPurchaseDetail('PO-001'); } catch (e) { return 'خطأ: ' + e.message; }
  await new Promise(r => setTimeout(r, 600));
  const m = document.getElementById('modal-purchase-detail');
  if (!m || m.classList.contains('hidden')) return 'لم تُفتح';
  return (m.innerText || '').includes('PO-001') ? 'ok' : 'فُتحت بلا الرقم';
});
check('ب) ★ تفاصيل الطلب تُفتح وتعرض رقمه', detail === 'ok', detail);
await page.screenshot({ path: `${SHOTS}/06-po-detail.png` });
await page.evaluate(() => { try { closeModal('modal-purchase-detail'); } catch (e) { } });

const money = await page.evaluate(() => {
  const p = purchases.find(x => x.id === 'PO-001');
  return { closed: poIsClosed(p), actual: poActualCost(p), rcv: poReceivedQty(p) };
});
check('ج) ★ الطلب المغلق: تصنيفٌ صحيح وتكلفةٌ فعلية 1150', money.closed === true && money.actual === 1150,
  `مغلق=${money.closed} تكلفة=${money.actual} مستلَم=${money.rcv}`);

CURRENT = 'inventory';
const inv = await page.evaluate(async () => {
  showPage('inventory');
  await new Promise(r => setTimeout(r, 1000));
  const t = document.getElementById('page-inventory').innerText || '';
  return { cable: t.includes('كابل'), lamp: t.includes('لمبة'), n: typeof _inventoryItems !== 'undefined' ? _inventoryItems.length : -1 };
});
check('د) ★ المخزون يعرض الأصناف المزروعة', inv.cable && inv.lamp, `أصناف=${inv.n} كابل=${inv.cable} لمبة=${inv.lamp}`);
await page.screenshot({ path: `${SHOTS}/06-inventory.png` });

CURRENT = 'new-purchase';
const fields = await page.evaluate(async () => {
  showPage('new-purchase'); await new Promise(r => setTimeout(r, 800));
  const el = document.getElementById('page-new-purchase');
  return el ? el.querySelectorAll('input,select,textarea').length : 0;
});
check('هـ) نموذج «طلب شراء جديد» يعرض حقولاً', fields >= 5, fields + ' حقل');

CURRENT = 'dashboard';
const dash = await page.evaluate(async () => {
  showPage('dashboard'); await new Promise(r => setTimeout(r, 1100));
  const t = document.getElementById('page-dashboard').innerText || '';
  return { len: t.length, nums: (t.match(/\d+/g) || []).length };
});
check('و) لوحة المعلومات عرضت بيانات', dash.len > 50 && dash.nums > 3, `${dash.len} حرف · ${dash.nums} رقم`);
await page.screenshot({ path: `${SHOTS}/06-dashboard.png` });

/* ═════════ ٧) بطاقات «المالية — السداد» تفاعلية (v18.9ua) ═════════
   الوعدُ الذي يُفحَص هنا: **الرقمُ على البطاقة = عددُ الصفوف بعد نقرها**. لا يُفحَص
   في jsdom لأن التصفية تمرّ بالـDOM كلِّه (بطاقةٌ ← فلاترُ الصفحة ← ترقيمٌ ← قائمة).
   والطلباتُ تُكتب هنا لا في البذرة الأولى: مستمعو المحاكي أحياء فتصل اللقطةُ كما في
   Firestore — ولا تنحرف أرقامُ الفحوص السابقة. */
CURRENT = 'finance-card';
L('\n=== ٧) بطاقات المالية التفاعلية ===');
await page.evaluate(async () => {
  const PC = PURCHASES_COLLECTION();
  const base = (id, status, cost, extra) => Object.assign({
    id, status, building: 'مبنى الإدارة', projectId: 'hail', vendor: 'مؤسسة النور', supervisor: 'أسامة السادات',
    itemName: 'كابل نحاس 2.5', qty: 1, unit: 'متر', createdAt: '2026-07-20T09:00:00.000Z', estCost: cost, actualCost: cost,
    items: [{ itemName: 'كابل نحاس 2.5', qty: 1, unit: 'متر', unitCost: cost, itemCost: cost, rcvQty: 1 }],
    timeline: [{ code: 'pending_finance', at: '2026-07-21T09:00:00.000Z' }]
  }, extra || {});
  const put = (d) => db.collection(PC).doc(d.id).set(d);
  await put(base('PO-FIN-1', 'pending_finance', 1000, { payment: { installments: [{ amount: 400 }] } }));
  await put(base('PO-FIN-2', 'pending_finance', 2000, { projectId: 'riyadh' }));   // مشروعٌ آخر عمداً
  await put(base('PO-PAID-1', 'closed', 3000, { auditedBy: 'أمين', payment: { paid: true, paidAt: '2026-07-23T09:00:00.000Z' } }));
  await put(base('PO-PAID-2', 'closed', 4000, { auditedBy: 'أمين', payment: { paid: true } }));   // قديمٌ بلا طابع سداد
  showPage('purchases');
  await new Promise(r => setTimeout(r, 900));
});
const finChips = await page.evaluate(() => [...document.querySelectorAll('#po-finance-card .po-fin-chip')].map(b => b.innerText.replace(/\s+/g, ' ').trim()));
check('أ) بطاقات المالية أزرارٌ قابلة للنقر', finChips.length === 4, finChips.join(' | '));
const finRows = async (n) => page.evaluate(async (i) => {
  document.querySelectorAll('#po-finance-card .po-fin-chip')[i].click();
  await new Promise(r => setTimeout(r, 1200));
  return [...new Set(((document.getElementById('purchases-list') || {}).innerText || '').match(/PO-[A-Z0-9-]+/g) || [])].sort();
}, n);
const r1 = await finRows(0);
check('ب) ★ «بانتظار السداد» ⇐ المعلّقان وحدَهما (عبر المشاريع)',
  JSON.stringify(r1) === '["PO-FIN-1","PO-FIN-2"]', r1.join(','));
check('ج) العدّاد يقول على أيّ بطاقةٍ صُفّيت',
  ((await page.textContent('#po-count')) || '').includes('بطاقة المالية'), ((await page.textContent('#po-count')) || '').trim());
const r1b = await finRows(0);   // نقرٌ ثانٍ على البطاقة نفسِها
check('د) نقرُ البطاقة مرّتين يُلغي التصفية', r1b.length > 2, r1b.length + ' طلب');
const r2 = await finRows(1);
check('هـ) ★ «سُدّد (تراكمي)» ⇐ المسدَّدان بالكامل',
  JSON.stringify(r2) === '["PO-PAID-1","PO-PAID-2"]', r2.join(','));
const r3 = await finRows(2);
check('و) ★ «متوسط زمن السداد» ⇐ الداخلُ في المتوسّط وحدَه (لا القديمُ بلا طابع)',
  JSON.stringify(r3) === '["PO-PAID-1"]', r3.join(','));
const oldestOpened = await page.evaluate(async () => {
  document.querySelectorAll('#po-finance-card .po-fin-chip')[3].click();
  await new Promise(r => setTimeout(r, 900));
  const m = document.getElementById('modal-purchase-detail');
  if (!m || m.classList.contains('hidden')) return 'لم تُفتح';
  return /PO-FIN-[12]/.test(m.innerText || '') ? 'ok' : 'بلا رقم الطلب';
});
check('ز) ★ «أقدم طلب معلّق» يفتح الطلبَ الذي يقف خلف الرقم', oldestOpened === 'ok', oldestOpened);
await page.screenshot({ path: `${SHOTS}/07-finance-card.png` });
await page.evaluate(async () => { try { closeModal('modal-purchase-detail'); } catch (e) { } clearPOFilters(); await new Promise(r => setTimeout(r, 900)); });
check('ح) «مسح الفلاتر» يمسح فلتر البطاقة أيضاً',
  await page.evaluate(() => !window._poFinanceView));

CURRENT = 'logout';
const out = await page.evaluate(async () => {
  try { window.showConfirm = async () => true; logout(); } catch (e) { return 'خطأ: ' + e.message; }
  await new Promise(r => setTimeout(r, 1400));
  const ls = document.getElementById('login-screen');
  return ls && !ls.classList.contains('hidden') ? 'ok' : 'لم يعُد';
});
check('ز) ★ تسجيل الخروج يعيد لشاشة الدخول', out === 'ok', out);
await page.screenshot({ path: `${SHOTS}/07-logout.png` });

/* ═════════ الخلاصة ═════════ */
L('\n══════════════════════════════════════════════════════');
if (errors.length) {
  L(`  الأخطاء المرصودة (${errors.length}):`);
  const seen = new Set();
  errors.forEach(e => {
    const k = e.page + '|' + e.msg.slice(0, 70);
    if (seen.has(k)) return; seen.add(k);
    L(`   • [${e.page}] ${e.msg.slice(0, 140)}`);
  });
} else L('  ✨ لا أخطاء جافاسكربت في الرحلة كلّها');
L('══════════════════════════════════════════════════════');
L((fail === 0 ? '✅ ' : '❌ ') + `${pass}/${pass + fail} فحصاً ناجحاً` + (fail ? ` — ${fail} فشل` : '') + (warn ? ` · ${warn} تنبيه` : ''));
L('   اللقطات: ' + SHOTS);
L('══════════════════════════════════════════════════════\n');
await browser.close();
process.exit(fail ? 1 : 0);
