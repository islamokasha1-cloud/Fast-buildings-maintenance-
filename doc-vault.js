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

var MODULE_BUILD = "v18.9.3191";

var PAGE_DOCS    = "vault-docs";
var PAGE_LETTERS = "vault-letters";
/* معرّفاتُ الصفحات الثلاثةِ **مجتمعةً هنا** ولو كان منطقُ كلٍّ منها أبعدَ في الملفّ:
   `PAGES` تُبنى وقتَ التحميل، و`var` المعرَّفةُ لاحقاً تُرفَع اسماً بلا قيمة — فوضعُ
   أحدِ المعرّفات بعد هذا السطر يدسّ `undefined` في المصفوفة، فتفشل `PAGES.indexOf`
   في لفّ `showPage` بصمتٍ تامّ: تُطفَأ كلُّ الصفحات ولا تُضاء واحدة، فيرى المستخدم
   شاشةً بيضاءَ بلا خطأٍ في وحدة التحكّم. */
var PAGE_EXTRACTS  = "vault-extracts";    // ما قُدِّم وما زال في مساره
var PAGE_APPROVALS = "vault-approvals";   // ما اعتُمد فعلاً
var PAGE_FILE      = "vault-project";
var PAGES        = [PAGE_DOCS, PAGE_LETTERS, PAGE_EXTRACTS, PAGE_APPROVALS, PAGE_FILE];
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
function VERIFY_COLL(){ return _dev() ? "letter_verify_dev" : "letter_verify"; }

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


/* ═══════════════════════════════════════════════════════════════════════════
   قائمةُ قرّاء الخزانة — تسطيحُ المنح ليقرأه الخادم  (طلبُ المالك: «ضيّق القراءة»)

   ── المشكلة ──
   قاعدةُ القراءة كانت `allow read: if hasRole()`: **أيُّ حسابٍ يعمل في المنصّة يقرأ
   وثائقَ الشركة وخطاباتِها ومعتمداتِها من خارج التطبيق** ولو لم يُمنح المفتاح.
   والواجهةُ تُخفي القسمَ ولا تمنع الاستعلام.

   ── ولماذا لم يُضيَّق بالدور ──
   خانةُ `docVault` تُعرض **لكلّ الأدوار** (طلبُ المالك: تُمنح لأشخاصٍ بعينهم في
   الوضعين). فقائمةُ أدوارٍ إمّا تُدخل مديرَ مشاريعَ لم يُمنح، أو تُخرج مشرفاً أو
   زائراً مُنح — وكلاهما خطأ. جُرِّب على المحاكي فسقط، والقياسُ محفوظٌ في
   `rules-check.mjs §15`.

   ── الحلّ: تسطيحُ المنح ──
   الخادمُ لا يرى `permissions`؛ لا يصله من التوكِن إلا `role` و`u` (اسمُ الدخول).
   والمستخدمون **عناصرُ مصفوفةٍ من خرائط** في `meta/users`، وقواعدُ Firestore لا
   تبحث في مصفوفةٍ عن عنصرٍ حقلُه كذا. فتُسطَّح أسماءُ الممنوحين في مستندٍ واحدٍ
   يقرؤه الخادم: `meta/vault_readers` = `{ users: [...] }` — على شكل
   `meta/manual_projects` نفسِه، وكتابتُه للأدمن وحدَه بقاعدةٍ على الخادم (من يكتبها
   يمنح نفسَه القراءة).

   ── والمزامنةُ عند المنبع ──
   `saveUsers()` في النواة هي **المسار الوحيد** الذي تُحفظ به المستخدمون. فتُنادى
   المزامنةُ بعدها بسطرٍ واحد، وتُصحَّح **أسماءُ المحفوظين وحدَهم** — فحفظُ مستخدمي
   مشروعٍ لا يمحو ممنوحي مشروعٍ آخر (لكلّ مشروعٍ مستندُ مستخدمين مستقلّ).

   ── والغيابُ يعني «كما كان» لا «مقفول» ──
   ما دام المستندُ غيرَ موجودٍ تبقى القاعدةُ تسمح لكلّ ذي دورٍ كما اليوم. فنشرُ
   القواعد قبل بناء القائمة **لا يحجب الخزانةَ عن أصحابها** — وذاك عطلٌ أسوأُ من
   الثغرة. ولئلّا يُظنَّ التضييقُ مفعَّلاً وهو ليس كذلك، تُعلن الشاشةُ للأدمن أنّه
   **غيرُ مفعَّل** وتضع زرَّ تفعيله.
   ═══════════════════════════════════════════════════════════════════════════ */

/* مستندٌ واحدٌ للبيئتين: المنحُ للأشخاص أنفسِهم، والقاعدةُ تشير إليه بلا `_dev`. */
function READERS_DOC(){ return "meta/vault_readers"; }

var _readers = null;        // null = لم يُقرأ بعد · false = غيرُ موجود · مصفوفة = موجود

/* أممنوحٌ هذا المستخدمُ الخزانةَ؟ **نفسُ قراءة `canView` حرفياً** — لكن لمستخدمٍ
   يُمرَّر، لا للحاليّ. وقائمةٌ تُبنى بقاعدةٍ غيرِ قاعدة الشاشة تحجب مَن يراها. */
function grantsVault(u){
  if(!u || !u.user) return false;
  if(u.role === "admin") return true;
  try{ if(typeof _permOn === "function") return _permOn(u.permissions, PERM_KEY, u) === true; }catch(e){}
  return !!(u.permissions && u.permissions[PERM_KEY] === true);
}

/* الدمجُ النقيّ — يُفحَص بلا متصفّح.
   `touched` = أسماءُ الدخول التي شملها الحفظُ الآن، وهي وحدَها التي يجوز نزعُها؛
   وما عداها يبقى كما هو، فلا يمحو حفظُ مشروعٍ ممنوحي مشروعٍ آخر. */
function mergeReaders(current, saved){
  var cur = Array.isArray(current) ? current.map(String) : [];
  var arr = Array.isArray(saved) ? saved : [];
  var touched = {}, granted = [];
  arr.forEach(function(u){
    if(!u || !u.user) return;
    touched[String(u.user)] = 1;
    if(grantsVault(u)) granted.push(String(u.user));
  });
  var out = cur.filter(function(n){ return !touched[n]; }).concat(granted);
  var seen = {};
  return out.filter(function(n){ if(!n || seen[n]) return false; seen[n] = 1; return true; })
            .sort(function(a, b){ return a.localeCompare(b, "ar"); });
}

function _sameList(a, b){
  if(!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  var x = a.slice().sort(), y = b.slice().sort();
  for(var i = 0; i < x.length; i++) if(String(x[i]) !== String(y[i])) return false;
  return true;
}

/* تُنادى من `saveUsers()` بعد كلّ حفظ. صامتةٌ لا تُعطّل الحفظَ إن تعذّرت: منعُ حفظِ
   مستخدمٍ لأنّ قائمةً جانبيةً لم تُكتب عطلٌ أكبرُ من تأخّرِ مزامنة. */
function syncReaders(saved){
  var d = _db();
  if(!d) return Promise.resolve(false);
  var me = _me();
  if(!me || me.role !== "admin") return Promise.resolve(false);   // الكتابةُ للأدمن بالقاعدة
  var ref = d.doc(READERS_DOC());
  return ref.get().then(function(snap){
    var cur = (snap.exists && Array.isArray((snap.data() || {}).users))
      ? snap.data().users.map(String) : [];
    var next = mergeReaders(cur, Array.isArray(saved) ? saved : _users());
    if(snap.exists && _sameList(cur, next)){ _readers = next; return false; }
    return ref.set({ users:next, updatedAt:new Date().toISOString(), updatedBy:_myName() })
      .then(function(){
        _readers = next;
        _audit("تحديث قائمة قرّاء الخزانة", next.length + " مستخدماً");
        _repaint(PAGE_DOCS);
        return true;
      });
  }).catch(function(){ return false; });
}

/* التفعيلُ الأوّل: تُجمَع أسماءُ الممنوحين من **كلّ** مستندات المستخدمين — المركزيِّ
   ومستندِ كلّ مشروع — فالقائمةُ تُبنى كاملةً لا من سياق الشاشة وحدَه. (نمطُ
   `_loadAllUsersForLogin` في النواة.) */
function enableReaderLock(){
  var d = _db(), me = _me();
  if(!d) return Promise.resolve(false);
  if(!me || me.role !== "admin"){ _toast("🔒 التفعيل من صلاحية مدير النظام", "warn"); return Promise.resolve(false); }
  _toast("⏳ جارٍ جمع الممنوحين من كلّ المشاريع…", "");
  var suffix = _dev() ? "_users_dev" : "_users";
  return d.doc(_dev() ? "meta/projects_dev" : "meta/projects").get()
    .then(function(ps){
      var projs = (ps.exists && Array.isArray((ps.data() || {}).projects)) ? ps.data().projects : [];
      var refs = projs.map(function(p){ return d.doc("meta/" + p.id + suffix).get().catch(function(){ return null; }); });
      refs.push(d.doc(_dev() ? "meta/users_dev" : "meta/users").get().catch(function(){ return null; }));
      return Promise.all(refs);
    })
    .then(function(snaps){
      var all = [];
      snaps.forEach(function(s){
        if(!s || !s.exists) return;
        var u = (s.data() || {}).users;
        if(Array.isArray(u)) all = all.concat(u);
      });
      /* والمستخدمون الحاضرون في الذاكرة أيضاً — مشروعٌ لم يُدرَج في `meta/projects`
         لا يُسقط ممنوحيه. */
      all = all.concat(_users());
      var next = mergeReaders([], all);
      return d.doc(READERS_DOC()).set({ users:next, updatedAt:new Date().toISOString(), updatedBy:_myName() })
        .then(function(){
          _readers = next;
          _audit("تفعيل قفل قراءة الخزانة", next.length + " مستخدماً ممنوحاً");
          _toast("✅ فُعِّل التضييق — " + next.length + " مستخدماً في القائمة", "success");
          _repaint(PAGE_DOCS); _repaint(PAGE_LETTERS); _repaint(PAGE_APPROVALS);
          return true;
        });
    })
    .catch(function(e){
      _toast("⚠ تعذّر التفعيل: " + String((e && e.message) || e), "warn");
      return false;
    });
}

function _readReaders(){
  var d = _db();
  if(!d || _readers !== null) return;
  d.doc(READERS_DOC()).get().then(function(s){
    _readers = (s.exists && Array.isArray((s.data() || {}).users)) ? s.data().users.map(String) : false;
    _repaint(PAGE_DOCS); _repaint(PAGE_LETTERS); _repaint(PAGE_APPROVALS);
  }).catch(function(){ _readers = null; });
}

/* بلاغُ «التضييقُ غيرُ مفعَّل» — للأدمن وحدَه، وما دامت القائمةُ غيرَ موجودة.
   وإعلانُه شرطٌ لا زينة: قاعدةٌ تُنشَر ولا تُفعَّل تُوهم بحمايةٍ لا وجودَ لها. */
function _readerLockNoticeHTML(){
  var me = _me();
  if(!me || me.role !== "admin") return "";
  if(_readers !== false) return "";
  return '<div class="dv-note-link">' + _icon("shield", "ic-sm")
    + '<span><b>قراءةُ الخزانة غيرُ مضيَّقة بعد.</b> اليومَ يستطيع أيُّ حسابٍ في المنصّة '
    + 'قراءةَ بياناتها من خارج التطبيق ولو لم تمنحه المفتاح. والتفعيلُ يبني قائمةَ '
    + 'الممنوحين على الخادم فيُردُّ مَن سواهم.</span>'
    + '<button type="button" class="dv-clear" onclick="docVault.enableReaderLock()">فعّل التضييق الآن</button>'
    + '</div>';
}

/* ═══════════════════════════════════════════════════════════════════════════
   طبقةُ المشروع — تصنيفُ الخزانة، ومِلَفُّ كلّ مشروع  (طلبُ المالك)

   ── المشكلة ──
   الخزانةُ كانت تعرف «الجهة» ولا تعرف **المشروع**: الوثائقُ والخطاباتُ بلا حقلٍ
   أصلاً، والمعتمداتُ بحقلٍ **حُرٍّ** يُكتب بيده. والحقلُ الحرُّ لا يصنّف — «برج هيل»
   و«برج هايل» و«مشروع هيل» ثلاثةُ مشاريعَ في نظر الجدول — فلا ترشيحٌ يُبنى عليه
   ولا أرشيفٌ يُجمَع به. فالربطُ الحقيقيُّ شرطُ كلِّ ما بعده لا زينةٌ فوقه.

   ── المبدأ الأوّل: معرّفٌ واسمٌ معاً، لا أحدُهما ──
   يُخزَّن **ثلاثيُّ المنصّة القياسيّ** (`projectId` · `projectName` ·
   `isCustomProject`) كما تفعل طلباتُ الشراء والتعاقدات حرفاً بحرف. المعرّفُ للربط،
   **والاسمُ لأنّ الأرشيفَ يُقرأ بعد سنوات**: مشروعٌ يُعاد تسميتُه أو يُرفَع من
   `meta/projects` يُحيل سجلَّه كلَّه إلى رموزٍ إنجليزيةٍ لا تُقرأ إن لم يكن الاسمُ
   منسوخاً بجانبه — وهي علّةٌ وقعت في المنصّة فعلاً وأُصلحت في `v18.9rr`. والعرضُ
   يفضّل الاسمَ **الطازج** من القائمة ويرتدّ إلى المنسوخ، كما يفعل `_getProjName`.

   ── المبدأ الثاني: نطاقٌ قبل المشروع ──
   السجلُّ التجاريُّ وشهادةُ الزكاة **لا تخصّان مشروعاً** — تخصّان الشركة. وفرضُ
   مشروعٍ عليهما كذبٌ على قارئها. فلكلّ سجلٍّ **نطاق**: `company` أو `project`.
   والسجلّاتُ القائمةُ بلا حقلٍ تُقرأ `company` — وهو الصحيحُ لا افتراضاً مريحاً:
   ما في الخزانة اليومَ وثائقُ شركةٍ وخطاباتُها.

   ── المبدأ الثالث: القديمُ لا يُطابَق بالاسم ──
   في المعتمدات سجلّاتٌ تحمل اسمَ مشروعٍ نصّاً بلا معرّف. **لا تُطابَق تلقائياً.**
   مطابقةٌ ظنّيةٌ تنسب مستخلصاً لمشروعٍ خطأ، وذلك **أسوأُ من «غير مربوط»** لأنّ
   الخطأ يُصدَّق ويُبنى عليه. تُعرض موسومةً وبجانبها زرُّ ربطٍ بنقرة، والقرارُ لعينٍ
   تقرأ.

   ── وحصرُ الرؤية: حجبُ عرضٍ لا حدُّ أمان ──
   `_visibleProjectsFor` مصدرٌ واحدٌ تقرؤه بوّابةُ المشاريع ومركزُ العمليات، وقاعدتُه
   «قائمةُ `user.projects` غيرُ الفارغة تحصر، والأدمن يرى الكلَّ» — نقرؤها هنا ولا
   نخترع غيرَها.
   **لكنّه حجبُ عرضٍ ولا يُسمّى خصوصية:** التوكِن لا يحمل إلا الدورَ واسمَ الدخول،
   والمستخدمون عناصرُ **مصفوفةٍ** داخل `meta/users` — وقاعدةُ Firestore لا تستطيع
   البحثَ في مصفوفةٍ عن العنصر الذي اسمُه كذا، فلا سبيلَ لكتابة «هذا لمشاريعه
   وحدَها» على الخادم اليوم. والحصرُ هنا في الواجهة **كما هو في البلاغات والأصول
   والوقائية وكلِّ بيانات المشاريع في المنصّة** — متّسقٌ معها، لا ثغرةٌ جديدةٌ فيها.
   وما يلزم لفرضه على الخادم مذكورٌ بنداً مؤجّلاً باسمه في `NOTES §6`.

   ── ووثائقُ الشركة لا تُحجب عن أحدٍ في الخزانة ──
   حجبُها عمّن يملك مفتاحَ الخزانة **يكتم تنبيهَ انتهائها** عمّن قد يكون هو المسؤولَ
   عن تجديدها. فهي مرئيةٌ لكلّ ذي مفتاحٍ مهما حُصرت مشاريعُه.
   ═══════════════════════════════════════════════════════════════════════════ */

var SCOPE_COMPANY = "company";     // نطاقٌ: يخصّ الشركةَ كلَّها
var SCOPE_PROJECT = "project";     // نطاقٌ: يخصّ مشروعاً بعينه
var MANUAL_ID     = "__OTHER__";   // سنتينل المشروع اليدويّ — اصطلاحُ المنصّة، يُخزَّن
/* مفاتيحُ **عرضٍ وترشيحٍ لا تُخزَّن أبداً** — تُميّز حالاتٍ لا يميّزها معرّفٌ فارغ. */
var FILTER_ALL      = "";
var FILTER_COMPANY  = "__COMPANY__";
var FILTER_UNLINKED = "__UNLINKED__";
var SCOPE_LBL       = "على مستوى الشركة";

/* ══ قراءةُ خدمات النواة بالاسم المجرّد — كـ`_users()` تماماً ══ */
function _projList(){
  try{
    var a = (typeof window !== "undefined") ? window._projectsList : null;
    return Array.isArray(a) ? a : [];
  }catch(e){ return []; }
}
function _curProjId(){
  try{
    if(_isCentral()) return "";
    return (typeof CURRENT_PROJECT !== "undefined" && CURRENT_PROJECT && CURRENT_PROJECT.id)
      ? String(CURRENT_PROJECT.id) : "";
  }catch(e){ return ""; }
}
function _isCentral(){
  try{ return !!(document.body && document.body.classList.contains("global-purchases-mode")); }
  catch(e){ return false; }
}
/* `null` = بلا حصر (أدمن، أو مستخدمٌ بلا قائمةِ مشاريع). وإلّا مصفوفةُ معرّفات. */
function allowedProjectIds(){
  var u = _me();
  if(!u || u.role === "admin") return null;
  if(!Array.isArray(u.projects) || !u.projects.length) return null;
  return u.projects.map(String);
}

/* ══ الدوالُّ النقيّة — يفحصها `hail-tests.js` بلا متصفّح ══ */

/* مرجعُ المشروع مقروءاً من سجلٍّ **بأيّ عمر**: بحقلِ نطاقٍ أو بلا، بمعرّفٍ أو باسمٍ
   وحدَه. فلا يحتاج السجلُّ القديمُ ترحيلاً ليُقرأ. */
function projRef(rec){
  rec = rec || {};
  var id    = String(rec.projectId || "");
  var name  = String(rec.projectName || "");
  var scope = (rec.scope === SCOPE_PROJECT || rec.scope === SCOPE_COMPANY) ? rec.scope : "";
  if(!scope) scope = (id || name) ? SCOPE_PROJECT : SCOPE_COMPANY;
  var manual = (rec.isCustomProject === true) || id === MANUAL_ID;
  return { scope:scope, id:id, name:name, manual:manual,
           /* اسمٌ بلا معرّف = سجلٌّ من قبل الربط، يُوسَم ولا يُخمَّن له مشروع. */
           unlinked: scope === SCOPE_PROJECT && !id && !!name };
}

/* الاسمُ المعروض — الطازجُ من القائمة أوّلاً، ثمّ المنسوخ، ولا يُعرض معرّفٌ خام. */
function projLabel(rec, projects){
  var r = projRef(rec);
  if(r.scope === SCOPE_COMPANY) return SCOPE_LBL;
  if(r.manual) return r.name || "مشروع يدويّ";
  var arr = Array.isArray(projects) ? projects : _projList();
  for(var i = 0; i < arr.length; i++){
    if(arr[i] && String(arr[i].id) === r.id && arr[i].name) return String(arr[i].name);
  }
  return r.name || "غير مربوط بمشروع";
}

/* مفتاحُ التجميع والترشيح — يفصل مشروعَين يدويَّين باسمين مختلفين (اصطلاحُ
   `__CUSTOM__:` في النواة)، ويميّز «غيرَ المربوط» عن «الشركة» عن «الكلّ». */
function projKey(rec){
  var r = projRef(rec);
  if(r.scope === SCOPE_COMPANY) return FILTER_COMPANY;
  if(r.unlinked) return FILTER_UNLINKED;
  if(r.manual)   return "__CUSTOM__:" + r.name;
  return r.id;
}
function inProject(rec, sel){
  sel = String(sel || "");
  if(sel === FILTER_ALL) return true;
  return projKey(rec) === sel;
}

/* حصرُ الرؤية. وغيرُ المربوط والمشروعُ اليدويُّ محجوبان عن المحصور: لا معرّفَ
   يُطابَق به، وعرضُ ما **قد** يكون له أسوأُ من حجبِه — وربطُ القديم عملُ مَن يرى
   الكلَّ أصلاً. */
function visibleTo(rec, allowedIds){
  if(!Array.isArray(allowedIds)) return true;
  var r = projRef(rec);
  if(r.scope === SCOPE_COMPANY) return true;
  if(r.unlinked || r.manual) return false;
  return allowedIds.indexOf(r.id) !== -1;
}
function visibleList(list, allowedIds){
  if(!Array.isArray(allowedIds)) return Array.isArray(list) ? list.slice() : [];
  return (Array.isArray(list) ? list : []).filter(function(x){ return visibleTo(x, allowedIds); });
}

/* من قيمة الـ`select` إلى **الشكل المخزَّن**. ولا يُخزَّن `__COMPANY__` ولا
   `__UNLINKED__` ولا `__CUSTOM__:` أبداً — تلك مفاتيحُ عرضٍ، والمخزَّنُ ثلاثيُّ
   المنصّة وحدَه ومعه النطاق. و`prevName` يحفظ اسمَ مشروعٍ لم يعد في القائمة من أن
   يُمحى بمجرّد حفظِ السجلّ من شاشته. */
function normalizeProjectPick(o){
  o = o || {};
  var sel = String(o.sel || "");
  /* «غيرُ المربوط» يبقى غيرَ مربوط. حفظُ سجلٍّ قديمٍ من شاشته دون لمسِ خانةِ
     المشروع **لا يجوز أن يحوّله إلى «على مستوى الشركة»** — ذلك ادّعاءٌ لم يقلْه
     أحد، ويمحو اسمَ المشروع المكتوبَ فيه فيضيع آخرُ دليلٍ على انتمائه. */
  if(sel === FILTER_UNLINKED){
    return { scope:SCOPE_PROJECT, projectId:"",
             projectName:String(o.prevName || ""), isCustomProject:false };
  }
  if(sel === FILTER_ALL || sel === FILTER_COMPANY){
    return { scope:SCOPE_COMPANY, projectId:"", projectName:"", isCustomProject:false };
  }
  /* اختيارُ اسمٍ يدويٍّ قائم، أو كتابةُ اسمٍ جديد — كلاهما يُخزَّن **بالشكل نفسِه**
     (سنتينل المنصّة والعلَم والاسم)، فلا يتفرّع شكلان لمعنى واحد. */
  if(_isManualKey(sel)){
    return { scope:SCOPE_PROJECT, projectId:MANUAL_ID,
             projectName:_manualKeyName(sel).trim(), isCustomProject:true };
  }
  if(sel === MANUAL_ID){
    return { scope:SCOPE_PROJECT, projectId:MANUAL_ID,
             projectName:String(o.manualName || "").trim(), isCustomProject:true };
  }
  var arr = Array.isArray(o.projects) ? o.projects : _projList(), nm = "";
  for(var i = 0; i < arr.length; i++){
    if(arr[i] && String(arr[i].id) === sel){ nm = String(arr[i].name || ""); break; }
  }
  return { scope:SCOPE_PROJECT, projectId:sel,
           projectName:nm || String(o.prevName || ""), isCustomProject:false };
}

/* ══ ما يجوز للمستخدم أن يُودع فيه ويرى ══
   المحصورُ لا يُعرض له في النموذج إلا مشاريعُه: قائمةٌ تعرض ما لا يراه بعدها
   تصنع سجلّاتٍ تختفي من صاحبها لحظةَ حفظِها. */
function _projSortName(a, b){
  return String((a && (a.name || a.id)) || "")
    .localeCompare(String((b && (b.name || b.id)) || ""), "ar");
}
/* ══ المشاريعُ المُدخَلةُ يدوياً ══
   مشروعٌ يدويٌّ ليس في `meta/projects`، فهو **غائبٌ عن `_projectsList` بالكامل**.
   ولولا هذا لَأمكن إيداعُ سجلٍّ فيه ثمّ **تعذّر العثورُ عليه أبداً**: لا خيارَ له في
   المُرشِّح، ولا ملفَّ مشروعٍ يفتحه — يُرى تحت «كلّ المشاريع» فقط، وهو عينُ الضياع
   الذي جاء التصنيفُ ليمنعه.
   والمصدرُ `_manualProjectNamesAll()` في النواة (أسماءُ `meta/manual_projects`
   موحَّدةً مع المشتقّة من طلبات الشراء) — **يُقرأ ولا يُعاد اشتقاقُه هنا**، وإلّا
   افترقت قائمةُ الخزانة عن قائمة المشتريات فصار للمشروع الواحد اسمان.
   والمفتاحُ `__CUSTOM__:<الاسم>` اصطلاحُ النواة نفسُه — **عرضاً وترشيحاً لا تخزيناً**:
   المخزَّنُ يبقى `__OTHER__` مع الاسم والعلَم. */
function _manualNames(){
  try{
    if(typeof _manualProjectNamesAll === "function"){
      var a = _manualProjectNamesAll();
      if(Array.isArray(a)) return a.map(String).filter(Boolean);
    }
  }catch(e){}
  try{
    var b = (typeof _manualProjectNames !== "undefined") ? _manualProjectNames : null;
    return Array.isArray(b) ? b.map(String).filter(Boolean) : [];
  }catch(e){ return []; }
}
function _manualKey(name){ return "__CUSTOM__:" + String(name || ""); }
function _isManualKey(v){ return String(v || "").indexOf("__CUSTOM__:") === 0; }
function _manualKeyName(v){ return _isManualKey(v) ? String(v).slice(11) : ""; }

/* المشاريعُ اليدويةُ المعروضة: المعروفةُ من النواة، **وما وُجد في سجلّات الخزانة
   نفسِها** — سجلٌّ باسمٍ يدويٍّ لم يعد في قائمة النواة يبقى له خيارٌ يُعثَر به عليه. */
function _manualOptions(list){
  /* والمحصورُ بمشاريعَ بعينها لا تُعرض له المشاريعُ اليدوية أصلاً: لا معرّفَ لها
     يُطابَق بقائمته، فهو **لا يرى سجلَّها ولو أودعه بنفسه**. وخيارٌ يُودَع فيه ثمّ
     يختفي فورَ حفظه أسوأُ من غيابه. */
  if(Array.isArray(allowedProjectIds())) return [];
  var seen = {}, out = [];
  _manualNames().forEach(function(nm){ if(nm && !seen[nm]){ seen[nm] = 1; out.push(nm); } });
  (Array.isArray(list) ? list : []).forEach(function(x){
    var r = projRef(x);
    if(r.manual && r.name && !seen[r.name]){ seen[r.name] = 1; out.push(r.name); }
  });
  return out.sort(function(a, b){ return a.localeCompare(b, "ar"); });
}

function _pickableProjects(){
  var allowed = allowedProjectIds(), arr = _projList().slice();
  if(Array.isArray(allowed)){
    arr = arr.filter(function(p){ return p && allowed.indexOf(String(p.id)) !== -1; });
  }
  return arr.sort(_projSortName);
}
/* قيمةُ الـ`select` المقابلةُ لسجلٍّ قائم. */
function _projSelFor(rec){
  var r = projRef(rec);
  if(r.unlinked) return FILTER_UNLINKED;
  if(r.scope === SCOPE_COMPANY) return FILTER_COMPANY;
  /* اليدويُّ يُنتقى **باسمه** لا بخيار «اكتب اسماً جديداً»: فتحُ التحرير على خانةٍ
     نصّيةٍ يدعو إلى إعادة كتابة الاسم، وحرفٌ يختلف يُنشئ مشروعاً ثانياً. */
  if(r.manual) return r.name ? _manualKey(r.name) : MANUAL_ID;
  return r.id || FILTER_COMPANY;
}

/* ══ منتقي المشروع في النماذج ══
   `<select>` لا `datalist`: الأخيرُ **لا يفتح قائمتَه على iPadOS** أصلاً — بلاغُ
   المالك في `v18.9.3135`، والمالكُ يعمل من iPad. والخيارُ اللاصقُ لمشروعٍ لم يعد
   في القائمة يحفظ انتماءَ السجلّ من أن يُمحى بحفظةٍ واحدة. */
function _projFieldHTML(e, setter, list){
  var sel = String(e.projSel || FILTER_COMPANY);
  var arr = _pickableProjects(), seen = false;
  var opts = '<option value="' + FILTER_COMPANY + '"' + (sel === FILTER_COMPANY ? " selected" : "") + '>'
           + '— ' + _esc(SCOPE_LBL) + ' (لا يخصّ مشروعاً) —</option>';
  if(sel === FILTER_UNLINKED){
    opts += '<option value="' + FILTER_UNLINKED + '" selected>⚠ غير مربوط — '
          + _esc(e.projectName || "اسمٌ قديمٌ بلا مشروع") + '</option>';
  }
  arr.forEach(function(p){
    if(!p || !p.id) return;
    if(String(p.id) === sel) seen = true;
    opts += '<option value="' + _esc(p.id) + '"' + (String(p.id) === sel ? " selected" : "") + '>'
          + _esc(p.name || p.id) + '</option>';
  });
  if(sel && sel !== FILTER_COMPANY && sel !== FILTER_UNLINKED && sel !== MANUAL_ID
     && !_isManualKey(sel) && !seen){
    opts += '<option value="' + _esc(sel) + '" selected>'
          + _esc(e.projectName || sel) + ' (خارج القائمة)</option>';
  }
  /* المشاريعُ اليدويةُ المعروفةُ **خياراتٌ تُنتقى** — و«اكتب اسمه» في الذيل للجديد
     وحدَه. عكسُه يدفع إلى إعادة كتابة اسمٍ قائمٍ فيتولّد منه مشروعٌ ثانٍ بحرف. */
  var mans = _manualOptions(list), mseen = false;
  mans.forEach(function(nm){
    var k = _manualKey(nm);
    if(k === sel) mseen = true;
    opts += '<option value="' + _esc(k) + '"' + (k === sel ? " selected" : "") + '>'
          + _esc(nm) + ' — يدويّ</option>';
  });
  if(_isManualKey(sel) && !mseen){
    opts += '<option value="' + _esc(sel) + '" selected>'
          + _esc(_manualKeyName(sel)) + ' — يدويّ</option>';
  }
  opts += '<option value="' + MANUAL_ID + '"' + (sel === MANUAL_ID ? " selected" : "") + '>'
        + '— مشروع يدويّ جديد (اكتب اسمه) —</option>';
  var html = '<select class="form-input" onchange="docVault.' + setter + '(this.value)">' + opts + '</select>';
  if(sel === MANUAL_ID){
    html += '<input class="form-input" id="dv-proj-manual" style="margin-top:6px"'
          + ' value="' + _esc(e.projManual || "") + '" placeholder="اسم المشروع كما تكتبه">'
          + '<div class="dv-hint">المشروعُ اليدويُّ لا يظهر لمن حُصرت مشاريعُه — لا معرّفَ يُطابَق به.</div>';
  } else if(sel === FILTER_UNLINKED){
    html += '<div class="dv-hint">سجلٌّ من قبل الربط: فيه اسمُ مشروعٍ نصّاً بلا معرّف. '
          + 'اخترِ المشروعَ من القائمة ليدخل ملفَّه — ولا يُخمَّن له مشروعٌ تلقائياً.</div>';
  }
  return html;
}

/* ══ مُرشِّحُ المشروع في الشاشات ══
   افتراضُه المشروعُ المفتوح، و«كلُّ المشاريع» في الوضع المركزيّ — يُحسَب مرّةً عند
   أوّل رسمٍ لا في كلّ رسمة، وإلّا أعاد كلُّ تحديثٍ للقائمة ضبطَ ما اختاره المستخدم.
   و«غيرُ المربوط» خيارٌ **لا يظهر إلا إن وُجد** — فلا يُعلَن نقصٌ ليس موجوداً. */
function _projFilterHTML(cur, setter, list){
  var arr = _pickableProjects(), sel = String(cur || FILTER_ALL), seen = false;
  var anyUnlinked = (Array.isArray(list) ? list : []).some(function(x){ return projRef(x).unlinked; });
  var opts = '<option value="' + FILTER_ALL + '"' + (sel === FILTER_ALL ? " selected" : "") + '>كل المشاريع</option>'
           + '<option value="' + FILTER_COMPANY + '"' + (sel === FILTER_COMPANY ? " selected" : "") + '>'
           + _esc(SCOPE_LBL) + '</option>';
  arr.forEach(function(p){
    if(!p || !p.id) return;
    if(String(p.id) === sel) seen = true;
    opts += '<option value="' + _esc(p.id) + '"' + (String(p.id) === sel ? " selected" : "") + '>'
          + _esc(p.name || p.id) + '</option>';
  });
  var mans = _manualOptions(list), mseen = false;
  mans.forEach(function(nm){
    var k = _manualKey(nm);
    if(k === sel) mseen = true;
    opts += '<option value="' + _esc(k) + '"' + (k === sel ? " selected" : "") + '>'
          + _esc(nm) + ' — يدويّ</option>';
  });
  if(_isManualKey(sel) && !mseen){
    opts += '<option value="' + _esc(sel) + '" selected>'
          + _esc(_manualKeyName(sel)) + ' — يدويّ</option>';
  }
  if(anyUnlinked || sel === FILTER_UNLINKED){
    opts += '<option value="' + FILTER_UNLINKED + '"' + (sel === FILTER_UNLINKED ? " selected" : "") + '>'
          + '⚠ غير مربوط بمشروع</option>';
  }
  if(sel && sel !== FILTER_ALL && sel !== FILTER_COMPANY && sel !== FILTER_UNLINKED
     && !_isManualKey(sel) && !seen){
    opts += '<option value="' + _esc(sel) + '" selected>' + _esc(sel) + ' (خارج القائمة)</option>';
  }
  return '<select class="form-input" onchange="docVault.' + setter + '(this.value)">' + opts + '</select>';
}

/* سطرُ المشروع تحت اسم السجلّ في الجدول — **لا عمودٌ إضافيّ**: الجداولُ الثلاثةُ
   بلغت تسعةَ أعمدةٍ وعاشرٍ يخنقها على الجوّال. ويصمت حين لا يقول شيئاً: مع
   مُرشِّحِ مشروعٍ بعينه كلُّ صفٍّ من ذلك المشروع، فتكرارُ اسمه في كلّ سطرٍ ضجيج.
   وغيرُ المربوط يُعلَن **دائماً** — هو نداءُ عملٍ لا وصفُ حال. */
function _projSubHTML(rec, curFilter){
  var r = projRef(rec);
  if(r.unlinked){
    return '<div class="t-dim" style="font-weight:400">⚠ غير مربوط — «' + _esc(r.name) + '»</div>';
  }
  if(String(curFilter || "") !== FILTER_ALL) return "";
  if(r.scope === SCOPE_COMPANY) return '<div class="t-dim" style="font-weight:400">' + _esc(SCOPE_LBL) + '</div>';
  return '<div class="t-dim" style="font-weight:400">' + _esc(projLabel(rec)) + '</div>';
}

/* ══ نداءُ ربطِ القديم ══
   المُرشِّحُ يفتح على المشروع المفتوح، فالسجلّاتُ غيرُ المربوطة **لا مشروعَ لها
   فلا تظهر في أيّ منها** — فتبقى أبداً بلا أن يعلم بها أحد. والوسمُ في الصفّ لا
   يُغني: لا يُرى إلّا لمن وصل إلى الصفّ أصلاً. فالنداءُ فوق الجدول دائماً، بعددِه
   وبزرٍّ يُظهرها. ويختفي وحدَه حين لا يبقى منها شيء — فلا يصير أثاثاً يُتجاهَل. */
function _unlinkedNoticeHTML(list, setter, cur){
  if(String(cur || "") === FILTER_UNLINKED) return "";
  var n = (Array.isArray(list) ? list : []).filter(function(x){
    return !x.archived && projRef(x).unlinked;
  }).length;
  if(!n) return "";
  return '<div class="dv-note-link">' + _icon("alertTriangle", "ic-sm")
    + '<span>' + n + (n === 1 ? " سجلٌّ" : " سجلّاً") + ' فيه اسمُ مشروعٍ نصّاً بلا ربط — '
    + 'لا يظهر في ملفّ أيّ مشروع حتى يُربَط.</span>'
    + '<button type="button" class="dv-clear" onclick="docVault.' + setter + '(\'' + FILTER_UNLINKED + '\')">'
    + 'أظهِرها لأربطها</button></div>';
}

/* رقاقةُ المشروع في الجداول والبطاقات — موحَّدةٌ في الشاشات الثلاث. */
function _projChipHTML(rec){
  var r = projRef(rec);
  if(r.unlinked){
    return '<span class="dv-chip l-urgent" title="سجلٌّ قديمٌ بلا معرّف مشروع">⚠ '
         + _esc(r.name) + '</span>';
  }
  if(r.scope === SCOPE_COMPANY) return '<span class="dv-chip l-plan">' + _esc(SCOPE_LBL) + '</span>';
  return '<span class="dv-chip l-ok">' + _esc(projLabel(rec)) + '</span>';
}

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

/* ════════ عباراتُ الخطاب الرسميّ — اختياريةٌ قابلةٌ للتعديل ════════
   طلبُ المالك: «كلمة سعادة و المحترم اجعلهم اختيارين للتعديل واعطيني اختيارات كل
   واحد حسب منصبه»، و«عبارة النهاية اجعلها اخيارية قابلة للتعديل».

   القوائمُ **اقتراحاتٌ لا حصر**: الحقلُ نصٌّ حرٌّ تحته `datalist`، فيُكتب ما ليس
   فيها ويُختار ما فيها بنقرة. و`<select>` كان سيُغلق البابَ على لقبٍ لم نُحصِه
   (ولقبُ المخاطَبة في المراسلات الرسمية لا يُحصى: جهاتٌ وهيئاتٌ ورتبٌ عسكريةٌ
   وألقابٌ شرعية). وإن لم يدعم المتصفّحُ `datalist` بقي الحقلُ خانةَ كتابةٍ عادية —
   يسقط الاقتراحُ ولا يسقط الحقل.

   والفراغُ يعني **لا تطبع السطر** — وهو معنى «اختيارية». */
var PREFIX_OPTS = ["سعادة", "معالي", "سمو", "السيد", "السادة", "فضيلة",
                   "الأستاذ", "الدكتور", "المهندس", "العميد", "اللواء"];
var HONORIFIC_OPTS = ["المحترم", "المحترمين", "حفظه الله", "حفظهم الله",
                      "سلّمه الله", "الموقّر", "الموقّرين"];
var DEF_PREFIX    = "سعادة";
var DEF_HONORIFIC = "المحترم";
var DEF_GREET     = "السلام عليكم ورحمة الله وبركاته،";
var DEF_CLOSING   = "وتفضلوا بقبول فائق الاحترام والتقدير،";

/* الحقلُ الغائبُ (خطابٌ قديمٌ حُفظ قبل هذه الحقول) يأخذ الافتراض، والفارغُ صراحةً
   يبقى فارغاً. ولولا التفريقُ لَما أمكن **إلغاءُ** عبارةٍ أبداً: الفراغُ يُقرأ
   «لم يُحدَّد» فيُعاد الافتراضُ فوقه في كلّ طباعة. */
function _orDef(v, dflt){ return (v === undefined || v === null) ? String(dflt) : String(v); }

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
    if(!inProject(doc, (f && f.proj) || "")) return false;
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
                 typeLabel(doc), doc.docTypeOther, projLabel(doc), doc.projectName,
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
    prefix:    _orDef(t.prefix, DEF_PREFIX),
    honorific: _orDef(t.honorific, DEF_HONORIFIC),
    closing:   _orDef(t.closing, DEF_CLOSING),
    files:   [],
    fromTemplate: String(t.id || "")
  };
}
/* ── نسخُ خطابٍ قائمٍ إلى خطابٍ جديد (طلبُ المالك: «توليد خطاب جديد بنفس بيانات
   خطاب ما») ──
   عكسُ استنساخ النموذج تماماً: النموذجُ **يُفرِّغ** الجهةَ لأنّها مجهولة، والنسخُ
   **يُبقيها** لأنّ الغالبَ خطابٌ آخر إلى الجهة نفسِها في المشروع نفسِه (شهادةُ
   نظافةٍ لمستخلصٍ تالٍ · تذكيرٌ بخطابٍ سابق). فيُحمَل كلُّ ما يُكتب باليد — الجهةُ
   والموضوعُ والمتنُ والموقّعُ والألقابُ والختامُ والمشروع — ويُترَك ما يخصّ
   **الخطابَ الواحدَ بعينه**: رقمُه (يُصدره العدّاد)، وتاريخُه (اليوم)، ورقمُه لدى
   الجهة، ومرفقاتُه — فمرفقُ خطابٍ سابقٍ على خطابٍ جديدٍ يُرسِل الوثيقةَ الخطأ.
   ويُسجَّل الأصلُ في `copiedFrom` أثراً لا مرجعاً: النسخةُ خطابٌ مستقلٌّ لا يتبع
   الأصلَ إن عُدِّل. */
