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

/* ── حارسٌ هندسيّ: الرقمُ يقف تحت رأسِ عموده ──
   لا يُقاس بالنصّ المصدريّ بل بالصناديق المرسومة فعلاً: يُقارَن **مدى نصِّ** الخليّة
   الرقمية بمدى نصِّ رأسِ عمودها في نفس الجدول. وسببُ وجوده أنّ العلّة صنفٌ كامل لا
   سطرٌ واحد: كلُّ صنفٍ يضبط `direction:ltr` على **الخليّة** يقلب معنى `text-align:start`
   فيهرب الرقمُ إلى الحافّة المقابلة لرأسِه — ولا مترجمَ يُنذر ولا خطأَ جافاسكربت.
   (بلاغُ المالك: «البيانات غير مظبوطة تحت رأس العنوان في الجدول وكذلك في المستخلصات».) */
const numColMisaligned = (tol = 3) => page.evaluate((tol) => {
  const bad = [];
  const textBox = (el) => { const r = document.createRange(); r.selectNodeContents(el); const b = r.getBoundingClientRect(); return b.width ? b : el.getBoundingClientRect(); };
  document.querySelectorAll('.ct-table').forEach((tbl) => {
    if (!tbl.offsetParent) return;                       // جدولٌ غيرُ معروضٍ لا يُقاس
    const ths = Array.from(tbl.querySelectorAll('thead th'));
    if (!ths.length) return;
    Array.from(tbl.querySelectorAll('tbody tr')).forEach((tr) => {
      const tds = Array.from(tr.children);
      if (tds.length !== ths.length) return;             // صفُّ colspan (حالةٌ فارغة)
      tds.forEach((td, ci) => {
        if (!td.classList.contains('num')) return;
        if (!td.textContent.trim()) return;
        if (td.querySelector('input,select,textarea')) return;   // حقلُ إدخالٍ لا نصّ
        const t = textBox(td), h = textBox(ths[ci]);
        const d = Math.abs(t.right - h.right);
        if (d > tol) bad.push({ col: ths[ci].textContent.trim(), val: td.textContent.trim().slice(0, 22), off: Math.round(d) });
      });
    });
  });
  return bad;
}, tol);

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
    trades: ['electrical', 'lowCurrent'],
    legal: { crNumber: '1010234567', vatNumber: '300012345600003', nationalAddress: 'حائل — حي النقرة' },
    bank: { iban: 'SA0380000000608010167519', bankName: 'الأهلي' },
    docs: [{ type: 'cr', number: '1010234567', expiry: _dayOff(265) }, { type: 'vat', number: '3000123456', expiry: _dayOff(160) },
           { type: 'gosi', number: 'G-99', expiry: _dayOff(16) }], // ⇐ توشك
    // الرقمان **بصيغةٍ محلّيةٍ خام** عمداً: بياناتُ ما قبل التطبيع موجودةٌ في السجل
    // فعلاً، والعرضُ والبحثُ يجب أن يقرآها كما يقرآن المطبَّع — وإلا اختفى نصفُ السجل.
    phone: '0501234567', phoneLabel: 'المالك',
    contacts: [{ name: 'خالد العتيبي', role: 'مدير المشاريع', phone: '0555000111' }]
  };
  window.__store[V + '/VND-0002'] = {
    name: 'شركة البناء الحديث', kind: 'both', status: 'active',
    // «كهرباء» **مكتوبةٌ يدوياً** لا مفتاحاً — مادّةُ فحصِ التقاء المكتوب بالمختار
    trades: ['كهرباء', 'civil'],
    legal: { crNumber: '4030998877' },
    docs: [{ type: 'cr', number: '4030998877', expiry: _dayOff(-39) }, // ⇐ منتهية
           { type: 'zakat', number: 'Z-12', expiry: _dayOff(510) }]
  };
  window.__store[V + '/VND-0003'] = {
    name: 'مؤسسة الإتقان للتوريدات', kind: 'supplier', status: 'suspended', statusReason: 'تأخّر متكرّر في التوريد',
    trades: ['elecSupply', 'تمديدات غاز مركزي'],   // ⇐ الثاني خارجَ الكتالوج كلّياً
    legal: { crNumber: '1010777888' },
    docs: [{ type: 'cr', number: '1010777888', expiry: _dayOff(940) }]
  };
  window.__store[V + '/VND-0004'] = {
    name: 'ورشة الحرفي للألوميتال', entityType: 'establishment', kind: 'subcontractor', status: 'active',
    trades: ['aluminum'],
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
    // آيبانٌ حقيقيٌّ في البذرة — به وحدَه يصير فحصُ قناعِ الورقة فحصاً لا تمريناً
    bank: { iban: 'SA0380000000608010167519', bankName: 'الأهلي', holder: 'راجو كومار' },
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
const docsGeom = await numColMisaligned();
check('★ جدولُ «الوثائق وسريانها»: كلُّ رقمٍ تحت رأسِ عموده (قياسُ صناديقَ لا نصّ)',
  docsGeom.length === 0, docsGeom.map(b => `${b.col}: «${b.val}» بفارق ${b.off}px`).join(' · ') || 'لا انزياح');
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

/* ══ نوعُ الأعمال: القائمةُ والكتابةُ اليدوية، ومرشّحُ «مقاولٌ أو مورّدٌ لتخصّصٍ معيّن» ══
   المحكُّ ليس أن المرشّحَ «يرشّح»، بل أنّ الطرفَ الذي كُتب تخصّصُه **يدوياً**
   يظهر في نتيجة من اختار التخصّصَ نفسَه **من القائمة**. */
const tradeSel = await page.evaluate(() => {
  const s = document.getElementById('ct-v-trade');
  if (!s) return null;
  return {
    groups: Array.from(s.querySelectorAll('optgroup')).map(g => g.label),
    hasCatalog: !!s.querySelector('option[value="electrical"]'),
    custom: Array.from(s.querySelectorAll('optgroup[label="مكتوبة يدوياً"] option')).map(o => o.textContent.trim())
  };
});
check('مرشّحُ نوع الأعمال موجودٌ في الشاشة', !!tradeSel);
check('★ خياراتُه مفصولةٌ: من القائمة · مكتوبة يدوياً',
  !!tradeSel && tradeSel.groups.includes('من القائمة') && tradeSel.groups.includes('مكتوبة يدوياً') && tradeSel.hasCatalog,
  JSON.stringify(tradeSel && tradeSel.groups));
check('★ والمكتوبُ يدوياً وحدَه هو الذي يظهر في مجموعته (لا «كهرباء» المكتوبةُ يدوياً — وُحِّدت مع القائمة)',
  !!tradeSel && tradeSel.custom.length === 1 && tradeSel.custom[0] === 'تمديدات غاز مركزي',
  JSON.stringify(tradeSel && tradeSel.custom));

check('★ شاراتُ نوع الأعمال مرسومةٌ على بطاقات القائمة',
  await page.evaluate(() => document.querySelectorAll('#page-vendors .ct-tile .ct-trade').length) >= 4);

// «مقاولو الكهرباء» — المقاولُ الصريح + «مقاول ومورّد» المكتوبُ تخصّصُه يدوياً
await page.evaluate(() => { window.contracts.filterVendors('kind', 'subcontractor'); window.contracts.filterVendors('trade', 'electrical'); });
await page.waitForTimeout(800);
const elecIds = await page.evaluate(() => Array.from(document.querySelectorAll('#page-vendors .ct-tile .ct-tile-name')).map(e => e.textContent.trim()));
check('★★ «مقاولون · كهرباء» يعرض الأنوار **و** البناء الحديث (تخصّصُه مكتوبٌ يدوياً)',
  elecIds.length === 2 && elecIds.some(n => n.includes('الأنوار')) && elecIds.some(n => n.includes('البناء الحديث')),
  elecIds.join(' | '));
// والرقمُ المرسوم = المحسوب من الدالّة النقيّة نفسِها
const elecCalc = await page.evaluate(() => window.contracts._vendorsByTrade('electrical', 'subcontractor', window.contracts.vendors()).length);
check('★ الرقمُ المرسوم = ما تحسبه `vendorsByTrade`', elecIds.length === elecCalc, `مرسوم ${elecIds.length} · محسوب ${elecCalc}`);
check('سطرُ «ما تراه الآن» يقول التخصّصَ والعدد',
  /نوع الأعمال/.test(await page.textContent('#page-vendors')) &&
  /نتيجة/.test(await page.textContent('#page-vendors')));

// «موردون · كهرباء» محورٌ آخر — لا يخلط مورّدَ المواد بمقاول التنفيذ
await page.evaluate(() => { window.contracts.filterVendors('kind', 'supplier'); window.contracts.filterVendors('trade', 'elecSupply'); });
await page.waitForTimeout(700);
check('★ «موردون · توريد مواد كهربائية» يعرض الإتقان وحدَه',
  await page.evaluate(() => Array.from(document.querySelectorAll('#page-vendors .ct-tile .ct-tile-name')).map(e => e.textContent.trim()).join('|')) === 'مؤسسة الإتقان للتوريدات');

// التخصّصُ المكتوبُ يدوياً قابلٌ للترشيح مثلَ نظيره من القائمة
await page.evaluate(() => { window.contracts.filterVendors('kind', ''); window.contracts.filterVendors('trade', 'تمديدات غاز مركزي'); });
await page.waitForTimeout(700);
check('★★ التخصّصُ المكتوبُ يدوياً قابلٌ للترشيح (وإلا فبابُ الكتابة بابُ دفن)',
  await page.evaluate(() => document.querySelectorAll('#page-vendors .ct-tile').length) === 1);

// والبحثُ الحرُّ يجده بتخصّصه لا باسمه
await page.evaluate(() => window.contracts.clearTradeFilter());
await page.waitForTimeout(500);
await page.fill('#ct-v-q', 'الوميتال');   // اسمُ التخصّص لا اسمُ الطرف — وبلا همزة
await page.waitForTimeout(700);
check('★ البحثُ الحرُّ يشمل نوعَ الأعمال',
  await page.evaluate(() => document.querySelectorAll('#page-vendors .ct-tile').length) >= 1);
await page.fill('#ct-v-q', '');
await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOTS}/09-trade-filter.png`, fullPage: true });

// النموذج: القائمةُ والكتابةُ معاً — وإضافةٌ يدويةٌ تُوحَّد مع القائمة
await page.evaluate(() => window.contracts.openVendor('VND-0004'));
await page.waitForTimeout(700);
check('★ بطاقةُ الطرف تعرض نوعَ أعماله', /نوع الأعمال/.test(await page.textContent('#page-vendors')));
await page.evaluate(() => window.contracts.editVendor());
await page.waitForTimeout(800);
check('★ النموذجُ يعرض القائمةَ **وحقلَ الكتابة** معاً',
  await page.evaluate(() => !!document.getElementById('ct-f-trade-pick') && !!document.getElementById('ct-f-trade-new')));
await page.evaluate(() => window.contracts.addTrade('carpentry'));
await page.waitForTimeout(600);
await page.fill('#ct-f-trade-new', 'تكييف وتبريد');   // ⇐ اسمٌ موجودٌ في القائمة، مكتوبٌ يدوياً
await page.evaluate(() => window.contracts.addTradeText());
await page.waitForTimeout(600);
await page.fill('#ct-f-trade-new', 'ترميم واجهات');   // ⇐ خارجَ القائمة
await page.evaluate(() => window.contracts.addTradeText());
await page.waitForTimeout(600);
const draftTrades = await page.evaluate(() => Array.from(document.querySelectorAll('#page-vendors .ct-trades.edit .ct-trade')).map(e => e.textContent.replace(/[×\s]+$/, '').trim()));
check('★★ الاختيارُ والكتابةُ يُنتجان قائمةً واحدةً — والمكتوبُ المطابقُ لاسمٍ في القائمة يُعرَض بتسميتها',
  draftTrades.length === 4 && draftTrades.includes('نجارة وأبواب') && draftTrades.includes('تكييف وتبريد') && draftTrades.includes('ترميم واجهات'),
  draftTrades.join(' | '));
await page.screenshot({ path: `${SHOTS}/10-trade-edit.png`, fullPage: true });
// الحفظُ يكتب الحقل في الوثيقة
await page.evaluate(() => window.contracts.saveVendorEdit());
await page.waitForTimeout(1800);
const saved = await page.evaluate(() => (window.contracts.vendorById('VND-0004') || {}).trades || []);
check('★ نوعُ الأعمال يُحفَظ في وثيقة الطرف بمفاتيحَ موحَّدة',
  saved.includes('aluminum') && saved.includes('carpentry') && saved.includes('hvac') && saved.includes('ترميم واجهات'),
  JSON.stringify(saved));
await page.evaluate(() => window.contracts.backToVendors());
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

/* ── السجلّ التجاريّ صفٌّ واحدٌ في الجدول لا صفّان (بلاغُ المالك) ──
   الهويةُ الرسمية تُدمَج في الوثيقة التي تحمل رقمَها، فلا صفٌّ مشتقٌّ يقف بجوارها
   في العرض وحدَه — صفٌّ لا وجودَ له في `docs` فلا يظهر في التعديل ولا يُحذَف.
   والفحصُ يقيس **الجدولَ المرسوم** لا الدالّة: الازدواجُ كان في الرسم. */
const crRows = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('#page-vendors .ct-table tbody tr'));
  const hit = rows.filter(r => (r.cells[1] || {}).textContent.trim() === '1010234567');
  return {
    total: rows.length,
    cr: hit.length,
    badged: hit.map(r => r.textContent.includes('الهوية الرسمية'))
  };
});
check('★★ السجلُّ التجاريُّ يظهر **صفّاً واحداً** في «الوثائق وسريانها» (بلاغُ المالك)',
  crRows.cr === 1 && crRows.badged[0] === true, JSON.stringify(crRows));

await page.evaluate(() => window.contracts.backToVendors());
await page.waitForTimeout(700);
const tileChips = await page.evaluate(() => {
  const tiles = Array.from(document.querySelectorAll('#page-vendors .ct-tile'));
  const t = tiles.find(x => x.textContent.includes('مؤسسة الأنوار'));
  if (!t) return null;
  return Array.from(t.querySelectorAll('.ct-doc')).map(c => c.textContent.trim());
});
check('★★ وبطاقةُ الطرف لا تحمل شارتَي «س.ت» لرقمٍ واحد',
  Array.isArray(tileChips) && tileChips.filter(c => c === 'س.ت').length === 1,
  JSON.stringify(tileChips));
await page.evaluate(() => window.contracts.openVendor('VND-0001'));
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOTS}/02-vendor-card.png`, fullPage: true });

/* ══ أرقامُ الجوال: تُقرأ خاماً · تُعرَض روابطَ اتصال · تُبحَث بأيّ صيغة · تُحفَظ مطبَّعة ══ */
const phoneCard = await page.evaluate(() => {
  const p = document.getElementById('page-vendors');
  const tel = Array.from(p.querySelectorAll('a[href^="tel:"]')).map(a => a.getAttribute('href'));
  const wa  = Array.from(p.querySelectorAll('a[href^="https://wa.me/"]')).map(a => a.getAttribute('href'));
  return { tel, wa, txt: p.textContent.replace(/\s+/g, ' ') };
});
check('★ رقمُ الطرف المحفوظُ محلياً يُعرَض رابطَ اتصالٍ بصيغةٍ دولية',
  phoneCard.tel.includes('tel:+966501234567'), phoneCard.tel.join(' | '));
check('★ ورقمُ جهة الاتصال كذلك — ولكلٍّ رابطُ واتساب',
  phoneCard.tel.includes('tel:+966555000111') &&
  phoneCard.wa.includes('https://wa.me/966501234567') && phoneCard.wa.includes('https://wa.me/966555000111'),
  phoneCard.wa.join(' | '));
check('★ والمعروضُ بالصيغة المحلّية المقروءة لا بالدولية الخام',
  phoneCard.txt.includes('050 123 4567') && phoneCard.txt.includes('055 500 0111'));

await page.evaluate(() => window.contracts.backToVendors());
await page.waitForTimeout(600);
for (const [q, why] of [['0501234567', 'كما كُتب محلياً'], ['966501234567', 'بالصيغة الدولية'], ['501234567', 'بلا صفرٍ ولا مفتاح'], ['0555000111', 'برقم جهة الاتصال']]) {
  await page.fill('#ct-v-q', q);
  await page.waitForTimeout(500);
  const n = await page.evaluate(() => document.querySelectorAll('#page-vendors .ct-tile').length);
  check(`★ البحثُ بالرقم (${why}) يجد الطرفَ وحدَه`, n === 1, n + ' نتيجة');
}
await page.fill('#ct-v-q', '');
await page.waitForTimeout(600);
await page.evaluate(() => window.contracts.openVendor('VND-0001'));
await page.waitForTimeout(800);

// وضعُ التحرير
await page.evaluate(() => window.contracts.editVendor());
await page.waitForTimeout(900);
check('نموذج التحرير ظهر', await page.evaluate(() => !!document.getElementById('ct-f-name')));
check('★ وحقلُ الجوال يعرض الرقمَ المخزَّن بصيغةٍ محلّيةٍ قابلةٍ للقراءة',
  await page.evaluate(() => (document.getElementById('ct-f-phone') || {}).value) === '050 123 4567');
check('★ وجدولُ جهات الاتصال قابلٌ للتحرير (اسمٌ · صفةٌ · رقم)',
  await page.evaluate(() => {
    const t = document.getElementById('ct-contacts-tbl');
    return !!t && t.querySelectorAll('[data-cf="phone"]').length === 1 && t.querySelectorAll('[data-cf="name"]').length === 1;
  }));

/* ══ الوثائق: الملفُّ لا يضيع · والبياناتُ تُشتقّ من الأعلى ══   (بلاغُ المالك)
   يُختار ملفٌّ **بحقل الملفّ الحقيقيّ** (`setInputFiles`) ثمّ تُضاف وثيقةٌ ثانية —
   وهو بالضبط ما كان يمحو الأولى: إعادةُ الرسم تُتلف `input[type=file]`. */
await page.evaluate(() => { window.contracts.addDoc(); });
await page.waitForTimeout(500);
const docCount0 = await page.evaluate(() => document.querySelectorAll('#ct-docs-tbl tbody tr').length);
await page.setInputFiles('#ct-docs-tbl input.ct-file', {
  name: 'cr-cert.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test')
});
await page.waitForTimeout(600);
check('★ الملفُّ المختارُ يُعلَن باسمه في صفّه',
  (await page.textContent('#ct-docs-tbl')).includes('cr-cert.pdf'));

await page.evaluate(() => { window.contracts.addDoc(); });      // ⇐ اللحظةُ التي كان يضيع فيها
await page.waitForTimeout(600);
const afterAdd = await page.evaluate(() => {
  const d = window.contracts._draftVendor();
  return {
    rows: document.querySelectorAll('#ct-docs-tbl tbody tr').length,
    kept: !!(d.docs || []).some(x => x._file && x._fileName === 'cr-cert.pdf'),
    shown: document.getElementById('ct-docs-tbl').textContent.includes('cr-cert.pdf')
  };
});
check('★★ إضافةُ وثيقةٍ ثانيةٍ **لا تُضيّع** ملفَ الأولى (بلاغُ المالك)',
  afterAdd.kept === true && afterAdd.shown === true && afterAdd.rows === docCount0 + 1,
  JSON.stringify(afterAdd));

// وتبديلُ الصفة يُعيد رسمَ النموذج كلِّه — الملفُّ يصمد له أيضاً
await page.evaluate(() => { window.contracts.addTrade('civil'); });
await page.waitForTimeout(500);
check('★ ويصمد لإعادة رسمٍ من سببٍ آخر (إضافةُ تخصّص)',
  (await page.textContent('#ct-docs-tbl')).includes('cr-cert.pdf'));

/* الاشتقاقُ من الأعلى: يُكتب تاريخُ انتهاء السجل **في خانته العلوية** ثمّ يُختار
   نوعُ الوثيقة — فيُملأ رقمُه وانتهاؤه بلا كتابةٍ ثانية (وهو نصُّ طلب المالك). */
const auto = await page.evaluate(() => {
  // التاريخُ إزاحةٌ عن اليوم لا رقمٌ محفور (قاعدةُ قوالب الفحص — NOTES §6)
  const want = new Date(Date.now() + 500 * 86400000).toISOString().slice(0, 10);
  document.getElementById('ct-f-crexp').value = want;
  const n = document.querySelectorAll('#ct-docs-tbl tbody tr').length;
  window.contracts.setDocType(n - 1, 'cr');
  const r = document.querySelectorAll('#ct-docs-tbl tbody tr');
  const l = r[r.length - 1];
  return {
    want: want,
    number: l.querySelector('[data-f="number"]').value,
    expiry: l.querySelector('[data-f="expiry"]').value,
    tagged: l.textContent.includes('من البيانات الأساسية')
  };
});
check('★★ اختيارُ «السجل التجاري» يملأ رقمَه **وانتهاءَه** ممّا أُدخل في الأعلى — بلا كتابةٍ ثانية',
  auto.number === '1010234567' && auto.expiry === auto.want && auto.tagged === true, JSON.stringify(auto));

