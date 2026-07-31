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
function _svg(name){ try{ return (typeof _svgIcon==="function") ? _svgIcon(name) : ""; }catch(e){ return ""; } }
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
async function loadTasks(force){
  const database=_db(), col=tasksCol();
  if(!database || !col){ _tasks=[]; _loaded=true; return; }
  if(_loading) return;
  if(_loaded && _loadedFor===_projId() && !force) return;
  _loading=true;
  try{
    const snap = await database.collection(col).limit(500).get();
    _tasks = snap.docs.map(d=>Object.assign({id:d.id}, d.data()||{}));
    _loaded=true; _loadedFor=_projId();
  }catch(e){
    console.warn("cleaningOps/loadTasks",e);
    _toast("⚠ تعذّر تحميل جدول النظافة","warn");
    _tasks=[]; _loaded=true;
  }finally{ _loading=false; }
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
  const active=(Array.isArray(list)?list:_tasks).filter(t=>!isDisabled(t));
  const done  = active.filter(doneToday);
  const due   = active.filter(isDue);
  const over  = active.filter(isOverdue);
  const scheduled = done.length + due.length;
  const coverage  = scheduled>0 ? Math.round((done.length/scheduled)*100) : 0;
  return { total:active.length, done:done.length, due:due.length, overdue:over.length, scheduled, coverage };
}

function dueStatus(t){
  if(isDisabled(t)) return { lbl:"موقوفة", color:"var(--muted)", sort:9 };
  if(doneToday(t))  return { lbl:"نُفِّذت اليوم", color:"var(--accent)", sort:3 };
  const diff=_dayDiff(String(t.nextDueDate||"").slice(0,10), _today());
  if(diff<0)  return { lbl:"متأخّرة "+Math.abs(diff)+" يوم", color:"var(--danger)", sort:0 };
  if(diff===0)return { lbl:"مستحقّة اليوم", color:"var(--warn)", sort:1 };
  return { lbl:"بعد "+diff+" يوم", color:"var(--muted)", sort:2 };
}

/* ════════════ التنفيذ ════════════ */
// تنفيذ المهمة: يُسجَّل في سجلّ التنفيذ (للتغطية والتاريخ) ثم يُقدَّم الاستحقاق التالي
// بمقدار تكرارها من **اليوم** (لا من الاستحقاق السابق) — فالمهمة المتأخّرة لا تتراكم
// استحقاقاتها الفائتة بلا معنى في عملٍ يوميٍّ متكرّر.
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
      date: _today(), at: now, by: _userName(),
      doneItems: doneCount, totalItems: list.length,
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
function render(){
  ensurePage();
  const el=document.getElementById("page-"+PAGE_ID);
  if(!el) return;
  if(!isCleaningProject()){
    el.innerHTML = `<div class="co-head"><h2 class="co-title">${_icon('sparkles')} تشغيل النظافة</h2></div>
      <div class="co-empty">هذا القسم يظهر لمشاريع <b>«إدارة نظافة»</b> فقط.<br>
      صنّف المشروع من: الإدارة › تعديل المشروع › نوع المشروع = «إدارة نظافة».</div>`;
    return;
  }
  if(!_loaded || _loadedFor!==_projId()){
    el.innerHTML = `<div class="co-head"><h2 class="co-title">${_icon('sparkles')} تشغيل النظافة</h2></div>
      <div class="co-empty">جارٍ تحميل جدول النظافة…</div>`;
    loadTasks().then(()=>{ if(_onPage()) render(); });
    return;
  }
  if(_editing) { renderEditor(el); return; }
  if(_execFor) { renderExec(el); return; }
  el.innerHTML = headerHTML() + (_genForm ? genFormHTML() : "") +
                 (_view==="board" ? boardHTML() : allTasksHTML());
}
function _onPage(){ const pg=document.getElementById("page-"+PAGE_ID); return !!pg && pg.classList.contains("active"); }

