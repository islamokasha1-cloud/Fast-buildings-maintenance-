// فيديو تعريفيّ للمنصّة — من شاشاتها الحقيقية، لا من محاكاةٍ رسومية.
//
// يُشغّل `index.html` في Chromium حقيقيّ فوق مُحاكي Firestore نفسِه الذي تستخدمه
// فحوصُ المتصفّح (`browser-scenarios.mjs`)، يزرع بياناتٍ تجريبيةً واقعية، ثم يقود
// جولةً مُخرَجةً بالنقر الفعليّ على القائمة — بينما Playwright يسجّل الشاشة.
// الطبقةُ الوحيدةُ المضافةُ إلى الصفحة هي طبقةُ العناوين (`#pv-*`): بطاقاتُ فصولٍ
// وتعليقاتٌ سفلية ومؤشّرُ فأرةٍ مرئيّ — لا تلمس منطق التطبيق ولا تُبدّل شيئاً منه.
//
//   node promo-video.mjs            → فيديو MP4 كامل (~٣ دقائق)
//   node promo-video.mjs --probe    → لقطاتٌ فقط بلا تسجيل (تكرارٌ سريع أثناء الضبط)
//
// المتطلّبات:  npm install --no-save playwright-core ffmpeg-static
// المخرجات:    dist-video/promo.mp4 (1920×1080) · promo-hd.mp4 (نسخةُ مشاركةٍ تحت سقف حجم) · shots/*.png
//
// لا يلمس الإنتاج إطلاقاً: كل نداءٍ خارجيٍّ مُجهَض، وFirestore في الذاكرة.

import { chromium } from 'playwright-core';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const REPO = process.env.REPO_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname));
const OUT = process.env.OUT_DIR || path.join(REPO, 'dist-video');
const SHOTS = path.join(OUT, 'shots');
const PROBE = process.argv.includes('--probe');
// بلا بطاقتَي الافتتاح والختام — حين تأتيان من إعلان Remotion في `promo-assemble.mjs`.
const NO_BOOKENDS = process.argv.includes('--no-bookends');
const NAME = NO_BOOKENDS ? 'promo-body' : 'promo';
const SPEED = Number(process.env.PROMO_SPEED || (PROBE ? 12 : 1));   // مُسرِّعٌ للتجريب

// تُمسح مخرجاتُ هذا السكربت وحدَها لا المجلّدُ كلُّه — فقد تجاور فيه أجزاءُ التجميع.
fs.rmSync(SHOTS, { recursive: true, force: true });
for (const f of [`${NAME}.mp4`, 'promo-hd.mp4']) fs.rmSync(path.join(OUT, f), { force: true });
fs.mkdirSync(SHOTS, { recursive: true });

/* ═══════════════ مُحاكي Firestore — مصدرٌ واحدٌ مع فحوص المتصفّح ═══════════════ */
const bsrc = fs.readFileSync(path.join(REPO, 'browser-scenarios.mjs'), 'utf8');
const _a = bsrc.indexOf('const MOCK_FIREBASE = `');
const _s = bsrc.indexOf('`', _a) + 1, _e = bsrc.indexOf('`;', _s);
const MOCK_FIREBASE = bsrc.slice(_s, _e);
if (!MOCK_FIREBASE.includes('window.__store')) { console.error('تعذّر استخراج المُحاكي من browser-scenarios.mjs'); process.exit(1); }

// مكتبات CDN غير متاحة (كلُّ نداءٍ خارجيٍّ مُجهَض) — بدائلُ صامتةٌ حتى لا تظهر أخطاؤها.
const CDN_STUBS = `
  window.Chart = function(){ return { destroy(){}, update(){}, resize(){}, data:{}, options:{} }; };
  window.Chart.register = function(){}; window.Chart.defaults = { font:{} };
  window.XLSX = { utils:{ book_new:()=>({}), json_to_sheet:()=>({}), book_append_sheet(){}, aoa_to_sheet:()=>({}) }, writeFile(){}, write(){} };
  window.PptxGenJS = function(){ return { addSlide:()=>({ addText(){}, addImage(){}, addTable(){} }), writeFile(){ return Promise.resolve(); } }; };
`;

/* ═══════════════════════════ طبقةُ الإخراج (overlay) ═══════════════════════════ */
// تُحقن مرّةً واحدةً في الصفحة. كلُّ حركاتها CSS خالصة كي تُسجَّل ناعمةً بلا قفزات.
const OVERLAY = `
(function(){
  if (document.getElementById('pv-root')) return;
  var css = document.createElement('style');
  css.textContent = [
   '#pv-root{position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-family:Cairo,Tajawal,sans-serif;direction:rtl}',
   '#pv-title{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;',
   '  background:radial-gradient(120% 120% at 50% 0%,#2a5aa5 0%,#1b3a6b 45%,#0d1f3c 100%);opacity:0;transition:opacity .55s ease}',
   '#pv-title.on{opacity:1}',
   '#pv-title .pv-plate{width:186px;height:186px;border-radius:34px;background:#fff;display:flex;align-items:center;justify-content:center;',
   '  margin-bottom:30px;box-shadow:0 18px 46px rgba(0,0,0,.42);',
   '  transform:translateY(14px) scale(.94);opacity:0;transition:all .8s cubic-bezier(.2,.8,.2,1) .12s}',
   '#pv-title.on .pv-plate{transform:none;opacity:1}',
   '#pv-title .pv-logo{width:142px;height:142px;object-fit:contain}',
   '#pv-title .pv-kicker{color:#8fd6bd;font-size:20px;font-weight:700;letter-spacing:2px;margin-bottom:14px;',
   '  transform:translateY(12px);opacity:0;transition:all .7s cubic-bezier(.2,.8,.2,1) .22s}',
   '#pv-title.on .pv-kicker{transform:none;opacity:1}',
   '#pv-title h1{color:#fff;font-size:64px;font-weight:900;margin:0;text-align:center;line-height:1.25;max-width:1400px;',
   '  transform:translateY(16px);opacity:0;transition:all .7s cubic-bezier(.2,.8,.2,1) .3s}',
   '#pv-title.on h1{transform:none;opacity:1}',
   '#pv-title p{color:#cfe0f7;font-size:27px;font-weight:500;margin:22px 0 0;text-align:center;max-width:1180px;line-height:1.7;',
   '  transform:translateY(16px);opacity:0;transition:all .7s cubic-bezier(.2,.8,.2,1) .4s}',
   '#pv-title.on p{transform:none;opacity:1}',
   '#pv-title .pv-rule{width:0;height:4px;border-radius:3px;background:linear-gradient(90deg,#0a7c59,#8fd6bd);margin:30px 0 0;',
   '  transition:width .8s cubic-bezier(.2,.8,.2,1) .5s}',
   '#pv-title.on .pv-rule{width:220px}',
   // شريطٌ سفليٌّ عرضيّ: التعليقُ يجلس فوق تدرّجٍ داكنٍ بعرض الشاشة، فلا يبدو صندوقاً
   // يحجب لوحةً بعينها — بل طبقةَ إخراجٍ مقصودة كنشرات الأخبار.
   '#pv-scrim{position:absolute;left:0;right:0;bottom:0;height:290px;opacity:0;transition:opacity .5s ease;',
   '  background:linear-gradient(to top,rgba(8,18,35,.97) 0%,rgba(8,18,35,.9) 38%,rgba(8,18,35,.55) 68%,rgba(8,18,35,0) 100%)}',
   '#pv-scrim.on{opacity:1}',
   '#pv-lower{position:absolute;right:64px;bottom:78px;left:64px;text-align:right;',
   '  transform:translateY(24px);opacity:0;transition:all .55s cubic-bezier(.2,.8,.2,1)}',
   '#pv-lower.on{transform:none;opacity:1}',
   '#pv-lower i{display:inline-block;font-style:normal;background:#0a7c59;color:#fff;border-radius:8px;',
   '  padding:5px 16px;font-size:17px;font-weight:800;margin-bottom:14px;letter-spacing:.5px}',
   '#pv-lower b{display:block;color:#fff;font-size:40px;font-weight:900;line-height:1.3;text-shadow:0 2px 16px rgba(0,0,0,.5)}',
   '#pv-lower span{display:block;color:#cfe0f7;font-size:24px;font-weight:500;margin-top:10px;line-height:1.6;max-width:1500px}',
   '#pv-cursor{position:absolute;top:0;left:0;width:26px;height:26px;opacity:0;',
   '  transition:transform .62s cubic-bezier(.3,.7,.2,1),opacity .3s;will-change:transform}',
   '#pv-cursor.on{opacity:1}',
   '#pv-cursor svg{filter:drop-shadow(0 3px 7px rgba(0,0,0,.5))}',
   '#pv-ring{position:absolute;top:0;left:0;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;',
   '  border:3px solid #0a7c59;opacity:0;pointer-events:none}',
   '#pv-ring.go{animation:pvRing .62s ease-out}',
   '@keyframes pvRing{0%{opacity:.95;transform:scale(.35)}100%{opacity:0;transform:scale(3.4)}}',
   '#pv-bar{position:absolute;left:0;bottom:0;height:5px;background:linear-gradient(90deg,#0a7c59,#5bbf95);width:0;',
   '  transition:width .6s linear;box-shadow:0 0 12px rgba(10,124,89,.6)}',
   '#pv-flash{position:absolute;inset:0;background:#0b1c33;opacity:0;transition:opacity .34s ease}',
   '#pv-flash.on{opacity:1}'
  ].join('');
  document.head.appendChild(css);

  var r = document.createElement('div');
  r.id = 'pv-root';
  r.innerHTML =
    '<div id="pv-flash"></div>' +
    '<div id="pv-scrim"></div>' +
    '<div id="pv-title"><div class="pv-plate"><img class="pv-logo" src="logo.png" alt=""></div><div class="pv-kicker"></div><h1></h1><p></p><div class="pv-rule"></div></div>' +
    '<div id="pv-lower"><i></i><b></b><span></span></div>' +
    '<div id="pv-cursor"><svg width="26" height="26" viewBox="0 0 24 24"><path d="M5 2l14 9-6.2 1.4L15 20l-2.6 1-2.4-7.4L5 18z" fill="#fff" stroke="#122b4f" stroke-width="1.4" stroke-linejoin="round"/></svg></div>' +
    '<div id="pv-ring"></div>' +
    '<div id="pv-bar"></div>';
  document.body.appendChild(r);

  window.pv = {
    title: function(kicker, main, sub){
      var t = document.getElementById('pv-title');
      t.querySelector('.pv-kicker').textContent = kicker || '';
      t.querySelector('h1').textContent = main || '';
      t.querySelector('p').textContent = sub || '';
      t.classList.add('on');
    },
    titleOff: function(){ document.getElementById('pv-title').classList.remove('on'); },
    lower: function(main, sub, badge){
      var l = document.getElementById('pv-lower');
      var i = l.querySelector('i');
      i.textContent = badge || ''; i.style.display = badge ? 'inline-block' : 'none';
      l.querySelector('b').textContent = main || '';
      l.querySelector('span').textContent = sub || '';
      l.classList.add('on');
      document.getElementById('pv-scrim').classList.add('on');
    },
    lowerOff: function(){
      document.getElementById('pv-lower').classList.remove('on');
      document.getElementById('pv-scrim').classList.remove('on');
    },
    cursor: function(x, y){ var c=document.getElementById('pv-cursor'); c.classList.add('on'); c.style.transform='translate('+x+'px,'+y+'px)'; },
    cursorOff: function(){ document.getElementById('pv-cursor').classList.remove('on'); },
    ring: function(x, y){ var g=document.getElementById('pv-ring'); g.style.transform='translate('+x+'px,'+y+'px)'; g.classList.remove('go'); void g.offsetWidth; g.classList.add('go'); },
    bar: function(pct){ document.getElementById('pv-bar').style.width = Math.max(0,Math.min(100,pct))+'%'; },
    flash: function(on){ document.getElementById('pv-flash').classList.toggle('on', !!on); },
    keep: function(){ if(!document.getElementById('pv-root').isConnected) document.body.appendChild(document.getElementById('pv-root')); }
  };
})();
`;

