// فحصُ مركز العمليات (v18.9ag/ai) في متصفّح Chromium حقيقي — Firestore وهميّ في الذاكرة
// (نفس مُحاكي browser-scenarios.mjs، مصدرٌ واحد) فلا يلمس الإنتاج إطلاقاً.
// يزرع ثلاثة مشاريع بحالاتٍ مختلفة ويتحقّق: الأرقام، والترتيب الأسوأ أولاً، والتدويرَ
// التلقائي ولوحةَ المشروع داخله، وعزلَ المركز عن المشروع المفتوح، وبقاءَ المستمعين.
//   node tvwall-check.mjs
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const REPO = process.env.REPO_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname));
const SHOTS = '/tmp/tvwall-shots';
fs.mkdirSync(SHOTS, { recursive: true });

const bsrc = fs.readFileSync(path.join(REPO, 'browser-scenarios.mjs'), 'utf8');
const _a = bsrc.indexOf('const MOCK_FIREBASE = `');
const _s = bsrc.indexOf('`', _a) + 1, _e = bsrc.indexOf('`;', _s);
const MOCK_FIREBASE = bsrc.slice(_s, _e);
if (!MOCK_FIREBASE.includes('window.__store')) { console.error('تعذّر استخراج المُحاكي'); process.exit(1); }

const CDN_STUBS = `
  window.Chart = function(){ return { destroy(){}, update(){}, resize(){}, data:{}, options:{} }; };
  window.Chart.register = function(){}; window.Chart.defaults = { font:{} };
  window.XLSX = { utils:{ book_new:()=>({}), json_to_sheet:()=>({}), book_append_sheet(){}, aoa_to_sheet:()=>({}) }, writeFile(){}, write(){} };
  window.PptxGenJS = function(){ return { addSlide:()=>({ addText(){}, addImage(){}, addTable(){} }), writeFile(){ return Promise.resolve(); } }; };
`;

let pass = 0, fail = 0;
const L = (...a) => console.log(...a);
const check = (n, ok, d) => { if (ok) { pass++; L('  ✅', n, d ? '— ' + d : ''); } else { fail++; L('  ❌', n, d ? '— ' + d : ''); } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
await page.addInitScript(MOCK_FIREBASE);
await page.addInitScript(CDN_STUBS);

let AUTH_OK = true;
const errors = [];
const IGNORE = /ServiceWorkerRegistration|net::ERR_FAILED|Failed to load resource|ERR_BLOCKED|reCAPTCHA|AppCheck/i;
page.on('pageerror', e => { const m = String(e.message).slice(0, 220); if (!IGNORE.test(m)) errors.push(m); });
page.on('console', m => { if (m.type() !== 'error') return; const t = String(m.text()).slice(0, 220); if (!IGNORE.test(t)) errors.push(t); });

await page.route('**/*', route => {
  const u = route.request().url();
  if (u.includes('workers.dev/login')) {
    return AUTH_OK
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'tkn', profile: { user: 'admin', name: 'المسؤول', role: 'admin' } }) })
      : route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
  }
  if (/^https?:/.test(u)) return route.abort();
  return route.continue();
});

await page.goto('file://' + REPO + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);

// ── زرع ثلاثة مشاريع: واحدٌ حرِج (٣ متأخرات)، واحدٌ متابعة (متأخرٌ واحد)، وواحدٌ مستقر ──
await page.evaluate(() => {
  const today = new Date();
  const iso = d => d.toISOString();
  const hoursAgo = h => iso(new Date(Date.now() - h * 3600000));
  window.__store[PROJECTS_DOC] = {
    projects: [
      { id: 'hail', name: 'مشروع حائل', desc: 'صيانة مبانٍ', icon: '' },
      { id: 'riyadh', name: 'مشروع الرياض', desc: 'صيانة مبانٍ', icon: '' },
      { id: 'qassim', name: 'مشروع القصيم', desc: 'صيانة مبانٍ', icon: '' }
    ]
  };
  window.__store[_meta('settings')] = { buildings: ['مبنى الإدارة'], supervisors: ['أسامة'], workTypes: { 'كهرباء': ['لمبة'] } };
  // إعداداتُ مشاريعِ الفحص — قائمةُ المباني تُقرأ منها كما في لوحة المشروع
  window.__store['meta/hail_settings'] = { buildings: ['مبنى الإدارة','الأمانة الرئيسى','وكالة الاستثمار','التحول الرقمى','مسجد الأمانة','بلدية جنوب','المختبر','خدمة المستفيدين'] };
  window.__store['meta/riyadh_settings'] = { buildings: ['مبنى الإدارة','مبنى الخدمات'] };
  const URGENT = 'عاجل 🔴 (4 ساعات)';
  const NORMAL = 'عادي 🟢 (48 ساعة)';
  const mk = (col, id, status, priority, ageH, extra) => {
    window.__store[col + '/' + id] = Object.assign({
      id, status, priority, building: 'مبنى الإدارة', workType: 'كهرباء',
      desc: 'عطل', createdAt: hoursAgo(ageH), supervisor: 'أسامة'
    }, extra || {});
  };
  // حائل: ٣ عاجلة عمرها ٤٨ ساعة ⇒ متأخرة ⇒ حرِج + بلاغٌ أُغلق اليوم
  mk('hail_tickets', 'H-1', 'مفتوح', URGENT, 48);
  mk('hail_tickets', 'H-2', 'مفتوح', URGENT, 40);
  mk('hail_tickets', 'H-3', 'قيد التنفيذ', URGENT, 30);
  mk('hail_tickets', 'H-4', 'مغلق', NORMAL, 3, { closedAt: hoursAgo(1) });
  mk('hail_tickets', 'H-5', 'مفتوح', NORMAL, 1);          // جديدٌ غير متأخر
  mk('hail_tickets', 'H-6', 'مفتوح', URGENT, 60, { archived: true }); // مؤرشف ⇒ خارج الحساب
  // الرياض: متأخرٌ واحد ⇒ متابعة
  mk('riyadh_tickets', 'R-1', 'مفتوح', URGENT, 20);
  mk('riyadh_tickets', 'R-2', 'مفتوح', NORMAL, 2);
  // القصيم: لا متأخرات ⇒ مستقر
  mk('qassim_tickets', 'Q-1', 'مغلق', NORMAL, 5, { closedAt: hoursAgo(2) });
  void today;
});

