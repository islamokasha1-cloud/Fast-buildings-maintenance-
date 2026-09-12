/* ═══════════════════════════════════════════════════════════════════════════
   kpi-trend-chart.js — المؤشراتُ شهراً بشهر، كلُّ مؤشرٍ مقابلَ هدفه

   ── المشكلة ──
   بطاقاتُ المؤشرات تقول رقمَ هذا الشهر وسهماً عن الماضي — شهران لا أكثر. والسؤالُ
   أمام الجهة «كيف كان الأداءُ عبر أشهر العقد؟» لا جوابَ له في شاشة.
   والمحاولةُ الأولى (ستّةُ خطوطٍ ملوّنةٍ في رسمٍ واحد) رُفضت: قيمُ المؤشرات كلُّها بين
   80 و100 فتتكدّس الخطوطُ الستّة في شريطٍ واحدٍ أعلى الرسم، ويحتاج القارئُ إلى فكّ
   ستّة ألوانٍ من مفتاحٍ ليعرف أيَّ خطٍّ يقرأ — والمالكُ حكم: «غير مفهوم أبداً».

   ── المبدأ ──
   **لا لونَ للهويّة، اللونُ للحكم.** كلُّ مؤشرٍ لوحةٌ خاصّةٌ به — الاسمُ مكتوبٌ فوقها فلا
   يحتاج لوناً — وفيها عمودٌ لكلّ شهرٍ ورقمُه فوقه، وخطُّ الهدف يقطع اللوحة. فاللونُ
   الوحيدُ في الصفحة يقول شيئاً واحداً: **حقّق الهدف أم لا** — بثلاثيّة الحالة نفسِها
   التي تلبسها المنصّةُ في كلّ مكان (`--sla-ok` · `--sla-warn` · `--sla-crit`).
   والنقصُ عن الهدف يُرسم قطعةً مظلّلةً فوق العمود القصير: **هذا ما كان ناقصاً**.
   **المصدرُ نفسُه الذي تقرؤه البطاقات:** كلُّ عمودٍ `kpiMonthStats(list, ym)` من
   `sla-engine.js`، والأهدافُ هي أهدافُ البطاقات حرفياً (hail-tests يطابقها).
   وKPI-07 خارجُ الرسم: حالةٌ لحظيةٌ لا تاريخَ لها.

   ── القرارات ──
   • **النافذةُ من أوّل شهرٍ فيه بيانات** إلى شهر اليوم (4 أشهرٍ على الأقلّ، 12 على
     الأكثر) — لا اثنا عشر شهراً ثابتةً ثلثاها فراغ.
   • الزمنُ يجري كما تجري الصفحة: الأقدمُ يميناً والأحدثُ يساراً، **والرقمُ الكبيرُ
     لشهر اليوم يجلس فوق عمودِه** (يسارَ اللوحة كما في بطاقات المؤشرات).
   • شهرٌ بلا مقام: عمودٌ فارغٌ و«—» — لا صفر.
   • تلميحٌ عند كلّ عمود (البسط ÷ المقام) بلوحة المفاتيح والمؤشّر سواء، وجدولٌ بديل.
   • الأعمدةُ تنمو عند الرسم كأشرطة البطاقات، وتسكن مع `prefers-reduced-motion`.

   ── الاستقلال ──
   IIFE يعرّض `window.kpiTrendChart` وحدَه: `series()` و`status()` نقيّتان يفحصهما
   hail-tests بلا متصفّح، و`render(id)` تقرأ خدماتِ النواة بالاسم (`allTickets` ·
   `isOperationTicket` · `kpiMonthStats` · `esc`).
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
"use strict";

const MODULE_BUILD = "v18.9.3179";
const MAX_MONTHS = 12, MIN_MONTHS = 4;
const RESPONSE_TARGET_H = 8;   // كما في بطاقة KPI-02
const NEAR_PTS = 10;           // «دون الهدف بقليل» = أقلّ من عشر نقاط

/* المؤشرات الستّة — الأهدافُ كما في بطاقات index.html (hail-tests يطابقها حرفياً)،
   والبسطُ والمقامُ من حقول kpiMonthStats نفسِها ليقول التلميحُ «38 من 40». */
