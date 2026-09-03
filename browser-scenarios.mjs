// سيناريوهات اختبار في متصفّح Chromium حقيقي مع Firestore وهمي في الذاكرة.
// لا يلمس الإنتاج إطلاقاً — كل القراءة/الكتابة إلى window.__store داخل الصفحة.
//   node browser-scenarios.mjs
import { chromium } from 'playwright-core';

// ── Firebase وهمي يُحقَن قبل أي سكربت في الصفحة ──
const MOCK_FIREBASE = `
window.__store = {};                       // path -> data (Firestore في الذاكرة)
(function(){
  function keyDoc(p){ return p; }
  function snap(path){ var d=window.__store[path]; return { exists:d!==undefined, id:path.split('/').pop(), data:function(){return d||{};}, get:function(f){return (d||{})[f];} }; }
  function applyVal(cur,k,v){ if(v && v.__inc!==undefined) return (cur[k]||0)+v.__inc; if(v && v.__sv) return Date.now(); if(v && v.__del) return undefined; return v; }
  /* ── المستمعون أحياء: الكتابةُ تُبثّ فوراً كما يفعل Firestore ──
     المحاكي كان يستدعي onSnapshot مرّةً عند التركيب ولا يعود أبداً، فكان يُخفي
     صنفاً كاملاً من العلل: **تعويضُ الكمون**. في Firestore الحقيقيّ تصل اللقطةُ
     المحلّيةُ قبل أن يُحلَّ وعدُ set()، فمن يضيف الوثيقةَ يدوياً بعد الوعد يكرّرها.
     وقد وقع فعلاً: بطاقتان لطلب تعاقدٍ واحدٍ بالمعرّف نفسِه (بلاغُ المالك).
     (لا شرطةٌ مائلةٌ خلفيةٌ ولا علامةُ اقتباسٍ خلفيةٍ هنا — النصُّ كلُّه قالبٌ نصّيّ.) */
  var _subs = [];     // {coll|path, cb}
  function _emit(path){
    var coll = path.slice(0, path.lastIndexOf('/'));
    _subs.slice().forEach(function(s){
      try{ if(s.path === path) s.cb(snap(path)); else if(s.coll === coll) s.cb(collSnap(coll)); }catch(e){}
    });
  }
  function _sub(o){ _subs.push(o); return function(){ var i=_subs.indexOf(o); if(i>=0) _subs.splice(i,1); }; }
  function writeDoc(path,d,merge){ var cur=window.__store[path]||{}; var nd=merge?Object.assign({},cur):{}; for(var k in d){ var nv=applyVal(cur,k,d[k]); if(nv===undefined) delete nd[k]; else nd[k]=nv; } window.__store[path]=nd; _emit(path); }
  function delDoc(path){ delete window.__store[path]; _emit(path); }
  function docsUnder(coll){ return Object.keys(window.__store).filter(function(k){ return k.indexOf(coll+'/')===0 && k.slice(coll.length+1).indexOf('/')<0; }); }
  function docRef(path){ return {
    path:path, id:path.split('/').pop(),
    get:function(){ return Promise.resolve(snap(path)); },
    set:function(d,opt){ writeDoc(path,d,!!(opt&&opt.merge)); return Promise.resolve(); },
    update:function(d){ writeDoc(path,d,true); return Promise.resolve(); },
    delete:function(){ delDoc(path); return Promise.resolve(); },
    collection:function(c){ return collRef(path+'/'+c); },
    onSnapshot:function(cb){ try{ cb(snap(path)); }catch(e){} return _sub({ path:path, cb:cb }); }
  }; }
  /* ── الترتيب/الحدّ/المرساة: مُطبَّقةٌ على استعلامات documentId وحدَها ──
     v18.9xe: الفحصُ الشامل يقرأ على صفحاتٍ بمرساة documentId، ومحاكٍ يتجاهل
     limit/startAfter يجعل «فحصُ ٤٥٠ طلباً» يمرّ في صفحةٍ واحدةٍ فلا يُثبت الترقيمَ
     الذي هو جوهرُ الميزة. وتعميمُها على **كل** استعلامٍ يكسر سيناريوهاتٍ قائمةً
     تعتمد أنّ المحاكي يُرجع المجموعةَ كاملةً (مستمعو limit(400) مثلاً) — فيصير
     الفحصُ يقيس المحاكيَ لا النظام. فالنطاقُ مقصودٌ: documentId فقط. */
  function collSnap(coll, st){
    var paths=docsUnder(coll);
    if(st && st.ob==='__id__'){
      paths.sort();
      if(st.sa!=null) paths=paths.filter(function(p){ return p.slice(coll.length+1) > st.sa; });
      if(st.lim>0) paths=paths.slice(0, st.lim);
    }
    var ds=paths.map(snap);
    return { empty:ds.length===0, size:ds.length, docs:ds, forEach:function(f){ds.forEach(f);} };
  }
  /* ── docChanges(): كان غائباً عن المحاكي، فكلُّ منطقٍ يقرأ التغييراتَ (إشعاراتُ سطح
     المكتب) كان **غيرَ قابلٍ للفحص** — يرمي داخل معالج اللقطة ويُبتلَع صامتاً في الـ
     try/catch، فيمرّ الفحصُ وهو لا يُشغّل المنطقَ إطلاقاً. v18.9xg: يُحسَب لكلِّ اشتراكٍ
     على حِدة بمقارنة اللقطة بسابقتها — أوّلُ لقطةٍ كلُّها "added" كما في Firestore. */
  function _attachChanges(sn, state, coll){
    var cur = {};
    sn.docs.forEach(function(d){ cur[d.id] = JSON.stringify(d.data()); });
    var changes = [];
    sn.docs.forEach(function(d, i){
      var was = state.prev[d.id];
      if(was === undefined)      changes.push({ type:'added',    doc:d, newIndex:i, oldIndex:-1 });
      else if(was !== cur[d.id]) changes.push({ type:'modified', doc:d, newIndex:i, oldIndex:i });
    });
    Object.keys(state.prev).forEach(function(id){
      // المحذوفُ لم يبقَ في المخزن — نمرّر لقطتَه كما هي (exists:false)، ويكفي للنوع
      if(cur[id] === undefined) changes.push({ type:'removed', doc:snap(coll+'/'+id), newIndex:-1, oldIndex:0 });
    });
    state.prev = cur;
    sn.docChanges = function(){ return changes; };
    return sn;
  }
  function collRef(coll){ var st={ ob:null, lim:0, sa:null }; var q={
    doc:function(id){ return docRef(id? coll+'/'+id : coll+'/auto_'+Math.random().toString(36).slice(2)); },
    add:function(d){ var id='auto_'+Math.random().toString(36).slice(2); window.__store[coll+'/'+id]=d; _emit(coll+'/'+id); return Promise.resolve(docRef(coll+'/'+id)); },
    where:function(){ return q; },
    orderBy:function(f){ if(f && f.__docId) st.ob='__id__'; return q; },
    limit:function(n){ st.lim=n||0; return q; },
    startAfter:function(v){ st.sa=v; return q; },
    get:function(){ return Promise.resolve(collSnap(coll, st)); },
    onSnapshot:function(cb){
      var state={prev:{}};
      var wrapped=function(sn){ cb(_attachChanges(sn, state, coll)); };
      try{ wrapped(collSnap(coll, st)); }catch(e){}
      return _sub({ coll:coll, cb:wrapped });
    }
  }; return q; }
  var FieldValue={ serverTimestamp:function(){return {__sv:1};}, increment:function(n){return {__inc:n};}, arrayUnion:function(){return {};}, arrayRemove:function(){return {};}, delete:function(){return {__del:1};} };
  // نمذجة عزل Firestore التسلسلي: كل معاملة تُنفَّذ كاملةً قبل التالية (طابور)،
  // فلا تقرأ معاملتان العدّاد نفسه ثم تدهس إحداهما الأخرى — كضمان Firestore الفعلي.
  var __txq = Promise.resolve();
  var fs={ collection:collRef, doc:docRef, runTransaction:function(fn){
    var run=function(){
      var tx={ get:function(ref){ return Promise.resolve(snap(ref.path)); },
               set:function(ref,d,opt){ writeDoc(ref.path,d,!!(opt&&opt.merge)); },
               update:function(ref,d){ writeDoc(ref.path,d,true); },
               delete:function(ref){ delDoc(ref.path); } };
      return Promise.resolve().then(function(){ return fn(tx); });
    };
    var res = __txq.then(run, run);            // نفِّذ بعد المعاملة السابقة أياً كانت نتيجتها
    __txq = res.then(function(){}, function(){}); // لا يكسر الطابور خطأُ معاملةٍ ما
    return res;
  }, batch:function(){ return {
             set:function(ref,d,opt){ writeDoc(ref.path,d,!!(opt&&opt.merge)); },
             update:function(ref,d){ writeDoc(ref.path,d,true); },
             delete:function(ref){ delDoc(ref.path); },
             commit:function(){ return Promise.resolve(); } }; }};
  var firestoreFn=function(){ return fs; };
  firestoreFn.FieldValue=FieldValue;
  firestoreFn.FieldPath={ documentId:function(){ return {__docId:1}; } };
  firestoreFn.Timestamp={ now:function(){return {toDate:function(){return new Date();}};}, fromDate:function(d){return {toDate:function(){return d;}};} };
  window.firebase={
    initializeApp:function(){ return {}; },
    firestore:firestoreFn,
    // المستخدمُ المُصادَق: يحمل توكِناً وحمولةَ claims كما في Firebase الحقيقي.
    // الحمولةُ تُقرأ من window.__authClaims فيستطيع الفحصُ ضبطَ الدور — وهو ما
    // يجعل حارسَ H2 (الدورُ من التوكِن لا من الجلسة) قابلاً للفحص تنفيذاً.
    auth:function(){
      var _u={ uid:'test',
        getIdToken:function(){ return Promise.resolve(window.__authIdToken||'MOCK_ID_TOKEN'); },
        getIdTokenResult:function(){ return Promise.resolve({ claims: (window.__authClaims||{}) }); } };
      return { currentUser:_u, onAuthStateChanged:function(cb){ try{cb(_u);}catch(e){} return function(){}; }, signInAnonymously:function(){return Promise.resolve({});}, signInWithCustomToken:function(){return Promise.resolve({});}, signOut:function(){return Promise.resolve();} }; },
    appCheck:Object.assign(function(){ return { activate:function(){} }; }, { ReCaptchaEnterpriseProvider:function(){} }),
    storage:function(){ return { ref:function(){ return { put:function(){return Promise.resolve({ ref:{ getDownloadURL:function(){return Promise.resolve('mock://u');} } });}, getDownloadURL:function(){return Promise.resolve('mock://u');} }; }, refFromURL:function(){ return { delete:function(){return Promise.resolve();} }; } }; }
  };
})();
`;

function log(...a){ console.log(...a); }
let pass=0, fail=0;
function check(name, ok, detail){ if(ok){pass++; log('  ✅',name, detail?('— '+detail):'');} else {fail++; log('  ❌',name, detail?('— '+detail):'');} }

const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });
const page = await browser.newPage();
await page.addInitScript(MOCK_FIREBASE);
const boot=[];
page.on('pageerror', e=>boot.push(String(e.message).slice(0,120)));
await page.goto('file://'+process.cwd()+'/index.html', { waitUntil:'domcontentloaded', timeout:20000 });
await page.waitForTimeout(3000);

// تأكيد أن db صار مخزننا الوهمي
const dbOk = await page.evaluate(()=> typeof db!=='undefined' && !!db && typeof db.runTransaction==='function');
log('\n=== تهيئة ===');
check('التطبيق أقلع و db = المخزن الوهمي', dbOk);

/* ══ سيناريو 1: بلاغ + SLA «عادي» (16 ساعة عمل لا 48 تقويمية) ══ */
log('\n=== السيناريو 1: بلاغ + التزام SLA «عادي» ══');
const s1 = await page.evaluate(()=>{
  // بلاغ «عادي» أُغلق بعد فجوة كبيرة (تتجاوز 16 ساعة عمل بوضوح)
  const late = { status:'مغلق', priority:'عادي 🟢 (48 ساعة)', createdAt:'2026-03-01T08:00:00', closedAt:'2026-03-15T08:00:00' };
  // وبلاغ «عادي» أُغلق بسرعة (خلال ساعة)
  const fast = { status:'مغلق', priority:'عادي 🟢 (48 ساعة)', createdAt:'2026-03-01T08:00:00', closedAt:'2026-03-01T09:00:00' };
  const openLate = { status:'مفتوح', priority:'عادي 🟢 (48 ساعة)', createdAt:'2026-03-01T08:00:00' };
  return {
    lateOnTime: _closedOnTime(late),      // يجب false (تجاوز 16)
    fastOnTime: _closedOnTime(fast),      // يجب true
    openIsOverdue: isOverdue(openLate),   // يجب true (تجاوز مهلته)
    lateWorkH: Math.round(_closeWorkH(late))
  };
});
check('«عادي» بطيء ليس ملتزماً (المهلة 16 لا 48)', s1.lateOnTime===false, 'ساعات عمل='+s1.lateWorkH);
check('«عادي» سريع ملتزم', s1.fastOnTime===true);
check('«عادي» مفتوح ومتأخّر ⇒ isOverdue', s1.openIsOverdue===true);

/* ══ سيناريو 2: تطبيق جرد بانحراف الرصيد الحيّ ══ */
log('\n=== السيناريو 2: تطبيق جرد بانحراف اللقطة ══');
const s2 = await page.evaluate(async ()=>{
  const INV = INVENTORY_COLLECTION();
  // الرصيد الحيّ انحرف إلى 8 بعد بدء الجرد، ولقطة النظام المجمّدة = 5
  window.__store[INV+'/itemX'] = { currentQty:8, itemName:'صنف X', unit:'قطعة' };
  const take = { id:'take1', warehouseName:'مستودع أ',
    snapshot:[{ itemId:'itemX', itemName:'صنف X', unit:'قطعة', itemCode:'', category:'', systemQty:5 }] };
  const counts = { itemX: 5 };   // المعدود = اللقطة القديمة (5) — العطل القديم كان يتخطّاه
  const before = window.__store[INV+'/itemX'].currentQty;
  await window.stocktake._apply(take, counts, { approvedBy:'tester', approverRole:'admin', auto:true });
  return { before, after: window.__store[INV+'/itemX'].currentQty };
});
check('قبل: الرصيد الحيّ منحرف = 8', s2.before===8);
check('★ بعد التطبيق: صُحِّح إلى المعدود = 5 (لم يُتخطَّ رغم = اللقطة القديمة)', s2.after===5, 'الرصيد='+s2.after);