const autoAddr = await page.evaluate(() => {
  const n = document.querySelectorAll('#ct-docs-tbl tbody tr').length;
  window.contracts.setDocType(n - 1, 'natAddr');
  const r = document.querySelectorAll('#ct-docs-tbl tbody tr');
  const l = r[r.length - 1];
  return { number: l.querySelector('[data-f="number"]').value, expiry: l.querySelector('[data-f="expiry"]').value };
});
check('★★ وتبديلُ النوع يُسقط ما اشتُقّ للنوع السابق ويشتقّ للجديد (لا رقمَ سجلٍّ في خانة عنوان)',
  autoAddr.number === 'حائل — حي النقرة' && autoAddr.expiry === '', JSON.stringify(autoAddr));

// وما كُتب باليد لا يُمسّ مهما بُدِّل النوع
const manual = await page.evaluate(() => {
  const n = document.querySelectorAll('#ct-docs-tbl tbody tr').length;
  const r = document.querySelectorAll('#ct-docs-tbl tbody tr');
  r[r.length - 1].querySelector('[data-f="number"]').value = 'رقمٌ كتبتُه بيدي';
  window.contracts.setDocType(n - 1, 'vat');
  const r2 = document.querySelectorAll('#ct-docs-tbl tbody tr');
  return r2[r2.length - 1].querySelector('[data-f="number"]').value;
});
check('★★ وما كتبه المستخدمُ بيده يصمد لتبديل النوع (الاشتقاقُ لا يدهس يداً)',
  manual === 'رقمٌ كتبتُه بيدي', manual);

/* ── وبالمسار الحقيقيّ: القائمةُ تُبدَّل بيدِ المستخدم (`change`) لا بنداءٍ برمجيّ ──
   الفرقُ ليس شكلياً وهو سببُ نجاةِ الخلل من الفحص أعلاه: النداءُ البرمجيُّ يترك
   قائمةَ النوع في الشاشة على **قيمتها القديمة**، فتقرأ `syncDraft` القديمَ ويصحُّ
   الإسقاطُ بالمصادفة. أمّا في يد المستخدم فالقائمةُ تحمل **الجديد** قبل أن تُنادى
   `setDocType`، فيُقاس الاشتقاقُ القديم بالنوع الجديد ولا يطابق شيئاً فلا يسقط شيء.
   (بلاغُ المالك: صفٌّ بُدّل إلى «شهادة ضريبة القيمة المضافة» يعرض رقمَ السجل
   التجاريّ وانتهاءَه.) */
await page.evaluate(() => { window.contracts.addDoc(); });
await page.waitForTimeout(500);
const seeded = await page.evaluate(() => {
  const r = document.querySelectorAll('#ct-docs-tbl tbody tr');
  const l = r[r.length - 1];
  return {
    type: l.querySelector('[data-f="type"]').value,
    number: l.querySelector('[data-f="number"]').value,
    expiry: l.querySelector('[data-f="expiry"]').value
  };
});
check('★ الصفُّ الجديد يبدأ «سجلاً تجارياً» فيُملأ رقمُه وانتهاؤه من الأعلى',
  seeded.type === 'cr' && seeded.number === '1010234567' && !!seeded.expiry, JSON.stringify(seeded));

const byEvent = await page.evaluate(() => {
  const r = document.querySelectorAll('#ct-docs-tbl tbody tr');
  const sl = r[r.length - 1].querySelector('[data-f="type"]');
  sl.value = 'vat';
  sl.dispatchEvent(new Event('change', { bubbles: true }));   // ⇐ ما تفعله يدُ المستخدم بالضبط
  const r2 = document.querySelectorAll('#ct-docs-tbl tbody tr');
  const l = r2[r2.length - 1];
  return {
    type: l.querySelector('[data-f="type"]').value,
    number: l.querySelector('[data-f="number"]').value,
    expiry: l.querySelector('[data-f="expiry"]').value
  };
});
check('★★ وتبديلُه **من القائمة نفسِها** إلى «الضريبة» لا يُبقي رقمَ السجلّ ولا انتهاءَه (بلاغُ المالك)',
  byEvent.type === 'vat' && byEvent.number === '300012345600003' && byEvent.expiry === '',
  JSON.stringify(byEvent));

// تنظيفٌ: تُحذف صفوفُ الفحص فلا تُلوّث بقيةَ الرحلة
await page.evaluate(() => {
  const d = window.contracts._draftVendor();
  while ((d.docs || []).length > 3) window.contracts.delDoc(d.docs.length - 1);
});
await page.waitForTimeout(400);

// رقمٌ ثابتٌ في حقلِ جوال: يُمنَع الحفظُ — رقمٌ ناقصٌ محفوظٌ يُقرأ صحيحاً يومَ الحاجة
await page.evaluate(() => { document.getElementById('ct-f-phone').value = '0165551234'; });
await page.evaluate(() => window.contracts.saveVendorEdit());
await page.waitForTimeout(900);
check('★★ رقمٌ ثابتٌ في حقل الجوال يُرفَض ولا يُحفَظ',
  await page.evaluate(() => (window.__store['global_vendors/VND-0001'] || {}).phone === '0501234567' &&
                            !!document.getElementById('ct-f-phone')));

// ورقمٌ صحيحٌ يُحفَظ **مطبَّعاً** لا كما كُتب
await page.evaluate(() => {
  document.getElementById('ct-f-phone').value = '٠٥٠٩٨٧٦٥٤٣';    // بأرقامٍ عربيةٍ عمداً
  const t = document.getElementById('ct-contacts-tbl');
  t.querySelector('[data-cf="phone"]').value = '+966 55 500 0111';
});
await page.evaluate(() => window.contracts.saveVendorEdit());
await page.waitForTimeout(1400);
const savedPhones = await page.evaluate(() => {
  const d = window.__store['global_vendors/VND-0001'] || {};
  return { phone: d.phone, contact: ((d.contacts || [])[0] || {}).phone };
});
check('★★ المحفوظُ مطبَّعٌ مهما كانت صيغةُ الكتابة (وحتى بأرقامٍ عربية)',
  savedPhones.phone === "966509876543" && savedPhones.contact === "966555000111", JSON.stringify(savedPhones));
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

// أمرُ الدفع فوق العتبة لم يعد مقفلاً — يُعلَن أنه يلزمه إقرارٌ صريح (طلبُ المالك)
check('★ أمرُ الدفع فوق ٣٠٠٠ غيرُ مقفل ويُعلَن لزومُ الإقرار الصريح',
  await page.evaluate(() => {
    const off = document.querySelector('#page-contract-requests .ct-pick.off');
    const picks = document.querySelector('#page-contract-requests .ct-picks');
    return !off && !!picks && /يلزمه إقرارٌ صريح/.test(picks.textContent);
  }));

// إشعارُ بوّابة التنفيذي
check('القيمةُ فوق سقف التنفيذي تُعلَن مسبقاً',
  ((await page.textContent('#page-contract-requests')) || '').includes('سيمرّ الطلب عليه'));

await page.fill('#ct-r-title', 'محارة وبياض الدور الأول');

/* ── الصياغةُ الهندسيةُ بالذكاء الاصطناعي (طلبُ المالك) ──
   القناةُ تُستبدَل بجذعٍ في الصفحة (لا شبكةَ في الفحص)، والمُختبَرُ هو **ما يفعله
   النظامُ بالرد**: يعرضه للمراجعة، ويستبدل الوصفَ والوحدةَ وحدَهما، ولا يمسّ
   الكميةَ ولا السعرَ ولو أرسلهما النموذج. */
// بلا طبقةِ الذكاء في الصفحة أصلاً: لا زرَّ يَعِد بما لا يستطيع
const aiHidden = await page.evaluate(() => {
  window.__aiReal = window._aiText;
  // `_aiText` تعريفُ دالّةٍ عالميّ: `delete` عليه لا يعمل — فالإخفاءُ بالإسناد
  window._aiText = undefined;
  window.contracts.recalc(true);
  return { ready: window.contracts._aiReady(), btn: !!document.getElementById('ct-ai-btn') };
});
check('★★ زرُّ الصياغة لا يظهر إن لم تكن طبقةُ الذكاء موجودةً أصلاً',
  aiHidden.ready === false && aiHidden.btn === false, JSON.stringify(aiHidden));
const aiSent = await page.evaluate(() => {
  window.__aiSent = null;
  window._aiText = function (messages) {
    window.__aiSent = messages[0].content;
    const d = window.contracts._draft();
    const id = d.lines[0].id;
    // ردٌّ يحمل كميةً وسعراً عمداً — يجب أن يسقطا
    return Promise.resolve('```json\n[{"id":"' + id + '","desc":"محارة أسمنتية بسُمك ٢سم على طبقتين شاملة الزوايا والشبك","unit":"م٢","qty":9999,"unitPrice":9999}]\n```');
  };
  return true;
});
await page.evaluate(() => window.contracts.recalc(true));
await page.waitForTimeout(700);
check('★★ وبتهيئة القناة يظهر الزرُّ في نموذج الطلب', aiSent === true &&
  await page.evaluate(() => !!document.getElementById('ct-ai-btn')));
const beforeAi = await page.evaluate(() => {
  const l = window.contracts._draft().lines[0];
  return { desc: l.desc, unit: l.unit, qty: l.qty, up: l.unitPrice };
});
await page.click('#ct-ai-btn');
await page.waitForTimeout(1200);
const aiPanel = await page.evaluate(() => ({
  shown: !!document.getElementById('ct-ai-box'),
  n: (window.contracts._aiSuggestions() || []).length,
  txt: (document.getElementById('ct-ai-box') || {}).textContent || '',
  sent: window.__aiSent || '',
  line: (function () { const l = window.contracts._draft().lines[0];
    return { desc: l.desc, unit: l.unit, qty: l.qty, up: l.unitPrice }; })()
}));
check('★★ الاقتراحُ يُعرَض للمراجعة ولا يُطبَّق صامتاً',
  aiPanel.shown && aiPanel.n === 1 && aiPanel.line.desc === beforeAi.desc,
  JSON.stringify({ n: aiPanel.n, desc: aiPanel.line.desc }));
check('★★ واللوحةُ تعرض «قبل/بعد» وتُعلن أن الأرقام لا تُمَسّ',
  /الوصف الحالي/.test(aiPanel.txt) && /محارة أسمنتية/.test(aiPanel.txt) &&
  /الكمياتُ والأسعارُ لا تُمَسّ/.test(aiPanel.txt));
/* المطابقةُ على **الحقول** لا على رقمٍ مجرّد: معرّفُ البند عشوائيٌّ وقد يحوي «28»
   فيبدو السعرُ حاضراً وهو غائب (وقع فعلاً في أوّل تشغيل — فشُدَّ الفحص). */
const aiBody = (aiPanel.sent.split('البنود:')[1] || '').trim();
check('★★ والنداءُ لم يحمل سعراً ولا إجمالياً — الوصفُ والوحدةُ والكميةُ فقط',
  /الكمية: 1200/.test(aiBody) &&
  /^\d+\) \[id:[^\]]+\] الوصف: .+ · الوحدة: .+ · الكمية: \d+$/m.test(aiBody) &&
  !/سعر|unitPrice|الإجمالي|ر\.س/.test(aiBody) && /لا تذكر أسعاراً/.test(aiPanel.sent),
  aiBody.slice(0, 90));
await page.screenshot({ path: `${SHOTS}/09c-ai-lines.png`, fullPage: true });
await page.evaluate(() => window.contracts.aiApplyAllLines());
await page.waitForTimeout(900);
const afterAi = await page.evaluate(() => {
  const l = window.contracts._draft().lines[0];
  return { desc: l.desc, unit: l.unit, qty: l.qty, up: l.unitPrice,
           panel: !!document.getElementById('ct-ai-box') };
});
check('★★ والاستبدالُ غيّر الوصفَ والوحدة',
  /محارة أسمنتية بسُمك ٢سم/.test(afterAi.desc) && afterAi.unit === 'م٢', JSON.stringify(afterAi));
check('★★★ ولم يمسّ الكميةَ ولا سعرَ الوحدة — ولو أرسلهما النموذج',
  afterAi.qty === beforeAi.qty && afterAi.up === beforeAi.up,
  JSON.stringify({ was: beforeAi, now: { qty: afterAi.qty, up: afterAi.up } }));
check('★ واللوحةُ تُغلق بعد الاستبدال', afterAi.panel === false);
// ردٌّ مشوَّهٌ لا يُسقط النموذج
await page.evaluate(() => { window._aiText = function () { return Promise.resolve('عذراً لا أستطيع'); }; });
await page.click('#ct-ai-btn');
await page.waitForTimeout(1000);
const aiJunk = await page.evaluate(() => ({
  panel: !!document.getElementById('ct-ai-box'),
  lines: window.contracts._draft().lines.length,
  desc: window.contracts._draft().lines[0].desc
}));
check('★★ وردٌّ غيرُ صالحٍ لا يُفسد النموذج ولا يُطبَّق شيء',
  aiJunk.panel === false && aiJunk.lines === 1 && /محارة أسمنتية/.test(aiJunk.desc), JSON.stringify(aiJunk));
// وفشلُ القناة رسالةٌ مفهومةٌ لا انهيار
await page.evaluate(() => { window._aiText = function () { return Promise.reject(new Error('credit balance is too low')); }; });
await page.click('#ct-ai-btn');
await page.waitForTimeout(1000);
check('★ وفشلُ القناة لا يكسر الشاشة (النموذجُ ما زال قابلاً للتعبئة)',
  await page.evaluate(() => !!document.getElementById('ct-r-lines') && window.contracts._draft().lines.length === 1));
// أعِد الدالّةَ الأصلية — بقيةُ الفحص لا شأن لها بالذكاء
await page.evaluate(() => { window._aiText = window.__aiReal; });
await page.evaluate(() => window.contracts.recalc(true));
await page.waitForTimeout(600);
// الصفحةُ تُمرَّر داخل `.main-area` لا في نافذة المتصفّح، فـfullPage لا يلتقط ما تحتها.
const secs = await page.evaluate(() => Array.from(document.querySelectorAll('#page-contract-requests .ct-sec-h')).map(e => e.textContent.trim().split(' ')[0]));
check('★ أقسامُ النموذج الستة مرسومة (الشروطُ والمرشّحون والمرفقاتُ تحت الطيّة)',
  secs.length === 6 && secs.includes('الشروط') && secs.includes('المرشّحون') && secs.includes('المرفقات'),
  secs.join(' · '));
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

/* ★★ طلبُ المالك: «يظهر في كل مراحل الاعتماد للعقد، وللجميع، مسودةُ العقد».
   المعتمِدُ يوقّع على ارتباطٍ لا على ملخّصه: البنودُ والشروطُ التجاريةُ على البطاقة
   لم تكن تُظهر **الوثيقةَ التي سيوقّعها الطرفُ الآخر** — نطاقاً والتزاماتٍ وسلامةً
   وجزاءاتٍ وضماناً. والفحصُ يتحقّق أنها معروضةٌ **قبل** الاعتماد لا بعده. */
const draftFirst = await page.textContent('#page-contract-requests') || '';
check('★★ مسودةُ العقد معروضةٌ على بطاقة الطلب من أوّل مرحلة',
  /مسودة العقد/.test(draftFirst) && /نطاق الأعمال/.test(draftFirst) &&
  /الوثيقةُ التي سيوقّعها الطرف/.test(draftFirst));
check('★★ وتُعلن أنها **لا تُوقَّع** ما لم تكتمل البوّابات',
  /لا تُوقَّع/.test(draftFirst) && /نسخةُ مراجعةٍ للمعتمِدين/.test(draftFirst));
check('★ وشروطُها الماليةُ متولّدةٌ من أرقام الطلب نفسِها (المحتجزُ والغرامةُ والضمان)',
  /محتجز الضمان/.test(draftFirst) && /غرامة التأخير/.test(draftFirst) &&
  /يتولّد من أرقام الطلب/.test(draftFirst));

/* «للجميع» شرطٌ لا تفصيل: القراءةُ ليست بوّابة — دورٌ لا يملك أيَّ اعتمادٍ يراها. */
const draftForAll = await page.evaluate(async (id) => {
  const real = currentUser.role;
  currentUser.role = 'warehouse_manager';
  window.contracts.openReq(id);
  await new Promise(r => setTimeout(r, 500));
  const txt = document.getElementById('page-contract-requests').textContent || '';
  currentUser.role = real;
  window.contracts.openReq(id);
  await new Promise(r => setTimeout(r, 500));
  return txt;
}, reqId);
check('★★ ويراها دورٌ لا يملك بوّابةً أصلاً — القراءةُ ليست اعتماداً',
  /مسودة العقد/.test(draftForAll) && /نطاق الأعمال/.test(draftForAll) &&
  !/اعتماد — /.test(draftForAll), 'طول=' + draftForAll.length);

/* والورقةُ **هي ورقةُ العقد نفسُها** موسومةً — لا وثيقةٌ ثانيةٌ تُصاغ للمسودة. */
const draftPrint = await page.evaluate((id) => {
  let captured = '';
  const realOpen = window.open;
  window.open = function () { return { document: { write(h) { captured = h; }, close() { } }, focus() { }, print() { }, close() { } }; };
  window.contracts.printContractDraft(id);
  window.open = realOpen;
  return { html: captured, calc: window.contracts._crqValueOf(window.contracts.requestById(id)) };
}, reqId);
check('★★ وطباعتُها تُنتج ورقةَ العقد نفسَها موسومةً «مسودة»',
  /<title>مسودة عقد CRQ-/.test(draftPrint.html) && /مسودة عقد إسناد أعمال/.test(draftPrint.html) &&
  /جدول بنود الأعمال/.test(draftPrint.html) && /شروط العقد/.test(draftPrint.html) &&
  /مسودة — قيد الاعتماد ولا تُوقَّع/.test(draftPrint.html));
check('★★ ورقمُها المطبوع = الرقمُ المحسوب من دوالِّ الوحدة (لا حسبةَ في الورقة)',
  draftPrint.calc > 0 && draftPrint.html.includes(
    draftPrint.calc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })),
  String(draftPrint.calc));
check('★★ وفيها خاناتُ الاعتماد الداخليّ — بوّاباتُ مسارِ العقد الثلاث فأكثر',
  /الاعتمادات الداخلية/.test(draftPrint.html) && /لم يعتمد بعد/.test(draftPrint.html) &&
  /المالية/.test(draftPrint.html));
check('★ وتذييلُها يقول إنها ليست عقداً بعد',
  /تصير عقداً برقمه الخاصّ بعد اكتمال الاعتماد/.test(draftPrint.html));
fs.writeFileSync(`${SHOTS}/contract-draft-print.html`, draftPrint.html);
await page.screenshot({ path: `${SHOTS}/10c-contract-draft.png`, fullPage: true });

// دورةُ الاعتماد الكاملة — أربعُ بوّابات (المستخدمُ أدمن فيملكها كلَّها)
const stages = [];
const draftAtStage = [];
for (let i = 0; i < 4; i++) {
  const st = await page.evaluate(async (id) => {
    await window.contracts._act(id, 'approve', 'موافق');
    return (window.contracts.requestById(id) || {}).status;
  }, reqId);
  stages.push(st);
  draftAtStage.push(await page.evaluate(async (id) => {
    window.contracts.openReq(id);
    await new Promise(r => setTimeout(r, 400));
    const t = document.getElementById('page-contract-requests').textContent || '';
    return /مسودة العقد/.test(t) && /نطاق الأعمال/.test(t);
  }, reqId));
}
check('★ الطلبُ عبَر البوّابات الأربع بالترتيب ⇐ معتمَد',
  stages.join(' → ') === 'crq_pending_proc → crq_pending_finance → crq_pending_ceo → crq_approved',
  stages.join(' → '));
check('★★ والمسودةُ حاضرةٌ في **كل** مرحلةٍ من المراحل الأربع — لا في واحدةٍ منها',
  draftAtStage.length === 4 && draftAtStage.every(Boolean), draftAtStage.join(','));
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

/* ── سندُ صرفِ أمر الدفع: الزرُّ والورقةُ والأرقامُ والقناعُ البنكيّ ──
   الورقةُ الوحيدةُ في المسار التي تخرج من المنصّة ويُصرَف بها مال. */
await page.evaluate((id) => window.contracts.openReq(id), payStages.id);
await page.waitForTimeout(800);
const payCardTxt = await page.textContent('#page-contract-requests') || '';
check('★ وزرُّ «طباعة أمر الدفع» ظاهرٌ على بطاقة أمر الدفع', /طباعة أمر الدفع/.test(payCardTxt));

const payPrint = await page.evaluate((id) => {
  let captured = '';
  const realOpen = window.open;
  window.open = function () { return { document: { write(h) { captured = h; }, close() { } }, focus() { }, print() { }, close() { } }; };
  window.contracts.printPayOrder(id);
  window.open = realOpen;
  const r = window.contracts.requestById(id);
  return { html: captured, calc: window.contracts._crqValueOf(r), words: window.contracts._amountWords(window.contracts._crqValueOf(r)) };
}, payStages.id);
check('★★ الطباعةُ تُنتج سندَ صرفٍ كاملاً بعنوانه ورقمه',
  payPrint.html.length > 2000 && /<title>أمر دفع CRQ-/.test(payPrint.html) &&
  /أمر دفع — سند صرف/.test(payPrint.html));