function cloneLetter(src, at){
  var l = src || {};
  var out = {
    kind:    "issued",
    title:   String(l.title || ""),
    subject: String(l.subject || ""),
    body:    String(l.body || ""),
    party:   String(l.party || ""),
    letterDate: String(at || "").slice(0, 10),
    ref:     "",
    signId:    String(l.signId || ""),
    signName:  String(l.signName || ""),
    signTitle: String(l.signTitle || ""),
    prefix:    _orDef(l.prefix, DEF_PREFIX),
    honorific: _orDef(l.honorific, DEF_HONORIFIC),
    closing:   _orDef(l.closing, DEF_CLOSING),
    files:   [],
    copiedFrom: String(l.id || "")
  };
  if(l.fromTemplate) out.fromTemplate = String(l.fromTemplate);
  return out;
}

/* ════════ التحقّقُ من الخطاب الصادر — رمزُ QR يحمل رابطاً ════════
   طلبُ المالك بعد سؤاله «ما الفائدة من الباركود؟»: الباركودُ يحمل الرقمَ والرقمُ
   لا يُثبت شيئاً. فالصادرُ يحمل إلى جانبه رمزَ QR برابطِ صفحةِ تحقّقٍ عامة
   (`verify.html`) تقول: صادرٌ فعلاً برقم كذا بتاريخ كذا إلى جهة كذا وموقّعُه فلان.

   ── لماذا رمزٌ عشوائيٌّ لا رقمُ الخطاب ──
   رقمُ الخطاب **تسلسليّ** (`LTR-2609-0009`): مَن يعرف واحداً يعدّ ما قبلَه وما
   بعدَه ويسحب سجلَّ مراسلات الشركة كلَّه من صفحةٍ عامة. فالرابطُ يحمل **رمزاً
   عشوائياً** (٢٠ محرفاً من أبجدية ٣٢ ≈ ١٠٠ بت) لا يُخمَّن ولا يُعَدّ، والصفحةُ
   تقرأ **بالرمز وحدَه** (`get`)، ولا `list` على المجموعة لأحد.

   ── ولماذا مجموعةٌ عامةٌ منفصلة (`letter_verify`) لا قراءةٌ من `global_letters` ──
   فتحُ `global_letters` للعموم يكشف المتنَ والمرفقاتِ ورقمَ الجهة — وهي ما قرّرنا
   في `v18.9.3148` تضييقَ قراءته على قائمة مأذونين. فالمجموعةُ العامة **نسخةٌ
   مقتضبةٌ** بخمسة حقولٍ لا تكشف شيئاً لا يقرؤه مستلمُ الورقة أصلاً: الرقمُ
   والتاريخُ والجهةُ والموضوعُ والموقّع. تُكتب مع كلّ حفظٍ للصادر وتُحذف مع حذفه.
   والرمزُ يُصدَر **مرّةً** ويبقى: طباعةُ الخطاب ثانيةً بعد عامٍ تحمل الرابطَ نفسَه. */
var VERIFY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // بلا I·O·0·1 المتشابهة
function newVerifyToken(){
  var n = 20, out = "", buf = null;
  try{ if(typeof crypto !== "undefined" && crypto.getRandomValues){ buf = new Uint8Array(n); crypto.getRandomValues(buf); } }catch(e){ buf = null; }
  for(var i = 0; i < n; i++){
    var r = buf ? buf[i] % 32 : Math.floor(Math.random() * 32);
    out += VERIFY_ALPHABET.charAt(r);
  }
  return out;
}
function isVerifyToken(t){ return /^[A-HJ-NP-Z2-9]{20}$/.test(String(t || "")); }
/* الأساسُ من موضع الصفحة نفسِها: `verify.html` يجاور `index.html` على المضيف
   نفسِه (GitHub Pages) — فلا نطاقَ يُكتب بيدٍ ويُنسى عند نقل الاستضافة. */
function verifyBase(){
  try{
    var h = String(location.href || "").split("#")[0].split("?")[0];
    return h.replace(/[^\/]*$/, "") + "verify.html";
  }catch(e){ return "verify.html"; }
}
function verifyUrl(base, token, dev){
  return String(base || "") + "?t=" + encodeURIComponent(String(token || "")) + (dev ? "&d=1" : "");
}
/* النسخةُ العامة المقتضبة — **بلا متنٍ ولا مرفقاتٍ ولا رقمِ الجهة ولا مشروع**.
   حقولُها هي ما يقرؤه حاملُ الورقة بعينه، فلا تكشف الصفحةُ العامةُ شيئاً جديداً. */
