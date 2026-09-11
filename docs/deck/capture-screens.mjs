// التقاطُ شاشاتٍ حقيقيةٍ من المنصّة لعرضِ الـPDF.
//
// ── لماذا لقطاتٌ حقيقيةٌ لا رسومٌ تُحاكيها ──
// الرسمُ اليدويُّ يتقادم بصمت: يكفي أن يتغيّر عمودٌ أو مسمّى حالةٍ ليصير العرضُ
// كاذباً بلا أن يُنبّه أحد. اللقطةُ تُولَّد من `index.html` نفسِه، فإن تغيّرت
// الشاشةُ تغيّرت الصورةُ في التوليد التالي.
//
// ── ولا تلمس الإنتاج ──
// نفسُ مُحاكي Firestore في الذاكرة الذي تستعمله `browser-scenarios.mjs`
// (مصدرٌ واحدٌ للحقيقة — يُستخرَج منها لا يُنسَخ)، وكلُّ نداءٍ خارجيٍّ يُجهَض.
// البياناتُ المزروعةُ أدناه من صنعِ هذا الملفّ وحدَه.
//
//   node docs/deck/capture-screens.mjs
//
// المقاسُ مقصود: نسبةُ 1360×716 هي نسبةُ مساحةِ الشاشة في الشريحة بالضبط،
// فتدخل الصورةُ بلا قصٍّ ولا أشرطةٍ فارغةٍ على الجانبين. و`deviceScaleFactor: 2`
// حتى تبقى الحروفُ حادّةً في الطباعة بعد التصغير.

import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, '../..');
const OUT  = path.join(HERE, 'screens');
fs.mkdirSync(OUT, { recursive: true });

// ── مُحاكي Firebase يُستخرَج من browser-scenarios.mjs، لا يُنسَخ ──
const bsrc = fs.readFileSync(path.join(REPO, 'browser-scenarios.mjs'), 'utf8');
const _a = bsrc.indexOf('const MOCK_FIREBASE = `');
const _s = bsrc.indexOf('`', _a) + 1, _e = bsrc.indexOf('`;', _s);
const MOCK_FIREBASE = bsrc.slice(_s, _e);
if (!MOCK_FIREBASE.includes('window.__store')) { console.error('تعذّر استخراج المُحاكي'); process.exit(1); }

const CDN_STUBS = `
  window.Chart = function(){ return { destroy(){}, update(){}, resize(){}, data:{}, options:{} }; };
  window.Chart.register = function(){}; window.Chart.defaults = { font:{} };
  window.XLSX = { utils:{ book_new:()=>({}), json_to_sheet:()=>({}), book_append_sheet(){}, aoa_to_sheet:()=>({}) }, writeFile(){}, write(){} };
  window.PptxGenJS = function(){ return { addSlide:()=>({ addText(){}, addImage(){}, addTable(){} }), writeFile(){ return Promise.resolve(); } }; };
`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1360, height: 716 }, deviceScaleFactor: 2 });
await page.addInitScript(MOCK_FIREBASE);
await page.addInitScript(CDN_STUBS);

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

const shots = [];
const shot = async (name) => {
  // التنبيهُ العائم (toast) يظهر ثوانيَ ثم يزول — لكنه يقع في اللقطة فيبدو
  // جزءاً من الشاشة. نُزيله قبل التصوير لا نُعطّله، فسلوكُ التطبيق كما هو.
  await page.evaluate(() => {
    document.querySelectorAll('.toast,#toast,.toast-box,[class*="toast"]').forEach(e => e.remove());
  }).catch(() => {});
  const p = path.join(OUT, name + '.png');
  await page.screenshot({ path: p });
  shots.push(name);
  console.log('  📸', name);
};

await page.goto('file://' + REPO + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);

console.log('\n── الالتقاط ──');
await shot('01-login');