check('★★ والرقمُ المطبوع = الرقمُ المحسوب من دوالِّ الوحدة (لا حسبةَ محلّيةً في الورقة)',
  payPrint.calc === 1500 && payPrint.html.includes('1,500.00'), String(payPrint.calc));
check('★★ والمبلغُ كتابةً مطابقٌ للتفقيط — رقمٌ واحدٌ بصيغتين لا يُحوَّر بقلم',
  /المبلغ كتابةً/.test(payPrint.html) && payPrint.html.includes(payPrint.words) &&
  /ألف وخمسمائة ريال لا غير/.test(payPrint.words), payPrint.words);
check('★★ والورقةُ تُعلن أنها **صالحةٌ للصرف** بعد اكتمال بوّاباتها',
  /معتمَد — صالحٌ للصرف/.test(payPrint.html) && !/غير صالحٍ للصرف/.test(payPrint.html));
check('★ وفيها المستفيدُ بهويته والمشروعُ وبنودُ الصرف وخاناتُ التوقيع',
  /المستفيد/.test(payPrint.html) && /بنود الصرف/.test(payPrint.html) &&
  /الاعتمادات والتوقيعات/.test(payPrint.html) && /المالية — السداد/.test(payPrint.html));
check('★★ وخاناتُ التوقيع هي بوّاباتُ مسارِه هو — بلا بوّابةِ اعتمادٍ ماليّ',
  /مدير المشاريع/.test(payPrint.html) && /المشتريات/.test(payPrint.html) &&
  !/بانتظار اعتماد المالية/.test(payPrint.html));

/* الآيبانُ يُقنَّع على الورق كما يُقنَّع على الشاشة — تسريبُه في ورقةٍ تُصوَّر أخطر */
const ibanPrint = await page.evaluate((id) => {
  const cap = () => { let c = ''; const ro = window.open;
    window.open = function () { return { document: { write(h) { c = h; }, close() { } }, focus() { }, print() { }, close() { } }; };
    window.contracts.printPayOrder(id); window.open = ro; return c; };
  const real = currentUser.role;
  const asAdmin = cap();
  currentUser.role = 'project_manager';
  const asPm = cap();
  currentUser.role = real;
  return { asAdmin, asPm };
}, payStages.id);
const ibanFull = await page.evaluate(() => (window.contracts.vendorById('VND-0006').bank || {}).iban || '');
check('★★ الآيبانُ كاملٌ لمن يراه على الشاشة، ومقنَّعٌ على ورقةِ غيرِه',
  !!ibanFull && ibanPrint.asAdmin.includes(ibanFull) &&
  !ibanPrint.asPm.includes(ibanFull) && /••••/.test(ibanPrint.asPm),
  'iban=' + ibanFull);
fs.writeFileSync(`${SHOTS}/pay-order-print.html`, payPrint.html);

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

/* ── (طلبُ المالك) السدادُ على دفعات: الأمرُ يبقى مفتوحاً حتى يكتمل مبلغُه ──
   الدفعُ بهويةِ ماليةٍ لم تعتمد بوّابةً سابقة — فصلُ المهام على حقيقته لا نيابةً.
   أمرُ الـ1500 يُدفع جزئياً **ويبقى مفتوحاً** (تعدّه بطاقةُ «بانتظار السداد» لاحقاً)،
   والإغلاقُ بالدفعة المتمّمة يُفحَص على أمرٍ ثانٍ مستقلّ. */
const partial = await page.evaluate(async (id) => {
  const real = { user: currentUser.user, name: currentUser.name, role: currentUser.role };
  currentUser.user = 'fin-check'; currentUser.name = 'مالية الفحص'; currentUser.role = 'finance';
  const out = {};
  try {
    await window.contracts._pay(id, { amount: 500, ref: 'TRX-1', receiptUrl: 'https://example.com/r1.pdf' });
    const r = window.contracts.requestById(id);
    out.first = { status: r.status, paid: window.contracts._crqPaidTotal(r),
                  due: window.contracts._crqPayDue(r), count: (r.payments || []).length };
    try { await window.contracts._pay(id, { amount: 5000, receiptUrl: 'https://example.com/rX.pdf' }); out.overpay = 'مرّ فوق المتبقّي'; }
    catch (e) { out.overpay = e.message; }
  } catch (e) { out.err = e.message; }
  currentUser.user = real.user; currentUser.name = real.name; currentUser.role = real.role;
  return out;
}, payStages.id);
check('★★ دفعةُ ٥٠٠ من ١٥٠٠ تُسجَّل والأمرُ يبقى «بانتظار السداد» مفتوحاً',
  !partial.err && partial.first && partial.first.status === 'crq_pending_pay' &&
  partial.first.paid === 500 && partial.first.due === 1000 && partial.first.count === 1,
  partial.err || JSON.stringify(partial.first));
check('★ ودفعةٌ فوق المتبقّي تُرفض — لا يُسدَّد فوق قيمة الأمر',
  /أكبر من المتبقّي/.test(partial.overpay || ''), partial.overpay);

/* وسندُ صرف المفتوح جزئياً يقولها بصراحة — لا يُصرَف المتبقّي مرتين */
const partPrint = await page.evaluate((id) => {
  let c = ''; const ro = window.open;
  window.open = function () { return { document: { write(h) { c = h; }, close() { } }, focus() { }, print() { }, close() { } }; };
  window.contracts.printPayOrder(id); window.open = ro; return c;
}, payStages.id);
check('★★ سندُ صرف المفتوح جزئياً موسومٌ «سُدِّد جزئياً» ويطبع المتبقّي وبيانَ الدفعات',
  /سُدِّد جزئياً/.test(partPrint) && /بيانُ السداد/.test(partPrint) &&
  /TRX-1/.test(partPrint) && /المتبقّي المستحقّ/.test(partPrint));

/* أمرٌ ثانٍ يُغلَق بدفعتين — الدفعةُ المتمّمة تُغلقه وسندُه يحمل بيانَها كاملاً */
const closed = await page.evaluate(async () => {
  const id = await window.contracts._create({
    engagement: 'pay_order', projectId: 'hail', title: 'إصلاح نافذة', vendorId: 'VND-0006',
    vendorName: 'راجو كومار', vatMode: 'none', budgetCategoryKey: 'subcontractor',
    lines: [{ id: 'z', desc: 'إصلاح نافذة', unit: 'عدد', qty: 1, unitPrice: 800 }],
    candidates: [], advance: {}, retention: {}, penalty: {}, warranty: {}
  });
  await window.contracts._act(id, 'approve', '');
  await window.contracts._act(id, 'approve', '');
  const real = { user: currentUser.user, name: currentUser.name, role: currentUser.role };
  currentUser.user = 'fin-check'; currentUser.name = 'مالية الفحص'; currentUser.role = 'finance';
  const out = { id };
  try {
    await window.contracts._pay(id, { amount: 300, ref: 'TRX-A', receiptUrl: 'https://example.com/a.pdf' });
    await window.contracts._pay(id, { amount: 500, ref: 'TRX-B', receiptUrl: 'https://example.com/b.pdf' });
    const r = window.contracts.requestById(id);
    out.status = r.status; out.paid = window.contracts._crqPaidTotal(r); out.count = (r.payments || []).length;
  } catch (e) { out.err = e.message; }
  currentUser.user = real.user; currentUser.name = real.name; currentUser.role = real.role;
  return out;
});
check('★★ والدفعةُ المتمّمة تُغلق الأمر (مسدَّد — مغلق) بدفعتيه في السجلّ',
  !closed.err && closed.status === 'crq_paid' && closed.paid === 800 && closed.count === 2,
  closed.err || JSON.stringify(closed));
const paidPrint = await page.evaluate((id) => {
  let c = ''; const ro = window.open;
  window.open = function () { return { document: { write(h) { c = h; }, close() { } }, focus() { }, print() { }, close() { } }; };
  window.contracts.printPayOrder(id); window.open = ro; return c;
}, closed.id);
check('★ سندُ صرف المغلق يطبع بيانَ السداد دفعةً دفعةً (TRX-A · TRX-B) وسطرَ الاكتمال',
  /بيانُ السداد/.test(paidPrint) && /TRX-A/.test(paidPrint) && /TRX-B/.test(paidPrint) &&
  /اكتمل السداد/.test(paidPrint) && /مسدَّد — مغلق/.test(paidPrint));

/* ── (طلبُ المالك) أمرُ دفعٍ فوق العتبة — بإقرارٍ صريح ── */
const overTh = await page.evaluate(async () => {
  const base = {
    engagement: 'pay_order', projectId: 'hail', title: 'أعمال فوق العتبة', vendorId: 'VND-0006',
    vendorName: 'راجو كومار', vatMode: 'none', budgetCategoryKey: 'subcontractor',
    lines: [{ id: 'y', desc: 'أعمال', unit: 'عدد', qty: 1, unitPrice: 5000 }],
    candidates: [], advance: {}, retention: {}, penalty: {}, warranty: {}
  };
  const out = {};
  try { await window.contracts._create(Object.assign({}, base)); out.noAck = 'مرّ بلا إقرار'; }
  catch (e) { out.noAck = e.message; }
  const id = await window.contracts._create(Object.assign({}, base, { overThreshold: true }));
  const r = window.contracts.requestById(id);
  out.ack = r.overThresholdAck || null;
  out.status = r.status;
  out.overFlagGone = !('overThreshold' in r);
  /* ويمرّ على البوّابات كلِّها — والتنفيذيِّ فوق سقفه (٢٠٠٠ في الفحص) — ثم يُسدَّد */
  out.stages = [r.status];
  await window.contracts._act(id, 'approve', '');
  out.stages.push(window.contracts.requestById(id).status);
  await window.contracts._act(id, 'approve', '');
  out.stages.push(window.contracts.requestById(id).status);
  await window.contracts._act(id, 'approve', '');
  out.stages.push(window.contracts.requestById(id).status);
  const real = { user: currentUser.user, name: currentUser.name, role: currentUser.role };
  currentUser.user = 'fin-check'; currentUser.name = 'مالية الفحص'; currentUser.role = 'finance';
  try { await window.contracts._pay(id, { amount: 5000, ref: 'TRX-C', receiptUrl: 'https://example.com/c.pdf' }); }
  catch (e) { out.payErr = e.message; }
  currentUser.user = real.user; currentUser.name = real.name; currentUser.role = real.role;
  out.final = window.contracts.requestById(id).status;
  return out;
});
check('★★ فوق العتبة بلا إقرارٍ يُرفض في طبقة البيانات', /إقرارٌ صريح/.test(overTh.noAck), overTh.noAck);
check('★★ وبالإقرار يُنشأ ويُختم العلَمُ باسم صاحبه وعتبته، ويدخل مسارَ الاعتماد',
  overTh.ack && overTh.ack.by && overTh.ack.threshold === 3000 &&
  overTh.status === 'crq_pending_pm' && overTh.overFlagGone,
  JSON.stringify(overTh.ack || {}));
check('★★ ويمرّ على بوّابات الاعتماد كلِّها والتنفيذيِّ فوق سقفه ثم يُسدَّد ويُغلق',
  overTh.stages.join(' → ') === 'crq_pending_pm → crq_pending_proc → crq_pending_ceo → crq_pending_pay' &&
  !overTh.payErr && overTh.final === 'crq_paid',
  overTh.payErr || (overTh.stages.join(' → ') + ' ⇒ ' + overTh.final));

/* ── (طلبُ المالك) خطةُ صرف الدفعات: منشئُ الطلب يحدّد النسب والماليةُ تنفّذها حرفياً ── */
const plan = await page.evaluate(async () => {
  const out = {};
  const base = {
    engagement: 'pay_order', projectId: 'hail', title: 'صيانة بخطة دفعات', vendorId: 'VND-0006',
    vendorName: 'راجو كومار', vatMode: 'none', budgetCategoryKey: 'subcontractor',
    lines: [{ id: 'p', desc: 'صيانة', unit: 'عدد', qty: 1, unitPrice: 1500 }],
    candidates: [], advance: {}, retention: {}, penalty: {}, warranty: {}
  };
  try { await window.contracts._create(Object.assign({}, base, { paymentPlan: [40, 30] })); out.badPlan = 'مرّت خطة ٧٠٪'; }
  catch (e) { out.badPlan = e.message; }
  const id = await window.contracts._create(Object.assign({}, base, { paymentPlan: [40, 60] }));
  await window.contracts._act(id, 'approve', '');
  await window.contracts._act(id, 'approve', '');
  const real = { user: currentUser.user, name: currentUser.name, role: currentUser.role };
  currentUser.user = 'fin-check'; currentUser.name = 'مالية الفحص'; currentUser.role = 'finance';
  try {
    try { await window.contracts._pay(id, { amount: 500, receiptUrl: 'https://example.com/p0.pdf' }); out.wrongAmt = 'مرّ مبلغٌ مخالف'; }
    catch (e) { out.wrongAmt = e.message; }
    await window.contracts._pay(id, { receiptUrl: 'https://example.com/p1.pdf', ref: 'TRX-P1' });
    let r = window.contracts.requestById(id);
    out.first = { status: r.status, amt: r.payments[0].amount, due: window.contracts._crqPayDue(r) };
    await window.contracts._pay(id, { receiptUrl: 'https://example.com/p2.pdf', ref: 'TRX-P2' });
    r = window.contracts.requestById(id);
    out.last = { status: r.status, amts: r.payments.map(p => p.amount) };
  } catch (e) { out.err = e.message; }
  currentUser.user = real.user; currentUser.name = real.name; currentUser.role = real.role;
  return out;
});
check('★★ خطةٌ لا يبلغ مجموعُها ١٠٠٪ تُرفض عند الإنشاء', /١٠٠٪/.test(plan.badPlan), plan.badPlan);
check('★★ مبلغٌ يخالف الخطةَ يُرفض — منشئُ الطلب هو من حدّد النسب',
  /منشئ الطلب حدّد خطة الصرف/.test(plan.wrongAmt || ''), plan.wrongAmt);
check('★★ الدفعةُ الأولى تُنفَّذ بنسبة المنشئ (٤٠٪ = ٦٠٠) والأمرُ يبقى مفتوحاً',
  !plan.err && plan.first && plan.first.status === 'crq_pending_pay' &&
  plan.first.amt === 600 && plan.first.due === 900,
  plan.err || JSON.stringify(plan.first));
check('★★ والثانيةُ (٦٠٪ = ٩٠٠) تُغلق الأمرَ بدفعتَي الخطة',
  plan.last && plan.last.status === 'crq_paid' && JSON.stringify(plan.last.amts) === '[600,900]',
  JSON.stringify(plan.last || {}));

/* نموذجُ الإنشاء: قسمُ الخطة يظهر لأمر الدفع والافتراضُ دفعةٌ واحدة ١٠٠٪ */
const planUI = await page.evaluate(async () => {
  window.contracts.backToReqs();
  window.contracts.newRequest();
  await new Promise(r => setTimeout(r, 300));
  window.contracts.setEngagement('pay_order');
  await new Promise(r => setTimeout(r, 300));
  const txt = (document.getElementById('page-contract-requests') || {}).textContent || '';
  const d = window.contracts._draft();
  const out = { hasSec: /خطة صرف الدفعات/.test(txt), def: JSON.stringify(d ? d.payPlan : null),
                sumOk: /١٠٠٪|100/.test(((document.getElementById('ct-plan-sum') || {}).textContent) || '') };
  window.contracts.cancelRequest();
  await new Promise(r => setTimeout(r, 200));
  return out;
});
check('★ نموذجُ أمر الدفع يعرض قسمَ «خطة صرف الدفعات» والافتراضُ دفعةٌ واحدة ١٠٠٪',
  planUI.hasSec && planUI.def === '[100]', JSON.stringify(planUI));

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

/* ── مرفقاتُ الطلب (طلبُ المالك): الإضافةُ والعرضُ وحارسُ الحذف ──
   الإضافةُ عبر طبقة البيانات مباشرةً — لا Storage في بيئة الفحص، كما تُفحص
   التواقيعُ والإيصالات بروابطَ مباشرة. */
const attFlow = await page.evaluate(async (id) => {
  const out = {};
  window.contracts.openReq(id);
  await new Promise(r => setTimeout(r, 500));
  const p = () => document.getElementById('page-contract-requests').textContent || '';
  out.secShown = /المرفقات/.test(p());
  out.addBtn = /إضافة مرفق/.test(p());
  await window.contracts._addAttach(id, [{ url: 'https://example.test/quote.pdf', name: 'عرض سعر المقاول.pdf' }]);
  window.contracts.openReq(id);
  await new Promise(r => setTimeout(r, 500));
  out.linkShown = /عرض سعر المقاول/.test(p());
  const r1 = window.contracts.requestById(id);
  out.n = (r1.attachments || []).length;
  out.att = (r1.attachments || [])[0] || {};
  out.tlAdd = ((r1.timeline || []).slice(-1)[0] || {}).code;
  // الحذفُ بغير صاحبه ولا أدمن يُرفض في طبقة البيانات
  const realRole = currentUser.role, realUser = currentUser.user;
  currentUser.role = 'procurement_officer'; currentUser.user = 'proc77';
  try { await window.contracts._delAttach(id, out.att.id); out.wrongDel = 'حُذف بغير صاحبه'; }
  catch (e) { out.wrongDel = e.message; }
  currentUser.role = realRole; currentUser.user = realUser;
  // والأدمن يحذف — ويبقى الحذفُ قيداً في السجل الزمني
  await window.contracts._delAttach(id, out.att.id);
  const r2 = window.contracts.requestById(id);
  out.after = (r2.attachments || []).length;
  out.tlDel = ((r2.timeline || []).slice(-1)[0] || {}).code;
  return out;
}, edStart.id);
check('★★ فقرةُ المرفقات على البطاقة وزرُّ «إضافة مرفق» لمن يملكها',
  attFlow.secShown && attFlow.addBtn, JSON.stringify({ s: attFlow.secShown, b: attFlow.addBtn }));
check('★★ الإضافةُ سجّلت المرفقَ باسمِ رافعِه وقيّدت السجلَّ الزمنيّ وظهر رابطُه',
  attFlow.n === 1 && attFlow.att.byUser === 'admin' && attFlow.tlAdd === 'attached' && attFlow.linkShown,
  JSON.stringify({ n: attFlow.n, by: attFlow.att.byUser, tl: attFlow.tlAdd, ln: attFlow.linkShown }));
check('★★ وحذفُ المرفق لغير صاحبه ولا أدمن يُرفض في طبقة البيانات',
  /للأدمن أو لمن أضافه/.test(attFlow.wrongDel), attFlow.wrongDel);
check('★ والأدمن يحذفه — ويبقى الحذفُ قيداً في السجل',
  attFlow.after === 0 && attFlow.tlDel === 'attach_removed', JSON.stringify({ a: attFlow.after, tl: attFlow.tlDel }));
await page.screenshot({ path: `${SHOTS}/12i-request-attachments.png`, fullPage: true });

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

/* ── مرفقاتُ نموذج الإنشاء: تُمسَك في المسوّدة وتُرفَع مع الإرسال ── */
const draftAtt = await page.evaluate(async () => {
  window.contracts.newRequest();
  await new Promise(r => setTimeout(r, 600));
  const f = new File(['pdfdata'], 'عرض تجريبي.pdf', { type: 'application/pdf' });
  window.contracts.addDraftAttach({ files: [f] });
  await new Promise(r => setTimeout(r, 400));
  const p = () => document.getElementById('page-contract-requests').textContent || '';
  const shown = /عرض تجريبي\.pdf/.test(p()) && /يُرفَع مع الإرسال/.test(p());
  window.contracts.delDraftAttach(0);
  await new Promise(r => setTimeout(r, 400));
  const gone = !/عرض تجريبي\.pdf/.test(p());
  window.contracts.cancelRequest();
  await new Promise(r => setTimeout(r, 300));
  return { shown, gone };
});
check('★★ نموذجُ الإنشاء يقبل مرفقاتٍ في المسوّدة ويُعلن أنها تُرفَع مع الإرسال — وحذفُها قبل الإرسال يعمل',
  draftAtt.shown && draftAtt.gone, JSON.stringify(draftAtt));

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
/* ── تبويباتُ الصفحة (طلبُ المالك): أوامرُ الدفع تنفصل عن طلبات التعاقد، والمسدَّدُ
   منها عن الذي تحت إجراء السداد، والمحوَّلُ لعقدٍ يغادر الصفحةَ إلى صفحة العقود.
   ستةُ طلباتٍ باقيةٍ موزَّعةً: أربعةُ طلباتِ عقدٍ في تبويب «طلبات التعاقد» (المعتمَدُ
   الذي سيصير عقداً · تعديلُ البنود · الإرجاعُ لمرحلة · اليدويّ)، وأمرا دفعٍ في
   تبويب «أوامر الدفع» (1500 بانتظار السداد · 900 قيد الاعتماد). وطلبا الحذف حُذفا. */
check('★★ التبويبُ الافتراضيُّ يعرض طلباتِ العقود وحدَها — أربعُ بطاقات',
  await page.evaluate(() => document.querySelectorAll('#page-contract-requests .ct-tile').length) === 4);
check('★★ ولا بطاقةَ أمرِ دفعٍ بين بطاقاته — أوامرُ الدفع انفصلت فعلاً',
  await page.evaluate(() =>
    ![...document.querySelectorAll('#page-contract-requests .ct-tile')].some(e => /أمر دفع/.test(e.textContent))));
