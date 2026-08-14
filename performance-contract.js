/* ═══════════════════════════════════════════════════════════════════════════
   نظام هيل — وحدة العقد القائم على الأداء  (performance-contract.js)   [المرحلة ١]
   ملف خارجي مستقل على نمط cleaning-operations.js: IIFE يعرض window.performanceContract،
   يركّب صفحته ذاتياً (page-performance) ويحقن زرّها في القائمة الجانبية ويلفّ showPage —
   فلا يحتاج من index.html إلا وسم <script> واحد.

   يقرأ خدمات النواة بالاسم (esc / toast / currentUser / CURRENT_PROJECT / _svgIcon /
   isPerfProject / perfConfig / perfMinScore / perfContractYear / perfContractMonth /
   perfInGrace / PERF_GRACE_MONTHS) — كل وسوم <script> الكلاسيكية تتشارك البيئة العامة.

   ── الفكرة الحاكمة ──
   المشروع القائم على الأداء **صفةٌ على المشروع لا منصةٌ ثانية**. العَلَم `perfContract`
   في سجلّ المشروع (`meta/projects`) هو المفتاح الوحيد: يُضيء هذا القسم ويُطفئه.
   والمشاريع التقليدية لا ترى شيئاً — لا زرّ ولا صفحة ولا حقل. سابقةٌ قائمة في المنصة:
   `type==="cleaning"` يبدّل سلوكها لعقود النظافة؛ والفارق أن الأداء **متعامدٌ على النوع**
   (مشروع صيانةٍ قد يكون بعقد أداء) فكان عَلَماً مستقلاً لا نوعاً رابعاً.

   ── نطاق المرحلة ١ (هذه) ──
   • بطاقةُ العقد: المبلغ الشهري المقطوع · سنة العقد · الحد الأدنى للنجاح هذه السنة ·
     شهر العقد وحالةُ مهلة الشهرين.
   • هيكلُ بطاقة الأداء المتوازن: المجموعات الخمس بأوزانها ومستهدفاتها السنوية،
     ومقياسُ الغرامة — مرجعاً حاضراً أمام المستخدم لا ملفَّ إكسل على مكتبٍ ما.
   • حالةٌ صريحةٌ لكل مجموعة: **من أين ستأتي درجتها** وما الذي ينقص لحسابها.

   ── ما ليس في هذه المرحلة (عمداً) ──
   لا درجةَ محسوبة ولا غرامةَ مقدَّرة. حسابُ الدرجة يحتاج حقولاً غير موجودةٍ بعد
   (زمن الاستجابة، تاريخ استحقاق الوقائي، سجلّ المخالفات) — وعرضُ رقمٍ قبلها يكون
   **رقماً كاذباً**، وهو أسوأ من لا رقم في عقدٍ يُحاسَب عليه المال شهرياً.
   المرحلة ٢: الحقول · المرحلة ٣: سجلّ عدم المطابقة · المرحلة ٤: الدرجة والغرامة الحيّة.
   المرجع الكامل: docs/performance-project-type-plan.md و docs/consultant-kpi-mapping.md

   ── الهوية البصرية: لغة المنصة نفسها ──
   تُستعمل أصناف المنصة (.page-hero / .card / .stat-tile / .ppm-pill / .btn) وما لا
   مقابل له فقط يُعرَّف هنا في طبقةٍ رقيقة — فتتبع الصفحةُ أيَّ تغييرٍ في هوية المنصة.

   ── ملاحظة تقنية مقصودة ──
   لا onSnapshot ولا .get() في هذه المرحلة: كل ما تعرضه الصفحة مشتقٌّ من سجلّ المشروع
   المحمَّل أصلاً في الذاكرة. لا مستمعَ جديداً مربوطاً بالمشروع بلا حاجة (انضباط
   المستمعين في هذا النظام: تراكم targetId يُطلق خلل Firestore الداخلي ca9/b815).
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
"use strict";

const PAGE_ID      = "performance";
const VERSION      = "0.1";
const MODULE_BUILD = "v18.9.2646";

/* ════════════ خدمات النواة (قراءة بالاسم مع بدائل آمنة) ════════════ */
function _esc(s){ try{ return (typeof esc==="function") ? esc(s) : String(s==null?"":s); }catch(e){ return String(s==null?"":s); } }
function _toast(m,t){ try{ toast(m,t); }catch(e){ console.log(m); } }
function _user(){ try{ return currentUser||null; }catch(e){ return null; } }
function _proj(){ try{ return (typeof CURRENT_PROJECT!=="undefined" && CURRENT_PROJECT) ? CURRENT_PROJECT : null; }catch(e){ return null; } }
function _projId(){ const p=_proj(); return p&&p.id ? p.id : ""; }
/* كلُّ أيقونةٍ تخرج بأبعادٍ صريحة — _svgIcon في النواة يُرجع <svg> بلا width/height،
   وSVG بلا أبعاد داخل حاوية flex يتمدّد ليملأها (درسُ وحدة النظافة). */
