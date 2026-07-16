/* هيكل اختبار: يُحاكي نقاط الارتساء الحقيقية من index.html حرفياً،
   ثم يُحمّل purchase-kpi.js الحقيقي بلا أي تعديل، ويفحص ماذا فعل فعلاً. */
const { JSDOM } = require("jsdom");
const fs = require("fs");



const html = `<!DOCTYPE html><html><head></head><body>

<!-- القائمة الجانبية — منسوخة حرفياً من index.html @ 2161-2170 -->
<div class="sidebar-group-header collapsed" onclick="toggleSidebarGroup('grp-po')" id="hdr-grp-po">
  <span class="s-icon">🛒</span> طلبات الشراء
  <span class="grp-arrow" id="arrow-grp-po">▾</span>
</div>
<div class="sidebar-group collapsed" id="grp-po" style="max-height:0">
  <button class="sidebar-nav-btn sidebar-child" data-page="purchases" onclick="showPage('purchases')">طلبات الشراء</button>
  <button class="sidebar-nav-btn sidebar-child" data-page="new-purchase" onclick="showPage('new-purchase')">طلب شراء جديد</button>
  <button class="sidebar-nav-btn sidebar-child" data-page="purchase-reports" onclick="showPage('purchase-reports')">تقارير المشتريات</button>
  <button class="sidebar-nav-btn sidebar-child" data-page="po-audit" onclick="showPage('po-audit')">سجل التدقيق</button>
</div>

<!-- حاوية الصفحات -->
<div id="main">
  <div class="page" id="page-dashboard">لوحة</div>
  <div class="page" id="page-purchases">مشتريات</div>
</div>

<script>
// ── نفس أشكال التصريح الموجودة في index.html بالضبط ──
let purchases = [];                                  // index.html @ 13783: let (لا خاصية على window)
const PO_STATUS = { pending_pm:"بانتظار مدير المشاريع", closed:"مغلق", pm_approved:"اعتمده مدير المشاريع" };
function normalizePOStatus(s){ return s; }           // @ 15558
function poStatusLabel(s){ return PO_STATUS[s] || s; } // @ 15568
function esc(s){ return String(s==null?"":s); }
function toast(m,t){ }
window.__showPageCalls = [];
function showPage(id){                                // @ 6965: تصريح دالة على المستوى الأعلى
  window.__showPageCalls.push(id);
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  const pg = document.getElementById("page-"+id);
  if(!pg) return;                                     // الحارس الحقيقي: الصفحة يجب أن تكون موجودة
  pg.classList.add("active");
}
function toggleSidebarGroup(id){                      // @ 7224
  const g=document.getElementById(id); if(!g) return;
  g.classList.toggle("collapsed");
}
window.__origShowPage = showPage;                     // لقطة قبل تحميل الملف الخارجي
</script>

<script src="../purchase-kpi.js"></script>
</body></html>`;

const _hp = require("path").resolve(__dirname, "_harness.html");
fs.writeFileSync(_hp, html);
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  resources: "usable",
  url: "file://" + _hp
});
dom.window.addEventListener("error", e => console.log("PAGE ERROR:", e.message));

