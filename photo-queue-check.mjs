// فحصُ تشغيلٍ حقيقيّ في Chromium لطابور الرفع المؤجَّل (v18.9aj) والمربّع الصريح.
// يُحاكي فشلَ الرفع فعلاً (Storage يرفض) ثم يتحقّق أن الصورة **لم تُحفَظ كرابطٍ
// محلّيّ** بل دخلت IndexedDB، وأنها تُرفَع وتُلحَق بالبلاغ عند عودة الخدمة.
//   node photo-queue-check.mjs
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const REPO = process.env.REPO_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname));
const bsrc = fs.readFileSync(path.join(REPO, 'browser-scenarios.mjs'), 'utf8');
const _a = bsrc.indexOf('const MOCK_FIREBASE = `');
const _s = bsrc.indexOf('`', _a) + 1, _e = bsrc.indexOf('`;', _s);
const MOCK_FIREBASE = bsrc.slice(_s, _e);

let pass = 0, fail = 0;
const check = (n, ok, d) => { if (ok) { pass++; console.log('  ✅', n, d ? '— ' + d : ''); } else { fail++; console.log('  ❌', n, d ? '— ' + d : ''); } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
// file:// لا يملك أصلاً صالحاً لـ IndexedDB في بعض الإعدادات — نخدم المجلّد عبر http.
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.addInitScript(MOCK_FIREBASE);
const errors = [];
const IGNORE = /ServiceWorkerRegistration|net::ERR_FAILED|Failed to load resource|ERR_BLOCKED|reCAPTCHA|AppCheck/i;
page.on('pageerror', e => { const m = String(e.message).slice(0, 200); if (!IGNORE.test(m)) errors.push(m); });
// أصلٌ حقيقيّ (http) لا file:// — IndexedDB يحتاج أصلاً صالحاً. نُلبّي الطلب محلياً
// بلا خادمٍ فعليّ، ونُجهض كل نداءٍ خارجيٍّ آخر (لا إنترنت في الفحص).
await page.route('**/*', r => {
  const u = r.request().url();
  if (u.startsWith('http://pq.test/')) return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><meta charset="utf-8"><title>pq</title><body></body>' });
  return /^https?:/.test(u) ? r.abort() : r.continue();
});
await page.goto('http://pq.test/');
await page.addScriptTag({ path: path.join(REPO, 'photo-queue.js') });

console.log('\n=== طابور الرفع المؤجَّل (v18.9aj) ===');
check('الوحدة تعرّض window.photoQueue', await page.evaluate(() => !!(window.photoQueue && typeof window.photoQueue.enqueue === 'function')));

const res = await page.evaluate(async () => {
  const out = {};
  // ── خادمٌ وهميّ: Storage يفشل أولاً ثم ينجح · Firestore يسجّل ما كُتب ──
  let failMode = true;
  const written = [];
  const fakeStorage = { ref(p){ return {
    put(){ return failMode ? Promise.reject(new Error('network')) : Promise.resolve({ ref:{ getDownloadURL:()=>Promise.resolve('https://cdn.test/'+p) } }); }
  }; } };
  const fakeDb = { collection(c){ return { doc(d){ return {
    set(patch){ written.push({ c, d, patch }); return Promise.resolve(); }
  }; } }; } };
  const fakeFb = { firestore: { FieldValue: { arrayUnion:(u)=>({ __arrayUnion:u }) } } };
  window.photoQueue.configure({ storage:fakeStorage, db:fakeDb, firebase:fakeFb });

  const blob = new Blob([new Uint8Array([1,2,3,4])], { type:'image/jpeg' });
  await window.photoQueue.enqueue({ blob, storagePath:'tickets/T-1/1.jpg', collection:'hail_tickets',
    docId:'T-1', field:'photos', mode:'arrayUnion', label:'T-1' });
  out.afterEnqueue = await window.photoQueue.count();

  // محاولةٌ والخدمةُ ما زالت فاشلة ⇒ يبقى العنصر (لا يضيع)
  const r1 = await window.photoQueue.flush();
  out.failFlush = r1;
  out.afterFail = await window.photoQueue.count();
  out.triesAfterFail = (await window.photoQueue.list())[0]?.tries;

  // الشبكة عادت ⇒ يُرفَع ويُلحَق بالوثيقة ثم يخرج من الطابور
  failMode = false;
  const r2 = await window.photoQueue.flush();
  out.okFlush = r2;
  out.afterOk = await window.photoQueue.count();
  out.written = written;

  // البقاء بعد إغلاق التبويب: نكتب عنصراً ونتركه لفحص إعادة التحميل
  await window.photoQueue.enqueue({ blob, storagePath:'tickets/T-2/1.jpg', collection:'hail_tickets',
    docId:'T-2', field:'ticketPhoto', mode:'set', label:'T-2' });
  out.persisted = await window.photoQueue.count();

  // إدراجٌ بلا جسمِ صورة يُرفض بدل إيهام المستخدم
  const bad = await window.photoQueue.enqueue({ storagePath:'x', collection:'c', docId:'d', field:'photos' });
  out.rejectedNoBlob = bad === null && (await window.photoQueue.count()) === 1;
  return out;
});

check('الإدراج يحفظ العنصر في IndexedDB', res.afterEnqueue === 1, 'عناصر=' + res.afterEnqueue);
check('★ فشلُ الرفع لا يُسقط الصورة — تبقى في الطابور', res.afterFail === 1 && res.failFlush.fail === 1, JSON.stringify(res.failFlush));
check('عدّاد المحاولات يتقدّم (للتشخيص لا للإسقاط)', res.triesAfterFail === 1, 'tries=' + res.triesAfterFail);
check('★ عند عودة الشبكة تُرفَع وتخرج من الطابور', res.okFlush.ok === 1 && res.afterOk === 0, JSON.stringify(res.okFlush) + ' باقٍ=' + res.afterOk);
check('★ الإلحاق بـ arrayUnion على الوثيقة (لا كتابةُ المصفوفة كاملة)',
  res.written.length === 1 && res.written[0].d === 'T-1' && !!res.written[0].patch.photos.__arrayUnion,
  JSON.stringify(res.written[0]));
check('الرابط الملحَق هو رابطُ Storage الدائم لا blob:',
  String(res.written[0].patch.photos.__arrayUnion).startsWith('https://'), res.written[0].patch.photos.__arrayUnion);
check('الإدراج بلا جسمِ صورة يُرفض', res.rejectedNoBlob === true);

// ── البقاء بعد إعادة التحميل (جوهرُ الفكرة: يبقى بعد إغلاق التبويب) ──
await page.reload();
await page.addScriptTag({ path: path.join(REPO, 'photo-queue.js') });
const survived = await page.evaluate(() => window.photoQueue.count());
check('★ الطابور ينجو من إعادة تحميل الصفحة (IndexedDB لا ذاكرة)', survived === 1, 'باقٍ=' + survived);

// ── المربّع الصريح بدل الصورة المكسورة ──
console.log('\n=== المربّع الصريح بدل الصورة المكسورة ===');
const imgBrokenSrc = (fs.readFileSync(path.join(REPO, 'index.html'), 'utf8')
  .match(/function imgBroken\(el\)\{[\s\S]*?\n\}/) || [])[0];
check('imgBroken مُستخرَجة من index.html', !!imgBrokenSrc);
const dom = await page.evaluate((src) => {
  (0, eval)(src);   // eval غير مباشر ⇒ نطاقٌ عامّ، فتُنشر الدالة على window
  document.body.innerHTML = '<div class="pr-photo-wrap"><img id="x" alt="صورة الإغلاق"><button class="pr-photo-del">x</button></div>';
  const img = document.getElementById('x');
  window.imgBroken(img);
  window.imgBroken(img);   // مرّتين: يجب ألّا يتكرّر المربّع
  const w = document.querySelector('.pr-photo-wrap');
  return { dead: w.classList.contains('photo-dead'), boxes: w.querySelectorAll('.img-missing').length,
    text: (w.querySelector('.img-missing') || {}).textContent || '', imgHidden: img.style.display === 'none' };
}, imgBrokenSrc);
check('★ الخانة تُوسَم photo-dead (فتُطوى عند الطباعة)', dom.dead === true);
check('★ يظهر نصٌّ صريحٌ بدل أيقونة المتصفّح', dom.text.includes('تعذّر تحميل الصورة'), dom.text);
check('الصورة المكسورة تُخفى', dom.imgHidden === true);
check('لا يتكرّر المربّع عند تكرار الاستدعاء', dom.boxes === 1, 'مربّعات=' + dom.boxes);
check('✨ لا أخطاء جافاسكربت', errors.length === 0, errors[0] || '');

console.log('\n════════════════════════════════════════');
console.log(fail === 0 ? `✅ ${pass}/${pass} فحصاً ناجحاً` : `❌ ${fail} فشلت من ${pass + fail}`);
console.log('════════════════════════════════════════');
await browser.close();
process.exit(fail === 0 ? 0 : 1);