function _svg(name, size){
  try{
    const raw=(typeof _svgIcon==="function") ? _svgIcon(name) : "";
    if(!raw) return "";
    const n=size||16;
    return raw.replace(/^<svg\b/, '<svg width="'+n+'" height="'+n+'"');
  }catch(e){ return ""; }
}
/* بوّابةُ العقد — تُقرأ من النواة وحدها، فلا تعريفَ محلّياً يتباعد عنها. */
function _isPerf(){ try{ return typeof isPerfProject==="function" && isPerfProject(); }catch(e){ return false; } }
function _cfg(){ try{ return (typeof perfConfig==="function") ? perfConfig() : null; }catch(e){ return null; } }
function _year(){ try{ return (typeof perfContractYear==="function") ? perfContractYear() : 1; }catch(e){ return 1; } }
function _month(){ try{ return (typeof perfContractMonth==="function") ? perfContractMonth() : 1; }catch(e){ return 1; } }
function _minScore(){ try{ return (typeof perfMinScore==="function") ? perfMinScore() : null; }catch(e){ return null; } }
function _inGrace(){ try{ return typeof perfInGrace==="function" && perfInGrace(); }catch(e){ return false; } }
function _graceMonths(){ try{ return (typeof PERF_GRACE_MONTHS!=="undefined") ? PERF_GRACE_MONTHS : 2; }catch(e){ return 2; } }
function _isTrial(){ try{ return typeof isPerfTrial==="function" && isPerfTrial(); }catch(e){ return false; } }
function _tickets(){ try{ return (typeof allTickets==="function") ? allTickets() : (typeof tickets!=="undefined" ? tickets : []); }catch(e){ return []; } }
function _isOp(t){ try{ return typeof isOperationTicket==="function" && isOperationTicket(t); }catch(e){ return false; } }

/* من يرى القسم: كلُّ من يرى المشروع عدا المراقب الخارجي.
   قرارُ الصلاحيات التفصيلي (من يُدخل المخالفات ومن يعتمد الدرجة) يُحسم في المرحلة ٣
   حين توجد كتابةٌ فعلية — ولا كتابةَ في هذه المرحلة إطلاقاً. */
function canView(){
  const u=_user(); if(!u) return false;
  try{ if(typeof isObserver==="function" && isObserver()) return false; }catch(e){}
  return true;
}

/* ════════════════════════════════════════════════════════════
   نموذج البطاقة — من ملف الاستشاري (V3 — ٢٥/٠٦/٢٠٢٥)
   المجموعات الخمس مطابقةٌ لركائز نطاق العمل في بند ٦٧ من الكراسة.
   الأوزان والمستهدفات **بياناتٌ لا منطق**: تُعدَّل هنا في موضعٍ واحد، وستنتقل
   في المرحلة ٤ إلى إعداداتٍ من الواجهة (الملحق قد يصل بأوزانٍ مختلفة).
   ════════════════════════════════════════════════════════════ */
const GROUPS = [
  { no:"٤", key:"preventive", name:"الصيانة الوقائية والروتينية المجدولة", weight:0.30,
    targets:[0.80,0.85,0.90,0.95,1.00], kpis:3,
    source:"من خطط الصيانة الوقائية في المنصة",
    gap:"✅ المرحلة ٢: البلاغ الوقائي صار يحمل استحقاقه المخطَّط، والجدولُ المعتمد لم يعد ينزاح" },
  { no:"٥", key:"corrective", name:"الصيانة التصحيحية", weight:0.25,
    targets:[0.80,0.85,0.90,0.95,1.00], kpis:4,
    source:"من البلاغات ومحرّك SLA القائم",
    gap:"جاهزٌ جزئياً: تكرارُ الأعطال على الأصل والإغلاقُ في المهلة محسوبان اليوم" },
  { no:"٣", key:"response", name:"الاستجابة للأحداث والطوارئ", weight:0.20,
    targets:[0.75,0.80,0.85,0.90,0.95], kpis:6,
    source:"من طوابع البلاغ الزمنية",
    gap:"✅ المرحلة ٢: طابعا «وصلتُ للموقع» و«رجعت الخدمة» يُلتقطان، وإيقافُ الساعة يُوثَّق" },
  { no:"٢", key:"hse", name:"السلامة المهنية والبيئية", weight:0.15,
    targets:[0.80,0.85,0.90,0.95,1.00], kpis:4,
    source:"من سجلّ الحوادث وتصاريح العمل",
    gap:"غير موجودٍ بعد — وساعاتُ العمل لمعدل الإصابات تُستمدّ من الحضور القائم في تطبيق الفنيين" },
  { no:"١", key:"contract", name:"إدارة العقود والسجلات", weight:0.10,
    targets:[0.75,0.80,0.85,0.90,0.95], kpis:3,
    source:"من سجلّ الأصول وتقارير عدم المطابقة",
    gap:"ينقص سجلُّ تغييرات الأصل، وسجلُّ المخالفات" }
];

/* النتيجة السنوية المستهدفة = Σ (وزن المجموعة × مستهدفها) — تُحسب لا تُكتب،
   فلا ينحرف الجدول عن الأوزان إن عُدِّلت. (٧٨٫٥٪ في السنة الأولى بأرقام الاستشاري.) */
