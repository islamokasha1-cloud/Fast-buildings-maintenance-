/* ══════════════════════════════════════════════════════════════════════════
   مِسبارُ أداءِ الدخول — كم يُنزَّل وكم يُشترَك فيه عند فتح المنصّة

   ── لماذا وُجد ──
   سُئل «لماذا تبطؤ المنصّة؟» فلم يكن في المستودع ما يجيب. والتخمينُ في الأداء
   أسوأُ من الصمت: يُصلَح ما لا يُكلّف ويبقى ما يُكلّف. فهذا الملفّ يقيس ثلاثة أشياء
   في متصفّحٍ حقيقيّ ويطبعها بأرقام:
     (١) ما يُشحن ويُفسَّر   — زمنُ الإقلاع وكلفةُ المعالج والذاكرة
     (٢) ما يُشترَك فيه      — كم مستمعاً حيّاً وكم جلبةً وكم مستنداً، **لكلّ مجموعة**
     (٣) مَن أطلق كلَّ نداء  — أثرُ الاستدعاء، فيُعرف المسؤولُ لا المجموعةُ فقط

   ── ⚠ الأرقامُ ليست زمنَ شبكة ──
   Firestore هنا مُحاكًى في الذاكرة. فما يُقاس هو **الانتشار**: عددُ الطلبات
   والمستندات — وهو ما تضربه الشبكةُ البطيئة. والأزمنةُ المطبوعة **حدٌّ أدنى**
   لا تقديرٌ لما يراه المستخدم على شبكةٍ حقيقيّة.

   ── وهو حارسٌ لا تقريرٌ فقط ──
   يسقط (exit 1) إن تجاوز الدخولُ الميزانيةَ أدناه. والرقمُ يُخفَّض بعد كل تحسين
   ويُرفَع **عن قصدٍ ومعه سببٌ مكتوب** — تماماً كسقف `IDX_CEILING` في `hail-tests`.
   فزيادةُ مستمعٍ أو جلبةٍ مكرّرةٍ لا تمرّ صامتة.

   ── البيانات المزروعة ثابتةٌ عمداً ──
   ٣٠٠ بلاغ · ١٢٠ طلب شراء · ٢٠٠ صنف · ٤٠٠ حركة مخزون. تغييرُها يُبطل مقارنةَ
   القياسات ببعضها، فإن غُيّرت فلتُغيَّر الميزانيةُ معها في القيد نفسِه.

   node perf-probe.mjs            # قياسٌ + حراسة
   node perf-probe.mjs --report   # قياسٌ بلا حراسة (لا يسقط)
   ══════════════════════════════════════════════════════════════════════════ */
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

/* ══ الميزانية ══ قِيست على v18.9.3048 بعد تخطّي مسحِ إقلاع البلاغات بعدَّينِ على الخادم
   (١٦٢٠ ⇐ ١٣٢٠ مستنداً · ١٠ ⇐ ٩ جلبات). خفِّضها بعد كل تحسين. ورفعُها يحتاج سطراً
   في §6 يقول ما الذي زاد ولماذا. */
const BUDGET_DOCS      = 1320;   // مستنداتٌ تُنزَّل عند الدخول
const BUDGET_LISTENERS = 21;     // مستمعون أحياءُ بعد الاستقرار
const BUDGET_GETS      = 9;      // جلباتٌ لمرّةٍ واحدة (العدُّ على الخادم لا يُحسب — لا يُنزِّل شيئاً)

const REPORT_ONLY = process.argv.includes('--report');
const REPO = process.env.REPO_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname));

/* المُحاكي مصدرُه `browser-scenarios.mjs` — مصدرٌ واحدٌ للحقيقة، فلا ينحرف
   سلوكُ القياس عن سلوك الفحوص. */