/* ══ سيناريو 3: إعادة حساب المخزون تعالج النقل (لا وحدات وهمية) ══ */
log('\n=== السيناريو 3: إعادة حساب المخزون مع حركة نقل ══');
const s3 = await page.evaluate(async ()=>{
  // تجاوز البوابات التفاعلية
  window.isAdmin = ()=>true; window.showConfirm = async ()=>true; window.toast = ()=>{};
  const INV = INVENTORY_COLLECTION(), LOG = INVENTORY_LOG_COLLECTION();
  // سجل حركات: دخول 50 للمصدر A، ثم نقل 20 من A إلى B
  window.__store = {};   // ابدأ نظيفاً
  window.__store[LOG+'/l1'] = { type:'in',       itemId:'A', qty:50, itemName:'صنف', unit:'قطعة' };
  window.__store[LOG+'/l2'] = { type:'transfer', itemId:'A', destItemId:'B', qty:20, itemName:'صنف', unit:'قطعة' };
  // ★ ووارد يدويّ على صنفٍ ثالث — كان يُسقَط كلَّه فيتلاشى المخزونُ المُدخَل يدوياً
  window.__store[LOG+'/l3'] = { type:'manual_in', itemId:'C', qty:40, itemName:'يدويّ', unit:'قطعة' };
  window.__store[LOG+'/l4'] = { type:'in',        itemId:'C', qty:50, itemName:'يدويّ', unit:'قطعة' };
  window.__store[LOG+'/l5'] = { type:'out',       itemId:'C', qty:12, itemName:'يدويّ', unit:'قطعة' };
  await recalcInventoryFromLog();
  return { A: (window.__store[INV+'/A']||{}).currentQty, B: (window.__store[INV+'/B']||{}).currentQty,
           C: (window.__store[INV+'/C']||{}).currentQty };
});
check('★ المصدر A = 30 (50 − نقل 20، لا 50 وهمية)', s3.A===30, 'A='+s3.A);
check('★ الوجهة B = 20 (أُضيف النقل)', s3.B===20, 'B='+s3.B);
/* ★★ الوارد اليدويّ يدخل إعادةَ الحساب — كان الشرطُ `t==="in"` وحدَه فلا يطابق
   "manual_in" فيسهم بصفر: 40 وحدةً مضافةً يدوياً **تتلاشى** ويخرج 38 بدل 78، بلا
   رسالةٍ في أيّ مكان. والرقمُ مقصودٌ ليفرّق: 90 لو أُضيفت مرّتين، 38 لو أُسقطت. */
check('★★ الوارد اليدويّ يُحتسَب في إعادة الحساب (40+50−12=78، لا 38)',
  s3.C===78, 'C='+s3.C);

/* ══ سيناريو 4: تدفّق اعتماد طلب الشراء (متعدّد الأدوار) ══ */
log('\n=== السيناريو 4: تدفّق اعتماد طلب الشراء ══');
const s4 = await page.evaluate(async ()=>{
  const out={};
  // استرجع فحوص الأدوار الحقيقية (السيناريو 3 كان دهس isAdmin=()=>true) — القرار يُقاد بالدور
  window.isAdmin            = ()=> !!(currentUser && currentUser.role==='admin');
  window.isWarehouseManager = ()=> !!(currentUser && currentUser.role==='warehouse_manager');
  window.isProcurementOfficer= ()=> !!(currentUser && currentUser.role==='procurement_officer');
  // كتم التأثيرات الجانبية (بلا تعطيل منطق القرار)
  window.showConfirm = async ()=>true;
  const toasts=[]; window.toast=(m,t)=>toasts.push({m:String(m),t});
  window.renderPurchases=()=>{}; window.updatePurchaseBadge=()=>{};
  window.logAudit=()=>{}; window._sendPurchaseWorkflowNotif=()=>{}; window.closeModal=()=>{};
  const PC = PURCHASES_COLLECTION();

  const setSel=(v)=>{ const e=document.getElementById('pu-status'); e.innerHTML='<option value="'+v+'"></option>'; e.value=v; };
  const setVal=(id,v)=>{ const e=document.getElementById(id); if(e) e.value=(v==null?'':String(v)); };
  const clearFields=()=>{ ['pu-actual-cost','pu-vendor','pu-invoice','pu-update-notes','pu-update-date','pu-delivery-date'].forEach(id=>setVal(id,'')); };
  const seed=(po)=>{ purchases=[po]; window.__store[PC+'/'+po.id]=Object.assign({},po); document.getElementById('pu-id').value=po.id; clearFields(); };
  const cur=(id)=>(purchases.find(x=>x.id===id)||{}).status;
  const P=(id)=>purchases.find(x=>x.id===id);

  /* ── أ) تدرّج سليم بالأدوار: طلب صغير (500 < عتبة المدير التنفيذي 2000) ── */
  const POA={ id:'POA', status:'pending_pm', building:'مبنى', items:[{itemName:'x',itemCost:500}], createdAt:'2026-01-01T08:00:00' };

  currentUser={name:'مدير المشاريع', role:'project_manager'};
  seed(POA);
  out.pmOffers=getAvailableStatuses('pending_pm',POA).map(s=>s.v);
  setSel('pm_approved'); setVal('pu-update-notes','اعتماد');
  await doUpdatePurchaseStatus();
  out.afterPM=cur('POA');
  out.approvedAtStamped=!!(P('POA')&&P('POA').approvedAt);
  const approvedAt1=P('POA').approvedAt;

  currentUser={name:'أمين المستودع', role:'warehouse_manager'};
  document.getElementById('pu-id').value='POA'; clearFields(); setVal('pu-update-notes','مراجعة');
  out.whOffers=getAvailableStatuses(cur('POA'),P('POA')).map(s=>s.v);
  setSel('wh_reviewed');
  await doUpdatePurchaseStatus();
  out.afterWH=cur('POA');

  currentUser={name:'مسؤول المشتريات', role:'procurement_officer'};
  document.getElementById('pu-id').value='POA'; clearFields(); setVal('pu-update-notes','تنفيذ');
  out.procOffers=getAvailableStatuses(cur('POA'),P('POA')).map(s=>s.v);
  setSel('proc_executing');
  await doUpdatePurchaseStatus();
  out.afterProc=cur('POA');
  out.approvedAtUnchanged=(P('POA').approvedAt===approvedAt1);

  /* ── ب) بوّابة الصلاحية: دور خاطئ لا يُقدَّم له إجراء ولا يُغيّر الحالة ── */
  const POB={ id:'POB', status:'pending_pm', building:'م', items:[{itemName:'x',itemCost:300}], createdAt:'2026-01-01T08:00:00' };
  currentUser={name:'أمين المستودع', role:'warehouse_manager'};
  seed(POB);
  out.wrongRoleOffers=getAvailableStatuses('pending_pm',POB).map(s=>s.v);
  setSel('wh_reviewed'); setVal('pu-update-notes','محاولة تجاوز');
  await doUpdatePurchaseStatus();
  out.afterWrongRole=cur('POB');

  /* ── ج) حارس التزامن: مستخدم آخر اعتمد الطلب بينما مودالنا مفتوح ── */
  const POC={ id:'POC', status:'pending_pm', building:'م', items:[{itemName:'x',itemCost:300}], createdAt:'2026-01-01T08:00:00' };
  currentUser={name:'مدير المشاريع', role:'project_manager'};
  seed(POC);
  window.__store[PC+'/POC'].status='pm_approved';   // كتابة مستخدمٍ آخر سبقتنا
  setSel('pm_rejected'); setVal('pu-update-notes','رفض متأخّر');
  await doUpdatePurchaseStatus();
  out.raceStored=(window.__store[PC+'/POC']||{}).status;   // يجب pm_approved لا rejected
  out.raceWarned=toasts.some(t=>/مستخدم آخر/.test(t.m));

  /* ── د) توجيه عتبة المدير التنفيذي: طلب كبير (5000 ≥ 2000) ── */
  const POD={ id:'POD', status:'wh_reviewed', building:'م', items:[{itemName:'x',itemCost:5000}], createdAt:'2026-01-01T08:00:00' };
  currentUser={name:'مسؤول المشتريات', role:'procurement_officer'};
  seed(POD);
  const bigOffers=getAvailableStatuses('wh_reviewed',POD).map(s=>s.v);
  out.bigOffersCEO=bigOffers.includes('pending_ceo');
  out.bigOffersNoDirect=!bigOffers.includes('proc_executing');

  /* ── هـ) الرفض بلا سبب مرفوض ── */
  const POE={ id:'POE', status:'pending_pm', building:'م', items:[{itemName:'x',itemCost:300}], createdAt:'2026-01-01T08:00:00' };
  currentUser={name:'مدير المشاريع', role:'project_manager'};
  seed(POE);
  setSel('pm_rejected'); setVal('pu-update-notes','');   // بلا سبب
  await doUpdatePurchaseStatus();
  out.rejectNoReason=cur('POE');

  return out;
});
check('أ) المدير يُعرض له «اعتماد» (pm_approved)', s4.pmOffers.includes('pm_approved'));
check('أ) بعد اعتماد المدير ⇒ pm_approved', s4.afterPM==='pm_approved', 'الحالة='+s4.afterPM);
check('أ) طابع الاعتماد (approvedAt) خُتم', s4.approvedAtStamped===true);
check('أ) المستودع يُعرض له «تمت المراجعة»', s4.whOffers.includes('wh_reviewed'));
check('أ) بعد مراجعة المستودع ⇒ wh_reviewed', s4.afterWH==='wh_reviewed', 'الحالة='+s4.afterWH);
check('أ) المشتريات يُعرض له «بدء التنفيذ»', s4.procOffers.includes('proc_executing'));
check('أ) بعد اعتماد المشتريات ⇒ proc_executing', s4.afterProc==='proc_executing', 'الحالة='+s4.afterProc);
check('أ) ★ طابع الاعتماد لم يتبدّل عبر المراحل', s4.approvedAtUnchanged===true);
check('ب) ★ الدور الخاطئ لا يُقدَّم له إجراء', s4.wrongRoleOffers.length===0, 'عدد الخيارات='+s4.wrongRoleOffers.length);
check('ب) ★ الدور الخاطئ لم يُغيّر الحالة', s4.afterWrongRole==='pending_pm', 'الحالة='+s4.afterWrongRole);
check('ج) ★ حارس التزامن منع دهس اعتماد سابق', s4.raceStored==='pm_approved', 'المخزن='+s4.raceStored);
check('ج) أُبلغ المستخدم بتغيّر الحالة', s4.raceWarned===true);
check('د) ★ الطلب الكبير يُوجَّه للمدير التنفيذي', s4.bigOffersCEO===true);
check('د) ★ الطلب الكبير لا تنفيذ مباشر دون اعتماد', s4.bigOffersNoDirect===true);
check('هـ) ★ الرفض بلا سبب مرفوض', s4.rejectNoReason==='pending_pm', 'الحالة='+s4.rejectNoReason);

/* ══ سيناريو 5: تدقيق الاستلام وإصدار سند الاستلام (GRN) + دخول رصيد المخزون ══ */
log('\n=== السيناريو 5: تدقيق الاستلام وإصدار سند الاستلام ══');
const s5 = await page.evaluate(async ()=>{
  const out={};
  // أدوار حقيقية مقادة بالدور + كتم التأثيرات الجانبية
  window.isAdmin            = ()=> !!(currentUser && currentUser.role==='admin');
  window.isWarehouseManager = ()=> !!(currentUser && currentUser.role==='warehouse_manager');
  window.showConfirm = async ()=>true;
  const toasts=[]; window.toast=(m)=>toasts.push(String(m));
  window.renderPurchases=()=>{}; window.updatePurchaseBadge=()=>{};
  window.addNotification=()=>{}; window.logAudit=()=>{};
  window.openModal=()=>{}; window.closeModal=()=>{};

  currentUser={name:'أمين المستودع', role:'warehouse_manager'};
  const INV=INVENTORY_COLLECTION(), LOG=INVENTORY_LOG_COLLECTION(), PC=PURCHASES_COLLECTION();
  window.__store={};   // ابدأ نظيفاً

  // رصيد ابتدائي للصنف = 10 متر (لنرى أن الاستلام يضيف فوقه لا يدهسه)
  window.__store[INV+'/itemK']={ itemId:'itemK', itemName:'كابل', unit:'متر', currentQty:10 };

  // طلب في مرحلة الاستلام، بفاتورة رفعتها المشتريات مسبقاً (فتُورَث — بلا رفع ملف)
  const PO={ id:'PO-RCV', building:'مبنى ١', status:'wh_receiving', vendor:'مورد الطلب',
    invoicePhotoUrl:'mock://inv.jpg',
    items:[{ itemName:'كابل', itemType:'كهرباء', itemId:'itemK', qty:6, unit:'متر', unitCost:12, itemCost:72 }],
    createdAt:'2026-01-01T08:00:00' };
  purchases=[PO];
  window.__store[PC+'/PO-RCV']=Object.assign({},PO);

  // افتح نافذة التدقيق — تبني الـ DOM الحقيقي (جدول البنود + صفّ الفاتورة)
  openWarehouseAudit('PO-RCV');

  // املأ النافذة كما يفعل أمين المستودع
  document.getElementById('wa-receiver-name').value='أحمد المستلم';
  document.getElementById('wa-warehouse-name').value='المستودع الرئيسي';
  const uid=_waInvoices[0].uid;
  document.querySelector('.wa-inv-vendor[data-uid="'+uid+'"]').value='المورد الفعلي';
  document.querySelector('.wa-inv-no[data-uid="'+uid+'"]').value='INV-778';
  // الكميات الافتراضية من openWarehouseAudit: مستلم=6، للمستودع=6، مباشر=0، سعر=12 — نتركها

  out.beforeQty=(window.__store[INV+'/itemK']||{}).currentQty;
  await doWarehouseAudit();

  const p=purchases.find(x=>x.id==='PO-RCV');
  const logs=Object.keys(window.__store).filter(k=>k.indexOf(LOG+'/')===0).map(k=>window.__store[k]);
  const inLogs=logs.filter(l=>l.type==='in');
  const grnMeta=window.__store[GRN_META_DOC()];
  out.status        = p.status;
  out.storedStatus  = (window.__store[PC+'/PO-RCV']||{}).status;
  out.afterQty      = (window.__store[INV+'/itemK']||{}).currentQty;
  out.grnCount      = (p.grnDocs||[]).length;
  out.grnRef        = p.grnRef||'';
  out.receivedQty   = p.receivedQty;
  out.receiverName  = p.receiverName;
  out.actualVendor  = p.actualVendor||'';
  out.inLogCount    = inLogs.length;
  out.inLogQty      = inLogs.reduce((s,l)=>s+(l.qty||0),0);
  out.inLogGrnRef   = (inLogs[0]||{}).grnRef||'';
  out.grnCounter    = grnMeta?grnMeta.counter:null;
  return out;
});
check('سند الاستلام صدر برقم GRN', /^GRN-\d{4}-\d{4}$/.test(s5.grnRef), 'رقم='+s5.grnRef);
check('عدّاد سندات الاستلام تقدّم إلى 1', s5.grnCounter===1);
check('سند واحد أُلحق بالطلب (grnDocs)', s5.grnCount===1);
check('قبل الاستلام: الرصيد = 10', s5.beforeQty===10);
check('★ بعد الاستلام: الرصيد = 16 (10 + 6 مستلمة)', s5.afterQty===16, 'الرصيد='+s5.afterQty);
check('★ حركة مخزون «in» كُتبت بالكمية 6', s5.inLogCount===1 && s5.inLogQty===6, 'عدد='+s5.inLogCount+' كمية='+s5.inLogQty);
check('حركة المخزون مرتبطة بسند الاستلام', s5.inLogGrnRef===s5.grnRef);
check('الكمية المستلمة المسجّلة = 6', s5.receivedQty===6, 'المستلم='+s5.receivedQty);
check('اسم المستلم حُفظ', s5.receiverName==='أحمد المستلم');
check('المورد الفعلي حُفظ من الفاتورة', s5.actualVendor==='المورد الفعلي', 'المورد='+s5.actualVendor);
check('★ الطلب أُغلق بعد اكتمال الاستلام', s5.status==='closed', 'الحالة='+s5.status);
check('الحالة «مغلق» ثبتت في المخزن', s5.storedStatus==='closed');

