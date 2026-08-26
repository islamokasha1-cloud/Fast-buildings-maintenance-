/* ═══════════════════════════════════════════════════════════════════════════
   نظام هيل — مركزُ العمليات  (operations-wall.js)

   ── لماذا خرج هذا الكود من index.html ──
   بلغ `index.html` أربعين ألف سطر، فصار كلُّ تعديلٍ فيه بطيءَ التحرير، مستحيلَ
   المراجعة (فرقٌ من ١٤٠ سطراً داخل أربعين ألفاً بلا سياقٍ مرئيّ)، وأكثرَ من نصف
   الـcommits تمسّه فتتصادم الفروع. وهذه الوحدة **أولُ استخراج**، واختيرت لسببين
   لا لكونها الأكبر: سطحُ تماسها مع بقية النظام **سبعةُ أسماءٍ فقط**، ويحرسها
   `tvwall-check.mjs` بـ٧٢ فحصاً في متصفّحٍ حقيقيّ — فالنقلُ يُثبَت لا يُرجى.

   ── المبدأ الحاكم: نقلٌ لا تعديل ──
   الأسطر أدناه **منقولةٌ حرفياً** من `index.html` (٣٦٩٦١–٣٧٩٣٠) بلا حرفٍ واحدٍ
   يتغيّر — يُثبت ذلك `diff` عند المراجعة. النقلُ والتعديلُ تغييران منفصلان، وخلطُهما
   يُضيع القدرةَ على معرفة أيِّهما كسر إن كُسر.

   ── ولماذا بلا IIFE (خلافاً لقالب الوحدات في CLAUDE.md) ──
   القالبُ كُتب للوحدات **الجديدة**. أمّا هنا فستُّ سماتٍ في HTML تستدعي دوالَّ هذه
   الوحدة بالاسم وقتَ النقر (`openTVWall` · `closeTVWall` · `toggleTVWallFullscreen` ·
   `toggleTVWallRotation` · `tvwallOpenProject`)، وسمةُ `onclick` تُقيَّم في **النطاق
   العام** لا في نطاق الوحدة. فلفُّ الأربعٍ والثلاثين دالةً في IIFE دفعةً واحدة يُحوّل
   كلَّ زرٍّ منها إلى زرٍّ ميتٍ **بصمت** — بلا مترجمٍ ولا bundler يُنذر. لذا تبقى
   الوحدةُ في النطاق العام المشترك (كما تتشارك كلُّ وسوم <script> الكلاسيكية بيئتَها)،
   ويُؤجَّل اللفُّ وتعريضُ الواجهة إلى تغييرٍ لاحقٍ مستقلّ.

   ── ما بقي في index.html عمداً ──
   `_canSeeTVWall` (سطر ١٤٠٨٥): بوّابةُ صلاحيةٍ تقرأ `_isGlobalOnlyRole` و
   `_visibleProjectsFor` ويستدعيها موضعان آخران خارج المركز. منطقُ الصلاحيات لا
   يُجرّ إلى وحدةِ عرض. وتقرؤه هذه الوحدةُ بالاسم من النطاق المشترك.

   ── خدمات النواة المقروءة بالاسم ──
   `db` · `firebase` · `esc` · `_jsq` · `toast` · `logAudit` · `currentUser` ·
   `loadProjects` · `isOverdue` · `tvHealth` · `_canSeeTVWall` · `_ICON`.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════
   ██  v18.9ag — مركزُ العمليات: كل لوحات TV في شاشةٍ واحدة           ██
   ──────────────────────────────────────────────────────────────────────
   الغرض: متابعةُ كل المشاريع من مكانٍ واحد فور الدخول، بلا فتحِ كل مشروعٍ
   على حدة وانتظارِ تحميله. تُفتح من بوّابة المشاريع ومن القائمة الجانبية.

   قراراتٌ بُنيت عليها الشاشة:
   • **عزلٌ تام:** لا تلمس `CURRENT_PROJECT` ولا `tickets` ولا أي متغيّرٍ
     للمشروع المفتوح — لها مخزنُها الخاص لكل مشروع. (درس applyProjectConfig
     /switchProject: خلطُ بيانات مشروعين أخطرُ عطلٍ في هذه المنصّة.)
   • **مستمعٌ لكل مشروع يُركَّب مرةً واحدةً في الجلسة ويبقى حيّاً** حتى تسجيل
     الخروج: التركيبُ والفكُّ عند كل فتحٍ/إغلاق يراكم targetId ويُطلق خلل
     Firestore الداخلي (درس v18.9sz)، والقراءةُ الدورية بـ get() كل دقيقة
     تكلفةُ قراءاتٍ بلا داعٍ. الرسمُ يتوقّف عند الإغلاق، لا المستمع.
   • **لا تصنيفَ محلياً:** المتأخّر من `isOverdue` وصحّةُ اللوحة من `tvHealth`
     — نفس دوالّ لوحة المشروع، فلا يختلف رقمُ المركز عن رقم اللوحة.
   • **نافذةٌ مُعلَنة:** لكل مشروعٍ أحدثُ TVWALL_SYNC_LIMIT بلاغاً؛ فإن امتلأت
     النافذة تُعرَض ملاحظةٌ على البطاقة — لا اقتطاعَ صامتٌ يُقرأ «هذا كل شيء».
   ══════════════════════════════════════════════════════════════════════ */
const TVWALL_SYNC_LIMIT = 400;    // أحدث N بلاغاً لكل مشروع (نافذة المتابعة)
const TVWALL_TICK_MS    = 30000;  // إعادة حسابٍ دورية: SLA يتغيّر بمرور الوقت بلا حدث بيانات
const TVWALL_ROT_MS     = 20000;  // v18.9ai: زمنُ بقاء كل شاشةٍ في التدوير التلقائي
const TVWALL_TASKS_LIMIT= 600;    // v18.9aj: سقفُ مهام مشروع النظافة (جدولٌ لا تاريخ)
let _tvwall = { open:false, ret:"picker", projects:[], subs:{}, data:{}, err:{}, capped:{}, blds:{},
                kind:{}, tasks:{}, taskSubs:{},
                clock:null, tick:null, renderT:null, tickerMode:"action",
                screens:[], idx:0, rotOn:true, rotTimer:null };

/* أيقونةُ واجهةٍ من مجموعة المنصة (_ICON) بحجمٍ صريح — الإيموجي يختلف رسمُه بين
   الأجهزة ويكسر لغة الشاشة، والـSVG بلا أبعادٍ يتمدّد داخل حاويات flex (درس الوحدات). */
function _tvi(name){
  const svg=(typeof _svgIcon==="function")?_svgIcon(name):"";
  return svg?('<span class="tvl-i">'+svg+'</span>'):"";
}

// عدّ المشاريع بالعربية (١ مشروع · ٢ مشروعان · ٣-١٠ مشاريع · أكثر مشروعاً)
function _projCountAr(n){
  n=Number(n)||0;
  if(n===1) return "مشروع واحد";
  if(n===2) return "مشروعان";
  if(n<=10) return n+" مشاريع";
  return n+" مشروعاً";
}

/* الطوابع قد تصل نصاً ISO أو Timestamp — تُوحَّد عند الدخول مرةً واحدة، فتعمل
   كل الدوال المشتركة (isOverdue وغيرها) على نفس الشكل الذي يعمل عليه التطبيق. */
function _tvwallIso(v){
  if(!v) return "";
  if(typeof v==="object" && typeof v.toDate==="function"){ try{ return v.toDate().toISOString(); }catch(e){ return ""; } }
  return String(v);
}
function _tvwallNorm(d){
  const t=Object.assign({},d);
  t.createdAt=_tvwallIso(t.createdAt);
  t.closedAt =_tvwallIso(t.closedAt);
  return t;
}
function _tvwallAgo(iso){
  const ms=Date.now()-new Date(iso).getTime();
  if(!isFinite(ms)) return "—";
  const m=Math.max(0,Math.round(ms/60000));
  return m<1?"الآن":m<60?("قبل "+m+" د"):m<1440?("قبل "+Math.round(m/60)+" س"):("قبل "+Math.round(m/1440)+" يوم");
}

function _tvwallSubscribe(){
  if(!db) return;
  _tvwall.projects.forEach(p=>{
    if(_tvwall.subs[p.id]) return;                     // مركَّبٌ سلفاً — لا يُعاد التركيب
    if(_tvwall.kind[p.id]==="cleaning") return;        // مشروعُ نظافةٍ يُقاس بمهامّه لا ببلاغاته
    const col = IS_DEV ? p.id+"_tickets_dev" : p.id+"_tickets";
    try{
      _tvwall.subs[p.id] = db.collection(col).orderBy("createdAt","desc").limit(TVWALL_SYNC_LIMIT)
        .onSnapshot(snap=>{
          _tvwall.data[p.id]   = snap.docs.map(d=>_tvwallNorm(d.data()));
          _tvwall.capped[p.id] = snap.docs.length >= TVWALL_SYNC_LIMIT;
          delete _tvwall.err[p.id];
          _tvwallScheduleRender();
        }, e=>{
          _tvwall.err[p.id] = (e&&e.message) || "تعذّرت قراءة بلاغات المشروع";
          _tvwallScheduleRender();
        });
    }catch(e){ _tvwall.err[p.id] = e.message || "تعذّر الاشتراك"; }
  });
}
/* v18.9aj — مشروعُ النظافة عملُه **مهامٌّ مجدولة** لا بلاغات: ٩٥٪ منه جدولٌ يوميّ
   والشكوى استثناء. فبطاقتُه ولوحتُه تعرضان المهام. الاشتراكُ هنا بنفس انضباط المركز:
   مستمعٌ واحدٌ يُركَّب مرةً ويبقى حتى الخروج — لا فكَّ ولا تركيبَ متكرّرين (وهو سببُ
   امتناع وحدة النظافة عن المستمعين، فلا يُخالَف قرارُها هنا). */
