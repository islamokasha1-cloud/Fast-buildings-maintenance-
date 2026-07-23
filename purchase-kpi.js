/* ══════════════════════════════════════════════════════════════════════
   purchase-kpi.js — مؤشرات أداء نظام المشتريات (ملف خارجي — IIFE)
   نفس نمط labor-catalog.js و price-analysis.js
   التكامل مع الملف الرئيسي: سطر واحد فقط قبل </body>:
     <script src="purchase-kpi.js?v=1.0"></script>
   الملف يتولّى ذاتياً: إنشاء صفحة page-purchase-kpi، حقن زر القائمة
   الجانبية داخل مجموعة المشتريات، وربط العرض عند استدعاء showPage.
   يقرأ مصفوفة purchases العامة مباشرة — لا مزامنة إضافية مع Firestore.
   ══════════════════════════════════════════════════════════════════════ */
(function(){
"use strict";

const PAGE_ID = "purchase-kpi";
const VERSION = "1.9";

/* ── مراحل سير العمل بالترتيب — لحساب زمن كل مرحلة من timeline ── */
const STAGE_ORDER = [
  "pending_pm","pm_approved","wh_review","wh_reviewed",
  // v1.3: pending_finance (بانتظار سداد المالية — بين pending_ceo و proc_executing
  // في التسلسل الفعلي) كانت غائبة عن القائمة، فيبتلع pending_ceo زمنَ انتظار المالية
  // كلَّه (next يبحث في STAGE_ORDER وحدها فيقفز فوق الحدث)، فيتضخّم «زمن اعتماد المدير»
  // ويختفي «زمن المالية» من مخطّط متوسط المراحل — رغم أن بطاقة المالية تقيسه صحيحاً،
  // فيتناقض العرضان. نفس صنف عطل pending_extra أدناه.
  "pending_proc","pending_ceo","pending_finance","proc_executing",
  // v1.2: pending_extra (بوّابة البتّ في البند الإضافي — v18.9nz) كانت غائبة عن
  // القائمة، فيبتلع wh_auditing زمنَ البتّ كلَّه: next يبحث في STAGE_ORDER وحدها
  // فيقفز فوق الحدث. و v18.9od أعطتها وقودها — code صريح على الانتقال.
  "wh_receiving","wh_auditing","pending_extra","closed"
];
const REJECT_CODES = ["pm_rejected","wh_rejected","ceo_rejected","rejected"];
const TERMINAL_CODES = ["closed","rejected","cancelled","deleted",
                        "pm_rejected","wh_rejected","ceo_rejected"];

/* أسماء المراحل — تعتمد PO_STATUS من الملف الرئيسي إن وُجد */
function stageLabel(code){
  try{
    if(typeof poStatusLabel === "function") return poStatusLabel(code);
    if(window.PO_STATUS && window.PO_STATUS[code]) return window.PO_STATUS[code];
  }catch(e){}
  return code;
}
function normStatus(s){
  try{ if(typeof normalizePOStatus==="function") return normalizePOStatus(s); }catch(e){}
  return s;
}
function _esc(s){
  try{ if(typeof esc==="function") return esc(s); }catch(e){}
  return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function _toast(msg,type){ try{ if(typeof toast==="function") toast(msg,type); }catch(e){} }
/* أيقونات SVG من طقم المنصة (بديل الإيموجي) — آمنة إن غابت الدوال العامة */
function ICN(name,cls){ try{ return (typeof _ic==="function") ? _ic(name,cls) : ""; }catch(e){ return ""; } }
function ICG(name){ try{ return (typeof _svgIcon==="function") ? _svgIcon(name) : ""; }catch(e){ return ""; } }

/* ── الوصول إلى مصفوفة الطلبات ──
   الملف الرئيسي يعرّفها بـ let purchases = [] — وتعريفات let لا تصبح خصائص
   على window، لكنها تبقى في النطاق المعجمي العام المشترك بين ملفات script
   الكلاسيكية، فالإشارة المجرّدة purchases تصل إليها بينما window.purchases لا. */
function getPurchases(){
  try{ if(typeof purchases !== "undefined" && Array.isArray(purchases)) return purchases; }catch(e){}
  if(Array.isArray(window.purchases)) return window.purchases;
  return [];
}

/* ── أدوات أرقام وتواريخ (أرقام غربية دائماً) ── */
const nf  = n => (n==null||isNaN(n)) ? "—" : Number(n).toLocaleString("en-US",{maximumFractionDigits:0});
const nf2 = n => (n==null||isNaN(n)) ? "—" : Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const pct = n => (n==null||isNaN(n)) ? "—" : Number(n).toLocaleString("en-US",{maximumFractionDigits:1})+"%";
const days1 = n => (n==null||isNaN(n)) ? "—" : Number(n).toLocaleString("en-US",{maximumFractionDigits:1});

function parseTS(v){
  if(!v) return null;
  if(v && typeof v.toDate==="function"){ try{ return v.toDate().getTime(); }catch(e){} }
  const t = new Date(v).getTime();
  return isNaN(t) ? null : t;
}
const DAY = 86400000;

/* ══ استخراج بيانات التحليل من طلب واحد ══ */
function analyzeOrder(p){
  const created = parseTS(p.createdAt);
  const status  = normStatus(p.status);
  /* v1.3: الرمز الصريح أولاً، والنصّ احتياطاً. متوافق خلفياً: السجلات المكتوبة
     قبل v18.9od بلا code تُقرأ كما كانت — أي لا تُقرأ إلا إن صادف نصُّها رمزاً. */
  const tl = Array.isArray(p.timeline) ? p.timeline
    .map(t=>({code: t.code || normStatus(t.event), at:parseTS(t.at), hasCode: !!t.code}))
    .filter(t=>t.at) : [];
  tl.sort((a,b)=>a.at-b.at);

  /* زمن كل مرحلة = من دخولها حتى الحدث التالي (أو الآن للطلبات المفتوحة) */
  const stageDur = {};       // code -> أيام
  let rejectedStages = [];   // مراحل الرفض التي مرّ بها
  for(let i=0;i<tl.length;i++){
    const cur = tl[i];
    if(REJECT_CODES.includes(cur.code)) rejectedStages.push(cur.code);
    if(!STAGE_ORDER.includes(cur.code)) continue;
    const next = tl.slice(i+1).find(t=>STAGE_ORDER.includes(t.code)||REJECT_CODES.includes(t.code)||t.code==="cancelled");
    const end  = next ? next.at
               : (TERMINAL_CODES.includes(status)||status==="cancelled") ? cur.at
               : Date.now();
    const d = (end - cur.at)/DAY;
    if(d>=0 && d<3650) stageDur[cur.code] = (stageDur[cur.code]||0) + d;
  }

  /* زمن الإغلاق */
  const closedEv = tl.find(t=>t.code==="closed");
  const closedAt = closedEv ? closedEv.at : (status==="closed" ? parseTS(p.updatedAt) : null);
  const cycleDays = (created && closedAt && closedAt>=created) ? (closedAt-created)/DAY : null;

  /* الالتزام بموعد التوريد المتوقع */
  const expected = parseTS(p.expectedDeliveryDate);
  let onTime = null;
  if(expected && closedAt) onTime = closedAt <= expected + DAY; // سماحية يوم

  const est = Number(p.estCost)||0;
  const act = Number(p.actualCost)||0;
  const spend = act>0 ? act : est;

  /* v1.3: الطلب قابل للقياس إن حمل رمزاً صريحاً واحداً على الأقل — أي أُنشئ أو
     تحرّك بعد v18.9od. والطلب الأقدم يُستثنى من كل ما يُشتقّ من المسار بدل أن
     يحقن فيه pending_pm بمدة صفر ويرفع «الاعتماد من أول مرة» كذباً: سطر الإنشاء
     كان يدفع {event:"pending_pm"} رمزاً خاماً، فيُحلّ حدثٌ واحد في كل طلب قديم
     ويبدو كأنه مرّ بلا رفض. ويشفى العدّاد وحده كلما أُنشئ طلب — بلا هجرة. */
  const coded = tl.some(t=>t.hasCode);

  return {
    id:p.id, created, status, closedAt, cycleDays, stageDur, coded,
    rejected: rejectedStages,
    firstPass: rejectedStages.length===0 && status!=="cancelled",
    isClosed: status==="closed",
    isOpen: !TERMINAL_CODES.includes(status) && status!=="cancelled",
    est, act, spend,
    variancePct: (est>0 && act>0) ? ((act-est)/est)*100 : null,
    onTime,
    vendor:(p.vendor||"").trim(),
    inContract:!!p.inContract, inBOQ:!!p.inBOQ,
    priority:p.priority||"—",
    projectId:p.projectId||"", projectName:p.projectName||"—",
    ticketLinked: Array.isArray(p.ticketIds)? p.ticketIds.length>0 : !!p.ticketId,
    itemsCount: Array.isArray(p.items)? p.items.length : 1
  };
}

/* ══ تجميع المؤشرات على مجموعة طلبات ══ */
function computeKPIs(list){
  const A = list.map(analyzeOrder);
  const closed = A.filter(a=>a.isClosed);
  const open   = A.filter(a=>a.isOpen);

  const avg = arr => arr.length ? arr.reduce((s,x)=>s+x,0)/arr.length : null;
  const cycles = closed.map(a=>a.cycleDays).filter(v=>v!=null);

  /* v1.3: كل ما يُشتقّ من المسار يُحسب على الطلبات الحاملة رمزاً وحدها. */
  const Meas = A.filter(a=>a.coded);

  /* متوسط زمن كل مرحلة */
  const stageAgg = {};
  Meas.forEach(a=>Object.entries(a.stageDur).forEach(([c,d])=>{
    (stageAgg[c]=stageAgg[c]||[]).push(d);
  }));
  const stageAvg = STAGE_ORDER.filter(c=>c!=="closed" && stageAgg[c])
    .map(c=>({code:c, avg:avg(stageAgg[c]), n:stageAgg[c].length}));

  /* معدلات الرفض حسب الجهة */
  const rejBy = {pm_rejected:0, wh_rejected:0, ceo_rejected:0};
  Meas.forEach(a=>a.rejected.forEach(r=>{ if(rejBy[r]!=null) rejBy[r]++; }));
  const anyRejected = Meas.filter(a=>a.rejected.length>0).length;

  /* ══ v1.3: عدد الطلبات القابلة للقياس ══
     v1.2 حاولت اشتقاق «هل المسار مقروء؟» من فراغ stageAgg — واشتقاقٌ خاطئ:
     سطر الإنشاء كان يدفع {event:"pending_pm"} رمزاً خاماً يُحلّ في كل طلب،
     فلا تفرغ stageAgg أبداً، فتُعلن «مقروء» وتبقى البطاقة تكذب 100%. العلّة
     أن الفحص كان جماعياً على شرطٍ لا يقع، وصار فردياً على علامةٍ صريحة. */
  const measurableN = Meas.length;

  /* انحراف التكلفة */
  const withVar = closed.filter(a=>a.variancePct!=null);
  const avgVariance = avg(withVar.map(a=>a.variancePct));

  /* الالتزام بالتوريد */
  const withDue = closed.filter(a=>a.onTime!=null);
  const onTimeRate = withDue.length ? (withDue.filter(a=>a.onTime).length/withDue.length)*100 : null;

  /* الإنفاق حسب المورد */
  const byVendor = {};
  A.forEach(a=>{ if(a.vendor && a.spend>0) byVendor[a.vendor]=(byVendor[a.vendor]||0)+a.spend; });
  const vendors = Object.entries(byVendor).sort((x,y)=>y[1]-x[1]);
  const totalVendorSpend = vendors.reduce((s,v)=>s+v[1],0);
  const top3Share = totalVendorSpend>0
    ? (vendors.slice(0,3).reduce((s,v)=>s+v[1],0)/totalVendorSpend)*100 : null;

  /* الإنفاق الشهري (تقديري وفعلي) */
  const months = {};
  A.forEach(a=>{
    if(!a.created) return;
    const d = new Date(a.created);
    const k = d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
    const m = months[k]=months[k]||{est:0,act:0,count:0};
    m.est+=a.est; m.act+=a.act; m.count++;
  });
  const monthKeys = Object.keys(months).sort().slice(-12);

  /* توزيع الحالات والأولويات */
  const byStatus={}, byPriority={};
  A.forEach(a=>{ byStatus[a.status]=(byStatus[a.status]||0)+1; });
  open.forEach(a=>{ byPriority[a.priority]=(byPriority[a.priority]||0)+1; });

  /* ── مؤشر المالية (v1.5) — تراكمي، بأيام العمل عبر محرّك SLA المشترك ── */
  const _finPerDay = (typeof PO_WORK_MIN_PER_DAY==="number"&&PO_WORK_MIN_PER_DAY>0)?PO_WORK_MIN_PER_DAY:480;
  const _finWM = (a,b)=>{ try{ if(typeof workingMinutesBetween==="function") return workingMinutesBetween(new Date(a),new Date(b)); }catch(e){} return Math.max(0,(b-a)/60000); };
  const _finTot = p=>{ try{ if(typeof getPOTotal==="function") return getPOTotal(p)||0; }catch(e){} return Number(p.actualCost)||Number(p.estCost)||0; };
  const _finEnter = p=>{ const tl=Array.isArray(p.timeline)?p.timeline:[]; let t=null; for(const e of tl){ if((e&&e.code)==="pending_finance"){ const at=parseTS(e.at); if(at) t=at; } } return t; };
  const _finPending = list.filter(p=>p && normStatus(p.status)==="pending_finance");
  const _finPaid = list.filter(p=>p && p.payment && p.payment.paid===true);
  const _finDurs=[];
  _finPaid.forEach(p=>{ const en=_finEnter(p); const pd=parseTS(p.payment&&p.payment.paidAt); if(en&&pd&&pd>=en) _finDurs.push(_finWM(en,pd)/_finPerDay); });
  const _finNow=Date.now();
  const finance = {
    pendingN:_finPending.length,
    pendingTotal:_finPending.reduce((s,p)=>s+_finTot(p),0),
    paidN:_finPaid.length,
    paidTotal:_finPaid.reduce((s,p)=>s+_finTot(p),0),
    paidMeasN:_finDurs.length,
    avgPayDays:_finDurs.length?(_finDurs.reduce((a,b)=>a+b,0)/_finDurs.length):null,
    oldestPendingDays:_finPending.length?Math.max(..._finPending.map(p=>{ const en=_finEnter(p); return en?_finWM(en,_finNow)/_finPerDay:0; })):null
  };

  return {
    A, total:A.length,
    openCount:open.length, closedCount:closed.length,
    cancelledCount:A.filter(a=>a.status==="cancelled").length,
    avgCycle:avg(cycles),
    medCycle: cycles.length ? cycles.slice().sort((x,y)=>x-y)[Math.floor(cycles.length/2)] : null,
    stageAvg, measurableN, unmeasurableN: A.length - measurableN,
    rejBy:       measurableN ? rejBy : null,
    anyRejected: measurableN ? anyRejected : null,
    firstPassRate: measurableN ? (Meas.filter(a=>a.firstPass).length/measurableN)*100 : null,
    avgVariance, varianceN:withVar.length,
    onTimeRate, onTimeN:withDue.length,
    vendors, top3Share,
    totalEst:A.reduce((s,a)=>s+a.est,0),
    totalAct:A.reduce((s,a)=>s+a.act,0),
    inBOQRate: A.length ? (A.filter(a=>a.inBOQ).length/A.length)*100 : null,
    inContractRate: A.length ? (A.filter(a=>a.inContract).length/A.length)*100 : null,
    ticketRate: A.length ? (A.filter(a=>a.ticketLinked).length/A.length)*100 : null,
    months, monthKeys, byStatus, byPriority,
    finance
  };
}

/* ══════════════════ الواجهة ══════════════════ */
let _charts = {};
function destroyCharts(){ Object.values(_charts).forEach(c=>{try{c.destroy();}catch(e){}}); _charts={}; }

function ensurePage(){
  injectCSS();  // v1.9: دائماً — كانت داخل مسار الإنشاء فتُتخطّى حين يوفّر index.html العنصر النائب page-purchase-kpi
  if(document.getElementById("page-"+PAGE_ID)) return;
  const anyPage = document.querySelector(".page");
  const host = anyPage ? anyPage.parentElement : document.body;
  const div = document.createElement("div");
  div.className="page"; div.id="page-"+PAGE_ID;
  host.appendChild(div);
}

function injectCSS(){
  if(document.getElementById("pkpi-css")) return;
  const st=document.createElement("style"); st.id="pkpi-css";
  st.textContent = `
#page-${PAGE_ID}{direction:rtl}
#page-${PAGE_ID}.active{display:flex;flex-direction:column;min-height:calc(100vh - 110px)}
.pkpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px}
.pkpi-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px;box-shadow:var(--shadow)}
.pkpi-card .v{font-size:24px;font-weight:800;font-family:'Cairo',sans-serif;color:var(--primary);direction:ltr;text-align:right}
.pkpi-card .l{font-size:12px;color:var(--muted);margin-top:2px}
.pkpi-card .s{font-size:10px;color:var(--muted);margin-top:4px}
.pkpi-card.good .v{color:var(--accent)} .pkpi-card.bad .v{color:var(--danger)} .pkpi-card.warn .v{color:var(--warn)}
.pkpi-charts{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;flex:1 1 auto;grid-auto-rows:minmax(300px,1fr)}
.pkpi-chart-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;box-shadow:var(--shadow);display:flex;flex-direction:column}
.pkpi-chart-card h4{margin:0 0 10px;font-size:13px;color:var(--text)}
.pkpi-chart-card .cwrap{position:relative;flex:1 1 auto;min-height:280px}
.pkpi-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:10px 14px;margin-bottom:14px;box-shadow:var(--shadow)}
.pkpi-filters label{font-size:11px;color:var(--muted)}
.pkpi-filters select,.pkpi-filters input{font-family:'Cairo',sans-serif;font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text)}
.pkpi-empty{text-align:center;color:var(--muted);padding:40px;font-size:13px}
@media (max-width:760px){ .pkpi-charts{grid-template-columns:1fr} .pkpi-chart-card .cwrap{min-height:240px} }
`;
  document.head.appendChild(st);
}

function projectOptions(){
  const seen=new Map();
  getPurchases().forEach(p=>{ if(p.projectId && !seen.has(p.projectId)) seen.set(p.projectId,p.projectName||p.projectId); });
  return [...seen.entries()];
}

function currentFilters(){
  const g=id=>document.getElementById(id);
  return {
    proj:  g("pkpi-f-proj")  ? g("pkpi-f-proj").value  : "",
    from:  g("pkpi-f-from")  ? g("pkpi-f-from").value  : "",
    to:    g("pkpi-f-to")    ? g("pkpi-f-to").value    : ""
  };
}

function filteredList(){
  const f = currentFilters();
  let list = getPurchases().filter(p=>normStatus(p.status)!=="deleted");
  if(f.proj) list=list.filter(p=>p.projectId===f.proj);
  if(f.from){ const t=new Date(f.from).getTime(); list=list.filter(p=>{const c=parseTS(p.createdAt);return c&&c>=t;}); }
  if(f.to){ const t=new Date(f.to).getTime()+DAY; list=list.filter(p=>{const c=parseTS(p.createdAt);return c&&c<t;}); }
  return list;
}

function render(){
  ensurePage();
  const root = document.getElementById("page-"+PAGE_ID);
  if(!root) return;

  const list = filteredList();
  const prevF = currentFilters();
  const K = computeKPIs(list);
  destroyCharts();

  const projOpts = projectOptions().map(([id,name])=>
    `<option value="${_esc(id)}" ${prevF.proj===id?"selected":""}>${_esc(name)}</option>`).join("");

  root.innerHTML = `
  <div class="card-header" style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px">
    <h3 style="margin:0;font-size:16px">${ICN("trendingUp","ic-lg")} مؤشرات أداء المشتريات</h3>
    <span style="font-size:10px;color:var(--muted)">v${VERSION} — ${nf(K.total)} طلب ضمن النطاق</span>
  </div>

  <div class="pkpi-filters">
    <label>المشروع</label>
    <select id="pkpi-f-proj" onchange="window.purchaseKPI.render()">
      <option value="">جميع المشاريع</option>${projOpts}
    </select>
    <label>من</label><input type="date" id="pkpi-f-from" value="${_esc(prevF.from)}" onchange="window.purchaseKPI.render()">
    <label>إلى</label><input type="date" id="pkpi-f-to" value="${_esc(prevF.to)}" onchange="window.purchaseKPI.render()">
    <button class="btn btn-ghost btn-sm" onclick="document.getElementById('pkpi-f-proj').value='';document.getElementById('pkpi-f-from').value='';document.getElementById('pkpi-f-to').value='';window.purchaseKPI.render()">↺ إعادة تعيين</button>
  </div>

  ${K.total===0 ? `<div class="pkpi-empty">${ICN("archive")} لا توجد طلبات شراء ضمن النطاق المحدد</div>` : `

  <div class="pkpi-grid">
    <div class="pkpi-card"><div class="v">${nf(K.openCount)}</div><div class="l">طلبات مفتوحة الآن</div><div class="s">من أصل ${nf(K.total)} طلباً</div></div>
    <div class="pkpi-card"><div class="v">${days1(K.avgCycle)}</div><div class="l">متوسط دورة الطلب (يوم)</div><div class="s">وسيط: ${days1(K.medCycle)} — على ${nf(K.closedCount)} طلباً مغلقاً</div></div>
    <div class="pkpi-card ${!K.measurableN?"":K.firstPassRate>=80?"good":K.firstPassRate<50?"bad":"warn"}"><div class="v">${pct(K.firstPassRate)}</div><div class="l">اعتماد من أول مرة</div><div class="s">${K.measurableN?`${nf(K.anyRejected)} من ${nf(K.measurableN)} طلباً واجه رفضاً${K.unmeasurableN?` — و${nf(K.unmeasurableN)} أقدم من القياس`:""}`:"لا طلبات قابلة للقياس بعد — تُحتسب من الطلبات المُنشأة بعد التحديث"}</div></div>
    <div class="pkpi-card ${K.avgVariance==null?"":Math.abs(K.avgVariance)<=10?"good":K.avgVariance>25?"bad":"warn"}"><div class="v" data-viewer-hide>${K.avgVariance==null?"—":(K.avgVariance>0?"+":"")+pct(K.avgVariance)}</div><div class="l">متوسط انحراف التكلفة</div><div class="s">فعلي مقابل تقديري — عينة ${nf(K.varianceN)} طلب</div></div>
    <div class="pkpi-card ${K.onTimeRate==null?"":K.onTimeRate>=85?"good":K.onTimeRate<60?"bad":"warn"}"><div class="v">${pct(K.onTimeRate)}</div><div class="l">التوريد في الموعد</div><div class="s">مقارنة بالتاريخ المتوقع — عينة ${nf(K.onTimeN)}</div></div>
    <div class="pkpi-card"><div class="v">${pct(K.inBOQRate)}</div><div class="l">طلبات ضمن جداول الكميات</div><div class="s">ضمن العقد: ${pct(K.inContractRate)}</div></div>
    <div class="pkpi-card" data-viewer-hide><div class="v">${nf2(K.totalAct||K.totalEst)}</div><div class="l">إجمالي الإنفاق (ر.س)</div><div class="s">تقديري: ${nf2(K.totalEst)} — فعلي: ${nf2(K.totalAct)}</div></div>
    <div class="pkpi-card ${K.top3Share!=null&&K.top3Share>75?"warn":""}" data-viewer-hide><div class="v">${pct(K.top3Share)}</div><div class="l">تركّز أعلى 3 موردين</div><div class="s">من إجمالي الإنفاق — مؤشر مخاطر التوريد</div></div>
    <div class="pkpi-card"><div class="v">${pct(K.ticketRate)}</div><div class="l">طلبات مرتبطة ببلاغات صيانة</div><div class="s">عبر ربط البلاغ بطلب الشراء</div></div>
  </div>

  ${K.finance && (K.finance.paidN||K.finance.pendingN) ? `
  <div style="font-size:13px;font-weight:800;margin:16px 2px 8px;color:#0e7490">${ICN("banknote")} أداء المالية في السداد</div>
  <div class="pkpi-grid">
    <div class="pkpi-card ${K.finance.pendingN?"warn":""}"><div class="v">${nf(K.finance.pendingN)}</div><div class="l">بانتظار السداد الآن</div><div class="s" data-viewer-hide>${K.finance.pendingN?nf2(K.finance.pendingTotal)+" ر.س":"لا طلبات معلّقة"}</div></div>
    <div class="pkpi-card"><div class="v">${nf(K.finance.paidN)}</div><div class="l">طلبات سُدّدت (تراكمي)</div><div class="s" data-viewer-hide>${K.finance.paidN?nf2(K.finance.paidTotal)+" ر.س":"—"}</div></div>
    <div class="pkpi-card ${K.finance.avgPayDays==null?"":K.finance.avgPayDays<=2?"good":K.finance.avgPayDays>5?"bad":"warn"}"><div class="v">${days1(K.finance.avgPayDays)}</div><div class="l">متوسط زمن السداد (يوم عمل)</div><div class="s">من دخول المالية حتى تأكيد السداد — عيّنة ${nf(K.finance.paidMeasN)}</div></div>
    ${K.finance.oldestPendingDays!=null?`<div class="pkpi-card ${K.finance.oldestPendingDays>5?"bad":K.finance.oldestPendingDays>2?"warn":""}"><div class="v">${days1(K.finance.oldestPendingDays)}</div><div class="l">أقدم طلب معلّق (يوم عمل)</div><div class="s">أطول انتظار حالي للسداد</div></div>`:""}
  </div>` : ""}

  <div class="pkpi-charts">
    ${K.measurableN?`<div class="pkpi-chart-card"><h4>${ICN("timer")} متوسط زمن كل مرحلة (يوم) — عنق الزجاجة</h4><div class="cwrap"><canvas id="pkpi-c-stages"></canvas></div></div>`:""}
    <div class="pkpi-chart-card"><h4>${ICN("pieChart")} توزيع الطلبات حسب الحالة</h4><div class="cwrap"><canvas id="pkpi-c-status"></canvas></div></div>
    <div class="pkpi-chart-card" data-viewer-hide><h4>${ICN("receipt")} الإنفاق الشهري — تقديري مقابل فعلي (ر.س)</h4><div class="cwrap"><canvas id="pkpi-c-monthly"></canvas></div></div>
    ${K.measurableN?`<div class="pkpi-chart-card"><h4>${ICN("ban")} الرفض حسب جهة الاعتماد</h4><div class="cwrap"><canvas id="pkpi-c-reject"></canvas></div></div>`:""}
    <div class="pkpi-chart-card" data-viewer-hide><h4>${ICN("store")} أعلى 5 موردين إنفاقاً (ر.س)</h4><div class="cwrap"><canvas id="pkpi-c-vendors"></canvas></div></div>
    <div class="pkpi-chart-card"><h4>${ICN("alertTriangle")} الطلبات المفتوحة حسب الأولوية</h4><div class="cwrap"><canvas id="pkpi-c-priority"></canvas></div></div>
  </div>`}
  `;

  if(K.total>0 && window.Chart) drawCharts(K);
}

function themeColors(){
  const dark = document.documentElement.getAttribute("data-theme")==="dark";
  return {
    text: dark?"#e6edf7":"#1a202c", muted: dark?"#94a3b8":"#64748b",
    grid: dark?"rgba(148,163,184,0.15)":"rgba(100,116,139,0.15)",
    primary: dark?"#5b8def":"#1b3a6b", accent: dark?"#34d399":"#0a7c59",
    warn: dark?"#fbbf24":"#a06010", danger: dark?"#f87171":"#b92c2c",
    info: dark?"#60a5fa":"#1f5fa6"
  };
}

function drawCharts(K){
  const C = themeColors();
  const base = { responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{labels:{color:C.text, font:{family:"Cairo"}}} },
    scales:{ x:{ticks:{color:C.muted,font:{family:"Cairo",size:10}},grid:{color:C.grid}},
             y:{ticks:{color:C.muted,font:{family:"Cairo",size:10}},grid:{color:C.grid},beginAtZero:true} } };
  const $ = id => { const el=document.getElementById(id); return el?el.getContext("2d"):null; };

  /* 1) زمن المراحل */
  let ctx = $("pkpi-c-stages");
  if(ctx && K.stageAvg.length){
    _charts.stages = new Chart(ctx,{type:"bar",data:{
      labels:K.stageAvg.map(s=>stageLabel(s.code)),
      datasets:[{label:"متوسط الأيام",data:K.stageAvg.map(s=>+s.avg.toFixed(2)),
        backgroundColor:K.stageAvg.map(s=>s.avg===Math.max(...K.stageAvg.map(x=>x.avg))?C.danger:C.info),borderRadius:6}]
    },options:{...base,indexAxis:"y",plugins:{legend:{display:false}}}});
  }

  /* 2) توزيع الحالات */
  ctx = $("pkpi-c-status");
  if(ctx){
    const entries=Object.entries(K.byStatus).sort((a,b)=>b[1]-a[1]);
    const palette=[C.primary,C.accent,C.warn,C.danger,C.info,"#8b5cf6","#ec4899","#14b8a6","#f97316","#64748b"];
    _charts.status=new Chart(ctx,{type:"doughnut",data:{
      labels:entries.map(e=>stageLabel(e[0])),
      datasets:[{data:entries.map(e=>e[1]),backgroundColor:entries.map((_,i)=>palette[i%palette.length])}]
    },options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:"left",labels:{color:C.text,font:{family:"Cairo",size:10},boxWidth:12}}}}});
  }

  /* 3) الإنفاق الشهري */
  ctx = $("pkpi-c-monthly");
  if(ctx && K.monthKeys.length){
    _charts.monthly=new Chart(ctx,{type:"line",data:{
      labels:K.monthKeys,
      datasets:[
        {label:"تقديري",data:K.monthKeys.map(k=>+K.months[k].est.toFixed(0)),borderColor:C.info,backgroundColor:"transparent",tension:.3},
        {label:"فعلي",data:K.monthKeys.map(k=>+K.months[k].act.toFixed(0)),borderColor:C.accent,backgroundColor:"transparent",tension:.3}
      ]},options:base});
  }

  /* 4) الرفض حسب الجهة */
  ctx = $("pkpi-c-reject");
  if(ctx && K.measurableN && K.rejBy){
    _charts.reject=new Chart(ctx,{type:"bar",data:{
      labels:["مدير المشاريع","المستودع","المدير التنفيذي"],
      datasets:[{label:"مرات الرفض",data:[K.rejBy.pm_rejected,K.rejBy.wh_rejected,K.rejBy.ceo_rejected],
        backgroundColor:[C.warn,C.danger,C.primary],borderRadius:6}]
    },options:{...base,plugins:{legend:{display:false}}}});
  }

  /* 5) أعلى الموردين */
  ctx = $("pkpi-c-vendors");
  if(ctx && K.vendors.length){
    const top=K.vendors.slice(0,5);
    _charts.vendors=new Chart(ctx,{type:"bar",data:{
      labels:top.map(v=>v[0]),
      datasets:[{label:"الإنفاق (ر.س)",data:top.map(v=>+v[1].toFixed(0)),backgroundColor:C.accent,borderRadius:6}]
    },options:{...base,indexAxis:"y",plugins:{legend:{display:false}}}});
  }

  /* 6) المفتوحة حسب الأولوية */
  ctx = $("pkpi-c-priority");
  if(ctx){
    const entries=Object.entries(K.byPriority).sort((a,b)=>b[1]-a[1]);
    _charts.priority=new Chart(ctx,{type:"bar",data:{
      labels:entries.map(e=>e[0]),
      datasets:[{label:"طلبات مفتوحة",data:entries.map(e=>e[1]),backgroundColor:C.warn,borderRadius:6}]
    },options:{...base,plugins:{legend:{display:false}}}});
  }
}