/* ══ سيناريو 6: سباق الكتابة على عدّاد الترقيم (تخصيص أرقام البلاغات متزامناً) ══ */
log('\n=== السيناريو 6: سباق الكتابة على عدّاد الترقيم ══');
const s6 = await page.evaluate(async ()=>{
  const out={}; const N=25;
  window.toast=()=>{}; window.safeLSSet=()=>{};

  // ── أ) المسار الحقيقي: newId() داخل معاملة ذرّية — 25 تخصيصاً متزامناً ──
  tickets=[]; counter=0;
  const META=META_DOC();
  delete window.__store[META];                    // ابدأ بعدّاد نظيف
  const ids = await Promise.all(Array.from({length:N}, ()=> newId()));
  const uniq = new Set(ids);
  const nums = ids.map(s=>{ const m=String(s).match(/BLG-\d{4}-(\d+)/); return m?parseInt(m[1],10):NaN; })
                  .sort((a,b)=>a-b);
  out.total       = ids.length;
  out.unique      = uniq.size;
  out.counterEnd  = (window.__store[META]||{}).counter;
  out.sequential  = nums.length===N && nums[0]===1 && nums[N-1]===N &&
                    nums.every((v,i)=> v===i+1);          // 1..N بلا ثغرات ولا تكرار
  out.sample      = ids.slice(0,3).join(', ');

  // ── ب) شاهد سلبي: مخصِّص ساذج بلا معاملة (اقرأ ثم اكتب) — يجب أن يتصادم ──
  // يثبت أن المحاكي يكشف السباق فعلاً، فنجاح (أ) ليس لأن كل شيء متسلسل تلقائياً.
  const NAIVE='meta/__naive_counter_test';
  delete window.__store[NAIVE];
  async function naiveId(){
    const snap = await db.doc(NAIVE).get();       // قراءة (تُنتِج فجوة تزامن)
    const c = ((snap.exists?snap.data().counter:0)||0) + 1;
    await Promise.resolve();                      // فجوة قبل الكتابة
    db.doc(NAIVE).set({counter:c},{merge:false}); // كتابة تدهس قراءة الآخرين
    return c;
  }
  const nIds = await Promise.all(Array.from({length:N}, ()=> naiveId()));
  out.naiveUnique = new Set(nIds).size;           // < N ⇒ وقع تصادم (تكرار)

  return out;
});
check('خُصِّص 25 رقماً', s6.total===25);
check('★ كل الأرقام فريدة (لا تكرار تحت التزامن)', s6.unique===25, 'الفريد='+s6.unique+'/25');
check('★ الأرقام متسلسلة 1..25 بلا ثغرات', s6.sequential===true);
check('عدّاد Firestore انتهى عند 25', s6.counterEnd===25, 'العدّاد='+s6.counterEnd);
check('عيّنة: '+s6.sample, /^BLG-\d{4}-0001/.test(s6.sample));
check('شاهد سلبي: المخصِّص الساذج تصادم (تكرار) — فالمحاكي يكشف السباق', s6.naiveUnique<25, 'الفريد الساذج='+s6.naiveUnique+'/25');

/* ══ سيناريو 7: أمر صرف من المخزون — خصم الرصيد ومنع الرصيد السالب ══ */
log('\n=== السيناريو 7: أمر صرف من المخزون وخصم الرصيد ══');
const s7 = await page.evaluate(async ()=>{
  const out={};
  window.isAdmin=()=>!!(currentUser&&currentUser.role==='admin');
  window.isWarehouseManager=()=>!!(currentUser&&currentUser.role==='warehouse_manager');
  const toasts=[]; window.toast=(m)=>toasts.push(String(m));
  window.renderInventory=()=>{}; window.renderIssueOrders=()=>{};
  window.printIssueOrder=()=>{}; window.showPage=()=>{}; window.logAudit=()=>{};

  currentUser={name:'أمين المستودع', role:'warehouse_manager'};
  const INV=INVENTORY_COLLECTION(), LOG=INVENTORY_LOG_COLLECTION(), IO=ISSUE_ORDERS_COLLECTION(), IM=ISSUE_META_DOC();
  window.__store={};

  // صنفان في المخزون: مسمار (متاح 20) لصرفٍ سليم، وصبغ (متاح 3) لاختبار المنع
  _inventoryItems=[
    { id:'itemS', itemName:'مسمار', unit:'علبة', itemCode:'C1', currentQty:20 },
    { id:'itemT', itemName:'صبغ',  unit:'لتر',  itemCode:'C2', currentQty:3  }
  ];
  window.__store[INV+'/itemS']={ itemId:'itemS', itemName:'مسمار', unit:'علبة', currentQty:20 };
  window.__store[INV+'/itemT']={ itemId:'itemT', itemName:'صبغ',  unit:'لتر',  currentQty:3  };
  _issueOrders=[];

  // مُعِين: يبني صفّ صنف في نموذج الصرف ويملأه كما يفعل المستخدم
  const buildRow=(itemId,qty,unit)=>{
    issueAddItemRow();
    const rows=document.querySelectorAll('#iss-items-wrap .iss-item-row');
    const rid=rows[rows.length-1].id;
    document.getElementById(rid+'-itemid').value=itemId;
    document.getElementById(rid+'-qty').value=String(qty);
    document.getElementById(rid+'-unit').value=unit;
    return rid;
  };
  const fillHeader=(recipient)=>{
    initIssueOrderPage();                 // يبني قائمة المشاريع (تشمل «يدوي») والتاريخ
    document.getElementById('iss-items-wrap').innerHTML='';   // ابدأ بلا صفوف
    document.getElementById('iss-recipient').value=recipient;
    document.getElementById('iss-project').value='__OTHER__';
    document.getElementById('iss-project-manual').value='مشروع أ';
  };

  // ── أ) صرف سليم: 5 من المسمار (متاح 20) ──
  fillHeader('محمد المستلم');
  buildRow('itemS',5,'علبة');
  out.beforeS=(window.__store[INV+'/itemS']||{}).currentQty;
  await issueOrderSubmit();
  out.afterS=(window.__store[INV+'/itemS']||{}).currentQty;
  const logs1=Object.keys(window.__store).filter(k=>k.indexOf(LOG+'/')===0).map(k=>window.__store[k]);
  const outLogsS=logs1.filter(l=>l.type==='out'&&l.itemId==='itemS');
  out.outLogS=outLogsS.length; out.outQtyS=(outLogsS[0]||{}).qty; out.outRef=(outLogsS[0]||{}).orderRef||'';
  const orders1=Object.keys(window.__store).filter(k=>k.indexOf(IO+'/')===0);
  out.orderCount1=orders1.length;
  out.orderStatus=orders1.length?(window.__store[orders1[0]]||{}).status:'';
  out.issCounter=(window.__store[IM]||{}).counter;

  // ── ب) منع الرصيد السالب: محاولة صرف 10 من الصبغ (متاح 3 فقط) ──
  fillHeader('خالد');
  buildRow('itemT',10,'لتر');
  await issueOrderSubmit();
  out.afterT=(window.__store[INV+'/itemT']||{}).currentQty;   // يجب أن يبقى 3
  const logs2=Object.keys(window.__store).filter(k=>k.indexOf(LOG+'/')===0).map(k=>window.__store[k]);
  out.outLogT=logs2.filter(l=>l.type==='out'&&l.itemId==='itemT').length;   // يجب 0
  out.orderCount2=Object.keys(window.__store).filter(k=>k.indexOf(IO+'/')===0).length; // يبقى 1
  out.blockedMsg=toasts.some(m=>/يتجاوز المتاح/.test(m));
  return out;
});
check('أ) قبل الصرف: رصيد المسمار = 20', s7.beforeS===20);
check('أ) ★ بعد صرف 5: الرصيد = 15 (خُصم فعلاً)', s7.afterS===15, 'الرصيد='+s7.afterS);
check('أ) حركة «out» كُتبت بالكمية 5', s7.outLogS===1 && s7.outQtyS===5, 'عدد='+s7.outLogS+' كمية='+s7.outQtyS);
check('أ) أمر صرف صدر برقم ISS ومربوط بالحركة', /^ISS-\d{4}-\d{4}$/.test(s7.outRef), 'رقم='+s7.outRef);
check('أ) أمر الصرف أُنشئ بحالة «بانتظار الاعتماد»', s7.orderCount1===1 && s7.orderStatus==='pending');
check('أ) عدّاد أوامر الصرف تقدّم إلى 1', s7.issCounter===1);
check('ب) ★ منع الرصيد السالب: رصيد الصبغ بقي 3', s7.afterT===3, 'الرصيد='+s7.afterT);
check('ب) ★ لم تُكتب حركة صرف للصبغ', s7.outLogT===0);
check('ب) ★ لم يُنشأ أمر صرف ثانٍ', s7.orderCount2===1, 'عدد الأوامر='+s7.orderCount2);
check('ب) أُبلغ المستخدم أن الكمية تتجاوز المتاح', s7.blockedMsg===true);

/* ══ سيناريو 8: حذف طلب شراء وعكس أثره على المخزون ══ */
log('\n=== السيناريو 8: حذف طلب شراء وأثره على المخزون ══');
const s8 = await page.evaluate(async ()=>{
  const out={};
  window.isAdmin=()=>!!(currentUser&&currentUser.role==='admin');
  window.showConfirm=()=>Promise.resolve(true);   // يؤكّد الحذف
  window.toast=()=>{}; window.renderPurchases=()=>{}; window.updatePurchaseBadge=()=>{};
  window.renderInventory=()=>{}; window.closeModal=()=>{}; window.logAudit=()=>{};

  currentUser={name:'المسؤول', role:'admin'};
  const INV=INVENTORY_COLLECTION(), LOG=INVENTORY_LOG_COLLECTION(), PC=PURCHASES_COLLECTION();

  // مُعِين: يشغّل deletePurchase (غير async) وينتظر اكتمال عكس المخزون + حذف الوثيقة
  const runDelete=async (poId)=>{
    deletePurchase(poId);
    for(let i=0;i<50 && window.__store[PC+'/'+poId]!==undefined;i++){ await new Promise(r=>setTimeout(r,10)); }
  };

  // ── أ) حذف طلب مستلَم: يُخرِج ما دخل المستودع (6) من رصيد 16 ⇒ 10 ──
  window.__store={};
  _inventoryItems=[{ id:'itemK', itemName:'كابل', unit:'متر', currentQty:16 }];
  window.__store[INV+'/itemK']={ itemId:'itemK', itemName:'كابل', unit:'متر', currentQty:16 };
  const PO1={ id:'PO-DEL1', building:'مبنى ١', status:'closed', vendor:'مورد',
    grnDocs:[{ grnRef:'GRN-2026-0001', items:[{ itemId:'itemK', itemName:'كابل', unit:'متر', stockQty:6 }] }],
    items:[{ itemId:'itemK', itemName:'كابل', unit:'متر', qty:6 }], createdAt:'2026-01-01T08:00:00' };
  purchases=[PO1];
  window.__store[PC+'/PO-DEL1']=Object.assign({},PO1);
  out.before1=(window.__store[INV+'/itemK']||{}).currentQty;
  await runDelete('PO-DEL1');
  out.after1=(window.__store[INV+'/itemK']||{}).currentQty;
  out.poGone1=window.__store[PC+'/PO-DEL1']===undefined;
  out.inArray1=purchases.some(x=>x.id==='PO-DEL1');
  const adjLogs=Object.keys(window.__store).filter(k=>k.indexOf(LOG+'/')===0)
                  .map(k=>window.__store[k]).filter(l=>l.type==='adjust'&&l.relatedPO==='PO-DEL1');
  out.adjCount1=adjLogs.length; out.adjDelta1=(adjLogs[0]||{}).adjustDelta;

  // ── ب) قصر عند الصفر: نفس العكس (−6) على رصيد 4 ⇒ 0 لا سالب ──
  window.__store={}; purchases=[];
  _inventoryItems=[{ id:'itemK', itemName:'كابل', unit:'متر', currentQty:4 }];
  window.__store[INV+'/itemK']={ itemId:'itemK', itemName:'كابل', unit:'متر', currentQty:4 };
  const PO2={ id:'PO-DEL2', building:'مبنى ٢', status:'closed', vendor:'مورد',
    grnDocs:[{ grnRef:'GRN-2026-0002', items:[{ itemId:'itemK', itemName:'كابل', unit:'متر', stockQty:6 }] }],
    items:[{ itemId:'itemK', itemName:'كابل', unit:'متر', qty:6 }], createdAt:'2026-01-01T08:00:00' };
  purchases=[PO2];
  window.__store[PC+'/PO-DEL2']=Object.assign({},PO2);
  await runDelete('PO-DEL2');
  out.after2=(window.__store[INV+'/itemK']||{}).currentQty;   // يجب 0 لا −2
  const adj2=Object.keys(window.__store).filter(k=>k.indexOf(LOG+'/')===0)
               .map(k=>window.__store[k]).filter(l=>l.type==='adjust'&&l.relatedPO==='PO-DEL2');
  out.adjDelta2=(adj2[0]||{}).adjustDelta;   // يبقى −6 (الأثر الحقيقي موثّق رغم القصر)
  return out;
});
check('أ) قبل الحذف: رصيد الكابل = 16', s8.before1===16);
check('أ) ★ بعد حذف الطلب المستلَم: الرصيد = 10 (أُخرج 6 المستلمة)', s8.after1===10, 'الرصيد='+s8.after1);
check('أ) حركة تسوية «adjust» كُتبت بدلتا −6', s8.adjCount1===1 && s8.adjDelta1===-6, 'دلتا='+s8.adjDelta1);
check('أ) وثيقة الطلب حُذفت من المخزن', s8.poGone1===true);
check('أ) الطلب أُزيل من القائمة المحلية', s8.inArray1===false);
check('ب) ★ القصر عند الصفر: 4 − 6 ⇒ 0 لا سالب', s8.after2===0, 'الرصيد='+s8.after2);
check('ب) دلتا السجل تبقى −6 (الأثر موثّق رغم القصر)', s8.adjDelta2===-6, 'دلتا='+s8.adjDelta2);

/* ══ سيناريو 9 (v18.9xd): إصلاحُ انزياح صفوف التدقيق — في متصفّحٍ حقيقيّ على مخزنٍ حقيقيّ ══
   البلاغ: عشراتُ قيود «انزياح صفوف التدقيق» على طلبين، تتكرّر من كلِّ جلسة. الشفاءُ كان
   معلّقاً على «افتح تعديل الطلب واحفظ» فلم يقع أبداً. هنا نُشغّل poFixAlignment الحقيقيّة
   ونتحقّق أنّ **المخزَّن** شُفي فعلاً — لا أنّ الشريطَ اختفى من الشاشة.                     */