// ── مشروعُ نظافة: يُقاس بمهامّه لا ببلاغاته (v18.9aj) ──
await page.evaluate(() => {
  const d = new Date(); const p = n => String(n).padStart(2, '0');
  const ymd = dt => dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
  const today = ymd(d);
  const daysAgo = n => ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n));
  const ahead = n => ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
  const projs = window.__store[PROJECTS_DOC].projects;
  projs.push({ id: 'clean1', name: 'أعمال النظافة', desc: 'نظافة المباني', icon: '', type: 'cleaning' });
  window.__store[PROJECTS_DOC] = { projects: projs };
  // ١٧ مبنى: خمسةُ صفوفٍ في أربعة أعمدة — الحالةُ التي كانت تُقصّ فيها بطاقةُ المبنى الأخير
  window.__store['meta/clean1_settings'] = { buildings: ['مبنى الإدارة', 'مبنى الخدمات', 'المسجد'].concat(
    Array.from({ length: 14 }, (_, i) => 'مبنى ' + (i + 1))) };
  const T = 'clean1_cleaning_tasks';
  const mk = (id, name, bld, due, extra) => {
    window.__store[T + '/' + id] = Object.assign({ id, name, building: bld, workType: 'نظافة الأرضيات',
      freq: 'يومي', nextDueDate: due, checklist: [] }, extra || {});
  };
  mk('K-1', 'تنظيف وتعقيم دورات المياه', 'مبنى الإدارة', daysAgo(3));   // متأخّرة ٣ أيام
  mk('K-2', 'نظافة الأرضيات',            'مبنى الإدارة', daysAgo(1));   // متأخّرة يوم
  mk('K-3', 'نظافة الزجاج',              'مبنى الخدمات', today);        // مستحقّة اليوم
  mk('K-4', 'إدارة النفايات',            'مبنى الخدمات', today, { lastExecutedDate: today, lastExecuted: new Date().toISOString() }); // نُفِّذت اليوم
  mk('K-5', 'النظافة العميقة',           'المسجد',       ahead(5));     // قادمة
  mk('K-6', 'مهمة موقوفة',               'المسجد',       daysAgo(9), { disabled: true });
});

L('\n═══ فحص مركز العمليات ═══');
await page.fill('#login-user', 'admin'); await page.fill('#login-pass', 'Passw0rd!');
await page.click('.login-btn');
await page.waitForTimeout(4000);
check('الدخول نجح وظهرت بوّابة المشاريع', await page.isVisible('#project-screen').catch(() => false));
check('★ زرّ «مركز العمليات» ظاهر في البوّابة', await page.isVisible('#tvwall-btn-wrap').catch(() => false),
  ((await page.textContent('#tvwall-count-badge').catch(() => '')) || '').trim());

// ليس وجودُ الوسم كافياً: `_svgIcon` بلا أبعادٍ ينكمش إلى صفرٍ في حاوية flex —
// فالقياسُ الهندسيُّ هو الفحص، **والبوّابةُ ظاهرةٌ الآن** (القياسُ على مخفيٍّ صفرٌ دائماً).
const gateIco = await page.evaluate(() => {
  const g = document.getElementById('tvwall-btn-ico');
  const sv = g && g.querySelector('svg');
  const r = sv ? sv.getBoundingClientRect() : { width: 0, height: 0 };
  return { w: Math.round(r.width), h: Math.round(r.height), has: !!sv };
});
check('★ أيقونةُ زرّ البوّابة svg مرسومةٌ بأبعادٍ حقيقية',
  gateIco.has && gateIco.w >= 14 && gateIco.h >= 14, JSON.stringify(gateIco));

await page.screenshot({ path: `${SHOTS}/gate.png` });

await page.click('#tvwall-btn-wrap button');
await page.waitForTimeout(3000);
check('★ المركز فُتح والبوّابة أُخفيت',
  (await page.isVisible('#tvwall-screen').catch(() => false)) && !(await page.isVisible('#project-screen').catch(() => false)));

const cards = await page.evaluate(() => Array.from(document.querySelectorAll('#tvl-grid .tvl-card')).map(c => ({
  cls: c.className, txt: (c.innerText || '').replace(/\s+/g, ' ').trim()
})));
check('★ أربع بطاقات — واحدةٌ لكل مشروع', cards.length === 4, cards.length + ' بطاقة');
check('★ الترتيب: الأسوأ أولاً (حائل الحرِج في الصدارة)',
  /crit/.test(cards[0]?.cls || '') && /مشروع حائل/.test(cards[0]?.txt || ''), (cards[0]?.txt || '').slice(0, 60));
const sev = c => /crit/.test(c.cls) ? 0 : /warn/.test(c.cls) ? 1 : 2;
check('★ البطاقات مرتّبةٌ الأسوأ أولاً (خطورةٌ لا تتصاعد)',
  cards.every((c, i) => i === 0 || sev(cards[i - 1]) <= sev(c)),
  cards.map(c => (c.txt || '').slice(0, 12) + ':' + sev(c)).join(' | '));

