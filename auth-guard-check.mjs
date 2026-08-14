// auth-guard-check.mjs — حرّاسُ المصادقة في متصفّحٍ حقيقيّ (المجموعة ٣).
//   node auth-guard-check.mjs      (يحتاج Chromium — كبقية فحوص المتصفّح)
//
// العهدُ المحروس شِقّان:
//   H2 — الدورُ يُشتقّ من **توكِن Firebase** لا من `sessionStorage`. الجلسةُ سطرُ نصٍّ
//        يحرّره أيُّ أحدٍ من الـConsole؛ والتوكِنُ موقَّعٌ من الخادم. فمن يكتب
//        `role:"admin"` في الجلسة ويُحدّث الصفحة يجب أن **يبقى بدوره الحقيقي**.
//   H3 — نداءُ مُرحِّل الذكاء يحمل هويّةً يمكن التحقّقُ منها خادمياً، **ولا يسقط**
//        إن كان الـWorker لم يُحدَّث بعد (ترتيبُ النشر لا يُعطّل المستخدمين).
//
// ملاحظة: الفحصُ يقرأ الحالةَ من داخل الصفحة بعد إقلاعٍ حقيقيّ — لا مطابقةَ نصوص.

import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const REPO = '/home/user/Fast-buildings-maintenance-';
const SHOTS = '/tmp/auth-shots';
fs.mkdirSync(SHOTS, { recursive: true });

const bsrc = fs.readFileSync(path.join(REPO, 'browser-scenarios.mjs'), 'utf8');
const _a = bsrc.indexOf('const MOCK_FIREBASE = `');
const _s = bsrc.indexOf('`', _a) + 1, _e = bsrc.indexOf('`;', _s);
const MOCK_FIREBASE = bsrc.slice(_s, _e);

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

// يفتح صفحةً جديدةً بجلسةٍ محفوظةٍ وحمولةِ claims مُحدَّدتين، ثمّ يُقلع التطبيق.
async function boot({ sessionRole, claimRole, project = true }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(MOCK_FIREBASE);
  await page.addInitScript(CDN_STUBS);
  await page.addInitScript(({ sessionRole, claimRole, project }) => {
    window.__authClaims = claimRole ? { role: claimRole } : {};
    try {
      if (sessionRole !== null) {
        sessionStorage.setItem('hail_session', JSON.stringify({
          user: 'omar', name: 'عمر', role: sessionRole
        }));
        if (project) sessionStorage.setItem('hail_project', JSON.stringify({ id: 'hail', name: 'حائل' }));
      }
    } catch (e) {}
  }, { sessionRole, claimRole, project });

  const errors = [];
  const IGNORE = /ServiceWorkerRegistration|net::ERR_FAILED|Failed to load resource|ERR_BLOCKED|reCAPTCHA|AppCheck/i;
  page.on('pageerror', e => { const m = String(e.message).slice(0, 200); if (!IGNORE.test(m)) errors.push(m); });

  await page.route('**/*', route => {
    const u = route.request().url();
    if (/^https?:/.test(u)) return route.abort();
    return route.continue();
  });

  await page.goto('file://' + REPO + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3500);
  return { page, errors };
}

L('\n════════ حرّاسُ المصادقة (H2 · H3) ════════');

// ── ١) العبثُ بالجلسة: «admin» في الجلسة و«observer» في التوكِن ──
L('\n=== ١) الدورُ من التوكِن لا من الجلسة (H2) ===');
{
  const { page, errors } = await boot({ sessionRole: 'admin', claimRole: 'observer' });
  const st = await page.evaluate(() => ({
    role: (typeof currentUser!=='undefined' && currentUser) ? (currentUser.role||null) : null,
    user: (typeof currentUser!=='undefined' && currentUser) ? (currentUser.user||null) : null,
    savedRole: (() => { try { return JSON.parse(sessionStorage.getItem('hail_session') || 'null')?.role; } catch (e) { return '?'; } })(),
    loginVisible: !document.getElementById('login-screen')?.classList.contains('hidden')
  }));
  check('★★ جلسةٌ مُزوَّرةٌ بـadmin وتوكِنٌ بـobserver ⇒ الدورُ الفعليُّ observer',
    st.role === 'observer', 'الدور المُطبَّق: ' + st.role);
  check('★ ولا تُفتح لوحةُ الأدمن (isAdmin كاذبة)',
    await page.evaluate(() => !(window.isAdmin && window.isAdmin())));
  check('★ والهويّةُ لم تُمسّ (المستخدم كما هو)', st.user === 'omar', 'user=' + st.user);
  check('✨ لا أخطاء جافاسكربت', errors.length === 0, errors[0] || '');
  await page.screenshot({ path: SHOTS + '/tampered-session.png' }).catch(() => {});
  await page.close();
}