log('\n=== السيناريو 9: إصلاح انزياح صفوف التدقيق (v18.9xd) ══');
const s9 = await page.evaluate(async ()=>{
  const out={}; window.__store={}; purchases=[];
  const PC = PURCHASES_COLLECTION();
  const toasts=[]; window.toast=(m,t)=>toasts.push({m:String(m),t});
  window.showConfirm = async ()=>true;
  window.logAudit=()=>{}; window.renderPurchases=()=>{}; window.openPurchaseDetail=()=>{};
  window.captureError=()=>{};

  // طلبٌ مُدقَّقٌ حُذف منه بندٌ بعد التدقيق ⇒ صفُّ تدقيقٍ زائدٌ يزيح كلَّ ما بعده
  const items=[{itemId:'a',itemName:'دهان',qty:2},{itemId:'b',itemName:'بلاستيك سوبر',qty:3},{itemId:'c',itemName:'فايبروساید',qty:1}];
  const auditItems=[
    {itemId:'a',itemName:'دهان',rcvQty:2,unitPrice:10},
    {itemId:'x',itemName:'مبيد حشري',rcvQty:5,unitPrice:99},   // بندٌ حُذف — صفُّه باقٍ
    {itemId:'b',itemName:'بلاستيك سوبر',rcvQty:3,unitPrice:20},
    {itemId:'c',itemName:'فايبروساید',rcvQty:1,unitPrice:30}];
  const PO={ id:'PO-ALIGN-1', status:'closed', building:'مبنى', auditedBy:'أمين المستودع',
             items, auditItems, timeline:[{event:'تدقيق'}], createdAt:'2026-01-01T08:00:00' };
  purchases=[JSON.parse(JSON.stringify(PO))];
  window.__store[PC+'/PO-ALIGN-1']=JSON.parse(JSON.stringify(PO));

  // الفحصُ الذاتيُّ يرصد الانزياحَ عند التحميل (نفسُ مسار _poHealItems)
  _poAuditSelfCheck(purchases[0]);
  out.detected = (_poAlignBreaks.get('PO-ALIGN-1')||[]).length;

  // (أ) دورٌ لا يملك الإصلاح: يُرفَض ولا يُكتب شيء
  currentUser={name:'محمد', role:'warehouse_manager'};
  await poFixAlignment('PO-ALIGN-1');
  out.deniedLen = (window.__store[PC+'/PO-ALIGN-1'].auditItems||[]).length;   // ما زال 4
  out.deniedToast = toasts.some(t=>t.m.indexOf('صلاحية مدير النظام')!==-1);

  // (ب) مدير النظام: الإصلاحُ يقع على المخزَّن
  currentUser={name:'مدير النظام', role:'admin'};
  await poFixAlignment('PO-ALIGN-1');
  const d = window.__store[PC+'/PO-ALIGN-1'];
  out.len       = (d.auditItems||[]).length;
  out.names     = (d.auditItems||[]).map(r=>r.itemName).join('|');
  out.rcv       = (d.auditItems||[]).map(r=>r.rcvQty).join(',');
  out.itemsLen  = (d.items||[]).length;
  out.itemNames = (d.items||[]).map(i=>i.itemName).join('|');   // البنودُ لم تُمَسّ
  out.preSaved  = Array.isArray(d.auditItemsPreAlign) && d.auditItemsPreAlign.length===4;
  out.tlFixed   = (d.timeline||[]).some(t=>t.code==='align_fixed');
  out.tlKept    = (d.timeline||[]).some(t=>t.event==='تدقيق');
  out.mapCleared= !_poAlignBreaks.has('PO-ALIGN-1');
  // الفحصُ على المخزَّن الطازج: العيبُ زال فعلاً لا أُسكِت
  out.rescan    = _poAlignScan({...d, id:'PO-ALIGN-1'}).length;

  // (ج) إعادةُ الإصلاح: idempotent — لا يدهس الدليلَ ولا يُضيف قيداً ثانياً
  const preRef = JSON.stringify(d.auditItemsPreAlign);
  await poFixAlignment('PO-ALIGN-1');
  const d2 = window.__store[PC+'/PO-ALIGN-1'];
  out.preIntact = JSON.stringify(d2.auditItemsPreAlign)===preRef;
  out.tlOnce    = (d2.timeline||[]).filter(t=>t.code==='align_fixed').length;
  return out;
});
check('9أ) الفحصُ الذاتيُّ رصد الانزياح عند التحميل', s9.detected>=2, 'مواضع='+s9.detected);
check('9ب) ★★ دورٌ لا يملك الإصلاح يُرفَض ولا يكتب في المخزَّن',
  s9.deniedLen===4 && s9.deniedToast===true, 'صفوف='+s9.deniedLen);
check('9ج) ★★ الإصلاحُ شفى المخزَّن فعلاً — ٣ صفوفٍ بترتيب البنود',
  s9.len===3 && s9.names==='دهان|بلاستيك سوبر|فايبروساید', s9.names);
check('9د) ★★ صفُّ البند المحذوف سقط وأرقامُ الاستلام تتبع بندَها', s9.rcv==='2,3,1', 'rcv='+s9.rcv);
check('9هـ) ★★ البنودُ لم تُمَسّ إطلاقاً (الكتابةُ على صفوف التدقيق وحدَها)',
  s9.itemsLen===3 && s9.itemNames==='دهان|بلاستيك سوبر|فايبروساید', s9.itemNames);
check('9و) ★★ الدليلُ محفوظ (auditItemsPreAlign) والسجلُّ يحمل قيدَ الإصلاح',
  s9.preSaved===true && s9.tlFixed===true && s9.tlKept===true);
check('9ز) ★★ إعادةُ الفحص على المخزَّن: لا انزياحَ — العيبُ زال لا أُسكِت', s9.rescan===0, 'مواضع='+s9.rescan);
check('9ح) ★ خريطةُ التشخيص نُظِّفت فيسقط الشريطُ فوراً', s9.mapCleared===true);
check('9ط) ★★ إعادةُ الإصلاح idempotent: الدليلُ لم يُدهس ولا قيدَ ثانٍ',
  s9.preIntact===true && s9.tlOnce===1, 'قيود='+s9.tlOnce);

/* ══ سيناريو 10 (v18.9xe): الفحصُ الشامل يعبُر حدَّ الـ ٤٠٠ ══
   الإصلاحُ الجماعيُّ السابق يرى ما حُمِّل في الجلسة فقط (مستمعٌ بـ limit(400))، فالطلبُ
   الأقدمُ منزاحٌ ولا أحدَ يعلم. هنا نزرع ٤٥٠ طلباً، ثلاثةٌ منها منزاحة — **واحدٌ بعد
   الـ ٤٠٠** — ونتحقّق أنّ الفحصَ الشامل يجدها كلَّها ثم يُصلحها.                       */
log('\n=== السيناريو 10: الفحصُ الشامل يعبُر حدَّ الـ ٤٠٠ (v18.9xe) ══');
const s10 = await page.evaluate(async ()=>{
  const out={}; window.__store={}; purchases=[];
  const PC = PURCHASES_COLLECTION();
  const toasts=[]; window.toast=(m,t)=>toasts.push({m:String(m),t});
  window.showConfirm = async ()=>true;
  window.logAudit=()=>{}; window.renderPurchases=()=>{}; window.captureError=()=>{};
  currentUser={name:'مدير النظام', role:'admin'};

  const items=[{itemId:'a',itemName:'دهان',qty:1},{itemId:'b',itemName:'بلاستيك',qty:1}];
  const good=[{itemId:'a',itemName:'دهان',rcvQty:1},{itemId:'b',itemName:'بلاستيك',rcvQty:2}];
  // صفٌّ يتيمٌ في المنتصف ⇒ انزياحُ كلِّ ما بعده (نفسُ شكل البلاغ)
  const bad =[{itemId:'a',itemName:'دهان',rcvQty:1},{itemId:'zz',itemName:'صفٌّ يتيم',rcvQty:9},{itemId:'b',itemName:'بلاستيك',rcvQty:2}];
  const pad = n => String(n).padStart(4,'0');           // معرّفاتٌ تُرتَّب نصّياً كما يرتّب Firestore
  const BROKEN = [5, 210, 448];                          // ٤٤٨ يقع **بعد** حدّ الـ ٤٠٠
  for(let i=1;i<=450;i++){
    const broken = BROKEN.indexOf(i)!==-1;
    window.__store[PC+'/PO-'+pad(i)] = { id:'PO-'+pad(i), status:'closed', building:'م', auditedBy:'أمين',
      items: JSON.parse(JSON.stringify(items)),
      auditItems: JSON.parse(JSON.stringify(broken? bad : good)),
      timeline:[{event:'تدقيق'}], createdAt:'2026-01-01T08:00:00' };
  }
  // مرآةُ الجلسة تحمل ٤٠٠ فقط — كما يفعل المستمعُ الحقيقيّ
  purchases = Object.keys(window.__store).sort().slice(0,400).map(k=>JSON.parse(JSON.stringify(window.__store[k])));
  purchases.forEach(p=>_poAuditSelfCheck(p));
  out.sessionSeen = _poAlignBreaks.size;                 // ٢ فقط — الثالثُ خارج النافذة

  await poScanAllAlignment();
  const r = _poAlignScanResult || {};
  out.scanned = r.scanned;
  out.hitIds  = (r.hits||[]).map(h=>h.id).sort().join(',');
  out.readOnly = ((window.__store[PC+'/PO-'+pad(448)]||{}).auditItems||[]).length;  // الفحصُ لم يكتب: ما زال 3

  await poFixScannedAlignment();
  const d448 = window.__store[PC+'/PO-'+pad(448)] || {};
  const d005 = window.__store[PC+'/PO-'+pad(5)]   || {};
  const d006 = window.__store[PC+'/PO-'+pad(6)]   || {};
  out.fixed448 = (d448.auditItems||[]).map(x=>x.itemName).join('|');
  out.pre448   = Array.isArray(d448.auditItemsPreAlign) && d448.auditItemsPreAlign.length===3;
  out.tl448    = (d448.timeline||[]).some(t=>t.code==='align_fixed');
  out.fixed005 = (d005.auditItems||[]).length;
  out.untouched006 = (d006.auditItems||[]).length===2 && !d006.auditItemsPreAlign;   // السليمُ لم يُمَسّ
  out.rescan   = _poAlignScan({...d448, id:'PO-'+pad(448)}).length;
  out.leftover = (_poAlignScanResult.hits||[]).length;
  return out;
});
check('10أ) ★★ الجلسةُ (٤٠٠) لا ترى إلا طلبين — الثالثُ خارج نافذتها', s10.sessionSeen===2, 'رأت='+s10.sessionSeen);
check('10ب) ★★ الفحصُ الشامل قرأ كلَّ الـ ٤٥٠ عبر الترقيم', s10.scanned===450, 'فُحص='+s10.scanned);
check('10ج) ★★ ووجد الثلاثة — بما فيها PO-0448 بعد حدّ الـ ٤٠٠',
  s10.hitIds==='PO-0005,PO-0210,PO-0448', s10.hitIds);
check('10د) ★★ الفحصُ قراءةٌ محضة — لم يكتب حرفاً قبل زرّ الإصلاح', s10.readOnly===3, 'صفوف=' + s10.readOnly);
check('10هـ) ★★ الإصلاحُ شفى الطلبَ الأقدم (٣ صفوف ← ٢ بترتيب البنود)',
  s10.fixed448==='دهان|بلاستيك' && s10.fixed005===2, s10.fixed448);
check('10و) ★★ الدليلُ محفوظٌ وقيدُ الإصلاح في السجلّ', s10.pre448===true && s10.tl448===true);
check('10ز) ★★ الطلبُ السليمُ (PO-0006) لم يُمَسّ إطلاقاً', s10.untouched006===true);
check('10ح) ★★ إعادةُ الفحص على المخزَّن: صفر انزياح', s10.rescan===0, 'مواضع='+s10.rescan);
check('10ط) ★ الحصيلةُ تُحدَّث بعد الإصلاح فلا تَعِد بما لم يبقَ', s10.leftover===0, 'باقٍ='+s10.leftover);

/* ══ سيناريو 11 (v18.9xf): سجلُّ الأخطاء مجمَّعاً — الشاشةُ تقول «عيبٌ واحد» ══
   البلاغُ الأصليّ: المالكُ تنقّل بين لقطاتٍ فيها عشراتُ صفوفٍ متطابقةٍ ليكتشف أنّها
   طلبان. هنا نزرع ٤١ حدثاً (٤٠ من عيبٍ واحدٍ + نادرٌ واحد) ونرسم الشاشةَ الحقيقيّة،
   ونتحقّق أنّ المجمَّعَ يعرض **بطاقتين** والمفصَّلَ يبقى متاحاً بـ٤١.                 */
log('\n=== السيناريو 11: سجلُّ الأخطاء مجمَّعاً (v18.9xf) ══');
const s11 = await page.evaluate(async ()=>{
  const out={};
  const M111 = "انزياح صفوف التدقيق عن بنود الطلب — PO-202607-0111: الطول: 7 بنداً مقابل 8 صفَّ تدقيق · السطر 4: «بلاستيك سوبر» يقابله صفّ «مبيد حشري 1لتر»";
  const M113 = "انزياح صفوف التدقيق عن بنود الطلب — PO-202607-0113: الطول: 5 بنداً مقابل 6 صفَّ تدقيق · السطر 3: «ماسورة ديكور» يقابله صفّ «توصيلة كروم»";
  const users=["مدير النظام","محمد","اسامة السادات","رغده فهيد","ری الجعفانی"];
  const log=[];
  for(let i=0;i<40;i++) log.push({ kind:"align", message:(i%2?M111:M113), source:"_poAuditSelfCheck",
    by:users[i%users.length], role:"admin", version:"v18.9.2700", page:"purchases",
    at:"2026-08-17T"+String(10+(i%5)).padStart(2,"0")+":00:00.000Z" });
  log.push({ kind:"error", message:"TypeError: Cannot read properties of undefined (reading 'itemName')",
    source:"renderInventory", by:"محمد", role:"admin", version:"v18.9.2700", page:"inventory",
    at:"2026-08-17T12:30:00.000Z" });
  errorsLog = log;
  currentUser={name:'مدير النظام', role:'admin'};

  const host = document.getElementById("errors-log-output");
  const cards = () => host.querySelectorAll(":scope > .card").length;

  // العرضُ الافتراضيّ — بلا أيّ تبديل
  renderErrorsLog();
  out.defaultCards = cards();
  out.countLine    = (document.getElementById("err-count")||{}).textContent || "";
  out.showsTimes40 = host.textContent.indexOf("×40") !== -1 || host.textContent.indexOf("×40") !== -1;
  out.rareVisible  = host.textContent.indexOf("reading 'itemName'") !== -1;
  out.usersShown   = host.textContent.indexOf("اسامة السادات") !== -1;
  // الصيغُ الكاملةُ متاحةٌ بالتوسيع (لا تُهدَر بالقصر)
  out.variantsBlock = host.textContent.indexOf("الصيغ الكاملة داخل هذه المجموعة") !== -1;
  out.bothPOsInside = host.textContent.indexOf("PO-202607-0111") !== -1 && host.textContent.indexOf("PO-202607-0113") !== -1;

  // المفصَّلُ باقٍ بضغطة
  setErrView("detail");
  out.detailCards = cards();
  setErrView("grouped");
  out.backToGrouped = cards();

  // الفلترُ يُطبَّق قبل التجميع: تصفيةٌ على مستخدمٍ واحد
  document.getElementById("err-f-user").value = "محمد";
  renderErrorsLog();
  out.filteredCards = cards();
  out.filteredCount = (document.getElementById("err-count")||{}).textContent || "";
  document.getElementById("err-f-user").value = "";
  renderErrorsLog();
  return out;
});
check('11أ) ★★ الافتراضيُّ مجمَّع: ٤١ حدثاً تُعرَض في بطاقتين',
  s11.defaultCards===2, 'بطاقات='+s11.defaultCards);
check('11ب) ★★ العدّادُ يقول العددين معاً', /41/.test(s11.countLine) && /2/.test(s11.countLine), s11.countLine.trim().slice(0,60));
check('11ج) ★★ البطاقةُ تُظهر عددَ التكرار (×40) — هو الخبر', s11.showsTimes40===true);
check('11د) ★★ الخطأُ النادرُ ظاهرٌ ولم يُدفَن تحت الأربعين', s11.rareVisible===true);
check('11هـ) ★ ويُقال من تأثّر بالاسم', s11.usersShown===true);
check('11و) ★★ الصيغُ الكاملةُ محفوظةٌ داخل المجموعة (الطلبان كلاهما)',
  s11.variantsBlock===true && s11.bothPOsInside===true);
