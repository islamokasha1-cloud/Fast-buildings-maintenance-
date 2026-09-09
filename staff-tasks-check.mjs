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
           { user: 'saeed',  name: 'سعيد', role: 'مشرف' },
           { user: 'ashraf', name: 'أشرف عشري', role: 'مشرف' }];
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
/* منتقي المكلَّف — قائمةٌ يُبحَث فيها لا عجلةٌ تُلَفُّ بالإصبع (بلاغُ المالك 08/09).
   ويُقاد هنا كما يقوده الموظف: لمسةٌ ثم كتابةٌ ثم نقرٌ على النتيجة. */
await page.click('#st-up-q-quick');
await page.waitForTimeout(300);
check('★★ لمسُ خانة التكليف يفتح القائمةَ كاملةً قبل أيّ كتابة',
  await page.evaluate(() => document.querySelectorAll('#st-up-l-quick .st-up-row').length >= 5),
  await page.evaluate(() => document.querySelectorAll('#st-up-l-quick .st-up-row').length + ' صفّاً'));
await page.fill('#st-up-q-quick', 'اشرف');
await page.waitForTimeout(300);
check('★★★ «اشرف» بلا همزةٍ تجد «أشرف عشري» — البحثُ يطبّع لا يطابق حرفياً',
  await page.evaluate(() => {
    const r = [...document.querySelectorAll('#st-up-l-quick .st-up-row')];
    return r.length === 1 && /أشرف عشري/.test(r[0].textContent);
  }),
  await page.evaluate(() => [...document.querySelectorAll('#st-up-l-quick .st-up-row')].map(x => x.textContent.trim()).join(' | ')));
await page.fill('#st-up-q-quick', 'خال');
await page.waitForTimeout(300);
await page.click('#st-up-l-quick .st-up-row');
await page.waitForTimeout(400);
check('★★★ والنقرُ على النتيجة يُثبت المكلَّف فعلاً (صفٌّ حيٌّ لا مرسومٌ فقط)',
  await page.evaluate(() => {
    const v = document.getElementById('st-quick-asg'), q = document.getElementById('st-up-q-quick');
    return !!v && v.value === 'khaled' && !!q && q.value === 'خالد';
  }),
  await page.evaluate(() => (document.getElementById('st-quick-asg') || {}).value));
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

const adminSees = await page.evaluate(async () => {
  currentUser = { user: 'admin', name: 'المسؤول', role: 'admin' };
  staffTasks.stopSync(); staffTasks.startSync(); staffTasks.tab('all');
  // «كل المهامّ» جلبةٌ عند الطلب لا تيّارٌ من لحظة الدخول — تُنتظر
  await new Promise(r => setTimeout(r, 800));
  return document.querySelectorAll('#page-staff-tasks .st-card').length;
});
check('★ والمالكُ يرى الكلَّ من خانة الإدارة (جلبةٌ عند فتح الخانة)', adminSees === 4, adminSees + ' بطاقة');
/* الاشتراكُ الحيُّ عند الدخول لا يشمل مهامَّ الآخرين — حتى للأدمن.
   وهو أصلُ خفض الكلفة: مجموعةٌ تكبر بلا حدّ لا تُبَثّ لكل جلسةٍ من أوّلها. */
check('★★★ والاشتراكُ الحيُّ مقصورٌ على ما أنا طرفٌ فيه — حتى للأدمن (خفضُ كلفة الدخول)',
  await page.evaluate(() => {
    const src = String(window.staffTasks.startSync);
    return /array-contains/.test(src) && !/_isAdmin\(\)\s*\?/.test(src);
  }));

/* ═════════ ٤-ب) مَن أُشرِك في مهمّةٍ يراها ═════════
   بلاغُ المالك (08/09): «لماذا لا يظهر عندي غير مهمّةٍ واحدة؟» — كان التوزيعُ يعرف
   ثلاثَ صفاتٍ (مكلَّفٌ · مُنشئٌ · صاحبُ ملاحظة) وينسى الرابعة: **مُضافٌ مشاركاً**.
   فالمستندُ يصل المتصفّحَ فعلاً وتُفتح صفحةُ تفصيله برابطه، ولا يُصادف خانةً تعرضه.
   وهذا يُقاس في المتصفّح لا في الوحدة وحدَها: العطلُ كان في الشاشة. */
