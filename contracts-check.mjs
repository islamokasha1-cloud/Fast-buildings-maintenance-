// فحصُ متصفّحٍ لوحدة التعاقدات — Chromium حقيقيّ + Firestore وهميّ في الذاكرة
// (نفسُ مُحاكي browser-scenarios.mjs — لا يلمس الإنتاج إطلاقاً).
//   node contracts-check.mjs
//
// المرحلة ١: سجلُّ الأطراف — منشآتٍ **وأشخاصاً** (التعاقدُ بالهوية لا بالسجل التجاري)
// المرحلة ٢: طلبُ التعاقد من المقايسة · دورةُ الاعتماد بأربع بوّابات · أمرُ الدفع دون العتبة
// المرحلة ٣: التحويلُ لعقدٍ ساري بمعاملةٍ واحدة (بحارس عدم التكرار) · بطاقةُ العقد وانتقالاتُه
// المرحلة ٤: المستخلصُ التراكميُّ بحرّاسه الثلاثة · سُلَّمُ الخصومات · الاعتمادُ والسدادُ بإيصال
// الوثيقةُ التعاقدية: شروطٌ نصّيةٌ منسوخةٌ ومتولّدة · حالةُ توقيعٍ قبل السريان · مخرَجٌ ورقيّ
// المرحلة ٥: خانتا «قيدَ الاعتماد» و«متعاقَدٌ عليه» في موازنة المشروع · منعُ الازدواج — الحقنُ الذاتيُّ في القائمة، والدخولُ والنقرُ الفعليّان،
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
  /* ══ تواريخُ الوثائق **نسبيةٌ لليوم** لا محفورة ══
     حالةُ الوثيقة (سارية · توشك · منتهية) دالّةٌ في «اليوم»، فتاريخٌ محفورٌ في القالب
     يجعل الفحصَ يمرّ اليوم ويسقط بعد أسبوعين لأن الإقامةَ انتهت **في الواقع** لا لأن
     الكودَ ارتدّ — وذلك ليس فحصاً بل قنبلةٌ موقوتة. (وقع مثلُها في
     `perf-contract-check`: توقُّعٌ محفورٌ بيومٍ ثابتٍ أسقط الفحصَ من نفسه.)
     الإزاحاتُ مقصودةٌ بأسمائها: سالبٌ = منتهية · ≤٣٠ = توشك (DOC_SOON_DAYS) · أكبرُ = سارية. */
  const _dayOff = n => new Date(Date.now() + n*86400000).toISOString().slice(0, 10);
  window.__store[V + '/VND-0001'] = {
    name: 'مؤسسة الأنوار للمقاولات', kind: 'subcontractor', status: 'active',
    legal: { crNumber: '1010234567', vatNumber: '300012345600003', nationalAddress: 'حائل — حي النقرة' },
    bank: { iban: 'SA0380000000608010167519', bankName: 'الأهلي' },
    docs: [{ type: 'cr', number: '1010234567', expiry: _dayOff(265) }, { type: 'vat', number: '3000123456', expiry: _dayOff(160) },
           { type: 'gosi', number: 'G-99', expiry: _dayOff(16) }], // ⇐ توشك
    contacts: [{ name: 'خالد العتيبي', role: 'مدير المشاريع', phone: '0555000111' }]
  };
  window.__store[V + '/VND-0002'] = {
    name: 'شركة البناء الحديث', kind: 'both', status: 'active',
    legal: { crNumber: '4030998877' },
    docs: [{ type: 'cr', number: '4030998877', expiry: _dayOff(-39) }, // ⇐ منتهية
           { type: 'zakat', number: 'Z-12', expiry: _dayOff(510) }]
  };
  window.__store[V + '/VND-0003'] = {
    name: 'مؤسسة الإتقان للتوريدات', kind: 'supplier', status: 'suspended', statusReason: 'تأخّر متكرّر في التوريد',
    legal: { crNumber: '1010777888' },
    docs: [{ type: 'cr', number: '1010777888', expiry: _dayOff(940) }]
  };
  window.__store[V + '/VND-0004'] = {
    name: 'ورشة الحرفي للألوميتال', entityType: 'establishment', kind: 'subcontractor', status: 'active',
    legal: { crNumber: '1128456' }, docs: []
  };
  // ── أشخاصٌ طبيعيّون: التعاقدُ بالهوية/الإقامة، بلا سجلٍّ تجاريٍّ ولا ضريبة ──
  window.__store[V + '/VND-0005'] = {
    name: 'محمد أحمد الغامدي', entityType: 'individual', kind: 'subcontractor', status: 'active',
    legal: { idType: 'national', idNumber: '1045667788', idExpiry: _dayOff(915), nationality: 'سعودي' },
    bank: { iban: 'SA4420000001234567891234', bankName: 'الراجحي', holder: 'محمد أحمد الغامدي' },
    docs: [{ type: 'profCert', number: 'PC-77', expiry: _dayOff(295) }]
  };
  window.__store[V + '/VND-0006'] = {
    name: 'راجو كومار', entityType: 'individual', kind: 'subcontractor', status: 'active',
    // إقامةٌ **توشك** (١١ يوماً) — هي مادّةُ فحص «وإقامتُه الموشكةُ على الانتهاء تُنبَّه»
    legal: { idType: 'iqama', idNumber: '2398112233', idExpiry: _dayOff(11), nationality: 'هندي' },
    docs: [{ type: 'workPermit', number: 'WP-441', expiry: _dayOff(11) }]
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

// شروطٌ تجاريةٌ حقيقيةٌ تُملأ في النموذج — لتُتابَع حتى الإفراج عن المحتجز في العقد
await page.fill('#ct-r-adv', '10');
await page.fill('#ct-r-advrec', '20');
await page.fill('#ct-r-ret', '5');
// الغرامةُ صارت بالريال: ٥٠٠ في اليوم بسقف ٢٠٬٠٠٠ (كانت ٠٫١٪ بسقف ١٠٪)
await page.fill('#ct-r-pen', '500');
await page.fill('#ct-r-pencap', '20000');
await page.fill('#ct-r-warr', '12');
await page.waitForTimeout(400);

await page.evaluate(() => window.contracts.submitRequest());
await page.waitForTimeout(2000);
const reqId = await page.evaluate(() => (window.contracts.requests()[0] || {}).id || '');
check('★ أُنشئ الطلب وبدأ عند مدير المشاريع',
  await page.evaluate(() => (window.contracts.requests()[0] || {}).status === 'crq_pending_pm'), reqId);
check('السجلُّ الزمنيُّ سجّل الإنشاء',
  await page.evaluate(() => ((window.contracts.requests()[0] || {}).timeline || []).length === 1));

/* ★★ بلاغُ المالك: «عند إنشاء طلب تعاقد يكرّر مرتين» — بطاقتان بالمعرّف نفسِه.
   الجذرُ ليس إرسالاً مكرّراً (لاختلف المعرّفان) بل **تعويضُ الكمون**: لقطةُ المستمع
   تصل قبل أن يُحلَّ وعدُ set()، فالإضافةُ اليدويةُ بعده نسخةٌ ثانية. الفحصُ يعدّ
   الوثيقةَ في الذاكرة **وفي الشاشة** — فلا يمرّ ارتدادٌ يظهر في إحداهما دون الأخرى. */
await page.evaluate(() => window.contracts.backToReqs());
await page.waitForTimeout(600);
const dupChk = await page.evaluate((id) => ({
  inMemory: window.contracts.requests().filter(r => r.id === id).length,
  inStore: Object.keys(window.__store).filter(k => k.endsWith('/' + id)).length,
  tiles: Array.from(document.querySelectorAll('#page-contract-requests .ct-tile'))
    .filter(el => (el.textContent || '').includes(id)).length
}), reqId);
check('★★ الطلبُ المُنشأ مرّةً لا يتكرّر في الذاكرة (تعويضُ الكمون لا يخلق نسخةً ثانية)',
  dupChk.inMemory === 1 && dupChk.inStore === 1, JSON.stringify(dupChk));
check('★★ ولا بطاقتان له في الشاشة (وهو ما رآه المالك)',
  dupChk.tiles === 1, JSON.stringify(dupChk));
await page.evaluate((id) => window.contracts.openReq(id), reqId);
await page.waitForTimeout(600);
await page.screenshot({ path: `${SHOTS}/10-request-card.png`, fullPage: true });

/* ★★ طلبُ المالك: «احتاج يظهر زر يفتح تفاصيل الطرف».
   الاسمُ وحدَه نصٌّ ميت — والمعتمِدُ يقرّر على طرفٍ لا يرى وثائقَه ولا حالتَه.
   الفحصُ **يضغط الزرَّ** ويتحقّق أنّ سجلَّ الطرف نفسِه فُتح: صفحةُ الأطراف نشطةٌ
   وبطاقةُ هذا الطرف معروضةٌ (لا قائمتُهم) — لا وجودَ الزرِّ في الترميز فحسب. */
const vBtnCount = await page.evaluate(() =>
  document.querySelectorAll('#page-contract-requests .ct-vbtn').length);
check('★★ بطاقةُ الطلب فيها زرُّ «تفاصيل الطرف»', vBtnCount === 1, 'عدد=' + vBtnCount);
await page.click('#page-contract-requests .ct-vbtn');
await page.waitForTimeout(1200);
const vOpened = await page.evaluate(() => {
  const p = document.getElementById('page-vendors');
  return { active: !!p && p.classList.contains('active'), txt: (p && p.textContent) || '' };
});
check('★★ والزرُّ يفتح **بطاقةَ** الطرف نفسِه لا قائمةَ الأطراف',
  vOpened.active && vOpened.txt.includes('محمد أحمد الغامدي') &&
  vOpened.txt.includes('كل الأطراف') && !vOpened.txt.includes('تعذّر العثور على الطرف'),
  'نشطة=' + vOpened.active);
await page.screenshot({ path: `${SHOTS}/10b-vendor-from-request.png`, fullPage: true });
await page.evaluate((id) => { window.contracts.backToVendors(); window.contracts.openReqFrom(id); }, reqId);
await page.waitForTimeout(900);

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

// أمرُ دفعٍ صغير: مديرُ المشاريع ← المشتريات ← سدادُ المالية (بلا بوّابةِ اعتمادٍ ماليّ)
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
  await window.contracts._act(id, 'approve', '');
  out.push(window.contracts.requestById(id).status);
  return { id, out };
});
check('★★ أمرُ دفعٍ بـ١٥٠٠: مدير المشاريع ⇐ المشتريات ⇐ سدادُ المالية',
  payStages.out.join(' → ') === 'crq_pending_pm → crq_pending_proc → crq_pending_pay',
  payStages.out.join(' → '));

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