const m = await page.evaluate(() => {
  const r = _tvwallCalc('hail');
  return { openN: r.openN, overdue: r.overdue, prog: r.prog, closedToday: r.closedToday, health: r.health.key, rate: r.rate };
});
check('★ حائل: ٤ نشطة (المؤرشف والمغلق خارجها)', m.openN === 4, JSON.stringify(m));
check('★ حائل: ٣ متأخرة ⇒ حرِج', m.overdue === 3 && m.health === 'crit');
check('★ حائل: قيد التنفيذ = ١، أُغلق اليوم = ١', m.prog === 1 && m.closedToday === 1);

const strip = (await page.textContent('#tvl-totals').catch(() => '') || '').replace(/\s+/g, ' ').trim();
check('★ شريط المجاميع يجمع كل المشاريع', /6/.test(strip) && /متأخرة عن SLA/.test(strip), strip.slice(0, 110));
const tk = (await page.textContent('#tvl-ticker').catch(() => '') || '').replace(/\s+/g, ' ').trim();
check('★ الشريط السفلي يعرض بلاغات بأسماء مشاريعها', tk.includes('مشروع حائل') && tk.includes('H-1'), tk.slice(0, 90));
check('★ صحّةُ الشاشة كلّها = أسوأ مشروع', await page.getAttribute('#tvwall-screen', 'data-health') === 'crit');
await page.screenshot({ path: `${SHOTS}/wall.png`, fullPage: false });

// المستمعون: مركَّبون مرةً واحدة لكل مشروع
const subs = await page.evaluate(() => Object.keys(_tvwall.subs).length);
check('★ مستمعٌ لكل مشروع (٣)', subs === 3, subs + ' مستمع');

/* ═══ مشروع النظافة: مهامٌّ لا بلاغات (v18.9aj) ═══ */
const cln = await page.evaluate(() => {
  const m = _tvwallCalc('clean1');
  const card = Array.from(document.querySelectorAll('#tvl-grid .tvl-card'))
    .find(c => (c.innerText || '').indexOf('أعمال النظافة') >= 0);
  return {
    kind: _tvwall.kind['clean1'], sub: !!_tvwall.taskSubs['clean1'], tickSub: !!_tvwall.subs['clean1'],
    m: m && { kind: m.kind, due: m.due, overdue: m.overdue, done: m.doneToday, activeN: m.activeN,
              coverage: m.coverage, health: m.health.key },
    card: card ? (card.innerText || '').replace(/\s+/g, ' ').trim() : ''
  };
});
check('★ المشروع صُنّف نظافةً واشترك على مهامّه لا على بلاغاته',
  cln.kind === 'cleaning' && cln.sub === true && cln.tickSub === false, JSON.stringify({k:cln.kind,tasks:cln.sub,tickets:cln.tickSub}));
// يومُ الجمعة/السبت إجازةٌ في النظافة: لا مهمّةَ مستحقّةً ولا متأخّرة. التوقّعُ يُشتقّ
// من القاعدة نفسها لا من يومِ تشغيل الفحص — فالفحص يثبت **القاعدة** في كل يوم.
const HOL = await page.evaluate(() => window.cleaningOps._isWeekend(window.cleaningOps._today()));
const expDue = HOL ? 0 : 3, expOd = HOL ? 0 : 2;
check(`★ الأرقام من وحدة النظافة (${HOL ? 'إجازة: لا مستحقّ ولا متأخّر' : '٣ مستحقّة · ٢ متأخّرة'} · ١ نُفِّذت · ٥ نشطة)`,
  cln.m && cln.m.due === expDue && cln.m.overdue === expOd && cln.m.done === 1 && cln.m.activeN === 5,
  JSON.stringify(cln.m));
check('★ التغطية = المنفَّذ ÷ جدول اليوم', cln.m && cln.m.coverage === (HOL ? 100 : 25), (cln.m||{}).coverage + '%');
check('★ البطاقة تعرض «مهمّة مستحقّة» لا «بلاغ نشط»',
  cln.card.includes('مهمّة مستحقّة') && !cln.card.includes('بلاغ نشط'), cln.card.slice(0, 80));
check('★ البطاقة تعرض تغطية اليوم لا إنجاز بلاغات الشهر',
  cln.card.includes('تغطية اليوم') && !cln.card.includes('إنجاز بلاغات الشهر'));
const tkTxt = await page.evaluate(() => (document.getElementById('tvl-ticker').textContent || ''));
check(HOL ? '★ في الإجازة لا مهامَّ في الشريط (ولا صفرٌ يُعرَض كأنه عمل)'
          : '★ المهامُّ المتأخّرة تظهر في الشريط السفلي باسم مشروعها',
  HOL ? !tkTxt.includes('تنظيف وتعقيم دورات المياه')
      : (tkTxt.includes('أعمال النظافة') && tkTxt.includes('تنظيف وتعقيم دورات المياه')));
check('★ الشريط العلوي يفصل المهام عن البلاغات',
  await page.evaluate(() => {
    const t = (document.getElementById('tvl-totals').textContent || '');
    return t.includes('مهام مستحقّة') && t.includes('مهام متأخّرة') && t.includes('بلاغات نشطة');
  }));