L('\n=== ٤-ب) مَن أُشرِك في مهمّةٍ يراها في خانةٍ ===');
const sharedView = await page.evaluate(async () => {
  const key = Object.keys(window.__store).filter(k => k.startsWith('staff_tasks/')).pop();
  const doc = window.__store[key];
  const before = JSON.stringify({ shared: doc.shared || null, participants: doc.participants });
  doc.shared = ['saeed'];
  doc.participants = [doc.createdByUser, doc.assignedToUser, 'saeed'];
  currentUser = { user: 'saeed', name: 'سعيد', role: 'مشرف' };
  staffTasks.stopSync(); staffTasks.startSync();
  await new Promise(r => setTimeout(r, 900));
  const host = document.getElementById('page-staff-tasks');
  const count = (t) => { staffTasks.tab(t); return host.querySelectorAll('.st-card').length; };
  const out = { mine: count('mine'), sent: count('sent'), notes: count('notes'), shared: count('shared') };
  out.tab = !![...host.querySelectorAll('.st-tab')].find(b => /شارَكوني/.test(b.textContent));
  out.badge = ((document.getElementById('nav-staff-tasks-badge') || {}).style || {}).display;
  // إرجاعُ المستند إلى حاله — لا يُلوَّث ما بعده
  const b = JSON.parse(before);
  if (b.shared === null) delete doc.shared; else doc.shared = b.shared;
  doc.participants = b.participants;
  currentUser = { user: 'admin', name: 'المسؤول', role: 'admin' };
  staffTasks.stopSync(); staffTasks.startSync();
  await new Promise(r => setTimeout(r, 600));
  return out;
});
check('★★★ المهمّةُ التي أُشرِك فيها تظهر له في خانة «شارَكوني فيها»',
  sharedView.shared === 1, JSON.stringify(sharedView));
check('★★★ ولم تكن تظهر في أيٍّ من الخانات الأخرى (هذا هو العطلُ المُبلَّغ عنه)',
  sharedView.mine === 0 && sharedView.sent === 0 && sharedView.notes === 0, JSON.stringify(sharedView));
check('★★ وللخانة زرٌّ في الشريط يفتحها (بضاعةٌ بلا زرٍّ لا تُرى)', sharedView.tab === true);
check('★★ ولا تُعدّ في الشارة الحمراء — تلك ما عليّ أنا لا ما أتابعه',
  sharedView.badge === 'none', String(sharedView.badge));

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

/* ── إضافةُ مشارك: المنتقي نفسُه، ومصدرُ الحقيقة حقلٌ يقرؤه `shareTask` بمعرّفه.
   لو انزلق المعرّفُ يوماً لَقرأ الحفظُ فراغاً وقال «اختر موظفاً» بلا خطأٍ واحد. ── */