function yearTarget(yIdx){
  return GROUPS.reduce((s,g)=> s + g.weight * (g.targets[yIdx] != null ? g.targets[yIdx] : g.targets[g.targets.length-1]), 0);
}

/* مقياس الغرامة (بند ٦٣ من الكراسة). الانحراف = الدرجة − الحد الأدنى. */
const PENALTY_SCALE = [
  { label:"٠٪ إلى −٢٪",   sub:"المتعادل", pct:0    },
  { label:"−٢٪ إلى −٣٪",  sub:"",         pct:0.07 },
  { label:"−٣٪ إلى −٤٪",  sub:"",         pct:0.08 },
  { label:"−٤٪ إلى −٥٪",  sub:"",         pct:0.09 },
  { label:"−٥٪ إلى −٦٪",  sub:"",         pct:0.10 },
  { label:"−٦٪ فأكثر",    sub:"",         pct:0.12 }
];

const AR_YEARS = ["الأولى","الثانية","الثالثة","الرابعة","الخامسة"];
function _pct(n){ return Math.round(n*1000)/10; }
function _money(n){ try{ return Number(n||0).toLocaleString("en-US"); }catch(e){ return String(n||0); } }

/* ════════════════════════════════════════════════════════════
   العرض
   ════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════
   تغطيةُ البيانات — الرقم الوحيد الصادق في التجربة
   ────────────────────────────────────────────────────────────
   في أول شهرٍ لا معنى لـ«درجةِ الأداء»: الحقولُ لم تكن تُملأ، فمؤشرٌ بلا بياناتٍ
   يُقرأ صفراً — لا لأن الفريق مقصّر بل لأن العادة لم تتشكّل بعد. لذلك تبدأ التجربة
   بسؤال **«كم مما نحتاجه صرنا نلتقطه؟»** لا بسؤال «كم درجتنا؟».
   وهذه النسبةُ هي المؤشر الحقيقي لجاهزيتنا للعقد.
   ════════════════════════════════════════════════════════════ */
function coverage(){
  const n=new Date();
  const mStart=new Date(n.getFullYear(), n.getMonth(), 1);
  const all=_tickets().filter(t=>t && !_isOp(t) && t.createdAt && new Date(t.createdAt)>=mStart);
  const corr=all.filter(t=>t.maintType!=="وقائية");
  const prev=all.filter(t=>t.maintType==="وقائية");
  const closed=all.filter(t=>t.status==="مغلق");
  const pct=(a,b)=> b? Math.round(a/b*100) : null;
  return {
    monthLabel: n.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn",{year:"numeric",month:"long"}),
    total: all.length,
    responded:{ n:all.filter(t=>t.respondedAt).length, d:all.length, pct:pct(all.filter(t=>t.respondedAt).length, all.length) },
    restored:{  n:closed.filter(t=>t.restoredAt).length, d:closed.length, pct:pct(closed.filter(t=>t.restoredAt).length, closed.length) },
    scheduled:{ n:prev.filter(t=>t.scheduledFor).length, d:prev.length, pct:pct(prev.filter(t=>t.scheduledFor).length, prev.length) },
    stops:      all.filter(t=>Array.isArray(t.clockStops) && t.clockStops.length).length,
    corrective: corr.length
  };
}

function coverageHTML(){
  const c=coverage();
  const row=(label, o, hint)=>{
    const has=o.pct!=null;
    const col=!has?"var(--muted)":(o.pct>=80?"#0a7c59":o.pct>=40?"#d97706":"#b92c2c");
    return `<div class="pf-cov">
      <div class="pf-cov-top">
        <div class="pf-cov-l">${_esc(label)}</div>
        <div class="pf-cov-v" style="color:${col}">${has?o.pct+"%":"—"}</div>
      </div>
      <div class="pf-bar"><div class="pf-bar-fill" style="width:${has?o.pct:0}%;background:${col}"></div></div>
      <div class="pf-cov-h">${has?`${o.n} من ${o.d}`:"لا بلاغاتٍ في هذا النطاق بعد"} — ${_esc(hint)}</div>
    </div>`;
  };
  return `
  <div class="card">
    <div class="card-header"><div class="card-title">${_svg("activity",16)} تغطيةُ البيانات — ${_esc(c.monthLabel)}</div></div>
    <div class="pf-hint">هذا <b>مقياسُ التقاطِ البيانات لا مقياسُ أداءِ الفريق</b>. في العقد الحقيقي
      كلُّ بلاغٍ بلا طابعٍ زمنيٍّ يسقط من مؤشره — فالتغطيةُ هي جاهزيتنا للقياس. ابدأ هنا، والدرجةُ تأتي بعدها.</div>
    <div class="pf-covs">
      ${row("زمن الاستجابة (وصول الفني)", c.responded, "مؤشر ٣٫١ — وزن ٤٪")}
      ${row("عودة الخدمة", c.restored, "مؤشر ٣٫٣ — وزن ٤٪")}
      ${row("الاستحقاق المخطَّط للوقائي", c.scheduled, "مؤشرا ٤٫١ و٤٫٢ — وزن ٢٠٪")}
    </div>
    <div class="pf-cov-foot">
      ${_svg("clipboardCheck",13)} بلاغاتُ الشهر: <b>${c.total}</b> · تصحيحية: <b>${c.corrective}</b>
      · موثَّقٌ لها إيقافُ ساعة: <b>${c.stops}</b>
    </div>
  </div>`;
}

