// فحصُ السطح العام — الضابطُ الذي يجعل استخراجَ وحدةٍ من `index.html` **مُثبَتاً** لا مرجوّاً.
//
//   node global-surface-check.mjs snapshot /tmp/before.json      ← قبل النقل
//   node global-surface-check.mjs snapshot /tmp/after.json       ← بعده
//   node global-surface-check.mjs diff /tmp/before.json /tmp/after.json --expect-added operationsWall
//
// وللمقارنة بفرعٍ آخر بدل «قبل/بعد»: REPO_DIR=/path/to/worktree node … snapshot …
//
// ── المشكلة التي بُني لها ──
// هذا التطبيقُ بلا bundler وبلا وحدات ES: **كلُّ وسوم <script> الكلاسيكية تتشارك
// النطاقَ العام نفسَه**، وفي `index.html` مئاتُ سماتِ `onclick` تستدعي دوالَّ بالاسم.
// فنقلُ كتلةٍ إلى ملفٍّ آخر قد يُسقط اسماً من النطاق — ولا مترجمَ ولا فاحصَ أنواعٍ
// يُنذر. النتيجةُ **زرٌّ ميتٌ بصمت**، يكتشفه مستخدمٌ لا اختبار.
//
// ── لماذا شقّان لا شقٌّ واحد ──
// (١) **خصائصُ `window`** — تلتقط دوالَّ `function` العليا (تصير خصائصَ للنافذة).
// (٢) **الأسماءُ المعجمية** — `let`/`const` العليا **لا تصير خصائصَ للنافذة** إطلاقاً.
//     فلو اكتُفي بالشقّ الأول، مرّ فقدانُ ثابتٍ أو كائنِ حالةٍ **بلا أن تراه اللقطة**.
//     تُفحص بـ`typeof` لكل اسمٍ مُعلَنٍ نصياً في المشروع (ولا يرمي على غير المعلَن).
//
// وتُطرح خصائصُ المتصفّح بمقارنتها بنافذةِ `iframe` نظيفةٍ — فلا يُحسب اختلافُ إصدارِ
// Chromium فرقاً في التطبيق.
//
// ── القراءة الصحيحة للنتيجة ──
// **المطلوبُ من نقلٍ حرفيّ: مفقود = صفر.** أمّا المضافُ فقد يكون مشروعاً (وحدةٌ تُعرّض
// واجهتها) — ويُعلَن سلفاً بـ`--expect-added` فيصير توقّعاً مكتوباً لا مفاجأةً تُبرَّر
// بعد وقوعها. وأيُّ فرقٍ غيرِ مُعلَنٍ يُسقط الفحص.

import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const REPO = process.env.REPO_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname));
const [MODE, ...REST] = process.argv.slice(2);

const usage = () => {
  console.error('الاستعمال:\n' +
    '  node global-surface-check.mjs snapshot <out.json>\n' +
    '  node global-surface-check.mjs diff <before.json> <after.json> [--expect-added a,b] [--expect-removed x,y]');
  process.exit(2);
};

