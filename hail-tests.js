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
const KPI_PATH = [path.resolve(path.dirname(IDX), "purchase-kpi.js")].find(p => fs.existsSync(p));
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
    ["كاتب واحد لـ receivedQty (مجموع السندات)", 'receivedQty    = _waSumGrn(pCurrent, "totalRcv")', true],
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
  if (!KPI_PATH) { console.log("  ⏭  purchase-kpi.js غير موجود — تُخطّى"); return; }
  T("الوسم موجود في index.html", /<script src="purchase-kpi\.js\?v=/.test(HTML));
  const src = fs.readFileSync(KPI_PATH, "utf8");
  const vm = require("vm");
  try { new vm.Script(src); T("صياغة purchase-kpi.js سليمة", true); }
  catch (e) { T("صياغة purchase-kpi.js سليمة", false, String(e.message).slice(0, 120)); }
  T("يركّب صفحته ذاتياً", src.includes("function ensurePage()") && src.includes('div.className="page"'));
  T("يحقن زر القائمة الجانبية", src.includes("function injectSidebarButton()") && src.includes('getElementById("grp-po")'));
  T("يلفّ showPage", src.includes("function hookShowPage()") && src.includes("window.showPage = function(id)"));
  T("نقاط ارتساؤه موجودة في index.html",
    HTML.includes('id="grp-po"') && HTML.includes('data-page="purchase-reports"') && HTML.includes("function showPage(id){"));
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

/* ══ التشغيل ══ */
(async () => {
  await step4;
  guards();
  predelivery();
  kpi();
  substituteBudget();
  numParsing();
  hailNotify();
  writeRaceRoot();
  stocktakeTests();
  fuzz();
  console.log("\n" + "═".repeat(64));
  if (FAIL === 0) console.log(`✅ ${PASS}/${PASS} — كل الفحوص نجحت  (${VER})`);
  else { console.log(`❌ ${FAIL} فشلت من ${PASS + FAIL}  (${VER})\n`); FAILURES.forEach(f => console.log("   • " + f)); }
  console.log("═".repeat(64) + "\n");
  process.exit(FAIL ? 1 : 0);
})();
