/* ═══════════════════════════════════════════════════════════════════════════
   نظام هيل — وحدة إدارة المشاريع  (project-management.js)   [مرحلة ١ — أول حتة]
   ملف خارجي مستقل على نمط purchase-kpi.js: IIFE يعرض window.projectMgmt،
   يركّب صفحته ذاتياً (page-projects) ويحقن مجموعة «إدارة المشاريع» في القائمة
   الجانبية ويلفّ showPage — فلا يحتاج من index.html إلا وسم <script> واحد.

   يقرأ خدمات النواة بالاسم (db / esc / toast / currentUser / showConfirm /
   logAudit / purchases / _projectsList / poIsClosed / poActualCost /
   poStageIsWip / getPOTotal) — كل وسوم <script> الكلاسيكية تتشارك البيئة العامة.

   ── نطاق أول حتة (للمراجعة قبل التوسّع) ──
   • قائمة المشاريع بأرقام مالية: الموازنة / المصروف الفعلي / المرتبط / المتبقّي.
   • بطاقة المشروع: تبويب «نظرة عامة» + تبويب «الموازنة» (بنود عامة هجينة قابلة للتحرير).
   • المصروف الفعلي يُسحب حصراً من المشتريات (poIsClosed + poActualCost) — مصدر واحد
     للحقيقة، بلا تخزين مزدوج. الطلبات غير الموسومة ببند تُجمَّع تحت «غير مصنّف».

   ── مؤجَّل لمراحل تالية (موثّق في docs/project-management-plan.md) ──
   بنود المقايسة التفصيلية، حقل «بند الموازنة» على طلب الشراء، الإيراد/المستخلصات،
   دفعات العمالة، الجدول الزمني بالـ AI، لوحة الشركة الإجمالية.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
"use strict";

const PAGE_ID = "projects";
const VERSION = "0.1";

/* ── البنود العامة الثابتة (العمود الفقري — معتمدة §٦ من مستند التصوّر) ── */
const BUDGET_CATEGORIES = [
  { key:"materials",     name:"مواد بناء" },
  { key:"plumbing",      name:"سباكة" },
  { key:"electrical",    name:"كهرباء" },
  { key:"hvac",          name:"تكييف" },
  { key:"mechanical",    name:"مواد ميكانيكية" },
  { key:"plaster",       name:"محارة/بياض" },
  { key:"finishes",      name:"تشطيبات" },
  { key:"carpentry",     name:"نجارة" },
  { key:"aluminum",      name:"ألوميتال/زجاج" },
  { key:"labor",         name:"مصنعيات/عمالة" },
  { key:"subcontractor", name:"مقاول باطن" },
  { key:"equipment",     name:"معدات/إيجارات" },
  { key:"cleaning",      name:"مواد نظافة" },
  { key:"misc",          name:"مواد مختلفة" },
  { key:"overhead",      name:"مصاريف إدارية" },
];
const UNCATEGORIZED = { key:"uncategorized", name:"غير مصنّف" };
const CAT_NAME = (()=>{ const m={}; BUDGET_CATEGORIES.concat([UNCATEGORIZED]).forEach(c=>m[c.key]=c.name); return m; })();

// خريطة نوع البند (في طلب الشراء) → بند الموازنة — افتراض ذكي، يعدّله الأدمن (meta/pm_category_map).
// التوزيع يتم لكل بندٍ حسب نوعه فيُقسَّم الطلب الواحد على أكثر من بند موازنة تلقائياً — ويشمل
// الطلبات القديمة (لها أنواع بنود أصلاً) فتظهر لها قيم فوراً بلا إدخال يدوي.
const DEFAULT_TYPE_MAP = {
  "مواد كهربائية":"electrical",
  "مواد سباكة":"plumbing",
  "مواد بناء":"materials",
  "مواد ميكانيكية":"mechanical",
  "مواد تكييف":"hvac",
  "أدوات":"equipment",
  "خدمات":"subcontractor",
  "مواد نظافة":"cleaning",
  "مواد مختلفة":"misc",
  "أخرى":"uncategorized"
};
let _catMap = null; // تجاوزات الأدمن المحمّلة من meta/pm_category_map (تُدمَج فوق الافتراضي)
function catMapDocPath(){ return "meta/pm_category_map"; }
function _catForItemType(t){
  const nm=String(t||"").trim();
  if(_catMap && _catMap[nm] && CAT_NAME[_catMap[nm]]) return _catMap[nm];
  return DEFAULT_TYPE_MAP[nm] || "uncategorized";
}
// كل أنواع البنود (مدمجة + مخصّصة) من النواة إن توفّرت، وإلا مفاتيح الخريطة الافتراضية
function _itemTypes(){
  try{ if(typeof _allCatTypes==="function"){ return _allCatTypes().map(t=>String(t.name)).filter(Boolean); } }catch(e){}
  return Object.keys(DEFAULT_TYPE_MAP);
}
async function loadCatMap(){
  const database=_db(); if(!database){ _catMap=_catMap||{}; return _catMap; }
  try{
    const snap=await database.doc(catMapDocPath()).get();
    const d=(snap&&snap.exists)?(snap.data()||{}):{};
    _catMap = (d.map && typeof d.map==="object") ? d.map : {};
  }catch(e){ console.warn("loadCatMap",e); _catMap=_catMap||{}; }
  return _catMap;
}
async function saveCatMap(map){
  const database=_db(); if(!database){ _toast("⚠ لا اتصال بقاعدة البيانات","warn"); return false; }
  const u=_user();
  try{
    await database.doc(catMapDocPath()).set({ map, updatedAt:new Date().toISOString(), updatedBy:(u&&u.name)||"" }, { merge:true });
    _catMap=map; _audit("تعديل خريطة بنود الموازنة","");
    return true;
  }catch(e){ console.warn("saveCatMap",e); _toast("⚠ تعذّر الحفظ","warn"); return false; }
}

const PROJECT_TYPES = { construction:"مقاولات", renovation:"ترميم", maintenance:"صيانة" };
const TYPE_ICON    = { construction:"building2", renovation:"hammer", maintenance:"wrench" };
// شارة النوع بأيقونة المنصة (SVG) بدل الإيموجي
function typeBadge(type){
  const lbl=PROJECT_TYPES[type]; if(!lbl) return "";
  return `<span class="badge" style="background:var(--surface2);color:var(--muted)">${_icon(TYPE_ICON[type])} ${lbl}</span>`;
}