function render(){
  const el=document.getElementById("page-"+PAGE_ID);
  if(!el) return;
  if(!_isPerf()){
    el.innerHTML = `<div class="pf-empty"><div class="pf-empty-t">هذا القسم لمشاريع «العقد القائم على الأداء»</div>
      <div class="pf-empty-s">فعّل الخيار من: لوحة الإدارة ← المشاريع ← تعديل المشروع.</div></div>`;
    return;
  }
  const cfg=_cfg()||{}, y=_year(), m=_month(), minS=_minScore(), grace=_inGrace();
  const yIdx=Math.min(Math.max(y,1),AR_YEARS.length)-1;

  el.innerHTML =
    heroHTML(cfg, y, m, minS, grace) +
    coverageHTML() +
    scorecardHTML(yIdx) +
    penaltyHTML(cfg) +
    roadmapHTML();
}

function heroHTML(cfg, y, m, minS, grace){
  const yName = AR_YEARS[Math.min(Math.max(y,1),AR_YEARS.length)-1] || ("رقم "+y);
  return `
  <div class="page-hero">
    <div class="page-hero-title">${_svg("barChart",20)} تقييم الأداء</div>
    <div class="page-hero-sub">${_esc((_proj()&&_proj().name)||"")} — عقدٌ قائمٌ على الأداء</div>
  </div>

  ${_isTrial() ? `<div class="pf-note pf-note-trial">${_svg("alertTriangle",16)}
    <div><b>وضعٌ تجريبيّ — قياسٌ بلا غرامات.</b> العقد يعمل هنا للتدريب وبناء البيانات
    قبل الاستلام: لا خصمَ ولا التزامَ ماليّاً، وكلُّ مبلغٍ معروضٍ <b>تدريبيٌّ للتوضيح</b>.
    الغرضُ أن تتشكّل العادةُ ويظهر خطُّ الأساس قبل أن يصير المال على المحكّ.</div>
  </div>` : ""}

  ${grace ? `<div class="pf-note pf-note-ok">${_svg("shield",16)}
    <div><b>مهلة الإعفاء سارية</b> — نحن في الشهر ${m} من العقد، ولا تُطبَّق الغرامات قبل
    الشهر ${_graceMonths()+1} (بند ٦٣). هذه نافذةُ الضبط: ما يُبنى الآن يحدّد درجة أول شهرٍ محتسَب.</div>
  </div>` : ""}

  <div class="stats-grid" style="margin-bottom:14px">
    <div class="stat-tile">
      <div class="st-label">المبلغ الشهري المقطوع${_isTrial()?' <span class="pf-tag">تدريبيّ</span>':''}</div>
      <div class="st-value">${cfg.monthlyAmount ? _money(cfg.monthlyAmount) : "—"}</div>
      <div class="st-sub">${cfg.monthlyAmount ? "ريال / بلا ضريبة" : "لم يُدخَل بعد"}</div>
    </div>
    <div class="stat-tile">
      <div class="st-label">سنة العقد</div>
      <div class="st-value">${yName}</div>
      <div class="st-sub">الشهر ${m} من التنفيذ</div>
    </div>
    <div class="stat-tile">
      <div class="st-label">الحد الأدنى للنجاح</div>
      <div class="st-value" style="color:var(--warn,#d97706)">${minS!=null?_pct(minS)+"%":"—"}</div>
      <div class="st-sub">النزول تحته ثلاث مراتٍ متتالية ⇒ حقُّ الفسخ</div>
    </div>
    <div class="stat-tile">
      <div class="st-label">النتيجة السنوية المستهدفة</div>
      <div class="st-value">${_pct(yearTarget(Math.min(Math.max(y,1),AR_YEARS.length)-1))}%</div>
      <div class="st-sub">مجموع الأوزان × مستهدفات السنة</div>
    </div>
  </div>`;
}