check('11ز) ★★ المفصَّلُ لم يُحذَف — ٤١ بطاقةً بضغطة', s11.detailCards===41, 'بطاقات='+s11.detailCards);
check('11ح) ★ والرجوعُ للمجمَّع يعمل', s11.backToGrouped===2, 'بطاقات='+s11.backToGrouped);
check('11ط) ★★ الفلترُ يُطبَّق قبل التجميع — «محمد» له ٩ أحداثٍ في مجموعتين',
  s11.filteredCards===2 && /9/.test(s11.filteredCount), s11.filteredCount.trim().slice(0,50));

/* ══ سيناريو 12 (v18.9xg): الإشعاراتُ من لقطة المستمع الأساسيّ — لا مستمعٌ ثانٍ ══
   قياسٌ في متصفّحٍ حقيقيّ كشف أنّ startHailNotifications كانت تُركّب مستمعاً ثانياً على
   نفس مجموعتَي البلاغات والمشتريات — هدفان دائمان وتيّارُ قراءاتٍ مضاعف بلا مقابل.
   وهذا المسارُ لم يكن قابلاً للفحص قبل اليوم: المحاكي بلا docChanges فكان منطقُ
   الإشعارات يرمي ويُبتلَع صامتاً. الآن يُفحَص تنفيذاً — ولا يُصلَح ما لا يُقاس.        */
log('\n=== السيناريو 12: الإشعاراتُ من اللقطة الأساسيّة (v18.9xg) ══');
const s12 = await page.evaluate(async ()=>{
  const out={}; window.__store={}; purchases=[]; tickets=[];
  const PC=PURCHASES_COLLECTION(), TC=COLLECTION();
  window.toast=()=>{}; window.renderPurchases=()=>{}; window.updatePurchaseBadge=()=>{};
  window.renderCurrentPage=()=>{}; window.updateHeader=()=>{}; window.logAudit=()=>{};
  window.checkOverduePurchases=()=>{}; window.captureError=()=>{};
  currentUser={name:'مدير النظام', role:'admin', user:'admin'};

  // (أ) عدّادُ الاشتراكات: كم مستمعاً يُركَّب على كلِّ مجموعةٍ من الآن؟
  const subs={};
  const oc=db.collection.bind(db);
  db.collection=function(c){
    const q=oc(c); const os=q.onSnapshot.bind(q);
    q.onSnapshot=function(){ subs[c]=(subs[c]||0)+1; return os.apply(this,arguments); };
    return q;
  };

  // الإشعاراتُ المُطلَقة
  const pushed=[];
  if(typeof HailNotify!=="undefined") HailNotify.push=o=>pushed.push(o.code);

  // (ب) استدعاءُ التهيئة ثلاثاً: يجب ألّا يُركَّب مستمعٌ واحد
  for(let i=0;i<3;i++){ try{ startHailNotifications(); }catch(e){ out.err=String(e.message); } }
  out.subsAfterInit = JSON.stringify(subs);
  out.noOwnListeners = !subs[PC] && !subs[TC];
  out.feedsExist = (typeof _hnFeedTickets==="function") && (typeof _hnFeedPurchases==="function");
  out.deadVarsGone = (typeof _hnPOUnsub==="undefined") && (typeof _hnTicketsUnsub==="undefined");

  // (ج) المستمعُ الأساسيُّ حيّ؛ وثيقةٌ جديدةٌ تصل ⇒ إشعارٌ عبر التغذية
  try{ startPurchaseSync(); }catch(e){}
  try{ startRealtimeSync(); }catch(e){}
  await new Promise(r=>setTimeout(r,400));
  out.subsAfterSync = JSON.stringify(subs);   // مستمعٌ واحدٌ لكلِّ مجموعةٍ لا اثنان
  out.oneEach = (subs[PC]||0) <= 1 && (subs[TC]||0) <= 1;

  const mkPO=(id,by)=>db.collection(PC).doc(id).set({ id, status:'pending_pm', desc:'طلب '+id,
    createdAt:new Date().toISOString(), createdBy:by, estCost:500, items:[{itemCost:500}] });
  await mkPO('PO-N1','otherUser'); await new Promise(r=>setTimeout(r,500));
  out.notifOther = pushed.includes('PO-N1');
  await mkPO('PO-N2','admin');     await new Promise(r=>setTimeout(r,500));
  out.notifSelf  = pushed.includes('PO-N2');      // يجب false — لا تُنبّه صاحبَ الطلب
  await db.collection(TC).doc('BLG-N1').set({ id:'BLG-N1', status:'مفتوح', building:'مبنى',
    workType:'كهرباء', desc:'انقطاع', createdAt:new Date().toISOString(), createdBy:'otherUser' });
  await new Promise(r=>setTimeout(r,500));
  out.notifTicket = pushed.includes('BLG-N1');
  // (د) التكرارُ لا يُشعِر مرّتين (حارسُ _hnSeen*)
  const before=pushed.length;
  await db.collection(PC).doc('PO-N1').set({ desc:'تعديل' }, {merge:true});
  await new Promise(r=>setTimeout(r,500));
  out.noDoubleNotify = pushed.length===before;
  out.pushed=pushed.join(',');
  db.collection=oc;
  return out;
});
check('12أ) ★★ التهيئةُ لا تُركّب مستمعاً خاصّاً بالإشعارات (٣ استدعاءات ⇒ صفر)',
  s12.noOwnListeners===true, 'اشتراكات='+s12.subsAfterInit);
check('12ب) ★★ ومستمعٌ واحدٌ لكلِّ مجموعةٍ بعد المزامنة — لا اثنان',
  s12.oneEach===true, s12.subsAfterSync);
check('12ج) ★ دالّتا التغذية موجودتان ومتغيّرا الاشتراك الميّتان أُزيلا',
  s12.feedsExist===true && s12.deadVarsGone===true);
check('12د) ★★ طلبٌ جديدٌ من غيري ⇒ إشعارٌ يصل (المسارُ يعمل من اللقطة الأساسيّة)',
  s12.notifOther===true, 'المُشعَر: '+s12.pushed);
check('12هـ) ★★ وطلبٌ أنشأتُه أنا ⇒ لا إشعار', s12.notifSelf===false);
check('12و) ★★ وبلاغٌ جديد ⇒ إشعارٌ يصل', s12.notifTicket===true);
check('12ز) ★★ وتعديلُ وثيقةٍ سابقةٍ لا يُشعِر مرّتين', s12.noDoubleNotify===true);

/* ═══════════════════════════════════════════════════════════════════════════
   السيناريو 13: تقارير المخزون — **الرقمُ المرسوم = الرقمُ المحسوب**

   الدوالُّ النقيّة تفحصها `hail-tests` في صندوقٍ معزول، وذلك يُثبت الحساب ولا يُثبت
   أنّ ما **يُرسَم على الشاشة** هو ما حُسِب: بين الحساب والجدول تمرّ الفلاتر والتجميعُ
   ومُنسّقُ الأرقام والحقلُ المفقود — وكلُّ واحدٍ منها موضعُ انزياحٍ لا يظهر في أيّ خطأ.
   فهنا: تُزرَع أرصدةٌ وحركاتٌ في Firestore الوهميّ، ثمّ يُوَلَّد التقريرُ **بالمسار
   الحقيقيّ** (استعلامٌ ← حسابٌ ← رسمٌ)، ثمّ يُقرأ الرقمُ **من خلايا الجدول المرسومة**
   ويُقارَن بالمحسوب. ومعه المصيدةُ نفسُها في متصفّحٍ حقيقيّ: `direct_use` لا تُنقِص رصيداً.
   ═══════════════════════════════════════════════════════════════════════════ */
log('\n=== السيناريو 13: تقارير المخزون — المرسوم = المحسوب ══');
const s13 = await page.evaluate(async ()=>{
  const out={};
  window.toast=()=>{}; window.logAudit=()=>{};
  currentUser={name:'أمين المستودع', role:'warehouse_manager', user:'wh'};
  out.moduleLoaded = !!(window.inventoryReports && typeof window.inventoryReports.render==='function');
  if(!out.moduleLoaded) return out;

  const IC=INVENTORY_COLLECTION(), LC=INVENTORY_LOG_COLLECTION();
  window.__store={};
  const D=n=>{ const d=new Date(); d.setDate(d.getDate()-n); d.setHours(10,0,0,0); return d.toISOString(); };

  /* رصيدان في مستودعين + حركاتٌ خلال الشهر (ومنها direct_use بكمّيةٍ ضخمة لا تمسّ الرصيد).
     البذرةُ في **المصفوفة والمخزن معاً** (نمطُ بقيّة السيناريوهات — §5): الوحدةُ تقرأ
     الأرصدةَ من `_inventoryItems` الحيّة، وتقرأ السجلَّ باستعلامٍ حقيقيٍّ على المخزن. */
  const cbl={ id:'INV-CBL', itemId:'INV-CBL', itemName:'كابل نحاس', itemCode:'ELEC-1',
    category:'مواد كهربائية', unit:'متر', currentQty:40, unitPrice:9,
    warehouseName:'المستودع الرئيسي', lastUpdated:D(1) };
  const lmp={ id:'INV-LMP', itemId:'INV-LMP', itemName:'لمبة ليد', itemCode:'ELEC-2',
    category:'مواد كهربائية', unit:'قطعة', currentQty:5, unitPrice:0,
    warehouseName:'مستودع فرعي', lastUpdated:D(200) };
  _inventoryItems=[cbl, lmp];
  window.__store[IC+'/INV-CBL']={...cbl};
  window.__store[IC+'/INV-LMP']={...lmp};
  /* وعلَمُ وصول اللقطة يُرفَع كما يرفعه مستمعُ المخزون في السطر نفسِه الذي يُسند
     `_inventoryItems` — فالوحدةُ ترفض الحسابَ قبله (لئلّا تُبنى أرقامٌ من سجلٍّ بلا
     أرصدة)، وهذا السيناريو يزرع العالمَ بيده فعليه أن يُعلن ما يُعلنه المستمع. */
  window._fsLoaded = window._fsLoaded || {}; window._fsLoaded.inventory = true;

  const mv = d => db.collection(LC).add(d);
  await mv({ type:'in',         itemId:'INV-CBL', itemName:'كابل نحاس', unit:'متر', qty:30, unitPrice:15,
             relatedPO:'PO-77', warehouseName:'المستودع الرئيسي', performedBy:'أمين', date:D(20) });
  await mv({ type:'out',        itemId:'INV-CBL', itemName:'كابل نحاس', unit:'متر', qty:12, unitPrice:0,
             orderRef:'ISS-9', recipient:'فنّي أ', projectId:'hail', performedBy:'أمين', date:D(10) });
  await mv({ type:'adjust',     itemId:'INV-CBL', itemName:'كابل نحاس', unit:'متر', qty:0, adjustDelta:-3,
             reason:'جرد', performedBy:'أمين', date:D(5) });
  // ★ المصيدة: بندٌ سُلّم للموقع مباشرةً — كمّيةٌ ضخمة يجب ألّا تمسّ رصيدَ المستودع
  await mv({ type:'direct_use', itemId:'INV-CBL', itemName:'كابل نحاس', unit:'متر', qty:500, unitPrice:15,
             relatedPO:'PO-78', projectId:'hail', location:'موقع أ', performedBy:'مشتريات', date:D(8) });

  const IR=window.inventoryReports;
  const p=n=>{ const d=new Date(); d.setDate(d.getDate()-n);
    const z=x=>String(x).padStart(2,'0'); return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate()); };

  // ── حركةُ الفترة: يُولَّد بالمسار الحقيقيّ ثمّ يُقرأ من الخلايا المرسومة ──
  IR._set('kind','movement'); IR._setq('from',p(30)); IR._setq('to',p(0));
  showPage('inventory-reports');
  await IR.generate();
  const st=IR._state();
  const rowCbl=(st.out.rows||[]).find(r=>r.name==='كابل نحاس')||{};
  out.calc={ opening:rowCbl.opening, inQty:rowCbl.inQty, outQty:rowCbl.outQty,
             adjNet:rowCbl.adjNet, closing:rowCbl.closing };

  // القراءةُ من الجدول المرسوم فعلاً (لا من الحالة)
  const host=document.getElementById('page-inventory-reports');
  // الجدولُ مكوّنُ المنصة `.report-table` (له قواعدُ وضعٍ داكنٍ مكتوبةٌ أصلاً) —
  // والمُنتقي يثبّت ذلك: لو استُبدل بجدولٍ محلّيٍّ سقط الفحصُ لا الشكلُ وحدَه.
  out.platformTable = !!host.querySelector('table.report-table.ivr-table');
  out.styleInjected = !!document.getElementById('ivr-css');
  out.monoNums = !!host.querySelector('.ivr-num');
  const trs=[...host.querySelectorAll('table.report-table.ivr-table tbody tr')];
  const cells=(trs.find(tr=>tr.textContent.includes('كابل نحاس'))||{querySelectorAll:()=>[]})
    .querySelectorAll('td');
  /* ── القراءةُ **بعنوان العمود** لا برقمه ──
     v18.9.2743: كانت الفهارسُ مثبَّتةً (4·5·6·9)، فإضافةُ عمود «م» أزاحتها كلَّها
     وسقط الفحصُ وهو **يقيس نفسَه لا النظام**: الأرقامُ المرسومةُ كانت صحيحةً تماماً.
     والقراءةُ بالعنوان تحفظ غرضَ الفحص (المرسومُ = المحسوب · لا انزياحَ عمود) وتزيده:
     لو انزاح عمودٌ فعلاً لَقرأنا قيمةَ عمودٍ آخرَ تحت عنوانه فسقط الفحصُ — وهو
     المطلوب — بينما إضافةُ عمودٍ مشروعةٍ لا تُسقطه. */
  const ths=[...host.querySelectorAll('table.report-table.ivr-table thead th')]
    .map(t=>t.textContent.trim());
  const at=lbl=>ths.indexOf(lbl);
  out.headers=ths.join('|');
  const txt=i=>(i>=0&&cells[i]?cells[i].textContent.trim():'');
  const n=s=>parseFloat(String(s).replace(/[^\d.\-]/g,''))||0;
  out.drawn={ opening:n(txt(at('افتتاحي'))), inQty:n(txt(at('وارد'))),
              outQty:n(txt(at('صادر'))),     closing:n(txt(at('ختامي'))) };
  // وعمودُ التسلسل نفسُه: أوّلُ عمودٍ، وأوّلُ صفٍّ يحمل ١
  out.seqFirst = ths[0]==='م';
  out.seqCell1 = (trs[0]&&trs[0].children[0]) ? trs[0].children[0].textContent.trim() : '';
  out.rowsDrawn=trs.length;
  out.excelReady=(st.sheets||[]).indexOf('movement')>=0;
  // ورقةُ Excel تُبنى من نفس cols/rows — نتحقّق أن رقمَها هو نفسُه
  const sheet=IR._sheetRows(st.out);
  const shRow=sheet.find(r=>r['المادة']==='كابل نحاس')||{};
  out.excelClosing=shRow['ختامي'];

  /* ── منتقي الصنف: مسارُ المستخدم الحقيقيّ (اكتب ← اختر ← ولِّد) ──
     الدوالُّ النقيّةُ تفحصها hail-tests؛ وهذا يفحص **الوسط بين الحقل والتقرير**:
     أنّ الكتابةَ تُظهر المنسدلةَ، وأنّ النقرَ يُسند المعرّفَ، وأنّ إعادةَ الرسم بعده
     **لا تمحو** الاختيار (وهو ما يقع لو رُبط الحقلُ بـ`_set`)، وأنّ البطاقةَ
     المولَّدةَ تنتهي عند الرصيد الحاليّ للصنف نفسِه. */
  IR._set('kind','card');
  const inp=document.getElementById('ivr-pick');
  out.pickInputIsText = !!inp && inp.tagName==='INPUT';
  out.noSelect = !document.querySelector('#page-inventory-reports select[onchange*="docId"]');
  inp.value='كابل'; IR._acSearch();
  const ac=document.getElementById('ivr-ac');
  out.acOpen = ac.style.display==='block';
  out.acItems = ac.querySelectorAll('.ivr-ac-item').length;
  out.acHasCbl = /كابل نحاس/.test(ac.innerHTML);
  // بحثٌ بكلمتين معكوستين وبتطبيعٍ عربيّ — نفسُ ما يفعله المستخدم فعلاً
  inp.value='نحاس كابل'; IR._acSearch();
  out.acReversed = document.getElementById('ivr-ac').querySelectorAll('.ivr-ac-item').length===1;
  // ثمّ الاختيارُ بالنقر
  document.getElementById('ivr-ac').querySelector('.ivr-ac-item').click();
  out.pickedId = IR._state().f.docId;
  const inp2=document.getElementById('ivr-pick');       // أُعيد الرسمُ ⇒ عنصرٌ جديد
  out.labelKept = !!inp2 && /كابل نحاس/.test(inp2.value);
  out.okClass   = !!inp2 && inp2.className.indexOf('ivr-pick-ok')>=0;
  await IR.generate();
  const card=IR._state().out;
  out.cardRows = (card&&card.rows||[]).length;
  out.cardLastBalance = (card&&card.rows||[]).slice(-1).map(r=>r.balance)[0];

  // ── الاستهلاك: direct_use تُحتسَب هنا (وهي صفرٌ في الرصيد أعلاه) ──
  IR._set('kind','consumption'); IR._setq('from',p(30)); IR._setq('to',p(0));
  await IR.generate();
  const c=IR._state().out.rows||[];
  out.consumeDirect=(c.find(r=>String(r.kind).includes('مباشر'))||{}).qty;
  out.consumeOut=(c.find(r=>String(r.kind)==='صادر')||{}).qty;

  // ── الراكد: اللمبةُ ساكنةٌ ٢٠٠ يوم (بحقل آخر تحديث) والكابلُ متحرّك ──
  IR._set('kind','stale'); IR._set('staleDays',90); IR._setq('from',p(30)); IR._setq('to',p(0));
  await IR.generate();
  const stale=(IR._state().out.rows||[]).map(r=>r.name);
  out.staleHasLmp=stale.indexOf('لمبة ليد')>=0;
  out.staleHasCbl=stale.indexOf('كابل نحاس')>=0;

  // ── التقييم: سعرُ آخر واردٍ (15) لا سعرُ وثيقة الصنف (9) ──
  IR._set('kind','warehouse'); IR._setq('from',p(30)); IR._setq('to',p(0));
  await IR.generate();
  const wh=(IR._state().out.rows||[]).find(r=>r.wh==='المستودع الرئيسي')||{};
  out.whValue=wh.value; out.whNoPrice=wh.noPrice;
  return out;
});
check('13أ) الوحدة محمَّلةٌ وتعرّض واجهتها', s13.moduleLoaded===true);
check('13ب) ★★ الأرقامُ المحسوبة: افتتاحي 25 · وارد 30 · صادر 12 · تسوية −3 · ختامي 40',
  s13.calc && s13.calc.opening===25 && s13.calc.inQty===30 && s13.calc.outQty===12
  && s13.calc.adjNet===-3 && s13.calc.closing===40, JSON.stringify(s13.calc));
