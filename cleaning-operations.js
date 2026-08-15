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
const MODULE_BUILD = "v18.9.2680";

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

/* ════════════ العطلة الأسبوعية — الجمعة والسبت (مشاريع النظافة فقط) ════════════
   قاعدةٌ ثابتة: لا عملَ دوريٌّ متوقَّع يومَي الجمعة/السبت في عقود النظافة. مُقيَّدةٌ بـ
   isCleaningProject فلا أثرَ على الصيانة/المشتريات. (getDay: 5=الجمعة، 6=السبت.)
   ثلاثةُ آثار: (١) ترحيلُ أيِّ استحقاقٍ يقع في العطلة لأوّل يوم عمل، (٢) لوحةُ اليوم في
   العطلة تُظهر «إجازة» بلا مهامّ ولا ضغطِ تغطية، (٣) التأخّر يُحسب **بأيام العمل فقط**. */
// حسابُ العطلة نقيٌّ (يُختبَر بتواريخ صريحة)؛ الوحدةُ لا تعمل إلا في مشاريع النظافة أصلاً.
function _isWeekend(ymd){ const d=_pDate(ymd).getDay(); return d===5||d===6; }   // 5=الجمعة، 6=السبت
// «اليوم إجازة؟» يبقى مبنيّاً على نوع المشروع فلا يجعل isDue/dueStatus مرتبطةً بيوم الأسبوع خارج النظافة
function _isTodayHoliday(){ return isCleaningProject() && _isWeekend(_today()); }
// أوّل يوم عملٍ من التاريخ (يتخطّى الجمعة/السبت)
function _nextWorkingDay(ymd){ let y=ymd, g=0; while(_isWeekend(y) && g++<8) y=_addDays(y,1); return y; }
// تقديمُ الاستحقاق: (اليوم + مدةُ التكرار) ثم ترحيلٌ لأوّل يوم عمل
function _advanceDue(fromYmd, days){ return _nextWorkingDay(_addDays(fromYmd, days)); }
// أيامُ العمل المنقضية منذ الاستحقاق حتى اليوم (تتجاهل الجمعة/السبت) — لعدّ التأخّر التعاقدي
function _overdueWorkingDays(ymd, todayYmd){
  const today=todayYmd||_today();
  if(_dayDiff(ymd, today)>=0) return 0;                 // ليست متأخّرة
  let y=ymd, n=0, g=0;
  while(_dayDiff(y, today)<0 && g++<800){ y=_addDays(y,1); if(!_isWeekend(y)) n++; }
  return n;
}

/* ════════════ الصلاحيات ════════════ */
// العرض: أي دورٍ معروف. التحرير (إنشاء/تعديل/حذف المهام): الأدمن ومدير المشروع.
// التنفيذ (تعليم مهمةٍ منجزة): يضاف إليهم المشرف والفني — فهم من ينفّذ ميدانياً.
function canView(){ return !!_role(); }
/* ★ التحرير بالدور **أو** بمفتاحٍ مانحٍ صريح (`permissions.cleaningEdit === true`).
   السبب من الميدان: مَن يدير مشروع النظافة فعلاً قد يكون دورُه المسجَّل «مشرف» (حساب
   حنان) — فالدورُ في هذا النظام حزمةٌ واحدةٌ تجرّ معها اعتمادَ طلبات الشراء وغيرَه،
   ورفعُه لأجل تعديل مهمّةِ نظافةٍ يمنح ما لم يُطلَب. المفتاحُ **مانحٌ لا حاجب**: لا
   يُقرأ إلا `=== true`، فلا يرث التحريرَ مستخدمٌ قائمٌ ولا مستخدمٌ قديمٌ بلا حقلِ
   صلاحيات. والأدوارُ الاطّلاعية مستثناةٌ صراحةً — الخادمُ يردّ كتابةَ الزائر أصلاً،
   فزرٌّ يَعِد بما يُرفَض عطلٌ لا صلاحية. */
function _hasCleanEditPerm(){
  const u=_user(), p=u&&u.permissions;
  if(!p || p.cleaningEdit!==true) return false;
  const r=_role();
  return r!=="viewer" && r!=="observer";
}
function canEdit(){ const r=_role(); return r==="admin"||r==="project_manager"||_hasCleanEditPerm(); }
/* ★ الدور المخزَّن في حسابات المستخدمين قد يكون **بالعربية**: قائمة الأدوار في إدارة
   المستخدمين تحفظ المشرف بالقيمة «مشرف» (لا supervisor) — فالمقارنة بالمفتاح الإنجليزي
   وحده كانت تحجب زرَّي التنفيذ وجولات الجودة عن المشرفين الحقيقيين (أبلغها المستخدم:
   حساب حنان). نقبل القيمتين هنا ولا نلمس الحسابات المخزّنة. */
function _isSupRole(){ const r=_role(); return r==="supervisor"||r==="مشرف"; }
function _isTechRole(){ const r=_role(); return r==="technician"||r==="فني"; }
function canExecute(){ return canEdit()||_isSupRole()||_isTechRole(); }
// جولات الجودة: الإدارة + المشرف (يُفتّش نطاقَه بنفسه) — لا الفنيّ
function canQuality(){ return canEdit()||_isSupRole(); }

/* ════════════ هل المشروع الحالي مشروع نظافة؟ ════════════
   مصدران للنوع في النظام: سجلّ المشروع (meta/projects عبر نافذة تعديل المشروع) ومستند
   الموازنة (meta/{id}_budget عبر بطاقة المشروع). نقرأ الأول بلا تكلفة، فإن لم يكن نظافةً
   نتحقّق من الثاني مرّةً واحدة لكل مشروع (مستندٌ صغير) — فلا يختلف التصنيف بين الشاشتين. */
let _typeCache = {};   // projId → "cleaning" | "other"
let _typeChecking = {};
/* ★ v18.9aj — سياقُ حسابٍ لمشروعٍ ليس المفتوح (يستعمله مركز العمليات).
   دوالُّ الحساب أدناه نقيةٌ على القائمة المُمرَّرة إلا في شيءٍ واحد: قاعدةُ الإجازة
   (`_isTodayHoliday`) تسأل «هل المشروعُ **المفتوح** مشروعُ نظافة؟» — سؤالٌ لا معنى له
   حين تكون القائمةُ لمشروعٍ آخر، أو حين لا مشروعَ مفتوحاً أصلاً (بوّابة المشاريع).
   فبدل نسخِ الحساب هناك — ونسختان تنحرفان حتماً — يُشغَّل الحسابُ نفسه داخل سياقٍ
   يُعلن أن القائمة لمشروع نظافة. المدى **متزامنٌ تماماً** (بلا await بين الطرفين)
   فلا تتداخل السياقات، ويُستعاد السابقُ في finally مهما حدث. */
let _cleanCtx = false;
function _inCleanCtx(fn){ const prev=_cleanCtx; _cleanCtx=true; try{ return fn(); } finally{ _cleanCtx=prev; } }
function isCleaningProject(){
  if(_cleanCtx) return true;
  const p=_proj(); if(!p) return false;
  if(p.type==="cleaning") return true;
  return _typeCache[p.id]==="cleaning";
}
/* نوعُ مشروعٍ من سجلّه (لا من المشروع المفتوح) — نفس مصدرَي النوع: سجلّ المشروع
   ثم مستند الموازنة. مصدرٌ واحدٌ للتصنيف يقرؤه مركز العمليات فلا يتضارب مع الوحدة. */
function isCleaningProjectRec(p){
  if(!p || !p.id) return Promise.resolve(false);
  if(p.type==="cleaning"){ _typeCache[p.id]="cleaning"; return Promise.resolve(true); }
  if(p.id in _typeCache) return Promise.resolve(_typeCache[p.id]==="cleaning");
  const database=_db();
  if(!database){ return Promise.resolve(false); }
  return database.doc("meta/"+_safeKey(p.id)+"_budget").get()
    .then(snap=>{ const d=(snap&&snap.exists)?(snap.data()||{}):{};
      _typeCache[p.id]=(d.type==="cleaning")?"cleaning":"other";
      return _typeCache[p.id]==="cleaning"; })
    .catch(()=>false);
}
// مجموعةُ مهامّ مشروعٍ بعينه — مركز العمليات يشترك عليها بلا معرفةٍ بمسارات الوحدة
function tasksColOf(projId){ return projId ? (projId+"_cleaning_tasks"+(_isDev()?"_dev":"")) : ""; }
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
function qualityCol(){ const id=_projId(); if(!id) return ""; return id+"_quality_rounds"+(_isDev()?"_dev":""); }

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
// المباني غير المسنَدة لأيِّ مشرفٍ في الخريطة، ضمن نطاق المستخدم — تعريفٌ **واحد**
// تقرؤه شاشتا «الربط» و«أداء المشرفين» فلا يختلف عدُّ «بلا مشرف» بينهما (كان ١ مقابل ١٤).
function unassignedBuildings(blds, supMap, mine){
  const list=Array.isArray(blds)?blds:_buildings();
  const map=(supMap&&typeof supMap==="object")?supMap:(_cfg.supervisorBuildings||{});
  const scope=(arguments.length>=3)?mine:myBuildings();
  const assigned=new Set();
  Object.values(map).forEach(a=>(Array.isArray(a)?a:[]).forEach(b=>assigned.add(b)));
  return list.filter(b=>(!scope||scope.indexOf(b)!==-1) && !assigned.has(b));
}

/* ════════════ الحالة ════════════ */
let _tasks   = [];      // مهام المشروع الحالي
let _loaded  = false;   // اكتمل تحميل هذا المشروع؟
let _loadedFor = "";    // معرّف المشروع المحمَّل
let _loading = false;
let _view    = "board"; // board | all | sup | quality
/* «كل المهام»: عرضٌ ببطاقات المباني (افتراضي) أو جدول، ومرشِّحُ حالةٍ جدوليّ.
   العرض البطاقي يُظهر **المجدولة القادمة** أيضاً (التي تبدأ غداً وما بعده) — فلوحةُ
   اليوم لا تعرض إلا المستحقّ اليوم، والمستخدم يحتاج أن يرى القادم ويتصرّف فيه. */