setTimeout(() => {
  const { window } = dom;
  const doc = window.document;
  const R = [];
  const chk = (name, cond, detail) => { R.push([cond, name, detail || ""]); };

  // ── 1) هل أنشأ الملف صفحته في الـ DOM؟ ──
  const page = doc.getElementById("page-purchase-kpi");
  chk("ensurePage() أنشأ div#page-purchase-kpi", !!page,
      page ? "class=\"" + page.className + "\" داخل #" + page.parentElement.id : "غير موجودة");

  // ── 2) هل حقن زر القائمة الجانبية في المكان الصحيح؟ ──
  const btn = doc.getElementById("nav-purchase-kpi-btn");
  chk("injectSidebarButton() حقن الزر", !!btn, btn ? "نصه: " + btn.textContent.trim() : "غير موجود");
  chk("الزر داخل مجموعة #grp-po", !!btn && btn.parentElement.id === "grp-po",
      btn ? "أبوه: #" + btn.parentElement.id : "");
  if (btn) {
    const sibs = [...doc.getElementById("grp-po").children].map(b => b.dataset.page || b.id);
    chk("الزر بعد \"تقارير المشتريات\" مباشرةً",
        sibs.indexOf("purchase-kpi") === sibs.indexOf("purchase-reports") + 1,
        "ترتيب المجموعة: " + sibs.join(" → "));
  }

  // ── 3) هل لُفّت showPage فعلاً؟ ──
  chk("hookShowPage() استبدل window.showPage", window.showPage !== window.__origShowPage);
  chk("window._pkpiHooked = true", window._pkpiHooked === true);

  // ── 4) الواجهة العامة ──
  chk("window.purchaseKPI موجود", !!window.purchaseKPI,
      window.purchaseKPI ? "version=" + window.purchaseKPI.version : "");

  // ── 5) الاختبار الحاسم: هل النداء المجرّد showPage('...') من onclick يمرّ عبر اللفّ؟ ──
  purchasesSeed(window);
  let rendered = false;
  const origRender = window.purchaseKPI.render;
  window.purchaseKPI.render = function(){ rendered = true; return origRender.apply(this, arguments); };
  // نُعيد اللفّ ليلتقط render الملغومة؟ لا — نختبر الأصلي عبر النقر الحقيقي على الزر
  btn && btn.onclick && btn.onclick();
  chk("النقر على الزر ينقل الصفحة لـ purchase-kpi",
      doc.getElementById("page-purchase-kpi").classList.contains("active"),
      "نداءات showPage: " + JSON.stringify(window.__showPageCalls));
  chk("render() ملأ الصفحة بمحتوى فعلي", page.innerHTML.length > 500,
      page.innerHTML.length + " حرفاً");
  chk("الصفحة تحوي بطاقات المؤشرات", page.innerHTML.includes("pkpi-card") || page.innerHTML.includes("pkpi-empty"));

  // ── 6) نداء مجرّد showPage(...) كما في onclick داخل HTML ──
  const bareBtn = doc.querySelector('[data-page="purchases"]');
  const before = page.innerHTML.length;
  bareBtn.click();  // ينفّذ onclick="showPage('purchases')" — نداء مجرّد لا window.showPage
  chk("النداء المجرّد showPage('purchases') يعمل عبر اللفّ",
      doc.getElementById("page-purchases").classList.contains("active"),
      "نداءات showPage: " + JSON.stringify(window.__showPageCalls));

  // ── 7) CSS مُحقون ──
  chk("injectCSS() حقن <style id=pkpi-css>", !!doc.getElementById("pkpi-css"));

  // ── 8) MutationObserver يُعيد الحقن بعد مسح القائمة (محاكاة إعادة بناء بعد الدخول) ──
  btn.remove();
  chk("الزر أُزيل (تمهيد)", !doc.getElementById("nav-purchase-kpi-btn"));
  doc.getElementById("grp-po").appendChild(doc.createElement("span")); // تغيير يُفعّل الـ observer
  setTimeout(() => {
    const back = doc.getElementById("nav-purchase-kpi-btn");
    chk("MutationObserver أعاد حقن الزر", !!back);

    console.log("\n══════ نتيجة التشغيل الفعلي لـ purchase-kpi.js ══════\n");
    let bad = 0;
    R.forEach(([ok, name, d]) => {
      if (!ok) bad++;
      console.log(`  ${ok ? "✅" : "❌"}  ${name}${d ? "\n         └─ " + d : ""}`);
    });
    const txt = page.textContent.replace(/[ \t]+/g," ").split("\n").map(x=>x.trim()).filter(Boolean);
    console.log("\n────── ما عُرض فعلاً على الصفحة (من طلبين تجريبيين) ──────");
    console.log("   " + txt.join("\n   ").slice(0, 900));
    console.log("\n" + "═".repeat(52));
    console.log(bad === 0 ? `✅ ${R.length}/${R.length} — الملف حيّ ويركّب نفسه ويعمل`
                          : `❌ ${bad} من ${R.length} فشلت`);
    process.exit(bad === 0 ? 0 : 1);
  }, 60);
}, 200);

function purchasesSeed(window) {
  // بيانات تجريبية تُحاكي شكل الطلب الحقيقي — عبر eval ليصل إلى let purchases المعجمية
  window.eval(`purchases.push(
    { id:"PO-2601-0001", status:"closed", createdAt:"2026-01-05T08:00:00.000Z",
      updatedAt:"2026-01-12T08:00:00.000Z", vendor:"مؤسسة الشرق", projectId:"hail",
      projectName:"مشروع حائل", estCost:1000, actualCost:1100, priority:"عالية",
      expectedDeliveryDate:"2026-01-10T00:00:00.000Z", inBOQ:true, inContract:true,
      items:[{itemName:"كابل",qty:5}], ticketIds:["T-1"],
      timeline:[{event:"pending_pm",at:"2026-01-05T08:00:00.000Z"},
                {event:"pm_approved",at:"2026-01-07T08:00:00.000Z"},
                {event:"closed",at:"2026-01-12T08:00:00.000Z"}] },
    { id:"PO-2601-0002", status:"pending_pm", createdAt:"2026-01-20T08:00:00.000Z",
      vendor:"شركة النور", projectId:"hail", projectName:"مشروع حائل",
      estCost:500, priority:"متوسطة", items:[{itemName:"دهان",qty:2}],
      timeline:[{event:"pending_pm",at:"2026-01-20T08:00:00.000Z"}] }
  );`);
}