/* ── تعديلُ بنود الطلب — للأدمن (طلبُ المالك) ──
   العهدُ الأصليُّ «وقّع المعتمِدُ على رقمٍ وسُدِّد غيرُه» يبقى: الفحصُ يتحقّق أن
   القيمةَ الجديدةَ **أبطلت** اعتمادَ المالية والتنفيذيِّ فعاد الطلبُ إلى بوّابتهما،
   وأن اعتمادَ مدير المشاريع والمشتريات بقي (بصمتُهما لم تتغيّر). */
const edStart = await page.evaluate(async () => {
  const id = await window.contracts._create({
    engagement: 'contract', projectId: 'hail', title: 'طلبٌ تُعدَّل بنودُه', vendorId: 'VND-0005',
    vendorName: 'محمد أحمد الغامدي', vatMode: 'none', budgetCategoryKey: 'subcontractor',
    lines: [{ id: 'e1', desc: 'أعمال', unit: 'عدد', qty: 2, unitPrice: 5000 }],
    candidates: [], advance: {}, retention: {},
    penalty: { mode: 'amount', perDayAmount: 500, capAmount: 20000 }, warranty: {}
  });
  for (let i = 0; i < 3; i++) await window.contracts._act(id, 'approve', 'موافق');  // pm · proc · finance
  const before = window.contracts.requestById(id);
  window.contracts.openReq(id);
  return { id, status: before.status, value: before.value, fin: !!before.financeApprovedAt };
});
await page.waitForTimeout(900);
check('★ طلبٌ بـ١٠٬٠٠٠ اعتمدته البوّاباتُ الثلاث (مادّةُ فحص التعديل)',
  edStart.value === 10000 && edStart.fin === true, JSON.stringify(edStart));
check('★★ وزرُّ «تعديل البنود» يظهر للأدمن',
  ((await page.textContent('#page-contract-requests')) || '').includes('تعديل البنود'));
await page.evaluate(() => window.contracts.editLines());
await page.waitForTimeout(700);
check('★★ والمحرّرُ يحلّ محلَّ الجدول ويشرح أثرَ التغيير قبل وقوعه',
  await page.evaluate(() => !!document.getElementById('ct-ln-rows')) &&
  /يُسقط اعتمادَ المالية والتنفيذيِّ/.test((await page.textContent('#page-contract-requests')) || ''));
const edNoReason = await page.evaluate(async (id) => {
  try { await window.contracts._editLines(id, [{ desc: 'أعمال', unit: 'عدد', qty: 3, unitPrice: 5000 }], ''); return 'مرّ بلا سبب'; }
  catch (e) { return e.message; }
}, edStart.id);
check('★★ ولا تعديلَ بلا سبب', /سبب التعديل إلزامي/.test(edNoReason), edNoReason);
await page.fill('#ct-ln-rows [data-ef="qty"]', '3');
await page.fill('#ct-ln-why', 'زيادة الكمية بعد المعاينة');
await page.waitForTimeout(400);
await page.screenshot({ path: `${SHOTS}/12e-edit-lines.png`, fullPage: true });
await page.click('#ct-ln-btn');
await page.waitForTimeout(1400);
const edAfter = await page.evaluate((id) => {
  const r = window.contracts.requestById(id);
  return { value: r.value, qty: (r.lines[0] || {}).qty, status: r.status,
           pm: !!r.pmApprovedAt, proc: !!r.procApprovedAt, fin: !!r.financeApprovedAt,
           note: ((r.timeline || []).slice(-1)[0] || {}).note || '',
           code: ((r.timeline || []).slice(-1)[0] || {}).code || '' };
}, edStart.id);
check('★★ القيمةُ أُعيد حسابُها من البنود (١٥٬٠٠٠) والكميةُ صارت ٣',
  edAfter.value === 15000 && edAfter.qty === 3, JSON.stringify(edAfter));
check('★★ واعتمادُ المالية سقط فعاد الطلبُ إلى بوّابتها — ولم يسقط اعتمادُ مدير المشاريع والمشتريات',
  edAfter.fin === false && edAfter.pm === true && edAfter.proc === true &&
  edAfter.status === 'crq_pending_finance', JSON.stringify(edAfter));
check('★ والخطُّ الزمنيُّ يحفظ القيمةَ قبل وبعد والسبب',
  edAfter.code === 'edited' && /10,000\.00 ← 15,000\.00/.test(edAfter.note) &&
  /زيادة الكمية بعد المعاينة/.test(edAfter.note), edAfter.note);
const edPerm = await page.evaluate(async (id) => {
  const real = currentUser.role; currentUser.role = 'procurement_officer';
  let msg; try { await window.contracts._editLines(id, [{ desc: 'x', qty: 1, unitPrice: 1 }], 'محاولة'); msg = 'مرّ بغير أدمن'; }
  catch (e) { msg = e.message; }
  currentUser.role = real;
  let empty; try { await window.contracts._editLines(id, [], 'بلا بنود'); empty = 'مرّت بلا بنود'; }
  catch (e) { empty = e.message; }
  return { msg, empty };
}, edStart.id);
check('★★ والتعديلُ للأدمن وحدَه — الرفضُ في طبقة البيانات', /للأدمن فقط/.test(edPerm.msg), edPerm.msg);
check('★ ولا تمرّ بنودٌ فارغة', /بنداً واحداً على الأقل/.test(edPerm.empty), edPerm.empty);

/* ── غرامةُ التأخير بالريال (طلبُ المالك) ── */
const penUI = await page.evaluate((id) => {
  window.contracts.openReq(id);
  return null;
}, edStart.id);
await page.waitForTimeout(800);
const penCard = await page.textContent('#page-contract-requests') || '';
check('★★ بطاقةُ الطلب تعرض الغرامةَ بالريال لا بالنسبة',
  /500\.00 ر\.س يومياً/.test(penCard) && /سقف 20,000\.00 ر\.س/.test(penCard) && !/٪ يومياً/.test(penCard),
  (penCard.match(/غرامة التأخير[\s\S]{0,60}/) || [''])[0].replace(/\s+/g, ' '));

/* ── إرجاعُ الطلب إلى مرحلةٍ محدّدة — للأدمن (طلبُ المالك) ──
   يُنفَّذ **من الشاشة**: زرٌّ ⇐ صندوقٌ وجهاتُه مشتقّةٌ من الطلب ⇐ سببٌ إلزاميّ ⇐
   وقوفُ الطلب عند البوّابة المختارة بعد سقوط اعتماداتها وما بعدها. */
const rwStart = await page.evaluate(async () => {
  const id = await window.contracts._create({
    engagement: 'contract', projectId: 'hail', title: 'طلبٌ يُرجَع لمرحلة', vendorId: 'VND-0005',
    vendorName: 'محمد أحمد الغامدي', vatMode: 'none', budgetCategoryKey: 'subcontractor',
    lines: [{ id: 'w1', desc: 'أعمال', unit: 'عدد', qty: 1, unitPrice: 40000 }],
    candidates: [], advance: {}, retention: {}, penalty: {}, warranty: {}
  });
  const seq = [];
  for (let i = 0; i < 4; i++) { await window.contracts._act(id, 'approve', 'موافق'); seq.push(window.contracts.requestById(id).status); }
  window.contracts.openReq(id);
  return { id, seq };
});
await page.waitForTimeout(900);
check('★ طلبٌ عبَر بوّاباتِه الأربع ⇐ معتمَد (مادّةُ فحص الإرجاع)',
  rwStart.seq[3] === 'crq_approved', rwStart.seq.join(' → '));
check('★★ وزرُّ «إرجاع لمرحلة» يظهر للأدمن',
  ((await page.textContent('#page-contract-requests')) || '').includes('إرجاع لمرحلة'));
await page.evaluate(() => window.contracts.openRewind());
await page.waitForTimeout(700);
const rwBox = await page.evaluate(() => {
  const sel = document.getElementById('ct-rw-gate');
  return { open: !!sel, opts: sel ? Array.from(sel.options).map(o => o.value) : [],
           labels: sel ? Array.from(sel.options).map(o => o.textContent.trim()) : [] };
});
check('★★ وصندوقُ الإرجاع يعرض الوجهاتِ المشتقّةَ من مسار الطلب لا قائمةً ثابتة',
  rwBox.open && rwBox.opts.join(',') === 'pm,proc,finance,ceo' && rwBox.labels.includes('المشتريات'),
  JSON.stringify(rwBox.opts));
const rwNoReason = await page.evaluate(async (id) => {
  try { await window.contracts._rewind(id, 'proc', ''); return 'مرّ بلا سبب'; }
  catch (e) { return e.message; }
}, rwStart.id);
check('★★ ولا إرجاعَ بلا سبب (من أُسقط توقيعُه يقرأ لماذا)', /سبب الإرجاع إلزامي/.test(rwNoReason), rwNoReason);
await page.selectOption('#ct-rw-gate', 'proc');
await page.fill('#ct-rw-why', 'تغيّر المرشَّح الفائز');
await page.screenshot({ path: `${SHOTS}/12d-rewind-box.png`, fullPage: true });
await page.click('#ct-rw-btn');
await page.waitForTimeout(1400);
const rwAfter = await page.evaluate((id) => {
  const r = window.contracts.requestById(id);
  return { status: r.status, pm: !!r.pmApprovedAt, proc: !!r.procApprovedAt, fin: !!r.financeApprovedAt,
           ceo: !!r.ceoApprovedAt, procKey: !!r.procApprovedKey, value: r.value, lines: (r.lines || []).length,
           tl: (r.timeline || []).map(x => x.code).join(','),
           note: ((r.timeline || []).slice(-1)[0] || {}).note || '' };
}, rwStart.id);
check('★★ الطلبُ وقف عند بوّابة المشتريات فعلاً', rwAfter.status === 'crq_pending_proc', rwAfter.status);
check('★★ واعتماداتُ المشتريات وما بعدها سقطت — ولم يسقط اعتمادُ مدير المشاريع',
  rwAfter.pm === true && !rwAfter.proc && !rwAfter.fin && !rwAfter.ceo && !rwAfter.procKey,
  JSON.stringify(rwAfter));
