// فحصُ متصفّحٍ لوحدة التعاقدات — Chromium حقيقيّ + Firestore وهميّ في الذاكرة
// (نفسُ مُحاكي browser-scenarios.mjs — لا يلمس الإنتاج إطلاقاً).
//   node contracts-check.mjs
//
// المرحلة ١: سجلُّ الأطراف — منشآتٍ **وأشخاصاً** (التعاقدُ بالهوية لا بالسجل التجاري)
// المرحلة ٢: طلبُ التعاقد من المقايسة · دورةُ الاعتماد بأربع بوّابات · أمرُ الدفع دون العتبة — الحقنُ الذاتيُّ في القائمة، والدخولُ والنقرُ الفعليّان،
// و**الرقمُ المرسوم = الرقمُ المحسوب** (شريطُ الأرقام مقابل الدوالّ النقية)، والتطبيعُ
// العربيُّ في البحث، وشرائطُ الحالة من توكنز SLA، والثيمُ الداكن، والجوّالُ بلا قصّ.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const REPO = process.env.REPO_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname));
const SHOTS = process.env.SHOTS_DIR || '/tmp/ct-shots';
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
const check = (n, ok, d) => { if (ok) { pass++; console.log('  ✅', n, d ? '— ' + d : ''); } else { fail++; console.log('  ❌', n, d ? '— ' + d : ''); } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
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

check('الوحدة حُمِّلت وعرَّضت window.contracts', await page.evaluate(() => !!window.contracts));

// زرعُ أطرافٍ بحالات وثائقَ مختلفة + مشروع
await page.evaluate(() => {
  window.__store[PROJECTS_DOC] = { projects: [{ id: 'hail', name: 'مشروع حائل', desc: 'صيانة مبانٍ', icon: '' }] };
  const V = 'global_vendors';
  window.__store[V + '/VND-0001'] = {
    name: 'مؤسسة الأنوار للمقاولات', kind: 'subcontractor', status: 'active',
    legal: { crNumber: '1010234567', vatNumber: '300012345600003', nationalAddress: 'حائل — حي النقرة' },
    bank: { iban: 'SA0380000000608010167519', bankName: 'الأهلي' },
    docs: [{ type: 'cr', number: '1010234567', expiry: '2027-05-01' }, { type: 'vat', number: '3000123456', expiry: '2027-01-15' },
           { type: 'gosi', number: 'G-99', expiry: '2026-08-25' }],
    contacts: [{ name: 'خالد العتيبي', role: 'مدير المشاريع', phone: '0555000111' }]
  };
  window.__store[V + '/VND-0002'] = {
    name: 'شركة البناء الحديث', kind: 'both', status: 'active',
    legal: { crNumber: '4030998877' },
    docs: [{ type: 'cr', number: '4030998877', expiry: '2026-07-01' }, { type: 'zakat', number: 'Z-12', expiry: '2028-01-01' }]
  };
  window.__store[V + '/VND-0003'] = {
    name: 'مؤسسة الإتقان للتوريدات', kind: 'supplier', status: 'suspended', statusReason: 'تأخّر متكرّر في التوريد',
    legal: { crNumber: '1010777888' },
    docs: [{ type: 'cr', number: '1010777888', expiry: '2029-03-10' }]
  };
  window.__store[V + '/VND-0004'] = {
    name: 'ورشة الحرفي للألوميتال', entityType: 'establishment', kind: 'subcontractor', status: 'active',
    legal: { crNumber: '1128456' }, docs: []
  };
  // ── أشخاصٌ طبيعيّون: التعاقدُ بالهوية/الإقامة، بلا سجلٍّ تجاريٍّ ولا ضريبة ──
  window.__store[V + '/VND-0005'] = {
    name: 'محمد أحمد الغامدي', entityType: 'individual', kind: 'subcontractor', status: 'active',
    legal: { idType: 'national', idNumber: '1045667788', idExpiry: '2029-02-11', nationality: 'سعودي' },
    bank: { iban: 'SA4420000001234567891234', bankName: 'الراجحي', holder: 'محمد أحمد الغامدي' },
    docs: [{ type: 'profCert', number: 'PC-77', expiry: '2027-06-01' }]
  };
  window.__store[V + '/VND-0006'] = {
    name: 'راجو كومار', entityType: 'individual', kind: 'subcontractor', status: 'active',
    legal: { idType: 'iqama', idNumber: '2398112233', idExpiry: '2026-08-20', nationality: 'هندي' },
    docs: [{ type: 'workPermit', number: 'WP-441', expiry: '2026-08-20' }]
  };
});

AUTH_OK = true;
await page.fill('#login-user', 'admin'); await page.fill('#login-pass', 'Passw0rd!');
await page.click('.login-btn');
await page.waitForTimeout(4000);
check('الدخول نجح', await page.evaluate(() => !!(typeof currentUser !== 'undefined' && currentUser && currentUser.role)));

await page.click('#global-purchases-btn-wrap button');
await page.waitForTimeout(2500);

// مجموعة القائمة الجانبية
check('مجموعة «التعاقدات» حُقنت في القائمة الجانبية', await page.evaluate(() => !!document.getElementById('hdr-grp-contracts')));
check('زرّ «سجل الأطراف» موجود', await page.evaluate(() => !!document.getElementById('nav-vendors-btn')));

// نقرٌ فعليّ
await page.click('#hdr-grp-contracts');
await page.waitForTimeout(400);
await page.click('#nav-vendors-btn');
await page.waitForTimeout(1800);

check('صفحة سجل الأطراف صارت النشطة', await page.evaluate(() => {
  const p = document.getElementById('page-vendors'); return !!p && p.classList.contains('active');
}));

const listTxt = await page.textContent('#page-vendors').catch(() => '');
check('الأطراف الستة معروضة (منشآتٌ وأشخاص)',
  ['الأنوار', 'البناء الحديث', 'الإتقان', 'الحرفي', 'محمد أحمد الغامدي', 'راجو كومار'].every(n => listTxt.includes(n)));
check('★ الشخصُ يُعرَض برقم هويته لا بسجلٍّ تجاريّ', listTxt.includes('1045667788'));
const stats = await page.evaluate(() => Array.from(document.querySelectorAll('#page-vendors .ct-stat')).map(e => e.textContent.replace(/\s+/g, ' ').trim()));
check('شريط الأرقام يعرض العدّ والوثائق', stats.length === 3, stats.join(' | '));

// حسابُ ما نتوقّعه من الدوال النقية ومقارنتُه بالمرسوم — الرقم المرسوم = المحسوب
const expected = await page.evaluate(() => {
  const vs = window.contracts.vendors(), today = new Date();
  let expired = 0, soon = 0;
  vs.forEach(v => { const c = window.contracts._vendorComplianceState(v, today); expired += c.expired ? 1 : 0; soon += (!c.expired && c.soon) ? 1 : 0; });
  return { n: vs.length, expired, soon };
});
const drawn = await page.evaluate(() => Array.from(document.querySelectorAll('#page-vendors .ct-stat .v')).map(e => Number(e.textContent.trim())));
check('★ الرقم المرسوم = الرقم المحسوب (أطراف/منتهية/توشك)',
  drawn[0] === expected.n && drawn[1] === expected.expired && drawn[2] === expected.soon,
  `مرسوم ${drawn.join('/')} · محسوب ${expected.n}/${expected.expired}/${expected.soon}`);

// ── الشخصُ الطبيعيّ: كلُّ الفروق الثلاثة على الشاشة ──
await page.evaluate(() => window.contracts.openVendor('VND-0006'));
await page.waitForTimeout(900);
const indivTxt = await page.textContent('#page-vendors').catch(() => '');
check('★ بطاقةُ الشخص تعرض «إقامة» لا «السجل التجاري»',
  indivTxt.includes('إقامة') && !indivTxt.includes('السجل التجاري'));
check('★ وتعرض الجنسية بدل الرقم الضريبي',
  indivTxt.includes('الجنسية') && indivTxt.includes('هندي') && !indivTxt.includes('الرقم الضريبي'));
check('★ ووضعُ الضريبة المقترَح «بلا ضريبة»', indivTxt.includes('بلا ضريبة'));
check('★ وإقامتُه الموشكةُ على الانتهاء تُنبَّه', /توشك|تنتهي بعد/.test(indivTxt));
await page.screenshot({ path: `${SHOTS}/07-individual-card.png`, fullPage: true });

// نموذجُ الشخص: حقولُ الهوية حاضرةٌ وحقولُ المنشأة غائبة
await page.evaluate(() => window.contracts.editVendor());
await page.waitForTimeout(800);
const f = await page.evaluate(() => ({
  idnum: !!document.getElementById('ct-f-idnum'), idexp: !!document.getElementById('ct-f-idexp'),
  nat: !!document.getElementById('ct-f-nat'), cr: !!document.getElementById('ct-f-cr'),
  vat: !!document.getElementById('ct-f-vat'), holder: !!document.getElementById('ct-f-holder')
}));
check('★ نموذجُ الشخص: هويةٌ وانتهاءٌ وجنسيةٌ حاضرة، وسجلٌّ ورقمٌ ضريبيٌّ غائبان',
  f.idnum && f.idexp && f.nat && !f.cr && !f.vat, JSON.stringify(f));
check('حقلُ «اسم صاحب الحساب» حاضرٌ للشخص', f.holder);
await page.screenshot({ path: `${SHOTS}/08-individual-edit.png`, fullPage: true });

// تبديلُ الصفة يبدّل الحقول ولا يمحو ما كُتب
await page.evaluate(() => window.contracts.setEntity('establishment'));
await page.waitForTimeout(700);
const g = await page.evaluate(() => ({ cr: !!document.getElementById('ct-f-cr'), idnum: !!document.getElementById('ct-f-idnum') }));
check('★ تبديلُ الصفة إلى «منشأة» يُظهر السجل التجاري ويُخفي الهوية', g.cr && !g.idnum);
const kept = await page.evaluate(() => { window.contracts.setEntity('individual'); return null; });
await page.waitForTimeout(700);
check('★ والرجوعُ لصفة «شخص» يحتفظ برقم هويته (لا يُمحى بتبديلٍ عابر)',
  await page.evaluate(() => (document.getElementById('ct-f-idnum') || {}).value === '2398112233'));
await page.evaluate(() => window.contracts.cancelVendorEdit());
await page.evaluate(() => window.contracts.backToVendors());
await page.waitForTimeout(700);

// مرشّحُ الصفة
await page.evaluate(() => window.contracts.filterVendors('entity', 'individual'));
await page.waitForTimeout(700);
check('★ مرشّحُ «شخص» يعرض الشخصين وحدهما',
  await page.evaluate(() => document.querySelectorAll('#page-vendors .ct-tile').length) === 2);
await page.evaluate(() => window.contracts.filterVendors('entity', ''));
await page.waitForTimeout(600);

const rails = await page.evaluate(() => Array.from(document.querySelectorAll('#page-vendors .ct-tile')).map(e => e.style.getPropertyValue('--rail')));
check('شرائط الحالة مضبوطة على توكنز SLA', rails.every(r => /var\(--sla-|var\(--muted\)/.test(r)), rails.join(' '));

await page.screenshot({ path: `${SHOTS}/01-vendors-list.png`, fullPage: true });

// البحث
await page.fill('#ct-v-q', 'الانوار');   // بلا همزة — اختبارُ التطبيع
await page.waitForTimeout(700);
const filtered = await page.evaluate(() => document.querySelectorAll('#page-vendors .ct-tile').length);
check('★ البحث يطابق رغم اختلاف الهمزة (تطبيع عربي)', filtered === 1, filtered + ' نتيجة');
await page.fill('#ct-v-q', '');
await page.waitForTimeout(600);

// فتحُ بطاقة طرف
await page.evaluate(() => window.contracts.openVendor('VND-0001'));
await page.waitForTimeout(1000);
const cardTxt = await page.textContent('#page-vendors').catch(() => '');
check('بطاقة الطرف فُتحت بوثائقها', cardTxt.includes('الوثائق وسريانها') && cardTxt.includes('البيانات البنكية'));
check('الآيبان ظاهرٌ كاملاً للأدمن', cardTxt.includes('SA0380000000608010167519'));
await page.screenshot({ path: `${SHOTS}/02-vendor-card.png`, fullPage: true });

// وضعُ التحرير
await page.evaluate(() => window.contracts.editVendor());
await page.waitForTimeout(900);
check('نموذج التحرير ظهر', await page.evaluate(() => !!document.getElementById('ct-f-name')));
await page.screenshot({ path: `${SHOTS}/03-vendor-edit.png`, fullPage: true });

// الوضع الداكن
await page.evaluate(() => window.contracts.cancelVendorEdit());
await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
await page.waitForTimeout(700);
await page.screenshot({ path: `${SHOTS}/04-vendor-card-dark.png`, fullPage: true });
await page.evaluate(() => window.contracts.backToVendors());
await page.waitForTimeout(600);
await page.screenshot({ path: `${SHOTS}/05-vendors-list-dark.png`, fullPage: true });
await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); });