const shKey = await page.evaluate(() => {
  const el = document.querySelector('#page-staff-tasks [id^="st-up-q-sh-"]');
  return el ? el.id.replace('st-up-q-sh-', '') : '';
});
check('★★ ومنتقي إضافة المشارك مرسومٌ في التفصيل', !!shKey, shKey);
if (shKey) {
  await page.fill(`#st-up-q-sh-${shKey}`, 'اشرف');
  await page.waitForTimeout(300);
  await page.click(`#st-up-l-sh-${shKey} .st-up-row`);
  await page.waitForTimeout(300);
  await page.click('#page-staff-tasks button:has-text("إضافة")');
  await page.waitForTimeout(900);
  const shared = await page.evaluate((id) => window.__store['staff_tasks/' + id], shKey);
  check('★★★ البحثُ ثمّ «إضافة» يُدخل الزميلَ في الغرفة فعلاً (مشاركاً وطرفاً)',
    !!shared && (shared.shared || []).includes('ashraf') && (shared.participants || []).includes('ashraf'),
    JSON.stringify(shared && shared.participants));
  check('★ ومَن صار مشاركاً لا يعود في قائمة الإضافة (لا إضافةٌ مكرّرة)',
    await page.evaluate(() => {
      const el = document.querySelector('#page-staff-tasks [id^="st-up-q-sh-"]');
      if (!el) return true;
      el.focus();
      const k = el.id.replace('st-up-q-', '');
      return ![...document.querySelectorAll('#st-up-l-' + k + ' .st-up-row')]
        .some(r => /أشرف عشري/.test(r.textContent));
    }));
}

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
await page.fill(`#st-up-q-ed-${idEdit}`, 'سعيد');
await page.waitForTimeout(300);
await page.click(`#st-up-l-ed-${idEdit} .st-up-row`);
await page.waitForTimeout(300);
check('★★★ ومنتقي التحويل يكتب اسمَ الدخول في الحقل الذي يقرؤه الحفظ (لا الاسمَ المعروض)',
  await page.evaluate((id) => (document.getElementById('st-ed-asg-' + id) || {}).value === 'saeed', idEdit),
  await page.evaluate((id) => (document.getElementById('st-ed-asg-' + id) || {}).value, idEdit));
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

/* ═════════ ٥-ج) الشاشةُ لا تعلَق على «تعذّر الاتصال» ═════════
   بلاغُ المالك 03/09: فُتحت الشاشةُ على «تعذّر الاتصال بقاعدة البيانات» والمنصّةُ
   تعمل. والجذرُ أنّ مهلةَ الأمان كانت تُسلَّح داخل `startSync` — أي **عند الدخول
   والشاشةُ مغلقة**؛ فتأخُّرُ لقطةٍ عن ثمانِ ثوانٍ (شبكةٌ بطيئة · عشرون مجموعةً معاً)
   يُثبّت حالةَ خطأٍ لا يراها أحد، ثم تُفتح الشاشةُ بعد دقائق فتُعرَض — و`startSync`
   ترجع فوراً لأن المشترك موضوع، فلا تُعاد المحاولةُ أبداً.
   هذا الفحصُ **يعيد إنتاج الحالة نفسَها** ويتحقّق أن الشاشة تتعافى. */
L('\n=== ٥-ج) التعافي من تأخّرٍ وقع والشاشةُ مغلقة ===');
const recovered = await page.evaluate(async () => {
  staffTasks.stopSync();
  const realColl = db.collection.bind(db);
  db.collection = function (c) {
    if (!/^staff_tasks/.test(c)) return realColl(c);
    const dead = { where(){ return dead; }, orderBy(){ return dead; }, limit(){ return dead; },
                   get(){ return new Promise(() => {}); }, onSnapshot(){ return function(){}; } };
    return dead;
  };
  staffTasks.startSync();                      // كما يقع عند الدخول
  await new Promise(r => setTimeout(r, 8600)); // تمرّ المهلةُ القديمة والشاشةُ مغلقة
  db.collection = realColl;                    // عادت الشبكة
  staffTasks.list();                           // الآن يفتحها المستخدم
  await new Promise(r => setTimeout(r, 1500));
  const h = document.getElementById('page-staff-tasks');
  return { err: /تعذّر الاتصال/.test(h.textContent || ''), tabs: h.querySelectorAll('.st-tab').length };
});
check('★★★ تأخّرٌ وقع والشاشةُ مغلقة لا يتركها عالقةً على «تعذّر الاتصال»', !recovered.err);
check('★★ وتُعرَض الشاشةُ كاملةً بعد عودة الشبكة', recovered.tabs >= 4, recovered.tabs + ' خانة');