// ── ٢) الحالةُ الشرعية: الجلسةُ والتوكِن متطابقان ⇒ لا أثرَ يراه المستخدم ──
L('\n=== ٢) المستخدمُ الشرعيُّ لا يتأثّر ===');
{
  const { page, errors } = await boot({ sessionRole: 'admin', claimRole: 'admin' });
  check('★★ توكِنُ admin وجلسةُ admin ⇒ يدخل أدمناً كما كان',
    await page.evaluate(() => (typeof currentUser!=='undefined' && currentUser && currentUser.role==='admin') && !!(window.isAdmin && window.isAdmin())));
  check('✨ لا أخطاء جافاسكربت', errors.length === 0, errors[0] || '');
  await page.close();
}
{
  const { page } = await boot({ sessionRole: 'warehouse_manager', claimRole: 'warehouse_manager' });
  check('★ ودورٌ غيرُ الأدمن يُستعاد كما هو (لا تصعيدَ ولا تخفيض)',
    await page.evaluate(() => (typeof currentUser!=='undefined' && currentUser && currentUser.role==='warehouse_manager')));
  await page.close();
}

// ── ٣) توكِنٌ بلا دور ⇒ لا استعادةَ أصلاً (السلوكُ القائم — لم يُكسَر) ──
L('\n=== ٣) توكِنٌ بلا دور ⇒ دخولٌ جديد ===');
{
  const { page } = await boot({ sessionRole: 'admin', claimRole: null });
  const st = await page.evaluate(() => ({
    role: (typeof currentUser!=='undefined' && currentUser) ? (currentUser.role||null) : null,
    cleared: !sessionStorage.getItem('hail_session')
  }));
  check('★★ جلسةٌ بـadmin وتوكِنٌ بلا دور ⇒ لا مستخدمَ مُستعاداً', st.role === null, 'currentUser.role=' + st.role);
  check('★ والجلسةُ المحفوظةُ تُمحى فلا تُعاد المحاولةُ بها', st.cleared === true);
  await page.close();
}

// ── ٤) مُرحِّلُ الذكاء يحمل هويّةً — ولا يسقط إن لم يُحدَّث الـWorker (H3) ──
L('\n=== ٤) مُرحِّلُ الذكاء: هويّةٌ مُرفَقةٌ وسقوطٌ آمن (H3) ===');
{
  const { page } = await boot({ sessionRole: 'admin', claimRole: 'admin' });

  // (أ) الـWorker محدَّث: الترويسةُ تصل ومحاولةٌ واحدة
  const okCase = await page.evaluate(async () => {
    const seen = [];
    window.fetch = async (url, opt) => { seen.push(opt.headers.Authorization || null); return { ok: true, clone: () => ({ json: async () => ({}) }) }; };
    _ANTHROPIC_PROXY_URL = 'https://w/';
    await _callAnthropicAPI(null, { model: 'm', messages: [] }, null, 'test');
    return seen;
  });
  check('★★ النداءُ يحمل توكِنَ الهويّة (Bearer) — لا سرَّ مشتركاً',
    okCase.length === 1 && /^Bearer .+/.test(okCase[0] || ''), JSON.stringify(okCase));

  // (ب) Worker قديم يردّ الترويسة (CORS): يجب أن ينجح النداءُ بعد سقوطٍ آمن
  const corsCase = await page.evaluate(async () => {
    const seen = [];
    _aiAuthHeaderOk = true;
    window.fetch = async (url, opt) => {
      const auth = opt.headers.Authorization || null;
      seen.push(auth);
      if (auth) throw new TypeError('Failed to fetch');
      return { ok: true, clone: () => ({ json: async () => ({}) }) };
    };
    _ANTHROPIC_PROXY_URL = 'https://w/';
    const res = await _callAnthropicAPI(null, { model: 'm', messages: [] }, null, 'test');
    return { seen, ok: !!(res && res.ok) };
  });
  check('★★ Workerٌ لم يُحدَّث بعد ⇒ إعادةٌ بلا ترويسةٍ والنداءُ ينجح (لا تعطيلَ للمستخدمين)',
    corsCase.ok === true && corsCase.seen.length === 2 && corsCase.seen[0] && !corsCase.seen[1],
    JSON.stringify(corsCase.seen.map(x => x ? 'Bearer' : 'بلا')));

  // (ج) المهلةُ الحقيقيةُ لا تُعاد — لا مضاعفةَ استهلاك
  const abortCase = await page.evaluate(async () => {
    const seen = [];
    _aiAuthHeaderOk = true;
    window.fetch = async (url, opt) => { seen.push(1); const e = new Error('x'); e.name = 'AbortError'; throw e; };
    _ANTHROPIC_PROXY_URL = 'https://w/';
    let name = null;
    try { await _callAnthropicAPI(null, { model: 'm', messages: [] }, null, 'test'); } catch (e) { name = e.name; }
    return { n: seen.length, name };
  });
  check('★ مهلةٌ حقيقيةٌ ⇒ محاولةٌ واحدةٌ فقط (AbortError يُمرَّر)',
    abortCase.n === 1 && abortCase.name === 'AbortError', JSON.stringify(abortCase));

  await page.close();
}

await browser.close();

L('\n' + '═'.repeat(58));
if (fail) { L(`❌ ${fail} فشل من ${pass + fail}`); L('   اللقطات: ' + SHOTS); process.exit(1); }
L(`✅ ${pass}/${pass} — حرّاسُ المصادقة مفحوصةٌ تنفيذاً في متصفّحٍ حقيقيّ`);
L('   اللقطات: ' + SHOTS);
L('═'.repeat(58));