/* ══════════════════════════════ اللقطة ══════════════════════════════ */
async function snapshot(out) {
  if (!out) usage();

  const bsrc = fs.readFileSync(path.join(REPO, 'browser-scenarios.mjs'), 'utf8');
  const a = bsrc.indexOf('const MOCK_FIREBASE = `');
  const s = bsrc.indexOf('`', a) + 1, e = bsrc.indexOf('`;', s);
  const MOCK_FIREBASE = bsrc.slice(s, e);
  if (!MOCK_FIREBASE.includes('window.__store')) { console.error('تعذّر استخراج مُحاكي Firebase'); process.exit(1); }

  // مكتبات الـCDN غير متاحة بلا شبكة — بدائل صامتة حتى لا تُنسَب أخطاؤها للتطبيق.
  const CDN_STUBS = `
    window.Chart = function(){ return { destroy(){}, update(){}, resize(){}, data:{}, options:{} }; };
    window.Chart.register = function(){}; window.Chart.defaults = { font:{} };
    window.XLSX = { utils:{ book_new:()=>({}), json_to_sheet:()=>({}), book_append_sheet(){}, aoa_to_sheet:()=>({}) }, writeFile(){}, write(){} };
    window.PptxGenJS = function(){ return { addSlide:()=>({ addText(){}, addImage(){}, addTable(){} }), writeFile(){ return Promise.resolve(); } }; };
  `;

  // الأسماءُ المُعلَنة على المستوى الأعلى — تُستخرج نصياً من `index.html` وكلِّ وحدةٍ
  // محلّية. المجموعةُ تُقرأ من **الملفّات مجتمعةً**، فنقلُ اسمٍ بينها لا يغيّرها.
  const names = new Set();
  const scan = src => {
    for (const line of src.split('\n')) {
      let m = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(line);
      if (m) { names.add(m[1]); continue; }
      m = /^(?:let|const|var)\s+([A-Za-z_$][\w$]*)/.exec(line);
      if (m) names.add(m[1]);
    }
  };
  scan(fs.readFileSync(path.join(REPO, 'index.html'), 'utf8'));
  for (const f of fs.readdirSync(REPO).filter(f => f.endsWith('.js') && !f.includes('hail-tests'))) {
    scan(fs.readFileSync(path.join(REPO, f), 'utf8'));
  }
  const NAMES = [...names].sort();

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  await page.addInitScript(MOCK_FIREBASE);
  await page.addInitScript(CDN_STUBS);

  const errors = [];
  const IGNORE = /ServiceWorkerRegistration|net::ERR_FAILED|Failed to load resource|ERR_BLOCKED|reCAPTCHA|AppCheck/i;
  const note = t => { const m = String(t).slice(0, 220); if (!IGNORE.test(m)) errors.push(m); };
  page.on('pageerror', e => note(e.message));
  page.on('console', m => { if (m.type() === 'error') note(m.text()); });

  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.includes('workers.dev/login')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ token: 'tkn', profile: { user: 'admin', name: 'المسؤول', role: 'admin' } }) });
    }
    if (/^https?:/.test(u)) return route.abort();
    return route.continue();
  });

  await page.goto('file://' + REPO + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);

  const snap = await page.evaluate(names => {
    // خصائصُ المتصفّح تُطرح بمقارنةٍ بنافذةِ iframe نظيفة
    const fr = document.createElement('iframe');
    fr.style.display = 'none';
    document.body.appendChild(fr);
    const native = new Set(Object.getOwnPropertyNames(fr.contentWindow));
    fr.remove();
    const winProps = Object.getOwnPropertyNames(window)
      .filter(k => !native.has(k))
      .map(k => k + ':' + (typeof window[k]))
      .sort();
    // typeof لا يرمي على غيرِ المعلَن، ويرمي على TDZ فيُلتقط
    const lexical = names.map(n => {
      let t; try { t = eval('typeof ' + n); } catch (e) { t = 'TDZ/ERR'; }
      return n + ':' + t;
    }).sort();
    return { winProps, lexical };
  }, NAMES);

  fs.writeFileSync(out, JSON.stringify({ repo: REPO, winProps: snap.winProps, lexical: snap.lexical, errors }, null, 1));
  console.log(`  المصدر:            ${REPO}`);
  console.log(`  خصائص window:      ${snap.winProps.length}`);
  console.log(`  أسماء معجمية:      ${snap.lexical.length}`);
  console.log(`  أخطاء جافاسكربت:   ${errors.length}`);
  errors.slice(0, 8).forEach(e => console.log('     ❌', e));
  console.log(`  كُتبت إلى: ${out}`);
  await browser.close();
  return errors.length === 0 ? 0 : 1;
}

