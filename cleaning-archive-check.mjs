// فحصُ تشغيلٍ حقيقيٍّ في Chromium لأرشيف النظافة الشهريّ (مرآةُ أرشيف بلاغات الصيانة).
// يزرع سجلَّ تنفيذٍ لشهرين، يفتح شاشة الأرشيف بنواة index.html، ويتحقّق من الـDOM
// الناتج ومن **الكتابة الفعلية** لملخّص الشهر في المخزن — لا من النصّ المصدري.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const REPO = process.env.REPO_DIR || '/home/user/Fast-buildings-maintenance-';
const bsrc = fs.readFileSync(path.join(REPO, 'browser-scenarios.mjs'), 'utf8');
const _a = bsrc.indexOf('const MOCK_FIREBASE = `');
const _s = bsrc.indexOf('`', _a) + 1, _e = bsrc.indexOf('`;', _s);
const MOCK_FIREBASE = bsrc.slice(_s, _e);

const CDN_STUBS = `
  window.Chart = function(){ return { destroy(){}, update(){}, resize(){}, data:{}, options:{} }; };
  window.Chart.register = function(){}; window.Chart.defaults = { font:{} };
  window.__xlsxFiles = [];
  window.XLSX = { utils:{ book_new:()=>({}), json_to_sheet:(r)=>({ __rows:r }), book_append_sheet(wb,ws){ wb.__ws=ws; }, aoa_to_sheet:()=>({}) },
                  writeFile(wb,name){ window.__xlsxFiles.push({ name, rows:(wb.__ws&&wb.__ws.__rows)||[] }); }, write(){} };
  window.PptxGenJS = function(){ return { addSlide:()=>({ addText(){}, addImage(){}, addTable(){} }), writeFile(){ return Promise.resolve(); } }; };
`;