/* ════════════════════════ البيانات التجريبية (واقعية، وهمية) ════════════════════════ */
function seedAll() {
  const P = 'hail';
  // مسارات المجموعات المرتبطة بمشروعٍ تُشتقّ من `CURRENT_PROJECT` وقتَ النداء، ونحن
  // نزرع قبل اختيار المشروع — فنُثبّته مؤقّتاً كي تُحسَب المساراتُ بدوالّ التطبيق نفسِها
  // (لا بسلاسلَ منسوخةٍ تنحرف عنها بصمت)، ثم نُعيده كما كان.
  const _prevProj = CURRENT_PROJECT;
  CURRENT_PROJECT = { id: P, name: 'مشروع صيانة مباني حائل' };
  const _p = (n) => _pfx(n);
  const PC = PURCHASES_COLLECTION(), RFQC = RFQ_COLLECTION();
  const INV = INVENTORY_COLLECTION(), LOG = INVENTORY_LOG_COLLECTION();
  const WH = WAREHOUSES_COLLECTION(), CAT = ITEM_CATALOG_COLLECTION();
  const CUS = CUSTODY_COLLECTION(), ISS = ISSUE_ORDERS_COLLECTION();
  const AST = ASSETS_COLLECTION(), PPM = PPM_COLLECTION();
  const T = _p('tickets');
  const S = window.__store;

  const D = (d, h) => new Date(Date.UTC(2026, 7, d, h || 9, 0, 0)).toISOString();
  const FUT = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

  /* ── المشاريع والإعدادات ── */
  S[PROJECTS_DOC] = { projects: [
    { id: 'hail', name: 'مشروع صيانة مباني حائل', desc: 'عقد التشغيل والصيانة — ١٤ مبنى', icon: '' },
    { id: 'qsm', name: 'مشروع القصيم', desc: 'صيانة وقائية وتشغيل — ٦ مبانٍ', icon: '' },
    { id: 'jouf', name: 'مشروع الجوف', desc: 'نظافة وتشغيل — ٩ مبانٍ', icon: '' }
  ] };

  const BLD = ['مبنى الإدارة العامة', 'مبنى السكن (أ)', 'مبنى السكن (ب)', 'مبنى الورشة الرئيسية', 'مبنى المستودعات', 'مبنى العيادة', 'مبنى الأمن'];
  const SUP = ['أسامة السادات', 'أشرف عشري', 'محمد الحربي', 'خالد الشمري'];
  const TECH = ['سيد إبراهيم', 'رمضان عبدالله', 'ماهر يوسف', 'عادل صابر', 'حسن مصطفى'];
  const WT = {
    'أعمال الكهرباء': ['انقطاع إنارة', 'قاطع يفصل', 'مقبس تالف', 'لوحة توزيع'],
    'أعمال التكييف': ['تكييف لا يبرّد', 'تسريب مياه مكيّف', 'صيانة فلاتر'],
    'أعمال السباكة': ['تسريب مياه', 'انسداد صرف', 'صنبور تالف'],
    'أعمال النجارة': ['باب لا يغلق', 'كسر أثاث', 'مفصلات'],
    'أعمال المصاعد': ['مصعد متوقف', 'صيانة دورية']
  };
  S[_meta('settings')] = {
    buildings: BLD, supervisors: SUP, technicians: TECH, workTypes: WT,
    companyName: 'شركة المباني السريعة', projectName: 'مشروع صيانة مباني حائل'
  };
  S[_meta('users')] = { users: [
    { user: 'admin', name: 'م. إسلام عكاشة', role: 'admin' },
    { user: 'pm', name: 'م. أسامة السادات', role: 'pm' },
    { user: 'wh', name: 'أمين المستودع', role: 'warehouse' }
  ] };

  /* ── البلاغات ── */
  const PR = ['حرج 🔴 (2 ساعة)', 'عاجل 🟡 (8 ساعات)', 'عادي 🟢 (48 ساعة)', 'روتيني 🔵 (صيانة دورية)'];
  const tk = [
    ['TK-2041', 'مفتوح', 0, 'أعمال الكهرباء', 'انقطاع إنارة', 'انقطاع تيار كامل عن الدور الثاني — لوحة التوزيع تفصل تلقائياً', 0, 1, 2],
    ['TK-2040', 'قيد التنفيذ', 1, 'أعمال التكييف', 'تكييف لا يبرّد', 'وحدة التكييف المركزي بقاعة الاجتماعات لا تبرّد منذ الصباح', 1, 0, 3],
    ['TK-2039', 'مفتوح', 1, 'أعمال السباكة', 'تسريب مياه', 'تسريب مياه أسفل مغسلة الدور الأرضي — تجمّع مياه مستمر', 3, 2, 4],
    ['TK-2038', 'قيد التنفيذ', 2, 'أعمال النجارة', 'باب لا يغلق', 'باب مدخل السكن لا يُغلق بإحكام — المفصلة العلوية مخلوعة', 2, 1, 5],
    ['TK-2037', 'مفتوح', 0, 'أعمال المصاعد', 'مصعد متوقف', 'المصعد الرئيسي متوقف بين الدورين الثاني والثالث', 0, 3, 6],
    ['TK-2036', 'معاد فتحه', 2, 'أعمال الكهرباء', 'مقبس تالف', 'مقبس غرفة الخادم لا يعمل — تكرّر العطل بعد الإصلاح', 4, 0, 7],
    ['TK-2035', 'مغلق', 2, 'أعمال التكييف', 'صيانة فلاتر', 'تنظيف واستبدال فلاتر وحدات الدور الأول', 1, 2, 3],
    ['TK-2034', 'مغلق', 1, 'أعمال السباكة', 'انسداد صرف', 'انسداد في صرف المطبخ — تمّت المعالجة بالضغط', 2, 1, 4],
    ['TK-2033', 'مغلق', 3, 'أعمال الكهرباء', 'لوحة توزيع', 'ربط دوري وفحص حرارة لوحات التوزيع', 5, 3, 5],
    ['TK-2032', 'مغلق', 2, 'أعمال النجارة', 'كسر أثاث', 'إصلاح مكتب مكسور بغرفة المشرفين', 3, 0, 6],
    ['TK-2031', 'مغلق', 1, 'أعمال التكييف', 'تسريب مياه مكيّف', 'تسريب من وحدة السبليت بغرفة الأمن', 6, 2, 2],
    ['TK-2030', 'مغلق', 2, 'أعمال السباكة', 'صنبور تالف', 'استبدال صنبور دورة المياه بالدور الأرضي', 4, 1, 3]
  ];
  tk.forEach((t, i) => {
    const closed = t[1] === 'مغلق';
    S[T + '/' + t[0]] = {
      id: t[0], status: t[1], priority: PR[t[2]], workType: t[3], workItem: t[4], desc: t[5],
      building: BLD[t[6]], supervisor: SUP[t[7] % SUP.length], tech: TECH[t[8] % TECH.length],
      projectId: P, createdAt: D(2 + i, 8 + (i % 9)), maintType: t[2] === 3 ? 'وقائية' : 'طارئة',
      closedAt: closed ? D(3 + i, 15) : undefined,
      closeNote: closed ? 'تمّت المعالجة والاستلام من المشرف' : undefined
    };
  });

  /* ── المشتريات ── */
  const mkPO = (id, status, vendor, items, extra) => {
    const sub = items.reduce((s, x) => s + x.qty * x.unitCost, 0);
    const vat = Math.round(sub * 0.15);
    const rcvd = ['delivered', 'closed', 'closed_after_receipt'].indexOf(status) !== -1;
    const day = 1 + (Number(id.slice(-3)) % 20);
    return Object.assign({
      id, status, vendor, projectId: P, building: BLD[1], supervisor: SUP[0],
      createdAt: D(day, 10), requestedBy: 'م. أسامة السادات',
      itemName: items[0].itemName, qty: items[0].qty, unit: items[0].unit,
      estCost: sub + vat, actualCost: sub + vat, vat,
      // الطلبُ المستلَم تُملأ فيه الكمياتُ المستلمة بنداً بنداً — فالشاشةُ تشتقّ
      // «المستلَم من المطلوب» من البنود لا من رقمٍ مخزَّنٍ منفصلٍ قد ينحرف عنها.
      items: items.map(x => Object.assign({}, x, {
        itemCost: x.qty * x.unitCost, vat: Math.round(x.qty * x.unitCost * 0.15),
        rcvQty: rcvd ? x.qty : 0
      })),
      receivedQty: rcvd ? items.reduce((s, x) => s + x.qty, 0) : undefined,
      receiverName: rcvd ? 'أمين المستودع' : undefined,
      receiptDate: rcvd ? D(day + 2, 12) : undefined
    }, extra || {});
  };
  const IT = (n, q, u, c, extra) => Object.assign({ itemName: n, qty: q, unit: u, unitCost: c }, extra || {});
  const POS = [
    mkPO('PO-1042', 'pending_pm', 'مؤسسة النور للتجارة', [IT('كابل نحاس ٢.٥ مم', 300, 'متر', 9), IT('قاطع كهربائي ٣٢ أمبير', 12, 'قطعة', 85)]),
    mkPO('PO-1041', 'wh_reviewed', 'شركة الأساس للمواد', [IT('لمبة LED ١٨ واط', 200, 'قطعة', 14), IT('كشّاف خارجي ١٠٠ واط', 18, 'قطعة', 145)]),
    mkPO('PO-1040', 'pm_approved', 'مؤسسة الخليج للتكييف', [IT('فلتر تكييف مقاس ٢٤', 60, 'قطعة', 38), IT('غاز تبريد R410', 8, 'أسطوانة', 420)]),
    mkPO('PO-1039', 'delivered', 'مؤسسة النور للتجارة', [IT('مواسير PPR ١ بوصة', 120, 'متر', 17)], { grnRef: 'GRN-0311' }),
    mkPO('PO-1038', 'closed', 'شركة البناء الحديث', [IT('دهان أساس أبيض', 40, 'جالون', 78), IT('فرش دهان', 25, 'قطعة', 12)],
      { auditedBy: 'أمين المستودع', auditedAt: D(9, 13), grnRef: 'GRN-0308', invoice: 'INV-77120', inContract: true, inBoq: true }),
    mkPO('PO-1037', 'closed', 'مؤسسة الخليج للتكييف', [IT('مضخة مياه ١ حصان', 4, 'قطعة', 980)],
      { auditedBy: 'أمين المستودع', auditedAt: D(8, 12), grnRef: 'GRN-0305', invoice: 'INV-77088' }),
    mkPO('PO-1036', 'closed', 'شركة الأساس للمواد', [IT('صنبور خلاط', 30, 'قطعة', 65)],
      { auditedBy: 'أمين المستودع', auditedAt: D(7, 11), grnRef: 'GRN-0301', invoice: 'INV-77042' }),
    mkPO('PO-1035', 'rejected', 'مورّد غير معتمد', [IT('عدّة يدوية', 10, 'طقم', 310)], { rejectReason: 'المورّد خارج القائمة المعتمدة' })
  ];
  POS.forEach(po => { S[PC + '/' + po.id] = po; });
  S[PO_META_DOC()] = { counter: 1042 };

  /* ── طلبات التسعير ── */
  const QI = (n, q, u) => ({ itemName: n, qty: q, unit: u });
  [
    { id: 'RFQ-318', status: 'rfq_pending_pm', category: 'أعمال الكهرباء', createdAt: D(6, 9),
      desc: 'توريد كابلات وقواطع كهربائية للمرحلة الثانية',
      items: [QI('كابل نحاس ٤ مم', 500, 'متر'), QI('قاطع كهربائي ٦٣ أمبير', 8, 'قطعة'), QI('لوحة توزيع فرعية', 3, 'قطعة')] },
    { id: 'RFQ-317', status: 'rfq_collecting', category: 'أعمال التكييف', createdAt: D(4, 11),
      desc: 'قطع غيار وحدات التكييف المركزي — عقد الصيانة السنوي',
      items: [QI('كمبروسر ٥ طن', 2, 'قطعة'), QI('غاز تبريد R410', 12, 'أسطوانة')],
      quotes: [{ supplier: 'مؤسسة الخليج للتكييف', price: 18400, notes: 'توريد خلال ٥ أيام' },
               { supplier: 'شركة التبريد المتقدم', price: 19750, notes: 'ضمان سنة' },
               { supplier: 'مؤسسة الرياض للتجارة', price: 21300, notes: '' }] },
    { id: 'RFQ-316', status: 'rfq_selecting', category: 'أعمال السباكة', createdAt: D(3, 10),
      desc: 'مواد سباكة — مواسير ووصلات PPR',
      items: [QI('مواسير PPR ١ بوصة', 400, 'متر'), QI('وصلات وأكواع', 250, 'قطعة')],
      quotes: [{ supplier: 'مؤسسة النور للتجارة', price: 9120, notes: 'الأقل سعراً' },
               { supplier: 'شركة الأساس للمواد', price: 9840, notes: '' }] },
    { id: 'RFQ-315', status: 'closed', category: 'أعمال عامة', createdAt: D(1, 9),
      desc: 'مواد دهانات وعزل للمباني السكنية',
      items: [QI('دهان أساس أبيض', 60, 'جالون')], awardedTo: 'شركة البناء الحديث' }
  ].forEach(r => { S[RFQC + '/' + r.id] = Object.assign({ projectId: P, requestedBy: 'م. أسامة السادات', building: BLD[1] }, r); });
  S[RFQ_META_DOC()] = { counter: 318 };

  /* ── المستودع والمخزون ── */
  S[WH + '/wh-main'] = { id: 'wh-main', name: 'المستودع الرئيسي — حائل', keeper: 'أمين المستودع' };
  S[WH + '/wh-sub'] = { id: 'wh-sub', name: 'مستودع الورشة الفرعي', keeper: 'سيد إبراهيم' };
  const items = [
    ['itm-cable', 'كابل نحاس ٢.٥ مم', 'متر', 420, 9, 150],
    ['itm-lamp', 'لمبة LED ١٨ واط', 'قطعة', 260, 14, 80],
    ['itm-brk', 'قاطع كهربائي ٣٢ أمبير', 'قطعة', 34, 85, 20],
    ['itm-filt', 'فلتر تكييف مقاس ٢٤', 'قطعة', 96, 38, 40],
    ['itm-gas', 'غاز تبريد R410', 'أسطوانة', 6, 420, 8],
    ['itm-ppr', 'مواسير PPR ١ بوصة', 'متر', 310, 17, 100],
    ['itm-tap', 'صنبور خلاط', 'قطعة', 41, 65, 25],
    ['itm-paint', 'دهان أساس أبيض', 'جالون', 22, 78, 15],
    ['itm-pump', 'مضخة مياه ١ حصان', 'قطعة', 3, 980, 4],
    ['itm-flood', 'كشّاف خارجي ١٠٠ واط', 'قطعة', 11, 145, 10],
    ['itm-hinge', 'مفصلة باب ثقيلة', 'قطعة', 74, 22, 30],
    ['itm-tape', 'شريط عازل', 'لفة', 130, 6, 50]
  ];
  items.forEach(x => {
    S[INV + '/' + x[0]] = {
      itemId: x[0], itemName: x[1], unit: x[2], currentQty: x[3], avgCost: x[4],
      minQty: x[5], reorderPoint: x[5], warehouseId: 'wh-main', warehouseName: 'المستودع الرئيسي — حائل'
    };
    S[CAT + '/' + x[0]] = { itemId: x[0], itemCode: x[0].toUpperCase().replace('ITM-', 'HL-'), itemName: x[1], unit: x[2], lastCost: x[4], category: 'مواد صيانة' };
  });
  const lg = [
    ['lg-1', 'in', 'itm-cable', 300, 'استلام PO-1042'], ['lg-2', 'out', 'itm-lamp', 40, 'صرف لبلاغ TK-2041'],
    ['lg-3', 'in', 'itm-filt', 60, 'استلام PO-1040'], ['lg-4', 'out', 'itm-ppr', 35, 'صرف لبلاغ TK-2039'],
    ['lg-5', 'in', 'itm-tap', 30, 'استلام PO-1036'], ['lg-6', 'out', 'itm-brk', 6, 'صرف عهدة CU-119'],
    ['lg-7', 'adjust', 'itm-tape', -4, 'تسوية جرد'], ['lg-8', 'out', 'itm-paint', 8, 'صرف لبلاغ TK-2032']
  ];
  lg.forEach((l, i) => {
    const it = items.find(x => x[0] === l[2]);
    S[LOG + '/' + l[0]] = { id: l[0], type: l[1], itemId: l[2], itemName: it[1], unit: it[2], qty: Math.abs(l[3]), note: l[4], date: D(3 + i, 9 + i), by: 'أمين المستودع' };
  });

  /* ── العهد ── */
  // [رقم, الموظف, الرقم الوظيفي, القسم, الصنف, الكود, النوع, المصدر, الكمية, الوحدة, المُرتجع, الحالة, القيمة]
  [
    ['CU-1121', 'سيد إبراهيم', 'EMP-2041', 'الصيانة الكهربائية', 'عدّة يدوية كهربائية', 'HL-TOOL-01', 'permanent', 'warehouse', 1, 'طقم', 0, 'active', 1250],
    ['CU-1120', 'رمضان عبدالله', 'EMP-2088', 'أعمال السباكة', 'مفتاح مواسير ١٨ بوصة', 'HL-TOOL-07', 'permanent', 'procurement', 2, 'قطعة', 0, 'active', 340],
    ['CU-1119', 'ماهر يوسف', 'EMP-2013', 'أعمال التكييف', 'جهاز قياس الضغط', 'HL-TOOL-12', 'permanent', 'warehouse', 1, 'جهاز', 0, 'active', 890],
    ['CU-1118', 'عادل صابر', 'EMP-2107', 'الصيانة العامة', 'سلّم ألمنيوم ٦ متر', 'HL-TOOL-19', 'permanent', 'warehouse', 1, 'قطعة', 1, 'returned', 720],
    ['CU-1117', 'حسن مصطفى', 'EMP-2055', 'أعمال الكهرباء', 'شريط عازل', 'HL-TAPE', 'consumable', 'warehouse', 20, 'لفة', 0, 'active', 120],
    ['CU-1116', 'سيد إبراهيم', 'EMP-2041', 'الصيانة الكهربائية', 'قفازات عزل كهربائي', 'HL-PPE-03', 'consumable', 'procurement', 6, 'زوج', 0, 'active', 210],
    ['CU-1115', 'ماهر يوسف', 'EMP-2013', 'أعمال التكييف', 'مثقاب كهربائي', 'HL-TOOL-22', 'permanent', 'warehouse', 1, 'جهاز', 0, 'partial', 640]
  ].forEach((c, i) => {
    S[CUS + '/' + c[0]] = {
      id: c[0], employeeName: c[1], jobNumber: c[2], department: c[3], itemName: c[4], itemCode: c[5],
      custodyType: c[6], source: c[7], qty: c[8], unit: c[9], returnedQty: c[10], status: c[11],
      estValue: c[12], projectId: P, issueDate: D(2 + i, 10).slice(0, 10), createdAt: D(2 + i, 10),
      issuedBy: 'أمين المستودع'
    };
  });
  S[CUSTODY_META_DOC()] = { counter: 1121 };

  /* ── أوامر الصرف ── */
  [['ISS-455', 'pending', 'سيد إبراهيم'], ['ISS-454', 'approved', 'رمضان عبدالله'], ['ISS-453', 'approved', 'ماهر يوسف']].forEach((o, i) => {
    S[ISS + '/' + o[0]] = {
      id: o[0], orderRef: o[0], status: o[1], recipient: o[2], projectId: P,
      requestedBy: SUP[i % SUP.length], building: BLD[i], relatedTicket: 'TK-204' + i,
      createdAt: D(5 + i, 11), issuedBy: 'أمين المستودع',
      items: [
        { itemId: items[i][0], itemName: items[i][1], qty: 10 + i, unit: items[i][2], warehouseName: 'المستودع الرئيسي — حائل' },
        { itemId: items[i + 3][0], itemName: items[i + 3][1], qty: 4, unit: items[i + 3][2], warehouseName: 'المستودع الرئيسي — حائل' }
      ]
    };
  });
  S[ISSUE_META_DOC()] = { counter: 455 };

  /* ── الأصول ── */
  const AS = [
    ['AST-0101', 'مكيّف مركزي — قاعة الاجتماعات', 'مكيف', 0, 'الدور الثاني', 'يعمل بشكل جيد', 'Carrier 30RB', 'CR-88192'],
    ['AST-0102', 'مصعد ركّاب رئيسي', 'مصعد', 0, 'الدور الأرضي', 'يحتاج متابعة', 'Schindler 3300', 'SC-40021'],
    ['AST-0103', 'مولّد كهربائي احتياطي ٢٥٠ ك.ف.أ', 'مولد كهربائي', 3, 'ساحة الورشة', 'يعمل بشكل جيد', 'FG Wilson P250', 'FG-77310'],
    ['AST-0104', 'مضخة مياه رئيسية', 'مضخة', 4, 'غرفة المضخات', 'حرج', 'Grundfos CR15', 'GR-55120'],
    ['AST-0105', 'لوحة توزيع رئيسية DB-01', 'لوحة كهربائية', 0, 'غرفة الكهرباء', 'يعمل بشكل جيد', 'Schneider Prisma', 'SN-31004'],
    ['AST-0106', 'نظام إطفاء الحريق — الدور الأول', 'نظام إطفاء', 1, 'الدور الأول', 'يحتاج متابعة', 'Naffco FM200', 'NF-20088'],
    ['AST-0107', 'خزّان مياه علوي ٥٠ م٣', 'خزان مياه', 2, 'السطح', 'يعمل بشكل جيد', 'GRP-50', 'GRP-9021'],
    ['AST-0108', 'كاميرا مراقبة — المدخل الرئيسي', 'كاميرا مراقبة', 6, 'المدخل', 'خارج الخدمة', 'Hikvision DS-2CD', 'HK-11450']
  ];
  AS.forEach((a, i) => {
    S[AST + '/' + a[0]] = {
      id: a[0], name: a[1], type: a[2], building: BLD[a[3]], floor: a[4] , location: a[4], subLocation: a[4],
      status: a[5], model: a[6], serialNo: a[7], projectId: P,
      purchaseDate: '2024-0' + (1 + (i % 8)) + '-15', warrantyDate: i === 7 ? '2025-06-01' : '2027-06-01',
      lastMaintDate: D(1 + i, 9).slice(0, 10)
    };
  });
  S[AST_META_DOC()] = { counter: 108 };

  /* ── خطط الصيانة الوقائية ── */
  const PL = [
    ['PPM-071', 'صيانة دورية لوحدات التكييف المركزي', 'أعمال التكييف', 'شهري', 'AST-0101', 0, -3],
    ['PPM-070', 'فحص وتشحيم المصعد الرئيسي', 'أعمال المصاعد', 'شهري', 'AST-0102', 0, 0],
    ['PPM-069', 'تشغيل تجريبي للمولّد وفحص الزيت', 'أعمال الكهرباء', 'أسبوعي', 'AST-0103', 3, 2],
    ['PPM-068', 'فحص مضخات المياه وقياس الضغط', 'أعمال السباكة', 'أسبوعي', 'AST-0104', 4, 5],
    ['PPM-067', 'ربط وفحص حراري للوحات التوزيع', 'أعمال الكهرباء', 'ربع سنوي', 'AST-0105', 0, 12],
    ['PPM-066', 'اختبار نظام الإطفاء والإنذار', 'أعمال الكهرباء', 'نصف سنوي', 'AST-0106', 1, 24],
    ['PPM-065', 'تنظيف وتعقيم خزّانات المياه', 'أعمال السباكة', 'نصف سنوي', 'AST-0107', 2, 40]
  ];
  PL.forEach(p => {
    S[PPM + '/' + p[0]] = {
      id: p[0], name: p[1], desc: p[1], workType: p[2], freq: p[3], assetId: p[4],
      building: BLD[p[5]], projectId: P, nextDueDate: FUT(p[6]), status: 'نشطة',
      assignedTo: TECH[Math.abs(p[6]) % TECH.length], disabled: false
    };
  });
  S[PPM_META_DOC()] = { counter: 71 };

  CURRENT_PROJECT = _prevProj;
  return Object.keys(S).length;
}

