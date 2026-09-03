/* ══════════════════════════════════════════════════════════════════════
   فحصُ متصفّحٍ لوحدة مهامِّ الموظفين (staff-tasks.js)

   لماذا لا تكفي فحوصُ `hail-tests`: تلك تستدعي الدوالَّ النقيّة مباشرةً، فتُثبت
   أنّ المنطقَ صحيح **ولا تُثبت أنّ أحداً يصل إليه**. وسمةُ `onclick` تُقيَّم في
   النطاق العام، واسمٌ يسقط منه = **زرٌّ ميتٌ بصمت** بلا مترجمٍ ولا خطأِ جافاسكربت.
   فهذا الفحصُ يدخل ويضغط ويكتب كما يفعل الموظف.

   وفيه ما لا يُفحَص إلا هنا: **حجبُ مهمّةِ غيري في الواجهة**. مُحاكي Firestore
   يتجاهل `where` فيُعيد المجموعةَ كاملةً — وهذا مقصودٌ هنا لا نقص: يجعل الفحصَ
   يقيس الطبقةَ الثانية (`_canSee` وقتَ الرسم) لا الاستعلامَ وحدَه. فلو سقط
   الترشيحُ يوماً لَظهرت مهمّةُ زميلٍ على الشاشة، ويمسكها هذا السطر.

   node staff-tasks-check.mjs
   ══════════════════════════════════════════════════════════════════════ */
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const REPO = process.env.REPO_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname));
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

let pass = 0, fail = 0;
const L = (...a) => console.log(...a);
const check = (n, ok, d) => { if (ok) { pass++; L('  ✅', n, d ? '— ' + d : ''); } else { fail++; L('  ❌', n, d ? '— ' + d : ''); } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(MOCK_FIREBASE);
await page.addInitScript(CDN_STUBS);

const errors = [];
const IGNORE = /ServiceWorkerRegistration|net::ERR_FAILED|Failed to load resource|ERR_BLOCKED|reCAPTCHA|AppCheck/i;
page.on('pageerror', e => { const m = String(e.message).slice(0, 200); if (!IGNORE.test(m)) errors.push(m); });
page.on('console', m => { if (m.type() !== 'error') return; const t = String(m.text()).slice(0, 200); if (!IGNORE.test(t)) errors.push(t); });

page.on('dialog', d => d.accept().catch(() => {}));
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
L('  مهامُّ الموظفين — فحصٌ في متصفّحٍ حقيقيّ');
L('══════════════════════════════════════════════════════');

await page.goto('file://' + REPO + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);

await page.evaluate(() => {
  window.__store[PROJECTS_DOC] = { projects: [{ id: 'hail', name: 'مشروع حائل', desc: 'صيانة', icon: '' }] };
  window.__store[_meta('settings')] = { buildings: ['مبنى الإدارة'], supervisors: ['أسامة'], workTypes: {} };
});
AUTH_OK = true;
await page.fill('#login-user', 'admin'); await page.fill('#login-pass', 'Passw0rd!');
await page.click('.login-btn');
await page.waitForTimeout(3500);

/* بوّابةُ المشاريع تعترض الشريطَ الجانبيَّ — ندخل المشروعَ بنقرٍ حقيقيٍّ كما يفعل الموظف */
await page.click('#project-grid > *');
await page.waitForTimeout(3000);

/* قائمةُ موظفين حقيقيةٌ لمُنتقي التكليف */
await page.evaluate(() => {
  USERS = [{ user: 'admin', name: 'المسؤول', role: 'admin' },
           { user: 'khaled', name: 'خالد', role: 'مشرف' },
           { user: 'saeed',  name: 'سعيد', role: 'مشرف' }];
});

/* ═════════ ١) الزرّ حيّ والشاشة تُرسَم ═════════ */
L('\n=== ١) الزرُّ والشاشة ===');
check('زرُّ «المهامّ والملاحظات» ظاهرٌ في الشريط', await page.isVisible('#nav-staff-tasks-btn').catch(() => false));
await page.click('#nav-staff-tasks-btn');
await page.waitForTimeout(1200);
check('★★★ النقرُ يفتح الشاشة فعلاً (لا زرٌّ ميتٌ بصمت)',
  await page.evaluate(() => { const p = document.getElementById('page-staff-tasks'); return !!p && p.classList.contains('active') && p.innerHTML.length > 400; }));
check('★ والخاناتُ الأربعُ مرسومة',
  await page.evaluate(() => document.querySelectorAll('#page-staff-tasks .st-tab').length >= 4),
  await page.evaluate(() => document.querySelectorAll('#page-staff-tasks .st-tab').length + ' خانة'));
check('وسطرُ التكليف السريع موجود', await page.isVisible('#st-quick-input').catch(() => false));

/* ═════════ ٢) التكليفُ الجماعيّ ═════════ */
L('\n=== ٢) التكليفُ الجماعيّ (نمط Microsoft To Do) ===');
await page.selectOption('#page-staff-tasks .st-quick select', 'khaled');
await page.waitForTimeout(300);
await page.fill('#st-quick-input', 'راجع عقد المورّد');
await page.press('#st-quick-input', 'Enter');
await page.waitForTimeout(400);
check('★★ Enter يضيف المهمّة إلى القائمة',
  await page.evaluate(() => document.querySelectorAll('#page-staff-tasks .st-drow').length === 1));
check('★ والسطرُ يفضى ويبقى جاهزاً للتالية (بلا رفعِ يدٍ عن الكيبورد)',
  await page.evaluate(() => { const e = document.getElementById('st-quick-input'); return !!e && e.value === '' && document.activeElement === e; }));

/* لصقٌ حقيقيّ — لا `fill`: حقلُ السطر الواحد يطوي الأسطرَ قبل أن يراها الكود،
   فلو ملأناه بـ`fill` لقِسنا شيئاً آخر ومرّ العطلُ الحقيقيّ. */
await page.evaluate(() => {
  const el = document.getElementById('st-quick-input');
  const dt = new DataTransfer();
  dt.setData('text', 'نظّف الدور الثاني\n- سلّم التقرير الشهري\n٣. اطلب قطع الغيار');
  el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
});
await page.waitForTimeout(500);
check('★★ لصقةٌ من ثلاثة أسطرٍ تنفكّ ثلاثَ مهامَّ مستقلّة',
  await page.evaluate(() => document.querySelectorAll('#page-staff-tasks .st-drow').length === 4),
  await page.evaluate(() => document.querySelectorAll('#page-staff-tasks .st-drow').length + ' صفّاً'));
check('★ والترقيمُ والشرطةُ منزوعان من العنوان',
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('#page-staff-tasks .st-drow .t')].map(x => x.textContent.trim());
    return t.includes('سلّم التقرير الشهري') && t.includes('اطلب قطع الغيار');
  }));

