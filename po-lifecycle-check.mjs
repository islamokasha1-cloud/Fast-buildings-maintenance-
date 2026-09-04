// فحصُ دورة حياة طلب الشراء وعملياته الحسابية في متصفّح Chromium حقيقي — Firestore
// وهميّ في الذاكرة (نفس مُحاكي browser-scenarios.mjs، مصدرٌ واحد) فلا يلمس الإنتاج إطلاقاً.
//   node po-lifecycle-check.mjs   (يحتاج Chromium — كبقية فحوص المتصفّح)
//
// ── لماذا فحصٌ مستقلّ والمنطقُ مفحوصٌ في hail-tests؟ ──
// hail-tests يفحص النصَّ المصدري وأنماطَه؛ وهذا يشغّل **دوالَّ التطبيق نفسها** كما
// تعمل في المتصفّح ثم يقرأ الـDOM الناتج. فحسابٌ صحيحٌ في الذاكرة ورقمٌ آخر على
// الشاشة عطلٌ لا يكشفه إلا التشغيل الحقيقي — وطلبُ الشراء هو المسار الذي يُحاسَب
// عليه المال، فأولى ما يُحرَس.
//
// ── العهود المحروسة هنا ──
// • ض.ق.م تُقرَّب **على سعر الوحدة** ثم تُضرب في الكمية — لا على إجمالي السطر
//   (٣٣٫٣٣ × ٧ ⇒ ٢٦٨٫٣١؛ والتقريبُ على السطر يعطي رقماً آخر).
// • التكلفة الفعلية من **المستلَم** لا المطلوب (خلل v18.9tl: مطلوب ١٠ مستلم ٥ ⇒
//   ٢٨٫٧٥ لا ٥٧٫٥)، و`_poHealItems` يصحّح الجزئيَّ وحده بلا مسِّ السليم.
// • سندُ استلامٍ مكرَّر لا يُضخّم التكلفة ولا الكمية (المصدر البنودُ النهائية).
// • البند غير المستلَم لا تكلفة فعلية له، وطلبٌ بلا بندٍ مستلَم يرجع للمخزَّن.
// • الرقم على الشاشة = الرقم المحسوب (بطاقة الطلب بعد دخولٍ ونقرٍ فعليَّين).
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const REPO = process.env.REPO_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname));
const SHOTS = process.env.SHOTS_DIR || '/tmp/po-shots';
fs.mkdirSync(SHOTS, { recursive: true });

// ── مُحاكي Firebase من browser-scenarios.mjs (مصدرٌ واحد للحقيقة) ──
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

let pass = 0, fail = 0;
const L = (...a) => console.log(...a);
const check = (n, ok, d) => { if (ok) { pass++; L('  ✅', n, d ? '— ' + d : ''); } else { fail++; L('  ❌', n, d ? '— ' + d : ''); } };
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(MOCK_FIREBASE);
await page.addInitScript(CDN_STUBS);

const errors = [];
const IGNORE = /ServiceWorkerRegistration|net::ERR_FAILED|Failed to load resource|ERR_BLOCKED|reCAPTCHA|AppCheck/i;
page.on('pageerror', e => { const m = String(e.message).slice(0, 180); if (!IGNORE.test(m)) errors.push(m); });

// مُعالِج شبكة واحد: يردّ على خادم المصادقة الخارجي (لا كلمات مرور حقيقية)،
// ويُجهض كل نداءٍ خارجيٍّ آخر — نفس ما يفعله ui-walkthrough.mjs.
await page.route('**/*', route => {
  const u = route.request().url();
  if (u.includes('workers.dev/login')) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ token: 'tkn', profile: { user: 'admin', name: 'المسؤول', role: 'admin' } })
    });
  }
  if (/^https?:/.test(u)) return route.abort();
  return route.continue();
});

