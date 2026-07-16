const { JSDOM } = require("jsdom");
const fs = require("fs");
const html = fs.readFileSync("../index.html", "utf8");

// ── اقتطع showCustomModal الحقيقية ──
const a = html.indexOf("function showCustomModal({title,body,okText,onOk}){");
const b = html.indexOf("\nfunction ", a + 10);
const showCustomModalSrc = html.slice(a, b);

const dom = new JSDOM(`<!DOCTYPE html><body></body>`, { runScripts: "dangerously" });
const { window } = dom;
window.eval("function toast(){}");
window.eval(showCustomModalSrc);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = [];
const T = (ok, name, d) => R.push([ok, name, d]);

(async () => {
  // ══ 1) النقر المزدوج على زر الحفظ ══
  let runs = 0;
  window.showCustomModal({
    title: "اختبار", body: "<div></div>", okText: "💾 حفظ التعديل",
    onOk: async () => { runs++; await sleep(120); return true; }   // شبكة بطيئة
  });
  const btn = window.document.getElementById("_dyn-inv-ok");

  btn.onclick();                       // النقرة الأولى
  const labelDuring = btn.textContent;
  const disabledDuring = btn.disabled;
  btn.onclick(); btn.onclick(); btn.onclick();   // مستخدم مستعجل ينقر 3 مرات
  await sleep(300);

  T(runs === 1, "★ أربع نقرات متتالية → onOk تعمل مرة واحدة", "عدد التنفيذات: " + runs + " (قبل الإصلاح: 4)");
  T(disabledDuring === true, "الزر يُعطَّل أثناء الانتظار", "disabled=" + disabledDuring);
  T(labelDuring.includes("جارٍ"), "الزر يُظهر أنه يعمل", '"' + labelDuring + '"');

  // ══ 2) الزر يعود لحالته بعد الفشل ══
  let n2 = 0;
  window.showCustomModal({
    title: "ب", body: "<div></div>", okText: "💾 حفظ",
    onOk: async () => { n2++; await sleep(50); return false; }   // فشل تحقق
  });
  const b2 = window.document.getElementById("_dyn-inv-ok");
  b2.onclick(); await sleep(150);
  T(b2.disabled === false && b2.textContent === "💾 حفظ", "بعد فشل التحقق: الزر يعود قابلاً للنقر", 'نصه: "' + b2.textContent + '"، معطّل: ' + b2.disabled);
  b2.onclick(); await sleep(150);
  T(n2 === 2, "ويمكن إعادة المحاولة فعلاً", "التنفيذات: " + n2);

  // ══ 3) رمية داخل onOk لا تُجمّد الزر ══
  window.showCustomModal({
    title: "ج", body: "<div></div>", okText: "💾 حفظ",
    onOk: async () => { throw new Error("انقطع الاتصال"); }
  });
  const b3 = window.document.getElementById("_dyn-inv-ok");
  b3.onclick(); await sleep(80);
  T(b3.disabled === false, "خطأ داخل onOk → الزر لا يبقى مجمّداً", "معطّل: " + b3.disabled);

  // ══ 4) منطق حساب الرصيد — طازج لا مجمّد ══
  const c = html.indexOf("        const _res = await db.runTransaction(async tx=>{");
  const d = html.indexOf("          return { newQty:nq, delta:dl, liveQty };", c);
  const txBody = html.slice(html.indexOf("const snap = await tx.get(invRef);", c), d);

  const calc = (type, qty, liveQty) => {
    const _r3 = n => Math.round(n * 1000) / 1000;
    const src = txBody
      .replace("const snap = await tx.get(invRef);", "")
      .replace("const liveQty = snap.exists ? (parseFloat(snap.data().currentQty)||0) : 0;", "")
      .replace(/tx\.set\([\s\S]*?\}\);/g, "");
    return new Function("type", "qty", "liveQty", "_r3", src + "\n return {nq, dl};")(type, qty, liveQty, _r3);
  };

  // السيناريو: الشاشة تعرض 100، لكن Firestore صار 150 باستلام
  let r = calc("add", 10, 150);
  T(r.nq === 160 && r.dl === 10, "★ إضافة 10 والشاشة تعرض 100 بينما الحقيقة 150 → 160 لا 110",
    "الرصيد الجديد: " + r.nq + "، المسجَّل: " + r.dl + "  (قبل الإصلاح: 110 — تتبخّر 40)");

  r = calc("set", 200, 150);
  T(r.nq === 200 && r.dl === 50, "★ تحديد 200 والحقيقة 150 → السجل يقول +50 لا +100",
    "الرصيد: " + r.nq + "، المسجَّل: " + r.dl);

  r = calc("subtract", 30, 150);
  T(r.nq === 120 && r.dl === -30, "سحب 30 من 150 → 120 والسجل −30", "الرصيد: " + r.nq + "، المسجَّل: " + r.dl);

  r = calc("subtract", 999, 150);
  T(r.nq === 0 && r.dl === -150, "سحب أكثر من الرصيد → يُقصر على صفر والسجل −150 (الحقيقي)",
    "الرصيد: " + r.nq + "، المسجَّل: " + r.dl);

  r = calc("add", 2.25, 7.5);
  T(r.nq === 9.75 && r.dl === 2.25, "كسور: 7.5 + 2.25 = 9.75", "الرصيد: " + r.nq);

  // ثابت: الرصيد الجديد − الرصيد الحي = adjustDelta دائماً
  let inv = true, bad = null;
  for (const t of ["set", "add", "subtract"])
    for (let live = 0; live <= 40; live += 7)
      for (let q = 0; q <= 40; q += 3) {
        const x = calc(t, q, live);
        if (Math.abs((x.nq - live) - x.dl) > 0.0001) { inv = false; bad = [t, q, live, x]; }
      }
  T(inv, "★ ثابت: (الرصيد الجديد − الحي) = adjustDelta في كل حالة",
    inv ? "63 حالة × 3 أنواع = 189 تركيبة — كلها متسقة" : "انكسر عند " + JSON.stringify(bad));

  console.log("\n═══ تشغيل حارس النقر المزدوج ومنطق تعديل الرصيد ═══\n");
  let f = 0;
  R.forEach(([ok, n, dd]) => { if (!ok) f++; console.log(`  ${ok ? "✅" : "❌"}  ${n}\n         └─ ${dd}`); });
  console.log("\n" + "═".repeat(58));
  console.log(f === 0 ? `✅ ${R.length}/${R.length} — الحارس والحساب سليمان` : `❌ ${f} من ${R.length} فشلت`);
  process.exit(f ? 1 : 0);
})();