check('13ج) ★★ الرقمُ المرسوم في الجدول = الرقمُ المحسوب (لا انزياحَ عمود)',
  s13.drawn && s13.calc && s13.drawn.opening===s13.calc.opening && s13.drawn.inQty===s13.calc.inQty
  && s13.drawn.outQty===s13.calc.outQty && s13.drawn.closing===s13.calc.closing,
  JSON.stringify(s13.drawn));
check('13ج٢) ★★ وعمودُ «م» أوّلُ الأعمدة وأوّلُ صفٍّ يحمل ١ (v18.9.2743)',
  s13.seqFirst===true && s13.seqCell1==='1', s13.headers);
check('13د) ★★ الختاميُّ = الرصيد الحاليّ (٤٠) مع أنّ direct_use كانت ٥٠٠ وحدة',
  s13.calc && s13.calc.closing===40);
check('13هـ) ★ ورقةُ Excel تحمل الرقمَ نفسَه', s13.excelReady===true && s13.excelClosing===40,
  'ختامي في الورقة='+s13.excelClosing);
check('13و) ★★ direct_use تُحتسَب في الاستهلاك (٥٠٠) والصادرُ منفصلٌ (١٢)',
  s13.consumeDirect===500 && s13.consumeOut===12,
  'مباشر='+s13.consumeDirect+' صادر='+s13.consumeOut);
check('13ز) ★ الراكد: الساكنُ ٢٠٠ يوم يظهر والمتحرّكُ لا يظهر',
  s13.staleHasLmp===true && s13.staleHasCbl===false);
check('13ح) ★★ التقييم بسعر آخر وارد (15×40=600) لا بسعر وثيقة الصنف (9×40=360)',
  s13.whValue===600, 'القيمة='+s13.whValue+' بلا سعر='+s13.whNoPrice);
/* الصفحةُ تتبع نظامَ تصميم المنصة — لا شكلاً مستقلاً يُصان وحدَه:
   جدولُ التقارير `.report-table` (وله قواعدُ الوضع الداكن أصلاً)، والنمطُ محقونٌ
   مرّةً بمعرّفٍ واحد، والأرقامُ بصنف المونوسبيس الجدوليّ. */
check('13ط) ★ الجدولُ مكوّنُ المنصة `.report-table` لا جدولٌ محلّيّ', s13.platformTable===true);
check('13ي) ★ النمطُ محقونٌ مرّةً واحدةً (#ivr-css)', s13.styleInjected===true);
check('13ك) ★ الأرقامُ بصنف المونوسبيس الجدوليّ كبقيّة شاشات المنصة', s13.monoNums===true);
// ── منتقي الصنف: اكتب ← اختر ← ولِّد ──
check('13ل) منتقي الصنف حقلُ بحثٍ لا قائمةٌ منسدلةٌ بكل الأصناف',
  s13.pickInputIsText===true && s13.noSelect===true);
check('13م) ★ الكتابةُ تفتح المنسدلةَ وتعرض الصنفَ المطابق',
  s13.acOpen===true && s13.acHasCbl===true && s13.acItems>=1, 'نتائج='+s13.acItems);
check('13ن) ★ كلمتان بأيّ ترتيب («نحاس كابل») تجدان الصنفَ نفسَه', s13.acReversed===true);
check('13ه) ★★ النقرُ يُسند المعرّف، وإعادةُ الرسم بعده لا تمحو الاختيار',
  s13.pickedId==='INV-CBL' && s13.labelKept===true && s13.okClass===true,
  'المعرّف='+s13.pickedId+' النصُّ باقٍ='+s13.labelKept);
check('13و) ★★ بطاقةُ الصنف تُولَّد وينتهي رصيدُها المتدرّج عند الرصيد الحاليّ (٤٠)',
  s13.cardRows===3 && s13.cardLastBalance===40,
  'حركات='+s13.cardRows+' آخرُ رصيد='+s13.cardLastBalance);

/* ═══════════════════════════════════════════════════════════════════════════
   السيناريو 14: تكافؤُ المصدرين — إعادةُ الحساب وتقريرُ الفترة يقولان الرقمَ نفسَه

   أثرُ الحركة على الرصيد مكتوبٌ في **موضعين**: `recalcInventoryFromLog` في
   `index.html` و`_effects` في وحدة التقارير. وتوحيدُهما نقلُ منطقٍ قائمٍ لا يُخلط
   بإصلاح (قاعدةُ CLAUDE.md) — فيبقى الخطر: يُعدَّل أحدُهما ويُنسى الآخر، فيقول
   التقريرُ رقماً ويقول الرصيدُ غيرَه **بلا رسالةِ خطأ**. وهذا ما وقع فعلاً في
   `manual_in`. فالحارس: بذرةُ حركاتٍ من الأنواع الستة كلِّها ⇒ تُشغَّل إعادةُ
   الحساب فتكتب الرصيد ⇒ ثمّ يُولَّد تقريرُ الفترة ⇒ ويُقاس **الافتتاحيُّ قبل أوّل
   حركة**: يجب أن يكون **صفراً** — فلا شيءَ كان موجوداً قبل أوّل حركةٍ في السجل.

   **ولماذا الافتتاحيُّ لا الختاميّ؟** أوّلُ صياغةٍ لهذا الفحص قاست «الختاميُّ =
   الرصيدُ المكتوب» فمرّت **رغم الخلل**: الختاميُّ = الرصيدُ الحاليّ − ما بعد النهاية
   + ما في الفترة، ونهايةُ الفترة اليوم ⇒ فهو **يساوي الرصيدَ الحاليَّ بالبناء** لا
   بالتطابق — متطابقةٌ تُصادِق نفسَها. أمّا الافتتاحيّ فهو
   `Σ(حساب index.html) − Σ(حساب الوحدة)`: صفرٌ إن اتّفق الحسابان على **كل نوعٍ**،
   وغيرُ صفرٍ بمقدار ما أسقطه أحدُهما. (بالخلل: 30 − 50 = −20.)
   ═══════════════════════════════════════════════════════════════════════════ */
log('\n=== السيناريو 14: تكافؤُ إعادة الحساب مع تقرير الفترة ══');
const s14 = await page.evaluate(async ()=>{
  const out={};
  window.isAdmin=()=>true; window.showConfirm=async()=>true; window.toast=()=>{};
  window.logAudit=()=>{}; window.renderInventory=()=>{};
  currentUser={name:'أمين المستودع', role:'warehouse_manager', user:'wh'};
  const INV=INVENTORY_COLLECTION(), LOG=INVENTORY_LOG_COLLECTION();
  window.__store={};
  const D=n=>{ const d=new Date(); d.setDate(d.getDate()-n); d.setHours(9,0,0,0); return d.toISOString(); };

  // الأنواعُ الستة على ثلاثة أصناف (الوثيقةُ = صنف×مستودع)
  const L={
    m1:{ type:'in',         itemId:'X', qty:100, unitPrice:5, itemName:'صنف س', unit:'متر', warehouseName:'و1', date:D(25) },
    m2:{ type:'manual_in',  itemId:'X', qty:20,  unitPrice:5, itemName:'صنف س', unit:'متر', warehouseName:'و1', date:D(20) },
    m3:{ type:'out',        itemId:'X', qty:35,  itemName:'صنف س', unit:'متر', date:D(15) },
    m4:{ type:'adjust',     itemId:'X', qty:0, adjustDelta:-5, itemName:'صنف س', unit:'متر', date:D(10) },
    m5:{ type:'direct_use', itemId:'X', qty:500, itemName:'صنف س', unit:'متر', date:D(8) },  // صفرٌ على الرصيد
    m6:{ type:'transfer',   itemId:'X', destItemId:'Y', qty:30, itemName:'صنف س', unit:'متر',
         fromWarehouse:'و1', toWarehouse:'و2', date:D(5) }
  };
  Object.keys(L).forEach(k=>{ window.__store[LOG+'/'+k]=L[k]; });

  // (١) إعادةُ الحساب تكتب الرصيد من السجل
  await recalcInventoryFromLog();
  out.recalc = { X:(window.__store[INV+'/X']||{}).currentQty, Y:(window.__store[INV+'/Y']||{}).currentQty };

  // (٢) الأرصدةُ الحيّة تُقرأ من المخزن كما يفعل مستمعُ المخزون
  _inventoryItems = ['X','Y'].map(id=>({ id, ...(window.__store[INV+'/'+id]||{}),
    warehouseName: id==='X' ? 'و1' : 'و2' }));
  window._fsLoaded = window._fsLoaded || {}; window._fsLoaded.inventory = true;

  // (٣) تقريرُ الفترة بفترةٍ تغطّي كلَّ الحركات
  const IR=window.inventoryReports;
  const dd=n=>{ const d=new Date(); d.setDate(d.getDate()-n); const z=x=>String(x).padStart(2,'0');
    return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate()); };
  // الفترةُ تبدأ **قبل** أقدمِ حركة (D(25)) — فالافتتاحيُّ يجب أن يكون صفراً
  IR._set('kind','movement'); IR._setq('from',dd(60)); IR._setq('to',dd(0));
  showPage('inventory-reports');
  await IR.generate();
  const rows=(IR._state().out||{rows:[]}).rows;
  out.opening={}; out.closing={};
  ['و1','و2'].forEach(w=>{
    const r=rows.find(x=>x.wh===w);
    if(r){ out.opening[w]=r.opening; out.closing[w]=r.closing; }
  });
  out.rows=rows.length;
  return out;
});
// X: 100 + 20(يدويّ) − 35 − 5(تسوية) − 30(نقل خارجاً) = 50 · و direct_use 500 بلا أثر
check('★★ إعادةُ الحساب: 100+20−35−5−30 = 50 (وdirect_use بلا أثر)',
  s14.recalc && s14.recalc.X===50, 'X='+(s14.recalc||{}).X);
check('★ وطرفُ النقل الآخر = 30', s14.recalc && s14.recalc.Y===30, 'Y='+(s14.recalc||{}).Y);
/* ★★ المتطابقةُ التي لا تُصادِق نفسَها: الافتتاحيُّ قبل أوّل حركةٍ = صفر.
   وهو `Σ(حساب index.html) − Σ(حساب الوحدة)` — فأيُّ نوعٍ يقرؤه أحدُهما ويُسقطه
   الآخرُ يظهر هنا رقماً غيرَ صفرٍ بمقداره بالضبط. */
check('★★ تكافؤُ المصدرين: الافتتاحيُّ قبل أوّل حركة = صفر في الطرفين',
  !!s14.opening && s14.opening['و1']===0 && s14.opening['و2']===0,
  'الافتتاحي='+JSON.stringify(s14.opening));
check('★ والختاميُّ يطابق ما كتبته إعادةُ الحساب',
  !!s14.closing && s14.closing['و1']===s14.recalc.X && s14.closing['و2']===s14.recalc.Y,
  'ختامي='+JSON.stringify(s14.closing)+' رصيد='+JSON.stringify(s14.recalc));

/* ═══════════════════════════════════════════════════════════════════════════
   السيناريو 15: لا تقريرَ قبل وصول لقطة الأرصدة

   كلُّ حسابٍ في الوحدة يبدأ من الرصيد الحاليّ ثم يرجع بالحركات. فقبل أوّل لقطةٍ
   لـ`global_inventory` تكون الأرصدةُ فارغةً، فتُبنى الصفوفُ من السجل وحدَه ويخرج
   **تقريرٌ كاملُ الشكل كاذبُ الأرقام** (افتتاحيٌّ سالبٌ وختاميٌّ صفر) بلا رسالةٍ في
   أيّ مكان. الحارسُ يرفض التوليدَ ولا يُخفي السبب — ويجب أن يُثبت الفحصُ أنّه
   **يمنع ولا يُعطِّل**: يرفض قبل اللقطة، ويسمح بعدها بلا إعادةِ تحميل.
   ═══════════════════════════════════════════════════════════════════════════ */