const KPIS = [
  { key:"k01", code:"KPI-01", name:"طلبات الصيانة التصحيحية",                            target:90, num:"corrClosed",         den:"corrective", unit:"مغلقة من التصحيحية" },
  { key:"k02", code:"KPI-02", name:"سرعة الإغلاق (خلال "+RESPONSE_TARGET_H+" ساعات عمل)", target:80, num:"closedWithinTarget", den:"closedTix",  unit:"أُغلقت خلال الهدف" },
  { key:"k03", code:"KPI-03", name:"الالتزام بـ SLA",                                    target:90, num:"closedInSLA",        den:"closedTix",  unit:"داخل SLA من المغلقة" },
  { key:"k04", code:"KPI-04", name:"الإصلاح من أوّل مرّة",                               target:95, num:st=>st.closed-st.reopenedClosed, den:"closed", unit:"لم يُعَد فتحها" },
  { key:"k05", code:"KPI-05", name:"الالتزام بخطة الوقائية",                             target:80, num:"ppmOnTime",          den:"ppmDue",     unit:"أُنجزت في شهرها" },
  { key:"k06", code:"KPI-06", name:"الإنجاز الإجمالي",                                   target:90, num:"closed",             den:"n",          unit:"مغلقة من البلاغات" }
];
const STATUS_TEXT = { ok:"حقّق الهدف", warn:"دون الهدف بقليل", crit:"دون الهدف", none:"لا بيانات" };

function _ymOf(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); }
function _label(ym){
  const [y,m]=ym.split("-").map(Number);
  const d=new Date(y,m-1,1);
  const mon=d.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn",{month:"short"});
  return (m===1) ? mon+" "+y : mon;
}
function _full(ym){
  const [y,m]=ym.split("-").map(Number);
  return new Date(y,m-1,1).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn",{year:"numeric",month:"long"});
}

/* ── النقيّة: حكمُ الشهر — اللونُ الوحيدُ في الرسم ── */
function status(pct, target){
  if(pct==null || !isFinite(pct)) return "none";
  if(pct>=target) return "ok";
  if(pct>=target-NEAR_PTS) return "warn";
  return "crit";
}

/* ── النقيّة: النافذةُ الشهرية، كلُّ نقطةٍ من kpiMonthStats ──
   تُرجع { months:[{ym,label,full}], series:[{key,code,name,target,unit,values:[pct|null],counts:[{num,den}|null]}], n } */
function series(list, opts){
  opts=opts||{};
  const now=opts.now?new Date(opts.now):new Date();
  const cand=[];
  for(let i=MAX_MONTHS-1;i>=0;i--){
    const ym=_ymOf(new Date(now.getFullYear(), now.getMonth()-i, 1));
    cand.push({ ym, label:_label(ym), full:_full(ym) });
  }
  // تُقرأ عبر window صراحةً: في المتصفّح الاسمُ عالميٌّ، وفي hail-tests (Node) لا يوجد إلا على window
  const _stats=(typeof kpiMonthStats==="function")?kpiMonthStats:(typeof window!=="undefined"?window.kpiMonthStats:null);
  const stats=cand.map(m=>(typeof _stats==="function")?_stats(list||[], m.ym, { responseTargetH:RESPONSE_TARGET_H }):null);
  const den=(st,k)=>st?(st[k.den]||0):0;
  // أوّلُ شهرٍ فيه مقامٌ لأيّ مؤشر — ومنه تبدأ النافذة (وأربعةُ أشهرٍ على الأقلّ)
  let first=cand.length;
  for(let i=0;i<cand.length;i++){ if(KPIS.some(k=>den(stats[i],k)>0)){ first=i; break; } }
  first=Math.min(first, cand.length-MIN_MONTHS);
  const months=cand.slice(first), S=stats.slice(first);
  return {
    months,
    series: KPIS.map(k=>({ key:k.key, code:k.code, name:k.name, target:k.target, unit:k.unit,
      values: S.map(st=>{ const v=st?st.rates[k.key]:null; return (v==null||!isFinite(v))?null:v; }),
      counts: S.map(st=>{ if(!st) return null; const d=den(st,k); if(!d) return null;
        const nm=(typeof k.num==="function")?k.num(st):st[k.num]; return { num:nm||0, den:d }; })
    })),
    n: S.reduce((a,st)=>a+(st?st.n:0),0)
  };
}

