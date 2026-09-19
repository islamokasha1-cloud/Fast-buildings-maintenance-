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
//   node promo-video.mjs --topic ai → مجموعةُ فصولٍ أخرى (فصولُ الذكاء الاصطناعي) — الجولةُ
//                                     الأصليةُ تبقى كما هي، والمخرَجُ باسمٍ مستقلّ (promo-ai.mp4)
//
// المتطلّبات:  npm install --no-save playwright-core ffmpeg-static chart.js@4.4.1
//              (في أمرٍ واحد — `--no-save` يحذف ما لم يُذكر فيه من الحزم غير المسجَّلة)
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
// 4K حقيقيّ لا تكبيرَ صورة: النافذةُ 3840×2160 والتخطيطُ يبقى بعرض 1920 بتكبير CSS ×2،
// فالرسمُ بأربعة أضعاف البكسلات والشكلُ كما هو. (لقطةُ CDP تُقيَّد بمقاس النافذة، فلا
// يكفي `deviceScaleFactor` وحدَه — جُرّب فأعطى 1920×1080 رغم كثافةِ ٢.)
const FOURK = process.argv.includes('--4k') || process.env.PROMO_4K === '1';
const VW = FOURK ? 3840 : 1920, VH = FOURK ? 2160 : 1080;
// زمنُ رسمِ الإطار مقيسٌ في هذه البيئة: ٤٤م.ث عند 1080p و~١٥٠م.ث عند 4K.
const STEP_MS = Number(process.env.PROMO_STEP_MS || (FOURK ? 152 : 44));
// بلا بطاقتَي الافتتاح والختام — حين تأتيان من إعلان Remotion في `promo-assemble.mjs`.
const NO_BOOKENDS = process.argv.includes('--no-bookends');
// موضوعُ الجولة: مجموعةُ فصولٍ قابلةٌ للاختيار (`TOPICS` أدناه). بلا وسيطٍ = الجولةُ
// الأصلية بفصولها كلِّها — فإضافةُ موضوعٍ لا تمسّ الفيديو القائم ولا تُعيد تسجيله.
const TOPIC = (() => { const i = process.argv.indexOf('--topic'); return i > 0 ? String(process.argv[i + 1] || '').trim() : ''; })();
const NAME = (NO_BOOKENDS ? 'promo-body' : 'promo') + (TOPIC ? '-' + TOPIC : '');
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
// Chart.js وحدَها تُرى في الشاشة (رسومُ لوحة القيادة والمؤشّرات والمقارنة الشهرية):
// إن وُجدت نسخةٌ محلية (`npm install --no-save chart.js@4.4.1`) تُلبّى بها بدل الوهمية،
// فتمتلئ مساحاتُ الرسوم بدل أن تبقى بيضاء. غيابُها لا يُسقط شيئاً — يعود البديلُ الصامت.
const CHART_LOCAL = path.join(REPO, 'node_modules', 'chart.js', 'dist', 'chart.umd.js');
const HAVE_CHART = fs.existsSync(CHART_LOCAL);
const CDN_STUBS = (HAVE_CHART ? '' : `
  window.Chart = function(){ return { destroy(){}, update(){}, resize(){}, data:{}, options:{} }; };
  window.Chart.register = function(){}; window.Chart.defaults = { font:{} };`) + `
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
   '#pv-flash.on{opacity:1}',
   // بطاقاتُ إشعارات HailNotify (بلاغاتُ الصيانة الوقائية المولَّدة تلقائياً وقتَ
   // الدخول) تطفو أسفل اليمين فوق شريط التعليق. تُخفى في الفيلم وحدَه — كالـtoast.
   '#hn-stack{display:none!important}',
   // شريطُ «بلاغاتٌ تجاوزت SLA» يطفو أعلى الشاشة ثماني ثوانٍ عند دخول بعض الصفحات (التقارير)
   // فيغطّي ترويسةَ النافذة المفتوحة. يُخفى في الفيلم وحدَه بالمنطق نفسِه.
   '#sla-alert-bar{display:none!important}'
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
    cursor: function(x, y){ var Z=parseFloat(getComputedStyle(document.documentElement).zoom)||1; var c=document.getElementById('pv-cursor'); c.classList.add('on'); c.style.transform='translate('+(x/Z)+'px,'+(y/Z)+'px)'; },
    cursorOff: function(){ document.getElementById('pv-cursor').classList.remove('on'); },
    ring: function(x, y){ var Z=parseFloat(getComputedStyle(document.documentElement).zoom)||1; var g=document.getElementById('pv-ring'); g.style.transform='translate('+(x/Z)+'px,'+(y/Z)+'px)'; g.classList.remove('go'); void g.offsetWidth; g.classList.add('go'); },
    bar: function(pct){ document.getElementById('pv-bar').style.width = Math.max(0,Math.min(100,pct))+'%'; },
    flash: function(on){ document.getElementById('pv-flash').classList.toggle('on', !!on); },
    keep: function(){ if(!document.getElementById('pv-root').isConnected) document.body.appendChild(document.getElementById('pv-root')); },
    // ── ضبطٌ مباشرٌ خطوةً خطوة (بلا انتقالات CSS) ──
    // الانتقالُ الذي يقوده المتصفّح يفترض ٦٠ إطاراً/ث؛ وحين يلتقط المُصيّرُ ٧ فقط
    // تصل منه أربعُ عيّناتٍ فيبدو متقطّعاً. فنقودُ القيمةَ بأنفسنا: خطوةٌ لكلّ إطارٍ
    // مُلتقَط، ثمّ يُعطى كلُّ إطارٍ 1/30ث في المخرَج — فيُعرَض ناعماً مهما بطُؤ الالتقاط.
    raw: function(on){
      ['pv-cursor','pv-lower','pv-scrim'].forEach(function(id){
        var e = document.getElementById(id); if (e) e.style.transition = on ? 'none' : '';
      });
      var m = document.querySelector('.main-area'); if (m) m.style.transition = on ? 'none' : '';
    },
    at: function(what, a, b){
      if (what === 'cursor'){
        var Z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
        var c = document.getElementById('pv-cursor'); c.classList.add('on');
        c.style.transform = 'translate('+(a/Z)+'px,'+(b/Z)+'px)'; return;
      }
      if (what === 'caption'){
        var l = document.getElementById('pv-lower');
        l.style.opacity = a; l.style.transform = 'translateY('+(24*(1-a))+'px)';
        document.getElementById('pv-scrim').style.opacity = a;
        l.classList.toggle('on', a > 0.02); document.getElementById('pv-scrim').classList.toggle('on', a > 0.02);
        return;
      }
      if (what === 'main'){ var m = document.querySelector('.main-area'); if (m) m.style.opacity = a; }
    }
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

  // التواريخُ نسبيةٌ إلى يوم التسجيل لا مطلقة. كانت مثبَّتةً على أغسطس 2026، فبعد
  // شهرٍ من ذلك بدت كلُّ البلاغات «متأخّرةً ٤٥ يوماً» والمشترياتُ «متوقّفةً ٤٠ يوماً» —
  // وذلك عمرُ البيانات المزروعة لا سلوكُ المنصة. اليومُ ١٣ هو يومُ التسجيل الأصليّ،
  // فتبقى الأعمارُ كما صُمّمت (بلاغاتٌ عمرُها ٠–١٢ يوماً) مهما تأخّر التسجيل.
  const ANCHOR_DAY = 13;
  const D = (d, h) => {
    const n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + (d - ANCHOR_DAY), h || 9, 0, 0)).toISOString();
  };
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
  // تفعيلُ الذكاء الاصطناعي: التطبيقُ يقرأ رابطَ الوكيل من هذه الوثيقة قبل أيّ نداء،
  // والنداءُ نفسُه يُلبّى محلياً بردٍّ مُعدٍّ (انظر `AI_CANNED`) — لا يصل شيءٌ للشبكة.
  S['meta/ai_settings'] = { proxyUrl: 'https://hail-ai-proxy.islamokasha1.workers.dev' };
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

  // صورةُ عطلٍ توضيحية للبلاغ TK-2041 — رسمٌ متجهيٌّ للوحة توزيعٍ عليها أثرُ احتراق،
  // مضمَّنٌ كـ`data:` كي يقرأه زرُّ «تحليل صورة العطل» بلا شبكة (`safeUrl` يقبل `data:image/`).
  // ليست صورةً حقيقية: استبدلها بصورةِ موقعٍ فعلية متى توفّرت.
  const svgPhoto = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480">'
    + '<rect width="640" height="480" fill="#8f9aa6"/><rect x="90" y="40" width="460" height="400" rx="10" fill="#d9dee5" stroke="#5b6672" stroke-width="6"/>'
    + '<rect x="120" y="70" width="400" height="60" rx="4" fill="#3b4652"/><text x="320" y="110" text-anchor="middle" font-family="sans-serif" font-size="26" fill="#e8edf2">DB-01 · 400V</text>'
    + Array.from({ length: 8 }, (_, i) => '<rect x="' + (128 + i * 49) + '" y="170" width="38" height="110" rx="4" fill="#f4f6f8" stroke="#6b7580" stroke-width="3"/><rect x="' + (140 + i * 49) + '" y="195" width="14" height="40" rx="3" fill="' + (i === 2 ? '#c0392b' : '#2f3e4e') + '"/>').join('')
    + '<ellipse cx="240" cy="235" rx="60" ry="46" fill="#1f1a17" opacity=".78"/><ellipse cx="236" cy="228" rx="34" ry="24" fill="#3a2a1e" opacity=".85"/>'
    + Array.from({ length: 8 }, (_, i) => '<rect x="' + (128 + i * 49) + '" y="310" width="38" height="110" rx="4" fill="#f4f6f8" stroke="#6b7580" stroke-width="3"/><rect x="' + (140 + i * 49) + '" y="335" width="14" height="40" rx="3" fill="#2f3e4e"/>').join('')
    + '</svg>';
  S[T + '/TK-2041'].ticketPhoto = 'data:image/svg+xml;utf8,' + encodeURIComponent(svgPhoto);

  /* ── المشتريات ── */
  const mkPO = (id, status, vendor, items, extra) => {
    const sub = items.reduce((s, x) => s + x.qty * x.unitCost, 0);
    const vat = Math.round(sub * 0.15);
    const rcvd = ['delivered', 'closed', 'closed_after_receipt'].indexOf(status) !== -1;
    // الأيامُ ١–١٢ كلُّها قبل يوم التسجيل (١٣): كان `% 20` يضع تاريخَ طلب PO-1038
    // في المستقبل، ويظهر ذلك حرفياً في لقطة «عن قرب».
    const day = 1 + (Number(id.slice(-3)) % 12);
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
  // مقارنةٌ ذكيةٌ محفوظةٌ على PO-1040: ثلاثةُ عروضٍ رُفعت ملفّاتُها واستُخرجت بنودُها — البندُ
  // الأوّلُ ورد بثلاث تسمياتٍ فوُحّد، والثالثُ لم يسعّره مورّدٌ. تُعرَض في نافذة الطلب كما
  // يُعرَض أيُّ استخراجٍ محفوظ (`_pcAIUsed`) — بلا نداءٍ وقتَ التسجيل. الأرقامُ توضيحية.
  const AIS = ['مؤسسة الخليج للتكييف', 'شركة التبريد المتقدم', 'مؤسسة الرياض للتجارة'];
  S[PC + '/PO-1040'].priceComparisons2 = [{
    id: 'g_ai', label: 'مقارنة عامة', itemIndices: [0, 1], suppliers: [], decisions: [], rationale: '',
    aiFiles: [
      { name: 'عرض-الخليج-للتكييف.pdf', url: 'https://example.com/q1.pdf', ext: 'pdf', supplierName: AIS[0] },
      { name: 'عرض-التبريد-المتقدم.pdf', url: 'https://example.com/q2.pdf', ext: 'pdf', supplierName: AIS[1] },
      { name: 'عرض-الرياض-للتجارة.jpg', url: 'https://example.com/q3.jpg', ext: 'jpg', supplierName: AIS[2] }
    ],
    aiExtract: {
      suppliers: AIS, at: D(10, 11), by: 'م. أسامة السادات',
      items: [
        { canonicalName: 'فلتر تكييف مقاس ٢٤', unit: 'قطعة', unified: true, unifyNote: 'ورد باسم «فلتر هواء 24 بوصة» و«فلتر AC-24» — المقاسُ والمواصفةُ نفسُها',
          quotes: [{ supplierIndex: 0, rawName: 'فلتر تكييف 24', unitPrice: 38, qty: 60 }, { supplierIndex: 1, rawName: 'فلتر هواء 24 بوصة', unitPrice: 41.5, qty: 60 }, { supplierIndex: 2, rawName: 'فلتر AC-24', unitPrice: 36, qty: 60 }] },
        { canonicalName: 'غاز تبريد R410', unit: 'أسطوانة', unified: false,
          quotes: [{ supplierIndex: 0, rawName: 'غاز R410A أسطوانة 11.3 كجم', unitPrice: 420, qty: 8 }, { supplierIndex: 1, rawName: 'غاز تبريد R-410', unitPrice: 455, qty: 8 }] },
        { canonicalName: 'زيت كمبروسر POE', unit: 'لتر', unified: false,
          quotes: [{ supplierIndex: 0, rawName: 'زيت POE 68', unitPrice: 48, qty: 10 }, { supplierIndex: 1, rawName: 'زيت كمبروسر POE', unitPrice: 52, qty: 10 }, { supplierIndex: 2, rawName: 'زيت تبريد POE-68', unitPrice: 45, qty: 10 }] }
      ],
      notes: 'مؤسسة الرياض لم تسعّر غاز التبريد. عرض الخليج يشمل التوريد خلال ٥ أيام، وعرض التبريد المتقدم يمنح ضماناً سنةً على الغاز.'
    },
    aiSummary: [
      '**التوصية:** الترسية على **مؤسسة الخليج للتكييف** للبنود الثلاثة.',
      '',
      '- **الأرخص إجمالاً** على البنود المسعَّرة كاملةً، مع تغطيةٍ لكلّ البنود.',
      '- مؤسسة الرياض أرخصُ في الفلاتر والزيت لكنها **لم تسعّر غاز التبريد** — فتجزئةُ الترسية توفّر مبلغاً محدوداً مقابل تعقيد التوريد.',
      '- شركة التبريد المتقدم أغلى في كلّ بند، وميزتُها الوحيدة ضمانُ الغاز.',
      '',
      '**ملاحظة:** يُنصح بتثبيت مدّة التوريد (٥ أيام) في أمر الشراء.'
    ].join('\n')
  }];
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
    // سلّمُ السعر في `inventory-pricing.js`: آخرُ واردٍ ← `unitPrice` على وثيقة الصنف ←
    // `unitPrice` في الكتالوج. `avgCost` وحدَه لا يقرؤه أحد، فكانت الشاشةُ تعرض
    // «بلا سعر» لكلّ الأصناف وقيمةَ مخزونٍ صفراً.
    S[INV + '/' + x[0]] = {
      itemId: x[0], itemName: x[1], unit: x[2], currentQty: x[3], avgCost: x[4], unitPrice: x[4],
      minQty: x[5], reorderPoint: x[5], warehouseId: 'wh-main', warehouseName: 'المستودع الرئيسي — حائل'
    };
    S[CAT + '/' + x[0]] = { itemId: x[0], itemCode: x[0].toUpperCase().replace('ITM-', 'HL-'), itemName: x[1], unit: x[2], lastCost: x[4], unitPrice: x[4], category: 'مواد صيانة' };
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

  /* ── المهامّ والملاحظات (`staff_tasks` — عامّة لا مشروعية) ──
     التبويبُ الافتراضي «مهامّي» يعرض ما أُسند إلى المستخدم الحاليّ (admin) — فأكثرُ
     البذرة مُسندٌ إليه، ومعها مهمّةٌ كلّف بها غيرَه وملاحظةٌ ومهمّةٌ منجَزة. */
  const ME = { user: 'admin', name: 'م. إسلام عكاشة' }, PM = { user: 'pm', name: 'م. أسامة السادات' };
  const ST = (id, o) => {
    const parts = [...new Set([o.createdByUser, o.assignedToUser].concat(o.shared || []).filter(Boolean))];
    S['staff_tasks/' + id] = Object.assign({ body: '', kind: 'task', status: 'open', priority: 'normal', shared: [], comments: [], attachments: [], seenBy: {}, batchId: '' }, o, { participants: parts });
  };
  ST('ST-1008', { title: 'اعتماد عرض المقاول لتركيب مضخة الحريق — مبنى الورشة', body: 'المضخة وصلت أمس. يلزم اعتمادُ المقاول قبل التشغيل، وإرفاق شهادة المطابقة.',
    priority: 'high', due: FUT(1), createdBy: PM.name, createdByUser: PM.user, assignedToUser: ME.user, assignedToName: ME.name, shared: ['wh'],
    comments: [{ user: PM.user, name: PM.name, text: 'عرضُ المقاول والفاتورةُ الأولية مرفقان.', at: D(12, 8) }],
    attachments: [{ url: 'https://example.com/pump-offer.pdf', path: 'po/staff_tasks/ST-1008/offer.pdf', name: 'عرض-المقاول.pdf', type: 'application/pdf', size: 248000, by: PM.user, byName: PM.name, at: D(12, 8) }],
    createdAt: D(11, 9), updatedAt: D(12, 8) });
  ST('ST-1007', { title: 'مراجعة كشف العهد الشهري قبل إرساله للمالية', body: 'التأكّد من إرجاع سلّم الألمنيوم ومثقاب ماهر يوسف.',
    due: FUT(3), createdBy: PM.name, createdByUser: PM.user, assignedToUser: ME.user, assignedToName: ME.name, createdAt: D(10, 10), updatedAt: D(10, 10) });
  ST('ST-1006', { title: 'زيارة مبنى العيادة — تجهيز نقاط الطاقة لجهاز الأشعة الجديد', body: 'طلبُ الإدارة الطبية: ثلاثُ نقاطٍ ٣٢ أمبير وتأريضٌ مستقلّ.',
    priority: 'high', due: FUT(-1), createdBy: PM.name, createdByUser: PM.user, assignedToUser: ME.user, assignedToName: ME.name, shared: ['pm'],
    comments: [{ user: ME.user, name: ME.name, text: 'تمّت المعاينة — نحتاج قاطعاً إضافياً في اللوحة الفرعية.', at: D(12, 14) }],
    createdAt: D(8, 9), updatedAt: D(12, 14) });
  ST('ST-1005', { title: 'حصرُ وحدات التكييف المطلوب استبدالها في السكن (ب) وتسعيرُها', body: 'المطلوب جدولٌ بالوحدات وأعمارها وتكلفة الاستبدال التقديرية.',
    due: FUT(6), createdBy: ME.name, createdByUser: ME.user, assignedToUser: PM.user, assignedToName: PM.name, createdAt: D(9, 11), updatedAt: D(9, 11) });
  ST('ST-1004', { title: 'ملاحظة: المورّد «الأساس للمواد» يطلب تحديث بيانات التحويل البنكي', body: 'وردت رسالةٌ من المورّد — تُحدَّث عند اعتماد الطلب القادم.',
    kind: 'note', createdBy: ME.name, createdByUser: ME.user, createdAt: D(7, 13), updatedAt: D(7, 13) });
  ST('ST-1003', { title: 'تسليم تقرير أغسطس الشهري للأمانة', body: 'سُلِّم بالبريد الرسمي مع نسخة PDF.',
    status: 'done', due: D(5, 9).slice(0, 10), createdBy: PM.name, createdByUser: PM.user, assignedToUser: ME.user, assignedToName: ME.name,
    doneAt: D(4, 15), doneByUser: ME.user, doneByName: ME.name, createdAt: D(1, 9), updatedAt: D(4, 15) });

  /* ── خزانة الوثائق (`global_docs` — نطاقُ الشركة وحدَه يظهر في السجلّات) ──
     الانتهاءاتُ موزَّعةٌ على سلّم الألوان كلِّه: منتهيةٌ · حرجة · عاجلة · قريبة · سليمة · دائمة. */
  const DV = (id, o) => {
    S['global_docs/' + id] = Object.assign({ docTypeOther: '', notes: '', files: [{ name: id + '.pdf', url: 'https://example.com/' + id + '.pdf', storagePath: 'po/vault/docs/' + id + '.pdf', size: 184320, at: D(1, 9), by: ME.name }],
      archived: false, renewCount: 0, noExpiry: false, scope: 'company', projectId: '', projectName: '', isCustomProject: false,
      owner: 'قسم الشؤون الإدارية', ownerUser: 'admin', createdAt: D(1, 9), createdBy: ME.name, updatedAt: D(1, 9), updatedBy: ME.name, history: [] }, o);
  };
  DV('DOC-2609-0001', { title: 'السجل التجاري', docType: 'cr', number: '1010234567', issuer: 'وزارة التجارة', start: '2025-10-01', expiry: FUT(200), renewCount: 1, notes: 'يُجدَّد إلكترونياً عبر بوابة التجارة.' });
  DV('DOC-2609-0002', { title: 'شهادة الزكاة والدخل', docType: 'zakat', number: 'ZK-2026-44810', issuer: 'هيئة الزكاة والضريبة والجمارك', start: '2026-04-30', expiry: FUT(5), owner: 'المحاسب العام', ownerUser: 'pm' });
  DV('DOC-2609-0003', { title: 'شهادة التأمينات الاجتماعية', docType: 'gosi', number: 'GO-771204', issuer: 'التأمينات الاجتماعية', start: '2026-08-01', expiry: FUT(20), owner: 'الموارد البشرية' });
  DV('DOC-2609-0004', { title: 'شهادة السعودة (نطاقات)', docType: 'saudization', number: 'NT-5520981', issuer: 'وزارة الموارد البشرية', start: '2026-07-15', expiry: FUT(50), owner: 'الموارد البشرية' });
  DV('DOC-2609-0005', { title: 'رخصة البلدية — المقرّ الرئيسي', docType: 'municipal', number: 'BL-HA-30217', issuer: 'أمانة منطقة حائل', start: '2025-09-10', expiry: FUT(-3), renewCount: 2 });
  DV('DOC-2609-0006', { title: 'شهادة تصنيف المقاولين', docType: 'classification', number: 'CL-100-2288', issuer: 'وزارة الشؤون البلدية والإسكان', start: '2024-11-01', expiry: FUT(90) });
  DV('DOC-2609-0007', { title: 'شهادة الآيزو 9001', docType: 'iso', number: 'ISO-SA-91882', issuer: 'جهة مانحة معتمدة', start: '2025-03-01', expiry: FUT(140), owner: 'إدارة الجودة' });
  DV('DOC-2609-0008', { title: 'عقد تأسيس الشركة', docType: 'agreement', number: '—', issuer: 'وزارة التجارة', start: '2010-05-01', expiry: '', noExpiry: true });
  S['meta/global_docs_counter'] = { n: 8, updatedAt: D(1, 9) };
  S['meta/global_letters_counter'] = { n: 14, updatedAt: D(1, 9) };
  S['meta/vault_readers'] = { users: ['admin'] };

  /* ── إدارة المشاريع: موازنةٌ لكلّ مشروع + عقدٌ ومستخلصاتٌ وأوامرُ دفع (مجموعاتٌ عامّة) ──
     بطاقةُ المشروع تجمع: الموازنةَ من `meta/<id>_budget`، والمصروفَ من الطلبات المغلقة
     والمستخلصات المسدَّدة وأوامر الدفع، والمتعاقَدَ عليه من العقود النشطة. */
  const CATS = (m) => [['materials', 'مواد بناء', m[0]], ['electrical', 'كهرباء', m[1]], ['plumbing', 'سباكة', m[2]], ['hvac', 'تكييف', m[3]], ['subcontractor', 'مقاول باطن', m[4]], ['labor', 'مصنعيات/عمالة', m[5]], ['overhead', 'مصاريف إدارية', m[6]]]
    .map(c => ({ key: c[0], name: c[1], planned: c[2] }));
  S['meta/hail_budget'] = { type: 'maintenance', categories: CATS([450000, 260000, 180000, 320000, 540000, 210000, 90000]), boq: [], cleaning: {} };
  S['meta/qsm_budget'] = { type: 'maintenance', categories: CATS([180000, 120000, 90000, 160000, 220000, 110000, 40000]), boq: [], cleaning: {} };
  S['meta/jouf_budget'] = { type: 'cleaning', categories: CATS([60000, 30000, 25000, 40000, 380000, 260000, 35000]), boq: [], cleaning: {} };
  const VEND = 'مؤسسة الإنجاز الفني للمقاولات';
  S['global_contracts/CTR-2609-0004'] = {
    requestId: 'CRQ-2609-0011', vendorId: 'V-014', vendorName: VEND, projectId: P, isCustomProject: false, projectName: '',
    budgetCategoryKey: 'subcontractor', isSubstitute: false, substituteAccountId: '',
    title: 'أعمال ترميم وصيانة مبنى الورشة الرئيسية', scope: 'ترميم أرضيات وواجهات وأعمال كهروميكانيكية', type: 'works_order', lines: [],
    value: 480000, vatMode: 'inclusive', startDate: '2026-06-01', durationDays: 180,
    advance: { pct: 10, recoveryPct: 10, amount: 48000, recovered: 24000, paid: 48000, payments: [] },
    retention: { pct: 5, releaseOn: 'completion', released: 0 }, warranty: { months: 12 },
    guarantees: [], changeOrders: [], clauses: [], signedDocs: [], status: 'ctr_active', timeline: [],
    createdAt: '2026-06-01T08:00:00.000Z', createdBy: ME.name
  };
  [['EXT-2607-0001', 'المستخلص الأول', 'يونيو 2026', 1, 132000, 'TR-88214', '2026-07-05'], ['EXT-2608-0002', 'المستخلص الثاني', 'يوليو 2026', 2, 96500, 'TR-89033', '2026-08-06']].forEach(x => {
    S['global_contract_extracts/' + x[0]] = { contractId: 'CTR-2609-0004', vendorName: VEND, projectId: P, isCustomProject: false, projectName: '',
      title: x[1], period: x[2], seq: x[3], status: 'ext_paid', payment: { amount: x[4], ref: x[5], receiptUrl: '', at: x[6] + 'T10:00:00.000Z', by: ME.name },
      createdAt: x[6] + 'T08:00:00.000Z', createdBy: PM.name, timeline: [] };
  });
  S['global_contract_requests/CRQ-2609-0014'] = { engagement: 'pay_order', projectId: P, isCustomProject: false, projectName: '', budgetCategoryKey: 'labor',
    vendorId: 'V-021', vendorName: 'مؤسسة الرواد للتشغيل', title: 'أمر دفع — مصنعيات تركيب وحدات تكييف', value: 74000,
    payments: [{ amount: 74000, ref: 'TR-90112', at: D(3, 9), by: ME.name }], status: 'crq_paid', isSubstitute: false, substituteAccountId: '', timeline: [],
    createdAt: D(1, 8), createdBy: PM.name };
  S['global_contract_requests/CRQ-2609-0015'] = { engagement: 'contract', projectId: P, isCustomProject: false, projectName: '', budgetCategoryKey: 'electrical',
    vendorName: 'شركة التيار الحديث', title: 'طلب تعاقد — تحديث لوحات التوزيع الرئيسية', value: 155000, status: 'crq_pending_ceo',
    payments: [], timeline: [], createdAt: D(8, 8), createdBy: PM.name };

  CURRENT_PROJECT = _prevProj;
  return Object.keys(S).length;
}

/* ═══════════════════════════════ سيناريو الجولة ═══════════════════════════════ */
// كل فصلٍ: بطاقةُ عنوان ← انتقالٌ بالنقر ← تعليقٌ سفليّ ← تصفّحٌ هادئ.
const CHAPTERS = [
  { page: 'dashboard', kicker: 'لوحة القيادة', title: 'صورةٌ واحدةٌ لحالة المشروع',
    sub: 'مؤشّراتُ البلاغات والمشتريات والمخزون في شاشةٍ واحدة — بلا تجميعٍ يدويّ',
    lower: ['لوحة المعلومات', 'كلُّ رقمٍ محسوبٌ لحظياً من مصدره — لا جداول Excel موازية'] },

  { page: 'daily', kicker: 'التشغيل اليوميّ', title: 'البلاغاتُ من الفتح إلى الإغلاق',
    sub: 'أولوياتٌ بزمنِ استجابةٍ ملزم، وإسنادٌ للفنيّين، وتتبّعٌ حتى الإغلاق والاستلام',
    lower: ['الحركة اليومية', 'البلاغاتُ المتأخّرةُ عن زمن الاستجابة تُرفَع تلقائياً إلى أعلى الشاشة'] },

  { page: 'tickets', kicker: 'سجلّ البلاغات', title: 'بحثٌ وتصفيةٌ في كلّ بلاغ',
    sub: 'بالمبنى ونوع العمل والمشرف والحالة — والأرشيف الشهريّ محفوظٌ بلا حذف',
    lower: ['سجلّ البلاغات', 'تصفيةٌ فوريةٌ بالمبنى ونوع العمل والمشرف — والمغلقُ يُرحَّل للأرشيف'] },

  { page: 'new', kicker: 'تسجيل بلاغ', title: 'بلاغٌ كاملٌ في أقلّ من دقيقة',
    sub: 'مبنى ودورٌ ونوعُ عملٍ وأولويةٌ ومرفقاتٌ مصوّرة — بحقولٍ مضبوطةٍ لا نصٍّ حرّ',
    lower: ['تسجيل بلاغ جديد', 'قوائمُ مضبوطةٌ من إعدادات المشروع — تمنع الأخطاء الإملائية في التقارير'] },

  { page: 'purchases', kicker: 'دورة الشراء', title: 'طلبُ الشراء بمراحلَ لا تُتخطّى',
    sub: 'من الطلب إلى اعتماد مدير المشروع فمراجعة المستودع فالاستلام فالإغلاق',
    lower: ['المشتريات', 'كلُّ مرحلةٍ باعتمادٍ موثَّقٍ باسم صاحبه ووقته — لا اعتمادَ شفهيّ'],
    after: () => poCloseUp() },

  { page: 'new-purchase', kicker: 'طلبٌ جديد', title: 'أصنافٌ من الكتالوج بأسعارها',
    sub: 'ضريبةُ القيمة المضافة والإجمالي يُحسبان آلياً — والصنفُ مربوطٌ برصيد المخزون',
    lower: ['طلب شراء جديد', 'الأصنافُ من كتالوجٍ موحَّد — فتتطابق أسماؤها عبر كلّ التقارير'] },

  { page: 'rfq', kicker: 'التسعير', title: 'ثلاثةُ عروضٍ قبل كلّ ترسية',
    sub: 'مقارنةُ عروض المورّدين صنفاً بصنف، والترسيةُ موثّقةٌ بسببها',
    lower: ['طلبات التسعير', 'مقارنةٌ صنفاً بصنف بين المورّدين — والفارقُ ظاهرٌ قبل الترسية'] },

  { page: 'inventory', kicker: 'المخزون', title: 'رصيدٌ حيٌّ لا جردٌ متأخّر',
    sub: 'كلُّ استلامٍ وصرفٍ يُحدّث الرصيد لحظياً، وحدُّ إعادة الطلب ينبّه قبل النفاد',
    lower: ['المخزون', 'الرصيدُ يتحرّك مع الاستلام والصرف — والأصنافُ دون الحدّ الأدنى مُعلَّمة'] },

  { page: 'inventory-log', kicker: 'أثرُ الحركة', title: 'كلُّ حركةٍ لها أثرٌ لا يُمحى',
    sub: 'استلامٌ وصرفٌ وتسويةٌ ونقل — باسم المنفِّذ ووقته ومرجعِ الطلب أو البلاغ',
    lower: ['سجلّ حركة المخزون', 'أثرٌ كاملٌ لكلّ حركة — يُغلق باب الفرق غير المُفسَّر في الجرد'] },

  { page: 'custody', kicker: 'العهد', title: 'ما بيد كلِّ فنّيٍّ موثَّقٌ باسمه',
    sub: 'صرفُ العهدة وتوقيعُها واستردادُها — فلا عهدةَ معلّقةٌ بلا صاحب',
    lower: ['كشف العهد', 'العهدةُ باسم حاملها وتوقيعه — والمستردُّ يعود لرصيد المستودع'] },

  { page: 'assets', kicker: 'الأصول', title: 'سجلُّ أصولٍ بحالتها لا بعددها',
    sub: 'كلُّ أصلٍ بموقعه وطرازه ورقمه التسلسليّ وضمانه وحالته التشغيلية',
    lower: ['سجلّ الأصول', 'الأصلُ مربوطٌ ببلاغاته وخطط صيانته — فتاريخُه كاملٌ في مكانٍ واحد'] },

  { page: 'ppm', kicker: 'الصيانة الوقائية', title: 'صيانةٌ تسبق العطل',
    sub: 'خططٌ دوريةٌ بمواعيدَ محسوبة، والمتأخّرةُ منها تُعلَّم بوضوحٍ لا يُتجاهَل',
    lower: ['الصيانة الوقائية (PPM)', 'الخططُ المتأخّرةُ تُرفَع أعلى القائمة بلافتةٍ حمراء'] },

  { page: 'projects', kicker: 'إدارة المشاريع', title: 'كلُّ مشروعٍ بموازنته ومصروفه في بطاقةٍ واحدة',
    sub: 'الموازنةُ المعتمدة مقابل المصروف والمتعاقَد عليه وما ينتظر الاعتماد — من المشتريات والعقود والمستخلصات نفسِها',
    lower: ['إدارة المشاريع', 'المصروفُ يُجمَع من الطلبات المغلقة والمستخلصات المسدَّدة وأوامر الدفع — لا من رقمٍ يُكتب'],
    after: () => projectCloseUp() },

  { page: 'vault-docs', kicker: 'خزانة الوثائق', title: 'وثائقُ الشركة لا تنتهي في صمت',
    sub: 'السجلُّ التجاريّ والزكاةُ والتأميناتُ والتصنيفُ والرخص — بمسؤول تجديدٍ وتنبيهٍ متدرّجٍ قبل الانتهاء',
    lower: ['خزانة الوثائق', 'أفقُ الانتهاء بالألوان: منتهيةٌ · حرجةٌ · عاجلةٌ · قريبةٌ — ولكلّ وثيقةٍ مسؤولُ تجديد'] },

  { page: 'staff-tasks', kicker: 'المهامّ والملاحظات', title: 'ما كُلِّفتَ به وما كلّفتَ به غيرَك',
    sub: 'مهامٌّ بموعدٍ وأولويةٍ ومرفقاتٍ وتعليقات — تُنجَز أو تُعاد بسبب، ولا تضيع في الواتساب',
    lower: ['المهامّ والملاحظات', 'مهامّي · كلّفتُ بها · شارَكوني فيها · ملاحظاتي — والمتأخّرُ عن موعده ملوَّنٌ'] },

  { page: 'kpi', kicker: 'المؤشّرات', title: 'أداءٌ يُقاس لا يُوصَف',
    sub: 'زمنُ الاستجابة والإنجاز والالتزامُ بالأولويات — بأرقامٍ من البيانات نفسها',
    lower: ['مؤشّرات الأداء', 'المؤشّرُ محسوبٌ من البلاغات ذاتها — لا إدخالَ يدويَّ يقبل التجميل'] },

  { page: 'reports', kicker: 'التقارير', title: 'تقريرٌ جاهزٌ للعميل بضغطة',
    sub: 'تقاريرُ شهريةٌ ومصوَّرةٌ وتصديرٌ إلى Excel وPowerPoint — من البيانات الحيّة',
    lower: ['التقارير', 'تصديرٌ إلى Excel وPowerPoint من البيانات الحيّة — بلا إعادة كتابة'],
    act: '#page-reports [onclick*="generateReport()"]' },

  { page: 'monthly-compare', kicker: 'الذكاء الاصطناعي', title: 'ذكاءٌ اصطناعيٌّ في صميم العمل',
    sub: 'ملخّصٌ تنفيذيّ · فرزُ البلاغات وتحليلُ صورها · صياغةُ الخطابات والتقارير · استخراجُ المقايسة · تحليلُ عروض الأسعار',
    lower: ['المقارنة الشهرية', 'شهرٌ مقابل شهر بالأرقام — وزرٌّ واحدٌ يحوّلها إلى ملخّصٍ تنفيذيٍّ مكتوب'],
    // الصفحةُ تختار الشهرَ المنصرم افتراضاً وبياناتُ البذرة في الشهر الجاري — فيُنقَر أوّلاً.
    act: '#mcomp-months-row .mcomp-month-btn:first-child',
    after: () => aiCloseUp() },

  { page: 'tv', kicker: 'شاشة العرض', title: 'الحالةُ معروضةٌ في موقع العمل',
    sub: 'شاشةُ عرضٍ دائمةٌ في غرفة التشغيل تُحدَّث لحظياً — البلاغُ يظهر فور تسجيله',
    lower: ['لوحة العرض TV', 'شاشةٌ تعمل بلا تدخّل — تُحدَّث مع كلّ بلاغٍ يُسجَّل أو يُغلق'] }
];
/* ── موضوعٌ آخر: فصولُ الذكاء الاصطناعي وحدَها ──
   الشاشاتُ حقيقيةٌ والنقرُ حقيقيّ، والردودُ من `AI_CANNED`. كلُّ فصلٍ يفتح صفحتَه ثم
   يدخل «عن قرب» في نافذةٍ أو زرّ. يُستهلك في فيلم «الذكاء الاصطناعي في إدارة المرافق»
   (`promo-assemble.mjs --film ai`) بعد مشاهد Remotion العامّة. */
const AI_CHAPTERS = [
  { page: 'tickets', kicker: 'نافذة البلاغ', title: 'ثلاثُ أدواتٍ في نافذة كلّ بلاغ',
    sub: 'فرزٌ وتصنيف · تحليلُ صورة العطل · كشفُ التكرار',
    lower: ['سجلّ البلاغات', 'من نافذة أيّ بلاغ: فرزٌ وتصنيف · تحليلُ صورة العطل · كشفُ التكرار — بضغطة زرّ'],
    after: () => aiTicketCloseUp() },

  { page: 'daily', kicker: 'إغلاق البلاغ', title: 'من ملاحظةٍ مختصرة إلى تقريرٍ مكتمل',
    sub: 'الفنّي يكتب سطراً، والذكاء الاصطناعي يصوغه تقريرَ إغلاق',
    lower: ['الحركة اليومية', 'الفنّي يكتب سطراً بلغة الميدان، والذكاء الاصطناعي يصوغه تقريرَ إغلاقٍ رسمياً — والمشرفُ يراجع قبل الحفظ'],
    after: () => aiCloseDraftCloseUp() },

  { page: 'purchases', kicker: 'عروض الأسعار', title: 'العروضُ تُقرأ آلياً وتُقارَن بنداً بند',
    sub: 'ملفّاتُ العروض تُرفع كما هي، فيستخرج النموذجُ البنودَ ويوحّد تسمياتها',
    lower: ['المشتريات', 'ملفّاتُ العروض تُرفع كما هي — فيستخرج النموذجُ البنودَ ويوحّد تسمياتها المختلفة ويكتب توصيته'],
    after: () => aiQuoteCloseUp() },

  { page: 'reports', kicker: 'الخطابات الرسمية', title: 'خطابٌ رسميٌّ من نقاطٍ مختصرة',
    sub: 'الموضوعُ والجهةُ والنقاط — والخطابُ بالصيغة الإدارية المعتمدة',
    lower: ['التقارير', 'الموضوعُ والجهةُ والنقاط — والخطابُ يخرج بالصيغة الإدارية المعتمدة جاهزاً للمراجعة والطباعة'],
    after: () => aiLetterCloseUp() },

  { page: 'monthly-compare', kicker: 'الملخّص التنفيذي', title: 'شهرٌ كاملٌ في ملخّصٍ للإدارة',
    sub: 'شهرٌ مقابل شهر بالأرقام — وزرٌّ واحدٌ يحوّلها إلى ملخّصٍ مكتوب',
    lower: ['المقارنة الشهرية', 'شهرٌ مقابل شهر بالأرقام — وزرٌّ واحدٌ يحوّلها إلى ملخّصٍ تنفيذيٍّ مكتوب'],
    act: '#mcomp-months-row .mcomp-month-btn:first-child',
    after: () => aiMonthlyCloseUp() },

  { page: 'admin-panel', kicker: 'الحوكمة', title: 'المفتاحُ خادميٌّ والاستهلاكُ مسجَّل',
    sub: 'مفتاحُ الذكاء الاصطناعي لا يصل إلى المتصفّح، وكلُّ نداءٍ يُحصى',
    lower: ['لوحة الإدارة', 'مفتاحُ الذكاء الاصطناعي لا يصل إلى المتصفّح ولا يُخزَّن في النظام — وكلُّ نداءٍ يُحصى شهرياً ولكلّ ميزة'],
    after: () => aiSettingsCloseUp() }
];
const TOPICS = {
  ai: {
    chapters: AI_CHAPTERS,
    intro: ['شركة المباني السريعة', 'الذكاء الاصطناعي داخل المنصة', 'فرزُ البلاغات وتحليلُ صورها · تقاريرُ الإغلاق · عروضُ الأسعار · الخطابات · الملخّصُ التنفيذيّ'],
    outro: ['شركة المباني السريعة', 'الذكاءُ يقترح، والإنسانُ يقرّر', 'كلُّ توصيةٍ تُراجَع قبل أن تصبح قراراً — والبياناتُ داخل المنصة']
  }
};
if (TOPIC && !TOPICS[TOPIC]) { console.error('موضوعٌ غيرُ معروف: ' + TOPIC + ' — المتاح: ' + Object.keys(TOPICS).join(', ')); process.exit(1); }
const TOUR = TOPIC ? TOPICS[TOPIC] : null;
const ACTIVE = TOUR ? TOUR.chapters : CHAPTERS;
// ترقيمُ الفصول مشتقٌّ من ترتيبها — فإدراجُ فصلٍ لا يُعيد ترقيمَ ما بعده يدوياً.
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
ACTIVE.forEach((c, i) => { c.n = String(i + 1).replace(/\d/g, d => AR_DIGITS[d]); });

/* ═════════════════════════════════ التشغيل ═════════════════════════════════ */
const t0 = Date.now();
const L = (...a) => console.log(...a);
const el = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5) + 's';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--force-device-scale-factor=1'] });
const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, locale: 'ar-SA' });
const page = await context.newPage();
if (FOURK) await page.addInitScript(`document.addEventListener('DOMContentLoaded',function(){document.documentElement.style.zoom='2';});`);
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
    format: 'jpeg', quality: Number(process.env.PROMO_JPEG_Q || 100),
    maxWidth: VW, maxHeight: VH, everyNthFrame: 1
  });
}
await page.addInitScript(MOCK_FIREBASE);
await page.addInitScript(CDN_STUBS);

let AUTH_OK = false;
const errors = [];
const IGNORE = /ServiceWorkerRegistration|net::ERR_FAILED|Failed to load resource|ERR_BLOCKED|reCAPTCHA|AppCheck|purchase-kpi/i;
page.on('pageerror', e => { const m = String(e.message).slice(0, 160); if (!IGNORE.test(m)) errors.push(m); });

/* ── الخطوط: Cairo وTajawal من النسخ المحلية ──
   `index.html` يحمّل Cairo من Google Fonts، وكلُّ نداءٍ خارجيٍّ هنا مُجهَض — فكان
   التطبيقُ كلُّه يُصوَّر بخطّ النظام الاحتياطيّ لا بخطّه الحقيقيّ. نُلبّي طلبَ ورقة
   الأنماط بـ`fonts.css` المحلية (نفسُ ملفات `remotion/public/fonts`)، ونوجّه ملفاتِ
   الخطّ إلى القرص. لا تعديلَ في التطبيق: ما يُرى هو خطُّه في الإنتاج. */
const FONT_DIR = path.join(REPO, 'remotion', 'public', 'fonts');
const FONT_CSS = fs.readFileSync(path.join(FONT_DIR, 'fonts.css'), 'utf8')
  .replace(/url\(\.\/([^)]+)\)/g, 'url(https://fonts.gstatic.com/pv/$1)');
const CORS = { 'access-control-allow-origin': '*' };

/* ── الذكاء الاصطناعي: ردودٌ مُعدَّة بدل النموذج ──
   كلُّ ميزات الذكاء الاصطناعي في المنصة تمرّ بوكيلٍ واحد (`hail-ai-proxy`) ويقرأ
   التطبيقُ الردَّ بشكل Anthropic Messages (`content[].text` و`usage`). في الفيلم
   يُلبّى النداءُ محلياً بردٍّ ثابتٍ يُختار من نصّ الطلب — فيُرى **سلوكُ الشاشة الحقيقيّ**
   (الزرّ · الانتظار · العرض المنسَّق) بلا مفتاحٍ ولا شبكة. النصوصُ توضيحيةٌ تُشبه
   ما يُنتجه النموذجُ فعلاً على بيانات البذرة، ولا تُبنى عليها أرقامٌ في التعليق. */
const AI_CANNED = {
  triage: [
    '**التصنيف المقترح:** أعمال الكهرباء — لوحة توزيع رئيسية',
    '**الأولوية:** 🔴 حرج (انقطاعٌ كاملٌ عن دورٍ مشغول) — الأولويةُ المسجَّلة صحيحة',
    '',
    '**السبب الأرجح:** فصلٌ تلقائيٌّ للقاطع الرئيسي بسبب حملٍ زائد أو تسرّبٍ أرضيّ في أحد الخطوط الفرعية للدور الثاني.',
    '',
    '**خطوات الفحص المقترحة:**',
    '1. قياس الأحمال على خطوط الدور الثاني وفصل الدوائر الفرعية واحدةً واحدة.',
    '2. فحص قاطع التسرّب الأرضي (ELCB) بالاختبار اليدوي.',
    '3. مراجعة الربط الحراريّ للوحة DB-01 — آخر فحصٍ مسجَّلٍ قبل ٣ أشهر.',
    '',
    '**الفنّي المناسب:** فنّي كهرباء مرخَّص — يُنصح بإسناده لـ **ماهر يوسف** (أقلّ حملٍ حاليّ في هذا التخصّص).',
    '',
    '⚠️ يُلاحَظ **بلاغٌ مشابهٌ معادُ فتحه** في المبنى نفسه (TK-2036) — يُنصح بالربط بينهما.'
  ].join('\n'),
  monthly: [
    '## أبرز ما حدث',
    '',
    'استُلم **١٤ بلاغاً** هذا الشهر وأُغلق منها **٦** — الحملُ الأكبر على **مبنى الإدارة العامة** بأربعة بلاغات، وأعمالُ الكهرباء والتكييف تمثّل نصفَ البلاغات.',
    '',
    '- ✅ خطط الصيانة الوقائية أنتجت **٣ بلاغاتٍ روتينية** في موعدها دون تدخّلٍ يدويّ.',
    '- ⏱ متوسط زمن الإغلاق **٢٫٣ يوم عمل** — ضمن المستهدف للأولوية العادية.',
    '',
    '## الاتجاهات مقارنة بالشهر السابق',
    '',
    '| المؤشر | الشهر السابق | الشهر الحالي | التغيّر |',
    '|---|---|---|---|',
    '| البلاغات المستلمة | ١١ | ١٤ | ▲ ٢٧٪ |',
    '| الالتزام بالـ SLA | ٧٣٪ | ٦٧٪ | ▼ ٦ نقاط |',
    '| متوسط زمن الإغلاق | ٢٫٩ يوم | ٢٫٣ يوم | ▼ ٢١٪ |',
    '',
    '## نقاط تستحق الانتباه',
    '',
    '- ⚠️ **٦ بلاغاتٍ تجاوزت الزمن المستهدف** — أربعةٌ منها بلا فنّيٍّ مُسنَد.',
    '- ⚠️ المصعد الرئيسي (AST-0102) عليه بلاغُ توقّفٍ حرج وخطةُ صيانةٍ مستحقّة في الوقت نفسه.',
    '',
    '## توصيات',
    '',
    '1. **إسناد البلاغات الأربعة المتأخّرة اليوم** — التأخّرُ ناتجٌ عن غياب الإسناد لا عن التنفيذ.',
    '2. **دمج بلاغ المصعد مع خطة PPM-070** في زيارةٍ واحدة للمقاول المختصّ.',
    '3. مراجعة لوحة التوزيع DB-01 بعد بلاغَي الانقطاع المتكرّرَين في مبنى الإدارة.'
  ].join('\n'),
  // تحليلُ صورة العطل (TK-2041 — لوحةُ التوزيع المرسومة في البذرة)
  photo: [
    '**ما تُظهره الصورة:** لوحةُ توزيعٍ فرعية (DB-01) عليها **أثرُ احتراقٍ واسودادٍ** حول القاطع الثالث في الصفّ العلويّ.',
    '',
    '**الشدّة التقديرية:** متوسطة إلى عالية — أثرٌ حراريٌّ واضحٌ دون اشتعالٍ قائم.',
    '',
    '**السبب المحتمل:** ربطٌ غيرُ محكمٍ لطرف الكابل عند القاطع أدّى إلى مقاومة تلامسٍ وارتفاعِ حرارةٍ موضعيّ — يفسّر الفصلَ التلقائيَّ المتكرّر.',
    '',
    '**المواد المرجّح الحاجة إليها:** قاطع ٣٢ أمبير بديل · أطراف كابل ٦ مم · شريط عازل حراري.',
    '',
    '**الإجراء:** فصلُ التغذية عن اللوحة قبل أيّ عمل، استبدالُ القاطع وإعادةُ ربط الأطراف بالعزم المناسب، ثم فحصٌ حراريٌّ بعد التشغيل.'
  ].join('\n'),
  // كشفُ التكرار — يقرأ بلاغاتِ المبنى نفسِه من البذرة
  recurring: [
    '**نعم — يبدو العطل متكرّراً.**',
    '',
    'البلاغات المشابهة في المبنى نفسه:',
    '- **TK-2036** — مقبس غرفة الخادم لا يعمل، **أُعيد فتحه** بعد الإصلاح (كهرباء).',
    '- **TK-2033** — ربطٌ دوريٌّ وفحصُ حرارة لوحات التوزيع (وقائية، مغلق).',
    '',
    '**السبب الجذري المحتمل:** حملٌ زائدٌ على الخطّ الفرعيّ للدور الثاني أو ضعفُ ربطٍ في لوحة DB-01 — فالبلاغان السابقان على الدائرة نفسِها.',
    '',
    '**التوصية:** معالجةٌ جذرية على اللوحة (قياسُ الأحمال وإعادةُ توزيعها) بدل إصلاحٍ موضعيٍّ للمرّة الثالثة، وربطُ البلاغين معاً في تقرير الإغلاق.'
  ].join('\n'),
  // صياغةُ تقرير الإغلاق — من ملاحظة الفنّي المختصرة على TK-2040
  close: 'تمّ فحص وحدة التكييف المركزي بقاعة الاجتماعات، وتبيّن انخفاض ضغط غاز التبريد نتيجة تسرّبٍ بسيط عند وصلة الأنبوب الخارجي. تمّت معالجة التسرّب بلحام الوصلة واختبار الضغط، ثم إعادة شحن الغاز (R410) وتنظيف الفلاتر، والتشغيل التجريبي مع التأكد من وصول درجة التبريد المطلوبة. الوحدة تعمل بكفاءة، ويُوصى بفحص دوري للوصلات خلال الشهر القادم.',
  // الخطابُ الرسميّ — بعناصرَ نائبةٍ لما لم يُذكر
  letter: [
    'التاريخ: [التاريخ]        الرقم المرجعي: [الرقم]',
    '',
    '**إلى:** سعادة مدير عام أمانة منطقة حائل — حفظه الله',
    '',
    '**الموضوع:** إشعار إنجاز أعمال الصيانة الشهرية — مبنى الإدارة العامة',
    '',
    'السلام عليكم ورحمة الله وبركاته، وبعد:',
    '',
    'إشارةً إلى عقد التشغيل والصيانة رقم [رقم العقد]، نفيد سعادتكم بأنه قد تمّ بحمد الله إنجاز أعمال الصيانة الشهرية لمبنى الإدارة العامة، وشملت ما يلي:',
    '',
    '1. اكتمال صيانة وحدات التكييف المركزي.',
    '2. استبدال لوحة التوزيع الفرعية بالدور الثاني.',
    '3. إرفاق التقرير المصوّر للأعمال المنفَّذة.',
    '',
    'ونأمل من سعادتكم التكرّم بالاطّلاع، وتوجيه من يلزم بمعاينة الأعمال واستلامها.',
    '',
    'وتفضّلوا بقبول فائق الاحترام والتقدير،',
    '',
    '**مدير المشروع**',
    'م. أسامة السادات',
    'شركة المباني السريعة للمقاولات'
  ].join('\n')
};
// كلُّ ميزةٍ تُعرَف بجملةٍ ثابتةٍ في نصّ طلبها (`index.html`) — فالمطابقةُ عليها لا على كلمةٍ عامّة.
function aiCanned(prompt) {
  const key = /الصورة أعلاه مرفقة/.test(prompt) ? 'photo'
    : /بلاغات سابقة في نفس المبنى/.test(prompt) ? 'recurring'
    : /تقارير إغلاق بلاغات/.test(prompt) ? 'close'
    : /خطاباً رسمياً كاملاً/.test(prompt) ? 'letter'
    : /ملخصاً تنفيذياً شهرياً/.test(prompt) ? 'monthly' : 'triage';
  const text = AI_CANNED[key];
  return {
    id: 'msg_demo', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6', stop_reason: 'end_turn',
    usage: { input_tokens: 380, output_tokens: 310 }, content: [{ type: 'text', text }]
  };
}

await page.route('**/*', route => {
  const u = route.request().url();
  const method = route.request().method();
  if (u.includes('workers.dev') && !u.includes('/login')) {
    if (method === 'OPTIONS')
      return route.fulfill({ status: 204, headers: Object.assign({ 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' }, CORS) });
    let prompt = '';
    try { prompt = JSON.stringify(JSON.parse(route.request().postData() || '{}').messages || ''); } catch (e) { }
    // مهلةٌ قصيرةٌ كي يُرى مؤشّرُ الانتظار الحقيقيّ في الشاشة قبل الردّ.
    return new Promise(r => setTimeout(r, 1400)).then(() =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(aiCanned(prompt)) }));
  }
  if (HAVE_CHART && /\/Chart\.js\/[\d.]+\/chart\.umd(\.min)?\.js$/.test(u))
    return route.fulfill({ status: 200, contentType: 'application/javascript', headers: CORS, body: fs.readFileSync(CHART_LOCAL) });
  if (u.includes('fonts.googleapis.com/css'))
    return route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', headers: CORS, body: FONT_CSS });
  const fm = /fonts\.gstatic\.com\/pv\/([A-Za-z0-9_-]+\.woff2)$/.exec(u);
  if (fm && fs.existsSync(path.join(FONT_DIR, fm[1])))
    return route.fulfill({ status: 200, contentType: 'font/woff2', headers: CORS, body: fs.readFileSync(path.join(FONT_DIR, fm[1])) });
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

async function overlay() {
  await page.evaluate(OVERLAY).catch(() => { });
  await page.evaluate(() => {
    window.pv && window.pv.raw(true);
    // إشعاراتُ التطبيق (`toast`) تومض أسفل الشاشة ثم تختفي في أقلّ من ثانية —
    // منها تشغيليٌّ بحت («✓ Rollups جاهزة: ٠ شهر») لا معنى له للمشاهد. تُكتَم في
    // الفيلم وحدَه: لا مساسَ بالتطبيق، والتعطيلُ يُعاد بعد كلّ إعادةِ بناءٍ للصفحة.
    if (typeof window.toast === 'function' && !window.toast.__pvMuted) {
      const noop = function () { };
      noop.__pvMuted = true;
      window.toast = noop;
    }
    const tc = document.getElementById('toast-container');
    if (tc) { tc.innerHTML = ''; tc.style.display = 'none'; }
  }).catch(() => { });
}

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

// النقرُ مرحلتان كي يُمكن إدخالُ إخفاءِ المحتوى بينهما: وصولُ المؤشّر ثم الضغط.
let curPos = { x: VW / 2, y: VH / 2 };
async function cursorTo(selector, opts) {
  const o = opts || {};
  const box = await page.evaluate(sel => {
    const e = document.querySelector(sel);
    if (!e) return null;
    // `scrollIntoView` يمرّر أقربَ حاويةٍ قابلةٍ للتمرير — وحاويةُ القائمة الجانبية
    // ليست كذلك، فيمرّر **المستندَ كلَّه** وتخرج الترويسةُ من الشاشة وتبقى خارجها.
    // فلا نستعمله إلا لما هو داخل منطقة المحتوى، ونعيد تمريرَ المستند إلى الصفر دائماً.
    if (e.closest('.main-area')) e.scrollIntoView({ block: 'center', behavior: 'instant' });
    const doc = document.scrollingElement || document.documentElement;
    if (doc.scrollTop || window.scrollY) { doc.scrollTop = 0; window.scrollTo(0, 0); }
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, ok: r.width > 0 && r.height > 0 };
  }, selector).catch(() => null);
  if (!box || !box.ok) return null;
  const from = curPos, to = { x: Math.round(box.x), y: Math.round(box.y) };
  const steps = Math.max(8, Math.min(20, Math.round(Math.hypot(to.x - from.x, to.y - from.y) / 60)));
  await tween(steps, (u) => setAt('cursor', Math.round(from.x + (to.x - from.x) * u), Math.round(from.y + (to.y - from.y) * u)));
  curPos = to;
  await wait(o.settle === undefined ? 240 : Math.min(o.settle, 260));
  return box;
}
async function clickAt(selector, box) {
  await pv('ring', Math.round(box.x), Math.round(box.y));
  await wait(180);
  try { await page.click(selector, { timeout: 3000 }); } catch { return false; }
  return true;
}
async function clickEl(selector, opts) {
  const box = await cursorTo(selector, opts);
  return box ? clickAt(selector, box) : false;
}

/* ── الإيقاع المُملى: خطوةٌ لكلّ إطارٍ مُلتقَط، و1/30ث لكلّ إطارٍ في المخرَج ──
   قياسٌ في هذه البيئة: رسمُ الإطار ٤٤م.ث عند 1080p و~١٥٠م.ث عند 4K (لا تسريعَ
   رسومياً — الرسمُ برمجيٌّ بالكامل). فالانتقالاتُ التي يقودها المتصفّح تصل منها
   عيّناتٌ قليلةٌ فتبدو متقطّعة. الحلّ: نقودُ كلَّ حركةٍ بأنفسنا خطوةً خطوة، ونُعطي
   كلَّ إطارٍ منها زمناً ثابتاً في المخرَج — التقاطٌ بطيء، عرضٌ منتظمٌ ٣٠ إطاراً/ث. */
const paced = [];                                  // مدياتُ إطاراتٍ تُعرَض بإيقاعٍ ثابت
const SCROLLER = '.main-area';
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// يُشغّل `apply(u)` لقيم u من 0 إلى 1 على `steps` خطوة، خطوةً لكلّ إطار.
async function tween(steps, apply) {
  const i0 = shots.length;
  for (let i = 1; i <= steps; i++) {
    await apply(ease(i / steps));
    await page.waitForTimeout(STEP_MS);
  }
  if (shots.length > i0) paced.push([i0, shots.length]);
}
const setAt = (what, a, b) => page.evaluate(([w, x, y]) => { window.pv && window.pv.at(w, x, y); }, [what, a, b]).catch(() => { });

async function scrollMax() {
  return page.evaluate(sel => {
    const c = document.querySelector(sel);
    return c ? Math.max(0, c.scrollHeight - c.clientHeight) : 0;
  }, SCROLLER).catch(() => 0);
}
async function scrollReset() {
  await page.evaluate(sel => {
    const c = document.querySelector(sel);
    if (c) { c.style.scrollBehavior = 'auto'; c.scrollTop = 0; }
  }, SCROLLER).catch(() => { });
}
async function pacedScroll(to, steps) {
  const from = await page.evaluate(sel => (document.querySelector(sel) || {}).scrollTop || 0, SCROLLER).catch(() => 0);
  await tween(steps, (u) => page.evaluate(([sel, v]) => {
    const c = document.querySelector(sel);
    if (c) { c.style.scrollBehavior = 'auto'; c.scrollTop = v; }
  }, [SCROLLER, Math.round(from + (to - from) * u)]).catch(() => { }));
}
// جولةٌ داخل الصفحة: لا تُهدَر ثانيتان على صفحةٍ لا شيءَ فيها يُمرَّر.
async function browseTour() {
  const max = await scrollMax();
  if (max < 140) { await wait(700); return false; }
  await pacedScroll(Math.round(max * 0.92), Math.min(60, Math.max(26, Math.round(max / 26))));
  await wait(600);
  return true;
}

// الصفحةُ تُبنى على دفعات: تُرسَم فارغةً ثم تمتلئ. تصويرُ ذلك يُظهر «تأخيراً
// وتكسيراً في الظهور» — وهو بناءٌ حقيقيٌّ لا خللَ عرض، لكنّه ليس ما يُعرَض في فيلم.
// فنُخفي منطقةَ المحتوى قبل التبديل، وننتظر **استقرارَها فعلاً** لا مهلةً مقدَّرة،
// ثم نكشفها بذوبانٍ قصير — فلا يرى المشاهدُ إلا صفحةً مكتملة.
// ظهورُ التعليق واختفاؤه بالإيقاع نفسِه — وإلا بدا الشريطُ يقفز عند 4K.
// عددُ الخطوات هو **زمنُ الحركة في المخرَج** لا سرعةَ التقاطها: ١٥ خطوةً = نصفُ ثانية
// عند ٣٠ إطاراً/ث. كانت ٦ خطوات ⇒ ٠٫٢ث، فبدا التعليقُ يومض ويختفي قبل أن يُقرأ.
const FADE = 15;
async function captionIn(main, sub, badge) {
  // إن كان ظاهراً أصلاً فلا تُعِد إشعاله: `tween` يبدأ من الصفر فيُطفئه ثم يُشعله —
  // ظهورٌ ثانٍ للنصّ نفسِه. يحدث في الفصول ذات الفعل (التقارير) حيث تُستدعى مرّتين.
  const vis0 = await page.evaluate(() => {
    const l = document.getElementById('pv-lower');
    return l ? parseFloat(l.style.opacity || (l.classList.contains('on') ? '1' : '0')) : 0;
  }).catch(() => 0);
  await page.evaluate(([m, s2, b]) => {
    const l = document.getElementById('pv-lower'); if (!l) return;
    const i = l.querySelector('i');
    i.textContent = b || ''; i.style.display = b ? 'inline-block' : 'none';
    l.querySelector('b').textContent = m || '';
    l.querySelector('span').textContent = s2 || '';
  }, [main, sub, badge]).catch(() => { });
  if (vis0 > 0.9) { await setAt('caption', '1'); return; }   // ظاهرٌ سلفاً: حدِّث النصَّ فقط
  await tween(FADE + 2, (u) => setAt('caption', u.toFixed(3)));
}
async function captionOut() {
  // الحارسُ ليس تحسيناً بل إصلاحُ خلل: التلاشي يبدأ من العتامة الكاملة مهما كانت
  // الحالةُ الراهنة، وهذه الدالّةُ تُستدعى مرّتين (نهايةَ الفصل وأوّلَ التالي).
  // فالنداءُ الثاني كان **يُعيد إشعال التعليق القديم** ثمّ يُطفئه — ومضةٌ بنصّ
  // الفصل السابق بعد كلّ فصل، بانتظام. مقيسة: ١٦ ومضةً بمعدّل ٠٫٣ث في فيلمٍ واحد.
  const vis = await page.evaluate(() => {
    const l = document.getElementById('pv-lower');
    return l ? parseFloat(l.style.opacity || (l.classList.contains('on') ? '1' : '0')) : 0;
  }).catch(() => 0);
  if (!(vis > 0.02)) return;                   // مخفيٌّ أصلاً — لا تُشعله لتُطفئه
  await tween(FADE, (u) => setAt('caption', (1 - u).toFixed(3)));
  await page.waitForTimeout(120);              // لا يبدأ تغيّرُ الشاشة قبل اكتمال الانقشاع
}

async function contentHide() {
  await tween(FADE - 3, (u) => setAt('main', (1 - u).toFixed(3)));
}
async function contentShow() {
  await tween(FADE + 1, (u) => setAt('main', u.toFixed(3)));
  await page.waitForTimeout(120);
}
// الاستقرار: حجمُ محتوى الصفحة لا يتغيّر ثلاثَ قراءاتٍ متتالية، ولا «جارٍ التحميل».
// مهلةٌ عليا كي لا تعلّق شاشةٌ تُحدِّث نفسَها باستمرار (لوحةُ العرض TV مثلاً).
async function waitSettled(id, maxMs) {
  const t0 = Date.now(), cap = maxMs || 5000;
  let last = -1, stable = 0;
  while (Date.now() - t0 < cap) {
    const st = await page.evaluate(pid => {
      const el = document.getElementById('page-' + pid);
      if (!el) return { n: -1, loading: false };
      return { n: (el.innerHTML || '').length, loading: /جارٍ التحميل|جاري التحميل/.test(el.innerText || '') };
    }, id).catch(() => ({ n: -1, loading: false }));
    if (st.n === last && !st.loading) { if (++stable >= 3) return true; }
    else { stable = 0; last = st.n; }
    await page.waitForTimeout(140);
  }
  return false;
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
    // الوحداتُ التي تحقن أزرارَها وقتَ التشغيل (خزانةُ الوثائق · إدارةُ المشاريع) تربط
    // النقرَ بخاصيّة `onclick` لا بسمةٍ — فلا يلتقطها المنتقي النصّيّ. `data-page` يلتقطها.
    const btn = document.querySelector('.sidebar-nav-btn' + q) || document.querySelector('.sidebar ' + q) || document.querySelector(q)
      || document.querySelector('.sidebar-nav-btn[data-page="' + pid + '"]');
    if (!btn) return null;
    if (btn.id && !btn.getAttribute('onclick')) {
      const groups = [];
      for (let e = btn.closest('.sidebar-group'); e; e = e.parentElement && e.parentElement.closest('.sidebar-group')) {
        if (e.id) groups.unshift({ id: e.id, collapsed: e.classList.contains('collapsed') });
      }
      return { sel: '#' + btn.id, groups };
    }
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
  // المؤشّرُ يصل الزرَّ أوّلاً ثم تُخفى منطقةُ المحتوى — فالنقرُ يبقى مرئياً
  // ومفهوماً، وما يُخفى هو البناءُ الذي يليه لا الفعلُ نفسُه.
  const box = target ? await cursorTo(target.sel) : null;
  await contentHide();
  await scrollReset();          // الحاويةُ مشتركةٌ بين الصفحات — وإلا فُتحت التاليةُ ممرَّرة
  const clicked = box ? await clickAt(target.sel, box) : false;
  // بعضُ الأقسام يُخفي النظامُ أزرارَها عمداً في هذا الوضع (مثل «العهد»)، فنفتحها
  // برمجياً — ونُخفي المؤشّرَ حتى لا يبقى واقفاً في مكانٍ لم يُنقَر فيه شيء.
  if (!clicked) { await pv('cursorOff'); await page.evaluate(pid => showPage(pid), id).catch(() => { }); }
  await waitSettled(id);
  await overlay();
  await contentShow();
  return clicked;
}

const TOTAL_STEPS = ACTIVE.length + 3;

/* ── مشاهدُ «عن قرب» داخل الفصول ── */
// بطاقةُ مشروعٍ مفتوحة: نظرةٌ عامة بالموازنة والمصروف حسب الفئة، ثم العودةُ للقائمة.
async function projectCloseUp() {
  await captionOut();
  await page.evaluate(() => { try { projectMgmt.openAt(0); } catch (e) { } }).catch(() => { });
  await waitSettled('projects');
  await overlay();
  await captionIn('داخل بطاقة المشروع',
    'الموازنةُ حسب الفئة مقابل ما صُرف وما التُزم به — والمقايسةُ والجدولُ الزمنيّ في تبويباتٍ بجانبها',
    'إدارة المشاريع — عن قرب');
  await wait(2400);
  await shot('project-card');
  await browseTour();
  await page.evaluate(() => { try { projectMgmt.back(); } catch (e) { } }).catch(() => { });
  await wait(600);
}

// الذكاء الاصطناعي: بيتان في فصلٍ واحد — ملخّصٌ تنفيذيٌّ للشهر بضغطة، ثم فرزُ بلاغٍ
// من داخل نافذته. الردّان مُعدّان (انظر `AI_CANNED`)، والشاشةُ وسلوكُها حقيقيان.
// (الجولةُ الأصلية تجمعهما في فصلٍ واحد؛ وموضوعُ `ai` يستعمل كلَّ بيتٍ في فصله.)
async function aiCloseUp() {
  await aiMonthlyCloseUp();
  await aiTriageCloseUp();
}
// ① الملخّص التنفيذي من صفحة المقارنة الشهرية
async function aiMonthlyCloseUp() {
  const b1 = await cursorTo('#page-monthly-compare [onclick="aiMonthlySummary()"]', { settle: 600 });
  if (b1) {
    await clickAt('#page-monthly-compare [onclick="aiMonthlySummary()"]', b1);
    await page.waitForFunction(() => {
      const el = document.getElementById('ai-summary-body');
      return el && /توصيات/.test(el.textContent || '');
    }, null, { timeout: 15000 }).catch(() => { });
    await overlay();
    await captionIn('ملخّصٌ تنفيذيٌّ للشهر بضغطةٍ واحدة',
      'يقرأ النموذجُ أرقامَ الشهر من المنصة نفسِها ويكتب: أبرزَ ما حدث · الاتجاهات · ما يستحقّ الانتباه · توصيات — جاهزٌ للنسخ أو الطباعة',
      'الذكاء الاصطناعي — ملخّص تنفيذي');
    await wait(5600);
    await shot('ai-summary');
    await page.evaluate(() => { try { closeModal('modal-ai-summary'); } catch (e) { } }).catch(() => { });
    await wait(700);
  }
}
// ② فرزُ بلاغٍ من داخل نافذته
async function aiTriageCloseUp() {
  await captionOut();
  await page.evaluate(() => { try { openDetail('TK-2041'); } catch (e) { } }).catch(() => { });
  await wait(1800);
  await overlay();
  await page.evaluate(() => { const b = document.getElementById('ai-triage-btn'); if (b) b.scrollIntoView({ block: 'center', behavior: 'instant' }); }).catch(() => { });
  await wait(500);
  const b2 = await cursorTo('#ai-triage-btn', { settle: 600 });
  if (b2) {
    await clickAt('#ai-triage-btn', b2);
    await page.waitForFunction(() => {
      const el = document.getElementById('detail-ai-result');
      return el && /الفنّي المناسب/.test(el.textContent || '');
    }, null, { timeout: 15000 }).catch(() => { });
    await overlay();
    await page.evaluate(() => { const r = document.getElementById('detail-ai-result'); if (r) r.scrollIntoView({ block: 'center', behavior: 'instant' }); }).catch(() => { });
    await captionIn('فرزُ البلاغ وتصنيفُه بالذكاء الاصطناعي',
      'من نافذة البلاغ: التصنيفُ والأولوية والسببُ الأرجح وخطواتُ الفحص والفنّي المناسب — ومعه تحليلُ صورة العطل ورصدُ البلاغات المتكرّرة',
      'الذكاء الاصطناعي — فرز البلاغات');
    await wait(5600);
    await shot('ai-triage');
  }
  await page.evaluate(() => { try { closeModal('modal-detail'); } catch (e) { } }).catch(() => { });
  await wait(600);
}

/* ── مشاهدُ موضوع الذكاء الاصطناعي (`--topic ai`) ── */
// تمريرُ عنصرٍ داخل نافذةٍ إلى وسط الشاشة — `cursorTo` لا يمرّر إلا داخل `.main-area`.
const scrollTo = (sel, block) => page.evaluate(([s, b]) => {
  const e = document.querySelector(s); if (e) e.scrollIntoView({ block: b || 'center', behavior: 'instant' });
}, [sel, block]).catch(() => { });
// ينتظر أن يحوي عنصرٌ نصّاً بعينه — بعد ردّ الوكيل المُعدّ (مهلةُ ١٫٤ث مقصودةٌ ليُرى الانتظار).
const waitText = (sel, re) => page.waitForFunction(([s, r]) => {
  const e = document.querySelector(s); return !!e && new RegExp(r).test((e.value !== undefined ? e.value : e.textContent) || '');
}, [sel, re.source], { timeout: 15000 }).catch(() => { });

// نافذةُ البلاغ TK-2041: الأزرارُ الثلاثة واحداً بعد الآخر، بردٍّ مُعدٍّ لكلٍّ منها.
async function aiTicketCloseUp() {
  await captionOut();
  await page.evaluate(() => { try { openDetail('TK-2041'); } catch (e) { } }).catch(() => { });
  await wait(1800);
  await overlay();
  const steps = [
    ['#ai-triage-btn', /الفنّي المناسب/, 'فرزُ البلاغ وتصنيفُه', 'التصنيفُ والأولوية والسببُ الأرجح وخطواتُ الفحص والفنّي المناسب — من بيانات البلاغ نفسِها', 'ai-triage'],
    ['#ai-photo-btn', /الإجراء/, 'تحليلُ صورة العطل', 'النموذجُ يقرأ الصورةَ المرفقة بالبلاغ: نوعُ الخلل وشدّتُه وسببُه المحتمل والموادُّ المرجّحة', 'ai-photo'],
    ['#ai-recur-btn', /السبب الجذري/, 'كشفُ الأعطال المتكرّرة', 'يقارن البلاغَ بما سبقه في المبنى نفسِه ويقترح السببَ الجذريّ — بدل إصلاحٍ موضعيٍّ للمرّة الثالثة', 'ai-recurring']
  ];
  for (const [sel, re, main, sub, name] of steps) {
    await scrollTo(sel); await wait(400);
    const b = await cursorTo(sel, { settle: 600 });
    if (!b) { L('  ⚠️  زرٌّ غيرُ موجود: ' + sel); continue; }
    await clickAt(sel, b);
    await waitText('#detail-ai-result', re);
    await overlay();
    await scrollTo('#detail-ai-result');
    await captionIn(main, sub, 'الذكاء الاصطناعي — نافذة البلاغ');
    await wait(5200);
    await shot(name);
  }
  await page.evaluate(() => { try { closeModal('modal-detail'); } catch (e) { } }).catch(() => { });
  await wait(600);
}

// نافذةُ إغلاق TK-2040: ملاحظةٌ مختصرةٌ تُكتب فعلاً، ثم زرُّ الصياغة يملأ الحقل.
async function aiCloseDraftCloseUp() {
  await captionOut();
  await page.evaluate(() => { try { openCloseModal('TK-2040'); } catch (e) { } }).catch(() => { });
  await wait(1500);
  await overlay();
  await captionIn('الفنّي يكتب ملاحظةً مختصرة', 'سطرٌ واحدٌ بلغة الميدان — بلا صياغةٍ ولا تنسيق', 'الذكاء الاصطناعي — إغلاق البلاغ');
  await clickEl('#close-work', { settle: 500 });
  await page.type('#close-work', 'غيرنا غاز التبريد ولحمنا الوصلة ونظفنا الفلاتر والتكييف اشتغل تمام', { delay: 45 });
  await wait(900);
  await shot('ai-close-brief');
  const b = await cursorTo('#ai-close-btn', { settle: 600 });
  if (b) {
    await clickAt('#ai-close-btn', b);
    await waitText('#close-work', /وحدة التكييف/);
    await overlay();
    await captionIn('…والذكاء الاصطناعي يصوغها تقريرَ إغلاق', 'وصفٌ مهنيٌّ منظّم لحقل «العمل المنجز» — ملتزمٌ بما ذكره الفنّي بلا إضافة، ويُراجَع قبل الحفظ', 'الذكاء الاصطناعي — إغلاق البلاغ');
    await wait(5200);
    await shot('ai-close-draft');
  }
  await page.evaluate(() => { try { closeModal('modal-close'); } catch (e) { } }).catch(() => { });
  await wait(600);
}

// نافذةُ PO-1040: المقارنةُ الذكية المحفوظة (جدولُ الاستخراج ثم التوصية).
async function aiQuoteCloseUp() {
  await captionOut();
  await page.evaluate(() => { try { openPurchaseDetail('PO-1040'); } catch (e) { } }).catch(() => { });
  await wait(2600);
  await overlay();
  await scrollTo('#modal-purchase-detail .pcai-table'); await wait(500);
  await captionIn('المقارنةُ الذكية على طلبٍ حقيقيّ — PO-1040',
    'ثلاثةُ عروضٍ بثلاث تسمياتٍ للبند نفسِه — وحّدها النموذجُ في صفٍّ واحد، وعلّم الأرخصَ لكلّ بند، وأظهر ما لم يُسعَّر',
    'الذكاء الاصطناعي — عروض الأسعار');
  await wait(5200);
  await shot('ai-quotes');
  await scrollTo('#modal-purchase-detail .pc-ai-body'); await wait(400);
  await captionIn('…وتوصيةٌ تنفيذيةٌ مكتوبة', 'الأرخصُ إجمالاً ليس دائماً الأفضل: التوصيةُ تزن السعرَ والتغطيةَ وشروطَ التوريد', 'الذكاء الاصطناعي — عروض الأسعار');
  await wait(4600);
  await shot('ai-quotes-summary');
  await page.evaluate(() => { try { closeModal('modal-purchase-detail'); } catch (e) { } }).catch(() => { });
  await wait(700);
}

// مساعدُ الخطابات من صفحة التقارير: موضوعٌ ونقاطٌ تُكتب، ثم الخطابُ كاملاً.
async function aiLetterCloseUp() {
  await captionOut();
  const sel = '#page-reports [onclick="openAILetter()"]';
  const b0 = await cursorTo(sel, { settle: 600 });
  if (b0) await clickAt(sel, b0); else await page.evaluate(() => { try { openAILetter(); } catch (e) { } }).catch(() => { });
  await wait(1200);
  await overlay();
  await captionIn('الموضوعُ والجهةُ والنقاط', 'لا يكتب المستخدمُ إلا ما يعرفه: موضوعَ الخطاب ونقاطَه الأساسية', 'الذكاء الاصطناعي — الخطابات الرسمية');
  await clickEl('#ail-subject', { settle: 400 });
  await page.type('#ail-subject', 'إشعار إنجاز أعمال الصيانة الشهرية — مبنى الإدارة العامة', { delay: 40 });
  await clickEl('#ail-points', { settle: 400 });
  await page.type('#ail-points', 'اكتمال صيانة وحدات التكييف المركزي\nاستبدال لوحة التوزيع الفرعية بالدور الثاني\nإرفاق التقرير المصوّر للأعمال', { delay: 32 });
  await wait(700);
  await shot('ai-letter-input');
  const b = await cursorTo('#ail-gen-btn', { settle: 600 });
  if (b) {
    await clickAt('#ail-gen-btn', b);
    await waitText('#ail-result', /الاحترام/);
    await overlay();
    await scrollTo('#ail-result', 'start');
    await captionIn('خطابٌ بالصيغة الإدارية المعتمدة', 'تاريخٌ ومرجعٌ وتحيةٌ ومتنٌ وختام — بعناصرَ نائبةٍ لما لم يُذكر، بلا اختلاق', 'الذكاء الاصطناعي — الخطابات الرسمية');
    await wait(5200);
    await shot('ai-letter');
  }
  await page.evaluate(() => { try { closeModal('modal-ai-letter'); } catch (e) { } }).catch(() => { });
  await wait(600);
}

// إعداداتُ الذكاء الاصطناعي في لوحة الإدارة: رابطُ الوسيط يُموَّه في الصورة وحدَها.
async function aiSettingsCloseUp() {
  await page.evaluate(() => {
    const el = document.getElementById('admin-ai-proxy');
    if (el) { el.value = 'https://hail-ai-proxy.••••••••.workers.dev'; el.scrollIntoView({ block: 'center', behavior: 'instant' }); }
    // سطرُ الحالة تحته يعرض الرابطَ المحفوظ حرفياً — يُموَّه هو الآخر (الشاشةُ فقط، لا الوثيقة).
    const st = document.getElementById('admin-ai-proxy-status');
    if (st) st.innerHTML = st.innerHTML.replace(/https?:\/\/[^\s<]+/g, 'https://hail-ai-proxy.••••••••.workers.dev');
  }).catch(() => { });
  await wait(600);
  await captionIn('المفتاحُ مُدارٌ خادمياً', 'مفتاحُ النموذج داخل وسيطٍ خادميٍّ لا يصل إلى المتصفّح ولا يُخزَّن في النظام — وكلُّ نداءٍ يُسجَّل استهلاكُه لكلّ ميزة', 'الذكاء الاصطناعي — الحوكمة');
  await wait(4800);
  await shot('ai-settings');
}

// مراحلُ الشراء: نافذةُ طلبٍ مغلقٍ يظهر أعلاها مسارُ المراحل كاملاً — تُفتح داخل
// فصل طلبات الشراء مباشرةً (كانت مُلحقةً بآخر الفيلم فانفصلت عن سياقها).
async function poCloseUp() {
  await captionOut();
  await page.evaluate(() => { try { openPurchaseDetail('PO-1038'); } catch (e) { } }).catch(() => { });
  await wait(2600);
  await overlay();
  await captionIn('مراحلُ الشراء على طلبٍ حقيقيّ — PO-1038',
    'تقديمٌ ← اعتمادُ مدير المشروع ← مراجعةُ المستودع ← اعتمادُ المشتريات ← التنفيذ ← الاستلام ← التدقيق ← الإغلاق. المستلَمُ مقابل المطلوب ورقمُ الفاتورة شرطُ الإغلاق',
    'مراحل الشراء — عن قرب');
  await wait(5200);
  await shot('po-detail');
  await page.evaluate(() => { try { closeModal('modal-purchase-detail'); } catch (e) { } }).catch(() => { });
  await wait(900);
}
let step = 0;
const progress = async () => { step++; await pv('bar', (step / TOTAL_STEPS) * 100); };

L('\n══════════════════════════════════════════════════════');
L((PROBE ? '  وضعُ المعاينة — لقطاتٌ بلا تسجيل' : '  تسجيلُ الفيديو التعريفيّ 1920×1080') + (TOPIC ? ' · الموضوع: ' + TOPIC : ''));
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
else await titleCard(...(TOUR ? TOUR.intro : ['شركة المباني السريعة', 'نظام إدارة المرافق والمشتريات',
  'منصّةٌ واحدةٌ تُدير البلاغات والمشتريات والمخزون والأصول والصيانة الوقائية — بأثرٍ كاملٍ لكلّ حركة']), 5200, { shot: 'intro' });
await pv('flash', false); await wait(500);
await progress();

/* ───────── ٢) تسجيل الدخول ───────── */
await captionIn('دخولٌ آمنٌ بالصلاحيات', 'لكلّ دورٍ صلاحياتُه: مدير المشروع، المستودع، المشتريات، الإدارة', 'شاشة الدخول');
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
await captionOut();
await clickEl('.login-btn', { settle: 700 });
await wait(3800);
await overlay();
await progress();

/* ───────── ٣) بوّابة المشاريع ───────── */
await captionIn('عدّةُ مشاريعَ بعزلٍ تامّ', 'بياناتُ كلّ مشروعٍ منفصلةٌ عن غيره — والمشترياتُ المركزيةُ تراها جميعاً', 'بوّابة المشاريع');
await wait(3200);
await shot('projects');
await captionOut();
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
  // الوحداتُ المستقلّة تعرض دالّةَ إعادةِ الاشتراك بنفسها.
  try { staffTasks.retry(); } catch (e) { }
  try { docVault.retry(); } catch (e) { }
}).catch(() => { });
await wait(1200);
await overlay();
await progress();
L(`  ${el()}  دخلنا المشروع`);

/* ───────── ٤) الفصول ───────── */
for (const ch of ACTIVE) {
  // لا بطاقةَ فصلٍ ملءَ الشاشة ولا وميضٌ داكن: الشاشةُ تبقى معروضةً بلا انقطاع،
  // وعنوانُ الفصل يأتي في الشريط السفليّ فوقها. القطعُ إلى لوحٍ أزرقَ كان يقطع
  // السياق البصريّ، وتدرّجُه العريض أسوأُ ما يكسّره ضغطُ الفيديو.
  await captionOut(); await pv('cursorOff');
  const clicked = await goPage(ch.page);
  await captionIn(ch.title, ch.lower[1], 'الفصل ' + ch.n + ' — ' + ch.kicker);
  await wait(2400);
  // بعضُ الشاشات نموذجٌ فارغٌ حتى يُضغط زرُّها — فنضغطه ليُرى المخرَجُ لا النموذج.
  if (ch.act) {
    // هنا الزرُّ داخل منطقة المحتوى — فالنقرُ أوّلاً ليُرى، ثم يُخفى ما يليه من بناء.
    const b = await cursorTo(ch.act, { settle: 700 });
    if (b) {
      await clickAt(ch.act, b);
      await contentHide();
      await waitSettled(ch.page);
      await overlay();
      await contentShow();
      await captionIn(ch.title, ch.lower[1], 'الفصل ' + ch.n + ' — ' + ch.kicker);
      await wait(1200);
    }
  }
  await shot(ch.page);
  await browseTour();
  // مشهدٌ تفصيليٌّ يخصّ الفصلَ نفسَه (نافذةُ طلبٍ · نتيجةُ مساعد) — يُعرَض في موضعه
  // من الجولة لا مُلحقاً بآخرها، فيراه المشاهدُ في سياقه.
  if (ch.after) await ch.after(ch);
  await captionOut();
  await progress();
  L(`  ${el()}  ${ch.n}) ${ch.page}${clicked ? '' : ' (فُتحت برمجياً)'}`);
}

/* ───────── ٥) الخاتمة ───────── */
await pv('cursorOff'); await wait(300);
// نُنهي على آخر شاشةٍ بلا تعليق: الذوبانُ إلى مشهد ختام Remotion يتكفّل بالانتقال.
if (NO_BOOKENDS) { await captionOut(); await wait(900); }
else await titleCard(...(TOUR ? TOUR.outro : ['شركة المباني السريعة', 'نظامٌ واحدٌ — من البلاغ إلى التقرير',
  'بلاغاتٌ ومشترياتٌ ومخزونٌ وعهدٌ وأصولٌ وصيانةٌ وقائيةٌ ومؤشّراتُ أداء · الإصدار ' + (APPV || '')]),
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
    // إطاراتُ CDP تصل غيرَ مرتّبةٍ زمنياً تحت الحمل (الرسمُ ١٥٠م.ث عند 4K): إطارٌ
    // التُقط في فصلٍ سابق قد يُسلَّم متأخّراً فيُدرَج في غير موضعه — فيظهر تعليقُ فصلٍ
    // قديمٍ فوق شاشةِ فصلٍ لاحقٍ إطاراً واحداً ثم يختفي. الترتيبُ بالطابع الزمنيّ
    // لا بترتيب الوصول هو المصدرُ الوحيد الصحيح للتسلسل.
    const outOfOrder = shots.reduce((n, f, i) => n + (i > 0 && f.ts < shots[i - 1].ts ? 1 : 0), 0);
    if (outOfOrder) L(`  ⓘ ${outOfOrder} إطاراً وصل خارج ترتيبه الزمنيّ — أُعيد ترتيبها بالطابع`);
    const ordered = shots.slice().sort((a, b) => a.ts - b.ts);
    const keep = ordered.filter(f => f.wall >= TRIM_AT);
    const list = keep.length > 5 ? keep : ordered;
    // إطاراتُ الحركة المُخطّاة تأخذ 1/30ث ثابتةً — **إلا آخرَ إطارٍ في كلّ حركة**.
    // ذاك الإطارُ هو المشهدُ الذي يستقرّ عليه العرض بعد انتهاء الحركة (التعليقُ وقد
    // اكتمل ظهورُه مثلاً)، والشاشةُ بعده ساكنةٌ فلا يُرسل المُصيّرُ إطاراً جديداً.
    // إعطاؤه 1/30ث كان يجعل التعليقَ **يظهر ويختفي في جزءٍ من ثانية** مهما أطلنا
    // زمنَ الوقفة — لأن الوقفةَ لم تكن تُترجَم إلى زمنٍ في المخرَج أصلاً. فيأخذ
    // آخرُ إطارٍ فارقَ طابعَيه الزمنيّين، أي زمنَ الوقفة الحقيقيّ.
    const idxOf = new Map(list.map((f, i) => [f.file, i]));
    const pacedIdx = new Set();
    for (const [a, b] of paced) for (let i = a; i < b; i++) { const j = idxOf.get(shots[i] && shots[i].file); if (j !== undefined) pacedIdx.add(j); }
    // والسقفُ الأعلى للوقفة كان ثانيتين، فيقصّ وقفةَ القراءة (٣ ثوانٍ) قصّاً صامتاً.
    const HOLD_CAP = 8;
    const lines = [];
    for (let i = 0; i < list.length; i++) {
      const gap = i + 1 < list.length ? Math.min(HOLD_CAP, Math.max(0.01, list[i + 1].ts - list[i].ts)) : 0.4;
      const midMotion = pacedIdx.has(i) && pacedIdx.has(i + 1);
      lines.push(`file '${list[i].file}'`, `duration ${(midMotion ? 1 / 30 : gap).toFixed(4)}`);
    }
    lines.push(`file '${list[list.length - 1].file}'`);
    const concat = path.join(OUT, `${NAME}-frames.txt`);
    fs.writeFileSync(concat, lines.join('\n'));
    const secsCap = list[list.length - 1].ts - list[0].ts;
    L(`  ترميز MP4 (H.264) من ${list.length} إطاراً · ${secsCap.toFixed(1)} ث…`);
    const r = spawnSync(ff, ['-y', '-f', 'concat', '-safe', '0', '-i', concat,
      '-vf', 'fps=30,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(process.env.PROMO_CRF || 16),
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
      // لا نسخةَ مشاركةٍ إن كان الأصلُ دون السقف: فرضُ معدّلِ بتٍّ على مشاهدَ ساكنةٍ
      // يُنتج ملفاً أكبرَ وأدنى جودةً من الأصل — وقد حدث ذلك فعلاً بعد تنظيف المصدر.
      if (lite) fs.rmSync(lite, { force: true });
      if (!lite || fs.statSync(mp4).size / 1048576 <= Number(process.env.PROMO_MAX_MB || 28)) {
        if (lite) L(`  (الأصلُ دون السقف — فهو نفسُه نسخةُ المشاركة، بلا إعادة ترميز)`);
        L('══════════════════════════════════════════════════════\n'); process.exit(0);
      }
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