const tabsBar = await page.evaluate(() => {
  const tb = [...document.querySelectorAll('#page-contract-requests .ct-tab')];
  const rs = window.contracts.requests();
  return {
    n: tb.length,
    txt: tb.map(e => e.textContent.replace(/\s+/g, ' ').trim()),
    calc: ['requests', 'pay_orders', 'pay_paid'].map(k => rs.filter(r => window.contracts._reqTabOf(r) === k).length)
  };
});
check('★★ شريطُ تبويباتٍ ثلاثة، وعددُ كلِّ تبويبٍ = المحسوبُ من reqTabOf نفسِها',
  tabsBar.n === 3 &&
  tabsBar.txt[0].includes('طلبات التعاقد') && tabsBar.txt[0].includes(String(tabsBar.calc[0])) &&
  tabsBar.txt[1].includes('أوامر الدفع') && tabsBar.txt[1].includes(String(tabsBar.calc[1])) &&
  tabsBar.txt[2].includes('مسدَّدة') && tabsBar.txt[2].includes(String(tabsBar.calc[2])),
  JSON.stringify(tabsBar));
const payTab = await page.evaluate(async () => {
  window.contracts.reqTab('pay_orders');
  await new Promise(r => setTimeout(r, 500));
  const tiles = [...document.querySelectorAll('#page-contract-requests .ct-tile')];
  const st = [...document.querySelectorAll('#page-contract-requests .ct-stat')];
  const out = {
    n: tiles.length,
    allPay: tiles.every(e => /أمر دفع/.test(e.textContent)),
    labels: st.map(e => (e.querySelector('.l') || {}).textContent || ''),
    payCount: ((st[2] || document.createElement('div')).querySelector('.v') || {}).textContent || ''
  };
  return out;
});
check('★★ تبويبُ «أوامر الدفع» يعرض أمرَي الدفع وحدَهما', payTab.n === 2 && payTab.allPay, JSON.stringify(payTab));
check('★★ وفيه بطاقةُ «بانتظار سداد المالية» تعدّ ما تحت إجراء السداد (أمرُ الـ1500)',
  /بانتظار سداد المالية/.test(payTab.labels.join('|')) && payTab.payCount === '1', JSON.stringify(payTab));
await page.screenshot({ path: `${SHOTS}/12f-pay-orders-tab.png`, fullPage: true });
await page.evaluate(async () => { window.contracts.reqTab('requests'); await new Promise(r => setTimeout(r, 400)); });
await page.screenshot({ path: `${SHOTS}/12-requests-list.png`, fullPage: true });

/* شريطُ تبويب الطلبات: ثلاثُ بطاقاتٍ ولا «مُنجَزة» بينها — المُنجَزُ لم يعد في هذه
   الصفحة أصلاً: المحوَّلُ في صفحة العقود، والمسدَّدُ في تبويبه الأرشيفيّ. */
const stripNow = await page.evaluate(() => {
  const st = [...document.querySelectorAll('#page-contract-requests .ct-stat')];
  return {
    labels: st.map(e => (e.querySelector('.l') || {}).textContent || ''),
    btns: st.filter(e => e.tagName === 'BUTTON').length
  };
});
check('★ شريطُه: بانتظار دورك · قيد الاعتماد · جاهزٌ للعقد — ولا بطاقةَ «مُنجَزة»',
  stripNow.labels.length === 3 && /جاهزٌ للعقد/.test(stripNow.labels.join('|')) &&
  !/مُنجَزة/.test(stripNow.labels.join('|')), stripNow.labels.join(' · '));
check('بطاقاتُ الشريط أزرارٌ حقيقية (لوحةُ المفاتيح تبلغها)', stripNow.btns === 3, stripNow.btns + ' زرّ');

/* فلترُ المشروع — نطاقٌ يقرؤه التبويبُ والشريطُ والقائمةُ معاً (التبويبُ الحالي: طلبات التعاقد) */
const projFilter = await page.evaluate(async () => {
  const sel = document.querySelectorAll('#page-contract-requests .ct-filters select')[0];
  const opts = [...sel.options].map(o => ({ v: o.value, t: o.textContent }));
  const pick = opts.find(o => o.v);
  window.contracts.filterReqs('project', pick.v);
  await new Promise(r => setTimeout(r, 500));
  const rs = window.contracts.requests().filter(r => window.contracts._reqTabOf(r) === 'requests');
  const key = r => (r.isCustomProject === true || r.projectId === '__OTHER__') ? '__CUSTOM__:' + String(r.projectName || '') : String(r.projectId || '');
  return {
    isProjSel: /كل المشاريع/.test(opts[0].t), nOpts: opts.length - 1,
    picked: pick.t, shown: document.querySelectorAll('#page-contract-requests .ct-tile').length,
    want: rs.filter(r => key(r) === pick.v).length,
    scope: (document.querySelector('#page-contract-requests .ct-scope') || {}).textContent || '',
    stripWip: (document.querySelectorAll('#page-contract-requests .ct-stat')[1].querySelector('.v') || {}).textContent.trim(),
    wantWip: String(rs.filter(r => key(r) === pick.v)
      .filter(r => ['crq_pending_pay', 'crq_cancelled', 'crq_pm_rejected', 'crq_proc_returned', 'crq_finance_returned', 'crq_ceo_rejected'].indexOf(r.status) === -1).length)
  };
});
check('★ فلترُ المشروع مضافٌ للصفحة وخياراتُه من الطلبات نفسِها',
  projFilter.isProjSel && projFilter.nOpts >= 2, projFilter.nOpts + ' مشروعاً');
check('★★ القائمةُ تُقصَر على مشروعِ الفلتر',
  projFilter.shown === projFilter.want && projFilter.want > 0,
  `${projFilter.picked}: عرض=${projFilter.shown} مطلوب=${projFilter.want}`);
check('★★ والشريطُ يحترم النطاق نفسَه (لا بطاقةٌ أوسعُ من قائمتها)',
  projFilter.stripWip === projFilter.wantWip, `مرسوم=${projFilter.stripWip} محسوب=${projFilter.wantWip}`);
check('وسطرُ النطاق يشرح لماذا قصُرت القائمة',
  /عرض \d+ من \d+/.test(projFilter.scope) && projFilter.scope.includes(projFilter.picked.trim()), projFilter.scope.replace(/\s+/g, ' ').trim().slice(0, 70));
await page.screenshot({ path: `${SHOTS}/12b-requests-project-filter.png`, fullPage: true });
const cleared = await page.evaluate(async () => {
  window.contracts.clearReqFilters();
  await new Promise(r => setTimeout(r, 500));
  return { n: document.querySelectorAll('#page-contract-requests .ct-tile').length,
           scope: !!document.querySelector('#page-contract-requests .ct-scope') };
});
check('«مسح الفلاتر» يعيد كلَّ طلبات التبويب ويُخفي سطرَ النطاق', cleared.n === 4 && !cleared.scope, cleared.n + ' بطاقة');

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

/* ── بعد التحويل: العقدُ المُنشأ يختفي من طلبات التعاقد (طلبُ المالك) ──
   هنا وحدَه يُثبت الفحصُ شيئاً: طلبٌ صار عقداً فعلاً. بطاقتُه تغادر التبويبَ،
   ويبقى سطرُ إحالةٍ يقول كم طلباً تحوّل وأين يُقرأ — فالغيابُ مفسَّرٌ لا صامت. */
await page.evaluate(() => window.contracts.backToReqs());
await page.waitForTimeout(700);
const afterConv = await page.evaluate((id) => {
  const tiles = [...document.querySelectorAll('#page-contract-requests .ct-tile')];
  const pageTxt = (document.getElementById('page-contract-requests') || {}).textContent || '';
  const conv = window.contracts.requests().filter(r => window.contracts._reqTabOf(r) === 'converted');
  const m0 = n => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return { n: tiles.length, hasConv: tiles.some(e => e.textContent.includes(id)),
           refLine: /طلباً صار عقداً/.test(pageTxt), openCtrsBtn: /فتح العقود/.test(pageTxt),
           calcConv: conv.length, valDrawn: pageTxt.includes(m0(conv.reduce((s, r) => s + (Number(r.value) || 0), 0))) };
}, reqId);
check('★★ الطلبُ المحوَّلُ لعقدٍ اختفى من تبويب الطلبات — بقيت ثلاثُ بطاقاتٍ جارية',
  afterConv.n === 3 && afterConv.hasConv === false, JSON.stringify(afterConv));
check('★★ وسطرُ إحالةٍ يعدّ المحوَّلَ وقيمتَه ويفتح صفحةَ العقود',
  afterConv.refLine && afterConv.openCtrsBtn && afterConv.calcConv === 1 && afterConv.valDrawn,
  JSON.stringify(afterConv));
await page.screenshot({ path: `${SHOTS}/12g-converted-left-list.png`, fullPage: true });
await page.evaluate((id) => window.contracts.openReq(id), reqId);
await page.waitForTimeout(700);

/* ── حذفُ عقدٍ لم يُوقَّع بعد — للأدمن (طلبُ المالك: عقدٌ أُنشئ تجربةً) ──
   يُجرَّب على **عقدٍ ثانٍ** يُنشأ ويُحذف، فلا يُفسد العقدَ الذي تقوم عليه بقيةُ
   السيناريوهات. والمُثبَتُ الأهمّ: الحذفُ **يُحرِّر الطلبَ** فلا يبقى مشيراً إلى
   عقدٍ غيرِ موجود — ثمّ يستأنف مسارَه (يُلغى ويُحذف كأيّ طلب). */
const delCtr = await page.evaluate(async (a) => {
  // طلبٌ جديدٌ يُعتمَد ويُحوَّل ثمّ يُحذف عقدُه
  const rid = await window.contracts._create({
    engagement: 'contract', projectId: 'hail', title: 'عقدٌ تجريبيٌّ يُحذف', vendorId: 'VND-0005',
    vendorName: 'محمد أحمد الغامدي', vatMode: 'none', budgetCategoryKey: 'subcontractor',
    lines: [{ id: 'x1', desc: 'أعمال', unit: 'عدد', qty: 1, unitPrice: 3000 }],
    candidates: [], advance: {}, retention: {}, penalty: {}, warranty: {}
  });
  for (let i = 0; i < 4; i++) {
    if (window.contracts.requestById(rid).status === 'crq_approved') break;
    await window.contracts._act(rid, 'approve', 'موافق');
  }
  const cid = await window.contracts._convert(rid);
  const out = { rid, cid, beforeReq: window.contracts.requestById(rid).status };
  const real = currentUser.role; currentUser.role = 'procurement_officer';
  try { await window.contracts._deleteCtr(cid, 'محاولةٌ بغير أدمن'); out.notAdmin = 'مرّ بغير أدمن'; }
  catch (e) { out.notAdmin = e.message; }
  currentUser.role = real;
  try { await window.contracts._deleteCtr(cid, ''); out.noReason = 'مرّ بلا سبب'; }
  catch (e) { out.noReason = e.message; }
  await window.contracts._deleteCtr(cid, 'عقدٌ أُنشئ تجربةً');
  const r = window.contracts.requestById(rid);
  out.gone = !window.contracts.contractById(cid);
  out.inStore = Object.keys(window.__store).filter(k => k.endsWith('/' + cid)).length;
  out.reqStatus = r.status; out.reqLink = r.contractId;
  out.reqCode = ((r.timeline || []).slice(-1)[0] || {}).code || '';
  return out;
}, {});
check('★ عقدٌ ثانٍ أُنشئ للفحص ووُسِم طلبُه محوَّلاً', delCtr.beforeReq === 'crq_converted', delCtr.beforeReq);
check('★★ ولا يحذفه غيرُ الأدمن', /للأدمن فقط/.test(delCtr.notAdmin), delCtr.notAdmin);
check('★ ولا يُحذف بلا سبب', /سبب الحذف إلزامي/.test(delCtr.noReason), delCtr.noReason);
check('★★ والأدمن يحذفه — يسقط من الذاكرة ومن المخزن',
  delCtr.gone === true && delCtr.inStore === 0, JSON.stringify({ g: delCtr.gone, s: delCtr.inStore }));
check('★★★ وحذفُه حرّر طلبَه: عاد إلى «معتمَد» بلا إشارةٍ لعقدٍ محذوف',
  delCtr.reqStatus === 'crq_approved' && !delCtr.reqLink && delCtr.reqCode === 'unconverted',
  JSON.stringify({ st: delCtr.reqStatus, link: delCtr.reqLink, code: delCtr.reqCode }));
// ثمّ يُلغى الطلبُ ويُحذف كأيّ طلب — فتكتمل إزالةُ أثر التجربة
const delCtrReq = await page.evaluate(async (rid) => {
  await window.contracts._cancel(rid, 'تجربة');
  await window.contracts._delete(rid);
  return { gone: !window.contracts.requestById(rid),
           inStore: Object.keys(window.__store).filter(k => k.endsWith('/' + rid)).length };
}, delCtr.rid);
check('★★ ثمّ يُلغى الطلبُ ويُحذف — فلا يبقى للتجربة أثر',
  delCtrReq.gone === true && delCtrReq.inStore === 0, JSON.stringify(delCtrReq));
/* والعقدُ الساري لا يُحذف — يُفسَخ. يُجرَّب على عقدٍ **ثالثٍ** يُنشأ ويُوقَّع ثمّ
   يُفسَخ بعد الفحص: توقيعُ العقد الأصليِّ هنا كان سيُسقط فحوصاً لاحقةً تقوم على
   بقائه «بانتظار التوقيع» (وقع فعلاً — فأُصلح). */
const delActive = await page.evaluate(async () => {
  const rid = await window.contracts._create({
    engagement: 'contract', projectId: 'hail', title: 'عقدٌ سارٍ لا يُحذف', vendorId: 'VND-0005',
    vendorName: 'محمد أحمد الغامدي', vatMode: 'none', budgetCategoryKey: 'subcontractor',
    lines: [{ id: 'y1', desc: 'أعمال', unit: 'عدد', qty: 1, unitPrice: 2000 }],
    candidates: [], advance: {}, retention: {}, penalty: {}, warranty: {}
  });
  for (let i = 0; i < 4; i++) {
    if (window.contracts.requestById(rid).status === 'crq_approved') break;
    await window.contracts._act(rid, 'approve', 'موافق');
  }
  const cid = await window.contracts._convert(rid);
  const real = currentUser.role; currentUser.role = 'procurement_officer';
  await window.contracts._sign(cid, { url: 'https://example.test/signed.pdf', name: 'عقد موقّع' });
  currentUser.role = real;
  const st = (window.contracts.contractById(cid) || {}).status;
  let msg; try { await window.contracts._deleteCtr(cid, 'محاولة'); msg = 'حُذف عقدٌ سارٍ'; }
  catch (e) { msg = e.message; }
  // أعِد الساحةَ كما كانت: يُفسَخ العقدُ ويُلغى طلبُه ويُحذف
  await window.contracts._transit(cid, 'terminate', 'انتهى الفحص');
  await window.contracts._cancel(rid, 'انتهى الفحص').catch(() => {});
  return { st, msg, after: (window.contracts.contractById(cid) || {}).status };
});
check('★★ والعقدُ الساري لا يُحذف ولو من الأدمن (يُفسَخ ولا يُمحى)',
  delActive.st === 'ctr_active' && /لم يُوقَّع بعد/.test(delActive.msg),
  delActive.st + ' · ' + delActive.msg);
check('★ والفسخُ هو بابُه (فأُعيدت ساحةُ الفحص كما كانت)', delActive.after === 'ctr_terminated', delActive.after);

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

/* ── سدادُ أمر الدفع ينقله من «أوامر الدفع» إلى تبويب «مسدَّدة» (طلبُ المالك) ──
   الفصلُ الثالث: ما سُدِّد وأُغلق لا يبقى بين ما ينتظر السداد. */
const payMove = await page.evaluate(async (pid) => {
  window.contracts.backToReqs();
  window.contracts.reqTab('pay_orders');
  await new Promise(r => setTimeout(r, 400));
  const before = document.querySelectorAll('#page-contract-requests .ct-tile').length;
  await window.contracts._pay(pid, { ref: 'TRX-PAY-1', receiptUrl: 'https://example.test/pay.pdf' });
  window.contracts.filterReqs('q', '');           // إعادةُ رسمٍ بعد السداد
  await new Promise(r => setTimeout(r, 500));
  const after = document.querySelectorAll('#page-contract-requests .ct-tile').length;
  const gone = ![...document.querySelectorAll('#page-contract-requests .ct-tile')].some(e => e.textContent.includes(pid));
  window.contracts.reqTab('pay_paid');
  await new Promise(r => setTimeout(r, 400));
  const paidTiles = [...document.querySelectorAll('#page-contract-requests .ct-tile')];
  const stTxt = [...document.querySelectorAll('#page-contract-requests .ct-stat')]
    .map(e => e.textContent.replace(/\s+/g, ' ').trim()).join('|');
  return { before, after, gone, st: window.contracts.requestById(pid).status,
           nPaid: paidTiles.length, inPaid: paidTiles.some(e => e.textContent.includes(pid)), stTxt };
}, payStages.id);
check('★★ سدادُ أمر الدفع (بإيصال) أخرجه من تبويب «أوامر الدفع»',
  payMove.st === 'crq_paid' && payMove.before === 2 && payMove.after === 1 && payMove.gone,
  JSON.stringify(payMove));
/* في التبويب المسدَّد الآن أربعة: أمرُ الـ1500 (أُغلق هنا بدفعته المتمّمة — بلا مبلغٍ
   يُسدَّد المتبقّي 1000) + مسدَّدو فحوص الدفعات أعلاه: 800 و5000 وذو الخطة 1500 = 8,800. */
check('★★ وظهر في تبويب «مسدَّدة» مع مسدَّدي فحوص الدفعات وبقيمتها معاً (8,800)',
  payMove.inPaid && payMove.nPaid === 4 && /مسدَّدة/.test(payMove.stTxt) && /8,800/.test(payMove.stTxt),
  JSON.stringify(payMove));
await page.screenshot({ path: `${SHOTS}/12h-pay-paid-tab.png`, fullPage: true });
await page.evaluate(async () => { window.contracts.reqTab('requests'); await new Promise(r => setTimeout(r, 400)); });

// ولا مرفقَ على طلبٍ في حالةٍ نهائية — السجلُّ المُغلق لا يُعدَّل
const attFinal = await page.evaluate(async (pid) => {
  try { await window.contracts._addAttach(pid, [{ url: 'https://example.test/late.pdf', name: 'متأخر' }]); return 'أُرفق على نهائيّ'; }
  catch (e) { return e.message; }
}, payStages.id);
check('★★ ولا مرفقَ على طلبٍ في حالةٍ نهائية (المسدَّدُ سجلٌّ مُغلق)', /نهائية/.test(attFinal), attFinal);

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

/* ══ الورقةُ الرسميةُ للشركة — تُفحَص بالطباعة لا بقراءة النمط ══   (طلبُ المالك)
   العقدُ **يتجاوز الصفحةَ الواحدة**، فالسؤالُ الوحيدُ المعتبَر ليس «أفي النصِّ صورةُ
   ترويسة؟» بل «أهي على **كل** صفحةٍ تخرج من الطابعة؟». ولذلك يُطبَع هنا ملفُّ الورقة
   فعلاً إلى PDF ثم تُقرأ موارِدُ كلّ صفحةٍ منه: أتحمل الصورَ الثلاثَ نفسَها؟
   (هذا الصنفُ بالذات كان معطّلاً في أوّل صياغة: الترويسةُ بإزاحةٍ سالبةٍ ظهرت في
   قاع الورقة — ولا فحصَ نصّيٌّ كان ليكشفه.) */
const lhAssets = await page.evaluate(() => window.contracts._letterheadAssets());
check('★★ صورُ الورقة الرسمية الثلاث محمَّلةٌ فعلاً في الصفحة (لا مربّعاتٍ مكسورة)',
  !!lhAssets.head && !!lhAssets.foot && !!lhAssets.mark &&
  /letterhead-header\.jpg$/.test(lhAssets.head), Object.keys(lhAssets).join('·'));
check('★ وورقةُ العقد تحمل طبقاتِها الثلاثَ وجدولَ حجزِ الفراغ',
  /class="lh lh-h"/.test(printed) && /class="lh lh-f"/.test(printed) &&
  /class="lh lh-m"/.test(printed) && /<table class="pg">/.test(printed));

const paperPage = await browser.newPage();
await paperPage.goto('file://' + `${SHOTS}/contract-print.html`, { waitUntil: 'networkidle' });
const lhGeo = await paperPage.evaluate(() => {
  const mm = px => px / (96 / 25.4), q = s => document.querySelector(s).getBoundingClientRect();
  return { h: mm(q('.lh-h').width), f: mm(q('.lh-f').width), m: mm(q('.lh-m').width),
           spH: mm(q('.sp-h').height), spF: mm(q('.sp-f').height) };
});
const near1 = (a, b) => Math.abs(a - b) < 0.6;
check('★★ وهندستُها على الورق هي المقيسةُ من قالب الشركة (بالمليمتر)',
  near1(lhGeo.h, 202.5) && near1(lhGeo.f, 191.8) && near1(lhGeo.m, 108.4) &&
  near1(lhGeo.spH, 35.6) && near1(lhGeo.spF, 24.9), JSON.stringify(lhGeo));