check('★ والقيمةُ والبنودُ لم تُمَسّ (إجراءُ اعتمادٍ لا تحرير)',
  rwAfter.value === 40000 && rwAfter.lines === 1, JSON.stringify({ v: rwAfter.value, n: rwAfter.lines }));
check('★★ والخطُّ الزمنيُّ يحفظ الإرجاعَ وسببَه ومن أين',
  /rewound$/.test(rwAfter.tl) && /تغيّر المرشَّح الفائز/.test(rwAfter.note) && /من «/.test(rwAfter.note),
  rwAfter.note);
const rwPerm = await page.evaluate(async (id) => {
  const real = currentUser.role; currentUser.role = 'procurement_officer';
  let msg; try { await window.contracts._rewind(id, 'pm', 'محاولة'); msg = 'مرّ بغير أدمن'; }
  catch (e) { msg = e.message; }
  currentUser.role = real;
  let bad; try { await window.contracts._rewind(id, 'ceo', 'وجهةٌ غيرُ صالحة'); bad = 'مرّت وجهةٌ غيرُ صالحة'; }
  catch (e) { bad = e.message; }
  return { msg, bad };
}, rwStart.id);
check('★★ والإرجاعُ للأدمن وحدَه — الرفضُ في طبقة البيانات', /للأدمن فقط/.test(rwPerm.msg), rwPerm.msg);
check('★★ ووجهةٌ لا يقف عندها الطلبُ تُرفَض (لا وعدَ كاذب)', /ليست وجهةً صالحة/.test(rwPerm.bad), rwPerm.bad);

/* ── فصلُ المهام: من اعتمد بوّابةً لا يعتمد التاليةَ (طلبُ المالك) ──
   الحالةُ التي رآها بعينه: اعتمد كمدير مشاريع فعاد زرُّ الاعتماد — للمشتريات هذه
   المرّة — لأن الأدمن عضوٌ في كلّ بوّابة. الفحصُ يعيد المشهد حرفياً: بلا مسؤول
   مشترياتٍ في المستخدمين يبقى الزرُّ (نيابةً)، وبوجوده يختفي **ومعه سببُ غيابه**. */
const sod = await page.evaluate(async () => {
  const id = await window.contracts._create({
    engagement: 'pay_order', projectId: 'hail', title: 'فحصُ فصل المهام', vendorId: 'VND-0006',
    vendorName: 'راجو كومار', vatMode: 'none', budgetCategoryKey: 'subcontractor',
    lines: [{ id: 's1', desc: 'عمل', unit: 'عدد', qty: 1, unitPrice: 900 }],
    candidates: [], advance: {}, retention: {}, penalty: {}, warranty: {}
  });
  const out = { id, me: currentUser.user, role: currentUser.role };
  await window.contracts._act(id, 'approve', '');            // بوّابةُ مدير المشاريع
  const r1 = window.contracts.requestById(id);
  out.status = r1.status;
  out.storedUser = r1.pmApprovedByUser || '';
  const M = (users) => window.contracts._crqActMode(
    window.contracts.requestById(id), 'crq_pending_proc', currentUser.role,
    currentUser.user, currentUser.name, users);
  out.solo = M(USERS);                                        // لا مسؤولَ مشتريات بعد
  USERS.push({ user: 'proc9', name: 'مسؤول المشتريات', role: 'procurement_officer' });
  out.team = M(USERS);                                        // صار للبوّابة صاحبٌ آخر
  try { await window.contracts._act(id, 'approve', ''); out.blocked = 'مرّ رغم المنع'; }
  catch (e) { out.blocked = e.message; }
  out.myTasks = window.contracts._myPendingItems('admin').filter(x => x.id === id).length;
  window.contracts.openReq(id);
  return out;
});
await page.waitForTimeout(900);
check('★ الاعتمادُ الأوّل خزّن اسمَ الدخول (عليه تقوم المطابقةُ المستقرّة)',
  sod.storedUser === sod.me && sod.status === 'crq_pending_proc', JSON.stringify({ u: sod.storedUser, s: sod.status }));
check('★★ بلا مسؤولِ مشترياتٍ في المستخدمين: يعتمد **نيابةً** ولا يتعطّل العمل',
  sod.solo === 'delegate', sod.solo);
check('★★ وبوجود مسؤولِ مشترياتٍ: مُنِع — والمنعُ في طبقة البيانات لا على الزرّ',
  sod.team === 'blocked' && /بوّابةٍ سابقة/.test(sod.blocked), sod.team + ' · ' + sod.blocked);
check('★★ و«بانتظار إجراءك» لا تَعِد بزرٍّ مُنِع', sod.myTasks === 0, 'عدد=' + sod.myTasks);
const sodUI = await page.evaluate(() => {
  const p = document.getElementById('page-contract-requests');
  const txt = (p && p.textContent) || '';
  return {
    approve: Array.from(p.querySelectorAll('button')).some(b => /اعتماد —/.test(b.textContent || '')),
    reject: Array.from(p.querySelectorAll('button')).some(b => /رفض \/ إعادة/.test(b.textContent || '')),
    why: /فصلُ المهام/.test(txt),
    waiting: /بانتظار إجراءٍ منك/.test(txt)
  };
});
check('★★ وزرُّ الاعتماد اختفى من الشاشة (وهو ما طلبه المالك)', sodUI.approve === false, JSON.stringify(sodUI));
check('★★ ومعه **سببُ غيابه** — لا زرَّ يختفي بلا تفسير', sodUI.why === true, JSON.stringify(sodUI));
check('★ والرفض/الإعادة يبقى متاحاً (مخرجٌ لا يُسدّ)', sodUI.reject === true, JSON.stringify(sodUI));
check('★ ولا يقول الشريطُ «بانتظار إجراءٍ منك» لمن مُنِع', sodUI.waiting === false, JSON.stringify(sodUI));
await page.screenshot({ path: `${SHOTS}/12c-separation-of-duties.png`, fullPage: true });
// أعِد المستخدمين كما كانوا — بقيةُ السيناريوهات تعتمد أن الأدمن يملك كلّ بوّابة
await page.evaluate(() => { const i = USERS.findIndex(u => u.user === 'proc9'); if (i >= 0) USERS.splice(i, 1); });

/* ── حذفُ الطلبات الملغاة للأدمن (طلبُ المالك) ──
   الفعلُ الوحيدُ الذي لا رجعةَ فيه — فالفحصُ يُثبت البابَ **وحدودَه** في طبقة
   البيانات نفسِها: حيٌّ لا يُحذف · غيرُ الأدمن لا يحذف · والملغى يُحذف فعلاً
   ويسقط من الشاشة. (والقواعدُ على الخادم يفحصها `rules-check.mjs` على محاكٍ.) */
const delGuards = await page.evaluate(async () => {
  const d = {
    engagement: 'pay_order', projectId: 'hail', title: 'طلبٌ سيُلغى', vendorId: 'VND-0006',
    vendorName: 'راجو كومار', vatMode: 'none', budgetCategoryKey: 'subcontractor',
    lines: [{ id: 'z', desc: 'عملٌ ملغى', unit: 'عدد', qty: 1, unitPrice: 500 }],
    candidates: [], advance: {}, retention: {}, penalty: {}, warranty: {}
  };
  const id = await window.contracts._create(d);
  const out = { id };
  try { await window.contracts._delete(id); out.live = 'حُذف وهو حيّ'; }
  catch (e) { out.live = e.message; }
  await window.contracts._cancel(id, 'لم يعد مطلوباً');
  out.status = window.contracts.requestById(id).status;
  const real = currentUser.role; currentUser.role = 'procurement_officer';
  try { await window.contracts._delete(id); out.notAdmin = 'حُذف بغير أدمن'; }
  catch (e) { out.notAdmin = e.message; }
  currentUser.role = real;
  await window.contracts._delete(id);
  out.gone = !window.contracts.requestById(id);
  out.inStore = Object.keys(window.__store).filter(k => k.endsWith('/' + id)).length;
  return out;
});
check('★★ الطلبُ الحيُّ لا يُحذف ولو من الأدمن', /لا يُحذف إلا الطلبُ الملغى/.test(delGuards.live), delGuards.live);
check('★ والإلغاءُ ينقله إلى «ملغى»', delGuards.status === 'crq_cancelled', delGuards.status);
check('★★ والملغى لا يحذفه غيرُ الأدمن', /للأدمن فقط/.test(delGuards.notAdmin), delGuards.notAdmin);
check('★★ والأدمن يحذف الملغى — يسقط من الذاكرة **ومن المخزن**',
  delGuards.gone === true && delGuards.inStore === 0, JSON.stringify(delGuards));

// ثمّ المسارُ من الشاشة نفسِها: الزرُّ يظهر على الملغى وحدَه، وضغطُه يحذف فعلاً
const delId = await page.evaluate(async () => {
  const id = await window.contracts._create({
    engagement: 'pay_order', projectId: 'hail', title: 'طلبٌ يُحذف من الشاشة', vendorId: 'VND-0006',
    vendorName: 'راجو كومار', vatMode: 'none', budgetCategoryKey: 'subcontractor',
    lines: [{ id: 'z2', desc: 'عملٌ ملغى', unit: 'عدد', qty: 1, unitPrice: 400 }],
    candidates: [], advance: {}, retention: {}, penalty: {}, warranty: {}
  });
  window.contracts.openReq(id);
  return id;
});
await page.waitForTimeout(900);
check('★ ولا زرَّ حذفٍ على طلبٍ حيّ (البابُ لا يُعرَض حيث لا يُفتح)',
  !((await page.textContent('#page-contract-requests')) || '').includes('حذف الطلب'));
