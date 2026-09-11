/* ═══════════════════════════════════════════════════════════════════════════
   نظام هيل — خزانة الوثائق  (doc-vault.js)

   ملفٌّ خارجيٌّ مستقلٌّ على نمط `contracts.js` و`project-management.js`: IIFE يعرّض
   كائناً واحداً `window.docVault`، **يركّب صفحتيه وقائمته الجانبية وزرَّه الخارجيَّ
   ذاتياً ويلفّ `showPage`** — فلا يحتاج من `index.html` إلا وسمَ <script> واحداً
   ومفتاحَ صلاحيةٍ في مصدر المفاتيح. ويقرأ خدماتِ النواة بالاسم المجرّد وقتَ النداء
   (`db` · `storage` · `firebase` · `esc` · `toast` · `showConfirm` · `logAudit` ·
   `addNotification` · `_svgIcon` · `_permOn` · `currentUser` · `IS_DEV`) — إذ
   تتشارك كلُّ وسوم <script> الكلاسيكية البيئةَ المعجميةَ العامة نفسَها.

   ── المشكلة ──
   وثائقُ الشركة نفسِها — السجلُّ التجاريّ · شهادةُ الزكاة · التأمينات · السعودة ·
   شهادةُ التصنيف · رخصةُ البلدية · وثائقُ التأمين — **لا مكانَ لها في المنصّة**.
   تعيش في مجلَّدٍ على جهازٍ أو في محادثةِ واتساب، وتاريخُ انتهائها في ذاكرة شخصٍ
   واحد. وانتهاءُ شهادةٍ لا يُنبّه عليه أحدٌ حتى تُطلَب في مناقصةٍ أو عند فسحٍ جمركيّ
   فتكون قد انتهت — والتجديدُ يحتاج أسابيع لا ساعات. والخطاباتُ الرسمية كذلك:
   «مساعدُ الخطابات» يولّدها ثم **يفقدها** — لا مستودعَ لنموذجٍ ولا لخطابٍ صادر.

   ── المبدأ: نصفان لأنّ الزمنَ فيهما مختلف ──
   • **ما ينتهي** (السجلّات والشهادات): سؤالُه الوحيدُ «متى؟» — فشكلُه **أفقٌ زمنيّ**.
   • **ما يتراكم** (الخطابات): سؤالُه «أين؟ وبأيّ رقم؟» — فشكلُه **سجلٌّ مرقَّم**.
   عرضُهما بشكلٍ واحدٍ يُخفي السؤالَ الذي يخصّ كلاًّ منهما.

   ── لماذا أفقٌ لا صفُّ أرقام ──
   «١٢ وثيقة · ٣ توشك» يقول **كم** ولا يقول **متى**، والقرارُ يُتَّخذ على «متى» وحدَه.
   الأفقُ يُظهر التزاحمَ: أربعُ شهاداتٍ تنتهي في فبراير ⇒ يبدأ الإجراءُ في ديسمبر.
   وما عدا الأفق هادئٌ عمداً — جدولٌ صريحٌ ورقاقةُ صلاحيةٍ صغيرة، لا أكثر.

   ── سلّمُ تنبيهٍ رباعيٌّ لا عتبةٌ واحدة ──
   `90` (ابدأ) · `60` (تابع) · `30` (عاجل) · `7` (خطر) · ثمّ **منتهية**. عتبةُ الثلاثين
   وحدَها — وهي عتبةُ وثائق الأطراف في `contracts.js` — تصل متأخّرةً لِما يستغرق
   تجديدُه شهرين كشهادة التصنيف.

   ── حسابُ الأيام هنا، ومربوطٌ بمحرّك التعاقدات بفحصٍ لا بنداء ──
   `contracts.js` يملك `docExpiryState` يحسب الأيامَ بالحساب نفسِه. ولم نُنادِه وقتَ
   التشغيل لأنّ سياستَه ثلاثيةٌ بعتبةٍ ثابتةٍ (٣٠) وسياستُنا سلّمٌ خماسيّ، ولأنّ
   النداءَ يربط شاشتَنا بتحميلِ وحدةٍ أخرى فتسقط الخزانةُ إن سقطت. فالحسابُ هنا،
   **والانحرافُ يمسكه حارسٌ في `hail-tests.js`** يطابق `docVault.daysUntil` بـ
   `contracts._docExpiryState().days` على جدول تواريخ. فلا اقترانَ وقتَ التشغيل،
   ولا انحرافٌ صامتٌ بعد شهر.

   ── التجديدُ يحفظ التاريخَ ولا يمحوه ──
   «جدّد» يُنزل النسخةَ القائمة — بمدّتها ورقمها ومرفقها — إلى `history[]` ثمّ يفتح
   مدّةً جديدة. فتبقى الوثيقةُ **كياناً واحداً** له سجلُّ تجديداتٍ يُقرأ، لا صفَّين
   متكرّرَين بالاسم نفسِه. ووثيقةٌ تُكتب فوق أخرى **دليلٌ يضيع**، والدليلُ لا يُمحى.

   ── الصلاحية: مفتاحٌ **مانحٌ** واحد ──
   `permissions.docVault` (طلبُ المالك: «أضفه في الصلاحيات … لكي أضيف الدور لأشخاص
   محددين»). مانحٌ لا حاجب: **الافتراضُ ممنوع**، فلا تنفتح خزانةُ وثائق الشركة لكلّ
   مستخدمٍ قائمٍ بأثرٍ رجعيّ لمجرّد أنّ الحاجباتِ مسموحةٌ بالافتراض. ويظهر المفتاحُ
   لأدوار الوضعين معاً — المشاريعِ والمشترياتِ المركزية — فالوثائقُ ليست تابعةً
   لأحدهما. **والزائرُ والمراقبُ يريان ولا يكتبان** وإن مُنحا، **والحذفُ للأدمن
   وحدَه**: مَن يحذف وثيقةً يمحو دليلاً.

   ── التخزين ──
   `global_docs` و`global_letters` (+ نسختا `_dev`)، والعدّادان في `meta/…_counter`.
   المرفقاتُ تحت البادئة القائمة `po/vault/…` عمداً — قواعدُ Storage تُدار خارج
   المستودع، ومسارٌ جذريٌّ جديد قد يُرفَض صامتاً عند الرفع (درسُ `hr-payments.js`).

   ── التصميم البصريّ ──
   بلا لونٍ جديدٍ ولا خطٍّ جديد: توكنزُ المنصّة وحدَها (`--primary` · `--surface` ·
   `--muted` · `--warn` · `--danger` · سلّمُ `--rank`)، و`Cairo` للعناوين
   و`JetBrains Mono` بـ`tabular-nums` و`direction:ltr` لكلّ رقمٍ وتاريخ. فالوحدةُ
   جزءٌ أصيلٌ من النظام في الثيمين معاً بلا صيانةِ لونٍ منفصلة.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
"use strict";

var MODULE_BUILD = "v18.9.3125";

var PAGE_DOCS    = "vault-docs";
var PAGE_LETTERS = "vault-letters";
var PAGES        = [PAGE_DOCS, PAGE_LETTERS];
var PERM_KEY     = "docVault";

var HORIZON_MONTHS = 12;     // مدى الأفق — سنةٌ تُغطّي كلَّ دوراتِ التجديد السنوية
var DOT_CAP        = 5;      // نقاطُ الشهر قبل أن تُختصر إلى «+ن»
var LS_ALERTED     = "hail_vault_alerted";   // كتمُ تكرار التنبيه على هذا الجهاز

/* ════════ خدماتُ النواة بالاسم المجرّد وقتَ النداء ════════ */
function _dev(){ try{ return (typeof IS_DEV !== "undefined" && IS_DEV); }catch(e){ return false; } }
function DOCS_COLL(){ return _dev() ? "global_docs_dev"   : "global_docs"; }
function LTRS_COLL(){ return _dev() ? "global_letters_dev" : "global_letters"; }
function DOCS_CTR(){  return _dev() ? "meta/global_docs_counter_dev"    : "meta/global_docs_counter"; }
function LTRS_CTR(){  return _dev() ? "meta/global_letters_counter_dev" : "meta/global_letters_counter"; }

function _esc(v){ try{ return (typeof esc === "function") ? esc(v) : String(v == null ? "" : v); }
                  catch(e){ return String(v == null ? "" : v); } }