function headerHTML(){
  const p=_proj();
  return `
    <div class="co-head">
      <h2 class="co-title">${_icon('sparkles')} تشغيل النظافة ${p?`<span class="co-projname">— ${_esc(p.name||p.id)}</span>`:""}</h2>
      <div class="co-sub">الجدول اليومي للمهام الدورية — المناطق من مباني المشروع وأدواره</div>
      <div class="co-tools">
        <button class="btn btn-ghost btn-sm ${_view==='board'?'co-on':''}" onclick="cleaningOps.setView('board')">${_icon('dashboard')} لوحة اليوم</button>
        <button class="btn btn-ghost btn-sm ${_view==='all'?'co-on':''}" onclick="cleaningOps.setView('all')">${_icon('clipboardList')} كل المهام</button>
        ${canEdit()?`<button class="btn btn-primary btn-sm" onclick="cleaningOps.addTask()">${_icon('plus')} مهمة جديدة</button>`:""}
        ${canEdit()?`<button class="btn btn-ghost btn-sm" onclick="cleaningOps.toggleGen()">${_icon('sparkles')} توليد الجدول بالذكاء الاصطناعي</button>`:""}
        <button class="btn btn-ghost btn-sm" onclick="cleaningOps.refresh()">${_icon('rotateCcw')} تحديث</button>
      </div>
    </div>`;
}

/* ── لوحة اليوم ── */
function boardHTML(){
  const s=boardStats();
  const covColor = s.coverage>=95 ? "var(--accent)" : (s.coverage>=70 ? "var(--warn)" : "var(--danger)");
  const card=(lbl,val,sc,sub)=>`
    <div class="stat-card" style="--sc:${sc}">
      <div class="sl">${lbl}</div>
      <div class="sv">${val}</div>
      ${sub?`<div class="click-hint">${sub}</div>`:""}
    </div>`;

  if(!_tasks.length){
    return `<div class="co-empty">لا توجد مهام نظافة بعد.<br>
      ${canEdit()?'أضف مهمة يدوياً، أو استخدم <b>«توليد الجدول بالذكاء الاصطناعي»</b> ليقترح لك جدولاً كاملاً تعدّله بعدها.':'لم يُنشئ الأدمن جدول المهام بعد.'}</div>`;
  }

  // مجموعات حسب المبنى (المنطقة) — المستحقّ والمتأخّر أولاً
  const active=_tasks.filter(t=>!isDisabled(t));
  const todays=active.filter(t=>isDue(t)||doneToday(t));
  const byB={};
  todays.forEach(t=>{ const b=t.building||"— بلا مبنى —"; (byB[b]=byB[b]||[]).push(t); });
  const groups=Object.keys(byB).sort().map(b=>{
    const list=byB[b].slice().sort((x,y)=>dueStatus(x).sort-dueStatus(y).sort);
    const d=list.filter(doneToday).length;
    return `
      <div class="co-group">
        <div class="co-group-h">
          <span>${_icon('building2')} ${_esc(b)}</span>
          <span class="co-group-c" style="color:${d===list.length?'var(--accent)':'var(--muted)'}">${d}/${list.length} منجزة</span>
        </div>
        <div class="co-rows">${list.map(taskRowHTML).join("")}</div>
      </div>`;
  }).join("");

  return `
    <div class="co-stats">
      ${card("مجدول اليوم", s.scheduled, "var(--primary)", "من "+s.total+" مهمة نشطة")}
      ${card("نُفِّذ اليوم", s.done, "var(--accent)", "")}
      ${card("متبقٍّ اليوم", s.due, s.due>0?"var(--warn)":"var(--accent)", s.overdue>0?s.overdue+" منها متأخّرة":"")}
      ${card("نسبة التغطية", s.coverage+"%", covColor, "المنفَّذ ÷ المجدول")}
    </div>
    <div class="co-progress"><div class="co-progress-fill" style="width:${Math.min(s.coverage,100)}%;background:${covColor}"></div></div>
    ${s.overdue>0?`<div class="co-alert">${_icon('alertTriangle')} ${s.overdue} مهمة متأخّرة عن استحقاقها — فجوةُ تغطيةٍ تحتاج معالجةً اليوم.</div>`:""}
    ${todays.length? groups : `<div class="co-empty">لا مهام مستحقّة اليوم — كل المهام ضمن مواعيدها. ✅</div>`}`;
}