log('\n=== السيناريو 15: حارسُ لقطة الأرصدة ══');
const s15 = await page.evaluate(async ()=>{
  const out={};
  const toasts=[]; window.toast=(m)=>toasts.push(String(m));
  window.logAudit=()=>{};
  currentUser={name:'أمين المستودع', role:'warehouse_manager', user:'wh'};
  const IR=window.inventoryReports;
  IR._reset();                                        // يمحو أيَّ تقريرٍ من سيناريو سابق
  const sheetsBefore=(IR._state().sheets||[]).length;  // أوراقُ Excel المتراكمة قبل المحاولة
  window._fsLoaded = window._fsLoaded || {};
  window._fsLoaded.inventory = false;                 // ما قبل أوّل لقطة
  out.readyFalse = IR._invReady()===false;

  const dd=n=>{ const d=new Date(); d.setDate(d.getDate()-n); const z=x=>String(x).padStart(2,'0');
    return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate()); };
  IR._set('kind','movement'); IR._setq('from',dd(30)); IR._setq('to',dd(0));
  showPage('inventory-reports');

  /* (١) الرسمُ وحدَه: حالةُ المزامنة في مكان المخرَج.
     يُقاس بـ`render` لا بـ`generate` — فـ`generate` تستدعي `startInventorySync`
     قبل الرفض، **والمحاكي يبثّ اللقطةَ فوراً** فيرتفع العلَمُ في نفس اللحظة ويُرسَم
     «اختر تقريراً». (في الإنتاج تأخذ اللقطةُ رحلةَ شبكةٍ فتظهر الحالةُ فعلاً.)
     فصلُ الادّعاءين يجعل كلَّ فحصٍ يقيس نفسَه لا أثرَ الآخر. */
  const host=document.getElementById('page-inventory-reports');
  IR.render();
  out.syncShown = /fs-sync|جارٍ مزامنة/.test(host.innerHTML);

  // (٢) التوليدُ يُرفَض ولا يُنتج شيئاً
  window._fsLoaded.inventory = false;
  await IR.generate();
  const st1=IR._state();
  out.noReport = st1.out===null;                      // لا تقرير
  // ولا **ورقةَ Excel جديدة**: المتراكمُ من توليدٍ سابقٍ ناجحٍ يبقى (وُلّد فعلاً)،
  // والمقصودُ أنّ تقريراً لم يُحسَب لا يُضيف ورقةً تُصدَّر
  out.noNewSheet = (st1.sheets||[]).length===sheetsBefore;
  out.toldUser  = toasts.some(m=>m.indexOf('أرصدة المخزون')>=0);

  // ثمّ تصل اللقطة — التوليدُ ينجح بلا إعادةِ تحميل (يمنع ولا يُعطِّل)
  window._fsLoaded.inventory = true;
  await IR.generate();
  out.afterReady = IR._state().out !== null;
  return out;
});
check('15أ) `_invReady` تقرأ علَم اللقطة نفسَه الذي تقرؤه شاشةُ الرصيد', s15.readyFalse===true);
check('15ب) ★★ قبل اللقطة: لا تقريرَ إطلاقاً (لا أرقامَ كاذبةً كاملةَ الشكل)', s15.noReport===true);
check('15ج) ★ ولا ورقةَ Excel تُضاف (فلا أثرَ في الجلسة لتقريرٍ لم يُحسَب)', s15.noNewSheet===true);
check('15د) ★ وحالةُ المزامنة معروضةٌ في مكان المخرَج (لا فراغٌ صامت)', s15.syncShown===true);
check('15هـ) ★ والمستخدم يُخبَر بالسبب', s15.toldUser===true);
check('15و) ★★ وبعد وصول اللقطة يعمل التوليد (الحارسُ يمنع ولا يُعطِّل)', s15.afterReady===true);

/* ══ سيناريو 16: استلام المشرف الميداني — «تم الشراء» ⇒ المشرف ⇒ محاضر جزئية ⇒ المستودع ══ */
log('\n=== السيناريو 16: استلام المشرف الميداني (sv_receiving) ══');
const s16 = await page.evaluate(async ()=>{
  const out={};
  window.isAdmin              = ()=> !!(currentUser && currentUser.role==='admin');
  window.isProcurementOfficer = ()=> !!(currentUser && currentUser.role==='procurement_officer');
  out.confirms=0;
  window.showConfirm = async ()=>{ out.confirms++; return true; };   // تنبيه «بلا صور» يُعتمد
  const toasts=[]; window.toast=(m)=>toasts.push(String(m));
  window.renderPurchases=()=>{}; window.updatePurchaseBadge=()=>{};
  window.addNotification=()=>{}; window.logAudit=()=>{}; window.closeModal=()=>{};
  window.SUPERVISOR_RECEIPT_ENABLED = true;
  const PC=PURCHASES_COLLECTION();

  // (أ) «تم الشراء» من المشتريات ⇒ استلام المشرف لا المستودع
  currentUser={name:'مسؤول المشتريات', role:'procurement_officer'};
  const PO={ id:'PO-SVR', building:'مبنى ٢', status:'proc_executing', supervisor:'مشرف الموقع',
    items:[{ itemName:'مناديل رول', qty:5, unit:'كرتون', unitCost:10, itemCost:50 },
           { itemName:'مغطى من المخزون', qty:3, unit:'حبة', _fullyCoveredByStock:true },
           { itemName:'صابون', qty:2, unit:'حبة', unitCost:4, itemCost:8 }],
    timeline:[], createdAt:'2026-01-02T08:00:00' };
  purchases=[PO];
  window.__store[PC+'/PO-SVR']=Object.assign({},PO);
  // المحاكي يبثّ اللقطات فيعيد مستمعُ النواة بناءَ purchases — فتُقرأ الحالة طازجةً دائماً
  const cur=()=>purchases.find(x=>x.id==='PO-SVR')||window.__store[PC+'/PO-SVR']||{};
  openNotifyWarehouseModal('PO-SVR');           // تبني حقول nw-invno/nw-file الحقيقية
  await doNotifyWarehouse('PO-SVR');
  out.afterBuy = cur().status;
  out.storedAfterBuy = (window.__store[PC+'/PO-SVR']||{}).status;

  // (ب) دورٌ لا يملك الاستلام لا يفتح النافذة
  currentUser={name:'فني', role:'technician'};
  supervisorReceipt.open('PO-SVR');
  out.wrongRoleModal = (document.getElementById('modal-sv-receipt')||{style:{display:'none'}}).style.display||'none';

  // (ج) المشرف: محضرٌ جزئيٌّ بلا صور — البند المغطى من المخزون لا يظهر أصلاً
  currentUser={name:'مشرف الموقع', role:'مشرف'};
  supervisorReceipt.open('PO-SVR');
  const inputs=document.querySelectorAll('#modal-sv-receipt .sv-qty');
  out.rowCount=inputs.length;
  document.querySelector('#modal-sv-receipt .sv-qty[data-idx="0"]').value='2';
  document.querySelector('#modal-sv-receipt .sv-qty[data-idx="2"]').value='0';
  await supervisorReceipt.save();
  out.afterPartial = cur().status;
  out.receipts1 = (cur().svReceipts||[]).length;
  out.partialItems = JSON.stringify(((cur().svReceipts||[])[0]||{}).items||[]);

  // (د) محضرٌ ثانٍ يكمل — وكميةٌ فوق المتبقي تُقصّ لسقفه
  supervisorReceipt.open('PO-SVR');
  document.querySelector('#modal-sv-receipt .sv-qty[data-idx="0"]').value='99';   // المتبقي 3
  await supervisorReceipt.save();
  out.afterComplete = cur().status;
  out.receipts2 = (cur().svReceipts||[]).length;
  const cum={}; (cur().svReceipts||[]).forEach(r=>(r.items||[]).forEach(x=>{cum[x.idx]=(cum[x.idx]||0)+x.qty;}));
  out.cum0=cum[0]; out.cum2=cum[2];
  out.completeEvent = (cur().timeline||[]).some(t=>t&&t.event&&t.event.indexOf('اكتمل استلام المشرف')>=0);

  // (هـ) التحويل المباشر (خدمة بلا توريدٍ ميداني) — للمشتريات، موثَّقاً
  currentUser={name:'مسؤول المشتريات', role:'procurement_officer'};
  const PO2={ id:'PO-SVR2', building:'م', status:'sv_receiving', items:[{itemName:'خدمة تركيب', qty:1, unit:'خدمة'}], timeline:[] };
  purchases.push(PO2);
  window.__store[PC+'/PO-SVR2']=Object.assign({},PO2);
  await supervisorReceipt.directTransfer('PO-SVR2');
  const cur2=()=>purchases.find(x=>x.id==='PO-SVR2')||window.__store[PC+'/PO-SVR2']||{};
  out.directStatus = cur2().status;
  out.directLogged = (cur2().timeline||[]).some(t=>t&&t.event&&t.event.indexOf('تحويل مباشر للمستودع')>=0);
  return out;
});
check('16أ) ★★ «تم الشراء» يوجّه لاستلام المشرف لا المستودع (المفتاح مفعّل)', s16.afterBuy==='sv_receiving', 'الحالة='+s16.afterBuy);
check('16أ) والحالة ثبتت في المخزن', s16.storedAfterBuy==='sv_receiving');
check('16ب) ★ دورٌ لا يملك الاستلام لا تُفتح له النافذة', s16.wrongRoleModal!=='flex', 'display='+s16.wrongRoleModal);
check('16ج) ★ البند المغطى كاملاً من المخزون لا يُعرض للاستلام (صفّان لا ثلاثة)', s16.rowCount===2, 'الصفوف='+s16.rowCount);
check('16ج) ★★ محضرٌ جزئيٌّ يبقي الطلب عند المشرف', s16.afterPartial==='sv_receiving' && s16.receipts1===1, 'الحالة='+s16.afterPartial);
check('16ج) والكمياتُ الصفرية لا تدخل المحضر', s16.partialItems.indexOf('"qty":2')>=0 && s16.partialItems.indexOf('"idx":2')<0, s16.partialItems);
check('16ج) ★ الحفظ بلا صور مرّ بتنبيهٍ صريح (اختياريةٌ لا ممنوعة)', s16.confirms>=1, 'تأكيدات='+s16.confirms);
check('16د) ★★ اكتمالُ الكميات يحيل للمستودع تلقائياً', s16.afterComplete==='wh_receiving' && s16.receipts2===2, 'الحالة='+s16.afterComplete);
check('16د) ★★ الكميةُ فوق المتبقي تُقصّ لسقفه (99 ⇒ 3، التراكمي 5 لا 101)', s16.cum0===5 && s16.cum2===2, 'تراكمي='+s16.cum0+'/'+s16.cum2);
check('16د) وقيدُ الاكتمال في السجل', s16.completeEvent===true);
check('16هـ) ★ التحويل المباشر يحيل للمستودع بقيد تجاوزٍ موثَّق', s16.directStatus==='wh_receiving' && s16.directLogged===true, 'الحالة='+s16.directStatus);

/* ══ سيناريو 17: رابطُ واتساب «فتح الطلب» في يد المشرف المحجوبةِ عنه صفحةُ المشتريات ══
   بلاغُ المالك 31/08: الرسالةُ تصل، والضغطُ على «فتح الطلب» يقذفه إلى اللوحة برسالة
   «🔒 ليس لديك صلاحية الوصول لهذه الصفحة» والطلبُ لا يظهر. الرابطُ تكليفٌ بطلبٍ بعينه
   لا استعراضٌ لقائمة، فيُفتح الطلبُ في مكانه بأزراره كاملة.

   **صفحةٌ ثانيةٌ نظيفة**: السيناريوهاتُ السابقة تستبدل `openModal`/`openPurchaseDetail`
   بمُزيّفاتٍ في نفس الصفحة، فقياسُ «هل ظهر الطلبُ فعلاً» عليها يقيس المزيَّف. ══════ */