// لوحةُ مشروع النظافة في التدوير
await page.evaluate(() => {
  const i = _tvwall.screens.findIndex(s => s.pid === 'clean1');
  _tvwallShowScreen(i);
});
await page.waitForTimeout(700);
const cpanel = await page.evaluate(() => ({
  name: (document.getElementById('tvl-proj-name').textContent || '').trim(),
  kpis: Array.from(document.querySelectorAll('#tvl-proj-kpis .kl')).map(e => e.textContent.trim()),
  vals: Array.from(document.querySelectorAll('#tvl-proj-kpis .kv')).map(e => e.textContent.trim()),
  ringLbl: (document.getElementById('tvl-proj-blbl').textContent || '').trim(),
  pct: (document.getElementById('tvl-proj-bpct').textContent || '').trim(),
  foot: ['tvl-proj-l1', 'tvl-proj-l2', 'tvl-proj-l3'].map(id => (document.getElementById(id).textContent || '').trim()),
  blds: Array.from(document.querySelectorAll('#tvl-proj-blds .tvw-bld')).map(b =>
    ((b.querySelector('.bcount') || {}).textContent || '') + ' ' + ((b.querySelector('.bname') || {}).textContent || '').trim()),
  totals: (document.getElementById('tvl-totals').textContent || '').replace(/\s+/g, ' ').trim()
}));
check('★ لوحةُ النظافة: نبضُ التشغيل بالمهام', cpanel.name === 'أعمال النظافة' &&
  cpanel.kpis.join('|') === 'متأخّرة عن موعدها|مستحقّة الآن|نُفِّذت اليوم', cpanel.kpis.join(' | '));
check('★ قيمُ النبض = متأخّرة/مستحقّة/نُفِّذت', cpanel.vals.join() === `${expOd},${expDue},1`, cpanel.vals.join(' | '));
check('★ حلقةُ الجاهزية على تغطية اليوم (وإجازةٌ يومَ العطلة لا صفرٌ كاذب)',
  cpanel.ringLbl === 'تغطية اليوم' && cpanel.pct === (HOL ? '—' : '25%'), cpanel.pct);
check('★ تذييلُ الحلقة بمفردات النظافة',
  cpanel.foot.join('|') === 'مستحقّة الآن|مهام نشطة|نُفِّذت اليوم', cpanel.foot.join(' | '));
check('★ حالةُ المباني تَعدّ المهامَّ المستحقّة لا البلاغات',
  cpanel.blds.length === 17 &&
  new RegExp('^' + (HOL ? 0 : 2)).test(cpanel.blds[0]) &&
  new RegExp('^' + (HOL ? 0 : 1)).test(cpanel.blds[1]) && /^0/.test(cpanel.blds[2]),
  cpanel.blds.join(' | '));
const bldFit = await page.evaluate(() => {
  const g = document.getElementById('tvl-proj-blds');
  const gb = g.getBoundingClientRect();
  const bad = Array.from(g.querySelectorAll('.tvw-bld')).filter(b => {
    const r = b.getBoundingClientRect();
    return r.bottom > gb.bottom + 1 || r.top < gb.top - 1;
  });
  return { total: g.querySelectorAll('.tvw-bld').length, bad: bad.length, h: Math.round(gb.height) };
});
check('★ لا بطاقةَ مبنًى مقصوصةً خارج شبكتها (١٧ مبنى)',
  bldFit.total === 17 && bldFit.bad === 0, JSON.stringify(bldFit));

/* v18.9an: الفحصُ الذي أمسك الشكوى — **اسمُ المبنى نفسُه** كان يُقصّ داخل بطاقته
   (أربعةُ أعمدةٍ ضيّقةٍ ورقمٌ ضخمٌ يلتهم الارتفاع). القياسُ على الاسم لا على البطاقة. */
const nameFit = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('#tvl-proj-blds .tvw-bld')).map(b => {
    const n = b.querySelector('.bname'), r = n.getBoundingClientRect(), br = b.getBoundingClientRect();
    return { t: n.textContent.trim(), cut: n.scrollHeight - n.clientHeight > 1 || n.scrollWidth - n.clientWidth > 1,
             out: r.bottom > br.bottom + 1 || r.width < 30, title: b.getAttribute('title') || '' };
  });
  return { n: rows.length, cut: rows.filter(r => r.cut || r.out).map(r => r.t),
           titled: rows.every(r => r.title.length > 0),
           w: Math.round(rows[0] ? document.querySelector('#tvl-proj-blds .bname').getBoundingClientRect().width : 0) };
});
check('★ an: اسمُ كلِّ مبنًى ظاهرٌ كاملاً في بطاقته (لا قصَّ أفقيٍّ ولا رأسي)',
  nameFit.n === 17 && nameFit.cut.length === 0 && nameFit.titled,
  nameFit.cut.length ? nameFit.cut.join(' | ') : `١٧ اسماً · عرضُ الاسم ${nameFit.w}px`);
// اسمٌ عربيٌّ طويلٌ حقيقيّ — أقسى من أسماء الفحص القصيرة
const longFit = await page.evaluate(() => {
  const b = document.querySelector('#tvl-proj-blds .tvw-bld .bname');
  const old = b.textContent;
  b.textContent = 'الوحدة المركزية والنظم الجغرافية';
  const cut = b.scrollHeight - b.clientHeight > 1 || b.scrollWidth - b.clientWidth > 1;
  const r = { cut, h: Math.round(b.getBoundingClientRect().height), sh: b.scrollHeight };
  b.textContent = old; return r;
});
check('★ an: اسمٌ من ٣٢ حرفاً يظهر كاملاً (سطران في صفٍّ عريض)',
  !longFit.cut, JSON.stringify(longFit));

check('★ شريطُ اللوحة بمقاييس النظافة لا البلاغات',
  cpanel.totals.includes('جدول اليوم') && cpanel.totals.includes('تغطية اليوم') && !cpanel.totals.includes('بلاغات الشهر'),
  cpanel.totals.slice(0, 90));