/* ═══════════════════════════════ سيناريو الجولة ═══════════════════════════════ */
// كل فصلٍ: بطاقةُ عنوان ← انتقالٌ بالنقر ← تعليقٌ سفليّ ← تصفّحٌ هادئ.
const CHAPTERS = [
  { n: '١', page: 'dashboard', kicker: 'لوحة القيادة', title: 'صورةٌ واحدةٌ لحالة المشروع',
    sub: 'مؤشّراتُ البلاغات والمشتريات والمخزون في شاشةٍ واحدة — بلا تجميعٍ يدويّ',
    lower: ['لوحة المعلومات', 'كلُّ رقمٍ محسوبٌ لحظياً من مصدره — لا جداول Excel موازية'] },

  { n: '٢', page: 'daily', kicker: 'التشغيل اليوميّ', title: 'البلاغاتُ من الفتح إلى الإغلاق',
    sub: 'أولوياتٌ بزمنِ استجابةٍ ملزم، وإسنادٌ للفنيّين، وتتبّعٌ حتى الإغلاق والاستلام',
    lower: ['الحركة اليومية', 'البلاغاتُ المتأخّرةُ عن زمن الاستجابة تُرفَع تلقائياً إلى أعلى الشاشة'] },

  { n: '٣', page: 'tickets', kicker: 'سجلّ البلاغات', title: 'بحثٌ وتصفيةٌ في كلّ بلاغ',
    sub: 'بالمبنى ونوع العمل والمشرف والحالة — والأرشيف الشهريّ محفوظٌ بلا حذف',
    lower: ['سجلّ البلاغات', 'تصفيةٌ فوريةٌ بالمبنى ونوع العمل والمشرف — والمغلقُ يُرحَّل للأرشيف'] },

  { n: '٤', page: 'new', kicker: 'تسجيل بلاغ', title: 'بلاغٌ كاملٌ في أقلّ من دقيقة',
    sub: 'مبنى ودورٌ ونوعُ عملٍ وأولويةٌ ومرفقاتٌ مصوّرة — بحقولٍ مضبوطةٍ لا نصٍّ حرّ',
    lower: ['تسجيل بلاغ جديد', 'قوائمُ مضبوطةٌ من إعدادات المشروع — تمنع الأخطاء الإملائية في التقارير'] },

  { n: '٥', page: 'purchases', kicker: 'دورة الشراء', title: 'طلبُ الشراء بمراحلَ لا تُتخطّى',
    sub: 'من الطلب إلى اعتماد مدير المشروع فمراجعة المستودع فالاستلام فالإغلاق',
    lower: ['المشتريات', 'كلُّ مرحلةٍ باعتمادٍ موثَّقٍ باسم صاحبه ووقته — لا اعتمادَ شفهيّ'] },

  { n: '٦', page: 'new-purchase', kicker: 'طلبٌ جديد', title: 'أصنافٌ من الكتالوج بأسعارها',
    sub: 'ضريبةُ القيمة المضافة والإجمالي يُحسبان آلياً — والصنفُ مربوطٌ برصيد المخزون',
    lower: ['طلب شراء جديد', 'الأصنافُ من كتالوجٍ موحَّد — فتتطابق أسماؤها عبر كلّ التقارير'] },

  { n: '٧', page: 'rfq', kicker: 'التسعير', title: 'ثلاثةُ عروضٍ قبل كلّ ترسية',
    sub: 'مقارنةُ عروض المورّدين صنفاً بصنف، والترسيةُ موثّقةٌ بسببها',
    lower: ['طلبات التسعير', 'مقارنةٌ صنفاً بصنف بين المورّدين — والفارقُ ظاهرٌ قبل الترسية'] },

  { n: '٨', page: 'inventory', kicker: 'المخزون', title: 'رصيدٌ حيٌّ لا جردٌ متأخّر',
    sub: 'كلُّ استلامٍ وصرفٍ يُحدّث الرصيد لحظياً، وحدُّ إعادة الطلب ينبّه قبل النفاد',
    lower: ['المخزون', 'الرصيدُ يتحرّك مع الاستلام والصرف — والأصنافُ دون الحدّ الأدنى مُعلَّمة'] },

  { n: '٩', page: 'inventory-log', kicker: 'أثرُ الحركة', title: 'كلُّ حركةٍ لها أثرٌ لا يُمحى',
    sub: 'استلامٌ وصرفٌ وتسويةٌ ونقل — باسم المنفِّذ ووقته ومرجعِ الطلب أو البلاغ',
    lower: ['سجلّ حركة المخزون', 'أثرٌ كاملٌ لكلّ حركة — يُغلق باب الفرق غير المُفسَّر في الجرد'] },

  { n: '١٠', page: 'custody', kicker: 'العهد', title: 'ما بيد كلِّ فنّيٍّ موثَّقٌ باسمه',
    sub: 'صرفُ العهدة وتوقيعُها واستردادُها — فلا عهدةَ معلّقةٌ بلا صاحب',
    lower: ['كشف العهد', 'العهدةُ باسم حاملها وتوقيعه — والمستردُّ يعود لرصيد المستودع'] },

  { n: '١١', page: 'assets', kicker: 'الأصول', title: 'سجلُّ أصولٍ بحالتها لا بعددها',
    sub: 'كلُّ أصلٍ بموقعه وطرازه ورقمه التسلسليّ وضمانه وحالته التشغيلية',
    lower: ['سجلّ الأصول', 'الأصلُ مربوطٌ ببلاغاته وخطط صيانته — فتاريخُه كاملٌ في مكانٍ واحد'] },

  { n: '١٢', page: 'ppm', kicker: 'الصيانة الوقائية', title: 'صيانةٌ تسبق العطل',
    sub: 'خططٌ دوريةٌ بمواعيدَ محسوبة، والمتأخّرةُ منها تُعلَّم بوضوحٍ لا يُتجاهَل',
    lower: ['الصيانة الوقائية (PPM)', 'الخططُ المتأخّرةُ تُرفَع أعلى القائمة بلافتةٍ حمراء'] },

  { n: '١٣', page: 'kpi', kicker: 'المؤشّرات', title: 'أداءٌ يُقاس لا يُوصَف',
    sub: 'زمنُ الاستجابة والإنجاز والالتزامُ بالأولويات — بأرقامٍ من البيانات نفسها',
    lower: ['مؤشّرات الأداء', 'المؤشّرُ محسوبٌ من البلاغات ذاتها — لا إدخالَ يدويَّ يقبل التجميل'] },

  { n: '١٤', page: 'reports', kicker: 'التقارير', title: 'تقريرٌ جاهزٌ للعميل بضغطة',
    sub: 'تقاريرُ شهريةٌ ومصوَّرةٌ وتصديرٌ إلى Excel وPowerPoint — من البيانات الحيّة',
    lower: ['التقارير', 'تصديرٌ إلى Excel وPowerPoint من البيانات الحيّة — بلا إعادة كتابة'],
    act: '#page-reports [onclick*="generateReport()"]' },

  { n: '١٥', page: 'tv', kicker: 'شاشة العرض', title: 'الحالةُ معروضةٌ في موقع العمل',
    sub: 'شاشةُ عرضٍ دائمةٌ في غرفة التشغيل تُحدَّث لحظياً — البلاغُ يظهر فور تسجيله',
    lower: ['لوحة العرض TV', 'شاشةٌ تعمل بلا تدخّل — تُحدَّث مع كلّ بلاغٍ يُسجَّل أو يُغلق'] }
];

