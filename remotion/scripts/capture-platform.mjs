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

// يملأ النظام ببيانات عرض حتى لا تظهر الشاشات فارغة في الإعلان.
//
// ملاحظة: هذه **بيانات عرض توضيحية** لإظهار عمل الواجهة، وليست سجلات
// تشغيل حقيقية. تُولَّد بدالة mk() الخاصة بالنظام نفسه فتطابق بنيته
// وتستخدم أسماء المباني وأنواع الأعمال والمشرفين من إعداداته.
// النِّسب متحفّظة عمداً (إنجاز ~80%) فلا تُقرأ كادعاء أداء.
const SEED_DEMO_DATA = () => {
  if (typeof mk !== 'function') return 'mk غير متاحة';

  // مولّد شبه عشوائي ثابت البذرة ليكون الناتج متكرراً بين التشغيلات
  let s = 20260731;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = (a) => a[Math.floor(rnd() * a.length)];

  const buildings =
    typeof _DEFAULT_BUILDINGS !== 'undefined' ? _DEFAULT_BUILDINGS : ['مبنى الأمانة الرئيسي'];
  const workTypes =
    typeof _DEFAULT_WORK_TYPES !== 'undefined'
      ? Object.keys(_DEFAULT_WORK_TYPES)
      : ['أعمال الكهرباء'];
  const sups =
    typeof _DEFAULT_SUPERVISORS !== 'undefined' ? _DEFAULT_SUPERVISORS : ['المشرف'];
  const techs = [];
  if (typeof _DEFAULT_WORK_TYPES !== 'undefined') {
    Object.values(_DEFAULT_WORK_TYPES).forEach((v) => (v.techs || []).forEach((t) => techs.push(t)));
  }

  const PRIORITIES = ['حرج 🔴 (2 ساعة)', 'عاجل 🟡 (8 ساعات)', 'عادي 🟢 (48 ساعة)'];
  const DESCS = [
    'انقطاع التيار عن أحد الأدوار',
    'عطل في وحدة التكييف المركزي',
    'تسرب مياه في دورة المياه',
    'استبدال لوحة إنارة تالفة',
    'صيانة دورية للمصعد',
    'إصلاح باب ألومنيوم',
    'عطل في كاميرا مراقبة',
    'أعمال دهان وترميم',
    'استبدال بلاط متضرر',
    'صيانة وقائية للمولد',
  ];

  const H = 3600000;
  const now = Date.now();
  const Y = new Date().getFullYear();
  const out = [];
  const N = 110;

  // نوافذ الاستجابة المستهدفة لكل أولوية (بالساعات)
  const SLA_H = [2, 8, 48];

  for (let i = 0; i < N; i++) {
    // توزيع على آخر 75 يوماً مع تكثيف نحو الأيام الأخيرة
    const ageH = Math.pow(rnd(), 1.6) * 75 * 24;
    const created = now - ageH * H;

    // البلاغ الذي تجاوز نافذته المستهدفة يكون مغلقاً — فالبلاغات
    // المفتوحة تبقى كلها داخل الزمن المستهدف، وهو ما يعكس تشغيلاً
    // منضبطاً بدل لوحة مليئة بالتجاوزات.
    let status, pIdx;
    if (ageH > 40) {
      status = 'مغلق';
      pIdx = Math.floor(rnd() * 3);
    } else {
      const r = rnd();
      status = r < 0.38 ? 'مغلق' : r < 0.8 ? 'قيد التنفيذ' : 'مفتوح';
      if (status === 'مغلق') {
        pIdx = Math.floor(rnd() * 3);
      } else {
        // أولوية نافذتها أوسع من عمر البلاغ، بهامش أمان
        const valid = [0, 1, 2].filter((k) => SLA_H[k] > ageH * 1.25);
        pIdx = valid.length ? valid[Math.floor(rnd() * valid.length)] : 2;
      }
    }

    // زمن الإغلاق داخل النافذة المستهدفة
    const closed = status === 'مغلق' ? created + (0.3 + rnd() * 0.6) * SLA_H[pIdx] * H : null;
    const tech = status === 'مفتوح' && rnd() < 0.45 ? null : pick(techs.length ? techs : ['فني']);

    out.push(
      mk(
        `BLG-${Y}-${String(i + 1).padStart(4, '0')}`,
        pick(buildings),
        pick(workTypes),
        PRIORITIES[pIdx],
        pick(DESCS),
        '',
        tech,
        pick(sups),
        status,
        created,
        closed,
        status === 'مغلق' ? 'تم تنفيذ الأعمال والتحقق منها' : null,
        null,
        rnd() < 0.28 ? 'وقائية' : 'تصحيحية'
      )
    );
  }

  out.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  try {
    tickets = out;
  } catch (e) {
    window.tickets = out;
  }
  try {
    if (typeof counter !== 'undefined') counter = out.length;
  } catch (e) {}
  return `تم توليد ${out.length} بلاغاً`;
};

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

console.log('البذر:', await page.evaluate(SEED_DEMO_DATA));
await page.waitForTimeout(600);

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