await page.screenshot({ path: `${SHOTS}/wall-cleaning.png` });
await page.evaluate(() => _tvwallShowScreen(0));
await page.waitForTimeout(400);

/* ═══ التدوير التلقائي (v18.9ai) ═══ */
const rot = await page.evaluate(() => ({
  screens: _tvwall.screens.map(s => s.pid),
  idx: _tvwall.idx, on: _tvwall.rotOn, timer: !!_tvwall.rotTimer,
  dots: document.querySelectorAll('#tvl-rot-dots button').length
}));
const cardOrder = await page.evaluate(() => Array.from(document.querySelectorAll('#tvl-grid .tvl-card'))
  .map(c => (c.getAttribute('onclick') || '').replace(/^.*tvwallOpenProject\('|'\).*$/g, '')));
check('★ الشاشات: «الكل» ثم لوحةٌ لكل مشروع بترتيب البطاقات',
  rot.screens[0] === null && rot.screens.slice(1).join() === cardOrder.join() && rot.dots === 5,
  JSON.stringify(rot.screens));
check('★ التدوير يبدأ تلقائياً من شاشة «الكل»', rot.idx === 0 && rot.on === true && rot.timer === true);

// انتقالٌ يدويٌّ إلى لوحة المشروع الأول (النقطة الثانية) — نفس ما يفعله التدوير
await page.click('#tvl-rot-dots button:nth-child(2)');
await page.waitForTimeout(900);
const panel = await page.evaluate(() => {
  const p = document.getElementById('tvl-screen-proj');
  const kpis = Array.from(document.querySelectorAll('#tvl-proj-kpis .kv')).map(e => e.textContent.trim());
  return {
    allHidden: document.getElementById('tvl-screen-all').style.display === 'none',
    shown: p.style.display !== 'none',
    health: p.getAttribute('data-health'),
    name: (document.getElementById('tvl-proj-name').textContent || '').trim(),
    word: (document.getElementById('tvl-proj-bword').textContent || '').trim(),
    pct: (document.getElementById('tvl-proj-bpct').textContent || '').trim(),
    prog: (document.getElementById('tvl-proj-prog').textContent || '').trim(),
    wait: (document.getElementById('tvl-proj-wait').textContent || '').trim(),
    done: (document.getElementById('tvl-proj-done').textContent || '').trim(),
    kpis, blds: document.querySelectorAll('#tvl-proj-blds .tvw-bld').length,
    totals: (document.getElementById('tvl-totals').textContent || '').replace(/\s+/g, ' ').trim()
  };
});
check('★ لوحةُ المشروع ظهرت وشاشةُ «الكل» اختفت', panel.shown && panel.allHidden);
check('★ اللوحة تحمل اسم المشروع وحالتَه', panel.name === 'مشروع حائل' && panel.health === 'crit' && panel.word === 'حرِج',
  `${panel.name} · ${panel.health} · ${panel.word}`);
// الرقمُ الثالث يُقارَن بما تحسبه الدالة نفسها — لا برقمٍ ثابتٍ يكسره تبدّلُ اليوم أثناء التشغيل
const newTodayHail = await page.evaluate(() => _tvwallCalc('hail').newToday);
check('★ نبض التشغيل: ٣ متأخرة · ٤ نشطة · بلاغات اليوم',
  panel.kpis.join() === `3,4,${newTodayHail}`, panel.kpis.join(' | '));
check('★ حالة التشغيل: قيد التنفيذ ١ · في الانتظار ٣ · أُغلقت اليوم ١',
  panel.prog === '1' && panel.wait === '3' && panel.done === '1', `${panel.prog}/${panel.wait}/${panel.done}`);
check('★ حلقةُ الجاهزية تعرض إنجاز بلاغات الشهر', /%$/.test(panel.pct), panel.pct);

/* v18.9am: الحلقةُ كانت تُلوَّن بلون الصحّة، فيُرسم إنجازُ ٩٤٪ أحمرَ — لونٌ يقول
   «سيّئ» ورقمٌ يقول «ممتاز». الفحصُ يقيس اللونَ المحسوب فعلاً لا قاعدةَ CSS. */
// الحلقةُ لها `transition: stroke .5s` — فالقراءةُ فور التغيير تُرجع اللونَ السابق.
const readTone = () => page.evaluate(() => {
  const g = n => getComputedStyle(document.getElementById(n));
  const m = _tvwallCalc('hail');
  return { rate: m.rate, overdue: m.overdue,
    ring: g('tvl-proj-ring').stroke, pct: g('tvl-proj-bpct').color, word: g('tvl-proj-bword').color,
    why: (document.getElementById('tvl-proj-bwhy').textContent || '').trim() };
});
const tone = await readTone();
// نفس اللوحة بإنجازٍ عالٍ: النبرةُ وحدَها تتغيّر والكلمةُ تبقى بلون الصحّة
await page.evaluate(() => document.querySelector('#tvl-screen-proj .tvw-beacon')
  .style.setProperty('--rate', tvRateTone(94).c));
await page.waitForTimeout(900);
tone.high = await readTone();
await page.evaluate(() => document.querySelector('#tvl-screen-proj .tvw-beacon')
  .style.setProperty('--rate', tvRateTone(_tvwallCalc('hail').rate).c));
await page.waitForTimeout(900);
const RED = 'rgb(240, 67, 90)', GREEN = 'rgb(45, 212, 106)';
check('★ am: كلمةُ الحالة حمراءُ (٣ متأخرة) بينما الحلقةُ تتبع الإنجاز لا التأخّر',
  tone.word === RED && tone.high.ring === GREEN && tone.high.word === RED,
  `word=${tone.word} ring@94%=${tone.high.ring}`);