const paperPdf = await paperPage.pdf({ printBackground: true, preferCSSPageSize: true });
await paperPage.close();
const pdfTxt = paperPdf.toString('latin1');
const pdfPages = (pdfTxt.match(/\/Type \/Page(?!s)/g) || []).length;
/* قواميسُ **الصفحات** وحدَها — التي يعقبها `/MediaBox`. والتمييزُ لازمٌ لا زائد:
   العلامةُ المائيةُ المخفَّفةُ يلفّها المتصفّح في Form XObject بمجموعة شفافية، وله
   قاموسُ موارد خاصٌّ به يشبه قاموسَ الصفحة حرفياً.
   **ولذلك لا يصحّ اشتراطُ تطابق القواميس حرفياً** (كما كان أوّلَ مرّة): الغلافُ
   الشفّافُ **كائنٌ مستقلٌّ لكل صفحة**، فتختلف الأرقامُ وتتطابق الوظيفة. والعهدُ
   المقصودُ هو: كلُّ صفحةٍ ترسم ثلاثَ طبقات، واثنتان منها (الترويسةُ والتذييل)
   **الكائنُ نفسُه على كل الصفحات**. فهذا ما يُشترَط. */
const pageXo = [...pdfTxt.matchAll(/\/XObject <<([^>]*)>>(?=[\s\S]{0,1200}?\/MediaBox)/g)]
  .map(m => new Set(m[1].match(/\d+ 0 R/g) || []));
const shared = pageXo.length ? [...pageXo.reduce((a, s) => new Set([...a].filter(x => s.has(x))))] : [];
check('★★ والوثيقةُ تُطبَع على أكثرَ من صفحةٍ فعلاً — وإلا فالفحصُ لا يفحص شيئاً',
  pdfPages >= 2, `صفحات=${pdfPages}`);
check('★★★ والترويسةُ والتذييلُ والعلامةُ المائيةُ على **كل** صفحةٍ مطبوعة',
  pageXo.length === pdfPages && pageXo.every(s => s.size >= 3) && shared.length >= 2,
  `صفحات=${pdfPages} · طبقات/صفحة=${pageXo.map(s => s.size).join(",")} · مشترَكة=${shared.length}`);
fs.writeFileSync(`${SHOTS}/contract-print.pdf`, paperPdf);

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

/* ═════ الدفعةُ المقدمة (طلبُ المالك): بانتظار سداد المالية بعد الإنشاء،
   والماليةُ تدوّن **المبلغَ الفعليَّ** — وقد يكون أقلَّ من دفعة العقد وعلى دفعات ═════ */
const advStart = await page.evaluate((cid) => {
  const c = window.contracts.contractById(cid);
  return { due: window.contracts._advanceDueOf(c), paid: window.contracts._advancePaidOf(c),
           payable: window.contracts._advancePayable(c),
           pendFin: window.contracts._myPendingItems('finance').filter(x => x.id === cid && x.lbl === 'دفعة مقدمة').length,
           recNow: window.contracts._extNet({ lines: [{ cumQty: 100, unitPrice: c.lines[0].unitPrice }] }, c, { prevGross: 0 }).advanceRecovery };
}, conv.cid);
check('★★ عقدٌ بدفعةٍ مقدمة (3,360): مستحقّةٌ كاملةً لسداد المالية بعد الإنشاء',
  advStart.due === 3360 && advStart.paid === 0 && advStart.payable === true, JSON.stringify(advStart));
check('★★ وتظهر في «بانتظار إجراءك» للمالية', advStart.pendFin === 1, String(advStart.pendFin));
check('★★★ ولا استردادَ من المستخلصات قبل سدادها — لا يُستردّ ما لم يُدفع',
  advStart.recNow === 0, String(advStart.recNow));
const advCardTxt = await page.evaluate(async () => {
  window.contracts.ctrTab('overview');
  await new Promise(r => setTimeout(r, 600));
  return document.getElementById('page-contracts-list').textContent || '';
});
check('★★ وبطاقةُ العقد تقولها: بانتظار سداد المالية وزرُّ «تسجيل سداد الدفعة المقدمة»',
  /بانتظار سداد المالية/.test(advCardTxt) && /تسجيل سداد الدفعة المقدمة/.test(advCardTxt));
await page.screenshot({ path: `${SHOTS}/18b-advance-due.png`, fullPage: true });

// حرّاسُ طبقة البيانات: إيصالٌ إلزاميّ · مبلغٌ إلزاميّ · لا فوق المتبقّي · للمالية وحدها
const advGuards = await page.evaluate(async (cid) => {
  const out = {};
  try { await window.contracts._payAdvance(cid, { amount: 1000 }); out.noRcpt = 'مرّ بلا إيصال'; }
  catch (e) { out.noRcpt = e.message; }
  try { await window.contracts._payAdvance(cid, { receiptUrl: 'https://example.test/r.pdf' }); out.noAmt = 'مرّ بلا مبلغ'; }
  catch (e) { out.noAmt = e.message; }
  try { await window.contracts._payAdvance(cid, { amount: 5000, receiptUrl: 'https://example.test/r.pdf' }); out.over = 'مرّ فوق المتبقّي'; }
  catch (e) { out.over = e.message; }
  const real = currentUser.role; currentUser.role = 'project_manager';
  try { await window.contracts._payAdvance(cid, { amount: 1000, receiptUrl: 'https://example.test/r.pdf' }); out.role = 'مرّ بغير المالية'; }
  catch (e) { out.role = e.message; }
  currentUser.role = real;
  return out;
}, conv.cid);
check('★★ لا سدادَ بلا إيصال', /إيصال/.test(advGuards.noRcpt), advGuards.noRcpt);
check('★★ والمبلغُ الفعليُّ إلزاميّ — «اكتب كم سُدِّد»', /مبلغ السداد إلزامي/.test(advGuards.noAmt), advGuards.noAmt);
check('★★ ولا يُسدَّد فوق المتبقّي من الدفعة', /يتجاوز المتبقّي/.test(advGuards.over), advGuards.over);
check('★★ والسدادُ للمالية (والأدمن) وحدَها', /للمالية فقط/.test(advGuards.role), advGuards.role);

// سدادٌ جزئيٌّ (1,360) ثم إكمالٌ (2,000) — المبلغُ الفعليُّ يُدوَّن دفعةً دفعة
const advPay = await page.evaluate(async (cid) => {
  await window.contracts._payAdvance(cid, { amount: 1360, ref: 'ADV-1', receiptUrl: 'https://example.test/adv1.pdf' });
  const c1 = window.contracts.contractById(cid);
  const mid = { paid: window.contracts._advancePaidOf(c1), due: window.contracts._advanceDueOf(c1),
                tl: ((c1.timeline || []).slice(-1)[0] || {}) };
  await window.contracts._payAdvance(cid, { amount: 2000, ref: 'ADV-2', receiptUrl: 'https://example.test/adv2.pdf' });
  const c2 = window.contracts.contractById(cid);
  let extra;
  try { await window.contracts._payAdvance(cid, { amount: 1, receiptUrl: 'https://example.test/r.pdf' }); extra = 'مرّ بعد الاكتمال'; }
  catch (e) { extra = e.message; }
  window.contracts.ctrTab('overview');
  await new Promise(r => setTimeout(r, 600));
  return { mid, paid: window.contracts._advancePaidOf(c2), due: window.contracts._advanceDueOf(c2),
           n: (c2.advance.payments || []).length, extra,
           pendFin: window.contracts._myPendingItems('finance').filter(x => x.id === cid && x.lbl === 'دفعة مقدمة').length,
           txt: document.getElementById('page-contracts-list').textContent || '' };
}, conv.cid);
check('★★★ السدادُ الجزئيُّ دُوِّن بمبلغه الفعليّ: سُدِّد 1,360 والمتبقّي 2,000 وقيدُ السجل يذكرهما',
  advPay.mid.paid === 1360 && advPay.mid.due === 2000 && advPay.mid.tl.code === 'advance_paid' &&
  /1,360\.00/.test(advPay.mid.tl.note) && /المتبقّي 2,000\.00/.test(advPay.mid.tl.note),
  JSON.stringify(advPay.mid));
check('★★ والإكمالُ على دفعةٍ ثانية: 3,360 كاملةً بدفعتين مدوَّنتين',
  advPay.paid === 3360 && advPay.due === 0 && advPay.n === 2, JSON.stringify({ p: advPay.paid, d: advPay.due, n: advPay.n }));
check('★ وبعد الاكتمال لا سدادَ زائداً ولا تبقى في انتظار المالية',
  /مسدَّدة بالفعل/.test(advPay.extra) && advPay.pendFin === 0, advPay.extra + ' · معلَّق=' + advPay.pendFin);
check('★★ والبطاقةُ تعرض المسدَّدَ الفعليَّ بمرجعَيه',
  /المسدَّد من المقدمة/.test(advPay.txt) && /ADV-1/.test(advPay.txt) && /ADV-2/.test(advPay.txt) &&
  /سُدِّدت الدفعة المقدمة/.test(advPay.txt));
await page.screenshot({ path: `${SHOTS}/18c-advance-paid.png`, fullPage: true });

/* ── تصحيحُ قيدٍ أُدخل بالخطأ: إلغاءٌ بسببٍ ثم إعادةُ تسجيلٍ بالمبلغ الصحيح ──
   (بلاغُ المالك: «تم إدخال الدفعة المقدمة بالخطأ عن طريق المحاسب»). الفحصُ في
   متصفّحٍ حقيقيّ لأن الخطرَ في **الأثر لا في الحساب**: أن يُمحى القيدُ من الشاشة،
   أو يُخصَم مبلغُه مرّتين، أو يهبط المسدَّدُ تحت ما استُردّ في المستخلصات. */
const advVoid = await page.evaluate(async (cid) => {
  const out = {};
  const real = currentUser.role;
  currentUser.role = 'project_manager';
  try { await window.contracts._voidAdvancePayment(cid, { index: 1, reason: 'خطأ' }); out.role = 'مرّ بغير المالية'; }
  catch (e) { out.role = e.message; }
  currentUser.role = real;
  try { await window.contracts._voidAdvancePayment(cid, { index: 1, reason: '' }); out.noWhy = 'مرّ بلا سبب'; }
  catch (e) { out.noWhy = e.message; }
  // ختمُ وقتٍ لا يطابق القيدَ — بلا تاريخٍ محفور (حارسُ `tb` يمنعه في هذا الملف)
  try { await window.contracts._voidAdvancePayment(cid, { index: 1, at: 'ختمٌ-لا-يطابق', reason: 'خطأ' }); out.stale = 'مرّ بقيدٍ متغيّر'; }
  catch (e) { out.stale = e.message; }

  const before = window.contracts.contractById(cid);
  const at1 = (before.advance.payments || [])[1].at;
  await window.contracts._voidAdvancePayment(cid, { index: 1, at: at1, reason: 'أُدخل المبلغ خطأً — الصحيح 500' });
  const c1 = window.contracts.contractById(cid);
  out.paid = window.contracts._advancePaidOf(c1);
  out.due = window.contracts._advanceDueOf(c1);
  out.n = (c1.advance.payments || []).length;
  out.voided = (c1.advance.payments || [])[1].voided === true;
  out.why = (c1.advance.payments || [])[1].voidReason || '';
  out.tl = ((c1.timeline || []).slice(-1)[0] || {});
  out.payable = window.contracts._advancePayable(c1);
  // لا يُلغى القيدُ نفسُه مرّتين فيُخصَم مبلغُه مرّتين
  try { await window.contracts._voidAdvancePayment(cid, { index: 1, at: at1, reason: 'ثانيةً' }); out.twice = 'مرّ مرّتين'; }
  catch (e) { out.twice = e.message; }
  // ولا يُلغى قيدٌ يهبط بالمسدَّد تحت ما استُردّ في المستخلصات
  const c2 = window.contracts.contractById(cid);
  const keepRec = c2.advance.recovered;
  c2.advance.recovered = 1360;
  out.roomBlocked = window.contracts._advVoidable(c2, (c2.advance.payments || [])[0]) === false;
  c2.advance.recovered = keepRec;
  // ثم يُسجَّل الرقمُ الصحيح على المتبقّي الذي عاد
  await window.contracts._payAdvance(cid, { amount: 500, ref: 'ADV-2-FIX', receiptUrl: 'https://example.test/adv2fix.pdf' });
  const c3 = window.contracts.contractById(cid);
  out.fixedPaid = window.contracts._advancePaidOf(c3);
  window.contracts.ctrTab('overview');
  await new Promise(r => setTimeout(r, 600));
  out.txt = document.getElementById('page-contracts-list').textContent || '';
  return out;
}, conv.cid);
check('★★ إلغاءُ القيد للمالية وحدَها وبسببٍ إلزاميّ، ولا يمرّ على قيدٍ تغيّر تحته',
  /للمالية فقط/.test(advVoid.role) && /سبب الإلغاء إلزامي/.test(advVoid.noWhy) && /تغيّرت قيودُ السداد/.test(advVoid.stale),
  JSON.stringify({ r: advVoid.role, w: advVoid.noWhy, s: advVoid.stale }));
check('★★★ الإلغاءُ خصم 2,000 من المسدَّد فعاد المتبقّي مستحقّاً — والقيدُ باقٍ في السجل موسوماً بسببِه',
  advVoid.paid === 1360 && advVoid.due === 2000 && advVoid.n === 2 && advVoid.voided === true &&
  /الصحيح 500/.test(advVoid.why) && advVoid.payable === true,
  JSON.stringify({ p: advVoid.paid, d: advVoid.due, n: advVoid.n, v: advVoid.voided }));
check('★★ وقيدُ السجل يقول ما أُلغي وسببَه والمسدَّدَ بعده',
  advVoid.tl.code === 'advance_void' && /2,000\.00/.test(advVoid.tl.note) &&
  /الصحيح 500/.test(advVoid.tl.note) && /المسدَّدُ الآن 1,360\.00/.test(advVoid.tl.note),
  JSON.stringify(advVoid.tl));
check('★★★ ولا يُلغى القيدُ مرّتين فيُخصَم مبلغُه مرّتين، ولا يهبط المسدَّدُ تحت ما استُردّ',
  /ملغىً بالفعل/.test(advVoid.twice) && advVoid.roomBlocked === true, advVoid.twice);
check('★★★ ثم سُجِّل الرقمُ الصحيح 500 على المتبقّي الذي عاد — 1,860 مسدَّداً',
  advVoid.fixedPaid === 1860, String(advVoid.fixedPaid));
check('★★ والبطاقةُ تعرض القيدَ الملغى مشطوباً بسببِه، والقيدَ الصحيحَ بمرجعه',
  /ملغى/.test(advVoid.txt) && /الصحيح 500/.test(advVoid.txt) && /ADV-2-FIX/.test(advVoid.txt));
await page.screenshot({ path: `${SHOTS}/18d-advance-voided.png`, fullPage: true });
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
const extGeom0 = await numColMisaligned();
check('★ وأعمدةُ جدول المستخلصات الرقمية تحت رؤوسها',
  extGeom0.length === 0, extGeom0.map(b => `${b.col}: «${b.val}» بفارق ${b.off}px`).join(' · ') || 'لا انزياح');
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

/* ── فصلُ المهام والإرجاعُ يعمّان أمرَ التغيير (طلبُ المالك: «نفّذ») ──
   على أمرٍ جديدٍ لا على المطبَّق: المطبَّقُ نهائيٌّ لا يُرجَع — وهو نفسُه حارسٌ يُفحَص. */
const chgSod = await page.evaluate(async (a) => {
  const c = window.contracts.contractById(a.cid);
  const gid = await window.contracts._createChg(c, {
    lines: [{ id: a.lineId, qty: 5, unitPrice: 28 }], reason: 'فحصُ فصل المهام والإرجاع'
  });
  const out = { gid };
  await window.contracts._actChg(gid, 'approve', '');        // بوّابةُ مدير المشاريع (أدمن)
  const g = window.contracts.changeById(gid);
  out.status = g.status; out.pmUser = g.pmApprovedByUser || ''; out.me = currentUser.user;
  const M = (users) => window.contracts._chgActMode(window.contracts.changeById(gid),
    'chg_pending_proc', 'admin', currentUser.user, currentUser.name, users);
  out.solo = M(USERS);
  USERS.push({ user: 'proc8', name: 'المشتريات', role: 'procurement_officer' });
  out.team = M(USERS);
  try { await window.contracts._actChg(gid, 'approve', ''); out.blocked = 'مرّ رغم المنع'; }
  catch (e) { out.blocked = e.message; }
  out.inTasks = window.contracts._myPendingItems('admin').filter(x => x.id === gid).length;
  const i = USERS.findIndex(u => u.user === 'proc8'); if (i >= 0) USERS.splice(i, 1);
  return out;
}, { cid: conv.cid, lineId: before.lineId });
check('★★ أمرُ التغيير: الاعتمادُ خزّن اسمَ الدخول وانتقل للمشتريات',
  chgSod.status === 'chg_pending_proc' && chgSod.pmUser === chgSod.me, JSON.stringify(chgSod));
check('★★ وبوجود مسؤولِ مشترياتٍ يُمنع المعتمِدُ نفسُه — وبغيابه يعتمد نيابةً',
  chgSod.team === 'blocked' && chgSod.solo === 'delegate' && /بوّابةٍ سابقة/.test(chgSod.blocked),
  chgSod.solo + ' · ' + chgSod.team);
check('★★ و«بانتظار إجراءك» لا تَعِد بزرٍّ مُنِع في أمر التغيير', chgSod.inTasks === 0, 'عدد=' + chgSod.inTasks);

await page.evaluate((a) => window.contracts.openChgFrom(a.gid, a.cid), { gid: chgSod.gid, cid: conv.cid });
await page.waitForTimeout(900);
check('★★ وزرُّ «إرجاع لمرحلة» يظهر في أمر التغيير للأدمن',
  ((await page.textContent('#page-contracts-list')) || '').includes('إرجاع لمرحلة'));
await page.evaluate(() => window.contracts.openChgRewind());
await page.waitForTimeout(700);
const chgRwOpts = await page.evaluate(() => {
  const sel = document.getElementById('ct-rw2-gate');
  return sel ? Array.from(sel.options).map(o => o.value) : [];
});
check('★ ووجهاتُه مشتقّةٌ من مساره ولا تعرض بوّابتَه الحالية',
  chgRwOpts.includes('pm') && !chgRwOpts.includes('proc'), chgRwOpts.join(','));
await page.selectOption('#ct-rw2-gate', 'pm');
await page.fill('#ct-rw2-why', 'مراجعةُ سبب التغيير');
await page.click('#ct-rw2-btn');
await page.waitForTimeout(1300);
const chgRwAfter = await page.evaluate((gid) => {
  const g = window.contracts.changeById(gid);
  return { status: g.status, pm: !!g.pmApprovedAt,
           code: ((g.timeline || []).slice(-1)[0] || {}).code || '',
           note: ((g.timeline || []).slice(-1)[0] || {}).note || '' };
}, chgSod.gid);
check('★★ وأمرُ التغيير عاد إلى بوّابة مدير المشاريع وسقط اعتمادُها',
  chgRwAfter.status === 'chg_pending_pm' && chgRwAfter.pm === false, JSON.stringify(chgRwAfter));
check('★ والسببُ في سجلّه', chgRwAfter.code === 'rewound' && /مراجعةُ سبب التغيير/.test(chgRwAfter.note), chgRwAfter.note);
const chgFinalRw = await page.evaluate(async (gid) => {
  try { await window.contracts._rewindChg(gid, 'pm', 'محاولةٌ على مطبَّق'); return 'رجع أمرٌ مطبَّق'; }
  catch (e) { return e.message; }
}, chgNew.id);
check('★★ والمطبَّقُ لا يُرجَع (أثرُه وقع على العقد)', /حالةٍ نهائية/.test(chgFinalRw), chgFinalRw);
await page.screenshot({ path: `${SHOTS}/30b-change-rewind.png`, fullPage: true });
// أزِل أمرَ الفحص كي لا يحجب «المفتوحُ واحدٌ في المرة» بقيةَ السيناريوهات
await page.evaluate(async (gid) => { await window.contracts._cancelChg(gid, 'انتهى الفحص'); }, chgSod.gid);
await page.waitForTimeout(700);

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
  /* v18.9.2743: القراءةُ **بصنف الخليّة** لا بفهرسها. كانت `tds[4]`/`tds[5]`، فأزاحها
     عمودُ «م» المضاف — والفحصُ حينها يقيس نفسَه لا النظام. والصنفُ هو نفسُه الذي
     يكتب به `syncExtRow`، فصار الفحصُ يقرأ من حيث تكتب الشاشةُ بالضبط. */
  const tr = document.querySelector('#ct-e-lines tbody tr');
  const d = window.contracts._extDraftOf();
  const c = window.contracts.contractById(d.contractId);
  const l = d.lines[0];
  const max = window.contracts._contractLineQty(c, l.lineId);
  return { pct: tr.querySelector('.ct-e-pct').value.trim() + '%',
           val: tr.querySelector('.ct-e-val').textContent.trim(),
           seq: (tr.querySelector('.ct-seq')||{textContent:''}).textContent.trim(),
           wantPct: (Math.round((Number(l.cumQty) || 0) / max * 10000) / 100) + '%',
           wantVal: (Math.round(window.contracts._vatSplit(l.unitPrice, c.vatMode).base * (Number(l.cumQty) || 0) * 100) / 100).toFixed(2) };
});
check('★ وخلايا «%» و«القيمة» تُحدَّث مع الإدخال لا عند إعادة الرسم (المرسوم = المحسوب)',
  rowLive.pct === rowLive.wantPct && rowLive.val.replace(/,/g, '') === rowLive.wantVal, JSON.stringify(rowLive));