function scorecardHTML(yIdx){
  // الشريط نسبيٌّ إلى **أثقل مجموعة** لا نسبةٌ مطلقة: فأثقلُها يملأ الشريط
  // وتُقرأ الأوزان بالمقارنة البصرية. (نسبةٌ مطلقةٌ تجعل كلَّ الأشرطة شبه فارغة.)
  const maxW = GROUPS.reduce((m,g)=> g.weight>m ? g.weight : m, 0) || 1;
  const rows = GROUPS.map(g=>`
    <div class="pf-grp">
      <div class="pf-grp-head">
        <div class="pf-grp-no">${g.no}</div>
        <div style="flex:1;min-width:0">
          <div class="pf-grp-name">${_esc(g.name)}</div>
          <div class="pf-grp-meta">${g.kpis} مؤشرات — مستهدف السنة ${_pct(g.targets[yIdx]!=null?g.targets[yIdx]:g.targets[g.targets.length-1])}%</div>
        </div>
        <div class="pf-grp-w">${_pct(g.weight)}<span>%</span></div>
      </div>
      <div class="pf-bar"><div class="pf-bar-fill" style="width:${Math.round(g.weight/maxW*100)}%"></div></div>
      <div class="pf-grp-src">${_svg("layers",13)} <span>${_esc(g.source)}</span></div>
      <div class="pf-grp-gap">${_svg("alertTriangle",13)} <span>${_esc(g.gap)}</span></div>
    </div>`).join("");

  const yearsHead = AR_YEARS.map((n,i)=>`<th class="${i===yIdx?"pf-th-now":""}">${n}</th>`).join("");
  const yearsRow  = AR_YEARS.map((n,i)=>`<td class="${i===yIdx?"pf-td-now":""}">${_pct(yearTarget(i))}%</td>`).join("");

  return `
  <div class="card">
    <div class="card-header"><div class="card-title">${_svg("target",16)} بطاقة الأداء المتوازن — المجموعات الخمس</div></div>
    <div class="pf-hint">المجموعات مطابقةٌ لركائز نطاق العمل في بند ٦٧ من الكراسة، والأوزان من ملف الاستشاري (V3).
      كلُّ درجةٍ مردودةٌ إلى نصٍّ في العقد — فتَقصُر مسافةُ الجدل في الاجتماع الشهري.</div>
    <div class="pf-grps">${rows}</div>
    <div class="pf-tbl-wrap">
      <table class="pf-tbl">
        <thead><tr><th style="text-align:right">النتيجة السنوية المستهدفة</th>${yearsHead}</tr></thead>
        <tbody><tr><td style="text-align:right;font-weight:800">المطلوب تحقيقه</td>${yearsRow}</tr></tbody>
      </table>
    </div>
  </div>`;
}

function penaltyHTML(cfg){
  const amt=cfg.monthlyAmount||0;
  const rows=PENALTY_SCALE.map(r=>`
    <tr>
      <td style="text-align:right">${r.label}${r.sub?` <span class="pf-muted">(${r.sub})</span>`:""}</td>
      <td>${r.pct?_pct(r.pct)+"%":"لا يوجد"}</td>
      <td>${r.pct&&amt?_money(Math.round(amt*r.pct)):(r.pct?"—":"0")}</td>
    </tr>`).join("");
  return `
  <div class="card">
    <div class="card-header"><div class="card-title">${_svg("alertTriangle",16)} مقياس الغرامة الشهرية${_isTrial()?' <span class="pf-tag">تدريبيّ — لا يُحتسب</span>':''}</div></div>
    <div class="pf-hint">الانحراف = الدرجة الشهرية − الحد الأدنى. والغرامة نسبةٌ من المبلغ الشهري المقطوع (بند ٦٣)،
      بسقفٍ تراكميٍّ ٢٠٪ من قيمة العقد (بند ٦٥).</div>
    <div class="pf-tbl-wrap">
      <table class="pf-tbl">
        <thead><tr><th style="text-align:right">نطاق الانحراف</th><th>نسبة الغرامة</th><th>القيمة (ريال)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${!amt?`<div class="pf-note pf-note-warn" style="margin:12px 0 0">${_svg("alertTriangle",16)}
      <div>لم يُدخَل المبلغ الشهري المقطوع بعد — أدخِله من: لوحة الإدارة ← المشاريع ← تعديل المشروع، لتظهر القيم بالريال.</div></div>`:""}
    <div class="pf-note pf-note-warn" style="margin:12px 0 0">${_svg("alertCircle",16)}
      <div><b>الغرامة ليست الخطر الأكبر.</b> بجانبها «حسمياتٌ تلقائية»: مبالغُ ثابتةٌ لكل مؤشرٍ ينزل عن عتبته،
      <b>تتضاعف حتى ثلاثة أضعافٍ</b> بتكرار التقصير شهراً بعد شهر. في المثال المحسوب في ملف الاستشاري بلغت
      ٩٠٪ من إجمالي الاقتطاع. ولهذا يتتبّع النظام — في المرحلة ٤ — عدّادَ تكرارٍ لكل مؤشرٍ على حدة.</div>
    </div>
  </div>`;
}