check('★ am: النسبةُ المنخفضةُ (١٧٪) تُرسم حمراءَ بنبرتها هي لا بلون الصحّة',
  tone.rate < 75 && tone.ring === RED && tone.pct === RED, `rate=${tone.rate}% ring=${tone.ring}`);
check('★ am: سببُ الكلمة مكتوبٌ تحتها فلا تُقرأ حكماً على النسبة',
  /^3 متأخرة عن SLA$/.test(tone.why), tone.why);
// والمنحنى يَعدّ نفسَ سكّان البلاطات: نافذةُ ١٤ يوماً تحتوي الشهرَ فلا تنقص عنه
const contain = await page.evaluate(() => {
  const m = _tvwallCalc('hail'), t = _tvwallTrend([_tvwall.data['hail']]);
  return { o: t.openedN, c: t.closedN, mn: m.monthN, mc: m.monthClosed,
           arch: (_tvwall.data['hail'] || []).filter(x => x.archived).length };
});
check('★ am: وارِدُ المنحنى ≥ بلاغات الشهر رغم وجود مؤرشف (سكّانٌ واحدون)',
  contain.arch >= 1 && contain.o >= contain.mn && contain.c >= contain.mc,
  `وارد=${contain.o} الشهر=${contain.mn} مؤرشف=${contain.arch}`);
check('★ حالة المباني معروضة (من إعدادات المشروع)', panel.blds >= 1, panel.blds + ' مبنى');
check('★ الشريط العلوي تحوّل لمقاييس المشروع (لا إجماليَّ تراكمي)',
  panel.totals.includes('بلاغات الأسبوع') && panel.totals.includes('متوسط زمن الإغلاق') && !panel.totals.includes('إجمالي البلاغات'),
  panel.totals.slice(0, 100));
await page.screenshot({ path: `${SHOTS}/wall-project.png` });

/* ═══ شريطُ التحليلات (v18.9al) — الرسومُ تُرسم فعلاً وتقول ما تقوله البلاطات ═══ */
const anaP = await page.evaluate(() => {
  const el = document.getElementById('tvl-ana-proj');
  const cards = Array.from(el.querySelectorAll('.tvl-ch'));
  const tr = _tvwallTrend([_tvwall.data['hail']]);
  return {
    n: cards.length,
    titles: cards.map(c => (c.querySelector('.t').textContent || '').trim()),
    leg: (cards[0].querySelector('.tvl-ch-leg').textContent || '').replace(/\s+/g, ' ').trim(),
    trend: { o: tr.openedN, c: tr.closedN, days: tr.days.length },
    xs: Array.from(cards[0].querySelectorAll('.tvl-ch-x span')).map(s => s.textContent.trim()),
    xdir: getComputedStyle(cards[0].querySelector('.tvl-ch-x')).direction,
    paths: cards[0].querySelectorAll('svg path').length,
    sla: (cards[1].querySelector('.sl').textContent || '').replace(/\s+/g, ' ').trim(),
    slaSegs: cards[1].querySelectorAll('.tk i').length,
    types: Array.from(cards[2].querySelectorAll('.tvl-hb .r')).map(r => (r.textContent || '').replace(/\s+/g, ' ').trim())
  };
});
check('★ al: لوحةُ المشروع تحمل ثلاثةَ رسومٍ (اتّجاه · التزام · أنواع)',
  anaP.n === 3 && /حركةُ البلاغات/.test(anaP.titles[0]) && /التزامُ/.test(anaP.titles[1]) && /أنواع الأعمال/.test(anaP.titles[2]),
  anaP.titles.join(' | '));
check('★ al: مجاميعُ المنحنى في وسيلة الإيضاح = ما تحسبه _tvwallTrend',
  new RegExp('وارد\\s*' + anaP.trend.o).test(anaP.leg) && new RegExp('مغلق\\s*' + anaP.trend.c).test(anaP.leg) && anaP.trend.days === 14,
  anaP.leg);
check('★ al: المنحنى مسارانِ ومساحةٌ واحدةٌ على محورٍ واحد', anaP.paths === 3, anaP.paths + ' مسار');
check('★ al: محورُ الزمن ltr والأقدمُ يساراً (وإلا قُرئ الرسمُ معكوساً)',
  anaP.xdir === 'ltr' && anaP.xs.length === 3 && anaP.xs[0] !== anaP.xs[2], anaP.xs.join(' → '));
// ٣ متأخرة من ٤ نشطة ⇒ تجاوز٣ ومهلةٌ سليمةٌ للرابع؛ والقطعةُ الصفريةُ مسمّاةٌ ولا تُرسم
check('★ al: توزيعُ الالتزام يطابق نبضَ التشغيل (٣ تجاوز من ٤ نشطة)',
  /تجاوز\s*3/.test(anaP.sla) && /داخل الوقت\s*1/.test(anaP.sla) && anaP.slaSegs === 2,
  anaP.sla + ' · قطع=' + anaP.slaSegs);
check('★ al: أنواعُ الأعمال تُعدّ البلاغات النشطة وحدها (٤ كهرباء)',
  anaP.types.length === 1 && /كهرباء/.test(anaP.types[0]) && /4/.test(anaP.types[0]), anaP.types.join(' | '));

