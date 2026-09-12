/* ═══════════════════════════════════════════════════════════════════════════
   kpi-trend-chart.js — المقارنةُ الشهريةُ للمؤشرات الستّة في رسمٍ واحد

   ── المشكلة ──
   بطاقاتُ المؤشرات تقول رقمَ هذا الشهر وسهماً عن الماضي — شهران لا أكثر. والسؤالُ
   الذي تُسأل عنه أمام الجهة «كيف كان الاتجاهُ عبر العقد؟» لا جوابَ له في شاشة:
   المقارنةُ الشهريةُ القائمة تُقارن شهراً بسابقه، لا اثني عشر شهراً في نظرةٍ واحدة.

   ── المبدأ ──
   **المصدرُ نفسُه الذي تقرؤه البطاقات.** كلُّ نقطةٍ هنا هي `kpiMonthStats(list, ym)`
   من `sla-engine.js` — الدالّةُ التي تحسب رقمَ البطاقة — لشهرٍ من الاثني عشر الماضية.
   فلا يظهر رقمان لشهرٍ واحد. وKPI-07 **خارجُ الرسم**: حالةٌ لحظيةٌ لا تاريخَ لها.

   ── الشكل (على طريقة dataviz) ──
   • خطٌّ لكلّ مؤشّر بسُمك 2px، وعلاماتٌ 8px، وشبكةٌ شعريةٌ 1px مصمتة، ومحورٌ واحد 0–100.
   • الألوانُ **بترتيبٍ ثابت** لا يدور — الفتحاتُ الستُّ الأولى من لوحةٍ فُحصت للفصل عند
     عمى الألوان على سطح التطبيق فاتحاً (#fff) وداكناً (#1a2433). والنصُّ لا يلبس لونَ
     الخطّ أبداً: المفتاحُ الملوَّنُ بجوار النصّ يحمل الهويّة.
   • مفتاحٌ دائم (ستّ سلاسل) + تسميةٌ مباشرةٌ عند طرف كلّ خطّ + جدولٌ بديلٌ — فالهويّةُ
     والقيمةُ لا تعتمدان على اللون ولا على التمرير.
   • خطُّ تتبّعٍ يقفز إلى أقرب شهرٍ وتلميحٌ يعرض السلاسلَ الستَّ عنده — القيمةُ أوّلاً
     ثم الاسم. وبالأسهم من لوحة المفاتيح مثلُه.
   • الزمنُ يجري كما تجري الصفحة (من اليمين): الأقدمُ يميناً والأحدثُ يساراً — كما في
     رسم النشاط اليوميّ في الصفحة نفسِها.
   • شهرٌ بلا مقام = فجوةٌ في الخطّ لا صفر.

   ── الاستقلال ──
   IIFE يعرّض `window.kpiTrendChart` وحدَه: `series()` نقيّةٌ يفحصها hail-tests بلا
   متصفّح، و`render(id)` تقرأ خدماتِ النواة بالاسم (`allTickets` · `isOperationTicket`
   · `kpiMonthStats` · `_ym` · `esc`).
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
"use strict";

const MODULE_BUILD = "v18.9.3176";
const MONTHS = 12;

/* الفتحاتُ الستُّ — ترتيبٌ ثابتٌ مفحوص (dataviz palette.md · validate_palette.js) */
const SERIES = [
  { key:"k01", code:"KPI-01", name:"التصحيحية",          light:"#2a78d6", dark:"#3987e5" },
  { key:"k02", code:"KPI-02", name:"سرعة الإغلاق",        light:"#eb6834", dark:"#d95926" },
  { key:"k03", code:"KPI-03", name:"الالتزام بـ SLA",     light:"#1baf7a", dark:"#199e70" },
  { key:"k04", code:"KPI-04", name:"الإصلاح من أوّل مرّة", light:"#eda100", dark:"#c98500" },
  { key:"k05", code:"KPI-05", name:"خطة الوقائية",        light:"#e87ba4", dark:"#d55181" },
  { key:"k06", code:"KPI-06", name:"الإنجاز الإجمالي",    light:"#008300", dark:"#008300" }
];

function _ymOf(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); }
function _label(ym){
  const [y,m]=ym.split("-").map(Number);
  const d=new Date(y,m-1,1);
  const mon=d.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn",{month:"short"});
  return (m===1) ? mon+" "+y : mon;
}