/* ═════════════════════════════════ التشغيل ═════════════════════════════════ */
const t0 = Date.now();
const L = (...a) => console.log(...a);
const el = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5) + 's';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--force-device-scale-factor=1'] });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'ar-SA' });
const page = await context.newPage();
let TRIM_AT = 0;                       // لحظةُ بدء المشهد المفيد (قصُّ رأسِ الإقلاع)

/* ── الالتقاط: لقطاتٌ من CDP لا تسجيلُ Playwright ──
   `recordVideo` يخرج VP8 عند ~٩٥٥ ك.ب/ث لـ1080p — وهو سقفٌ لا يُرفَع من الواجهة،
   يظهر تكسيرُه في التدرّجات والتمرير مهما جوّدنا الترميز بعده، لأن التلفَ في المصدر.
   بدلَه: `Page.startScreencast` يسلّم إطاراتٍ JPEG بجودةٍ نطلبها نحن، ونركّبها
   بمدّةِ كلِّ إطارٍ من طابعه الزمنيّ — فالمصدرُ نظيفٌ والترميزُ وحدَه يحكم الجودة. */
const FRAMES = path.join(OUT, 'frames');
const shots = [];                      // { file, ts, wall }
let cdp = null;
if (!PROBE) {
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });
  cdp = await context.newCDPSession(page);
  cdp.on('Page.screencastFrame', (f) => {
    try {
      const file = path.join(FRAMES, String(shots.length).padStart(6, '0') + '.jpg');
      fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
      shots.push({ file, ts: f.metadata.timestamp, wall: Date.now() });
    } catch (e) { }
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => { });
  });
  await cdp.send('Page.startScreencast', {
    format: 'jpeg', quality: Number(process.env.PROMO_JPEG_Q || 96),
    maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1
  });
}
await page.addInitScript(MOCK_FIREBASE);
await page.addInitScript(CDN_STUBS);

