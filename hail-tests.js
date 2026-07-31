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

const VER = (HTML.match(/const APP_VERSION = "(v[\d.a-z]+)"/) || [])[1] || "?";

// ══ أدوات ══
let PASS = 0, FAIL = 0;
const FAILURES = [];
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
  T("L9: _waPrevRcv يطابق بالكود قبل الاسم للبند الحرّ",
    HTML.includes("else if(gi.itemCode && it && it.itemCode) _idOk = (String(gi.itemCode).trim() === String(it.itemCode).trim())"));
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
      /nextDueDate: _nextWorkingDay\(_today\(\)\)/.test(src) &&
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
  T("★ عرضُ «جولات الجودة» موصولٌ بتوجيه العرض وزرِّ القسم (للأدمن)",
    /_view==="quality" \? qualityHTML\(\)/.test(src) &&
    /setView\('quality'\)/.test(src) && /function qualityHTML\(\)\{/.test(src) &&
    /if\(!canEdit\(\)\)\{/.test((src.match(/function qualityHTML\(\)\{[\s\S]*?\n\}/)||[""])[0]));
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
    /\.co-groups\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(360px,1fr\)\)/.test(src) &&
    !/\.co-groups\{[^}]*auto-fill/.test(src));
  T("★ شبكةٌ داخليةٌ للمهامّ داخل بطاقة المبنى (تكيُّفٌ مع عرضها)",
    /\.co-tasklist\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(280px,1fr\)\)/.test(src) &&
    /<div class="co-tasklist">\$\{list\.map\(taskCardHTML\)/.test(src));
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

/* ══ التشغيل ══ */
(async () => {
  await step4;
  guards();
  cleaningOpsTests();
  predelivery();
  kpi();
  substituteBudget();
  numParsing();
  hailNotify();
  writeRaceRoot();
  stocktakeTests();
  vendorSummary();
  actualCostFromItems();
  financialInvariants();
  manualProjectCosts();
  listenerChurn();
  invoiceFileSource();
  closedOrdersCard();
  extrasCardGating();
  adminEditKeepsStatus();
  waExtrasPreserveQty();
  procToFinance();
  issueOrderWarehouseCol();
  issueOrderManualProject();
  kpiSpendClosedOnly();
  auditRound2();
  dateBucketing();
  auditRound2Medium();
  fuzz();
  rollupMonthIsolation();
  console.log("\n" + "═".repeat(64));
  if (FAIL === 0) console.log(`✅ ${PASS}/${PASS} — كل الفحوص نجحت  (${VER})`);
  else { console.log(`❌ ${FAIL} فشلت من ${PASS + FAIL}  (${VER})\n`); FAILURES.forEach(f => console.log("   • " + f)); }
  console.log("═".repeat(64) + "\n");
  process.exit(FAIL ? 1 : 0);
})();
