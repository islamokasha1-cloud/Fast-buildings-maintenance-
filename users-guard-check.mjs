/* ══════════════════════════════════════════════════════════════════════
   حرّاسُ شاشة «إدارة المستخدمين» — **تنفيذاً في متصفّحٍ حقيقيّ** (البند C1).

   الفجوةُ التي يسدّها: قفلُ C1 على الخادم منع غيرَ الأدمن من كتابة الحسابات،
   فتَبِعته الواجهةُ بحارسٍ وقائمةٍ للاطّلاع. **لكنّ رحلةَ المتصفّح تدخل أدمن دائماً**
   — فالمسارُ غيرُ الأدمن لم يُرسَم في متصفّحٍ قطّ، وهو المسارُ الذي غيّرناه.
   وحارسُ `hail-tests` يطابق نصَّ الكود لا سلوكَه: يُثبت أنّ السطرَ مكتوب، لا أنّ
   الزرَّ اختفى ولا أنّ الدالّةَ ترفض.

   وهذا الفحصُ **يدخل بدورَين** ويسأل الشاشةَ نفسَها:
     • المستودعاتُ ترى القائمةَ بلا أزرارٍ ولا نموذجِ إضافة، والكتّاب يرفضون.
     • والأدمن يرى كلَّ شيءٍ ويكتب — فالقفلُ حراسةٌ لا تعطيل.

   Firestore وهميّ في الذاكرة (نفس مُحاكي browser-scenarios.mjs) — لا يلمس الإنتاج.
     node users-guard-check.mjs
   ══════════════════════════════════════════════════════════════════════ */
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const REPO = process.env.REPO_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname));
const SHOTS = process.env.SHOTS_DIR || '/tmp/users-shots';
fs.mkdirSync(SHOTS, { recursive: true });

/* مُحاكي Firebase — مصدرٌ واحدٌ مع بقية فحوص المتصفّح */
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

/** يفتح التطبيق ويُصادِق بدورٍ معيّن (باعتراض خادم الدخول — لا كلمات مرور حقيقية) */
async function openAs(role, name) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(MOCK_FIREBASE);
  await page.addInitScript(CDN_STUBS);
  const errors = [];
  const IGNORE = /ServiceWorkerRegistration|net::ERR_FAILED|Failed to load resource|ERR_BLOCKED|reCAPTCHA|AppCheck/i;
  page.on('pageerror', e => { const m = String(e.message).slice(0, 200); if (!IGNORE.test(m)) errors.push(m); });
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.includes('workers.dev/login')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ token: 'tkn', profile: { user: role, name, role } })
      });
    }
    if (/^https?:/.test(u)) return route.abort();
    return route.continue();
  });
  await page.goto('file://' + REPO + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2200);
  await page.fill('#login-user', role);
  await page.fill('#login-pass', 'x'.repeat(10));
  await page.click('.login-btn');
  await page.waitForTimeout(2200);
  /* البذرةُ تُزرع في **المخزن** لا في مصفوفةٍ محلّيةٍ فحسب (درسُ NOTES §5):
     `renderPurchaseUsersList` تُعيد قراءةَ المستخدمين من Firestore قبل الرسم،
     فالمصفوفةُ المحلّيةُ وحدَها تُمحى قبل أن تُرى. */
  await page.evaluate(async () => {
    const seed = [
      { user: 'boss',  name: 'المالك',        role: 'admin' },
      { user: 'wh',    name: 'أمين المستودع', role: 'warehouse_manager' },
      { user: 'proc',  name: 'المشتريات',     role: 'procurement_officer' }
    ];
    window.USERS = seed.slice();
    try { await db.doc(USERS_DOC()).set({ users: seed }); } catch (e) {}
  });
  await page.evaluate(() => { if (typeof showPage === 'function') showPage('purchase-users'); });
  await page.waitForTimeout(1500);
  return { page, errors };
}

L('\n══════════════════════════════════════════════════════════');
L('  حرّاسُ شاشة إدارة المستخدمين (C1) — متصفّحٌ حقيقيّ');
L('══════════════════════════════════════════════════════════');