let AUTH_OK = false;
const errors = [];
const IGNORE = /ServiceWorkerRegistration|net::ERR_FAILED|Failed to load resource|ERR_BLOCKED|reCAPTCHA|AppCheck|purchase-kpi/i;
page.on('pageerror', e => { const m = String(e.message).slice(0, 160); if (!IGNORE.test(m)) errors.push(m); });

await page.route('**/*', route => {
  const u = route.request().url();
  if (u.includes('workers.dev/login')) {
    return AUTH_OK
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'tkn', profile: { user: 'admin', name: 'م. إسلام عكاشة', role: 'admin' } }) })
      : route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
  }
  if (/^https?:/.test(u)) return route.abort();
  return route.continue();
});

/* ── أدواتُ الإخراج ── */
const wait = (ms) => page.waitForTimeout(Math.max(30, Math.round(ms / SPEED)));
const pv = (fn, ...args) => page.evaluate(([f, a]) => { window.pv && window.pv.keep(); return window.pv && window.pv[f] && window.pv[f].apply(null, a); }, [fn, args]).catch(() => { });
let shotN = 0;
const shot = (name) => page.screenshot({ path: `${SHOTS}/${String(++shotN).padStart(2, '0')}-${name}.png` }).catch(() => { });

async function overlay() { await page.evaluate(OVERLAY).catch(() => { }); }

