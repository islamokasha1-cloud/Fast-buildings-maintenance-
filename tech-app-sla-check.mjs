/* فحصُ متصفّحٍ لتطبيق الفنّيّ: محرّكُ SLA هو نفسُه محرّكُ النظام الرئيسيّ.
 *
 *   node tech-app-sla-check.mjs
 *
 * ── لماذا هذا الملفّ ──
 * لم يكن لـ`tech-app.html` **أيُّ فحصِ متصفّح**، وصار الآن يعتمد على وحدةٍ خارجية
 * (`sla-engine.js`). ووسمٌ لا يُحمَّل — مسارٌ خاطئ، أو ترتيبٌ متأخّرٌ عن السكربت
 * المضمَّن — يُنتج تطبيقاً **ميتاً بصمت** عند الفنّيّ: `slaOf is not defined` في
 * وحدة التحكّم وحدَها، ولا اختبارَ نصّيٍّ يراه. فحصُ المصدر يُثبت وجودَ الوسم، ولا
 * يُثبت أن المتصفّحَ نفّذه.
 *
 * وجوهرُ ما يُقاس هنا: **الحكمُ على البلاغ واحدٌ في التطبيقين.** كانت نسخةُ الفنّيّ
 * تقيس ساعاتٍ تقويميةً بلا ساعاتِ عملٍ ولا إجازات، فبلاغٌ «عادي» يظهر ملتزماً هنا
 * ومتأخّراً عند المدير. تُقارَن الأحكامُ بتشغيل المحرّكين في صفحتين حقيقيتين.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const bsrc = fs.readFileSync(path.join(REPO, 'browser-scenarios.mjs'), 'utf8');
const a = bsrc.indexOf('const MOCK_FIREBASE = `');
const s = bsrc.indexOf('`', a) + 1, e = bsrc.indexOf('`;', s);
const MOCK_FIREBASE = bsrc.slice(s, e);

let pass = 0, fail = 0;
const check = (n, ok, d) => { if (ok) { pass++; console.log('  ✅', n, d ? '— ' + d : ''); } else { fail++; console.log('  ❌', n, d ? '— ' + d : ''); } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const IGNORE = /ServiceWorkerRegistration|net::ERR_FAILED|Failed to load resource|ERR_BLOCKED|reCAPTCHA|AppCheck/i;

async function open(file) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  await page.addInitScript(MOCK_FIREBASE);
  page.on('pageerror', ev => { const m = String(ev.message).slice(0, 200); if (!IGNORE.test(m)) errors.push(m); });
  page.on('console', m => { if (m.type() === 'error') { const t = String(m.text()).slice(0, 200); if (!IGNORE.test(t)) errors.push(t); } });
  await page.route('**/*', r => /^https?:/.test(r.request().url()) ? r.abort() : r.continue());
  await page.goto('file://' + REPO + '/' + file, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1200);
  return { page, errors };
}

console.log('\n════════════════════════════════════════');
console.log('  تطبيقُ الفنّيّ — محرّكُ SLA مشتركٌ في متصفّحٍ حقيقيّ');
console.log('════════════════════════════════════════');

const T = await open('tech-app.html');
check('تطبيقُ الفنّيّ يُقلع بلا أخطاء جافاسكربت', T.errors.length === 0, T.errors[0] || '');
check('★★ محرّكُ SLA حُمِّل فعلاً في الصفحة (لا وسمٌ ميت)',
  await T.page.evaluate(() => typeof window.slaEngine === 'object' && !!window.slaEngine.build));

const NAMES = ['slaOf', 'isOverdue', 'getSLA', 'tierOf', 'slaBudgetLabel', 'responseH', 'clockStopMinutes'];
const missing = await T.page.evaluate(ns => ns.filter(n => typeof window[n] !== 'function'), NAMES);
check('★★ كلُّ ما يستدعيه تطبيقُ الفنّيّ معرَّفٌ وقتَ التشغيل', missing.length === 0, missing.join(','));

/* الحكمُ على بلاغاتٍ بعينها — يُنفَّذ في الصفحتين ويُقارَن */
const CASES = [
  { n: 'عادي بعد 20 ساعةَ جدار',      p: 'عادي 🟢 (48 ساعة)',        h: 20 },
  { n: 'عادي بإملاءٍ قديمٍ بلا إيموجي', p: 'عادي (48 ساعة)',           h: 20 },
  { n: 'حرج بعد 3 ساعات',             p: 'حرج 🔴 (2 ساعة)',          h: 3  },
  { n: 'روتيني بعد 200 ساعة',         p: 'روتيني 🔵 (صيانة دورية)',  h: 200 },
];
const verdicts = pg => pg.evaluate(cs => cs.map(c => {
  const t = { priority: c.p, status: 'مفتوح', createdAt: new Date(Date.now() - c.h * 3600e3).toISOString() };
  return { n: c.n, overdue: window.isOverdue(t), budget: window.slaBudgetLabel(c.p) };
}), CASES);

const vT = await verdicts(T.page);
const M = await open('index.html');
check('النظامُ الرئيسيُّ يُقلع بلا أخطاء جافاسكربت', M.errors.length === 0, M.errors[0] || '');
const vM = await verdicts(M.page);

for (let i = 0; i < CASES.length; i++) {
  check('★★ حكمٌ واحدٌ في التطبيقين — ' + vT[i].n,
    vT[i].overdue === vM[i].overdue && vT[i].budget === vM[i].budget,
    'فنّيّ: ' + vT[i].overdue + '/' + vT[i].budget + ' · مدير: ' + vM[i].overdue + '/' + vM[i].budget);
}
check('★ «عادي» لم يعد متأخّراً بعد 20 ساعةَ جدارٍ (16 ساعةَ عملٍ لا 48 تقويمية)', vT[0].overdue === false);
check('★ و«حرج» متأخّرٌ بعد 3 ساعات (مهلتُه ساعتان تقويميتان)', vT[2].overdue === true);
check('★ و«روتيني» لا يتأخّر أبداً (مخطَّطٌ في الوقائية لا مقيسٌ بمهلة)', vT[3].overdue === false);

await browser.close();
console.log('\n' + (fail ? '❌ ' + fail + ' فشل من ' + (pass + fail) : '✅ ' + pass + '/' + pass + ' فحصاً ناجحاً'));
process.exit(fail ? 1 : 0);
