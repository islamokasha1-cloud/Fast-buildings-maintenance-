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
  function writeDoc(path,d,merge){ var cur=window.__store[path]||{}; var nd=merge?Object.assign({},cur):{}; for(var k in d){ var nv=applyVal(cur,k,d[k]); if(nv===undefined) delete nd[k]; else nd[k]=nv; } window.__store[path]=nd; }
  function docsUnder(coll){ return Object.keys(window.__store).filter(function(k){ return k.indexOf(coll+'/')===0 && k.slice(coll.length+1).indexOf('/')<0; }); }
  function docRef(path){ return {
    path:path, id:path.split('/').pop(),
    get:function(){ return Promise.resolve(snap(path)); },
    set:function(d,opt){ writeDoc(path,d,!!(opt&&opt.merge)); return Promise.resolve(); },
    update:function(d){ writeDoc(path,d,true); return Promise.resolve(); },
    delete:function(){ delete window.__store[path]; return Promise.resolve(); },
    collection:function(c){ return collRef(path+'/'+c); },
    onSnapshot:function(cb){ try{ cb(snap(path)); }catch(e){} return function(){}; }
  }; }
  function collSnap(coll){ var ds=docsUnder(coll).map(snap); return { empty:ds.length===0, size:ds.length, docs:ds, forEach:function(f){ds.forEach(f);} }; }
  function collRef(coll){ var q={
    doc:function(id){ return docRef(id? coll+'/'+id : coll+'/auto_'+Math.random().toString(36).slice(2)); },
    add:function(d){ var id='auto_'+Math.random().toString(36).slice(2); window.__store[coll+'/'+id]=d; return Promise.resolve(docRef(coll+'/'+id)); },
    where:function(){ return q; }, orderBy:function(){ return q; }, limit:function(){ return q; },
    get:function(){ return Promise.resolve(collSnap(coll)); },
    onSnapshot:function(cb){ try{ cb(collSnap(coll)); }catch(e){} return function(){}; }
  }; return q; }
  var FieldValue={ serverTimestamp:function(){return {__sv:1};}, increment:function(n){return {__inc:n};}, arrayUnion:function(){return {};}, arrayRemove:function(){return {};}, delete:function(){return {__del:1};} };
  var fs={ collection:collRef, doc:docRef, runTransaction:function(fn){
    var tx={ get:function(ref){ return Promise.resolve(snap(ref.path)); },
             set:function(ref,d,opt){ writeDoc(ref.path,d,!!(opt&&opt.merge)); },
             update:function(ref,d){ writeDoc(ref.path,d,true); },
             delete:function(ref){ delete window.__store[ref.path]; } };
    return Promise.resolve().then(function(){ return fn(tx); });
  }, batch:function(){ return {
             set:function(ref,d,opt){ writeDoc(ref.path,d,!!(opt&&opt.merge)); },
             update:function(ref,d){ writeDoc(ref.path,d,true); },
             delete:function(ref){ delete window.__store[ref.path]; },
             commit:function(){ return Promise.resolve(); } }; }};
  var firestoreFn=function(){ return fs; };
  firestoreFn.FieldValue=FieldValue;
  firestoreFn.Timestamp={ now:function(){return {toDate:function(){return new Date();}};}, fromDate:function(d){return {toDate:function(){return d;}};} };
  window.firebase={
    initializeApp:function(){ return {}; },
    firestore:firestoreFn,
    auth:function(){ return { currentUser:{uid:'test'}, onAuthStateChanged:function(cb){ try{cb({uid:'test'});}catch(e){} return function(){}; }, signInAnonymously:function(){return Promise.resolve({});}, signInWithCustomToken:function(){return Promise.resolve({});}, signOut:function(){return Promise.resolve();} }; },
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
  await recalcInventoryFromLog();
  return { A: (window.__store[INV+'/A']||{}).currentQty, B: (window.__store[INV+'/B']||{}).currentQty };
});
check('★ المصدر A = 30 (50 − نقل 20، لا 50 وهمية)', s3.A===30, 'A='+s3.A);
check('★ الوجهة B = 20 (أُضيف النقل)', s3.B===20, 'B='+s3.B);

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

log('\n════════════════════════════════════════');
log((fail===0?'✅ ':'❌ ')+pass+'/'+(pass+fail)+' سيناريو ناجح'+(fail?(' — '+fail+' فشل'):''));
if(boot.length) log('(أخطاء إقلاع غير حرجة: '+boot.length+' — متوقّعة من غياب CDN)');
log('════════════════════════════════════════');
await browser.close();
process.exit(fail?1:0);