await page.goto('file://' + path.join(REPO, 'index.html'), { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3000);

L('\n════════════════════════════════════════════════════════════');
L('  دورة حياة طلب الشراء والعمليات الحسابية');
L('════════════════════════════════════════════════════════════');

L('\n=== ٠) الإقلاع ═══');
const boot = await page.evaluate(() => ({
  db: typeof db !== 'undefined' && !!db,
  fns: ['_poRepriceItem', 'getPOTotal', '_poItemLine', '_poItemsActual', 'poActualCost',
    'poReceivedQty', '_poHealItems', '_poAlignRows', 'poStageOf', 'poIsClosed', 'poBlocker',
    'normalizePOStatus'].filter(f => typeof window[f] !== 'function')
}));
check('التطبيق أقلع و db = المخزن الوهمي', boot.db);
check('كل دوالّ حساب الطلب موجودة', boot.fns.length === 0, boot.fns.length ? 'ناقص: ' + boot.fns.join(',') : '12 دالة');

/* ═══ ١) الحساب عند الإنشاء — ض.ق.م ١٥٪ على الوحدة ═══
   الاصطلاح المعتمد: الضريبة على **سعر الوحدة** مقرَّبةً لقرشين، ثم يُضرب إجماليُّ
   الوحدة في الكمية. (لا: الضريبةُ على إجمالي السطر — تعطي رقماً مختلفاً.) */
L('\n=== ١) حساب البند عند الإنشاء (ض.ق.م ١٥٪) ═══');
const s1 = await page.evaluate(() => ({
  simple: _poRepriceItem({ unitCost: 100 }, 3),
  round: _poRepriceItem({ unitCost: 33.33 }, 7),
  lump: _poRepriceItem({ unitCost: 0, itemCost: 1150, lineTotal: 1000, qty: 10, _origQty: 10 }, 4),
  zeroQty: _poRepriceItem({ unitCost: 100 }, 0)
}));
check('١أ) سعر ١٠٠ × ٣: صافي ٣٠٠', near(s1.simple.lineTotal, 300), 'lineTotal=' + s1.simple.lineTotal);
check('١أ) ★ ض.ق.م الوحدة ١٥ وإجمالي البند ٣٤٥', near(s1.simple.vatUnit, 15) && near(s1.simple.itemCost, 345),
  'vatUnit=' + s1.simple.vatUnit + ' itemCost=' + s1.simple.itemCost);
check('١أ) الضريبة = الإجمالي − الصافي = ٤٥', near(s1.simple.vat, 45), 'vat=' + s1.simple.vat);
// 33.33 × 15% = 4.9995 → 5.00 ⇒ 38.33 × 7 = 268.31 ، الصافي 233.31 ، الضريبة 35.00
check('١ب) ★ التقريب على الوحدة لا على السطر: ٣٣٫٣٣ × ٧ ⇒ ٢٦٨٫٣١',
  near(s1.round.itemCost, 268.31), 'itemCost=' + s1.round.itemCost);
check('١ب) الصافي ٢٣٣٫٣١ والضريبة ٣٥٫٠٠', near(s1.round.lineTotal, 233.31) && near(s1.round.vat, 35),
  'net=' + s1.round.lineTotal + ' vat=' + s1.round.vat);
check('١ج) ★ المقطوع (بلا سعر وحدة) يتناسب مع الكمية: ١٠ ⇒ ٤ = ٤٦٠',
  near(s1.lump.itemCost, 460) && near(s1.lump.lineTotal, 400),
  'itemCost=' + s1.lump.itemCost + ' net=' + s1.lump.lineTotal);
check('١د) كمية صفر ⇒ تكلفة صفر (لا NaN)', s1.zeroQty.itemCost === 0 && s1.zeroQty.lineTotal === 0);

/* ═══ ٢) إجمالي الطلب ═══ */
L('\n=== ٢) إجمالي الطلب (getPOTotal) ═══');
const s2 = await page.evaluate(() => ({
  items: getPOTotal({ items: [{ itemCost: 345 }, { itemCost: 268.31 }, { itemCost: 460 }] }),
  est: getPOTotal({ estCost: 5000 }),
  empty: getPOTotal({ items: [], estCost: 0 })
}));
check('٢أ) الإجمالي = مجموع البنود (١٠٧٣٫٣١)', near(s2.items, 1073.31), 'total=' + s2.items);
check('٢ب) بلا بنود ⇒ التقدير المخزَّن', near(s2.est, 5000), 'total=' + s2.est);
check('٢ج) طلبٌ فارغ ⇒ صفر لا NaN', s2.empty === 0);

/* ═══ ٣) دورة الحياة: مرحلةُ كل حالة ومن يقف عليها ═══ */
L('\n=== ٣) دورة الحياة — المراحل والمسؤول عن كل بوّابة ═══');
const s3 = await page.evaluate(() => {
  const chain = ['pending_pm', 'pm_approved', 'wh_review', 'wh_reviewed', 'pending_proc',
    'pending_ceo', 'proc_executing', 'wh_receiving', 'wh_auditing', 'closed'];
  return {
    stages: chain.map(st => ({ st, stage: poStageOf(st), wip: poStageIsWip({ status: st }), blocker: poBlocker({ status: st }) })),
    closed: { closed: poIsClosed({ status: 'closed' }), after: poIsClosed({ status: 'closed_after_receipt' }), open: poIsClosed({ status: 'wh_receiving' }) },
    rejected: { stage: poStageOf('pm_rejected'), wip: poStageIsWip({ status: 'pm_rejected' }) },
    unknown: poStageOf('حالةٌ لا وجود لها')
  };
});
check('٣أ) ★ كل حالات السلسلة العشر مصنَّفةٌ لمرحلة', s3.stages.filter(x => x.stage).length === 10,
  s3.stages.filter(x => x.stage).length + '/10');
check('٣ب) ★ التسع الأُوَل «قيد التنفيذ» و«مغلق» ليس كذلك',
  s3.stages.slice(0, 9).every(x => x.wip === true) && s3.stages[9].wip === false);
const blockers = s3.stages.filter(x => x.blocker).map(x => x.st + '⇐' + x.blocker);
check('٣ج) بوّابات القرار تسمّي صاحب الدور', blockers.length >= 4, blockers.slice(0, 4).join(' · '));
check('٣د) ★ poIsClosed يقبل الإغلاقين ويرفض قيد التنفيذ',
  s3.closed.closed && s3.closed.after && !s3.closed.open);
check('٣هـ) المرفوض «خارج المسار» ولا يُعدّ قيد التنفيذ', s3.rejected.stage === 'out' && s3.rejected.wip === false);
check('٣و) حالةٌ مجهولة ⇒ null (لا تصنيفَ كاذب)', s3.unknown === null);

/* ═══ ٤) الاستلام الجزئي — الخلل الموثّق (v18.9tl) ═══ */
L('\n=== ٤) الاستلام الجزئي والتكلفة الفعلية ═══');
const s4 = await page.evaluate(() => {
  const po = {
    status: 'closed', auditedBy: 'مسؤول المستودع',
    items: [{ itemId: 'A', itemName: 'كابل', unitCost: 5, qty: 10, itemCost: 57.5, vat: 7.5, lineTotal: 50, rcvQty: 5 }]
  };
  return {
    line: _poItemLine(po.items[0], true),
    lineUnaudited: _poItemLine(po.items[0], false),
    actual: poActualCost(po),
    rcv: poReceivedQty(po)
  };
});
check('٤أ) ★ سطر البند المُدقَّق يُحسب من المستلَم: إجمالي ٢٨٫٧٥', near(s4.line.total, 28.75), 'total=' + s4.line.total);
check('٤أ) صافيه ٢٥ وضريبته ٣٫٧٥', near(s4.line.net, 25) && near(s4.line.vat, 3.75), 'net=' + s4.line.net + ' vat=' + s4.line.vat);
check('٤ب) ★ غير المُدقَّق يبقى على المخزَّن (٥٧٫٥) — لا تصحيحَ قبل التدقيق',
  near(s4.lineUnaudited.total, 57.5), 'total=' + s4.lineUnaudited.total);
check('٤ج) ★ التكلفة الفعلية للطلب = ٢٨٫٧٥ لا ٥٧٫٥', near(s4.actual, 28.75), 'actual=' + s4.actual);
check('٤د) الكمية المستلمة = ٥', near(s4.rcv, 5), 'rcv=' + s4.rcv);

/* ═══ ٥) البند غير المستلَم لا تكلفة فعلية له ═══ */
L('\n=== ٥) البند غير المستلَم (مغطّى من المخزون أو لم يصل) ═══');
const s5 = await page.evaluate(() => {
  const po = {
    status: 'closed', auditedBy: 'م',
    items: [
      { itemId: 'A', unitCost: 5, qty: 10, itemCost: 57.5, vat: 7.5, rcvQty: 10 },
      { itemId: 'B', unitCost: 20, qty: 3, itemCost: 69, vat: 9, rcvQty: 0 }
    ]
  };
  const noneRcv = { status: 'closed', auditedBy: 'م', actualCost: 999, items: [{ itemId: 'B', unitCost: 20, qty: 3, itemCost: 69, vat: 9, rcvQty: 0 }] };
  return { actual: poActualCost(po), rcv: poReceivedQty(po), fallback: poActualCost(noneRcv) };
});
check('٥أ) ★ البند بكمية صفر لا يدخل التكلفة الفعلية (٥٧٫٥ لا ١٢٦٫٥)', near(s5.actual, 57.5), 'actual=' + s5.actual);
check('٥ب) الكمية المستلمة تجمع المستلَم وحده = ١٠', near(s5.rcv, 10), 'rcv=' + s5.rcv);
check('٥ج) ★ طلبٌ بلا أي بندٍ مستلَم يرجع للقيمة المخزَّنة لا صفراً كاذباً', near(s5.fallback, 999), 'actual=' + s5.fallback);

/* ═══ ٦) تضخّم السندات — سندٌ مكرَّر لا يُضاعف التكلفة (v18.9tk) ═══ */
L('\n=== ٦) سندات الاستلام المكرَّرة (تضخّم grnDocs) ═══');
const s6 = await page.evaluate(() => {
  const withItems = {
    status: 'closed', auditedBy: 'م',
    items: [{ itemId: 'A', unitCost: 5, qty: 10, itemCost: 57.5, vat: 7.5, rcvQty: 5 }],
    grnDocs: [{ invoicedTotal: 57.5, totalRcv: 5 }, { invoicedTotal: 57.5, totalRcv: 5 }]
  };
  const legacy = {   // نمطٌ قديم: مُدقَّق بلا بنود مفصّلة ⇒ السندات هي المصدر الوحيد
    status: 'closed', auditedBy: 'م', items: [],
    grnDocs: [{ invoicedTotal: 40, totalRcv: 4 }, { invoicedTotal: 60, totalRcv: 6 }]
  };
  return { fromItems: poActualCost(withItems), rcv: poReceivedQty(withItems), legacy: poActualCost(legacy), legacyRcv: poReceivedQty(legacy) };
});
check('٦أ) ★ سندان مكرّران لا يُضخّمان التكلفة (٢٨٫٧٥ لا ١١٥)', near(s6.fromItems, 28.75), 'actual=' + s6.fromItems);
check('٦ب) ★ ولا الكمية (٥ لا ١٠)', near(s6.rcv, 5), 'rcv=' + s6.rcv);
check('٦ج) الطلب القديم بلا بنود يُحسب من السندات (١٠٠ · ١٠)', near(s6.legacy, 100) && near(s6.legacyRcv, 10),
  'actual=' + s6.legacy + ' rcv=' + s6.legacyRcv);

/* ═══ ٧) _poHealItems — تطبيعُ البنود المخزَّنة الخاطئة (v18.9tm) ═══ */
L('\n=== ٧) شفاءُ البنود المخزَّنة عند التحميل ═══');
const s7 = await page.evaluate(() => {
  const bad = { status: 'closed', auditedBy: 'م', items: [{ itemId: 'A', unitCost: 5, qty: 10, itemCost: 57.5, vat: 7.5, lineTotal: 50, rcvQty: 5 }] };
  const before = bad.items[0].itemCost;
  _poHealItems(bad);
  const good = { status: 'closed', auditedBy: 'م', items: [{ itemId: 'B', unitCost: 5, qty: 5, itemCost: 28.75, vat: 3.75, lineTotal: 25, rcvQty: 5 }] };
  _poHealItems(good);
  const notAudited = { status: 'wh_receiving', items: [{ itemId: 'C', unitCost: 5, qty: 10, itemCost: 57.5, vat: 7.5, rcvQty: 5 }] };
  _poHealItems(notAudited);
  return { before, after: bad.items[0].itemCost, afterVat: bad.items[0].vat, good: good.items[0].itemCost, untouched: notAudited.items[0].itemCost };
});
check('٧أ) ★ البند المبنيّ على المطلوب يُشفى إلى المستلَم (٥٧٫٥ ⇒ ٢٨٫٧٥)',
  near(s7.before, 57.5) && near(s7.after, 28.75), 'قبل=' + s7.before + ' بعد=' + s7.after);
check('٧ب) وضريبته معه (٣٫٧٥)', near(s7.afterVat, 3.75), 'vat=' + s7.afterVat);
check('٧ج) ★ البند السليم لا يُمَسّ (لا تذبذبَ تقريب)', near(s7.good, 28.75), 'itemCost=' + s7.good);
check('٧د) ★ الطلب غير المُدقَّق لا يُمَسّ (التقدير يبقى ٥٧٫٥)', near(s7.untouched, 57.5), 'itemCost=' + s7.untouched);

/* ═══ ٨) اصطفافُ صفوف التدقيق — بندان لنفس الصنف ═══ */
L('\n=== ٨) اصطفاف صفوف التدقيق على البنود ═══');
const s8 = await page.evaluate(() => {
  const aligned = _poAlignRows(
    [{ itemId: 'A', rcvQty: 1 }, { itemId: 'A', rcvQty: 2 }, { itemId: 'B', rcvQty: 3 }],
    [{ itemId: 'A', tag: 'r1' }, { itemId: 'A', tag: 'r2' }, { itemId: 'B', tag: 'r3' }]);
  const shuffled = _poAlignRows([{ itemId: 'B' }, { itemId: 'A' }], [{ itemId: 'A', tag: 'ra' }, { itemId: 'B', tag: 'rb' }]);
  const missing = _poAlignRows([{ itemId: 'A' }, { itemId: 'Z' }], [{ itemId: 'A', tag: 'ra' }]);
  return { tags: aligned.map(r => r && r.tag), shuffled: shuffled.map(r => r && r.tag), missing: missing.map(r => r && r.tag) };
});
check('٨أ) ★ بندان لنفس الصنف يبقيان على صفَّيهما (لا يلتهم الأول الثاني)',
  JSON.stringify(s8.tags) === JSON.stringify(['r1', 'r2', 'r3']), s8.tags.join(','));
check('٨ب) الاصطفاف بالهوية لا بالترتيب', JSON.stringify(s8.shuffled) === JSON.stringify(['rb', 'ra']), s8.shuffled.join(','));
check('٨ج) بندٌ بلا صفٍّ يُرجع null لا صفَّ غيره', s8.missing[0] === 'ra' && s8.missing[1] === null);

/* ═══ ٩) دورةٌ كاملة على المخزن الوهمي: إنشاء ← اعتماد ← استلام ← إغلاق ═══ */
L('\n=== ٩) دورةٌ كاملة عبر المخزن الوهمي ═══');
const s9 = await page.evaluate(async () => {
  const out = {};
  const COL = (typeof PURCHASE_COLLECTION === 'function') ? PURCHASE_COLLECTION() : 'global_purchases';
  const mk = (unitCost, qty) => {
    const r = _poRepriceItem({ unitCost }, qty);
    return { itemId: 'i' + unitCost, itemName: 'صنف ' + unitCost, unitCost, qty, itemCost: r.itemCost, vat: r.vat, lineTotal: r.lineTotal };
  };
  const po = { id: 'PO-LIFE-1', status: 'pending_pm', items: [mk(5, 10), mk(20, 3)], projectId: 'hail' };
  out.estTotal = getPOTotal(po);

  const trail = [];
  ['pm_approved', 'wh_reviewed', 'pending_proc', 'proc_executing', 'wh_receiving', 'wh_auditing'].forEach(st => {
    po.status = st; trail.push({ st, stage: poStageOf(st), cost: poActualCost(po) });
  });
  out.trail = trail;
  out.costStableWhileOpen = trail.every(t => Math.abs(t.cost - out.estTotal) < 0.005);

  // تدقيق الاستلام: جزئيٌّ للأول وكاملٌ للثاني
  po.items[0].rcvQty = 5; po.items[1].rcvQty = 3;
  po.auditedBy = 'مسؤول المستودع';
  po.status = 'closed';
  _poHealItems(po);
  out.finalCost = poActualCost(po);
  out.finalRcv = poReceivedQty(po);
  out.finalStage = poStageOf(po.status);
  out.isClosed = poIsClosed(po);
  out.itemCosts = po.items.map(i => i.itemCost);

  window.__store[COL + '/' + po.id] = po;
  out.persisted = !!window.__store[COL + '/' + po.id];
  return out;
});
// المقدَّر: 57.5 + 69 = 126.5 ؛ النهائي: 28.75 + 69 = 97.75 ؛ المستلَم: 5 + 3 = 8
check('٩أ) الإجمالي المقدَّر عند الإنشاء = ١٢٦٫٥', near(s9.estTotal, 126.5), 'est=' + s9.estTotal);
check('٩ب) ★ التكلفة لا تتغيّر ما دام الطلب مفتوحاً (تبقى التقدير)', s9.costStableWhileOpen === true);
check('٩ج) المسار مرَّ بست مراحل مصنَّفة', s9.trail.filter(t => t.stage).length === 6,
  s9.trail.map(t => t.stage).join(' → '));
check('٩د) ★ بعد التدقيق: التكلفة الفعلية ٩٧٫٧٥ (٢٨٫٧٥ جزئيّ + ٦٩ كامل)', near(s9.finalCost, 97.75), 'actual=' + s9.finalCost);
check('٩هـ) ★ الكمية المستلمة ٨ (٥ + ٣)', near(s9.finalRcv, 8), 'rcv=' + s9.finalRcv);
check('٩و) الشفاء صحّح البند الجزئيَّ وحده', near(s9.itemCosts[0], 28.75) && near(s9.itemCosts[1], 69), s9.itemCosts.join(' · '));
check('٩ز) الطلب مغلقٌ ومصنَّفٌ «مكتمل / مغلق»', s9.isClosed === true && s9.finalStage === 'closed');
check('٩ح) الطلب ثبت في المخزن', s9.persisted === true);

/* ═══ ١٠) العرض: الرقم على الشاشة = الرقم المحسوب ═══
   دخولٌ حقيقيٌّ ونقرٌ فعليٌّ على «المشتريات المركزية» — فاللقطةُ دليلٌ صادقٌ على ما
   يراه المستخدم، لا رسمٌ خلف طبقة الدخول. */
L('\n=== ١٠) العرض — الأرقام على الشاشة لا في الذاكرة فقط ═══');
await page.evaluate(() => {
  window.__store[PROJECTS_DOC] = { projects: [{ id: 'hail', name: 'مشروع حائل', desc: 'صيانة مبانٍ', icon: '' }] };
  window.__store[_meta('settings')] = { buildings: ['مبنى الإدارة'], supervisors: ['أسامة السادات'], workTypes: { 'كهرباء': ['لمبة'] } };
});
await page.fill('#login-user', 'admin');
await page.fill('#login-pass', 'Passw0rd!');
await page.click('.login-btn');
await page.waitForTimeout(4000);
check('١٠·٠) الدخول نجح (اللقطةُ لما يراه المستخدم فعلاً)',
  await page.evaluate(() => !!(typeof currentUser !== 'undefined' && currentUser && currentUser.role)));
const gpBtn = await page.isVisible('#global-purchases-btn-wrap button').catch(() => false);
if (gpBtn) { await page.click('#global-purchases-btn-wrap button'); await page.waitForTimeout(3000); }
check('١٠·١) فُتحت المشتريات المركزية بنقرٍ فعليّ', gpBtn === true);

const s10 = await page.evaluate(() => {
  try {
    const COL = (typeof PURCHASE_COLLECTION === 'function') ? PURCHASE_COLLECTION() : 'global_purchases';
    const po = window.__store[COL + '/PO-LIFE-1'];
    po.createdAt = new Date().toISOString();
    po.itemName = 'صنف 5';
    // `purchases` معرَّفةٌ بـ let في النطاق المعجمي العام — الإسنادُ بالإشارة المجرّدة
    // يصل إليها، بينما window.purchases لا (كما يوثّق getPurchases في purchase-kpi).
    purchases = [po];
    if (typeof showPage === 'function') showPage('purchases');
    if (typeof renderPurchases === 'function') renderPurchases();
    const el = document.getElementById('page-purchases');
    const card = Array.from(document.querySelectorAll('#page-purchases *'))
      .map(n => n.innerText || '').find(t => t && t.includes('PO-LIFE-1')) || '';
    return { ok: true, text: (el ? el.innerText : '').replace(/\s+/g, ' '), card: card.replace(/\s+/g, ' ').slice(0, 300) };
  } catch (e) { return { ok: false, err: e.message }; }
});
check('١٠أ) صفحة المشتريات رُسمت بلا استثناء', s10.ok === true, s10.ok ? '' : s10.err);
check('١٠ب) ★ بطاقةُ الطلب ظهرت على الشاشة برقمه', s10.ok && s10.card.includes('PO-LIFE-1'), (s10.card || '').slice(0, 140));
check('١٠ج) ★ التكلفة الفعلية المعروضة = ٩٧٫٧٥ (المحسوبةُ نفسها لا رقمٌ آخر)',
  s10.ok && /97[.,٫]75/.test(s10.card), (s10.card || '').slice(0, 140));
check('١٠د) ★ نسبة الاستلام المعروضة ٨ من ١٣ (المستلَم/المطلوب)',
  s10.ok && /8\s*\/\s*13/.test(s10.card), (s10.card.match(/الاستلام[^|]{0,25}/) || [''])[0]);
check('١٠هـ) ★ اللقطة لصفحةٍ مرئيّةٍ فعلاً (طبقةُ الدخول اختفت)',
  !(await page.isVisible('#login-screen').catch(() => false)));
await page.screenshot({ path: SHOTS + '/purchases.png' });
const cardEl = page.locator('#page-purchases').getByText('PO-LIFE-1').first();
try {
  await cardEl.scrollIntoViewIfNeeded({ timeout: 5000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOTS + '/po-card.png' });
  check('١٠و) بطاقةُ الطلب صارت مرئيّةً في إطار العرض', await cardEl.isVisible());
} catch (e) { check('١٠و) بطاقةُ الطلب صارت مرئيّةً في إطار العرض', false, e.message.slice(0, 80)); }

/* ══ ١١) بنودُ الطلب تظهر على الجوال ══   (بلاغُ المالك — v18.9.2621)
   `po-items` كان اسمَ مكوّنين لا صلةَ بينهما: **صندوقُ جدول البنود** في نافذة
   التفاصيل، و**سطرُ ملخّص البنود** في بطاقة القائمة ومعه `-webkit-line-clamp:2`.
   والثاني أدنى في الورقة فيرثه الصندوق، فيُقصّ على WebKit (آيفون) إلى سطرين:
   شريطُ العنوان وصفُّ الترويسة **وتختفي البنودُ كلُّها**؛ بينما يتجاهله Blink
   فيبدو الكمبيوتر سليماً — ولذلك يُفحَص **النمطُ المحسوب** لا الارتفاعُ وحدَه:
   المحرّكُ الذي بين أيدينا لا يُظهر العطلَ الذي يراه المستخدم. */
L('\n=== ١١) بنودُ الطلب على الجوال — الصندوقُ لا يُقصّ ═══');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
const mob = await page.evaluate(() => {
  try {
    const COL = (typeof PURCHASE_COLLECTION === 'function') ? PURCHASE_COLLECTION() : 'global_purchases';
    const po = window.__store[COL + '/PO-LIFE-1'];
    openPurchaseDetail(po.id || 'PO-LIFE-1');
    const box  = document.querySelector('#modal-purchase-detail .po-items');
    const scr  = document.querySelector('#modal-purchase-detail .po-items-scroll');
    const rows = Array.from(document.querySelectorAll('#modal-purchase-detail .po-table tbody tr'));
    if (!box) return { ok: false, err: 'صندوقُ البنود غير موجود' };
    const cs = getComputedStyle(box), bx = box.getBoundingClientRect();
    return {
      ok: true,
      clamp: cs.webkitLineClamp, display: cs.display,
      want: (po.items || []).length,          // العددُ من الوثيقة لا رقمٌ محفورٌ في الفحص
      rows: rows.length,
      inside: rows.filter(tr => { const r = tr.getBoundingClientRect(); return r.height > 0 && r.bottom <= bx.bottom + 1; }).length,
      scrolls: scr ? (scr.scrollWidth > scr.clientWidth + 1) : false,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  } catch (e) { return { ok: false, err: e.message }; }
});
check('١١·٠) نافذةُ التفاصيل فُتحت على مقاس الجوال', mob.ok === true, mob.ok ? '' : mob.err);
check('١١أ) ★★ صندوقُ البنود بلا قصِّ أسطر (لو ورث clamp لاختفت البنودُ على آيفون)',
  mob.ok && mob.clamp === 'none' && mob.display !== '-webkit-box',
  'clamp=' + mob.clamp + ' · display=' + mob.display);
check('١١ب) ★★ كلُّ بندٍ في الوثيقة مرسومٌ **داخل** الصندوق لا مقصوصاً خارجَه',
  mob.ok && mob.want > 1 && mob.rows === mob.want && mob.inside === mob.want,
  'في الوثيقة ' + mob.want + ' · مرسوم ' + mob.rows + ' · داخل ' + mob.inside);
check('١١ج) ★ والجدولُ العريض يُمرَّر أفقياً داخل صندوقه لا بإفاضة الصفحة',
  mob.ok && mob.scrolls === true && mob.pageOverflow <= 1,
  'تمريرُ الصندوق=' + mob.scrolls + ' · فيضُ الصفحة=' + mob.pageOverflow + 'px');
await page.screenshot({ path: SHOTS + '/po-detail-mobile.png', fullPage: false });
await page.evaluate(() => { try { closeModal('modal-purchase-detail'); } catch (e) {} });
await page.setViewportSize({ width: 1440, height: 900 });

L('\n=== ١٢) أداءُ مسؤولي المشتريات — الرقمُ المرسوم = الرقمُ المحسوب ═══');
// لماذا هنا: هذا القسمُ يُقاس عليه **أشخاص**. حسابٌ صحيحٌ في الذاكرة ورقمٌ آخرُ على
// الشاشة يعني موظّفاً يُحاسَب على رقمٍ لم يحسبه أحد. فيُبذَر طلبان بمسارٍ كاملٍ يحمل
// هويّةَ الفاعل، ثم تُفتح الصفحةُ فعلاً ويُقرأ الجدولُ المرسومُ خليّةً خليّة.
const staff = await page.evaluate(async () => {
  /* سجلُّ المستخدمين كما في لقطة المالك: أسماءُ الدخول والعرض متطابقة، والسجلاتُ
     القديمة لا تحمل إلّا اسمَ العرض — فبه وحدَه يُعرف الدور. */
  USERS = [{ user: 'وائل عبد المجيد', name: 'وائل عبد المجيد', role: 'procurement_officer' },
           { user: 'عبدالله الشمري',  name: 'عبدالله الشمري',  role: 'procurement_officer' },
           { user: 'محمد',            name: 'محمد',            role: 'warehouse_manager' },
           { user: 'Ceo01',           name: 'Ceo Abdallah Al Ardi', role: 'ceo' },
           { user: 'sup',             name: 'محمد داوود',      role: 'supervisor' },
           { user: 'root',            name: 'مدير النظام',     role: 'admin' }];
  /* المسارُ كما يجري فعلاً: المستودعُ يُحيل بـwh_reviewed («بانتظار تنفيذ المشتريات»)
     ثم يُخرجه مسؤولُ المشتريات. النسخةُ الأولى قاست pending_proc — مسارَ الارتداد
     النادر — فخرج العمودُ فارغاً على بياناتٍ حقيقية. */
  const mk = (id, ownerU, ownerN, cost, endCode, role) => ({
    id, projectId: 'hail', projectName: 'هايل', status: 'closed',
    createdAt: '2026-07-01T06:00:00Z', updatedAt: '2026-07-03T06:00:00Z',
    actualCost: cost, estCost: cost,
    items: [{ itemName: 'بند ' + id, qty: 1, unitCost: cost, itemCost: cost, receivedQty: 1 }],
    timeline: [
      { code: 'wh_reviewed', at: '2026-07-01T08:00:00Z', by: 'مسؤول المستودع', byUser: 'wh', byRole: 'warehouse_manager' },
      { code: endCode,       at: '2026-07-01T12:00:00Z', by: ownerN, byUser: ownerU, byRole: role || 'procurement_officer' },
    ]
  });
  /* شكلُ الطلب الذي أنتج بلاغَ المالك: قيدٌ **بلا رمز** بين دخول المشتريات وخروجها،
     فكان الماسحُ يتخطّاه ويقفز إلى قيدٍ أبعدَ كتبه التنفيذيُّ بعد أيام. */
  const leap = (id, u, n, role) => ({ id, projectId: 'hail', projectName: 'هايل', status: 'closed',
    createdAt: '2026-07-01T06:00:00Z', updatedAt: '2026-07-09T06:00:00Z', actualCost: 700, estCost: 700,
    items: [{ itemName: 'بند ' + id, qty: 1, unitCost: 700, itemCost: 700, receivedQty: 1 }],
    timeline: [
      { code: 'wh_reviewed', at: '2026-07-01T08:00:00Z', by: 'مسؤول المستودع', byUser: 'wh', byRole: 'warehouse_manager' },
      { event: 'تعديل بيانات الطلب بواسطة المسؤول', at: '2026-07-02T08:00:00Z', by: 'مدير النظام', byUser: 'root', byRole: 'admin' },
      { code: 'pending_finance', at: '2026-07-08T08:00:00Z', by: n, byUser: u, byRole: role },
    ]});
  /* `purchases` معرَّفةٌ بـ`let` في النواة، فلا تصبح خاصّيةً على `window`؛ والوحدةُ
     تقرؤها **بالاسم المجرّد** (getPurchases). فالبذرُ على `window.purchases` يُبذَر
     في مصفوفةٍ أخرى لا يقرؤها أحد — وهي العلّةُ نفسُها التي تشرحها ترويسةُ الوحدة. */
  purchases = [
    mk('PO-STAFF-1', 'saad', 'سعد', 1000, 'pending_finance'),
    mk('PO-STAFF-2', 'saad', 'سعد', 2000, 'pending_finance'),
    mk('PO-STAFF-3', 'noor', 'نور',  700, 'pending_ceo'),
    mk('PO-STAFF-4', 'root', 'مدير النظام',  400, 'pending_finance', 'admin'),        // خارجَ الجدول
    mk('PO-STAFF-5', 'sup',  'محمد داوود',   300, 'pending_finance', 'supervisor'),   // وكذلك المشرف
    mk('PO-STAFF-6', 'boss', 'عبدالله',      200, 'pending_finance', 'ceo'),          // والتنفيذيّ
    // حالةُ المالك: سجلٌّ قديمٌ باسمِ عرضٍ فقط لمسؤولَي مشتريات حقيقيَّين
    { id: 'PO-OLD-1', projectId: 'hail', projectName: 'هايل', status: 'closed',
      createdAt: '2026-07-01T06:00:00Z', updatedAt: '2026-07-03T06:00:00Z', actualCost: 900, estCost: 900,
      items: [{ itemName: 'بند قديم', qty: 1, unitCost: 900, itemCost: 900, receivedQty: 1 }],
      timeline: [{ code: 'wh_reviewed',     at: '2026-07-01T08:00:00Z', by: 'محمد' },
                 { code: 'pending_finance', at: '2026-07-01T12:00:00Z', by: 'وائل عبد المجيد' }] },
    { id: 'PO-OLD-2', projectId: 'hail', projectName: 'هايل', status: 'closed',
      createdAt: '2026-07-01T06:00:00Z', updatedAt: '2026-07-03T06:00:00Z', actualCost: 600, estCost: 600,
      items: [{ itemName: 'بند قديم ٢', qty: 1, unitCost: 600, itemCost: 600, receivedQty: 1 }],
      timeline: [{ code: 'wh_reviewed',     at: '2026-07-01T08:00:00Z', by: 'محمد' },
                 { code: 'pending_finance', at: '2026-07-01T12:00:00Z', by: 'عبدالله الشمري' }] },
    /* سيرُ العمل كما وصفه المالك: مسؤولُ المشتريات لا يُغلق الطلب. مرّةً يُغلقه
       المستودعُ بعد التدقيق، ومرّةً يُغلقه حسابُ المسؤول لعلّةٍ تشغيلية — وكلاهما
       كان يسلب الطلبَ وقيمتَه من صاحبه. */
    { id: 'PO-CLOSE-WH', projectId: 'hail', projectName: 'هايل', status: 'closed',
      createdAt: '2026-07-01T06:00:00Z', updatedAt: '2026-07-09T06:00:00Z', actualCost: 800, estCost: 800,
      items: [{ itemName: 'بند أ', qty: 1, unitCost: 800, itemCost: 800, receivedQty: 1 }],
      timeline: [{ code: 'wh_reviewed', at: '2026-07-01T08:00:00Z', by: 'محمد', byUser: 'wh', byRole: 'warehouse_manager' },
                 { code: 'pending_finance', at: '2026-07-02T08:00:00Z', by: 'وائل عبد المجيد' },
                 { code: 'proc_executing', at: '2026-07-03T08:00:00Z', by: 'financial01', byUser: 'fin', byRole: 'finance' },
                 { code: 'closed', at: '2026-07-05T08:00:00Z', by: 'محمد', byUser: 'wh', byRole: 'warehouse_manager' }] },
    { id: 'PO-CLOSE-ADM', projectId: 'hail', projectName: 'هايل', status: 'closed',
      createdAt: '2026-07-01T06:00:00Z', updatedAt: '2026-07-09T06:00:00Z', actualCost: 400, estCost: 400,
      items: [{ itemName: 'بند ب', qty: 1, unitCost: 400, itemCost: 400, receivedQty: 1 }],
      timeline: [{ code: 'wh_reviewed', at: '2026-07-01T08:00:00Z', by: 'محمد', byUser: 'wh', byRole: 'warehouse_manager' },
                 { code: 'pending_finance', at: '2026-07-02T08:00:00Z', by: 'وائل عبد المجيد' },
                 { code: 'proc_executing', at: '2026-07-03T08:00:00Z', by: 'financial01', byUser: 'fin', byRole: 'finance' },
                 { code: 'closed', at: '2026-07-06T08:00:00Z', by: 'مدير النظام', byUser: 'root', byRole: 'admin' }] },
    /* الطلبُ الباقي في لقطة المالك: وائل عمل فيه، لكنّ المالية أخرجته من نافذته
       والمسؤولَ أغلقه — فلم يظهر مالكاً وخرجت قيمةُ شرائه إلى «خارج الجدول». */
    { id: 'PO-TOUCH', projectId: 'hail', projectName: 'هايل', status: 'closed',
      createdAt: '2026-07-01T06:00:00Z', updatedAt: '2026-07-09T06:00:00Z', actualCost: 323.55, estCost: 323.55,
      items: [{ itemName: 'بند ج', qty: 1, unitCost: 323.55, itemCost: 323.55, receivedQty: 1 }],
      timeline: [{ code: 'wh_reviewed', at: '2026-07-01T08:00:00Z', by: 'محمد', byUser: 'wh', byRole: 'warehouse_manager' },
                 { event: 'إضافة مرفق: عرض المورد', at: '2026-07-02T08:00:00Z', by: 'وائل عبد المجيد' },
                 { code: 'pending_finance', at: '2026-07-03T08:00:00Z', by: 'financial01', byUser: 'fin', byRole: 'finance' },
                 { code: 'closed', at: '2026-07-06T08:00:00Z', by: 'مدير النظام', byUser: 'root', byRole: 'admin' }] },
    /* طلبٌ لم يبلغ المشترياتِ أصلاً: رُفض عند مدير المشاريع. فلا نافذةَ له ولا مالكَ،
       ومكانُه بابُ «لم تمرّ بمرحلة مشترياتٍ أصلاً» — ويجب أن يُسمّى برقمه هو أيضاً. */
    { id: 'PO-NOWIN-1', projectId: 'hail', projectName: 'هايل', status: 'rejected',
      createdAt: '2026-07-01T06:00:00Z', updatedAt: '2026-07-01T09:00:00Z', actualCost: 0, estCost: 500,
      items: [{ itemName: 'بند مرفوض', qty: 1, unitCost: 500, itemCost: 500 }],
      timeline: [{ code: 'pending_pm', at: '2026-07-01T06:30:00Z', by: 'مدير المشاريع', byUser: 'pm', byRole: 'project_manager' },
                 { code: 'rejected',   at: '2026-07-01T09:00:00Z', by: 'مدير المشاريع', byUser: 'pm', byRole: 'project_manager' }] },
    leap('PO-LEAP-1', 'boss', 'عبدالله', 'ceo'),      // قفزٌ كان يُنسب للتنفيذيّ
    leap('PO-LEAP-2', 'sup',  'محمد داوود', 'supervisor'),
  ];
  showPage('purchase-kpi');
  await new Promise(r => setTimeout(r, 900));

  // الرقمُ المحسوب — من الدالّة النقيّة نفسِها التي يقرؤها الوجه
  const S = window.purchaseKPI.computeStaffKPIs(purchases);
  // الرقمُ المرسوم — من خلايا الجدول في الـDOM
  const tbl = document.querySelector('#page-purchase-kpi .pkpi-staff-tbl');
  if (!tbl) return { ok: false, err: 'الجدولُ لم يُرسم' };
  // صفوفُ الخلاصة (pkpi-vd-row) ليست صفوفَ بيانات — استُبعدت وإلّا قرأنا خليّةً غيرَ موجودة
  const drawn = [...tbl.querySelectorAll('tbody tr:not(.pkpi-vd-row)')].map(tr => {
    const td = [...tr.children];
    return { name: (td[0].childNodes[0].textContent || '').trim(),
             po: (td[1].querySelector('b') || {}).textContent,
             sub: (td[1].querySelector('.pkpi-sub') || {}).textContent,
             spend: (td[2].querySelector('b') || {}).textContent,
             firstPass: (td[3].querySelector('b') || {}).textContent };
  });
  const hdr = [...tbl.querySelectorAll('thead tr')].pop().children.length;
  const root = document.getElementById('page-purchase-kpi');
  return { ok: true, rows: S.rows.map(r => ({ key: r.key, name: r.name, poN: r.poN, poClosed: r.poClosed,
             spendClosed: r.spendClosed, firstPassRate: r.firstPassRate })), drawn, hdr,
           scopeSpend: S.scopeSpend, inTableSpend: S.inTableSpend, outSpend: S.outSpend,
           moneyLine: !!root.querySelector('.pkpi-recon-money'),
           outsideN: S.outsideN, outsideSpend: S.outsideSpend,
           outsideRoles: S.outsideGroups.map(g => g.role).sort(),
           outsideBanner: !!root.querySelector('.pkpi-staff-admin'),
           poLinks: [...root.querySelectorAll('.pkpi-staff-admin .pkpi-po-link')].map(a => a.textContent.trim()),
           noWinLinks: [...root.querySelectorAll('.pkpi-recon .pkpi-po-link')].map(a => a.textContent.trim()),
           strangersInTable: drawn.filter(d => ['مدير النظام','محمد داوود','عبدالله'].includes(d.name)).map(d => d.name),
           tableRoles: S.rows.map(r => r.role),
           vdRows: root.querySelectorAll('.pkpi-vd-row').length,
           clipped: [...tbl.querySelectorAll('td,th')].filter(c => c.scrollWidth > c.clientWidth + 2).length,
           pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
           guide: !!root.querySelector('.pkpi-guide'),
           groupHdrs: [...root.querySelectorAll('.pkpi-grp th')].map(th => th.textContent.trim().slice(0, 14)),
           canvases: ['pkpi-c-staff-rate','pkpi-c-staff-load']
             .map(id => { const c = document.getElementById(id); return c ? (c.clientWidth > 100 && c.clientHeight > 60) : false; }),
           visible: !!root.classList.contains('active') };
});
check('١٢·٠) صفحةُ المؤشرات فُتحت وقسمُ المسؤولين مرسومٌ فيها',
  staff.ok === true && staff.visible === true, staff.ok ? '' : staff.err);
if (staff.ok) {
  const bySaad = staff.rows.find(r => r.key === 'u:saad');
  const drawnSaad = staff.drawn.find(d => d.name === 'سعد');
  check('١٢أ) ★★ لكلّ مسؤولٍ صفٌّ واحد (لا تكرارَ ولا اندماج)',
    staff.rows.length === 4 && staff.drawn.length === 4 &&
    new Set(staff.drawn.map(d => d.name)).size === 4,
    'محسوب ' + staff.rows.length + ' · مرسوم ' + staff.drawn.length);
  check('١٢ب) ★★★ عددُ الطلبات المرسومُ = المحسوب',
    !!bySaad && !!drawnSaad && Number(drawnSaad.po.replace(/[^\d.]/g, '')) === bySaad.poN,
    'مرسوم ' + (drawnSaad && drawnSaad.po) + ' · محسوب ' + (bySaad && bySaad.poN));
  check('١٢ج) ★★★ «مغلق · مفتوح» المرسومُ = المحسوب (طلبُ الشراء لا البلاغ)',
    !!drawnSaad && /مغلق\s*2/.test(drawnSaad.sub) && /مفتوح\s*0/.test(drawnSaad.sub),
    drawnSaad && drawnSaad.sub);
  check('١٢د) ★★★ قيمةُ مشترياته المرسومةُ = التكلفةُ الفعليةُ للمغلق (3,000.00)',
    !!bySaad && bySaad.spendClosed === 3000 && !!drawnSaad && near(drawnSaad.spend.replace(/,/g, ''), 3000),
    'مرسوم ' + (drawnSaad && drawnSaad.spend) + ' · محسوب ' + (bySaad && bySaad.spendClosed));
  check('١٢هـ) ★★★ «اعتماد من أول مرة» المرسومُ = المحسوب',
    !!bySaad && bySaad.firstPassRate != null && !!drawnSaad &&
    near(parseFloat(drawnSaad.firstPass), bySaad.firstPassRate.toFixed(1)),
    'مرسوم ' + (drawnSaad && drawnSaad.firstPass) + ' · محسوب ' + (bySaad && bySaad.firstPassRate));
  // ══ سؤالُ المالك: «كيف قيمةُ مشترياته مختلفةٌ عن المبالغ المغلقة في اللوحة؟» ══
  check('١٢هـ٢) ★★★ والمالُ يُطابق: قيمةُ الجدول + ما أغلقه غيرُهم = إجماليُّ المغلق',
    Math.abs((staff.inTableSpend + staff.outSpend) - staff.scopeSpend) < 0.01 && staff.moneyLine === true,
    staff.inTableSpend + ' + ' + staff.outSpend + ' = ' + staff.scopeSpend);
  check('١٢و) ★★★ الجدولُ خمسةُ أعمدةٍ بعد حذف السرعة والمقارنة والوفر (طلب المالك)',
    staff.hdr === 5, 'رؤوس=' + staff.hdr);
  // بلاغُ المالك حرفياً: «لماذا تضيف مشرف والمدير التنفيذي في أداء مسؤول المشتريات؟»
  check('١٢ز) ★★★ لا مشرفَ ولا تنفيذيَّ ولا مسؤولَ نظامٍ في جدول أداء المشتريات',
    staff.strangersInTable.length === 0 &&
    staff.tableRoles.every(r => r === 'procurement_officer'),
    'دخلاء: ' + (staff.strangersInTable.join(',') || 'لا شيء') + ' · أدوارُ الجدول: ' + staff.tableRoles.join(','));
  check('١٢ح) ★★★ وثلاثتُهم معلَنون مجمَّعين بأدوارهم فوق الجدول (لا حذفَ صامت)',
    staff.outsideBanner === true && staff.outsideN === 5 && staff.outsideSpend === 2300 &&
    ['admin','ceo','supervisor'].every(r => staff.outsideRoles.includes(r)),
    'n=' + staff.outsideN + ' spend=' + staff.outsideSpend + ' أدوار=' + staff.outsideRoles.join(','));
  check('١٢ح٢) ★★ الخلاصةُ سطرٌ ممتدٌّ تحت كلِّ صفّ (لا عمودٌ ضيّقٌ يُقصّ)',
    staff.vdRows === staff.rows.length && staff.vdRows > 0, 'أسطر=' + staff.vdRows);
  check('١٢ح٤) ★★★ كلُّ صفٍّ في الجدول مسؤولُ مشتريات — لا مشرفَ ولا تنفيذيَّ ولا مسؤولَ نظام',
    staff.tableRoles.every(r => r === 'procurement_officer') && staff.strangersInTable.length === 0,
    'أدوارُ الجدول: ' + staff.tableRoles.join(','));
  // ══ بلاغُ المالك: «أين مسؤولو المشتريات من قياس الأداء؟» — سجلٌّ قديمٌ باسمٍ فقط ══
  // ══ بلاغُ المالك: الإغلاقُ ليس عملَ المشتريات — لا ينزع الطلبَ من صاحبه ══
  const waelRow = staff.rows.find(r => r.name === 'وائل عبد المجيد');
  check('١٢ح٦) ★★★ إغلاقُ غيرِه لا ينزع الطلبَ وقيمتَه منه — ويكفي أن يكون قد لمسه',
    !!waelRow && waelRow.poN === 4 && Math.abs(waelRow.spendClosed - 2423.55) < 0.01,
    'وائل: ' + (waelRow && waelRow.poN) + ' طلب · ' + (waelRow && waelRow.spendClosed) + ' ر.س');
  check('١٢ح٥) ★★★ ومسؤولو المشتريات الحقيقيّون **ظاهرون** ولو كان سجلُّهم باسمِ عرضٍ فقط',
    staff.drawn.some(d => d.name === 'وائل عبد المجيد') &&
    staff.drawn.some(d => d.name === 'عبدالله الشمري'),
    'الظاهرون: ' + staff.drawn.map(d => d.name).join(' · '));
  check('١٢ح٣) ★★★ ولا خليّةَ مقصوصةٍ ولا إفاضةَ صفحةٍ أفقية (تنسيقُ الجدول — بلاغ المالك)',
    staff.clipped === 0 && staff.pageOverflow <= 1,
    'مقصوصة=' + staff.clipped + ' · فيضُ الصفحة=' + staff.pageOverflow + 'px');
  // ══ سؤالُ المالك: «ما هي الـ٣٢٣ ريال؟!» — الرقمُ بلا ملفٍّ لا يُتحقَّق منه ══
  check('١٢ن) ★★★ كلُّ طلبٍ خارجَ الجدول مُسمّىً برقمه رابطاً (لا رقمٌ مجرّد)',
    staff.poLinks.length === staff.outsideN && staff.poLinks.every(t => /^PO-/.test(t)),
    'روابط: ' + staff.poLinks.join(' · '));
  check('١٢س) ★★★ وكذلك ما لم يمرّ بمرحلة مشتريات',
    staff.noWinLinks.length > 0, 'روابط: ' + staff.noWinLinks.join(' · '));
  check('١٢ط) ★★ دليلُ قراءة الجدول مرسومٌ (الجدولُ يشرح نفسَه)', staff.guide === true);
  check('١٢ي) ★★ ورؤوسُ المجموعات تسمّي المحاور الباقية (جودة · التزام)',
    staff.groupHdrs.length === 3 && staff.groupHdrs.some(h => h.includes('جودة')) &&
    staff.groupHdrs.some(h => h.includes('الالتزام')), staff.groupHdrs.join(' | '));
  check('١٢ك) ★★★ المخطّطان الباقيان مرسومان بأبعادٍ حقيقية (سقط مخطّط الأزمنة)',
    staff.canvases.every(Boolean), JSON.stringify(staff.canvases));
}
// ── الصلاحية: مسؤولُ المشتريات يرى صفَّه وحدَه — والحجبُ في الحساب لا في الـDOM ──
const own = await page.evaluate(async () => {
  /* `currentUser` أيضاً `let` في النواة: `isAdmin()` تقرأ المعجميّة لا خاصّيةَ
     `window`. فالتبديلُ يجب أن يكون بالاسم المجرّد وإلّا بقي الفحصُ يدخل أدمن. */
  const bak = currentUser;
  currentUser = { user: 'saad', name: 'سعد', role: 'procurement_officer' };
  window.purchaseKPI.render();
  await new Promise(r => setTimeout(r, 500));
  const tbl = document.querySelector('#page-purchase-kpi .pkpi-staff-tbl');
  const names = tbl ? [...tbl.querySelectorAll('tbody tr:not(.pkpi-vd-row)')].map(tr => (tr.children[0].childNodes[0].textContent || '').trim()) : [];
  const html = document.getElementById('page-purchase-kpi').innerHTML;
  currentUser = bak;
  return { names, leaksNoor: html.includes('نور') };
});
check('١٢ل) ★★★ مسؤولُ المشتريات يرى صفَّه وحدَه',
  own.names.length === 1 && own.names[0] === 'سعد', own.names.join(','));
check('١٢م) ★★★ ولا يتسرّب اسمُ زميله في الـDOM (الحجبُ في الحساب لا في العرض)',
  own.leaksNoor === false);
await page.screenshot({ path: SHOTS + '/po-staff-kpi.png', fullPage: false });

L('\n=== أخطاء الجافاسكربت ═══');
check('✨ لا أخطاء جافاسكربت في الرحلة كلّها', errors.length === 0, errors.slice(0, 3).join(' | '));

L('\n════════════════════════════════════════════════════════════');
L((fail === 0 ? '✅ ' : '❌ ') + pass + '/' + (pass + fail) + ' فحصاً ناجحاً');
L('   اللقطات: ' + SHOTS);
L('════════════════════════════════════════════════════════════\n');

await browser.close();
process.exit(fail === 0 ? 0 : 1);