// الجوال
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('★ لا تمرير أفقي على الجوال', overflow <= 1, 'زيادة ' + overflow + 'px');
await page.screenshot({ path: `${SHOTS}/06-vendors-mobile.png`, fullPage: true });


/* ═════════ المرحلة ٢: طلبُ التعاقد ودورتُه ═════════ */
console.log('\n=== المرحلة ٢: طلبُ التعاقد ودورةُ الاعتماد ===');
await page.setViewportSize({ width: 1440, height: 980 });

// مقايسةٌ وموازنةٌ للمشروع المزروع
await page.evaluate(() => {
  window.__store['meta/hail_boq'] = { items: [
    { id: 'b1', desc: 'محارة داخلية', categoryKey: 'plaster',       unit: 'م٢', qty: 1200, unitPrice: 28 },
    { id: 'b2', desc: 'دهانات',       categoryKey: 'finishes',      unit: 'م٢', qty: 1200, unitPrice: 19 },
    { id: 'b3', desc: 'سيراميك',      categoryKey: 'finishes',      unit: 'م٢', qty: 400,  unitPrice: 95 }
  ]};
  window.__store['meta/hail_budget'] = { categories: [
    { key: 'plaster',  name: 'محارة/بياض', planned: 18000 },
    { key: 'finishes', name: 'تشطيبات',    planned: 90000 }
  ]};
});

