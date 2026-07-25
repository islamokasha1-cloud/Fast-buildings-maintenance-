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
  { key:"materials",     name:"خامات عامة" },
  { key:"plumbing",      name:"سباكة" },
  { key:"electrical",    name:"كهرباء" },
  { key:"plaster",       name:"محارة/بياض" },
  { key:"finishes",      name:"تشطيبات" },
  { key:"carpentry",     name:"نجارة" },
  { key:"aluminum",      name:"ألوميتال/زجاج" },
  { key:"labor",         name:"مصنعيات/عمالة" },
  { key:"subcontractor", name:"مقاول باطن" },
  { key:"equipment",     name:"معدات/إيجارات" },
  { key:"overhead",      name:"مصاريف إدارية" },
];
const UNCATEGORIZED = { key:"uncategorized", name:"غير مصنّف" };
const CAT_NAME = (()=>{ const m={}; BUDGET_CATEGORIES.concat([UNCATEGORIZED]).forEach(c=>m[c.key]=c.name); return m; })();

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
  const reg = getProjects().map(p=>({ id:p.id, name:p.name||p.id, type:p.type, client:p.client, location:p.location, manual:false }));
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
// توزيع الفعلي/المرتبط على البنود (بند الطلب = budgetCategoryKey، وإلا «غير مصنّف»)
function rollupByCategory(projId){
  const m={};
  const ensure=k=>{ if(!m[k]) m[k]={actual:0, committed:0}; return m[k]; };
  poForProject(projId).forEach(p=>{
    const k = (p.budgetCategoryKey && CAT_NAME[p.budgetCategoryKey]) ? p.budgetCategoryKey : "uncategorized";
    if(poClosed(p)) ensure(k).actual += poActual(p);
    else if(poWip(p)) ensure(k).committed += poTotal(p);
  });
  return m;
}

/* ════════════ تحميل/حفظ الموازنة ════════════ */
// مفتاح مستند آمن: المشروع اليدوي يُخزَّن بـ "mpn_<الاسم>" (لا بادئة "__" المحجوزة في
// Firestore، ولا "/") — فتُحفظ موازنته كأي مشروع دون تعارض.
function budgetDocPath(projId){
  let key = String(projId);
  if(key.indexOf(MANUAL_PREFIX)===0) key = "mpn_" + key.slice(MANUAL_PREFIX.length);
  key = key.replace(/\//g,"_");
  return "meta/"+key+"_budget";
}

async function loadBudget(projId){
  const database=_db();
  if(!database){ _budgetCache[projId]=_budgetCache[projId]||{categories:[],boq:[]}; return _budgetCache[projId]; }
  try{
    const snap = await database.doc(budgetDocPath(projId)).get();
    const d = (snap&&snap.exists) ? (snap.data()||{}) : {};
    _budgetCache[projId] = { categories: Array.isArray(d.categories)?d.categories:[], boq: Array.isArray(d.boq)?d.boq:[] };
  }catch(e){ console.warn("loadBudget",e); _budgetCache[projId]=_budgetCache[projId]||{categories:[],boq:[]}; }
  return _budgetCache[projId];
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

/* ════════════════════════════════════════════════════════════
   العرض
   ════════════════════════════════════════════════════════════ */
function render(){
  ensurePage();
  const el=document.getElementById("page-"+PAGE_ID);
  if(!el) return;
  if(_curId) renderCard(el);
  else renderList(el);
}

/* ── قائمة المشاريع ── */
function renderList(el){
  // حمّل أسماء المشاريع اليدوية مرة (meta) ثم أعد الرسم — المشتقّة من الطلبات تظهر فوراً
  if(!_manualLoaded && typeof _loadManualProjectNames==="function"){
    _manualLoaded=true;
    _loadManualProjectNames().then(()=>{ if(_curId==null) renderList(el); }).catch(()=>{});
  }
  const projects=allProjects();
  el.innerHTML = `
    <div class="pm-head">
      <h2 class="pm-title">${_icon('building2')} إدارة المشاريع</h2>
      <div class="pm-sub">الموازنة والمصروف الفعلي لكل مشروع — المصروف مسحوبٌ مباشرةً من المشتريات</div>
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
    const badge = p.manual
      ? '<span class="badge" style="background:var(--surface2);color:var(--muted)">'+_icon('edit')+' يدوي</span>'
      : typeBadge(p.type);
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
      <h2 class="pm-title">${_esc(name)} ${p?(p.manual?'<span class="badge" style="background:var(--surface2);color:var(--muted)">'+_icon('edit')+' يدوي</span>':typeBadge(p.type)):""}</h2>
      ${p&&p.client?`<div class="pm-sub">${_icon('users')} ${_esc(p.client)}${p.location?' — '+_icon('pin')+' '+_esc(p.location):''}</div>`:""}
    </div>
    <div class="pm-tabs">
      <button class="pm-tab ${_curTab==='overview'?'on':''}" data-tab="overview" onclick="projectMgmt.tab('overview')">نظرة عامة</button>
      <button class="pm-tab ${_curTab==='budget'?'on':''}" data-tab="budget" onclick="projectMgmt.tab('budget')">الموازنة</button>
    </div>
    <div id="pm-tab-body"></div>`;
  renderTabBody();
}
function tab(t){
  _curTab=t; _editing=false;
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
  else body.innerHTML = budgetHTML();
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
  return `
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
    <div class="pm-hint">المصروف والمرتبط يُحسبان من طلبات الشراء المربوطة بالمشروع. توزيعها على البنود يكتمل بعد إضافة حقل «بند الموازنة» على طلب الشراء (مرحلة تالية) — حتى ذلك الحين تظهر تحت «غير مصنّف».</div>`;
}

function editBudget(){ _editing=true; renderTabBody(); }
function cancelEdit(){ _editing=false; renderTabBody(); }

async function saveBudgetEdit(){
  const inputs=document.querySelectorAll("#pm-tab-body .pm-inp");
  const categories = BUDGET_CATEGORIES.map(cat=>{
    let planned=0;
    inputs.forEach(inp=>{ if(inp.dataset.cat===cat.key) planned=Number(inp.value)||0; });
    return { key:cat.key, name:cat.name, planned };
  });
  const ok = await saveBudget(_curId, categories);
  if(ok){ _editing=false; _toast("✅ حُفظت الموازنة","success"); renderTabBody(); }
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
.pm-num{direction:ltr;text-align:left;font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;color:var(--text)}
.pm-dim{color:var(--muted)}
.pm-tr-unc td{background:var(--surface2)}
.form-input.pm-inp-w{width:110px;padding:6px 9px;font-size:12px;direction:ltr;text-align:left}
@media (max-width:760px){ .pm-cards{grid-template-columns:1fr} }
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
  injectLandingButton();
  hookShowPage();
  // القائمة الجانبية والصفحة الخارجية قد يُعاد بناؤهما بعد الدخول — أعِد الحقن عند التغيير
  const obs=new MutationObserver(()=>{ injectSidebarGroup(); injectLandingButton(); hookShowPage(); });
  obs.observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
else init();

/* ════════════ الواجهة العامة ════════════ */
window.projectMgmt = {
  render, open, openAt, back, tab, openFromLanding,
  editBudget, cancelEdit, saveBudgetEdit,
  startSync(){ /* لا مزامنة مستقلة — يقرأ purchases و_projectsList الحيّة */ },
  // مكشوفة لفحوص hail-tests (دوال نقية)
  _projectRollup: projectRollup,
  _rollupByCategory: rollupByCategory,
  _BUDGET_CATEGORIES: BUDGET_CATEGORIES
};
})();