/* ═════════ ١) بدورٍ غيرِ أدمن — قائمةٌ للاطّلاع ═════════ */
L('\n=== ١) مسؤولُ المستودعات — يرى ولا يغيّر ===');
{
  const { page, errors } = await openAs('warehouse_manager', 'أمين المستودع');
  await page.screenshot({ path: `${SHOTS}/01-wh-users.png` });

  const html = (await page.innerHTML('#pu-users-list').catch(() => '')) || '';
  check('★ الشاشةُ رُسمت بلا خطأ جافاسكربت', errors.length === 0, errors[0] || '');
  check('★ القائمةُ ظاهرةٌ فعلاً (لم نُخفِ الشاشةَ بل الأزرار)',
    html.includes('أمين المستودع') && html.includes('المشتريات'));
  check('★★ ولا زرَّ صلاحياتٍ ولا كلمةِ مرورٍ ولا حذف',
    !/openEditUserPerms\(/.test(html) && !/puChangePassword\(/.test(html) && !/puDeleteUser\(/.test(html));
  check('★★ ولا حقلَ رقمِ واتساب ولا زرَّ حفظِه', !/pu-user-phone-/.test(html) && !/puSaveUserWa\(/.test(html));
  check('★ وشريطُ «للاطّلاع فقط» ظاهر', /للاطّلاع فقط/.test(html));

  const formHidden = await page.evaluate(() => {
    const f = document.getElementById('pu-add-form');
    return !f || f.style.display === 'none' || f.offsetParent === null;
  });
  check('★★ ونموذجُ «إضافة مستخدم جديد» مُخفًى', formHidden);

  /* ★★★ والحارسُ في الدالّة نفسِها — لا في الشاشة وحدَها. النداءُ المباشرُ من
     الـConsole يتخطّى إخفاءَ الأزرار، فيُسأل: أرفضت الدالّةُ أم عدّلت محلّياً؟ */
  const guarded = await page.evaluate(async () => {
    const before = JSON.stringify(window.USERS);
    const out = {};
    for (const fn of ['puAddUser', 'puDeleteUser', 'puSavePassword', 'puSaveUserWa', 'saveUserPerms']) {
      try { await window[fn](1); } catch (e) { /* الحارسُ يعود بلا رمي */ }
      out[fn] = JSON.stringify(window.USERS) === before;   // لم تتغيّر القائمةُ محلّياً
    }
    out._exists = typeof window._adminOnlyUsersGuard === 'function';
    return out;
  });
  check('★★★ ونداءُ الكتّاب مباشرةً من الـConsole لا يغيّر شيئاً (الحارسُ في الدالّة)',
    guarded._exists && ['puAddUser', 'puDeleteUser', 'puSavePassword', 'puSaveUserWa', 'saveUserPerms']
      .every(f => guarded[f]),
    Object.entries(guarded).filter(([k, v]) => k !== '_exists' && !v).map(([k]) => k).join(' '));
  await page.close();
}

/* ═════════ ٢) بدور أدمن — كلُّ شيءٍ يعمل ═════════ */
L('\n=== ٢) الأدمن — القفلُ حراسةٌ لا تعطيل ===');
{
  const { page, errors } = await openAs('admin', 'المالك');
  await page.screenshot({ path: `${SHOTS}/02-admin-users.png` });

  const html = (await page.innerHTML('#pu-users-list').catch(() => '')) || '';
  check('★ الشاشةُ رُسمت بلا خطأ جافاسكربت', errors.length === 0, errors[0] || '');
  check('★★ والأزرارُ الثلاثةُ حاضرة',
    /openEditUserPerms\(/.test(html) && /puChangePassword\(/.test(html) && /puDeleteUser\(/.test(html));
  check('★★ وحقلُ واتساب وزرُّ حفظِه حاضران',
    /pu-user-phone-/.test(html) && /puSaveUserWa\(/.test(html));
  check('★ ولا شريطَ «للاطّلاع فقط»', !/للاطّلاع فقط/.test(html));

  const formShown = await page.evaluate(() => {
    const f = document.getElementById('pu-add-form');
    return !!f && f.style.display !== 'none';
  });
  check('★★ ونموذجُ الإضافة ظاهرٌ للأدمن', formShown);

  const allowed = await page.evaluate(() => typeof window._canManageUsers === 'function' && window._canManageUsers());
  check('★★ والحارسُ يسمح للأدمن (وإلا عطّلنا مَن يملك الصلاحية)', allowed);
  await page.close();
}

await browser.close();
L('\n' + '═'.repeat(58));
L(fail ? `❌ ${fail} فشلت من ${pass + fail}` : `✅ ${pass}/${pass} — شاشةُ المستخدمين محروسةٌ تنفيذاً بدورَين`);
L(`   اللقطات: ${SHOTS}`);
L('═'.repeat(58) + '\n');
process.exit(fail ? 1 : 0);