/* ═════════ ٥-هـ) الملاحظات: تُكتب وتُرسم — وEnter طريقٌ لا زرٌّ وحدَه ═════════
   بلاغُ المالك (09/09): «الملاحظات لا تظهر». ولم يكن على هذا المسار فحصٌ واحد،
   وسببُ العمى مضاعف: محاكي Firestore كان يُزيّف `arrayUnion` **بكائنٍ فارغ**،
   فكلُّ إلحاقٍ بمصفوفةٍ يُنتج حقلاً ليس مصفوفةً، وقارئوه يكتبون
   `Array.isArray(x) ? … : []` فتخرج قائمةٌ فارغةٌ صامتة — لا خطأَ ولا فحصٌ يسقط.
   أُصلح المحاكي، وهذه فحوصُ المسار. */
L('\n=== ٥-هـ) الملاحظات ===');
const NOTEID = await page.evaluate(async () => {
  window.__store['staff_tasks/CM1'] = {
    title: 'مهمّةٌ للتعليق', status: 'open', kind: 'task',
    createdByUser: 'admin', createdAt: Date.now() - 5000,
    assignedToUser: 'khaled', assignedToName: 'خالد',
    participants: ['admin', 'khaled'], shared: [], comments: []
  };
  currentUser = { user: 'admin', name: 'المسؤول', role: 'admin' };
  staffTasks.stopSync(); staffTasks.startSync();
  await new Promise(r => setTimeout(r, 800));
  staffTasks.open('CM1');
  await new Promise(r => setTimeout(r, 400));
  return !!document.getElementById('st-cmt-CM1');
});
check('حقلُ الملاحظة مرسومٌ في التفصيل', NOTEID === true);

/* (أ) الزرّ — بنقرٍ حقيقيّ */
await page.fill('#st-cmt-CM1', 'ملاحظةٌ بالزرّ');
await page.evaluate(() => [...document.querySelectorAll('#page-staff-tasks .btn')]
  .find(x => /إرسال/.test(x.textContent)).click());
await page.waitForTimeout(1200);
const byBtn = await page.evaluate(() => ({
  doc: (window.__store['staff_tasks/CM1'].comments || []).map(c => c.text),
  ui: [...document.querySelectorAll('#page-staff-tasks .st-note')].map(n => n.textContent)
}));
check('★★★ زرُّ «إرسال» يكتب الملاحظةَ في المستند',
  Array.isArray(byBtn.doc) && byBtn.doc.join('') === 'ملاحظةٌ بالزرّ', JSON.stringify(byBtn.doc));
check('★★★ وتُرسَم على الشاشة فوراً (لا تُكتب في الصمت)',
  byBtn.ui.length === 1 && /ملاحظةٌ بالزرّ/.test(byBtn.ui[0]), JSON.stringify(byBtn.ui));

/* (ب) وEnter — الطريقُ الذي درّبت عليه الشاشةُ نفسُها في أعلاها */
await page.fill('#st-cmt-CM1', 'ملاحظةٌ بـEnter');
await page.press('#st-cmt-CM1', 'Enter');
await page.waitForTimeout(1200);
const byEnter = await page.evaluate(() => ({
  doc: (window.__store['staff_tasks/CM1'].comments || []).map(c => c.text),
  ui: [...document.querySelectorAll('#page-staff-tasks .st-note')].map(n => n.textContent),
  cleared: (document.getElementById('st-cmt-CM1') || {}).value
}));
check('★★★ وEnter يُرسل كذلك — والشاشةُ نفسُها تدرّب عليه في حقل التكليف أعلاها',
  byEnter.doc.length === 2 && byEnter.doc.indexOf('ملاحظةٌ بـEnter') !== -1, JSON.stringify(byEnter.doc));
check('★★ والملاحظتان معاً في الشاشة (arrayUnion يُلحق ولا يستبدل)',
  byEnter.ui.length === 2, byEnter.ui.length + ' ملاحظة');
check('★ والحقلُ يُفرَّغ بعد الإرسال (لا إرسالٌ مكرَّرٌ بضغطةٍ ثانية)', byEnter.cleared === '');

/* (ج) وملاحظةٌ فارغةٌ لا تُكتب */
await page.fill('#st-cmt-CM1', '   ');
await page.press('#st-cmt-CM1', 'Enter');
await page.waitForTimeout(700);
check('★★ وفراغٌ أو مسافاتٌ لا تصير ملاحظةً',
  await page.evaluate(() => (window.__store['staff_tasks/CM1'].comments || []).length === 2));

