/* يستخرج waUpdateRow الحقيقية من الملف بلا تعديل حرف، ويُشغّلها على صفّ حقيقي */
const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("../index.html", "utf8");

// استخراج نص الدالة كما هو من الملف
const start = html.indexOf("function waUpdateRow(i, src){");
const end   = html.indexOf("\nfunction ", start + 10);
const fnSrc = html.slice(start, end);
if (start < 0) { console.log("❌ لم تُعثر waUpdateRow"); process.exit(1); }

const dom = new JSDOM(`<!DOCTYPE html><body>
  <div id="wa-shortage-warn" style="display:none"></div>
  <div id="wa-direct-use-info" style="display:none"></div>
  <div id="wa-gap-warn" style="display:none">⚠ <span data-gap-msg></span></div>
  <input class="wa-rcv-qty"    data-idx="0" data-req="5" value="5">
  <input class="wa-stock-qty"  data-idx="0" value="5">
  <input class="wa-direct-qty" data-idx="0" value="0">
  <input class="wa-unit-price" data-idx="0" value="210">
  <span id="wa-row-total-0"></span>
  <span id="wa-total-qty"></span><span id="wa-total-stock"></span>
  <span id="wa-total-direct"></span><span id="wa-total-cost"></span>
</body>`, { runScripts: "dangerously" });

dom.window.eval(fnSrc);
const { window } = dom, doc = window.document;
const $ = s => doc.querySelector(s);
const RCV = '.wa-rcv-qty[data-idx="0"]', STK = '.wa-stock-qty[data-idx="0"]', DIR = '.wa-direct-qty[data-idx="0"]';

const set = (sel, v) => { $(sel).value = String(v); };
const read = () => ({
  rcv: $(RCV).value, stock: $(STK).value, direct: $(DIR).value,
  gap: $("#wa-gap-warn").style.display !== "none"
      ? $("#wa-gap-warn").querySelector("[data-gap-msg]").textContent.slice(0, 55) : null
});

const R = [];
function T(name, act, expect) {
  act();
  const g = read();
  const ok = g.stock === String(expect.stock) && g.direct === String(expect.direct)
          && (!!g.gap) === (!!expect.gap);
  R.push([ok, name, `المستلم=${g.rcv} المستودع=${g.stock} المباشر=${g.direct}` +
    (g.gap ? `\n         └─ ⚠ ${g.gap}…` : "")]);
}

// ── السيناريو 1: أدخل المستلم يدوياً → المستودع يساويه تلقائياً ──
T("أدخل المستلم = 5 → المستودع يصير 5 تلقائياً",
  () => { set(RCV, 5); set(STK, 999); window.waUpdateRow(0, "rcv"); },
  { stock: 5, direct: 0, gap: false });

T("غيّر المستلم إلى 12 → المستودع يتبعه إلى 12",
  () => { set(RCV, 12); window.waUpdateRow(0, "rcv"); },
  { stock: 12, direct: 0, gap: false });

// ── السيناريو 2: أدخل استخدام مباشر → المستودع = المستلم − المباشر ──
T("مستلم 12، مباشر 4 → المستودع = 8",
  () => { set(DIR, 4); window.waUpdateRow(0, "direct"); },
  { stock: 8, direct: 4, gap: false });

T("مباشر 4 ثم المستلم يصير 10 → المستودع = 6",
  () => { set(RCV, 10); window.waUpdateRow(0, "rcv"); },
  { stock: 6, direct: 4, gap: false });

T("المباشر = كل المستلم (10) → المستودع = 0",
  () => { set(DIR, 10); window.waUpdateRow(0, "direct"); },
  { stock: 0, direct: 10, gap: false });

// ── قصر المباشر على المستلم ──
T("مباشر 30 من مستلم 10 → يُقصر إلى 10، المستودع 0 (لا سالب)",
  () => { set(DIR, 30); window.waUpdateRow(0, "direct"); },
  { stock: 0, direct: 10, gap: false });

T("مستلم 10 مباشر 10، ثم المستلم يُنقص إلى 3 → المباشر يُقصر إلى 3",
  () => { set(RCV, 3); window.waUpdateRow(0, "rcv"); },
  { stock: 0, direct: 3, gap: false });

// ── التعديل اليدوي على المستودع يُحترم ──
T("تعديل المستودع يدوياً لا يُدهس (مستلم 10، مباشر 0، مستودع→10)",
  () => { set(RCV, 10); set(DIR, 0); window.waUpdateRow(0, "rcv");
          set(STK, 10); window.waUpdateRow(0, "stock"); },
  { stock: 10, direct: 0, gap: false });

// ── الفجوة: العيب الذي كان صامتاً ──
T("★ الفجوة: مستلم 10، مباشر 3، ثم المستودع يدوياً 5 → تُعلَن",
  () => { set(RCV, 10); set(DIR, 3); window.waUpdateRow(0, "direct");
          set(STK, 5); window.waUpdateRow(0, "stock"); },
  { stock: 5, direct: 3, gap: true });

T("سدّ الفجوة يدوياً (المستودع → 7) → التحذير يختفي",
  () => { set(STK, 7); window.waUpdateRow(0, "stock"); },
  { stock: 7, direct: 3, gap: false });

// ── مسح خانة المستلم لا يمحو المباشر ──
T("مسح المستلم للكتابة من جديد → المباشر يبقى 3 سليماً",
  () => { set(RCV, ""); window.waUpdateRow(0, "rcv"); },
  { stock: 7, direct: 3, gap: false });

// ── كسور ──
T("كسور: مستلم 7.5، مباشر 2.25 → المستودع = 5.25",
  () => { set(RCV, 7.5); set(DIR, 2.25); window.waUpdateRow(0, "direct"); },
  { stock: 5.25, direct: 2.25, gap: false });

console.log("\n═══ تشغيل waUpdateRow الحقيقية على سيناريوهاتك ═══\n");
let bad = 0;
R.forEach(([ok, n, d]) => { if (!ok) bad++; console.log(`  ${ok ? "✅" : "❌"}  ${n}\n         └─ ${d}`); });
console.log("\n" + "═".repeat(52));
console.log(bad === 0 ? `✅ ${R.length}/${R.length} — المنطق يعمل كما طلبت` : `❌ ${bad} من ${R.length} فشلت`);
process.exit(bad ? 1 : 0);