await page.evaluate(async (id) => { await window.contracts._cancel(id, 'تكرار'); window.contracts.openReq(id); }, delId);
await page.waitForTimeout(900);
check('★★ وزرُّ «حذف الطلب» يظهر للأدمن على الملغى',
  ((await page.textContent('#page-contract-requests')) || '').includes('حذف الطلب'));
await page.screenshot({ path: `${SHOTS}/12b-cancelled-delete.png`, fullPage: true });
await page.evaluate(() => window.contracts.doDelete());
await page.waitForTimeout(600);
await page.click('#confirm-ok-btn');
await page.waitForTimeout(1200);
const afterDel = await page.evaluate((id) => ({
  gone: !window.contracts.requestById(id),
  onList: ((document.getElementById('page-contract-requests') || {}).textContent || '').includes(id)
}), delId);
check('★★ وضغطُ الزرِّ يحذفه فعلاً ويعود لقائمةٍ بلا أثرٍ له',
  afterDel.gone === true && afterDel.onList === false, JSON.stringify(afterDel));

/* ── مشروعٌ يدويٌّ بلا موازنة: الربطُ اختياريٌّ فعلاً ── */
await page.evaluate(() => window.contracts.newRequest());
await page.waitForTimeout(1200);
await page.evaluate(() => window.contracts.setReqProject('__NEW_MANUAL__'));
await page.waitForTimeout(1200);
const manualForm = await page.evaluate(() => ({
  nameField: !!document.getElementById('ct-r-mproj'),
  catField: !!document.getElementById('ct-r-cat'),
  txt: (document.getElementById('page-contract-requests') || {}).textContent || ''
}));
check('★ «مشروع يدويّ جديد» يكشف حقلَ الاسم الحرّ', manualForm.nameField);
check('★ مشروعٌ بلا موازنة: تُعلَن اختياريةُ الربط ولا يُعرَض منتقي بند الموازنة',
  /الربطُ بالموازنة اختياريّ/.test(manualForm.txt) && manualForm.catField === false);
check('★ ولا يُعرَض جدولُ مقايسةٍ فارغ', !/بنود المقايسة/.test(manualForm.txt));
await page.screenshot({ path: `${SHOTS}/15-manual-project.png` });

// إرسالُ عقدٍ لمشروعٍ يدويٍّ بلا أيّ ربطٍ بالموازنة — **بالنموذج نفسِه** لا بحقنِ حالة
await page.fill('#ct-r-mproj', 'استراحة الشمال');
await page.fill('#ct-r-title', 'سور الاستراحة');
await page.evaluate(() => window.contracts.setReqVendor('VND-0005'));
await page.waitForTimeout(700);
await page.evaluate(() => window.contracts.addFreeLine());
await page.waitForTimeout(700);
await page.fill('#ct-r-lines [data-lf="desc"]', 'بناء سور');
await page.fill('#ct-r-lines [data-lf="unit"]', 'م.ط');
await page.fill('#ct-r-lines [data-lf="qty"]', '60');
await page.fill('#ct-r-lines [data-lf="unitPrice"]', '180');
await page.waitForTimeout(500);
await page.evaluate(() => window.contracts.submitRequest());
await page.waitForTimeout(2000);
const manualId = await page.evaluate(() => (window.contracts.requests()[0] || {}).id);
const manualDoc = await page.evaluate((id) => {
  const r = window.contracts.requestById(id) || {};
  return { pid: r.projectId, flag: r.isCustomProject, pname: r.projectName,
           cat: r.budgetCategoryKey, val: r.value, sel: r.projectSel === undefined };
}, manualId);
check('★ العقدُ اليدويُّ خُزِّن بالشكل القياسيّ (__OTHER__ + العلَم + الاسم)',
  manualDoc.pid === '__OTHER__' && manualDoc.flag === true && manualDoc.pname === 'استراحة الشمال',
  JSON.stringify(manualDoc));
check('★ ومرّ بلا بندِ موازنةٍ إطلاقاً — الربطُ اختياريّ حقاً',
  manualDoc.cat === '' && manualDoc.val === 10800);
check('ومعرّفُ العرض الداخليّ لم يُخزَّن على الوثيقة', manualDoc.sel === true);

await page.evaluate(() => window.contracts.openReq(window.contracts.requests()[0].id));
await page.waitForTimeout(900);
check('بطاقةُ الطلب توسم المشروعَ «يدويّ»',
  /يدويّ/.test((await page.textContent('#page-contract-requests')) || ''));
await page.screenshot({ path: `${SHOTS}/16-manual-request-card.png` });

await page.evaluate(() => window.contracts.backToReqs());
await page.waitForTimeout(900);
// ستةُ طلباتٍ باقيةٍ في القائمة: المحوَّلُ لعقد · أمرُ الدفع · طلبُ تعديل البنود ·
// طلبُ الإرجاع لمرحلة · طلبُ فصل المهام · المشروعُ اليدويّ. (وطلبا الحذف حُذفا فعلاً.)
check('القائمةُ تعرض الطلبات وشريطَ «بانتظار دورك»',
  await page.evaluate(() => document.querySelectorAll('#page-contract-requests .ct-tile').length) === 6);
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


/* ═════════ المرحلة ٣: العقد ═════════ */
console.log('\n=== المرحلة ٣: التحويلُ لعقدٍ ساري وبطاقتُه ===');
await page.setViewportSize({ width: 1440, height: 980 });
await page.evaluate((id) => window.contracts.openReq(id), reqId);
await page.waitForTimeout(1000);
check('★ زرُّ «إنشاء العقد» ظاهرٌ على الطلب المعتمَد',
  /إنشاء العقد/.test((await page.textContent('#page-contract-requests')) || ''));

const conv = await page.evaluate(async (id) => {
  const cid = await window.contracts._convert(id);
  const r = window.contracts.requestById(id);
  const c = window.contracts.contractById(cid);
  return { cid, reqStatus: r.status, reqLink: r.contractId,
           ctr: c ? { req: c.requestId, st: c.status, val: c.value, adv: c.advance.amount, ret: c.retention.pct } : null };
}, reqId);
check('★ التحويلُ أنشأ العقدَ **بانتظار التوقيع** ووسم الطلبَ في معاملةٍ واحدة',
  conv.ctr && conv.ctr.st === 'ctr_pending_signature' && conv.reqStatus === 'crq_converted' && conv.reqLink === conv.cid,
  JSON.stringify(conv));
check('★ والعقدُ يحمل معرّفَ طلبه (سلسلةُ التوقيع قابلةٌ للتتبّع)', conv.ctr.req === reqId);
check('★ وورث القيمةَ المعتمَدة كما هي', conv.ctr.val === 33600);
check('★ والشروطُ التجارية انتقلت من الطلب، والمقدَّمُ اشتُقّ (١٠٪ من 33,600)',
  conv.ctr.ret === 5 && conv.ctr.adv === 3360, JSON.stringify({ ret: conv.ctr.ret, adv: conv.ctr.adv }));

// حارسُ عدم التكرار: ضغطةٌ ثانيةٌ لا تُنشئ عقداً ثانياً
const twice = await page.evaluate(async (id) => {
  const before = window.contracts.contractsList().length;
  const again = await window.contracts._convert(id);
  return { again, before, after: window.contracts.contractsList().length };
}, reqId);
check('★ ضغطةٌ ثانيةٌ تُرجع العقدَ نفسَه ولا تُنشئ ثانياً',
  twice.again === conv.cid && twice.after === twice.before, JSON.stringify(twice));

// طلبٌ غير معتمَدٍ لا يُنتج عقداً
const notApproved = await page.evaluate(async (id) => {
  try { await window.contracts._convert(id); return 'مرّ من طلبٍ غير معتمَد'; }
  catch (e) { return e.message; }
}, payStages.id);
check('★ طلبٌ غير معتمَدٍ لا يُنشأ منه عقد', /ليس معتمَداً/.test(notApproved), notApproved);

// بطاقةُ العقد وتبويباتُها
await page.evaluate(() => showPage('contracts-list'));
await page.waitForTimeout(1300);
check('صفحةُ العقود صارت النشطة', await page.evaluate(() => {
  const p = document.getElementById('page-contracts-list'); return !!p && p.classList.contains('active');
}));
const ctrStats = await page.evaluate(() => Array.from(document.querySelectorAll('#page-contracts-list .ct-stat .v')).map(e => e.textContent.trim()));
const ctrCalc = await page.evaluate(() => {
  const l = window.contracts.contractsList().filter(c => c.status === 'ctr_active');
  return { n: l.length, v: l.reduce((s, c) => s + window.contracts._contractValue(c), 0) };
});
check('★ شريطُ العقود: الرقمُ المرسوم = المحسوب',
  Number(ctrStats[0]) === ctrCalc.n && ctrStats[1].replace(/,/g, '') === String(ctrCalc.v),
  'مرسوم ' + ctrStats.join('/') + ' · محسوب ' + ctrCalc.n + '/' + ctrCalc.v);
await page.screenshot({ path: `${SHOTS}/17-contracts-list.png` });

await page.evaluate((cid) => window.contracts.openCtr(cid), conv.cid);
await page.waitForTimeout(1000);

/* ── الوثيقةُ التعاقدية: شروطٌ وتوقيعٌ وطباعة ── */
const preSign = await page.textContent('#page-contracts-list') || '';
check('★ بطاقةُ العقد تُعلن أنه **لم يسرِ بعد** وتشرح الخطوة',
  /لم يسرِ بعد/.test(preSign) && /سجّل التوقيع/.test(preSign));
check('★ وزرّا «طباعة العقد» و«تسجيل التوقيع» ظاهران',
  /طباعة العقد/.test(preSign) && /تسجيل التوقيع/.test(preSign));

// المستخلصُ ممنوعٌ قبل التوقيع
const beforeSign = await page.evaluate(async (cid) => {
  const c = window.contracts.contractById(cid);
  try { await window.contracts._createExt(c, { lines: [{ lineId: c.lines[0].id, cumQty: 10, unitPrice: c.lines[0].unitPrice }] }); return 'مرّ مستخلصٌ على عقدٍ غير موقَّع'; }
  catch (e) { return e.message; }
}, conv.cid);
check('★ ولا مستخلصَ على عقدٍ لم يوقَّع', /عقدٍ ساري/.test(beforeSign), beforeSign);