/* ── النقيّة: اثنا عشر شهراً تنتهي بشهر `now`، كلُّ نقطةٍ من kpiMonthStats ──
   تُرجع { months:[{ym,label}], series:[{key,code,name,values:[pct|null]}], n } */
function series(list, opts){
  opts=opts||{};
  const now=opts.now?new Date(opts.now):new Date();
  const months=[];
  for(let i=MONTHS-1;i>=0;i--){
    const d=new Date(now.getFullYear(), now.getMonth()-i, 1);
    const ym=_ymOf(d); months.push({ ym, label:_label(ym) });
  }
  // تُقرأ عبر window صراحةً: في المتصفّح الاسمُ عالميٌّ، وفي hail-tests (Node) لا يوجد إلا على window
  const _stats=(typeof kpiMonthStats==="function")?kpiMonthStats:(typeof window!=="undefined"?window.kpiMonthStats:null);
  if(typeof _stats!=="function") return { months, series:SERIES.map(s=>({ key:s.key, code:s.code, name:s.name, values:months.map(()=>null) })), n:0 };
  const stats=months.map(m=>_stats(list, m.ym, { responseTargetH:8 }));
  return {
    months,
    series: SERIES.map(s=>({ key:s.key, code:s.code, name:s.name,
      values: stats.map(st=>{ const v=st.rates[s.key]; return (v==null||!isFinite(v))?null:v; }) })),
    n: stats.reduce((a,st)=>a+st.n,0)
  };
}

/* ── الرسم ── */
const STYLE = `
.ktc-root{--ktc-surface:#fff;--ktc-grid:#e6ecf4;--ktc-text:#1a202c;--ktc-muted:#64748b;--ktc-line:#94a3b8;
  ${SERIES.map((s,i)=>`--ktc-s${i+1}:${s.light};`).join("")} position:relative;direction:rtl;font-family:inherit}
html[data-theme="dark"] .ktc-root{--ktc-surface:#1a2433;--ktc-grid:#2e3c52;--ktc-text:#e6edf7;--ktc-muted:#9fb0c8;--ktc-line:#7d8ea6;
  ${SERIES.map((s,i)=>`--ktc-s${i+1}:${s.dark};`).join("")}}
.ktc-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px}
.ktc-legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11px;color:var(--ktc-muted);font-weight:700}
.ktc-legend span{display:inline-flex;align-items:center;gap:6px}
.ktc-legend i{display:inline-block;width:16px;height:2px;border-radius:2px}
.ktc-btn{font:inherit;font-size:11px;font-weight:700;color:var(--ktc-muted);background:transparent;border:1px solid var(--ktc-grid);border-radius:8px;padding:4px 10px;cursor:pointer}
.ktc-btn[aria-pressed="true"]{color:var(--ktc-text);border-color:var(--ktc-line)}
.ktc-plot{position:relative;width:100%}
.ktc-plot svg{display:block;width:100%;height:auto;direction:ltr}
.ktc-plot:focus{outline:2px solid var(--ktc-line);outline-offset:2px;border-radius:8px}
.ktc-tip{position:absolute;top:8px;pointer-events:none;background:var(--ktc-surface);border:1px solid var(--ktc-grid);border-radius:10px;padding:8px 10px;font-size:11px;color:var(--ktc-text);box-shadow:0 6px 18px rgba(0,0,0,.12);min-width:150px;display:none;z-index:2}
.ktc-tip b{display:block;font-size:11px;color:var(--ktc-muted);margin-bottom:4px}
.ktc-tip div{display:flex;align-items:center;gap:6px;line-height:1.7}
.ktc-tip div i{width:12px;height:2px;border-radius:2px;flex:none}
.ktc-tip div strong{font-variant-numeric:tabular-nums;min-width:34px}
.ktc-tip div span{color:var(--ktc-muted)}
.ktc-table{width:100%;border-collapse:collapse;font-size:11px;margin-top:8px}
.ktc-table th,.ktc-table td{padding:5px 6px;border-bottom:1px solid var(--ktc-grid);text-align:center;font-variant-numeric:tabular-nums}
.ktc-table th:first-child,.ktc-table td:first-child{text-align:right;color:var(--ktc-muted)}
.ktc-note{font-size:10px;color:var(--ktc-muted);margin-top:6px}
`;
let _cssDone=false;
function _ensureCss(){ if(_cssDone) return; const st=document.createElement("style"); st.textContent=STYLE; document.head.appendChild(st); _cssDone=true; }