/* ── الرسم — رموزُ المنصّة نفسُها (app.css) مع احتياطٍ إن غابت ── */
const STYLE = `
.ktc-root{--ktc-ok:var(--sla-ok,#0a7c59);--ktc-warn:var(--sla-warn,#c26a06);--ktc-crit:var(--sla-crit,#dc2626);
  --ktc-none:var(--zero,#a3b0c2);--ktc-mono:'JetBrains Mono',ui-monospace,monospace;color:var(--text,#1a202c)}
.ktc-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin-bottom:12px}
.ktc-period{font-size:11.5px;font-weight:800;color:var(--muted,#64748b)}
.ktc-period b{color:var(--text,#1a202c)}
.ktc-legend{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:10.5px;font-weight:700;color:var(--muted,#64748b);margin-inline-start:auto}
.ktc-lg{display:inline-flex;align-items:center;gap:5px}
.ktc-lg i{display:inline-block;width:12px;height:12px;border-radius:3px}
.ktc-lg.ok i{background:var(--ktc-ok)}.ktc-lg.warn i{background:var(--ktc-warn)}.ktc-lg.crit i{background:var(--ktc-crit)}
.ktc-lg.tgt i{width:16px;height:0;border-top:2px dashed var(--primary,#1b3a6b);border-radius:0}
.ktc-btn{font:inherit;font-size:11px;font-weight:800;color:var(--primary,#1b3a6b);background:var(--surface,#fff);
  border:1.5px solid var(--border,#dde3ed);border-radius:8px;padding:4px 10px;cursor:pointer}
.ktc-btn[aria-pressed="true"]{background:var(--primary,#1b3a6b);color:#fff;border-color:var(--primary,#1b3a6b)}
.ktc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
@media(max-width:900px){.ktc-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:560px){.ktc-grid{grid-template-columns:1fr}}
.ktc-panel{background:var(--surface,#fff);border:1px solid var(--border,#dde3ed);border-radius:14px;padding:12px 14px 10px;
  box-shadow:var(--shadow,0 1px 4px rgba(0,0,0,.07));border-inline-start:4px solid var(--ktc-none);display:flex;flex-direction:column;gap:8px;min-width:0}
.ktc-panel.st-ok{border-inline-start-color:var(--ktc-ok)}.ktc-panel.st-warn{border-inline-start-color:var(--ktc-warn)}.ktc-panel.st-crit{border-inline-start-color:var(--ktc-crit)}
.ktc-ph{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.ktc-name{font-size:12.5px;font-weight:800;line-height:1.4}
.ktc-code{font-size:9.5px;color:var(--muted,#64748b);font-family:var(--ktc-mono);margin-top:3px}
.ktc-now{text-align:left;flex-shrink:0}
.ktc-val{font-size:24px;font-weight:900;line-height:1;font-family:var(--ktc-mono);font-variant-numeric:tabular-nums;color:var(--ktc-none)}
.ktc-val.st-ok{color:var(--ktc-ok)}.ktc-val.st-warn{color:var(--ktc-warn)}.ktc-val.st-crit{color:var(--ktc-crit)}
.ktc-delta{font-size:9.5px;font-weight:800;margin-top:3px;color:var(--muted,#64748b)}
.ktc-delta.up{color:var(--ktc-ok)}.ktc-delta.down{color:var(--ktc-crit)}
.ktc-plot{position:relative;height:150px;margin-top:2px}
.ktc-area{position:absolute;inset:16px 0 18px 0}
.ktc-base{position:absolute;left:0;right:0;bottom:0;border-top:1px solid var(--border,#dde3ed)}
.ktc-target{position:absolute;left:0;right:0;border-top:2px dashed var(--primary,#1b3a6b);opacity:.55;pointer-events:none}
.ktc-cols{position:absolute;inset:0;display:flex;gap:4px}
.ktc-col{flex:1;position:relative;min-width:0;cursor:default;border-radius:6px}
.ktc-col:focus-visible{outline:2px solid var(--primary,#1b3a6b);outline-offset:0}
.ktc-col:hover .ktc-bar,.ktc-col:focus-visible .ktc-bar{filter:brightness(1.12)}
.ktc-stack{position:absolute;left:18%;right:18%;top:16px;bottom:18px}
.ktc-bar{position:absolute;left:0;right:0;bottom:0;height:0;border-radius:4px 4px 0 0;background:var(--ktc-none);transition:height .7s ease}
.ktc-bar.st-ok{background:var(--ktc-ok)}.ktc-bar.st-warn{background:var(--ktc-warn)}.ktc-bar.st-crit{background:var(--ktc-crit)}
.ktc-bar.st-none{height:2px!important;border-radius:1px;opacity:.6}
.ktc-gap{position:absolute;left:0;right:0;opacity:.35;border-radius:3px 3px 0 0;
  background:repeating-linear-gradient(135deg,var(--_g) 0 2px,transparent 2px 6px)}
.ktc-gap.st-warn{--_g:var(--ktc-warn)}.ktc-gap.st-crit{--_g:var(--ktc-crit)}
.ktc-v{position:absolute;left:-30%;right:-30%;text-align:center;font-size:10.5px;font-weight:800;font-family:var(--ktc-mono);font-variant-numeric:tabular-nums;line-height:1;transition:bottom .7s ease}
.ktc-v.st-none{color:var(--ktc-none)}
.ktc-m{position:absolute;left:0;right:0;bottom:0;text-align:center;font-size:10px;font-weight:700;color:var(--muted,#64748b);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ktc-col.cur .ktc-m{color:var(--text,#1a202c);font-weight:900}
.ktc-tip{position:absolute;z-index:5;display:none;min-width:180px;max-width:260px;background:var(--surface,#fff);color:var(--text,#1a202c);
  border:1px solid var(--border,#dde3ed);border-radius:10px;padding:8px 10px;box-shadow:0 8px 24px rgba(0,0,0,.14);font-size:11px;line-height:1.6;pointer-events:none}
.ktc-tip b{display:block;font-size:12px}
.ktc-tip strong{font-family:var(--ktc-mono);font-variant-numeric:tabular-nums}
.ktc-tip .st{font-weight:800}.ktc-tip .st-ok{color:var(--ktc-ok)}.ktc-tip .st-warn{color:var(--ktc-warn)}.ktc-tip .st-crit{color:var(--ktc-crit)}.ktc-tip .st-none{color:var(--muted,#64748b)}
.ktc-tablewrap{overflow-x:auto;margin-top:12px}
.ktc-table{width:100%;border-collapse:collapse;font-size:11.5px}
.ktc-table th,.ktc-table td{padding:6px 8px;border-bottom:1px solid var(--border,#dde3ed);text-align:center;white-space:nowrap}
.ktc-table th{font-weight:800;color:var(--muted,#64748b);background:var(--surface2,#f4f7fb)}
.ktc-table th:first-child,.ktc-table td:first-child{text-align:right;font-weight:800}
.ktc-table td{font-family:var(--ktc-mono);font-variant-numeric:tabular-nums}
.ktc-table td small{display:block;font-family:inherit;font-size:9.5px;color:var(--muted,#64748b)}
.ktc-table td.st-ok{color:var(--ktc-ok)}.ktc-table td.st-warn{color:var(--ktc-warn)}.ktc-table td.st-crit{color:var(--ktc-crit)}.ktc-table td.st-none{color:var(--ktc-none)}
.ktc-note{font-size:10.5px;color:var(--muted,#64748b);font-weight:700;margin-top:10px;line-height:1.7}
@media(prefers-reduced-motion:reduce){.ktc-bar,.ktc-v{transition:none}}
`;
let _cssDone=false;
function _ensureCss(){ if(_cssDone) return; const st=document.createElement("style"); st.textContent=STYLE; document.head.appendChild(st); _cssDone=true; }