// بطاقةُ فصل: تُعرَض فوق الشاشة الحالية ثم تنقشع.
async function titleCard(kicker, main, sub, ms, opt) {
  const o = opt || {};
  await pv('lowerOff'); await pv('cursorOff');
  await pv('title', kicker, main, sub);
  const hold = ms || 3600;
  await wait(hold * 0.45);
  if (o.shot) await shot(o.shot);            // اللقطةُ في ذروة العرض لا أثناء الانقشاع
  await wait(hold * 0.55);
  if (o.keep) return;                        // البطاقةُ الأخيرة تبقى حتى نهاية الفيديو
  await pv('titleOff'); await wait(700);
}

// تحريكُ المؤشّر إلى عنصرٍ ثم النقرُ عليه فعلياً.
async function clickEl(selector, opts) {
  const o = opts || {};
  const box = await page.evaluate(sel => {
    const e = document.querySelector(sel);
    if (!e) return null;
    e.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, ok: r.width > 0 && r.height > 0 };
  }, selector).catch(() => null);
  if (!box || !box.ok) return false;
  await pv('cursor', Math.round(box.x), Math.round(box.y));
  await wait(o.settle || 520);
  await pv('ring', Math.round(box.x), Math.round(box.y));
  await wait(180);
  try { await page.click(selector, { timeout: 3000 }); } catch { return false; }
  return true;
}

// تصفّحٌ هادئ داخل الصفحة (تمريرٌ ناعمٌ لأسفل ثم عودة).
async function browseDown(px, ms) {
  await page.evaluate(y => {
    const c = document.querySelector('.main-content') || document.scrollingElement || document.documentElement;
    c.style.scrollBehavior = 'smooth';
    c.scrollTop = y;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }, px).catch(() => { });
  await wait(ms || 2200);
}
async function scrollTop() {
  await page.evaluate(() => {
    const c = document.querySelector('.main-content') || document.scrollingElement || document.documentElement;
    c.scrollTop = 0; window.scrollTo({ top: 0, behavior: 'smooth' });
  }).catch(() => { });
  await wait(500);
}

