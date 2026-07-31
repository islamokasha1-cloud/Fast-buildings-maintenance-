/* ═══════════════════════════════════════════════════════════════════════════
   نظام هيل — وحدة تشغيل النظافة  (cleaning-operations.js)   [المرحلة ٢-أ]
   ملف خارجي مستقل على نمط project-management.js: IIFE يعرض window.cleaningOps،
   يركّب صفحته ذاتياً (page-cleaning-ops) ويحقن زرّها في القائمة الجانبية ويلفّ
   showPage — فلا يحتاج من index.html إلا وسم <script> واحد.

   يقرأ خدمات النواة بالاسم (db / esc / toast / currentUser / showConfirm / logAudit /
   CURRENT_PROJECT / BUILDINGS / getPPMBuildingFloors / _ymd / _parseLocalDate /
   _aiText / IS_DEV) — كل وسوم <script> الكلاسيكية تتشارك البيئة العامة.

   ── الفكرة الحاكمة ──
   النظافة عملٌ **استباقيٌّ بالكامل**: ٩٥٪ منه جدولٌ يوميٌّ مخطَّط، والشكوى استثناءٌ يدلّ
   على خللٍ في التنفيذ — عكس الصيانة التفاعلية. لذلك «الجدول اليومي» هو الشاشة المحورية.
   المناطق = المباني/الأدوار القائمة (BUILDINGS) بلا كيانٍ مكانيٍّ جديد (قرار المستخدم).

   ── نطاق هذه المرحلة ──
   • لوحة اليوم: مستحق اليوم / نُفِّذ اليوم / متأخّر / **نسبة التغطية**.
   • مهام دورية متكرّرة (يومي…سنوي) مجمّعة حسب المبنى، بقوائم فحصٍ لكل مهمة.
   • التنفيذ بقائمة فحص → يقدّم الاستحقاق التالي ويُسجَّل في سجلّ التنفيذ.
   • توليد جدول المهام بالذكاء الاصطناعي (يعيد استخدام _aiText).

   ── مؤجَّل (موثّق في docs/cleaning-operations-proposal.md) ──
   الحضور المربوط بالمشروع والتغطية بالعمالة، شكاوى النظافة بلغتها، جولات الجودة بالتقييم.

   ── الهوية البصرية: لغة المنصة نفسها، لا لغةٌ موازية ──
   الصفحة لا تخترع مفرداتٍ بصرية: تستخدم أصنافَ المنصة الأصلية كما هي —
   .page-hero (رأس الصفحة) · .stat-tile (بلاطات المؤشّرات) · .card (الحاويات) ·
   .ppm-card/.ppm-chip/.ppm-pill/.ppm-due-badge/.ppm-meta-row (بطاقةُ عملٍ دوريّ، وهي
   مفردةُ المنصة لهذا النوع من المحتوى بالضبط) · .ppm-overdue-banner (تنبيه التأخّر) ·
   .hbar/.hleg (شريط الصحة المُقسَّم — يعبّر عن التغطية بلغة المنصة نفسها) · .btn ·
   .form-group/.form-label/.form-input. فتتبع الصفحةُ أيَّ تغييرٍ في هوية المنصة تلقائياً،
   وتعمل في الثيمين الفاتح والداكن بلا كودٍ إضافي. الـ CSS الخاص بها طبقةٌ رقيقةٌ لما لا
   مقابل له فقط (بنود قائمة الفحص، ترويسة القسم، الحالة الفارغة، الجدول).

   ── ملاحظة تقنية مقصودة ──
   لا onSnapshot في هذه الوحدة إطلاقاً: القراءة بـ .get() عند العرض فقط. سببه انضباط
   المستمعين في هذا النظام (تراكم targetId يُطلق خلل Firestore الداخلي ca9/b815) — فلا
   نضيف مستمعاً جديداً مربوطاً بالمشروع بلا حاجة. التحديث بزرّ «تحديث» وبعد كل كتابة.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
"use strict";

const PAGE_ID = "cleaning-ops";
const VERSION = "0.1";
const MODULE_BUILD = "v18.9ug";

/* ════════════ ثوابت النطاق ════════════ */
// أنواع عمل النظافة الافتراضية — بذرةٌ أولية تُعدَّل من إعدادات المشروع كالمعتاد.
const CLEANING_WORK_TYPES = {
  "نظافة دورات المياه":      { icon:"droplet" },
  "نظافة الأرضيات":          { icon:"tile" },
  "نظافة الزجاج والواجهات":  { icon:"frame" },
  "إدارة النفايات":          { icon:"trash" },
  "نظافة المكاتب والأثاث":   { icon:"briefcase" },
  "المساحات الخارجية":       { icon:"map" },
  "النظافة العميقة الدورية": { icon:"sparkles" },
  "أخرى":                    { icon:"paintbrush" }
};
const WT_KEYS = Object.keys(CLEANING_WORK_TYPES);

// نفس تكرارات الوقائية القائمة (PPM_FREQ_DAYS) — «يومي» هو قلب النظافة.
const FREQ_DAYS = { "يومي":1, "أسبوعي":7, "شهري":30, "ربع سنوي":90, "نصف سنوي":180, "سنوي":365 };
const FREQ_KEYS = Object.keys(FREQ_DAYS);

/* ════════════ خدمات النواة (قراءة بالاسم مع بدائل آمنة) ════════════ */
function _db(){ try{ return (typeof db!=="undefined" && db) ? db : null; }catch(e){ return null; } }
function _esc(s){ try{ return (typeof esc==="function") ? esc(s) : String(s==null?"":s); }catch(e){ return String(s==null?"":s); } }
function _toast(m,t){ try{ toast(m,t); }catch(e){ console.log(m); } }
function _audit(a,d){ try{ if(typeof logAudit==="function") logAudit(a,d); }catch(e){} }
function _user(){ try{ return currentUser||null; }catch(e){ return null; } }
function _role(){ const u=_user(); return u&&u.role ? u.role : ""; }
function _userName(){ const u=_user(); return (u&&u.name)||(u&&u.email)||""; }
function _icon(name){ try{ return (typeof _ic==="function") ? _ic(name) : ""; }catch(e){ return ""; } }
/* ★ كلُّ أيقونةٍ تخرج من هذه الوحدة بأبعادٍ صريحة.
   السبب: _svgIcon في النواة يُرجع <svg> بلا width/height، وSVG بلا أبعاد داخل حاوية
   flex **يتمدّد ليملأها** — وهو ما أنتج أيقوناتٍ بحجم الشاشة ثلاث مرّات (شريط التنبيه،
   أرشيف البلاغات، بنود قائمة الفحص). المعالجة هنا عند المنبع لا في كل حاوية: الـCSS
   يتغلّب على السمات، فكلُّ حاويةٍ لها قاعدةُ حجمٍ (من المنصة أو منّا) تبقى كما هي
   تماماً، وما لا قاعدةَ له يحصل على حجمٍ معقولٍ بدل التمدّد. */