function taskRowHTML(t){
  const st=dueStatus(t);
  const list=Array.isArray(t.checklist)?t.checklist:[];
  const done=doneToday(t);
  return `
    <div class="co-row ${done?'co-row-done':''}">
      <div class="co-row-main">
        <div class="co-row-name">${_icon(iconOf(t.workType))} ${_esc(t.name||"مهمة")}</div>
        <div class="co-row-meta">
          ${t.floor?_esc(t.floor)+" • ":""}${_esc(t.workType||"")} • ${_esc(t.freq||"")}
          ${list.length?` • ${list.length} بند فحص`:""}
          ${t.assignee?` • ${_icon('user')} ${_esc(t.assignee)}`:""}
        </div>
      </div>
      <div class="co-row-side">
        <span class="badge" style="background:var(--surface2);color:${st.color}">${st.lbl}</span>
        ${done
          ? `<span class="co-done-by">${_icon('checkCircle')} ${_esc(t.lastExecutedBy||"")}</span>`
          : (canExecute()?`<button class="btn btn-primary btn-sm" onclick="cleaningOps.exec('${_esc(t.id)}')">${_icon('checkCircle')} تنفيذ</button>`:"")}
        ${canEdit()?`<button class="btn btn-ghost btn-sm" onclick="cleaningOps.editTask('${_esc(t.id)}')">${_icon('edit')}</button>`:""}
      </div>
    </div>`;
}
function iconOf(wt){ const w=CLEANING_WORK_TYPES[wt]; return w?w.icon:"sparkles"; }