// لوحةُ النظافة: رسومٌ بلغةِ نوعها — لا منحنى بلاغاتٍ لا تُنشأ
const anaC = await page.evaluate(() => {
  const i = _tvwall.screens.findIndex(s => s.pid === 'clean1');
  _tvwallShowScreen(i);
  const cards = Array.from(document.querySelectorAll('#tvl-ana-proj .tvl-ch'));
  return { titles: cards.map(c => (c.querySelector('.t').textContent || '').trim()),
           cov: Array.from(cards[0].querySelectorAll('.tvl-hb .r')).map(r => (r.textContent || '').replace(/\s+/g, ' ').trim()),
           cols: Array.from(cards[1].querySelectorAll('.tvl-cb .c')).map(c => (c.textContent || '').replace(/\s+/g, ' ').trim()) };
});
check('★ al: لوحةُ النظافة برسومِ المهام لا برسومِ البلاغات',
  anaC.titles.every(t => !/بلاغ/.test(t)) && /أضعفُ المباني تغطيةً/.test(anaC.titles[0]) &&
  /شرائحُ تأخّر المهام/.test(anaC.titles[1]), anaC.titles.join(' | '));
check('★ al: تغطيةُ المبنى تعرض النسبةَ ومقامَها (لا نسبةً مجرّدة)',
  anaC.cov.length >= 1 && /%/.test(anaC.cov[0]) && /\d+\/\d+/.test(anaC.cov[0]), anaC.cov.join(' | '));
// K-1 متأخّرة ٣ أيام و K-2 يوماً ⇒ «يوم واحد»=١ و«حتى ٣»=١ (والمديات بلا شَرطةٍ تُقلب)
check('★ al: شرائحُ التأخّر أربعٌ مرتّبةٌ بمُسمّياتٍ لا تُقلب في العربية',
  anaC.cols.length === 4 && anaC.cols.every(c => !/\d-\d|[٠-٩]-[٠-٩]/.test(c)) &&
  /يوم واحد/.test(anaC.cols[0]) && /أكثر من/.test(anaC.cols[3]), anaC.cols.join(' | '));
await page.evaluate(() => _tvwallShowScreen(0));
await page.waitForTimeout(500);
const anaA = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('#tvl-ana-all .tvl-ch'));
  const press = cards.find(c => /ضغطُ العمل/.test(c.querySelector('.t').textContent));
  return { n: cards.length, titles: cards.map(c => (c.querySelector('.t').textContent || '').trim()),
           rows: press ? Array.from(press.querySelectorAll('.r')).map(r => ({
             l: (r.querySelector('.n').textContent || '').trim(),
             v: (r.querySelector('.v').textContent || '').replace(/\s+/g, ' ').trim(),
             w: Array.from(r.querySelectorAll('.tk i')).map(i => i.style.width)
           })) : [] };
});
check('★ al: شاشةُ «الكل» تحمل شريطَ تحليلاتٍ بأربع بطاقاتٍ حدّاً أقصى',
  anaA.n >= 3 && anaA.n <= 4 && anaA.titles.some(t => /ضغطُ العمل حسب المشروع/.test(t)),
  anaA.titles.join(' | '));
check('★ al: ضغطُ العمل مرتّبٌ الأكثرَ أولاً بمقامٍ واحدٍ لكل الصفوف',
  anaA.rows.length >= 2 && parseInt(anaA.rows[0].v) >= parseInt(anaA.rows[1].v) &&
  Math.abs(anaA.rows[0].w.reduce((a, w) => a + parseFloat(w), 0) - 100) < 0.6 &&
  Math.abs(anaA.rows[1].w.reduce((a, w) => a + parseFloat(w), 0)
           - parseInt(anaA.rows[1].v) / parseInt(anaA.rows[0].v) * 100) < 0.6,
  anaA.rows.map(r => `${r.l}=${r.v}[${r.w.join('+')}]`).join(' | '));
/* v18.9am: مقارنةُ «٨٣ مهمّة» بـ«١١ بلاغاً» على مقامٍ واحدٍ تقول «ضغطُه سبعةُ
   أضعافه» — ولا معنى لها. لكلِّ وحدةٍ مقامُها، والوحدةُ مكتوبةٌ في القيمة. */
const mixed = anaA.rows.filter(r => /مهمة/.test(r.v));
check('★ am: البلاغاتُ والمهامُّ لا تُقاسان على مقامٍ واحد، والوحدةُ مكتوبة',
  anaA.rows.every(r => /^\d+ (بلاغ|مهمة)$/.test(r.v)) &&
  anaA.rows.filter(r => /بلاغ/.test(r.v)).every((r, i, a) => i === 0 || parseInt(a[i - 1].v) >= parseInt(r.v)) &&
  mixed.length === 1 && Math.abs(mixed[0].w.reduce((a, w) => a + parseFloat(w), 0) - 100) < 0.6 &&
  anaA.rows.findIndex(r => /مهمة/.test(r.v)) === anaA.rows.length - 1,
  anaA.rows.map(r => `${r.v}[${r.w.join('+')}]`).join(' | '));

/* أخطرُ ما في شريطٍ يُضاف تحت لوحةٍ ممتلئة: يقضم ارتفاعَ ما فوقه فتُقصّ تسمياتُه
   بلا أثرٍ في أيّ رقم. الفحصُ هندسيٌّ على ثلاثة ارتفاعاتٍ حقيقية. */
const fitRows = [];
for (const [w, h] of [[1920, 1080], [1600, 950], [1365, 768]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(500);
  for (const scr of [0, 1]) {
    await page.evaluate(i => _tvwallShowScreen(i), scr);
    await page.waitForTimeout(400);
    fitRows.push(await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll('#tvwall-screen .tvl-ch, #tvwall-screen .tvw-kpi, #tvwall-screen .tvw-beacon')
        .forEach(e => { if (e.scrollHeight - e.clientHeight > 1) bad.push((e.textContent || '').trim().slice(0, 14)); });
      const root = document.querySelector('.tvl-root');
      return { bad, scroll: root.scrollHeight - innerHeight };
    }));
  }
}
await page.setViewportSize({ width: 1600, height: 950 });
await page.waitForTimeout(500);
check('★ al: لا مقطعَ مقصوصٌ ولا تمرير على ١٠٨٠ و٩٥٠ و٧٦٨ (الشريط لا يقضم ما فوقه)',
  fitRows.every(r => r.bad.length === 0 && r.scroll <= 1),
  JSON.stringify(fitRows.filter(r => r.bad.length || r.scroll > 1)).slice(0, 160) || 'كلها سليمة');
