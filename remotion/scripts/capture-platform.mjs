// يلتقط لقطات حقيقية من نظام إدارة المرافق لاستخدامها في مشهد المنصة.
//
//   node scripts/capture-platform.mjs
//
// يشغّل index.html في Chromium مع Firestore وهمي في الذاكرة (لا يلمس
// الإنتاج إطلاقاً)، ويتجاوز تسجيل الدخول بتعيين مستخدم إداري.
// الناتج: public/platform/*.png

import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = resolve(ROOT, 'remotion', 'public', 'platform');
mkdirSync(OUT, { recursive: true });

// Firestore وهمي يُحقن قبل أي سكربت في الصفحة
const MOCK_FIREBASE = `
window.__store = {};
(function(){
  function snap(path){ var d=window.__store[path]; return { exists:d!==undefined, id:path.split('/').pop(), data:function(){return d||{};}, get:function(f){return (d||{})[f];} }; }
  function applyVal(cur,k,v){ if(v && v.__inc!==undefined) return (cur[k]||0)+v.__inc; if(v && v.__sv) return Date.now(); if(v && v.__del) return undefined; return v; }
  function writeDoc(path,d,merge){ var cur=window.__store[path]||{}; var nd=merge?Object.assign({},cur):{}; for(var k in d){ var nv=applyVal(cur,k,d[k]); if(nv===undefined) delete nd[k]; else nd[k]=nv; } window.__store[path]=nd; }
  function docsUnder(coll){ return Object.keys(window.__store).filter(function(k){ return k.indexOf(coll+'/')===0 && k.slice(coll.length+1).indexOf('/')<0; }); }
  function docRef(path){ return { path:path, id:path.split('/').pop(),
    get:function(){ return Promise.resolve(snap(path)); },
    set:function(d,opt){ writeDoc(path,d,!!(opt&&opt.merge)); return Promise.resolve(); },
    update:function(d){ writeDoc(path,d,true); return Promise.resolve(); },
    delete:function(){ delete window.__store[path]; return Promise.resolve(); },
    collection:function(c){ return collRef(path+'/'+c); },
    onSnapshot:function(cb){ try{ cb(snap(path)); }catch(e){} return function(){}; } }; }
  function collSnap(coll){ var ds=docsUnder(coll).map(snap); return { empty:ds.length===0, size:ds.length, docs:ds, forEach:function(f){ds.forEach(f);} }; }
  function collRef(coll){ var q={
    doc:function(id){ return docRef(id? coll+'/'+id : coll+'/auto_'+Math.random().toString(36).slice(2)); },
    add:function(d){ var id='auto_'+Math.random().toString(36).slice(2); window.__store[coll+'/'+id]=d; return Promise.resolve(docRef(coll+'/'+id)); },
    where:function(){ return q; }, orderBy:function(){ return q; }, limit:function(){ return q; },
    get:function(){ return Promise.resolve(collSnap(coll)); },
    onSnapshot:function(cb){ try{ cb(collSnap(coll)); }catch(e){} return function(){}; } }; return q; }
  var FieldValue={ serverTimestamp:function(){return {__sv:1};}, increment:function(n){return {__inc:n};}, arrayUnion:function(){return {};}, arrayRemove:function(){return {};}, delete:function(){return {__del:1};} };
  var fs={ collection:collRef, doc:docRef, runTransaction:function(fn){
      var tx={ get:function(ref){ return Promise.resolve(snap(ref.path)); },
               set:function(ref,d,opt){ writeDoc(ref.path,d,!!(opt&&opt.merge)); },
               update:function(ref,d){ writeDoc(ref.path,d,true); },
               delete:function(ref){ delete window.__store[ref.path]; } };
      return Promise.resolve(fn(tx));
    }, batch:function(){ var ops=[]; return {
      set:function(r,d,o){ ops.push(function(){writeDoc(r.path,d,!!(o&&o.merge));}); },
      update:function(r,d){ ops.push(function(){writeDoc(r.path,d,true);}); },
      delete:function(r){ ops.push(function(){delete window.__store[r.path];}); },
      commit:function(){ ops.forEach(function(f){f();}); return Promise.resolve(); } }; } };
  window.firebase = {
    initializeApp:function(){ return {}; },
    firestore:Object.assign(function(){ return fs; }, { FieldValue:FieldValue, Timestamp:{ now:function(){return {toDate:function(){return new Date();}};} } }),
    auth:function(){ return { onAuthStateChanged:function(cb){ cb(null); }, signInWithEmailAndPassword:function(){ return Promise.resolve({}); }, signOut:function(){ return Promise.resolve(); }, currentUser:null }; },
    apps:[]
  };
})();
`;

// الشاشات المطلوبة — اسم الصفحة داخل التطبيق ووصفها
const SCREENS = [
  { page: 'dashboard', file: 'dashboard.png' },
  { page: 'kpi', file: 'kpi.png' },
  { page: 'buildings', file: 'buildings.png' },
  { page: 'purchases', file: 'purchases.png' },
  { page: 'inventory', file: 'inventory.png' },
  { page: 'reports', file: 'reports.png' },
];

// يخفي أي إشعار خطأ أو نافذة منبثقة تفسد اللقطة
const HIDE_OVERLAYS = () => {
  const sels = [
    '.toast', '.toast-error', '#toast', '#error-toast', '.error-banner',
    '.modal-backdrop', '.overlay', '[role="alertdialog"]',
  ];
  document.querySelectorAll(sels.join(',')).forEach((el) => {
    el.style.display = 'none';
  });
  // أي عنصر ثابت أسفل الشاشة يحمل زر «تحديث الصفحة»
  document.querySelectorAll('div,section,aside').forEach((el) => {
    const cs = getComputedStyle(el);
    if (
      (cs.position === 'fixed' || cs.position === 'sticky') &&
      /تحديث الصفحة|حدث خطأ غير متوقع/.test(el.textContent || '') &&
      el.getBoundingClientRect().height < 400
    ) {
      el.style.display = 'none';
    }
  });
};

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--font-render-hinting=none'],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2, // لقطات بدقة مضاعفة تكفي عرض 4K
});
await page.addInitScript(MOCK_FIREBASE);

page.on('pageerror', (e) => console.log('  [خطأ صفحة]', String(e).slice(0, 120)));

await page.goto('file://' + resolve(ROOT, 'index.html'), {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(3500);

// تجاوز شاشة الدخول بتعيين مستخدم إداري
await page.evaluate(() => {
  try {
    window.currentUser = { name: 'مدير النظام', role: 'admin', email: 'admin@fastbuildings.sa' };
    window.isAdmin = () => true;
    window.isWarehouseManager = () => true;
    window.isProcurementOfficer = () => true;
    document.querySelectorAll('#login-screen,#loginScreen,.login-screen,#auth-screen').forEach((el) => {
      el.style.display = 'none';
    });
    const app = document.querySelector('#app,#main,#app-screen,.app-shell');
    if (app) app.style.display = '';
  } catch (e) {}
});
await page.waitForTimeout(1200);

for (const s of SCREENS) {
  try {
    await page.evaluate((p) => {
      if (typeof window.showPage === 'function') window.showPage(p);
    }, s.page);
    await page.waitForTimeout(2200);
    await page.evaluate(HIDE_OVERLAYS);
    await page.waitForTimeout(250);
    await page.screenshot({ path: resolve(OUT, s.file) });
    console.log('✓ التقطت', s.file);
  } catch (e) {
    console.log('✗ فشلت', s.file, String(e).slice(0, 100));
  }
}

await browser.close();
console.log('الناتج في', OUT);