/* ── كل المهام ── */
function allTasksHTML(){
  if(!_tasks.length) return `<div class="co-empty">لا توجد مهام نظافة بعد.</div>`;
  const rows=_tasks.slice().sort((a,b)=>{
    const c=String(a.building||"").localeCompare(String(b.building||""),"ar");
    return c!==0 ? c : dueStatus(a).sort-dueStatus(b).sort;
  }).map(t=>{
    const st=dueStatus(t);
    const list=Array.isArray(t.checklist)?t.checklist:[];
    return `<tr class="${isDisabled(t)?'co-tr-off':''}">
      <td class="co-td-name">${_icon(iconOf(t.workType))} ${_esc(t.name||"")}</td>
      <td>${_esc(t.building||"—")}${t.floor?" / "+_esc(t.floor):""}</td>
      <td>${_esc(t.workType||"—")}</td>
      <td>${_esc(t.freq||"—")}</td>
      <td class="co-num">${list.length}</td>
      <td>${t.lastExecuted?_esc(String(t.lastExecuted).slice(0,10)):"—"}</td>
      <td style="color:${st.color}">${st.lbl}</td>
      <td>${canEdit()?`<button class="btn btn-ghost btn-sm" onclick="cleaningOps.editTask('${_esc(t.id)}')">${_icon('edit')}</button>`:""}</td>
    </tr>`;
  }).join("");
  return `<div class="co-table-wrap"><table class="co-table">
    <thead><tr><th>المهمة</th><th>المنطقة</th><th>نوع العمل</th><th>التكرار</th><th>بنود</th><th>آخر تنفيذ</th><th>الحالة</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

/* ── محرّر المهمة ── */
function renderEditor(el){
  const t=_editing;
  const isNew=!_tasks.some(x=>x.id===t.id);
  const blds=_buildings();
  const floors=_floorsOf(t.building);
  const opt=(arr,sel)=>arr.map(v=>`<option value="${_esc(v)}" ${v===sel?'selected':''}>${_esc(v)}</option>`).join("");
  const list=Array.isArray(t.checklist)?t.checklist:[];
  el.innerHTML = `
    <div class="co-head">
      <button class="btn btn-ghost btn-sm" onclick="cleaningOps.cancelEdit()">${_icon('folderOpen')} رجوع للجدول</button>
      <h2 class="co-title">${_icon(isNew?'plus':'edit')} ${isNew?"مهمة نظافة جديدة":"تعديل المهمة"}</h2>
    </div>
    <div class="co-form">
      <div class="co-f"><label>اسم المهمة</label>
        <input class="form-input" id="co-name" value="${_esc(t.name||"")}" placeholder="مثال: تنظيف وتعقيم دورات المياه"></div>
      <div class="co-f2">
        <div class="co-f"><label>المبنى (المنطقة)</label>
          <select class="form-input" id="co-bld" onchange="cleaningOps.onBuildingChange(this.value)">
            <option value="">— اختر —</option>${opt(blds, t.building)}
          </select></div>
        <div class="co-f"><label>الدور / الموقع</label>
          ${floors.length
            ? `<select class="form-input" id="co-floor"><option value="">— كل الأدوار —</option>${opt(floors, t.floor)}</select>`
            : `<input class="form-input" id="co-floor" value="${_esc(t.floor||"")}" placeholder="اختياري">`}
        </div>
      </div>
      <div class="co-f2">
        <div class="co-f"><label>نوع العمل</label>
          <select class="form-input" id="co-wt">${opt(WT_KEYS, t.workType||WT_KEYS[0])}</select></div>
        <div class="co-f"><label>التكرار</label>
          <select class="form-input" id="co-freq">${opt(FREQ_KEYS, t.freq||"يومي")}</select></div>
      </div>
      <div class="co-f2">
        <div class="co-f"><label>المسؤول (اختياري)</label>
          <input class="form-input" id="co-assignee" value="${_esc(t.assignee||"")}" placeholder="اسم العامل/المشرف"></div>
        <div class="co-f"><label>تاريخ أول/تالي تنفيذ</label>
          <input class="form-input" type="date" id="co-due" value="${_esc(String(t.nextDueDate||_today()).slice(0,10))}"></div>
      </div>
      <div class="co-f"><label>وصف مختصر (اختياري)</label>
        <input class="form-input" id="co-desc" value="${_esc(t.desc||"")}"></div>
      <div class="co-f"><label>بنود قائمة الفحص — بندٌ في كل سطر</label>
        <textarea class="form-input" id="co-checklist" rows="6" placeholder="تعقيم الأحواض&#10;تنظيف المرايا&#10;تعبئة الصابون والمناديل&#10;تجفيف الأرضية">${_esc(list.join("\n"))}</textarea></div>
      <label class="co-chk"><input type="checkbox" id="co-disabled" ${t.disabled?'checked':''}> إيقاف المهمة مؤقّتاً (تبقى محفوظة ولا تظهر في لوحة اليوم)</label>
      <div class="co-tools">
        <button class="btn btn-primary btn-sm" onclick="cleaningOps.saveEdit()">${_icon('checkCircle')} حفظ</button>
        <button class="btn btn-ghost btn-sm" onclick="cleaningOps.cancelEdit()">إلغاء</button>
        ${!isNew?`<button class="btn btn-ghost btn-sm co-del" onclick="cleaningOps.removeTask()">${_icon('trash')} حذف المهمة</button>`:""}
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
  el.innerHTML = `
    <div class="co-head">
      <button class="btn btn-ghost btn-sm" onclick="cleaningOps.cancelExec()">${_icon('folderOpen')} رجوع للجدول</button>
      <h2 class="co-title">${_icon('checkCircle')} تنفيذ: ${_esc(t.name||"")}</h2>
      <div class="co-sub">${_esc(t.building||"")}${t.floor?" / "+_esc(t.floor):""} • ${_esc(t.workType||"")} • ${_esc(t.freq||"")}</div>
    </div>
    <div class="co-form">
      ${list.length?`<div class="co-ck-head"><span>${doneN} / ${list.length} بند</span><span>${pct}%</span></div>
      <div class="co-progress"><div class="co-progress-fill" style="width:${pct}%;background:${pct===100?'var(--accent)':'var(--warn)'}"></div></div>`:""}
      <div class="co-ck-list">${items}</div>
      <div class="co-f"><label>ملاحظة (اختياري)</label>
        <input class="form-input" id="co-exec-note" placeholder="أي ملاحظة على التنفيذ"></div>
      <div class="co-tools">
        <button class="btn btn-primary btn-sm" onclick="cleaningOps.confirmExec()">${_icon('checkCircle')} تسجيل التنفيذ</button>
        <button class="btn btn-ghost btn-sm" onclick="cleaningOps.cancelExec()">إلغاء</button>
      </div>
      <div class="co-hint">التسجيل ينقل الاستحقاق التالي بمقدار تكرار المهمة من اليوم، ويُحفظ في سجلّ التنفيذ.</div>
    </div>`;
}