function _svg(name, size){
  try{
    const raw=(typeof _svgIcon==="function") ? _svgIcon(name) : "";
    if(!raw) return "";
    const n=size||16;
    // \b فيلتقط <svg> و<svg ...> معاً — لا يفلت شكلٌ بلا أبعاد
    return raw.replace(/^<svg\b/, '<svg width="'+n+'" height="'+n+'"');
  }catch(e){ return ""; }
}
function _isDev(){ try{ return (typeof IS_DEV!=="undefined") && !!IS_DEV; }catch(e){ return false; } }
function _proj(){ try{ return (typeof CURRENT_PROJECT!=="undefined") ? CURRENT_PROJECT : null; }catch(e){ return null; } }
function _projId(){ const p=_proj(); return p ? p.id : ""; }
function _buildings(){ try{ return Array.isArray(BUILDINGS) ? BUILDINGS : []; }catch(e){ return []; } }
function _floorsOf(b){
  try{ if(typeof getPPMBuildingFloors==="function"){ const f=getPPMBuildingFloors(b); if(Array.isArray(f)) return f; } }catch(e){}
  return [];
}
// تواريخ محلّية (نفس اصطلاح النواة: تاريخ-فقط يُحلّ منتصف النهار فلا ينزلق ليومٍ سابق)
function _ymdL(d){ try{ if(typeof _ymd==="function") return _ymd(d); }catch(e){}
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function _pDate(s){ try{ if(typeof _parseLocalDate==="function") return _parseLocalDate(s); }catch(e){}
  return (typeof s==="string" && /^\d{4}-\d{2}-\d{2}$/.test(s)) ? new Date(s+"T12:00:00") : new Date(s); }
function _today(){ return _ymdL(new Date()); }
function _addDays(ymd, n){ const d=_pDate(ymd); d.setDate(d.getDate()+n); return _ymdL(d); }
function _dayDiff(a,b){ const x=_pDate(a), y=_pDate(b); x.setHours(12,0,0,0); y.setHours(12,0,0,0);
  return Math.round((x-y)/86400000); }
function _uid(){ return "clt_"+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

/* ════════════ الصلاحيات ════════════ */
// العرض: أي دورٍ معروف. التحرير (إنشاء/تعديل/حذف المهام): الأدمن ومدير المشروع.
// التنفيذ (تعليم مهمةٍ منجزة): يضاف إليهم المشرف والفني — فهم من ينفّذ ميدانياً.
function canView(){ return !!_role(); }
function canEdit(){ const r=_role(); return r==="admin"||r==="project_manager"; }
function canExecute(){ const r=_role(); return canEdit()||r==="supervisor"||r==="technician"; }

/* ════════════ هل المشروع الحالي مشروع نظافة؟ ════════════
   مصدران للنوع في النظام: سجلّ المشروع (meta/projects عبر نافذة تعديل المشروع) ومستند
   الموازنة (meta/{id}_budget عبر بطاقة المشروع). نقرأ الأول بلا تكلفة، فإن لم يكن نظافةً
   نتحقّق من الثاني مرّةً واحدة لكل مشروع (مستندٌ صغير) — فلا يختلف التصنيف بين الشاشتين. */
let _typeCache = {};   // projId → "cleaning" | "other"
let _typeChecking = {};
function isCleaningProject(){
  const p=_proj(); if(!p) return false;
  if(p.type==="cleaning") return true;
  return _typeCache[p.id]==="cleaning";
}
function ensureTypeKnown(cb){
  const p=_proj(); if(!p) return;
  if(p.type==="cleaning"){ _typeCache[p.id]="cleaning"; if(cb) cb(); return; }
  if(p.id in _typeCache){ if(cb) cb(); return; }
  if(_typeChecking[p.id]) return;
  const database=_db(); if(!database){ _typeCache[p.id]="other"; if(cb) cb(); return; }
  _typeChecking[p.id]=true;
  database.doc("meta/"+_safeKey(p.id)+"_budget").get()
    .then(snap=>{ const d=(snap&&snap.exists)?(snap.data()||{}):{};
      _typeCache[p.id] = (d.type==="cleaning") ? "cleaning" : "other"; })
    .catch(()=>{ _typeCache[p.id]="other"; })
    .then(()=>{ _typeChecking[p.id]=false; if(cb) cb(); });
}
function _safeKey(projId){ return String(projId).replace(/[\/.]/g,"_"); }

/* ════════════ مسارات المجموعات (معزولة لكل مشروع كبقية النظام) ════════════ */
function tasksCol(){ const id=_projId(); if(!id) return ""; return id+"_cleaning_tasks"+(_isDev()?"_dev":""); }
function logCol(){   const id=_projId(); if(!id) return ""; return id+"_cleaning_log"+(_isDev()?"_dev":""); }
function cfgDoc(){   const id=_projId(); if(!id) return ""; return "meta/"+_safeKey(id)+"_cleaning_cfg"+(_isDev()?"_dev":""); }

/* ════════════ ربط المشرف بمبانيه ════════════
   النواة تحفظ المشرفين قائمةَ أسماءٍ مسطّحة بلا نطاقٍ مكاني. نضيف الخريطة في مستندٍ
   خاصٍّ بنا (لا نغيّر شكل إعدادات النواة) — فيرى كلُّ مشرفٍ جدولَ مبانيه وحدها.
   مشرفُ المهمة **يُشتقّ من مبناها** (مصدرٌ واحد للحقيقة، فلا يتضارب عند نقل مبنى من
   مشرفٍ لآخر)، مع إمكان تجاوزٍ صريح لكل مهمة عند الاستثناء (حقل supervisor). */
let _cfg = { supervisorBuildings:{} };
let _cfgFor = "";
async function loadCfg(force){
  const database=_db(), path=cfgDoc();
  if(!database || !path){ _cfg={supervisorBuildings:{}}; return _cfg; }
  if(_cfgFor===_projId() && !force) return _cfg;
  try{
    const snap=await database.doc(path).get();
    const d=(snap&&snap.exists)?(snap.data()||{}):{};
    _cfg={ supervisorBuildings:(d.supervisorBuildings&&typeof d.supervisorBuildings==="object")?d.supervisorBuildings:{} };
    _cfgFor=_projId();
  }catch(e){ console.warn("cleaningOps/loadCfg",e); _cfg={supervisorBuildings:{}}; }
  return _cfg;
}
async function saveCfg(map){
  const database=_db(), path=cfgDoc();
  if(!database || !path){ _toast("⚠ لا اتصال بقاعدة البيانات","warn"); return false; }
  try{
    await database.doc(path).set({ supervisorBuildings:map, updatedAt:new Date().toISOString(), updatedBy:_userName() }, { merge:true });
    _cfg={ supervisorBuildings:map }; _cfgFor=_projId();
    _audit("ربط مشرفي النظافة بالمباني", Object.keys(map).length+" مشرف");
    return true;
  }catch(e){ console.warn("cleaningOps/saveCfg",e); _toast("⚠ تعذّر حفظ الربط","warn"); return false; }
}
function _supervisors(){ try{ return Array.isArray(SUPERVISORS)?SUPERVISORS:[]; }catch(e){ return []; } }
// مشرفُ مبنًى معيّن (أوّل من يملكه في الخريطة)
function supOfBuilding(b){
  const m=_cfg.supervisorBuildings||{};
  for(const s of Object.keys(m)){ if(Array.isArray(m[s]) && m[s].indexOf(b)!==-1) return s; }
  return "";
}
// مشرفُ المهمة: التجاوز الصريح إن وُجد، وإلا من مبناها
function taskSupervisor(t){ return (t&&t.supervisor) ? t.supervisor : supOfBuilding(t&&t.building); }
// نطاقُ المستخدم الحالي: null = كل المباني (أدمن/مدير)، أو قائمةُ مبانيه (مشرف)
function myBuildings(){
  const r=_role();
  if(r==="admin"||r==="project_manager") return null;
  const me=_userName();
  const m=_cfg.supervisorBuildings||{};
  if(me && Array.isArray(m[me])) return m[me].slice();
  return null;   // غيرُ مربوطٍ بمباني ⟵ لا نحجب عنه شيئاً (لا نُعمي المستخدم بصمت)
}
function inMyScope(t){
  const mine=myBuildings();
  if(!mine) return true;
  return mine.indexOf(t&&t.building)!==-1;
}
// المهامّ المرئية للمستخدم الحالي — مصدرٌ واحدٌ تستعمله كل الشاشات
function visibleTasks(){ const mine=myBuildings(); return mine ? _tasks.filter(inMyScope) : _tasks; }

/* ════════════ الحالة ════════════ */
let _tasks   = [];      // مهام المشروع الحالي
let _loaded  = false;   // اكتمل تحميل هذا المشروع؟
let _loadedFor = "";    // معرّف المشروع المحمَّل
let _loading = false;
let _view    = "board"; // board | all
let _editing = null;    // مسوّدة مهمة قيد التحرير (null = لا تحرير)
let _execFor = null;    // المهمة قيد التنفيذ (نافذة قائمة الفحص)
let _execState = [];    // حالة بنود قائمة الفحص أثناء التنفيذ
let _genForm = false;   // نموذج التوليد بالـ AI مفتوح؟
let _genErr  = "";

/* ════════════ التحميل والحفظ ════════════ */
/* ★ لا يجوز الرجوع فارغاً أثناء تحميلٍ جارٍ.
   كانت `if(_loading) return;` تُرجع وعداً محلولاً فوراً **بلا تعيين _loaded**، وكل
   المستدعين يفعلون `loadTasks().then(()=>render())` — فيرى render أن `!_loaded` فيستدعي
   loadTasks ثانيةً فترجع فوراً فيُعاد render… حلقةُ microtask لا نهائية تُجوّع حلقة
   الأحداث فيتجمّد التطبيق كلّه (يحدث حين يُفتح قسمُ النظافة والتحميل جارٍ من اللوحة
   التنفيذية أو المتابعة اليومية). الصواب: مشاركةُ النداء الجاري نفسه، فينتظر الجميع
   اكتماله الحقيقي ثم يُرسمون مرّةً واحدة. */
let _loadPromise = null;
function loadTasks(force){
  const database=_db(), col=tasksCol();
  if(!database || !col){ _tasks=[]; _loaded=true; _loadedFor=_projId(); return Promise.resolve(); }
  if(_loadPromise) return _loadPromise;                                   // شارك الجاري
  if(_loaded && _loadedFor===_projId() && !force) return Promise.resolve();
  _loading=true;
  _loadPromise = (async()=>{
    try{
      // بالتوازي لا بالتتابع — كانتا رحلتين متعاقبتين تضاعفان زمن أول عرض
      const [snap] = await Promise.all([
        database.collection(col).limit(500).get(),
        loadCfg(force)
      ]);
      _tasks = snap.docs.map(d=>Object.assign({id:d.id}, d.data()||{}));
    }catch(e){
      console.warn("cleaningOps/loadTasks",e);
      _toast("⚠ تعذّر تحميل جدول النظافة","warn");
      _tasks=[];
    }finally{
      // يُضبَط دائماً — نجح التحميل أم فشل — فلا يعود أيُّ مستدعٍ ليطلبه بلا نهاية
      _loaded=true; _loadedFor=_projId(); _loading=false; _loadPromise=null;
    }
  })();
  return _loadPromise;
}

async function saveTask(task){
  const database=_db(), col=tasksCol();
  if(!database || !col){ _toast("⚠ لا اتصال بقاعدة البيانات","warn"); return false; }
  try{
    await database.collection(col).doc(task.id).set(task, {merge:true});
    const i=_tasks.findIndex(t=>t.id===task.id);
    if(i>=0) _tasks[i]=Object.assign({}, _tasks[i], task); else _tasks.push(task);
    return true;
  }catch(e){ console.warn("cleaningOps/saveTask",e); _toast("⚠ تعذّر حفظ المهمة","warn"); return false; }
}

async function deleteTask(taskId){
  const database=_db(), col=tasksCol();
  if(!database || !col){ _toast("⚠ لا اتصال بقاعدة البيانات","warn"); return false; }
  try{
    await database.collection(col).doc(taskId).delete();
    _tasks = _tasks.filter(t=>t.id!==taskId);
    return true;
  }catch(e){ console.warn("cleaningOps/deleteTask",e); _toast("⚠ تعذّر حذف المهمة","warn"); return false; }
}

/* ════════════ منطق الاستحقاق والتغطية ════════════ */
function isDisabled(t){ return !!t.disabled; }
function doneToday(t){ return !!t.lastExecuted && String(t.lastExecuted).slice(0,10)===_today(); }
// مستحقّة الآن = تاريخ استحقاقها اليوم أو قبله، ولم تُنفَّذ اليوم
function isDue(t){ if(isDisabled(t)||doneToday(t)) return false; return _dayDiff(String(t.nextDueDate||"").slice(0,10), _today())<=0; }
function isOverdue(t){ if(isDisabled(t)||doneToday(t)) return false; return _dayDiff(String(t.nextDueDate||"").slice(0,10), _today())<0; }
function overdueDays(t){ return Math.abs(_dayDiff(String(t.nextDueDate||"").slice(0,10), _today())); }

// إحصاءات لوحة اليوم — التغطية = ما نُفِّذ اليوم ÷ ما كان مجدولاً لليوم (منفَّذ + مستحقّ).
// تقبل قائمةً صريحة (للفحوص) وإلا تعمل على مهام المشروع المحمَّلة.
function boardStats(list){
  const active=(Array.isArray(list)?list:visibleTasks()).filter(t=>!isDisabled(t));
  const done  = active.filter(doneToday);
  const due   = active.filter(isDue);
  const over  = active.filter(isOverdue);
  const scheduled = done.length + due.length;
  const coverage  = scheduled>0 ? Math.round((done.length/scheduled)*100) : 0;
  return { total:active.length, done:done.length, due:due.length, overdue:over.length, scheduled, coverage };
}

// حالة المهمة بمفردات المنصة: card = صنف .ppm-card (لون شريط الحالة)، badge = صنف .ppm-due-badge
function dueStatus(t){
  if(isDisabled(t)) return { lbl:"موقوفة", color:"var(--muted)", card:"", badge:"soon", sort:9 };
  if(doneToday(t))  return { lbl:"نُفِّذت اليوم", color:"var(--sla-ok)", card:"completed", badge:"ok", sort:3 };
  const diff=_dayDiff(String(t.nextDueDate||"").slice(0,10), _today());
  if(diff<0)  return { lbl:"متأخّرة "+Math.abs(diff)+" يوم", color:"var(--sla-crit)", card:"due-today", badge:"overdue", sort:0 };
  if(diff===0)return { lbl:"مستحقّة اليوم", color:"var(--sla-warn)", card:"due-soon", badge:"today", sort:1 };
  return { lbl:"بعد "+diff+" يوم", color:"var(--muted)", card:"", badge:"soon", sort:2 };
}

/* ════════════ التنفيذ ════════════ */
// تنفيذ المهمة: يُسجَّل في سجلّ التنفيذ (للتغطية والتاريخ) ثم يُقدَّم الاستحقاق التالي
// بمقدار تكرارها من **اليوم** (لا من الاستحقاق السابق) — فالمهمة المتأخّرة لا تتراكم
// استحقاقاتها الفائتة بلا معنى في عملٍ يوميٍّ متكرّر.
/* سجلّ تنفيذ مهمةٍ بعينها — مساواةٌ على حقلٍ واحد فلا تحتاج فهرساً مركّباً،
   والترتيب في الذاكرة تفادياً لاشتراط orderBy فهرساً. */
async function loadTaskLog(taskId){
  const database=_db(), col=logCol();
  if(!database || !col) return [];
  try{
    const snap=await database.collection(col).where("taskId","==",taskId).limit(60).get();
    return snap.docs.map(d=>d.data()||{}).sort((a,b)=>String(b.at||"").localeCompare(String(a.at||"")));
  }catch(e){ console.warn("cleaningOps/loadTaskLog",e); return []; }
}

/* ════════════ صور التنفيذ ════════════
   نعيد استخدام آلية النواة: compressImage للضغط ثم رفعٌ إلى Firebase Storage.
   تُخزَّن الروابط في سجلّ التنفيذ، ومنه تظهر في التقرير المصوّر. */
let _execPhotos = [];        // [{url, uploading, error, localPreview}]
let _detailFor = null;       // المهمة المعروضة تفاصيلها (null = لا شاشة تفاصيل)
let _detailLog = null;       // سجلّ تنفيذها (null = لم يُحمَّل بعد)
function _storage(){ try{ return (typeof storage!=="undefined" && storage) ? storage : null; }catch(e){ return null; } }
/* مصدرا الصورة: الكاميرا مباشرةً (سريعٌ في الميدان) أو معرضُ الجوال (صورةٌ التُقطت
   سابقاً). كان capture="environment" مفروضاً دائماً فيفتح الكاميرا ويمنع الاختيار من
   المعرض — لذلك صار المصدر خياراً صريحاً للمستخدم. */
function pickPhoto(fromCamera){
  const room=4-_execPhotos.length;
  if(room<=0){ _toast("⚠ الحدّ الأقصى ٤ صور للمهمة","warn"); return; }
  const inp=document.createElement("input");
  inp.type="file"; inp.accept="image/*"; inp.style.display="none";
  if(fromCamera) inp.setAttribute("capture","environment");   // الكاميرا مباشرةً
  else inp.multiple=true;                                      // من المعرض: عدّة صورٍ دفعةً
  inp.onchange=()=>{
    const files=Array.prototype.slice.call(inp.files||[],0,room);
    if(files.length<((inp.files||[]).length)) _toast("⚠ أُضيفت "+files.length+" صورة (الحدّ ٤ للمهمة)","warn");
    files.forEach(f=>_uploadExecPhoto(f));
    try{ document.body.removeChild(inp); }catch(e){}
  };
  document.body.appendChild(inp); inp.click();
}
function _uploadExecPhoto(file){
  const st=_storage();
  if(!st){ _toast("⚠ خدمة التخزين غير متاحة","warn"); return; }
  if(_execPhotos.length>=4){ _toast("⚠ الحدّ الأقصى ٤ صور للمهمة","warn"); return; }
  const rec={ url:"", uploading:true, error:false, preview:"" };
  try{ rec.preview=URL.createObjectURL(file); }catch(e){}
  _execPhotos.push(rec);
  // render() وحدها هي مُعيدة الرسم في هذه الوحدة — renderTabBody تخصّ وحدة إدارة
  // المشاريع وليست عامّة، فاستدعاؤها هنا كان يرمي ReferenceError عند أول صورة.
  render();
  const done=()=>{ if(_onPage()) render(); };
  const comp = (typeof compressImage==="function") ? compressImage(file) : Promise.resolve(file);
  comp.then(blob=>{
    if(!blob){ rec.uploading=false; rec.error=true; done(); return; }
    const id=_projId()||"proj", tid=(_execFor&&_execFor.id)||"task";
    const ref=st.ref("cleaning/"+id+"/"+tid+"/"+Date.now()+".jpg");
    let timedOut=false;
    const to=setTimeout(()=>{ timedOut=true; rec.uploading=false; rec.error=true;
      _toast("⚠ تأخّر رفع الصورة — يمكنك التسجيل بدونها","warn"); done(); }, 45000);
    ref.put(blob).then(snap=>snap.ref.getDownloadURL()).then(url=>{
      clearTimeout(to); if(timedOut) return;
      rec.url=url; rec.uploading=false; rec.error=false; done();
    }).catch(err=>{
      clearTimeout(to); if(timedOut) return;
      console.warn("cleaningOps/uploadPhoto",err);
      rec.uploading=false; rec.error=true; _toast("⚠ تعذّر رفع الصورة","warn"); done();
    });
  }).catch(()=>{ rec.uploading=false; rec.error=true; done(); });
}
function delExecPhoto(i){ _execPhotos.splice(i,1); render(); }

async function executeTask(task, checkedItems, note){
  const database=_db(); if(!database){ _toast("⚠ لا اتصال بقاعدة البيانات","warn"); return false; }
  const days = FREQ_DAYS[task.freq] || 1;
  const now  = new Date().toISOString();
  const list = Array.isArray(task.checklist) ? task.checklist : [];
  const doneCount = (checkedItems||[]).filter(Boolean).length;
  try{
    const rec = {
      id: _uid(), taskId: task.id, taskName: task.name||"",
      building: task.building||"", floor: task.floor||"", workType: task.workType||"",
      supervisor: taskSupervisor(task)||"",
      date: _today(), at: now, by: _userName(),
      doneItems: doneCount, totalItems: list.length,
      photos: (_execPhotos||[]).map(p=>p.url).filter(Boolean),
      note: String(note||"").slice(0,500)
    };
    await database.collection(logCol()).doc(rec.id).set(rec);
    const patch = { id:task.id, lastExecuted: now, lastExecutedBy: _userName(), nextDueDate: _addDays(_today(), days) };
    await saveTask(patch);
    _audit("تنفيذ مهمة نظافة", (task.name||"")+" — "+(task.building||"")+" ("+doneCount+"/"+list.length+" بند)");
    return true;
  }catch(e){ console.warn("cleaningOps/executeTask",e); _toast("⚠ تعذّر تسجيل التنفيذ","warn"); return false; }
}

/* ════════════════════════════════════════════════════════════
   العرض
   ════════════════════════════════════════════════════════════ */
/* ★ تحصينٌ بنيويّ ضدّ حلقات الرسم:
   (أ) حارسُ عدم إعادة الدخول — render لا تستدعي نفسها أثناء تنفيذها.
   (ب) نداءٌ معلّقٌ واحدٌ فقط بعد التحميل لكل مُركِّب — فحتى لو تعذّر ضبطُ الحالة في
       مسارٍ لم نتوقّعه، تحصل على رسمةٍ إضافيةٍ واحدة لا حلقةً لا نهائية.
   يقتل هذا الصنفَ كلَّه لا مساراً بعينه. */
let _rendering=false;
/* لا أعلامَ معلّقة: عَلَمٌ يعلق مرفوعاً يترك الشاشة على «جارٍ التحميل» للأبد. بدلها
   نرتبط بالوعد المشترك نفسه — loadTasks تُوحّد النداء الشبكي أصلاً، وإلحاقُ then
   متعددةٍ بوعدٍ واحد آمنٌ (كلٌّ يُنفَّذ مرّة). وعند اكتمال أيّ تحميل نُحدِّث **كل**
   السطوح المركَّبة لا السطحَ الطالبَ وحده، فلا يبقى سطحٌ عالقاً لأن نداءه لم يُسجَّل. */
function _safeHTML(el, build){
  if(!el) return;
  try{ el.innerHTML = build(); }
  catch(e){
    console.warn("cleaningOps/build",e);
    el.innerHTML = `<div class="card"><div class="co-empty">
      <div class="co-empty-t">تعذّر عرض البيانات</div>
      <div class="co-empty-s">افتح Console لتفاصيل الخطأ، أو اضغط «تحديث».</div></div></div>`;
  }
}
function _refreshMounted(){
  if(_onPage()) render();
  const eb=document.getElementById(EXEC_ID);
  if(eb && isCleaningProject()) _safeHTML(eb, execHTML);
  const db2=document.getElementById(DAILY_ID);
  if(db2 && isCleaningProject()) _safeHTML(db2, dailyHTML);
}
function _afterLoad(){ loadTasks().then(_refreshMounted).catch(e=>console.warn("cleaningOps/afterLoad",e)); }
function render(){
  if(_rendering) return;             // لا تعاود الدخول
  _rendering=true;
  try{ _render(); }
  catch(e){ console.warn("cleaningOps/render",e); }
  finally{ _rendering=false; }
}
function _render(){
  ensurePage();
  const el=document.getElementById("page-"+PAGE_ID);
  if(!el) return;
  if(!isCleaningProject()){
    el.innerHTML = heroHTML() + `<div class="card"><div class="co-empty">
      ${_svg('lock')}
      <div class="co-empty-t">هذا القسم لمشاريع «إدارة نظافة»</div>
      <div class="co-empty-s">صنّف المشروع من: الإدارة › تعديل المشروع › نوع المشروع = «إدارة نظافة».</div>
    </div></div>`;
    return;
  }
  if(!_loaded || _loadedFor!==_projId()){
    el.innerHTML = heroHTML() + `<div class="card"><div class="co-empty">
      <div class="co-empty-t">جارٍ تحميل جدول النظافة…</div></div></div>`;
    _afterLoad();
    return;
  }
  if(_editing)   { renderEditor(el); return; }
  if(_execFor)   { renderExec(el);   return; }
  if(_detailFor) { renderDetail(el); return; }
  el.innerHTML = heroHTML() + (_genForm ? genFormHTML() : "") +
                 (_view==="sup" ? supMapHTML() : _view==="board" ? boardHTML() : allTasksHTML());
}
function _onPage(){ const pg=document.getElementById("page-"+PAGE_ID); return !!pg && pg.classList.contains("active"); }

/* رأس الصفحة — نفس .page-hero المستخدَم في كل صفحات المنصة (الوقائية/الأصول/التقارير):
   تدرّجٌ كحليّ، أيقونةٌ في مربّعٍ زجاجيّ، عنوانٌ ووصفٌ، وأزرارُ إجراءٍ شفّافة. */
function heroHTML(){
  const p=_proj();
  return `
    <div class="page-hero">
      <div class="page-hero-titles">
        <div class="page-hero-title"><span class="ph-ico">${_svg('sparkles')}</span> تشغيل النظافة</div>
        <div class="page-hero-sub">${p?_esc(p.name||p.id)+" — ":""}الجدول اليومي للمهام الدورية</div>
      </div>
      <div class="page-hero-actions">
        <button class="btn btn-sm ${_view==='board'?'co-seg-on':''}" onclick="cleaningOps.setView('board')">${_svg('dashboard')} لوحة اليوم</button>
        <button class="btn btn-sm ${_view==='all'?'co-seg-on':''}" onclick="cleaningOps.setView('all')">${_svg('clipboardList')} كل المهام</button>
        ${canEdit()?`<button class="btn btn-sm" onclick="cleaningOps.addTask()">${_svg('plus')} مهمة جديدة</button>`:""}
        ${canEdit()?`<button class="btn btn-sm ${_view==='sup'?'co-seg-on':''}" onclick="cleaningOps.setView('sup')">${_svg('users')} المشرفون والمناطق</button>`:""}
        ${canEdit()?`<button class="btn btn-sm" onclick="cleaningOps.toggleGen()">${_svg('sparkles')} توليد بالذكاء الاصطناعي</button>`:""}
        <button class="btn btn-sm" onclick="cleaningOps.refresh()">${_svg('rotateCcw')} تحديث</button>
      </div>
    </div>`;
}
// رأسٌ مبسّط للشاشات الفرعية (المحرّر/التنفيذ) — نفس الهيرو بزرّ رجوعٍ واحد
function subHeroHTML(title, sub, backFn){
  return `
    <div class="page-hero">
      <div class="page-hero-titles">
        <div class="page-hero-title"><span class="ph-ico">${_svg('sparkles')}</span> ${title}</div>
        ${sub?`<div class="page-hero-sub">${sub}</div>`:""}
      </div>
      <div class="page-hero-actions">
        <button class="btn btn-sm" onclick="cleaningOps.${backFn}()">${_svg('folderOpen')} رجوع للجدول</button>
      </div>
    </div>`;
}

/* ── لوحة اليوم ──
   البلاطات .stat-tile ثم شريط الصحة .hbar (نفس إدارة العمليات) ثم بطاقات المهام
   .ppm-card مجمّعةً حسب المبنى داخل .card — كلها مفرداتُ المنصة نفسها. */
function boardHTML(){
  const s=boardStats();
  const tile=(icon,val,lbl,c)=>`
    <div class="stat-tile" style="--_c:${c}">
      <div class="st-ico">${_svg(icon)}</div>
      <div class="st-val" style="color:${c}">${val}</div>
      <div class="st-lbl">${lbl}</div>
    </div>`;

  if(!visibleTasks().length){
    return `<div class="card"><div class="co-empty">
      ${_svg('sparkles')}
      <div class="co-empty-t">لا توجد مهام نظافة بعد</div>
      <div class="co-empty-s">${canEdit()
        ? 'ابدأ بـ <b>«توليد بالذكاء الاصطناعي»</b> — صِف المبنى فيقترح جدولاً كاملاً تعدّله، أو أضف مهمةً يدوياً.'
        : 'لم يُنشئ مديرُ المشروع جدولَ المهام بعد.'}</div>
    </div></div>`;
  }

  // شريط التغطية: منفَّذ (أخضر) / متبقٍّ غير متأخّر (برتقالي) / متأخّر (أحمر) — نفس .hbar
  const pendingOnTime = Math.max(0, s.due - s.overdue);
  const seg = (n,cls)=> n>0 ? `<span class="${cls}" style="flex:${n}"></span>` : "";
  const covBar = s.scheduled>0
    ? `<div class="hbar">${seg(s.done,'s-ok')}${seg(pendingOnTime,'s-warn')}${seg(s.overdue,'s-crit')}</div>
       <div class="hleg">
         <div class="it"><i style="background:var(--sla-ok)"></i>نُفِّذ <span class="n">${s.done}</span></div>
         ${pendingOnTime>0?`<div class="it"><i style="background:var(--sla-warn)"></i>متبقٍّ <span class="n">${pendingOnTime}</span></div>`:""}
         ${s.overdue>0?`<div class="it"><i style="background:var(--sla-crit)"></i>متأخّر <span class="n">${s.overdue}</span></div>`:""}
       </div>`
    : `<div class="co-hint" style="margin:0">لا مهام مجدولة لليوم.</div>`;

  // مجموعات حسب المبنى (المنطقة) — المتأخّر ثم المستحقّ ثم المنجز
  const active=visibleTasks().filter(t=>!isDisabled(t));
  const todays=active.filter(t=>isDue(t)||doneToday(t));
  const byB={};
  todays.forEach(t=>{ const b=t.building||"بلا مبنى"; (byB[b]=byB[b]||[]).push(t); });
  const groups=`<div class="co-groups">`+Object.keys(byB).sort().map(b=>{
    const list=byB[b].slice().sort((x,y)=>dueStatus(x).sort-dueStatus(y).sort);
    const d=list.filter(doneToday).length;
    const all=d===list.length;
    return `
      <div class="card co-group">
        <div class="co-sec">
          <div class="co-sec-t">${_svg('building2')} ${_esc(b)}</div>
          <span class="ppm-due-badge ${all?'ok':'today'}">${d}/${list.length} منجزة</span>
        </div>
        <div class="co-tasklist">${list.map(taskCardHTML).join("")}</div>
      </div>`;
  }).join("")+`</div>`;

  return `
    <div class="co-tiles">
      ${tile('calendar',    s.scheduled, "مجدول اليوم",  "var(--primary)")}
      ${tile('checkCircle', s.done,      "نُفِّذ اليوم",   "var(--sla-ok)")}
      ${tile('hourglass',   s.due,       "متبقٍّ اليوم",  s.due>0?"var(--sla-warn)":"var(--sla-ok)")}
      ${tile('target',      s.coverage+"%", "نسبة التغطية", s.coverage>=95?"var(--sla-ok)":(s.coverage>=70?"var(--sla-warn)":"var(--sla-crit)"))}
    </div>
    <div class="card"><div class="co-sec">
      <div class="co-sec-t">${_svg('activity')} تغطية اليوم</div>
      <span class="co-sec-c">${s.done} من ${s.scheduled} مجدولة • ${s.total} مهمة نشطة</span>
    </div>${covBar}</div>
    ${s.overdue>0?`<div class="ppm-overdue-banner"><span class="co-bnr-ic">${_svg('alertTriangle')}</span>
      <span>${s.overdue} مهمة متأخّرة عن استحقاقها — فجوةُ تغطيةٍ تحتاج معالجةً اليوم.</span></div>`:""}
    ${todays.length? groups : `<div class="card"><div class="co-empty">
      ${_svg('checkCircle')}
      <div class="co-empty-t">لا مهام مستحقّة اليوم</div>
      <div class="co-empty-s">كل المهام ضمن مواعيدها.</div></div></div>`}`;
}

/* تجميعُ المهامّ حسب المبنى في شبكةٍ متجاورة — يستفيد من عرض الشاشة بدل صفٍّ لكل مهمة */
function _byBuildingGrid(tasks){
  const byB={};
  tasks.forEach(t=>{ const b=t.building||"بلا مبنى"; (byB[b]=byB[b]||[]).push(t); });
  return `<div class="co-groups">`+Object.keys(byB).sort().map(b=>{
    const list=byB[b].slice().sort((x,y)=>dueStatus(x).sort-dueStatus(y).sort);
    const d=list.filter(doneToday).length, all=d===list.length;
    return `<div class="card co-group">
      <div class="co-sec">
        <div class="co-sec-t">${_svg('building2')} ${_esc(b)}</div>
        <span class="ppm-due-badge ${all?'ok':'today'}">${d}/${list.length}</span>
      </div>
      <div class="co-tasklist">${list.map(taskCardHTML).join("")}</div>
    </div>`;
  }).join("")+`</div>`;
}

/* بطاقة المهمة — نفس .ppm-card (شريط الحالة 4px، مربّع الأيقونة، الشارات وأسطر البيانات) */
function taskCardHTML(t){
  const st=dueStatus(t);
  const list=Array.isArray(t.checklist)?t.checklist:[];
  const done=doneToday(t);
  return `
    <div class="ppm-card ${st.card} co-clickable" onclick="cleaningOps.openDetail('${_esc(t.id)}')" title="اضغط لعرض التفاصيل وسجلّ التنفيذ">
      <div class="co-card-row">
        <div class="ppm-chip">${_svg(iconOf(t.workType))}</div>
        <div class="co-card-main">
          <div class="co-card-t">${_esc(t.name||"مهمة")}</div>
          <div class="ppm-meta-row">
            <span class="mi">${_svg('repeat')}</span> <b>${_esc(t.freq||"")}</b>
            ${t.floor?`<span class="mi">${_svg('pin')}</span> ${_esc(t.floor)}`:""}
            ${list.length?`<span class="mi">${_svg('clipboardCheck')}</span> ${list.length} بند`:""}
            ${t.assignee?`<span class="mi">${_svg('user')}</span> ${_esc(t.assignee)}`:""}
            ${taskSupervisor(t)?`<span class="mi">${_svg('shield')}</span> ${_esc(taskSupervisor(t))}`:""}
          </div>
          <div class="co-pills">
            <span class="ppm-pill freq">${_esc(t.workType||"")}</span>
            <span class="ppm-due-badge ${st.badge}">${st.lbl}</span>
            ${done&&t.lastExecutedBy?`<span class="ppm-pill co-by">${_svg('user')} ${_esc(t.lastExecutedBy)}</span>`:""}
          </div>
        </div>
      </div>
      ${(!done&&canExecute())||canEdit() ? `<div class="co-card-act">
        ${done ? "" : (canExecute()?`<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();cleaningOps.exec('${_esc(t.id)}')">${_svg('checkCircle')} تنفيذ</button>`:"")}
        ${canEdit()?`<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();cleaningOps.editTask('${_esc(t.id)}')">${_svg('edit')}</button>`:""}
      </div>` : ""}
    </div>`;
}
function iconOf(wt){ const w=CLEANING_WORK_TYPES[wt]; return w?w.icon:"sparkles"; }

/* ── كل المهام (جدول داخل .card) ── */
function allTasksHTML(){
  if(!visibleTasks().length) return `<div class="card"><div class="co-empty">
    ${_svg('clipboardList')}<div class="co-empty-t">لا توجد مهام نظافة بعد</div></div></div>`;
  const rows=visibleTasks().slice().sort((a,b)=>{
    const c=String(a.building||"").localeCompare(String(b.building||""),"ar");
    return c!==0 ? c : dueStatus(a).sort-dueStatus(b).sort;
  }).map(t=>{
    const st=dueStatus(t);
    const list=Array.isArray(t.checklist)?t.checklist:[];
    return `<tr class="${isDisabled(t)?'co-tr-off':''}">
      <td class="co-td-name"><span class="co-td-ic">${_svg(iconOf(t.workType))}</span> ${_esc(t.name||"")}</td>
      <td>${_esc(t.building||"—")}${t.floor?" / "+_esc(t.floor):""}</td>
      <td>${_esc(t.workType||"—")}</td>
      <td>${_esc(taskSupervisor(t)||"—")}</td>
      <td>${_esc(t.freq||"—")}</td>
      <td class="co-num">${list.length}</td>
      <td class="co-num">${t.lastExecuted?_esc(String(t.lastExecuted).slice(0,10)):"—"}</td>
      <td><span class="ppm-due-badge ${st.badge}">${st.lbl}</span></td>
      <td>${canEdit()?`<button class="btn btn-ghost btn-sm" onclick="cleaningOps.editTask('${_esc(t.id)}')">${_svg('edit')}</button>`:""}</td>
    </tr>`;
  }).join("");
  return `<div class="card">
    <div class="co-sec"><div class="co-sec-t">${_svg('clipboardList')} كل المهام</div>
      <span class="co-sec-c">${visibleTasks().length} مهمة</span></div>
    <div class="co-table-wrap"><table class="co-table">
      <thead><tr><th>المهمة</th><th>المنطقة</th><th>نوع العمل</th><th>المشرف</th><th>التكرار</th><th>بنود</th><th>آخر تنفيذ</th><th>الحالة</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
  </div>`;
}

/* ── تفاصيل المهمة: بياناتها وقائمة فحصها وسجلّ تنفيذها بالصور ──
   الضغط على أيّ بطاقة يفتحها — وهي السبيل الوحيد لمراجعة مهمةٍ أُغلقت (نُفِّذت)،
   فأزرارُ التنفيذ تختفي عنها بعد الإنجاز. */
function renderDetail(el){
  const t=_detailFor;
  const list=Array.isArray(t.checklist)?t.checklist:[];
  const st=dueStatus(t);
  const sup=taskSupervisor(t);
  const info=(k,v)=> v?`<div class="co-fin-i"><span class="k">${k}</span><span class="v" style="font-family:'Cairo',sans-serif;font-size:12.5px">${_esc(v)}</span></div>`:"";
  const logHTML = _detailLog===null
    ? `<div class="co-empty" style="padding:22px"><div class="co-empty-t">جارٍ تحميل سجلّ التنفيذ…</div></div>`
    : (!_detailLog.length
        ? `<div class="co-empty" style="padding:22px">${_svg('clipboardList')}
             <div class="co-empty-t">لم تُنفَّذ بعد</div>
             <div class="co-empty-s">سيظهر هنا كلُّ تنفيذٍ بتاريخه ومنفِّذه وصوره.</div></div>`
        : _detailLog.map(r=>`
            <div class="co-logrow">
              <div class="co-logrow-h">
                <span class="d">${_svg('calendar')} ${_esc(String(r.date||"").slice(0,10))}</span>
                <span class="b">${_svg('user')} ${_esc(r.by||"—")}</span>
                <span class="ppm-due-badge ${(r.doneItems||0)>=(r.totalItems||0)?'ok':'today'}">${r.doneItems||0}/${r.totalItems||0} بند</span>
              </div>
              ${r.note?`<div class="co-lognote">${_svg('fileText')} ${_esc(r.note)}</div>`:""}
              ${(r.photos&&r.photos.length)?`<div class="co-logphotos">
                ${r.photos.map(u=>`<a href="${_esc(u)}" target="_blank" rel="noopener"><img src="${_esc(u)}" alt="صورة تنفيذ" loading="lazy"></a>`).join("")}
              </div>`:`<div class="co-hint" style="margin:6px 0 0">بلا صور</div>`}
            </div>`).join(""));

  el.innerHTML = subHeroHTML(_esc(t.name||"مهمة"),
      _esc(t.building||"")+(t.floor?" / "+_esc(t.floor):"")+" • "+_esc(t.workType||"")+" • "+_esc(t.freq||""),
      "closeDetail") + `
    <div class="card co-pane">
      <div class="co-sec"><div class="co-sec-t">${_svg('clipboardList')} بيانات المهمة</div>
        <span class="ppm-due-badge ${st.badge}">${st.lbl}</span></div>
      <div class="co-fin">
        ${info("المنطقة", (t.building||"—")+(t.floor?" / "+t.floor:""))}
        ${info("نوع العمل", t.workType)}
        ${info("التكرار", t.freq)}
        ${info("المشرف المسؤول", sup||"غير مُسنَد")}
        ${info("العامل المنفِّذ", t.assignee)}
        ${info("الاستحقاق التالي", String(t.nextDueDate||"").slice(0,10))}
        ${info("آخر تنفيذ", t.lastExecuted?String(t.lastExecuted).slice(0,10)+(t.lastExecutedBy?" — "+t.lastExecutedBy:""):"لم تُنفَّذ بعد")}
        ${info("وصف", t.desc)}
      </div>
      <div class="co-actions" style="margin-top:12px">
        ${(!doneToday(t)&&canExecute())?`<button class="btn btn-primary btn-sm" onclick="cleaningOps.exec('${_esc(t.id)}')">${_svg('checkCircle')} تنفيذ الآن</button>`:""}
        ${canEdit()?`<button class="btn btn-ghost btn-sm" onclick="cleaningOps.editTask('${_esc(t.id)}')">${_svg('edit')} تعديل</button>`:""}
      </div>
    </div>
    ${list.length?`<div class="card co-pane">
      <div class="co-sec"><div class="co-sec-t">${_svg('clipboardCheck')} قائمة الفحص</div>
        <span class="co-sec-c">${list.length} بند</span></div>
      <div class="co-ck-list">${list.map(i=>`<div class="co-ck" style="cursor:default">${_svg('checkCircle')}<span>${_esc(i)}</span></div>`).join("")}</div>
    </div>`:""}
    <div class="card co-pane">
      <div class="co-sec"><div class="co-sec-t">${_svg('activity')} سجلّ التنفيذ</div>
        <span class="co-sec-c">${_detailLog===null?"…":_detailLog.length+" تنفيذ"}</span></div>
      ${logHTML}
    </div>`;
}
function openDetail(id){
  const t=_tasks.find(x=>x.id===id); if(!t) return;
  _detailFor=t; _detailLog=null; _editing=null; _execFor=null;
  render();
  loadTaskLog(id).then(rows=>{
    if(!_detailFor || _detailFor.id!==id) return;   // غادر المستخدم قبل الوصول
    _detailLog=rows; render();
  });
}
function closeDetail(){ _detailFor=null; _detailLog=null; render(); }

/* ── ربط المشرفين بالمباني (للأدمن/مدير المشروع) ── */
function supMapHTML(){
  const sups=_supervisors(), blds=_buildings();
  const m=_cfg.supervisorBuildings||{};
  if(!sups.length || !blds.length){
    return `<div class="card"><div class="co-empty">${_svg('users')}
      <div class="co-empty-t">${!sups.length?"لا مشرفون مضافون بعد":"لا مبانٍ مضافة بعد"}</div>
      <div class="co-empty-s">أضِفهم من: الإدارة › لوحة الإدارة › ${!sups.length?"المشرفون":"المباني"}.</div></div></div>`;
  }
  // مبنًى غير مسنَدٍ لأحد = فجوةُ مسؤولية
  const assigned=new Set(); Object.values(m).forEach(a=>(a||[]).forEach(b=>assigned.add(b)));
  const orphans=blds.filter(b=>!assigned.has(b));
  return `
    <div class="card">
      <div class="co-sec"><div class="co-sec-t">${_svg('users')} المشرفون والمناطق</div>
        <span class="co-sec-c">كلُّ مشرفٍ يرى جدولَ مبانيه وحدها</span></div>
      ${orphans.length?`<div class="ppm-overdue-banner"><span class="co-bnr-ic">${_svg('alertTriangle')}</span>
        <span>${orphans.length} مبنًى بلا مشرف: ${_esc(orphans.join("، "))} — لن يظهر جدولها لأحدٍ من المشرفين.</span></div>`:""}
      ${sups.map((s,si)=>`
        <div class="co-supbox">
          <div class="co-sup-h">${_svg('user')} ${_esc(s)}
            <span class="co-sec-c">${((m[s]||[]).length)} مبنى</span></div>
          <div class="co-sup-blds">
            ${blds.map(b=>{
              const on=(m[s]||[]).indexOf(b)!==-1;
              const other=!on && supOfBuilding(b);
              return `<label class="co-bld ${on?'on':''} ${other?'taken':''}" title="${other?'مُسنَد إلى '+_esc(other):''}">
                <input type="checkbox" data-sup="${si}" data-bld="${_esc(b)}" ${on?'checked':''}> ${_esc(b)}
                ${other?`<small>(${_esc(other)})</small>`:""}
              </label>`;
            }).join("")}
          </div>
        </div>`).join("")}
      <div class="co-actions" style="margin-top:12px">
        <button class="btn btn-primary btn-sm" onclick="cleaningOps.saveSupMap()">${_svg('checkCircle')} حفظ الربط</button>
        <button class="btn btn-ghost btn-sm" onclick="cleaningOps.setView('board')">إلغاء</button>
      </div>
      <div class="co-hint">المبنى الواحد لمشرفٍ واحد. عند اختياره لمشرفٍ جديد يُنزَع من السابق تلقائياً.</div>
    </div>`;
}
async function saveSupMap(){
  const sups=_supervisors();
  const map={};
  document.querySelectorAll('#page-'+PAGE_ID+' .co-sup-blds input[type="checkbox"]').forEach(cb=>{
    if(!cb.checked) return;
    const s=sups[parseInt(cb.dataset.sup)]; const b=cb.dataset.bld;
    if(!s||!b) return;
    (map[s]=map[s]||[]).push(b);
  });
  const ok=await saveCfg(map);
  if(ok){ _toast("✅ حُفظ ربط المشرفين بالمباني","success"); _view="board"; render(); }
}

/* ── محرّر المهمة ── */
function renderEditor(el){
  const t=_editing;
  const isNew=!_tasks.some(x=>x.id===t.id);
  const blds=_buildings();
  const floors=_floorsOf(t.building);
  const opt=(arr,sel)=>arr.map(v=>`<option value="${_esc(v)}" ${v===sel?'selected':''}>${_esc(v)}</option>`).join("");
  const list=Array.isArray(t.checklist)?t.checklist:[];
  el.innerHTML = subHeroHTML(isNew?"مهمة نظافة جديدة":"تعديل المهمة", isNew?"":_esc(t.name||""), "cancelEdit") + `
    <div class="card co-pane">
      <div class="form-group"><label class="form-label">اسم المهمة</label>
        <input class="form-input" id="co-name" value="${_esc(t.name||"")}" placeholder="مثال: تنظيف وتعقيم دورات المياه"></div>
      <div class="co-grid2">
        <div class="form-group"><label class="form-label">المبنى (المنطقة)</label>
          <select class="form-select" id="co-bld" onchange="cleaningOps.onBuildingChange(this.value)">
            <option value="">— اختر —</option>${opt(blds, t.building)}
          </select></div>
        <div class="form-group"><label class="form-label">الدور / الموقع</label>
          ${floors.length
            ? `<select class="form-select" id="co-floor"><option value="">— كل الأدوار —</option>${opt(floors, t.floor)}</select>`
            : `<input class="form-input" id="co-floor" value="${_esc(t.floor||"")}" placeholder="اختياري">`}
        </div>
      </div>
      <div class="co-grid2">
        <div class="form-group"><label class="form-label">نوع العمل</label>
          <select class="form-select" id="co-wt">${opt(WT_KEYS, t.workType||WT_KEYS[0])}</select></div>
        <div class="form-group"><label class="form-label">التكرار</label>
          <select class="form-select" id="co-freq">${opt(FREQ_KEYS, t.freq||"يومي")}</select></div>
      </div>
      <div class="co-grid2">
        <div class="form-group"><label class="form-label">المشرف المسؤول</label>
          <select class="form-select" id="co-sup">
            <option value="">— حسب المبنى (${_esc(supOfBuilding(t.building)||"غير مُسنَد")}) —</option>
            ${_supervisors().map(x=>`<option value="${_esc(x)}" ${t.supervisor===x?'selected':''}>${_esc(x)}</option>`).join("")}
          </select></div>
        <div class="form-group"><label class="form-label">تاريخ أول/تالي تنفيذ</label>
          <input class="form-input" type="date" id="co-due" value="${_esc(String(t.nextDueDate||_today()).slice(0,10))}"></div>
      </div>
      <div class="form-group"><label class="form-label">العامل المنفِّذ (اختياري)</label>
        <input class="form-input" id="co-assignee" value="${_esc(t.assignee||"")}" placeholder="اسم العامل"></div>
      <div class="form-group"><label class="form-label">وصف مختصر (اختياري)</label>
        <input class="form-input" id="co-desc" value="${_esc(t.desc||"")}"></div>
      <div class="form-group"><label class="form-label">بنود قائمة الفحص — بندٌ في كل سطر</label>
        <textarea class="form-input" id="co-checklist" rows="6" placeholder="تعقيم الأحواض&#10;تنظيف المرايا&#10;تعبئة الصابون والمناديل&#10;تجفيف الأرضية">${_esc(list.join("\n"))}</textarea></div>
      <label class="co-chk"><input type="checkbox" id="co-disabled" ${t.disabled?'checked':''}> إيقاف المهمة مؤقّتاً (تبقى محفوظة ولا تظهر في لوحة اليوم)</label>
      <div class="co-actions">
        <button class="btn btn-primary btn-sm" onclick="cleaningOps.saveEdit()">${_svg('checkCircle')} حفظ</button>
        <button class="btn btn-ghost btn-sm" onclick="cleaningOps.cancelEdit()">إلغاء</button>
        ${!isNew?`<button class="btn btn-ghost btn-sm co-del" onclick="cleaningOps.removeTask()">${_svg('trash')} حذف المهمة</button>`:""}
      </div>
    </div>`;
}

/* ── نافذة التنفيذ (قائمة الفحص) ── */
function renderExec(el){
  const t=_execFor;
  const list=Array.isArray(t.checklist)?t.checklist:[];
  const items = list.length
    ? list.map((it,i)=>`
        <label class="co-ck">
          <input type="checkbox" data-i="${i}" ${_execState[i]?'checked':''} onchange="cleaningOps.toggleItem(${i},this.checked)">
          <span>${_esc(it)}</span>
        </label>`).join("")
    : `<div class="co-hint">لا بنود فحصٍ لهذه المهمة — سجّل التنفيذ مباشرةً.</div>`;
  const doneN=_execState.filter(Boolean).length;
  const pct = list.length ? Math.round(doneN/list.length*100) : 100;
  const sub = _esc(t.building||"")+(t.floor?" / "+_esc(t.floor):"")+" • "+_esc(t.workType||"")+" • "+_esc(t.freq||"");
  el.innerHTML = subHeroHTML("تنفيذ: "+_esc(t.name||""), sub, "cancelExec") + `
    <div class="card co-pane">
      ${list.length?`<div class="co-sec" style="margin-bottom:8px">
        <div class="co-sec-t">${_svg('clipboardCheck')} قائمة الفحص</div>
        <span class="co-sec-c"><b>${doneN}</b> من ${list.length} بند • ${pct}%</span>
      </div>
      <div class="hbar" style="margin-bottom:12px">
        ${doneN>0?`<span class="s-ok" style="flex:${doneN}"></span>`:""}
        ${list.length-doneN>0?`<span class="s-warn" style="flex:${list.length-doneN}"></span>`:""}
      </div>`:""}
      <div class="co-ck-list">${items}</div>
      <div class="co-sec" style="margin:14px 0 8px">
        <div class="co-sec-t">${_svg('camera')} صور التنفيذ</div>
        <span class="co-sec-c">${_execPhotos.length}/4 — تظهر في التقرير المصوّر</span>
      </div>
      <div class="co-photos">
        ${_execPhotos.map((p,i)=>`
          <div class="co-photo ${p.error?'err':''}">
            ${p.url||p.preview?`<img src="${_esc(p.url||p.preview)}" alt="صورة التنفيذ">`:""}
            ${p.uploading?`<span class="co-photo-st">⏳ جارٍ الرفع…</span>`:""}
            ${p.error?`<span class="co-photo-st">⚠ تعذّر الرفع</span>`:""}
            <button class="co-photo-x" onclick="cleaningOps.delPhoto(${i})" title="حذف">✕</button>
          </div>`).join("")}
        ${_execPhotos.length<4?`
          <button class="co-photo-add" onclick="cleaningOps.pickPhoto(true)">
            ${_svg('camera')}<span>التقاط بالكاميرا</span></button>
          <button class="co-photo-add" onclick="cleaningOps.pickPhoto(false)">
            ${_svg('image')}<span>من المعرض</span></button>`:""}
      </div>
      <div class="form-group"><label class="form-label">ملاحظة (اختياري)</label>
        <input class="form-input" id="co-exec-note" placeholder="أي ملاحظة على التنفيذ"></div>
      <div class="co-actions">
        <button class="btn btn-primary btn-sm" onclick="cleaningOps.confirmExec()">${_svg('checkCircle')} تسجيل التنفيذ</button>
        <button class="btn btn-ghost btn-sm" onclick="cleaningOps.cancelExec()">إلغاء</button>
      </div>
      <div class="co-hint">التسجيل ينقل الاستحقاق التالي بمقدار تكرار المهمة من اليوم، ويُحفظ في سجلّ التنفيذ.</div>
    </div>`;
}

/* ── نموذج التوليد بالذكاء الاصطناعي ── */
function genFormHTML(){
  const blds=_buildings();
  return `
    <div class="card co-pane co-gen">
      <div class="co-sec"><div class="co-sec-t">${_svg('sparkles')} توليد جدول مهام النظافة</div></div>
      <div class="co-grid2">
        <div class="form-group"><label class="form-label">المبنى المستهدف</label>
          <select class="form-select" id="co-gen-bld">
            <option value="">— كل المباني —</option>
            ${blds.map(b=>`<option value="${_esc(b)}">${_esc(b)}</option>`).join("")}
          </select></div>
        <div class="form-group"><label class="form-label">نوع المبنى/النشاط</label>
          <input class="form-input" id="co-gen-kind" placeholder="مثال: مبنى إداري ٤ أدوار، دورتا مياه لكل دور"></div>
      </div>
      <div class="form-group"><label class="form-label">ملاحظات إضافية (اختياري)</label>
        <input class="form-input" id="co-gen-notes" placeholder="مثال: لوبي بمساحة كبيرة، واجهة زجاجية، موقف سيارات"></div>
      <div class="co-actions">
        <button class="btn btn-primary btn-sm" id="co-gen-btn" onclick="cleaningOps.doGen()">${_svg('sparkles')} توليد</button>
        <button class="btn btn-ghost btn-sm" onclick="cleaningOps.toggleGen()">إلغاء</button>
      </div>
      ${_genErr?`<div class="ppm-overdue-banner" style="margin-top:12px"><span class="co-bnr-ic">${_svg('alertTriangle')}</span> <span>${_esc(_genErr)}</span></div>`:""}
      <div class="co-hint">المُولَّد <b>اقتراحٌ أوّليٌّ قابلٌ للتحرير والحذف</b> — يُضاف للمهام الحالية ولا يستبدلها.</div>
    </div>`;
}

function _extractJSON(txt){
  if(!txt) return null;
  const strip=s=>String(s).replace(/^```(json)?/i,"").replace(/```$/,"").trim();
  try{ return JSON.parse(strip(txt)); }catch(e){}
  const m=String(txt).match(/\{[\s\S]*\}/);
  if(m){ try{ return JSON.parse(strip(m[0])); }catch(e){} }
  return null;
}

/* إنقاذ الردّ المبتور: العربية مكلفةٌ توكنياً، فقد يُقطَع ردُّ النموذج في منتصف المهمة
   الأخيرة فيفشل تحليل JSON كاملاً وتضيع كلُّ المهامّ السليمة قبلها. هنا نمسح النصّ بحثاً
   عن كائناتٍ متوازنة الأقواس (مع احترام السلاسل النصّية والهروب) ونحلّل كلَّ كائنٍ وحده،
   فنستردّ كلَّ مهمةٍ اكتملت ونُسقط المبتورة وحدها. */
function _salvageObjects(txt){
  const s=String(txt||""), out=[];
  let i=0;
  while(i<s.length){
    if(s[i]!=="{"){ i++; continue; }
    let depth=0, inStr=false, esc=false, j=i, closed=false;
    for(; j<s.length; j++){
      const ch=s[j];
      if(inStr){
        if(esc) esc=false;
        else if(ch==="\\") esc=true;
        else if(ch==='"') inStr=false;
        continue;
      }
      if(ch==='"'){ inStr=true; continue; }
      if(ch==="{") depth++;
      else if(ch==="}"){ depth--; if(depth===0){ j++; closed=true; break; } }
    }
    if(closed){
      try{ const o=JSON.parse(s.slice(i,j)); if(o && typeof o==="object" && !Array.isArray(o)) out.push(o); }catch(e){}
      i=j;
    } else {
      // الكائن الخارجي غير مكتمل (ردٌّ مبتور) — ادخل فيه وابحث عن الكائنات الداخلية
      i++;
    }
  }
  return out;
}

async function doGen(){
  if(typeof _aiText!=="function"){ _toast("⚠ الذكاء الاصطناعي غير مُفعّل — فعّله من: الإدارة › إعدادات الذكاء الاصطناعي","warn"); return; }
  const bld  =(document.getElementById("co-gen-bld")||{}).value||"";
  const kind =((document.getElementById("co-gen-kind")||{}).value||"").trim();
  const notes=((document.getElementById("co-gen-notes")||{}).value||"").trim();
  const btn=document.getElementById("co-gen-btn");
  if(btn){ btn.disabled=true; btn.textContent="⏳ جارٍ التوليد…"; }
  _genErr="";
  try{
    const prompt =
      "أنت مدير عمليات نظافة مبانٍ محترف. أنشئ جدول مهام نظافة دورية لمبنى.\n"+
      "المبنى: "+(bld||"غير محدّد")+"\n"+
      "وصف المبنى/النشاط: "+(kind||"مبنى إداري عام")+"\n"+
      (notes?"ملاحظات: "+notes+"\n":"")+
      "أنواع العمل المسموحة (استخدم أحدها حرفياً في workType): "+WT_KEYS.join(" | ")+"\n"+
      "التكرارات المسموحة (استخدم أحدها حرفياً في freq): "+FREQ_KEYS.join(" | ")+"\n"+
      "أعطِ بين 8 و 12 مهمة تغطّي المناطق الرئيسية، بأسماء عربية مختصرة، ولكل مهمة "+
      "بين 3 و 5 بنود فحصٍ عملية ومحدّدة وموجزة.\n"+
      "اجعل مهام دورات المياه والأرضيات والنفايات «يومي»، والزجاج والأثاث «أسبوعي»، "+
      "والنظافة العميقة «شهري» أو «ربع سنوي».\n"+
      "أعِد JSON فقط بلا أي شرح، بهذا الشكل تماماً:\n"+
      '{"tasks":[{"name":"اسم المهمة","workType":"نظافة دورات المياه","freq":"يومي","floor":"","checklist":["بند","بند"]}]}';
    let tasks=null, lastErr="";
    for(let attempt=1; attempt<=2 && !tasks; attempt++){
      let txt="";
      // سقفٌ واسع: العربية مكلفةٌ توكنياً و2500 كانت تبتر الردّ فيفشل التحليل كلّه
      try{ txt=await _aiText([{role:"user",content:prompt}], {maxTokens:8000, temperature:0.3, feature:"جدول النظافة"}); }
      catch(err){ lastErr=(err&&err.message)||"تعذّر الاتصال بالذكاء الاصطناعي"; console.warn("cleaningOps/doGen#"+attempt,err); continue; }
      try{ console.log("[cleaningOps] AI tasks raw #"+attempt+":", txt); }catch(_e){}
      const j=_extractJSON(txt);
      let raw = (j && Array.isArray(j.tasks) && j.tasks.length) ? j.tasks : null;
      if(!raw){
        // الردّ لم يُحلَّل كاملاً (غالباً مبتور) — استردّ المهامّ المكتملة منه.
        // الماسح يُرجع الكائنات المكتملة في المستوى الأعلى: فإن نجا كائنٌ يحمل tasks
        // (ردٌّ سليمٌ لفّه النموذج بنصّ) أخذنا مصفوفته، وإلا فالكائنات نفسها هي المهامّ.
        let sal=_salvageObjects(txt);
        const wrap=sal.find(o=>o && Array.isArray(o.tasks) && o.tasks.length);
        sal=(wrap?wrap.tasks:sal).filter(o=>o && o.name);
        if(sal.length){ raw=sal; try{ console.warn("[cleaningOps] أُنقذت "+sal.length+" مهمة من ردٍّ غير قابلٍ للتحليل الكامل"); }catch(_e){} }
      }
      if(raw && raw.length){
        tasks=raw.slice(0,30).map(x=>({
          id:_uid(),
          name:String(x.name||"مهمة نظافة").trim().slice(0,90),
          building: bld,
          floor: String(x.floor||"").trim().slice(0,60),
          workType: WT_KEYS.indexOf(x.workType)!==-1 ? x.workType : "أخرى",
          freq: FREQ_KEYS.indexOf(x.freq)!==-1 ? x.freq : "يومي",
          assignee:"", desc:"",
          checklist: Array.isArray(x.checklist) ? x.checklist.slice(0,15).map(s=>String(s).trim().slice(0,120)).filter(Boolean) : [],
          nextDueDate: _today(), lastExecuted:"", lastExecutedBy:"",
          disabled:false, createdAt:new Date().toISOString(), createdBy:_userName(), generatedByAI:true
        }));
      } else lastErr="تعذّر قراءة رد الذكاء الاصطناعي";
    }
    if(!tasks){
      _genErr="تعذّر التوليد التلقائي"+(lastErr?" ("+lastErr+")":"")+". جرّب مرة أخرى، أو أضف المهام يدوياً.";
      _toast("⚠ "+_genErr,"warn"); render(); return;
    }
    let ok=0;
    for(const t of tasks){ if(await saveTask(t)) ok++; }
    _audit("توليد جدول نظافة بالذكاء الاصطناعي", (bld||"كل المباني")+" — "+ok+" مهمة");
    _toast("✅ أُضيفت "+ok+" مهمة — راجعها وعدّلها كما تحب","success");
    _genForm=false; render();
  } finally {
    const b=document.getElementById("co-gen-btn"); if(b){ b.disabled=false; b.textContent="توليد"; }
  }
}

/* ════════════ معالِجات الواجهة ════════════ */
function setView(v){ _view=v; _genForm=false; _detailFor=null; _detailLog=null; render(); }
function toggleGen(){ _genForm=!_genForm; _genErr=""; render(); }
async function refresh(){ await loadTasks(true); render(); _toast("✅ حُدِّث الجدول","success"); }

function addTask(){
  _editing = { id:_uid(), name:"", building:"", floor:"", workType:WT_KEYS[0], freq:"يومي",
    assignee:"", supervisor:"", desc:"", checklist:[], nextDueDate:_today(), lastExecuted:"", lastExecutedBy:"",
    disabled:false, createdAt:new Date().toISOString(), createdBy:_userName() };
  render();
}
function editTask(id){ const t=_tasks.find(x=>x.id===id); if(!t) return; _editing=Object.assign({}, t); render(); }
function cancelEdit(){ _editing=null; render(); }
// تغيير المبنى يعيد بناء قائمة الأدوار — نحفظ المُدخَل الحالي أولاً فلا يضيع
function onBuildingChange(v){ _syncEditor(); _editing.building=v; _editing.floor=""; render(); }
function _syncEditor(){
  if(!_editing) return;
  const g=id=>{ const el=document.getElementById(id); return el?el.value:""; };
  _editing.name     = g("co-name").trim();
  _editing.building = g("co-bld");
  _editing.floor    = g("co-floor").trim();
  _editing.workType = g("co-wt");
  _editing.freq     = g("co-freq");
  _editing.assignee = g("co-assignee").trim();
  _editing.supervisor = g("co-sup");
  _editing.desc     = g("co-desc").trim();
  _editing.nextDueDate = g("co-due") || _today();
  _editing.checklist = g("co-checklist").split("\n").map(s=>s.trim()).filter(Boolean).slice(0,25);
  const dis=document.getElementById("co-disabled");
  _editing.disabled = !!(dis && dis.checked);
}
async function saveEdit(){
  _syncEditor();
  if(!_editing.name){ _toast("⚠ أدخل اسم المهمة","warn"); return; }
  if(!_editing.building){ _toast("⚠ اختر المبنى","warn"); return; }
  const ok=await saveTask(_editing);
  if(ok){ _audit("حفظ مهمة نظافة", _editing.name+" — "+_editing.building); _editing=null; _toast("✅ حُفظت المهمة","success"); render(); }
}
async function removeTask(){
  if(!_editing) return;
  const nm=_editing.name||"المهمة";
  let go=true;
  try{ if(typeof showConfirm==="function") go=await showConfirm("حذف «"+nm+"» نهائياً؟"); else go=confirm("حذف «"+nm+"» نهائياً؟"); }catch(e){ go=confirm("حذف «"+nm+"» نهائياً؟"); }
  if(!go) return;
  const ok=await deleteTask(_editing.id);
  if(ok){ _audit("حذف مهمة نظافة", nm); _editing=null; _toast("✅ حُذفت المهمة","success"); render(); }
}

function exec(id){
  const t=_tasks.find(x=>x.id===id); if(!t) return;
  if(!canExecute()){ _toast("🔒 لا صلاحية لتسجيل التنفيذ","warn"); return; }
  _execFor=t;
  const list=Array.isArray(t.checklist)?t.checklist:[];
  _execState=list.map(()=>false);
  _execPhotos=[];
  render();
}
function toggleItem(i,on){ _execState[i]=!!on; render(); }
function cancelExec(){ _execFor=null; _execState=[]; _execPhotos=[]; render(); }
function _clearDetail(){ _detailFor=null; _detailLog=null; }
async function confirmExec(){
  if(!_execFor) return;
  const note=((document.getElementById("co-exec-note")||{}).value||"").trim();
  const list=Array.isArray(_execFor.checklist)?_execFor.checklist:[];
  const doneN=_execState.filter(Boolean).length;
  if(list.length && doneN<list.length){
    let go=true;
    const msg="لم تكتمل كل البنود ("+doneN+"/"+list.length+"). تسجيل التنفيذ الجزئي؟";
    try{ if(typeof showConfirm==="function") go=await showConfirm(msg); else go=confirm(msg); }catch(e){ go=confirm(msg); }
    if(!go) return;
  }
  const ok=await executeTask(_execFor, _execState, note);
  if(ok){ _execFor=null; _execState=[]; _execPhotos=[]; _toast("✅ سُجِّل التنفيذ","success"); render(); }
}

/* ════════════════════════════════════════════════════════════
   اللوحة التنفيذية لعقود النظافة
   ────────────────────────────────────────────────────────────
   لوحةُ الصيانة تقيس ما لا وجود له في عقد نظافة: بلاغاتٌ وSLA ومؤشّراتُ صيانةٍ سبعة
   تظهر «0% — دون الهدف» بالأحمر لمجرّد غياب أعمال الصيانة، وسلّمُ استجابةٍ يتحدّث عن
   «انقطاع كهرباء / مصعد». فهي لا تنقص معلومةً فحسب، بل **تُضلّل**.

   البديل يقيس ما يحكم **تشغيل** العقد: التغطيةُ اليوم، والمناطقُ المتخلّفة،
   والمهامُّ المتأخّرة، ومدةُ العقد.

   ── فصلُ المالي عن التشغيلي (قرار صاحب النظام) ──
   الربحيةُ والمستهلكاتُ لا تظهران هنا إطلاقاً: محلُّهما «إدارة المشاريع › بطاقة
   المشروع» حيث تُدار بياناتُ العقد المالية. هذه الشاشة تشغيليةٌ خالصة.

   ── لا مساس بمشاريع الصيانة ──
   لا نحذف لوحة الصيانة ولا نمسّ renderDashboard() (النواة تحذّر صراحةً من إتلاف
   محتوى #page-dashboard لأنها تعتمد getElementById). نحقن لوحتنا كأول عنصر ونُخفي
   بقية الأبناء بصنفٍ واحد على الحاوية — فتبقى عناصر النواة موجودةً تعمل بلا خطأ،
   ويُرفَع الإخفاء فوراً عند الانتقال لمشروعٍ غير نظافة.
   ════════════════════════════════════════════════════════════ */
const EXEC_ID = "co-exec";


/* مؤشر مدة العقد — من سجلّ المشروع (نفس حقول بطاقة العقد في النواة) */
function contractProgress(){
  const p=_proj(); if(!p || !p.contractStart) return null;
  const months=parseInt(p.contractMonths)||0; if(months<=0) return null;
  const start=_pDate(String(p.contractStart).slice(0,10));
  const end=new Date(start); end.setMonth(end.getMonth()+months);
  const now=new Date();
  const totalD=Math.max(1,(end-start)/86400000);
  const goneD =Math.min(totalD,Math.max(0,(now-start)/86400000));
  const pct=Math.round((goneD/totalD)*100);
  const monthsGone=+(goneD/30.44).toFixed(1), monthsLeft=+Math.max(0,(totalD-goneD)/30.44).toFixed(1);
  return { months, pct, monthsGone, monthsLeft, start, end };
}

/* التغطية لكل مبنى — أيّ المناطق متخلّفة اليوم */
function coverageByBuilding(list){
  const m={};
  (Array.isArray(list)?list:visibleTasks()).filter(t=>!isDisabled(t)).forEach(t=>{
    if(!(isDue(t)||doneToday(t))) return;
    const b=t.building||"بلا مبنى";
    if(!m[b]) m[b]={ name:b, done:0, due:0, overdue:0 };
    if(doneToday(t)) m[b].done++; else { m[b].due++; if(isOverdue(t)) m[b].overdue++; }
  });
  return Object.values(m).map(x=>{
    const sched=x.done+x.due;
    return Object.assign(x,{ sched, pct: sched>0?Math.round(x.done/sched*100):0 });
  }).sort((a,b)=>a.pct-b.pct);   // الأضعف أولاً — هذا ما يحتاجه التنفيذيّ
}

function execHTML(){
  const s=boardStats();
  const cp=contractProgress();
  const cov=coverageByBuilding();

  // الحكم العام — على التغطية لا على البلاغات
  let vKey, vTxt, vSub;
  if(s.scheduled===0){ vKey="ok";   vTxt="لا مهامّ اليوم"; vSub="لا مهامّ مجدولةً لهذا اليوم"; }
  else if(s.overdue>0){ vKey="crit"; vTxt="متأخّرات"; vSub=s.overdue+" مهمة تجاوزت استحقاقها"; }
  else if(s.due>0){     vKey="warn"; vTxt="قيد التنفيذ"; vSub=s.due+" مهمة متبقّية اليوم"; }
  else {                vKey="ok";   vTxt="مكتمل"; vSub="نُفِّذت كل مهامّ اليوم"; }
  const vC="var(--sla-"+vKey+")", vBg="var(--sla-"+vKey+"-bg)";

  const pendingOnTime=Math.max(0,s.due-s.overdue);
  const seg=(n,cls)=> n>0?`<span class="${cls}" style="flex:${n}"></span>`:"";

  const tile=(icon,val,lbl,c)=>`
    <div class="stat-tile" style="--_c:${c}">
      <div class="st-ico">${_svg(icon)}</div>
      <div class="st-val" style="color:${c}">${val}</div>
      <div class="st-lbl">${lbl}</div>
    </div>`;

  // مدة العقد
  const cpBlock = cp ? `
    <div class="card">
      <div class="co-sec"><div class="co-sec-t">${_svg('calendarClock')} مدة العقد</div>
        <span class="co-sec-c"><b>${cp.pct}%</b> منقضية</span></div>
      <div class="co-tiles" style="margin-bottom:11px">
        ${tile('calendar', cp.months,     "مدة العقد (شهر)",    "var(--primary)")}
        ${tile('hourglass',cp.monthsGone, "المنقضية (شهر)",     "var(--sla-warn)")}
        ${tile('calendar', cp.monthsLeft, "المتبقّية (شهر)",     "var(--sla-ok)")}
      </div>
      <div class="hbar">
        <span class="s-ok" style="flex:${Math.max(cp.pct,0.01)}"></span>
        <span style="flex:${Math.max(100-cp.pct,0.01)};background:var(--surface2)"></span>
      </div>
    </div>` : "";

  // التغطية حسب المبنى
  const covBlock = cov.length ? `
    <div class="card">
      <div class="co-sec"><div class="co-sec-t">${_svg('building2')} التغطية حسب المنطقة</div>
        <span class="co-sec-c">الأضعف أولاً</span></div>
      ${cov.map(b=>{
        const c=b.pct>=100?"var(--sla-ok)":(b.pct>=60?"var(--sla-warn)":"var(--sla-crit)");
        return `<div class="co-cov">
          <div class="co-cov-h"><span class="n">${_esc(b.name)}</span>
            <span class="p" style="color:${c}">${b.pct}% <small>(${b.done}/${b.sched})</small></span></div>
          <div class="hbar"><span style="flex:${Math.max(b.pct,0.01)};background:${c}"></span><span style="flex:${Math.max(100-b.pct,0.01)};background:var(--surface2)"></span></div>
        </div>`;
      }).join("")}
    </div>` : "";

  // المهام المتأخّرة — أقدم أولاً
  const late=visibleTasks().filter(t=>isOverdue(t)).sort((a,b)=>overdueDays(b)-overdueDays(a)).slice(0,8);
  const lateBlock = `
    <div class="card">
      <div class="co-sec"><div class="co-sec-t">${_svg('alertTriangle')} المهامّ المتأخّرة</div>
        <span class="co-sec-c">${late.length?late.length+" مهمة":"لا متأخّرات"}</span></div>
      ${late.length ? late.map(t=>`
        <div class="ppm-card due-today">
          <div class="co-card-row">
            <div class="ppm-chip">${_svg(iconOf(t.workType))}</div>
            <div class="co-card-main">
              <div class="co-card-t">${_esc(t.name||"")}</div>
              <div class="ppm-meta-row"><span class="mi">${_svg('pin')}</span> ${_esc(t.building||"—")}${t.floor?" / "+_esc(t.floor):""}</div>
            </div>
            <div class="co-card-act"><span class="ppm-due-badge overdue">متأخّرة ${overdueDays(t)} يوم</span></div>
          </div>
        </div>`).join("")
       : `<div class="co-empty" style="padding:22px">${_svg('checkCircle')}
          <div class="co-empty-t">لا مهامّ متأخّرة</div></div>`}
    </div>`;

  return `
    <div class="page-hero">
      <div class="page-hero-titles">
        <div class="page-hero-title"><span class="ph-ico">${_svg('sparkles')}</span> اللوحة التنفيذية — عقد نظافة</div>
        <div class="page-hero-sub">${_esc((_proj()||{}).name||"")}</div>
      </div>
      <div class="page-hero-actions">
        <button class="btn btn-sm" onclick="cleaningOps.goOps()">${_svg('clipboardList')} تشغيل النظافة</button>
        <button class="btn btn-sm" onclick="cleaningOps.refreshExec()">${_svg('rotateCcw')} تحديث</button>
      </div>
    </div>

    <div class="ops-strip" style="--verdict:${vC};--verdict-bg:${vBg};margin-bottom:14px">
      <div class="ops-verdict">
        <div class="eb">حالة التشغيل الآن</div>
        <div class="big"><span class="dot"></span>${vTxt}</div>
        <div class="sub">${vSub}</div>
      </div>
      <div class="ops-health">
        <div class="hl"><span class="t">تغطية اليوم</span>
          <span class="c"><b>${s.done}</b> من ${s.scheduled} مجدولة</span></div>
        ${s.scheduled>0
          ? `<div class="hbar">${seg(s.done,'s-ok')}${seg(pendingOnTime,'s-warn')}${seg(s.overdue,'s-crit')}</div>
             <div class="hleg">
               <div class="it"><i style="background:var(--sla-ok)"></i>نُفِّذ <span class="n">${s.done}</span></div>
               ${pendingOnTime>0?`<div class="it"><i style="background:var(--sla-warn)"></i>متبقٍّ <span class="n">${pendingOnTime}</span></div>`:""}
               ${s.overdue>0?`<div class="it"><i style="background:var(--sla-crit)"></i>متأخّر <span class="n">${s.overdue}</span></div>`:""}
             </div>`
          : `<div class="hbar"><span style="flex:1;background:var(--surface2)"></span></div>`}
      </div>
      <div class="ops-live">
        <div class="lbl">نسبة التغطية</div>
        <div class="big" style="color:${vC}">${s.coverage}%</div>
        <div class="u"><span class="live"></span>${visibleTasks().filter(t=>!isDisabled(t)).length} مهمة نشطة</div>
      </div>
    </div>

    <div class="co-tiles">
      ${tile('calendar',    s.scheduled, "مجدول اليوم",  "var(--primary)")}
      ${tile('checkCircle', s.done,      "نُفِّذ اليوم",   "var(--sla-ok)")}
      ${tile('hourglass',   s.due,       "متبقٍّ اليوم",  s.due>0?"var(--sla-warn)":"var(--sla-ok)")}
      ${tile('alertTriangle', s.overdue, "متأخّر",       s.overdue>0?"var(--sla-crit)":"var(--sla-ok)")}
    </div>

    ${covBlock}
    ${lateBlock}
    ${cpBlock}`;
}

/* تركيب/رفع اللوحة — بلا مساسٍ بمحتوى النواة */
function mountExec(){
  const host=document.getElementById("page-dashboard");
  if(!host) return;
  if(!isCleaningProject()){ unmountExec(); return; }
  let box=document.getElementById(EXEC_ID);
  if(!box){
    box=document.createElement("div");
    box.id=EXEC_ID;
    host.insertBefore(box, host.firstChild);
  }
  host.classList.add("co-exec-mode");
  if(!_loaded || _loadedFor!==_projId()){
    box.innerHTML = `<div class="card"><div class="co-empty"><div class="co-empty-t">جارٍ تحميل بيانات التشغيل…</div></div></div>`;
    _afterLoad();
    return;
  }
  box.innerHTML=execHTML();
}
function unmountExec(){
  const host=document.getElementById("page-dashboard");
  if(host) host.classList.remove("co-exec-mode");
  const box=document.getElementById(EXEC_ID);
  if(box) box.remove();
}
async function refreshExec(){ await loadTasks(true); mountExec(); _toast("✅ حُدِّثت اللوحة","success"); }
function goOps(){ try{ showPage(PAGE_ID); }catch(e){} }

/* ════════════════════════════════════════════════════════════
   تكييف صفحات أوامر العمل لعقود النظافة
   ────────────────────────────────────────────────────────────
   صفحات البلاغات/الأرشيف/بلاغ جديد/متابعة اليومية مكتوبةٌ بلغة الصيانة («وصف العطل»،
   «نوع الصيانة»، «الفني المسؤول»)، والأخطر: **المشروع الجديد يبدأ بأنواع عملٍ فارغة
   تماماً** (loadSettings: مشروعٌ غير حائل ⟵ _applyWT({})) فقائمة «نوع الأعمال» بلا
   خيارات ولا يمكن تسجيل أي ملاحظة.

   نعالج ذلك بلا مساسٍ بمشاريع الصيانة:
   ١) بذرُ أنواع عمل النظافة في إعدادات المشروع نفسها (meta/{id}_settings) — آليةُ
      المنصة القائمة، فتظهر في كل القوائم والفلاتر تلقائياً وتبقى قابلةً للتعديل.
   ٢) تعريبُ المصطلحات على عناصر العناوين والتسميات وحدها (لا محتوى ديناميكي).
   ٣) متابعةٌ يوميةٌ خاصةٌ بالنظافة (إخفاءُ نسخة الصيانة لا حذفها — كاللوحة التنفيذية).
   ════════════════════════════════════════════════════════════ */

// أنواع عمل النظافة الافتراضية بصيغة WORK_TYPES في النواة ({icon,techs}).
const CLEANING_WT_SEED = {
  "نظافة دورات المياه":      { icon:"🚿", techs:[] },
  "نظافة الأرضيات":          { icon:"🧹", techs:[] },
  "نظافة الزجاج والواجهات":  { icon:"🪟", techs:[] },
  "إدارة النفايات":          { icon:"🗑️", techs:[] },
  "نظافة المكاتب والأثاث":   { icon:"🧴", techs:[] },
  "المساحات الخارجية":       { icon:"🌳", techs:[] },
  "النظافة العميقة الدورية": { icon:"✨", techs:[] },
  "أخرى":                    { icon:"🧽", techs:[] }
};
let _seededFor = {};   // projId → بُذرت أنواع العمل؟ (مرّة لكل مشروع لكل جلسة)

async function seedWorkTypes(){
  const id=_projId();
  if(!id || !isCleaningProject() || _seededFor[id]) return;
  // لا نبذر إلا إن كانت أنواع العمل فارغةً فعلاً — فلا نطمس اختيار المستخدم أبداً
  let empty=false;
  try{ empty = (typeof WORK_TYPES==="object" && WORK_TYPES) && Object.keys(WORK_TYPES).length===0; }
  catch(e){ return; }
  if(!empty) { _seededFor[id]=true; return; }
  const database=_db(); if(!database) return;
  let path=""; try{ path=(typeof SETTINGS_DOC==="function") ? SETTINGS_DOC() : ""; }catch(e){}
  if(!path) return;
  _seededFor[id]=true;
  try{
    await database.doc(path).set({ workTypes: CLEANING_WT_SEED }, { merge:true });
    try{ if(typeof _applyWT==="function") _applyWT(CLEANING_WT_SEED); }catch(e){}
    // بلا هذه، تبقى القوائم المنسدلة على حالتها القديمة حتى يُعيد شيءٌ آخر بناءها
    try{ if(typeof repopulateAllSelects==="function") repopulateAllSelects(); }catch(e){}
    _audit("بذر أنواع عمل النظافة", _projId()+" — "+Object.keys(CLEANING_WT_SEED).length+" نوع");
    _toast("✅ أُضيفت أنواع عمل النظافة لهذا المشروع (تُعدَّل من لوحة الإدارة)","success");
  }catch(e){ console.warn("cleaningOps/seedWorkTypes",e); _seededFor[id]=false; }
}

/* ── تعريب المصطلحات (عناوين وتسميات فقط) ──
   مرتّبةٌ من الأطول للأقصر فلا يبتلع بديلٌ جزءاً من عبارةٍ أطول. وكلُّ بديلٍ لا يحوي
   أصلَه، فإعادةُ التطبيق غير ضارّة (idempotent). */
const RELABEL = [
  ["أرشيف البلاغات الشهري",              "أرشيف ملاحظات النظافة الشهري"],
  ["البلاغات المحفوظة من الأشهر السابقة", "الملاحظات المحفوظة من الأشهر السابقة"],
  ["تسجيل بلاغ صيانة جديد وإسناده للمبنى ونوع العمل", "تسجيل ملاحظة نظافة وإسنادها للمنطقة ونوع العمل"],
  ["ابدأ بتسجيل أول بلاغ صيانة",          "ابدأ بتسجيل أول ملاحظة نظافة"],
  ["ابحث برقم البلاغ أو المبنى أو الفني أو المشرف...", "ابحث برقم الملاحظة أو المنطقة أو العامل أو المشرف..."],
  ["كل أنواع الصيانة",                    "كل المصادر"],
  ["تسجيل بلاغ جديد",                     "تسجيل ملاحظة نظافة"],
  ["لا توجد بلاغات مؤرشفة",               "لا توجد ملاحظات مؤرشفة"],
  ["لا توجد بلاغات بعد",                  "لا توجد ملاحظات بعد"],
  ["اكتب وصفاً تفصيلياً للعطل...",         "اكتب وصفاً تفصيلياً للملاحظة..."],
  ["الفني المسؤول",                       "عامل النظافة المسؤول"],
  ["وصف العطل",                           "وصف الملاحظة"],
  ["نوع الصيانة",                          "مصدر الملاحظة"],
  ["بلاغ جديد",                           "ملاحظة جديدة"],
  ["أرشيف البلاغات",                       "أرشيف الملاحظات"],
  ["تاريخ البلاغ",                         "تاريخ الملاحظة"],
  ["وقت البلاغ",                           "وقت الملاحظة"],
  ["البلاغات",                             "ملاحظات النظافة"]
];
// نقصر التبديل على عناصر العناوين والتسميات والحقول — لا على محتوى الجداول الديناميكي،
// فلا نمسّ بيانات المستخدم ولا أرقام البلاغات.
const RELABEL_SEL = ".page-hero-title,.page-hero-sub,.form-label,label,option,.empty-title,.empty-sub,h2,h3,button";
function _relabelText(s){
  let out=String(s);
  for(const [a,b] of RELABEL){ if(out.indexOf(a)!==-1) out=out.split(a).join(b); }
  return out;
}
function relabelPage(pageId){
  if(!isCleaningProject()) return;
  const root=document.getElementById(pageId);
  if(!root) return;
  try{
    root.querySelectorAll(RELABEL_SEL).forEach(el=>{
      // نصوص العنصر المباشرة فقط (لا نغوص في أبنائه فنكرّر العمل)
      el.childNodes.forEach(n=>{
        if(n.nodeType===3){ const t=_relabelText(n.nodeValue); if(t!==n.nodeValue) n.nodeValue=t; }
      });
      if(el.placeholder){ const p=_relabelText(el.placeholder); if(p!==el.placeholder) el.placeholder=p; }
    });
  }catch(e){ console.warn("cleaningOps/relabel",e); }
}

/* ════════════ التقرير المصوّر: إدراج تنفيذات النظافة المصوّرة ════════════
   التقرير يبني قائمته من البلاغات (photoReportTickets). لا نحوّل تنفيذات النظافة إلى
   بلاغات — جدولٌ يوميٌّ يعني مئات البلاغات شهرياً تُغرق القائمة وتشوّه مؤشّرات الصيانة.
   بدلاً من ذلك نلفّ generatePhotoReport فنُلحق سجلّات التنفيذ المصوّرة بشكل بلاغٍ
   للعرض فقط، محترمين نفس فلاتر التقرير. لغير مشاريع النظافة لا شيء يحدث. */
let _logCache = [];   // سجلّات التنفيذ المصوّرة (تُقرأ عند توليد التقرير فقط)
async function loadPhotoLog(fromYmd, toYmd){
  const database=_db(), col=logCol();
  if(!database || !col){ _logCache=[]; return _logCache; }
  try{
    let q=database.collection(col);
    if(fromYmd) q=q.where("date",">=",fromYmd);
    if(toYmd)   q=q.where("date","<=",toYmd);
    const snap=await q.limit(1000).get();
    _logCache=snap.docs.map(d=>d.data()||{}).filter(r=>Array.isArray(r.photos)&&r.photos.length);
  }catch(e){ console.warn("cleaningOps/loadPhotoLog",e); _logCache=[]; }
  return _logCache;
}
// سجلّ تنفيذٍ ⟵ شكل بلاغٍ يفهمه التقرير المصوّر (عرضٌ فقط، بلا كتابة)
function _logAsTicket(r){
  return {
    id: r.id, createdAt: r.at, closedAt: r.at,
    building: r.building||"", location: r.floor||"",
    workType: r.workType||"", maintType: "نظافة دورية",
    priority: "روتيني 🔵 (صيانة دورية)",
    supervisor: r.supervisor||"", tech: r.by||"",
    status: "مغلق", desc: r.taskName||"مهمة نظافة",
    workDone: r.note || ((r.doneItems||0)+"/"+(r.totalItems||0)+" بند فحص"),
    photos: (r.photos||[]).slice(), ticketPhoto:"",
    _cleaning: true
  };
}
/* فلتر «مصدر التقرير» — يُحقَن في فلاتر التقرير المصوّر لمشاريع النظافة وحدها.
   الكل | النظافة فقط | البلاغات فقط. */
const PR_SRC_ID="co-pr-source";
function injectPhotoSourceFilter(){
  const wrap=document.querySelector("#page-photo-report .report-filters");
  const existing=document.getElementById(PR_SRC_ID);
  if(!wrap || !isCleaningProject()){
    if(existing && existing.parentElement) existing.parentElement.remove();
    return;
  }
  if(existing) return;
  const g=document.createElement("div");
  g.className="form-group"; g.style.marginBottom="0";
  g.innerHTML='<label class="form-label">مصدر التقرير</label>'+
    '<select class="form-select" id="'+PR_SRC_ID+'">'+
      '<option value="">الكل (نظافة + بلاغات)</option>'+
      '<option value="cleaning">أعمال النظافة فقط</option>'+
      '<option value="tickets">البلاغات فقط</option>'+
    '</select>';
  wrap.insertBefore(g, wrap.firstChild);
  const sel=g.querySelector("select");
  if(sel) sel.onchange=()=>{ try{ generatePhotoReport(); }catch(e){} };
}
function _prSource(){ const el=document.getElementById(PR_SRC_ID); return el?el.value:""; }

function hookPhotoReport(){
  if(window._coPhotoHooked || typeof window.generatePhotoReport!=="function") return;
  const orig=window.generatePhotoReport;
  window.generatePhotoReport=function(){
    if(!isCleaningProject()) return orig.apply(this, arguments);
    const src=_prSource();
    // «البلاغات فقط» ⟵ السلوك الأصلي بلا أي إدراج
    if(src==="tickets") return orig.apply(this, arguments);
    const r=orig.apply(this, arguments);
    const g=id=>{ const el=document.getElementById(id); return el?el.value:""; };
    const from=g("pr-from"), to=g("pr-to"), rb=g("pr-building"), rt=g("pr-type"), rs=g("pr-supervisor");
    loadPhotoLog(from, to).then(recs=>{
      const extra=recs
        .filter(x=>(!rb||x.building===rb) && (!rt||x.workType===rt) && (!rs||(x.supervisor||"")===rs))
        .map(_logAsTicket);
      try{
        if(src==="cleaning"){
          // النظافة وحدها — نستبدل القائمة ولا نضمّها للبلاغات
          photoReportTickets = extra;
          const out=document.getElementById("photo-report-output");
          if(!extra.length){
            if(out) out.innerHTML='<div class="card" style="text-align:center;color:var(--muted);padding:40px">لا توجد أعمال نظافة مصوّرة مطابقة للتصفية في هذه الفترة</div>';
            const pb=document.getElementById("print-photo-btn"); if(pb) pb.style.display="none";
            return;
          }
          if(typeof renderPhotoReportOutput==="function") renderPhotoReportOutput(photoReportTickets);
          return;
        }
        if(!extra.length) return;
        photoReportTickets = (Array.isArray(photoReportTickets)?photoReportTickets:[]).concat(extra);
        if(typeof renderPhotoReportOutput==="function") renderPhotoReportOutput(photoReportTickets);
      }catch(e){ console.warn("cleaningOps/photoReport",e); }
    });
    return r;
  };
  window._coPhotoHooked=true;
}

/* ══ لفّ repopulateAllSelects — التعريب يصمد أمام وصول الإعدادات المتأخّر ══
   الإعدادات (المباني/المشرفون/أنواع العمل) تصل من Firestore **بعد** رسم الصفحة، وعندها
   تستدعي النواة repopulateAllSelects فتعيد بناء كل الخيارات — فيُمحى تعريبنا السابق
   وتظهر مسمّياتُ الصيانة من جديد. نلفّها فنعيد التعريب بعد كل إعادة بناء، فيبقى
   صحيحاً مهما تأخّرت الإعدادات أو تكرّر البناء. (لغير مشاريع النظافة لا شيء يحدث.) */
const RELABEL_PAGES = ["page-new","page-tickets","page-tickets-archive"];
function relabelAllPages(){ RELABEL_PAGES.forEach(p=>{ try{ relabelPage(p); }catch(e){} }); }
/* ★ لوحةُ الإدارة تُرسم قبل وصول الإعدادات فتبقى قوائمُ المباني والمشرفين والفنيين
   **فارغةً** حتى يغادر المستخدمُ الصفحةَ ويعود: loadSettings تُستدعى بلا انتظار، وعند
   اكتمالها تُحدِّث القوائمَ المنسدلة (repopulateAllSelects) لكنها لا تُعيد رسم قوائم
   اللوحة — وهي تُبنى من BUILDINGS/SUPERVISORS مباشرةً.

   التدخّل أضيقُ ما يمكن: نملأ قائمةً **فارغةً** فقط حين تتوفّر بياناتها. فلا يمكن أن
   يمحو ما كتبه المستخدم (القائمة الفارغة لا شيء فيها لِيُمحى)، ويعمل لكل المشاريع لأن
   العلّة في النواة لا في النظافة. */
function refreshEmptyAdminLists(){
  const pg=document.getElementById("page-admin-panel");
  if(!pg || !pg.classList.contains("active")) return;
  const fill=(elId, count, fn)=>{
    const el=document.getElementById(elId);
    if(!el || el.children.length || !count) return;      // ليست فارغة أو لا بيانات
    try{ if(typeof window[fn]==="function") window[fn](); }catch(e){ console.warn("cleaningOps/"+fn,e); }
  };
  let wtCount=0; try{ wtCount=Object.keys(WORK_TYPES||{}).length; }catch(e){}
  fill("admin-buildings-list",   _buildings().length,   "renderAdminBuildingsList");
  fill("admin-supervisors-list", _supervisors().length, "renderAdminSupervisorsList");
  fill("admin-worktypes-list",   wtCount,               "renderAdminWorkTypesList");
  fill("admin-techs-list",       wtCount,               "renderAdminTechsList");
}

function hookRepopulate(){
  if(window._coRepopHooked || typeof window.repopulateAllSelects!=="function") return;
  const orig=window.repopulateAllSelects;
  window.repopulateAllSelects=function(){
    const r=orig.apply(this, arguments);
    if(isCleaningProject()) relabelAllPages();
    try{ refreshEmptyAdminLists(); }catch(e){ console.warn("cleaningOps/adminLists",e); }
    return r;
  };
  window._coRepopHooked=true;
}

/* ── متابعة يومية خاصة بالنظافة ──
   نفس أسلوب اللوحة التنفيذية: إخفاءٌ لا حذف، فتبقى عناصر النواة سليمةً لدوالها. */
const DAILY_ID="co-daily";
function dailyHTML(){
  const s=boardStats();
  const cov=coverageByBuilding();
  const tile=(icon,val,lbl,c)=>`
    <div class="stat-tile" style="--_c:${c}">
      <div class="st-ico">${_svg(icon)}</div>
      <div class="st-val" style="color:${c}">${val}</div>
      <div class="st-lbl">${lbl}</div>
    </div>`;
  const pendingOnTime=Math.max(0,s.due-s.overdue);
  const seg=(n,cls)=> n>0?`<span class="${cls}" style="flex:${n}"></span>`:"";
  const active=visibleTasks().filter(t=>!isDisabled(t));
  const todays=active.filter(t=>isDue(t)||doneToday(t)).sort((a,b)=>dueStatus(a).sort-dueStatus(b).sort);
  const d=new Date();
  const dayName=["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"][d.getDay()];
  return `
    <div class="page-hero">
      <div class="page-hero-titles">
        <div class="page-hero-title"><span class="ph-ico">${_svg('daily')}</span> المتابعة اليومية — النظافة</div>
        <div class="page-hero-sub">${dayName}، ${_today()}</div>
      </div>
      <div class="page-hero-actions">
        <button class="btn btn-sm" onclick="cleaningOps.goOps()">${_svg('clipboardList')} تشغيل النظافة</button>
        <button class="btn btn-sm" onclick="cleaningOps.refreshDaily()">${_svg('rotateCcw')} تحديث</button>
      </div>
    </div>
    <div class="co-tiles">
      ${tile('calendar',    s.scheduled, "مجدول اليوم", "var(--primary)")}
      ${tile('checkCircle', s.done,      "نُفِّذ اليوم",  "var(--sla-ok)")}
      ${tile('hourglass',   s.due,       "متبقٍّ اليوم", s.due>0?"var(--sla-warn)":"var(--sla-ok)")}
      ${tile('target',      s.coverage+"%", "التغطية",  s.coverage>=95?"var(--sla-ok)":(s.coverage>=70?"var(--sla-warn)":"var(--sla-crit)"))}
    </div>
    ${s.scheduled>0?`<div class="card">
      <div class="co-sec"><div class="co-sec-t">${_svg('activity')} تغطية اليوم</div>
        <span class="co-sec-c"><b>${s.done}</b> من ${s.scheduled}</span></div>
      <div class="hbar">${seg(s.done,'s-ok')}${seg(pendingOnTime,'s-warn')}${seg(s.overdue,'s-crit')}</div>
      <div class="hleg">
        <div class="it"><i style="background:var(--sla-ok)"></i>نُفِّذ <span class="n">${s.done}</span></div>
        ${pendingOnTime>0?`<div class="it"><i style="background:var(--sla-warn)"></i>متبقٍّ <span class="n">${pendingOnTime}</span></div>`:""}
        ${s.overdue>0?`<div class="it"><i style="background:var(--sla-crit)"></i>متأخّر <span class="n">${s.overdue}</span></div>`:""}
      </div>
    </div>`:""}
    ${s.overdue>0?`<div class="ppm-overdue-banner"><span class="co-bnr-ic">${_svg('alertTriangle')}</span>
      <span>${s.overdue} مهمة متأخّرة — عالجها اليوم قبل أن تتراكم.</span></div>`:""}
    ${cov.length?`<div class="card">
      <div class="co-sec"><div class="co-sec-t">${_svg('building2')} التغطية حسب المنطقة</div>
        <span class="co-sec-c">الأضعف أولاً</span></div>
      ${cov.map(b=>{
        const c=b.pct>=100?"var(--sla-ok)":(b.pct>=60?"var(--sla-warn)":"var(--sla-crit)");
        return `<div class="co-cov">
          <div class="co-cov-h"><span class="n">${_esc(b.name)}</span>
            <span class="p" style="color:${c}">${b.pct}% <small>(${b.done}/${b.sched})</small></span></div>
          <div class="hbar"><span style="flex:${Math.max(b.pct,0.01)};background:${c}"></span><span style="flex:${Math.max(100-b.pct,0.01)};background:var(--surface2)"></span></div>
        </div>`;
      }).join("")}
    </div>`:""}
    ${todays.length ? _byBuildingGrid(todays)
      : `<div class="card"><div class="co-empty" style="padding:26px">${_svg('checkCircle')}
         <div class="co-empty-t">لا مهامّ مستحقّة اليوم</div>
         <div class="co-empty-s">كل المهامّ ضمن مواعيدها.</div></div></div>`}`;
}
function mountDaily(){
  const host=document.getElementById("page-daily");
  if(!host) return;
  if(!isCleaningProject()){ unmountDaily(); return; }
  let box=document.getElementById(DAILY_ID);
  if(!box){ box=document.createElement("div"); box.id=DAILY_ID; host.insertBefore(box, host.firstChild); }
  host.classList.add("co-daily-mode");
  if(!_loaded || _loadedFor!==_projId()){
    box.innerHTML=`<div class="card"><div class="co-empty"><div class="co-empty-t">جارٍ تحميل مهامّ اليوم…</div></div></div>`;
    _afterLoad();
    return;
  }
  box.innerHTML=dailyHTML();
}
function unmountDaily(){
  const host=document.getElementById("page-daily");
  if(host) host.classList.remove("co-daily-mode");
  const box=document.getElementById(DAILY_ID);
  if(box) box.remove();
}
async function refreshDaily(){ await loadTasks(true); mountDaily(); _toast("✅ حُدِّثت المتابعة","success"); }

/* استباقُ التحميل: نبدأ جلب المهامّ فور معرفة أن المشروع نظافة، لا عند أول ضغطة —
   فتكون البيانات جاهزةً غالباً قبل أن يفتح المستخدم أيّ شاشة، ويختفي انتظارُ أول عرض.
   آمنٌ لأن loadTasks تُوحّد النداء الشبكي، والاكتمالُ يُحدِّث كل سطحٍ مركَّب. */
function _prefetch(){
  if(!isCleaningProject()) return;
  if(_loaded && _loadedFor===_projId()) return;
  _afterLoad();
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

/* ══ حقن زرّ القائمة الجانبية — يظهر لمشاريع النظافة فقط ══ */
function injectSidebarButton(){
  const shouldShow = canView() && isCleaningProject();
  const existing=document.getElementById("nav-cleaning-ops-btn");
  if(!shouldShow){ if(existing) existing.remove(); return; }
  if(existing) return;
  const nav=document.querySelector(".sidebar-nav");
  if(!nav) return;
  const btn=document.createElement("button");
  btn.className="sidebar-nav-btn";
  btn.id="nav-cleaning-ops-btn";
  btn.dataset.page=PAGE_ID;
  btn.innerHTML='<span class="s-icon">'+_svg('sparkles')+'</span> تشغيل النظافة';
  btn.onclick=()=>{ try{ showPage(PAGE_ID); }catch(e){} };
  // بعد زرّ لوحة المعلومات إن وُجد، وإلا في مقدّمة القائمة
  const dash=nav.querySelector('.sidebar-nav-btn[data-page="dashboard"]');
  if(dash && dash.nextSibling) nav.insertBefore(btn, dash.nextSibling);
  else nav.insertBefore(btn, nav.firstChild);
}

/* ══ حقن نوع «إدارة نظافة» في نافذتَي إنشاء/تعديل المشروع دون تعديل index.html ══
   index.html ملفٌ ضخم (٢.٤ ميغابايت)، فنبقيه بلا إضافاتٍ وظيفية: نلفّ دالتَي فتح
   النافذتين (نفس نمط لفّ showPage الذي تستعمله وحدات المنصة) ونُلحق الخيار بالقائمة
   بعد بنائها. النواة لا تعرف الخيار فلا تختاره عند التعديل — نضبطه هنا من سجلّ المشروع.
   حارسٌ في hail-tests يتحقّق أن هدفَي الحقن (np-type/ep-type) ما زالا موجودين. */
const TYPE_OPT_LABEL = "إدارة نظافة (عقد تشغيل)";
function _addTypeOption(selId, hintId, selectIt){
  const sel=document.getElementById(selId);
  if(!sel || sel.querySelector('option[value="cleaning"]')) return;
  const o=document.createElement("option");
  o.value="cleaning"; o.textContent=TYPE_OPT_LABEL;
  sel.appendChild(o);
  if(selectIt) sel.value="cleaning";
  const hint=document.getElementById(hintId);
  if(hint && hint.textContent.indexOf("نظافة")===-1){
    hint.textContent += " و«إدارة نظافة» يظهر لها قسم «تشغيل النظافة» (الجدول اليومي) وبطاقةُ عقدٍ ماليةٌ بربحيةٍ شهرية.";
  }
}
function hookProjectModals(){
  if(window._coModalsHooked) return;
  const add=window.openAddProjectModal, edit=window.openEditProjectModal;
  if(typeof add!=="function" || typeof edit!=="function") return;
  window.openAddProjectModal=function(){
    add.apply(this, arguments);
    try{ _addTypeOption("np-type","np-type-hint",false); }catch(e){ console.warn("cleaningOps/np-type",e); }
  };
  window.openEditProjectModal=function(projId){
    edit.apply(this, arguments);
    try{
      let isC=false;
      const list=(typeof _projectsList!=="undefined" && Array.isArray(_projectsList)) ? _projectsList : [];
      const p=list.find(x=>x&&x.id===projId);
      if(p && p.type==="cleaning") isC=true;
      _addTypeOption("ep-type","ep-type-hint",isC);
    }catch(e){ console.warn("cleaningOps/ep-type",e); }
  };
  window._coModalsHooked=true;
}

/* ══ لفّ showPage دون تعديل النواة ══ */
function hookShowPage(){
  if(window._coHooked || typeof window.showPage!=="function") return;
  const orig=window.showPage;
  window.showPage=function(id){
    if(id===PAGE_ID && !(canView() && isCleaningProject())){
      try{ toast("🔒 هذا القسم متاح لمشاريع «إدارة نظافة» فقط","warn"); }catch(e){}
      return orig.apply(this, ["dashboard"]);
    }
    orig.apply(this, arguments);
    // اللوحة التنفيذية: لعقود النظافة نعرض لوحتنا ونُخفي لوحة الصيانة (بلا حذف)،
    // ولغيرها نرفع الإخفاء فوراً — فمشاريع الصيانة لا تتأثّر إطلاقاً.
    if(id==="dashboard"){ try{ mountExec(); }catch(e){ console.warn("cleaningOps/mountExec",e); } }
    // المتابعة اليومية: نسخةُ النظافة بدل نسخة البلاغات (إخفاءٌ لا حذف)
    if(id==="daily"){ try{ mountDaily(); }catch(e){ console.warn("cleaningOps/mountDaily",e); } }
    if(id==="photo-report"){ try{ injectPhotoSourceFilter(); }catch(e){ console.warn("cleaningOps/prFilter",e); } }
    // تعريب مصطلحات صفحات أوامر العمل + ضمانُ وجود أنواع عمل النظافة
    if(id==="new"||id==="tickets"||id==="tickets-archive"){
      try{ seedWorkTypes(); }catch(e){}
      // النواة ترسم محتوى هذه الصفحات بعد التفعيل — نعرّب بعد إطارٍ ثم بعد استقرارها
      try{ relabelPage("page-"+id); }catch(e){}
      setTimeout(()=>{ try{ relabelPage("page-"+id); }catch(e){} }, 60);
      setTimeout(()=>{ try{ relabelPage("page-"+id); }catch(e){} }, 400);
    }
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
  window._coHooked=true;
}

// تبديل المشروع يبطل الحالة المحمَّلة (كل مجموعة معزولة بمعرّف المشروع)
function _watchProject(){
  let last=_projId();
  setInterval(()=>{
    const cur=_projId();
    if(cur!==last){
      last=cur;
      _tasks=[]; _loaded=false; _loadedFor="";
      _editing=null; _execFor=null; _execState=[]; _genForm=false; _view="board";
      // ارفع لوحات النظافة فوراً عند مغادرة مشروع النظافة — قبل معرفة نوع الجديد
      unmountExec(); unmountDaily();
      ensureTypeKnown(()=>{
        injectSidebarButton();
        if(_onPage()) render();
        // أعِد تركيب الصفحة المعروضة حسب نوع المشروع الجديد
        const dash=document.getElementById("page-dashboard");
        if(dash && dash.classList.contains("active")) mountExec();
        const dly=document.getElementById("page-daily");
        if(dly && dly.classList.contains("active")) mountDaily();
        injectPhotoSourceFilter();
        seedWorkTypes();
        _prefetch();
      });
    }
  }, 1500);
}

function injectCSS(){
  if(document.getElementById("co-css")) return;
  const st=document.createElement("style"); st.id="co-css";
  // طبقةٌ رقيقة عمداً: كل ما له مقابلٌ في المنصة يُستخدَم بصنفه الأصلي
  // (.page-hero / .stat-tile / .card / .ppm-card / .ppm-chip / .ppm-pill /
  //  .ppm-due-badge / .ppm-meta-row / .ppm-overdue-banner / .hbar / .hleg /
  //  .btn / .form-group / .form-input) — فتتبع الصفحةُ أيَّ تغييرٍ في هوية المنصة تلقائياً.
  // لا يُعرَّف هنا إلا ما لا مقابل له: شبكةُ البلاطات، ترويسةُ القسم، بنودُ قائمة الفحص،
  // الحالةُ الفارغة، والجدول.
  st.textContent = `
#page-${PAGE_ID}{direction:rtl}
/* اللوحة التنفيذية لعقود النظافة: تُخفى أقسام لوحة الصيانة ولا تُحذف — فتبقى عناصر
   النواة موجودةً يجدها renderDashboard() بلا خطأ، ويُرفَع الإخفاء بإزالة الصنف. */
#page-dashboard.co-exec-mode > *:not(#${EXEC_ID}){display:none!important}
#page-daily.co-daily-mode > *:not(#${DAILY_ID}){display:none!important}
#${EXEC_ID},#${DAILY_ID}{direction:rtl}
/* إصلاحُ خللٍ في النواة (يصيب مشاريع الصيانة أيضاً): الحالةُ الفارغة في أرشيف البلاغات
   تضع أيقونةً بلا أبعاد داخل حاويةٍ تضبط font-size فقط — وfont-size لا يحجّم SVG، فيتمدّد
   ليملأ عرض البطاقة. سطرٌ واحد يعيدها لحجمها المقصود، بلا مسّ أي منطق. */
#archive-content div[style*="font-size:28px"] > svg{width:28px;height:28px}
.co-fin{display:flex;flex-direction:column;gap:1px}
.co-fin-i{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 2px;border-bottom:1px dashed var(--border)}
.co-fin-i:last-child{border-bottom:none}
.co-fin-i .k{font-size:12.5px;color:var(--muted);font-weight:700}
.co-fin-i .v{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;font-size:15px;font-weight:700;color:var(--text)}
.co-fin-i .v.neg{color:var(--muted)}
.co-fin-i.tot{border-top:1px solid var(--border);margin-top:3px;padding-top:11px}
.co-fin-i.tot .k{color:var(--text);font-weight:800}
.co-fin-i.tot .v{font-size:19px;font-weight:800}
.co-cov{margin-bottom:11px}
.co-cov:last-child{margin-bottom:0}
.co-cov-h{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:5px}
.co-cov-h .n{font-size:12.5px;font-weight:700;color:var(--text)}
.co-cov-h .p{font-family:'JetBrains Mono',monospace;font-size:12.5px;font-weight:800}
.co-cov-h .p small{font-family:'Cairo',sans-serif;font-weight:700;color:var(--muted);font-size:10.5px}
#page-${PAGE_ID} .page-hero-actions .btn.co-seg-on{background:rgba(255,255,255,.34);border-color:rgba(255,255,255,.55);font-weight:800}
.co-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}
/* المباني جنباً إلى جنب: عمودٌ لكل مبنى بدل صفٍّ لكل مهمة — يستفيد من عرض الشاشة.
   align-items:start فلا يتمدّد المبنى القليلُ مهامُّه ليطابق أطولَ جاره. */
.co-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:12px;align-items:start}
.co-groups .co-group{margin-bottom:0;min-width:0}
/* شبكةٌ داخليةٌ للمهامّ داخل بطاقة المبنى: مبنًى واحدٌ يملأ العرض فتتوزّع مهامُّه على
   أعمدةٍ متعددة، وعدّةُ مبانٍ تتجاور فتصير مهامُّ كلٍّ عموداً واحداً — تكيُّفٌ تلقائيّ
   بلا نقطةِ كسرٍ ثابتة، فلا تنحشر البطاقات ولا تُهدَر مساحةُ الشاشة. */
.co-tasklist{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:8px;align-items:start}
.co-tasklist>.ppm-card{margin-bottom:0}
/* بطاقاتٌ مصغَّرة داخل صفحات النظافة وحدها — لا تمسّ .ppm-card في صفحة الوقائية */
#page-${PAGE_ID} .ppm-card,#${EXEC_ID} .ppm-card,#${DAILY_ID} .ppm-card{padding:9px 11px;margin-bottom:7px;border-radius:11px}
#page-${PAGE_ID} .ppm-chip,#${EXEC_ID} .ppm-chip,#${DAILY_ID} .ppm-chip{width:30px;height:30px;border-radius:9px}
#page-${PAGE_ID} .ppm-chip svg,#${EXEC_ID} .ppm-chip svg,#${DAILY_ID} .ppm-chip svg{width:16px;height:16px}
#page-${PAGE_ID} .ppm-meta-row,#${EXEC_ID} .ppm-meta-row,#${DAILY_ID} .ppm-meta-row{font-size:10.5px;gap:4px;flex-wrap:wrap}
#page-${PAGE_ID} .ppm-meta-row .mi svg,#${EXEC_ID} .ppm-meta-row .mi svg,#${DAILY_ID} .ppm-meta-row .mi svg{width:11px;height:11px}
#page-${PAGE_ID} .ppm-pill,#${EXEC_ID} .ppm-pill,#${DAILY_ID} .ppm-pill,
#page-${PAGE_ID} .ppm-due-badge,#${EXEC_ID} .ppm-due-badge,#${DAILY_ID} .ppm-due-badge{
  font-size:9.5px;padding:3px 8px;white-space:nowrap;line-height:1.6}
/* العبارات الطويلة («النظافة العميقة الدورية») كانت تُكسَر داخل الشارة فتبدو مبعثرة:
   الشارةُ الآن لا تُكسَر داخلياً، والصفُّ يلتفّ **بين** الشارات لا داخلها. */
#page-${PAGE_ID} .co-pills,#${EXEC_ID} .co-pills,#${DAILY_ID} .co-pills{row-gap:6px}
#page-${PAGE_ID} .ppm-meta-row,#${EXEC_ID} .ppm-meta-row,#${DAILY_ID} .ppm-meta-row{align-items:center}
.co-card-t{overflow-wrap:anywhere}
.co-clickable{cursor:pointer;transition:border-color .15s}
.co-clickable:hover{border-color:var(--primary)}
.co-clickable:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
/* سجلّ التنفيذ في شاشة التفاصيل */
.co-logrow{border:1px solid var(--border);border-radius:11px;padding:10px 12px;margin-bottom:9px;background:var(--surface2)}
.co-logrow:last-child{margin-bottom:0}
.co-logrow-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:11.5px;font-weight:700;color:var(--text)}
.co-logrow-h .d,.co-logrow-h .b{display:inline-flex;align-items:center;gap:5px;color:var(--muted)}
.co-logrow-h svg{width:12px;height:12px;stroke-width:2}
.co-logrow-h .ppm-due-badge{margin-inline-start:auto}
.co-lognote{font-size:11.5px;color:var(--text);margin-top:7px;display:flex;align-items:flex-start;gap:6px;line-height:1.7}
.co-lognote svg{width:12px;height:12px;stroke-width:2;flex:none;margin-top:3px;color:var(--muted)}
.co-logphotos{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
.co-logphotos img{width:76px;height:76px;object-fit:cover;border-radius:9px;border:1px solid var(--border);display:block}
.co-sec{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:11px}
.co-sec-t{display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:800;font-family:'Cairo',sans-serif;color:var(--primary)}
.co-sec-t svg{width:16px;height:16px;stroke-width:2;flex-shrink:0}
.co-sec-c{font-size:11.5px;color:var(--muted);font-weight:700}
.co-sec-c b{font-family:'JetBrains Mono',monospace;color:var(--text)}
.co-card-row{display:flex;align-items:flex-start;gap:11px;flex-wrap:wrap}
.co-card-main{flex:1 1 auto;min-width:0}
.co-card-t{font-size:12.5px;font-weight:800;color:var(--text);line-height:1.35}
.co-pills{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:5px}
.co-pills .co-by{background:var(--sla-ok-bg);color:var(--sla-ok);border:1px solid var(--sla-ok-bd)}
.co-pills .co-by svg{width:11px;height:11px;stroke-width:2.2}
/* الأزرار في سطرٍ مستقلٍّ أسفل البطاقة: مزاحمتُها للنصّ كانت تخنق العنوان في البطاقة
   الضيّقة (الأيقونة + النصّ + زرّان في 250px). الآن يأخذ النصُّ عرض البطاقة كاملاً. */
.co-card-act{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;
  margin-top:8px;padding-top:8px;border-top:1px dashed var(--border)}
.ppm-card.completed .co-card-t{color:var(--muted)}
.co-pane{max-width:760px}
.co-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:560px){.co-grid2{grid-template-columns:1fr}}
.co-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}
.co-chk{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);margin-bottom:13px;cursor:pointer}
.co-del{color:var(--danger)}
.co-ck-list{display:flex;flex-direction:column;gap:5px;margin-bottom:14px}
.co-ck{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;font-size:12.5px;font-weight:600;color:var(--text);cursor:pointer;background:var(--surface2);transition:border-color .15s,background .15s}
.co-ck:hover{border-color:var(--primary)}
.co-ck:has(input:checked){background:var(--sla-ok-bg);border-color:var(--sla-ok-bd);color:var(--sla-ok)}
.co-ck input{width:17px;height:17px;cursor:pointer;flex:none;accent-color:var(--sla-ok)}
.co-ck svg{width:16px;height:16px;flex:none;stroke-width:2}
.co-hint{font-size:11.5px;color:var(--muted);margin-top:11px;line-height:1.9}
.co-photos{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:14px}
.co-photo{position:relative;width:96px;height:96px;border-radius:11px;overflow:hidden;border:1px solid var(--border);background:var(--surface2);flex:none}
.co-photo.err{border-color:var(--sla-crit)}
.co-photo img{width:100%;height:100%;object-fit:cover;display:block}
/* طبقتا الشارة والحذف تعلوان صورةَ المستخدم لا سطحَ المنصة، فألوانهما مستقلةٌ عن الثيم
   عمداً (أبيضُ فوق حجابٍ داكن يقرأ في الوضعين) — لا تُشتقّ من التوكنز. */
.co-photo-st{position:absolute;inset-block-end:0;inset-inline:0;background:rgba(0,0,0,.62);color:rgba(255,255,255,.96);font-size:9.5px;font-weight:700;text-align:center;padding:3px 2px}
.co-photo-x{position:absolute;inset-block-start:3px;inset-inline-end:3px;width:21px;height:21px;border:none;border-radius:50%;background:rgba(0,0,0,.55);color:rgba(255,255,255,.96);font-size:12px;line-height:1;cursor:pointer;padding:0}
.co-photo-add{width:96px;height:96px;border:1.5px dashed var(--border);border-radius:11px;background:var(--surface2);color:var(--muted);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;font-size:10.5px;font-weight:700;font-family:'Cairo',sans-serif;cursor:pointer;flex:none}
.co-photo-add:hover{border-color:var(--primary);color:var(--primary)}
.co-photo-add svg{width:21px;height:21px;stroke-width:1.8}
.co-supbox{border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px;background:var(--surface2)}
.co-sup-h{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:800;color:var(--primary);margin-bottom:9px}
.co-sup-h svg{width:15px;height:15px;stroke-width:2}
.co-sup-h .co-sec-c{margin-inline-start:auto}
.co-sup-blds{display:flex;flex-wrap:wrap;gap:7px}
.co-bld{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border:1px solid var(--border);border-radius:999px;background:var(--surface);font-size:11.5px;font-weight:700;cursor:pointer}
.co-bld.on{background:var(--sla-ok-bg);border-color:var(--sla-ok-bd);color:var(--sla-ok)}
.co-bld.taken{opacity:.6}
.co-bld small{color:var(--muted);font-weight:600}
.co-bld input{width:15px;height:15px;cursor:pointer;accent-color:var(--sla-ok)}
/* أيقونة شريط التنبيه: المنصة تستعمل في .ppm-overdue-banner نقطةً بالـ CSS لا SVG، فلا
   قاعدة تضبط أبعاده هناك — وSVG بلا width/height داخل حاوية flex يتمدّد ليملأها. نغلّفه
   بمحدِّدٍ خاصٍّ بنا (لا نعرّف قاعدةً على صنف المنصة) فيبقى بحجمه الصحيح. */
.co-bnr-ic{display:inline-flex;flex:none;align-items:center}
.co-bnr-ic svg{width:16px;height:16px;stroke-width:2;display:block}
.co-empty{text-align:center;color:var(--muted);padding:38px 20px}
.co-empty svg{width:34px;height:34px;stroke-width:1.6;opacity:.42;margin-bottom:10px}
.co-empty-t{font-size:14px;font-weight:800;font-family:'Cairo',sans-serif;color:var(--text)}
.co-empty-s{font-size:12px;margin-top:5px;line-height:1.85}
.co-table-wrap{overflow-x:auto}
.co-table{width:100%;border-collapse:collapse;font-size:12.5px;min-width:780px}
.co-table th{background:var(--surface2);padding:10px 12px;text-align:right;font-weight:800;color:var(--primary);font-size:11.5px;white-space:nowrap}
.co-table td{padding:10px 12px;border-top:1px solid var(--border);color:var(--text)}
.co-td-name{font-weight:700;white-space:nowrap}
.co-td-ic{display:inline-flex;vertical-align:-3px;color:var(--primary)}
.co-td-ic svg{width:15px;height:15px;stroke-width:2}
.co-num{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;direction:ltr;text-align:right}
.co-tr-off{opacity:.5}

`;
  document.head.appendChild(st);
}

function init(){
  ensurePage();
  hookShowPage();
  hookProjectModals();
  hookRepopulate();
  hookPhotoReport();
  ensureTypeKnown(()=>{ injectSidebarButton(); _prefetch(); });
  injectSidebarButton();
  _prefetch();
  _watchProject();
  // القائمة الجانبية يُعاد بناؤها بعد الدخول/تبديل المشروع — أعِد الحقن عند التغيير
  const obs=new MutationObserver(()=>{ injectSidebarButton(); hookShowPage(); hookProjectModals(); hookRepopulate(); hookPhotoReport(); injectPhotoSourceFilter(); });
  obs.observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
else init();

/* ════════════ الواجهة العامة ════════════ */
window.cleaningOps = {
  render, setView, refresh, toggleGen, doGen,
  addTask, editTask, cancelEdit, saveEdit, removeTask, onBuildingChange,
  exec, toggleItem, cancelExec, confirmExec, pickPhoto, delPhoto:delExecPhoto,
  openDetail, closeDetail,
  saveSupMap,
  mountExec, unmountExec, refreshExec, goOps,
  mountDaily, unmountDaily, refreshDaily, seedWorkTypes, relabelPage, injectPhotoSourceFilter,
  startSync(){ /* لا مزامنة مستقلة — القراءة بـ .get() عند العرض (انضباط المستمعين) */ },
  version: VERSION,
  build: MODULE_BUILD,
  // مكشوفة لفحوص hail-tests (دوال نقية)
  _boardStats: boardStats,
  _coverageByBuilding: coverageByBuilding, _supOfBuilding: supOfBuilding,
  _logAsTicket: _logAsTicket, _taskSupervisor: taskSupervisor,
  _salvageObjects: _salvageObjects,
  _svg: _svg,
  _relabelText: _relabelText, _RELABEL: RELABEL, _WT_SEED: CLEANING_WT_SEED,
  _isDue: isDue, _isOverdue: isOverdue, _doneToday: doneToday, _dueStatus: dueStatus,
  _addDays: _addDays, _today: _today,
  _FREQ_DAYS: FREQ_DAYS,
  _WORK_TYPES: CLEANING_WORK_TYPES
};

})();