function _tvwallSubscribeTasks(pid){
  if(!db || _tvwall.taskSubs[pid]) return;
  const CO=window.cleaningOps;
  const col=(CO&&CO.tasksColOf)?CO.tasksColOf(pid):"";
  if(!col) return;
  try{
    _tvwall.taskSubs[pid]=db.collection(col).limit(TVWALL_TASKS_LIMIT).onSnapshot(snap=>{
      _tvwall.tasks[pid]=snap.docs.map(d=>Object.assign({id:d.id},d.data()||{}));
      delete _tvwall.err[pid];
      _tvwallScheduleRender();
    }, e=>{
      _tvwall.err[pid]=(e&&e.message)||"تعذّرت قراءة مهام النظافة";
      _tvwallScheduleRender();
    });
  }catch(e){ _tvwall.err[pid]=e.message||"تعذّر الاشتراك"; }
}
// يُستدعى عند تسجيل الخروج فقط — لا عند إغلاق الشاشة (انظر قرار المستمعين أعلاه)
function _tvwallUnsubAll(){
  Object.keys(_tvwall.subs).forEach(k=>{ try{ _tvwall.subs[k](); }catch(e){} });
  Object.keys(_tvwall.taskSubs).forEach(k=>{ try{ _tvwall.taskSubs[k](); }catch(e){} });
  _tvwall.subs={}; _tvwall.taskSubs={}; _tvwall.data={}; _tvwall.tasks={}; _tvwall.kind={};
  _tvwall.err={}; _tvwall.capped={}; _tvwall.projects=[];
  _tvwall.blds={}; _tvwall.screens=[]; _tvwall.idx=0; _tvwall.totalsHtml="";
}
function _tvwallScheduleRender(){
  if(!_tvwall.open || _tvwall.renderT) return;         // مغلقٌ ⇐ المستمع يجمع ولا يرسم
  _tvwall.renderT=setTimeout(()=>{ _tvwall.renderT=null; renderTVWall(); },250);
}

/* مؤشّراتُ مشروعٍ واحد. تُرجع null قبل وصول اللقطة الأولى (حالة تحميل).
   v18.9aj: مشروعُ النظافة يُقاس بمهامّه المجدولة، والصيانةُ ببلاغاتها — موزِّعٌ واحد. */
function _tvwallCalc(pid){
  if(_tvwall.kind[pid]==="cleaning") return _tvwallCalcClean(pid);
  return _tvwallCalcTickets(pid);
}

/* مشروعُ نظافة: الحسابُ كلُّه من وحدة النظافة نفسها (`statsForTasks`/`coverageForTasks`)
   — لا نسخةَ ثانيةً من قواعد الاستحقاق والإجازة وتقدّم الجدول هنا. */
function _tvwallCalcClean(pid){
  const list=_tvwall.tasks[pid];
  const CO=window.cleaningOps;
  if(!list || !CO || !CO.statsForTasks) return null;
  const s=CO.statsForTasks(list);
  const parts=CO.splitTasks(list);
  const overdueDays=t=>{ try{ return CO.overdueDaysOf(t)||0; }catch(e){ return 0; } };
  return {
    kind:"cleaning",
    activeN:s.total, due:s.due, overdue:s.overdue, doneToday:s.done,
    scheduled:s.scheduled, coverage:s.coverage, holiday:s.holiday,
    // الصحّة من عدد المتأخّرات — نفس عتبات لوحات العرض (`tvHealth`)، فالمعنى واحد
    // عبر الشاشتين: صفرٌ مستقر، وواحدٌ متابعة، وثلاثةٌ فأكثر حرِج.
    health: tvHealth(s.overdue),
    dueList: parts.due.slice().sort((a,b)=>overdueDays(b)-overdueDays(a)),
    doneList: parts.done,
    worst: parts.overdue.slice().sort((a,b)=>overdueDays(b)-overdueDays(a))[0]||null,
    overdueDays,
    byBuilding: CO.coverageForTasks(list)
  };
}

function _tvwallCalcTickets(pid){
  const all=_tvwall.data[pid];
  if(!all) return null;
  const active =all.filter(t=>!t.archived);
  const openT  =active.filter(t=>t.status!=="مغلق");
  const odList =openT.filter(t=>isOverdue(t));
  const todayStr=new Date().toISOString().slice(0,10);
  const monthStr=todayStr.slice(0,7);
  const monthAll   =all.filter(t=>t.createdAt.slice(0,7)===monthStr);
  const monthClosed=monthAll.filter(t=>t.status==="مغلق").length;
  const lastClosed =all.filter(t=>t.status==="مغلق"&&t.closedAt)
                       .sort((a,b)=>new Date(b.closedAt)-new Date(a.closedAt))[0]||null;
  // بدايةُ الأسبوع (السبت) بالبناء لا بمُعدِّلات Date — درس v18.9vt
  const _n=new Date();
  const weekStart=new Date(_n.getFullYear(),_n.getMonth(),_n.getDate()-((_n.getDay()+1)%7)).getTime();
  // متوسّطُ زمن الإغلاق لبلاغات الشهر المغلقة (ms) — null إن لم يُغلق شيءٌ بعد
  const _spans=all.filter(t=>t.status==="مغلق"&&t.closedAt&&t.createdAt&&t.closedAt.slice(0,7)===monthStr)
                  .map(t=>new Date(t.closedAt)-new Date(t.createdAt)).filter(ms=>ms>=0);
  return {
    openN:openT.length,
    overdue:odList.length,
    prog:openT.filter(t=>t.status==="قيد التنفيذ").length,
    waiting:openT.filter(t=>t.status==="مفتوح").length,
    weekN:all.filter(t=>t.createdAt&&new Date(t.createdAt).getTime()>=weekStart).length,
    mttrMs:_spans.length?_spans.reduce((a,b)=>a+b,0)/_spans.length:null,
    odList,
    newToday:all.filter(t=>t.createdAt.slice(0,10)===todayStr).length,
    closedToday:all.filter(t=>t.status==="مغلق"&&t.closedAt.slice(0,10)===todayStr).length,
    // إنجازُ الشهر: من بلاغات الشهر كم أُغلق — نسبةٌ محصورةٌ ٠-١٠٠ ومقيسةٌ على نافذةٍ
    // مضمونةٍ داخل الحد، بخلاف نسبةٍ تراكميةٍ تعتمد على تاريخٍ خارج النافذة.
    monthN:monthAll.length, monthClosed,
    rate: monthAll.length ? Math.round(monthClosed/monthAll.length*100) : null,
    lastClosed,
    worst: odList.slice().sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt))[0]||null,
    openList: openT,
    doneToday: all.filter(t=>t.status==="مغلق"&&t.closedAt.slice(0,10)===todayStr)
                  .sort((a,b)=>new Date(b.closedAt)-new Date(a.closedAt)),
    health: tvHealth(odList.length),
    kind:"maint"
  };
}

/* ══════════════════════════════════════════════════════════════════════
   v18.9al — شريطُ التحليلات: رسومٌ بيانيةٌ بـSVG/HTML خالص، بلا مكتبةِ رسم.
   لوحةُ الأرقام تقول «كم»، ولا تقول «إلى أين يتّجه» ولا «أين يتركّز الضغط» —
   وهما سؤالا الناظر إلى شاشةٍ معلّقة. الرسومُ هنا تُجيبهما بلا نقرة.
   ثلاثةُ قيودٍ تحكم كلَّ رسمٍ أدناه:
   • **بلا شبكة**: الجدارُ قد لا يصله CDN، فمكتبةُ رسمٍ خارجيةٌ = لوحةٌ فارغةٌ عند
     أوّل انقطاع. كلُّ الرسم سطورٌ معدودةٌ من SVG وHTML.
   • **محورٌ واحد**: لا يُجمَع مقياسان مختلفا الوحدة في رسمٍ واحد. البلاغاتُ مع
     البلاغات، والمهامُّ مع المهام — وهو نفس قرارِ الشريط العلوي.
   • **لا لونَ وحدَه**: كلُّ سلسلةٍ لها اسمٌ ورقمٌ في وسيلة الإيضاح، وكلُّ عمودٍ
     يحمل قيمتَه — فالرسمُ يُقرأ على شاشةٍ باهتةٍ ولمن لا يميّز الألوان.
   ══════════════════════════════════════════════════════════════════════ */
const TVWALL_TREND_DAYS = 14;      // نافذةُ المنحنى — أسبوعان يُظهران النمطَ الأسبوعي
const TVWALL_BAR_ROWS   = 4;       // أعلى N صفوفٍ في الرسم الأفقي على جدارٍ ١٠٨٠
/* عددُ صفوف الرسم الأفقي يتبع ارتفاعَ الشاشة. والصفُّ الذي لا يتّسع **لا يُخفى بـCSS**
   (قصٌّ صامتٌ يُقرأ «هذا كلُّ شيء») بل لا يُحسَب أصلاً — والعنوانُ «أكثرُ …» يقول
   صراحةً إنّها قمّةُ القائمة لا كلُّها. */
function _tvcRows(){ return (window.innerHeight||900) < 1000 ? 3 : TVWALL_BAR_ROWS; }
let _tvcSeq = 0;                   // معرّفُ تدرّجٍ فريدٌ لكل رسم (ids مكرّرةٌ = تدرّجٌ خاطئ)

function _tvcCard(title, legend, body){
  return `<div class="tvl-ch"><div class="tvl-ch-h"><span class="t">${esc(title)}</span>`
    + (legend ? `<span class="tvl-ch-leg">${legend}</span>` : "")
    + `</div><div class="tvl-ch-b">${body}</div></div>`;
}
function _tvcNone(msg){ return `<div class="tvl-ch-none">${esc(msg||"لا بيانات في هذه النافذة")}</div>`; }
/* v18.9an: بطاقةُ الرسم تُظهر ما يتّسع، **وتقول كم أخفت**. بلا هذه الشارة يقرأ
   الناظرُ أربعةَ مبانٍ على أنها كلُّ مباني المشروع — والقصُّ الصامتُ أسوأُ من
   القصّ. (والقائمةُ الكاملةُ حاضرةٌ في عمود «حالة المباني» إلى جواره.) */