// انتقالٌ إلى صفحةٍ بالنقر على زرّها في القائمة الجانبية، وإلا برمجياً.
async function goPage(id) {
  // زرُّ القائمة الجانبية أولاً: نفس الزرِّ الذي ينقره المستخدم. الانتقاءُ العامّ
  // يلتقط روابطَ «عرض الكل ←» داخل البطاقات، فيبدو النقرُ في مكانٍ لا معنى له.
  // ومجموعاتُ القائمة تُطوى بـ«max-height:0»: الزرُّ يبقى بمقاسٍ غيرِ صفريٍّ لكنّه
  // مقصوصٌ فلا يستقبل النقر — فنفتح مجموعتَه أولاً بنقرِ ترويستها، كما يفعل المستخدم.
  // المجموعاتُ متداخلة، فنفتحها من الخارج إلى الداخل — وإلا بقي الزرُّ داخل حاويةٍ
  // مطويّةٍ بمقاسٍ صفريّ لا تستقبل النقر.
  const target = await page.evaluate(pid => {
    const q = '[onclick*="showPage(\'' + pid + '\')"]';
    const btn = document.querySelector('.sidebar-nav-btn' + q) || document.querySelector('.sidebar ' + q) || document.querySelector(q);
    if (!btn) return null;
    const groups = [];
    for (let e = btn.closest('.sidebar-group'); e; e = e.parentElement && e.parentElement.closest('.sidebar-group')) {
      if (e.id) groups.unshift({ id: e.id, collapsed: e.classList.contains('collapsed') });
    }
    return { sel: (btn.className || '').includes('sidebar-nav-btn') ? '.sidebar-nav-btn' + q : q, groups };
  }, id).catch(() => null);

  for (const g of (target && target.groups) || []) {
    if (!g.collapsed) continue;
    await clickEl('#hdr-' + g.id, { settle: 340 });
    await wait(400);
  }
  // الفتحُ يضبط `max-height` بارتفاعِ المجموعة لحظتَها؛ فإن نمت بعدها (شارةُ عددٍ مثلاً)
  // قُصَّ آخرُ عنصرٍ فلم يعُد قابلاً للنقر. نرفع القصَّ بعد الفتح.
  await page.evaluate(gs => (gs || []).forEach(g => {
    const e = document.getElementById(g.id); if (e && !e.classList.contains('collapsed')) e.style.maxHeight = 'none';
  }), (target && target.groups) || []).catch(() => { });
  await page.evaluate(s => { const e = s && document.querySelector(s); if (e) e.scrollIntoView({ block: 'center' }); }, target ? target.sel : '').catch(() => { });
  const clicked = target ? await clickEl(target.sel, { settle: 380 }) : false;
  // بعضُ الأقسام يُخفي النظامُ أزرارَها عمداً في هذا الوضع (مثل «العهد»)، فنفتحها
  // برمجياً — ونُخفي المؤشّرَ حتى لا يبقى واقفاً في مكانٍ لم يُنقَر فيه شيء.
  if (!clicked) { await pv('cursorOff'); await page.evaluate(pid => showPage(pid), id).catch(() => { }); }
  await wait(850);
  await overlay();
  return clicked;
}

const TOTAL_STEPS = CHAPTERS.length + 4;
let step = 0;
const progress = async () => { step++; await pv('bar', (step / TOTAL_STEPS) * 100); };

L('\n══════════════════════════════════════════════════════');
L(PROBE ? '  وضعُ المعاينة — لقطاتٌ بلا تسجيل' : '  تسجيلُ الفيديو التعريفيّ 1920×1080');
L('══════════════════════════════════════════════════════');