// ══════════ زرعُ بياناتٍ كافيةٍ لتبدو الشاشاتُ عاملةً لا فارغة ══════════
const seeded = await page.evaluate(() => {
  const PC = PURCHASES_COLLECTION(), INV = INVENTORY_COLLECTION(), LOG = INVENTORY_LOG_COLLECTION();
  const iso = (d) => new Date(d).toISOString();
  const D = (n) => iso(Date.now() - n * 86400000);

  window.__store[PROJECTS_DOC] = { projects: [
    { id: 'hail',  name: 'أبراج المروج — الرياض', desc: 'صيانة وتشغيل 4 مبانٍ', icon: '' },
    { id: 'waha',  name: 'مجمّع الواحة — جدة',    desc: 'صيانة وتشغيل 6 مبانٍ', icon: '' },
  ] };
  window.__store[_meta('settings')] = {
    buildings: ['مبنى A — الإدارة', 'مبنى B — السكن', 'مبنى C — الورشة', 'مبنى D — المواقف'],
    supervisors: ['أسامة السادات', 'أشرف عشري', 'تركي المطيري'],
    workTypes: {
      'كهرباء': ['لمبة', 'قاطع', 'لوحة توزيع'],
      'تكييف':  ['وحدة مناولة', 'مضخة تصريف', 'فلتر'],
      'سباكة':  ['تسريب', 'صنبور', 'مضخة'],
    }
  };

  // ── المخزون ──
  const inv = [
    ['itm-cable', 'كابل مرن 3×2.5 مم',        'متر',  4,   25],
    ['itm-lamp',  'لمبة LED 18 واط',           'قطعة', 64,  20],
    ['itm-pump',  'مضخة تصريف مكثّفات 1/8',    'عدد',  0,   2],
    ['itm-insul', 'عازل حراري لمواسير 3/4',    'متر',  29,  15],
    ['itm-filt',  'فلتر هواء 20×25',           'قطعة', 18,  20],
    ['itm-elbow', 'كوع نحاسي 3/4',             'قطعة', 43,  10],
    ['itm-belt',  'حزام مروحة 4L-620',         'قطعة', 12,  6],
    ['itm-brk',   'قاطع كهربائي 32A',          'قطعة', 27,  10],
  ];
  inv.forEach(([id, nm, u, q, min]) => {
    window.__store[INV + '/' + id] = { itemId: id, itemName: nm, unit: u, currentQty: q, minQty: min, warehouseName: 'مستودع المروج' };
  });
  const mv = [
    ['lg1', 'in',  'itm-lamp',  60, 'وارد شراء — PO-1179', 2],
    ['lg2', 'out', 'itm-cable', 21, 'أمر صرف — ISS-0412',  2],
    ['lg3', 'in',  'itm-insul', 20, 'وارد شراء — PO-1183', 3],
    ['lg4', 'out', 'itm-filt',  6,  'أمر صرف — ISS-0409',  4],
    ['lg5', 'in',  'itm-brk',   30, 'وارد شراء — PO-1174', 6],
    ['lg6', 'out', 'itm-belt',  1,  'أمر صرف — ISS-0415',  1],
  ];
  mv.forEach(([id, t, iid, q, note, ago]) => {
    const it = inv.find(x => x[0] === iid);
    window.__store[LOG + '/' + id] = { type: t, itemId: iid, qty: q, itemName: it[1], unit: it[2], date: D(ago), note, warehouseName: 'مستودع المروج', by: 'م. سعود القحطاني' };
  });

  // ── طلبات الشراء ──
  // البنودُ مختلفةٌ لكلِّ طلبٍ عمداً: إجماليُّ الطلب يُحسَب من بنوده لا من `estCost`،
  // فلو تشابهت البنودُ ظهرت كلُّ الطلبات بمبلغٍ واحدٍ في كلِّ شاشة.
  const line = (nm, qty, unit, uc) => {
    const cost = Math.round(qty * uc), vat = Math.round(cost * 0.15);
    return { itemName: nm, qty, unit, unitCost: uc, itemCost: cost + vat, vat, rcvQty: qty };
  };
  const po = (id, status, vendor, ago, items, extra) => Object.assign({
    id, status, building: 'مبنى A — الإدارة', projectId: 'hail', vendor,
    supervisor: 'أسامة السادات', createdAt: D(ago),
    createdByUser: 'tarek', createdByName: 'م. تركي المطيري', items,
  }, extra || {});

  window.__store[PC + '/PO-1174'] = po('PO-1174', 'closed', 'مؤسسة الرواد للتجارة', 22, [
    line('قاطع كهربائي 32A', 30, 'قطعة', 118),
    line('كابل مرن 3×2.5 مم', 260, 'متر', 14),
  ], { auditedBy: 'م. سعود القحطاني' });

  window.__store[PC + '/PO-1179'] = po('PO-1179', 'closed_after_receipt', 'شركة الأفق للمقاولات', 15, [
    line('لمبة LED 18 واط', 60, 'قطعة', 46),
    line('فلتر هواء 20×25', 24, 'قطعة', 88),
    line('حزام مروحة 4L-620', 12, 'قطعة', 74),
  ], { auditedBy: 'م. سعود القحطاني' });

  window.__store[PC + '/PO-1183'] = po('PO-1183', 'wh_auditing', 'مؤسسة الرواد للتجارة', 4, [
    line('مضخة تصريف مكثّفات 1/8', 1, 'عدد', 1180),
    line('عازل حراري لمواسير 3/4', 24, 'متر', 29),
  ]);

  window.__store[PC + '/PO-1187'] = po('PO-1187', 'pending_finance', 'مؤسسة البناء الحديث', 12, [
    line('وحدة مناولة هواء — استبدال', 1, 'عدد', 31000),
    line('مواسير نحاس 3/4', 180, 'متر', 96),
    line('عازل حراري لمواسير 3/4', 180, 'متر', 29),
    line('أجرة تركيب ومناولة', 4, 'يوم', 1450),
  ], {
    timeline: [
      { event: 'أنشأ الطلب مرتبطاً بالبلاغ TK-2418', by: 'م. تركي المطيري', at: D(12), icon: '📝', notes: '' },
      { event: 'اعتمد مدير المشاريع الطلب',           by: 'أ. فيصل الحربي',   at: D(12), icon: '👔', notes: '' },
      { event: 'تمت مراجعة المستودع — لا يوجد رصيد',  by: 'م. سعود القحطاني', at: D(11), icon: '🏭', notes: 'الصنف غير متوفّر — يُشترى' },
      { event: 'جُمعت 3 عروض كاملة التغطية',          by: 'أ. ريم العتيبي',   at: D(9),  icon: '🛒', notes: '' },
      { event: 'اعتمد مدير المشاريع مقارنة الأسعار',  by: 'أ. فيصل الحربي',   at: D(8),  icon: '✅', notes: 'اختير أقلّ العروض' },
      { event: 'اعتمد المدير التنفيذي — تجاوز العتبة', by: 'أ. بدر الدوسري',  at: D(7),  icon: '🏢', notes: 'الإجمالي فوق 50,000 ريال' },
      { event: 'أُرسل للمالية للسداد',                 by: 'أ. ريم العتيبي',   at: D(7),  icon: '💳', notes: '' },
    ],
  });

  window.__store[PC + '/PO-1191'] = po('PO-1191', 'wh_reviewed', 'شركة الأفق للمقاولات', 3, [
    line('فلتر هواء 20×25', 40, 'قطعة', 88),
    line('لمبة LED 18 واط', 50, 'قطعة', 46),
  ]);

  window.__store[PC + '/PO-1193'] = po('PO-1193', 'pending_ceo', 'مؤسسة الرواد للتجارة', 2, [
    line('مولّد احتياطي 250kVA — عمرة', 1, 'عدد', 44000),
    line('زيوت وفلاتر', 6, 'عدد', 720),
    line('أجرة فنّي متخصّص', 5, 'يوم', 1350),
  ]);

  window.__store[PC + '/PO-1196'] = po('PO-1196', 'pending_pm', 'مؤسسة النور', 1, [
    line('كوع نحاسي 3/4', 40, 'قطعة', 18),
    line('صنابير مياه', 12, 'قطعة', 145),
  ]);

  // ── كتالوج البنود والأسعار ──
  // السعرُ المرجعيُّ هو مسطرةُ القياس التي يقارن بها الفحصُ الوقائيُّ والرقابةُ
  // المالية، فبلا كتالوجٍ مزروعٍ تبدو شاشتُه فارغةً وتفقد الشرائحُ معناها.
  const CAT = ITEM_CATALOG_COLLECTION();
  const cat = [
    ['cat-01', 'كابل مرن 3×2.5 مم',        'ELE-0157', 'متر',  'كهرباء', 14,   'مؤسسة الرواد للتجارة'],
    ['cat-02', 'قاطع كهربائي 32A',          'ELE-0203', 'قطعة', 'كهرباء', 118,  'مؤسسة الرواد للتجارة'],
    ['cat-03', 'لمبة LED 18 واط',           'ELE-0088', 'قطعة', 'كهرباء', 46,   'شركة الأفق للمقاولات'],
    ['cat-04', 'مضخة تصريف مكثّفات 1/8',    'MEC-0412', 'عدد',  'تكييف',  1180, 'مؤسسة البناء الحديث'],
    ['cat-05', 'عازل حراري لمواسير 3/4',    'MEC-0388', 'متر',  'تكييف',  29,   'مؤسسة الرواد للتجارة'],
    ['cat-06', 'فلتر هواء 20×25',           'MEC-0301', 'قطعة', 'تكييف',  88,   'شركة الأفق للمقاولات'],
    ['cat-07', 'حزام مروحة 4L-620',         'MEC-0355', 'قطعة', 'تكييف',  74,   'شركة الأفق للمقاولات'],
    ['cat-08', 'كوع نحاسي 3/4',             'PLM-0119', 'قطعة', 'سباكة',  18,   'مؤسسة النور'],
    ['cat-09', 'صنبور مياه — خلاط',          'PLM-0142', 'قطعة', 'سباكة',  145,  'مؤسسة النور'],
    ['cat-10', 'مواسير نحاس 3/4',           'PLM-0107', 'متر',  'سباكة',  96,   'مؤسسة البناء الحديث'],
    ['cat-11', 'زيت محرّك ديزل 15W40',       'GEN-0022', 'لتر',  'مولّدات', 34,  'مؤسسة الرواد للتجارة'],
    ['cat-12', 'أجرة فنّي تكييف',            'LBR-0004', 'يوم',  'مصنعيات', 450, '—'],
  ];
  cat.forEach(([id, name, code, unit, type, unitPrice, vendor]) => {
    window.__store[CAT + '/' + id] = {
      id, name, code, unit, type, unitPrice, vendor,
      updatedAt: D(30), createdAt: D(200), mergedFrom: null, addedAtReceiving: false,
    };
  });

  // ── الأصول وخطط الصيانة الوقائية ──
  // مواعيدُ الاستحقاق في المستقبل عمداً: خطةٌ مستحقّةٌ تولّد بلاغاً تلقائياً
  // (`checkPPMDue`) فتتلوّث لقطةُ البلاغات ببلاغاتٍ لم نزرعها.
  const AST = 'hail_assets', PPM = 'hail_ppm_plans';
  const assets = [
    ['AST-0041', 'وحدة مناولة هواء AHU-C-03', 'تكييف',  'مبنى C — الورشة',  'الدور 3 — غرفة المعدات', 'AHU-30TR-C', 'SN-88412'],
    ['AST-0042', 'مضخة حريق FP-C-01',          'سلامة',  'مبنى C — الورشة',  'السطح',                  'FP-150HP',   'SN-11907'],
    ['AST-0043', 'مولّد احتياطي 250kVA',        'كهرباء', 'مبنى C — الورشة',  'القبو',                  'GEN-250K',   'SN-40318'],
    ['AST-0044', 'مصعد ركّاب ELV-C-02',         'مصاعد',  'مبنى C — الورشة',  'البرج الشرقي',           'ELV-1000KG', 'SN-77260'],
    ['AST-0045', 'لوحة توزيع رئيسية PNL-C-04',  'كهرباء', 'مبنى C — الورشة',  'غرفة الكهرباء',          'MDB-1600A',  'SN-52104'],
    ['AST-0046', 'خزان مياه الحريق',            'سلامة',  'مبنى A — الإدارة', 'القبو',                  'TNK-90M3',   'SN-63009'],
    ['AST-0047', 'وحدة مناولة هواء AHU-A-01',   'تكييف',  'مبنى A — الإدارة', 'السطح',                  'AHU-40TR-A', 'SN-88510'],
    ['AST-0048', 'مضخة رفع مياه',               'سباكة',  'مبنى B — السكن',   'القبو',                  'PMP-15HP',   'SN-30221'],
  ];
  assets.forEach(([id, nm, tp, bld, fl, model, sn], i) => {
    window.__store[AST + '/' + id] = {
      id, name: nm, type: tp, subType: '', building: bld, floor: fl, location: fl,
      subLocation: '', serialNo: sn, model, installDate: iso('2023-03-15'),
      warrantyDate: iso('2027-03-15'), lastMaintDate: D(20 + i * 7),
      status: i === 0 ? 'يحتاج صيانة' : 'يعمل', notes: '', createdAt: D(300), updatedAt: D(20), createdBy: 'المسؤول',
    };
  });
  const plans = [
    ['PPM-0416', 'فحص ربع سنوي — لوحة توزيع رئيسية PNL-C-04', 'AST-0045', 'ربع سنوي', 'كهرباء', 3,  'خالد المطيري'],
    ['PPM-0417', 'فحص شهري — مضخة حريق FP-C-01',              'AST-0042', 'شهري',     'سلامة',  6,  'عبدالله الرشيدي'],
    ['PPM-0419', 'تشغيل شهري — مولّد احتياطي 250kVA',          'AST-0043', 'شهري',     'كهرباء', 9,  'خالد المطيري'],
    ['PPM-0422', 'فحص نصف شهري — مصعد ركّاب ELV-C-02',         'AST-0044', 'نصف شهري', 'مصاعد',  12, 'مقاول باطن — الصيانة'],
    ['PPM-0425', 'تنظيف فلاتر — وحدة مناولة AHU-A-01',         'AST-0047', 'شهري',     'تكييف',  16, 'سامي العنزي'],
    ['PPM-0427', 'فحص منسوب — خزان مياه الحريق',               'AST-0046', 'أسبوعي',   'سلامة',  2,  'عبدالله الرشيدي'],
  ];
  plans.forEach(([id, name, assetId, freq, wt, due, tech]) => {
    const a = assets.find(x => x[0] === assetId);
    window.__store[PPM + '/' + id] = {
      id, name, building: a[3], workType: wt, freq, priority: 'عادي 🟢 (48 ساعة)',
      tech, desc: 'الأصل في: ' + a[4], assetId,
      nextDueDate: iso(Date.now() + due * 86400000), secondDueDate: null,
      pendingApproval: false, disabled: false,
      createdAt: D(120), updatedAt: D(20), createdBy: 'المسؤول', lastGeneratedAt: D(30),
    };
  });

  // ── البلاغات ──
  const T = 'hail_tickets';
  const tk = (id, status, bld, wt, desc, pr, ago, extra) => Object.assign({
    id, status, building: bld, workType: wt, desc, priority: pr,
    createdAt: D(ago), supervisor: 'أسامة السادات', archived: false,
  }, extra || {});
  window.__store[T + '/TK-2418'] = tk('TK-2418', 'مفتوح', 'مبنى C — الورشة', 'تكييف', 'تسريب من وحدة التكييف المركزية بالدور الثالث — الماء يصل إلى السقف المستعار', 'عاجل 🔴 (4 ساعات)', 3);
  window.__store[T + '/TK-2417'] = tk('TK-2417', 'قيد التنفيذ', 'مبنى A — الإدارة', 'كهرباء', 'عطل في لوحة الإنارة الرئيسية بالمدخل', 'عاجل 🔴 (4 ساعات)', 2);
  window.__store[T + '/TK-2415'] = tk('TK-2415', 'مفتوح', 'مبنى B — السكن', 'سباكة', 'صيانة مضخة الحريق بالسطح — بانتظار قطعة غيار', 'عادي 🟢 (48 ساعة)', 2);
  window.__store[T + '/TK-2413'] = tk('TK-2413', 'مغلق', 'مبنى C — الورشة', 'تكييف', 'استبدال فلاتر التهوية بالقبو', 'عادي 🟢 (48 ساعة)', 5, { closedAt: D(4) });
  window.__store[T + '/TK-2411'] = tk('TK-2411', 'قيد التنفيذ', 'مبنى A — الإدارة', 'كهرباء', 'ضبط مغالق الأبواب الحريقية بالدور السابع', 'عادي 🟢 (48 ساعة)', 4);
  window.__store[T + '/TK-2409'] = tk('TK-2409', 'مفتوح', 'مبنى D — المواقف', 'كهرباء', 'إنارة الموقف الخارجي — ثلاثة أعمدة مطفأة', 'عادي 🟢 (48 ساعة)', 6);
  window.__store[T + '/TK-2406'] = tk('TK-2406', 'مغلق', 'مبنى B — السكن', 'سباكة', 'تنظيف مجاري تصريف المياه بالدور الثاني', 'عادي 🟢 (48 ساعة)', 8, { closedAt: D(7) });
  window.__store[T + '/TK-2404'] = tk('TK-2404', 'مغلق', 'مبنى C — الورشة', 'سباكة', 'فحص منسوب خزان الحريق', 'عادي 🟢 (48 ساعة)', 9, { closedAt: D(9) });

  return Object.keys(window.__store).length;
});
console.log(`  🌱 زُرع ${seeded} مستنداً`);