function render(id){
  const host=document.getElementById(id); if(!host) return;
  _ensureCss();
  const list=allTickets().filter(t=>!isOperationTicket(t));
  const data=series(list);
  const n=data.months.length, last=n-1;
  const P=v=>v==null?"—":v+"%";
  const E=esc;

  const panels=data.series.map((s,si)=>{
    const cur=s.values[last], prev=n>1?s.values[last-1]:null, st=status(cur,s.target);
    const d=(cur==null||prev==null)?null:cur-prev;
    const delta=d==null?`<div class="ktc-delta">—</div>`
      :d>0?`<div class="ktc-delta up">&#x25B2; \u2066+${d}\u2069 نقطة عن الشهر الماضي</div>`
      :d<0?`<div class="ktc-delta down">&#x25BC; \u2066${d}\u2069 نقطة عن الشهر الماضي</div>`
      :`<div class="ktc-delta">= الشهر الماضي</div>`;
    const cols=data.months.map((m,i)=>{
      const v=s.values[i], c=s.counts[i], cs=status(v,s.target);
      const gap=(v!=null&&v<s.target)?`<div class="ktc-gap st-${cs}" style="bottom:${v}%;height:${s.target-v}%"></div>`:"";
      const aria=`${m.full}: ${P(v)}${c?` — ${c.num} من ${c.den} ${s.unit}`:""} — ${STATUS_TEXT[cs]}`;
      return `<div class="ktc-col${i===last?" cur":""}" tabindex="0" role="img" data-ktc-bar data-si="${si}" data-mi="${i}" aria-label="${E(aria)}">
        <div class="ktc-stack">${gap}<div class="ktc-bar st-${cs}" data-h="${v==null?0:v}"></div>
          <div class="ktc-v st-${cs}" data-h="${v==null?0:v}" style="bottom:4px">${P(v)}</div></div>
        <div class="ktc-m">${E(m.label)}</div>
      </div>`;
    }).join("");
    return `<section class="ktc-panel st-${st}" aria-label="${E(s.code+" "+s.name)}">
      <div class="ktc-ph">
        <div><div class="ktc-name">${E(s.name)}</div><div class="ktc-code">${E(s.code)} · الهدف ${s.target}%</div></div>
        <div class="ktc-now"><div class="ktc-val st-${st}">${P(cur)}</div>${delta}</div>
      </div>
      <div class="ktc-plot">
        <div class="ktc-area"><div class="ktc-base"></div><div class="ktc-target" style="bottom:${s.target}%"></div></div>
        <div class="ktc-cols">${cols}</div>
      </div>
    </section>`;
  }).join("");

  const table=`<table class="ktc-table"><thead><tr><th>الشهر</th>${data.series.map(s=>`<th>${E(s.code)}<small style="display:block;font-weight:700">هدف ${s.target}%</small></th>`).join("")}</tr></thead><tbody>${
    data.months.map((m,i)=>`<tr><td>${E(m.full)}</td>${data.series.map(s=>{ const v=s.values[i], c=s.counts[i];
      return `<td class="st-${status(v,s.target)}">${P(v)}${c?`<small>\u2066${c.num} / ${c.den}\u2069</small>`:""}</td>`; }).join("")}</tr>`).join("")
  }</tbody></table>`;

  host.innerHTML=`<div class="ktc-root">
    <div class="ktc-head">
      <div class="ktc-period">الفترة: <b>${E(data.months[0].full)}</b> – <b>${E(data.months[last].full)}</b> · ${n} أشهر</div>
      <div class="ktc-legend">
        <span class="ktc-lg ok"><i></i> حقّق الهدف</span>
        <span class="ktc-lg warn"><i></i> دون الهدف بأقلّ من ${NEAR_PTS} نقاط</span>
        <span class="ktc-lg crit"><i></i> دون الهدف</span>
        <span class="ktc-lg tgt"><i></i> خطُّ الهدف</span>
      </div>
      <button type="button" class="ktc-btn" aria-pressed="false" data-ktc-toggle>جدول</button>
    </div>
    <div class="ktc-grid">${panels}</div>
    <div class="ktc-tip" data-ktc-tip role="status" aria-live="polite"></div>
    <div class="ktc-tablewrap" data-ktc-table hidden>${table}</div>
    <div class="ktc-note">كلُّ عمودٍ نسبةُ شهره من الدالّة نفسِها التي تحسب بطاقات المؤشرات (kpiMonthStats)، والقطعةُ المظلّلةُ فوق العمود القصير هي ما نقص عن الهدف. الشهرُ بلا بلاغاتٍ يُترك فارغاً (—) لا صفراً. وKPI-07 (المتأخّر الآن) حالةٌ لحظيةٌ فلا يُرسم شهرياً.</div>
  </div>`;

  // الأعمدةُ تنمو بعد الرسم — كأشرطة البطاقات
  const root=host.querySelector(".ktc-root");
  requestAnimationFrame(()=>{ root.querySelectorAll(".ktc-bar[data-h]").forEach(b=>{ b.style.height=b.dataset.h+"%"; });
    root.querySelectorAll(".ktc-v[data-h]").forEach(l=>{ l.style.bottom="calc("+l.dataset.h+"% + 4px)"; }); });

  // ── التلميح: عمودٌ واحد — الشهرُ، القيمةُ، البسطُ ÷ المقام، الحكم ──
  const tip=root.querySelector("[data-ktc-tip]");
  function show(col){
    const s=data.series[+col.dataset.si], i=+col.dataset.mi, m=data.months[i], v=s.values[i], c=s.counts[i], cs=status(v,s.target);
    tip.textContent="";
    const b=document.createElement("b"); b.textContent=m.full+" · "+s.code; tip.appendChild(b);
    const l1=document.createElement("div"); const st=document.createElement("strong"); st.textContent=P(v); l1.appendChild(st);
    const nm=document.createElement("span"); nm.textContent=c?(" — "+c.num+" من "+c.den+" "+s.unit):" — لا مقامَ هذا الشهر"; l1.appendChild(nm); tip.appendChild(l1);
    const l2=document.createElement("div"); l2.className="st st-"+cs; l2.textContent=STATUS_TEXT[cs]+" · الهدف "+s.target+"%"; tip.appendChild(l2);
    tip.style.display="block";
    const rr=root.getBoundingClientRect(), cr=col.getBoundingClientRect();
    let left=cr.left-rr.left+cr.width/2-tip.offsetWidth/2;
    left=Math.max(4, Math.min(left, rr.width-tip.offsetWidth-4));
    let top=cr.top-rr.top-tip.offsetHeight-6; if(top<0) top=cr.bottom-rr.top+6;
    tip.style.left=left+"px"; tip.style.top=top+"px";
  }
  function hide(){ tip.style.display="none"; }
  root.querySelectorAll("[data-ktc-bar]").forEach(col=>{
    col.addEventListener("pointerenter",()=>show(col));
    col.addEventListener("pointerleave",hide);
    col.addEventListener("focus",()=>show(col));
    col.addEventListener("blur",hide);
    col.addEventListener("keydown",ev=>{ if(ev.key==="Escape") hide(); });
  });
  const btn=root.querySelector("[data-ktc-toggle]"), tbl=root.querySelector("[data-ktc-table]");
  btn.addEventListener("click",()=>{ const on=tbl.hidden; tbl.hidden=!on; btn.setAttribute("aria-pressed",on?"true":"false"); btn.textContent=on?"إخفاء الجدول":"جدول"; });
}

window.kpiTrendChart = { build: MODULE_BUILD, MAX_MONTHS, MIN_MONTHS, KPIS: KPIS.map(k=>({ key:k.key, code:k.code, name:k.name, target:k.target })), status, series, render };
})();