await page.evaluate(() => _tvwallShowScreen(1));
await page.waitForTimeout(400);

// الرجوع لشاشة «الكل» يعيد المجاميع
await page.click('#tvl-rot-dots button:nth-child(1)');
await page.waitForTimeout(700);
check('★ العودة لـ«الكل» تُعيد شريط المجاميع',
  await page.evaluate(() => (document.getElementById('tvl-totals').textContent || '').includes('المشاريع')));

// زرّ إيقاف التدوير
await page.click('#tvl-rot-btn');
await page.waitForTimeout(400);
check('★ زرّ الإيقاف يوقف المؤقّت ويغيّر نصّه',
  await page.evaluate(() => !_tvwall.rotOn && !_tvwall.rotTimer &&
    document.getElementById('tvl-rot-btn').textContent.includes('تشغيل')));
await page.click('#tvl-rot-btn');
await page.waitForTimeout(400);
check('★ الاستئناف يعيد المؤقّت', await page.evaluate(() => _tvwall.rotOn && !!_tvwall.rotTimer));

// التدوير الفعلي: خفّض الزمن وتأكّد أنه ينتقل وحده
const advanced = await page.evaluate(async () => {
  const start = _tvwall.idx;
  clearInterval(_tvwall.rotTimer);
  _tvwall.rotTimer = setInterval(() => _tvwallShowScreen(_tvwall.idx + 1), 300);
  await new Promise(r => setTimeout(r, 1100));
  const moved = _tvwall.idx !== start;
  clearInterval(_tvwall.rotTimer); _tvwallRotRestart();
  return moved;
});
check('★ التدوير ينتقل بين الشاشات وحده', advanced === true);
await page.evaluate(() => _tvwallShowScreen(0));

// الرجوع للبوّابة
await page.click('#tvwall-screen .tvl-btn.back');
await page.waitForTimeout(800);
check('★ «رجوع» يعيد بوّابة المشاريع',
  (await page.isVisible('#project-screen').catch(() => false)) && !(await page.isVisible('#tvwall-screen').catch(() => false)));
check('★ المستمعون بقوا حيّين بعد الإغلاق (لا فكّ/تركيب متكرّر)',
  (await page.evaluate(() => Object.keys(_tvwall.subs).length)) === 3);

// إعادة الفتح ثم فتح مشروعٍ من بطاقته
await page.click('#tvwall-btn-wrap button');
await page.waitForTimeout(1500);
await page.click('#tvl-grid .tvl-card');
await page.waitForTimeout(4500);
const opened = await page.evaluate(() => ({
  proj: (typeof CURRENT_PROJECT !== 'undefined' && CURRENT_PROJECT) ? CURRENT_PROJECT.id : null,
  tickets: typeof tickets !== 'undefined' ? tickets.length : -1,
  wallHidden: document.getElementById('tvwall-screen').classList.contains('hidden')
}));
check('★ النقر على البطاقة فتح مشروعها فعلاً', opened.proj === 'hail' && opened.wallHidden, JSON.stringify(opened));
check('★ بيانات المشروع حُمِّلت (٦ بلاغات لحائل)', opened.tickets === 6, opened.tickets + ' بلاغ');

// زرّ القائمة الجانبية داخل التطبيق
check('★ زرّ المركز ظاهر في القائمة الجانبية داخل المشروع',
  await page.evaluate(() => { const b = document.getElementById('nav-tvwall-btn'); return !!b && b.style.display !== 'none'; }));
const navIco = await page.evaluate(() => {
  const i = document.querySelector('#nav-tvwall-btn .s-icon');
  const sv = i && i.querySelector('svg');
  const r = sv ? sv.getBoundingClientRect() : { width: 0, height: 0 };
  return { w: Math.round(r.width), h: Math.round(r.height),
           emoji: /[\u{1F300}-\u{1FAFF}]/u.test((i && i.textContent) || '') };
});
check('★ أيقونةُ المركز في القائمة svg مرسومةٌ بأبعادٍ حقيقية (لا إيموجي)',
  !navIco.emoji && navIco.w >= 12 && navIco.h >= 12, JSON.stringify(navIco));
await page.evaluate(() => openTVWall('app'));
await page.waitForTimeout(1500);
check('★ المركز يُفتح من داخل التطبيق', await page.isVisible('#tvwall-screen').catch(() => false));
check('★ المركز لم يلمس المشروع المفتوح',
  await page.evaluate(() => CURRENT_PROJECT && CURRENT_PROJECT.id === 'hail' && tickets.length === 6));
await page.evaluate(() => closeTVWall());
await page.waitForTimeout(600);
check('★ «رجوع» من داخل التطبيق لا يعيد البوّابة',
  !(await page.isVisible('#project-screen').catch(() => false)) && !(await page.isVisible('#tvwall-screen').catch(() => false)));
await page.screenshot({ path: `${SHOTS}/app-after.png` });

check('✨ لا أخطاء جافاسكربت', errors.length === 0, errors.slice(0, 3).join(' | '));

L(`\n${fail === 0 ? '✅' : '❌'} ${pass}/${pass + fail} فحصاً ناجحاً — اللقطات: ${SHOTS}\n`);
await browser.close();
process.exit(fail ? 1 : 0);