let _allMode   = "cards"; // cards | table
let _allFilter = "all";   // all | overdue | today | upcoming | off
let _editing = null;    // مسوّدة مهمة قيد التحرير (null = لا تحرير)
let _execFor = null;    // المهمة قيد التنفيذ (نافذة قائمة الفحص)
let _execState = [];    // حالة بنود قائمة الفحص أثناء التنفيذ
let _genForm = false;   // نموذج التوليد بالـ AI مفتوح؟
let _genErr  = "";
// جولات الجودة (§٣-٣): تفتيشٌ دوريٌّ يُقيّم نتيجةَ النظافة بالنجوم لكل نوع عملٍ في كل مبنى.
let _rounds       = [];    // جولات المشروع الحالي (مرتّبة الأحدث أولاً)
let _roundsLoaded = false;
let _roundsFor    = "";    // معرّف المشروع المحمَّل لجولاته
let _roundsLoading= false;
let _roundsPromise= null;
let _editingRound = null;  // مسوّدة جولةٍ قيد الإنشاء {id, buildings:[], grid:{}, ...} (null = لا إنشاء)
let _roundPhotos  = [];    // صور الجولة قيد الإنشاء [{url,uploading,error,preview}]
let _roundDetail  = null;  // جولةٌ معروضةٌ تفاصيلها (null = لا تفاصيل)

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
// ══ v18.9ac — M20: يومُ التنفيذ محلّيٌّ لا UTC ══
// `lastExecuted` طابعٌ زمنيٌّ بـtoISOString (UTC)، و`_today()` تاريخٌ محلّي — وكان
// يُقارَن أولُ عشرة أحرفٍ من الأول بالثاني. في +٣ ينفَّذ عملٌ الساعةَ ١:٠٠ صباحاً محلّياً
// فيُخزَّن بتاريخ **اليوم السابق** UTC، فتظهر المهمة «غير منفَّذة» وتُحسَب التغطيةُ خطأً
// كلَّ يومٍ بين ٠٠:٠٠ و٠٢:٥٩. العلاج في الطرفين: التنفيذ يكتب `lastExecutedDate`
// محلّياً، والقراءة تُحوّل الطابعَ القديم إلى تاريخٍ محلّي بدل اقتطاعه — فتنتفع
// السجلات القائمة بلا ترحيل.
function execDay(t){
  if(!t) return "";
  const d = String(t.lastExecutedDate||"").slice(0,10);
  if(/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  if(!t.lastExecuted) return "";
  const dt = new Date(t.lastExecuted);
  return isNaN(dt.getTime()) ? String(t.lastExecuted).slice(0,10) : _ymdL(dt);
}
function doneToday(t){ const d=execDay(t); return !!d && d===_today(); }
// مستحقّة الآن = تاريخ استحقاقها اليوم أو قبله، ولم تُنفَّذ اليوم — ولا شيءَ مستحقٌّ في الإجازة
function isDue(t){ if(isDisabled(t)||doneToday(t)||_isTodayHoliday()) return false; return _dayDiff(String(t.nextDueDate||"").slice(0,10), _today())<=0; }
function isOverdue(t){ if(isDisabled(t)||doneToday(t)||_isTodayHoliday()) return false; return _dayDiff(String(t.nextDueDate||"").slice(0,10), _today())<0; }
// التأخّر بأيام العمل (يتجاهل الجمعة/السبت) — فعطلةٌ بين الاستحقاق واليوم لا تُضخّم الرقم
function overdueDays(t){ return _overdueWorkingDays(String(t.nextDueDate||"").slice(0,10)); }

/* ── تصنيفٌ جدوليّ (لشاشة «كل المهام») ──
   isDue/isOverdue تُصفِّران في الإجازة عمداً (لا ضغطَ يوم عطلة) — وهذا صحيحٌ للوحة
   اليوم والتغطية، لكنه يُخفي **الجدول** نفسه: يوم الجمعة تصير كلُّ المهامّ «قادمة».
   لذلك لشاشة الجدول تصنيفٌ مستقلٌّ من التاريخ وحده: متأخّرة/اليوم/قادمة/موقوفة. */
function _dueIn(t){ return _dayDiff(String(t&&t.nextDueDate||"").slice(0,10), _today()); }
function schedClass(t){
  if(isDisabled(t)) return "off";
  if(doneToday(t))  return "today";          // نُفِّذت اليوم = من جدول اليوم
  const d=_dueIn(t);
  return d<0 ? "overdue" : (d===0 ? "today" : "upcoming");
}
function allPass(t, f){ return !f || f==="all" ? true : schedClass(t)===f; }
/* ترتيب داخل بطاقة المبنى: الأكثر تأخّراً ← اليوم ← الأقرب موعداً ← ما نُفِّذ اليوم
   ← الموقوفة. لا يعتمد على dueStatus لأن الأخيرة تُسوّي الكلَّ في الإجازة. */
function schedSort(t){
  if(isDisabled(t)) return 90000;
  if(doneToday(t))  return 80000;
  const d=_dueIn(t);
  return d<0 ? -10000+d : d;
}

// إحصاءات لوحة اليوم — التغطية = ما نُفِّذ اليوم ÷ ما كان مجدولاً لليوم (منفَّذ + مستحقّ).
// تقبل قائمةً صريحة (للفحوص) وإلا تعمل على مهام المشروع المحمَّلة.
function boardStats(list){
  const active=(Array.isArray(list)?list:visibleTasks()).filter(t=>!isDisabled(t));
  const done  = active.filter(doneToday);
  const due   = active.filter(isDue);
  const over  = active.filter(isOverdue);
  const scheduled = done.length + due.length;
  const coverage  = scheduled>0 ? Math.round((done.length/scheduled)*100) : 0;
  return { total:active.length, done:done.length, due:due.length, overdue:over.length, scheduled, coverage, holiday:_isTodayHoliday() };
}

// حالة المهمة بمفردات المنصة: card = صنف .ppm-card (لون شريط الحالة)، badge = صنف .ppm-due-badge
function dueStatus(t){
  if(isDisabled(t)) return { lbl:"موقوفة", color:"var(--muted)", card:"", badge:"soon", sort:9 };
  if(doneToday(t))  return { lbl:"نُفِّذت اليوم", color:"var(--sla-ok)", card:"completed", badge:"ok", sort:3 };
  // في الإجازة (الجمعة/السبت) لا ضغطَ: المهمّةُ المستحقّة/المتأخّرة تظهر بحالةٍ محايدة وتعود يوم العمل
  if(_isTodayHoliday()) return { lbl:"إجازة اليوم", color:"var(--muted)", card:"", badge:"soon", sort:5 };
  const diff=_dayDiff(String(t.nextDueDate||"").slice(0,10), _today());
  if(diff<0)  return { lbl:"متأخّرة "+_overdueWorkingDays(String(t.nextDueDate||"").slice(0,10))+" يوم", color:"var(--sla-crit)", card:"due-today", badge:"overdue", sort:0 };
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
      rec.url=url; rec.storagePath=ref.fullPath; rec.uploading=false; rec.error=false; done();
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
    const patch = { id:task.id, lastExecuted: now, lastExecutedDate: _today(), lastExecutedBy: _userName(), nextDueDate: _advanceDue(_today(), days) };   // v18.9ac — M20: اليوم المحلّي صريحاً
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
  el.innerHTML = heroHTML() + (_genForm ? genFormHTML() : "") + (_launchForm ? launchFormHTML() : "") +
                 (_view==="quality" ? qualityHTML() : _view==="sup" ? supMapHTML() : _view==="board" ? boardHTML() : allTasksHTML());
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
        ${canQuality()?`<button class="btn btn-sm ${_view==='quality'?'co-seg-on':''}" onclick="cleaningOps.setView('quality')">${_svg('award')} جولات الجودة</button>`:""}
        ${canEdit()?`<button class="btn btn-sm" onclick="cleaningOps.toggleGen()">${_svg('sparkles')} توليد بالذكاء الاصطناعي</button>`:""}
        ${canEdit()?`<button class="btn btn-sm" onclick="cleaningOps.toggleLaunch()">${_svg('calendar')} إطلاق المهام</button>`:""}
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
  const groups=`<div class="co-groups">`+_bldOrder(byB).map(b=>{
    const list=byB[b].slice().sort((x,y)=>dueStatus(x).sort-dueStatus(y).sort);
    const d=list.filter(doneToday).length;
    const all=d===list.length;
    return `
      <div class="card co-group">
        <div class="co-sec">
          <div class="co-sec-t">${_svg('building2')} ${_esc(b)}</div>
          <span class="ppm-due-badge ${all?'ok':'today'}">${d}/${list.length} منجزة</span>
        </div>
        ${_cappedTaskListHTML(b, list)}
      </div>`;
  }).join("")+`</div>`;

  return `
    <div class="co-tiles">
      ${tile('calendar',    s.scheduled, "مجدول اليوم",  "var(--primary)")}
      ${tile('checkCircle', s.done,      "نُفِّذ اليوم",   "var(--sla-ok)")}
      ${tile('hourglass',   s.due,       "متبقٍّ اليوم",  s.due>0?"var(--sla-warn)":"var(--sla-ok)")}
      ${tile('target',      s.holiday?"إجازة":s.coverage+"%", "نسبة التغطية", s.holiday?"var(--muted)":(s.coverage>=95?"var(--sla-ok)":(s.coverage>=70?"var(--sla-warn)":"var(--sla-crit)")))}
    </div>
    ${s.holiday?`<div class="ppm-overdue-banner" style="background:var(--surface2);color:var(--muted);border-color:var(--border)">
      <span class="co-bnr-ic">${_svg('calendar')}</span>
      <span>اليوم إجازة (${["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"][_pDate(_today()).getDay()]}) — الجمعة والسبت عطلةٌ في مشاريع النظافة، وتعود المهامّ يوم الأحد.</span></div>`:""}
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

/* ── عرضٌ مضغوط: بطاقتان لكل مبنى + نافذةُ «مهام أخرى» ──
   الترتيب بالأولوية (متأخّر ← مستحقّ ← منجز) يسبق القصّ، فالظاهر دوماً هو
   الأكثر إلحاحاً. زرُّ «عرض N مهام أخرى» يفتح **نافذةً منبثقة** بكل مهامّ
   المبنى (بطلب المستخدم — لا تمدُّدَ لأسفل يُطيل الصفحة). المفتاح يُمرَّر
   بالـ URI-encoding فلا يكسر onclick مهما كانت محارف اسم المبنى. */
const BOARD_CARDS_PER_BLD = 2;
/* ترتيب مباني اللوحة: الأكثر تأخّراً أولاً (فجوة التغطية تتصدّر)، ثم الأكثر
   متبقّياً اليوم، وعند التعادل أبجدياً — بدل الترتيب الأبجدي الصِرف الذي كان
   يدفن المبنى المتعثّر وسط القائمة. مصدرٌ واحد للوحة اليوم والمتابعة اليومية. */
function _bldOrder(byB){
  const ov={}, due={};
  Object.keys(byB).forEach(b=>{
    ov[b]=byB[b].filter(isOverdue).length;
    due[b]=byB[b].filter(isDue).length;
  });
  return Object.keys(byB).sort((a,b)=>
    (ov[b]-ov[a]) || (due[b]-due[a]) || String(a).localeCompare(String(b),"ar"));
}
function _cappedTaskListHTML(b, list){
  const shown=list.slice(0,BOARD_CARDS_PER_BLD);
  const rest=list.length-BOARD_CARDS_PER_BLD;
  return `<div class="co-tasklist">${shown.map(taskCardHTML).join("")}</div>`+
    (rest>0?`<button class="btn btn-ghost btn-sm co-more-btn" onclick="event.stopPropagation();cleaningOps.openBldTasks('${encodeURIComponent(b)}')">${
      "▢ عرض "+rest+" "+(rest===1?"مهمة أخرى":"مهام أخرى")}</button>`:"");
}
/* نافذة مهامّ المبنى — تُركَّب على body مباشرةً فتعمل من لوحة اليوم والمتابعة
   اليومية معاً، وبعرضَين داخليين: **القائمة** (مهامّ اليوم للمبنى بترتيب الأولوية
   من نفس مصدر اللوحة)، و**تفاصيل مهمة** تُعرض داخل النافذة نفسها (بطلب المستخدم —
   لا انتقال لصفحةٍ كاملة) بزرّ رجوعٍ للقائمة، ويُعاد فيها استخدام جسم التفاصيل
   الموحّد `_taskDetailBodyHTML` مع تحميل سجلّ التنفيذ. أزرارُ تنفيذ/تحرير تُغلق
   النافذةَ أولاً ليظهر ما فتحته — بمستمعِ capture فلا يعطّله stopPropagation. */
const BLD_MODAL_ID = "co-bld-modal";
let _bldModalBld = null;     // المبنى المعروض (null = النافذة مغلقة)
let _bldModalScope = "today";// today = مهامّ اليوم (اللوحة) | all = كل مهامّ المبنى (شاشة كل المهام)
let _bldDetailFor = null;    // مهمة معروضة تفاصيلُها داخل النافذة (null = عرض القائمة)
let _bldDetailLog = null;    // سجلّ تنفيذها (null = يُحمَّل)
// ESC يغلق النافذة — المستمع يُركَّب عند الفتح ويُفكّ عند الإغلاق (لا مستمع دائم)
function _bldEscHandler(e){ if(e && e.key==="Escape") closeBldTasks(); }
function closeBldTasks(){
  const el=document.getElementById(BLD_MODAL_ID); if(el&&el.remove) el.remove();
  _bldModalBld=null; _bldDetailFor=null; _bldDetailLog=null; _bldModalScope="today";
  try{ document.removeEventListener("keydown", _bldEscHandler); }catch(e){}
}
function _bldModalRender(){
  const ov=document.getElementById(BLD_MODAL_ID); if(!ov) return;
  const box=ov.querySelector(".co-bld-modal"); if(!box) return;
  if(_bldDetailFor){
    const t=_bldDetailFor;
    box.innerHTML=`
      <div class="co-sec">
        <button class="btn btn-ghost btn-sm co-bld-back" onclick="cleaningOps.bldBack()">→ رجوع</button>
        <div class="co-sec-t">${_esc(t.name||"مهمة")}</div>
        <button class="btn btn-ghost btn-sm co-bld-close" onclick="cleaningOps.closeBldTasks()">✕ إغلاق</button>
      </div>
      ${_taskDetailBodyHTML(t, _bldDetailLog)}`;
    return;
  }
  const b=_bldModalBld, wide=_bldModalScope==="all";
  const list=wide
    ? visibleTasks().filter(t=>((t.building||"بلا مبنى")===b) && allPass(t,_allFilter))
        .sort((x,y)=>schedSort(x)-schedSort(y))
    : visibleTasks()
    .filter(t=>!isDisabled(t) && (isDue(t)||doneToday(t)) && ((t.building||"بلا مبنى")===b))
    .sort((x,y)=>dueStatus(x).sort-dueStatus(y).sort);
  const d=list.filter(doneToday).length;
  box.innerHTML=`
    <div class="co-sec">
      <div class="co-sec-t">${_svg('building2')} ${_esc(b)}</div>
      <span class="ppm-due-badge ${wide?'soon':(d===list.length?'ok':'today')}">${wide?list.length+" مهمة":d+"/"+list.length+" منجزة"}</span>
      <button class="btn btn-ghost btn-sm co-bld-close" onclick="cleaningOps.closeBldTasks()">✕ إغلاق</button>
    </div>
    <div class="co-tasklist">${list.map(taskCardHTML).join("")}</div>`;
}
function _bldOpenDetail(id){
  const t=_tasks.find(x=>x.id===id); if(!t) return;
  _bldDetailFor=t; _bldDetailLog=null;
  _bldModalRender();
  loadTaskLog(id).then(rows=>{
    if(!_bldDetailFor || _bldDetailFor.id!==id) return;   // غادر قبل الوصول
    _bldDetailLog=rows; _bldModalRender();
  });
}
function bldBack(){ _bldDetailFor=null; _bldDetailLog=null; _bldModalRender(); }
function openBldTasks(key, scope){
  closeBldTasks();
  const b=decodeURIComponent(key);
  _bldModalBld=b; _bldModalScope=(scope==="all")?"all":"today";
  const ov=document.createElement("div");
  ov.id=BLD_MODAL_ID; ov.className="co-bld-overlay"; ov.dir="rtl";
  ov.innerHTML=`<div class="co-bld-modal card" role="dialog" aria-label="${_esc(b)}"></div>`;
  ov.addEventListener("click", e=>{ if(e.target===ov) closeBldTasks(); });   // خلفية = إغلاق
  ov.addEventListener("click", e=>{
    const btn=(e.target&&e.target.closest)?e.target.closest("button"):null;
    if(btn){
      // زرّا النافذة نفسها (إغلاق/رجوع) يتكفّل بهما onclick الخاصّ بهما
      if(btn.classList.contains("co-bld-close")||btn.classList.contains("co-bld-back")) return;
      setTimeout(closeBldTasks,0); return;   // تنفيذ/تحرير: أغلِق ودَع onclick يعمل
    }
    const card=(e.target&&e.target.closest)?e.target.closest(".ppm-card"):null;
    if(card && card.getAttribute && card.getAttribute("data-tid")){
      e.stopPropagation();                   // امنع openDetail صفحةَ التفاصيل الكاملة
      _bldOpenDetail(card.getAttribute("data-tid"));
    }
  }, true);
  document.body.appendChild(ov);
  document.addEventListener("keydown", _bldEscHandler);
  _bldModalRender();
}

/* نظيرُ _cappedTaskListHTML لشاشة «كل المهام»: سقفٌ أعلى (الشاشة جدولٌ لا لوحةَ يوم)
   وزرُّ التوسيع يفتح النافذة بنطاق **كل مهامّ المبنى** لا مهامّ اليوم وحدها. */
const ALL_CARDS_PER_BLD = 4;
function _allBldListHTML(b, list){
  const shown=list.slice(0,ALL_CARDS_PER_BLD);
  const rest=list.length-ALL_CARDS_PER_BLD;
  return `<div class="co-tasklist">${shown.map(taskCardHTML).join("")}</div>`+
    (rest>0?`<button class="btn btn-ghost btn-sm co-more-btn" onclick="event.stopPropagation();cleaningOps.openBldTasks('${encodeURIComponent(b)}','all')">${
      "▢ عرض "+rest+" "+(rest===1?"مهمة أخرى":"مهام أخرى")}</button>`:"");
}

/* تجميعُ المهامّ حسب المبنى في شبكةٍ متجاورة — يستفيد من عرض الشاشة بدل صفٍّ لكل مهمة */
function _byBuildingGrid(tasks){
  const byB={};
  tasks.forEach(t=>{ const b=t.building||"بلا مبنى"; (byB[b]=byB[b]||[]).push(t); });
  return `<div class="co-groups">`+_bldOrder(byB).map(b=>{
    const list=byB[b].slice().sort((x,y)=>dueStatus(x).sort-dueStatus(y).sort);
    const d=list.filter(doneToday).length, all=d===list.length;
    return `<div class="card co-group">
      <div class="co-sec">
        <div class="co-sec-t">${_svg('building2')} ${_esc(b)}</div>
        <span class="ppm-due-badge ${all?'ok':'today'}">${d}/${list.length}</span>
      </div>
      ${_cappedTaskListHTML(b, list)}
    </div>`;
  }).join("")+`</div>`;
}

/* بطاقة المهمة — نفس .ppm-card (شريط الحالة 4px، مربّع الأيقونة، الشارات وأسطر البيانات) */
function taskCardHTML(t){
  const st=dueStatus(t);
  const list=Array.isArray(t.checklist)?t.checklist:[];
  const done=doneToday(t);
  // الموقوفة لا تُنفَّذ: كانت اللوحة تُصفّيها فلم يظهر زرُّها قطّ، وشاشةُ «كل المهام»
  // البطاقية تعرضها — فلولا هذا الشرط لعُرض «تنفيذ» على مهمةٍ أوقفها مديرُ المشروع.
  const off=isDisabled(t);
  return `
    <div class="ppm-card ${st.card} co-clickable${off?" co-card-off":""}" data-tid="${_esc(t.id)}" onclick="cleaningOps.openDetail('${_esc(t.id)}')" title="اضغط لعرض التفاصيل وسجلّ التنفيذ">
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
            ${schedClass(t)==="upcoming"?`<span class="ppm-pill co-when">${_svg('calendar')} ${_esc(String(t.nextDueDate||"").slice(0,10))}</span>`:""}
            ${done&&t.lastExecutedBy?`<span class="ppm-pill co-by">${_svg('user')} ${_esc(t.lastExecutedBy)}</span>`:""}
          </div>
        </div>
      </div>
      ${(!done&&!off&&canExecute())||canEdit() ? `<div class="co-card-act">
        ${(done||off) ? "" : (canExecute()?`<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();cleaningOps.exec('${_esc(t.id)}')">${_svg('checkCircle')} تنفيذ</button>`:"")}
        ${canEdit()?`<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();cleaningOps.editTask('${_esc(t.id)}')">${_svg('edit')}</button>`:""}
      </div>` : ""}
    </div>`;
}
function iconOf(wt){ const w=CLEANING_WORK_TYPES[wt]; return w?w.icon:"sparkles"; }

/* ── كل المهام ──
   عرضان: **بطاقات المباني** (الافتراضي — نفس مفردات لوحة اليوم، لكن بكل المهامّ لا
   مهامّ اليوم وحدها فتظهر المجدولة التي تبدأ غداً ويمكن فتحُها وتنفيذها قبل موعدها)،
   و**جدول** (النظرة الإدارية الكاملة: المشرف/آخر تنفيذ/البنود). ومرشِّحُ حالةٍ جدوليّ
   بعدّادات (متأخّرة/اليوم/قادمة/موقوفة) يخدم العرضين معاً. */
function allTasksHTML(){
  if(!visibleTasks().length) return `<div class="card"><div class="co-empty">
    ${_svg('clipboardList')}<div class="co-empty-t">لا توجد مهام نظافة بعد</div></div></div>`;
  const all=visibleTasks();
  const n=k=>all.filter(t=>schedClass(t)===k).length;
  const cnt={ all:all.length, overdue:n("overdue"), today:n("today"), upcoming:n("upcoming"), off:n("off") };
  const rows=all.filter(t=>allPass(t,_allFilter));
  const chip=(k,lbl,c)=>`<button class="btn btn-sm co-chip ${_allFilter===k?'on':''}" onclick="cleaningOps.setAllFilter('${k}')">${lbl} <b>${c}</b></button>`;
  const head=`<div class="card">
    <div class="co-sec"><div class="co-sec-t">${_svg('clipboardList')} كل المهام</div>
      <span class="co-sec-c">${_allFilter==="all"?cnt.all+" مهمة":"<b>"+rows.length+"</b> من "+cnt.all+" مهمة"}</span></div>
    <div class="co-chips">
      ${chip('all','الكل',cnt.all)}
      ${cnt.overdue?chip('overdue','متأخّرة',cnt.overdue):""}
      ${chip('today','اليوم',cnt.today)}
      ${chip('upcoming','قادمة',cnt.upcoming)}
      ${cnt.off?chip('off','موقوفة',cnt.off):""}
      <span class="co-chips-sp"></span>
      <button class="btn btn-sm co-chip ${_allMode==='cards'?'on':''}" onclick="cleaningOps.setAllMode('cards')">${_svg('building2')} بطاقات المباني</button>
      <button class="btn btn-sm co-chip ${_allMode==='table'?'on':''}" onclick="cleaningOps.setAllMode('table')">${_svg('clipboardList')} جدول</button>
    </div>
  </div>`;
  if(!rows.length) return head+`<div class="card"><div class="co-empty">
    ${_svg('checkCircle')}<div class="co-empty-t">لا مهام في هذا التصنيف</div>
    <div class="co-empty-s">اختر تصنيفاً آخر من الأعلى.</div></div></div>`;
  return head + (_allMode==="table" ? _allTableHTML(rows) : _allGroupsHTML(rows));
}

/* بطاقات المباني — نفس شبكة لوحة اليوم (.co-groups/.co-group/.ppm-card) مع شارات
   عدٍّ لكل مبنى: كم متأخّرة وكم اليوم وكم قادمة — فيُقرأ حِمل المبنى من رأس بطاقته. */
function _allGroupsHTML(list){
  const byB={};
  list.forEach(t=>{ const b=t.building||"بلا مبنى"; (byB[b]=byB[b]||[]).push(t); });
  return `<div class="co-groups">`+_bldOrder(byB).map(b=>{
    const items=byB[b].slice().sort((x,y)=>schedSort(x)-schedSort(y));
    const c=k=>items.filter(t=>schedClass(t)===k).length;
    const ov=c("overdue"), td=c("today"), up=c("upcoming"), off=c("off");
    return `<div class="card co-group">
      <div class="co-sec">
        <div class="co-sec-t">${_svg('building2')} ${_esc(b)}</div>
        <span class="co-bld-badges">
          ${ov?`<span class="ppm-due-badge overdue">${ov} متأخّرة</span>`:""}
          ${td?`<span class="ppm-due-badge today">${td} اليوم</span>`:""}
          ${up?`<span class="ppm-due-badge soon">${up} قادمة</span>`:""}
          ${off?`<span class="ppm-due-badge soon">${off} موقوفة</span>`:""}
        </span>
      </div>
      ${_allBldListHTML(b, items)}
    </div>`;
  }).join("")+`</div>`;
}

function _allTableHTML(tasks){
  const rows=tasks.slice().sort((a,b)=>{
    const c=String(a.building||"").localeCompare(String(b.building||""),"ar");
    return c!==0 ? c : dueStatus(a).sort-dueStatus(b).sort;
  }).map(t=>{
    const st=dueStatus(t);
    const list=Array.isArray(t.checklist)?t.checklist:[];
    return `<tr class="${isDisabled(t)?'co-tr-off':''}">
      <td class="co-td-name co-clickable" onclick="cleaningOps.openDetail('${_esc(t.id)}')" title="اضغط لعرض التفاصيل وسجلّ التنفيذ"><span class="co-td-ic">${_svg(iconOf(t.workType))}</span> ${_esc(t.name||"")}</td>
      <td>${_esc(t.building||"—")}${t.floor?" / "+_esc(t.floor):""}</td>
      <td>${_esc(t.workType||"—")}</td>
      <td>${_esc(taskSupervisor(t)||"—")}</td>
      <td>${_esc(t.freq||"—")}</td>
      <td class="co-num">${list.length}</td>
      <td class="co-num">${t.nextDueDate?_esc(String(t.nextDueDate).slice(0,10)):"—"}</td>
      <td class="co-num">${execDay(t)?_esc(execDay(t)):"—"}</td>
      <td><span class="ppm-due-badge ${st.badge}">${st.lbl}</span></td>
      <td>${canEdit()?`<button class="btn btn-ghost btn-sm" onclick="cleaningOps.editTask('${_esc(t.id)}')">${_svg('edit')}</button>`:""}</td>
    </tr>`;
  }).join("");
  return `<div class="card">
    <div class="co-table-wrap"><table class="co-table">
      <thead><tr><th>المهمة</th><th>المنطقة</th><th>نوع العمل</th><th>المشرف</th><th>التكرار</th><th>بنود</th><th>الاستحقاق</th><th>آخر تنفيذ</th><th>الحالة</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
  </div>`;
}

/* ── تفاصيل المهمة: بياناتها وقائمة فحصها وسجلّ تنفيذها بالصور ──
   الضغط على أيّ بطاقة يفتحها — وهي السبيل الوحيد لمراجعة مهمةٍ أُغلقت (نُفِّذت)،
   فأزرارُ التنفيذ تختفي عنها بعد الإنجاز. */
/* جسمُ التفاصيل (بيانات + قائمة فحص + سجلّ تنفيذ) — مصدرٌ واحد تستعمله صفحةُ
   التفاصيل الكاملة **ونافذةُ مهامّ المبنى** (عرضُ التفاصيل داخل النافذة نفسها).
   log: null = ما زال يُحمَّل، [] = لا تنفيذات، وإلا صفوف السجلّ. */
function _taskDetailBodyHTML(t, log){
  const list=Array.isArray(t.checklist)?t.checklist:[];
  const st=dueStatus(t);
  const sup=taskSupervisor(t);
  const info=(k,v)=> v?`<div class="co-fin-i"><span class="k">${k}</span><span class="v" style="font-family:'Cairo',sans-serif;font-size:12.5px">${_esc(v)}</span></div>`:"";
  const logHTML = log===null
    ? `<div class="co-empty" style="padding:22px"><div class="co-empty-t">جارٍ تحميل سجلّ التنفيذ…</div></div>`
    : (!log.length
        ? `<div class="co-empty" style="padding:22px">${_svg('clipboardList')}
             <div class="co-empty-t">لم تُنفَّذ بعد</div>
             <div class="co-empty-s">سيظهر هنا كلُّ تنفيذٍ بتاريخه ومنفِّذه وصوره.</div></div>`
        : log.map(r=>`
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

  return `
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
        ${info("آخر تنفيذ", execDay(t)?execDay(t)+(t.lastExecutedBy?" — "+t.lastExecutedBy:""):"لم تُنفَّذ بعد")}
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
        <span class="co-sec-c">${log===null?"…":log.length+" تنفيذ"}</span></div>
      ${logHTML}
    </div>`;
}
function renderDetail(el){
  const t=_detailFor;
  el.innerHTML = subHeroHTML(_esc(t.name||"مهمة"),
      _esc(t.building||"")+(t.floor?" / "+_esc(t.floor):"")+" • "+_esc(t.workType||"")+" • "+_esc(t.freq||""),
      "closeDetail") + _taskDetailBodyHTML(t, _detailLog);
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
  // مبنًى غير مسنَدٍ لأحد = فجوةُ مسؤولية (نفس تعريف «أداء المشرفين»؛ الأدمن يرى الكل ⟵ mine=null)
  const orphans=unassignedBuildings(blds, m, null);
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

/* ══ مهاجرة اسم مبنى معاد تسميته ══
   النواة تخزّن أسماء المباني قائمةً في الإعدادات، وبيانات النظافة تخزّن الاسم **نصاً**
   في أربعة مواضع: المهام (t.building) وسجلّ التنفيذ (r.building — تغطية الشهر وتقرير
   العميل يجمعان به) وربط المشرفين (supervisorBuildings) وتقييمات جولات الجودة
   (ratings[].building). فتغييرُ الاسم في لوحة الإدارة كان يترك المهامَّ على الاسم القديم
   (أبلغها المستخدم). النواة تستدعينا بعد حفظ التعديل (adminSaveBuilding) فنُهاجر
   المواضع الأربعة دفعةً واحدة — لا شيء يحدث في غير مشاريع النظافة. */
async function onBuildingRenamed(oldName, newName){
  try{
    oldName=String(oldName||"").trim(); newName=String(newName||"").trim();
    if(!oldName || !newName || oldName===newName) return;
    if(!isCleaningProject()) return;
    const database=_db(); if(!database) return;
    let nTasks=0, nLogs=0, nRounds=0, supChanged=false;
    // ١) المهام
    const tCol=tasksCol();
    if(tCol){
      const snap=await database.collection(tCol).where("building","==",oldName).get();
      for(const d of snap.docs){ await d.ref.set({building:newName},{merge:true}); nTasks++; }
      _tasks.forEach(t=>{ if(t && t.building===oldName) t.building=newName; });
    }
    // ٢) سجلّ التنفيذ — كي لا تنقسم تغطية الشهر وتقرير العميل على اسمين
    const lCol=logCol();
    if(lCol){
      const snap=await database.collection(lCol).where("building","==",oldName).get();
      for(const d of snap.docs){ await d.ref.set({building:newName},{merge:true}); nLogs++; }
    }
    // ٣) ربط المشرفين بالمباني
    await loadCfg(true);
    const map=_cfg.supervisorBuildings||{};
    Object.keys(map).forEach(s=>{
      const arr=Array.isArray(map[s])?map[s]:[];
      const i=arr.indexOf(oldName);
      if(i!==-1){ arr[i]=newName; supChanged=true; }
    });
    if(supChanged) await saveCfg(map);
    // ٤) جولات الجودة — ratings مصفوفةُ كائنات فلا استعلامَ عليها؛ نقرأ الجولات
    //    (عددها صغير بطبيعته) ونعدّل ما يحمل الاسمَ القديم وحده
    const qCol=qualityCol();
    if(qCol){
      const snap=await database.collection(qCol).get();
      for(const d of snap.docs){
        const r=d.data()||{};
        const rs=Array.isArray(r.ratings)?r.ratings:[];
        if(!rs.some(x=>x && x.building===oldName)) continue;
        const fixed=rs.map(x=>(x && x.building===oldName)?Object.assign({},x,{building:newName}):x);
        await d.ref.set({ratings:fixed},{merge:true}); nRounds++;
      }
      _rounds.forEach(r=>{
        if(r && Array.isArray(r.ratings)) r.ratings.forEach(x=>{ if(x && x.building===oldName) x.building=newName; });
      });
    }
    _audit("إعادة تسمية مبنى في بيانات النظافة",
      oldName+" → "+newName+" — "+nTasks+" مهمة، "+nLogs+" سجلّ، "+nRounds+" جولة"+(supChanged?"، وربط المشرفين":""));
    if(nTasks||nLogs||nRounds||supChanged)
      _toast("✅ حُدّثت بيانات النظافة للاسم الجديد ("+nTasks+" مهمة)","success");
    render();
  }catch(e){
    console.warn("cleaningOps/onBuildingRenamed",e);
    _toast("⚠ تعذّرت مهاجرة بعض بيانات النظافة للاسم الجديد — أعد المحاولة من لوحة الإدارة","warn");
  }
}

/* ── v18.9wi: إعادةُ تسميةِ مشرفٍ تُهاجرُ بياناتِ النظافة كذلك ──
   اسمُ المشرف مخزَّنٌ نصاً في أربعة مواضع: تجاوزُ المهمة (t.supervisor)، سطرُ التنفيذ
   (r.supervisor — أداءُ المشرفين يجمع به)، **مفتاحُ** خريطة الربط (supervisorBuildings —
   نطاقُ المشرف myBuildings يطابق اسمَ حسابه بهذا المفتاح حرفياً، فبقاؤه القديم يعمي
   المشرفَ عن مبانيه)، ومُنشئُ جولة الجودة (r.by). فتعديلُ الاسم في لوحة الإدارة كان
   يترك المهامَّ على القديم (أبلغها المستخدم: سارة ← ساره). النواة تستدعينا بعد
   adminSaveSupervisor — لا شيء يحدث في غير مشاريع النظافة. */
async function onSupervisorRenamed(oldName, newName){
  try{
    oldName=String(oldName||"").trim(); newName=String(newName||"").trim();
    if(!oldName || !newName || oldName===newName) return;
    if(!isCleaningProject()) return;
    const database=_db(); if(!database) return;
    let nTasks=0, nLogs=0, nRounds=0, mapChanged=false;
    // ١) المهام — التجاوز الصريح
    const tCol=tasksCol();
    if(tCol){
      const snap=await database.collection(tCol).where("supervisor","==",oldName).get();
      for(const d of snap.docs){ await d.ref.set({supervisor:newName},{merge:true}); nTasks++; }
      _tasks.forEach(t=>{ if(t && t.supervisor===oldName) t.supervisor=newName; });
    }
    // ٢) سجلّ التنفيذ — كي لا ينقسم أداء المشرف على اسمين
    const lCol=logCol();
    if(lCol){
      const snap=await database.collection(lCol).where("supervisor","==",oldName).get();
      for(const d of snap.docs){ await d.ref.set({supervisor:newName},{merge:true}); nLogs++; }
    }
    // ٣) مفتاح خريطة الربط — يُدمَج إن وُجد الاسمان معاً (بلا تكرار مبانٍ)
    await loadCfg(true);
    const map=_cfg.supervisorBuildings||{};
    if(Array.isArray(map[oldName])){
      const merged=[]; (Array.isArray(map[newName])?map[newName]:[]).concat(map[oldName])
        .forEach(b=>{ if(merged.indexOf(b)===-1) merged.push(b); });
      map[newName]=merged; delete map[oldName]; mapChanged=true;
      await saveCfg(map);
    }
    // ٤) جولات الجودة — مُنشئ الجولة (حقلٌ بسيطٌ فالاستعلام يكفي)
    const qCol=qualityCol();
    if(qCol){
      const snap=await database.collection(qCol).where("by","==",oldName).get();
      for(const d of snap.docs){ await d.ref.set({by:newName},{merge:true}); nRounds++; }
      _rounds.forEach(r=>{ if(r && r.by===oldName) r.by=newName; });
    }
    _audit("إعادة تسمية مشرف في بيانات النظافة",
      oldName+" → "+newName+" — "+nTasks+" مهمة، "+nLogs+" سجلّ، "+nRounds+" جولة"+(mapChanged?"، ومفتاح الربط":""));
    if(nTasks||nLogs||nRounds||mapChanged)
      _toast("✅ حُدّثت بيانات النظافة لاسم المشرف الجديد ("+nTasks+" مهمة)","success");
    render();
  }catch(e){
    console.warn("cleaningOps/onSupervisorRenamed",e);
    _toast("⚠ تعذّرت مهاجرة بعض بيانات النظافة للاسم الجديد — أعد المحاولة من لوحة الإدارة","warn");
  }
}

/* ── إطلاق المهام في وقت محدد ──
   مرحلة تجهيز المباني: المهام تُنشأ اليوم لكن التشغيل الفعلي يبدأ لاحقاً، فيتراكم
   «تأخير» وهمي بلا داعٍ. الإطلاق يعيد جدولة استحقاق كل مهامّ المبنى (أو كل المباني)
   إلى تاريخ البدء الفعلي — فلا استحقاق ولا تأخير قبله، ويُصفَّر أي تأخيرٍ متراكم. */
let _launchForm=false;
function toggleLaunch(){ _launchForm=!_launchForm; if(_launchForm) _genForm=false; render(); }
// المهامّ المستهدفة بالإطلاق — نقية للفحوص: النشطة، وللمبنى المحدد ("" = كل المباني)
function _launchTargets(tasks, bld){
  return (Array.isArray(tasks)?tasks:[]).filter(t=>!isDisabled(t) && (!bld || (t.building||"بلا مبنى")===bld));
}
function launchFormHTML(){
  const byBld={};
  _tasks.filter(t=>!isDisabled(t)).forEach(t=>{ const b=t.building||"بلا مبنى"; byBld[b]=(byBld[b]||0)+1; });
  const blds=Object.keys(byBld).sort((a,b)=>String(a).localeCompare(String(b),"ar"));
  const total=_tasks.filter(t=>!isDisabled(t)).length;
  return `
    <div class="card co-pane co-gen">
      <div class="co-sec"><div class="co-sec-t">${_svg('calendar')} إطلاق المهام في وقت محدد</div></div>
      <div class="co-grid2">
        <div class="form-group"><label class="form-label">المبنى</label>
          <select class="form-select" id="co-launch-bld">
            <option value="">— كل المباني (${total} مهمة) —</option>
            ${blds.map(b=>`<option value="${_esc(b)}">${_esc(b)} (${byBld[b]} مهمة)</option>`).join("")}
          </select></div>
        <div class="form-group"><label class="form-label">تاريخ بدء التنفيذ</label>
          <input class="form-input" type="date" id="co-launch-date" min="${_today()}" value="${_today()}"></div>
      </div>
      <div class="co-actions">
        <button class="btn btn-primary btn-sm" id="co-launch-btn" onclick="cleaningOps.doLaunch()">${_svg('checkCircle')} إطلاق</button>
        <button class="btn btn-ghost btn-sm" onclick="cleaningOps.toggleLaunch()">إلغاء</button>
      </div>
      <div class="co-hint">تُعاد جدولة استحقاق كل مهامّ المبنى المختار إلى هذا التاريخ — فلا تُستحق (ولا يُحسب تأخير)
      قبله، ويُصفَّر أي تأخيرٍ متراكمٍ أثناء التجهيز. الجمعة/السبت تُرحَّل تلقائياً لأول يوم عمل.</div>
    </div>`;
}
async function doLaunch(){
  if(!canEdit()){ _toast("⚠ لا تملك صلاحية إطلاق المهام","warn"); return; }
  const bld=(document.getElementById("co-launch-bld")||{}).value||"";
  const raw=((document.getElementById("co-launch-date")||{}).value||"").trim();
  if(!raw){ _toast("⚠ اختر تاريخ بدء التنفيذ أولاً","warn"); return; }
  if(raw<_today()){ _toast("⚠ التاريخ في الماضي — اختر اليوم أو تاريخاً قادماً","warn"); return; }
  const date=_nextWorkingDay(raw);   // الجمعة/السبت ⟵ الأحد
  const targets=_launchTargets(_tasks, bld);
  if(!targets.length){ _toast("⚠ لا مهامّ نشطة في النطاق المختار","warn"); return; }
  const btn=document.getElementById("co-launch-btn");
  if(btn){ btn.disabled=true; btn.textContent="⏳ جارٍ الإطلاق…"; }
  try{
    let ok=0;
    for(const t of targets){ if(await saveTask({id:t.id, nextDueDate:date})) ok++; }
    _audit("إطلاق مهام النظافة", (bld||"كل المباني")+" — "+ok+" مهمة تبدأ "+date);
    _toast("✅ أُطلقت "+ok+" مهمة — تبدأ الاستحقاق من "+date,"success");
    _launchForm=false; render();
  } finally {
    const b=document.getElementById("co-launch-btn"); if(b){ b.disabled=false; b.textContent="إطلاق"; }
  }
}

/* ── نموذج التوليد بالذكاء الاصطناعي ── */
function genFormHTML(){
  const blds=_buildings();
  // المباني القائمة ذات المهام النشطة — مرشّحات «المبنى المرجعي» (الأكثر مهامّاً أولاً)
  const byBld={};
  _tasks.filter(t=>!isDisabled(t)&&t.building).forEach(t=>{ byBld[t.building]=(byBld[t.building]||0)+1; });
  const refBlds=Object.keys(byBld).sort((a,b)=>byBld[b]-byBld[a]);
  return `
    <div class="card co-pane co-gen">
      <div class="co-sec"><div class="co-sec-t">${_svg('sparkles')} توليد جدول مهام النظافة</div></div>
      <div class="form-group"><label class="form-label">وضع التوليد</label>
        <select class="form-select" id="co-gen-mode" onchange="cleaningOps.genModeChanged()">
          <option value="full">جدول كامل (8–12 مهمة)</option>
          <option value="specific">إضافة مهام محددة لمبنى قائم</option>
        </select></div>
      <div class="form-group" id="co-gen-spec-wrap" style="display:none"><label class="form-label">المهام المطلوب إضافتها</label>
        <textarea class="form-input" id="co-gen-spec" rows="2" placeholder="مثال: تنظيف خزانات المياه شهرياً، وتلميع درابزين السلالم أسبوعياً"></textarea></div>
      <div class="form-group" id="co-gen-ref-wrap" ${refBlds.length?"":'style="display:none"'}><label class="form-label">مبنى مرجعي (يُنسَج الجدول الجديد على منواله)</label>
        <select class="form-select" id="co-gen-ref">
          ${refBlds.length?`<option value="__auto__">— تلقائي: المبنى الأكثر مهامّاً —</option>`:""}
          <option value="">— بلا مرجع (توليد عام) —</option>
          ${refBlds.map(b=>`<option value="${_esc(b)}">${_esc(b)} (${byBld[b]} مهمة)</option>`).join("")}
        </select></div>
      <div class="co-grid2">
        <div class="form-group"><label class="form-label">المبنى المستهدف</label>
          <select class="form-select" id="co-gen-bld">
            <option value="">— كل المباني —</option>
            ${blds.map(b=>`<option value="${_esc(b)}">${_esc(b)}</option>`).join("")}
          </select></div>
        <div class="form-group"><label class="form-label">نوع المبنى/النشاط</label>
          <input class="form-input" id="co-gen-kind" placeholder="مثال: مبنى إداري ٤ أدوار، دورتا مياه لكل دور"></div>
      </div>
      <div class="co-grid2">
        <div class="form-group"><label class="form-label">ملاحظات إضافية (اختياري)</label>
          <input class="form-input" id="co-gen-notes" placeholder="مثال: لوبي بمساحة كبيرة، واجهة زجاجية، موقف سيارات"></div>
        <div class="form-group"><label class="form-label">تاريخ بدء التنفيذ (اختياري)</label>
          <input class="form-input" type="date" id="co-gen-start" min="${_today()}">
          <div class="co-hint" style="margin-top:4px">اتركه فارغاً للبدء فوراً — وبتحديده لا تُستحق المهام (ولا يُحسب تأخير) قبل هذا التاريخ.</div></div>
      </div>
      <div class="co-actions">
        <button class="btn btn-primary btn-sm" id="co-gen-btn" onclick="cleaningOps.doGen()">${_svg('sparkles')} توليد</button>
        <button class="btn btn-ghost btn-sm" onclick="cleaningOps.toggleGen()">إلغاء</button>
      </div>
      ${_genErr?`<div class="ppm-overdue-banner" style="margin-top:12px"><span class="co-bnr-ic">${_svg('alertTriangle')}</span> <span>${_esc(_genErr)}</span></div>`:""}
      <div class="co-hint">المُولَّد <b>اقتراحٌ أوّليٌّ قابلٌ للتحرير والحذف</b> — يُضاف للمهام الحالية ولا يستبدلها.</div>
    </div>`;
}
// إظهار/إخفاء الحقول حسب الوضع — بلا إعادة render كي لا تضيع القيم المكتوبة.
// الوصف للوضع المحدد وحده، والمبنى المرجعي للوضع الكامل وحده (وبوجود مبانٍ ذات مهام).
function genModeChanged(){
  const m=(document.getElementById("co-gen-mode")||{}).value||"full";
  const w=document.getElementById("co-gen-spec-wrap");
  if(w) w.style.display=(m==="specific")?"":"none";
  const r=document.getElementById("co-gen-ref-wrap");
  if(r){
    const hasRefs=!!(r.querySelector&&r.querySelector('option[value="__auto__"]'));
    r.style.display=(m==="specific"||!hasRefs)?"none":"";
  }
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

/* بناء موجّه التوليد — دالة نقية مكشوفة للفحوص. وضعان:
   "full" (الافتراضي) = جدول كامل. بلا مرجعٍ يولَّد عامّاً (٨–١٢ مهمة — السلوك
   القديم حرفياً)؛ ومع `ref` (مبنى قائم عدّله المستخدم: {name, tasks}) يُمرَّر
   جدولُه الفعلي للنموذج ليُنسَج الجدول الجديد على منواله — فمبنى جديد يرث نمط
   المباني التي ضبطها المستخدم من قبل لا اقتراحاً عاماً.
   "specific" = إضافة مهام محددة وصفها المستخدم وحدها لمبنى قائم، مع تمرير
   أسماء المهام الموجودة في المبنى كي لا يقترح النموذج مكرراً (المرجع يُتجاهَل). */
function _genPrompt(o){
  o=o||{};
  const specific=o.mode==="specific";
  const bld=String(o.bld||""), kind=String(o.kind||""), notes=String(o.notes||"");
  const existing=Array.isArray(o.existing)?o.existing.filter(Boolean):[];
  const ref=(!specific && o.ref && o.ref.name && Array.isArray(o.ref.tasks) && o.ref.tasks.length) ? o.ref : null;
  const refLines=ref ? ref.tasks.slice(0,30).map(t=>{
    const ck=(Array.isArray(t.checklist)?t.checklist:[]).slice(0,6).map(s=>String(s).trim()).filter(Boolean);
    return "- "+String(t.name||"").trim()+" | "+String(t.workType||"أخرى")+" | "+String(t.freq||"يومي")+
           (ck.length?" | بنود الفحص: "+ck.join("؛ "):"");
  }).join("\n") : "";
  return (
    "أنت مدير عمليات نظافة مبانٍ محترف. "+
    (specific ? "أضِف مهام نظافة محددة لمبنى قائم — لا تُنشئ جدولاً كاملاً.\n"
              : "أنشئ جدول مهام نظافة دورية لمبنى.\n")+
    "المبنى: "+(bld||"غير محدّد")+"\n"+
    "وصف المبنى/النشاط: "+(kind||"مبنى إداري عام")+"\n"+
    (notes?"ملاحظات: "+notes+"\n":"")+
    "أنواع العمل المسموحة (استخدم أحدها حرفياً في workType): "+WT_KEYS.join(" | ")+"\n"+
    "التكرارات المسموحة (استخدم أحدها حرفياً في freq): "+FREQ_KEYS.join(" | ")+"\n"+
    (specific
      ? "المهام المطلوب إضافتها (كما وصفها المستخدم):\n"+String(o.spec||"").trim()+"\n"+
        (existing.length
          ? "المهام الموجودة مسبقاً في هذا المبنى — لا تكرّرها ولا تقترح ما يشابهها:\n- "+existing.join("\n- ")+"\n"
          : "")+
        "أعطِ المهام الموصوفة أعلاه فقط (مهمة لكل وصف، وعدّة مهامّ إن وُصفت عدّة)، "+
        "بأسماء عربية مختصرة، ولكل مهمة بين 3 و 5 بنود فحصٍ عملية ومحدّدة وموجزة، "+
        "واختر لكل مهمة التكرار الأنسب من وصفها.\n"
      : ref
      ? "هذا جدول مهامّ مبنى «"+String(ref.name)+"» القائم كما ضبطه المستخدم — اجعله مرجعك الأول: "+
        "حاكِ نمطه في اختيار المهام والتسمية والتكرارات وبنود الفحص وعدد المهام، "+
        "وكيّف ما يلزم فقط ليناسب وصف المبنى الجديد (أدواره ومرافقه):\n"+refLines+"\n"+
        "أعطِ جدولاً كاملاً على منوال المرجع، بأسماء عربية مختصرة، ولكل مهمة "+
        "بين 3 و 5 بنود فحصٍ عملية ومحدّدة وموجزة.\n"
      : "أعطِ بين 8 و 12 مهمة تغطّي المناطق الرئيسية، بأسماء عربية مختصرة، ولكل مهمة "+
        "بين 3 و 5 بنود فحصٍ عملية ومحدّدة وموجزة.\n"+
        "اجعل مهام دورات المياه والأرضيات والنفايات «يومي»، والزجاج والأثاث «أسبوعي»، "+
        "والنظافة العميقة «شهري» أو «ربع سنوي».\n")+
    "أعِد JSON فقط بلا أي شرح، بهذا الشكل تماماً:\n"+
    '{"tasks":[{"name":"اسم المهمة","workType":"نظافة دورات المياه","freq":"يومي","floor":"","checklist":["بند","بند"]}]}');
}

async function doGen(){
  if(typeof _aiText!=="function"){ _toast("⚠ الذكاء الاصطناعي غير مُفعّل — فعّله من: الإدارة › إعدادات الذكاء الاصطناعي","warn"); return; }
  const bld  =(document.getElementById("co-gen-bld")||{}).value||"";
  const kind =((document.getElementById("co-gen-kind")||{}).value||"").trim();
  const notes=((document.getElementById("co-gen-notes")||{}).value||"").trim();
  const mode =(document.getElementById("co-gen-mode")||{}).value||"full";
  const spec =((document.getElementById("co-gen-spec")||{}).value||"").trim();
  // تاريخ بدء التنفيذ (اختياري): المهام لا تُستحق قبله فلا يُحسب تأخيرٌ بلا داعٍ
  // أثناء تجهيز المباني. الماضي يُقصّ لليوم، والعطلة تُرحَّل لأول يوم عمل.
  const startRaw=((document.getElementById("co-gen-start")||{}).value||"").trim();
  const start=_nextWorkingDay(startRaw && startRaw>_today() ? startRaw : _today());
  if(mode==="specific" && !spec){ _toast("⚠ اكتب وصف المهام المطلوب إضافتها أولاً","warn"); return; }
  const btn=document.getElementById("co-gen-btn");
  if(btn){ btn.disabled=true; btn.textContent="⏳ جارٍ التوليد…"; }
  _genErr="";
  try{
    // في الوضع المحدد نمرّر مهامّ المبنى القائمة (من كل المشروع لا نطاق المستخدم)
    // كي لا يقترح النموذج ما هو موجود — والبنية مقيّدة بالمبنى المختار إن اختير.
    const existing = mode==="specific"
      ? _tasks.filter(t=>!isDisabled(t) && (!bld || t.building===bld)).map(t=>t.name).filter(Boolean).slice(0,60)
      : [];
    // المبنى المرجعي (الوضع الكامل): يُنسَج الجدول الجديد على منوال مبنى قائم ضبطه
    // المستخدم — "__auto__" = الأكثر مهامّاً (عدا المبنى المستهدف)، "" = بلا مرجع.
    let ref=null;
    if(mode!=="specific"){
      const refSel=(document.getElementById("co-gen-ref")||{value:"__auto__"}).value;
      if(refSel!==""){
        const byBld={};
        _tasks.filter(t=>!isDisabled(t) && t.building && t.building!==bld)
              .forEach(t=>{ (byBld[t.building]=byBld[t.building]||[]).push(t); });
        const name=(refSel!=="__auto__") ? refSel
          : (Object.keys(byBld).sort((a,b)=>byBld[b].length-byBld[a].length)[0]||"");
        if(name && byBld[name] && byBld[name].length) ref={name, tasks:byBld[name]};
      }
    }
    const prompt=_genPrompt({mode, bld, kind, notes, spec, existing, ref});
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
        tasks=raw.slice(0, mode==="specific"?10:30).map(x=>({
          id:_uid(),
          name:String(x.name||"مهمة نظافة").trim().slice(0,90),
          building: bld,
          floor: String(x.floor||"").trim().slice(0,60),
          workType: WT_KEYS.indexOf(x.workType)!==-1 ? x.workType : "أخرى",
          freq: FREQ_KEYS.indexOf(x.freq)!==-1 ? x.freq : "يومي",
          assignee:"", desc:"",
          checklist: Array.isArray(x.checklist) ? x.checklist.slice(0,15).map(s=>String(s).trim().slice(0,120)).filter(Boolean) : [],
          nextDueDate: start, lastExecuted:"", lastExecutedBy:"",
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
    _audit("توليد جدول نظافة بالذكاء الاصطناعي", (bld||"كل المباني")+" — "+ok+" مهمة"+(mode==="specific"?" (مهام محددة)":(ref?" (على منوال "+ref.name+")":""))+(start>_today()?" — يبدأ "+start:""));
    _toast("✅ أُضيفت "+ok+" مهمة — راجعها وعدّلها كما تحب","success");
    _genForm=false; render();
  } finally {
    const b=document.getElementById("co-gen-btn"); if(b){ b.disabled=false; b.textContent="توليد"; }
  }
}

/* ════════════ معالِجات الواجهة ════════════ */
function setView(v){ _view=v; _genForm=false; _launchForm=false; _detailFor=null; _detailLog=null; closeBldTasks();
  if(v!=="quality"){ _editingRound=null; _roundDetail=null; _roundPhotos=[]; }   // غادرَ الجودة ⟵ لا تبقَ مسوّدةٌ معلّقة
  render(); }
// عرضُ «كل المهام» ومرشِّحُه — تبديلٌ محليّ لا يمسّ الشاشات الأخرى، ويغلق نافذة المبنى
// فلا تبقى معروضةً بنطاقٍ أو مرشِّحٍ لم يعد قائماً
function setAllMode(m){ _allMode=(m==="table")?"table":"cards"; closeBldTasks(); render(); }
function setAllFilter(f){ _allFilter=["overdue","today","upcoming","off"].indexOf(f)>=0?f:"all"; closeBldTasks(); render(); }
function toggleGen(){ _genForm=!_genForm; _genErr=""; if(_genForm) _launchForm=false; render(); }
async function refresh(){ await loadTasks(true); render(); _toast("✅ حُدِّث الجدول","success"); }

function addTask(){
  _editing = { id:_uid(), name:"", building:"", floor:"", workType:WT_KEYS[0], freq:"يومي",
    assignee:"", supervisor:"", desc:"", checklist:[], nextDueDate:_nextWorkingDay(_today()), lastExecuted:"", lastExecutedBy:"",
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
  _editing.nextDueDate = _nextWorkingDay(g("co-due") || _today());   // تاريخٌ يقع في العطلة يُرحَّل لأوّل يوم عمل
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
  if(s.holiday){       vKey="ok";   vTxt="إجازة اليوم"; vSub="الجمعة والسبت إجازة — تعود المهامّ يوم الأحد"; }
  else if(s.scheduled===0){ vKey="ok";   vTxt="لا مهامّ اليوم"; vSub="لا مهامّ مجدولةً لهذا اليوم"; }
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
      <div class="co-2col">${cov.map(b=>{
        const c=b.pct>=100?"var(--sla-ok)":(b.pct>=60?"var(--sla-warn)":"var(--sla-crit)");
        return `<div class="co-cov">
          <div class="co-cov-h"><span class="n">${_esc(b.name)}</span>
            <span class="p" style="color:${c}">${b.pct}% <small>(${b.done}/${b.sched})</small></span></div>
          <div class="hbar"><span style="flex:${Math.max(b.pct,0.01)};background:${c}"></span><span style="flex:${Math.max(100-b.pct,0.01)};background:var(--surface2)"></span></div>
        </div>`;
      }).join("")}</div>
    </div>` : "";

  // المهام المتأخّرة — أقدم أولاً
  const late=visibleTasks().filter(t=>isOverdue(t)).sort((a,b)=>overdueDays(b)-overdueDays(a)).slice(0,8);
  const lateBlock = `
    <div class="card">
      <div class="co-sec"><div class="co-sec-t">${_svg('alertTriangle')} المهامّ المتأخّرة</div>
        <span class="co-sec-c">${late.length?late.length+" مهمة":"لا متأخّرات"}</span></div>
      ${late.length ? `<div class="co-2col">`+late.map(t=>`
        <div class="ppm-card due-today">
          <div class="co-card-row">
            <div class="ppm-chip">${_svg(iconOf(t.workType))}</div>
            <div class="co-card-main">
              <div class="co-card-t">${_esc(t.name||"")}</div>
              <div class="ppm-meta-row"><span class="mi">${_svg('pin')}</span> ${_esc(t.building||"—")}${t.floor?" / "+_esc(t.floor):""}</div>
            </div>
            <div class="co-card-act"><span class="ppm-due-badge overdue">متأخّرة ${overdueDays(t)} يوم</span></div>
          </div>
        </div>`).join("")+`</div>`
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
        <div class="big" style="color:${vC}">${s.holiday?"إجازة":s.coverage+"%"}</div>
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

/* ════════════ مؤشرات الأداء لعقود النظافة ════════════
   مؤشّراتُ الصيانة السبعة (طلبات تصحيحية · زمن الإغلاق · الالتزام بـSLA · جودة الالتزام
   الفني · الصيانة الوقائية · البلاغات المتأخّرة) تقيس ما لا وجود له في عقد نظافة،
   فتعرض 0% أو 100% بلا معنى. البديل يقيس **الالتزام بالجدول وجودة التوثيق**.
   كلُّها مشتقّةٌ من بياناتٍ حقيقية: المهامّ وسجلّ التنفيذ الشهري. */
const KPI_ID="co-kpi";
let _monthLog=null, _monthLogFor="";
async function loadMonthLog(force){
  const database=_db(), col=logCol();
  const key=_projId()+"|"+_ymL(new Date());
  if(!database || !col){ _monthLog=[]; return _monthLog; }
  if(_monthLogFor===key && !force && _monthLog) return _monthLog;
  try{
    const from=_ymL(new Date())+"-01";
    const snap=await database.collection(col).where("date",">=",from).limit(1000).get();
    _monthLog=snap.docs.map(d=>d.data()||{});
    _monthLogFor=key;
  }catch(e){ console.warn("cleaningOps/loadMonthLog",e); _monthLog=[]; }
  return _monthLog;
}
function _ymL(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
/* سجلُّ الشهر في نطاق المستخدم — المهامّ مُنطَّقةٌ بـ visibleTasks لكن السجلَّ كان عامّاً،
   فيرى المشرفُ تغطيةَ مبانيه ومعها توثيقَ المشروع كلِّه: رقمان من نطاقين في لوحةٍ واحدة. */
function visibleLog(){
  const mine=myBuildings(), log=_monthLog||[];
  return mine ? log.filter(r=>mine.indexOf(r&&r.building)!==-1) : log;
}

function cleaningKPIs(){
  const s=boardStats();
  const active=visibleTasks().filter(t=>!isDisabled(t));
  const log=visibleLog();
  const cov=coverageByBuilding();
  // ١) تغطية اليوم  ٢) المناطق المكتملة  ٣) نسبة التأخّر  ٤) توثيق بالصور
  // ٥) اكتمال بنود الفحص  ٦) عدد التنفيذات هذا الشهر
  const zonesDone=cov.filter(b=>b.pct>=100).length;
  const overduePct = active.length ? Math.round(s.overdue/active.length*100) : 0;
  const withPhotos = log.filter(r=>Array.isArray(r.photos)&&r.photos.length).length;
  const photoPct   = log.length ? Math.round(withPhotos/log.length*100) : 0;
  let di=0, ti=0; log.forEach(r=>{ di+=Number(r.doneItems)||0; ti+=Number(r.totalItems)||0; });
  const itemsPct = ti>0 ? Math.round(di/ti*100) : 0;
  return [
    { id:"CLN-01", name:"تغطية اليوم",          val:s.coverage, target:95, dir:"up", holiday:s.holiday,
      sub:s.holiday?"اليوم إجازة (الجمعة/السبت)":s.done+" من "+s.scheduled+" مجدولة" },
    { id:"CLN-02", name:"المناطق المكتملة اليوم", val: cov.length?Math.round(zonesDone/cov.length*100):0, target:90, dir:"up",
      sub:zonesDone+" من "+cov.length+" منطقة" },
    { id:"CLN-03", name:"نسبة المهامّ المتأخّرة", val:overduePct, target:5, dir:"down",
      sub:s.overdue+" من "+active.length+" مهمة نشطة" },
    { id:"CLN-04", name:"توثيق التنفيذ بالصور",   val:photoPct, target:80, dir:"up",
      sub:withPhotos+" من "+log.length+" تنفيذ هذا الشهر" },
    { id:"CLN-05", name:"اكتمال بنود الفحص",      val:itemsPct, target:95, dir:"up",
      sub:di+" من "+ti+" بند هذا الشهر" },
    { id:"CLN-06", name:"تنفيذات الشهر",          val:log.length, target:null, dir:"up",
      sub:"إجمالي ما نُفِّذ منذ بداية الشهر", raw:true }
  ];
}
/* ════════════ أداء المشرفين — لعقود النظافة ════════════
   صفحةُ الصيانة تُصنِّف الفنيّين والمشرفين بزمن الإغلاق وعدد البلاغات، وهي مقاييسُ
   بلاغاتٍ لا وجود لها في عقد نظافة (٩٥٪ من العمل جدولٌ مخطَّط لا بلاغ). فحين حجبنا
   صفحةَ الصيانة اختفى معها قياسُ المشرفين — ولم يكن هذا مقصوداً: البياناتُ اللازمة
   موجودةٌ كاملةً (كلُّ سطرِ تنفيذٍ يحمل supervisor، وخريطةُ supervisorBuildings تنسب
   كلَّ مبنًى لمشرفه). فالبديلُ هنا يقيس المشرفَ بما يملكه فعلاً في عقد النظافة:
   تغطيةُ نطاقه · متأخّراتُه · توثيقُه بالصور · اكتمالُ بنود فحصه.

   الدرجةُ ليست صندوقاً أسود: متوسّطٌ مرجَّحٌ للمكوّنات **القابلة للقياس فقط**، وتُعاد
   موازنةُ الأوزان على ما توفّر — فمشرفٌ بلا تنفيذاتٍ هذا الشهر لا يُعاقَب بصفرِ توثيقٍ
   لم يُقَس أصلاً، بل يظهر مكوّنُه «—». وإن لم يتوفّر أيُّ مكوّن فالدرجةُ «—» صراحةً. */
const SUP_UNASSIGNED = "مبانٍ بلا مشرف";
const SUP_WEIGHTS = { cov:0.45, late:0.20, doc:0.20, items:0.15 };
// مشرفُ سطرِ التنفيذ: الحقلُ المخزَّن، وإلا استُنبط من مبناه (سجلّاتٌ سابقةٌ للربط)
function logSupervisor(r){ return (r&&r.supervisor) ? r.supervisor : supOfBuilding(r&&r.building); }

function supervisorPerf(tasksList, logList, supMap){
  const tasks=(Array.isArray(tasksList)?tasksList:visibleTasks()).filter(t=>!isDisabled(t));
  const log  = Array.isArray(logList)?logList:visibleLog();
  const rows={};
  const row=n=>(rows[n] || (rows[n]={ name:n, _b:{}, done:0, due:0, overdue:0,
                                      runs:0, withPhotos:0, doneItems:0, totalItems:0 }));
  /* ★ بذرُ الكشف من خريطة الربط (supervisorBuildings) لا من تيّار المهامّ وحده:
     كلُّ مشرفٍ مربوطٍ يظهر ولو بلا مهامٍّ بعد — نطاقُه (zones) من الخريطة، ودرجتُه «—»
     (لا صفراً) حتى يُسجَّل عمل. بهذا لا يختفي المربوطُ من القياس لمجرّد خلوّ مبانيه من
     مهامّ اليوم (كان سببَ ظهور «لا مشرفين مربوطين» رغم الربط). النطاقُ محترَم: المشرفُ
     لا يُبذَر إلا بمبانٍ داخل نطاقه، والأدمن/المدير يرى الجميع (mine=null). */
  const map=(supMap && typeof supMap==="object") ? supMap : (_cfg.supervisorBuildings||{});
  const mine=myBuildings();
  Object.keys(map).forEach(s=>{
    const blds=(Array.isArray(map[s])?map[s]:[]).filter(b=>!mine||mine.indexOf(b)!==-1);
    if(mine && !blds.length) return;   // مشرفٌ خارجَ نطاق المستخدم الحالي
    const r=row(s); blds.forEach(b=>r._b[b]=1);
  });
  // توزيعُ المهمة/التنفيذ يقرأ **نفس** الخريطة المُعتمَدة أعلاه (المُمرَّرة أو _cfg) فلا
  // يختلف عن البذر: مهمةٌ بلا تجاوزٍ صريحٍ تُنسَب لمشرف مبناها من هذه الخريطة بعينها.
  const supOf=b=>{ for(const s of Object.keys(map)){ if(Array.isArray(map[s])&&map[s].indexOf(b)!==-1) return s; } return ""; };
  const supOfRec=r=>(r&&r.supervisor)?r.supervisor:supOf(r&&r.building);
  tasks.forEach(t=>{
    const r=row(supOfRec(t)||SUP_UNASSIGNED);
    if(t.building) r._b[t.building]=1;
    if(doneToday(t)) r.done++;
    else if(isDue(t)){ r.due++; if(isOverdue(t)) r.overdue++; }
  });
  log.forEach(x=>{
    const r=row(supOfRec(x)||SUP_UNASSIGNED);
    if(x&&x.building) r._b[x.building]=1;
    r.runs++;
    if(Array.isArray(x.photos)&&x.photos.length) r.withPhotos++;
    r.doneItems += Number(x.doneItems)||0;
    r.totalItems+= Number(x.totalItems)||0;
  });
  const out=Object.values(rows).map(r=>{
    const sched=r.done+r.due;
    const cov  = sched>0        ? Math.round(r.done/sched*100)          : null;
    const late = sched>0        ? Math.round(r.overdue/sched*100)       : null;
    const doc  = r.runs>0       ? Math.round(r.withPhotos/r.runs*100)   : null;
    const items= r.totalItems>0 ? Math.round(r.doneItems/r.totalItems*100) : null;
    // متوسّطٌ مرجَّحٌ على المكوّنات المتاحة فقط (المتأخّرات تُقلَب: أقلُّ = أفضل)
    let sum=0, w=0;
    if(cov  !=null){ sum+=SUP_WEIGHTS.cov  *cov;        w+=SUP_WEIGHTS.cov; }
    if(late !=null){ sum+=SUP_WEIGHTS.late *(100-late); w+=SUP_WEIGHTS.late; }
    if(doc  !=null){ sum+=SUP_WEIGHTS.doc  *doc;        w+=SUP_WEIGHTS.doc; }
    if(items!=null){ sum+=SUP_WEIGHTS.items*items;      w+=SUP_WEIGHTS.items; }
    const score = w>0 ? Math.round(sum/w) : null;
    return { name:r.name, zones:Object.keys(r._b).length, sched, done:r.done, due:r.due,
             overdue:r.overdue, runs:r.runs, withPhotos:r.withPhotos,
             doneItems:r.doneItems, totalItems:r.totalItems,
             cov, late, doc, items, score, unassigned:r.name===SUP_UNASSIGNED };
  });
  // «بلا مشرف» أسفلَ القائمة دائماً (ليست منافساً)، ثم الدرجةُ تنازلياً، وغيرُ المقيس أخيراً
  return out.sort((a,b)=>{
    if(a.unassigned!==b.unassigned) return a.unassigned?1:-1;
    const as=a.score==null?-1:a.score, bs=b.score==null?-1:b.score;
    if(bs!==as) return bs-as;
    return (b.runs+b.sched)-(a.runs+a.sched);
  });
}

function supPerfHTML(){
  const rows=supervisorPerf();
  const scored=rows.filter(r=>!r.unassigned);
  const orphanRow=rows.find(r=>r.unassigned);         // صفُّ أداءِ المهامّ بلا مشرف (إن وُجدت)
  const orphanBlds=unassignedBuildings();             // المباني بلا مشرف — نفس تعريف شاشة الربط
  const nOrphan=orphanBlds.length;
  const head=`<div class="co-sec"><div class="co-sec-t">${_svg('users')} أداء المشرفين — هذا الشهر</div>
      <span class="co-sec-c">${scored.length?scored.length+" مشرف":"لا مشرفين مربوطين"}</span></div>`;

  // لا مشرفَ مربوطٌ في نطاق المستخدم — النصُّ صادقٌ هنا (لا نزعم ربطاً غير موجود)
  if(!scored.length){
    if(nOrphan){
      return `<div class="card">${head}
        <div class="co-empty" style="padding:22px">${_svg('users')}
          <div class="co-empty-t">لا مبنى مرتبطٌ بمشرف</div>
          <div class="co-empty-s">${nOrphan} مبنًى بلا مشرف — اربطها من «تشغيل النظافة › المشرفون والمناطق» ليبدأ القياس.</div>
          ${canEdit()?`<button class="btn btn-sm" style="margin-top:10px" onclick="cleaningOps.goSupMap()">${_svg('users')} ربط المشرفين بالمباني</button>`:""}
        </div></div>`;
    }
    return `<div class="card">${head}
      <div class="co-empty" style="padding:22px">${_svg('users')}
        <div class="co-empty-t">لا بياناتٍ لقياس المشرفين بعد</div>
        <div class="co-empty-s">أضِف مهامّ نظافة وسجِّل تنفيذها ليُحسب الأداء.</div></div></div>`;
  }

  const col=v=>v==null?"var(--muted)":(v>=85?"var(--sla-ok)":(v>=60?"var(--sla-warn)":"var(--sla-crit)"));
  const pill=(lbl,v,sub,invert)=>{
    const good = v==null ? null : (invert ? (v<=5?"ok":(v<=15?"warn":"crit")) : (v>=85?"ok":(v>=60?"warn":"crit")));
    const c = good==null ? "var(--muted)" : "var(--sla-"+good+")";
    return `<div class="co-sup-m"><span class="l">${lbl}</span>
      <span class="v" style="color:${c}">${v==null?"—":v+"%"}</span>
      <span class="s">${_esc(sub)}</span></div>`;
  };
  const card=(r,i)=>{
    const c=col(r.score);
    const pct=r.score==null?0:Math.max(0,Math.min(100,r.score));
    return `<div class="co-sup ${r.unassigned?"orphan":""}">
      <div class="co-sup-h">
        <span class="rk">${r.unassigned?"—":(i+1)}</span>
        <span class="nm">${_esc(r.name)}</span>
        <span class="zn">${_svg('pin',13)} ${r.zones} مبنى</span>
        <span class="sc" style="color:${c}">${r.score==null?"—":r.score}</span>
      </div>
      <div class="hbar"><span style="flex:${Math.max(pct,0.01)};background:${c}"></span><span style="flex:${Math.max(100-pct,0.01)};background:var(--surface2)"></span></div>
      <div class="co-sup-ms">
        ${pill("تغطية اليوم",  r.cov,  r.done+" من "+r.sched)}
        ${pill("متأخّرات",     r.late, r.overdue+" مهمة", true)}
        ${pill("توثيق بالصور", r.doc,  r.withPhotos+" من "+r.runs+" تنفيذ")}
        ${pill("بنود الفحص",   r.items,r.doneItems+" من "+r.totalItems+" بند")}
      </div>
    </div>`;
  };

  // صفُّ «بلا مشرف»: عددُ مبانيه = المباني غير المسنَدة (نفس شاشة الربط)، لا مبانيَ المهامّ
  // وحدها؛ ويظهر ولو بلا مهامٍّ فيها بعد (مقاييسُه «—») ليُبرز فجوةَ المسؤولية صراحةً.
  const orphanShow = orphanRow ? Object.assign({}, orphanRow, { zones:nOrphan })
    : (nOrphan ? { name:SUP_UNASSIGNED, unassigned:true, zones:nOrphan, sched:0, done:0, due:0,
                   overdue:0, runs:0, withPhotos:0, doneItems:0, totalItems:0,
                   cov:null, late:null, doc:null, items:null, score:null } : null);

  return `<div class="card">${head}
    ${scored.map(card).join("")}
    ${orphanShow?card(orphanShow,-1):""}
    <div class="co-hint" style="margin-top:10px">
      الدرجةُ متوسّطٌ مرجَّح: التغطية ${Math.round(SUP_WEIGHTS.cov*100)}٪ ·
      انخفاضُ المتأخّرات ${Math.round(SUP_WEIGHTS.late*100)}٪ ·
      التوثيقُ بالصور ${Math.round(SUP_WEIGHTS.doc*100)}٪ ·
      بنودُ الفحص ${Math.round(SUP_WEIGHTS.items*100)}٪ — محسوبةً على المتاح فقط،
      وما لم يُقَس يظهر «—» ولا يُحتسب. التغطيةُ لليوم، والباقي منذ بداية الشهر.
      ${nOrphan?` <b>${nOrphan} مبنًى بلا مشرف</b> — اربطها ليدخل عملُها في القياس.`:""}
    </div>
  </div>`;
}
function goSupMap(){ try{ showPage(PAGE_ID); setView("sup"); }catch(e){} }

/* ════════════════════════════════════════════════════════════
   جولات الجودة بالتقييم (§٣-٣) — البند المؤجَّل الأخير
   تفتيشٌ دوريٌّ يقيس **نتيجة** النظافة (لا الالتزام بالجدول ولا زمن الشكوى): المفتِّشُ
   (أدمن/مدير المشروع/مشرف — canQuality، والمشرفُ ضمن مبانيه وحدها) يُقيّم كلَّ نوع عملٍ في كل مبنًى بالنجوم (١–٥) + مخالفاتٍ وصور،
   فيُنتج درجةً عامةً واتّجاهَ جودةٍ شهريّاً يُعرَض للعميل. معزولٌ بالمشروع كبقية النظام.
   ════════════════════════════════════════════════════════════ */
const QUALITY_STARS = 5;
const _gk = (b,wt)=> String(b)+""+String(wt);   // مفتاحُ خليّة التقييم (مبنى×نوع)

async function loadRounds(force){
  const database=_db(), col=qualityCol();
  if(_roundsPromise) return _roundsPromise;
  if(_roundsLoaded && _roundsFor===_projId() && !force) return Promise.resolve();
  if(!database || !col){ _rounds=[]; _roundsLoaded=true; _roundsFor=_projId(); return Promise.resolve(); }
  _roundsLoading=true;
  _roundsPromise=(async()=>{
    try{
      const snap=await database.collection(col).limit(300).get();
      _rounds=snap.docs.map(d=>Object.assign({id:d.id}, d.data()||{}))
                       .sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")) || String(b.at||"").localeCompare(String(a.at||"")));
    }catch(e){ console.warn("cleaningOps/loadRounds",e); _toast("⚠ تعذّر تحميل جولات الجودة","warn"); _rounds=[]; }
    finally{ _roundsLoaded=true; _roundsFor=_projId(); _roundsLoading=false; _roundsPromise=null; }
  })();
  return _roundsPromise;
}
async function saveRoundDoc(round){
  const database=_db(), col=qualityCol();
  if(!database || !col){ _toast("⚠ لا اتصال بقاعدة البيانات","warn"); return false; }
  try{
    await database.collection(col).doc(round.id).set(round, {merge:true});
    const i=_rounds.findIndex(r=>r.id===round.id);
    if(i>=0) _rounds[i]=round; else _rounds.unshift(round);
    _rounds.sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")) || String(b.at||"").localeCompare(String(a.at||"")));
    return true;
  }catch(e){ console.warn("cleaningOps/saveRound",e); _toast("⚠ تعذّر حفظ الجولة","warn"); return false; }
}
async function deleteRoundDoc(id){
  const database=_db(), col=qualityCol();
  if(!database || !col){ return false; }
  try{ await database.collection(col).doc(id).delete(); _rounds=_rounds.filter(r=>r.id!==id); return true; }
  catch(e){ console.warn("cleaningOps/deleteRound",e); _toast("⚠ تعذّر حذف الجولة","warn"); return false; }
}

// درجةُ الجولة: متوسّطُ نجومِ كلِّ التقييمات المُدخَلة (>0)، ونسبتُها المئوية
function roundScore(r){
  const rs=(r && Array.isArray(r.ratings)) ? r.ratings.filter(x=>x && Number(x.stars)>0) : [];
  if(!rs.length) return { n:0, avg:null, pct:null };
  const sum=rs.reduce((a,x)=>a+(Number(x.stars)||0),0);
  const avg=sum/rs.length;
  return { n:rs.length, avg:Math.round(avg*10)/10, pct:Math.round(avg/QUALITY_STARS*100) };
}
// اتّجاهُ الجودة الشهري + أضعفُ الأنواع: من كل الجولات (لكل مبنًى/نوعٍ عمل)
function qualityTrend(list){
  const rounds=Array.isArray(list)?list:_rounds;
  const months={};     // ym → {sum,n}
  const dims={};        // نوع العمل → {sum,n}
  const blds={};        // مبنى → {sum,n}
  rounds.forEach(r=>{
    const ym=String(r.date||"").slice(0,7);
    (Array.isArray(r.ratings)?r.ratings:[]).forEach(x=>{
      const s=Number(x&&x.stars)||0; if(s<=0) return;
      if(ym){ (months[ym]=months[ym]||{sum:0,n:0}); months[ym].sum+=s; months[ym].n++; }
      if(x.workType){ (dims[x.workType]=dims[x.workType]||{sum:0,n:0}); dims[x.workType].sum+=s; dims[x.workType].n++; }
      if(x.building){ (blds[x.building]=blds[x.building]||{sum:0,n:0}); blds[x.building].sum+=s; blds[x.building].n++; }
    });
  });
  const toPct=o=>o.n?Math.round(o.sum/o.n/QUALITY_STARS*100):null;
  const toAvg=o=>o.n?Math.round(o.sum/o.n*10)/10:null;
  const monthsArr=Object.keys(months).sort().map(ym=>({ ym, avg:toAvg(months[ym]), pct:toPct(months[ym]), n:months[ym].n }));
  const dimsArr =Object.keys(dims).map(k=>({ name:k, avg:toAvg(dims[k]), pct:toPct(dims[k]), n:dims[k].n })).sort((a,b)=>a.avg-b.avg);
  const bldsArr =Object.keys(blds).map(k=>({ name:k, avg:toAvg(blds[k]), pct:toPct(blds[k]), n:blds[k].n })).sort((a,b)=>a.avg-b.avg);
  const thisYm=_today().slice(0,7);
  const cur=months[thisYm]?{ avg:toAvg(months[thisYm]), pct:toPct(months[thisYm]), n:months[thisYm].n }:null;
  return { months:monthsArr, dims:dimsArr, blds:bldsArr, current:cur, roundsCount:rounds.length };
}

/* ── واجهةُ النجوم ── */
function starsView(v){   // عرضٌ فقط: ★ ممتلئة بعدد v من ٥
  const n=Math.round(Number(v)||0); let h="";
  for(let i=1;i<=QUALITY_STARS;i++) h+=`<span class="q-star ${i<=n?'on':''}">★</span>`;
  return `<span class="q-stars">${h}</span>`;
}
function starsInput(sbi,wi,v){   // تفاعليّ: نقرٌ يضبط، ونقرٌ على النجمة نفسها يُلغي
  const n=Number(v)||0; let h="";
  for(let i=1;i<=QUALITY_STARS;i++)
    h+=`<span class="q-star ${i<=n?'on':''}" role="button" tabindex="0" onclick="cleaningOps.setStar(${sbi},${wi},${i})">★</span>`;
  return `<span class="q-stars q-input" data-star-row="${sbi}-${wi}">${h}</span>`;
}

/* ── العرض: قائمة / نموذج / تفاصيل ── */
function qualityHTML(){
  if(!canQuality()){
    return `<div class="card"><div class="co-empty">${_svg('lock')}
      <div class="co-empty-t">جولات الجودة للأدمن ومدير المشروع والمشرف</div>
      <div class="co-empty-s">التفتيشُ الإشرافيُّ يُدخِله من يملك صلاحية الإدارة أو الإشراف.</div></div></div>`;
  }
  if(_editingRound) return roundFormHTML();
  if(_roundDetail)  return roundDetailHTML();
  if(!_roundsLoaded){ loadRounds().then(()=>{ if(_onPage()) render(); });
    return `<div class="card"><div class="co-empty"><div class="co-empty-t">جارٍ تحميل جولات الجودة…</div></div></div>`; }
  return roundsListHTML();
}
function roundsListHTML(){
  const rows=_rounds.map(r=>{
    const sc=roundScore(r);
    const c=sc.pct==null?"var(--muted)":(sc.pct>=85?"var(--sla-ok)":(sc.pct>=60?"var(--sla-warn)":"var(--sla-crit)"));
    const bcount=new Set((Array.isArray(r.ratings)?r.ratings:[]).map(x=>x.building)).size;
    return `<div class="co-logrow" onclick="cleaningOps.openRound('${_esc(r.id)}')" style="cursor:pointer">
      <div class="co-logrow-h">
        <span class="d">${_svg('calendar',13)} ${_esc(String(r.date||"").slice(0,10))}</span>
        <span class="b">${_svg('user',13)} ${_esc(r.by||"—")}</span>
        <span class="b">${_svg('building2',13)} ${bcount} مبنى · ${sc.n} تقييم</span>
        <span style="margin-inline-start:auto;font-weight:800;color:${c}">${sc.avg!=null?sc.avg+" ★":"—"} ${sc.pct!=null?"("+sc.pct+"%)":""}</span>
      </div>
      ${r.violations?`<div class="co-lognote">${_svg('alertTriangle',13)} ${_esc(String(r.violations).slice(0,140))}</div>`:""}
    </div>`;
  }).join("");
  return `<div class="card">
      <div class="co-sec"><div class="co-sec-t">${_svg('award')} جولات الجودة</div>
        <span class="co-sec-c">${_rounds.length?_rounds.length+" جولة":"لا جولاتٍ بعد"}</span></div>
      <button class="btn btn-primary btn-sm" onclick="cleaningOps.newRound()">${_svg('plus')} جولة جودةٍ جديدة</button>
      ${_rounds.length?`<div style="margin-top:12px">${rows}</div>`:`
        <div class="co-empty" style="padding:18px">${_svg('award')}
          <div class="co-empty-t">لا جولاتِ جودةٍ بعد</div>
          <div class="co-empty-s">ابدأ جولةً: قيّم كلَّ نوع عملٍ في كل مبنًى بالنجوم، وأضِف المخالفات والصور.</div></div>`}
    </div>`;
}
// مباني الجولة بنطاق المستخدم: المشرفُ مبانيه وحدها (خريطة الربط)، والإدارةُ كلَّها.
// غيرُ المربوط لا يُعمى (myBuildings تعيد null) فيرى الكلّ — كسياسة النطاق العامة.
function _qualityBuildings(){ const mine=myBuildings(); const all=_buildings(); return mine?all.filter(b=>mine.indexOf(b)!==-1):all; }
function roundFormHTML(){
  const r=_editingRound, blds=_qualityBuildings(), sel=r.buildings||[];
  const liveN=Object.keys(r.grid||{}).filter(k=>r.grid[k]>0).length;
  const liveSum=Object.keys(r.grid||{}).reduce((a,k)=>a+(r.grid[k]>0?r.grid[k]:0),0);
  const liveAvg=liveN?Math.round(liveSum/liveN*10)/10:null;
  const picker=blds.map((b,bi)=>{
    const on=sel.indexOf(b)!==-1;
    return `<label class="co-bld ${on?'on':''}"><input type="checkbox" ${on?'checked':''} onchange="cleaningOps.toggleRoundBuilding(${bi})"> ${_esc(b)}</label>`;
  }).join("");
  const grids=sel.map((b)=>{
    const sbi=sel.indexOf(b);
    const rowsHTML=WT_KEYS.map((wt,wi)=>`
      <div class="q-row">
        <span class="q-wt">${_esc(wt)}</span>
        ${starsInput(sbi,wi,(r.grid||{})[_gk(b,wt)]||0)}
      </div>`).join("");
    return `<div class="card co-group"><div class="co-sec"><div class="co-sec-t">${_svg('building2')} ${_esc(b)}</div></div>${rowsHTML}</div>`;
  }).join("");
  const photos=_roundPhotos.map((p,i)=>`
    <div class="co-photo ${p.error?'err':''}">
      ${p.url||p.preview?`<img src="${_esc(p.url||p.preview)}" alt="صورة الجولة">`:""}
      ${p.uploading?`<span class="co-photo-st">⏳ جارٍ الرفع…</span>`:""}
      ${p.error?`<span class="co-photo-st">⚠ تعذّر الرفع</span>`:""}
      <button class="co-photo-x" onclick="cleaningOps.delRoundPhoto(${i})" title="حذف">✕</button>
    </div>`).join("");
  return subHeroHTML("جولة جودةٍ جديدة", "قيّم كلَّ نوع عملٍ في كل مبنًى بالنجوم", "cancelRound") + `
    <div class="card co-pane">
      <div class="form-group"><label class="form-label">تاريخ الجولة</label>
        <input class="form-input" type="date" id="q-date" value="${_esc(String(r.date||_today()).slice(0,10))}"></div>
      <div class="form-group"><label class="form-label">المباني المشمولة (اختر ثم قيّم)</label>
        ${blds.length?`<div class="co-sup-blds">${picker}</div>`
          :`<div class="co-hint" style="margin:0">لا مبانيَ ضمن نطاقك — اطلب من مدير المشروع ربطَك بالمباني من «المشرفون والمناطق».</div>`}</div>
    </div>
    ${sel.length?`<div class="co-live-score card"><span>متوسّط الجولة الحيّ:</span> <b id="q-live">${liveAvg!=null?liveAvg+" ★ ("+Math.round(liveAvg/QUALITY_STARS*100)+"%)":"—"}</b> <small id="q-live-n">${liveN} تقييم</small></div>${grids}`
      :`<div class="card"><div class="co-hint" style="margin:0">اختر مبنًى واحداً على الأقل لبدء التقييم.</div></div>`}
    <div class="card co-pane">
      <div class="form-group"><label class="form-label">المخالفات والملاحظات</label>
        <textarea class="form-input" id="q-violations" rows="3" placeholder="مثال: دورات مياه الدور ٣ تحتاج إعادة تعقيم؛ زجاج الواجهة غير مكتمل.">${_esc(r.violations||"")}</textarea></div>
      <div class="form-group"><label class="form-label">صور الجولة (حتى ٤)</label>
        <div class="co-photos">${photos}
          ${_roundPhotos.length<4?`
          <button class="co-photo-add" onclick="cleaningOps.pickRoundPhoto(true)">${_svg('camera')}<span>التقاط بالكاميرا</span></button>
          <button class="co-photo-add" onclick="cleaningOps.pickRoundPhoto(false)">${_svg('image')}<span>من المعرض</span></button>`:""}</div></div>
      <div class="co-actions" style="margin-top:6px">
        <button class="btn btn-primary btn-sm" onclick="cleaningOps.saveRoundForm()">${_svg('checkCircle')} حفظ الجولة</button>
        <button class="btn btn-ghost btn-sm" onclick="cleaningOps.cancelRound()">إلغاء</button>
      </div>
    </div>`;
}
function roundDetailHTML(){
  const r=_roundDetail, sc=roundScore(r);
  const c=sc.pct==null?"var(--muted)":(sc.pct>=85?"var(--sla-ok)":(sc.pct>=60?"var(--sla-warn)":"var(--sla-crit)"));
  const byB={};
  (Array.isArray(r.ratings)?r.ratings:[]).forEach(x=>{ (byB[x.building]=byB[x.building]||[]).push(x); });
  const groups=Object.keys(byB).map(b=>`
    <div class="card co-group"><div class="co-sec"><div class="co-sec-t">${_svg('building2')} ${_esc(b)}</div></div>
      ${byB[b].map(x=>`<div class="q-row"><span class="q-wt">${_esc(x.workType)}</span>${starsView(x.stars)}</div>`).join("")}
    </div>`).join("");
  const photos=(Array.isArray(r.photos)?r.photos:[]).map(u=>`<div class="co-photo"><img src="${_esc(u)}"></div>`).join("");
  return subHeroHTML("تفاصيل جولة الجودة", _esc(String(r.date||"").slice(0,10)), "closeRound") + `
    <div class="card">
      <div class="co-tiles">
        <div class="stat-tile" style="--_c:${c}"><div class="st-val" style="color:${c}">${sc.avg!=null?sc.avg+" ★":"—"}</div><div class="st-lbl">متوسّط الجودة</div></div>
        <div class="stat-tile" style="--_c:${c}"><div class="st-val" style="color:${c}">${sc.pct!=null?sc.pct+"%":"—"}</div><div class="st-lbl">النسبة المئوية</div></div>
        <div class="stat-tile" style="--_c:var(--primary)"><div class="st-val">${sc.n}</div><div class="st-lbl">تقييمات</div></div>
        <div class="stat-tile" style="--_c:var(--primary)"><div class="st-val">${_esc(r.by||"—")}</div><div class="st-lbl">المفتِّش</div></div>
      </div>
      ${r.violations?`<div class="ppm-overdue-banner"><span class="co-bnr-ic">${_svg('alertTriangle')}</span><span>${_esc(r.violations)}</span></div>`:""}
    </div>
    ${groups}
    ${photos?`<div class="card"><div class="co-sec"><div class="co-sec-t">${_svg('image')} صور الجولة</div></div><div class="co-logphotos">${photos}</div></div>`:""}
    <div class="co-actions">
      <button class="btn btn-primary btn-sm" onclick="cleaningOps.printRound('${_esc(r.id)}')">${_svg('fileText')} طباعة تقرير الجولة</button>
      ${canEdit()?`<button class="btn btn-ghost btn-sm" onclick="cleaningOps.removeRound('${_esc(r.id)}')">${_svg('trash')} حذف الجولة</button>`:""}
    </div>`;
}

/* ── التفاعل ── */
function _captureRoundForm(){   // احفظ نصوصَ النموذج في الحالة قبل أي إعادة رسم
  if(!_editingRound) return;
  const d=document.getElementById("q-date"); if(d) _editingRound.date=d.value||_today();
  const v=document.getElementById("q-violations"); if(v) _editingRound.violations=v.value||"";
}
function newRound(){
  if(!canQuality()){ _toast("⚠ جولات الجودة للإدارة والمشرفين فقط","warn"); return; }
  _editingRound={ id:_uid(), date:_today(), buildings:[], grid:{}, violations:"" }; _roundPhotos=[]; _roundDetail=null; render(); }
function cancelRound(){ _editingRound=null; _roundPhotos=[]; render(); }
function toggleRoundBuilding(bi){
  _captureRoundForm();
  const b=_qualityBuildings()[bi]; if(!b || !_editingRound) return;
  const arr=_editingRound.buildings||(_editingRound.buildings=[]);
  const i=arr.indexOf(b);
  if(i===-1) arr.push(b); else { arr.splice(i,1); Object.keys(_editingRound.grid).forEach(k=>{ if(k.indexOf(b+"")===0) delete _editingRound.grid[k]; }); }
  render();
}
function setStar(sbi,wi,n){
  if(!_editingRound) return;
  const b=(_editingRound.buildings||[])[sbi], wt=WT_KEYS[wi]; if(!b||!wt) return;
  const key=_gk(b,wt), cur=_editingRound.grid[key]||0;
  _editingRound.grid[key]=(cur===n)?0:n;   // نقرٌ على النجمة نفسها يُلغي التقييم
  // تحديثٌ موضعيٌّ (بلا إعادة رسمٍ كاملة) حفاظاً على نصوص المخالفات
  const row=document.querySelector('#page-'+PAGE_ID+' [data-star-row="'+sbi+'-'+wi+'"]');
  if(row) Array.prototype.forEach.call(row.querySelectorAll('.q-star'),(s,idx)=>s.classList.toggle('on', idx<_editingRound.grid[key]));
  _updateRoundLiveScore();
}
function _updateRoundLiveScore(){
  const g=_editingRound&&_editingRound.grid||{}; const keys=Object.keys(g).filter(k=>g[k]>0);
  const el=document.getElementById("q-live"), cnt=document.getElementById("q-live-n");
  if(cnt) cnt.textContent=keys.length+" تقييم";
  if(!el) return;
  if(!keys.length){ el.textContent="—"; return; }
  const avg=Math.round(keys.reduce((a,k)=>a+g[k],0)/keys.length*10)/10;
  el.textContent=avg+" ★ ("+Math.round(avg/QUALITY_STARS*100)+"%)";
}
async function saveRoundForm(){
  if(!_editingRound) return;
  if(!canQuality()){ _toast("⚠ جولات الجودة للإدارة والمشرفين فقط","warn"); return; }
  _captureRoundForm();
  const g=_editingRound.grid||{};
  const ratings=Object.keys(g).filter(k=>g[k]>0).map(k=>{ const p=k.split(""); return { building:p[0], workType:p[1], stars:g[k] }; });
  if(!ratings.length){ _toast("⚠ قيّم نوعَ عملٍ واحداً على الأقل","warn"); return; }
  const round={
    id:_editingRound.id, date:String(_editingRound.date||_today()).slice(0,10),
    at:new Date().toISOString(), by:_userName(),
    ratings, violations:String(_editingRound.violations||"").slice(0,1000),
    photos:(_roundPhotos||[]).map(p=>p.url).filter(Boolean)
  };
  const sc=roundScore(round); round.avgStars=sc.avg; round.pct=sc.pct;
  const ok=await saveRoundDoc(round);
  if(ok){ _audit("جولة جودة نظافة", round.date+" — "+ratings.length+" تقييم — "+(sc.pct||0)+"%");
    _toast("✅ حُفظت جولة الجودة","success"); _editingRound=null; _roundPhotos=[]; render(); }
}
function openRound(id){ const r=_rounds.find(x=>x.id===id); if(r){ _roundDetail=r; _editingRound=null; render(); } }
function closeRound(){ _roundDetail=null; render(); }
async function removeRound(id){
  if(!canEdit()){ _toast("⚠ حذفُ الجولات لصلاحية الإدارة وحدها","warn"); return; }
  if(typeof showConfirm==="function"){ const ok=await showConfirm("حذف جولة الجودة؟","لا يمكن التراجع."); if(!ok) return; }
  const ok=await deleteRoundDoc(id); if(ok){ _roundDetail=null; _toast("🗑 حُذفت الجولة","success"); render(); }
}
/* صور الجولة — نفس آلية النواة (ضغط + Storage)، ببافرٍ مستقلٍّ عن صور التنفيذ */
function pickRoundPhoto(fromCamera){
  const room=4-_roundPhotos.length;
  if(room<=0){ _toast("⚠ الحدّ الأقصى ٤ صور للجولة","warn"); return; }
  _captureRoundForm();
  const inp=document.createElement("input"); inp.type="file"; inp.accept="image/*"; inp.style.display="none";
  if(fromCamera) inp.setAttribute("capture","environment"); else inp.multiple=true;
  inp.onchange=()=>{ Array.prototype.slice.call(inp.files||[],0,room).forEach(f=>_uploadRoundPhoto(f));
    try{ document.body.removeChild(inp); }catch(e){} };
  document.body.appendChild(inp); inp.click();
}
function _uploadRoundPhoto(file){
  const st=_storage(); if(!st){ _toast("⚠ خدمة التخزين غير متاحة","warn"); return; }
  if(_roundPhotos.length>=4) return;
  const rec={ url:"", uploading:true, error:false, preview:"" };
  try{ rec.preview=URL.createObjectURL(file); }catch(e){}
  _roundPhotos.push(rec); render();
  const done=()=>{ if(_onPage()) render(); };
  const comp=(typeof compressImage==="function")?compressImage(file):Promise.resolve(file);
  comp.then(blob=>{
    if(!blob){ rec.uploading=false; rec.error=true; done(); return; }
    const id=_projId()||"proj";
    const ref=st.ref("cleaning-quality/"+id+"/"+Date.now()+".jpg");
    let timedOut=false;
    const to=setTimeout(()=>{ timedOut=true; rec.uploading=false; rec.error=true; _toast("⚠ تأخّر رفع الصورة","warn"); done(); },45000);
    ref.put(blob).then(s=>s.ref.getDownloadURL()).then(url=>{ clearTimeout(to); if(timedOut) return; rec.url=url; rec.storagePath=ref.fullPath; rec.uploading=false; done(); })
      .catch(err=>{ clearTimeout(to); if(timedOut) return; console.warn("cleaningOps/roundPhoto",err); rec.uploading=false; rec.error=true; _toast("⚠ تعذّر رفع الصورة","warn"); done(); });
  }).catch(()=>{ rec.uploading=false; rec.error=true; done(); });
}
function delRoundPhoto(i){ _captureRoundForm(); _roundPhotos.splice(i,1); render(); }
function goQuality(){ try{ showPage(PAGE_ID); setView("quality"); }catch(e){} }

/* ════════════════════════════════════════════════════════════
   تقرير العميل (PDF) — يُثبت الأداء لتجديد العقد
   يجمع في مستندٍ واحد: الالتزامَ بالجدول + جودةَ النتيجة + التغطية + الاتّجاه الشهري.
   يعيد استخدام نافذة الطباعة القائمة (_openPrintWindow) فالعربيةُ سليمةٌ RTL بلا مكتبات.
   المستندُ ذاتيُّ الأنماط (يُفتح في نافذةٍ نظيفة)، فألوانُه صريحةٌ للطباعة على ورقٍ أبيض.
   ════════════════════════════════════════════════════════════ */
const _AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
function _monthName(ym){ const m=parseInt(String(ym).slice(5,7),10)-1; return (_AR_MONTHS[m]||"")+" "+String(ym).slice(0,4); }
function _qcol(pct){ return pct==null?"#64748b":(pct>=85?"#16a34a":(pct>=60?"#d97706":"#dc2626")); }

function buildClientReportHTML(){
  const p=_proj()||{}, today=_today(), ym=today.slice(0,7);
  const s=boardStats(), kpis=cleaningKPIs(), cov=coverageByBuilding(), tr=qualityTrend(), cp=contractProgress();
  const cur=tr.current;
  const monthRounds=(_rounds||[]).filter(r=>String(r.date||"").slice(0,7)===ym);
  const execCount=(kpis.find(k=>k.id==="CLN-06")||{}).val||0;
  const photoPct=(kpis.find(k=>k.id==="CLN-04")||{}).val;
  const itemsPct=(kpis.find(k=>k.id==="CLN-05")||{}).val;

  const tile=(val,lbl,c)=>`<div class="rp-tile"><div class="rp-tile-v" style="color:${c||'#1e3a5f'}">${val}</div><div class="rp-tile-l">${lbl}</div></div>`;
  const kpiCard=k=>{
    const c=k.holiday?"#64748b":(k.target==null?"#1e3a5f":((k.dir==="up"?k.val>=k.target:k.val<=k.target)?"#16a34a":(k.val>=(k.target||0)*0.7?"#d97706":"#dc2626")));
    return `<div class="rp-kpi"><div class="rp-kpi-h"><span>${_esc(k.name)}</span><span class="rp-kpi-id">${k.id}</span></div>
      <div class="rp-kpi-v" style="color:${c}">${k.holiday?"إجازة":k.val+(k.raw?"":"%")}</div>
      <div class="rp-kpi-s">${_esc(k.sub||"")}${k.target!=null?` · الهدف ${k.dir==="up"?"≥":"≤"}${k.target}%`:""}</div></div>`;
  };
  const maxBar=Math.max.apply(null,[1].concat(tr.months.map(m=>m.pct||0)));
  const bars=tr.months.slice(-6).map(m=>`
    <div class="rp-bar"><div class="rp-bar-t"><span style="height:${Math.round((m.pct||0)/maxBar*100)}%;background:${_qcol(m.pct)}"></span></div>
      <div class="rp-bar-p" style="color:${_qcol(m.pct)}">${m.pct}%</div><div class="rp-bar-l">${_esc(m.ym.slice(5))}</div></div>`).join("");
  const weak=tr.dims.slice(0,4).map(d=>`<tr><td>${_esc(d.name)}</td><td class="rp-num">${d.avg} ★</td>
    <td><div class="rp-track"><span style="width:${d.pct}%;background:${_qcol(d.pct)}"></span></div></td><td class="rp-num" style="color:${_qcol(d.pct)}">${d.pct}%</td></tr>`).join("");
  // ══ v18.9ad — M21: التغطية في تقريرٍ شهري تُحسب من سجلّ الشهر ══
  // كان القسم يرسم `coverageByBuilding()` — **لقطةُ اليوم** — تحت تقريرٍ معنون
  // «الفترة: <شهر>»، فتصديرُ التقرير يوم جمعةٍ يُظهر «لا مهامَّ لليوم» ويبدو أن
  // المشروع بلا عمل طوال الشهر. الآن الصفوف من `_monthLog` (تنفيذاتُ الشهر فعلاً)،
  // ولقطةُ اليوم تبقى معروضةً لكن **موسومةً بيومها** فلا تُقرأ شهريةً.
  const monthByBld = {};
  visibleLog().forEach(r=>{
    const b = (r && r.building) || "—";
    const e = monthByBld[b] || (monthByBld[b] = { runs:0, days:{} });
    e.runs++;
    const d = String((r&&r.date)||"").slice(0,10);
    if(d) e.days[d]=1;
  });
  const monthNames = Object.keys(monthByBld).sort((a,b)=> monthByBld[b].runs - monthByBld[a].runs);
  const maxRuns = Math.max.apply(null, [1].concat(monthNames.map(b=>monthByBld[b].runs)));
  const covRows = monthNames.map(b=>{
    const e = monthByBld[b], days = Object.keys(e.days).length;
    const w  = Math.round(e.runs / maxRuns * 100);
    return `<tr><td>${_esc(b)}</td><td class="rp-num">${e.runs}</td>
      <td><div class="rp-track"><span style="width:${w}%;background:#16a34a"></span></div></td>
      <td class="rp-num">${days}</td></tr>`;
  }).join("");
  const todayCovRows = cov.map(b=>`<tr><td>${_esc(b.name)}</td><td class="rp-num">${b.done}/${b.sched}</td>
    <td><div class="rp-track"><span style="width:${b.pct}%;background:${_qcol(b.pct)}"></span></div></td><td class="rp-num" style="color:${_qcol(b.pct)}">${b.pct}%</td></tr>`).join("");
  const roundRows=monthRounds.map(r=>{ const sc=roundScore(r);
    return `<tr><td class="rp-num">${_esc(String(r.date||"").slice(0,10))}</td><td>${_esc(r.by||"—")}</td>
      <td class="rp-num" style="color:${_qcol(sc.pct)}">${sc.avg!=null?sc.avg+" ★ ("+sc.pct+"%)":"—"}</td>
      <td>${_esc(String(r.violations||"—").slice(0,160))}</td></tr>`; }).join("");

  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<title>تقرير أداء النظافة — ${_esc(p.name||p.id||"")}</title>
<style>
@page{size:A4 portrait;margin:12mm 12mm 14mm}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Cairo','Tajawal','Segoe UI',sans-serif;direction:rtl;color:#1e293b;margin:0;font-size:12px;line-height:1.6}
.rp-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1e3a5f;padding-bottom:12px;margin-bottom:16px}
.rp-co{font-size:17px;font-weight:900;color:#1e3a5f}.rp-co small{display:block;font-size:11px;font-weight:600;color:#64748b;margin-top:2px}
.rp-title{text-align:left}.rp-title b{font-size:15px;color:#1e3a5f}.rp-title div{font-size:11px;color:#64748b;margin-top:3px}
.rp-sec{font-size:13px;font-weight:800;color:#1e3a5f;border-inline-start:4px solid #1e3a5f;padding-inline-start:9px;margin:18px 0 10px}
.rp-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.rp-tile{border:1px solid #dbe2ee;border-radius:10px;padding:12px;text-align:center;background:#f8fafc}
.rp-tile-v{font-size:22px;font-weight:900}.rp-tile-l{font-size:10.5px;color:#64748b;font-weight:700;margin-top:3px}
.rp-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
.rp-kpi{border:1px solid #dbe2ee;border-radius:9px;padding:10px}
.rp-kpi-h{display:flex;justify-content:space-between;font-size:10.5px;font-weight:800;color:#334155}.rp-kpi-id{font-family:monospace;color:#94a3b8;font-weight:700}
.rp-kpi-v{font-size:20px;font-weight:900;margin:3px 0}.rp-kpi-s{font-size:9.5px;color:#64748b;font-weight:600}
.rp-quality{display:grid;grid-template-columns:1fr 1.4fr;gap:14px;align-items:start}
.rp-bars{display:flex;gap:8px;align-items:flex-end;height:120px;border:1px solid #dbe2ee;border-radius:10px;padding:12px}
.rp-bar{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end}
.rp-bar-t{width:100%;max-width:40px;flex:1;background:#eef2f7;border-radius:6px;display:flex;align-items:flex-end;overflow:hidden}
.rp-bar-t span{width:100%;display:block;border-radius:6px 6px 0 0}
.rp-bar-p{font-family:monospace;font-size:10px;font-weight:900}.rp-bar-l{font-size:9.5px;color:#64748b;font-weight:700}
table{width:100%;border-collapse:collapse;font-size:11px}
th{background:#eef2f7;color:#1e3a5f;text-align:right;padding:7px 9px;font-size:10.5px;font-weight:800;border-bottom:1px solid #dbe2ee}
td{padding:6px 9px;border-bottom:1px solid #eef2f7}.rp-num{font-family:monospace;text-align:right;white-space:nowrap}
.rp-track{width:100%;height:8px;background:#eef2f7;border-radius:5px;overflow:hidden}.rp-track span{display:block;height:100%}
.rp-summary{font-size:11.5px;color:#475569;background:#f8fafc;border:1px solid #dbe2ee;border-radius:10px;padding:12px 14px}
.rp-foot{margin-top:26px;padding-top:12px;border-top:1px solid #dbe2ee;display:flex;justify-content:space-between;font-size:10.5px;color:#64748b}
.rp-sign{margin-top:30px;display:flex;justify-content:space-between}.rp-sign div{width:40%;border-top:1px solid #94a3b8;padding-top:6px;text-align:center;font-size:11px;font-weight:700;color:#334155}
.rp-empty{color:#94a3b8;font-size:11px;padding:8px}
</style></head><body>
  <div class="rp-head">
    <div class="rp-co">شركة المباني السريعة للمقاولات<small>نظام إدارة النظافة والمرافق</small></div>
    <div class="rp-title"><b>تقرير أداء أعمال النظافة</b>
      <div>${_esc(p.name||p.id||"مشروع نظافة")}</div>
      <div>الفترة: ${_monthName(ym)} · تاريخ الإصدار: ${today}</div></div>
  </div>

  <div class="rp-summary">يلخّص هذا التقريرُ أداءَ أعمال النظافة لهذا الشهر: جودةَ النتيجة (من جولات التفتيش)،
    والالتزامَ بالجدول اليومي، وتغطيةَ المناطق — إثباتاً موثَّقاً لمستوى الخدمة المُقدَّمة.</div>

  <div class="rp-sec">الملخّص التنفيذي</div>
  <div class="rp-tiles">
    ${tile(cur?cur.avg+" ★":"—", "متوسّط جودة الشهر", _qcol(cur&&cur.pct))}
    ${tile(s.holiday?"إجازة":s.coverage+"%", "تغطية اليوم", s.holiday?"#64748b":_qcol(s.coverage))}
    ${tile(execCount, "تنفيذات هذا الشهر", "#1e3a5f")}
    ${tile(cp?cp.pct+"%":"—", "انقضاء مدة العقد", "#1e3a5f")}
  </div>

  <div class="rp-sec">الالتزام بالجدول اليومي</div>
  <div class="rp-kpis">${kpis.map(kpiCard).join("")}</div>

  <div class="rp-sec">جودة النتيجة — اتّجاه التفتيش</div>
  ${tr.roundsCount?`<div class="rp-quality">
    <div><div style="font-size:11px;color:#64748b;font-weight:700;margin-bottom:6px">الاتّجاه الشهري (آخر ٦ أشهر)</div>
      <div class="rp-bars">${bars}</div></div>
    <div><div style="font-size:11px;color:#64748b;font-weight:700;margin-bottom:6px">أضعفُ أنواع العمل — أولويةُ التحسين</div>
      <table>${weak||'<tr><td class="rp-empty">—</td></tr>'}</table></div>
  </div>`:`<div class="rp-empty">لا جولاتِ تفتيشٍ مُسجَّلةٌ بعد.</div>`}

  <div class="rp-sec">التغطية حسب المنطقة — ${_monthName(ym)}</div>
  <table><thead><tr><th>المنطقة / المبنى</th><th>تنفيذات الشهر</th><th>الحجم النسبي</th><th>أيام العمل</th></tr></thead>
    <tbody>${covRows||'<tr><td colspan="4" class="rp-empty">لا تنفيذاتِ مُسجَّلةٌ هذا الشهر.</td></tr>'}</tbody></table>

  <div class="rp-sec">لقطةُ اليوم — ${_esc(today)} (ليست مؤشّراً شهرياً)</div>
  <table><thead><tr><th>المنطقة / المبنى</th><th>المُنفَّذ اليوم</th><th>النسبة</th><th>%</th></tr></thead>
    <tbody>${todayCovRows||'<tr><td colspan="4" class="rp-empty">لا مهامَّ مجدولةٌ لليوم (عطلة أو لا استحقاق).</td></tr>'}</tbody></table>

  <div class="rp-sec">جولاتُ التفتيش والمخالفات — ${_monthName(ym)}</div>
  <table><thead><tr><th>التاريخ</th><th>المفتِّش</th><th>الدرجة</th><th>المخالفات والملاحظات</th></tr></thead>
    <tbody>${roundRows||'<tr><td colspan="4" class="rp-empty">لا جولاتِ تفتيشٍ هذا الشهر.</td></tr>'}</tbody></table>

  <div class="rp-sign"><div>مُعِدُّ التقرير</div><div>اعتماد العميل</div></div>
  <div class="rp-foot"><span>أُنشئ آليّاً من نظام إدارة النظافة — ${today}</span><span>${_esc(p.name||"")}</span></div>
</body></html>`;
}
async function exportClientReport(){
  try{ await Promise.all([loadTasks(), loadMonthLog(), loadRounds()]); }catch(e){}
  const html=buildClientReportHTML();
  if(typeof _openPrintWindow==="function"){ _openPrintWindow(html); _audit("تصدير تقرير عميل النظافة", (_proj()&&_proj().name)||""); }
  else _toast("⚠ تعذّر فتح نافذة الطباعة","warn");
}

/* ── طباعة تقرير جولةٍ واحدة ── مستندٌ رسميٌّ لجولة تفتيشٍ بعينها (تقييماتٌ وصورٌ ومخالفات) */
function _printStars(n){ n=Math.round(Number(n)||0); let h=""; for(let i=1;i<=QUALITY_STARS;i++) h+=`<span style="color:${i<=n?'#f59e0b':'#cbd5e1'}">★</span>`; return h; }
function buildRoundReportHTML(r){
  const p=_proj()||{}, sc=roundScore(r);
  const c=sc.pct==null?"#64748b":(sc.pct>=85?"#16a34a":(sc.pct>=60?"#d97706":"#dc2626"));
  const byB={}; (Array.isArray(r.ratings)?r.ratings:[]).forEach(x=>{ (byB[x.building]=byB[x.building]||[]).push(x); });
  const groups=Object.keys(byB).map(b=>`
    <div class="rr-b"><div class="rr-bh">🏢 ${_esc(b)}</div>
      <table>${byB[b].map(x=>`<tr><td>${_esc(x.workType)}</td><td class="rr-st">${_printStars(x.stars)}</td><td class="rr-num">${x.stars}/${QUALITY_STARS}</td></tr>`).join("")}</table></div>`).join("");
  const photos=(Array.isArray(r.photos)?r.photos:[]).slice(0,4).map(u=>`<img src="${_esc(u)}" alt="صورة الجولة">`).join("");
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<title>تقرير جولة تفتيش — ${_esc(p.name||p.id||"")} — ${_esc(String(r.date||"").slice(0,10))}</title>
<style>
@page{size:A4 portrait;margin:12mm}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Cairo','Tajawal','Segoe UI',sans-serif;direction:rtl;color:#1e293b;margin:0;font-size:12.5px;line-height:1.7}
.rr-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1e3a5f;padding-bottom:12px;margin-bottom:16px}
.rr-co{font-size:17px;font-weight:900;color:#1e3a5f}.rr-co small{display:block;font-size:11px;font-weight:600;color:#64748b;margin-top:2px}
.rr-ttl{text-align:left}.rr-ttl b{font-size:15px;color:#1e3a5f}.rr-ttl div{font-size:11px;color:#64748b;margin-top:3px}
.rr-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
.rr-tile{border:1px solid #dbe2ee;border-radius:10px;padding:12px;text-align:center;background:#f8fafc}
.rr-tv{font-size:22px;font-weight:900}.rr-tl{font-size:10.5px;color:#64748b;font-weight:700;margin-top:3px}
.rr-viol{background:#fef2f2;border:1px solid #dc2626;color:#b91c1c;border-radius:10px;padding:11px 14px;font-size:12px;font-weight:700;margin-bottom:16px}
.rr-sec{font-size:13px;font-weight:800;color:#1e3a5f;border-inline-start:4px solid #1e3a5f;padding-inline-start:9px;margin:16px 0 10px}
.rr-b{border:1px solid #dbe2ee;border-radius:10px;padding:10px 12px;margin-bottom:10px;break-inside:avoid}
.rr-bh{font-weight:800;color:#1e3a5f;font-size:12.5px;margin-bottom:6px}
table{width:100%;border-collapse:collapse;font-size:12px}td{padding:6px 8px;border-bottom:1px solid #eef2f7}
.rr-st{font-size:15px;letter-spacing:1px;text-align:center;white-space:nowrap;direction:ltr}.rr-num{font-family:monospace;text-align:left;color:#64748b;white-space:nowrap}
.rr-photos{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}.rr-photos img{width:150px;height:110px;object-fit:cover;border-radius:8px;border:1px solid #dbe2ee}
.rr-sign{margin-top:34px;display:flex;justify-content:space-between}.rr-sign div{width:40%;border-top:1px solid #94a3b8;padding-top:6px;text-align:center;font-size:11px;font-weight:700;color:#334155}
.rr-foot{margin-top:22px;padding-top:12px;border-top:1px solid #dbe2ee;display:flex;justify-content:space-between;font-size:10.5px;color:#64748b}
</style></head><body>
  <div class="rr-head">
    <div class="rr-co">شركة المباني السريعة للمقاولات<small>نظام إدارة النظافة والمرافق</small></div>
    <div class="rr-ttl"><b>تقرير جولة تفتيش الجودة</b>
      <div>${_esc(p.name||p.id||"مشروع نظافة")}</div>
      <div>تاريخ الجولة: ${_esc(String(r.date||"").slice(0,10))} · المفتِّش: ${_esc(r.by||"—")}</div></div>
  </div>
  <div class="rr-tiles">
    <div class="rr-tile"><div class="rr-tv" style="color:${c}">${sc.avg!=null?sc.avg+" ★":"—"}</div><div class="rr-tl">متوسّط الجودة</div></div>
    <div class="rr-tile"><div class="rr-tv" style="color:${c}">${sc.pct!=null?sc.pct+"%":"—"}</div><div class="rr-tl">النسبة المئوية</div></div>
    <div class="rr-tile"><div class="rr-tv" style="color:#1e3a5f">${sc.n}</div><div class="rr-tl">عدد التقييمات</div></div>
    <div class="rr-tile"><div class="rr-tv" style="color:#1e3a5f">${Object.keys(byB).length}</div><div class="rr-tl">المباني المُقيَّمة</div></div>
  </div>
  ${r.violations?`<div class="rr-viol">⚠ المخالفات والملاحظات: ${_esc(r.violations)}</div>`:""}
  <div class="rr-sec">التقييم التفصيلي (النجوم من ${QUALITY_STARS})</div>
  ${groups||'<div style="color:#94a3b8">لا تقييماتٍ في هذه الجولة.</div>'}
  ${photos?`<div class="rr-sec">صور الجولة</div><div class="rr-photos">${photos}</div>`:""}
  <div class="rr-sign"><div>المفتِّش</div><div>اعتماد العميل</div></div>
  <div class="rr-foot"><span>أُنشئ آليّاً من نظام إدارة النظافة — ${_today()}</span><span>${_esc(p.name||"")}</span></div>
</body></html>`;
}
function printRound(id){
  const r=(_rounds||[]).find(x=>x.id===id) || (_roundDetail&&_roundDetail.id===id?_roundDetail:null);
  if(!r){ _toast("⚠ تعذّر إيجاد الجولة","warn"); return; }
  const html=buildRoundReportHTML(r);
  if(typeof _openPrintWindow==="function"){ _openPrintWindow(html); _audit("طباعة تقرير جولة جودة", String(r.date||"")); }
  else _toast("⚠ تعذّر فتح نافذة الطباعة","warn");
}

function kpiHTML(){
  const list=cleaningKPIs();
  const card=k=>{
    // في الإجازة: تغطيةُ اليوم لا تُقاس (لا عملَ متوقَّع) — تُعرَض «إجازة» محايدةً لا 0% عقابيّاً
    const ok = k.target==null ? true : (k.dir==="up" ? k.val>=k.target : k.val<=k.target);
    const c  = k.holiday ? "var(--muted)" : (k.target==null ? "var(--primary)" : (ok?"var(--sla-ok)":(k.dir==="up"?(k.val>=k.target*0.7?"var(--sla-warn)":"var(--sla-crit)"):"var(--sla-crit)")));
    const pct= k.holiday ? 100 : (k.raw ? 100 : Math.max(0,Math.min(100,k.val)));
    return `<div class="card co-kpi" style="--_c:${c}">
      <div class="co-kpi-h"><span class="n">${_esc(k.name)}</span><span class="id">${k.id}</span></div>
      <div class="co-kpi-v" style="color:${c};${k.holiday?'font-size:20px':''}">${k.holiday?"إجازة":k.val+(k.raw?"":"%")}</div>
      <div class="hbar"><span style="flex:${Math.max(pct,0.01)};background:${c}"></span><span style="flex:${Math.max(100-pct,0.01)};background:var(--surface2)"></span></div>
      <div class="co-kpi-f">
        <span>${_esc(k.sub)}</span>
        ${k.target!=null?`<span class="t">${_svg('target')} الهدف: ${k.dir==="up"?"≥":"≤"}${k.target}%</span>`:""}
      </div>
    </div>`;
  };
  return `
    <div class="page-hero">
      <div class="page-hero-titles">
        <div class="page-hero-title"><span class="ph-ico">${_svg('sparkles')}</span> مؤشرات أداء النظافة</div>
        <div class="page-hero-sub">الالتزام بالجدول وجودة التوثيق وأداء المشرفين — لا مؤشّرات الصيانة</div>
      </div>
      <div class="page-hero-actions">
        <button class="btn btn-sm" onclick="cleaningOps.goOps()">${_svg('clipboardList')} تشغيل النظافة</button>
        ${canEdit()?`<button class="btn btn-sm" onclick="cleaningOps.goSupMap()">${_svg('users')} المشرفون والمناطق</button>`:""}
        <button class="btn btn-sm" onclick="cleaningOps.exportClientReport()">${_svg('fileText')} تصدير تقرير العميل</button>
        <button class="btn btn-sm" onclick="cleaningOps.refreshKPI()">${_svg('rotateCcw')} تحديث</button>
      </div>
    </div>
    <div class="co-kpis">${list.map(card).join("")}</div>
    <div class="co-hint" style="margin:4px 0 14px">
      المؤشّرات محسوبةٌ من جدول المهامّ وسجلّ التنفيذ لهذا الشهر. «تغطية اليوم» و«المناطق»
      لحظيّتان، والباقي تراكميٌّ منذ بداية الشهر.
    </div>
    ${supPerfHTML()}
    ${qualityTrendHTML()}`;
}

/* اتّجاهُ الجودة الشهري — يُعرض أسفلَ مؤشّرات النظافة، من جولات التفتيش */
function qualityTrendHTML(){
  const t=qualityTrend();
  const col=p=>p==null?"var(--muted)":(p>=85?"var(--sla-ok)":(p>=60?"var(--sla-warn)":"var(--sla-crit)"));
  const head=`<div class="co-sec"><div class="co-sec-t">${_svg('award')} اتّجاه الجودة — جولات التفتيش</div>
    <span class="co-sec-c">${t.roundsCount?t.roundsCount+" جولة":"لا جولاتٍ بعد"}</span></div>`;
  if(!t.roundsCount){
    return `<div class="card">${head}
      <div class="co-empty" style="padding:20px">${_svg('award')}
        <div class="co-empty-t">لا جولاتِ جودةٍ بعد</div>
        <div class="co-empty-s">جولةُ التفتيش تقيس **جودةَ النتيجة** (لا الالتزام بالجدول) — تُنتج اتّجاهاً شهريّاً يُعرض للعميل.</div>
        ${canQuality()?`<button class="btn btn-sm" style="margin-top:10px" onclick="cleaningOps.goQuality()">${_svg('award')} بدء جولة جودة</button>`:""}
      </div></div>`;
  }
  const cur=t.current;
  const bars=t.months.slice(-6).map(m=>`
    <div class="q-mbar" title="${_esc(m.ym)} — ${m.avg} ★">
      <div class="q-mbar-track"><span style="height:${Math.max(m.pct||0,3)}%;background:${col(m.pct)}"></span></div>
      <div class="q-mbar-p" style="color:${col(m.pct)}">${m.pct}%</div>
      <div class="q-mbar-l">${_esc(m.ym.slice(5))}</div>
    </div>`).join("");
  const weak=t.dims.slice(0,3).map(d=>`
    <div class="co-cov"><div class="co-cov-h"><span class="n">${_esc(d.name)}</span>
      <span class="p" style="color:${col(d.pct)}">${d.avg} ★ <small>(${d.pct}%)</small></span></div>
      <div class="hbar"><span style="flex:${Math.max(d.pct,0.01)};background:${col(d.pct)}"></span><span style="flex:${Math.max(100-d.pct,0.01)};background:var(--surface2)"></span></div></div>`).join("");
  return `<div class="card">${head}
    <div class="co-tiles" style="margin-bottom:12px">
      <div class="stat-tile" style="--_c:${col(cur&&cur.pct)}"><div class="st-val" style="color:${col(cur&&cur.pct)}">${cur?cur.avg+" ★":"—"}</div><div class="st-lbl">متوسّط جودة الشهر</div></div>
      <div class="stat-tile" style="--_c:${col(cur&&cur.pct)}"><div class="st-val" style="color:${col(cur&&cur.pct)}">${cur?cur.pct+"%":"—"}</div><div class="st-lbl">نسبة هذا الشهر</div></div>
      <div class="stat-tile" style="--_c:var(--primary)"><div class="st-val">${t.roundsCount}</div><div class="st-lbl">إجمالي الجولات</div></div>
    </div>
    <div class="co-sec-t" style="font-size:12px;margin-bottom:8px">الاتّجاه الشهري (آخر ٦ أشهر)</div>
    <div class="q-months">${bars}</div>
    ${weak?`<div class="co-sec-t" style="font-size:12px;margin:16px 0 8px">${_svg('alertTriangle')} أضعفُ أنواع العمل — أولويةُ التحسين</div>${weak}`:""}
  </div>`;
}
function mountKPI(){
  const host=document.getElementById("page-kpi");
  if(!host) return;
  if(!isCleaningProject()){ unmountKPI(); return; }
  let box=document.getElementById(KPI_ID);
  if(!box){ box=document.createElement("div"); box.id=KPI_ID; host.insertBefore(box, host.firstChild); }
  host.classList.add("co-kpi-mode");
  if(!_loaded || _loadedFor!==_projId() || _monthLog===null || !_roundsLoaded){
    box.innerHTML=`<div class="card"><div class="co-empty"><div class="co-empty-t">جارٍ حساب المؤشّرات…</div></div></div>`;
    Promise.all([loadTasks(), loadMonthLog(), loadRounds()]).then(()=>{
      const b=document.getElementById(KPI_ID);
      if(b && isCleaningProject()) _safeHTML(b, kpiHTML);
    }).catch(e=>console.warn("cleaningOps/mountKPI",e));
    return;
  }
  _safeHTML(box, kpiHTML);
}
function unmountKPI(){
  const host=document.getElementById("page-kpi");
  if(host) host.classList.remove("co-kpi-mode");
  const box=document.getElementById(KPI_ID);
  if(box) box.remove();
}
async function refreshKPI(){ await Promise.all([loadTasks(true), loadMonthLog(true)]); mountKPI(); _toast("✅ حُدِّثت المؤشّرات","success"); }

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
  // خيارا نوع الصيانة يبقيان بقيمتيهما المخزَّنتين (تصحيحية/وقائية) — نغيّر المعروض
  // فقط: في النظافة «تصحيحية» ملاحظةٌ تستدعي معالجة، و«وقائية» جولةٌ دوريةٌ مجدولة.
  ["صيانة تصحيحية",                       "ملاحظة / شكوى"],
  ["صيانة وقائية",                        "جولة دورية مجدولة"],
  ["ابدأ بتسجيل أول بلاغ صيانة",           "ابدأ بتسجيل أول ملاحظة نظافة"],
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
const RELABEL_SEL = ".page-hero-title,.page-hero-sub,.form-label,label,option,"+
  ".empty-title,.empty-sub,.te-title,.te-sub,h2,h3,button";
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
/* ════════════ v18.9ag — التقرير المصوّر **المجمّع** لأعمال النظافة ════════════
   الجذر: جدولُ النظافة يوميّ، فالشهرُ الواحد مئاتُ التنفيذات، وكلُّ تنفيذٍ حتى أربع
   صور. البطاقةُ لكل تنفيذٍ تُنتج ملفاً هائلاً: قياسُ تقريرٍ حقيقيٍّ مرفقٍ من المالك =
   ٢١٢ صورةً تشغل ١٧٫٤ من أصل ٢٠٫٤ ميجابايت (**٨٥٪ من الملف**) في ٤١ صفحةً فقط —
   وتقريرُ نظافةٍ شهريٌّ كاملٌ يتجاوز المئة ميجابايت فلا يُرسَل ولا يُفتَح.
   والعميلُ لا يطلب أربعمئة بطاقةٍ متطابقة، يطلب **إثباتَ الاستمرارية**.

   فالوضعُ الافتراضي لتقارير النظافة صار **مجمّعاً**: بطاقةٌ واحدةٌ لكل
   (مبنى × نوع عمل) تحمل عددَ التنفيذات وأيامَ العمل والفترةَ والمشرفَ ونسبةَ بنود
   الفحص، ومعها **ثلاثُ صورٍ موزّعةٌ على الفترة** (أوّلٌ · منتصفٌ · آخِر).

   الاختيارُ **حتميٌّ بالترتيب الزمني** لا عشوائيّ: نفسُ المدخلات ⇒ نفسُ الصور دائماً،
   فلا «إعادة سحبٍ» حتى تظهر أجملُ الصور (نفس مبدأ عيّنة الرقابة المالية في §3-أ).
   ونأخذ **صورةً واحدةً من كل تنفيذٍ أولاً** فيتوزّع الدليلُ على أيامٍ مختلفة، ولا
   نُكمل من بقيّة صور التنفيذ الواحد إلا إذا لم تكفِ التنفيذاتُ العدد.

   **لا تُحذَف صورةٌ من النظام إطلاقاً** — التغييرُ في العرض وحده، وكلُّ الصور تبقى
   في سجلّ التنفيذ وفي التخزين. و«مفصّل» يعيد السلوكَ القديم بطاقةً لكل تنفيذ. */
const AGG_PHOTOS_PER_CARD = 3;
function _recDate(r){ return String((r&&(r.date||r.at))||"").slice(0,10); }

/* اختيارُ صورِ البطاقة المجمّعة — حتميٌّ وموزَّعٌ على الفترة.
   الأولويةُ لتغطيةِ أيامٍ مختلفة: قائمةُ «أولى صورةِ كل تنفيذ» مرتَّبةً زمنياً، ثم
   عيّنةٌ متساويةُ التباعد منها (0 · المنتصف · الأخير عند n=3). فإن قلَّت التنفيذاتُ
   عن العدد المطلوب أكملنا من بقيّة صور التنفيذات — دليلٌ أكثرُ خيرٌ من فراغ. */
function _aggPickPhotos(recs, n){
  n = Math.max(0, Number(n)||0);
  if(!n || !Array.isArray(recs)) return [];
  const sorted = recs.slice().sort((a,b)=> String((a&&a.at)||_recDate(a)).localeCompare(String((b&&b.at)||_recDate(b))));
  const firsts=[], extras=[];
  sorted.forEach(r=>{
    const ph=((r&&r.photos)||[]).filter(Boolean);
    if(!ph.length) return;
    firsts.push({ url:ph[0], date:_recDate(r) });
    for(let i=1;i<ph.length;i++) extras.push({ url:ph[i], date:_recDate(r) });
  });
  if(firsts.length >= n){
    if(n===1) return [firsts[0]];
    const out=[];
    for(let i=0;i<n;i++) out.push(firsts[Math.round(i*(firsts.length-1)/(n-1))]);
    return out;
  }
  return firsts.concat(extras.slice(0, n-firsts.length));
}

/* مجموعةُ تنفيذاتٍ ⟵ بطاقةٌ مجمّعةٌ يفهمها التقرير المصوّر (عرضٌ فقط، بلا كتابة).
   المعرّفُ صناعيٌّ متسلسل (`AGG-1`) لا اسمُ المبنى: الاسمُ يدخل نصَّ `onclick`
   في النواة، وقد يحمل علامةَ اقتباسٍ تكسر السطر. */
function _aggAsTicket(g, idx){
  const days = Object.keys(g.days).sort();
  const picked = _aggPickPhotos(g.recs, AGG_PHOTOS_PER_CARD);
  const dateOf = {}; picked.forEach(p=>{ dateOf[p.url]=p.date; });
  const supNames = Object.keys(g.sups).sort((a,b)=>g.sups[b]-g.sups[a]);
  const floors = Object.keys(g.floors);
  const itemsPct = g.items.total ? Math.round(g.items.done/g.items.total*100) : null;
  const from = days[0]||"", to = days[days.length-1]||"";
  return {
    id: "AGG-"+(idx+1),
    createdAt: from ? from+"T00:00:00" : "", closedAt: to ? to+"T00:00:00" : "",
    building: g.building, location: floors.slice(0,3).join(" · "),
    workType: g.workType, maintType: "نظافة دورية",
    priority: "روتيني 🔵 (صيانة دورية)",
    supervisor: supNames[0]||"", tech: "",
    status: "مغلق",
    desc: g.workType+" — "+g.recs.length+" تنفيذاً على "+days.length+" يوم عمل",
    workDone: itemsPct==null ? "" : ("اكتمال بنود الفحص "+itemsPct+"٪"),
    photos: picked.map(p=>p.url), ticketPhoto: "",
    _cleaning: true, _agg: true,
    _aggRuns: g.recs.length, _aggDates: days, _aggFrom: from, _aggTo: to,
    _aggPhotoCount: g.photoCount, _aggItemsPct: itemsPct,
    _aggSups: supNames, _aggFloors: floors, _aggDateOf: dateOf
  };
}

/* التجميع: بطاقةٌ لكل (مبنى × نوع عمل). الترتيبُ بالمبنى ثم بالأكثر تنفيذاً —
   ترتيبٌ ثابتٌ لا يتغيّر بين تصديرين لنفس البيانات. */
function _aggregateLog(recs){
  const order=[], groups={};
  (Array.isArray(recs)?recs:[]).forEach(r=>{
    if(!r) return;
    const b=r.building||"—", w=r.workType||"—", k=b+" "+w;
    let g=groups[k];
    if(!g){ g=groups[k]={ building:b, workType:w, recs:[], days:{}, sups:{}, floors:{}, items:{done:0,total:0}, photoCount:0 }; order.push(k); }
    g.recs.push(r);
    const d=_recDate(r); if(d) g.days[d]=1;
    if(r.supervisor) g.sups[r.supervisor]=(g.sups[r.supervisor]||0)+1;
    if(r.floor) g.floors[r.floor]=1;
    g.items.done  += Number(r.doneItems)||0;
    g.items.total += Number(r.totalItems)||0;
    g.photoCount  += ((r.photos||[]).filter(Boolean)).length;
  });
  return order.map(k=>groups[k])
    .sort((a,b)=> a.building===b.building ? (b.recs.length-a.recs.length) : String(a.building).localeCompare(String(b.building),"ar"))
    .map(_aggAsTicket);
}

/* HTML البطاقة المجمّعة — تُستدعى من النواة (`renderPhotoReportOutput`) عند كل رسم،
   فتُبنى من `t.photos` الحيّة: حذفُ صورةٍ من البطاقة يظهر فوراً بلا حالةٍ مخبّأة.
   تستعير أصنافَ النواة (`pr-card` · `pr-photos-grid` · `pr-photo-wrap`) فتنطبق
   عليها أنماطُ الطباعة نفسُها بلا تكرار. */
function _aggCardHTML(t){
  const _u = s => { try{ return (typeof safeUrl==="function") ? safeUrl(s) : String(s||""); }catch(e){ return String(s||""); } };
  const _ic = w => { try{ return (typeof typeIcon==="function") ? typeIcon(w) : ""; }catch(e){ return ""; } };
  const photos=(Array.isArray(t.photos)?t.photos:[]).filter(Boolean);
  const cols=photos.length>=3?3:(photos.length||1);
  const dateOf=t._aggDateOf||{};
  const fmt=d=>String(d||"").slice(5).replace("-","/");
  const cells=photos.map((src,i)=>`<div class="pr-photo-wrap" style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#f0f4fb;border-radius:4px"><img src="${_u(src)}" onerror="window.imgBroken&&imgBroken(this)" onclick="openLightbox('${_u(src)}')" alt="صورة تنفيذ نظافة" style="max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;cursor:pointer;display:block">${dateOf[src]?`<div style="position:absolute;bottom:2px;right:2px;background:rgba(0,0,0,0.6);color:#fff;font-size:8px;padding:1px 4px;border-radius:3px">${_esc(fmt(dateOf[src]))}</div>`:""}<button class="pr-photo-del" onclick="removePhotoFromCard('${_esc(t.id)}','closing',${i})">✕</button></div>`).join("");
  const photoArea=photos.length
    ? `<div class="pr-photos-grid" style="display:grid;grid-template-columns:repeat(${cols},1fr);grid-auto-rows:1fr;gap:3px;flex:1;min-height:0;overflow:hidden">${cells}</div>`
    : `<div style="flex:1;display:flex;align-items:center;justify-content:center;background:#f8fafc;border-radius:6px;font-size:10px;color:#94a3b8">لا توجد صور</div>`;
  const cell=(lbl,val,col)=>`<div style="padding:8px 12px;border-left:1px solid #dde3ed;white-space:nowrap;display:flex;flex-direction:column;gap:2px"><span style="color:#94a3b8;font-size:9px">${lbl}</span><b style="color:${col||"#1b3a6b"};font-size:12px">${val}</b></div>`;
  const period=(t._aggFrom&&t._aggTo)?(t._aggFrom===t._aggTo?_esc(t._aggFrom):_esc(t._aggFrom)+" ← "+_esc(t._aggTo)):"—";
  const shown=(Array.isArray(t.photos)?t.photos.length:0), total=Number(t._aggPhotoCount)||0;
  return `<div class="pr-card" style="border:1.5px solid #dde3ed;border-radius:10px;overflow:hidden;display:flex;flex-direction:column;background:#fff;position:relative">
      <button class="photo-card-del" onclick="removeFromPhotoReport('${_esc(t.id)}')">🗑 حذف</button>
      <div style="background:#1b3a6b;color:#fff;padding:7px 12px;flex-shrink:0;display:flex;align-items:center;gap:8px">
        <div style="flex:1;min-width:0">
          <div><span style="font-size:13px;font-weight:900">🏢 ${_esc(t.building)}</span>
          <span style="font-size:10px;opacity:.75;margin-right:8px">${_ic(t.workType)} ${_esc(t.workType)}</span></div>
          ${t.location?`<div style="font-size:11px;opacity:.92;margin-top:2px">📍 ${_esc(t.location)}</div>`:""}
        </div>
        <span style="font-size:11px;background:rgba(255,255,255,.2);padding:2px 8px;border-radius:4px;white-space:nowrap;font-weight:700">${t._aggRuns} تنفيذ</span>
      </div>
      <div style="display:flex;align-items:stretch;gap:0;flex-shrink:0;border-bottom:1.5px solid #dde3ed;background:#f0f4fb;font-size:11px;overflow:hidden">
        ${cell("📅 الفترة", period)}
        ${cell("🔁 عدد التنفيذات", t._aggRuns, "#0a7c59")}
        ${cell("🗓 أيام العمل", (t._aggDates||[]).length)}
        ${cell("👤 المشرف", _esc((t._aggSups||[])[0]||"—"))}
      </div>
      <div style="padding:8px 12px;flex-shrink:0;border-bottom:1px solid #e8edf4">
        <div style="font-size:11px;color:#334155;line-height:1.5">${_esc(t.desc)}</div>
        ${t.workDone?`<div style="font-size:11px;color:#0a7c59;margin-top:3px;line-height:1.5">✅ ${_esc(t.workDone)}</div>`:""}
        ${total>shown?`<div style="font-size:10px;color:#94a3b8;margin-top:3px">🖼 ${shown} صورة معروضة من ${total} صورة موثَّقة في النظام</div>`:""}
      </div>
      <div style="padding:4px;flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden">
        ${photoArea}
      </div>
    </div>`;
}

/* فلتر «مصدر التقرير» — يُحقَن في فلاتر التقرير المصوّر لمشاريع النظافة وحدها.
   الكل | النظافة فقط | البلاغات فقط. ومعه فلترُ «شكل التقرير»: مجمّع | مفصّل. */
const PR_SRC_ID="co-pr-source";
const PR_SHAPE_ID="co-pr-shape";
function injectPhotoSourceFilter(){
  const wrap=document.querySelector("#page-photo-report .report-filters");
  const existing=document.getElementById(PR_SRC_ID);
  if(!wrap || !isCleaningProject()){
    if(existing && existing.parentElement) existing.parentElement.remove();
    const dead=document.getElementById(PR_SHAPE_ID);
    if(dead && dead.parentElement) dead.parentElement.remove();
    return;
  }
  if(!existing){
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
  // شكلُ التقرير — «مجمّع» هو الافتراضي: بطاقةٌ لكل (مبنى × نوع عمل) بثلاث صور،
  // مقابل بطاقةٍ لكل تنفيذٍ في «مفصّل» (ملفٌّ أضخم بعشرة أضعافٍ تقريباً).
  if(!document.getElementById(PR_SHAPE_ID)){
    const g2=document.createElement("div");
    g2.className="form-group"; g2.style.marginBottom="0";
    g2.innerHTML='<label class="form-label">شكل تقرير النظافة</label>'+
      '<select class="form-select" id="'+PR_SHAPE_ID+'">'+
        '<option value="agg">مجمّع — بطاقة لكل مبنى ونوع عمل (موصى به)</option>'+
        '<option value="full">مفصّل — بطاقة لكل تنفيذ (ملف أضخم)</option>'+
      '</select>';
    wrap.insertBefore(g2, wrap.firstChild);
    const sel2=g2.querySelector("select");
    if(sel2) sel2.onchange=()=>{ try{ generatePhotoReport(); }catch(e){} };
  }
}
function _prSource(){ const el=document.getElementById(PR_SRC_ID); return el?el.value:""; }
// غيابُ العنصر ⇒ «مجمّع»: الافتراضُ الآمن هو الأصغر، فلا يُفاجئ أحدٌ بملفٍّ ضخم.
function _prShape(){ const el=document.getElementById(PR_SHAPE_ID); return (el&&el.value)==="full" ? "full" : "agg"; }

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
      const matched=recs
        .filter(x=>(!rb||x.building===rb) && (!rt||x.workType===rt) && (!rs||(x.supervisor||"")===rs));
      // «مجمّع» (الافتراضي) يطوي مئاتِ التنفيذات في عشرات البطاقات بثلاث صورٍ لكلٍّ؛
      // «مفصّل» يُبقي بطاقةً لكل تنفيذٍ كما كان. الصورُ كلُّها تبقى في النظام في الحالتين.
      const extra = _prShape()==="full" ? matched.map(_logAsTicket) : _aggregateLog(matched);
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
      ${tile('target',      s.holiday?"إجازة":s.coverage+"%", "التغطية",  s.holiday?"var(--muted)":(s.coverage>=95?"var(--sla-ok)":(s.coverage>=70?"var(--sla-warn)":"var(--sla-crit)")))}
    </div>
    ${s.holiday?`<div class="ppm-overdue-banner" style="background:var(--surface2);color:var(--muted);border-color:var(--border)">
      <span class="co-bnr-ic">${_svg('calendar')}</span>
      <span>اليوم إجازة — الجمعة والسبت عطلةٌ في مشاريع النظافة، وتعود المهامّ يوم الأحد.</span></div>`:""}
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
      <div class="co-2col">${cov.map(b=>{
        const c=b.pct>=100?"var(--sla-ok)":(b.pct>=60?"var(--sla-warn)":"var(--sla-crit)");
        return `<div class="co-cov">
          <div class="co-cov-h"><span class="n">${_esc(b.name)}</span>
            <span class="p" style="color:${c}">${b.pct}% <small>(${b.done}/${b.sched})</small></span></div>
          <div class="hbar"><span style="flex:${Math.max(b.pct,0.01)};background:${c}"></span><span style="flex:${Math.max(100-b.pct,0.01)};background:var(--surface2)"></span></div>
        </div>`;
      }).join("")}</div>
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
  // v18.9wf: صلاحية «تشغيل النظافة» (permissions.cleaning عبر خريطة النواة) — الزرّ
  // يُحقن بعد applyPermissions فلا تحجبه النواة، لذا نقرأ حاجبها بأنفسنا. والنواة
  // تمنع فتح الصفحة مباشرةً عبر showPage (نفس المجموعة _blockedPages).
  const blocked = (window._blockedPages && typeof window._blockedPages.has==="function")
    ? window._blockedPages.has(PAGE_ID) : false;
  const shouldShow = canView() && isCleaningProject() && !blocked;
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

/* ══ إخفاء مجموعات القائمة الجانبية غير المتعلّقة بعقد النظافة ══
   في مشروع النظافة لا معنى لإدارة الأصول ولا المخزون ولا كتالوج البنود والأسعار ولا
   طلبات التسعير — تُخفى مجموعاتُها (الترويسة + الجسم) من القائمة الجانبية. **إخفاءُ عرضٍ
   فقط**: لا حذفَ بياناتٍ ولا لمسَ منطق؛ والمجموعات تعود كاملةً في مشاريع الصيانة/المشتريات
   (نستعيد فقط ما أخفيناه نحن — عبر وسمِ coHidden — فلا نمسّ مجموعةً مخفيّةً أصلاً كالعُهد).
   يُعاد التطبيق مع كل تبديلِ مشروعٍ لأن النواة تُعيد بناء القائمة (نفس سبب إعادة حقن الزرّ). */
const CLEANING_HIDDEN_GROUPS = ["assets","inventory","catalog","rfq"];
function applyNavGroupVisibility(){
  const hide=isCleaningProject();
  CLEANING_HIDDEN_GROUPS.forEach(g=>{
    ["hdr-grp-"+g, "grp-"+g].forEach(id=>{
      const el=document.getElementById(id);
      if(!el) return;
      if(hide){ el.dataset.coHidden="1"; el.style.setProperty("display","none","important"); }
      else if(el.dataset.coHidden){ el.style.removeProperty("display"); delete el.dataset.coHidden; }
    });
  });
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
    if(id==="kpi"){ try{ mountKPI(); }catch(e){ console.warn("cleaningOps/mountKPI",e); } }
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
      // تصفيرٌ كامل: أيُّ حالةٍ تبقى من المشروع السابق تُعرَض في الجديد خطأً.
      _tasks=[]; _loaded=false; _loadedFor=""; _loadPromise=null; _loading=false;
      _cfg={supervisorBuildings:{}}; _cfgFor="";   // خريطةُ مشرفي السابق لا تحكم الجديد
      _editing=null; _execFor=null; _execState=[]; _execPhotos=[];
      _detailFor=null; _detailLog=null;            // تفاصيلُ مهمةِ السابق لا تبقى معروضة
      _genForm=false; _genErr=""; _launchForm=false; _view="board"; closeBldTasks();
      _rounds=[]; _roundsLoaded=false; _roundsFor=""; _roundsPromise=null;   // جولاتُ السابق لا تبقى
      _editingRound=null; _roundPhotos=[]; _roundDetail=null;
      // ارفع لوحات النظافة فوراً عند مغادرة مشروع النظافة — قبل معرفة نوع الجديد
      unmountExec(); unmountDaily(); unmountKPI();
      _monthLog=null; _monthLogFor="";
      applyNavGroupVisibility();   // خروجاً: أعِد المجموعات فوراً قبل معرفة نوع الجديد
      ensureTypeKnown(()=>{
        injectSidebarButton();
        applyNavGroupVisibility();  // دخولاً: أخفِها إن كان الجديدُ نظافةً
        if(_onPage()) render();
        // أعِد تركيب الصفحة المعروضة حسب نوع المشروع الجديد
        const dash=document.getElementById("page-dashboard");
        if(dash && dash.classList.contains("active")) mountExec();
        const dly=document.getElementById("page-daily");
        if(dly && dly.classList.contains("active")) mountDaily();
        const kp=document.getElementById("page-kpi");
        if(kp && kp.classList.contains("active")) mountKPI();
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
#page-kpi.co-kpi-mode > *:not(#${KPI_ID}){display:none!important}
#${KPI_ID}{direction:rtl}
.co-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
.co-kpi{margin-bottom:0;position:relative;overflow:hidden;padding-top:16px}
.co-kpi::before{content:"";position:absolute;inset-block-start:0;inset-inline:0;height:4px;background:var(--_c,var(--primary))}
.co-kpi-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:6px}
.co-kpi-h .n{font-size:12.5px;font-weight:800;color:var(--text)}
.co-kpi-h .id{font-family:'JetBrains Mono',monospace;font-size:9.5px;color:var(--muted);font-weight:700}
.co-kpi-v{font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:900;line-height:1;margin-bottom:9px}
.co-kpi-f{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:7px;font-size:10.5px;color:var(--muted);font-weight:700}
.co-kpi-f .t{display:inline-flex;align-items:center;gap:4px}
/* أداء المشرفين — صفٌّ لكل مشرف: ترويسةٌ بالرتبة والاسم والدرجة، شريطٌ، ثم مقاييسُه */
.co-sup{padding:12px 0;border-bottom:1px solid var(--border)}
.co-sup:last-of-type{border-bottom:0;padding-bottom:2px}
.co-sup.orphan{opacity:.82}
.co-sup-h{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:8px}
.co-sup-h .rk{flex:0 0 auto;min-width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;
  border-radius:7px;background:var(--surface2);color:var(--muted);font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:900}
.co-sup-h .nm{font-size:13.5px;font-weight:900;color:var(--text);min-width:0;overflow-wrap:anywhere}
.co-sup-h .zn{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;color:var(--muted)}
.co-sup-h .sc{margin-inline-start:auto;font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:900;line-height:1}
.co-sup-ms{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:8px;margin-top:9px}
.co-sup-m{background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:7px 9px;min-width:0}
.co-sup-m .l{display:block;font-size:10px;font-weight:800;color:var(--muted);margin-bottom:2px;overflow-wrap:anywhere}
.co-sup-m .v{display:block;font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:900;line-height:1.15}
.co-sup-m .s{display:block;font-size:9.5px;font-weight:700;color:var(--muted);margin-top:2px;overflow-wrap:anywhere}
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
.co-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:12px;align-items:start}
.co-groups .co-group{margin-bottom:0;min-width:0}
/* شبكةٌ داخليةٌ للمهامّ داخل بطاقة المبنى: مبنًى واحدٌ يملأ العرض فتتوزّع مهامُّه على
   أعمدةٍ متعددة، وعدّةُ مبانٍ تتجاور فتصير مهامُّ كلٍّ عموداً واحداً — تكيُّفٌ تلقائيّ
   بلا نقطةِ كسرٍ ثابتة، فلا تنحشر البطاقات ولا تُهدَر مساحةُ الشاشة. */
.co-tasklist{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:8px;align-items:start}
.co-more-btn{width:100%;margin-top:8px;justify-content:center;font-weight:700}
/* شريطُ مرشِّحات «كل المهام» + مبدّل العرض — أزرارُ المنصة نفسها بحالة on واحدة.
   .co-chips-sp يدفع مبدّل العرض لطرف الشريط فينفصل بصرياً عن مرشِّحات الحالة. */
.co-chips{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
.co-chips-sp{flex:1 1 auto;min-width:8px}
.co-chip b{font-family:'JetBrains Mono',monospace;margin-inline-start:4px}
.co-chip.on{background:color-mix(in srgb,var(--primary) 12%,var(--surface));border-color:var(--primary);color:var(--primary);font-weight:800}
.co-chip.on b{color:var(--primary)}
.co-bld-badges{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
.co-bld-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:1200;display:flex;align-items:center;justify-content:center;padding:12px}
/* !important ضرورية: النواة تفرض width:100% !important على .card (قاعدة الداشبورد
   الجماعية) فتقهر أي عرضٍ عادي — وهي سببُ بقاء النافذة بعرض الشاشة رغم إصلاحَي wb/wc. */
.co-bld-modal{width:min(440px,96vw) !important;max-height:80vh;overflow-y:auto;margin:0}
.co-bld-back{flex:none}
.co-bld-modal .co-tasklist{grid-template-columns:1fr}
.co-bld-modal .co-sec{position:sticky;top:0;background:var(--surface);z-index:1;padding-top:2px}
.co-bld-close{margin-inline-start:auto;flex:none}
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
/* تاريخ استحقاق المهمة القادمة — في صفّ الشارات لا في صفّ البيانات: الأخير لا يلتفّ
   داخلياً فكان السطرُ الزائد يخنق البطاقة في نافذة المبنى الضيّقة (٤٤٠px). */
.co-pills .co-when{font-family:'JetBrains Mono',monospace;direction:ltr}
.co-pills .co-by svg,.co-pills .co-when svg{width:11px;height:11px;stroke-width:2.2}
/* الأزرار في سطرٍ مستقلٍّ أسفل البطاقة: مزاحمتُها للنصّ كانت تخنق العنوان في البطاقة
   الضيّقة (الأيقونة + النصّ + زرّان في 250px). الآن يأخذ النصُّ عرض البطاقة كاملاً. */
.co-card-act{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;
  margin-top:8px;padding-top:8px;border-top:1px dashed var(--border)}
.ppm-card.completed .co-card-t{color:var(--muted)}
.co-pane{max-width:760px}
.co-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
/* عمودان لقوائم التغطية والمهامّ المتأخّرة — عمود واحد على الجوال (الميديا أدناه) */
.co-2col{display:grid;grid-template-columns:1fr 1fr;gap:10px 18px;align-items:start}
.co-2col .co-cov{margin-bottom:0}
@media(max-width:560px){.co-grid2{grid-template-columns:1fr}.co-2col{grid-template-columns:1fr}}
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
.co-card-off{opacity:.62}

/* ── جولات الجودة ── */
.q-stars{display:inline-flex;gap:2px;font-size:19px;line-height:1;direction:ltr}
.q-star{color:var(--border);transition:color .1s}
.q-star.on{color:var(--sla-warn)}
.q-input .q-star{cursor:pointer;padding:1px;color:var(--muted)}
.q-input .q-star.on{color:var(--sla-warn)}
.q-input .q-star:hover{color:var(--sla-warn)}
.q-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 2px;border-bottom:1px dashed var(--border)}
.q-row:last-child{border-bottom:0}
.q-wt{font-size:12.5px;font-weight:700;color:var(--text)}
.co-live-score{display:flex;align-items:center;gap:10px;padding:11px 16px;font-size:13px;font-weight:700;color:var(--text)}
.co-live-score b{font-family:'JetBrains Mono',monospace;font-size:15px;color:var(--primary)}
.co-live-score small{color:var(--muted);font-weight:700}
.q-months{display:flex;gap:10px;align-items:flex-end}
.q-mbar{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0}
.q-mbar-track{width:100%;max-width:46px;height:84px;background:var(--surface2);border-radius:8px;display:flex;align-items:flex-end;overflow:hidden}
.q-mbar-track span{width:100%;display:block;border-radius:8px 8px 0 0;transition:height .3s}
.q-mbar-p{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:900}
.q-mbar-l{font-size:10.5px;color:var(--muted);font-weight:700}

`;
  document.head.appendChild(st);
}

function init(){
  ensurePage();
  hookShowPage();
  hookProjectModals();
  hookRepopulate();
  hookPhotoReport();
  ensureTypeKnown(()=>{ injectSidebarButton(); applyNavGroupVisibility(); _prefetch(); });
  injectSidebarButton();
  applyNavGroupVisibility();
  _prefetch();
  _watchProject();
  // القائمة الجانبية يُعاد بناؤها بعد الدخول/تبديل المشروع — أعِد الحقن عند التغيير
  const obs=new MutationObserver(()=>{ injectSidebarButton(); applyNavGroupVisibility(); hookShowPage(); hookProjectModals(); hookRepopulate(); hookPhotoReport(); injectPhotoSourceFilter(); });
  obs.observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
else init();

/* ════════════ الواجهة العامة ════════════ */
/* ★ v18.9aj — حسابُ لوحة اليوم لقائمةِ مهامّ مشروعٍ آخر (مركز العمليات).
   نفس boardStats/coverageByBuilding حرفياً — لا حسابَ ثانياً — داخل سياق النظافة. */
function statsForTasks(list){    return _inCleanCtx(()=>boardStats(Array.isArray(list)?list:[])); }
function coverageForTasks(list){ return _inCleanCtx(()=>coverageByBuilding(Array.isArray(list)?list:[])); }
function splitTasks(list){
  const arr=Array.isArray(list)?list:[];
  return _inCleanCtx(()=>({
    active:  arr.filter(t=>!isDisabled(t)),
    due:     arr.filter(t=>!isDisabled(t) && isDue(t)),
    overdue: arr.filter(t=>!isDisabled(t) && isOverdue(t)),
    done:    arr.filter(t=>!isDisabled(t) && doneToday(t))
  }));
}

window.cleaningOps = {
  isCleaningProjectRec, tasksColOf, statsForTasks, coverageForTasks, splitTasks, overdueDaysOf: overdueDays,
  render, setView, setAllMode, setAllFilter, refresh, toggleGen, doGen, genModeChanged, openBldTasks, closeBldTasks, bldBack,
  toggleLaunch, doLaunch, onBuildingRenamed, onSupervisorRenamed,
  addTask, editTask, cancelEdit, saveEdit, removeTask, onBuildingChange,
  exec, toggleItem, cancelExec, confirmExec, pickPhoto, delPhoto:delExecPhoto,
  openDetail, closeDetail,
  saveSupMap, goSupMap,
  newRound, cancelRound, toggleRoundBuilding, setStar, saveRoundForm, openRound, closeRound, removeRound,
  pickRoundPhoto, delRoundPhoto, goQuality, exportClientReport, printRound,
  mountExec, unmountExec, refreshExec, goOps,
  mountDaily, unmountDaily, refreshDaily, mountKPI, unmountKPI, refreshKPI, seedWorkTypes, relabelPage, injectPhotoSourceFilter,
  _aggCardHTML: _aggCardHTML,   // تستدعيها النواة لرسم البطاقة المجمّعة
  startSync(){ /* لا مزامنة مستقلة — القراءة بـ .get() عند العرض (انضباط المستمعين) */ },
  version: VERSION,
  build: MODULE_BUILD,
  // مكشوفة لفحوص hail-tests (دوال نقية)
  _boardStats: boardStats,
  _coverageByBuilding: coverageByBuilding, _cleaningKPIs: cleaningKPIs, _supOfBuilding: supOfBuilding,
  _logAsTicket: _logAsTicket, _taskSupervisor: taskSupervisor,
  _aggregateLog: _aggregateLog, _aggPickPhotos: _aggPickPhotos, _aggAsTicket: _aggAsTicket,
  _AGG_PHOTOS_PER_CARD: AGG_PHOTOS_PER_CARD,
  _supervisorPerf: supervisorPerf, _logSupervisor: logSupervisor,
  _unassignedBuildings: unassignedBuildings,
  _roundScore: roundScore, _qualityTrend: qualityTrend, _QUALITY_STARS: QUALITY_STARS,
  _buildClientReportHTML: buildClientReportHTML, _monthName: _monthName,
  _buildRoundReportHTML: buildRoundReportHTML,
  _SUP_WEIGHTS: SUP_WEIGHTS, _SUP_UNASSIGNED: SUP_UNASSIGNED,
  _salvageObjects: _salvageObjects, _genPrompt: _genPrompt, _launchTargets: _launchTargets,
  _cappedTaskListHTML: _cappedTaskListHTML, _BOARD_CARDS_PER_BLD: BOARD_CARDS_PER_BLD, _bldOrder: _bldOrder,
  _allBldListHTML: _allBldListHTML, _ALL_CARDS_PER_BLD: ALL_CARDS_PER_BLD, _allGroupsHTML: _allGroupsHTML,
  _schedClass: schedClass, _schedSort: schedSort, _allPass: allPass, _dueIn: _dueIn,
  _svg: _svg,
  _relabelText: _relabelText, _RELABEL: RELABEL, _WT_SEED: CLEANING_WT_SEED,
  _isDue: isDue, _isOverdue: isOverdue, _doneToday: doneToday, _dueStatus: dueStatus,
  _addDays: _addDays, _today: _today,
  _isWeekend: _isWeekend, _nextWorkingDay: _nextWorkingDay, _advanceDue: _advanceDue, _overdueWorkingDays: _overdueWorkingDays,
  _FREQ_DAYS: FREQ_DAYS,
  _WORK_TYPES: CLEANING_WORK_TYPES,
  // فحوصُ الصلاحية تنفيذاً لا نصّاً: تُقرأ من `currentUser` الحيّ في الحاضنة
  _canEdit: canEdit, _canExecute: canExecute, _canQuality: canQuality
};

})();