/* ══ حقن زر القائمة الجانبية داخل مجموعة المشتريات ══ */
function injectSidebarButton(){
  if(document.getElementById("nav-purchase-kpi-btn")) return;
  const grp = document.getElementById("grp-po");
  if(!grp) return;
  const btn = document.createElement("button");
  btn.className="sidebar-nav-btn sidebar-child";
  btn.id="nav-purchase-kpi-btn";
  btn.dataset.page=PAGE_ID;
  btn.innerHTML='<span class="s-icon">'+ICG('trendingUp')+'</span> مؤشرات الأداء';
  btn.onclick=()=>{ try{ showPage(PAGE_ID); }catch(e){} };
  /* بعد زر تقارير المشتريات إن وُجد، وإلا في نهاية المجموعة */
  const after = grp.querySelector('[data-page="purchase-reports"]');
  if(after && after.nextSibling) grp.insertBefore(btn, after.nextSibling);
  else grp.appendChild(btn);
}

/* ══ ربط showPage دون تعديل الملف الرئيسي ══ */
function hookShowPage(){
  if(window._pkpiHooked || typeof window.showPage!=="function") return;
  const orig = window.showPage;
  window.showPage = function(id){
    orig.apply(this, arguments);
    /* v18.9oj: السؤال ليس «ماذا طُلب» بل «ماذا فُتح فعلاً». showPage في النواة
       تُعيد إسناد id إلى "dashboard" عند الحجب (_blockedPagesForUser) — و v18.9ng
       أدخلت purchase-kpi في _PERM_PAGE_MAP.purchases تحديداً لتُمنع، ثم كان هذا
       الخطّاف يقرأ المعامل الذي وصله لا نتيجة النواة، فيرسم الإنفاق وتركّز الموردين
       في صفحةٍ مخفيّة لمن حُجبت عنه: مرئيةٌ لكل من يفتح أدوات المطوّر. والاشتقاق من
       الواقع لا من النية: الصفحة المفتوحة هي التي تحمل active. */
    if(id===PAGE_ID){
      const _pg = document.getElementById("page-"+PAGE_ID);
      if(!_pg || !_pg.classList.contains("active")) return;
      /* فتح مجموعة المشتريات في القائمة الجانبية */
      try{
        const grpEl=document.getElementById("grp-po");
        if(grpEl && grpEl.classList.contains("collapsed") && typeof toggleSidebarGroup==="function") toggleSidebarGroup("grp-po");
      }catch(e){}
      render();
    }
  };
  window._pkpiHooked = true;
}

/* ══ التهيئة ══ */
function init(){
  ensurePage();
  injectSidebarButton();
  hookShowPage();
  /* القائمة الجانبية قد تُعاد كتابتها بعد تسجيل الدخول — أعد الحقن عند التغيير */
  const obs = new MutationObserver(()=>{ injectSidebarButton(); hookShowPage(); });
  obs.observe(document.body,{childList:true,subtree:true});
}

if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
else init();

/* الواجهة العامة — نفس نمط laborCatalog و priceAnalysis */
window.purchaseKPI = {
  render,
  startSync(){ /* لا مزامنة مستقلة — يقرأ purchases الحية مباشرة */ },
  version: VERSION
};

})();
