/* يقتطع منطق الإشارة الحقيقي من الملف ويُشغّله على كل أنواع حركاتك */
const fs = require("fs");
const html = fs.readFileSync("../index.html", "utf8");

const a = html.indexOf('    const isOut = (l.type==="out"||l.type==="direct_use");');
const b = html.indexOf('const color = isTransfer ? "color:#6d28d9" : (_isNeg ? "color:#b91c1c" : "color:#166534");');
if (a < 0 || b < 0) { console.log("❌ لم يُعثر على منطق الإشارة"); process.exit(1); }
const core = html.slice(a, html.indexOf("\n", b));

const render = new Function("l", core + '\n return sign + _qtyShown.toLocaleString("en-US",{maximumFractionDigits:3});');

const R = [];
const T = (name, l, expect) => {
  let got; try { got = render(l); } catch (e) { got = "خطأ: " + e.message; }
  R.push([got === expect, name, got + (got === expect ? "" : "  ← المتوقع " + expect)]);
};

// ── حركات عادية: لم تتغيّر ──
T("وارد (شراء) 8",              { type: "in", qty: 8 },                       "+8");
T("إدخال يدوي 4",               { type: "manual_in", qty: 4 },                "+4");
T("صرف 3",                      { type: "out", qty: 3 },                      "−3");
T("استخدام مباشر 2",            { type: "direct_use", qty: 2 },               "−2");
T("مناقلة 6",                   { type: "transfer", qty: 6 },                 "⇄ 6");

// ── التسويات: هنا كان الكذب ──
T("★ عكس حذف طلب: adjustDelta = −5", { type: "adjust", qty: 5, adjustDelta: -5 },  "−5");
T("★ تسوية يدوية بالسحب: −7",        { type: "adjust", qty: 7, adjustDelta: -7 },  "−7");
T("★ تصفير يدوي: qty:0، delta:−12",  { type: "adjust", qty: 0, adjustDelta: -12 }, "−12");
T("تسوية موجبة: +3",                 { type: "adjust", qty: 3, adjustDelta: 3 },   "+3");
T("عكس سحب المراجعة: +4",            { type: "adjust", qty: 4, adjustDelta: 4 },   "+4");

// ── توافق الماضي: سجلات قديمة بلا adjustDelta ──
T("سجل قديم بلا adjustDelta → موجب كما كان", { type: "adjust", qty: 9 },              "+9");
T("adjustDelta فاسد (نص) → يرجع لـ qty",     { type: "adjust", qty: 9, adjustDelta: "س" }, "+9");
T("adjustDelta صفر → موجب",                   { type: "adjust", qty: 0, adjustDelta: 0 },   "+0");

// ── كسور ──
T("تسوية كسرية −2.25", { type: "adjust", qty: 2.25, adjustDelta: -2.25 }, "−2.25");

console.log("\n═══ تشغيل منطق عرض سجل الحركات ═══\n");
let bad = 0;
R.forEach(([ok, n, d]) => { if (!ok) bad++; console.log(`  ${ok ? "✅" : "❌"}  ${n.padEnd(38)} → ${d}`); });
console.log("\n" + "═".repeat(58));
console.log(bad === 0 ? `✅ ${R.length}/${R.length} — السجل صار يقول الحقيقة` : `❌ ${bad} من ${R.length} فشلت`);
process.exit(bad ? 1 : 0);