/* ── حالة الوحدة ── */
let _curId  = null;      // معرّف المشروع المفتوح (null = شاشة القائمة)
let _curTab = "overview";
const _budgetCache = {}; // projectId → {categories:[{key,name,planned}], boq:[]}
let _editing = false;    // وضع تحرير الموازنة
let _lastList = [];      // آخر قائمة معروضة (للفتح بالفهرس)
let _manualLoaded = false; // حُمّلت أسماء المشاريع اليدوية من meta؟
let _mapView = false;    // شاشة «ربط أنواع البنود بالموازنة» مفتوحة؟
let _usageView = false;  // شاشة «استهلاك الذكاء الاصطناعي» مفتوحة؟
let _usageData = null;   // meta/ai_usage المحمّل
// أسعار تقديرية لفئة Sonnet (دولار لكل مليون توكن) — للعرض التقريبي فقط
const AI_RATE_IN = 3, AI_RATE_OUT = 15;
function _aiUsageDocPath(){ return (typeof IS_DEV!=="undefined" && IS_DEV) ? "meta/ai_usage_dev" : "meta/ai_usage"; }
function _estCostUSD(inT,outT){ return ((Number(inT)||0)/1e6*AI_RATE_IN) + ((Number(outT)||0)/1e6*AI_RATE_OUT); }
function _usd(n){ return "$"+(Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
async function loadUsage(){
  const database=_db(); if(!database){ _usageData=_usageData||{}; return; }
  try{ const snap=await database.doc(_aiUsageDocPath()).get(); _usageData=(snap&&snap.exists)?(snap.data()||{}):{}; }
  catch(e){ console.warn("loadUsage",e); _usageData=_usageData||{}; }
}

/* ════════════ أغلفة آمنة لخدمات النواة ════════════ */
function _db(){ return (typeof db!=="undefined" && db) ? db : null; }
function _esc(s){ try{ return esc(s); }catch(e){ return s==null?"":String(s); } }
function _toast(m,t){ try{ toast(m,t); }catch(e){ console.log(m); } }
function _audit(a,d){ try{ if(typeof logAudit==="function") logAudit(a,d); }catch(e){} }
function _confirm(o){ try{ return showConfirm(o); }catch(e){ return Promise.resolve(window.confirm((o&&o.msg)||"تأكيد؟")); } }
function _user(){ try{ return currentUser||null; }catch(e){ return null; } }
function _role(){ const u=_user(); return u&&u.role ? u.role : ""; }
function _canEdit(){ const r=_role(); return r==="admin"||r==="project_manager"; }

// ── بوابة الوصول (مؤقّتة — مرحلة ١) ──
// القسم مقفول على الأدمن للاختبار الحيّ ببيانات حقيقية قبل فتحه للفريق.
// ★ للفتح للكل لاحقاً: اجعل RESTRICT_TO = []  (سطر واحد) — عندها يراه كل مستخدمٍ له دور.
const RESTRICT_TO = ["admin"];
function _canAccess(){ return RESTRICT_TO.length===0 ? !!_role() : RESTRICT_TO.indexOf(_role())!==-1; }

// أيقونات المنصة (SVG) بدل الإيموجي — تعيد استخدام _ic/_svgIcon العامّتين في index.html
// (نفس ما تفعله ICG في purchase-kpi.js). ترجع "" بأمان إن لم تكن محمّلة (اختبارات/jsdom).
function _icon(name,cls){ try{ return (typeof _ic==="function") ? _ic(name,cls) : ""; }catch(e){ return ""; } }
function _svg(name){ try{ return (typeof _svgIcon==="function") ? _svgIcon(name) : ""; }catch(e){ return ""; } }

function getPurchases(){ try{ return Array.isArray(purchases)?purchases:[]; }catch(e){ return []; } }
function getProjects(){ try{ return Array.isArray(window._projectsList)?window._projectsList:[]; }catch(e){ return []; } }

/* الدوال المالية المركزية — نستدعيها إن وُجدت، وإلا رجوعٌ آمن (لا نُكرّر منطقها) */
function poClosed(p){ try{ return poIsClosed(p); }catch(e){ return false; } }
function poActual(p){ try{ return poActualCost(p)||0; }catch(e){ return Number(p&&p.actualCost)||0; } }
function poWip(p){ try{ return poStageIsWip(p); }catch(e){ return false; } }
function poTotal(p){ try{ return getPOTotal(p)||0; }catch(e){ return Number(p&&p.estCost)||0; } }

function money(n){ return (Number(n)||0).toLocaleString('en-US',{maximumFractionDigits:0}); }

/* ════════════ المشاريع: المسجّلة + المُدخَلة يدوياً ════════════ */
// المشروع اليدوي: طلباته عليها projectId==="__OTHER__" (أو isCustomProject) وname في projectName.
// نعرّفه بمعرّفٍ اصطناعي "__MPN__:"+الاسم، ويأتي من _manualProjectNamesAll() الجاهزة
// (تجمع أسماء meta + المشتقّة من الطلبات). فتظهر مشاريع المشتريات اليدوية جنب المسجّلة.
const MANUAL_PREFIX = "__MPN__:";
function _manualNames(){ try{ return (typeof _manualProjectNamesAll==="function") ? _manualProjectNamesAll() : []; }catch(e){ return []; } }
// قائمة موحّدة: مسجّلة (manual:false) + يدوية (manual:true) — بلا تكرار الاسم
function allProjects(){
  const reg = getProjects().map(p=>({ id:p.id, name:p.name||p.id, type:p.type, client:p.client, location:p.location, contractStart:p.contractStart, contractMonths:p.contractMonths, desc:p.desc, manual:false }));
  const regNames = new Set(reg.map(p=>String(p.name||"").trim()));
  const manual = _manualNames()
    .map(nm=>String(nm||"").trim())
    .filter(nm=> nm && !regNames.has(nm))
    .map(nm=>({ id:MANUAL_PREFIX+nm, name:nm, manual:true }));
  return reg.concat(manual);
}

/* ════════════ الحسابات المالية (مصدر واحد: المشتريات) ════════════ */
// كل طلبات الشراء المربوطة بمشروع (مسجّل بالمعرّف، أو يدوي بالاسم) — باستبعاد المحذوف
function poForProject(projId){
  const all = getPurchases().filter(p=> p && p.status!=="deleted");
  const proj = _proj(projId);
  if(proj && proj.manual){
    const nm = String(proj.name||"").trim();
    return all.filter(p=> (p.projectId==="__OTHER__" || p.isCustomProject) && String(p.projectName||"").trim()===nm);
  }
  return all.filter(p=> p.projectId===projId);
}
// إجمالي الموازنة المخطّطة للمشروع = مجموع البنود العامة المخزّنة
function budgetTotal(projId){
  const b=_budgetCache[projId];
  if(!b || !Array.isArray(b.categories)) return 0;
  return b.categories.reduce((s,c)=> s + (Number(c.planned)||0), 0);
}
// المصروف الفعلي (المغلق) + المرتبط (الجاري) للمشروع كله
function projectRollup(projId){
  let actual=0, committed=0;
  poForProject(projId).forEach(p=>{
    if(poClosed(p)) actual += poActual(p);
    else if(poWip(p)) committed += poTotal(p);
  });
  const planned = budgetTotal(projId);
  const remaining = planned - actual - committed;
  const pct = planned>0 ? Math.round(((actual+committed)/planned)*100) : 0;
  return { planned, actual, committed, remaining, pct };
}
// توزيع الفعلي/المرتبط على بنود الموازنة حسب **نوع كل بند** في الطلب (لا اختيار يدوي):
// لكل طلب نحسب وزن كل بند موازنة من مجموع تكاليف أصنافه، ثم:
//   • المغلق: نوزّع التكلفة الفعلية (الفاتورة) على البنود بنسبة أوزان الأصناف.
//   • الجاري: نوزّع تكلفة كل صنف على بند موازنته مباشرةً.
// طلبٌ بلا أصناف (قديم جداً) يرجع لـ budgetCategoryKey إن وُجد، وإلا «غير مصنّف».
function rollupByCategory(projId){
  const m={};
  const ensure=k=>{ if(!m[k]) m[k]={actual:0, committed:0}; return m[k]; };
  poForProject(projId).forEach(p=>{
    const items = Array.isArray(p.items) ? p.items.filter(Boolean) : [];
    if(items.length){
      const perCat={}; let tot=0;
      items.forEach(it=>{ const c=Number(it.itemCost)||0; const cat=_catForItemType(it.itemType); perCat[cat]=(perCat[cat]||0)+c; tot+=c; });
      if(poClosed(p)){
        const actual=poActual(p);
        if(tot>0) Object.keys(perCat).forEach(cat=>{ ensure(cat).actual += actual*(perCat[cat]/tot); });
        else ensure("uncategorized").actual += actual;
      } else if(poWip(p)){
        if(tot>0) Object.keys(perCat).forEach(cat=>{ ensure(cat).committed += perCat[cat]; });
        else ensure("uncategorized").committed += poTotal(p);
      }
    } else {
      const k = (p.budgetCategoryKey && CAT_NAME[p.budgetCategoryKey]) ? p.budgetCategoryKey : "uncategorized";
      if(poClosed(p)) ensure(k).actual += poActual(p);
      else if(poWip(p)) ensure(k).committed += poTotal(p);
    }
  });
  return m;
}

/* ════════════ مفاتيح المستندات ════════════ */
// مفتاح مستند آمن: المشروع اليدوي بـ "mpn_<الاسم>" (لا بادئة "__" المحجوزة في Firestore،
// ولا "/" ولا "." في مسار/مفتاح المستند).
function _safeKey(projId){
  let key = String(projId);
  if(key.indexOf(MANUAL_PREFIX)===0) key = "mpn_" + key.slice(MANUAL_PREFIX.length);
  return key.replace(/[\/.]/g,"_");
}
function budgetDocPath(projId){ return "meta/"+_safeKey(projId)+"_budget"; }
function scheduleDocPath(projId){ return "meta/"+_safeKey(projId)+"_schedule"; }

/* ════════════ نوع المشروع (مقاولات/ترميم/صيانة) ════════════ */
// يُخزَّن في مستند الموازنة نفسه (سجلّ بيانات المشروع). غير المصنّف = صيانة (بلا جدول).
function projectType(projId){ const b=_budgetCache[projId]; return (b&&b.type) ? b.type : ""; }
// النوع الفعّال: من مستند الموازنة (تعديل البطاقة) أو من سجل المشروع (اختير عند الإنشاء)
function needsSchedule(projId){ const t=effType(projId); return t==="construction"||t==="renovation"; }
async function saveType(projId, type){
  const database=_db(); if(!database){ _toast("⚠ لا اتصال بقاعدة البيانات","warn"); return false; }
  const u=_user();
  try{
    await database.doc(budgetDocPath(projId)).set({ type, updatedAt:new Date().toISOString(), updatedBy:(u&&u.name)||(u&&u.email)||"" }, { merge:true });
    _budgetCache[projId] = Object.assign(_budgetCache[projId]||{categories:[],boq:[]}, { type });
    _audit("تصنيف نوع مشروع", _projName(projId)+" → "+(PROJECT_TYPES[type]||type));
    return true;
  }catch(e){ console.warn("saveType",e); _toast("⚠ تعذّر حفظ النوع","warn"); return false; }
}

async function loadBudget(projId){
  const database=_db();
  if(!database){ _budgetCache[projId]=_budgetCache[projId]||{categories:[],boq:[]}; return _budgetCache[projId]; }
  try{
    const snap = await database.doc(budgetDocPath(projId)).get();
    const d = (snap&&snap.exists) ? (snap.data()||{}) : {};
    _budgetCache[projId] = { categories: Array.isArray(d.categories)?d.categories:[], boq: Array.isArray(d.boq)?d.boq:[], type: d.type||"" };
  }catch(e){ console.warn("loadBudget",e); _budgetCache[projId]=_budgetCache[projId]||{categories:[],boq:[]}; }
  return _budgetCache[projId];
}

/* ════════════ الجدول الزمني (لمشاريع الإنشاءات/الترميم فقط) ════════════ */
const _scheduleCache = {}; // projId → {phases:[...], generatedByAI, updatedAt}
async function loadSchedule(projId){
  const database=_db();
  if(!database){ _scheduleCache[projId]=_scheduleCache[projId]||{phases:[]}; return _scheduleCache[projId]; }
  try{
    const snap = await database.doc(scheduleDocPath(projId)).get();
    const d = (snap&&snap.exists) ? (snap.data()||{}) : {};
    _scheduleCache[projId] = { phases: Array.isArray(d.phases)?d.phases:[], generatedByAI: !!d.generatedByAI };
  }catch(e){ console.warn("loadSchedule",e); _scheduleCache[projId]=_scheduleCache[projId]||{phases:[]}; }
  return _scheduleCache[projId];
}
async function saveSchedule(projId, phases, generatedByAI){
  const database=_db(); if(!database){ _toast("⚠ لا اتصال بقاعدة البيانات","warn"); return false; }
  const u=_user();
  try{
    await database.doc(scheduleDocPath(projId)).set({
      phases, generatedByAI: !!generatedByAI,
      updatedAt:new Date().toISOString(), updatedBy:(u&&u.name)||(u&&u.email)||""
    }, { merge:true });
    _scheduleCache[projId] = { phases, generatedByAI: !!generatedByAI };
    _audit("تحديث جدول زمني", _projName(projId)+" — "+phases.length+" مرحلة");
    return true;
  }catch(e){ console.warn("saveSchedule",e); _toast("⚠ تعذّر حفظ الجدول","warn"); return false; }
}

async function saveBudget(projId, categories){
  const database=_db();
  if(!database){ _toast("⚠ لا اتصال بقاعدة البيانات","warn"); return false; }
  const u=_user();
  try{
    await database.doc(budgetDocPath(projId)).set({
      categories,
      updatedAt: new Date().toISOString(),
      updatedBy: (u&&u.name)||(u&&u.email)||""
    }, { merge:true });
    _budgetCache[projId] = Object.assign(_budgetCache[projId]||{boq:[]}, { categories });
    _audit("تعديل موازنة مشروع", _projName(projId)+" — إجمالي: "+money(budgetTotal(projId))+" ريال");
    return true;
  }catch(e){ console.warn("saveBudget",e); _toast("⚠ تعذّر حفظ الموازنة: "+((e&&e.message)||""),"warn"); return false; }
}

function _projName(projId){ const p=_proj(projId); return p ? (p.name||projId) : projId; }
function _proj(projId){ return allProjects().find(x=>x.id===projId)||null; }

/* ════════════ المقايسة التفصيلية (BOQ) ════════════
   بنودٌ تفصيلية لكل مشروع، كلٌّ مصنّفٌ تحت بند موازنة. عند الحفظ تُحسب مجاميع كل بند
   عام وتُكتَب في موازنة المشروع (الموازنة المخطّطة = مجموع بنود المقايسة تحتها). */
const _boqCache = {}; // projId → {items:[{id,desc,categoryKey,unit,qty,unitPrice}]}
let _boqEditing=false, _boqDraft=null;
function boqDocPath(projId){ return "meta/"+_safeKey(projId)+"_boq"; }
function _boqLineTotal(it){ return (Number(it.qty)||0) * (Number(it.unitPrice)||0); }
async function loadBoq(projId){
  const database=_db();
  if(!database){ _boqCache[projId]=_boqCache[projId]||{items:[]}; return _boqCache[projId]; }
  try{
    const snap=await database.doc(boqDocPath(projId)).get();
    const d=(snap&&snap.exists)?(snap.data()||{}):{};
    _boqCache[projId]={ items: Array.isArray(d.items)?d.items:[] };
  }catch(e){ console.warn("loadBoq",e); _boqCache[projId]=_boqCache[projId]||{items:[]}; }
  return _boqCache[projId];
}
async function saveBoq(projId, items){
  const database=_db(); if(!database){ _toast("⚠ لا اتصال بقاعدة البيانات","warn"); return false; }
  const u=_user();
  try{
    await database.doc(boqDocPath(projId)).set({ items, updatedAt:new Date().toISOString(), updatedBy:(u&&u.name)||"" }, { merge:true });
    _boqCache[projId]={ items };
    // مزامنة الموازنة: كل بند عام = مجموع بنود مقايسته؛ البنود بلا مقايسة تبقى بقيمتها اليدوية
    const sums={};
    items.forEach(it=>{ const k=it.categoryKey; if(k && CAT_NAME[k] && k!=="uncategorized") sums[k]=(sums[k]||0)+_boqLineTotal(it); });
    const existing={}; ((_budgetCache[projId]||{}).categories||[]).forEach(c=>existing[c.key]=Number(c.planned)||0);
    const cats=BUDGET_CATEGORIES.map(cat=>({ key:cat.key, name:cat.name, planned: (cat.key in sums)? sums[cat.key] : (existing[cat.key]||0) }));
    await saveBudget(projId, cats);
    return true;
  }catch(e){ console.warn("saveBoq",e); _toast("⚠ تعذّر حفظ المقايسة","warn"); return false; }
}

/* ════════════════════════════════════════════════════════════
   العرض
   ════════════════════════════════════════════════════════════ */
function render(){
  ensurePage();
  const el=document.getElementById("page-"+PAGE_ID);
  if(!el) return;
  if(_usageView) renderUsage(el);
  else if(_mapView) renderCatMap(el);
  else if(_curId) renderCard(el);
  else renderList(el);
}

/* ── قائمة المشاريع ── */
function renderList(el){
  // حمّل أسماء المشاريع اليدوية مرة (meta) ثم أعد الرسم — المشتقّة من الطلبات تظهر فوراً
  if(!_manualLoaded && typeof _loadManualProjectNames==="function"){
    _manualLoaded=true;
    _loadManualProjectNames().then(()=>{ if(_curId==null) renderList(el); }).catch(()=>{});
  }
  // حمّل خريطة بنود الموازنة مرة (تجاوزات الأدمن) — الافتراضي يعمل قبلها
  if(_catMap===null){ loadCatMap().then(()=>{ if(_curId==null && !_mapView) renderList(el); }).catch(()=>{}); }
  const projects=allProjects();
  el.innerHTML = `
    <div class="pm-head">
      <h2 class="pm-title">${_icon('building2')} إدارة المشاريع</h2>
      <div class="pm-sub">الموازنة والمصروف الفعلي لكل مشروع — المصروف مسحوبٌ مباشرةً من المشتريات</div>
      ${_canEdit()?`<button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="projectMgmt.openCatMap()">${_icon('tag')} ربط أنواع البنود بالموازنة</button>`:""}
    </div>
    <div id="pm-list" class="pm-cards"></div>`;

  if(!projects.length){
    // قد لا تكون المشاريع حُمّلت بعد — جرّب التحميل ثم أعد الرسم
    if(typeof loadProjects==="function"){
      loadProjects().then(()=>{ if(_curId==null) renderList(el); }).catch(()=>{});
    }
    document.getElementById("pm-list").innerHTML =
      `<div class="pm-empty">لا توجد مشاريع بعد — تُضاف من شاشة اختيار المشروع، أو تُدخَل يدوياً في طلب الشراء.</div>`;
    return;
  }

  // حمّل موازنات كل المشاريع (مرة) ثم ارسم البطاقات بالأرقام الكاملة
  Promise.all(projects.map(p=> (p.id in _budgetCache) ? Promise.resolve() : loadBudget(p.id)))
    .then(()=>{ if(_curId==null) paintList(projects); });
  paintList(projects); // رسم فوري (الأرقام تكتمل بعد التحميل)
}

function paintList(projects){
  const wrap=document.getElementById("pm-list");
  if(!wrap) return;
  _lastList = projects; // نفتح بالفهرس لا بالمعرّف (الأسماء اليدوية قد تحمل محارف تكسر onclick)
  wrap.innerHTML = projects.map((p,i)=>{
    const r=projectRollup(p.id);
    const barColor = r.pct>100 ? "var(--danger)" : (r.pct>=80 ? "var(--warn)" : "var(--accent)");
    const _t=effType(p.id);
    const badge = (_t?typeBadge(_t):"")
      + (p.manual ? (_t?" ":"")+'<span class="badge" style="background:var(--surface2);color:var(--muted)">'+_icon('edit')+' يدوي</span>' : "");
    return `
    <div class="pm-card" style="--sc:${barColor}" onclick="projectMgmt.openAt(${i})">
      <div class="pm-card-top">
        <div class="pm-card-name">${_esc(p.name||p.id)}</div>
        ${badge}
      </div>
      ${p.client?`<div class="pm-card-client">${_icon('users')} ${_esc(p.client)}</div>`:""}
      <div class="pm-mini">
        <div><span class="pm-mini-l">الموازنة</span><span class="pm-mini-v">${money(r.planned)}</span></div>
        <div><span class="pm-mini-l">المصروف</span><span class="pm-mini-v">${money(r.actual)}</span></div>
        <div><span class="pm-mini-l">المتبقّي</span><span class="pm-mini-v" style="color:${r.remaining<0?'var(--danger)':'var(--accent)'}">${money(r.remaining)}</span></div>
      </div>
      <div class="pm-bar"><div class="pm-bar-fill" style="width:${Math.min(r.pct,100)}%;background:${barColor}"></div></div>
      <div class="pm-bar-lbl">${r.pct}% مستهلك ${r.planned<=0?'<span class="pm-warn-txt">(بلا موازنة)</span>':''}</div>
    </div>`;
  }).join("");
}

/* ── بطاقة مشروع واحد ── */
function open(projId){
  _curId=projId; _curTab="overview"; _editing=false;
  _schedEditing=false; _schedGenForm=false; _schedDraft=null; _genErr=""; _boqEditing=false; _boqDraft=null;
  const el=document.getElementById("page-"+PAGE_ID);
  if(!(projId in _budgetCache)){
    loadBudget(projId).then(()=>{ if(_curId===projId) renderCard(el); });
  }
  renderCard(el);
}
function openAt(i){ const p=_lastList[i]; if(p) open(p.id); }
function back(){ _curId=null; _editing=false; render(); }

// فتح إدارة المشاريع من الصفحة الخارجية (منتقي المشاريع) — كيان شامل لكل المشاريع
// مثل «المشتريات المركزية». نعيد استخدام openGlobalPurchases لأنها تنقل من المنتقي إلى
// هيكل التطبيق وتشغّل مزامنة المشتريات (مصدر المصروف الفعلي)، ثم نعرض صفحة المشاريع.
async function openFromLanding(){
  if(!_canAccess()){ _toast("🔒 هذا القسم متاح للأدمن فقط حالياً","warn"); return; }
  try{ if(typeof openGlobalPurchases==="function"){ await openGlobalPurchases(); } }
  catch(e){ console.warn("openFromLanding/openGlobalPurchases",e); }
  try{ showPage("projects"); }catch(e){}
  // تسمية الهيدر لسياق المشاريع (openGlobalPurchases يضبطها على «المشتريات المركزية»)
  try{ const lbl=document.getElementById("current-project-label"); if(lbl) lbl.textContent="إدارة المشاريع"; }catch(e){}
  // بيانات المشتريات تصل عبر onSnapshot تدريجياً — أعِد الرسم لتحديث الأرقام
  setTimeout(()=>{ if(_curId==null && _onProjectsPage()) render(); }, 1200);
  setTimeout(()=>{ if(_curId==null && _onProjectsPage()) render(); }, 3000);
}
function _onProjectsPage(){ const pg=document.getElementById("page-"+PAGE_ID); return !!pg && pg.classList.contains("active"); }

function renderCard(el){
  const p=_proj(_curId);
  const name = p ? (p.name||_curId) : _curId;
  el.innerHTML = `
    <div class="pm-head">
      <button class="btn btn-ghost btn-sm pm-back" onclick="projectMgmt.back()">${_icon('folderOpen')} كل المشاريع</button>
      <h2 class="pm-title">${_esc(name)} ${_projBadges(_curId)}</h2>
      ${p&&p.client?`<div class="pm-sub">${_icon('users')} ${_esc(p.client)}${p.location?' — '+_icon('pin')+' '+_esc(p.location):''}</div>`:""}
    </div>
    <div class="pm-tabs">
      <button class="pm-tab ${_curTab==='overview'?'on':''}" data-tab="overview" onclick="projectMgmt.tab('overview')">نظرة عامة</button>
      <button class="pm-tab ${_curTab==='boq'?'on':''}" data-tab="boq" onclick="projectMgmt.tab('boq')">المقايسة</button>
      <button class="pm-tab ${_curTab==='budget'?'on':''}" data-tab="budget" onclick="projectMgmt.tab('budget')">الموازنة</button>
      ${needsSchedule(_curId)?`<button class="pm-tab ${_curTab==='schedule'?'on':''}" data-tab="schedule" onclick="projectMgmt.tab('schedule')">الجدول الزمني</button>`:""}
    </div>
    <div id="pm-tab-body"></div>`;
  renderTabBody();
}
function tab(t){
  _curTab=t; _editing=false; _schedEditing=false; _schedGenForm=false; _schedDraft=null; _genErr=""; _boqEditing=false; _boqDraft=null;
  // حدّث تمييز أزرار التبويب (renderTabBody يعيد الجسم فقط)
  document.querySelectorAll("#page-"+PAGE_ID+" .pm-tab").forEach(b=>{
    b.classList.toggle("on", b.dataset.tab===t);
  });
  renderTabBody();
}

function renderTabBody(){
  const body=document.getElementById("pm-tab-body");
  if(!body) return;
  if(_curTab==="overview") body.innerHTML = overviewHTML();
  else if(_curTab==="budget") body.innerHTML = budgetHTML();
  else if(_curTab==="boq"){
    if(_curId in _boqCache) body.innerHTML = boqHTML();
    else {
      body.innerHTML = `<div class="pm-hint" style="margin-top:0">جارٍ تحميل المقايسة…</div>`;
      loadBoq(_curId).then(()=>{ if(_curTab==="boq"){ const b=document.getElementById("pm-tab-body"); if(b) b.innerHTML=boqHTML(); } });
    }
  }
  else if(_curTab==="schedule"){
    if(_curId in _scheduleCache) body.innerHTML = scheduleHTML();
    else {
      body.innerHTML = `<div class="pm-hint" style="margin-top:0">جارٍ تحميل الجدول…</div>`;
      loadSchedule(_curId).then(()=>{ if(_curTab==="schedule"){ const b=document.getElementById("pm-tab-body"); if(b) b.innerHTML=scheduleHTML(); } });
    }
  }
}

function overviewHTML(){
  const r=projectRollup(_curId);
  const spentPct = r.planned>0 ? Math.round((r.actual/r.planned)*100) : 0;
  const barColor = r.pct>100 ? "var(--danger)" : (r.pct>=80 ? "var(--warn)" : "var(--accent)");
  // بطاقات .stat-card الأصلية (شريط علوي ملوّن var(--sc) + .sl/.sv بوزن 900)
  const card=(lbl,val,sc,sub)=>`
    <div class="stat-card" style="--sc:${sc}">
      <div class="sl">${lbl}</div>
      <div class="sv">${money(val)}</div>
      ${sub?`<div class="click-hint">${sub}</div>`:""}
    </div>`;
  const over = r.planned>0 && (r.actual+r.committed)>r.planned;
  // شريط تصنيف نوع المشروع — الجدول الزمني يظهر لمقاولات/ترميم فقط
  const t=effType(_curId);
  const typeCtrl = _canEdit()
    ? `<select class="form-input pm-type-sel" onchange="projectMgmt.setType(this.value)">
         <option value="" ${!t?'selected':''}>— غير مصنّف (صيانة) —</option>
         <option value="construction" ${t==='construction'?'selected':''}>مقاولات</option>
         <option value="renovation" ${t==='renovation'?'selected':''}>ترميم</option>
         <option value="maintenance" ${t==='maintenance'?'selected':''}>صيانة</option>
       </select>`
    : `<b style="color:var(--text)">${t?PROJECT_TYPES[t]:'صيانة'}</b>`;
  const typeBar = `<div class="pm-typebar">${_icon('building2')} نوع المشروع: ${typeCtrl}
    ${needsSchedule(_curId)?'<span class="pm-hint-inline">— له تبويب «الجدول الزمني»</span>':'<span class="pm-hint-inline">— الصيانة بلا جدول زمني</span>'}</div>`;
  return `
    ${typeBar}
    <div class="pm-stats">
      ${card("الموازنة المخطّطة (ريال)", r.planned, "var(--primary)", "")}
      ${card("المصروف الفعلي (مغلق)", r.actual, "var(--accent)", spentPct+"% من الموازنة")}
      ${card("المرتبط (طلبات جارية)", r.committed, "var(--warn)", "")}
      ${card("المتبقّي", r.remaining, r.remaining<0?"var(--danger)":"var(--accent)", "")}
    </div>
    <div class="pm-progress-wrap">
      <div class="pm-progress"><div class="pm-progress-fill" style="width:${Math.min(r.pct,100)}%;background:${barColor}"></div></div>
      <div class="pm-progress-lbl">${r.pct}% من الموازنة (مصروف + مرتبط)</div>
    </div>
    ${over?`<div class="pm-alert">${_icon('alertTriangle')} تنبيه: المصروف والمرتبط تجاوزا الموازنة المخطّطة — تحذير فقط، لا يمنع أي إجراء.</div>`:""}
    ${r.planned<=0?`<div class="pm-hint">لم تُدخَل موازنة بعد. افتح تبويب «الموازنة» وأدخل تقديراتك لكل بند.</div>`:""}`;
}

function budgetHTML(){
  const b=_budgetCache[_curId]||{categories:[]};
  const byCat=rollupByCategory(_curId);
  // خريطة البند العام → المخطّط المخزّن
  const plannedOf={};
  (b.categories||[]).forEach(c=> plannedOf[c.key]=Number(c.planned)||0);

  const rowsCats = BUDGET_CATEGORIES.map(cat=>{
    const planned = plannedOf[cat.key]||0;
    const cr = byCat[cat.key]||{actual:0,committed:0};
    const spent = cr.actual, committed=cr.committed;
    const remaining = planned - spent - committed;
    const val = _editing
      ? `<input type="number" min="0" class="form-input pm-inp-w" data-cat="${cat.key}" value="${planned||''}" placeholder="0">`
      : money(planned);
    return `
      <tr>
        <td class="pm-td-name">${_esc(cat.name)}</td>
        <td class="pm-num">${val}</td>
        <td class="pm-num">${money(spent)}</td>
        <td class="pm-num pm-dim">${money(committed)}</td>
        <td class="pm-num" style="color:${remaining<0?'var(--danger)':'inherit'}">${money(remaining)}</td>
      </tr>`;
  }).join("");

  // صف «غير مصنّف» يظهر فقط إن وُجد صرفٌ/ارتباط غير مصنّف (طلبات قديمة بلا بند)
  const unc = byCat["uncategorized"];
  const rowUnc = (unc && (unc.actual||unc.committed)) ? `
      <tr class="pm-tr-unc">
        <td class="pm-td-name">${UNCATEGORIZED.name} <span class="pm-hint-inline">طلبات بلا بند</span></td>
        <td class="pm-num">—</td>
        <td class="pm-num">${money(unc.actual)}</td>
        <td class="pm-num pm-dim">${money(unc.committed)}</td>
        <td class="pm-num">—</td>
      </tr>` : "";

  const totPlanned = BUDGET_CATEGORIES.reduce((s,c)=>s+(plannedOf[c.key]||0),0);
  const totActual  = Object.values(byCat).reduce((s,c)=>s+c.actual,0);
  const totCommit  = Object.values(byCat).reduce((s,c)=>s+c.committed,0);

  const editBtns = _canEdit()
    ? (_editing
        ? `<button class="btn btn-primary btn-sm" onclick="projectMgmt.saveBudgetEdit()">${_icon('checkCircle')} حفظ</button>
           <button class="btn btn-ghost btn-sm" onclick="projectMgmt.cancelEdit()">إلغاء</button>`
        : `<button class="btn btn-primary btn-sm" onclick="projectMgmt.editBudget()">${_icon('edit')} تعديل الموازنة</button>`)
    : `<span class="pm-hint-inline">العرض فقط — التعديل لمدير المشاريع أو الأدمن</span>`;

  return `
    <div class="pm-budget-tools">${editBtns}</div>
    <div class="pm-table-wrap">
    <table class="pm-table">
      <thead><tr>
        <th>البند العام</th><th>الموازنة</th><th>المصروف (مغلق)</th><th>المرتبط (جارٍ)</th><th>المتبقّي</th>
      </tr></thead>
      <tbody>${rowsCats}${rowUnc}</tbody>
      <tfoot><tr>
        <td class="pm-td-name">الإجمالي</td>
        <td class="pm-num">${money(totPlanned)}</td>
        <td class="pm-num">${money(totActual)}</td>
        <td class="pm-num pm-dim">${money(totCommit)}</td>
        <td class="pm-num" style="color:${(totPlanned-totActual-totCommit)<0?'var(--danger)':'inherit'}">${money(totPlanned-totActual-totCommit)}</td>
      </tr></tfoot>
    </table>
    </div>
    <div class="pm-hint">المصروف والمرتبط يُحسبان من طلبات الشراء المربوطة بالمشروع، وتُوزَّع على البنود حسب «بند الموازنة» المختار في طلب الشراء. الطلبات القديمة أو التي بلا بند تظهر تحت «غير مصنّف».</div>`;
}

function editBudget(){ _editing=true; renderTabBody(); }
function cancelEdit(){ _editing=false; renderTabBody(); }

async function saveBudgetEdit(){
  const inputs=document.querySelectorAll("#pm-tab-body input[data-cat]");
  const categories = BUDGET_CATEGORIES.map(cat=>{
    let planned=0;
    inputs.forEach(inp=>{ if(inp.dataset.cat===cat.key) planned=Number(inp.value)||0; });
    return { key:cat.key, name:cat.name, planned };
  });
  const ok = await saveBudget(_curId, categories);
  if(ok){ _editing=false; _toast("✅ حُفظت الموازنة","success"); renderTabBody(); }
}

/* ── المقايسة التفصيلية: عرض/تحرير ── */
function boqHTML(){
  const items=((_boqCache[_curId]||{}).items)||[];
  const canEdit=_canEdit();
  if(_boqEditing) return _boqEditHTML(_boqDraft||[]);
  const toolbar = canEdit
    ? `<div class="pm-sched-tools">
        <button class="btn btn-primary btn-sm" onclick="projectMgmt.editBoq()">${_icon('edit')} تعديل المقايسة</button>
        <button class="btn btn-ghost btn-sm" onclick="projectMgmt.importBoqExcel()">${_icon('download')} استيراد Excel</button>
      </div>`
    : "";
  if(!items.length){
    return toolbar + `<div class="pm-hint" style="margin-top:0">لا توجد مقايسة بعد. ${canEdit?'اضغط «تعديل المقايسة» لإضافة البنود يدوياً، أو «استيراد Excel» — وستُحسب الموازنة تلقائياً منها.<br>أعمدة Excel المتوقّعة: <b>البند · البند العام · الوحدة · الكمية · سعر الوحدة</b>.':'التحرير للأدمن أو مدير المشاريع.'}</div>`;
  }
  const byCat={}; items.forEach(it=>{ const k=(it.categoryKey&&CAT_NAME[it.categoryKey])?it.categoryKey:"uncategorized"; (byCat[k]=byCat[k]||[]).push(it); });
  const cats=BUDGET_CATEGORIES.concat([UNCATEGORIZED]).filter(c=>byCat[c.key]);
  let grand=0;
  const sections=cats.map(c=>{
    let sub=0;
    const rows=byCat[c.key].map(it=>{ const t=_boqLineTotal(it); sub+=t; return `<tr>
        <td class="pm-td-name">${_esc(it.desc)}</td>
        <td class="pm-num">${_esc(it.unit||"")}</td>
        <td class="pm-num">${money(it.qty)}</td>
        <td class="pm-num">${money(it.unitPrice)}</td>
        <td class="pm-num">${money(t)}</td>
      </tr>`; }).join("");
    grand+=sub;
    return `<tr class="pm-boq-cat"><td colspan="4">${_esc(c.name)}</td><td class="pm-num">${money(sub)}</td></tr>`+rows;
  }).join("");
  return toolbar + `<div class="pm-table-wrap"><table class="pm-table">
      <thead><tr><th>البند</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
      <tbody>${sections}</tbody>
      <tfoot><tr><td class="pm-td-name" colspan="4">إجمالي المقايسة</td><td class="pm-num">${money(grand)}</td></tr></tfoot>
    </table></div>
    <div class="pm-hint">«الموازنة المخطّطة» تُحسب تلقائياً من هذه المقايسة (كل بند عام = مجموع بنوده). قريباً: استيراد Excel واستخراج بالذكاء الاصطناعي.</div>`;
}
function _boqEditHTML(items){
  const catOpts=(sel)=> BUDGET_CATEGORIES.map(c=>`<option value="${c.key}" ${sel===c.key?'selected':''}>${_esc(c.name)}</option>`).join("");
  return `
    <div class="pm-sched-tools">
      <button class="btn btn-primary btn-sm" onclick="projectMgmt.saveBoqEdit()">${_icon('checkCircle')} حفظ</button>
      <button class="btn btn-ghost btn-sm" onclick="projectMgmt.cancelBoqEdit()">إلغاء</button>
      <button class="btn btn-ghost btn-sm" onclick="projectMgmt.addBoqLine()">${_icon('plus')} إضافة بند</button>
      <button class="btn btn-ghost btn-sm" onclick="projectMgmt.importBoqExcel()">${_icon('download')} استيراد Excel</button>
    </div>
    <div class="pm-table-wrap"><table class="pm-table">
      <thead><tr><th>البند</th><th>البند العام</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة</th><th></th></tr></thead>
      <tbody>
        ${items.map((it,i)=>`<tr>
          <td><input class="form-input" data-f="desc" data-i="${i}" value="${_esc(it.desc||'')}"></td>
          <td><select class="form-input" data-f="categoryKey" data-i="${i}">${catOpts(it.categoryKey||'materials')}</select></td>
          <td><input class="form-input pm-inp-w" data-f="unit" data-i="${i}" value="${_esc(it.unit||'')}"></td>
          <td><input type="number" min="0" class="form-input pm-inp-w" data-f="qty" data-i="${i}" value="${it.qty!=null?it.qty:''}"></td>
          <td><input type="number" min="0" class="form-input pm-inp-w" data-f="unitPrice" data-i="${i}" value="${it.unitPrice!=null?it.unitPrice:''}"></td>
          <td><button class="btn btn-ghost btn-sm" title="حذف" onclick="projectMgmt.delBoqLine(${i})">${_icon('trash')}</button></td>
        </tr>`).join("")}
        ${items.length?"":`<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:16px">لا بنود — اضغط «إضافة بند».</td></tr>`}
      </tbody>
    </table></div>
    <div class="pm-hint">صنّف كل بند تحت بند موازنة — الموازنة تتجمّع منها تلقائياً عند الحفظ.</div>`;
}
function _syncBoqDraft(){
  if(!_boqDraft) return;
  document.querySelectorAll("#pm-tab-body [data-i]").forEach(inp=>{
    const i=parseInt(inp.dataset.i), f=inp.dataset.f; if(!_boqDraft[i]||!f) return;
    _boqDraft[i][f] = (f==="qty"||f==="unitPrice") ? (Number(inp.value)||0) : inp.value;
  });
}
function editBoq(){
  const items=((_boqCache[_curId]||{}).items)||[];
  _boqDraft = items.map(it=>({ id:it.id||_uid(), desc:it.desc||"", categoryKey:it.categoryKey||"materials", unit:it.unit||"", qty:Number(it.qty)||0, unitPrice:Number(it.unitPrice)||0 }));
  _boqEditing=true; renderTabBody();
}
function addBoqLine(){ _syncBoqDraft(); if(!_boqDraft) _boqDraft=[]; _boqDraft.push({ id:_uid(), desc:"", categoryKey:"materials", unit:"", qty:0, unitPrice:0 }); renderTabBody(); }
function delBoqLine(i){ _syncBoqDraft(); if(_boqDraft){ _boqDraft.splice(i,1); renderTabBody(); } }
function cancelBoqEdit(){ _boqEditing=false; _boqDraft=null; renderTabBody(); }
async function saveBoqEdit(){
  _syncBoqDraft();
  const items=(_boqDraft||[]).filter(it=>String(it.desc||"").trim()).map(it=>({
    id:it.id||_uid(), desc:String(it.desc).trim(), categoryKey:it.categoryKey||"materials",
    unit:String(it.unit||"").trim(), qty:Number(it.qty)||0, unitPrice:Number(it.unitPrice)||0
  }));
  const ok=await saveBoq(_curId, items);
  if(ok){ _boqEditing=false; _boqDraft=null; _toast("✅ حُفظت المقايسة والموازنة","success"); renderTabBody(); }
}

/* ── استيراد المقايسة من Excel (يعيد استخدام مكتبة XLSX المحمّلة) ── */
function _boqNorm(s){ return String(s||"").trim().replace(/[أإآا]/g,"ا").replace(/ة/g,"ه").replace(/ى/g,"ي").replace(/\s+/g,"").toLowerCase(); }
function _boqNum(v){ if(v==null) return 0; const n=parseFloat(String(v).replace(/[^\d.\-]/g,"")); return isNaN(n)?0:n; }
function _catKeyFromName(name){
  const n=String(name||"").trim(); if(!n) return "materials";
  const nn=_boqNorm(n);
  const found=BUDGET_CATEGORIES.find(c=>_boqNorm(c.name)===nn || _boqNorm(c.name).indexOf(nn)!==-1 || nn.indexOf(_boqNorm(c.name))!==-1);
  if(found) return found.key;
  if(DEFAULT_TYPE_MAP[n]) return DEFAULT_TYPE_MAP[n];
  for(const t of Object.keys(DEFAULT_TYPE_MAP)){ if(_boqNorm(t)===nn) return DEFAULT_TYPE_MAP[t]; }
  return "materials";
}
function _parseBoqRows(rows){
  if(!rows||!rows.length) return [];
  // اتحاد كل العناوين
  const headers=[]; const seen={}; rows.forEach(r=>Object.keys(r).forEach(h=>{ if(!seen[h]){ seen[h]=1; headers.push(h); } }));
  const used={};
  // يختار عموداً واحداً للحقل (exact ثم substring) ويحجزه فلا يُعاد استخدامه لحقلٍ آخر
  const pick=(keys)=>{
    const nk=keys.map(_boqNorm);
    for(const h of headers){ if(used[h]) continue; const nh=_boqNorm(h); if(nk.some(k=>nh===k)){ used[h]=1; return h; } }
    for(const h of headers){ if(used[h]) continue; const nh=_boqNorm(h); if(nk.some(k=>k&&nh.indexOf(k)!==-1)){ used[h]=1; return h; } }
    return null;
  };
  // ترتيب مهم: الأكثر تحديداً أولاً كي لا تُختطف أعمدتها («سعر الوحدة» قبل «الوحدة»)
  const cCat  =pick(["البندالعام","التصنيف","النوع","القسم","تصنيف","category","type"]);
  const cPrice=pick(["سعرالوحدة","السعر","سعر","price","rate","unitprice"]);
  const cQty  =pick(["الكمية","العدد","كمية","qty","quantity"]);
  const cUnit =pick(["الوحدة","وحدة","unit"]);
  const cDesc =pick(["البند","الوصف","البيان","الصنف","المادة","اسمالبند","description","item","name"]);
  const out=[];
  rows.forEach(row=>{
    const desc=cDesc?row[cDesc]:"";
    if(!String(desc||"").trim()) return;
    out.push({
      id:_uid(),
      desc:String(desc).trim().slice(0,120),
      categoryKey:_catKeyFromName(cCat?row[cCat]:""),
      unit:String((cUnit?row[cUnit]:"")||"").trim().slice(0,20),
      qty:_boqNum(cQty?row[cQty]:0),
      unitPrice:_boqNum(cPrice?row[cPrice]:0)
    });
  });
  return out;
}
function importBoqExcel(){
  if(!_canEdit()){ _toast("🔒 التحرير للأدمن أو مدير المشاريع","warn"); return; }
  if(typeof XLSX==="undefined"){ _toast("⚠ مكتبة Excel غير محمّلة — حدّث الصفحة وأعد المحاولة","warn"); return; }
  const inp=document.createElement("input");
  inp.type="file"; inp.accept=".xlsx,.xls,.csv"; inp.style.display="none";
  inp.onchange=function(){
    const f=inp.files&&inp.files[0]; if(!f) return;
    const reader=new FileReader();
    reader.onload=function(e){
      try{
        const wb=XLSX.read(new Uint8Array(e.target.result),{type:"array"});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json(ws,{defval:""});
        const items=_parseBoqRows(rows);
        if(!items.length){ _toast("⚠ لم أتعرّف على بنود — تأكد أن الصف الأول عناوين: البند/البند العام/الوحدة/الكمية/سعر الوحدة","warn"); return; }
        if(!_boqEditing){ editBoq(); } else { _syncBoqDraft(); }
        _boqDraft=(_boqDraft||[]).concat(items);
        _boqEditing=true; renderTabBody();
        _toast("✅ استُورد "+items.length+" بند من Excel — راجعها ثم اضغط «حفظ»","success");
      }catch(err){ console.warn("importBoqExcel",err); _toast("⚠ تعذّر قراءة الملف: "+((err&&err.message)||""),"warn"); }
    };
    reader.readAsArrayBuffer(f);
  };
  document.body.appendChild(inp); inp.click();
  setTimeout(()=>{ try{ inp.remove(); }catch(_e){} }, 60000);
}

/* ════════════════════════════════════════════════════════════
   الجدول الزمني (لمشاريع الإنشاءات/الترميم) — عرض/توليد بالـ AI/تحرير/متابعة
   ════════════════════════════════════════════════════════════ */
let _schedEditing=false, _schedGenForm=false, _schedDraft=null, _uidC=0, _genErr="";
function _uid(){ return "ph_"+Date.now()+"_"+(_uidC++); }
function _parseD(s){ const d=new Date(String(s||"")+"T12:00:00"); return isNaN(d.getTime())?new Date():d; }
function _fmtD(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function _addDays(s,n){ const d=_parseD(s); d.setDate(d.getDate()+(parseInt(n)||0)); return _fmtD(d); }
function _phaseEnd(ph){ return _addDays(ph.start, Math.max(1,parseInt(ph.durationDays)||1)); }
function _normDate(v, fallback){ const d=new Date(String(v||"")+"T12:00:00"); return isNaN(d.getTime()) ? (fallback||_fmtD(new Date())) : _fmtD(d); }
function _extractJSON(txt){
  if(!txt) return null;
  let t=String(txt).replace(/```json/gi,"```").replace(/```/g,"").trim();
  const strip=s=>s.replace(/,\s*([}\]])/g,"$1"); // إزالة الفواصل الزائدة قبل } أو ]
  const a=t.indexOf("{"), b=t.lastIndexOf("}");
  if(a>=0 && b>a){ try{ return JSON.parse(strip(t.slice(a,b+1))); }catch(e){} }
  // محاولة أخيرة: التقط مصفوفة المراحل مباشرةً ولفّها
  const m=t.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if(m){ try{ return { phases: JSON.parse(strip(m[0])) }; }catch(e){} }
  return null;
}
function _phaseStatus(ph){
  const start=_parseD(ph.start), end=_parseD(_phaseEnd(ph)), now=new Date();
  const prog=Math.max(0,Math.min(100,Number(ph.progress)||0));
  if(prog>=100) return { lbl:"مكتملة", color:"var(--accent)" };
  if(now<start)  return { lbl:"لم تبدأ", color:"var(--muted)" };
  const span=Math.max(end-start,1), expected=Math.max(0,Math.min(100,(now-start)/span*100));
  if(prog >= expected-10) return { lbl:"على المسار", color:"var(--info)" };
  return { lbl:"متأخّرة", color:"var(--danger)" };
}
function scheduleOverall(phases){ return phases.length ? Math.round(phases.reduce((a,p)=>a+(Math.max(0,Math.min(100,Number(p.progress)||0))),0)/phases.length) : 0; }

function _ganttStrip(phases){
  const starts=phases.map(p=>_parseD(p.start).getTime());
  const ends=phases.map(p=>_parseD(_phaseEnd(p)).getTime());
  const min=Math.min.apply(null,starts), max=Math.max.apply(null,ends), span=Math.max(max-min,86400000);
  return `<div class="pm-gantt">`+phases.map(p=>{
    const st=_parseD(p.start).getTime(), en=_parseD(_phaseEnd(p)).getTime();
    const right=(st-min)/span*100, width=Math.max((en-st)/span*100,1.5);
    const stt=_phaseStatus(p), prog=Math.max(0,Math.min(100,Number(p.progress)||0));
    return `<div class="pm-gseg" title="${_esc(p.name)}" style="right:${right}%;width:${width}%;background:${stt.color}"><i style="width:${prog}%"></i></div>`;
  }).join("")+`</div>`;
}

function scheduleHTML(){
  const s=_scheduleCache[_curId]||{phases:[]};
  const phases=s.phases||[];
  const canEdit=_canEdit();
  if(_schedGenForm) return _genFormHTML();
  if(_schedEditing) return _schedEditHTML(_schedDraft||[], canEdit);
  if(!phases.length){
    return `
      <div class="pm-hint" style="margin-top:0">لا يوجد جدول زمني بعد. ولّد جدولاً مبدئياً بالذكاء الاصطناعي ثم عدّله، أو أضف المراحل يدوياً.</div>
      ${canEdit?`<div class="pm-sched-tools">
        <button class="btn btn-primary btn-sm" onclick="projectMgmt.aiGenSchedule()">${_icon('activity')} توليد بالذكاء الاصطناعي</button>
        <button class="btn btn-ghost btn-sm" onclick="projectMgmt.editSchedule()">${_icon('plus')} إضافة يدوياً</button>
      </div>`:`<span class="pm-hint-inline">لا مراحل بعد — التحرير للأدمن أو مدير المشاريع.</span>`}`;
  }
  const overall=scheduleOverall(phases);
  return `
    ${canEdit?`<div class="pm-sched-tools">
      <button class="btn btn-primary btn-sm" onclick="projectMgmt.editSchedule()">${_icon('edit')} تعديل المراحل</button>
      <button class="btn btn-ghost btn-sm" onclick="projectMgmt.aiGenSchedule()">${_icon('activity')} إعادة توليد بالـ AI</button>
    </div>`:''}
    <div class="pm-sched-overall">
      <div class="pm-sched-overall-lbl">إجمالي الإنجاز <b>${overall}%</b> · ${phases.length} مرحلة</div>
      <div class="pm-progress"><div class="pm-progress-fill" style="width:${overall}%;background:var(--accent)"></div></div>
    </div>
    ${_ganttStrip(phases)}
    <div class="pm-phases">
      ${phases.map((p,i)=>{
        const stt=_phaseStatus(p), prog=Math.max(0,Math.min(100,Number(p.progress)||0));
        return `<div class="pm-phase">
          <div class="pm-phase-head">
            <span class="pm-phase-name">${_esc(p.name)}</span>
            <span class="badge" style="background:var(--surface2);color:${stt.color}">${stt.lbl}</span>
          </div>
          <div class="pm-phase-meta">${_esc(p.start)} ← ${_esc(_phaseEnd(p))} · ${Math.max(1,parseInt(p.durationDays)||1)} يوم</div>
          <div class="pm-phase-progline">
            <div class="pm-bar" style="flex:1"><div class="pm-bar-fill" style="width:${prog}%;background:${stt.color}"></div></div>
            ${canEdit
              ? `<input type="number" min="0" max="100" class="form-input pm-prog-inp" value="${prog}" onchange="projectMgmt.setProgress(${i}, this.value)"><span class="pm-phase-progv">%</span>`
              : `<span class="pm-phase-progv">${prog}%</span>`}
          </div>
        </div>`;
      }).join("")}
    </div>`;
}

function _budgetLinesFor(projId){
  const b=_budgetCache[projId]||{categories:[]};
  return (b.categories||[]).filter(c=>Number(c.planned)>0)
    .map(c=>({ name: CAT_NAME[c.key]||c.name||c.key, planned:Number(c.planned) }));
}
function _genFormHTML(){
  const p=_proj(_curId)||{};
  const lines=_budgetLinesFor(_curId);
  const defStart=_normDate(p.contractStart||"", _fmtD(new Date()));
  const defMonths=parseInt(p.contractMonths)||6;
  const note = lines.length
    ? `<div class="pm-hint" style="margin-top:0">سيقرأ الذكاء الاصطناعي <b>موازنة المشروع</b> (${lines.length} بند مرصود) ويولّد مراحل مطابقة للتخصصات وبأوزان قريبة من الميزانية. النطاق النصّي اختياري يُكمّلها.</div>`
    : `<div class="pm-hint" style="margin-top:0">لا توجد موازنة مرصودة بعد — يُفضّل إدخال الموازنة أولاً لدقّة أعلى. مؤقتاً اكتب نطاق العمل ليقترح الذكاء الاصطناعي المراحل.</div>`;
  const errBox = _genErr
    ? `<div class="pm-alert">${_icon('alertTriangle')} ${_esc(_genErr)}</div>
       <div class="pm-sched-tools" style="margin-top:0;margin-bottom:12px">
         <button class="btn btn-ghost btn-sm" onclick="projectMgmt.editSchedule()">${_icon('plus')} أضف المراحل يدوياً</button>
       </div>`
    : "";
  return `
    <div class="pm-gen-form">
      ${note}
      ${errBox}
      <label class="pm-gen-l">نطاق العمل (اختياري)</label>
      <textarea id="pm-gen-scope" class="form-input" rows="2" placeholder="مثال: فيلا دورين 400م² — أساسات + هيكل خرساني + مبانٍ + تشطيبات"></textarea>
      <div class="pm-gen-row">
        <div><label class="pm-gen-l">تاريخ البدء</label><input type="date" id="pm-gen-start" class="form-input" value="${defStart}"></div>
        <div><label class="pm-gen-l">المدة التقديرية (شهور)${p.contractMonths?' — من العقد':''}</label><input type="number" min="1" id="pm-gen-months" class="form-input" value="${defMonths}"></div>
      </div>
      <div class="pm-sched-tools" style="margin-top:12px">
        <button class="btn btn-primary btn-sm" id="pm-gen-btn" onclick="projectMgmt.doAiGen()">${_icon('activity')} ولّد الجدول</button>
        <button class="btn btn-ghost btn-sm" onclick="projectMgmt.cancelGen()">إلغاء</button>
      </div>
    </div>`;
}

function _schedEditHTML(phases, canEdit){
  return `
    <div class="pm-sched-tools">
      <button class="btn btn-primary btn-sm" onclick="projectMgmt.saveScheduleEdit()">${_icon('checkCircle')} حفظ</button>
      <button class="btn btn-ghost btn-sm" onclick="projectMgmt.cancelScheduleEdit()">إلغاء</button>
      <button class="btn btn-ghost btn-sm" onclick="projectMgmt.addPhase()">${_icon('plus')} إضافة مرحلة</button>
    </div>
    <div class="pm-table-wrap"><table class="pm-table">
      <thead><tr><th>المرحلة</th><th>البدء</th><th>مدة (يوم)</th><th></th></tr></thead>
      <tbody>
        ${phases.map((p,i)=>`<tr>
          <td><input class="form-input" data-f="name" data-i="${i}" value="${_esc(p.name)}"></td>
          <td><input type="date" class="form-input" data-f="start" data-i="${i}" value="${_esc(p.start)}"></td>
          <td><input type="number" min="1" class="form-input pm-inp-w" data-f="durationDays" data-i="${i}" value="${Math.max(1,parseInt(p.durationDays)||1)}"></td>
          <td><button class="btn btn-ghost btn-sm" title="حذف" onclick="projectMgmt.delPhase(${i})">${_icon('trash')}</button></td>
        </tr>`).join("")}
        ${phases.length?"":`<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:16px">لا مراحل — اضغط «إضافة مرحلة».</td></tr>`}
      </tbody>
    </table></div>`;
}

function _syncDraftFromInputs(){
  if(!_schedDraft) return;
  document.querySelectorAll("#pm-tab-body input[data-i]").forEach(inp=>{
    const i=parseInt(inp.dataset.i), f=inp.dataset.f;
    if(!_schedDraft[i]) return;
    _schedDraft[i][f] = (f==="durationDays") ? Math.max(1,parseInt(inp.value)||1) : inp.value;
  });
}
function editSchedule(){
  const s=_scheduleCache[_curId]||{phases:[]};
  _schedDraft = (s.phases||[]).map(p=>({ id:p.id||_uid(), name:p.name, start:p.start, durationDays:Math.max(1,parseInt(p.durationDays)||1), progress:Math.max(0,Math.min(100,Number(p.progress)||0)) }));
  _schedEditing=true; _schedGenForm=false; _genErr=""; renderTabBody();
}
function addPhase(){
  _syncDraftFromInputs();
  if(!_schedDraft) _schedDraft=[];
  const last=_schedDraft[_schedDraft.length-1];
  const start = last ? _phaseEnd(last) : _fmtD(new Date());
  _schedDraft.push({ id:_uid(), name:"مرحلة جديدة", start, durationDays:7, progress:0 });
  renderTabBody();
}
function delPhase(i){ _syncDraftFromInputs(); if(_schedDraft){ _schedDraft.splice(i,1); renderTabBody(); } }
function cancelScheduleEdit(){ _schedEditing=false; _schedDraft=null; renderTabBody(); }
async function saveScheduleEdit(){
  _syncDraftFromInputs();
  const phases=(_schedDraft||[]).filter(p=> String(p.name||"").trim()).map(p=>({
    id:p.id||_uid(), name:String(p.name).trim(), start:_normDate(p.start), durationDays:Math.max(1,parseInt(p.durationDays)||1), progress:Math.max(0,Math.min(100,Number(p.progress)||0))
  }));
  const ok=await saveSchedule(_curId, phases, false);
  if(ok){ _schedEditing=false; _schedDraft=null; _toast("✅ حُفظ الجدول","success"); renderTabBody(); }
}
async function setProgress(i, val){
  const s=_scheduleCache[_curId]; if(!s||!s.phases||!s.phases[i]) return;
  s.phases[i].progress = Math.max(0,Math.min(100,parseInt(val)||0));
  const ok=await saveSchedule(_curId, s.phases, s.generatedByAI);
  if(ok) renderTabBody();
}
function aiGenSchedule(){ _schedGenForm=true; _schedEditing=false; _genErr=""; renderTabBody(); }
function cancelGen(){ _schedGenForm=false; _genErr=""; renderTabBody(); }
async function doAiGen(){
  if(typeof _aiText!=="function"){ _toast("⚠ الذكاء الاصطناعي غير مُفعّل — فعّله من: الإدارة › إعدادات الذكاء الاصطناعي","warn"); return; }
  const scope=(document.getElementById("pm-gen-scope")||{}).value||"";
  const start=_normDate((document.getElementById("pm-gen-start")||{}).value||"");
  const months=parseInt((document.getElementById("pm-gen-months")||{}).value)||6;
  const p=_proj(_curId), t=effType(_curId), tLbl=PROJECT_TYPES[t]||"مشروع";
  // نغذّي الـ AI بموازنة المشروع (التخصصات وأوزانها المالية) فتخرج المراحل مطابقة للواقع
  const lines=_budgetLinesFor(_curId);
  const budgetStr = lines.length ? lines.map(c=>c.name+": "+c.planned.toLocaleString('en-US')).join("، ") : "";
  const btn=document.getElementById("pm-gen-btn"); if(btn){ btn.disabled=true; btn.textContent="⏳ جارٍ التوليد…"; }
  try{
    const prompt =
      "أنت مخطّط مشاريع إنشاءات محترف. أنشئ جدولاً زمنياً مبدئياً لمشروع \""+(p?p.name:"")+"\" (نوع: "+tLbl+").\n"+
      (budgetStr
        ? "بنود الموازنة المرصودة (تخصص: مبلغ بالريال): "+budgetStr+"\n"+
          "اجعل المراحل مغطّية لهذه التخصصات، ووزّع مدد المراحل بما يتناسب مع أوزانها المالية مع الترتيب المنطقي للتنفيذ.\n"
        : "")+
      "نطاق العمل: "+(scope||(budgetStr?"مستنتَج من بنود الموازنة أعلاه":"غير محدّد"))+"\n"+
      "تاريخ البدء: "+start+"\nالمدة التقديرية الإجمالية: "+months+" شهر.\n"+
      "أعطِ المراحل الرئيسية بالترتيب المنطقي للتنفيذ (بين 5 و 12 مرحلة)، بأسماء عربية مختصرة.\n"+
      "اجعل تواريخ البدء متتابعة منطقياً بدءاً من تاريخ البدء، ومجموع المدد قريباً من المدة التقديرية.\n"+
      "أعِد JSON فقط بلا أي شرح، بهذا الشكل تماماً:\n"+
      "{\"phases\":[{\"name\":\"اسم المرحلة\",\"start\":\"YYYY-MM-DD\",\"durationDays\":30}]}";
    // محاولتان: النماذج أحياناً تُرجع نصّاً غير صالح؛ المحاولة الثانية غالباً تنجح
    let phases=null, lastErr="";
    for(let attempt=1; attempt<=2 && !phases; attempt++){
      let txt="";
      try{ txt=await _aiText([{role:"user",content:prompt}], {maxTokens:2500, temperature:0.25, feature:"الجدول الزمني"}); }
      catch(callErr){ lastErr=(callErr&&callErr.message)||"تعذّر الاتصال بالذكاء الاصطناعي"; console.warn("doAiGen call#"+attempt,callErr); continue; }
      try{ console.log("[projectMgmt] AI schedule raw #"+attempt+":", txt); }catch(_e){}
      const j=_extractJSON(txt);
      if(j && Array.isArray(j.phases) && j.phases.length){
        let cursor=start;
        phases=j.phases.slice(0,40).map(ph=>{
          const st=_normDate(ph.start, cursor);
          const dur=Math.max(1,parseInt(ph.durationDays)||7);
          cursor=_addDays(st,dur);
          return { id:_uid(), name:String(ph.name||"مرحلة").trim().slice(0,80), start:st, durationDays:dur, progress:0 };
        });
      } else { lastErr="تعذّر قراءة رد الذكاء الاصطناعي"; }
    }
    if(!phases){
      _genErr = "تعذّر التوليد التلقائي"+(lastErr?" ("+lastErr+")":"")+". جرّب مرة أخرى، أو أضف المراحل يدوياً.";
      _toast("⚠ "+_genErr,"warn");
      renderTabBody();
      return;
    }
    const ok=await saveSchedule(_curId, phases, true);
    if(ok){ _schedGenForm=false; _genErr=""; _toast("✅ تم توليد الجدول — راجعه وعدّله","success"); renderTabBody(); }
    else if(btn){ btn.disabled=false; btn.innerHTML=_icon('activity')+" ولّد الجدول"; }
  }catch(e){
    console.warn("doAiGen",e);
    _genErr = "خطأ في التوليد: "+((e&&e.message)||"غير معروف")+". يمكنك إضافة المراحل يدوياً.";
    _toast("⚠ "+_genErr,"warn");
    renderTabBody();
  }
}

/* نوع المشروع */
function effType(projId){ return projectType(projId) || ((_proj(projId)||{}).type||""); }
function _projBadges(projId){
  const p=_proj(projId); if(!p) return "";
  const t=effType(projId);
  let out = t ? typeBadge(t) : "";
  if(p.manual) out += (out?" ":"")+'<span class="badge" style="background:var(--surface2);color:var(--muted)">'+_icon('edit')+' يدوي</span>';
  return out;
}
async function setType(type){
  const ok=await saveType(_curId, type);
  if(ok){
    if(_curTab==="schedule" && !needsSchedule(_curId)) _curTab="overview";
    _toast("✅ حُفظ نوع المشروع","success");
    const el=document.getElementById("page-"+PAGE_ID); if(el) renderCard(el);
  }
}

/* ── محرّر خريطة «نوع البند → بند الموازنة» (للأدمن) ── */
function renderCatMap(el){
  const types=_itemTypes();
  const opts=(sel)=> '<option value="">— غير مصنّف —</option>'+BUDGET_CATEGORIES.map(c=>`<option value="${c.key}" ${sel===c.key?'selected':''}>${_esc(c.name)}</option>`).join("");
  el.innerHTML = `
    <div class="pm-head">
      <button class="btn btn-ghost btn-sm pm-back" onclick="projectMgmt.closeCatMap()">${_icon('folderOpen')} كل المشاريع</button>
      <h2 class="pm-title">${_icon('tag')} ربط أنواع البنود ببنود الموازنة</h2>
      <div class="pm-sub">كل نوع بند في طلب الشراء يُنسَب لبند الموازنة المختار — فيتوزّع المصروف تلقائياً (يشمل الطلبات الحالية).</div>
    </div>
    <div class="pm-budget-tools">
      <button class="btn btn-primary btn-sm" onclick="projectMgmt.saveCatMapEdit()">${_icon('checkCircle')} حفظ</button>
      <button class="btn btn-ghost btn-sm" onclick="projectMgmt.closeCatMap()">إلغاء</button>
    </div>
    <div class="pm-table-wrap"><table class="pm-table">
      <thead><tr><th>نوع البند (في طلب الشراء)</th><th>بند الموازنة</th></tr></thead>
      <tbody>
        ${types.map(t=>`<tr>
          <td class="pm-td-name">${_esc(t)}</td>
          <td><select class="form-input" data-type="${_esc(t)}">${opts(_catForItemType(t))}</select></td>
        </tr>`).join("")}
      </tbody>
    </table></div>
    <div class="pm-hint">الافتراض ذكيّ للأنواع المدمجة؛ عدّل أي ربط ثم احفظ. الأنواع المخصّصة تبدأ «غير مصنّف».</div>`;
}
/* ── شاشة «استهلاك الذكاء الاصطناعي» (للأدمن) ── */
function renderUsage(el){
  const d=_usageData||{};
  const tot=d.total||{calls:0,inTok:0,outTok:0};
  const totCost=_estCostUSD(tot.inTok,tot.outTok);
  const months=d.months||{};
  const mkeys=Object.keys(months).sort().reverse();
  // تجميع حسب الميزة عبر كل الشهور
  const feat={};
  mkeys.forEach(k=>{ const f=(months[k]&&months[k].features)||{}; Object.keys(f).forEach(name=>{
    if(!feat[name]) feat[name]={calls:0,inTok:0,outTok:0};
    feat[name].calls+=Number(f[name].calls)||0; feat[name].inTok+=Number(f[name].inTok)||0; feat[name].outTok+=Number(f[name].outTok)||0;
  }); });
  const fkeys=Object.keys(feat).sort((a,b)=>_estCostUSD(feat[b].inTok,feat[b].outTok)-_estCostUSD(feat[a].inTok,feat[a].outTok));
  const card=(lbl,val,sc,sub)=>`<div class="stat-card" style="--sc:${sc}"><div class="sl">${lbl}</div><div class="sv">${val}</div>${sub?`<div class="click-hint">${sub}</div>`:""}</div>`;
  const empty = !tot.calls;
  el.innerHTML = `
    <div class="pm-head">
      <button class="btn btn-ghost btn-sm pm-back" onclick="projectMgmt.closeUsage()">${_icon('folderOpen')} كل المشاريع</button>
      <h2 class="pm-title">${_icon('activity')} استهلاك الذكاء الاصطناعي</h2>
      <div class="pm-sub">تقديري للمتابعة — الفاتورة الرسمية من Anthropic (console.anthropic.com). ${d.lastAt?'آخر استخدام: '+_esc(String(d.lastAt).slice(0,10)):''}</div>
    </div>
    ${empty ? `<div class="pm-hint" style="margin-top:0">لا يوجد استهلاك مسجّل بعد. سيبدأ التسجيل تلقائياً مع أول استخدام للذكاء الاصطناعي بعد هذا التحديث.</div>` : `
    <div class="pm-stats">
      ${card("عدد النداءات", money(tot.calls), "var(--primary)", "")}
      ${card("توكنز الإدخال", money(tot.inTok), "var(--info)", "")}
      ${card("توكنز الإخراج", money(tot.outTok), "var(--warn)", "")}
      ${card("التكلفة التقديرية", _usd(totCost), "var(--accent)", "≈ إجمالي")}
    </div>
    <div class="pm-table-wrap"><table class="pm-table">
      <thead><tr><th>الشهر</th><th>نداءات</th><th>إدخال</th><th>إخراج</th><th>تكلفة تقديرية</th></tr></thead>
      <tbody>
        ${mkeys.map(k=>{const m=months[k]||{};return `<tr>
          <td class="pm-td-name">${_esc(k)}</td>
          <td class="pm-num">${money(m.calls)}</td>
          <td class="pm-num">${money(m.inTok)}</td>
          <td class="pm-num">${money(m.outTok)}</td>
          <td class="pm-num">${_usd(_estCostUSD(m.inTok,m.outTok))}</td>
        </tr>`;}).join("")}
      </tbody>
    </table></div>
    <div class="pm-sched-overall-lbl" style="margin:16px 0 6px">حسب الميزة (كل الفترات)</div>
    <div class="pm-table-wrap"><table class="pm-table">
      <thead><tr><th>الميزة</th><th>نداءات</th><th>إدخال</th><th>إخراج</th><th>تكلفة تقديرية</th></tr></thead>
      <tbody>
        ${fkeys.map(n=>{const f=feat[n];return `<tr>
          <td class="pm-td-name">${_esc(n)}</td>
          <td class="pm-num">${money(f.calls)}</td>
          <td class="pm-num">${money(f.inTok)}</td>
          <td class="pm-num">${money(f.outTok)}</td>
          <td class="pm-num">${_usd(_estCostUSD(f.inTok,f.outTok))}</td>
        </tr>`;}).join("")}
      </tbody>
    </table></div>`}
    <div class="pm-hint">التكلفة تقديرية بأسعار فئة Sonnet (~$${AI_RATE_IN}/مليون إدخال، ~$${AI_RATE_OUT}/مليون إخراج). الأرقام الرسمية للفوترة من حساب Anthropic.</div>`;
}
function openUsage(){
  _usageView=true; _curId=null; _mapView=false;
  const el=document.getElementById("page-"+PAGE_ID);
  loadUsage().then(()=>{ if(_usageView && el) renderUsage(el); });
  if(el) renderUsage(el);
}
function closeUsage(){ _usageView=false; render(); }
// فتح الاستهلاك من قائمة «النظام» — يُظهر صفحة إدارة المشاريع ثم شاشة الاستهلاك
function openUsageFromNav(){
  if(!_canAccess()){ _toast("🔒 هذا القسم متاح للأدمن فقط حالياً","warn"); return; }
  _usageView=true; _curId=null; _mapView=false;
  try{ showPage("projects"); }catch(e){}
  const el=document.getElementById("page-"+PAGE_ID);
  loadUsage().then(()=>{ if(_usageView && el) renderUsage(el); });
  if(el) renderUsage(el);
}

function openCatMap(){
  _mapView=true; _curId=null; _usageView=false;
  const el=document.getElementById("page-"+PAGE_ID);
  if(_catMap===null){ loadCatMap().then(()=>{ if(_mapView && el) renderCatMap(el); }); }
  if(el) renderCatMap(el);
}
function closeCatMap(){ _mapView=false; render(); }
async function saveCatMapEdit(){
  const map={};
  document.querySelectorAll("#page-"+PAGE_ID+" select[data-type]").forEach(sel=>{
    const t=sel.getAttribute("data-type"), v=sel.value;
    if(t && v) map[t]=v; // الفارغ = «غير مصنّف» (افتراضي) فلا يُخزَّن
  });
  const ok=await saveCatMap(map);
  if(ok){ _mapView=false; _toast("✅ حُفظت خريطة البنود","success"); render(); }
}

/* ════════════════════════════════════════════════════════════
   التركيب الذاتي: صفحة + مجموعة قائمة جانبية + لفّ showPage
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

function injectCSS(){
  if(document.getElementById("pm-css")) return;
  const st=document.createElement("style"); st.id="pm-css";
  // النمط يعيد استخدام توكنز النظام (--primary/--surface/--muted...) وكلاساته الجاهزة
  // (.stat-card / .btn / .badge / .form-input) فيبقى مطابقاً للمنصة تلقائياً في الثيمين.
  st.textContent = `
#page-${PAGE_ID}{direction:rtl}
.pm-head{margin-bottom:16px}
.pm-title{font-size:19px;font-weight:800;font-family:'Cairo',sans-serif;color:var(--primary);margin:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pm-sub{font-size:12px;color:var(--muted);margin-top:5px}
.pm-back{margin-bottom:10px}
.pm-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:16px}
.pm-card{background:var(--surface);border:1px solid var(--border);border-top:3px solid var(--sc,var(--primary));border-radius:16px;padding:18px 16px;box-shadow:0 10px 26px rgba(20,30,55,0.08);cursor:pointer;transition:transform .18s,box-shadow .18s}
.pm-card:hover{transform:translateY(-4px);box-shadow:0 18px 40px rgba(20,30,55,0.14)}
.pm-card-top{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}
.pm-card-name{font-size:15px;font-weight:800;font-family:'Cairo',sans-serif;color:var(--primary)}
.pm-card-client{font-size:11px;color:var(--muted);margin-bottom:12px}
.pm-mini{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
.pm-mini>div{display:flex;flex-direction:column;gap:2px}
.pm-mini-l{font-size:10px;color:var(--muted);font-weight:600}
.pm-mini-v{font-size:15px;font-weight:800;font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;color:var(--text);direction:ltr;text-align:right}
.pm-bar{height:8px;background:var(--surface2);border-radius:20px;overflow:hidden}
.pm-bar-fill{height:100%;border-radius:20px;transition:width .4s}
.pm-bar-lbl{font-size:10px;color:var(--muted);margin-top:5px}
.pm-warn-txt{color:var(--warn)}
.pm-empty{grid-column:1/-1;text-align:center;color:var(--muted);padding:44px;font-size:13px}
.pm-tabs{display:flex;gap:4px;border-bottom:1px solid var(--border);margin:14px 0 16px}
.pm-tab{background:none;border:none;border-bottom:2px solid transparent;padding:9px 16px;font-family:'Cairo',sans-serif;font-size:13px;font-weight:700;color:var(--muted);cursor:pointer;margin-bottom:-1px}
.pm-tab:hover{color:var(--text)}
.pm-tab.on{color:var(--primary);border-bottom-color:var(--primary)}
.pm-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px}
.pm-stats .stat-card{cursor:default}
.pm-stats .sv{font-variant-numeric:tabular-nums;direction:ltr;text-align:right}
.pm-progress-wrap{margin-bottom:14px}
.pm-progress{height:12px;background:var(--surface2);border-radius:20px;overflow:hidden}
.pm-progress-fill{height:100%;border-radius:20px;transition:width .4s}
.pm-progress-lbl{font-size:11px;color:var(--muted);margin-top:6px}
.pm-alert{background:var(--surface2);border:1px solid var(--warn);color:var(--warn);border-radius:10px;padding:11px 14px;font-size:12px;font-weight:600;margin-bottom:10px}
.pm-hint{background:var(--surface2);border-radius:10px;padding:11px 14px;font-size:11px;color:var(--muted);margin-top:14px;line-height:1.8}
.pm-hint-inline{font-size:11px;color:var(--muted)}
.pm-budget-tools{display:flex;gap:8px;align-items:center;margin-bottom:14px}
.pm-table-wrap{background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);overflow-x:auto}
.pm-table{width:100%;border-collapse:collapse;font-size:12px}
.pm-table th{background:var(--surface2);padding:10px 12px;text-align:right;font-weight:700;color:var(--muted);font-size:11px;border-bottom:1px solid var(--border);white-space:nowrap}
.pm-table td{padding:9px 12px;border-bottom:1px solid var(--border)}
.pm-table tbody tr:last-child td{border-bottom:none}
.pm-table tfoot td{font-weight:800;background:var(--surface2);color:var(--text)}
.pm-td-name{font-weight:700;color:var(--text)}
.pm-num{direction:ltr;text-align:right;font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;color:var(--text)}
.pm-dim{color:var(--muted)}
.pm-tr-unc td{background:var(--surface2)}
.pm-boq-cat td{background:var(--surface2);font-weight:800;color:var(--primary)}
.form-input.pm-inp-w{width:110px;padding:6px 9px;font-size:12px;direction:ltr;text-align:left}
.pm-typebar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--surface2);border-radius:10px;padding:9px 13px;margin-bottom:14px;font-size:12px;color:var(--muted)}
.pm-type-sel{width:auto;min-width:150px;padding:6px 10px;font-size:12px}
.pm-sched-tools{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.pm-sched-overall{margin-bottom:14px}
.pm-sched-overall-lbl{font-size:12px;color:var(--muted);margin-bottom:6px}
.pm-sched-overall-lbl b{color:var(--text);font-size:15px;font-family:'JetBrains Mono',monospace}
.pm-gantt{position:relative;height:26px;background:var(--surface2);border-radius:8px;margin-bottom:16px;overflow:hidden;border:1px solid var(--border)}
.pm-gseg{position:absolute;top:3px;height:18px;border-radius:5px;opacity:.9;overflow:hidden;min-width:4px}
.pm-gseg i{display:block;height:100%;background:rgba(255,255,255,.4)}
.pm-phases{display:flex;flex-direction:column;gap:10px}
.pm-phase{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 14px;box-shadow:var(--shadow)}
.pm-phase-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px}
.pm-phase-name{font-weight:700;color:var(--text);font-size:13px}
.pm-phase-meta{font-size:11px;color:var(--muted);margin-bottom:9px;direction:ltr;text-align:right;font-family:'JetBrains Mono',monospace}
.pm-phase-progline{display:flex;align-items:center;gap:8px}
.pm-prog-inp{width:60px;padding:5px 8px;font-size:12px;direction:ltr;text-align:center}
.pm-phase-progv{font-size:12px;font-weight:700;color:var(--muted)}
.pm-gen-form{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;box-shadow:var(--shadow)}
.pm-gen-l{display:block;font-size:11px;font-weight:700;color:var(--muted);margin:10px 0 4px}
.pm-gen-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width:760px){ .pm-cards{grid-template-columns:1fr} .pm-gen-row{grid-template-columns:1fr} }
`;
  document.head.appendChild(st);
}

/* ══ حقن مجموعة «إدارة المشاريع» في القائمة الجانبية ══ */
function injectSidebarGroup(){
  // القفل: أزِل المجموعة إن ظهرت لغير المصرّح (مثلاً بعد تبديل المستخدم)، ولا تحقنها
  if(!_canAccess()){
    const h=document.getElementById("hdr-grp-projects"); if(h) h.remove();
    const g=document.getElementById("grp-projects");     if(g) g.remove();
    return;
  }
  if(document.getElementById("hdr-grp-projects")) return;
  const nav=document.querySelector(".sidebar-nav");
  if(!nav) return;
  const hdr=document.createElement("div");
  hdr.className="sidebar-group-header collapsed";
  hdr.id="hdr-grp-projects";
  hdr.setAttribute("onclick","toggleSidebarGroup('grp-projects')");
  hdr.innerHTML='<span class="s-icon">'+_svg('building2')+'</span> إدارة المشاريع <span class="grp-arrow" id="arrow-grp-projects">▾</span>';
  const grp=document.createElement("div");
  grp.className="sidebar-group collapsed";
  grp.id="grp-projects";
  grp.style.maxHeight="0";
  const btn=document.createElement("button");
  btn.className="sidebar-nav-btn sidebar-child";
  btn.id="nav-projects-btn";
  btn.dataset.page=PAGE_ID;
  btn.innerHTML='<span class="s-icon">'+_svg('clipboardList')+'</span> المشاريع';
  btn.onclick=()=>{ try{ showPage(PAGE_ID); }catch(e){} };
  grp.appendChild(btn);
  // نضعها بعد مجموعة المشتريات (grp-po) إن وُجدت، وإلا في نهاية القائمة
  const poGrp=document.getElementById("grp-po");
  if(poGrp && poGrp.nextSibling){ nav.insertBefore(hdr, poGrp.nextSibling); nav.insertBefore(grp, hdr.nextSibling); }
  else { nav.appendChild(hdr); nav.appendChild(grp); }
}

/* ══ حقن زر «استهلاك الذكاء الاصطناعي» في قائمة «النظام» (للأدمن) ══ */
function injectSystemButton(){
  if(!_canAccess()){ const ex=document.getElementById("nav-ai-usage-btn"); if(ex) ex.remove(); return; }
  if(document.getElementById("nav-ai-usage-btn")) return;
  const grp=document.getElementById("grp-system");
  if(!grp) return;
  const btn=document.createElement("button");
  btn.className="sidebar-nav-btn sidebar-child";
  btn.id="nav-ai-usage-btn";
  btn.innerHTML='<span class="s-icon">'+_svg('activity')+'</span> استهلاك الذكاء الاصطناعي';
  btn.onclick=()=>{ try{ openUsageFromNav(); }catch(e){} };
  grp.appendChild(btn);
}

/* ══ حقن زر «إدارة المشاريع» في الصفحة الخارجية (منتقي المشاريع) ══
   كيانٌ شامل لكل المشاريع بجوار زر «المشتريات المركزية» — بنفس طرازه للاتساق. */
function injectLandingButton(){
  if(!_canAccess()){ const ex=document.getElementById("pm-landing-btn-wrap"); if(ex) ex.remove(); return; }
  if(document.getElementById("pm-landing-btn-wrap")) return;
  const gpWrap = document.getElementById("global-purchases-btn-wrap"); // زر المشتريات المركزية
  const anchor = gpWrap || document.getElementById("project-add-btn");
  if(!anchor || !anchor.parentElement) return;
  const wrap = document.createElement("div");
  wrap.id = "pm-landing-btn-wrap";
  wrap.style.cssText = "margin:8px 0 4px;width:100%";
  wrap.innerHTML =
    '<button onclick="projectMgmt.openFromLanding()" style="width:100%;background:linear-gradient(135deg,#22497f 0%,#1b3a6b 55%,#142c52 100%);color:#fff;border:none;border-radius:14px;padding:14px 18px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:12px;box-shadow:0 8px 22px rgba(27,58,107,0.28), inset 0 1px 0 rgba(255,255,255,0.12);transition:opacity .15s" onmouseover="this.style.opacity=\'.9\'" onmouseout="this.style.opacity=\'1\'">' +
      '<span style="width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,0.13);display:flex;align-items:center;justify-content:center;flex-shrink:0">' + _svg('building2') + '</span>' +
      '<div style="text-align:right">' +
        '<div>إدارة المشاريع</div>' +
        '<div style="font-size:11px;opacity:.8;font-weight:400;margin-top:2px">الموازنة والتكلفة الفعلية لكل مشروع</div>' +
      '</div>' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:auto;opacity:.7"><polyline points="9 18 15 12 9 6"/></svg>' +
    '</button>';
  // ضعه مباشرةً بعد زر المشتريات المركزية (أو بعد زر الإضافة إن غاب)
  anchor.parentElement.insertBefore(wrap, anchor.nextSibling);
  // اضبط حجم أيقونة الـ SVG داخل الشارة (عناصر _svg بلا أبعاد صريحة)
  const ic = wrap.querySelector('span > svg'); if(ic){ ic.setAttribute('width','19'); ic.setAttribute('height','19'); ic.setAttribute('stroke-width','2'); }
}

/* ══ لفّ showPage دون تعديل النواة ══ */
function hookShowPage(){
  if(window._pmHooked || typeof window.showPage!=="function") return;
  const orig=window.showPage;
  window.showPage=function(id){
    // القفل: منع الوصول المباشر لغير المصرّح (deep-link/بقايا) — تحويل للوحة
    if(id===PAGE_ID && !_canAccess()){
      try{ toast("🔒 هذا القسم متاح للأدمن فقط حالياً","warn"); }catch(e){}
      return orig.apply(this, ["dashboard"]);
    }
    orig.apply(this, arguments);
    if(id===PAGE_ID){
      const pg=document.getElementById("page-"+PAGE_ID);
      if(!pg) return;
      // النواة لا تعرف صفحتنا فلا تُفعّلها — نُفعّلها نحن (ونطفئ البقية)
      document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
      pg.classList.add("active");
      try{
        const g=document.getElementById("grp-projects");
        if(g && g.classList.contains("collapsed") && typeof toggleSidebarGroup==="function") toggleSidebarGroup("grp-projects");
      }catch(e){}
      document.querySelectorAll(".sidebar-nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.page===PAGE_ID));
      render();
    }
  };
  window._pmHooked=true;
}

function init(){
  ensurePage();
  injectSidebarGroup();
  injectSystemButton();
  injectLandingButton();
  hookShowPage();
  // القائمة الجانبية والصفحة الخارجية قد يُعاد بناؤهما بعد الدخول — أعِد الحقن عند التغيير
  const obs=new MutationObserver(()=>{ injectSidebarGroup(); injectSystemButton(); injectLandingButton(); hookShowPage(); });
  obs.observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
else init();

/* ════════════ الواجهة العامة ════════════ */
window.projectMgmt = {
  render, open, openAt, back, tab, openFromLanding,
  editBudget, cancelEdit, saveBudgetEdit,
  editBoq, addBoqLine, delBoqLine, cancelBoqEdit, saveBoqEdit, importBoqExcel,
  _parseBoqRows,
  setType,
  openCatMap, closeCatMap, saveCatMapEdit,
  openUsage, closeUsage, openUsageFromNav,
  aiGenSchedule, doAiGen, cancelGen, editSchedule, addPhase, delPhase,
  saveScheduleEdit, cancelScheduleEdit, setProgress,
  startSync(){ /* لا مزامنة مستقلة — يقرأ purchases و_projectsList الحيّة */ },
  // مكشوفة لفحوص hail-tests (دوال نقية)
  _projectRollup: projectRollup,
  _rollupByCategory: rollupByCategory,
  _BUDGET_CATEGORIES: BUDGET_CATEGORIES
};
})();