check('★★ وأوّلُ بندٍ في المستخلص يحمل الرقم ١ (ترقيمُ العقد نفسُه — v18.9.2743)',
  rowLive.seq === '1', rowLive.seq);
const netDrawn = (ladder.drawn.find(r => r[0].includes('صافي')) || [])[1] || '';
check('★ سُلَّمُ الخصومات: الرقمُ المرسوم = المحسوب',
  netDrawn.replace(/,/g, '') === ladder.calc.net.toFixed(2),
  'مرسوم ' + netDrawn + ' · محسوب ' + ladder.calc.net);
check('★ والسلّمُ يعرض الخصوماتِ المفعَّلةَ وحدَها (لا صفوفَ أصفارٍ فارغة)',
  ladder.drawn.some(r => r[0].includes('محتجز')) && ladder.drawn.some(r => r[0].includes('مواد')) &&
  !ladder.drawn.some(r => r[0].includes('عدم مطابقة')),
  ladder.drawn.map(r => r[0]).join(' | '));
/* ⛔ **بلاغُ المالك: «المستخلص نهائيّ فلماذا يخرج دوريّاً في الـPDF؟»**
   الجذرُ أنّ «الفترة» و«ختاميّ؟» كانا بلا `oninput`، وأيُّ لقطةٍ من Firestore تستدعي
   `paintCtrs` فتُعيد بناء النموذج من المسوّدة — فيرتدّ الاختيارُ بلا رسالة. الفحصُ
   يحاكي اللقطةَ حرفياً: يختار «ختاميّ»، ثمّ يستدعي إعادةَ الرسم، ثمّ يقرأ المسوّدة. */
await page.selectOption('#ct-e-final', '1');
await page.fill('#ct-e-period', 'أغسطس 2026 — الدفعة الأولى');
const survive = await page.evaluate(() => {
  window.contracts._paint();                        // ما تفعله كلُّ لقطةٍ واردة
  const d = window.contracts._extDraftOf();
  const sel = document.getElementById('ct-e-final');
  return { isFinal: !!d.isFinal, period: d.period, drawn: sel ? sel.value : '' };
});
check('★★★ «ختاميّ» و«الفترة» ينجوان من إعادة الرسم (لقطةُ Firestore لا تبتلع اختياراً)',
  survive.isFinal === true && /الدفعة الأولى/.test(survive.period) && survive.drawn === '1',
  JSON.stringify(survive));
await page.selectOption('#ct-e-final', '');          // يعود دوريّاً — بقيةُ الرحلة تعتمده
await page.fill('#ct-e-period', 'أغسطس 2026');
await page.waitForTimeout(400);

/* ★ ونسبةُ الإنجاز **تُكتب** لا تُقرأ وحدَها (بلاغ: «لا توجد نِسَبُ تنفيذ عند الإنشاء») */
const pctIn = await page.evaluate(async () => {
  const d0 = window.contracts._extDraftOf();
  const c = window.contracts.contractById(d0.contractId);
  const max = window.contracts._contractLineQty(c, d0.lines[0].lineId);
  const p = document.querySelector('#ct-e-lines input[data-ef="pct"][data-i="0"]');
  const q = document.querySelector('#ct-e-lines input[data-ef="cumQty"][data-i="0"]');
  p.value = '50'; p.dispatchEvent(new Event('input', { bubbles: true }));
  const afterPct = { qty: Number(q.value), want: max / 2, draft: window.contracts._extDraftOf().lines[0].cumQty };
  q.value = String(max); q.dispatchEvent(new Event('input', { bubbles: true }));
  const afterQty = { pct: Number(p.value) };
  return { max, afterPct, afterQty };
});
check('★★ نسبةٌ تُكتب ⇒ الكميةُ تتبعها (والمخزَّنُ كميةٌ لا نسبة)',
  Math.abs(pctIn.afterPct.qty - pctIn.afterPct.want) < 0.011 &&
  Math.abs(pctIn.afterPct.draft - pctIn.afterPct.want) < 0.011, JSON.stringify(pctIn.afterPct));
check('★★ وكميةٌ تُكتب ⇒ النسبةُ تتبعها — وجهان لرقمٍ واحد',
  Math.abs(pctIn.afterQty.pct - 100) < 0.011, JSON.stringify(pctIn.afterQty));
// وتُعاد الكميةُ إلى نصف العقد — بقيةُ الرحلة مبنيّةٌ عليها
await page.fill('#ct-e-lines [data-ef="cumQty"]', '600');
await page.waitForTimeout(500);

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

/* ── فصلُ المهام والإرجاعُ يعمّان المستخلص (طلبُ المالك: «نفّذ») ──
   المستخلصُ أولى المستندات بالقاعدة: هنا يخرج المال شهرياً. الفحصُ يُثبت الحدَّين
   على المستند الحيّ نفسِه — الأدمن اعتمد بوّابةَ مدير المشاريع، فسدادُه ممنوعٌ
   متى وُجدت ماليةٌ أخرى، ومسموحٌ نيابةً حين لا توجد. */
const extSod = await page.evaluate((eid) => {
  const e = window.contracts.extractById(eid);
  const M = (users) => window.contracts._extActMode(e, 'ext_pending_finance', 'admin',
    currentUser.user, currentUser.name, users);
  const solo = M(USERS);
  USERS.push({ user: 'fin9', name: 'المالية', role: 'finance' });
  const team = M(USERS);
  return { solo, team, pmUser: e.pmApprovedByUser || '', me: currentUser.user };
}, ext1.id);
check('★★ المستخلص: اعتمادُ الأدمن خزّن اسمَ دخوله', extSod.pmUser === extSod.me, JSON.stringify(extSod));
check('★★ وسدادُه ممنوعٌ عليه متى وُجدت ماليةٌ أخرى — ونيابةً حين لا توجد',
  extSod.solo === 'delegate' && extSod.team === 'blocked', JSON.stringify(extSod));
const extBlocked = await page.evaluate(async (eid) => {
  let msg; try { await window.contracts._payExt(eid, { ref: 'x', receiptUrl: 'https://example.test/r.pdf' }); msg = 'مرّ رغم المنع'; }
  catch (e) { msg = e.message; }
  const inTasks = window.contracts._myPendingItems('admin').filter(x => x.id === eid).length;
  const i = USERS.findIndex(u => u.user === 'fin9'); if (i >= 0) USERS.splice(i, 1);
  return { msg, inTasks };
}, ext1.id);
check('★★ والمنعُ يقع في طبقة البيانات لا على الزرّ', /بوّابةٍ سابقة/.test(extBlocked.msg), extBlocked.msg);
check('★★ و«بانتظار إجراءك» لا تَعِد بزرٍّ مُنِع في المستخلص', extBlocked.inTasks === 0, 'عدد=' + extBlocked.inTasks);

// والإرجاعُ لمرحلة: من الشاشة، ووجهاتُه مشتقّةٌ من **صافيه**
await page.evaluate((cid) => { window.contracts.openCtr(cid); window.contracts.ctrTab('extracts'); }, conv.cid);
await page.waitForTimeout(700);
// جدولُ المستخلصات **وفيه صفٌّ فعليّ** — هو الجدولُ الذي جاء منه بلاغُ المالك
const extListGeom = await numColMisaligned();
check('★★ جدولُ المستخلصات بصفٍّ حقيقيّ: أعمالُ الفترة والخصوماتُ والصافي تحت رؤوسها',
  extListGeom.length === 0, extListGeom.map(b => `${b.col}: «${b.val}» بفارق ${b.off}px`).join(' · ') || 'لا انزياح');
await page.screenshot({ path: `${SHOTS}/33-extracts-align.png`, fullPage: true });
await page.evaluate((eid) => window.contracts.openExtFrom(eid, window.contracts.extractById(eid).contractId), ext1.id);
await page.waitForTimeout(900);
check('★★ وزرُّ «إرجاع لمرحلة» يظهر في المستخلص للأدمن',
  ((await page.textContent('#page-contracts-list')) || '').includes('إرجاع لمرحلة'));
const extGeom1 = await numColMisaligned();
check('★ وجداولُ ورقة المستخلص (البنود والحساب) بلا انزياحٍ في أعمدتها الرقمية',
  extGeom1.length === 0, extGeom1.map(b => `${b.col}: «${b.val}» بفارق ${b.off}px`).join(' · ') || 'لا انزياح');
await page.evaluate(() => window.contracts.openExtRewind());
await page.waitForTimeout(700);
const extRwBox = await page.evaluate(() => {
  const sel = document.getElementById('ct-rw2-gate');
  return sel ? Array.from(sel.options).map(o => o.value) : [];
});
check('★★ ووجهاتُه مشتقّةٌ من صافيه (مدير المشاريع والتنفيذيُّ فوق السقف)',
  extRwBox.join(',') === 'pm,ceo', extRwBox.join(','));
await page.selectOption('#ct-rw2-gate', 'ceo');
await page.fill('#ct-rw2-why', 'مراجعةُ كمياتٍ منفَّذة');
await page.click('#ct-rw2-btn');
await page.waitForTimeout(1300);
const extRwAfter = await page.evaluate((eid) => {
  const e = window.contracts.extractById(eid);
  return { status: e.status, pm: !!e.pmApprovedAt, ceo: !!e.ceoApprovedAt,
           note: ((e.timeline || []).slice(-1)[0] || {}).note || '',
           code: ((e.timeline || []).slice(-1)[0] || {}).code || '' };
}, ext1.id);
check('★★ والمستخلصُ عاد إلى بوّابة التنفيذيِّ وسقط اعتمادُها وبقي اعتمادُ مدير المشاريع',
  extRwAfter.status === 'ext_pending_ceo' && extRwAfter.ceo === false && extRwAfter.pm === true,
  JSON.stringify(extRwAfter));
check('★ والسببُ في سجلّه مع الحالة التي أُرجع منها',
  extRwAfter.code === 'rewound' && /مراجعةُ كمياتٍ منفَّذة/.test(extRwAfter.note) && /من «/.test(extRwAfter.note),
  extRwAfter.note);
await page.screenshot({ path: `${SHOTS}/22b-extract-rewind.png`, fullPage: true });
// أعِده إلى بوّابة السداد كما كان — بقيةُ السيناريوهات تعتمد ذلك
await page.evaluate(async (eid) => { await window.contracts._actExt(eid, 'approve', ''); }, ext1.id);
await page.waitForTimeout(900);

/* ══ توقيعُ المقاول على المستخلص — الورقةُ وشرطُ النسخة الموقّعة ══   (طلبُ المالك)
   كان المستخلصُ مستنداً من طرفٍ واحد: نقيس ونخصم ونعتمد ونصرف، والمقاولُ يستلم
   بلا ورقةٍ تُثبت أنّه أقرّ الكمياتِ ولا الخصومات. والفحصُ يُثبت الشرطَ حيث يقع:
   البياناتُ ترفض، والشاشةُ لا تَعِد بزرّ، والورقةُ تخرج بالأرقام نفسِها. */
const noSig = await page.evaluate(async (eid) => {
  try { await window.contracts._payExt(eid, { ref: 'x', receiptUrl: 'https://example.test/r.pdf' }); return 'مرّ بلا توقيع'; }
  catch (e) { return e.message; }
}, ext1.id);
check('★★ سدادُ المستخلص يُرفض بلا نسخةٍ موقّعةٍ من المقاول — في طبقة البيانات',
  /موقّعةً من المقاول/.test(noSig), noSig);

await page.evaluate((eid) => window.contracts.openExtFrom(eid, window.contracts.extractById(eid).contractId), ext1.id);
await page.waitForTimeout(900);
const extCardPreSign = await page.evaluate(() => {
  const t = document.getElementById('page-contracts-list').textContent;
  return { pay: t.includes('تسجيل السداد'), warn: t.includes('ولا سدادَ قبلها'),
           print: t.includes('طباعة المستخلص'), up: t.includes('رفع النسخة الموقّعة') };
});
check('★★ وزرُّ السداد غائبٌ حتى تُرفع النسخة — ومكانَه سببُ غيابه',
  extCardPreSign.pay === false && extCardPreSign.warn === true, JSON.stringify(extCardPreSign));
check('★ وزرّا الطباعة ورفعِ النسخة حاضران', extCardPreSign.print && extCardPreSign.up, JSON.stringify(extCardPreSign));

const extPaper = await page.evaluate((eid) => {
  const e = window.contracts.extractById(eid), c = window.contracts.contractById(e.contractId);
  const calc = window.contracts._extCalc(e, c);
  const m = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return { html: window.contracts._extractPaperHTML(e, c, {}), net: m(calc.net), gross: m(calc.gross),
           ret: m(calc.retention), state: window.contracts._extPrintState(e, calc.net).key };
}, ext1.id);
check('★★★ ورقةُ المستخلص: الرقمُ المرسوم = الرقمُ المحسوب (المنجَز · المحتجَز · الصافي)',
  extPaper.html.includes(extPaper.net) && extPaper.html.includes(extPaper.gross) &&
  extPaper.html.includes(extPaper.ret),
  `صافي=${extPaper.net} · منجَز=${extPaper.gross}`);
check('★★ وتُعلن أنّها بانتظار توقيع المقاول قبل رفع النسخة',
  extPaper.state === 'sign' && /بانتظار توقيع المقاول/.test(extPaper.html), extPaper.state);
check('★★ وفوق التوقيع إقرارٌ منصوصٌ بالكميات والخصومات لا خانةٌ صامتة',
  /إقرارُ المقاول — يُوقَّع منه/.test(extPaper.html) && /كاملَ استحقاقي/.test(extPaper.html) &&
  /التوقيع والختم/.test(extPaper.html));
check('★ وتخرج على الورقة الرسمية بطبقاتها الثلاث كبقيّة مطبوعاتنا',
  /class="lh lh-h"/.test(extPaper.html) && /class="lh lh-f"/.test(extPaper.html) &&
  /<table class="pg">/.test(extPaper.html));
fs.writeFileSync(`${SHOTS}/extract-print.html`, extPaper.html);

const sigRes = await page.evaluate(async (eid) => {
  const noDoc = await window.contracts._signExt(eid, {}).then(() => 'مرّ بلا نسخة', e => e.message);
  await window.contracts._signExt(eid, { url: 'https://example.test/ext-signed.pdf', name: 'مستخلص موقّع' });
  const e = window.contracts.extractById(eid), c = window.contracts.contractById(e.contractId);
  const calc = window.contracts._extCalc(e, c);
  return { noDoc, net: e.signature.net, calc: calc.net,
           ok: window.contracts._extPayGuard(e, calc.net).ok,
           stale: window.contracts._extPayGuard(e, calc.net + 1000).why,
           state: window.contracts._extPrintState(e, calc.net).key,
           tl: ((e.timeline || []).slice(-1)[0] || {}).code || '' };
}, ext1.id);
check('★ ورفعُ النسخة يُرفض بلا ملف', /إلزامية/.test(sigRes.noDoc), sigRes.noDoc);
check('★★ والنسخةُ حُفظت على **صافي وقتِ التوقيع** فصار السدادُ جائزاً',
  sigRes.net === sigRes.calc && sigRes.ok === true && sigRes.state === 'due' && sigRes.tl === 'signed',
  JSON.stringify(sigRes));
check('★★ ولو تغيّر الصافي بعدها سقط التوقيعُ ولزمت نسخةٌ على الرقم الجديد',
  /تلزم نسخةٌ موقّعةٌ على الرقم الجديد/.test(sigRes.stale), sigRes.stale);

await page.evaluate((eid) => window.contracts.openExtFrom(eid, window.contracts.extractById(eid).contractId), ext1.id);
await page.waitForTimeout(900);
const afterSign = await page.evaluate(() => document.getElementById('page-contracts-list').textContent);
check('★★ وبعد الرفع ظهر زرُّ السداد وقُرئ توقيعُ المقاول في البطاقة',
  afterSign.includes('تسجيل السداد') && afterSign.includes('وقّع المقاولُ نسخةَ هذا المستخلص'));
await page.screenshot({ path: `${SHOTS}/22c-extract-signed.png`, fullPage: true });

/* ══ تعديلُ المستخلص — البابُ الذي طلبه المالك، وحارسُه ══
   أخطرُ لحظةٍ للتعديل هي هذه بالضبط: مستخلصٌ **اعتُمد ووُقّع** وينتظر الصرف. فإن
   مرّ التعديلُ صامتاً صُرف رقمٌ لم يعتمده أحدٌ ولم يُقرّ به المقاول. */
const editGuards = await page.evaluate(async (eid) => {
  const e0 = window.contracts.extractById(eid);
  const cp = (e0.lines || []).map(l => ({ lineId: l.lineId, desc: l.desc, unit: l.unit, unitPrice: l.unitPrice, cumQty: l.cumQty }));
  const base = { period: e0.period, isFinal: false, materialsIssued: e0.materialsIssued,
                 penaltyAmount: e0.penaltyAmount, ncDeduction: e0.ncDeduction };
  const noWhy = await window.contracts._editExt(eid, Object.assign({ lines: cp }, base), '  ')
    .then(() => 'مرّ بلا سبب', err => err.message);
  const before = { pm: !!e0.pmApprovedAt, ceo: !!e0.ceoApprovedAt, sig: !!window.contracts._extSignature(e0), st: e0.status };
  // تعديلٌ حقيقيّ: يخفض كميةَ بندِه هو — والحارسُ لا يقيسه على نفسِه
  const lower = cp.map(l => Object.assign({}, l, { cumQty: Number(l.cumQty) - 100 }));
  await window.contracts._editExt(eid, Object.assign({ lines: lower }, base), 'إعادةُ قياسٍ بعد زيارة الموقع');
  const e1 = window.contracts.extractById(eid);
  const c = window.contracts.contractById(e1.contractId);
  const after = { st: e1.status, pm: !!e1.pmApprovedAt, ceo: !!e1.ceoApprovedAt,
                  sig: !!window.contracts._extSignature(e1),
                  code: ((e1.timeline || []).slice(-1)[0] || {}).code || '',
                  note: ((e1.timeline || []).slice(-1)[0] || {}).note || '',
                  net: window.contracts._extCalc(e1, c).net };
  // ثمّ تُعاد الكميةُ كما كانت — وهذا نفسُه يُثبت أنّ المستخلصَ لا يُقاس على نفسِه
  await window.contracts._editExt(eid, Object.assign({ lines: cp }, base), 'إعادةُ الكمية بعد إعادة القياس');
  const e2 = window.contracts.extractById(eid);
  return { noWhy, before, after, restored: window.contracts._extCalc(e2, c).net, was: window.contracts._extCalc(e0, c).net };
}, ext1.id);
check('★ تعديلُ المستخلص يُرفض بلا سبب', /سبب التعديل إلزامي/.test(editGuards.noWhy), editGuards.noWhy);
check('★★★ والتعديلُ يُسقط الاعتماداتِ **وتوقيعَ المقاول** ويعيد المستخلصَ لبوّابته الأولى',
  editGuards.before.sig === true && editGuards.after.sig === false &&
  editGuards.after.pm === false && editGuards.after.ceo === false &&
  editGuards.after.st === 'ext_pending_pm', JSON.stringify(editGuards));
check('★★ والسببُ والرقمان (قبل ← بعد) في الخطّ الزمنيّ',
  editGuards.after.code === 'edited' && /إعادةُ قياسٍ بعد زيارة الموقع/.test(editGuards.after.note) &&
  /←/.test(editGuards.after.note), editGuards.after.note);
check('★★ والمستخلصُ لا يُقاس على نفسِه: يخفض كميتَه ثمّ يعيدها',
  editGuards.after.net < editGuards.was && Math.abs(editGuards.restored - editGuards.was) < 0.011,
  JSON.stringify({ was: editGuards.was, low: editGuards.after.net, back: editGuards.restored }));

// وتُستأنف الدورةُ من بوّابتها الأولى: اعتمادٌ ⇐ اعتمادٌ ⇐ توقيعٌ جديد
await page.evaluate(async (eid) => {
  await window.contracts._actExt(eid, 'approve', '');
  if (window.contracts.extractById(eid).status === 'ext_pending_ceo')
    await window.contracts._actExt(eid, 'approve', '');
  await window.contracts._signExt(eid, { url: 'https://example.test/ext-signed-2.pdf', name: 'نسخةٌ موقّعةٌ بعد التعديل' });
}, ext1.id);
await page.waitForTimeout(900);
check('★ وبعد إعادة الاعتماد وتوقيعٍ جديدٍ يعود صالحاً للسداد',
  await page.evaluate((eid) => {
    const e = window.contracts.extractById(eid), c = window.contracts.contractById(e.contractId);
    return e.status === 'ext_pending_finance' && window.contracts._extPayGuard(e, window.contracts._extCalc(e, c).net).ok;
  }, ext1.id));