await page.evaluate(() => staffTasks.draftDueAll('2026-09-10'));
await page.waitForTimeout(300);
await page.click('#page-staff-tasks .st-quick .btn-primary');
await page.waitForTimeout(1200);

const saved = await page.evaluate(() => Object.keys(window.__store).filter(k => k.startsWith('staff_tasks/')).map(k => window.__store[k]));
check('★★★ الإرسالُ كتب المهامَّ الأربعَ دفعةً واحدة', saved.length === 4, saved.length + ' مستنداً');
check('★★ وكلُّها بالأطراف الصحيحة (المُنشئ + المكلَّف) وبالموعد الموحّد',
  saved.length === 4 && saved.every(t => Array.isArray(t.participants) &&
    t.participants.length === 2 && t.participants.includes('admin') && t.participants.includes('khaled') &&
    t.assignedToUser === 'khaled' && t.createdByUser === 'admin' && t.due === '2026-09-10'),
  JSON.stringify(saved[0] && saved[0].participants));
check('★ والقائمةُ فُرِّغت بعد الإرسال (لا إرسالٌ مكرَّرٌ بنقرةٍ ثانية)',
  await page.evaluate(() => document.querySelectorAll('#page-staff-tasks .st-drow').length === 0));

/* ═════════ ٣) الظهورُ في الخانات ═════════ */
L('\n=== ٣) الخاناتُ والعدّاد ===');
await page.evaluate(() => staffTasks.tab('sent'));
await page.waitForTimeout(600);
check('★★ المهامُّ تظهر في «كلّفتُ بها»',
  await page.evaluate(() => document.querySelectorAll('#page-staff-tasks .st-card').length === 4),
  await page.evaluate(() => document.querySelectorAll('#page-staff-tasks .st-card').length + ' بطاقة'));

/* المكلَّفُ نفسُه: تظهر في «مهامّي» وفي شارة الشريط */
await page.evaluate(() => {
  currentUser = { user: 'khaled', name: 'خالد', role: 'مشرف' };
  staffTasks.stopSync(); staffTasks.startSync(); staffTasks.tab('mine');
});
await page.waitForTimeout(900);
check('★★ والمكلَّفُ يراها في «مهامّي»',
  await page.evaluate(() => document.querySelectorAll('#page-staff-tasks .st-card').length === 4));