let pass = 0, fail = 0;
const check = (n, ok, d) => { if (ok) { pass++; console.log('  ✅', n, d ? '— ' + d : ''); } else { fail++; console.log('  ❌', n, d ? '— ' + d : ''); } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.addInitScript(MOCK_FIREBASE);
await page.addInitScript(CDN_STUBS);
const errors = [];
const IGNORE = /ServiceWorkerRegistration|net::ERR_FAILED|Failed to load resource|ERR_BLOCKED|reCAPTCHA|AppCheck/i;
page.on('pageerror', e => { const m = String(e.message).slice(0, 200); if (!IGNORE.test(m)) errors.push(m); });
page.on('console', m => { if (m.type() !== 'error') return; const t = String(m.text()).slice(0, 200); if (!IGNORE.test(t)) errors.push(t); });
let AUTH_OK = false;
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
await page.evaluate(() => {
  window.__authClaims = { role: 'admin' };
  window.__store[PROJECTS_DOC] = { projects: [{ id: 'hail', name: 'مشروع النظافة', desc: 'نظافة', icon: '', type: 'cleaning' }] };
  window.__store[_meta('settings')] = { buildings: ['مبنى أ', 'مبنى ب'], supervisors: ['خالد'], workTypes: { 'نظافة الأرضيات': [] } };
});
AUTH_OK = true;
await page.fill('#login-user', 'admin'); await page.fill('#login-pass', 'Passw0rd!');
await page.click('.login-btn');
await page.waitForTimeout(4000);
await page.evaluate(async () => { await selectProject('hail'); });
await page.waitForTimeout(2500);

// ── زرعُ سجلّ التنفيذ: شهرٌ منصرمٌ (٥٠ تنفيذاً) + شهرُ اليوم (٦ تنفيذات) ──
const seed = await page.evaluate(() => {
  const col = CURRENT_PROJECT.id + '_cleaning_log' + (typeof IS_DEV !== 'undefined' && IS_DEV ? '_dev' : '');
  const now = new Date();
  const cur = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const pd = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prev = pd.getFullYear() + '-' + String(pd.getMonth() + 1).padStart(2, '0');
  let n = 0;
  // الشهرُ المنصرم: ٥٠ تنفيذاً على ١٠ أيام، مبنيان، نصفُها مصوَّر
  for (let d = 1; d <= 10; d++) for (let k = 0; k < 5; k++) {
    const ds = prev + '-' + String(d).padStart(2, '0');
    window.__store[col + '/p' + d + '_' + k] = {
      id: 'p' + d + '_' + k, taskId: 't' + (k % 3), taskName: 'مهمة ' + (k % 3),
      building: k % 2 ? 'مبنى أ' : 'مبنى ب', floor: 'الدور 1', workType: 'نظافة الأرضيات',
      supervisor: 'خالد', date: ds, at: ds + 'T08:0' + k + ':00Z', by: 'أحمد',
      doneItems: 3, totalItems: 4, photos: k % 2 ? ['ph' + d + k] : [], note: k === 0 ? 'ملاحظةُ تنفيذ' : ''
    }; n++;
  }
  // شهرُ اليوم: ٦ تنفيذات
  for (let k = 0; k < 6; k++) {
    const ds = cur + '-01';
    window.__store[col + '/c' + k] = {
      id: 'c' + k, taskId: 'tc', taskName: 'مهمة الشهر الجاري', building: 'مبنى أ', floor: '',
      workType: 'إدارة النفايات', supervisor: 'خالد', date: ds, at: ds + 'T09:0' + k + ':00Z',
      by: 'سالم', doneItems: 2, totalItems: 2, photos: [], note: ''
    };
  }
  return { col, cur, prev, seeded: n };
});
console.log(`\n=== أرشيف النظافة الشهريّ — ${seed.prev} (٥٠ تنفيذاً) + ${seed.cur} (٦) ===`);

check('الوحدة تعرّض دوالَّ الأرشيف النقيّة',
  await page.evaluate(() => !!(window.cleaningOps && typeof window.cleaningOps._computeCleanRollup === 'function'
    && typeof window.cleaningOps._archFilterRecs === 'function' && typeof window.cleaningOps.archSeal === 'function')));

// ── فتحُ الشاشة والتحوّلُ إلى الأرشيف ──
await page.evaluate(() => { showPage('cleaning-ops'); });
await page.waitForTimeout(1200);
check('زرُّ «الأرشيف الشهري» في رأس صفحة تشغيل النظافة',
  await page.evaluate(() => Array.from(document.querySelectorAll('#page-cleaning-ops .page-hero-actions .btn'))
    .some(b => /الأرشيف الشهري/.test(b.textContent))));

await page.evaluate(() => { cleaningOps.setView('archive'); });
await page.waitForTimeout(2000);

const view = await page.evaluate(() => {
  const root = document.getElementById('page-cleaning-ops');
  const chips = Array.from(root.querySelectorAll('.co-chips .co-chip')).map(b => b.textContent.replace(/\s+/g, ' ').trim());
  const tiles = Array.from(root.querySelectorAll('.co-tiles .stat-tile')).map(t => ({
    v: (t.querySelector('.st-val') || {}).textContent.trim(), l: (t.querySelector('.st-lbl') || {}).textContent.trim() }));
  return {
    chips,
    onChip: (root.querySelector('.co-chip.on') || {}).textContent || '',
    tiles,
    rows: root.querySelectorAll('#co-ar-list .co-logrow').length,
    count: (root.querySelector('#co-ar-list .co-sec-c') || {}).textContent.replace(/\s+/g, ' ').trim(),
    more: ((root.querySelector('#co-ar-list button') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    bldRows: root.querySelectorAll('.co-table tbody tr').length,
    filters: !!root.querySelector('#co-ar-q') && !!root.querySelector('#co-ar-b') && !!root.querySelector('#co-ar-w') && !!root.querySelector('#co-ar-s'),
    totals: Array.from(root.querySelectorAll('.co-sup-ms .co-sup-m')).map(m => (m.querySelector('.l') || {}).textContent.trim())
  };
});

check('★ شهرا الأرشيف يظهران — الأحدثُ أولاً والجاري موسومٌ «(جارٍ)»',
  view.chips.length === 2 && /\(جارٍ\)/.test(view.chips[0]) && /6$/.test(view.chips[0]) && /50$/.test(view.chips[1]),
  view.chips.join(' | '));
check('★ الشهرُ المنصرم خُتم تلقائياً ⟵ ملخّصٌ مكتوبٌ في المخزن بـ٥٠ تنفيذاً',
  await page.evaluate((prev) => {
    const k = CURRENT_PROJECT.id + '_cleaning_rollups' + (typeof IS_DEV !== 'undefined' && IS_DEV ? '_dev' : '') + '/' + prev;
    const r = window.__store[k];
    return !!r && r.runs === 50 && r.days === 10 && r.taskCount === 3 && r.withPhotos === 20;
  }, seed.prev), 'المفتاح: *_cleaning_rollups/' + seed.prev);
check('الشهرُ الجاري لا يُختم تلقائياً (لم ينتهِ بعد)',
  await page.evaluate((cur) => {
    const k = CURRENT_PROJECT.id + '_cleaning_rollups' + (typeof IS_DEV !== 'undefined' && IS_DEV ? '_dev' : '') + '/' + cur;
    return window.__store[k] === undefined;
  }, seed.cur));
check('الشهرُ المحدَّد افتراضياً هو الأحدث (الجاري)', /\(جارٍ\)/.test(view.onChip), view.onChip.replace(/\s+/g, ' ').trim());
check('بلاطاتُ الشهر الجاري: ٦ تنفيذات · يومُ عملٍ واحد · منطقةٌ واحدة',
  view.tiles.length === 6 && view.tiles[0].v === '6' && view.tiles[1].v === '1' && view.tiles[2].v === '1',
  view.tiles.map(t => t.v + ' ' + t.l).join(' · '));
check('قائمةُ التنفيذ ترسم ستّة سطور', view.rows === 6, 'سطور=' + view.rows);
check('شريطُ الفلاتر الأربعة موجود', view.filters);
check('جدولُ «تنفيذات الشهر حسب المنطقة» يرسم صفّاً للمنطقة', view.bldRows === 1, 'صفوف=' + view.bldRows);
check('شريطُ إجمالي الأرشيف من الملخّصات (لا من السجلّات)',
  view.totals.includes('شهراً مختوماً') && view.totals.includes('إجمالي التنفيذات'), view.totals.join(' · '));

// ── الشهرُ المنصرم: السقفُ معلَنٌ لا صامت ──
await page.evaluate((prev) => { cleaningOps.archSelect(prev); }, seed.prev);
await page.waitForTimeout(1500);
const prevView = await page.evaluate(() => {
  const root = document.getElementById('page-cleaning-ops');
  return {
    rows: root.querySelectorAll('#co-ar-list .co-logrow').length,
    count: (root.querySelector('#co-ar-list .co-sec-c') || {}).textContent.replace(/\s+/g, ' ').trim(),
    more: ((root.querySelector('#co-ar-list button') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    photos: root.querySelectorAll('#co-ar-list .co-logphotos img').length,
    bldRows: root.querySelectorAll('.co-table tbody tr').length
  };
});
check('★ ٥٠ تنفيذاً ⟵ ٤٠ سطراً معروضاً و«عرض المزيد» يُعلن العشرةَ الباقية',
  prevView.rows === 40 && /بقي 10/.test(prevView.more), `سطور=${prevView.rows} · ${prevView.more}`);
check('عدّادُ السطور يقول ٥٠ تنفيذاً', /50/.test(prevView.count), prevView.count);
check('صورُ التنفيذ تظهر في سطورها', prevView.photos >= 15, 'صور=' + prevView.photos);
check('جدولُ المناطق يرسم مبنيين للشهر المنصرم', prevView.bldRows === 2, 'صفوف=' + prevView.bldRows);

await page.evaluate(() => { cleaningOps.archMore(); });
await page.waitForTimeout(500);
check('★ «عرض المزيد» يُكمل الخمسين ويختفي',
  await page.evaluate(() => {
    const root = document.getElementById('page-cleaning-ops');
    return root.querySelectorAll('#co-ar-list .co-logrow').length === 50 && !root.querySelector('#co-ar-list button');
  }));

// ── الفلاتر: العدُّ والقائمةُ من مصدرٍ واحد ──
const filt = await page.evaluate(() => {
  const root = document.getElementById('page-cleaning-ops');
  root.querySelector('#co-ar-b').value = 'مبنى أ';        // ٢٠ من الخمسين
  cleaningOps.archFilter();
  const rows = root.querySelectorAll('#co-ar-list .co-logrow').length;
  const count = (root.querySelector('#co-ar-list .co-sec-c') || {}).textContent.replace(/\s+/g, ' ').trim();
  const focusKept = !!root.querySelector('#co-ar-b');
  root.querySelector('#co-ar-b').value = '';
  root.querySelector('#co-ar-q').value = 'ملاحظةُ تنفيذ';  // سطرٌ واحدٌ لكل يومٍ من العشرة
  cleaningOps.archFilter();
  const rows2 = root.querySelectorAll('#co-ar-list .co-logrow').length;
  return { rows, count, focusKept, rows2 };
});
check('★ فلترُ المنطقة يقصر القائمة على مبنى أ (٢٠ من ٥٠)', filt.rows === 20 && /20/.test(filt.count) && /50/.test(filt.count), `${filt.rows} · ${filt.count}`);
check('حقولُ الفلترة تبقى قائمةً (تحديثُ القائمة وحدَها لا الصفحة)', filt.focusKept);
check('★ البحثُ النصّيُّ يطابق الملاحظة (١٠ سطور: واحدٌ لكل يوم)', filt.rows2 === 10, 'سطور=' + filt.rows2);

check('مسحُ الفلاتر يعيد الخمسين',
  await page.evaluate(async () => { cleaningOps.archReset(); await new Promise(r => setTimeout(r, 600));
    return document.querySelectorAll('#page-cleaning-ops #co-ar-list .co-logrow').length === 40; }));

// ── التصدير: ما يُصدَّر هو ما يُرى بعد الفلاتر ──
const xl = await page.evaluate(async () => {
  const root = document.getElementById('page-cleaning-ops');
  root.querySelector('#co-ar-q').value = '';
  root.querySelector('#co-ar-b').value = 'مبنى ب';         // ٣٠ من الخمسين
  cleaningOps.archFilter();
  cleaningOps.archExport();
  await new Promise(r => setTimeout(r, 300));
  const f = window.__xlsxFiles[window.__xlsxFiles.length - 1] || {};
  return { name: f.name || '', n: (f.rows || []).length, cols: Object.keys((f.rows || [{}])[0] || {}) };
});
check('★ تصديرُ Excel يُصدّر الصفوفَ المعروضةَ بعد الفلاتر (٣٠ لا ٥٠)', xl.n === 30, 'صفوف=' + xl.n);
check('اسمُ الملف يحمل شهرَ الأرشيف', xl.name.indexOf(seed.prev) !== -1, xl.name);
check('أعمدةُ التصدير تشمل التاريخ والمنطقة وبنودَ الفحص',
  xl.cols.includes('التاريخ') && xl.cols.includes('المنطقة') && xl.cols.includes('بنودٌ منجزة'), xl.cols.join(' · '));

// ── الختمُ اليدويُّ للشهر الجاري (مرآةُ «أرشفة شهر يدوياً») ──
const sealed = await page.evaluate(async (cur) => {
  cleaningOps.archSelect(cur);
  await new Promise(r => setTimeout(r, 800));
  window.showConfirm = () => Promise.resolve(true);
  await cleaningOps.archSeal();
  await new Promise(r => setTimeout(r, 800));
  const k = CURRENT_PROJECT.id + '_cleaning_rollups' + (typeof IS_DEV !== 'undefined' && IS_DEV ? '_dev' : '') + '/' + cur;
  const r = window.__store[k] || {};
  return { runs: r.runs, days: r.days, by: r.sealedBy, at: !!r.sealedAt, fv: r.fv };
}, seed.cur);
check('★ الختمُ اليدويُّ يكتب ملخّصَ الشهر الجاري (٦ تنفيذات)', sealed.runs === 6 && sealed.days === 1, JSON.stringify(sealed));
check('الملخّصُ يحمل خاتمَه وصيغتَه', !!sealed.at && sealed.fv === 1, 'sealedBy=' + sealed.by);

check('✨ لا أخطاء جافاسكربت', errors.length === 0, errors[0] || '');

try { fs.mkdirSync('/tmp/ui-shots', { recursive: true }); } catch (e) {}
const el = await page.$('#page-cleaning-ops');
if (el) await el.screenshot({ path: '/tmp/ui-shots/cleaning-archive.png' }).catch(() => {});

console.log('\n════════════════════════════════════════');
console.log(fail === 0 ? `✅ ${pass}/${pass} فحصاً ناجحاً` : `❌ ${fail} فشلت من ${pass + fail}`);
console.log('════════════════════════════════════════');
await browser.close();
process.exit(fail === 0 ? 0 : 1);