/* (د) مهمّةٌ خارج المستمع الحيّ — تُفتح من «كل المهامّ (إدارة)» ولستُ طرفاً فيها.
   الكتابةُ تنجح ولا لقطةَ تصل، فكانت الشاشةُ تبقى بلا الملاحظة — أي «لم تُحفَظ»
   في نظر صاحبها بينما هي في قاعدة البيانات. */
const outside = await page.evaluate(async () => {
  /* المستمعُ يُضيَّق هنا فعلاً (window.__mockWhere) — وبدونه لا يُثبت هذا الفحصُ
     شيئاً: المحاكي يُرجع المجموعةَ كاملةً افتراضاً، فتصل CM2 في اللقطة الحيّة
     ويمرّ الفحصُ **حتى مع تعطيل الإصلاح**. (اكتُشف بردّ السطر: مرّ وهو معطَّل.) */
  window.__mockWhere = true;
  window.__store['staff_tasks/CM2'] = {
    title: 'مهمّةٌ لستُ طرفاً فيها', status: 'open', kind: 'task',
    createdByUser: 'khaled', createdAt: Date.now() - 4000,
    assignedToUser: 'saeed', assignedToName: 'سعيد',
    participants: ['khaled', 'saeed'], shared: [], comments: []
  };
  staffTasks.back(); staffTasks.stopSync(); staffTasks.startSync();
  staffTasks.tab('all');
  staffTasks.loadAll();                  // الخانةُ حُمِّلت في قسمٍ سابق فلا تُعاد من نفسها
  await new Promise(r => setTimeout(r, 1100));
  staffTasks.open('CM2');
  await new Promise(r => setTimeout(r, 400));
  const el = document.getElementById('st-cmt-CM2');
  if (!el) return { drawn: false };
  el.value = 'ملاحظةٌ من الإدارة';
  staffTasks.addComment('CM2');
  await new Promise(r => setTimeout(r, 1400));
  const out = { drawn: true,
                doc: (window.__store['staff_tasks/CM2'].comments || []).map(c => c.text),
                ui: [...document.querySelectorAll('#page-staff-tasks .st-note')].map(n => n.textContent) };
  window.__mockWhere = false;            // لا يُترك مرفوعاً لما بعده
  return out;
});
check('★★★ وملاحظةٌ على مهمّةٍ خارج المستمع الحيّ تُكتب فعلاً',
  outside.drawn && outside.doc.join('') === 'ملاحظةٌ من الإدارة', JSON.stringify(outside));
check('★★★ وتظهر على الشاشة بلا إعادة تحميل (جلبةٌ صريحةٌ تعوّض غيابَ اللقطة)',
  outside.ui && outside.ui.length === 1 && /ملاحظةٌ من الإدارة/.test(outside.ui[0]),
  JSON.stringify(outside.ui));
await page.evaluate(() => { staffTasks.back(); staffTasks.tab('mine'); });
await page.waitForTimeout(400);

/* ═════════ ٥-و) «تمّ الإنجاز» يحمل الملاحظةَ معه ═════════
   طلبُ المالك (09/09): «زر تم الإنجاز يعمل عمل زر الإرسال للملاحظات». وآخرُ ما
   يُكتب قبل الإغلاق هو خلاصةُ العمل، وكان يضيع صامتاً حين يُعاد رسمُ الشاشة. */