function roadmapHTML(){
  const steps=[
    { n:"١", t:"نوعُ المشروع", d:"عَلَمُ «عقد قائم على الأداء» وإعداداته، وهذا القسم.", done:true },
    { n:"٢", t:"الحقول التي تُغذّي المؤشرات", d:"«وصلتُ للموقع» · «رجعت الخدمة» · «توقف الساعة» · تاريخُ استحقاق المهمة الوقائية — والجدولُ المعتمد لم يعد ينزاح. تفتح ٢٨ درجةً من ١٠٠.", done:true },
    { n:"٣", t:"سجلّ عدم المطابقة", d:"استقبالُ المخالفة وربطُها بالمؤشر، وأثرُها المحسوب فوراً، وملفُّ اعتراضٍ بالأدلة. يحمي ٥١٫٥ درجة.", done:false },
    { n:"٤", t:"الدرجة والغرامة الحيّة", d:"الدرجةُ أثناء الشهر · الخصمُ المتوقَّع · عدّادا التكرار والإنذار · «ماذا لو».", done:false },
    { n:"٥", t:"السلامة والتوطين و٩٤٠", d:"سجلُّ الحوادث · تصاريحُ العمل · لوحةُ التوطين · بلاغاتُ ٩٤٠ · سجلُّ التدريب.", done:false }
  ];
  return `
  <div class="card">
    <div class="card-header"><div class="card-title">${_svg("map",16)} خطة التفعيل</div></div>
    <div class="pf-hint">لا تُعرَض درجةٌ محسوبةٌ قبل اكتمال حقولها — <b>رقمٌ كاذبٌ في عقدٍ يُحاسَب عليه المال
      أسوأ من لا رقم</b>. كلُّ مرحلةٍ تُضيء ما تملك بياناته.</div>
    <div class="pf-steps">
      ${steps.map(s=>`
      <div class="pf-step ${s.done?"pf-step-done":""}">
        <div class="pf-step-n">${s.done?_svg("checkCircle",15):s.n}</div>
        <div style="flex:1;min-width:0">
          <div class="pf-step-t">${_esc(s.t)} ${s.done?'<span class="pf-badge-ok">مكتملة</span>':'<span class="pf-badge-wait">قادمة</span>'}</div>
          <div class="pf-step-d">${_esc(s.d)}</div>
        </div>
      </div>`).join("")}
    </div>
  </div>`;
}

/* ════════════════════════════════════════════════════════════
   طبقة CSS رقيقة — ما لا مقابل له في المنصة فقط
   ════════════════════════════════════════════════════════════ */