// الشروط: منسوخةٌ + متولّدةٌ من الأرقام
await page.evaluate(() => window.contracts.ctrTab('clauses'));
await page.waitForTimeout(900);
const clTxt = await page.textContent('#page-contracts-list') || '';
check('★ تبويبُ الشروط يعرض البنودَ القانونيةَ المنسوخة',
  /نطاق العمل/.test(clTxt) && /السلامة/.test(clTxt) && /فض النزاع/.test(clTxt));
check('★ والشرطُ الجزائيُّ نصّاً يطابق رقمَ العقد (٥٪ محتجز · غرامةٌ بسقفها)',
  /غرامة التأخير/.test(clTxt) && /محتجز الضمان/.test(clTxt) && /5٪/.test(clTxt));
check('والشروطُ الماليةُ مُعلَّمةٌ أنها تتولّد من الأرقام', /يتولّد من الأرقام/.test(clTxt));
await page.screenshot({ path: `${SHOTS}/23-contract-clauses.png` });

// المخرَجُ الورقيّ — يُلتقط بمقاطعة فتح النافذة
const printed = await page.evaluate((cid) => {
  let captured = '';
  const realOpen = window.open;
  window.open = function () { return { document: { write(h) { captured = h; }, close() { } }, focus() { }, print() { }, close() { } }; };
  window.contracts.printContract(cid);
  window.open = realOpen;
  return captured;
}, conv.cid);
check('★ الطباعةُ تُنتج وثيقةً كاملة', printed.length > 2000 && /<title>عقد /.test(printed));
check('★ وفيها أطرافُ العقد والطرفُ الثاني **بهويته**',
  /الطرف الأول/.test(printed) && /الطرف الثاني/.test(printed) && /1045667788/.test(printed));
check('★ وجدولُ بنود الأعمال وشروطُ العقد وحقولُ التوقيع',
  /جدول بنود الأعمال/.test(printed) && /شروط العقد/.test(printed) && /الاسم \/ التوقيع \/ الختم/.test(printed));
check('★★ ونصُّ الغرامة المطبوع بالريال لا بالنسبة (كما اتُّفق عليه لا كما يُحسَب)',
  /غرامة تأخير قدرها 500\.00 ريال عن كل يوم تأخير/.test(printed) &&
  /بحد أقصى 20,000\.00 ريال/.test(printed) && !/٪ من قيمة العقد عن كل يوم/.test(printed));
check('وقيمةُ العقد وإجماليُّه في جدول الملخّص', /قيمة العقد/.test(printed) && /33,600\.00/.test(printed));
fs.writeFileSync(`${SHOTS}/contract-print.html`, printed);

// تسجيلُ التوقيع ⇒ العقد ساري
const signRes = await page.evaluate(async (cid) => {
  const noDoc = await window.contracts._sign(cid, {}).then(() => 'مرّ بلا نسخة', e => e.message);
  await window.contracts._sign(cid, { url: 'https://example.test/signed.pdf', name: 'العقد الموقّع' });
  const c = window.contracts.contractById(cid);
  return { noDoc, st: c.status, docs: (c.signedDocs || []).length, at: !!c.signedAt };
}, conv.cid);
check('★ التوقيعُ يُرفض بلا نسخةٍ موقّعة', /إلزامية/.test(signRes.noDoc), signRes.noDoc);
check('★ ورفعُ النسخة الموقّعة جعل العقد **سارياً**',
  signRes.st === 'ctr_active' && signRes.docs === 1 && signRes.at, JSON.stringify(signRes));
await page.evaluate(() => window.contracts.ctrTab('overview'));
await page.waitForTimeout(800);
check('والبطاقةُ صارت تعرض توقيعَه ومرفقَه',
  /وُقِّع في/.test((await page.textContent('#page-contracts-list')) || ''));

await page.evaluate(() => window.contracts.ctrTab('overview'));
await page.waitForTimeout(600);
const ovTxt = await page.textContent('#page-contracts-list') || '';
check('بطاقةُ العقد تعرض القيمةَ والمقدَّمَ والمحتجز',
  /قيمة العقد النافذة/.test(ovTxt) && /دفعة مقدمة/.test(ovTxt) && /محتجز الضمان/.test(ovTxt));
check('★ وتعرض «بلا ربط — اختياريّ» لبندِ موازنةٍ فارغ أو البندَ إن رُبِط',
  /بند الموازنة/.test(ovTxt));
await page.screenshot({ path: `${SHOTS}/18-contract-card.png` });

await page.evaluate(() => window.contracts.ctrTab('lines'));
await page.waitForTimeout(700);
check('تبويبُ البنود يعرض بنودَ العقد بإجماليها',
  /بنود العقد/.test((await page.textContent('#page-contracts-list')) || ''));
await page.evaluate(() => window.contracts.ctrTab('extracts'));
await page.waitForTimeout(600);
check('تبويبُ المستخلصات يعرض شريطَ الإنجاز وجدولَه',
  /المنجَز التراكميّ/.test((await page.textContent('#page-contracts-list')) || ''));
await page.evaluate(() => window.contracts.ctrTab('log'));
await page.waitForTimeout(600);
check('تبويبُ السجل يعرض قيدَ الإنشاء',
  /إنشاء العقد من الطلب/.test((await page.textContent('#page-contracts-list')) || ''));
await page.evaluate(() => window.contracts.ctrTab('overview'));
await page.waitForTimeout(500);

/* ═════════ المرحلة ٧: أوامرُ التغيير ═════════
   تُدار هنا **قبل** المستخلصات: العقدُ ساري، فنرفع كميةَ بندٍ بأمرِ تغييرٍ يمرّ
   بدورته كاملةً، ثم نتحقّق أن قيمةَ العقد وكميةَ البند تحرّكتا فعلاً. */
console.log('\n=== المرحلة ٧: أوامرُ التغيير ===');
await page.evaluate(() => window.contracts.ctrTab('changes'));
await page.waitForTimeout(900);
const chgTab = await page.textContent('#page-contracts-list') || '';
check('★ تبويبُ أوامر التغيير يعرض معادلةَ القيمة لا الرقمَ وحدَه',
  /قيمة العقد الأصلية/.test(chgTab) && /القيمة الحالية/.test(chgTab), '');
check('وزرُّ الإنشاء ظاهرٌ على عقدٍ ساري', /أمر تغيير جديد/.test(chgTab));
await page.screenshot({ path: `${SHOTS}/28-changes-empty.png` });

// النموذجُ يُملأ من الشاشة لا بالذاكرة — فيمرّ بـsyncChgDraft كما يفعل المستخدم
await page.evaluate(() => window.contracts.newChange());
await page.waitForTimeout(1000);
check('★ النموذجُ يطلب فارقَ الكمية لا الكميةَ الجديدة',
  /فارق الكمية/.test((await page.textContent('#page-contracts-list')) || ''));

const before = await page.evaluate((cid) => {
  const c = window.contracts.contractById(cid);
  return { value: window.contracts._contractValue(c), qty: window.contracts._contractLineQty(c, c.lines[0].id),
           days: c.durationDays, lineId: c.lines[0].id, price: c.lines[0].unitPrice };
}, conv.cid);

await page.fill('#ct-g-lines input[data-cf="qty"]', '20');
await page.fill('#ct-g-days', '15');
await page.dispatchEvent('#ct-g-days', 'input');
await page.waitForTimeout(400);
const effTxt = await page.textContent('#ct-g-eff') || '';
check('★ والأثرُ يُحسب لحظةَ الكتابة (القيمةُ قبل/بعد)',
  /القيمة قبل/.test(effTxt) && /القيمة بعد/.test(effTxt), effTxt.replace(/\s+/g, ' ').slice(0, 90));
const blockedNoReason = await page.evaluate(() => document.getElementById('ct-g-send').disabled);
check('★★ والإرسالُ معطَّلٌ ما لم يُكتب السبب (أمرٌ بلا سببٍ لا يُعتمَد)', blockedNoReason === true);

await page.fill('#ct-g-reason', 'توسعةُ نطاق الدهان بطلب المالك');
await page.dispatchEvent('#ct-g-reason', 'input');
await page.waitForTimeout(400);
check('وكتابةُ السبب تُعيد تفعيلَ الإرسال',
  await page.evaluate(() => document.getElementById('ct-g-send').disabled) === false);
await page.screenshot({ path: `${SHOTS}/29-change-form.png` });

await page.evaluate(() => window.contracts.submitChange());
await page.waitForTimeout(1200);
const chgNew = await page.evaluate((cid) => {
  const g = window.contracts.changesFor(cid)[0];
  return g ? { id: g.id, st: g.status, amt: g.amount, days: g.durationDaysDelta, reason: g.reason } : null;
}, conv.cid);
check('★ أُنشئ أمرُ التغيير وبدأ عند مدير المشاريع',
  !!chgNew && chgNew.st === 'chg_pending_pm' && chgNew.amt > 0, JSON.stringify(chgNew));

const secondChg = await page.evaluate(async (cid) => {
  const c = window.contracts.contractById(cid);
  try { await window.contracts._createChg(c, { lines: [{ id: c.lines[0].id, qty: 1, unitPrice: 1 }], reason: 'x' }); return 'مرّ أمرٌ ثانٍ'; }
  catch (e) { return e.message; }
}, conv.cid);
check('★ ولا أمرَ ثانياً قبل إنهاء المفتوح', /مفتوح/.test(secondChg), secondChg);

// الدورةُ كاملةً بأدوارها — كلُّ بوّابةٍ بدورها لا بدورٍ واحدٍ يمرّ الكلّ
const chgCycle = await page.evaluate(async (gid) => {
  const out = [];
  const real = currentUser.role;
  const wrong = await window.contracts._actChg(gid, 'approve', '').then(() => null, e => null);
  currentUser.role = 'finance';
  const notMine = await window.contracts._actChg(gid, 'approve', '').then(() => 'مرّ بدورٍ لا يملك البوّابة', e => e.message);
  currentUser.role = real;
  for (let i = 0; i < 4; i++) {
    const g = window.contracts.changeById(gid);
    if (g.status === 'chg_approved') break;
    const owner = { chg_pending_pm: 'project_manager', chg_pending_proc: 'procurement_officer',
                    chg_pending_finance: 'finance', chg_pending_ceo: 'ceo' }[g.status];
    currentUser.role = owner;
    await window.contracts._actChg(gid, 'approve', '');
    out.push(window.contracts.changeById(gid).status);
  }
  currentUser.role = real;
  return { out, notMine, st: window.contracts.changeById(gid).status };
}, chgNew.id);
check('★★ ودورٌ لا يملك البوّابة يُرفض في طبقة البيانات', /لدورك/.test(chgCycle.notMine), chgCycle.notMine);
check('★ ومرّ الأمرُ ببوّاباته حتى صار معتمَداً',
  chgCycle.st === 'chg_approved', chgCycle.out.join(' → '));