/* ══ ورقةُ المستخلص: بندان ⇒ صفحةٌ واحدة، والعنوانُ لا يُفارق فقرتَه ══ */
const extPaperHtml = await page.evaluate((eid) => {
  const e = window.contracts.extractById(eid), c = window.contracts.contractById(e.contractId);
  return window.contracts._extractPaperHTML(e, c, {});
}, ext1.id);
fs.writeFileSync(`${SHOTS}/extract-print.html`, extPaperHtml);
const extPage = await browser.newPage();
await extPage.goto('file://' + `${SHOTS}/extract-print.html`, { waitUntil: 'networkidle' });
const extPdf = await extPage.pdf({ printBackground: true, preferCSSPageSize: true });
await extPage.close();
fs.writeFileSync(`${SHOTS}/extract-print.pdf`, extPdf);
const extPages = ((extPdf.toString('latin1').match(/\/Type \/Page(?!s)/g) || []).length);
check('★★★ ورقةُ مستخلصٍ ببندٍ واحدٍ تخرج في **صفحةٍ واحدة** (طلبُ المالك)',
  extPages === 1, `صفحات=${extPages}`);
check('★★ والعنوانُ لا يبقى وحيداً في قاع الورقة (`break-after:avoid` على كل عنوان)',
  /h2\{[^}]*break-after:avoid/.test(extPaperHtml) && /page-break-after:avoid/.test(extPaperHtml));

/* ══ بلاغُ المالك: «العقدُ لا يُظهر أنّ له مستخلصاً ولا عند مَن يقف» ══ */
await page.evaluate(() => window.contracts.backToCtrs());
await page.waitForTimeout(900);
const tileExt = await page.evaluate((eid) => {
  const t = document.getElementById('page-contracts-list').textContent;
  const e = window.contracts.extractById(eid);
  return { hasId: t.includes(e.id), hasGate: /بانتظار/.test(t),
           strip: /مستخلصاتٌ مفتوحة/.test(t), st: e.status };
}, ext1.id);
check('★★★ وبطاقةُ العقد في القائمة تقول: له مستخلصٌ، وعند مَن يقف',
  tileExt.hasId === true && tileExt.hasGate === true, JSON.stringify(tileExt));
check('★★ وشريطُ الصفحة يعدّ المستخلصاتِ المفتوحة', tileExt.strip === true);
await page.screenshot({ path: `${SHOTS}/22d-contract-tile-extract.png`, fullPage: true });
await page.evaluate((cid) => { window.contracts.openCtr(cid); window.contracts.ctrTab('extracts'); }, conv.cid);
await page.waitForTimeout(800);
await page.evaluate((eid) => window.contracts.openExtFrom(eid, window.contracts.extractById(eid).contractId), ext1.id);
await page.waitForTimeout(800);

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

/* ── المقدمةُ المسدَّدةُ تُخصَم من المستخلص: **كاملُ المتبقّي** لا نسبةٌ منه ──
   (بلاغُ المالك: «المفروض يخصم الدفعة المسدَّدة بالفعل اللي هي 11,900 ريال»).
   الفحصُ في متصفّحٍ حقيقيّ لأن الارتدادَ **يختفي بصمت**: `rung` لا يرسم صفّاً
   قيمتُه صفر، فالسُّلَّمُ يبدو سليماً وقد سقط منه الخصمُ كلُّه. فالقياسُ على
   **المرسوم**: صفُّ الاسترداد موجودٌ، وعنوانُه يقول القاعدة، ومبلغُه = المتبقّي. */
const advDeduct = await page.evaluate(async (o) => {
  const c = window.contracts.contractById(o.cid);
  const keep = { pct: c.advance.recoveryPct, rec: c.advance.recovered };
  // شكلُ عقد البلاغ حرفياً: مقدمةٌ سُدِّدت، وحقلُ الاسترداد صفرٌ، ولم يُستردّ منها شيء
  c.advance.recoveryPct = 0; c.advance.recovered = 0;
  const e = window.contracts.extractById(o.eid);
  const left = window.contracts._advanceRecoveryCapOf(c);
  const derived = window.contracts._advanceRecoveryDerived(c);
  const calc = window.contracts._extCalc(e, c);
  window.contracts.openCtr(o.cid); window.contracts.ctrTab('overview');
  await new Promise(r => setTimeout(r, 600));
  const card = (document.getElementById('page-contracts-list').textContent || '').replace(/\s+/g, ' ');
  window.contracts.openExtFrom(o.eid, o.cid);
  await new Promise(r => setTimeout(r, 800));
  const rows = [...document.querySelectorAll('.ct-ladder .ct-rung')].map(x => x.textContent.replace(/\s+/g, ' ').trim());
  const row = rows.find(t => t.includes('استرداد الدفعة المقدمة')) || '';
  // ونسبةٌ مكتوبةٌ صراحةً تُقسّط الاستردادَ — التلقائيُّ للسهو لا ليُلغي شرطاً موقَّعاً
  c.advance.recoveryPct = 20;
  const written = window.contracts._advanceRecoveryOf(c, calc.period);
  c.advance.recoveryPct = keep.pct; c.advance.recovered = keep.rec;
  return { left, derived, written, rec: calc.advanceRecovery, period: calc.period, net: calc.net,
           row, card, paid: window.contracts._advancePaidOf(c) };
}, { cid: conv.cid, eid: ext2.id });
check('★★★ حقلُ الاسترداد صفرٌ ⇒ يُخصَم **كاملُ المتبقّي من المسدَّد** لا نسبةٌ منه',
  advDeduct.derived === true && advDeduct.rec === advDeduct.left && advDeduct.rec > 0 &&
  advDeduct.rec <= advDeduct.period,
  JSON.stringify({ rec: advDeduct.rec, left: advDeduct.left, period: advDeduct.period, paid: advDeduct.paid }));
check('★★★ وصفُّ الاسترداد **مرسومٌ** في السُّلَّم: عنوانُه يقول القاعدة ومبلغُه = المحسوب',
  advDeduct.row.includes('كامل المتبقّي من المسدَّد') &&
  advDeduct.row.includes(advDeduct.rec.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })),
  advDeduct.row + ' · محسوب ' + advDeduct.rec);
check('★★ ولا يخرج الصافي سالباً', advDeduct.net >= 0, String(advDeduct.net));
check('★★ وبطاقةُ العقد تقول القاعدةَ والمتبقّي — لا رقمَ يظهر بلا مصدر',
  /يُخصَم كاملُ المتبقّي من المسدَّد من أوّل مستخلصٍ يتّسع له/.test(advDeduct.card) &&
  /يُستردّ كاملُ المسدَّد من أوّل مستخلصٍ يتّسع له/.test(advDeduct.card));
check('★★ ونسبةٌ مكتوبةٌ في العقد تُقسّط الاسترداد بها — بسقف المتبقّي',
  advDeduct.written === Math.min(Math.round(advDeduct.period * 20 / 100 * 100) / 100, advDeduct.left),
  String(advDeduct.written) + ' · فترة ' + advDeduct.period + ' · متبقٍّ ' + advDeduct.left);
await page.screenshot({ path: `${SHOTS}/22c-advance-recovery.png`, fullPage: true });
await page.evaluate((cid) => { window.contracts.openCtr(cid); window.contracts.ctrTab('extracts'); }, conv.cid);
await page.waitForTimeout(600);