function injectCSS(){
  if(document.getElementById("pf-css")) return;
  const st=document.createElement("style"); st.id="pf-css";
  st.textContent=`
  #page-${PAGE_ID} .pf-note{display:flex;gap:9px;align-items:flex-start;border-radius:10px;padding:11px 13px;font-size:12.5px;line-height:1.9;margin-bottom:14px}
  #page-${PAGE_ID} .pf-note svg{flex:0 0 auto;margin-top:3px}
  #page-${PAGE_ID} .pf-note-ok{background:color-mix(in srgb,#0a7c59 8%,var(--surface));border:1px solid color-mix(in srgb,#0a7c59 25%,var(--border));color:var(--text)}
  #page-${PAGE_ID} .pf-note-warn{background:color-mix(in srgb,#d97706 8%,var(--surface));border:1px solid color-mix(in srgb,#d97706 25%,var(--border));color:var(--text)}
  #page-${PAGE_ID} .pf-hint{font-size:11.5px;color:var(--muted);line-height:1.95;padding:0 4px 12px}
  #page-${PAGE_ID} .pf-muted{color:var(--muted);font-weight:400}
  #page-${PAGE_ID} .pf-grps{display:flex;flex-direction:column;gap:11px}
  #page-${PAGE_ID} .pf-grp{border:1px solid var(--border);border-radius:12px;padding:12px 13px;background:var(--surface)}
  #page-${PAGE_ID} .pf-grp-head{display:flex;align-items:center;gap:11px}
  #page-${PAGE_ID} .pf-grp-no{width:26px;height:26px;flex:0 0 auto;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;background:color-mix(in srgb,var(--primary) 10%,var(--surface));color:var(--primary);border:1px solid color-mix(in srgb,var(--primary) 20%,var(--border))}
  #page-${PAGE_ID} .pf-grp-name{font-weight:800;font-size:13.5px;line-height:1.5}
  #page-${PAGE_ID} .pf-grp-meta{font-size:11px;color:var(--muted);margin-top:2px}
  #page-${PAGE_ID} .pf-grp-w{font-weight:900;font-size:20px;color:var(--primary);flex:0 0 auto;line-height:1}
  #page-${PAGE_ID} .pf-grp-w span{font-size:11px;font-weight:800;opacity:.7}
  #page-${PAGE_ID} .pf-bar{height:6px;border-radius:99px;background:var(--surface2);overflow:hidden;margin:10px 0 9px}
  #page-${PAGE_ID} .pf-bar-fill{height:100%;border-radius:99px;background:var(--primary);max-width:100%}
  #page-${PAGE_ID} .pf-grp-src,#page-${PAGE_ID} .pf-grp-gap{display:flex;gap:7px;align-items:flex-start;font-size:11.5px;line-height:1.8}
  #page-${PAGE_ID} .pf-grp-src{color:var(--muted)}
  #page-${PAGE_ID} .pf-grp-gap{color:#a06010;margin-top:3px}
  #page-${PAGE_ID} .pf-grp-src svg,#page-${PAGE_ID} .pf-grp-gap svg{flex:0 0 auto;margin-top:3px}
  #page-${PAGE_ID} .pf-tbl-wrap{overflow-x:auto;margin-top:14px}
  #page-${PAGE_ID} .pf-tbl{width:100%;border-collapse:collapse;font-size:12px;min-width:420px}
  #page-${PAGE_ID} .pf-tbl th,#page-${PAGE_ID} .pf-tbl td{padding:8px 10px;text-align:center;border-bottom:1px solid var(--border);white-space:nowrap}
  #page-${PAGE_ID} .pf-tbl th{font-weight:800;color:var(--muted);font-size:11px;background:var(--surface2)}
  #page-${PAGE_ID} .pf-th-now,#page-${PAGE_ID} .pf-td-now{background:color-mix(in srgb,var(--primary) 10%,var(--surface));color:var(--primary);font-weight:900}
  #page-${PAGE_ID} .pf-steps{display:flex;flex-direction:column;gap:9px}
  #page-${PAGE_ID} .pf-step{display:flex;gap:11px;align-items:flex-start;border:1px solid var(--border);border-radius:11px;padding:11px 12px}
  #page-${PAGE_ID} .pf-step-done{background:color-mix(in srgb,#0a7c59 6%,var(--surface));border-color:color-mix(in srgb,#0a7c59 22%,var(--border))}
  #page-${PAGE_ID} .pf-step-n{width:25px;height:25px;flex:0 0 auto;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:11.5px;background:var(--surface2);color:var(--muted);border:1px solid var(--border)}
  #page-${PAGE_ID} .pf-step-done .pf-step-n{background:#0a7c59;color:#fff;border-color:#0a7c59}
  #page-${PAGE_ID} .pf-step-t{font-weight:800;font-size:13px;display:flex;align-items:center;gap:7px;flex-wrap:wrap}
  #page-${PAGE_ID} .pf-step-d{font-size:11.5px;color:var(--muted);line-height:1.85;margin-top:3px}
  #page-${PAGE_ID} .pf-badge-ok{font-size:9.5px;font-weight:800;color:#0a7c59;background:color-mix(in srgb,#0a7c59 12%,var(--surface));border:1px solid color-mix(in srgb,#0a7c59 30%,var(--border));border-radius:99px;padding:2px 8px}
  #page-${PAGE_ID} .pf-badge-wait{font-size:9.5px;font-weight:800;color:var(--muted);background:var(--surface2);border:1px solid var(--border);border-radius:99px;padding:2px 8px}
  #page-${PAGE_ID} .pf-note-trial{background:color-mix(in srgb,#d97706 12%,var(--surface));border:1px solid color-mix(in srgb,#d97706 38%,var(--border));color:var(--text)}
  #page-${PAGE_ID} .pf-tag{font-size:9px;font-weight:800;color:#7a4a06;background:#fef3c7;border:1px solid #fcd34d;border-radius:99px;padding:1px 7px;vertical-align:middle}
  #page-${PAGE_ID} .pf-covs{display:flex;flex-direction:column;gap:13px}
  #page-${PAGE_ID} .pf-cov-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:7px}
  #page-${PAGE_ID} .pf-cov-l{font-weight:800;font-size:12.5px}
  #page-${PAGE_ID} .pf-cov-v{font-weight:900;font-size:18px;line-height:1}
  #page-${PAGE_ID} .pf-cov-h{font-size:10.5px;color:var(--muted);margin-top:5px;line-height:1.8}
  #page-${PAGE_ID} .pf-cov-foot{font-size:11.5px;color:var(--muted);margin-top:14px;padding-top:11px;border-top:1px solid var(--border);display:flex;align-items:center;gap:7px;flex-wrap:wrap}
  #page-${PAGE_ID} .pf-empty{text-align:center;padding:48px 20px;color:var(--muted)}
  #page-${PAGE_ID} .pf-empty-t{font-weight:800;font-size:15px;margin-bottom:7px;color:var(--text)}
  #page-${PAGE_ID} .pf-empty-s{font-size:12.5px;line-height:1.9}
  @media(max-width:520px){
    #page-${PAGE_ID} .pf-grp-w{font-size:17px}
    #page-${PAGE_ID} .pf-grp-name{font-size:12.5px}
  }`;
  document.head.appendChild(st);
}

/* ════════════════════════════════════════════════════════════
   التركيب الذاتي: صفحة + زرّ قائمة جانبية + لفّ showPage
   ════════════════════════════════════════════════════════════ */
function ensurePage(){
  injectCSS();
  if(document.getElementById("page-"+PAGE_ID)) return;
  const anyPage=document.querySelector(".page");
  const host=anyPage ? anyPage.parentElement : document.body;
  const div=document.createElement("div");
  div.className="page"; div.id="page-"+PAGE_ID;
  host.appendChild(div);
}

/* زرّ القائمة الجانبية — لمشاريع عقد الأداء وحدها.
   يُحقن بعد applyPermissions فلا تحجبه النواة؛ نقرأ حاجبها بأنفسنا كما تفعل وحدة النظافة. */