check('★★ وشارةُ الشريط تعدّ ما عليه هو',
  await page.evaluate(() => { const b = document.getElementById('nav-staff-tasks-badge'); return !!b && b.textContent === '4' && b.style.display !== 'none'; }),
  await page.evaluate(() => (document.getElementById('nav-staff-tasks-badge') || {}).textContent));

/* ═════════ ٤) الغرفةُ مغلقة — الطبقةُ الثانية ═════════ */
L('\n=== ٤) الغرفةُ مغلقةٌ في الواجهة أيضاً ===');
const leaked = await page.evaluate(() => {
  /* المُحاكي يتجاهل `where` فيُعيد المجموعةَ كاملةً — فما يُحجب هنا يُحجب بالترشيح
     وقتَ الرسم لا بالاستعلام. وهذه هي الطبقةُ التي نقيسها. */
  currentUser = { user: 'saeed', name: 'سعيد', role: 'مشرف' };
  staffTasks.stopSync(); staffTasks.startSync();
  staffTasks.tab('mine');
  const mine = document.querySelectorAll('#page-staff-tasks .st-card').length;
  staffTasks.tab('sent');
  const sent = document.querySelectorAll('#page-staff-tasks .st-card').length;
  staffTasks.tab('done');
  const done = document.querySelectorAll('#page-staff-tasks .st-card').length;
  const badge = (document.getElementById('nav-staff-tasks-badge') || {}).style;
  return { mine, sent, done, badgeHidden: !badge || badge.display === 'none' };
});
check('★★★ موظفٌ خارجَ الغرفة لا يرى المهمّةَ في أيّ خانة — ولو أعاد الاستعلامُ المستندَ إليه',
  leaked.mine === 0 && leaked.sent === 0 && leaked.done === 0, JSON.stringify(leaked));
check('★★ ولا تُعدّ له في الشارة', leaked.badgeHidden);

const adminSees = await page.evaluate(() => {
  currentUser = { user: 'admin', name: 'المسؤول', role: 'admin' };
  staffTasks.stopSync(); staffTasks.startSync(); staffTasks.tab('all');
  return document.querySelectorAll('#page-staff-tasks .st-card').length;
});
check('★ والمالكُ يرى الكلَّ من خانة الإدارة', adminSees === 4, adminSees + ' بطاقة');

/* ═════════ ٥) فتحُ المهمّة وإنجازُها ═════════ */
L('\n=== ٥) تفصيلُ المهمّة ===');
await page.evaluate(() => { staffTasks.tab('sent'); });
await page.waitForTimeout(500);
await page.click('#page-staff-tasks .st-card');
await page.waitForTimeout(700);
check('★★ فتحُ البطاقة يعرض التفصيل والمشاركين وحقلَ الملاحظة',
  await page.evaluate(() => { const h = document.getElementById('page-staff-tasks').innerHTML;
    return /st-acts/.test(h) && /st-who/.test(h) && /st-cmt-/.test(h); }));
const doneOk = await page.evaluate(async () => {
  const id = (staffTasks.byId ? null : null);
  const card = document.querySelector('#page-staff-tasks .btn-primary');
  if (!card) return 'لا زرَّ إنجاز';
  card.click();
  await new Promise(r => setTimeout(r, 700));
  const st = Object.keys(window.__store).filter(k => k.startsWith('staff_tasks/')).map(k => window.__store[k]);
  return st.filter(t => t.status === 'done').length;
});
check('★★ زرُّ «تمّ الإنجاز» يكتب الحالةَ فعلاً في المستند', doneOk === 1, String(doneOk));

/* ═════════ ٥-ب) التعديلُ والحذف ═════════ */
L('\n=== ٥-ب) التعديلُ والحذف ===');
await page.evaluate(() => { staffTasks.back(); staffTasks.tab('sent'); });
await page.waitForTimeout(500);
const idEdit = await page.evaluate(() => {
  currentUser = { user: 'admin', name: 'المسؤول', role: 'admin' };
  const t = Object.entries(window.__store).find(([k]) => k.startsWith('staff_tasks/'));
  staffTasks.open(t[0].split('/')[1]);
  return t[0].split('/')[1];
});
await page.waitForTimeout(600);
check('★★ زرُّ «تعديل» ظاهرٌ في تفاصيل المهمّة',
  await page.evaluate(() => /staffTasks\.startEdit/.test(document.getElementById('page-staff-tasks').innerHTML)));