/* ══════════════════════════════ المقارنة ══════════════════════════════ */
function diff(beforeF, afterF, argv) {
  if (!beforeF || !afterF) usage();
  const listOf = flag => {
    const i = argv.indexOf(flag);
    return i < 0 ? [] : String(argv[i + 1] || '').split(',').map(x => x.trim()).filter(Boolean);
  };
  const expAdded = listOf('--expect-added');
  const expRemoved = listOf('--expect-removed');
  const b = JSON.parse(fs.readFileSync(beforeF, 'utf8'));
  const a = JSON.parse(fs.readFileSync(afterF, 'utf8'));

  // المقارنةُ بالاسم لا بـ«اسم:نوع» — فتغيُّرُ النوع يُبلَّغ عنه صراحةً لا كفقدٍ وإضافة
  const bare = s => s.slice(0, s.lastIndexOf(':'));
  // القائمةُ تُقصَّر: عطلُ اللفِّ في IIFE يُسقط عشراتِ الأسماء دفعةً واحدة، وجدارُ
  // النصّ يُخفي الحكمَ بدل أن يُظهره. العددُ كاملٌ دائماً، والأمثلةُ تكفي للتشخيص.
  const CAP = 12;
  const show = xs => xs.length <= CAP
    ? JSON.stringify(xs)
    : JSON.stringify(xs.slice(0, CAP)).replace(/]$/, '') + ` … و${xs.length - CAP} غيرها]`;
  let bad = 0;

  for (const [key, label] of [['winProps', 'خصائص window'], ['lexical', 'الأسماء المعجمية']]) {
    const B = new Map(b[key].map(x => [bare(x), x]));
    const A = new Map(a[key].map(x => [bare(x), x]));
    const lost = [...B.keys()].filter(k => !A.has(k)).sort();
    const gained = [...A.keys()].filter(k => !B.has(k)).sort();
    const retyped = [...B.keys()].filter(k => A.has(k) && A.get(k) !== B.get(k))
      .map(k => `${B.get(k)} ← ${A.get(k)}`).sort();

    const unexpLost = lost.filter(n => !expRemoved.includes(n));
    const unexpGained = gained.filter(n => !expAdded.includes(n));

    console.log(`\n── ${label}: قبل ${B.size} · بعد ${A.size}`);
    console.log(`   مفقود:      ${lost.length}${lost.length ? '  ' + show(lost) : '  ✅'}`);
    console.log(`   مضاف:       ${gained.length}${gained.length ? '  ' + show(gained) : '  ✅'}`);
    if (retyped.length) console.log(`   تغيّر نوعُه: ${retyped.length}  ${show(retyped)}`);

    if (unexpLost.length) { bad++; console.log(`   ❌ فقدٌ غيرُ مُعلَن: ${show(unexpLost)}`); }
    if (unexpGained.length) { bad++; console.log(`   ❌ إضافةٌ غيرُ مُعلَنة: ${show(unexpGained)} — أعلِنها بـ--expect-added إن كانت مقصودة`); }
    if (retyped.length) { bad++; console.log(`   ❌ اسمٌ بقي ونوعُه تبدّل — ليس نقلاً حرفياً`); }
  }

  const errDelta = (a.errors || []).length - (b.errors || []).length;
  console.log(`\n── أخطاء جافاسكربت: قبل ${(b.errors || []).length} · بعد ${(a.errors || []).length}`);
  if (errDelta > 0) { bad++; console.log(`   ❌ أخطاءٌ جديدة:\n     ` + (a.errors || []).slice(0, 8).join('\n     ')); }

  // الأسماءُ المُعلَنة التي لم تتحقّق: توقّعٌ لم يقع = وصفٌ لا يطابق ما جرى
  const stillThere = expAdded.filter(n => b[ 'winProps' ].concat(b['lexical']).some(x => bare(x) === n));
  if (stillThere.length) console.log(`\n⚠️  --expect-added يذكر أسماءً كانت موجودةً قبلاً: ${JSON.stringify(stillThere)}`);

  console.log(bad === 0
    ? '\n✅ السطحُ العام سليم — لا فقدَ ولا إضافةً غيرَ مُعلَنة ولا خطأً جديداً.'
    : `\n❌ ${bad} اختلافاً غيرَ مقبول — لا تدفع قبل تفسيره.`);
  return bad === 0 ? 0 : 1;
}

/* ══════════════════════════════ التوجيه ══════════════════════════════ */
let code = 2;
if (MODE === 'snapshot') code = await snapshot(REST[0]);
else if (MODE === 'diff') code = diff(REST[0], REST[1], process.argv);
else usage();
process.exit(code);