log('\n=== السيناريو 17: الرابط العميق للمشرف المحجوبةِ عنه صفحةُ المشتريات ══');
const page17 = await browser.newPage();
await page17.addInitScript(MOCK_FIREBASE);
page17.on('pageerror', e=>boot.push(String(e.message).slice(0,120)));
await page17.goto('file://'+process.cwd()+'/index.html', { waitUntil:'domcontentloaded', timeout:20000 });
await page17.waitForTimeout(3000);
const s17 = await page17.evaluate(async ()=>{
  const out={}; const toasts=[]; window.toast=(m)=>toasts.push(String(m));
  const PC=PURCHASES_COLLECTION();
  const mkPO=(id)=>({ id, building:'مبنى الأمانة', projectId:'hail', status:'sv_receiving',
    vendor:'مورد الطلب المقترح',
    supervisor:'محمد داوود', receivingSupervisor:'أسامة السادات', receivingSupervisorUser:'osama',
    items:[{ itemName:'كابل', qty:4, unit:'متر', unitCost:5, itemCost:20 }],
    timeline:[], createdAt:'2026-08-30T08:00:00' });
  const reset=()=>{ document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.getElementById('page-dashboard').classList.add('active');
    const m=document.getElementById('modal-purchase-detail'); if(m) m.classList.remove('open');
    toasts.length=0; };

  // (أ) المشرفُ الذي أُلغي عنه مفتاحُ «المشتريات» — الحالةُ المُبلَّغة بالضبط
  currentUser={ name:'أسامة السادات', user:'osama', role:'مشرف', permissions:{ purchases:false } };
  purchases=[mkPO('PO-DL-1')]; window.__store[PC+'/PO-DL-1']=Object.assign({},purchases[0]);
  out.pageBlocked = _blockedPagesForUser().has('purchases');
  reset(); window._pendingPO='PO-DL-1';
  try{ _openPendingPO(); }catch(e){ out.err=String(e&&e.message); }
  await new Promise(r=>setTimeout(r,400));
  out.deniedToast = toasts.some(m=>m.indexOf('صلاحية الوصول لهذه الصفحة')>=0);
  out.detailOpen  = document.getElementById('modal-purchase-detail').classList.contains('open');
  out.stayedPut   = !document.getElementById('page-purchases').classList.contains('active');
  out.titleShown  = (document.getElementById('po-detail-title').textContent||'').indexOf('PO-DL-1')>=0;
  out.receiveBtn  = (document.getElementById('po-detail-footer').innerHTML||'').indexOf("supervisorReceipt.open('PO-DL-1')")>=0;

  // (ب) ومن لم تُحجب عنه الصفحةُ يُنقل إلى القائمة كما كان — الطلبُ في سياقه
  currentUser={ name:'أسامة السادات', user:'osama', role:'مشرف', permissions:{ purchases:true } };
  purchases=[mkPO('PO-DL-2')]; window.__store[PC+'/PO-DL-2']=Object.assign({},purchases[0]);
  reset(); window._pendingPO='PO-DL-2';
  try{ _openPendingPO(); }catch(e){ out.err2=String(e&&e.message); }
  await new Promise(r=>setTimeout(r,700));
  out.movedToList = document.getElementById('page-purchases').classList.contains('active');
  out.detailOpen2 = document.getElementById('modal-purchase-detail').classList.contains('open');

  // (ج) والمرحلةُ إجراءٌ في مصدر الحقيقة — تُعَدّ في «بانتظار إجراءك» ويقبلها حارسُ التحديث
  out.svActions = getAvailableStatuses('sv_receiving', purchases[0]).map(o=>o.v);
  out.needsMyAction = poNeedsMyAction(purchases[0]);
  currentUser={ name:'المالية', role:'finance' };
  out.financeActions = getAvailableStatuses('sv_receiving', purchases[0]).map(o=>o.v);

  /* (د) وبطاقةُ «بانتظار إجراءك» على **اللوحة الرئيسية** — المحجوبةُ عنه صفحةُ
     المشتريات كان لا يعرف بمهمّته إلا برسالة واتساب (طلب المالك 31/08). */
  currentUser={ name:'أسامة السادات', user:'osama', role:'مشرف', permissions:{ purchases:false } };
  renderPOMyTasks(_poVisibleList(), "po-my-tasks-card-dash");
  const dashHost=document.getElementById('po-my-tasks-card-dash');
  out.dashShown   = !!dashHost && dashHost.style.display!=='none' && dashHost.innerHTML.length>0;
  out.dashHasPO   = !!dashHost && dashHost.innerHTML.indexOf('PO-DL-2')>=0;
  out.dashOpensPO = !!dashHost && dashHost.innerHTML.indexOf("openPurchaseDetail('PO-DL-2')")>=0;
  out.dashNoFilter= !!dashHost && dashHost.innerHTML.indexOf('_poStageFilter')<0;   // لا تصفيةَ لقائمةٍ محجوبة
  // ولا تظهر لمن لا مهمّةَ له
  currentUser={ name:'المالية', role:'finance' };
  renderPOMyTasks(_poVisibleList(), "po-my-tasks-card-dash");
  out.dashHiddenForOthers = document.getElementById('po-my-tasks-card-dash').style.display==='none';
  // وبطاقةُ صفحة المشتريات لم تُمسّ (مضيفان لا منطقان)
  currentUser={ name:'أسامة السادات', user:'osama', role:'مشرف', permissions:{ purchases:false } };
  renderPOMyTasks(_poVisibleList());
  const pageHost=document.getElementById('po-my-tasks-card');
  out.pageStillWorks = !!pageHost && pageHost.innerHTML.indexOf('PO-DL-2')>=0
                       && pageHost.innerHTML.indexOf('_poStageFilter')>=0;

  /* (هـ) وثيقةُ المحضر — زرُّها على البطاقة، والورقةُ تُبنى بترويسة الشركة
     من أصولٍ حقيقيةٍ في المستند (طلب المالك 31/08). */
  const poDoc={ id:'PO-DOC-1', projectName:'مشروع حائل', building:'المبنى', vendor:'مورد أ',
    items:[{itemName:'جلبة',unit:'قطعة',qty:5}],
    status:'wh_receiving',
    svReceipts:[{ref:'SVR-01',by:'أسامة السادات',at:'2026-08-31T10:00:00Z',
      notes:'حالة جيدة',photos:[{url:'x'}],items:[{idx:0,qty:5}]}] };
  const sec = supervisorReceipt.sectionHtml(poDoc);
  out.docBtnInSection = sec.indexOf("printReceipt('PO-DOC-1','SVR-01')")>=0;
  out.docBtnInAudit   = supervisorReceipt.auditHtml(poDoc).indexOf("printReceipt('PO-DOC-1','SVR-01')")>=0;
  const paper = supervisorReceipt.paperHTML(poDoc,'SVR-01');
  out.docHasPaper  = paper.indexOf('محضر استلام ميداني')>=0 && paper.indexOf('SVR-01')>=0;
  out.docHasSigns  = paper.indexOf('مسؤول المستودع')>=0 && paper.indexOf('مدير المشروع')>=0;
  // الورقةُ الرسمية تُقرأ من contracts المعروضة — مصدرٌ واحدٌ لهيئة أوراق الشركة
  out.docLetterhead = paper.indexOf('letterhead-header')>=0 || paper.indexOf('class="company"')>=0;
  out.docLhOn = paper.indexOf('class="lh lh-h"')>=0;   // هل انعقدت الورقةُ الرسمية فعلاً؟

  /* (و) المورد الفعلي يكتبه المستلم — والاختلافُ عن مورد الطلب يُبرَز */
  supervisorReceipt.open('PO-DL-2');
  const vIn = document.getElementById('sv-vendor');
  out.vendorFieldShown = !!vIn && vIn.value==='';        // حاضرٌ وفارغٌ لا معبَّأٌ سلفاً
  if(vIn){ supervisorReceipt._sameVendor(); out.sameVendorFills = vIn.value.length>0; }
  supervisorReceipt.close();
  const poV={ id:'PO-V', vendor:'مورد الطلب', items:[{itemName:'ج',unit:'قطعة',qty:2}],
    status:'wh_receiving',
    svReceipts:[{ref:'SVR-01',by:'أ',at:'2026-08-31T10:00:00Z',vendor:'مورد آخر',photos:[],items:[{idx:0,qty:2}]}] };
  out.vendorChipDiff = supervisorReceipt.sectionHtml(poV).indexOf('≠ مورد الطلب')>=0;
  const pv = supervisorReceipt.paperHTML(poV,'SVR-01');
  out.paperTwoVendors = pv.indexOf('المورد في الطلب')>=0 && pv.indexOf('المورد الفعلي')>=0
                        && pv.indexOf('يخالف مورد الطلب')>=0;

  /* (ز) الطلبُ العائدُ إلى المرحلة بعد اكتمالها — مصيدةٌ بلا مخرج (بلاغ المالك 03/09).
     PO-202609-0229: اكتمل المحضرُ فأُحيل للمستودع، ثم أرجعه المسؤولُ للمشتريات
     لتصحيح الفاتورة، ثمّ أُشعِر بالشراء ثانيةً فعاد إلى `sv_receiving` بلا متبقٍّ:
     الخاناتُ معطَّلةٌ و«التحويلُ رغم النقص» مخفيٌّ و`save()` يردّ أبداً. */
  currentUser={ name:'أسامة السادات', user:'osama', role:'مشرف', permissions:{ purchases:true } };
  const back={ id:'PO-BACK-1', building:'مبنى الأمانة', projectId:'hail', status:'sv_receiving',
    vendor:'انوار المنازل', supervisor:'محمد داوود', receivingSupervisor:'أسامة السادات',
    items:[{ itemName:'جرس بطارية', qty:5, unit:'قطعة', unitCost:20, itemCost:100 }],
    svReceipts:[{ ref:'SVR-01', by:'أسامة السادات', at:'2026-09-02T16:01:00Z',
      vendor:'انوار المنازل', photos:[{url:'x'}], items:[{idx:0,name:'جرس بطارية',unit:'قطعة',qty:5}] }],
    timeline:[], createdAt:'2026-09-02T09:15:00' };
  purchases=[back]; window.__store[PC+'/PO-BACK-1']=JSON.parse(JSON.stringify(back));
  reset();
  supervisorReceipt.open('PO-BACK-1');
  const qtyIn=[].slice.call(document.querySelectorAll('#modal-sv-receipt .sv-qty'));
  out.trapNoOpenQty  = qtyIn.length>0 && qtyIn.every(i=>i.disabled);          // لا كميةَ تُدخَل
  out.trapForceHidden= (document.getElementById('sv-force-row')||{}).style.display==='none';
  out.exitBtnShown   = !!document.getElementById('sv-fwd-btn');               // المخرجُ ظاهر
  out.saveBtnHidden  = !document.getElementById('sv-save-btn');
  out.entryFieldsHidden = (document.getElementById('sv-entry-fields')||{}).style.display==='none';
  out.exitBanner     = (document.getElementById('modal-sv-receipt').innerHTML||'').indexOf('لا متبقٍّ يُسجَّل')>=0;
  await supervisorReceipt.forwardToWarehouse();
  await new Promise(r=>setTimeout(r,300));
  const backSaved=window.__store[PC+'/PO-BACK-1']||{};
  out.exitMoved   = backSaved.status==='wh_receiving';
  out.exitLogged  = (backSaved.timeline||[]).some(t=>t&&t.code==='wh_receiving'
                      && String(t.event).indexOf('أُحيل للمستودع للتدقيق')>=0);
  out.exitNoNewRec= (backSaved.svReceipts||[]).length===1;                    // لا محضرَ ثانياً بصفر

  /* والمنعُ عند المصدر: «تم الشراء» لا يُعيد إلى مرحلة المشرف طلباً اكتمل استلامُه */
  currentUser={ name:'وائل عبد المجيد', user:'wael', role:'procurement_officer' };
  const back2=JSON.parse(JSON.stringify(back));
  back2.id='PO-BACK-2'; back2.status='proc_executing';
  purchases=[back2]; window.__store[PC+'/PO-BACK-2']=JSON.parse(JSON.stringify(back2));
  reset();
  openNotifyWarehouseModal('PO-BACK-2');
  await new Promise(r=>setTimeout(r,200));
  await doNotifyWarehouse('PO-BACK-2');
  await new Promise(r=>setTimeout(r,300));
  const b2=window.__store[PC+'/PO-BACK-2']||{};
  out.notifySkipsSv = b2.status==='wh_receiving';
  out.notifySaysWhy = (b2.timeline||[]).some(t=>t&&String(t.notes||'').indexOf('استلامُ المشرف مكتملٌ سلفاً')>=0);
  /* ولا تُمَسّ الحالةُ السويّة: طلبٌ بلا محاضرَ يمرّ بمرحلة المشرف كما كان */
  const fresh={ id:'PO-BACK-3', building:'م', projectId:'hail', status:'proc_executing',
    items:[{ itemName:'جرس بطارية', qty:5, unit:'قطعة', unitCost:20, itemCost:100 }],
    timeline:[], createdAt:'2026-09-02T09:15:00' };
  purchases=[fresh]; window.__store[PC+'/PO-BACK-3']=JSON.parse(JSON.stringify(fresh));
  reset();
  openNotifyWarehouseModal('PO-BACK-3');
  await new Promise(r=>setTimeout(r,200));
  await doNotifyWarehouse('PO-BACK-3');
  await new Promise(r=>setTimeout(r,300));
  out.notifyKeepsSv = (window.__store[PC+'/PO-BACK-3']||{}).status==='sv_receiving';
  return out;
});
await page17.close();
check('17أ) صفحةُ المشتريات محجوبةٌ فعلاً عن هذا المشرف (شرطُ البلاغ)', s17.pageBlocked===true);
check('17أ) ★★ الرابطُ لا يعود برسالة «ليس لديك صلاحية الوصول لهذه الصفحة»', s17.deniedToast===false);
check('17أ) ★★ بل يُفتح الطلبُ نفسُه في مكانه', s17.detailOpen===true && s17.titleShown===true, 'مودال='+s17.detailOpen+' عنوان='+s17.titleShown);
check('17أ) ★ ولا يُقذف إلى صفحةٍ محجوبة', s17.stayedPut===true);
check('17أ) ★★ وزرُّ «استلام المشرف» حاضرٌ فيه (الرابطُ يوصل إلى الإجراء لا إلى العرض)', s17.receiveBtn===true);
check('17ب) ★ ومن لم تُحجب عنه الصفحةُ يُنقل إلى القائمة كما كان', s17.movedToList===true && s17.detailOpen2===true, 'القائمة='+s17.movedToList+' مودال='+s17.detailOpen2);
check('17ج) ★★ `getAvailableStatuses` تعطي المشرفَ إجراءً في مرحلته', (s17.svActions||[]).includes('__SUPERVISOR_RECEIPT__'), JSON.stringify(s17.svActions));
check('17ج) ★★ فتَعُدّه بطاقةُ «بانتظار إجراءك» (poNeedsMyAction)', s17.needsMyAction===true);
check('17ج) ★ ولا يُمنح لدورٍ لا يستلم ميدانياً', !(s17.financeActions||[]).includes('__SUPERVISOR_RECEIPT__'), JSON.stringify(s17.financeActions));
check('17د) ★★ وبطاقةُ «بانتظار إجراءك» تظهر له على اللوحة الرئيسية', s17.dashShown===true && s17.dashHasPO===true, 'ظهرت='+s17.dashShown+' فيها الطلب='+s17.dashHasPO);
check('17د) ★ وصفُّ الطلب يفتح تفاصيلَه من مكانه', s17.dashOpensPO===true);
check('17د) ★ ولا رأسَ مرحلةٍ يُصفّي قائمةً محجوبةً عنه', s17.dashNoFilter===true);
check('17د) ★ ولا تظهر لمن لا مهمّةَ له', s17.dashHiddenForOthers===true);
check('17د) ★★ وبطاقةُ صفحة المشتريات كما كانت — مضيفان لا منطقان', s17.pageStillWorks===true);
check('17هـ) ★★ زرُّ «طباعة المحضر» على البطاقة — في التفاصيل ونافذة التدقيق', s17.docBtnInSection===true && s17.docBtnInAudit===true, 'تفاصيل='+s17.docBtnInSection+' تدقيق='+s17.docBtnInAudit);
check('17هـ) ★★ والورقةُ تُبنى وثيقةً مستقلّةً بعنوانها ورقمها', s17.docHasPaper===true);
check('17هـ) ★★ وفيها خاناتُ التوقيع الثلاث', s17.docHasSigns===true);
check('17هـ) ★★ وتحمل الورقةَ الرسميةَ للشركة (ترويسة/تذييل/علامة مائية من contracts)', s17.docLhOn===true, 'ورقةٌ رسمية='+s17.docLhOn+' هيئةٌ ما='+s17.docLetterhead);
check('17و) ★★ حقلُ «المورد الفعلي» حاضرٌ في نافذة الاستلام وفارغٌ لا معبَّأٌ سلفاً', s17.vendorFieldShown===true);
check('17و) ★ وزرُّ «هو نفسه ✓» يملؤه بفعلٍ صريح', s17.sameVendorFills===true);
check('17و) ★★ واختلافُه عن مورد الطلب يُبرَز على البطاقة', s17.vendorChipDiff===true);
check('17و) ★★ والورقةُ تفصل الموردَين وتُعلن المخالفة', s17.paperTwoVendors===true);
check('17ز) شرطُ البلاغ متحقّق: عاد الطلبُ للمرحلة وكلُّ كمياته مستلَمة (لا خانةَ إدخالٍ ولا «تحويل رغم النقص»)',
  s17.trapNoOpenQty===true && s17.trapForceHidden===true, 'خاناتٌ معطَّلة='+s17.trapNoOpenQty+' التحويلُ مخفيّ='+s17.trapForceHidden);
check('17ز) ★★ ومع ذلك للنافذة مخرجٌ ظاهر: «إحالة للمستودع للتدقيق» بدل زرِّ الحفظ',
  s17.exitBtnShown===true && s17.saveBtnHidden===true && s17.exitBanner===true,
  'زرّ='+s17.exitBtnShown+' حفظٌ مخفيّ='+s17.saveBtnHidden+' بيان='+s17.exitBanner);
check('17ز) ★ ولا حقولَ محضرٍ تُملأ ثم تُهمَل', s17.entryFieldsHidden===true);
check('17ز) ★★ والضغطُ عليه ينقل الطلبَ فعلاً إلى «بانتظار استلام المستودع» ويقيّده في السجل',
  s17.exitMoved===true && s17.exitLogged===true, 'الحالة='+s17.exitMoved+' القيد='+s17.exitLogged);
check('17ز) ★ ولا يُنشئ محضراً ثانياً بصفرٍ لبضاعةٍ وصلت مرةً واحدة', s17.exitNoNewRec===true);
check('17ز) ★★ والمنعُ عند المصدر: «تم الشراء» لا يُعيد طلباً اكتمل استلامُه إلى مرحلة المشرف',
  s17.notifySkipsSv===true, 'الحالةُ بعد الإشعار='+s17.notifySkipsSv);
check('17ز) ★ ولماذا تخطّاها مكتوبٌ في القيد لا مستنتَجٌ من غيابه', s17.notifySaysWhy===true);
check('17ز) ★★ ولا تُمَسّ الحالةُ السويّة: طلبٌ بلا محاضرَ يمرّ بمرحلة المشرف كما كان', s17.notifyKeepsSv===true);

log('\n════════════════════════════════════════');
log((fail===0?'✅ ':'❌ ')+pass+'/'+(pass+fail)+' سيناريو ناجح'+(fail?(' — '+fail+' فشل'):''));
if(boot.length) log('(أخطاء إقلاع غير حرجة: '+boot.length+' — متوقّعة من غياب CDN)');
log('════════════════════════════════════════');
await browser.close();
process.exit(fail?1:0);