await page.evaluate(() => staffTasks.startEdit(staffTasks.byId(Object.keys(window.__store).filter(k => k.startsWith('staff_tasks/'))[0].split('/')[1]).id));
await page.waitForTimeout(600);
check('★★ ونموذجُ التحرير يفتح بحقوله الأربعة',
  await page.evaluate(() => {
    const h = document.getElementById('page-staff-tasks');
    return !!h.querySelector('[id^="st-ed-title-"]') && !!h.querySelector('[id^="st-ed-body-"]') &&
           !!h.querySelector('[id^="st-ed-due-"]') && !!h.querySelector('[id^="st-ed-prio-"]');
  }));
check('★★ ومُنتقي المكلَّف ظاهرٌ للمُنشئ',
  await page.evaluate(() => !!document.querySelector('#page-staff-tasks [id^="st-ed-asg-"]')));
await page.fill(`#st-ed-title-${idEdit}`, 'راجع عقد المورّد — معدَّل');
await page.fill(`#st-ed-due-${idEdit}`, '2026-09-25');
await page.selectOption(`#st-ed-prio-${idEdit}`, 'high');
await page.click('#page-staff-tasks .btn-primary');
await page.waitForTimeout(900);
const edited = await page.evaluate((id) => window.__store['staff_tasks/' + id], idEdit);
check('★★★ الحفظُ يكتب العنوانَ والموعدَ والأولوية في المستند',
  !!edited && edited.title === 'راجع عقد المورّد — معدَّل' && edited.due === '2026-09-25' && edited.priority === 'high',
  JSON.stringify({ t: edited && edited.title, d: edited && edited.due, p: edited && edited.priority }));
check('★★★ والتعديلُ يُنسَب لمَن أجراه (مصدرُ المساءلة حين يعدّل مشاركٌ نصَّ غيره)',
  !!edited && edited.lastEditBy === 'admin', edited && edited.lastEditBy);
check('★★ ويعود إلى شاشة التفصيل بعد الحفظ (لا يبقى في النموذج)',
  await page.evaluate(() => !document.querySelector('#page-staff-tasks [id^="st-ed-title-"]')));

/* التحويلُ إلى موظّفٍ آخر — يُخرج المكلَّفَ السابق */
await page.evaluate((id) => staffTasks.startEdit(id), idEdit);
await page.waitForTimeout(500);
await page.selectOption(`#st-ed-asg-${idEdit}`, 'saeed');
await page.click('#page-staff-tasks .btn-primary');
await page.waitForTimeout(900);
const moved = await page.evaluate((id) => window.__store['staff_tasks/' + id], idEdit);
check('★★★ التحويلُ ينقل المهمّة ويُعيد بناءَ الأطراف (يخرج السابقُ ويدخل الجديد)',
  !!moved && moved.assignedToUser === 'saeed' &&
  JSON.stringify((moved.participants || []).slice().sort()) === JSON.stringify(['admin', 'saeed']),
  JSON.stringify(moved && moved.participants));

/* المكلَّفُ يعدّل ولا يحوّل — الطبقةُ الثانية بعد قاعدة البيانات */
const asAssignee = await page.evaluate((id) => {
  currentUser = { user: 'saeed', name: 'سعيد', role: 'مشرف' };
  staffTasks.stopSync(); staffTasks.startSync(); staffTasks.open(id); staffTasks.startEdit(id);
  const h = document.getElementById('page-staff-tasks');
  return { form: !!h.querySelector('[id^="st-ed-title-"]'), asg: !!h.querySelector('[id^="st-ed-asg-"]') };
}, idEdit);
await page.waitForTimeout(600);
check('★★ المكلَّفُ يفتح نموذجَ التعديل', asAssignee.form);
check('★★★ ولا يُعرَض له مُنتقي التحويل (لا يرمي عهدتَه على زميل)', !asAssignee.asg);