const applyWrong = await page.evaluate(async (gid) => {
  const real = currentUser.role; currentUser.role = 'project_manager';
  let m; try { await window.contracts._applyChg(gid); m = 'طُبِّق بدورٍ لا يملكه'; } catch (e) { m = e.message; }
  currentUser.role = real; return m;
}, chgNew.id);
check('★ والتطبيقُ على العقد للمشتريات وحدَها', /مشتريات/.test(applyWrong), applyWrong);

const applied = await page.evaluate(async (a) => {
  const real = currentUser.role; currentUser.role = 'procurement_officer';
  await window.contracts._applyChg(a.gid);
  await window.contracts._applyChg(a.gid);          // نقرةٌ مكرّرة — يجب ألّا تُطبَّق مرّتين
  currentUser.role = real;
  const c = window.contracts.contractById(a.cid);
  return { value: window.contracts._contractValue(c), base: c.value, qty: window.contracts._contractLineQty(c, a.lineId),
           days: c.durationDays, n: (c.changeOrders || []).length, gst: window.contracts.changeById(a.gid).status };
}, { gid: chgNew.id, cid: conv.cid, lineId: before.lineId });
check('★★ التطبيقُ رفع قيمةَ العقد **بلا أن يمسّ القيمةَ الأصلية** (التاريخُ باقٍ)',
  applied.base === before.value && applied.value === before.value + chgNew.amt,
  JSON.stringify({ base: applied.base, now: applied.value, was: before.value }));
check('★★ ورفع كميةَ البند — فصار المستخلصُ الممنوعُ ممكناً',
  applied.qty === before.qty + 20, `${before.qty} ⇐ ${applied.qty}`);
check('★ ومدّد مدةَ العقد', applied.days === before.days + 15, `${before.days} ⇐ ${applied.days}`);
check('★★ والنقرةُ المكرّرةُ لم تُطبّقه مرّتين', applied.n === 1, 'عدد أوامر العقد ' + applied.n);
check('وخُتم الأمرُ «مطبَّقاً»', applied.gst === 'chg_applied', applied.gst);

await page.evaluate(() => window.contracts.ctrTab('overview'));
await page.waitForTimeout(800);
check('★ وبطاقةُ العقد تشرح المعادلةَ للقارئ',
  /القيمةُ الحالية = الأصليّ/.test((await page.textContent('#page-contracts-list')) || ''));
await page.screenshot({ path: `${SHOTS}/30-change-applied.png` });

// الحارسُ الحقيقيّ: خفضٌ ينزل تحت المنفَّذ يُرفض
const deepCut = await page.evaluate(async (a) => {
  const c = window.contracts.contractById(a.cid);
  const g = window.contracts._chgGuard({ lines: [{ id: a.lineId, qty: -9999 }], amount: -9999 }, c, window.contracts.extractsList());
  return { ok: g.ok, belowPaid: !!g.belowPaid, under: g.under.length };
}, { cid: conv.cid, lineId: before.lineId });
check('★ وخفضٌ يمحو العقدَ يُرفض في الدالّة النقيّة', deepCut.ok === false, JSON.stringify(deepCut));

await page.evaluate(() => window.contracts.ctrTab('overview'));
await page.waitForTimeout(500);

/* ═════════ المرحلة ٤: المستخلصات ═════════ */
console.log('\n=== المرحلة ٤: المستخلصُ التراكميُّ وسُلَّمُ خصوماته ===');
await page.evaluate(() => window.contracts.ctrTab('extracts'));
await page.waitForTimeout(900);
check('تبويبُ المستخلصات يعرض زرَّ الإنشاء على عقدٍ ساري',
  /مستخلص جديد/.test((await page.textContent('#page-contracts-list')) || ''));

await page.evaluate(() => window.contracts.newExtract());
await page.waitForTimeout(1100);
check('★ نموذجُ المستخلص يبدأ بكميات «سبق اعتماده» لا من صفرٍ أعمى',
  await page.evaluate(() => { const d = window.contracts._extDraftOf(); return !!d && d.lines.length === 1 && d.cumQty !== undefined || !!d; }));

// الحارسُ المانع: تراكميٌّ فوق كمية العقد يُعطّل الإرسال
await page.fill('#ct-e-lines [data-ef="cumQty"]', '5000');
await page.waitForTimeout(600);
const blocked = await page.evaluate(() => ({
  disabled: (document.getElementById('ct-e-send') || {}).disabled,
  msg: /يتجاوز كمية العقد/.test(document.getElementById('page-contracts-list').textContent)
}));
check('★ تراكميٌّ فوق كمية العقد: يُعطّل الإرسال ويشرح السبب', blocked.disabled === true && blocked.msg, JSON.stringify(blocked));

// كميةٌ سليمة: نصفُ العقد
await page.fill('#ct-e-lines [data-ef="cumQty"]', '600');
await page.fill('#ct-e-period', 'أغسطس 2026');
await page.fill('#ct-e-mat', '2000');
await page.waitForTimeout(700);
const ladder = await page.evaluate(() => {
  const d = window.contracts._extDraftOf();
  const c = window.contracts.contractById(d.contractId);
  const calc = window.contracts._extNet(d, c, { prevGross: 0, materialsIssued: d.materialsIssued, penaltyAmount: d.penaltyAmount, ncDeduction: d.ncDeduction });
  const drawn = Array.from(document.querySelectorAll('#ct-e-ladder .ct-rung')).map(r => [r.querySelector('.rl').textContent.trim(), r.querySelector('.rv').textContent.trim()]);
  return { calc, drawn, enabled: !(document.getElementById('ct-e-send') || {}).disabled };
});
check('★ كميةٌ سليمةٌ تُعيد تفعيل الإرسال', ladder.enabled === true);
// النسبةُ تُقاس بالكمية المتعاقَد عليها **بعد أوامر التغيير** — فلا تُثبَّت في
// الفحص برقمٍ حرفيّ: أمرُ تغييرٍ يرفع الكميةَ يخفض النسبةَ بحقّ.
const rowLive = await page.evaluate(() => {
  const tds = document.querySelectorAll('#ct-e-lines tbody tr td');
  const d = window.contracts._extDraftOf();
  const c = window.contracts.contractById(d.contractId);
  const l = d.lines[0];
  const max = window.contracts._contractLineQty(c, l.lineId);
  return { pct: tds[4].textContent.trim(), val: tds[5].textContent.trim(),
           wantPct: Math.round((Number(l.cumQty) || 0) / max * 100) + '%',
           wantVal: (Math.round(window.contracts._vatSplit(l.unitPrice, c.vatMode).base * (Number(l.cumQty) || 0) * 100) / 100).toFixed(2) };
});
check('★ وخلايا «%» و«القيمة» تُحدَّث مع الإدخال لا عند إعادة الرسم (المرسوم = المحسوب)',
  rowLive.pct === rowLive.wantPct && rowLive.val.replace(/,/g, '') === rowLive.wantVal, JSON.stringify(rowLive));
const netDrawn = (ladder.drawn.find(r => r[0].includes('صافي')) || [])[1] || '';
check('★ سُلَّمُ الخصومات: الرقمُ المرسوم = المحسوب',
  netDrawn.replace(/,/g, '') === ladder.calc.net.toFixed(2),
  'مرسوم ' + netDrawn + ' · محسوب ' + ladder.calc.net);
check('★ والسلّمُ يعرض الخصوماتِ المفعَّلةَ وحدَها (لا صفوفَ أصفارٍ فارغة)',
  ladder.drawn.some(r => r[0].includes('محتجز')) && ladder.drawn.some(r => r[0].includes('مواد')) &&
  !ladder.drawn.some(r => r[0].includes('عدم مطابقة')),
  ladder.drawn.map(r => r[0]).join(' | '));