L('\n=== ٥-و) «تمّ الإنجاز» يحمل الملاحظة ===');
const doneWith = await page.evaluate(async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  window.__store['staff_tasks/DN1'] = {
    title: 'مهمّةٌ تُنجَز بخلاصة', status: 'open', kind: 'task',
    createdByUser: 'admin', createdAt: Date.now() - 5000,
    assignedToUser: 'khaled', assignedToName: 'خالد',
    participants: ['admin', 'khaled'], shared: [], comments: []
  };
  currentUser = { user: 'khaled', name: 'خالد', role: 'مشرف' };
  staffTasks.stopSync(); staffTasks.startSync();
  await wait(800);
  staffTasks.open('DN1');
  await wait(400);
  const el = document.getElementById('st-cmt-DN1');
  if (!el) return { drawn: false };
  el.value = 'رُكِّب المحرّك، ناقصٌ فلتر';
  /* بنقرٍ حقيقيٍّ على الزرّ لا بنداءٍ برمجيّ */
  const btn = [...document.querySelectorAll('#page-staff-tasks .btn')].find(b => /تمّ الإنجاز/.test(b.textContent));
  if (!btn) return { drawn: true, btn: false };
  btn.click();
  await wait(1400);
  const d = window.__store['staff_tasks/DN1'];
  const fld = document.getElementById('st-cmt-DN1');
  return { drawn: true, btn: true, status: d.status,
           comments: (d.comments || []).map(c => c.text),
           by: (d.comments || []).map(c => c.user),
           cleared: fld ? fld.value : '(الحقلُ غاب)',
           ui: [...document.querySelectorAll('#page-staff-tasks .st-note')].map(n => n.textContent) };
});
check('زرُّ «تمّ الإنجاز» مرسومٌ في التفصيل', doneWith.drawn === true && doneWith.btn === true, JSON.stringify(doneWith));
check('★★★ ما في حقل الملاحظة يُحفَظ مع الإنجاز (كان يضيع صامتاً)',
  doneWith.comments && doneWith.comments.join('') === 'رُكِّب المحرّك، ناقصٌ فلتر', JSON.stringify(doneWith.comments));
check('★★★ والمهمّةُ أُنجزت في الكتابة نفسِها (لا تُغلق بلا خلاصتها ولا خلاصةَ بلا إغلاق)',
  doneWith.status === 'done', String(doneWith.status));
check('★★ والملاحظةُ منسوبةٌ لمن كتبها لا لمن أنشأ المهمّة',
  doneWith.by && doneWith.by.join('') === 'khaled', JSON.stringify(doneWith.by));
check('★ وتظهر في قائمة الملاحظات بعد الإنجاز', doneWith.ui && doneWith.ui.length === 1, JSON.stringify(doneWith.ui));

/* وحقلٌ فارغ: إنجازٌ بلا ملاحظةٍ فارغةٍ تُقحَم */
const doneEmpty = await page.evaluate(async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  window.__store['staff_tasks/DN2'] = {
    title: 'مهمّةٌ بلا خلاصة', status: 'open', kind: 'task',
    createdByUser: 'admin', createdAt: Date.now() - 4000,
    assignedToUser: 'khaled', assignedToName: 'خالد',
    participants: ['admin', 'khaled'], shared: [], comments: []
  };
  staffTasks.back(); staffTasks.stopSync(); staffTasks.startSync();
  await wait(800);
  staffTasks.open('DN2');
  await wait(400);
  const el = document.getElementById('st-cmt-DN2');
  if (el) el.value = '   ';                 // مسافاتٌ وحدَها
  const btn = [...document.querySelectorAll('#page-staff-tasks .btn')].find(b => /تمّ الإنجاز/.test(b.textContent));
  btn.click();
  await wait(1200);
  const d = window.__store['staff_tasks/DN2'];
  return { status: d.status, comments: (d.comments || []).length };
});
check('★★ وإنجازٌ بحقلٍ فارغٍ (أو مسافاتٍ) لا يُقحم ملاحظةً بلا نصّ',
  doneEmpty.status === 'done' && doneEmpty.comments === 0, JSON.stringify(doneEmpty));
await page.evaluate(() => { staffTasks.back(); staffTasks.tab('mine'); });
await page.waitForTimeout(400);

