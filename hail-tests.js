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

  // cache-busters
  const cb = [...HTML.matchAll(/<script src="([^"]+\.js)\?v=([^"]+)"><\/script>/g)].map(m => [m[1], m[2]]);
  const want = VER.replace(/^v/, "");
  T("cache-busters تطابق الإصدار", cb.length === 3 && cb.every(([, v]) => v === want),
    cb.map(([f2, v]) => `${f2}?v=${v}`).join("، ") || "لا وسوم خارجية");

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

/* ══ التشغيل ══ */
(async () => {
  await step4;
  guards();
  predelivery();
  kpi();
  console.log("\n" + "═".repeat(64));
  if (FAIL === 0) console.log(`✅ ${PASS}/${PASS} — كل الفحوص نجحت  (${VER})`);
  else { console.log(`❌ ${FAIL} فشلت من ${PASS + FAIL}  (${VER})\n`); FAILURES.forEach(f => console.log("   • " + f)); }
  console.log("═".repeat(64) + "\n");
  process.exit(FAIL ? 1 : 0);
})();
