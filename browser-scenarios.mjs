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
  }};
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

log('\n════════════════════════════════════════');
log((fail===0?'✅ ':'❌ ')+pass+'/'+(pass+fail)+' سيناريو ناجح'+(fail?(' — '+fail+' فشل'):''));
if(boot.length) log('(أخطاء إقلاع غير حرجة: '+boot.length+' — متوقّعة من غياب CDN)');
log('════════════════════════════════════════');
await browser.close();
process.exit(fail?1:0);
