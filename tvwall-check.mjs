// فحصُ جدار المشاريع (v18.9ag) في متصفّح Chromium حقيقي — Firestore وهميّ في الذاكرة
// (نفس مُحاكي browser-scenarios.mjs، مصدرٌ واحد) فلا يلمس الإنتاج إطلاقاً.
// يزرع ثلاثة مشاريع بحالاتٍ مختلفة ويتحقّق: الأرقام، والترتيب الأسوأ أولاً، وعزلَ
// الجدار عن المشروع المفتوح، وبقاءَ المستمعين، وفتحَ مشروعٍ من بطاقته.
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

L('\n═══ فحص جدار المشاريع ═══');
await page.fill('#login-user', 'admin'); await page.fill('#login-pass', 'Passw0rd!');
await page.click('.login-btn');
await page.waitForTimeout(4000);
check('الدخول نجح وظهرت بوّابة المشاريع', await page.isVisible('#project-screen').catch(() => false));
check('★ زرّ «جدار المشاريع» ظاهر في البوّابة', await page.isVisible('#tvwall-btn-wrap').catch(() => false),
  ((await page.textContent('#tvwall-count-badge').catch(() => '')) || '').trim());

await page.click('#tvwall-btn-wrap button');
await page.waitForTimeout(3000);
check('★ الجدار فُتح والبوّابة أُخفيت',
  (await page.isVisible('#tvwall-screen').catch(() => false)) && !(await page.isVisible('#project-screen').catch(() => false)));

const cards = await page.evaluate(() => Array.from(document.querySelectorAll('#tvl-grid .tvl-card')).map(c => ({
  cls: c.className, txt: (c.innerText || '').replace(/\s+/g, ' ').trim()
})));
check('★ ثلاث بطاقات — واحدةٌ لكل مشروع', cards.length === 3, cards.length + ' بطاقة');
check('★ الترتيب: الأسوأ أولاً (حائل الحرِج في الصدارة)',
  /crit/.test(cards[0]?.cls || '') && /مشروع حائل/.test(cards[0]?.txt || ''), (cards[0]?.txt || '').slice(0, 60));
check('★ الرياض «متابعة» والقصيم «مستقر»',
  /warn/.test(cards[1]?.cls || '') && /ok/.test(cards[2]?.cls || ''),
  (cards[1]?.txt || '').slice(0, 24) + ' | ' + (cards[2]?.txt || '').slice(0, 24));

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
check('★ زرّ الجدار ظاهر في القائمة الجانبية داخل المشروع',
  await page.evaluate(() => { const b = document.getElementById('nav-tvwall-btn'); return !!b && b.style.display !== 'none'; }));
await page.evaluate(() => openTVWall('app'));
await page.waitForTimeout(1500);
check('★ الجدار يُفتح من داخل التطبيق', await page.isVisible('#tvwall-screen').catch(() => false));
check('★ الجدار لم يلمس المشروع المفتوح',
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
