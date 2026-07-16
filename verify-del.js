/* يستخرج منطق تجميع العكس الحقيقي من الملف ويُشغّله على أشكال طلبات حقيقية */
const fs = require("fs");
const html = fs.readFileSync("../index.html", "utf8");

// اقتطع منطق التجميع كما هو من الملف — من إنشاء _rev حتى _entries
const a = html.indexOf('        const _rev = new Map();');
const b = html.indexOf('        const _entries = [..._rev.entries()]');
const c = html.indexOf('\n', b);
if (a < 0 || b < 0) { console.log("❌ لم يُعثر على منطق التجميع"); process.exit(1); }
const core = html.slice(a, c);

function reverseOf(po) {
  const _r3 = n => Math.round(n * 1000) / 1000;
  return new Function("po", "_r3", core + "\n return _entries;")(po, _r3);
}

const R = [];
function T(name, po, expect) {
  let got;
  try { got = reverseOf(po).map(([id, e]) => [id, e.delta]); }
  catch (e) { R.push([false, name, "خطأ: " + e.message]); return; }
  const norm = o => JSON.stringify(o.slice().sort());
  const ok = norm(got) === norm(expect);
  R.push([ok, name, "الصافي: " + JSON.stringify(got) + (ok ? "" : "  ← المتوقع " + JSON.stringify(expect))]);
}

// ── سيناريو صورتك: PO-0073 — استُلم 10، دخل المستودع 8، مباشر 2 ──
T("★ استلام 8 للمستودع → الحذف يسحب −8 (كان يضيف +8)",
  { auditItems: [{ itemId: "sakhan", itemName: "سخان 30 لتر سعودي", unit: "قطعة", stockQty: 8, directQty: 2 }],
    items: [{ itemId: "sakhan", qty: 10 }] },
  [["sakhan", -8]]);

// ── الاستخدام المباشر لا يُعكَس: لم يمسّ الرصيد أصلاً ──
T("استخدام مباشر بحت (لا مستودع) → لا عكس إطلاقاً",
  { auditItems: [{ itemId: "kabl", stockQty: 0, directQty: 7 }], items: [{ itemId: "kabl", qty: 7 }] },
  []);

// ── سحب مراجعة المخزون يُعاد (موجب) — كان صحيحاً ويبقى ──
T("سحب 3 بمراجعة المخزون → الحذف يُعيد +3",
  { auditItems: [], items: [{ itemId: "dihan", itemName: "دهان", _fromStock: 3, qty: 3 }] },
  [["dihan", 3]]);

// ── الحالة الخبيثة: الصنف في المسارين معاً ──
T("★ صنف سُحب 3 من المخزون واستُلم 5 → الصافي −2 (كتابة واحدة لا اثنتان)",
  { auditItems: [{ itemId: "x", stockQty: 5 }], items: [{ itemId: "x", _fromStock: 3, qty: 8 }] },
  [["x", -2]]);

T("صنف سُحب 5 واستُلم 5 → الصافي صفر → لا كتابة ولا حركة",
  { auditItems: [{ itemId: "y", stockQty: 5 }], items: [{ itemId: "y", _fromStock: 5, qty: 5 }] },
  []);

// ── استلامات جزئية متعددة لنفس الصنف ──
T("نفس الصنف في سطرين استلام (4 + 6) → يُجمَّع إلى −10",
  { auditItems: [{ itemId: "z", stockQty: 4 }, { itemId: "z", stockQty: 6 }], items: [{ itemId: "z", qty: 10 }] },
  [["z", -10]]);

// ── أصناف متعددة ──
T("طلب بثلاثة أصناف مختلطة",
  { auditItems: [{ itemId: "a", stockQty: 2 }, { itemId: "b", stockQty: 9 }],
    items: [{ itemId: "a", _fromStock: 1 }, { itemId: "c", _fromStock: 4 }] },
  [["a", -1], ["b", -9], ["c", 4]]);

// ── حالات حدّية ──
T("طلب بلا تدقيق ولا سحب → لا عكس", { auditItems: [], items: [{ itemId: "q", qty: 3 }] }, []);
T("بند بلا itemId يُتجاهل (لا كتابة على وثيقة مجهولة)",
  { auditItems: [{ itemId: "", stockQty: 5 }], items: [] }, []);
T("طلب قديم بلا auditItems ولا items → لا انهيار", {}, []);
T("كسور: استُلم 2.5 وسُحب 0.25 → −2.25",
  { auditItems: [{ itemId: "f", stockQty: 2.5 }], items: [{ itemId: "f", _fromStock: 0.25 }] },
  [["f", -2.25]]);

console.log("\n═══ تشغيل منطق عكس المخزون الحقيقي ═══\n");
let bad = 0;
R.forEach(([ok, n, d]) => { if (!ok) bad++; console.log(`  ${ok ? "✅" : "❌"}  ${n}\n         └─ ${d}`); });
console.log("\n" + "═".repeat(52));
console.log(bad === 0 ? `✅ ${R.length}/${R.length} — العكس صحيح الإشارة والتجميع`
                      : `❌ ${bad} من ${R.length} فشلت`);
process.exit(bad ? 1 : 0);
