#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   hail-tests.js — كل فحوص نظام هيل في ملف واحد

   يستخرج المنطق الحقيقي من index.html بلا تعديل حرف، ويُشغّله.
   لا يقرأ الكود — يُنفّذه. القراءة لا تُثبت شيئاً.

   يعمل من أي مجلد: يبحث عن index.html في مجلده ثم في الأب.

   التشغيل:  node hail-tests.js
   يعمل تلقائياً على GitHub عبر .github/workflows/hail-tests.yml
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs   = require("fs");
const path = require("path");

// ── إيجاد index.html أياً كان موقع هذا الملف ──
const CANDIDATES = [
  path.resolve(__dirname, "index.html"),
  path.resolve(__dirname, "..", "index.html"),
  path.resolve(process.cwd(), "index.html"),
];
const IDX = CANDIDATES.find(p => fs.existsSync(p));
if (!IDX) { console.error("❌ لم يُعثر على index.html في:\n   " + CANDIDATES.join("\n   ")); process.exit(1); }
const HTML = fs.readFileSync(IDX, "utf8");
const KPI_PATH = [path.resolve(path.dirname(IDX), "purchase-kpi.v2.js"), path.resolve(path.dirname(IDX), "purchase-kpi.js")].find(p => fs.existsSync(p));
// v18.9ti: وحدة المؤشرات صارت مدموجةً داخل index.html بين علامتين — تُقرأ منها مباشرةً.
// (احتياطياً: إن وُجد ملفٌ خارجي قديم يُقرأ منه.) فلا يعود يُخدَم ملفٌ منفصلٌ قديماً من الكاش.
const _KPI_A = HTML.indexOf("==PKPI-INLINE-START==");
const _KPI_B = HTML.indexOf("/* ==PKPI-INLINE-END==");
let KPI_SRC = null;
if (_KPI_A >= 0 && _KPI_B > _KPI_A) {
  const _bodyStart = HTML.indexOf("*/", _KPI_A) + 2;   // بعد تعليق علامة البداية
  KPI_SRC = HTML.slice(_bodyStart, _KPI_B).split("<\\/script>").join("</script>").trim();
} else if (KPI_PATH) {
  KPI_SRC = fs.readFileSync(KPI_PATH, "utf8");
}
const SB_PATH  = [path.resolve(path.dirname(IDX), "substitute-budget.js")].find(p => fs.existsSync(p));
const PA_PATH  = [path.resolve(path.dirname(IDX), "price-analysis.js")].find(p => fs.existsSync(p));
const LC_PATH  = [path.resolve(path.dirname(IDX), "labor-catalog.js")].find(p => fs.existsSync(p));
const ST_PATH  = [path.resolve(path.dirname(IDX), "stocktake.js")].find(p => fs.existsSync(p));
const FA_PATH  = [path.resolve(path.dirname(IDX), "finance-audit.js")].find(p => fs.existsSync(p));
const HRP_PATH = [path.resolve(path.dirname(IDX), "hr-payments.js")].find(p => fs.existsSync(p));
const CTR_PATH = [path.resolve(path.dirname(IDX), "contracts.js")].find(p => fs.existsSync(p));

const VER = (HTML.match(/const APP_VERSION = "(v[\d.a-z]+)"/) || [])[1] || "?";

// ══ أدوات ══
let PASS = 0, FAIL = 0;
const FAILURES = [];
/* فحوصٌ مؤجَّلة: أغلبُ الفحوص متزامنة، لكنّ بعضَ الوحدات (توجيهُ إشعارات الخادم) دوالُّ
   async تُنفَّذ فعلاً على محاكٍ. تُسجَّل وعودُها هنا ويُنتظر الجميعُ قبل طباعة الحصيلة —
   فلا يُطبع «نجحت كلها» ونتيجةٌ لم تصل بعد. */
const _deferred = [];
function T(name, ok, detail) {
  if (ok) { PASS++; console.log(`  ✅  ${name}${detail ? "\n         └─ " + detail : ""}`); }
  else    { FAIL++; FAILURES.push(name); console.log(`  ❌  ${name}${detail ? "\n         └─ " + detail : ""}`); }
}
function H(t) { console.log(`\n${"═".repeat(64)}\n  ${t}\n${"═".repeat(64)}`); }

// يقتطع نصاً بين علامتين من index.html
function slice(from, to, after) {
  const a = HTML.indexOf(from, after || 0);
  if (a < 0) return null;
  const b = to ? HTML.indexOf(to, a) : -1;
  return b < 0 ? HTML.slice(a) : HTML.slice(a, b);
}

console.log(`\n📋 فحوص نظام هيل — ${VER}\n   المصدر: ${IDX}`);

/* ════════════════════════════════════════════════════════════════════
   1) توزيع كميات الاستلام — waUpdateRow
      المستودع = المستلم − المباشر، قصر المباشر، إعلان الفجوة
   ════════════════════════════════════════════════════════════════════ */
H("1) توزيع كميات الاستلام");
(function () {
  const a = HTML.indexOf("function waUpdateRow(i, src){");
  if (a < 0) { T("waUpdateRow موجودة", false, "لم تُعثر — هل تغيّر توقيعها؟"); return; }
  const fnSrc = HTML.slice(a, HTML.indexOf("\nfunction ", a + 10));

  const { JSDOM } = require("jsdom");
  const dom = new JSDOM(`<!DOCTYPE html><body>
    <div id="wa-shortage-warn" style="display:none"></div>
    <div id="wa-direct-use-info" style="display:none"></div>
    <div id="wa-gap-warn" style="display:none"><span data-gap-msg></span></div>
    <input class="wa-rcv-qty" data-idx="0" data-req="5" value="5">
    <input class="wa-stock-qty" data-idx="0" value="5">
    <input class="wa-direct-qty" data-idx="0" value="0">
    <input class="wa-unit-price" data-idx="0" value="210">
    <span id="wa-row-total-0"></span><span id="wa-total-qty"></span>
    <span id="wa-total-stock"></span><span id="wa-total-direct"></span><span id="wa-total-cost"></span>
  </body>`, { runScripts: "dangerously" });
  dom.window.eval(fnSrc);
  const doc = dom.window.document, W = dom.window;
  const $ = s => doc.querySelector(s);
  const RCV = '.wa-rcv-qty[data-idx="0"]', STK = '.wa-stock-qty[data-idx="0"]', DIR = '.wa-direct-qty[data-idx="0"]';
  const set = (s, v) => { $(s).value = String(v); };
  const gap = () => $("#wa-gap-warn").style.display !== "none";

  const C = (name, act, eStock, eDir, eGap) => {
    act();
    const ok = $(STK).value === String(eStock) && $(DIR).value === String(eDir) && gap() === !!eGap;
    T(name, ok, `المستلم=${$(RCV).value} المستودع=${$(STK).value} المباشر=${$(DIR).value}` + (gap() ? " ⚠فجوة" : ""));
  };

  C("أدخل المستلم 5 → المستودع 5 تلقائياً", () => { set(RCV, 5); set(STK, 999); W.waUpdateRow(0, "rcv"); }, 5, 0, false);
  C("المستلم 12 → المستودع يتبعه", () => { set(RCV, 12); W.waUpdateRow(0, "rcv"); }, 12, 0, false);
  C("مستلم 12 مباشر 4 → المستودع 8", () => { set(DIR, 4); W.waUpdateRow(0, "direct"); }, 8, 4, false);
  C("المستلم يصير 10 → المستودع 6", () => { set(RCV, 10); W.waUpdateRow(0, "rcv"); }, 6, 4, false);
  C("مباشر 30 من مستلم 10 → يُقصر إلى 10، المستودع 0", () => { set(DIR, 30); W.waUpdateRow(0, "direct"); }, 0, 10, false);
  C("المستلم يُنقص إلى 3 → المباشر يُقصر إلى 3", () => { set(RCV, 3); W.waUpdateRow(0, "rcv"); }, 0, 3, false);
  C("تعديل المستودع يدوياً لا يُدهس",
    () => { set(RCV, 10); set(DIR, 0); W.waUpdateRow(0, "rcv"); set(STK, 10); W.waUpdateRow(0, "stock"); }, 10, 0, false);
  C("★ الفجوة تُعلَن (مستلم 10، مباشر 3، مستودع 5)",
    () => { set(RCV, 10); set(DIR, 3); W.waUpdateRow(0, "direct"); set(STK, 5); W.waUpdateRow(0, "stock"); }, 5, 3, true);
  C("سدّ الفجوة → التحذير يختفي", () => { set(STK, 7); W.waUpdateRow(0, "stock"); }, 7, 3, false);
  C("مسح المستلم لا يمحو المباشر ولا يُنذر", () => { set(RCV, ""); W.waUpdateRow(0, "rcv"); }, 7, 3, false);
  C("كسور: 7.5 − 2.25 = 5.25", () => { set(RCV, 7.5); set(DIR, 2.25); W.waUpdateRow(0, "direct"); }, 5.25, 2.25, false);
})();

/* ════════════════════════════════════════════════════════════════════
   2) عكس المخزون عند حذف الطلب — الإشارة والتجميع
   ════════════════════════════════════════════════════════════════════ */
H("2) عكس المخزون عند حذف الطلب");
(function () {
  const a = HTML.indexOf("        const _rev = new Map();");
  const b = HTML.indexOf("        const _entries = [..._rev.entries()]", a);
  if (a < 0 || b < 0) { T("منطق التجميع موجود", false, "لم يُعثر"); return; }
  const core = HTML.slice(a, HTML.indexOf("\n", b));

  const rev = po => {
    const _r3 = n => Math.round(n * 1000) / 1000;
    return new Function("po", "_r3", core + "\n return _entries;")(po, _r3);
  };
  const C = (name, po, expect) => {
    let got;
    try { got = rev(po).map(([id, e]) => [id, e.delta]); } catch (e) { T(name, false, "خطأ: " + e.message); return; }
    const n = o => JSON.stringify(o.slice().sort());
    T(name, n(got) === n(expect), "الصافي: " + JSON.stringify(got) + (n(got) === n(expect) ? "" : " ← المتوقع " + JSON.stringify(expect)));
  };

  C("★ استلام 8 للمستودع → الحذف يسحب −8",
    { auditItems: [{ itemId: "s", stockQty: 8, directQty: 2 }], items: [{ itemId: "s", qty: 10 }] }, [["s", -8]]);
  C("استخدام مباشر بحت → لا عكس",
    { auditItems: [{ itemId: "k", stockQty: 0, directQty: 7 }], items: [{ itemId: "k", qty: 7 }] }, []);
  C("سحب 3 بمراجعة المخزون → +3",
    { auditItems: [], items: [{ itemId: "d", _fromStock: 3, qty: 3 }] }, [["d", 3]]);
  C("★ صنف في المسارين (سُحب 3، استُلم 5) → صافٍ −2 لا كتابتان",
    { auditItems: [{ itemId: "x", stockQty: 5 }], items: [{ itemId: "x", _fromStock: 3, qty: 8 }] }, [["x", -2]]);
  C("سُحب 5 واستُلم 5 → صفر → لا كتابة",
    { auditItems: [{ itemId: "y", stockQty: 5 }], items: [{ itemId: "y", _fromStock: 5, qty: 5 }] }, []);
  C("سطرا استلام لنفس الصنف (4+6) → −10",
    { auditItems: [{ itemId: "z", stockQty: 4 }, { itemId: "z", stockQty: 6 }], items: [{ itemId: "z", qty: 10 }] }, [["z", -10]]);
  C("ثلاثة أصناف مختلطة",
    { auditItems: [{ itemId: "a", stockQty: 2 }, { itemId: "b", stockQty: 9 }],
      items: [{ itemId: "a", _fromStock: 1 }, { itemId: "c", _fromStock: 4 }] }, [["a", -1], ["b", -9], ["c", 4]]);
  C("بند بلا itemId يُتجاهل", { auditItems: [{ itemId: "", stockQty: 5 }], items: [] }, []);
  C("طلب قديم بلا حقول → لا انهيار", {}, []);
  C("كسور: استُلم 2.5 وسُحب 0.25 → −2.25",
    { auditItems: [{ itemId: "f", stockQty: 2.5 }], items: [{ itemId: "f", _fromStock: 0.25 }] }, [["f", -2.25]]);
})();

/* ════════════════════════════════════════════════════════════════════
   3) إشارة سجل الحركات — تُقرأ من adjustDelta لا من النوع
   ════════════════════════════════════════════════════════════════════ */
H("3) إشارة سجل الحركات");
(function () {
  const a = HTML.indexOf('    const isOut = (l.type==="out"||l.type==="direct_use");');
  const b = HTML.indexOf('const color = isTransfer ? "color:#6d28d9" : (_isNeg ?', a);
  if (a < 0 || b < 0) { T("منطق الإشارة موجود", false, "لم يُعثر"); return; }
  const core = HTML.slice(a, HTML.indexOf("\n", b));
  const render = new Function("l", core + '\n return sign + _qtyShown.toLocaleString("en-US",{maximumFractionDigits:3});');
  const C = (name, l, exp) => {
    let g; try { g = render(l); } catch (e) { g = "خطأ: " + e.message; }
    T(name, g === exp, g + (g === exp ? "" : " ← المتوقع " + exp));
  };

  C("وارد (شراء) 8", { type: "in", qty: 8 }, "+8");
  C("إدخال يدوي 4", { type: "manual_in", qty: 4 }, "+4");
  C("صرف 3", { type: "out", qty: 3 }, "−3");
  C("استخدام مباشر 2", { type: "direct_use", qty: 2 }, "−2");
  C("مناقلة 6", { type: "transfer", qty: 6 }, "⇄ 6");
  C("★ عكس حذف طلب −5", { type: "adjust", qty: 5, adjustDelta: -5 }, "−5");
  C("★ تسوية يدوية بالسحب −7", { type: "adjust", qty: 7, adjustDelta: -7 }, "−7");
  C("★ تصفير يدوي (qty:0، delta:−12)", { type: "adjust", qty: 0, adjustDelta: -12 }, "−12");
  C("تسوية موجبة +3", { type: "adjust", qty: 3, adjustDelta: 3 }, "+3");
  C("سجل قديم بلا adjustDelta → موجب كما كان", { type: "adjust", qty: 9 }, "+9");
  C("adjustDelta فاسد → يرجع لـ qty", { type: "adjust", qty: 9, adjustDelta: "س" }, "+9");
  C("تسوية كسرية −2.25", { type: "adjust", qty: 2.25, adjustDelta: -2.25 }, "−2.25");
})();

/* ════════════════════════════════════════════════════════════════════
   4) حارس النقر المزدوج + تعديل الرصيد الطازج
   ════════════════════════════════════════════════════════════════════ */
H("4) حارس النقر المزدوج وتعديل الرصيد");
const step4 = (async function () {
  const a = HTML.indexOf("function showCustomModal({title,body,okText,onOk}){");
  if (a < 0) { T("showCustomModal موجودة", false, "لم تُعثر"); return; }
  const src = HTML.slice(a, HTML.indexOf("\nfunction ", a + 10));

  const { JSDOM } = require("jsdom");
  const dom = new JSDOM("<!DOCTYPE html><body></body>", { runScripts: "dangerously" });
  const W = dom.window;
  W.eval("function toast(){}");
  W.eval(src);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let runs = 0;
  W.showCustomModal({ title: "t", body: "<div></div>", okText: "💾 حفظ التعديل",
    onOk: async () => { runs++; await sleep(120); return true; } });
  const btn = W.document.getElementById("_dyn-inv-ok");
  btn.onclick();
  const dis = btn.disabled, lbl = btn.textContent;
  btn.onclick(); btn.onclick(); btn.onclick();
  await sleep(300);
  T("★ أربع نقرات → onOk تعمل مرة واحدة", runs === 1, "التنفيذات: " + runs + "  (قبل الإصلاح: 4)");
  T("الزر يُعطَّل أثناء الانتظار", dis === true);
  T("الزر يُظهر أنه يعمل", lbl.includes("جارٍ"), '"' + lbl + '"');

  let n2 = 0;
  W.showCustomModal({ title: "b", body: "<div></div>", okText: "💾 حفظ",
    onOk: async () => { n2++; await sleep(40); return false; } });
  const b2 = W.document.getElementById("_dyn-inv-ok");
  b2.onclick(); await sleep(140);
  T("بعد فشل التحقق: الزر يعود قابلاً للنقر", b2.disabled === false && b2.textContent === "💾 حفظ");
  b2.onclick(); await sleep(140);
  T("ويمكن إعادة المحاولة", n2 === 2, "التنفيذات: " + n2);

  W.showCustomModal({ title: "c", body: "<div></div>", okText: "💾 حفظ",
    onOk: async () => { throw new Error("انقطع الاتصال"); } });
  const b3 = W.document.getElementById("_dyn-inv-ok");
  b3.onclick(); await sleep(70);
  T("خطأ داخل onOk → الزر لا يتجمّد", b3.disabled === false);

  // ── حساب الرصيد الطازج ──
  const c = HTML.indexOf("        const _res = await db.runTransaction(async tx=>{");
  const d = HTML.indexOf("          return { newQty:nq, delta:dl, liveQty };", c);
  if (c < 0 || d < 0) { T("منطق تعديل الرصيد موجود", false, "لم يُعثر"); return; }
  const body = HTML.slice(HTML.indexOf("const snap = await tx.get(invRef);", c), d)
    .replace("const snap = await tx.get(invRef);", "")
    .replace("const liveQty = snap.exists ? (parseFloat(snap.data().currentQty)||0) : 0;", "")
    .replace(/tx\.set\([\s\S]*?\}\);/g, "");
  const calc = (type, qty, liveQty) =>
    new Function("type", "qty", "liveQty", "_r3", body + "\n return {nq, dl};")
      (type, qty, liveQty, n => Math.round(n * 1000) / 1000);

  let r = calc("add", 10, 150);
  T("★ إضافة 10 والشاشة تعرض 100 بينما الحقيقة 150 → 160", r.nq === 160 && r.dl === 10,
    `الرصيد=${r.nq} المسجَّل=${r.dl}  (قبل الإصلاح: 110 — تتبخّر 40)`);
  r = calc("set", 200, 150);
  T("★ تحديد 200 والحقيقة 150 → السجل +50 لا +100", r.nq === 200 && r.dl === 50, `الرصيد=${r.nq} المسجَّل=${r.dl}`);
  r = calc("subtract", 30, 150);
  T("سحب 30 من 150 → 120 والسجل −30", r.nq === 120 && r.dl === -30);
  r = calc("subtract", 999, 150);
  T("سحب أكثر من الرصيد → يُقصر على 0 والسجل −150", r.nq === 0 && r.dl === -150);
  r = calc("add", 2.25, 7.5);
  T("كسور: 7.5 + 2.25 = 9.75", r.nq === 9.75);

  let inv = true, bad = null, n = 0;
  for (const t of ["set", "add", "subtract"])
    for (let live = 0; live <= 40; live += 7)
      for (let q = 0; q <= 40; q += 3) {
        n++;
        const x = calc(t, q, live);
        if (Math.abs((x.nq - live) - x.dl) > 0.0001) { inv = false; bad = [t, q, live, x]; }
      }
  T("★ ثابت: (الجديد − الحي) = adjustDelta في كل حالة", inv,
    inv ? n + " تركيبة — كلها متسقة" : "انكسر عند " + JSON.stringify(bad));
})();

/* ════════════════════════════════════════════════════════════════════
   5) حراسة ما أُصلح — ألا تعود الأخطاء
   ════════════════════════════════════════════════════════════════════ */
function guards() {
  H("5) حراسة الإصلاحات السابقة");
  const G = [
    ["عكس الاستلام سالب لا موجب", "e.delta = _r3(e.delta - q);", true],
    ["زالت الإشارة الموجبة الخاطئة", "adjustDelta: +stockQty", false],
    ["زال التحديث المحلي الخاطئ", "currentQty: prev+stockQty", false],
    ["العكس في Transaction مُنتظَرة", "const _applied = await db.runTransaction(async tx=>{", true],
    ["الرصيد يُقرأ طازجاً في تعديل الرصيد", "const liveQty = snap.exists ? (parseFloat(snap.data().currentQty)||0) : 0;", true],
    ["زال الرقم المجمّد من حساب الرصيد", "else if(type===\"add\"){ newQty=currentQty+qty; delta=qty; }", false],
    ["حارس النقر المزدوج قائم", "if(_okBusy) return;", true],
    ["إشارة السجل من adjustDelta", "const _qtyShown = _hasAdjD ? Math.abs(_adjD)", true],
    ["زال باب الاستلام الثاني", 'id="pu-receipt-section"', false],
    ["زال الكاتب التراكمي لـ receivedQty", "p.receivedQty = (p.receivedQty||0) + receivedQty", false],
    ["كاتب واحد لـ receivedQty (من حالة البنود لا جمع السندات)", 'receivedQty  = poReceivedQty(pCurrent)', true],
    ["زال جمع السندات المتضخّم لـ receivedQty", 'receivedQty    = _waSumGrn(pCurrent, "totalRcv")', false],
    ["التكلفة الفعلية من حالة البنود لا جمع السندات", 'actualCost   = poActualCost(pCurrent)', true],
    ["زال جمع السندات المتضخّم لـ actualCost", 'actualCost     = _waSumGrn(pCurrent, "invoicedTotal")', false],
    ["__WAREHOUSE_AUDIT__ له معالج", 'if(newStatus === "__WAREHOUSE_AUDIT__"){', true],
    ["تجاوز الأدمن مُسمّى بصراحة", 'l:"🔒 مغلق — تجاوز يدوي بلا سند استلام"', true],
    ["زال تلفيق رقم سند الاستلام", 'if(!db) return "GRN-"+yr+"-"+String(Date.now()).slice(-6)', false],
    ["حارس !db في savePurchase", "لم يُحفظ طلب الشراء", true],
    ["رصيد المخزون يأخذ خانة المستودع وحدها", "const add = parseFloat(it.stockQty)||0;", true],
    ["purchase-kpi داخل خريطة الصلاحيات", '"purchase-reports","purchase-kpi"', true],
    // v18.9rv — عكس المخزون عند الحذف من كل السندات لا من آخر جلسة تدقيق
    ["عكس الحذف يجمع من grnDocs (كل السندات)", "const _stockInRows = (Array.isArray(po.grnDocs) && po.grnDocs.length)", true],
    ["عكس الحذف لا يعتمد auditItems وحدها", "(po.auditItems||[]).forEach(it=>{\n          const q = parseFloat(it.stockQty||0);", false],
    // v18.9rv — حفظ الطلب بعد كتابة المخزون يُنتظَر ويُتحقَّق (لا fire-and-forget)
    ["حفظ الطلب بعد التدقيق مُنتظَر ومُتحقَّق", "await db.collection(PURCHASES_COLLECTION()).doc(poId).set(pCurrent,{merge:true}); _poPersisted = true;", true],
    ["رسائل نجاح التدقيق تُؤجَّل حتى الحفظ", "let _afterSaveOK = ()=>{};", true],
    ["تحذير صريح عند فشل حفظ الطلب بعد كتابة المخزون", "احتُسب المخزون مرتين", true],
    // v18.9ry — الإغلاق اليدوي يتطلّب تكلفة فعلية صريحة > 0 (لا يتسرّب التقدير كأنه فعلي)
    ["الإغلاق اليدوي يمنع تكلفة فعلية ≤ صفر", "if(!(_acVal > 0)){", true],
    ["تأكيد الإغلاق اليدوي يُظهر الرقم المُسجَّل كتكلفة فعلية", "كتكلفة فعلية — تأكّد أنه مبلغ فاتورة المورد الحقيقي لا التقدير", true],
    ["التكلفة الفعلية تُحفظ عند الإغلاق", "if(actualCost) p.actualCost=actualCost;", true],
  ];
  G.forEach(([n, needle, want]) => T(n, HTML.includes(needle) === want, want ? "" : "يجب ألا يعود"));

  // عدد كُتّاب receivedQty — بابان يعنيان عودة الخلل
  const w = (HTML.match(/\breceivedQty\s*=(?!=)/g) || []).length;
  T("★ receivedQty له كاتب واحد لا أكثر", w === 1, "عدد الكُتّاب: " + w + " (بابان = عودة الـ 15 من 10)");
}

/* ════════════════════════════════════════════════════════════════════
   6) قائمة ما قبل التسليم
   ════════════════════════════════════════════════════════════════════ */
function predelivery() {
  H("6) قائمة ما قبل التسليم");
  // توازن <div>
  const o = (HTML.match(/<div\b/gi) || []).length, c = (HTML.match(/<\/div\s*>/gi) || []).length;
  T("توازن <div>", o === c, `فتح=${o} إغلاق=${c} الفرق=${o - c}`);

  // الإصدار في موضعين
  const f = (HTML.match(/id="login-version-footer">نظام صيانة المباني — (v[\d.a-z]+)</) || [])[1];
  T("الإصدار متطابق في الموضعين", f === VER, `footer=${f}  APP_VERSION=${VER}`);

  // cache-busters — كل وحدة محلية (.js نسبية) يجب أن تحمل ?v= مطابقاً للإصدار.
  // لا نثبّت العدد (كان 4 ثم أُضيفت وحدة خامسة فسقط الاختبار): نتحقّق أن كل وحدة محلية
  // موسومة، وأن كل الوسوم تطابق APP_VERSION — فلا يعود يسقط عند إضافة/حذف وحدة.
  const cb = [...HTML.matchAll(/<script src="([^"]+\.js)\?v=([^"]+)"><\/script>/g)].map(m => [m[1], m[2]]);
  const localMods = [...HTML.matchAll(/<script src="(?!https?:)([^"]+\.js)(?:\?v=[^"]*)?"><\/script>/g)].length;
  const want = VER.replace(/^v/, "");
  T("cache-busters تطابق الإصدار",
    cb.length >= 1 && cb.length === localMods && cb.every(([, v]) => v === want),
    `${cb.length}/${localMods} موسومة — ` + (cb.map(([f2, v]) => `${f2}?v=${v}`).join("، ") || "لا وسوم"));

  // ── v18.9wk: NOTES.md يُحدَّث مع كل تغيير — حارسٌ يمنع النسيان ──
  // القاعدة (CLAUDE.md): كل رفعِ إصدارٍ يرافقه قيدٌ في «سجل أهم التعديلات» (§6).
  // الحارس يطابق قيدَ الإصدار الحالي حرفياً — فيسقط الفحص إن دُفع تعديلٌ بلا توثيق.
  const NOTES_PATH = path.resolve(path.dirname(IDX), "NOTES.md");
  const NOTES = fs.existsSync(NOTES_PATH) ? fs.readFileSync(NOTES_PATH, "utf8") : "";
  T("★ wk: NOTES.md موجود ويحوي سجل التعديلات", NOTES.includes("## 6) سجل موجز بأهم التعديلات"));
  T("★ wk: قيدُ الإصدار الحالي موثَّق في NOTES.md (حدّث NOTES مع كل تغيير)",
    NOTES.includes("**" + VER + " —"), "لا قيد لـ " + VER + " في §6 — أضف سطر التغيير قبل الدفع");

  // ── v18.9ww: تجاوب الجوال — حارسان لعطلين رُصدا بفحص Playwright عند 375px ──
  // كلاهما انحرافٌ عن نمطٍ يطبّقه الملف نفسه في موضعٍ مجاور، فالارتداد وارد.
  {
    // (١) جدول سجل التدقيق كان بلا حاوي تمرير — يدفع الصفحة كلّها للتمرير الأفقي 80px.
    // الصنف .report-table-wrap كان معرَّفاً في CSS وغيرَ مستعمَل إطلاقاً (نمطٌ نُوي ولم يُطبَّق).
    const wrapDefined = /\.report-table-wrap\{[^}]*overflow-x:\s*auto/.test(HTML);
    const wrapUsed = (HTML.match(/class="report-table-wrap"/g) || []).length;
    T("★ ww: .report-table-wrap معرَّفة بتمرير أفقي في CSS", wrapDefined);
    T("★ ww: جدول سجل التدقيق ملفوفٌ بحاوي التمرير (لا تمرير أفقي للصفحة على الجوال)",
      wrapDefined && wrapUsed >= 1 && /out\.innerHTML=`<div class="report-table-wrap"><table class="report-table">/.test(HTML),
      `مواضع الاستعمال: ${wrapUsed}`);

    // (٢) شبكات .ast-stats بأعمدة ثابتة inline تتخطّى media query الجوال
    // (@media(max-width:760px) → 1fr 1fr) لأن الأنماط السطرية أعلى أولوية — فتفيض عن الشاشة.
    const fixedGrids = [...HTML.matchAll(/class="ast-stats"[^>]*style="[^"]*grid-template-columns:\s*repeat\((\d+),\s*1fr\)/g)].map(m => m[1]);
    T("★ ww: لا شبكة ast-stats بعدد أعمدة ثابت في نمطٍ سطريّ (auto-fit فقط)",
      fixedGrids.length === 0,
      fixedGrids.length ? `وُجدت repeat(${fixedGrids.join("،")},1fr) — استخدم repeat(auto-fit,minmax(150px,1fr))` : "نظيف");
  }

  // ── v18.9vp: وسوم Firebase SDK الخمسة موحّدة على نسخة واحدة (المعالجة الجذرية لـ ca9/b815) ──
  // ترقية مجزّأة (وسمٌ متأخّرٌ عن البقية) تُدخل النظام في حالة غير مُختبَرة — نُثبّت التوحيد.
  {
    const fb = [...HTML.matchAll(/gstatic\.com\/firebasejs\/([0-9]+\.[0-9]+\.[0-9]+)\/firebase-[a-z-]+-compat\.js/g)].map(m => m[1]);
    const uniq = [...new Set(fb)];
    T("★ vp: وسوم Firebase SDK الخمسة على نسخة واحدة موحّدة",
      fb.length === 5 && uniq.length === 1, `النسخ: ${uniq.join("، ")} (عدد الوسوم ${fb.length})`);
    T("★ vp: Firebase SDK مُرقّى إلى 12.17.0 (بعيداً عن 12.15.0 المطروح عليها الخلل)",
      uniq.length === 1 && uniq[0] === "12.17.0", `النسخة الحالية: ${uniq[0] || "?"}`);
  }

  // ── v18.9vq: وضع التشخيص الآمن (?diag=1) مُسوَّرٌ ولا يمسّ المستخدم العادي ──
  T("★ vq: DIAG_MODE يُشتقّ من علامة الرابط diag فقط", HTML.includes("/[?&]diag=[12]/.test(location.search"));
  T("★ vq: _diagMark يعود فوراً بلا وضع التشخيص (صفر أثر على العادي)",
    /function _diagMark\(stage\)\{\s*if\(!DIAG_MODE\) return;/.test(HTML));
  T("★ vq: _diagMark يحفظ المراحل في localStorage (تبقى بعد الانهيار)",
    HTML.includes('localStorage.setItem("hail_diag_log"'));
  T("★ vq: renderDashboard يتخطّى العرض الثقيل في وضع التشخيص فقط",
    HTML.includes('_diagMark("renderDashboard:start")') && HTML.includes('_diagMark("renderDashboard:SKIPPED (diag=1)")'));
  // ── v18.9vr: diag=2 يُشغّل الجسم مع علاماتٍ دقيقة (تحديد الجزء المنهار) ──
  T("★ vr: DIAG_TRACE يُشتقّ من ?diag=2 وDIAG_MODE يشمل diag=[12]",
    HTML.includes("/[?&]diag=2/.test(location.search") && HTML.includes("/[?&]diag=[12]/.test(location.search"));
  T("★ vr: التخطّي الكامل مقصورٌ على diag=1 (diag=2 يُشغّل الجسم)",
    HTML.includes("if(DIAG_MODE && !DIAG_TRACE){"));
  T("★ vr: علاماتٌ دقيقة حول الجزأين المشتبه بهما (KPI + ملخّص المشتريات)",
    HTML.includes('_diagMark("dash:renderKPIData:before")') &&
    HTML.includes('_diagMark("dash:renderDashboardPurchaseSummary:before")') &&
    HTML.includes('_diagMark("dash:end'));
  // ── v18.9vs: كاشف انهيار لوحة المعلومات الذاتي (سنتينل قبل/بعد العرض) ──
  T("★ vs: السنتينل يُرفع قبل العرض ويُخفض بعد اكتماله (لكل مشروع)",
    HTML.includes('var _dashSentinelKey="hail_dash_render:"') &&
    HTML.includes('localStorage.setItem(_dashSentinelKey,"1")') &&
    HTML.includes("localStorage.removeItem(_dashSentinelKey); }catch(e){}\n}"));
  T("★ vs: بقاء السنتينل مرفوعاً ⇒ تخطٍّ تلقائيّ للوحة ذلك المشروع",
    /if\(!_dashForce && localStorage\.getItem\(_dashSentinelKey\)==="1"\)\{/.test(HTML));
  T("★ vs: زرُّ المحاولة اليدوية يتجاوز التخطّي مرّةً واحدة (hail_dash_force)",
    HTML.includes("hail_dash_force") && HTML.includes('sessionStorage.removeItem("hail_dash_force")'));

  // ── v18.9vt: السبب الجذريّ — دوالّ ساعات العمل بلا مُعدِّلات Date (ولا حلقة لا نهائية) ──
  // `setHours/setDate` تفشل إن كان Date العام ملفوفاً في بيئة المستخدم (إضافات المتصفّح)،
  // وتقدّمُ الحلقة كان يعتمد على setDate — فتصير لا نهائيةً وتُسقط المتصفّح.
  {
    const cut = (name) => {
      const i = HTML.indexOf("function " + name + "(");
      return i < 0 ? "" : HTML.slice(i, HTML.indexOf("\nfunction ", i + 10));
    };
    const wmb = cut("workingMinutesBetween"), awm = cut("addWorkingMinutes");
    T("★ vt: workingMinutesBetween بلا أي مُعدِّل Date (setHours/setDate)",
      !!wmb && !/\.setHours\(|\.setDate\(/.test(wmb));
    T("★ vt: addWorkingMinutes بلا أي مُعدِّل Date (setHours/setDate)",
      !!awm && !/\.setHours\(|\.setDate\(/.test(awm));
    T("★ vt: حارسٌ صلبٌ يمنع الحلقة اللانهائية في workingMinutesBetween",
      /guard\+\+\s*<\s*\d+/.test(wmb));
    T("★ vt: التقدّم يوماً بيوم ببناء تاريخٍ جديد لا بتعديل القائم",
      wmb.includes("cur=new Date(cur.getFullYear(),cur.getMonth(),cur.getDate()+1)"));
    T("★ vt: حمايةٌ من التواريخ غير الصالحة (isFinite على الطوابع)",
      wmb.includes("!isFinite(fromMs)||!isFinite(toMs)") && awm.includes("!isFinite(startMs)"));
  }
  T("★ vq: مسار الدخول مُجهّز بعلامات المراحل (loadData/enterApp/renderCurrentPage)",
    HTML.includes('_diagMark("loadData:start")') && HTML.includes('_diagMark("enterApp:start")') &&
    HTML.includes('_diagMark("renderCurrentPage:"+pid)'));

  // ══ ★ v18.9vh: «عدم تحميل البيانات مباشرة» — إعادة رسم الصفحة بعد تحميل الإعدادات ══
  // loadSettings (المباني/المشرفون) غيرُ متزامنة وتُطلَق بلا انتظار؛ صفحتا «خريطة المباني»
  // و«لوحة الإدارة» تُرسَمان فارغتين إن سبقتاها. الإصلاح: بعد repopulateAllSelects تُعاد
  // رسمُ الصفحة النشطة إن كانت منهما، وrenderCurrentPage صار يشمل لوحة الإدارة.
  T("★ renderCurrentPage يشمل لوحة الإدارة (admin-panel)",
    /pid==="admin-panel"\)\s*\{\s*if\(typeof renderAdminPanel==="function"\) renderAdminPanel\(\)/.test(HTML));
  T("★ loadSettings يُعيد رسمَ الصفحة النشطة المعتمِدة على المباني بعد التحميل",
    /_pid==="buildings" \|\| _pid==="admin-panel"\) renderCurrentPage\(\)/.test(HTML) &&
    /function loadSettings\(\)\{[\s\S]*?repopulateAllSelects\(\);[\s\S]*?renderCurrentPage\(\)/.test(HTML));

  // صياغة JS لكل كتلة script داخلية
  const vm = require("vm");
  let bad = 0, n = 0;
  for (const m of HTML.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/src=/.test(m[1])) continue;
    n++;
    try { new vm.Script(m[2]); } catch (e) { bad++; console.log("      خطأ صياغة: " + String(e.message).slice(0, 120)); }
  }
  T(`صياغة كل كتل script الداخلية (${n})`, bad === 0, bad ? bad + " كتلة معطوبة" : "");
}

/* ════════════════════════════════════════════════════════════════════
   7) وحدة مؤشرات الأداء — حيّة تركّب نفسها؟
   ════════════════════════════════════════════════════════════════════ */
function kpi() {
  H("7) وحدة مؤشرات الأداء (purchase-kpi.js)");
  if (!KPI_SRC) { console.log("  ⏭  كود purchase-kpi غير موجود — تُخطّى"); return; }
  T("★ وحدة المؤشرات مدموجة داخل index.html (تصل المتصفّح مع المستند الطازج)",
    HTML.includes("==PKPI-INLINE-START==") && HTML.includes("==PKPI-INLINE-END=="));
  const src = KPI_SRC;
  const vm = require("vm");
  try { new vm.Script(src); T("صياغة purchase-kpi.js سليمة", true); }
  catch (e) { T("صياغة purchase-kpi.js سليمة", false, String(e.message).slice(0, 120)); }
  T("يركّب صفحته ذاتياً", src.includes("function ensurePage()") && src.includes('div.className="page"'));
  T("يحقن زر القائمة الجانبية", src.includes("function injectSidebarButton()") && src.includes('getElementById("grp-po")'));
  T("يلفّ showPage", src.includes("function hookShowPage()") && src.includes("window.showPage = function(id)"));
  T("نقاط ارتساؤه موجودة في index.html",
    HTML.includes('id="grp-po"') && HTML.includes('data-page="purchase-reports"') && HTML.includes("function showPage(id){"));
  // v18.9tv: كل مخطّط يجب أن يستدعي base() لا يمرّر مرجع الدالة base — تمريرها بلا أقواس
  // يجعل Chart.js يتجاهل الخيارات ويعود لـ maintainAspectRatio:true (نسبة 2:1) فلا يملأ
  // الرسم البطاقة (كان مخطّط الإنفاق الشهري منكمشاً بفراغٍ كبير على الآيباد).
  T("★ مخطّطات المؤشرات تستدعي base() لا تمرّر الدالة base (وإلا لا يملأ الرسم البطاقة)",
    !/options:\s*base(?!\()/.test(src), (src.match(/options:\s*base(?!\()[^\n]*/) || [""])[0].slice(0, 60));

  // ══ v18.9tg: بصمة build في الوحدة + كاشف الوحدات القديمة في index.html ══
  // الجذر الذي يعالجه: index.html يصل طازجاً بينما purchase-kpi.js قد يُخدَم قديماً
  // (كاش يتجاهل ?v= أو نشر لم يرفع الوحدة) — فيبقى «مخطّط الموردين» فارغاً بلا سبب ظاهر.
  T("★ purchase-kpi.js يخبز بصمة build في مصدره", /const MODULE_BUILD = "(v[\d.a-z]+)"/.test(src));
  const mb = (src.match(/const MODULE_BUILD = "(v[\d.a-z]+)"/) || [])[1];
  T("★ بصمة build تطابق APP_VERSION (تُبطل عند نسيان رفعها)", mb === VER, `build=${mb}  APP_VERSION=${VER}`);
  T("الوحدة تُصدّر build على واجهتها العامة", /window\.purchaseKPI = \{[\s\S]*?build: MODULE_BUILD/.test(src));
  // الكاشف في index.html (المستند الطازج) يقارن build بـ APP_VERSION
  T("★ index.html يحوي كاشف الوحدات القديمة", HTML.includes("hail-stale-banner") && HTML.includes("s.build!==APP_VERSION"));
  T("الكاشف يفحص وحدة المؤشرات عبر window.purchaseKPI",
    /name:"purchase-kpi\.v2\.js", get:function\(\)\{ return window\.purchaseKPI; \}/.test(HTML));
  T("★ الشفاء الذاتي يُلغي Service Worker ويمسح Cache Storage قبل إعادة التحميل",
    HTML.includes("navigator.serviceWorker.getRegistrations()") && HTML.includes("r.unregister()") &&
    HTML.includes("caches.keys()") && HTML.includes("caches.delete(k)") && HTML.includes("location.reload(true)"));
  T("★ حارس sessionStorage يمنع حلقة إعادة التحميل (مرّة لكل إصدار)",
    HTML.includes('KEY="hailStaleReload:"+APP_VERSION') && HTML.includes('sessionStorage.setItem(KEY,"1")') &&
    HTML.includes("canGuard && !already"));
  T("عند تعذّر sessionStorage لا إعادة تحميل تلقائية (شريط فقط — لا حلقة)",
    HTML.includes("canGuard=false") && HTML.includes("if(document.body) banner()"));

  // v18.9tj: base دالةٌ تُنشئ options طازجاً لكل مخطّط — وإلا تقاسمت المخطّطات مرجع
  // scales واحداً تلوّثه Chart.js (type:category/linear)، فيرث مخطّط الموردين (indexAxis:y)
  // مقاييسَ عموديةً فيُرسَم فارغاً رأسياً رغم بياناته. حارسٌ يمنع عودة الكائن المشترك:
  T("★ base في drawCharts دالةٌ تُنتج كائناً طازجاً لكل مخطّط (لا تلوّث scales)",
    /const base\s*=\s*\(\)\s*=>\s*\(\{/.test(src));
  T("★ كل مخطّط يستدعي base() لا يتقاسم المرجع (لا يبقى ...base, نصّاً)",
    src.includes("...base()") && !/\.\.\.base,/.test(src));
  // v18.9tw: على iPad Safari قد يقيس Chart.js عرض الحاوية خطأً وقت الإنشاء (أثناء انتقال
  // الصفحة/طيّ القائمة) فيثبّت الرسم أضيق من البطاقة منزاحاً لجانبها، وResizeObserver لا
  // يصحّحه دائماً — فيُجبَر resize() بعد استقرار التخطيط. حارسٌ يمنع حذف الملاءمة:
  T("★ render يُجبِر ملاءمة المخطّطات بعد الرسم (_fitCharts) — يملأ البطاقة على الآيباد",
    /drawCharts\(K\);\s*_fitCharts\(\)/.test(src));
  T("★ _fitCharts يستدعي resize() بعد استقرار التخطيط (إطار + مهلة)",
    /function _fitCharts\(\)/.test(src) && /\.resize\(\)/.test(src) &&
    src.includes("requestAnimationFrame") && /setTimeout\(doResize/.test(src));
  // v18.9tx: العلّة الحقيقية لـ«المخطّط في جانب البطاقة» — تخطيط المخطّطات لا قياس العرض.
  // المخطّط الدائري: المفتاح أسفله لا يمينه/يساره (legend:left كان يحجز نصف العرض فتنكمش الحلقة):
  T("★ مخطّط الحالة الدائري: المفتاح أسفله (position:bottom) لا على جانبه — تملأ الحلقة البطاقة",
    /position:"bottom"/.test(src) && !/position:"left"/.test(src));
  // المخطّطات الأفقية (indexAxis:y) تقصّ أسماء الفئات الطويلة عبر hbar() فلا تُحشَر الأعمدة:
  T("★ المخطّطات الأفقية تستعمل hbar() وتلفّ الأسماء الطويلة على أسطر (تظهر كاملةً، لا تُقصّ ولا تُحشَر)",
    /const hbar\s*=/.test(src) && /crossAlign="far"/.test(src) &&
    /const _wrap\s*=/.test(src) && /autoSkip=false/.test(src) &&
    src.includes("...hbar()") && !/indexAxis:"y",plugins:\{legend:\{display:false\}\}\}\}\);/.test(src));
  // v18.9ty: الحلّ الحتميّ لانزياح اللوحة — CSS يُجبِر اللوحة على ملء الحاوية (position:absolute
  // + inset + width/height:100%!) فلا تعتمد الملاءمة على قياس Chart.js الذي يفشل على iPad Safari
  // (canvas أضيق يُحاذى يميناً في RTL فيبقى فراغٌ يساراً). حارسٌ على قاعدة CSS في index.html:
  T("★ CSS يُجبِر لوحة المخطّط على ملء الحاوية (لا تنكمش/تنزاح لجانب البطاقة على الآيباد)",
    /\.pkpi-chart-card \.cwrap canvas\{position:absolute!important/.test(HTML) &&
    /\.pkpi-chart-card \.cwrap canvas\{[^}]*width:100%!important/.test(HTML) &&
    /\.pkpi-chart-card \.cwrap\{position:relative;height:280px;width:100%\}/.test(HTML));
  // v1.3: pending_finance في STAGE_ORDER بموضعها الصحيح (بين pending_ceo و proc_executing)
  // وإلا ابتلع pending_ceo زمنَ انتظار المالية فتشوّه مخطّط متوسط المراحل.
  T("★ pending_finance ضمن STAGE_ORDER (لا يُبتلَع زمنها)", src.includes('"pending_finance"'));
  T("pending_finance في موضعها الصحيح بالتسلسل",
    src.includes('"pending_ceo","pending_finance","proc_executing"'));
  T("pending_finance حالة حقيقية في index.html", HTML.includes('value="pending_finance"'));
}

/* ════════════════════════════════════════════════════════════════════
   9) وحدة البند المستعاض (substitute-budget.js)
      تركيبٌ صحيح في index.html + صحّة حساب السجل المالي (دالة نقية).
   ════════════════════════════════════════════════════════════════════ */
function substituteBudget() {
  H("9) وحدة البند المستعاض (substitute-budget.js)");
  if (!SB_PATH) { console.log("  ⏭  substitute-budget.js غير موجود — تُخطّى"); return; }
  const src = fs.readFileSync(SB_PATH, "utf8");
  const vm = require("vm");
  try { new vm.Script(src); T("صياغة substitute-budget.js سليمة", true); }
  catch (e) { T("صياغة substitute-budget.js سليمة", false, String(e.message).slice(0, 120)); return; }

  // نقاط الربط في index.html
  T("الوسم موجود في index.html", /<script src="substitute-budget\.js\?v=/.test(HTML));
  T("زر القائمة الجانبية موجود", HTML.includes('data-page="substitute-budget"'));
  T("حاوية الصفحة موجودة", HTML.includes('id="page-substitute-budget"'));
  T("showPage يرسم الوحدة", HTML.includes('id==="substitute-budget"') && HTML.includes("window.substituteBudget.render"));
  T("تُشغَّل مع بقية الوحدات", HTML.includes("window.substituteBudget.startSync"));
  T("حقول الطلب تُحفظ", HTML.includes("isSubstitute,") && HTML.includes("substituteAccountId,"));
  T("قسم النموذج موجود", HTML.includes('id="np-is-substitute"') && HTML.includes('id="np-substitute-account"'));
  T("يقرأ المصدر الموحّد للمشاريع (رسمية + يدوية)", src.includes("_allProjectOptions"));
  T("الترشيح التلقائي بالمفتاح الموحّد", HTML.includes("function _npProjKeyForSub()") && HTML.includes("__CUSTOM__:"));

  // تحميل الوحدة فعلياً واختبار دالة الحساب النقية _calcStats
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  try { vm.runInContext(src, sandbox); } catch (e) { T("تُحمَّل الوحدة", false, String(e.message).slice(0, 120)); return; }
  const SB = sandbox.window.substituteBudget;
  T("تعرّض window.substituteBudget._calcStats", SB && typeof SB._calcStats === "function");
  if (!SB || typeof SB._calcStats !== "function") return;

  // مثال محسوبٌ باليد: هامش 25%، إجمالي 500000، مستهلك سابق 180000
  //   مغلق 10000 + مغلق 20000 (سعر بيع ×1.25) + جارٍ تقديري 5000
  const acc = { margin: 25, total: 500000, openingConsumed: 180000 };
  const pos = [
    { closed: true,  cost: 10000, est: 9000 },
    { closed: true,  cost: 20000, est: 21000 },
    { closed: false, cost: 0,     est: 5000 },
  ];
  const s = SB._calcStats(acc, pos, p => p.closed, p => p.cost, p => p.est);
  T("سعر البيع المصروف = Σ تكلفة مغلقة × (1+هامش)", s.closedSell === 37500, `=${s.closedSell} (متوقع 37500)`);
  T("الربح المحقّق = سعر البيع − التكلفة", s.closedProfit === 7500, `=${s.closedProfit} (متوقع 7500)`);
  T("المستهلك = المستهلك سابقاً + المصروف", s.consumed === 217500, `=${s.consumed} (متوقع 217500)`);
  T("المتبقي = الإجمالي − المستهلك", s.remaining === 282500, `=${s.remaining} (متوقع 282500)`);
  T("قيد التنفيذ (تقديري) لا يُخصم", s.wipSell === 6250 && s.closedSell === 37500, `wip=${s.wipSell}`);

  // ثابت عشوائي: مهما كانت المدخلات، تتماسك المعادلات الأساسية
  let _s2 = 424242, bad = null;
  const rnd = () => { _s2 = (_s2 + 0x6D2B79F5) | 0; let t = Math.imul(_s2 ^ (_s2 >>> 15), 1 | _s2); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = 0; i < 500 && !bad; i++) {
    const a = { margin: Math.round(rnd() * 5000) / 100, total: Math.round(rnd() * 1e6), openingConsumed: Math.round(rnd() * 2e5) };
    const ps = Array.from({ length: Math.floor(rnd() * 6) }, () => ({ closed: rnd() < 0.6, cost: Math.round(rnd() * 5e4), est: Math.round(rnd() * 5e4) }));
    const r = SB._calcStats(a, ps, p => p.closed, p => p.cost, p => p.est);
    const eps = 1e-6;
    if (Math.abs(r.consumed - (a.openingConsumed + r.closedSell)) > eps) bad = { why: "consumed", r };
    else if (Math.abs(r.remaining - (a.total - r.consumed)) > eps) bad = { why: "remaining", r };
    else if (Math.abs(r.closedProfit - (r.closedSell - r.closedCost)) > eps) bad = { why: "profit", r };
  }
  T("ثابت: المستهلك/المتبقي/الربح متماسكة على 500 تركيبة عشوائية", !bad, bad ? JSON.stringify(bad).slice(0, 120) : "");

  // ── v18.9sa: الطلبات الميّتة (ملغى/مرفوض/محذوف) لا تُحسب WIP ولا تُعَدّ ──
  T("substituteBudget._isDead مكشوفة", typeof SB._isDead === "function");
  if (typeof SB._isDead === "function") {
    T("_isDead: ملغى/مرفوض/محذوف = ميّت",
      SB._isDead({ status: "cancelled" }) && SB._isDead({ status: "rejected" }) && SB._isDead({ status: "ceo_rejected" }) && SB._isDead({ status: "deleted" }));
    T("_isDead: مغلق/جارٍ ليس ميّتاً",
      !SB._isDead({ status: "closed" }) && !SB._isDead({ status: "proc_executing" }) && !SB._isDead({ status: "pending_finance" }));
  }
  const accD = { margin: 25, total: 500000, openingConsumed: 0 };
  const posD = [
    { st: "closed", cost: 10000, est: 9000 },          // مغلق → مستهلك
    { st: "proc_executing", cost: 0, est: 8000 },      // جارٍ → WIP
    { st: "cancelled", cost: 0, est: 7000 },           // ميّت → يُستبعَد كلياً
  ];
  const isDeadD = p => ["cancelled", "rejected", "deleted"].indexOf(p.st) >= 0;
  const sD = SB._calcStats(accD, posD, p => p.st === "closed", p => p.cost, p => p.est, isDeadD);
  T("★ الطلب الميّت لا يُحسَب WIP", sD.wipSell === 8000 * 1.25, "wip=" + sD.wipSell + " (متوقع " + (8000 * 1.25) + ")");
  T("★ العدّ يستبعد الميّت", sD.count === 2 && sD.deadCount === 1, "count=" + sD.count + " dead=" + sD.deadCount);
  T("المغلق يُحسَب رغم وجود ميّت", sD.closedSell === 10000 * 1.25 && sD.consumed === 12500);
  // بلا كاشف ميّت (توقيع قديم 5 وسائط): السلوك السابق يبقى (لا كسر رجعي)
  const sLegacy = SB._calcStats(accD, posD, p => p.st === "closed", p => p.cost, p => p.est);
  T("توافق رجعي: بلا isDead يُحسَب كل غير-المغلق WIP", sLegacy.wipSell === (8000 + 7000) * 1.25);
}

/* ════════════════════════════════════════════════════════════════════
   10) تحويل الأرقام num() — الفاصلة العربية العشرية دون إفساد فاصلة الآلاف
       (price-analysis.js + labor-catalog.js). أوّل تغطية تنفيذية لهذين الملفين.
       العطل المُصلَح: replace(/,/g,".") كان يحوّل «1,250.00» إلى «1.250.00» ثم
       parseFloat=1.25 — بخس السعر/الكمية 1000×.
   ════════════════════════════════════════════════════════════════════ */
function numParsing() {
  H("10) تحويل الأرقام num() (price-analysis.js + labor-catalog.js)");
  const vm = require("vm");
  const docStub = {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: () => {}, createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} })
  };
  function loadNum(p, globalName) {
    if (!p) { T(globalName + " موجودة", false, "الملف غير موجود"); return null; }
    const src = fs.readFileSync(p, "utf8");
    try { new vm.Script(src); T("صياغة " + globalName + " سليمة", true); }
    catch (e) { T("صياغة " + globalName + " سليمة", false, String(e.message).slice(0, 120)); return null; }
    const sandbox = { window: {}, document: docStub, console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {} };
    vm.createContext(sandbox);
    try { vm.runInContext(src, sandbox); } catch (e) { T("تُحمَّل " + globalName, false, String(e.message).slice(0, 120)); return null; }
    const mod = sandbox.window[globalName];
    T(globalName + "._num مكشوفة للاختبار", mod && typeof mod._num === "function");
    return (mod && typeof mod._num === "function") ? mod._num : null;
  }
  const paNum = loadNum(PA_PATH, "priceAnalysis");
  const lcNum = loadNum(LC_PATH, "laborCatalog");

  // [المدخل, المتوقع]
  const cases = [
    ["1,250.00", 1250],    // ★ العطل المُبلَّغ: آلاف + عشري — كان يعطي 1.25
    ["1,250",    1250],    // آلاف بلا عشري
    ["12,500.50", 12500.5],
    ["1,250,000", 1250000],
    ["1,25",     1.25],    // فاصلة عربية عشرية — تبقى
    ["1,5",      1.5],
    ["0,5",      0.5],
    ["1250.75",  1250.75], // عشري لاتيني عادي
    ["1250",     1250],
    ["3.14",     3.14],
    ["-5",       -5],      // الإشارة تبقى
    ["",         0],
    [null,       0],
    [undefined,  0],
    ["abc",      0],
    ["  42  ",   42],
    [1234.5,     1234.5],  // مُدخل رقمي
  ];
  function checkNum(fn, label) {
    if (!fn) return;
    let bad = null;
    for (const [inp, exp] of cases) {
      const got = fn(inp);
      if (Math.abs(got - exp) > 1e-9) { bad = { inp, exp, got }; break; }
    }
    T("★ " + label + ": كل حالات num() صحيحة (شاملة عطل فاصلة الآلاف)", !bad,
      bad ? `num(${JSON.stringify(bad.inp)})=${bad.got} — متوقع ${bad.exp}` : cases.length + " حالة");
    T(label + ": «1,250.00» لم تعُد 1.25 (تأكيد الإصلاح)", Math.abs(fn("1,250.00") - 1250) < 1e-9, "=" + fn("1,250.00"));
  }
  checkNum(paNum, "priceAnalysis");
  checkNum(lcNum, "laborCatalog");

  if (paNum && lcNum) {
    let mismatch = null;
    for (const [inp] of cases) { if (Math.abs(paNum(inp) - lcNum(inp)) > 1e-9) { mismatch = { inp, pa: paNum(inp), lc: lcNum(inp) }; break; } }
    T("الوحدتان تعطيان النتيجة نفسها", !mismatch, mismatch ? JSON.stringify(mismatch) : "");
  }

  T("الوسم موجود في index.html (price-analysis)", /<script src="price-analysis\.js\?v=/.test(HTML));
  T("الوسم موجود في index.html (labor-catalog)", /<script src="labor-catalog\.js\?v=/.test(HTML));
}

/* ════════════════════════════════════════════════════════════════════
   11) طبقة الإشعارات (HailNotify.js) — إزاحة الفائض لا تُجمّد التبويب
   ════════════════════════════════════════════════════════════════════ */
function hailNotify() {
  H("11) طبقة الإشعارات (HailNotify.js)");
  const HN_PATH = [path.resolve(path.dirname(IDX), "HailNotify.js")].find(p => fs.existsSync(p));
  if (!HN_PATH) { console.log("  ⏭  HailNotify.js غير موجود — تُخطّى"); return; }
  const src = fs.readFileSync(HN_PATH, "utf8");
  const vm = require("vm");
  try { new vm.Script(src); T("صياغة HailNotify.js سليمة", true); }
  catch (e) { T("صياغة HailNotify.js سليمة", false, String(e.message).slice(0, 120)); return; }

  T("الوسم موجود في index.html", /<script src="HailNotify\.js\?v=/.test(HTML));
  // حراسة الإصلاح: إزاحة الفائض تطوي على لقطة ثابتة للعناصر الحيّة لا على children[0]
  T("إزاحة الفائض لا تكرّر على نفس العنصر (لا تجمّد)",
    src.includes("Array.prototype.filter.call(stack.children") && src.includes("while (live.length > cfg.maxVisible) dismiss(live.shift());"));
  T("زال النمط المُجمِّد (while على children[0])",
    !src.includes("while (stack.children.length > cfg.maxVisible) dismiss(stack.children[0]);"));

  // محاكاة تنفيذية: dismiss يؤجّل الحذف (يعلّم __gone) — نتأكّد أن حلقة الإزاحة تنتهي
  // مع لقطة ثابتة حتى لو لم تُحذف العقد فوراً. نعيد بناء المنطق المُصلَح ونتحقّق أنه ينتهي
  // ويُعلّم العدد الصحيح للإزاحة، بينما النمط القديم كان يدور أبداً.
  (function () {
    const maxVisible = 4;
    // عقد وهمية: children مصفوفة لا تنقص (يحاكي تأجيل removeChild 260ms)
    const children = [];
    for (let i = 0; i < 7; i++) children.push({ __gone: false });
    function dismiss(el) { if (!el || el.__gone) return; el.__gone = true; }
    // النمط المُصلَح
    const live = Array.prototype.filter.call(children, c => !c.__gone);
    let iterations = 0;
    while (live.length > maxVisible) { dismiss(live.shift()); if (++iterations > 1000) break; }
    const goneCount = children.filter(c => c.__gone).length;
    T("★ إزاحة 7 إشعارات (حد 4) تنتهي وتُعلّم 3 للإزاحة",
      iterations === 3 && goneCount === 3, `تكرارات=${iterations} مُزاحة=${goneCount}`);
  })();
}

/* ════════════════════════════════════════════════════════════════════
   12) معالجة جذر سباقات الكتابة — دمجٌ ذرّي + عدّاد كود ذرّي
       substitute-budget.js: دمج حسابٍ واحد على حالة الخادم بدل كتابة اللقطة
       المحلية كاملةً (فقدان تحديث). price-analysis.js/labor-catalog.js: تخصيص
       الكود عبر عدّاد ذرّي بدل حسابٍ محلي يكرّر عند التزامن.
   ════════════════════════════════════════════════════════════════════ */
function writeRaceRoot() {
  H("12) جذر سباقات الكتابة (دمج ذرّي + عدّاد كود ذرّي)");
  const vm = require("vm");
  const docStub = {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: () => {}, createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} })
  };
  function loadMod(p, globalName) {
    if (!p) return null;
    const src = fs.readFileSync(p, "utf8");
    const sandbox = { window: {}, document: docStub, console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {} };
    vm.createContext(sandbox);
    try { vm.runInContext(src, sandbox); } catch (e) { T("تُحمَّل " + globalName, false, String(e.message).slice(0, 120)); return null; }
    return sandbox.window[globalName];
  }

  // ── (أ) substitute-budget: الدمج الذرّي يحفظ حسابات الآخرين ──
  const SB = loadMod(SB_PATH, "substituteBudget");
  T("substituteBudget._applyUpsert/_applyRemove مكشوفتان",
    !!(SB && typeof SB._applyUpsert === "function" && typeof SB._applyRemove === "function"));
  if (SB && SB._applyUpsert) {
    const server = [{ id: "A", total: 100 }, { id: "B", total: 200 }];
    const up = SB._applyUpsert(server, { id: "B", total: 250 });          // مسؤول يعدّل B
    T("★ الدمج: تعديل حسابٍ يبقي الآخر ولا يكرّر",
      up.length === 2 && up.find(a => a.id === "A").total === 100 && up.find(a => a.id === "B").total === 250,
      JSON.stringify(up));
    const add = SB._applyUpsert(server, { id: "C", total: 300 });          // مسؤول آخر يضيف C
    T("★ الدمج: إضافة حسابٍ على حالة الخادم لا تدهس القائمة",
      add.length === 3 && !!add.find(a => a.id === "A") && !!add.find(a => a.id === "B") && !!add.find(a => a.id === "C"));
    const rm = SB._applyRemove(server, "A");
    T("★ الحذف الذرّي يزيل الهدف وحده", rm.length === 1 && rm[0].id === "B");
    T("الدمج لا يحوّر مصفوفة الخادم الأصلية", server.length === 2 && server[1].total === 200);
  }

  // ── (ب) عدّاد الكود الذرّي: max(الخادم, المحلي)+1 ──
  function checkCounter(fn, label) {
    if (!fn) { T(label + "._nextCodeNum مكشوفة", false); return; }
    const cases = [[0, 3, 4], [5, 3, 6], [5, 0, 6], [0, 0, 1], [10, 10, 11]];
    let bad = null;
    for (const [svr, loc, exp] of cases) { if (fn(svr, loc) !== exp) { bad = { svr, loc, exp, got: fn(svr, loc) }; break; } }
    T("★ " + label + ": الكود التالي = max(الخادم, المحلي)+1", !bad, bad ? JSON.stringify(bad) : cases.length + " حالة");
    T(label + ": عدّاد الخادم المتقدّم على لقطة متخلّفة يمنع التكرار", fn(9, 3) === 10, "=" + fn(9, 3));
  }
  const PA = loadMod(PA_PATH, "priceAnalysis");
  const LC = loadMod(LC_PATH, "laborCatalog");
  checkCounter(PA && PA._nextCodeNum, "priceAnalysis");
  checkCounter(LC && LC._nextCodeNum, "laborCatalog");

  // ── (ج) حراسة النمط المصدري ──
  const sbSrc = SB_PATH ? fs.readFileSync(SB_PATH, "utf8") : "";
  const paSrc = PA_PATH ? fs.readFileSync(PA_PATH, "utf8") : "";
  const lcSrc = LC_PATH ? fs.readFileSync(LC_PATH, "utf8") : "";
  const GW = [
    ["substitute: الحفظ عبر معاملة ذرّية", sbSrc, "return db.runTransaction(function(tx){", true],
    ["substitute: زالت الكتابة الكاملة للمصفوفة", sbSrc, "return db.doc(DOC()).set({ accounts: _accounts });", false],
    ["substitute: الإضافة/التعديل عبر _upsertAccount", sbSrc, "await _upsertAccount(saved);", true],
    ["substitute: الحذف عبر _removeAccountTx", sbSrc, "_removeAccountTx(id).then(function(){", true],
    ["price-analysis: تخصيص الكود عبر معاملة", paSrc, "await db.runTransaction(async tx=>{", true],
    ["price-analysis: الحفظ يخصّص كوداً ذرّياً", paSrc, "data.code = await allocCode();", true],
    ["labor-catalog: تخصيص الكود عبر معاملة", lcSrc, "await db.runTransaction(async tx=>{", true],
    ["labor-catalog: الحفظ يخصّص كوداً ذرّياً", lcSrc, "data.code = await allocCode();", true],
  ];
  GW.forEach(([n, src, needle, want]) => T(n, src.includes(needle) === want, want ? "" : "يجب ألا يعود"));
}

/* ════════════════════════════════════════════════════════════════════
   13) الجرد الشهري (stocktake.js) — أوّل تغطية تنفيذية (٩٠٨ أسطر كانت بلا اختبار)
       تصنيف الفرق _classify + قصر العدّ السالب _countAt (منع الرصيد السالب).
   ════════════════════════════════════════════════════════════════════ */
function stocktakeTests() {
  H("13) الجرد الشهري (stocktake.js)");
  if (!ST_PATH) { console.log("  ⏭  stocktake.js غير موجود — تُخطّى"); return; }
  const vm = require("vm");
  const src = fs.readFileSync(ST_PATH, "utf8");
  try { new vm.Script(src); T("صياغة stocktake.js سليمة", true); }
  catch (e) { T("صياغة stocktake.js سليمة", false, String(e.message).slice(0, 120)); return; }
  T("الوسم موجود في index.html", /<script src="stocktake\.js\?v=/.test(HTML));

  const docStub = {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: () => {}, createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} })
  };
  const sandbox = { window: {}, document: docStub, console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {} };
  vm.createContext(sandbox);
  try { vm.runInContext(src, sandbox); } catch (e) { T("تُحمَّل stocktake", false, String(e.message).slice(0, 120)); return; }
  const ST = sandbox.window.stocktake;
  T("stocktake._classify/_countAt مكشوفتان",
    !!(ST && typeof ST._classify === "function" && typeof ST._countAt === "function"));
  if (!ST || !ST._classify) return;

  // ── _classify: الفرق = المعدود − النظام؛ منطق «الكبير» (≥10% و ≥3 وحدات) ──
  T("_classify: الفرق = المعدود − النظام", ST._classify(100, 93).delta === -7, JSON.stringify(ST._classify(100, 93)));
  T("_classify: فرق صغير على رصيد كبير ليس «كبيراً»", ST._classify(1000, 998).big === false);
  T("_classify: ≥10% و ≥3 وحدات = «كبير»", ST._classify(100, 85).big === true);
  T("_classify: قطعة واحدة على رصيد صغير ليست «كبيراً» (حدّ مطلق 3)", ST._classify(4, 3).big === false);
  T("★ _classify: رصيد صفر وظهر مخزون = يستحق مراجعة", ST._classify(0, 5).big === true && ST._classify(0, 0).big === false);

  // ── _countAt: قصر العدّ السالب إلى صفر — منع الرصيد السالب ──
  T("★ _countAt: العدّ السالب يُقصَر إلى صفر (لا رصيد سالب)", ST._countAt({ x: -5 }, "x") === 0, "=" + ST._countAt({ x: -5 }, "x"));
  T("_countAt: العدّ الموجب يبقى كما هو", ST._countAt({ x: 7.5 }, "x") === 7.5);
  T("_countAt: المفقود = صفر", ST._countAt({}, "y") === 0);
  // ثابت: مهما كان المُدخَل، الهدف المُطبَّق ≥ 0
  let neg = null;
  for (const v of [-1000, -0.001, -5, 0, 3.2, 999]) { if (ST._countAt({ k: v }, "k") < 0) { neg = v; break; } }
  T("★ ثابت: _countAt لا يُنتج قيمة سالبة أبداً", neg === null, neg === null ? "" : "سالب عند " + neg);

  // ── حراسة: مسار التطبيق يستهلك العدّ عبر _countAt (لا _num الخام) ──
  T("التطبيق يقصر العدّ عبر _countAt", src.includes("const counted=_countAt(counts, s.itemId);"));
  T("زال قراءة العدّ الخام في التطبيق", !src.includes("const counted=_num(counts[s.itemId]);"));

  // ── v18.9rz: التسوية تُقاس على الرصيد الحيّ الطازج لا لقطة النظام المجمّدة ──
  T("stocktake._adjustDelta مكشوفة", !!(ST && typeof ST._adjustDelta === "function"));
  if (ST && ST._adjustDelta) {
    T("_adjustDelta: الفرق = المعدود − الطازج", ST._adjustDelta(5, 8) === -3 && ST._adjustDelta(10, 7) === 3);
    T("_adjustDelta: تطابق = صفر (يُتخطّى بلا كتابة)", ST._adjustDelta(5, 5) === 0);
    T("_adjustDelta: تقريب ثلاث خانات", Math.abs(ST._adjustDelta(0.1, 0.3) - (-0.2)) < 1e-9);
    // ★ جوهر العطل: معدودٌ يساوي لقطة النظام القديمة (5) بينما انحرف الرصيد الحيّ (8)
    //   — القرار يُبنى على الطازج فتُطبَّق التسوية (delta≠0)، لا يُتخطّى البند.
    const snapshotSys = 5, counted = 5, liveFresh = 8;
    T("★ انحراف اللقطة: معدود=لقطة قديمة لكن الرصيد الحيّ مختلف ⇒ يُسوّى",
      counted === snapshotSys && ST._adjustDelta(counted, liveFresh) !== 0,
      "delta=" + ST._adjustDelta(counted, liveFresh));
  }
  // حراسة النمط: التطبيق يشمل كل بندٍ معدود (لا يُرشّح بـ systemQty)، ويتحقّق من الطازج
  T("التطبيق لا يُرشّح بلقطة النظام المجمّدة",
    !src.includes("return _countAt(counts, s.itemId) !== _num(s.systemQty);"));
  T("الدلتا تُحسَب مقابل الطازج داخل المعاملة", src.includes("const delta = _adjustDelta(target, fresh);"));
  T("لا كتابة لبندٍ لم يتغيّر عن الطازج", src.includes("if(delta===0) return false;"));
  T("عدّ التسويات الفعلية (لا البنود المفحوصة)", src.includes("adjustedCount: changed,"));

  // ── v18.9sa: فشل جزئي في التطبيق لا يُوسَم «مطبَّق» — يعود لحالةٍ قابلة للإعادة ──
  T("★ الفشل الجزئي لا يُوسَم «مطبَّق»", src.includes("if(failed > 0){"));
  T("الفشل الجزئي يعود لحالةٍ قابلة للإعادة",
    src.includes('status: meta.auto ? "counting" : "pending_approval"'));
  T("النجاح الكامل وحده يُوسَم «مطبَّق»", src.includes('appliedFailed: 0'));
}

/* ════════════════════════════════════════════════════════════════════
   14) ملخّص الموردين — نسبة التكلفة/العدّ للمورّد الفعلي لا المطلوب
       (index.html poVendorBreakdown) — يُوزَّع الطلب المغلق على مورّديه الفعليين
       من سندات الاستلام (grnDocs[].invoicedTotal) بدل نسبه كلَّه لمورد الطلب.
   ════════════════════════════════════════════════════════════════════ */
function vendorSummary() {
  H("14) ملخّص الموردين (poVendorBreakdown)");
  const a = HTML.indexOf("function poVendorBreakdown(p){");
  if (a < 0) { T("poVendorBreakdown موجودة في index.html", false, "لم تُعثر"); return; }
  const src = HTML.slice(a, HTML.indexOf("\nfunction ", a + 10));
  let fn;
  try {
    // نُبني الدالة الحقيقية مع بدائل تبعيتيها (poIsClosed / poActualCost / _poItemLine)
    fn = new Function("poIsClosed", "poActualCost", "_poItemLine", src + "\nreturn poVendorBreakdown;")(
      p => !!p._closed,
      p => Number(p.actualCost) || 0,
      it => ({ net: 0, vat: Number(it && it.vat) || 0, total: Number(it && it.itemCost) || 0 })
    );
  } catch (e) { T("تُبنى poVendorBreakdown وتُنفَّذ", false, String(e.message).slice(0, 120)); return; }
  T("تُبنى poVendorBreakdown وتُنفَّذ", typeof fn === "function");
  if (typeof fn !== "function") return;

  const r1 = fn({ _closed: true, grnDocs: [{ vendor: "مورّد أ", invoicedTotal: 5000 }], vendor: "مطلوب" });
  T("مغلق: التكلفة للمورّد الفعلي من السند", r1.length === 1 && r1[0].vendor === "مورّد أ" && r1[0].cost === 5000);

  const r2 = fn({ _closed: true, grnDocs: [{ vendor: "أ", invoicedTotal: 3000 }, { vendor: "ب", invoicedTotal: 2000 }] });
  const va = r2.find(x => x.vendor === "أ"), vb = r2.find(x => x.vendor === "ب");
  T("★ متعدّد الموردين: التكلفة تُوزَّع بالحصص", r2.length === 2 && va && vb && va.cost === 3000 && vb.cost === 2000);

  const r3 = fn({ _closed: true, grnDocs: [{ vendor: "أ", invoicedTotal: 1000 }, { vendor: "أ", invoicedTotal: 1500 }] });
  T("سندان لنفس المورّد يُدمجان", r3.length === 1 && r3[0].cost === 2500);

  const r4 = fn({ _closed: true, actualVendor: "فعلي", vendor: "مطلوب", actualCost: 8000 });
  T("مغلق قديم بلا سندات: يُنسَب لـ actualVendor بكامل التكلفة", r4.length === 1 && r4[0].vendor === "فعلي" && r4[0].cost === 8000);

  const r5 = fn({ _closed: true, grnDocs: [{ vendor: "ب", invoicedTotal: 4000 }], vendor: "أ" });
  T("★ يُنسَب للمورّد الفعلي (ب) لا المطلوب (أ)", r5.length === 1 && r5[0].vendor === "ب");

  const r6 = fn({ _closed: false, vendor: "مطلوب", actualCost: 9999 });
  T("غير مغلق: تكلفة صفر (عدّ فقط) تحت مورّده", r6.length === 1 && r6[0].cost === 0 && r6[0].vendor === "مطلوب");

  // حراسة: التجميعتان (شاشة + PDF) تستخدمان poVendorBreakdown لا فهرسة p.vendor
  T("تقرير الشاشة يستخدم poVendorBreakdown",
    HTML.includes("poVendorBreakdown(p).forEach(({vendor,cost})=>{\n      if(!byVendor[vendor])"));
  T("تقرير PDF يستخدم poVendorBreakdown",
    HTML.includes("poVendorBreakdown(p).forEach(({vendor,cost})=>{\n      if(!byVendorPDF[vendor])"));
  T("زالت فهرسة الملخّص على مورد الطلب (شاشة)", !HTML.includes("if(!byVendor[v]) byVendor[v]={total:0,actualCost:0};"));
  T("زالت فهرسة الملخّص على مورد الطلب (PDF)", !HTML.includes("if(!byVendorPDF[v]) byVendorPDF[v]={total:0,cost:0};"));

  // ── v18.9tk: التوزيع من البنود للطلب المُدقَّق (يطابق التكلفة الفعلية المشتقّة) ──
  const rItems = fn({
    _closed: true, auditedBy: "نظام",
    grnDocs: [{ vendor: "الوانك", invoicedTotal: 55 }, { vendor: "الوانك", invoicedTotal: 55 }, { vendor: "فهد", invoicedTotal: 432.4 }],
    items: [
      { vendor: "الوانك", rcvQty: 3, itemCost: 44.99 },
      { vendor: "فهد", rcvQty: 7, itemCost: 104.65 },
      { vendor: "فهد", rcvQty: 3, itemCost: 120.75 }
    ]
  });
  const vAl = rItems.find(x => x.vendor === "الوانك"), vFa = rItems.find(x => x.vendor === "فهد");
  T("★ التوزيع من البنود لا جمع السندات المتضخّم", rItems.length === 2 && vAl && vFa &&
    vAl.cost === 44.99 && vFa.cost === Math.round((104.65 + 120.75) * 100) / 100);
}

/* ════════════════════════════════════════════════════════════════════
   14ج) توحيد أسماء المورّدين (v18.9.2514) — المورّد الواحد يُكتَب بصيغٍ متعدّدة
        («عالم الرتاج» · «شركة عالم الرتاج» · «شركة عالم الرتاج للتجارة») فينقسم
        إنفاقُه صفوفاً في المؤشّرات والتقارير. الحارسُ يُثبت أمرين متلازمين:
        (١) المرادفُ المعتمد **يدمج** الصيغ فعلاً في صفٍّ واحدٍ بمجموعٍ صحيح،
        (٢) وبلا اعتمادٍ **لا يُدمَج شيء** — فلا كيانان مختلفان يُخلطان آلياً.
   ════════════════════════════════════════════════════════════════════ */
function vendorNameUnify() {
  H("14ج) توحيد أسماء المورّدين (جدول مرادفات صريح)");
  const a = HTML.indexOf("function VENDOR_ALIASES_DOC(){");
  const b = HTML.indexOf("async function loadVendorAliases(");
  if (a < 0 || b <= a) { T("كتلةُ توحيد أسماء المورّدين موجودة في index.html", false, "لم تُعثر"); return; }
  const src = HTML.slice(a, b);
  let V;
  try {
    V = new Function("IS_DEV", src +
      "\nreturn { vendorMatchKey, vendorFuzzyKey, vendorCanonical, vendorCanonParts, _poVendorFilterName, vendorSplitNames," +
      "\n         setAliases:m=>{ _vendorAliases=m; }, getAliases:()=>_vendorAliases };")(false);
  } catch (e) { T("تُبنى دوالّ التوحيد وتُنفَّذ", false, String(e.message).slice(0, 140)); return; }
  T("تُبنى دوالّ التوحيد وتُنفَّذ", typeof V.vendorCanonical === "function");
  if (typeof V.vendorCanonical !== "function") return;

  const V1 = "عالم الرتاج", V2 = "شركة عالم الرتاج", V3 = "شركة عالم الرتاج للتجارة";

  // ── (١) مفتاحُ المطابقة: تطبيعٌ حرفيٌّ محافظ لا يحذف كلمة ──
  T("مفتاحُ المطابقة يوحّد الهمزة والتاء المربوطة والياء والمسافات",
    V.vendorMatchKey("مؤسّسة   الرِتاجِ") === V.vendorMatchKey("موسسه الرتاج"));
  T("★ ولا يحذف كلمةً: صيغتان تختلفان بكلمةٍ تبقيان مفتاحَين مختلفَين",
    V.vendorMatchKey(V2) !== V.vendorMatchKey(V3));

  // ── (٢) بلا اعتمادٍ لا دمج — الحارسُ الأهمّ (كيانان قد يتشابه اسماهما) ──
  V.setAliases({});
  T("★ بلا جدول مرادفات: كلُّ صيغةٍ تبقى باسمها (لا دمجَ آليّ)",
    V.vendorCanonical(V1) === V1 && V.vendorCanonical(V2) === V2 && V.vendorCanonical(V3) === V3);
  const split = V.vendorCanonParts([{ vendor: V1, cost: 3486 }, { vendor: V2, cost: 5605 }, { vendor: V3, cost: 3674 }]);
  T("★ وثلاثُ صيغٍ تبقى ثلاثةَ صفوفٍ منفصلة", split.length === 3);

  // ── (٣) بالاعتماد: الصيغ تُدمَج في صفٍّ واحدٍ بمجموعٍ صحيح ──
  const AL = {}; AL[V.vendorMatchKey(V1)] = V2; AL[V.vendorMatchKey(V3)] = V2;
  V.setAliases(AL);
  T("الاسمُ المعتمد يُرجَع لكل صيغةٍ مدموجة",
    V.vendorCanonical(V1) === V2 && V.vendorCanonical(V3) === V2 && V.vendorCanonical(V2) === V2);
  const merged = V.vendorCanonParts([{ vendor: V1, cost: 3486 }, { vendor: V2, cost: 5605 }, { vendor: V3, cost: 3674 }]);
  T("★ الصيغُ الثلاث تُدمَج في صفٍّ واحد",
    merged.length === 1 && merged[0].vendor === V2);
  T("★ ومجموعُ الإنفاق محفوظٌ بلا ضياع (3486+5605+3674)",
    merged.length === 1 && merged[0].cost === 12765);
  T("فلترُ التقارير يقرأ الاسم المعتمد في الطرفين",
    V._poVendorFilterName(V1) === V2 && V._poVendorFilterName(V3) === V2);
  T("الاسمُ الخالي يبقى خالياً (لا «غير محدد» ملفَّقة في الفلتر)",
    V._poVendorFilterName("") === "" && V.vendorCanonical(null) === "");
  T("مورّدٌ خارج الجدول لا يتأثّر", V.vendorCanonical("مؤسسة غشمة السبيعي") === "مؤسسة غشمة السبيعي");

  // ── (٤) مفتاحُ الترشيح: يقارب الصيغَ لاقتراحها وحده ──
  V.setAliases({});
  T("مفتاحُ الترشيح يُسقط الصيغَ القانونية فتتقارب الصيغ الثلاث",
    V.vendorFuzzyKey(V1) === V.vendorFuzzyKey(V2) && V.vendorFuzzyKey(V2) === V.vendorFuzzyKey(V3));
  T("★ لكنّه لا يُقارب مورّدَين مختلفَين",
    V.vendorFuzzyKey("شركة جونسون كونترولز العربية المحدودة") !== V.vendorFuzzyKey(V2));

  // ── (٥) العناقيدُ المقترَحة تُبنى من الأسماء الواردة فعلاً ──
  const ca = HTML.indexOf("function _vmLev1(a,b){");
  if (ca > 0) {
    const cend = HTML.indexOf("\nfunction _vmActiveGroups(", ca);
    let clusters = null;
    try {
      clusters = new Function("vendorFuzzyKey", "vendorCanonical",
        HTML.slice(ca, cend) + "\nreturn _vmClusters;")(V.vendorFuzzyKey, V.vendorCanonical);
    } catch (e) { T("تُبنى _vmClusters وتُنفَّذ", false, String(e.message).slice(0, 140)); }
    if (clusters) {
      T("تُبنى _vmClusters وتُنفَّذ", typeof clusters === "function");
      const OTHER = "مؤسسة غشمة ناصر فايز السبيعي لاجهزة السلامة";
      const names = {};
      names[V1] = { name: V1, count: 2, spend: 3486 };
      names[V2] = { name: V2, count: 3, spend: 5605 };
      names[V3] = { name: V3, count: 2, spend: 3674 };
      names[OTHER] = { name: OTHER, count: 4, spend: 7475 };
      const out = clusters(names);
      const big = out.find(c => c.names.some(e => e.name === V2));
      T("★ الصيغُ الثلاث تُرشَّح عنقوداً واحداً", !!big && big.names.length === 3);
      T("★ وترشيحُها «تطابقٌ قويّ» (نفس مفتاح الترشيح)", !!big && big.strong === true);
      T("★ ومورّدٌ لا صلةَ له لا يدخل أيَّ عنقود",
        !out.some(c => c.names.some(e => e.name.indexOf("غشمة") !== -1)));
      const solo = clusters({ [V2]: { name: V2, count: 1, spend: 10 } });
      T("اسمٌ واحدٌ لا يُنتج عنقوداً", solo.length === 0);
    }
  } else T("_vmClusters موجودة في index.html", false, "لم تُعثر");

  // ── (٦) حرّاسُ الوصل: كلُّ موضع تجميعٍ يمرّ بالاسم المعتمد ──
  T("★ poVendorBreakdown تمرّر كلَّ مخرجاتها بجدول المرادفات",
    /const _canon = arr =>/.test(HTML) &&
    HTML.includes("if(anyi) return _canon(") &&
    HTML.includes("return _canon(Object.keys(m).map(") &&
    HTML.includes("return _canon([{ vendor:v, cost: closed ? poActualCost(p) : 0 }]);"));
  T("★ مؤشّراتُ الأداء تقرأ الاسم المعتمد (_kpiVendorOf)",
    /_kpiVendorOf\(p\)\{[\s\S]{0,1200}?typeof vendorCanonical==="function"\) v = vendorCanonical\(v\)/.test(HTML));
  T("★ فلترُ التقارير يقارن بالاسم المعتمد في الطرفين (شاشة وPDF)",
    (HTML.match(/if\(rVendor&&_poVendorFilterName\(p\.vendor\)!==rVendor\) return false;/g) || []).length === 2 &&
    !HTML.includes('if(rVendor&&(p.vendor||"")!==rVendor) return false;'));
  T("قائمةُ فلتر الموردين تُبنى بالاسم المعتمد فلا تتكرّر الصيغ",
    HTML.includes("purchases.map(p=>_poVendorFilterName(p.vendor))"));
  T("الجدولُ يُحمَّل عند الإقلاع في المسارين (النظام والمشتريات المركزية)",
    (HTML.match(/loadVendorAliases\(\)\.catch\(e=>/g) || []).length === 2);
  T("الجدولُ في مستندٍ مستقلٍّ بنسخة تطوير", /global_vendor_aliases_dev/.test(HTML));
  T("★ الدمجُ لا يمسّ الطلبات (لا كتابةَ دفعةٍ في أداة التوحيد)",
    !/async function doMergeVendors\([\s\S]{0,3000}?db\.batch\(\)/.test(HTML));
  T("★ والتراجعُ متاحٌ ويُعيد الصيغَ لأسمائها", /async function undoMergeVendors\(canon\)\{/.test(HTML));
  T("والقرارُ يُسجَّل في سجل التدقيق (اعتماداً وتراجعاً)",
    /logAudit\("توحيد أسماء مورّد"/.test(HTML) && /logAudit\("تراجع عن توحيد أسماء مورّد"/.test(HTML));
  T("★ ولا سلاسلَ مرادفات: تبعيّاتُ الصيغة المدموجة تُحوَّل للاسم النهائي",
    /Object\.keys\(next\)\.forEach\(k=>\{ if\(others\.indexOf\(next\[k\]\)!==-1\) next\[k\]=canon; \}\);/.test(HTML));
  T("الأداةُ للمسؤول وحدَه (فتحاً وتنفيذاً وتراجعاً)",
    (HTML.match(/currentUser\.role!=="admin"\)\{ toast\("⚠ صلاحية المسؤول فقط","warn"\); return; \}/g) || []).length >= 3);

  /* ── (٧) v18.9.2516: ثلاثةُ أعطالٍ بلّغ عنها المالك في أوّل استعمالٍ حقيقيّ ── */

  // (أ) «الرتاج» و«الريتاج» — ياءٌ واحدةٌ فرّقت مورّداً واحداً إلى عنقودَين
  const la = HTML.indexOf("function _vmLev1(a,b){");
  const lend = HTML.indexOf("\nfunction _vmActiveGroups(", la);
  let CL = null;
  if (la > 0) {
    try {
      CL = new Function("vendorFuzzyKey", "vendorCanonical", HTML.slice(la, lend) +
        "\nreturn { _vmLev1, _vmTokNear, _vmRelate, _vmClusters };")(V.vendorFuzzyKey, V.vendorCanonical);
    } catch (e) { T("تُبنى دوالّ التقارب وتُنفَّذ", false, String(e.message).slice(0, 140)); }
  }
  if (CL) {
    T("مسافةُ التحرير ≤١ تُكتشَف (حذف/إضافة/إبدال)",
      CL._vmLev1("الرتاج", "الريتاج") && CL._vmLev1("سنابل", "سنابك") && CL._vmLev1("الاتقان", "الاتقا"));
    T("★ وفارقُ حرفين لا يُعدّ تقارباً", !CL._vmLev1("الرتاج", "الرياض") && !CL._vmLev1("نماء", "بناء"));
    T("★ والكلماتُ القصيرة لا تتقارب بحرف (يقلب معناها)", !CL._vmTokNear("عام", "عالم"));
    V.setAliases({});
    const R1 = "شركة عالم الريتاج", R2 = "عالم الريتاج", R3 = "شركة عالم الرتاج للتجارة", R4 = "شركة عالم الرتاج";
    const nm2 = {};
    [[R1, 5605], [R2, 3486], [R3, 3674], [R4, 2842]].forEach(([n, sp]) => { nm2[n] = { name: n, count: 1, spend: sp }; });
    nm2["مؤسسة سنابل الاتقان"] = { name: "مؤسسة سنابل الاتقان", count: 1, spend: 900 };
    const out2 = CL._vmClusters(nm2);
    const big2 = out2.find(c => c.names.some(e => e.name === R1));
    T("★ «الرتاج» و«الريتاج» في عنقودٍ واحد (الصيغُ الأربع معاً)",
      !!big2 && big2.names.length === 4, big2 ? big2.names.map(e => e.name).join(" | ") : "—");
    T("★ ومورّدٌ آخر لا ينضمّ إليها", !!big2 && !big2.names.some(e => e.name.indexOf("سنابل") !== -1));
    // العنقودُ المكتملُ توحيدُه يسقط من القائمة (وإلا عُرض بلا فائدةٍ بعد اعتماده)
    const AL2 = {}; [R2, R3, R4].forEach(n => { AL2[V.vendorMatchKey(n)] = R1; });
    V.setAliases(AL2);
    T("★ العنقودُ بعد توحيده لا يُعرَض ثانيةً",
      !CL._vmClusters(nm2).some(c => c.names.some(e => e.name === R1)));
    V.setAliases({});
  }

  // (ب) الاسمُ المركّب «أ + ب» — طلبٌ بمورّدَين
  T("الاسمُ المركّب يُفكَّك إلى مورّديه",
    V.vendorSplitNames("مؤسسة الوانك للتجارة + شركة فهد العمودي").length === 2 &&
    V.vendorSplitNames("مورّد واحد").length === 1);
  V.setAliases({ [V.vendorMatchKey("عالم الرتاج")]: "شركة عالم الريتاج" });
  T("★ التوحيدُ يُطبَّق داخل الاسم المركّب على كل جزء",
    V.vendorCanonical("عالم الرتاج + مؤسسة سنابل") === "شركة عالم الريتاج + مؤسسة سنابل");
  T("★ وجزآن يؤولان لاسمٍ واحدٍ يصيران اسماً واحداً (لا تكرار)",
    V.vendorCanonical("عالم الرتاج + شركة عالم الريتاج") === "شركة عالم الريتاج");
  T("والاسمُ المفرد لا يتأثّر بمنطق التركيب",
    V.vendorCanonical("مؤسسة سنابل") === "مؤسسة سنابل");
  V.setAliases({});
  T("جامعُ الأسماء يفكّك المركّب قبل العَدّ",
    /const parts = vendorSplitNames\(raw\);/.test(HTML) && /if\(parts\.length>1\)/.test(HTML));

  // (ج) «توحيد» لا يفعل شيئاً — تصادمُ الاسم كان يمحو الدالّة من النطاق العام
  T("★ حالةُ العناقيد لا تُسنَد إلى اسم الدالّة (تصادمٌ يمحوها)",
    !/window\._vmClusters\s*=/.test(HTML) && /let _vmLastClusters = \[\];/.test(HTML));
  T("★ والتوحيدُ يقرأ المحدَّد فعلاً بمربّعات الاختيار",
    /document\.querySelectorAll\('\.vm-pick\[data-scope="'\+scope\+'"\]'\)/.test(HTML) &&
    /if\(picked\.length<2\)/.test(HTML));
  T("★ والاسمُ المعتمد يجب أن يكون من المحدَّد",
    /if\(!canon \|\| picked\.indexOf\(canon\)===-1\)/.test(HTML));
  T("★ ودمجٌ يدويٌّ متاحٌ لأي اسمَين خارج الترشيح الآليّ",
    /دمجٌ يدويّ — اختر أيَّ أسماءٍ ووحِّدها/.test(HTML) && /id="vm-search"/.test(HTML) &&
    /_vmAllNames\.map\(e=>row\(e,"all",false\)\)/.test(HTML) && /function _vmFilterAll\(q\)\{/.test(HTML));
}

/* ════════════════════════════════════════════════════════════════════
   14ب) التكلفة الفعلية والكمية المستلمة = حالة البنود النهائية لا جمع السندات
        (v18.9tk) — الطلب العالق على بند ناقص يُعاد تدقيقه مراراً، فجمع
        grnDocs[].invoicedTotal/totalRcv يتضخّم؛ المصدر الصحيح: البنود النهائية.
   ════════════════════════════════════════════════════════════════════ */
function actualCostFromItems() {
  H("14ب) التكلفة الفعلية من حالة البنود (لا جمع السندات)");
  const a = HTML.indexOf("function _poItemLine(");
  if (a < 0) { T("_poItemLine موجودة في index.html", false, "لم تُعثر"); return; }
  // نستخرج كتلة دوال الاشتقاق المتتالية حتى نهاية poReceivedQty
  const end = HTML.indexOf("\nfunction poIsCustomProject(", a);
  const src = HTML.slice(a, end);
  let poAC, poRQ;
  try {
    const built = new Function("getPOTotal", src + "\nreturn { poActualCost, poReceivedQty };")(
      p => (p.items || []).reduce((s, it) => s + (Number(it.itemCost) || 0), 0)
    );
    poAC = built.poActualCost; poRQ = built.poReceivedQty;
  } catch (e) { T("تُبنى دوال الاشتقاق", false, String(e.message).slice(0, 140)); return; }
  T("تُبنى poActualCost/poReceivedQty", typeof poAC === "function" && typeof poRQ === "function");
  if (typeof poAC !== "function") return;

  // طلب استُلم على عدة سندات لنفس البضاعة (grnDocs متضخّمة) — الحالة النهائية للبنود صحيحة
  const po = {
    auditedBy: "نظام", actualCost: 1457.19, receivedQty: 95,
    grnDocs: [{ invoicedTotal: 487.4 }, { invoicedTotal: 487.4 }, { invoicedTotal: 482.39 }],
    items: [
      { rcvQty: 2, itemCost: 10.01 }, { rcvQty: 3, itemCost: 44.99 }, { rcvQty: 7, itemCost: 104.65 },
      { rcvQty: 10, itemCost: 23 }, { rcvQty: 6, itemCost: 34.5 }, { rcvQty: 1, itemCost: 149.5 },
      { rcvQty: 3, itemCost: 120.75 }
    ]
  };
  T("★ التكلفة الفعلية = مجموع البنود لا السندات المتضخّمة",
    poAC(po) === 487.4, "الناتج: " + poAC(po));
  T("★ الكمية المستلمة = مجموع البنود لا السندات", poRQ(po) === 32, "الناتج: " + poRQ(po));

  // البند غير المستلَم (مغطى من المخزون/لم يصل) لا تكلفة فعلية له
  const po2 = { auditedBy: "نظام", items: [{ rcvQty: 0, itemCost: 99 }, { rcvQty: 2, itemCost: 20 }] };
  T("البند غير المستلَم (كمية صفر) لا يدخل التكلفة الفعلية", poAC(po2) === 20);

  // طلب مغلق قديم بلا بنود مستلَمة — يُرجَع للقيمة المخزَّنة (لا صفر)
  const po3 = { auditedBy: "نظام", actualCost: 800, receivedQty: 5, items: [{ itemCost: 800 }] };
  T("قديم بلا rcvQty: يُرجَع للمخزَّن", poAC(po3) === 800 && poRQ(po3) === 5);

  // غير مُدقَّق — القيمة المخزَّنة كما هي
  T("غير مُدقَّق: التكلفة المخزَّنة", poAC({ actualCost: 300 }) === 300);

  // ★ البند المستلَم جزئياً: itemCost مخزَّن على «المطلوب» (10) يُشفى إلى «المستلَم» (5)
  // مثال PO-202607-0113: مطلوب 10، مستلم 5، سعر 5 ⇒ 57.5 (خطأ) → 28.75 (صحيح).
  const poPartial = {
    auditedBy: "نظام", actualCost: 352.3,
    items: [
      { qty: 10, rcvQty: 5, unitCost: 5,     itemCost: 57.5, vat: 7.5 },   // مخزَّن على المطلوب
      { qty: 4,  rcvQty: 4, unitCost: 21,    itemCost: 96.6, vat: 12.6 },
      { qty: 5,  rcvQty: 5, unitCost: 5.25,  itemCost: 30.2, vat: 3.95 },
      { qty: 2,  rcvQty: 2, unitCost: 38.46, itemCost: 88.46, vat: 11.54 },
      { qty: 2,  rcvQty: 2, unitCost: 34.58, itemCost: 79.54, vat: 10.37 }
    ]
  };
  T("★ البند الجزئي: التكلفة على المستلَم لا المطلوب (57.5→28.75)",
    poAC(poPartial) === 323.55, "الناتج: " + poAC(poPartial));

  // البنود السليمة (مستلم = مطلوب) لا تتغيّر بقرش تقريب
  const _lineFn = (() => {
    try {
      const b = new Function("getPOTotal", HTML.slice(HTML.indexOf("function _poItemLine("), HTML.indexOf("\nfunction poIsCustomProject(", HTML.indexOf("function _poItemLine("))) + "\nreturn _poItemLine;")();
      return b;
    } catch (e) { return null; }
  })();
  if (_lineFn) {
    T("البند السليم يبقى كما خُزِّن (لا تذبذب تقريب)",
      _lineFn({ qty: 5, rcvQty: 5, unitCost: 5.25, itemCost: 30.2, vat: 3.95 }, true).total === 30.2);
    T("البند الجزئي يُعاد حسابه على المستلَم",
      _lineFn({ qty: 10, rcvQty: 5, unitCost: 5, itemCost: 57.5, vat: 7.5 }, true).total === 28.75);
  }
}

/* ════════════════════════════════════════════════════════════════════
   14د) ثوابت الحساب المالي — درعٌ وقائيّ ضد عودة «الحساب المبعثر»
        كل الأخطاء الحسابية (0091، 0113) جذرها واحد: الرقم يُحسب في أكثر من
        مسار بأساسٍ مختلف. هذه الفحوص تثبّت «ثلاثيّة متطابقة» على طلبات-اختبار
        من حوادث حقيقية: actualCost == Σ تكلفة البنود == Σ توزيع الموردين،
        وتَحرُس أن مسارات العرض/التجميع تمرّ عبر الدوال المعتمدة وحدها.
   ════════════════════════════════════════════════════════════════════ */
function financialInvariants() {
  H("14د) ثوابت الحساب المالي (درع وقائي)");
  const s1 = HTML.indexOf("const PO_CLOSED_STATUSES");
  const e1 = HTML.indexOf("\nfunction poIsCustomProject(", s1);
  const vbS = HTML.indexOf("function poVendorBreakdown(");
  const vbE = HTML.indexOf("\nfunction ", vbS + 10);
  if (s1 < 0 || vbS < 0 || e1 < 0) { T("دوال الحساب موجودة في index.html", false, "لم تُعثر — هل دُمج #103؟"); return; }
  const src = HTML.slice(s1, e1) + "\n" + HTML.slice(vbS, vbE);
  let M;
  try {
    M = new Function("normalizePOStatus", "getPOTotal",
      src + "\nreturn { poActualCost, poReceivedQty, _poItemLine, _poHealItems, poVendorBreakdown, poIsClosed };")(
      s => s, p => (p.items || []).reduce((a, it) => a + (Number(it.itemCost) || 0), 0));
  } catch (e) { T("تُبنى دوال الحساب المالي", false, String(e.message).slice(0, 140)); return; }
  T("تُبنى دوال الحساب المالي", typeof M.poActualCost === "function");
  if (typeof M.poActualCost !== "function") return;

  const sumLines = p => Math.round(p.items.filter(it => (Number(it.rcvQty) || 0) > 0)
    .reduce((s, it) => s + M._poItemLine(it, true).total, 0) * 100) / 100;
  const sumVendor = p => Math.round(M.poVendorBreakdown(p).reduce((s, x) => s + x.cost, 0) * 100) / 100;

  // ── طلبات-اختبار من حوادث حقيقية (مكتبة انحدار) ──
  const fixtures = [
    { name: "استلام جزئي + تعديل مسؤول (نمط 0113)", expectActual: 323.55, expectRcv: 18,
      po: { status: "closed", auditedBy: "ن", actualCost: 352.3, vendor: "أ",
        items: [
          { qty: 10, rcvQty: 5, unitCost: 5,     itemCost: 57.5,  vat: 7.5,  vendor: "أ" }, // مخزَّن على المطلوب
          { qty: 4,  rcvQty: 4, unitCost: 21,    itemCost: 96.6,  vat: 12.6, vendor: "أ" },
          { qty: 5,  rcvQty: 5, unitCost: 5.25,  itemCost: 30.2,  vat: 3.95, vendor: "ب" },
          { qty: 2,  rcvQty: 2, unitCost: 38.46, itemCost: 88.46, vat: 11.54, vendor: "ب" },
          { qty: 2,  rcvQty: 2, unitCost: 34.58, itemCost: 79.54, vat: 10.37, vendor: "ب" }
        ] } },
    { name: "عدة سندات لنفس البضاعة (نمط 0091)", expectActual: 487.4, expectRcv: 32,
      po: { status: "closed", auditedBy: "ن", actualCost: 1457.19, receivedQty: 95,
        grnDocs: [{ invoicedTotal: 487.4 }, { invoicedTotal: 487.4 }, { invoicedTotal: 482.39 }],
        items: [
          { qty: 2,  rcvQty: 2,  unitCost: 0, itemCost: 10.01,  vat: 1.31,  vendor: "و" }, // unitCost 0 ⇒ يبقى المخزَّن
          { qty: 3,  rcvQty: 3,  unitCost: 0, itemCost: 44.99,  vat: 5.87,  vendor: "و" },
          { qty: 7,  rcvQty: 7,  unitCost: 0, itemCost: 104.65, vat: 13.65, vendor: "ف" },
          { qty: 10, rcvQty: 10, unitCost: 0, itemCost: 23,     vat: 3,     vendor: "ف" },
          { qty: 6,  rcvQty: 6,  unitCost: 0, itemCost: 34.5,   vat: 4.5,   vendor: "ف" },
          { qty: 1,  rcvQty: 1,  unitCost: 0, itemCost: 149.5,  vat: 19.5,  vendor: "ف" },
          { qty: 3,  rcvQty: 3,  unitCost: 0, itemCost: 120.75, vat: 15.75, vendor: "ف" }
        ] } }
  ];
  for (const f of fixtures) {
    const a = M.poActualCost(f.po);
    T(`${f.name}: التكلفة الفعلية`, a === f.expectActual, `الناتج ${a} المتوقّع ${f.expectActual}`);
    T(`${f.name}: الكمية المستلمة`, M.poReceivedQty(f.po) === f.expectRcv, `الناتج ${M.poReceivedQty(f.po)}`);
    // ★ الثلاثيّة المتطابقة — المصدر الواحد يضمنها
    T(`★ ${f.name}: التكلفة = Σ البنود = Σ الموردين`,
      a === sumLines(f.po) && a === sumVendor(f.po),
      `فعلي ${a} / بنود ${sumLines(f.po)} / موردين ${sumVendor(f.po)}`);
  }

  // ★ ثابت جوهري: تكلفة البند لا تعتمد الكمية المطلوبة أبداً (مطلوب 100، مستلم 3)
  T("★ تكلفة البند من المستلَم لا المطلوب دائماً",
    M._poItemLine({ qty: 100, rcvQty: 3, unitCost: 10, itemCost: 1150, vat: 150 }, true).total === 34.5);

  // ── حارس مصدري: منع عودة «الحساب المبعثر» خارج الدوال المعتمدة ──
  T("★ عرض تكلفة البند (تفاصيل الطلب) يمرّ عبر _poItemLine",
    HTML.includes("_poItemLine(item,hasAudit)"));
  T("★ عرض تكلفة البند (PDF) يمرّ عبر _poItemLine",
    HTML.includes("_poItemLine(it,hasAudit)"));
  T("★ تجميع التكلفة الفعلية يمرّ عبر _poItemLine",
    HTML.includes("s += _poItemLine(it,true).total"));
  T("★ توزيع الموردين يمرّ عبر _poItemLine",
    HTML.includes("_poItemLine(it,true).total;   // v18.9tl"));
  T("لا يُجمع actualCost من السندات مباشرةً (خارج fallback الاشتقاق)",
    !HTML.includes('actualCost     = _waSumGrn(pCurrent, "invoicedTotal")'));
  T("مسار تعديل المسؤول يحسب على المستلَم للمُدقَّق (paeCalcItem)",
    HTML.includes("(_paeAudited && _paeItems[i] && _paeItems[i].rcvQty!=null)"));

  // ── v18.9tm: تطبيع البنود عند التحميل يشفي كل ما يقرأ it.itemCost مباشرةً ──
  // (بطاقة القائمة، getPOTotal، تعبئة التكلفة...) فلا يبقى موضعٌ يعرض المخزَّن الخاطئ.
  if (typeof M._poHealItems === "function") {
    const po = { auditedBy: "ن", items: [
      { qty: 10, rcvQty: 5, unitCost: 5, itemCost: 57.5, vat: 7.5 },   // خاطئ (على المطلوب)
      { qty: 4, rcvQty: 4, unitCost: 21, itemCost: 96.6, vat: 12.6 }    // سليم
    ] };
    M._poHealItems(po);
    T("★ التطبيع يشفي itemCost المخزَّن الخاطئ (57.5→28.75)", po.items[0].itemCost === 28.75);
    T("التطبيع لا يمسّ البند السليم", po.items[1].itemCost === 96.6);
    T("★ بعد التطبيع: Σ itemCost المباشر = التكلفة الفعلية",
      Math.round(po.items.reduce((s, it) => s + it.itemCost, 0) * 100) / 100 === M.poActualCost(po));
    // الطلب غير المُدقَّق لا يُمسّ (التقدير يبقى)
    const est = { items: [{ qty: 10, rcvQty: 5, unitCost: 5, itemCost: 57.5, vat: 7.5 }] };
    M._poHealItems(est);
    T("التطبيع لا يمسّ الطلب غير المُدقَّق", est.items[0].itemCost === 57.5);
  }
  // حارس: مسارا تحميل الطلبات يستدعيان التطبيع
  T("★ تحميل الطلبات يطبّع البنود (_poHealItems) — المسار الأولي والحيّ",
    (HTML.match(/return _poHealItems\(_o\);/g) || []).length >= 2);

  // ── v18.9tn — C1: الاستلام على دفعات لبنود مختلفة ──
  // حارس مصدري: التدقيق لا يدهس بند جلسةٍ سابقة بأصفار الجلسة الحالية.
  T("★ C1: التدقيق يحفظ بند الجلسة السابقة (لا يدهسه بصفر الجلسة الحالية)",
    HTML.includes("(Number(a.rcvQty)||0) <= 0 && (Number(it.rcvQty)||0) > 0) return it"));
  // سلوكي: طلبٌ استُلم على جلستين (A ثم B) — بعد الحارس p.items يحمل الاثنين،
  // فالتكلفة/الكمية = مجموعهما لا آخر جلسة وحدها.
  const poMulti = { status: "closed", auditedBy: "ن", actualCost: 1150, receivedQty: 5,
    items: [
      { qty: 10, rcvQty: 10, unitCost: 100, itemCost: 1150, vat: 150 },  // استُلم جلسة 1 (محفوظ بالحارس)
      { qty: 10, rcvQty: 10, unitCost: 100, itemCost: 1150, vat: 150 }   // استُلم جلسة 2
    ] };
  T("★ C1: التكلفة الفعلية = مجموع بنود الجلستين لا آخر جلسة",
    M.poActualCost(poMulti) === 2300, "الناتج: " + M.poActualCost(poMulti));
  T("★ C1: الكمية المستلمة = مجموع الجلستين", M.poReceivedQty(poMulti) === 20);

  // ── v18.9to — H3: اصطلاح ض.ق.م موحّد على «الوحدة» في التدقيق (مطابق _poItemLine والفاتورة) ──
  T("★ H3: التدقيق يحسب ض.ق.م على الوحدة (total=round((unit+vatUnit)×rcv))",
    HTML.includes("Math.round((unitPrice+_vatUnit)*rcvQty*100)/100"));
  T("★ H3: زال اصطلاح net×0.15 من تخزين التدقيق",
    !HTML.includes("const vat   = Math.round(net*0.15*100)/100"));
  T("★ H3: net مقرَّب في التدقيق (لا تسرّب عائم — L7)",
    HTML.includes("const net   = Math.round(rcvQty * unitPrice * 100)/100"));
  // سلوكي: اصطلاح الوحدة يطابق فاتورة المورد (بخاخ 13.04×3 ⇒ 45.00 لا 44.99)
  T("★ H3: تكلفة البند = فاتورة المورد (بخاخ 13.04×3 ⇒ 45.00)",
    M._poItemLine({ rcvQty: 3, unitCost: 13.04, itemCost: 45, vat: 5.88 }, true).total === 45);

  // ── v18.9tp — H2 + H4: حارسا تدقيق الاستلام ──
  T("★ H2: يُمنع الإغلاق ببندٍ مستلَم بسعر وحدة صفر (lumpSum لا يختفي)",
    HTML.includes('_waVal("wa-rcv-qty",i) > 0 && _waVal("wa-unit-price",i) <= 0') &&
    HTML.includes("فلن تُحتسب تكلفتها"));
  T("★ H4: يُمنع نقص التوزيع (المستلَم > المستودع + المباشر)",
    HTML.includes("rcv - (stock + direct) > 0.001") && HTML.includes("distShort"));

  // ── v18.9tq — H5: عكس المخزون يخصم من الوثيقة المكتوبة فعلاً لا itemId الخام ──
  T("★ H5: الاستلام يخزّن معرّف وثيقة المخزون المكتوبة (_stockDocId)",
    HTML.includes("it._stockDocId = _canonId"));
  T("★ H5: المراجعة تخزّن معرّف الوثيقة المسحوب منها (_fromStockDocId)",
    HTML.includes("_fromStockDocId: fromStockRow.invId"));
  T("★ H5: عكس استلام المستودع يخصم مقابل _stockDocId (وإلا itemId للقديم)",
    HTML.includes("const _did = it._stockDocId || it.itemId;") && HTML.includes("_bump(_did, it.itemName, it.unit)"));
  T("★ H5: عكس سحب المراجعة يعود إلى _fromStockDocId",
    HTML.includes("const _did = it._fromStockDocId || it.itemId;"));

  // ── v18.9tr — H6: مصالحة المالية (المطلوب سداده = الفعلي؛ القديم يُقرأ كـ estCost) ──
  {
    const fs = HTML.indexOf("function _poFinanceTotal(");
    const fe = HTML.indexOf("\nfunction _poFinanceFilterAll", fs);
    let F = null;
    if (fs >= 0 && fe > fs) {
      try {
        F = new Function("poActualCost", "getPOTotal",
          HTML.slice(fs, fe) + "\nreturn { _poFinanceTotal, _poPaidSoFar, _poRemaining, _poOverpaid };")(
          p => p.auditedBy ? (Number(p.actualCost) || 0) : (Number(p.estCost) || 0),
          p => Number(p.estCost) || 0);
      } catch (e) { T("تُبنى دوال المالية", false, String(e.message).slice(0, 120)); }
    }
    T("تُبنى دوال المالية", !!F);
    if (F) {
      // قديم: قُدِّر 10000 وسُدِّد بالكامل (بلا مصفوفة)، ثم الفعلي 9300
      const po = { auditedBy: "ن", actualCost: 9300, estCost: 10000, payment: { paid: true } };
      T("★ H6: المطلوب سداده = الفعلي (فاتورة المورد)", F._poFinanceTotal(po) === 9300);
      T("★ H6: القديم المسدَّد يُقرأ كـ estCost لا الفعلي الحالي", F._poPaidSoFar(po) === 10000);
      T("★ H6: زيادة تُستردّ = مُسدَّد − فعلي", F._poOverpaid(po) === 700 && F._poRemaining(po) === 0);
      // على دفعات: المسدَّد = مجموع الدفعات
      const po2 = { auditedBy: "ن", actualCost: 5000, estCost: 5000, payment: { installments: [{ amount: 2000 }, { amount: 1500 }] } };
      T("★ H6: المسدَّد = مجموع الدفعات، والمتبقّي فرقها", F._poPaidSoFar(po2) === 3500 && F._poRemaining(po2) === 1500);
      // نقص: الفعلي أكبر من المسدَّد
      const po3 = { auditedBy: "ن", actualCost: 11000, estCost: 10000, payment: { paid: true } };
      T("★ H6: نقص يُستكمل (المتبقّي = فعلي − مُسدَّد)", F._poRemaining(po3) === 1000 && F._poOverpaid(po3) === 0);
    }
    T("★ H6: مؤشّر «زيادة تُستردّ» في تفاصيل الطلب", HTML.includes("_poOverpaid(p)>0.01") && HTML.includes("زيادة تُستردّ"));
  }

  // ── v18.9ts — تنظيف منخفض (L7/L9/L10/L11) ──
  T("L7: تقريب estCost عند إنشاء الطلب (لا تسرّب عائم)",
    HTML.includes("Math.round(currentPurchaseItems.reduce((s,item)=>s+(item.itemCost||0),0)*100)/100"));
  // v18.9wx: نُقل الشرط إلى _sameItem داخل _waPrevRcv (بحث الهوية عند انزياح الفهرس) — والسُّلَّم كما هو.
  T("L9: _waPrevRcv يطابق بالكود قبل الاسم للبند الحرّ",
    HTML.includes("if(gi.itemCode && it && it.itemCode) return String(gi.itemCode).trim() === String(it.itemCode).trim();"));
  T("L10: تكلفة بطاقة القائمة بمنزلتين (تطابق التفاصيل)",
    HTML.includes('display:inline-block">${sum.toLocaleString("en-US",{maximumFractionDigits:2})}</span> ر.س'));

  // ── v18.9tt — L8: بندان لنفس صنف المخزون (توافر تراكمي + خصم مُجمَّع + وسم بـ origIdx) ──
  T("★ L8: التوافر تراكمي (_remainByInv — كل بند يأخذ من المتبقّي)",
    HTML.includes("const _remainByInv = new Map();") &&
    HTML.includes("_remainByInv.has(_iid) ? _remainByInv.get(_iid) : _fullQty"));
  T("★ L8: الخصم مُجمَّع بـ invId لا «أوّل بند فقط»",
    HTML.includes("const _invAgg = new Map();") && !HTML.includes("if(_seenInvIds.has(e.invId)) return false;"));
  T("★ L8: الوسم لكل بند بـ origIdx لا بالاسم",
    HTML.includes("stockRows.find(e => e.origIdx === _i)") && HTML.includes("procRows.find(e => e.origIdx === _i)"));
  // سلوكي: محاكاة الخوارزمية — رصيد 10، بندان يحتاجان 7 و6 من نفس الصنف
  {
    const balance = 10, needs = [7, 6];
    const remain = new Map(); remain.set("X", balance);
    const took = needs.map(req => {
      const avail = remain.get("X");
      const fs = Math.min(avail, req);
      remain.set("X", Math.round((avail - fs) * 1000) / 1000);
      return fs;
    });
    T("★ L8: مجموع المسحوب ≤ الرصيد (لا وعدٌ زائد)", took[0] + took[1] <= balance && took[0] === 7 && took[1] === 3);
    const agg = took.reduce((s, x) => s + x, 0);
    T("★ L8: الخصم المُجمَّع = المسحوب فعلاً (لا ناقص ولا زائد)", agg === 10);
  }
}

/* ════════════════════════════════════════════════════════════════════
   16) تكاليف المشاريع المُدخَلة يدوياً — تدخل كل الحسابات والمؤشّرات (v18.9sz)
       مصدرٌ واحدٌ لتصنيف «المشروع اليدوي» (poIsCustomProject) وتسميته
       (poProjectDisplayName)، والتحويل من طلب تسعير يحافظ على الشكل القياسي.
   ════════════════════════════════════════════════════════════════════ */
function manualProjectCosts() {
  H("16) تكاليف المشاريع اليدوية في كل الحسابات");

  // ── poIsCustomProject: العلَم أو __OTHER__ (لا __OTHER__ وحده) ──
  const a = HTML.indexOf("function poIsCustomProject(p){");
  if (a < 0) { T("poIsCustomProject موجودة في index.html", false, "لم تُعثر"); return; }
  const srcA = HTML.slice(a, HTML.indexOf("\nfunction ", a + 10));
  let isCustom;
  try { isCustom = new Function(srcA + "\nreturn poIsCustomProject;")(); }
  catch (e) { T("تُبنى poIsCustomProject", false, String(e.message).slice(0, 120)); return; }
  T("تُبنى poIsCustomProject", typeof isCustom === "function");
  T("يدوي بالعلَم isCustomProject", isCustom({ isCustomProject: true, projectId: "" }) === true);
  T("يدوي بسنتينل __OTHER__", isCustom({ projectId: "__OTHER__" }) === true);
  T("★ يدوي بالعلَم رغم غياب __OTHER__ (المحوَّل من تسعير)", isCustom({ isCustomProject: true, projectId: "hail" }) === true);
  T("رسمي (معرّف حقيقي) ليس يدوياً", isCustom({ projectId: "hail" }) === false);
  T("projectId فارغ بلا علَم ليس يدوياً (لا يُخلط بـ hail الافتراضي)", isCustom({ projectId: "" }) === false);

  // ── poProjectDisplayName: يدوي بالاسم، رسمي بالمعرّف ──
  const b = HTML.indexOf("function poProjectDisplayName(p){");
  if (b < 0) { T("poProjectDisplayName موجودة", false); }
  else {
    const srcB = HTML.slice(b, HTML.indexOf("\nfunction ", b + 10));
    let dispName;
    try { dispName = new Function("poIsCustomProject", "_getProjName", srcB + "\nreturn poProjectDisplayName;")(isCustom, id => id === "hail" ? "مشروع هايل" : ""); }
    catch (e) { T("تُبنى poProjectDisplayName", false, String(e.message).slice(0, 120)); }
    if (typeof dispName === "function") {
      T("اسم اليدوي من projectName", dispName({ isCustomProject: true, projectName: "فيلا العميل" }) === "فيلا العميل");
      T("★ اليدوي لا يُنسَب لمشروع هايل الافتراضي", dispName({ projectId: "__OTHER__", projectName: "استراحة" }) === "استراحة");
      T("اسم الرسمي من المعرّف", dispName({ projectId: "hail" }) === "مشروع هايل");
    }
  }

  // ── التحويل من طلب تسعير يطبّق الشكل القياسي للمشروع اليدوي ──
  T("طلب التسعير يحمل علَم isCustomProject", HTML.includes('isCustomProject: projVal==="__OTHER__"'));
  T("كشف اليدوي عند التحويل (العلَم أو غياب projectId مع اسم)",
    HTML.includes("const _rfIsCustom = !!(rf.isCustomProject || (!rf.projectId && (rf.projectName||\"\").trim()));"));
  T("★ التحويل يطبّق projectId:__OTHER__ لليدوي", HTML.includes('projectId: _rfIsCustom ? "__OTHER__" : (rf.projectId||"")'));
  T("التحويل يحفظ isCustomProject وprojectName", HTML.includes("isCustomProject: _rfIsCustom,") && HTML.includes("projectName: rf.projectName || projName,"));

  // ── كل شاشات التقرير/التصدير تقرأ المصدر الموحّد (لا __OTHER__ وحده) ──
  T("ملخّص المشروع (شاشة) يستخدم poProjectDisplayName",
    HTML.includes("const pname=poProjectDisplayName(p);   // v18.9sz: المصدر الموحّد (يدوي بالاسم، رسمي بالمعرّف)"));
  T("ملخّص المشروع (PDF) يستخدم poProjectDisplayName",
    HTML.includes("const pname=poProjectDisplayName(p);   // v18.9sz: المصدر الموحّد"));
  T("صفوف تفاصيل التقرير (شاشة+PDF) تستخدم poProjectDisplayName",
    HTML.includes("const pProjName=poProjectDisplayName(p)") && HTML.includes("const pProjName2=poProjectDisplayName(p)"));
  T("★ فلتر التقرير يصنّف اليدوي بالمصدر الموحّد",
    HTML.includes("if(!poIsCustomProject(p)||( p.projectName||\"غير محدد\")!==cname) return false;"));
  T("قائمة مشاريع التقرير تميّز كل يدوي (لا تُنطوى في __OTHER__)",
    HTML.includes("if(poIsCustomProject(p)){   // v18.9sz: المصدر الموحّد — العلَم أو __OTHER__ (كان __OTHER__ وحده)"));

  // ── لوحة المعلومات: «إجمالي المبالغ المغلقة» يجمع كل المغلق بلا بوّابة مشروع ──
  T("إجمالي المبالغ المغلقة يجمع كل الطلبات المغلقة (يشمل اليدوية)",
    HTML.includes("const totalAmount = dashData.filter(poIsClosed).reduce((s,p)=>s+poActualCost(p),0);"));

  // ── مؤشرات الأداء: تميّز كل مشروع يدوي بمفتاحه ──
  if (KPI_SRC) {
    const ksrc = KPI_SRC;
    T("KPI: مصدر موحّد لتصنيف اليدوي", ksrc.includes("function _pkpiIsCustom(p){ return !!p && (p.isCustomProject === true || p.projectId === \"__OTHER__\"); }"));
    T("★ KPI: كل مشروع يدوي بمفتاح __CUSTOM__ منفصل", ksrc.includes('const key="__CUSTOM__:"+(p.projectName||"غير محدد");'));
    T("KPI: الفلتر يميّز اليدوي بالاسم", ksrc.includes("list=list.filter(p=>_pkpiIsCustom(p) && (p.projectName||\"غير محدد\")===cname);"));
  }
}

/* ════════════════════════════════════════════════════════════════════
   17) تقليل احتكاك مستمعي Firestore — المجموعات العامة تُركَّب مرة وتبقى حيّة (v18.9sz)
       يخفّف خلل SDK الداخلي (INTERNAL ASSERTION ca9/b815) بمنع تركيب/فكّ متكرّر
       لمستمعي global_* عند تبديل المشروع/الوضع أو زرّ التحديث.
   ════════════════════════════════════════════════════════════════════ */
function listenerChurn() {
  H("17) تقليل احتكاك مستمعي Firestore (ca9/b815)");
  const slice = (name) => {
    const i = HTML.indexOf("function " + name + "(");
    if (i < 0) return "";
    return HTML.slice(i, HTML.indexOf("\nfunction ", i + 10));
  };

  // ── حراس idempotent على دوال المزامنة العامة (لا تُعيد التركيب إن كان المستمع حيّاً) ──
  T("startPurchaseSync يخرج مبكّراً إن كان _poUnsub حيّاً", slice("startPurchaseSync").includes("if(_poUnsub) return;"));
  T("loadRFQs يخرج مبكّراً إن كان _rfqUnsub حيّاً", slice("loadRFQs").includes("if(_rfqUnsub) return;"));
  T("startIssueOrdersSync يخرج مبكّراً إن كان حيّاً", slice("startIssueOrdersSync").includes("if(_issueOrdersUnsub) return;"));
  T("loadCatalogTypes يخرج مبكّراً إن كان حيّاً", slice("loadCatalogTypes").includes("if(_catTypesUnsub) return;"));
  T("loadItemCatalog حارس idempotent (يحترم onDone)", slice("loadItemCatalog").includes("if(_catalogUnsub){ if(onDone) onDone(); return; }"));
  {
    const inv = slice("startInventorySync");
    T("startInventorySync: المخزون/السجل/المستودعات كلها بحارس !_x", inv.includes("if(!_invUnsub) _invUnsub =") && inv.includes("if(!_invLogUnsub) _invLogUnsub =") && inv.includes("if(!_whUnsub) _whUnsub ="));
    T("★ startInventorySync لم يعد يفكّ ثم يُعيد التركيب", !inv.includes("if(_invUnsub) _invUnsub();"));
  }
  {
    const cus = slice("startCustodySync");
    T("startCustodySync بحارس !_x للعهد والنسخ الموقّعة", cus.includes("if(!_custodyUnsub) _custodyUnsub =") && cus.includes("if(!_custodySignedUnsub) _custodySignedUnsub ="));
  }

  // ── تبديل المشروع لا يفكّ المستمعين العامّين ولا يصفّر بياناتهم ──
  {
    const sw = slice("switchProject");
    T("★ switchProject لا يفكّ مستمع المشتريات (عام)", !sw.includes("_poUnsub"));
    T("★ switchProject لا يفكّ مستمع المخزون (عام)", !sw.includes("_invUnsub"));
    T("switchProject لا يفكّ الكتالوج/التسعير/العهد/أوامر الصرف", !sw.includes("_catalogUnsub") && !sw.includes("_rfqUnsub") && !sw.includes("_custodyUnsub") && !sw.includes("_issueOrdersUnsub"));
    T("switchProject لا يصفّر بيانات المشتريات/المخزون العامة", !sw.includes("purchases = []") && !sw.includes("_inventoryItems = []"));
    T("switchProject ما زال يفكّ المستمعين المرتبطين بالمشروع", sw.includes("_ticketsUnsub(); _ticketsUnsub=null;") && sw.includes("_assetsUnsub(); _assetsUnsub=null;") && sw.includes("_ppmUnsub(); _ppmUnsub=null;"));
    T("switchProject ما زال يصفّر بيانات المشروع", sw.includes("tickets = []; assets = []; ppmPlans = [];"));
  }

  // ── الخروج من الوضع المركزي لا يفكّ المستمعين العامّين ──
  {
    const ex = slice("exitGlobalPurchases");
    T("★ exitGlobalPurchases لا يفكّ المستمعين العامّين", !ex.includes("_poUnsub") && !ex.includes("_invUnsub") && !ex.includes("_rfqUnsub"));
    T("exitGlobalPurchases ما زال يفكّ مستمع الإشعارات المرتبط بالمشروع", ex.includes("_notifUnsub(); _notifUnsub=null;"));
  }

  // ── تسجيل الخروج يفكّ كل شيء (ليُعاد التركيب عند الدخول التالي) ──
  T("★ logout يفكّ المستمعين العامّين (إعادة تركيب عند الدخول)", slice("logout").includes("_poUnsub(); _poUnsub=null;"));
  T("logoutToLogin يفكّ المستمعين العامّين أيضاً", slice("logoutToLogin").includes("_poUnsub(); _poUnsub=null;"));

  // ── «حفظ التحديث» لا يتجمّد إن تجمّد عميل Firestore أو تعثّرت الشبكة (مهلة على القراءة الطازجة) ──
  {
    const upd = slice("doUpdatePurchaseStatus");
    T("★ doUpdatePurchaseStatus يحدّ القراءة الطازجة بمهلة (يمنع تجمّد النافذة)",
      upd.includes("Promise.race([") && upd.includes('new Error("fresh-read-timeout")'));
    T("doUpdatePurchaseStatus يمضي بالنسخة المحلية عند تعذّر القراءة (catch يحرس)",
      upd.includes('catch(e){ console.warn("doUpdatePurchaseStatus: fresh-read error/timeout"'));
  }

  // ── v18.9ub: إتمام §17 لمستمعَي إشعارات سطح المكتب (HailNotify) ──
  {
    const hn = slice("startHailNotifications");
    // مستمع طلبات الشراء (global_purchases — عام): يُركَّب مرة واحدة، لا يُفكّ ويُعاد التركيب مع كل استدعاء
    T("★ startHailNotifications: مستمع طلبات الشراء (عام) بحارس idempotent (!_hnPOUnsub)",
      hn.includes("if(!_hnPOUnsub){") && hn.includes("_hnPOUnsub = db.collection(PURCHASES_COLLECTION())"));
    T("★ لم يعد يفكّ مستمع طلبات الشراء العام مع كل استدعاء",
      !hn.includes("if(_hnPOUnsub){ _hnPOUnsub(); _hnPOUnsub=null; }"));
    // مستمع البلاغات (مرتبط بالمشروع): يُعاد تركيبه فقط عند تغيّر المشروع فعلاً
    T("★ مستمع البلاغات يُعاد تركيبه فقط عند تغيّر المشروع (_hnTicketsProjKey)",
      hn.includes("_hnTicketsProjKey === _hnProjKey") && hn.includes("_hnTicketsProjKey = _hnProjKey;"));
  }
  // كلا المستمعَين يُفكّان عند الخروج (ليُعاد تركيبهما نظيفَين للجلسة التالية)
  T("★ logout يفكّ مستمعَي HailNotify (idempotent)",
    slice("logout").includes("_hnTicketsUnsub(); _hnTicketsUnsub=null; _hnTicketsProjKey=null;") &&
    slice("logout").includes("_hnPOUnsub(); _hnPOUnsub=null;"));
  T("logoutToLogin يفكّ مستمعَي HailNotify أيضاً",
    slice("logoutToLogin").includes("_hnTicketsUnsub(); _hnTicketsUnsub=null; _hnTicketsProjKey=null;") &&
    slice("logoutToLogin").includes("_hnPOUnsub(); _hnPOUnsub=null;"));

  // ── v18.9ub: تحديث وقائي للجلسات الطويلة على الأجهزة الدائمة التشغيل ──
  // يعالج «الجهاز المحدّد» جذرياً: يُصفّر عدّاد targetId بإعادة تحميلٍ صامتٍ عند طول العمر + غياب المستخدم.
  T("★ index.html يحوي التحديث الوقائي (visibilitychange + عمر الجلسة)",
    HTML.includes("_installPreventiveReload") && HTML.includes('addEventListener("visibilitychange"') &&
    HTML.includes("MAX_UPTIME_MS") && HTML.includes("window._bootT0"));
  T("★ التحديث الوقائي يُطلَق فقط والتبويب مخفيّ (لا يقطع عملاً ظاهراً)",
    HTML.includes("if(!document.hidden){ _armed = false; return; }") &&
    HTML.includes("if(document.hidden){ try{ location.reload();"));
  T("التحديث الوقائي محروسٌ بوجود Firestore وبعدم إطلاقٍ مزدوج",
    HTML.includes('if(typeof db==="undefined" || !db) return;') && HTML.includes("if(_armed) return;"));

  // ── v18.9vo: كسر حلقة انهيار Firestore عند المنبع (STATUS_ACCESS_VIOLATION) ──
  // خلل الـ SDK يُبقي تيّار Watch يرمي assertion كل ~ثانية؛ terminate فوري يوقف التدفّق
  // فلا يتراكم استهلاك الموارد حتى ينهار التبويب، ثم يتكفّل _fsAutoRecover بإعادة التحميل.
  T("★ vo: _fsHardHalt يُنهي عميل Firestore فوراً (terminate) لكسر تدفّق الـ assertion",
    HTML.includes("function _fsHardHalt()") &&
    /_fsHardHalt\(\)\{\s*if\(_fsHalted\) return;\s*_fsHalted = true;/.test(HTML) &&
    HTML.includes('typeof db.terminate === "function") db.terminate().catch('));
  T("★ vo: أول INTERNAL ASSERTION يُستدعى فيه _fsHardHalt قبل _fsAutoRecover",
    HTML.includes('if(m.indexOf("INTERNAL ASSERTION FAILED") !== -1){ _fsHardHalt(); _fsAutoRecover(); return; }'));
  T("★ vo: بعد الـ halt يُبتلَع تدفّق الـ assertion المتتالي صامتاً (لا تسجيل/تعافٍ متكرّر)",
    HTML.includes('if(_fsHalted && m.indexOf("INTERNAL ASSERTION FAILED") !== -1) return;'));
  T("vo: علَم _fsHalted معرَّف ويعمل مرّةً واحدة",
    HTML.includes("var _fsHalted = false;") && HTML.includes("if(_fsHalted) return;"));
}

/* ════════════════════════════════════════════════════════════════════
   18) ملف الفاتورة — مصدره المستودع فقط، وبلا اسم مورد مقترح (v18.9sz)
       رفع المشتريات للفاتورة يبقى في «المرفقات» فقط؛ «ملف الفاتورة» يسجّله
       المستودع عند التدقيق. ولا يُكتب اسم المورد بجانب الفاتورة (قد يختلف المورّد الفعلي).
   ════════════════════════════════════════════════════════════════════ */
function invoiceFileSource() {
  H("18) ملف الفاتورة — مصدره المستودع فقط");
  const slice = (name) => {
    const i = HTML.indexOf("function " + name + "(");
    if (i < 0) return "";
    return HTML.slice(i, HTML.indexOf("\nfunction ", i + 10));
  };

  // ── لا اسم مورد بجانب ملف الفاتورة في بطاقة تفاصيل الطلب ──
  T("★ بطاقة «ملف الفاتورة» لا تعرض اسم المورد (قد يكون المورّد الفعلي مختلفاً)",
    !HTML.includes('${_ic("store","ic-sm ic-muted")} ${esc(v.vendor)}'));
  T("بطاقة «ملف الفاتورة» ما زالت تعرض رقم الفاتورة والسند",
    HTML.includes("رقم الفاتورة: <b style=\"font-family:'JetBrains Mono',monospace\">${esc(v.invoiceNo)}</b>") && HTML.includes("السند: <b"));

  // ── رفع المشتريات للفاتورة → المرفقات فقط، لا «ملف الفاتورة» ──
  {
    const dnw = slice("doNotifyWarehouse");
    T("★ doNotifyWarehouse لا يكتب p.invoicePhotoUrl (لا يصبح «ملف الفاتورة»)", !dnw.includes("p.invoicePhotoUrl = att.url"));
    T("doNotifyWarehouse يحفظ الفاتورة في المرفقات", dnw.includes("p.attachments.push(att)"));
    T("doNotifyWarehouse يوسم مرفق المشتريات بوضوح", dnw.includes('att.label = "فاتورة المورد — مرفوعة من المشتريات (مرجع)"'));
    T("★ doNotifyWarehouse لا يُدخل المورّد (يسجّله المستودع)", !dnw.includes("p.actualVendor = vendor"));
    T("نافذة إشعار المستودع أزالت حقل «المورد الفعلي»", !HTML.includes('id="nw-vendor"'));
  }

  // ── «ملف الفاتورة» الرسمي ما زال يُشتق من سندات المستودع (grnDocs) ──
  T("p.invoices تُشتق من grnDocs (رفع المستودع)",
    HTML.includes("pCurrent.invoices = (pCurrent.grnDocs||[]).map(g=>({ grnRef:g.grnRef, invoiceNo:g.invoiceNo||\"\", vendor:g.vendor||\"\", at:g.createdAt||\"\", photoUrl:g.invoicePhotoUrl||\"\" }))"));
  T("سند الاستلام يحمل فاتورته من نموذج التدقيق (v.photoUrl)",
    HTML.includes("invoicePhotoUrl: v.photoUrl, // v18.9nr"));

  // ── v18.9ua: إعادة استخدام فاتورة المشتريات في التدقيق (بلا إعادة رفع/تكرار) ──
  // ملاحظة: slice المحلّية هنا توقيعها slice(name) — تقتطع جسم دالة بالاسم.
  {
    const owa = slice("openWarehouseAudit");
    T("★ openWarehouseAudit يجمع فاتورة المشتريات وأيّ مرفق عام كمرشّحات (مهما كان مسار الرفع)",
      owa.includes('a.kind==="proc_invoice"') && owa.includes('a.kind==="attachment" || !a.kind') && owa.includes("_waProcInvoices.push"));
    T("openWarehouseAudit يشمل فاتورة الطلب القديمة (invoicePhotoUrl) كمرشّح للطلب بلا سندات",
      owa.includes('!((p.grnDocs||[]).length) && p.invoicePhotoUrl'));
    T("★ openWarehouseAudit يشمل فواتير السندات السابقة (grnDocs) للاستلام على مراحل",
      owa.includes('(Array.isArray(p.grnDocs)?p.grnDocs:[]).forEach') &&
      owa.includes('g.invoicePhotoUrl') && owa.includes('فاتورة سند سابق') &&
      owa.includes('invoiceNo:g.invoiceNo'));
    T("★ الاستلام على مراحل: فاتورة السند السابق الوحيدة تُختار تلقائياً (مرفوعة ومختارة)",
      owa.includes("_uniqPrev.length === 1") && owa.includes("onWaInvReuseChange(_sel)") &&
      owa.includes("مرفوعة بالفعل ومختارة") && owa.includes("x.c.fromGrn"));
    T("openWarehouseAudit يُحسب المرشّحات قبل رسم بطاقات الفاتورة (waRenderInvoices)",
      owa.indexOf("_waProcInvoices = []") >= 0 &&
      owa.indexOf("_waProcInvoices = []") < owa.indexOf("waRenderInvoices()"));
    T("★ openWarehouseAudit يُعبّئ رقم الفاتورة مسبقاً من رقم المشتريات (p.invoice) قابلاً للتعديل",
      owa.includes("_waN0.value.trim() && p.invoice"));

    // بطاقة الفاتورة تعرض منتقي إعادة الاستخدام حين توجد مرشّحات
    const card = slice("_waInvCardHtml");
    T("بطاقة الفاتورة تعرض منتقي «إعادة استخدام فاتورة المشتريات» عند وجود مرشّحات",
      card.includes("wa-inv-reuse") && card.includes("onWaInvReuseChange") && card.includes("_waProcInvoices.length"));

    // التجميع يقرأ رابط الفاتورة المُعاد استخدامه (نصّ فريد في index.html)
    T("★ تجميع الفواتير يقرأ reuseUrl من منتقي المشتريات",
      HTML.includes(".wa-inv-reuse[data-uid=") && HTML.includes("reuseUrl  : (()=>{"));

    // التحقّق يقبل reuseUrl كمصدر للفاتورة بلا رفع ملف (نصّ فريد)
    T("★ التدقيق يقبل الفاتورة المُعاد استخدامها (reuseUrl) بلا إلزام رفع ملف",
      HTML.includes("let inh = v.reuseUrl") && HTML.includes("if(!inh && _isFirstGrn && activeInvs.length===1) inh = p.invoicePhotoUrl"));

    // معالج الاختيار: يُلغي رفع ملف جديد ويُعبّئ الرقم من المرشّح
    const reuseFn = slice("onWaInvReuseChange");
    T("onWaInvReuseChange يستعمل نفس الملف (لا يرفع) ويعبّئ الرقم إن كان فارغاً",
      reuseFn.includes("_waProcInvoices[parseInt(sel.value,10)]") && reuseFn.includes("!noInput.value.trim() && c && c.invoiceNo"));
    T("رفع ملف جديد يُلغي اختيار إعادة الاستخدام (لا مصدران معاً)",
      slice("onWaInvoiceFileChange").includes('_reuseSel.value=""'));
  }

  // ── v18.9ua: توحيد كاتب «ملف الفاتورة» — إخفاء الرفع المستقل الذي يكتب invoicePhotoUrl خارج grnDocs ──
  T("★ صفّ الرفع المستقل (pu-invoice-photo) مُخفى دائماً — التدقيق هو المصدر الوحيد",
    HTML.includes('if(_invPhotoRow)  _invPhotoRow.style.display  = "none";') &&
    !HTML.includes('_invPhotoRow.style.display  = atAuditClose ? "" : "none"'));
}

/* ════════════════════════════════════════════════════════════════════
   19) بطاقة «الطلبات المغلقة» — عددٌ ولونٌ وفلترٌ للطلبات المغلقة (v18.9sz)
       كانت «معتمدة هذا الشهر»؛ صارت تحسب عدد الطلبات المغلقة (poIsClosed)
       بأيقونة القفل، ونقرُها يفلتر القائمة على المرحلة المغلقة.
   ════════════════════════════════════════════════════════════════════ */
function closedOrdersCard() {
  H("19) بطاقة «الطلبات المغلقة»");
  const i = HTML.indexOf('id="po-dash-approved-box"');
  const tile = i >= 0 ? HTML.slice(i, HTML.indexOf("</div>", HTML.indexOf('class="st-lbl"', i)) + 6) : "";
  T("★ العنوان صار «الطلبات المغلقة» (لا «معتمدة هذا الشهر»)",
    tile.includes(">الطلبات المغلقة<") && !tile.includes("معتمدة هذا الشهر"));
  T("تستخدم أيقونة القفل (مغلق)", tile.includes('<path d="M7 11V7a5 5 0 0 1 10 0v4"/>'));
  T("نقرُ البطاقة يفلتر على المرحلة المغلقة", tile.includes(`onclick="_poStageFilter('closed')"`));

  // العدّاد = الطلبات المغلقة فعلياً (poIsClosed) — نفس تعريف بطاقة المبالغ المغلقة
  T("★ العدّاد = عدد الطلبات المغلقة (poIsClosed)",
    HTML.includes("const closedCount = dashData.filter(poIsClosed).length;") &&
    HTML.includes('setEl("po-dash-approved", closedCount);'));
  T("إبراز البطاقة عند تفعيل فلتر المغلقة",
    HTML.includes('apBox.classList.toggle("tile-active-filter", _pfStatus==="_stage_closed")'));
}

/* ════════════════════════════════════════════════════════════════════
   20) بطاقة «بنود أُضيفت عند الاستلام» — للمسؤول فقط، وتختفي بعد البتّ (v18.9sz)
   ════════════════════════════════════════════════════════════════════ */
function extrasCardGating() {
  H("20) بطاقة البنود المُضافة عند الاستلام");
  const i = HTML.indexOf("function renderExtrasCard(");
  const fn = i >= 0 ? HTML.slice(i, HTML.indexOf("\nfunction ", i + 10)) : "";
  T("★ لا تظهر إلا للمسؤول (الأدمن وحده)",
    fn.includes('if(!isAdmin()){ card.style.display="none"'));
  T("★ تختفي بعد البتّ — تُخفى عند غياب المعلّق (افتراضياً)",
    fn.includes('if(!_xCardAll && !pend.length){ card.style.display="none"'));
  T("الافتراضي يعرض المعلّق فقط (لا يرتدّ لعرض المبتوت)",
    fn.includes("const show = _xCardAll ? all : pend;") &&
    !fn.includes("_xCardAll ? all : (pend.length ? pend : all)"));
}

/* ════════════════════════════════════════════════════════════════════
   21) تعديل المسؤول لطلب الشراء لا يُخرجه من مساره — قائمة الحالة من PO_STATUS (v18.9sz)
   ════════════════════════════════════════════════════════════════════ */
function adminEditKeepsStatus() {
  H("21) تعديل المسؤول لا يُخرج الطلب من مساره");
  const i = HTML.indexOf("function openAdminEditPurchase(");
  const fn = i >= 0 ? HTML.slice(i, HTML.indexOf("\nfunction ", i + 10)) : "";
  T("★ قائمة الحالة تُبنى من المصدر الموحّد PO_STATUS",
    fn.includes("Object.keys(PO_STATUS).map(k=>`<option value=\"${esc(k)}\">${esc(PO_STATUS[k])}</option>`)"));
  T("★ الحالة الحالية (المطبَّعة) تُضبط ومحفوظة",
    fn.includes("const _paeCur = normalizePOStatus(p.status) || \"pending_pm\";") &&
    fn.includes("paeStatusSel.value = _paeCur;"));
  T("لم تعد تُضبط قيمة الحالة على قائمة قديمة (p.status||new_request)",
    !fn.includes('document.getElementById("pae-status").value     = p.status||"new_request";'));
  // قائمة pae-status في الـ HTML فارغة (تُبنى ديناميكياً) — لا خيارات ثابتة قديمة داخلها
  T("★ قائمة pae-status فارغة في الـ HTML (تُملأ من PO_STATUS)",
    HTML.includes('<select class="form-select" id="pae-status"></select>'));
}

/* ════════════════════════════════════════════════════════════════════
   21ب) v18.9wx — الفهرس ليس هوية: اصطفاف صفوف التدقيق/السند على البنود
        الجذر: نافذة تعديل المسؤول تكتب pf.items بلا لمس auditItems، فحذف
        بندٍ من طلبٍ مُدقَّق يزيح كل ما بعده صفّاً واحداً — فيُقارَن سعر البند
        بتقدير جاره («ديانه رمل» 140 من الكتالوج تظهر «تغيّرت من 14.79»،
        وبندٌ أُضيف عند الاستلام يظهر «تغيّر سعره» وهو لم يكن في الطلب)،
        ويقرأ _waPrevRcv صفَّ غيره فيُصفّر المستلَم السابق ويتضاعف الرصيد.
   ════════════════════════════════════════════════════════════════════ */
function auditRowAlignment() {
  H("21ب) اصطفاف صفوف التدقيق على بنود الطلب بالهوية لا بالفهرس");

  const ka = HTML.indexOf("function _poItemKey(");
  const kb = HTML.indexOf("\nfunction _poItemsActual(", ka);
  const pa = HTML.indexOf("function _waPrevRcv(");
  const pb = HTML.indexOf("\nfunction _waSumGrn(", pa);
  let M = null;
  if (ka >= 0 && kb > ka && pa >= 0 && pb > pa) {
    try {
      M = new Function(HTML.slice(ka, kb) + "\n" + HTML.slice(pa, pb) +
        "\nreturn {_poItemKey,_poAlignRows,_poAuditRows,_waPrevRcv};")();
    } catch (e) { T("تُبنى دوال الاصطفاف", false, String(e.message).slice(0, 120)); }
  }
  T("تُبنى دوال الاصطفاف (_poItemKey/_poAlignRows/_poAuditRows/_waPrevRcv)", !!M);
  if (!M) return;

  // ── سُلَّم الهوية: itemId ثم الكود ثم الاسم (نفس سُلَّم _waPrevRcv) ──
  T("الهوية: itemId يسبق الكود يسبق الاسم",
    M._poItemKey({ itemId: "A", itemCode: "X", itemName: "ن" }) === "id:A" &&
    M._poItemKey({ itemCode: "X", itemName: "ن" }) === "cd:X" &&
    M._poItemKey({ itemName: "ن" }) === "nm:ن" &&
    M._poItemKey({}) === "");

  // ── محاكاة PO-202608-0130 حرفياً ──
  // بنود الطلب المُدقَّق قبل تدخّل المسؤول (٥ بنود + بندٌ أُضيف عند الاستلام)
  const row = (id, code, name, est, act) => ({
    itemId: id, itemCode: code, itemName: name,
    estUnitCost: est, unitCost: act, unitPrice: act
  });
  const A = row("A", "BLDG-555", "غراء الجزيرة", 41, 40.87);
  const B = row("B", "", "بلدورة 90 سم", 14, 14);
  const Z = row("Z", "BLDG-900", "بلدورة زراعة", 0, 0);      // البند الذي حذفه المسؤول
  const C = row("C", "BLDG-024", "اسمنت اسود", 14.79, 14.79);
  const D = row("D", "BLDG-575", "ديانه رمل", 140, 140);      // سعر الكتالوج = سعر الفاتورة
  const E = row("E", "BLDG-692", "بردورة اسمنتي", 10, 10);    // بندٌ مضاف عند الاستلام
  const auditItems = [A, B, Z, C, D, E].map(x => ({ ...x }));
  const items = [A, B, C, D, E].map(x => ({ ...x }));          // بعد حذف «بلدورة زراعة»
  const rows = M._poAuditRows({ items, auditItems });

  T("★ الانزياح موجودٌ فعلاً بالفهرس الخام (تكرار العطل الأصلي)",
    auditItems[3].estUnitCost === 14.79 && auditItems[4].estUnitCost === 140);
  T("★ الاصطفاف بالهوية يعيد لكل بندٍ صفَّه هو",
    rows.length === 5 && rows.every((r, i) => r && r.itemId === items[i].itemId));
  T("★ «ديانه رمل» تُقارَن بتقديرها 140 لا بتقدير جارها 14.79",
    rows[3].estUnitCost === 140);
  T("★ البند المضاف عند الاستلام يُقارَن بتقديره هو لا بسعر البند السابق",
    rows[4].estUnitCost === 10);

  // البادج نفسه: نُعيد معادلة _estUnit/_priceChanged من index.html على الصفوف المصطفّة
  const badge = (item, r) => {
    const est = parseFloat(
      (r && r.estUnitCost != null) ? r.estUnitCost
        : (item.estUnitCost != null) ? item.estUnitCost
          : (r ? r.unitCost : 0)) || 0;
    return est > 0 && item.unitCost > 0 && Math.abs(item.unitCost - est) > 0.001;
  };
  T("★ لا «تغيّر سعر» على بندٍ لم يتغيّر سعره (ديانه رمل/البردورة/الاسمنت)",
    !badge(items[2], rows[2]) && !badge(items[3], rows[3]) && !badge(items[4], rows[4]));
  T("★ التغيّر الحقيقي يبقى ظاهراً (غراء: 41 ← 40.87)", badge(items[0], rows[0]));

  // بندان لنفس الصنف في طلبٍ واحد — الفهرس يحسم، لا يلتهم الأول صفَّ الثاني
  {
    const it2 = [{ itemId: "S", qty: 5 }, { itemId: "S", qty: 7 }];
    const ai2 = [{ itemId: "S", rcvQty: 5 }, { itemId: "S", rcvQty: 7 }];
    const r2 = M._poAlignRows(it2, ai2);
    T("★ بندان لنفس الصنف: كلٌّ على صفّه (لا التهام)",
      r2[0].rcvQty === 5 && r2[1].rcvQty === 7);
  }
  // بندٌ أُضيف بعد التدقيق: لا صفَّ له ⇒ null (لا صفّ جارٍ مُستعار)
  T("بندٌ بلا صفّ تدقيق يُرجع null لا صفَّ غيره",
    M._poAlignRows([{ itemId: "NEW" }], [{ itemId: "OLD" }])[0] === null);

  // ── _waPrevRcv: سندٌ مُوقَّع سابقاً انزاح عنه ترتيب p.items ──
  const grn = { items: [
    { itemId: "A", itemCode: "BLDG-555", itemName: "غراء الجزيرة", rcvQty: 15 },
    { itemId: "B", itemCode: "", itemName: "بلدورة 90 سم", rcvQty: 0 },
    { itemId: "Z", itemCode: "BLDG-900", itemName: "بلدورة زراعة", rcvQty: 0 },
    { itemId: "C", itemCode: "BLDG-024", itemName: "اسمنت اسود", rcvQty: 20 },
    { itemId: "D", itemCode: "BLDG-575", itemName: "ديانه رمل", rcvQty: 0 },
  ] };
  const po = { grnDocs: [grn] };
  T("★ المستلَم السابق يُقرأ من صفّ البند نفسه رغم انزياح الفهرس (20 لا 0)",
    M._waPrevRcv(po, 2, items[2]) === 20);
  T("الفهرس المطابق يبقى المسار الأول (غراء: 15)",
    M._waPrevRcv(po, 0, items[0]) === 15);
  T("بندٌ لا صفَّ له في السند ⇒ صفر (لا استعارة)",
    M._waPrevRcv(po, 4, items[4]) === 0);
  {   // بندان لنفس الصنف: لا تخمين — يبقى الفهرس ولا تُجمع كل المطابقات
    const g2 = { items: [{ itemId: "S", rcvQty: 5 }, { itemId: "S", rcvQty: 7 }] };
    T("★ بندان لنفس الصنف: كل بندٍ يقرأ صفَّه (5 و7 لا 12)",
      M._waPrevRcv({ grnDocs: [g2] }, 0, { itemId: "S" }) === 5 &&
      M._waPrevRcv({ grnDocs: [g2] }, 1, { itemId: "S" }) === 7);
  }

  // ── v18.9wy: الفحص الذاتي — النظام يكشف الانزياح بنفسه بدل انتظار من ينتبه ──
  {
    const sa = HTML.indexOf("const _poAlignBreaks   = new Map();");
    const sb = HTML.indexOf("\nfunction renderAlignWarning(", sa);
    let S = null, logged = [];
    if (sa >= 0 && sb > sa) {
      try {
        S = new Function("_poItemKey", "captureError",
          HTML.slice(sa, sb) + "\nreturn {_poAlignScan,_poAuditSelfCheck,_poAlignBreaks,_poAlignReported};")(
          M._poItemKey, (kind, msg) => logged.push({ kind, msg }));
      } catch (e) { T("تُبنى دوال الفحص الذاتي", false, String(e.message).slice(0, 120)); }
    }
    T("تُبنى دوال الفحص الذاتي (_poAlignScan/_poAuditSelfCheck)", !!S);
    if (S) {
      const broken = { id: "PO-202608-0130", auditedBy: "محمد", items, auditItems };
      const okPo = { id: "PO-OK", auditedBy: "محمد", items, auditItems: items.map(x => ({ ...x })) };

      T("★ الفحص يرصد الانزياح ويسمّي السطر والبندين",
        S._poAlignScan(broken).length === 4 &&
        S._poAlignScan(broken)[0].includes("الطول") &&
        S._poAlignScan(broken).some(b => b.includes("ديانه رمل") && b.includes("اسمنت اسود")));
      T("★ الطلب السليم لا يُنتج إنذاراً (لا إزعاج كاذب)", S._poAlignScan(okPo).length === 0);
      T("الطلب غير المُدقَّق خارج الفحص", S._poAlignScan({ id: "X", items, auditItems }).length === 0);

      S._poAuditSelfCheck(broken);
      T("★ الانزياح يُقيَّد في سجل الأخطاء باسم الطلب",
        logged.length === 1 && logged[0].kind === "align" && logged[0].msg.includes("PO-202608-0130"));
      T("★ يُسجَّل الطلب في خريطة التشخيص (يقرأها شريط الإعلان)",
        S._poAlignBreaks.get("PO-202608-0130").length === 4);
      S._poAuditSelfCheck(broken); S._poAuditSelfCheck(broken);
      T("★ لا يُغرق السجل: بلاغٌ واحد لكل طلب في الجلسة (اللقطات تتكرر)", logged.length === 1);
      S._poAuditSelfCheck(okPo);
      T("الطلب السليم لا يدخل الخريطة ولا السجل",
        !S._poAlignBreaks.has("PO-OK") && logged.length === 1);
      // شفاء الطلب لاحقاً يمحو قيده من الخريطة
      S._poAuditSelfCheck({ id: "PO-202608-0130", auditedBy: "محمد", items, auditItems: items.map(x => ({ ...x })) });
      T("★ بعد الشفاء يسقط قيد الطلب من الخريطة", !S._poAlignBreaks.has("PO-202608-0130"));
      // الفحص لا يجوز أن يُعطّل التحميل مهما كانت الوثيقة مشوّهة
      let threw = false;
      try { S._poAuditSelfCheck({ id: "Z", auditedBy: "ن", items: null, auditItems: "مشوّهة" }); }
      catch (e) { threw = true; }
      T("★ وثيقةٌ مشوّهة لا تُعطّل تحميل الطلبات", !threw);
    }
    T("★ الفحص الذاتي يعمل على كل طلب عند التحميل (داخل _poHealItems)",
      HTML.includes("return _poAuditSelfCheck(p);"));
    T("★ شريط الإعلان للمسؤول وحده، ومعروضٌ في تفاصيل الطلب",
      HTML.includes('if(!(currentUser && currentUser.role==="admin")) return "";') &&
      HTML.includes("${renderAlignWarning(p)}"));
    T("★ لا إصلاح صامت للمخزَّن عند التحميل (الشفاء عند الحفظ فقط)",
      HTML.includes("_poAlignBreaks.delete(poId);   // v18.9wy") &&
      !/_poAuditSelfCheck[\s\S]{0,600}p\.auditItems\s*=/.test(HTML));
  }

  // ── حرّاس المسار: أين تُستعمل الدوال فعلاً ──
  T("★ بادج تغيّر السعر يقرأ الصفوف المصطفّة لا p.auditItems[i]",
    HTML.includes("const _aiRow   = _auditRows[i];") &&
    !HTML.includes("const _aiRow   = p.auditItems && p.auditItems[i];"));
  T("★ تفاصيل الطلب تحسب الاصطفاف مرةً واحدة خارج حلقة البنود",
    HTML.includes("const _auditRows = _poAuditRows(p);"));
  T("★ صندوق «تغيّر الأسعار» يمرّ على بنود الطلب الحالية مصطفّةً",
    HTML.includes("const _rows = (p.items && p.items.length) ? _poAlignRows(p.items, ai) : ai;"));
  T("★ تعديل المسؤول يعيد اصطفاف auditItems على البنود بعد الحفظ",
    HTML.includes("const _alignedAI = _poAlignRows(pf.items, pf.auditItems);") &&
    HTML.includes("pf.auditItems = pf.items.map((it,i)=> _alignedAI[i] || {"));
  T("★ _waPrevRcv يبحث بالهوية حين لا يطابق الفهرس (L9: الكود قبل الاسم محفوظ)",
    HTML.includes("const hits = rows.filter(r=> _poItemKey(r)===key);") &&
    HTML.includes("if(gi.itemCode && it && it.itemCode) return String(gi.itemCode).trim() === String(it.itemCode).trim();"));
}

/* ════════════════════════════════════════════════════════════════════
   22) تدقيق الاستلام: إضافة بند إضافي لا تمحو كميات صفوف الطلب (v18.9sz)
   ════════════════════════════════════════════════════════════════════ */
function waExtrasPreserveQty() {
  H("22) إضافة بند إضافي تحفظ كميات الطلب");
  T("★ توجد التقاط/استعادة قيم صفوف الطلب (_waCaptureOrig/_waRestoreOrig)",
    HTML.includes("function _waCaptureOrig(") && HTML.includes("function _waRestoreOrig("));
  T("_waRestoreOrig يحترم خانة المستودع (src='stock' لا يعيد حسابها)",
    HTML.includes("waUpdateRow(parseInt(k,10),'stock')"));
  const add = (()=>{ const i=HTML.indexOf("function waAddExtra("); return i<0?"":HTML.slice(i, HTML.indexOf("\nfunction ", i+10)); })();
  T("★ waAddExtra يلتقط قيم الصفوف قبل فتح نافذة البند الإضافي", add.includes("_waCaptureOrig();"));
  const rem = (()=>{ const i=HTML.indexOf("function waRemoveExtra("); return i<0?"":HTML.slice(i, HTML.indexOf("\nfunction ", i+10)); })();
  T("waRemoveExtra يلتقط ويستعيد قيم الصفوف", rem.includes("_waCaptureOrig();") && rem.includes("_waRestoreOrig();"));
  const form = (()=>{ const i=HTML.indexOf("function _waExtraForm("); return i<0?"":HTML.slice(i, HTML.indexOf("\nfunction ", i+10)); })();
  T("★ نافذة البند الإضافي تستعيد قيم الصفوف بعد الإضافة", form.includes("_waRestoreOrig();"));
  T("التقاط القيم يبدأ نظيفاً عند فتح التدقيق", HTML.includes("_waOrigVals = null;   // v18.9sz"));
}

/* ════════════════════════════════════════════════════════════════════
   23) مسؤول المشتريات يحيل الطلب «قيد التنفيذ» للمالية للسداد (v18.9sz)
   ════════════════════════════════════════════════════════════════════ */
function procToFinance() {
  H("23) الإحالة للمالية من «قيد تنفيذ المشتريات»");
  const i = HTML.indexOf("function getAvailableStatuses(");
  const src = i >= 0 ? HTML.slice(i, HTML.indexOf("\nfunction ", i + 10)) : "";
  let fn;
  try {
    fn = new Function("currentUser", "getPOTotal", "PO_CEO_THRESHOLD", src + "\nreturn getAvailableStatuses;")(
      { role: "procurement_officer" }, () => 1000, 50000);
  } catch (e) { T("تُبنى getAvailableStatuses", false, String(e.message).slice(0, 120)); return; }
  T("تُبنى getAvailableStatuses", typeof fn === "function");
  if (typeof fn !== "function") return;

  const opts = fn("proc_executing", {}).map(o => o.v);
  T("★ مسؤول المشتريات في «قيد التنفيذ» يملك «إحالة للمالية للسداد»", opts.includes("__SEND_TO_FINANCE__"));
  T("ما زال يملك «تم الشراء — إشعار المستودع»", opts.includes("wh_receiving"));
  // لا يُمنح لدورٍ لا يملكه (المستودع مثلاً) في هذه المرحلة
  const whFn = new Function("currentUser", "getPOTotal", "PO_CEO_THRESHOLD", src + "\nreturn getAvailableStatuses;")(
    { role: "warehouse_manager" }, () => 1000, 50000);
  T("لا يظهر الخيار لمسؤول المستودع في «قيد التنفيذ»", !whFn("proc_executing", {}).map(o => o.v).includes("__SEND_TO_FINANCE__"));
}

/* ════════════════════════════════════════════════════════════════════
   23-أ) ختمُ اعتماد التنفيذي مقرونٌ بمبلغه · وحارسُ «تم الشراء» (v18.9xa)

   جذرُ الفحص طلبٌ حقيقيّ: PO-202608-0155. اعتمده التنفيذيُّ على 2,639 ر.س،
   ثم أرجعه الأدمن من «بانتظار استلام المستودع» إلى «تمت مراجعة المستودع» —
   والختمُ باقٍ بلا مبلغٍ ولا انتهاء. فصار «إحالة للمالية» يتخطّى التنفيذيَّ
   على طلبٍ عاد إلى ما قبل بوّابته، بأيّ قيمةٍ بلغها بعد ذلك.

   هذا القسم يُنفّذ المنطقَ المستخرَجَ من index.html لا يقرؤه.
   ════════════════════════════════════════════════════════════════════ */
function poCEOStampBound() {
  H("23-أ) ختمُ اعتماد التنفيذي مقرونٌ بمبلغه · وحارسُ «تم الشراء»");
  const grab = n => { const i = HTML.indexOf("function " + n + "("); return i < 0 ? "" : HTML.slice(i, HTML.indexOf("\nfunction ", i + 10)); };
  const po = (total, extra) => Object.assign({ items: [{ itemCost: total }] }, extra || {});

  // ══ (أ) poCEOCovers / poClearCEOStamp / PO_PRE_CEO_STATUSES — تُنفَّذ ══
  let A;
  try {
    // الوصلُ بسطرٍ جديد: كلُّ قطعةٍ تنتهي عند سطر `//` تعليقاً، فوصلُها بلا فاصلٍ
    // يبتلع أوّلَ سطرٍ من التالية داخل التعليق.
    A = new Function([grab("getPOTotal"), grab("poCEOCovers"), grab("poClearCEOStamp"),
      "return {getPOTotal, poCEOCovers, poClearCEOStamp, PO_PRE_CEO_STATUSES};"].join("\n"))();
  } catch (e) { T("تُبنى دوالّ ختم التنفيذي", false, String(e.message).slice(0, 140)); return; }
  T("تُبنى دوالّ ختم التنفيذي", typeof A.poCEOCovers === "function" && typeof A.poClearCEOStamp === "function");

  T("ختمٌ يغطّي المبلغ الحالي → مغطّى",
    A.poCEOCovers(po(2639, { ceoApprovedAt: "x", ceoApprovedAmount: 2639 })) === true);
  T("★★ ارتفاعُ القيمة فوق سقف الختم → غير مغطّى (لا شيك على بياض)",
    A.poCEOCovers(po(200000, { ceoApprovedAt: "x", ceoApprovedAmount: 2639 })) === false);
  T("★★ ختمٌ قديمٌ بلا مبلغ لا يُعتدّ به — نفس عُرف contracts.js:281",
    A.poCEOCovers(po(2639, { ceoApprovedAt: "x" })) === false);
  T("بلا ختمٍ أصلاً → غير مغطّى", A.poCEOCovers(po(2639, {})) === false);
  T("تسامحُ الكسر (0.01) لا يُسقط المساوي",
    A.poCEOCovers(po(2639.005, { ceoApprovedAt: "x", ceoApprovedAmount: 2639 })) === true);

  const cleared = po(2639, { ceoApprovedAt: "x", ceoApprovedAmount: 2639, ceoApprovedBy: "التنفيذي" });
  T("محوُ الختم يُرجع true أول مرّة ثم false", A.poClearCEOStamp(cleared) === true && A.poClearCEOStamp(cleared) === false);
  T("★★ المحوُ بقيمةٍ فارغةٍ لا بـ delete — وإلا لم يمحُ شيئاً مع merge:true",
    ("ceoApprovedAt" in cleared) && ("ceoApprovedAmount" in cleared) &&
    cleared.ceoApprovedAt === "" && cleared.ceoApprovedAmount === 0);
  T("والممحوُّ لم يعد يغطّي", A.poCEOCovers(cleared) === false);

  T("★ مراحلُ ما قبل بوّابة التنفيذي تشمل «تمت مراجعة المستودع» (حالةُ PO-202608-0155)",
    A.PO_PRE_CEO_STATUSES.includes("wh_reviewed") && A.PO_PRE_CEO_STATUSES.includes("pending_proc") &&
    A.PO_PRE_CEO_STATUSES.includes("pending_pm") && A.PO_PRE_CEO_STATUSES.includes("ceo_rejected"));
  T("★ ولا تشمل ما بعدها (فلا يسقط ختمٌ في مساره الطبيعي)",
    !["proc_executing", "wh_receiving", "wh_auditing", "pending_finance", "closed", "pending_ceo"]
      .some(s => A.PO_PRE_CEO_STATUSES.includes(s)));

  // ══ (ب) قرارُ التوجيه في openSendToFinanceModal — يُنفَّذ بسطوره الحقيقية ══
  const stf = grab("openSendToFinanceModal");
  const ln = re => (stf.match(re) || [""])[0];
  const sNeeds = ln(/const needsCEO = .*/), sClr = ln(/const cleared = .*/), sGo = ln(/const goCEO = .*/);
  if (!sNeeds || !sClr || !sGo) { T("تُستخرج سطورُ قرار التوجيه", false, "تغيّرت صياغتها في openSendToFinanceModal"); return; }
  let route;
  try {
    route = new Function("p", "getPOTotal", "PO_CEO_THRESHOLD", "poCEOCovers",
      "const total = getPOTotal(p);\n" + sNeeds + "\n" + sClr + "\n" + sGo + "\nreturn goCEO;");
  } catch (e) { T("يُبنى قرارُ التوجيه", false, String(e.message).slice(0, 140)); return; }
  const goCEO = p => route(p, A.getPOTotal, 2000, A.poCEOCovers);

  T("المسارُ السليم لا ينكسر: ختمٌ يغطّي القيمة → مباشرةً للمالية",
    goCEO(po(2639, { ceoApprovedAt: "x", ceoApprovedAmount: 2639 })) === false);
  T("★★ قيمةٌ فوق سقف الختم → يرجع للتنفيذي",
    goCEO(po(5000, { ceoApprovedAt: "x", ceoApprovedAmount: 2639 })) === true);
  T("★★ `finance_returned` لم يعد تصريحَ مرورٍ مطلقاً — الباب الخلفي أُغلق",
    goCEO(po(5000, { status: "finance_returned", ceoApprovedAt: "x", ceoApprovedAmount: 2639 })) === true);
  T("★★ ختمٌ قديمٌ بلا مبلغ → يرجع للتنفيذي بطلبٍ يراه",
    goCEO(po(2639, { ceoApprovedAt: "x" })) === true);
  T("تحت العتبة لا تنفيذيّ أصلاً", goCEO(po(1000, {})) === false);

  // ══ (ج) كتابةُ الختم في doUpdatePurchaseStatus — تُنفَّذ ══
  const upd = grab("doUpdatePurchaseStatus");
  const mStamp = upd.match(/if\(oldStatus==="pending_ceo"[\s\S]*?\n  \}/);
  if (!mStamp) { T("يُستخرج قيدُ ختم التنفيذي", false, "تغيّرت صياغته"); return; }
  const stamp = new Function("p", "oldStatus", "newStatus", "now", "currentUser", "getPOTotal",
    mStamp[0] + "\nreturn p;");
  const st1 = stamp(po(2639, {}), "pending_ceo", "proc_executing", "T0", { name: "المدير التنفيذي" }, A.getPOTotal);
  T("★★ الاعتماد يُختم بمبلغه واسمِ من اعتمده",
    st1.ceoApprovedAmount === 2639 && st1.ceoApprovedBy === "المدير التنفيذي" && st1.ceoApprovedAt === "T0");
  const st2 = stamp(po(2639, { ceoApprovedAt: "T0", ceoApprovedAmount: 1000 }), "pending_ceo", "pending_finance", "T1", { name: "ت" }, A.getPOTotal);
  T("★★ اعتمادٌ ثانٍ يُعيد الختمَ بالسقف الجديد — لا يتشبّث بالقديم",
    st2.ceoApprovedAmount === 2639 && st2.ceoApprovedAt === "T1");
  const st3 = stamp(po(2639, {}), "wh_reviewed", "proc_executing", "T2", { name: "ت" }, A.getPOTotal);
  T("انتقالٌ لا يمرّ ببوّابة التنفيذي لا يُنتج ختماً", !st3.ceoApprovedAt);

  // ══ (د) إبطالُ الختم بالرجوع — يُنفَّذ ══
  const mClr = upd.match(/let _ceoStampCleared = false;[\s\S]*?\n  \}/);
  if (!mClr) { T("يُستخرج قيدُ إبطال الختم بالرجوع", false, "تغيّرت صياغته"); return; }
  const revert = new Function("p", "oldStatus", "newStatus", "normalizePOStatus", "PO_PRE_CEO_STATUSES", "poClearCEOStamp",
    mClr[0] + "\nreturn {p, _ceoStampCleared};");
  const R = (from, to) => revert(po(2639, { ceoApprovedAt: "x", ceoApprovedAmount: 2639 }), from, to, s => s, A.PO_PRE_CEO_STATUSES, A.poClearCEOStamp);
  const rBack = R("wh_receiving", "wh_reviewed");
  T("★★ عينُ PO-202608-0155: الرجوعُ لـ«تمت مراجعة المستودع» يُسقط الختم",
    rBack._ceoStampCleared === true && A.poCEOCovers(rBack.p) === false);
  T("★ ورفضُ التنفيذي يُسقطه كذلك", R("pending_ceo", "ceo_rejected")._ceoStampCleared === true);
  T("★ والمضيُّ للأمام لا يُسقطه", R("pending_ceo", "proc_executing")._ceoStampCleared === false);
  T("وثبات الحالة لا يُسقطه", R("wh_reviewed", "wh_reviewed")._ceoStampCleared === false);
  T("★ نافذةُ تعديل المسؤول تطبّق القاعدةَ نفسَها (بابان يحرّكان الحالة)",
    /PO_PRE_CEO_STATUSES\.includes\(normalizePOStatus\(pf\.status\)\) && poClearCEOStamp\(pf\)/.test(HTML));
  T("★ وإسقاطُ الاعتماد قيدٌ في السجل لا حدثٌ صامت",
    (HTML.match(/سقط اعتماد المدير التنفيذي — رجع الطلب إلى ما قبل بوّابته/g) || []).length >= 2);

  // ══ (هـ) حارسُ «تم الشراء» في doNotifyWarehouse ══
  const nw = grab("doNotifyWarehouse");
  const iGuard = nw.indexOf("_poFreshStatus(poId)");
  const iUp    = nw.indexOf("_poUploadFile(");
  const iWrite = nw.indexOf('p.status = "wh_receiving"');
  T("★★ «تم الشراء» صار يقرأ الحالة طازجةً من الخادم", iGuard > 0);
  T("★★ والفحصُ قبل رفع الملف — فلا مرفقٌ يتيمٌ لطلبٍ سيُرفض", iGuard > 0 && iUp > 0 && iGuard < iUp);
  T("★★ وقبل كتابة الحالة", iGuard > 0 && iWrite > 0 && iGuard < iWrite);
  const mByp = nw.match(/const _bypass = .*/);
  T("يُستخرج قرارُ التجاوز", !!mByp);
  if (mByp) {
    const byp = new Function("_st", mByp[0] + "\nreturn _bypass;");
    T("★★ الحالةُ غيرُ «قيد تنفيذ المشتريات» = تجاوز", byp("pending_ceo") === true && byp("wh_reviewed") === true);
    T("و«قيد تنفيذ المشتريات» تمرّ", byp("proc_executing") === false);
  }
  const bypBlock = (nw.match(/if\(_bypass\)\{[\s\S]*?\n  \}/) || [""])[0];
  T("★★ غيرُ الأدمن يُردّ ولا يكتب شيئاً", /if\(!isAdmin\(\)\)\{[\s\S]*?return false;/.test(bypBlock));
  T("★ والأدمن يتجاوز بتأكيدٍ يسمّي ما يتجاوزه", /showConfirm\(/.test(bypBlock) && /تجاوزُ مرحلة التنفيذ/.test(bypBlock));
  T("★ والتجاوزُ يُكتب في قيد السجل نفسِه", /_bypass \? \("⚠ تجاوزُ مسؤول/.test(nw));
  T("★ والنافذةُ تفشل مبكّراً لغير الأدمن قبل ملء النموذج",
    /if\(!isAdmin\(\) && normalizePOStatus\(p\.status\) !== "proc_executing"\)/.test(grab("openNotifyWarehouseModal")));

  // `_poFreshStatus` بلا اتصال: تُرجع "" فيمضي المستدعي بالمرآة المحلية
  try {
    // `grab` يبدأ عند "function" فيُسقط `async` — تُعاد لئلا يسقط `await` داخلها
    const fresh = new Function("db", "purchases", "normalizePOStatus", "console",
      "async " + grab("_poFreshStatus") + "\nreturn _poFreshStatus;")(null, [], s => s, console);
    _deferred.push(Promise.resolve(fresh("PO-X")).then(v =>
      T("★ بلا اتصالٍ تُرجع الحالةَ فارغةً — الحراسةُ أفضلُ جهدٍ لا شرطَ توفّر", v === "")));
  } catch (e) { T("تُبنى _poFreshStatus", false, String(e.message).slice(0, 140)); }
}

/* ════════════════════════════════════════════════════════════════════
   23-ب) دمج مشروع يدوي في مشروع رسمي — إعادة ربط طلبات الشراء (v18.9vj)
   ════════════════════════════════════════════════════════════════════ */
function mergeManualProject() {
  H("23-ب) دمج مشروع يدوي في مشروع رسمي");
  // الأداة والزر والنافذة موجودة
  T("★ زر «دمج مشروع يدوي» في ترويسة المشتريات (للمسؤول)",
    HTML.includes('id="po-merge-proj-btn"') && HTML.includes('onclick="openMergeProjectModal()"'));
  T("نافذة الدمج موجودة بحقولها (المصدر/الهدف/السبب)",
    HTML.includes('id="modal-po-merge-project"') && HTML.includes('id="mp-manual"') &&
    HTML.includes('id="mp-target"') && HTML.includes('id="mp-reason"'));
  // اختيار الطلبات المطابقة = يدوية بنفس الاسم (المصدر الموحّد لتصنيف اليدوي)
  const mpm = (()=>{ const i=HTML.indexOf("function _mpManualPOs("); return i<0?"":HTML.slice(i, HTML.indexOf("\nfunction ", i+10)); })();
  T("★ _mpManualPOs يطابق الطلبات اليدوية بنفس الاسم",
    mpm.includes('(p.isCustomProject || p.projectId==="__OTHER__")') && mpm.includes('String(p.projectName||"").trim()===nm'));
  // منطق الدمج: يكتب معرّفاً رسمياً ويُلغي علَم اليدوي
  const dm = (()=>{ const i=HTML.indexOf("async function doMergeProject("); return i<0?"":HTML.slice(i, HTML.indexOf("\nfunction ", i+10)); })();
  T("★ الدمج يكتب projectId الرسمي ويُلغي isCustomProject",
    dm.includes("p.projectId=target.id") && dm.includes("p.isCustomProject=false"));
  T("الدمج يستعمل دفعة Firestore ويسجّل قيداً زمنياً لكل طلب",
    dm.includes("db.batch()") && dm.includes("p.timeline.push(") && dm.includes("b.commit()"));
  T("الدمج محميّ بصلاحية المسؤول وسبب إلزامي وتأكيد",
    dm.includes('currentUser.role!=="admin"') && dm.includes("if(!reason)") && dm.includes("showConfirm(") && dm.includes("logAudit("));
  // v18.9vk: إتمام الدمج — حذف الاسم اليدوي المتبقّي من meta/manual_projects
  T("★ الدمج يحذف الاسم اليدوي من القائمة المحفوظة بعد نقل كل الطلبات",
    dm.includes("if(_mpManualPOs(nm).length===0){ await _mpRemoveMetaName(nm); }"));
  const rm = (()=>{ const i=HTML.indexOf("async function _mpRemoveMetaName("); return i<0?"":HTML.slice(i, HTML.indexOf("\nasync function ", i+10)); })();
  T("★ _mpRemoveMetaName يزيل الاسم من meta/manual_projects (arrayRemove) ومن الذاكرة",
    rm.includes('db.collection("meta").doc("manual_projects")') && rm.includes("FieldValue.arrayRemove(nm)") &&
    rm.includes("_manualProjectNames = _manualProjectNames.filter"));
  const dl = (()=>{ const i=HTML.indexOf("async function doDeleteManualName("); return i<0?"":HTML.slice(i, HTML.indexOf("\nfunction ", i+10)); })();
  T("★ زر «حذف الاسم اليدوي» موجود ويستدعي doDeleteManualName",
    HTML.includes('id="mp-del-btn"') && HTML.includes('onclick="doDeleteManualName()"'));
  T("★ الحذف يرفض إن بقيت طلبات مرتبطة (يدعو للدمج أولاً)",
    dl.includes("const remaining=_mpManualPOs(nm).length;") && dl.includes("if(remaining>0)"));
  T("الحذف محميّ بصلاحية المسؤول وتأكيد ويحذف من القائمة المحفوظة",
    dl.includes('currentUser.role!=="admin"') && dl.includes("showConfirm(") && dl.includes("await _mpRemoveMetaName(nm);"));
}

/* ════════════════════════════════════════════════════════════════════
   24) أوامر الصرف: عمود «المستودع» يعرض المستودع لا اسم من صرف (v18.9sz)
   ════════════════════════════════════════════════════════════════════ */
function issueOrderWarehouseCol() {
  H("24) عمود المستودع في أوامر الصرف");
  const sub = (()=>{ const i=HTML.indexOf("async function issueOrderSubmit("); return i<0?"":HTML.slice(i, HTML.indexOf("\nfunction ", i+10)); })();
  T("★ يُلتقط اسم المستودع من الصنف عند الصرف", sub.includes('warehouseName:(src.warehouseName||"").trim()'));
  T("اسم المستودع يُحفظ في وثيقة الأمر", sub.includes('warehouseName:it.warehouseName||""'));
  const ren = (()=>{ const i=HTML.indexOf("function renderIssueOrders("); return i<0?"":HTML.slice(i, HTML.indexOf("\nfunction ", i+10)); })();
  T("★ عمود «المستودع» يعرض مستودعات أصناف الأمر", ren.includes("const _issWhNames=[...new Set((o.items||[]).map(i=>{") && ren.includes("${_issWhCell}"));
  T("لم يعد يعرض «من صرف» (issuedBy) في عمود المستودع", !ren.includes('<td style="text-align:center;padding:10px 8px;font-size:11px">${esc(o.issuedBy||"—")}</td>'));
}

/* ════════════════════════════════════════════════════════════════════
   25) أمر الصرف: قائمة المشروع تشمل المشاريع اليدوية المحفوظة (v18.9sz)
   ════════════════════════════════════════════════════════════════════ */
function issueOrderManualProject() {
  H("25) مشروع أمر الصرف يشمل اليدوية");
  const i = HTML.indexOf("function _issProjectOptionsHTML(");
  const src = i >= 0 ? HTML.slice(i, HTML.indexOf("\nfunction ", i + 10)) : "";
  let fn;
  try {
    fn = new Function("window", "_manualProjectNamesAll", "esc", src + "\nreturn _issProjectOptionsHTML;")(
      { _projectsList: [{ id: "hail", name: "مشروع رسمي" }] },
      () => ["مشروع يدوي", "مشروع رسمي"], x => x);
  } catch (e) { T("تُبنى _issProjectOptionsHTML", false, String(e.message).slice(0, 120)); return; }
  T("تُبنى _issProjectOptionsHTML", typeof fn === "function");
  if (typeof fn !== "function") return;
  const html = fn();
  T("تحوي المشروع الرسمي", html.includes('<option value="مشروع رسمي">مشروع رسمي</option>'));
  T("★ تحوي المشروع اليدوي المحفوظ", html.includes('<option value="مشروع يدوي">مشروع يدوي (يدوي)</option>'));
  T("لا تُكرّر اسماً رسمياً كيدوي", !html.includes('مشروع رسمي (يدوي)'));
  T("تُبقي خيار الإدخال اليدوي", html.includes('<option value="__OTHER__">إدخال يدوي...</option>'));
  const init = (()=>{ const j=HTML.indexOf("function initIssueOrderPage("); return j<0?"":HTML.slice(j, HTML.indexOf("\nfunction ", j+10)); })();
  T("initIssueOrderPage يبني القائمة من المصدر الموحّد ويعيد بناءها بعد تحميل meta",
    init.includes("_issProjectOptionsHTML()") && init.includes("_loadManualProjectNames().then(_fill)"));
}

/* ════════════════════════════════════════════════════════════════════
   26) مؤشرات المشتريات: «إجمالي الإنفاق (فعلي)» = المغلق فقط (يطابق اللوحة) (v18.9sz)
   ════════════════════════════════════════════════════════════════════ */
function kpiSpendClosedOnly() {
  H("26) الإنفاق الفعلي في المؤشرات = المغلق فقط");
  if (!KPI_SRC) { console.log("  ⏭  كود purchase-kpi غير موجود — تُخطّى"); return; }
  const ksrc = KPI_SRC;
  const sl = (a, b) => ksrc.slice(ksrc.indexOf(a), ksrc.indexOf(b));
  let kc, ka;
  try {
    kc = new Function("poIsClosed", sl("function _kpiClosed(", "function _kpiActual(") + "\nreturn _kpiClosed;")(
      p => ["closed", "closed_after_receipt"].includes(p.status));
    ka = new Function("poActualCost", sl("function _kpiActual(", "/* ══ استخراج") + "\nreturn _kpiActual;")(
      p => Number(p.actualCost) || 0);
  } catch (e) { T("تُبنى دوال KPI الموحّدة", false, String(e.message).slice(0, 120)); return; }
  T("_kpiClosed يشمل closed و closed_after_receipt", kc({ status: "closed" }) === true && kc({ status: "closed_after_receipt" }) === true);
  T("_kpiClosed يستثني غير المغلق", kc({ status: "proc_executing" }) === false);
  T("_kpiActual يقرأ التكلفة الفعلية", ka({ actualCost: 500 }) === 500);
  // fallback بلا poIsClosed
  const kcF = new Function("poIsClosed", sl("function _kpiClosed(", "function _kpiActual(") + "\nreturn _kpiClosed;")(undefined);
  T("_kpiClosed fallback بالحالة عند غياب poIsClosed", kcF({ status: "closed_after_receipt" }) === true && kcF({ status: "pending_pm" }) === false);

  T("★ totalAct يجمع المغلق فقط (actClosed)", ksrc.includes("totalAct:A.reduce((s,a)=>s+a.actClosed,0)"));
  T("actClosed = تكلفة المغلق فقط", ksrc.includes("const actClosed = _clo ? _kpiActual(p) : 0;"));
  T("الإنفاق الشهري الفعلي = المغلق فقط", ksrc.includes("m.est+=a.est; m.act+=a.actClosed;"));
  T("isClosed من المصدر الموحّد (_clo)", ksrc.includes("isClosed: _clo,"));
  // مؤشرات الموردين تقرأ المورّد الفعلي (poVendorBreakdown) لا p.vendor المقترح
  T("★ الإنفاق حسب المورد يقرأ المورّد الفعلي (poVendorBreakdown)",
    ksrc.includes('if(typeof poVendorBreakdown==="function") parts=poVendorBreakdown(p);'));
  T("لم يعد يقرأ p.vendor المقترح (a.vendor && a.spend) لمؤشر الموردين",
    !ksrc.includes("A.forEach(a=>{ if(a.vendor && a.spend>0) byVendor"));
  // v18.9tb: المورّد يُقرأ من أي حقل ولا يُسقَط إنفاقٌ باسمٍ خالٍ (كان `if(v&&c>0)` يُهمله)
  T("★ _kpiVendorOf يقرأ كل حقول المورّد (actualVendor/vendors/supplier/vendor/grn/بند)",
    ksrc.includes("function _kpiVendorOf(p)") &&
    ksrc.includes("first(p.actualVendor)") && ksrc.includes("first(p.supplier)") &&
    ksrc.includes("first(p.vendor)") && ksrc.includes('return v || "غير محدد"'));
  T("★ الفرع الاحتياطي ينسب الإنفاق دون إسقاطٍ باسمٍ خالٍ",
    ksrc.includes("const v=_kpiVendorOf(p), c=_kpiActual(p);") &&
    ksrc.includes("if(c>0) byVendor[v]=(byVendor[v]||0)+c;"));
  // v18.9tc: مخطّط الموردين يحسب المغلقة فقط بالفعلي — يطابق «المبالغ المغلقة» (لا يشمل تقدير المفتوحة)
  T("★ مخطّط الموردين = المغلقة فقط (اتساق مع أرقام الإنفاق)",
    ksrc.includes("if(!p || !_kpiClosed(p)) return;"));
  // v18.9td: مستمع الطلبات يعيد رسم صفحة المؤشرات إن كانت مفتوحة (تمنع المخطّط الفارغ عند الفتح المبكر)
  T("★ onSnapshot يعيد رسم مؤشرات الأداء إن كانت صفحتها مفتوحة",
    HTML.includes('document.getElementById("page-purchase-kpi").classList.contains("active")') &&
    HTML.includes("window.purchaseKPI && window.purchaseKPI.render) window.purchaseKPI.render();"));
  // v18.9te: كتم رفض App Check/reCAPTCHA العابر فقط (لا يبتلع أي خطأ آخر)
  T("★ يُكتم رفض reCAPTCHA/App Check العابر حصراً عبر unhandledrejection",
    HTML.includes('window.addEventListener("unhandledrejection"') &&
    HTML.includes("/recaptcha|appcheck|app-?check/i.test(m)") &&
    HTML.includes("ev.preventDefault();"));
  T("الفرع الاحتياطي يستخدم الفعلي _kpiActual لا التقديري _kpiSpendOf",
    ksrc.includes("const v=_kpiVendorOf(p), c=_kpiActual(p);") &&
    !ksrc.includes("const v=_kpiVendorOf(p), c=_kpiSpendOf(p);"));
  T("_kpiSpendOf أفضل-جهداً (فعلي ثم تقديري ثم مجموع البنود)",
    ksrc.includes("function _kpiSpendOf(p)") &&
    ksrc.includes('if(typeof getPOTotal==="function") c=Number(getPOTotal(p))||0;'));
  // اختبار سلوكي: مغلق بلا مورّد وبتكلفة يُنسب لـ«غير محدد» لا يُسقَط
  {
    let _vend, _spend;
    try {
      _vend = new Function("getPOTotal", sl("function _kpiVendorOf(", "/* v18.9tb: إنفاقٌ أفضل") + "\nreturn _kpiVendorOf;")(undefined);
      _spend = new Function("getPOTotal", sl("function _kpiSpendOf(", "\n/* ══") + "\nreturn _kpiSpendOf;")(undefined);
    } catch (e) { T("تُبنى _kpiVendorOf/_kpiSpendOf", false, String(e.message).slice(0, 120)); }
    if (typeof _vend === "function") {
      T("_kpiVendorOf: supplier عند غياب actualVendor/vendor", _vend({ supplier: "مورّد عرض" }) === "مورّد عرض");
      T("_kpiVendorOf: vendors[] أولاً", _vend({ vendors: [{ vendor: "أ" }], vendor: "ب" }) === "أ");
      T("_kpiVendorOf: بند عند غياب الحقول العليا", _vend({ items: [{ vendor: "بند-مورّد" }] }) === "بند-مورّد");
      T("_kpiVendorOf: «غير محدد» عند غياب الكل", _vend({ actualCost: 500 }) === "غير محدد");
    }
    if (typeof _spend === "function") {
      T("_kpiSpendOf: actualCost أولاً", _spend({ actualCost: 700 }) === 700);
      T("_kpiSpendOf: مجموع البنود احتياطاً", _spend({ items: [{ qty: 2, price: 50 }, { total: 100 }] }) === 200);
    }
  }

  // v18.9tf: فرع poVendorBreakdown كان يقبل سنتينل «غير محدد» كاسمٍ نهائي، فلا يستدعي
  // _kpiVendorOf — فيُدفن مورّد supplier/items تحت «غير محدد» رغم وعد tb. الحارس المصدري:
  T("★ فرع السندات يستردّ الاسم عند سنتينل «غير محدد» لا عند الفراغ فقط (tf)",
    ksrc.includes('if(!v||v==="غير محدد") v=_kpiVendorOf(p);'));

  // ── تأكيد سلوكي شامل: computeKPIs الحقيقي يملأ K.vendors بالأسماء الصحيحة ──
  {
    let computeKPIs;
    try {
      const block = ksrc.slice(ksrc.indexOf("const DAY = 86400000;"), ksrc.indexOf("/* ══════════════════ الواجهة"));
      const _poVB = p => { // نسخة index.html: يقرأ actualVendor/vendor/grn فقط (لا supplier/items)
        if (!p) return [{ vendor: "غير محدد", cost: 0 }];
        const closed = p.status === "closed" || p.status === "closed_after_receipt";
        const grn = (closed && Array.isArray(p.grnDocs)) ? p.grnDocs.filter(g => g && ((g.vendor || "").trim() || g.invoicedTotal != null)) : [];
        if (grn.length) { const m = {}; grn.forEach(g => { const v = (g.vendor || "").trim() || (p.actualVendor || "").trim() || p.vendor || "غير محدد"; m[v] = (m[v] || 0) + (parseFloat(g.invoicedTotal) || 0); }); return Object.keys(m).map(v => ({ vendor: v, cost: m[v] })); }
        const v = (p.actualVendor || "").trim() || p.vendor || "غير محدد";
        return [{ vendor: v, cost: closed ? (Number(p.actualCost) || 0) : 0 }];
      };
      computeKPIs = new Function(
        "poIsClosed", "poActualCost", "getPOTotal", "poVendorBreakdown",
        "STAGE_ORDER", "REJECT_CODES", "TERMINAL_CODES", "parseTS", "normStatus",
        block + "\nreturn computeKPIs;")(
          p => p.status === "closed" || p.status === "closed_after_receipt",
          p => Number(p.actualCost) || 0, p => Number(p.estCost) || 0, _poVB,
          ["pending_pm", "pm_approved", "wh_review", "wh_reviewed", "pending_proc", "pending_ceo", "pending_finance", "proc_executing", "wh_receiving", "wh_auditing", "pending_extra", "closed"],
          ["pm_rejected", "wh_rejected", "ceo_rejected", "rejected"],
          ["closed", "rejected", "cancelled", "deleted", "pm_rejected", "wh_rejected", "ceo_rejected"],
          v => v ? new Date(v).getTime() || null : null, s => s);
    } catch (e) { T("يُبنى computeKPIs للتأكيد السلوكي", false, String(e.message).slice(0, 140)); }
    if (typeof computeKPIs === "function") {
      const D = "2026-07-10T09:00:00Z";
      const K = computeKPIs([
        { id: "a", status: "closed", actualCost: 2500, estCost: 2600, createdAt: D, vendor: "قديم", grnDocs: [{ vendor: "مصقول", invoicedTotal: 2500 }] },
        { id: "b", status: "closed_after_receipt", actualCost: 1800, estCost: 1700, createdAt: D, actualVendor: "انوار" },
        { id: "c", status: "closed", actualCost: 900, estCost: 1000, createdAt: D, supplier: "سنابل" },      // supplier فقط
        { id: "d", status: "closed", actualCost: 1000, estCost: 1100, createdAt: D, items: [{ vendor: "الاجتهاد", qty: 5, price: 200 }] }, // بند فقط
        { id: "e", status: "closed", actualCost: 500, estCost: 500, createdAt: D },                          // بلا اسم
        { id: "f", status: "pending_ceo", estCost: 40000, createdAt: D, vendor: "مفتوح" },                   // مفتوح — يُستبعد
      ]);
      const spend = v => { const e = K.vendors.find(x => x[0] === v); return e ? e[1] : 0; };
      T("★ مخطّط الموردين غير فارغ (يظهر) بعد المعالجة", K.vendors.length > 0, "length=" + K.vendors.length);
      T("★ مجموع المخطّط = 6,700 (يطابق «المبالغ المغلقة»)", K.vendors.reduce((s, v) => s + v[1], 0) === 6700);
      T("★ مورّد supplier (المحوّل من عرض) يظهر باسمه لا «غير محدد» (tf)", spend("سنابل") === 900);
      T("★ مورّد البند items[] يظهر باسمه لا «غير محدد» (tf)", spend("الاجتهاد") === 1000);
      T("مغلق بلا اسم يُنسب لـ«غير محدد» بقيمته (لا يسقط)", spend("غير محدد") === 500);
      T("مورّد السند بقيمته الفعلية", spend("مصقول") === 2500);
      T("المفتوح (40,000 تقديري) مُستبعَد من المخطّط", !K.vendors.some(v => v[0] === "مفتوح"));
    }
  }
}

/* ════════════════════════════════════════════════════════════════════
   15) إصلاحات جولة التدقيق الثانية — XSS / SLA / فلاتر Excel / نقل المخزون
   ════════════════════════════════════════════════════════════════════ */
function auditRound2() {
  H("15) إصلاحات جولة التدقيق الثانية");

  // ── #1 XSS: _jsq يحيّد كسر السلسلة داخل onclick ──
  const a = HTML.indexOf("function _jsq(str){");
  if (a < 0) { T("_jsq موجودة", false); }
  else {
    const src = HTML.slice(a, HTML.indexOf("\nfunction ", a + 10));
    let _jsq;
    try { _jsq = new Function(src + "\nreturn _jsq;")(); }
    catch (e) { T("تُبنى _jsq", false, String(e.message).slice(0, 100)); }
    if (typeof _jsq === "function") {
      const payload = "x'-alert(document.cookie)-'";
      const dec = _jsq(payload).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
      let arg = null; try { arg = new Function("f", "return f('" + dec + "')")(x => x); } catch (e) {}
      T("★ _jsq يمنع كسر السلسلة داخل onclick (XSS)", arg === payload, "arg=" + JSON.stringify(arg));
      T("_jsq يُبقي القيم النظيفة كما هي", _jsq("بند 12 متر") === "بند 12 متر");
      T('_jsq يهرّب العلامة المزدوجة', _jsq('a"b') === 'a&quot;b');
    }
    T("سِنك اسم البند يستخدم _jsq لا esc", HTML.includes("'${_jsq(item.name"));
    T("سِنك اسم المشروع يستخدم _jsq", HTML.includes("'${_jsq(proj.name"));
    T("سِنك اسم/مورّد الكتالوج يستخدم _jsq", HTML.includes("'${_jsq(c.vendor") && HTML.includes("'${_jsq(c.name"));
    // بقيّةُ درسِ H5: اسمُ المبنى في مُنتقي الأصول كان بـesc داخل نصِّ JS
    // بينما جارُه (الاسم) بـ_jsq — والسطرُ الواحد يكفي. أسماءُ المباني تُكتب من إعدادات
    // المشروع، فيكفي دورٌ غيرُ زائرٍ ليحقنَ شفرةً تعمل في جلسة الأدمن.
    T("★ سِنك اسم المبنى في مُنتقي الأصول يستخدم _jsq لا esc",
      HTML.includes("${_jsq(a.building)}')") && !HTML.includes("${esc(a.building)}')"));
    // ولا يبقى في النواة سِنكٌ نصّيٌّ بـesc داخل نصِّ JS لحقلٍ يحرّره المستخدم.
    // المعرّفاتُ (…id/Id/ym/idx) مولّدةٌ من النظام لا يحرّرها أحد — فتُستثنى قصداً،
    // والباقي (اسمٌ · مبنًى · مورّدٌ · وصف) هو ما يفتح البابَ إن وُضع بـesc.
    const isIdLike = e => /(^|\.)(id|tid|ym|idx|[a-z]+Id)$/i.test(e);
    const escInJs = (HTML.match(/\('\$\{esc\(([a-zA-Z_$][\w$.]*)\)\}/g) || [])
      .filter(s => !isIdLike(s.replace(/^\('\$\{esc\(/, "").replace(/\)\}$/, "")));
    T("★ لا سِنكَ esc داخل نصِّ JS لحقلٍ نصّيٍّ يحرّره المستخدم (النواة)",
      escInJs.length === 0, escInJs.slice(0, 4).join(" · ") || "نظيف");
  }

  // ── XSS في تطبيق الفنيين: esc هناك لم تكن تهرّب العلامة المفردة إطلاقاً ──
  // (أضعفُ من نظيرتها في النواة: لا `'`→`&#39;` أصلاً، فالكسرُ مباشرٌ بلا حاجةٍ
  //  إلى فكِّ الكِيان.) وأسماءُ الفنيين تُكتب من الإعدادات، ومجموعةُ technicians
  //  مفتوحةٌ لأيّ مُصادَقٍ مجهول — فالحاقنُ لا يحتاج حساباً أصلاً.
  {
    const fsT = require("fs"), pathT = require("path");
    const tp = pathT.resolve(pathT.dirname(IDX), "tech-app.html");
    const TA = fsT.existsSync(tp) ? fsT.readFileSync(tp, "utf8") : "";
    T("tech-app.html مقروء", TA.length > 0);
    if (TA) {
      T("★ tech-app: esc تهرّب العلامة المفردة (&#39;)",
        /function esc\(s\)\{[^}]*replace\(\/'\/g,\s*"&#39;"\)/.test(TA));
      T("★ tech-app: تحمل _jsq لسِنكات نصِّ JS", TA.includes("function _jsq(s){"));
      const taEscInJs = TA.match(/\('\$\{esc\([^}]*\)\}/g) || [];
      T("★ tech-app: لا سِنكَ esc داخل نصِّ JS", taEscInJs.length === 0,
        taEscInJs.slice(0, 4).join(" · ") || "نظيف");
      T("★ tech-app: اسمُ الفني في زرّ تغيير الـPIN يستخدم _jsq",
        TA.includes("changeTechPin('${_jsq(name)}')"));
      // والدالّةُ نفسُها تعمل: الحمولةُ تصل نصّاً لا شفرةً
      const ai = TA.indexOf("function _jsq(s){");
      if (ai > 0) {
        const asrc = TA.slice(ai, TA.indexOf("\nfunction ", ai + 10));
        let J = null;
        try { J = new Function(asrc + "\nreturn _jsq;")(); }
        catch (e) { T("tech-app: تُبنى _jsq", false, String(e.message).slice(0, 100)); }
        if (typeof J === "function") {
          const pl = "x');alert(1)//";
          const dec = J(pl).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
          let got = null; try { got = new Function("f", "return f('" + dec + "')")(x => x); } catch (e) {}
          T("★ tech-app: _jsq تمنع كسر السلسلة (الحمولةُ نصٌّ لا شفرة)",
            got === pl, "arg=" + JSON.stringify(got));
          T("tech-app: _jsq تُبقي القيمَ النظيفة كما هي", J("محمد العتيبي") === "محمد العتيبي");
        }
      }
    }
  }

  /* ── H2: الدورُ من التوكِن لا من تخزين الجلسة ──
     السلوكُ نفسُه يفحصه `auth-guard-check.mjs` تنفيذاً في متصفّحٍ حقيقيّ (الجلسةُ
     تُزوَّر فعلاً ثمّ يُسأل النظامُ: بأيّ دورٍ دخل؟). وهذه حرّاسُ بنيةٍ تمنع الارتداد
     الصامت: عودةُ الفحص إلى «هل يوجد دورٌ؟» بدل «ما الدورُ؟» لا تُسقط أيَّ فحصٍ آخر. */
  {
    T("★ H2: _authClaims تُعيد الحمولة (لا مجرّدَ صحيحٍ/خطأ)",
      /function _authClaims\(/.test(HTML) && HTML.includes("finish(c.role ? { role:c.role } : null)"));
    T("★ H2: لم تبقَ _ensureRoleClaim (فحصُ «وجودِ» الدور وحدَه)",
      !/_ensureRoleClaim/.test(HTML));
    T("★ H2: الاستعادةُ تُمرّر دورَ التوكِن إلى _proceedRestore",
      HTML.includes("_proceedRestore(claims.role)") &&
      /function _proceedRestore\(authRole\)/.test(HTML));
    T("★ H2: و_proceedRestore تُطبّقه على الكائن المستعاد أيّاً كان مصدرُه",
      /const found=USERS\.find\(x=>x\.user===saved\.user\)\|\|saved;\s*\n\s*if\(authRole\) found\.role = authRole;/.test(HTML));
    T("★ H2: التباينُ يُسجَّل في التدقيق لا يُبتلع صامتاً",
      HTML.includes("تباين دور الجلسة مع التوكن"));
    T("★ H2: والدخولُ يعتمد دورَ التوكِن فتتّحد الواجهةُ مع القواعد",
      /const _c = await _authClaims\(5000\);\s*\n\s*if\(_c && _c\.role\) user\.role = _c\.role;/.test(HTML));
  }

  /* ── H3 (الشقُّ الخادميّ): مصدرُ الـWorker محفوظٌ في المستودع ──
     كان يعيش في لوحة Cloudflare وحدَها — بلا نسخةٍ ولا تاريخٍ ولا مراجعة. وهو يحمل
     **بوّابةَ الدخول** لا وسيطَ الذكاء فحسب. الحرّاسُ هنا تحفظ ثلاثةَ أشياء:
     أن الحارسَ مُفعَّلٌ في النسخة المحفوظة، وأنّ `/login` يبقى خارجه، وأن **لا سرَّ
     يُلصق في الملفّ** يوماً (وهو أسهلُ خطأٍ يقع عند النسخ من اللوحة). */
  {
    const fsW = require("fs"), pathW = require("path");
    const wp = pathW.resolve(pathW.dirname(IDX), "worker/hail-ai-proxy.js");
    const W = fsW.existsSync(wp) ? fsW.readFileSync(wp, "utf8") : "";
    T("★ مصدرُ الـWorker محفوظٌ في المستودع (لا يعيش في اللوحة وحدَها)", W.length > 0);
    if (W) {
      T("★ الحارسُ مُفعَّلٌ في النسخة المحفوظة (تطابق المنشور)",
        /const AI_AUTH_ENFORCE\s*=\s*true\s*;/.test(W) &&
        !/const AI_AUTH_ENFORCE\s*=\s*false\s*;/.test(W));
      T("★ التحقّقُ بمفاتيح Google العامة لا بسرٍّ مشترك",
        /async function verifyIdToken\(/.test(W) &&
        /securetoken@system\.gserviceaccount\.com/.test(W) &&
        /crypto\.subtle\.verify/.test(W));
      T("★ يفحص جهةَ الإصدار والمشروع والصلاحية — لا التوقيعَ وحدَه",
        /securetoken\.google\.com/.test(W) && /claims\.aud !== pid/.test(W) &&
        /claims\.exp/.test(W));
      // المصيدةُ الأولى: قفلُ /login يُغلق الدخولَ على الجميع — فهو مصدرُ التوكِن نفسِه
      T("★★ ‎/login خارج الحارس (يُوجَّه قبل handleAI — وقفلُه يُغلق الدخولَ على الجميع)",
        /path\.endsWith\("\/login"\)[\s\S]{0,120}?handleLogin/.test(W));
      T("★ CORS تُدرج Authorization (وإلّا حجب المتصفّحُ الطلبَ قبل وصوله)",
        /"Access-Control-Allow-Headers":\s*"Content-Type,\s*Authorization"/.test(W));
      // ★★ ولا سرَّ في الملفّ — كلُّها من env
      // التمييزُ بين **توثيقِ الشكل** و**المفتاح الحقيقيّ**: ترويسةُ PEM وحدَها لا تكفي
      // دليلاً (الملفُّ يشرح شكلَ السرّ المتوقَّع بنقاطٍ مكان القيمة) — فالشرطُ وجودُ
      // **مادّةِ مفتاحٍ فعلية** بعدها. وإلّا كان الحارسُ إنذاراً كاذباً يُدرَّب الناسُ
      // على تجاهله، وذلك أسوأُ من غيابه.
      const leaks = [
        [/sk-ant-[A-Za-z0-9_-]{16,}/, "مفتاح Anthropic"],
        [/-----BEGIN [A-Z ]*PRIVATE KEY-----[^A-Za-z0-9+/]{0,12}[A-Za-z0-9+/]{40,}/, "مفتاح خاص"],
        [/(?:const|let|var)\s+(?:ANTHROPIC_KEY|FIREBASE_PRIVATE_KEY|DEBUG_KEY|FIREBASE_CLIENT_EMAIL)\s*=\s*["'][^"']{8,}/, "سرٌّ مكتوبٌ حرفياً"],
      ].filter(([re]) => re.test(W)).map(([, n]) => n);
      T("★★ لا سرَّ مكتوبٌ في مصدر الـWorker (كلُّها من env)",
        leaks.length === 0, leaks.join(" · ") || "نظيف");
    }
  }

  /* ── H3: نداءُ مُرحِّل الذكاء يحمل هويّةً يتحقّق منها الخادم ── */
  {
    const ai = HTML.indexOf("async function _callAnthropicAPI(");
    const body = ai > 0 ? HTML.slice(ai, HTML.indexOf("\n// ── عارض Markdown", ai)) : "";
    T("_callAnthropicAPI موجودة", body.length > 0);
    if (body) {
      T("★ H3: يُرفَق توكِنُ هويّة Firebase (Bearer) لا سرٌّ مشتركٌ في المتصفّح",
        body.includes('headers["Authorization"] = "Bearer " + token') &&
        /async function _aiIdToken\(\)/.test(HTML) && /getIdToken\(\)/.test(HTML));
      T("★ H3: ولا مفتاحَ Anthropic يُرسَل من المتصفّح",
        !/x-api-key/i.test(body) && !/sk-ant/i.test(HTML));
      T("★ H3: سقوطٌ آمنٌ إن لم يُحدَّث الـWorker (لا تُعطَّل خصائصُ الذكاء)",
        body.includes("_aiAuthHeaderOk = false") && body.includes("res = await attempt(false)"));
      T("★ H3: والمهلةُ الحقيقيةُ لا تُعاد (AbortError يُمرَّر — لا مضاعفةَ استهلاك)",
        /e\.name !== "AbortError"/.test(body));
      T("★ H3: مهلةٌ مستقلّةٌ لكلّ محاولة (لا ترث الثانيةُ بقيّةَ الأولى)",
        /const attempt = async \(withAuth\)=>\{[\s\S]{0,200}?const ctrl = new AbortController\(\)/.test(body));
    }
  }

  // ── #4 SLA: _closedOnTime يقيس بميزانية ساعات العمل (16 لعادي) لا getSLA (48 تقويمية) ──
  const b = HTML.indexOf("function _closedOnTime(t){");
  if (b < 0) { T("_closedOnTime دالة عليا موحّدة", false); }
  else {
    const src = HTML.slice(b, HTML.indexOf("\nfunction ", b + 10));
    let fn;
    try {
      fn = new Function("tierOf", "SLA_CONFIG", "_closeWorkH", src + "\nreturn _closedOnTime;")(
        p => p, { tiers: { 'عادي': { budgetMin: 16 * 60 } } }, t => t._wh);
    } catch (e) { T("تُبنى _closedOnTime", false, String(e.message).slice(0, 100)); }
    if (typeof fn === "function") {
      const mk = wh => ({ priority: 'عادي', status: 'مغلق', createdAt: 1, closedAt: 2, _wh: wh });
      T("★ «عادي» بعد 20 ساعة عمل = متأخّر (مهلة 16 لا 48)", fn(mk(20)) === false);
      T("«عادي» خلال 10 ساعات عمل = ملتزم", fn(mk(10)) === true);
      T("«عادي» عند 16 بالضبط = ملتزم (الحدّ)", fn(mk(16)) === true);
      T("غير المغلق ليس «ملتزماً»", fn({ priority: 'عادي', status: 'مفتوح', _wh: 1 }) === false);
    }
    T("KPI-03 يستخدم _closedOnTime", HTML.includes("closedTix.filter(_closedOnTime)"));
    T("★ زال قياس الالتزام بـ getSLA التقويمي", !HTML.includes("return h<=getSLA(t.priority);") && !HTML.includes("if(h <= getSLA(t.priority))"));
  }

  // ── #3 Excel: التصدير يمرّ على المفلتر لا purchases كاملاً ──
  T("مصدر فلترة التقرير موحّد", HTML.includes("function _purchaseReportFiltered(){"));
  T("★ تصدير Excel يستخدم المفلتر", HTML.includes("const _rep=_purchaseReportFiltered();") && HTML.includes("_rep.forEach(p=>{"));
  T("شاشة التقرير تستخدم المصدر الموحّد", HTML.includes("let filtered=_purchaseReportFiltered();"));

  // ── #2 نقل المخزون: إعادة الحساب تعالج transfer، والكتابة تسجّل الوجهة ──
  T("★ إعادة الحساب تعالج حركة transfer", HTML.includes('} else if(t==="transfer"){'));
  T("النقل: خصمٌ من المصدر وإضافةٌ للوجهة في إعادة الحساب",
    HTML.includes("const destId = log.destItemId;") && HTML.includes("balanceMap[destId].qty += qty;"));
  T("كتابة النقل تسجّل معرّف الوجهة destItemId", HTML.includes("destItemId:destDocId"));
  T("حارس NaN في إعادة الحساب", HTML.includes("parseFloat(log.qty)||0;"));
}

/* ════════════════════════════════════════════════════════════════════
   16) توحيد تجميع التواريخ على التوقيت المحلّي (لا UTC)
   ════════════════════════════════════════════════════════════════════ */
function dateBucketing() {
  H("16) توحيد تجميع التواريخ على التوقيت المحلّي");
  const grab = name => {
    const i = HTML.indexOf("function " + name + "(");
    if (i < 0) return null;
    return HTML.slice(i, HTML.indexOf("\n", i));
  };
  const src = [grab("_ymd"), grab("_ym"), grab("_parseLocalDate")].filter(Boolean).join("\n");
  let _ymd, _ym, _parseLocalDate;
  try {
    const o = new Function(src + "\nreturn {_ymd:_ymd,_ym:_ym,_parseLocalDate:_parseLocalDate};")();
    _ymd = o._ymd; _ym = o._ym; _parseLocalDate = o._parseLocalDate;
  } catch (e) { T("تُبنى دوال التاريخ", false, String(e.message).slice(0, 100)); return; }
  T("_ym/_ymd/_parseLocalDate مبنيّة",
    typeof _ym === "function" && typeof _ymd === "function" && typeof _parseLocalDate === "function");
  if (typeof _ym !== "function") return;

  // مكوّنات محلّية — النتيجة مستقلّة عن منطقة زمن الجهاز
  T("_ymd يقرأ اليوم المحلّي", _ymd(new Date(2026, 0, 5, 1, 30)) === "2026-01-05");
  T("_ym يقرأ الشهر المحلّي", _ym(new Date(2026, 6, 1, 1, 30)) === "2026-07");
  // ★ تاريخ-فقط لا ينزلق ليومٍ سابق (يُحلّل منتصف نهارٍ محلّي) — في أي منطقة زمن
  T("★ _parseLocalDate: «2026-07-01» يبقى 1 يوليو محلياً", _ymd(_parseLocalDate("2026-07-01")) === "2026-07-01");
  T("_parseLocalDate يمرّر الطوابع الكاملة كما هي", _parseLocalDate("2026-07-01T09:00:00Z") instanceof Date);

  // حراسة: المواضع المُبلَّغة صارت تمرّ عبر المساعدات المحلّية
  T("تاريخ «من» الافتراضي محلّي", HTML.includes("rfrom.value=_ymd(firstDay)"));
  T("★ المتابعة اليومية تُطابق باليوم المحلّي", HTML.includes("_ymd(new Date(t.createdAt))===selectedStr"));
  T("★ مخطّط إنفاق المشتريات بمفتاح شهر محلّي", HTML.includes("const dateStr=_dt?_ym(new Date(_dt)):"));
  T("poApprovedThisMonth محلّي الطرفين", HTML.includes("_ym(new Date(t)) === (ym || _ym(new Date()))"));
  T("لوحة المشتريات thisMonth محلّي", HTML.includes("const thisMonth = _ym(now);"));
  T("تأخّر الطلب يحلّل تاريخ-فقط محلياً", HTML.includes("const exp = _parseLocalDate(d)"));
  T("★ فلتر تاريخ قائمة الطلبات باليوم المحلّي", HTML.includes("_ymd(new Date(p.createdAt)) < fFrom"));
  T("مدى فلتر التاريخ يحلّل «من» محلياً", HTML.includes('new Date(from+"T00:00:00")'));
}

/* ════════════════════════════════════════════════════════════════════
   17) أربعة إصلاحات متوسطة (جولة التدقيق الثانية) — مخزون/تقارير/KPI
   ════════════════════════════════════════════════════════════════════ */
function auditRound2Medium() {
  H("17) أربع إصلاحات متوسطة (مخزون/تقارير/KPI)");

  // #1 تصدير Excel للمخزون: مصدر فلترة موحّد يستبعد المدموج ويطبّق الفلاتر
  T("مصدر فلترة المخزون موحّد", HTML.includes("function _inventoryFiltered(){"));
  T("فلترة المخزون تستبعد المدموج", HTML.includes("_inventoryItems.filter(x=>!(x && x.mergedInto))"));
  T("عرض المخزون يستخدم المصدر الموحّد", HTML.includes("let items = _inventoryFiltered();"));
  T("★ تصدير Excel للمخزون يستخدم المصدر الموحّد (لا _inventoryItems الخام)",
    HTML.includes("const items = _inventoryFiltered();") && !HTML.includes("const items = _inventoryItems;\n    if(!items||!items.length){ toast(\"⚠ لا يوجد مخزون للتصدير"));

  // #2 doInventoryReview: يسجّل الخصم الفعلي (بعد القصر) لا الكامل المطلوب
  T("★ مراجعة المخزون تسجّل الخصم الفعلي", HTML.includes("const actualOut = Math.round((prevQty - newQty)*1000)/1000;") && HTML.includes("qty:actualOut,"));
  T("زال تسجيل الكمية الكاملة الخام", !HTML.includes("qty:si.fromStock, relatedPO:poId"));

  // #3 المقارنة الشهرية: كلاهما من allTickets() وبلا استبعاد archived
  T("★ المقارنة الشهرية من allTickets()", HTML.includes("return allTickets().filter(t=>{\n      if(!t.createdAt) return false;"));
  T("زال استبعاد المؤرشف من «المستلمة»", !HTML.includes("d.getMonth()===m && !t.archived"));

  // #4 KPI-03: مقام معدّل SLA = المغلقة القابلة للقياس (ذات الطوابع)
  T("★ مقام SLA = closedTix.length لا closed", HTML.includes("closedTix.length?Math.round(closedInSLA/closedTix.length*100):0"));
  T("زال المقام الخاطئ (closed)", !HTML.includes("closed?Math.round(closedInSLA/closed*100):0"));
}

/* ════════════════════════════════════════════════════════════════════
   8) فحص الثوابت العشوائي
      الأمثلة المكتوبة تُثبت ما خطر ببالنا. هذه تُجرّب ما لم يخطر:
      آلاف التركيبات العشوائية، والحكم ليس قيمة متوقعة مكتوبة بيد،
      بل ثابت رياضي يجب ألا ينكسر مهما كان المدخل.
      البذرة ثابتة → أي فشل يُعاد إنتاجه حرفياً:
         HAIL_SEED=20260717 node hail-tests.js
      مجال العيّنات = ما تقبله الواجهة فعلاً: مضاعفات 0.01 (step)،
      وأحياناً 3 خانات عشرية لملامسة حدّ _r3.
   ════════════════════════════════════════════════════════════════════ */
function fuzz() {
  H("8) فحص الثوابت العشوائي");
  const SEED = parseInt(process.env.HAIL_SEED || "20260717", 10) >>> 0;
  let _s = SEED;
  const rnd = () => {                                    // mulberry32 — قابل لإعادة الإنتاج
    _s = (_s + 0x6D2B79F5) | 0;
    let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const _r3  = n => Math.round(n * 1000) / 1000;
  const qty  = (max = 500) => { const d = rnd() < 0.15 ? 1000 : 100; return Math.round(rnd() * max * d) / d; };
  const J    = o => JSON.stringify(o);
  console.log(`   البذرة: ${SEED}   (HAIL_SEED=${SEED} node hail-tests.js لإعادة إنتاج أي فشل)`);

  /* ── ثوابت 1–4: waUpdateRow — ثلاثة صفوف، عمليات عشوائية ── */
  (function () {
    const a = HTML.indexOf("function waUpdateRow(i, src){");
    if (a < 0) { T("waUpdateRow موجودة للفحص العشوائي", false, "لم تُعثر"); return; }
    const fnSrc = HTML.slice(a, HTML.indexOf("\nfunction ", a + 10));

    const N = 3;
    const rows = Array.from({ length: N }, (_, i) => `
      <input class="wa-rcv-qty" data-idx="${i}" data-req="10" value="10">
      <input class="wa-stock-qty" data-idx="${i}" value="10">
      <input class="wa-direct-qty" data-idx="${i}" value="0">
      <input class="wa-unit-price" data-idx="${i}" value="12.5">
      <span id="wa-row-total-${i}"></span>`).join("");
    const { JSDOM } = require("jsdom");
    const dom = new JSDOM(`<!DOCTYPE html><body>
      <div id="wa-shortage-warn" style="display:none"></div>
      <div id="wa-direct-use-info" style="display:none"></div>
      <div id="wa-gap-warn" style="display:none"><span data-gap-msg></span></div>${rows}
      <span id="wa-total-qty"></span><span id="wa-total-stock"></span>
      <span id="wa-total-direct"></span><span id="wa-total-cost"></span>
    </body>`, { runScripts: "dangerously" });
    dom.window.eval(fnSrc);
    const W = dom.window, doc = W.document;
    const el  = (cls, i) => doc.querySelector(`.wa-${cls}[data-idx="${i}"]`);
    const raw = (cls, i) => el(cls, i).value;
    const num = (cls, i) => parseFloat(raw(cls, i)) || 0;
    const set = (cls, i, v) => { el(cls, i).value = String(v); };
    const gapShown = () => doc.getElementById("wa-gap-warn").style.display !== "none";
    const dec = s => { const m = String(s).match(/\.(\d+)$/); return m ? m[1].length : 0; };

    let e1 = null, e2 = null, e3 = null, e4 = null, ops = 0;
    const ROUNDS = 800;
    for (let k = 0; k < ROUNDS; k++) {
      const i   = Math.floor(rnd() * N);
      const src = pick(["rcv", "rcv", "rcv", "direct", "direct", "direct", "stock", "stock", "price", "init"]);
      let manual = null;
      if (src === "rcv")    set("rcv-qty", i, rnd() < 0.08 ? "" : qty());
      if (src === "direct") set("direct-qty", i, qty(rnd() < 0.30 ? 900 : 200)); // أحياناً أكبر من المستلم عمداً
      if (src === "stock")  { manual = qty(); set("stock-qty", i, manual); }
      if (src === "price")  set("unit-price", i, qty(300));
      W.waUpdateRow(i, src);
      ops++;

      // ث1: لا وحدة تُخلق ولا تضيع — المستودع + المباشر = المستلم، ولا سالب، ولا مباشر يتخطى المستلم
      if (!e1 && (src === "rcv" || src === "direct" || src === "init") && raw("rcv-qty", i) !== "") {
        const r = num("rcv-qty", i), s = num("stock-qty", i), d = num("direct-qty", i);
        if (Math.abs(s + d - r) > 0.001 || s < -0.001 || d < -0.001 || d > r + 0.001)
          e1 = { عملية: src, صف: i, مستلم: r, مستودع: s, مباشر: d };
      }

      // ث2: تحذير الفجوة يظهر تماماً حين يختل التوزيع — لا قبله ولا بعده
      if (!e2) {
        let mid = false, g = 0;
        for (let j = 0; j < N; j++) {
          if (raw("rcv-qty", j) === "") { mid = true; continue; }   // قيد الكتابة — يُتجاهل
          g += num("rcv-qty", j) - num("stock-qty", j) - num("direct-qty", j);
        }
        g = _r3(g);
        const want = Math.abs(g) > 0.001;
        if (gapShown() !== want) e2 = { الفجوة: g, قيدالكتابة: mid, ظاهر: gapShown(), المتوقع: want };
      }

      // ث3: لمسة المستودع اليدوية لا تُدهس
      if (!e3 && src === "stock" && Math.abs(num("stock-qty", i) - manual) > 1e-9)
        e3 = { كُتب: manual, صار: raw("stock-qty", i) };

      // ث4: إجماليات الذيل = مجموع الصفوف، ومعروضة كرقم نظيف (≤ 3 خانات)
      if (!e4) {
        const cols = [["qty", "rcv-qty"], ["stock", "stock-qty"], ["direct", "direct-qty"]];
        for (const [foot, cls] of cols) {
          let sum = 0;
          for (let j = 0; j < N; j++) sum += num(cls, j);
          sum = _r3(sum);
          const txt  = doc.getElementById("wa-total-" + foot).textContent;
          const shown = txt === "—" ? 0 : parseFloat(txt) || 0;
          if (Math.abs(shown - sum) > 0.001 || dec(txt) > 3)
            { e4 = { الذيل: foot, معروض: txt, المجموع: sum }; break; }
        }
      }
    }
    T("★ ثابت: المستودع + المباشر = المستلم دائماً (لا وحدة تُخلق ولا تضيع)", !e1,
      e1 ? "انكسر: " + J(e1) : ops + " عملية عشوائية على " + N + " صفوف");
    T("★ ثابت: تحذير الفجوة يطابق الحساب تماماً", !e2, e2 ? "انكسر: " + J(e2) : "");
    T("ثابت: قيمة المستودع اليدوية لا تُدهس", !e3, e3 ? "انكسر: " + J(e3) : "");
    T("★ ثابت: إجماليات الذيل = مجموع الصفوف، بعرض نظيف", !e4, e4 ? "انكسر: " + J(e4) : "");
  })();

  /* ── ث5: عكس المخزون عند الحذف ── */
  (function () {
    const a = HTML.indexOf("        const _rev = new Map();");
    const b = HTML.indexOf("        const _entries = [..._rev.entries()]", a);
    if (a < 0 || b < 0) { T("منطق العكس موجود للفحص العشوائي", false, "لم يُعثر"); return; }
    const core = HTML.slice(a, HTML.indexOf("\n", b));
    const rev  = po => new Function("po", "_r3", core + "\n return _entries;")(po, _r3);
    const IDS  = ["a", "b", "c", "d"];

    let e5 = null, e6 = null, e7 = null, n = 0;
    for (let k = 0; k < 500; k++) {
      const po = { auditItems: [], items: [] };
      const exp = new Map();
      const bump = (id, v) => { if (id) exp.set(id, (exp.get(id) || 0) + v); };
      for (let j = Math.floor(rnd() * 5); j > 0; j--) {
        const id = rnd() < 0.10 ? "" : pick(IDS);
        const q  = rnd() < 0.15 ? 0 : qty(200);
        po.auditItems.push({ itemId: id, itemName: "ص" + id, unit: "عدد", stockQty: q, directQty: qty(50) });
        if (q > 0) bump(id, -q);                       // ما دخل المستودع يخرج
      }
      for (let j = Math.floor(rnd() * 5); j > 0; j--) {
        const id = rnd() < 0.10 ? "" : pick(IDS);
        const q  = rnd() < 0.15 ? 0 : qty(200);
        po.items.push({ itemId: id, itemName: "ص" + id, qty: qty(200), _fromStock: q });
        if (q > 0) bump(id, q);                        // ما سُحب من المخزون يعود
      }
      const want = [...exp.entries()].map(([id, v]) => [id, _r3(v)]).filter(([, v]) => Math.abs(v) > 0.0001);
      const got  = rev(po).map(([id, e]) => [id, e.delta]);
      n++;
      const srt  = x => x.slice().sort((p, q2) => (p[0] < q2[0] ? -1 : 1));
      const G = srt(got), Wt = srt(want);
      const same = G.length === Wt.length && G.every(([id, v], ix) => id === Wt[ix][0] && Math.abs(v - Wt[ix][1]) < 0.001);
      if (!e5 && !same) e5 = { الطلب: po, نتج: got, المتوقع: want };
      if (!e6 && new Set(got.map(x => x[0])).size !== got.length) e6 = { نتج: got };
      if (!e7 && !got.every(([, v]) => Math.abs(v) > 0.0001)) e7 = { نتج: got };
    }
    T("★ ثابت: الصافي = مجموع ما سُحب − مجموع ما استُلم للمستودع", !e5,
      e5 ? "انكسر: " + J(e5) : n + " طلباً عشوائياً");
    T("ثابت: لا صنف يُكتب مرتين في العكس الواحد", !e6, e6 ? "انكسر: " + J(e6) : "");
    T("ثابت: لا كتابة بصافٍ صفري", !e7, e7 ? "انكسر: " + J(e7) : "");
  })();

  /* ── ث6: تعديل الرصيد ── */
  (function () {
    const c = HTML.indexOf("        const _res = await db.runTransaction(async tx=>{");
    const d = HTML.indexOf("          return { newQty:nq, delta:dl, liveQty };", c);
    if (c < 0 || d < 0) { T("منطق تعديل الرصيد موجود للفحص العشوائي", false, "لم يُعثر"); return; }
    const body = HTML.slice(HTML.indexOf("const snap = await tx.get(invRef);", c), d)
      .replace("const snap = await tx.get(invRef);", "")
      .replace("const liveQty = snap.exists ? (parseFloat(snap.data().currentQty)||0) : 0;", "")
      .replace(/tx\.set\([\s\S]*?\}\);/g, "");
    const calc = (type, q, live) =>
      new Function("type", "qty", "liveQty", "_r3", body + "\n return {nq, dl};")(type, q, live, _r3);

    let e8 = null, e9 = null, e10 = null, n = 0;
    for (let k = 0; k < 900; k++) {
      const type = pick(["set", "add", "subtract"]);
      const q = qty(2000), live = qty(2000);
      const r = calc(type, q, live);
      n++;
      if (!e8  && Math.abs((r.nq - live) - r.dl) > 0.0001) e8  = { type, q, live, r };
      if (!e9  && r.nq < -0.0001)                          e9  = { type, q, live, r };
      if (!e10 && type === "set" && Math.abs(r.nq - q) > 1e-9) e10 = { type, q, live, r };
    }
    T("★ ثابت: (الرصيد الجديد − الحي) = adjustDelta على قيم كسرية عشوائية", !e8,
      e8 ? "انكسر: " + J(e8) : n + " تركيبة عشوائية");
    T("ثابت: الرصيد لا يصير سالباً أبداً", !e9, e9 ? "انكسر: " + J(e9) : "");
    T("ثابت: \"تحديد\" يُنتج الرقم المُحدَّد بلا زيادة ولا نقص", !e10, e10 ? "انكسر: " + J(e10) : "");
  })();
}

/* ════════════════════════════════════════════════════════════════════
   18) عزل ملخّصات الأشهر (Rollups) — أرشفة شهر لا تمسّ أرشيف/ملخّص شهر آخر
       يُنفّذ دوال الحساب الحقيقية من index.html، ويحرس نمط الكتابة المعزول.
   ════════════════════════════════════════════════════════════════════ */
function rollupMonthIsolation() {
  H("18) عزل ملخّصات الأشهر — أرشفة يوليو لا تمسّ يونيو");

  const mkSrc     = slice("function monthKey(dateStr){", "// Arabic month name");
  const rollupSrc = slice("function _emptyRollup(ym){", "// كتابة rollup لشهر معيّن");
  if (!mkSrc || !rollupSrc) { T("تُستخرَج دوال الـ rollup", false, "تغيّرت العلامات في index.html؟"); return; }

  let R;
  try {
    // _emptyRollup يعتمد CURRENT_PROJECT/ROLLUP_FV، و_accumTicket يعتمد _closeWorkH/_closedOnTime
    // (حقول زمنية لا تؤثر على حقول العدّ الهيكلية موضع هذا الفحص).
    R = new Function("CURRENT_PROJECT", "ROLLUP_FV", "_closeWorkH", "_closedOnTime",
      mkSrc + "\n" + rollupSrc +
      "\nreturn {monthKey,_emptyRollup,_accumTicket,_computeRollupForMonth};"
    )({ id: "hail" }, 2, () => 5, () => true);
  } catch (e) { T("تُبنى دوال الـ rollup", false, String(e.message).slice(0, 120)); return; }

  const { monthKey, _computeRollupForMonth } = R;

  // محاكاة أمينة لكتابة Firestore: doc(ym).set(r,{merge:false}) = استبدال المفتاح ym وحده لا غير
  const rollupsDB = {};   // مجموعة الملخّصات: المفتاح = اسم الشهر
  const ticketsDB = [];   // مستندات البلاغات
  function writeRollupForMonth(ym) {
    const list = ticketsDB.filter(t => t.archiveMonth === ym);   // where("archiveMonth","==",ym)
    if (!list.length) return;
    rollupsDB[ym] = _computeRollupForMonth(ym, list);            // doc(ym).set(r,{merge:false})
  }
  function archiveMonth(ym) {
    let n = 0;
    ticketsDB.forEach(t => {
      if (t.archived || t.status !== "مغلق") return;
      if (monthKey(t.createdAt) !== ym) return;
      t.archived = true; t.archiveMonth = ym; n++;
    });
    if (n) writeRollupForMonth(ym);
    return n;
  }

  ticketsDB.push(
    // يونيو: 3 بلاغات مغلقة (تصحيحية/وقائية/معاد فتحه)
    { id: "J1", status: "مغلق", createdAt: "2026-06-05", maintType: "تصحيحية", building: "مبنى أ", rating: 5, reopenCount: 0, closedAt: "2026-06-06" },
    { id: "J2", status: "مغلق", createdAt: "2026-06-12", maintType: "وقائية",  building: "مبنى ب", rating: 4, reopenCount: 0, closedAt: "2026-06-13" },
    { id: "J3", status: "مغلق", createdAt: "2026-06-20", maintType: "تصحيحية", building: "مبنى أ", rating: 0, reopenCount: 1, closedAt: "2026-06-22" },
    // يوليو: بلاغان مغلقان
    { id: "Y1", status: "مغلق", createdAt: "2026-07-03", maintType: "تصحيحية", building: "مبنى ج", rating: 3, reopenCount: 0, closedAt: "2026-07-04" },
    { id: "Y2", status: "مغلق", createdAt: "2026-07-15", maintType: "وقائية",  building: "مبنى أ", rating: 5, reopenCount: 0, closedAt: "2026-07-16" },
  );

  archiveMonth("2026-06");
  const juneSnapshot = JSON.stringify(rollupsDB["2026-06"]);
  T("بعد أرشفة يونيو: أُنشئ ملخّص 2026-06 بعدد 3", !!rollupsDB["2026-06"] && rollupsDB["2026-06"].count === 3);
  T("لم يُنشأ ملخّص يوليو قبل أرشفته", !rollupsDB["2026-07"]);

  archiveMonth("2026-07");
  T("★ بعد أرشفة يوليو: ملخّص يونيو لم يتغيّر إطلاقاً (بايت-ببايت)",
    JSON.stringify(rollupsDB["2026-06"]) === juneSnapshot, "يونيو=" + JSON.stringify(rollupsDB["2026-06"]));
  T("ملخّص يونيو ما زال count=3", !!rollupsDB["2026-06"] && rollupsDB["2026-06"].count === 3);
  T("أُنشئ ملخّص يوليو count=2", !!rollupsDB["2026-07"] && rollupsDB["2026-07"].count === 2);
  T("بلاغات يونيو الثلاثة ما زالت archiveMonth=2026-06", ticketsDB.filter(t => t.archiveMonth === "2026-06").length === 3);
  T("لم يُحذف أي بلاغ عند الأرشفة", ticketsDB.length === 5);

  writeRollupForMonth("2026-07"); // إعادة كتابة يوليو مجدداً
  T("★ إعادة كتابة ملخّص يوليو ثانيةً لا تغيّر يونيو", JSON.stringify(rollupsDB["2026-06"]) === juneSnapshot);

  // ── حراسة نمط الكتابة في المصدر: يجب أن يبقى معزولاً لشهر واحد ──
  T("writeRollupForMonth يستعلم عن شهر واحد فقط", HTML.includes('.where("archiveMonth","==",ym).get()'));
  T("★ الكتابة تستبدل مستند الشهر نفسه فقط (doc(ym).set merge:false)", HTML.includes("doc(ym).set(r,{merge:false})"));
  T("تنظيف Rollups اليتيمة يحذف شهراً فقط بعد التأكد أنه بلا بلاغات",
    HTML.includes('.where("archiveMonth","==",ym).limit(1)') && HTML.includes("doc(ym).delete()"));
}

/* ════════════════════════════════════════════════════════════════════
   19) تشغيل النظافة (cleaning-operations.js) — الجدول اليومي والتغطية
       منطق الاستحقاق (مستحقّ/متأخّر/نُفِّذ اليوم) ونسبة التغطية وتقديم الاستحقاق.
   ════════════════════════════════════════════════════════════════════ */
function cleaningOpsTests() {
  H("19) تشغيل النظافة (cleaning-operations.js)");
  const CO_PATH = [path.resolve(path.dirname(IDX), "cleaning-operations.js")].find(p => fs.existsSync(p));
  // وحدة إدارة المشاريع — لنتحقّق أن البطاقة المالية باقيةٌ فيها بعد فصلها عن التشغيل
  const PM_PATH = [path.resolve(path.dirname(IDX), "project-management.js")].find(p => fs.existsSync(p));
  const PM_SRC = PM_PATH ? fs.readFileSync(PM_PATH, "utf8") : "";
  if (!CO_PATH) { console.log("  ⏭  cleaning-operations.js غير موجود — تُخطّى"); return; }
  const vm = require("vm");
  const src = fs.readFileSync(CO_PATH, "utf8");
  try { new vm.Script(src); T("صياغة cleaning-operations.js سليمة", true); }
  catch (e) { T("صياغة cleaning-operations.js سليمة", false, String(e.message).slice(0, 120)); return; }
  T("الوسم موجود في index.html", /<script src="cleaning-operations\.js\?v=/.test(HTML));

  // ★ انضباط المستمعين: الوحدة لا تركّب مستمعاً حيّاً إطلاقاً (تخفيف خلل ca9/b815).
  // نفحص الاستدعاء الفعلي `.onSnapshot(` لا ذكر الاسم في التعليقات.
  T("★ بلا onSnapshot — القراءة بـ .get() فقط", !/\.onSnapshot\s*\(/.test(src));

  const docStub = {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: () => {}, head: { appendChild() {} }, body: { appendChild() {} },
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, setAttribute() {}, dataset: {} })
  };
  const sandbox = {
    window: {}, document: docStub, console,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    MutationObserver: function () { this.observe = () => {}; },
    // نحاكي شكل _svgIcon الحقيقي في النواة: <svg> **بلا** width/height — وهو منشأ
    // «الأيقونة العملاقة». وشكلاً بلا سماتٍ إطلاقاً للتحقّق من إحكام البديل.
    _svgIcon: (n) => n === "__bare__" ? "<svg></svg>"
                   : (n ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M1 1"/></svg>' : "")
  };
  vm.createContext(sandbox);
  try { vm.runInContext(src, sandbox); } catch (e) { T("تُحمَّل cleaningOps", false, String(e.message).slice(0, 120)); return; }
  const CO = sandbox.window.cleaningOps;
  T("cleaningOps مكشوفة بدوالها النقية",
    !!(CO && typeof CO._boardStats === "function" && typeof CO._isDue === "function" && CO._FREQ_DAYS));
  if (!CO || !CO._boardStats) return;

  // ── التكرارات تطابق تكرارات الوقائية القائمة (PPM_FREQ_DAYS) — مصطلحٌ واحد ──
  const ppmFreq = (HTML.match(/const PPM_FREQ_DAYS = \{([^}]+)\}/) || [])[1] || "";
  const ppmKeys = [...ppmFreq.matchAll(/"([^"]+)":\s*\d+/g)].map(m => m[1]);
  const coKeys = Object.keys(CO._FREQ_DAYS);
  T("★ تكرارات النظافة تطابق تكرارات الوقائية (مصطلحٌ واحد)",
    ppmKeys.length > 0 && ppmKeys.every(k => coKeys.includes(k)),
    `PPM=[${ppmKeys}] النظافة=[${coKeys}]`);
  T("«يومي» = يوم واحد (قلب جدول النظافة)", CO._FREQ_DAYS["يومي"] === 1);

  const today = CO._today();
  const day = n => CO._addDays(today, n);
  const mk = (o) => Object.assign({ id: "t", name: "م", freq: "يومي", nextDueDate: today, lastExecuted: "", disabled: false }, o);

  // ── منطق الاستحقاق ──
  T("مستحقّة اليوم = due", CO._isDue(mk({ nextDueDate: today })) === true);
  T("مستحقّة غداً ليست due", CO._isDue(mk({ nextDueDate: day(1) })) === false);
  T("★ متأخّرة (أمس) = due و overdue معاً", CO._isDue(mk({ nextDueDate: day(-1) })) === true && CO._isOverdue(mk({ nextDueDate: day(-1) })) === true);
  T("مستحقّة اليوم ليست overdue", CO._isOverdue(mk({ nextDueDate: today })) === false);
  T("★ المنفَّذة اليوم لا تعود مستحقّة (لا تُحسب مرّتين)",
    CO._isDue(mk({ nextDueDate: today, lastExecuted: new Date().toISOString() })) === false);
  T("★ الموقوفة تُستبعَد من الاستحقاق والتأخّر",
    CO._isDue(mk({ nextDueDate: day(-5), disabled: true })) === false && CO._isOverdue(mk({ nextDueDate: day(-5), disabled: true })) === false);

  // ── نسبة التغطية = المنفَّذ اليوم ÷ (المنفَّذ + المستحقّ) ──
  const nowISO = new Date().toISOString();
  const s1 = CO._boardStats([
    mk({ id: "a", lastExecuted: nowISO, nextDueDate: day(1) }),   // نُفِّذت اليوم
    mk({ id: "b", lastExecuted: nowISO, nextDueDate: day(1) }),   // نُفِّذت اليوم
    mk({ id: "c", nextDueDate: today }),                          // مستحقّة
    mk({ id: "d", nextDueDate: day(-2) }),                        // متأخّرة
    mk({ id: "e", nextDueDate: day(5) })                          // لاحقاً — خارج جدول اليوم
  ]);
  T("مجدول اليوم = المنفَّذ + المستحقّ (لا يشمل اللاحق)", s1.scheduled === 4, JSON.stringify(s1));
  T("نُفِّذ اليوم = 2", s1.done === 2);
  T("متبقٍّ اليوم = 2", s1.due === 2);
  T("متأخّر = 1", s1.overdue === 1);
  T("★ التغطية = 2/4 = 50%", s1.coverage === 50, "التغطية=" + s1.coverage);

  const s2 = CO._boardStats([mk({ id: "x", lastExecuted: nowISO, nextDueDate: day(1) })]);
  T("★ كل المجدول منفَّذ ⇒ تغطية 100%", s2.coverage === 100 && s2.due === 0);
  const s3 = CO._boardStats([mk({ id: "y", nextDueDate: day(9) })]);
  T("★ لا شيء مجدولٌ اليوم ⇒ تغطية 0% بلا قسمةٍ على صفر", s3.coverage === 0 && s3.scheduled === 0);
  const s4 = CO._boardStats([mk({ id: "z", nextDueDate: day(-1), disabled: true })]);
  T("الموقوفة لا تدخل الإجمالي", s4.total === 0 && s4.scheduled === 0);

  // ── ثابت: التغطية دائماً بين 0 و 100 مهما كان الخليط ──
  let bad = null;
  for (let i = 0; i < 300; i++) {
    const n = 1 + Math.floor(Math.random() * 8);
    const list = Array.from({ length: n }, (_, k) => {
      const r = Math.random();
      return mk({
        id: "r" + k,
        lastExecuted: r < 0.34 ? nowISO : "",
        nextDueDate: day(Math.floor(Math.random() * 9) - 4),
        disabled: Math.random() < 0.15
      });
    });
    const s = CO._boardStats(list);
    if (s.coverage < 0 || s.coverage > 100 || s.done + s.due !== s.scheduled) { bad = JSON.stringify(s); break; }
  }
  T("★ ثابت: 0 ≤ التغطية ≤ 100 و (نُفِّذ + متبقٍّ) = المجدول", bad === null, bad || "300 تركيبة عشوائية");

  // ── التنفيذ يقدّم الاستحقاق من **اليوم** لا من الاستحقاق الفائت (لا تتراكم الفوائت) ──
  T("★ التنفيذ ينقل الاستحقاق من اليوم بمقدار التكرار (مع ترحيل العطلة)",
    src.includes("nextDueDate: _advanceDue(_today(), days)"));
  T("_addDays يومٌ واحد يساوي الغد", CO._addDays(today, 1) === day(1));

  // ══ ★ v18.9ve: الجمعة والسبت إجازة في مشاريع النظافة ══
  // تواريخ صريحة (لا تعتمد على يوم تشغيل الفحص): 2026-07-30 خميس · 07-31 جمعة · 08-01 سبت · 08-02 أحد.
  if (CO && typeof CO._isWeekend === "function") {
    const THU="2026-07-30", FRI="2026-07-31", SAT="2026-08-01", SUN="2026-08-02", MON="2026-08-03";
    T("★ الجمعة والسبت عطلة، والأحد–الخميس عمل",
      CO._isWeekend(FRI)===true && CO._isWeekend(SAT)===true &&
      CO._isWeekend(SUN)===false && CO._isWeekend(THU)===false && CO._isWeekend(MON)===false);
    T("★ ترحيل الاستحقاق الواقع في العطلة لأوّل يوم عمل (الأحد)",
      CO._nextWorkingDay(FRI)===SUN && CO._nextWorkingDay(SAT)===SUN && CO._nextWorkingDay(SUN)===SUN && CO._nextWorkingDay(MON)===MON);
    T("★ يومي نُفِّذ الخميس ⟵ يُستحقّ الأحد (يتخطّى الجمعة/السبت)",
      CO._advanceDue(THU, 1)===SUN);
    T("★ يومي نُفِّذ الأحد ⟵ الاثنين (يوم عمل، بلا ترحيل)",
      CO._advanceDue(SUN, 1)===MON);
    T("★ أسبوعي نُفِّذ الأحد ⟵ الأحد التالي (7 أيام، يوم عمل)",
      CO._advanceDue(SUN, 7)==="2026-08-09" && CO._isWeekend("2026-08-09")===false);
    T("★ شهري (30 يوماً) يقع على سبت ⟵ يُرحَّل للأحد",
      CO._advanceDue(THU, 30)==="2026-08-30" && CO._isWeekend("2026-08-30")===false);
    // التأخّر بأيام العمل فقط — عطلةٌ بين الاستحقاق واليوم لا تُحتسب
    T("★ التأخّر بأيام العمل: استحقاق الخميس واليوم الأحد ⟵ يوم واحد (لا 3)",
      CO._overdueWorkingDays(THU, SUN)===1);
    T("★ التأخّر بأيام العمل: استحقاق الخميس واليوم الاثنين ⟵ يومان (لا 4)",
      CO._overdueWorkingDays(THU, MON)===2);
    T("مهمةٌ في موعدها ليست متأخّرة", CO._overdueWorkingDays(SUN, SUN)===0);
    // الوصل بالسلوك: isDue/isOverdue/dueStatus/boardStats تحترم الإجازة، والإنشاء يرحّل
    T("★ إشارةُ الإجازة تُبثّ في boardStats وتحترمها isDue/isOverdue",
      /return \{[^}]*holiday:_isTodayHoliday\(\)[^}]*\}/.test(src) &&
      /function isDue\(t\)\{ if\(isDisabled\(t\)\|\|doneToday\(t\)\|\|_isTodayHoliday\(\)\)/.test(src) &&
      /function isOverdue\(t\)\{ if\(isDisabled\(t\)\|\|doneToday\(t\)\|\|_isTodayHoliday\(\)\)/.test(src));
    T("★ الإنشاء والتحرير يرحّلان تاريخ العطلة لأوّل يوم عمل",
      // we: التوليد صار يمرّ عبر start (وهي _nextWorkingDay بدورها) — يغطّيه حارس we
      /nextDueDate:\s*_nextWorkingDay\(_today\(\)\)/.test(src) &&
      /_editing\.nextDueDate = _nextWorkingDay\(g\("co-due"\)/.test(src));
    T("★ لوحة اليوم تعرض «إجازة» بدل 0% عقابيّ",
      /s\.holiday\?"إجازة"/.test(src) && /vTxt="إجازة اليوم"/.test(src));
  }

  // ══ ★ v18.9vf: جولات الجودة بالتقييم (§٣-٣) ══
  if (CO && typeof CO._roundScore === "function") {
    T("مقياسُ النجوم خمسٌ", CO._QUALITY_STARS === 5);
    // درجةُ الجولة = متوسّطُ نجومِ التقييمات المُدخَلة (>0)، ونسبتُها المئوية
    const r1 = { ratings: [
      { building:"أ", workType:"نظافة الأرضيات", stars:4 },
      { building:"أ", workType:"نظافة الزجاج والواجهات", stars:2 },
      { building:"ب", workType:"نظافة الأرضيات", stars:3 }
    ]};
    const sc = CO._roundScore(r1);   // متوسّط (4+2+3)/3 = 3 ⟵ 60%
    T("★ درجةُ الجولة متوسّطُ النجوم ونسبتُها",
      sc.n === 3 && sc.avg === 3 && sc.pct === 60, JSON.stringify(sc));
    T("★ التقييماتُ الصفرية (لم تُقيَّم) لا تُحتسب في المتوسّط",
      CO._roundScore({ ratings:[{building:"أ",workType:"x",stars:5},{building:"أ",workType:"y",stars:0}] }).avg === 5);
    T("جولةٌ بلا تقييماتٍ ⟵ لا NaN بل «—»",
      CO._roundScore({ ratings:[] }).avg === null && CO._roundScore({}).pct === null);

    // اتّجاهٌ شهري + أضعفُ الأنواع (تُرتَّب تصاعديّاً فالأضعفُ أولاً)
    const rounds = [
      { date:"2026-06-10", ratings:[{building:"أ",workType:"الأرضيات",stars:2},{building:"أ",workType:"الزجاج",stars:5}] },
      { date:"2026-07-05", ratings:[{building:"أ",workType:"الأرضيات",stars:3},{building:"ب",workType:"الزجاج",stars:5}] }
    ];
    const tr = CO._qualityTrend(rounds);
    T("★ الاتّجاه يجمّع حسب الشهر", tr.months.length === 2 &&
      tr.months[0].ym === "2026-06" && tr.months[1].ym === "2026-07",
      JSON.stringify(tr.months.map(m=>m.ym+":"+m.avg)));
    T("★ أضعفُ أنواع العمل أوّلاً (تصاعديّاً)",
      tr.dims[0].name === "الأرضيات" && tr.dims[0].avg < tr.dims[tr.dims.length-1].avg,
      tr.dims.map(d=>d.name+":"+d.avg).join("، "));
    T("عددُ الجولات صحيح", tr.roundsCount === 2);
    T("بلا جولاتٍ ⟵ لا سقوط", CO._qualityTrend([]).roundsCount === 0 && Array.isArray(CO._qualityTrend([]).months));
  }
  // العزل والوصل — مجموعةٌ مستقلّةٌ بمعرّف المشروع، وواجهةٌ ضمن «تشغيل النظافة»
  T("★ جولات الجودة مجموعةٌ معزولةٌ بمعرّف المشروع",
    /function qualityCol\(\)\{ const id=_projId\(\);/.test(src) && src.includes('id+"_quality_rounds"'));
  T("★ عرضُ «جولات الجودة» موصولٌ بتوجيه العرض وزرِّ القسم (للإدارة والمشرف)",
    /_view==="quality" \? qualityHTML\(\)/.test(src) &&
    /setView\('quality'\)/.test(src) && /function qualityHTML\(\)\{/.test(src) &&
    /if\(!canQuality\(\)\)\{/.test((src.match(/function qualityHTML\(\)\{[\s\S]*?\n\}/)||[""])[0]));
  // ══ ★ v18.9wi: جولات الجودة للمشرف — canQuality ونطاق المباني والحرّاس ══
  T("★ v18.9wi: canQuality = الإدارة أو المشرف (لا الفنيّ)",
    /function canQuality\(\)\{ return canEdit\(\)\|\|_isSupRole\(\); \}/.test(src));
  // ══ ★ v18.9wj: الدور المخزّن قد يكون بالعربية «مشرف» (قيمة قائمة إدارة المستخدمين) ══
  T("★ v18.9wj: فحص دور المشرف يقبل «مشرف» العربية وsupervisor معاً",
    /function _isSupRole\(\)\{ const r=_role\(\); return r==="supervisor"\|\|r==="مشرف"; \}/.test(src));
  T("★ v18.9wj: فحص دور الفني يقبل «فني» العربية وtechnician معاً",
    /function _isTechRole\(\)\{ const r=_role\(\); return r==="technician"\|\|r==="فني"; \}/.test(src));
  T("★ v18.9wj: canExecute مبنيةٌ على الفحصين المطبَّعين (يظهر زرّ التنفيذ للمشرف/الفني)",
    /function canExecute\(\)\{ return canEdit\(\)\|\|_isSupRole\(\)\|\|_isTechRole\(\); \}/.test(src));
  T("★ v18.9wj: قائمة الأدوار في إدارة المستخدمين تحفظ المشرف بقيمة «مشرف» (توثيق الجذر)",
    /<option value="مشرف">مشرف<\/option>/.test(HTML));
  T("★ v18.9wj: إشعارات البلاغات الجديدة تشمل الدور العربي «مشرف»",
    /_hnRoleIn\(\["admin","project_manager","supervisor","مشرف"\]\)/.test(HTML));
  T("★ v18.9wi: زرّا «جولات الجودة» و«بدء جولة جودة» مفتوحان بـ canQuality",
    /canQuality\(\)\?`<button[^`]*setView\('quality'\)/.test(src) &&
    /canQuality\(\)\?`<button[^`]*goQuality\(\)/.test(src));
  T("★ v18.9wi: نموذجُ الجولة محصورٌ بنطاق المشرف (_qualityBuildings من myBuildings)",
    /function _qualityBuildings\(\)\{ const mine=myBuildings\(\);/.test(src) &&
    /const r=_editingRound, blds=_qualityBuildings\(\)/.test(src) &&
    /const b=_qualityBuildings\(\)\[bi\]/.test(src));
  T("★ v18.9wi: حارسا الإنشاء والحفظ يمنعان غيرَ المخوَّل (canQuality)",
    /function newRound\(\)\{\s*\n?\s*if\(!canQuality\(\)\)/.test(src) &&
    /if\(!_editingRound\) return;\s*\n\s*if\(!canQuality\(\)\)/.test(src));
  T("★ v18.9wi: حذفُ الجولة يبقى للإدارة وحدها (حارسٌ داخل removeRound)",
    /async function removeRound\(id\)\{\s*\n?\s*if\(!canEdit\(\)\)/.test(src));
  // ══ ★ v18.9wi: إعادةُ تسميةِ مشرفٍ تُهاجر بيانات النظافة (سارة ← ساره) ══
  T("★ v18.9wi: onSupervisorRenamed تُهاجر المواضعَ الأربعة (مهام/سجل/مفتاح الربط/جولات)",
    /async function onSupervisorRenamed\(oldName, newName\)\{/.test(src) &&
    /where\("supervisor","==",oldName\)/.test(src) &&
    /where\("by","==",oldName\)/.test(src) &&
    /map\[newName\]=merged; delete map\[oldName\]; mapChanged=true;/.test(src));
  T("★ v18.9wi: الهجرة معزولةٌ بمشاريع النظافة ومعروضةٌ للنواة",
    (src.match(/async function onSupervisorRenamed\(oldName, newName\)\{[\s\S]*?isCleaningProject\(\)/)||[]).length===1 &&
    /onBuildingRenamed, onSupervisorRenamed,/.test(src));
  T("★ v18.9wi: adminSaveSupervisor في النواة يستدعي هجرةَ الاسم",
    /adminSaveSupervisor[\s\S]{0,900}cleaningOps\.onSupervisorRenamed==="function"\) window\.cleaningOps\.onSupervisorRenamed\(oldName,newName\)/.test(HTML));
  T("★ اتّجاهُ الجودة معروضٌ في صفحة المؤشّرات ويُحمَّل مع بقيتها",
    /\$\{qualityTrendHTML\(\)\}/.test(src) && /Promise\.all\(\[loadTasks\(\), loadMonthLog\(\), loadRounds\(\)\]\)/.test(src));
  T("★ النقرُ على النجمة نفسها يُلغي التقييم (toggle)",
    /_editingRound\.grid\[key\]=\(cur===n\)\?0:n/.test(src));
  T("★ تبديلُ المشروع يُصفّر حالةَ الجولات (لا تسرّب بين المشاريع)",
    /_rounds=\[\]; _roundsLoaded=false;/.test(src) && /_editingRound=null; _roundPhotos=\[\]; _roundDetail=null;/.test(src));

  // ══ ★ v18.9vg: تقرير العميل (PDF) ══
  if (CO && typeof CO._buildClientReportHTML === "function") {
    T("اسمُ الشهر بالعربية صحيح", CO._monthName("2026-07") === "يوليو 2026" && CO._monthName("2026-01") === "يناير 2026");
    const html = CO._buildClientReportHTML();   // آمنٌ بلا بيانات (لا سقوط)
    T("★ التقرير مستندٌ HTML كاملٌ جاهزٌ للطباعة", typeof html === "string" &&
      /^<!DOCTYPE html>/.test(html) && /@page\{size:A4/.test(html) && /dir="rtl"/.test(html));
    const need = ["تقرير أداء أعمال النظافة","الملخّص التنفيذي","الالتزام بالجدول","جودة النتيجة","التغطية حسب المنطقة","جولاتُ التفتيش","اعتماد العميل"];
    const missing = need.filter(x => html.indexOf(x) === -1);
    T("★ التقرير يحوي كلَّ أقسام العميل", missing.length === 0, missing.length ? "ناقص: " + missing.join("، ") : "كلُّها موجودة");
    // القرار: أداءُ المشرفين داخليٌّ لا يظهر في تقرير العميل
    T("★ أداءُ المشرفين غيرُ مُضمَّنٍ في تقرير العميل", html.indexOf("أداء المشرفين") === -1);
  }
  // تقرير جولةٍ واحدة (طباعة تقرير الجولة)
  if (CO && typeof CO._buildRoundReportHTML === "function") {
    const rr = CO._buildRoundReportHTML({ date:"2026-07-31", by:"مدير النظام", violations:"دورات المياه تحتاج تعقيماً",
      ratings:[{building:"مبنى أ",workType:"نظافة الأرضيات",stars:4},{building:"مبنى أ",workType:"الزجاج",stars:2},{building:"مبنى ب",workType:"دورات المياه",stars:5}] });
    T("★ تقرير الجولة مستندٌ HTML كاملٌ جاهزٌ للطباعة", typeof rr === "string" &&
      /^<!DOCTYPE html>/.test(rr) && /@page\{size:A4/.test(rr) && /dir="rtl"/.test(rr));
    const rneed = ["تقرير جولة تفتيش الجودة","المفتِّش","متوسّط الجودة","التقييم التفصيلي","اعتماد العميل","نظافة الأرضيات","مبنى أ"];
    const rmiss = rneed.filter(x => rr.indexOf(x) === -1);
    T("★ تقرير الجولة يحوي الترويسةَ والتقييماتِ والمخالفاتِ والاعتماد", rmiss.length === 0 && rr.indexOf("دورات المياه تحتاج تعقيماً") !== -1,
      rmiss.length ? "ناقص: " + rmiss.join("، ") : "كامل");
    // النجومُ الممتلئة/الفارغة بالألوان (تُطبَع على ورق)
    T("★ نجومُ الطباعة ملوَّنة (ممتلئ ذهبيّ/فارغ رماديّ)", /#f59e0b/.test(rr) && /#cbd5e1/.test(rr));
  }
  T("★ زرُّ «طباعة تقرير الجولة» في تفاصيل الجولة + printRound يُعيد استخدام نافذة الطباعة",
    /cleaningOps\.printRound\('\$\{_esc\(r\.id\)\}'\)/.test(src) &&
    /function printRound\(id\)\{[\s\S]*?_openPrintWindow\(html\)/.test(src));
  T("★ زرُّ «تصدير تقرير العميل» في صفحة المؤشّرات + يُعيد استخدام نافذة الطباعة (بلا مكتبةٍ جديدة)",
    /cleaningOps\.exportClientReport\(\)/.test(src) &&
    /if\(typeof _openPrintWindow==="function"\)\{ _openPrintWindow\(html\)/.test(src) &&
    !/jspdf|html2pdf|html2canvas/i.test(src));
  T("★ التصدير يُحمّل البيانات قبل البناء (المهامّ والسجلّ والجولات)",
    /await Promise\.all\(\[loadTasks\(\), loadMonthLog\(\), loadRounds\(\)\]\)/.test((src.match(/async function exportClientReport\(\)\{[\s\S]*?\n\}/)||[""])[0]));

  // ── العزل بمعرّف المشروع (كبقية النظام) ──
  T("★ المجموعتان معزولتان بمعرّف المشروع",
    /_cleaning_tasks/.test(src) && /_cleaning_log/.test(src) && src.includes('id+"_cleaning_tasks"'));
  // ── لا يظهر إلا لمشاريع النظافة ──
  T("الزرّ والصفحة مقصوران على مشاريع «إدارة نظافة»",
    src.includes("isCleaningProject()") && /shouldShow\s*=\s*canView\(\)\s*&&\s*isCleaningProject\(\)/.test(src));

  // ── ★ مطابقة هوية المنصة: الصفحة تستعمل أصناف المنصة الأصلية لا مفرداتٍ موازية ──
  // كل صنفٍ تعتمده الصفحة يجب أن يكون **معرَّفاً في index.html** — وإلا فهو صنفٌ ميت
  // يجعل الصفحة تبدو مختلفةً عن بقية النظام.
  const PLATFORM = ["page-hero", "page-hero-titles", "page-hero-title", "page-hero-sub",
    "page-hero-actions", "ph-ico", "stat-tile", "st-ico", "st-val", "st-lbl",
    "ppm-card", "ppm-chip", "ppm-pill", "ppm-due-badge", "ppm-meta-row", "ppm-overdue-banner",
    "hbar", "hleg", "form-group", "form-label", "form-input", "form-select"];
  const usedNotDefined = PLATFORM.filter(c => src.includes(`"${c}`) || src.includes(`${c} `) || src.includes(`class="${c}`))
    .filter(c => !new RegExp("\\." + c + "[{ ,:.]").test(HTML));
  T("★ كل أصناف المنصة التي تستعملها الصفحة معرَّفةٌ في index.html",
    usedNotDefined.length === 0, usedNotDefined.join("، ") || "لا أصناف ميتة");

  // الصفحة تبني رأسها بـ .page-hero وبلاطاتها بـ .stat-tile وبطاقاتها بـ .ppm-card
  T("★ الرأس بـ .page-hero (نفس كل صفحات المنصة)", /class="page-hero"/.test(src));
  T("★ المؤشّرات بـ .stat-tile لا بطاقاتٍ خاصة", /class="stat-tile"/.test(src) && !/class="co-stat\b/.test(src));
  T("★ بطاقة المهمة بـ .ppm-card (مفردة المنصة للعمل الدوريّ)", /class="ppm-card/.test(src));
  T("★ التغطية بشريط الصحة .hbar لا شريطٍ خاص", /class="hbar"/.test(src) && !/co-progress/.test(src));
  T("★ تنبيه التأخّر بـ .ppm-overdue-banner لا تنبيهٍ خاص", /ppm-overdue-banner/.test(src) && !/class="co-alert"/.test(src));
  T("النماذج بـ .form-group/.form-label (لا حقولٌ خاصة)", /class="form-group"/.test(src) && /class="form-label"/.test(src));

  // ── ★ index.html يبقى بلا إضافاتٍ وظيفية: الوحدة تحقن نوع «إدارة نظافة» بنفسها ──
  T("★ خيار «إدارة نظافة» ليس في index.html (تحقنه الوحدة)",
    !/<option value="cleaning"/.test(HTML));
  T("الوحدة تلفّ نافذتَي إنشاء/تعديل المشروع",
    /window\.openAddProjectModal\s*=/.test(src) && /window\.openEditProjectModal\s*=/.test(src));
  // حارسٌ ضدّ الحقن الصامت الفاشل: أهداف الحقن يجب أن تبقى موجودةً في index.html
  ["np-type", "ep-type", "np-type-hint", "ep-type-hint"].forEach(id =>
    T(`هدف الحقن #${id} موجود في index.html`, HTML.includes(`id="${id}"`)));
  T("★ الوحدة تختار «نظافة» عند التعديل (النواة لا تعرف الخيار فلا تختاره)",
    /_addTypeOption\("ep-type"\s*,\s*"ep-type-hint"\s*,\s*isC\)/.test(src));

  // ══ اللوحة التنفيذية لعقود النظافة ══
  // ★ الضمانة الحاكمة: لا مساس بمشاريع الصيانة — نُخفي لوحة الصيانة ولا نحذفها،
  // لأن النواة تحذّر صراحةً أن إتلاف محتوى #page-dashboard يكسر renderDashboard().
  T("★ لوحة الصيانة تُخفى ولا تُحذف (renderDashboard يبقى سليماً)",
    /#page-dashboard\.co-exec-mode > \*:not\(#\$\{EXEC_ID\}\)\{display:none!important\}/.test(src));
  T("★ لا يُتلَف محتوى #page-dashboard إطلاقاً",
    !/page-dashboard"\)\.innerHTML\s*=/.test(src) && !/host\.innerHTML\s*=/.test(src));
  T("اللوحة تُحقن كعنصرٍ أوّلٍ مستقل (insertBefore) لا باستبدال",
    /insertBefore\(box,\s*host\.firstChild\)/.test(src));
  T("★ الإخفاء يُرفَع فوراً لمشروعٍ غير نظافة",
    /if\(!isCleaningProject\(\)\)\{\s*unmountExec\(\);\s*return;\s*\}/.test(src) &&
    /host\.classList\.remove\("co-exec-mode"\)/.test(src));
  T("تبديلُ المشروع يرفع كلَّ لوحات النظافة قبل معرفة نوع الجديد",
    /unmountExec\(\); unmountDaily\(\); unmountKPI\(\);/.test(src));
  T("★ صفحة المؤشرات تُخفى ولا تُحذف كذلك",
    /#page-kpi\.co-kpi-mode > \*:not\(#\$\{KPI_ID\}\)\{display:none!important\}/.test(src) &&
    /host\.classList\.remove\("co-kpi-mode"\)/.test(src));
  T("★ المتابعة اليومية تُخفى ولا تُحذف كذلك",
    /#page-daily\.co-daily-mode > \*:not\(#\$\{DAILY_ID\}\)\{display:none!important\}/.test(src) &&
    /host\.classList\.remove\("co-daily-mode"\)/.test(src));

  // ── التغطية حسب المنطقة: الأضعف أولاً (هذا ما يحتاجه التنفيذيّ) ──
  if (CO._coverageByBuilding) {
    const nowI = new Date().toISOString();
    const mkb = (b, o) => Object.assign({ id: "t" + b, freq: "يومي", nextDueDate: today, lastExecuted: "", disabled: false, building: b }, o);
    const cov = CO._coverageByBuilding([
      mkb("أ", { lastExecuted: nowI, nextDueDate: day(1) }),          // أ: 1/1 = 100%
      mkb("ب", { lastExecuted: nowI, nextDueDate: day(1) }),          // ب: 1/2 = 50%
      mkb("ب", { nextDueDate: today }),
      mkb("ج", { nextDueDate: day(-3) })                              // ج: 0/1 = 0% ومتأخّرة
    ]);
    T("التغطية تُحسب لكل مبنى", cov.length === 3, JSON.stringify(cov.map(c => c.name + ":" + c.pct)));
    T("★ الترتيب: الأضعف تغطيةً أولاً", cov[0].pct <= cov[1].pct && cov[1].pct <= cov[2].pct,
      cov.map(c => c.name + "=" + c.pct + "%").join("، "));
    const g = cov.find(c => c.name === "ج");
    T("المبنى بلا تنفيذ = 0% ويُحصى تأخّره", g && g.pct === 0 && g.overdue === 1);
    const bb = cov.find(c => c.name === "ب");
    T("مبنى نصف منجز = 50%", bb && bb.pct === 50);
    T("المهام غير المجدولة اليوم لا تدخل التغطية",
      CO._coverageByBuilding([mkb("د", { nextDueDate: day(6) })]).length === 0);
  }

  // ══ تكييف صفحات أوامر العمل لعقود النظافة ══
  // الجذر: المشروع غير «حائل» يبدأ بأنواع عملٍ فارغة (_applyWT({})) فقائمة نوع الأعمال بلا خيارات
  T("★ النواة تبدأ المشروع الجديد بأنواع عملٍ فارغة (سبب البذر)", /_applyWT\(isHailProject \? _DEFAULT_WORK_TYPES : \{\}\)/.test(HTML));
  T("الوحدة تبذر أنواع عمل النظافة في إعدادات المشروع", /database\.doc\(path\)\.set\(\{ workTypes: CLEANING_WT_SEED \}/.test(src));
  T("★ البذر لا يطمس اختيار المستخدم (يشترط أنواعاً فارغة)",
    /Object\.keys\(WORK_TYPES\)\.length===0/.test(src) && /if\(!empty\)\s*\{\s*_seededFor\[id\]=true;\s*return;\s*\}/.test(src));
  T("★ البذر مقصورٌ على مشاريع النظافة", /if\(!id \|\| !isCleaningProject\(\) \|\| _seededFor\[id\]\) return;/.test(src));
  T("البذر يمرّ عبر آلية إعدادات المنصة (meta/{id}_settings)", /SETTINGS_DOC\(\)/.test(src));

  if (CO && typeof CO._relabelText === "function") {
    T("★ «وصف العطل» ⟵ «وصف الملاحظة»", CO._relabelText("وصف العطل") === "وصف الملاحظة");
    T("«نوع الصيانة» ⟵ «مصدر الملاحظة»", CO._relabelText("نوع الصيانة") === "مصدر الملاحظة");
    T("«الفني المسؤول» ⟵ «عامل النظافة المسؤول»", CO._relabelText("الفني المسؤول") === "عامل النظافة المسؤول");
    // الأطول أولاً: لا يبتلع بديلٌ قصيرٌ جزءاً من عبارةٍ أطول
    T("★ العبارة الأطول تُبدَّل ككلّ لا كأجزاء",
      CO._relabelText("أرشيف البلاغات الشهري") === "أرشيف ملاحظات النظافة الشهري",
      CO._relabelText("أرشيف البلاغات الشهري"));
    // idempotent: إعادة التطبيق لا تُفسد النص (الفحص يعمل بعد كل رسمٍ للنواة)
    const once = CO._relabelText("وصف العطل — البلاغات");
    T("★ التعريب idempotent (يُطبَّق بعد كل رسم)", CO._relabelText(once) === once, once);
    T("النصّ غير المعنيّ لا يتغيّر", CO._relabelText("إجمالي المشتريات") === "إجمالي المشتريات");
  }
  T("التعريب مقصورٌ على العناوين والتسميات (لا محتوى ديناميكي)",
    /RELABEL_SEL\s*=\s*"\.page-hero-title/.test(src) && !/document\.body\.innerHTML/.test(src));

  // ★ الإعدادات تصل من Firestore بعد رسم الصفحة، وعندها تعيد النواة بناء كل الخيارات
  // (repopulateAllSelects) فتمحو التعريب. لفُّها يعيده بعد كل بناء — وإلا عادت مسمّياتُ
  // الصيانة كلّما تأخّر وصول الإعدادات.
  T("★ التعريب يُعاد بعد كل إعادة بناءٍ للقوائم (وصولُ الإعدادات المتأخّر)",
    /window\.repopulateAllSelects\s*=\s*function/.test(src) &&
    /if\(isCleaningProject\(\)\) relabelAllPages\(\)/.test(src));
  T("لفّ repopulateAllSelects مرّةً واحدة (حارس idempotent)",
    /window\._coRepopHooked/.test(src) && /hookRepopulate\(\)/.test(src));

  // ★ لوحة الإدارة تُرسم قبل وصول الإعدادات فتبقى قوائمُها فارغةً حتى مغادرة الصفحة
  // والعودة — لأن loadSettings تُحدِّث القوائمَ المنسدلة ولا تُعيد رسم قوائم اللوحة.
  // نفحص **جسم loadSettings نفسه** لا الملفَّ كلَّه: «استعادة البيانات الافتراضية»
  // تستدعي renderAdminPanel وهي مسارٌ آخر لا علاقة له بتحميل الإعدادات.
  const _loadSettingsBody = (HTML.match(/async function loadSettings\(\)\{[\s\S]*?\n\}/) || [""])[0];
  T("★ العلّة قائمةٌ في النواة: قوائم اللوحة تُبنى من BUILDINGS ولا تُعاد بعد التحميل",
    /function renderAdminBuildingsList\(\)\{[\s\S]{0,160}BUILDINGS\.map/.test(HTML) &&
    /loadSettings\(\)\.catch/.test(HTML) &&
    _loadSettingsBody.includes("repopulateAllSelects()") &&
    !_loadSettingsBody.includes("renderAdminPanel"),
    "جسم loadSettings: repopulate=" + _loadSettingsBody.includes("repopulateAllSelects()") +
    " renderAdminPanel=" + _loadSettingsBody.includes("renderAdminPanel"));
  T("★ تُملأ القائمةُ الفارغةُ فقط (فلا يُمحى ما كتبه المستخدم)",
    /if\(!el \|\| el\.children\.length \|\| !count\) return;/.test(src));
  T("القوائم الأربع مشمولة", /admin-buildings-list/.test(src) && /admin-supervisors-list/.test(src) &&
    /admin-worktypes-list/.test(src) && /admin-techs-list/.test(src));
  T("لا يُنفَّذ إلا واللوحةُ معروضة", /page-admin-panel[\s\S]{0,80}classList\.contains\("active"\)/.test(src));
  T("دوالُّ الرسم المستدعاةُ عامّةٌ فعلاً في النواة",
    ["renderAdminBuildingsList","renderAdminSupervisorsList","renderAdminWorkTypesList","renderAdminTechsList"]
      .every(f => new RegExp("^function " + f + "\\(\\)", "m").test(HTML)));
  T("★ البذر يُحدِّث القوائم فوراً (وإلا بقيت فارغةً حتى بناءٍ لاحق)",
    /repopulateAllSelects\(\);\s*\}catch\(e\)\{\}\s*\n\s*_audit\("بذر أنواع عمل النظافة"/.test(src));
  T("النواة تعيد بناء قوائم المباني من BUILDINGS (فالتأخّر منها لا من الوحدة)",
    /function repopulateAllSelects\(\)/.test(HTML) && /BUILDINGS\.map\(b=>`<option>/.test(HTML));

  // إصلاح أيقونة الأرشيف العملاقة (خلل نواة يصيب الصيانة أيضاً)
  T("★ إصلاح أيقونة الأرشيف العملاقة (font-size لا يحجّم SVG)",
    /#archive-content div\[style\*="font-size:28px"\] > svg\{width:28px;height:28px\}/.test(src));
  T("العلّة قائمةٌ فعلاً في النواة (وإلا فالإصلاح ميت)",
    /font-size:28px;margin-bottom:10px">\$\{_svgIcon\("hourglass"\)\}/.test(HTML));

  // ══ ★ حلقة الرسم اللانهائية التي جمّدت التطبيق (v18.9uq) ══
  // كانت `if(_loading) return;` تُرجع وعداً محلولاً فوراً بلا تعيين _loaded، وكل
  // المستدعين يفعلون loadTasks().then(()=>render()) — فيعاود render الطلبَ بلا نهاية:
  // حلقةُ microtask تُجوّع حلقة الأحداث فيتجمّد كلُّ شيء.
  // مُرسًى في بداية السطر: نفحص الكود الفعلي لا ذِكرَ النمط في تعليقٍ توضيحي
  T("★ لا رجوعَ فارغاً أثناء تحميلٍ جارٍ (سبب التجميد)", !/^\s*if\(_loading\) return;/m.test(src));
  T("★ النداء الجاري يُشارَك بدل إعادة الطلب", /if\(_loadPromise\) return _loadPromise;/.test(src));
  T("★ _loaded يُضبَط دائماً في finally (نجح التحميل أم فشل)",
    /\}finally\{[\s\S]{0,220}_loaded=true; _loadedFor=_projId\(\); _loading=false; _loadPromise=null;/.test(src));
  T("مسار «لا قاعدة بيانات» يضبط الحالة أيضاً فلا يدور",
    /if\(!database \|\| !col\)\{ _tasks=\[\]; _loaded=true; _loadedFor=_projId\(\); return Promise\.resolve\(\); \}/.test(src));
  // كلُّ مُركِّبٍ يعيد الرسم بعد التحميل — فأيُّ رجوعٍ فارغٍ يعيد إنتاج الحلقة.
  // بعد التحصين لم يعد أحدٌ ينادي loadTasks().then مباشرةً: الجميع عبر _afterLoad.
  T("لا مسارَ «حمّل ثم ارسم» خارج الحارس",
    !/loadTasks\(\)\.then\(\s*\(\)\s*=>\s*\{[^}]*render\(\)/.test(src));
  T("★ دوالُّ إعادة الرسم كلُّها معرَّفةٌ داخل الوحدة (لا استدعاءَ لدالّة وحدةٍ أخرى)",
    !/^\s*renderTabBody\(\);/m.test(src));

  // ★ تحصينٌ بنيويّ: يقتل صنفَ الحلقات كلَّه لا مساراً بعينه — فحتى لو تعذّر ضبطُ
  // الحالة في مسارٍ لم نكتشفه، تحصل على رسمةٍ إضافيةٍ واحدة لا حلقةً لا نهائية.
  T("★ حارسُ عدم إعادة الدخول على render", /if\(_rendering\) return;/.test(src) && /_rendering=true;/.test(src));
  T("★ render لا تسقط بخطأ يترك الحارس مرفوعاً (finally)",
    /finally\{ _rendering=false; \}/.test(src));
  // ★ لا أعلامَ معلّقة: عَلَمٌ يعلق مرفوعاً يترك الشاشة على «جارٍ التحميل» للأبد
  // (وهو ما حدث فعلاً في اللوحة التنفيذية). الارتباطُ بالوعد المشترك لا يعلق أبداً.
  T("★ لا أعلامَ تحميلٍ معلّقة إطلاقاً",
    !/_pendingRender|_pendingExec|_pendingDaily/.test(src));
  T("★ الارتباط بالوعد المشترك مباشرةً", /function _afterLoad\(\)\{ loadTasks\(\)\.then\(_refreshMounted\)/.test(src));
  T("★ اكتمالُ التحميل يُحدِّث كلَّ سطحٍ مركَّب لا الطالبَ وحده",
    /function _refreshMounted\(\)\{[\s\S]{0,400}EXEC_ID[\s\S]{0,200}DAILY_ID/.test(src));
  T("★ فشلُ بناء HTML يُظهر رسالةً بدل تركِ الشاشة على «جارٍ التحميل»",
    /function _safeHTML\(el, build\)/.test(src) && /تعذّر عرض البيانات/.test(src));
  T("المُركِّبات كلُّها تمرّ بالنداء الموحّد", (src.match(/_afterLoad\(\);/g) || []).length >= 3);

  // سرعةُ أول عرض
  T("★ قراءتا المهامّ والخريطة بالتوازي لا بالتتابع",
    /await Promise\.all\(\[\s*database\.collection\(col\)\.limit\(500\)\.get\(\),\s*loadCfg\(force\)\s*\]\)/.test(src));
  T("★ استباقُ التحميل عند معرفة أن المشروع نظافة (لا عند أول ضغطة)",
    /function _prefetch\(\)\{[\s\S]{0,200}if\(!isCleaningProject\(\)\) return;/.test(src) &&
    (src.match(/_prefetch\(\)/g) || []).length >= 3);

  // ══ ★ فصلُ المالي عن التشغيلي (قرار صاحب النظام) ══
  // الربحيةُ والمستهلكاتُ محلُّهما «إدارة المشاريع › بطاقة المشروع» وحدها؛ شاشاتُ
  // التشغيل (اللوحة التنفيذية/المتابعة اليومية/تشغيل النظافة) تشغيليةٌ خالصة.
  T("★ لا ربحيةَ ولا مستهلكاتٍ في شاشات التشغيل",
    !/cleaningSpend|_finCache|monthlySalaries|adminExpenses/.test(src));
  T("★ لا حساباتٍ ماليةً من المشتريات في وحدة التشغيل",
    !/poActualCost|poIsClosed|مواد نظافة/.test(src));
  T("الفصل موثَّقٌ في الكود (فلا يُعاد إدخالها سهواً)",
    /محلُّهما «إدارة المشاريع › بطاقة/.test(src));
  // وفي المقابل: البطاقة المالية باقيةٌ في إدارة المشاريع
  if (PM_SRC) {
    T("★ البطاقة المالية باقيةٌ في إدارة المشاريع (لم تُنقَل بل فُصلت)",
      /function cleaningOverviewHTML\(\)/.test(PM_SRC) && /monthlyValue/.test(PM_SRC));
  }

  // ══ عرض تفاصيل المهمة + تصغير البطاقات وشبكة المباني ══
  T("★ الضغط على البطاقة يفتح تفاصيلها (السبيل الوحيد لمراجعة مهمةٍ نُفِّذت)",
    /onclick="cleaningOps\.openDetail\('\$\{_esc\(t\.id\)\}'\)"/.test(src));
  T("★ أزرارُ البطاقة توقف الانتشار فلا تفتح التفاصيل بالخطأ",
    (src.match(/onclick="event\.stopPropagation\(\);cleaningOps\./g) || []).length >= 2);
  T("شاشة التفاصيل تُوجَّه من render", /if\(_detailFor\) \{ renderDetail\(el\); return; \}/.test(src));
  T("★ التفاصيل تعرض سجلّ التنفيذ بصوره", /loadTaskLog\(/.test(src) && /co-logphotos/.test(src));
  T("سجلّ المهمة بمساواةٍ على حقلٍ واحد (لا يحتاج فهرساً مركّباً)",
    /where\("taskId","==",taskId\)/.test(src) && !/where\("taskId"[^)]*\)\.orderBy/.test(src));
  T("نتيجةٌ متأخّرةٌ لمهمةٍ غادرها المستخدم تُهمَل", /if\(!_detailFor \|\| _detailFor\.id!==id\) return;/.test(src));
  // ★ auto-fit لا auto-fill: الأخير يُنشئ أعمدةً فارغة فينحشر المبنى الواحد في عمودٍ
  // ضيّق وتبقى بقيّةُ الشاشة خالية — وهو ما شكا منه المستخدم.
  T("★ المباني بشبكة auto-fit (المبنى الواحد يملأ العرض بلا أعمدةٍ فارغة)",
    // vz: الحدّ الأدنى 400px — ستةُ أعمدة بـ360 كانت تنضغط بصفٍّ واحد على الشاشة العريضة
    /\.co-groups\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(400px,1fr\)\)/.test(src) &&
    !/\.co-groups\{[^}]*auto-fill/.test(src));
  T("★ شبكةٌ داخليةٌ للمهامّ داخل بطاقة المبنى (تكيُّفٌ مع عرضها)",
    /\.co-tasklist\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(280px,1fr\)\)/.test(src) &&
    // منذ v18.9vx تمرّ القائمة عبر _cappedTaskListHTML (بطاقتان + توسيع) — الشبكة نفسها باقية
    /<div class="co-tasklist">\$\{shown\.map\(taskCardHTML\)/.test(src));
  T("★ أزرارُ البطاقة في سطرٍ مستقلٍّ (لا تخنق العنوان في البطاقة الضيّقة)",
    /\.co-card-act\{[^}]*justify-content:flex-end;[\s\S]{0,80}border-top:1px dashed/.test(src));
  T("الشارات لا تُكسَر داخلياً والصفُّ يلتفّ بينها",
    /white-space:nowrap;line-height:1\.6\}/.test(src));
  T("★ تصغيرُ البطاقات مقصورٌ على صفحات النظافة (لا يمسّ صفحة الوقائية)",
    /#page-\$\{PAGE_ID\} \.ppm-card,#\$\{EXEC_ID\} \.ppm-card,#\$\{DAILY_ID\} \.ppm-card\{padding:9px 11px/.test(src) &&
    !/^\.ppm-card\{/m.test(src));

  // ══ ★ مؤشرات أداء النظافة بدل مؤشّرات الصيانة ══
  // السبعةُ في النواة (تصحيحية/SLA/جودة الالتزام الفني/الوقائية…) تقيس ما لا وجود له
  // في عقد نظافة فتعرض 0% أو 100% بلا معنى — البديل يقيس الالتزام بالجدول والتوثيق.
  // نفحص **جسم cleaningKPIs وحده**: closedAt يرد في _logAsTicket (تحويلٌ للتقرير
  // المصوّر) وهو استعمالٌ مشروعٌ لا قراءةً من البلاغات.
  const _kpiBody = (src.match(/function cleaningKPIs\(\)\{[\s\S]*?\n\}/) || [""])[0];
  T("★ مؤشّراتُ النظافة مبنيّةٌ من المهامّ وسجلّ التنفيذ لا من البلاغات",
    _kpiBody.includes("boardStats()") && _kpiBody.includes("visibleTasks()") &&
    !/allTickets|tickets|closedAt|maintType|priority/.test(_kpiBody),
    _kpiBody ? "جسمٌ نظيف" : "لم يُعثر على الدالّة");
  T("سجلُّ الشهر يُقرأ بمساواةٍ على التاريخ (لا فهرسَ مركّب)",
    /where\("date",">=",from\)/.test(src));
  if (CO && typeof CO._cleaningKPIs === "function") {
    const k = CO._cleaningKPIs();
    T("★ ستةُ مؤشّراتٍ بمعرّفاتٍ خاصةٍ بالنظافة (لا KPI-01 للصيانة)",
      k.length === 6 && k.every(x => /^CLN-\d\d$/.test(x.id)), k.map(x => x.id).join("، "));
    T("لكلِّ مؤشّرٍ اسمٌ وهدفٌ واتجاه", k.every(x => x.name && x.dir && ("target" in x)));
    const late = k.find(x => x.id === "CLN-03");
    T("★ «نسبة المتأخّرات» هدفُها **انخفاضٌ** لا ارتفاع (وإلا انقلب الحكم)",
      late && late.dir === "down" && late.target === 5, late && late.dir + "/" + late.target);
    T("بلا بياناتٍ تُرجع أصفاراً لا NaN (لا قسمةَ على صفر)",
      k.every(x => typeof x.val === "number" && !isNaN(x.val)), JSON.stringify(k.map(x => x.val)));
  }

  // ══ ★ أداء المشرفين — عاد بعد حجب صفحة الصيانة (v18.9vb) ══
  // حجبُ صفحة الصيانة في v18.9va أخفى معها «تصنيف المشرفين» بلا بديل، والبياناتُ
  // اللازمة موجودةٌ أصلاً (كلُّ سطرِ تنفيذٍ يحمل supervisor). هذه الفحوص تمنع اختفاءه
  // ثانيةً وتحرس عدالةَ الدرجة (لا يُعاقَب مشرفٌ بمكوّنٍ لم يُقَس أصلاً).
  T("★ قسم أداء المشرفين معروضٌ داخل صفحة مؤشّرات النظافة",
    /\$\{supPerfHTML\(\)\}/.test(src) && /function supPerfHTML\(\)\{/.test(src));
  T("زرُّ ربط المشرفين بالمباني متاحٌ من صفحة المؤشّرات",
    /function goSupMap\(\)\{[^}]*showPage\(PAGE_ID\); setView\("sup"\)/.test(src) &&
    /cleaningOps\.goSupMap\(\)/.test(src));
  // ★ نطاقٌ واحدٌ للوحة: التغطيةُ مُنطَّقةٌ بـvisibleTasks، وكان السجلُّ عامّاً — رقمان
  // من نطاقين في لوحةٍ واحدة يرى معهما المشرفُ توثيقَ المشروع كلِّه مع تغطية مبانيه.
  const _kpiBody2 = (src.match(/function cleaningKPIs\(\)\{[\s\S]*?\n\}/) || [""])[0];
  T("★ سجلُّ الشهر يُنطَّق كالمهامّ (لا رقمان من نطاقين في لوحةٍ واحدة)",
    /function visibleLog\(\)\{/.test(src) && _kpiBody2.includes("visibleLog()") &&
    !/const log=_monthLog\|\|\[\];/.test(_kpiBody2));
  if (CO && typeof CO._supervisorPerf === "function") {
    const wsum = Object.values(CO._SUP_WEIGHTS).reduce((a, b) => a + b, 0);
    T("أوزانُ الدرجة مجموعُها ١ (لا وزنٌ ضائعٌ أو مضاعف)", Math.abs(wsum - 1) < 1e-9, "المجموع=" + wsum);

    const sTasks = [
      { id: "1", building: "أ", supervisor: "سالم", nextDueDate: today, lastExecuted: today },
      { id: "2", building: "أ", supervisor: "سالم", nextDueDate: today, lastExecuted: "" },
      { id: "3", building: "ب", supervisor: "نورة", nextDueDate: day(-2), lastExecuted: "" },
      { id: "4", building: "ج", nextDueDate: today, lastExecuted: today }
    ];
    const sLog = [
      { building: "أ", supervisor: "سالم", photos: ["u"], doneItems: 4, totalItems: 4 },
      { building: "أ", supervisor: "سالم", photos: [], doneItems: 2, totalItems: 4 }
    ];
    const perf = CO._supervisorPerf(sTasks, sLog);
    const salem = perf.find(x => x.name === "سالم") || {};
    const noura = perf.find(x => x.name === "نورة") || {};
    const orph = perf.find(x => x.unassigned) || {};

    T("★ المهامُّ وسجلُّ التنفيذ يُجمَّعان لكلِّ مشرفٍ معاً",
      salem.sched === 2 && salem.done === 1 && salem.runs === 2 && salem.zones === 1,
      JSON.stringify({ sched: salem.sched, done: salem.done, runs: salem.runs, zones: salem.zones }));
    T("مقاييسُ المشرف محسوبةٌ من بياناته وحدها",
      salem.cov === 50 && salem.late === 0 && salem.doc === 50 && salem.items === 75,
      JSON.stringify({ cov: salem.cov, late: salem.late, doc: salem.doc, items: salem.items }));
    // 0.45*50 + 0.20*100 + 0.20*50 + 0.15*75 = 63.75 ⟵ كلُّ المكوّنات متاحة
    T("الدرجةُ متوسّطٌ مرجَّحٌ صحيح", salem.score === 64, "الدرجة=" + salem.score);
    // ★ العدالة: مَن لا تنفيذاتٍ له لا يُقاس توثيقُه بصفر — يظهر «—» ولا يُحتسب،
    // وإلا صار كلُّ مشرفٍ جديدٍ فاشلاً بمكوّنين لم يعمل فيهما بعد.
    T("★ مكوّنٌ بلا بياناتٍ يُرجع null لا صفراً (لا عقوبةَ على ما لم يُقَس)",
      noura.doc === null && noura.items === null && noura.runs === 0,
      JSON.stringify({ doc: noura.doc, items: noura.items }));
    T("★ الأوزانُ تُعاد موازنتُها على المتاح فقط",
      orph.cov === 100 && orph.late === 0 && orph.score === 100,
      "بلا مشرف: تغطية=" + orph.cov + " درجة=" + orph.score);
    T("متأخّراتُ المشرف تُقلَب في الدرجة (أقلُّ = أفضل)",
      noura.late === 100 && noura.score === 0, JSON.stringify({ late: noura.late, score: noura.score }));
    T("★ المباني بلا مشرفٍ صفٌّ مستقلٌّ لا تختفي من القياس",
      orph.name === CO._SUP_UNASSIGNED && orph.zones === 1);
    T("★ «بلا مشرف» أسفلَ القائمة دائماً وإن علت درجتُه (ليس منافساً)",
      perf[perf.length - 1].unassigned === true && perf[0].name === "سالم",
      perf.map(x => x.name + ":" + x.score).join("، "));
    T("سطرُ تنفيذٍ قديمٍ بلا حقل supervisor يُنسَب لمشرف مبناه",
      CO._logSupervisor({ supervisor: "هند", building: "أ" }) === "هند" &&
      CO._logSupervisor({ building: "مبنى غير مسنَد" }) === "");
    T("بلا أيِّ بياناتٍ لا NaN ولا سقوط", Array.isArray(CO._supervisorPerf([], [])) &&
      CO._supervisorPerf([], []).length === 0);
    T("مهمةٌ موقوفةٌ لا تُحمَّل على مشرفها",
      CO._supervisorPerf([{ id: "x", building: "أ", supervisor: "سالم", nextDueDate: today, disabled: true }], []).length === 0);

    // ══ ★ v18.9vc: الكشفُ من خريطة الربط لا من تيّار المهامّ وحده ══
    // العيبُ المُبلَّغ: مشرفٌ مربوطٌ بمبانٍ (خريطةُ supervisorBuildings) لكن بلا مهامٍّ بعد
    // كان يختفي من القياس فتظهر «لا مشرفين مربوطين» رغم الربط. الآن يُبذَر من الخريطة.
    const seeded = CO._supervisorPerf([], [], { "سارة": ["أ", "ب", "ج"], "نورة": ["د"] });
    const sara = seeded.find(x => x.name === "سارة") || {};
    T("★ مشرفٌ مربوطٌ بلا مهامّ يظهر (لا يختفي من القياس)",
      seeded.filter(x => !x.unassigned).length === 2 && sara.name === "سارة",
      "المربوطون=" + seeded.filter(x => !x.unassigned).map(x => x.name).join("، "));
    T("★ نطاقُه (zones) من الخريطة لا من المهامّ، ودرجتُه «—» لا صفراً",
      sara.zones === 3 && sara.score === null && sara.sched === 0,
      JSON.stringify({ zones: sara.zones, score: sara.score, sched: sara.sched }));
    // مهمةٌ في مبنى المشرفِ المبذور تُراكِم عليه (لا تُنشئ صفّاً ثانياً)
    const seeded2 = CO._supervisorPerf(
      [{ id: "1", building: "أ", nextDueDate: today, lastExecuted: today }], [],
      { "سارة": ["أ", "ب", "ج"] });
    const sara2 = seeded2.find(x => x.name === "سارة") || {};
    T("★ مهمةٌ في مبنى مشرفٍ مبذورٍ تُراكِم على صفّه (لا تكرار)",
      seeded2.filter(x => x.name === "سارة").length === 1 && sara2.done === 1 &&
      sara2.zones === 3 && !seeded2.some(x => x.unassigned),
      JSON.stringify({ n: seeded2.filter(x => x.name === "سارة").length, done: sara2.done, zones: sara2.zones }));
  }

  // ══ ★ v18.9vc: توحيد تعريف «مبانٍ بلا مشرف» بين شاشتَي الربط والقياس ══
  // كان العدُّ يختلف (١ في القياس مقابل ١٤ في الربط) لأن القياس يعُدّ مبانيَ المهامّ
  // وحدها بينما الربط يعُدّ كلَّ BUILDINGS غير المسنَدة. الآن مصدرٌ واحد: unassignedBuildings.
  T("★ شاشةُ الربط تقرأ العدَّ من المصدر الموحّد (unassignedBuildings)",
    /function unassignedBuildings\(/.test(src) &&
    /const orphans=unassignedBuildings\(blds, m, null\)/.test(src) &&
    /supPerfHTML[\s\S]*?const orphanBlds=unassignedBuildings\(\)/.test(src));
  if (CO && typeof CO._unassignedBuildings === "function") {
    const allB = ["أ", "ب", "ج", "د", "هـ"];
    const map1 = { "سارة": ["أ", "ب"] };
    T("★ «بلا مشرف» = كلُّ المباني غير المسنَدة (لا مبانيَ المهامّ وحدها)",
      CO._unassignedBuildings(allB, map1, null).length === 3 &&
      CO._unassignedBuildings(allB, map1, null).join(",") === "ج,د,هـ",
      CO._unassignedBuildings(allB, map1, null).join("،"));
    T("★ العدُّ محترِمٌ للنطاق (المشرفُ لا يرى إلا مبانيه)",
      CO._unassignedBuildings(allB, map1, ["ج", "د"]).join(",") === "ج,د" &&
      CO._unassignedBuildings(allB, map1, []).length === 0);
    T("خريطةٌ فارغةٌ ⟵ كلُّ المباني بلا مشرف", CO._unassignedBuildings(allB, {}, null).length === 5);
  }

  // ══ ★ v18.9vd: إخفاءُ مجموعات القائمة غير المتعلّقة بعقد النظافة ══
  // في مشروع النظافة لا معنى لإدارة الأصول/المخزون/كتالوج البنود والأسعار/طلبات التسعير.
  // تُخفى مجموعاتُها (عرضاً فقط، بلا حذفِ بياناتٍ ولا لمسِ منطق) وتعود في الصيانة/المشتريات.
  T("★ الأربعُ المستهدَفة فقط لا غير (أصول/مخزون/كتالوج/تسعير)",
    /const CLEANING_HIDDEN_GROUPS = \["assets","inventory","catalog","rfq"\]/.test(src));
  T("★ الإخفاء مبنيٌّ على isCleaningProject ويطال الترويسةَ والجسمَ معاً",
    /function applyNavGroupVisibility\(\)\{\s*const hide=isCleaningProject\(\)/.test(src) &&
    /\["hdr-grp-"\+g, "grp-"\+g\]/.test(src));
  T("★ إخفاءُ عرضٍ فقط، ويُستعاد ما أخفيناه وحده (وسم coHidden لا يمسّ العُهدَ المخفيّة أصلاً)",
    /el\.dataset\.coHidden="1"; el\.style\.setProperty\("display","none","important"\)/.test(src) &&
    /else if\(el\.dataset\.coHidden\)\{ el\.style\.removeProperty\("display"\); delete el\.dataset\.coHidden;/.test(src));
  T("★ يُعاد التطبيق عند التركيب وإعادة بناء القائمة وتبديل المشروع",
    (src.match(/applyNavGroupVisibility\(\)/g) || []).length >= 5);
  // حارسُ الأهداف: معرّفاتُ المجموعات في index.html يجب أن تبقى مطابقةً للمُخفية
  T("★ معرّفاتُ المجموعات الأربع ما زالت في index.html (أهدافُ الإخفاء غيرُ مكسورة)",
    ['grp-assets', 'grp-inventory', 'grp-catalog', 'grp-rfq']
      .every(g => HTML.includes('id="' + g + '"') && HTML.includes('id="hdr-' + g + '"')));
  // لا نُخفي ما لم يُطلَب: طلبات الشراء وإدارة المشاريع تبقى في مشاريع النظافة
  T("طلباتُ الشراء وإدارةُ المشاريع لا تُخفى (خارج القائمة المستهدَفة)",
    !/CLEANING_HIDDEN_GROUPS[^\n]*"po"/.test(src) && !/CLEANING_HIDDEN_GROUPS[^\n]*"projects"/.test(src));

  // ══ ★ عموميّة المشاريع: أيُّ مشروع نظافةٍ جديدٍ يعمل بنفس المنطق ══
  T("★ لا معرّفَ مشروعٍ مثبَّتٌ في الوحدة إطلاقاً",
    !/["'`](hail|bathroom001)["'`]/.test(src) && !/hail_/.test(src));
  T("★ كلُّ مسارات البيانات مشتقّةٌ من المشروع الحالي",
    /function tasksCol\(\)\{ const id=_projId\(\);/.test(src) &&
    /function logCol\(\)\{\s+const id=_projId\(\);/.test(src) &&
    /function cfgDoc\(\)\{\s+const id=_projId\(\);/.test(src));
  T("المخابئ مفهرسةٌ بمعرّف المشروع (لا تتسرّب بين المشاريع)",
    /_typeCache\[p\.id\]/.test(src) && /_seededFor\[id\]/.test(src));
  // ★ حارسُ اكتمال التصفير: كلُّ متغيّرِ حالةٍ معرَّفٍ بـlet يجب أن يُصفَّر عند تبديل
  // المشروع — وإلا ظهرت بياناتُ مشروعٍ في آخر. (اكتُشف بهذا أن _detailFor و_cfg
  // كانا يبقيان: تفاصيلُ مهمةِ المشروع السابق تبقى معروضةً وخريطةُ مشرفيه تحكم الجديد.)
  const _resetBlock = (src.match(/if\(cur!==last\)\{[\s\S]*?ensureTypeKnown/) || [""])[0];
  const _mustReset = ["_tasks", "_loaded", "_loadedFor", "_loadPromise", "_cfg", "_cfgFor",
    "_editing", "_execFor", "_execState", "_execPhotos", "_detailFor", "_detailLog", "_view"];
  const _missed = _mustReset.filter(v => !new RegExp("\\b" + v + "\\s*=").test(_resetBlock));
  T("★ تبديلُ المشروع يُصفّر كلَّ حالةِ الوحدة (لا بقايا من السابق)",
    _missed.length === 0, _missed.length ? "لم يُصفَّر: " + _missed.join("، ") : "كلُّها مُصفَّرة");

  // ══ ربط المشرف بمبانيه + صور التنفيذ + التقرير المصوّر ══
  T("خريطة المشرف↔المباني في مستندٍ خاصٍّ بالوحدة (لا تغيّر شكل إعدادات النواة)",
    /_cleaning_cfg/.test(src) && /supervisorBuildings/.test(src));
  T("★ مشرفُ المهمة يُشتقّ من مبناها مع تجاوزٍ اختياري (مصدرٌ واحد للحقيقة)",
    /function taskSupervisor\(t\)\{ return \(t&&t\.supervisor\) \? t\.supervisor : supOfBuilding\(t&&t\.building\); \}/.test(src));
  if (CO && typeof CO._supOfBuilding === "function" && typeof CO._taskSupervisor === "function") {
    T("مهمةٌ بتجاوزٍ صريح تتبع التجاوز",
      CO._taskSupervisor({ supervisor: "خالد", building: "مبنى أ" }) === "خالد");
    T("مهمةٌ بلا تجاوز تتبع مشرف مبناها (فارغٌ إن لم يُسنَد)",
      CO._taskSupervisor({ building: "مبنى غير مسنَد" }) === "");
  }
  // ★ الأهم: لا نُعمي مستخدماً بصمت — من ليس مربوطاً بمبانٍ يرى الكل لا لا شيء
  T("★ غيرُ المربوط بمبانٍ يرى كل المهام (لا حجب صامت)",
    /return null;\s*\/\/ غيرُ مربوطٍ بمباني/.test(src));
  T("الأدمن ومدير المشروع يريان كل المباني",
    /if\(r==="admin"\|\|r==="project_manager"\) return null;/.test(src));
  T("كل الشاشات تقرأ من مصدرٍ واحدٍ محترمٍ للنطاق (visibleTasks)",
    (src.match(/visibleTasks\(\)/g) || []).length >= 8);

  // صور التنفيذ
  T("الصور تُضغط وتُرفع بآلية النواة (compressImage + Storage)",
    /compressImage\(file\)/.test(src) && /st\.ref\("cleaning\/"/.test(src));
  T("مهلةُ رفعٍ تمنع التعليق إلى الأبد", /45000/.test(src) && /timedOut/.test(src));
  T("روابط الصور تُحفَظ في سجلّ التنفيذ", /photos: \(_execPhotos\|\|\[\]\)\.map\(p=>p\.url\)\.filter\(Boolean\)/.test(src));
  T("حدٌّ أقصى للصور لكل مهمة", /const room=4-_execPhotos\.length;/.test(src));
  // ★ capture المفروض دائماً كان يفتح الكاميرا ويمنع الاختيار من معرض الجوال
  T("★ capture يُضبَط للكاميرا فقط لا دائماً (وإلا امتنع المعرض)",
    /if\(fromCamera\) inp\.setAttribute\("capture","environment"\);/.test(src) &&
    !/inp\.capture="environment";/.test(src));
  T("زرّان: التقاطٌ بالكاميرا ومن المعرض", /pickPhoto\(true\)/.test(src) && /pickPhoto\(false\)/.test(src));
  T("اختيارٌ متعدّدٌ من المعرض ضمن المتبقّي من الحدّ",
    /else inp\.multiple=true;/.test(src) && /slice\.call\(inp\.files\|\|\[\],0,room\)/.test(src));

  // التقرير المصوّر — إدراجٌ للعرض فقط بلا تلويث مجموعة البلاغات
  T("★ تنفيذات النظافة لا تُكتب بلاغاتٍ (لا تُغرق القائمة ولا تشوّه مؤشّرات الصيانة)",
    !/collection\(\s*COLLECTION\(\)\s*\)/.test(src) && !/_tickets["'`]\)\.doc\(/.test(src));
  T("لفُّ generatePhotoReport مقصورٌ على مشاريع النظافة",
    /window\.generatePhotoReport\s*=\s*function/.test(src) &&
    /if\(!isCleaningProject\(\)\) return orig\.apply\(this, arguments\);/.test(src));

  // فلتر «مصدر التقرير» — يُحقَن لمشاريع النظافة وحدها
  T("★ فلتر مصدر التقرير يُحقَن في فلاتر النواة (بلا تعديل index.html)",
    /#page-photo-report \.report-filters/.test(src) && /co-pr-source/.test(src));
  T("الفلتر يُزال فوراً لمشروعٍ غير نظافة",
    /if\(!wrap \|\| !isCleaningProject\(\)\)\{[\s\S]{0,120}existing\.parentElement\.remove\(\);/.test(src));
  T("خيارات المصدر الثلاثة موجودة",
    /value=""[^>]*>الكل/.test(src) && /value="cleaning"/.test(src) && /value="tickets"/.test(src));
  T("★ «البلاغات فقط» يُرجع السلوك الأصلي بلا أي إدراج",
    /if\(src==="tickets"\) return orig\.apply\(this, arguments\);/.test(src));
  T("★ «النظافة فقط» يستبدل القائمة ولا يضمّها للبلاغات",
    /if\(src==="cleaning"\)\{[\s\S]{0,200}photoReportTickets = extra;/.test(src));
  T("«النظافة فقط» بلا نتائج يعطي رسالةً صريحة لا قائمةَ بلاغاتٍ مضلِّلة",
    /لا توجد أعمال نظافة مصوّرة مطابقة للتصفية/.test(src));
  T("الحاوية المستهدَفة موجودةٌ فعلاً في index.html (وإلا فالحقن ميت)",
    /class="report-filters"/.test(HTML) && /id="page-photo-report"/.test(HTML));
  T("لا يُدرَج في التقرير إلا ما له صورة", /filter\(r=>Array\.isArray\(r\.photos\)&&r\.photos\.length\)/.test(src));
  if (CO && typeof CO._logAsTicket === "function") {
    const tk = CO._logAsTicket({ id: "x", at: "2026-07-31T08:00:00Z", building: "مبنى أ", floor: "الدور 1",
      workType: "نظافة الأرضيات", supervisor: "خالد", by: "أحمد", taskName: "مسح الأرضيات",
      doneItems: 3, totalItems: 4, photos: ["u1", "u2"] });
    T("★ سجلّ التنفيذ يتحوّل لشكل بلاغٍ يفهمه التقرير",
      tk.status === "مغلق" && tk.building === "مبنى أ" && tk.workType === "نظافة الأرضيات" &&
      tk.supervisor === "خالد" && tk.photos.length === 2, JSON.stringify(tk.photos));
    T("الوصف يحمل اسم المهمة ونسبةَ بنودها عند غياب الملاحظة",
      tk.desc === "مسح الأرضيات" && tk.workDone === "3/4 بند فحص", tk.workDone);
    T("مُعلَّمٌ أنه من النظافة (يميَّز عند الحاجة)", tk._cleaning === true);
  }

  // ══ v18.9ag — التقرير المصوّر المجمّع: حارسٌ يمنع ارتدادَ حجم الملف ══
  // الجذر المقيس: ٢١٢ صورة = ٨٥٪ من ملفٍ بـ٢٠٫٤ م.ب. البطاقةُ المجمّعة تقصّ عددَ
  // الصور لا جودتَها، ولا تحذف صورةً من النظام.
  T("★ ag: فلتر «شكل تقرير النظافة» يُحقَن (مجمّع | مفصّل)",
    /co-pr-shape/.test(src) && /value="agg"/.test(src) && /value="full"/.test(src));
  T("★ ag: الافتراضُ «مجمّع» حتى عند غياب العنصر (الأصغرُ لا يفاجئ أحداً)",
    /function _prShape\(\)\{[^}]*==="full" \? "full" : "agg"/.test(src));
  T("ag: «مفصّل» يعيد بطاقةً لكل تنفيذ (السلوك القديم باقٍ)",
    /_prShape\(\)==="full" \? matched\.map\(_logAsTicket\) : _aggregateLog\(matched\)/.test(src));
  T("★ ag: النواة تفوّض رسم البطاقة المجمّعة للوحدة مع سقوطٍ آمن",
    /t\._agg&&window\.cleaningOps&&typeof window\.cleaningOps\._aggCardHTML==="function"/.test(HTML) &&
    /catch\(e\)\{ console\.warn\("prAggCard",e\); \}/.test(HTML));
  T("★ ag: العدُّ في الغلاف/الملخّص بالتنفيذات لا بالبطاقات",
    /const _prUnits=t=>\(Number\(t&&t\._aggRuns\)>0\?Number\(t\._aggRuns\):1\)/.test(HTML) &&
    /const smTotal=filteredList\.reduce\(\(a,t\)=>a\+_prUnits\(t\),0\)/.test(HTML));
  T("ag: أيامُ العمل اتّحادٌ لا مجموع (الأيام تتداخل بين المباني)",
    /smDays=_prIsAgg\?new Set\(\[\]\.concat\.apply/.test(HTML));
  T("★ ag: عدّاد الحجم قبل الطباعة موجودٌ ومخفيٌّ عن الملف",
    /_prPhotoCount\*85\/1024\+0\.4/.test(HTML) && /_prSizeBar=`<div class="no-print"/.test(HTML) &&
    /out\.innerHTML=`\$\{_prSizeBar\}<div id="photo-report-printable">/.test(HTML));
  if (CO && typeof CO._aggregateLog === "function") {
    const mkR = (b, w, d, ph, done) => ({ id: "r" + d + b + w, building: b, workType: w, date: d, at: d + "T08:00:00Z",
      floor: "الدور 1", supervisor: "خالد", by: "أحمد", taskName: "مسح", doneItems: done == null ? 3 : done, totalItems: 4, photos: ph });
    const recs = [];
    for (let i = 1; i <= 9; i++) recs.push(mkR("مبنى أ", "أرضيات", "2026-08-0" + i, ["A" + i]));
    recs.push(mkR("مبنى أ", "زجاج", "2026-08-01", ["Z1", "Z2"]));
    recs.push(mkR("مبنى ب", "أرضيات", "2026-08-02", ["B1"]));
    const agg = CO._aggregateLog(recs);
    T("★ ag: بطاقةٌ لكل (مبنى × نوع عمل) — ١١ تنفيذاً ⟵ ٣ بطاقات",
      agg.length === 3, "بطاقات=" + agg.length);
    const a1 = agg.find(x => x.building === "مبنى أ" && x.workType === "أرضيات");
    T("ag: البطاقة تحمل عددَ التنفيذات وأيامَ العمل والفترة",
      a1 && a1._aggRuns === 9 && a1._aggDates.length === 9 && a1._aggFrom === "2026-08-01" && a1._aggTo === "2026-08-09",
      JSON.stringify(a1 && [a1._aggRuns, a1._aggDates.length, a1._aggFrom, a1._aggTo]));
    T("★ ag: ثلاثُ صورٍ فقط تُعرَض من تسعِ تنفيذات (قصُّ الحجم)",
      a1 && a1.photos.length === CO._AGG_PHOTOS_PER_CARD && CO._AGG_PHOTOS_PER_CARD === 3, JSON.stringify(a1 && a1.photos));
    T("★ ag: الصورُ موزّعةٌ على الفترة: أوّلٌ · منتصفٌ · آخِر",
      a1 && a1.photos[0] === "A1" && a1.photos[1] === "A5" && a1.photos[2] === "A9", JSON.stringify(a1 && a1.photos));
    T("★ ag: الاختيارُ حتميّ — نفسُ المدخلات ⇒ نفسُ الصور (لا إعادةَ سحب)",
      JSON.stringify(CO._aggregateLog(recs)) === JSON.stringify(agg));
    T("★ ag: عددُ الصور الموثَّقة كاملاً محفوظٌ للتصريح (لا حذفَ من النظام)",
      a1 && a1._aggPhotoCount === 9);
    const a2 = agg.find(x => x.workType === "زجاج");
    T("ag: التنفيذُ الواحدُ بصورتين يُكمل من صوره حين لا تكفي التنفيذات",
      a2 && a2.photos.length === 2 && a2.photos[0] === "Z1" && a2.photos[1] === "Z2", JSON.stringify(a2 && a2.photos));
    T("ag: المعرّفُ صناعيٌّ (AGG-n) لا اسمُ المبنى — لا يكسر نصَّ onclick",
      agg.every(x => /^AGG-\d+$/.test(x.id)) && new Set(agg.map(x => x.id)).size === 3);
    T("ag: تاريخُ كل صورةٍ متاحٌ للشارة عبر _aggDateOf",
      a1 && a1._aggDateOf["A1"] === "2026-08-01" && a1._aggDateOf["A9"] === "2026-08-09");
    T("ag: نسبةُ بنود الفحص مجمَّعةٌ على المجموعة", a1 && a1._aggItemsPct === 75, String(a1 && a1._aggItemsPct));
    T("ag: مُعلَّمةٌ _agg و_cleaning معاً", agg.every(x => x._agg === true && x._cleaning === true));
    const one = CO._aggPickPhotos([mkR("ب", "و", "2026-08-01", ["X"])], 3);
    T("ag: تنفيذٌ واحدٌ بصورةٍ واحدة لا ينتج تكراراً", one.length === 1 && one[0].url === "X");
    T("ag: n=0 يُرجع فراغاً بلا انهيار", CO._aggPickPhotos(recs, 0).length === 0);
  }
  if (CO && typeof CO._aggCardHTML === "function" && typeof CO._aggregateLog === "function") {
    const card = CO._aggCardHTML(CO._aggregateLog([
      { id: "r1", building: "مبنى أ", workType: "أرضيات", date: "2026-08-01", at: "2026-08-01T08:00:00Z",
        supervisor: "خالد", doneItems: 4, totalItems: 4, photos: ["A1", "A2", "A3", "A4"] }
    ])[0]);
    T("★ ag: البطاقة تُصرّح بعدد الصور المعروضة من الموثَّقة (شفافيةٌ لا إخفاء)",
      /3 صورة معروضة من 4 صورة موثَّقة/.test(card), card.slice(0, 0));
    T("ag: البطاقة تستعير أصنافَ النواة فتنطبق أنماطُ الطباعة",
      /class="pr-card"/.test(card) && /class="pr-photos-grid"/.test(card) && /class="pr-photo-wrap"/.test(card));
    T("ag: حذفُ البطاقة وحذفُ الصورة الفرديّة يعملان على المجمّعة",
      /removeFromPhotoReport\('AGG-1'\)/.test(card) && /removePhotoFromCard\('AGG-1','closing',0\)/.test(card));
  }

  // ══ توليد الجدول بالذكاء الاصطناعي: بترُ الردّ لا يُضيّع المهامّ المكتملة ══
  // العربية مكلفةٌ توكنياً، فسقفٌ ضيّق يبتر الردّ ويُفشل تحليل JSON كلّه.
  T("★ سقف التوكنات واسع (2500 كانت تبتر الردّ العربي)", /maxTokens:\s*8000/.test(src) && !/maxTokens:\s*2500/.test(src));
  T("الوحدة تُنقذ الردّ غير القابل للتحليل الكامل", /_salvageObjects\(txt\)/.test(src));
  if (CO && typeof CO._salvageObjects === "function") {
    const pick = txt => {
      let sal = CO._salvageObjects(txt);
      const wrap = sal.find(o => o && Array.isArray(o.tasks) && o.tasks.length);
      return (wrap ? wrap.tasks : sal).filter(o => o && o.name);
    };
    const trunc = '```json\n{"tasks":[{"name":"تنظيف دورات المياه","checklist":["تعقيم","مرايا"]},' +
      '{"name":"مسح الأرضيات","checklist":["كنس"]},{"name":"تنظيف الزج';
    const r1 = pick(trunc);
    T("★ الردّ المبتور يعطي كلّ مهمةٍ اكتملت قبل القطع", r1.length === 2, r1.map(o => o.name).join("، "));
    T("قوائم فحص المهامّ المُنقَذة سليمة", JSON.stringify(r1[0].checklist) === '["تعقيم","مرايا"]');
    T("الردّ الكامل يمرّ عبر نفس المسار", pick('{"tasks":[{"name":"أ"},{"name":"ب"}]}').length === 2);
    T("★ الأقواس داخل السلاسل لا تخدع الماسح",
      pick('{"tasks":[{"name":"مهمة { غريبة }","checklist":["بند \\" فيه اقتباس"]}]}').length === 1);
    T("نصٌّ قبل JSON وبعده لا يمنع الاستخراج", pick('إليك الجدول:\n{"tasks":[{"name":"ج"}]}\nبالتوفيق').length === 1);
    T("ردٌّ بلا JSON يُرجع صفراً (لا تلفيق)", pick("عذراً لا أستطيع").length === 0);
  }

  // ══ ★ v18.9vv: وضع «إضافة مهام محددة» في التوليد بالذكاء الاصطناعي ══
  // بعد توليد الجدول الكامل قد تظهر مهمة جديدة يلزم إضافتها للمبنى — إعادة التوليد
  // الكامل تكرّر 8–12 مهمة قائمة. الوضع المحدد يولّد الموصوف وحده ويمرّر الموجود
  // للنموذج كي لا يقترح مكرراً. حارس يمنع الارتداد لوضعٍ واحد أو لموجّهٍ بلا منع تكرار.
  T("★ vv: _genPrompt نقيةٌ مكشوفة", CO && typeof CO._genPrompt === "function");
  if (CO && typeof CO._genPrompt === "function") {
    const pFull = CO._genPrompt({ mode: "full", bld: "مبنى أ", kind: "إداري" });
    const pSpec = CO._genPrompt({ mode: "specific", bld: "مبنى أ", spec: "تنظيف خزانات المياه شهرياً",
      existing: ["تنظيف دورات المياه", "مسح الأرضيات"] });
    T("★ vv: الوضع الكامل باقٍ حرفياً (8–12 مهمة)", pFull.includes("بين 8 و 12 مهمة تغطّي المناطق الرئيسية"));
    T("★ vv: الوضع المحدد لا يطلب جدولاً كاملاً",
      !pSpec.includes("بين 8 و 12 مهمة") && pSpec.includes("لا تُنشئ جدولاً كاملاً"));
    T("★ vv: وصف المستخدم يصل للنموذج حرفياً", pSpec.includes("تنظيف خزانات المياه شهرياً"));
    T("★ vv: المهام الموجودة تُمرَّر مع أمر منع التكرار",
      pSpec.includes("لا تكرّرها") && pSpec.includes("تنظيف دورات المياه") && pSpec.includes("مسح الأرضيات"));
    T("vv: بلا مهامّ موجودة لا يظهر قسم منع التكرار",
      !CO._genPrompt({ mode: "specific", spec: "س" }).includes("لا تكرّرها"));
    T("★ vv: الوضعان يطلبان نفس شكل JSON (مسار تحليل واحد)",
      pFull.includes('{"tasks":[{"name"') && pSpec.includes('{"tasks":[{"name"'));
    T("vv: أنواع العمل والتكرارات المسموحة في الوضعين",
      pSpec.includes("أنواع العمل المسموحة") && pSpec.includes("التكرارات المسموحة"));
  }
  T("★ vv: نموذج التوليد فيه منتقي الوضع وحقل وصف المهام",
    src.includes('id="co-gen-mode"') && src.includes('id="co-gen-spec"'));
  T("★ vv: doGen يشترط الوصف في الوضع المحدد (لا توليد أعمى)",
    /mode==="specific" && !spec/.test(src));
  T("★ vv: doGen يجمع مهامّ المبنى القائمة للوضع المحدد",
    src.includes("(!bld || t.building===bld)"));
  T("vv: سقف الوضع المحدد 10 مهام (لا جدول كامل متسلّل)",
    src.includes('raw.slice(0, mode==="specific"?10:30)'));
  T("vv: تبديل الوضع لا يعيد render (لا تضيع القيم المكتوبة)",
    /function genModeChanged\(\)\{/.test(src) && src.includes("cleaningOps.genModeChanged()"));

  // ══ ★ v18.9vw: «مبنى مرجعي» في التوليد الكامل — مبنى جديد على منوال القائم ══
  // توليد مبنى جديد كان عامّاً (٨–١٢ مهمة نمطية) فلا يرث تعديلات المستخدم على
  // المباني القائمة. الآن يُمرَّر جدول مبنى مرجعي فعليّ للنموذج مع أمر المحاكاة.
  if (CO && typeof CO._genPrompt === "function") {
    const refTasks = [
      { name: "تنظيف دورات المياه", workType: "نظافة دورات المياه", freq: "يومي", checklist: ["تعقيم", "مرايا"] },
      { name: "مسح الأرضيات", workType: "نظافة الأرضيات", freq: "يومي" }
    ];
    const pRef = CO._genPrompt({ mode: "full", bld: "مبنى ج", kind: "إداري", ref: { name: "مبنى أ", tasks: refTasks } });
    T("★ vw: الموجّه مع مرجع يأمر بمحاكاة جدول المبنى القائم",
      pRef.includes("«مبنى أ»") && pRef.includes("اجعله مرجعك الأول") && pRef.includes("حاكِ نمطه"));
    T("★ vw: جدول المرجع يصل للنموذج (اسم | نوع | تكرار | بنود)",
      pRef.includes("- تنظيف دورات المياه | نظافة دورات المياه | يومي | بنود الفحص: تعقيم؛ مرايا") &&
      pRef.includes("- مسح الأرضيات | نظافة الأرضيات | يومي"));
    T("★ vw: مع مرجعٍ لا تُطلَب 8–12 نمطية (المنوال يحكم العدد)",
      !pRef.includes("بين 8 و 12 مهمة") && pRef.includes("على منوال المرجع"));
    T("vw: شكل JSON نفسه مع المرجع (مسار تحليل واحد)", pRef.includes('{"tasks":[{"name"'));
    T("★ vw: بلا مرجع يبقى التوليد العام القديم حرفياً (لا ارتداد)",
      CO._genPrompt({ mode: "full", bld: "مبنى ج" }).includes("بين 8 و 12 مهمة تغطّي المناطق الرئيسية"));
    T("★ vw: وضع «مهام محددة» يتجاهل المرجع (لا خلط بين الوضعين)",
      !CO._genPrompt({ mode: "specific", spec: "س", ref: { name: "مبنى أ", tasks: refTasks } }).includes("اجعله مرجعك"));
    const many = Array.from({ length: 40 }, (_, i) => ({ name: "م" + i, workType: "أخرى", freq: "يومي" }));
    T("vw: سقف جدول المرجع 30 مهمة (لا موجّه منفلت)",
      (CO._genPrompt({ mode: "full", ref: { name: "ب", tasks: many } }).match(/\n- /g) || []).length === 30);
    T("vw: مرجع فارغ = بلا مرجع (لا قسم محاكاة فارغ)",
      !CO._genPrompt({ mode: "full", ref: { name: "ب", tasks: [] } }).includes("اجعله مرجعك"));
  }
  T("★ vw: نموذج التوليد فيه منتقي المبنى المرجعي بخيار تلقائي وبلا مرجع",
    src.includes('id="co-gen-ref"') && src.includes('value="__auto__"') &&
    src.includes("— بلا مرجع (توليد عام) —"));
  T("★ vw: التلقائي يحسم بالأكثر مهامّاً ويستثني المبنى المستهدف",
    src.includes("byBld[b].length-byBld[a].length") && src.includes("t.building!==bld"));
  T("vw: منتقي المرجع يُخفى في وضع «مهام محددة»",
    src.includes('m==="specific"||!hasRefs'));

  // ══ ★ v18.9vx/wa: عرض مضغوط — بطاقتان لكل مبنى + نافذة «مهام أخرى» ══
  // اللوحة كانت تعرض كل بطاقات المبنى فتطول وتتفاوت الأعمدة. الآن أول بطاقتين
  // بالأولوية، وزرُّ «عرض N مهام أخرى» يفتح **نافذةً منبثقة** بكل مهامّ المبنى
  // (wa — بطلب المستخدم: لا تمدُّدَ لأسفل). مصدرٌ واحد للوحة اليوم والمتابعة اليومية.
  T("★ vx: _cappedTaskListHTML مكشوفة وسقف البطاقات 2",
    CO && typeof CO._cappedTaskListHTML === "function" && CO._BOARD_CARDS_PER_BLD === 2);
  T("★ vx: الشاشتان تمرّان عبر المصدر الواحد (القائمة الكاملة في نافذة المبنى وحدها)",
    (src.match(/\$\{_cappedTaskListHTML\(b, list\)\}/g) || []).length === 2 &&
    (src.match(/<div class="co-tasklist">\$\{list\.map\(taskCardHTML\)/g) || []).length === 1);
  if (CO && typeof CO._cappedTaskListHTML === "function") {
    const five = Array.from({ length: 5 }, (_, i) =>
      mk({ id: "c" + i, name: "مهمة " + i, building: "مبنى الفحص", nextDueDate: today }));
    const capped = CO._cappedTaskListHTML("مبنى الفحص", five);
    T("★ vx: بطاقتان فقط وزرّ «عرض 3 مهام أخرى»",
      (capped.match(/ppm-card/g) || []).length === 2 && capped.includes("عرض 3 مهام أخرى"),
      "cards=" + (capped.match(/ppm-card/g) || []).length);
    T("vx: مبنيان أو أقل = لا زرّ (لا ضجيج)",
      !CO._cappedTaskListHTML("مبنى ب", five.slice(0, 2)).includes("co-more-btn"));
    T("vx: مهمة زائدة واحدة تُصاغ مفردةً",
      CO._cappedTaskListHTML("مبنى ج", five.slice(0, 3)).includes("عرض 1 مهمة أخرى"));
  }
  T("★ wa: الزرّ يفتح نافذة المبنى لا توسيعاً في المكان",
    src.includes("cleaningOps.openBldTasks('${encodeURIComponent(b)}')") &&
    typeof CO.openBldTasks === "function" && typeof CO.closeBldTasks === "function" &&
    !src.includes("_expandedBlds"));
  T("★ wa: النافذة على body — تعمل من اللوحة والمتابعة اليومية معاً",
    src.includes("document.body.appendChild(ov)") && src.includes('ov.className="co-bld-overlay"'));
  T("★ wa: قائمة النافذة من نفس مصدر اللوحة (مهامّ اليوم بترتيب الأولوية)",
    /_bldModalRender[\s\S]{0,900}?visibleTasks\(\)\s*\n?\s*\.filter\(t=>!isDisabled\(t\) && \(isDue\(t\)\|\|doneToday\(t\)\)/.test(src) &&
    /_bldModalRender[\s\S]{0,1100}?dueStatus\(x\)\.sort-dueStatus\(y\)\.sort/.test(src));
  T("★ wa: أزرار تنفيذ/تحرير داخل النافذة تُغلقها بمستمع capture (لا يعطّله stopPropagation)",
    /closest\("button"\)/.test(src) && /setTimeout\(closeBldTasks,0\)/.test(src) &&
    /\}, true\);/.test(src));
  T("wa: الخلفية تُغلق النافذة وزرّ ✕ موجود",
    src.includes("if(e.target===ov) closeBldTasks()") && src.includes("cleaningOps.closeBldTasks()"));
  T("wa: النافذة تُغلق مع تبديل الشاشة والمشروع",
    /function setView\(v\)\{[^\n]*closeBldTasks\(\);/.test(src) &&
    src.includes('_view="board"; closeBldTasks();'));
  T("wa: مفتاح المبنى بالـ URI-encoding (اسمٌ بأي محارف لا يكسر onclick)",
    src.includes("decodeURIComponent(key)"));
  T("wa: للنافذة قواعدُ عرضٍ ثابتة (overlay مثبّت + جسمٌ يتمرّر)",
    src.includes(".co-bld-overlay{position:fixed;inset:0") &&
    src.includes(".co-bld-modal{width:min(440px,96vw) !important;max-height:80vh;overflow-y:auto"));
  // ★ wd: النواة تفرض width:100% !important على .card (قاعدة الداشبورد الجماعية —
  // ابحث عن `.card,` في قاعدة .dash-top) فتقهر أي عرضٍ عادي — لذا عرضُ النافذة
  // !important وجوباً. هذا الحارس يمنع إسقاطها سهواً فتعود النافذة بعرض الشاشة.
  T("★ wd: عرض النافذة !important (النواة تفرض width:100%!important على .card)",
    /\.co-bld-modal\{width:min\(440px,96vw\) !important/.test(src) &&
    /\.card,\s*\.filters,\s*\.buildings-grid\s*\{[^}]*width:\s*100%\s*!important/.test(HTML));

  // ══ ★ v18.9y: «كل المهام» ببطاقات المباني — والمجدولُ القادم ظاهرٌ قابلٌ للتنفيذ ══
  // لوحةُ اليوم لا تعرض إلا المستحقَّ اليوم، فمهمةٌ تبدأ غداً لا يراها المستخدم. الآن
  // شاشة «كل المهام» تعرض المهامّ **كلَّها** مقسَّمةً في بطاقات المباني (نفس مفردات
  // اللوحة) مع مرشِّح حالةٍ جدوليّ، ومبدّلٍ للجدول القديم.
  T("★ y: تصنيفٌ جدوليٌّ مستقلٌّ مكشوف (schedClass/schedSort/allPass)",
    CO && typeof CO._schedClass === "function" && typeof CO._schedSort === "function" &&
    typeof CO._allPass === "function");
  if (CO && typeof CO._schedClass === "function") {
    const tmr = CO._addDays(today, 1), yst = CO._addDays(today, -3);
    const up = mk({ id: "u1", nextDueDate: tmr });
    const td = mk({ id: "u2", nextDueDate: today });
    const ov = mk({ id: "u3", nextDueDate: yst });
    const off = mk({ id: "u4", nextDueDate: tmr, disabled: true });
    const dn = mk({ id: "u5", nextDueDate: CO._addDays(today, 1), lastExecuted: today + "T08:00:00.000Z" });
    T("★ y: القادم/اليوم/المتأخّر/الموقوف/المنفَّذ اليوم تُصنَّف بالتاريخ وحده",
      CO._schedClass(up) === "upcoming" && CO._schedClass(td) === "today" &&
      CO._schedClass(ov) === "overdue" && CO._schedClass(off) === "off" &&
      CO._schedClass(dn) === "today",
      [up, td, ov, off, dn].map(CO._schedClass).join("،"));
    T("★ y: المرشِّح «قادمة» يُظهر ما يبدأ غداً — وهو ما كانت اللوحة تُخفيه",
      CO._allPass(up, "upcoming") && !CO._allPass(td, "upcoming") && !CO._allPass(ov, "upcoming"));
    T("y: «الكل» يمرّر كلَّ شيء والموقوفة لها تصنيفها",
      CO._allPass(off, "all") && CO._allPass(off, "off") && !CO._allPass(off, "today"));
    T("★ y: الترتيب: الأكثر تأخّراً ← اليوم ← الأقرب موعداً ← المنفَّذ ← الموقوف",
      JSON.stringify([off, dn, up, td, ov].slice().sort((a, b) => CO._schedSort(a) - CO._schedSort(b)).map(t => t.id))
      === '["u3","u2","u1","u5","u4"]');
  }
  // الحارس الجوهري: الإجازة تُصفّر isDue/isOverdue (لا ضغطَ يوم عطلة) وهو صحيحٌ
  // للتغطية — لكن لو بُني عليهما تصنيفُ الجدول لصارت كلُّ المهامّ «قادمة» يوم الجمعة.
  T("★ y: التصنيف الجدولي يقرأ التاريخ وحده (لا isDue/isOverdue فتنهار الشاشة في الإجازة)",
    /function schedClass\(t\)\{[\s\S]{0,320}?\n\}/.test(src) &&
    !/function schedClass\(t\)\{[\s\S]{0,320}?(isDue|isOverdue)\(/.test(src) &&
    !/function schedSort\(t\)\{[\s\S]{0,320}?(isDue|isOverdue)\(/.test(src));
  T("★ y: العرض البطاقي هو الافتراضي في «كل المهام» (لا الجدول)",
    /let _allMode\s*=\s*"cards"/.test(src) &&
    src.includes('_allMode==="table" ? _allTableHTML(rows) : _allGroupsHTML(rows)'));
  T("★ y: بطاقات المباني بنفس مفردات اللوحة (co-groups/co-group/ppm-card عبر بطاقة المهمة)",
    /_allGroupsHTML[\s\S]{0,700}?<div class="co-groups">/.test(src) &&
    /_allGroupsHTML[\s\S]{0,900}?_bldOrder\(byB\)/.test(src) &&
    /_allGroupsHTML[\s\S]{0,900}?_allBldListHTML\(b, items\)/.test(src));
  if (CO && typeof CO._allBldListHTML === "function") {
    T("★ y: سقفُ الشاشة أعلى من اللوحة (جدولٌ لا لوحةَ يوم)",
      CO._ALL_CARDS_PER_BLD === 4 && CO._ALL_CARDS_PER_BLD > CO._BOARD_CARDS_PER_BLD);
    const six = Array.from({ length: 6 }, (_, i) =>
      mk({ id: "a" + i, name: "مهمة " + i, building: "مبنى الجدول", nextDueDate: CO._addDays(today, 1) }));
    const capped = CO._allBldListHTML("مبنى الجدول", six);
    T("★ y: أربع بطاقات وزرٌّ يفتح النافذة بنطاق **كل** مهامّ المبنى",
      (capped.match(/ppm-card/g) || []).length === 4 && capped.includes("عرض 2 مهام أخرى") &&
      capped.includes("openBldTasks('" + encodeURIComponent("مبنى الجدول") + "','all')"),
      "cards=" + (capped.match(/ppm-card/g) || []).length);
    T("★ y: بطاقةُ المهمة القادمة تحمل تاريخ استحقاقها (لا «بعد N يوم» وحدها)",
      capped.includes(CO._addDays(today, 1)));
  }
  T("★ y: نافذة المبنى تفرّق النطاقين — والمرشِّح يسري داخلها",
    /_bldModalScope==="all"/.test(src) && src.includes("allPass(t,_allFilter)") &&
    /function openBldTasks\(key, scope\)/.test(src) &&
    src.includes('_bldModalScope=(scope==="all")?"all":"today"'));
  T("★ y: مبدّل العرض والمرشِّح مكشوفان ويُغلقان نافذة المبنى (لا نافذةٌ بنطاقٍ زائل)",
    typeof CO.setAllMode === "function" && typeof CO.setAllFilter === "function" &&
    /function setAllMode\(m\)\{[^\n]*closeBldTasks\(\);/.test(src) &&
    /function setAllFilter\(f\)\{[^\n]*closeBldTasks\(\);/.test(src));
  T("y: شريط المرشِّحات فيه العدّادات ومبدّل بطاقات/جدول",
    src.includes("cleaningOps.setAllFilter('") && src.includes("بطاقات المباني") &&
    src.includes('cleaningOps.setAllMode(\'table\')') && src.includes(".co-chips{display:flex"));
  // الموقوفة كانت تُصفَّى قبل بطاقات اللوحة فلم يظهر زرُّ تنفيذها قطّ — والشاشة
  // البطاقية الجديدة تعرضها، فلولا الشرط لعُرض «تنفيذ» على مهمةٍ أوقفها المدير.
  T("★ y: بطاقة المهمة الموقوفة بلا زرّ تنفيذ وبمظهرٍ خافت",
    /const off=isDisabled\(t\);/.test(src) &&
    src.includes("${(!done&&!off&&canExecute())||canEdit()") &&
    src.includes("${(done||off) ? \"\" : (canExecute()?") &&
    src.includes("co-card-off") && /\.co-card-off\{opacity:/.test(src));
  T("y: الجدول باقٍ بعمود الاستحقاق واسمُ المهمة يفتح تفاصيلها",
    src.includes("<th>الاستحقاق</th>") &&
    /co-td-name co-clickable" onclick="cleaningOps\.openDetail/.test(src));

  // ══ ★ v18.9we: إطلاق المهام في وقت محدد — لا تأخير وهمي أثناء التجهيز ══
  // المهام تُنشأ اليوم والتشغيل يبدأ لاحقاً فيتراكم «تأخير» بلا داعٍ. الإطلاق يعيد
  // جدولة استحقاق مهامّ المبنى لتاريخ البدء، والتوليد يقبل تاريخ بدءٍ من الأساس.
  T("★ we: _launchTargets نقيةٌ مكشوفة", CO && typeof CO._launchTargets === "function");
  if (CO && typeof CO._launchTargets === "function") {
    const pool = [
      mk({ id: "l1", building: "مبنى أ" }), mk({ id: "l2", building: "مبنى أ", disabled: true }),
      mk({ id: "l3", building: "مبنى ب" }), mk({ id: "l4", building: "" })
    ];
    T("★ we: الإطلاق لمبنى بعينه يستهدف مهامّه النشطة وحدها (الموقوفة تُستثنى)",
      JSON.stringify(CO._launchTargets(pool, "مبنى أ").map(t => t.id)) === '["l1"]');
    T("★ we: «كل المباني» يستهدف كل النشطة (بلا مبنى ضمناً)",
      JSON.stringify(CO._launchTargets(pool, "").map(t => t.id)) === '["l1","l3","l4"]');
    T("we: المهمة بلا مبنى تُستهدف تحت «بلا مبنى»",
      JSON.stringify(CO._launchTargets(pool, "بلا مبنى").map(t => t.id)) === '["l4"]');
  }
  T("★ we: doLaunch يرفض الماضي ويرحّل العطلة لأول يوم عمل",
    /if\(raw<_today\(\)\)\{ _toast\("⚠ التاريخ في الماضي/.test(src) &&
    /const date=_nextWorkingDay\(raw\);/.test(src));
  T("★ we: الإطلاق يكتب nextDueDate وحدها بدمجٍ (لا يمسّ بقية حقول المهمة)",
    src.includes("saveTask({id:t.id, nextDueDate:date})"));
  T("we: الإطلاق مسوَّر بالصلاحية ومسجَّل في التدقيق",
    /doLaunch\(\)\{\s*\n?\s*if\(!canEdit\(\)\)/.test(src) &&
    src.includes('_audit("إطلاق مهام النظافة"'));
  T("we: زرّ «إطلاق المهام» في الهيرو لمالكي الصلاحية",
    src.includes('cleaningOps.toggleLaunch()') && /canEdit\(\)\?`<button[^`]*toggleLaunch/.test(src));
  T("★ we: التوليد يقبل تاريخ بدءٍ — الماضي يُقصّ لليوم والعطلة تُرحَّل",
    src.includes('id="co-gen-start"') &&
    src.includes("const start=_nextWorkingDay(startRaw && startRaw>_today() ? startRaw : _today())") &&
    src.includes("nextDueDate: start,"));
  T("we: نموذجا الإطلاق والتوليد لا يفتحان معاً",
    src.includes("if(_genForm) _launchForm=false") && src.includes("if(_launchForm) _genForm=false"));

  // ══ ★ v18.9wf: صلاحية «تشغيل النظافة» في إدارة المستخدمين ══
  // لم يكن للنظافة مفتاح صلاحية — فلا سبيل لمنح/حجب الوحدة عند إضافة مستخدم.
  T("★ wf: مربّع «تشغيل النظافة» في نموذج إضافة المستخدم",
    HTML.includes('id="perm-cleaning" checked> تشغيل النظافة'));
  T("★ wf: مفتاح cleaning في مصدر المفاتيح الواحد (تقرؤه مصفوفتا الحفظ معاً)",
    /const _PERM_LABELS = \{[\s\S]*?cleaning:"تشغيل النظافة"[\s\S]*?\};/.test(HTML) &&
    (HTML.match(/const permKeys=_PERM_KEYS;/g) || []).length === 2);
  T("★ wf: الخريطة تربط cleaning بصفحة cleaning-ops (حجبُ showPage المباشر)",
    /cleaning:\s*\["cleaning-ops"\]/.test(HTML));
  T("★ wf: تسمية «تشغيل النظافة» في شارات القائمة ونافذة التعديل",
    (HTML.match(/cleaning:"تشغيل النظافة"/g) || []).length === 2);
  T("★ wf: زرّ الوحدة يقرأ حاجب النواة بنفسه (يُحقن بعد applyPermissions)",
    src.includes("window._blockedPages.has(PAGE_ID)") &&
    /shouldShow = canView\(\) && isCleaningProject\(\) && !blocked/.test(src));

  /* ══ ★ ce: «إدارة مهام النظافة» — مفتاحٌ مانحٌ يفتح التحرير بلا رفعِ دور ══
     مديرةُ مشروع النظافة دورُها المسجَّل «مشرف»، وكان التحريرُ للأدمن ومدير المشاريع
     وحدَهما. الحارسُ هنا يمنع الارتداد إلى: (١) اشتقاقِ التحرير من الدور وحده،
     (٢) وأخطرَ منه — قراءةِ المفتاح المانح باصطلاح المفاتيح الحاجبة (`!== false`)
     فينفتح التحريرُ لكلّ مستخدمٍ قائمٍ بأثرٍ رجعيّ. */
  /* تنفيذاً لا نصّاً: نبدّل `currentUser` في الحاضنة ونسأل الدالّةَ نفسَها. */
  {
    const asUser = (u) => { sandbox.currentUser = u; };
    const prevUser = sandbox.currentUser;
    const sup = (perms) => ({ user:"hanan", name:"حنان", role:"مشرف", permissions:perms });
    asUser(sup({ cleaning:true, cleaningEdit:true }));
    T("★ ce: المشرفُ الممنوحُ صراحةً يحرّر — حالةُ حنان", CO._canEdit() === true);
    asUser(sup({ cleaning:true }));
    T("★ ce: مشرفٌ بلا المفتاح لا يحرّر (لا يُقرأ المانحُ إلا `=== true`)", CO._canEdit() === false);
    asUser(sup({ cleaning:true, cleaningEdit:false }));
    T("★ ce: المفتاحُ المعلَّم بـfalse لا يمنح", CO._canEdit() === false);
    asUser({ user:"old", role:"مشرف" });                    // مستخدمٌ قديم بلا حقل صلاحيات
    T("★ ce: المستخدمُ القديم بلا `permissions` لا يرث التحرير", CO._canEdit() === false);
    asUser({ user:"v", role:"viewer",   permissions:{ cleaningEdit:true } });
    T("★ ce: الزائرُ لا يفتح له المفتاحُ شيئاً (الخادمُ يردّ كتابتَه أصلاً)", CO._canEdit() === false);
    asUser({ user:"o", role:"observer", permissions:{ cleaningEdit:true } });
    T("★ ce: والمراقبُ كذلك", CO._canEdit() === false);
    asUser({ user:"pm", role:"project_manager" });
    T("★ ce: ومديرُ المشاريع يحرّر بدوره بلا مفتاح", CO._canEdit() === true);
    asUser(sup({ cleaning:true }));
    T("★ ce: المفتاحُ لم يمسّ التنفيذَ ولا جولاتِ الجودة (مشرفٌ بلا مفتاحٍ كما كان)",
      CO._canExecute() === true && CO._canQuality() === true);
    asUser({ user:"t", role:"فني" });
    T("★ ce: والفنيُّ ينفّذ ولا يفتّش ولا يحرّر",
      CO._canExecute() === true && CO._canQuality() === false && CO._canEdit() === false);
    sandbox.currentUser = prevUser;
  }
  T("★ ce: النواة تفصل المفاتيح المانحة عن الحاجبة بمصدرٍ واحدٍ للقراءة",
    /const _PERM_GRANT_KEYS = \["cleaningEdit"\];/.test(HTML) &&
    /function _permOn\(perms, k\)\{[\s\S]{0,240}?perms\[k\] === true[\s\S]{0,120}?perms\[k\] !== false;/.test(HTML));
  T("★ ce: الشارات ونافذة التعديل تقرآن _permOn لا المقارنة الحاجبة مباشرةً",
    !/perms\[k\]!==false/.test(HTML) &&
    (HTML.match(/_permOn\(perms,k\)/g) || []).length >= 3);
  T("★ ce: مربّع المفتاح في نموذج الإضافة غيرُ مؤشَّرٍ افتراضاً",
    HTML.includes('id="perm-cleaningEdit"> إدارة مهام النظافة') &&
    !/id="perm-cleaningEdit"\s+checked/.test(HTML));
  T("★ ce: المفتاح في مصدر المفاتيح الواحد الذي تقرؤه الحفظُ والتسمياتُ معاً",
    /cleaningEdit:"إدارة مهام النظافة"/.test(HTML) &&
    /const permLabels=_PERM_LABELS;/.test(HTML) &&
    (HTML.match(/const permKeys=_PERM_KEYS;/g) || []).length === 2);

  /* ══ ★★ مصدرُ مفاتيح الصلاحيات واحدٌ — والشبكةُ الساكنةُ تُطابقه ══
     كانت القائمةُ مكرَّرةً في أربعة مواضع (شبكةُ «مستخدم جديد» · تسمياتُ نافذة
     التعديل · مصفوفتا `permKeys`). ومفتاحٌ يُضاف في ثلاثةٍ ويُنسى في الرابع
     **يُحفَظ بلا قيمة** أو **يُقرأ بلا خانةٍ تُعدّله** — بلا خطأٍ ظاهرٍ يُنبّه.
     فالحارسُ يطابق مفاتيحَ المصدر بمربّعات الترميز الساكن مفتاحاً مفتاحاً. */
  {
    const labelsBlock = (HTML.match(/const _PERM_LABELS = \{([\s\S]*?)\};/) || [])[1] || "";
    const keys = [...labelsBlock.matchAll(/(\w+)\s*:\s*"/g)].map(m => m[1]);
    const missingBox = keys.filter(k => !new RegExp('id="perm-' + k + '"').test(HTML));
    T("★★ pk: مصدرُ المفاتيح موجودٌ ومنه تُشتقّ `_PERM_KEYS`",
      keys.length >= 10 && /const _PERM_KEYS = Object\.keys\(_PERM_LABELS\);/.test(HTML), keys.join(","));
    T("★★ pk: لكلِّ مفتاحٍ في المصدر مربّعٌ في نموذج إضافة المستخدم",
      missingBox.length === 0, missingBox.join(","));
    T("★★ pk: ولا مربّعَ صلاحيةٍ في الترميز بلا مفتاحٍ في المصدر (خانةٌ لا تُحفَظ)",
      [...HTML.matchAll(/id="perm-(\w+)"/g)].map(m => m[1]).every(k => keys.includes(k)));
  }

  /* ══ ★★ قسمُ التعاقدات في الصلاحيات (طلبُ المالك) ══
     الحجبُ هنا **حارسٌ ثانٍ** لا الوحيد: `contracts.canView` تقرأ المفتاحَ نفسَه
     فتُزيل مجموعةَ القائمة وتردّ الرابطَ العميق وبطاقةَ اللوحة و«بانتظار إجراءك»؛
     وهذه تمنع `showPage` المباشرة. وحجبُ زرٍّ وحدَه بابٌ يبقى مفتوحاً بالعنوان. */
  T("★★ ct: مفتاح «التعاقدات» في مصدر المفاتيح بتسميته",
    /contracts:"التعاقدات"/.test(HTML));
  T("★★ ct: والخريطة تربطه بصفحاته الثلاث (حجبُ showPage المباشر)",
    /contracts:\s*\["vendors","contract-requests","contracts-list"\]/.test(HTML));
  T("★ ct: ومجموعتُه الجانبية ضمن المجموعات المُدارة (تختفي حين تُحجب صفحاتُها)",
    /_PERM_MANAGED_GROUPS = \[[^\]]*"grp-contracts"[^\]]*\]/.test(HTML));
  if (CTR_PATH) {
    const cs = fs.readFileSync(CTR_PATH, "utf8");
    T("★★ ct: و`canView` في الوحدة تشترط الدورَ **والإذنَ** معاً",
      /function canView\(\)\{\s*return VIEW_ROLES\.indexOf\(_role\(\)\)\s*!== -1 && _permAllows\("contracts"\);/.test(cs));
    T("★★ ct: والإذنُ **حاجبٌ لا مانح** (المستخدمُ القائمُ لا يفقد شيئاً) والأدمنُ يتجاوز",
      /function _permAllows\(key\)\{[\s\S]*?if\(u\.role === "admin"\) return true;[\s\S]*?return !p \|\| p\[key\] !== false;/.test(cs));
    T("★ ct: وبوّابةُ القسم واحدةٌ تقرؤها كلُّ منافذه (الصفحاتُ واللوحةُ والقائمةُ والرابطُ العميق)",
      (cs.match(/canView\(\)/g) || []).length >= 10);
  }
  T("★ ce: الحفظ يكتب المانحَ بعلامةٍ صريحة والحاجبَ باصطلاحه",
    (HTML.match(/\(_PERM_GRANT_KEYS\.indexOf\(k\)>=0\) \? \(el\?\.checked===true\) : \(el\?\.checked!==false\)/g) || []).length === 2);

  // ══ ★ v18.9wg: إعادة تسمية مبنى تُهاجر بيانات النظافة تلقائياً ══
  // الاسم مخزّن نصاً في المهام/السجل/الربط/تقييمات الجولات — تغييره في لوحة
  // الإدارة كان يترك المهام على الاسم القديم (بلاغ المستخدم).
  T("★ wg: النواة تُبلغ الوحدة بعد حفظ تعديل اسم المبنى",
    HTML.includes('window.cleaningOps.onBuildingRenamed==="function"') &&
    HTML.includes("window.cleaningOps.onBuildingRenamed(oldName,newName)"));
  T("★ wg: onBuildingRenamed مكشوفة ومسوّرة بمشروع النظافة",
    CO && typeof CO.onBuildingRenamed === "function" &&
    /onBuildingRenamed\(oldName, newName\)\{[\s\S]{0,400}?if\(!isCleaningProject\(\)\) return;/.test(src));
  T("★ wg: المهاجرة تشمل المهام والسجلّ بالاستعلام بالاسم",
    (src.match(/\.where\("building","==",oldName\)\.get\(\)/g) || []).length === 2);
  T("★ wg: المهاجرة تشمل ربط المشرفين (استبدال في المصفوفة ثم حفظ)",
    /arr\.indexOf\(oldName\);\s*\n?\s*if\(i!==-1\)\{ arr\[i\]=newName; supChanged=true; \}/.test(src) &&
    src.includes("if(supChanged) await saveCfg(map)"));
  T("★ wg: المهاجرة تشمل تقييمات الجولات (تعديل الحامل للاسم وحده)",
    src.includes("if(!rs.some(x=>x && x.building===oldName)) continue;") &&
    src.includes("Object.assign({},x,{building:newName})"));
  T("wg: الذاكرة المحلية تُحدَّث (مهامّ وجولات) والفشل يُنبّه",
    src.includes("_tasks.forEach(t=>{ if(t && t.building===oldName) t.building=newName; })") &&
    src.includes("تعذّرت مهاجرة بعض بيانات النظافة"));
  T("wg: المهاجرة مقيّدة في سجلّ التدقيق",
    src.includes('_audit("إعادة تسمية مبنى في بيانات النظافة"'));

  // ══ ★ v18.9wh: التغطية والمهامّ المتأخّرة بعمودين ══
  T("★ wh: قاعدة العمودين معرّفة وقبل ميديا الجوال (وإلا غلبت الجوال)",
    src.indexOf(".co-2col{display:grid;grid-template-columns:1fr 1fr") !== -1 &&
    src.indexOf(".co-2col{display:grid;grid-template-columns:1fr 1fr") <
      src.indexOf("@media(max-width:560px){.co-grid2{grid-template-columns:1fr}.co-2col{grid-template-columns:1fr}}"));
  T("★ wh: التغطية بعمودين في اللوحة التنفيذية والمتابعة اليومية (موضعان)",
    (src.match(/<div class="co-2col">\$\{cov\.map\(b=>\{/g) || []).length === 2);
  T("★ wh: المهامّ المتأخّرة بعمودين",
    /`<div class="co-2col">`\+late\.map\(t=>`/.test(src));
  T("wh: هوامش عناصر التغطية داخل الشبكة مصفّرة (المسافة من gap وحده)",
    src.includes(".co-2col .co-cov{margin-bottom:0}"));

  // ══ ★ v18.9wb: النافذة أصغر وفي المنتصف + ESC للإغلاق (ملاحظة المستخدم) ══
  T("★ wb: النافذة في منتصف الشاشة تماماً (align-items:center)",
    src.includes("z-index:1200;display:flex;align-items:center;justify-content:center"));
  T("★ wb: بطاقات النافذة عمودٌ واحدٌ مرتّب (لا شبكة تتناثر بعرض الشاشة)",
    src.includes(".co-bld-modal .co-tasklist{grid-template-columns:1fr}"));
  T("★ wb: ESC يغلق النافذة — تركيبٌ عند الفتح وفكٌّ عند الإغلاق (لا مستمع دائم)",
    src.includes('if(e && e.key==="Escape") closeBldTasks()') &&
    src.includes('document.addEventListener("keydown", _bldEscHandler)') &&
    src.includes('document.removeEventListener("keydown", _bldEscHandler)'));

  // ══ ★ v18.9wc: النافذة أضيق (440px) والتفاصيل داخلها لا صفحةً كاملة ══
  T("★ wc: بطاقة المهمة تحمل data-tid (تُلتقط داخل النافذة بلا onclick الصفحة)",
    src.includes('data-tid="${_esc(t.id)}"'));
  T("★ wc: ضغط البطاقة داخل النافذة يفتح تفاصيلها داخلياً بمنع onclick الأصلي",
    /card\.getAttribute\("data-tid"\)[\s\S]{0,120}?e\.stopPropagation\(\);[\s\S]{0,120}?_bldOpenDetail\(card\.getAttribute\("data-tid"\)\)/.test(src));
  T("★ wc: جسم التفاصيل مصدرٌ واحد للصفحة والنافذة (_taskDetailBodyHTML)",
    /function _taskDetailBodyHTML\(t, log\)\{/.test(src) &&
    src.includes("subHeroHTML") && (src.match(/_taskDetailBodyHTML\(/g)||[]).length >= 3);
  T("★ wc: تفاصيل النافذة بزرّ «رجوع» يعيد للقائمة",
    src.includes("cleaningOps.bldBack()") &&
    /function bldBack\(\)\{ _bldDetailFor=null; _bldDetailLog=null; _bldModalRender\(\); \}/.test(src));
  T("★ wc: سجلّ التنفيذ يُحمَّل داخل النافذة (ولا يُكتب إن غادر المستخدم)",
    /_bldOpenDetail[\s\S]{0,300}?loadTaskLog\(id\)\.then\(rows=>\{\s*\n?\s*if\(!_bldDetailFor \|\| _bldDetailFor\.id!==id\) return;/.test(src));
  T("wc: زرّا الرجوع والإغلاق مستثنيان من إغلاق-أي-زر",
    src.includes('btn.classList.contains("co-bld-close")||btn.classList.contains("co-bld-back")'));
  T("wc: حالة النافذة تُصفَّر عند الإغلاق (لا تفاصيل يتيمة عند فتحٍ تالٍ)",
    /closeBldTasks[\s\S]{0,200}?_bldModalBld=null; _bldDetailFor=null; _bldDetailLog=null;/.test(src));
  T("vx: زرّ «مهام أخرى» له قاعدة عرضٍ كاملة", src.includes(".co-more-btn{width:100%"));

  // ══ ★ v18.9vy: ترتيب مباني اللوحة — الأكثر تأخّراً أولاً ══
  // الترتيب الأبجدي كان يدفن المبنى المتعثّر وسط القائمة. الآن: متأخّر أكثر ← مستحقّ
  // أكثر ← أبجدي، عبر مصدرٍ واحد (_bldOrder) للوحة اليوم والمتابعة اليومية.
  // v18.9y: صارت ثلاث شاشات — لوحةُ اليوم والمتابعة اليومية و«كل المهام» البطاقية
  T("★ vy: _bldOrder مكشوفة والشاشات تمرّ عبرها (لا .sort() أبجدي متبقٍّ)",
    CO && typeof CO._bldOrder === "function" &&
    (src.match(/\+_bldOrder\(byB\)\.map\(b=>\{/g) || []).length === 3 &&
    !src.includes("Object.keys(byB).sort().map(b=>{"));
  if (CO && typeof CO._bldOrder === "function") {
    const byB = {
      "أ نظيف":   [mk({ nextDueDate: day(1) }), mk({ nextDueDate: day(2) })],            // لا مستحقّ
      "ب مستحق":  [mk({ nextDueDate: today }), mk({ nextDueDate: today })],              // 2 مستحقّ
      "ج متأخر":  [mk({ nextDueDate: day(-1) })],                                        // 1 متأخّر
      "د متأخران": [mk({ nextDueDate: day(-3) }), mk({ nextDueDate: day(-1) })]          // 2 متأخّر
    };
    T("★ vy: المتأخّر أكثر يتصدّر ثم الأقل تأخّراً ثم المستحقّ ثم النظيف",
      JSON.stringify(CO._bldOrder(byB)) === JSON.stringify(["د متأخران", "ج متأخر", "ب مستحق", "أ نظيف"]),
      JSON.stringify(CO._bldOrder(byB)));
    T("★ vy: تعادل التأخّر يحسمه المستحقّ الأكثر",
      JSON.stringify(CO._bldOrder({
        "س": [mk({ nextDueDate: day(-1) })],
        "ش": [mk({ nextDueDate: day(-1) }), mk({ nextDueDate: today })]
      })) === JSON.stringify(["ش", "س"]));
    T("vy: تعادلٌ كامل ⟵ أبجدي (ترتيبٌ مستقرّ لا عشوائي)",
      JSON.stringify(CO._bldOrder({
        "ب": [mk({ nextDueDate: today })],
        "أ": [mk({ nextDueDate: today })]
      })) === JSON.stringify(["أ", "ب"]));
    T("vy: المنفَّذة اليوم لا تُحسب مستحقّةً في الترتيب (isDue نفسها)",
      JSON.stringify(CO._bldOrder({
        "منجز": [mk({ nextDueDate: today, lastExecuted: new Date().toISOString() })],
        "معلّق": [mk({ nextDueDate: today })]
      })) === JSON.stringify(["معلّق", "منجز"]));
  }

  // ══ ★ v18.9vz: إصلاحان من بلاغ المستخدم ══
  // (١) جلب الأرشيف كان يفشل: where(archived)+orderBy(createdAt) يتطلّب فهرساً مركّباً،
  // ومجموعات البلاغات مسمّاة لكل مشروع ({id}_tickets) فيلزم فهرس يدوي لكل مشروع جديد.
  // الحل: بلا orderBy خادمي والفرز محلياً — حارس يمنع عودة الـorderBy.
  T("★ vz: استعلام الأرشيف بلا orderBy خادمي (لا فهرس مركّباً لكل مشروع)",
    /where\("archived","==",true\)/.test(HTML) &&
    !/where\("archived","==",true\)\s*\.orderBy/.test(HTML));
  T("★ vz: فرز الأرشيف محلياً الأحدث أولاً — يقبل ISO وTimestamp معاً",
    /\.sort\(\(a,b\)=>_ts\(b\)-_ts\(a\)\)/.test(HTML) &&
    HTML.includes('typeof c.toDate==="function"'));

  // ══ ★ صنفُ «الأيقونة العملاقة» — معالجةٌ عند المنبع بعد تكرّره ثلاث مرّات ══
  // _svgIcon في النواة يُرجع <svg> بلا width/height، وSVG بلا أبعادٍ داخل حاوية flex
  // يتمدّد ليملأها. رُقِّع موضعياً مرّتين (شريط التنبيه، أرشيف البلاغات) ثم تكرّر ثالثةً
  // في بنود قائمة الفحص — فصار العلاج في _svg نفسها لا في كل حاوية.
  T("★ كلُّ أيقونةٍ تخرج من الوحدة بأبعادٍ صريحة (علاجٌ عند المنبع)",
    /function _svg\(name, size\)\{/.test(src) &&
    /raw\.replace\(\/\^<svg\\b\/, '<svg width="'\+n\+'" height="'\+n\+'"'\)/.test(src));
  T("النواة فعلاً تُرجع SVG بلا أبعاد (وإلا فالعلاج بلا سبب)",
    /return p\?\('<svg viewBox="0 0 24 24"/.test(HTML));
  if (CO && typeof CO._svg === "function") {
    const out = CO._svg("checkCircle");
    T("★ الأبعاد الافتراضية 16px", /width="16" height="16"/.test(out), out.slice(0, 60));
    T("حجمٌ مخصّصٌ عند الحاجة", /width="34" height="34"/.test(CO._svg("checkCircle", 34)));
    T("أيقونةٌ مفقودةٌ تُرجع فراغاً لا وسماً مكسوراً", CO._svg("") === "");
    // ★ الشكل بلا سماتٍ (<svg>) كان يفلت من البديل النصّي — التعبير النمطي يلتقطه
    T("★ حتى <svg> بلا سماتٍ يُوسَم بأبعاده", /width="16" height="16"/.test(CO._svg("__bare__")),
      CO._svg("__bare__"));
  }
  T("بنودُ قائمة الفحص لها قاعدةُ حجمٍ صريحة أيضاً",
    /\.co-ck svg\{width:16px;height:16px;flex:none/.test(src));

  // ── أيقونات SVG داخل حاويات لا تضبط أبعادها (تتمدّد لملء الشاشة) ──
  T("★ أيقونة شريط التنبيه مغلَّفةٌ بمحدِّدٍ يضبط أبعادها",
    /class="co-bnr-ic"/.test(src) && /\.co-bnr-ic svg\{width:16px;height:16px/.test(src));
  // العلّة كانت SVG **ابناً مباشراً** للشريط (بلا غلافٍ يضبط أبعاده) فيتمدّد ليملأ الشاشة
  T("لا SVG عارٍ ابناً مباشراً لـ .ppm-overdue-banner",
    !/ppm-overdue-banner"[^>]*>\s*\$\{_svg\(/.test(src));

  // ── الجودة: لا ألوانٍ مصمتة خارج توكنز المنصة (تكسر الثيم الداكن) ──
  const cssBlock = (src.match(/st\.textContent\s*=\s*`([\s\S]*?)`;/) || [])[1] || "";
  const hardHex = [...cssBlock.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0]);
  T("★ CSS الصفحة بلا ألوانٍ مصمتة (توكنز فقط ⇒ يعمل في الثيم الداكن)",
    hardHex.length === 0, hardHex.join("، ") || "لا ألوان مصمتة");
  T("الأرقام بخطّ المنصة أحاديّ العرض (JetBrains Mono tabular)",
    /JetBrains Mono/.test(cssBlock) && /tabular-nums/.test(cssBlock));
}

/* ════════════════════════════════════════════════════════════════════
   27) إصلاحات المراجعة الشاملة (v18.9vl) — حرّاس مصدرية:
       • #3 (حرج): الاستلام الجزئي لنفس البند عبر جلستين — التدقيق يخزّن الكمية
         والتكلفة التراكميّتين (cumRcv) لا كمية الجلسة وحدها.
       • #2 (H1): تقرير الطلبات يهرّب p.id/itemName/supervisor (XSS مخزّن).
       • #5a: مراجعة المخزون الفاشلة تُطلق الحارس الدائم (بلا خصم مزدوج).
       • #5b: كاشف التقادم يحرس cleaning-operations.js وبصمتها تطابق APP_VERSION.
   ════════════════════════════════════════════════════════════════════ */
function comprehensiveReviewV18_9vl() {
  H("27) إصلاحات المراجعة الشاملة (v18.9vl)");

  // ── #3: التدقيق يعيد بناء البند على cumRcv التراكمي ──
  T("★ #3: rcvQty في بناء بنود التدقيق تراكميّ (cumRcv) لا كمية الجلسة",
    HTML.includes("rcvQty    : _cumQ,") &&
    /_cumQ\s*=\s*Number\(a\.cumRcv\)/.test(HTML));
  T("★ #3: التكلفة (itemCost/lineTotal/vat) تُعاد على cumRcv باصطلاح الوحدة",
    HTML.includes("const _cTot  = Math.round((_cUnit+_cVatU)*_cumQ*100)/100;") &&
    HTML.includes("itemCost  : _cTot,") && HTML.includes("lineTotal : _cNet,") &&
    HTML.includes("vat       : _cVat,"));
  T("★ #3: لم يعُد يُخزَّن rcvQty:a.rcvQty الجلسيّ في بناء البنود (منع التراجع)",
    !HTML.includes("rcvQty    : a.rcvQty,"));
  // سلوكي: بندٌ استُلم 5 ثم 5 (cumRcv=10) بسعر 100 ⇒ التكلفة على 10 لا 5.
  {
    const _u = 100, _cum = 10;
    const _vatU = Math.round(_u * 0.15 * 100) / 100;
    const _net = Math.round(_u * _cum * 100) / 100;
    const _tot = Math.round((_u + _vatU) * _cum * 100) / 100;
    T("★ #3: تكلفة البند المُقسَّم = على التراكمي (10×115 = 1150)",
      _tot === 1150 && _net === 1000, `total=${_tot} net=${_net}`);
  }

  // ── #2 (H1): تهريب حقول تقرير الطلبات ──
  T("★ #2: تقرير الطلبات يهرّب رقم الطلب (esc(p.id))",
    HTML.includes('border-radius:4px">${esc(p.id)}</span></td>'));
  T("★ #2: تقرير الطلبات يهرّب اسم المادة (esc(p.itemName))",
    HTML.includes(':`${esc(p.itemName)}`}</td>'));
  T("★ #2: تقرير الطلبات يهرّب طالب المواد (esc(p.supervisor))",
    HTML.includes('${esc(p.supervisor||"—")}</td>'));

  // ── #5a: تراجُع الحارس الدائم عند فشل مراجعة المخزون ──
  T("★ #5a: catch مراجعة المخزون يُطلق الحارس فقط إن لم يُطبَّق الخصم",
    HTML.includes("if(!_stockApplied) _reviewedPOIds.delete(poId);"));
  T("★ #5a: علم _stockApplied يُرفع بعد نجاح الخصم فعلاً",
    HTML.includes("_stockApplied = true;"));
  T("★ #5a: مسارات الخروج قبل الكتابة تُطلق الحارس (لا حبس بلا مراجعة)",
    (HTML.match(/_reviewedPOIds\.delete\(poId\)/g) || []).length >= 4);

  // ── #5b: كاشف التقادم يحرس cleaning-operations.js وبصمتها في اللقب ──
  T("★ #5b: REG يسجّل cleaning-operations عبر window.cleaningOps",
    /name:"cleaning-operations\.js",\s*get:function\(\)\{ return window\.cleaningOps; \}/.test(HTML));
  const _coSrc = fs.existsSync(path.resolve(path.dirname(IDX), "cleaning-operations.js"))
    ? fs.readFileSync(path.resolve(path.dirname(IDX), "cleaning-operations.js"), "utf8") : "";
  const _coBuild = (_coSrc.match(/const MODULE_BUILD = "(v[\d.a-z]+)"/) || [])[1];
  T("★ #5b: بصمة cleaning-operations.js تطابق APP_VERSION (تمنع الانحراف الصامت)",
    _coBuild === VER, `MODULE_BUILD=${_coBuild}  APP_VERSION=${VER}`);
  // ── v18.9vm: إلغاء تسجيل Service Worker لا يُسرّب رفضاً للمعالج العام ──
  // الأثر: شريطٌ أحمر «حدث خطأ غير متوقع» كان يظهر للمستخدم لأمرٍ لا ضرر فيه،
  // ويُلوّث سجلَّ الأخطاء بضجيجٍ يُخفي الأعطال الحقيقية.
  T("★ vm: إلغاء تسجيل Service Worker يبتلع الرفض (.catch)",
    /navigator\.serviceWorker\.getRegistrations\(\)[\s\S]{0,160}?\.catch\(\(\)=>\{\}\)/.test(HTML));
  T("★ vm: لم يعُد ثمّة استدعاءُ getRegistrations بلا معالجة",
    !/navigator\.serviceWorker\.getRegistrations\(\)\.then\(regs => regs\.forEach\(r => r\.unregister\(\)\)\);/.test(HTML));

  T("★ #5c: مُرشّح مسارات CI يشمل الوحدتين الكبيرتين",
    (() => {
      const wf = fs.existsSync(path.resolve(path.dirname(IDX), ".github/workflows/hail-tests.yml"))
        ? fs.readFileSync(path.resolve(path.dirname(IDX), ".github/workflows/hail-tests.yml"), "utf8") : "";
      return wf.includes("'cleaning-operations.js'") && wf.includes("'project-management.js'");
    })());
}

/* ════════════════════════════════════════════════════════════════════
   v18.9ae — المشروع القائم على الأداء (المرحلة ١)
   الحرّاس هنا يحمون **عهداً واحداً**: المشاريع التقليدية لا تتأثر إطلاقاً،
   والعقد يُقرأ من مصدرٍ واحدٍ لا من تعريفاتٍ محلّيةٍ متفرّقة.
   ════════════════════════════════════════════════════════════════════ */
function perfContractPhase1() {
  H("v18.9ae) العقد القائم على الأداء — المرحلة ١");
  const PF_PATH = path.resolve(path.dirname(IDX), "performance-contract.js");
  const PF = fs.existsSync(PF_PATH) ? fs.readFileSync(PF_PATH, "utf8") : "";
  T("★ ae: وحدة performance-contract.js موجودة", PF.length > 0);

  // ── العَلَم: صامتٌ افتراضياً — أهمّ حارسٍ في هذه المرحلة ──
  // perfConfig تعود null لأي مشروعٍ بلا perfContract===true، فلا يرث مشروعٌ
  // تقليديٌّ شاشةً ولا حقلاً. والمقارنة الصارمة تمنع نصّ "false" من إشعال عقد.
  T("★ ae: perfConfig تُبوّب بالعَلَم وحده وتعود null لغير عقود الأداء",
    /function perfConfig\(p\)\{[\s\S]{0,300}?proj\.perfContract !== true\) return null;/.test(HTML));
  T("★ ae: العَلَم يُقارَن صراحةً بـ true (نصُّ \"false\" لا يُشعل عقداً)",
    /perfContract !== true/.test(HTML) && !/proj\.perfContract\s*\)\s*return/.test(HTML));
  T("★ ae: isPerfProject تُشتقّ من perfConfig لا من فحصٍ مستقل",
    /function isPerfProject\(p\)\{ return perfConfig\(p\) !== null; \}/.test(HTML));

  // ── لا تعريفَ محلّياً للعقد في الوحدة (نفس درس poIsClosed) ──
  T("★ ae: الوحدة تقرأ البوّابة من النواة ولا تعرّفها محلّياً",
    /typeof isPerfProject==="function" && isPerfProject\(\)/.test(PF) &&
    !/perfContract\s*===\s*true/.test(PF), "الوحدة تفحص العَلَم بنفسها ⇒ تعريفان يتباعدان");

  // ── الحد الأدنى يرتفع بسنة العقد، ولا يتجاوز ١٠٠٪ ──
  T("★ ae: الحد الأدنى = أساسُ السنة الأولى + خطوةٌ لكل سنة، بسقف ١",
    /Math\.min\(1, cfg\.minScoreY1 \+ \(perfContractYear\(now,p\) - 1\) \* PERF_MIN_SCORE_STEP\)/.test(HTML));
  T("★ ae: ثوابت الحد الأدنى والمهلة معرَّفةٌ في موضعٍ واحد",
    /const PERF_MIN_SCORE_DEFAULT = 0\.70;/.test(HTML) &&
    /const PERF_MIN_SCORE_STEP    = 0\.05;/.test(HTML) &&
    /const PERF_GRACE_MONTHS      = 2;/.test(HTML));
  T("★ ae: مهلة الشهرين تُقرأ من الثابت لا برقمٍ مسحور",
    /perfContractMonth\(now, p\) <= PERF_GRACE_MONTHS/.test(HTML));

  // ── سنة/شهر العقد يحترمان يومَ الذكرى (لا قسمةً فجّة على التقويم) ──
  T("★ ae: سنة العقد تُنقِص سنةً قبل يوم الذكرى",
    /beforeAnniv = \(d\.getMonth\(\) < s\.getMonth\(\)\)/.test(HTML) && /if\(beforeAnniv\) y -= 1;/.test(HTML));
  T("★ ae: شهر العقد يُنقِص شهراً قبل يوم الاستحقاق",
    /if\(d\.getDate\(\) < s\.getDate\(\)\) m -= 1;/.test(HTML));

  // ── الحقول تُقرأ وتُكتب بمولِّدٍ/قارئٍ واحدٍ للنافذتين (لا نسختان تتباعدان) ──
  T("★ ae: كتلة الحقول مولَّدةٌ مرةً واحدةً وتُستدعى للنافذتين",
    /function perfFieldsHTML\(prefix, proj\)/.test(HTML) &&
    /\$\{perfFieldsHTML\("np", null\)\}/.test(HTML) && /\$\{perfFieldsHTML\("ep", proj\)\}/.test(HTML));
  T("★ ae: الحفظ في النافذتين يمرّ بـ _readPerfFields",
    (HTML.match(/\.\.\._readPerfFields\("(np|ep)"\)/g) || []).length === 2);
  T("★ ae: النسبة تُخزَّن كسراً (0–1) لا مئويةً — مصدرٌ واحدٌ لوحدة القياس",
    /minPct>0 && minPct<=100\) \? minPct\/100 : PERF_MIN_SCORE_DEFAULT/.test(HTML));

  // ── الوحدة: بوّابةُ الصفحة والزرّ ──
  T("★ ae: زرّ القائمة يُزال لغير عقود الأداء لا يُخفى فقط",
    /const shouldShow = canView\(\) && _isPerf\(\) && !blocked;/.test(PF) &&
    /if\(!shouldShow\)\{ if\(existing\) existing\.remove\(\); return; \}/.test(PF));
  T("★ ae: فتحُ الصفحة مباشرةً في مشروعٍ تقليديٍّ يُحوَّل للوحة",
    /if\(id===PAGE_ID && !\(canView\(\) && _isPerf\(\)\)\)\{[\s\S]{0,220}?orig\.apply\(this, \["dashboard"\]\)/.test(PF));
  T("★ ae: تبديلُ المشروع يعيد تقييم البوّابة ويغادر الصفحة إن لم تعُد تنتمي",
    /curPerf!==lastPerf/.test(PF) && /else \{ try\{ showPage\("dashboard"\); \}catch\(e\)\{\} \}/.test(PF));

  // ── ★ العطل الذي كشفه فحصُ المتصفّح: الإدراج نسبةً إلى nav لا إلى والد المرساة ──
  // أزرارُ القائمة أكثرُها داخل مجموعاتٍ (#grp-*)، فـ nav.insertBefore بعقدةٍ ليست ابناً
  // مباشراً يرمي NotFoundError ويُسقط الحقنَ كلَّه صامتاً — الزرّ لا يظهر إطلاقاً.
  // الفحص السالب يجري على الكود **مجرَّداً من التعليقات**: التعليق الذي يشرح النمط
  // الخاطئ يذكره حرفياً، فيصطاده الحارسُ ظلماً لو فحص المصدر كما هو.
  const PF_CODE = PF.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  T("★ ae: زرّ القائمة يُدرَج نسبةً إلى والد المرساة لا إلى جذر القائمة",
    /anchor\.parentNode\.insertBefore\(btn, anchor\.nextSibling\)/.test(PF_CODE) &&
    !/nav\.insertBefore\(btn, anchor\.nextSibling\)/.test(PF_CODE),
    "nav.insertBefore بعقدةٍ ليست ابناً مباشراً ⇒ NotFoundError وحقنٌ ساقطٌ صامت");
  T("★ ae: الإدراج محاطٌ بحارسٍ يسقط إلى appendChild",
    /try\{[\s\S]{0,200}?insertBefore\(btn[\s\S]{0,200}?\}catch\(e\)\{[\s\S]{0,80}?nav\.appendChild\(btn\)/.test(PF));
  T("★ ae: الزرّ يرث صنف sidebar-child حين تكون المرساة ابنَ مجموعة",
    /anchor\.classList\.contains\("sidebar-child"\) \? " sidebar-child" : ""/.test(PF));

  // ── لا رقمَ كاذباً: المرحلة ١ لا تعرض درجةً محسوبة ──
  // عرضُ درجةٍ قبل اكتمال حقولها يُنتج رقماً يُحتجّ به في اجتماعٍ ماليٍّ وهو خطأ.
  T("★ ae: لا تُحسب درجةٌ ولا غرامةٌ فعلية في المرحلة ١",
    !/monthlyScore|totalScore|computeScore|deviation\s*=/.test(PF),
    "ظهر حسابُ درجةٍ في المرحلة ١ — الحقول لم تُبنَ بعد");

  // ── النتيجة السنوية تُحسب من الأوزان لا تُكتب (فلا تنحرف عنها) ──
  T("★ ae: النتيجة السنوية مشتقّةٌ من الأوزان × المستهدفات",
    /function yearTarget\(yIdx\)\{[\s\S]{0,220}?GROUPS\.reduce\(/.test(PF));
  T("★ ae: أوزان المجموعات الخمس تجمع ١٠٠٪ بالضبط", (() => {
    const ws = [...PF.matchAll(/weight:(0\.\d+)/g)].map(m => parseFloat(m[1]));
    const sum = ws.reduce((a, b) => a + b, 0);
    return ws.length === 5 && Math.abs(sum - 1) < 1e-9;
  })(), "الأوزان يجب أن تكون خمساً مجموعُها ١");
  T("★ ae: النتيجة السنوية للسنة الأولى = ٧٨٫٥٪ (أرقام الاستشاري)", (() => {
    const groups = [...PF.matchAll(/weight:(0\.\d+),\s*\n\s*targets:\[([^\]]+)\]/g)]
      .map(m => ({ w: parseFloat(m[1]), t: m[2].split(",").map(Number) }));
    if (groups.length !== 5) return false;
    const y1 = groups.reduce((s, g) => s + g.w * g.t[0], 0);
    return Math.abs(y1 - 0.785) < 1e-9;
  })());

  // ── بصمة البناء وتسجيل الوحدة في كاشف التقادم ──
  const pfBuild = (PF.match(/const MODULE_BUILD = "(v[\d.a-z]+)"/) || [])[1];
  T("★ ae: بصمة performance-contract.js تطابق APP_VERSION",
    pfBuild === VER, `MODULE_BUILD=${pfBuild}  APP_VERSION=${VER}`);
  T("★ ae: كاشف التقادم يسجّل الوحدة",
    /name:"performance-contract\.js", get:function\(\)\{ return window\.performanceContract; \}/.test(HTML));
  T("★ ae: الوحدة مُحمَّلةٌ بوسم <script> موسومٍ بالإصدار",
    /<script src="performance-contract\.js\?v=[^"]+"><\/script>/.test(HTML));
}

/* ════════════════════════════════════════════════════════════════════
   v18.9af — المرحلة ٢: الحقول التي تُغذّي المؤشرات + الوضع التجريبي
   العهدُ المحروس: طوابعٌ حقيقيةٌ لا مشتقّةٌ ولا مُصطنَعة · جدولُ الوقائي لا ينزاح
   ولا يتقدّم مرتين · التجربةُ لا تُخلَط بالالتزام · التقليديُّ لا يتأثر.
   ════════════════════════════════════════════════════════════════════ */
function perfContractPhase2() {
  H("v18.9af) العقد القائم على الأداء — المرحلة ٢");
  const TECH_PATH = path.resolve(path.dirname(IDX), "tech-app.html");
  const TECH = fs.existsSync(TECH_PATH) ? fs.readFileSync(TECH_PATH, "utf8") : "";
  const PF_PATH = path.resolve(path.dirname(IDX), "performance-contract.js");
  const PF = fs.existsSync(PF_PATH) ? fs.readFileSync(PF_PATH, "utf8") : "";

  // ── جدولةُ الوقائي: مصدرٌ واحدٌ يحفظ المرساة ──
  T("★ af: ppmNextDue مصدرٌ واحدٌ للتقديم", /function ppmNextDue\(plan, fromISO\)\{/.test(HTML));
  T("★ af: التقديم من **المرساة** (nextDueDate) لا من اليوم",
    /let base = new Date\(plan && plan\.nextDueDate \? plan\.nextDueDate : \(fromISO/.test(HTML));
  T("★ af: لحاقُ الدورات الفائتة بحارسٍ صلبٍ يمنع اللانهاية",
    /while\(next <= today && guard\+\+ < 400\)/.test(HTML));
  T("★ af: بلا مُعدِّلات Date في الجدولة (درس v18.9vt)", (() => {
    const m = HTML.match(/function ppmNextDue\(plan, fromISO\)\{[\s\S]*?\n\}/);
    return !!m && !/\.setDate\(|\.setHours\(/.test(m[0]);
  })(), "setDate/setHours داخل ppmNextDue ⇒ خطرُ حلقةٍ لا نهائية");
  T("★ af: لم يعُد ثمّة تقديمٌ يدويٌّ بـ setDate على خطة الوقائي",
    !/nextDate\.setDate\(nextDate\.getDate\(\)\+freqDays\)/.test(HTML),
    "بقي موضعٌ يُقدّم الخطة بطريقته ⇒ انزياحُ الجدول المعتمد");
  T("★ af: الإغلاق يسجّل الإنجاز ولا يلمس الجدول",
    /ppmPlans\[planIdx\]\.lastCompletedAt=now;/.test(HTML) &&
    !/lastCompletedAt=now;[\s\S]{0,120}?nextDueDate=/.test(HTML));

  // ── scheduledFor: يُلتقط قبل التقديم ──
  T("★ af: البلاغ الوقائي يحمل استحقاقه المخطَّط (المساران معاً)",
    (HTML.match(/scheduledFor: (plan|p)\.nextDueDate \|\| now/g) || []).length === 2);
  T("★ af: scheduledFor يسبق تقديمَ الخطة في المسارين", (() => {
    const iA = HTML.indexOf("scheduledFor: plan.nextDueDate");
    const jA = HTML.indexOf("ppmPlans[planIdx].nextDueDate=nextISO;");
    const iB = HTML.indexOf("scheduledFor: p.nextDueDate");
    const jB = HTML.indexOf("p.nextDueDate  = ppmNextDue(p, now);");
    return iA > 0 && jA > iA && iB > 0 && jB > iB;
  })(), "لو قُدّمت الخطة أولاً لحُفظ استحقاقُ الدورة **التالية** بدل الحالية");

  // ── الطوابع: حقيقيةٌ لا مشتقّةٌ ولا مُصطنَعة ──
  T("★ af: زمنُ الاستجابة يُكتب في تطبيق الفنيين عند بدء التنفيذ",
    /if\(!t\.respondedAt\) upd\.respondedAt=now;/.test(TECH));
  T("★ af: يُكتب مرةً واحدة (إعادةُ الفتح لا تُجمّل الرقم)",
    /if\(!t\.respondedAt\)/.test(TECH) && /if\(t\[field\]\)\{[\s\S]{0,120}?return; \}/.test(HTML));
  T("★ af: «رجعت الخدمة» فعلٌ مستقلٌّ في تطبيق الفنيين",
    /function markRestored\(id\)\{/.test(TECH) && /restoredAt:now/.test(TECH));
  T("★ af: الاستجابة لا تُشتقّ من assignedAt (الإسنادُ مكتبيٌّ لا ميدانيّ)",
    !/respondedAt\s*=\s*[^;]*assignedAt/.test(HTML) && !/respondedAt\s*=\s*[^;]*assignedAt/.test(TECH));
  T("★ af: إيقافُ الساعة يوثّق سبباً، والاستئنافُ يُغلق الفترة",
    /function perfClockToggle\(id\)\{/.test(HTML) && /open\.to=now;/.test(HTML) &&
    /clockStops=\[\.\.\.stops,\{from:at,to:null,reason/.test(HTML));
  T("★ af: قارئٌ واحدٌ لحالة الساعة", /function perfClockPaused\(t\)\{/.test(HTML));

  // ── البوّابة: التقليديُّ لا يتأثر ──
  T("★ af: أزرارُ الطوابع مبوَّبةٌ بـ isPerfProject",
    /t\.status!=="مغلق"&&isPerfProject\(\)\)\?`/.test(HTML),
    "الأزرار تظهر في مشروعٍ تقليديّ ⇒ نقضُ عهد المرحلة ١");

  // ── الوضع التجريبي: لا يُخلَط بالالتزام ──
  T("★ af: علَمُ التجربة يُقرأ من perfConfig بمقارنةٍ صارمة",
    /trial:\s*proj\.perfTrial === true/.test(HTML));
  T("★ af: قارئٌ عامٌّ واحدٌ للتجربة", /function isPerfTrial\(p\)\{ const c=perfConfig\(p\); return !!\(c && c\.trial\); \}/.test(HTML));
  T("★ af: الوحدة تُظهر شريطاً صريحاً وتَسِمُ المبالغ «تدريبيّ»",
    /pf-note-trial/.test(PF) && /_isTrial\(\)\?' <span class="pf-tag">تدريبيّ/.test(PF) &&
    /تدريبيّ — لا يُحتسب/.test(PF));

  // ── بطاقةُ التغطية: مقياسُ التقاطٍ لا مقياسُ أداء ──
  T("★ af: التغطية تُحسب من البلاغات وتستبعد عمليات التوريد/السحب",
    /function coverage\(\)\{/.test(PF) && /!_isOp\(t\)/.test(PF));
  T("★ af: التغطية شهريةٌ (نافذةُ الشهر الحالي) لا تراكمية",
    /const mStart=new Date\(n\.getFullYear\(\), n\.getMonth\(\), 1\);/.test(PF));
  T("★ af: مقامٌ صفرٌ يُعرَض «—» لا صفراً كاذباً",
    /const pct=\(a,b\)=> b\? Math\.round\(a\/b\*100\) : null;/.test(PF));

  // ── ما زال: لا درجةَ محسوبة قبل اكتمال الحقول ──
  T("★ af: لا درجةَ بطاقةٍ محسوبةٌ بعد (المرحلة ٤)",
    !/monthlyScore|totalScore|computeScore|deviation\s*=/.test(PF));
}

function deepReviewV18_9vu() {
  H("28) الفحص العميق — دفعة إصلاحات (v18.9vu)");

  // ── H4: تهريب اسم الفني/نوع العمل في تقرير الصيانة ──
  T("★ H4: تقرير الصيانة يهرّب اسم الفني (esc(name))",
    HTML.includes('<td style="font-weight:700">${esc(name)}</td>') &&
    !HTML.includes('<td style="font-weight:700">${name}</td>'));
  T("★ H4: تقرير الصيانة يهرّب نوع العمل (esc(wt)/esc(wt2))",
    HTML.includes("${typeIcon(wt)} ${esc(wt)}") && HTML.includes("${typeIcon(wt2)} ${esc(wt2)}") &&
    !/\$\{typeIcon\(wt\)\} \$\{wt\}</.test(HTML));

  // ── H5: تهريب سلسلة JS في زرّي حذف الكتالوجَين (JQ لا esc) ──
  const _paSrc = PA_PATH ? fs.readFileSync(PA_PATH, "utf8") : "";
  const _lcSrc = LC_PATH ? fs.readFileSync(LC_PATH, "utf8") : "";
  T("★ H5: price-analysis يعرّف JQ ويستعمله في زر الحذف",
    /function JQ\(s\)\{/.test(_paSrc) && _paSrc.includes("window.priceAnalysis.del('${JQ(it.id)}','${JQ(it.name||\"\")}')"));
  T("★ H5: labor-catalog يعرّف JQ ويستعمله في زر الحذف",
    /function JQ\(s\)\{/.test(_lcSrc) && _lcSrc.includes("window.laborCatalog.del('${JQ(it.id)}','${JQ(it.name||\"\")}')"));
  T("★ H5: لم يعُد يُستعمل النمط esc(...).replace في زرّ الحذف (تراجع)",
    !_paSrc.includes('.replace(/\'/g,"\\\\\'")') && !_lcSrc.includes('.replace(/\'/g,"\\\\\'")'));

  // ── H6: جسور الترقيم العامة للكتالوجَين ──
  T("★ H6: price-analysis يعرّف window.renderPriceAnalysisTable",
    _paSrc.includes("window.renderPriceAnalysisTable = function()"));
  T("★ H6: labor-catalog يعرّف window.renderLaborCatalogTable",
    _lcSrc.includes("window.renderLaborCatalogTable = function()"));

  // ── M2: عمود «التكلفة الفعلية» للمغلق فقط في التقرير/Excel/PDF ──
  T("★ M2: صف تقرير الشاشة يشترط poIsClosed للتكلفة الفعلية",
    HTML.includes("${poIsClosed(p)&&poActualCost(p)?poActualCost(p).toLocaleString"));
  T("★ M2: تصدير Excel يشترط poIsClosed للتكلفة الفعلية",
    HTML.includes('"التكلفة الفعلية":idx===0&&poIsClosed(p)?poActualCost(p)||0:""') &&
    HTML.includes('"التكلفة الفعلية":poIsClosed(p)?poActualCost(p)||0:""'));
  T("★ M2: تقرير PDF يشترط poIsClosed للتكلفة الفعلية",
    HTML.includes("const cost=poIsClosed(p)?poActualCost(p):0;"));

  // ── C3: حذف الطلب وعكس المخزون في معاملة ذرّية واحدة ──
  T("★ C3: deletePurchase يحذف وثيقة الطلب داخل معاملة العكس",
    HTML.includes("tx.delete(db.collection(PURCHASES_COLLECTION()).doc(poId));") &&
    HTML.includes("_deletedInTx = true;"));
  T("★ C3: الحذف الخارجي مشروط بعدم الحذف داخل المعاملة",
    HTML.includes("if(db && !_deletedInTx) await db.collection(PURCHASES_COLLECTION()).doc(poId).delete();"));

  // ── C4: مراجعة المخزون تنتظر تأكيد حفظ الطلب ──
  T("★ C4: savePurchaseAwait موجودة وتُستعمل في doInventoryReview",
    /async function savePurchaseAwait\(/.test(HTML) &&
    HTML.includes("const _saved = await savePurchaseAwait(poId);"));

  // ── C4 (امتداد): ربطُ البند الذي دخل بلا رصيد أثرُه لا يُسترجَع كذلك ──
  // المعاملةُ تُضيف الكميةَ للمخزون وتكتب قيدَ الحركة، ثمّ يُحفَظ الطلبُ بالمرساة.
  // fire-and-forget هنا يعني: رصيدٌ أُضيف وبندٌ ما زال «بلا رصيد» في قاعدة البيانات
  // ⇐ ربطٌ ثانٍ يضيف الكميةَ مرّتين. الحارسُ يمنع الارتداد إلى savePurchase المجرّدة.
  {
    const fi = HTML.indexOf("async function _applyUnanchoredFix(");
    const body = fi > 0 ? HTML.slice(fi, HTML.indexOf("\nfunction ", fi + 10)) : "";
    T("_applyUnanchoredFix موجودة", body.length > 0);
    if (body) {
      T("★ C4b: ربطُ البند بلا رصيد ينتظر تأكيد الحفظ (savePurchaseAwait لا savePurchase)",
        body.includes("await savePurchaseAwait(poId)") &&
        !/(^|[^.\w])savePurchase\(poId\);/.test(body));
      T("★ C4b: وعند فشل الحفظ يُحذَّر أن الرصيد أُضيف فلا يُعاد الربط",
        /_anchored/.test(body) && /أُضيف الرصيد للمخزون لكن تعذّر حفظ ربط البند/.test(body));
    }
  }

  // ── M4/M5: حركات المخزون الذرّية ──
  T("★ M4/M5: _atomicStockMove معرّفة (سجل + رصيد في معاملة)",
    /async function _atomicStockMove\(invId, delta, logData\)\{/.test(HTML));
  T("★ M4: أمر الصرف يستعمل _atomicStockMove لكل بند",
    HTML.includes("await _atomicStockMove(it.itemId, -Number(it.qty)||0, {"));
  T("★ M4: صرف العهدة يخصم المخزون داخل معاملة (custody+inv)",
    HTML.includes("tx.set(_custRef, rec);") && HTML.includes("tx.set(_invRef, { currentQty:newQty, lastUpdated:now }"));
  T("★ M5: إرجاع العهدة يقرأ returnedQty الطازجة داخل المعاملة",
    HTML.includes("const prevRet= parseFloat(cData.returnedQty)||0;"));
  T("★ M5: حذف العهدة يسترجع الرصيد ويحذف في معاملة واحدة",
    HTML.includes("tx.delete(_custRef);"));
  T("★ H8: النقل بين المستودعين في معاملة ذرّية (قراءة المصدر قبل الكتابة)",
    HTML.includes("if(tq > srcPrev + 1e-9) throw new Error"));

  // ── H10: rejected_final ضمن الحالات الميتة في رصيد الاستعاضة ──
  const _sbSrc = SB_PATH ? fs.readFileSync(SB_PATH, "utf8") : "";
  T("★ H10: _DEAD_STATUSES تشمل rejected_final",
    /_DEAD_STATUSES = \[[^\]]*"rejected_final"[^\]]*\]/.test(_sbSrc));

  // ── C5 + M15: واتساب — حجز ذرّي قبل الإرسال + تطبيع الأرقام ──
  const _fnDir = path.resolve(path.dirname(IDX), "functions");
  const _fnIdx = fs.existsSync(path.join(_fnDir, "index.js")) ? fs.readFileSync(path.join(_fnDir, "index.js"), "utf8") : "";
  const _waLib = fs.existsSync(path.join(_fnDir, "lib", "whatsapp.js")) ? fs.readFileSync(path.join(_fnDir, "lib", "whatsapp.js"), "utf8") : "";
  T("★ C5: deliver يحجز الرسالة ذرّياً (runTransaction → status:sending) قبل الإرسال",
    /async function deliver\(ref\)/.test(_fnIdx) && _fnIdx.includes('tx.update(ref, { status: "sending"'));
  T("★ C5: waRetry يستعيد الرسائل العالقة في sending",
    _fnIdx.includes('.where("status", "==", "sending")'));
  T("★ M15: normalizeMsisdn يحوّل 05→966 ويُستعمل في sendTemplate",
    /function normalizeMsisdn\(/.test(_waLib) && _waLib.includes('return "966" + d.slice(1)') &&
    _waLib.includes("to: normalizeMsisdn(to)"));
  // سلوكي: تطبيع رقمٍ محلّي
  if (_waLib) {
    try {
      const { normalizeMsisdn } = require(path.join(_fnDir, "lib", "whatsapp.js"));
      T("★ M15 سلوكي: 0501234567 ⇒ 966501234567",
        normalizeMsisdn("0501234567") === "966501234567" &&
        normalizeMsisdn("966501234567") === "966501234567" &&
        normalizeMsisdn("+966 50 123 4567") === "966501234567");
    } catch (e) {
      T("★ M15 سلوكي: تحميل normalizeMsisdn", false, String(e.message).slice(0, 80));
    }
  }
}

/* ════════════════════════════════════════════════════════════════════
   وحدة سداد أعمال الموارد البشرية (hr-payments.js) — v18.9wz
   تركيبٌ صحيح في index.html + تسلسل الاعتماد (دالة التوجيه النقية تُنفَّذ فعلاً)
   + عزلها التام عن مسار المشتريات + الصلاحيات.
   ════════════════════════════════════════════════════════════════════ */
// ══ ★ v18.9z: «مَن» في نافذة البلاغ — ثلاثةُ معانٍ لا اسمان متناقضان ══
// شبكةُ التفاصيل تقرأ `createdByName` (الحسابُ المُدخِل) بينما `timeline[0].by` يحمل
// **المشرف** منذ الإنشاء — فظهر اسمان مختلفان لحدثٍ واحد بلا تفسير. العلاجُ عرضيٌّ
// بحت (لا يُغيَّر المخزَّن) عبر `timelineWho`، وهذا الحارس يمنع الارتداد إليه.
/* ════════════════════════════════════════════════════════════════════
   استلامٌ جزئي ⇒ الطلب يعود «قيد تنفيذ المشتريات» (v18.9aa)
   ───────────────────────────────────────────────────────────────────
   القاعدة: ما دام في الطلب بندٌ واحدٌ لم تكتمل كميّته عبر **كل** سندات
   الاستلام، فالطلب لا يُقفل ولا يبقى معلّقاً عند المستودع — يعود إلى
   مسؤول المشتريات لاستكمال التوريد. القاعدة مطبَّقة في موضعين، وكلاهما
   يجب أن يبقى: doWarehouseAudit (بعد كل تدقيق) و_poSettleExtras (بعد
   البتّ في آخر بندٍ إضافي). وكانت بلا أي حارس تنفيذي.
   ════════════════════════════════════════════════════════════════════ */
function partialReceiptBackToProc() {
  H("استلامٌ جزئي ⇒ العودة لتنفيذ المشتريات");

  const srcKey    = slice("function _poItemKey(it){", "\nfunction _poAlignRows");
  const srcPrev   = slice("function _waPrevRcv(p, idx, it){", "\n// جمع حقل على مستوى السند");
  const srcOut    = slice("function _poOutstanding(p){", "\n// ══════════ v18.9ns");
  const srcExtras = slice("function poExtras(p){", "function canDecideExtra");
  const srcSettle = slice("function _poSettleExtras(p, now){", "\nasync function poExtraDecide");
  T("دوال القاعدة مستخرَجة من index.html",
    !!srcKey && !!srcPrev && !!srcOut && !!srcExtras && !!srcSettle);
  if (!(srcKey && srcPrev && srcOut && srcExtras && srcSettle)) return;

  let A = null;
  try {
    A = new Function("normalizePOStatus", "currentUser",
      [srcKey, srcPrev, srcOut, srcExtras, srcSettle].join("\n") +
      "\nreturn {_poOutstanding, _waPrevRcv, _poSettleExtras, poPendingExtras};"
    )(s => s, { name: "محمد" });
  } catch (e) { T("الدوال قابلة للتنفيذ", false, String(e.message).slice(0, 140)); return; }

  // ── نموذج PO-202608-0123: ثلاثة بنودٍ مطلوبة لم يصل منها شيء، وبندان
  //    إضافيان وصلا كاملَين. المستلم 25 قطعة — والطلب مع ذلك ناقص. ──
  const mk = () => ({
    id: "PO-TEST-0123",
    items: [
      { itemId: "i1", itemCode: "BLDG-129", itemName: "تيوب فارغ مربع 50*50", qty: 5 },
      { itemId: "i2", itemCode: "BLDG-085", itemName: "تيوب فارغ مربع 19*19", qty: 2 },
      { itemId: "i3", itemName: "صاج اسود 1.22*244*1.25", qty: 1 },
      { itemId: "i4", itemCode: "BLDG-117", itemName: "تيوب فارغ مستطيل 40*80", qty: 24, _extra: true, _extraStatus: "pending_pm" },
      { itemId: "i5", itemCode: "SERV-003", itemName: "نقل مواد", qty: 1, _extra: true, _extraStatus: "pending_pm" },
    ],
    grnDocs: [{
      grnRef: "GRN-2026-0062", vendor: "مصادر الوطنية",
      items: [{ itemId: "i1", rcvQty: 0 }, { itemId: "i2", rcvQty: 0 }, { itemId: "i3", rcvQty: 0 },
              { itemId: "i4", rcvQty: 24 }, { itemId: "i5", rcvQty: 1 }],
    }],
    timeline: [], status: "wh_auditing",
  });

  const out = A._poOutstanding(mk());
  T("★ البنود الثلاثة غير المورَّدة تُرصَد رغم استلام 25 قطعة إضافية",
    out.length === 3 && out.map(o => o.idx).join(",") === "0,1,2",
    "outstanding=" + JSON.stringify(out.map(o => ({ i: o.idx, req: o.req, cum: o.cum }))));

  // تراكم عبر سندين: 4 ثم 3 من أصل 10 ⇒ يبقى ناقصاً؛ ثم 3 ⇒ يكتمل
  const multi = {
    items: [{ itemId: "x", itemName: "بند", qty: 10 }],
    grnDocs: [{ items: [{ itemId: "x", rcvQty: 4 }] }, { items: [{ itemId: "x", rcvQty: 3 }] }],
  };
  T("★ المستلم تراكمي عبر كل السندات لا الدفعة الأخيرة",
    A._poOutstanding(multi).length === 1 && A._poOutstanding(multi)[0].cum === 7,
    "cum=" + (A._poOutstanding(multi)[0] || {}).cum);
  multi.grnDocs.push({ items: [{ itemId: "x", rcvQty: 3 }] });
  T("اكتمال الكمية يُخرِج البند من النقص", A._poOutstanding(multi).length === 0);

  T("البند المغطّى كاملاً من المخزون ليس نقصَ توريد",
    A._poOutstanding({ items: [{ itemId: "s", qty: 4, _fullyCoveredByStock: true }], grnDocs: [] }).length === 0);

  // ── الموضع (١): قرار doWarehouseAudit — مصدرياً، فالدالة كلّها DOM ──
  const dec = slice("const _outstanding = _poOutstanding(pCurrent);", "// v18.9rv: حفظ الطلب");
  T("★ تدقيق الاستلام: فرعُ «بنود لم تكتمل» يضع proc_executing",
    !!dec && /if\(_outstanding\.length > 0\)\{\s*pCurrent\.status = "proc_executing";/.test(dec));
  T("★ فرعُ النقص يسبق الإقفال — لا يُقفل طلبٌ ناقص",
    !!dec && dec.indexOf('pCurrent.status = "proc_executing"') >= 0 &&
    dec.indexOf('pCurrent.status = "proc_executing"') < dec.indexOf('pCurrent.status = "closed"'));
  T("★ القيد يحمل code:\"proc_executing\" فيصحّ اشتقاق المراحل والزمن",
    !!dec && /code:"proc_executing"/.test(dec) &&
    dec.includes("بنود لم تكتمل بعد"));
  T("النقص يُشعِر المشتريات بإكمال التوريد",
    !!dec && dec.includes("توريد لم يكتمل — مطلوب إكمال التوريد"));

  // ── الموضع (٢): بعد البتّ في آخر بندٍ إضافي ──
  const pEx = mk();
  pEx.status = "pending_extra";
  pEx.items[3]._extraStatus = "approved";
  pEx.items[4]._extraStatus = "approved";
  A._poSettleExtras(pEx, "2026-08-03T15:01:00.000Z");
  T("★ البتّ في آخر بندٍ إضافي مع بقاء نقصٍ ⇒ proc_executing لا closed",
    pEx.status === "proc_executing", "status=" + pEx.status);
  T("★ العودة مقيَّدةٌ في السجل (لا انتقال صامت)",
    pEx.timeline.length === 1 && pEx.timeline[0].code === "proc_executing" &&
    pEx.timeline[0].event.includes("استكمال البنود الناقصة"));

  const pFull = mk();
  pFull.status = "pending_extra";
  pFull.items.forEach(it => { if (it._extra) it._extraStatus = "approved"; });
  pFull.grnDocs[0].items[0].rcvQty = 5;
  pFull.grnDocs[0].items[1].rcvQty = 2;
  pFull.grnDocs[0].items[2].rcvQty = 1;
  A._poSettleExtras(pFull, "2026-08-03T15:01:00.000Z");
  T("اكتمال كل البنود مع البتّ في الإضافي ⇒ إقفال", pFull.status === "closed");

  const pPend = mk();
  pPend.status = "pending_extra";
  pPend.items[3]._extraStatus = "approved";   // بقي i5 معلَّقاً
  A._poSettleExtras(pPend, "2026-08-03T15:01:00.000Z");
  T("بندٌ إضافيٌّ لم يُبَتّ فيه ⇒ الطلب يبقى موقوفاً",
    pPend.status === "pending_extra" && pPend.timeline.length === 0);

  // ── سجل الأحداث: رمزُ الحالة الخام لا يُعرض كما هو ──
  const srcEv = slice("function poTimelineEvent(tl){", "\nfunction poStatusBadge");
  let EV = null;
  try {
    EV = new Function("PO_STATUS", "RFQ_STATUS", "poStatusLabel",
      srcEv + "\nreturn poTimelineEvent;"
    )({ pending_pm: "بانتظار موافقة مدير المشاريع" }, {}, s => "بانتظار موافقة مدير المشاريع");
  } catch (e) { T("poTimelineEvent قابلة للتنفيذ", false, String(e.message).slice(0, 140)); }
  if (EV) {
    T("★ قيدٌ نصُّه رمزُ حالةٍ يُعرض بالعربية (طلبات قائمة)",
      EV({ event: "pending_pm" }) === "تغيير الحالة: بانتظار موافقة مدير المشاريع");
    T("النصُّ العربي يمرّ كما هو", EV({ event: "تم إنشاء الطلب وتقديمه" }) === "تم إنشاء الطلب وتقديمه");
    T("قيدٌ بلا نص لا يكسر السطر", EV({}) === "—" && EV(null) === "—");
  }
  T("★ الشاشة وPDF كلاهما يمرّ عبر poTimelineEvent",
    HTML.includes("const e = poTimelineEvent(tl);") &&
    HTML.includes("${esc(poTimelineEvent(tl))}") &&
    !HTML.includes("${esc(tl.event)}"));
  T("★ إنشاء الطلب لم يعد يخزّن رمزاً خاماً في event",
    !HTML.includes('{event:"pending_pm",code:"pending_pm"'));
}

/* ════════════════════════════════════════════════════════════════════
   الملاحظات تظهر فعلاً في تفاصيل طلب الشراء (v18.9ab)
   ───────────────────────────────────────────────────────────────────
   ملاحظتان مختلفتان، وكلتاهما كانت تُكتب ولا تُقرأ:
   (١) items[].notes — «ملاحظات / مواصفات» البند في نموذج طلب التسعير،
       ينقلها _rfqToPO إلى بنود طلب الشراء ثم لا يعرضها جدولُ البنود
       لا في الشاشة ولا في نسختَي الطباعة.
   (٢) rf.notes — ملاحظاتُ طلب التسعير نفسه، كان سطرُ «تحويل من طلب
       تسعير …» يدهسها كلياً عند التحويل.
   ════════════════════════════════════════════════════════════════════ */
function poNotesVisible() {
  H("ملاحظاتُ الطلب والبند تظهر في التفاصيل والطباعة");

  // ── (١) ملاحظةُ البند: دالةٌ واحدة تخدم المواضع الثلاثة ──
  const srcNote = slice("function poItemNote(it){", "\n");
  let NF = null;
  try { NF = new Function(srcNote + "\nreturn poItemNote;")(); }
  catch (e) { T("poItemNote قابلة للتنفيذ", false, String(e.message).slice(0, 140)); }
  if (NF) {
    T("★ poItemNote تُرجع نصَّ الملاحظة مشذّباً", NF({ notes: "  مقاس 40×80  " }) === "مقاس 40×80");
    T("بندٌ بلا ملاحظة يُرجع فراغاً (فلا يُرسَم سطرٌ خاوٍ)",
      NF({}) === "" && NF(null) === "" && NF({ notes: "   " }) === "");
  }

  // المواضع الثلاثة تستدعيها فعلاً — ثلاثة استدعاءات على الأقل في العرض
  const uses = (HTML.match(/poItemNote\(it(?:em)?\)/g) || []).length;
  T("★ ملاحظةُ البند مرسومةٌ في المواضع الثلاثة (تفاصيل + PDF + PDF بلا أسعار)",
    uses >= 4, "عدد الاستدعاءات = " + uses);
  T("★ تفاصيل الطلب ترسم ملاحظة البند تحت اسم المادة",
    /const _n=poItemNote\(item\);return _n\?/.test(HTML));
  T("★ نسختا الطباعة كلتاهما ترسمان noteLine في خلية الاسم",
    (HTML.match(/const noteLine\s*=\s*poItemNote\(it\)/g) || []).length === 2 &&
    (HTML.match(/\$\{substBadge\}\$\{noteLine\}/g) || []).length === 2);

  // ── (٢) تحويل طلب التسعير لا يدهس ملاحظاته ──
  const _a = HTML.indexOf('notes: [ String(rf.notes||"").trim(),');
  const _b = HTML.indexOf('.join("\\n")', _a);
  T("تعبيرُ الملاحظات في _rfqToPO موجود", _a >= 0 && _b > _a);
  if (_a >= 0 && _b > _a) {
    const expr = HTML.slice(_a + "notes: ".length, _b + '.join("\\n")'.length);
    let CF = null;
    try { CF = new Function("rf", "rfqId", "q", "return " + expr + ";"); }
    catch (e) { T("التعبير قابل للتنفيذ", false, String(e.message).slice(0, 140)); }
    if (CF) {
      const withNote = CF({ notes: "الحديد درجة أولى — توريد خلال أسبوع" }, "RFQ-2026-0007", { supplier: "مصادر الوطنية" });
      T("★ ملاحظةُ طلب التسعير تنجو من التحويل (كانت تُدهس)",
        withNote.startsWith("الحديد درجة أولى — توريد خلال أسبوع"), withNote.replace(/\n/g, " ⏎ "));
      T("★ وسطرُ المصدر يبقى أسفلها — لا يُفقَد أثرُ التحويل",
        withNote.includes("تحويل من طلب تسعير RFQ-2026-0007 — عرض: مصادر الوطنية"));
      T("طلبُ تسعيرٍ بلا ملاحظات ⇒ سطرُ المصدر وحده بلا سطرٍ فارغ",
        CF({}, "RFQ-1", { supplier: "س" }) === "تحويل من طلب تسعير RFQ-1 — عرض: س" &&
        CF({ notes: "   " }, "RFQ-1", { supplier: "س" }) === "تحويل من طلب تسعير RFQ-1 — عرض: س");
    }
  }

  // ── الملاحظاتُ متعددةُ الأسطر تُعرض بأسطرها ──
  T("★ .d-desc يحترم أسطر الملاحظة (white-space:pre-line)",
    /\.d-desc\{[^}]*white-space:pre-line/.test(HTML));
  T("★ كتلةُ الملاحظات في نسختَي الطباعة تحترم الأسطر",
    (HTML.match(/border:1px solid #c7d7f5;white-space:pre-line"><b>ملاحظات:<\/b>/g) || []).length === 2);
  T("تفاصيل الطلب ما زالت تعرض ملاحظاتِ الطلب نفسها (تراجع)",
    HTML.includes('<div class="d-sec-label">ملاحظات</div><div class="d-desc">${esc(p.notes)}</div>'));
}

/* ════════════════════════════════════════════════════════════════════
   دفعة الفحص العميق الثانية (v18.9ac) — M7 / M9 / M20 + خانة ملاحظة البند
   ───────────────────────────────────────────────────────────────────
   تنبيه للقارئ: H4/H5/H6/C3/C4/C5/H8/H10/M2/M4/M5/M15 أُصلحت في v18.9vu
   ويحرسها القسم 28. ما هنا هو ما بقي مفتوحاً من البنود المستقلّة.
   ════════════════════════════════════════════════════════════════════ */
function deepReviewV18_9ac() {
  H("دفعة الفحص العميق الثانية — M7 / M9 / M20 + ملاحظة البند");

  const pmSrc = fs.existsSync(path.resolve(path.dirname(IDX), "project-management.js"))
    ? fs.readFileSync(path.resolve(path.dirname(IDX), "project-management.js"), "utf8") : "";
  const coSrc = fs.existsSync(path.resolve(path.dirname(IDX), "cleaning-operations.js"))
    ? fs.readFileSync(path.resolve(path.dirname(IDX), "cleaning-operations.js"), "utf8") : "";

  // ── M7: saveBoq لا يبتلع فشل تحديث الموازنة ──
  // v18.9ad: صار المسار `_budgetTx` مباشرةً (M6)، والثابتُ المحروس هو نفسه —
  // فشلُ تحديث الموازنة يُعلَن ويُرجِع false، ولا يمرّ إلى `return true`.
  const _sb = pmSrc.indexOf("async function saveBoq(projId, items){");
  const sbSrc = _sb >= 0 ? pmSrc.slice(_sb, pmSrc.indexOf("\n/* ══", _sb)) : "";
  T("★ M7: saveBoq لا يعلن نجاحاً إن فشل تحديث الموازنة",
    !!sbSrc && /catch\(e2\)\{/.test(sbSrc) && sbSrc.includes("return false;") &&
    sbSrc.indexOf("return false;") < sbSrc.lastIndexOf("return true;"),
    sbSrc ? "" : "تعذّر اقتطاع saveBoq");
  T("★ M7: الفشل الجزئي مُعلَن للمستخدم (المقايسة حُفظت والموازنة لا)",
    pmSrc.includes("حُفظت المقايسة لكن تعذّر تحديث الموازنة"));

  // ── M9: poForProject يطبّع projectId الفارغ إلى hail كما تفعل النواة ──
  const _pf = pmSrc.indexOf("function poForProject(projId){");
  const _pfSrc = _pf >= 0 ? pmSrc.slice(_pf, pmSrc.indexOf("\nfunction ", _pf + 10)) : "";
  T("★ M9: poForProject يطابق بالمفتاح المُطبَّع لا بالمساواة الصارمة",
    /\(p\.projectId\|\|"hail"\)===projId/.test(_pfSrc) && !/p\.projectId===projId/.test(_pfSrc));
  T("★ M9: النواة والوحدة على اصطلاحٍ واحد (الفارغ = hail)",
    /return p\.projectId\|\|"hail";/.test(HTML) && /\(p\.projectId\|\|"hail"\)===filterVal/.test(HTML));

  // ── M20: يومُ التنفيذ محلّي لا UTC ──
  const _ed = coSrc.indexOf("function execDay(t){");
  const _edSrc = _ed >= 0 ? coSrc.slice(_ed, coSrc.indexOf("function doneToday", _ed)) : "";
  T("execDay مستخرَجة", !!_edSrc);
  if (_edSrc) {
    let EX = null;
    try {
      EX = new Function("_ymdL",
        _edSrc + "\nreturn execDay;"
      )(d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"));
    } catch (e) { T("execDay قابلة للتنفيذ", false, String(e.message).slice(0, 140)); }
    if (EX) {
      T("★ M20: الحقل المحلّي الصريح يُقدَّم (سجلٌّ جديد)",
        EX({ lastExecutedDate: "2026-08-09", lastExecuted: "2026-08-08T22:00:00.000Z" }) === "2026-08-09");
      // سجلٌّ قديم: طابعٌ UTC يُحوَّل لتاريخٍ محلّي — لا يُقتطَع
      const iso = "2026-08-08T22:00:00.000Z";
      const localY = new Date(iso).getFullYear() + "-" +
        String(new Date(iso).getMonth() + 1).padStart(2, "0") + "-" +
        String(new Date(iso).getDate()).padStart(2, "0");
      T("★ M20: الطابع القديم يُحوَّل لتاريخٍ محلّي (لا slice على UTC)",
        EX({ lastExecuted: iso }) === localY, "execDay=" + EX({ lastExecuted: iso }) + "  محلّي=" + localY);
      T("مهمّة لم تُنفَّذ ⇒ فراغ", EX({}) === "" && EX(null) === "");
      T("طابعٌ فاسد لا يرمي — يرجع للاقتطاع", EX({ lastExecuted: "غير صالح" }) === "غير صالح");
      // العطل نفسه: بيئة +٣ (الرياض) — التنفيذ 1:00 صباح ٠٩/٠٨ محلّياً = 22:00 ٠٨/٠٨ UTC.
      // نحقن مُنسِّقاً يحاكي +٣ فيُثبت أن execDay ترجع اليوم المحلّي لا المقتطَع من UTC.
      let EX3 = null;
      try {
        EX3 = new Function("_ymdL", _edSrc + "\nreturn execDay;")(d => {
          const s = new Date(d.getTime() + 3 * 3600 * 1000);
          return s.getUTCFullYear() + "-" + String(s.getUTCMonth() + 1).padStart(2, "0") + "-" + String(s.getUTCDate()).padStart(2, "0");
        });
      } catch (e) { /* غُطّي أعلاه */ }
      if (EX3) {
        const t3 = { lastExecuted: "2026-08-08T22:00:00.000Z" };
        T("★★ M20: في +٣ التنفيذُ ١:٠٠ صباحاً يُحسب لليوم المحلّي (٠٩) لا لـUTC (٠٨)",
          EX3(t3) === "2026-08-09" && String(t3.lastExecuted).slice(0, 10) === "2026-08-08",
          "execDay=" + EX3(t3) + "  والاقتطاع القديم=" + String(t3.lastExecuted).slice(0, 10));
      }
    }
  }
  T("★ M20: doneToday تمرّ عبر execDay لا عبر slice(0,10)",
    /function doneToday\(t\)\{ const d=execDay\(t\); return !!d && d===_today\(\); \}/.test(coSrc) &&
    !/String\(t\.lastExecuted\)\.slice\(0,10\)===_today\(\)/.test(coSrc));
  T("★ M20: التنفيذ يكتب lastExecutedDate محلّياً",
    /lastExecuted: now, lastExecutedDate: _today\(\)/.test(coSrc));
  T("★ M20: شاشتا «آخر تنفيذ» تعرضان اليوم المحلّي",
    (coSrc.match(/execDay\(t\)/g) || []).length >= 4 &&
    !/_esc\(String\(t\.lastExecuted\)\.slice\(0,10\)\)/.test(coSrc));

  // ── خانة ملاحظة البند في «طلب شراء جديد» ──
  T("★ الحقل موجود في النموذج", HTML.includes('id="np-item-notes"'));
  T("★ addPurchaseItem يقرأه ويخزّنه في notes (نفس حقل طلب التسعير)",
    HTML.includes('const itemNotes = ((document.getElementById("np-item-notes")||{}).value||"").trim().slice(0,300);') &&
    HTML.includes("itemId: catalogItemId, notes: itemNotes }"));
  T("★ يُمسح بعد إضافة البند وعند تفريغ النموذج (لا يتسرّب للبند التالي ولا للطلب التالي)",
    /"np-item-total","np-vendor","np-item-notes"\]\.forEach/.test(HTML) &&
    /"np-vendor","np-item-notes","np-notes"/.test(HTML));
  // ── التقرير نفسه: كل بندٍ موسومٌ بحالته، فلا يعود يُقرأ كأنه كله مفتوح ──
  const DR_PATH = path.resolve(path.dirname(IDX), "docs", "deep-review-2026-08.md");
  const DR = fs.existsSync(DR_PATH) ? fs.readFileSync(DR_PATH, "utf8") : "";
  T("★ تقرير الفحص العميق موجود", !!DR);
  if (DR) {
    const heads = DR.split("\n").filter(l => /^### [CHML]\d{1,2} /.test(l));
    const untagged = heads.filter(l => !/(✅ مُصلَح|⏳ مؤجَّل|🔴 مفتوح|⚪ إنذار كاذب)/.test(l));
    T("★ كل بندٍ في التقرير يحمل وسمَ حالة (يمنع إعادة إصلاح المُصلَح)",
      heads.length >= 40 && untagged.length === 0,
      heads.length + " بنداً" + (untagged.length ? " — بلا وسم: " + untagged.slice(0, 3).join(" | ").slice(0, 160) : ""));
    T("★ الترويسة تُعلن أن الوثيقة حيّة لا لقطة",
      DR.includes("**الوثيقة حيّة لا لقطة.**") && !DR.includes("النطاق: كشف الأخطاء فقط (لم تُطبَّق إصلاحات)"));
    ["C3", "C4", "H4", "H5", "H6"].forEach(c =>
      T("وسمُ " + c + " = مُصلَح v18.9vu", new RegExp("^### " + c + " .*✅ مُصلَح v18\\.9vu", "m").test(DR)));
    ["M7", "M9", "M20"].forEach(c =>
      T("وسمُ " + c + " = مُصلَح v18.9ac", new RegExp("^### " + c + " .*✅ مُصلَح v18\\.9ac", "m").test(DR)));
    T("★ M19 موسومٌ إنذاراً كاذباً (الفاصل U+0001 موجودٌ في الكود)",
      /^### M19 .*⚪ إنذار كاذب/m.test(DR) &&
      coSrc.includes('k.indexOf(b+"")===0') && coSrc.includes('String(b)+""+String(wt)'));
  }

  T("★ جدولُ بنود النموذج يعرض الملاحظة قبل الإرسال",
    HTML.includes('${esc(item.itemName)}${item.priceLocked?` <span style=\'font-size:10px;color:#92400e;background:#fef3c7;border-radius:4px;padding:1px 5px\'>🔒</span>`:""}${poItemNote(item)?'));
}

/* ════════════════════════════════════════════════════════════════════
   دفعة الفحص العميق الثالثة (v18.9ad) — H7 M6 M8 M14 M21 M22 M23 M24
   بها يُغلق كلُّ ما كان موسوماً «🔴 مفتوح» في التقرير.
   ════════════════════════════════════════════════════════════════════ */
function deepReviewV18_9ad() {
  H("دفعة الفحص العميق الثالثة — H7/M6/M8/M14/M21/M22/M23/M24");

  const rd = f => { const q = path.resolve(path.dirname(IDX), f); return fs.existsSync(q) ? fs.readFileSync(q, "utf8") : ""; };
  const stSrc = rd("stocktake.js"), pmSrc = rd("project-management.js"), coSrc = rd("cleaning-operations.js");
  const paSrc = rd("price-analysis.js"), lcSrc = rd("labor-catalog.js");
  const obSrc = rd("functions/lib/outbox.js"), fnSrc = rd("functions/index.js");

  // ── H7: البوّابة والتقرير يقيسان مقابل الرصيد الحيّ ──
  const _bq = stSrc.indexOf("function _baseQty(s){");
  const bqSrc = _bq >= 0 ? stSrc.slice(_bq, stSrc.indexOf("\n  // تصنيف الفرق", _bq)) : "";
  T("H7: _baseQty مستخرَجة", !!bqSrc);
  if (bqSrc) {
    let BQ = null;
    try {
      BQ = new Function("_inventoryItems", "_num", bqSrc + "\nreturn _baseQty;");
    } catch (e) { T("H7: _baseQty قابلة للتنفيذ", false, String(e.message).slice(0, 120)); }
    if (BQ) {
      const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
      const live = BQ([{ id: "i1", currentQty: 50 }], num);
      T("★ H7: الأساس هو الرصيد الحيّ لا لقطة الإنشاء",
        live({ itemId: "i1", systemQty: 100 }) === 50, "= " + live({ itemId: "i1", systemQty: 100 }));
      T("★ H7: صنفٌ غائبٌ عن الرصيد الحيّ يرجع للقطة (لا صفرٌ مفاجئ)",
        live({ itemId: "zz", systemQty: 100 }) === 100);
      // العطل الأصلي: لقطة 100، صُرف 50 أثناء العدّ، العدّ 98
      const _cl = stSrc.indexOf("function _classify(systemQty, countedQty){");
      const clSrc = stSrc.slice(_cl, stSrc.indexOf("\n  // ملخّص", _cl));
      let CL = null;
      try { CL = new Function("_num", "ST_BIG_PCT", "ST_ABS_FLOOR", clSrc + "\nreturn _classify;")(num, 10, 1); } catch (e) { }
      if (CL) {
        const base = live({ itemId: "i1", systemQty: 100 });
        T("★★ H7: الفرق المصنَّف = الفرق المطبَّق (+48) لا فرقُ اللقطة (−2)",
          CL(base, 98).delta === 48 && CL(100, 98).delta === -2,
          "حيّ=" + CL(base, 98).delta + " · لقطة=" + CL(100, 98).delta);
        T("★★ H7: وبذلك يرتفع للاعتماد بدل أن يمرّ صامتاً",
          CL(base, 98).big === true && CL(100, 98).big === false);
      }
    }
  }
  T("★ H7: كل مواضع التصنيف تمرّ بـ_baseQty (لا systemQty خام)",
    (stSrc.match(/_classify\(_baseQty\(s\)/g) || []).length >= 3 &&
    !/_classify\(s\.systemQty/.test(stSrc));
  T("★ H7: التقرير المخزَّن يوثّق اللقطة والأساس الحيّ معاً",
    /systemQty:_num\(s\.systemQty\), baseQty:base/.test(stSrc));

  // ── M6: كتابات الموازنة ذرّية ومبنيّة على الطازج ──
  T("★ M6: كاتبٌ ذرّيٌّ واحد (_budgetTx) يقرأ المستند داخل المعاملة",
    /async function _budgetTx\(projId, build\)\{/.test(pmSrc) && /runTransaction\(async tx=>\{/.test(pmSrc));
  T("★ M6: الكتابات الأربع تمرّ به — لا set مباشرة على مستند الموازنة",
    (pmSrc.match(/await _budgetTx\(projId,/g) || []).length === 4 &&
    !/database\.doc\(budgetDocPath\(projId\)\)\.set\(/.test(pmSrc));
  T("★ M6: saveBoq يبني «البنود اليدوية» من الطازج لا من الكاش (جذر فقدان التحديث)",
    /const cats = fresh => \{/.test(pmSrc) &&
    /\(fresh\.categories\|\|\[\]\)\.forEach\(c=>existing\[c\.key\]/.test(pmSrc) &&
    !/\(\(_budgetCache\[projId\]\|\|\{\}\)\.categories\|\|\[\]\)\.forEach/.test(pmSrc));
  T("★ M6: saveCleaning يدمج فوق cleaning الطازج",
    /Object\.assign\(\{\}, fresh\.cleaning, patch\)/.test(pmSrc));

  // ── M8: الاستعاضة مفصولةٌ ومعلَنة ──
  T("★ M8: الملخّص يفصل المموَّل بالاستعاضة", /substTotal: substActual \+ substCommitted/.test(pmSrc));
  T("★ M8: المجموع لم يتغيّر (لا قرار محاسبي من طرفٍ واحد)",
    /if\(poClosed\(p\)\)\{ actual \+= poActual\(p\);/.test(pmSrc) &&
    /const remaining = planned - actual - committed;/.test(pmSrc));
  T("★ M8: البطاقة تُعلن المصدر للقارئ", pmSrc.includes("مموَّلةٍ بالاستعاضة"));

  // ── M14: مفتاح التكرار يميّز الحدث الجديد عن إعادة الإطلاق ──
  const _ik = obSrc.indexOf("function idempotencyId(");
  const ikSrc = _ik >= 0 ? obSrc.slice(_ik, obSrc.indexOf("\n/**", _ik)) : "";
  T("M14: idempotencyId مستخرَجة", !!ikSrc);
  if (ikSrc) {
    let ID = null;
    try { ID = new Function("crypto", ikSrc + "\nreturn idempotencyId;")(require("crypto")); } catch (e) { }
    if (ID) {
      const base = { eventType: "ticket_assigned", entityId: "TK-1", transition: "أحمد->محمد", recipient: "9665" };
      T("★★ M14: إعادةُ إطلاقٍ لنفس الكتابة تُدمج (منعُ التكرار محفوظ)",
        ID(Object.assign({}, base, { occurrence: "T1" })) === ID(Object.assign({}, base, { occurrence: "T1" })));
      T("★★ M14: إسنادٌ جديدٌ بنفس الانتقال لم يعد يُسقَط بصمت",
        ID(Object.assign({}, base, { occurrence: "T1" })) !== ID(Object.assign({}, base, { occurrence: "T2" })));
      T("M14: بلا occurrence يبقى السلوك القديم حرفياً (توافق رجعي)",
        ID(base) === ID(Object.assign({}, base, { occurrence: "" })));
    }
  }
  T("★ M14: الدالة تُمرَّر occurrence من طابع الإسناد", /occurrence: String\(after\.assignedAt/.test(fnSrc));
  T("★ M14: العميل يكتب assignedAt عند الإسناد وعند الإنشاء بفني",
    /t\.assignedAt=now;/.test(HTML) && /assignedAt: tech\?now:null/.test(HTML));

  // ── M21: تقريرٌ شهريٌّ بأرقامٍ شهرية ──
  T("★ M21: صفوف التغطية من سجلّ الشهر لا لقطةِ اليوم",
    /const monthByBld = \{\};/.test(coSrc) && /visibleLog\(\)\.forEach\(r=>\{/.test(coSrc) &&
    coSrc.includes("التغطية حسب المنطقة — ${_monthName(ym)}"));
  T("★ M21: لقطةُ اليوم تبقى لكن موسومةً بيومها (لا تُقرأ شهرية)",
    coSrc.includes("لقطةُ اليوم — ${_esc(today)} (ليست مؤشّراً شهرياً)") && /const todayCovRows = cov\.map/.test(coSrc));

  // ── M22: أساسا المقارنة مُسمَّيان ──
  T("★ M22: رأس عمود التقديري يقول «صافٍ قبل الضريبة»",
    HTML.includes("سعر الوحدة / الإجمالي — <b>صافٍ قبل الضريبة</b>"));
  T("★ M22: تذييل الجدول ينبّه لاختلاف الأساس", HTML.includes("التقديري/الكتالوج <b>صافٍ قبل ض.ق.م</b>"));

  // ── M23: صفرُ السعر لم يعد صامتاً ──
  T("★ M23: إدراج صنفٍ بلا سعر يُنبَّه عليه",
    /if\(!\(num\(_v\)>0\)\) T\("⚠ «"\+\(it\.name\|\|"البند"\)\+"» بلا سعرٍ في الكتالوج/.test(paSrc));
  T("M23: الصفر ما زال مسموحاً (تنبيهٌ لا منع)", /_draft\.materials\.push\(\{source:"catalog"/.test(paSrc));

  // ── M24: تعارض التحرير يُرفض ويُشرَح ──
  [["price-analysis", paSrc], ["labor-catalog", lcSrc]].forEach(([nm, src]) => {
    T("★ M24: " + nm + " يتحقّق من البصمة داخل معاملة",
      /function _txUpdateGuarded\(id, data\)\{/.test(src) &&
      /if\(opened != null && String\(cur\) !== String\(opened\)\) throw new Error\("__CONFLICT__"\);/.test(src) &&
      !/await db\.collection\(COLLECTION\(\)\)\.doc\(id\)\.update\(data\);/.test(src));
    T("M24: " + nm + " يلتقط البصمة عند الفتح ويُصفّرها للإنشاء",
      /_openedStamp = it\.updatedAt \|\| "";/.test(src) && /_openedStamp = null;/.test(src));
    T("M24: " + nm + " يشرح التعارض للمستخدم لا «خطأ اتصال»",
      src.includes("عدّل زميلٌ هذا البند بينما كان مفتوحاً لديك") && src.includes("__GONE__"));
  });

  // ── التقرير: لم يعد فيه بندٌ مفتوح ──
  const DR_PATH2 = path.resolve(path.dirname(IDX), "docs", "deep-review-2026-08.md");
  const DR2 = fs.existsSync(DR_PATH2) ? fs.readFileSync(DR_PATH2, "utf8") : "";
  if (DR2) {
    ["H7", "M6", "M8", "M14", "M21", "M22", "M23", "M24"].forEach(c =>
      T("وسمُ " + c + " = مُصلَح v18.9ad", new RegExp("^### " + c + " .*✅ مُصلَح v18\\.9ad", "m").test(DR2)));
    const stillOpen = DR2.split("\n").filter(l => /^### [CHML]\d{1,2} .*🔴 مفتوح/.test(l));
    T("★ لم يبقَ بندٌ «مفتوح» غيرَ مؤجَّلٍ بقرار",
      stillOpen.length === 0, stillOpen.length ? stillOpen.join(" | ").slice(0, 200) : "كلها مُصلَحة أو مؤجَّلة بقرار");
  }
}

function ticketWhoLabels() {
  H("مَن سجّل البلاغ: الحساب/المشرف/المُبلِّغ (v18.9z)");

  T("★ ae: حقلُ الشبكة يسمّي معناه «مسجّل البلاغ (الحساب)»",
    HTML.includes('["مسجّل البلاغ (الحساب)",esc(t.createdByName||t.createdBy||"—")]'));
  T("★ ae: صفُّ «المُبلِّغ عن العطل» مشروطٌ بوجود reporter (لا صفَّ فارغاً)",
    /\.\.\.\(t\.reporter\?\[\["المُبلِّغ عن العطل",esc\(t\.reporter\)\]\]:\[\]\)/.test(HTML));
  T("★ ae: سجلُّ الأحداث يمرّ عبر timelineWho لا esc(ev.by) مباشرةً (تراجع)",
    HTML.includes("const who=timelineWho(t,ev);") &&
    HTML.includes('<div class="dtl-meta">${who} — ${fmtDate(ev.at)}</div>') &&
    !HTML.includes('<div class="dtl-meta">${esc(ev.by)} — ${fmtDate(ev.at)}</div>'));

  const fsrc = slice("function timelineWho(t,ev){", "\n//  DETAIL");
  let W = null;
  try { W = new Function("esc", fsrc + "\nreturn timelineWho;")(s => String(s)); }
  catch (e) { T("★ ae: timelineWho قابلة للاستخراج", false, String(e.message).slice(0, 120)); }
  if (W) {
    const CREATE = { event: "تم تسجيل البلاغ", by: "عبدالله المشعان" };
    T("★ ae: عند اختلاف الحساب عن المشرف يظهر الاثنان (جذر الالتباس)",
      W({ createdByName: "ثامر فريح" }, CREATE).includes("ثامر فريح") &&
      W({ createdByName: "ثامر فريح" }, CREATE).includes("(المشرف: عبدالله المشعان)"),
      W({ createdByName: "ثامر فريح" }, CREATE));
    T("★ ae: عند تطابقهما لا يتكرّر الاسم",
      W({ createdByName: "عبدالله المشعان" }, CREATE) === "عبدالله المشعان");
    T("★ ae: البلاغاتُ القديمة/التجريبية (لا createdByName) تبقى كما كانت",
      W({}, CREATE) === "عبدالله المشعان" &&
      W({ createdBy: "عبدالله المشعان" }, CREATE) === "عبدالله المشعان");
    T("★ ae: الأحداثُ غيرُ التسجيل لا تُمَسّ (تعيين/إغلاق)",
      W({ createdByName: "ثامر فريح" }, { event: "تم تعيين الفني: عبد العزيز", by: "النظام" }) === "النظام" &&
      W({ createdByName: "ثامر فريح" }, { event: "تم إغلاق البلاغ", by: "عبد العزيز" }) === "عبد العزيز");
    T("z: حدثٌ بلا by لا يكسر السطر",
      W({ createdByName: "ثامر فريح" }, { event: "تم إغلاق البلاغ" }) === "—");
  }

  // الحقول الثلاثة تُكتب فعلاً عند إنشاء البلاغ — وإلا صار التوضيح بلا مصدر
  const nt = slice("createdBy:(currentUser&&currentUser.user)||null", "tickets.push(t);");
  T("z: إنشاءُ البلاغ يحفظ الحسابَ والمُبلِّغ والمشرفَ في السجل",
    !!nt && nt.includes("createdByName:(currentUser&&currentUser.name)||null") &&
    HTML.includes("reporter:reporter||null") &&
    nt.includes('{event:"تم تسجيل البلاغ",by:supervisor||"النظام"'));
}

function hrPaymentsTests() {
  H("وحدة سداد أعمال الموارد البشرية (hr-payments.js)");
  if (!HRP_PATH) { T("hr-payments.js موجود", false); return; }
  const src = fs.readFileSync(HRP_PATH, "utf8");
  const vm = require("vm");
  try { new vm.Script(src); T("صياغة hr-payments.js سليمة", true); }
  catch (e) { T("صياغة hr-payments.js سليمة", false, String(e.message).slice(0, 120)); return; }

  // ── نقاط الربط في index.html ──
  T("الوسم موجود في index.html", /<script src="hr-payments\.js\?v=/.test(HTML));
  T("حاويتا الصفحتين موجودتان",
    HTML.includes('id="page-hr-payments"') && HTML.includes('id="page-new-hr-payment"'));
  T("مجموعة السايدبار موجودة ومخفية افتراضياً (تُظهرها الوحدة للمخوَّلين وحدهم)",
    /id="hdr-grp-hrp"[^>]*style="display:none"/.test(HTML) &&
    /id="grp-hrp"[^>]*display:none/.test(HTML));
  T("زرّا التنقّل موجودان", HTML.includes('data-page="hr-payments"') && HTML.includes('data-page="new-hr-payment"'));
  T("showPage يرسم الصفحتين",
    HTML.includes('id==="hr-payments"') && HTML.includes("window.hrPayments.render") &&
    HTML.includes('id==="new-hr-payment"') && HTML.includes("window.hrPayments.renderNew"));
  T("تُشغَّل مع بقية الوحدات (startSync)", HTML.includes("window.hrPayments.startSync"));
  T("الصفحتان في pageGroupMap تحت مجموعتهما", HTML.includes('"hr-payments":"grp-hrp"') && HTML.includes('"new-hr-payment":"grp-hrp"'));
  T("مسجّلة في كاشف الوحدات القديمة (REG)",
    HTML.includes('{name:"hr-payments.js", get:function(){ return window.hrPayments; }}'));
  T("الدور hr_officer مضاف لقائمتَي إضافة المستخدمين",
    (HTML.match(/<option value="hr_officer">/g) || []).length >= 2);

  // ── بصمة البناء تطابق الإصدار ──
  const hrBuild = (src.match(/var MODULE_BUILD = "(v[\d.a-z]+)"/) || [])[1];
  T("★ MODULE_BUILD في hr-payments.js يطابق APP_VERSION (يُرفَعان معاً)",
    hrBuild === VER, `MODULE_BUILD=${hrBuild}  APP_VERSION=${VER}`);
  T("الوحدة تُصدّر build على واجهتها العامة", /build:MODULE_BUILD/.test(src));

  /* ── العزل عن مسار المشتريات ──
     الوحدة مصروفٌ إداري لا شراء: أي لمسٍ لـ purchases/savePurchase/global_purchases
     يعني تسرّب أرقامها إلى تكاليف المشاريع ومؤشّرات التوريد. */
  // الاسم يرد في تعليق الرأس شرحاً للعزل — الحارس على الاستعمال الفعلي (سلسلة مقتبسة).
  T("★ لا تكتب ولا تقرأ مجموعة المشتريات (global_purchases)",
    !/["']global_purchases/.test(src) && !/PURCHASES_COLLECTION\s*\(/.test(src));
  T("★ لا تستدعي savePurchase ولا تلمس مصفوفة purchases",
    !/\bsavePurchase\s*\(/.test(src) && !/\bpurchases\s*\.(find|filter|map|push)\b/.test(src));
  T("★ لا تلمس المخزون ولا البند المستعاض",
    !/_inventoryItems|substituteBudget|substituteAccountId/.test(src));
  T("مجموعتها الخاصة معرّفة مع نسخة التطوير", /global_hr_payments_dev/.test(src) && /global_hr_payments/.test(src));

  /* ── السقف يُقرأ من المصدر الموحّد، لا رقماً مكتوباً في الوحدة ── */
  T("★ سقف التنفيذي يُقرأ من CEO_APPROVAL_THRESHOLD الموحّد",
    /CEO_APPROVAL_THRESHOLD/.test(src));

  // ── تحميل الوحدة فعلياً واختبار دالة التوجيه النقية ──
  const sandbox = { window: {}, console, document: undefined };
  vm.createContext(sandbox);
  try { vm.runInContext(src, sandbox); } catch (e) { T("تُحمَّل الوحدة", false, String(e.message).slice(0, 120)); return; }
  const HR = sandbox.window.hrPayments;
  T("تعرّض window.hrPayments والدوال النقية",
    HR && typeof HR._nextStage === "function" && typeof HR._iban === "function" && typeof HR.statusLabel === "function");
  if (!HR || typeof HR._nextStage !== "function") return;

  const TH = 2000;
  const ns = (r) => HR._nextStage(r, TH);

  // (١) اختيار مدير المشاريع يقدَّم على كل شيء
  T("★ اختار «يحتاج مدير المشاريع» ⇒ يبدأ عنده",
    ns({ amount: 100, needsPM: true }) === "hrp_pending_pm" &&
    ns({ amount: 99999, needsPM: true }) === "hrp_pending_pm");

  // (٢) بلا مدير مشاريع: أقل من السقف ⇒ المالية مباشرة
  T("بلا مدير مشاريع وتحت السقف ⇒ المالية مباشرة",
    ns({ amount: 1999.99, needsPM: false }) === "hrp_pending_finance");

  /* (٣) الثابت الحارس: بوابة التنفيذي تُحسب من التكلفة لا من اختيار بشري.
     لو رُبطت باختيار المُنشئ لأمكن تمرير أي مبلغ للمالية باختيار «لا». */
  T("★ اختيار «لا» لمدير المشاريع لا يتخطّى المدير التنفيذي فوق السقف",
    ns({ amount: 2000, needsPM: false }) === "hrp_pending_ceo" &&
    ns({ amount: 50000, needsPM: false }) === "hrp_pending_ceo");

  T("السقف شامل (≥) لا حصري (>)",
    ns({ amount: TH, needsPM: false }) === "hrp_pending_ceo" &&
    ns({ amount: TH - 0.01, needsPM: false }) === "hrp_pending_finance");

  // (٤) بعد اعتماد مدير المشاريع يُعاد الحساب من الدالة نفسها
  T("بعد اعتماد مدير المشاريع: فوق السقف ⇒ التنفيذي، وتحته ⇒ المالية",
    ns({ amount: 5000, needsPM: true, pmApprovedAt: "2026-08-01T00:00:00Z" }) === "hrp_pending_ceo" &&
    ns({ amount: 500,  needsPM: true, pmApprovedAt: "2026-08-01T00:00:00Z" }) === "hrp_pending_finance");

  // (٥) بعد اعتماد التنفيذي ⇒ المالية
  T("بعد اعتماد التنفيذي ⇒ المالية للسداد",
    ns({ amount: 5000, needsPM: false, ceoApprovedAt: "2026-08-01T00:00:00Z", ceoApprovedAmount: 5000 }) === "hrp_pending_finance");

  /* (٦) الثابت الثاني: اعتماد التنفيذي مربوطٌ بالمبلغ الذي رآه. رفع التكلفة بعد
     اعتماده يعيد الطلب إليه — وإلا سُدِّد مبلغٌ لم يوقّع عليه أحد. */
  T("★ رفع التكلفة فوق ما اعتمده التنفيذي يُسقط اعتماده ويعيد الطلب لبوابته",
    ns({ amount: 9000, needsPM: false, ceoApprovedAt: "2026-08-01T00:00:00Z", ceoApprovedAmount: 5000 }) === "hrp_pending_ceo");
  T("خفض التكلفة بعد اعتماد التنفيذي لا يعيد الطلب إليه",
    ns({ amount: 3000, needsPM: false, ceoApprovedAt: "2026-08-01T00:00:00Z", ceoApprovedAmount: 5000 }) === "hrp_pending_finance");
  T("★ اعتمادٌ قديم بلا ceoApprovedAmount لا يمرّر مبلغاً فوق السقف",
    ns({ amount: 8000, needsPM: false, ceoApprovedAt: "2026-08-01T00:00:00Z" }) === "hrp_pending_ceo");

  // (٧) جدول الحالات مكتمل ومتّسق
  const need = ["hrp_pending_pm","hrp_pending_ceo","hrp_pending_finance","hrp_closed",
                "hrp_pm_rejected","hrp_ceo_rejected","hrp_finance_returned","hrp_cancelled"];
  T("جدول الحالات يغطّي كل مراحل المسار", need.every(k => !!HR.HRP_STATUS[k]));
  T("كل مخرجات دالة التوجيه حالاتٌ معرَّفة",
    [ns({amount:1,needsPM:true}), ns({amount:1,needsPM:false}), ns({amount:1e6,needsPM:false})]
      .every(k => !!HR.HRP_STATUS[k]));
  T("الحالات النهائية والمرتدّة معرَّفة ولا تتقاطع",
    HR.HRP_FINAL.every(k => !!HR.HRP_STATUS[k]) &&
    HR.HRP_BOUNCED.every(k => !!HR.HRP_STATUS[k]) &&
    !HR.HRP_FINAL.some(k => HR.HRP_BOUNCED.indexOf(k) >= 0));

  // (٨) نوعية الأعمال — قائمة مغلقة + «أخرى» بنصّ حرّ
  T("قائمة نوعية الأعمال تشمل الإقامات ورخص العمل والتأشيرات و«أخرى»",
    ["residency","work_permit","visa","other"].every(k => HR.WORK_TYPES.some(w => w.k === k)));
  T("«أخرى» تعرض النص الحرّ المُدخل",
    HR.workTypeLabel({ workType: "other", workTypeOther: "رسوم شهادة صحية" }) === "رسوم شهادة صحية");

  // (٩) الآيبان — نفس قاعدة مسار الشراء
  T("تحقق الآيبان: SA + 22 رقماً، والفراغ مقبول",
    HR._iban("SA" + "1".repeat(22)).ok && HR._iban("").ok &&
    !HR._iban("SA123").ok && !HR._iban("XX" + "1".repeat(22)).ok);

  // (١٠) الصلاحيات — الأدوار المعنية وحدها
  T("★ العرض مقصور على الأدوار المعنية (لا المستودع ولا المشتريات ولا الزائر)",
    /function canView\(\)\{ return canCreate\(\) \|\| canPM\(\) \|\| canCEO\(\) \|\| canFinance\(\); \}/.test(src.replace(/\s+/g, " ").replace(/function canView\(\)/, "function canView()")) ||
    (/canCreate\(\)\s*\|\|\s*canPM\(\)\s*\|\|\s*canCEO\(\)\s*\|\|\s*canFinance\(\)/.test(src) &&
     !/warehouse_manager|procurement_officer/.test(src)));
  T("الإنشاء لمسؤول الموارد البشرية والمسؤول فقط",
    /function canCreate\(\)\s*\{\s*return _role\(\)==="hr_officer" \|\| _isAdmin\(\); \}/.test(src));
  T("تسجيل السداد يفرض إيصالاً إلزامياً", /إيصال التحويل إلزامي/.test(src));
  T("كل كتابة تمرّ بمعاملة على الوثيقة الطازجة", /runTransaction/.test(src));

  // (١١) نقاط الربط في النواة — دورٌ واحد وقائمةٌ واحدة
  T("★ _isGlobalOnlyRole مصدرٌ واحد لأدوار الوضع المركزي (يشمل hr_officer)",
    /function _isGlobalOnlyRole\(role\)\{[\s\S]*?hr_officer/.test(HTML) &&
    (HTML.match(/_isGlobalOnlyRole\(/g) || []).length >= 5);
  T("★ _notifVisible مصدرٌ واحد لفلترة الجرس ويحجب إشعارات الموارد البشرية عن غير المخوَّل",
    /function _notifVisible\(n, isGP\)\{[\s\S]*?hrPayments\.canView/.test(HTML) &&
    (HTML.match(/_notifVisible\(/g) || []).length >= 4);
  T("النقر على إشعار سداد يفتح الطلب في وحدته",
    HTML.includes('n.type==="hr_payment"') && HTML.includes("window.hrPayments.open(n.ticketId)"));
  T("مسؤول الموارد البشرية يهبط على شاشته لا على طلبات الشراء",
    HTML.includes('showPage(_hrOnly ? "hr-payments" : "purchases")'));
  T("سايدبار مسؤول الموارد البشرية مقصور على مجموعته",
    /body\.role-hr-officer #hdr-grp-po/.test(HTML) && /classList\.toggle\("role-hr-officer"/.test(HTML));
  /* ── حذف الطلب (المسؤول وحده) ──
     الحذف نهائيّ ولا رجعة فيه، فترتيب خطواته هو ما يمنع الأذى: قيدُ التدقيق يسبق
     الحذف (وإلا اختفى الطلب بلا أثر)، والمرفقات بعده (وإلا أبقى فشلُ ملفٍ وثيقةً
     محذوفةً معروضة)، والقائمة السوداء تُنظَّف عند الفشل (وإلا اختفى طلبٌ باقٍ). */
  T("★ الحذف للمسؤول وحده", /function remove\(id\)\{[\s\S]{0,200}?if\(!_isAdmin\(\)\)\{ _toast\("⚠ صلاحية المسؤول فقط"/.test(src) &&
    /async function _doRemove\([\s\S]{0,240}?if\(!_isAdmin\(\)\)/.test(src));
  {
    var rm = src.slice(src.indexOf("async function _doRemove("), src.indexOf("/* ════════ الإشعارات"));
    var iLog = rm.indexOf('_log("سداد موارد بشرية — حذف طلب"');
    var iDel = rm.indexOf(".delete()");
    var iAtt = rm.indexOf("refFromURL");
    T("★ قيد سجل التدقيق يُكتب قبل الحذف (فالوثيقة تزول ولا تحمل أثرها)",
      iLog > 0 && iDel > iLog, "log@"+iLog+" delete@"+iDel);
    T("★ قيد الحذف يحمل ما يعرّف المحذوف (النوع والمبلغ والحالة)",
      /workTypeLabel\(r\)[\s\S]{0,120}_fmt\(r\.amount\)[\s\S]{0,120}statusLabel\(r\.status\)/.test(rm));
    T("★ المرفقات تُحذف بعد نجاح حذف الوثيقة لا قبله",
      iAtt > iDel, "attachments@"+iAtt+" delete@"+iDel);
    T("★ حذف المرفقات بأفضل جهد لا يُسقط العملية", /refFromURL\(a\.url\)\.delete\(\)\.catch\(/.test(rm));
    T("★ فشل الحذف يرفع المعرّف من القائمة السوداء (لا يختفي طلبٌ باقٍ)",
      /catch\([\s\S]{0,200}?delete _deletedIds\[id\];/.test(rm));
    T("القائمة السوداء تُصفّي كل لقطة (لا يعود المحذوف مع لقطةٍ في الطريق)",
      /\.filter\(function\(r\)\{ return !_deletedIds\[r\.id\]; \}\)/.test(src));
    T("زرّ الحذف يظهر للمسؤول في تفاصيل الطلب",
      /if\(_isAdmin\(\)\) out\.push\([\s\S]{0,140}hrPayments\.remove/.test(src));
  }
  /* ── أيقونات السايدبار ──
     المنصة تستبدل إيموجي السايدبار بأيقونات _ICON عبر applyNavIcons من خريطتين؛
     صفحةٌ غير مسجّلة فيهما تبقى على الإيموجي الخام وسط سايدبار كلّه SVG. */
  T("★ صفحتا الوحدة ومجموعتها مسجّلة في خرائط أيقونات السايدبار (لا إيموجي خام)",
    /'hr-payments':'banknote'/.test(HTML) && /'new-hr-payment':'filePlus'/.test(HTML) &&
    /'hdr-grp-hrp':'users'/.test(HTML));
  navIconCoverage();

/* ════════════════════════════════════════════════════════════════════
   تغطية أيقونات السايدبار — v18.9x
   في index.html مُطبِّقان يعملان على DOMContentLoaded بالترتيب: applyNavIcons
   (NAV_ICON_BY_PAGE/NAV_ICON_BY_HDR، مفرداتها _ICON) ثم injectSidebarIcons
   (SB_PAGE_ICON/SB_GRP_ICON، مفرداتها SB_ICON_PATHS). الثاني يُسجَّل بعد الأول
   فيعمل بعده، ولا يكتب إلا حين يجد اسماً — فالنتيجة تتالٍ: SB يغلب حيث يعرف،
   وNAV يملأ الباقي. زرٌّ غائب عن **الاثنين** يبقى على إيموجيه الخام وسط سايدبار
   كلّه SVG: عطلٌ صامت لا يكسر شيئاً فلا ينتبه له أحد حتى يراه المستخدم.
   الحارس يفحص التتالي كما هو (لا خريطةً واحدة — فحصُ خريطةٍ وحدها ينجح لسببٍ
   خاطئ ويُخفي أن الغالب هو الآخر).
   ════════════════════════════════════════════════════════════════════ */
function navIconCoverage() {
  const grab = (re) => (HTML.match(re) || [])[1] || "";
  const keys = (body) => new Set([...("{" + body).matchAll(/(?:^|[{,])\s*['"]?([A-Za-z0-9-]+)['"]?\s*:/g)].map(m => m[1]));

  const navPage = keys(grab(/const NAV_ICON_BY_PAGE = \{([\s\S]*?)\};/));
  const navHdr  = keys(grab(/const NAV_ICON_BY_HDR = \{([\s\S]*?)\};/));
  const sbPage  = keys(grab(/const SB_PAGE_ICON=\{([\s\S]*?)\};/));
  const sbHdr   = keys(grab(/const SB_GRP_ICON=\{([\s\S]*?)\};/));

  T("كلا مُطبِّقَي أيقونات السايدبار موجود (التتالي قائم)",
    /function applyNavIcons\(/.test(HTML) && /function injectSidebarIcons\(/.test(HTML) &&
    navPage.size > 0 && sbPage.size > 0);

  const btns = [...new Set([...HTML.matchAll(/<button class="sidebar-nav-btn[^>]*?data-page="([^"]+)"/g)].map(m => m[1]))];
  const missP = btns.filter(p => !sbPage.has(p) && !navPage.has(p));
  T("★ كل زرّ سايدبار يجد أيقونته في أحد النظامين (لا إيموجي خام)",
    missP.length === 0, missP.join("، ") || `${btns.length} زرّاً`);

  const hdrs = [...new Set([...HTML.matchAll(/id="(hdr-grp-[a-z]+)"/g)].map(m => m[1]))];
  const missH = hdrs.filter(h => !sbHdr.has(h) && !navHdr.has(h));
  T("★ كل رأس مجموعة يجد أيقونته في أحد النظامين",
    missH.length === 0, missH.join("، ") || `${hdrs.length} مجموعة`);

  /* الصفحات التي أُضيفت في v18.9x تُسجَّل في نظامٍ واحد فقط — النظام الذي يصل
     فعلاً إليها. قيدٌ مُظلَّل (في NAV وSB معاً) لا يُنفَّذ أبداً، ولو خالف الغالب
     صار فخّاً: يقرؤه من يصحّح عطلاً فيظنّه المصدر. (التظليل القائم في الخريطة
     منذ v9hd متروك كما هو — تنظيفه تغييرٌ في مشتركٍ خارج نطاق هذا العمل.) */
  const mine = ["hr-payments", "new-hr-payment", "finance-audit", "errors"];
  const shadowed = mine.filter(p => sbPage.has(p) && navPage.has(p));
  T("★ صفحات v18.9x مسجّلة في نظامٍ واحد لا في الاثنين (لا قيد مُظلَّل)",
    shadowed.length === 0, shadowed.join("، ") || "نظيفة");
  T("★ الصفحتان اللتان كانتا بإيموجي خام صارتا مغطّاتين",
    ["finance-audit", "errors"].every(p => sbPage.has(p) || navPage.has(p)));

  // كل اسم أيقونة مُشار إليه معرَّف في مجموعة مفرداته — وإلا رُسم فراغاً
  const iconSet = (from, to) => new Set([...HTML.slice(HTML.indexOf(from), HTML.indexOf(to))
    .matchAll(/(?:^|[{,\n])\s*([A-Za-z0-9_]+)\s*:\s*['"`]/g)].map(m => m[1]));
  const ICON = iconSet("const _ICON", "function _ic(");
  const SBP  = iconSet("const SB_ICON_PATHS=", "function SVIC(");
  const refs = (re, set) => [...new Set([...grab(re).matchAll(/:\s*['"]([A-Za-z0-9]+)['"]/g)].map(m => m[1]))]
    .filter(n => !set.has(n));
  const ghostNav = refs(/const NAV_ICON_BY_PAGE = \{([\s\S]*?)\};/, ICON)
    .concat(refs(/const NAV_ICON_BY_HDR = \{([\s\S]*?)\};/, ICON));
  const ghostSb  = refs(/const SB_PAGE_ICON=\{([\s\S]*?)\};/, SBP)
    .concat(refs(/const SB_GRP_ICON=\{([\s\S]*?)\};/, SBP));
  T("★ كل أيقونة مُشار إليها معرَّفة في مفرداتها (لا أيقونة تُرسَم فراغاً)",
    ghostNav.length === 0 && ghostSb.length === 0,
    [...ghostNav.map(x => "NAV:" + x), ...ghostSb.map(x => "SB:" + x)].join("، ") || "سليمة");

  T("زرّ الخروج تُطبَّق أيقونته بمعرّفه (لا يطاله مسار data-page)",
    /id="sidebar-logout-btn"/.test(HTML) && /_svgIcon\('logout'\)/.test(HTML) &&
    /btn\.id==="sidebar-logout-btn"\) name="logout"/.test(HTML));
}

/* ── لغة التصميم: الوحدة تستعير مكوّنات المنصة ولا تخترع بديلاً ──
     العطل الذي تمنعه هذه الحرّاس ليس بصرياً وحده: صفحةٌ بمفرداتٍ خاصة تنحرف عن
     المنصة مع كل تحديثٍ للتوكنز (الثيم الداكن أولاً)، وتُجبر المستخدم على تعلّم
     شكلٍ ثانٍ لنفس المعنى. */
  var _hrpUses = function(cls){ return src.indexOf(cls) >= 0; };
  T("★ تستعمل مكوّنات المنصة لا بدائل خاصة (هيرو/بطاقة/نموذج/تفاصيل/خط زمني)",
    ["page-hero","card-title","form-group","form-label","form-row","d-hero","d-facts",
     "d-sec-label","d-grid","d-item","dtl-item","dtl-dot","stat-tile","st-val","desc-box"].every(_hrpUses));
  T("★ شريط المراحل هو شريط سير عمل المشتريات نفسه (po-wf/po-step/po-link)",
    ["po-wf","po-wf-track","po-step","ps-ico","ps-l","po-link","po-wf-tag"].every(_hrpUses));
  T("★ الشارات شارات المنصة (badge b-po-*) لا صنفٌ ثالث",
    /class="badge '\+m\.cls\+'/.test(src) && ["b-po-approval","b-po-ceo","b-po-closed","b-po-rejected"].every(_hrpUses) &&
    src.indexOf("status-badge") < 0);
  T("★ الأيقونات من مجموعة أيقونات المنصة لا إيموجي في متن الصفحة",
    /function _icon\([\s\S]{0,120}_ic\(/.test(src) && /function _svg\([\s\S]{0,120}_svgIcon\(/.test(src));
  {
    // ورقة أنماط الوحدة لا تعيد تعريف أي مكوّنٍ للمنصة — تعرّف ما لا نظير له فقط.
    var cssA = src.indexOf("st.textContent="), cssB = src.indexOf("document.head.appendChild(st)", cssA);
    var css  = cssA >= 0 ? src.slice(cssA, cssB) : "";
    var owned = (css.match(/'\.[a-z][a-z0-9-]*/g) || []).map(function(x){ return x.slice(1); });
    var strays = owned.filter(function(c){ return c.indexOf(".hrp-") !== 0; });
    T("★ لا تعيد تعريف مكوّنات المنصة في ورقتها (كل أصنافها .hrp-*)",
      strays.length === 0, strays.join("، ") || "نظيفة");
    T("ورقة أنماط الوحدة صغيرة (تستعير ولا تبني نظاماً ثانياً)",
      owned.length <= 14, owned.length + " صنفاً");
  }
  /* مرحلةٌ منجَزة لا تكون «حالية»: قاعدة .po-step.active تلي .done في ورقة المنصة
     فتغلبها — والطلب المغلق كان يظهر بمرحلة «إغلاق» جارية كأنه ينتظر. رُصد بلقطة شاشة. */
  T("★ مرحلة منجَزة لا تُرسَم «جارية» (المغلق لا يبدو منتظِراً)",
    /var active=\(effIdx===i\) && !done;/.test(src));
  // وحدة العملة تتبع اتجاه الصفحة والرقم وحده معزول LTR — كما في بطاقة طلب الشراء.
  T("مبلغ البطاقة لا يقلب اتجاه وحدة العملة", !/\.hrp-card-amt\{[^}]*direction:ltr/.test(src));

  /* زرّ السايدبار يقصد «القائمة» دائماً: بلا تصفير _curId كان showPage يعيد رسم
     تفاصيل آخر طلبٍ فُتح — وأوضحُ ظهورٍ لذلك بعد إنشاء طلبٍ جديد (يُفتح تفصيله)،
     فيبدو الزرّ معطّلاً. رُصد في رحلة متصفّح فعلية. */
  T("★ زرّ قائمة السداد يفتح القائمة لا تفاصيل آخر طلب",
    HTML.includes("hrPayments.list()") && typeof HR.list === "function" &&
    /function list\(\)\{\s*_curId=null;/.test(src));

  hrPaymentNotificationTests(src);
}

/* ════════════════════════════════════════════════════════════════════
   وصولُ إشعارات سداد الموارد البشرية للمسؤولين — بلّغ المالك: «لا تصل».
   ثلاث قنوات، كانت الثلاثُ مقطوعةً عن هذه الوحدة:
   (أ) جرسُ التطبيق — `startNotifSync` لم تكن تُستدعى في الوضع المركزي أصلاً،
       وأدوارُ الاعتماد (المالية/الموارد البشرية) تدخل منه حصراً.
   (ب) التنبيهُ اللحظي (HailNotify) — للبلاغات والشراء فقط.
   (ج) واتساب — لا مشغّل خادميّ للمجموعة إطلاقاً.
   هذه الحرّاس تمنع ارتدادَ كلٍّ منها.
   ════════════════════════════════════════════════════════════════════ */
function hrPaymentNotificationTests(src) {
  H("وصول إشعارات سداد الموارد البشرية (جرس · توست · واتساب)");

  const rd = f => { const q = path.resolve(path.dirname(IDX), f); return fs.existsSync(q) ? fs.readFileSync(q, "utf8") : ""; };

  /* ── (أ) جرسُ التطبيق يُزامَن في الوضع المركزي أيضاً ── */
  const _og = HTML.indexOf("async function openGlobalPurchases");
  const ogSrc = _og >= 0 ? HTML.slice(_og, HTML.indexOf("function exitGlobalPurchases", _og)) : "";
  T("openGlobalPurchases مستخرَجة", !!ogSrc);
  T("★★ الجرس يُزامَن في الوضع المركزي (جذر «الإشعارات لا تصل للمسؤولين»)",
    ogSrc.includes("startNotifSync();"));
  T("★ ولا يزال يُزامَن عند دخول مشروع (لم نستبدل موضعاً بموضع)",
    (HTML.match(/^\s*startNotifSync\(\);/gm) || []).length >= 2);
  T("★ startNotifSync تفكّ مستمعها القديم قبل التركيب (استدعاؤها من مسارين آمن)",
    /function startNotifSync\(\)\{[\s\S]{0,200}?if\(_notifUnsub\)\{ _notifUnsub\(\); _notifUnsub=null; \}/.test(HTML));

  /* ── (ب) التنبيه اللحظي — لمن دورُه الآن وحده ── */
  const hnSrc = rd("HailNotify.js");
  T("HailNotify يعرف نوع «سداد موارد بشرية»",
    /KICKERS = \{[^}]*hr: "سداد موارد بشرية"/.test(hnSrc) &&
    /ICONS = \{[\s\S]*?\n\s*hr:\s*'/.test(hnSrc) && /hr:\s*\{ accent:/.test(hnSrc));
  T("★ لقطةُ المزامنة تمرّ على _liveToast", /_liveToast\(_reqs\);/.test(src));
  T("★ اللقطة الأولى خط أساس صامت (لا سيلَ تنبيهاتٍ عند كل دخول)",
    /_hnPrev=cur;\s*\n\s*if\(prev===null\) return;/.test(src));
  T("★ لا تنبيه إن لم تتغيّر الحالة", /if\(!r \|\| prev\[r\.id\]===r\.status\) return;/.test(src));
  T("★ من نقل الحالة بنفسه لا يُنبَّه بفعله",
    /if\(_lastActor\(r\)===_me\(\)\) return;/.test(src));
  T("★ التنبيه لمن دورُه الآن وحده (نفس منطق عدّاد السايدبار)",
    /function _awaitsMe\(r\)\{/.test(src) &&
    /if\(r\.status==="hrp_pending_pm"\)\s*return canPM\(\);/.test(src) &&
    /if\(r\.status==="hrp_pending_ceo"\)\s*return canCEO\(\);/.test(src) &&
    /if\(r\.status==="hrp_pending_finance"\) return canFinance\(\);/.test(src));
  T("النقر على التوست يفتح الطلب", /type:"hr"[\s\S]{0,320}?onClick:function\(\)\{ try\{ open\(r\.id\); \}/.test(src));

  /* ── (ج) الخادم: مشغّلٌ لمجموعة السداد ── */
  const cfgSrc = rd("functions/lib/config.js");
  const hrpSrc = rd("functions/lib/hr-payments.js");
  const fnSrc = rd("functions/index.js");
  const recSrc = rd("functions/lib/recipients.js");
  T("وحدة توجيه السداد موجودة على الخادم", !!hrpSrc && /function routeHrPayment\(/.test(hrpSrc));
  T("★★ مشغّلا Firestore منشوران للمجموعة (إنشاءً وتحديثاً)",
    /exports\.hrpRouteUpdate = onDocumentUpdated\(\s*`\$\{cfg\.HR_PAYMENTS_COLLECTION\}\/\{hrpId\}`/.test(fnSrc) &&
    /exports\.hrpRouteCreate = onDocumentCreated\(\s*`\$\{cfg\.HR_PAYMENTS_COLLECTION\}\/\{hrpId\}`/.test(fnSrc) &&
    /require\("\.\/lib\/hr-payments"\)/.test(fnSrc));
  T("المجموعة الافتراضية = global_hr_payments (نفس ما تكتبه الواجهة)",
    /HR_PAYMENTS_COLLECTION =\s*\n?\s*process\.env\.WA_HR_PAYMENTS_COLLECTION \|\| "global_hr_payments"/.test(cfgSrc));
  T("★ القالب الافتراضي = قالبا الشراء المعتمَدان (تعمل الإشعارات لحظةَ النشر)",
    /approvalTemplate: process\.env\.WA_HRP_APPROVAL_TEMPLATE \|\| PO\.approvalTemplate/.test(cfgSrc) &&
    /statusTemplate: process\.env\.WA_HRP_STATUS_TEMPLATE \|\| PO\.statusTemplate/.test(cfgSrc));

  // خريطةُ التوجيه تطابق حالاتِ الوحدة حرفياً — لا رمزَ حالةٍ يفترق بصمت فيسقط الإشعار.
  const routeKeys = (cfgSrc.match(/^\s{2}(hrp_[a-z_]+): \{ role:/gm) || [])
    .map(l => l.trim().split(":")[0]);
  T("★★ كل مرحلةِ انتظارٍ في الوحدة لها مستلمٌ في خريطة الخادم",
    ["hrp_pending_pm", "hrp_pending_ceo", "hrp_pending_finance"].every(k => routeKeys.includes(k)) &&
    routeKeys.length === 3, routeKeys.join(" · "));
  T("★ الأدوار مطابقة لبوّابات الوحدة (مدير المشاريع · التنفيذي · المالية)",
    /hrp_pending_pm: \{ role: "project_manager"/.test(cfgSrc) &&
    /hrp_pending_ceo: \{ role: "ceo"/.test(cfgSrc) &&
    /hrp_pending_finance: \{ role: "finance"/.test(cfgSrc));
  T("★ صاحب الطلب يُنبَّه بالرفض والإعادة والإغلاق — لا بإلغائه هو",
    /HRP_NOTIFY_REQUESTER = new Set\(\[\s*"hrp_pm_rejected",\s*"hrp_ceo_rejected",\s*"hrp_finance_returned",\s*"hrp_closed",\s*\]\)/.test(cfgSrc) &&
    !/HRP_NOTIFY_REQUESTER[\s\S]{0,200}hrp_cancelled/.test(cfgSrc));

  // تسميات نوعية العمل نسختان (واجهة/خادم) — الحارس يمنع انحرافهما.
  const uiKeys = (src.match(/\{k:"([a-z_]+)",\s*l:/g) || []).map(m => m.match(/k:"([a-z_]+)"/)[1]);
  const srvKeys = Object.keys(
    (function () {
      const m = cfgSrc.match(/const HRP_WORK_TYPES = \{([\s\S]*?)\n\};/);
      const out = {};
      if (m) (m[1].match(/^\s{2}([a-z_]+):/gm) || []).forEach(l => { out[l.trim().replace(":", "")] = 1; });
      return out;
    })()
  );
  T("★ مفاتيح نوعية العمل متطابقة بين الوحدة والخادم",
    uiKeys.length >= 9 && uiKeys.every(k => srvKeys.includes(k)) && srvKeys.every(k => uiKeys.includes(k)),
    "واجهة=" + uiKeys.length + " · خادم=" + srvKeys.length);

  // مطابقةُ صاحب الطلب: الوحدة تخزّن الاسمَ المعروض في createdBy واسمَ الدخول في createdByUser.
  T("★ findRequester تطابق createdByUser أيضاً (وإلّا لم يُعرَف صاحب طلب السداد)",
    /const ids = \[po\.createdByUser, po\.createdBy\]\.filter\(Boolean\)/.test(recSrc) &&
    /ids\.includes\(String\(x\.user\)\) \|\| ids\.includes\(String\(x\.name\)\)/.test(recSrc));
  /* الرقمُ يُخزَّن في موضعين حسب الشاشة: «إدارة مستخدمي المشتريات» تُزامن المركزيَّ،
     ولوحةُ الأدمن داخل المشروع كانت تكتب في مستند المشروع وحده. توجيهُ الشراء يقرأ
     الاثنين فلا يتأثّر، وحدثُ السداد بلا مشروعٍ فمرجعُه المركزي ⇒ كان مستخدمٌ بعينه
     تصله رسائلُ الشراء ولا تصله رسائلُ السداد. الحارسان يمنعان عودةَ الفرق. */
  T("★★ المستلمون: المركزيُّ أوّلاً ثم مستنداتُ المشاريع (لا رقمَ يضيع بحسب شاشة إدخاله)",
    /findByRoleAnywhere\(db, route\.role\)/.test(hrpSrc) &&
    /findRequesterAnywhere\(db, after\)/.test(hrpSrc) &&
    /async function findByRoleAnywhere\(db, role, _noFallback\)/.test(recSrc) &&
    /async function findRequesterAnywhere\(db, po\)/.test(recSrc));
  T("★ ولا تُمسح مستنداتُ المشاريع إلا عند خلوّ المركزيّ، وبسقفٍ صريح",
    /const central = await findByRole\(db, role, "", true\);\s*\n\s*if \(central\.length\) return central;/.test(recSrc) &&
    /const MAX_PROJECT_DOCS = 25;/.test(recSrc) &&
    (recSrc.match(/projects\.slice\(0, MAX_PROJECT_DOCS\)/g) || []).length === 2);
  T("★★ ولوحةُ الأدمن داخل المشروع تُزامن الرقمَ مركزياً كشاشة المشتريات",
    /async function adminSaveUserWa[\s\S]{0,1400}?await _upsertUserCentral\(u\)/.test(HTML) &&
    /async function puSaveUserWa[\s\S]{0,1400}?await _upsertUserCentral\(u\)/.test(HTML));
  T("★ منعُ التكرار يحمل طابعَ الكتابة (occurrence) — فالرفضُ المتكرّر يصل ثانيةً",
    /const occurrence = String\(after\.updatedAt \|\| after\.createdAt \|\| ""\);/.test(hrpSrc) &&
    (hrpSrc.match(/transition, occurrence \}/g) || []).length === 2);
  T("★ لا مبالغ في نصّ الرسالة (خصوصية — كقاعدة الشراء)",
    !/after\.amount/.test(hrpSrc) && !/amount/.test(hrpSrc));
  /* ولا البيانُ المختصر: نصٌّ حرٌّ قد يحمل اسمَ موظّف («تجديد إقامة فلان»)، وقاعدةُ
     الوحدة أن الإشعارات بلا أسماء موظفين (كما في `_notifyStage`). */
  T("★★ ولا البيانُ المختصر (قد يحمل اسمَ موظّف — الإشعارات بلا أسماء)",
    !/\.title/.test(hrpSrc));

  /* شكلُ المتغيّرات يتبع القالب: قالبُ الشراء المستعار ٥ خانات، والمخصّصُ ٤.
     عددٌ لا يطابق القالبَ ⇒ Meta ترفض الرسالة كلَّها — عطلٌ صامتٌ لا يظهر إلا بعد
     تبديل `.env`، أي بعد أسابيع من كتابة الكود. لذلك يُنفَّذ الشكلان هنا فعلاً. */
  const HRP_MOD = path.resolve(path.dirname(IDX), "functions", "lib", "hr-payments.js");
  if (!fs.existsSync(HRP_MOD)) { T("وحدة التوجيه الخادمية قابلة للتحميل", false); return; }
  const { approvalParams, statusParams } = require(HRP_MOD);
  const _sample = { id: "HRP-2608-0009", workType: "visa", createdBy: "مسؤول الموارد",
    createdByUser: "hr01", title: "تجديد إقامة موظّف" };
  T("★ على قالب الشراء المستعار: ٥ خانات، {{2}} تعوّض النصَّ الثابت و{{5}} = 1",
    JSON.stringify(approvalParams(_sample, "سدادك")) ===
    JSON.stringify(["سدادك", "الموارد البشرية — تأشيرات", "HRP-2608-0009", "مسؤول الموارد", "1"]),
    JSON.stringify(approvalParams(_sample, "سدادك")));
  T("★ وتحديثُ الحالة ثلاثُ خاناتٍ في القالبين",
    statusParams(_sample, "مغلق — تم السداد").length === 3);
  T("★★ ولا يتسرّب البيانُ المختصر إلى أي خانة",
    !JSON.stringify(approvalParams(_sample, "سدادك")).includes("تجديد إقامة موظّف") &&
    !JSON.stringify(statusParams(_sample, "مغلق")).includes("تجديد إقامة موظّف"));

  /* ولا النصُّ الحرُّ في «أخرى» — وهو **البيانُ المختصرُ باسمٍ آخر**: خانةٌ يكتبها
     المستخدمُ بحرّيةٍ فتحمل اسمَ موظّفٍ بالسهولة نفسِها. وكانت `workTypeLabel` الخادميةُ
     تُرجعه حرفياً في {{2}}، فالقاعدةُ محروسةٌ في بابٍ ومفتوحةٌ في بابٍ آخرَ يؤدّي إلى
     الجوّال نفسِه — ورُصد بتنفيذ الدالّتين لا بقراءتهما. والفرقُ ليس في السرّية بل في
     المدى: داخلَ النظام قارئُه صاحبُ صلاحية، والرسالةُ تخرج وتبقى في سجلّ محادثةٍ. */
  {
    const _free = { id: "HRP-2608-0010", workType: "other",
      workTypeOther: "تجديد إقامة فلان الفلاني", createdBy: "مسؤول الموارد", createdByUser: "hr01" };
    const _both = JSON.stringify(approvalParams(_free, "سدادك")) + JSON.stringify(statusParams(_free, "مغلق"));
    T("★★ ولا النصُّ الحرُّ في «أخرى» يخرج في الرسالة — «أخرى» تبقى «أخرى»",
      !_both.includes("فلان") && _both.includes("أخرى"), _both);
    T("★ ولا خانةَ تفرغ بذلك (Meta ترفض الفارغة)",
      approvalParams(_free, "سدادك").every(p => String(p).trim().length > 0) &&
      statusParams(_free, "مغلق").every(p => String(p).trim().length > 0));
    /* وداخلَ النظام يبقى النصُّ كاملاً — الوحدةُ في المتصفّح لم تُمسّ. */
    T("★ والوحدةُ في المتصفّح ما زالت تعرضه كاملاً (لا تعميمَ القيد على العرض الداخلي)",
      /if\(req\.workType==="other"\) return \(req\.workTypeOther\|\|""\)\.trim\(\) \|\| w\.l;/.test(src));
  }
  T("★ والفرزُ بمطابقة القالب المضبوط لا بعَلَمٍ منفصلٍ يُنسى",
    /cfg\.HRP\.approvalTemplate === cfg\.PO\.approvalTemplate/.test(hrpSrc) &&
    /cfg\.HRP\.statusTemplate === cfg\.PO\.statusTemplate/.test(hrpSrc));

  /* والشكلُ الآخر — القالبُ المخصّص — **يُنفَّذ فعلاً** بضبط البيئة وإعادة تحميل الوحدة.
     هذا هو المسارُ الذي يستيقظ بعد أسابيع (يوم يعتمد Meta القالبَ ويُبدَّل `.env`)، وعطلُه
     صامتٌ تماماً: عددُ خاناتٍ لا يطابق القالبَ ⇒ Meta ترفض **كلَّ** رسائل السداد بلا أن
     يتغيّر سطرٌ في الكود. فحصُ نصٍّ لا يمسك ذلك — التنفيذ وحده يمسكه. */
  {
    const CFG_MOD = path.resolve(path.dirname(IDX), "functions", "lib", "config.js");
    const bak = {
      a: process.env.WA_HRP_APPROVAL_TEMPLATE,
      s: process.env.WA_HRP_STATUS_TEMPLATE,
    };
    process.env.WA_HRP_APPROVAL_TEMPLATE = "hrp_approval_needed";
    process.env.WA_HRP_STATUS_TEMPLATE = "hrp_status_update";
    delete require.cache[require.resolve(CFG_MOD)];
    delete require.cache[require.resolve(HRP_MOD)];
    const alt = require(HRP_MOD);
    const ap = alt.approvalParams(_sample, "سدادك");
    const st = alt.statusParams(_sample, "مغلق — تم السداد");
    T("★★ على القالب المخصّص: أربعُ خاناتٍ بلا «عدد البنود»",
      ap.length === 4 && JSON.stringify(ap) ===
      JSON.stringify(["سدادك", "تأشيرات", "HRP-2608-0009", "مسؤول الموارد"]),
      JSON.stringify(ap));
    T("★ و{{2}} = النوعُ وحدَه (نصُّ القالب يقول «موارد بشرية» فلا يُكرَّر)",
      ap[1] === "تأشيرات" && st[1] === "تأشيرات");
    T("★ وتحديثُ الحالة يبقى ثلاثَ خانات", st.length === 3);
    T("★ ولا بيانٌ مختصرٌ هنا أيضاً",
      !JSON.stringify([ap, st]).includes("تجديد إقامة موظّف"));
    // أعِد البيئة والكاش كما كانا — بقيةُ الفحوص تتوقّع الافتراضَ (قالبَ الشراء).
    if (bak.a === undefined) delete process.env.WA_HRP_APPROVAL_TEMPLATE; else process.env.WA_HRP_APPROVAL_TEMPLATE = bak.a;
    if (bak.s === undefined) delete process.env.WA_HRP_STATUS_TEMPLATE; else process.env.WA_HRP_STATUS_TEMPLATE = bak.s;
    delete require.cache[require.resolve(CFG_MOD)];
    delete require.cache[require.resolve(HRP_MOD)];
    const back = require(HRP_MOD);
    T("★ واستعادةُ الافتراض بعد الفحص (لا تسرّبَ بيئةٍ لبقية الفحوص)",
      back.approvalParams(_sample, "سدادك").length === 5);
  }

  /* ── التوجيه يُنفَّذ فعلاً على محاكي Firestore ──
     الفحوص النصّية أعلاه تحرس الشكل؛ هذه تحرس السلوك: من يصله ماذا، ومتى لا يصل أحداً.
     الوحدة الخادمية نقيّةٌ من firebase-admin (تأخذ db حقناً)، فتُنفَّذ هنا كما هي. */
  const { routeHrPayment } = require(HRP_MOD);

  const _users = [
    { user: "pm01", name: "مدير المشاريع", role: "project_manager", phone: "0501111111", waOptIn: true },
    { user: "ceo01", name: "التنفيذي", role: "ceo", phone: "0502222222", waOptIn: true },
    { user: "fin01", name: "المالية", role: "finance", phone: "0503333333", waOptIn: true },
    { user: "hr01", name: "مسؤول الموارد", role: "hr_officer", phone: "0504444444", waOptIn: true },
    { user: "wh01", name: "المستودع", role: "warehouse_manager", phone: "0505555555", waOptIn: true },
    { user: "ceo02", name: "تنفيذيٌّ بلا موافقة", role: "ceo", phone: "0506666666", waOptIn: false },
  ];
  const out = [];
  const fakeDb = {
    doc: p => ({ get: async () => ({ exists: p === "meta/users", data: () => ({ users: _users }) }) }),
    collection: () => ({
      doc: id => ({
        create: async d => {
          if (out.some(x => x.__id === id)) { const e = new Error("already exists"); e.code = 6; throw e; }
          out.push({ __id: id, ...d });
        },
      }),
    }),
  };
  const deps = { db: fakeDb, logger: { info() { }, warn() { }, error() { } }, isEnabled: async () => true };
  const REQ = {
    id: "HRP-2608-0007", workType: "residency", title: "تجديد ٤ إقامات", amount: 8400,
    createdBy: "مسؤول الموارد", createdByUser: "hr01", createdAt: "2026-08-09T07:00:00Z",
  };
  const at = (status, updatedAt) => ({ ...REQ, status, updatedAt });

  // تُنفَّذ المسارُ كاملاً تسلسلياً ثم تُفحص اللقطة — الدوالُّ async والفحوصُ متزامنة.
  const trace = [];
  const run = (async () => {
    const step = async (before, after, label) => {
      const n = out.length;
      await routeHrPayment(before, after, deps);
      trace.push({ label, sent: out.slice(n) });
    };
    await step(null, at("hrp_pending_pm", "t1"), "create");
    await step(null, at("hrp_pending_pm", "t1"), "replay");                                  // إعادة إطلاق
    await step(at("hrp_pending_pm"), at("hrp_pending_ceo", "t2"), "toCeo");
    await step(at("hrp_pending_ceo"), at("hrp_pending_finance", "t3"), "toFinance");
    await step(at("hrp_pending_finance"), at("hrp_pending_finance", "t4"), "noStatusChange");
    await step(at("hrp_pending_finance"), at("hrp_finance_returned", "t5"), "returned");
    await step(at("hrp_finance_returned"), at("hrp_pending_finance", "t6"), "resent");
    await step(at("hrp_pending_finance"), at("hrp_finance_returned", "t7"), "returnedAgain");
    await step(at("hrp_pending_finance"), at("hrp_closed", "t8"), "closed");
    await step(at("hrp_pending_pm"), at("hrp_cancelled", "t9"), "cancelled");
    await routeHrPayment(at("hrp_pending_pm"), at("hrp_pending_ceo", "tX"),
      { ...deps, isEnabled: async () => false });
    trace.push({ label: "killSwitch", sent: [] });
  })();

  // التوجيه async — نسجّل فحوصَه في `_deferred` ليُنتظر قبل طباعة الحصيلة.
  _deferred.push(run.then(() => {
    const of = l => (trace.find(x => x.label === l) || { sent: [] }).sent;
    T("★★ الإنشاء يُنبّه مدير المشاريع وحده — على جواله لا في جرسٍ لا يفتحه",
      of("create").length === 1 && of("create")[0].to === "0501111111",
      of("create").map(m => m.to).join(",") || "لا شيء");
    T("★ نصُّ الرسالة: الإجراء · السياق · الرقم · المُقدِّم · بندٌ واحد",
      JSON.stringify((of("create")[0] || {}).params) ===
      JSON.stringify(["موافقتك", "الموارد البشرية — إقامات", "HRP-2608-0007", "مسؤول الموارد", "1"]),
      JSON.stringify((of("create")[0] || {}).params));
    T("★ زرّ «فتح الطلب» يحمل معرّف HRP", (of("create")[0] || {}).buttonParam === "HRP-2608-0007");
    T("★ لا مبلغ في الرسالة", !JSON.stringify(of("create")).includes("8400"));
    T("★★ إعادةُ إطلاق نفس الكتابة لا تُرسل مرتين", of("replay").length === 0);
    T("★ بعد اعتماد المدير يُنبَّه التنفيذي",
      of("toCeo").length === 1 && of("toCeo")[0].to === "0502222222" && of("toCeo")[0].params[0] === "اعتمادك");
    T("★ تنفيذيٌّ بلا waOptIn لا تصله رسالة", !of("toCeo").some(m => m.to === "0506666666"));
    T("★ ثم تُنبَّه المالية بالسداد",
      of("toFinance").length === 1 && of("toFinance")[0].to === "0503333333" && of("toFinance")[0].params[0] === "سدادك");
    T("★ تغيّرُ حقلٍ بلا تغيّر حالة لا يُرسل شيئاً", of("noStatusChange").length === 0);
    T("★★ الإعادة للتصحيح تصل صاحب الطلب (مطابقةً على createdByUser)",
      of("returned").length === 1 && of("returned")[0].to === "0504444444" &&
      of("returned")[0].params[2] === "مُعاد من المالية للتصحيح",
      JSON.stringify((of("returned")[0] || {}).params));
    T("★★ إعادةٌ ثانيةٌ بنفس الانتقال تصل ثانيةً (لا تُبتلع كتكرار — M14)",
      of("returnedAgain").length === 1);
    T("★ الإغلاق يصل صاحب الطلب وحده",
      of("closed").length === 1 && of("closed")[0].to === "0504444444" &&
      of("closed")[0].params[2] === "مغلق — تم السداد");
    T("★ الإلغاء (فعلُ صاحبه) لا يُشعِر أحداً", of("cancelled").length === 0);
    T("★ مفتاح القتل العام يوقف إرسال السداد أيضاً", of("killSwitch").length === 0);
    T("★★ لا تصل بيانات الموارد البشرية للمستودع ولا للمشتريات",
      !out.some(m => m.to === "0505555555"));
  }));

  /* السيناريو الثاني: **لا مستخدمين في المركزي إطلاقاً** — الأرقام كلُّها أُدخلت من لوحة
     الأدمن داخل مشروع. هذه هي الحالة التي كانت تُسقط رسائلَ السداد صامتةً. */
  const out2 = [];
  const projDb = {
    doc: p => ({
      get: async () => {
        if (p === "meta/projects") return { exists: true, data: () => ({ projects: [{ id: "hail" }, { id: "bathroom001" }] }) };
        if (p === "meta/bathroom001_users") return { exists: true, data: () => ({ users: _users }) };
        return { exists: false, data: () => ({}) };   // المركزيُّ غائبٌ تماماً
      },
    }),
    collection: () => ({
      doc: id => ({
        create: async d => {
          if (out2.some(x => x.__id === id)) { const e = new Error("already exists"); e.code = 6; throw e; }
          out2.push({ __id: id, ...d });
        },
      }),
    }),
  };
  _deferred.push((async () => {
    const d2 = { ...deps, db: projDb };
    await routeHrPayment(null, at("hrp_pending_finance", "p1"), d2);
    T("★★ رقمٌ أُدخل من لوحة المشروع (المركزيُّ خالٍ) تصله رسالةُ السداد أيضاً",
      out2.length === 1 && out2[0].to === "0503333333", out2.map(m => m.to).join(",") || "لا شيء");
    await routeHrPayment(at("hrp_pending_finance"), at("hrp_finance_returned", "p2"), d2);
    T("★ وصاحبُ الطلب كذلك يُوجَد في مستند المشروع",
      out2.length === 2 && out2[1].to === "0504444444", out2.map(m => m.to).join(","));
  })());

  /* ── الرابط العميق: زرّ «فتح الطلب» يوصل لوحدة السداد لا لقائمة المشتريات ── */
  T("★★ معرّف HRP- يوجّه الرابط العميق لوحدة السداد",
    /function _isHrpId\(id\)\{ return \/\^HRP-\/i\.test\(String\(id\|\|""\)\); \}/.test(HTML) &&
    /if\(_isHrpId\(poId\)\) return _openPendingHRP\(\);/.test(HTML) &&
    /window\.hrPayments\.open\(id\)/.test(HTML));
  T("★ الرابط يقبل ?hrp= أيضاً", /q\.get\("po"\) \|\| q\.get\("hrp"\)/.test(HTML));
  T("★ غير المخوَّل لا يُفتح له الطلب من الرابط",
    /_openPendingHRP[\s\S]{0,400}?hrPayments\.canView\(\)\)\{/.test(HTML));
  /* ارتدادٌ محتمَل: الرابطُ يصل قبل لقطةِ الوحدة ⇒ `render` يُسقط `_curId` ويعرض القائمة،
     فيضيع المقصودُ بصمت. الانتظارُ المحدود يفتحه فورَ وصوله ويعلن الفشلَ إن لم يصل. */
  T("★★ الرابط ينتظر وصولَ لقطة الوحدة ثم يفتح الطلب (بحدٍّ زمنيٍّ صريح)",
    /if\(window\.hrPayments\.byId && window\.hrPayments\.byId\(id\)\) return _open\(\);/.test(HTML) &&
    /if\(\+\+_t>40\)\{ clearInterval\(_timer\);/.test(HTML) &&
    /clearInterval\(_timer\); _open\(\);/.test(HTML));
}

/* ════════════════════════════════════════════════════════════════════
   وحدة الرقابة المالية على المشتريات (finance-audit.js) — v18.9wk
   تركيبٌ صحيح في index.html + حتمية العينة العشوائية + أعلام الإدراج الآلي
   + مقارنة البنود بالمرجع (دوال نقية تُنفَّذ فعلاً).
   ════════════════════════════════════════════════════════════════════ */
function financeAuditTests() {
  H("وحدة الرقابة المالية على المشتريات (finance-audit.js)");
  if (!FA_PATH) { T("finance-audit.js موجود", false); return; }
  const src = fs.readFileSync(FA_PATH, "utf8");
  const vm = require("vm");
  try { new vm.Script(src); T("صياغة finance-audit.js سليمة", true); }
  catch (e) { T("صياغة finance-audit.js سليمة", false, String(e.message).slice(0, 120)); return; }

  // ── نقاط الربط في index.html ──
  T("الوسم موجود في index.html", /<script src="finance-audit\.js\?v=/.test(HTML));
  T("زر القائمة الجانبية موجود (مخفي افتراضياً — تُظهره الوحدة للمخوَّلين)",
    HTML.includes('data-page="finance-audit"') && HTML.includes('id="nav-finance-audit-btn"'));
  T("حاوية الصفحة موجودة", HTML.includes('id="page-finance-audit"'));
  T("showPage يرسم الوحدة", HTML.includes('id==="finance-audit"') && HTML.includes("window.financeAudit.render"));
  T("تُشغَّل مع بقية الوحدات (startSync)", HTML.includes("window.financeAudit.startSync"));
  T("تُعاد رسمها مع مستمع الطلبات (تقرأ المغلق والتاريخ الشرائي)",
    /page-finance-audit"\)&&document\.getElementById\("page-finance-audit"\)\.classList\.contains\("active"\)\s*&& window\.financeAudit && window\.financeAudit\.render\) window\.financeAudit\.render\(\);/.test(HTML));
  T("الصفحة ضمن مجموعة المشتريات في pageGroupMap", HTML.includes('"finance-audit":"grp-po"'));
  T("مسجّلة في كاشف الوحدات القديمة (REG)",
    HTML.includes('{name:"finance-audit.js", get:function(){ return window.financeAudit; }}'));

  // ── بصمة البناء تطابق الإصدار (نفس حارس cleaning-operations — v18.9vl) ──
  const faBuild = (src.match(/var MODULE_BUILD = "(v[\d.a-z]+)"/) || [])[1];
  T("★ MODULE_BUILD في finance-audit.js يطابق APP_VERSION (يُرفَعان معاً)",
    faBuild === VER, `MODULE_BUILD=${faBuild}  APP_VERSION=${VER}`);
  T("الوحدة تُصدّر build على واجهتها العامة", /build:MODULE_BUILD/.test(src));

  // ── تحميل الوحدة فعلياً واختبار الدوال النقية ──
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  try { vm.runInContext(src, sandbox); } catch (e) { T("تُحمَّل الوحدة", false, String(e.message).slice(0, 120)); return; }
  const FA = sandbox.window.financeAudit;
  T("تعرّض window.financeAudit والدوال النقية",
    FA && ["_pickSample", "_autoFlags", "_itemBench", "_norm", "_monthKey", "_prevMonthKey", "_poClosedAtISO", "_unitNet"].every(k => typeof FA[k] === "function"));
  if (!FA || typeof FA._pickSample !== "function") return;

  // ── التطبيع العربي: «مواد نظافة» ≡ «مواد  نظافه» ≡ «مَوَاد نظافة» ──
  T("التطبيع: تاء مربوطة/همزة/تشكيل/مسافات لا تفرّق بين الاسمين",
    FA._norm("مواد نظافة") === FA._norm("مواد  نظافه") &&
    FA._norm("أسمنت مقاوم") === FA._norm("اسمنت مقاوم") &&
    FA._norm("مَوَاد نظافة") === FA._norm("مواد نظافه"));

  // ── حتمية العينة: نفس المدخلات ⇒ نفس العينة مهما تكرر السحب أو تغيّر ترتيب الإدخال ──
  const pool30 = Array.from({ length: 30 }, (_, i) => ({ id: "PO-" + String(1000 + i), cost: (i + 1) * 500 }));
  const p1 = FA._pickSample(pool30, { pct: 10, min: 3, max: 10, seed: "2026-07|test" });
  const p2 = FA._pickSample(pool30, { pct: 10, min: 3, max: 10, seed: "2026-07|test" });
  const shuffled = pool30.slice().reverse();
  const p3 = FA._pickSample(shuffled, { pct: 10, min: 3, max: 10, seed: "2026-07|test" });
  T("★ العينة حتمية: نفس البذرة ⇒ نفس الاختيار (لا «إعادة سحب»)",
    JSON.stringify(p1.picked) === JSON.stringify(p2.picked), p1.picked.join("، "));
  T("★ العينة مستقلة عن ترتيب الإدخال (فرز داخلي بالمعرّف)",
    JSON.stringify(p1.picked) === JSON.stringify(p3.picked));
  T("حجم العينة = ceil(10% من 30) = 3 ضمن [3..10]",
    p1.target === 3 && p1.picked.length === 3);
  const pDiff = FA._pickSample(pool30, { pct: 10, min: 3, max: 10, seed: "2026-08|test" });
  T("بذرة مختلفة (شهر آخر) ⇒ عينة مختلفة", JSON.stringify(p1.picked) !== JSON.stringify(pDiff.picked));
  // الحدود: أدنى 3 وأقصى 10 وقصر على حجم المرشّحين
  const small = [{ id: "A", cost: 1 }, { id: "B", cost: 2 }];
  const rs = FA._pickSample(small, { pct: 10, min: 3, max: 10, seed: "s" });
  T("عينة أصغر من الحد الأدنى تُقصَر على حجم المرشّحين", rs.picked.length === 2);
  const big = Array.from({ length: 500 }, (_, i) => ({ id: "P" + i, cost: 100 }));
  const rb = FA._pickSample(big, { pct: 10, min: 3, max: 10, seed: "s" });
  T("الحد الأقصى 10 يُحترم على 500 مرشّح", rb.picked.length === 10 && rb.target === 10);
  T("لا تكرار في العينة وكلها من المرشّحين",
    new Set(p1.picked).size === p1.picked.length && p1.picked.every(id => pool30.some(x => x.id === id)));
  // الترجيح بالقيمة: طلب قيمته ساحقة يظهر في كل عينات بذور متعددة
  const heavy = [{ id: "HEAVY", cost: 1e9 }].concat(Array.from({ length: 29 }, (_, i) => ({ id: "L" + i, cost: 1 })));
  const heavyIn = ["a", "b", "c", "d", "e"].every(s => FA._pickSample(heavy, { pct: 10, min: 3, max: 10, seed: s }).picked.includes("HEAVY"));
  T("★ الترجيح بالقيمة: الطلب الأغلى (وزن ساحق) يدخل العينة عبر بذور متعددة", heavyIn);

  // ── أعلام الإدراج الآلي (نقية من أرقام مجرّدة) ──
  const P = { bigLimit: 20000, estOverPct: 25, tolPct: 5, vat: 1.15 };
  T("★ over_quote: الفعلي تجاوز أرخص عرض (صافي×1.15×1.05)",
    FA._autoFlags(Object.assign({ actual: 13000, est: 0, quoteMin: 10000, hasComparison: true }, P)).includes("over_quote") &&
    !FA._autoFlags(Object.assign({ actual: 12000, est: 0, quoteMin: 10000, hasComparison: true }, P)).includes("over_quote"));
  T("★ over_estimate: الفعلي تجاوز التقدير بأكثر من 25%",
    FA._autoFlags(Object.assign({ actual: 12600, est: 10000, quoteMin: 0, hasComparison: true }, P)).includes("over_estimate") &&
    !FA._autoFlags(Object.assign({ actual: 12400, est: 10000, quoteMin: 0, hasComparison: true }, P)).includes("over_estimate"));
  T("★ no_compare_big: مبلغ عالٍ بلا أي مقارنة أسعار — ومع مقارنة لا يُعلَّم",
    FA._autoFlags(Object.assign({ actual: 25000, est: 0, quoteMin: 0, hasComparison: false }, P)).includes("no_compare_big") &&
    !FA._autoFlags(Object.assign({ actual: 25000, est: 0, quoteMin: 0, hasComparison: true }, P)).includes("no_compare_big") &&
    !FA._autoFlags(Object.assign({ actual: 15000, est: 0, quoteMin: 0, hasComparison: false }, P)).includes("no_compare_big"));
  T("طلب سليم بلا أعلام",
    FA._autoFlags(Object.assign({ actual: 9000, est: 10000, quoteMin: 9000, hasComparison: true }, P)).length === 0);

  // ── مقارنة البنود بالمرجع: مثال محسوب باليد ──
  // بندنا: 10 حبات بسعر وحدة 12 — أفضل مرجع لنفس الاسم (بتطبيع مختلف): 10 ⇒ وفر 20
  const bench = FA._itemBench(
    [{ name: "مواد نظافة", qty: 10, unit: 12 }, { name: "بند بلا مرجع", qty: 5, unit: 7 }],
    [
      { name: "مواد  نظافه", vendor: "المورد أ", unit: 10, src: "history", ref: "PO-1" },
      { name: "مواد نظافة", vendor: "المورد ب", unit: 11, src: "catalog", ref: "كتالوج" },
      { name: "مواد نظافة", vendor: "بلا سعر", unit: 0, src: "history", ref: "PO-2" },
    ], 5);
  T("★ أفضل بديل = الأرخص لنفس الاسم المطبّع (10 لا 11)، والوفر = (12−10)×10 = 20",
    bench.rows[0].best && bench.rows[0].best.unit === 10 && bench.rows[0].best.vendor === "المورد أ" &&
    bench.rows[0].saving === 20 && bench.totalSaving === 20,
    JSON.stringify({ best: bench.rows[0].best && bench.rows[0].best.unit, saving: bench.rows[0].saving }));
  T("سعر صفري في المرجع لا يُحتسب بديلاً", bench.rows[0].best.unit !== 0);
  T("بند بلا مرجع: لا بديل ولا وفر", bench.rows[1].best === null && bench.rows[1].saving === 0);
  T("تجاوز التسامح يُعلَّم (12 > 10×1.05)", bench.rows[0].overTol === true);

  // ── v18.9wm: طبقة العرض بلغة تصميم المنصة (طلب المستخدم) ──
  T("★ wm: جملة «هل كان هناك مورد أرخص» حُذفت من الواجهة (طلب المستخدم — لا تعود)",
    !src.includes("هل كان هناك مورد أرخص"));
  T("★ wm: هيرو page-hero وبطاقات stat-card من لغة النواة",
    src.includes('class="page-hero"') && src.includes('class="stat-card"') && src.includes('st.id="fa-css"'));
  T("★ wm: لا ألوان hex مثبّتة لحبوب الحالة/التنبيهات (توكنز الثيم عبر color-mix — لا تنكسر في الداكن)",
    !/#fef3c7|#dcfce7|#fee2e2|#dbeafe|#fef2f2|#fff7ed|#fecaca/.test(src) && src.includes("color-mix(in srgb,var(--pc"));

  // ── v18.9wn: حذف طلب من العينة (المسؤول فقط) + أسباب الإدراج ظاهرة نصاً ──
  T("★ wn: removeSample محروسة بالمسؤول وحده (حارس داخل الدالة لا إخفاء زر فقط)",
    /function removeSample\(poId\)\{\s*if\(!_isAdmin\(\)\)/.test(src) &&
    src.includes("window.financeAudit.removeSample(") && src.includes("_isAdmin() && open"));
  T("★ wn: حذف العينة يُقيَّد في سجل التدقيق ويُمنع على الدورة المغلقة",
    src.includes('"حذف طلب من عينة الرقابة المالية"') && /a\.status==="closed"[^}]*لا حذف بعد الإغلاق/.test(src));
  T("★ wn: أسباب الإدراج الآلي ظاهرة نصاً تحت الشارة (لا tooltip وحده — يعمل على اللمس)",
    src.includes("reasonsTxt") && src.includes("srcCell"));

  // ── v18.9wo: مؤشر تحميل + نافذة المراجعة بحجم نافذة تفاصيل الطلب ──
  T("★ wo: علم _loaded يمنع «لا توجد دورات» المضللة قبل أول لقطة (ويُرفع أيضاً عند خطأ المزامنة)",
    src.includes("if(!_loaded){") && src.includes("جارٍ تحميل بنود التدقيق") &&
    (src.match(/_loaded\s*=\s*true/g)||[]).length>=2);
  T("★ wo: نافذة المراجعة تتوسّع لحجم نافذة تفاصيل الطلب مع تمرير داخلي",
    src.includes("fa-modal-wide") && src.includes("max-width:min(1180px,96vw)!important") &&
    src.includes("max-height:92vh;overflow-y:auto") && src.includes("_widenModal();"));
  T("★ wo: دوّار التحميل يحترم prefers-reduced-motion وخلفية النافذة الموسّعة من توكن الثيم",
    src.includes("prefers-reduced-motion") && src.includes("background:var(--surface)!important"));

  // ── v18.9wp: مرفقات أدلة على العروض اليدوية (Storage) ──
  T("★ wp: رفع الدليل بنمط النواة (مصادقة + ضغط صورة + finance_audits/ + getDownloadURL)",
    src.includes("_waitForFirebaseAuth") && src.includes("_compressImage(file, 1800, 0.78)") &&
    src.includes('storage.ref("finance_audits/"') && src.includes("getDownloadURL()"));
  T("★ wp: فشل الرفع لا يضيف العرض (لا دليل وهمي) وحارس _mqBusy ضد النقر المزدوج",
    src.includes("لا يُضاف العرض بلا دليله المختار") && src.includes("if(_mqBusy) return;"));
  T("★ wp: رابط الدليل عبر safeUrl ويظهر في نافذتي الرد والإغلاق وتقرير الطباعة",
    src.includes("function _mqFileLink") && src.includes("safeUrl") &&
    (src.match(/_mqReadonlyHtml\(s\)/g)||[]).length>=2 && src.includes("📎 مرفق"));

  // ── v18.9wq: تسريع التحميل الأولي + حذف اسم مورد حقيقي من المثال ──
  T("★ wq: get() فوري يوازي onSnapshot (مصافحة Watch البطيئة لا تحجب المحتوى)",
    src.includes("db.collection(COLL()).get().then(function(snap){ if(!_loaded) _applySnap(snap); })") &&
    src.includes("_unsub = db.collection(COLL()).onSnapshot(_applySnap"));
  T("★ wq: مهلة أمان 8 ثوانٍ + رسالة اتصال صادقة مع إعادة المحاولة (لا دوّار أبدي ولا «لا دورات» مضللة)",
    src.includes("}, 8000);") && src.includes("_connIssue = true") &&
    src.includes("تعذّر تحميل بيانات التدقيق") && src.includes("retryLoad"));
  T("★ wq: اسم المورد الحقيقي «عالم الريتاج» حُذف من الأمثلة (لا يعود)",
    !src.includes("عالم الريتاج"));

  // ── v18.9wr: الفحص الوقائي عند إنشاء طلب الشراء ──
  T("★ wr: النواة تستدعي renderPrecheck بعد كل تعديل على بنود الطلب الجديد (محروساً) + الحاوية موجودة",
    HTML.includes('window.financeAudit.renderPrecheck(currentPurchaseItems,"np-precheck-host")') &&
    HTML.includes('id="np-precheck-host"'));
  T("★ wr: الفحص الوقائي يعيد استخدام محرك التدقيق نفسه (_itemBench + _refRowsAt بمركز «الآن»)",
    src.includes("function renderPrecheck") && src.includes("_itemBench(list, _refRowsAt(_now(), null), FA_TOL_PCT)") &&
    src.includes("function _refRowsAt(refISO, excludeId)"));
  T("★ wr: صامت عندما لا بديل أرخص يتجاوز التسامح (لا ضوضاء) واسترشادي لا يمنع الإرسال",
    src.includes("r.best && r.overTol") && src.includes("if(!hits.length){ host.innerHTML=\"\"; return; }") &&
    src.includes("قد يبرَّر الفرق بالجودة أو سرعة التوريد"));

  // ── v18.9ws: تحصين onclick بـ_jq + الذاكرة المحلية تُحدَّث مع كل معاملة ──
  T("★ ws: معاملات onclick النصية كلها عبر _jq لا esc (صنف ثغرة v18.9vu-H5 لا يعود)",
    src.includes("function _jq(s)") && src.includes("_jq(s.poId)") && src.includes("_jq(month)") &&
    !/onclick="[^"]*_esc\((?:s\.poId|month|a\.month)/.test(src));
  T("★ ws: كل معاملة تُحدّث الذاكرة المحلية فوراً (closeAudit لا يُرفض ظلماً بانتظار اللقطة)",
    src.includes("function _applyLocalDoc") &&
    src.includes(".then(function(next){ _applyLocalDoc(month, next); return next; });"));
  T("★ ws: الإدراج المتفائل للإنشاء من نفس المصدر (_applyLocalDoc — لا نسختين)",
    src.includes("_applyLocalDoc(month, doc);") &&
    !src.includes("_audits.unshift(Object.assign({id:month}, doc))"));

  // ── مفاتيح الشهور (بلا مُعدِّلات Date — درس v18.9vt) ──
  T("مفتاح الشهر من ISO", FA._monthKey("2026-07-15T10:00:00Z") === "2026-07");
  T("الشهر السابق يعبر حدود السنة", FA._prevMonthKey("2026-01") === "2025-12" && FA._prevMonthKey("2026-08") === "2026-07");

  // ── لحظة الإغلاق الفعلي من timeline ──
  const po = { timeline: [
    { code: "pending_pm", at: "2026-07-01T08:00:00Z" },
    { code: "closed", at: "2026-07-20T08:00:00Z" },
    { code: "closed_after_receipt", at: "2026-07-22T08:00:00Z" },
  ], updatedAt: "2026-07-25T08:00:00Z" };
  T("لحظة الإغلاق = آخر حدث إغلاق في timeline (لا updatedAt)",
    FA._poClosedAtISO(po) === "2026-07-22T08:00:00Z");
  T("طلب مغلق قديم بلا حدث موقوت: الرجوع لـ updatedAt",
    FA._poClosedAtISO({ timeline: [], updatedAt: "2026-06-01T00:00:00Z" }) === "2026-06-01T00:00:00Z");

  // ── صافي سعر الوحدة للبند المخزّن ──
  T("صافي الوحدة = (إجمالي − ضريبة) ÷ المستلَم",
    FA._unitNet({ itemCost: 1150, vat: 150, rcvQty: 10, qty: 12 }) === 100);
  T("بلا إجمالي مخزّن: الرجوع لـ unitCost", FA._unitNet({ unitCost: 55 }) === 55);
  T("كمية صفرية: لا قسمة على صفر — الرجوع لـ unitCost",
    FA._unitNet({ itemCost: 1150, vat: 150, rcvQty: 0, qty: 0, unitCost: 33 }) === 33);
}

/* ════════════════════════════════════════════════════════════════════
   v18.9ag) مركزُ العمليات — كل لوحات TV في شاشةٍ واحدة
   الحرّاس: مصدرٌ واحدٌ للتصنيف والصلاحية · عزلٌ تامٌّ عن المشروع المفتوح ·
   مستمعون يُفكّون عند الخروج · حسابُ البطاقة صحيح · نافذةٌ مُعلَنة.
   ════════════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════════════
   v18.9aj) طابورُ الرفع المؤجَّل — لا رابطَ محلّيٍّ (blob:) في قاعدة البيانات
   ════════════════════════════════════════════════════════════════════ */
function photoQueueGuards() {
  H("v18.9aj) طابور الرفع المؤجَّل + الصورة المتعذّرة");

  const fs2 = require("fs"), path2 = require("path"), vm2 = require("vm");
  const PQ_PATH = path2.resolve(path2.dirname(IDX), "photo-queue.js");
  const TECH2 = fs2.existsSync(path2.resolve(path2.dirname(IDX), "tech-app.html"))
    ? fs2.readFileSync(path2.resolve(path2.dirname(IDX), "tech-app.html"), "utf8") : "";
  T("★ aj: photo-queue.js موجود", fs2.existsSync(PQ_PATH));
  if (!fs2.existsSync(PQ_PATH)) return;
  const pq = fs2.readFileSync(PQ_PATH, "utf8");
  try { new vm2.Script(pq); T("صياغة photo-queue.js سليمة", true); }
  catch (e) { T("صياغة photo-queue.js سليمة", false, String(e.message).slice(0, 120)); return; }

  // ── الحارس الأهمّ: لا موضعَ واحدٌ يحفظ رابطاً محلّياً في قاعدة البيانات ──
  // المعاينة داخل الجلسة (<img src=...>) مسموحة — التحريمُ على ما يُكتب في Firestore.
  const persistBlob = [
    /finalizedUrl=p\.storageUrl\|\|p\.preview/,
    /storageUrl\|\|pendingEditPhoto\.preview/,
    /storageUrl\|\|pendingTicketPhoto\.preview/,
    /const url=p\.storageUrl\|\|p\.preview;/,
    /map\(p=>p\.storageUrl\|\|p\.preview\)\.filter\(Boolean\)/
  ];
  T("★ aj: index.html لا يحفظ رابطاً محلّياً (blob:) في أي مسار",
    persistBlob.every(re => !re.test(HTML)),
    (persistBlob.find(re => re.test(HTML)) || "").toString());
  T("★ aj: tech-app.html لا يحفظ رابطاً محلّياً (blob:) في أي مسار",
    !TECH2 || persistBlob.every(re => !re.test(TECH2)));
  T("aj: المعاينة داخل الجلسة ما زالت تعرض الصورة قبل الرفع (لم نكسر التجربة)",
    /<img src="\$\{safeUrl\(p\.storageUrl\|\|p\.preview\)\}"/.test(HTML));

  // ── الصور الفاشلة تدخل الطابور في كل المسارات الستّة ──
  T("★ aj: إغلاق البلاغ يُدرج الفاشلة في الطابور ويعدّ ما دخل فعلاً",
    /_deferred=readyPhotos\.filter\(p=>!p\.storageUrl\)\.filter\(p=>_queuePhoto\(p, id, "photos", "arrayUnion"\)\)/.test(HTML));
  T("aj: إنشاء البلاغ · تعديل صورته · تعديل صور الإغلاق · الخلفية — كلُّها تُدرج",
    /_queuePhoto\(pendingTicketPhoto, id, "ticketPhoto", "set"\)/.test(HTML) &&
    /_queuePhoto\(pendingEditPhoto, t\.id, "ticketPhoto", "set"\)/.test(HTML) &&
    /editClosingPendingNew\.filter\([^)]*\)\.forEach\(p=>_queuePhoto\(p, t\.id, "photos", "arrayUnion"\)\)/.test(HTML) &&
    /else _queuePhoto\(p, ticketId, "photos", "arrayUnion"\)/.test(HTML));
  T("★ aj: تطبيق الفنيين يُدرج أيضاً (الميدانُ أضعفُ شبكةً من المكتب)",
    !TECH2 || (/_queuePhoto\(p, id, "photos", "arrayUnion"\)/.test(TECH2) && /function _queuePhoto\(/.test(TECH2)));
  T("★ aj: جسمُ الصورة ومسارُها محفوظان على الكائن (بلا وقودٍ لا رفعَ لاحق)",
    (HTML.match(/\.blob=blob; \w+\.path=_path;/g) || []).length >= 4 &&
    (!TECH2 || /photoObj\.blob=blob; photoObj\.path=_path;/.test(TECH2)));
  T("aj: التنبيه صريحٌ ولا يَعِد بحفظٍ لم يحدث (يُعدّ الداخلُ للطابور فقط)",
    /_deferred\.length>0/.test(HTML) && /حُفظت على الجهاز وتُرفَع تلقائياً/.test(HTML));
  T("★ aj: _queuePhoto تُرجع false بلا جسمٍ للصورة (فلا يُعلَن حفظٌ وهميّ)",
    /if\(!p \|\| !p\.blob \|\| !p\.path \|\| !docId\) return false;/.test(HTML));

  // ── سلوك الوحدة نفسها ──
  T("★ aj: الإلحاق بـ arrayUnion على الوثيقة الطازجة (لا يمحو صورَ جهازٍ آخر)",
    /FV\.arrayUnion\(url\)/.test(pq) && !/photos:\s*urls/.test(pq));
  T("★ aj: set+merge لا update (وثيقةٌ لم تصل بعدُ تُفشل update)",
    /\.set\(patch, \{ merge:true \}\)/.test(pq) && !/\.update\(patch\)/.test(pq));
  T("★ aj: الحذفُ من الطابور بعد نجاح الإلحاق لا قبله",
    /_uploadOne\(item\)[\s\S]{0,80}?\.then\(\(\)=>\{ ok\+\+; return _del\(item\.id\); \}\)/.test(pq));
  T("★ aj: لا إسقاطَ تلقائيَّ لعنصر — تتوقّف المحاولةُ ويبقى العنصر",
    /tries\|\|0\) < MAX_TRIES_AUTO/.test(pq) && !/tries[^\n]*>[^\n]*MAX_TRIES_AUTO[^\n]*_del/.test(pq));
  T("aj: يُعاد المحاولة عند عودة الشبكة وعند العودة للتبويب",
    /addEventListener\("online"/.test(pq) && /visibilitychange/.test(pq));
  T("★ aj: المؤقّت يعمل فقط ما دام في الطابور عنصر (لا نبضَ دوريٌّ عبثيّ)",
    /if\(!n\)\{ if\(_timer\)\{ clearInterval\(_timer\); _timer=null; \} return; \}/.test(pq));
  T("aj: الإدراج يرفض ما لا يمكن رفعه لاحقاً بدل إيهام المستخدم",
    /if\(!o\.blob \|\| !o\.storagePath \|\| !o\.collection \|\| !o\.docId \|\| !o\.field\)/.test(pq));
  T("aj: لا رفعَ ونحن دون اتّصال (توفيرُ محاولاتٍ فاشلة)", /navigator\.onLine === false/.test(pq));

  // ── الوحدة موسومةٌ ومربوطةٌ بالتطبيقين ──
  const pqBuild = (pq.match(/const MODULE_BUILD = "(v[\d.a-z]+)"/) || [])[1];
  T("★ aj: بصمة photo-queue.js تطابق APP_VERSION", pqBuild === VER, `build=${pqBuild} APP_VERSION=${VER}`);
  T("aj: مسجَّلة في كاشف الوحدات القديمة",
    /\{name:"photo-queue\.js", get:function\(\)\{ return window\.photoQueue; \}\}/.test(HTML));
  T("★ aj: مُحمَّلةٌ ومُهيّأةٌ في التطبيقين",
    /<script src="photo-queue\.js\?v=/.test(HTML) && /window\.photoQueue\.configure\(/.test(HTML) &&
    (!TECH2 || (/<script src="photo-queue\.js\?v=/.test(TECH2) && /window\.photoQueue\.configure\(/.test(TECH2))));

  // ── المربّع الصريح بدل الصورة المكسورة ──
  T("★ aj: imgBroken تستبدل الصورة المتعذّرة بمربّعٍ صريح",
    /function imgBroken\(el\)\{/.test(HTML) && /تعذّر تحميل الصورة/.test(HTML) &&
    /host\.classList\.add\("photo-dead"\)/.test(HTML));
  T("★ aj: الخانةُ المتعذّرة تُطوى عند الطباعة (لا فراغاتٌ مكسورةٌ للعميل)",
    /@media print\{\.photo-dead\{display:none!important\}\}/.test(HTML));
  T("aj: تُستدعى دفاعياً فلا ترمي في نافذة الطباعة المنبثقة",
    /onerror="window\.imgBroken&&imgBroken\(this\)"/.test(HTML) &&
    !/onerror="imgBroken\(this\)"/.test(HTML));
  T("★ aj: كلُّ صور التقرير المصوَّر موصولةٌ بالحارس (بلاغ · إغلاق · نظافة)",
    (HTML.match(/onerror="window\.imgBroken&&imgBroken\(this\)"/g) || []).length >= 4 &&
    (!_coSrcAj() || /onerror="window\.imgBroken&&imgBroken\(this\)"/.test(_coSrcAj())));
  T("aj: الحارس لا يعيد المعالجة مرّتين لنفس الصورة",
    /if\(!el \|\| el\.dataset\.brokenHandled\) return;/.test(HTML));
}
function _coSrcAj() {
  const fs3 = require("fs"), p3 = require("path");
  const f = p3.resolve(p3.dirname(IDX), "cleaning-operations.js");
  return fs3.existsSync(f) ? fs3.readFileSync(f, "utf8") : "";
}

/* ════════════════════════════════════════════════════════════════════
   ختمُ الإصدار الآليّ — رقمٌ يُشتقّ ولا يُؤلَّف (sync-version.mjs)
   ════════════════════════════════════════════════════════════════════ */
function versionStampGuards() {
  H("ختم الإصدار الآليّ (sync-version.mjs)");

  const fsV = require("fs"), pV = require("path"), cpV = require("child_process");
  const SV = pV.resolve(pV.dirname(IDX), "sync-version.mjs");
  T("★ sv: sync-version.mjs موجود", fsV.existsSync(SV));
  if (!fsV.existsSync(SV)) return;
  const sv = fsV.readFileSync(SV, "utf8");

  // ── الصيغة مشتقّةٌ لا مؤلَّفة: v18.9.532 لا v18.9ak ──
  T("★ sv: الإصدار بصيغةٍ مشتقّة (رقمٌ يتزايد لا حرفٌ يُخمَّن)",
    /^v\d+\.\d+\.\d+$/.test(VER), `APP_VERSION=${VER} — شغّل npm run stamp`);
  T("★ sv: الاشتقاق من عدّاد commits (لا اختيارَ يدويّ)",
    /git rev-list --count HEAD/.test(sv));

  // ── سطرُ الإصدار قصيرٌ ومعلَّمٌ أنه مولَّد ──
  const verLine = (HTML.match(/^const APP_VERSION = .*$/m) || [""])[0];
  T("★ sv: سطرُ APP_VERSION قصيرٌ (كان ١٤٥٧ حرفاً فكان كلُّ فرعين يتعارضان عليه)",
    verLine.length < 60, `الطول=${verLine.length}`);
  T("sv: السطر معلَّمٌ «مولَّدٌ آلياً — لا تحرّره يدوياً»",
    /مولَّدٌ آلياً — لا تحرّره يدوياً[\s\S]{0,120}?const APP_VERSION/.test(HTML));

  // ── package.json يعرض الأمرين ──
  const pkgPath = pV.resolve(pV.dirname(IDX), "package.json");
  const pkg = fsV.existsSync(pkgPath) ? JSON.parse(fsV.readFileSync(pkgPath, "utf8")) : {};
  T("★ sv: npm run stamp و stamp:check معرَّفان",
    !!(pkg.scripts && pkg.scripts.stamp && pkg.scripts["stamp:check"]),
    JSON.stringify(pkg.scripts || {}));

  // ── الأهداف مكتشَفةٌ لا معدودة: وحدةٌ جديدة تُختَم بلا تعديل السكربت ──
  T("★ sv: الأهداف مكتشَفةٌ من الملفات (فنسيانُ وحدةٍ جديدة غيرُ ممكن)",
    /readdirSync\(REPO\)/.test(sv) && /MODULE_BUILD = "/.test(sv) &&
    /<script src="\(\?!https\?:\)/.test(sv));

  // ── فصلُ المولِّد عن الثابت: --check لا يلمس git (وإلا أسقط PRs بلا خطأ) ──
  const checkBlock = (sv.match(/if\(argv\.includes\("--check"\)\)\{[\s\S]*?\n\}/) || [""])[0];
  T("★ sv: --check لا يستدعي git (Actions تفحص commit دمجٍ فيختلف العدّاد)",
    !!checkBlock && !/computeVersion\(\)/.test(checkBlock) && !/execSync/.test(checkBlock));
  T("sv: --check يفحص الاتّساق والصيغة وقيدَ NOTES وغيابَ العلامة",
    /أختامٌ مختلفة/.test(sv) && /ليست مشتقّةً/.test(sv) &&
    /لا قيدَ لـ/.test(sv) && /ما زالت فيه علامة/.test(sv));

  // ── حارسُ التراجع: الاستنساخُ الضحل يُنجح rev-list برقمٍ **أقلّ** لا يُفشله ──
  // وقع فعلاً: بيئةٌ بعمق ١٣٠ ختمت v18.9.130 والعدُّ الحقيقي ٢٤٨٩ — فلو تكرّر لتراجع
  // الإصدارُ في ٢٢ موضعاً دفعةً واحدة وعادت الوحداتُ إلى كاشٍ أقدم.
  T("★ sv: المولِّد يرفض الاستنساخ الضحل (rev-list ينجح فيه برقمٍ ناقص)",
    /is-shallow-repository/.test(sv) && /assertFullHistory/.test(sv));
  T("★ sv: وحارسٌ ثانٍ يرفض أيَّ إصدارٍ أدنى من المختوم حالياً",
    /assertNoDowngrade/.test(sv) && /أدنى\*\* من المختوم|أدنى/.test(sv));
  T("★ sv: الحارسان يعملان قبل الكتابة لا بعدها",
    /assertFullHistory\(\);[\s\S]{0,400}?rev-list --count/.test(sv) &&
    /assertNoDowngrade\(ver\);[\s\S]{0,80}?return ver;/.test(sv));

  // ── العلامة vNEXT: كشفٌ دقيقٌ لا يسقط على ذكرها شرحاً ──
  T("★ sv: الوثائق تُفحَص بعلامة القيد وحدها لا بأي ذكرٍ للكلمة",
    /includes\(`\*\*\$\{PLACEHOLDER\} —`\)/.test(sv));
  T("★ sv: لا علامةَ vNEXT عالقةٌ في ملفات المستخدم (تصل التذييلَ نصّاً حرفياً)",
    !/vNEXT/.test(HTML), "vNEXT في index.html");

  // ── CI يُشغّل الفحص ──
  const wf = pV.resolve(pV.dirname(IDX), ".github/workflows/hail-tests.yml");
  const wfSrc = fsV.existsSync(wf) ? fsV.readFileSync(wf, "utf8") : "";
  T("★ sv: CI يُشغّل فحصَ الختم قبل الاختبارات",
    /node sync-version\.mjs --check/.test(wfSrc));
  T("sv: sync-version.mjs ضمن مسارات تشغيل CI",
    /- 'sync-version\.mjs'/.test(wfSrc));

  /* ★ حارسٌ عامّ: **كلُّ وحدةٍ يفحصها hail-tests يجب أن تكون في مرشّح مسارات CI**.
     تعليقُ الملف نفسِه يحذّر: «أي إغفال يعني أن push مباشراً له لا يُشغّل CI».
     وقد وقع فعلاً — `contracts.js` بقيت خارج القائمة عبر أربعة PRs. الحارسُ يشتقّ
     القائمةَ المطلوبة من **الوحدات الموجودة فعلاً** لا من قائمةٍ مكتوبةٍ ثانية. */
  {
    const dirV = pV.dirname(IDX);
    const declared = new Set((wfSrc.match(/^\s*-\s*'([^']+)'/gm) || [])
      .map(x => x.replace(/^\s*-\s*'/, "").replace(/'$/, "")));
    // الوحداتُ التي تُحقَن في التطبيق (لها وسمُ <script> في index.html) — هي ما يفحصه hail-tests
    const injected = (HTML.match(/<script src="([a-z0-9-]+\.js)\?v=/gi) || [])
      .map(x => (x.match(/"([a-z0-9-]+\.js)\?/i) || [])[1]).filter(Boolean);
    const missing = [...new Set(injected)].filter(f => !declared.has(f) && fsV.existsSync(pV.join(dirV, f)));
    T("★ كلُّ وحدةٍ محقونةٍ في التطبيق مُدرَجةٌ في مسارات CI (وإلا لم يفحصها push مباشر)",
      missing.length === 0, missing.join(" "));
  }

  // ── تشغيلٌ فعليّ: الفحصُ يمرّ على الشجرة الحالية ──
  let ok = true, out = "";
  try { out = cpV.execSync(`node ${JSON.stringify(SV)} --check`, { cwd: pV.dirname(IDX), stdio: ["ignore","pipe","pipe"] }).toString(); }
  catch (e) { ok = false; out = String((e.stdout || "") + (e.stderr || "")).slice(0, 200); }
  T("★ sv: الشجرة الحالية مختومةٌ فعلاً (تشغيلٌ حقيقيٌّ لـ--check)", ok, out.trim().slice(0, 160));
}

function aiErrorMessagesGuards() {
  H("رسائل أخطاء الذكاء الاصطناعي — سببٌ عربيٌّ لا نصٌّ إنجليزيّ خام");

  // ── الدالّتان تُستخرجان وتُنفَّذان فعلاً (لا قراءةَ نصٍّ) ──
  const arSrc  = (HTML.match(/function _aiErrAr\(m\)\{[\s\S]*?\n\}/) || [])[0];
  const errSrc = (HTML.match(/function _msgErr\(e\)\{[\s\S]*?\n\}/) || [])[0];
  T("★ ai-err: _aiErrAr و_msgErr موجودتان في index.html", !!arSrc && !!errSrc);
  if (!arSrc || !errSrc) return;
  const _msgErr = new Function(arSrc + "\n" + errSrc + "; return _msgErr;")();

  const CRED = "Your credit balance is too low to access the Anthropic API. " +
               "Please go to Plans & Billing to upgrade or purchase credits.";
  const ar = m => _msgErr(new Error(m));
  const noLatin = s => !/[A-Za-z]{4,}/.test(s.replace(/console\.anthropic\.com|Plans & Billing|Anthropic|Proxy/g, ""));

  // الحالة التي شُوهدت فعلاً في الميدان: توست عربيّ يحمل جملةً إنجليزيةً كاملة
  T("★ ai-err: «نفاد الرصيد» يُترجَم إلى سببٍ وحلٍّ بالعربية",
    /رصيد/.test(ar(CRED)) && /console\.anthropic\.com/.test(ar(CRED)), ar(CRED));
  T("★ ai-err: رسالة الرصيد لا تُسرِّب الجملة الإنجليزية الخام",
    !/credit balance/i.test(ar(CRED)) && noLatin(ar(CRED)), ar(CRED));
  T("★ ai-err: الرسالة تنفي عطلَ النظام صراحةً (فلا يُبلَّغ عن خللٍ وهميّ)",
    /النظام سليم/.test(ar(CRED)));

  T("ai-err: تجاوز حدّ الطلبات (429) بالعربية",
    /حدّ الطلبات/.test(ar("HTTP 429")) && /حدّ الطلبات/.test(ar("rate_limit_error: too many requests")));
  T("ai-err: ازدحام الخوادم (529) بالعربية",
    /مزدحمة/.test(ar("HTTP 529")) && /مزدحمة/.test(ar("Overloaded")));
  T("ai-err: مفتاحٌ غير صالح (401) يوجّه لإعدادات الذكاء الاصطناعي",
    /مفتاح/.test(ar("HTTP 401")) && /مفتاح/.test(ar("authentication_error: invalid x-api-key")));

  // ── لا ابتلاعَ للرسائل الأخرى: ما لا يُطابَق يبقى كما هو ──
  T("★ ai-err: خطأٌ غير معروف يبقى نصّه كما هو (لا ابتلاعَ للتشخيص)",
    ar("Some brand new upstream error") === "Some brand new upstream error");
  T("ai-err: مهلة الطلب والشبكة يحتفظان برسالتيهما السابقتين",
    /مهلة/.test(_msgErr(Object.assign(new Error("x"), { name: "AbortError" }))) &&
    /تعذّر الاتصال/.test(ar("Failed to fetch")));

  // ── تطبيق الفنّي يشترك في نفس المعالجة (نفس العطل ظهر فيه) ──
  const taPath = require("path").resolve(require("path").dirname(IDX), "tech-app.html");
  const ta = require("fs").existsSync(taPath) ? require("fs").readFileSync(taPath, "utf8") : "";
  const taSrc = (ta.match(/function _aiErrAr\(m\)\{[\s\S]*?\n\}/) || [])[0];
  T("★ ai-err: tech-app.html يحمل _aiErrAr ويستدعيها في مسار الفشل",
    !!taSrc && /const ar=_aiErrAr\(m\); if\(ar\) m=ar;/.test(ta));
  if (taSrc) {
    const taAr = new Function(taSrc + "; return _aiErrAr;")();
    T("★ ai-err: صياغة الفنّي — نفاد الرصيد يظهر بالعربية لا بالإنجليزية",
      /رصيد/.test(taAr(CRED)) && !/credit balance/i.test(taAr(CRED)), taAr(CRED));
    T("ai-err: تطبيق الفنّي لا يوجّه الفنّيّ لصفحة فوترةٍ لا يملكها",
      !/console\.anthropic\.com/.test(taAr(CRED)) && /المسؤول/.test(taAr(CRED)), taAr(CRED));
  }
}

function tvWallGuards() {
  H("v18.9ag+ai) مركز العمليات — العرض الموحّد والتدوير التلقائي");

  // ── (١) مصدرٌ واحدٌ للتصنيف: tvHealth تُستخرَج وتُنفَّذ فعلاً ──
  const thSrc = (HTML.match(/function tvHealth\(overdue\)\{[\s\S]*?\n\}/) || [])[0];
  T("★ ag: tvHealth موجودة (مصدرٌ واحدٌ لصحّة اللوحة)", !!thSrc);
  if (thSrc) {
    const tvHealth = new Function(thSrc + "; return tvHealth;")();
    T("★ ag: صفر متأخر ⇒ مستقر", tvHealth(0).key === "stable" && tvHealth(0).word === "مستقر");
    T("★ ag: متأخرٌ واحد ⇒ متابعة", tvHealth(1).key === "watch" && tvHealth(2).key === "watch");
    T("★ ag: ثلاثةٌ فأكثر ⇒ حرِج", tvHealth(3).key === "crit" && tvHealth(9).key === "crit");
    T("★ ag: قيمةٌ غائبة/غير رقمية تُعامَل صفراً لا NaN", tvHealth(undefined).key === "stable" && tvHealth("x").key === "stable");
  }
  T("★ ag: لوحة المشروع تقرأ tvHealth ولا تكتب عتباتها محلياً",
    /const _hl=tvHealth\(overdue\)/.test(HTML) && !/if\(overdue>=3\)\{health="crit"/.test(HTML),
    "عودةُ العتبات داخل renderTVDashboard = تصنيفان مختلفان للمشروع نفسه");

  // ── (٢) مصدرٌ واحدٌ لمشاريع المستخدم: البوّابة والجدار يقرآن نفس الدالة ──
  const vpSrc = (HTML.match(/function _visibleProjectsFor\(user\)\{[\s\S]*?\n\}/) || [])[0];
  T("★ ag: _visibleProjectsFor موجودة", !!vpSrc);
  if (vpSrc) {
    const mk = list => new Function("_projectsList", vpSrc + "; return _visibleProjectsFor;")(list);
    const L = [{ id: "a" }, { id: "b" }, { id: "c" }];
    T("★ ag: الأدمن يرى كل المشاريع", mk(L)({ role: "admin", projects: ["a"] }).length === 3);
    T("★ ag: قائمة projects تحصر رؤية غير الأدمن",
      mk(L)({ role: "supervisor", projects: ["b", "c"] }).map(p => p.id).join() === "b,c");
    T("★ ag: قائمةٌ فارغة ⇒ لا حصر (سلوك البوّابة نفسه)",
      mk(L)({ role: "supervisor", projects: [] }).length === 3);
  }
  T("★ ag: البوّابة تقرأ نفس الدالة (لا فلترةً مكرّرة)",
    /const visibleProjects = _visibleProjectsFor\(user\);/.test(HTML) &&
    !/visibleProjects = _projectsList\.filter\(p => user\.projects\.includes/.test(HTML));
  T("★ ag: المركز يقرأ نفس الدالة", /_tvwall\.projects=_visibleProjectsFor\(currentUser\)/.test(HTML));
  T("★ ag: المراقبُ وأدوارُ المشتريات المركزية محجوبون عن المركز",
    /function _canSeeTVWall\(user\)\{[\s\S]*?user\.role === "observer"[\s\S]*?_isGlobalOnlyRole\(user\.role\)[\s\S]*?\n\}/.test(HTML));
  T("★ ag: openTVWall تفحص الصلاحية بنفسها (لا تكتفي بإخفاء الزر)",
    /async function openTVWall\(from\)\{[\s\S]{0,400}?if\(!_canSeeTVWall\(currentUser\)\)/.test(HTML));

  // ── (٣) عزلٌ تام: الجدار لا يكتب حالة المشروع المفتوح ولا يقرأ بياناته ──
  // من أول تعليمةٍ بعد تعليق الرأس (فلا يُحسب نصُّ التعليق شيفرةً في الحرّاس أدناه)
  const wallSrc = slice("const TVWALL_SYNC_LIMIT", "// تنظيف TV intervals عند تغيير الصفحة");
  T("★ ag: كتلةُ مركز العمليات موجودة في المصدر",
    !!wallSrc && wallSrc.length > 3000 && HTML.includes("██  v18.9ag — مركزُ العمليات"));
  if (wallSrc) {
    T("★ ag: المركز لا يُسنِد CURRENT_PROJECT إطلاقاً",
      !/CURRENT_PROJECT\s*=(?!=)/.test(wallSrc), "إسنادُ المشروع من المركز = خلطُ بيانات مشروعين");
    T("★ ag: المركز لا يقرأ مصفوفة tickets للمشروع المفتوح",
      !/\btickets\b(?!\s*[:_])/.test(wallSrc.replace(/_tickets/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")),
      "قراءةُ tickets تخلط بلاغات المشروع المفتوح ببطاقات المركز");
    T("★ ag: لكل مشروعٍ مخزنُه الخاص", /_tvwall\.data\[p\.id\]\s*=/.test(wallSrc));
    T("★ ag: التأخّر من isOverdue وصحّةُ البطاقة من tvHealth (لا تصنيفَ محلي)",
      /isOverdue\(t\)/.test(wallSrc) && /tvHealth\(odList\.length\)/.test(wallSrc));
    T("★ ag: فتحُ مشروعٍ من المركز وآخرُ مفتوحٌ يمرّ بمسار switchProject",
      /if\(CURRENT_PROJECT\) switchProject\(\);/.test(wallSrc),
      "الدخولُ المباشر يترك مستمعي المشروع السابق حيّين على مجموعاته");
    // ── (٤) المستمعون: تركيبٌ مرةً واحدة، ولا فكَّ عند الإغلاق ──
    T("★ ag: لا يُعاد تركيب مستمعٍ قائم (درس v18.9sz — تراكم targetId)",
      /if\(_tvwall\.subs\[p\.id\]\) return;/.test(wallSrc));
    T("★ ag: الإغلاق يوقف الرسم لا المستمع",
      /function closeTVWall\(\)\{[\s\S]*?\n\}/.test(wallSrc) &&
      !/function closeTVWall\(\)\{[\s\S]*?_tvwallUnsubAll\(\)[\s\S]*?\n\}/.test(wallSrc));
    T("★ ag: المستمع يجمع ولا يرسم والشاشةُ مغلقة", /if\(!_tvwall\.open \|\| _tvwall\.renderT\) return;/.test(wallSrc));
    // ── (٥) النافذة مُعلَنة لا صامتة ──
    T("★ ag: امتلاءُ النافذة يُعلَن على البطاقة",
      /_tvwall\.capped\[p\.id\] = snap\.docs\.length >= TVWALL_SYNC_LIMIT;/.test(wallSrc) &&
      /if\(_tvwall\.capped\[proj\.id\]\)/.test(wallSrc));
    T("★ ag: فشلُ قراءة مشروعٍ يظهر بطاقةَ خطأٍ لا فراغاً", /tvl-c-err/.test(wallSrc));
    T("★ ag: معاملات onclick النصية عبر _jsq لا esc (درس v18.9vu-H5)",
      /tvwallOpenProject\('\$\{_jsq\(proj\.id\)\}'\)/.test(wallSrc));
  }
  T("★ ag: تسجيلُ الخروج يفكّ مستمعي المركز ويمسح بياناته",
    /function logoutToLogin\(\)\{[\s\S]*?_tvwallUnsubAll\(\);[\s\S]*?currentUser = null;/.test(HTML));
  T("★ ag: الخروج لا يعيد إظهار بوّابة المشاريع من المركز",
    /_tvwall\.ret="none";\s*\/\/ لا يُعاد إظهار بوّابة المشاريع/.test(HTML));

  // ── (٦) حسابُ البطاقة — تنفيذٌ حقيقيٌّ لا قراءة ──
  const calcSrc = (HTML.match(/function _tvwallCalcTickets\(pid\)\{[\s\S]*?\n\}/) || [])[0];
  T("★ ag: حاسبةُ بلاغات المشروع موجودة", !!calcSrc);
  if (calcSrc && thSrc) {
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const prevMonth = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 7); })();
    const rows = [
      { id: "T1", status: "مفتوح",       createdAt: today + "T08:00:00.000Z" },                                     // نشط + اليوم + متأخر
      { id: "T2", status: "قيد التنفيذ", createdAt: today + "T09:00:00.000Z" },                                     // نشط + اليوم + قيد التنفيذ
      { id: "T3", status: "مغلق",        createdAt: today + "T07:00:00.000Z", closedAt: today + "T10:00:00.000Z" }, // أُغلق اليوم
      { id: "T4", status: "مفتوح",       createdAt: month + "-01T08:00:00.000Z", archived: true },                  // مؤرشف ⇒ خارج النشط
      { id: "T5", status: "مغلق",        createdAt: prevMonth + "-05T08:00:00.000Z", closedAt: prevMonth + "-06T08:00:00.000Z" }, // شهرٌ سابق
    ];
    const F = new Function("_tvwall", "isOverdue", "tvHealth",
      calcSrc + "; return _tvwallCalcTickets;")({ data: { p1: rows } }, t => t.id === "T1", new Function(thSrc + "; return tvHealth;")());
    const m = F("p1");
    T("★ ag: النشط = غير المؤرشف وغير المغلق", m.openN === 2, "openN=" + m.openN);
    T("★ ag: المؤرشف لا يُحسب نشطاً", m.openN === 2 && rows[3].archived === true);
    T("★ ag: المتأخر من isOverdue وحدها", m.overdue === 1);
    T("★ ag: قيد التنفيذ يُعدّ من المفتوحة", m.prog === 1);
    T("★ ag: بلاغاتُ اليوم = المُنشأة اليوم (بما فيها المغلق اليوم)", m.newToday === 3, "newToday=" + m.newToday);
    T("★ ag: أُغلقت اليوم = المغلقة بطابع إغلاقٍ اليوم", m.closedToday === 1);
    T("★ ag: إنجازُ الشهر من بلاغات الشهر وحدها (٤ منها ١ مغلق)",
      m.monthN === 4 && m.monthClosed === 1 && m.rate === 25, `monthN=${m.monthN} closed=${m.monthClosed} rate=${m.rate}`);
    T("★ ag: النسبة محصورةٌ ٠–١٠٠ ولا تتجاوز المئة أبداً", m.rate >= 0 && m.rate <= 100);
    T("★ ag: شهرٌ بلا بلاغات ⇒ لا نسبةَ ملفَّقة (null لا صفر)",
      new Function("_tvwall", "isOverdue", "tvHealth", calcSrc + "; return _tvwallCalcTickets;")
        ({ data: { p2: [] } }, () => false, new Function(thSrc + "; return tvHealth;")())("p2").rate === null);
    T("★ ag: مشروعٌ لم تصل لقطتُه بعد ⇒ null (حالةُ تحميلٍ لا أصفار)",
      new Function("_tvwall", "isOverdue", "tvHealth", calcSrc + "; return _tvwallCalcTickets;")
        ({ data: {} }, () => false, new Function(thSrc + "; return tvHealth;")())("nope") === null);
    T("★ ag: صحّةُ البطاقة من tvHealth (متأخرٌ واحد ⇒ متابعة)", m.health.key === "watch");
  }

  // ── (٧) الطوابع: Timestamp أو ISO — تُوحَّد عند الدخول ──
  const isoSrc = (HTML.match(/function _tvwallIso\(v\)\{[\s\S]*?\n\}/) || [])[0];
  if (isoSrc) {
    const _iso = new Function(isoSrc + "; return _tvwallIso;")();
    T("★ ag: طابع Firestore يُوحَّد نصاً ISO",
      _iso({ toDate: () => new Date("2026-08-08T05:00:00.000Z") }) === "2026-08-08T05:00:00.000Z");
    T("★ ag: النص يمرّ كما هو، والغياب نصٌّ فارغ (لا كسرَ slice)",
      _iso("2026-08-08T05:00:00Z") === "2026-08-08T05:00:00Z" && _iso(null) === "" && _iso(undefined) === "");
  }

  // ── (٨) الواجهة: مدخلان اثنان لا أكثر، وثيمةٌ واحدةٌ مع لوحة المشروع ──
  T("★ ag: زرُّ المركز في بوّابة المشاريع", /onclick="openTVWall\('picker'\)"/.test(HTML));
  T("★ ag: زرُّ المركز في القائمة الجانبية", /id="nav-tvwall-btn"[\s\S]{0,120}?openTVWall\('app'\)/.test(HTML));
  T("★ ag: الشاشة تشارك لوحةَ ألوان #page-tv (مصدرٌ واحدٌ للثيمة)",
    /#page-tv,#tvwall-screen\{/.test(HTML) && /#tvwall-screen\[data-health="crit"\]/.test(HTML));
  T("★ ag: زرُّ القائمة محجوبٌ عن المراقب ووضع المشتريات المركزية",
    /body\.role-observer #nav-tvwall-btn,/.test(HTML) && /body\.global-purchases-mode #nav-tvwall-btn,/.test(HTML));
  T("★ ag: Esc يغلق المركز بعد الخروج من ملء الشاشة لا قبله",
    /e\.key==="Escape" && _tvwall\.open && !document\.fullscreenElement/.test(HTML));

  /* ── v18.9ai: التدويرُ التلقائي ولوحةُ المشروع داخل المركز ── */
  // (١) قائمةُ الشاشات: «الكل» + مشروعٌ لكل بطاقة، وتُنفَّذ فعلاً لا تُقرأ
  const syncSrc = (HTML.match(/function _tvwallSyncScreens\(order\)\{[\s\S]*?\n\}/) || [])[0];
  T("★ ai: _tvwallSyncScreens موجودة", !!syncSrc);
  if (syncSrc) {
    const mk = st => new Function("_tvwall", syncSrc + "; return _tvwallSyncScreens;")(st);
    const st1 = { projects: [{ id: "a" }, { id: "b" }], screens: [], idx: 0 };
    mk(st1)(["a", "b"]);
    T("★ ai: الشاشةُ الأولى «الكل» ثم شاشةٌ لكل مشروع",
      st1.screens.length === 3 && st1.screens[0].pid === null &&
      st1.screens.map(s => s.pid).join() === ",a,b", JSON.stringify(st1.screens));
    // إعادةُ الترتيب أثناء العرض تُبقي المستخدم على المشروع نفسه لا على رقم الشاشة
    const st2 = { projects: [{ id: "a" }, { id: "b" }], screens: st1.screens.slice(), idx: 2 };
    mk(st2)(["b", "a"]);
    T("★ ai: تغيّرُ الترتيب يُبقي المعروضَ على مشروعه (لا قفزةَ شاشة)",
      st2.screens[st2.idx].pid === "b", "idx=" + st2.idx + " pid=" + st2.screens[st2.idx].pid);
    const st3 = { projects: [{ id: "a" }], screens: [], idx: 0 };
    mk(st3)(["a"]);
    T("★ ai: مشروعٌ واحد ⇒ شاشتان (الكل + لوحته)", st3.screens.length === 2);
  }
  if (wallSrc) {
    T("★ ai: التدويرُ مؤقّتٌ واحدٌ يُعاد ضبطه ولا يتراكم",
      /function _tvwallRotRestart\(\)\{[\s\S]{0,160}?if\(_tvwall\.rotTimer\)\{ clearInterval\(_tvwall\.rotTimer\); _tvwall\.rotTimer=null; \}/.test(wallSrc));
    T("★ ai: التدويرُ لا يعمل بشاشةٍ واحدة ولا وهو موقوف",
      /if\(!_tvwall\.rotOn \|\| _tvwall\.screens\.length<2\) return;/.test(wallSrc));
    T("★ ai: الإغلاقُ يوقف مؤقّت التدوير", /if\(_tvwall\.rotTimer\)\{ clearInterval\(_tvwall\.rotTimer\); _tvwall\.rotTimer=null; \}/.test(HTML.slice(HTML.indexOf("function closeTVWall"))));
    T("★ ai: زرٌّ صريحٌ يوقف التدوير ويستأنفه",
      /function toggleTVWallRotation\(\)\{[\s\S]*?_tvwall\.rotOn=!_tvwall\.rotOn;[\s\S]*?\n\}/.test(wallSrc) &&
      /id="tvl-rot-btn" onclick="toggleTVWallRotation\(\)"/.test(HTML));
    // (٢) لوحةُ المشروع: من نافذة المركز لا من tickets، وبنفس مكوّنات لوحة العرض TV
    T("★ ai: لوحةُ المشروع تُبنى من _tvwallCalc لا من بيانات المشروع المفتوح",
      /function _tvwallRenderProject\(pid, entering\)\{[\s\S]{0,400}?const m=_tvwallCalc\(pid\)/.test(wallSrc));
    T("★ ai: تعيد استعمال مكوّنات لوحة العرض TV (لا نسخةَ ثانيةً من التصميم)",
      /tvw-kpi /.test(wallSrc) && /tvw-bld /.test(wallSrc) &&
      /class="tvw-stage"/.test(HTML.slice(HTML.indexOf('id="tvl-screen-proj"'), HTML.indexOf('id="tvl-screen-proj"') + 3000)));
    T("★ ai: حلقةُ الجاهزية على مقياس المشروع، وصفرٌ عند غياب البيانات لا كذباً",
      /const to=C\*\(1-\(pct==null\?0:pct\)\/100\);/.test(wallSrc) &&
      /setTx\("tvl-proj-bpct",pct==null\?"—":\(pct\+"%"\)\);/.test(wallSrc));
    T("★ ai: مبانِي المشروع من مستند إعداداته، وتُشتقّ من البلاغات عند تعذّرها",
      /"meta\/"\+p\.id\+\(IS_DEV\?"_settings_dev":"_settings"\)/.test(wallSrc) &&
      /const blds=\(known&&known\.length\)\?known:fromT;/.test(wallSrc));
    T("★ ai: لا إجماليَّ تراكميٍّ على لوحة المشروع (النافذة مقتطَعة ⇒ الرقم يكذب)",
      !/إجمالي البلاغات/.test(wallSrc) && /l:"بلاغات الأسبوع"/.test(wallSrc),
      "إجماليٌّ تراكميٌّ من نافذةٍ محدودة يُقرأ «هذا كل شيء»");
    T("★ ai: شريطٌ علويٌّ واحدٌ يتبع المعروض (لا شريطان)",
      /if\(totEl && !\(curS&&curS\.pid\)\) totEl\.innerHTML=_tvwall\.totalsHtml;/.test(HTML) &&
      (HTML.match(/id="tvl-totals"/g) || []).length === 1);
    // (٣) نقاطُ التدوير بنيةُ معلومات: لونُ النقطة = صحّةُ مشروعها
    T("★ ai: نقطةُ كل مشروعٍ تحمل لونَ صحّته",
      /m\.health\.key==="crit"\?"var\(--red\)":m\.health\.key==="watch"\?"var\(--amber\)":"var\(--green\)"/.test(wallSrc) &&
      /#tvl-rot-dots button\{background:color-mix/.test(HTML));
    T("★ ai: النقاطُ قابلةٌ للنقر ومُسمّاةٌ لقارئ الشاشة",
      /aria-label="\$\{esc\(lbl\)\}"/.test(wallSrc) && /b\.onclick=\(\)=>\{ _tvwallShowScreen\(k\); _tvwallRotRestart\(\); \}/.test(wallSrc));
  }
  /* ── v18.9aj: مشروعُ النظافة يُقاس بمهامّه لا ببلاغاته ── */
  {
    const CO_PATH = path.resolve(path.dirname(IDX), "cleaning-operations.js");
    const CO = fs.existsSync(CO_PATH) ? fs.readFileSync(CO_PATH, "utf8") : "";
    // (١) الوحدة تعرّض حساباً لقائمةِ مهامّ مشروعٍ آخر — بلا نسخةٍ ثانية من القواعد
    T("★ aj: وحدةُ النظافة تعرّض حسابَ لوحة اليوم لقائمةٍ مُمرَّرة",
      /function statsForTasks\(list\)\{\s*return _inCleanCtx\(\(\)=>boardStats\(/.test(CO) &&
      /function coverageForTasks\(list\)\{\s*return _inCleanCtx\(\(\)=>coverageByBuilding\(/.test(CO),
      "نسخُ الحساب في مركز العمليات ⇒ نسختان تنحرفان");
    T("★ aj: سياقُ النظافة متزامنٌ ويُستعاد في finally (لا تسريبَ سياق)",
      /function _inCleanCtx\(fn\)\{ const prev=_cleanCtx; _cleanCtx=true; try\{ return fn\(\); \} finally\{ _cleanCtx=prev; \} \}/.test(CO));
    T("★ aj: قاعدةُ الإجازة تقرأ السياق قبل المشروع المفتوح",
      /function isCleaningProject\(\)\{\s*if\(_cleanCtx\) return true;/.test(CO),
      "بدونها: حسابُ مشروعٍ آخر يسأل «هل المشروعُ المفتوح نظافة؟» — سؤالٌ لا معنى له");
    T("★ aj: كشفُ نوع المشروع من مصدرَيه (السجلّ ثم مستند الموازنة)",
      /function isCleaningProjectRec\(p\)\{[\s\S]*?p\.type==="cleaning"[\s\S]*?_budget/.test(CO));
    T("★ aj: مسارُ مجموعة المهام يُشتقّ من الوحدة لا من المركز",
      /function tasksColOf\(projId\)\{/.test(CO) && /CO\.tasksColOf\(pid\)/.test(HTML));
    // (٢) المركز: موزِّعٌ بالنوع، وحسابُ النظافة من الوحدة
    T("★ aj: _tvwallCalc موزِّعٌ بالنوع (نظافة ⇄ صيانة)",
      /function _tvwallCalc\(pid\)\{\s*if\(_tvwall\.kind\[pid\]==="cleaning"\) return _tvwallCalcClean\(pid\);\s*return _tvwallCalcTickets\(pid\);/.test(HTML));
    if (wallSrc) {
      T("★ aj: حسابُ النظافة يُستدعى من الوحدة ولا يُعاد هنا",
        /const s=CO\.statsForTasks\(list\);/.test(wallSrc) && /CO\.coverageForTasks\(list\)/.test(wallSrc) &&
        !/nextDueDate/.test(wallSrc), "أيُّ قاعدة استحقاقٍ مكتوبةٍ هنا = مصدرٌ ثانٍ للحقيقة");
      T("★ aj: صحّةُ مشروع النظافة من tvHealth نفسها (معنى واحدٌ عبر الشاشتين)",
        /health: tvHealth\(s\.overdue\)/.test(wallSrc));
      T("★ aj: البطاقة تعرض المهامَّ لا البلاغات في مشروع النظافة",
        /l:"مستحقّة الآن"/.test(wallSrc) && /l:"نُفِّذت اليوم"/.test(wallSrc) &&
        /clean\?"مهمّة مستحقّة":"بلاغ نشط"/.test(wallSrc));
      T("★ aj: شريطُ البطاقة تغطيةُ اليوم للنظافة وإنجازُ الشهر للصيانة",
        /const barL = clean \? "تغطية اليوم" : "إنجاز بلاغات الشهر";/.test(wallSrc));
      T("★ aj: الإجازةُ تُعلَن ولا تُعرَض صفراً (٠٪ يومَ الجمعة كذبٌ بصريّ)",
        /clean&&m\.holiday \? "إجازة"/.test(wallSrc) && /cleanP&&m\.holiday\?"إجازة":m\.health\.word/.test(wallSrc));
      T("★ aj: مشروعُ النظافة لا يشترك على البلاغات، ويُفكّ مستمعُها عند كشف النوع",
        /if\(_tvwall\.kind\[p\.id\]==="cleaning"\) return;/.test(HTML) &&
        /if\(_tvwall\.subs\[p\.id\]\)\{ try\{ _tvwall\.subs\[p\.id\]\(\); \}catch\(e\)\{\} delete _tvwall\.subs\[p\.id\]; \}/.test(wallSrc));
      T("★ aj: مستمعُ المهام يُركَّب مرةً واحدة (نفس انضباط المركز)",
        /if\(!db \|\| _tvwall\.taskSubs\[pid\]\) return;/.test(HTML));
      T("★ aj: الخروج يفكّ مستمعي المهام ويمسح بياناتها",
        /Object\.keys\(_tvwall\.taskSubs\)\.forEach\(k=>\{ try\{ _tvwall\.taskSubs\[k\]\(\); \}catch\(e\)\{\} \}\);/.test(wallSrc));
      T("★ aj: الشريطُ العلوي لا يجمع البلاغات والمهام في بلاطةٍ واحدة",
        /const totOpen=sumOf\(maint,"openN"\)/.test(wallSrc) && /const tskDue=sumOf\(clean,"due"\)/.test(wallSrc) &&
        /\]:\[\]\)\.concat\(clean\.length\?\[/.test(wallSrc), "رقمٌ بوحدتين لا يعني شيئاً");
    }
    // (٣) تنفيذُ حسابِ النظافة فعلاً عبر واجهة الوحدة الحقيقية
    const cleanSrc = (HTML.match(/function _tvwallCalcClean\(pid\)\{[\s\S]*?\n\}/) || [])[0];
    T("★ aj: _tvwallCalcClean موجودة", !!cleanSrc);
    if (cleanSrc && thSrc) {
      const fakeCO = {
        statsForTasks: l => ({ total: l.length, done: 1, due: 3, overdue: 2, scheduled: 4, coverage: 25, holiday: false }),
        splitTasks: l => ({ active: l, due: l.slice(0, 3), overdue: l.slice(0, 2), done: l.slice(3, 4) }),
        coverageForTasks: () => [{ name: "مبنى أ", pct: 50 }],
        overdueDaysOf: t => t.late || 0
      };
      const tasks = [{ id: "a", name: "تنظيف دورات المياه", building: "مبنى أ", late: 3 },
                     { id: "b", name: "الأرضيات", building: "مبنى أ", late: 1 },
                     { id: "c", name: "الزجاج", building: "مبنى ب", late: 0 },
                     { id: "d", name: "النفايات", building: "مبنى ب", late: 0 }];
      const F = new Function("_tvwall", "window", "tvHealth",
        cleanSrc + "; return _tvwallCalcClean;")({ tasks: { c1: tasks }, kind: { c1: "cleaning" } },
          { cleaningOps: fakeCO }, new Function(thSrc + "; return tvHealth;")());
      const m = F("c1");
      T("★ aj: الأرقام تأتي من الوحدة كما هي (لا إعادةَ حساب)",
        m.due === 3 && m.overdue === 2 && m.doneToday === 1 && m.coverage === 25 && m.activeN === 4,
        JSON.stringify({ due: m.due, od: m.overdue, done: m.doneToday, cov: m.coverage }));
      T("★ aj: النوع مُعلَنٌ في النتيجة فتتفرّع الشاشات بلا تخمين", m.kind === "cleaning");
      T("★ aj: متأخّرتان ⇒ متابعة (نفس عتبات لوحات العرض)", m.health.key === "watch");
      T("★ aj: المستحقّاتُ مرتّبةٌ الأكثر تأخّراً أولاً",
        m.dueList[0] && m.dueList[0].id === "a" && m.worst && m.worst.id === "a");
      T("★ aj: مشروعٌ لم تصل مهامُّه بعد ⇒ null (حالةُ تحميلٍ لا أصفار)",
        new Function("_tvwall", "window", "tvHealth", cleanSrc + "; return _tvwallCalcClean;")
          ({ tasks: {}, kind: {} }, { cleaningOps: fakeCO }, new Function(thSrc + "; return tvHealth;")())("nope") === null);
      T("★ aj: بلا وحدةِ نظافةٍ محمَّلة ⇒ null لا انهيار",
        new Function("_tvwall", "window", "tvHealth", cleanSrc + "; return _tvwallCalcClean;")
          ({ tasks: { c1: tasks }, kind: {} }, {}, new Function(thSrc + "; return tvHealth;")())("c1") === null);
    }
    // (٤) الأيقونات: رموزُ الإيموجي في المركز استُبدلت بأيقونات المنصة
    T("★ aj: مساعدُ الأيقونة يستعمل مجموعة _ICON نفسها بحجمٍ صريح",
      /function _tvi\(name\)\{[\s\S]*?_svgIcon\(name\)/.test(HTML) &&
      /#tvwall-screen \.tvl-i\{[^}]*width:1\.15em/.test(HTML));
    if (wallSrc) {
      // (رسائلُ toast مستثناةٌ عمداً: الإيموجي فيها اصطلاحُ المنصة كلِّها لا زينةَ شاشة)
      T("★ aj: لا إيموجي في شرائح المركز وبطاقاته وأزراره",
        !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(wallSrc.split("\n").filter(l => l.indexOf("toast(") < 0).join("\n")),
        "رمزٌ يختلف رسمُه بين الأجهزة داخل شاشة عرضٍ موحّدة");
      T("★ aj: الشرائح تحمل مفاتيح أيقونات لا رموزاً",
        /\{i:"building2",l:"المشاريع"/.test(wallSrc) && /\{i:"ticket",\s*l:"بلاغات نشطة"/.test(wallSrc));
    }
    T("★ aj: أزرارُ التدوير وملء الشاشة والرجوع بأيقونات متّجهة",
      /id="tvl-rot-btn"[\s\S]{0,400}?<svg viewBox="0 0 24 24"/.test(HTML) &&
      /function _tvwallFsLabel\(btn, full\)\{/.test(HTML));
    // (٥) زرّ البوّابة بلا عدّ مشاريع
    T("★ aj: زرُّ بوّابة المشاريع بلا عدّ مشاريع",
      !/tvwall-count-badge/.test(HTML) && /كل المشاريع في شاشة واحدة<\/div>/.test(HTML));

    /* ── v18.9ak: علامةُ المركز من مجموعة المنصة · وشبكةُ المباني لا تقصّ بطاقة ── */
    T("★ ak: علامةُ الرادار دخلت مجموعة أيقونات المنصة (_ICON)",
      /\n  radar:'<circle cx="12" cy="12" r="2\.1"/.test(HTML));
    T("★ ak: زرُّ القائمة الجانبية بلا إيموجي، وأيقونتُه من _ICON",
      /<span class="s-icon"><\/span> مركز العمليات</.test(HTML) &&
      /var tw=document\.getElementById\('nav-tvwall-btn'\);[\s\S]{0,160}?_svgIcon\('radar'\)/.test(HTML),
      "الزرُّ بلا data-page فلا يلتقطه applyNavIcons — يُضبَط صراحةً");
    T("★ ak: أيقونةُ زرّ البوّابة لها أبعادٌ صريحة (_svgIcon يُخرج svg بلا أبعاد)",
      /#tvwall-btn-ico svg\{[^}]*width:2\dpx[^}]*height:2\dpx/.test(HTML),
      "svg بلا أبعادٍ في حاوية flex ينكمش إلى صفرٍ فيبدو المربّعُ فارغاً");
    T("★ ak: زرُّ البوّابة يقرأ العلامة نفسَها (لا نسخةَ ثانيةً من المسار)",
      /id="tvwall-btn-ico"/.test(HTML) && /_wallIco\.innerHTML = _svgIcon\("radar"\)/.test(HTML) &&
      (HTML.match(/circle cx="12" cy="12" r="2\.1"/g) || []).length === 1);
    T("★ ak: صفوفُ شبكة المباني تتقاسم الارتفاع فلا تُقصّ بطاقةُ مبنى",
      /#tvl-proj-blds\{[^}]*grid-auto-rows:minmax\(0,1fr\)[^}]*\}/.test(HTML),
      "١٧ مبنى في أربعة أعمدة = خمسةُ صفوفٍ كانت تفيض خارج العمود");
    /* v18.9an: البطاقةُ صفٌّ لا عمود — الاسمُ يأخذ العرضَ (وهو المتاح) لا الارتفاع
       (وهو الشحيح)، فلا يُقصّ اسمُ مبنًى عربيٌّ طويلٌ في أربعة أعمدةٍ ضيّقة. */
    T("★ an: بطاقةُ المبنى صفٌّ أفقيٌّ والاسمُ يتمدّد فيه",
      /\.tvw-bld\{[^}]*flex-direction:row[^}]*\}/.test(HTML) &&
      /\.tvw-bld \.bname\{flex:1;min-width:0/.test(HTML) &&
      /\.tvw-blds\{[^}]*repeat\(auto-fit,minmax\(clamp\(148px/.test(HTML),
      "عمودٌ ضيّقٌ يقصّ الاسمَ مهما فعلت بالخطّ");
    T("★ an: الاسمُ سطران لا سطرٌ واحد، والاسمُ الأصليُّ كاملٌ في title",
      /\.tvw-bld \.bname\{[^}]*-webkit-line-clamp:2/.test(HTML) &&
      (HTML.match(/<div class="tvw-bld \$\{cls\}" title="\$\{esc\(String\(b\)\)\}"/g) || []).length === 2,
      "اللوحتان معاً: لوحةُ العرض المفردة ولوحةُ المشروع في المركز");
    T("★ an: الاسمُ يسبق الرقمَ في الصف (المبنى يُعرَف باسمه لا برقمه)",
      /<div class="bname">\$\{short\}<\/div><div class="bcount">\$\{op\}<\/div>/.test(HTML));
    T("★ an: ما لا يتّسع في بطاقة الرسم يُعلَن عدداً لا يُقصّ بصمت",
      /function _tvcMore\(shown,total\)\{[\s\S]*?total>shown/.test(HTML) &&
      /_tvcMore\(cov\.length,covAll\.length\)/.test(HTML) &&
      /_tvcMore\(press\.length,withData\.length\)/.test(HTML) &&
      (HTML.match(/_tvcMore\(top\.length,topAll\.length\)/g) || []).length === 3,
      "أربعةُ مبانٍ تُقرأ «هذه كلُّ مباني المشروع»");
    T("★ an: عنوانُ بطاقة التغطية يقول «الأضعف» صراحةً لا «حسب المبنى»",
      /"أضعفُ المباني تغطيةً اليوم"/.test(HTML) && !/"تغطيةُ اليوم حسب المبنى"/.test(HTML));
  }

  // (٤) التسمية والعلامة الجديدتان — لا بقايا للاسم القديم في الواجهة
  T("★ ai: الاسم الظاهر «مركز العمليات» في الشاشة والزرّين",
    /<h1>مركز العمليات — كل المشاريع<\/h1>/.test(HTML) &&
    />مركز العمليات — كل المشاريع<\/div>/.test(HTML) &&
    /<span class="s-icon"><\/span> مركز العمليات</.test(HTML));   // v18.9ak: أيقونةُ _ICON لا إيموجي
  // (سطرُ APP_VERSION يذكر الاسم القديم عمداً — فهو يوثّق إعادةَ التسمية نفسها)
  // الاستثناء كان يشمل سطرَ APP_VERSION لأن سجلّ التغييرات كان يسكنه. بعد نقل
  // السجلّ إلى تعليقٍ تاريخيٍّ مجمَّد (ختمُ الإصدار الآليّ) صار الاستثناء عليه —
  // والمقصدُ واحد: الاسمُ القديم ممنوعٌ في **نصوص الواجهة** لا في سجلٍّ تاريخيّ.
  T("★ ai: لا بقايا لاسم «جدار المشاريع» في نصوص الواجهة",
    !/جدار المشاريع/.test(
      HTML.replace(/\/\* ══ سجلّ الإصدارات التاريخي[\s\S]*?\*\//, "")
          .replace(/const APP_VERSION = "[^"]+";[^\n]*/, "")),
    "نصٌّ ظاهرٌ بالاسم القديم");
  T("★ ai: علامةُ الرادار حلّت محلّ أيقونة الشاشة في زرّ البوّابة",
    /<circle cx="12" cy="12" r="2\.1" fill="currentColor" stroke="none"\/>/.test(HTML));

  /* ══ v18.9ao: الاسمُ يُقرأ كاملاً — لا قصَّ ولا تداخل ══ */
  {
    const shortSrc = (HTML.match(/function tvBldShort\(name\)\{[\s\S]*?\n\}/) || [])[0];
    const lblSrc = (HTML.match(/function tvBldLabels\(names\)\{[\s\S]*?\n\}/) || [])[0];
    T("★ ao: tvBldShort/tvBldLabels موجودتان (مُختصِرٌ واحدٌ لكل المواضع)", !!shortSrc && !!lblSrc);
    if (lblSrc && shortSrc) {
      const F = new Function(shortSrc + "\n" + lblSrc + "; return tvBldLabels;")();
      T("★ ao: البادئةُ العامّة تُحذف بأشكالها الأربعة (مبنى · مبني · مباني · مبانى)",
        F(["مبنى الإدارة", "مبني الخدمات", "مباني الوثائق", "مبانى الورش"]).join("|") === "الإدارة|الخدمات|الوثائق|الورش",
        "المطابقةُ النصّيةُ الحرفية كانت تلتقط شكلاً واحداً فيبقى الاسمُ بطوله");
      T("★ ao: وأطولُ بادئةِ كلماتٍ مشتركةٍ بين الجميع تُحذف بعدها",
        F(["دورة مياه الحوازم", "دورة مياه حديقة جده", "دورة مياه الرواد"]).join("|") === "الحوازم|حديقة جده|الرواد",
        "كلمتان مكرّرتان في كل اسمٍ تلتهمان نصفَ العرض ولا تميّزان شيئاً");
      T("★ ao: بادئةٌ غيرُ مشتركةٍ للجميع لا تُحذف (لا تخمين)",
        F(["دورة مياه الحوازم", "مسجد الأمانة"]).join("|") === "دورة مياه الحوازم|مسجد الأمانة");
      T("★ ao: لا يُمحى اسمٌ كاملاً مهما اشتركت كلماتُه",
        F(["مبنى الإدارة", "مبنى الإدارة العامة"]).every(x => x.length > 0) &&
        F(["أ ب", "أ ب"]).every(x => x.length > 0), JSON.stringify(F(["مبنى الإدارة", "مبنى الإدارة العامة"])));
      T("★ ao: اسمٌ واحدٌ يمرّ بلا اشتقاقِ بادئةٍ مشتركة", F(["مبنى الإدارة"]).join("") === "الإدارة");
      T("★ ao: قائمةٌ فارغةٌ أو قيمٌ غائبةٌ ⇒ لا انهيار",
        F([]).length === 0 && F(null).length === 0 && F([null, ""]).length === 2);
    }
    T("★ ao: اللوحتان والرسمُ تقرأ المُختصِرَ نفسَه (لا ثلاثَ نسخٍ من القاعدة)",
      (HTML.match(/tvBldLabels\(/g) || []).length >= 4 && !/replace\("مبنى ",""\)/.test(HTML),
      "استبدالٌ حرفيٌّ باقٍ = اسمٌ يُقصّ في موضعٍ ويُختصر في آخر");
    // الحلقةُ حاويةُ قياسٍ لنصّها — وإلا كبُر النصُّ بعرض الشاشة وصغُرت الحلقةُ بارتفاعها
    T("★ ao: الحلقةُ container والنصُّ بوحداتها (cqw) مع احتياطِ clamp قبله",
      /\.tvw-ring-wrap\{[^}]*container-type:size/.test(HTML) &&
      /\.tvw-status-word\{font-size:clamp\([^)]*\);font-size:14cqw/.test(HTML) &&
      /\.tvw-status-pct\{[^}]*font-size:clamp\([^)]*\);font-size:9\.5cqw/.test(HTML) &&
      /\.tvw-status-why\{font-size:clamp\([^)]*\);font-size:5\.6cqw/.test(HTML),
      "نصٌّ مقيسٌ بـvw داخل حلقةٍ مقيسةٍ بـvh ⇒ تداخلُ سطورٍ على شاشةٍ عريضةٍ قصيرة");
    T("★ ao: اسمُ الصفّ في الرسم سطران بحصّةٍ أوسعَ من شريطه",
      /\.tvl-hb \.r\{[^}]*minmax\(0,1\.45fr\) minmax\(0,1\.15fr\) auto/.test(HTML) &&
      /\.tvl-hb \.r \.n\{[^}]*-webkit-line-clamp:2/.test(HTML) &&
      !/\.tvl-hb \.r \.n\{[^}]*white-space:nowrap/.test(HTML),
      "سطرٌ واحدٌ في ٨٠ بكسل لا يسع اسمَ مشروعٍ عربيّ");
  }

  /* ══ v18.9am: فصلُ إنجاز الشهر عن عدد المتأخّرات — مقياسان ⇒ ترميزان ══ */
  {
    const toneSrc = (HTML.match(/function tvRateTone\(pct\)\{[\s\S]*?\n\}/) || [])[0];
    T("★ am: tvRateTone موجودة (مصدرٌ واحدٌ لنبرة الإنجاز)", !!toneSrc);
    if (toneSrc) {
      const tone = new Function(toneSrc + "; return tvRateTone;")();
      T("★ am: ٩٠٪ فأكثر إنجازٌ عالٍ (أخضر) مهما بلغ عددُ المتأخّرات",
        tone(94).key === "high" && tone(90).key === "high" && tone(100).c === "var(--green)");
      T("★ am: ٧٥–٨٩ متوسّط · دون ٧٥ منخفض", tone(89).key === "mid" && tone(75).key === "mid" && tone(74).key === "low");
      T("★ am: بلا نسبةٍ ⇒ نبرةٌ محايدةٌ لا خضراءُ ولا حمراء (null ≠ صفر)",
        tone(null).key === "none" && tone(undefined).key === "none" && tone(0).key === "low");
      T("★ am: عتباتُ الإنجاز مستقلّةٌ عن عتبات tvHealth (مقياسان لا يشتركان)",
        !/overdue|tvHealth|SLA/.test(toneSrc), "أيُّ ذكرٍ للتأخّر هنا يعيد خلطَ المقياسين");
    }
    // الحلقةُ والنسبةُ والشريطُ يقرأون النبرة، والكلمةُ وسببُها يقرآن الصحّة
    T("★ am: حلقةُ الجاهزية ونسبتُها بنبرة الإنجاز لا بلون الصحّة",
      /\.tvw-ring-prog\{[^}]*stroke:var\(--rate,var\(--health\)\)/.test(HTML) &&
      /\.tvw-status-pct\{[^}]*color:var\(--rate,var\(--ink\)\)/.test(HTML),
      "إنجازُ ٩٤٪ مرسومٌ بالأحمر: لونٌ يقول «سيّئ» ورقمٌ يقول «ممتاز»");
    T("★ am: شريطُ الإنجاز في البطاقة بنبرته هو",
      /\.tvl-c-fill\{[^}]*background:var\(--bc,var\(--c,var\(--brand\)\)\)/.test(HTML) &&
      /--bc:\$\{tvRateTone\(barV\)\.c\}/.test(HTML));
    T("★ am: كلمةُ الحالة تبقى بلون الصحّة (الترميزان لا يتبادلان)",
      /\.tvw-status-word\{[^}]*color:var\(--health\)/.test(HTML) &&
      /\.tvw-status-why\{[^}]*color:var\(--health\)/.test(HTML));
    T("★ am: سببُ الكلمة مكتوبٌ تحتها في اللوحتين (لا تُقرأ حكماً على النسبة)",
      /id="tvw-b-why"/.test(HTML) && /id="tvl-proj-bwhy"/.test(HTML) &&
      /setTx\("tvw-b-why",overdue\?/.test(HTML) && /setTx\("tvl-proj-bwhy"/.test(HTML));
    T("★ am: سببُ النظافة بمفرداتها (مهمّة متأخّرة لا بلاغ)",
      /cleanP\?" مهمّة متأخّرة":" متأخرة عن SLA"/.test(HTML));
    T("★ am: النبرةُ تُضبط على الحاوية في اللوحتين معاً",
      /_beacon\.style\.setProperty\("--rate",_tone\.c\)/.test(HTML) &&
      /beaconEl\.style\.setProperty\("--rate",tone\.c\)/.test(HTML));
  }

  /* ══ v18.9al: شريطُ التحليلات — الرسومُ داخل المركز ══ */
  {
    // (١) الرسمُ بلا مكتبةٍ ولا شبكة: الجدارُ قد لا يصله CDN
    if (wallSrc) {
      T("★ al: الرسمُ بـSVG/HTML خالصٍ بلا مكتبةِ رسمٍ خارجية",
        !/new Chart\(/.test(wallSrc) && !/https?:\/\/[^"'\s]*(cdn|unpkg|jsdelivr)/i.test(wallSrc) && /<svg viewBox="0 0 \$\{W\} \$\{H\}"/.test(wallSrc),
        "مكتبةٌ خارجيةٌ = لوحةٌ فارغةٌ عند أوّل انقطاع");
      T("★ al: ألوانُ SVG في style لا في سمةِ العرض (var() لا يُحلّ في السمة)",
        /style="stroke:\$\{s\.c\}"/.test(wallSrc) && !/stroke="\$\{s\.c\}"/.test(wallSrc));
      T("★ al: الشريطان مربوطان بمسارَي الرسم (لا يُبنيان ثم يُهملان)",
        /_tvwallAnaAll\(rows\);/.test(wallSrc) && /_tvwallAnaProject\(pid,m\);/.test(wallSrc) &&
        /_tvwallAnaProject\(pid,null\);/.test(wallSrc), "حالةُ التحميل تمسح الشريط ولا تُبقي رسمَ مشروعٍ سابق");
      T("★ al: الحاويتان في الشاشتين معاً (الكل + لوحة المشروع)",
        /id="tvl-ana-all"/.test(HTML) && /id="tvl-ana-proj"/.test(HTML));
      T("★ al: شريطٌ فارغٌ يختفي ولا يترك فجوةً بارتفاعٍ ثابت",
        /\.tvl-ana:empty\{display:none\}/.test(HTML));
      T("★ al: تسمياتُ محور الزمن ltr قسراً (وإلا قُرئ الرسمُ معكوساً)",
        /\.tvl-ch-x\{[^}]*direction:ltr/.test(HTML));
      T("★ al: صفوفُ الرسم الأفقي تُحسَب بعددٍ يتبع الارتفاع، لا تُخفى بـCSS",
        /function _tvcRows\(\)\{ return \(window\.innerHeight\|\|900\) < 1000 \? 3 : TVWALL_BAR_ROWS; \}/.test(wallSrc) &&
        !/\.tvl-hb \.r:nth-child/.test(HTML), "إخفاءُ صفٍّ بـCSS قصٌّ صامتٌ يُقرأ «هذا كلُّ شيء»");
      T("★ al: نبضُ التشغيل وحلقةُ الجاهزية في المركز محدودان بالارتفاع أيضاً",
        /#tvwall-screen \.tvl-screen-proj \.tvw-kpi \.kv\{font-size:clamp\([^)]*min\(4\.2vw,/.test(HTML) &&
        /#tvwall-screen \.tvl-screen-proj \.tvw-ring-wrap\{width:min\(/.test(HTML),
        "قياسٌ بالعرض وحدَه يفيض على عمودٍ أقصر ويقصّ التسمية");
    }
    // (٢) حركةُ ١٤ يوماً — تنفيذٌ حقيقيٌّ للدالة
    const trendSrc = (HTML.match(/function _tvwallTrend\(lists\)\{[\s\S]*?\n\}/) || [])[0];
    T("★ al: _tvwallTrend موجودة", !!trendSrc);
    if (trendSrc) {
      const F = new Function("TVWALL_TREND_DAYS", trendSrc + "; return _tvwallTrend;")(14);
      const day = k => new Date(Date.now() - k * 86400000).toISOString().slice(0, 10);
      const r = F([[
        { status: "مفتوح", createdAt: day(0) + "T08:00:00.000Z" },
        { status: "مفتوح", createdAt: day(0) + "T09:00:00.000Z" },
        { status: "مغلق",  createdAt: day(5) + "T08:00:00.000Z", closedAt: day(1) + "T08:00:00.000Z" },
        { status: "مغلق",  createdAt: day(40) + "T08:00:00.000Z", closedAt: day(2) + "T08:00:00.000Z" }, // أُنشئ خارج النافذة وأُغلق داخلها
        { status: "مفتوح", createdAt: day(0) + "T10:00:00.000Z", archived: true },                        // مؤرشف — تعدّه البلاطات فيَعدّه المنحنى
        { status: "مفتوح", createdAt: day(60) + "T08:00:00.000Z" }                                        // خارج النافذة تماماً
      ]]);
      T("★ al: النافذةُ أربعةَ عشرَ يوماً، آخرُها اليوم",
        r.days.length === 14 && r.days[13] === day(0) && r.days[0] === day(13), r.days[0] + " → " + r.days[13]);
      T("★ al: الوارِدُ يُعدّ بيوم الإنشاء والمغلقُ بيوم الإغلاق (لا بيومٍ واحد)",
        r.opened[13] === 3 && r.closed[12] === 1 && r.closed[11] === 1 && r.opened[8] === 1,
        JSON.stringify({ opened: r.opened, closed: r.closed }));
      T("★ am: المنحنى يَعدّ المؤرشفَ كما تَعدّه بلاطاتُ المدد (سكّانٌ واحدون)",
        r.openedN === 4 && r.closedN === 2, `وارد=${r.openedN} مغلق=${r.closedN}`);
      T("★ al: ما خرج من النافذة لا يُحشر في طرفها (لا قمّةٌ ملفَّقةٌ يوم ١)",
        r.opened[0] === 0, "opened[0]=" + r.opened[0]);
      T("★ al: قائمةٌ فارغةٌ أو غائبةٌ ⇒ أصفارٌ لا انهيار",
        F([]).openedN === 0 && F([null]).closedN === 0 && F(null).opened.length === 14);
      /* الحارسُ الذي أمسك العطل على شاشةٍ حقيقية: نافذةُ الأربعةَ عشرَ يوماً **تحتوي**
         الشهرَ حتى اليوم، فوارِدُها لا يمكن أن يقلّ عن «بلاغات الشهر» أبداً. كان
         المنحنى يستثني المؤرشفَ والبلاطةُ تَعدّه، فظهر «الشهر ١٢٨» و«وارد ٩٣». */
      if (calcSrc && thSrc) {
        const rows = [];
        const mo = new Date().toISOString().slice(0, 7);
        for (let i = 0; i < 9; i++) rows.push({ id: "A" + i, status: "مغلق", archived: i % 3 === 0,
          createdAt: day(i) + "T08:00:00.000Z", closedAt: day(0) + "T09:00:00.000Z" });
        const inMonth = rows.filter(t => t.createdAt.slice(0, 7) === mo).length;
        const calc = new Function("_tvwall", "isOverdue", "tvHealth", calcSrc + "; return _tvwallCalcTickets;")
          ({ data: { p: rows } }, () => false, new Function(thSrc + "; return tvHealth;")())("p");
        const tr = F([rows]);
        T("★ am: وارِدُ المنحنى ≥ بلاغات الشهر (النافذةُ تحتوي الشهرَ فلا تنقص عنه)",
          tr.openedN >= calc.monthN && calc.monthN === inMonth,
          `وارد=${tr.openedN} الشهر=${calc.monthN}`);
        T("★ am: ومغلقُ المنحنى ≥ مغلقِ الشهر بنفس السبب",
          tr.closedN >= calc.monthClosed, `مغلق=${tr.closedN} مغلق الشهر=${calc.monthClosed}`);
      }
    }
    // (٣) توزيعُ الالتزام بالمهلة — من slaOf وحدها
    const slaSrc = (HTML.match(/function _tvwallSlaSplit\(list\)\{[\s\S]*?\n\}/) || [])[0];
    T("★ al: _tvwallSlaSplit موجودة", !!slaSrc);
    if (slaSrc) {
      const F = new Function("slaOf", slaSrc + "; return _tvwallSlaSplit;")(
        t => t.st ? { state: t.st } : null);
      const o = F([{ st: "تجاوز" }, { st: "تجاوز" }, { st: "اقترب" }, { st: "داخل الوقت" }, {}]);
      T("★ al: كلُّ بلاغٍ في خانةٍ واحدة والمجموعُ = العدد",
        o.over === 2 && o.near === 1 && o.ok === 1 && o.none === 1 &&
        (o.over + o.near + o.ok + o.none) === 5, JSON.stringify(o));
      T("★ al: بلا فئةِ مهلةٍ يُعرَض على حدةٍ لا يُلحَق بالملتزم (تجميلٌ لا قياس)", o.ok === 1);
      T("★ al: بلا دالّةِ SLA محمَّلةٍ لا انهيار",
        new Function("slaOf", slaSrc + "; return _tvwallSlaSplit;")(undefined)([{}, {}]).none === 2);
    }
    // (٤) أعلى القيم — ترتيبٌ وقصٌّ مُعلَنان
    const topSrc = (HTML.match(/function _tvwallTop\(list, field, n\)\{[\s\S]*?\n\}/) || [])[0];
    T("★ al: _tvwallTop موجودة", !!topSrc);
    if (topSrc) {
      const F = new Function(topSrc + "; return _tvwallTop;")();
      const r = F([{ w: "كهرباء" }, { w: "كهرباء" }, { w: "كهرباء" }, { w: "سباكة" }, { w: "سباكة" },
                   { w: "تكييف" }, { w: "" }, { w: "نجارة" }, { w: "دهان" }], "w", 3);
      T("★ al: الأعلى أولاً وبعددٍ محدود", r.length === 3 && r[0].l === "كهرباء" && r[0].v === 3 && r[1].v === 2);
      T("★ al: الحقلُ الفارغ يُسمّى «غير محدّد» ولا يُسقَط بصمت",
        F([{ w: "" }, { w: null }], "w", 5)[0].l === "غير محدّد");
      T("★ al: قائمةٌ فارغةٌ ⇒ مصفوفةٌ فارغة لا انهيار", F([], "w", 5).length === 0 && F(null, "w", 5).length === 0);
    }
    // (٥) رسمُ الأشكال نفسُه — يُنفَّذ ويُفحَص مُخرَجُه
    const chartFns = ["_tvcNone", "_tvcLegend", "_tvcLine", "_tvcBars", "_tvcCols", "_tvcStack"]
      .map(n => (HTML.match(new RegExp("function " + n + "\\([^)]*\\)\\{[\\s\\S]*?\\n\\}")) || [])[0]);
    const chartSrc = chartFns.filter(Boolean).join("\n");
    T("★ al: دوالُّ الرسم كلُّها موجودة", chartFns.every(Boolean), chartFns.filter(x => !x).length + " مفقودة");
    if (chartSrc) {
      const mk = () => new Function("esc", "_tvcSeq", chartSrc + "; return {_tvcLine,_tvcBars,_tvcCols,_tvcStack};")
        (s => String(s), 0);
      const C = mk();
      const bars = C._tvcBars([{ l: "أ", v: 4, segs: [{ w: 100, c: "red" }] },
                               { l: "ب", v: 2, segs: [{ w: 50, c: "red" }] }]);
      T("★ al: الأعمدةُ الأفقية بمقامٍ واحدٍ لكل الصفوف (وإلا كذب طولُ الشريط)",
        /width:100\.0%/.test(bars) && /width:50\.0%/.test(bars));
      T("★ al: القطعةُ الصفرية لا تُرسم (شريطٌ بعرضٍ صفرٍ زينةٌ لا معلومة)",
        !/width:0\.0%/.test(C._tvcBars([{ l: "أ", v: 0, segs: [{ w: 0, c: "red" }] }])));
      T("★ al: بلا صفوفٍ ⇒ رسالةُ «لا بيانات» لا رسمٌ فارغ", /tvl-ch-none/.test(C._tvcBars([])));
      const cols = C._tvcCols([{ l: "يوم", v: 2 }, { l: "حتى ٣", v: 8 }], "red");
      T("★ al: أطولُ عمودٍ يبلغ السقفَ والباقي نسبةً منه",
        /top:0%/.test(cols) && /top:75%/.test(cols), cols.replace(/\s+/g, " ").slice(0, 120));
      T("★ al: كلُّ الأعمدة أصفارٌ ⇒ «لا بيانات» لا خطٌّ عند القاع",
        /tvl-ch-none/.test(C._tvcCols([{ l: "أ", v: 0 }, { l: "ب", v: 0 }], "red")));
      const st = C._tvcStack([{ l: "داخل الوقت", v: 3, c: "g" }, { l: "اقترب", v: 0, c: "a" }, { l: "تجاوز", v: 1, c: "r" }]);
      T("★ al: المكدَّسُ نِسَبٌ من مجموعه، والقطعةُ الصفريةُ لا تُرسم",
        /flex:3/.test(st) && /flex:1/.test(st) && !/flex:0/.test(st));
      T("★ al: كلُّ قطعةٍ مسمّاةٌ برقمها ولو كانت صفراً (لا قراءةَ باللون وحده)",
        (st.match(/<b class="tvw-num">/g) || []).length === 3 && /اقترب/.test(st));
      T("★ al: مجموعٌ صفرٌ ⇒ «لا بيانات» لا شريطٌ ملوَّنٌ بلا معنى",
        /tvl-ch-none/.test(C._tvcStack([{ l: "أ", v: 0, c: "g" }])));
      const line = C._tvcLine([{ c: "b", pts: [0, 2, 4] }, { c: "g", pts: [1, 1, 1] }], ["a", "b", "ج"]);
      T("★ al: المنحنى سلسلتان على محورٍ واحد (مقامٌ واحدٌ لكلتيهما)",
        (line.match(/<path/g) || []).length === 3 && /preserveAspectRatio="none"/.test(line) &&
        /vector-effect="non-scaling-stroke"/.test(line), "محوران لمقياسين = أشهرُ خطأٍ في الرسوم");
      T("★ al: نقطةٌ واحدةٌ لا تُرسم منحنى (خطٌّ بلا اتّجاه)",
        /tvl-ch-none/.test(C._tvcLine([{ c: "b", pts: [3] }], ["a"])));
      T("★ al: معرّفُ التدرّج فريدٌ لكل رسم (تكرارُه = تدرّجٌ خاطئ)",
        (C._tvcLine([{ c: "b", pts: [1, 2] }], null).match(/id="(tvcg\d+)"/) || [])[1] !==
        (C._tvcLine([{ c: "b", pts: [1, 2] }], null).match(/id="(tvcg\d+)"/) || [])[1]);
    }
  }
}

/* ══════════════════════════════════════════════════════════════════
   وحدة التعاقدات (contracts.js) — المرحلة ١
   حرّاسٌ على الدوالّ النقية وحدها: هي مصدرُ الحقيقة الحسابيّ، وكلُّ شاشةٍ
   تُبنى فوقها لاحقاً تقرؤها ولا تعيد حسابها.
   ══════════════════════════════════════════════════════════════════ */
function contractsPhase1() {
  H("وحدة التعاقدات — المرحلة ١ (contracts.js)");
  if (!CTR_PATH) { T("contracts.js موجود", false); return; }
  const src = fs.readFileSync(CTR_PATH, "utf8");
  const vm = require("vm");
  try { new vm.Script(src); T("صياغة contracts.js سليمة", true); }
  catch (e) { T("صياغة contracts.js سليمة", false, String(e.message).slice(0, 120)); return; }

  // ── نقطة الربط الوحيدة في index.html ──
  T("الوسم موجود في index.html", /<script src="contracts\.js\?v=/.test(HTML));

  const ctrBuild = (src.match(/var MODULE_BUILD = "(v[\d.a-z]+)"/) || [])[1];
  T("★ MODULE_BUILD يطابق APP_VERSION (يُرفَعان معاً)",
    ctrBuild === VER, `MODULE_BUILD=${ctrBuild}  APP_VERSION=${VER}`);

  /* ── العزل عن مسار المشتريات ──
     القرارُ المحوريّ يبقى: **أمرُ الإسناد ليس طلبَ شراء**. لكنّ المرحلة ٨ فتحت ثقباً
     واحداً مقصوداً: كتابةُ `contractId` على طلبِ شراءٍ قائم. وهذا **عكسُ التسريب** —
     به يُستبعَد الطلبُ من مصروف الشراء فلا يُحسب المالُ مرّتين؛ وبدونه كان الحارسُ
     الذي بنته المرحلةُ ٥ باباً بلا مفتاح.
     فالعهدُ يُضيَّق ولا يُلغى: **حقلُ الربط وحدَه**، ولا إنشاءَ طلبٍ ولا تحريكَ حالته
     ولا مساسَ بمبالغه. وهذه الحرّاسُ تُثبّت الحدَّ الجديد بدقّة. */
  T("★★ لا تكتب في مجموعة المشتريات إلا **حقلَ الربط** (contractId) لا غير",
    (function () {
      const writes = src.match(/collection\(PURCH_COL\(\)\)[\s\S]{0,400}?\{ merge:true \}/g) || [];
      if (writes.length !== 1) return false;
      const w = writes[0];
      const fields = (w.match(/([A-Za-z_]+)\s*:/g) || []).map(x => x.replace(/\s*:$/, ""));
      const allowed = new Set(["contractId", "updatedAt", "updatedBy", "merge"]);
      return fields.every(f => allowed.has(f));
    })());
  T("★ ولا تُنشئ طلبَ شراءٍ ولا تحرّك حالتَه ولا تمسّ مبالغه",
    !/\bsavePurchase\s*\(/.test(src) &&
    !/PURCH_COL\(\)\)\.add\(/.test(src) &&
    !/status\s*:\s*["'](pending_pm|pm_approved|proc_executing|closed)/.test(src) &&
    !/estCost\s*:|actualCost\s*:/.test(src));
  T("★ وقراءةُ الطلبات من مصفوفة النواة بلا مستمعٍ ثانٍ للمجموعة نفسِها",
    /function allPurchases\(\)/.test(src) && !/PURCH_COL\(\)\)\.onSnapshot/.test(src));
  T("★ لا تلمس المخزون ولا البند المستعاض",
    !/_inventoryItems|substituteBudget|substituteAccountId/.test(src));
  T("مجموعاتها الخاصة معرّفة مع نسخ التطوير",
    /global_vendors_dev/.test(src) && /global_contract_requests_dev/.test(src) &&
    /global_contracts_dev/.test(src) && /global_contract_extracts_dev/.test(src));

  /* ── السقوف: واحدٌ مقروءٌ من النواة، وواحدٌ من وثيقة الإعدادات نفسها ── */
  T("★ سقف التنفيذي يُقرأ من CEO_APPROVAL_THRESHOLD الموحّد لا رقماً مكتوباً",
    /CEO_APPROVAL_THRESHOLD/.test(src));
  T("★ عتبة أمر الدفع تُقرأ من وثيقة إعدادات المشتريات نفسها (بلا وثيقة ثانية)",
    /global_purchase_config/.test(src) && /contractPayOrderThreshold/.test(src));

  /* ── الأمان: معاملات onclick عبر _jq لا esc (درس v18.9vu-H5) ── */
  T("★ معاملات onclick النصية تمرّ عبر _jq لا esc",
    /function _jq\(/.test(src) && !/onclick="[^"]*\(\\'\s*\+\s*_esc\(/.test(src));

  // ── تحميلُ الوحدة في سياقٍ بلا مستند: الدوالُّ النقية يجب أن تعمل وحدها ──
  const sandbox = { window: {}, console, document: undefined };
  vm.createContext(sandbox);
  try { vm.runInContext(src, sandbox); }
  catch (e) { T("★ تُحمَّل بلا DOM (الدوال النقية قابلة للفحص)", false, String(e.message).slice(0, 120)); return; }
  T("★ تُحمَّل بلا DOM (الدوال النقية قابلة للفحص)", true);

  const C = sandbox.window.contracts;
  T("تعرّض window.contracts ودوالَّها النقية",
    C && typeof C._vatSplit === "function" && typeof C._crqNextStage === "function" &&
    typeof C._extNet === "function" && typeof C._payOrderAllowed === "function");
  if (!C || typeof C._crqNextStage !== "function") return;

  /* ════ الضريبة: ثلاثةُ أوضاعٍ لا وضعان ════ */
  const ex = C._vatSplit(100, "excl"), inc = C._vatSplit(115, "incl"), non = C._vatSplit(100, "none");
  T("ض.ق.م — excl: 100 ⇐ أساس 100 وضريبة 15 وإجمالي 115",
    ex.base === 100 && ex.vat === 15 && ex.total === 115);
  T("ض.ق.م — incl: 115 ⇐ أساس 100 وضريبة 15",
    inc.base === 100 && inc.vat === 15 && inc.total === 115);
  T("★ ض.ق.م — none: بلا ضريبة إطلاقاً (لا يُستخرَج ١٥٪ وهميّ من غير المسجَّل)",
    non.base === 100 && non.vat === 0 && non.total === 100);
  T("وضعٌ مجهول يرتدّ إلى incl (لا ضريبةَ تُخترَع ولا تضيع)",
    C._vatSplit(115, "zzz").vat === 15);

  /* ════ التقريبُ على الوحدة لا على السطر — اصطلاحُ المنصة ════
     10.10 × 3 بوضع excl: على الوحدة 11.62×3 = 34.86، وعلى السطر 34.845 ⇐ 34.85. */
  T("★ ض.ق.م تُقرَّب على سعر الوحدة ثم تُضرب في الكمية (34.86 لا 34.85)",
    C._lineTotal(3, 10.10, "excl").total === 34.86,
    `الناتج=${C._lineTotal(3, 10.10, "excl").total}`);
  T("بندٌ بوضع none لا ضريبة له مهما كانت الكمية",
    C._lineTotal(7, 33.33, "none").vat === 0);

  /* ════ عتبةُ أمر الدفع: تسمح دونها وتمنع فوقها ════ */
  const PT = 3000;
  T("★ أمر الدفع مسموحٌ دون العتبة (2999 < 3000)", C._payOrderAllowed(2999, PT) === true);
  T("★ أمر الدفع ممنوعٌ عند العتبة وفوقها (بابٌ خلفيٌّ للعقود لولا ذلك)",
    C._payOrderAllowed(3000, PT) === false && C._payOrderAllowed(50000, PT) === false);
  T("مبلغٌ صفريٌّ أو سالبٌ لا يفتح مسارَ أمر الدفع",
    C._payOrderAllowed(0, PT) === false && C._payOrderAllowed(-5, PT) === false);

  /* ════ سندُ صرفِ أمر الدفع: المبلغُ كتابةً · الحالةُ · التوقيعات ════
     الورقةُ تخرج من المنصّة ويُصرَف بها مال، فثلاثةُ حرّاسٍ عليها:
     التفقيطُ يطابق الرقم، والورقةُ تُعلن أنها غيرُ صالحةٍ للصرف ما لم تكتمل
     بوّاباتُها، وقائمةُ التوقيعات تطابق مسارَ `crqNextStage` نفسَه. */
  {
    const W = (n) => C._amountWords(n);
    T("★★ التفقيط — ألفٌ ومائتان (الرقمُ في الورقة مرّتين: رقماً وكتابةً)",
      W(1200) === "ألف ومائتان ريال لا غير", W(1200));
    T("★ والهللاتُ تُكتَب حين توجد وتُسكَت حين لا توجد",
      W(1500.75) === "ألف وخمسمائة ريال وخمسة وسبعون هللة لا غير" &&
      W(1500) === "ألف وخمسمائة ريال لا غير", W(1500.75));
    T("★ وصيغةُ العملة تتبع العدد: ريالٌ واحد · ريالان · ثلاثةُ ريالات",
      W(1) === "ريال واحد لا غير" && W(2) === "ريالان لا غير" && W(3) === "ثلاثة ريالات لا غير",
      [W(1), W(2), W(3)].join(" | "));
    T("★ والمراتبُ بصيغها: ألفان · ثلاثةُ آلافٍ · ومليون",
      W(2000) === "ألفان ريال لا غير" && W(3000) === "ثلاثة آلاف ريال لا غير" &&
      W(1000000) === "مليون ريال لا غير", [W(2000), W(3000), W(1000000)].join(" | "));
    T("★ وصفرٌ يُكتَب صفراً لا فراغاً (خانةٌ فارغةٌ في سندِ صرفٍ تُملأ بقلم)",
      W(0) === "صفر ريال لا غير", W(0));
    T("★★ والتفقيطُ يُقرِّب كما يُقرِّب `r2` — فلا يفترق المكتوبُ عن المرسوم",
      W(0.005) === "صفر ريال وهللة واحدة لا غير" && W(99.994) === "تسعة وتسعون ريال وتسعة وتسعون هللة لا غير",
      [W(0.005), W(99.994)].join(" | "));

    const stOf = (s) => C._payOrderPrintState({ status: s });
    T("★★ أمرٌ لم تكتمل بوّاباتُه يخرج ورقةً موسومةً **غير صالحةٍ للصرف**",
      stOf("crq_pending_pm").key === "draft" && /غير صالح/.test(stOf("crq_pending_pm").lbl));
    T("★★ وبعد اكتمال الاعتمادات وحدَها يصير صالحاً للصرف",
      stOf("crq_pending_pay").key === "due" && /صالحٌ للصرف/.test(stOf("crq_pending_pay").lbl));
    T("★ والمسدَّدُ نسخةُ حفظٍ لا أمرُ صرفٍ جديد", stOf("crq_paid").key === "paid");
    T("★★ والملغى والمُعادُ للتصحيح يخرجان موسومَين **لا يُصرَف**",
      stOf("crq_cancelled").key === "void" && stOf("crq_proc_returned").key === "void" &&
      /لا يُصرَف/.test(stOf("crq_cancelled").lbl) && /لا يُصرَف/.test(stOf("crq_proc_returned").lbl));

    /* التوقيعاتُ تُشتقّ من حقول الاعتماد نفسِها — فلا تطبع الورقةُ بوّابةً لا يمرّ
       بها الأمرُ ولا تُسقط بوّابةً مرّ بها. والحارسُ يقارنها بمسار `crqNextStage`. */
    const payReq = { engagement: "pay_order", vatMode: "none", lines: [{ qty: 1, unitPrice: 1500 }] };
    T("★★ توقيعاتُ أمرِ دفعٍ دون سقف التنفيذي: مدير المشاريع · المشتريات · المالية — السداد",
      C._payOrderSignoffs(payReq, 3000).map(g => g.key).join(",") === "pm,proc,pay",
      C._payOrderSignoffs(payReq, 3000).map(g => g.key).join(","));
    T("★★ وفوق السقف تظهر خانةُ التنفيذي — بالقاعدة التي تُوقف الطلبَ عندها",
      C._payOrderSignoffs({ ...payReq, lines: [{ qty: 1, unitPrice: 9000 }] }, 3000)
        .map(g => g.key).join(",") === "pm,proc,ceo,pay");
    T("★ وخانةُ من لم يوقّع تبقى فارغةً لا تُملأ باسمٍ لم يعتمد",
      C._payOrderSignoffs({ ...payReq, pmApprovedBy: "مدير المشاريع", pmApprovedAt: "2026-08-01T09:00" }, 3000)
        .filter(g => g.by).map(g => g.key).join(",") === "pm");
    T("★ والسدادُ يُملأ من `payment` لا من حقلِ اعتماد",
      C._payOrderSignoffs({ ...payReq, payment: { by: "المالية", at: "2026-08-02T09:00", amount: 1500 } }, 3000)
        .filter(g => g.key === "pay")[0].by === "المالية");
  }

  /* ════ مسودةُ العقد في مراحل الاعتماد ════   (طلبُ المالك)
     المعتمِدُ يوقّع على ارتباطٍ لا على ملخّصه، فالمسودةُ تُعرَض في كلّ مرحلةٍ للجميع.
     وحارسُها ثلاثةُ أشياء: (١) أنها **الدالّةُ الناقلةُ نفسُها** لا محاكاةٌ لها،
     (٢) أنها تُعلن حالتَها فلا تُقرأ عقداً نافذاً، (٣) أن خاناتِ اعتمادها هي
     بوّاباتُ مسارِه هو — بمصدرٍ واحدٍ يخدم سندَ الصرف والمسودةَ معاً. */
  {
    const ctrReq = {
      id: "CRQ-2608-0009", engagement: "contract", vendorId: "V1", vendorName: "مؤسسة الطريق",
      projectId: "hail", title: "تركيب بلدورة", vatMode: "none",
      lines: [{ id: "l1", desc: "بلدورة", unit: "م.ط", qty: 160, unitPrice: 9 }],
      penalty: { mode: "amount", perDayAmount: 500 }, retention: { pct: 5 },
      warranty: { months: 12 }, durationDays: 10, status: "crq_pending_finance"
    };
    T("★★ المسودةُ تُبنى بـ`contractFromRequest` نفسِها — لا وثيقةَ ثانيةَ تفترق عمّا سيُنشأ",
      typeof C._crqDraftContract === "function" &&
      JSON.stringify({ ...C._crqDraftContract(ctrReq, undefined), timeline: 0 }) ===
      JSON.stringify({ ...C._contractFromRequest(ctrReq, "", "", "", undefined), timeline: 0 }));

    const dc = C._crqDraftContract(ctrReq, undefined);
    T("★★ وتحمل قيمةَ الطلب وبنودَه وشروطَه التجارية كما اعتمدها الموقّعون",
      dc.value === C._crqValueOf(ctrReq) && dc.value === 1440 && dc.lines.length === 1 &&
      dc.retention.pct === 5 && dc.warranty.months === 12 && dc.penalty.perDayAmount === 500,
      String(dc.value));
    T("★ وشروطُها القانونيةُ من القوالب، والماليةُ تتولّد من أرقام الطلب نصّاً",
      dc.clauses.length === C._DEFAULT_CLAUSES.length &&
      C._allClausesOf(dc).some(g => g.items.some(x => x.key === "_fin_pen" && /500\.00 ريال/.test(x.body))));
    T("★★ وبلا رقمِ عقدٍ مخترَع — الرقمُ يُولد مع العقد لا مع مسودته", dc.id === "");

    const ds = (s, extra) => C._crqDraftState({ status: s, ...(extra || {}) });
    T("★★ مسودةُ طلبٍ لم تكتمل بوّاباتُه تخرج موسومةً **لا تُوقَّع**",
      ["crq_pending_pm", "crq_pending_proc", "crq_pending_finance", "crq_pending_ceo"]
        .every(s => ds(s).key === "draft" && /لا تُوقَّع/.test(ds(s).lbl)));
    T("★ والمعتمَدُ يُعلن أنه صورةُ العقد الذي سيُنشأ", ds("crq_approved").key === "ready");
    T("★ والمحوَّلُ يدلّ على العقد نفسِه لا على مسودته",
      ds("crq_converted", { contractId: "CTR-1" }).key === "issued" &&
      /CTR-1/.test(ds("crq_converted", { contractId: "CTR-1" }).lbl));
    T("★★ والملغى والمُعادُ للتصحيح يخرجان موسومَين **لا يُتعاقَد به**",
      ds("crq_cancelled").key === "void" && ds("crq_finance_returned").key === "void" &&
      /لا يُتعاقَد به/.test(ds("crq_cancelled").lbl));

    T("★★ خاناتُ اعتماد العقد: مدير المشاريع · المشتريات · المالية (وبلا تنفيذيٍّ دون سقفه)",
      C._crqSignoffs(ctrReq, 50000).map(g => g.key).join(",") === "pm,proc,finance",
      C._crqSignoffs(ctrReq, 50000).map(g => g.key).join(","));
    T("★ وفوق السقف تظهر خانةُ التنفيذي — بالقاعدة التي تُوقف الطلبَ عندها",
      C._crqSignoffs(ctrReq, 1000).map(g => g.key).join(",") === "pm,proc,finance,ceo");
    T("★★ وأمرُ الدفع بلا خانةِ اعتمادٍ ماليّ — الماليةُ فيه مُسدِّدةٌ لا مُعتمِدة",
      C._crqSignoffs({ engagement: "pay_order", lines: [{ qty: 1, unitPrice: 1500 }] }, 3000)
        .map(g => g.key).join(",") === "pm,proc");
    T("★ ومسمّياتُ الخانات من `GATE_ROLES` نفسِها التي تحرس الأزرار",
      C._crqSignoffs(ctrReq, 50000).map(g => g.lbl).join(",") === "مدير المشاريع,المشتريات,المالية");
  }

  /* ════ التوجيه: دالةٌ واحدةٌ للعقد ولأمر الدفع ════ */
  const TH = 2000;
  const ns = (r) => C._crqNextStage(r, TH);
  const big = { engagement: "contract", value: 50000 };
  T("طلبُ التعاقد يبدأ عند مدير المشاريع", ns(big) === "crq_pending_pm");
  T("ثم المشتريات", ns({ ...big, pmApprovedAt: "x" }) === "crq_pending_proc");
  T("ثم المالية", ns({ ...big, pmApprovedAt: "x", procApprovedAt: "x" }) === "crq_pending_finance");
  T("ثم التنفيذي فوق السقف",
    ns({ ...big, pmApprovedAt: "x", procApprovedAt: "x", financeApprovedAt: "x" }) === "crq_pending_ceo");
  T("واعتمادٌ مطابقٌ يُنهي الطلب معتمَداً",
    ns({ ...big, pmApprovedAt: "x", procApprovedAt: "x", financeApprovedAt: "x", ceoApprovedAt: "x", ceoApprovedAmount: 50000 }) === "crq_approved");
  T("★ اعتماد التنفيذي يسقط إن رُفعت القيمة فوق ما اعتمده",
    ns({ ...big, value: 60000, pmApprovedAt: "x", procApprovedAt: "x", financeApprovedAt: "x", ceoApprovedAt: "x", ceoApprovedAmount: 50000 }) === "crq_pending_ceo");
  T("طلبٌ تحت السقف يُعتمد بلا التنفيذي",
    ns({ engagement: "contract", value: 1500, pmApprovedAt: "x", procApprovedAt: "x", financeApprovedAt: "x" }) === "crq_approved");
  /* ★★ أمرُ الدفع صار يمرّ بالمشتريات (طلبُ المالك): مدير المشاريع ← المشتريات ←
     سدادُ المالية. المشتريات هي التي تسأل «أهذا الطرفُ صحيحٌ وسعرُه معقول؟» — ولا
     يُعوّضها مديرُ المشاريع (يراجع الحاجة) ولا المالية (تُنفّذ السداد ولا تُقرّر). */
  T("★★ أمرُ الدفع يمرّ بالمشتريات بعد مدير المشاريع",
    ns({ engagement: "pay_order", value: 1500, pmApprovedAt: "x" }) === "crq_pending_proc");
  T("★★ ثم سدادُ المالية مباشرةً — بلا بوّابةِ اعتمادٍ ماليٍّ (لا شروطَ تجاريةً تُراجَع)",
    ns({ engagement: "pay_order", value: 1500, pmApprovedAt: "x", procApprovedAt: "x" }) === "crq_pending_pay");
  T("★ ولا يتخطّى بوّابة التنفيذي — السقف سقفُ المال لا سقفُ نوع الورقة",
    ns({ engagement: "pay_order", value: 2500, pmApprovedAt: "x", procApprovedAt: "x" }) === "crq_pending_ceo");
  T("★ وبوّابةُ التنفيذي **بعد** المشتريات لا قبلها (لا يوقّع التنفيذيُّ على ما لم يُراجَع)",
    ns({ engagement: "pay_order", value: 2500, pmApprovedAt: "x" }) === "crq_pending_proc");
  T("★ البوّابة تُحسب من القيمة لا من علَمٍ يختاره المُنشئ",
    ns({ engagement: "contract", value: 50000, needsCeo: false, pmApprovedAt: "x", procApprovedAt: "x", financeApprovedAt: "x" }) === "crq_pending_ceo");

  /* ════ فصلُ المهام: من اعتمد بوّابةً لا يعتمد التاليةَ ════   (طلبُ المالك)
     العلّةُ التي رآها المالك: بعد اعتماده كمدير مشاريع عاد زرُّ الاعتماد — لأن
     الأدمن عضوٌ في كلّ بوّابة، فيمرّر الطلبَ وحدَه من الإنشاء إلى السداد.
     والمهربُ شرطٌ لا تفصيل: منعٌ بلا مهربٍ يحبس الطلبَ في فريقٍ لا ثانيَ فيه. */
  {
    const mode = (req, st, role, u, n, users) => C._crqActMode(req, st, role, u, n, users);
    const TEAM = [{ user: "adm", role: "admin" }, { user: "proc1", role: "procurement_officer" },
                  { user: "pm1", role: "project_manager" }];
    const SOLO = [{ user: "adm", role: "admin" }];
    const afterPm = { pmApprovedAt: "t", pmApprovedBy: "مدير النظام", pmApprovedByUser: "adm" };

    T("★★ من اعتمد بوّابةً لا يعتمد التاليةَ ما دام غيرُه يملكها",
      mode(afterPm, "crq_pending_proc", "admin", "adm", "مدير النظام", TEAM) === "blocked");
    T("★★ ومن لم يعتمد شيئاً يعتمد عادةً",
      mode(afterPm, "crq_pending_proc", "procurement_officer", "proc1", "مسؤول المشتريات", TEAM) === "act");
    T("★★ والمهرب: لا أحدَ غيرُه يملك البوّابة ⇒ يعتمد **نيابةً** لا يُمنَع (لا يتعطّل العمل)",
      mode(afterPm, "crq_pending_proc", "admin", "adm", "مدير النظام", SOLO) === "delegate");
    T("★ ومن ليست البوّابةُ لدوره أصلاً: none (القاعدةُ الأولى لم تتغيّر)",
      mode(afterPm, "crq_pending_proc", "finance", "fin1", "المالية", TEAM) === "none");
    T("★★ والمطابقةُ باسم الدخول لا بالاسم المعروض (تغييرُ الاسم لا يُسقط القيد)",
      mode({ pmApprovedAt: "t", pmApprovedBy: "اسمٌ قديم", pmApprovedByUser: "adm" },
           "crq_pending_proc", "admin", "adm", "اسمٌ جديد", TEAM) === "blocked");
    T("★★ ووثيقةٌ قديمةٌ بلا حقل اسم الدخول تُطابَق بالاسم المعروض (لا يسقط القيدُ عنها)",
      mode({ pmApprovedAt: "t", pmApprovedBy: "مدير النظام" },
           "crq_pending_proc", "admin", "adm", "مدير النظام", TEAM) === "blocked");
    T("★ وشخصان مختلفان باسمين متطابقين لا يلتبسان متى وُجد اسمُ الدخول",
      mode(afterPm, "crq_pending_proc", "admin", "adm2", "مدير النظام", TEAM) === "act");
    T("★ والسدادُ تحت القاعدة نفسِها — هناك يخرج المال",
      mode({ pmApprovedAt: "t", pmApprovedByUser: "adm" }, "crq_pending_pay", "admin", "adm", "",
           [{ user: "adm", role: "admin" }, { user: "fin1", role: "finance" }]) === "blocked");
    T("★ ومَن يملك البوّابةَ وحدَه دون أن يعتمد سابقاً يعتمد عادةً لا نيابةً",
      mode({}, "crq_pending_proc", "admin", "adm", "مدير النظام", SOLO) === "act");
    T("★★ والمنعُ يقع في طبقة البيانات لا على الزرّ — وعلى الوثيقة الطازجة",
      /var mode = crqActMode\(r, st, role, _meUser\(\), _me\(\), _users\(\)\);[\s\S]{0,200}mode === "blocked"\) throw new Error/.test(src) &&
      /function payRequest[\s\S]{0,900}pmode === "blocked"\) throw new Error/.test(src));
    T("★★ والرفضُ/الإعادة لا يُمنع أبداً (لا يراكم سلطةً، ومنعُه يحبس الطلب)",
      !/action === "reject"[\s\S]{0,300}crqActMode/.test(src) &&
      /الرفضُ\/الإعادة لا يُمنع أبداً/.test(src));
    T("★★ وسببُ غياب الزرّ يُقال صراحةً (زرٌّ يختفي بلا تفسيرٍ يُقرأ عطلاً)",
      /mode === "blocked"[\s\S]{0,300}فصلُ المهام/.test(src) &&
      /mode === "delegate"[\s\S]{0,300}نيابةً/.test(src));
    T("★ وزرُّ الاعتماد يحمل اسمَ بوّابته (فلا يُقرأ ظهورُه ثانيةً زرّاً عالقاً)",
      /' اعتماد — '\+_esc\(\(owner\|\|\{\}\)\.lbl\|\|""\)/.test(src));
    T("★★ و«بانتظار إجراءك» لا تَعِد بزرٍّ مُنِع — تحترم القاعدةَ نفسَها",
      /myPendingItems[\s\S]{0,700}crqActMode\(r, r\.status, role, meU, meN, us\) !== "blocked"/.test(src));
    T("★★ وعدّادُ «بانتظار دورك» في الشريط يحترمها كذلك (عدّادٌ بلا زرٍّ يبعثك تبحث عن عملٍ ليس لك)",
      /var mine   = all\.filter\(function\(r\)\{[\s\S]{0,200}crqActMode\(r, r\.status, role, meU, meN, us\) !== "blocked"/.test(src));
    T("★ والاعتمادُ نيابةً يُوسَم في الخطّ الزمني ويُخزَّن عَلَمُه",
      /mode === "delegate"\) r\.delegatedApproval = true/.test(src) &&
      /نيابةً — لا يوجد غيرُك يملك هذه البوّابة/.test(src));
    T("★ واسمُ الدخول يُخزَّن مع كلّ اعتمادٍ في المستندات الثلاثة (بلا ذلك تسقط المطابقةُ المستقرّة)",
      (src.match(/ApprovedByUser=_meUser\(\)/g) || []).length === 10,
      "المواضع: " + (src.match(/ApprovedByUser=_meUser\(\)/g) || []).length);
  }

  /* ════ الإرجاعُ إلى بوّابةٍ محدّدة — للأدمن ════   (طلبُ المالك)
     «رفض/إعادة» يُرجع للمُنشئ دائماً: خطوةٌ واحدةٌ للخلف مهما كان الخطأ. والإرجاعُ
     **ليس حالةً جديدة** بل مسحُ اعتماداتِ البوّابة وما بعدها ثمّ `crqNextStage`
     وحدَها تقرّر — فلا آلةَ حالاتٍ ثانيةٌ تنحرف عن الأولى. */
  {
    const rw = (req, k) => C._crqRewind(req, k, TH);
    const tg = (req) => C._crqRewindTargets(req, TH);
    const full = { engagement: "contract", value: 50000, pmApprovedAt: "t", pmApprovedByUser: "pm1",
                   procApprovedAt: "t", procApprovedKey: "K", financeApprovedAt: "t", financeApprovedKey: "F",
                   ceoApprovedAt: "t", ceoApprovedAmount: 50000, status: "crq_approved" };
    T("★★ الإرجاعُ إلى المشتريات يُعيد الطلبَ إلى بوّابتها",
      rw(full, "proc").status === "crq_pending_proc");
    T("★★ ويُسقط اعتمادَها **وما بعدها** — لا يمرّ الطلبُ على توقيعٍ لم يُراجَع بعد التغيير",
      (function () { const o = rw(full, "proc");
        return !o.procApprovedAt && !o.financeApprovedAt && !o.ceoApprovedAt &&
               !o.procApprovedKey && !o.financeApprovedKey && !o.ceoApprovedAmount; })());
    T("★★ ويُبقي ما قبلها صحيحاً (اعتمادُ مدير المشاريع لا يسقط بلا سبب)",
      rw(full, "proc").pmApprovedAt === "t" && rw(full, "proc").pmApprovedByUser === "pm1");
    T("★ والإرجاعُ إلى مدير المشاريع يمسح الأربعةَ جميعاً",
      (function () { const o = rw(full, "pm");
        return o.status === "crq_pending_pm" && !o.pmApprovedAt && !o.ceoApprovedAt; })());
    T("★ والقيمةُ والبنودُ والطرفُ لا تُمَسّ (الإرجاعُ إجراءُ اعتمادٍ لا تحرير)",
      rw(full, "pm").value === 50000 && rw(full, "pm").engagement === "contract");
    T("★ ومفتاحٌ غيرُ معروفٍ يُرفَض", rw(full, "nope") === null);

    T("★★ والوجهاتُ تُشتقّ من مسار الطلب نفسِه: العقدُ فوق السقف ⇒ أربعُ بوّابات",
      tg(full).join(",") === "pm,proc,finance,ceo", tg(full).join(","));
    T("★★ وأمرُ الدفع بلا بوّابةِ اعتمادٍ ماليّ (وجهةٌ يقفز فوقها الطلبُ وعدٌ كاذب)",
      tg({ engagement: "pay_order", value: 1500, pmApprovedAt: "t", procApprovedAt: "t",
           status: "crq_pending_pay" }).join(",") === "pm,proc");
    T("★ وما دون سقف التنفيذيِّ بلا بوّابته",
      tg({ engagement: "contract", value: 100, pmApprovedAt: "t", procApprovedAt: "t",
           financeApprovedAt: "t", status: "crq_approved" }).join(",") === "pm,proc,finance");
    T("★★ ولا تُعرَض وجهةٌ لا تغيّر الحالةَ الحالية (إرجاعٌ بلا أثر)",
      tg({ engagement: "contract", value: 50000, pmApprovedAt: "t", status: "crq_pending_proc" })
        .indexOf("proc") === -1);
    T("★ والمرفوضُ يُرجَع إلى بوّابةٍ فيُستأنف مساره",
      tg({ engagement: "contract", value: 50000, pmApprovedAt: "t", procApprovedAt: "t",
           status: "crq_finance_returned" }).indexOf("proc") !== -1);

    T("★★ والتنفيذُ للأدمن وحدَه وبسببٍ إلزاميّ",
      /function rewindRequest\(id, gateKey, reason\)[\s\S]{0,400}_role\(\) !== "admin"[\s\S]{0,200}!reason\) return Promise\.reject/.test(src));
    T("★★ ولا يُرجَع منتهٍ (محوَّلٌ · مسدَّدٌ · ملغى) ولا وجهةٌ غيرُ صالحة — على الوثيقة الطازجة",
      /function rewindRequest[\s\S]{0,900}crqIsFinal\(r\.status\)\) throw[\s\S]{0,300}crqRewindTargets\(r, th\)\.indexOf\(gateKey\) === -1\) throw/.test(src));
    T("★ والخطُّ الزمنيُّ يحفظ من أين أُرجع ولماذا (من أسقطنا توقيعَه يقرأ السبب)",
      /_pushTimeline\(next, "إرجاع إلى "[\s\S]{0,200}"من «"\+from\+"» — "\+reason/.test(src));
    T("★ والزرُّ للأدمن وحدَه وحين توجد وجهةٌ صالحةٌ أصلاً (لا قائمةٌ فارغة)",
      /_role\(\)==="admin" && crqRewindTargets\(r, ceoThreshold\(\)\)\.length[\s\S]{0,160}contracts\.openRewind\(\)/.test(src));
  }

  /* ════ القاعدتان تعمّان المستندات الثلاثة ════   (طلبُ المالك: «نفّذ»)
     كانتا على طلبات التعاقد وحدَها — والمستخلصُ **أولى** بهما: هو موضعُ خروج المال
     شهرياً لا مرّةً واحدة. والمنطقُ **نسخةٌ واحدة**: لا يفترق مستندٌ عن آخر إلا في
     ترتيب بوّاباته ودالّةِ توجيهه، فيُمرَّران وسيطين. ثلاثُ نسخٍ كانت ستنحرف. */
  {
    const TEAM3 = [{ user: "adm", role: "admin" }, { user: "pm1", role: "project_manager" },
                   { user: "ceo1", role: "ceo" }, { user: "fin1", role: "finance" },
                   { user: "proc1", role: "procurement_officer" }];
    const SOLO3 = [{ user: "adm", role: "admin" }];
    const afterPm = { pmApprovedAt: "t", pmApprovedByUser: "adm" };

    /* ── المستخلص ── */
    T("★★ المستخلص: من اعتمد بوّابةً لا يعتمد التاليةَ ما دام غيرُه يملكها",
      C._extActMode(afterPm, "ext_pending_ceo", "admin", "adm", "م", TEAM3) === "blocked");
    T("★★ ومهربُه نفسُه: لا أحدَ غيرُه ⇒ نيابةً لا منعاً",
      C._extActMode(afterPm, "ext_pending_ceo", "admin", "adm", "م", SOLO3) === "delegate");
    T("★★ وسدادُ المستخلص تحت القاعدة — وهو موضعُ خروج المال",
      C._extActMode(afterPm, "ext_pending_finance", "admin", "adm", "م", TEAM3) === "blocked");
    T("★ ومن لم يعتمد شيئاً يعتمد عادةً",
      C._extActMode(afterPm, "ext_pending_ceo", "ceo", "ceo1", "ت", TEAM3) === "act");
    T("★★ وإرجاعُ المستخلص يمسح البوّابةَ وما بعدها ثمّ التوجيهُ يقرّر",
      (function () {
        const e = { pmApprovedAt: "t", ceoApprovedAt: "t", ceoApprovedAmount: 90000, status: "ext_pending_finance" };
        const o = C._extRewind(e, "ceo", 90000, 50000);
        return o.status === "ext_pending_ceo" && !o.ceoApprovedAt && !o.ceoApprovedAmount && o.pmApprovedAt === "t";
      })());
    T("★★ ووجهاتُه تُشتقّ من صافيه: دون سقف التنفيذيِّ لا بوّابةَ له",
      C._extRewindTargets({ pmApprovedAt: "t", status: "ext_pending_finance" }, 100, 50000).join(",") === "pm" &&
      C._extRewindTargets({ pmApprovedAt: "t", status: "ext_pending_finance" }, 90000, 50000).join(",") === "pm,ceo");

    /* ── أمرُ التغيير ── */
    T("★★ أمرُ التغيير: القاعدةُ نفسُها",
      C._chgActMode(afterPm, "chg_pending_proc", "admin", "adm", "م", TEAM3) === "blocked" &&
      C._chgActMode(afterPm, "chg_pending_proc", "admin", "adm", "م", SOLO3) === "delegate" &&
      C._chgActMode(afterPm, "chg_pending_proc", "procurement_officer", "proc1", "ش", TEAM3) === "act");
    T("★★ وإرجاعُه يمرّ ببوّاباته الأربع",
      C._chgRewindTargets({ pmApprovedAt: "t", procApprovedAt: "t", financeApprovedAt: "t",
                            ceoApprovedAt: "t", ceoApprovedAmount: 90000, amount: 90000,
                            status: "chg_approved" }, 50000).join(",") === "pm,proc,finance,ceo");
    T("★ ولا وجهةَ بلا أثرٍ فيه أيضاً",
      C._chgRewindTargets({ pmApprovedAt: "t", amount: 90000, status: "chg_pending_proc" }, 50000)
        .indexOf("proc") === -1);

    /* ── نسخةٌ واحدةٌ لا ثلاث ── */
    T("★★ والمنطقُ نسخةٌ واحدة: `docRewind`/`gateActMode` تخدم الثلاثة بوسيطين",
      /function docRewind\(doc, gateKey, order, nextStage\)/.test(src) &&
      /function gateActMode\(gates, doc, status, role, meUser, meName, users\)/.test(src) &&
      /function crqActMode[\s\S]{0,140}gateActMode\(GATE_ROLES/.test(src) &&
      /function extActMode[\s\S]{0,140}gateActMode\(EXT_GATES/.test(src) &&
      /function chgActMode[\s\S]{0,140}gateActMode\(CHG_GATES/.test(src));
    T("★★ والمنعُ في طبقة البيانات للثلاثة لا على الأزرار",
      /function actOnExtract[\s\S]{0,1400}extActMode\(e, e\.status, role[\s\S]{0,140}"blocked"\) throw/.test(src) &&
      /function actOnChange[\s\S]{0,1400}chgActMode\(g, g\.status, role[\s\S]{0,140}"blocked"\) throw/.test(src) &&
      /function payExtract[\s\S]{0,1200}extActMode\(e, e\.status, role[\s\S]{0,140}"blocked"\) throw/.test(src));
    T("★★ والإرجاعُ للأدمن وبسببٍ إلزاميٍّ في الاثنين، ولا يُرجَع منتهٍ",
      /function rewindExtract[\s\S]{0,300}_role\(\) !== "admin"[\s\S]{0,200}!reason\) return Promise\.reject/.test(src) &&
      /function rewindChange[\s\S]{0,300}_role\(\) !== "admin"[\s\S]{0,200}!reason\) return Promise\.reject/.test(src) &&
      /function rewindExtract[\s\S]{0,900}extIsFinal\(e\.status\)\) throw/.test(src) &&
      /function rewindChange[\s\S]{0,900}chgIsFinal\(g\.status\)\) throw/.test(src));
    T("★ ووجهةٌ غيرُ صالحةٍ تُرفَض في الاثنين",
      /function rewindExtract[\s\S]{0,1200}extRewindTargets\(e, net, th\)\.indexOf\(gateKey\) === -1\) throw/.test(src) &&
      /function rewindChange[\s\S]{0,900}chgRewindTargets\(g, th\)\.indexOf\(gateKey\) === -1\) throw/.test(src));
    T("★★ و«بانتظار إجراءك» تحترم القاعدةَ في الثلاثة",
      /_exts\.forEach[\s\S]{0,200}extActMode\(e, e\.status, role, meU, meN, us\) !== "blocked"/.test(src) &&
      /_chgs\.forEach[\s\S]{0,200}chgActMode\(g, g\.status, role, meU, meN, us\) !== "blocked"/.test(src));
    T("★ ونصُّ سببِ المنع مصدرٌ واحدٌ للثلاثة (لا ثلاثةُ نصوصٍ تنحرف)",
      /function sodNoteHTML\(mode, owner\)/.test(src) &&
      (src.match(/sodNoteHTML\(mode, owner\)/g) || []).length === 4);
    T("★ وزرّا «إرجاع لمرحلة» يظهران للأدمن وحين توجد وجهةٌ صالحة",
      /_role\(\)==="admin" && extRewindTargets\([\s\S]{0,120}contracts\.openExtRewind\(\)/.test(src) &&
      /_role\(\)==="admin" && chgRewindTargets\(g, ceoThreshold\(\)\)\.length[\s\S]{0,120}contracts\.openChgRewind\(\)/.test(src));
  }

  /* ════ تعديلُ بنود الطلب — للأدمن وحدَه ════   (طلبُ المالك)
     البنودُ والقيمةُ كانتا مجمَّدتين بعد الإرسال لسببٍ وجيه: «وقّع المعتمِدُ على
     رقمٍ وسُدِّد غيرُه». والبابُ الجديدُ لا ينقض العهدَ بل يحترمه بطريقٍ آخر —
     ما وُقِّع على رقمٍ قديمٍ **يُبطَل** لا يُمرَّر. */
  {
    const RULX = (function () {
      const q = path.resolve(path.dirname(IDX), "firestore.rules");
      return fs.existsSync(q) ? fs.readFileSync(q, "utf8") : "";
    })();
    T("★★ التعديلُ للأدمن وحدَه وبسببٍ إلزاميّ",
      /function editRequestLines\(id, lines, reason\)[\s\S]{0,400}_role\(\) !== "admin"[\s\S]{0,200}!reason\) return Promise\.reject/.test(src));
    T("★★ والقيمةُ تُعاد حسابُها من البنود بالدالّة الموحّدة لا في الترميز",
      /function editRequestLines[\s\S]{0,2000}r\.value = crqValueOf\(r\);/.test(src));
    T("★★ وبصمةُ المالية تسقط ثمّ `crqNextStage` تُعيد الطلبَ لبوّابتها (لا توقيعَ على رقمٍ قديم)",
      /function editRequestLines[\s\S]{0,2200}crqRevalidate\(r\)[\s\S]{0,120}crqNextStage\(next, th\)/.test(src));
    T("★ ولا تُعدَّل بنودُ طلبٍ منتهٍ، ولا تمرّ بنودٌ فارغةٌ أو قيمةٌ صفر",
      /function editRequestLines[\s\S]{0,2000}crqIsFinal\(r\.status\)\) throw/.test(src) &&
      /أضِف بنداً واحداً على الأقل بوصفٍ وكمية/.test(src) &&
      /function editRequestLines[\s\S]{0,2100}r\.value <= 0\) throw/.test(src));
    T("★★ وعتبةُ أمر الدفع تُفحَص بعد التعديل (لا يتضخّم أمرُ دفعٍ فوق سقفه)",
      /function editRequestLines[\s\S]{0,2200}engagement==="pay_order" && !payOrderAllowed\(r\.value, payOrderThreshold\(\)\)/.test(src));
    T("★ والخطُّ الزمنيُّ يحفظ القيمةَ قبل وبعد والسبب",
      /_pushTimeline\(next, "تعديل البنود", "edited",[\s\S]{0,120}money\(was\)\+" ← "\+money\(next\.value\)/.test(src));
    T("★★ وقاعدةُ «من يعدّل» في موضعٍ واحدٍ يقرؤها الزرُّ والبيانات",
      /function canEditLines\(req\)\{ return _role\(\)==="admin" && !!req && !crqIsFinal\(req\.status\); \}/.test(src) &&
      /canEditLines\(r\) \? '<button[\s\S]{0,120}contracts\.editLines\(\)/.test(src));
    T("★★ وقواعدُ الخادم تفتح البنودَ والقيمةَ للأدمن **وحدَهما** (الطرفُ والشكلُ مجمَّدان للجميع)",
      /unchanged\(\['createdAt','createdByUser','vendorId','engagement','projectId'\]\)/.test(RULX) &&
      /\(unchanged\(\['value','lines'\]\) \|\| isAdmin\(\)\)/.test(RULX));
    T("★ والمسودّةُ محلّيةٌ حتى الحفظ ولا تبقى معلّقةً على طلبٍ آخر",
      /function openReq\(id\)\{ _rOpen=id; _rDraft=null; _lnEdit=null;/.test(src) &&
      /function backToReqs\(\)\{ _rOpen=null; _rDraft=null; _lnEdit=null;/.test(src));
  }

  /* ════ حذفُ عقدٍ لم يُوقَّع بعد — للأدمن ════   (طلبُ المالك: عقدٌ أُنشئ تجربةً)
     العقدُ سجلٌّ ماليٌّ لا يُمحى — إلا في نافذةٍ واحدة: ما بين إنشائه وتوقيعِ الطرف.
     وفيها **لا أبناءَ له بالبناء**: المستخلصُ وأمرُ التغيير لا يُنشآن إلا على عقدٍ
     سارٍ — فالحالةُ وحدَها ضمانةٌ كافيةٌ على الخادم. وحذفُه **يُحرِّر طلبَه**، وإلا
     بقي الطلبُ يشير إلى عقدٍ غيرِ موجود. */
  {
    const RULY = (function () {
      const q = path.resolve(path.dirname(IDX), "firestore.rules");
      return fs.existsSync(q) ? fs.readFileSync(q, "utf8") : "";
    })();
    const RULES_CHK = (function () {
      const q = path.resolve(path.dirname(IDX), "rules-check.mjs");
      return fs.existsSync(q) ? fs.readFileSync(q, "utf8") : "";
    })();
    T("★★ الحذفُ للأدمن وحدَه وبسببٍ إلزاميّ",
      /function deleteContract\(id, reason\)[\s\S]{0,400}_role\(\) !== "admin"[\s\S]{0,200}!reason\) return Promise\.reject/.test(src));
    T("★★ ولا يُحذف إلا ما لم يُوقَّع — والساري يُفسَخ ولا يُمحى",
      /function deleteContract[\s\S]{0,1600}c\.status !== "ctr_pending_signature"[\s\S]{0,160}الساري يُفسَخ ولا يُمحى/.test(src));
    T("★★ وحزامٌ ثانٍ: لا حذفَ لعقدٍ له مستخلصاتٌ أو أوامرُ تغيير (بياناتٌ قديمة)",
      /function deleteContract[\s\S]{0,600}extractsFor\(id\)\.length[\s\S]{0,200}changesFor\(id\)\.length/.test(src));
    T("★★ وحذفُه يُحرِّر طلبَه في **المعاملة نفسِها** (لا طلبٌ يشير إلى عقدٍ محذوف)",
      /function deleteContract[\s\S]{0,2400}r\.status="crq_approved"; r\.contractId="";/.test(src) &&
      /function deleteContract[\s\S]{0,2500}_pushTimeline\(r, "أُلغي التحويل — حُذف العقد "/.test(src));
    T("★ والمرآةُ تُنظَّف والبطاقةُ تُغلق ويُسجَّل الحذفُ في التدقيق",
      /function deleteContract[\s\S]{0,3000}_ctrs\.splice\(i,1\)[\s\S]{0,200}if\(_cOpen===id\) _cOpen=null;[\s\S]{0,300}_audit\("حذف عقد لم يُوقَّع"/.test(src));
    T("★ والزرُّ لا يظهر إلا للأدمن على عقدٍ لم يُوقَّع",
      /c\.status==="ctr_pending_signature" && role==="admin"[\s\S]{0,200}contracts\.doDeleteCtr\(\)/.test(src));
    T("★ والتأكيدُ يقول ما سيقع للطلب قبل وقوعه",
      /function doDeleteCtr\(\)[\s\S]{0,600}وسيعود طلبُه[\s\S]{0,400}لا يمكن استرجاعه/.test(src));
    /* ★★★ العطلُ الذي بلّغ عنه المالك في الإنتاج: الحذفُ **معاملةٌ بكتابتين** —
       حذفُ العقد وإعادةُ طلبه من `crq_converted` إلى `crq_approved`. وقاعدةُ
       «المحوَّلُ لا يُفتح» كانت تمنع الكتابةَ الثانية فتُرَدّ المعاملةُ كلُّها
       بـ`permission-denied`. والفحصُ الأوّلُ لم يمسكه لأنه جرّب `deleteDoc` وحدَه
       لا العمليةَ كما ينفّذها التطبيق. */
    T("★★★ واستثناءُ «إلغاء التحويل» موجودٌ — وإلا رُدّت معاملةُ الحذف كلُّها",
      /function crqUnconvertOk\(\) \{[\s\S]{0,400}isAdmin\(\)[\s\S]{0,200}resource\.data\.status == 'crq_converted'[\s\S]{0,200}request\.resource\.data\.status == 'crq_approved'[\s\S]{0,200}contractId', ''\) == ''/.test(RULY) &&
      /\|\| crqUnconvertOk\(\) \)/.test(RULY));
    T("★★ والفحصُ على المحاكي يجرّب **العمليةَ كما ينفّذها التطبيق** لا القاعدةَ وحدَها",
      /writeBatch/.test(RULES_CHK) && /b\.delete\(doc\(ADMIN, `\$\{C\}\/CPAIR`\)\)/.test(RULES_CHK) &&
      /crq_approved", contractId: "" \}, \{ merge: true \}\)/.test(RULES_CHK));
    T("★ ورفضُ الخادم يُترجَم إلى عربيةٍ تدلّ على العلاج لا سطرٍ إنجليزيٍّ غامض",
      /function _errMsg\(e\)/.test(src) && /قواعدُ Firestore لم تُنشَر بآخر نسخة/.test(src) &&
      !/e&&e\.message\?e\.message:"تعذّر (الإجراء|الحذف|الإرجاع|التعديل|الإلغاء)"/.test(src));
    T("★★ وقاعدةُ الخادم تقول القاعدةَ نفسَها (أدمن + لم يُوقَّع)",
      /function ctrDeleteOk\(\) \{[\s\S]{0,200}isAdmin\(\) && resource\.data\.status == 'ctr_pending_signature'/.test(RULY) &&
      (RULY.match(/allow delete: if ctrDeleteOk\(\);/g) || []).length === 2);
    T("★ والمستخلصُ وأمرُ التغيير لا يُنشآن إلا على سارٍ — وعليه تقوم الضمانة",
      /contract\.status !== "ctr_active"\) return Promise\.reject\(new Error\("المستخلص لا يُنشأ إلا على عقدٍ ساري/.test(src) &&
      /CHG_CONTRACT_OK = \["ctr_active","ctr_suspended"\]/.test(src));
  }

  /* ════ الصياغةُ الهندسيةُ لبنود الأعمال بالذكاء الاصطناعي ════   (طلبُ المالك)
     **الحدُّ الذي يحرسه هذا البلوك: الذكاءُ يصوغ الكلماتِ لا الأرقام.** الكميةُ
     وسعرُ الوحدة مالٌ يقرّره الإنسان، وإدخالُ نموذجٍ لغويٍّ عليهما بابُ خطأٍ صامتٍ
     يوقّع عليه الطرفان. فالقارئُ (`aiParseLines`) لا يقرأ رقماً أصلاً — وهذه
     الحرّاسُ تُسقط أيَّ ارتدادٍ يفتح ذلك الباب. */
  {
    const L = [{ id: "a", desc: "محارة", unit: "م2", qty: 100, unitPrice: 28 },
               { id: "b", desc: "دهان", unit: "عدد", qty: 5, unitPrice: 40 }];
    const ok = C._aiParseLines('[{"id":"a","desc":"محارة أسمنتية بسُمك 2سم","unit":"م٢"}]', L);
    T("★★ يقرأ الاقتراحَ ويطابقه بالمعرّف",
      ok.length === 1 && ok[0].id === "a" && ok[0].newDesc === "محارة أسمنتية بسُمك 2سم" &&
      ok[0].newUnit === "م٢" && ok[0].wasDesc === "محارة");
    T("★★ ولا يحمل الاقتراحُ كميةً ولا سعراً — ولو أرسلهما النموذج",
      (function () {
        const o = C._aiParseLines('[{"id":"a","desc":"وصف","unit":"م٢","qty":999,"unitPrice":9999,"total":1}]', L)[0];
        return o && o.qty === undefined && o.unitPrice === undefined && o.total === undefined &&
               Object.keys(o).sort().join(",") === "id,newDesc,newUnit,wasDesc,wasUnit";
      })());
    T("★★ ولا يخترع بنداً غيرَ موجود (المطابقةُ بالمعرّف وما لا يُطابق يُهمَل)",
      C._aiParseLines('[{"id":"zzz","desc":"بند مخترَع"}]', L).length === 0);
    T("★ ويتجاهل ما لا تغيير فيه", C._aiParseLines('[{"id":"a","desc":"محارة","unit":"م2"}]', L).length === 0);
    T("★★ وردٌّ مشوَّهٌ لا يُسقط النموذج — يُهمَل ولا يُرمى خطأً",
      C._aiParseLines("عذراً لا أستطيع", L).length === 0 &&
      C._aiParseLines("", L).length === 0 && C._aiParseLines(null, L).length === 0 &&
      C._aiParseLines('[{"id":"a"', L).length === 0 && C._aiParseLines('{"id":"a"}', L).length === 0);
    T("★ وسياجُ الشيفرة (```json) يُقشَّر",
      C._aiParseLines('```json\n[{"id":"b","desc":"دهان بلاستيك وجهين"}]\n```', L).length === 1);
    T("★ والطولُ محدودٌ فلا يُفسد وصفٌ هاربٌ جدولَ العقد",
      C._aiParseLines('[{"id":"a","desc":"' + "ط".repeat(500) + '"}]', L)[0].newDesc.length === 200);
    T("★ وبلا وصفٍ جديدٍ يبقى الأصل (الوحدةُ وحدَها قد تتغيّر)",
      (function () {
        const o = C._aiParseLines('[{"id":"a","desc":"","unit":"م.ط"}]', L)[0];
        return o && o.newDesc === "محارة" && o.newUnit === "م.ط";
      })());

    T("★★ والنداءُ نفسُه لا يُرسل سعراً ولا إجمالياً (ما لا يلزم لا يُرسَل)",
      (function () {
        // المطابقةُ على الحقول لا على رقمٍ مجرّد — المعرّفُ عشوائيٌّ قد يحوي رقمَ السعر
        const p = C._aiLinesPrompt("العمل: محارة", L);
        const body = (p.split("البنود:")[1] || "").trim();
        return /الكمية: 100/.test(body) && !/سعر|unitPrice|الإجمالي|ر\.س/.test(body) &&
               /^\d+\) \[id:[^\]]+\] الوصف: .+ · الوحدة: .+ · الكمية: \d+$/m.test(body);
      })());
    T("★ والتعليماتُ تمنع اختراعَ مواصفةٍ وذكرَ الأسعار",
      /لا تخترع/.test(C._aiLinesPrompt("x", L)) && /لا تذكر أسعاراً/.test(C._aiLinesPrompt("x", L)));
    T("★★ والاستبدالُ يمسّ الوصفَ والوحدةَ وحدَهما في الكود",
      /function aiApplyLine[\s\S]{0,600}arr\[k\]\.desc = s\.newDesc; if\(s\.newUnit\) arr\[k\]\.unit = s\.newUnit;/.test(src) &&
      !/function aiApplyLine[\s\S]{0,600}\.qty *=/.test(src) &&
      !/function aiApplyLine[\s\S]{0,600}\.unitPrice *=/.test(src));
    T("★★ ولا تطبيقَ صامت: لوحةُ «قبل/بعد» ثمّ قرارُ المستخدم",
      /function aiPanelHTML[\s\S]{0,900}الوصف الحالي[\s\S]{0,200}الصياغة الهندسية المقترَحة/.test(src) &&
      /contracts\.aiApplyLine\(/.test(src) && /contracts\.aiApplyAllLines\(\)/.test(src));
    T("★ واللوحةُ تُعلن الحدَّ للمستخدم لا للمبرمج وحدَه",
      /الكمياتُ والأسعارُ لا تُمَسّ/.test(src));
    T("★★ والزرُّ لا يظهر إن لم تكن طبقةُ الذكاء موجودةً — والنظامُ يعمل بدونه",
      /function aiReady\(\)\{[\s\S]{0,120}typeof _aiText === "function"/.test(src) &&
      /function aiBtnHTML[\s\S]{0,120}aiReady\(\)/.test(src));
    T("★ وفشلُ النداء رسالةٌ عربيةٌ بمترجم المنصة نفسِه لا خطأٌ خام",
      /catch\(function\(e\)\{[\s\S]{0,200}_msgErr\(e\)[\s\S]{0,160}فشلت الصياغة/.test(src));
    T("★ ونداءان متوازيان ممنوعان (زرٌّ يُضغط مرّتين لا يُرسل مرّتين)",
      /if\(_aiBusy\) return;/.test(src) && /_aiBusy = true;/.test(src));
    T("★ والاقتراحُ لا يبقى معلّقاً على مستندٍ آخر",
      /function openReq\(id\)\{[\s\S]{0,90}_aiLines=null;/.test(src) &&
      /function backToReqs\(\)\{[\s\S]{0,90}_aiLines=null;/.test(src));
  }

  /* ════ قيمةُ العقد النافذة ════ */
  T("★ قيمة العقد = الأصلية + أوامرِ التغيير المعتمدة وحدها",
    C._contractValue({ value: 100000, changeOrders: [{ amount: 5000, status: "approved" }, { amount: 9000, status: "crq_pending_pm" }] }) === 105000);
  T("كميةُ البند تشمل ما أضافته أوامرُ التغيير المعتمدة",
    C._contractLineQty({ lines: [{ id: "a", qty: 100 }], changeOrders: [{ status: "approved", lines: [{ id: "a", qty: 20 }] }] }, "a") === 120);

  /* ════ سُلَّمُ المستخلص ════ */
  const ctr = { value: 100000, vatMode: "excl", retention: { pct: 5 }, advance: { amount: 10000, recoveryPct: 20, recovered: 0 }, penalty: { capPct: 10 } };
  const ext = { lines: [{ cumQty: 1000, unitPrice: 30 }] };
  const n1 = C._extNet(ext, ctr, { prevGross: 0, materialsIssued: 2000 });
  T("★ سُلَّم المستخلص: 30,000 ⇐ ض 4,500 · محتجز 1,500 · مقدَّم 6,000 · مواد 2,000 ⇐ صافي 25,000",
    n1.period === 30000 && n1.vat === 4500 && n1.retention === 1500 &&
    n1.advanceRecovery === 6000 && n1.materials === 2000 && n1.net === 25000,
    `net=${n1.net}`);
  const n2 = C._extNet({ lines: [{ cumQty: 1000, unitPrice: 30 }] }, ctr, { prevGross: 20000 });
  T("★ المستخلص تراكميٌّ: منفَّذٌ 30,000 وسبق 20,000 ⇐ أعمالُ الفترة 10,000",
    n2.period === 10000, `period=${n2.period}`);
  T("★ عقدٌ بلا ضريبة: لا ض.ق.م في المستخلص إطلاقاً",
    C._extNet(ext, { ...ctr, vatMode: "none" }, { prevGross: 0 }).vat === 0);
  T("★ غرامةُ التأخير لا تتجاوز سقفها من قيمة العقد (10٪ ⇐ 10,000)",
    C._extNet(ext, ctr, { prevGross: 0, penaltyAmount: 99999 }).penalty === 10000);
  T("★ استردادُ المقدَّم لا يتجاوز ما تبقّى منه (بقي 1,000 ⇐ يُخصَم 1,000)",
    C._extNet(ext, { ...ctr, advance: { amount: 10000, recoveryPct: 20, recovered: 9000 } }, { prevGross: 0 }).advanceRecovery === 1000);
  T("المحتجزُ يُحسب على العمل لا على ضريبته",
    C._extNet(ext, ctr, { prevGross: 0 }).retention === 1500);
  T("الصافي = الفترةُ بضريبتها ناقصَ مجموعِ الخصومات (لا حسابَ ثانٍ)",
    n1.net === Math.round((n1.withVat - n1.deductions) * 100) / 100);

  /* ════ سريانُ الوثائق ════ */
  const today = new Date("2026-08-08T00:00:00Z");
  T("وثيقةٌ منتهيةٌ تُصنَّف expired", C._docExpiryState("2026-08-01", today).state === "expired");
  T("وثيقةٌ تنتهي خلال 30 يوماً تُصنَّف soon", C._docExpiryState("2026-08-20", today).state === "soon");
  T("وثيقةٌ بعيدةٌ تُصنَّف ok", C._docExpiryState("2027-08-20", today).state === "ok");
  T("بلا تاريخٍ لا تُصنَّف منتهيةً زوراً", C._docExpiryState("", today).state === "none");
  T("★ حالةُ امتثالِ الطرف = أسوأُ وثائقه",
    C._vendorComplianceState({ docs: [{ expiry: "2027-01-01" }, { expiry: "2026-08-01" }] }, today).state === "expired");
  T("★ المحظورُ وحده يمنع الإسناد؛ الوثيقةُ المنتهية تُحذّر ولا تمنع",
    C._vendorEligibility({ status: "blacklisted" }, today).block === true &&
    C._vendorEligibility({ status: "active", docs: [{ expiry: "2026-08-01" }] }, today).block === false);

  /* ════ تطبيعُ الأسماء العربية (للربط بالنصّ الحرّ التاريخيّ) ════ */
  T("تطبيعُ الاسم يوحّد الهمزة والتاء المربوطة والياء والمسافات",
    C._normName("مؤسسة  الأنوار") === C._normName("مؤسسه الانوار"));

  /* ════════════════════════════════════════════════════════════
     التعاقدُ مع شخصٍ طبيعيٍّ لا مع منشأةٍ فقط
     ثلاثةُ فروقٍ جوهريةٍ يجب أن يحرسها الاختبار: مستندُ الهوية،
     ووضعُ الضريبة المقترَح، ومفتاحُ التفرّد.
     ════════════════════════════════════════════════════════════ */
  const person = { entityType: "individual", name: "محمد أحمد الغامدي", legal: { idType: "iqama", idNumber: "2401234567", idExpiry: "2026-09-10" } };
  const firm = { entityType: "establishment", name: "مؤسسة الأنوار", legal: { crNumber: "1010234567", vatNumber: "300012" } };

  T("★ هويةُ الشخص تُقرأ من الإقامة/الهوية، وهويةُ المنشأة من السجل التجاري",
    C._identityOf(person).number === "2401234567" && C._identityOf(person).label === "إقامة" &&
    C._identityOf(firm).number === "1010234567" && C._identityOf(firm).label === "السجل التجاري");
  T("صفةٌ مجهولةٌ أو غائبةٌ ترتدّ إلى «منشأة» (توافقُ البيانات القديمة)",
    C._normEntity(undefined) === "establishment" && C._identityOf({ legal: { crNumber: "9" } }).number === "9");

  T("★ الشخصُ يُقترَح له عقدٌ بلا ضريبة (none) — لا يُستخرَج ١٥٪ من مستحقّ غير مسجَّل",
    C._suggestVatMode(person) === "none");
  T("★ المنشأةُ ذات الرقم الضريبيّ يُقترَح لها excl، وبلا رقمٍ ضريبيٍّ none",
    C._suggestVatMode(firm) === "excl" &&
    C._suggestVatMode({ entityType: "establishment", legal: { crNumber: "1" } }) === "none");
  T("★ التصريحُ اليدويُّ يتقدّم على الاستنتاج (شخصٌ مسجَّلٌ ضريبياً ⇐ excl)",
    C._suggestVatMode({ entityType: "individual", taxRegistered: true }) === "excl");

  T("★ انتهاءُ الهوية داخلَ محرّك الانتهاء نفسِه (لا إقامةٌ تنتهي بلا تنبيه)",
    C._allExpiring(person).length === 1 && C._allExpiring(person)[0]._identity === true);
  T("★ إقامةٌ منتهيةٌ تُنبّه بنصٍّ صريحٍ وتبقى تحذيراً لا منعاً",
    (() => {
      const e = C._vendorEligibility({ entityType: "individual", name: "س", legal: { idType: "iqama", idNumber: "2", idExpiry: "2026-07-01" } }, today);
      return e.block === false && e.ok === false && /إقامة منتهية/.test(e.reason);
    })());
  T("طرفٌ بلا رقمِ هويةٍ يُنبَّه عليه", /غير مسجَّل/.test(C._vendorEligibility({ entityType: "individual", name: "س", legal: {} }, today).reason));

  /* مفتاحُ التفرّد: رقمُ الهوية لا الاسم — شخصان قد يتشابهان بمشروعية */
  const pool = [{ id: "VND-0001", ...person }, { id: "VND-0002", ...firm }];
  const sameName = C._duplicateOf({ entityType: "individual", name: "محمد أحمد الغامدي", legal: { idNumber: "2409999999" } }, null, pool);
  T("★ سميٌّ برقم هويةٍ مختلف: تنبيهٌ **لا يمنع** (منعُه يوقف تسجيل شخصٍ حقيقيّ)",
    sameName.match && sameName.byId === false && sameName.block === false);
  T("★ رقمُ هويةٍ مكرَّرٌ: تكرارٌ مؤكَّدٌ **يُمنَع**",
    C._duplicateOf({ entityType: "individual", name: "اسمٌ آخر", legal: { idNumber: "2401234567" } }, null, pool).block === true);
  T("★ اسمُ منشأةٍ مكرَّرٌ يُمنَع (اسمُها معرّفُها في سجلها)",
    C._duplicateOf({ entityType: "establishment", name: "مؤسسه الانوار", legal: { crNumber: "999" } }, null, pool).block === true);
  T("طرفٌ يُقارَن بنفسه عند التعديل لا يُعدّ تكراراً",
    C._duplicateOf({ entityType: "individual", name: "محمد أحمد الغامدي", legal: { idNumber: "2401234567" } }, "VND-0001", pool).match === null);

  /* الوثائقُ تتبع الصفة */
  const dIndiv = C._docTypesFor("individual").map(d => d.key);
  const dFirm = C._docTypesFor("establishment").map(d => d.key);
  T("★ وثائقُ المنشأة لا تُعرَض لشخص (لا زكاةَ ولا سعودةَ ولا سجلّ)",
    !dIndiv.includes("cr") && !dIndiv.includes("zakat") && !dIndiv.includes("saudization") && !dIndiv.includes("gosi"));
  T("★ ووثائقُ الشخص لا تُعرَض لمنشأة (لا رخصةَ عملٍ ولا هوية)",
    !dFirm.includes("workPermit") && !dFirm.includes("identity"));
  T("والوثائقُ العامّة تظهر للصفتين", dIndiv.includes("insurance") && dFirm.includes("insurance"));
  T("★ والحسابُ البنكيُّ والعنوانُ الوطنيُّ وثيقتان للصفتين معاً (للشخص آيبانٌ وعنوانٌ كذلك)",
    dIndiv.includes("bank") && dIndiv.includes("natAddr") &&
    dFirm.includes("bank") && dFirm.includes("natAddr"));

  /* ════════════════════════════════════════════════════════════
     الوثيقةُ تقرأ بياناتها من فوقها — لا مصدرَ حقيقةٍ ثانياً

     أربعُ وثائقَ بياناتُها مكتوبةٌ أصلاً في البيانات الأساسية. إعادةُ كتابتها في
     صفّ الوثيقة تُنشئ رقمين للسجل الواحد يفترقان بأوّل تصحيح.
     ════════════════════════════════════════════════════════════ */
  const vAuto = {
    entityType: "establishment",
    legal: { crNumber: "1010111222", crExpiry: "2027-03-01", vatNumber: "300099", nationalAddress: "حائل — النقرة 1234" },
    bank: { iban: "SA0380000000608010167519" }
  };
  T("★★ السجلُّ التجاريُّ يأخذ رقمَه **وانتهاءَه** من البيانات الأساسية",
    C._docAutoValue("cr", vAuto).number === "1010111222" &&
    C._docAutoValue("cr", vAuto).expiry === "2027-03-01");
  T("★ والبطاقةُ الضريبيةُ والعنوانُ الوطنيُّ كذلك",
    C._docAutoValue("vat", vAuto).number === "300099" &&
    C._docAutoValue("natAddr", vAuto).number === "حائل — النقرة 1234");
  T("★ ووثيقةٌ لا مصدرَ لها في الأعلى لا تُملأ بشيء",
    C._docAutoValue("insurance", vAuto) === null &&
    C._docAutoValue("other", vAuto) === null &&
    C._docAutoValue("cr", { legal: {} }) === null);
  T("★★ والملءُ يصيب **الفارغَ وحدَه** — ما كتبه المستخدمُ بيده لا يُدهَس",
    (() => {
      const d = { ...vAuto, docs: [{ type: "cr", number: "فرعٌ آخر", expiry: "" }, { type: "vat", number: "", expiry: "" }] };
      C._applyDocAutofill(d);
      return d.docs[0].number === "فرعٌ آخر" && d.docs[0].expiry === "2027-03-01" &&
             d.docs[1].number === "300099" && d.docs[1]._auto === true;
    })());
  T("★★ والآيبانُ لا يُملأ إلا لمن يراه أصلاً (canBank) — لا كشفَ من بابٍ خلفيّ",
    /bank:\s*function\(d\)\{\s*return canBank\(\)/.test(src));

  /* ════════════════════════════════════════════════════════════
     الملفُّ المختارُ لا يضيع عند إعادة رسم النموذج  (بلاغُ المالك)
     `input[type=file]` لا يُملأ برمجياً، وإعادةُ الرسم تُتلفه. فما لم يُلتقط
     في المسوّدة ضاع بلا أثرٍ ولا رسالة — والمستخدمُ يحفظ ظانّاً أنه رفعه.
     ════════════════════════════════════════════════════════════ */
  T("★★ الملفُّ يُثبَّت في المسوّدة فورَ اختياره (onchange) لا عند الحفظ",
    /onchange="contracts\.pickDocFile\(/.test(src) &&
    /function pickDocFile\(i, inp\)\{[\s\S]*?_vEdit\.docs\[i\]\._file = f;/.test(src));
  T("★★ و`syncDraft` تلتقط الملفّات قبل كل إعادةِ رسم (لا رسمَ بعده يمحوها)",
    /tbl\.querySelectorAll\("input\.ct-file"\)\.forEach\(function\(inp\)\{[\s\S]*?_vEdit\.docs\[i\]\._file = inp\.files\[0\]/.test(src));
  T("★★ والحفظُ يقرأ الملفّات من **المسوّدة** لا من الشاشة (الشاشةُ نسيت ما قبل آخر رسم)",
    /\(d\.docs\|\|\[\]\)\.forEach\(function\(dc,i\)\{ if\(dc && dc\._file\) files\.push/.test(src) &&
    !/tbl\.querySelectorAll\("input\.ct-file"\)[\s\S]{0,200}files\.push/.test(src));
  T("★ والصفُّ يُعلن اسمَ الملفّ المختار (حقلٌ يبدو فارغاً والملفُّ محفوظٌ كذبٌ صامت)",
    /dc\._file\s*\?\s*'<div class="ct-file-chip">/.test(src) && /contracts\.delDocFile\(/.test(src));
  T("★★ وحقولُ المسوّدة المؤقّتة لا تُكتب في القاعدة (جسمُ ملفٍّ حيٌّ ترفضه Firestore)",
    /docs:\s*docsForSave\(d\.docs\)/.test(src) &&
    /if\(k\.charAt\(0\) !== "_"\) out\[k\] = dc\[k\]/.test(src) &&
    (() => {
      const out = C._docsForSave([{ type: "cr", number: "1", url: "u", _file: { name: "x" }, _fileName: "x", _auto: true }]);
      return !("_file" in out[0]) && !("_auto" in out[0]) && out[0].type === "cr" && out[0].url === "u";
    })());

  /* ════════════════════════════════════════════════════════════
     نوعُ الأعمال (تخصّصُ الطرف) — قائمةٌ **أو** كتابةٌ يدوية
     المحكُّ الذي يجب أن يحرسه الاختبار: المكتوبُ يدوياً والمختارُ من
     القائمة يجب أن **يلتقيا** في مرشّحٍ واحد، وإلا صار بابُ الكتابة
     بابَ دفنٍ: يُسجَّل التخصّصُ ثم لا يجده الباحثُ عنه.
     ════════════════════════════════════════════════════════════ */
  T("مفتاحُ القائمة يبقى كما هو، والنصُّ الحرُّ يُصدَّر ببادئةٍ لا تصطدم بمفتاح",
    C._normTrade("electrical") === "electrical" && C._normTrade("لحام خاص").charAt(0) === "~");
  T("★ المكتوبُ يدوياً مطابقاً لاسمٍ في القائمة **يصير مفتاحَها** (لا تخصّصان بالاسم نفسِه)",
    C._normTrade("كهرباء") === "electrical" && C._normTrade("  كهرباء  ") === "electrical");
  T("★ والتطبيعُ العربيُّ يسري عليه (همزةٌ وتاءٌ مربوطةٌ ومسافات)",
    C._normTrade("عزل مائى وحرارى") === C._normTrade("عزل مائي وحراري"));
  T("فراغٌ لا يُنتج تخصّصاً وهمياً", C._normTrade("") === "" && C._normTrade(null) === "" && C._normTrade("   ") === "");
  T("التسميةُ: المفتاحُ يُترجَم والنصُّ الحرُّ يُعرَض كما كُتب",
    C._tradeLabel("hvac") === "تكييف وتبريد" && C._tradeLabel("لحام خاص") === "لحام خاص");
  T("★ ونصٌّ يطابق اسمَ القائمة يُعرَض بتسميتها الرسمية لا بما كُتب",
    C._tradeLabel("كهرباء") === "كهرباء" && C._tradeLabel("عزل مائى وحرارى") === "عزل مائي وحراري");

  T("★ تخصّصاتُ الطرف تُزال تكراراتُها **بالمفتاح لا بالحرف**",
    JSON.stringify(C._vendorTrades({ trades: ["electrical", "كهرباء", "hvac", "", null, "hvac"] })) ===
    JSON.stringify(["electrical", "hvac"]));
  T("والنصُّ الحرُّ يُحفَظ كما كُتب لا كمفتاح",
    C._vendorTrades({ trades: ["لحام خاص"] })[0] === "لحام خاص");
  T("طرفٌ بلا حقل `trades` (بياناتٌ قديمة) لا يسقط ولا يخترع تخصّصاً",
    C._vendorTrades({}).length === 0 && C._vendorTrades(null).length === 0);

  const vElec = { id: "V1", kind: "subcontractor", trades: ["electrical", "lowCurrent"] };
  const vSupp = { id: "V2", kind: "supplier", trades: ["elecSupply"] };
  const vBoth = { id: "V3", kind: "both", trades: ["كهرباء"] };          // ⇐ مكتوبٌ يدوياً
  const vNone = { id: "V4", kind: "subcontractor", trades: [] };
  const vCust = { id: "V5", kind: "supplier", trades: ["لحام خاص"] };    // ⇐ خارجَ الكتالوج كلّياً
  const vPool = [vElec, vSupp, vBoth, vNone, vCust];

  T("مطابقةُ التخصّص تعمل بالمفتاح وبالاسم المكتوب سواءً",
    C._vendorHasTrade(vElec, "electrical") && C._vendorHasTrade(vElec, "كهرباء") &&
    C._vendorHasTrade(vBoth, "electrical") && !C._vendorHasTrade(vSupp, "electrical"));
  T("★ مرشّحٌ فارغٌ يعني «الكلّ» لا «من لا تخصّصَ له»",
    C._vendorHasTrade(vNone, "") === true && C._vendorHasTrade(vElec, "") === true);

  T("★ «مقاول ومورّد» يظهر في نتيجة «المقاولين» وفي نتيجة «الموردين» معاً",
    C._kindMatches(vBoth, "subcontractor") && C._kindMatches(vBoth, "supplier"));
  T("ولا يتسرّب مورّدٌ إلى قائمة المقاولين",
    !C._kindMatches(vSupp, "subcontractor") && C._kindMatches(vSupp, "supplier"));
  T("نوعٌ غائبٌ في وثيقةٍ قديمة يُقرأ «مقاول باطن» (لا يختفي من كل المرشّحات)",
    C._kindMatches({ trades: [] }, "subcontractor") === true);

  T("★ «مقاولو الكهرباء» = المقاولُ الصريح + «مقاول ومورّد» المكتوبُ تخصّصُه يدوياً",
    C._vendorsByTrade("electrical", "subcontractor", vPool).map(v => v.id).join(",") === "V1,V3");
  T("★ و«موردو الكهرباء» شيءٌ آخر — المحوران مستقلّان",
    C._vendorsByTrade("elecSupply", "supplier", vPool).map(v => v.id).join(",") === "V2");
  T("تخصّصٌ بلا نوعٍ يمرّ على الجميع، ونوعٌ بلا تخصّصٍ كذلك",
    C._vendorsByTrade("electrical", "", vPool).length === 2 &&
    C._vendorsByTrade("", "subcontractor", vPool).length === 3);
  T("تخصّصٌ لا يملكه أحدٌ يُرجع صفراً لا الكلّ",
    C._vendorsByTrade("elevators", "", vPool).length === 0);
  T("★ والتخصّصُ المكتوبُ يدوياً قابلٌ للترشيح كنظيره من القائمة (وإلا فبابُ دفن)",
    C._vendorsByTrade("لحام خاص", "supplier", vPool).map(v => v.id).join(",") === "V5" &&
    C._vendorsByTrade("لحام  خاص", "", vPool).length === 1);

  const opts = C._tradeOptions(vPool);
  T("★ خياراتُ المرشّح تضمّ الكتالوجَ **وما كُتب يدوياً فعلاً** في السجل",
    opts.some(o => o.key === "electrical" && !o.custom) &&
    opts.some(o => o.custom && C._normTrade(o.key).charAt(0) === "~"));
  T("★ ولا يتكرّر تخصّصٌ في القائمة لأنّ أحدَهم كتب اسمَه يدوياً",
    opts.filter(o => C._normTrade(o.key) === "electrical").length === 1);
  T("والكتالوجُ نفسُه بلا مفاتيحَ مكرّرة ولا تسمياتٍ مكرّرة",
    new Set(C._TRADES.map(t => t.key)).size === C._TRADES.length &&
    new Set(C._TRADES.map(t => C._normTrade(t.lbl))).size === C._TRADES.length);

  T("★ نوعُ الأعمال يُحفَظ في الوثيقة (لا يبقى في المسوّدة وحدَها)",
    /trades:\s*vendorTrades\(d\)/.test(src) && /trades:\s*vendorTrades\(v\)/.test(src));
  T("★ ومرشّحُه على الشاشة يقرأ الدالّةَ النقيّة لا شرطاً محلّياً",
    /if\(!vendorHasTrade\(v,\s*_vFilter\.trade\)\)\s*return false/.test(src) &&
    /if\(!kindMatches\(v,\s*_vFilter\.kind\)\)\s*return false/.test(src));
  T("النموذجُ يعرض القائمةَ **وحقلَ الكتابة** معاً (لا أحدَهما)",
    /id="ct-f-trade-pick"/.test(src) && /id="ct-f-trade-new"/.test(src));
  T("والبحثُ الحرُّ يشمل نوعَ الأعمال",
    /normName\(vendorTrades\(v\)\.map\(tradeLabel\)\.join\(" "\)\)/.test(src));

  /* ════════════════════════════════════════════════════════════
     أرقامُ جوال الأطراف — التطبيعُ والصلاحيةُ والبحثُ والتكرار

     المحكُّ الذي يجب أن يحرسه الاختبار: **صيغةٌ واحدةٌ مخزَّنة**. رقمٌ يُكتب
     بخمس صيغٍ ويُحفَظ بخمسٍ يعني طرفاً لا يُوجَد ببحثٍ برقمه، وتكراراً لا
     يُكشَف، وإشعارَ واتساب يذهب إلى رقمٍ لا يقبله المزوّد.
     ════════════════════════════════════════════════════════════ */
  T("★ الصيغُ الخمسُ للرقم الواحد تُطبَّع إلى واحدة",
    C._normPhone("0501234567") === "966501234567" &&
    C._normPhone("+966 50 123 4567") === "966501234567" &&
    C._normPhone("00966501234567") === "966501234567" &&
    C._normPhone("501234567") === "966501234567" &&
    C._normPhone("966-50-123-4567") === "966501234567");
  T("★ الأرقامُ العربيةُ الهنديةُ تُطوى قبل التطبيع (لوحةٌ عربيةٌ لا تُنتج طرفاً ثانياً)",
    C._normPhone("٠٥٠١٢٣٤٥٦٧") === "966501234567" &&
    C._phoneDigits("٠٥٠") === "050");
  T("رقمٌ دوليٌّ غيرُ سعوديٍّ يبقى كما هو (لا يُلصَق به مفتاحُ 966)",
    C._normPhone("+201234567890") === "201234567890");
  T("فراغٌ لا يُنتج رقماً وهمياً",
    C._normPhone("") === "" && C._normPhone(null) === "" && C._normPhone("—") === "");

  T("★★ الحقلُ «جوال»: السعوديُّ يبدأ بـ05 — والثابتُ يُرفض بنصٍّ يدلّ على العلاج",
    C._phoneOk("0501234567") === true &&
    C._phoneOk("0165551234") === false &&           // ثابتٌ محلّيّ نجا من التطبيع
    C._phoneOk("966165551234") === false &&         // وثابتٌ بصيغةٍ دولية
    /يبدأ بـ05/.test(C._phoneHint("0165551234")) &&
    /يبدأ بـ05/.test(C._phoneHint("966165551234")));
  T("ورقمٌ ناقصٌ يُرفض (رقمٌ محفوظٌ ناقصاً يُقرأ صحيحاً ويُتّصل به يوم الحاجة)",
    C._phoneOk("05012") === false && C._phoneOk("") === false &&
    C._phoneOk("+201234567890") === true);
  T("★ العرضُ محلّيٌّ مقروءٌ والتخزينُ دوليّ",
    C._phoneFmt("966501234567") === "050 123 4567" &&
    C._phoneFmt("+201234567890") === "+201234567890");

  /* ★ حارسُ التطابق مع الخادم: ما يُقبَل في السجل هو ما يقبله مُرسِل واتساب.
     لو افترق التطبيعان لظهر الرقمُ سليماً في السجل ورفضته Meta عند الإرسال —
     عطلٌ لا يُرى إلا يومَ الحاجة إليه. */
  const _waPath = path.resolve(path.dirname(IDX), "functions", "lib", "whatsapp.js");
  if (fs.existsSync(_waPath)) {
    try {
      const { normalizeMsisdn } = require(_waPath);
      const cases = ["0501234567", "966501234567", "+966 50 123 4567", "00966501234567", "501234567", "201234567890", ""];
      T("★★ تطبيعُ الرقم في السجل **مطابقٌ حرفياً** لتطبيع مُرسِل واتساب",
        cases.every(c => C._normPhone(c) === normalizeMsisdn(c)),
        cases.filter(c => C._normPhone(c) !== normalizeMsisdn(c)).join("|"));
    } catch (e) {
      T("★★ تطابقُ تطبيع الرقم مع الخادم", false, String(e.message).slice(0, 80));
    }
  }

  const vPh = {
    id: "VND-0009", name: "مؤسسة النور", phone: "966501234567",
    contacts: [{ name: "خالد", role: "المدير", phone: "966555555555" }, { name: "بلا رقم" }, { name: "مكرَّر", phone: "0501234567" }]
  };
  const phs = C._vendorPhones(vPh);
  T("★ أرقامُ الطرف قائمةٌ واحدة: جوالُه ثمّ جهاتُ اتصاله — والمكرَّرُ بصيغتين رقمٌ واحد",
    phs.length === 2 && phs[0].e164 === "966501234567" && phs[1].e164 === "966555555555");
  T("وجهةُ اتصالٍ بلا رقمٍ لا تُنتج خانةً فارغة", !phs.some(p => !p.e164));
  T("★★ البحثُ بالرقم يجده بأيّ صيغةٍ كتبها الباحث (مخزَّنةً · بصفرٍ · بلا مفتاح · جزئياً)",
    C._vendorMatchesPhone(vPh, "966501234567") &&
    C._vendorMatchesPhone(vPh, "0501234567") &&
    C._vendorMatchesPhone(vPh, "501234567") &&
    C._vendorMatchesPhone(vPh, "050 123 45") &&           // الفواصلُ تُطوى: ما كُتب رقمٌ متّصل
    C._vendorMatchesPhone(vPh, "1234567"));
  T("ورقمُ جهةِ الاتصال يُبحَث كما يُبحَث الجوالُ الرئيسيّ",
    C._vendorMatchesPhone(vPh, "0555555555"));
  T("رقمٌ من رقمين لا يُطابق (وإلا صار المرشّحُ ضجيجاً)",
    C._vendorMatchesPhone(vPh, "96") === false && C._vendorMatchesPhone(vPh, "") === false);

  T("★ التكرارُ يُكشَف بالرقم المطبَّع عبر كل الأطراف — تنبيهٌ لا منع",
    (C._phoneOwner("0501234567", null, [vPh]) || {}).id === "VND-0009" &&
    (C._phoneOwner("0555555555", null, [vPh]) || {}).id === "VND-0009" &&
    C._phoneOwner("0501234567", "VND-0009", [vPh]) === null &&
    C._phoneOwner("0509999999", null, [vPh]) === null);

  T("★★ المحفوظُ في الوثيقة **مطبَّعٌ** لا كما كُتب (وإلا فرقمان لا يلتقيان)",
    /phone:\s*normPhone\(d\.phone\)/.test(src) && /phone:\s*normPhone\(c\.phone\)/.test(src));
  T("★ ورقمٌ غير صالحٍ يُمنَع حفظُه، والفراغُ يُقبَل (طرفٌ قديمٌ بلا رقمٍ لا يقف تعديلُه)",
    /if\(d\.phone && !phoneOk\(d\.phone\)\)\{[^}]*return;/.test(src));
  T("النموذجُ يحمل حقلَ الجوال وجدولَ جهات الاتصال",
    /id="ct-f-phone"/.test(src) && /id="ct-contacts-tbl"/.test(src) &&
    /addContact:\s*addContact/.test(src) && /delContact:\s*delContact/.test(src));
  T("★ والبطاقةُ تعرض الرقمَ **رابطَ اتصالٍ وواتساب** لا نصّاً يُنسَخ يدوياً",
    /href="tel:\+/.test(src) && /https:\/\/wa\.me\//.test(src) &&
    /infoCell\("رقم الجوال", phoneHTML\(v\.phone\)\)/.test(src));
  T("★ ومرشّحُ البحث يقرأ الدالّةَ النقيّة لا شرطاً محلّياً",
    /!vendorMatchesPhone\(v,\s*_vFilter\.q\)/.test(src));
  T("★ ووثيقةُ العقد المطبوعةُ تحمل رقمَ الطرف الثاني (الإنذارُ يحتاج وسيلةَ تواصلٍ مثبَتة)",
    /var ph2 = v \? \(\(vendorPhones\(v\)\[0\]\|\|\{\}\)\.display \|\| ""\) : "";/.test(src) &&
    /جوال: <span dir="ltr">/.test(src));

  /* ════════════════════════════════════════════════════════════
     المرحلة ٢ — طلبُ التعاقد ودورتُه وأمرُ الدفع
     ════════════════════════════════════════════════════════════ */
  T("الصفحاتُ تُركَّب ذاتياً (سجل الأطراف + طلبات التعاقد + العقود)",
    /PAGE_REQS\s*=\s*"contract-requests"/.test(src) && /\[PAGE_VENDORS, PAGE_REQS, PAGE_CTRS\]\.forEach/.test(src));
  T("مجموعتها الجانبية تحمل زرّي الصفحتين",
    /nav-contract-reqs-btn/.test(src) && /nav-vendors-btn/.test(src));

  /* البصمتان: كلُّ معتمِدٍ يوقّع على ما يخصّه وحده */
  const withKeys = (r) => { const o = { ...r }; o.procApprovedKey = C._crqProcKey(o); o.financeApprovedKey = C._crqFinanceKey(o); return o; };
  const baseReq = withKeys({ vendorId: "V1", value: 100, vatMode: "incl", engagement: "contract", retention: { pct: 5 }, procApprovedAt: "x", financeApprovedAt: "y" });
  T("بصمةُ المشتريات لا تتأثّر بترتيب المرشّحين (ترتيبٌ حتميّ)",
    C._crqProcKey({ vendorId: "V1", candidates: [{ vendorId: "A", amount: 5 }, { vendorId: "B", amount: 9 }] }) ===
    C._crqProcKey({ vendorId: "V1", candidates: [{ vendorId: "B", amount: 9 }, { vendorId: "A", amount: 5 }] }));
  T("طلبٌ بلا تعديلٍ يحتفظ باعتماديه",
    !!C._crqRevalidate(baseReq).procApprovedAt && !!C._crqRevalidate(baseReq).financeApprovedAt);
  T("★ تغييرُ شرطٍ تجاريٍّ يُسقط اعتماد المالية **وحدَه** ويُعيد الطلب لبوّابتها",
    (() => { const v = C._crqRevalidate({ ...baseReq, retention: { pct: 10 } }); return !v.financeApprovedAt && !!v.procApprovedAt; })());
  T("★ تغييرُ الطرف يُسقط اعتماد المشتريات **وحدَه** (هي مَن يفحص التنافس والأهلية)",
    (() => { const v = C._crqRevalidate({ ...baseReq, vendorId: "V2" }); return !v.procApprovedAt && !!v.financeApprovedAt; })());
  T("تغييرُ وضع الضريبة يُسقط اعتماد المالية (القيمةُ الفعلية تتغيّر)",
    !C._crqRevalidate({ ...baseReq, vatMode: "excl" }).financeApprovedAt);

  /* قيمةُ الطلب من بنوده لا من حقلٍ يكتبه المُنشئ */
  T("★ قيمةُ الطلب تُحسب من البنود بوضعها الضريبيّ لا من حقلٍ حرّ",
    C._crqValueOf({ value: 999999, vatMode: "excl", lines: [{ qty: 10, unitPrice: 100 }] }) === 1150);
  T("طلبٌ بلا بنودٍ يرجع لقيمته المخزَّنة (توافقُ الأنماط القديمة)",
    C._crqValueOf({ value: 500, lines: [] }) === 500);

  /* البوّابات وأصحابُها */
  T("★ كلُّ بوّابةٍ لدورها وحدَه — ولا يعتمد مسؤولُ المشتريات بوّابةَ المالية",
    C._crqCanAct("crq_pending_proc", "procurement_officer") === true &&
    C._crqCanAct("crq_pending_finance", "procurement_officer") === false &&
    C._crqCanAct("crq_pending_finance", "finance") === true);
  T("الأدمن يملك كلَّ البوّابات",
    ["crq_pending_pm", "crq_pending_proc", "crq_pending_finance", "crq_pending_ceo", "crq_pending_pay"]
      .every(k => C._crqCanAct(k, "admin")));
  T("★ حالةٌ نهائيةٌ لا بوّابةَ لها (لا إجراء بعد الإغلاق)",
    !C._crqCanAct("crq_approved", "admin") && !C._crqCanAct("crq_paid", "admin") && !C._crqCanAct("crq_converted", "admin"));
  T("المشاهدُ بلا دورٍ لا يعتمد شيئاً",
    !C._crqCanAct("crq_pending_pm", "viewer") && !C._crqCanAct("crq_pending_ceo", "observer"));
  T("سدادُ أمر الدفع بوّابةُ المالية", (C._crqGateOwner("crq_pending_pay") || {}).lbl === "المالية — السداد");
  T("الحالاتُ النهائيةُ والمرتدّة مصنَّفةٌ صحيحاً",
    C._crqIsFinal("crq_paid") && C._crqIsFinal("crq_converted") && C._crqIsFinal("crq_cancelled") &&
    !C._crqIsFinal("crq_approved") && C._crqIsBounced("crq_finance_returned"));

  /* حرّاسُ الكتابة: معاملاتٌ وإيصالٌ وصلاحيات */
  T("★ كلُّ إجراءٍ على الطلب معاملةٌ تقرأ الوثيقة الطازجة",
    /function actOnRequest[\s\S]{0,400}runTransaction/.test(src) && /function payRequest[\s\S]{0,400}runTransaction/.test(src));
  T("★ الإجراءُ يُرفض إن لم تكن البوّابةُ لدور المستخدم (لا على الزرّ وحده)",
    /if\(!crqCanAct\(st, role\)\) throw/.test(src));
  T("★ سببُ الرفض إلزاميٌّ في طبقة البيانات لا في الشاشة فقط",
    /action === "reject"[\s\S]{0,80}if\(!note\) throw/.test(src));
  T("★ السدادُ يُرفض بلا إيصال — ولا يُسجَّل سدادٌ بلا إثبات",
    /!payload\.receiptUrl\) return Promise\.reject/.test(src) &&
    /if\(!att \|\| !att\.url\) throw new Error/.test(src));
  T("★ السدادُ للمالية فقط، ومن حالة الانتظار فقط",
    /r\.status !== "crq_pending_pay"/.test(src) && /\["finance","admin"\]\.indexOf\(role\) === -1/.test(src));
  T("الحالةُ تُشتقّ من crqNextStage لا تُكتب يدوياً",
    /doc\.status = crqNextStage\(doc, ceoThreshold\(\)\)/.test(src) && /r\.status = crqNextStage\(r, th\)/.test(src));
  T("★ الإرسالُ يمنع أمرَ دفعٍ فوق العتبة (حارسٌ في الشاشة فوق حارس الدالّة)",
    /payOrderAllowed\(total,\s*payOrderThreshold\(\)\)/.test(src));
  T("★ الطرفُ المحظور يمنع الإرسال، والوثيقةُ المنتهية تحذّر فقط",
    /if\(elig && elig\.block\)\{ _toast/.test(src));

  /* ════════════════════════════════════════════════════════════
     الربطُ بالموازنة **اختياريّ** — والمشروعُ قد يكون يدوياً بلا موازنة
     ════════════════════════════════════════════════════════════ */
  const PFX = "__MPN__:";
  T("★ المشروعُ اليدويُّ يُخزَّن بالشكل القياسيّ (__OTHER__ + العلَم + الاسم) لا بمعرّف العرض",
    (() => { const r = C._normalizeProjectRef("__MPN__:فيلا الأمير", "", PFX);
      return r.projectId === "__OTHER__" && r.isCustomProject === true && r.projectName === "فيلا الأمير"; })());
  T("ومشروعٌ يدويٌّ **جديد** يُكتب اسمُه حرّاً ويأخذ الشكل نفسَه",
    (() => { const r = C._normalizeProjectRef("__NEW_MANUAL__", "استراحة الشمال", PFX);
      return r.projectId === "__OTHER__" && r.isCustomProject === true && r.projectName === "استراحة الشمال"; })());
  T("والمشروعُ المسجَّل يبقى بمعرّفه بلا علَمٍ يدويّ",
    (() => { const r = C._normalizeProjectRef("hail", "", PFX);
      return r.projectId === "hail" && r.isCustomProject === false; })());
  T("★ اسمُ المشروع المعروض يتبع اصطلاح النواة (يدوياً من projectName لا من المعرّف)",
    C._docProjectName({ projectId: "__OTHER__", isCustomProject: true, projectName: "فيلا الأمير" }, []) === "فيلا الأمير" &&
    C._docProjectName({ projectId: "hail" }, [{ id: "hail", name: "مشروع حائل" }]) === "مشروع حائل");
  T("★ كلُّ مشروعٍ يدويٍّ مفتاحٌ مستقلٌّ (لا ينطوون في خيارٍ واحد)",
    C._docProjectKey({ isCustomProject: true, projectName: "أ" }) !== C._docProjectKey({ isCustomProject: true, projectName: "ب" }));

  T("★ مشروعٌ بلا موازنةٍ ⇒ no_budget — لا لومَ ولا تحذير",
    C._budgetLinkState("", { categories: [] }) === "no_budget" &&
    C._budgetLinkState("plaster", { categories: [{ key: "plaster", planned: 0 }] }) === "no_budget");
  T("★ موازنةٌ موجودةٌ وبلا ربطٍ ⇒ unlinked (إشارةٌ محايدة لا خطأ)",
    C._budgetLinkState("", { categories: [{ key: "plaster", planned: 100 }] }) === "unlinked");
  T("ومربوطٌ ⇒ linked فتُقارَن القيمةُ بالمخطَّط",
    C._budgetLinkState("plaster", { categories: [{ key: "plaster", planned: 100 }] }) === "linked");
  T("موازنةٌ غائبةٌ تماماً (null) لا تُسقط الحساب", C._budgetLinkState("plaster", null) === "no_budget");

  T("★ بندُ الموازنة اختياريٌّ في النموذج (خيارُ «بلا ربط» أوّلُ الخيارات)",
    /بلا ربطٍ بالموازنة \(اختياريّ\)/.test(src) && /budgetCategoryKey:""/.test(src));
  T("★ تحذيرُ التجاوز لا يعمل إطلاقاً على مشروعٍ بلا موازنة",
    /if\(linkState !== "no_budget"\) Object\.keys\(byCat\)/.test(src));
  T("★ قسمُ المقايسة يختفي لمشروعٍ بلا مقايسة بدل جدولٍ فارغ",
    /isPay \|\| !items\.length \? '' :/.test(src));
  T("★ الإرسالُ يُلزم باسم المشروع اليدويّ ولا يقبل فراغاً",
    /ref\.isCustomProject && !ref\.projectName\) \{? ?_toast/.test(src) || /if\(ref\.isCustomProject && !ref\.projectName\)/.test(src));
  T("★ معرّفُ العرض الداخليّ لا يُخزَّن على الوثيقة", /delete payload\.projectSel/.test(src));
  T("قائمةُ المشاريع موحّدةٌ من projectMgmt._allProjects (مسجّلة + يدوية)",
    /pm\._allProjects/.test(src));

  /* المقايسة والموازنة تُقرآن من إدارة المشاريع لا بمسارٍ منسوخ */
  T("★ مسارُ المقايسة/الموازنة يُقرأ من projectMgmt ولا يُنسَخ مفتاحُ المشروع",
    /pm\._loadBoq/.test(src) && /pm\._loadBudget/.test(src) && !/function _safeKey/.test(src));
  const PMSRC = (() => { const p2 = path.resolve(path.dirname(IDX), "project-management.js"); return fs.existsSync(p2) ? fs.readFileSync(p2, "utf8") : ""; })();
  T("وإدارةُ المشاريع تعرّض الجسر (_loadBoq/_loadBudget/_safeKey)",
    /_loadBoq:\s*loadBoq/.test(PMSRC) && /_loadBudget:\s*loadBudget/.test(PMSRC) && /_safeKey:\s*_safeKey/.test(PMSRC));
  T("وتعرّض قائمةَ المشاريع الموحّدة (_allProjects) فلا تُنسَخ قاعدةُ دمج اليدويّ",
    /_allProjects:\s*allProjects/.test(PMSRC) && /_MANUAL_PREFIX:\s*MANUAL_PREFIX/.test(PMSRC));

  /* ════════════════════════════════════════════════════════════
     المرحلة ٣ — العقد: التحويلُ بمعاملة وبطاقةُ العقد
     ════════════════════════════════════════════════════════════ */
  const REQ3 = {
    id: "CRQ-1", vendorId: "V1", vendorName: "مؤسسة الأنوار",
    projectId: "__OTHER__", isCustomProject: true, projectName: "استراحة الشمال",
    budgetCategoryKey: "", title: "سور", engagement: "contract", vatMode: "excl",
    lines: [{ id: "L1", boqLineId: "b1", desc: "بناء سور", unit: "م.ط", qty: 60, unitPrice: 180 }],
    advance: { pct: 10, recoveryPct: 20 }, retention: { pct: 5, releaseOn: "completion" },
    penalty: { perDayPct: 0.1, capPct: 10 }, warranty: { months: 12 }
  };
  const CTR3 = C._contractFromRequest(REQ3, "CTR-1", "2026-08-09T10:00:00Z", "المسؤول");

  T("★ بناءُ العقد **دالةٌ نقيةٌ** تُفحَص بلا Firestore", typeof C._contractFromRequest === "function");
  T("★ العقدُ يرث القيمةَ المحسوبةَ من البنود لا رقماً حرّاً", CTR3.value === 12420);
  T("★ ويرث شكلَ المشروع القياسيَّ كما هو (لا يُعاد اشتقاقُه فينحرف)",
    CTR3.projectId === "__OTHER__" && CTR3.isCustomProject === true && CTR3.projectName === "استراحة الشمال");
  T("★ وبندُ الموازنة الفارغُ يبقى فارغاً — الربطُ اختياريٌّ في العقد أيضاً",
    CTR3.budgetCategoryKey === "");
  T("★ ويحمل requestId فسلسلةُ التوقيع قابلةٌ للتتبّع من العقد", CTR3.requestId === "CRQ-1");
  T("★ والعقدُ ينشأ **بانتظار التوقيع** — لا مسودةً ولا سارياً (يُغيَّر في §الوثيقة التعاقدية)",
    CTR3.status === "ctr_pending_signature");
  T("الشروطُ التجارية تنتقل كاملةً بقيمها",
    CTR3.retention.pct === 5 && CTR3.advance.recoveryPct === 20 && CTR3.penalty.capPct === 10 && CTR3.warranty.months === 12);
  T("والسجلُّ الزمنيُّ يبدأ بقيد الإنشاء", (CTR3.timeline || []).length === 1 && CTR3.timeline[0].code === "created");
  T("أمرُ الدفع يُنشئ عقداً من نوعه لا أمرَ إسناد",
    C._contractFromRequest({ engagement: "pay_order", lines: [] }, "X", "", "").type === "pay_order");
  T("★ مبلغُ الدفعة المقدمة **يُشتقّ** من نسبتها على قيمة العقد",
    C._advanceAmountOf(CTR3) === 1242 && C._advanceAmountOf({ value: 1000, advance: {} }) === 0);

  /* حارسُ التكرار داخلَ المعاملة لا قبلها */
  T("★ التحويلُ معاملةٌ واحدةٌ تكتب العقدَ وتوسم الطلبَ معاً",
    /function convertToContract[\s\S]{0,900}runTransaction[\s\S]{0,1400}t\.set\(reqRef/.test(src));
  T("★ حارسُ عدم التكرار **داخل** المعاملة، ويُرجع معرّفَ العقد القائم لا خطأً غامضاً",
    /r\.status === "crq_converted" && r\.contractId\)\{\s*\n\s*return \{ id:r\.contractId, already:true \}/.test(src));
  T("★ ولا يُنشأ عقدٌ من طلبٍ غير معتمَد",
    /r\.status !== "crq_approved"\) throw new Error/.test(src));
  T("★ وإنشاءُ العقد للمشتريات أو الأدمن فقط — يُفحَص في طبقة البيانات",
    /\["procurement_officer","admin"\]\.indexOf\(role\) === -1\) return Promise\.reject/.test(src));

  /* انتقالاتُ حالة العقد */
  T("★ الإيقافُ من «ساري» فقط، والاستئنافُ من «موقوف» فقط",
    C._ctrCanTransit("suspend", "ctr_active", "project_manager") &&
    !C._ctrCanTransit("suspend", "ctr_suspended", "project_manager") &&
    C._ctrCanTransit("resume", "ctr_suspended", "admin"));
  T("★ الإقفالُ النهائيُّ للمالية لا للمشتريات",
    C._ctrCanTransit("close", "ctr_completed", "finance") &&
    !C._ctrCanTransit("close", "ctr_completed", "procurement_officer"));
  T("★ الفسخُ للأدمن وحدَه", C._ctrCanTransit("terminate", "ctr_active", "admin") &&
    !C._ctrCanTransit("terminate", "ctr_active", "project_manager"));
  T("★ لا إجراءَ على عقدٍ مقفلٍ أو مفسوخ",
    C._ctrActionsFor("ctr_closed", "admin").length === 0 && C._ctrActionsFor("ctr_terminated", "admin").length === 0);
  T("الحالاتُ النهائيةُ مصنَّفةٌ صحيحاً", C._ctrIsFinal("ctr_closed") && C._ctrIsFinal("ctr_terminated") && !C._ctrIsFinal("ctr_active"));
  T("★ القاعدةُ نفسُها تحرس المعاملة لا الأزرارَ وحدها",
    /if\(!ctrCanTransit\(action, c\.status, role\)\) throw/.test(src));
  T("★ الإقفالُ يُفرِج عن المحتجز بقيمةٍ محسوبةٍ لا مُدخَلة",
    /if\(action==="close"\) c\.retention = Object\.assign\([\s\S]{0,120}released: r2\(contractValue\(c\)/.test(src));
  T("والسببُ إلزاميٌّ للإيقاف والفسخ في طبقة البيانات",
    /if\(t\.needsReason && !reason\) return Promise\.reject/.test(src));

  /* الصفحةُ الثالثة وزرُّ التحويل */
  T("صفحةُ العقود مركَّبةٌ ذاتياً ولها زرُّ قائمة",
    /PAGE_CTRS\s*=\s*"contracts-list"/.test(src) && /nav-contracts-btn/.test(src) &&
    /\[PAGE_VENDORS, PAGE_REQS, PAGE_CTRS\]\.forEach/.test(src));
  T("★ زرُّ «إنشاء العقد» يظهر على الطلب المعتمَد وللمشتريات/الأدمن فقط",
    /r\.status==="crq_approved" && \["procurement_officer","admin"\]\.indexOf\(_role\(\)\)!==-1/.test(src));
  T("والطلبُ المحوَّل يعرض رابطَ عقده في الاتجاه المقابل",
    /r\.status==="crq_converted" && r\.contractId/.test(src));

  /* ★ حارسُ الأيقونات: اسمٌ غيرُ موجودٍ في مجموعة المنصة يرسم فراغاً صامتاً */
  {
    const iconBlock = (HTML.match(/^const _ICON = \{([\s\S]*?)^\};/m) || [])[1] || "";
    const known = new Set((iconBlock.match(/^  ([a-zA-Z0-9]+):/gm) || []).map(x => x.trim().replace(":", "")));
    const used = new Set([
      ...(src.match(/_icn\("([a-zA-Z0-9]+)"/g) || []).map(x => x.slice(6, -1)),
      ...(src.match(/_svg\("([a-zA-Z0-9]+)"/g) || []).map(x => x.slice(6, -1)),
      ...(src.match(/icon:"([a-zA-Z0-9]+)"/g) || []).map(x => x.slice(6, -1))
    ]);
    const missing = [...used].filter(n => !known.has(n));
    T("★ كلُّ أيقونةٍ تستعملها الوحدة موجودةٌ في مجموعة المنصة (وإلا رُسم فراغٌ صامت)",
      known.size > 0 && missing.length === 0, missing.join(" "));
  }

  /* ════ غرامةُ التأخير بالريال ════   (طلبُ المالك)
     النسبةُ رقمٌ لا يراه أحد: المقاولُ يفاوض على ريالاتٍ في اليوم. والوثائقُ القديمةُ
     المخزَّنةُ بالنسبة **لا تُترجَم** — تُقرأ بلغتها التي وُقِّع عليها، والوسمُ
     (`mode`) هو الفيصل. وكلُّ حسابٍ يمرّ بالدالّتين فلا موضعان يفترقان. */
  {
    const AMT = { mode: "amount", perDayAmount: 500, capAmount: 20000 };
    const PCT = { mode: "pct", perDayPct: 0.1, capPct: 10 };
    const OLD = { perDayPct: 0.1, capPct: 10 };          // وثيقةٌ قديمةٌ بلا وسم
    const NEW0 = {};                                      // وثيقةٌ فارغةٌ ⇒ الافتراضُ الجديد
    T("★★ الغرامةُ الجديدةُ بالريال: ٥٠٠ يومياً كما كُتبت (بلا نسبةٍ من القيمة)",
      C._penaltyPerDay(AMT, 1000000) === 500 && C._penaltyCap(AMT, 1000000) === 20000);
    T("★★ والوثيقةُ القديمةُ بالنسبة تبقى تُقرأ نسبةً — لا يُترجَم عقدٌ وُقِّع عليه",
      C._penaltyIsPct(OLD) === true && C._penaltyPerDay(OLD, 100000) === 100 &&
      C._penaltyCap(OLD, 100000) === 10000);
    T("★ والوسمُ الصريحُ يغلب التخمين", C._penaltyIsPct(PCT) === true && C._penaltyIsPct(AMT) === false);
    T("★ والفارغةُ افتراضُها الجديدُ بالريال (لا نسبةَ صامتة)",
      C._penaltyIsPct(NEW0) === false && C._penaltyPerDay(NEW0, 100000) === 0);
    T("★★ والغرامةُ المقترَحةُ تُحسب بالمبلغ وتُقصَر بالسقف",
      C._suggestedPenalty({ value: 1000000, penalty: AMT }, 10) === 5000 &&
      C._suggestedPenalty({ value: 1000000, penalty: AMT }, 100) === 20000);
    T("★ وبلا سقفٍ (٠) لا تُقصَر",
      C._suggestedPenalty({ value: 1000000, penalty: { mode: "amount", perDayAmount: 500, capAmount: 0 } }, 100) === 50000);
    T("★ والقديمةُ تُحسب كما كانت تماماً (لا ارتداد)",
      C._suggestedPenalty({ value: 100000, penalty: OLD }, 10) === 1000);
    T("★★ وسقفُ المستخلص يقرأ المبلغَ لا النسبة",
      C._extNet({ lines: [{ cumQty: 1000, unitPrice: 100 }] },
                { value: 1000000, vatMode: "none", retention: {}, advance: {}, penalty: AMT },
                { prevGross: 0, penaltyAmount: 99999 }).penalty === 20000);
    T("★ والتطبيعُ يثبّت الوسمَ عند الحفظ",
      C._normPenalty(OLD).mode === "pct" && C._normPenalty({ perDayAmount: 300 }).mode === "amount" &&
      C._normPenalty(OLD).perDayPct === 0.1 && C._normPenalty({ perDayAmount: 300 }).perDayAmount === 300);
    T("★★ والعقدُ يرث الشرطَ بلغته لا مخلوطاً",
      (function () {
        const fromNew = C._contractFromRequest({ penalty: AMT, lines: [] }, "X", "", "").penalty;
        const fromOld = C._contractFromRequest({ penalty: OLD, lines: [] }, "X", "", "").penalty;
        return fromNew.mode === "amount" && fromNew.perDayAmount === 500 && fromNew.perDayPct === undefined &&
               fromOld.mode === "pct" && fromOld.perDayPct === 0.1 && fromOld.perDayAmount === undefined;
      })());
    T("★ والنصُّ المعروض يقول ريالاً للجديد ونسبةً للقديم",
      /ر\.س يومياً/.test(C._penaltyText(AMT, 1000000)) && /٪ من قيمة العقد يومياً/.test(C._penaltyText(OLD, 100000)) &&
      C._penaltyText({}, 1000) === "—");
    T("★★ وبصمةُ المالية تشمل الشكلين — فتغيُّرُ الغرامة يُسقط اعتمادَها أياً كانت لغتُها",
      C._crqFinanceKey({ penalty: AMT }) !== C._crqFinanceKey({ penalty: { mode: "amount", perDayAmount: 600, capAmount: 20000 } }) &&
      C._crqFinanceKey({ penalty: AMT }) !== C._crqFinanceKey({ penalty: OLD }));
    T("★ ونموذجُ الطلب صار بالريال (لا حقلَ نسبةٍ باقٍ في الشاشة)",
      /غرامة التأخير \(ر\.س\) لكل يوم/.test(src) && /سقف الغرامة \(ر\.س\)/.test(src) &&
      !/غرامة التأخير % لكل يوم/.test(src));
    T("★ والوثيقةُ الورقيةُ تتبع لغةَ العقد نفسِه",
      /penaltyIsPct\(pen\)[\s\S]{0,400}ريال عن كل يوم تأخير/.test(src));
  }

  /* ════════════════════════════════════════════════════════════
     المرحلة ٤ — المستخلصاتُ التراكمية وسُلَّم الخصومات والسداد
     ════════════════════════════════════════════════════════════ */
  const CT4 = {
    id: "CTR-1", vatMode: "excl", value: 100000, lines: [{ id: "L1", qty: 1000, unitPrice: 100 }],
    retention: { pct: 5 }, advance: { amount: 10000, recoveryPct: 20, recovered: 0 },
    penalty: { perDayPct: 0.1, capPct: 10 }, startDate: "2026-01-01", durationDays: 30
  };
  const E_PAID = { id: "E1", contractId: "CTR-1", status: "ext_paid", lines: [{ lineId: "L1", cumQty: 300, unitPrice: 100 }] };

  T("★ «المستخلَص سابقاً» **يُحسب** من المعتمدة/المسدَّدة ولا يُخزَّن",
    C._prevGrossOf([E_PAID], CT4, null) === 30000);
  T("ويُستثنى المستخلصُ نفسُه عند إعادة حسابه", C._prevGrossOf([E_PAID], CT4, "E1") === 0);
  T("★ ولا يدخل فيه مستخلصٌ مرفوضٌ أو مسودة",
    C._prevGrossOf([{ ...E_PAID, status: "ext_pm_rejected" }], CT4, null) === 0 &&
    C._prevGrossOf([{ ...E_PAID, status: "ext_draft" }], CT4, null) === 0);
  T("ولا مستخلصُ عقدٍ آخر", C._prevGrossOf([{ ...E_PAID, contractId: "CTR-9" }], CT4, null) === 0);

  /* الحارسُ المانعُ الوحيد */
  T("★ التراكميُّ فوق كمية العقد **يُمنَع** (تجاوزُه خطأٌ لا اجتهاد)",
    C._extCumGuard({ lines: [{ lineId: "L1", cumQty: 1200, desc: "x" }] }, CT4, []).ok === false);
  T("★ ويُمنَع التراجعُ عمّا اعتُمد سابقاً (يُنتج فترةً سالبةً لا تُسدَّد)",
    C._extCumGuard({ lines: [{ lineId: "L1", cumQty: 200, desc: "x" }] }, CT4, [E_PAID]).ok === false);
  T("وكميةٌ سليمةٌ بينهما تمرّ",
    C._extCumGuard({ lines: [{ lineId: "L1", cumQty: 600, desc: "x" }] }, CT4, [E_PAID]).ok === true);
  T("★ وأمرُ التغيير المعتمد يرفع السقف فيمرّ ما كان ممنوعاً",
    C._extCumGuard({ lines: [{ lineId: "L1", cumQty: 1200, desc: "x" }] },
      { ...CT4, changeOrders: [{ status: "approved", lines: [{ id: "L1", qty: 300 }] }] }, []).ok === true);

  /* حارسُ المستخلص المفتوح الواحد */
  T("★ مستخلصٌ مفتوحٌ واحدٌ لكلّ عقد (وإلا تصارع رقمان على «المستخلَص سابقاً»)",
    (C._openExtractOf([{ id: "E2", contractId: "CTR-1", status: "ext_pending_pm" }], "CTR-1") || {}).id === "E2");
  T("والمسدَّدُ لا يُعدّ مفتوحاً", C._openExtractOf([E_PAID], "CTR-1") === null);
  T("★ ويُفحَص في طبقة البيانات لا في الشاشة فقط",
    /var open = openExtractOf\(_exts, contract\.id\);\s*\n\s*if\(open\) return Promise\.reject/.test(src));

  /* دورةٌ أقصرُ عمداً */
  T("★ دورةُ المستخلص: مدير المشاريع ⇐ [التنفيذي فوق السقف] ⇐ سداد المالية",
    C._extNextStage({}, 50000, 2000) === "ext_pending_pm" &&
    C._extNextStage({ pmApprovedAt: "x" }, 50000, 2000) === "ext_pending_ceo" &&
    C._extNextStage({ pmApprovedAt: "x", ceoApprovedAt: "x", ceoApprovedAmount: 50000 }, 50000, 2000) === "ext_pending_finance" &&
    C._extNextStage({ pmApprovedAt: "x" }, 1500, 2000) === "ext_pending_finance");
  T("★ وبوّابةُ التنفيذي تُحسب على **الصافي** لا على المنجَز",
    C._extNextStage({ pmApprovedAt: "x" }, 1900, 2000) === "ext_pending_finance");
  T("★ واعتمادُ التنفيذي يسقط إن ارتفع الصافي فوق ما اعتمده",
    C._extNextStage({ pmApprovedAt: "x", ceoApprovedAt: "x", ceoApprovedAmount: 50000 }, 60000, 2000) === "ext_pending_ceo");
  T("بوّاباتُ المستخلص لأدوارها وحدَها",
    C._extCanAct("ext_pending_finance", "finance") && !C._extCanAct("ext_pending_finance", "project_manager") &&
    C._extCanAct("ext_pending_pm", "project_manager") && !C._extCanAct("ext_paid", "admin"));
  T("والمسدَّدُ حالةٌ نهائية", C._extIsFinal("ext_paid") && !C._extIsFinal("ext_pending_finance"));

  /* الغرامةُ تُقترَح ولا تُفرَض */
  T("★ أيامُ التأخّر تُحتسب من مدة العقد", C._lateDaysOf(CT4, new Date("2026-03-01")) === 29);
  T("ولا تأخّرَ قبل الاستحقاق", C._lateDaysOf(CT4, new Date("2026-01-15")) === 0);
  T("★ والغرامةُ المقترَحة لا تتجاوز سقفها (١٠٪ ⇐ 10,000)",
    C._suggestedPenalty(CT4, 500) === 10000 && C._suggestedPenalty(CT4, 29) === 2900);
  T("★ لكنها **تُقترَح ولا تُفرَض** — المبلغُ حقلٌ يدويٌّ في المستخلص",
    /id="ct-e-pen"/.test(src) && /onclick="contracts\.applyPenalty\(\)"/.test(src));

  /* حرّاسُ الكتابة */
  T("★ المستخلصُ لا يُنشأ إلا على عقدٍ ساري", /contract\.status !== "ctr_active"\) return Promise\.reject/.test(src));
  T("★ ولا تُقبل فترةٌ سالبة", /calc\.period < 0\) return Promise\.reject/.test(src));
  T("★ والسدادُ يُرفض بلا إيصال وللمالية فقط",
    /function payExtract[\s\S]{0,300}!payload\.receiptUrl\) return Promise\.reject/.test(src) &&
    /function payExtract[\s\S]{0,400}\["finance","admin"\]\.indexOf\(role\) === -1\) return Promise\.reject/.test(src));
  T("★ والمبلغُ المسدَّد **صافي السلّم** لا رقمٌ يُدخله المستخدم",
    /e\.payment=\{ amount:r2\(calc\.net\)/.test(src) && !/id="ct-ep-amt"/.test(src));
  T("★ ولقطةُ السلّم تُحفَظ وقت السداد فلا يُعاد حسابُها بعد تغيّر شيء",
    /e\.settled=calc;/.test(src));
  T("★ واستهلاكُ الدفعة المقدمة يُراكَم على العقد في المعاملة نفسِها",
    /adv\.recovered = r2\(\(Number\(adv\.recovered\)\|\|0\) \+ calc\.advanceRecovery\)/.test(src));
  T("★ والمستخلصُ الختاميُّ يُنهي العقد فنّياً في المعاملة نفسِها",
    /if\(e\.isFinal && fresh\.status==="ctr_active"\)\{\s*\n\s*cPatch\.status="ctr_completed"/.test(src));
  T("سدادُ المستخلص معاملةٌ تقرأ العقدَ الطازجَ أيضاً (استهلاكُ المقدَّم يُكتب عليه)",
    /function payExtract[\s\S]*?t\.get\(cRef\)[\s\S]*?t\.set\(cRef, cPatch/.test(src));

  /* سُلَّمُ الحساب مصدرٌ واحد */
  T("★ السلّمُ يُرسَم من `extNet` وحدَها — لا حسابَ في الترميز",
    /function ladderHTML\(calc, c\)/.test(src) && /ladderHTML\(extNet\(_extDraft,c,ctx\), c\)/.test(src));
  T("قيمةُ المواد تُدخَل يدوياً مع شرحِ السبب (المخزون بلا تسعيرة)",
    /الكميات بلا تكلفة/.test(src));

  /* ════════════════════════════════════════════════════════════
     الوثيقةُ التعاقدية — شروطٌ نصّية · حالةُ توقيع · مخرَجٌ ورقيّ
     ════════════════════════════════════════════════════════════ */
  const CT5 = { id: "CTR-1", value: 100000, vatMode: "excl", lines: [{ id: "L1", qty: 1000, unitPrice: 100 }],
    advance: { pct: 10, recoveryPct: 20 }, retention: { pct: 5, releaseOn: "completion" },
    penalty: { perDayPct: 0.1, capPct: 10 }, warranty: { months: 12 } };
  const FIN = C._financialClauses(CT5);
  const finBy = (t) => (FIN.find(x => x.title === t) || {}).body || "";

  T("★ العقدُ ينشأ **بانتظار التوقيع** لا سارياً (قرارُ المالك: لا مالَ على عقدٍ غير موقَّع)",
    C._contractFromRequest({ lines: [] }, "C1", "t", "u").status === "ctr_pending_signature");
  T("★ ويحمل **نسخةً مجمَّدةً** من الشروط لا إشارةً لقالبٍ يتغيّر",
    C._contractFromRequest({ lines: [] }, "C1", "t", "u").clauses.length === C._DEFAULT_CLAUSES.length);
  T("والقوالبُ المُمرَّرةُ تُنسَخ بدل الافتراضية",
    C._contractFromRequest({ lines: [] }, "C1", "t", "u", [{ key: "k", category: "general", title: "أ", body: "ب" }]).clauses.length === 1);
  T("★ ونسخُ الشروط **قيمٌ لا مراجع** — تعديلُ المصدر بعدها لا يمسّ العقد",
    (() => { const src2 = [{ key: "k", category: "general", title: "أ", body: "ب" }];
      const b = C._contractFromRequest({ lines: [] }, "C1", "t", "u", src2);
      src2[0].body = "تغيّر"; return b.clauses[0].body === "ب"; })());

  /* الشروطُ الماليةُ تتولّد من الأرقام فلا تتناقض مع الحساب */
  T("★ نصُّ الشرط الجزائيّ **يتولّد من الرقم** فلا يخالف ما يخصمه المستخلص",
    /0\.1٪/.test(finBy("غرامة التأخير")) && /10٪/.test(finBy("غرامة التأخير")) && /10,000\.00/.test(finBy("غرامة التأخير")));
  T("ونصُّ المحتجز يذكر النسبةَ وموعدَ الإفراج",
    /5٪/.test(finBy("محتجز الضمان")) && /الاستلام الابتدائي/.test(finBy("محتجز الضمان")));
  T("ونصُّ المقدَّم يذكر مبلغَه المشتقَّ ونسبةَ استرداده",
    /10,000\.00/.test(finBy("الدفعة المقدمة")) && /20٪/.test(finBy("الدفعة المقدمة")));
  T("ونصُّ القيمة يذكر وضعَ الضريبة صراحةً", /ضريبة/.test(finBy("قيمة العقد")));
  T("★ وشرطٌ بلا رقمٍ لا يُطبَع نصُّه (لا محتجزَ صفريٌّ في العقد)",
    C._financialClauses({ value: 100, advance: {}, retention: { pct: 0 }, penalty: {}, warranty: {} })
      .every(x => x.title !== "محتجز الضمان" && x.title !== "غرامة التأخير"));
  T("★ والشروطُ الماليةُ **لا تُخزَّن** — تُشتقّ عند العرض فتبقى مطابقةً للأرقام",
    !/clauses:.*financialClauses/.test(src) && /function financialClauses/.test(src));
  T("والشروطُ تُعرَض مجمَّعةً بتصنيفها بترتيبٍ ثابت",
    C._allClausesOf(CT5).every(g => Object.keys(C._CLAUSE_CATS).includes(g.category)));

  /* دورةُ التوقيع */
  T("★ «تسجيل التوقيع» ينقل من «بانتظار التوقيع» إلى «ساري» فقط",
    C._ctrCanTransit("sign", "ctr_pending_signature", "procurement_officer") &&
    !C._ctrCanTransit("sign", "ctr_active", "admin"));
  T("★ ولا إيقافَ ولا إنهاءَ لعقدٍ لم يوقَّع بعد",
    !C._ctrCanTransit("suspend", "ctr_pending_signature", "admin") &&
    !C._ctrCanTransit("complete", "ctr_pending_signature", "admin"));
  T("لكنّ الفسخَ ممكنٌ قبل التوقيع (عقدٌ لم يُوقَّع يُلغى)",
    C._ctrCanTransit("terminate", "ctr_pending_signature", "admin"));
  T("★ والنسخةُ الموقّعةُ **إلزامية** — لا يسري عقدٌ بضغطةٍ بلا إثبات",
    /function signContract[\s\S]{0,220}!att \|\| !att\.url\) return Promise\.reject/.test(src));
  T("★ والتوقيعُ يُفحَص في المعاملة أيضاً لا على الزرّ",
    /c\.status!=="ctr_pending_signature"\) throw new Error\("العقد ليس بانتظار التوقيع"\)/.test(src));
  T("★ والمستخلصُ ممنوعٌ قبل السريان (الحارسُ القائم يغطّيه تلقائياً)",
    /contract\.status !== "ctr_active"\) return Promise\.reject/.test(src));

  /* المخرَجُ الورقيّ */
  T("★ الطباعةُ تستعمل `_openPrintWindow` القائمة في النواة (ومعها معالجةُ iOS)",
    /typeof _openPrintWindow === "function"\) _openPrintWindow\(html\)/.test(src));
  T("★ والمطبوعُ يُعرِّف الطرفَ الثاني **بهويته** من `identityOf` لا بشرطٍ محلّيّ",
    /var v=vendorById\(c\.vendorId\), idn=v\?identityOf\(v\):null/.test(src) && /الطرف الثاني/.test(src));
  T("★ وفيه حقولُ توقيعِ الطرفين", /class="sign"/.test(src) && /الاسم \/ التوقيع \/ الختم/.test(src));
  T("ويحمل جدولَ بنود الأعمال وشروطَ العقد معاً",
    /جدول بنود الأعمال/.test(src) && /<h2>شروط العقد<\/h2>/.test(src));
  T("★ وكلُّ نصٍّ يمرّ بـ`_esc` (المطبوعُ يُبنى بسلاسل)",
    !/\+c\.vendorName\+/.test(src) && !/\+x\.body\+/.test(src));

  /* قوالبُ الشروط */
  T("★ القوالبُ للأدمن وحدَه", /if\(_role\(\)!=="admin"\) return Promise\.reject\(new Error\("قوالب الشروط للأدمن فقط"\)\)/.test(src));
  T("★ وتحريرُ شروط عقدٍ يمسّ نسختَه وحدَها لا القالب",
    /function saveContractClauses[\s\S]{0,600}c\.clauses=clauses/.test(src) && !/saveContractClauses[\s\S]{0,600}CLAUSE_DOC/.test(src));
  T("ولا تُعدَّل شروطُ عقدٍ منتهٍ أو مفسوخ",
    /c\.status!=="ctr_pending_signature" && c\.status!=="ctr_active"\) throw/.test(src));
  T("قوالبُ افتراضيةٌ تعمل من أوّل يوم", C._DEFAULT_CLAUSES.length >= 8 &&
    C._DEFAULT_CLAUSES.every(x => x.key && x.category && x.title && x.body));
  T("★ وتغطّي السلامةَ ونظاميةَ العمالة وفضَّ النزاع",
    C._DEFAULT_CLAUSES.some(x => x.category === "safety") &&
    C._DEFAULT_CLAUSES.some(x => /نظامي/.test(x.body)) &&
    C._DEFAULT_CLAUSES.some(x => /نزاع/.test(x.body)));

  /* ════════════════════════════════════════════════════════════
     المرحلة ٥ — الربطُ بالموازنة ومنعُ الازدواج المحاسبي
     ════════════════════════════════════════════════════════════ */
  const RQ5 = [
    { id: "R1", projectId: "hail", budgetCategoryKey: "plaster", status: "crq_pending_finance", value: 20000 },
    { id: "R2", projectId: "hail", budgetCategoryKey: "plaster", status: "crq_converted", value: 33600 },
    { id: "R3", projectId: "hail", budgetCategoryKey: "labor", status: "crq_paid", value: 1500, payment: { amount: 1500 } },
    { id: "R4", projectId: "hail", budgetCategoryKey: "plaster", status: "crq_pm_rejected", value: 9999 },
    { id: "R5", projectId: "__OTHER__", isCustomProject: true, projectName: "استراحة", budgetCategoryKey: "", status: "crq_pending_pm", value: 5000 }
  ];
  const CS5 = [{ id: "C1", projectId: "hail", budgetCategoryKey: "plaster", status: "ctr_active", value: 33600 }];
  const EX5 = [{ id: "E1", contractId: "C1", status: "ext_paid", payment: { amount: 10600 } }];
  const R5 = C._contractRollup("hail", RQ5, CS5, EX5);

  T("★ «قيدَ الاعتماد» من الطلبات غير المنتهية وحدَها", R5.byCat.plaster.pending === 20000);
  T("★ ولا يدخله المحوَّلُ ولا المرتدُّ ولا المسدَّد",
    !C._reqIsPending({ status: "crq_converted" }) && !C._reqIsPending({ status: "crq_pm_rejected" }) &&
    !C._reqIsPending({ status: "crq_paid" }) && !C._reqIsPending({ status: "crq_draft" }));
  T("★ «متعاقَدٌ عليه» = قيمةُ العقد − المستخلَصُ منه (33,600 − 10,600)",
    R5.byCat.plaster.contracted === 23000, String(R5.byCat.plaster.contracted));
  T("★ والمصروفُ التعاقديُّ من المسدَّد فقط: مستخلصٌ 10,600 + أمرُ دفعٍ 1,500",
    R5.byCat.plaster.spent === 10600 && R5.byCat.labor.spent === 1500 && R5.total.spent === 12100);
  T("★ ولا يُحسب المبلغُ مرّتين — الإجماليُّ متعاقَدٌ 23,000 لا 33,600",
    R5.total.contracted === 23000 && R5.total.pending === 20000);
  T("عقدٌ مقفلٌ أو مفسوخٌ ليس التزاماً قائماً",
    !C._ctrIsCommitted({ status: "ctr_closed" }) && !C._ctrIsCommitted({ status: "ctr_terminated" }));
  /* ★ ارتدادٌ حقيقيّ رُصد في فحص المتصفّح: كان `spent` داخلَ حارس `ctrIsCommitted`،
     فما إن يُقفَل العقدُ حتى تختفي مستخلصاتُه المسدَّدة من المصروف — والمالُ خرج فعلاً. */
  {
    const CLOSED5 = [{ id: "C1", projectId: "hail", budgetCategoryKey: "plaster", status: "ctr_closed", value: 33600 }];
    const RC = C._contractRollup("hail", RQ5, CLOSED5, EX5);
    T("★ والمالُ المدفوعُ يبقى مصروفاً بعد إقفال العقد (لا يتبخّر من الموازنة)",
      RC.byCat.plaster.spent === 10600, String(RC.byCat.plaster.spent));
    T("★ لكنَّ التزامَه المتبقّي يسقط — لا يُحجز مالٌ لعقدٍ انتهى",
      RC.byCat.plaster.contracted === 0 && RC.total.contracted === 0);
  }
  T("★ و«بانتظار التوقيع» التزامٌ قائم (الطلبُ اعتُمد والمالُ التزم)",
    C._ctrIsCommitted({ status: "ctr_pending_signature" }));
  T("★ والمشروعُ اليدويُّ يُجمَّع بمفتاحه المستقلّ لا ينطوي في غيره",
    C._contractRollup("__CUSTOM__:استراحة", RQ5, CS5, EX5).total.pending === 5000 &&
    C._contractRollup("hail", RQ5, CS5, EX5).total.pending === 20000);
  T("وطلبٌ بلا بندِ موازنةٍ يقع تحت «غير مصنّف» (الربطُ اختياريّ)",
    (C._contractRollup("__CUSTOM__:استراحة", RQ5, CS5, EX5).byCat.uncategorized || {}).pending === 5000);
  T("★ مفتاحُ مشروع إدارة المشاريع يُحوَّل لاصطلاح النواة",
    C._projectKeyOfPm("hail", "__MPN__:") === "hail" &&
    C._projectKeyOfPm("__MPN__:استراحة", "__MPN__:") === "__CUSTOM__:استراحة");

  /* ★ حارسُ منع الازدواج المحاسبي */
  T("★ طلبُ شراءٍ يحمل contractId يُعدُّ جزءاً من عقده",
    C.poIsUnderContract({ contractId: "C1" }) === true && C.poIsUnderContract({}) === false);
  {
    const PMSRC5 = (() => { const p3 = path.resolve(path.dirname(IDX), "project-management.js"); return fs.existsSync(p3) ? fs.readFileSync(p3, "utf8") : ""; })();
    T("★ وإدارةُ المشاريع **تستبعده** من مصروف الشراء (وإلا رقمان لعملٍ واحد)",
      /poForProject\(projId\)\.filter\(p=>!_poUnderContract\(p\)\)/.test(PMSRC5));
    T("★ والقاعدةُ تُقرأ من وحدة التعاقدات ولا تُنسَخ",
      /window\.contracts\.poIsUnderContract/.test(PMSRC5));
    T("★ وجدولُ الموازنة صار سبعةَ أعمدة بخانتَي التعاقد",
      /<th>قيدَ الاعتماد<\/th><th>متعاقَدٌ عليه<\/th>/.test(PMSRC5));
    T("★ والمتبقّي يخصم الأربعة (مصروف + مرتبط + متعاقَد + قيدَ اعتماد)",
      /const totRemain\s*=\s*totPlanned - totActual - totCommit - totCtr - totPend/.test(PMSRC5) &&
      /planned - spent - committed - cc\.contracted - cc\.pending/.test(PMSRC5));
    T("والمصروفُ يجمع الشراءَ المغلقَ والمسدَّدَ تعاقدياً",
      /const spent = cr\.actual \+ cc\.spent/.test(PMSRC5));
    T("★ وصفُّ «غير مصنّف» يظهر لتعاقدٍ بلا بندٍ أيضاً (لا يختفي المال)",
      /uncC\.pending\|\|uncC\.contracted\|\|uncC\.spent/.test(PMSRC5));
  }

  /* ════════════════════════════════════════════════════════════
     المرحلة ٧ — أوامرُ التغيير: البابُ الوحيدُ لتغيير قيمة العقد
     ════════════════════════════════════════════════════════════ */
  {
    const CTR7 = { id:"C7", value:100000, vatMode:"none", durationDays:60,
      lines:[{ id:"L1", desc:"دهان", unit:"م٢", qty:100, unitPrice:500 }],
      status:"ctr_active", changeOrders:[] };

    // (١) القيمةُ تُضاف ولا تستبدَل — التاريخُ محفوظ
    const CTR7b = Object.assign({}, CTR7, { changeOrders:[
      { id:"G1", amount:15000, status:"approved", lines:[{ id:"L1", qty:30 }], durationDaysDelta:10 }] });
    T("★★ أمرُ التغيير يُضاف إلى العقد ولا يستبدل قيمتَه (القيمةُ الأصليةُ تبقى ١٠٠,٠٠٠)",
      CTR7b.value === 100000 && C._contractValue(CTR7b) === 115000);
    const tot = C._contractChangeTotals(CTR7b);
    T("★ والخلاصةُ تعرض المعادلةَ لا الرقمَ وحدَه",
      tot.base === 100000 && tot.added === 15000 && tot.effective === 115000 && tot.count === 1);
    T("★ وكميةُ البند ترتفع بأمر التغيير — فيصير المستخلصُ الممنوعُ ممكناً",
      C._contractLineQty(CTR7, "L1") === 100 && C._contractLineQty(CTR7b, "L1") === 130);
    T("وأمرٌ غيرُ معتمَدٍ لا يُحسب في شيء",
      C._contractValue(Object.assign({}, CTR7, { changeOrders:[{ id:"G9", amount:99999, status:"chg_pending_pm" }] })) === 100000);

    // (٢) القيمةُ بوضع ضريبةِ العقد نفسِه
    T("★ قيمةُ الأمر تُحسب بوضع ضريبةِ العقد لا بوضعٍ خاصٍّ به",
      C._chgAmountOf({ lines:[{ qty:2, unitPrice:100 }] }, "none") === 200 &&
      C._chgAmountOf({ lines:[{ qty:2, unitPrice:100 }] }, "excl") === 230);
    T("★ والكميةُ السالبةُ خفضٌ بلا فرعٍ ثانٍ في الحساب",
      C._chgAmountOf({ lines:[{ qty:-2, unitPrice:100 }] }, "none") === -200);

    // (٣) البوّابات — والعتبةُ بالقيمة المطلقة
    T("أمرُ التغيير يبدأ عند مدير المشاريع", C._chgNextStage({}, 2000) === "chg_pending_pm");
    T("ثم المشتريات فالمالية",
      C._chgNextStage({ pmApprovedAt:"x" }, 2000) === "chg_pending_proc" &&
      C._chgNextStage({ pmApprovedAt:"x", procApprovedAt:"x" }, 2000) === "chg_pending_finance");
    const past = { pmApprovedAt:"x", procApprovedAt:"x", financeApprovedAt:"x" };
    T("★★ والخفضُ الكبيرُ يمرّ على التنفيذيّ كالزيادة (العتبةُ بالقيمة المطلقة)",
      C._chgNextStage(Object.assign({ amount:-50000 }, past), 2000) === "chg_pending_ceo" &&
      C._chgNextStage(Object.assign({ amount: 50000 }, past), 2000) === "chg_pending_ceo");
    T("ودون العتبة يصير معتمَداً بلا التنفيذيّ",
      C._chgNextStage(Object.assign({ amount:1500 }, past), 2000) === "chg_approved");
    T("★ واعتمادُ التنفيذيِّ يسقط إن كبُر المبلغُ عمّا رآه",
      C._chgNextStage(Object.assign({ amount:9000, ceoApprovedAt:"x", ceoApprovedAmount:5000 }, past), 2000) === "chg_pending_ceo" &&
      C._chgNextStage(Object.assign({ amount:5000, ceoApprovedAt:"x", ceoApprovedAmount:5000 }, past), 2000) === "chg_approved");

    // (٤) الحرّاس
    const EX7 = [{ id:"E1", contractId:"C7", status:"ext_paid", payment:{ amount:40000 },
                   lines:[{ lineId:"L1", cumQty:80 }] }];
    T("★★ الخفضُ لا ينزل بالبند تحت المنفَّذ (٨٠ نُفِّذت — لا تُخفَّض الكميةُ إلى ٧٠)",
      C._chgGuard({ lines:[{ id:"L1", qty:-30 }], amount:-15000 }, CTR7, EX7).ok === false);
    T("والخفضُ إلى حدّ المنفَّذ بالضبط يجوز",
      C._chgGuard({ lines:[{ id:"L1", qty:-20 }], amount:-10000 }, CTR7, EX7).ok === true);
    T("★★ ولا تنزل قيمةُ العقد تحت ما سُدِّد فعلاً (مالٌ خرج لا يُلغى بمستند)",
      C._chgGuard({ lines:[{ id:"L1", qty:-1 }], amount:-70000 }, CTR7, EX7).belowPaid !== null);
    T("★ وأمرٌ بلا أثرٍ لا معنى له", C._chgGuard({ lines:[], amount:0 }, CTR7, EX7).empty === true);
    T("والزيادةُ لا تُحرَس بحدّ المنفَّذ أصلاً",
      C._chgGuard({ lines:[{ id:"L1", qty:50 }], amount:25000 }, CTR7, EX7).ok === true);

    // (٥) أمرٌ مفتوحٌ واحدٌ في المرة، وعلى عقدٍ حيٍّ وحدَه
    const CH7 = [{ id:"G1", contractId:"C7", status:"chg_pending_proc" }];
    T("★ أمرُ تغييرٍ مفتوحٌ واحدٌ لكلّ عقد (وإلا اعتُمد أمران على قيمتين مختلفتين)",
      (C._openChangeOf(CH7, "C7")||{}).id === "G1" &&
      C._openChangeOf([{ id:"G2", contractId:"C7", status:"chg_applied" }], "C7") === null);
    T("★ ولا أمرَ إلا على عقدٍ ساري أو موقوف",
      C._chgContractEligible({ status:"ctr_active" }) && C._chgContractEligible({ status:"ctr_suspended" }) &&
      !C._chgContractEligible({ status:"ctr_pending_signature" }) &&
      !C._chgContractEligible({ status:"ctr_closed" }) && !C._chgContractEligible({ status:"ctr_terminated" }));

    // (٦) الأثرُ المعروض قبل الاعتماد
    const eff = C._chgEffect(CTR7, { amount:15000, durationDaysDelta:10 });
    T("★ والأثرُ يُعرَض قبل الاعتماد: القيمةُ والمدةُ قبل/بعد",
      eff.baseValue === 100000 && eff.newValue === 115000 && eff.newDays === 70 && eff.pct === 15);

    // (٧) الدورةُ نفسُها في طبقة البيانات لا في الأزرار وحدَها
    T("★ التطبيقُ على العقد للمشتريات — والرفضُ في طبقة البيانات",
      /function applyChange[\s\S]{0,300}\["procurement_officer","admin"\]\.indexOf\(_role\(\)\) === -1/.test(src));
    T("★★ والتطبيقُ لا يمسّ `value` — يُلحق بـ`changeOrders` فيبقى التاريخ",
      /function applyChange[\s\S]{0,2200}cPatch = \{ changeOrders:arr/.test(src) &&
      !/function applyChange[\s\S]{0,2600}cPatch\.value/.test(src));
    T("★ ونقرةٌ مكرّرةٌ لا تُطبّقه مرّتين",
      /arr\.some\(function\(co\)\{ return co && co\.id===id; \}\)\) return \{ already:true \}/.test(src));
    T("★ والحارسُ يُعاد على الوثيقة الطازجة وقتَ التطبيق لا وقتَ الإنشاء فقط",
      /var fresh = chgGuard\(g, c, _exts\);[\s\S]{0,120}if\(!fresh\.ok\) throw/.test(src));
    T("والتمديدُ يُطبَّق على مدة العقد فتتحرّك غرامةُ التأخير معه",
      /var newDays = \(Number\(c\.durationDays\)\|\|0\) \+ \(Number\(g\.durationDaysDelta\)\|\|0\)/.test(src));

    // (٨) الموازنة: المعلَّقُ قيدَ اعتماد، والمطبَّقُ داخلٌ في قيمة العقد
    const RQ7 = [];
    const CS7 = [{ id:"C7", projectId:"hail", budgetCategoryKey:"plaster", status:"ctr_active",
                   value:100000, changeOrders:[{ id:"G0", amount:15000, status:"approved" }] }];
    const CG7 = [{ id:"G1", projectId:"hail", budgetCategoryKey:"plaster", status:"chg_pending_proc", amount:20000 },
                 { id:"G2", projectId:"hail", budgetCategoryKey:"plaster", status:"chg_applied",  amount:15000 },
                 { id:"G3", projectId:"hail", budgetCategoryKey:"plaster", status:"chg_rejected", amount:99999 }];
    const R7 = C._contractRollup("hail", RQ7, CS7, [], CG7);
    T("★★ أمرُ التغيير المعلَّقُ يظهر «قيدَ الاعتماد» لا «متعاقَداً عليه»",
      R7.byCat.plaster.pending === 20000, String(R7.byCat.plaster.pending));
    T("★★ والمطبَّقُ لا يُحسب مرّتين — داخلٌ أصلاً في قيمة العقد",
      R7.byCat.plaster.contracted === 115000, String(R7.byCat.plaster.contracted));
    T("والمرفوضُ لا أثرَ له", R7.total.pending === 20000);
    const CGneg = [{ id:"G4", projectId:"hail", budgetCategoryKey:"plaster", status:"chg_pending_pm", amount:-10000 }];
    T("★ والخفضُ المعلَّقُ ينقص المتوقَّعَ لا يزيده",
      C._contractRollup("hail", RQ7, CS7, [], CGneg).byCat.plaster.pending === -10000);

    // (٩) الواجهة
    T("★ تبويبُ أوامر التغيير في بطاقة العقد",
      /\["changes","أوامر التغيير","repeat"\]/.test(src) && /if\(_cTab==="changes"\)\s+return ctrChangesHTML/.test(src));
    T("★ والنموذجُ يطلب **فارقَ** الكمية لا الكميةَ الجديدة (أوّلُ ما يُربك المُدخِل)",
      /أدخِل <b>فارقَ<\/b> الكمية لا الكميةَ الجديدة/.test(src));
    T("★ والأثرُ والتحذيرُ وزرُّ الإرسال تتحرّك مع الإدخال لا عند إعادة الرسم",
      /function chgRecalc\(\)[\s\S]{0,900}ct-g-eff[\s\S]{0,900}ct-g-warn[\s\S]{0,900}btn\.disabled/.test(src));
    T("★ وبطاقةُ العقد تعرض المعادلةَ لا الرقمَ الحاليَّ وحدَه",
      /القيمةُ الحالية = الأصليّ/.test(src));
    T("وسببُ التغيير إلزاميٌّ في طبقة البيانات لا في الشاشة وحدَها",
      /if\(!doc\.reason\) return Promise\.reject/.test(src));
  }

  /* ════════════════════════════════════════════════════════════
     المرحلة ٨ — فجواتُ الربط الثلاث: طلبُ الشراء · «بانتظار إجراءك» · واتساب
     ════════════════════════════════════════════════════════════ */
  {
    /* ── (أ) ربطُ طلب الشراء بعقد: البابُ الذي كان الحارسُ ينتظره ── */
    T("★★ الوحدةُ تكتب `contractId` على طلب الشراء (الحارسُ لم يعد باباً بلا مفتاح)",
      /function linkPurchase\(poId, contractId\)/.test(src) &&
      /collection\(PURCH_COL\(\)\)\.doc\(poId\)\.set\(/.test(src) &&
      /contractId:contractId/.test(src));
    T("★ والربطُ لدورٍ مخوَّلٍ وحدَه",
      /function linkPurchase[\s\S]{0,400}\["procurement_officer","project_manager","admin"\]\.indexOf\(_role\(\)\) === -1/.test(src));
    T("★★ ولا يُسرَق طلبٌ مرتبطٌ بعقدٍ آخر (لا ينتقل المال بين عقدين بنقرة)",
      /po\.contractId && po\.contractId !== contractId\)\s*\n?\s*return Promise\.reject/.test(src));
    T("★ والمرشَّحون من **مشروع العقد نفسِه** بلا محذوفٍ ولا مرتبطٍ بغيره",
      /function poCandidatesFor[\s\S]{0,500}p\.status === "deleted"[\s\S]{0,300}docProjectKey/.test(src));
    T("★ وقيمةُ الطلب وحالتُه تُقرآن من النواة لا يُعاد حسابُهما",
      /function _poAmount[\s\S]{0,300}poActualCost[\s\S]{0,200}getPOTotal/.test(src) &&
      /function _poStatusLbl[\s\S]{0,160}poStatusLabel/.test(src));
    T("★ ومجموعةُ الشراء تتبع وضعَ التطوير كبقية المجموعات",
      /function PURCH_COL\(\)\{ return _dev\(\) \? "global_purchases_dev" : "global_purchases"; \}/.test(src));
    T("تبويبُ «طلبات الشراء» في بطاقة العقد",
      /\["purchases","طلبات الشراء","cart"\]/.test(src) &&
      /if\(_cTab==="purchases"\)\s+return ctrPurchasesHTML/.test(src));
    T("★ والتبويبُ يشرح **لماذا** الربط (وإلا بدا حقلاً بلا معنى)",
      /تُحسب في الموازنة[\s\S]{0,80}مرّتين/.test(src));
    /* الوجهُ الآخر: طلبُ الشراء نفسُه يعلن أنه جزءٌ من عقد */
    T("★★ وتفاصيلُ طلب الشراء تعلن ارتباطَه بعقدٍ واستبعادَه من مصروف الشراء",
      /function _poContractBanner\(p\)/.test(HTML) &&
      /_poContractBanner\(p\);/.test(HTML) &&
      /مستبعَدٌ من مصروف الشراء في الموازنة/.test(HTML));
    T("★ والشارةُ تُحقن ديناميكياً فلا يكسر الشاشةَ غيابُ الوحدة",
      /function _poContractBanner[\s\S]{0,700}window\.contracts && window\.contracts\.contractById/.test(HTML));

    /* ── (ب) «بانتظار إجراءك»: التعاقداتُ في المكان الذي يفتحه المعتمِد ── */
    T("★★ بطاقةُ «بانتظار إجراءك» للتعاقدات موجودة",
      /function renderMyTasks\(\)/.test(src) && /التعاقدات بانتظار إجراءك/.test(src));
    T("★★ وتُبنى من **البوّابات نفسِها** التي تحرس الأزرار لا من قائمةٍ ثانية",
      /function myPendingItems\(role\)[\s\S]{0,1400}crqCanAct\(r\.status, role\)/.test(src) &&
      /myPendingItems[\s\S]{0,1600}extCanAct\(e\.status, role\)/.test(src) &&
      /myPendingItems[\s\S]{0,2000}chgCanAct\(g\.status, role\)/.test(src));
    T("★ وتشمل العقدَ المنتظِرَ توقيعاً (عملٌ حقيقيٌّ ينتظر صاحبَه)",
      /myPendingItems[\s\S]{0,900}ctrCanTransit\("sign","ctr_pending_signature",role\)/.test(src));
    T("★ ولا تعرض منتهياً", /myPendingItems[\s\S]{0,1400}!crqIsFinal\(r\.status\)/.test(src) &&
      /myPendingItems[\s\S]{0,1700}!extIsFinal\(e\.status\)/.test(src));
    T("★ ولا شيءَ للأدوار العارضة",
      /function myPendingItems[\s\S]{0,200}role==="viewer" \|\| role==="observer"\) return out/.test(src));
    T("★ والأقدمُ أوّلاً — ما نام أطولَ يُرى أوّلاً",
      /out\.sort\(function\(a,b\)\{ return String\(a\.at\|\|""\)\.localeCompare\(String\(b\.at\|\|""\)\); \}\)/.test(src));
    T("★★ واللفُّ يستدعي الأصلَ ولا يستبدله (بطاقةُ المشتريات تبقى كما هي)",
      /function hookMyTasks[\s\S]{0,600}var orig = window\.renderPOMyTasks;[\s\S]{0,300}orig\.apply\(this, arguments\)/.test(src));
    T("★ واللفُّ مرّةً واحدةً مهما أُعيد الرسم", /window\.__ctMyTasksHooked/.test(src));
    T("والوحدةُ لا تطلب من index.html إلا وسمَ script (بلا حاويةٍ ثابتة)",
      !/id="ct-my-tasks-card"/.test(HTML) && /MYTASK_ID = "ct-my-tasks-card"/.test(src));

    /* ── (ج) واتساب: الوحدةُ الثالثةُ لا تتكرّر فيها فجوةُ الموارد البشرية ── */
    const rdF = f => { const q = path.resolve(path.dirname(IDX), f); return fs.existsSync(q) ? fs.readFileSync(q, "utf8") : ""; };
    const cfgC = rdF("functions/lib/config.js");
    const ctrSrv = rdF("functions/lib/contracts.js");
    const fnC = rdF("functions/index.js");
    T("★★ وحدةُ توجيه التعاقدات موجودةٌ على الخادم",
      !!ctrSrv && /function routeContractDoc\(kind, before, after/.test(ctrSrv));
    T("★★ ومشغّلاتُ Firestore منشورةٌ للمجموعات الثلاث (إنشاءً وتحديثاً)",
      /CTR_SOURCES = \[/.test(fnC) &&
      /\$\{src\.coll\}\/\{docId\}/.test(fnC) &&
      /RouteUpdate`\] = onDocumentUpdated/.test(fnC) &&
      /RouteCreate`\] = onDocumentCreated/.test(fnC) &&
      /require\("\.\/lib\/contracts"\)/.test(fnC));
    T("★ والمجموعاتُ الافتراضيةُ = ما تكتبه الواجهةُ بالضبط",
      /WA_CONTRACT_REQUESTS_COLLECTION \|\| "global_contract_requests"/.test(cfgC) &&
      /WA_CONTRACT_EXTRACTS_COLLECTION \|\| "global_contract_extracts"/.test(cfgC) &&
      /WA_CONTRACT_CHANGES_COLLECTION \|\| "global_contract_changes"/.test(cfgC));
    T("★ والقالبُ الافتراضيُّ قالبا الشراء المعتمَدان (تعمل لحظةَ النشر — درسُ HRP)",
      /approvalTemplate: process\.env\.WA_CTR_APPROVAL_TEMPLATE \|\| PO\.approvalTemplate/.test(cfgC));

    /* ★★ الحارسُ الحقيقيّ: خريطةُ الخادم تُشتقّ مطابقتُها من **بوّابات الوحدة نفسِها**،
       فبوّابةٌ تُضاف في `contracts.js` بلا مستلمٍ على الخادم تُسقط الاختبارات. */
    const gatesOf = (name) => {
      const m = src.match(new RegExp("var " + name + " = \\{([\\s\\S]*?)\\n\\};"));
      return m ? (m[1].match(/^\s{2}([a-z_]+):/gm) || []).map(x => x.trim().replace(":", "")) : [];
    };
    const routeOf = (name) => {
      const m = cfgC.match(new RegExp("const " + name + " = \\{([\\s\\S]*?)\\n\\};"));
      return m ? (m[1].match(/^\s{2}([a-z_]+):/gm) || []).map(x => x.trim().replace(":", "")) : [];
    };
    const pairs = [["GATE_ROLES", "CRQ_ROUTING"], ["EXT_GATES", "EXT_ROUTING"], ["CHG_GATES", "CHG_ROUTING"]];
    const missing = [];
    pairs.forEach(([g, r]) => {
      const gk = gatesOf(g), rk = routeOf(r);
      gk.forEach(k => { if (!rk.includes(k)) missing.push(g + "." + k); });
    });
    T("★★ كلُّ بوّابةِ انتظارٍ في الوحدة لها مستلمٌ في خريطة الخادم",
      gatesOf("GATE_ROLES").length >= 5 && gatesOf("EXT_GATES").length === 3 &&
      gatesOf("CHG_GATES").length === 4 && missing.length === 0, missing.join(" · "));
    T("★ والأدوارُ مطابقةٌ لبوّابات الوحدة",
      /crq_pending_finance: \{ role: "finance"/.test(cfgC) &&
      /ext_pending_ceo: \{ role: "ceo"/.test(cfgC) &&
      /chg_pending_pm: \{ role: "project_manager"/.test(cfgC));
    T("★ وخانةُ السياق تُميّز المستندَ عن طلب الشراء (وإلا بحثت المالية في الشاشة الخطأ)",
      /CTR_CONTEXT = \{[\s\S]{0,220}extract: "مستخلص عقد"/.test(cfgC) &&
      /function context\(kind, doc\)/.test(ctrSrv));
    T("★ والبحثُ عن المستلم لا يتقيّد بمشروع (مجموعاتُ التعاقدات عامة)",
      /findByRoleAnywhere/.test(ctrSrv) && !/[^A-Za-z]findByRole\(/.test(ctrSrv));
    /* ★★ البابُ نفسُه الذي أُغلق في «أخرى» بالموارد البشرية (v18.9.2534): اسمُ المشروع
       **اليدويّ** نصٌّ حرٌّ يكتبه مقدّمُ الطلب — و«استراحة فلان» اسمُ مشروعٍ طبيعيّ.
       مشاريعُ القائمة المسجّلة أسماؤها من قائمةٍ مغلقة، فلا تُمنَع. */
    T("★★ ولا يخرج اسمُ مشروعٍ **يدويٍّ** (نصٌّ حرٌّ قد يحمل اسمَ شخص) إلى الرسالة",
      /isCustomProject === true \|\| doc\.projectId === "__OTHER__"/.test(ctrSrv) &&
      /مشروع يدويّ/.test(ctrSrv));
    T("★ وأسماءُ المشاريع المسجّلة تمرّ (قائمةٌ مغلقةٌ لا نصٌّ حرّ)",
      /doc\.projectName \|\| doc\.projectId/.test(ctrSrv));
    /* ★★ فحصٌ **تنفيذيّ** لا نصّيّ: يضبط البيئةَ على القالب المخصّص ويعيد تحميل الوحدة
       ويتحقّق من الشكل الرباعيّ ثمّ يستعيد الافتراض. مسارٌ يستيقظ بعد أسابيع (يومَ
       يعتمد Meta القالب) لا يُترك بلا فحصٍ ينفّذه — وعطلُه صامتٌ تماماً: عددُ خاناتٍ
       لا يطابق القالبَ ⇒ Meta ترفض **كلَّ** رسائل التعاقدات بلا تغيّرِ سطرٍ في النظام. */
    {
      const cfgP = path.resolve(path.dirname(IDX), "functions/lib/config.js");
      const ctrP = path.resolve(path.dirname(IDX), "functions/lib/contracts.js");
      const fresh = () => { delete require.cache[cfgP]; delete require.cache[ctrP]; return require(ctrP); };
      const prev = process.env.WA_CTR_APPROVAL_TEMPLATE;
      let borrowed = [], custom = [];
      try {
        delete process.env.WA_CTR_APPROVAL_TEMPLATE;
        borrowed = fresh().approvalParams("اعتمادك", "مستخلص عقد — hail", "EXT-1", "أحمد");
        process.env.WA_CTR_APPROVAL_TEMPLATE = "ctr_approval_needed";
        custom = fresh().approvalParams("اعتمادك", "مستخلص — hail", "EXT-1", "أحمد");
      } finally {
        if (prev === undefined) delete process.env.WA_CTR_APPROVAL_TEMPLATE;
        else process.env.WA_CTR_APPROVAL_TEMPLATE = prev;
        fresh();
      }
      T("★★ شكلُ الخانات يتبع القالبَ المضبوط: ٥ للمستعار و٤ للمخصّص",
        borrowed.length === 5 && custom.length === 4,
        "مستعار=" + borrowed.length + " · مخصّص=" + custom.length);
      T("★ والخانةُ الخامسة «عدد البنود» = 1 في المستعار وحدَه",
        borrowed[4] === "1" && custom[4] === undefined);
      T("★ والفرزُ بمطابقة اسم القالب لا بعَلَمٍ منفصلٍ يُنسى",
        /cfg\.CTR\.approvalTemplate === cfg\.PO\.approvalTemplate/.test(ctrSrv));
      T("★ والسياقُ المختصرُ للمخصّص وحدَه (لا حشوَ «عقد» مع نصٍّ ثابتٍ يقوله)",
        /CTR_CONTEXT_SHORT = \{[\s\S]{0,200}extract: "مستخلص"/.test(cfgC) &&
        /usingPoApprovalTemplate\(\) \? KINDS\[kind\]\.context : KINDS\[kind\]\.contextShort/.test(ctrSrv));
    }

    /* ★★ الدورُ الاحتياطيّ — «مديرُ المشاريع هو نفسُه الأدمن» (طلبُ المالك).
       السلوكُ نفسُه يُنفَّذ في `wa-routing-check.mjs` (فحصٌ غيرُ متزامنٍ لا يسعه هذا
       المُشغّل المتزامن) — وهنا حرّاسُ الاتّساق التي تمنع تفكيكَ القاعدة. */
    T("★★ الدورُ الاحتياطيُّ مضبوطٌ على الأدمن ويُعطَّل بقيمةٍ فارغة",
      /ROLE_FALLBACK = \(process\.env\.WA_ROLE_FALLBACK \?\? "admin"\)/.test(cfgC));
    T("★★ ويُستعمَل **عند الفراغ فقط** لا كمستلمٍ إضافيّ",
      /if \(!out\.length && !_noFallback && ROLE_FALLBACK && ROLE_FALLBACK !== role\)/.test(rdF("functions/lib/recipients.js")));
    T("★ ويُستنفَد الدورُ الحقيقيُّ في كلّ المواضع قبل الارتداد",
      /const central = await findByRole\(db, role, "", true\);/.test(rdF("functions/lib/recipients.js")));
    T("★ ولا يرتدّ الدورُ الاحتياطيُّ على نفسه (حلقةٌ لا نهائية)",
      /ROLE_FALLBACK !== role/.test(rdF("functions/lib/recipients.js")));
    T("★★ وطبقةُ التوجيه الخادمية لها فحصٌ **ينفّذها** لا يقرؤها",
      fs.existsSync(path.resolve(path.dirname(IDX), "wa-routing-check.mjs")) &&
      /wa-routing-check\.mjs/.test(rdF(".github/workflows/hail-tests.yml")));

    /* ── زرُّ «فتح المستند» في الرسالة ── */
    T("★★ موجِّهُ الروابط يعرف بادئاتِ التعاقدات (وإلا فزرٌّ يَعِد ولا يفي)",
      /function _isCtrId\(id\)/.test(HTML) && /_isCtrId\(poId\)\) return _openPendingCTR\(\)/.test(HTML));
    T("★ والقرارُ للوحدة نفسِها فلا تُنسَخ قائمةُ البادئات في موضعين",
      /window\.contracts\.ownsId\(id\)/.test(HTML) && /function ctrIdKind\(id\)/.test(src));
    T("★ والوحدةُ تنتظر مزامنتَها بحدٍّ زمنيٍّ صريحٍ لا انتظاراً أبدياً",
      /function openById\(id\)[\s\S]{0,1200}tries > 40[\s\S]{0,160}تعذّر إيجاد المستند/.test(src));
    T("★ والرابطُ لا يفتح لمن لا يملك الصلاحية",
      /function openById[\s\S]{0,300}if\(!canView\(\)\)/.test(src));

    T("★ ولا مبالغَ في متن الرسالة (قاعدةُ الشراء والموارد البشرية نفسُها)",
      !/params: \[[\s\S]{0,200}(value|amount)/.test(ctrSrv));
    /* ★★ القاعدةُ «لا إشعارَ بلا منتظِر» تبقى — والاستثناءُ **واحدٌ مُعلَّل**:
       العقدُ بانتظار التوقيع ينتظر فعلاً من **غير** مَن أنشأه (طباعةٌ وتوقيعٌ ورفعُ
       نسخة)، ويحجز المالَ ويمنع كلَّ مستخلصٍ حتى يقع. الحارسُ يمنع تمدّدَ الاستثناء:
       مفتاحٌ واحدٌ لا أكثر في خريطة حالات العقد. */
    {
      const m = cfgC.match(/const CTR_STATUS_ROUTING = \{([\s\S]*?)\n\};/);
      const keys = m ? (m[1].match(/^\s{2}([a-z_]+):/gm) || []).map(x => x.trim().replace(":", "")) : [];
      T("★★ حالةُ العقد المُشعِرةُ واحدةٌ لا غير: بانتظار التوقيع",
        keys.length === 1 && keys[0] === "ctr_pending_signature", keys.join(" · "));
      T("★ والمستلمُ صاحبُ المسؤولية لا كلُّ من يملك الزرّ",
        /ctr_pending_signature: \{ role: "procurement_officer"/.test(cfgC));
      T("★ ولا يُشعَر مُنشئُ العقد بفعل نفسه",
        /CTR_NOTIFY_OWNER = new Set\(\[\]\)/.test(cfgC));
      T("★ ولا تُشعِر بقيةُ الانتقالات (إيقاف · استئناف · إقفال · فسخ)",
        !/ctr_suspended:|ctr_active:|ctr_closed:|ctr_terminated:/.test(m ? m[1] : ""));
      T("★★ ومشغّلُ العقد منشورٌ مع الثلاثة (وإلا بقيت الحالةُ بلا رسالة)",
        /kind: "contract", coll: cfg\.CONTRACTS_COLLECTION/.test(fnC) &&
        /WA_CONTRACTS_COLLECTION \|\| "global_contracts"/.test(cfgC));
      T("★ والبطاقةُ والرسالةُ صارتا متّسقتين — ما يظهر انتظاراً يصل صاحبَه",
        /myPendingItems[\s\S]{0,900}ctr_pending_signature/.test(src) &&
        keys.indexOf("ctr_pending_signature") !== -1);
    }
  }

  /* ════════════════════════════════════════════════════════════
     المرحلتان ١٠ و١١ — أداءُ الطرف، والتعاقداتُ في لوحة المعلومات
     ════════════════════════════════════════════════════════════ */
  {
    const TODAY = "2026-08-10";
    const CS10 = [
      { id:"C1", vendorId:"V1", status:"ctr_closed",     value:100000, startDate:"2026-01-01", durationDays:30, updatedAt:"2026-03-05", changeOrders:[{id:"G1",amount:5000,status:"approved"}] },
      { id:"C2", vendorId:"V1", status:"ctr_active",     value:50000,  startDate:"2026-08-01", durationDays:60 },
      { id:"C3", vendorId:"V1", status:"ctr_terminated", value:20000 },
      { id:"C9", vendorId:"V2", status:"ctr_active",     value:9000 }
    ];
    const EX10 = [
      { id:"E1", contractId:"C1", status:"ext_paid", payment:{amount:60000} },
      { id:"E2", contractId:"C1", status:"ext_returned" },
      { id:"E3", contractId:"C9", status:"ext_paid", payment:{amount:1000} }
    ];
    const CG10 = [{ id:"G1", contractId:"C1", status:"chg_applied" }];
    const sc = C._vendorScorecard("V1", CS10, EX10, CG10, TODAY);

    T("★ بطاقةُ الأداء تعدّ عقودَ الطرف وحدَه", sc.contracts === 3, String(sc.contracts));
    T("★ وتفرزها سارياً ومنتهياً ومفسوخاً",
      sc.active === 1 && sc.done === 1 && sc.terminated === 1);
    T("★ والقيمةُ تشمل أوامرَ التغيير المطبَّقة (105,000 + 50,000 + 20,000)",
      sc.value === 175000, String(sc.value));
    T("★ والمسدَّدُ من مستخلصات عقوده وحدَها (لا مستخلصِ طرفٍ آخر)",
      sc.paid === 60000, String(sc.paid));
    T("★★ وتأخّرُ عقدٍ منتهٍ يُقاس **بتاريخ إقفاله** لا باليوم",
      C._ctrLateDays({ status:"ctr_closed", startDate:"2026-01-01", durationDays:30, updatedAt:"2026-03-05" }, TODAY) ===
      C._ctrLateDays({ status:"ctr_closed", startDate:"2026-01-01", durationDays:30, updatedAt:"2026-03-05" }, "2026-12-31"));
    T("★ وإلا صار كلُّ عقدٍ قديمٍ «متأخّراً» بمرور الزمن",
      C._ctrLateDays({ status:"ctr_active", startDate:"2026-01-01", durationDays:30 }, "2026-12-31") >
      C._ctrLateDays({ status:"ctr_active", startDate:"2026-01-01", durationDays:30 }, TODAY));
    T("★ والمستخلصُ المُعادُ يُعدّ ملاحظةً", sc.extBounced === 1);

    /* ★★ القرارُ المميّز: لا درجةَ مخترَعة */
    T("★★ لا درجةَ إجماليةً ولا نجوم — وقائعُ وإشاراتٌ مسمّاةٌ فقط",
      sc.score === undefined && sc.rating === undefined && sc.stars === undefined &&
      Array.isArray(sc.flags));
    T("★ ولكلّ إشارةٍ سببُها الظاهرُ في نصّها",
      sc.flags.length >= 3 && sc.flags.every(f => f.key && f.sev && /\d/.test(f.lbl)));
    T("★ والفسخُ إشارةٌ حرجة", sc.flags.some(f => f.key === "terminated" && f.sev === "crit"));
    T("★ وطرفٌ بلا عقودٍ لا تُخترَع له أرقام",
      C._vendorScorecard("V-NONE", CS10, EX10, CG10, TODAY).contracts === 0 &&
      C._vendorScorecard("V-NONE", CS10, EX10, CG10, TODAY).flags.length === 0);
    T("★ وبطاقتُه تقول ذلك صراحةً لا تعرض أصفاراً",
      /لا عقودَ معه بعد — لا أداءَ يُقاس/.test(src));
    T("★ والقسمُ يشرح لماذا لا درجةَ فيه", /لا درجةَ إجمالية عمداً/.test(src));

    /* ── لوحة المعلومات ── */
    const d = C._dashSummary(CS10, EX10, TODAY);
    T("★ ملخّصُ اللوحة يعدّ السارياتِ وحدَها (لا المقفلَ ولا المفسوخ)",
      d.active === 2, String(d.active));
    T("★ و«الملتزَمُ به المتبقّي» = قيمةُ السارية − ما سُدِّد منها",
      d.remaining === 50000 + 8000, String(d.remaining));
    T("★ ويرصد المستخلصاتِ المنتظِرةَ للسداد",
      C._dashSummary(CS10, EX10.concat([{ id:"E4", contractId:"C2", status:"ext_pending_finance", settled:{net:7000} }]), TODAY).awaitingPay === 1);
    T("★ ويرصد العقودَ بانتظار التوقيع",
      C._dashSummary(CS10.concat([{ id:"CX", vendorId:"V1", status:"ctr_pending_signature", value:1 }]), EX10, TODAY).pendingSign === 1);
    T("★ ويرصد المتأخّرَ عن مدّته", d.late >= 0 && typeof d.lateMax === "number");

    /* ★★ اللفُّ عند الإقلاع لا عند فتح صفحتنا */
    T("★★ اللفّان يُركَّبان عند الإقلاع (وإلا لم تظهر البطاقتان لمن لا يفتح صفحةَ التعاقدات)",
      /function init\(\)[\s\S]{0,900}hookMyTasks\(\);[\s\S]{0,40}hookDash\(\);/.test(src));
    T("★ ويُعادان مع مراقب الـDOM (النواةُ تعيد بناءَ الشاشات بعد الدخول)",
      /MutationObserver\(function\(\)\{ injectSidebarGroup\(\); hookShowPage\(\); hookMyTasks\(\); hookDash\(\); \}\)/.test(src));
    T("★ وبطاقةُ اللوحة تُحقن بجوار ملخّص المشتريات بلا تعديل index.html",
      /getElementById\("dash-purchase-summary-card"\)/.test(src) && !/id="ct-dash-card"/.test(HTML));
    T("★ ولا تظهر لمن لا يملك الاطلاع، ولا حين لا عقودَ أصلاً",
      /function renderDashCard[\s\S]{0,700}if\(!canView\(\)\)[\s\S]{0,300}!d\.active && !d\.pendingSign/.test(src));
  }

  /* ════════════════════════════════════════════════════════════
     المرحلة ٦ — قواعدُ Firestore: الحارسُ على الخادم

     الفحصُ الحقيقيُّ للقواعد يجري على محاكٍ (`rules-check.mjs`) — لأن قاعدةً
     أمنيةً لا تُختبَر بقراءة سطرها. وما هنا **حرّاسُ اتّساقٍ**: يمنعون أن تُضاف
     مجموعةٌ أو انتقالُ حالةٍ في الوحدة فتبقى القواعدُ متخلّفةً عنها بصمت.
     ════════════════════════════════════════════════════════════ */
  {
    const rulesPath = path.resolve(path.dirname(IDX), "firestore.rules");
    const RUL = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, "utf8") : "";
    T("ملفُّ قواعد Firestore موجود", RUL.length > 0);
    const rcPath = path.resolve(path.dirname(IDX), "rules-check.mjs");
    const RULES_CHECK = fs.existsSync(rcPath) ? fs.readFileSync(rcPath, "utf8") : "";

    /* ★ الحارسُ الأهمّ: القاعدةُ العامة تسمح لكلّ دورٍ بالكتابة في كلّ شيء، وقواعدُ
       Firestore تُقيَّم بـ«أو» — فما لم تُستثنَ مجموعاتُ التعاقدات منها، كلُّ القفل
       أعلاه زينةٌ لا أثرَ لها. */
    T("★★ القاعدةُ العامة تستثني مجموعاتِ التعاقدات (وإلا فالقفلُ بلا أثر)",
      /allow write:[^\n]*!ctrLocked\(document\[0\]\)/.test(RUL));

    // كلُّ مجموعةٍ تكتب فيها الوحدة يجب أن تكون مقفلةً — القائمةُ تُشتقّ من الوحدة
    const lockedBlock = (RUL.match(/function ctrLocked\(coll\)\s*\{[\s\S]*?\}/) || [""])[0];
    /* `global_purchases` تُستثنى: ليست من بيانات الوحدة بل من بيانات النظام، وتبقى
       عمداً تحت القاعدة العامة. الوحدةُ تكتب فيها **حقلَ ربطٍ واحداً** يحرسه عهدُ
       العزل أعلاه — وقفلُها هنا كان سيقفل مسارَ المشتريات كلَّه بلا قصد. */
    const usedColls = [...new Set((src.match(/return _dev\(\) \? "(global_[a-z_]+)_dev"\s*:\s*"(global_[a-z_]+)"/g) || [])
      .map(x => (x.match(/:\s*"(global_[a-z_]+)"/) || [])[1]).filter(Boolean))]
      .filter(c => c !== "global_purchases");
    const notLocked = usedColls.filter(c => !lockedBlock.includes("'" + c + "'"));
    T("★ كلُّ مجموعةٍ تكتب فيها وحدةُ التعاقدات مقفلةٌ في القواعد",
      usedColls.length >= 4 && notLocked.length === 0, notLocked.join(" "));
    const notLockedDev = usedColls.filter(c => !lockedBlock.includes("'" + c + "_dev'"));
    T("★ ونسختُها التجريبيةُ (_dev) مقفلةٌ أيضاً — وإلا فبابٌ خلفيٌّ مفتوح",
      notLockedDev.length === 0, notLockedDev.join(" "));

    // كلُّ انتقالِ حالةٍ في الوحدة له نظيرُه في القواعد
    const transitBlock = (RUL.match(/function ctrTransitOk\([\s\S]*?\n    \}/) || [""])[0];
    const missingTo = Object.keys(C._CTR_TRANSITIONS)
      .map(k => C._CTR_TRANSITIONS[k].to)
      .filter(to => !transitBlock.includes("'" + to + "'"));
    T("★ كلُّ حالةٍ ينتقل إليها العقدُ في الوحدة مذكورةٌ في قواعد الخادم",
      missingTo.length === 0, missingTo.join(" "));

    /* ★★ الفخُّ الذي كاد يُسقط كلَّ سدادٍ أخيرٍ في المنصة: `CTR_TRANSITIONS.complete`
       لمدير المشاريع، لكنّ **سدادَ المستخلص الختاميّ يُنهي العقد في معاملة المالية
       نفسِها**. قاعدةٌ تنسخ الجدولَ حرفياً ترفض تلك الكتابة فيسقط آخرُ مستخلصٍ من
       كلّ عقد. الحارسُ يُثبّت الاستثناءَ لئلّا يُحذَف بحسن نيّةٍ عند «تنظيف» القواعد. */
    T("★★ والماليةُ مأذونٌ لها بالإنهاء الفنّيّ — لأنّ المستخلصَ الختاميَّ يفعلها في معاملتها",
      /to == 'ctr_completed'[\s\S]{0,120}'finance'/.test(transitBlock));
    /* الحذفُ ممنوعٌ في كلّ مجموعاتِ التعاقدات — **إلا** بابٌ واحدٌ ضيّقٌ فُتح
       بطلب المالك: الأدمن يحذف طلباً **ملغى** (ورقةٌ ماتت قبل أن تُنتج أثراً).
       الحارسُ يُثبّت الحدَّين معاً: بقيةُ المجموعات مقفلةٌ بـ`if false`، والبابُ
       المفتوحُ مشروطٌ بالأدمن **وبالحالة الملغاة** لا بأحدهما. */
    /* المقفلُ بلا بابٍ إطلاقاً بعد أن فُتح للطلب الملغى وللعقد غير الموقَّع:
       **المستخلصاتُ وأوامرُ التغيير** (٤ مواضع: إنتاجٌ وتجريبيّ لكلٍّ منهما).
       والعددُ محسوبٌ لا «على الأقلّ» — فبابٌ جديدٌ يُفتح بلا قصدٍ يُسقط الفحص. */
    T("★ ولا حذفَ للمستخلصات ولا لأوامر التغيير من العميل إطلاقاً",
      (RUL.match(/allow delete: if false;/g) || []).length === 4,
      "المواضع: " + (RUL.match(/allow delete: if false;/g) || []).length);
    T("★★ وحذفُ طلب التعاقد مشروطٌ بالأدمن **وبالحالة الملغاة** معاً",
      /function crqDeleteOk\(\) \{[\s\S]{0,200}isAdmin\(\) && resource\.data\.status == 'crq_cancelled'/.test(RUL) &&
      (RUL.match(/allow delete: if crqDeleteOk\(\);/g) || []).length === 2);
    T("★ والفحصُ على المحاكي يُثبت البابَ وحدودَه (حيٌّ · مسدَّدٌ · محوَّلٌ · غيرُ أدمن)",
      /crq_cancelled[\s\S]{0,600}deleteDoc\(doc\(ADMIN/.test(RULES_CHECK) &&
      /deleteDoc\(doc\(PROC/.test(RULES_CHECK) && /RPAID/.test(RULES_CHECK));
    T("★ والآيبانُ لا يتغيّر إلا بيد المالية أو الأدمن",
      /ibanOf\(request\.resource\.data\) == ibanOf\(resource\.data\) \|\| anyRole\(\['finance','admin'\]\)/.test(RUL));

    /* ════ البند C1 — مستنداتُ الحسابات مقفولةٌ على الأدمن ════
       `meta/users` و`meta/{proj}_users` (و`_dev`) ليست بياناتٍ بل **إصدارُ صلاحية**:
       فيها `hash` و`role`، ومنها يُصادِق الـWorker ويُصدر التوكِن. فمن يكتب فيها
       يكتب لنفسه دورَ `admin` ثم يدخل به. وكانت القاعدةُ العامة تمنح ذلك **لكلّ
       دورٍ غيرِ الزائر** — فمراقبٌ يصير أدمن بسطرٍ في الـConsole.
       والحارسُ يُثبّت **الشقَّين معاً**: الاستثناءَ من العامة (وبلا ذلك القفلُ زينة)
       والبلوكَ الذي يقصر الكتابةَ على الأدمن. أحدُهما بلا الآخر لا يعني شيئاً. */
    T("★★★ القاعدةُ العامة تستثني مستنداتِ الحسابات (وإلا فالقفلُ بلا أثر)",
      /allow write:[\s\S]{0,160}!isUsersDoc\(document\[0\], document\[1\]\)/.test(RUL));
    T("★★★ وبلوكُها يقصر الكتابةَ على الأدمن وحدَه — والقراءةُ لم تُمَسّ",
      /match \/meta\/\{doc\} \{\s*\n\s*allow write: if isAdmin\(\) && doc\.matches\('\(\.\*_\)\?users\(_dev\)\?'\);/.test(RUL) &&
      // لا شرطَ قراءةٍ أُضيف في البلوك الجديد: القراءةُ تبقى من القاعدة العامة
      !/allow (read|read, write): if isAdmin\(\) && doc\.matches\('\(\.\*_\)\?users/.test(RUL));
    /* والنمطُ يجب أن يغطّي المسارات **الأربعةَ التي تكتبها الواجهةُ فعلاً** — تُشتقّ
       من `index.html` لا تُكتب هنا: لو أضاف تعديلٌ لاحقٌ مساراً خامساً بلا تغطيةٍ
       عاد البابُ مفتوحاً بلا أن يظهر ذلك في أيّ سطرٍ من القواعد. */
    {
      const usersRe = /^(.*_)?users(_dev)?$/;
      const appPaths = ["users", "users_dev", "hail_users", "hail_users_dev"];
      T("★★ ونمطُ الأسماء يغطّي مسارات الواجهة الأربعة (مركزيّ · مشروع · ونسختاهما)",
        appPaths.every(p => usersRe.test(p)) &&
        /doc\.matches\('\(\.\*_\)\?users\(_dev\)\?'\)/.test(RUL));
      T("★ ولا يبتلع مستنداتِ meta الأخرى (عدّادٌ · إعداداتٌ · إشعارات — وإلا عطّلناها)",
        !["hail_counter", "hail_settings", "hail_notifications", "projects", "ppm_checklists"]
          .some(p => usersRe.test(p)));
      /* والواجهةُ لا تكتب مستندَ حساباتٍ بمسارٍ خارج النمط — والمساراتُ تُبنى بثلاث
         طرقٍ في `index.html`، فتُجمع الثلاثُ لا الحرفيّةُ وحدَها (وإلا مرّ المبنيُّ
         بالتجميع بلا فحصٍ وهو نصفُ المسارات). */
      const idxUserPaths = [];
      (HTML.match(/"meta\/[a-z_]*users[a-z_]*"/g) || [])                 // "meta/users"
        .forEach(x => idxUserPaths.push(x.replace(/"/g, "").slice(5)));
      (HTML.match(/`meta\/\$\{[A-Za-z.]+\}_users(_dev)?`/g) || [])       // `meta/${projId}_users`
        .forEach(x => idxUserPaths.push("hail" + x.slice(x.indexOf("}") + 1, -1)));
      (HTML.match(/"_users(_dev)?"/g) || [])                             // "meta/"+id+"_users"
        .forEach(x => idxUserPaths.push("hail" + x.replace(/"/g, "")));
      const idxUnique = [...new Set(idxUserPaths)];
      T("★★ وكلُّ مسارِ حساباتٍ مكتوبٍ في `index.html` مشمولٌ بالنمط",
        idxUnique.length >= 4 && idxUnique.every(p => usersRe.test(p)),
        "خارج النمط: " + idxUnique.filter(p => !usersRe.test(p)).join(" "));
    }
    T("★★★ وفحصُ المحاكي يجرّب الاستغلالَ نفسَه (مراقبٌ يزرع حسابَ أدمن) ويجرّب المسارَ الشرعيّ",
      /مراقبٌ لا يزرع حسابَ أدمن/.test(RULES_CHECK) &&
      /role: "admin"[\s\S]{0,80}مُتسلّق/.test(RULES_CHECK) &&
      /assertSucceeds\(setDoc\(doc\(ADMIN, U_C\)/.test(RULES_CHECK));
    T("★★ ويُثبت أن القراءةَ لم تُمَسّ وأنّ تطبيقَ الفنيين (المجهول) لم يتعطّل",
      /assertSucceeds\(getDoc\(doc\(WH, U_C\)\)\)/.test(RULES_CHECK) &&
      /const TECH = env\.authenticatedContext\("tech_anon", \{\}\)/.test(RULES_CHECK) &&
      /assertFails\(setDoc\(doc\(TECH, U_C\)/.test(RULES_CHECK));
    /* والشاشةُ تتبع الخادمَ: «إدارةُ مستخدمي المشتريات» يراها المستودعاتُ والمشتريات،
       فبلا حارسٍ في الواجهة ينقر أحدُهما زرّاً يعدّل النسخةَ المحلّيةَ ثمّ يُردّ
       بـ`permission-denied` بلا تفسير — قفلٌ صحيحٌ بواجهةٍ كاذبة. */
    {
      const uWriters = ["puSaveUserWa", "puAddUser", "puDeleteUser",
                        "puChangePassword", "puSavePassword", "saveUserPerms"];
      const unguarded = uWriters.filter(fn =>
        !new RegExp("function " + fn + "\\([^)]*\\)\\s*\\{[\\s\\S]{0,600}?_adminOnlyUsersGuard\\(\\)").test(HTML));
      T("★★ وواجهةُ إدارة المستخدمين تتبع القفل: حارسُ أدمنٍ على كلّ كاتبٍ للحسابات",
        /function _canManageUsers\(\)\{ return !!\(currentUser && currentUser\.role === "admin"\); \}/.test(HTML) &&
        unguarded.length === 0, "بلا حارس: " + unguarded.join(" "));
    }
    T("★ ولغيرِ الأدمن قائمةٌ للاطّلاع بلا أزرارٍ ولا نموذجِ إضافة",
      /_form\.style\.display = _mng \? "" : "none"/.test(HTML) &&
      /للاطّلاع فقط — إضافةُ الحسابات وتعديلُها وحذفُها من صلاحية المسؤول وحدَه/.test(HTML));

    // الفحصُ الحقيقيُّ مربوطٌ بـCI — وإلا فقواعدُ الأمان الوحيدةُ بلا حارسٍ آليّ
    const wfR = fs.readFileSync(path.resolve(path.dirname(IDX), ".github/workflows/hail-tests.yml"), "utf8");
    T("★ وفحصُ القواعد على محاكٍ حقيقيٍّ مربوطٌ بـCI",
      /rules-check\.mjs/.test(wfR) && /setup-java/.test(wfR) &&
      /firestore\.rules/.test(wfR) && fs.existsSync(path.resolve(path.dirname(IDX), "rules-check.mjs")));
    /* firebase-tools يرفض Java دون 21 صراحةً، وسقط الفحصُ في CI على 17 —
       فالرقمُ ليس تفصيلاً تنسيقياً بل شرطُ تشغيل. */
    {
      const jv = (wfR.match(/java-version:\s*'(\d+)'/) || [])[1];
      T("★ ونسخةُ Java في CI ≥ 21 (firebase-tools يرفض ما دونها)",
        Number(jv) >= 21, "java-version " + jv);
    }
  }

  /* ════════════════════════════════════════════════════════════
     المرآةُ المحلّية ونافذةُ التأكيد — علّتان ظهرتا للمالك في شاشةٍ واحدة
     ════════════════════════════════════════════════════════════
     **(أ) الطلبُ يظهر مرّتين.** بعد إنشاء طلب تعاقدٍ واحدٍ ظهرت بطاقتان
     **بالمعرّف نفسِه** (CRQ-2608-0002) وعُدَّ الطلبُ مرّتين في العدّادات. الجذرُ ليس
     إرسالاً مكرّراً — لو كان كذلك لاختلف المعرّفان: مستمعُ Firestore يعرض الكتابةَ
     محلّياً (تعويضُ الكمون) **قبل** أن يُحلَّ وعدُ `set()`، فتدخل الوثيقةُ المصفوفةَ
     من اللقطة، ثمّ تُضيفها إضافةٌ عمياءُ بعدها مرّةً ثانية.
     **(ب) الاعتمادُ بزرِّ حذف.** `showConfirm` افتراضاتُها للحذف (سلّةٌ وزرٌّ أحمر
     نصُّه «حذف»)، ونداءاتُ الوحدة كانت تمرّر العنوانَ والنصَّ فقط — فسأل المربّعُ
     «اعتماد الطلب» وزرُّه يقول «حذف». وهي كذلك **تَرفُض** عند الإلغاء، فكانت
     نقرةُ «إلغاء» تهبط في `catch` وتُظهر «تعذّر الإجراء» بلا خطأ. */
  {
    T("★★ الإضافةُ إلى المرآة المحلّية تمرّ بـ`_mirror` وحدَها (لا إضافةً عمياء)",
      typeof C._mirror === "function" &&
      !/_(reqs|ctrs|exts|chgs)\.(unshift|push)\(/.test(src));
    T("★★ و`_mirror` يُسند بالمعرّف فلا تتكرّر الوثيقةُ مهما سبقت اللقطةُ الوعد",
      (function () {
        if (typeof C._mirror !== "function") return false;
        const arr = [];
        C._mirror(arr, { id: "CRQ-1", v: 1 }, true);        // وعدُ الإنشاء
        C._mirror(arr, { id: "CRQ-1", v: 2 }, true);        // اللقطةُ نفسُها ثانيةً
        C._mirror(arr, { id: "CRQ-2", v: 9 }, true);
        return arr.length === 2 && arr[0].id === "CRQ-2" &&
               arr[1].id === "CRQ-1" && arr[1].v === 2;      // الأحدثُ يدهس الأقدم
      })());
    T("★ والإدراجُ في المؤخّرة متاحٌ للمستخلصات وأوامر التغيير بلا تكرار",
      (function () {
        const arr = [{ id: "A" }];
        C._mirror(arr, { id: "B" }, false);
        C._mirror(arr, { id: "B" }, false);
        return arr.length === 2 && arr[1].id === "B";
      })());
    T("★ ووثيقةٌ بلا معرّفٍ لا تدخل المرآة (لا سطرَ أشباحٍ بلا هوية)",
      (function () { const a = []; C._mirror(a, { v: 1 }, true); return a.length === 0; })());

    T("★★ كلُّ نداءِ تأكيدٍ يُصرّح بنيّته — فلا يظهر الاعتمادُ بزرِّ حذف",
      (function () {
        const calls = src.match(/_confirm\(\{[\s\S]{0,500}?\}\)\)/g) || [];
        return calls.length >= 5 && calls.every(c => /\bkind\s*:/.test(c));
      })());
    T("★ والافتراضُ محايدٌ لا مدمِّر (لا سلّةَ حذفٍ ولا زرَّ أحمرَ بلا سبب)",
      C._CONFIRM_KINDS && C._CONFIRM_KINDS.neutral.okClass !== "btn-danger" &&
      C._CONFIRM_KINDS.neutral.okText !== "حذف" &&
      C._CONFIRM_KINDS.approve.okClass === "btn-primary" &&
      C._CONFIRM_KINDS.approve.icon !== "🗑");
    if (typeof C._confirm === "function") {
      const seen = [];
      sandbox.showConfirm = o => { seen.push(o); return Promise.resolve(true); };
      _deferred.push(C._confirm({ kind: "approve", title: "اعتماد الطلب", msg: "؟" }).then(ok => {
        T("★★ نيّةُ «اعتماد» تُترجَم إلى زرِّ اعتمادٍ لا زرِّ حذف",
          ok === true && seen.length === 1 && seen[0].okText === "اعتماد" &&
          seen[0].okClass === "btn-primary" && seen[0].icon !== "🗑" &&
          seen[0].kind === undefined, JSON.stringify(seen[0] || {}));
      }));
      sandbox.showConfirm = () => Promise.reject(false);   // ما تفعله «إلغاء» فعلاً
      _deferred.push(C._confirm({ kind: "approve", msg: "؟" }).then(v => {
        T("★★ و«إلغاء» تُحلّ بـ`false` ولا تُرفَض — فلا تنبيهَ «تعذّر الإجراء» بلا خطأ",
          v === false, String(v));
      }, () => T("★★ و«إلغاء» تُحلّ بـ`false` ولا تُرفَض — فلا تنبيهَ «تعذّر الإجراء» بلا خطأ", false, "رُفض الوعد")));
    } else T("★★ `_confirm` مكشوفةٌ للفحص", false);
  }

  /* ── زرُّ «تفاصيل الطرف» في بطاقتَي الطلب والعقد (طلبُ المالك) ──
     خانةُ الطرف كانت اسماً مجرّداً: المعتمِدُ يقرّر على طرفٍ لا يرى وثائقَه ولا
     صلاحيتَها ولا حالتَه ولا أداءَه. والفحصُ الحقيقيُّ (ضغطُ الزرِّ وفتحُ البطاقة)
     في `contracts-check.mjs`؛ وهنا حرّاسُ الاتّساق. */
  {
    T("★★ خانةُ الطرف في بطاقتَي الطلب والعقد تمرّ بـ`vendorCell` (اسمٌ + زرّ)",
      /function vendorCell\(vendorId, vendorName\)/.test(src) &&
      (src.match(/infoCell\("الطرف", vendorCell\(/g) || []).length === 2 &&
      !/infoCell\("الطرف", _esc\(/.test(src));
    T("★ ولا زرَّ يَعِد ولا يفي: بلا معرّفِ طرفٍ أو بلا صلاحيةِ اطّلاعٍ لا يظهر",
      /function vendorCell[\s\S]{0,300}if\(!vendorId \|\| !canView\(\)\) return name;/.test(src));
    T("★★ والفتحُ ينقل الصفحةَ **ويفتح بطاقةَ الطرف** (لا قائمتَهم)",
      /function openVendorFrom\(vendorId\)[\s\S]{0,400}showPage\(PAGE_VENDORS\)[\s\S]{0,80}openVendor\(vendorId\)/.test(src) &&
      /openVendorFrom: openVendorFrom/.test(src));
    T("★ والصلاحيةُ تُفحَص في الدالّة نفسِها لا على الزرّ وحده",
      /function openVendorFrom[\s\S]{0,200}if\(!canView\(\)\)/.test(src));
    T("★ ولا مؤقّتَ انتظارٍ: لقطةُ الأطراف تُعيد الرسمَ وحدَها متى وصلت",
      /function openVendorFrom[\s\S]{0,400}\}/.test(src) &&
      !/function openVendorFrom[\s\S]{0,400}setInterval/.test(src) &&
      /_page===PAGE_VENDORS\) paintVendors\(\)/.test(src));
    T("★ ونمطُ الزرّ من توكنز المنصة داخل الخانة (لا يُزاحم الاسمَ على الجوال)",
      /\.ct-vbtn\{/.test(src) && /ct-vbtn/.test(src));
  }

  /* ── حذفُ الطلبات الملغاة للأدمن (طلبُ المالك) ──
     الفعلُ الوحيدُ في الوحدة الذي **لا رجعةَ فيه**، فحدُّه ضيّقٌ بثلاث طبقات:
     الزرُّ لا يظهر إلا للأدمن على ملغى · وطبقةُ البيانات ترفض غيرَ ذلك بعد قراءة
     **الوثيقة الطازجة** · وقواعدُ الخادم تقول القاعدةَ نفسَها فلا تكفي واجهةٌ مزوَّرة. */
  {
    T("★★ الحذفُ للأدمن وحدَه — والرفضُ في طبقة البيانات لا على الزرّ",
      /function deleteRequest\(id\)[\s\S]{0,300}_role\(\) !== "admin"[\s\S]{0,60}حذف الطلبات للأدمن فقط/.test(src));
    T("★★ ولا يُحذف إلا **الملغى**، والحالةُ تُقرأ من الوثيقة الطازجة لا من المرآة",
      /function deleteRequest[\s\S]{0,500}ref\.get\(\)[\s\S]{0,400}r\.status !== "crq_cancelled"[\s\S]{0,80}لا يُحذف إلا الطلبُ الملغى/.test(src));
    T("★ والمرآةُ المحلّيةُ تُنظَّف والبطاقةُ المفتوحةُ تُغلق (لا بطاقةٌ لوثيقةٍ محذوفة)",
      /function deleteRequest[\s\S]{0,700}_reqs\.splice\(i,1\)[\s\S]{0,120}if\(_rOpen===id\) _rOpen=null;/.test(src));
    T("★★ والحذفُ يُسجَّل في التدقيق (ما حُذف يبقى مذكوراً)",
      /function deleteRequest[\s\S]{0,800}_audit\("حذف طلب تعاقد ملغى"/.test(src));
    T("★ والزرُّ لا يظهر إلا للأدمن على طلبٍ ملغى",
      /r\.status==="crq_cancelled" && _role\(\)==="admin"[\s\S]{0,200}contracts\.doDelete\(\)/.test(src));
    T("★ والتأكيدُ يقول «لا رجعة» ويذكر المعرّفَ الذي سيُمحى",
      /function doDelete\(\)[\s\S]{0,600}kind:"danger"[\s\S]{0,400}لا يمكن استرجاعه/.test(src));
    T("★ والمقبضان مكشوفان (الشاشةُ والبيانات) لفحص المتصفّح",
      /doDelete: doDelete/.test(src) && /_delete: deleteRequest/.test(src));
  }

  /* ════ التصميم: بلا لونٍ جديدٍ خارج توكنز المنصة ════ */
  const css = (src.match(/st\.textContent = \[([\s\S]*?)\]\.join/) || [])[1] || "";
  const rawHex = (css.match(/#[0-9a-fA-F]{3,8}\b/g) || []);
  T("★ نمطُ الوحدة بلا ألوانٍ صريحة — توكنز المنصة وحدها (يتبع الثيمين تلقائياً)",
    rawHex.length === 0, rawHex.join(" "));
  T("الأرقامُ مونوسبيس بـ tabular-nums و direction:ltr كبقية شاشات المنصة",
    /font-variant-numeric:tabular-nums/.test(css) && /direction:ltr/.test(css));
  T("الحركةُ تحترم تفضيل تقليلها", /prefers-reduced-motion/.test(css));
  T("الشبكةُ تنهار لعمودٍ واحدٍ على الجوال", /@media\(max-width:760px\)/.test(css));
}

/* ═══════════════════════════════════════════════════════════════════════
   فحوصُ المتصفّح لا تحمل قنابلَ موقوتة — لا يومَ محفوراً في توقُّعٍ زمنيّ
   ═══════════════════════════════════════════════════════════════════════
   **الجذر.** حالةُ الوثيقة (سارية · توشك · منتهية) واستحقاقُ الخطة دوالُّ في «اليوم».
   ففحصٌ يحفر تاريخاً في قالبه ثم يقارنه بتوقُّعٍ محفورٍ يمرّ اليومَ ويسقط بعد أسابيع
   **لأن الزمنَ تقدّم لا لأن الكودَ ارتدّ** — وذلك أسوأُ من لا فحص: إشارةٌ حمراءُ كاذبةٌ
   تُستهلَك ثقةُ القارئ فيها، وقد تُدفَن تحتها إشارةٌ صادقة. وقعت الحالتان فعلاً:
     • `perf-contract-check`: «خطةٌ بلا استحقاقٍ سابق» توقُّعُها محفورٌ «يوم ٨» على
       مرساةِ ١ أغسطس — سقط الفحصُ من نفسه يومَ تجاوز التاريخُ الحقيقيُّ ذلك اليوم.
     • `contracts-check`: إقامةُ الطرف السادس محفورةٌ بـ٢٠٢٦-٠٨-٢٠، وفحصُ «الموشكةُ
       على الانتهاء تُنبَّه» كان يصير «منتهية» بعد ذلك اليوم (أُثبت بمحاكاته: ١٢٦/١٢٧).
   **القاعدة:** المرساةُ تُحسَب من `Date.now()` بإزاحةٍ مسمّاة، والتوقُّعُ يُحسَب بنفس
   قواعد الدالّة لا يُحفَر رقماً. وهذان الحارسان يُسقطان أيَّ ارتدادٍ إلى الحفر. */
/* ══ الورقةُ الرسمية لمطبوعات التعاقد — الهندسةُ لا تُمَسّ إلا بقياس ══
   مطبوعاتُ التعاقد الثلاث (العقدُ · مسودتُه · سندُ صرفِ أمر الدفع) تخرج على ورقة
   الشركة المعتمَدة: ترويسةٌ أعلى، وتذييلُ العناوين أسفل، وعلامةٌ مائيةٌ وسطى —
   **على كل صفحة** لا على الأولى وحدَها.

   وأرقامُ هذه الهندسة **مقيسةٌ من قالب الشركة الورقيّ** لا مقدَّرة، فتغييرُ رقمٍ
   منها بالعين يزيح المطبوعَ عن الورقة المعتمَدة بلا أن يسقط شيء. ولذلك تُحرَس هنا.

   **والحارسُ الثاني أهمّ**: لا إزاحةَ سالبةً في طبقات الورقة. قِيس في متصفّحٍ حقيقيّ
   أن `position:fixed` **يُحصر في صندوق محتوى الصفحة** وأن الإزاحةَ السالبة **تلتفّ**
   (`top:-20mm` يرتدّ إلى أسفل الصفحة لا إلى هامشها العلويّ) — فالترويسةُ المرسومةُ
   بإزاحةٍ سالبةٍ تظهر في قاع الورقة. الحلُّ القائم: هامشُ `@page` عند حافّة الصورة،
   وفراغُ النصّ محجوزٌ بصفَّي `thead`/`tfoot`. ومن أعاد الإزاحةَ السالبة أعاد العطل. */
/* ══ شبكةُ بطاقات الشراء — أصغرُ ومتجاورة ══   (طلبُ المالك)
   القائمةُ كانت بطاقةً بعرض الشاشة لكلّ طلب. صارت شبكةً تقيس **حاويَها** لا الشاشة،
   فتعطي عمودين على اللوحيّ وثلاثةً على الكمبيوتر وعموداً على الجوال بلا نقطة انكسار.

   **والحارسُ الأهمّ هنا حارسُ انضباطٍ لا شكل**: أنماطُ البطاقة السطرية (`style="…"`)
   **تتخطّى media query وورقةَ الأنماط معاً** — وهو العطلُ الذي وقع فعلاً في شبكة
   `.ast-stats` (قيد §6): عددُ أعمدةٍ ثابتٌ في نمطٍ سطريٍّ أفاض البطاقةَ ٣٨px خارج
   شاشة الجوال ولم تنفع media query المكتوبةُ له. فبنيةُ البطاقة الآن **أصنافٌ**
   (`po-row`/`po-main`/`po-badges`/`po-items`/`po-meta`/`po-actions`) وتخطيطُها كلُّه
   في ورقة الأنماط. ومن أعاد `style="display:flex…"` إلى الترميز أعاد الباب. */
function purchaseCardsGrid() {
  H("بطاقاتُ الشراء — شبكةٌ متجاورة");

  // ── الشبكةُ تقيس حاويَها: auto-fill + minmax، ولا عددَ أعمدةٍ محفور ──
  const grid = (HTML.match(/#purchases-list\{[^}]*\}/) || [""])[0];
  T("★★ القائمةُ شبكةٌ بعمودٍ يقيس الحاوي (auto-fill + minmax) لا بعددٍ محفور",
    /display:grid/.test(grid) && /repeat\(auto-fill,minmax\(/.test(grid) &&
    !/repeat\(\d+,/.test(grid), grid.slice(0, 120));
  T("★★ وحدُّ العمود لا يتجاوز عرضَ الحاوي — min(100%,…) يمنع فيضانَ الجوال",
    /minmax\(min\(100%,\s*\d+px\),1fr\)/.test(grid));
  T("★ ولا نقطةَ انكسارٍ ثانيةٌ تفرض عدداً ثابتاً على القائمة",
    !/@media[^{]*\{[^{}]*#purchases-list\{[^}]*repeat\(\d+,/.test(HTML));
  T("★ وهامشُ البطاقة السفليُّ يسقط داخل الشبكة (الفجوةُ من gap لا من margin)",
    /#purchases-list \.po-card\{margin-bottom:0\}/.test(HTML));

  // ── ما يمتدّ على الأعمدة كلّها: شريطُ الصفحات وحالتا الفراغ ──
  T("★★ شريطُ الصفحات وحالتا «لا نتائج»/«جارٍ التحميل» تمتدّ على الأعمدة كلّها",
    /\.po-span\{grid-column:1\/-1\}/.test(HTML) &&
    /<div class="po-span">\$\{pgBar\("purchases"/.test(HTML) &&
    (HTML.match(/<div class="card po-span"/g) || []).length === 2);

  // ── بنيةُ البطاقة أصنافٌ لا أنماطاً سطرية ──
  const a = HTML.indexOf('list.innerHTML = pgItems.map(p=>{');
  const card = a < 0 ? "" : HTML.slice(a, HTML.indexOf('}).join("")', a));
  T("بنيةُ بطاقة الشراء مستخرَجة", !!card && card.includes("po-card"));
  ["po-row", "po-main", "po-badges", "po-card-items", "po-meta", "po-actions"].forEach(c =>
    T(`★ الترميزُ يحمل الصنف ${c}`, new RegExp(`class="${c}"`).test(card)));
  T("★★ ولا تخطيطَ سطريّاً في هيكل البطاقة — النمطُ السطريُّ يتخطّى media query",
    !/style="[^"]*display:flex/.test(card) && !/style="[^"]*flex-direction/.test(card),
    (card.match(/style="[^"]*(display:flex|flex-direction)[^"]*"/) || [""])[0].slice(0, 90));
  T("★ وسطرُ البنود مقصورٌ على سطرين فلا يُطيل بطاقةً على حساب جاراتها",
    /\.po-card-items\{[^}]*-webkit-line-clamp:2/.test(HTML));

  /* ★★ حارسُ تصادم الأسماء — العطلُ الذي وقع فعلاً (بلاغُ المالك من آيفون):
     `po-items` اسمُ **صندوق جدول البنود** في نافذتَي التفاصيل، وسطرُ ملخّص البطاقة
     أخذ الاسمَ نفسَه ومعه `-webkit-line-clamp:2`. وهو الأدنى في الورقة فيرثه
     الصندوق: على WebKit يُقصّ إلى سطرين — شريطُ العنوان وصفُّ الترويسة، **وتختفي
     بنودُ الطلب كلُّها** — ويتجاهله Blink فيبدو الكمبيوتر سليماً.
     فالعهدُ: **لا قصَّ أسطرٍ ولا `-webkit-box` على `.po-items` أبداً**، وصندوقُ
     الجدول يبقى صندوقاً. */
  const poItemsRules = (HTML.match(/(^|\})\s*\.po-items\{[^}]*\}/gm) || []).join(" ");
  T("★★ صندوقُ جدول البنود (.po-items) بلا قصِّ أسطرٍ ولا -webkit-box — وإلا اختفت البنودُ على آيفون",
    !/-webkit-line-clamp/.test(poItemsRules) && !/display:-webkit-box/.test(poItemsRules),
    poItemsRules.slice(0, 160));
  T("★ ولا يتشارك الصندوقُ وسطرُ البطاقة صنفاً واحداً (مكوّنان لا صلةَ بينهما)",
    /class="po-card-items"/.test(HTML) &&
    (HTML.match(/class="po-items"/g) || []).length === 2 &&   // نافذةُ الطلب ونافذةُ أمر الصرف
    !/class="po-items"[^>]*>\$\{_ic\("package"/.test(HTML));
}

function contractLetterhead() {
  H("مطبوعاتُ التعاقد — الورقةُ الرسمية للشركة");
  if (!CTR_PATH) { T("contracts.js موجود", false); return; }
  const src = fs.readFileSync(CTR_PATH, "utf8");
  const dir = path.dirname(IDX);

  // ── الصورُ الثلاث موجودةٌ فعلاً (ورقةٌ بلا صورِها ورقةٌ بيضاء) ──
  const assets = ["letterhead-header.jpg", "letterhead-footer.jpg", "letterhead-watermark.png"];
  assets.forEach(f => {
    const p = path.resolve(dir, f);
    T(`ملفُّ الورقة الرسمية موجودٌ وغيرُ فارغ — ${f}`,
      fs.existsSync(p) && fs.statSync(p).size > 1024);
  });

  // ── مصدرُ عناوينها واحدٌ في index.html (المسارُ النسبيّ ميتٌ في نافذة blob على iOS) ──
  T("★ الصورُ الثلاث معرَّفةٌ مرّةً واحدةً في index.html بمعرّفاتها",
    /<img id="_lh_head_" src="letterhead-header\.jpg"/.test(HTML) &&
    /<img id="_lh_foot_" src="letterhead-footer\.jpg"/.test(HTML) &&
    /<img id="_lh_mark_" src="letterhead-watermark\.png"/.test(HTML));
  T("★★ والوحدةُ تقرأ عنوانَها المطلقَ من الصفحة لا تكتب مساراً نسبياً",
    /document\.getElementById\(id\)/.test(src) && /_lh_head_/.test(src) &&
    !/src="letterhead-/.test(src));
  T("★ وتتحقّق أنها حُمِّلت فعلاً (naturalWidth) وإلا عادت للترويسة النصّية",
    /naturalWidth\s*>\s*0/.test(src) && /function letterheadOn\(/.test(src) &&
    /function docHeadHTML\(/.test(src));

  // ── الهندسةُ المقيسة — رقمٌ رقماً ──
  const css = (src.match(/function letterheadCSS\(\)\{[\s\S]*?\n\}/) || [])[0] || "";
  T("★★ هامشُ الورقة عند حافّة الصورة: أعلى ٣مم · أسفل ١١٫٥مم · بلا هامشٍ جانبيّ",
    /@page\{size:A4;margin:3mm 0 11\.5mm\}/.test(css));
  T("★★ عرضُ الترويسة ٢٠٢٫٥مم عند −٢٫٦٥مم، والتذييلُ ١٩١٫٨مم عند ٣٫٧٢مم",
    /\.lh-h\{left:-2\.65mm;top:0;width:202\.5mm\}/.test(css) &&
    /\.lh-f\{left:3\.72mm;bottom:0;width:191\.8mm\}/.test(css));
  T("★★ والعلامةُ المائية ١٠٨٫٤مم عرضاً خلف النصّ لا فوقه",
    /\.lh-m\{left:48\.95mm;top:89\.9mm;width:108\.4mm;z-index:0;opacity:[.\d]+\}/.test(css) &&
    /\.pg>tbody>tr>td\{padding:0 20\.7mm;position:relative;z-index:1\}/.test(css));
  /* شدّتُها نصفُ الأصل: بشدّة القالب كانت تُقرأ خلف جدول البنود فتزاحم ما يُوقَّع
     عليه — والحدُّ هنا يمنع ارتدادَها إلى الشدّة الكاملة بلا قصد. */
  T("★ وشدّتُها مخفَّفةٌ لا تزاحم ما يُوقَّع عليه (≤ ٦٠٪)",
    parseFloat((css.match(/\.lh-m\{[^}]*opacity:([.\d]+)\}/) || [])[1]) <= 0.6,
    (css.match(/\.lh-m\{[^}]*opacity:([.\d]+)\}/) || [])[1]);
  T("★★ وفراغُ النصّ محجوزٌ بصفَّي thead/tfoot — ٣٥٫٦مم و٢٤٫٩مم",
    /\.sp-h\{height:35\.6mm\}\.sp-f\{height:24\.9mm\}/.test(css) &&
    /<thead><tr><td><div class="sp-h">/.test(src) &&
    /<tfoot><tr><td><div class="sp-f">/.test(src));
  T("★★ ولا إزاحةَ سالبةً رأسيةً في طبقات الورقة — المتصفّحُ يلويها إلى الصفحة المجاورة",
    !/\.lh-[hfm]\{[^}]*(top|bottom):-/.test(css));
  T("★ والتكرارُ على كل صفحةٍ بـfixed في وسط الطباعة وحدَه",
    /@media print\{\.lh\{position:fixed\}\}/.test(css));

  // ── المطبوعاتُ الثلاث كلُّها تمرّ بالإطار الواحد ──
  const wraps = (src.match(/letterheadWrap\(/g) || []).length;
  T("★★ المطبوعتان (ورقةُ العقد ومسودتُها · سندُ الصرف) تلفّان بالإطار نفسِه لا بنسختين",
    wraps === 3 && /function letterheadWrap\(/.test(src),
    `letterheadWrap ×${wraps}`);
  T("★ ولا ترويسةَ شركةٍ مكرّرةً فوق ترويسة الورقة",
    (src.match(/<div class="company">شركة المباني السريعة للمقاولات<\/div>/g) || []).length === 1);
}

function browserCheckTimeBombs() {
  H("فحوصُ المتصفّح: بلا تاريخٍ محفورٍ في توقُّعٍ زمنيّ");

  const fsB = require("fs"), pB = require("path");
  // نسختان: بلا `g` للاختبار وبها للجمع — فـ`test` على تعبيرٍ عامٍّ يحرّك `lastIndex`
  // فيصير الفحصُ الثاني رهنَ موضعِ الأوّل (مرورٌ كاذبٌ يتناوب مع سقوطٍ كاذب).
  const DATE_LIT = /['"]20\d\d-[01]\d-[0-3]\d/;     // تاريخٌ محفورٌ بصيغة ISO
  const DATE_ALL = /['"]20\d\d-[01]\d-[0-3]\d/g;

  // ── (١) جدولةُ الوقائي: المرساةُ محسوبةٌ والتوقُّعُ محسوب ──
  const PC = pB.resolve(pB.dirname(IDX), "perf-contract-check.mjs");
  T("★ tb: perf-contract-check.mjs موجود", fsB.existsSync(PC));
  if (fsB.existsSync(PC)) {
    const pc = fsB.readFileSync(PC, "utf8");
    /* الكتلةُ المقصودةُ هي الخطةُ الطازجةُ وحدَها — تنتهي عند `const today`. ومرساةُ
       P1/P2 المحفورةُ في الماضي **ليست قنبلة**: حلقةُ اللحاق تُقدّمها إلى ما بعد اليوم
       أبداً، فالتوقُّعُ (مضاعفُ التكرار · مستقبليّ) لا يتغيّر بتقدّم الزمن. */
    const a = pc.indexOf("خطةٌ بلا استحقاقٍ سابق");
    const block = a >= 0 ? pc.slice(a, pc.indexOf("const today =", a)) : "";
    T("tb: كتلةُ «خطةٌ بلا استحقاقٍ سابق» مستخرَجة", !!block);
    T("★★ tb: مرساةُ الخطة الطازجة محسوبةٌ من الآن لا محفورةً بيوم",
      /Date\.now\(\)\s*\+/.test(block) && !DATE_LIT.test(block),
      (block.match(DATE_ALL) || []).join(" "));
    T("★ tb: والتوقُّعُ يُحسَب بنفس قاعدة الدالّة (لا رقمَ يومٍ محفور)",
      /freshWant/.test(block) && /getDate\(\)\s*\+\s*7/.test(block) && !/freshDay\s*===\s*\d/.test(pc));
  }

  // ── (٢) وثائقُ الأطراف: كلُّ تاريخِ انتهاءٍ إزاحةٌ عن اليوم ──
  const CC = pB.resolve(pB.dirname(IDX), "contracts-check.mjs");
  T("★ tb: contracts-check.mjs موجود", fsB.existsSync(CC));
  if (fsB.existsSync(CC)) {
    const cc = fsB.readFileSync(CC, "utf8");
    T("★★ tb: بلا تاريخٍ محفورٍ في قالب الأطراف — الانتهاءُ إزاحةٌ عن اليوم",
      /_dayOff\s*=\s*n\s*=>/.test(cc) && (cc.match(DATE_ALL) || []).length === 0,
      (cc.match(DATE_ALL) || []).join(" "));
    // والإقامةُ الموشكةُ يجب أن تبقى **داخل** نافذة DOC_SOON_DAYS، وإلّا صار الفحصُ
    // يقيس «منتهية» باسم «توشك» — وهو مرورٌ كاذبٌ لا ارتدادٌ ظاهر.
    const ctrSrc = CTR_PATH ? fsB.readFileSync(CTR_PATH, "utf8") : "";
    const soonDays = Number((ctrSrc.match(/DOC_SOON_DAYS\s*=\s*(\d+)/) || [])[1]);
    const offs = (cc.match(/_dayOff\(\s*(-?\d+)\s*\)/g) || [])
      .map(s => Number((s.match(/-?\d+/) || [0])[0]));
    T("★ tb: إزاحةُ «الموشكة» داخل نافذة DOC_SOON_DAYS فعلاً",
      soonDays > 0 && offs.some(o => o > 0 && o <= soonDays), "DOC_SOON_DAYS=" + soonDays + " · إزاحات: " + offs.join(","));
    T("★ tb: وثيقةٌ منتهيةٌ حاضرةٌ في القالب (إزاحةٌ سالبة)", offs.some(o => o < 0));
  }
}

/* ══ التشغيل ══ */
(async () => {
  await step4;
  guards();
  cleaningOpsTests();
  predelivery();
  kpi();
  substituteBudget();
  financeAuditTests();
  hrPaymentsTests();
  numParsing();
  hailNotify();
  writeRaceRoot();
  stocktakeTests();
  vendorSummary();
  vendorNameUnify();
  actualCostFromItems();
  financialInvariants();
  manualProjectCosts();
  listenerChurn();
  invoiceFileSource();
  closedOrdersCard();
  extrasCardGating();
  adminEditKeepsStatus();
  auditRowAlignment();
  waExtrasPreserveQty();
  procToFinance();
  poCEOStampBound();
  mergeManualProject();
  issueOrderWarehouseCol();
  issueOrderManualProject();
  kpiSpendClosedOnly();
  auditRound2();
  dateBucketing();
  auditRound2Medium();
  fuzz();
  rollupMonthIsolation();
  comprehensiveReviewV18_9vl();
  deepReviewV18_9vu();
  ticketWhoLabels();
  partialReceiptBackToProc();
  poNotesVisible();
  deepReviewV18_9ac();
  deepReviewV18_9ad();
  perfContractPhase1();
  perfContractPhase2();
  tvWallGuards();
  aiErrorMessagesGuards();
  photoQueueGuards();
  versionStampGuards();
  contractsPhase1();
  contractLetterhead();
  purchaseCardsGrid();
  browserCheckTimeBombs();
  // الفحوصُ المؤجَّلة (async) — تُنتظر كلُّها قبل الحصيلة.
  await Promise.all(_deferred);
  console.log("\n" + "═".repeat(64));
  if (FAIL === 0) console.log(`✅ ${PASS}/${PASS} — كل الفحوص نجحت  (${VER})`);
  else { console.log(`❌ ${FAIL} فشلت من ${PASS + FAIL}  (${VER})\n`); FAILURES.forEach(f => console.log("   • " + f)); }
  console.log("═".repeat(64) + "\n");
  process.exit(FAIL ? 1 : 0);
})();