/* ═════════ ٥-د) لونُ «فيها جديد» — ما يُقاس هنا وحدَه ═════════
   طلبُ المالك (08/09): «أحتاج إذا تم أي تحديث يظهر بلون مختلف للمهمّة».
   و`hail-tests` تُثبت المنطقَ نقيّاً ولا تُثبت **أنّ اللونَ يصل الشاشة ثم ينطفئ
   بالفتح**: بين المنطق والشاشة كتابةٌ إلى قاعدة البيانات بـ`FieldPath` (أسماءُ
   الدخول عربية، والمفتاحُ المنقوط يسقط على محلّل المسارات) — وهذا لا يُختبَر إلا
   بمتصفّحٍ ومحاكٍ يكتب فعلاً. */
L('\n=== ٥-د) لونُ «فيها جديد» يصل الشاشةَ وينطفئ بالفتح ===');
const NWTITLE = 'مهمّةٌ جديدةٌ من المدير';
const nw1 = await page.evaluate(async (ttl) => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const cardBy = (t) => [...document.querySelectorAll('#page-staff-tasks .st-card')]
    .find(c => (c.querySelector('.st-ttl') || {}).textContent === t);
  window.__store['staff_tasks/NW1'] = {
    title: ttl, status: 'open', kind: 'task',
    createdByUser: 'admin', createdAt: Date.now() - 60000,
    assignedToUser: 'khaled', assignedToName: 'خالد',
    /* حالةُ قراءةِ زميلٍ ثالث — تُترك هنا لتُثبت لاحقاً أنّ كتابتنا جرّاحيّة */
    participants: ['admin', 'khaled', 'saeed'], shared: ['saeed'], comments: [], seenBy: { saeed: 111 }
  };
  const out = {};
  /* (أ) صاحبُ الفعل لا يلتهب له سطرُه */
  currentUser = { user: 'admin', name: 'المسؤول', role: 'admin' };
  staffTasks.stopSync(); staffTasks.startSync(); staffTasks.tab('sent');
  await wait(700);
  out.ownerGlows = document.querySelectorAll('#page-staff-tasks .st-card.nw').length;
  /* (ب) والمكلَّفُ يراها ملوّنةً برقاقةٍ تقول ما جدّ */
  currentUser = { user: 'khaled', name: 'خالد', role: 'مشرف' };
  staffTasks.stopSync(); staffTasks.startSync(); staffTasks.tab('mine');
  await wait(700);
  const c = cardBy(ttl);
  out.glows = !!c && c.classList.contains('nw');
  out.pill = c ? (c.querySelector('.st-pill.nw') || {}).textContent : null;
  out.dot  = !!(c && c.querySelector('.st-ttl .st-dot'));
  return out;
}, NWTITLE);
check('★★★ مهمّةٌ كلّفني بها غيري ولم أفتحها بعد تظهر بلونٍ مختلف', nw1.glows === true, JSON.stringify(nw1));
check('★★ ورقاقةٌ تقول ما جدّ لا مجرّدَ لون', nw1.pill === 'جديدة', String(nw1.pill));
check('★★ ونقطةٌ قبل العنوان (اللونُ وحدَه لا يكفي لمن لا يميّزه)', nw1.dot === true);
check('★★★ ولا يلتهب سطرُ مَن صنع الحركةَ بنفسه (لونٌ كاذبٌ يُتعلَّم تجاهلُه)',
  nw1.ownerGlows === 0, nw1.ownerGlows + ' بطاقة');

/* الفتحُ يُطفئ اللون — بنقرٍ حقيقيٍّ لا بنداءٍ برمجيّ: بين البطاقة والدالّة سمةُ
   onclick تُقيَّم في النطاق العام، واسمٌ يسقط منه = زرٌّ ميتٌ بصمت. */
await page.evaluate((ttl) => [...document.querySelectorAll('#page-staff-tasks .st-card')]
  .find(c => (c.querySelector('.st-ttl') || {}).textContent === ttl).click(), NWTITLE);