/* الحذف: للمُنشئ وحدَه */
const delAsAssignee = await page.evaluate((id) => {
  staffTasks.cancelEdit();
  return /staffTasks\.removeTask/.test(document.getElementById('page-staff-tasks').innerHTML);
}, idEdit);
check('★★★ وزرُّ الحذف محجوبٌ عن المكلَّف (لا يمحو الدليلَ عليه)', !delAsAssignee);
const gone = await page.evaluate(async (id) => {
  currentUser = { user: 'admin', name: 'المسؤول', role: 'admin' };
  staffTasks.stopSync(); staffTasks.startSync(); staffTasks.open(id);
  await new Promise(r => setTimeout(r, 300));
  const btn = document.querySelector('#page-staff-tasks .btn-danger');
  if (!btn) return 'لا زرَّ حذف';
  btn.click();
  await new Promise(r => setTimeout(r, 700));
  return !window.__store['staff_tasks/' + id];
}, idEdit);
check('★★★ والمُنشئُ يحذف فعلاً — يختفي المستند', gone === true, String(gone));

/* ═════════ ٦) لغةُ المنصّة: أيقوناتٌ لا إيموجي، ومكوّناتٌ مشتركة ═════════
   شاشةٌ تُخالف أسلوبَ ما حولها تبدو دخيلةً وإن عملت. وأخطرُ ما يقع هنا صامتٌ:
   متغيّرُ لونٍ **لا وجودَ له** يسقط على قيمةٍ احتياطيةٍ فتخرج الحقولُ سوداءَ وسط
   شاشةٍ فاتحة، ولا خطأَ في وحدة التحكّم يُنذر. فيُقاس اللونُ المحسوبُ فعلاً. */
L('\n=== ٦) لغةُ المنصّة ===');
const skin = await page.evaluate(() => {
  const host = document.getElementById('page-staff-tasks');
  const RE = /[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
  // شاشةُ التفصيل مفتوحةٌ الآن — تُقاس أوّلاً، ثمّ نرجع للقائمة لقياس بقيّتها
  const emojiDetail = RE.test(host.textContent || '');
  staffTasks.back();
  const txt = host.textContent || '';
  // نطاقاتُ الرموز التصويرية — لا يُقاس على النصّ العربيّ ولا على علامات الترقيم
  const emoji = emojiDetail || RE.test(txt);
  const svgs = host.querySelectorAll('.ic svg').length;
  const heroIcon = !!host.querySelector('.page-hero .ph-ico svg');
  const inp = host.querySelector('.form-input');
  const bg = inp ? getComputedStyle(inp).backgroundColor : '';
  // القراءةُ من الجذر: القيمةُ التي يراها المتصفّح فعلاً لا التي ظنناها
  const rootBg = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
  const tabOn = host.querySelector('.st-tab.on');
  const tabBg = tabOn ? getComputedStyle(tabOn).backgroundColor : '';
  const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
  const inherited = host.querySelectorAll('.form-input,.form-select,.btn').length;
  return { emoji, svgs, heroIcon, bg, rootBg, tabBg, primary, inherited };
});
check('★★★ لا رمزَ تصويريّاً واحداً في الشاشة — الأيقوناتُ كلُّها svg', !skin.emoji);
check('★★ وأيقوناتُ المنصّة تُرسَم فعلاً (لا span فارغ)', skin.svgs > 0, skin.svgs + ' أيقونة');
check('★★ وأيقونةُ الترويسة داخل ph-ico كبقيّة الشاشات', skin.heroIcon);
check('★★ ومكوّناتُ المنصّة مستعملةٌ لا منسوخة (form-input · form-select · btn)',
  skin.inherited >= 3, skin.inherited + ' عنصراً');
/* الحقلُ الأبيض على شاشةٍ فاتحة: rgb(255,255,255). لو سقط على متغيّرٍ غيرِ موجودٍ
   لخرج داكناً — وهذا بالضبط ما وقع في النسخة الأولى. */
check('★★★ خلفيةُ الحقل من نظام المنصّة لا من قيمةٍ احتياطيةٍ داكنة',
  /^rgba?\(2[45]\d,\s*2[45]\d,\s*2[45]\d/.test(skin.bg), skin.bg);
check('★★ والخانةُ المفتوحة بلون الهوية --primary لا بلونٍ من خارجه',
  !!skin.tabBg && skin.tabBg !== 'rgba(0, 0, 0, 0)', skin.tabBg + '  (--primary: ' + skin.primary + ')');

check('★★★ لا خطأَ جافاسكربت في الرحلة كلّها', errors.length === 0, errors[0] || '');

await browser.close();
L('\n' + '═'.repeat(54));
console.log(fail ? `❌ ${fail} فشلت من ${pass + fail}` : `✅ ${pass}/${pass} فحصاً ناجحاً`);
L('═'.repeat(54) + '\n');
process.exit(fail ? 1 : 0);