function _tvcMore(shown,total){
  return (total>shown) ? `<span class="tvl-ch-more">${shown} من ${total}</span>` : "";
}
function _tvcLegend(items){
  return items.map(i=>`<span style="--lc:${i.c}"><i></i>${esc(i.l)}`
    + (i.v==null?"":`<b class="tvw-num">${i.v}</b>`) + `</span>`).join("");
}

/* منحنى سلسلتين على **محورٍ واحد** (كلتاهما بلاغات). الألوانُ تُكتب في `style` لا في
   سمةِ العرض: `var(--x)` داخل سمةِ عرضٍ في SVG لا يُحلّ في كل المتصفحات، وداخل
   `style` يُحلّ دائماً. و`non-scaling-stroke` يُبقي سُمكَ الخط ثابتاً مع التمدّد. */
function _tvcLine(series, labels){
  const n = (series[0] && series[0].pts.length) || 0;
  if(n < 2) return _tvcNone();
  const max = Math.max(1, ...series.map(s=>Math.max.apply(null,s.pts)));
  const W=100, H=40, PAD=5, uid="tvcg"+(++_tvcSeq);
  const X=i=>i*(W/(n-1));
  const Y=v=>H-(v/max)*(H-PAD);
  const path=s=>s.pts.map((v,i)=>(i?"L":"M")+X(i).toFixed(2)+" "+Y(v).toFixed(2)).join(" ");
  const grid=[0,.5,1].map(f=>{ const y=Y(max*f).toFixed(2);
    return `<line x1="0" y1="${y}" x2="${W}" y2="${y}" style="stroke:var(--line-soft)" stroke-width="1" vector-effect="non-scaling-stroke"/>`; }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">`
    + `<defs><linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0" style="stop-color:${series[0].c};stop-opacity:.32"/>`
    + `<stop offset="1" style="stop-color:${series[0].c};stop-opacity:0"/></linearGradient></defs>`
    + grid
    + `<path d="${path(series[0])} L${W} ${H} L0 ${H} Z" fill="url(#${uid})" stroke="none"/>`
    + series.map(s=>`<path d="${path(s)}" fill="none" style="stroke:${s.c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`).join("")
    + `</svg>`
    + (labels ? `<div class="tvl-ch-x"><span class="tvw-num">${esc(labels[0])}</span>`
        + `<span class="tvw-num">${esc(labels[Math.floor(n/2)])}</span>`
        + `<span class="tvw-num">${esc(labels[n-1])}</span></div>` : "");
}

/* أعمدةٌ أفقية — للمقارنة بين كياناتٍ مسمّاة (مشروع · مبنى · نوع عمل).
   `segs` نِسَبٌ مئويةٌ من **نفس المقام** لكل الصفوف، وإلا فالطولُ يكذب. */
function _tvcBars(rows){
  if(!rows.length) return _tvcNone();
  return `<div class="tvl-hb">` + rows.map(r=>
    `<div class="r" title="${esc(r.l)}"><span class="n">${esc(r.l)}</span>`
    + `<span class="tk">${r.segs.filter(s=>s.w>0).map(s=>`<i style="width:${Math.min(100,s.w).toFixed(1)}%;background:${s.c}"></i>`).join("")}</span>`
    + `<span class="v"><b class="tvw-num">${esc(String(r.v))}</b>${r.u?(" "+esc(r.u)):""}</span></div>`
  ).join("") + `</div>`;
}

/* أعمدةٌ رأسية لفئاتٍ **مرتَّبة** (شرائحُ تأخّر). سلسلةٌ واحدةٌ ⇒ لونٌ واحد:
   الترتيبُ على المحور هو ما يقول «الأسوأ يميناً»، لا تدرّجُ ألوانٍ يُقرأ حالاتٍ. */
function _tvcCols(cols, color){
  if(!cols.length || !cols.some(c=>c.v>0)) return _tvcNone();
  const max=Math.max(1,...cols.map(c=>c.v));
  return `<div class="tvl-cb">` + cols.map(c=>{
    const h=c.v>0 ? Math.max(4,Math.round(c.v/max*100)) : 0;
    return `<div class="c"><div class="cv tvw-num">${c.v}</div>`
      + `<div class="ct">${h?`<i style="top:${100-h}%;background:${color||"var(--brand)"}"></i>`:""}</div>`
      + `<div class="cl">${esc(c.l)}</div></div>`;
  }).join("") + `</div>`;
}

/* شريطٌ مكدَّسٌ لتوزيعِ حالةٍ (داخل الوقت · اقترب · تجاوز): ألوانُ الحالة محجوزةٌ
   لمعناها، وكلُّ قطعةٍ مسمّاةٌ برقمها تحت الشريط — فلا تُقرأ باللون وحده. */
function _tvcStack(segs){
  const t=segs.reduce((a,s)=>a+s.v,0);
  if(!t) return _tvcNone();
  return `<div class="tvl-sb"><div class="tk">`
    + segs.filter(s=>s.v>0).map(s=>`<i style="flex:${s.v};background:${s.c}"></i>`).join("")
    + `</div><div class="sl">`
    + segs.map(s=>`<span style="--lc:${s.c}"><i></i>${esc(s.l)}<b class="tvw-num">${s.v}</b></span>`).join("")
    + `</div></div>`;
}

/* ── مُدخلاتُ الرسوم: حسابٌ واحدٌ لكلٍّ، لا نسخةَ ثانيةً من قاعدةِ عمل ── */

/* حركةُ ١٤ يوماً: كم وَرَد وكم أُغلق في كل يوم. المفاتيحُ بنفس اصطلاح بقية المركز
   (أوّلُ عشرة أحرفٍ من الطابع) — فالرقمُ في المنحنى هو الرقمُ في البلاطة، لا رقمٌ
   ثانٍ يُحسب بقاعدةِ يومٍ مختلفة.
   v18.9am: **والمؤرشفُ يُعدّ هنا كما تَعدّه البلاطات.** كان يُستثنى قياساً على
   «بلاغات نشطة» — وهي وحدَها تستثنيه لأنها تسأل «ما يحتاج عملاً الآن»؛ أما
   `monthN`/`newToday`/`closedToday` فتعدّ الكلَّ. النتيجةُ على شاشةٍ حقيقية:
   مشروعٌ يعرض «بلاغات الشهر ١٢٨» ومنحناه يقول «وارد ٩٣» — والنافذةُ الأربعةَ عشرَ
   يوماً **تحتوي** الشهرَ حتى اليوم، فرقمٌ أصغرُ من مُحتواه تناقضٌ ظاهرٌ للعين.
   القاعدة: نافذةٌ واحدةٌ وسكّانٌ واحدون لكل ما يُعرَض في الشاشة نفسها. */
function _tvwallTrend(lists){
  const days=[];
  for(let k=TVWALL_TREND_DAYS-1;k>=0;k--) days.push(new Date(Date.now()-k*86400000).toISOString().slice(0,10));
  const ix={}; days.forEach((d,i)=>{ ix[d]=i; });
  const opened=days.map(()=>0), closed=days.map(()=>0);
  (lists||[]).forEach(list=>(list||[]).forEach(t=>{
    const a=ix[String(t.createdAt||"").slice(0,10)]; if(a!=null) opened[a]++;
    if(t.status==="مغلق"){ const z=ix[String(t.closedAt||"").slice(0,10)]; if(z!=null) closed[z]++; }
  }));
  return { days, opened, closed, labels:days.map(d=>d.slice(8,10)+"/"+d.slice(5,7)),
           openedN:opened.reduce((a,b)=>a+b,0), closedN:closed.reduce((a,b)=>a+b,0) };
}

/* توزيعُ النشط على مهلته — الحكمُ من `slaOf` نفسِها (مصدرُ `isOverdue`)، فلا عتبةَ
   ثانيةٌ هنا تُخالف الرقمَ الأحمر في نبض التشغيل. وما لا فئةَ مهلةٍ له يُعرَض على
   حدةٍ لا يُلحَق بالملتزم — إلحاقُه تجميلٌ لا قياس. */
function _tvwallSlaSplit(list){
  const o={ok:0,near:0,over:0,none:0};
  (list||[]).forEach(t=>{
    const s=(typeof slaOf==="function")?slaOf(t):null;
    if(!s) o.none++;
    else if(s.state==="تجاوز") o.over++;
    else if(s.state==="اقترب") o.near++;
    else o.ok++;
  });
  return o;
}

// أكثرُ القيم تكراراً في حقلٍ واحد (نوعُ العمل · المبنى) — أعلى N فقط
function _tvwallTop(list, field, n){
  const m={};
  (list||[]).forEach(t=>{ const k=String(t[field]||"").trim()||"غير محدّد"; m[k]=(m[k]||0)+1; });
  return Object.keys(m).map(k=>({l:k,v:m[k]})).sort((a,b)=>b.v-a.v).slice(0,n||5);
}

/* شريطُ تحليلاتِ شاشة «الكل». أربعُ بطاقاتٍ حدّاً أقصى — صفٌّ واحدٌ يُقرأ من بعيد،
   وخامسةٌ تعني صفّين مضغوطين لا يُقرأ أيٌّ منهما. الترتيبُ أولويةٌ لا ذوق:
   الاتّجاه ← أين الضغط ← هل نلتزم بالمهلة ← تغطيةُ النظافة ← أكثرُ الأعمال. */
function _tvwallAnaAll(rows){
  const el=document.getElementById("tvl-ana-all");
  if(!el) return;
  const withData=(rows||[]).filter(r=>r.m);
  if(!withData.length){ el.innerHTML=""; return; }
  const maint=withData.filter(r=>r.m.kind!=="cleaning");
  const clean=withData.filter(r=>r.m.kind==="cleaning");
  const cards=[];

  // (١) الاتّجاه: وارِدٌ ومغلقٌ عبر أسبوعين — بلاغاتُ الصيانة وحدها، فالمهمّةُ
  //     المجدولة لا «تَرِد» يوماً بعينه (جدولٌ متكرّر لا حدثُ إنشاء).
  if(maint.length){
    const tr=_tvwallTrend(maint.map(r=>_tvwall.data[r.p.id]));
    cards.push(_tvcCard("حركةُ البلاغات — "+TVWALL_TREND_DAYS+" يوماً",
      _tvcLegend([{l:"وارد",c:"var(--brand)",v:tr.openedN},{l:"مغلق",c:"var(--green)",v:tr.closedN}]),
      _tvcLine([{c:"var(--brand)",pts:tr.opened},{c:"var(--green)",pts:tr.closed}],tr.labels)));
  }

  // (٢) أين يتركّز الضغط: عملٌ ينتظر في كل مشروع، والمتأخّرُ منه مصبوغٌ داخله.
  //     v18.9am: **مقامٌ لكل وحدةِ عمل، لا مقامٌ واحدٌ للجميع.** كان أطولُ شريطٍ
  //     يُقاس عليه الكلُّ، فمشروعُ نظافةٍ بـ٨٣ مهمّةً يُقزّم مشروعَ صيانةٍ بـ١١ بلاغاً
  //     ويُقرأ «ضغطُه سبعةُ أضعافه» — ومقارنةُ مهمّةٍ ببلاغٍ لا تعني شيئاً (نفس قرار
  //     الشريط العلوي: بلاطةٌ لكل وحدة). فكلُّ صفٍّ يُقاس على أسوأ مشروعٍ **من نوعه**،
  //     والوحدةُ مكتوبةٌ في قيمته فلا يُقارَن ما لا يُقارَن.
  const _unit=r=>(r.m.kind==="cleaning")?"مهمة":"بلاغ";
  const _all=withData.map(r=>({
    name:String(r.p.name||r.p.id), clean:r.m.kind==="cleaning", unit:_unit(r),
    tot:(r.m.kind==="cleaning")?r.m.due:r.m.openN,
    od:r.m.overdue
  }));
  const pMax={ maint:Math.max(1,..._all.filter(x=>!x.clean).map(x=>x.tot)),
               clean:Math.max(1,..._all.filter(x=>x.clean).map(x=>x.tot)) };
  /* v18.9ao: الترتيبُ **بنسبة المشروع إلى أسوأ مشروعٍ من نوعه** لا بعدده الخام.
     الفرزُ بالنوع (صيانةٌ ثم نظافة) كان يُسقط مشروعَ النظافة الوحيدَ من البطاقة
     كلَّما ضاقت الشاشةُ إلى ثلاثة صفوف — والمقامانِ منفصلانِ أصلاً، فالنسبةُ هي
     المقياسُ المشترك، وبها يتصدّر **قائدُ كل نوع** فلا يختفي نوعٌ بأكمله. */
  const press=_all.map(x=>Object.assign(x,{sh:x.tot/(x.clean?pMax.clean:pMax.maint)}))
    .sort((a,b)=>(b.sh-a.sh)||(b.tot-a.tot)).slice(0,_tvcRows());
  cards.push(_tvcCard("ضغطُ العمل حسب المشروع",
    _tvcMore(press.length,withData.length)+_tvcLegend([{l:"متأخّر",c:"var(--red)"},{l:"ضمن الوقت",c:"var(--brand)"}]),
    _tvcBars(press.map(x=>{ const mx=x.clean?pMax.clean:pMax.maint;
      return {l:x.name, v:x.tot, u:x.unit, segs:[
        {w:x.od/mx*100, c:"var(--red)"},
        {w:Math.max(0,x.tot-x.od)/mx*100, c:"var(--brand)"}
      ]};
    }))));

  // (٣) الالتزام بالمهلة — سؤالُ «هل نلحق؟» قبل أن يصير الرقمُ الأحمرَ أكبر
  if(maint.length){
    const openAll=maint.reduce((a,r)=>a.concat(r.m.openList||[]),[]);
    const s=_tvwallSlaSplit(openAll);
    cards.push(_tvcCard("التزامُ البلاغات النشطة بمهلتها","",
      _tvcStack([{l:"داخل الوقت",v:s.ok,c:"var(--green)"},
                 {l:"اقترب",v:s.near,c:"var(--amber)"},
                 {l:"تجاوز",v:s.over,c:"var(--red)"}]
        .concat(s.none?[{l:"بلا مهلة",v:s.none,c:"var(--tv-muted-2)"}]:[]))));
  }

  // (٤) تغطيةُ اليوم في مشاريع النظافة — مقياسُها هي، لا بلاغاتٌ لا تُنشأ
  if(clean.length){
    cards.push(_tvcCard("تغطيةُ اليوم حسب المشروع",
      _tvcLegend([{l:"نُفِّذ من جدول اليوم",c:"var(--green)"}]),
      _tvcBars(clean.map(r=>({
        l:String(r.p.name||r.p.id),
        v:r.m.holiday?"إجازة":(r.m.coverage+"%"),
        segs:[{w:r.m.holiday?0:r.m.coverage, c:"var(--green)"}]
      })))));
  }

  // (٥) أكثرُ الأعمال تكراراً — نوعُ العمل هو مدخلُ قرارِ التوزيع والتعاقد
  const src = maint.length ? maint.reduce((a,r)=>a.concat(r.m.openList||[]),[])
                           : clean.reduce((a,r)=>a.concat(r.m.dueList||[]),[]);
  const topAll=_tvwallTop(src,"workType",999), top=topAll.slice(0,_tvcRows());
  const tMax=Math.max(1,...top.map(x=>x.v));
  cards.push(_tvcCard(maint.length?"أكثرُ أنواع الأعمال — النشطة":"أكثرُ أنواع المهام المستحقّة",
    _tvcMore(top.length,topAll.length),
    _tvcBars(top.map(x=>({l:x.l, v:x.v, segs:[{w:x.v/tMax*100, c:"var(--brand)"}]})))));

  el.innerHTML=cards.slice(0,4).join("");
}

/* شريطُ تحليلاتِ لوحةِ المشروع — بلغةِ نوعه: الصيانةُ باتّجاهها والتزامِها بمهلتها،
   والنظافةُ بتغطيةِ مبانيها وشرائحِ تأخّرها. ثلاثُ بطاقاتٍ تحت الأعمدة الثلاثة. */
function _tvwallAnaProject(pid, m){
  const el=document.getElementById("tvl-ana-proj");
  if(!el) return;
  if(!m){ el.innerHTML=""; return; }
  const cards=[];
  if(m.kind==="cleaning"){
    // (١) الأضعفُ تغطيةً أولاً — نفس ترتيب `coverageForTasks` (الأضعفُ يتصدّر)
    const covAll=m.byBuilding||[], cov=covAll.slice(0,_tvcRows());
    cards.push(_tvcCard("أضعفُ المباني تغطيةً اليوم",
      _tvcMore(cov.length,covAll.length)+_tvcLegend([{l:"نُفِّذ من المجدول",c:"var(--green)"}]),
      cov.length?_tvcBars((covLbl=>cov.map((b,bi)=>({
        l:covLbl[bi]||String(b.name||""),
        v:b.pct+"% ("+b.done+"/"+b.sched+")",
        segs:[{w:b.pct, c:"var(--green)"}]
      })))(tvBldLabels(cov.map(b=>b.name)))):_tvcNone("لا مهامَّ مجدولةً اليوم")));
    // (٢) شرائحُ التأخّر بأيام العمل — كلُّها متأخّرةٌ فلونُها واحد؛ الترتيبُ يقول الأسوأ
    const b=[0,0,0,0];
    (m.dueList||[]).forEach(t=>{ const d=m.overdueDays(t); if(d<=0) return; b[d<=1?0:d<=3?1:d<=7?2:3]++; });
    cards.push(_tvcCard("شرائحُ تأخّر المهام (أيام عمل)","",
      // مدياتٌ بلا شَرطةٍ بين رقمين: «٢-٣» في سياقٍ عربيٍّ تُرسم مقلوبةً «٣-٢»
      _tvcCols([{l:"يوم واحد",v:b[0]},{l:"حتى ٣",v:b[1]},{l:"حتى ٧",v:b[2]},{l:"أكثر من ٧",v:b[3]}],"var(--red)")));
    // (٣) أكثرُ المهام المستحقّة نوعاً
    const topAll=_tvwallTop(m.dueList,"workType",999), top=topAll.slice(0,_tvcRows());
    const tMax=Math.max(1,...top.map(x=>x.v));
    cards.push(_tvcCard("أكثرُ أنواع المهام المستحقّة",_tvcMore(top.length,topAll.length),
      _tvcBars(top.map(x=>({l:x.l, v:x.v, segs:[{w:x.v/tMax*100, c:"var(--brand)"}]})))));
  } else {
    const tr=_tvwallTrend([_tvwall.data[pid]]);
    cards.push(_tvcCard("حركةُ البلاغات — "+TVWALL_TREND_DAYS+" يوماً",
      _tvcLegend([{l:"وارد",c:"var(--brand)",v:tr.openedN},{l:"مغلق",c:"var(--green)",v:tr.closedN}]),
      _tvcLine([{c:"var(--brand)",pts:tr.opened},{c:"var(--green)",pts:tr.closed}],tr.labels)));
    const s=_tvwallSlaSplit(m.openList);
    cards.push(_tvcCard("التزامُ البلاغات النشطة بمهلتها","",
      _tvcStack([{l:"داخل الوقت",v:s.ok,c:"var(--green)"},
                 {l:"اقترب",v:s.near,c:"var(--amber)"},
                 {l:"تجاوز",v:s.over,c:"var(--red)"}]
        .concat(s.none?[{l:"بلا مهلة",v:s.none,c:"var(--tv-muted-2)"}]:[]))));
    const topAll=_tvwallTop(m.openList,"workType",999), top=topAll.slice(0,_tvcRows());
    const tMax=Math.max(1,...top.map(x=>x.v));
    cards.push(_tvcCard("أكثرُ أنواع الأعمال — النشطة",_tvcMore(top.length,topAll.length),
      _tvcBars(top.map(x=>({l:x.l, v:x.v, segs:[{w:x.v/tMax*100, c:"var(--brand)"}]})))));
  }
  el.innerHTML=cards.join("");
}

function _tvwallCard(proj, m, err){
  const nm=esc(proj.name||proj.id);
  const ico=(typeof projectIconMarkup==="function")?projectIconMarkup(proj.icon,proj.name):_svgIcon("building2");
  // رأسُ البطاقة **مقطعٌ متوازنٌ بذاته** يأخذ شارةَ الحالة معاملاً — لا مقطعَ ناقصَ
  // الإغلاق تُكمله كل حالةٍ بنفسها (توازنُ الوسوم يُفحَص على المصدر لا على المُخرَج).
  const top=w=>`<div class="tvl-c-top"><span class="tvl-c-ico">${ico}</span>`
    +`<div class="tvl-c-nm"><div class="n">${nm}</div>`
    +`<div class="s">${esc(proj.contractName||proj.desc||"")}</div></div>${w}</div>`;
  if(err){
    return `<div class="tvl-card dim">${top('<span class="tvl-c-word">تعذّر</span>')}`
      +`<div class="tvl-c-err">${_tvi("alertTriangle")}تعذّرت قراءة بيانات هذا المشروع<br><span style="font-weight:600;opacity:.8">${esc(err)}</span></div></div>`;
  }
  const clean=_tvwall.kind[proj.id]==="cleaning";
  if(!m){
    return `<div class="tvl-card dim">${top('<span class="tvl-c-word">…</span>')}`
      +`<div class="tvl-c-load"><span class="lb-spin" style="border-color:rgba(120,155,215,.3);border-top-color:var(--brand)"></span>جاري تحميل ${clean?"مهام النظافة":"بلاغات المشروع"}…</div></div>`;
  }
  const h=m.health;
  const foot=[];
  // مشروعُ النظافة عملُه مهامٌّ مجدولة: بطاقتُه تعرض المهامَّ لا البلاغات
  if(clean){
    if(m.holiday) foot.push(`<span>${_tvi("calendar")}إجازة اليوم — لا مهامَّ مستحقّة</span>`);
    else if(m.worst) foot.push(`<span class="bad">${_tvi("alertTriangle")}أقدم متأخّرة ${esc(m.worst.name||"")} · ${m.overdueDays(m.worst)} يوم</span>`);
    else foot.push(`<span class="ok">${_tvi("checkCircle")}لا مهامَّ متأخّرة</span>`);
    if(m.doneToday) foot.push(`<span class="ok">${_tvi("clipboardCheck")}نُفِّذت اليوم ${m.doneToday}</span>`);
  } else {
    if(m.lastClosed) foot.push(`<span class="ok">${_tvi("checkCircle")}آخر إغلاق ${esc(_tvwallAgo(m.lastClosed.closedAt))}</span>`);
    if(m.worst) foot.push(`<span class="bad">${_tvi("alertTriangle")}أقدم متأخر ${esc(m.worst.id||"")} · ${esc(fmtElapsed(m.worst))}</span>`);
    if(!foot.length) foot.push(`<span>${_tvi("checkCircle")}لا بلاغات متأخرة</span>`);
    if(_tvwall.capped[proj.id]) foot.push(`<span class="tvl-c-note">النافذة: أحدث ${TVWALL_SYNC_LIMIT} بلاغ</span>`);
  }
  const cells=(clean?[
    {v:m.overdue,  l:"متأخّرة",     c:"var(--red)",   hot:m.overdue>0},
    {v:m.due,      l:"مستحقّة الآن",c:"var(--amber)"},
    {v:m.doneToday,l:"نُفِّذت اليوم",c:"var(--green)"},
    {v:m.activeN,  l:"مهام نشطة",  c:"var(--brand)"}
  ]:[
    {v:m.overdue, l:"متأخرة SLA", c:"var(--red)",   hot:m.overdue>0},
    {v:m.prog,    l:"قيد التنفيذ", c:"var(--amber)"},
    {v:m.newToday,l:"بلاغات اليوم",c:"var(--violet)"},
    {v:m.closedToday,l:"أُغلقت اليوم",c:"var(--green)"}
  ]).map(s=>`<div class="tvl-c-st ${s.hot?"hot":""}" style="--sc:${s.c}"><div class="v tvw-num">${s.v}</div><div class="l">${s.l}</div></div>`).join("");
  // شريطُ التقدّم: تغطيةُ اليوم للنظافة (مقياسُ لوحتها) وإنجازُ بلاغات الشهر للصيانة
  const barL = clean ? "تغطية اليوم" : "إنجاز بلاغات الشهر";
  const barV = clean ? (m.holiday?null:m.coverage) : m.rate;
  const barN = clean ? `${m.doneToday}/${m.scheduled}` : `${m.monthClosed}/${m.monthN}`;
  const barTxt = clean&&m.holiday ? "إجازة" : (barV==null?"—":barV+"%");
  return `<button type="button" class="tvl-card ${h.key==="crit"?"crit":h.key==="watch"?"warn":"ok"}"
      onclick="tvwallOpenProject('${_jsq(proj.id)}')" title="فتح ${nm}">
    ${top('<span class="tvl-c-word"><span class="d"></span>'+h.word+'</span>')}
    <div class="tvl-c-main"><span class="tvl-c-big tvw-num">${clean?m.due:m.openN}</span><span class="tvl-c-biglbl">${clean?"مهمّة مستحقّة":"بلاغ نشط"}</span></div>
    <div class="tvl-c-stats">${cells}</div>
    <div class="tvl-c-bar">
      <div class="bl"><span>${barL}</span><b>${barTxt} <span style="opacity:.65">(${barN})</span></b></div>
      <div class="tvl-c-track"><div class="tvl-c-fill" style="width:${barV==null?0:barV}%;--bc:${tvRateTone(barV).c}"></div></div>
    </div>
    <div class="tvl-c-foot">${foot.join("")}</div>
  </button>`;
}

function renderTVWall(flipTicker){
  const gridEl=document.getElementById("tvl-grid");
  if(!gridEl) return;
  const scr=document.getElementById("tvwall-screen");
  const rows=_tvwall.projects.map(p=>({ p, m:_tvwallCalc(p.id), err:_tvwall.err[p.id]||null }));

  // الأسوأ أولاً — شاشةُ متابعةٍ: ما يحتاج تدخّلاً يتصدّر، والمتعذّر قراءتُه أولاً كي يُرى
  const rank={crit:1,watch:2,stable:3};
  rows.sort((a,b)=>{
    const ar=a.err?0:(a.m?rank[a.m.health.key]:4), br=b.err?0:(b.m?rank[b.m.health.key]:4);
    if(ar!==br) return ar-br;
    const ao=(a.m&&a.m.overdue)||0, bo=(b.m&&b.m.overdue)||0;
    if(ao!==bo) return bo-ao;
    return ((b.m&&b.m.openN)||0)-((a.m&&a.m.openN)||0);
  });

  // شاشاتُ التدوير تتبع ترتيبَ البطاقات — فالنقطةُ الثانية هي المشروعُ الأولى بالمتابعة
  _tvwallSyncScreens(rows.map(r=>r.p.id));

  if(!rows.length){
    gridEl.innerHTML=`<div class="tvl-empty">لا توجد مشاريع متاحة لعرضها<br><span style="font-size:.85em;opacity:.8">يرجى التواصل مع مدير النظام لإسناد مشروع إليك</span></div>`;
  } else {
    gridEl.innerHTML=rows.map(r=>_tvwallCard(r.p,r.m,r.err)).join("");
  }
  _tvwallAnaAll(rows);          // شريطُ التحليلات أسفل البطاقات — نفس صفوفِ الحساب

  // ── الشريط العلوي: مجاميعُ كل المشاريع ──
  // v18.9aj: المشاريعُ نوعان بوحدتَي عملٍ مختلفتين — بلاغاتٌ ومهامّ. لا تُجمَعان في
  // بلاطةٍ واحدة (رقمٌ بوحدتين لا يعني شيئاً)، بل مجموعةُ بلاطاتٍ لكل نوعٍ **تظهر عند
  // وجوده وحده** — فمَن كلُّ مشاريعه صيانةً يرى شريطَه القديم كما هو.
  const withData=rows.filter(r=>r.m);
  const maint=withData.filter(r=>r.m.kind!=="cleaning");
  const clean=withData.filter(r=>r.m.kind==="cleaning");
  const sumOf=(arr,k)=>arr.reduce((a,r)=>a+(r.m[k]||0),0);
  const totOpen=sumOf(maint,"openN"), totOd=sumOf(maint,"overdue"), totDone=sumOf(maint,"closedToday");
  const tskDue=sumOf(clean,"due"), tskOd=sumOf(clean,"overdue"), tskDone=sumOf(clean,"doneToday");
  const critN=withData.filter(r=>r.m.health.key==="crit").length;
  const watchN=withData.filter(r=>r.m.health.key==="watch").length;
  const worstKey=critN?"crit":watchN?"watch":"stable";
  if(scr) scr.setAttribute("data-health",worstKey);
  const subEl=document.getElementById("tvl-sub");
  if(subEl) subEl.textContent=_projCountAr(rows.length)+" تحت المتابعة"+(withData.length<rows.length?` · ${rows.length-withData.length} قيد التحميل`:"");
  _tvwall.totalsHtml=[
    {v:rows.length,l:"المشاريع",c:"#6C8CC4"}
  ].concat(maint.length?[
    {v:totOpen,   l:"بلاغات نشطة",c:"var(--brand)"},
    {v:totOd,     l:"متأخرة عن SLA",c:"var(--red)"},
    {v:totDone,   l:"أُغلقت اليوم",c:"var(--green)"}
  ]:[]).concat(clean.length?[
    {v:tskDue,    l:"مهام مستحقّة",c:"var(--amber)"},
    {v:tskOd,     l:"مهام متأخّرة",c:"var(--red)"},
    {v:tskDone,   l:"نُفِّذت اليوم",c:"var(--green)"}
  ]:[]).concat([
    {v:critN,     l:"مشاريع حرِجة",c:critN?"var(--red)":"var(--green)"}
  ]).map(x=>`<div class="tvw-tot" style="--c:${x.c}"><div class="tv tvw-num" style="color:${x.c}">${x.v}</div><div class="tl">${x.l}</div></div>`).join("");
  const curS=_tvwall.screens[_tvwall.idx];
  const totEl=document.getElementById("tvl-totals");
  if(totEl && !(curS&&curS.pid)) totEl.innerHTML=_tvwall.totalsHtml;
  const upEl=document.getElementById("tvl-last-upd");
  if(upEl) upEl.textContent=new Date().toLocaleTimeString("ar-SA-u-nu-latn",{hour:"2-digit",minute:"2-digit",hour12:false});

  // ── الشريط السفلي: يحتاج إجراء ⇄ أُنجز اليوم (عبر كل المشاريع، باسم المشروع) ──
  const tkEl=document.getElementById("tvl-ticker");
  if(!tkEl) return;
  // البندُ في الشريط: بلاغٌ من مشروع صيانة، أو مهمّةٌ مستحقّة من مشروع نظافة —
  // كلاهما «عملٌ ينتظر»، ويحمل اسمَ مشروعه فلا يلتبس مصدرُه على الناظر.
  const urgent=[];
  const done=[];
  withData.forEach(r=>{
    if(r.m.kind==="cleaning"){
      r.m.dueList.forEach(t=>urgent.push({t,p:r.p,clean:true,late:r.m.overdueDays(t)>0,rank:-r.m.overdueDays(t)}));
      r.m.doneList.forEach(t=>done.push({t,p:r.p,clean:true}));
    } else {
      r.m.openList.forEach(t=>urgent.push({t,p:r.p,clean:false,late:isOverdue(t),rank:new Date(t.createdAt).getTime()}));
      r.m.doneToday.forEach(t=>done.push({t,p:r.p,clean:false}));
    }
  });
  urgent.sort((a,b)=>{
    if(a.late!==b.late) return a.late?-1:1;   // المتأخّر أولاً في النوعين
    return a.rank-b.rank;
  });
  done.sort((a,b)=>(a.clean?0:new Date(b.t.closedAt)-new Date(a.t.closedAt)));
  if(flipTicker) _tvwall.tickerMode=(_tvwall.tickerMode==="action")?"done":"action";
  if(_tvwall.tickerMode==="done"  && !done.length)   _tvwall.tickerMode="action";
  if(_tvwall.tickerMode==="action"&& !urgent.length && done.length) _tvwall.tickerMode="done";
  const tagEl=document.getElementById("tvl-ticker-tag");
  if(tagEl){
    tagEl.classList.toggle("done",_tvwall.tickerMode==="done");
    tagEl.innerHTML='<span class="dot"></span>'+(_tvwall.tickerMode==="done"?"أُنجز اليوم":"يحتاج إجراء");
  }
  const chips=[
    {i:"building2",l:"المشاريع",v:rows.length}
  ].concat(maint.length?[
    {i:"ticket",       l:"بلاغات نشطة",  v:totOpen},
    {i:"alertTriangle",l:"متأخرة عن SLA",v:totOd},
    {i:"checkCircle",  l:"أُغلقت اليوم", v:totDone}
  ]:[]).concat(clean.length?[
    {i:"clipboardList", l:"مهام مستحقّة",v:tskDue},
    {i:"alertTriangle", l:"مهام متأخّرة",v:tskOd},
    {i:"clipboardCheck",l:"نُفِّذت اليوم",v:tskDone}
  ]:[]).map(s=>`<span class="tvw-tk"><span class="tt">${_tvi(s.i)}${s.l}</span><span class="tid">${s.v}</span></span><span class="sep"></span>`).join("");
  const bldTx=t=>esc(tvBldShort(t.building));
  let one;
  if(_tvwall.tickerMode==="done"){
    one=done.slice(0,40).map(x=>x.clean
      ? `<span class="tvw-tk"><span class="tt">${esc(x.p.name||"")}</span><span class="tb">${esc(x.t.name||"مهمة")}</span><span class="tb">${bldTx(x.t)}</span><span class="tdone">${_tvi("clipboardCheck")}نُفِّذت</span></span><span class="sep"></span>`
      : `<span class="tvw-tk"><span class="tt">${esc(x.p.name||"")}</span><span class="tid">${esc(x.t.id||"")}</span><span class="tb">${bldTx(x.t)}</span><span class="tdone">${_tvi("checkCircle")}${esc(String(x.t.closedAt).slice(11,16)||"")}</span></span><span class="sep"></span>`
    ).join("")+chips;
  } else if(!urgent.length){
    one=`<span class="tvw-tk"><span class="tdone">${_tvi("checkCircle")}لا يوجد عملٌ ينتظر في أيّ مشروع</span></span><span class="sep"></span>`+chips;
  } else {
    one=urgent.slice(0,40).map(x=>x.clean
      ? `<span class="tvw-tk ${x.late?"od":""}"><span class="tt">${esc(x.p.name||"")}</span><span class="tb">${esc(x.t.name||"مهمة")}</span><span class="tb">${bldTx(x.t)}</span>${x.late?`<span class="tel">${_tvi("timer")}متأخّرة ${x.rank?-x.rank:0} يوم</span>`:`<span class="tt">مستحقّة اليوم</span>`}</span><span class="sep"></span>`
      : `<span class="tvw-tk ${x.late?"od":""}"><span class="tt">${esc(x.p.name||"")}</span><span class="tid">${esc(x.t.id||"")}</span><span class="tb">${bldTx(x.t)}</span><span class="tel">${_tvi("timer")}${esc(fmtElapsed(x.t))}</span>${x.late?'<span class="tt" style="color:var(--red)">متأخر</span>':""}</span><span class="sep"></span>`
    ).join("")+chips;
  }
  _tvFillTicker(tkEl,one);
  // الشاشةُ المعروضة الآن قد تكون لوحةَ مشروع — أعِد رسمها بالأرقام الطازجة
  if(curS && curS.pid) _tvwallRenderProject(curS.pid);
  _tvwallRotDots();
}

/* ══════════════════════════════════════════════════════════════════════
   v18.9ai — التدويرُ التلقائي: «الكل» ثم لوحةُ عملياتٍ لكل مشروع
   شاشةُ المشروع تُبنى **من نافذة المركز نفسها** (لا من `tickets`) بنفس تخطيط
   لوحة العرض TV، فما يراه الناظرُ على الشاشة هو ما يراه داخل المشروع.
   ══════════════════════════════════════════════════════════════════════ */

/* مبانِي المشروع من مستند إعداداته — نفس مصدر لوحة المشروع (`SETTINGS_DOC`)،
   فتظهر المباني الخالية من البلاغات أيضاً كما في اللوحة. قراءةٌ واحدةٌ لكل مشروع،
   وتعذّرُها ليس عطلاً: تُشتقّ المباني حينها من البلاغات نفسها. */
async function _tvwallLoadBuildings(){
  if(!db) return;
  await Promise.all(_tvwall.projects.map(async p=>{
    if(!_tvwall.blds[p.id]){
      try{
        const snap=await db.doc("meta/"+p.id+(IS_DEV?"_settings_dev":"_settings")).get();
        const b=snap.exists?snap.data().buildings:null;
        if(Array.isArray(b)&&b.length) _tvwall.blds[p.id]=b;
      }catch(e){ /* بلا إعدادات — تُشتقّ من البلاغات */ }
    }
    // v18.9aj: نوعُ المشروع من وحدة النظافة نفسها (مصدرٌ واحدٌ للتصنيف)، ثم اشتراكُ
    // مهامّه إن كان مشروعَ نظافة — فبطاقتُه ولوحتُه تعرضان المهامَّ لا البلاغات.
    if(!_tvwall.kind[p.id]){
      let isClean=false;
      try{
        const CO=window.cleaningOps;
        if(CO&&CO.isCleaningProjectRec) isClean=await CO.isCleaningProjectRec(p);
      }catch(e){ isClean=false; }
      _tvwall.kind[p.id]=isClean?"cleaning":"maint";
      if(isClean){
        // النوعُ يُعرَف بعد أول اشتراك، فيُفكّ مستمعُ البلاغات مرّةً واحدةً لهذا المشروع
        // (تحوّلٌ واحدٌ في الجلسة لا تناوبٌ متكرّر) ولا تُقرأ بلاغاتٌ لا تُعرَض.
        if(_tvwall.subs[p.id]){ try{ _tvwall.subs[p.id](); }catch(e){} delete _tvwall.subs[p.id]; }
        delete _tvwall.data[p.id]; delete _tvwall.capped[p.id]; delete _tvwall.err[p.id];
        _tvwallSubscribeTasks(p.id);
      }
    }
  }));
  if(_tvwall.open) renderTVWall();
}

// قائمةُ الشاشات = «الكل» + مشروعٌ لكل بطاقة بترتيب البطاقات (الأسوأ أولاً)
function _tvwallSyncScreens(order){
  const ids=(order&&order.length)?order:_tvwall.projects.map(p=>p.id);
  const next=[{pid:null}].concat(ids.map(id=>({pid:id})));
  const same=next.length===_tvwall.screens.length
    && next.every((s,i)=>s.pid===_tvwall.screens[i].pid);
  if(!same){
    const curPid=_tvwall.screens[_tvwall.idx] ? _tvwall.screens[_tvwall.idx].pid : null;
    _tvwall.screens=next;
    const keep=next.findIndex(s=>s.pid===curPid);
    _tvwall.idx=keep>=0?keep:0;
  }
}

function _tvwallRotDots(){
  const d=document.getElementById("tvl-rot-dots");
  if(!d) return;
  d.innerHTML=_tvwall.screens.map((s,k)=>{
    const p=s.pid?_tvwall.projects.find(x=>x.id===s.pid):null;
    const m=s.pid?_tvwallCalc(s.pid):null;
    const c=!s.pid?"var(--brand)"
      :(m?(m.health.key==="crit"?"var(--red)":m.health.key==="watch"?"var(--amber)":"var(--green)"):"var(--tv-muted-2)");
    const lbl=p?("لوحة "+(p.name||p.id)):"كل المشاريع";
    return `<button style="--dc:${c}" class="${k===_tvwall.idx?"on":""}" aria-label="${esc(lbl)}" title="${esc(lbl)}"></button>`;
  }).join("");
  Array.prototype.forEach.call(d.children,(b,k)=>{ b.onclick=()=>{ _tvwallShowScreen(k); _tvwallRotRestart(); }; });
}

function _tvwallSweep(){
  const f=document.getElementById("tvl-rot-fill");
  if(!f) return;
  f.style.setProperty("--rot",(TVWALL_ROT_MS/1000)+"s");
  f.classList.remove("run"); void f.offsetWidth;
  if(_tvwall.rotOn) f.classList.add("run");
}

function _tvwallShowScreen(i){
  if(!_tvwall.screens.length) _tvwallSyncScreens();
  _tvwall.idx=((i%_tvwall.screens.length)+_tvwall.screens.length)%_tvwall.screens.length;
  const s=_tvwall.screens[_tvwall.idx];
  const all=document.getElementById("tvl-screen-all");
  const pr =document.getElementById("tvl-screen-proj");
  if(all) all.style.display=s.pid?"none":"";
  if(pr)  pr.style.display =s.pid?"":"none";
  if(s.pid) _tvwallRenderProject(s.pid,true);
  else { const t=document.getElementById("tvl-totals"); if(t&&_tvwall.totalsHtml) t.innerHTML=_tvwall.totalsHtml; }
  _tvwallRotDots();
  _tvwallSweep();
}

function _tvwallRotRestart(){
  if(_tvwall.rotTimer){ clearInterval(_tvwall.rotTimer); _tvwall.rotTimer=null; }
  if(!_tvwall.rotOn || _tvwall.screens.length<2) return;
  _tvwall.rotTimer=setInterval(()=>{
    if(!_tvwall.open) return;
    _tvwallShowScreen(_tvwall.idx+1);
  },TVWALL_ROT_MS);
}

function toggleTVWallRotation(){
  _tvwall.rotOn=!_tvwall.rotOn;
  const b=document.getElementById("tvl-rot-btn");
  if(b) b.innerHTML=_tvwall.rotOn
    ? '<span class="tvl-i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg></span>إيقاف التدوير'
    : '<span class="tvl-i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 4 12 8-12 8z"/></svg></span>تشغيل التدوير';
  _tvwallSweep();
  _tvwallRotRestart();
}

/* لوحةُ مشروعٍ واحد — نفس أعمدة لوحة العرض TV: نبض التشغيل · حالة التشغيل · المباني.
   الأرقامُ كلها من نافذة المتابعة، ولذلك لا يُعرض إجماليٌّ تراكميّ هنا: تُعرَض
   مقاييسُ المدة (اليوم/الأسبوع/الشهر) وحدها — رقمٌ صادقٌ خيرٌ من إجماليٍّ مقتطَع. */
function _tvwallRenderProject(pid, entering){
  const proj=_tvwall.projects.find(p=>p.id===pid);
  const scr=document.getElementById("tvl-screen-proj");
  if(!proj||!scr) return;
  const m=_tvwallCalc(pid), err=_tvwall.err[pid];
  const setTx=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  const icoEl=document.getElementById("tvl-proj-ico");
  if(icoEl) icoEl.innerHTML=(typeof projectIconMarkup==="function")?projectIconMarkup(proj.icon,proj.name):_svgIcon("building2");
  setTx("tvl-proj-name",proj.name||proj.id);
  const capNote=(_tvwall.capped[pid]&&_tvwall.kind[pid]!=="cleaning")?` · نافذة أحدث ${TVWALL_SYNC_LIMIT} بلاغ`:"";
  setTx("tvl-proj-sub",(proj.contractName||proj.desc||"")+capNote);
  const wordEl=document.getElementById("tvl-proj-word");

  if(!m){
    scr.setAttribute("data-health","stable");
    if(wordEl) wordEl.innerHTML='<span class="d"></span>'+(err?"تعذّرت القراءة":"جاري التحميل");
    const k=document.getElementById("tvl-proj-kpis");
    if(k) k.innerHTML=`<div class="tvw-kpi"><div class="kl">${err?esc(err):"بانتظار بيانات المشروع…"}</div></div>`;
    const b=document.getElementById("tvl-proj-blds"); if(b) b.innerHTML="";
    _tvwallAnaProject(pid,null);
    return;
  }

  scr.setAttribute("data-health",m.health.key);
  if(wordEl) wordEl.innerHTML='<span class="d"></span>'+esc(m.health.word);
  const cleanP=m.kind==="cleaning";

  const kpisEl=document.getElementById("tvl-proj-kpis");
  if(kpisEl) kpisEl.innerHTML=(cleanP?[
    {v:m.overdue, l:"متأخّرة عن موعدها",i:"alertTriangle",c:"var(--red)",alert:true},
    {v:m.due,     l:"مستحقّة الآن",     i:"clipboardList",c:"var(--amber)"},
    {v:m.doneToday,l:"نُفِّذت اليوم",   i:"clipboardCheck",c:"var(--green)"}
  ]:[
    {v:m.overdue, l:"متأخرة عن SLA",i:"alertTriangle",c:"var(--red)",alert:true},
    {v:m.openN,   l:"بلاغات نشطة",  i:"ticket",       c:"var(--brand)"},
    {v:m.newToday,l:"بلاغات اليوم", i:"clipboardList",c:"var(--violet)"}
  ]).map(k=>`<div class="tvw-kpi ${k.alert?"alert":""} ${k.alert&&k.v>0?"hot":""}" style="--c:${k.c}"><div class="kv">${k.v}</div><div class="kl">${_tvi(k.i)}${k.l}</div></div>`).join("");

  // حلقةُ الجاهزية: تغطيةُ اليوم للنظافة (مقياسُ لوحتها)، وإنجازُ بلاغات الشهر للصيانة
  const pct = cleanP ? (m.holiday?null:m.coverage) : m.rate;
  setTx("tvl-proj-bword",cleanP&&m.holiday?"إجازة":m.health.word);
  // v18.9am: الكلمةُ حكمٌ على **المتأخّرات**، والنسبةُ تحتها حكمٌ على **الإنجاز**.
  // بلا هذا السطر تُقرأ «حرِج» وصفاً لـ«٩٤٪» — وهما مقياسان لا يلتقيان.
  setTx("tvl-proj-bwhy", (cleanP&&m.holiday) ? "لا مهامَّ مستحقّة اليوم"
    : m.overdue ? (m.overdue+(cleanP?" مهمّة متأخّرة":" متأخرة عن SLA"))
                : (cleanP?"لا مهامَّ متأخّرة":"لا بلاغات متأخرة"));
  setTx("tvl-proj-bpct",pct==null?"—":(pct+"%"));
  const tone=tvRateTone(pct);
  const beaconEl=scr.querySelector(".tvw-beacon");
  if(beaconEl) beaconEl.style.setProperty("--rate",tone.c);
  const ringLbl=document.getElementById("tvl-proj-blbl");
  if(ringLbl) ringLbl.textContent=cleanP?"تغطية اليوم":"إنجاز بلاغات الشهر";
  const foot=cleanP
    ? [{id:"tvl-proj-prog",v:m.due},{id:"tvl-proj-wait",v:m.activeN},{id:"tvl-proj-done",v:m.doneToday}]
    : [{id:"tvl-proj-prog",v:m.prog},{id:"tvl-proj-wait",v:m.waiting},{id:"tvl-proj-done",v:m.closedToday}];
  foot.forEach(f=>setTx(f.id,f.v));
  setTx("tvl-proj-l1",cleanP?"مستحقّة الآن":"قيد التنفيذ");
  setTx("tvl-proj-l2",cleanP?"مهام نشطة":"في الانتظار");
  setTx("tvl-proj-l3",cleanP?"نُفِّذت اليوم":"أُغلقت اليوم");

  const ring=document.getElementById("tvl-proj-ring");
  if(ring){
    const C=2*Math.PI*52;
    ring.style.strokeDasharray=C;
    const to=C*(1-(pct==null?0:pct)/100);
    if(entering){
      ring.style.strokeDashoffset=C;
      requestAnimationFrame(()=>requestAnimationFrame(()=>{ ring.style.strokeDashoffset=to; }));
    } else ring.style.strokeDashoffset=to;
  }

  // المباني: قائمةُ إعدادات المشروع إن وُجدت، وإلا ما ظهر منها في العمل نفسه.
  // في النظافة العددُ = المهامُّ المستحقّة في المبنى، وفي الصيانة = بلاغاته المفتوحة.
  const known=_tvwall.blds[pid];
  const items = cleanP ? m.dueList.concat(m.doneList) : m.openList.concat(m.doneToday);
  const fromT=[...new Set(items.map(t=>String(t.building||"").trim()).filter(Boolean))];
  const blds=(known&&known.length)?known:fromT;
  const bldEl=document.getElementById("tvl-proj-blds");
  const bLbl=tvBldLabels(blds);
  if(bldEl) bldEl.innerHTML=blds.length?blds.map((b,bi)=>{
    const bt=(cleanP?m.dueList:m.openList).filter(t=>t.building===b);
    const od=cleanP ? bt.filter(t=>m.overdueDays(t)>0).length : bt.filter(t=>isOverdue(t)).length;
    const cls=od>0?"crit":bt.length>0?"warn":"ok";
    return `<div class="tvw-bld ${cls}" title="${esc(String(b))}"><span class="bdot"></span>`
      +`<div class="bname">${esc(bLbl[bi]||String(b))}</div><div class="bcount">${bt.length}</div></div>`;
  }).join(""):`<div class="tvl-empty">لا مبانٍ مسجّلة لهذا المشروع</div>`;

  _tvwallAnaProject(pid,m);     // شريطُ تحليلاتِ المشروع — بلغةِ نوعه (بلاغاتٌ أو مهامّ)

  // شريطٌ واحدٌ أعلى الشاشة يتبع المعروض: مجاميعُ الكل على شاشة «الكل»، ومقاييسُ
  // المشروع على لوحته — شريطان معاً ازدحامٌ بلا فائدة.
  const _fmtDur=(ms)=>{ if(ms==null) return "—"; const h=ms/3600000; return h<48?(Math.round(h*10)/10+" س"):(Math.round(h/24*10)/10+" يوم"); };
  const totEl=document.getElementById("tvl-totals");
  if(totEl) totEl.innerHTML=(cleanP?[
    {v:m.due,      l:"مستحقّة الآن",c:"var(--amber)"},
    {v:m.overdue,  l:"متأخّرة",    c:"var(--red)"},
    {v:m.doneToday,l:"نُفِّذت اليوم",c:"var(--green)"},
    {v:m.scheduled,l:"جدول اليوم", c:"#22C3D6"},
    {v:m.activeN,  l:"مهام نشطة",  c:"#6C8CC4"},
    {v:m.holiday?"إجازة":(m.coverage+"%"),l:"تغطية اليوم",c:"var(--brand)"}
  ]:[
    {v:m.newToday,l:"بلاغات اليوم",c:"var(--violet)"},
    {v:m.weekN,   l:"بلاغات الأسبوع",c:"#22C3D6"},
    {v:m.monthN,  l:"بلاغات الشهر",c:"var(--brand)"},
    {v:m.closedToday,l:"أُغلقت اليوم",c:"var(--green)"},
    {v:m.openN,   l:"بلاغات نشطة",c:"#6C8CC4"},
    {v:_fmtDur(m.mttrMs),l:"متوسط زمن الإغلاق",c:"var(--ink)",perf:1}
  ]).map(x=>`<div class="tvw-tot${x.perf?" tvw-tot-perf":""}" style="--c:${x.c}"><div class="tv tvw-num" style="color:${x.c}">${x.v}</div><div class="tl">${x.l}</div></div>`).join("");
}

function _tvwallStartClock(){
  if(_tvwall.clock) clearInterval(_tvwall.clock);
  const upd=()=>{
    const now=new Date();
    const c=document.getElementById("tvl-clock");
    const g=document.getElementById("tvl-date-g");
    const h=document.getElementById("tvl-date-h");
    if(c) c.textContent=now.toLocaleTimeString("ar-SA-u-nu-latn",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
    if(g) g.textContent=now.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
    if(h) h.textContent=now.toLocaleDateString("ar-SA-u-ca-islamic-umalqura-nu-latn",{day:"numeric",month:"long",year:"numeric"})+" هـ";
  };
  upd();
  _tvwall.clock=setInterval(upd,1000);
}

/* from: "picker" (من بوّابة المشاريع) أو "app" (من القائمة الجانبية داخل مشروع) */
async function openTVWall(from){
  const scr=document.getElementById("tvwall-screen");
  if(!scr) return;
  if(!currentUser){ try{ toast("⚠ سجّل الدخول أولاً","warn"); }catch(e){} return; }
  if(!_canSeeTVWall(currentUser)){ try{ toast("🔒 لا صلاحية لعرض مركز العمليات","warn"); }catch(e){} return; }
  _tvwall.ret = (from==="app") ? "app" : "picker";
  const pick=document.getElementById("project-screen");
  if(_tvwall.ret==="picker" && pick){ pick.style.display="none"; pick.classList.add("hidden"); }
  scr.classList.remove("hidden");
  scr.style.display="flex";
  _tvwall.open=true;
  _tvwallStartClock();
  const gridEl=document.getElementById("tvl-grid");
  if(gridEl && !_tvwall.projects.length){
    gridEl.innerHTML=`<div class="tvl-empty"><span class="lb-spin" style="border-color:rgba(120,155,215,.3);border-top-color:var(--brand);margin-inline-end:8px"></span>جاري تحميل المشاريع…</div>`;
  }
  try{ await loadProjects(); }catch(e){ console.warn("openTVWall/loadProjects",e); }
  if(!_tvwall.open) return;                       // أُغلقت أثناء التحميل
  _tvwall.projects=_visibleProjectsFor(currentUser);
  _tvwallSubscribe();
  renderTVWall();
  _tvwallShowScreen(_tvwall.idx);      // ابدأ من «الكل» (أو حيث توقّف المستخدم سابقاً)
  _tvwallRotRestart();
  _tvwallLoadBuildings();              // مبانِي كل مشروع — تُحدِّث اللوحات عند وصولها
  if(_tvwall.tick) clearInterval(_tvwall.tick);
  _tvwall.tick=setInterval(()=>{ if(_tvwall.open) renderTVWall(true); },TVWALL_TICK_MS);
  try{ logAudit("فتح مركز العمليات",_projCountAr(_tvwall.projects.length)); }catch(e){}
}

function closeTVWall(){
  const scr=document.getElementById("tvwall-screen");
  if(scr){ scr.classList.add("hidden"); scr.style.display="none"; }
  _tvwall.open=false;
  if(_tvwall.clock){ clearInterval(_tvwall.clock); _tvwall.clock=null; }
  if(_tvwall.tick){ clearInterval(_tvwall.tick); _tvwall.tick=null; }
  if(_tvwall.rotTimer){ clearInterval(_tvwall.rotTimer); _tvwall.rotTimer=null; }
  if(_tvwall.renderT){ clearTimeout(_tvwall.renderT); _tvwall.renderT=null; }
  try{ if(document.fullscreenElement) document.exitFullscreen(); }catch(e){}
  // المستمعون يبقون حيّين عمداً (انظر القرار أعلاه) — يُفكّون عند تسجيل الخروج.
  if(_tvwall.ret==="picker" && !CURRENT_PROJECT){
    const pick=document.getElementById("project-screen");
    if(pick){ pick.classList.remove("hidden"); pick.style.display="flex"; }
  }
}

/* فتحُ مشروعٍ من بطاقته. من داخل التطبيق يمرّ التبديلُ بمسار switchProject الرسمي —
   الدخولُ المباشر يترك مستمعي المشروع السابق حيّين على مجموعاته (تسرّبُ بيانات). */
function tvwallOpenProject(pid){
  const proj=(_tvwall.projects||[]).find(p=>p.id===pid);
  if(!proj) return;
  if(CURRENT_PROJECT && CURRENT_PROJECT.id===pid){ closeTVWall(); return; }
  _tvwall.ret="none";
  closeTVWall();
  if(CURRENT_PROJECT) switchProject();
  const pick=document.getElementById("project-screen");
  if(pick){ pick.classList.remove("hidden"); pick.style.display="flex"; }
  selectProject(pid);
}

// نصُّ زرّ ملء الشاشة وأيقونتُه — موضعٌ واحدٌ يعرفهما (الزرّ ومستمع fullscreenchange)
function _tvwallFsLabel(btn, full){
  if(!btn) return;
  btn.innerHTML=(full
    ? '<span class="tvl-i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg></span>خروج ملء الشاشة'
    : '<span class="tvl-i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg></span>ملء الشاشة');
}
function toggleTVWallFullscreen(){
  const el=document.getElementById("tvwall-screen");
  const btn=document.getElementById("tvl-fs-btn");
  if(!el) return;
  const isFull=!!(document.fullscreenElement||document.webkitFullscreenElement);
  if(!isFull){
    (el.requestFullscreen||el.webkitRequestFullscreen||function(){}).call(el).catch(()=>{});
    _tvwallFsLabel(btn,true);
  } else {
    (document.exitFullscreen||document.webkitExitFullscreen||function(){}).call(document).catch(()=>{});
    _tvwallFsLabel(btn,false);
  }
}

// Esc يغلق المركز (وبعد الخروج من ملء الشاشة لا قبله — فالضغطة الأولى تخرج من ملء الشاشة)
document.addEventListener("keydown",e=>{
  if(e.key==="Escape" && _tvwall.open && !document.fullscreenElement) closeTVWall();
});

/* ── بصمةُ البناء ──────────────────────────────────────────────────────────
   الخطرُ الموثَّق: ملفُّ `.js` منفصل قد يُخدَم **قديماً** من كاش الحافة بينما
   `index.html` يصل طازجاً — فيُنادي مستندٌ جديدٌ دوالَّ نسخةٍ قديمة. وهو بعينه ما
   أعاد `purchase-kpi` إلى داخل `index.html` (v18.9ti). فتُسجَّل الوحدةُ في كاشف
   الوحدات القديمة: يقارن `build` بـ`APP_VERSION` فيكشف التقادمَ بدل فشلٍ صامت.
   ومحتواها داخل IIFE عمداً — فلا تُضيف إلى النطاق العام إلا `window.operationsWall`.
   الرقمُ أدناه **لا يُحرَّر بيد**: `npm run stamp` يكتبه. ───────────────────── */
(function(){
  const MODULE_BUILD = "v18.9.2909";
  window.operationsWall = { build: MODULE_BUILD };
})();