function injectSidebarButton(){
  const blocked = (window._blockedPages && typeof window._blockedPages.has==="function")
    ? window._blockedPages.has(PAGE_ID) : false;
  const shouldShow = canView() && _isPerf() && !blocked;
  const existing=document.getElementById("nav-performance-btn");
  if(!shouldShow){ if(existing) existing.remove(); return; }
  if(existing) return;
  const nav=document.querySelector(".sidebar-nav");
  if(!nav) return;
  // مكانُه الطبيعي: داخل مجموعة «الأداء» بجوار «مؤشرات الأداء» — لا زرَّاً عائماً
  // في جذر القائمة. فيرث سلوكَ الطيّ والتنسيق (sidebar-child) كبقية أبناء المجموعة،
  // ومجموعةُ الطيّ تقيس ارتفاعها بـ scrollHeight فتتّسع للزرّ الجديد تلقائياً.
  const anchor = nav.querySelector('.sidebar-nav-btn[data-page="kpi"]')
              || nav.querySelector('.sidebar-nav-btn[data-page="dashboard"]');
  const btn=document.createElement("button");
  btn.className = "sidebar-nav-btn" + (anchor && anchor.classList.contains("sidebar-child") ? " sidebar-child" : "");
  btn.id="nav-performance-btn";
  btn.dataset.page=PAGE_ID;
  btn.innerHTML='<span class="s-icon">'+_svg("barChart")+'</span> تقييم الأداء';
  btn.onclick=()=>{ try{ showPage(PAGE_ID); }catch(e){} };
  /* ★ الإدراج نسبةً إلى **والد المرساة** لا إلى nav.
     أزرارُ القائمة ليست كلها أبناءً مباشرين لـ .sidebar-nav — أكثرها داخل
     مجموعاتٍ (#grp-*)، و`nav.insertBefore(btn, anchor.nextSibling)` بعقدةٍ ليست
     ابناً مباشراً يرمي NotFoundError فيسقط الحقنُ كلُّه صامتاً (رُصد في فحص
     المتصفّح: الزرّ لم يظهر إطلاقاً في مشروع الأداء). */
  try{
    if(anchor && anchor.parentNode) anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    else nav.insertBefore(btn, nav.firstChild);
  }catch(e){
    try{ nav.appendChild(btn); }catch(_e){}
  }
}

function hookShowPage(){
  if(window._pfHooked || typeof window.showPage!=="function") return;
  const orig=window.showPage;
  window.showPage=function(id){
    if(id===PAGE_ID && !(canView() && _isPerf())){
      try{ _toast("🔒 هذا القسم متاح لمشاريع «العقد القائم على الأداء» فقط","warn"); }catch(e){}
      return orig.apply(this, ["dashboard"]);
    }
    orig.apply(this, arguments);
    if(id===PAGE_ID){
      const pg=document.getElementById("page-"+PAGE_ID);
      if(!pg) return;
      // النواة لا تعرف صفحتنا فلا تُفعّلها — نُفعّلها نحن (ونطفئ البقية)
      document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
      pg.classList.add("active");
      document.querySelectorAll(".sidebar-nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.page===PAGE_ID));
      render();
    }
  };
  window._pfHooked=true;
}

/* تبديلُ المشروع يعيد تقييم البوّابة: مشروعٌ تقليديٌّ يُزيل الزرّ، وقائمٌ على الأداء يُعيده.
   وإن كنّا واقفين على الصفحة حين تبديلٍ إلى مشروعٍ تقليديّ نغادرها فوراً — فلا تبقى
   شاشةُ عقدٍ لا ينتمي للمشروع الحالي معروضةً. */
function _watchProject(){
  let last=_projId(), lastPerf=_isPerf();
  setInterval(()=>{
    const cur=_projId(), curPerf=_isPerf();
    if(cur!==last || curPerf!==lastPerf){
      last=cur; lastPerf=curPerf;
      injectSidebarButton();
      const pg=document.getElementById("page-"+PAGE_ID);
      if(pg && pg.classList.contains("active")){
        if(curPerf) render();
        else { try{ showPage("dashboard"); }catch(e){} }
      }
    }
  }, 1200);
}

function init(){
  ensurePage();
  hookShowPage();
  injectSidebarButton();
  _watchProject();
  // القائمة الجانبية تُعاد بناؤها بعد الدخول/تبديل المشروع — نُعيد الحقن بعد استقرارها
  [400, 1200, 2500].forEach(ms=> setTimeout(()=>{ try{ injectSidebarButton(); }catch(e){} }, ms));
  const nav=document.querySelector(".sidebar-nav");
  if(nav && typeof MutationObserver==="function"){
    const obs=new MutationObserver(()=>{ try{ injectSidebarButton(); }catch(e){} });
    obs.observe(nav,{childList:true});
  }
}

if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
else init();

window.performanceContract = {
  render,
  isActive: _isPerf,
  groups: GROUPS,
  yearTarget,
  penaltyScale: PENALTY_SCALE,
  version: VERSION,
  build: MODULE_BUILD
};

})();