await page.click('#nav-contract-reqs-btn');
await page.waitForTimeout(1500);
check('صفحة طلبات التعاقد صارت النشطة', await page.evaluate(() => {
  const p = document.getElementById('page-contract-requests'); return !!p && p.classList.contains('active');
}));
check('الشاشةُ الفارغةُ تدعو للإنشاء', ((await page.textContent('#page-contract-requests')) || '').includes('لا طلبات تعاقد بعد'));

await page.click('button:has-text("طلب تعاقد جديد")');
await page.waitForTimeout(1500);
check('نموذجُ الطلب فُتح ببنود المقايسة',
  ((await page.textContent('#page-contract-requests')) || '').includes('محارة داخلية'));

// اختيارُ بندٍ من المقايسة ⇒ يرث كميتَه وسعرَه
await page.evaluate(() => { window.contracts.toggleBoqLine(0); });
await page.waitForTimeout(700);
const inherited = await page.evaluate(() => {
  const d = window.contracts._draft(); return d ? { n: d.lines.length, qty: d.lines[0].qty, up: d.lines[0].unitPrice, cat: d.lines[0].budgetCategoryKey } : null;
});
check('★ البندُ المختار ورث الكميةَ وسعرَ الوحدة وبندَ الموازنة',
  inherited && inherited.n === 1 && inherited.qty === 1200 && inherited.up === 28 && inherited.cat === 'plaster',
  JSON.stringify(inherited));