await page.waitForTimeout(900);
const nw2 = await page.evaluate(async (ttl) => {
  const d = window.__store['staff_tasks/NW1'];
  const out = { seen: d.seenBy, updatedAt: d.updatedAt === undefined };
  staffTasks.back(); staffTasks.tab('mine');
  await new Promise(r => setTimeout(r, 500));
  const c = [...document.querySelectorAll('#page-staff-tasks .st-card')]
    .find(x => (x.querySelector('.st-ttl') || {}).textContent === ttl);
  out.stillGlows = !!c && c.classList.contains('nw');
  return out;
}, NWTITLE);
check('★★★ وفتحُها يُطفئ اللون (وإلا بقي مشتعلاً فبطل معناه)', nw2.stillGlows === false);
check('★★★ والفتحُ سجّل حالةَ القراءة باسمي أنا فعلاً في المستند',
  !!nw2.seen && typeof nw2.seen.khaled === 'number', JSON.stringify(nw2.seen));
check('★★★ ولم يمحُ حالةَ قراءةِ زميلي (كتابةٌ جرّاحيّةٌ بـFieldPath لا خريطةٌ كاملة)',
  !!nw2.seen && nw2.seen.saeed === 111, JSON.stringify(nw2.seen));
check('★★★ والقراءةُ لم تُختَم تعديلاً في سجلّ المهمّة (updatedAt لم يُمَسّ)', nw2.updatedAt === true);

/* ثم يعود اللونُ بحركةٍ جديدةٍ بعد قراءتي — وهو بيتُ القصيد */
const nw3 = await page.evaluate(async (ttl) => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const d = window.__store['staff_tasks/NW1'];
  window.__store['staff_tasks/NW1'] = Object.assign({}, d, {
    comments: [{ user: 'admin', name: 'المسؤول', text: 'عاجل', at: new Date().toISOString() }] });
  staffTasks.stopSync(); staffTasks.startSync(); staffTasks.tab('mine');
  await wait(700);
  const c = [...document.querySelectorAll('#page-staff-tasks .st-card')]
    .find(x => (x.querySelector('.st-ttl') || {}).textContent === ttl);
  return { glows: !!c && c.classList.contains('nw'), pill: c ? (c.querySelector('.st-pill.nw') || {}).textContent : null };
}, NWTITLE);
check('★★★ وتعليقُ زميلٍ بعد قراءتي يُعيد اللون', nw3.glows === true, JSON.stringify(nw3));
check('★★ والرقاقةُ تقول «تعليقٌ جديد» لا «جديدة»', nw3.pill === 'تعليقٌ جديد', String(nw3.pill));

/* واللونُ من نظام المنصّة لا من رقمٍ مكتوب: ينقلب مع الوضع الداكن كما ينقلب ما حوله */
/* والمقارنةُ ببطاقةٍ عاديةٍ لا بقيمةٍ مكتوبة: اللونُ من `color-mix` على متغيّرات
   المنصّة، وشكلُ ما يُرجعه المتصفّح يتبدّل بين إصدارٍ وآخر (`rgb()` مرّةً
   و`color(srgb …)` أخرى) — فحارسٌ على النصّ يسقط بلا عطلٍ في الشاشة. المقصودُ
   أن **يفترق** الملوَّنُ عن غيره لا أن يساوي رقماً بعينه. */
const nwColor = await page.evaluate(() => {
  const on = document.querySelector('#page-staff-tasks .st-card.nw');
  /* بطاقةٌ عاديةٌ تُركَّب للقياس: قائمةُ المكلَّف في هذه اللحظة **كلُّها ملوّنة**
     (كلُّ ما كلّفه به المديرُ لم يُفتح بعد)، فلا نظيرَ في الشاشة يُقاس عليه. */
  const ref = document.createElement('div');
  ref.className = 'st-card';
  document.getElementById('page-staff-tasks').appendChild(ref);
  const out = { on: on ? getComputedStyle(on).backgroundColor : '',
                off: getComputedStyle(ref).backgroundColor };
  ref.remove();
  return out;
});
check('★★ وخلفيةُ «فيها جديد» تفترق فعلاً عن البطاقة العادية (لا صنفٌ بلا قاعدة)',
  !!nwColor.on && !!nwColor.off && nwColor.on !== nwColor.off, JSON.stringify(nwColor));

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