// ══════════ الدخول ══════════
AUTH_OK = true;
await page.fill('#login-user', 'admin');
await page.fill('#login-pass', 'Passw0rd!');
await page.click('.login-btn');
await page.waitForTimeout(3500);
await shot('02-projects');

// ══════════ دخول المشروع ══════════
await page.evaluate(() => { selectProject('hail'); });
await page.waitForTimeout(3000);

const SCREENS = [
  ['03-dashboard',  'dashboard',  null,                                      2200],
  ['04-tickets',    'tickets',    null,                                      1800],
  ['05-purchases',  'purchases',  null,                                      2000],
  ['06-inventory',  'inventory',  null,                                      1800],
  ['07-inv-log',    'inventory-log', null,                                   1800],
  ['08-new-po',     'new-purchase', null,                                    1800],
  ['09-assets',     'assets',     null,                                      2200],
  ['10-ppm',        'ppm',        null,                                      2200],
  ['11-daily',      'daily',      null,                                      1800],
  ['12-tv',         'tv',         null,                                      2800],
  ['14-kpi',        'kpi',        null,                                      2400],
  ['15-catalog',    'item-catalog', null,                                    2000],
  ['16-po-reports', 'purchase-reports',
    () => { try { generatePurchaseReport(); } catch (e) {} },                 2200],
];

for (const [name, pg, hook, wait] of SCREENS) {
  try {
    await page.evaluate((p) => { showPage(p); window.scrollTo(0, 0); }, pg);
    await page.waitForTimeout(wait);
    if (hook) { await page.evaluate(hook); await page.waitForTimeout(1200); }
    await shot(name);
  } catch (e) {
    console.log('  ⚠️ ', name, '—', String(e.message).slice(0, 90));
  }
}

// ── تفاصيل طلب شراء: الشاشةُ التي تحمل مسارَ الاعتماد ──
try {
  await page.evaluate(() => { showPage('purchases'); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { openPurchaseDetail('PO-1187'); });
  await page.waitForTimeout(2000);
  await shot('13-po-detail');
} catch (e) { console.log('  ⚠️  13-po-detail —', String(e.message).slice(0, 90)); }

console.log(`\n✅ ${shots.length} لقطة في ${OUT}\n`);
await browser.close();
