/* ═══════════════════════════════════════════════════════════════════════════
   sla-engine.js — محرّكُ SLA: مصدرٌ واحدٌ يقرؤه التطبيقان

   ── المشكلة التي يعالجها (رقمان لبلاغٍ واحد) ──
   كان لـ`tech-app.html` نسخةٌ **خاصّةٌ به** من المحرّك: خريطةُ `SLA` بمفاتيحَ نصّيةٍ
   و`isOverdue` تقيس **ساعاتٍ تقويميةً** بلا ساعاتِ عملٍ ولا إجازات. فبلاغٌ «عادي»
   يُقاس عند المدير بـ16 ساعةَ عمل وعند الفنّيّ بـ48 ساعةً تقويمية — **فيظهر البلاغُ
   نفسُه ملتزماً في شاشةٍ ومتأخّراً في أخرى**، ولا خطأَ يُنذر. ونسخةُ الفنّيّ لم تكن
   تعرف `clockStops` ولا فئةَ «روتيني»، وكانت `getSLA` فيها تسقط إلى 48 لكلّ أولويةٍ
   لا تطابق مفتاحَها حرفاً بحرف.
   وكلُّ إصلاحٍ في محرّكِ الإدارة كان يمرّ بجوار نسخةِ الفنّيّ بلا أن يمسّها.

   ── المبدأ ──
   **المهلةُ حكمٌ واحدٌ لا رأيان.** ملفٌّ واحدٌ يحمل المحرّكَ كلَّه، يقرؤه
   `index.html` و`tech-app.html` بوسم `<script>` واحدٍ لكلٍّ منهما — كما يفعل
   `photo-queue.js` بينهما.

   ── لماذا بلا "use strict" ──
   هذا **نقلٌ حرفيٌّ** لكتلةٍ عاشت في نطاقٍ غيرِ صارمٍ منذ v18.9hn. وإضافةُ الصرامة
   تغييرُ دلالةٍ يُخلَط بالنقل، والقاعدةُ أن النقلَ لا يُخلط بالتعديل. تُضاف وحدَها
   في تغييرٍ لاحقٍ إن استُحقّت.

   ── لماذا تُعرَض الأسماءُ على window واحداً واحداً ──
   التطبيقُ بلا bundler: كلُّ الوسوم تتشارك النطاقَ العام، ومئاتُ سماتِ `onclick`
   تستدعي بالاسم. ودوالُّ IIFE لا تصير خصائصَ للنافذة تلقائياً — فاسمٌ يسقط منها
   **زرٌّ ميتٌ بصمت**. فتُعرَض صراحةً، ويحرسه `global-surface-check.mjs`:
   **مفقود = صفر**. و`slaEngine` كائنُ الواجهة المسمّى كما تقتضي CLAUDE.md.

   ── حدُّ النقل ──
   ما بين علامتَي `==SLA-MOVED-*==` أدناه نُقل **بايتاً ببايت** من `index.html` في
   قيد النقل، وأُثبت حينَها بإعادةِ تركيبٍ طابقت الأصلَ حرفياً — وهو الضابطُ الذي
   يمسك خطأَ الحدود. **وقد تطوّر بعدها بتعديلاتٍ لاحقة** (أوّلُها فصلُ زمن الاستجابة
   عن زمن الإصلاح)، فلا تُقرأ الدعوى على الحاضر: برهانُها في تاريخ git عند قيد النقل.
   والعلامتان تبقيان لعملهما الجاري: بهما يُعيد `hail-tests` الكتلةَ إلى موضعها
   الأصليّ قبل الفحص، فلا يُتخطّى حارسٌ بصمت.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){

const MODULE_BUILD = "v18.9.3176";

/* ==SLA-MOVED-A-START== */
const PRIORITIES = ["حرج 🔴 (2 ساعة)","عاجل 🟡 (8 ساعات)","عادي 🟢 (48 ساعة)","روتيني 🔵 (صيانة دورية)"];
/* (v18.9zd) زالت خريطةُ `SLA` المفاتيحُ فيها النصُّ الكاملُ للأولوية. كان قارئُها
   الوحيدُ `getSLA`، وكانت تُخطئ صامتةً على كلّ إملاءٍ لا يطابق مفتاحَها حرفاً بحرف
   فتسقط إلى `||48`. المهلةُ الآن من `SLA_CONFIG` — مصدرُ القياس نفسُه. ولا تُعَد:
   خريطةٌ مفتاحُها نصٌّ معروضٌ تُعيد العلّةَ كما هي. */
/* ==SLA-MOVED-A-END== */