function _e(s){ try{ return (typeof esc==="function")?esc(s):String(s==null?"":s); }catch(e){ return String(s==null?"":s); } }

function render(id){
  const host=(typeof id==="string")?document.getElementById(id):id;
  if(!host) return;
  _ensureCss();
  const all=(typeof allTickets==="function"?allTickets():[]).filter(t=>t && !(typeof isOperationTicket==="function" && isOperationTicket(t)));
  const data=series(all);
  const W=900, H=300, padL=40, padR=64, padT=14, padB=34;   // padR: مكانُ التسميات المباشرة (الأحدثُ يساراً — لكنّ الـSVG بالاتجاه LTR فيُعكس)
  const n=data.months.length, iw=W-padL-padR, ih=H-padT-padB;
  // الزمنُ من اليمين: الفهرس 0 (الأقدم) في أقصى اليمين، والأحدثُ في أقصى اليسار
  const xOf=i=> padL + iw - (i/(n-1))*iw;
  const yOf=v=> padT + ih - (v/100)*ih;

  const gridLines=[0,25,50,75,100].map(v=>`<line x1="${padL}" x2="${W-padR}" y1="${yOf(v)}" y2="${yOf(v)}" stroke="var(--ktc-grid)" stroke-width="1"/>
     <text x="${W-padR+6}" y="${yOf(v)+4}" font-size="10" fill="var(--ktc-muted)" text-anchor="start">${v}%</text>`).join("");
  const xLabels=data.months.map((m,i)=>`<text x="${xOf(i)}" y="${H-10}" font-size="10" fill="var(--ktc-muted)" text-anchor="middle">${_e(m.label)}</text>`).join("");

  const paths=data.series.map((s,si)=>{
    let d="", pen=false;
    s.values.forEach((v,i)=>{ if(v==null){ pen=false; return; } d+=(pen?" L":" M")+xOf(i).toFixed(1)+" "+yOf(v).toFixed(1); pen=true; });
    const dots=s.values.map((v,i)=>v==null?"":`<circle cx="${xOf(i).toFixed(1)}" cy="${yOf(v).toFixed(1)}" r="4" fill="var(--ktc-s${si+1})" stroke="var(--ktc-surface)" stroke-width="2"/>`).join("");
    return `<g data-series="${s.key}"><path d="${d.trim()}" fill="none" stroke="var(--ktc-s${si+1})" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}</g>`;
  }).join("");

  // التسمياتُ المباشرة عند الطرف الأحدث (أقصى اليسار) — تُزاح رأسياً كي لا تتصادم
  const ends=data.series.map((s,si)=>{ let li=-1; for(let i=s.values.length-1;i>=0;i--){ if(s.values[i]!=null){ li=i; break; } }
    return li<0?null:{ si, v:s.values[li], y:yOf(s.values[li]), x:xOf(li) }; }).filter(Boolean).sort((a,b)=>a.y-b.y);
  for(let i=1;i<ends.length;i++){ if(ends[i].y-ends[i-1].y<12) ends[i].y=ends[i-1].y+12; }
  const endLabels=ends.map(e=>`<g><line x1="${padL-4}" x2="${padL-14}" y1="${e.y}" y2="${e.y}" stroke="var(--ktc-s${e.si+1})" stroke-width="2"/>
     <text x="${padL-17}" y="${e.y+3.5}" font-size="10" font-weight="700" fill="var(--ktc-text)" text-anchor="end" font-variant-numeric="tabular-nums">${e.v}%</text></g>`).join("");

  host.innerHTML=`<div class="ktc-root">
    <div class="ktc-head">
      <div class="ktc-legend">${data.series.map((s,si)=>`<span><i style="background:var(--ktc-s${si+1})"></i>${_e(s.code)} ${_e(s.name)}</span>`).join("")}</div>
      <button type="button" class="ktc-btn" aria-pressed="false" data-ktc-toggle>جدول</button>
    </div>
    <div class="ktc-plot" tabindex="0" role="img" aria-label="المقارنةُ الشهرية للمؤشرات الستّة عبر آخر ${n} شهراً">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
        ${gridLines}${xLabels}${paths}${endLabels}
        <line data-ktc-cross x1="0" x2="0" y1="${padT}" y2="${padT+ih}" stroke="var(--ktc-line)" stroke-width="1" visibility="hidden"/>
      </svg>
      <div class="ktc-tip" data-ktc-tip></div>
    </div>
    <table class="ktc-table" data-ktc-table hidden>
      <thead><tr><th>الشهر</th>${data.series.map(s=>`<th>${_e(s.code)}</th>`).join("")}</tr></thead>
      <tbody>${data.months.map((m,i)=>`<tr><td>${_e(m.label)}</td>${data.series.map(s=>`<td>${s.values[i]==null?"—":s.values[i]+"%"}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
    <div class="ktc-note">النقاطُ من الدالّة نفسِها التي تحسب بطاقاتِ المؤشرات (kpiMonthStats) — شهرٌ بلا مقامٍ فجوةٌ لا صفر. وKPI-07 حالةٌ لحظيةٌ فلا يُرسم.</div>
  </div>`;

  // ── التفاعل: خطُّ التتبّع يقفز إلى أقرب شهر، والتلميحُ يعرض السلاسلَ الستّ ──
  const plot=host.querySelector(".ktc-plot"), svg=plot.querySelector("svg"), cross=svg.querySelector("[data-ktc-cross]"), tip=host.querySelector("[data-ktc-tip]");
  let cur=-1;
  function show(i){
    if(i<0||i>=n){ cross.setAttribute("visibility","hidden"); tip.style.display="none"; cur=-1; return; }
    cur=i; const x=xOf(i);
    cross.setAttribute("x1",x); cross.setAttribute("x2",x); cross.setAttribute("visibility","visible");
    tip.textContent=""; const b=document.createElement("b"); b.textContent=data.months[i].label; tip.appendChild(b);
    data.series.forEach((s,si)=>{ const row=document.createElement("div"); const k=document.createElement("i"); k.style.background=`var(--ktc-s${si+1})`;
      const st=document.createElement("strong"); st.textContent=s.values[i]==null?"—":s.values[i]+"%"; const nm=document.createElement("span"); nm.textContent=s.code+" "+s.name;
      row.appendChild(k); row.appendChild(st); row.appendChild(nm); tip.appendChild(row); });
    tip.style.display="block";
    const rect=svg.getBoundingClientRect(), px=(x/W)*rect.width;
    // التلميحُ في الجهة الأبعد عن الحافة
    if(px>rect.width/2){ tip.style.left="auto"; tip.style.right=(rect.width-px+12)+"px"; } else { tip.style.right="auto"; tip.style.left=(px+12)+"px"; }
  }
  plot.addEventListener("pointermove",ev=>{ const rect=svg.getBoundingClientRect(); const vx=((ev.clientX-rect.left)/rect.width)*W;
    let best=0,bd=Infinity; for(let i=0;i<n;i++){ const d=Math.abs(xOf(i)-vx); if(d<bd){ bd=d; best=i; } } show(best); });
  plot.addEventListener("pointerleave",()=>show(-1));
  plot.addEventListener("keydown",ev=>{ if(ev.key==="ArrowLeft"){ ev.preventDefault(); show(Math.min(n-1,(cur<0?n-1:cur+1))); }   // يساراً = الأحدث
    else if(ev.key==="ArrowRight"){ ev.preventDefault(); show(Math.max(0,(cur<0?0:cur-1))); } else if(ev.key==="Escape"){ show(-1); } });
  plot.addEventListener("blur",()=>show(-1));
  const btn=host.querySelector("[data-ktc-toggle]"), table=host.querySelector("[data-ktc-table]");
  btn.addEventListener("click",()=>{ const on=table.hidden; table.hidden=!on; btn.setAttribute("aria-pressed",on?"true":"false"); btn.textContent=on?"إخفاء الجدول":"جدول"; });
}

window.kpiTrendChart = { build: MODULE_BUILD, MONTHS, SERIES: SERIES.map(s=>({ key:s.key, code:s.code, name:s.name, light:s.light, dark:s.dark })), series, render };
})();