await page.screenshot({ path: `${SHOTS}/21-extract-form.png` });
await page.evaluate(() => { const a = document.querySelector('.main-area'); if (a) a.scrollTop = a.scrollHeight; });
await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOTS}/21b-extract-ladder.png` });
await page.evaluate(() => { const a = document.querySelector('.main-area'); if (a) a.scrollTop = 0; });

await page.evaluate(() => window.contracts.submitExtract());
await page.waitForTimeout(1800);
const ext1 = await page.evaluate((cid) => {
  const l = window.contracts.extractsFor(cid);
  return l.length ? { id: l[0].id, st: l[0].status } : null;
}, conv.cid);
check('★ أُنشئ المستخلص وبدأ عند مدير المشاريع', ext1 && ext1.st === 'ext_pending_pm', JSON.stringify(ext1));

// حارسُ المستخلص المفتوح الواحد
const second = await page.evaluate(async (cid) => {
  const c = window.contracts.contractById(cid);
  try { await window.contracts._createExt(c, { lines: [{ lineId: c.lines[0].id, cumQty: 700, unitPrice: c.lines[0].unitPrice }] }); return 'مرّ مستخلصٌ ثانٍ'; }
  catch (e) { return e.message; }
}, conv.cid);
check('★ لا مستخلصَ ثانياً قبل إغلاق المفتوح', /مستخلصٌ مفتوح/.test(second), second);

// اعتمادٌ ⇐ سداد
const cycle = await page.evaluate(async (eid) => {
  const out = [];
  await window.contracts._actExt(eid, 'approve', '');
  out.push(window.contracts.extractById(eid).status);
  await window.contracts._actExt(eid, 'approve', '');
  out.push(window.contracts.extractById(eid).status);
  return out;
}, ext1.id);
check('★ المستخلص عبَر مدير المشاريع ⇐ التنفيذي ⇐ سداد المالية',
  cycle.join(' → ') === 'ext_pending_ceo → ext_pending_finance', cycle.join(' → '));

const noRcpt = await page.evaluate(async (eid) => {
  try { await window.contracts._payExt(eid, { ref: 'x' }); return 'مرّ بلا إيصال'; } catch (e) { return e.message; }
}, ext1.id);
check('★ سدادُ المستخلص يُرفض بلا إيصال', /إيصال/.test(noRcpt), noRcpt);

const paid = await page.evaluate(async (eid) => {
  await window.contracts._payExt(eid, { ref: 'TRX-1', receiptUrl: 'https://example.test/r.pdf' });
  const e = window.contracts.extractById(eid);
  const c = window.contracts.contractById(e.contractId);
  return { st: e.status, amt: e.payment.amount, snap: !!e.settled, advRec: c.advance.recovered, cst: c.status };
}, ext1.id);
check('★ السدادُ سجّل الصافي وحفظ لقطةَ السلّم',
  paid.st === 'ext_paid' && paid.snap === true, JSON.stringify(paid));
check('★ واستهلاكُ الدفعة المقدمة تراكم على العقد', paid.advRec > 0, String(paid.advRec));

// المستخلصُ الثاني يرث «المستخلَص سابقاً» محسوباً
const ext2 = await page.evaluate(async (cid) => {
  const c = window.contracts.contractById(cid);
  const prev = window.contracts._prevGrossOf(window.contracts.extractsList(), c, null);
  const id = await window.contracts._createExt(c, { period: 'سبتمبر', isFinal: true,
    lines: [{ lineId: c.lines[0].id, desc: c.lines[0].desc, unit: c.lines[0].unit, unitPrice: c.lines[0].unitPrice, cumQty: c.lines[0].qty }] });
  const e = window.contracts.extractById(id);
  return { prev, id, calc: window.contracts._extCalc(e, c) };
}, conv.cid);
check('★ المستخلصُ الثاني يقرأ «سابقاً» محسوباً ويحسب فترتَه منه',
  ext2.prev > 0 && ext2.calc.prevGross === ext2.prev && ext2.calc.period === ext2.calc.gross - ext2.prev,
  JSON.stringify({ prev: ext2.prev, period: ext2.calc.period }));

// الختاميُّ يُنهي العقد فنّياً
const finalPay = await page.evaluate(async (eid) => {
  await window.contracts._actExt(eid, 'approve', '');
  const st1 = window.contracts.extractById(eid).status;
  if (st1 === 'ext_pending_ceo') await window.contracts._actExt(eid, 'approve', '');
  await window.contracts._payExt(eid, { ref: 'TRX-2', receiptUrl: 'https://example.test/r2.pdf' });
  const e = window.contracts.extractById(eid);
  return { st: e.status, cst: window.contracts.contractById(e.contractId).status };
}, ext2.id);
check('★ المستخلصُ الختاميُّ أنهى العقد فنّياً في المعاملة نفسِها',
  finalPay.st === 'ext_paid' && finalPay.cst === 'ctr_completed', JSON.stringify(finalPay));

await page.evaluate(() => window.contracts.ctrTab('extracts'));
await page.waitForTimeout(900);
check('جدولُ المستخلصات يعرض المستخلصين بحالتيهما',
  await page.evaluate(() => document.querySelectorAll('#page-contracts-list .ct-table tbody tr').length) >= 2);
await page.screenshot({ path: `${SHOTS}/22-extracts-list.png` });

// انتقالاتُ الحالة في طبقة البيانات
const trans = await page.evaluate(async (cid) => {
  const out = [];
  // العقدُ صار «منتهياً فنّياً» بالمستخلص الختاميّ — يتبقّى الإقفالُ النهائيّ
  out.push(window.contracts.contractById(cid).status);
  await window.contracts._transit(cid, 'close', '');
  const c = window.contracts.contractById(cid);
  out.push(c.status);
  // المحتجزُ نسبةٌ من **القيمة النافذة** — أي بعد أوامر التغيير المعتمَدة
  return { out, released: c.retention.released,
           want: Math.round(window.contracts._contractValue(c) * c.retention.pct / 100 * 100) / 100 };
}, conv.cid);
check('★ دورةُ الحالة تكتمل: منتهٍ فنّياً (بالختاميّ) ⇒ مقفل',
  trans.out.join(' → ') === 'ctr_completed → ctr_closed', trans.out.join(' → '));
check('★ والإقفالُ أفرج عن المحتجز بقيمةٍ محسوبة من **القيمة النافذة** (بعد أوامر التغيير)',
  trans.released === trans.want && trans.released > 0, 'مرسوم ' + trans.released + ' · محسوب ' + trans.want);

const afterClose = await page.evaluate(async (cid) => {
  try { await window.contracts._transit(cid, 'suspend', 'x'); return 'مرّ على عقدٍ مقفل'; }
  catch (e) { return e.message; }
}, conv.cid);
check('★ ولا إجراءَ بعد الإقفال', /لا يجوز/.test(afterClose), afterClose);

const wrongRole = await page.evaluate(async (cid) => {
  const real = currentUser.role; currentUser.role = 'procurement_officer';
  let m; try { await window.contracts._transit(cid, 'close', ''); m = 'مرّ بدورٍ لا يملكه'; } catch (e) { m = e.message; }
  currentUser.role = real; return m;
}, conv.cid);
check('★ ودورٌ لا يملك الانتقال يُرفض في طبقة البيانات', /لا يجوز|لدورك/.test(wrongRole), wrongRole);

await page.evaluate(() => window.contracts.backToCtrs());
await page.waitForTimeout(700);
await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
await page.waitForTimeout(600);
await page.screenshot({ path: `${SHOTS}/19-contracts-dark.png` });
await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
const ov3 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('★ صفحةُ العقود بلا تمريرٍ أفقيٍّ على الجوال', ov3 <= 1, 'زيادة ' + ov3 + 'px');
await page.screenshot({ path: `${SHOTS}/20-contracts-mobile.png` });


/* ═════════ المرحلة ٥: الربطُ بالموازنة ═════════ */
console.log('\n=== المرحلة ٥: خانتا «قيدَ الاعتماد» و«متعاقَدٌ عليه» ===');
await page.setViewportSize({ width: 1440, height: 980 });

const roll = await page.evaluate(() => window.contracts.rollupForProject('hail'));
check('★ التجميعُ التعاقديُّ يقرأ مشروعَ hail', !!roll && !!roll.total, JSON.stringify(roll.total));

await page.evaluate(() => showPage('projects'));
await page.waitForTimeout(1600);
await page.evaluate(() => window.projectMgmt.open('hail'));
await page.waitForTimeout(1400);
await page.evaluate(() => window.projectMgmt.tab('budget'));
await page.waitForTimeout(1800);

const head = await page.evaluate(() => Array.from(document.querySelectorAll('#page-projects .pm-table thead th')).map(e => e.textContent.trim()));
check('★ جدولُ الموازنة صار سبعةَ أعمدة بخانتَي التعاقد',
  head.length === 7 && head.includes('قيدَ الاعتماد') && head.includes('متعاقَدٌ عليه'), head.join(' | '));

const foot = await page.evaluate(() => Array.from(document.querySelectorAll('#page-projects .pm-table tfoot td')).map(e => e.textContent.trim()));
const num = (s2) => Number(String(s2).replace(/[^0-9.-]/g, '')) || 0;
check('★ الرقمُ المرسوم في «قيدَ الاعتماد» = المحسوب',
  num(foot[2]) === Math.round(roll.total.pending), 'مرسوم ' + foot[2] + ' · محسوب ' + roll.total.pending);
check('★ والرقمُ المرسوم في «متعاقَدٌ عليه» = المحسوب',
  num(foot[3]) === Math.round(roll.total.contracted), 'مرسوم ' + foot[3] + ' · محسوب ' + roll.total.contracted);
check('★ والمصروفُ يشمل المسدَّدَ تعاقدياً',
  num(foot[4]) >= Math.round(roll.total.spent), 'مرسوم ' + foot[4] + ' · تعاقديّ ' + roll.total.spent);
check('★ والمتبقّي يخصم الأربعة معاً',
  num(foot[6]) === num(foot[1]) - num(foot[2]) - num(foot[3]) - num(foot[4]) - num(foot[5]),
  foot.join(' | '));
await page.screenshot({ path: `${SHOTS}/25-budget-columns.png` });

// حارسُ منع الازدواج: طلبُ شراءٍ بعقدٍ يُستبعَد من مصروف الشراء
// لا نعتمد على طلبٍ قائمٍ في البذرة (قد لا يوجد أصلاً) — نزرع طلبَنا ثم نزيله.
const dbl = await page.evaluate(() => {
  const sum = () => Object.values(window.projectMgmt._rollupByCategory('hail'))
    .reduce((s, c) => s + c.actual + c.committed, 0);
  const base = sum();
  const po = { id: 'PO-CTRDBL', projectId: 'hail', status: 'proc_executing',
               items: [{ itemType: 'مواد بناء', itemCost: 5000, qty: 1 }] };
  purchases.push(po);
  const withPo = sum();                     // الطلبُ الحرُّ يُحسب
  po.contractId = 'CTR-X';
  const underContract = sum();              // وبعد ربطه بعقدٍ يسقط
  purchases = purchases.filter(p => p.id !== 'PO-CTRDBL');
  return { base, withPo, underContract };
});
check('★ طلبُ شراءٍ حرٍّ يُحسب في مصروف الشراء',
  dbl.withPo > dbl.base, JSON.stringify(dbl));
check('★ طلبُ شراءٍ مرتبطٌ بعقدٍ يُستبعَد من مصروف الشراء (لا رقمان لعملٍ واحد)',
  Math.abs(dbl.underContract - dbl.base) < 0.01, JSON.stringify(dbl));

/* ═════════ المرحلة ٨: ربطُ طلب الشراء و«بانتظار إجراءك» ═════════ */
console.log('\n=== المرحلة ٨: فجواتُ الربط ===');
await page.evaluate(() => showPage('contracts-list'));
await page.waitForTimeout(1200);
await page.evaluate((cid) => window.contracts.openCtr(cid), conv.cid);
await page.waitForTimeout(900);
await page.evaluate(() => window.contracts.ctrTab('purchases'));
await page.waitForTimeout(900);
const poTab = await page.textContent('#page-contracts-list') || '';
check('★ تبويبُ «طلبات الشراء» يشرح سببَ الربط لا يعرض حقلاً بلا معنى',
  /طلبات الشراء المرتبطة/.test(poTab) && /مرّتين/.test(poTab));

// نزرع طلبَ شراءٍ في مشروع العقد ثم نربطه من الشاشة.
// البذرةُ تُكتب في **المخزن** لا في المصفوفة وحدَها: مستمعُ المشتريات حيٌّ في المحاكي
// كما في الإنتاج، فأوّلُ كتابةٍ في المجموعة تُعيد بناء المصفوفة من المخزن — وبذرةٌ
// محلّيةٌ فقط كانت تختفي عند الربط.
const linkRes = await page.evaluate(async (cid) => {
  const c = window.contracts.contractById(cid);
  const seed = { id: 'PO-LINK-1', projectId: c.projectId || 'hail', status: 'proc_executing',
                 items: [{ itemType: 'مواد بناء', itemCost: 7000, qty: 1 }], estCost: 7000 };
  await db.collection(PURCHASES_COLLECTION()).doc('PO-LINK-1').set(seed);
  if (!purchases.some(p => p.id === 'PO-LINK-1')) purchases.push(seed);
  const cands = window.contracts._poCandidatesFor(c).map(p => p.id);
  const real = currentUser.role; currentUser.role = 'procurement_officer';
  await window.contracts._linkPurchase('PO-LINK-1', cid);
  currentUser.role = real;
  const po = purchases.find(p => p.id === 'PO-LINK-1');
  return { cands, contractId: po.contractId, linked: window.contracts._poLinkedTo(cid).map(p => p.id) };
}, conv.cid);
check('★ المرشَّحون يشملون طلبَ مشروع العقد', linkRes.cands.includes('PO-LINK-1'), linkRes.cands.join(','));
check('★★ والربطُ كتب contractId على طلب الشراء فعلاً',
  linkRes.contractId === conv.cid && linkRes.linked.includes('PO-LINK-1'), JSON.stringify(linkRes));

const dblAfter = await page.evaluate(() => {
  const sum = () => Object.values(window.projectMgmt._rollupByCategory('hail'))
    .reduce((s, c) => s + c.actual + c.committed, 0);
  const withLink = sum();
  const po = purchases.find(p => p.id === 'PO-LINK-1');
  delete po.contractId;
  const without = sum();
  po.contractId = 'x';
  return { withLink, without };
});
check('★★ والطلبُ المرتبطُ سقط من مصروف الشراء (الحارسُ صار له مفتاح)',
  dblAfter.withLink < dblAfter.without, JSON.stringify(dblAfter));

const stealing = await page.evaluate(async () => {
  const real = currentUser.role; currentUser.role = 'procurement_officer';
  let m; try { await window.contracts._linkPurchase('PO-LINK-1', 'CTR-OTHER'); m = 'سُرق الطلب'; }
  catch (e) { m = e.message; }
  currentUser.role = real; return m;
});
check('★ ولا يُسرَق طلبٌ مرتبطٌ بعقدٍ آخر', /مرتبط|غير محمَّل/.test(stealing), stealing);

const wrongRoleLink = await page.evaluate(async (cid) => {
  const real = currentUser.role; currentUser.role = 'warehouse_manager';
  let m; try { await window.contracts._linkPurchase('PO-LINK-1', cid); m = 'مرّ بدورٍ لا يملكه'; }
  catch (e) { m = e.message; }
  currentUser.role = real; return m;
}, conv.cid);
check('★ والربطُ لدورٍ مخوَّلٍ وحدَه', /صلاحية|المشتريات|مدير/.test(wrongRoleLink), wrongRoleLink);

await page.screenshot({ path: `${SHOTS}/31-po-link.png` });

// شارةُ العقد في تفاصيل طلب الشراء
const banner = await page.evaluate(() => {
  const host = document.getElementById('po-detail-body');
  if (!host) return { skipped: true };
  openPurchaseDetail('PO-LINK-1');
  const el = document.getElementById('po-contract-banner');
  return { text: el ? el.textContent.replace(/\s+/g, ' ').trim() : '' };
});
check('★★ وتفاصيلُ طلب الشراء تعلن أنه جزءٌ من عقدٍ ومستبعَدٌ من مصروف الشراء',
  banner.skipped ? true : (/جزءٌ من العقد/.test(banner.text) && /مستبعَد/.test(banner.text)),
  banner.text || 'skipped');

// «بانتظار إجراءك»
const myTasks = await page.evaluate(() => {
  const real = currentUser.role;
  const out = {};
  currentUser.role = 'finance';
  out.finance = window.contracts._myPendingItems('finance').map(i => i.kind + ':' + i.id);
  out.viewer = window.contracts._myPendingItems('viewer').length;
  out.pm = window.contracts._myPendingItems('project_manager').map(i => i.kind);
  currentUser.role = real;
  return out;
});
check('★ «بانتظار إجراءك» لا يعرض شيئاً للأدوار العارضة', myTasks.viewer === 0);
check('★★ ويُبنى من البوّابات نفسِها (لكلّ دورٍ ما ينتظره وحدَه)',
  JSON.stringify(myTasks.finance) !== JSON.stringify(myTasks.pm), JSON.stringify(myTasks));

const hooked = await page.evaluate(() => {
  window.contracts.hookMyTasks();
  return { hooked: !!window.__ctMyTasksHooked, stillFn: typeof window.renderPOMyTasks === 'function' };
});
check('★ ولفُّ بطاقة المشتريات تمّ بلا استبدالها', hooked.hooked && hooked.stillFn, JSON.stringify(hooked));

/* ═════════ المرحلتان ١٠ و١١: أداءُ الطرف ولوحةُ المعلومات ═════════ */
console.log('\n=== المرحلتان ١٠ و١١: الأداء واللوحة ===');
await page.evaluate(() => showPage('vendors'));
await page.waitForTimeout(1200);
const vId = await page.evaluate(() => {
  const v = window.contracts.vendors().find(x => window.contracts.contractsList().some(c => c.vendorId === x.id));
  if (v) window.contracts.openVendor(v.id);
  return v ? v.id : null;
});
await page.waitForTimeout(1000);
const perf = await page.textContent('#page-vendors') || '';
check('★ بطاقةُ الطرف تعرض قسمَ الأداء لمن له عقود',
  !!vId && /الأداء/.test(perf) && /قيمة التعاقدات/.test(perf), vId || 'لا طرفَ بعقود');
check('★★ وبلا درجةٍ ولا نجوم — والقسمُ يشرح لماذا',
  /لا درجةَ إجمالية عمداً/.test(perf) && !/★★★|من ٥|\/5/.test(perf));
check('★ والرقمُ المرسوم = المحسوب', await page.evaluate((id) => {
  const sc = window.contracts._vendorScorecard(id, window.contracts.contractsList(),
    window.contracts.extractsList(), window.contracts.changesList(), new Date().toISOString().slice(0,10));
  const txt = document.getElementById('page-vendors').textContent.replace(/[\u066b,]/g, '');
  return txt.includes(String(sc.contracts));
}, vId) === true);
await page.screenshot({ path: `${SHOTS}/32-vendor-perf.png` });

// لوحة المعلومات — البطاقةُ تُحقن باللفّ
const dash = await page.evaluate(() => {
  const anchor = document.getElementById('dash-purchase-summary-card');
  if (!anchor) return { skipped: true };
  window.contracts.hookDash();
  if (typeof window.renderDashboardPurchaseSummary === 'function') window.renderDashboardPurchaseSummary();
  const el = document.getElementById('ct-dash-card');
  return { hooked: !!window.__ctDashHooked, exists: !!el,
           txt: el ? el.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) : '',
           stillFn: typeof window.renderDashboardPurchaseSummary === 'function' };
});
check('★★ بطاقةُ التعاقدات تُحقن في لوحة المعلومات باللفّ بلا تعديل النواة',
  dash.skipped ? true : (dash.hooked && dash.exists && dash.stillFn), JSON.stringify(dash));
/* البطاقةُ تختفي عمداً حين لا عقودَ ساريةً ولا منتظِرةَ توقيع — وفي هذه المرحلة من
   الرحلة صار العقدُ مقفلاً. فلا نفترض ظهورَها: **نقيس تطابقَ المرسوم مع المحسوب**. */
const dashMatch = await page.evaluate(() => {
  const d = window.contracts._dashSummary(window.contracts.contractsList(),
              window.contracts.extractsList(), new Date().toISOString().slice(0,10));
  const el = document.getElementById('ct-dash-card');
  const shown = !!(el && el.innerHTML.trim());
  return { shown, should: !!(d.active || d.pendingSign), active: d.active, pend: d.pendingSign,
           hasLbl: shown ? /عقود سارية/.test(el.textContent) : true };
});
check('★★ ظهورُ البطاقة = وجودُ ما يُعرَض (تختفي عمداً حين لا عقدَ سارياً ولا منتظِرَ توقيع)',
  dash.skipped ? true : (dashMatch.shown === dashMatch.should && dashMatch.hasLbl),
  JSON.stringify(dashMatch));

await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
await page.waitForTimeout(600);
await page.screenshot({ path: `${SHOTS}/26-budget-dark.png` });
await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
const ov5 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('★ وجدولُ الموازنة بلا تمريرٍ أفقيٍّ للصفحة على الجوال', ov5 <= 1, 'زيادة ' + ov5 + 'px');
await page.screenshot({ path: `${SHOTS}/27-budget-mobile.png` });

check('لا أخطاء جافاسكربت طوال الرحلة', errors.length === 0, errors.slice(0, 2).join(' | '));

console.log('\n' + '═'.repeat(58));
console.log(fail ? `❌ ${fail} فشلت من ${pass + fail}` : `✅ ${pass}/${pass} — فحص وحدة التعاقدات نجح`);
console.log('═'.repeat(58) + '\n');
await browser.close();
process.exit(fail ? 1 : 0);
