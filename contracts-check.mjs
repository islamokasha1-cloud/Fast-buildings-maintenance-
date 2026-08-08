// فحصُ متصفّحٍ لوحدة التعاقدات — Chromium حقيقيّ + Firestore وهميّ في الذاكرة
// (نفسُ مُحاكي browser-scenarios.mjs — لا يلمس الإنتاج إطلاقاً).
//   node contracts-check.mjs
//
// المرحلة ١: سجلُّ الأطراف — الحقنُ الذاتيُّ في القائمة، والدخولُ والنقرُ الفعليّان،
// و**الرقمُ المرسوم = الرقمُ المحسوب** (شريطُ الأرقام مقابل الدوالّ النقية)، والتطبيعُ
// العربيُّ في البحث، وشرائطُ الحالة من توكنز SLA، والثيمُ الداكن، والجوّالُ بلا قصّ.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const REPO = process.env.REPO_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname));
const SHOTS = process.env.SHOTS_DIR || '/tmp/ct-shots';
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
const check = (n, ok, d) => { if (ok) { pass++; console.log('  ✅', n, d ? '— ' + d : ''); } else { fail++; console.log('  ❌', n, d ? '— ' + d : ''); } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
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

check('الوحدة حُمِّلت وعرَّضت window.contracts', await page.evaluate(() => !!window.contracts));

// زرعُ أطرافٍ بحالات وثائقَ مختلفة + مشروع
await page.evaluate(() => {
  window.__store[PROJECTS_DOC] = { projects: [{ id: 'hail', name: 'مشروع حائل', desc: 'صيانة مبانٍ', icon: '' }] };
  const V = 'global_vendors';
  window.__store[V + '/VND-0001'] = {
    name: 'مؤسسة الأنوار للمقاولات', kind: 'subcontractor', status: 'active',
    legal: { crNumber: '1010234567', vatNumber: '300012345600003', nationalAddress: 'حائل — حي النقرة' },
    bank: { iban: 'SA0380000000608010167519', bankName: 'الأهلي' },
    docs: [{ type: 'cr', number: '1010234567', expiry: '2027-05-01' }, { type: 'vat', number: '3000123456', expiry: '2027-01-15' },
           { type: 'gosi', number: 'G-99', expiry: '2026-08-25' }],
    contacts: [{ name: 'خالد العتيبي', role: 'مدير المشاريع', phone: '0555000111' }]
  };
  window.__store[V + '/VND-0002'] = {
    name: 'شركة البناء الحديث', kind: 'both', status: 'active',
    legal: { crNumber: '4030998877' },
    docs: [{ type: 'cr', number: '4030998877', expiry: '2026-07-01' }, { type: 'zakat', number: 'Z-12', expiry: '2028-01-01' }]
  };
  window.__store[V + '/VND-0003'] = {
    name: 'مؤسسة الإتقان للتوريدات', kind: 'supplier', status: 'suspended', statusReason: 'تأخّر متكرّر في التوريد',
    legal: { crNumber: '1010777888' },
    docs: [{ type: 'cr', number: '1010777888', expiry: '2029-03-10' }]
  };
  window.__store[V + '/VND-0004'] = {
    name: 'ورشة الحرفي للألوميتال', kind: 'subcontractor', status: 'active',
    legal: { crNumber: '1128456' }, docs: []
  };
});

AUTH_OK = true;
await page.fill('#login-user', 'admin'); await page.fill('#login-pass', 'Passw0rd!');
await page.click('.login-btn');
await page.waitForTimeout(4000);
check('الدخول نجح', await page.evaluate(() => !!(typeof currentUser !== 'undefined' && currentUser && currentUser.role)));

await page.click('#global-purchases-btn-wrap button');
await page.waitForTimeout(2500);

// مجموعة القائمة الجانبية
check('مجموعة «التعاقدات» حُقنت في القائمة الجانبية', await page.evaluate(() => !!document.getElementById('hdr-grp-contracts')));
check('زرّ «سجل الأطراف» موجود', await page.evaluate(() => !!document.getElementById('nav-vendors-btn')));

// نقرٌ فعليّ
await page.click('#hdr-grp-contracts');
await page.waitForTimeout(400);
await page.click('#nav-vendors-btn');
await page.waitForTimeout(1800);

check('صفحة سجل الأطراف صارت النشطة', await page.evaluate(() => {
  const p = document.getElementById('page-vendors'); return !!p && p.classList.contains('active');
}));

const listTxt = await page.textContent('#page-vendors').catch(() => '');
check('الأطراف الأربعة معروضة', ['الأنوار', 'البناء الحديث', 'الإتقان', 'الحرفي'].every(n => listTxt.includes(n)));
const stats = await page.evaluate(() => Array.from(document.querySelectorAll('#page-vendors .ct-stat')).map(e => e.textContent.replace(/\s+/g, ' ').trim()));
check('شريط الأرقام يعرض العدّ والوثائق', stats.length === 3, stats.join(' | '));

// حسابُ ما نتوقّعه من الدوال النقية ومقارنتُه بالمرسوم — الرقم المرسوم = المحسوب
const expected = await page.evaluate(() => {
  const vs = window.contracts.vendors(), today = new Date();
  let expired = 0, soon = 0;
  vs.forEach(v => { const c = window.contracts._vendorComplianceState(v, today); expired += c.expired ? 1 : 0; soon += (!c.expired && c.soon) ? 1 : 0; });
  return { n: vs.length, expired, soon };
});
const drawn = await page.evaluate(() => Array.from(document.querySelectorAll('#page-vendors .ct-stat .v')).map(e => Number(e.textContent.trim())));
check('★ الرقم المرسوم = الرقم المحسوب (أطراف/منتهية/توشك)',
  drawn[0] === expected.n && drawn[1] === expected.expired && drawn[2] === expected.soon,
  `مرسوم ${drawn.join('/')} · محسوب ${expected.n}/${expected.expired}/${expected.soon}`);

const rails = await page.evaluate(() => Array.from(document.querySelectorAll('#page-vendors .ct-tile')).map(e => e.style.getPropertyValue('--rail')));
check('شرائط الحالة مضبوطة على توكنز SLA', rails.every(r => /var\(--sla-|var\(--muted\)/.test(r)), rails.join(' '));

await page.screenshot({ path: `${SHOTS}/01-vendors-list.png`, fullPage: true });

// البحث
await page.fill('#ct-v-q', 'الانوار');   // بلا همزة — اختبارُ التطبيع
await page.waitForTimeout(700);
const filtered = await page.evaluate(() => document.querySelectorAll('#page-vendors .ct-tile').length);
check('★ البحث يطابق رغم اختلاف الهمزة (تطبيع عربي)', filtered === 1, filtered + ' نتيجة');
await page.fill('#ct-v-q', '');
await page.waitForTimeout(600);

// فتحُ بطاقة طرف
await page.evaluate(() => window.contracts.openVendor('VND-0001'));
await page.waitForTimeout(1000);
const cardTxt = await page.textContent('#page-vendors').catch(() => '');
check('بطاقة الطرف فُتحت بوثائقها', cardTxt.includes('الوثائق وسريانها') && cardTxt.includes('البيانات البنكية'));
check('الآيبان ظاهرٌ كاملاً للأدمن', cardTxt.includes('SA0380000000608010167519'));
await page.screenshot({ path: `${SHOTS}/02-vendor-card.png`, fullPage: true });

// وضعُ التحرير
await page.evaluate(() => window.contracts.editVendor());
await page.waitForTimeout(900);
check('نموذج التحرير ظهر', await page.evaluate(() => !!document.getElementById('ct-f-name')));
await page.screenshot({ path: `${SHOTS}/03-vendor-edit.png`, fullPage: true });

// الوضع الداكن
await page.evaluate(() => window.contracts.cancelVendorEdit());
await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
await page.waitForTimeout(700);
await page.screenshot({ path: `${SHOTS}/04-vendor-card-dark.png`, fullPage: true });
await page.evaluate(() => window.contracts.backToVendors());
await page.waitForTimeout(600);
await page.screenshot({ path: `${SHOTS}/05-vendors-list-dark.png`, fullPage: true });
await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); });

// الجوال
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('★ لا تمرير أفقي على الجوال', overflow <= 1, 'زيادة ' + overflow + 'px');
await page.screenshot({ path: `${SHOTS}/06-vendors-mobile.png`, fullPage: true });

check('لا أخطاء جافاسكربت طوال الرحلة', errors.length === 0, errors.slice(0, 2).join(' | '));

console.log('\n' + '═'.repeat(58));
console.log(fail ? `❌ ${fail} فشلت من ${pass + fail}` : `✅ ${pass}/${pass} — فحص وحدة التعاقدات نجح`);
console.log('═'.repeat(58) + '\n');
await browser.close();
process.exit(fail ? 1 : 0);