function _jq(v){  try{ return (typeof _jsq === "function") ? _jsq(String(v == null ? "" : v))
                                                           : String(v == null ? "" : v).replace(/['"\\]/g, "\\$&"); }
                  catch(e){ return ""; } }
function _toast(m, k){ try{ if(typeof toast === "function") toast(m, k); }catch(e){} }
function _svg(n){ try{ return (typeof _svgIcon === "function") ? _svgIcon(n) : ""; }catch(e){ return ""; } }
function _icon(n, c){ try{ return (typeof _ic === "function") ? _ic(n, c) : ""; }catch(e){ return ""; } }
function _db(){ try{ return (typeof db !== "undefined") ? db : null; }catch(e){ return null; } }
function _st(){ try{ return (typeof storage !== "undefined") ? storage : null; }catch(e){ return null; } }
function _fb(){ try{ return (typeof firebase !== "undefined") ? firebase : null; }catch(e){ return null; } }
function _me(){ try{ return (typeof currentUser !== "undefined") ? currentUser : null; }catch(e){ return null; } }
function _myName(){ var u = _me(); return (u && (u.name || u.user)) || ""; }
function _audit(a, d){ try{ if(typeof logAudit === "function") logAudit(a, d); }catch(e){} }
function _notify(t, b, k){ try{ if(typeof addNotification === "function") addNotification(t, b, null, k); }catch(e){} }
function _confirm(o){ try{ return (typeof showConfirm === "function") ? showConfirm(o) : Promise.resolve(true); }
                      catch(e){ return Promise.resolve(false); } }

/* ════════ الصلاحية ════════
   مفتاحٌ **مانح**: يُقرأ بعلامةٍ صريحة `=== true` لا باصطلاح الحاجب. ونقرؤه من
   `_permOn` في النواة حين تتوفّر — **مصدرٌ واحدٌ للقراءة** كما تفعل بقيّةُ المنصّة —
   وإلّا فبالمقارنة نفسِها حرفياً (الاصطلاحان متطابقان للمفتاح المانح). */
function canView(){
  var u = _me();
  if(!u) return false;
  if(u.role === "admin") return true;
  try{ if(typeof _permOn === "function") return _permOn(u.permissions, PERM_KEY, u) === true; }catch(e){}
  return !!(u.permissions && u.permissions[PERM_KEY] === true);
}
/* الزائرُ والمراقبُ يريان ولا يكتبان وإن مُنح المفتاح — والخادمُ يردّ كتابتَهما
   أصلاً، فهذا حارسٌ ثانٍ لا الوحيد. */
function canEdit(){
  var u = _me();
  if(!u || !canView()) return false;
  return u.role !== "viewer" && u.role !== "observer";
}
function canDelete(){ var u = _me(); return !!(u && u.role === "admin"); }
/* هل يستحقّ هذا الدورُ خانةً في نافذة الصلاحيات؟ الخزانةُ ليست تابعةً لوضعٍ دون
   وضع، فالخانةُ تُعرض للجميع — والمنعُ بالمفتاح لا بإخفاء الخانة. تقرؤها النواةُ
   بالاسم فلا تُنسَخ قائمةُ الأدوار في موضعين. */
function roleEligible(role){ return role !== "admin"; }

/* ════════ أنواعُ الوثائق ════════
   قائمةٌ مغلقةٌ مقصودة: حقلٌ حرٌّ يُنتج «سجل تجاري» و«س.ت» و«السجل التجارى» ثلاثةَ
   أنواعٍ لوثيقةٍ واحدة، فينكسر الترشيحُ والعدّ. و«وثيقة أخرى» بابُ ما لم يُحصَ. */
var DOC_TYPES = [
  { key:"cr",             lbl:"السجل التجاري" },
  { key:"zakat",          lbl:"شهادة الزكاة والدخل" },
  { key:"gosi",           lbl:"شهادة التأمينات الاجتماعية" },
  { key:"saudization",    lbl:"شهادة السعودة (نطاقات)" },
  { key:"vat",            lbl:"شهادة ضريبة القيمة المضافة" },
  { key:"chamber",        lbl:"عضوية الغرفة التجارية" },
  { key:"municipal",      lbl:"رخصة البلدية" },
  { key:"classification", lbl:"شهادة تصنيف المقاولين" },
  { key:"iso",            lbl:"شهادة جودة (ISO)" },
  { key:"insurance",      lbl:"وثيقة تأمين" },
  { key:"bank",           lbl:"شهادة أو خطاب بنكي" },
  { key:"license",        lbl:"رخصة أو تصريح" },
  { key:"agreement",      lbl:"عقد أو اتفاقية" },
  { key:"other",          lbl:"وثيقة أخرى" }
];
var DOC_LBL = (function(){ var m = {}; DOC_TYPES.forEach(function(d){ m[d.key] = d.lbl; }); return m; })();

/* ════════ «وثيقة أخرى» تُسمّى بيدها ════════
   قائمةُ الأنواع مغلقةٌ عمداً (حقلٌ حرٌّ يُنتج «سجل تجاري» و«س.ت» ثلاثةَ أنواعٍ لواحد)،
   لكنّ بابَ «أخرى» بلا اسمٍ يعيد المشكلةَ من جهةٍ أخرى: عشرُ وثائقَ مختلفةٍ تُقرأ
   كلُّها «وثيقة أخرى» فلا يُميَّز بينها في جدولٍ ولا ترشيح. فالاسمُ اليدويّ يُطلَب
   عند اختيارها، ويحلّ محلَّ التسمية العامّة **في كلّ موضعٍ تُقرأ فيه**.
   ولذلك تسميةٌ واحدةٌ تخدم الجدولَ والبطاقةَ والبحثَ والتنبيه — لو تفرّقت لقرأ
   المستخدمُ «وثيقة أخرى» في الجدول واسمَها الحقيقيَّ في البطاقة. */
function typeLabel(doc){
  if(!doc) return "";
  var k = String(doc.docType || "");
  if(k === "other"){
    var custom = String(doc.docTypeOther || "").trim();
    if(custom) return custom;
  }
  return DOC_LBL[k] || k || "—";
}

/* ════════ المستخدمون — مصدرُ منتقي مسؤول التجديد ════════
   `USERS` عالميّةٌ تحمل `{ user, name, role, phone?, waOptIn? }` (يقرؤها
   `functions/lib/recipients.js` نفسُها لإيجاد أرقام واتساب). نقرؤها بالاسم المجرّد
   وقتَ النداء كبقيّة خدمات النواة. */
function _users(){
  try{ return (typeof USERS !== "undefined" && Array.isArray(USERS)) ? USERS : []; }
  catch(e){ return []; }
}
function _userByLogin(login){
  var l = String(login || ""), arr = _users();
  for(var i = 0; i < arr.length; i++) if(arr[i] && arr[i].user === l) return arr[i];
  return null;
}
/* أللمستخدم رقمُ واتساب مفعَّل؟ الشرطان معاً كما يقرؤهما الخادم حرفياً
   (`u.phone && u.waOptIn === true`) — فلا تَعِد الشاشةُ بوصولٍ يردّه الخادم. */
function _hasWa(u){ return !!(u && u.phone && u.waOptIn === true); }

/* ════════ اسمُ مسؤول التجديد كما يُعرض ════════
   المصدرُ الأوّل `ownerUser` (اسمُ الدخول — المفتاحُ الثابت الذي يصل به التنبيهُ إلى
   صاحبه)، فيُقرأ منه الاسمُ **الطازج** من `USERS`: مَن غيّر اسمَه المعروض لا يصير
   شخصاً آخر في وثائقه. و`owner` نسخةٌ محفوظةٌ تحلّ محلَّه إن غاب المستخدمُ من
   القائمة (حُذف حسابُه) — فلا يُفقَد مَن كان مسؤولاً. */
function ownerLabel(doc){
  if(!doc) return "";
  var u = doc.ownerUser ? _userByLogin(doc.ownerUser) : null;
  if(u) return String(u.name || u.user || "");
  return String(doc.owner || "");
}

/* مراتبُ سلّم التنبيه — مرتّبةٌ من الأسوأ. `tone` صنفُ اللون، و`lbl` ما يُقرأ. */
var LEVELS = [
  { key:"expired",  lbl:"منتهية",          short:"منتهية" },
  { key:"critical", lbl:"تنتهي خلال أسبوع", short:"أسبوع" },
  { key:"urgent",   lbl:"تنتهي خلال شهر",   short:"شهر" },
  { key:"soon",     lbl:"تنتهي خلال شهرين", short:"شهران" },
  { key:"plan",     lbl:"ابدأ التجديد",     short:"٣ أشهر" },
  { key:"ok",       lbl:"سارية",            short:"سارية" },
  { key:"none",     lbl:"بلا تاريخ انتهاء", short:"دائمة" }
];
var LEVEL_LBL = (function(){ var m = {}; LEVELS.forEach(function(l){ m[l.key] = l.lbl; }); return m; })();

var MONTH_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو",
                "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

/* ═══════════════════════════════════════════════════════════════════════════
   الدوالُّ النقيّة — لا DOM ولا شبكة ولا ساعة. `today` يُمرَّر ولا يُقرأ، فيفحصها
   `hail-tests.js` بلا متصفّح (قاعدةُ CLAUDE.md ٥).
   ═══════════════════════════════════════════════════════════════════════════ */

/* الأيامُ حتى الانتهاء — سالبةٌ لما مضى، و`null` لما لا تاريخَ له أو لتاريخٍ فاسد.
   الحسابُ على منتصف ليل UTC للطرفين، فلا يُزحزحه فارقُ التوقيت ولا التوقيتُ الصيفي:
   الفرقُ بين تاريخين مدنيَّين عددُ أيامٍ صحيح، ولو حُسب بالساعات المحلّية لأنتج
   ‎٢٩٫٩٥‎ يوماً فيُقرّب إلى ٣٠ فتقفز الوثيقةُ مرتبةً كاملةً بلا سبب. */
function daysUntil(expiry, today){
  if(!expiry) return null;
  var t = (today instanceof Date) ? today : new Date(today || Date.now());
  var d = new Date(String(expiry));
  if(isNaN(d.getTime()) || isNaN(t.getTime())) return null;
  var t0 = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  var d0 = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((d0 - t0) / 86400000);
}

/* مرتبةُ التنبيه من عدد الأيام. حدودٌ **مُغلَقةٌ من أعلى** (`<=`) فلا يوم يسقط بين
   مرتبتين: اليومُ السابع «خطر» لا «عاجل»، والثلاثون «عاجل» لا «شهران». */
function alertLevel(days){
  if(days === null || days === undefined || isNaN(days)) return "none";
  if(days <  0)  return "expired";
  if(days <= 7)  return "critical";
  if(days <= 30) return "urgent";
  if(days <= 60) return "soon";
  if(days <= 90) return "plan";
  return "ok";
}

/* مرتبةُ وثيقةٍ بعينها — الدائمةُ (`noExpiry`) خارجُ السلّم بلا تاريخٍ يُقاس. */
function docLevel(doc, today){
  if(!doc) return "none";
  if(doc.noExpiry || !doc.expiry) return "none";
  return alertLevel(daysUntil(doc.expiry, today));
}

/* أهذه المرتبةُ تستدعي عملاً اليوم؟ الثلاثُ الأُوَل وحدَها — وما دونها تخطيط. */
function needsAction(level){
  return level === "expired" || level === "critical" || level === "urgent";
}

/* ════════ أفقُ الانتهاءات — العنصرُ المميِّز للشاشة ════════
   يفرش `months` شهراً من **الشهر الجاري**، ويوزّع الوثائقَ على شهور انتهائها.
   ثلاثةُ مخارج: `overdue` (ما مضى — يُحشَر في كعبٍ لا في الأفق) · `months` ·
   `beyond` (أبعدُ من المدى — يُلخَّص برقمٍ ولا يُفرَش، وإلّا امتدّ الشريطُ بلا حدّ).
   الشهرُ **موجودٌ ولو خلا** — الفراغُ نصفُ المعلومة: «مارس فارغ» تخطيطٌ كما
   «فبراير مزدحم». */
function horizonBuckets(list, today, months){
  var m = Math.max(1, Math.floor(Number(months) || HORIZON_MONTHS));
  var t = (today instanceof Date) ? today : new Date(today || Date.now());
  if(isNaN(t.getTime())) t = new Date();
  var buckets = [], idx = {}, i, d, ym;
  for(i = 0; i < m; i++){
    d  = new Date(t.getFullYear(), t.getMonth() + i, 1);
    ym = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    idx[ym] = { ym:ym, year:d.getFullYear(), month:d.getMonth() + 1,
                label:MONTH_AR[d.getMonth()], now:(i === 0), docs:[] };
    buckets.push(idx[ym]);
  }
  var overdue = [], beyond = [];
  (Array.isArray(list) ? list : []).forEach(function(doc){
    if(!doc || doc.archived) return;
    if(doc.noExpiry || !doc.expiry) return;
    var days = daysUntil(doc.expiry, t);
    if(days === null) return;
    if(days < 0){ overdue.push(doc); return; }
    var e = new Date(String(doc.expiry));
    var key = e.getFullYear() + "-" + String(e.getMonth() + 1).padStart(2, "0");
    if(idx[key]) idx[key].docs.push(doc); else beyond.push(doc);
  });
  return { overdue:overdue, months:buckets, beyond:beyond };
}

/* ════════ الحصيلة — عددٌ لكلّ مرتبة، و`act` ما يستحقّ عملاً اليوم ════════ */
function rollup(list, today){
  var out = { total:0, expired:0, critical:0, urgent:0, soon:0, plan:0, ok:0, none:0, act:0 };
  (Array.isArray(list) ? list : []).forEach(function(doc){
    if(!doc || doc.archived) return;
    out.total++;
    var lvl = docLevel(doc, today);
    out[lvl] = (out[lvl] || 0) + 1;
  });
  out.act = out.expired + out.critical + out.urgent;
  return out;
}

/* ════════ الرقمُ المرجعيّ — `DOC-YYMM-NNNN` ════════
   الشهرُ في الرقم يجعله يقول متى أُنشئ بلا فتحِ الوثيقة، والتسلسلُ **عامٌّ لا
   شهريّ**: عدّادٌ يُصفَّر كلَّ شهرٍ يُنتج رقمين متطابقين في سنتين. */
function nextRef(prefix, n, date){
  var d = date ? new Date(date) : new Date();
  if(isNaN(d.getTime())) d = new Date();
  var yy  = String(d.getFullYear()).slice(-2);
  var mm  = String(d.getMonth() + 1).padStart(2, "0");
  var seq = String(Math.max(1, Math.floor(Number(n) || 1))).padStart(4, "0");
  return String(prefix || "DOC") + "-" + yy + mm + "-" + seq;
}

/* ════════ التجديد — دالّةٌ نقيّةٌ تُنزل القائمَ إلى السجلّ ثمّ تفتح مدّةً جديدة ════════
   لا تكتب شيئاً ولا تقرأ ساعةً: تأخذ الوثيقةَ والمدّةَ الجديدةَ وتردّ وثيقةً جديدة.
   والنسخةُ القائمةُ تُدفع إلى **رأس** `history` — الأحدثُ أوّلاً كما يُقرأ السجلّ.
   ولا يُنزَل إلى السجلّ ما لا مضمونَ له (وثيقةٌ أُنشئت فارغةً ثم مُلئت)، وإلّا
   امتلأ السجلُّ بنسخٍ خاوية. */
function renewDoc(doc, patch, at, by){
  var d = doc || {}, p = patch || {};
  var hist = Array.isArray(d.history) ? d.history.slice() : [];
  var hadContent = !!(d.expiry || d.start || (Array.isArray(d.files) && d.files.length));
  if(hadContent){
    hist.unshift({
      start:  String(d.start  || ""),
      expiry: String(d.expiry || ""),
      number: String(d.number || ""),
      files:  Array.isArray(d.files) ? d.files.slice() : [],
      renewedAt: at || new Date().toISOString(),
      renewedBy: String(by || "")
    });
  }
  var out = {};
  Object.keys(d).forEach(function(k){ out[k] = d[k]; });
  out.start   = String(p.start  == null ? "" : p.start);
  out.expiry  = String(p.expiry == null ? "" : p.expiry);
  out.number  = String(p.number == null ? (d.number || "") : p.number);
  out.files   = Array.isArray(p.files) ? p.files.slice() : [];
  out.history = hist;
  out.renewCount = hist.length;
  return out;
}

/* ════════ الترشيح — دالّةٌ نقيّةٌ واحدةٌ تخدم الجدولَ والعدّ معاً ════════
   لو رشّح الجدولُ بقاعدةٍ وعدَّ الرأسُ بأخرى لَقرأ المستخدمُ «٣ نتائج» فوق صفٍّ واحد. */
function filterDocs(list, f, today){
  var q     = String((f && f.q) || "").trim().toLowerCase();
  var type  = String((f && f.type)  || "");
  var level = String((f && f.level) || "");
  var ym    = String((f && f.ym)    || "");
  return (Array.isArray(list) ? list : []).filter(function(doc){
    if(!doc || doc.archived) return false;
    if(type  && doc.docType !== type) return false;
    if(level && docLevel(doc, today) !== level) return false;
    if(ym){
      if(ym === "overdue"){ if(docLevel(doc, today) !== "expired") return false; }
      else if(String(doc.expiry || "").slice(0, 7) !== ym) return false;
    }
    if(q){
      /* الحصيرةُ تحمل **التسميةَ المعروضة** لا المفتاح: مَن يرى «شهادة اشتراك في
         الهيئة» في الجدول يبحث عنها بنصّها، لا بـ`other`. ويُضاف اسمُ المسؤول
         الطازجُ واسمُ دخوله معاً — يُبحَث بأيّهما. */
      var hay = [doc.title, doc.number, doc.issuer, doc.notes, doc.id,
                 typeLabel(doc), doc.docTypeOther,
                 ownerLabel(doc), doc.owner, doc.ownerUser].join(" ").toLowerCase();
      if(hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}

/* ترتيبٌ ثابت: الأقربُ انتهاءً أوّلاً، والدائمةُ آخراً (لا موعدَ لها يُسابَق)،
   وعند التساوي بالاسم — فلا يرقص الجدولُ بين رسمتين على البيانات نفسِها. */
function sortDocs(list, today){
  var arr = (Array.isArray(list) ? list : []).slice();
  arr.sort(function(a, b){
    var da = (a.noExpiry || !a.expiry) ? null : daysUntil(a.expiry, today);
    var dbb= (b.noExpiry || !b.expiry) ? null : daysUntil(b.expiry, today);
    if(da === null && dbb === null) return String(a.title||"").localeCompare(String(b.title||""), "ar");
    if(da === null) return 1;
    if(dbb === null) return -1;
    if(da !== dbb) return da - dbb;
    return String(a.title||"").localeCompare(String(b.title||""), "ar");
  });
  return arr;
}

/* ════════ الخطابات ════════
   نوعان لا أكثر: `template` نموذجٌ يُستنسَخ، و`issued` خطابٌ صادرٌ معتمَدٌ برقمه.
   والاستنساخُ **يُفرِّغ** ما يخصّ الصادرَ وحدَه (الجهةُ والتاريخُ والمرفق) ويُبقي
   المتنَ والموضوع — فنموذجٌ يُستنسَخ بجهةِ خطابٍ سابقٍ يُرسَل إلى الجهة الخطأ. */
function cloneTemplate(tpl, at){
  var t = tpl || {};
  return {
    kind:    "issued",
    title:   String(t.title || ""),
    subject: String(t.subject || t.title || ""),
    body:    String(t.body || ""),
    party:   "",
    letterDate: String(at || "").slice(0, 10),
    files:   [],
    fromTemplate: String(t.id || "")
  };
}
function filterLetters(list, f){
  var q    = String((f && f.q) || "").trim().toLowerCase();
  var kind = String((f && f.kind) || "");
  return (Array.isArray(list) ? list : []).filter(function(l){
    if(!l || l.archived) return false;
    if(kind && l.kind !== kind) return false;
    if(q){
      var hay = [l.title, l.subject, l.party, l.ref, l.id, l.body].join(" ").toLowerCase();
      if(hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   الحالةُ والمزامنة — `onSnapshot` مصدرُ الحقيقة اللحظيّ
   ═══════════════════════════════════════════════════════════════════════════ */
var _docs = [], _ltrs = [];
var _docsUnsub = null, _ltrsUnsub = null;
var _docsLoaded = false, _ltrsLoaded = false, _err = "";

var _view = { q:"", type:"", level:"", ym:"" };      // ترشيحُ شاشة الوثائق
var _lview = { q:"", kind:"issued" };                // ترشيحُ شاشة الخطابات
var _edit = null;        // مسوّدةُ الوثيقة قيدَ التحرير (null = لا نموذج مفتوح)
var _ledit = null;       // مسوّدةُ الخطاب
var _open = null;        // معرّفُ الوثيقة المفتوحة (بطاقةُ التفاصيل)
var _renew = null;       // مسوّدةُ التجديد

function docs(){ return _docs.slice(); }
function letters(){ return _ltrs.slice(); }
function docById(id){ for(var i=0;i<_docs.length;i++) if(_docs[i].id === id) return _docs[i]; return null; }
function letterById(id){ for(var i=0;i<_ltrs.length;i++) if(_ltrs[i].id === id) return _ltrs[i]; return null; }

function startSync(){
  var d = _db();
  if(!d || !canView()) return;
  if(!_docsUnsub){
    _docsUnsub = d.collection(DOCS_COLL()).onSnapshot(function(snap){
      _docs = snap.docs.map(function(s){ var v = s.data() || {}; v.id = s.id; return v; });
      _docsLoaded = true; _err = "";
      _repaint(PAGE_DOCS); refreshBadges(); scanAndAlert();
    }, function(e){ _err = String((e && e.message) || e); _repaint(PAGE_DOCS); });
  }
  if(!_ltrsUnsub){
    _ltrsUnsub = d.collection(LTRS_COLL()).onSnapshot(function(snap){
      _ltrs = snap.docs.map(function(s){ var v = s.data() || {}; v.id = s.id; return v; });
      _ltrsLoaded = true;
      _repaint(PAGE_LETTERS);
    }, function(e){ _err = String((e && e.message) || e); _repaint(PAGE_LETTERS); });
  }
}
function stopSync(){
  try{ if(_docsUnsub) _docsUnsub(); }catch(e){}
  try{ if(_ltrsUnsub) _ltrsUnsub(); }catch(e){}
  _docsUnsub = _ltrsUnsub = null;
  _docs = []; _ltrs = []; _docsLoaded = _ltrsLoaded = false;
}
function retry(){ stopSync(); startSync(); }

/* العدّادُ: معاملةٌ تقرأ الوثيقةَ الطازجةَ ثمّ تزيد — فلا يأخذ مُنشئان متزامنان
   الرقمَ نفسَه. ونمطُها نمطُ `hr-payments` و`contracts` حرفياً. */
function _nextId(prefix, ctrPath){
  var d = _db();
  if(!d) return Promise.reject(new Error("no-db"));
  var ref = d.doc(ctrPath);
  return d.runTransaction(function(tx){
    return tx.get(ref).then(function(snap){
      var n = (snap.exists && Number(snap.data().n)) || 0;
      n = n + 1;
      tx.set(ref, { n:n, updatedAt:new Date().toISOString() }, { merge:true });
      return nextRef(prefix, n);
    });
  });
}

/* ════════ رفعُ مرفق ════════
   تحت البادئة القائمة `po/vault/…` عمداً — لا مسارَ جذريٌّ جديد (درسُ hr-payments). */
function _upload(kind, id, file){
  var st = _st();
  if(!st) return Promise.reject(new Error("no-storage"));
  var safe = String(file.name || "file").replace(/[^\w؀-ۿ.\-]/g, "_").slice(-80);
  var dest = "po/vault/" + kind + "/" + id + "/" + Date.now() + "_" + safe;
  var ref  = st.ref(dest);
  return ref.put(file)
    .then(function(snap){ return snap.ref.getDownloadURL(); })
    .then(function(url){
      /* المسارُ يُحفَظ مع الرابط دائماً — قاعدةُ المنصّة: رابطُ التنزيل لا يُحذَف به
         ملفٌّ من Storage ولا يُستبدَل، فبلا المسار يبقى المرفوعُ يتيماً إلى الأبد. */
      return { name:String(file.name || safe), url:url, storagePath:ref.fullPath,
               size:Number(file.size || 0), at:new Date().toISOString(), by:_myName() };
    });
}
function _pickFile(cb){
  var inp = document.createElement("input");
  inp.type = "file";
  inp.accept = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx";
  inp.onchange = function(){ var f = inp.files && inp.files[0]; if(f) cb(f); };
  inp.click();
}

/* ════════ التنبيه ════════
   يُطلَق مرّةً لكلّ (وثيقة · مرتبة · يوم) على هذا الجهاز. بلا هذا الكتم يصرخ
   الجرسُ عند **كلّ تحديثِ صفحة** — وتنبيهٌ يتكرّر بلا جديدٍ يُهمَل، فيضيع الحقيقيُّ
   بين المكرَّر. والمفتاحُ في `localStorage` لا `sessionStorage`: التنبيهُ عادةُ يومٍ
   لا جلسةَ دخول. */
function _alertedKey(){
  try{ return JSON.parse(localStorage.getItem(LS_ALERTED) || "{}") || {}; }catch(e){ return {}; }
}
function _markAlerted(map){
  try{ localStorage.setItem(LS_ALERTED, JSON.stringify(map)); }catch(e){}
}
function scanAndAlert(today){
  if(!canView() || !_docsLoaded) return 0;
  var t = today || new Date();
  var day = new Date(t).toISOString().slice(0, 10);
  var seen = _alertedKey(), fired = 0, next = {};
  _docs.forEach(function(doc){
    /* المؤرشفةُ خارج التنبيه — `docLevel` تحسب المرتبةَ ولا تسأل عن الأرشفة (وهو
       صوابُها: الأرشفةُ قرارُ عرضٍ لا خاصيّةُ تاريخ). فالسؤالُ هنا، وإلّا صرخ الجرسُ
       على وثيقةٍ أُخرجت من الخزانة عمداً. أُمسك في الفحص قبل أن يصل مستخدماً. */
    if(!doc || doc.archived) return;
    var lvl = docLevel(doc, t);
    if(!needsAction(lvl)) return;
    var k = doc.id + "|" + lvl;
    next[k] = day;
    if(seen[k] === day) return;                    // نُبِّه عليه اليومَ بهذه المرتبة
    fired++;
    var days = daysUntil(doc.expiry, t);
    var _own = ownerLabel(doc);
    var body = (lvl === "expired")
      ? "انتهت منذ " + Math.abs(days) + " يوماً — " + (_own ? ("المسؤول: " + _own) : "بلا مسؤول تجديد")
      : "تنتهي بعد " + days + " يوماً (" + (doc.expiry || "") + ")"
        + (_own ? " — المسؤول: " + _own : "");
    _notify("📁 " + (doc.title || doc.id), body, "doc_expiry");
  });
  _markAlerted(next);      // ما لم يعد يستحقّ تنبيهاً يسقط من الذاكرة فلا تنتفخ
  return fired;
}

/* ═══════════════════════════════════════════════════════════════════════════
   الأنماط — توكنزُ المنصّة وحدَها، بلا لونٍ جديدٍ ولا خطٍّ جديد.
   تُحقَن وقتَ التشغيل فتأتي **بعد** `app.css` وتغلبها عند التساوي — وهو المقصود:
   كلاساتُنا بادئتُها `dv-` وحدَها ولا تمسّ قاعدةً من قواعد المنصّة.
   ═══════════════════════════════════════════════════════════════════════════ */
function injectCSS(){
  if(document.getElementById("dv-css")) return;
  var st = document.createElement("style");
  st.id = "dv-css";
  st.textContent = [
"#page-" + PAGE_DOCS + ",#page-" + PAGE_LETTERS + "{direction:rtl}",
".dv-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}",
".dv-ttl{font-size:19px;font-weight:800;font-family:'Cairo',sans-serif;color:var(--primary);margin:0;display:flex;align-items:center;gap:8px}",
".dv-ttl .ic svg{width:20px;height:20px}",
".dv-sub{font-size:12px;color:var(--muted);margin-top:5px;line-height:1.7}",
".dv-num{direction:ltr;unicode-bidi:isolate;text-align:right;font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums}",
/* `unicode-bidi:isolate` شرطٌ لا زينة: `direction` وحدَها **لا أثرَ لها على صندوقٍ
   سطريّ** — الافتراضُ `normal` فلا يفتح العنصرُ مستوى تضمينٍ جديداً، ويبقى نصُّه
   جزءاً من فقرة أبيه العربية. فتاريخُ «2025-09-02» في `<span>` داخل جملةٍ عربية
   يُعاد ترتيبُ مقاطعه إلى «02-09-2025»: تاريخٌ آخرُ يُقرأ بثقة. وخليّةُ الجدول
   نجت لأنها صندوقٌ كتليٌّ يفتح فقرتَه بنفسه — ولذلك مرّت العلّةُ في الجدول
   وظهرت في سجلّ التجديدات وحدَه. رُئيت في لقطة شاشةٍ ولا مترجمَ يُنذر بها. */

/* ── أفقُ الانتهاءات — العنصرُ المميِّز ── */
".dv-horizon{display:flex;align-items:stretch;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:13px 15px;box-shadow:var(--shadow);margin-bottom:14px;overflow-x:auto}",
".dv-hz-past{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;flex-shrink:0;min-width:66px;padding:4px 8px 6px;border-radius:10px;border:1px solid transparent;background:none;cursor:pointer;font-family:inherit;border-left:1px solid var(--border)}",
".dv-hz-past:hover,.dv-hz-past.on{background:var(--surface2)}",
".dv-hz-past .n{font-size:22px;font-weight:800;font-family:'JetBrains Mono',monospace;color:var(--danger);line-height:1}",
".dv-hz-past .n.zero{color:var(--zero)}",
".dv-hz-past .l{font-size:10px;font-weight:700;color:var(--muted)}",
".dv-hz-track{display:flex;flex:1;gap:2px;min-width:560px;align-items:flex-end}",
".dv-hz-m{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:5px;background:none;border:0;border-radius:10px;padding:4px 2px 6px;cursor:pointer;font-family:inherit;position:relative;transition:background .15s}",
".dv-hz-m:hover{background:var(--surface2)}",
".dv-hz-m.on{background:var(--surface2);box-shadow:inset 0 0 0 1px var(--border)}",
".dv-hz-m:focus-visible{outline:2px solid var(--primary);outline-offset:1px}",
".dv-hz-stack{display:flex;flex-direction:column-reverse;align-items:center;gap:3px;min-height:44px;justify-content:flex-start;width:100%}",
".dv-hz-dot{width:min(22px,80%);height:7px;border-radius:4px;background:var(--rank5)}",
".dv-hz-dot.l-critical{background:var(--danger)}",
".dv-hz-dot.l-urgent{background:var(--warn)}",
".dv-hz-dot.l-soon{background:var(--rank3)}",
".dv-hz-dot.l-plan{background:var(--rank4)}",
".dv-hz-more{font-size:9.5px;font-weight:800;color:var(--muted);font-family:'JetBrains Mono',monospace}",
".dv-hz-mn{font-size:10px;font-weight:700;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}",
".dv-hz-m.now .dv-hz-mn{color:var(--primary);font-weight:800}",
".dv-hz-m.now::after{content:'';position:absolute;bottom:0;left:12%;right:12%;height:2px;border-radius:2px;background:var(--primary)}",
".dv-hz-beyond{flex-shrink:0;align-self:center;font-size:10.5px;color:var(--muted);font-weight:700;padding-right:8px;border-right:1px solid var(--border)}",

/* ── الترشيح ── */
".dv-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}",
".dv-bar .form-input{width:auto;min-width:150px;padding:7px 11px;font-size:12px}",
".dv-bar .dv-search{min-width:220px;flex:1}",
".dv-clear{background:none;border:0;color:var(--muted);font-family:inherit;font-size:11.5px;font-weight:700;cursor:pointer;padding:6px 8px;border-radius:8px}",
".dv-clear:hover{color:var(--danger);background:var(--surface2)}",

/* ── الجدول ── */
".dv-wrap{background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);overflow-x:auto}",
".dv-tbl{width:100%;border-collapse:collapse;font-size:12px;min-width:940px}",
".dv-tbl th:first-child,.dv-tbl td:first-child{min-width:210px}",
/* حدٌّ أدنى للعرض مقصود: بلا هو ينسحق عمودُ العنوان إلى ثلاثة أسطرٍ في الجوّال
   بدل أن يمرّر الجدولُ أفقياً في حاضنته (`.dv-wrap` بـ`overflow-x:auto`). */
".dv-tbl th{background:var(--surface2);padding:10px 12px;text-align:right;font-weight:700;color:var(--muted);font-size:11px;border-bottom:1px solid var(--border);white-space:nowrap}",
".dv-tbl td{padding:9px 12px;border-bottom:1px solid var(--border);vertical-align:middle}",
".dv-tbl tbody tr:last-child td{border-bottom:none}",
".dv-tbl tbody tr:hover{background:var(--surface2)}",
".dv-tbl .t-name{font-weight:700;color:var(--text)}",
".dv-tbl .t-dim{color:var(--muted)}",
".dv-row-act{cursor:pointer}",
".dv-empty{text-align:center;color:var(--muted);padding:42px 20px;font-size:13px;line-height:1.9}",

/* ── رقاقةُ الصلاحية: الأحمرُ وحدَه يصرخ، وما دونه يخفت بالدرجة ── */
".dv-chip{display:inline-flex;align-items:center;gap:4px;white-space:nowrap;font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:10px;border:1px solid transparent}",
".dv-chip.l-expired{color:var(--danger);background:rgba(185,44,44,.10);border-color:rgba(185,44,44,.32)}",
".dv-chip.l-critical{color:var(--danger);background:rgba(185,44,44,.07);border-color:rgba(185,44,44,.22)}",
".dv-chip.l-urgent{color:var(--warn);background:rgba(160,96,16,.09);border-color:rgba(160,96,16,.26)}",
".dv-chip.l-soon{color:var(--rank3);background:var(--surface2);border-color:var(--border)}",
".dv-chip.l-plan{color:var(--rank4);background:var(--surface2);border-color:var(--border)}",
".dv-chip.l-ok{color:var(--muted);background:var(--surface2);border-color:var(--border)}",
".dv-chip.l-none{color:var(--zero);background:var(--surface2);border-color:var(--border)}",

/* ── النموذج والبطاقة ── */
".dv-panel{background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);padding:18px;margin-bottom:14px}",
".dv-panel-h{font-size:14px;font-weight:800;font-family:'Cairo',sans-serif;color:var(--primary);margin-bottom:4px}",
".dv-panel-s{font-size:11.5px;color:var(--muted);margin-bottom:14px;line-height:1.7}",
".dv-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}",
".dv-f{display:flex;flex-direction:column;gap:5px}",
".dv-f.wide{grid-column:1/-1}",
".dv-dates{display:grid;grid-template-columns:1fr 1fr;gap:12px}",
"@media (max-width:760px){.dv-dates{grid-template-columns:1fr}}",
".dv-l{font-size:11px;font-weight:700;color:var(--muted)}",
".dv-l b{color:var(--danger)}",
".dv-hint{font-size:10.5px;color:var(--muted);line-height:1.7;margin-top:3px}",
".dv-check{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:var(--text);cursor:pointer;padding:9px 11px;border:1px solid var(--border);border-radius:9px;background:var(--surface2)}",
".dv-check input{width:16px;height:16px;cursor:pointer}",
".dv-acts{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:16px}",
".dv-files{display:flex;flex-direction:column;gap:6px;margin-top:4px}",
".dv-file{display:flex;align-items:center;gap:8px;font-size:11.5px;background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:7px 10px}",
".dv-file a{color:var(--info);font-weight:700;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
".dv-file a:hover{text-decoration:underline}",
".dv-file .rm{margin-right:auto;background:none;border:0;color:var(--muted);cursor:pointer;font-family:inherit;font-size:11px;font-weight:700}",
".dv-file .rm:hover{color:var(--danger)}",
".dv-none{font-size:11.5px;color:var(--zero);font-weight:700}",

/* ── سجلُّ التجديدات ── */
".dv-hist{margin-top:16px;border-top:1px solid var(--border);padding-top:14px}",
".dv-hist-h{font-size:12px;font-weight:800;color:var(--muted);margin-bottom:9px}",
".dv-hist-i{display:flex;align-items:center;gap:10px;font-size:11.5px;padding:8px 11px;border-radius:9px;background:var(--surface2);margin-bottom:6px}",
".dv-hist-i .p{color:var(--text);font-weight:700}",
".dv-hist-i .dv-num{font-weight:700}",
".dv-hist-i .w{color:var(--muted);margin-right:auto;font-size:10.5px}",

/* ── تبويبا الخطابات ── */
".dv-tabs{display:flex;gap:4px;border-bottom:1px solid var(--border);margin:0 0 14px}",
".dv-tab{background:none;border:0;border-bottom:2px solid transparent;padding:9px 16px;font-family:'Cairo',sans-serif;font-size:13px;font-weight:700;color:var(--muted);cursor:pointer;margin-bottom:-1px}",
".dv-tab:hover{color:var(--text)}",
".dv-tab.on{color:var(--primary);border-bottom-color:var(--primary)}",
".dv-tab .n{font-family:'JetBrains Mono',monospace;font-size:11px;opacity:.75;margin-right:4px}",

/* ── شارةُ القائمة الجانبية وزرِّ البوّابة ── */
".dv-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;margin-right:auto;border-radius:9px;background:var(--danger);color:#fff;font-size:10px;font-weight:800;font-family:'JetBrains Mono',monospace}",
".dv-err{background:var(--surface2);border:1px solid var(--danger);color:var(--danger);border-radius:10px;padding:11px 14px;font-size:12px;font-weight:700;margin-bottom:12px}",

"@media (max-width:760px){.dv-grid{grid-template-columns:1fr}.dv-horizon{padding:10px}.dv-hz-track{min-width:460px}.dv-head{gap:10px}.dv-bar .dv-search{min-width:100%}}",
"@media (prefers-reduced-motion:reduce){.dv-hz-m,.dv-tbl tbody tr{transition:none}}"
].join("\n");
  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════════════
   الرسم — شاشةُ السجلّات والشهادات
   ═══════════════════════════════════════════════════════════════════════════ */
function _chip(level, days){
  var txt = LEVEL_LBL[level] || "";
  if(level === "expired")  txt = "منتهية منذ " + Math.abs(days) + " يوماً";
  else if(level !== "none" && level !== "ok" && days != null) txt = "بعد " + days + " يوماً";
  else if(level === "ok" && days != null) txt = "سارية — " + days + " يوماً";
  return '<span class="dv-chip l-' + level + '">' + _esc(txt) + '</span>';
}

/* أفقُ الانتهاءات: كعبُ المنتهيات، ثمّ اثنا عشر شهراً، ثمّ ملخّصُ ما بعدها.
   النقاطُ مرصوصةٌ من الأسفل فارتفاعُ العمود = عددُ الوثائق، ولونُ النقطة مرتبتُها —
   فالتزاحمُ والإلحاحُ يُقرآن في نظرةٍ واحدة. */
function _horizonHTML(list, today){
  var h = horizonBuckets(list, today, HORIZON_MONTHS);
  var out = '<div class="dv-horizon" role="group" aria-label="أفق انتهاء الوثائق">';
  out += '<button type="button" class="dv-hz-past' + (_view.ym === "overdue" ? " on" : "") + '"'
       + ' onclick="docVault.pickMonth(\'overdue\')" aria-pressed="' + (_view.ym === "overdue") + '"'
       + ' title="الوثائق التي انتهت — اعرضها وحدَها">'
       + '<span class="n' + (h.overdue.length ? "" : " zero") + '">' + h.overdue.length + '</span>'
       + '<span class="l">منتهية</span></button>';
  out += '<div class="dv-hz-track">';
  h.months.forEach(function(m){
    var shown = m.docs.slice(0, DOT_CAP), extra = m.docs.length - shown.length;
    var dots = shown.map(function(d){
      return '<i class="dv-hz-dot l-' + docLevel(d, today) + '"></i>';
    }).join("");
    out += '<button type="button" class="dv-hz-m' + (m.now ? " now" : "") + (_view.ym === m.ym ? " on" : "") + '"'
         + ' onclick="docVault.pickMonth(\'' + m.ym + '\')" aria-pressed="' + (_view.ym === m.ym) + '"'
         + ' title="' + _esc(m.label + " " + m.year + " — " + (m.docs.length ? (m.docs.length + " وثيقة تنتهي") : "لا انتهاءات")) + '">'
         + '<span class="dv-hz-stack">' + dots
         + (extra > 0 ? '<span class="dv-hz-more">+' + extra + '</span>' : "")
         + '</span>'
         + '<span class="dv-hz-mn">' + _esc(m.label) + '</span></button>';
  });
  out += '</div>';
  if(h.beyond.length) out += '<div class="dv-hz-beyond">' + h.beyond.length + ' بعد سنة</div>';
  return out + '</div>';
}

function _filterBarHTML(){
  var types = DOC_TYPES.map(function(t){
    return '<option value="' + t.key + '"' + (_view.type === t.key ? " selected" : "") + '>' + _esc(t.lbl) + '</option>';
  }).join("");
  var lvls = LEVELS.map(function(l){
    return '<option value="' + l.key + '"' + (_view.level === l.key ? " selected" : "") + '>' + _esc(l.lbl) + '</option>';
  }).join("");
  var dirty = _view.q || _view.type || _view.level || _view.ym;
  return '<div class="dv-bar">'
    + '<input class="form-input dv-search" type="search" placeholder="ابحث بالعنوان أو الرقم أو الجهة…"'
    + ' value="' + _esc(_view.q) + '" oninput="docVault.setFilter(\'q\',this.value)">'
    + '<select class="form-input" onchange="docVault.setFilter(\'type\',this.value)"><option value="">كل الأنواع</option>' + types + '</select>'
    + '<select class="form-input" onchange="docVault.setFilter(\'level\',this.value)"><option value="">كل الحالات</option>' + lvls + '</select>'
    + (dirty ? '<button type="button" class="dv-clear" onclick="docVault.clearFilters()">مسح الترشيح</button>' : "")
    + '</div>';
}

function _filesHTML(files, onDel){
  var arr = Array.isArray(files) ? files : [];
  if(!arr.length) return '<div class="dv-none">لا مرفق</div>';
  return '<div class="dv-files">' + arr.map(function(f, i){
    return '<div class="dv-file">' + _icon("paperclip", "ic-sm")
      + '<a href="' + _esc(f.url) + '" target="_blank" rel="noopener">' + _esc(f.name || "مرفق") + '</a>'
      + (onDel ? '<button type="button" class="rm" onclick="' + onDel + '(' + i + ')">حذف</button>' : "")
      + '</div>';
  }).join("") + '</div>';
}

function _tableHTML(list, today){
  if(!list.length){
    var any = _docs.filter(function(d){ return !d.archived; }).length;
    return '<div class="dv-wrap"><div class="dv-empty">'
      + (any ? 'لا وثيقة تطابق الترشيح الحالي.<br><button type="button" class="dv-clear" onclick="docVault.clearFilters()">امسح الترشيح</button>'
             : 'الخزانة فارغة.<br>ابدأ بإضافة السجل التجاري وشهادات الزكاة والتأمينات — لكلٍّ تاريخُ بدءٍ وانتهاءٍ ومرفق،<br>ويصلك التنبيه قبل انتهائها بتسعين يوماً.')
      + '</div></div>';
  }
  var rows = list.map(function(d){
    var lvl  = docLevel(d, today);
    var days = (d.noExpiry || !d.expiry) ? null : daysUntil(d.expiry, today);
    return '<tr class="dv-row-act" onclick="docVault.open(\'' + _jq(d.id) + '\')">'
      + '<td class="t-name">' + _esc(d.title || "—")
        + (d.renewCount ? ' <span class="t-dim dv-num">(جُدِّدت ' + d.renewCount + ')</span>' : "") + '</td>'
      + '<td class="t-dim">' + _esc(typeLabel(d)) + '</td>'
      + '<td class="dv-num t-dim">' + _esc(d.number || "—") + '</td>'
      + '<td class="t-dim">' + _esc(d.issuer || "—") + '</td>'
      + '<td class="dv-num t-dim">' + _esc(d.start || "—") + '</td>'
      /* `dv-num` تقلب الاتجاهَ إلى LTR لتُقرأ خاناتُ التاريخ بترتيبها — فلا تُوضع
         على نصٍّ عربيّ، وإلّا تقطّعت كلمةُ «بلا انتهاء» وقُرئت مبعثرة. */
      + (d.noExpiry ? '<td class="t-dim">بلا انتهاء</td>'
                    : '<td class="dv-num">' + _esc(d.expiry || "—") + '</td>')
      + '<td>' + _chip(lvl, days) + '</td>'
      + '<td class="t-dim">' + _esc(ownerLabel(d) || "—") + '</td>'
      + '<td class="t-dim">' + ((d.files || []).length ? _icon("paperclip", "ic-sm") + (d.files.length > 1 ? ' ' + d.files.length : "") : "—") + '</td>'
      + '</tr>';
  }).join("");
  return '<div class="dv-wrap"><table class="dv-tbl"><thead><tr>'
    + '<th>الوثيقة</th><th>النوع</th><th>الرقم</th><th>الجهة المُصدِرة</th>'
    + '<th>البدء</th><th>الانتهاء</th><th>الصلاحية</th><th>مسؤول التجديد</th><th>مرفق</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

/* ════════ نموذجُ الإضافة والتعديل ════════ */
function _formHTML(){
  var e = _edit, isNew = !e.id;
  var types = DOC_TYPES.map(function(t){
    return '<option value="' + t.key + '"' + (e.docType === t.key ? " selected" : "") + '>' + _esc(t.lbl) + '</option>';
  }).join("");
  return '<div class="dv-panel">'
    + '<div class="dv-panel-h">' + (isNew ? "وثيقة جديدة" : "تعديل: " + _esc(e.title || e.id)) + '</div>'
    + '<div class="dv-panel-s">تاريخا البدء والانتهاء هما ما يُبنى عليه التنبيه. الوثيقةُ الدائمةُ بلا انتهاءٍ تُعلَّم أدناه فلا تدخل الأفق.</div>'
    + '<div class="dv-grid">'
    + '<div class="dv-f wide"><label class="dv-l" for="dv-title">عنوان الوثيقة <b>*</b></label>'
      + '<input class="form-input" id="dv-title" value="' + _esc(e.title || "") + '" placeholder="مثال: السجل التجاري — الفرع الرئيسي"></div>'
    + '<div class="dv-f"><label class="dv-l" for="dv-type">النوع</label>'
      + '<select class="form-input" id="dv-type" onchange="docVault.setType(this.value)">' + types + '</select></div>'
    /* خانةُ الاسم اليدويّ تظهر مع «وثيقة أخرى» وحدَها، وتشغل الصفَّ كلَّه ليتّسع
       لاسمٍ طويل. وهي **إلزامية**: «أخرى» بلا اسمٍ هي عينُ ما جاءت لتعالجه. */
    + (e.docType === "other"
        ? '<div class="dv-f wide"><label class="dv-l" for="dv-type-other">اسم نوع الوثيقة <b>*</b></label>'
          + '<input class="form-input" id="dv-type-other" value="' + _esc(e.docTypeOther || "") + '"'
          + ' placeholder="مثال: شهادة اشتراك في الهيئة السعودية للمهندسين">'
          + '<div class="dv-hint">يحلّ محلَّ «وثيقة أخرى» في الجدول والبطاقة والبحث.</div></div>'
        : "")
    + '<div class="dv-f"><label class="dv-l" for="dv-number">رقم الوثيقة</label>'
      + '<input class="form-input dv-num" id="dv-number" value="' + _esc(e.number || "") + '" placeholder="1010xxxxxx"></div>'
    + '<div class="dv-f"><label class="dv-l" for="dv-issuer">الجهة المُصدِرة</label>'
      + '<input class="form-input" id="dv-issuer" value="' + _esc(e.issuer || "") + '" placeholder="وزارة التجارة"></div>'
    + '<div class="dv-f wide"><label class="dv-l" for="dv-owner">مسؤول التجديد</label>'
      + _ownerSelectHTML(e) + _ownerHintHTML(e) + '</div>'
    /* ── مدّةُ الصلاحية كتلةٌ واحدةٌ لا حقلين متجاورَين بالمصادفة ──
       التوزيعُ التلقائيُّ في الشبكة يملأ صفّاً صفّاً، فحقلٌ يظهر أو يختفي (خانةُ
       «أخرى») يُزحزح كلَّ ما بعده **فينفصل التاريخان**: البدءُ في صفٍّ والانتهاءُ في
       الذي يليه — وهما مدّةٌ واحدةٌ تُقرأ معاً أو لا تُقرأ. فالكتلةُ تحجز صفَّها
       بنفسها وتقسمه على اثنين، فيثبت اقترانُهما مهما تغيّر ما فوقهما. */
    + '<div class="dv-f wide"><div class="dv-dates">'
      + '<div class="dv-f"><label class="dv-l" for="dv-start">تاريخ البدء</label>'
        + '<input class="form-input dv-num" type="date" id="dv-start" value="' + _esc(e.start || "") + '"></div>'
      + '<div class="dv-f"><label class="dv-l" for="dv-expiry">تاريخ الانتهاء ' + (e.noExpiry ? "" : "<b>*</b>") + '</label>'
        + '<input class="form-input dv-num" type="date" id="dv-expiry" value="' + _esc(e.expiry || "") + '"' + (e.noExpiry ? " disabled" : "") + '></div>'
      + '</div></div>'
    + '<div class="dv-f wide"><label class="dv-check"><input type="checkbox" id="dv-noexp"' + (e.noExpiry ? " checked" : "")
      + ' onchange="docVault.toggleNoExpiry(this.checked)"> وثيقة دائمة بلا تاريخ انتهاء</label>'
      + '<div class="dv-hint">تُحفظ في الخزانة ولا تدخل الأفق ولا يُنبَّه عليها — كعقد التأسيس.</div></div>'
    + '<div class="dv-f wide"><label class="dv-l" for="dv-notes">ملاحظات</label>'
      + '<textarea class="form-input" id="dv-notes" rows="2" placeholder="ما يلزم معرفته عند التجديد">' + _esc(e.notes || "") + '</textarea></div>'
    + '<div class="dv-f wide"><label class="dv-l">المرفقات</label>'
      + _filesHTML(e.files, "docVault.delDraftFile")
      + '<div style="margin-top:7px"><button type="button" class="btn btn-ghost btn-sm" onclick="docVault.addDraftFile()">'
        + _icon("paperclip", "ic-sm") + ' إرفاق ملف</button></div></div>'
    + '</div>'
    + '<div class="dv-acts">'
      + '<button type="button" class="btn btn-ghost" onclick="docVault.cancelEdit()">إلغاء</button>'
      + '<button type="button" class="btn btn-primary" onclick="docVault.saveEdit()">' + _icon("save", "ic-sm") + ' حفظ الوثيقة</button>'
    + '</div></div>';
}

/* ════════ منتقي مسؤول التجديد ════════
   كان حقلَ كتابةٍ حرّاً، فكان الاسمُ نصّاً لا يصل إليه شيء: «محمد» و«محمد العتيبي»
   و«م. العتيبي» ثلاثةُ أشخاصٍ عند أيّ آليّة. صار اختياراً من المستخدمين يُخزَّن
   بـ**اسم الدخول** — وهو المفتاحُ الذي يجد به `functions/lib/recipients.js` رقمَ
   الواتساب في `meta/users`. فالتنبيهُ يصل صاحبَه حين تُنشَر الدالّةُ المجدولة، بلا
   مطابقةِ أسماءٍ تخمينية.

   و`<select>` لا منتقياً باحثاً: قائمةُ الموظفين هنا تُختار **مرّةً لكلّ وثيقة**
   لا عشراتِ المرّات في اليوم، والمنتقي الباحثُ في `staff-tasks.js` مربوطٌ بحالته
   ومعرّفاتِ عناصره فنسخُه هنا يشقّه إلى مصدرين. وعلى الـiPad يفتح `<select>`
   ورقةَ النظام — وهي مقروءةٌ بالإصبع كما في بقيّة نماذج المنصّة.

   **والمسؤولُ الذي لم يعد في القائمة يبقى خياراً** (حُذف حسابُه أو تغيّر مشروعُه):
   بلا هذا يُسقطه الحفظُ صامتاً فتصير الوثيقةُ بلا مسؤولٍ لأنّ أحداً فتح نموذجَها. */
function _ownerSelectHTML(e){
  var cur = String(e.ownerUser || "");
  var arr = _users().slice().sort(function(a, b){
    return String(a.name || a.user || "").localeCompare(String(b.name || b.user || ""), "ar");
  });
  var seen = false;
  var opts = '<option value="">— بلا مسؤول تجديد —</option>';
  arr.forEach(function(u){
    if(!u || !u.user) return;
    if(u.user === cur) seen = true;
    opts += '<option value="' + _esc(u.user) + '"' + (u.user === cur ? " selected" : "") + '>'
          + _esc(u.name || u.user) + (_hasWa(u) ? "" : " (بلا واتساب)") + '</option>';
  });
  if(cur && !seen){
    opts += '<option value="' + _esc(cur) + '" selected>'
          + _esc(e.owner || cur) + ' (خارج القائمة)</option>';
  }
  return '<select class="form-input" id="dv-owner">' + opts + '</select>';
}
/* ولا يُترك الغيابُ يُكتشَف يومَ يصمت التنبيه: يُقال الآن ومَن يُصلحه. */
function _ownerHintHTML(e){
  var cur = String(e.ownerUser || "");
  if(!cur) return '<div class="dv-hint">اختره من المستخدمين ليصله تنبيهُ التجديد باسمه.</div>';
  var u = _userByLogin(cur);
  if(!u) return '<div class="dv-hint">هذا المسؤول لم يعد في قائمة المستخدمين — اختر بديلاً.</div>';
  if(_hasWa(u)) return '<div class="dv-hint">يصله تنبيهُ التجديد على واتساب.</div>';
  return '<div class="dv-hint">لا رقمَ واتساب مفعَّلاً لهذا المستخدم — يصله التنبيهُ داخل المنصّة فقط. '
       + 'يُضاف الرقمُ ويُفعَّل من إدارة المستخدمين.</div>';
}

/* ════════ بطاقةُ الوثيقة — التفاصيل وسجلُّ التجديدات ════════ */
function _cardHTML(d, today){
  var lvl  = docLevel(d, today);
  var days = (d.noExpiry || !d.expiry) ? null : daysUntil(d.expiry, today);
  var hist = Array.isArray(d.history) ? d.history : [];
  var row  = function(l, v){ return '<div class="dv-f"><span class="dv-l">' + l + '</span><span>' + v + '</span></div>'; };
  var out = '<div class="dv-panel">'
    + '<div class="dv-head" style="margin-bottom:10px"><div>'
      + '<div class="dv-panel-h">' + _esc(d.title || d.id) + ' ' + _chip(lvl, days) + '</div>'
      + '<div class="dv-panel-s dv-num" style="margin-bottom:0">' + _esc(d.id) + '</div>'
    + '</div><div style="display:flex;gap:8px;flex-wrap:wrap">'
      + '<button type="button" class="btn btn-ghost btn-sm" onclick="docVault.backToList()">' + _icon("rotateCcw", "ic-sm") + ' رجوع</button>'
      + (canEdit() ? '<button type="button" class="btn btn-ghost btn-sm" onclick="docVault.editDoc(\'' + _jq(d.id) + '\')">' + _icon("edit", "ic-sm") + ' تعديل</button>' : "")
      + (canEdit() && !d.noExpiry ? '<button type="button" class="btn btn-primary btn-sm" onclick="docVault.openRenew(\'' + _jq(d.id) + '\')">' + _icon("repeat", "ic-sm") + ' جدّد</button>' : "")
      + (canDelete() ? '<button type="button" class="btn btn-delete btn-sm" onclick="docVault.delDoc(\'' + _jq(d.id) + '\')">' + _icon("trash", "ic-sm") + '</button>' : "")
    + '</div></div>'
    + '<div class="dv-grid">'
      + row("النوع", _esc(typeLabel(d)))
      + row("رقم الوثيقة", '<span class="dv-num">' + _esc(d.number || "—") + '</span>')
      + row("الجهة المُصدِرة", _esc(d.issuer || "—"))
      + row("مسؤول التجديد", _esc(ownerLabel(d) || "—")
          + (function(){
              var u = d.ownerUser ? _userByLogin(d.ownerUser) : null;
              if(!d.ownerUser) return "";
              if(!u) return ' <span class="dv-chip l-none">خارج القائمة</span>';
              return _hasWa(u) ? "" : ' <span class="dv-chip l-none">بلا واتساب</span>';
            })())
      + row("تاريخ البدء", '<span class="dv-num">' + _esc(d.start || "—") + '</span>')
      + row("تاريخ الانتهاء", d.noExpiry ? '<span class="t-dim">بلا انتهاء</span>'
                                          : '<span class="dv-num">' + _esc(d.expiry || "—") + '</span>')
      + (d.notes ? '<div class="dv-f wide"><span class="dv-l">ملاحظات</span><span>' + _esc(d.notes) + '</span></div>' : "")
      + '<div class="dv-f wide"><span class="dv-l">المرفقات</span>' + _filesHTML(d.files, null) + '</div>'
    + '</div>';
  if(_renew && _renew.id === d.id) out += _renewHTML(d);
  if(hist.length){
    out += '<div class="dv-hist"><div class="dv-hist-h">سجلّ التجديدات (' + hist.length + ')</div>'
      + hist.map(function(h){
          /* كلُّ تاريخٍ في وعائه المستقلّ بـ`dv-num`، والرابطُ بينهما **كلمةٌ عربية**
             لا سهم: السهمُ محايدُ الاتجاه، فيقلبه المحرّكُ في سياقٍ عربيٍّ ويُقرأ
             المدى معكوساً — «انتهت ثمّ بدأت». وقع فعلاً ورُئي في لقطة الشاشة. */
          return '<div class="dv-hist-i">' + _icon("archive", "ic-sm")
            + '<span class="p">من <span class="dv-num">' + _esc(h.start || "—") + '</span>'
            + ' إلى <span class="dv-num">' + _esc(h.expiry || "—") + '</span></span>'
            + (h.number ? '<span class="t-dim dv-num">' + _esc(h.number) + '</span>' : "")
            + ((h.files || []).length ? '<a href="' + _esc(h.files[0].url) + '" target="_blank" rel="noopener" style="color:var(--info);font-weight:700;text-decoration:none">النسخة</a>' : "")
            + '<span class="w">جُدِّدت <span class="dv-num">' + _esc(String(h.renewedAt || "").slice(0, 10)) + '</span>'
            + (h.renewedBy ? " — " + _esc(h.renewedBy) : "") + '</span>'
            + '</div>';
        }).join("")
      + '</div>';
  }
  return out + '</div>';
}

/* نموذجُ التجديد — مدّةٌ جديدةٌ ومرفقٌ جديد، والقائمُ ينزل إلى السجلّ عند الحفظ. */
function _renewHTML(d){
  return '<div class="dv-panel" style="margin:14px 0 0;background:var(--surface2)">'
    + '<div class="dv-panel-h">تجديد: ' + _esc(d.title || d.id) + '</div>'
    + '<div class="dv-panel-s">المدّةُ الحالية (من <span class="dv-num">' + _esc(d.start || "—")
      + '</span> إلى <span class="dv-num">' + _esc(d.expiry || "—")
      + '</span>) تنزل إلى سجلّ التجديدات بمرفقها، ولا تُمحى.</div>'
    + '<div class="dv-grid">'
    + '<div class="dv-f"><label class="dv-l" for="dv-rn-start">البدء الجديد</label>'
      + '<input class="form-input dv-num" type="date" id="dv-rn-start" value="' + _esc(_renew.start || "") + '"></div>'
    + '<div class="dv-f"><label class="dv-l" for="dv-rn-expiry">الانتهاء الجديد <b>*</b></label>'
      + '<input class="form-input dv-num" type="date" id="dv-rn-expiry" value="' + _esc(_renew.expiry || "") + '"></div>'
    + '<div class="dv-f wide"><label class="dv-l" for="dv-rn-number">الرقم الجديد (اتركه فارغاً إن لم يتغيّر)</label>'
      + '<input class="form-input dv-num" id="dv-rn-number" value="' + _esc(_renew.number || "") + '"></div>'
    + '<div class="dv-f wide"><label class="dv-l">مرفقُ النسخة الجديدة</label>'
      + _filesHTML(_renew.files, "docVault.delRenewFile")
      + '<div style="margin-top:7px"><button type="button" class="btn btn-ghost btn-sm" onclick="docVault.addRenewFile()">'
      + _icon("paperclip", "ic-sm") + ' إرفاق النسخة الجديدة</button></div></div>'
    + '</div>'
    + '<div class="dv-acts">'
      + '<button type="button" class="btn btn-ghost" onclick="docVault.cancelRenew()">إلغاء</button>'
      + '<button type="button" class="btn btn-primary" onclick="docVault.saveRenew()">' + _icon("repeat", "ic-sm") + ' اعتمد التجديد</button>'
    + '</div></div>';
}

/* ═══════════════════════════════════════════════════════════════════════════
   الرسمُ الرئيسُ لشاشة السجلّات
   ═══════════════════════════════════════════════════════════════════════════ */
function render(){
  var host = document.getElementById("page-" + PAGE_DOCS);
  if(!host) return;
  if(!canView()){
    host.innerHTML = '<div class="dv-empty">🔒 خزانة الوثائق غير متاحة لحسابك.</div>';
    return;
  }
  var today = new Date();
  var head = '<div class="dv-head"><div>'
    + '<h2 class="dv-ttl">' + _icon("folderOpen") + ' خزانة الوثائق — السجلّات والشهادات</h2>'
    + '<div class="dv-sub">وثائقُ الشركة بتواريخ بدئها وانتهائها ومرفقاتها. التنبيهُ يبدأ قبل الانتهاء بتسعين يوماً ويشتدّ كلّما اقترب.</div>'
    + '</div><div style="display:flex;gap:8px;flex-wrap:wrap">'
    + (canEdit() ? '<button type="button" class="btn btn-primary btn-sm" onclick="docVault.newDoc()">' + _icon("plus", "ic-sm") + ' وثيقة جديدة</button>' : "")
    + '</div></div>';

  if(_err){
    host.innerHTML = head + '<div class="dv-err">تعذّر تحميل الخزانة: ' + _esc(_err)
      + ' <button type="button" class="dv-clear" onclick="docVault.retry()">أعد المحاولة</button></div>';
    return;
  }
  if(!_docsLoaded){ host.innerHTML = head + '<div class="dv-empty">جارٍ تحميل الخزانة…</div>'; return; }

  var body = "";
  if(_edit){ body = _formHTML(); }
  else if(_open){
    var d = docById(_open);
    body = d ? _cardHTML(d, today) : '<div class="dv-empty">لم تعد هذه الوثيقة موجودة.</div>';
  } else {
    var list = sortDocs(filterDocs(_docs, _view, today), today);
    body = _horizonHTML(_docs, today) + _filterBarHTML() + _tableHTML(list, today);
  }
  host.innerHTML = head + body;
}

/* ═══════════════════════════════════════════════════════════════════════════
   الرسم — شاشةُ الخطابات: سجلٌّ مرقَّم، لا أفق. الخطابُ لا ينتهي، ويُطلَب برقمه.
   ═══════════════════════════════════════════════════════════════════════════ */
function _letterFormHTML(){
  var e = _ledit, isNew = !e.id, isTpl = e.kind === "template";
  return '<div class="dv-panel">'
    + '<div class="dv-panel-h">' + (isNew ? (isTpl ? "نموذج خطاب جديد" : "خطاب صادر جديد") : "تعديل: " + _esc(e.title || e.id)) + '</div>'
    + '<div class="dv-panel-s">' + (isTpl
        ? 'النموذجُ قالبٌ يُستنسَخ عند كلّ استعمال. اترك ما يتغيّر عنصراً نائباً بين قوسين مربّعين — <span class="dv-num">[الجهة]</span> · <span class="dv-num">[التاريخ]</span>.'
        : 'الخطابُ الصادر يُحفَظ برقمٍ مرجعيٍّ من النظام، وبمرفق النسخة الموقَّعة.') + '</div>'
    + '<div class="dv-grid">'
    + '<div class="dv-f wide"><label class="dv-l" for="dv-l-title">العنوان <b>*</b></label>'
      + '<input class="form-input" id="dv-l-title" value="' + _esc(e.title || "") + '" placeholder="' + (isTpl ? "نموذج خطاب طلب تمديد" : "خطاب ترشيح مقاول") + '"></div>'
    + (isTpl ? "" :
        '<div class="dv-f"><label class="dv-l" for="dv-l-party">الجهة الموجَّه إليها</label>'
        + '<input class="form-input" id="dv-l-party" value="' + _esc(e.party || "") + '" placeholder="أمانة منطقة حائل"></div>'
      + '<div class="dv-f"><label class="dv-l" for="dv-l-date">تاريخ الخطاب</label>'
        + '<input class="form-input dv-num" type="date" id="dv-l-date" value="' + _esc(e.letterDate || "") + '"></div>'
      + '<div class="dv-f"><label class="dv-l" for="dv-l-ref">الرقم المرجعي الخارجي</label>'
        + '<input class="form-input dv-num" id="dv-l-ref" value="' + _esc(e.ref || "") + '" placeholder="إن كان للخطاب رقمٌ لدى الجهة"></div>')
    + '<div class="dv-f' + (isTpl ? " wide" : "") + '"><label class="dv-l" for="dv-l-subject">الموضوع</label>'
      + '<input class="form-input" id="dv-l-subject" value="' + _esc(e.subject || "") + '"></div>'
    + '<div class="dv-f wide"><label class="dv-l" for="dv-l-body">متن الخطاب</label>'
      + '<textarea class="form-input" id="dv-l-body" rows="7" placeholder="نصُّ الخطاب — يُنسَخ منه عند الاستعمال">' + _esc(e.body || "") + '</textarea></div>'
    + '<div class="dv-f wide"><label class="dv-l">المرفقات</label>'
      + _filesHTML(e.files, "docVault.delLetterDraftFile")
      + '<div style="margin-top:7px"><button type="button" class="btn btn-ghost btn-sm" onclick="docVault.addLetterFile()">'
      + _icon("paperclip", "ic-sm") + ' إرفاق ملف</button></div></div>'
    + '</div>'
    + '<div class="dv-acts">'
      + '<button type="button" class="btn btn-ghost" onclick="docVault.cancelLetter()">إلغاء</button>'
      + '<button type="button" class="btn btn-primary" onclick="docVault.saveLetter()">' + _icon("save", "ic-sm") + ' حفظ</button>'
    + '</div></div>';
}

function _letterTableHTML(list){
  var isTpl = _lview.kind === "template";
  if(!list.length){
    return '<div class="dv-wrap"><div class="dv-empty">'
      + (isTpl ? 'لا نماذج بعد.<br>احفظ هنا قوالبَ الخطابات التي تتكرّر — طلبُ تمديد · ترشيحُ مقاول · تفويض — لتُستنسَخ بدل أن تُكتب من جديد.'
               : 'لا خطابات صادرة بعد.<br>كلُّ خطابٍ يُحفَظ برقمٍ مرجعيٍّ من النظام وبنسخته الموقَّعة، فيُرجَع إليه برقمه.')
      + '</div></div>';
  }
  var rows = list.map(function(l){
    return '<tr class="dv-row-act" onclick="docVault.openLetter(\'' + _jq(l.id) + '\')">'
      + '<td class="dv-num t-name">' + _esc(l.id) + '</td>'
      + '<td class="t-name">' + _esc(l.title || "—") + '</td>'
      + (isTpl ? "" : '<td class="t-dim">' + _esc(l.party || "—") + '</td>'
                    + '<td class="dv-num t-dim">' + _esc(l.letterDate || "—") + '</td>')
      + '<td class="t-dim">' + _esc(l.subject || "—") + '</td>'
      + '<td class="t-dim">' + ((l.files || []).length ? _icon("paperclip", "ic-sm") : "—") + '</td>'
      + '</tr>';
  }).join("");
  return '<div class="dv-wrap"><table class="dv-tbl"><thead><tr>'
    + '<th>الرقم</th><th>العنوان</th>'
    + (isTpl ? "" : '<th>الجهة</th><th>التاريخ</th>')
    + '<th>الموضوع</th><th>مرفق</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function _letterCardHTML(l){
  var isTpl = l.kind === "template";
  var row = function(a, b){ return '<div class="dv-f"><span class="dv-l">' + a + '</span><span>' + b + '</span></div>'; };
  return '<div class="dv-panel">'
    + '<div class="dv-head" style="margin-bottom:10px"><div>'
      + '<div class="dv-panel-h">' + _esc(l.title || l.id) + '</div>'
      + '<div class="dv-panel-s dv-num" style="margin-bottom:0">' + _esc(l.id) + (isTpl ? " — نموذج" : "") + '</div>'
    + '</div><div style="display:flex;gap:8px;flex-wrap:wrap">'
      + '<button type="button" class="btn btn-ghost btn-sm" onclick="docVault.backToLetters()">' + _icon("rotateCcw", "ic-sm") + ' رجوع</button>'
      + (isTpl && canEdit() ? '<button type="button" class="btn btn-primary btn-sm" onclick="docVault.useTemplate(\'' + _jq(l.id) + '\')">' + _icon("filePlus", "ic-sm") + ' استنسخ خطاباً منه</button>' : "")
      + (canEdit() ? '<button type="button" class="btn btn-ghost btn-sm" onclick="docVault.editLetter(\'' + _jq(l.id) + '\')">' + _icon("edit", "ic-sm") + ' تعديل</button>' : "")
      + (canDelete() ? '<button type="button" class="btn btn-delete btn-sm" onclick="docVault.delLetter(\'' + _jq(l.id) + '\')">' + _icon("trash", "ic-sm") + '</button>' : "")
    + '</div></div>'
    + '<div class="dv-grid">'
      + (isTpl ? "" : row("الجهة الموجَّه إليها", _esc(l.party || "—"))
                    + row("تاريخ الخطاب", '<span class="dv-num">' + _esc(l.letterDate || "—") + '</span>')
                    + (l.ref ? row("الرقم لدى الجهة", '<span class="dv-num">' + _esc(l.ref) + '</span>') : ""))
      + row("الموضوع", _esc(l.subject || "—"))
      + (l.body ? '<div class="dv-f wide"><span class="dv-l">المتن</span>'
          + '<div style="white-space:pre-wrap;line-height:2;font-size:12.5px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:13px 15px">'
          + _esc(l.body) + '</div></div>' : "")
      + '<div class="dv-f wide"><span class="dv-l">المرفقات</span>' + _filesHTML(l.files, null) + '</div>'
    + '</div></div>';
}

function renderLetters(){
  var host = document.getElementById("page-" + PAGE_LETTERS);
  if(!host) return;
  if(!canView()){
    host.innerHTML = '<div class="dv-empty">🔒 خزانة الوثائق غير متاحة لحسابك.</div>';
    return;
  }
  var nTpl = filterLetters(_ltrs, { kind:"template" }).length;
  var nIss = filterLetters(_ltrs, { kind:"issued" }).length;
  var head = '<div class="dv-head"><div>'
    + '<h2 class="dv-ttl">' + _icon("scrollText") + ' خزانة الوثائق — الخطابات</h2>'
    + '<div class="dv-sub">نماذجُ الخطابات تُستنسَخ ولا تُكتب من جديد، والخطاباتُ الصادرةُ تُحفَظ برقمٍ مرجعيٍّ يُرجَع إليها به.</div>'
    + '</div><div style="display:flex;gap:8px;flex-wrap:wrap">'
    + (canEdit() ? '<button type="button" class="btn btn-ghost btn-sm" onclick="docVault.newLetter(\'template\')">' + _icon("plus", "ic-sm") + ' نموذج جديد</button>'
      + '<button type="button" class="btn btn-primary btn-sm" onclick="docVault.newLetter(\'issued\')">' + _icon("plus", "ic-sm") + ' خطاب صادر</button>' : "")
    + '</div></div>';

  if(!_ltrsLoaded){ host.innerHTML = head + '<div class="dv-empty">جارٍ تحميل الخطابات…</div>'; return; }

  var body = "";
  if(_ledit){ body = _letterFormHTML(); }
  else if(_lview.open){
    var l = letterById(_lview.open);
    body = l ? _letterCardHTML(l) : '<div class="dv-empty">لم يعد هذا الخطاب موجوداً.</div>';
  } else {
    var tabs = '<div class="dv-tabs">'
      + '<button type="button" class="dv-tab' + (_lview.kind === "issued" ? " on" : "") + '" onclick="docVault.letterTab(\'issued\')">الخطابات الصادرة<span class="n">' + nIss + '</span></button>'
      + '<button type="button" class="dv-tab' + (_lview.kind === "template" ? " on" : "") + '" onclick="docVault.letterTab(\'template\')">النماذج<span class="n">' + nTpl + '</span></button>'
      + '</div>';
    var bar = '<div class="dv-bar">'
      + '<input class="form-input dv-search" type="search" placeholder="ابحث بالعنوان أو الجهة أو الموضوع…"'
      + ' value="' + _esc(_lview.q) + '" oninput="docVault.setLetterFilter(this.value)">'
      + (_lview.q ? '<button type="button" class="dv-clear" onclick="docVault.setLetterFilter(\'\')">مسح البحث</button>' : "")
      + '</div>';
    var list = filterLetters(_ltrs, _lview).sort(function(a, b){
      return String(b.letterDate || b.createdAt || "").localeCompare(String(a.letterDate || a.createdAt || ""));
    });
    body = tabs + bar + _letterTableHTML(list);
  }
  host.innerHTML = head + body;
}

function _repaint(page){
  if(page === PAGE_LETTERS){ if(_isActive(PAGE_LETTERS)) renderLetters(); return; }
  if(_isActive(PAGE_DOCS)) render();
}
function _isActive(id){
  var p = document.getElementById("page-" + id);
  return !!(p && p.classList.contains("active"));
}

/* ═══════════════════════════════════════════════════════════════════════════
   الأفعال — الوثائق
   ═══════════════════════════════════════════════════════════════════════════ */
function setFilter(k, v){ _view[k] = String(v == null ? "" : v); render(); }
function pickMonth(ym){ _view.ym = (_view.ym === ym) ? "" : String(ym); _view.level = ""; render(); }
function clearFilters(){ _view = { q:"", type:"", level:"", ym:"" }; render(); }
function open(id){ _open = String(id); _edit = null; _renew = null; render(); _top(); }
function backToList(){ _open = null; _renew = null; render(); _top(); }
function _top(){ try{ (window._scrollAppToTop || function(){ window.scrollTo(0, 0); })(); }catch(e){} }

function newDoc(){
  if(!canEdit()){ _toast("🔒 لا صلاحية لإضافة وثيقة","warn"); return; }
  _edit = { title:"", docType:"cr", docTypeOther:"", number:"", issuer:"",
            owner:"", ownerUser:"", start:"", expiry:"",
            noExpiry:false, notes:"", files:[] };
  _open = null; _renew = null; render(); _top();
}
function editDoc(id){
  if(!canEdit()){ _toast("🔒 لا صلاحية للتعديل","warn"); return; }
  var d = docById(id);
  if(!d) return;
  _edit = { id:d.id, title:d.title||"", docType:d.docType||"other",
            docTypeOther:d.docTypeOther||"", number:d.number||"",
            issuer:d.issuer||"", owner:d.owner||"", ownerUser:d.ownerUser||"",
            start:d.start||"", expiry:d.expiry||"",
            noExpiry:!!d.noExpiry, notes:d.notes||"",
            files:Array.isArray(d.files) ? d.files.slice() : [] };
  render(); _top();
}
function cancelEdit(){ _edit = null; render(); }

/* قراءةُ النموذج **قبل** أيّ إعادة رسم: إعادةُ الرسم تُتلف قيمَ الحقول غيرِ المحفوظة. */
function _readForm(){
  var g = function(id){ var el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; };
  var c = function(id){ var el = document.getElementById(id); return !!(el && el.checked); };
  _edit.title   = g("dv-title");
  _edit.docType = g("dv-type") || "other";
  /* الاسمُ اليدويُّ لا يُقرأ إلّا مع «أخرى»، ويُمحى عند الانصراف عنها — وإلّا بقي
     اسمٌ قديمٌ معلَّقاً على نوعٍ مسمّى فظهر في الجدول بدل تسميته الصحيحة. */
  _edit.docTypeOther = (_edit.docType === "other") ? g("dv-type-other") : "";
  _edit.number  = g("dv-number");
  _edit.issuer  = g("dv-issuer");
  /* المصدرُ اسمُ الدخول، والاسمُ المعروضُ يُشتقّ منه ويُحفَظ نسخةً احتياطيةً تُقرأ
     يومَ يُحذف الحساب. وبلا مسؤولٍ: يُمحى الاثنان معاً فلا يبقى اسمٌ بلا صاحب. */
  _edit.ownerUser = g("dv-owner");
  var _ow = _edit.ownerUser ? _userByLogin(_edit.ownerUser) : null;
  _edit.owner = _edit.ownerUser ? String((_ow && (_ow.name || _ow.user)) || _edit.owner || "") : "";
  _edit.start   = g("dv-start");
  _edit.noExpiry= c("dv-noexp");
  _edit.expiry  = _edit.noExpiry ? "" : g("dv-expiry");
  _edit.notes   = g("dv-notes");
}
function toggleNoExpiry(on){ _readForm(); _edit.noExpiry = !!on; if(on) _edit.expiry = ""; render(); }
/* تبديلُ النوع يُعيد الرسمَ لتظهر خانةُ الاسم اليدويّ أو تختفي — و`_readForm` قبلَه
   تحفظ ما كُتب في بقيّة الحقول، فهي في الـDOM لا في الحالة. */
function setType(v){
  if(!_edit) return;
  _readForm();
  _edit.docType = String(v || "other");
  if(_edit.docType !== "other") _edit.docTypeOther = "";
  render();
  try{ var el = document.getElementById("dv-type-other"); if(el) el.focus(); }catch(e){}
}

function addDraftFile(){
  if(!_edit) return;
  _readForm();
  _pickFile(function(f){
    var id = _edit.id || ("draft_" + Date.now());
    _toast("⏳ جارٍ رفع المرفق…", "");
    _upload("docs", id, f).then(function(rec){
      _edit.files = (_edit.files || []).concat([rec]);
      render(); _toast("✅ أُرفق الملف", "success");
    }).catch(function(e){ _toast("⚠ تعذّر رفع المرفق: " + String((e && e.message) || e), "warn"); });
  });
}
function delDraftFile(i){ if(!_edit) return; _readForm(); (_edit.files || []).splice(i, 1); render(); }

function saveEdit(){
  if(!canEdit()){ _toast("🔒 لا صلاحية للحفظ","warn"); return; }
  _readForm();
  if(!_edit.title){ _toast("⚠ أدخل عنوان الوثيقة","warn"); return; }
  if(_edit.docType === "other" && !_edit.docTypeOther){
    _toast("⚠ اكتب اسم نوع الوثيقة — «وثيقة أخرى» بلا اسمٍ لا تُميَّز عن غيرها","warn"); return;
  }
  if(!_edit.noExpiry && !_edit.expiry){ _toast("⚠ أدخل تاريخ الانتهاء، أو علّم «وثيقة دائمة»","warn"); return; }
  if(_edit.start && _edit.expiry && _edit.start > _edit.expiry){
    _toast("⚠ تاريخ البدء بعد تاريخ الانتهاء","warn"); return;
  }
  var d = _db();
  if(!d){ _toast("⚠ لا اتصال بقاعدة البيانات","warn"); return; }
  var now = new Date().toISOString(), me = _myName();
  var body = {
    title:_edit.title, docType:_edit.docType, docTypeOther:_edit.docTypeOther || "",
    number:_edit.number, issuer:_edit.issuer,
    owner:_edit.owner, ownerUser:_edit.ownerUser || "",
    start:_edit.start, expiry:_edit.expiry, noExpiry:!!_edit.noExpiry,
    notes:_edit.notes, files:_edit.files || [], updatedAt:now, updatedBy:me
  };
  var was = _edit.id;
  var p = was
    ? d.collection(DOCS_COLL()).doc(was).set(body, { merge:true }).then(function(){ return was; })
    : _nextId("DOC", DOCS_CTR()).then(function(id){
        body.createdAt = now; body.createdBy = me; body.history = []; body.renewCount = 0;
        return d.collection(DOCS_COLL()).doc(id).set(body).then(function(){ return id; });
      });
  p.then(function(id){
    _audit(was ? "تعديل وثيقة في الخزانة" : "إضافة وثيقة إلى الخزانة", id + " — " + body.title);
    _edit = null; _open = id; render(); _top();
    _toast(was ? "✅ حُفظ التعديل" : "✅ أُضيفت الوثيقة", "success");
  }).catch(function(e){ _toast("⚠ تعذّر الحفظ: " + String((e && e.message) || e), "warn"); });
}

function delDoc(id){
  if(!canDelete()){ _toast("🔒 الحذف من صلاحية مدير النظام","warn"); return; }
  var doc = docById(id);
  if(!doc) return;
  _confirm({ title:"حذف وثيقة", icon:"🗑", okText:"حذف", okClass:"btn-danger",
    msg:'سيُحذف السجلّ "' + (doc.title || id) + '" وسجلُّ تجديداته. المرفقاتُ المرفوعة لا تُحذف من التخزين.' })
    .then(function(ok){
      if(!ok) return;
      var d = _db(); if(!d) return;
      d.collection(DOCS_COLL()).doc(id).delete().then(function(){
        _audit("حذف وثيقة من الخزانة", id + " — " + (doc.title || ""));
        _open = null; render(); _toast("✅ حُذفت الوثيقة", "success");
      }).catch(function(e){ _toast("⚠ تعذّر الحذف: " + String((e && e.message) || e), "warn"); });
    }).catch(function(){});
}

/* ════════ التجديد ════════ */
function openRenew(id){
  if(!canEdit()){ _toast("🔒 لا صلاحية للتجديد","warn"); return; }
  var d = docById(id);
  if(!d) return;
  _open = id;
  _renew = { id:id, start:"", expiry:"", number:"", files:[] };
  render(); _top();
}
function _readRenew(){
  var g = function(id){ var el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; };
  _renew.start  = g("dv-rn-start");
  _renew.expiry = g("dv-rn-expiry");
  _renew.number = g("dv-rn-number");
}
function cancelRenew(){ _renew = null; render(); }
function addRenewFile(){
  if(!_renew) return;
  _readRenew();
  _pickFile(function(f){
    _toast("⏳ جارٍ رفع النسخة…", "");
    _upload("docs", _renew.id, f).then(function(rec){
      _renew.files = (_renew.files || []).concat([rec]);
      render(); _toast("✅ أُرفقت النسخة الجديدة", "success");
    }).catch(function(e){ _toast("⚠ تعذّر الرفع: " + String((e && e.message) || e), "warn"); });
  });
}
function delRenewFile(i){ if(!_renew) return; _readRenew(); (_renew.files || []).splice(i, 1); render(); }

function saveRenew(){
  if(!canEdit()){ _toast("🔒 لا صلاحية للتجديد","warn"); return; }
  _readRenew();
  var cur = docById(_renew.id);
  if(!cur){ _toast("⚠ لم تعد الوثيقة موجودة","warn"); return; }
  if(!_renew.expiry){ _toast("⚠ أدخل تاريخ الانتهاء الجديد","warn"); return; }
  if(cur.expiry && _renew.expiry <= cur.expiry){
    _toast("⚠ الانتهاء الجديد ليس بعد الحالي (" + cur.expiry + ")","warn"); return;
  }
  var next = renewDoc(cur, {
    start:  _renew.start || cur.expiry || "",
    expiry: _renew.expiry,
    number: _renew.number || cur.number || "",
    files:  _renew.files || []
  }, new Date().toISOString(), _myName());
  var d = _db();
  if(!d){ _toast("⚠ لا اتصال بقاعدة البيانات","warn"); return; }
  var body = { start:next.start, expiry:next.expiry, number:next.number, files:next.files,
               history:next.history, renewCount:next.renewCount,
               updatedAt:new Date().toISOString(), updatedBy:_myName() };
  d.collection(DOCS_COLL()).doc(cur.id).set(body, { merge:true }).then(function(){
    _audit("تجديد وثيقة", cur.id + " — حتى " + next.expiry);
    /* التنبيهُ يُصفَّر لهذه الوثيقة: بقاءُ العلامة يمنع تنبيهاً مستحقاً لو جُدِّدت
       لمدّةٍ قصيرةٍ تقع في المرتبة نفسِها. */
    try{ var m = _alertedKey(); Object.keys(m).forEach(function(k){ if(k.indexOf(cur.id + "|") === 0) delete m[k]; }); _markAlerted(m); }catch(e){}
    _renew = null; render(); refreshBadges();
    _toast("✅ جُدِّدت الوثيقة حتى " + next.expiry, "success");
  }).catch(function(e){ _toast("⚠ تعذّر التجديد: " + String((e && e.message) || e), "warn"); });
}

/* ═══════════════════════════════════════════════════════════════════════════
   الأفعال — الخطابات
   ═══════════════════════════════════════════════════════════════════════════ */
function letterTab(kind){ _lview.kind = kind; _lview.open = null; renderLetters(); }
function setLetterFilter(v){ _lview.q = String(v == null ? "" : v); renderLetters(); }
function openLetter(id){ _lview.open = String(id); _ledit = null; renderLetters(); _top(); }
function backToLetters(){ _lview.open = null; renderLetters(); _top(); }

function newLetter(kind, seed){
  if(!canEdit()){ _toast("🔒 لا صلاحية لإضافة خطاب","warn"); return; }
  var base = { kind:(kind === "template" ? "template" : "issued"), title:"", subject:"",
               party:"", letterDate:new Date().toISOString().slice(0, 10), ref:"", body:"", files:[] };
  if(seed) Object.keys(seed).forEach(function(k){ base[k] = seed[k]; });
  _ledit = base; _lview.open = null;
  _lview.kind = base.kind;
  renderLetters(); _top();
}
function editLetter(id){
  if(!canEdit()){ _toast("🔒 لا صلاحية للتعديل","warn"); return; }
  var l = letterById(id);
  if(!l) return;
  _ledit = { id:l.id, kind:l.kind || "issued", title:l.title||"", subject:l.subject||"",
             party:l.party||"", letterDate:l.letterDate||"", ref:l.ref||"", body:l.body||"",
             files:Array.isArray(l.files) ? l.files.slice() : [] };
  renderLetters(); _top();
}
function cancelLetter(){ _ledit = null; renderLetters(); }
function useTemplate(id){
  var t = letterById(id);
  if(!t){ return; }
  newLetter("issued", cloneTemplate(t, new Date().toISOString()));
  _toast("📄 استُنسخ النموذج — أكمل الجهة والتاريخ", "");
}

function _readLetterForm(){
  var g = function(id){ var el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; };
  _ledit.title   = g("dv-l-title");
  _ledit.subject = g("dv-l-subject");
  _ledit.body    = g("dv-l-body");
  if(_ledit.kind !== "template"){
    _ledit.party      = g("dv-l-party");
    _ledit.letterDate = g("dv-l-date");
    _ledit.ref        = g("dv-l-ref");
  }
}
function addLetterFile(){
  if(!_ledit) return;
  _readLetterForm();
  _pickFile(function(f){
    var id = _ledit.id || ("draft_" + Date.now());
    _toast("⏳ جارٍ رفع المرفق…", "");
    _upload("letters", id, f).then(function(rec){
      _ledit.files = (_ledit.files || []).concat([rec]);
      renderLetters(); _toast("✅ أُرفق الملف", "success");
    }).catch(function(e){ _toast("⚠ تعذّر رفع المرفق: " + String((e && e.message) || e), "warn"); });
  });
}
function delLetterDraftFile(i){ if(!_ledit) return; _readLetterForm(); (_ledit.files || []).splice(i, 1); renderLetters(); }

function saveLetter(){
  if(!canEdit()){ _toast("🔒 لا صلاحية للحفظ","warn"); return; }
  _readLetterForm();
  if(!_ledit.title){ _toast("⚠ أدخل عنوان الخطاب","warn"); return; }
  var d = _db();
  if(!d){ _toast("⚠ لا اتصال بقاعدة البيانات","warn"); return; }
  var now = new Date().toISOString(), me = _myName();
  var body = { kind:_ledit.kind, title:_ledit.title, subject:_ledit.subject, body:_ledit.body,
               party:_ledit.party || "", letterDate:_ledit.letterDate || "", ref:_ledit.ref || "",
               files:_ledit.files || [], updatedAt:now, updatedBy:me };
  if(_ledit.fromTemplate) body.fromTemplate = _ledit.fromTemplate;
  var was = _ledit.id;
  var p = was
    ? d.collection(LTRS_COLL()).doc(was).set(body, { merge:true }).then(function(){ return was; })
    : _nextId(_ledit.kind === "template" ? "TPL" : "LTR", LTRS_CTR()).then(function(id){
        body.createdAt = now; body.createdBy = me;
        return d.collection(LTRS_COLL()).doc(id).set(body).then(function(){ return id; });
      });
  p.then(function(id){
    _audit(was ? "تعديل خطاب في الخزانة" : "إضافة خطاب إلى الخزانة", id + " — " + body.title);
    _ledit = null; _lview.open = id; renderLetters(); _top();
    _toast(was ? "✅ حُفظ التعديل" : "✅ حُفظ في الخزانة برقم " + id, "success");
  }).catch(function(e){ _toast("⚠ تعذّر الحفظ: " + String((e && e.message) || e), "warn"); });
}

function delLetter(id){
  if(!canDelete()){ _toast("🔒 الحذف من صلاحية مدير النظام","warn"); return; }
  var l = letterById(id);
  if(!l) return;
  _confirm({ title:"حذف خطاب", icon:"🗑", okText:"حذف", okClass:"btn-danger",
    msg:'سيُحذف "' + (l.title || id) + '" من الخزانة. المرفقاتُ المرفوعة لا تُحذف من التخزين.' })
    .then(function(ok){
      if(!ok) return;
      var d = _db(); if(!d) return;
      d.collection(LTRS_COLL()).doc(id).delete().then(function(){
        _audit("حذف خطاب من الخزانة", id + " — " + (l.title || ""));
        _lview.open = null; renderLetters(); _toast("✅ حُذف الخطاب", "success");
      }).catch(function(e){ _toast("⚠ تعذّر الحذف: " + String((e && e.message) || e), "warn"); });
    }).catch(function(){});
}

/* ═══════════════════════════════════════════════════════════════════════════
   التركيبُ الذاتيّ — صفحتان · مجموعةُ قائمةٍ جانبية · زرُّ البوّابة · لفُّ showPage
   ═══════════════════════════════════════════════════════════════════════════ */
function ensurePages(){
  injectCSS();
  var anyPage = document.querySelector(".page");
  var host = anyPage ? anyPage.parentElement : document.body;
  PAGES.forEach(function(id){
    if(document.getElementById("page-" + id)) return;
    var div = document.createElement("div");
    div.className = "page"; div.id = "page-" + id;
    host.appendChild(div);
  });
}

/* ══ مجموعةُ القائمة الجانبية ══
   تظهر في **الوضعين معاً** — المشاريعِ والمشترياتِ المركزية — بلا سطرِ CSS واحد:
   قائمةُ الإخفاء في `app.css` قائمةٌ بيضاءُ مغلقةٌ بأسماء مجموعاتٍ بعينها، وما ليس
   فيها يبقى ظاهراً. والوثائقُ ليست تابعةً لأحد الوضعين، فبقاؤها فيهما هو الصواب. */
function injectSidebarGroup(){
  if(!canView()){
    var h = document.getElementById("hdr-grp-vault"); if(h) h.remove();
    var g = document.getElementById("grp-vault");     if(g) g.remove();
    return;
  }
  if(document.getElementById("hdr-grp-vault")) return;
  var nav = document.querySelector(".sidebar-nav");
  if(!nav) return;

  var hdr = document.createElement("div");
  hdr.className = "sidebar-group-header collapsed";
  hdr.id = "hdr-grp-vault";
  hdr.setAttribute("onclick", "toggleSidebarGroup('grp-vault')");
  hdr.innerHTML = '<span class="s-icon">' + _svg("folderOpen") + '</span> خزانة الوثائق '
    + '<span class="dv-badge" id="dv-nav-badge" style="display:none"></span>'
    + '<span class="grp-arrow" id="arrow-grp-vault">▾</span>';

  var grp = document.createElement("div");
  grp.className = "sidebar-group collapsed";
  grp.id = "grp-vault";
  grp.style.maxHeight = "0";

  [{ id:"nav-vault-docs-btn",    page:PAGE_DOCS,    icon:"shield",     lbl:"السجلّات والشهادات" },
   { id:"nav-vault-letters-btn", page:PAGE_LETTERS, icon:"scrollText", lbl:"الخطابات" }].forEach(function(b){
    var btn = document.createElement("button");
    btn.className = "sidebar-nav-btn sidebar-child";
    btn.id = b.id; btn.dataset.page = b.page;
    btn.innerHTML = '<span class="s-icon">' + _svg(b.icon) + '</span> ' + b.lbl;
    btn.onclick = function(){ try{ showPage(b.page); }catch(e){} };
    grp.appendChild(btn);
  });

  // بعد مجموعة «التعاقدات» إن وُجدت، وإلّا بعد «إدارة المشاريع»، وإلّا في النهاية
  var after = document.getElementById("grp-contracts") || document.getElementById("grp-projects");
  if(after && after.parentElement === nav){ nav.insertBefore(hdr, after.nextSibling); nav.insertBefore(grp, hdr.nextSibling); }
  else { nav.appendChild(hdr); nav.appendChild(grp); }
  refreshBadges();
}

/* ══ زرُّ البوّابة الخارجية (منتقي المشاريع) ══
   بطراز `.pk-row` القائم حرفاً بحرف — وعليه عددُ ما يستحقّ عملاً اليوم، فالتنبيهُ
   يصل **قبل** أن يفتح أحدٌ شيئاً. */
function injectLandingButton(){
  if(!canView()){
    var ex = document.getElementById("dv-landing-btn-wrap"); if(ex) ex.remove();
    return;
  }
  if(document.getElementById("dv-landing-btn-wrap")) return;
  var anchor = document.getElementById("pm-landing-btn-wrap")
            || document.getElementById("global-purchases-btn-wrap")
            || document.getElementById("project-add-btn");
  if(!anchor || !anchor.parentElement) return;
  var wrap = document.createElement("div");
  wrap.id = "dv-landing-btn-wrap";
  wrap.style.cssText = "margin:9px 0 0;width:100%";
  wrap.innerHTML =
    '<button class="pk-row" onclick="docVault.openFromLanding()">'
    + '<span class="pk-row-ic">' + _svg("folderOpen") + '</span>'
    + '<span><span>خزانة الوثائق</span><span class="pk-row-sub" id="dv-landing-sub">السجلّات والشهادات والخطابات الرسمية</span></span>'
    + '<span class="pk-row-ch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>'
    + '</button>';
  anchor.parentElement.insertBefore(wrap, anchor.nextSibling);
  var ic = wrap.querySelector("span > svg");
  if(ic){ ic.setAttribute("width","19"); ic.setAttribute("height","19"); ic.setAttribute("stroke-width","2"); }
  refreshBadges();
}

/* ══ الشارتان: القائمةُ الجانبية وسطرُ البوّابة ══
   العددُ **ما يستحقّ عملاً اليوم** (منتهية + أسبوع + شهر) لا مجموعُ الوثائق: شارةٌ
   تحمل الإجماليَّ لا تقول شيئاً ولا تسكت أبداً، فتُقرأ زينةً بعد يومين. */
function refreshBadges(){
  var roll = _docsLoaded ? rollup(_docs, new Date()) : { act:0, total:0 };
  var n = roll.act;
  var b = document.getElementById("dv-nav-badge");
  if(b) _setText(b, n ? String(n) : "", n ? "" : "none", n ? (n + " وثيقة تحتاج تجديداً") : "");
  var sub = document.getElementById("dv-landing-sub");
  if(sub){
    _setText(sub, n ? (n + " وثيقة تحتاج تجديداً — من أصل " + roll.total)
                    : "السجلّات والشهادات والخطابات الرسمية");
    var col = n ? "var(--danger)" : "";
    if(sub.style.color !== col) sub.style.color = col;
  }
}
/* الكتابةُ **عند التغيّر وحدَه**. إسنادُ `textContent` يُبدّل أبناءَ العنصر ولو
   بالنصّ نفسِه، فيراه `MutationObserver` تغييراً فينادي الحقنَ فيكتب فيراه… حلقةٌ
   لا تنتهي تُجمّد التبويب. وهذا ليس احتياطاً نظرياً: وقعت فعلاً وأُمسكت في الفحص. */
function _setText(el, txt, disp, title){
  if(el.textContent !== txt) el.textContent = txt;
  if(disp !== undefined && el.style.display !== disp) el.style.display = disp;
  if(title !== undefined && el.title !== title) el.title = title;
}

/* ══ الدخولُ من البوّابة الخارجية ══
   لا مشروعَ يُختار: الخزانةُ كيانٌ شاملٌ كالمشتريات المركزية. نُعيد استعمالَ بابِ
   الوضع المركزيّ نفسِه (`openGlobalPurchases`) ثمّ نفتح صفحتَنا — فلا بابَ ثانياً
   للدخول يفترق عن الأوّل في تهيئةِ الجلسة. */
function openFromLanding(){
  try{
    if(typeof openGlobalPurchases === "function"){
      openGlobalPurchases();
      setTimeout(function(){ try{ showPage(PAGE_DOCS); }catch(e){} }, 60);
      return;
    }
  }catch(e){}
  try{ showPage(PAGE_DOCS); }catch(e){}
}

/* ══ لفُّ showPage دون تعديل النواة ══ */
function hookShowPage(){
  if(window._dvHooked || typeof window.showPage !== "function") return;
  var orig = window.showPage;
  window.showPage = function(id){
    if(PAGES.indexOf(id) !== -1 && !canView()){
      _toast("🔒 خزانة الوثائق غير متاحة لحسابك", "warn");
      return orig.apply(this, ["dashboard"]);
    }
    orig.apply(this, arguments);
    if(PAGES.indexOf(id) === -1) return;
    var pg = document.getElementById("page-" + id);
    if(!pg) return;
    // النواةُ لا تعرف صفحتينا فلا تُفعّلهما — نُفعّلهما نحن ونطفئ البقية
    document.querySelectorAll(".page").forEach(function(p){ p.classList.remove("active"); });
    pg.classList.add("active");
    try{
      var g = document.getElementById("grp-vault");
      if(g && g.classList.contains("collapsed") && typeof toggleSidebarGroup === "function") toggleSidebarGroup("grp-vault");
    }catch(e){}
    document.querySelectorAll(".sidebar-nav-btn").forEach(function(b){ b.classList.toggle("active", b.dataset.page === id); });
    startSync();
    if(id === PAGE_LETTERS) renderLetters(); else render();
  };
  window._dvHooked = true;
}

function init(){
  ensurePages();
  injectSidebarGroup();
  injectLandingButton();
  hookShowPage();
  if(canView()) startSync();
  /* القائمةُ الجانبيةُ والبوّابةُ يُعاد بناؤهما بعد الدخول وعند تبديل المستخدم —
     فنُعيد الحقن (والإزالةَ لمن لا يملك المفتاح) عند كلّ تغيير. */
  var obs = new MutationObserver(function(){
    injectSidebarGroup(); injectLandingButton(); hookShowPage();
    if(canView()) startSync();
  });
  try{ obs.observe(document.body, { childList:true, subtree:true }); }catch(e){}
}
if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

/* ════════════ الواجهة العامة ════════════ */
window.docVault = {
  build: MODULE_BUILD,
  // الشاشات
  render:render, renderLetters:renderLetters, refreshNav:injectSidebarGroup,
  startSync:startSync, stopSync:stopSync, retry:retry, openFromLanding:openFromLanding,
  // الوثائق
  setFilter:setFilter, pickMonth:pickMonth, clearFilters:clearFilters,
  open:open, backToList:backToList, newDoc:newDoc, editDoc:editDoc, cancelEdit:cancelEdit,
  saveEdit:saveEdit, delDoc:delDoc, toggleNoExpiry:toggleNoExpiry, setType:setType,
  addDraftFile:addDraftFile, delDraftFile:delDraftFile,
  openRenew:openRenew, cancelRenew:cancelRenew, saveRenew:saveRenew,
  addRenewFile:addRenewFile, delRenewFile:delRenewFile,
  // الخطابات
  letterTab:letterTab, setLetterFilter:setLetterFilter, openLetter:openLetter,
  backToLetters:backToLetters, newLetter:newLetter, editLetter:editLetter,
  cancelLetter:cancelLetter, saveLetter:saveLetter, delLetter:delLetter,
  useTemplate:useTemplate, addLetterFile:addLetterFile, delLetterDraftFile:delLetterDraftFile,
  // القراءة
  docs:docs, letters:letters, docById:docById, letterById:letterById,
  canView:canView, canEdit:canEdit, canDelete:canDelete, roleEligible:roleEligible,
  scanAndAlert:scanAndAlert, refreshBadges:refreshBadges,
  // الدوالُّ النقيّة — يفحصها `hail-tests.js` بلا متصفّح
  daysUntil:daysUntil, alertLevel:alertLevel, docLevel:docLevel, needsAction:needsAction,
  horizonBuckets:horizonBuckets, rollup:rollup, nextRef:nextRef, renewDoc:renewDoc,
  typeLabel:typeLabel, ownerLabel:ownerLabel,
  filterDocs:filterDocs, sortDocs:sortDocs, cloneTemplate:cloneTemplate, filterLetters:filterLetters,
  _DOC_TYPES:DOC_TYPES, _LEVELS:LEVELS, _PERM_KEY:PERM_KEY,
  _PAGE_DOCS:PAGE_DOCS, _PAGE_LETTERS:PAGE_LETTERS, _HORIZON_MONTHS:HORIZON_MONTHS,
  /* ثقبُ فحصٍ صريحٌ لا بابٌ خلفيّ: يزرع بياناتٍ في الحالة **بلا شبكة** ليُرسَم الأفقُ
     والجدولُ في DOM حقيقيّ داخل `hail-tests.js`. لأنّ الحسابَ الصحيحَ الذي لا يُرسَم
     خطأٌ لا يُنذر، ولا سبيلَ لفحص الرسم بلا مصدرِ بياناتٍ سوى `onSnapshot`.
     لا يُنادى من الواجهة قطّ، ولا يكتب حرفاً في Firestore. */
  __test_seed:function(d, l){
    _docs = Array.isArray(d) ? d.slice() : [];
    _ltrs = Array.isArray(l) ? l.slice() : [];
    _docsLoaded = _ltrsLoaded = true; _err = "";
  }
};

})();