// الطرفُ شخصٌ ⇒ الضريبةُ تُقترَح none تلقائياً
await page.evaluate(() => { window.contracts.setReqVendor('VND-0005'); });
await page.waitForTimeout(700);
check('★ اختيارُ شخصٍ يضبط وضعَ الضريبة على «بلا ضريبة» تلقائياً',
  await page.evaluate(() => window.contracts._draft().vatMode === 'none'));

// الإجمالي المرسوم = المحسوب
const totals = await page.evaluate(() => {
  const d = window.contracts._draft();
  const calc = window.contracts._linesTotal(d.lines, d.vatMode);
  const drawn = Array.from(document.querySelectorAll('#ct-r-total .ct-tl .v')).map(e => e.textContent.trim());
  return { calc, drawn };
});
check('★ الإجمالي المرسوم = المحسوب (بلا ضريبة ⇒ الأساس = الإجمالي)',
  totals.calc.total === 33600 && totals.calc.vat === 0 && totals.drawn[2].replace(/,/g, '') === '33600.00',
  JSON.stringify(totals.drawn));

// تحذيرُ تجاوز الموازنة (18,000 مخطّطة مقابل 33,600)
check('★ تجاوزُ بند الموازنة يُحذَّر منه ولا يمنع',
  ((await page.textContent('#page-contract-requests')) || '').includes('تجاوزٌ يُسجَّل ولا يمنع'));