/* ==SLA-MOVED-B-START== */
/* المهلةُ بالساعات — **مشتقّةٌ من SLA_CONFIG** (مصدرُ القياس) لا من خريطةٍ مفتاحُها
   النصُّ الكاملُ للأولوية. كانت `SLA[p]` تُخطئ صامتةً على كلّ بلاغٍ أُنشئ من نموذج
   البلاغ (يخزّن «حرج (2 ساعة)» بلا إيموجي، والخريطةُ مفتاحُها «حرج 🔴 (2 ساعة)»)،
   فتسقط إلى `||48` وتعرض **٤٨ ساعةً لبلاغٍ حرجٍ مهلتُه ساعتان**. */
function getSLA(p){
  const k=tierOf(p), tier=k&&SLA_CONFIG.tiers[k];
  if(tier) return tier.budgetMin/60;
  return priorityHead(p)==="روتيني"?168:48;
}
function elapsedH(d){ return (Date.now()-new Date(d))/3600000; }
/* ═══════════ محرّك SLA بساعات العمل (v18.9hn) ═══════════
   • أيام العمل: السبت–الخميس (الجمعة إجازة)
   • الدوام 08:00–17:00 بينها راحة 13:00–14:00 = 8 ساعات فعلية/يوم
   • حرج=2س / عاجل=8س → تقويم 24/7 | عادي=يومَا عمل (16س فعلية) → ساعات العمل
   • «اقترب» = تبقّى ≤25% | روتيني مُستبعَد من المؤشر (دوري مخطّط له في PPM) */
const SLA_CONFIG = {
  workStartMin:8*60, workEndMin:17*60, breakStartMin:13*60, breakEndMin:14*60,
  workingDays:[6,0,1,2,3,4], approachRatio:0.25, holidays:[],
  tiers:{ 'حرج':{budgetMin:2*60,calendar:'24/7'}, 'عاجل':{budgetMin:8*60,calendar:'24/7'}, 'عادي':{budgetMin:16*60,calendar:'work'} }
};
function tierOf(p){ const k=priorityHead(p); return SLA_CONFIG.tiers[k]?k:null; }
/* ═══════════ الأولوية: قيمةٌ واحدةٌ وتسميةٌ مشتقّة (v18.9zd) ═══════════
   نصُّ الأولوية **هو القيمةُ المخزَّنة** في Firestore على كلّ بلاغ، وقد وُلد بإملاءين:
   نموذجُ البلاغ وفلترُ التقرير المصوَّر يكتبان «عادي (48 ساعة)» بلا إيموجي، بينما
   `PRIORITIES` (نافذةُ التعديل · التوليدُ من خطط الوقائية) تكتب «عادي 🟢 (48 ساعة)».
   فكلُّ مقارنةٍ حرفيةٍ بينهما قُرعةٌ صامتة:
   • نافذةُ التعديل تبني خياراتِها من `PRIORITIES` وتُعلّم `selected` بمطابقةٍ حرفية —
     فبلاغٌ بلا إيموجي **لا يطابق أيَّ خيار**، فيختار المتصفّحُ الأوّلَ (حرج)، وأيُّ
     حفظٍ بعده — ولو لتصحيح وصفٍ — **يرفع الأولويةَ إلى حرجٍ بصمت**.
   • فلترُ التقرير المصوَّر يقارن حرفياً كذلك، فيُخرج صفراً لما لا يوافق إملاءَه.
   الحلّ: **قراءةٌ متسامحةٌ وكتابةٌ معيارية** — لا هجرةَ بيانات (لا يُميَّز بلاغٌ حرجٌ
   أصلاً من آخرَ قُلب إليه). والرأسُ (أوّلُ كلمة) هو المشترَكُ بين كلّ الإملاءات. */
function priorityHead(p){ return p?String(p).trim().split(/\s+/)[0]:""; }
function priorityCanonical(p){
  const h=priorityHead(p); if(!h) return p||"";
  return PRIORITIES.find(x=>priorityHead(x)===h)||p;
}
function prioritySame(a,b){ return priorityHead(a)===priorityHead(b); }
/* تسميةُ المهلة كما يقرؤها المستخدم = الميزانيةُ التي يُقاس بها فعلاً.
   «عادي» يُقاس بـ16 ساعةَ عملٍ لا 48 تقويمية — والنصُّ المخزَّن يقول 48. */