const bsrc = fs.readFileSync(path.join(REPO, 'browser-scenarios.mjs'), 'utf8');
const _a = bsrc.indexOf('const MOCK_FIREBASE = `');
const _s = bsrc.indexOf('`', _a) + 1, _e = bsrc.indexOf('`;', _s);
const MOCK_FIREBASE = bsrc.slice(_s, _e);
if (!MOCK_FIREBASE.includes('window.__store')) { console.error('تعذّر استخراج المُحاكي'); process.exit(1); }

const CDN_STUBS = `
  window.Chart = function(){ return { destroy(){}, update(){}, resize(){}, data:{}, options:{} }; };
  window.Chart.register = function(){}; window.Chart.defaults = { font:{} };
  window.XLSX = { utils:{ book_new:()=>({}), json_to_sheet:()=>({}), book_append_sheet(){}, aoa_to_sheet:()=>({}) }, writeFile(){}, write(){} };
`;

const L = (...a) => console.log(...a);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(MOCK_FIREBASE);
await page.addInitScript(CDN_STUBS);

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

L('\n══════════════════════════════════════════════════════');
L('  مِسبارُ أداءِ الدخول — ' + new Date().toISOString().slice(0, 16));
L('══════════════════════════════════════════════════════');

/* ── ما يُشحن: أحجامُ ما يُنزَّل فعلاً في كلّ زيارةٍ باردة ── */
const tags = [...new Set([...bsrcSafe(fs.readFileSync(path.join(REPO, 'index.html'), 'utf8')).matchAll(/<script src="([a-z0-9-]+\.js)\?v=/gi)].map(m => m[1]))];
function bsrcSafe(x) { return x; }
let shipped = 0;
const rows = [];
for (const f of ['index.html', 'app.css', ...tags]) {
  try { const n = fs.statSync(path.join(REPO, f)).size; shipped += n; rows.push([f, n]); } catch {}
}
rows.sort((a, b) => b[1] - a[1]);
L('\n══════ ١) ما يُشحن في كلّ زيارةٍ باردة ══════');
L(`  الإجمالي: ${(shipped / 1048576).toFixed(2)} MB في ${rows.length} ملفّاً`);
rows.slice(0, 6).forEach(([f, n]) => L(`    ${String(Math.round(n / 1024)).padStart(6)} KB  ${f}`));
L(`    … و${rows.length - 6} ملفّاً أصغر`);

const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
const met = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));

await page.goto('file://' + REPO + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);
const before = await met();

/* ── اعتراضُ كلّ نداءٍ على Firestore: العدّ ومصدرُ النداء ── */
await page.evaluate(() => {
  window.__probe = { byColl: {}, listeners: 0, gets: 0, aggs: 0, docs: 0, stacks: [] };
  const P = window.__probe;
  const bump = (c, k, n) => {
    const e = P.byColl[c] || (P.byColl[c] = { listen: 0, get: 0, agg: 0, docs: 0 });
    if (k === 'docs') e.docs += n; else e[k]++;
  };
  const nDocs = sn => (sn && (sn.size != null ? sn.size : (sn.docs ? sn.docs.length : 0))) || 0;
  const where = () => (new Error().stack || '').split('\n').slice(3, 5).join(' | ')
    .replace(/https?:\/\/[^\s)]*\//g, '').replace(/file:\/\/[^\s)]*\//g, '').trim();
  const realColl = db.collection.bind(db);
  const wrapQ = (q, c) => new Proxy(q, {
    get(t, k) {
      const v = t[k];
      if (typeof v !== 'function') return v;
      return function (...a) {
        if (k === 'onSnapshot') {
          P.listeners++; bump(c, 'listen'); P.stacks.push({ c, op: '⟳', st: where() });
          const cb = a[0];
          if (typeof cb === 'function') a[0] = function (sn) { const n = nDocs(sn); P.docs += n; bump(c, 'docs', n); return cb.apply(this, arguments); };
          return v.apply(t, a);
        }
        /* العدُّ على الخادم ليس جلبة: يرجع رقماً بلا مستندات. خلطُه بالجلبات
           يُضخّم الرقمَ ويُخفي أنّ التحويلَ إليه كان مكسباً. */
        if (k === 'count') {
          P.aggs++; bump(c, 'agg'); P.stacks.push({ c, op: '#', st: where() });
          return v.apply(t, a);
        }
        if (k === 'get') {
          P.gets++; bump(c, 'get'); P.stacks.push({ c, op: '↓', st: where() });
          return v.apply(t, a).then(sn => { const n = nDocs(sn); P.docs += n; bump(c, 'docs', n); return sn; });
        }
        const r = v.apply(t, a);
        return (r && typeof r === 'object' && (r.get || r.onSnapshot)) ? wrapQ(r, c) : r;
      };
    }
  });
  db.collection = function (c) { return wrapQ(realColl(c), c); };
});

/* ── بياناتٌ ثابتةٌ تشبه الإنتاج ── */
const seeded = await page.evaluate(() => {
  window.__store[PROJECTS_DOC] = { projects: [{ id: 'hail', name: 'مشروع حائل', desc: 'صيانة', icon: '' }] };
  window.__store[_meta('settings')] = { buildings: ['مبنى الإدارة'], supervisors: ['أسامة'], workTypes: { 'كهرباء': ['لمبة'] } };
  const PC = PURCHASES_COLLECTION(), INV = INVENTORY_COLLECTION(), LOG = INVENTORY_LOG_COLLECTION();
  const now = '2026-08-20T09:00:00.000Z';
  for (let i = 0; i < 300; i++) window.__store[`hail_tickets/TK-${i}`] =
    { id: 'TK-' + i, status: i % 3 ? 'مغلق' : 'مفتوح', building: 'مبنى الإدارة', workType: 'كهرباء',
      desc: 'عطل', priority: 'عادي', createdAt: now, supervisor: 'أسامة', archived: i % 4 === 0 };
  for (let i = 0; i < 120; i++) window.__store[`${PC}/PO-${i}`] =
    { id: 'PO-' + i, status: 'closed', projectId: 'hail', vendor: 'مؤسسة', building: 'مبنى الإدارة',
      supervisor: 'أسامة', createdAt: now, estCost: 1000, actualCost: 1000,
      items: [{ itemName: 'كابل', qty: 5, unit: 'م', unitCost: 100, itemCost: 500, vat: 75, rcvQty: 5 }] };
  for (let i = 0; i < 200; i++) window.__store[`${INV}/itm-${i}`] =
    { itemId: 'itm-' + i, itemName: 'صنف ' + i, unit: 'قطعة', currentQty: 10, warehouseName: 'الرئيسي' };
  for (let i = 0; i < 400; i++) window.__store[`${LOG}/lg-${i}`] =
    { type: 'in', itemId: 'itm-' + (i % 200), qty: 1, itemName: 'صنف', unit: 'قطعة', date: now };
  return Object.keys(window.__store).length;
});

AUTH_OK = true;
const t0 = Date.now();
await page.fill('#login-user', 'admin'); await page.fill('#login-pass', 'Passw0rd!');
await page.click('.login-btn');
await page.waitForSelector('#project-grid > *', { timeout: 30000 });
const tGate = Date.now() - t0;
await page.click('#project-grid > *');
await page.waitForFunction(() => {
  const d = document.getElementById('page-dashboard');
  return d && d.classList.contains('active') && (d.textContent || '').length > 300;
}, { timeout: 60000 });
const tDash = Date.now() - t0;
await page.waitForTimeout(4000);                 // نترك المستمعين يستقرّون
const tSettle = Date.now() - t0;

const after = await met();
const P = await page.evaluate(() => window.__probe);
const nav = await page.evaluate(() => {
  const t = performance.timing;
  return { dcl: t.domContentLoadedEventEnd - t.navigationStart, load: t.loadEventEnd - t.navigationStart };
});

L(`\n══════ ٢) الزمن (مُحاكًى — حدٌّ أدنى لا زمنَ شبكة) ══════`);
L(`  DOMContentLoaded            : ${nav.dcl} ms`);
L(`  load                        : ${nav.load} ms`);
L(`  الدخول ⇐ بوّابةُ المشاريع    : ${tGate} ms`);
L(`  ⇐ اللوحةُ التنفيذية          : ${tDash} ms`);
L(`  ⇐ استقرارُ المستمعين          : ${tSettle} ms`);

L('\n══════ ٣) كلفةُ المعالج ══════');
for (const k of ['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration']) {
  L(`  ${k.padEnd(20)} : ${(((after[k] || 0) - (before[k] || 0)) * 1000).toFixed(0)} ms`);
}
L(`  JSHeapUsedSize       : ${((after.JSHeapUsedSize || 0) / 1048576).toFixed(1)} MB`);
L(`  Nodes                : ${after.Nodes || 0}`);

L(`\n══════ ٤) الانتشار عند الدخول (زُرع ${seeded} مستنداً) ══════`);
L(`  مستمعون أحياء: ${P.listeners}   ·   جلبات: ${P.gets}   ·   عدٌّ على الخادم: ${P.aggs}   ·   مستندات نُزّلت: ${P.docs}`);
L('\n  المجموعة                          مستمع  جلبة  عدّ  مستندات');
Object.entries(P.byColl).sort((a, b) => b[1].docs - a[1].docs).forEach(([c, e]) => {
  L(`  ${c.padEnd(34)} ${String(e.listen).padStart(4)} ${String(e.get).padStart(6)} ${String(e.agg).padStart(4)} ${String(e.docs).padStart(9)}`);
});

/* مَن أطلق النداء — يُطبع لِما يُنزِّل مستنداتٍ فعلاً، فالبقيةُ لا تكلّف شيئاً اليوم */
const heavy = Object.entries(P.byColl).filter(([, e]) => e.docs > 0).map(([c]) => c);
L('\n══════ ٥) مَن ينادي على أثقل المجموعات ══════');
P.stacks.filter(x => heavy.includes(x.c)).forEach(x => L(`  ${x.op} ${x.c}\n     ${x.st}`));

/* ══ الحراسة ══ */
const over = [];
if (P.docs > BUDGET_DOCS)           over.push(`مستندات ${P.docs} > ${BUDGET_DOCS}`);
if (P.listeners > BUDGET_LISTENERS) over.push(`مستمعون ${P.listeners} > ${BUDGET_LISTENERS}`);
if (P.gets > BUDGET_GETS)           over.push(`جلبات ${P.gets} > ${BUDGET_GETS}`);
const under = P.docs < BUDGET_DOCS || P.listeners < BUDGET_LISTENERS || P.gets < BUDGET_GETS;

await browser.close();
L('\n' + '═'.repeat(58));
if (REPORT_ONLY) { L('📊 تقريرٌ بلا حراسة (--report)'); }
else if (over.length) {
  L('❌ تجاوزُ ميزانية الدخول: ' + over.join(' · '));
  L('   إمّا أن يكون الزائدُ خطأً يُصلَح، أو زيادةً مقصودةً — وحينها ارفع الرقم');
  L('   في هذا الملفّ ومعه سطرٌ في NOTES §6 يقول ما الذي زاد ولماذا.');
} else {
  L(`✅ ضمن الميزانية — مستندات ${P.docs}/${BUDGET_DOCS} · مستمعون ${P.listeners}/${BUDGET_LISTENERS} · جلبات ${P.gets}/${BUDGET_GETS}`);
  if (under) L('   💡 والقياسُ أقلُّ من الميزانية: اخفِض الأرقام في هذا الملفّ ليُثبَّت المكسب.');
}
L('═'.repeat(58) + '\n');
process.exit(!REPORT_ONLY && over.length ? 1 : 0);