/* ── نموذج التوليد بالذكاء الاصطناعي ── */
function genFormHTML(){
  const blds=_buildings();
  return `
    <div class="co-gen">
      <div class="co-gen-h">${_icon('sparkles')} توليد جدول مهام النظافة بالذكاء الاصطناعي</div>
      <div class="co-f2">
        <div class="co-f"><label>المبنى المستهدف</label>
          <select class="form-input" id="co-gen-bld">
            <option value="">— كل المباني —</option>
            ${blds.map(b=>`<option value="${_esc(b)}">${_esc(b)}</option>`).join("")}
          </select></div>
        <div class="co-f"><label>نوع المبنى/النشاط</label>
          <input class="form-input" id="co-gen-kind" placeholder="مثال: مبنى إداري ٤ أدوار، دورتا مياه لكل دور"></div>
      </div>
      <div class="co-f"><label>ملاحظات إضافية (اختياري)</label>
        <input class="form-input" id="co-gen-notes" placeholder="مثال: لوبي بمساحة كبيرة، واجهة زجاجية، موقف سيارات"></div>
      <div class="co-tools">
        <button class="btn btn-primary btn-sm" id="co-gen-btn" onclick="cleaningOps.doGen()">${_icon('sparkles')} توليد</button>
        <button class="btn btn-ghost btn-sm" onclick="cleaningOps.toggleGen()">إلغاء</button>
      </div>
      ${_genErr?`<div class="co-alert">${_icon('alertTriangle')} ${_esc(_genErr)}</div>`:""}
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
      "أعطِ بين 8 و 16 مهمة تغطّي المناطق الرئيسية، بأسماء عربية مختصرة، ولكل مهمة "+
      "بين 3 و 6 بنود فحصٍ عملية ومحدّدة.\n"+
      "اجعل مهام دورات المياه والأرضيات والنفايات «يومي»، والزجاج والأثاث «أسبوعي»، "+
      "والنظافة العميقة «شهري» أو «ربع سنوي».\n"+
      "أعِد JSON فقط بلا أي شرح، بهذا الشكل تماماً:\n"+
      '{"tasks":[{"name":"اسم المهمة","workType":"نظافة دورات المياه","freq":"يومي","floor":"","checklist":["بند","بند"]}]}';
    let tasks=null, lastErr="";
    for(let attempt=1; attempt<=2 && !tasks; attempt++){
      let txt="";
      try{ txt=await _aiText([{role:"user",content:prompt}], {maxTokens:2500, temperature:0.3, feature:"جدول النظافة"}); }
      catch(err){ lastErr=(err&&err.message)||"تعذّر الاتصال بالذكاء الاصطناعي"; console.warn("cleaningOps/doGen#"+attempt,err); continue; }
      const j=_extractJSON(txt);
      if(j && Array.isArray(j.tasks) && j.tasks.length){
        tasks=j.tasks.slice(0,30).map(x=>({
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
function setView(v){ _view=v; render(); }
function toggleGen(){ _genForm=!_genForm; _genErr=""; render(); }
async function refresh(){ await loadTasks(true); render(); _toast("✅ حُدِّث الجدول","success"); }

function addTask(){
  _editing = { id:_uid(), name:"", building:"", floor:"", workType:WT_KEYS[0], freq:"يومي",
    assignee:"", desc:"", checklist:[], nextDueDate:_today(), lastExecuted:"", lastExecutedBy:"",
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
  render();
}
function toggleItem(i,on){ _execState[i]=!!on; render(); }
function cancelExec(){ _execFor=null; _execState=[]; render(); }
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
  if(ok){ _execFor=null; _execState=[]; _toast("✅ سُجِّل التنفيذ","success"); render(); }
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
      ensureTypeKnown(()=>{ injectSidebarButton(); if(_onPage()) render(); });
    }
  }, 1500);
}

function injectCSS(){
  if(document.getElementById("co-css")) return;
  const st=document.createElement("style"); st.id="co-css";
  // يعيد استخدام توكنز النظام وكلاساته (.stat-card/.btn/.badge/.form-input) فيطابق الثيمين.
  st.textContent = `
#page-${PAGE_ID}{direction:rtl}
.co-head{margin-bottom:16px}
.co-title{font-size:19px;font-weight:800;font-family:'Cairo',sans-serif;color:var(--primary);margin:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.co-projname{font-size:13px;font-weight:700;color:var(--muted)}
.co-sub{font-size:12px;color:var(--muted);margin-top:5px}
.co-tools{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.co-tools .co-on{background:var(--surface2);color:var(--primary);font-weight:800}
.co-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:14px}
.co-stats .stat-card{cursor:default}
.co-stats .sv{font-variant-numeric:tabular-nums;direction:ltr;text-align:right}
.co-progress{height:12px;background:var(--surface2);border-radius:20px;overflow:hidden;margin-bottom:14px}
.co-progress-fill{height:100%;border-radius:20px;transition:width .4s}
.co-alert{background:color-mix(in srgb,var(--danger) 12%,transparent);border:1px solid var(--danger);color:var(--danger);border-radius:12px;padding:10px 14px;font-size:12.5px;font-weight:700;margin-bottom:14px;display:flex;align-items:center;gap:8px}
.co-empty{text-align:center;color:var(--muted);padding:44px;font-size:13px;line-height:2}
.co-hint{font-size:11.5px;color:var(--muted);margin-top:10px;line-height:1.9}
.co-group{background:var(--surface);border:1px solid var(--border);border-radius:14px;margin-bottom:14px;overflow:hidden}
.co-group-h{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:11px 14px;background:var(--surface2);font-size:13px;font-weight:800;font-family:'Cairo',sans-serif;color:var(--primary)}
.co-group-c{font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums}
.co-rows{display:flex;flex-direction:column}
.co-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 14px;border-top:1px solid var(--border);flex-wrap:wrap}
.co-row-done{opacity:.62}
.co-row-main{min-width:0;flex:1}
.co-row-name{font-size:13px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:7px}
.co-row-meta{font-size:11px;color:var(--muted);margin-top:3px}
.co-row-side{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.co-done-by{font-size:11px;color:var(--accent);font-weight:700;display:flex;align-items:center;gap:4px}
.co-form{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;max-width:720px}
.co-f{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}
.co-f label{font-size:11.5px;font-weight:700;color:var(--muted)}
.co-f2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:560px){.co-f2{grid-template-columns:1fr}}
.co-chk{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);margin-bottom:12px;cursor:pointer}
.co-del{color:var(--danger)}
.co-ck-head{display:flex;justify-content:space-between;font-size:11.5px;font-weight:700;color:var(--muted);margin-bottom:6px}
.co-ck-list{display:flex;flex-direction:column;gap:2px;margin-bottom:14px}
.co-ck{display:flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid var(--border);border-radius:10px;font-size:12.5px;cursor:pointer;background:var(--surface2)}
.co-ck input{width:17px;height:17px;cursor:pointer;flex:none}
.co-gen{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;max-width:720px;margin-bottom:16px}
.co-gen-h{font-size:13.5px;font-weight:800;font-family:'Cairo',sans-serif;color:var(--primary);margin-bottom:12px;display:flex;align-items:center;gap:7px}
.co-table-wrap{overflow-x:auto;background:var(--surface);border:1px solid var(--border);border-radius:14px}
.co-table{width:100%;border-collapse:collapse;font-size:12.5px;min-width:760px}
.co-table th{background:var(--surface2);padding:10px 12px;text-align:right;font-weight:800;color:var(--primary);font-size:11.5px;white-space:nowrap}
.co-table td{padding:10px 12px;border-top:1px solid var(--border);color:var(--text)}
.co-td-name{font-weight:700;display:flex;align-items:center;gap:7px}
.co-num{font-variant-numeric:tabular-nums;direction:ltr;text-align:right}
.co-tr-off{opacity:.5}
`;
  document.head.appendChild(st);
}

function init(){
  ensurePage();
  hookShowPage();
  ensureTypeKnown(()=>injectSidebarButton());
  injectSidebarButton();
  _watchProject();
  // القائمة الجانبية يُعاد بناؤها بعد الدخول/تبديل المشروع — أعِد الحقن عند التغيير
  const obs=new MutationObserver(()=>{ injectSidebarButton(); hookShowPage(); });
  obs.observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
else init();

/* ════════════ الواجهة العامة ════════════ */
window.cleaningOps = {
  render, setView, refresh, toggleGen, doGen,
  addTask, editTask, cancelEdit, saveEdit, removeTask, onBuildingChange,
  exec, toggleItem, cancelExec, confirmExec,
  startSync(){ /* لا مزامنة مستقلة — القراءة بـ .get() عند العرض (انضباط المستمعين) */ },
  version: VERSION,
  build: MODULE_BUILD,
  // مكشوفة لفحوص hail-tests (دوال نقية)
  _boardStats: boardStats,
  _isDue: isDue, _isOverdue: isOverdue, _doneToday: doneToday, _dueStatus: dueStatus,
  _addDays: _addDays, _today: _today,
  _FREQ_DAYS: FREQ_DAYS,
  _WORK_TYPES: CLEANING_WORK_TYPES
};

})();