/* ───────── الإقلاع ───────── */
await page.goto('file://' + REPO + '/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);
await overlay();

const APPV = await page.evaluate(() => (typeof APP_VERSION === 'string' ? APP_VERSION : '')).catch(() => '');
L(`  ${el()}  التطبيق أقلع — الإصدار ${APPV || '؟'}`);

/* ───────── ١) الافتتاحية ───────── */
// بلا بطاقةٍ: نبدأ على شاشة الدخول مباشرةً كي يذوب مشهدُ Remotion الفاتحُ في مثله.
if (!NO_BOOKENDS) await pv('flash', true);
TRIM_AT = Date.now() - 400;                  // كلُّ ما قبله إقلاعٌ لا مشهد
if (NO_BOOKENDS) await wait(700);
else await titleCard('شركة المباني السريعة', 'نظام إدارة المرافق والمشتريات',
  'منصّةٌ واحدةٌ تُدير البلاغات والمشتريات والمخزون والأصول والصيانة الوقائية — بأثرٍ كاملٍ لكلّ حركة', 5200, { shot: 'intro' });
await pv('flash', false); await wait(500);
await progress();

/* ───────── ٢) تسجيل الدخول ───────── */
await pv('lower', 'دخولٌ آمنٌ بالصلاحيات', 'لكلّ دورٍ صلاحياتُه: مدير المشروع، المستودع، المشتريات، الإدارة', 'شاشة الدخول');
await wait(900);
const seeded = await page.evaluate(seedAll);
L(`  ${el()}  زُرع ${seeded} مستنداً تجريبياً`);
AUTH_OK = true;
await clickEl('#login-user', { settle: 700 });
await page.type('#login-user', 'admin', { delay: 110 });
await wait(400);
await clickEl('#login-pass', { settle: 500 });
await page.type('#login-pass', 'Passw0rd!', { delay: 95 });
await wait(600);
await shot('login');
// التعليقُ يُرفَع قبل الضغط لا بعده — وإلا ظهر تعليقُ شاشةِ الدخول فوق شاشةِ المشاريع.
await pv('lowerOff'); await wait(420);
await clickEl('.login-btn', { settle: 700 });
await wait(3800);
await overlay();
await progress();

/* ───────── ٣) بوّابة المشاريع ───────── */
await pv('lower', 'عدّةُ مشاريعَ بعزلٍ تامّ', 'بياناتُ كلّ مشروعٍ منفصلةٌ عن غيره — والمشترياتُ المركزيةُ تراها جميعاً', 'بوّابة المشاريع');
await wait(3200);
await shot('projects');
await pv('lowerOff'); await wait(420);
await clickEl('[onclick*="selectProject(\'hail\')"]', { settle: 800 });
await wait(3400);
// مُحاكي Firestore يُطلق onSnapshot مرّةً واحدةً عند الاشتراك، والتطبيق يُفرّغ مصفوفاته
// عند دخول المشروع — فما اشتُرك قبل الدخول يبقى فارغاً. نُعيد الاشتراك ليصل الزرعُ
// إلى الشاشة. قصورُ المُحاكي لا التطبيق: Firestore الحقيقيّ يُعيد الإرسال من تلقائه.
await page.evaluate(() => {
  try { _custodyUnsub = null; _custodySignedUnsub = null; startCustodySync(); } catch (e) { }
  try { _issueOrdersUnsub = null; startIssueOrdersSync(); } catch (e) { }
  try { _assetsUnsub = null; startAssetsSync(); } catch (e) { }
  try { _ppmUnsub = null; startPPMSync(); } catch (e) { }
  try { _rfqUnsub = null; _poUnsub = null; startPurchaseSync(); } catch (e) { }
  try { _invUnsub = null; _invLogUnsub = null; _whUnsub = null; _catalogUnsub = null; startInventorySync(); } catch (e) { }
}).catch(() => { });
await wait(1200);
await overlay();
await progress();
L(`  ${el()}  دخلنا المشروع`);

/* ───────── ٤) الفصول ───────── */
for (const ch of CHAPTERS) {
  // لا بطاقةَ فصلٍ ملءَ الشاشة ولا وميضٌ داكن: الشاشةُ تبقى معروضةً بلا انقطاع،
  // وعنوانُ الفصل يأتي في الشريط السفليّ فوقها. القطعُ إلى لوحٍ أزرقَ كان يقطع
  // السياق البصريّ، وتدرّجُه العريض أسوأُ ما يكسّره ضغطُ الفيديو.
  await pv('lowerOff'); await pv('cursorOff'); await wait(320);
  const clicked = await goPage(ch.page);
  await pv('lower', ch.title, ch.lower[1], 'الفصل ' + ch.n + ' — ' + ch.kicker);
  await wait(3400);
  // بعضُ الشاشات نموذجٌ فارغٌ حتى يُضغط زرُّها — فنضغطه ليُرى المخرَجُ لا النموذج.
  if (ch.act) { await clickEl(ch.act, { settle: 800 }); await wait(2600); await overlay(); await pv('lower', ch.title, ch.lower[1], 'الفصل ' + ch.n + ' — ' + ch.kicker); await wait(900); }
  await shot(ch.page);
  await browseDown(700, 1500);
  await scrollTop();
  await pv('lowerOff');
  await progress();
  L(`  ${el()}  ${ch.n}) ${ch.page}${clicked ? '' : ' (فُتحت برمجياً)'}`);
}

/* ───────── ٥) تفصيلُ طلبِ شراءٍ حقيقيّ ───────── */
await pv('lowerOff'); await pv('cursorOff'); await wait(320);
await goPage('purchases');
const POCAP = ['تفاصيل الطلب PO-1038', 'المستلَمُ مقابل المطلوب، ومرجعُ الاستلام ورقمُ الفاتورة — الإغلاقُ لا يتمّ دونها', 'عن قرب'];
await page.evaluate(() => { try { openPurchaseDetail('PO-1038'); } catch (e) { } }).catch(() => { });
await wait(2600);
await overlay();
await pv('lower', POCAP[0], POCAP[1], POCAP[2]);
await wait(3400);
await shot('po-detail');
await page.evaluate(() => { try { closeModal('modal-purchase-detail'); } catch (e) { } }).catch(() => { });
await wait(900);
await pv('lowerOff');
await progress();

/* ───────── ٦) الخاتمة ───────── */
await pv('cursorOff'); await wait(300);
// نُنهي على آخر شاشةٍ بلا تعليق: الذوبانُ إلى مشهد ختام Remotion يتكفّل بالانتقال.
if (NO_BOOKENDS) { await pv('lowerOff'); await wait(1100); }
else await titleCard('شركة المباني السريعة', 'نظامٌ واحدٌ — من البلاغ إلى التقرير',
  'بلاغاتٌ ومشترياتٌ ومخزونٌ وعهدٌ وأصولٌ وصيانةٌ وقائيةٌ ومؤشّراتُ أداء · الإصدار ' + (APPV || ''),
  6400, { shot: 'outro', keep: true });
await progress();
await wait(1400);

L('══════════════════════════════════════════════════════');
if (errors.length) {
  L(`  ⚠️  أخطاءُ جافاسكربت (${errors.length}):`);
  [...new Set(errors)].slice(0, 6).forEach(e => L('   • ' + e));
} else L('  ✨ لا أخطاء جافاسكربت في الجولة كلّها');

if (cdp) { try { await cdp.send('Page.stopScreencast'); } catch (e) { } }
await new Promise(r => setTimeout(r, 600));      // امنح الإطاراتِ المتأخّرةَ فرصةَ الوصول
await context.close();
await browser.close();

L(`  اللقطات: ${SHOTS} (${shotN} لقطة)`);

/* ───────── التركيب والترميز ───────── */
if (!PROBE && shots.length > 5) {
  let ff = null;
  try { ff = require('ffmpeg-static'); } catch { }
  if (ff && fs.existsSync(ff)) {
    const mp4 = path.join(OUT, `${NAME}.mp4`);
    // كلُّ إطارٍ يعيش حتى طابعِ الإطار الذي يليه — فالإيقاعُ هو إيقاعُ الصفحة نفسِها
    // لا معدّلٌ ثابتٌ نفرضه. ثم `fps=30` يوحّد الناتج بلا حذفٍ ولا قفز.
    const keep = shots.filter(f => f.wall >= TRIM_AT);
    const list = keep.length > 5 ? keep : shots;
    const lines = [];
    for (let i = 0; i < list.length; i++) {
      const d = i + 1 < list.length ? Math.min(2, Math.max(0.01, list[i + 1].ts - list[i].ts)) : 0.2;
      lines.push(`file '${list[i].file}'`, `duration ${d.toFixed(4)}`);
    }
    lines.push(`file '${list[list.length - 1].file}'`);
    const concat = path.join(OUT, `${NAME}-frames.txt`);
    fs.writeFileSync(concat, lines.join('\n'));
    const secsCap = list[list.length - 1].ts - list[0].ts;
    L(`  ترميز MP4 (H.264) من ${list.length} إطاراً · ${secsCap.toFixed(1)} ث…`);
    const r = spawnSync(ff, ['-y', '-f', 'concat', '-safe', '0', '-i', concat,
      '-vf', 'fps=30,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
      '-movflags', '+faststart', mp4], { stdio: ['ignore', 'ignore', 'pipe'] });
    fs.rmSync(concat, { force: true });
    if (r.status === 0 && fs.existsSync(mp4)) {
      fs.rmSync(FRAMES, { recursive: true, force: true });
      const mb = (fs.statSync(mp4).size / 1048576).toFixed(1);
      const d = spawnSync(ff, ['-i', mp4], { encoding: 'utf8' });
      const dur = (/Duration: (\d+:\d+:\d+\.\d+)/.exec(d.stderr || '') || [, '؟'])[1];
      L(`  ✅ الفيديو: ${mp4}  ·  ${mb} م.ب  ·  المدّة ${dur}`);
      // نسخةُ مشاركةٍ تحت سقف حجم: الأصليّةُ ~٤٢ م.ب تتجاوز حدَّ المرفقات في واتساب
      // والبريد. تبقى **1920×1080 كاملةً** ولا تُصغَّر — التصغيرُ يُذهب حدّةَ النصوص
      // والجداول وهي جوهرُ المعروض؛ فالضبطُ بمعدّل بتٍّ محسوبٍ من السقف بمرورين.
      // مروران بـpreset veryslow ⇒ نحو ربع ساعة لفيديو ثلاث دقائق. هذا ثمنُ الحدّة.
      const lite = NO_BOOKENDS ? null : path.join(OUT, 'promo-hd.mp4');
      if (!lite) { L('══════════════════════════════════════════════════════\n'); process.exit(0); }
      const secs = (() => { const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(d.stderr || ''); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : 0; })();
      const cap = Number(process.env.PROMO_MAX_MB || 28), abr = 96;
      const vbr = secs > 0 ? Math.max(600, Math.floor((cap * 8192) / secs) - abr) : 1200;
      const plog = path.join(OUT, 'x264');
      const common = ['-c:v', 'libx264', '-preset', 'veryslow', '-b:v', `${vbr}k`, '-pix_fmt', 'yuv420p', '-passlogfile', plog];
      L(`  نسخةُ المشاركة 1080p — سقف ${cap} م.ب (${vbr} ك.ب/ث، مروران)…`);
      spawnSync(ff, ['-y', '-i', mp4, ...common, '-pass', '1', '-an', '-f', 'mp4', '/dev/null'], { stdio: ['ignore', 'ignore', 'pipe'] });
      const r2 = spawnSync(ff, ['-y', '-i', mp4, ...common, '-pass', '2', '-an',
        '-movflags', '+faststart', lite], { stdio: ['ignore', 'ignore', 'pipe'] });
      for (const f of fs.readdirSync(OUT)) if (f.startsWith('x264')) fs.rmSync(path.join(OUT, f), { force: true });
      if (r2.status === 0 && fs.existsSync(lite))
        L(`  ✅ نسخةُ المشاركة: ${lite}  ·  ${(fs.statSync(lite).size / 1048576).toFixed(1)} م.ب  ·  1920×1080`);
    } else {
      L('  ❌ فشل الترميز — تبقى الإطارات في: ' + FRAMES);
      L(String(r.stderr || '').split('\n').slice(-6).join('\n'));
    }
  } else L('  ⚠️  ffmpeg-static غير مثبّت — تبقى الإطارات في: ' + FRAMES);
}
L('══════════════════════════════════════════════════════\n');
process.exit(0);