function verifyRecord(l, at){
  var x = l || {};
  return {
    letterId:   String(x.id || ""),
    letterDate: String(x.letterDate || ""),
    party:      String(x.party || ""),
    subject:    String(x.subject || ""),
    signName:   String(x.signName || ""),
    signTitle:  String(x.signTitle || ""),
    updatedAt:  String(at || "")
  };
}
function filterLetters(list, f){
  var q    = String((f && f.q) || "").trim().toLowerCase();
  var kind = String((f && f.kind) || "");
  return (Array.isArray(list) ? list : []).filter(function(l){
    if(!l || l.archived) return false;
    if(!inProject(l, (f && f.proj) || "")) return false;
    if(kind && l.kind !== kind) return false;
    if(q){
      var hay = [l.title, l.subject, l.party, l.ref, l.id, l.body,
                 projLabel(l), l.projectName].join(" ").toLowerCase();
      if(hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   الباركود — Code 128-B مرسومٌ SVG بلا مكتبة (طلبُ المالك: «الخطاب الصادر يكون
   له باركود مع رقم الخطاب»)

   ── لماذا بلا مكتبة ──
   المطبوعةُ تُبنى في **نافذةٍ جديدة** بـ`document.write` (وعلى iOS مستندُ `blob:`
   لا أصلَ له). ووسمُ <script> من CDN هناك سباقٌ مع أمر الطباعة: تُطبَع الورقةُ
   قبل أن يصل الملفُّ فيخرج الخطابُ **بلا باركود ولا خطأٍ يُنذر**. والرسمُ SVG
   **نصٌّ داخل الصفحة نفسِها** — يصل معها أو لا تصل هي.

   ── ولماذا Code 128-B لا QR ──
   المطلوبُ رقمُ الخطاب لا محتواه: سطرٌ من أربعة عشر محرفاً يُقرأ بأيّ ماسحٍ
   مكتبيّ. و128-B يغطّي الحروفَ اللاتينية والأرقام والشرطة — وهو بالضبط شكلُ
   `LTR-YYMM-NNNN`. وQR يلزمه مُرمِّزٌ بمئاتِ الأسطر لفائدةٍ لا تُطلَب هنا.

   ── والرقمُ مكتوبٌ تحت الأعمدة ──
   ماسحٌ يعطب أو طابعةٌ تُشوّه الأعمدةَ تجعل الباركودَ حبراً لا يُقرأ. والرقمُ
   المقروءُ بالعين تحته هو ما يُنقذ الورقةَ حينها — وهو عُرفُ كلّ مطبوعةٍ مرقَّمة.
   ═══════════════════════════════════════════════════════════════════════════ */

/* جدولُ الرموز القياسيّ: ١٠٧ نمطاً، كلٌّ منها ١١ وحدةً (١ = عمودٌ أسود). */
var C128 = [
"11011001100","11001101100","11001100110","10010011000","10010001100","10001001100",
"10011001000","10011000100","10001100100","11001001000","11001000100","11000100100",
"10110011100","10011011100","10011001110","10111001100","10011101100","10011100110",
"11001110010","11001011100","11001001110","11011100100","11001110100","11101101110",
"11101001100","11100101100","11100100110","11101100100","11100110100","11100110010",
"11011011000","11011000110","11000110110","10100011000","10001011000","10001000110",
"10110001000","10001101000","10001100010","11010001000","11000101000","11000100010",
"10110111000","10110001110","10001101110","10111011000","10111000110","10001110110",
"11101110110","11010001110","11000101110","11011101000","11011100010","11011101110",
"11101011000","11101000110","11100010110","11101101000","11101100010","11100011010",
"11101111010","11001000010","11110001010","10100110000","10100001100","10010110000",
"10010000110","10000101100","10000100110","10110010000","10110000100","10011010000",
"10011000010","10000110100","10000110010","11000010010","11001010000","11110111010",
"11000010100","10001111010","10100111100","10010111100","10010011110","10111100100",
"10011110100","10011110010","11110100100","11110010100","11110010010","11011011110",
"11011110110","11110110110","10101111000","10100011110","10001011110","10111101000",
"10111100010","11110101000","11110100010","10111011110","10111101110","11101011110",
"11110101110","11010000100","11010010000","11010011100","11000111010"];
var C128_START_B = 104, C128_STOP = 106;

/* ما يقبله الترميزُ: ASCII ٣٢–١٢٦. وما خرج عنه يُسقَط بدل أن يُنتج أعمدةً
   لا تُقرأ — باركودٌ صامتُ العطب أسوأُ من غيابه. */
function code128Sanitize(text){
  var s = String(text == null ? "" : text), out = "";
  for(var i = 0; i < s.length; i++){
    var c = s.charCodeAt(i);
    if(c >= 32 && c <= 126) out += s.charAt(i);
  }
  return out;
}

/* سلسلةُ الوحدات الثنائية كاملةً: بدءٌ + بيانات + خانةُ تحقّق + وقوف + عمودان.
   خانةُ التحقّق مجموعٌ موزونٌ بموضع المحرف (والبدءُ وزنُه واحد) بباقي ١٠٣ — وهي
   ما يجعل الماسحَ يرفض قراءةً ناقصةً بدل أن يسلّم رقماً خطأً. */
function code128Bits(text){
  var s = code128Sanitize(text);
  if(!s) return "";
  var sum = C128_START_B, bits = C128[C128_START_B], i, v;
  for(i = 0; i < s.length; i++){
    v = s.charCodeAt(i) - 32;
    bits += C128[v];
    sum += v * (i + 1);
  }
  bits += C128[sum % 103];
  bits += C128[C128_STOP] + "11";
  return bits;
}

/* رسمُ الأعمدة SVG. `viewBox` بوحدات الترميز و`width` بالمليمتر — فالطابعةُ تقيس
   بالورقة لا بالبكسل، والأعمدةُ تبقى بنِسَبها مهما تغيّر المقاس. والأعمدةُ
   المتجاورةُ تُدمَج في مستطيلٍ واحد: مستطيلاتٌ متلاصقةٌ يفصلها التقريبُ بشعرةٍ
   بيضاء فيقرؤها الماسحُ فاصلاً كاذباً. */
function code128SVG(text, opt){
  var o = opt || {};
  var bits = code128Bits(text);
  if(!bits) return "";
  var h = Number(o.height) || 34;          // ارتفاعُ الأعمدة بوحدات الرسم
  var mm = Number(o.widthMM) || 46;        // عرضُ الوسم على الورق
  var rects = "", i = 0, start;
  while(i < bits.length){
    if(bits.charAt(i) === "1"){
      start = i;
      while(i < bits.length && bits.charAt(i) === "1") i++;
      rects += '<rect x="' + start + '" y="0" width="' + (i - start) + '" height="' + h + '"/>';
    } else i++;
  }
  return '<svg class="bc" role="img" aria-label="باركود ' + _esc(code128Sanitize(text)) + '"'
    + ' viewBox="0 0 ' + bits.length + ' ' + h + '" width="' + mm + 'mm" height="' + (h * mm / bits.length * 2.2) + 'mm"'
    + ' preserveAspectRatio="none" shape-rendering="crispEdges" fill="#000"'
    + ' xmlns="http://www.w3.org/2000/svg">' + rects + '</svg>';
}

/* ═══════════════════════════════════════════════════════════════════════════
   المعتمدات — أرشيفُ ما قدّمناه للعميل واعتُمد (طلبُ المالك)

   ── الفجوةُ التي يسدّها ──
   المنصّةُ كلُّها تتبع **ما علينا**: طلبُ الشراء ندفعه، ومستخلصُ مقاول الباطن في
   `contracts.js` **يأتي إلينا فنعتمده ونسدّده** («لا سدادَ قبل رفع نسخة المستخلص
   موقّعةً من المقاول»). وليس فيها موضعٌ لِما **لنا**: خطابٌ رفعناه للمالك، أو
   مستخلصٌ قدّمناه فاعتُمد بمبلغٍ أقلّ، أو مطالبةٌ مضى عليها شهران بلا ردّ.
   فالاتجاهان متعاكسان ولا تداخُلَ بينهما — وهذا سجلُّ الاتجاه الآخر.

   ── ولماذا سجلٌّ ثالثٌ لا تبويبٌ في الخطابات ──
   الخطاباتُ تُسأل «أين الخطابُ رقم كذا؟»، وهذه تُسأل **«ما الذي قدّمناه ولم
   يُعتمد بعد، ومنذ متى؟»** — سؤالُ مالٍ واقفٍ خارجَ الشركة لا سؤالُ أرشفة.
   وشكلُه **سجلُّ أعمار** لا قائمةً مرقَّمة: ما طال انتظارُه يعلو.

   ── والفارقُ يُعرض ولا يُبدّل الحالة ──
   مستخلصٌ قُدِّم بمئةٍ واعتُمد بتسعين **معتمدٌ** لا «جزئيّ»: الحالةُ قرارُ الجهة،
   والفارقُ رقمٌ يُقرأ بجانبها. ولو اشتُقّت الحالةُ من المبلغ لَتغيّرت تحت يد
   المستخدم كلّما صحّح رقماً — وحالةٌ تتبدّل بلا قرارٍ تُفقد الثقةَ بالسجلّ كلِّه.

   ── ولا تُحسَب هنا موازنةٌ ولا تكلفة ──
   أرشيفٌ بمرفقاتٍ وأعمار، لا نظامَ مستحقّات. وربطُه بموازنة المشاريع قرارٌ مستقلٌّ
   يُتَّخذ وحدَه إن أُريد (مذكورٌ في `NOTES` بنداً مؤجَّلاً).
   ═══════════════════════════════════════════════════════════════════════════ */
function APRS_COLL(){ return _dev() ? "global_approvals_dev" : "global_approvals"; }
function APRS_CTR(){  return _dev() ? "meta/global_approvals_counter_dev" : "meta/global_approvals_counter"; }

/* `PAGE_APPROVALS` معرَّفٌ مع أخويه في رأس الملفّ — انظر التعليل هناك. */

/* أنواعُ المستند — `fin` تعني أنّ له مبلغاً يُقاس فارقُه. */
var APR_TYPES = [
  { key:"extract",  lbl:"مستخلص",         fin:true  },
  { key:"claim",    lbl:"مطالبة مالية",   fin:true  },
  { key:"change",   lbl:"أمر تغيير",      fin:true  },
  { key:"letter",   lbl:"خطاب",           fin:false },
  { key:"handover", lbl:"محضر استلام",    fin:false },
  { key:"other",    lbl:"مستند آخر",      fin:false }
];
var APR_LBL = (function(){ var m={}; APR_TYPES.forEach(function(t){ m[t.key]=t.lbl; }); return m; })();
var APR_FIN = (function(){ var m={}; APR_TYPES.forEach(function(t){ m[t.key]=!!t.fin; }); return m; })();

var APR_STATUS = [
  { key:"submitted", lbl:"مُقدَّم — بانتظار الاعتماد" },
  { key:"approved",  lbl:"معتمد" },
  { key:"rejected",  lbl:"مرفوض نهائياً" },
  { key:"paid",      lbl:"معتمد ومسدَّد" }
];
var APR_ST_LBL = (function(){ var m={}; APR_STATUS.forEach(function(x){ m[x.key]=x.lbl; }); return m; })();

var _aprs = [], _aprsUnsub = null, _aprsLoaded = false;

/* ═══════════════════════════════════════════════════════════════════════════
   مسارُ الاعتماد — لكلّ جهةٍ محطاتُها  (طلبُ المالك: «لكل مستخلص مسار من أول
   تقديمه حتى اعتماده — لكل جهة مسار مختلف»)

   ── المشكلة ──
   المستخلصُ عند الجهة يمرّ بمحطاتٍ (مكتبٌ فنيّ · ماليّة · استشاريّ · مدقّق · PMO …)
   والسجلُّ كان يعرف حالتين فقط: «مُقدَّم» و«معتمد». فسؤالُ «أين هو الآن ومنذ
   متى؟» لا جوابَ له إلّا في ذاكرة من يتابعه. وجدولُ «موقف المستخلصات» الذي يُعدّه
   المالكُ بيده كلَّ شهرٍ هو عينُ هذا السؤال.

   ── المبدأ ──
   • **المسارُ يُعرَّف على الجهة** (`vault_parties`) قائمةَ محطاتٍ مرتّبةً لكلٍّ منها
     اسمٌ ومدّةٌ متوقّعةٌ بالأيام — ويُعدَّل بحرّية.
   • **والمستندُ يرث نسخةً منه عند إنشائه** (`stages[]`) لا مرجعاً: تعديلُ مسار
     الجهة بعد سنةٍ لا يُعيد كتابةَ تاريخِ مستخلصاتٍ مضت. فالمسارُ على المستند
     **أثرٌ** لا إعداد.
   • **الحالةُ تُشتقّ من المسار لا تُكتب بيد**: الوصولُ إلى آخر محطةٍ ثمّ «اعتماد»
     هو ما يقلب الحالةَ إلى «معتمد» — بمبلغه وتاريخه — فيدخل تلقائياً معتمداتِ
     المشروع وملفَّه. ولذلك **المشروعُ إلزاميٌّ** لكلّ نوعٍ له مسار.
   • **الإعادةُ للتصحيح إلى محطةٍ تُختار** لا إلى البداية حتماً، والسببُ إلزاميّ،
     وكلُّ حركةٍ قيدٌ في `stageLog[]` لا يُمحى: من أين · إلى أين · متى · بيد مَن.
   • **ما لا مسارَ له يبقى كما كان**: الخطابُ ومحضرُ الاستلام (لا مسار)، والسجلّاتُ
     القديمةُ بلا `stages` — تُحرَّك حالتُها بيدٍ كما قبل. فلا هجرةَ ولا كسر.
   • **المدّةُ المتوقّعةُ تُلوّن ولا تُنبّه** (قرارُ المالك: «نكتفي لون مبدئياً»).

   ── التخزين ──
   `vault_parties` (+`_dev`) بالقاعدة نفسِها كأخواتها في الخزانة، وعدّادُها في
   `meta/vault_parties_counter`. وعلى المستند: `partyId` · `stages[]` · `stageIdx`
   · `stageLog[]`.
   ═══════════════════════════════════════════════════════════════════════════ */
function PARTIES_COLL(){ return _dev() ? "vault_parties_dev" : "vault_parties"; }
function PARTIES_CTR(){  return _dev() ? "meta/vault_parties_counter_dev" : "meta/vault_parties_counter"; }

/* الأنواعُ التي تسلك مساراً: الماليُّ وحدَه (مستخلصٌ · مطالبةٌ · أمرُ تغيير) —
   الخطابُ ومحضرُ الاستلام لا يُعتمَدان عبر محطات (قرارُ المالك). */
function aprTypeHasPath(t){ return !!APR_FIN[String(t || "")]; }

/* المسارُ النموذجيّ — مسارُ مستخلصات أمانة حائل كما في جدول المالك، من اليسار إلى
   اليمين. يُزرَع كبدايةٍ لجهةٍ جديدة ويُعدَّل بحرّية؛ والمددُ تقديرٌ ابتدائيّ. */
var PATH_TEMPLATE_NAME = "أمانة حائل";
var PATH_TEMPLATE = [
  { lbl:"المكتب الفني",                            days:5 },
  { lbl:"المالية",                                 days:5 },
  { lbl:"اعتماد الاستشاري",                        days:7 },
  { lbl:"اعتماد مدير الإدارة",                     days:5 },
  { lbl:"شهادة النظافة",                           days:3 },
  { lbl:"المدقق",                                  days:7 },
  { lbl:"الرفع إلى PMO من إدارة المباني",          days:5 },
  { lbl:"الرفع إلى PMO من المكتب الفني بالشركة",   days:5 },
  { lbl:"PMO",                                     days:7 },
  { lbl:"المكتب التنفيذي",                         days:7 },
  { lbl:"الرفع إلى المالية",                       days:10 }
];

/* أنواعُ الحركات في سجلّ المسار */
var STAGE_KINDS = { start:"بدء المسار", forward:"انتقال", back:"إعادة للتصحيح",
                    approve:"اعتماد", reject:"رفض نهائيّ", paid:"سداد" };

/* ════════ الدوالُّ النقيّة — يفحصها `hail-tests` بلا متصفّح ════════ */

/* تنظيفُ قائمةِ محطات: يُسقط الفارغَ ويضبط الأيامَ رقماً غيرَ سالب — وينسخ. */
function pathNormalize(stages){
  return (Array.isArray(stages) ? stages : []).map(function(s){
    var lbl = String((s && s.lbl) || "").trim();
    var d = Number(s && s.days);
    return { lbl:lbl, days:(isFinite(d) && d > 0) ? Math.round(d) : 0 };
  }).filter(function(s){ return !!s.lbl; });
}

/* أللمستند مسارٌ؟ نسخةٌ مثبَّتةٌ عليه بمحطةٍ واحدةٍ على الأقلّ. */
function aprHasPath(a){ return !!(a && Array.isArray(a.stages) && a.stages.length > 0); }

/* المحطةُ الحالية — رقمٌ محصورٌ في حدود المسار، و`-1` لما لا مسارَ له. */
function aprStageAt(a){
  if(!aprHasPath(a)) return -1;
  var i = Number(a.stageIdx);
  if(!isFinite(i)) i = 0;
  return Math.max(0, Math.min(a.stages.length - 1, Math.floor(i)));
}

/* تاريخُ دخول المحطة الحالية: آخرُ قيدٍ في السجلّ وصل إليها، وإلّا تاريخُ التقديم
   (المحطةُ الأولى تبدأ بالتقديم نفسِه). */
function aprStageEnteredAt(a){
  if(!aprHasPath(a)) return "";
  var idx = aprStageAt(a), log = Array.isArray(a.stageLog) ? a.stageLog : [];
  for(var i = log.length - 1; i >= 0; i--){
    var e = log[i];
    if(e && Number(e.to) === idx && e.at) return String(e.at).slice(0, 10);
  }
  return String(a.submittedAt || "").slice(0, 10);
}

/* أيامُ الوقوف في المحطة الحالية — للمقدَّم ذي المسار وحدَه، و`null` لغيره
   (صفرٌ يُقرأ «دخلها اليوم» وهو معنى آخر). */
function aprStageDays(a, today){
  if(!aprHasPath(a) || String(a.status || "submitted") !== "submitted") return null;
  var d = daysUntil(aprStageEnteredAt(a), today);
  return (d === null) ? null : Math.max(0, -d);
}

/* شريحةُ اللون: على المدّة المتوقّعة للمحطة إن وُجدت (تجاوزُها تحذيرٌ، وضعفُها
   خطر)، وإلّا سلّمُ الانتظار العامّ (٣٠ · ٦٠). */
function aprStageBand(days, expected){
  if(days === null || days === undefined) return "none";
  var x = Number(expected);
  if(isFinite(x) && x > 0){
    if(days > 2 * x) return "crit";
    if(days > x) return "warn";
    return "ok";
  }
  return aprAgeBand(days);
}

/* قيدٌ في سجلّ المسار — الاسمان منسوخان لأنّ السجلَّ يُقرأ بعد أن تتبدّل المحطات. */
function _stageEntry(a, kind, from, to, o){
  var st = (a && Array.isArray(a.stages)) ? a.stages : [];
  var lblOf = function(i){ return (i >= 0 && st[i]) ? String(st[i].lbl || "") : ""; };
  return { kind:String(kind || ""), at:String((o && o.at) || "").slice(0, 10),
           from:from, to:to, fromLbl:lblOf(from), toLbl:lblOf(to),
           by:String((o && o.by) || ""), note:String((o && o.note) || "").trim() };
}
function _withLog(a, entry){
  return (Array.isArray(a && a.stageLog) ? a.stageLog : []).concat([entry]);
}

/* تثبيتُ مسارٍ على مستندٍ مُقدَّم — نسخةٌ لا مرجع. `null` إن لم يكن يقبله:
   لا مسارَ للجهة، أو نوعٌ بلا مسار، أو مستندٌ صدر فيه قرارٌ أصلاً. */
function aprAttachPath(a, stages, o){
  if(!a || !aprTypeHasPath(a.docType)) return null;
  if(String(a.status || "submitted") !== "submitted") return null;
  var st = pathNormalize(stages);
  if(!st.length) return null;
  var base = { stages:st, stageIdx:0, stageLog:[] };
  var e = _stageEntry(base, "start", -1, 0, o);
  return { stages:st, stageIdx:0, stageLog:[e] };
}

/* الانتقالُ إلى المحطة التالية. `null` عند آخر محطة — هناك «اعتماد» لا «تالٍ». */
function aprAdvance(a, o){
  if(!aprHasPath(a) || String(a.status || "submitted") !== "submitted") return null;
  var i = aprStageAt(a);
  if(i >= a.stages.length - 1) return null;
  return { stageIdx:i + 1, stageLog:_withLog(a, _stageEntry(a, "forward", i, i + 1, o)) };
}

/* الإعادةُ للتصحيح إلى محطةٍ تُختار — أيُّ محطةٍ غيرِ الحالية، والسببُ إلزاميّ:
   إعادةٌ بلا سببٍ في السجلّ لا تُفيد من يقرأه بعد شهر. */
function aprReturnTo(a, to, o){
  if(!aprHasPath(a) || String(a.status || "submitted") !== "submitted") return null;
  var i = aprStageAt(a), t = Number(to);
  if(!isFinite(t) || t < 0 || t >= a.stages.length || Math.floor(t) === i) return null;
  if(!String((o && o.note) || "").trim()) return null;
  t = Math.floor(t);
  return { stageIdx:t, stageLog:_withLog(a, _stageEntry(a, "back", i, t, o)) };
}

/* الاعتمادُ — من آخر محطةٍ وحدَها (لِما له مسار). يقلب الحالةَ ويثبّت التاريخَ
   والمبلغَ المعتمَد؛ وغيرُ الماليّ بلا مبلغ. */
function aprApprove(a, o){
  if(!a || String(a.status || "submitted") !== "submitted") return null;
  if(aprHasPath(a) && aprStageAt(a) !== a.stages.length - 1) return null;
  var at = String((o && o.at) || "").slice(0, 10);
  if(!at) return null;
  if(a.submittedAt && at < String(a.submittedAt).slice(0, 10)) return null;
  var out = { status:"approved", approvedAt:at };
  if(aprIsFinancial(a.docType)){
    var n = Number(o && o.amountApproved);
    if(o && (o.amountApproved === "" || o.amountApproved === null || o.amountApproved === undefined) || !isFinite(n) || n < 0) return null;
    out.amountApproved = n;
  } else out.amountApproved = "";
  if(aprHasPath(a)){
    var i = aprStageAt(a);
    out.stageLog = _withLog(a, _stageEntry(a, "approve", i, i, o));
  }
  return out;
}

/* الرفضُ النهائيّ — من أيّ محطة، والسببُ إلزاميّ. */
function aprReject(a, o){
  if(!a || String(a.status || "submitted") !== "submitted") return null;
  if(!String((o && o.note) || "").trim()) return null;
  var out = { status:"rejected", approvedAt:"", amountApproved:"" };
  if(aprHasPath(a)){ var i = aprStageAt(a); out.stageLog = _withLog(a, _stageEntry(a, "reject", i, i, o)); }
  return out;
}

/* السدادُ — للمعتمَد وحدَه. */
function aprMarkPaid(a, o){
  if(!a || String(a.status || "") !== "approved") return null;
  var out = { status:"paid" };
  if(aprHasPath(a)){ var i = aprStageAt(a); out.stageLog = _withLog(a, _stageEntry(a, "paid", i, i, o)); }
  return out;
}

/* الجهةُ المقترَحةُ لمشروع: عميلُ المشروع (`client`) يطابق اسمَ جهةٍ في السجلّ —
   اقتراحٌ يُعرض في النموذج ويُبدَّل بنقرة، لا ربطٌ صامت. */
function partyForProject(parties, project){
  var c = String((project && project.client) || "").trim().toLowerCase();
  if(!c) return null;
  var arr = Array.isArray(parties) ? parties : [];
  for(var i = 0; i < arr.length; i++){
    var p = arr[i];
    if(p && String(p.name || "").trim().toLowerCase() === c) return p;
  }
  return null;
}

/* عددُ الإعادات في سجلّ المستند — يُعرض بجانب المحطة. */
function aprReturnCount(a){
  return (Array.isArray(a && a.stageLog) ? a.stageLog : []).filter(function(e){ return e && e.kind === "back"; }).length;
}

/* ════════ الحالة والمزامنة — سجلُّ الجهات ════════ */
var _parties = [], _partiesUnsub = null, _partiesLoaded = false;
var _pPanel = false;      // أمفتوحةٌ لوحةُ الجهات؟
var _pEdit  = null;       // مسوّدةُ الجهة قيدَ التحرير
var _pAct   = null;       // فعلٌ جارٍ على بطاقة مستند: { kind, to, note, amt, at, files }

function parties(){ return _parties.slice(); }
function partyById(id){
  for(var i = 0; i < _parties.length; i++) if(_parties[i] && _parties[i].id === id) return _parties[i];
  return null;
}
function _partySync(){
  var d = _db();
  if(!d || _partiesUnsub || !canView()) return;
  _partiesUnsub = d.collection(PARTIES_COLL()).onSnapshot(function(snap){
    _parties = snap.docs.map(function(x){ var v = x.data() || {}; v.id = x.id; return v; })
      .sort(function(a, b){ return String(a.name || "").localeCompare(String(b.name || ""), "ar"); });
    _partiesLoaded = true; _repaint(PAGE_APPROVALS);
  }, function(e){ _partiesLoaded = true; _err = String((e && e.message) || e); _repaint(PAGE_APPROVALS); });
}
function _partyStopSync(){
  try{ if(_partiesUnsub) _partiesUnsub(); }catch(e){}
  _partiesUnsub = null; _parties = []; _partiesLoaded = false;
}
var _aview = { q:"", type:"", status:"", open:null, proj:null };   // «المعتمدات» — و`open` مشتركةٌ بين الشاشتين
var _xview = { q:"", type:"", status:"", proj:null };              // «المستخلصات»
var _aEdit = null;

function approvals(){ return _aprs.slice(); }
function approvalById(id){
  for(var i=0;i<_aprs.length;i++) if(_aprs[i] && _aprs[i].id === id) return _aprs[i];
  return null;
}

/* ════════ الدوالُّ النقيّة — يفحصها `hail-tests` بلا متصفّح ════════ */

/* أهذا النوعُ ماليّ؟ نوعٌ مجهولٌ (بياناتٌ قديمةٌ أو مستوردة) يُعامَل غيرَ ماليّ:
   إظهارُ خانتَي مبلغٍ فارغتين لمحضر استلامٍ أهونُ من إخفائهما عن مستخلص. */
function aprIsFinancial(t){ return !!APR_FIN[String(t || "")]; }

/* عمرُ الانتظار بالأيام — للمقدَّم وحدَه. المعتمَدُ والمرفوضُ والمسدَّدُ لا ينتظرون،
   فيردّ `null`: صفرٌ هنا كان سيُقرأ «قُدِّم اليوم» وهو معنى آخرُ تماماً. */
function aprDaysWaiting(a, today){
  if(!a || String(a.status || "submitted") !== "submitted") return null;
  var d = daysUntil(a.submittedAt, today);
  return (d === null) ? null : -d;      // `daysUntil` تردّ سالباً لما مضى
}

/* الفارقُ بين المقدَّم والمعتمد — موجبٌ يعني **خصماً** من الجهة.
   `null` لغير الماليّ أو حين لا رقمين يُقارنان: صفرٌ يُقرأ «لا خصم» وهو ادّعاء. */
function aprVariance(a){
  if(!a || !aprIsFinancial(a.docType)) return null;
  var s = Number(a.amountSubmitted), p = Number(a.amountApproved);
  if(!isFinite(s) || !isFinite(p) || !a.amountSubmitted || a.amountApproved === "" ||
     a.amountApproved === null || a.amountApproved === undefined) return null;
  return s - p;
}

/* الحصيلة: مبالغُ وأعدادٌ وأطولُ انتظار. المبالغُ **للماليّ وحدَه** — جمعُ محضر
   استلامٍ في إجماليٍّ مالي يُفسد الرقم بلا أن يظهر ذلك في سطر. */
function aprRollup(list, today){
  var out = { total:0, submitted:0, approved:0, rejected:0, paid:0,
              sumSubmitted:0, sumApproved:0, sumWaiting:0, sumPaid:0, variance:0, oldest:0, oldestId:"" };
  (Array.isArray(list) ? list : []).forEach(function(a){
    if(!a || a.archived) return;
    out.total++;
    var st = String(a.status || "submitted");
    if(out[st] !== undefined) out[st]++;
    if(!aprIsFinancial(a.docType)) return;
    var s = Number(a.amountSubmitted) || 0, p = Number(a.amountApproved) || 0;
    out.sumSubmitted += s;
    if(st === "approved" || st === "paid") out.sumApproved += p;
    if(st === "paid") out.sumPaid += p;
    if(st === "submitted"){
      out.sumWaiting += s;
      var w = aprDaysWaiting(a, today);
      if(w !== null && w > out.oldest){ out.oldest = w; out.oldestId = a.id || ""; }
    }
    var v = aprVariance(a);
    if(v !== null && (st === "approved" || st === "paid")) out.variance += v;
  });
  return out;
}

function filterApprovals(list, f, today){
  var q = String((f && f.q) || "").trim().toLowerCase();
  var ty = String((f && f.type) || ""), st = String((f && f.status) || "");
  return (Array.isArray(list) ? list : []).filter(function(a){
    if(!a || a.archived) return false;
    if(!inProject(a, (f && f.proj) || "")) return false;
    if(ty && a.docType !== ty) return false;
    if(st && String(a.status || "submitted") !== st) return false;
    if(q){
      var hay = [a.title, a.party, a.projectName, a.ourRef, a.theirRef, a.notes, a.id,
                 projLabel(a), APR_LBL[a.docType] || a.docType].join(" ").toLowerCase();
      if(hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}

/* الترتيب: **ما ينتظر أوّلاً وأطولُه انتظاراً أعلاه** — وهو سؤالُ الشاشة نفسُه.
   ثمّ الباقي بالأحدث تقديماً. ولولا تقديمُ المنتظِر لَغرق في وسط قائمةٍ تطول. */
function sortApprovals(list, today){
  var arr = (Array.isArray(list) ? list : []).slice();
  arr.sort(function(a, b){
    var wa = aprDaysWaiting(a, today), wb = aprDaysWaiting(b, today);
    if(wa !== null && wb === null) return -1;
    if(wa === null && wb !== null) return 1;
    if(wa !== null && wb !== null && wa !== wb) return wb - wa;
    return String(b.submittedAt || "").localeCompare(String(a.submittedAt || ""));
  });
  return arr;
}

/* شريحةُ عمر الانتظار — ثلاثُ مراتبَ تكفي: ما دون الشهر طبيعيّ، والشهران تذكير،
   وما فوقهما يستحقّ مطالبةً رسمية. */
function aprAgeBand(days){
  if(days === null || days === undefined) return "none";
  if(days >= 60) return "crit";
  if(days >= 30) return "warn";
  return "ok";
}

/* ══ شاشتان لا شاشة (طلبُ المالك: «نقل المستخلصات ومساراتها خارج المعتمدات») ══
   «المعتمدات» اسمُها حكمُها: **ما اعتُمد فعلاً** (معتمدٌ · مسدَّد). وما زال في مساره
   — أو رُفض — شاشتُه «المستخلصات»: سجلُّ متابعةٍ لا أرشيف. فالاعتمادُ من هناك هو ما
   **يُدخل** المستندَ هنا وفي ملفّ المشروع، لا نقلٌ بيد. */
function aprIsDone(a){ var st = String((a && a.status) || "submitted"); return st === "approved" || st === "paid"; }
function aprInFlow(a){ return !aprIsDone(a); }
function filterFlow(list){ return (Array.isArray(list) ? list : []).filter(aprInFlow); }
function filterDone(list){ return (Array.isArray(list) ? list : []).filter(aprIsDone); }

/* حصيلةُ شاشة المتابعة: كم واقفٌ ومنذ متى · كم عند آخر محطةٍ (جاهزٌ للاعتماد) ·
   كم تجاوز مدّةَ محطته · كم رُفض. أرقامُ قرارٍ لا أرقامُ أرشيف. */
function aprFlowRollup(list, today){
  var out = { waiting:0, sumWaiting:0, oldest:0, oldestId:"", atLast:0, overdue:0, rejected:0, sumRejected:0 };
  (Array.isArray(list) ? list : []).forEach(function(a){
    if(!a || a.archived) return;
    var st = String(a.status || "submitted");
    var amt = aprIsFinancial(a.docType) ? (Number(a.amountSubmitted) || 0) : 0;
    if(st === "rejected"){ out.rejected++; out.sumRejected += amt; return; }
    if(st !== "submitted") return;
    out.waiting++; out.sumWaiting += amt;
    var w = aprDaysWaiting(a, today);
    if(w !== null && w > out.oldest){ out.oldest = w; out.oldestId = a.id || ""; }
    if(aprHasPath(a)){
      var i = aprStageAt(a);
      if(i === a.stages.length - 1) out.atLast++;
      var b = aprStageBand(aprStageDays(a, today), a.stages[i].days);
      if(b === "warn" || b === "crit") out.overdue++;
    } else if(aprAgeBand(w) !== "ok" && w !== null) out.overdue++;
  });
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   الحالةُ والمزامنة — `onSnapshot` مصدرُ الحقيقة اللحظيّ
   ═══════════════════════════════════════════════════════════════════════════ */
var _docs = [], _ltrs = [];
var _docsUnsub = null, _ltrsUnsub = null;
var _docsLoaded = false, _ltrsLoaded = false, _err = "";

/* `proj:null` تعني **«لم يُضبَط بعد»** لا «كلّ المشاريع»: الوحدةُ تُحمَّل قبل اختيار
   المشروع، فلو ضُبط الافتراضُ هنا لَجُمِّد على قيمةِ لحظةِ التحميل. ويُشتقّ من
   المشروع المفتوح عند **أوّل رسمةٍ فقط** — واشتقاقُه في كلّ رسمةٍ يُلغي اختيارَ
   المستخدم مع كلّ تحديثٍ يصل من `onSnapshot`. */
var _view = { q:"", type:"", level:"", ym:"", proj:null };   // ترشيحُ شاشة الوثائق
var _lview = { q:"", kind:"issued", proj:null };             // ترشيحُ شاشة الخطابات
var _edit = null;        // مسوّدةُ الوثيقة قيدَ التحرير (null = لا نموذج مفتوح)
var _ledit = null;       // مسوّدةُ الخطاب
var _open = null;        // معرّفُ الوثيقة المفتوحة (بطاقةُ التفاصيل)
var _renew = null;       // مسوّدةُ التجديد

/* ══ الأساسُ الذي تُبنى عليه كلُّ شاشة ══
   **ما يحقّ للمستخدم أن يراه — لا ما اختار ترشيحَه.** والفرقُ بينهما ليس لفظياً:
   الشاراتُ والحصائلُ و**التنبيهات** تُحسَب على هذا الأساس وحدَه، فلا يكتم مُرشِّحُ
   عرضٍ تنبيهَ انتهاءِ شهادةٍ لأنّ صاحبَه كان ينظر في مشروعٍ آخرَ لحظتها. */
function _visDocs(){ return visibleList(_docs, allowedProjectIds()); }
function _visLtrs(){ return visibleList(_ltrs, allowedProjectIds()); }
function _visAprs(){ return visibleList(_aprs, allowedProjectIds()); }

function docs(){ return _docs.slice(); }
function letters(){ return _ltrs.slice(); }
function docById(id){ for(var i=0;i<_docs.length;i++) if(_docs[i].id === id) return _docs[i]; return null; }
function letterById(id){ for(var i=0;i<_ltrs.length;i++) if(_ltrs[i].id === id) return _ltrs[i]; return null; }

function startSync(){
  var d = _db();
  if(!d || !canView()) return;
  startSignSync();
  _aprSync();
  _partySync();
  _readReaders();
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
  stopSignSync();
  _aprStopSync();
  _partyStopSync();
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
  _visDocs().forEach(function(doc){
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
".dv-ap-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:14px}",
".dv-ap-c{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:12px 14px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:3px}",
".dv-ap-c .l{font-size:11px;font-weight:700;color:var(--muted)}",
".dv-ap-c .v{font-size:19px;font-weight:800;color:var(--text)}",
".dv-ap-c .s{font-size:10.5px;color:var(--muted);font-weight:600}",
/* الواقفُ وحدَه يتلوّن — وهو الرقمُ الذي يُتَّخذ عليه قرار */
".dv-ap-c.wait{border-top:3px solid var(--rank5)}",
".dv-ap-c.wait.b-warn{border-top-color:var(--warn)}",
".dv-ap-c.wait.b-warn .v{color:var(--warn)}",
".dv-ap-c.wait.b-crit{border-top-color:var(--danger)}",
".dv-ap-c.wait.b-crit .v{color:var(--danger)}",
".dv-ap-c.last{border-top:3px solid var(--primary)}",
".dv-ap-c.over{border-top:3px solid var(--border)}",
".dv-ap-c.over.b-warn{border-top-color:var(--warn)}",
".dv-ap-c.over.b-warn .v{color:var(--warn)}",
".dv-ap-c.done{border-top:3px solid var(--rank4)}",
/* ── مسارُ الاعتماد: شريطُ محطات ── */
".dv-path{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:12px 14px;margin-bottom:12px}",
".dv-path.fin{opacity:.92}",
".dv-path-h{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:12.5px;font-weight:800;margin-bottom:10px}",
".dv-path-cur{margin-inline-start:auto;font-weight:600;font-size:11.5px;color:var(--muted)}",
".dv-path-track{display:flex;gap:4px;list-style:none;margin:0;padding:2px 0;min-width:560px;align-items:flex-start}",
".dv-path-s{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;padding:6px 3px 7px;border-radius:9px;border:1px solid transparent;position:relative}",
".dv-path-s .n{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:800;background:var(--surface2);color:var(--muted);border:1px solid var(--border)}",
".dv-path-s .lbl{font-size:10.5px;font-weight:700;color:var(--muted);line-height:1.35}",
".dv-path-s .d{font-size:9.5px;color:var(--muted);opacity:.85}",
".dv-path-s.done .n{background:var(--primary);color:#fff;border-color:var(--primary)}",
".dv-path-s.done .lbl{color:var(--text)}",
".dv-path-s.cur{background:var(--surface2);border-color:var(--border)}",
".dv-path-s.cur .n{background:var(--rank5);color:#fff;border-color:var(--rank5)}",
".dv-path-s.cur .lbl{color:var(--text)}",
".dv-path-s.cur .d{font-weight:700}",
".dv-path-s.cur.b-warn{border-color:var(--warn)}",
".dv-path-s.cur.b-warn .n,.dv-path-s.cur.b-warn .d{background:var(--warn);color:#fff;border-color:var(--warn)}",
".dv-path-s.cur.b-warn .d{background:none;color:var(--warn)}",
".dv-path-s.cur.b-crit{border-color:var(--danger)}",
".dv-path-s.cur.b-crit .n{background:var(--danger);border-color:var(--danger)}",
".dv-path-s.cur.b-crit .d{color:var(--danger)}",
".dv-path-s.rej .n{background:var(--danger);color:#fff;border-color:var(--danger)}",
".dv-path-acts{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}",
".dv-act{background:var(--surface2);border:1px solid var(--primary);border-radius:12px;padding:12px 14px;margin-bottom:12px}",
".dv-act-h{font-size:13px;font-weight:800;margin-bottom:8px}",
".dv-log-tbl td,.dv-log-tbl th{font-size:11.5px}",
".dv-age{font-weight:800}",
".dv-age.t-crit{color:var(--danger)}",
".dv-log-back td{background:rgba(160,96,16,.06)}",
".dv-log-rej td{background:rgba(185,44,44,.06)}",
/* ── لوحةُ الجهات ── */
".dv-party-grid{display:flex;flex-direction:column;gap:10px;margin-top:10px}",
".dv-party{border:1px solid var(--border);border-radius:11px;padding:10px 12px;background:var(--surface)}",
".dv-party-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px;margin-bottom:6px}",
".dv-party-path{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;font-size:11px}",
".dv-party-st{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:9px;background:var(--surface2);border:1px solid var(--border);white-space:nowrap}",
".dv-party-arr{color:var(--muted);font-size:10px}",
".dv-stg{display:flex;align-items:center;gap:6px;margin-bottom:6px}",
".dv-stg .form-input{margin:0}",
".dv-stg-n{width:22px;text-align:center;flex:none}",
".dv-stg-d{width:74px;flex:none}",
".dv-stg-b{flex:none;width:28px;height:30px;border:1px solid var(--border);border-radius:7px;background:var(--surface2);color:var(--text);cursor:pointer;font-family:inherit;font-size:13px}",
".dv-stg-b:disabled{opacity:.35;cursor:default}",
".dv-stg-b.del{color:var(--danger)}",
".btn.on{box-shadow:inset 0 0 0 1px var(--primary)}",
".dv-ap-tbl{min-width:1040px}",
".t-warn{color:var(--warn);font-weight:700}",
".dv-sg-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:11px 13px;border:1px solid var(--border);border-radius:11px;margin-bottom:8px;background:var(--surface2)}",
".dv-sg-t{font-size:13px;color:var(--text)}",
".dv-sg-im{display:flex;align-items:center;gap:12px;margin-right:auto}",
".dv-sg-im img{height:34px;max-width:110px;object-fit:contain;background:#fff;border:1px solid var(--border);border-radius:7px;padding:2px}",
".dv-sg-a{display:flex;gap:7px}",
".dv-sg-prev{display:inline-flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--border);border-radius:9px;padding:6px 10px}",
".dv-sg-prev img{height:44px;max-width:150px;object-fit:contain}",
".dv-sg-prev .rm{background:none;border:0;color:var(--muted);cursor:pointer;font-family:inherit;font-size:11px;font-weight:700}",
".dv-sg-prev .rm:hover{color:var(--danger)}",

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
    ".dv-note-link{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px;padding:9px 12px;"
      + "border:1px solid var(--warning,#d98324);border-radius:10px;background:rgba(217,131,36,.10);font-size:.86rem}",
    ".dv-sgr-wrap{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px;margin:10px 0}",
    ".dv-sgr{display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid var(--border);"
      + "border-radius:8px;cursor:pointer;font-size:.88rem}",
    ".dv-sgr input{margin:0;flex:none}",
    ".dv-sgr .t-dim{margin-inline-start:auto;font-size:.78rem}",
    ".dv-cnt{display:inline-flex;align-items:center;justify-content:center;min-width:20px;padding:1px 6px;"
      + "border-radius:9px;background:var(--surface-2,rgba(127,127,127,.14));color:var(--text-dim,inherit);"
      + "font-size:11px;font-weight:700;font-family:'JetBrains Mono',monospace;opacity:.85}",

/* ── شارةُ القائمة الجانبية وزرِّ البوّابة ── */
".dv-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;margin-right:auto;border-radius:9px;background:var(--danger);color:#fff;font-size:10px;font-weight:800;font-family:'JetBrains Mono',monospace}",
".dv-err{background:var(--surface2);border:1px solid var(--danger);color:var(--danger);border-radius:10px;padding:11px 14px;font-size:12px;font-weight:700;margin-bottom:12px}",
".dv-ai{background:var(--surface2);border:1px solid var(--ai);border-radius:12px;padding:14px 15px;margin-top:4px}",
".dv-ai-h{font-size:13px;font-weight:800;color:var(--ai-ink);display:flex;align-items:center;gap:7px;margin-bottom:4px}",
".dv-ai-s{font-size:11.5px;color:var(--muted);line-height:1.8;margin-bottom:10px}",

"@media (max-width:760px){.dv-grid{grid-template-columns:1fr}.dv-horizon{padding:10px}.dv-hz-track{min-width:460px}.dv-head{gap:10px}.dv-bar .dv-search{min-width:100%}.dv-path-track{min-width:640px}}",
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
  var dirty = _view.q || _view.type || _view.level || _view.ym || _view.proj;
  return '<div class="dv-bar">'
    + '<input class="form-input dv-search" type="search" placeholder="ابحث بالعنوان أو الرقم أو الجهة أو المشروع…"'
    + ' value="' + _esc(_view.q) + '" oninput="docVault.setFilter(\'q\',this.value)">'
    + _projFilterHTML(_view.proj, "setFilterProj", _visDocs())
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

function _tableHTML(list, today, curProj, emptyNote){
  if(!list.length){
    if(emptyNote) return '<div class="dv-wrap"><div class="dv-empty">' + emptyNote + '</div></div>';
    var any = _visDocs().filter(function(d){ return !d.archived; }).length;
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
        + (d.renewCount ? ' <span class="t-dim dv-num">(جُدِّدت ' + d.renewCount + ')</span>' : "")
        + _projSubHTML(d, curProj) + '</td>'
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
    /* النطاقُ قبل المشروع: شهادةُ الزكاة تخصّ الشركةَ كلَّها، ونسبتُها لمشروعٍ
       تُخفيها عن باقي المشاريع وتُوهم بأنّها تخصّه وحدَه. */
    + '<div class="dv-f wide"><label class="dv-l">النطاق</label>' + _projFieldHTML(e, "setDocProj", _docs)
      + (e.projSel === FILTER_COMPANY
          ? '<div class="dv-hint">وثيقةُ شركةٍ: تظهر في ملفّ كلّ مشروع، ولا تُحجب عن أحدٍ في الخزانة.</div>' : "")
      + '</div>'
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
      + row("النطاق", _projChipHTML(d))
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
    /* المنعُ من الخادم ليس عطلاً يُعاد المحاولةُ فيه — هو جواب. وعرضُ نصِّ Firestore
       الخام («Missing or insufficient permissions») يدفع المستخدمَ إلى تكرار
       المحاولة بلا طائل، ويُخفي عن الأدمن أنّ السببَ قائمةٌ ينقصها اسم. */
    var denied = /permission|insufficient|PERMISSION_DENIED/i.test(_err);
    host.innerHTML = head + '<div class="dv-err">'
      + (denied
          ? '🔒 حسابُك غيرُ مُدرَجٍ في قرّاء الخزانة على الخادم. يضيفك مديرُ النظام '
            + 'بمنحك صلاحية «خزانة الوثائق» ثمّ حفظ المستخدم.'
          : 'تعذّر تحميل الخزانة: ' + _esc(_err)
            + ' <button type="button" class="dv-clear" onclick="docVault.retry()">أعد المحاولة</button>')
      + '</div>';
    return;
  }
  if(!_docsLoaded){ host.innerHTML = head + '<div class="dv-empty">جارٍ تحميل الخزانة…</div>'; return; }

  var body = "";
  if(_edit){ body = _formHTML(); }
  else if(_open){
    var d = docById(_open);
    body = d ? _cardHTML(d, today) : '<div class="dv-empty">لم تعد هذه الوثيقة موجودة.</div>';
  } else {
    _view.proj = _seedProjDocs(_view.proj);
    /* الأفقُ يتبع المُرشِّحَ — سؤالُه «متى يتزاحم ما أنظر إليه؟» لا «كم في الخزانة».
       والتنبيهاتُ **لا تتبعه**: تلك تُحسَب في `scanAndAlert` على المرئيّ كلِّه. */
    var vis  = _visDocs();
    var list = sortDocs(filterDocs(vis, _view, today), today);
    body = _readerLockNoticeHTML() + _unlinkedNoticeHTML(vis, "setFilterProj", _view.proj) + _horizonHTML(filterDocs(vis, { proj:_view.proj }, today), today)
         + _filterBarHTML() + _tableHTML(list, today, _view.proj);
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
        '<div class="dv-f"><label class="dv-l" for="dv-l-prefix-sel">لقب المخاطَبة</label>'
        + _pickHTML("prefix", "اللقب", "— بلا لقب —", _orDef(e.prefix, DEF_PREFIX), PREFIX_OPTS, e._pfOther)
        + '</div>'
        + '<div class="dv-f"><label class="dv-l" for="dv-l-honor-sel">لقب التشريف</label>'
        + _pickHTML("honor", "اللقب", "— بلا لقب —", _orDef(e.honorific, DEF_HONORIFIC), HONORIFIC_OPTS, e._hnOther)
        + '</div>'
        + '<div class="dv-f wide"><label class="dv-l" for="dv-l-party">الجهة الموجَّه إليها</label>'
        + '<input class="form-input" id="dv-l-party" value="' + _esc(e.party || "") + '" placeholder="أمانة منطقة حائل">'
        + '<div class="dv-hint">تُطبَع هكذا: <b>' + _esc(_orDef(e.prefix, DEF_PREFIX))
          + (_orDef(e.prefix, DEF_PREFIX) ? " / " : "") + (_esc(e.party) || "[الجهة]") + '</b> '
          + '<span class="t-dim">' + _esc(_orDef(e.honorific, DEF_HONORIFIC)) + '</span> — '
          + 'واللقبان اختياريان: اختر «بلا لقب» ليُحذف، أو «أخرى…» لتكتبه بنفسك.</div></div>'
      + '<div class="dv-f"><label class="dv-l" for="dv-l-date">تاريخ الخطاب</label>'
        + '<input class="form-input dv-num" type="date" id="dv-l-date" value="' + _esc(e.letterDate || "") + '"></div>'
      + '<div class="dv-f"><label class="dv-l" for="dv-l-ref">الرقم المرجعي الخارجي</label>'
        + '<input class="form-input dv-num" id="dv-l-ref" value="' + _esc(e.ref || "") + '" placeholder="إن كان للخطاب رقمٌ لدى الجهة"></div>'
      /* المشروعُ خاصيّةُ **الصادر** وحدَه: النموذجُ قالبٌ يُستنسَخ، وربطُه بمشروعٍ
         يُخفيه عن باقي المشاريع — فيُعاد كتابتُه في كلّ مشروعٍ وهو عينُ ما جاء
         النموذجُ ليمنعه. فالنماذجُ كلُّها على مستوى الشركة بلا خيار. */
      + '<div class="dv-f"><label class="dv-l">المشروع</label>' + _projFieldHTML(e, "setLetterFormProj", _ltrs) + '</div>'
      /* التوقيعُ خاصيّةُ الصادر وحدَه — نموذجٌ يخرج موقَّعاً ومختوماً خطابٌ جاهزٌ
         للإرسال بعناصرَ نائبةٍ بين قوسين. فلا خيارَ له في نموذج النموذج أصلاً. */
      + '<div class="dv-f wide"><label class="dv-l" for="dv-l-sign">التوقيع</label>'
        + _signSelectHTML(e) + _signHintHTML(e) + '</div>')
    + '<div class="dv-f' + (isTpl ? " wide" : "") + '"><label class="dv-l" for="dv-l-subject">الموضوع</label>'
      + '<input class="form-input" id="dv-l-subject" value="' + _esc(e.subject || "") + '"></div>'
    + '<div class="dv-f wide"><label class="dv-l" for="dv-l-body">متن الخطاب</label>'
      + '<textarea class="form-input" id="dv-l-body" rows="9" placeholder="نصُّ الخطاب — يُنسَخ منه عند الاستعمال">' + _esc(e.body || "") + '</textarea>'
      + (isTpl ? "" : '<div style="margin-top:7px"><button type="button" class="btn btn-ai btn-sm" onclick="docVault.openAI()">'
          + _icon("sparkles", "ic-sm") + ' صياغة بالذكاء الاصطناعي</button></div>')
      + '</div>'
    + (isTpl || !_ai ? "" : _aiPanelHTML())
    + (isTpl ? "" :
        '<div class="dv-f wide"><label class="dv-l" for="dv-l-closing">عبارة الختام</label>'
        + '<input class="form-input" id="dv-l-closing" value="' + _esc(_orDef(e.closing, DEF_CLOSING)) + '"'
        + ' placeholder="اتركها فارغةً فلا تُطبَع">'
        + '<div class="dv-hint">اختيارية — أفرغ الخانة فلا تظهر في المطبوعة.</div></div>')
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

/* ═══════════════════════════════════════════════════════════════════════════
   مساعدُ الصياغة — يُنادي محرّكَ المنصّة ولا يبني ثانياً
   (طلبُ المالك: «اضف مساعد ذكاء اصطناعي لصياغة الخطاب»)

   ── نداءٌ واحدٌ للمنصّة كلِّها ──
   `_aiText` في النواة تحمل: رابطَ الـProxy وتحميلَه الكسول، واختيارَ النموذج،
   وترجمةَ أخطاء Anthropic إلى عربيةٍ مفهومة (`_msgErr`)، وقيدَ الاستهلاك. ونسخُ
   شيءٍ من ذلك هنا يُنتج مساعداً يفترق عن بقيّة مساعدات المنصّة عند أوّل تغييرٍ في
   المفتاح أو النموذج — **ولا نختار نموذجاً هنا أصلاً**: اختيارُه قرارُ النواة
   الواحد، ولو كتبناه لانحرفنا عنها بصمت.

   ── و`maxTokens` تُرفَع عن الافتراض ──
   افتراضُ `_aiText` ستّمئة رمزٍ يكفي تصنيفَ بلاغٍ أو جملةَ تلخيص، والخطابُ الرسميُّ
   ثلاثُ فقراتٍ فأكثر. والاقتطاعُ هنا **لا يُنذر**: يصل الخطابُ مبتوراً في منتصف
   جملةٍ فيُظنّ صياغةً رديئة.

   ── والمخرَجُ يُملأ في الخانة ولا يُحفَظ ──
   لا كتابةَ في Firestore من هنا. المستخدمُ يقرأ ويعدّل ثمّ يحفظ بنفسه — ونصٌّ
   يولّده نموذجٌ ويُحفَظ بلا مراجعةٍ على ورقةٍ تخرج باسم الشركة ليس خياراً.

   ── والمتنُ القائمُ لا يُدهَس بصمت ──
   الاستبدالُ يسأل أوّلاً. وأسوأُ ما في مساعدٍ أن يمحو عملَ نصفِ ساعةٍ بنقرةٍ واحدة.
   ═══════════════════════════════════════════════════════════════════════════ */
var _ai = null;      // { points, busy, err } — مفتوحةٌ حين لا تساوي null

function aiReady(){ return typeof _aiText === "function"; }

function openAI(){
  if(!_ledit || _ledit.kind === "template") return;
  if(!aiReady()){ _toast("⚠ الذكاء الاصطناعي غير مُفعّل — راجع: الإدارة › إعدادات الذكاء الاصطناعي","warn"); return; }
  _readLetterForm();
  _ai = { points:"", busy:false, err:"" };
  renderLetters();
  try{ var el = document.getElementById("dv-ai-points"); if(el) el.focus(); }catch(e){}
}
function closeAI(){ _ai = null; renderLetters(); }

function _aiPanelHTML(){
  var a = _ai;
  return '<div class="dv-f wide"><div class="dv-ai">'
    + '<div class="dv-ai-h">' + _icon("sparkles", "ic-sm") + ' صياغة الخطاب بالذكاء الاصطناعي</div>'
    + '<div class="dv-ai-s">اكتب النقاطَ الأساسيةَ بالعامّية أو مختصرةً — تُصاغ خطاباً رسمياً كاملاً. '
      + 'الجهةُ والموضوعُ يُقرآن من الحقول أعلاه. <b>راجع الناتجَ قبل الحفظ</b>؛ لا يُحفَظ شيءٌ تلقائياً.</div>'
    + '<textarea class="form-input" id="dv-ai-points" rows="4" ' + (a.busy ? "disabled " : "")
      + 'placeholder="مثال: نبي نمدد العقد 45 يوم بسبب تأخر توريد المصاعد، والعقد رقم ع/2026/118">'
      + _esc(a.points || "") + '</textarea>'
    + (a.err ? '<div class="dv-err" style="margin:9px 0 0">' + _esc(a.err) + '</div>' : "")
    + '<div class="dv-acts" style="margin-top:11px">'
      + '<button type="button" class="btn btn-ghost btn-sm" onclick="docVault.closeAI()">إغلاق</button>'
      + '<button type="button" class="btn btn-ai btn-sm"' + (a.busy ? " disabled" : "")
        + ' onclick="docVault.runAI()">' + (a.busy ? "⏳ جارٍ الصياغة…" : (_icon("sparkles", "ic-sm") + " صُغ الخطاب")) + '</button>'
    + '</div></div></div>';
}

/* ════════ بناءُ الطلب — دالّةٌ نقيّةٌ يفحصها `hail-tests` بلا شبكة ════════
   تُبنى من حقول النموذج لا من الوثيقة المحفوظة: المستخدمُ يكتب الموضوعَ ثمّ يطلب
   الصياغةَ قبل أن يحفظ. */
function aiPrompt(o){
  o = o || {};
  var L = [];
  L.push("اكتب خطاباً رسمياً بالعربية الفصحى وبالصيغة الإدارية السعودية المعتمدة، صادراً من «شركة المباني السريعة للمقاولات».");
  L.push("");
  L.push("الجهة الموجَّه إليها: " + (String(o.party || "").trim() || "[الجهة]"));
  L.push("موضوع الخطاب: "        + (String(o.subject || "").trim() || "[الموضوع]"));
  L.push("");
  L.push("النقاط الأساسية التي يجب أن يغطّيها الخطاب:");
  L.push(String(o.points || "").trim() || "—");
  L.push("");
  L.push("قواعد إلزامية:");
  /* المخاطَبةُ والتحيةُ والختامُ والتوقيعُ **تطبعها المنصّةُ** من حقولها. ولو كتبها
     النموذجُ في المتن لخرجت الورقةُ بتحيتين وخاتمتين — وهو أوّلُ ما يقع لو تُرك
     الطلبُ عامّاً. */
  L.push("- اكتب **متن الخطاب فقط**: لا تكتب التاريخ ولا الرقم المرجعي ولا سطر المخاطَبة (سعادة/المحترم) ولا التحية الافتتاحية ولا عبارة الختام ولا خانة التوقيع — كلُّها يضيفها النظام تلقائياً.");
  L.push("- ابدأ مباشرةً بمتن الموضوع (مثل: «إشارةً إلى…» أو «نفيدكم بأنّ…»).");
  L.push("- التزم بالحقائق والأرقام الواردة في النقاط أعلاه فقط. **لا تختلق** رقمَ عقدٍ ولا تاريخاً ولا مبلغاً ولا اسماً لم يُذكر.");
  L.push("- ما نقص من معلومة اجعله عنصراً نائباً بين قوسين مربّعين، مثل [رقم العقد].");
  L.push("- فقرتان إلى أربع فقرات، بأسطر فارغة بينها، بلا عناوين ولا تعداد نقطيّ إلا إن اقتضت النقاطُ تعداداً.");
  L.push("- أعِد النصَّ وحدَه بلا أيّ شرحٍ أو مقدّمةٍ منك، وبلا علامات Markdown.");
  return L.join("\n");
}

function runAI(){
  if(!_ai || _ai.busy || !_ledit) return;
  var el = document.getElementById("dv-ai-points");
  _ai.points = el ? String(el.value || "").trim() : "";
  if(!_ai.points){ _ai.err = "اكتب النقاطَ الأساسيةَ أولاً."; renderLetters(); return; }
  _readLetterForm();
  var prompt = aiPrompt({ party:_ledit.party, subject:_ledit.subject, points:_ai.points });
  _ai.busy = true; _ai.err = ""; renderLetters();

  var finish = function(){ _ai.busy = false; renderLetters(); };
  var apply = function(text){
    var body = String(text || "").trim();
    if(!body){ _ai.err = "عاد الردُّ فارغاً — أعِد المحاولة أو فصّل النقاط أكثر."; finish(); return; }
    var cur = String(_ledit.body || "").trim();
    var put = function(){
      _ledit.body = body;
      _ai = null;
      renderLetters();
      _toast("✨ صيغ الخطاب — راجعه وعدّله ثمّ احفظ", "success");
      try{ var b = document.getElementById("dv-l-body"); if(b){ b.focus(); b.setSelectionRange(0, 0); } }catch(e){}
    };
    if(!cur) return put();
    /* متنٌ مكتوبٌ لا يُدهَس بصمت */
    _confirm({ title:"استبدال المتن", icon:"✨", okText:"استبدل", okClass:"btn-primary",
      msg:"المتنُ الحاليُّ مكتوبٌ بالفعل. أستبدله بما صاغه الذكاء الاصطناعي؟" })
      .then(function(ok){ if(ok) put(); else finish(); })
      .catch(function(){ finish(); });
  };

  try{
    _aiText([{ role:"user", content:prompt }], {
      /* ستّمئةٌ (افتراضُ النواة) تقطع خطاباً في منتصف جملةٍ بلا إنذار */
      maxTokens: 4000,
      feature: "صياغة خطاب — خزانة الوثائق"
    }).then(apply).catch(function(e){
      var m = "";
      try{ m = (typeof _msgErr === "function") ? _msgErr(e) : ((e && e.message) || ""); }catch(_){}
      _ai.err = m || "تعذّرت الصياغة — أعِد المحاولة.";
      finish();
    });
  }catch(e){
    _ai.err = "تعذّر بدء الطلب — راجع إعدادات الذكاء الاصطناعي.";
    finish();
  }
}

/* ════════ منتقي اللقب: قائمةٌ صريحةٌ + «أخرى…» ════════
   كان `datalist` — وهو الخطأ. على iPadOS **لا يعرض قائمتَه إطلاقاً**: لا سهمَ ولا
   لمسةَ فتحٍ، والاقتراحاتُ لا تظهر إلا أثناء الكتابة وبعد أن يطابق حرفٌ. فالحقلُ
   يبدو خانةَ كتابةٍ عاديّةً والخياراتُ موجودةٌ ولا سبيلَ إلى رؤيتها — **ميزةٌ
   حاضرةٌ غائبة**. بلاغُ المالك: «غير قادر على اختيار اللقب أو التشريف».

   والبديلُ `<select>` يفتح ورقةَ النظام على الـiPad — تُقرأ بالإصبع وتُمرَّر —
   **و«أخرى…» تكشف خانةَ كتابةٍ** فلا تُغلق القائمةُ البابَ على لقبٍ لم نُحصِه
   (وهو سببُ اختيار `datalist` أصلاً؛ نُبقي الفائدةَ ونُسقط العطب). وهو نمطُ
   «وثيقة أخرى» نفسُه في السجلّات — والمالكُ يعرفه ويستعمله.

   و«بلا لقب» خيارٌ **صريحٌ في القائمة** لا إفراغَ خانةٍ يُخمَّن. */
var PICK_NONE = "__none__", PICK_OTHER = "__other__";

/* أيُّ خيارٍ يقع عليه الاختيار؟ دالّةٌ نقيّةٌ تُفحص بلا متصفّح:
   فارغٌ ⇒ «بلا» · موجودٌ في القائمة ⇒ هو · غيرُ ذلك ⇒ «أخرى». والعلَمُ يغلبها
   جميعاً ليبقى الحقلُ مفتوحاً بعد اختيار «أخرى» وقبل أن يُكتب فيه حرف. */
function pickState(cur, opts, otherFlag){
  if(otherFlag) return PICK_OTHER;
  var c = String(cur == null ? "" : cur);
  if(!c) return PICK_NONE;
  return (opts || []).indexOf(c) >= 0 ? c : PICK_OTHER;
}

function _pickHTML(key, lbl, noneLbl, cur, opts, otherFlag){
  var st = pickState(cur, opts, otherFlag), isOther = (st === PICK_OTHER);
  var o = '<option value="' + PICK_NONE + '"' + (st === PICK_NONE ? " selected" : "") + '>'
        + _esc(noneLbl) + '</option>';
  (opts || []).forEach(function(x){
    o += '<option value="' + _esc(x) + '"' + (st === x ? " selected" : "") + '>' + _esc(x) + '</option>';
  });
  o += '<option value="' + PICK_OTHER + '"' + (isOther ? " selected" : "") + '>أخرى… (اكتبه بنفسك)</option>';
  return '<select class="form-input" id="dv-l-' + key + '-sel"'
       + ' onchange="docVault.setPick(\'' + key + '\',this.value)">' + o + '</select>'
       + (isOther
           ? '<input class="form-input" id="dv-l-' + key + '" style="margin-top:7px" autocomplete="off"'
             + ' value="' + _esc(cur || "") + '" placeholder="اكتب ' + _esc(lbl) + '">'
           : '');
}

/* القراءة: القائمةُ هي المصدر، والخانةُ لا تُقرأ إلا مع «أخرى». وغيابُ القائمة
   (نموذجُ النموذج) يردّ `undefined` فلا يُكتب على القيمة المحفوظة. */
function _readPick(key){
  var sel = document.getElementById("dv-l-" + key + "-sel");
  if(!sel) return undefined;
  var v = String(sel.value || "");
  if(v === PICK_NONE) return "";
  if(v === PICK_OTHER){
    var t = document.getElementById("dv-l-" + key);
    return t ? String(t.value || "").trim() : "";
  }
  return v;
}

function setPick(key, v){
  if(!_ledit) return;
  _readLetterForm();
  var flag = (key === "prefix") ? "_pfOther" : "_hnOther";
  if(v === PICK_OTHER){ _ledit[flag] = true; }
  else {
    _ledit[flag] = false;
    _ledit[key === "prefix" ? "prefix" : "honorific"] = (v === PICK_NONE) ? "" : String(v);
  }
  renderLetters();
  if(_ledit[flag]){ try{ var el = document.getElementById("dv-l-" + key); if(el) el.focus(); }catch(e){} }
}

/* ════════ منتقي الموقّع في نموذج الخطاب ════════
   والموقّعُ الذي حُذف من السجلّ يبقى خياراً كما يبقى مسؤولُ التجديد — فلا يُسقطه
   الحفظُ صامتاً لأنّ أحداً فتح النموذج. */
function _signSelectHTML(e){
  var cur = String(e.signId || ""), seen = false;
  var opts = '<option value="">— بلا توقيع (يُوقَّع باليد) —</option>';
  _signs.forEach(function(s){
    if(!s || !s.id) return;
    if(s.id === cur) seen = true;
    var marks = [];
    if(s.signUrl)  marks.push("توقيع");
    if(s.stampUrl) marks.push("ختم");
    opts += '<option value="' + _esc(s.id) + '"' + (s.id === cur ? " selected" : "") + '>'
          + _esc(s.title + " — " + s.name)
          + (marks.length ? " (" + marks.join(" و") + ")" : " (بلا صورة)") + '</option>';
  });
  if(cur && !seen){
    opts += '<option value="' + _esc(cur) + '" selected>'
          + _esc((e.signTitle ? e.signTitle + " — " : "") + (e.signName || cur)) + ' (حُذف من السجلّ)</option>';
  }
  return '<select class="form-input" id="dv-l-sign">' + opts + '</select>';
}
function _signHintHTML(e){
  var cur = String(e.signId || "");
  if(!cur) return '<div class="dv-hint">بلا توقيع: تُطبَع أسطرٌ فارغةٌ يُوقَّع عليها باليد.</div>';
  var s = signatoryById(cur);
  if(!s) return '<div class="dv-hint">هذا الموقّع حُذف من السجلّ — اسمُه وصفتُه محفوظان على الخطاب، ولا تُطبَع صورتاه.</div>';
  if(s.signUrl || s.stampUrl) return '<div class="dv-hint">يُطبَع الاسمُ والصفةُ أسفل يسار الورقة، ومعهما ما رُفع من التوقيع والختم.</div>';
  return '<div class="dv-hint">لا صورةَ توقيعٍ ولا ختمٍ لهذا الموقّع — يُطبَع الاسمُ والصفةُ فوق سطرِ توقيعٍ يدويّ. '
       + (canManageSigns() ? 'تُرفَع الصورتان من «سجلّ التواقيع».' : 'يرفعهما مدير النظام.') + '</div>';
}

/* ════════ لوحةُ إدارة سجلّ التواقيع (للأدمن) ════════ */
function _signPanelHTML(){
  if(_sEdit) return _signFormHTML();
  var rows = _signs.length
    ? _signs.map(function(s){
        return '<div class="dv-sg-row">'
          + '<div class="dv-sg-t"><b>' + _esc(s.title || "—") + '</b> — ' + _esc(s.name || "—") + '</div>'
          + '<div class="dv-sg-im">'
            + (s.signUrl  ? '<img src="' + _esc(s.signUrl)  + '" alt="توقيع">' : '<span class="dv-none">بلا توقيع</span>')
            + (s.stampUrl ? '<img src="' + _esc(s.stampUrl) + '" alt="ختم">'   : '<span class="dv-none">بلا ختم</span>')
          + '</div>'
          + '<div class="dv-sg-a">'
            + '<button type="button" class="btn btn-ghost btn-sm" onclick="docVault.editSignatory(\'' + _jq(s.id) + '\')">' + _icon("edit", "ic-sm") + ' تعديل</button>'
            + '<button type="button" class="btn btn-delete btn-sm" onclick="docVault.delSignatory(\'' + _jq(s.id) + '\')">' + _icon("trash", "ic-sm") + '</button>'
          + '</div></div>';
      }).join("")
    : '<div class="dv-empty" style="padding:26px">لا تواقيع بعد.<br>أضِف الموقّعَ باسمه وصفته، وارفع صورةَ توقيعه وختمَ الشركة — فتُختار في كلّ خطاب.</div>';
  return '<div class="dv-panel">'
    + '<div class="dv-head" style="margin-bottom:10px"><div>'
      + '<div class="dv-panel-h">سجلّ التواقيع</div>'
      + '<div class="dv-panel-s" style="margin-bottom:0">يُملأ مرّةً ويُختار منه في كلّ خطاب. '
      + '<b>الإدارةُ لمدير النظام وحدَه</b> — صورةُ التوقيع والختم أداتا إلزامٍ لا بياناتُ عرض.</div>'
    + '</div><div style="display:flex;gap:8px;flex-wrap:wrap">'
      + '<button type="button" class="btn btn-ghost btn-sm" onclick="docVault.toggleSignPanel()">' + _icon("rotateCcw", "ic-sm") + ' إغلاق</button>'
      + '<button type="button" class="btn btn-primary btn-sm" onclick="docVault.newSignatory()">' + _icon("plus", "ic-sm") + ' موقّع جديد</button>'
    + '</div></div>'
    + rows + '</div>';
}

function _signImgBox(lbl, url, which, hint){
  return '<div class="dv-f"><label class="dv-l">' + lbl + '</label>'
    + (url ? '<div class="dv-sg-prev"><img src="' + _esc(url) + '" alt="">'
             + '<button type="button" class="rm" onclick="docVault.delSignImage(\'' + which + '\')">حذف</button></div>'
           : '<div class="dv-none" style="padding:8px 0">لا صورة</div>')
    + '<div style="margin-top:7px"><button type="button" class="btn btn-ghost btn-sm" onclick="docVault.addSignImage(\'' + which + '\')">'
      + _icon("paperclip", "ic-sm") + ' ' + (url ? "استبدال" : "رفع") + '</button></div>'
    + '<div class="dv-hint">' + hint + '</div></div>';
}
function _signFormHTML(){
  var e = _sEdit;
  return '<div class="dv-panel">'
    + '<div class="dv-panel-h">' + (e.id ? "تعديل موقّع" : "موقّع جديد") + '</div>'
    + '<div class="dv-panel-s">الاسمُ والصفةُ يُطبَعان أسفل يسار الورقة بخطٍّ عريض، والصورتان فوقهما.</div>'
    + '<div class="dv-grid">'
    + '<div class="dv-f"><label class="dv-l" for="dv-s-title">الصفة <b>*</b></label>'
      + '<input class="form-input" id="dv-s-title" value="' + _esc(e.title || "") + '" placeholder="المدير العام"></div>'
    + '<div class="dv-f"><label class="dv-l" for="dv-s-name">الاسم <b>*</b></label>'
      + '<input class="form-input" id="dv-s-name" value="' + _esc(e.name || "") + '" placeholder="عادل فهيد العارضي"></div>'
    + _signImgBox("صورة التوقيع", e.signUrl, "sign", "يُفضَّل PNG بخلفيةٍ شفافة — الخلفيةُ البيضاء تُغطّي ما تحتها على الورق.")
    + _signImgBox("ختم الشركة", e.stampUrl, "stamp", "PNG بخلفيةٍ شفافة كذلك، فالختمُ يُطبَع فوق التوقيع والنصّ.")
    + '</div>'
    + '<div class="dv-acts">'
      + '<button type="button" class="btn btn-ghost" onclick="docVault.cancelSignatory()">إلغاء</button>'
      + '<button type="button" class="btn btn-primary" onclick="docVault.saveSignatory()">' + _icon("save", "ic-sm") + ' حفظ الموقّع</button>'
    + '</div></div>';
}

function _letterTableHTML(list, curProj, emptyNote){
  var isTpl = _lview.kind === "template";
  if(!list.length){
    if(emptyNote) return '<div class="dv-wrap"><div class="dv-empty">' + emptyNote + '</div></div>';
    return '<div class="dv-wrap"><div class="dv-empty">'
      + (isTpl ? 'لا نماذج بعد.<br>احفظ هنا قوالبَ الخطابات التي تتكرّر — طلبُ تمديد · ترشيحُ مقاول · تفويض — لتُستنسَخ بدل أن تُكتب من جديد.'
               : 'لا خطابات صادرة بعد.<br>كلُّ خطابٍ يُحفَظ برقمٍ مرجعيٍّ من النظام وبنسخته الموقَّعة، فيُرجَع إليه برقمه.')
      + '</div></div>';
  }
  var rows = list.map(function(l){
    return '<tr class="dv-row-act" onclick="docVault.openLetter(\'' + _jq(l.id) + '\')">'
      + '<td class="dv-num t-name">' + _esc(l.id) + '</td>'
      + '<td class="t-name">' + _esc(l.title || "—") + _projSubHTML(l, curProj) + '</td>'
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
      + '<button type="button" class="btn btn-primary btn-sm" onclick="docVault.printLetter(\'' + _jq(l.id) + '\')">' + _icon("printer", "ic-sm") + ' طباعة على ورق الشركة</button>'
      + (isTpl && canEdit() ? '<button type="button" class="btn btn-primary btn-sm" onclick="docVault.useTemplate(\'' + _jq(l.id) + '\')">' + _icon("filePlus", "ic-sm") + ' استنسخ خطاباً منه</button>' : "")
      + (!isTpl && canEdit() ? '<button type="button" class="btn btn-ghost btn-sm" onclick="docVault.copyLetter(\'' + _jq(l.id) + '\')" title="خطاب جديد بالبيانات نفسِها — برقمٍ وتاريخٍ جديدين">' + _icon("filePlus", "ic-sm") + ' نسخ كخطاب جديد</button>' : "")
      + (canEdit() ? '<button type="button" class="btn btn-ghost btn-sm" onclick="docVault.editLetter(\'' + _jq(l.id) + '\')">' + _icon("edit", "ic-sm") + ' تعديل</button>' : "")
      + (canDelete() ? '<button type="button" class="btn btn-delete btn-sm" onclick="docVault.delLetter(\'' + _jq(l.id) + '\')">' + _icon("trash", "ic-sm") + '</button>' : "")
    + '</div></div>'
    + '<div class="dv-grid">'
      + (isTpl ? "" : row("الجهة الموجَّه إليها", _esc(l.party || "—"))
                    + row("تاريخ الخطاب", '<span class="dv-num">' + _esc(l.letterDate || "—") + '</span>')
                    + (l.ref ? row("الرقم لدى الجهة", '<span class="dv-num">' + _esc(l.ref) + '</span>') : ""))
      + row("الموضوع", _esc(l.subject || "—"))
      + (isTpl ? "" : row("المشروع", _projChipHTML(l)))
      + (!isTpl && isVerifyToken(l.verifyToken) ? row("رابط التحقّق", (function(){
            var u = verifyUrl(verifyBase(), l.verifyToken, _dev());
            return '<a href="' + _esc(u) + '" target="_blank" rel="noopener" class="dv-num" style="font-size:12px;word-break:break-all">' + _esc(u) + '</a>'
              + ' <span class="dv-none">— يحمله رمزُ QR على المطبوعة</span>';
          })()) : "")
      + (!isTpl && l.copiedFrom ? row("نُسخ من", letterById(l.copiedFrom)
            ? '<a href="#" class="dv-num" onclick="docVault.openLetter(\'' + _jq(l.copiedFrom) + '\');return false">' + _esc(l.copiedFrom) + '</a>'
            : '<span class="dv-num t-dim">' + _esc(l.copiedFrom) + '</span> <span class="dv-none">(حُذف الأصل)</span>') : "")
      + (isTpl ? "" : row("التوقيع", (function(){
          if(!l.signName && !l.signTitle) return '<span class="dv-none">بلا توقيع — يُوقَّع باليد</span>';
          var sg = l.signId ? signatoryById(l.signId) : null;
          var lbl = _esc((l.signTitle ? l.signTitle + ": " : "") + (l.signName || ""));
          if(!sg) return lbl + ' <span class="dv-chip l-none">حُذف من السجلّ — بلا صورة</span>';
          var m = [];
          if(sg.signUrl)  m.push("توقيع");
          if(sg.stampUrl) m.push("ختم");
          return lbl + (m.length ? ' <span class="dv-chip l-ok">' + m.join(" و") + '</span>'
                                 : ' <span class="dv-chip l-none">بلا صورة</span>');
        })()))
      + (l.body ? '<div class="dv-f wide"><span class="dv-l">المتن</span>'
          + '<div style="white-space:pre-wrap;line-height:2;font-size:12.5px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:13px 15px">'
          + _esc(l.body) + '</div></div>' : "")
      + '<div class="dv-f wide"><span class="dv-l">المرفقات</span>' + _filesHTML(l.files, null) + '</div>'
    + '</div></div>';
}

/* ═══════════════════════════════════════════════════════════════════════════
   سجلُّ التواقيع — أسماءُ الموقّعين وصورُ توقيعِهم وختمِ الشركة
   (طلبُ المالك: «اسم التوقيع مثلا محفوظ للاختيار في كل مره، واضافة توقيع وختم
   الشركة، والتواقيع تكون محفوظة في قوائم للاختيار»)

   ── لماذا سجلٌّ لا حقلُ كتابةٍ في كلّ خطاب ──
   اسمُ الموقّع وصفتُه يتكرّران في كلّ خطابٍ تُصدره الشركة. وكتابتُهما في كلّ مرّة
   تُنتج «المدير العام» و«مدير عام» و«م. عام» على ورقٍ يخرج باسم الشركة نفسِها —
   والصورتان (التوقيع والختم) لا تُرفعان أصلاً في كلّ مرّة. فسجلٌّ يُملأ مرّةً
   ويُختار منه.

   ── الإدارةُ للأدمن وحدَه، **وهذا حارسٌ على الخادم لا في الشاشة** ──
   صورةُ توقيعِ المدير العام وختمُ الشركة أداتا إلزامٍ لا بياناتُ عرض: من ملكهما
   أخرج خطاباً يبدو موقَّعاً ومختوماً. ومستندُ `meta` مفتوحٌ بالقاعدة العامة لكلّ
   دورٍ غيرِ الزائر، فاستُثني صراحةً في `firestore.rules` وأُفرد له بلوكُ
   **`isAdmin()` وحدَه** — كما فُعل بمستند المستخدمين للسبب نفسِه.

   ── والقراءةُ تبقى مفتوحةً لكلّ ذي دور ──
   وهو **خطرٌ مُعلَنٌ لا مسكوتٌ عنه**: من يفتح الخزانة يرى الرابطَ ويطبع به. تضييقُه
   يحتاج تضييقَ القراءة العامة كلِّها (المرحلة ٣ في `docs/deep-review-2026-08.md`)،
   ومجموعةٌ واحدةٌ تُضيَّق قبل أخواتها تنكسر شاشتُها وحدَها.

   ── والنموذجُ لا يُوقَّع إطلاقاً ──
   نموذجٌ يخرج موقَّعاً ومختوماً هو **خطابٌ جاهزٌ للإرسال بعناصرَ نائبةٍ بين قوسين**.
   فالتوقيعُ خاصيّةُ الصادر وحدَه، بلا خيارٍ في نموذج النموذج أصلاً.
   ═══════════════════════════════════════════════════════════════════════════ */
function SIGNS_DOC(){ return _dev() ? "meta/vault_signatories_dev" : "meta/vault_signatories"; }


/* ═══════════════════════════════════════════════════════════════════════════
   مخزنُ التواقيع المقفول، وقائمةُ مَن يُؤذَن له  (طلبُ المالك: «أفتحه لبعض الأشخاص»)

   ── لماذا انتقل السجلُّ من `meta` إلى مجموعةٍ باسمه ──
   استثناءُ **مستندٍ بعينه** من قاعدة القراءة يحتاج شرطاً على معرّف المستند، وذاك
   **يُسقط `list` على المجموعة كلِّها** — صنفُ `v18.9.2635`، وقِيس على المحاكي فسقط
   استعلامُ `meta`. والشرطُ على **اسم المجموعة** يعمل. فالمخرجُ بنيويٌّ: يخرج
   السجلُّ من `meta` إلى `vault_signs`.

   ── والنقلُ فعلٌ صريحٌ لا ترحيلٌ صامت ──
   القديمُ يحمل روابطَ صورةِ توقيعٍ وختم. نسخُه ثمّ **حذفُ الأصل** عملٌ لا رجعةَ
   فيه، ولا يُفعَل خلسةً وقتَ التحميل: زرٌّ للأدمن، ونسخٌ ثمّ **تحقّقٌ من وصول
   النسخة** ثمّ حذف. ولو انقطع بينهما بقي القديمُ سليماً فيُعاد.

   ── والقراءةُ ترتدّ ما دام النقلُ لم يتمّ ──
   تُقرأ المجموعةُ الجديدةُ أوّلاً، فإن كانت فارغةً قُرئ القديم. فالشاشةُ تعمل قبل
   النقل وبعده، ولا لحظةَ تنقطع فيها التواقيع.

   ── وقائمةُ المأذونين أضيقُ من قائمة قرّاء الخزانة عمداً ──
   `meta/vault_signers` مستقلٌّ عن `meta/vault_readers`: من يرى الوثائقَ لا يرى
   التوقيعَ إلّا إن أُذن له وحدَه.

   ── والغيابُ هنا يُقفل لا يفتح ──
   عكسُ قائمة القرّاء، **لأنّ التعطّلَ رفيق**: من ليس في القائمة يظلّ يطبع الخطابَ
   باسم الموقّع وصفته على ورق الشركة — بلا الصورتين فيُوقَّع باليد، أي كما كان قبل
   الميزة. فالإقفالُ الافتراضيُّ لا يمنع أحداً من عمله، والانفتاحُ الافتراضيُّ
   يُبقي البابَ مفتوحاً بلا أن يشعر أحد.
   ═══════════════════════════════════════════════════════════════════════════ */

function SIGNS_COLL(){ return _dev() ? "vault_signs_dev" : "vault_signs"; }
function SIGNS_NEW(){  return SIGNS_COLL() + "/list"; }
function SIGNERS_DOC(){ return "meta/vault_signers"; }

var _signers = null;       // null = لم يُقرأ · مصفوفة = القائمة (وقد تكون فارغة)
var _signsLegacy = false;  // أما زال السجلُّ في موضعه القديم؟
var _signsNew    = null;   // null = لم يُعرَف · true/false = أموجودٌ المخزنُ الجديد؟

/* أمأذونٌ لهذا المستخدم بصورتَي التوقيع والختم؟ دالّةٌ نقيّةٌ تُفحَص بلا متصفّح. */
function signerAllowed(user, list){
  if(!user || !user.user) return false;
  if(user.role === "admin") return true;
  if(!Array.isArray(list)) return false;
  return list.indexOf(String(user.user)) !== -1;
}
function canUseSigns(){ return signerAllowed(_me(), _signers); }

/* دمجُ اختيارِ اللوحة: `picked` أسماءُ من أُشّر عليهم، و`shown` مَن عُرضوا —
   فلا يُنزَع من لم يُعرض أصلاً (مستخدمو مشروعٍ آخرَ ليسوا على الشاشة). */
function mergeSigners(current, picked, shown){
  var cur = Array.isArray(current) ? current.map(String) : [];
  var pick = {}, seen = {};
  (Array.isArray(picked) ? picked : []).forEach(function(n){ if(n) pick[String(n)] = 1; });
  (Array.isArray(shown) ? shown : []).forEach(function(n){ if(n) seen[String(n)] = 1; });
  var out = cur.filter(function(n){ return !seen[n]; }).concat(Object.keys(pick));
  var uniq = {};
  return out.filter(function(n){ if(!n || uniq[n]) return false; uniq[n] = 1; return true; })
            .sort(function(a, b){ return a.localeCompare(b, "ar"); });
}

function _readSigners(){
  var d = _db();
  if(!d || _signers !== null) return;
  d.doc(SIGNERS_DOC()).get().then(function(s){
    _signers = (s.exists && Array.isArray((s.data() || {}).users)) ? s.data().users.map(String) : [];
    _repaint(PAGE_LETTERS);
  }).catch(function(){ _signers = null; });
}

/* ══ النقلُ إلى المخزن المقفول — فعلٌ صريحٌ للأدمن ══ */
function migrateSigns(){
  var d = _db(), me = _me();
  if(!d) return Promise.resolve(false);
  if(!me || me.role !== "admin"){ _toast("🔒 النقل من صلاحية مدير النظام", "warn"); return Promise.resolve(false); }
  var oldRef = d.doc(SIGNS_DOC()), newRef = d.doc(SIGNS_NEW());
  return oldRef.get().then(function(o){
    var list = (o.exists && Array.isArray((o.data() || {}).list)) ? o.data().list : [];
    if(!o.exists){ _toast("لا سجلَّ قديمٌ يُنقَل — المخزنُ الجديد هو المستعمَل", ""); _signsLegacy = false; return false; }
    return newRef.set({ list:list, movedAt:new Date().toISOString(), movedBy:_myName() })
      /* التحقّقُ قبل الحذف: لا يُمحى الأصلُ على وعدِ كتابةٍ لم تُقرأ. */
      .then(function(){ return newRef.get(); })
      .then(function(chk){
        var got = (chk.exists && Array.isArray((chk.data() || {}).list)) ? chk.data().list : null;
        if(!got || got.length !== list.length) throw new Error("النسخةُ لم تكتمل — لم يُحذف الأصل");
        return oldRef.delete();
      })
      .then(function(){
        _signsLegacy = false;
        _audit("نقل سجلّ التواقيع إلى مخزنٍ مقفول", list.length + " موقّعاً");
        _toast("✅ نُقل السجلُّ وحُذف الأصلُ المكشوف — " + list.length + " موقّعاً", "success");
        stopSignSync(); startSignSync(); renderLetters();
        return true;
      });
  }).catch(function(e){
    _toast("⚠ تعذّر النقل: " + String((e && e.message) || e), "warn");
    return false;
  });
}

/* ══ حفظُ قائمة المأذونين ══ */
function saveSigners(){
  var d = _db(), me = _me();
  if(!d) return Promise.resolve(false);
  if(!me || me.role !== "admin"){ _toast("🔒 من صلاحية مدير النظام", "warn"); return Promise.resolve(false); }
  var shown = [], picked = [];
  try{
    var boxes = document.querySelectorAll("input.dv-sgr-box");
    for(var i = 0; i < boxes.length; i++){
      var u = String(boxes[i].getAttribute("data-user") || "");
      if(!u) continue;
      shown.push(u);
      if(boxes[i].checked) picked.push(u);
    }
  }catch(e){}
  var next = mergeSigners(_signers, picked, shown);
  return d.doc(SIGNERS_DOC()).set({ users:next, updatedAt:new Date().toISOString(), updatedBy:_myName() })
    .then(function(){
      _signers = next;
      _audit("تحديث المأذونين باستعمال التوقيع والختم", next.length + " مستخدماً");
      _toast("✅ حُفظت القائمة — " + next.length + " مأذوناً", "success");
      renderLetters();
      return true;
    })
    .catch(function(e){ _toast("⚠ تعذّر الحفظ: " + String((e && e.message) || e), "warn"); return false; });
}

/* ══ لوحةُ المأذونين داخل سجلّ التواقيع ══ */
function _signersPanelHTML(){
  if(!canManageSigns()) return "";
  var cur = Array.isArray(_signers) ? _signers : [];
  var arr = _users().slice().sort(function(a, b){
    return String((a && (a.name || a.user)) || "").localeCompare(String((b && (b.name || b.user)) || ""), "ar");
  });
  var rows = arr.filter(function(u){ return u && u.user && u.role !== "admin"; }).map(function(u){
    var on = cur.indexOf(String(u.user)) !== -1;
    return '<label class="dv-sgr">'
      + '<input type="checkbox" class="dv-sgr-box" data-user="' + _esc(u.user) + '"' + (on ? " checked" : "") + '>'
      + '<span>' + _esc(u.name || u.user) + '</span>'
      + '<span class="t-dim">' + _esc(u.user) + '</span></label>';
  }).join("");
  return '<div class="dv-panel" style="margin-top:14px">'
    + '<div class="dv-panel-h">مَن يُؤذَن له بصورتَي التوقيع والختم</div>'
    + '<div class="dv-panel-s">صورةُ التوقيع والختم تُلصَق على أيّ ورقةٍ لمن يملكها، '
      + 'فلا يراها إلّا من تختاره. <b>ومن ليس هنا لا يتعطّل عملُه</b>: يطبع الخطابَ '
      + 'باسم الموقّع وصفته على ورق الشركة ويوقّعه باليد — كما كان قبل الميزة. '
      + 'ومديرُ النظام مأذونٌ دائماً.</div>'
    + (_signsLegacy
        ? '<div class="dv-note-link">' + _icon("alertTriangle", "ic-sm")
          + '<span><b>السجلُّ ما زال في موضعه المكشوف.</b> القائمةُ أدناه لا تحمي شيئاً '
          + 'حتى يُنقَل إلى المخزن المقفول.</span>'
          + '<button type="button" class="dv-clear" onclick="docVault.migrateSigns()">انقله الآن</button></div>'
        : "")
    + (rows
        ? '<div class="dv-sgr-wrap">' + rows + '</div>'
          + '<div class="dv-acts"><button type="button" class="btn btn-primary btn-sm" onclick="docVault.saveSigners()">حفظ القائمة</button></div>'
          + (cur.length ? "" : '<div class="dv-hint">لم يُؤذَن لأحدٍ بعد — الخطاباتُ تخرج بلا الصورتين حتى تختار.</div>')
        : '<div class="dv-empty">لا مستخدمين في هذا المشروع سوى مديري النظام.</div>')
    + '</div>';
}

var _signs = [], _signsUnsub = null, _signsLoaded = false;
var _sEdit = null;        // مسوّدةُ الموقّع قيدَ التحرير
var _sPanel = false;      // أمفتوحةٌ لوحةُ إدارة التواقيع؟

function signatories(){ return _signs.slice(); }
function signatoryById(id){
  var l = String(id || "");
  for(var i = 0; i < _signs.length; i++) if(_signs[i] && _signs[i].id === l) return _signs[i];
  return null;
}
/* الإدارةُ للأدمن وحدَه — والخادمُ يردّ غيرَه، فهذا حارسٌ ثانٍ لا الوحيد. */
function canManageSigns(){ var u = _me(); return !!(u && u.role === "admin"); }

function startSignSync(){
  var d = _db();
  if(!d || _signsUnsub || !canView()) return;
  _readSigners();
  /* المخزنُ الجديدُ هو المصدر. وخطؤه ليس عطلاً بل **جواباً**: من لم يُؤذَن له
     تُردّ قراءتُه، فتبقى القائمةُ فارغةً ويخرج الخطابُ بلا الصورتين — وهو
     المقصود. فلا رسالةَ خطأٍ تُعرض عليه. */
  _signsUnsub = d.doc(SIGNS_NEW()).onSnapshot(function(snap){
    var v = (snap.exists && snap.data()) || {};
    if(snap.exists){
      _signs = Array.isArray(v.list) ? v.list : [];
      _signsLoaded = true; _signsLegacy = false; _signsNew = true;
      _repaint(PAGE_LETTERS);
      return;
    }
    _signsNew = false;
    /* لا مخزنَ جديداً بعد ⇒ السجلُّ ما زال في موضعه القديم المكشوف. يُقرأ ليعمل
       كلُّ شيءٍ كما كان، ويُعلَن للأدمن أنّ النقلَ لم يتمّ. */
    _readLegacySigns();
  }, function(){
    _signs = []; _signsLoaded = true;
    _repaint(PAGE_LETTERS);
  });
}
function _readLegacySigns(){
  var d = _db(); if(!d) return;
  d.doc(SIGNS_DOC()).get().then(function(o){
    var v = (o.exists && o.data()) || {};
    _signs = Array.isArray(v.list) ? v.list : [];
    _signsLegacy = !!o.exists;
    _signsLoaded = true;
    _repaint(PAGE_LETTERS);
  }).catch(function(){ _signs = []; _signsLoaded = true; _repaint(PAGE_LETTERS); });
}
function stopSignSync(){
  try{ if(_signsUnsub) _signsUnsub(); }catch(e){}
  _signsUnsub = null; _signs = []; _signsLoaded = false;
}
/* الكتابةُ تُعيد المصفوفةَ كاملةً — والسجلُّ بضعةُ أسماءٍ يحرّرها الأدمن وحدَه،
   فلا تصادمَ يُخشى، والقراءةُ الطازجةُ قبل الكتابة تكلفةٌ بلا مقابلٍ هنا. */
function _saveSigns(list){
  var d = _db();
  if(!d) return Promise.reject(new Error("no-db"));
  return d.doc(SIGNS_NEW()).set({ list:list, updatedAt:new Date().toISOString(),
                                  updatedBy:_myName() }, { merge:true });
}

/* ════════ لوحةُ الإدارة ════════ */
/* ════════ أوضاعُ شاشة الخطابات يُقصي بعضُها بعضاً ════════
   أربعةٌ لا تجتمع: `signs` لوحةُ التواقيع · `form` نموذجُ خطاب · `open` بطاقةُ
   خطابٍ مفتوح · `list` القائمة. وكان كلُّ وضعٍ علَماً مستقلاًّ يُرفَع ولا يُخفضه
   غيرُه، والرسمُ يفحصها **بترتيب**: فاللوحةُ المفتوحةُ تعلو كلَّ ما بعدها.

   وأثرُه بلاغُ المالك: «نموذج جديد» و«خطاب صادر» — واللوحةُ مفتوحة — يبنيان
   المسوّدةَ في الحالة **ولا تظهر**، إذ تُعاد رسمُ اللوحة فوقها. فيبدو الزرُّ ميتاً
   بلا خطأٍ في وحدة التحكّم ولا شيءٍ يُنذر.

   فالوضعُ **يُصرَّح به** الآن في دالّةٍ واحدةٍ تُغلق ما عداه — والتصريحُ أضمنُ من
   ترتيبِ فحوصٍ يُنسى عند إضافة الوضع الخامس. */
function _letterMode(m){
  _sPanel = (m === "signs");
  _sEdit  = null;
  if(m !== "form") _ai = null;     // لوحةُ المساعد تعيش داخل نموذج الخطاب وحدَه
  if(m !== "form") _ledit = null;
  if(m !== "open") _lview.open = null;
}

function toggleSignPanel(){
  if(!canManageSigns()){ _toast("🔒 إدارة التواقيع لمدير النظام وحدَه","warn"); return; }
  /* فحصُ «أما زال في موضعه المكشوف؟» يُعاد عند فتح اللوحة، ولا يُكتفى بنتيجة
     لحظةِ التحميل: مستمعُ المخزن الجديد لا يُعاد إطلاقُه حين يتغيّر **مستندٌ آخر**،
     فسجلٌّ قديمٌ ظهر بعد التحميل يبقى بلا تحذيرٍ إلى الأبد. واللوحةُ هي موضعُ
     القرار، ففحصُها عندها. */
  if(!_sPanel && _signsNew === false) _readLegacySigns();
  _letterMode(_sPanel ? "list" : "signs");
  renderLetters(); _top();
}
function newSignatory(){
  if(!canManageSigns()) return;
  _letterMode("signs");
  _sEdit = { name:"", title:"", signUrl:"", signPath:"", stampUrl:"", stampPath:"" };
  renderLetters(); _top();
}
function editSignatory(id){
  if(!canManageSigns()) return;
  var s = signatoryById(id);
  if(!s) return;
  _letterMode("signs");
  _sEdit = { id:s.id, name:s.name||"", title:s.title||"",
             signUrl:s.signUrl||"", signPath:s.signPath||"",
             stampUrl:s.stampUrl||"", stampPath:s.stampPath||"" };
  renderLetters(); _top();
}
function cancelSignatory(){ _sEdit = null; renderLetters(); }

function _readSignForm(){
  var g = function(id){ var el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; };
  _sEdit.name  = g("dv-s-name");
  _sEdit.title = g("dv-s-title");
}
/* الصورتان تُرفعان تحت البادئة القائمة `po/vault/sign/` كبقيّة مرفقات الخزانة. */
function addSignImage(which){
  if(!_sEdit || !canManageSigns()) return;
  _readSignForm();
  _pickFile(function(f){
    _toast("⏳ جارٍ الرفع…", "");
    _upload("sign", _sEdit.id || ("new_" + Date.now()), f).then(function(rec){
      if(which === "stamp"){ _sEdit.stampUrl = rec.url; _sEdit.stampPath = rec.storagePath; }
      else { _sEdit.signUrl = rec.url; _sEdit.signPath = rec.storagePath; }
      renderLetters(); _toast("✅ رُفعت الصورة", "success");
    }).catch(function(e){ _toast("⚠ تعذّر الرفع: " + String((e && e.message) || e), "warn"); });
  });
}
function delSignImage(which){
  if(!_sEdit) return;
  _readSignForm();
  if(which === "stamp"){ _sEdit.stampUrl = ""; _sEdit.stampPath = ""; }
  else { _sEdit.signUrl = ""; _sEdit.signPath = ""; }
  renderLetters();
}

function saveSignatory(){
  if(!canManageSigns()){ _toast("🔒 إدارة التواقيع لمدير النظام وحدَه","warn"); return; }
  _readSignForm();
  if(!_sEdit.name){ _toast("⚠ أدخل اسم الموقّع","warn"); return; }
  if(!_sEdit.title){ _toast("⚠ أدخل صفة الموقّع (مثال: المدير العام)","warn"); return; }
  var now = new Date().toISOString(), me = _myName();
  var list = _signs.slice(), i;
  if(_sEdit.id){
    for(i = 0; i < list.length; i++){
      if(list[i].id === _sEdit.id){
        list[i] = { id:_sEdit.id, name:_sEdit.name, title:_sEdit.title,
                    signUrl:_sEdit.signUrl, signPath:_sEdit.signPath,
                    stampUrl:_sEdit.stampUrl, stampPath:_sEdit.stampPath,
                    createdAt:list[i].createdAt || now, createdBy:list[i].createdBy || me,
                    updatedAt:now, updatedBy:me };
        break;
      }
    }
  } else {
    list.push({ id:"SG-" + Date.now().toString(36), name:_sEdit.name, title:_sEdit.title,
                signUrl:_sEdit.signUrl, signPath:_sEdit.signPath,
                stampUrl:_sEdit.stampUrl, stampPath:_sEdit.stampPath,
                createdAt:now, createdBy:me, updatedAt:now, updatedBy:me });
  }
  _saveSigns(list).then(function(){
    _audit(_sEdit.id ? "تعديل موقّع في الخزانة" : "إضافة موقّع إلى الخزانة", _sEdit.name + " — " + _sEdit.title);
    _sEdit = null; renderLetters(); _toast("✅ حُفظ الموقّع", "success");
  }).catch(function(e){ _toast("⚠ تعذّر الحفظ: " + String((e && e.message) || e), "warn"); });
}

function delSignatory(id){
  if(!canManageSigns()){ _toast("🔒 إدارة التواقيع لمدير النظام وحدَه","warn"); return; }
  var s = signatoryById(id);
  if(!s) return;
  _confirm({ title:"حذف موقّع", icon:"🗑", okText:"حذف", okClass:"btn-danger",
    msg:'سيُحذف "' + (s.name || id) + '" من قائمة التواقيع. الخطاباتُ التي تحمله تبقى كما هي — '
      + 'الاسمُ والصفةُ محفوظان في كلٍّ منها، والصورتان تختفيان من مطبوعاتها.' })
    .then(function(ok){
      if(!ok) return;
      _saveSigns(_signs.filter(function(x){ return x.id !== id; })).then(function(){
        _audit("حذف موقّع من الخزانة", id + " — " + (s.name || ""));
        renderLetters(); _toast("✅ حُذف الموقّع", "success");
      }).catch(function(e){ _toast("⚠ تعذّر الحذف: " + String((e && e.message) || e), "warn"); });
    }).catch(function(){});
}

/* ═══════════════════════════════════════════════════════════════════════════
   المطبوعة — الخطابُ على الورقة الرسمية (طلبُ المالك: «مثل العقود والمستخلصات»)

   ── الورقةُ تُستعار ولا تُنسَخ ──
   `contracts.js` يملك خطَّ الورقة الرسمية كاملاً — الصورُ الثلاث وهوامشُ `@page`
   وحيلةُ `thead/tfoot` التي تُكرّر الترويسةَ على كل صفحة — وهو **مضبوطٌ بالمليمتر**
   على قالب الشركة الحقيقيّ. فنُناديه بأسمائه المعروضة (`_letterheadCSS` ·
   `_letterheadWrap` · `_letterheadAssets` · `_docHeadHTML`).

   **ولماذا نُنادي هنا ولم نُنادِ في محرّك الانتهاء؟** الفرقُ أنّ ذاك **سياسةٌ**
   تختلف بين الوحدتين عمداً (سلّمٌ ثلاثيٌّ مقابل خماسيّ)، وهذه **أصلٌ بصريٌّ واحدٌ
   لا يصحّ أن يختلف**: ورقتان للشركة تفترقان بمليمترٍ فضيحةٌ تُرى بالعين على مطبوعةٍ
   تخرج باسمها. والنداءُ هنا آمنٌ زمنياً: الطباعةُ فعلُ مستخدمٍ لا حدثُ تحميل،
   فالوحدةُ محمَّلةٌ قطعاً. وإن غابت — سقطنا إلى ترويسةٍ نصّيةٍ بلا ورقة، لا إلى عطب.

   ── والنموذجُ يُطبَع موسوماً ──
   نموذجٌ يخرج على ورقة الشركة نظيفاً يُشبه خطاباً صادراً تمامَ الشبه، فيُرسَل
   بعناصرَ نائبةٍ بين قوسين أو يُحفَظ في ملفٍّ على أنه مراسلة. فشريطٌ صريحٌ يعلوه،
   **ولا باركودَ له**: الباركودُ رقمُ قيدٍ في سجلّ الصادر، والنموذجُ ليس قيداً.
   ═══════════════════════════════════════════════════════════════════════════ */
function _ctr(){ try{ return (typeof contracts !== "undefined") ? contracts : null; }catch(e){ return null; } }
/* الشعارُ للحالة التي تغيب فيها الورقةُ الرسمية — قراءةُ مُحدِّدٍ لا منطقٌ يُنسَخ. */
function _printLogo(){
  try{
    var im = document.querySelector('img[data-logo="1"]');
    if(im && im.src && im.src.indexOf("data:,") !== 0) return im.src;
  }catch(e){}
  return "";
}

/* نصُّ المتن: يُهرَّب ثمّ تُبرَز العناصرُ النائبة `[...]` — فالفراغُ الذي يجب أن
   يُملأ يُرى قبل أن تُرسَل الورقة، لا بعد. */
function _bodyHTML(text){
  var t = _esc(String(text == null ? "" : text));
  return t.replace(/\[([^\]\n]{1,60})\]/g, '<span class="ph">[$1]</span>');
}

/* ════════ كتلةُ التوقيع في المطبوعة — أسفل يسار الورقة ════════
   طلبُ المالك: «اسم التوقيع اسفل يسار ورقة الشركة ويكون بخط bold وحجم مناسب،
   واضافة توقيع وختم الشركة».

   ── ثلاثُ حالاتٍ لا حالتان ──
   (١) موقّعٌ بصورتِه ⇐ اسمٌ وصفةٌ بخطٍّ عريضٍ فوقهما التوقيعُ والختم.
   (٢) موقّعٌ بلا صورةٍ (أو حُذف من السجلّ) ⇐ الاسمُ والصفةُ فوق **سطرِ توقيعٍ
       يدويّ**: الورقةُ تقول مَن يوقّع، ويبقى موضعُ توقيعه فارغاً. ولو حُذف السطرُ
       هنا لخرجت ورقةٌ تحمل اسمَ مسؤولٍ بلا موضعٍ يوقّع فيه.
   (٣) بلا موقّعٍ ⇐ أسطرٌ فارغةٌ كما كانت.
   **والنموذجُ يبقى على الأسطر الفارغة دائماً** مهما حُفظ فيه.

   ── والاسمُ من الخطاب لا من السجلّ ──
   `signName`/`signTitle` مثبَّتان على الوثيقة عند الحفظ. فخطابٌ خرج ثمّ تغيّرت
   صفةُ موقّعه **لا تتغيّر ورقتُه**: المطبوعُ سجلٌّ لما وُقِّع لا مرآةٌ لحاضر
   السجلّ. والصورتان وحدَهما تُقرآن حيّتين — فحذفُ الموقّع يُسقطهما ولا يُسقط اسمَه.

   ── والختمُ فوق التوقيع بتراكبٍ مقصود ──
   كما يُختَم الورقُ فعلاً: الختمُ يقع على التوقيع لا بجانبه. و`z-index` يضعه
   فوقه، وشفافيةُ الـPNG هي ما يُبقي التوقيعَ مقروءاً تحته. */
/* رمزُ QR للصادر الذي له رمزُ تحقّق. يُرسَم بـ`window.qrCode` إن حضر، ويغيب بصمتٍ
   إن لم يحضر أو لم يكن للخطاب رمز — ويبقى الباركودُ والرقمُ كما كانا. */
function _qrBlockHTML(l){
  if(!l || !isVerifyToken(l.verifyToken)) return "";
  var qr = null;
  try{ qr = (typeof window !== "undefined" && window.qrCode) ? window.qrCode : null; }catch(e){ qr = null; }
  if(!qr || typeof qr.svg !== "function") return "";
  var url = verifyUrl(verifyBase(), l.verifyToken, _dev());
  try{
    return '<div class="qrb">' + qr.svg(url, { ecl:"M", quiet:1 })
      + '<div class="qrn">امسح للتحقّق من الخطاب</div></div>';
  }catch(e){ return ""; }
}
/* كتلةُ هوية الخطاب الصادر: الرمزان في صفّ (QR ثمّ الباركود ورقمُه تحته) والتاريخُ
   تحتهما — كتلةٌ واحدةٌ يقرؤها الماسحُ والعينُ معاً في موضعٍ واحد. */
function _idBlockHTML(l){
  return '<div class="idb">'
    + '<div class="bcw">' + _qrBlockHTML(l) + '<div class="bcb">' + code128SVG(l.id || "")
    + '<div class="bcn">' + _esc(l.id || "") + '</div></div></div>'
    + '<div class="idb-date"><span class="ml">التاريخ</span><span class="mv dv-num">' + _esc(l.letterDate || "—") + '</span></div>'
    + '</div>';
}
function _signBlockHTML(l, isTpl){
  var blank = '<div class="sign"><div class="sg">'
    + '<div class="sg-r"><span>الاسم</span><i></i></div>'
    + '<div class="sg-r"><span>الصفة</span><i></i></div>'
    + '<div class="sg-r"><span>التوقيع والختم</span><i></i></div>'
    + '</div></div>';
  if(isTpl) return blank;
  var nm = String(l.signName || "").trim(), ti = String(l.signTitle || "").trim();
  if(!nm && !ti) return blank;
  /* الاسمُ والصفةُ مثبَّتان على الخطاب وقتَ حفظه فيُطبَعان دائماً. والصورتان
     تُقرآن حيّتين — ومن لم يُؤذَن له لا يصلانه أصلاً (الخادمُ يردّ)، وهذا الشرطُ
     حارسٌ ثانٍ يمنع رسمَهما من نسخةٍ قديمةٍ عالقةٍ في الذاكرة. */
  var s = (l.signId && canUseSigns()) ? signatoryById(l.signId) : null;
  var sig = (s && s.signUrl) ? s.signUrl : "";
  var stp = (s && s.stampUrl) ? s.stampUrl : "";
  return '<div class="sgn">'
    + '<div class="sgn-co">شركة المباني السريعة للمقاولات</div>'
    + '<div class="sgn-nm">' + _esc(ti ? (ti + ": ") : "") + _esc(nm) + '</div>'
    + ((sig || stp)
        ? '<div class="sgn-im">'
          + (sig ? '<img class="sgn-sig" src="' + _esc(sig) + '" alt="">' : '')
          + (stp ? '<img class="sgn-stp" src="' + _esc(stp) + '" alt="">' : '')
          + '</div>'
        : '<div class="sgn-line"></div>')
    + '</div>';
}

function letterPaperHTML(l){
  var isTpl = (l.kind === "template");
  var ctr = _ctr();
  var lh  = (ctr && ctr._letterheadAssets) ? ctr._letterheadAssets() : null;
  var on  = !!(ctr && ctr._letterheadOn && ctr._letterheadOn(lh));
  /* طلبُ المالك: «الغِ كلمة خطاب صادر وأبقِ فقط رقم الخطاب». والخطابُ الرسميُّ لا
     يحمل عنوانَ نوعه أصلاً — ورقةُ الشركة تقول مَن أرسل، والرقمُ يقول أيُّ خطاب.
     **والنموذجُ يبقى موسوماً** بشريطه أدناه: وسمُه تحذيرٌ لا عنوان.
     ولا نُنادي `_docHeadHTML` هنا حين تحضر الورقةُ الرسمية — دالّتُها تبني شريطاً
     بعنوانٍ ورقم، ونحن نريد الرقمَ وحدَه. وتبقى نداءً عند غياب الورقة، فترويستُها
     النصّيةُ تحمل الشعارَ واسمَ الشركة وهما لازمان حينها. */
  /* طلبُ المالك (v18.9.3191): «الـQR والباركود ورقم الخطاب وتاريخ الخطاب مجتمعين
     أعلى يسار الصفحة». فالصادرُ يحمل **كتلةَ هويةٍ** واحدةً في رأس الورقة على
     حافّتها اليسرى: الرمزان في صفّ، والرقمُ تحت الباركود (عُرفُ المطبوعة المرقَّمة —
     ماسحٌ يعطب ⇐ تبقى العين)، والتاريخُ تحتهما. ولا رقمَ في مكانٍ آخر من الورقة.
     والنموذجُ يبقى برقمه في الترويسة كما كان — لا رمزَ له ولا تاريخ. */
  var head;
  if(isTpl){
    head = on
      ? '<div class="dochead only-no"><div class="doc-no">' + _esc(l.id || "") + '</div></div>'
      : ((ctr && ctr._docHeadHTML)
          ? ctr._docHeadHTML({ on:false, logo:_printLogo(), docNo:l.id || "", subtitle:"نموذج خطاب" })
          : '<div class="dochead only-no"><div class="doc-no">' + _esc(l.id || "") + '</div></div>');
  } else {
    head = (!on && ctr && ctr._docHeadHTML
              ? ctr._docHeadHTML({ on:false, logo:_printLogo(), docNo:"", subtitle:"" }) : "")
         + '<div class="tophead">' + _idBlockHTML(l) + '</div>';
  }

  var inner =
    head
    + (isTpl
        ? '<div class="band">نموذج — يُستنسَخ ولا يُرسَل. ما بين قوسين مربّعين يُملأ عند الاستعمال.</div>'
        : '')
    /* الرقمُ والتاريخُ صارا في كتلة الهوية أعلى يسار الورقة؛ ولا يبقى هنا إلا
       رقمُ الجهة إن وُجد. بلا `dv-num`: رقمُ الجهة نصٌّ حرٌّ قد يكون عربياً
       («أ ح/4471»)، وقلبُ اتّجاهه يبعثر مقاطعَه. */
    + ((isTpl || !l.ref) ? '' : '<div class="meta">'
          + '<div><span class="ml">الرقم لدى الجهة</span><span class="mv">' + _esc(l.ref) + '</span></div>'
        + '</div>')
    + (isTpl ? "" : (function(){
        var pf = _orDef(l.prefix, DEF_PREFIX).trim();
        var hn = _orDef(l.honorific, DEF_HONORIFIC).trim();
        var pt = String(l.party || "").trim();
        /* لا سطرَ مخاطَبةٍ إن خلا من اللقبين والجهة معاً — سطرٌ فارغٌ فوق التحية
           يُقرأ خطأً في الطباعة لا اختياراً. */
        if(!pf && !hn && !pt) return '<div class="greet">' + _esc(DEF_GREET) + '</div>';
        return '<div class="to">'
          + (pf ? _esc(pf) + ' / ' : '')
          + '<b>' + _esc(pt || "[الجهة]") + '</b>'
          + (hn ? '<span class="resp">' + _esc(hn) + '</span>' : '')
          + '</div><div class="greet">' + _esc(DEF_GREET) + '</div>';
      })())
    + (l.subject ? '<div class="subj">الموضوع: <b>' + _esc(l.subject) + '</b></div>' : "")
    + '<div class="body">' + _bodyHTML(l.body || "") + '</div>'
    /* الختامُ اختياريّ: الفراغُ **لا يُطبَع سطراً فارغاً** بل لا يُطبَع شيئاً. */
    + (function(){
        if(isTpl) return "";
        var cl = _orDef(l.closing, DEF_CLOSING).trim();
        return cl ? '<div class="close">' + _esc(cl) + '</div>' : "";
      })()
    /* ذيلُ الورقة: كتلةُ التوقيع في آخره (يساراً كما في ورق الشركة)، والعنصرُ
       الفارغُ في أوّله يُبقي `space-between` يدفعها إلى حافّتها. والرمزان صعدا
       إلى كتلة الهوية في الرأس (طلبُ المالك). */
    + '<div class="ftr"><span></span>' + _signBlockHTML(l, isTpl) + '</div>'
    ;

  return '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">'
    + '<title>' + _esc((isTpl ? "نموذج — " : "خطاب — ") + (l.title || l.id || "")) + '</title><style>'
    + '*{box-sizing:border-box}'
    + 'body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;margin:0;padding:26px;color:#111827;direction:rtl;font-size:13.5px;line-height:2}'
    + '.header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1b3a6b;padding-bottom:12px}'
    + '.header-right{display:flex;align-items:center;gap:12px}'
    + '.company-logo{width:56px;height:56px;object-fit:contain}'
    + '.company{font-size:18px;font-weight:800}.subtitle{font-size:13px;color:#1b3a6b;font-weight:700}'
    + '.dochead{display:flex;justify-content:space-between;align-items:center;gap:14px;border-bottom:3px solid #1b3a6b;padding-bottom:10px}'
    + '.dh-t{font-size:17px;font-weight:800;color:#1b3a6b}'
    + '.doc-no{background:#eef2f7;color:#1b3a6b;border-radius:8px;padding:8px 14px;font-weight:800;font-family:monospace;direction:ltr;unicode-bidi:isolate}'
    + '.band{margin-top:14px;border-radius:8px;padding:9px 13px;font-weight:800;font-size:12.5px;'
      + 'background:#fffbeb;border:2px solid #d97706;color:#92400e}'
    + '.meta{display:flex;gap:26px;flex-wrap:wrap;margin-top:10px;font-size:12.5px}'
    /* كتلةُ الهوية: على الحافّة اليسرى (`margin-inline-start:auto` في صفحةٍ عربية)،
       وعناصرُها تلتصق بالحافّة نفسِها (`align-items:flex-end` في عمودٍ RTL = اليسار). */
    + '.tophead{display:flex;align-items:flex-start}'
    + '.idb{margin-inline-start:auto;display:flex;flex-direction:column;align-items:flex-end;gap:2px}'
    + '.idb-date{font-size:12.5px;white-space:nowrap}'
    + '.ml{color:#64748b;font-weight:700;margin-left:7px}'
    + '.mv{font-weight:800}'
    + '.dv-num{font-family:monospace;direction:ltr;unicode-bidi:isolate}'
    + '.to{margin-top:22px;font-size:14.5px;display:flex;align-items:baseline;gap:10px}'
    + '.to .resp{color:#64748b;font-size:12.5px}'
    + '.greet{margin-top:6px;font-size:13.5px}'
    + '.subj{margin-top:18px;font-size:14px;border-right:3px solid #1b3a6b;padding-right:10px}'
    + '.body{margin-top:16px;white-space:pre-wrap;text-align:justify;min-height:60mm}'
    /* العنصرُ النائبُ يُبرَز ليُرى الفراغُ قبل الإرسال لا بعده */
    + '.ph{background:#fef3c7;border-bottom:1px dashed #b45309;padding:0 2px;font-weight:700}'
    /* الختامُ **في وسط الصفحة** كما في ورقة المالك المرفقة — لا محاذياً للمتن.
       وهو عُرفُ الخطاب الرسميّ السعوديّ: المتنُ مضبوطٌ والخاتمةُ تتوسّط. */
    + '.close{margin-top:24px;text-align:center}'
    /* خانةُ توقيعٍ واحدةٌ مكدَّسةٌ إلى اليسار — الخطابُ يوقّعه شخصٌ واحد، وثلاثةُ
       أعمدةٍ متجاورةٍ شكلُ **نموذجٍ يُملأ** لا خطابٍ يُرسَل. */
    + '.sign{margin-top:26px;break-inside:avoid;display:flex;justify-content:flex-end}'
    + '.sg{width:82mm}'
    + '.sg-r{display:flex;align-items:flex-end;gap:9px;margin-bottom:13px}'
    + '.sg-r span{font-size:11.5px;color:#64748b;white-space:nowrap}'
    + '.sg-r i{flex:1;border-bottom:1px dotted #9ca3af;height:15px}'
    /* الباركودُ ورقمُه كتلةٌ واحدة: رقمٌ في طرفِ الورقة وأعمدةٌ في طرفها لا يُقرآن
       معاً، والرقمُ إنّما وُضع ليُنقذ الورقةَ حين يعجز الماسحُ عن الأعمدة فوقه. */
    /* كتلةُ الموقّع أسفل **يسار** الورقة (طلبُ المالك) — و`flex-end` في صفحةٍ
       عربيةٍ هو اليسار. والاسمُ عريضٌ بحجمٍ يزيد على المتن قليلاً: هو ما تبحث عنه
       العينُ في ورقةٍ رسمية، لا المتن. */
    /* الارتفاعُ الأدنى مقيسٌ على ما تتركه الورقةُ الرسمية: A4 ‏٢٩٧مم ناقصَ هوامش
       `@page` (٣ + ١١٫٥) وناقصَ حاجزَي الترويسة والتذييل (٣٥٫٦ + ٢٤٫٩) ≈ ‏٢٢٢مم.
       و**أدنى** لا ثابت: متنٌ أطولُ يتجاوزه ويتدفّق على صفحةٍ ثانيةٍ كما كان. */
    + '.sheet{display:flex;flex-direction:column;min-height:' + (on ? "222mm" : "248mm") + '}'
    + '.ftr{margin-top:auto;padding-top:24px;break-inside:avoid;display:flex;'
      + 'justify-content:space-between;align-items:flex-end;gap:14px}'
    + '.dochead.only-no{justify-content:flex-start;border-bottom:none;padding-bottom:0}'
    /* الكتلةُ إلى **يسار** الورقة (طلبُ المالك). وفي صفحةٍ عربيةٍ اليسارُ هو نهايةُ
       السطر، فالهامشُ التلقائيُّ يُوضع على **البداية** (`inline-start`) ليدفعها إليه. */
    + '.sgn{width:76mm;text-align:center;margin-inline-start:auto}'
    + '.sgn-co{font-size:13px;font-weight:700;color:#111827}'
    /* الاسمُ عريضٌ بحجمٍ يزيد على المتن: هو ما تبحث عنه العينُ في ورقةٍ رسمية. */
    + '.sgn-nm{font-size:14.5px;font-weight:800;color:#111827;margin-top:1mm}'
    + '.sgn-line{border-bottom:1px solid #9ca3af;height:20mm;margin-top:2mm}'
    /* التوقيعُ والختمُ يقعان **على** الاسم بتراكبٍ طفيفٍ لأعلى — كما يُختَم الورقُ
       فعلاً، لا صورتين مرصوصتين تحته. والختمُ فوق التوقيع بـ`z-index`، وشفافيةُ
       الـPNG هي ما يُبقي ما تحته مقروءاً. */
    + '.sgn-im{position:relative;height:28mm;margin-top:-3mm}'
    + '.sgn-sig{position:absolute;right:12%;top:0;height:16mm;object-fit:contain;z-index:1}'
    + '.sgn-stp{position:absolute;left:6%;top:4mm;height:23mm;object-fit:contain;z-index:2}'
    + '.bcw{direction:ltr;display:flex;justify-content:flex-start;align-items:flex-end;gap:10px}'
    + '.bcb{display:inline-block;text-align:center}'
    + '.bc{display:block}'
    + '.bcn{font-size:11px;letter-spacing:1.6px;color:#374151;margin-top:2px;font-family:monospace}'
    /* رمزُ التحقّق: ٢٢مم كافيةٌ لكاميرا الجوّال على ورقٍ عاديّ (إصدارٌ ٦ ≈ ٤١
       وحدة ⇒ ٠٫٥مم للوحدة)، وأصغرُ من ذلك يفشل على طابعةٍ مكتبيةٍ عادية. */
    + '.qrb{display:flex;flex-direction:column;align-items:center;gap:2px}'
    + '.qrb svg{width:22mm;height:22mm;display:block}'
    + '.qrn{font-size:9.5px;color:#374151;direction:rtl;white-space:nowrap}'
    + '@media print{body{padding:14px}@page{margin:14mm}}'
    + (on && ctr._letterheadCSS ? ctr._letterheadCSS() : "")
    + '</style></head><body>'
    /* غلافٌ عموديٌّ بارتفاعٍ أدنى: يدفع الذيلَ (الباركود والتوقيع) إلى **أسفل
       الورقة** بـ`margin-top:auto` بدل أن يعلق تحت المتن مباشرةً فتبقى نصفُ الصفحة
       بياضاً تحته (طلبُ المالك). والارتفاعُ مقيسٌ على ما تتركه الورقةُ الرسمية:
       ‏A4 ‏٢٩٧مم ناقصَ هوامش `@page` (٣ + ١١٫٥) وناقصَ حاجزَي الترويسة والتذييل
       (٣٥٫٦ + ٢٤٫٩) ≈ ‏٢٢٢مم. وهو **أدنى** لا ثابت: متنٌ أطولُ يتجاوزه ويتدفّق على
       صفحةٍ ثانيةٍ كما كان. */
    /* الغلافُ **داخل** إطار الورقة لا حوله: `letterheadWrap` يبني جدولاً بـ
       `thead`/`tfoot` هما الطريقةُ الوحيدةُ المضمونةُ لتكرار الترويسة على كلّ صفحة.
       ولفُّه من الخارج بـ`display:flex` **يُلغي كونَه جدولاً** فيسقط التكرارُ كلُّه —
       وقع فعلاً ورُئي في أوّل لقطة. فالغلافُ يسكن داخل خليّة المحتوى، والجدولُ
       يبقى جدولاً بلا حرفٍ يمسّه. */
    + ((on && ctr._letterheadWrap)
        ? ctr._letterheadWrap('<div class="sheet">' + inner + '</div>', lh)
        : '<div class="sheet">' + inner + '</div>')
    + '</body></html>';
}

/* كتابةُ النسخة العامة للصادر (تُنادَى بعد كلّ حفظٍ وعند إصدار الرمز لخطابٍ قديم).
   حذفُ الحقول الحسّاسة ليس هنا بل في `verifyRecord` — فهي التي تُفحص. */
function _syncVerify(l, at){
  var d = _db();
  if(!d || !l || l.kind === "template" || !isVerifyToken(l.verifyToken)) return Promise.resolve(false);
  return d.collection(VERIFY_COLL()).doc(l.verifyToken).set(verifyRecord(l, at || new Date().toISOString()))
    .then(function(){ return true; });
}
/* خطابٌ صادرٌ حُفظ قبل هذا الإصدار بلا رمز: يُصدَر له رمزٌ **عند أوّل طباعة**
   ويُثبَّت على الخطاب فلا يتبدّل. ومَن لا يملك الكتابةَ يطبع بلا QR (بالباركود)
   بدل أن تُمنع الطباعة. */
function _ensureVerifyToken(l){
  if(!l || l.kind === "template" || isVerifyToken(l.verifyToken)) return Promise.resolve(l);
  var d = _db();
  if(!d || !canEdit()) return Promise.resolve(l);
  var token = newVerifyToken(), now = new Date().toISOString();
  var withTok = {}; Object.keys(l).forEach(function(k){ withTok[k] = l[k]; }); withTok.verifyToken = token;
  return d.collection(LTRS_COLL()).doc(l.id).set({ verifyToken:token, updatedAt:now }, { merge:true })
    .then(function(){ return _syncVerify(withTok, now); })
    .then(function(){ return withTok; })
    .catch(function(e){ _toast("⚠ تعذّر إصدار رمز التحقّق — طُبع بالباركود وحدَه", "warn"); return l; });
}
function printLetter(id){
  var l = letterById(id);
  if(!l){ _toast("⚠ لم يعد هذا الخطاب موجوداً","warn"); return false; }
  if(l.kind !== "template" && !isVerifyToken(l.verifyToken)){
    /* أوّلُ طباعةٍ لخطابٍ قديم: النافذةُ تُفتح بعد وعد — فتُفتح من نداء المستخدم
       المباشر قدر الإمكان: نُصدر الرمزَ ثمّ نعاود النداء نفسَه بالنسخة الموسومة. */
    _ensureVerifyToken(l).then(function(l2){ _printLetterNow(l2); });
    return true;
  }
  return _printLetterNow(l);
}
function _printLetterNow(l){
  var html = letterPaperHTML(l);
  try{
    if(typeof _openPrintWindow === "function") _openPrintWindow(html);
    else {
      var w = window.open("", "_blank");
      if(!w){ _toast("⚠ تعذّر فتح نافذة الطباعة","warn"); return false; }
      w.document.write(html); w.document.close();
    }
    _audit("طباعة خطاب من الخزانة", l.id + " — " + (l.title || ""));
    return true;
  }catch(e){
    _toast("⚠ تعذّر فتح نافذة الطباعة","warn");
    return false;
  }
}

function renderLetters(){
  var host = document.getElementById("page-" + PAGE_LETTERS);
  if(!host) return;
  if(!canView()){
    host.innerHTML = '<div class="dv-empty">🔒 خزانة الوثائق غير متاحة لحسابك.</div>';
    return;
  }
  _lview.proj = _seedProj(_lview.proj);
  var _lvis = _visLtrs();
  /* عدّادا الخانتين يتبعان المُرشِّحَ — رقمٌ في خانةٍ لا يطابق ما فيها كذبةٌ صغيرةٌ
     تُفقد الثقةَ بالعدّاد كلِّه. */
  var nTpl = filterLetters(_lvis, { kind:"template", proj:_lview.proj }).length;
  var nIss = filterLetters(_lvis, { kind:"issued",   proj:_lview.proj }).length;
  var head = '<div class="dv-head"><div>'
    + '<h2 class="dv-ttl">' + _icon("scrollText") + ' خزانة الوثائق — الخطابات</h2>'
    + '<div class="dv-sub">نماذجُ الخطابات تُستنسَخ ولا تُكتب من جديد، والخطاباتُ الصادرةُ تُحفَظ برقمٍ مرجعيٍّ يُرجَع إليها به.</div>'
    + '</div><div style="display:flex;gap:8px;flex-wrap:wrap">'
    + (canManageSigns() ? '<button type="button" class="btn btn-ghost btn-sm" onclick="docVault.toggleSignPanel()">' + _icon("edit", "ic-sm") + ' سجلّ التواقيع</button>' : "")
    + (canEdit() ? '<button type="button" class="btn btn-ghost btn-sm" onclick="docVault.newLetter(\'template\')">' + _icon("plus", "ic-sm") + ' نموذج جديد</button>'
      + '<button type="button" class="btn btn-primary btn-sm" onclick="docVault.newLetter(\'issued\')">' + _icon("plus", "ic-sm") + ' خطاب صادر</button>' : "")
    + '</div></div>';

  if(!_ltrsLoaded){ host.innerHTML = head + '<div class="dv-empty">جارٍ تحميل الخطابات…</div>'; return; }

  var body = "";
  if(_sPanel && canManageSigns()){ body = _signPanelHTML() + _signersPanelHTML(); }
  else if(_ledit){ body = _letterFormHTML(); }
  else if(_lview.open){
    var l = letterById(_lview.open);
    body = l ? _letterCardHTML(l) : '<div class="dv-empty">لم يعد هذا الخطاب موجوداً.</div>';
  } else {
    var tabs = '<div class="dv-tabs">'
      + '<button type="button" class="dv-tab' + (_lview.kind === "issued" ? " on" : "") + '" onclick="docVault.letterTab(\'issued\')">الخطابات الصادرة<span class="n">' + nIss + '</span></button>'
      + '<button type="button" class="dv-tab' + (_lview.kind === "template" ? " on" : "") + '" onclick="docVault.letterTab(\'template\')">النماذج<span class="n">' + nTpl + '</span></button>'
      + '</div>';
    var bar = '<div class="dv-bar">'
      + '<input class="form-input dv-search" type="search" placeholder="ابحث بالعنوان أو الجهة أو الموضوع أو المشروع…"'
      + ' value="' + _esc(_lview.q) + '" oninput="docVault.setLetterFilter(this.value)">'
      + _projFilterHTML(_lview.proj, "setLetterProj", _lvis)
      + ((_lview.q || _lview.proj) ? '<button type="button" class="dv-clear" onclick="docVault.clearLetterFilters()">مسح الترشيح</button>' : "")
      + '</div>';
    var list = filterLetters(_lvis, _lview).sort(function(a, b){
      return String(b.letterDate || b.createdAt || "").localeCompare(String(a.letterDate || a.createdAt || ""));
    });
    body = _readerLockNoticeHTML() + _unlinkedNoticeHTML(_lvis, "setLetterProj", _lview.proj) + tabs + bar + _letterTableHTML(list, _lview.proj);
  }
  host.innerHTML = head + body;
}

/* ═══════════════════════════════════════════════════════════════════════════
   شاشةُ المعتمدات — سجلُّ أعمار
   ═══════════════════════════════════════════════════════════════════════════ */
function _money(n){
  var v = Number(n);
  if(!isFinite(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits:2, maximumFractionDigits:2 });
}
function _aprSync(){
  var d = _db();
  if(!d || _aprsUnsub || !canView()) return;
  _aprsUnsub = d.collection(APRS_COLL()).onSnapshot(function(snap){
    _aprs = snap.docs.map(function(x){ var v = x.data() || {}; v.id = x.id; return v; });
    _aprsLoaded = true; _repaint(PAGE_APPROVALS);
  }, function(e){ _aprsLoaded = true; _err = String((e && e.message) || e); _repaint(PAGE_APPROVALS); });
}
function _aprStopSync(){
  try{ if(_aprsUnsub) _aprsUnsub(); }catch(e){}
  _aprsUnsub = null; _aprs = []; _aprsLoaded = false;
}

/* ════════ شريطُ الحصيلة — أربعةُ أرقامٍ لا سبعة ════════
   السؤالُ: كم قدّمنا · كم اعتُمد · كم خُصم · **وكم واقفٌ ومنذ متى**. والأخيرُ هو
   الرقمُ الذي يُتَّخذ عليه قرار، فيأخذ حجمَه ولونَه بحسب أطول انتظار. */
/* حصيلةُ «المعتمدات» — أرقامُ ما اعتُمد: قُدِّم · اعتُمد · خُصم · سُدِّد. */
function _doneSummaryHTML(r){
  var cell = function(lbl, val, sub, cls){
    return '<div class="dv-ap-c' + (cls ? " " + cls : "") + '">'
      + '<span class="l">' + lbl + '</span>'
      + '<span class="v dv-num">' + val + '</span>'
      + (sub ? '<span class="s">' + sub + '</span>' : '') + '</div>';
  };
  return '<div class="dv-ap-sum">'
    + cell("قُدِّم", _money(r.sumSubmitted), r.total + " مستنداً")
    + cell("اعتُمد", _money(r.sumApproved), (r.approved + r.paid) + " معتمداً")
    + cell("الفارق المخصوم", r.variance ? _money(r.variance) : "—", r.variance ? "من المعتمَد" : "لا خصم")
    + cell("مسدَّد", _money(r.sumPaid), r.paid ? (r.paid + " مسدَّداً") : "لم يُسدَّد شيءٌ بعد", "done")
    + '</div>';
}
/* حصيلةُ «المستخلصات» — أرقامُ المتابعة: الواقفُ ومنذ متى · عند آخر محطة · المتجاوز · المرفوض. */
function _flowSummaryHTML(r){
  var band = aprAgeBand(r.waiting ? r.oldest : null);
  var cell = function(lbl, val, sub, cls){
    return '<div class="dv-ap-c' + (cls ? " " + cls : "") + '">'
      + '<span class="l">' + lbl + '</span>'
      + '<span class="v dv-num">' + val + '</span>'
      + (sub ? '<span class="s">' + sub + '</span>' : '') + '</div>';
  };
  return '<div class="dv-ap-sum">'
    + cell("بانتظار الاعتماد", _money(r.sumWaiting),
           r.waiting ? (r.waiting + " مستنداً · أقدمُها " + r.oldest + " يوماً") : "لا شيء واقف", "wait b-" + band)
    + cell("عند آخر محطة", String(r.atLast), r.atLast ? "جاهزٌ للاعتماد" : "—", "last")
    + cell("تجاوز مدّته", String(r.overdue), r.overdue ? "يحتاج متابعة" : "الكلّ في وقته", "over" + (r.overdue ? " b-warn" : ""))
    + cell("مرفوض", String(r.rejected), r.rejected ? _money(r.sumRejected) : "—")
    + '</div>';
}

function _aprSummaryHTML(r){
  var band = aprAgeBand(r.submitted ? r.oldest : null);
  var cell = function(lbl, val, sub, cls){
    return '<div class="dv-ap-c' + (cls ? " " + cls : "") + '">'
      + '<span class="l">' + lbl + '</span>'
      + '<span class="v dv-num">' + val + '</span>'
      + (sub ? '<span class="s">' + sub + '</span>' : '') + '</div>';
  };
  return '<div class="dv-ap-sum">'
    + cell("قُدِّم", _money(r.sumSubmitted), r.total + " مستنداً")
    + cell("اعتُمد", _money(r.sumApproved), (r.approved + r.paid) + " معتمداً")
    + cell("الفارق المخصوم", r.variance ? _money(r.variance) : "—",
           r.variance ? "من المعتمَد" : "لا خصم")
    + cell("بانتظار الاعتماد", _money(r.sumWaiting),
           r.submitted ? (r.submitted + " مستنداً · أقدمُها " + r.oldest + " يوماً") : "لا شيء واقف",
           "wait b-" + band)
    + '</div>';
}

function _aprChip(a, today){
  var st = String(a.status || "submitted");
  if(st !== "submitted"){
    return '<span class="dv-chip l-' + (st === "rejected" ? "urgent" : (st === "paid" ? "ok" : "soon")) + '">'
      + _esc(APR_ST_LBL[st] || st) + '</span>';
  }
  /* ذو المسار يقول **أين** هو ومنذ متى — لا كم مضى على تقديمه فقط. */
  if(aprHasPath(a)){
    var i = aprStageAt(a), sd = aprStageDays(a, today), sb = aprStageBand(sd, a.stages[i].days);
    return '<span class="dv-chip l-' + (sb === "crit" ? "expired" : (sb === "warn" ? "urgent" : "plan")) + '" title="المحطة '
      + (i + 1) + ' من ' + a.stages.length + '">'
      + '<span class="dv-num">' + (i + 1) + '/' + a.stages.length + '</span> ' + _esc(a.stages[i].lbl)
      + (sd === null ? "" : (' · ' + sd + ' يوماً')) + '</span>';
  }
  var w = aprDaysWaiting(a, today), b = aprAgeBand(w);
  return '<span class="dv-chip l-' + (b === "crit" ? "expired" : (b === "warn" ? "urgent" : "plan")) + '">'
    + (w === null ? "مُقدَّم" : ("بانتظار " + w + " يوماً")) + '</span>';
}

/* `mode`: "flow" لشاشة المتابعة (المحطةُ ومنذ متى — لا أعمدةَ اعتمادٍ فارغة)،
   و"done" للمعتمدات (تاريخُ الاعتماد والمبلغُ والفارق). */
function _aprTableHTML(list, today, curProj, emptyNote, mode){
  var flow = (mode === "flow");
  if(!list.length){
    if(emptyNote) return '<div class="dv-wrap"><div class="dv-empty">' + emptyNote + '</div></div>';
    var any = _visAprs().filter(function(x){ return !x.archived && (flow ? aprInFlow(x) : aprIsDone(x)); }).length;
    return '<div class="dv-wrap"><div class="dv-empty">'
      + (any ? 'لا مستندَ يطابق الترشيح.<br><button type="button" class="dv-clear" onclick="docVault.clearAprFilters()">امسح الترشيح</button>'
             : (flow
                ? 'لا مستخلصاتٍ قيد الاعتماد.<br>سجّل هنا ما تُقدّمه للعميل — مستخلصاً أو مطالبةً — بتاريخ تقديمه،<br>'
                  + 'فيتتبّع محطاتِ جهته حتى يُعتمَد، ويدخل حينها «المعتمدات» وملفَّ المشروع تلقائياً.'
                : 'لا معتمداتٍ بعد.<br>ما يُعتمَد من شاشة «المستخلصات» يظهر هنا تلقائياً بمبلغه ونسخته المعتمدة.'))
      + '</div></div>';
  }
  var rows = list.map(function(a){
    var fin = aprIsFinancial(a.docType), v = aprVariance(a);
    var sd = flow ? aprStageDays(a, today) : null;
    /* عمودان لزمنين مختلفين (طلبُ المالك): «في المحطة» = منذ دخل محطتَه الحالية،
       و«منذ التقديم» = العمرُ الكامل منذ قُدِّم — وهو ما يُسأل عنه في اجتماع
       المتابعة، ويتلوّن بسلّم الانتظار (٣٠ تذكيرٌ · ٦٠ مطالبة). */
    var dw = flow ? aprDaysWaiting(a, today) : null, dwb = aprAgeBand(dw);
    return '<tr class="dv-row-act" onclick="docVault.openApr(\'' + _jq(a.id) + '\')">'
      + '<td class="dv-num t-name">' + _esc(a.id) + '</td>'
      + '<td class="t-name">' + _esc(a.title || "—") + _projSubHTML(a, curProj) + '</td>'
      + '<td class="t-dim">' + _esc(APR_LBL[a.docType] || "—") + '</td>'
      + '<td class="t-dim">' + _esc(a.party || "—") + '</td>'
      + '<td class="dv-num t-dim">' + _esc(a.submittedAt || "—") + '</td>'
      + (flow ? "" : '<td class="dv-num t-dim">' + _esc(a.approvedAt || "—") + '</td>')
      + '<td class="dv-num">' + (fin ? _money(a.amountSubmitted) : '<span class="dv-none">—</span>') + '</td>'
      + (flow ? ""
              : '<td class="dv-num">' + (fin ? _money(a.amountApproved) : '<span class="dv-none">—</span>') + '</td>'
                + '<td class="dv-num">' + (v ? '<span class="t-warn">' + _money(v) + '</span>' : '<span class="dv-none">—</span>') + '</td>')
      + '<td>' + _aprChip(a, today) + '</td>'
      + (flow ? '<td class="dv-num t-dim">' + (sd === null ? "—" : sd) + '</td>'
              + '<td class="dv-num dv-age' + (dwb === "crit" ? " t-crit" : (dwb === "warn" ? " t-warn" : "")) + '">' + (dw === null ? "—" : dw) + '</td>' : "")
      + '<td class="t-dim">' + ((a.files || []).length ? _icon("paperclip", "ic-sm") : "—") + '</td>'
      + '</tr>';
  }).join("");
  return '<div class="dv-wrap"><table class="dv-tbl dv-ap-tbl' + (flow ? " dv-flow-tbl" : "") + '"><thead><tr>'
    + '<th>الرقم</th><th>المستند</th><th>النوع</th><th>الجهة</th><th>التقديم</th>'
    + (flow ? '<th>المقدَّم</th><th>المحطة</th><th title="أيامٌ منذ دخل محطتَه الحالية">في المحطة</th><th title="أيامٌ منذ تاريخ التقديم">منذ التقديم</th>'
            : '<th>الاعتماد</th><th>المقدَّم</th><th>المعتمد</th><th>الفارق</th><th>الحالة</th>')
    + '<th>نسخة</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function _aprFormHTML(){
  var e = _aEdit, fin = aprIsFinancial(e.docType);
  var types = APR_TYPES.map(function(t){
    return '<option value="' + t.key + '"' + (e.docType === t.key ? " selected" : "") + '>' + _esc(t.lbl) + '</option>';
  }).join("");
  var sts = APR_STATUS.map(function(x){
    return '<option value="' + x.key + '"' + (e.status === x.key ? " selected" : "") + '>' + _esc(x.lbl) + '</option>';
  }).join("");
  var done = (e.status === "approved" || e.status === "paid");
  /* مستندٌ له مسارٌ (أو سيرثه عند الحفظ) لا تُكتب حالتُه بيد */
  var _pp = e.partyId ? partyById(e.partyId) : null;
  var pathed = aprHasPath(e) || (aprTypeHasPath(e.docType) && e.status === "submitted" && !!(_pp && pathNormalize(_pp.stages).length));
  return '<div class="dv-panel">'
    + '<div class="dv-panel-h">' + (e.id ? ("تعديل: " + _esc(e.title || e.id)) : "مستند مُقدَّم جديد") + '</div>'
    + '<div class="dv-panel-s">سجّل ما قدّمتَه للعميل بتاريخ تقديمه — فيُحسَب عمرُ انتظاره تلقائياً. '
      + 'والنسخةُ المعتمدةُ تُرفَع حين تعود.</div>'
    + '<div class="dv-grid">'
    + '<div class="dv-f wide"><label class="dv-l" for="dv-a-title">عنوان المستند <b>*</b></label>'
      + '<input class="form-input" id="dv-a-title" value="' + _esc(e.title || "") + '" placeholder="المستخلص الثالث — أعمال الصيانة"></div>'
    + '<div class="dv-f"><label class="dv-l" for="dv-a-type">النوع</label>'
      + '<select class="form-input" id="dv-a-type" onchange="docVault.setAprType(this.value)">' + types + '</select></div>'
    + '<div class="dv-f"><label class="dv-l" for="dv-a-party-sel">الجهة <b>*</b></label>' + _partyFieldHTML(e) + '</div>'
    + '<div class="dv-f"><label class="dv-l">المشروع</label>' + _projFieldHTML(e, "setAprFormProj", _aprs) + '</div>'
    + '<div class="dv-f"><label class="dv-l" for="dv-a-ourref">رقمنا المرجعي</label>'
      + '<input class="form-input dv-num" id="dv-a-ourref" value="' + _esc(e.ourRef || "") + '" placeholder="LTR-2609-0004 أو رقمٌ يدويّ"></div>'
    + '<div class="dv-f wide"><div class="dv-dates">'
      + '<div class="dv-f"><label class="dv-l" for="dv-a-sub">تاريخ التقديم <b>*</b></label>'
        + '<input class="form-input dv-num" type="date" id="dv-a-sub" value="' + _esc(e.submittedAt || "") + '"></div>'
      + '<div class="dv-f"><label class="dv-l" for="dv-a-app">تاريخ الاعتماد</label>'
        + '<input class="form-input dv-num" type="date" id="dv-a-app" value="' + _esc(e.approvedAt || "") + '"' + (done ? "" : " disabled") + '></div>'
    + '</div></div>'
    + (pathed
        ? '<div class="dv-f wide"><span class="dv-l">الحالة</span><span>' + _esc(APR_ST_LBL[e.status] || e.status)
          + (aprHasPath(e) && e.status === "submitted" ? ' — المحطة <span class="dv-num">' + (aprStageAt(e) + 1) + '/' + e.stages.length + '</span>: ' + _esc(e.stages[aprStageAt(e)].lbl) : "")
          + '</span><div class="dv-hint">الحالةُ تُشتقّ من المسار: تُحرَّك المحطاتُ ويُعتمَد من <b>بطاقة المستند</b>، لا من هنا.</div></div>'
        : '<div class="dv-f wide"><label class="dv-l" for="dv-a-status">الحالة</label>'
          + '<select class="form-input" id="dv-a-status" onchange="docVault.setAprStatus(this.value)">' + sts + '</select></div>')
    + (fin
        ? '<div class="dv-f wide"><div class="dv-dates">'
          + '<div class="dv-f"><label class="dv-l" for="dv-a-amt">المبلغ المقدَّم</label>'
            + '<input class="form-input dv-num" type="number" step="0.01" min="0" id="dv-a-amt" value="' + _esc(e.amountSubmitted || "") + '" placeholder="0.00"></div>'
          + '<div class="dv-f"><label class="dv-l" for="dv-a-apr">المبلغ المعتمد</label>'
            + '<input class="form-input dv-num" type="number" step="0.01" min="0" id="dv-a-apr" value="' + _esc(e.amountApproved || "") + '"' + (done ? "" : " disabled") + ' placeholder="0.00"></div>'
          + '</div><div class="dv-hint">الفارقُ بينهما يُعرض في السجلّ — ولا يُبدّل الحالة: الحالةُ قرارُ الجهة لا نتيجةُ طرح.</div></div>'
        : '<div class="dv-f wide"><div class="dv-hint">' + _esc(APR_LBL[e.docType] || "هذا النوع") + ' بلا مبلغ — الخاناتُ المالية تظهر للمستخلص والمطالبة وأمر التغيير.</div></div>')
    + '<div class="dv-f"><label class="dv-l" for="dv-a-theirref">رقمهم المرجعي</label>'
      + '<input class="form-input" id="dv-a-theirref" value="' + _esc(e.theirRef || "") + '" placeholder="إن أعطوه رقماً"></div>'
    + '<div class="dv-f wide"><label class="dv-l" for="dv-a-notes">ملاحظات</label>'
      + '<textarea class="form-input" id="dv-a-notes" rows="2" placeholder="سببُ الخصم، أو ما ينتظره الاعتماد">' + _esc(e.notes || "") + '</textarea></div>'
    + '<div class="dv-f wide"><label class="dv-l">النسخة المعتمدة والمرفقات</label>'
      + _filesHTML(e.files, "docVault.delAprFile")
      + '<div style="margin-top:7px"><button type="button" class="btn btn-ghost btn-sm" onclick="docVault.addAprFile()">'
      + _icon("paperclip", "ic-sm") + ' إرفاق ملف</button></div></div>'
    + '</div>'
    + '<div class="dv-acts">'
      + '<button type="button" class="btn btn-ghost" onclick="docVault.cancelApr()">إلغاء</button>'
      + '<button type="button" class="btn btn-primary" onclick="docVault.saveApr()">' + _icon("save", "ic-sm") + ' حفظ</button>'
    + '</div></div>';
}

function _aprCardHTML(a, today){
  var fin = aprIsFinancial(a.docType), v = aprVariance(a);
  var row = function(l, x){ return '<div class="dv-f"><span class="dv-l">' + l + '</span><span>' + x + '</span></div>'; };
  return '<div class="dv-panel">'
    + '<div class="dv-head" style="margin-bottom:10px"><div>'
      + '<div class="dv-panel-h">' + _esc(a.title || a.id) + ' ' + _aprChip(a, today) + '</div>'
      + '<div class="dv-panel-s dv-num" style="margin-bottom:0">' + _esc(a.id) + '</div>'
    + '</div><div style="display:flex;gap:8px;flex-wrap:wrap">'
      + '<button type="button" class="btn btn-ghost btn-sm" onclick="docVault.backToApr()">' + _icon("rotateCcw", "ic-sm") + ' رجوع</button>'
      + (canEdit() ? '<button type="button" class="btn btn-ghost btn-sm" onclick="docVault.editApr(\'' + _jq(a.id) + '\')">' + _icon("edit", "ic-sm") + ' تعديل</button>' : "")
      + (canDelete() ? '<button type="button" class="btn btn-delete btn-sm" onclick="docVault.delApr(\'' + _jq(a.id) + '\')">' + _icon("trash", "ic-sm") + '</button>' : "")
    + '</div></div>'
    + _pathStepperHTML(a, today)
    + (_pAct && _pAct.id === a.id ? _pathActFormHTML(a) : _pathActionsHTML(a))
    + '<div class="dv-grid">'
      + row("النوع", _esc(APR_LBL[a.docType] || "—"))
      + row("الجهة", _esc(a.party || "—"))
      + row("المشروع", _projChipHTML(a))
      + (a.ourRef ? row("رقمنا المرجعي", '<span class="dv-num">' + _esc(a.ourRef) + '</span>') : "")
      + (a.theirRef ? row("رقمهم المرجعي", _esc(a.theirRef)) : "")
      + row("تاريخ التقديم", '<span class="dv-num">' + _esc(a.submittedAt || "—") + '</span>')
      + row("تاريخ الاعتماد", '<span class="dv-num">' + _esc(a.approvedAt || "—") + '</span>')
      + (fin ? row("المبلغ المقدَّم", '<span class="dv-num">' + _money(a.amountSubmitted) + '</span>') : "")
      + (fin ? row("المبلغ المعتمد", '<span class="dv-num">'
          + ((a.status === "approved" || a.status === "paid") ? _money(a.amountApproved) : "—") + '</span>') : "")
      + (v !== null && v !== 0 ? row("الفارق المخصوم", '<span class="dv-num t-warn">' + _money(v) + '</span>') : "")
      + (a.notes ? '<div class="dv-f wide"><span class="dv-l">ملاحظات</span><span>' + _esc(a.notes) + '</span></div>' : "")
      + '<div class="dv-f wide"><span class="dv-l">النسخة المعتمدة والمرفقات</span>' + _filesHTML(a.files, null)
      + ((a.status === "approved" || a.status === "paid") && !(a.files || []).length
          ? '<div class="dv-hint t-warn">⚠ معتمدٌ بلا نسخةٍ معتمدةٍ مرفقة — أرفقها من «تعديل».</div>' : "")
      + '</div>'
      + _pathLogHTML(a)
    + '</div></div>';
}

/* ════════ المسارُ على البطاقة — شريطُ محطات · أفعالٌ · سجلّ ════════ */
var PARTY_FREE = "__free";     // خيارُ «جهة أخرى» في منتقي الجهة

function _dayWord(n){ n = Number(n) || 0; return n === 1 ? "يوم" : (n === 2 ? "يومان" : (n <= 10 ? n + " أيام" : n + " يوماً")); }

function _pathStepperHTML(a, today){
  if(!aprHasPath(a)) return "";
  var cur = aprStageAt(a), st = String(a.status || "submitted");
  var sd = aprStageDays(a, today), band = aprStageBand(sd, a.stages[cur].days);
  var items = a.stages.map(function(s, i){
    var cls = "todo";
    if(st === "approved" || st === "paid") cls = "done";
    else if(i < cur) cls = "done";
    else if(i === cur) cls = (st === "rejected") ? "rej" : ("cur b-" + band);
    var sub = "";
    if(cls.indexOf("cur") === 0){
      sub = (sd === null ? "" : ("منذ " + _dayWord(sd)))
          + (s.days ? (" · المتوقّع " + _dayWord(s.days)) : "");
    } else if(s.days) sub = _dayWord(s.days);
    return '<li class="dv-path-s ' + cls + '" title="' + _esc(s.lbl) + '">'
      + '<span class="n dv-num">' + (cls === "done" ? "✓" : (i + 1)) + '</span>'
      + '<span class="lbl">' + _esc(s.lbl) + '</span>'
      + (sub ? '<span class="d">' + sub + '</span>' : "")
      + '</li>';
  }).join("");
  var rc = aprReturnCount(a);
  var head = (st === "submitted")
    ? ('المحطة <b class="dv-num">' + (cur + 1) + '</b> من <b class="dv-num">' + a.stages.length + '</b> — ' + _esc(a.stages[cur].lbl)
       + (rc ? ' · <span class="t-warn">أُعيد للتصحيح ' + (rc === 1 ? "مرّة" : (rc === 2 ? "مرّتين" : rc + " مرّات")) + '</span>' : ""))
    : ('اكتمل المسار — ' + _esc(APR_ST_LBL[st] || st));
  return '<div class="dv-path' + (st === "submitted" ? "" : " fin") + '">'
    + '<div class="dv-path-h">' + _icon("map", "ic-sm") + ' مسار الاعتماد' + (a.party ? ' — ' + _esc(a.party) : "") + '<span class="dv-path-cur">' + head + '</span></div>'
    + '<div class="dv-wrap"><ol class="dv-path-track">' + items + '</ol></div>'
    + '</div>';
}

function _pathLogHTML(a){
  var log = Array.isArray(a && a.stageLog) ? a.stageLog.slice().reverse() : [];
  if(!log.length) return "";
  var rows = log.map(function(e){
    var mv = "";
    if(e.kind === "forward" || e.kind === "back") mv = _esc(e.fromLbl || "—") + ' ← ' + _esc(e.toLbl || "—");
    else if(e.kind === "start") mv = _esc(e.toLbl || "—");
    else mv = _esc(e.toLbl || e.fromLbl || "—");
    return '<tr' + (e.kind === "back" ? ' class="dv-log-back"' : (e.kind === "reject" ? ' class="dv-log-rej"' : "")) + '>'
      + '<td class="dv-num t-dim">' + _esc(e.at || "—") + '</td>'
      + '<td class="t-name">' + _esc(STAGE_KINDS[e.kind] || e.kind || "—") + '</td>'
      + '<td>' + mv + '</td>'
      + '<td class="t-dim">' + _esc(e.by || "—") + '</td>'
      + '<td>' + (e.note ? _esc(e.note) : '<span class="dv-none">—</span>') + '</td></tr>';
  }).join("");
  return '<div class="dv-f wide"><span class="dv-l">سجلّ الحركة</span>'
    + '<div class="dv-wrap"><table class="dv-tbl dv-log-tbl"><thead><tr>'
    + '<th>التاريخ</th><th>الحركة</th><th>المحطة</th><th>بواسطة</th><th>ملاحظة</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}

/* أزرارُ الحركة — ما يجوز الآن وحدَه يُعرض: عند آخر محطةٍ «اعتماد» لا «التالية». */
function _pathActionsHTML(a){
  if(!canEdit()) return "";
  var st = String(a.status || "submitted"), b = [];
  var btn = function(kind, lbl, cls, ic){
    return '<button type="button" class="btn ' + cls + ' btn-sm" onclick="docVault.startAct(\'' + _jq(a.id) + '\',\'' + kind + '\')">'
      + (ic ? _icon(ic, "ic-sm") + ' ' : "") + lbl + '</button>';
  };
  if(st === "submitted"){
    if(aprHasPath(a)){
      var i = aprStageAt(a), last = (i === a.stages.length - 1);
      if(!last) b.push(btn("forward", "انتقل إلى: " + _esc(a.stages[i + 1].lbl), "btn-primary", "send"));
      else b.push(btn("approve", "اعتماد", "btn-primary", "checkCircle"));
      if(a.stages.length > 1) b.push(btn("back", "أُعيد للتصحيح", "btn-ghost", "rotateCcw"));
    } else {
      b.push(btn("approve", "اعتماد", "btn-primary", "checkCircle"));
    }
    b.push(btn("reject", "رفض نهائيّ", "btn-ghost", "xCircle"));
  } else if(st === "approved"){
    b.push(btn("paid", "تسجيل السداد", "btn-primary", "banknote"));
  }
  return b.length ? '<div class="dv-path-acts">' + b.join("") + '</div>' : "";
}

/* نموذجُ الفعل الجاري — حقولُه بحسب نوعه، ولا شيءَ يُحفَظ قبل «تأكيد». */
function _pathActFormHTML(a){
  var x = _pAct; if(!x || x.id !== a.id) return "";
  var fin = aprIsFinancial(a.docType), cur = aprStageAt(a);
  var ttl = { forward:"الانتقال إلى المحطة التالية", back:"إعادةٌ للتصحيح", approve:"اعتمادُ المستند",
              reject:"رفضٌ نهائيّ", paid:"تسجيلُ السداد" }[x.kind] || "";
  var h = '<div class="dv-act"><div class="dv-act-h">' + ttl + '</div><div class="dv-grid">';
  if(x.kind === "back"){
    var opts = a.stages.map(function(s, i){
      return i === cur ? "" : '<option value="' + i + '"' + (Number(x.to) === i ? " selected" : "") + '>' + (i + 1) + ' — ' + _esc(s.lbl) + '</option>';
    }).join("");
    h += '<div class="dv-f"><label class="dv-l" for="dv-act-to">إلى المحطة <b>*</b></label>'
       + '<select class="form-input" id="dv-act-to">' + opts + '</select></div>';
  }
  h += '<div class="dv-f"><label class="dv-l" for="dv-act-at">التاريخ <b>*</b></label>'
     + '<input class="form-input dv-num" type="date" id="dv-act-at" value="' + _esc(x.at || "") + '"></div>';
  if(x.kind === "approve" && fin){
    h += '<div class="dv-f"><label class="dv-l" for="dv-act-amt">المبلغ المعتمد <b>*</b></label>'
       + '<input class="form-input dv-num" type="number" step="0.01" min="0" id="dv-act-amt" value="' + _esc(x.amt || "") + '" placeholder="0.00">'
       + '<div class="dv-hint">المقدَّم <span class="dv-num">' + _money(a.amountSubmitted) + '</span> — والفارقُ يُعرض في السجلّ ولا يُبدّل الحالة.</div></div>';
  }
  var noteReq = (x.kind === "back" || x.kind === "reject");
  h += '<div class="dv-f wide"><label class="dv-l" for="dv-act-note">' + (noteReq ? "السبب <b>*</b>" : "ملاحظة") + '</label>'
     + '<textarea class="form-input" id="dv-act-note" rows="2" placeholder="' + (noteReq ? "ما الذي طُلب تصحيحه؟" : "اختياريّ") + '">' + _esc(x.note || "") + '</textarea></div>';
  if(x.kind === "approve"){
    h += '<div class="dv-f wide"><label class="dv-l">النسخة المعتمدة</label>'
       + _filesHTML(x.files, "docVault.delActFile")
       + '<div style="margin-top:7px"><button type="button" class="btn btn-ghost btn-sm" onclick="docVault.addActFile()">'
       + _icon("paperclip", "ic-sm") + ' إرفاق النسخة المعتمدة</button></div>'
       + (x.files.length ? "" : '<div class="dv-hint">يُستحسن رفعُها الآن — يمكن إرفاقُها لاحقاً من «تعديل».</div>') + '</div>';
  }
  h += '</div><div class="dv-acts">'
     + '<button type="button" class="btn btn-ghost btn-sm" onclick="docVault.cancelAct()">إلغاء</button>'
     + '<button type="button" class="btn btn-primary btn-sm" onclick="docVault.commitAct()">' + _icon("checkCircle", "ic-sm") + ' تأكيد</button>'
     + '</div></div>';
  return h;
}

function startAct(id, kind){
  if(!canEdit()){ _toast("🔒 لا صلاحية","warn"); return; }
  var a = approvalById(id); if(!a) return;
  var cur = aprStageAt(a);
  _pAct = { id:id, kind:String(kind || ""), to:(cur > 0 ? cur - 1 : ""), note:"",
            amt:"", at:new Date().toISOString().slice(0,10), files:[] };
  renderApprovals();
  try{ var el = document.querySelector(".dv-act"); if(el && el.scrollIntoView) el.scrollIntoView({ block:"center" }); }catch(e){}
}
function cancelAct(){ _pAct = null; renderApprovals(); }
function _readActForm(){
  if(!_pAct) return;
  var g = function(id){ var el = document.getElementById(id); return el ? String(el.value || "").trim() : null; };
  var v;
  if((v = g("dv-act-to"))   !== null) _pAct.to = v;
  if((v = g("dv-act-at"))   !== null) _pAct.at = v;
  if((v = g("dv-act-amt"))  !== null) _pAct.amt = v;
  if((v = g("dv-act-note")) !== null) _pAct.note = v;
}
function addActFile(){
  if(!_pAct) return;
  _readActForm();
  var id = _pAct.id;
  _pickFile(function(f){
    _toast("⏳ جارٍ الرفع…", "");
    _upload("apr", id, f).then(function(rec){
      if(_pAct && _pAct.id === id){ _pAct.files = (_pAct.files || []).concat([rec]); renderApprovals(); }
      _toast("✅ أُرفق الملف", "success");
    }).catch(function(e){ _toast("⚠ تعذّر الرفع: " + String((e && e.message) || e), "warn"); });
  });
}
function delActFile(i){ if(!_pAct) return; _readActForm(); (_pAct.files || []).splice(i, 1); renderApprovals(); }

function commitAct(){
  if(!_pAct) return;
  if(!canEdit()){ _toast("🔒 لا صلاحية","warn"); return; }
  _readActForm();
  var a = approvalById(_pAct.id);
  if(!a){ _pAct = null; renderApprovals(); return; }
  var o = { at:_pAct.at, by:_myName(), note:_pAct.note, amountApproved:_pAct.amt };
  if(!o.at){ _toast("⚠ أدخل التاريخ","warn"); return; }
  var patch = null, k = _pAct.kind, why = "";
  if(k === "forward"){ patch = aprAdvance(a, o); why = "لا محطةَ بعد هذه — الاعتمادُ من هنا"; }
  else if(k === "back"){ patch = aprReturnTo(a, _pAct.to, o); why = "اخترِ المحطةَ واكتب السبب"; }
  else if(k === "approve"){ patch = aprApprove(a, o); why = aprIsFinancial(a.docType) ? "أدخل المبلغَ المعتمد — والتاريخُ لا يسبق التقديم" : "الاعتمادُ من آخر محطةٍ وحدَها"; }
  else if(k === "reject"){ patch = aprReject(a, o); why = "اكتب سببَ الرفض"; }
  else if(k === "paid"){ patch = aprMarkPaid(a, o); why = "السدادُ للمعتمَد وحدَه"; }
  if(!patch){ _toast("⚠ " + why, "warn"); return; }
  var d = _db(); if(!d){ _toast("⚠ لا اتصال بقاعدة البيانات","warn"); return; }
  patch.updatedAt = new Date().toISOString(); patch.updatedBy = _myName();
  if(k === "approve" && _pAct.files.length) patch.files = (a.files || []).concat(_pAct.files);
  var lbl = STAGE_KINDS[k] || k;
  d.collection(APRS_COLL()).doc(a.id).set(patch, { merge:true }).then(function(){
    _audit("مسار الاعتماد: " + lbl, a.id + " — " + (a.title || "") + (o.note ? " — " + o.note : ""));
    _pAct = null; renderApprovals();
    _toast(k === "approve" ? "✅ اعتُمد — ودخل معتمداتِ المشروع" : "✅ " + lbl, "success");
  }).catch(function(e){ _toast("⚠ تعذّر الحفظ: " + String((e && e.message) || e), "warn"); });
}

/* ════════ منتقي الجهة في النموذج ════════ */
function _partyFieldHTML(e){
  var html = '';
  if(_parties.length){
    var sel = e.partyId && partyById(e.partyId) ? e.partyId : PARTY_FREE;
    var opts = _parties.map(function(p){
      var n = pathNormalize(p.stages).length;
      return '<option value="' + _esc(p.id) + '"' + (sel === p.id ? " selected" : "") + '>' + _esc(p.name || p.id)
        + (n ? ' — ' + n + ' محطات' : ' — بلا مسار') + '</option>';
    }).join("");
    opts += '<option value="' + PARTY_FREE + '"' + (sel === PARTY_FREE ? " selected" : "") + '>— جهة أخرى (اكتب اسمها) —</option>';
    html += '<select class="form-input" id="dv-a-party-sel" onchange="docVault.setAprParty(this.value)">' + opts + '</select>';
    if(sel === PARTY_FREE){
      html += '<input class="form-input" id="dv-a-party" style="margin-top:6px" value="' + _esc(e.party || "") + '" placeholder="اسم الجهة">';
    }
  } else {
    html += '<input class="form-input" id="dv-a-party" value="' + _esc(e.party || "") + '" placeholder="وكالة الأنباء السعودية">';
  }
  /* تلميحُ المسار — ما سيحدث عند الحفظ، قبل أن يحدث */
  var p = e.partyId ? partyById(e.partyId) : null, n = p ? pathNormalize(p.stages).length : 0;
  if(aprHasPath(e)){
    html += '<div class="dv-hint">المسارُ مثبَّتٌ على المستند (' + e.stages.length + ' محطات) — يُحرَّك من بطاقته لا من هنا.</div>';
  } else if(!aprTypeHasPath(e.docType)){
    html += '<div class="dv-hint">' + _esc(APR_LBL[e.docType] || "هذا النوع") + ' بلا مسارِ اعتماد — الحالةُ تُكتب بيدك.</div>';
  } else if(p && n){
    html += '<div class="dv-hint">سيُثبَّت عليه مسارُ «' + _esc(p.name) + '» (' + n + ' محطات) عند الحفظ — والاعتمادُ من آخر محطةٍ في بطاقته.</div>';
  } else if(p){
    html += '<div class="dv-hint">هذه الجهةُ بلا مسارٍ محدَّد — <a href="#" onclick="docVault.togglePartyPanel();return false">عرّف مسارَها</a> أو تُكتب الحالةُ بيدك.</div>';
  } else if(!_parties.length){
    html += '<div class="dv-hint">لا جهاتٍ مسجَّلةً بعد — <a href="#" onclick="docVault.togglePartyPanel();return false">سجّل الجهاتِ ومساراتها</a> ليتتبّع المستخلصُ محطاتِه.</div>';
  }
  return html;
}
function setAprParty(v){
  if(!_aEdit) return;
  _readAprForm();
  _aEdit.partyId = (String(v || "") === PARTY_FREE) ? "" : String(v || "");
  var p = _aEdit.partyId ? partyById(_aEdit.partyId) : null;
  if(p) _aEdit.party = String(p.name || "");
  renderApprovals();
}

/* ════════ لوحةُ الجهات ومساراتها ════════ */
function _partiesPanelHTML(){
  var h = '<div class="dv-panel" style="margin-top:14px">'
    + '<div class="dv-head" style="margin-bottom:6px"><div>'
    + '<div class="dv-panel-h">' + _icon("map", "ic-sm") + ' الجهات ومسارات اعتمادها</div>'
    + '<div class="dv-panel-s">لكلّ جهةٍ محطاتُها بترتيبها ومدّةٍ متوقّعةٍ لكلّ محطة. '
      + 'المستندُ الجديدُ يرث <b>نسخةً</b> من مسار جهته عند حفظه، فتعديلُ المسار هنا يسري على ما يُسجَّل بعده لا على ما مضى.</div>'
    + '</div><div style="display:flex;gap:8px;flex-wrap:wrap">'
    + '<button type="button" class="btn btn-ghost btn-sm" onclick="docVault.togglePartyPanel()">' + _icon("rotateCcw", "ic-sm") + ' رجوع</button>'
    + (canEdit() && !_pEdit ? '<button type="button" class="btn btn-primary btn-sm" onclick="docVault.newParty()">' + _icon("plus", "ic-sm") + ' جهة جديدة</button>' : "")
    + '</div></div>';
  if(_pEdit) h += _partyFormHTML();
  else if(!_parties.length){
    h += '<div class="dv-empty">لا جهاتٍ بعد.'
      + (canEdit() ? '<br><button type="button" class="dv-clear" onclick="docVault.seedTemplateParty()">أضِف «' + _esc(PATH_TEMPLATE_NAME) + '» بمسارها النموذجيّ (' + PATH_TEMPLATE.length + ' محطة)</button>' : "")
      + '</div>';
  } else {
    h += '<div class="dv-party-grid">' + _parties.map(function(p){
      var st = pathNormalize(p.stages);
      var chips = st.map(function(s, i){ return '<span class="dv-party-st"><span class="dv-num">' + (i + 1) + '</span> ' + _esc(s.lbl) + (s.days ? ' <span class="t-dim dv-num">' + s.days + 'ي</span>' : "") + '</span>'; }).join('<span class="dv-party-arr">←</span>');
      var used = _visAprs().filter(function(a){ return !a.archived && a.partyId === p.id; }).length;
      return '<div class="dv-party">'
        + '<div class="dv-party-h"><b>' + _esc(p.name || p.id) + '</b>'
        + '<span class="t-dim">' + (st.length ? st.length + ' محطات' : 'بلا مسار') + (used ? ' · ' + used + ' مستنداً' : "") + '</span>'
        + '<span style="margin-inline-start:auto;display:flex;gap:6px">'
        + (canEdit() ? '<button type="button" class="btn btn-ghost btn-sm" onclick="docVault.editParty(\'' + _jq(p.id) + '\')">' + _icon("edit", "ic-sm") + ' تعديل</button>' : "")
        + (canDelete() ? '<button type="button" class="btn btn-delete btn-sm" onclick="docVault.delParty(\'' + _jq(p.id) + '\')">' + _icon("trash", "ic-sm") + '</button>' : "")
        + '</span></div>'
        + (chips ? '<div class="dv-party-path">' + chips + '</div>' : '<div class="dv-hint">بلا محطات — الحالةُ لمستنداتها تُكتب بيدك.</div>')
        + '</div>';
    }).join("") + '</div>';
  }
  return h + '</div>';
}

function _partyFormHTML(){
  var e = _pEdit;
  var rows = e.stages.map(function(s, i){
    return '<div class="dv-stg">'
      + '<span class="dv-num t-dim dv-stg-n">' + (i + 1) + '</span>'
      + '<input class="form-input" id="dv-p-lbl-' + i + '" value="' + _esc(s.lbl || "") + '" placeholder="اسم المحطة">'
      + '<input class="form-input dv-num dv-stg-d" type="number" min="0" step="1" id="dv-p-days-' + i + '" value="' + _esc(s.days || "") + '" placeholder="أيام" title="المدّة المتوقّعة بالأيام">'
      + '<button type="button" class="dv-stg-b" title="أعلى" onclick="docVault.partyMoveStage(' + i + ',-1)"' + (i === 0 ? " disabled" : "") + '>↑</button>'
      + '<button type="button" class="dv-stg-b" title="أسفل" onclick="docVault.partyMoveStage(' + i + ',1)"' + (i === e.stages.length - 1 ? " disabled" : "") + '>↓</button>'
      + '<button type="button" class="dv-stg-b del" title="حذف" onclick="docVault.partyDelStage(' + i + ')">×</button>'
      + '</div>';
  }).join("");
  return '<div class="dv-grid">'
    + '<div class="dv-f wide"><label class="dv-l" for="dv-p-name">اسم الجهة <b>*</b></label>'
      + '<input class="form-input" id="dv-p-name" value="' + _esc(e.name || "") + '" placeholder="أمانة حائل"></div>'
    + '<div class="dv-f wide"><label class="dv-l">محطات المسار — بترتيبها من التقديم إلى الاعتماد</label>'
      + (rows || '<div class="dv-hint">لا محطات بعد — أضِف الأولى، أو ابدأ من المسار النموذجيّ.</div>')
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">'
      + '<button type="button" class="btn btn-ghost btn-sm" onclick="docVault.partyAddStage()">' + _icon("plus", "ic-sm") + ' محطة</button>'
      + '<button type="button" class="btn btn-ghost btn-sm" onclick="docVault.partyUseTemplate()">' + _icon("repeat", "ic-sm") + ' ابدأ من المسار النموذجيّ (' + _esc(PATH_TEMPLATE_NAME) + ')</button>'
      + '</div>'
      + '<div class="dv-hint">المدّةُ المتوقّعة تُلوّن المحطةَ حين تُتجاوَز ولا تُنبّه أحداً. اتركها فارغةً إن لم تُعرف.</div></div>'
    + '</div>'
    + '<div class="dv-acts">'
      + '<button type="button" class="btn btn-ghost" onclick="docVault.cancelParty()">إلغاء</button>'
      + '<button type="button" class="btn btn-primary" onclick="docVault.saveParty()">' + _icon("save", "ic-sm") + ' حفظ الجهة</button>'
    + '</div>';
}

function togglePartyPanel(){
  if(!canView()) return;
  _pPanel = !_pPanel; _pEdit = null;
  if(_pPanel){ _aEdit = null; _aview.open = null; }
  renderApprovals(); _top();
}
function newParty(){
  if(!canEdit()){ _toast("🔒 لا صلاحية","warn"); return; }
  _pPanel = true; _pEdit = { id:"", name:"", stages:[] }; renderApprovals();
}
function editParty(id){
  if(!canEdit()){ _toast("🔒 لا صلاحية","warn"); return; }
  var p = partyById(id); if(!p) return;
  _pPanel = true;
  _pEdit = { id:p.id, name:String(p.name || ""), stages:pathNormalize(p.stages).map(function(s){ return { lbl:s.lbl, days:s.days || "" }; }) };
  renderApprovals();
}
function cancelParty(){ _pEdit = null; renderApprovals(); }
function _readPartyForm(){
  if(!_pEdit) return;
  var g = function(id){ var el = document.getElementById(id); return el ? String(el.value || "").trim() : null; };
  var v = g("dv-p-name"); if(v !== null) _pEdit.name = v;
  _pEdit.stages.forEach(function(s, i){
    var l = g("dv-p-lbl-" + i), d = g("dv-p-days-" + i);
    if(l !== null) s.lbl = l;
    if(d !== null) s.days = d;
  });
}
function partyAddStage(){ if(!_pEdit) return; _readPartyForm(); _pEdit.stages.push({ lbl:"", days:"" }); renderApprovals();
  try{ var el = document.getElementById("dv-p-lbl-" + (_pEdit.stages.length - 1)); if(el) el.focus(); }catch(e){} }
function partyDelStage(i){ if(!_pEdit) return; _readPartyForm(); _pEdit.stages.splice(i, 1); renderApprovals(); }
function partyMoveStage(i, dir){
  if(!_pEdit) return; _readPartyForm();
  var j = i + dir; if(j < 0 || j >= _pEdit.stages.length) return;
  var t = _pEdit.stages[i]; _pEdit.stages[i] = _pEdit.stages[j]; _pEdit.stages[j] = t;
  renderApprovals();
}
function partyUseTemplate(){
  if(!_pEdit) return; _readPartyForm();
  var go = function(){
    _pEdit.stages = PATH_TEMPLATE.map(function(s){ return { lbl:s.lbl, days:s.days }; });
    if(!_pEdit.name) _pEdit.name = PATH_TEMPLATE_NAME;
    renderApprovals();
  };
  if(!_pEdit.stages.length){ go(); return; }
  _confirm({ title:"استبدال المحطات", icon:"↺", okText:"استبدل", okClass:"btn-primary",
    msg:"ستُستبدَل المحطاتُ الحالية (" + _pEdit.stages.length + ") بالمسار النموذجيّ (" + PATH_TEMPLATE.length + " محطة)." })
    .then(function(ok){ if(ok) go(); }).catch(function(){});
}
function _savePartyDoc(body, id){
  var d = _db(); if(!d) return Promise.reject(new Error("no-db"));
  var now = new Date().toISOString(), me = _myName();
  body.updatedAt = now; body.updatedBy = me;
  if(id) return d.collection(PARTIES_COLL()).doc(id).set(body, { merge:true }).then(function(){ return id; });
  return _nextId("PRT", PARTIES_CTR()).then(function(nid){
    body.createdAt = now; body.createdBy = me;
    return d.collection(PARTIES_COLL()).doc(nid).set(body).then(function(){ return nid; });
  });
}
function saveParty(){
  if(!canEdit()){ _toast("🔒 لا صلاحية","warn"); return; }
  if(!_pEdit) return;
  _readPartyForm();
  var name = String(_pEdit.name || "").trim();
  if(!name){ _toast("⚠ أدخل اسم الجهة","warn"); return; }
  var st = pathNormalize(_pEdit.stages);
  var dup = _parties.some(function(p){ return p.id !== _pEdit.id && String(p.name || "").trim().toLowerCase() === name.toLowerCase(); });
  if(dup){ _toast("⚠ جهةٌ بهذا الاسم مسجَّلةٌ فعلاً","warn"); return; }
  var was = _pEdit.id;
  _savePartyDoc({ name:name, stages:st }, was).then(function(id){
    _audit(was ? "تعديل مسار جهة" : "تسجيل جهة ومسارها", id + " — " + name + " (" + st.length + " محطات)");
    _pEdit = null; renderApprovals();
    _toast(was ? "✅ حُفظ المسار — يسري على ما يُسجَّل بعده" : "✅ سُجّلت الجهة برقم " + id, "success");
  }).catch(function(e){ _toast("⚠ تعذّر الحفظ: " + String((e && e.message) || e), "warn"); });
}
function seedTemplateParty(){
  if(!canEdit()){ _toast("🔒 لا صلاحية","warn"); return; }
  if(_parties.length){ _toast("⚠ السجلُّ ليس فارغاً — أضِف الجهةَ من «جهة جديدة»","warn"); return; }
  _savePartyDoc({ name:PATH_TEMPLATE_NAME, stages:pathNormalize(PATH_TEMPLATE) }, "").then(function(id){
    _audit("تسجيل جهة ومسارها", id + " — " + PATH_TEMPLATE_NAME + " (نموذجيّ)");
    _toast("✅ أُضيفت «" + PATH_TEMPLATE_NAME + "» بمسارها — عدّله كما تشاء", "success");
  }).catch(function(e){ _toast("⚠ تعذّر الحفظ: " + String((e && e.message) || e), "warn"); });
}
function delParty(id){
  if(!canDelete()){ _toast("🔒 الحذف من صلاحية مدير النظام","warn"); return; }
  var p = partyById(id); if(!p) return;
  var used = _aprs.filter(function(a){ return !a.archived && a.partyId === id; }).length;
  _confirm({ title:"حذف جهة", icon:"🗑", okText:"حذف", okClass:"btn-danger",
    msg:'ستُحذف "' + (p.name || id) + '" من سجلّ الجهات.' + (used ? ' المستنداتُ المربوطةُ بها (' + used + ') تحتفظ بنسخة مسارها ولا تتأثّر.' : "") })
    .then(function(ok){
      if(!ok) return;
      var d = _db(); if(!d) return;
      d.collection(PARTIES_COLL()).doc(id).delete().then(function(){
        _audit("حذف جهة من سجلّ المسارات", id + " — " + (p.name || ""));
        _toast("✅ حُذفت", "success");
      }).catch(function(e){ _toast("⚠ تعذّر الحذف: " + String((e && e.message) || e), "warn"); });
    }).catch(function(){});
}

/* الشاشتان تتشاركان النموذجَ والبطاقةَ والأفعال، وتختلفان في **ما يُعرض**:
   «المستخلصات» = ما في مساره (ولوحةُ الجهات وزرُّ الإضافة معها، فهي بابُ الدخول)،
   و«المعتمدات» = ما اعتُمد. والصفحةُ النشطةُ هي التي تُرسَم. */
function _aprPageActive(){ return _isActive(PAGE_EXTRACTS) ? PAGE_EXTRACTS : PAGE_APPROVALS; }
function _curAprView(){ return _isActive(PAGE_EXTRACTS) ? _xview : _aview; }
function renderApprovals(){ _renderAprPage(_aprPageActive()); }

function _renderAprPage(pid){
  var host = document.getElementById("page-" + pid);
  if(!host) return;
  if(!canView()){ host.innerHTML = '<div class="dv-empty">🔒 خزانة الوثائق غير متاحة لحسابك.</div>'; return; }
  var flow = (pid === PAGE_EXTRACTS), view = flow ? _xview : _aview;
  var today = new Date();
  var head = '<div class="dv-head"><div>'
    + (flow
        ? '<h2 class="dv-ttl">' + _icon("receipt") + ' خزانة الوثائق — المستخلصات</h2>'
          + '<div class="dv-sub">ما قدّمناه للعميل وما زال في مساره: كلُّ مستخلصٍ ومطالبةٍ بمحطته الحالية ومنذ متى. '
          + 'ما يُعتمَد من هنا يدخل «المعتمدات» وملفَّ المشروع تلقائياً.</div>'
        : '<h2 class="dv-ttl">' + _icon("clipboardCheck") + ' خزانة الوثائق — المعتمدات</h2>'
          + '<div class="dv-sub">ما اعتُمد فعلاً من مستخلصاتٍ ومطالباتٍ وخطابات، بمبلغه ونسخته المعتمدة. '
          + 'ما زال في مساره تجده في «المستخلصات».</div>')
    + '</div><div style="display:flex;gap:8px;flex-wrap:wrap">'
    + (flow
        ? '<button type="button" class="btn btn-ghost btn-sm' + (_pPanel ? " on" : "") + '" onclick="docVault.togglePartyPanel()">' + _icon("map", "ic-sm") + ' الجهات ومساراتها'
            + (_parties.length ? ' <span class="dv-cnt">' + _parties.length + '</span>' : "") + '</button>'
          + (canEdit() ? '<button type="button" class="btn btn-primary btn-sm" onclick="docVault.newApr()">' + _icon("plus", "ic-sm") + ' مستند مُقدَّم</button>' : "")
        : '<button type="button" class="btn btn-ghost btn-sm" onclick="docVault.openExtracts()">' + _icon("receipt", "ic-sm") + ' المستخلصات قيد الاعتماد'
            + (function(){ var n = filterFlow(_visAprs()).filter(function(x){ return !x.archived; }).length; return n ? ' <span class="dv-cnt">' + n + '</span>' : ""; })() + '</button>')
    + '</div></div>';

  if(!_aprsLoaded){ host.innerHTML = head + '<div class="dv-empty">جارٍ التحميل…</div>'; return; }
  view.proj = _seedProj(view.proj);
  var _avis = _visAprs();

  var body;
  if(_pPanel){ body = _partiesPanelHTML(); }
  else if(_aEdit){ body = _aprFormHTML(); }
  else if(_aview.open){
    var a = approvalById(_aview.open);
    body = a ? _aprCardHTML(a, today) : '<div class="dv-empty">لم يعد هذا المستند موجوداً.</div>';
  } else {
    var types = APR_TYPES.map(function(t){
      return '<option value="' + t.key + '"' + (view.type === t.key ? " selected" : "") + '>' + _esc(t.lbl) + '</option>';
    }).join("");
    var sts = APR_STATUS.filter(function(x){ return flow ? (x.key === "submitted" || x.key === "rejected") : (x.key === "approved" || x.key === "paid"); }).map(function(x){
      return '<option value="' + x.key + '"' + (view.status === x.key ? " selected" : "") + '>' + _esc(x.lbl) + '</option>';
    }).join("");
    var dirty = view.q || view.type || view.status || view.proj;
    var bar = '<div class="dv-bar">'
      + '<input class="form-input dv-search" type="search" placeholder="ابحث بالعنوان أو الجهة أو المشروع أو الرقم…"'
      + ' value="' + _esc(view.q) + '" oninput="docVault.setAprFilter(\'q\',this.value)">'
      + _projFilterHTML(view.proj, "setAprProj", _avis)
      + '<select class="form-input" onchange="docVault.setAprFilter(\'type\',this.value)"><option value="">كل الأنواع</option>' + types + '</select>'
      + '<select class="form-input" onchange="docVault.setAprFilter(\'status\',this.value)"><option value="">كل الحالات</option>' + sts + '</select>'
      + (dirty ? '<button type="button" class="dv-clear" onclick="docVault.clearAprFilters()">مسح الترشيح</button>' : "")
      + '</div>';
    var scoped = flow ? filterFlow(_avis) : filterDone(_avis);
    var list = sortApprovals(filterApprovals(scoped, view, today), today);
    /* الحصيلةُ تتبع المُرشِّح: «كم مالٌ واقفٌ» سؤالٌ يُسأل عن مشروعٍ بعينه كما يُسأل
       عن الشركة كلِّها — ورقمُ الشركة فوق جدولِ مشروعٍ واحدٍ يُقرأ على أنّه رقمُه. */
    var scopedProj = filterApprovals(scoped, { proj:view.proj }, today);
    body = _readerLockNoticeHTML() + _unlinkedNoticeHTML(_avis, "setAprProj", view.proj)
         + (flow ? _flowSummaryHTML(aprFlowRollup(scopedProj, today)) : _doneSummaryHTML(aprRollup(scopedProj, today)))
         + bar + _aprTableHTML(list, today, view.proj, "", flow ? "flow" : "done");
  }
  host.innerHTML = head + body;
}
function openExtracts(){ try{ showPage(PAGE_EXTRACTS); }catch(e){} }

function _repaint(page){
  /* ملفُّ المشروع يقرأ السجلّاتِ الثلاثةَ كلَّها، فأيُّ تحديثٍ يصل من أيٍّ منها
     يعنيه — ويُفحَص **قبل** المسارَين اللذين ينصرفان بـ`return`، وإلّا لم يُعَد
     رسمُه إلا على تحديثِ الوثائق وحدَها. وصفحةٌ واحدةٌ نشطةٌ في كلّ وقت، فالانصرافُ
     بعده صحيح. */
  if(_isActive(PAGE_FILE)){ renderProjectFile(); return; }
  if(page === PAGE_LETTERS){   if(_isActive(PAGE_LETTERS))   renderLetters();   return; }
  if(page === PAGE_APPROVALS){ if(_isActive(PAGE_APPROVALS) || _isActive(PAGE_EXTRACTS)) renderApprovals(); return; }
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
/* اشتقاقُ افتراضِ المُرشِّح من المشروع المفتوح — **مرّةً واحدةً لكلّ شاشة**.
   `null` وحدَها تُشتقّ؛ و`""` اختيارٌ صريحٌ من المستخدم («كل المشاريع») يُحترَم. */
function _seedProj(v){ return (v === null || v === undefined) ? _curProjId() : String(v); }
/* **وشاشةُ السجلّات والشهادات تُستثنى من هذا الافتراض.** أغلبُ ما فيها وثائقُ
   شركةٍ نطاقُها `company` (سجلٌّ · زكاةٌ · تأمينات) — لا مشروعَ لها. فلو فُتحت على
   المشروع المفتوح لَظهرت **فارغةً** لمن دخل من داخل مشروع: «لا وثيقة تطابق
   الترشيح» فوق خزانةٍ مليئة. وشاشةٌ تبدو فارغةً وهي عامرةٌ أسوأُ من ترشيحٍ عريض.
   (أُمسكت بالعين في لقطةٍ من متصفّحٍ حقيقيّ قبل الاعتماد.)
   والخطاباتُ والمعتمداتُ عكسُها: تُكتب من داخل المشروع ولمشروع، فافتراضُها هو
   المفتوح — كما هو افتراضُ نموذجِ إنشائها. */
function _seedProjDocs(v){ return (v === null || v === undefined) ? FILTER_ALL : String(v); }

/* افتراضُ **النموذج الجديد** يختلف عن افتراض المُرشِّح، لأنّ الواقعَ يختلف:
   وثائقُ الخزانة أغلبُها وثائقُ شركةٍ (سجلٌّ · زكاةٌ · تأمينات) فافتراضُها الشركة
   ولو كنتَ داخل مشروع — وإلّا نُسبت شهادةُ الشركة لمشروعٍ بمجرّد أنّه كان مفتوحاً.
   والخطاباتُ والمعتمداتُ عكسُها: تُكتب **من داخل المشروع ولمشروع**، فافتراضُها هو
   المفتوح. الافتراضُ مقروءٌ من الواقع لا موحَّدٌ للتناسق. */
function _newProjSelDoc(){ return FILTER_COMPANY; }
function _newProjSelWork(){ return _curProjId() || FILTER_COMPANY; }
/* حقولُ المشروع على المسوّدة، مقروءةً من سجلٍّ قائمٍ أو من الافتراض. */
function _projDraft(rec, dflt){
  if(!rec) return { projSel:dflt, projManual:"", projectName:"", projectId:"",
                    scope:(dflt === FILTER_COMPANY ? SCOPE_COMPANY : SCOPE_PROJECT),
                    isCustomProject:false };
  var r = projRef(rec);
  return { projSel:_projSelFor(rec), projManual:(r.manual ? r.name : ""),
           projectName:r.name, projectId:r.id, scope:r.scope, isCustomProject:r.manual };
}
/* والعكس: من المسوّدة إلى الحقول الأربعة المخزَّنة. */
function _projBody(e){
  return normalizeProjectPick({ sel:e.projSel, manualName:e.projManual,
                                prevName:e.projectName, projects:_projList() });
}
/* مبدّلُ المشروع في النماذج الثلاثة — يقرأ الحقولَ أوّلاً فلا يضيع ما كُتب. */
function _setProjOn(draft, v, reader, painter){
  if(!draft) return;
  try{ reader(); }catch(e){}
  draft.projSel = String(v || FILTER_COMPANY);
  if(draft.projSel !== MANUAL_ID) draft.projManual = "";
  painter();
  try{ var el = document.getElementById("dv-proj-manual"); if(el) el.focus(); }catch(e){}
}

function setFilterProj(v){
  _view.proj = String(v || "");
  _view.ym = "";        // شهرٌ مختارٌ من أفقِ مشروعٍ آخرَ لا معنى له هنا
  render();
}
function setLetterProj(v){ _lview.proj = String(v || ""); renderLetters(); }
function clearLetterFilters(){ _lview.q = ""; _lview.proj = _curProjId(); renderLetters(); }
function setAprProj(v){ _curAprView().proj = String(v || ""); renderApprovals(); }

function clearFilters(){ _view = { q:"", type:"", level:"", ym:"", proj:FILTER_ALL }; render(); }
function open(id){ _open = String(id); _edit = null; _renew = null; render(); _top(); }
function backToList(){ _open = null; _renew = null; render(); _top(); }
function _top(){ try{ (window._scrollAppToTop || function(){ window.scrollTo(0, 0); })(); }catch(e){} }

function newDoc(){
  if(!canEdit()){ _toast("🔒 لا صلاحية لإضافة وثيقة","warn"); return; }
  _edit = { title:"", docType:"cr", docTypeOther:"", number:"", issuer:"",
            owner:"", ownerUser:"", start:"", expiry:"",
            noExpiry:false, notes:"", files:[] };
  var _pd0 = _projDraft(null, _newProjSelDoc());
  Object.keys(_pd0).forEach(function(k){ _edit[k] = _pd0[k]; });
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
  var _pd = _projDraft(d); Object.keys(_pd).forEach(function(k){ _edit[k] = _pd[k]; });
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
  if(_edit.projSel === MANUAL_ID) _edit.projManual = g("dv-proj-manual");
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
  var _pb = _projBody(_edit);
  body.scope = _pb.scope; body.projectId = _pb.projectId;
  body.projectName = _pb.projectName; body.isCustomProject = _pb.isCustomProject;
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
function letterTab(kind){ _letterMode("list"); _lview.kind = kind; renderLetters(); }
function setLetterFilter(v){ _lview.q = String(v == null ? "" : v); renderLetters(); }
function openLetter(id){ _letterMode("open"); _lview.open = String(id); renderLetters(); _top(); }
function backToLetters(){ _letterMode("list"); renderLetters(); _top(); }

function newLetter(kind, seed){
  if(!canEdit()){ _toast("🔒 لا صلاحية لإضافة خطاب","warn"); return; }
  var base = { kind:(kind === "template" ? "template" : "issued"), title:"", subject:"",
               party:"", letterDate:new Date().toISOString().slice(0, 10), ref:"", body:"",
               signId:"", signName:"", signTitle:"",
               prefix:DEF_PREFIX, honorific:DEF_HONORIFIC, closing:DEF_CLOSING, files:[] };
  var _pl = _projDraft(null, base.kind === "template" ? FILTER_COMPANY : _newProjSelWork());
  Object.keys(_pl).forEach(function(k){ base[k] = _pl[k]; });
  if(seed) Object.keys(seed).forEach(function(k){ base[k] = seed[k]; });
  _letterMode("form");
  _ledit = base;
  _lview.kind = base.kind;
  renderLetters(); _top();
}
function editLetter(id){
  if(!canEdit()){ _toast("🔒 لا صلاحية للتعديل","warn"); return; }
  var l = letterById(id);
  if(!l) return;
  _letterMode("form");
  _ledit = { id:l.id, kind:l.kind || "issued", title:l.title||"", subject:l.subject||"",
             party:l.party||"", letterDate:l.letterDate||"", ref:l.ref||"", body:l.body||"",
             signId:l.signId||"", signName:l.signName||"", signTitle:l.signTitle||"",
             prefix:_orDef(l.prefix, DEF_PREFIX), honorific:_orDef(l.honorific, DEF_HONORIFIC),
             closing:_orDef(l.closing, DEF_CLOSING),
             verifyToken:String(l.verifyToken || ""),
             files:Array.isArray(l.files) ? l.files.slice() : [] };
  var _pl2 = _projDraft(l); Object.keys(_pl2).forEach(function(k){ _ledit[k] = _pl2[k]; });
  renderLetters(); _top();
}
function cancelLetter(){ _letterMode("list"); renderLetters(); }
function useTemplate(id){
  var t = letterById(id);
  if(!t){ return; }
  newLetter("issued", cloneTemplate(t, new Date().toISOString()));
  _toast("📄 استُنسخ النموذج — أكمل الجهة والتاريخ", "");
}
/* نسخُ خطابٍ صادرٍ: يفتح نموذجَ خطابٍ **جديدٍ** محمَّلاً ببيانات الأصل ومشروعِه،
   ولا يمسّ الأصلَ — لا رقمَ له حتى يُحفَظ، فالإلغاءُ لا يترك أثراً. */
function copyLetter(id){
  if(!canEdit()){ _toast("🔒 لا صلاحية لإضافة خطاب","warn"); return; }
  var l = letterById(id);
  if(!l) return;
  var seed = cloneLetter(l, new Date().toISOString());
  var _pl = _projDraft(l); Object.keys(_pl).forEach(function(k){ seed[k] = _pl[k]; });
  newLetter("issued", seed);
  _toast("📄 نُسخ الخطاب " + String(l.id) + " — راجع التاريخ والمتن ثمّ احفظ", "");
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
    /* اللقبان من قائمتيهما («بلا لقب» خيارٌ صريح)، والختامُ خانةُ كتابةٍ فراغُها
       حذف. و`undefined` من `_readPick` تعني غيابَ الحقل فلا تُكتب على المحفوظ. */
    var _pf = _readPick("prefix"); if(_pf !== undefined) _ledit.prefix    = _pf;
    var _hn = _readPick("honor");  if(_hn !== undefined) _ledit.honorific = _hn;
    _ledit.closing = g("dv-l-closing");
    /* الاسمُ والصفةُ يُثبَّتان على الخطاب عند الحفظ، ولا يُقرآن من السجلّ وقتَ
       الطباعة: خطابٌ خرج باسمِ موقّعٍ ثمّ تغيّرت صفتُه في السجلّ **لا تتغيّر
       ورقتُه** — المطبوعُ سجلٌّ لما وُقِّع، لا مرآةٌ لحاضر السجلّ. والصورتان
       وحدَهما تُقرآن حيّتين (وتختفيان إن حُذف الموقّع). */
    _ledit.signId = g("dv-l-sign");
    var _sg = _ledit.signId ? signatoryById(_ledit.signId) : null;
    _ledit.signName  = _sg ? String(_sg.name  || "") : "";
    _ledit.signTitle = _sg ? String(_sg.title || "") : "";
  }
  if(_ledit.projSel === MANUAL_ID) _ledit.projManual = g("dv-proj-manual");
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
               signId:_ledit.signId || "", signName:_ledit.signName || "", signTitle:_ledit.signTitle || "",
               prefix:_orDef(_ledit.prefix, DEF_PREFIX),
               honorific:_orDef(_ledit.honorific, DEF_HONORIFIC),
               closing:_orDef(_ledit.closing, DEF_CLOSING),
               files:_ledit.files || [], updatedAt:now, updatedBy:me };
  var _pb = _projBody(_ledit);
  body.scope = _pb.scope; body.projectId = _pb.projectId;
  body.projectName = _pb.projectName; body.isCustomProject = _pb.isCustomProject;
  if(_ledit.fromTemplate) body.fromTemplate = _ledit.fromTemplate;
  if(_ledit.copiedFrom)   body.copiedFrom   = _ledit.copiedFrom;
  /* الصادرُ يحمل رمزَ تحقّقٍ منذ حفظه الأوّل ويحتفظ به عبر التعديلات. والنموذجُ
     لا رمزَ له — لا يُرسَل ولا يُتحقَّق منه. */
  if(body.kind !== "template") body.verifyToken = isVerifyToken(_ledit.verifyToken) ? _ledit.verifyToken : newVerifyToken();
  var was = _ledit.id;
  var p = was
    ? d.collection(LTRS_COLL()).doc(was).set(body, { merge:true }).then(function(){ return was; })
    : _nextId(_ledit.kind === "template" ? "TPL" : "LTR", LTRS_CTR()).then(function(id){
        body.createdAt = now; body.createdBy = me;
        return d.collection(LTRS_COLL()).doc(id).set(body).then(function(){ return id; });
      });
  p.then(function(id){
    var pub = {}; Object.keys(body).forEach(function(k){ pub[k] = body[k]; }); pub.id = id;
    _syncVerify(pub, now).catch(function(e){ _toast("⚠ حُفظ الخطاب لكن تعذّر تحديث صفحة التحقّق: " + String((e && e.message) || e), "warn"); });
    _audit(was ? "تعديل خطاب في الخزانة" : "إضافة خطاب إلى الخزانة", id + " — " + body.title);
    _letterMode("open"); _lview.open = id; renderLetters(); _top();
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
        /* صفحةُ التحقّق لا تُبقي «صادرٌ فعلاً» لخطابٍ حُذف. */
        if(isVerifyToken(l.verifyToken)) d.collection(VERIFY_COLL()).doc(l.verifyToken).delete().catch(function(){});
        _audit("حذف خطاب من الخزانة", id + " — " + (l.title || ""));
        _letterMode("list"); renderLetters(); _toast("✅ حُذف الخطاب", "success");
      }).catch(function(e){ _toast("⚠ تعذّر الحذف: " + String((e && e.message) || e), "warn"); });
    }).catch(function(){});
}

/* ════════ أفعالُ المعتمدات ════════ */
function setAprFilter(k, v){ _curAprView()[k] = String(v == null ? "" : v); renderApprovals(); }
function clearAprFilters(){ var v = _curAprView(); v.q = v.type = v.status = ""; renderApprovals(); }
function openApr(id){ _aEdit = null; _aview.open = String(id); renderApprovals(); _top(); }
function backToApr(){ _aEdit = null; _aview.open = null; renderApprovals(); _top(); }

function newApr(){
  if(!canEdit()){ _toast("🔒 لا صلاحية للإضافة","warn"); return; }
  _aEdit = { title:"", docType:"extract", party:"", ourRef:"", theirRef:"",
             submittedAt:new Date().toISOString().slice(0,10), approvedAt:"",
             status:"submitted", amountSubmitted:"", amountApproved:"", notes:"", files:[],
             partyId:"", stages:[], stageIdx:0, stageLog:[] };
  var _pa0 = _projDraft(null, _newProjSelWork());
  Object.keys(_pa0).forEach(function(k){ _aEdit[k] = _pa0[k]; });
  _suggestParty();
  _pPanel = false; _pAct = null;
  _aview.open = null; renderApprovals(); _top();
}
function editApr(id){
  if(!canEdit()){ _toast("🔒 لا صلاحية للتعديل","warn"); return; }
  var a = approvalById(id);
  if(!a) return;
  _aEdit = { id:a.id, title:a.title||"", docType:a.docType||"other", party:a.party||"",
             ourRef:a.ourRef||"", theirRef:a.theirRef||"",
             submittedAt:a.submittedAt||"", approvedAt:a.approvedAt||"",
             status:a.status||"submitted",
             amountSubmitted:(a.amountSubmitted === 0 || a.amountSubmitted) ? String(a.amountSubmitted) : "",
             amountApproved:(a.amountApproved === 0 || a.amountApproved) ? String(a.amountApproved) : "",
             notes:a.notes||"", files:Array.isArray(a.files) ? a.files.slice() : [],
             partyId:String(a.partyId || ""), stages:pathNormalize(a.stages),
             stageIdx:aprStageAt(a), stageLog:Array.isArray(a.stageLog) ? a.stageLog.slice() : [] };
  var _pa = _projDraft(a); Object.keys(_pa).forEach(function(k){ _aEdit[k] = _pa[k]; });
  _pPanel = false; _pAct = null;
  _aview.open = null; renderApprovals(); _top();
}
function cancelApr(){ _aEdit = null; renderApprovals(); }

function _readAprForm(){
  var g = function(id){ var el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; };
  _aEdit.title       = g("dv-a-title");
  _aEdit.docType     = g("dv-a-type") || "other";
  /* الجهةُ من المنتقي إن وُجد (اسمُها يُنسخ من السجلّ)، وإلّا من الخانة الحرّة */
  var psel = document.getElementById("dv-a-party-sel");
  if(psel && String(psel.value) !== PARTY_FREE){
    _aEdit.partyId = String(psel.value || "");
    var _pp = partyById(_aEdit.partyId);
    if(_pp) _aEdit.party = String(_pp.name || "");
  } else {
    _aEdit.partyId = "";
    if(document.getElementById("dv-a-party")) _aEdit.party = g("dv-a-party");
  }
  if(_aEdit.projSel === MANUAL_ID) _aEdit.projManual = g("dv-proj-manual");
  _aEdit.ourRef      = g("dv-a-ourref");
  _aEdit.theirRef    = g("dv-a-theirref");
  _aEdit.submittedAt = g("dv-a-sub");
  /* منتقي الحالة غائبٌ لذي المسار — فتبقى حالتُه كما هي، ولا تُقرأ "" فتصير «مُقدَّم» */
  if(document.getElementById("dv-a-status")) _aEdit.status = g("dv-a-status") || "submitted";
  /* تاريخُ الاعتماد والمبلغُ المعتمَد محجوبان ما دام المستندُ مُقدَّماً — و`g` تردّ ""
     للحقل المحجوب كما للفارغ، فلا يُقرآن إلا حين يكونان مفتوحين. وإلّا لَمُحي ما
     كُتب فيهما بمجرّد إعادةِ الحالة إلى «مُقدَّم» لحظةً. */
  var done = (_aEdit.status === "approved" || _aEdit.status === "paid");
  if(done){
    _aEdit.approvedAt     = g("dv-a-app");
    _aEdit.amountApproved = g("dv-a-apr");
  }
  if(aprIsFinancial(_aEdit.docType)) _aEdit.amountSubmitted = g("dv-a-amt");
  _aEdit.notes = g("dv-a-notes");
}
function setAprType(v){ if(!_aEdit) return; _readAprForm(); _aEdit.docType = String(v || "other"); renderApprovals(); }
function setDocProj(v){    _setProjOn(_edit,  v, _readForm,       render); }
function setLetterFormProj(v){ _setProjOn(_ledit, v, _readLetterForm, renderLetters); }
function setAprFormProj(v){
  _setProjOn(_aEdit, v, _readAprForm, function(){ _suggestParty(); renderApprovals(); });
}
/* اقتراحُ الجهة من عميل المشروع — حين لا جهةَ مختارةً بعد وحدَه، ولا يُبدَّل اختيارٌ قائم. */
function _suggestParty(){
  if(!_aEdit || _aEdit.partyId || (_aEdit.party && !_parties.length)) return;
  var pid = String(_aEdit.projSel || "");
  var proj = null;
  _projList().forEach(function(p){ if(p && String(p.id) === pid) proj = p; });
  var hit = partyForProject(_parties, proj);
  if(hit){ _aEdit.partyId = hit.id; _aEdit.party = String(hit.name || ""); }
}
function setAprStatus(v){
  if(!_aEdit) return;
  _readAprForm();
  _aEdit.status = String(v || "submitted");
  /* العودةُ إلى «مُقدَّم» تُفرغ ما يخصّ الاعتماد — مستندٌ ينتظر ومعه تاريخُ اعتمادٍ
     ومبلغٌ معتمَدٌ يكذب على قارئه. */
  if(_aEdit.status === "submitted"){ _aEdit.approvedAt = ""; _aEdit.amountApproved = ""; }
  else if(!_aEdit.approvedAt) _aEdit.approvedAt = new Date().toISOString().slice(0,10);
  renderApprovals();
}
function addAprFile(){
  if(!_aEdit) return;
  _readAprForm();
  _pickFile(function(f){
    _toast("⏳ جارٍ الرفع…", "");
    _upload("apr", _aEdit.id || ("new_" + Date.now()), f).then(function(rec){
      _aEdit.files = (_aEdit.files || []).concat([rec]);
      renderApprovals(); _toast("✅ أُرفق الملف", "success");
    }).catch(function(e){ _toast("⚠ تعذّر الرفع: " + String((e && e.message) || e), "warn"); });
  });
}
function delAprFile(i){ if(!_aEdit) return; _readAprForm(); (_aEdit.files || []).splice(i, 1); renderApprovals(); }

function saveApr(){
  if(!canEdit()){ _toast("🔒 لا صلاحية للحفظ","warn"); return; }
  _readAprForm();
  if(!_aEdit.title){ _toast("⚠ أدخل عنوان المستند","warn"); return; }
  if(!_aEdit.party){ _toast("⚠ أدخل الجهة التي قُدِّم إليها","warn"); return; }
  /* المستخلصُ والمطالبةُ لمشروعٍ حتماً — بالمشروع يدخل معتمداتِه وملفَّه عند اعتماده */
  if(aprTypeHasPath(_aEdit.docType) && _projBody(_aEdit).scope !== SCOPE_PROJECT){
    _toast("⚠ " + (APR_LBL[_aEdit.docType] || "هذا المستند") + " يُربَط بمشروع — به يدخل معتمداتِ المشروع وملفَّه","warn"); return;
  }
  if(!_aEdit.submittedAt){ _toast("⚠ أدخل تاريخ التقديم — عليه يُحسب عمرُ الانتظار","warn"); return; }
  if(_aEdit.approvedAt && _aEdit.submittedAt && _aEdit.approvedAt < _aEdit.submittedAt){
    _toast("⚠ تاريخ الاعتماد قبل تاريخ التقديم","warn"); return;
  }
  var d = _db();
  if(!d){ _toast("⚠ لا اتصال بقاعدة البيانات","warn"); return; }
  var fin = aprIsFinancial(_aEdit.docType);
  var num = function(v){ var n = Number(v); return (v === "" || v === null || !isFinite(n)) ? "" : n; };
  var now = new Date().toISOString(), me = _myName();
  var body = {
    title:_aEdit.title, docType:_aEdit.docType, party:_aEdit.party,
    ourRef:_aEdit.ourRef, theirRef:_aEdit.theirRef,
    submittedAt:_aEdit.submittedAt, approvedAt:_aEdit.approvedAt || "",
    status:_aEdit.status,
    /* غيرُ الماليّ لا يحمل مبلغاً أصلاً — ورقمٌ عالقٌ من نوعٍ سابقٍ يدخل الإجماليّ */
    amountSubmitted: fin ? num(_aEdit.amountSubmitted) : "",
    amountApproved:  fin ? num(_aEdit.amountApproved)  : "",
    notes:_aEdit.notes, files:_aEdit.files || [], updatedAt:now, updatedBy:me
  };
  var _pb = _projBody(_aEdit);
  body.scope = _pb.scope; body.projectId = _pb.projectId;
  body.projectName = _pb.projectName; body.isCustomProject = _pb.isCustomProject;
  body.partyId = String(_aEdit.partyId || "");
  /* المسار: المثبَّتُ يبقى كما هو؛ وما لا مسارَ له يرث نسخةً من مسار جهته إن كان
     نوعُه يقبله وما زال مُقدَّماً. ونوعٌ لا مسارَ له يُسقط المسارَ ويُبقي السجلّ. */
  if(aprHasPath(_aEdit) && aprTypeHasPath(body.docType)){
    body.stages = _aEdit.stages; body.stageIdx = _aEdit.stageIdx; body.stageLog = _aEdit.stageLog;
  } else if(aprTypeHasPath(body.docType) && body.status === "submitted" && body.partyId){
    var _pp2 = partyById(body.partyId);
    var att = aprAttachPath(body, _pp2 && _pp2.stages, { at:body.submittedAt, by:me });
    if(att){ body.stages = att.stages; body.stageIdx = att.stageIdx; body.stageLog = (_aEdit.stageLog || []).concat(att.stageLog); }
  } else if(!aprTypeHasPath(body.docType) && aprHasPath(_aEdit)){
    body.stages = []; body.stageIdx = 0; body.stageLog = _aEdit.stageLog;
  }
  var was = _aEdit.id;
  var p = was
    ? d.collection(APRS_COLL()).doc(was).set(body, { merge:true }).then(function(){ return was; })
    : _nextId("APR", APRS_CTR()).then(function(id){
        body.createdAt = now; body.createdBy = me;
        return d.collection(APRS_COLL()).doc(id).set(body).then(function(){ return id; });
      });
  p.then(function(id){
    _audit(was ? "تعديل مستند معتمَد" : "تسجيل مستند مُقدَّم", id + " — " + body.title);
    _aEdit = null; _aview.open = id; renderApprovals(); _top();
    _toast(was ? "✅ حُفظ التعديل" : "✅ سُجّل برقم " + id, "success");
  }).catch(function(e){ _toast("⚠ تعذّر الحفظ: " + String((e && e.message) || e), "warn"); });
}

function delApr(id){
  if(!canDelete()){ _toast("🔒 الحذف من صلاحية مدير النظام","warn"); return; }
  var a = approvalById(id);
  if(!a) return;
  _confirm({ title:"حذف مستند", icon:"🗑", okText:"حذف", okClass:"btn-danger",
    msg:'سيُحذف "' + (a.title || id) + '" من سجلّ المعتمدات. المرفقاتُ المرفوعة لا تُحذف من التخزين.' })
    .then(function(ok){
      if(!ok) return;
      var d = _db(); if(!d) return;
      d.collection(APRS_COLL()).doc(id).delete().then(function(){
        _audit("حذف مستند من المعتمدات", id + " — " + (a.title || ""));
        _aview.open = null; renderApprovals(); _toast("✅ حُذف", "success");
      }).catch(function(e){ _toast("⚠ تعذّر الحذف: " + String((e && e.message) || e), "warn"); });
    }).catch(function(){});
}


/* ═══════════════════════════════════════════════════════════════════════════
   الشاشةُ الرابعة — مِلَفُّ المشروع  (طلبُ المالك: «أرشيف لكل مشروع»)

   ── لماذا شاشةٌ لا مجرّدُ مُرشِّح ──
   المُرشِّحُ يجيب «أرِني معتمداتِ هذا المشروع» — سؤالٌ عن **سجلٍّ واحد**. وملفُّ
   المشروع يجيب سؤالاً آخر: **«أعطني كلَّ ما لهذا المشروع»** — وهو السؤالُ الذي
   يُسأل يومَ تسليمِ مشروعٍ، أو دفاعاً عن مطالبة، أو حين يُطلب ملفُّه في تدقيق.
   جوابُه في ثلاث شاشاتٍ يُرشَّح كلٌّ منها بيدها ليس جواباً، وإنّما ثلاثةُ أرباعِ
   جوابٍ يجمعها القارئُ بنفسه فينسى ربعاً.

   ── وهي طبقةٌ رقيقةٌ فوق ما بُني، لا نسخةٌ ثانيةٌ منه ──
   لا تقرأ من قاعدة البيانات ولا تحمل حالةَ تحريرٍ ولا نموذجَ رفعٍ خاصّاً بها:
   تستدعي الدوالَّ النقيّةَ نفسَها (`filterDocs` · `filterLetters` ·
   `filterApprovals` · `aprRollup`)، وأزرارُ الإضافة فيها تفتح **النماذجَ القائمة**
   بالمشروع مضبوطاً سلفاً. فمسارُ الرفع واحدٌ ومفحوصٌ، ولا يتفرّع مسارٌ ثانٍ
   ينحرف عنه بعد شهرين.

   ── ووثائقُ الشركة قسمٌ مفصولٌ لا مدسوسٌ بين وثائق المشروع ──
   ملفُّ المشروع يحتاج السجلَّ التجاريَّ وشهادةَ الزكاة (تُطلَب مع كلّ تقديم)، لكنّها
   **ليست وثائقَه**. دمجُها في قائمته يجعل «وثائقُ هذا المشروع: ١٤» رقماً كاذباً.
   فقسمٌ ثانٍ بعنوانه، والعددان منفصلان.
   ═══════════════════════════════════════════════════════════════════════════ */

var _fview = { proj:null };

function _fileHead(){
  return '<div class="dv-head"><div>'
    + '<h2 class="dv-ttl">' + _icon("briefcase") + ' خزانة الوثائق — ملفّ المشروع</h2>'
    + '<div class="dv-sub">كلُّ ما لمشروعٍ واحدٍ في مكانٍ واحد: وثائقُه وخطاباتُه الصادرة وما قُدِّم للعميل فيه. '
      + 'والإضافةُ من هنا تفتح النموذجَ نفسَه بالمشروع مضبوطاً سلفاً.</div>'
    + '</div></div>';
}

/* رأسُ قسمٍ: عنوانٌ وعددٌ وزرُّ «افتح السجلّ» (يَنقل المُرشِّحَ معه) وزرُّ إضافة. */
function _fSec(title, icon, n, openFn, addFn, addLbl){
  return '<div class="dv-head" style="margin:18px 0 8px">'
    + '<div><h3 class="dv-ttl" style="font-size:1.02rem">' + _icon(icon) + ' ' + _esc(title)
      + ' <span class="dv-cnt">' + n + '</span></h3></div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
    + '<button type="button" class="btn btn-ghost btn-sm" onclick="docVault.' + openFn + '()">افتح السجلّ</button>'
    + (canEdit() && addFn ? '<button type="button" class="btn btn-primary btn-sm" onclick="docVault.' + addFn + '()">'
        + _icon("plus", "ic-sm") + ' ' + _esc(addLbl) + '</button>' : "")
    + '</div></div>';
}

function renderProjectFile(){
  var host = document.getElementById("page-" + PAGE_FILE);
  if(!host) return;
  if(!canView()){ host.innerHTML = '<div class="dv-empty">🔒 خزانة الوثائق غير متاحة لحسابك.</div>'; return; }
  var today = new Date();
  _fview.proj = _seedProj(_fview.proj);

  var head = _fileHead();
  /* قائمةُ الاختيار تُجمع من السجلّات الثلاثة: مشروعٌ يدويٌّ لا يُعرَف إلا من خطابٍ
     واحدٍ يجب أن يكون له خيارٌ يُفتَح به ملفُّه. */
  var picker = '<div class="dv-bar"><label class="dv-l" style="align-self:center;margin:0">المشروع</label>'
    + _projFilterHTML(_fview.proj, "setFileProj", _visDocs().concat(_visLtrs(), _visAprs())) + '</div>';

  /* «كلُّ المشاريع» ليست ملفَّ مشروع: الشاشةُ تسأل عن واحدٍ بعينه، فتُطلب تسميتُه
     بدل أن تُعرض عليه كومةٌ لا تقول شيئاً. */
  if(String(_fview.proj || "") === FILTER_ALL){
    host.innerHTML = head + picker
      + '<div class="dv-empty">اختَرْ مشروعاً من القائمة أعلاه ليُعرَض ملفُّه كاملاً — '
      + 'أو اخترْ «' + _esc(SCOPE_LBL) + '» لوثائق الشركة وخطاباتها.</div>';
    return;
  }
  if(!_docsLoaded || !_ltrsLoaded || !_aprsLoaded){
    host.innerHTML = head + picker + '<div class="dv-empty">جارٍ التحميل…</div>';
    return;
  }

  var f = { proj:_fview.proj };
  var dcs = sortDocs(filterDocs(_visDocs(), f, today), today);
  var lts = filterLetters(_visLtrs(), { proj:_fview.proj, kind:"issued" }).sort(function(a, b){
    return String(b.letterDate || b.createdAt || "").localeCompare(String(a.letterDate || a.createdAt || ""));
  });
  var apsAll = filterApprovals(_visAprs(), f, today);
  var aps = sortApprovals(filterDone(apsAll), today);      // المعتمدات — ما اعتُمد فعلاً
  var flw = sortApprovals(filterFlow(apsAll), today);      // قيد الاعتماد — في مساره أو رُفض
  /* وثائقُ الشركة قسمٌ ثانٍ — وتُسقَط حين يكون المعروضُ **هو** نطاقَ الشركة، وإلّا
     ظهرت القائمةُ نفسُها مرّتين تحت عنوانين. */
  var comp = (String(_fview.proj) === FILTER_COMPANY) ? []
           : sortDocs(filterDocs(_visDocs(), { proj:FILTER_COMPANY }, today), today);

  var body = picker
    + _fSec("وثائق المشروع", "shield", dcs.length, "openDocsForFile", "newDocHere", "وثيقة")
    + _tableHTML(dcs, today, _fview.proj, 'لا وثائقَ خاصّةً بهذا المشروع بعد.')
    + (comp.length
        ? '<div class="dv-head" style="margin:18px 0 8px"><div>'
          + '<h3 class="dv-ttl" style="font-size:1.02rem">' + _icon("shield") + ' وثائقُ الشركة السارية على كلّ المشاريع'
          + ' <span class="dv-cnt">' + comp.length + '</span></h3>'
          + '<div class="dv-sub">تُطلَب مع كلّ تقديم، وليست من وثائق هذا المشروع — فعددُها منفصل.</div>'
          + '</div></div>' + _tableHTML(comp, today, FILTER_COMPANY)
        : "")
    + _fSec("الخطابات الصادرة", "scrollText", lts.length, "openLettersForFile", "newLetterHere", "خطاب صادر")
    + _letterTableHTML(lts, _fview.proj, 'لا خطاباتٍ صادرةً لهذا المشروع بعد.')
    + _fSec("المستخلصات قيد الاعتماد", "receipt", flw.length, "openExtractsForFile", "newAprHere", "مستند مُقدَّم")
    + _aprTableHTML(flw, today, _fview.proj, 'لا مستخلصَ في مساره لهذا المشروع الآن.', "flow")
    + _fSec("المعتمدات — ما اعتُمد للمشروع", "clipboardCheck", aps.length, "openAprForFile", null, "")
    + _doneSummaryHTML(aprRollup(aps, today))
    + _aprTableHTML(aps, today, _fview.proj, 'لم يُعتمَد بعدُ شيءٌ لهذا المشروع — ما يُعتمَد من «المستخلصات» يظهر هنا تلقائياً.', "done");

  host.innerHTML = head + body;
}

function setFileProj(v){ _fview.proj = String(v || ""); renderProjectFile(); }

/* «افتح السجلّ» ينقل المُرشِّحَ معه — وإلّا فتح المستخدمُ شاشةً تعرض شيئاً آخرَ
   فظنّ أنّ ما رآه في الملفّ ناقص. */
function openDocsForFile(){    _view.proj  = _fview.proj; _view.ym = ""; try{ showPage(PAGE_DOCS); }catch(e){} }
function openLettersForFile(){ _lview.proj = _fview.proj; _lview.kind = "issued"; try{ showPage(PAGE_LETTERS); }catch(e){} }
function openAprForFile(){     _aview.proj = _fview.proj; try{ showPage(PAGE_APPROVALS); }catch(e){} }
function openExtractsForFile(){ _xview.proj = _fview.proj; try{ showPage(PAGE_EXTRACTS); }catch(e){} }

/* والإضافةُ تفتح النموذجَ **القائم** بالمشروع مضبوطاً — لا نموذجَ ثانياً هنا. */
function _withProj(draft){
  if(!draft) return;
  draft.projSel = String(_fview.proj || FILTER_COMPANY);
  if(draft.projSel === FILTER_UNLINKED) draft.projSel = FILTER_COMPANY;
}
function newDocHere(){    openDocsForFile();    newDoc();    _withProj(_edit);  render(); }
function newLetterHere(){ openLettersForFile(); newLetter("issued"); _withProj(_ledit); renderLetters(); }
function newAprHere(){    openExtractsForFile(); newApr();   _withProj(_aEdit); renderApprovals(); }

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
   { id:"nav-vault-letters-btn", page:PAGE_LETTERS, icon:"scrollText", lbl:"الخطابات" },
   { id:"nav-vault-ext-btn", page:PAGE_EXTRACTS,  icon:"receipt",        lbl:"المستخلصات" },
   { id:"nav-vault-apr-btn", page:PAGE_APPROVALS, icon:"clipboardCheck", lbl:"المعتمدات" },
   { id:"nav-vault-file-btn", page:PAGE_FILE, icon:"briefcase", lbl:"ملفّ المشروع" }].forEach(function(b){
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
  var roll = _docsLoaded ? rollup(_visDocs(), new Date()) : { act:0, total:0 };
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
    if(id === PAGE_LETTERS) renderLetters();
    else if(id === PAGE_APPROVALS || id === PAGE_EXTRACTS) renderApprovals();
    else if(id === PAGE_FILE) renderProjectFile();
    else render();
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
  useTemplate:useTemplate, copyLetter:copyLetter, addLetterFile:addLetterFile, delLetterDraftFile:delLetterDraftFile,
  printLetter:printLetter, letterPaperHTML:letterPaperHTML,
  openAI:openAI, closeAI:closeAI, runAI:runAI, aiPrompt:aiPrompt, aiReady:aiReady,
  setPick:setPick, pickState:pickState, _PICK_NONE:PICK_NONE, _PICK_OTHER:PICK_OTHER,
  // المعتمدات
  renderApprovals:renderApprovals, approvals:approvals, approvalById:approvalById,
  setAprFilter:setAprFilter, clearAprFilters:clearAprFilters, openApr:openApr, backToApr:backToApr,
  newApr:newApr, editApr:editApr, cancelApr:cancelApr, saveApr:saveApr, delApr:delApr,
  setAprType:setAprType, setAprStatus:setAprStatus, addAprFile:addAprFile, delAprFile:delAprFile,
  aprDaysWaiting:aprDaysWaiting, aprVariance:aprVariance, aprRollup:aprRollup,
  aprIsFinancial:aprIsFinancial, aprAgeBand:aprAgeBand,
  filterApprovals:filterApprovals, sortApprovals:sortApprovals,
  _APR_TYPES:APR_TYPES, _APR_STATUS:APR_STATUS, _PAGE_APPROVALS:PAGE_APPROVALS,
  // مسارُ الاعتماد — الجهاتُ ومحطاتُها
  parties:parties, partyById:partyById, togglePartyPanel:togglePartyPanel,
  newParty:newParty, editParty:editParty, cancelParty:cancelParty, saveParty:saveParty, delParty:delParty,
  partyAddStage:partyAddStage, partyDelStage:partyDelStage, partyMoveStage:partyMoveStage,
  partyUseTemplate:partyUseTemplate, seedTemplateParty:seedTemplateParty, setAprParty:setAprParty,
  startAct:startAct, cancelAct:cancelAct, commitAct:commitAct, addActFile:addActFile, delActFile:delActFile,
  pathNormalize:pathNormalize, aprHasPath:aprHasPath, aprTypeHasPath:aprTypeHasPath, aprStageAt:aprStageAt,
  aprStageEnteredAt:aprStageEnteredAt, aprStageDays:aprStageDays, aprStageBand:aprStageBand,
  aprAttachPath:aprAttachPath, aprAdvance:aprAdvance, aprReturnTo:aprReturnTo, aprApprove:aprApprove,
  aprReject:aprReject, aprMarkPaid:aprMarkPaid, partyForProject:partyForProject, aprReturnCount:aprReturnCount,
  _PATH_TEMPLATE:PATH_TEMPLATE, _PATH_TEMPLATE_NAME:PATH_TEMPLATE_NAME, _STAGE_KINDS:STAGE_KINDS,
  aprIsDone:aprIsDone, aprInFlow:aprInFlow, filterFlow:filterFlow, filterDone:filterDone, aprFlowRollup:aprFlowRollup,
  openExtracts:openExtracts, openExtractsForFile:openExtractsForFile, _PAGE_EXTRACTS:PAGE_EXTRACTS,
  _PARTY_FREE:PARTY_FREE, _PARTIES_COLL:PARTIES_COLL,
  _PREFIX_OPTS:PREFIX_OPTS, _HONORIFIC_OPTS:HONORIFIC_OPTS,
  _DEF_PREFIX:DEF_PREFIX, _DEF_HONORIFIC:DEF_HONORIFIC, _DEF_CLOSING:DEF_CLOSING,
  // سجلُّ التواقيع
  signatories:signatories, signatoryById:signatoryById, canManageSigns:canManageSigns,
  toggleSignPanel:toggleSignPanel, newSignatory:newSignatory, editSignatory:editSignatory,
  cancelSignatory:cancelSignatory, saveSignatory:saveSignatory, delSignatory:delSignatory,
  addSignImage:addSignImage, delSignImage:delSignImage,
  startSignSync:startSignSync, stopSignSync:stopSignSync,
  // القراءة
  docs:docs, letters:letters, docById:docById, letterById:letterById,
  canView:canView, canEdit:canEdit, canDelete:canDelete, roleEligible:roleEligible,
  scanAndAlert:scanAndAlert, refreshBadges:refreshBadges,
  // الدوالُّ النقيّة — يفحصها `hail-tests.js` بلا متصفّح
  daysUntil:daysUntil, alertLevel:alertLevel, docLevel:docLevel, needsAction:needsAction,
  horizonBuckets:horizonBuckets, rollup:rollup, nextRef:nextRef, renewDoc:renewDoc,
  typeLabel:typeLabel, ownerLabel:ownerLabel,
  code128SVG:code128SVG, _code128Bits:code128Bits, _code128Sanitize:code128Sanitize,
  filterDocs:filterDocs, sortDocs:sortDocs, cloneTemplate:cloneTemplate, cloneLetter:cloneLetter, filterLetters:filterLetters,
  newVerifyToken:newVerifyToken, isVerifyToken:isVerifyToken, verifyUrl:verifyUrl, verifyBase:verifyBase,
  verifyRecord:verifyRecord, VERIFY_COLL:VERIFY_COLL,
  _DOC_TYPES:DOC_TYPES, _LEVELS:LEVELS, _PERM_KEY:PERM_KEY,
  _PAGE_DOCS:PAGE_DOCS, _PAGE_LETTERS:PAGE_LETTERS, _PAGE_FILE:PAGE_FILE,
  _PAGES:PAGES, _HORIZON_MONTHS:HORIZON_MONTHS,
  /* ══ طبقةُ المشروع — نقيّةٌ تُفحَص بلا متصفّح ══ */
  syncReaders:syncReaders, enableReaderLock:enableReaderLock,
  migrateSigns:migrateSigns, saveSigners:saveSigners,
  signerAllowed:signerAllowed, mergeSigners:mergeSigners, canUseSigns:canUseSigns,
  _SIGNS_NEW:SIGNS_NEW, _SIGNERS_DOC:SIGNERS_DOC,
  mergeReaders:mergeReaders, grantsVault:grantsVault, _READERS_DOC:READERS_DOC,
  projRef:projRef, projLabel:projLabel, projKey:projKey, inProject:inProject,
  visibleTo:visibleTo, visibleList:visibleList, normalizeProjectPick:normalizeProjectPick,
  allowedProjectIds:allowedProjectIds,
  renderProjectFile:renderProjectFile, setFileProj:setFileProj,
  setFilterProj:setFilterProj, setLetterProj:setLetterProj, setAprProj:setAprProj,
  clearLetterFilters:clearLetterFilters,
  setDocProj:setDocProj, setLetterFormProj:setLetterFormProj, setAprFormProj:setAprFormProj,
  openDocsForFile:openDocsForFile, openLettersForFile:openLettersForFile, openAprForFile:openAprForFile,
  newDocHere:newDocHere, newLetterHere:newLetterHere, newAprHere:newAprHere,
  _SCOPE_COMPANY:SCOPE_COMPANY, _SCOPE_PROJECT:SCOPE_PROJECT, _MANUAL_ID:MANUAL_ID,
  _FILTER_ALL:FILTER_ALL, _FILTER_COMPANY:FILTER_COMPANY, _FILTER_UNLINKED:FILTER_UNLINKED,
  /* ثقبُ فحصٍ صريحٌ لا بابٌ خلفيّ: يزرع بياناتٍ في الحالة **بلا شبكة** ليُرسَم الأفقُ
     والجدولُ في DOM حقيقيّ داخل `hail-tests.js`. لأنّ الحسابَ الصحيحَ الذي لا يُرسَم
     خطأٌ لا يُنذر، ولا سبيلَ لفحص الرسم بلا مصدرِ بياناتٍ سوى `onSnapshot`.
     لا يُنادى من الواجهة قطّ، ولا يكتب حرفاً في Firestore. */
  __test_seed:function(d, l, sg, ap, pt){
    if(Array.isArray(pt)){ _parties = pt.slice(); _partiesLoaded = true; }
    _pPanel = false; _pEdit = null; _pAct = null;
    _docs = Array.isArray(d) ? d.slice() : [];
    _ltrs = Array.isArray(l) ? l.slice() : [];
    if(Array.isArray(sg)){ _signs = sg.slice(); _signsLoaded = true; }
    if(Array.isArray(ap)){ _aprs = ap.slice(); }
    _aprsLoaded = true;
    _docsLoaded = _ltrsLoaded = true; _err = "";
    /* وتُعاد المُرشِّحاتُ إلى حالِ **ما قبل الاشتقاق** (`null`) لا إلى "" — فالفرقُ
       بينهما هو بيتُ القصيد: `null` تُشتقّ من المشروع المفتوح (أو من «الكلّ» في
       شاشة السجلّات)، و"" اختيارٌ صريحٌ من المستخدم. وفحصٌ يزرع بياناتٍ ثمّ يقيس
       على مُرشِّحٍ خلّفه فحصٌ قبله لا يقيس الافتراضَ أصلاً. */
    _view.proj = null; _lview.proj = null; _aview.proj = null; _xview.proj = null; _fview.proj = null;
  }
};

})();