function slaBudgetLabel(p){
  const k=tierOf(p), tier=k&&SLA_CONFIG.tiers[k];
  if(!tier) return priorityHead(p)==="روتيني"?"صيانة دورية مجدولة":"—";
  const h=tier.budgetMin/60;
  if(tier.calendar==='work') return h+" ساعة عمل";
  return h===1?"ساعة":h===2?"ساعتان":(h<11?h+" ساعات":h+" ساعة");
}
function priorityLabel(p){
  const head=String(priorityCanonical(p)).replace(/\s*\([^)]*\)\s*$/,"").trim();
  const b=slaBudgetLabel(p);
  return b==="—"?head:head+" ("+b+")";
}
function _ymd(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
// مفتاح الشهر المحلّي YYYY-MM (مكوّنات محلية لا UTC). v18.9sd: توحيد تجميع الشهور/
// الأيام على التوقيت المحلّي — كان بعض مواضع المشتريات/التقارير يستخدم
// toISOString().slice() (UTC) فيقع السجلّ في الشهر/اليوم الخطأ ضمن نافذة ±3س حول
// منتصف الليل/حدّ الشهر، ويتناقض مع جانب الصيانة الذي يبني مفاتيحه محلياً.
function _ym(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
// مُحلّل تاريخ-فقط آمن: "YYYY-MM-DD" → منتصف نهار محلّي، فلا ينزلق ليومٍ سابق عند
// التحويل (بخلاف new Date("YYYY-MM-DD") الذي يُفسَّر UTC-midnight).
function _parseLocalDate(s){ return (typeof s==="string" && /^\d{4}-\d{2}-\d{2}$/.test(s)) ? new Date(s+"T12:00:00") : new Date(s); }
function _isWorkingDay(d,cfg){ if(cfg.holidays.includes(_ymd(d))) return false; return cfg.workingDays.includes(d.getDay()); }
// v18.9vt: بلا setHours/setDate — الجذر الحقيقي لانهيار «Aw, Snap» في لوحة المعلومات.
// رُصد في الحقل: `Date.prototype.setHours called on incompatible receiver [object Date]`
// من هذه الدالة (عبر _closeWorkH ← renderKPIData ← renderDashboard). سببه أن كائن Date
// العام قد يكون ملفوفاً/معدَّلاً في بيئة المستخدم (إضافات المتصفّح تفعل ذلك)، فتفشل
// *مُعدِّلات* Date بينما البناء والقراءة تعملان. والأخطر أن تقدّم الحلقة كان يعتمد على
// `cur.setDate(...)` نفسه — فإن لم يُقدِّم صارت **حلقةً لا نهائية** تستنزف الصفحة حتى
// ينهار المتصفّح (وهو ما يفسّر انهيار مشروعٍ بعينه: لا يُبلَغ هذا المسار إلا عبر البلاغات
// المغلقة، فالمشاريع بلا مغلقات لا تصله). الآن: كل التواريخ تُبنى بالمُنشئ (لا مُعدِّلات
// إطلاقاً)، والتقدّم يوماً بيوم عبر بناء تاريخٍ جديد، مع حارسٍ صلبٍ يمنع اللانهاية أبداً.
function workingMinutesBetween(from,to,cfg){ cfg=cfg||SLA_CONFIG;
  const fromMs=+from, toMs=+to;
  if(!isFinite(fromMs)||!isFinite(toMs)||toMs<=fromMs) return 0;
  let total=0;
  let cur=new Date(new Date(fromMs).getFullYear(),new Date(fromMs).getMonth(),new Date(fromMs).getDate());
  const lastD=new Date(toMs), last=new Date(lastD.getFullYear(),lastD.getMonth(),lastD.getDate());
  let guard=0;                                  // سقف صلب: لا حلقة لا نهائية مهما حدث
  while(+cur<=+last && guard++<20000){
    if(_isWorkingDay(cur,cfg)){
      const dsMs=+cur;                          // منتصف الليل المحلّي بالبناء — بلا setHours
      const wS=dsMs+cfg.workStartMin*6e4, wE=dsMs+cfg.workEndMin*6e4;
      const bS=dsMs+cfg.breakStartMin*6e4, bE=dsMs+cfg.breakEndMin*6e4;
      const s=Math.max(fromMs,wS), e=Math.min(toMs,wE);
      if(e>s){ let m=(e-s)/6e4; const bs=Math.max(s,bS), be=Math.min(e,bE); if(be>bs) m-=(be-bs)/6e4; total+=m; }
    }
    cur=new Date(cur.getFullYear(),cur.getMonth(),cur.getDate()+1);   // تقدّم بالبناء لا بالتعديل
  }
  return total; }
function calendarMinutesBetween(from,to){ return to<=from?0:(to-from)/6e4; }
// v18.9vt: نفس التحصين — بلا مُعدِّلات Date إطلاقاً (بناءٌ فقط)، فلا تفشل ولا تعلق.
function addWorkingMinutes(start,need,cfg){ cfg=cfg||SLA_CONFIG;
  let rem=need; const startMs=+start;
  if(!isFinite(startMs)) return new Date(NaN);
  let curMs=startMs, g=0;
  while(rem>0 && g++<4000){
    const c=new Date(curMs);
    const day=new Date(c.getFullYear(),c.getMonth(),c.getDate());
    const dsMs=+day;                                   // منتصف الليل المحلّي بالبناء
    const nextDayMs=+new Date(c.getFullYear(),c.getMonth(),c.getDate()+1);
    if(!_isWorkingDay(day,cfg)){ curMs=nextDayMs; continue; }
    const wS=dsMs+cfg.workStartMin*6e4, wE=dsMs+cfg.workEndMin*6e4;
    const bS=dsMs+cfg.breakStartMin*6e4, bE=dsMs+cfg.breakEndMin*6e4;
    const p=Math.max(curMs,wS);
    if(p>=wE){ curMs=nextDayMs; continue; }
    const segs=[[p,bS],[Math.max(p,bE),wE]];
    for(const [sS,sE] of segs){ if(rem<=0) break; const s=Math.max(sS,p); if(sE<=s) continue;
      const av=(sE-s)/6e4; if(av>=rem) return new Date(s+rem*6e4); rem-=av; }
    curMs=nextDayMs; }
  return new Date(curMs); }
/* ═══════════ خصمُ الإيقاف الموثَّق من الزمن المنقضي (v18.9zc) ═══════════
   `perfClockToggle` يَعِد المستخدمَ حرفياً: «الفترةُ الموثَّقة تُستبعَد من زمن
   الاستجابة والإصلاح» — و`slaStatus` لم تكن تقرأ `clockStops` إطلاقاً. فالحقلُ
   يُكتب ويُعرَض في الخطّ الزمنيّ ثم يُهمَل، والفريقُ يوثّق أعذارَه بانضباطٍ
   فتُحتسب كلُّها ضدَّه. وفي عقدٍ قائمٍ على الأداء هذا تسرّبُ درجاتٍ مباشرٌ إلى
   خصمٍ نقديٍّ شهريّ.
   • الفتراتُ **تُدمَج** قبل الجمع فلا يُحتسب تداخلٌ مرّتين (الواجهةُ تمنع إيقافين
     مفتوحين، لكنّ الدمجَ يحمي من بياناتٍ قديمةٍ أو تحريرٍ متزامن).
   • الإيقافُ المفتوح (`to=null`) ينتهي عند **طرف نافذة القياس** لا عند الأبد.
   • يُقاس بتقويم الفئة نفسِه: ساعاتُ عملٍ لـ«عادي»، تقويميٌّ لـ«حرج/عاجل» — وإلا
     خُصمت ساعاتُ ليلٍ لم تكن محسوبةً أصلاً فصار الخصمُ هديّةً لا إنصافاً. */
function clockStopMinutes(stops,from,to,useWork,cfg){
  if(!Array.isArray(stops)||!stops.length) return 0;
  cfg=cfg||SLA_CONFIG;
  const fromMs=+from, toMs=+to;
  if(!isFinite(fromMs)||!isFinite(toMs)||toMs<=fromMs) return 0;
  const iv=[];
  for(const s of stops){
    if(!s||!s.from) continue;
    const a=+new Date(s.from), b=s.to?+new Date(s.to):toMs;
    if(!isFinite(a)||!isFinite(b)) continue;
    const lo=Math.max(a,fromMs), hi=Math.min(b,toMs);
    if(hi>lo) iv.push([lo,hi]);
  }
  if(!iv.length) return 0;
  iv.sort((x,y)=>x[0]-y[0]);
  const merged=[iv[0].slice()];
  for(let i=1;i<iv.length;i++){
    const last=merged[merged.length-1];
    if(iv[i][0]<=last[1]){ if(iv[i][1]>last[1]) last[1]=iv[i][1]; }
    else merged.push(iv[i].slice());
  }
  let total=0;
  for(const [a,b] of merged) total+=useWork?workingMinutesBetween(a,b,cfg):calendarMinutesBetween(a,b);
  return total; }
function slaStatus(tierName,createdAt,now,cfg,stops){ cfg=cfg||SLA_CONFIG; now=now||new Date();
  const tier=cfg.tiers[tierName]; if(!tier) return null;
  const isW=tier.calendar==='work';
  const gross=isW?workingMinutesBetween(createdAt,now,cfg):calendarMinutesBetween(createdAt,now);
  const stopped=clockStopMinutes(stops,createdAt,now,isW,cfg);
  const elapsed=Math.max(0,gross-stopped);
  const budget=tier.budgetMin, remaining=budget-elapsed;
  // المهلةُ تُزاح بقدر ما أُوقفت الساعةُ فعلاً — بوحدة التقويم نفسِها.
  const dueAt=isW?addWorkingMinutes(createdAt,budget+stopped,cfg):new Date(createdAt.getTime()+(budget+stopped)*6e4);
  let state; if(remaining<=0) state='تجاوز'; else if(remaining<=budget*cfg.approachRatio) state='اقترب'; else state='داخل الوقت';
  return { tier:tierName, state, calendar:tier.calendar, elapsedMin:Math.round(elapsed), budgetMin:budget,
    remainingMin:Math.round(remaining), pct:Math.min(100,Math.round(elapsed/budget*100)), dueAt,
    stoppedMin:Math.round(stopped), paused:Array.isArray(stops)&&stops.some(s=>s&&s.from&&!s.to) }; }
/* الحالة الكاملة لبلاغ (أو null لو مُستبعَد كـروتيني) */
function slaOf(t){ if(!t||!t.createdAt) return null; return slaStatus(tierOf(t.priority), kpiClockStart(t), null, null, t.clockStops); }

function isOverdue(t){ if(t.status==="مغلق") return false; const st=slaOf(t); return st?st.state==="تجاوز":false; }
// حساب زمن الاستجابة: للبلاغات المغلقة = الفرق بين وقت الإغلاق ووقت الفتح، للمفتوحة = الوقت حتى الآن
// ساعات فعلية بين وقتين حسب تقويم مستوى الأولوية (عادي=ساعات عمل، غيره=تقويمي)
// v18.9zc: `stops` تُخصَم هنا أيضاً — فمتوسطاتُ التقارير وزمنُ الاستجابة تقرأ من
// هذه الدالّة، ولو خُصم الإيقافُ في `slaStatus` وحدها لتناقض «متأخّر» مع «زمنُ
// إغلاقه كذا» على الشاشة نفسِها.
function _elapsedHByTier(priority,from,to,stops){
  const k=tierOf(priority);
  const useWork=k && SLA_CONFIG.tiers[k] && SLA_CONFIG.tiers[k].calendar==='work';
  const gross=useWork?workingMinutesBetween(from,to):calendarMinutesBetween(from,to);
  return Math.max(0,gross-clockStopMinutes(stops,from,to,useWork,SLA_CONFIG))/60;
}
// مدة إغلاق بلاغ مغلق حسب تقويم مستواه (تُستخدم في متوسطات التقارير)
function _closeWorkH(t){
  if(!t||!t.createdAt||!t.closedAt) return 0;
  return _elapsedHByTier(t.priority,kpiClockStart(t),new Date(t.closedAt),t.clockStops);
}
// أُغلق ضمن مهلته؟ — ساعات العمل للإغلاق (_closeWorkH) ضمن ميزانية فئته
// (SLA_CONFIG.budgetMin)، وهو نفس أساس isOverdue. مواضع الالتزام كانت تقارن ساعات
// العمل بـ getSLA (ساعات الأولوية *التقويمية*: 48 لعادي)، فتُظهر «عادي» ملتزماً حتى
// 48 ساعة عمل بينما مهلته 16 — متناقضةً مع isOverdue على الشاشة نفسها. getSLA يبقى
// للعرض النصّي (تسمية المهلة) فقط، لا لقياس الالتزام.
function _closedOnTime(t){
  if(!t || t.status!=="مغلق" || !t.createdAt || !t.closedAt) return false;
  const k = tierOf(t.priority);
  const budgetH = (k && SLA_CONFIG.tiers[k]) ? SLA_CONFIG.tiers[k].budgetMin/60 : 48;
  return _closeWorkH(t) <= budgetH + 1e-6;
}
/* ═══════════ فصلُ زمن الاستجابة عن زمن الإصلاح (v18.9zf) ═══════════
   العقدُ القائم على الأداء يقيسهما **مؤشّرين مستقلّين**: «متى وصلَ الفنّيّ» غيرُ
   «متى عادت الخدمة». وكان في المنصّة رقمٌ واحدٌ اسمُه `responseH` ومعناه زمنُ
   الإقفال — فالتسميةُ تَعِد بما لا تقيس، وتقريرٌ يُبنى عليها يخلط المؤشّرين.
   • `resolutionH` — الاسمُ الصادق لما كانت تقيسه: البلاغ ← الإقفال (أو ← الآن).
   • `firstResponseH` — البلاغ ← **وصولُ الفنّيّ** (`respondedAt`)، وهو الطابعُ الذي
     يُكتب مرّةً واحدةً عند أوّل بدءٍ في تطبيق الفنّيّ وبزرّ «وصلتُ للموقع».
   وكلاهما بتقويم الفئة وبخصمِ الإيقاف الموثَّق — فالمقياسان متّسقان مع `isOverdue`.

   **ولِمَ `null` لا صفر عند غياب الطابع؟** لأن الصفرَ يدخل المتوسّطَ فيجمّله:
   بلاغٌ لم يُسجَّل وصولُه يُقرأ «استُجيب فوراً». و`null` تُخرجه من القياس وتُحصى
   في التغطية — وهي القراءةُ الصادقة: **متوسّطٌ بلا تغطيةٍ بجانبه رقمٌ أعمى.** */
function resolutionH(t){
  if(!t||!t.createdAt) return 0;
  const to=(t.status==="مغلق" && t.closedAt)?new Date(t.closedAt):new Date();
  return _elapsedHByTier(t.priority,kpiClockStart(t),to,t.clockStops);
}
function firstResponseH(t){
  if(!t||!t.createdAt||!t.respondedAt) return null;
  const c=new Date(t.createdAt), to=new Date(t.respondedAt);
  if(!isFinite(+c)||!isFinite(+to)||to<c) return null;   // طابعٌ فاسدٌ (قبل التسجيل) لا يُقاس
  // وصولٌ قبل الاستحقاق = صفر لا null: الفنّيُّ سبق موعدَه، والقياسُ يبدأ منه
  return _elapsedHByTier(t.priority,kpiClockStart(t),to,t.clockStops);
}
/* متوسّطُ زمن الاستجابة مع تغطيتِه — لا يُفصلان: الرقمُ بلا مقامِه يُقرأ خطأً.
   `avg` = null متى لم يُسجَّل وصولٌ واحد، فلا يُعرَض صفرٌ كإنجاز. */
function firstResponseStats(list){
  const all=(Array.isArray(list)?list:[]).filter(t=>t&&t.createdAt);
  const vals=[]; for(const t of all){ const h=firstResponseH(t); if(h!==null) vals.push(h); }
  return { avg: vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null,
           n: vals.length, d: all.length,
           coverage: all.length?Math.round(vals.length/all.length*100):null };
}

/* ═══════════ المؤشراتُ السبعة بنافذةٍ شهرية (v18.9zg) ═══════════
   كانت تُحسب على كلّ البلاغات منذ أوّل يومٍ في العقد: 648 في المقام، والشهرُ يضيف
   ~20 — **فأسوأُ شهرٍ في التاريخ يحرّك المؤشرَ أقلَّ من نقطة**، وبند 62 يخصم على
   درجة **الشهر**. القاعدةُ من `docs/performance-kpi-model.md`: «ما استُحقّ في
   الشهر مقابل ما أُنجز منه في الشهر».
   • شهرُ البلاغ = شهرُ إنشائه (`archiveMonth` للمؤرشَف) — **التعريفُ نفسُه** الذي
     تستعمله «المقارنةُ الشهرية» و`_accumTicket`، فلا يظهر رقمان لشهرٍ واحد.
   • الوقائيُّ (KPI-05) بشهر **استحقاقه** `scheduledFor` لا إنشائه، ويُعدّ ملتزماً
     إن أُغلق **قبل انقضاء شهر استحقاقه** — قاعدةٌ بلا رقمٍ مخترَع: لا «±7 أيام» لا
     سندَ له في الكراسة. وما لا يحمل `scheduledFor` (ما قبل v18.9af) لا يدخل.
   • المتأخّرة (KPI-07) **حالةٌ لحظيةٌ لا شهرية**: المتأخّرةُ ÷ **المفتوحةُ الآن**.
     كان مقامُها كلَّ التاريخ فلا تهبط تحت 96٪ ولو تأخّر كلُّ مفتوح.
   • `null` حيث لا مقام — لا صفرٌ ولا 100 تُقرأ إنجازاً. */
/* ═══════════ مصنِّفٌ واحدٌ للوقائي (v18.9zi — قرارُ المالك) ═══════════
   «روتيني» = وقائيٌّ في كلّ المؤشرات. الأولويةُ «روتيني» تعني صيانةً دوريةً مخطَّطةً
   وإن كُتب البلاغُ بلا `maintType`، فتُقاس بجدولها (KPI-05) لا بمهلة `SLA`.
   وكان الوقائيُّ يدخل KPI-02 وKPI-03: بلاغٌ وُلّد قبل موعده بثلاثة أيامٍ وأُغلق في
   موعده تماماً يُعدّ «تجاوز SLA» — وهو لم يتأخّر عن شيء. و`isOverdue` تقول عن
   «روتيني» «لا مهلة له» بينما `_closedOnTime` تُسقطه إلى 48 ساعةً: حكمان لبلاغٍ
   واحد. المصنِّفُ واحدٌ تقرؤه كلُّ المواضع (المحرّك · التجميعُ الشهريّ · المقارنةُ ·
   بطاقةُ العقد) **لفصل التصحيحيّ عن الوقائيّ وحسب** — وبقرار المالك (v18.9zj) يبقى
   الوقائيُّ داخلَ مؤشّرات المهلة كما كان. */
function isPreventiveTicket(t){
  if(!t) return false;
  return t.maintType==="وقائية" || priorityHead(t.priority)==="روتيني";
}
/* ═══════════ بدايةُ الساعة (v18.9zk — قرارُ المالك) ═══════════
   الوقائيُّ لا يكون «متأخّراً» قبل أن يحلّ موعدُه. كانت ساعتُه تبدأ من **توليد** بلاغه —
   وقبل 09/09 كان التوليدُ يسبق الاستحقاقَ بثلاثة أيام — فبلاغٌ أُغلق في يومه (مثل
   `PPM-2026-0032`: وُلّد 2 سبتمبر، استحقاقُه 5، أُغلق 5) يُقرأ **80 ساعةً** فيتجاوز
   الـ48 في KPI-03 والـ8 في KPI-02 ويرفع المتوسط. الآن: بدايةُ الساعة = **الأحدثُ من
   (التوليد، الاستحقاقِ عند بدء الدوام)**. والتصحيحيُّ بلا `scheduledFor` لا يُمسّ.
   وكلُّ ما يقيس زمناً يقرأ من هنا: `slaOf` · `_closeWorkH` · `resolutionH` ·
   `firstResponseH` — فلا يبقى بلاغٌ يُقاس من نقطتين. والاستحقاقُ تاريخٌ بلا ساعة
   (`YYYY-MM-DD`) فيُحلَّل محلياً (`_parseLocalDate`) لا UTC. */
function kpiClockStart(t){
  const c=new Date(t&&t.createdAt);
  if(!t||!isPreventiveTicket(t)||!t.scheduledFor||!isFinite(+c)) return c;
  const d=_parseLocalDate(t.scheduledFor); if(!isFinite(+d)) return c;
  const due=new Date(d.getFullYear(),d.getMonth(),d.getDate(),Math.floor(SLA_CONFIG.workStartMin/60),SLA_CONFIG.workStartMin%60,0);
  return due>c?due:c;
}
function kpiMonthOf(t){
  if(!t) return null;
  if(t.archiveMonth) return t.archiveMonth;
  if(!t.createdAt) return null;
  const d=new Date(t.createdAt); return isFinite(+d)?_ym(d):null;
}
function ppmOnTimeInMonth(t, ym){
  if(!t || t.status!=="مغلق" || !t.closedAt || !t.scheduledFor) return false;
  const due=new Date(t.scheduledFor), done=new Date(t.closedAt);
  if(!isFinite(+due)||!isFinite(+done)||_ym(due)!==ym) return false;
  return done < new Date(due.getFullYear(), due.getMonth()+1, 1);   // قبل أوّل الشهر التالي
}
function kpiMonthStats(list, ym, opts){
  opts=opts||{}; const targetH=opts.responseTargetH||8;
  const all=(Array.isArray(list)?list:[]).filter(t=>t&&t.createdAt);
  const inMonth=all.filter(t=>kpiMonthOf(t)===ym);
  const closed=inMonth.filter(t=>t.status==="مغلق");
  const corrective=inMonth.filter(t=>!isPreventiveTicket(t));
  const preventive=inMonth.filter(t=>isPreventiveTicket(t));
  const corrClosed=corrective.filter(t=>t.status==="مغلق").length;
  const prevClosed=preventive.filter(t=>t.status==="مغلق").length;
  /* v18.9zj: مؤشّرا المهلة (02 · 03) على **كلّ المغلقة** — الوقائيُّ فيها كما كان.
     قرارُ المالك: المصنِّفُ يفرّق التصحيحيَّ عن الوقائيّ (KPI-01 · KPI-05) ولا يُخرج
     الوقائيَّ من مؤشّرات المهلة. */
  const closedTix=closed.filter(t=>t.closedAt);
  const hours=closedTix.map(_closeWorkH);
  const avgCloseH=hours.length?hours.reduce((a,b)=>a+b,0)/hours.length:null;
  const medianCloseH=_median(hours);
  const closedInSLA=closedTix.filter(_closedOnTime).length;
  const closedWithinTarget=closedTix.filter(t=>_closeWorkH(t)<=targetH).length;
  const reopenedClosed=closed.filter(t=>t.reopenCount>0).length;
  const due=all.filter(t=>isPreventiveTicket(t) && t.scheduledFor && isFinite(+new Date(t.scheduledFor)) && _ym(new Date(t.scheduledFor))===ym);
  const ppmOnTime=due.filter(t=>ppmOnTimeInMonth(t,ym)).length;
  const pct=(a,b)=> b?Math.round(a/b*100):null;
  return {
    ym, n:inMonth.length, closed:closed.length,
    corrective:corrective.length, corrClosed, preventive:preventive.length, prevClosed,
    closedTix:closedTix.length, avgCloseH, medianCloseH, closedInSLA, closedWithinTarget, reopenedClosed,
    ppmDue:due.length, ppmOnTime,
    rates:{
      k01: pct(corrClosed, corrective.length),
      /* v18.9zh: عدٌّ لا متوسّط. كان `8 ÷ المتوسط` — فبلاغٌ واحدٌ بثلاثمئة ساعةٍ يسحب
         الشهرَ كلَّه من 90٪ إلى 26٪، والبطاقةُ تعرض 35 و81 ولا تحسب النسبةَ منهما.
         الآن: أُغلق خلال الهدف ÷ المغلقة — ما يقرؤه الناظرُ هو ما يُحسب. */
      k02: pct(closedWithinTarget, closedTix.length),
      k03: pct(closedInSLA, closedTix.length),
      k04: closed.length ? Math.round((1-reopenedClosed/closed.length)*100) : null,
      k05: pct(ppmOnTime, due.length),
      k06: pct(closed.length, inMonth.length)
    }
  };
}
/* الوسيط: الرقمُ الذي لا تسحبه ثلاثةُ بلاغاتٍ شاذّة — للسياق بجوار المتوسط. */
function _median(arr){
  const a=(arr||[]).filter(x=>Number.isFinite(x)).sort((x,y)=>x-y);
  if(!a.length) return null;
  const m=a.length>>1; return a.length%2 ? a[m] : (a[m-1]+a[m])/2;
}
function kpiLiveOverdue(list){
  const open=(Array.isArray(list)?list:[]).filter(t=>t&&t.status!=="مغلق");
  const overdue=open.filter(t=>isOverdue(t)).length;
  return { open:open.length, overdue, pct: open.length ? Math.max(0,100-Math.round(overdue/open.length*100)) : 100 };
}
/* ==SLA-MOVED-B-END== */

/* ــ عرضُ السطح العام ــ كلُّ اسمٍ كان عالمياً قبل النقل يبقى عالمياً بعده.
   ويُمرَّر ككائنٍ مجهولٍ بلا `var` وسيطة: كلُّ اسمٍ جديدٍ يُعلَن هنا يدخل قائمةَ
   `global-surface-check` فيُقرأ إضافةً على السطح — والنقلُ الحرفيُّ لا يضيف اسماً. */
(function(x){
  for (var k in x) if (Object.prototype.hasOwnProperty.call(x,k)) window[k] = x[k];
  /* كائنُ الواجهة المسمّى — للقراءة المقصودة ولفحصِ البناء. */
  window.slaEngine = Object.assign({ build: MODULE_BUILD }, x);
})({ PRIORITIES, getSLA, elapsedH, SLA_CONFIG, tierOf, priorityHead, priorityCanonical, prioritySame, slaBudgetLabel, priorityLabel, _ymd, _ym, _parseLocalDate, _isWorkingDay, workingMinutesBetween, calendarMinutesBetween, addWorkingMinutes, clockStopMinutes, slaStatus, slaOf, isOverdue, _elapsedHByTier, _closeWorkH, _closedOnTime, resolutionH, firstResponseH, firstResponseStats, isPreventiveTicket, kpiClockStart, kpiMonthOf, ppmOnTimeInMonth, kpiMonthStats, kpiLiveOverdue });

})();