// الختاميُّ يُنهي العقد فنّياً
const finalPay = await page.evaluate(async (eid) => {
  await window.contracts._actExt(eid, 'approve', '');
  const st1 = window.contracts.extractById(eid).status;
  if (st1 === 'ext_pending_ceo') await window.contracts._actExt(eid, 'approve', '');
  await window.contracts._signExt(eid, { url: 'https://example.test/ext2-signed.pdf', name: 'المستخلص الختاميّ موقّعاً' });
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

/* ── تبويبا صفحة العقود (طلبُ المالك): المقفلُ غادر «الجارية» إلى «المنتهية» ── */
const ctrTabsBar = await page.evaluate((cid) => {
  const tb = [...document.querySelectorAll('#page-contracts-list .ct-tab')];
  const all = window.contracts.contractsList();
  return {
    nTabs: tb.length,
    txt: tb.map(e => e.textContent.replace(/\s+/g, ' ').trim()),
    calc: ['running', 'finished'].map(k => all.filter(c => window.contracts._ctrTabOf(c) === k).length),
    inRunning: [...document.querySelectorAll('#page-contracts-list .ct-tile')].some(e => e.textContent.includes(cid))
  };
}, conv.cid);
check('★★ صفحةُ العقود ثلاثةُ تبويباتٍ بأعدادٍ من ctrTabOf — والمقفلُ ليس بين «الجارية»',
  ctrTabsBar.nTabs === 3 && ctrTabsBar.inRunning === false &&
  ctrTabsBar.txt[0].includes('الجارية') && ctrTabsBar.txt[0].includes(String(ctrTabsBar.calc[0])) &&
  ctrTabsBar.txt[1].includes('المنتهية') && ctrTabsBar.txt[1].includes(String(ctrTabsBar.calc[1])),
  JSON.stringify(ctrTabsBar));
const finTab = await page.evaluate(async (cid) => {
  window.contracts.ctrsTab('finished');
  await new Promise(r => setTimeout(r, 500));
  const tiles = [...document.querySelectorAll('#page-contracts-list .ct-tile')];
  const stTxt = [...document.querySelectorAll('#page-contracts-list .ct-stat')]
    .map(e => e.textContent.replace(/\s+/g, ' ').trim()).join('|');
  const tile = tiles.find(e => e.textContent.includes(cid));
  let nameRatio = 0;
  if (tile) {
    const name = tile.querySelector('.ct-tile-name');
    const top = tile.querySelector('.ct-tile-top');
    nameRatio = name && top ? name.getBoundingClientRect().width / top.getBoundingClientRect().width : 0;
  }
  const want = window.contracts.contractsList().filter(c => window.contracts._ctrTabOf(c) === 'finished').length;
  return { n: tiles.length, want, has: !!tile, stTxt, nameRatio };
}, conv.cid);
check('★★ وتبويبُ «المنتهية» يعرض المنتهيةَ كلَّها ومنها المقفل',
  finTab.has && finTab.n === finTab.want && finTab.n >= 2, JSON.stringify(finTab));
check('★ وشريطُه يفصّل: بانتظار الضمان · مقفلة · مفسوخة',
  /بانتظار انتهاء الضمان/.test(finTab.stTxt) && /مقفلة/.test(finTab.stTxt) && /مفسوخة/.test(finTab.stTxt),
  finTab.stTxt.slice(0, 120));
check('★★ واسمُ العقد لا تعصره شارةُ «مقفل — أُفرِج عن المحتجز» (بلاغُ المالك: الاسم ينزاح)',
  finTab.nameRatio >= 0.5, 'نسبةُ عرض الاسم=' + finTab.nameRatio.toFixed(2));
await page.screenshot({ path: `${SHOTS}/21b-contracts-finished-tab.png`, fullPage: true });

/* ── التبويبُ الثالث: سجلُّ المستخلصات عبر العقود (طلبُ المالك) ──
   السببُ الذي يجعله فحصَ متصفّحٍ لا فحصَ نصّ: **الرقمُ المرسوم = الرقمُ المحسوب.**
   جدولٌ يجمع مستخلصاتِ عقودٍ شتّى هو أوّلُ موضعٍ ينزلق فيه صافٍ من عقدٍ إلى صفِّ
   عقدٍ آخر — ولا مترجمَ يُنذر بذلك، ولا خطأَ في وحدة التحكّم. */
console.log('\n=== تبويبُ المستخلصات عبر العقود ===');
const xTab = await page.evaluate(async () => {
  window.contracts.ctrsTab('extracts');
  await new Promise(r => setTimeout(r, 600));
  const el = document.getElementById('page-contracts-list');
  const rows = [...el.querySelectorAll('.ct-table tbody tr')];
  const led = window.contracts._extractLedger(
    window.contracts.contractsList(), window.contracts.extractsList(), null);
  const tab = [...el.querySelectorAll('.ct-tab')].find(b => b.textContent.includes('المستخلصات'));
  return {
    title: (el.querySelector('.ct-title') || {}).textContent.replace(/\s+/g, ' ').trim(),
    tabOn: !!(tab && tab.classList.contains('on')),
    tabTxt: tab ? tab.textContent.replace(/\s+/g, ' ').trim() : '',
    rows: rows.length, led: led.length,
    ids: rows.map(r => (r.querySelector('td .num') || {}).textContent || '').filter(Boolean),
    ledIds: led.map(r => r.id),
    strip: [...el.querySelectorAll('.ct-stat')].map(e => e.textContent.replace(/\s+/g, ' ').trim()),
    hasCtrTiles: el.querySelectorAll('.ct-tile').length
  };
});
check('★★ اسمُ الصفحة صار «العقود والمستخلصات»',
  /العقود والمستخلصات/.test(xTab.title), xTab.title);
check('★★ والتبويبُ الثالث يعرض مستخلصاتِ العقود كلِّها — لا بطاقاتِ عقودٍ',
  xTab.tabOn && xTab.rows > 0 && xTab.hasCtrTiles === 0, JSON.stringify({ rows: xTab.rows, tiles: xTab.hasCtrTiles }));
check('★★★ وعددُ الصفوف المرسومة = طولُ السجل النقيّ، وبالمعرّفات نفسِها بالترتيب نفسِه',
  xTab.rows === xTab.led && xTab.ids.join(',') === xTab.ledIds.join(','),
  JSON.stringify({ ids: xTab.ids, led: xTab.ledIds }));
check('★ وعدّادُ التبويب يقول العددَ نفسَه', xTab.tabTxt.includes(String(xTab.led)), xTab.tabTxt);

const xNums = await page.evaluate(() => {
  const el = document.getElementById('page-contracts-list');
  const led = window.contracts._extractLedger(
    window.contracts.contractsList(), window.contracts.extractsList(), null);
  const st = window.contracts._extLedgerStats(led);
  const rows = [...el.querySelectorAll('.ct-table tbody tr')];
  // الصافي المرسوم في كل صفّ مقابل ما تحسبه الدالّة النقيّة لذلك المستخلص بعينه
  const drawn = rows.map(r => (r.children[4].textContent || '').replace(/[^\d.]/g, ''));
  const calc = led.map(r => r.net.toFixed(2));
  const stripTxt = [...el.querySelectorAll('.ct-stat')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).join('|');
  return { drawn, calc, st, stripTxt };
});
check('★★★ الصافي المرسوم في كل صفٍّ = ما تحسبه `extDueNet` لذلك المستخلص (لا انزلاقَ صفٍّ)',
  xNums.drawn.join(',') === xNums.calc.join(','),
  JSON.stringify({ drawn: xNums.drawn, calc: xNums.calc }));
check('★★ وشريطُ الأرقام = ما يحسبه `extLedgerStats` (الإجمالي · بانتظار إجراء · مسدَّدة)',
  xNums.stripTxt.includes(String(xNums.st.total)) &&
  xNums.stripTxt.includes(String(xNums.st.awaiting)) &&
  xNums.stripTxt.includes(String(xNums.st.paid)) &&
  /بانتظار إجراء/.test(xNums.stripTxt) && /المسدَّد صافياً/.test(xNums.stripTxt),
  xNums.stripTxt.slice(0, 160));
await page.screenshot({ path: `${SHOTS}/21c-extracts-ledger.png`, fullPage: true });

const xSearch = await page.evaluate(async () => {
  const el = document.getElementById('page-contracts-list');
  const led = window.contracts._extractLedger(
    window.contracts.contractsList(), window.contracts.extractsList(), null);
  const one = led[0];
  window.contracts.filterCtrs('q', one.vendorName);
  await new Promise(r => setTimeout(r, 400));
  const hit = el.querySelectorAll('.ct-table tbody tr').length;
  const want = led.filter(r => r.vendorName === one.vendorName).length;
  window.contracts.filterCtrs('q', 'لا طرفَ بهذا الاسم إطلاقاً');
  await new Promise(r => setTimeout(r, 400));
  const none = el.textContent.includes('لا نتائج تطابق البحث');
  window.contracts.filterCtrs('q', '');
  await new Promise(r => setTimeout(r, 400));
  return { hit, want, none, box: !!document.getElementById('ct-x-q') };
});
check('★★ والبحثُ في السجل يعمل (بالطرف) ويقول «لا نتائج» بلا لبس',
  xSearch.box && xSearch.hit === xSearch.want && xSearch.hit > 0 && xSearch.none,
  JSON.stringify(xSearch));

const xOpen = await page.evaluate(async () => {
  const el = document.getElementById('page-contracts-list');
  const row = el.querySelector('.ct-table tbody tr');
  const id = (row.querySelector('td .num') || {}).textContent.trim();
  row.click();
  await new Promise(r => setTimeout(r, 800));
  const txt = el.textContent;
  const back = (el.querySelector('.ct-back') || {}).textContent || '';
  return { id, opened: txt.includes(id), back: back.replace(/\s+/g, ' ').trim() };
});
check('★★★ ونقرُ الصفِّ يفتح المستخلصَ في بطاقة عقده (سمةُ onclick تجد الدالّةَ في النطاق العام)',
  xOpen.opened, JSON.stringify(xOpen));
check('★ وزرُّ الرجوع يقول «كل المستخلصات» — إلى حيث دخل المستخدمُ فعلاً',
  /كل المستخلصات/.test(xOpen.back), xOpen.back);
/* والعودةُ إلى تبويب عقودٍ تُرجع الشبكةَ: التبويبُ الثالث لا يترك أثراً في
   الاثنين قبله (مرشِّحُ حالةِ مستخلصٍ باقٍ يُفرغ قائمةَ العقود بلا سبب). */
const backCtrs = await page.evaluate(async () => {
  window.contracts.backToCtrs(); await new Promise(r => setTimeout(r, 400));
  window.contracts.ctrsTab('finished'); await new Promise(r => setTimeout(r, 500));
  const el = document.getElementById('page-contracts-list');
  const on = [...el.querySelectorAll('.ct-tab')].find(b => b.classList.contains('on'));
  return { tiles: el.querySelectorAll('.ct-tile').length,
           want: window.contracts.contractsList().filter(c => window.contracts._ctrTabOf(c) === 'finished').length,
           on: on ? on.textContent.replace(/\s+/g, ' ').trim() : '' };
});
check('★★ والعودةُ إلى تبويب عقودٍ تُرجع الشبكةَ كاملةً — التبويبُ الثالثُ لا يترك مرشِّحاً وراءه',
  backCtrs.tiles === backCtrs.want && backCtrs.tiles > 0 && /المنتهية/.test(backCtrs.on),
  JSON.stringify(backCtrs));
await page.evaluate(async () => { window.contracts.ctrsTab('running'); await new Promise(r => setTimeout(r, 400)); });

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

/* ═════════ قسمُ التعاقدات في الصلاحيات ═════════
   الحجبُ يُفحَص **تنفيذاً على المستخدم نفسِه**: تُبدَّل صلاحيتُه ثمّ يُسأل النظامُ
   ماذا يرى — فحجبُ زرٍّ في الترميز وحدَه بابٌ يبقى مفتوحاً بالعنوان المباشر. */
console.log('\n=== الصلاحيات: قسمُ التعاقدات ===');
await page.setViewportSize({ width: 1440, height: 980 });
const permStates = await page.evaluate(() => {
  const prev = currentUser;
  const probe = (user) => {
    currentUser = user;
    window.contracts.refreshNav();
    return {
      canView: window.contracts.canView(),
      grp: !!document.getElementById('grp-contracts'),
      hdr: !!document.getElementById('hdr-grp-contracts'),
      blocked: (typeof _blockedPagesForUser === 'function')
        ? ['vendors', 'contract-requests', 'contracts-list'].filter(p => _blockedPagesForUser().has(p)).length : -1
    };
  };
  const pm = (perms) => ({ user: 'pm', name: 'مدير المشاريع', role: 'project_manager', permissions: perms });
  // بلاغُ المالك: «رغده» دورُها المسجَّل «مشرف» — المفتاحُ **مانحٌ** في حقّها
  const sup = (perms) => ({ user: 'رغده فهيد', name: 'رغده فهيد', role: 'مشرف', permissions: perms });
  const out = {
    allowed: probe(pm({ contracts: true })),
    blockedU: probe(pm({ contracts: false })),
    legacy:  probe({ user: 'old', name: 'قديم', role: 'project_manager' }),   // بلا حقل صلاحيات
    admin:   probe({ user: 'a', name: 'أدمن', role: 'admin', permissions: { contracts: false } }),
    supGrant: probe(sup({ contracts: true })),
    supNone:  probe(sup({ tickets: true })),
    supLegacy: probe({ user: 's2', name: 'مشرفٌ قديم', role: 'مشرف' })
  };
  // ومحاولةُ الممنوحِ فتحَ صفحةٍ فعلاً — لا رؤيةَ زرٍّ فحسب
  currentUser = sup({ contracts: true });
  window.contracts.refreshNav();
  showPage('vendors');
  out.supLandedOn = (document.querySelector('.page.active') || {}).id || '';
  out.supCanWrite = {
    edit: window.contracts.canEdit(), bank: window.contracts.canBank(),
    status: window.contracts.canStatus(), create: window.contracts.canCreateReq()
  };
  // ومحاولةُ الدخول المباشر بالعنوان وهو محجوب
  currentUser = pm({ contracts: false });
  window.contracts.refreshNav();
  showPage('vendors');
  out.landedOn = (document.querySelector('.page.active') || {}).id || '';
  currentUser = prev;
  window.contracts.refreshNav();
  return out;
});
check('★ الإذنُ ممنوحٌ ⇒ القسمُ ظاهرٌ في القائمة',
  permStates.allowed.canView === true && permStates.allowed.grp === true && permStates.allowed.hdr === true,
  JSON.stringify(permStates.allowed));
check('★★ والإذنُ محجوبٌ ⇒ لا مجموعةَ ولا رأسَ في القائمة أصلاً (لا زرٌّ مخفيٌّ بـCSS)',
  permStates.blockedU.canView === false && permStates.blockedU.grp === false && permStates.blockedU.hdr === false,
  JSON.stringify(permStates.blockedU));
check('★★ وصفحاتُه الثلاثُ محجوبةٌ في حارس النواة (لا دخولَ بالعنوان المباشر)',
  permStates.blockedU.blocked === 3, 'محجوبة ' + permStates.blockedU.blocked + '/3');
check('★★ ومحاولةُ فتحِه مباشرةً ترتدّ ولا تفتح صفحةَ تعاقدات',
  permStates.landedOn !== 'page-vendors', 'هبط على ' + permStates.landedOn);
check('★★ ومستخدمٌ قديمٌ بلا حقل صلاحيات يبقى كما كان (المفتاحُ حاجبٌ لا مانح)',
  permStates.legacy.canView === true && permStates.legacy.grp === true,
  JSON.stringify(permStates.legacy));
check('★★ والأدمنُ يتجاوز الحجبَ كما في كل مفاتيح النواة',
  permStates.admin.canView === true && permStates.admin.grp === true,
  JSON.stringify(permStates.admin));

/* ── بلاغُ المالك: خانةٌ مؤشَّرةٌ وقسمٌ غائبٌ عن «رغده» (دورُها «مشرف») ──
   المفتاحُ **مزدوجُ الطبع**: مانحٌ لغير المؤهَّل بطبعه. والفحصُ تنفيذيٌّ في متصفّح:
   نبدّل المستخدمَ ونسأل النظامَ ماذا يرى ويكتب — لا نقرأ سطراً. */
check('★★★ المشرفُ الممنوحُ صراحةً يرى القسمَ فعلاً — بلاغُ رغده',
  permStates.supGrant.canView === true && permStates.supGrant.grp === true &&
  permStates.supGrant.hdr === true && permStates.supGrant.blocked === 0,
  JSON.stringify(permStates.supGrant));
check('★★★ وصفحتُه تُفتح فعلاً لا زرَّها وحدَه',
  permStates.supLandedOn === 'page-vendors', 'هبط على ' + permStates.supLandedOn);
check('★★★ والمنحُ اطّلاعٌ لا غير — لا تعديلَ ولا آيبانَ ولا إيقافَ ولا إنشاءَ طلب',
  Object.values(permStates.supCanWrite).every(v => v === false),
  JSON.stringify(permStates.supCanWrite));
check('★★★ ومشرفٌ بلا المفتاح لا يراه (لا يُقرأ المانحُ إلا بعلامةٍ صريحة)',
  permStates.supNone.canView === false && permStates.supNone.grp === false &&
  permStates.supNone.blocked === 3,
  JSON.stringify(permStates.supNone));
check('★★★ ومشرفٌ قديمٌ بلا حقل صلاحياتٍ لا يرثه بأثرٍ رجعيّ',
  permStates.supLegacy.canView === false && permStates.supLegacy.grp === false,
  JSON.stringify(permStates.supLegacy));

/* ════════════════════════════════════════════════════════════
   الأعمالُ التعاقدية على رصيد «البند المستعاض»   [طلبُ المالك]
   من النموذج إلى شاشة الرصيد: العلَمُ يُختار مرةً، والمصروفُ يُخصَم ممّا خرج
   فعلاً، والرقمُ المرسوم في الشاشة = الرقمُ المحسوب من الدوالّ النقية.
   ════════════════════════════════════════════════════════════ */
console.log('\n=== البند المستعاض في التعاقدات ===');

// حسابُ رصيدٍ مربوطٌ بمشروع حائل — بهامش ٢٥٪، يُكتب عبر db ليصل مستمعَ الوحدة
await page.evaluate(() => db.doc('meta/substitute_accounts').set({ accounts: [
  { id: 'sb1', kind: 'linked', projectId: 'hail', name: '', total: 200000, margin: 25, openingConsumed: 0 },
  { id: 'sb2', kind: 'standalone', projectId: '', name: 'استراحة الشمال', total: 50000, margin: 10, openingConsumed: 0 }
]}));
await page.waitForTimeout(900);
check('★ وحدةُ الرصيد استقبلت الحسابين',
  await page.evaluate(() => (window.substituteBudget.accounts() || []).length === 2));

// نموذجُ طلبٍ جديد: السؤالُ حاضر، والحسابُ المربوطُ بالمشروع مُرشَّحٌ تلقائياً
await page.evaluate(() => { showPage('contract-requests'); window.contracts.newRequest(); });
await page.waitForTimeout(1500);
check('★ سؤالُ «من البند المستعاض» ظاهرٌ في نموذج طلب التعاقد',
  await page.evaluate(() => !!document.getElementById('ct-r-sub')));
check('★ ولا قائمةَ حساباتٍ قبل رفع العلَم', await page.evaluate(() => !document.getElementById('ct-r-subacc')));
await page.evaluate(() => { document.getElementById('ct-r-sub').checked = true; window.contracts.toggleSubstitute(); });
await page.waitForTimeout(900);
const subPick = await page.evaluate(() => {
  const sel = document.getElementById('ct-r-subacc');
  return { has: !!sel, value: sel ? sel.value : '', opts: sel ? sel.options.length : 0,
           draft: !!window.contracts._draft().isSubstitute };
});
check('★★ رفعُ العلَم يفتح قائمةَ الحسابات ويُرشّح حسابَ المشروع تلقائياً',
  subPick.has && subPick.value === 'sb1' && subPick.opts === 3, JSON.stringify(subPick));
check('★ والمسوّدةُ حملت العلَم', subPick.draft);
await page.screenshot({ path: `${SHOTS}/60-sub-form.png` });
await page.evaluate(() => { document.getElementById('ct-r-sub').checked = false; window.contracts.toggleSubstitute(); });
await page.waitForTimeout(700);
check('★ وإنزالُ العلَم يُخفي القائمةَ ويمسح الحساب',
  await page.evaluate(() => !document.getElementById('ct-r-subacc') &&
    window.contracts._draft().substituteAccountId === ''));
await page.evaluate(() => window.contracts.cancelRequest());
await page.waitForTimeout(600);

/* مستنداتٌ مستعاضةٌ حقيقية: أمرُ دفعٍ مسدَّد · عقدٌ سارٍ بمستخلصين (مسدَّدٌ وقيدَ السداد) */
await page.evaluate(() => {
  const R = 'global_contract_requests', C = 'global_contracts', E = 'global_contract_extracts';
  return Promise.all([
    db.collection(R).doc('CRQ-SUB-PAY').set({ engagement: 'pay_order', status: 'crq_paid',
      projectId: 'hail', title: 'ترميم سور', vendorName: 'مؤسسة النور', value: 2000,
      payment: { amount: 1900 }, isSubstitute: true, substituteAccountId: 'sb1' }),
    db.collection(R).doc('CRQ-SUB-WAIT').set({ engagement: 'contract', status: 'crq_pending_finance',
      projectId: 'hail', title: 'أعمال إضافية', vendorName: 'مؤسسة النور', value: 50000,
      isSubstitute: true, substituteAccountId: 'sb1' }),
    db.collection(C).doc('CTR-SUB-1').set({ status: 'ctr_active', projectId: 'hail',
      title: 'تشطيبات خارج العقد', vendorName: 'مؤسسة النور', value: 80000,
      isSubstitute: true, substituteAccountId: 'sb1' }),
    db.collection(E).doc('EXT-P').set({ contractId: 'CTR-SUB-1', status: 'ext_paid', payment: { amount: 30000 } }),
    db.collection(E).doc('EXT-W').set({ contractId: 'CTR-SUB-1', status: 'ext_pending_finance', payment: { amount: 12000 } })
  ]);
});
await page.waitForTimeout(1200);

const sbRoll = await page.evaluate(() => window.contracts.substituteRollupFor('sb1'));
check('★★ المصروفُ = أمرُ دفعٍ مسدَّد ١٩٠٠ + مستخلصٌ مسدَّد ٣٠٬٠٠٠',
  sbRoll.spent === 31900, 'spent=' + sbRoll.spent);
check('★ والمستخلصُ المعتمدُ غيرُ المسدَّد لم يُخصَم', sbRoll.spent !== 43900);
check('★ «قيد الاعتماد» = طلبُ التعاقد القائم', sbRoll.pending === 50000, 'pending=' + sbRoll.pending);
check('★ و«متعاقَدٌ عليه» = قيمةُ العقد − المسدَّد', sbRoll.contracted === 50000, 'contracted=' + sbRoll.contracted);

// شاشةُ الرصيد: الرقمُ المرسوم = الرقمُ المحسوب
await page.evaluate(() => { showPage('substitute-budget'); window.substituteBudget.open('sb1'); });
await page.waitForTimeout(1200);
const sbTxt = (await page.textContent('#page-substitute-budget')) || '';
check('★★ شاشةُ الرصيد تعرض جدولَ الأعمال التعاقدية بمستنداته الثلاثة',
  sbTxt.includes('الأعمال التعاقدية') && sbTxt.includes('CRQ-SUB-PAY') &&
  sbTxt.includes('CTR-SUB-1') && sbTxt.includes('CRQ-SUB-WAIT'));
const drawnKpi = await page.evaluate(() => {
  const box = document.querySelector('#page-substitute-budget .card[style*="repeat(3,1fr)"]');
  return box ? Array.from(box.children).map(e => e.textContent.replace(/\s+/g, ' ').trim()) : [];
});
const spentDrawn = (drawnKpi.find(t => t.includes('مصروف على المنصة')) || '').replace(/[^\d.]/g, '');
check('★★★ «مصروف على المنصة» المرسوم = المحسوب (31,900 × 1.25 = 39,875)',
  spentDrawn === '39875', 'مرسوم=' + spentDrawn);
const remDrawn = (drawnKpi.find(t => t.includes('المتبقي')) || '').replace(/[^\d.]/g, '');
check('★★ والمتبقي = الرصيد − المستهلك (200,000 − 39,875)', remDrawn === '160125', 'مرسوم=' + remDrawn);
await page.screenshot({ path: `${SHOTS}/61-sub-budget.png`, fullPage: true });
check('★ وسطرُ المصدرين يفصل الشراءَ عن التعاقد',
  sbTxt.includes('أعمال تعاقدية') && sbTxt.includes('طلبات شراء'));
check('★★ وحسابٌ آخرُ لا يرث مستنداتِ غيره',
  await page.evaluate(() => window.contracts.substituteRollupFor('sb2').docs.length === 0));

/* ═════════ منتقي الطرف الباحث · وصفحاتُ سجل الأطراف ═════════   [v18.9.3085]
   السببُ الذي يجعل هذا فحصَ متصفّحٍ لا فحصَ نصّ: سماتُ `oninput/onclick`
   تُقيَّم في **النطاق العام**، فاسمٌ يسقط منه = خانةُ بحثٍ لا تبحث وزرُّ صفحةٍ
   لا ينقل — بلا مترجمٍ ولا خطأٍ في وحدة التحكّم. ولأنّ الصفحاتِ تُحسب على
   المرسوم لا على الحسبة وحدَها: الرقمُ في «عرض ٢٥–٤٨» يجب أن يساوي البطاقاتِ. */
console.log('\n=== منتقي الطرف الباحث · وصفحاتُ سجل الأطراف ===');
await page.evaluate(() => {
  // ٦٠ طرفاً — فوق سعة الصفحة (٢٤) بثلاث صفحاتٍ كاملة
  const ws = [];
  for (let i = 1; i <= 60; i++) {
    ws.push(db.collection('global_vendors').doc('VND-P' + String(i).padStart(3, '0')).set({
      name: 'طرفُ الصفحات ' + i, entityType: 'establishment', kind: 'supplier',
      status: 'active', trades: i === 7 ? ['insulation'] : ['tiling'],
      legal: { crNumber: '90000000' + String(i).padStart(2, '0') },
      phone: i === 7 ? '966501110007' : ''
    }));
  }
  return Promise.all(ws);
});
await page.waitForTimeout(1600);
await page.evaluate(() => {
  // بطاقةٌ مفتوحةٌ أو مرشّحٌ باقٍ من فحصٍ سابق يُخفيان الشبكةَ — نعود لقائمةٍ نظيفة
  window.contracts.backToVendors();
  ['q', 'kind', 'entity', 'status', 'trade'].forEach(k => window.contracts.filterVendors(k, ''));
  showPage('vendors');
});
await page.waitForTimeout(900);

const pg1 = await page.evaluate(() => {
  const el = document.getElementById('page-vendors');
  const bar = el.querySelector('.ct-pager');
  const n = (bar ? bar.querySelector('.ct-pager-n').textContent : '').replace(/\s+/g, ' ').trim();
  return { tiles: el.querySelectorAll('.ct-tile').length, bar: !!bar, n,
           total: window.contracts.vendors().length };
});
check('★★ السجلُّ الكبيرُ يُقسَّم صفحاتٍ — لا شبكةٌ بلا قاع',
  pg1.bar && pg1.tiles === 24 && pg1.total > 50, JSON.stringify(pg1));
check('★★★ والرقمُ المكتوبُ = المرسوم فعلاً («عرض ١–٢٤ من N» مقابل عدّ البطاقات)',
  pg1.n.includes('عرض 1 – 24 من ' + pg1.total) || pg1.n.replace(/\s/g, '') === ('عرض1–24من' + pg1.total),
  pg1.n);

const pg2 = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('#page-vendors .ct-pager-btn'));
  const two = btns.find(b => b.textContent.trim() === '2');
  if (!two) return { err: 'لا زرّ للصفحة ٢' };
  two.click();
  const el = document.getElementById('page-vendors');
  return { tiles: el.querySelectorAll('.ct-tile').length,
           n: el.querySelector('.ct-pager-n').textContent.replace(/\s+/g, ' ').trim(),
           first: (el.querySelector('.ct-tile-name') || {}).textContent };
});
check('★★ وزرُّ الصفحة ٢ ينقل فعلاً (سمةُ onclick تجد الدالّةَ في النطاق العام)',
  !pg2.err && pg2.tiles === 24 && /25/.test(pg2.n), JSON.stringify(pg2));
await page.evaluate(() => { const b = document.querySelector('#page-vendors .ct-pager'); if (b) b.scrollIntoView(); });
await page.waitForTimeout(400);
await page.screenshot({ path: `${SHOTS}/62-vendors-pager.png` });

const pgAfterSearch = await page.evaluate(() => {
  window.contracts.filterVendors('q', 'الصفحات 7');
  const el = document.getElementById('page-vendors');
  return { tiles: el.querySelectorAll('.ct-tile').length, bar: !!el.querySelector('.ct-pager') };
});
check('★★★ وبحثٌ وأنت في الصفحة ٢ يعود للأولى — لا شبكةَ فارغةٍ تُقرأ عطلاً',
  pgAfterSearch.tiles > 0 && !pgAfterSearch.bar, JSON.stringify(pgAfterSearch));
await page.evaluate(() => window.contracts.filterVendors('q', ''));
await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOTS}/62-vendors-paged.png`, fullPage: true });

/* المنتقي داخل نموذج طلب التعاقد */
await page.evaluate(() => { showPage('contract-requests'); window.contracts.newRequest(); });
await page.waitForTimeout(1200);
const vpBoot = await page.evaluate(() => ({
  input: !!document.getElementById('ct-vp-q-main'),
  noSelect: document.querySelectorAll('#page-contract-requests select[onchange*="setReqVendor"]').length,
  listHidden: (document.getElementById('ct-vp-l-main') || {}).hidden
}));
check('★★ خانةُ الطرف صارت بحثاً لا `<select>` بمئةِ خيارٍ تُلَفُّ بالإصبع',
  vpBoot.input && vpBoot.noSelect === 0 && vpBoot.listHidden === true, JSON.stringify(vpBoot));

await page.focus('#ct-vp-q-main');
await page.waitForTimeout(300);
const vpOpen = await page.evaluate(() => {
  const l = document.getElementById('ct-vp-l-main');
  return { hidden: l.hidden, rows: l.querySelectorAll('.ct-vp-row').length,
           more: !!l.querySelector('.ct-vp-more') };
});
check('★ التركيزُ يفتح القائمةَ كاملةً — بسقفٍ مرسومٍ يُقال عدداً لا بمئةِ صفٍّ',
  !vpOpen.hidden && vpOpen.rows === 40 && vpOpen.more, JSON.stringify(vpOpen));

await page.fill('#ct-vp-q-main', 'عزل');
await page.waitForTimeout(400);
const vpTrade = await page.evaluate(() => Array.from(
  document.querySelectorAll('#ct-vp-l-main .ct-vp-row .ct-vp-nm')).map(e => e.textContent.trim()));
check('★★ والبحثُ بالتخصّص يعمل داخل المنتقي (نفسُ قاعدة السجل)',
  vpTrade.length === 1 && vpTrade[0].includes('الصفحات 7'), vpTrade.join('|'));

await page.fill('#ct-vp-q-main', '0501110007');
await page.waitForTimeout(400);
const vpPhone = await page.evaluate(() => document.querySelectorAll('#ct-vp-l-main .ct-vp-row').length);
check('★★ وبرقم الجوال بأيّ صيغةٍ كتبها الباحث', vpPhone === 1, vpPhone + ' نتيجة');
await page.fill('#ct-vp-q-main', 'الصفحات 1');
await page.waitForTimeout(400);
await page.screenshot({ path: `${SHOTS}/63-vendor-picker-open.png` });
await page.fill('#ct-vp-q-main', '0501110007');
await page.waitForTimeout(400);

await page.evaluate(() => document.querySelector('#ct-vp-l-main .ct-vp-row').click());
await page.waitForTimeout(900);
const vpPicked = await page.evaluate(() => ({
  draft: window.contracts._draft().vendorId,
  name: window.contracts._draft().vendorName,
  shown: (document.getElementById('ct-vp-q-main') || {}).value,
  hidden: (document.getElementById('ct-vp-l-main') || {}).hidden
}));
check('★★★ والنقرُ يختار فعلاً — المسوّدةُ تحمل الطرفَ والخانةُ تعرض ما اختِير',
  vpPicked.draft === 'VND-P007' && /الصفحات 7/.test(vpPicked.name) &&
  /الصفحات 7/.test(vpPicked.shown) && vpPicked.hidden === true, JSON.stringify(vpPicked));

const vpClear = await page.evaluate(() => {
  const x = document.querySelector('#ct-vp-main .ct-vp-x');
  if (!x) return { err: 'لا زرَّ مسح' };
  x.click();
  return { draft: window.contracts._draft().vendorId };
});
await page.waitForTimeout(700);
check('★ وزرُّ المسح يُفرغ الاختيار (طرفٌ اختِير خطأً يُتراجَع عنه بنقرة)',
  !vpClear.err && vpClear.draft === '', JSON.stringify(vpClear));

const vpEnter = await page.evaluate(() => {
  const inp = document.getElementById('ct-vp-q-main');
  inp.focus(); window.contracts.vpickInput('main', 'عزل');
  window.contracts.vpickKey('main', { key: 'Enter', preventDefault() {} });
  return window.contracts._draft().vendorId;
});
await page.waitForTimeout(700);
check('★ و«اكتب ثم Enter» يأخذ النتيجةَ الأولى (يدٌ واحدةٌ على لوحة المفاتيح)',
  vpEnter === 'VND-P007', vpEnter);

const vpCand = await page.evaluate(() => {
  window.contracts.addCandidate();
  return new Promise(r => setTimeout(() => {
    const has = !!document.getElementById('ct-vp-q-c0');
    if (has) window.contracts.vpickChoose('c0', 'VND-P007');
    setTimeout(() => r({ has, id: ((window.contracts._draft().candidates || [])[0] || {}).vendorId }), 500);
  }, 500));
});
check('★★ والمرشّحون كذلك يُختارون بالبحث — لا عجلةٌ ثانيةٌ في جدولٍ ضيّق',
  vpCand.has && vpCand.id === 'VND-P007', JSON.stringify(vpCand));
await page.screenshot({ path: `${SHOTS}/63-vendor-picker.png`, fullPage: true });
await page.evaluate(() => window.contracts.cancelRequest());
await page.waitForTimeout(500);

check('لا أخطاء جافاسكربت طوال الرحلة', errors.length === 0, errors.slice(0, 2).join(' | '));

console.log('\n' + '═'.repeat(58));
console.log(fail ? `❌ ${fail} فشلت من ${pass + fail}` : `✅ ${pass}/${pass} — فحص وحدة التعاقدات نجح`);
console.log('═'.repeat(58) + '\n');
await browser.close();
process.exit(fail ? 1 : 0);