// أمرُ الدفع مقفلٌ فوق العتبة
check('★ أمرُ الدفع مقفلٌ فوق ٣٠٠٠ بنصٍّ يشرح السبب',
  await page.evaluate(() => {
    const off = document.querySelector('#page-contract-requests .ct-pick.off');
    return !!off && off.textContent.includes('لا يجوز فوق');
  }));

// إشعارُ بوّابة التنفيذي
check('القيمةُ فوق سقف التنفيذي تُعلَن مسبقاً',
  ((await page.textContent('#page-contract-requests')) || '').includes('سيمرّ الطلب عليه'));

await page.fill('#ct-r-title', 'محارة وبياض الدور الأول');
// الصفحةُ تُمرَّر داخل `.main-area` لا في نافذة المتصفّح، فـfullPage لا يلتقط ما تحتها.
const secs = await page.evaluate(() => Array.from(document.querySelectorAll('#page-contract-requests .ct-sec-h')).map(e => e.textContent.trim().split(' ')[0]));
check('★ أقسامُ النموذج الخمسة مرسومة (الشروطُ التجارية والمرشّحون تحت الطيّة)',
  secs.length === 5 && secs.includes('الشروط') && secs.includes('المرشّحون'), secs.join(' · '));
await page.screenshot({ path: `${SHOTS}/09-request-form-top.png` });
await page.evaluate(() => { const a = document.querySelector('.main-area'); if (a) a.scrollTop = a.scrollHeight; });
await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOTS}/09b-request-form-bottom.png` });
await page.evaluate(() => { const a = document.querySelector('.main-area'); if (a) a.scrollTop = 0; });

await page.evaluate(() => window.contracts.submitRequest());
await page.waitForTimeout(2000);
const reqId = await page.evaluate(() => (window.contracts.requests()[0] || {}).id || '');
check('★ أُنشئ الطلب وبدأ عند مدير المشاريع',
  await page.evaluate(() => (window.contracts.requests()[0] || {}).status === 'crq_pending_pm'), reqId);
check('السجلُّ الزمنيُّ سجّل الإنشاء',
  await page.evaluate(() => ((window.contracts.requests()[0] || {}).timeline || []).length === 1));
await page.screenshot({ path: `${SHOTS}/10-request-card.png`, fullPage: true });

// دورةُ الاعتماد الكاملة — أربعُ بوّابات (المستخدمُ أدمن فيملكها كلَّها)
const stages = [];
for (let i = 0; i < 4; i++) {
  const st = await page.evaluate(async (id) => {
    await window.contracts._act(id, 'approve', 'موافق');
    return (window.contracts.requestById(id) || {}).status;
  }, reqId);
  stages.push(st);
}
check('★ الطلبُ عبَر البوّابات الأربع بالترتيب ⇐ معتمَد',
  stages.join(' → ') === 'crq_pending_proc → crq_pending_finance → crq_pending_ceo → crq_approved',
  stages.join(' → '));
await page.waitForTimeout(800);
await page.evaluate(() => window.contracts.openReq(window.contracts.requests()[0].id));
await page.waitForTimeout(800);
check('بطاقةُ الطلب تعرض «جاهزٌ لإنشاء العقد»',
  ((await page.textContent('#page-contract-requests')) || '').includes('جاهزٌ لإنشاء العقد'));
await page.screenshot({ path: `${SHOTS}/11-request-approved.png`, fullPage: true });

// أمرُ دفعٍ صغير: يتخطّى المشتريات والمالية ⇒ سدادٌ مباشرةً بعد مدير المشاريع
const payStages = await page.evaluate(async () => {
  const d = {
    engagement: 'pay_order', projectId: 'hail', title: 'ترميم بابٍ واحد', vendorId: 'VND-0006',
    vendorName: 'راجو كومار', vatMode: 'none', budgetCategoryKey: 'subcontractor',
    lines: [{ id: 'x', desc: 'ترميم باب', unit: 'عدد', qty: 1, unitPrice: 1500 }],
    candidates: [], advance: {}, retention: {}, penalty: {}, warranty: {}
  };
  const id = await window.contracts._create(d);
  const out = [window.contracts.requestById(id).status];
  await window.contracts._act(id, 'approve', '');
  out.push(window.contracts.requestById(id).status);
  return { id, out };
});
check('★ أمرُ دفعٍ بـ١٥٠٠: مدير المشاريع ⇐ سدادُ المالية مباشرةً (بلا مشتريات ولا اعتمادِ مالية)',
  payStages.out.join(' → ') === 'crq_pending_pm → crq_pending_pay', payStages.out.join(' → '));

// السدادُ يُرفض بلا إيصال
const noReceipt = await page.evaluate(async (id) => {
  try { await window.contracts._pay(id, { amount: 1500 }); return 'مرّ بلا إيصال'; }
  catch (e) { return e.message; }
}, payStages.id);
check('★ السدادُ يُرفض بلا إيصال', /إيصال/.test(noReceipt), noReceipt);

// وبوّابةٌ ليست لدورك تُرفض في طبقة البيانات لا على الزرّ
const wrongGate = await page.evaluate(async (id) => {
  const real = currentUser.role;
  currentUser.role = 'warehouse_manager';
  let msg;
  try { await window.contracts._act(id, 'approve', ''); msg = 'مرّ بدورٍ لا يملكها'; }
  catch (e) { msg = e.message; }
  currentUser.role = real;
  return msg;
}, payStages.id);
check('★ دورٌ لا يملك البوّابة يُرفض في طبقة البيانات', /ليست لدورك/.test(wrongGate), wrongGate);

await page.evaluate(() => window.contracts.backToReqs());
await page.waitForTimeout(900);
check('القائمةُ تعرض الطلبين وشريطَ «بانتظار دورك»',
  await page.evaluate(() => document.querySelectorAll('#page-contract-requests .ct-tile').length) === 2);
await page.screenshot({ path: `${SHOTS}/12-requests-list.png`, fullPage: true });

await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
await page.waitForTimeout(600);
await page.screenshot({ path: `${SHOTS}/13-requests-dark.png`, fullPage: true });
await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); });

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
const ov2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('★ صفحةُ الطلبات بلا تمريرٍ أفقيٍّ على الجوال', ov2 <= 1, 'زيادة ' + ov2 + 'px');
await page.screenshot({ path: `${SHOTS}/14-requests-mobile.png`, fullPage: true });

check('لا أخطاء جافاسكربت طوال الرحلة', errors.length === 0, errors.slice(0, 2).join(' | '));

console.log('\n' + '═'.repeat(58));
console.log(fail ? `❌ ${fail} فشلت من ${pass + fail}` : `✅ ${pass}/${pass} — فحص وحدة التعاقدات نجح`);
console.log('═'.repeat(58) + '\n');
await browser.close();
process.exit(fail ? 1 : 0);
