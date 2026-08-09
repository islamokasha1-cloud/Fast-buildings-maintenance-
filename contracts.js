/* ═══════════════════════════════════════════════════════════════════════════
   نظام هيل — وحدة التعاقدات مع مقاولي الباطن والموردين  (contracts.js)

   ملفٌ خارجيٌّ مستقلٌّ على نمط `project-management.js`: IIFE يعرّض كائناً واحداً
   `window.contracts`، **يركّب صفحاته وقائمته الجانبية ذاتياً ويلفّ showPage** —
   فلا يحتاج من `index.html` إلا وسمَ <script> واحداً.

   يقرأ خدمات النواة بالاسم مباشرةً (db / storage / firebase / esc / _jsq / toast /
   showConfirm / logAudit / currentUser / IS_DEV / CEO_APPROVAL_THRESHOLD /
   _svgIcon / _ic) — إذ تتشارك كلُّ وسوم <script> الكلاسيكية البيئةَ العامة نفسها.

   ── التصميم المرجعي ──
   `docs/contract-lifecycle-design.md` (الهيكلة) و`docs/subcontractor-contracts-plan.md`
   (التصوّر العام). القرارُ المحوريُّ المكتوب هناك ويحكم هذا الملف:
   **أمرُ الإسناد ليس طلبَ شراء** — الشراءُ يُغلَق بالكمية المستلَمة ويُغذّي المخزون
   ويُدفَع كاملاً؛ والإسنادُ يُصرف بنسبة الإنجاز التراكمية، ولا يمسّ المخزون،
   ويُحتجَز منه ويُستردُّ منه ويُخصَم منه. لذلك **مجموعاتٌ منفصلةٌ تماماً** عن
   `global_purchases` — كما عُزلت `hr-payments.js` عمداً وللسبب نفسه.

   ── ثلاثةُ ثوابتَ محكومةٌ في التصميم ──
   (١) **وضعُ الضريبة خاصيةُ العقد لا افتراضُ النظام.** ثلاثةُ أوضاع لا وضعان:
       `excl` (تُضاف ١٥٪) · `incl` (شاملة) · **`none` (بلا ضريبة إطلاقاً)** — فكثيرٌ
       من مقاولي الباطن غير مسجَّلين في ضريبة القيمة المضافة، وافتراضُ «شامل» عليهم
       يستخرج ضريبةً غيرَ موجودةٍ ويُبلغ عن ضريبةِ مدخلاتٍ لا سند لها.
   (٢) **الاتفاقُ الصغير لا يستحقّ عقداً.** دون عتبة `PAY_ORDER_THRESHOLD` (٣٠٠٠
       افتراضاً) يُسدَّد للمقاول بـ**أمر دفع** — مسارٌ مختصرٌ بلا بنودٍ ولا مستخلصات.
       والعتبةُ **تسمح ولا تُلزم**: إصدارُ عقدٍ كاملٍ لمبلغٍ صغيرٍ يبقى ممكناً بخيار
       صريح، أمّا فوقَ العتبة فأمرُ الدفع **ممنوع** — وإلا صار باباً خلفياً للعقود.
   (٣) **التوجيه كلُّه في دالةٍ نقيةٍ واحدة `crqNextStage`** تُستدعى عند الإنشاء وبعد
       كلّ اعتمادٍ وبعد كلّ إعادة إرسال — للعقد ولأمر الدفع معاً، فلا مساران يفترقان.
       وبوّابةُ التنفيذي تُحسب من **القيمة** لا من اختيار المُنشئ، واعتمادُه **يسقط**
       إن رُفعت القيمةُ فوق ما اعتمده (`ceoApprovedAmount`).

   ── العتباتُ مصدرٌ واحدٌ للحقيقة ──
   `CEO_APPROVAL_THRESHOLD` **يُقرأ من النواة ولا يُنسَخ** (هو سقفُ طلب الشراء وطلب
   التسعير وسداد الموارد البشرية نفسُه). وعتبةُ أمر الدفع تُقرأ من الوثيقة نفسها
   `meta/global_purchase_config` بالحقل `contractPayOrderThreshold` — فتُعدَّل من
   قاعدة البيانات بلا إعادة نشر، تماماً كسقف التنفيذي.

   ── التخزين ──
   `global_vendors` (سجلُّ الأطراف — VND-NNNN) · `global_contract_requests` (CRQ) ·
   `global_contracts` (CTR) · `global_contract_extracts` (EXT)، ولكلٍّ عدّادُه في
   `meta/…_counter` (+ نسخةُ `_dev`). المرفقاتُ تحت بادئة Storage القائمة `po/…`
   عمداً — قواعدُ Storage تُدار خارج المستودع، ومسارٌ جذريٌّ جديد قد يُرفَض صامتاً
   عند الرفع (درسُ `hr-payments.js`).

   ── التصميم البصريّ ──
   بلا لونٍ جديدٍ ولا خطٍّ جديد: توكنزُ المنصة (`--primary/--accent/--warn/--danger/
   --muted/--surface/--surface2/--border` و`--sla-ok/warn/crit`) وكلاساتُها الجاهزة
   (`.btn` `.badge` `.card` `.form-input`)، والأرقامُ كلُّها `JetBrains Mono` بـ
   `tabular-nums` و`direction:ltr` كما في كل شاشات المنصة. فتبدو الوحدةُ جزءاً
   أصيلاً من النظام في الثيمين معاً بلا صيانةِ لونٍ منفصلة.

   ── المرحلة ١ (هذا الملف الآن) ──
   النواةُ والدوالُّ النقيةُ وسجلُّ الأطراف. المراحلُ التالية (طلبُ التعاقد ودورتُه
   وأمرُ الدفع · العقدُ · المستخلصات · الربطُ بالموازنة) تُبنى فوق هذه الدوالّ نفسِها.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
"use strict";

var MODULE_BUILD = "v18.9.2530";

/* ════════════════════════════════════════════════════════════════════
   ١) الثوابت
   ════════════════════════════════════════════════════════════════════ */

var PAGE_VENDORS = "vendors";
var PAGE_REQS    = "contract-requests";
var PAGE_CTRS    = "contracts-list";

function _dev(){ try{ return typeof IS_DEV!=="undefined" && IS_DEV; }catch(e){ return false; } }
function VENDORS_COL(){   return _dev() ? "global_vendors_dev"            : "global_vendors"; }
function REQUESTS_COL(){  return _dev() ? "global_contract_requests_dev"  : "global_contract_requests"; }
function CONTRACTS_COL(){ return _dev() ? "global_contracts_dev"          : "global_contracts"; }
function EXTRACTS_COL(){  return _dev() ? "global_contract_extracts_dev"  : "global_contract_extracts"; }
function CHANGES_COL(){   return _dev() ? "global_contract_changes_dev"   : "global_contract_changes"; }
function VENDOR_META(){   return _dev() ? "meta/global_vendors_counter_dev" : "meta/global_vendors_counter"; }

/* ── الضريبة ──
   ثلاثةُ أوضاعٍ لا وضعان. `none` ليس ترفاً: مقاولُ الباطن غير المسجَّل ضريبياً
   يُصدر فاتورةً بلا ضريبة، واعتبارُها «شاملة» يستخرج ١٥٪ وهميةً من مستحقّه. */
var VAT_RATE = 0.15;
var VAT_MODES = {
  excl: { key:"excl", lbl:"يُضاف عليها ١٥٪ ضريبة", short:"+ ١٥٪ ض.ق.م" },
  incl: { key:"incl", lbl:"شاملة ضريبة القيمة المضافة", short:"شاملة الضريبة" },
  none: { key:"none", lbl:"بلا ضريبة — الطرف غير مسجَّل ضريبياً", short:"بلا ضريبة" }
};
function normVatMode(m){ return VAT_MODES[m] ? m : "incl"; }

/* ── عتبةُ أمر الدفع ──
   الافتراضُ ٣٠٠٠ ريال (قرارُ المالك)، ويُقرأ الفعليُّ من `meta/global_purchase_config`
   بالحقل `contractPayOrderThreshold` — نفسُ الوثيقة التي تحمل سقفَ التنفيذي، فلا
   وثيقةَ إعداداتٍ ثانيةٌ تنحرف عن الأولى. */
var PAY_ORDER_THRESHOLD = 3000;

/* ── وسمُ الارتباط (نوعُ ما نتعاقد عليه) ── */
var ENGAGEMENTS = {
  contract:  { key:"contract",  lbl:"عقد / أمر إسناد", icon:"fileText", hint:"بنودٌ ومستخلصاتٌ ومحتجزُ ضمان" },
  pay_order: { key:"pay_order", lbl:"أمر دفع",         icon:"banknote", hint:"مبلغٌ واحدٌ يُسدَّد مرةً واحدة" }
};

/* ── صفةُ الطرف: منشأةٌ أم شخصٌ طبيعيّ ──
   **محورٌ مستقلٌّ عن «النوع»**: مقاولُ الباطن قد يكون شركةً وقد يكون **شخصاً**
   نتعاقد معه بهويته لا بسجلٍّ تجاريّ. وثلاثةُ فروقٍ جوهريةٍ تتبع ذلك:
   (١) **مستندُ الهوية يختلف**: سجلٌّ تجاريٌّ للمنشأة، وهويةٌ وطنيةٌ أو إقامةٌ للفرد —
       فإلزامُ السجل التجاري على شخصٍ يعني سجلَّ أطرافٍ لا يُستعمَل أو يُملأ بأصفار.
   (٢) **الفردُ غالباً غيرُ مسجَّلٍ في ضريبة القيمة المضافة** ⇒ وضعُ العقد المقترَح
       له `none` تلقائياً. هذا هو الرابطُ العمليُّ بين هذه الصفة وأوضاع الضريبة الثلاثة.
   (٣) **تطابقُ الأسماء ليس تكراراً**: شخصان قد يحملان الاسم نفسَه بمشروعية، بينما
       اسمُ المنشأة فريدٌ في سجلها. فمفتاحُ التفرّد **رقمُ الهوية** لا الاسم. */
var ENTITY_TYPES = {
  establishment: { key:"establishment", lbl:"منشأة (مؤسسة/شركة)", short:"منشأة", icon:"building2", idLbl:"السجل التجاري" },
  individual:    { key:"individual",    lbl:"شخص (تعاقد بالهوية)", short:"شخص",  icon:"user",      idLbl:"رقم الهوية / الإقامة" }
};
function normEntity(t){ return ENTITY_TYPES[t] ? t : "establishment"; }

/* نوعُ هويةِ الشخص — يحدّد التسميةَ المعروضة وحدها؛ الانتهاءُ يُعامَل واحداً. */
var ID_TYPES = {
  national: { key:"national", lbl:"هوية وطنية" },
  iqama:    { key:"iqama",    lbl:"إقامة" },
  gulf:     { key:"gulf",     lbl:"هوية خليجية" },
  passport: { key:"passport", lbl:"جواز سفر" }
};

/* ── أنواعُ الأطراف ── */
var VENDOR_KINDS = {
  subcontractor: { key:"subcontractor", lbl:"مقاول باطن", icon:"hardHat", color:"var(--warn)" },
  supplier:      { key:"supplier",      lbl:"مورّد",       icon:"store",   color:"var(--info)" },
  both:          { key:"both",          lbl:"مقاول ومورّد", icon:"briefcase", color:"var(--primary)" }
};
var VENDOR_STATUS = {
  active:     { key:"active",     lbl:"نشط",             cls:"b-po-closed",    icon:"checkCircle" },
  suspended:  { key:"suspended",  lbl:"موقوف مؤقتاً",     cls:"b-po-approval",  icon:"alertTriangle" },
  blacklisted:{ key:"blacklisted",lbl:"محظور",           cls:"b-po-rejected",  icon:"ban" }
};

/* ── وثائقُ الطرف: النوعُ ثابتٌ والتاريخُ متغيّر ──
   القائمةُ ثابتةٌ عمداً — «أضِف نوعاً» يعني بعد سنةٍ عشرين تهجئةً للسجل التجاري
   فلا يعمل أيُّ تنبيهٍ على شيء.

   `entity` يحصر الوثيقةَ بصفةٍ بعينها: شهادةُ الزكاة والسعودة والتأمينات وثائقُ
   **منشأةٍ** لا معنى لها لشخص، ورخصةُ العمل وثيقةُ **شخصٍ** لا معنى لها لمنشأة.
   عرضُ ما لا يُطابق الصفةَ يُنتج سجلاً مليئاً بحقولٍ فارغةٍ لا يقرؤها أحد. */
var DOC_TYPES = [
  { key:"cr",        lbl:"السجل التجاري",              short:"س.ت",     entity:"establishment" },
  { key:"vat",       lbl:"شهادة ضريبة القيمة المضافة", short:"ض.ق.م",   entity:"establishment" },
  { key:"gosi",      lbl:"شهادة التأمينات الاجتماعية", short:"تأمينات", entity:"establishment" },
  { key:"zakat",     lbl:"شهادة الزكاة والدخل",        short:"زكاة",    entity:"establishment" },
  { key:"saudization",lbl:"شهادة نطاقات / السعودة",    short:"سعودة",   entity:"establishment" },
  { key:"workPermit",lbl:"رخصة عمل",                   short:"رخصة",    entity:"individual"    },
  { key:"profCert",  lbl:"شهادة مهنية / رخصة حرفة",    short:"مهنية",   entity:"individual"    },
  { key:"identity",  lbl:"الهوية / الإقامة",           short:"هوية",    entity:"individual"    },
  { key:"insurance", lbl:"بوليصة تأمين",               short:"تأمين"    },
  { key:"other",     lbl:"مستند آخر",                  short:"مستند"    }
];
/* الوثائقُ المتاحةُ لصفةٍ بعينها: العامّةُ (بلا `entity`) + الخاصةُ بها. */
function docTypesFor(entityType){
  var e = normEntity(entityType);
  return DOC_TYPES.filter(function(d){ return !d.entity || d.entity === e; });
}
var DOC_LBL = (function(){ var m={}; DOC_TYPES.forEach(function(d){ m[d.key]=d.lbl; }); return m; })();
/* الاختصارُ حقلٌ صريحٌ لا قصُّ أولِ كلمة: «شهادة ضريبة…» و«شهادة التأمينات…»
   يبدآن بالكلمة نفسها، فالقصُّ يجعل شارتين مختلفتين تُقرآن «شهادة». */
var DOC_SHORT = (function(){ var m={}; DOC_TYPES.forEach(function(d){ m[d.key]=d.short; }); return m; })();

/* عتبةُ «يوشك على الانتهاء» — يوماً قبل تاريخ الانتهاء. */
var DOC_SOON_DAYS = 30;

/* ── حالاتُ طلب التعاقد (تُستعمل من المرحلة ٢، وتُعرَّف هنا لأن `crqNextStage`
   ترجعها والفحوصُ تقرؤها) ── */
var CRQ_STATUS = {
  crq_draft:            "مسودة",
  crq_pending_pm:       "بانتظار اعتماد مدير المشاريع",
  crq_pending_proc:     "بانتظار اعتماد المشتريات",
  crq_pending_finance:  "بانتظار اعتماد المالية",
  crq_pending_ceo:      "بانتظار اعتماد المدير التنفيذي",
  crq_pending_pay:      "بانتظار سداد المالية",
  crq_approved:         "معتمد — جاهزٌ لإنشاء العقد",
  crq_converted:        "تم إنشاء العقد",
  crq_paid:             "مسدَّد — مغلق",
  crq_pm_rejected:      "مرفوض من مدير المشاريع",
  crq_proc_returned:    "مُعاد من المشتريات للتصحيح",
  crq_finance_returned: "مُعاد من المالية للتصحيح",
  crq_ceo_rejected:     "مرفوض من المدير التنفيذي",
  crq_cancelled:        "ملغي"
};
var CRQ_FINAL   = ["crq_converted","crq_paid","crq_cancelled"];
var CRQ_BOUNCED = ["crq_pm_rejected","crq_proc_returned","crq_finance_returned","crq_ceo_rejected"];

var CTR_STATUS = {
  ctr_pending_signature: "بانتظار توقيع الطرف",
  ctr_active:     "ساري",
  ctr_suspended:  "موقوف",
  ctr_completed:  "منتهٍ — بانتظار انتهاء الضمان",
  ctr_closed:     "مقفل — أُفرِج عن المحتجز",
  ctr_terminated: "مفسوخ"
};
var EXT_STATUS = {
  ext_draft:           "مسودة",
  ext_pending_pm:      "بانتظار مدير المشاريع",
  ext_pending_ceo:     "بانتظار المدير التنفيذي",
  ext_pending_finance: "بانتظار سداد المالية",
  ext_paid:            "مسدَّد — مغلق",
  ext_pm_rejected:     "مرفوض من مدير المشاريع",
  ext_returned:        "مُعاد للتصحيح",
  ext_cancelled:       "ملغي"
};

/* ════════════════════════════════════════════════════════════════════
   ٢) الدوالُّ النقية — مصدرُ الحقيقة الحسابيّ
   كلُّها بلا أثرٍ جانبيٍّ ولا قراءةٍ من DOM أو Firestore، ومكشوفةٌ على
   `window.contracts` لفحوص `hail-tests.js`. **ممنوعٌ حسابُ أيّ رقمٍ من
   هذه الأرقام داخل الترميز** — الرقمُ المرسوم هو الرقمُ المحسوب.
   ════════════════════════════════════════════════════════════════════ */

function r2(n){ var v=Number(n); if(!isFinite(v)) v=0; return Math.round((v+Number.EPSILON)*100)/100; }

/* تفكيكُ مبلغٍ إلى أساسٍ وضريبةٍ وإجمالي بحسب وضع العقد الضريبيّ. */
function vatSplit(amount, mode){
  var a = Number(amount); if(!isFinite(a)) a = 0;
  var m = normVatMode(mode);
  if(m === "none"){ return { base:r2(a), vat:0, total:r2(a), mode:m }; }
  if(m === "excl"){ var v = r2(a*VAT_RATE); return { base:r2(a), vat:v, total:r2(r2(a)+v), mode:m }; }
  var base = r2(a/(1+VAT_RATE));
  return { base:base, vat:r2(r2(a)-base), total:r2(a), mode:m };
}

/* إجماليُّ سطرٍ: **الضريبةُ تُقرَّب على سعر الوحدة ثم تُضرب في الكمية**، لا على
   إجمالي السطر — اصطلاحُ المنصة المحروسُ في `po-lifecycle-check.mjs`. النتيجتان
   تختلفان فعلاً (10.10 × 3 بوضع excl ⇒ 34.86 على الوحدة و34.85 على السطر). */
function lineTotal(qty, unitPrice, mode){
  var q = Number(qty); if(!isFinite(q)) q = 0;
  var u = vatSplit(unitPrice, mode);
  return { base:r2(u.base*q), vat:r2(u.vat*q), total:r2(u.total*q), unit:u, qty:q };
}

/* مجموعُ بنودٍ بوضعٍ ضريبيٍّ واحد. */
function linesTotal(lines, mode){
  var out = { base:0, vat:0, total:0 };
  (Array.isArray(lines)?lines:[]).forEach(function(ln){
    var t = lineTotal(ln && ln.qty, ln && ln.unitPrice, mode);
    out.base += t.base; out.vat += t.vat; out.total += t.total;
  });
  out.base=r2(out.base); out.vat=r2(out.vat); out.total=r2(out.total);
  return out;
}

/* هل يجوز لهذا المبلغ مسارُ أمر الدفع المختصر؟
   **دون** العتبة فقط. وفوقها ممنوعٌ قطعاً — وإلا صار أمرُ الدفع باباً خلفياً
   يتجاوز بنودَ العقد ومحتجزَ الضمان والمستخلصات. */
function payOrderAllowed(value, threshold){
  var v = Number(value), t = Number(threshold);
  if(!isFinite(v) || !isFinite(t) || t<=0) return false;
  return v > 0 && v < t;
}

/* توجيهُ طلب التعاقد وأمرِ الدفع معاً — **مصدرُ الحقيقة الوحيد للتسلسل**.
   أمرُ الدفع يتخطّى بوّابتَي المشتريات واعتمادِ المالية (فلا نطاقَ يُراجَع ولا
   شروطَ تجارية)، لكنه **لا يتخطّى بوّابة التنفيذي** — السقفُ سقفُ المال لا سقفُ
   نوع الورقة. ويبقى المسارُ دالةً واحدةً فلا يفترق فرعان بصمت. */
function crqNextStage(req, ceoThreshold){
  var r = req || {};
  var isPay = r.engagement === "pay_order";
  if(!r.pmApprovedAt) return "crq_pending_pm";
  if(!isPay && !r.procApprovedAt)    return "crq_pending_proc";
  if(!isPay && !r.financeApprovedAt) return "crq_pending_finance";
  var amt = Number(r.value); if(!isFinite(amt)) amt = 0;
  var th  = Number(ceoThreshold); if(!isFinite(th)) th = 0;
  // اعتمادُ التنفيذي يسقط إن رُفعت القيمةُ فوق ما اعتمده — فلا يمرّ مبلغٌ أكبرُ
  // ممّا رآه على توقيعٍ قديم (حارسُ hr-payments نفسُه).
  var ceoOk = !!r.ceoApprovedAt && amt <= (Number(r.ceoApprovedAmount)||0) + 0.01;
  if(th > 0 && amt >= th && !ceoOk) return "crq_pending_ceo";
  return isPay ? "crq_pending_pay" : "crq_approved";
}

/* ════ بصمتا الاعتماد ════
   كلُّ معتمِدٍ يوقّع على **شيءٍ بعينه**، فإن تغيّر ذلك الشيءُ سقط توقيعُه وحدَه —
   لا كلُّ التوقيعات. بصمتان لا واحدة، ولكلٍّ بوّابتُها:

   • `procKey`    — ما تعتمده المشتريات: **الطرفُ والتنافس**. تغيُّرُ الفائز أو
                    عددِ المرشّحين يُسقط اعتمادَها؛ ولا يُسقطه تعديلُ نسبةِ محتجز.
   • `financeKey` — ما تعتمده المالية: **القيمةُ ووضعُ الضريبة والشروطُ التجارية**
                    وبندُ الموازنة. تغيُّرُ أيٍّ منها يُعيد الطلبَ إلى بوّابتها.

   وبوّابةُ التنفيذي محروسةٌ بـ`ceoApprovedAmount` (لا ببصمة) — فالمبلغُ وحده ما رآه. */
function crqProcKey(req){
  var r = req || {};
  var cands = (Array.isArray(r.candidates) ? r.candidates : [])
    .map(function(c){ return String((c&&c.vendorId)||"")+":"+r2(c&&c.amount); }).sort().join("|");
  return [String(r.vendorId||""), cands].join("~");
}
function crqFinanceKey(req){
  var r = req || {}, a = r.advance||{}, rt = r.retention||{}, pn = r.penalty||{}, w = r.warranty||{};
  return [
    r2(r.value), normVatMode(r.vatMode), String(r.engagement||""), String(r.budgetCategoryKey||""),
    r2(a.pct), r2(a.recoveryPct), r2(rt.pct), String(rt.releaseOn||""),
    r2(pn.perDayPct), r2(pn.capPct), r2(w.months), r2(r.durationDays)
  ].join("~");
}

/* تطبيقُ البصمتين على طلبٍ بعد تعديله: يُسقط ما بطَل من اعتماداتٍ **ويُبقي ما صحّ**.
   دالةٌ نقيةٌ تُرجع نسخةً — تُستدعى قبل كلّ حفظٍ فلا يمرّ تعديلٌ على توقيعٍ قديم. */
function crqRevalidate(req){
  var r = Object.assign({}, req || {});
  if(r.procApprovedAt && r.procApprovedKey && r.procApprovedKey !== crqProcKey(r)){
    r.procApprovedAt = null; r.procApprovedBy = null; r.procApprovedKey = null;
  }
  if(r.financeApprovedAt && r.financeApprovedKey && r.financeApprovedKey !== crqFinanceKey(r)){
    r.financeApprovedAt = null; r.financeApprovedBy = null; r.financeApprovedKey = null;
  }
  return r;
}

/* ════ المشروعُ اليدويُّ والربطُ بالموازنة ════

   ليس لكلّ مشروعٍ موازنة: المشروعُ **المُدخَل يدوياً** (اسمٌ يُكتب على الطلب بلا سجلٍّ
   في `_projectsList`) قد لا تكون له مقايسةٌ ولا بنودُ موازنةٍ إطلاقاً. فالربطُ
   بالموازنة **اختياريٌّ لا شرط**: عقدٌ بلا بندِ موازنةٍ عقدٌ صحيحٌ تامّ، وكلُّ ما
   يفقده أنه لا يظهر في مقارنة «المخطَّط مقابل المتعاقَد عليه».

   وشكلُ المشروع على الوثيقة هو **الشكلُ القياسيُّ نفسُه** الذي فرضه `v18.9sz` على
   طلبات الشراء وطلبات التسعير: `projectId:"__OTHER__"` + `isCustomProject:true` +
   `projectName`. ومعرّفُ `__MPN__:` معرّفُ عرضٍ داخليٌّ لا يُخزَّن — تخزينُه كان
   سيُنتج مشروعاً ثالثاً لا تعرفه أيُّ شاشةٍ أخرى. */
var MANUAL_ID = "__OTHER__";
function pmManualPrefix(){
  try{ var pm=window.projectMgmt; if(pm && pm._MANUAL_PREFIX) return pm._MANUAL_PREFIX; }catch(e){}
  return "__MPN__:";
}
/* مفتاحُ الاختيار في القائمة ⇐ الشكلُ القياسيُّ المخزَّن. دالةٌ نقيةٌ تُختبَر وحدها. */
function normalizeProjectRef(selected, manualName, prefix){
  var pfx = prefix || "__MPN__:";
  var sel = String(selected||"");
  if(sel === "__NEW_MANUAL__" || sel === MANUAL_ID){
    var nm = String(manualName||"").trim();
    return { projectId: MANUAL_ID, isCustomProject: true, projectName: nm };
  }
  if(sel.indexOf(pfx) === 0){
    return { projectId: MANUAL_ID, isCustomProject: true, projectName: sel.slice(pfx.length) };
  }
  return { projectId: sel, isCustomProject: false, projectName: "" };
}
/* اسمُ مشروعِ الوثيقة المعروض — يدويّاً من `projectName`، ورسمياً من القائمة.
   نفسُ منطق `poProjectDisplayName` في النواة، فلا يختلف الاسمُ بين شاشتين. */
function docProjectName(doc, projects){
  var d = doc || {};
  if(d.isCustomProject === true || d.projectId === MANUAL_ID) return String(d.projectName||"مشروع يدويّ");
  var list = projects || [];
  for(var i=0;i<list.length;i++){ if(list[i].id === d.projectId) return list[i].name || d.projectId; }
  return d.projectId || "—";
}
/* مفتاحُ تجميعٍ يميّز كلَّ مشروعٍ يدويٍّ عن غيره (اصطلاحُ `__CUSTOM__:` في النواة). */
function docProjectKey(doc){
  var d = doc || {};
  if(d.isCustomProject === true || d.projectId === MANUAL_ID) return "__CUSTOM__:"+String(d.projectName||"");
  return String(d.projectId||"");
}

/* حالةُ ربط الطلب بالموازنة — ثلاثُ حالاتٍ لا اثنتان، ولكلٍّ رسالتُها:
   `linked`     — بندٌ مختارٌ وللمشروع موازنةٌ فيه ⇒ تُقارَن القيمةُ بالمخطَّط
   `no_budget`  — لا موازنةَ للمشروع أصلاً (يدويٌّ غالباً) ⇒ **لا لومَ ولا تحذير**
   `unlinked`   — للمشروع موازنةٌ والمستخدمُ اختار ألّا يربط ⇒ إشارةٌ محايدة
   ولا حالةَ رابعةَ اسمُها «خطأ»: الربطُ اختياريٌّ في كلّ الأحوال. */
function budgetLinkState(categoryKey, budget){
  var cats = (budget && Array.isArray(budget.categories)) ? budget.categories : [];
  var hasBudget = cats.some(function(c){ return (Number(c && c.planned)||0) > 0; });
  if(!hasBudget) return "no_budget";
  if(!categoryKey) return "unlinked";
  return "linked";
}

/* قيمةُ الطلب من بنوده — بالإجمالي شامل الضريبة (فالسقوفُ والمقارناتُ كلُّها عليه). */
function crqValueOf(req){
  var r = req || {};
  var lines = Array.isArray(r.lines) ? r.lines : [];
  if(!lines.length) return r2(r.value);
  return linesTotal(lines, r.vatMode).total;
}

/* البوّابةُ التي ينتظرها الطلبُ الآن ومَن يملكها — مصدرٌ واحدٌ تقرؤه الأزرارُ
   والشاراتُ والصلاحيات، فلا يظهر زرٌّ لا يملكه صاحبُه ولا يختفي زرٌّ يملكه. */
var GATE_ROLES = {
  crq_pending_pm:      { roles:["project_manager","admin"],      lbl:"مدير المشاريع" },
  crq_pending_proc:    { roles:["procurement_officer","admin"],  lbl:"المشتريات" },
  crq_pending_finance: { roles:["finance","admin"],              lbl:"المالية" },
  crq_pending_ceo:     { roles:["ceo","admin"],                  lbl:"المدير التنفيذي" },
  crq_pending_pay:     { roles:["finance","admin"],              lbl:"المالية — السداد" }
};
function crqGateOwner(status){ return GATE_ROLES[status] || null; }
function crqCanAct(status, role){
  var g = GATE_ROLES[status];
  return !!g && g.roles.indexOf(role) !== -1;
}
function crqIsFinal(s){ return CRQ_FINAL.indexOf(s) !== -1; }
function crqIsBounced(s){ return CRQ_BOUNCED.indexOf(s) !== -1; }

/* ════ الوثيقةُ التعاقدية: شروطٌ نصّيةٌ لا أرقامٌ وحدها ════   [المرحلة ٤-ب]

   تنبيهٌ على التسمية: `lines` هي **بنودُ الأعمال** (المقايسة: وصفٌ وكميةٌ وسعر)،
   و`clauses` هي **بنودُ العقد القانونية** (نطاقٌ والتزاماتٌ وسلامةٌ وجزاءات). خلطُ
   الاسمين هو أوّلُ ما يُربك القارئ، فهما شيئان لا يلتقيان.

   والشروطُ **تُنسَخ إلى العقد ولا يُشار إلى قالبها**: تعديلُ القالب بعد سنةٍ يجب
   ألّا يغيّر عقداً وُقِّع عليه — الإشارةُ كانت ستُعيد كتابةَ تاريخٍ مُوقَّع. */
var CLAUSE_CATS = {
  scope:    { key:"scope",    lbl:"نطاق العمل" },
  general:  { key:"general",  lbl:"شروط عامة" },
  quality:  { key:"quality",  lbl:"الجودة والاستلام" },
  safety:   { key:"safety",   lbl:"السلامة والمسؤولية" },
  penalty:  { key:"penalty",  lbl:"الشروط الجزائية" },
  warranty: { key:"warranty", lbl:"الضمان" },
  legal:    { key:"legal",    lbl:"أحكام ختامية" }
};
var CLAUSE_ORDER = ["scope","general","quality","safety","penalty","warranty","legal"];

/* قوالبُ افتراضيةٌ تعمل من أوّل يوم — يعدّلها الأدمن ويحذف ويضيف.
   صياغةٌ عامةٌ محايدةٌ متعارَفٌ عليها، لا استشارةٌ قانونية. */
var DEFAULT_CLAUSES = [
  { key:"scope_1", category:"scope", title:"نطاق الأعمال",
    body:"يلتزم الطرف الثاني بتنفيذ الأعمال الموصوفة في جدول بنود هذا العقد، وفق المواصفات والمخططات المعتمدة وتعليمات مهندس الإشراف، وبما يحقق أصول الصناعة والمواصفات السعودية المعتمدة." },
  { key:"gen_1", category:"general", title:"مستلزمات التنفيذ",
    body:"يوفّر الطرف الثاني العمالة والمعدات والأدوات اللازمة لتنفيذ الأعمال على نفقته، ما لم يُنَصّ صراحةً على خلاف ذلك. وأي مواد يصرفها الطرف الأول من مستودعاته تُقيَّد على الطرف الثاني وتُخصم من مستحقاته." },
  { key:"gen_2", category:"general", title:"المدة والبدء",
    body:"تبدأ مدة التنفيذ من تاريخ تسليم الموقع، ولا يجوز للطرف الثاني التوقف عن العمل أو التنازل عن العقد كلياً أو جزئياً للغير إلا بموافقة كتابية مسبقة من الطرف الأول." },
  { key:"qual_1", category:"quality", title:"الجودة والاستلام",
    body:"لا تُعتمد أي أعمال إلا بعد معاينتها من مهندس الإشراف. وللطرف الأول رفض الأعمال المخالفة للمواصفات، ويلتزم الطرف الثاني بإعادة تنفيذها على نفقته دون مطالبة بأي تمديد أو تعويض." },
  { key:"qual_2", category:"quality", title:"قياس الأعمال والمستخلصات",
    body:"تُقاس الأعمال المنفَّذة تراكمياً منذ بداية العقد، وتُصرف المستحقات بموجب مستخلصات معتمدة تُخصم منها الاستحقاقات السابقة وسائر الخصومات المنصوص عليها في هذا العقد." },
  { key:"safe_1", category:"safety", title:"السلامة والمسؤولية",
    body:"يلتزم الطرف الثاني بتطبيق اشتراطات السلامة وتوفير مهمات الوقاية الشخصية لعماله، ويتحمل كامل المسؤولية عن أي إصابة أو ضرر يلحق بعماله أو بالغير أو بالممتلكات نتيجة تنفيذ الأعمال." },
  { key:"safe_2", category:"safety", title:"نظامية العمالة",
    body:"يقرّ الطرف الثاني بأن جميع العاملين لديه نظاميون ويحملون وثائق سارية، ويتحمل وحده أي مسؤولية نظامية تترتب على مخالفة ذلك." },
  { key:"leg_1", category:"legal", title:"إنهاء العقد",
    body:"يحق للطرف الأول إنهاء العقد وسحب العمل إذا تأخر الطرف الثاني تأخراً جوهرياً أو أخلّ بالتزاماته بعد إنذاره كتابياً ومضي المهلة المحددة دون تصحيح، مع تحميله فروق التكلفة." },
  { key:"leg_2", category:"legal", title:"فض النزاع",
    body:"يُفسَّر هذا العقد وفق الأنظمة المعمول بها في المملكة العربية السعودية، وما ينشأ من نزاع يُسوّى ودياً، وإلا فيُحال إلى الجهة القضائية المختصة." }
];

/* الشروطُ الماليةُ **تتولّد نصّاً من الأرقام** — فلا يتناقض المطبوعُ مع المحسوب.
   وهي لا تُخزَّن: تُشتقّ عند كل عرضٍ وطباعةٍ من قيم العقد النافذة، فتبقى مطابقةً
   لما يفعله سُلَّمُ المستخلص فعلاً. */
function financialClauses(contract){
  var c = contract || {}, out = [];
  var adv = c.advance||{}, ret = c.retention||{}, pen = c.penalty||{}, war = c.warranty||{};
  var mode = VAT_MODES[normVatMode(c.vatMode)] || VAT_MODES.incl;

  out.push({ key:"_fin_value", category:"general", title:"قيمة العقد",
    body:"قيمة هذا العقد "+money(contractValue(c))+" ريال سعودي ("+mode.lbl+")"+
         (c.durationDays?("، ومدة تنفيذه "+money0(c.durationDays)+" يوماً"):"")+
         (c.startDate?(" اعتباراً من "+c.startDate):"")+"." });

  if(Number(adv.pct)>0){
    out.push({ key:"_fin_adv", category:"general", title:"الدفعة المقدمة",
      body:"يُصرف للطرف الثاني دفعة مقدمة قدرها "+adv.pct+"٪ من قيمة العقد ("+money(advanceAmountOf(c))+" ريال)"+
           (Number(adv.recoveryPct)>0 ? "، تُستردّ بخصم "+adv.recoveryPct+"٪ من قيمة أعمال كل مستخلص حتى استيفائها كاملة" : "")+"." });
  }
  if(Number(ret.pct)>0){
    out.push({ key:"_fin_ret", category:"quality", title:"محتجز الضمان",
      body:"يُحتجز من قيمة أعمال كل مستخلص ما نسبته "+ret.pct+"٪ ضماناً لحسن التنفيذ، "+
           (ret.releaseOn==="warranty_end" ? "ويُفرج عنه بعد انتهاء مدة الضمان" : "ويُفرج عنه عند الاستلام الابتدائي للأعمال")+"." });
  }
  if(Number(pen.perDayPct)>0){
    out.push({ key:"_fin_pen", category:"penalty", title:"غرامة التأخير",
      body:"إذا تأخر الطرف الثاني عن إنجاز الأعمال في المدة المتفق عليها، تُطبَّق غرامة تأخير قدرها "+
           pen.perDayPct+"٪ من قيمة العقد عن كل يوم تأخير"+
           (Number(pen.capPct)>0 ? "، بحد أقصى "+pen.capPct+"٪ من قيمة العقد ("+money(r2(contractValue(c)*Number(pen.capPct)/100))+" ريال)" : "")+
           ". وتُخصم الغرامة من مستحقات الطرف الثاني دون حاجة إلى إنذار أو حكم." });
  }
  if(Number(war.months)>0){
    out.push({ key:"_fin_war", category:"warranty", title:"مدة الضمان",
      body:"يضمن الطرف الثاني الأعمال المنفَّذة لمدة "+money0(war.months)+" شهراً من تاريخ الاستلام الابتدائي، "+
           "ويلتزم بإصلاح أي عيب يظهر خلالها على نفقته خلال مدة معقولة من إخطاره." });
  }
  return out;
}

/* شروطُ العقد كاملةً للعرض والطباعة: المخزَّنةُ + الماليةُ المشتقّة، مرتَّبةً بالتصنيف. */
function allClausesOf(contract){
  var stored = (contract && Array.isArray(contract.clauses)) ? contract.clauses : [];
  var all = stored.concat(financialClauses(contract));
  var groups = [];
  CLAUSE_ORDER.forEach(function(cat){
    var items = all.filter(function(x){ return (x.category||"general")===cat; });
    if(items.length) groups.push({ category:cat, label:(CLAUSE_CATS[cat]||{}).lbl||cat, items:items });
  });
  return groups;
}

/* ════ بناءُ العقد من الطلب — دالةٌ نقيةٌ لا معاملة ════   [المرحلة ٣]

   الفصلُ مقصود: **البناءُ نقيٌّ** فيُختبَر وحدَه بلا Firestore، و**المعاملةُ تنقله**
   فتحرس الذرّية وعدمَ التكرار. خلطُهما يعني منطقَ تحويلٍ لا يُفحَص إلا بمتصفّح.

   والعقدُ **يرث ولا يُعيد الإدخال**: كلُّ ما اعتمده الموقّعون الأربعة ينتقل كما هو —
   الطرفُ والبنودُ والقيمةُ ووضعُ الضريبة والشروطُ التجارية — فلا يظهر في العقد رقمٌ
   لم يره معتمِد. ويُثبَّت `requestId` في الاتجاه المقابل: أوّلُ ما يسأل عنه المدقّق
   بعد سنةٍ هو «مَن وافق على هذا؟»، والجوابُ على بُعد نقرة. */
function contractFromRequest(req, contractId, now, by, clauses){
  var r = req || {};
  var lines = (Array.isArray(r.lines) ? r.lines : []).map(function(l){
    return { id:l.id, boqLineId:(l.boqLineId||null), desc:l.desc||"", unit:l.unit||"",
             qty:Number(l.qty)||0, unitPrice:Number(l.unitPrice)||0,
             budgetCategoryKey:l.budgetCategoryKey||"" };
  });
  return {
    requestId: r.id || "",
    vendorId: r.vendorId || "", vendorName: r.vendorName || "",
    // شكلُ المشروع القياسيّ يُنقَل كما هو — لا يُعاد اشتقاقُه فينحرف
    projectId: r.projectId || "", isCustomProject: r.isCustomProject === true,
    projectName: r.projectName || "",
    budgetCategoryKey: r.budgetCategoryKey || "",   // قد يكون فارغاً — الربطُ اختياريّ
    title: r.title || "", scope: r.scope || "",
    type: r.engagement === "pay_order" ? "pay_order" : "works_order",
    lines: lines,
    value: crqValueOf(r), vatMode: normVatMode(r.vatMode),
    startDate: r.startDate || "", durationDays: Number(r.durationDays)||0,
    advance:   Object.assign({ pct:0, recoveryPct:0, amount:0, recovered:0 }, r.advance||{}),
    retention: Object.assign({ pct:0, releaseOn:"completion", released:0 }, r.retention||{}),
    penalty:   Object.assign({ perDayPct:0, capPct:0 }, r.penalty||{}),
    warranty:  Object.assign({ months:0 }, r.warranty||{}),
    guarantees: [], changeOrders: [],
    // نسخةٌ **مجمَّدةٌ** من الشروط وقت الإنشاء — تعديلُ القالب لاحقاً لا يمسّ عقداً موقَّعاً
    clauses: (Array.isArray(clauses) ? clauses : DEFAULT_CLAUSES).map(function(cl){
      return { key:cl.key, category:cl.category||"general", title:cl.title||"", body:cl.body||"" };
    }),
    signedDocs: [],
    // **لا يسري قبل التوقيع**: قرارُ المالك — فلا يُصرف مالٌ على عقدٍ لم يوقّعه الطرف
    status: "ctr_pending_signature",
    timeline: [{ event:"إنشاء العقد من الطلب "+(r.id||""), code:"created", by:by||"", at:now||"", note:"" }],
    createdAt: now||"", createdBy: by||"", id: contractId||""
  };
}
/* مبلغُ الدفعة المقدمة يُشتقّ من نسبتها على قيمة العقد — رقمٌ محسوبٌ لا مُدخَل. */
function advanceAmountOf(contract){
  var c = contract || {}, pct = Number((c.advance||{}).pct);
  if(!isFinite(pct) || pct <= 0) return 0;
  return r2(contractValue(c) * pct / 100);
}

/* حالاتُ العقد: مَن يملك الانتقال، وأيُّها نهائيّ. */
var CTR_FINAL = ["ctr_closed","ctr_terminated"];
var CTR_TRANSITIONS = {
  sign:      { from:["ctr_pending_signature"], to:"ctr_active", roles:["procurement_officer","project_manager","admin"], lbl:"تسجيل التوقيع", needsReason:false },
  suspend:   { from:["ctr_active"],    to:"ctr_suspended", roles:["project_manager","admin"], lbl:"إيقاف مؤقت",  needsReason:true  },
  resume:    { from:["ctr_suspended"], to:"ctr_active",    roles:["project_manager","admin"], lbl:"استئناف",     needsReason:false },
  complete:  { from:["ctr_active"],    to:"ctr_completed", roles:["project_manager","admin"], lbl:"إنهاء فنّيّ", needsReason:false },
  close:     { from:["ctr_completed"], to:"ctr_closed",    roles:["finance","admin"],         lbl:"إقفال نهائيّ", needsReason:false },
  terminate: { from:["ctr_pending_signature","ctr_active","ctr_suspended"], to:"ctr_terminated", roles:["admin"], lbl:"فسخ", needsReason:true }
};
function ctrIsFinal(s){ return CTR_FINAL.indexOf(s) !== -1; }
/* هل يجوز هذا الانتقالُ من هذه الحالة لهذا الدور؟ مصدرٌ واحدٌ تقرأه الأزرارُ
   **والمعاملةُ معاً** — فلا يمرّ انتقالٌ لأن زرّاً ظهر بالخطأ. */
function ctrCanTransit(action, status, role){
  var t = CTR_TRANSITIONS[action];
  return !!t && t.from.indexOf(status) !== -1 && t.roles.indexOf(role) !== -1;
}
function ctrActionsFor(status, role){
  return Object.keys(CTR_TRANSITIONS).filter(function(a){ return ctrCanTransit(a, status, role); });
}

/* قيمةُ العقد النافذة = الأصليةُ + المعتمَدُ من أوامر التغيير. لا شيءَ غيرُ ذلك. */
function contractValue(contract){
  var c = contract || {};
  var base = Number(c.value); if(!isFinite(base)) base = 0;
  var add = 0;
  (Array.isArray(c.changeOrders)?c.changeOrders:[]).forEach(function(co){
    if(co && co.status === "approved"){ var a=Number(co.amount); if(isFinite(a)) add += a; }
  });
  return r2(base + add);
}

/* الكميةُ المتعاقَدُ عليها لبندٍ = كميةُ العقد + ما أضافته أوامرُ التغيير المعتمدة. */
function contractLineQty(contract, lineId){
  var c = contract || {}, q = 0;
  (Array.isArray(c.lines)?c.lines:[]).forEach(function(ln){ if(ln && ln.id===lineId){ var v=Number(ln.qty); if(isFinite(v)) q += v; } });
  (Array.isArray(c.changeOrders)?c.changeOrders:[]).forEach(function(co){
    if(!co || co.status!=="approved") return;
    (Array.isArray(co.lines)?co.lines:[]).forEach(function(ln){ if(ln && ln.id===lineId){ var v=Number(ln.qty); if(isFinite(v)) q += v; } });
  });
  return r2(q);
}

/* ════════════════════════════════════════════════════════════════════
   ٤-ج) أوامرُ التغيير  [المرحلة ٧]

   العقدُ وُقّع على مبلغ. ثمّ زاد العملُ أو نقص. وأمامنا ثلاثةُ طرق، اثنتان منها
   تُفسدان السجلّ:
     • تعديلُ رقم العقد الأصليّ ⇒ تضيع الحقيقة: لا أحدَ يعرف بعد شهرٍ أنّ العقد
       بدأ بـ١٠٠ وصار ١١٥ ولا لماذا. (وقواعدُ الخادم تمنعه أصلاً.)
     • عقدٌ ثانٍ لعملٍ هو امتدادُ الأوّل ⇒ رقمان لالتزامٍ واحد.
     • **أمرُ تغييرٍ**: مستندٌ مستقلٌّ يمرّ بدورة اعتماد، وحين يُعتمَد **يُضاف إلى
       العقد ولا يستبدله**. `value` يبقى الأصليَّ أبداً، و`contractValue` تجمعه مع
       أوامر التغيير المعتمدة. فالتاريخُ محفوظٌ والرقمُ الحاليُّ صحيح.

   وهذا ما كانت المنظومةُ تنتظره: `contractValue` و`contractLineQty` تجمعان أوامرَ
   التغيير منذ المرحلة ١، ورسالةُ حارس المستخلص تقول «يلزم أمرُ تغييرٍ معتمَد» —
   وكان البابُ الذي تشير إليه غيرَ مبنيّ. هذه المرحلةُ تبنيه.
   ════════════════════════════════════════════════════════════════════ */

var CHG_STATUS = {
  chg_pending_pm:      "بانتظار اعتماد مدير المشاريع",
  chg_pending_proc:    "بانتظار اعتماد المشتريات",
  chg_pending_finance: "بانتظار اعتماد المالية",
  chg_pending_ceo:     "بانتظار اعتماد المدير التنفيذي",
  chg_approved:        "معتمد — جاهزٌ للتطبيق على العقد",
  chg_applied:         "مطبَّق على العقد",
  chg_rejected:        "مرفوض",
  chg_cancelled:       "ملغى"
};
var CHG_FINAL = ["chg_applied","chg_rejected","chg_cancelled"];
var CHG_GATES = {
  chg_pending_pm:      { roles:["project_manager","admin"],     lbl:"مدير المشاريع" },
  chg_pending_proc:    { roles:["procurement_officer","admin"], lbl:"المشتريات" },
  chg_pending_finance: { roles:["finance","admin"],             lbl:"المالية" },
  chg_pending_ceo:     { roles:["ceo","admin"],                 lbl:"المدير التنفيذي" }
};
function chgGateOwner(status){ return CHG_GATES[status] || null; }
function chgCanAct(status, role){
  var g = CHG_GATES[status];
  return !!g && g.roles.indexOf(role) !== -1;
}
function chgIsFinal(s){ return CHG_FINAL.indexOf(s) !== -1; }

/* قيمةُ أمر التغيير = مجموعُ بنوده بوضع ضريبةِ **العقد** نفسِه — لا وضعٍ خاصٍّ به.
   عقدٌ بلا ضريبةٍ لا يصير بعضُه خاضعاً لها بأمرِ تغيير. والكميةُ السالبةُ خفضٌ:
   الرقمُ يخرج سالباً فيطرح من قيمة العقد بلا فرعٍ ثانٍ في الحساب. */
function chgAmountOf(chg, vatMode){
  return linesTotal((chg||{}).lines, vatMode).total;
}

/* البوّابةُ التالية — أربعُ بوّاباتٍ كطلب التعاقد، والعتبةُ تُقاس بـ**القيمة
   المطلقة**: خفضُ العقد ٥٠ ألفاً قرارٌ بثقل رفعِه ٥٠ ألفاً، ولا يجوز أن يمرّ
   خفضٌ كبيرٌ من تحت العتبة لأن إشارتَه سالبة. */
function chgNextStage(chg, ceoThreshold){
  var g = chg || {};
  if(!g.pmApprovedAt)      return "chg_pending_pm";
  if(!g.procApprovedAt)    return "chg_pending_proc";
  if(!g.financeApprovedAt) return "chg_pending_finance";
  var amt = Math.abs(Number(g.amount)); if(!isFinite(amt)) amt = 0;
  var th  = Number(ceoThreshold); if(!isFinite(th)) th = 0;
  var ceoOk = !!g.ceoApprovedAt && amt <= (Number(g.ceoApprovedAmount)||0) + 0.01;
  if(th > 0 && amt >= th && !ceoOk) return "chg_pending_ceo";
  return "chg_approved";
}

/* أثرُ الأمر على العقد — يُعرَض قبل الاعتماد فيرى المعتمِدُ ما سيوقّع عليه:
   القيمةُ قبل/بعد، والمدةُ قبل/بعد. رقمٌ محسوبٌ لا مخزَّن. */
function chgEffect(contract, chg){
  var c = contract || {}, g = chg || {};
  var baseValue = contractValue(c);
  var delta = r2(Number(g.amount)||0);
  var baseDays = Number(c.durationDays)||0;
  var addDays  = Number(g.durationDaysDelta)||0;
  return {
    baseValue: baseValue, delta: delta, newValue: r2(baseValue + delta),
    baseDays: baseDays, addDays: addDays, newDays: baseDays + addDays,
    pct: baseValue > 0 ? r2(delta / baseValue * 100) : 0
  };
}

/* خلاصةُ أوامر التغيير المطبَّقة على عقد — للعرض والطباعة:
   «الأصليّ ١٠٠,٠٠٠ + تغييرات ١٥,٠٠٠ = الحاليّ ١١٥,٠٠٠» */
function contractChangeTotals(contract){
  var c = contract || {};
  var base = Number(c.value); if(!isFinite(base)) base = 0;
  var added = 0, deducted = 0, count = 0, days = 0;
  (Array.isArray(c.changeOrders)?c.changeOrders:[]).forEach(function(co){
    if(!co || co.status !== "approved") return;
    var a = Number(co.amount); if(!isFinite(a)) a = 0;
    if(a >= 0) added += a; else deducted += a;
    days += Number(co.durationDaysDelta)||0;
    count++;
  });
  return { base:r2(base), added:r2(added), deducted:r2(deducted),
           net:r2(added+deducted), effective:r2(base+added+deducted),
           count:count, daysAdded:days };
}

/* حارسُ أمر التغيير — ثلاثةُ منوعٍ لا واحد:
   (١) بلا أثرٍ لا معنى له: لا مالَ ولا مدّة.
   (٢) **الخفضُ لا ينزل تحت المنفَّذ**: بندٌ اعتُمد منه ٤٠ وحدةً لا تُخفَّض كميتُه
       إلى ٣٠ — العملُ نُفِّذ وشُهد به، وخفضُه يجعل المستخلصَ التالي مستحيلاً وما
       سبق باطلاً بأثرٍ رجعيّ.
   (٣) **ولا تنزل قيمةُ العقد تحت ما سُدِّد فعلاً** — مالٌ خرج لا يُلغى بمستند. */
function chgGuard(chg, contract, extracts){
  var g = chg || {}, c = contract || {};
  var lines = Array.isArray(g.lines) ? g.lines : [];
  var out = { ok:true, empty:false, under:[], belowPaid:null };
  var delta = r2(Number(g.amount)||0), days = Number(g.durationDaysDelta)||0;
  if(!lines.length || (delta === 0 && days === 0)){ out.empty = true; out.ok = false; return out; }

  var done = prevCumByLine(extracts, c, null);
  lines.forEach(function(ln){
    var q = Number(ln && ln.qty); if(!isFinite(q) || q >= 0) return;   // الزيادةُ لا تُحرَس
    var id = ln.id;
    var after = r2(contractLineQty(c, id) + q);
    var executed = Number(done[id])||0;
    if(after < executed - 1e-9) out.under.push({ lineId:id, desc:ln.desc||"", after:after, executed:executed });
  });

  var paid = 0;
  (Array.isArray(extracts)?extracts:[]).forEach(function(e){
    if(e && e.contractId===c.id && e.status==="ext_paid") paid += r2((e.payment||{}).amount);
  });
  var newValue = r2(contractValue(c) + delta);
  if(newValue < r2(paid) - 1e-9) out.belowPaid = { newValue:newValue, paid:r2(paid) };

  out.ok = !out.under.length && !out.belowPaid;
  return out;
}

/* أمرُ تغييرٍ واحدٌ مفتوحٌ في المرة لكلّ عقد — كحارس «مستخلصٌ مفتوحٌ واحد».
   أمران معلّقان يعتمدهما اثنان في اللحظة نفسِها فيطبَّقان على قيمتين مختلفتين. */
var CHG_OPEN = ["chg_pending_pm","chg_pending_proc","chg_pending_finance","chg_pending_ceo","chg_approved"];
function openChangeOf(changes, contractId){
  var list = Array.isArray(changes) ? changes : [];
  for(var i=0;i<list.length;i++){
    var g=list[i];
    if(g && g.contractId===contractId && CHG_OPEN.indexOf(g.status)!==-1) return g;
  }
  return null;
}

/* أمرُ التغيير لا يُنشأ إلا على عقدٍ حيٍّ — لا على مقفلٍ ولا مفسوخٍ ولا بلا توقيع. */
var CHG_CONTRACT_OK = ["ctr_active","ctr_suspended"];
function chgContractEligible(contract){
  return CHG_CONTRACT_OK.indexOf((contract||{}).status) !== -1;
}

/* سُلَّمُ حساب المستخلص — ثماني خطواتٍ بترتيبٍ محسوم، تُرجَع **مفصَّلةً** لا
   صافياً وحده، فتعرضها الشاشةُ والتقريرُ والـPDF من مصدرٍ واحد.

   ctx = { prevGross, materialsIssued, penaltyAmount, ncDeduction }
   • prevGross        — إجماليُّ أعمالِ المستخلصات المعتمدة سابقاً (يُحسب، لا يُخزَّن)
   • materialsIssued  — قيمةُ الموادّ المصروفة له من مستودعنا (أوامرُ الصرف بـcontractId)
   • penaltyAmount    — غرامةُ التأخير المحتسَبة أو المعتمدة يدوياً
   • ncDeduction      — خصمُ عدم المطابقة / الجودة / السلامة                       */
function extNet(ext, contract, ctx){
  var c = contract || {}, e = ext || {}, x = ctx || {};
  var mode = normVatMode(c.vatMode);

  // (١) إجماليُّ الأعمال المنفَّذة تراكمياً — من بنود المستخلص (بلا ضريبة: أساسٌ صافٍ)
  var gross = 0;
  (Array.isArray(e.lines)?e.lines:[]).forEach(function(ln){
    var q = Number(ln && ln.cumQty); if(!isFinite(q)) q = 0;
    var p = Number(ln && ln.unitPrice); if(!isFinite(p)) p = 0;
    gross += r2(vatSplit(p, mode).base * q);
  });
  gross = r2(gross);

  // (٢) − المستخلَصُ المعتمدُ سابقاً  ⇒  قيمةُ أعمال الفترة
  var prev   = r2(Number(x.prevGross)||0);
  var period = r2(gross - prev);

  // (٣) + ض.ق.م على أعمال الفترة (بلا ضريبةٍ إن كان وضعُ العقد `none`)
  var vat = (mode === "none") ? 0 : r2(period * VAT_RATE);
  var withVat = r2(period + vat);

  // (٤) − محتجزُ الضمان   — على **أعمال الفترة قبل الضريبة** (المحتجزُ حصةٌ من العمل لا من ضريبته)
  var retPct = Number((c.retention||{}).pct); if(!isFinite(retPct)) retPct = 0;
  var retention = r2(period * retPct / 100);

  // (٥) − استردادُ الدفعة المقدمة — بنسبةٍ من أعمال الفترة، وبسقفِ ما تبقّى منها
  var advPct = Number((c.advance||{}).recoveryPct); if(!isFinite(advPct)) advPct = 0;
  var advTotal = Number((c.advance||{}).amount); if(!isFinite(advTotal)) advTotal = 0;
  var advDone  = Number((c.advance||{}).recovered); if(!isFinite(advDone)) advDone = 0;
  var advanceRecovery = r2(Math.min(r2(period * advPct / 100), Math.max(0, r2(advTotal - advDone))));

  // (٦) − غرامةُ التأخير (بسقفها من قيمة العقد إن حُدِّد)
  var penalty = r2(Math.max(0, Number(x.penaltyAmount)||0));
  var capPct = Number((c.penalty||{}).capPct);
  if(isFinite(capPct) && capPct > 0) penalty = r2(Math.min(penalty, contractValue(c) * capPct / 100));

  // (٧) − الموادُّ المصروفةُ له من مستودعنا
  var materials = r2(Math.max(0, Number(x.materialsIssued)||0));

  // (٨) − خصومُ عدم المطابقة / الجودة / السلامة
  var nonConformity = r2(Math.max(0, Number(x.ncDeduction)||0));

  var deductions = r2(retention + advanceRecovery + penalty + materials + nonConformity);
  var net = r2(withVat - deductions);

  return {
    mode: mode,
    gross: gross, prevGross: prev, period: period,
    vat: vat, withVat: withVat,
    retention: retention, advanceRecovery: advanceRecovery,
    penalty: penalty, materials: materials, nonConformity: nonConformity,
    deductions: deductions, net: net
  };
}

/* ════ المستخلصات — الدوالُّ النقية ════   [المرحلة ٤]

   الاصطلاحُ **تراكميّ**: كلُّ مستخلصٍ يذكر المنفَّذَ **منذ بداية العقد**، وقيمتُه =
   التراكميُّ الآن − المستخلَصُ سابقاً. وثلاثةُ حرّاسٍ بنيوية تحميه. */

/* «المستخلَصُ سابقاً» **يُحسب ولا يُخزَّن** — رقمٌ مخزَّنٌ ينحرف عن مصدره بعد أوّل
   تعديلٍ أو حذف. يُجمَع من المستخلصات **المعتمدةِ أو المسدَّدة** وحدَها لهذا العقد. */
var EXT_COUNTED = ["ext_pending_ceo","ext_pending_finance","ext_paid"];
function prevGrossOf(extracts, contract, exceptId){
  var list = Array.isArray(extracts) ? extracts : [];
  var cid = (contract && contract.id) || "";
  var mode = normVatMode(contract && contract.vatMode);
  var sum = 0;
  list.forEach(function(e){
    if(!e || e.contractId !== cid) return;
    if(e.id && exceptId && e.id === exceptId) return;
    if(EXT_COUNTED.indexOf(e.status) === -1) return;
    (Array.isArray(e.lines)?e.lines:[]).forEach(function(l){
      var q = Number(l && l.cumQty); if(!isFinite(q)) q = 0;
      var p = Number(l && l.unitPrice); if(!isFinite(p)) p = 0;
      sum += r2(vatSplit(p, mode).base * q);
    });
  });
  return r2(sum);
}
/* أكبرُ كميةٍ تراكميةٍ سبق اعتمادُها لكلّ بند — أرضيةُ المستخلص الجديد. */
function prevCumByLine(extracts, contract, exceptId){
  var out = {}, cid = (contract && contract.id) || "";
  (Array.isArray(extracts)?extracts:[]).forEach(function(e){
    if(!e || e.contractId !== cid) return;
    if(e.id && exceptId && e.id === exceptId) return;
    if(EXT_COUNTED.indexOf(e.status) === -1) return;
    (Array.isArray(e.lines)?e.lines:[]).forEach(function(l){
      var q = Number(l && l.cumQty); if(!isFinite(q)) q = 0;
      if(!(l.lineId in out) || q > out[l.lineId]) out[l.lineId] = q;
    });
  });
  return out;
}

/* الحارسُ **المانعُ الوحيد** في المنظومة: التراكميُّ لا يتجاوز كميةَ العقد
   (بعد أوامر التغيير المعتمدة). تجاوزُه ليس اجتهاداً بل خطأ — ولو مرّ لصار العقدُ
   سقفاً بلا معنى. ويُمنَع كذلك التراجعُ عمّا اعتُمد سابقاً: يُنتج فترةً سالبةً
   لا يعرف النظامُ كيف يسدّدها. */
function extCumGuard(ext, contract, extracts){
  var c = contract || {}, e = ext || {};
  var floor = prevCumByLine(extracts, c, e.id);
  var over = [], back = [];
  (Array.isArray(e.lines)?e.lines:[]).forEach(function(l){
    var cum = Number(l && l.cumQty); if(!isFinite(cum)) cum = 0;
    var max = contractLineQty(c, l.lineId);
    if(cum > max + 1e-9) over.push({ lineId:l.lineId, desc:l.desc||"", cum:cum, max:max });
    var was = Number(floor[l.lineId])||0;
    if(cum < was - 1e-9) back.push({ lineId:l.lineId, desc:l.desc||"", cum:cum, was:was });
  });
  return { ok: over.length===0 && back.length===0, over:over, back:back };
}

/* حارسٌ ثانٍ: **مستخلصٌ مفتوحٌ واحدٌ لكلّ عقد**. وإلا تصارع رقمان على
   «المستخلَص سابقاً» وانحرف الرصيدُ بلا أن يظهر خطأٌ في أيّ شاشة. */
var EXT_OPEN = ["ext_draft","ext_pending_pm","ext_pending_ceo","ext_pending_finance"];
function openExtractOf(extracts, contractId){
  var list = Array.isArray(extracts) ? extracts : [];
  for(var i=0;i<list.length;i++){
    var e=list[i];
    if(e && e.contractId===contractId && EXT_OPEN.indexOf(e.status)!==-1) return e;
  }
  return null;
}

/* أيامُ التأخّر عن مدة العقد — تُقترَح آلياً ويبقى المبلغُ قابلاً للتعديل باعتماد. */
function lateDaysOf(contract, asOf){
  var c = contract || {};
  if(!c.startDate || !c.durationDays) return 0;
  var start = new Date(String(c.startDate));
  if(isNaN(start.getTime())) return 0;
  var due = new Date(start.getTime() + (Number(c.durationDays)||0)*86400000);
  var now = (asOf instanceof Date) ? asOf : new Date(asOf || Date.now());
  var day = 86400000;
  var d = Math.floor((Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()) -
                      Date.UTC(due.getFullYear(),due.getMonth(),due.getDate())) / day);
  return d > 0 ? d : 0;
}
function suggestedPenalty(contract, lateDays){
  var c = contract || {}, pct = Number((c.penalty||{}).perDayPct);
  if(!isFinite(pct) || pct<=0 || !lateDays) return 0;
  var raw = r2(contractValue(c) * pct / 100 * lateDays);
  var cap = Number((c.penalty||{}).capPct);
  if(isFinite(cap) && cap>0) raw = r2(Math.min(raw, contractValue(c)*cap/100));
  return raw;
}

/* توجيهُ المستخلص — دورةٌ **أقصرُ عمداً**: النطاقُ والطرفُ والسعرُ حُسمت في العقد،
   والمستخلصُ لا يقرّر إلا **كم أُنجِز**. فإعادةُ المشتريات والمالية والتنفيذي كلَّ
   شهرٍ تشلّ الدورةَ بلا قرارٍ جديدٍ تحميه. والبوّابةُ تُحسب على **الصافي**. */
function extNextStage(ext, netAmount, ceoThreshold){
  var e = ext || {};
  if(!e.pmApprovedAt) return "ext_pending_pm";
  var net = Number(netAmount); if(!isFinite(net)) net = 0;
  var th  = Number(ceoThreshold); if(!isFinite(th)) th = 0;
  var ceoOk = !!e.ceoApprovedAt && net <= (Number(e.ceoApprovedAmount)||0) + 0.01;
  if(th > 0 && net >= th && !ceoOk) return "ext_pending_ceo";
  return "ext_pending_finance";
}
var EXT_GATES = {
  ext_pending_pm:      { roles:["project_manager","admin"], lbl:"مدير المشاريع" },
  ext_pending_ceo:     { roles:["ceo","admin"],             lbl:"المدير التنفيذي" },
  ext_pending_finance: { roles:["finance","admin"],         lbl:"المالية — السداد" }
};
function extGateOwner(s){ return EXT_GATES[s] || null; }
function extCanAct(status, role){ var g=EXT_GATES[status]; return !!g && g.roles.indexOf(role)!==-1; }
var EXT_FINAL = ["ext_paid","ext_cancelled"];
function extIsFinal(s){ return EXT_FINAL.indexOf(s)!==-1; }

/* ════ الربطُ بالموازنة ════   [المرحلة ٥]

   الموازنةُ اليوم ثلاثيةٌ (مصروف / مرتبط / متبقٍّ) من طلبات الشراء وحدَها. والتعاقدُ
   يضيف حالتين حقيقيتين قبل الصرف، فتصير خمساً:

     الموازنة │ قيدَ الاعتماد │ متعاقَدٌ عليه │ مصروف │ المتبقّي

   • **قيدَ الاعتماد** — طلبُ تعاقدٍ لم يُعتمد بعد: التزامٌ **محتمَل**. وهو الفائدةُ
     المباشرةُ من فصل الطلب عن العقد: يُرى الالتزامُ **قبل** توقيعه، وهي اللحظةُ
     الوحيدةُ التي يبقى المنعُ فيها بلا كلفة.
   • **متعاقَدٌ عليه** — قيمةُ العقد **ناقصَ ما استُخلِص منه**؛ وإلا حُسب المبلغُ مرّتين.

   وقاعدةُ **منع الازدواج المحاسبي** (تُكتب في `NOTES §3` ويحرسها اختبار):
   مصروفُ التعاقدات من **المستخلصات المسدَّدة وأوامر الدفع المسدَّدة فقط**، وطلبُ شراءٍ
   يحمل `contractId` **يُستبعَد** من مصروف الشراء لأنه جزءٌ من عقدٍ محسوبٍ أصلاً. */

/* مفتاحُ مشروعٍ من معرّف إدارة المشاريع (مسجَّلٌ أو يدويٌّ بالبادئة) — إلى اصطلاح
   `__CUSTOM__:` الذي تجمّع به النواة. مصدرٌ واحدٌ فلا ينحرف التجميع بين شاشتين. */
function projectKeyOfPm(pmId, prefix){
  var pfx = prefix || "__MPN__:";
  var s = String(pmId||"");
  if(s.indexOf(pfx) === 0) return "__CUSTOM__:" + s.slice(pfx.length);
  return s;
}

/* هل هذا الطلبُ قيدَ الاعتماد فعلاً؟ لا نهائيٌّ ولا مرتدٌّ لمُنشئه. */
function reqIsPending(r){
  var s = (r||{}).status;
  return !!s && !crqIsFinal(s) && !crqIsBounced(s) && s !== "crq_draft";
}
/* العقدُ يُعدّ التزاماً قائماً ما دام لم يُقفَل أو يُفسَخ — ويشمل «بانتظار التوقيع»:
   الطلبُ اعتُمد والمالُ التزم، وإن لم تُوقَّع الورقةُ بعد. */
function ctrIsCommitted(c){
  var s=(c||{}).status;
  return s==="ctr_pending_signature" || s==="ctr_active" || s==="ctr_suspended" || s==="ctr_completed";
}

/* تجميعُ التعاقدات لمشروعٍ واحد — بندَ موازنةٍ بندَ موازنة، وإجمالياً.
   دالةٌ نقيةٌ تأخذ القوائمَ فتُختبَر بلا Firestore. */
function contractRollup(projectKey, requests, contracts, extracts, changes){
  var out = { byCat:{}, total:{ pending:0, contracted:0, spent:0 } };
  function bucket(k){
    var key = k || "uncategorized";
    if(!out.byCat[key]) out.byCat[key] = { pending:0, contracted:0, spent:0 };
    return out.byCat[key];
  }

  // (١) قيدَ الاعتماد — من طلبات التعاقد غير المنتهية
  (Array.isArray(requests)?requests:[]).forEach(function(r){
    if(docProjectKey(r) !== projectKey) return;
    if(!reqIsPending(r)) return;
    var v = r2(r.value);
    bucket(r.budgetCategoryKey).pending += v;
    out.total.pending += v;
  });

  // (٢) متعاقَدٌ عليه = قيمةُ العقد − المستخلَصُ منه (بلا ازدواج)، و(٣) المصروفُ من المسدَّد
  // **المالُ المدفوعُ مصروفٌ أبداً** مهما صارت حالةُ العقد: العقدُ المُقفَل أو المفسوخ
  // يسقط عنه *الالتزامُ المتبقّي* فقط، أمّا ما خرج من الخزينة فلا يعود. لذلك يُحسَب
  // `spent` خارجَ حارسِ `ctrIsCommitted`، و`contracted` وحدَه بداخله.
  (Array.isArray(contracts)?contracts:[]).forEach(function(c){
    if(docProjectKey(c) !== projectKey) return;
    var b = bucket(c.budgetCategoryKey);
    var val = contractValue(c);
    var paid = 0;
    (Array.isArray(extracts)?extracts:[]).forEach(function(e){
      if(e && e.contractId===c.id && e.status==="ext_paid") paid += r2((e.payment||{}).amount);
    });
    paid = r2(paid);
    b.spent += paid; out.total.spent += paid;
    if(!ctrIsCommitted(c)) return;              // انتهى العقد ⇒ لا التزامَ متبقّياً
    var remaining = r2(Math.max(0, val - paid));
    b.contracted += remaining; out.total.contracted += remaining;
  });

  // (٣-ب) أوامرُ التغيير المعلّقة — التزامٌ **قيدَ الاعتماد** لا متعاقَدٌ عليه بعد.
  // المطبَّقُ منها داخلٌ أصلاً في `contractValue` أعلاه، فعدُّه هنا يُكرّره.
  // والخفضُ المعلّق يدخل بإشارته السالبة: فينقص المتوقَّعُ لا يزيد.
  (Array.isArray(changes)?changes:[]).forEach(function(g){
    if(docProjectKey(g) !== projectKey) return;
    if(CHG_OPEN.indexOf((g||{}).status) === -1) return;
    var v = r2(g.amount);
    bucket(g.budgetCategoryKey).pending += v;
    out.total.pending += v;
  });

  // (٤) أوامرُ الدفع المسدَّدة — مصروفٌ تعاقديٌّ لا عقدَ له
  (Array.isArray(requests)?requests:[]).forEach(function(r){
    if(docProjectKey(r) !== projectKey) return;
    if(r.status !== "crq_paid") return;
    var v = r2((r.payment||{}).amount != null ? r.payment.amount : r.value);
    bucket(r.budgetCategoryKey).spent += v;
    out.total.spent += v;
  });

  Object.keys(out.byCat).forEach(function(k){
    var b=out.byCat[k]; b.pending=r2(b.pending); b.contracted=r2(b.contracted); b.spent=r2(b.spent);
  });
  out.total.pending=r2(out.total.pending); out.total.contracted=r2(out.total.contracted); out.total.spent=r2(out.total.spent);
  return out;
}

/* **حارسُ منع الازدواج**: طلبُ شراءٍ يحمل `contractId` جزءٌ من عقدٍ محسوبٍ أصلاً،
   فيُستبعَد من مصروف الشراء. تقرؤها `project-management` فلا تُنسَخ القاعدة. */
function poIsUnderContract(p){ return !!(p && p.contractId); }

/* الغلافُ الذي تستدعيه `project-management`: يضمن تشغيلَ المستمعين ثم يجمّع. */
function rollupForProject(pmProjectId){
  startReqSync(); startCtrSync(); startExtSync(); startChgSync();
  return contractRollup(projectKeyOfPm(pmProjectId, pmManualPrefix()), _reqs, _ctrs, _exts, _chgs);
}
function contractsLoaded(){ return _rLoaded && _cLoaded && _eLoaded && _gLoaded; }

/* حالةُ وثيقةِ طرفٍ من تاريخ انتهائها: `none` بلا تاريخ · `ok` · `soon` · `expired`.
   `today` مُمرَّرٌ لا مقروءٌ من الساعة — فالدالةُ نقيةٌ وقابلةٌ للفحص. */
function docExpiryState(expiry, today){
  if(!expiry) return { state:"none", days:null };
  var t = (today instanceof Date) ? today : new Date(today || Date.now());
  var d = new Date(String(expiry));
  if(isNaN(d.getTime())) return { state:"none", days:null };
  var day = 24*60*60*1000;
  var t0 = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  var d0 = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  var days = Math.round((d0 - t0)/day);
  if(days < 0)  return { state:"expired", days:days };
  if(days <= DOC_SOON_DAYS) return { state:"soon", days:days };
  return { state:"ok", days:days };
}

/* هويةُ الطرف الرسمية — مصدرٌ **واحدٌ** لما يُعرَض ويُبحَث ويُدقَّق، مهما كانت صفتُه.
   المنشأةُ تُعرَف بسجلها التجاري، والشخصُ بهويته أو إقامته. كلُّ شاشةٍ تقرأ هذه
   الدالة فلا تُكرَّر شروطُ «إن كان شخصاً» في عشرة مواضع تفترق بعد شهر. */
function identityOf(vendor){
  var v = vendor || {}, lg = v.legal || {};
  if(normEntity(v.entityType) === "individual"){
    var t = ID_TYPES[lg.idType] ? lg.idType : "national";
    return { entity:"individual", label:(ID_TYPES[t]||ID_TYPES.national).lbl, idType:t,
             number:String(lg.idNumber||""), expiry:String(lg.idExpiry||"") };
  }
  return { entity:"establishment", label:"السجل التجاري", idType:"cr",
           number:String(lg.crNumber||""), expiry:String(lg.crExpiry||"") };
}

/* وضعُ الضريبة المقترَحُ لعقدٍ مع هذا الطرف.
   الشخصُ غيرُ المسجَّل ⇐ `none`: لا تُضاف ضريبةٌ ولا تُستخرَج من مستحقّه. والاقتراحُ
   **يُقترَح ولا يُفرَض** — يبقى قابلاً للتغيير على العقد، فقد يكون الفردُ مسجَّلاً. */
function suggestVatMode(vendor){
  var v = vendor || {};
  if(v.taxRegistered === true) return "excl";
  if(v.taxRegistered === false) return "none";
  if(normEntity(v.entityType) === "individual") return "none";
  return ((v.legal||{}).vatNumber) ? "excl" : "none";
}

/* كلُّ ما له تاريخُ انتهاءٍ عند الطرف — الوثائقُ **وهويتُه الرسمية**.
   محرّكُ الانتهاء واحدٌ لا اثنان: لو بقيت الهويةُ خارجه لمرّت إقامةٌ منتهيةٌ بلا تنبيه. */
function allExpiring(vendor){
  var v = vendor || {};
  var out = (Array.isArray(v.docs) ? v.docs : []).slice();
  var id = identityOf(v);
  if(id.expiry) out.push({ type:(id.entity==="individual" ? "identity" : "cr"), number:id.number, expiry:id.expiry, _identity:true });
  return out;
}

/* أسوأُ حالةِ وثيقةٍ لدى طرف — هي حالةُ امتثاله المعروضة. */
function vendorComplianceState(vendor, today){
  var docs = allExpiring(vendor);
  var worst = "none", expired = 0, soon = 0;
  docs.forEach(function(dc){
    var s = docExpiryState(dc && dc.expiry, today).state;
    if(s === "expired"){ expired++; worst = "expired"; }
    else if(s === "soon"){ soon++; if(worst !== "expired") worst = "soon"; }
    else if(s === "ok" && worst === "none"){ worst = "ok"; }
  });
  return { state:worst, expired:expired, soon:soon, total:docs.length };
}

/* هل يصلح هذا الطرفُ للإسناد الآن؟ **استرشاديٌّ لا مانع** — يُحذَّر ولا يُمنَع،
   إلا المحظور فهو قرارُ أدمنٍ صريحٌ لا اجتهادَ فيه. */
function vendorEligibility(vendor, today){
  var v = vendor || {};
  var comp = vendorComplianceState(v, today);
  var id   = identityOf(v);
  if(v.status === "blacklisted") return { ok:false, block:true,  reason:"الطرف محظور — لا يجوز الإسناد إليه" };
  if(v.status === "suspended")   return { ok:false, block:false, reason:"الطرف موقوف مؤقتاً" };
  // هويةُ الشخص المنتهيةُ ليست كشهادةٍ متأخّرة: التعاقدُ معه عليها مسؤوليةٌ نظاميةٌ
  // علينا نحن. تبقى تحذيراً لا منعاً (فلسفةُ المنصة)، لكن بنصٍّ لا يحتمل التأويل.
  if(id.expiry && docExpiryState(id.expiry, today).state === "expired"){
    return { ok:false, block:false, reason:id.label+" منتهية — راجعها قبل الإسناد" };
  }
  if(!id.number) return { ok:false, block:false, reason:id.label+" غير مسجَّل" };
  if(comp.expired > 0)           return { ok:false, block:false, reason:"لديه "+comp.expired+" وثيقةً منتهية" };
  if(comp.soon > 0)              return { ok:true,  block:false, reason:comp.soon+" وثيقةٌ توشك على الانتهاء" };
  return { ok:true, block:false, reason:"" };
}

/* ════════════════════════════════════════════════════════════════════
   ٣) جسورُ النواة — تُقرأ بالاسم، ومع مهرَبٍ آمنٍ لكلّ واحد
   ════════════════════════════════════════════════════════════════════ */
function _db(){ try{ return (typeof db!=="undefined" && db) ? db : null; }catch(e){ return null; } }
function _storage(){ try{ return (typeof storage!=="undefined" && storage) ? storage : null; }catch(e){ return null; } }
function _esc(s){ try{ return esc(s); }catch(e){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); } }
/* كلُّ معاملات onclick النصية عبر `_jq` لا `esc` — درسُ v18.9vu-H5. */
function _jq(s){ try{ return _jsq(s); }catch(e){ return String(s==null?"":s).replace(/\\/g,"\\\\").replace(/'/g,"\\'").replace(/[&<>"]/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); } }
function _toast(m,t){ try{ toast(m,t); }catch(e){ console.log(m); } }
function _icn(n,c){ try{ return _ic(n,c); }catch(e){ return ""; } }
function _svg(n){ try{ return _svgIcon(n); }catch(e){ return ""; } }
function _user(){ try{ return currentUser||null; }catch(e){ return null; } }
function _role(){ var u=_user(); return (u && u.role) ? u.role : ""; }
function _me(){ var u=_user(); return (u && u.name) || "النظام"; }
function _now(){ return new Date().toISOString(); }
function _audit(a,d){ try{ if(typeof logAudit==="function") logAudit(a,d); }catch(e){} }
function _confirm(o){ try{ return showConfirm(o); }catch(e){ return Promise.resolve(window.confirm((o&&o.msg)||"تأكيد؟")); } }
function _today(){ return new Date(); }

function money(n){ return (Number(n)||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function money0(n){ return (Number(n)||0).toLocaleString("en-US",{maximumFractionDigits:0}); }

/* سقفُ التنفيذي — **يُقرأ من النواة ولا يُنسَخ**. */
function ceoThreshold(){
  try{ var v=Number(CEO_APPROVAL_THRESHOLD); if(isFinite(v) && v>0) return v; }catch(e){}
  return 2000;
}
function payOrderThreshold(){ return PAY_ORDER_THRESHOLD; }

/* تُقرأ عتبةُ أمر الدفع من وثيقة إعدادات المشتريات نفسِها — فلا وثيقةَ ثانيةٌ تنحرف. */
function loadConfig(){
  var database=_db(); if(!database) return Promise.resolve(PAY_ORDER_THRESHOLD);
  var path = _dev() ? "meta/global_purchase_config_dev" : "meta/global_purchase_config";
  return database.doc(path).get().then(function(s){
    if(s && s.exists){
      var v = Number((s.data()||{}).contractPayOrderThreshold);
      if(isFinite(v) && v > 0) PAY_ORDER_THRESHOLD = v;
    }
    return PAY_ORDER_THRESHOLD;
  }).catch(function(e){ console.warn("contracts/loadConfig", e); return PAY_ORDER_THRESHOLD; });
}

/* ════════════════════════════════════════════════════════════════════
   ٤) الصلاحيات
   ════════════════════════════════════════════════════════════════════ */
var VIEW_ROLES   = ["admin","project_manager","procurement_officer","finance","ceo"];
var EDIT_ROLES   = ["admin","procurement_officer"];   // إنشاءُ/تعديلُ بيانات الطرف
var BANK_ROLES   = ["admin","finance"];               // الآيبان — ناقلُ الاحتيال الأول
var STATUS_ROLES = ["admin"];                         // الإيقافُ والحظر

function canView(){   return VIEW_ROLES.indexOf(_role())   !== -1; }
function canEdit(){   return EDIT_ROLES.indexOf(_role())   !== -1; }
function canBank(){   return BANK_ROLES.indexOf(_role())   !== -1; }
function canStatus(){ return STATUS_ROLES.indexOf(_role()) !== -1; }

/* ════════════════════════════════════════════════════════════════════
   ٥) سجلُّ الأطراف — طبقةُ البيانات
   ════════════════════════════════════════════════════════════════════ */
var _vendors = [];
var _vUnsub  = null;
var _vLoaded = false;
var _vError  = "";

function vendors(){ return _vendors.slice(); }
function vendorById(id){ for(var i=0;i<_vendors.length;i++){ if(_vendors[i].id===id) return _vendors[i]; } return null; }

function startSync(){
  if(_vUnsub) return;                       // idempotent — المستمعُ يُركَّب مرةً واحدة
  var database=_db(); if(!database) return;
  try{
    _vUnsub = database.collection(VENDORS_COL()).onSnapshot(function(snap){
      var out=[];
      snap.forEach(function(d){ var o=d.data()||{}; o.id=d.id; out.push(o); });
      out.sort(function(a,b){ return String(a.name||"").localeCompare(String(b.name||""),"ar"); });
      _vendors=out; _vLoaded=true; _vError="";
      if(_page===PAGE_VENDORS) paintVendors();
    }, function(err){
      console.warn("contracts/vendors sync", err);
      _vError = "تعذّر الاتصال بسجل الأطراف — تحقّق من الشبكة ثم أعِد المحاولة.";
      _vLoaded = true;
      if(_page===PAGE_VENDORS) paintVendors();
    });
  }catch(e){ console.warn("contracts/startSync", e); }
}
function stopSync(){ if(_vUnsub){ try{ _vUnsub(); }catch(e){} _vUnsub=null; } _vendors=[]; _vLoaded=false; }

/* توليدُ المعرّف VND-NNNN بعدّادٍ في معاملة، ومهرَبٌ زمنيٌّ عند تعذّر العدّاد. */
function genVendorId(){
  var fallback = "VND-" + Date.now().toString(36).slice(-6).toUpperCase();
  var database=_db(); if(!database) return Promise.resolve(fallback);
  var ref = database.doc(VENDOR_META());
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      var c = (s.exists && Number((s.data()||{}).counter)) || 0;
      c++;
      t.set(ref, { counter:c, updatedAt:_now() }, { merge:true });
      return c;
    });
  }).then(function(c){ return "VND-" + String(c).padStart(4,"0"); })
    .catch(function(e){ console.warn("contracts/genVendorId", e); return fallback; });
}

/* التطبيعُ العربيُّ لمطابقة الأسماء — همزة/تاء مربوطة/ياء/تشكيل/مسافات.
   نفسُ منطق `finance-audit.js`، فالاسمُ الحرُّ التاريخيُّ يُطابَق بلا مطابِقٍ ثانٍ. */
function normName(s){
  return String(s==null?"":s)
    .replace(/[\u064B-\u065F\u0670]/g,"")
    .replace(/[أإآ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه")
    .replace(/[^\u0600-\u06FF0-9a-zA-Z]+/g," ")
    .trim().replace(/\s+/g," ").toLowerCase();
}
/* كشفُ التكرار — **مفتاحُ التفرّد رقمُ الهوية لا الاسم**.

   هذا فرقٌ جوهريٌّ بين المنشأة والشخص: اسمُ المنشأة فريدٌ في سجلها، أمّا شخصان
   فقد يحملان الاسمَ نفسَه بمشروعيةٍ تامّة. فمنعُ الحفظ لتطابق الاسم يمنع تسجيلَ
   «محمد أحمد» الثاني — وهو خطأٌ يوقف العمل لا يحميه.

   القاعدة: تطابقُ رقم الهوية ⇒ **تكرارٌ مؤكَّدٌ يُمنَع**. وتطابقُ الاسم وحده ⇒
   **تنبيهٌ** يُمنَع للمنشأة (اسمُها معرّفُها) ويُحذَّر منه للشخص (قد يكون سميّاً).
   يُرجَع: { match, byId, block, reason } — و`match=null` يعني لا تكرار. */
function duplicateOf(draft, exceptId, list){
  var d = draft || {};
  var pool = Array.isArray(list) ? list : _vendors;
  var ent  = normEntity(d.entityType);
  var num  = String((identityOf(d).number || "")).replace(/\s+/g,"");
  var k    = normName(d.name);

  for(var i=0;i<pool.length;i++){
    var v = pool[i]; if(!v || v.id === exceptId) continue;
    var vnum = String((identityOf(v).number || "")).replace(/\s+/g,"");
    if(num && vnum && num === vnum){
      return { match:v, byId:true, block:true,
               reason:"هذا الرقم مسجَّل بالفعل للطرف "+v.id+" ("+(v.name||"")+")" };
    }
  }
  if(!k) return { match:null, byId:false, block:false, reason:"" };
  for(var j=0;j<pool.length;j++){
    var u = pool[j]; if(!u || u.id === exceptId) continue;
    var names = [u.name].concat(Array.isArray(u.aliases)?u.aliases:[]);
    for(var m=0;m<names.length;m++){
      if(normName(names[m]) === k){
        return ent === "individual"
          ? { match:u, byId:false, block:false,
              reason:"يوجد شخصٌ بالاسم نفسه ("+u.id+") — تحقّق أنه ليس هو، فالتشابهُ في الأسماء وارد" }
          : { match:u, byId:false, block:true,
              reason:"اسم المنشأة مسجَّل بالفعل للطرف "+u.id };
      }
    }
  }
  return { match:null, byId:false, block:false, reason:"" };
}

function saveVendor(data, id){
  var database=_db();
  if(!database) return Promise.reject(new Error("لا اتصال بقاعدة البيانات"));
  var isNew = !id;
  var pre = isNew ? genVendorId() : Promise.resolve(id);
  return pre.then(function(vid){
    var ref = database.collection(VENDORS_COL()).doc(vid);
    return database.runTransaction(function(t){
      return t.get(ref).then(function(s){
        var cur = (s.exists ? (s.data()||{}) : {});
        var next = Object.assign({}, cur, data);
        // الآيبان لا يُكتب إلا من مخوَّل — ولو وصل في الحمولة من واجهةٍ قديمة
        if(!canBank()) next.bank = cur.bank || { };
        next.updatedAt = _now(); next.updatedBy = _me();
        if(!s.exists){ next.createdAt=_now(); next.createdBy=_me(); }
        t.set(ref, next, { merge:true });
        return next;
      });
    }).then(function(next){
      // تحديثُ الذاكرة المحلية بنتيجة المعاملة فوراً — لا ننتظر اللقطة
      // (درسُ finance-audit: بدونها يُرفَض إجراءٌ مستحقٌّ انتظاراً للقطة).
      next.id = vid;
      var i = _vendors.findIndex(function(v){ return v.id===vid; });
      if(i>=0) _vendors[i]=next; else _vendors.push(next);
      _audit(isNew ? "إضافة طرف تعاقد" : "تعديل بيانات طرف تعاقد", vid + " — " + (data.name||""));
      return vid;
    });
  });
}

function setVendorStatus(id, status, reason){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  var ref = database.collection(VENDORS_COL()).doc(id);
  return ref.set({ status:status, statusReason:reason||"", updatedAt:_now(), updatedBy:_me() }, { merge:true })
    .then(function(){
      var v = vendorById(id); if(v){ v.status=status; v.statusReason=reason||""; }
      _audit("تغيير حالة طرف تعاقد", id + " ⇐ " + ((VENDOR_STATUS[status]||{}).lbl||status) + (reason?(" — "+reason):""));
    });
}

/* رفعُ مستندِ طرفٍ إلى بادئة Storage القائمة. فشلُ الرفع لا يُسجّل وثيقةً بلا ملف. */
function uploadVendorDoc(vid, file, key){
  if(!file) return Promise.resolve(null);
  var st=_storage(); if(!st) return Promise.reject(new Error("خدمة التخزين غير متاحة"));
  var wait = Promise.resolve();
  try{ if(typeof _waitForFirebaseAuth==="function") wait = _waitForFirebaseAuth(); }catch(e){}
  return Promise.resolve(wait).then(function(){
    var isPdf = file.type === "application/pdf";
    var ext = isPdf ? "pdf" : (((file.name||"").split(".").pop()||"jpg").toLowerCase().slice(0,5));
    var ref = st.ref("po/vendors/"+vid+"/"+(key||"doc")+"_"+Date.now()+"."+ext);
    return ref.put(file, isPdf ? {contentType:"application/pdf"} : (file.type?{contentType:file.type}:undefined));
  }).then(function(snap){
    return snap.ref.getDownloadURL().then(function(url){
      return { url:url, name:String(file.name||"").slice(0,120), at:_now(), by:_me() };
    });
  });
}

/* ════════════════════════════════════════════════════════════════════
   ٥-ب) طلباتُ التعاقد — طبقةُ البيانات  [المرحلة ٢]
   ════════════════════════════════════════════════════════════════════ */
var _reqs = [];
var _rUnsub = null, _rLoaded = false, _rError = "";

function requests(){ return _reqs.slice(); }
function requestById(id){ for(var i=0;i<_reqs.length;i++){ if(_reqs[i].id===id) return _reqs[i]; } return null; }

function startReqSync(){
  if(_rUnsub) return;
  var database=_db(); if(!database) return;
  try{
    _rUnsub = database.collection(REQUESTS_COL()).onSnapshot(function(snap){
      var out=[]; snap.forEach(function(d){ var o=d.data()||{}; o.id=d.id; out.push(o); });
      out.sort(function(a,b){ return String(b.createdAt||"").localeCompare(String(a.createdAt||"")); });
      _reqs=out; _rLoaded=true; _rError="";
      if(_page===PAGE_REQS) paintReqs();
    }, function(err){
      console.warn("contracts/requests sync", err);
      _rError = "تعذّر الاتصال بطلبات التعاقد — تحقّق من الشبكة ثم أعِد المحاولة.";
      _rLoaded = true; if(_page===PAGE_REQS) paintReqs();
    });
  }catch(e){ console.warn("contracts/startReqSync", e); }
}
function stopReqSync(){ if(_rUnsub){ try{ _rUnsub(); }catch(e){} _rUnsub=null; } _reqs=[]; _rLoaded=false; }

function genReqId(){
  var now=new Date();
  var yr=String(now.getFullYear()).slice(-2), mon=String(now.getMonth()+1).padStart(2,"0");
  var fallback="CRQ-"+yr+mon+"-"+Date.now().toString(36).slice(-5).toUpperCase();
  var database=_db(); if(!database) return Promise.resolve(fallback);
  var ref=database.doc(_dev()?"meta/global_contract_requests_counter_dev":"meta/global_contract_requests_counter");
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      var c=(s.exists && Number((s.data()||{}).counter))||0; c++;
      t.set(ref,{counter:c,updatedAt:_now()},{merge:true}); return c;
    });
  }).then(function(c){ return "CRQ-"+yr+mon+"-"+String(c).padStart(4,"0"); })
    .catch(function(e){ console.warn("contracts/genReqId",e); return fallback; });
}

function _pushTimeline(doc, event, code, note){
  if(!Array.isArray(doc.timeline)) doc.timeline=[];
  doc.timeline.push({ event:event, code:code, by:_me(), at:_now(), note:note||"" });
  return doc;
}

/* الإنشاء: القيمةُ تُحسب من البنود، والحالةُ من `crqNextStage` — لا من الشاشة. */
function createRequest(draft){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال بقاعدة البيانات"));
  return genReqId().then(function(id){
    var doc = Object.assign({}, draft);
    doc.value = crqValueOf(doc);
    doc.createdAt=_now(); doc.createdBy=_me(); doc.createdByUser=_meUser();
    doc.status = crqNextStage(doc, ceoThreshold());
    _pushTimeline(doc, "إنشاء الطلب", "created",
      (ENGAGEMENTS[doc.engagement]||{}).lbl + " — " + money(doc.value) + " ر.س");
    return database.collection(REQUESTS_COL()).doc(id).set(doc).then(function(){
      doc.id=id; _reqs.unshift(doc);
      _audit("إنشاء طلب تعاقد", id+" — "+(doc.vendorName||"")+" — "+money(doc.value)+" ر.س");
      _notify("طلب تعاقد جديد", id+" — "+(doc.vendorName||"")+" — "+money(doc.value)+" ر.س", id);
      return id;
    });
  });
}

/* كلُّ إجراءٍ على الطلب **معاملةٌ تقرأ الوثيقة الطازجة** ثم تطبّق التعديل وتحدّث
   الذاكرة المحلية بنتيجتها — فلا يدهس معتمِدان متزامنان عملَ بعضهما، ولا يُرفَض
   إجراءٌ مستحقٌّ انتظاراً للقطة (درسُ finance-audit). */
function actOnRequest(id, action, note){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  var ref = database.collection(REQUESTS_COL()).doc(id);
  var role = _role(), th = ceoThreshold();
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      if(!s.exists) throw new Error("الطلب غير موجود");
      var r = s.data()||{}; r.id = id;
      var st = r.status;
      if(crqIsFinal(st)) throw new Error("الطلب في حالةٍ نهائية — لا إجراء عليه");
      if(!crqCanAct(st, role)) throw new Error("هذه البوّابة ليست لدورك");

      if(action === "approve"){
        if(st === "crq_pending_pm"){ r.pmApprovedAt=_now(); r.pmApprovedBy=_me(); }
        else if(st === "crq_pending_proc"){ r.procApprovedAt=_now(); r.procApprovedBy=_me(); r.procApprovedKey=crqProcKey(r); }
        else if(st === "crq_pending_finance"){ r.financeApprovedAt=_now(); r.financeApprovedBy=_me(); r.financeApprovedKey=crqFinanceKey(r); }
        else if(st === "crq_pending_ceo"){ r.ceoApprovedAt=_now(); r.ceoApprovedBy=_me(); r.ceoApprovedAmount=r2(r.value); }
        else if(st === "crq_pending_pay") throw new Error("السداد يُسجَّل بإيصال");
        _pushTimeline(r, "اعتماد — "+(crqGateOwner(st)||{}).lbl, "approved", note);
        r.status = crqNextStage(r, th);
      } else if(action === "reject"){
        if(!note) throw new Error("سبب الرفض إلزامي");
        var REJ = { crq_pending_pm:"crq_pm_rejected", crq_pending_proc:"crq_proc_returned",
                    crq_pending_finance:"crq_finance_returned", crq_pending_ceo:"crq_ceo_rejected",
                    crq_pending_pay:"crq_finance_returned" };
        r.status = REJ[st] || "crq_cancelled";
        _pushTimeline(r, "رفض/إعادة — "+(crqGateOwner(st)||{}).lbl, "rejected", note);
      } else throw new Error("إجراء غير معروف");

      r.updatedAt=_now(); r.updatedBy=_me();
      var out = Object.assign({}, r); delete out.id;
      t.set(ref, out, { merge:true });
      return r;
    });
  }).then(function(r){
    var i=_reqs.findIndex(function(x){ return x.id===id; });
    if(i>=0) _reqs[i]=r; else _reqs.unshift(r);
    _audit("إجراء على طلب تعاقد", id+" ⇐ "+(CRQ_STATUS[r.status]||r.status));
    _notify("طلب تعاقد "+id, CRQ_STATUS[r.status]||r.status, id);
    return r;
  });
}

/* تسجيلُ سداد أمر الدفع — **المالية فقط وبإيصالٍ إلزاميّ**، ويُغلق الطلب. */
function payRequest(id, payload){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  if(!payload || !payload.receiptUrl) return Promise.reject(new Error("إيصال السداد إلزامي"));
  var ref = database.collection(REQUESTS_COL()).doc(id), role=_role();
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      if(!s.exists) throw new Error("الطلب غير موجود");
      var r=s.data()||{}; r.id=id;
      if(r.status !== "crq_pending_pay") throw new Error("الطلب ليس بانتظار السداد");
      if(["finance","admin"].indexOf(role) === -1) throw new Error("السداد للمالية فقط");
      r.payment = { amount:r2(payload.amount!=null?payload.amount:r.value), ref:payload.ref||"",
                    receiptUrl:payload.receiptUrl, at:_now(), by:_me() };
      r.status = "crq_paid";
      _pushTimeline(r, "سداد أمر الدفع", "paid", money(r.payment.amount)+" ر.س"+(payload.ref?(" — "+payload.ref):""));
      r.updatedAt=_now(); r.updatedBy=_me();
      var out=Object.assign({},r); delete out.id;
      t.set(ref, out, { merge:true });
      return r;
    });
  }).then(function(r){
    var i=_reqs.findIndex(function(x){ return x.id===id; });
    if(i>=0) _reqs[i]=r;
    _audit("سداد أمر دفع", id+" — "+money(r.payment.amount)+" ر.س");
    return r;
  });
}

/* إلغاءُ الطلب — لمُنشئه أو الأدمن، وما لم يصر نهائياً. */
function cancelRequest(id, reason){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  var ref=database.collection(REQUESTS_COL()).doc(id), me=_meUser(), role=_role();
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      if(!s.exists) throw new Error("الطلب غير موجود");
      var r=s.data()||{}; r.id=id;
      if(crqIsFinal(r.status)) throw new Error("الطلب في حالةٍ نهائية");
      if(role!=="admin" && r.createdByUser!==me) throw new Error("الإلغاء لمُنشئ الطلب أو الأدمن");
      r.status="crq_cancelled";
      _pushTimeline(r, "إلغاء الطلب", "cancelled", reason||"");
      r.updatedAt=_now(); r.updatedBy=_me();
      var out=Object.assign({},r); delete out.id;
      t.set(ref,out,{merge:true});
      return r;
    });
  }).then(function(r){
    var i=_reqs.findIndex(function(x){ return x.id===id; });
    if(i>=0) _reqs[i]=r;
    _audit("إلغاء طلب تعاقد", id+(reason?(" — "+reason):""));
    return r;
  });
}

/* ════════════════════════════════════════════════════════════════════
   ٥-ج) العقود — طبقةُ البيانات  [المرحلة ٣]
   ════════════════════════════════════════════════════════════════════ */
var _ctrs = [];
var _cUnsub = null, _cLoaded = false, _cError = "";

function contractsList(){ return _ctrs.slice(); }
function contractById(id){ for(var i=0;i<_ctrs.length;i++){ if(_ctrs[i].id===id) return _ctrs[i]; } return null; }
function contractForRequest(reqId){ for(var i=0;i<_ctrs.length;i++){ if(_ctrs[i].requestId===reqId) return _ctrs[i]; } return null; }

function startCtrSync(){
  if(_cUnsub) return;
  var database=_db(); if(!database) return;
  try{
    _cUnsub = database.collection(CONTRACTS_COL()).onSnapshot(function(snap){
      var out=[]; snap.forEach(function(d){ var o=d.data()||{}; o.id=d.id; out.push(o); });
      out.sort(function(a,b){ return String(b.createdAt||"").localeCompare(String(a.createdAt||"")); });
      _ctrs=out; _cLoaded=true; _cError="";
      if(_page===PAGE_CTRS) paintCtrs();
      if(_page===PAGE_REQS) paintReqs();     // بطاقةُ الطلب تعرض رابطَ عقده
    }, function(err){
      console.warn("contracts/contracts sync", err);
      _cError="تعذّر الاتصال بالعقود — تحقّق من الشبكة ثم أعِد المحاولة.";
      _cLoaded=true; if(_page===PAGE_CTRS) paintCtrs();
    });
  }catch(e){ console.warn("contracts/startCtrSync", e); }
}
function stopCtrSync(){ if(_cUnsub){ try{ _cUnsub(); }catch(e){} _cUnsub=null; } _ctrs=[]; _cLoaded=false; }

function genCtrId(){
  var now=new Date();
  var yr=String(now.getFullYear()).slice(-2), mon=String(now.getMonth()+1).padStart(2,"0");
  var fallback="CTR-"+yr+mon+"-"+Date.now().toString(36).slice(-5).toUpperCase();
  var database=_db(); if(!database) return Promise.resolve(fallback);
  var ref=database.doc(_dev()?"meta/global_contracts_counter_dev":"meta/global_contracts_counter");
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      var c=(s.exists && Number((s.data()||{}).counter))||0; c++;
      t.set(ref,{counter:c,updatedAt:_now()},{merge:true}); return c;
    });
  }).then(function(c){ return "CTR-"+yr+mon+"-"+String(c).padStart(4,"0"); })
    .catch(function(e){ console.warn("contracts/genCtrId",e); return fallback; });
}

/* التحويلُ إلى عقد — **معاملةٌ واحدةٌ ذرّية** تكتب العقدَ وتوسم الطلبَ معاً.

   حارسُ التكرار داخلَ المعاملة لا قبلها: القراءةُ المسبقةُ تسمح لضغطتين متزامنتين
   بالمرور معاً فينشأ عقدان لطلبٍ واحد. وحين يكون الطلبُ محوَّلاً سلفاً **لا نرمي
   خطأً غامضاً** بل نُرجع معرّفَ عقده — فالضغطةُ الثانية غالباً نقرةٌ مكرّرة، والمستخدمُ
   يريد أن يرى عقده لا رسالةَ فشل. */
function convertToContract(reqId){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال بقاعدة البيانات"));
  var role=_role();
  if(["procurement_officer","admin"].indexOf(role) === -1) return Promise.reject(new Error("إنشاء العقد للمشتريات أو الأدمن"));
  var reqRef = database.collection(REQUESTS_COL()).doc(reqId);
  return loadClauseTemplates().then(genCtrId).then(function(newId){
    return database.runTransaction(function(t){
      return t.get(reqRef).then(function(s){
        if(!s.exists) throw new Error("الطلب غير موجود");
        var r=s.data()||{}; r.id=reqId;
        if(r.status === "crq_converted" && r.contractId){
          return { id:r.contractId, already:true };   // نقرةٌ مكرّرة — لا عقدَ ثانٍ
        }
        if(r.status !== "crq_approved") throw new Error("الطلب ليس معتمَداً — لا يُنشأ منه عقد");
        var at=_now(), by=_me();
        var ctr = contractFromRequest(r, newId, at, by, clauseTemplates());
        ctr.advance.amount = advanceAmountOf(ctr);
        var out = Object.assign({}, ctr); delete out.id;
        t.set(database.collection(CONTRACTS_COL()).doc(newId), out);
        r.status="crq_converted"; r.contractId=newId; r.updatedAt=at; r.updatedBy=by;
        _pushTimeline(r, "إنشاء العقد "+newId, "converted", "");
        var rOut=Object.assign({}, r); delete rOut.id;
        t.set(reqRef, rOut, { merge:true });
        return { id:newId, already:false, contract:Object.assign({id:newId}, ctr), request:r };
      });
    });
  }).then(function(res){
    if(res.already) return res.id;
    // تحديثُ الذاكرة المحلية بنتيجة المعاملة فوراً (درسُ finance-audit)
    if(res.contract){ var ci=_ctrs.findIndex(function(x){ return x.id===res.id; }); if(ci<0) _ctrs.unshift(res.contract); }
    if(res.request){ var ri=_reqs.findIndex(function(x){ return x.id===reqId; }); if(ri>=0) _reqs[ri]=res.request; }
    _audit("إنشاء عقد من طلب تعاقد", res.id+" ← "+reqId);
    _notify("عقدٌ جديد "+res.id, (res.contract&&res.contract.vendorName)||"", res.id);
    return res.id;
  });
}


/* ── قوالبُ الشروط: يديرها الأدمن، وتُقرأ مرةً وتُخزَّن في وثيقةٍ واحدة ── */
var _clauseTpl = null;
function CLAUSE_DOC(){ return _dev() ? "meta/contract_clause_templates_dev" : "meta/contract_clause_templates"; }
function clauseTemplates(){ return Array.isArray(_clauseTpl) ? _clauseTpl.slice() : DEFAULT_CLAUSES.slice(); }
function loadClauseTemplates(){
  if(_clauseTpl) return Promise.resolve(_clauseTpl);
  var database=_db(); if(!database){ _clauseTpl=DEFAULT_CLAUSES.slice(); return Promise.resolve(_clauseTpl); }
  return database.doc(CLAUSE_DOC()).get().then(function(snap){
    var d=(snap&&snap.exists)?(snap.data()||{}):{};
    _clauseTpl = Array.isArray(d.clauses) && d.clauses.length ? d.clauses : DEFAULT_CLAUSES.slice();
    return _clauseTpl;
  }).catch(function(e){ console.warn("contracts/loadClauseTemplates",e); _clauseTpl=DEFAULT_CLAUSES.slice(); return _clauseTpl; });
}
function saveClauseTemplates(list){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  if(_role()!=="admin") return Promise.reject(new Error("قوالب الشروط للأدمن فقط"));
  return database.doc(CLAUSE_DOC()).set({ clauses:list, updatedAt:_now(), updatedBy:_me() }, {merge:true})
    .then(function(){ _clauseTpl=list.slice(); _audit("تعديل قوالب شروط العقود", list.length+" بنداً"); });
}

/* تحديثُ شروط عقدٍ بعينه — نسختُه وحدَها، ولا تمسّ القالبَ ولا عقداً آخر. */
function saveContractClauses(id, clauses){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  if(["procurement_officer","project_manager","admin"].indexOf(_role())===-1) return Promise.reject(new Error("لا صلاحية"));
  var ref=database.collection(CONTRACTS_COL()).doc(id);
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      if(!s.exists) throw new Error("العقد غير موجود");
      var c=s.data()||{}; c.id=id;
      if(c.status!=="ctr_pending_signature" && c.status!=="ctr_active") throw new Error("لا تُعدَّل شروطُ عقدٍ منتهٍ أو مفسوخ");
      c.clauses=clauses; c.updatedAt=_now(); c.updatedBy=_me();
      _pushTimeline(c, "تعديل شروط العقد", "clauses", clauses.length+" بنداً");
      var out=Object.assign({},c); delete out.id;
      t.set(ref,out,{merge:true});
      return c;
    });
  }).then(function(c){
    var i=_ctrs.findIndex(function(x){ return x.id===id; });
    if(i>=0) _ctrs[i]=c;
    _audit("تعديل شروط عقد", id);
    return c;
  });
}

/* تسجيلُ التوقيع — **النسخةُ الموقّعةُ إلزامية**: بدونها لا معنى للحالة الجديدة،
   وكان العقدُ سيصير سارياً بضغطةٍ بلا إثبات. */
function signContract(id, att){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  if(!att || !att.url) return Promise.reject(new Error("صورة العقد الموقَّع إلزامية"));
  var role=_role();
  if(!ctrCanTransit("sign","ctr_pending_signature",role)) return Promise.reject(new Error("تسجيل التوقيع ليس لدورك"));
  var ref=database.collection(CONTRACTS_COL()).doc(id);
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      if(!s.exists) throw new Error("العقد غير موجود");
      var c=s.data()||{}; c.id=id;
      if(c.status!=="ctr_pending_signature") throw new Error("العقد ليس بانتظار التوقيع");
      c.signedDocs=(Array.isArray(c.signedDocs)?c.signedDocs:[]).concat([att]);
      c.signedAt=_now(); c.signedBy=_me();
      c.status="ctr_active";
      _pushTimeline(c, "تسجيل توقيع الطرف — العقد ساري", "signed", att.name||"");
      c.updatedAt=_now(); c.updatedBy=_me();
      var out=Object.assign({},c); delete out.id;
      t.set(ref,out,{merge:true});
      return c;
    });
  }).then(function(c){
    var i=_ctrs.findIndex(function(x){ return x.id===id; });
    if(i>=0) _ctrs[i]=c;
    _audit("تسجيل توقيع عقد", id);
    return c;
  });
}

/* انتقالُ حالةِ العقد — القاعدةُ نفسُها التي تحرس الأزرار تحرس المعاملة. */
function transitContract(id, action, reason){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  var role=_role(), t=CTR_TRANSITIONS[action];
  if(!t) return Promise.reject(new Error("إجراء غير معروف"));
  if(t.needsReason && !reason) return Promise.reject(new Error("السبب إلزامي"));
  var ref=database.collection(CONTRACTS_COL()).doc(id);
  return database.runTransaction(function(tx){
    return tx.get(ref).then(function(s){
      if(!s.exists) throw new Error("العقد غير موجود");
      var c=s.data()||{}; c.id=id;
      if(!ctrCanTransit(action, c.status, role)) throw new Error("لا يجوز هذا الإجراء على حالة العقد الحالية أو ليس لدورك");
      c.status=t.to;
      if(action==="close") c.retention = Object.assign({}, c.retention||{}, { released: r2(contractValue(c) * (Number((c.retention||{}).pct)||0) / 100) });
      _pushTimeline(c, t.lbl, action, reason||"");
      c.updatedAt=_now(); c.updatedBy=_me();
      var out=Object.assign({},c); delete out.id;
      tx.set(ref, out, { merge:true });
      return c;
    });
  }).then(function(c){
    var i=_ctrs.findIndex(function(x){ return x.id===id; });
    if(i>=0) _ctrs[i]=c;
    _audit("تغيير حالة عقد", id+" ⇐ "+(CTR_STATUS[c.status]||c.status)+(reason?(" — "+reason):""));
    return c;
  });
}

/* ════════════════════════════════════════════════════════════════════
   ٥-د) المستخلصات — طبقةُ البيانات  [المرحلة ٤]
   ════════════════════════════════════════════════════════════════════ */
var _exts = [];
var _eUnsub = null, _eLoaded = false;

function extractsList(){ return _exts.slice(); }
function extractById(id){ for(var i=0;i<_exts.length;i++){ if(_exts[i].id===id) return _exts[i]; } return null; }
function extractsFor(cid){ return _exts.filter(function(e){ return e.contractId===cid; }); }

function startExtSync(){
  if(_eUnsub) return;
  var database=_db(); if(!database) return;
  try{
    _eUnsub = database.collection(EXTRACTS_COL()).onSnapshot(function(snap){
      var out=[]; snap.forEach(function(d){ var o=d.data()||{}; o.id=d.id; out.push(o); });
      out.sort(function(a,b){ return String(a.createdAt||"").localeCompare(String(b.createdAt||"")); });
      _exts=out; _eLoaded=true;
      if(_page===PAGE_CTRS) paintCtrs();
    }, function(err){ console.warn("contracts/extracts sync", err); _eLoaded=true; });
  }catch(e){ console.warn("contracts/startExtSync", e); }
}
function stopExtSync(){ if(_eUnsub){ try{ _eUnsub(); }catch(e){} _eUnsub=null; } _exts=[]; _eLoaded=false; }

function genExtId(){
  var now=new Date();
  var yr=String(now.getFullYear()).slice(-2), mon=String(now.getMonth()+1).padStart(2,"0");
  var fallback="EXT-"+yr+mon+"-"+Date.now().toString(36).slice(-5).toUpperCase();
  var database=_db(); if(!database) return Promise.resolve(fallback);
  var ref=database.doc(_dev()?"meta/global_contract_extracts_counter_dev":"meta/global_contract_extracts_counter");
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      var c=(s.exists && Number((s.data()||{}).counter))||0; c++;
      t.set(ref,{counter:c,updatedAt:_now()},{merge:true}); return c;
    });
  }).then(function(c){ return "EXT-"+yr+mon+"-"+String(c).padStart(4,"0"); })
    .catch(function(e){ console.warn("contracts/genExtId",e); return fallback; });
}

/* سياقُ حساب المستخلص — يُجمَع مرةً ويُمرَّر لـ`extNet`، فلا تُحسب أرقامُه مرتين. */
function extCtx(ext, contract){
  return {
    prevGross: prevGrossOf(_exts, contract, ext && ext.id),
    materialsIssued: Number((ext||{}).materialsIssued)||0,
    penaltyAmount:   Number((ext||{}).penaltyAmount)||0,
    ncDeduction:     Number((ext||{}).ncDeduction)||0
  };
}
function extCalc(ext, contract){ return extNet(ext, contract, extCtx(ext, contract)); }

function createExtract(contract, draft){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال بقاعدة البيانات"));
  if(["project_manager","admin"].indexOf(_role()) === -1) return Promise.reject(new Error("إعداد المستخلص لمدير المشروع أو الأدمن"));
  if(!contract || contract.status !== "ctr_active") return Promise.reject(new Error("المستخلص لا يُنشأ إلا على عقدٍ ساري"));
  var open = openExtractOf(_exts, contract.id);
  if(open) return Promise.reject(new Error("يوجد مستخلصٌ مفتوحٌ ("+open.id+") — أغلِقه أولاً"));
  var g = extCumGuard(draft, contract, _exts);
  if(!g.ok) return Promise.reject(new Error(_guardMsg(g)));
  var calc = extNet(draft, contract, { prevGross: prevGrossOf(_exts, contract, null),
    materialsIssued:draft.materialsIssued, penaltyAmount:draft.penaltyAmount, ncDeduction:draft.ncDeduction });
  if(calc.period < 0) return Promise.reject(new Error("قيمة الفترة سالبة — التراكميُّ أقلُّ ممّا اعتُمد سابقاً"));

  return genExtId().then(function(id){
    var doc = Object.assign({}, draft);
    doc.contractId = contract.id;
    doc.createdAt=_now(); doc.createdBy=_me(); doc.createdByUser=_meUser();
    doc.status = extNextStage(doc, calc.net, ceoThreshold());
    _pushTimeline(doc, "إعداد المستخلص", "created", "صافي "+money(calc.net)+" ر.س");
    return database.collection(EXTRACTS_COL()).doc(id).set(doc).then(function(){
      doc.id=id; _exts.push(doc);
      _audit("إعداد مستخلص", id+" — "+contract.id+" — صافي "+money(calc.net)+" ر.س");
      _notify("مستخلصٌ جديد "+id, contract.vendorName||"", id);
      return id;
    });
  });
}

function actOnExtract(id, action, note){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  var ref=database.collection(EXTRACTS_COL()).doc(id), role=_role(), th=ceoThreshold();
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      if(!s.exists) throw new Error("المستخلص غير موجود");
      var e=s.data()||{}; e.id=id;
      if(extIsFinal(e.status)) throw new Error("المستخلص في حالةٍ نهائية");
      if(!extCanAct(e.status, role)) throw new Error("هذه البوّابة ليست لدورك");
      var c=contractById(e.contractId);
      if(!c) throw new Error("عقد المستخلص غير محمَّل");
      var calc=extCalc(e, c);
      if(action==="approve"){
        if(e.status==="ext_pending_pm"){ e.pmApprovedAt=_now(); e.pmApprovedBy=_me(); }
        else if(e.status==="ext_pending_ceo"){ e.ceoApprovedAt=_now(); e.ceoApprovedBy=_me(); e.ceoApprovedAmount=r2(calc.net); }
        else if(e.status==="ext_pending_finance") throw new Error("السداد يُسجَّل بإيصال");
        _pushTimeline(e, "اعتماد — "+(extGateOwner(e.status)||{}).lbl, "approved", note);
        e.status = extNextStage(e, calc.net, th);
      } else if(action==="reject"){
        if(!note) throw new Error("سبب الرفض إلزامي");
        e.status = (e.status==="ext_pending_pm") ? "ext_pm_rejected" : "ext_returned";
        _pushTimeline(e, "رفض/إعادة — "+(extGateOwner(e.status)||{}).lbl, "rejected", note);
      } else throw new Error("إجراء غير معروف");
      e.updatedAt=_now(); e.updatedBy=_me();
      var out=Object.assign({},e); delete out.id;
      t.set(ref, out, { merge:true });
      return e;
    });
  }).then(function(e){
    var i=_exts.findIndex(function(x){ return x.id===id; });
    if(i>=0) _exts[i]=e;
    _audit("إجراء على مستخلص", id+" ⇐ "+(EXT_STATUS[e.status]||e.status));
    return e;
  });
}

/* سدادُ المستخلص — **المالية وبإيصالٍ إلزاميّ**. والمستخلصُ الختاميُّ يُنهي العقد
   فنّياً في المعاملة نفسِها، ويستهلك ما استُردّ من الدفعة المقدمة على العقد. */
function payExtract(id, payload){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  if(!payload || !payload.receiptUrl) return Promise.reject(new Error("إيصال السداد إلزامي"));
  var role=_role();
  if(["finance","admin"].indexOf(role) === -1) return Promise.reject(new Error("السداد للمالية فقط"));
  var eRef=database.collection(EXTRACTS_COL()).doc(id);
  return database.runTransaction(function(t){
    return t.get(eRef).then(function(s){
      if(!s.exists) throw new Error("المستخلص غير موجود");
      var e=s.data()||{}; e.id=id;
      if(e.status !== "ext_pending_finance") throw new Error("المستخلص ليس بانتظار السداد");
      var c=contractById(e.contractId);
      if(!c) throw new Error("عقد المستخلص غير محمَّل");
      var cRef=database.collection(CONTRACTS_COL()).doc(e.contractId);
      return t.get(cRef).then(function(cs){
        if(!cs.exists) throw new Error("العقد غير موجود");
        var fresh=cs.data()||{}; fresh.id=e.contractId;
        var calc=extCalc(e, fresh);
        e.payment={ amount:r2(calc.net), ref:payload.ref||"", receiptUrl:payload.receiptUrl, at:_now(), by:_me() };
        e.settled=calc;                      // لقطةُ السلّم وقت السداد — دليلٌ لا يُعاد حسابه
        e.status="ext_paid";
        _pushTimeline(e, "سداد المستخلص", "paid", money(calc.net)+" ر.س");
        e.updatedAt=_now(); e.updatedBy=_me();
        // استهلاكُ المقدَّم يُراكَم على العقد — فالمستخلصُ التالي يعرف ما تبقّى
        var adv=Object.assign({}, fresh.advance||{});
        adv.recovered = r2((Number(adv.recovered)||0) + calc.advanceRecovery);
        var cPatch={ advance:adv, updatedAt:_now(), updatedBy:_me() };
        if(e.isFinal && fresh.status==="ctr_active"){
          cPatch.status="ctr_completed";
          fresh.status="ctr_completed";
          _pushTimeline(fresh, "إنهاءٌ فنّيٌّ بالمستخلص الختاميّ "+id, "complete", "");
          cPatch.timeline=fresh.timeline;
        }
        var eOut=Object.assign({},e); delete eOut.id;
        t.set(eRef, eOut, { merge:true });
        t.set(cRef, cPatch, { merge:true });
        return { ext:e, adv:adv, done:!!cPatch.status };
      });
    });
  }).then(function(res){
    var i=_exts.findIndex(function(x){ return x.id===id; });
    if(i>=0) _exts[i]=res.ext;
    var c=contractById(res.ext.contractId);
    if(c){ c.advance=res.adv; if(res.done) c.status="ctr_completed"; }
    _audit("سداد مستخلص", id+" — "+money(res.ext.payment.amount)+" ر.س");
    return res.ext;
  });
}

/* ════════════════════════════════════════════════════════════════════
   ٥-هـ) أوامرُ التغيير — طبقةُ البيانات  [المرحلة ٧]
   ════════════════════════════════════════════════════════════════════ */
var _chgs = [];
var _gUnsub = null, _gLoaded = false;

function changesList(){ return _chgs.slice(); }
function changeById(id){ for(var i=0;i<_chgs.length;i++){ if(_chgs[i].id===id) return _chgs[i]; } return null; }
function changesFor(cid){ return _chgs.filter(function(g){ return g.contractId===cid; }); }

function startChgSync(){
  if(_gUnsub) return;
  var database=_db(); if(!database) return;
  try{
    _gUnsub = database.collection(CHANGES_COL()).onSnapshot(function(snap){
      var out=[]; snap.forEach(function(d){ var o=d.data()||{}; o.id=d.id; out.push(o); });
      out.sort(function(a,b){ return String(a.createdAt||"").localeCompare(String(b.createdAt||"")); });
      _chgs=out; _gLoaded=true;
      if(_page===PAGE_CTRS) paintCtrs();
    }, function(err){ console.warn("contracts/changes sync", err); _gLoaded=true; });
  }catch(e){ console.warn("contracts/startChgSync", e); }
}
function stopChgSync(){ if(_gUnsub){ try{ _gUnsub(); }catch(e){} _gUnsub=null; } _chgs=[]; _gLoaded=false; }

function genChgId(){
  var now=new Date();
  var yr=String(now.getFullYear()).slice(-2), mon=String(now.getMonth()+1).padStart(2,"0");
  var fallback="CHG-"+yr+mon+"-"+Date.now().toString(36).slice(-5).toUpperCase();
  var database=_db(); if(!database) return Promise.resolve(fallback);
  var ref=database.doc(_dev()?"meta/global_contract_changes_counter_dev":"meta/global_contract_changes_counter");
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      var c=(s.exists && Number((s.data()||{}).counter))||0; c++;
      t.set(ref,{counter:c,updatedAt:_now()},{merge:true}); return c;
    });
  }).then(function(c){ return "CHG-"+yr+mon+"-"+String(c).padStart(4,"0"); })
    .catch(function(e){ console.warn("contracts/genChgId",e); return fallback; });
}

/* الإنشاء — لمدير المشروع أو الأدمن، وعلى عقدٍ حيٍّ وحدَه، وبأمرٍ مفتوحٍ واحد. */
function createChange(contract, draft){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال بقاعدة البيانات"));
  if(["project_manager","admin"].indexOf(_role()) === -1) return Promise.reject(new Error("أمرُ التغيير لمدير المشروع أو الأدمن"));
  if(!chgContractEligible(contract)) return Promise.reject(new Error("أمرُ التغيير لا يُنشأ إلا على عقدٍ ساري أو موقوف"));
  var open = openChangeOf(_chgs, contract.id);
  if(open) return Promise.reject(new Error("يوجد أمرُ تغييرٍ مفتوحٌ ("+open.id+") — أنهِه أولاً"));
  var doc = Object.assign({}, draft);
  doc.contractId = contract.id;
  doc.amount = chgAmountOf(doc, contract.vatMode);
  var g = chgGuard(doc, contract, _exts);
  if(!g.ok) return Promise.reject(new Error(_chgGuardMsg(g)));
  if(!doc.reason) return Promise.reject(new Error("سببُ التغيير إلزاميّ — أمرٌ بلا سببٍ لا يُعتمَد"));

  return genChgId().then(function(id){
    // شكلُ المشروع وبندُ الموازنة يُورَثان من العقد — فيدخل الأمرُ تجميعَ الموازنة
    // بالمفتاح نفسِه ولا يقع في «غير مصنّف» بلا سبب
    doc.projectId = contract.projectId || "";
    doc.isCustomProject = contract.isCustomProject === true;
    doc.projectName = contract.projectName || "";
    doc.budgetCategoryKey = contract.budgetCategoryKey || "";
    doc.vendorId = contract.vendorId || ""; doc.vendorName = contract.vendorName || "";
    doc.createdAt=_now(); doc.createdBy=_me(); doc.createdByUser=_meUser();
    doc.status = chgNextStage(doc, ceoThreshold());
    _pushTimeline(doc, "إنشاء أمر التغيير", "created",
      (doc.amount>=0?"زيادة ":"خفض ")+money(Math.abs(doc.amount))+" ر.س");
    return database.collection(CHANGES_COL()).doc(id).set(doc).then(function(){
      doc.id=id; _chgs.push(doc);
      _audit("إنشاء أمر تغيير", id+" — "+contract.id+" — "+money(doc.amount)+" ر.س");
      _notify("أمرُ تغييرٍ جديد "+id, (contract.vendorName||"")+" — "+money(doc.amount)+" ر.س", id);
      return id;
    });
  });
}

/* اعتمادٌ أو رفضٌ — معاملةٌ تقرأ الوثيقةَ الطازجة كبقية البوّابات. */
function actOnChange(id, action, note){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  var ref=database.collection(CHANGES_COL()).doc(id), role=_role(), th=ceoThreshold();
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      if(!s.exists) throw new Error("أمر التغيير غير موجود");
      var g=s.data()||{}; g.id=id;
      if(chgIsFinal(g.status)) throw new Error("أمر التغيير في حالةٍ نهائية");
      if(!chgCanAct(g.status, role)) throw new Error("هذه البوّابة ليست لدورك");
      if(action==="approve"){
        if(g.status==="chg_pending_pm"){ g.pmApprovedAt=_now(); g.pmApprovedBy=_me(); }
        else if(g.status==="chg_pending_proc"){ g.procApprovedAt=_now(); g.procApprovedBy=_me(); }
        else if(g.status==="chg_pending_finance"){ g.financeApprovedAt=_now(); g.financeApprovedBy=_me(); }
        else if(g.status==="chg_pending_ceo"){ g.ceoApprovedAt=_now(); g.ceoApprovedBy=_me(); g.ceoApprovedAmount=r2(Math.abs(Number(g.amount)||0)); }
        _pushTimeline(g, "اعتماد — "+(chgGateOwner(g.status)||{}).lbl, "approved", note);
        g.status = chgNextStage(g, th);
      } else if(action==="reject"){
        if(!note) throw new Error("سبب الرفض إلزامي");
        g.status="chg_rejected";
        _pushTimeline(g, "رفض أمر التغيير", "rejected", note);
      } else throw new Error("إجراء غير معروف");
      g.updatedAt=_now(); g.updatedBy=_me();
      var out=Object.assign({},g); delete out.id;
      t.set(ref, out, { merge:true });
      return g;
    });
  }).then(function(g){
    var i=_chgs.findIndex(function(x){ return x.id===id; });
    if(i>=0) _chgs[i]=g;
    _audit("إجراء على أمر تغيير", id+" ⇐ "+(CHG_STATUS[g.status]||g.status));
    return g;
  });
}

/* **التطبيقُ على العقد** — الخطوةُ التي تجعل الأمرَ واقعاً، وهي للمشتريات كإنشاء
   العقد نفسِه. تكتب في معاملةٍ واحدة: بندٌ جديدٌ في `contract.changeOrders` وختمُ
   الأمرِ «مطبَّقاً». و`value` **لا يُمَسّ** — التاريخُ يبقى: الأصليُّ + التغييرات.
   والنقرةُ المكرّرةُ لا تُطبّقه مرّتين: وجودُ معرّفه في المصفوفة يُنهي العملية. */
function applyChange(id){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  if(["procurement_officer","admin"].indexOf(_role()) === -1) return Promise.reject(new Error("تطبيقُ أمر التغيير للمشتريات أو الأدمن"));
  var gRef=database.collection(CHANGES_COL()).doc(id);
  return database.runTransaction(function(t){
    return t.get(gRef).then(function(s){
      if(!s.exists) throw new Error("أمر التغيير غير موجود");
      var g=s.data()||{}; g.id=id;
      if(g.status==="chg_applied") return { already:true };
      if(g.status!=="chg_approved") throw new Error("أمر التغيير ليس معتمَداً — لا يُطبَّق");
      var cRef=database.collection(CONTRACTS_COL()).doc(g.contractId);
      return t.get(cRef).then(function(cs){
        if(!cs.exists) throw new Error("العقد غير موجود");
        var c=cs.data()||{}; c.id=g.contractId;
        if(!chgContractEligible(c)) throw new Error("العقدُ لم يعد ساريّاً — لا يُطبَّق عليه تغيير");
        var arr = Array.isArray(c.changeOrders) ? c.changeOrders.slice() : [];
        if(arr.some(function(co){ return co && co.id===id; })) return { already:true };
        // حارسُ الخفض يُعاد على الوثيقة الطازجة — بين الاعتماد والتطبيق قد يكون
        // مستخلصٌ اعتُمد فصار الخفضُ ينزل تحت المنفَّذ
        var fresh = chgGuard(g, c, _exts);
        if(!fresh.ok) throw new Error(_chgGuardMsg(fresh));
        arr.push({ id:id, amount:r2(Number(g.amount)||0), lines:(Array.isArray(g.lines)?g.lines:[]),
                   durationDaysDelta:Number(g.durationDaysDelta)||0, reason:g.reason||"",
                   status:"approved", at:_now(), by:_me() });
        var newDays = (Number(c.durationDays)||0) + (Number(g.durationDaysDelta)||0);
        var cPatch = { changeOrders:arr, durationDays:newDays, updatedAt:_now(), updatedBy:_me() };
        c.changeOrders = arr; c.durationDays = newDays;
        _pushTimeline(c, "تطبيق أمر التغيير "+id, "change", (g.amount>=0?"+":"")+money(g.amount)+" ر.س");
        cPatch.timeline = c.timeline;
        g.status="chg_applied"; g.appliedAt=_now(); g.appliedBy=_me();
        _pushTimeline(g, "التطبيق على العقد", "applied", "قيمةُ العقد صارت "+money(contractValue(c))+" ر.س");
        g.updatedAt=_now(); g.updatedBy=_me();
        var gOut=Object.assign({},g); delete gOut.id;
        t.set(gRef, gOut, { merge:true });
        t.set(cRef, cPatch, { merge:true });
        return { already:false, chg:g, contract:c };
      });
    });
  }).then(function(res){
    if(res.already) return id;
    var gi=_chgs.findIndex(function(x){ return x.id===id; });
    if(gi>=0) _chgs[gi]=res.chg;
    var c=contractById(res.contract.id);
    if(c){ c.changeOrders=res.contract.changeOrders; c.durationDays=res.contract.durationDays; c.timeline=res.contract.timeline; }
    _audit("تطبيق أمر تغيير", id+" — قيمةُ العقد "+money(contractValue(res.contract))+" ر.س");
    return id;
  });
}

function cancelChange(id, reason){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  var ref=database.collection(CHANGES_COL()).doc(id), me=_meUser(), role=_role();
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      if(!s.exists) throw new Error("أمر التغيير غير موجود");
      var g=s.data()||{}; g.id=id;
      if(chgIsFinal(g.status)) throw new Error("أمر التغيير في حالةٍ نهائية");
      if(role!=="admin" && g.createdByUser!==me) throw new Error("الإلغاء لمُنشئ الأمر أو الأدمن");
      g.status="chg_cancelled";
      _pushTimeline(g, "إلغاء أمر التغيير", "cancelled", reason||"");
      g.updatedAt=_now(); g.updatedBy=_me();
      var out=Object.assign({},g); delete out.id;
      t.set(ref,out,{merge:true});
      return g;
    });
  }).then(function(g){
    var i=_chgs.findIndex(function(x){ return x.id===id; });
    if(i>=0) _chgs[i]=g;
    _audit("إلغاء أمر تغيير", id+(reason?(" — "+reason):""));
    return g;
  });
}

function _chgGuardMsg(g){
  if(g.empty) return "أمرُ التغيير بلا أثر — أضِف بنداً بقيمةٍ أو مدّةً";
  if(g.under && g.under.length){
    var u=g.under[0];
    return "الخفضُ ينزل بـ«"+(u.desc||u.lineId)+"» إلى "+money0(u.after)+" وقد نُفِّذ منه "+money0(u.executed)+" — لا يُخفَّض تحت المنفَّذ";
  }
  if(g.belowPaid) return "القيمةُ بعد التغيير ("+money0(g.belowPaid.newValue)+") أقلُّ ممّا سُدِّد فعلاً ("+money0(g.belowPaid.paid)+")";
  return "أمرُ التغيير غير صالح";
}

function _guardMsg(g){
  if(g.over && g.over.length){
    var o=g.over[0];
    return "التراكميُّ يتجاوز كمية العقد في «"+(o.desc||o.lineId)+"»: "+money0(o.cum)+" مقابل "+money0(o.max)+" — يلزم أمرُ تغييرٍ معتمَد";
  }
  if(g.back && g.back.length){
    var b=g.back[0];
    return "التراكميُّ في «"+(b.desc||b.lineId)+"» أقلُّ ممّا اعتُمد سابقاً ("+money0(b.was)+")";
  }
  return "بيانات المستخلص غير صالحة";
}

function _notify(title, body, id){
  try{ if(typeof addNotification==="function") addNotification(title, body, id, "contract"); }catch(e){}
}
function _meUser(){ var u=_user(); return (u && u.user) || ""; }

/* ════════════════════════════════════════════════════════════════════
   ٦) سجلُّ الأطراف — الواجهة
   ════════════════════════════════════════════════════════════════════ */
var _page    = "";        // الصفحةُ المعروضة حالياً من هذه الوحدة
var _vFilter = { q:"", kind:"", entity:"", status:"" };
var _vOpen   = null;      // معرّفُ الطرف المفتوح (null = القائمة)
var _vEdit   = null;      // مسوّدةُ التحرير (null = عرض)

function render(){
  ensurePages();
  var el = document.getElementById("page-"+PAGE_VENDORS);
  if(!el) return;
  if(!canView()){
    el.innerHTML = '<div class="card" style="text-align:center;padding:34px 18px">'+
      '<div style="color:var(--muted);font-size:13px">'+_icn("lock")+' هذا القسم غير متاح لدورك.</div></div>';
    return;
  }
  startSync();
  paintVendors();
}

function paintVendors(){
  var el = document.getElementById("page-"+PAGE_VENDORS);
  if(!el) return;
  if(_vOpen) { el.innerHTML = vendorCardHTML(_vOpen); return; }
  el.innerHTML = vendorListHTML();
}

function headHTML(title, sub, actions, icon){
  return '<div class="ct-head">'+
    '<div><h2 class="ct-title">'+_icn(icon||"briefcase")+' '+_esc(title)+'</h2>'+
      (sub?'<div class="ct-sub">'+sub+'</div>':'')+'</div>'+
    '<div class="ct-actions">'+(actions||"")+'</div>'+
  '</div>';
}

function vendorListHTML(){
  var all = _vendors.slice();
  var today = _today();

  var q = normName(_vFilter.q);
  var list = all.filter(function(v){
    if(_vFilter.kind && v.kind !== _vFilter.kind) return false;
    if(_vFilter.entity && normEntity(v.entityType) !== _vFilter.entity) return false;
    if(_vFilter.status && (v.status||"active") !== _vFilter.status) return false;
    if(q){
      var hay = normName(v.name) + " " + normName((v.aliases||[]).join(" ")) + " " +
                normName(identityOf(v).number) + " " + normName((v.legal||{}).vatNumber);
      if(hay.indexOf(q) === -1) return false;
    }
    return true;
  });

  // عدّادُ الامتثال — رقمٌ واحدٌ يُقرأ قبل أيّ شيءٍ آخر في الشاشة
  var expired=0, soon=0;
  all.forEach(function(v){ var c=vendorComplianceState(v,today); expired+=c.expired?1:0; soon+=(!c.expired&&c.soon)?1:0; });

  var actions = canEdit()
    ? '<button class="btn btn-primary btn-sm" onclick="contracts.newVendor()">'+_icn("plus")+' طرف جديد</button>'
    : "";

  var sub = 'المقاولون والموردون الذين نتعاقد معهم — ووثائقُهم وسريانُها.';

  var head = headHTML("سجل الأطراف", sub, actions, "hardHat");

  var strip = '';
  if(all.length){
    strip = '<div class="ct-strip">'+
      '<div class="ct-stat"><span class="l">الأطراف</span><span class="v">'+all.length+'</span></div>'+
      '<div class="ct-stat'+(expired?' bad':'')+'"><span class="l">وثائق منتهية</span><span class="v">'+expired+'</span></div>'+
      '<div class="ct-stat'+(soon?' warn':'')+'"><span class="l">توشك على الانتهاء</span><span class="v">'+soon+'</span></div>'+
    '</div>';
  }

  var filters = '<div class="ct-filters">'+
    '<input class="form-input ct-search" id="ct-v-q" placeholder="ابحث باسم الطرف أو رقم السجل" value="'+_esc(_vFilter.q)+'" oninput="contracts.filterVendors(\'q\',this.value)">'+
    '<select class="form-input" onchange="contracts.filterVendors(\'kind\',this.value)">'+
      '<option value="">كل الأنواع</option>'+
      Object.keys(VENDOR_KINDS).map(function(k){
        return '<option value="'+k+'"'+(_vFilter.kind===k?' selected':'')+'>'+_esc(VENDOR_KINDS[k].lbl)+'</option>';
      }).join("")+
    '</select>'+
    '<select class="form-input" onchange="contracts.filterVendors(\'entity\',this.value)">'+
      '<option value="">منشآت وأشخاص</option>'+
      Object.keys(ENTITY_TYPES).map(function(k){
        return '<option value="'+k+'"'+(_vFilter.entity===k?' selected':'')+'>'+_esc(ENTITY_TYPES[k].lbl)+'</option>';
      }).join("")+
    '</select>'+
    '<select class="form-input" onchange="contracts.filterVendors(\'status\',this.value)">'+
      '<option value="">كل الحالات</option>'+
      Object.keys(VENDOR_STATUS).map(function(k){
        return '<option value="'+k+'"'+(_vFilter.status===k?' selected':'')+'>'+_esc(VENDOR_STATUS[k].lbl)+'</option>';
      }).join("")+
    '</select>'+
  '</div>';

  var body;
  if(_vError){
    body = '<div class="card" style="text-align:center;padding:30px 18px">'+
      '<div style="color:var(--danger);font-size:13px;font-weight:700">'+_icn("alertTriangle")+' '+_esc(_vError)+'</div>'+
      '<button class="btn btn-ghost btn-sm" style="margin-top:12px" onclick="contracts.retry()">'+_icn("rotateCcw")+' إعادة المحاولة</button></div>';
  } else if(!_vLoaded){
    body = '<div class="card" style="text-align:center;padding:30px 18px;color:var(--muted);font-size:13px">جارٍ التحميل…</div>';
  } else if(!all.length){
    body = '<div class="card ct-empty">'+
      '<div class="ct-empty-ic">'+_svg("hardHat")+'</div>'+
      '<div class="ct-empty-t">لا أطراف في السجل بعد</div>'+
      '<div class="ct-empty-s">أضِف أول مقاول باطنٍ أو مورّد لتبدأ التعاقد معه، وسجّل وثائقه ليُنبّهك النظام قبل انتهائها.</div>'+
      (canEdit()?'<button class="btn btn-primary btn-sm" style="margin-top:14px" onclick="contracts.newVendor()">'+_icn("plus")+' طرف جديد</button>':'')+
    '</div>';
  } else if(!list.length){
    body = '<div class="card" style="text-align:center;padding:26px 18px;color:var(--muted);font-size:13px">لا نتائج تطابق البحث.</div>';
  } else {
    body = '<div class="ct-grid">'+list.map(function(v){ return vendorTileHTML(v, today); }).join("")+'</div>';
  }

  return head + strip + filters + body;
}

function vendorTileHTML(v, today){
  var kind = VENDOR_KINDS[v.kind] || VENDOR_KINDS.subcontractor;
  var ent  = ENTITY_TYPES[normEntity(v.entityType)];
  var id   = identityOf(v);
  var st   = VENDOR_STATUS[v.status||"active"] || VENDOR_STATUS.active;
  var comp = vendorComplianceState(v, today);
  var rail = comp.expired ? "var(--sla-crit)" : (comp.soon ? "var(--sla-warn)" : "var(--sla-ok)");
  if((v.status||"active") !== "active") rail = "var(--muted)";

  var chips = allExpiring(v).slice(0,5).map(function(dc){
    var s = docExpiryState(dc.expiry, today);
    return '<span class="ct-doc s-'+s.state+'" title="'+_esc(DOC_LBL[dc.type]||dc.type)+(dc.expiry?(' — ينتهي '+_esc(dc.expiry)):'')+'">'+
      _esc(DOC_SHORT[dc.type]||dc.type||"مستند")+'</span>';
  }).join("");
  if(!chips) chips = '<span class="ct-doc s-none">لا وثائق مسجّلة</span>';

  return '<div class="ct-tile" style="--rail:'+rail+'" onclick="contracts.openVendor(\''+_jq(v.id)+'\')">'+
    '<div class="ct-tile-top">'+
      '<div class="ct-tile-name">'+_esc(v.name||v.id)+'</div>'+
      '<span class="badge '+st.cls+'">'+_icn(st.icon,"ic-sm")+' '+_esc(st.lbl)+'</span>'+
    '</div>'+
    '<div class="ct-tile-kind">'+_icn(ent.icon,"ic-sm")+' '+_esc(ent.short)+
      ' <span class="ct-dot">·</span> '+_icn(kind.icon,"ic-sm")+' '+_esc(kind.lbl)+
      (id.number?' <span class="ct-dot">·</span> <b class="num">'+_esc(id.number)+'</b>':'')+
    '</div>'+
    '<div class="ct-docs">'+chips+'</div>'+
  '</div>';
}

function vendorCardHTML(id){
  var v = vendorById(id);
  if(!v) return headHTML("سجل الأطراف","",'',"hardHat")+'<div class="card">تعذّر العثور على الطرف.</div>';
  if(_vEdit) return vendorEditHTML(v);

  var today = _today();
  var kind = VENDOR_KINDS[v.kind] || VENDOR_KINDS.subcontractor;
  var st   = VENDOR_STATUS[v.status||"active"] || VENDOR_STATUS.active;
  var elig = vendorEligibility(v, today);

  var back = '<button class="btn btn-ghost btn-sm ct-back" onclick="contracts.backToVendors()">'+_icn("rotateCcw")+' كل الأطراف</button>';

  var tools = "";
  if(canEdit()) tools += '<button class="btn btn-primary btn-sm" onclick="contracts.editVendor()">'+_icn("edit")+' تعديل</button> ';
  if(canStatus()){
    tools += (v.status==="blacklisted")
      ? '<button class="btn btn-ghost btn-sm" onclick="contracts.changeStatus(\'active\')">'+_icn("checkCircle")+' رفع الحظر</button>'
      : '<button class="btn btn-ghost btn-sm" onclick="contracts.changeStatus(\'blacklisted\')">'+_icn("ban")+' حظر</button>';
  }

  var warn = "";
  if(elig.reason){
    var cls = elig.block ? "crit" : (elig.ok ? "warn" : "crit");
    warn = '<div class="ct-note '+cls+'">'+_icn("alertTriangle","ic-sm")+' '+_esc(elig.reason)+
      (v.statusReason?' — '+_esc(v.statusReason):'')+'</div>';
  }

  var ent = ENTITY_TYPES[normEntity(v.entityType)];
  var id  = identityOf(v);
  var idExpState = id.expiry ? docExpiryState(id.expiry, today).state : "none";
  var vatSug = VAT_MODES[suggestVatMode(v)];

  var info = '<div class="ct-info">'+
    infoCell("الصفة", _icn(ent.icon,"ic-sm")+" "+_esc(ent.lbl)) +
    infoCell("النوع", _icn(kind.icon,"ic-sm")+" "+_esc(kind.lbl)) +
    infoCell(id.label, numOrDash(id.number) +
      (id.expiry ? ' <span class="ct-doc s-'+idExpState+'">'+_esc(id.expiry)+'</span>' : "")) +
    (id.entity === "individual"
      ? infoCell("الجنسية", _esc((v.legal||{}).nationality||"—"))
      : infoCell("الرقم الضريبي", numOrDash((v.legal||{}).vatNumber))) +
    infoCell("وضع الضريبة المقترَح", _esc(vatSug ? vatSug.short : "—")) +
    infoCell("العنوان الوطني", _esc((v.legal||{}).nationalAddress||"—")) +
  '</div>';

  /* الآيبان حقلٌ حسّاسٌ لا حقلٌ عادي: يظهر مقنَّعاً لغير المخوَّل، وتغييرُه مقيَّدٌ
     بالمالية والأدمن ومُقيَّدٌ في السجل — تغييرُ الحساب ناقلُ الاحتيال الأول. */
  var iban = (v.bank||{}).iban || "";
  var ibanShown = canBank() ? (iban||"—") : (iban ? ("•••• "+String(iban).slice(-4)) : "—");
  var bank = '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("landmark","ic-sm")+' البيانات البنكية'+
      (canBank()?'':'<span class="ct-sec-lock">'+_icn("lock","ic-sm")+' مقنَّع — للمالية والأدمن</span>')+'</div>'+
    '<div class="ct-info">'+
      infoCell("الآيبان", '<span class="num">'+_esc(ibanShown)+'</span>') +
      infoCell("البنك", _esc((v.bank||{}).bankName||"—")) +
      infoCell("اسم صاحب الحساب", _esc((v.bank||{}).holder||"—")) +
    '</div>'+
  '</div>';

  var docs = allExpiring(v);
  var docRows = docs.length ? docs.map(function(dc,i){
    var s = docExpiryState(dc.expiry, today);
    var lbl = s.state==="expired" ? ("منتهية منذ "+Math.abs(s.days)+" يوماً")
            : s.state==="soon"    ? ("تنتهي بعد "+s.days+" يوماً")
            : s.state==="ok"      ? ("سارية — "+s.days+" يوماً")
            : "بلا تاريخ انتهاء";
    return '<tr'+(dc._identity?' class="ct-row-id"':'')+'>'+
      '<td>'+_esc(dc._identity ? id.label : (DOC_LBL[dc.type]||dc.type||"—"))+
        (dc._identity?' <span class="ct-doc s-none">الهوية الرسمية</span>':'')+'</td>'+
      '<td class="num">'+_esc(dc.number||"—")+'</td>'+
      '<td class="num">'+_esc(dc.expiry||"—")+'</td>'+
      '<td><span class="ct-doc s-'+s.state+'">'+_esc(lbl)+'</span></td>'+
      '<td>'+(dc.url?'<a href="'+_esc(dc.url)+'" target="_blank" rel="noopener" class="ct-link">'+_icn("paperclip","ic-sm")+' الملف</a>':'—')+'</td>'+
    '</tr>';
  }).join("") : '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:16px">لا وثائق مسجّلة — سجّلها ليُنبّهك النظام قبل انتهائها.</td></tr>';

  var docsSec = '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("fileText","ic-sm")+' الوثائق وسريانها</div>'+
    '<div class="ct-table-wrap"><table class="ct-table"><thead><tr>'+
      '<th>الوثيقة</th><th>الرقم</th><th>تنتهي في</th><th>الحالة</th><th>المرفق</th>'+
    '</tr></thead><tbody>'+docRows+'</tbody></table></div>'+
  '</div>';

  var contacts = (Array.isArray(v.contacts)?v.contacts:[]);
  var contactsSec = contacts.length ? '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("users","ic-sm")+' جهات الاتصال</div>'+
    '<div class="ct-info">'+contacts.map(function(c){
      return infoCell(_esc(c.role||"جهة اتصال"), _esc(c.name||"—")+(c.phone?' <span class="num" style="color:var(--muted)">'+_esc(c.phone)+'</span>':''));
    }).join("")+'</div>'+
  '</div>' : "";

  return back +
    headHTML(v.name||v.id, '<span class="badge '+st.cls+'">'+_icn(st.icon,"ic-sm")+' '+_esc(st.lbl)+'</span> <span class="ct-id num">'+_esc(v.id)+'</span>', tools, (VENDOR_KINDS[v.kind]||VENDOR_KINDS.subcontractor).icon) +
    warn + '<div class="card ct-sec">'+info+'</div>' + bank + docsSec + contactsSec;
}

function infoCell(label, valueHtml){
  return '<div class="ct-cell"><div class="ct-cell-l">'+_esc(label)+'</div><div class="ct-cell-v">'+valueHtml+'</div></div>';
}
function numOrDash(s){ return s ? '<span class="num">'+_esc(s)+'</span>' : "—"; }

/* ── نموذجُ التحرير ── */
function vendorEditHTML(v){
  var d = _vEdit;
  var isNew = !v || !v.id;
  var back = '<button class="btn btn-ghost btn-sm ct-back" onclick="contracts.cancelVendorEdit()">'+_icn("rotateCcw")+' إلغاء</button>';

  var ent = normEntity(d.entityType);
  // قائمةُ الوثائق تتبع الصفة — ويبقى النوعُ المحفوظ ظاهراً ولو خرج عنها بعد تبديلها،
  // فلا تُمحى وثيقةٌ سجّلها أحدٌ لمجرّد تغييرِ صفةٍ بالخطأ.
  var docOpts = docTypesFor(ent);
  var docRows = (d.docs||[]).map(function(dc,i){
    var opts = docOpts.slice();
    if(dc.type && !opts.some(function(t){ return t.key===dc.type; })){
      var keep = DOC_TYPES.filter(function(t){ return t.key===dc.type; })[0];
      if(keep) opts = opts.concat([keep]);
    }
    return '<tr>'+
      '<td><select class="form-input" data-f="type" data-i="'+i+'">'+
        opts.map(function(t){ return '<option value="'+t.key+'"'+(dc.type===t.key?' selected':'')+'>'+_esc(t.lbl)+'</option>'; }).join("")+
      '</select></td>'+
      '<td><input class="form-input" data-f="number" data-i="'+i+'" value="'+_esc(dc.number||"")+'" placeholder="الرقم"></td>'+
      '<td><input class="form-input" type="date" data-f="expiry" data-i="'+i+'" value="'+_esc(dc.expiry||"")+'"></td>'+
      '<td><input type="file" class="form-input ct-file" data-i="'+i+'" accept="image/*,application/pdf">'+
        (dc.url?'<a href="'+_esc(dc.url)+'" target="_blank" rel="noopener" class="ct-link">'+_icn("paperclip","ic-sm")+' الحالي</a>':'')+'</td>'+
      '<td><button class="btn btn-delete" onclick="contracts.delDoc('+i+')">'+_icn("trash","ic-sm")+'</button></td>'+
    '</tr>';
  }).join("");

  var bankBlock = canBank()
    ? '<div class="ct-form-row">'+
        field("الآيبان (IBAN)", '<input class="form-input num" id="ct-f-iban" value="'+_esc((d.bank||{}).iban||"")+'" placeholder="SA…" dir="ltr">') +
        field("اسم البنك", '<input class="form-input" id="ct-f-bank" value="'+_esc((d.bank||{}).bankName||"")+'">') +
      '</div>'+
      '<div class="ct-form-row">'+
        field("اسم صاحب الحساب", '<input class="form-input" id="ct-f-holder" value="'+_esc((d.bank||{}).holder||"")+'" placeholder="'+(ent==="individual"?"يجب أن يطابق اسم الشخص في هويته":"كما في خطاب البنك")+'">') +
        '<div></div>'+
      '</div>'+
      '<div class="ct-note warn" style="margin-top:2px">'+_icn("shield","ic-sm")+' تغيير الآيبان يُقيَّد في سجل التدقيق باسمك وبالقيمة قبل وبعد.'+
        (ent==="individual"?' والحسابُ للشخص يجب أن يكون <b>باسمه</b> — التحويلُ لحساب طرفٍ ثالثٍ يُفقد الإثبات.':'')+'</div>'
    : '<div class="ct-note">'+_icn("lock","ic-sm")+' البيانات البنكية تُعدَّل من المالية أو الأدمن فقط.</div>';

  return back +
  headHTML(isNew ? "طرف جديد" : ("تعديل — "+(v.name||v.id)), "", "", "edit") +
  '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("briefcase","ic-sm")+' البيانات الأساسية</div>'+
    '<div class="ct-form-row">'+
      field("الصفة *", '<select class="form-input" id="ct-f-entity" onchange="contracts.setEntity(this.value)">'+
        Object.keys(ENTITY_TYPES).map(function(k){ return '<option value="'+k+'"'+(ent===k?' selected':'')+'>'+_esc(ENTITY_TYPES[k].lbl)+'</option>'; }).join("")+
      '</select>') +
      field("النوع", '<select class="form-input" id="ct-f-kind">'+
        Object.keys(VENDOR_KINDS).map(function(k){ return '<option value="'+k+'"'+(d.kind===k?' selected':'')+'>'+_esc(VENDOR_KINDS[k].lbl)+'</option>'; }).join("")+
      '</select>') +
    '</div>'+
    '<div class="ct-form-row">'+
      field(ent==="individual" ? "اسم الشخص *" : "اسم المنشأة *",
        '<input class="form-input" id="ct-f-name" value="'+_esc(d.name||"")+'" placeholder="'+(ent==="individual"?"الاسم الرباعي كما في الهوية":"الاسم كما في السجل التجاري")+'">') +
      field("أسماء بديلة (تفصلها فاصلة)", '<input class="form-input" id="ct-f-aliases" value="'+_esc((d.aliases||[]).join("، "))+'" placeholder="لربط الأسماء المكتوبة يدوياً سابقاً">') +
    '</div>'+
    (ent==="individual" ? (
      '<div class="ct-form-row">'+
        field("نوع الهوية", '<select class="form-input" id="ct-f-idtype">'+
          Object.keys(ID_TYPES).map(function(k){ return '<option value="'+k+'"'+(((d.legal||{}).idType||"national")===k?' selected':'')+'>'+_esc(ID_TYPES[k].lbl)+'</option>'; }).join("")+
        '</select>') +
        field("رقم الهوية / الإقامة *", '<input class="form-input num" id="ct-f-idnum" value="'+_esc((d.legal||{}).idNumber||"")+'" dir="ltr" inputmode="numeric">') +
      '</div>'+
      '<div class="ct-form-row">'+
        field("تاريخ انتهاء الهوية", '<input class="form-input" type="date" id="ct-f-idexp" value="'+_esc((d.legal||{}).idExpiry||"")+'">') +
        field("الجنسية", '<input class="form-input" id="ct-f-nat" value="'+_esc((d.legal||{}).nationality||"")+'">') +
      '</div>'
    ) : (
      '<div class="ct-form-row">'+
        field("السجل التجاري *", '<input class="form-input num" id="ct-f-cr" value="'+_esc((d.legal||{}).crNumber||"")+'" dir="ltr">') +
        field("تاريخ انتهاء السجل", '<input class="form-input" type="date" id="ct-f-crexp" value="'+_esc((d.legal||{}).crExpiry||"")+'">') +
      '</div>'+
      '<div class="ct-form-row">'+
        field("الرقم الضريبي", '<input class="form-input num" id="ct-f-vat" value="'+_esc((d.legal||{}).vatNumber||"")+'" dir="ltr">') +
        '<div></div>'+
      '</div>'
    ))+
    '<div class="ct-form-row">'+
      field("مسجَّل في ضريبة القيمة المضافة؟",
        '<select class="form-input" id="ct-f-taxreg">'+
          '<option value=""'+(d.taxRegistered===undefined||d.taxRegistered===null?' selected':'')+'>— يُستنتج من البيانات —</option>'+
          '<option value="yes"'+(d.taxRegistered===true?' selected':'')+'>نعم — تُضاف ١٥٪ على عقوده</option>'+
          '<option value="no"'+(d.taxRegistered===false?' selected':'')+'>لا — عقودُه بلا ضريبة</option>'+
        '</select>') +
      field("العنوان الوطني", '<input class="form-input" id="ct-f-addr" value="'+_esc((d.legal||{}).nationalAddress||"")+'">') +
    '</div>'+
    '<div class="ct-note">'+_icn("receipt","ic-sm")+' وضع الضريبة المقترَح لعقود هذا الطرف: <b>'+_esc((VAT_MODES[suggestVatMode(d)]||{}).short||"")+'</b> — يبقى قابلاً للتغيير على كل عقد.</div>'+
  '</div>'+
  '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("landmark","ic-sm")+' البيانات البنكية</div>'+ bankBlock +
  '</div>'+
  '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("fileText","ic-sm")+' الوثائق'+
      '<button class="btn btn-ghost btn-sm" style="margin-inline-start:auto" onclick="contracts.addDoc()">'+_icn("plus","ic-sm")+' وثيقة</button></div>'+
    '<div class="ct-table-wrap"><table class="ct-table" id="ct-docs-tbl"><thead><tr>'+
      '<th>الوثيقة</th><th>الرقم</th><th>تنتهي في</th><th>المرفق</th><th></th>'+
    '</tr></thead><tbody>'+(docRows||'<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:14px">لا وثائق — أضِف واحدة.</td></tr>')+'</tbody></table></div>'+
  '</div>'+
  '<div class="ct-save-bar">'+
    '<button class="btn btn-ghost btn-sm" onclick="contracts.cancelVendorEdit()">إلغاء</button>'+
    '<button class="btn btn-success btn-sm" id="ct-save-btn" onclick="contracts.saveVendorEdit()">'+_icn("save","ic-sm")+' حفظ</button>'+
  '</div>';
}

function field(label, inputHtml){
  return '<label class="ct-field"><span class="ct-field-l">'+_esc(label)+'</span>'+inputHtml+'</label>';
}

/* ════════════════════════════════════════════════════════════════════
   ٧) أفعالُ الواجهة
   ════════════════════════════════════════════════════════════════════ */
function filterVendors(key, val){
  _vFilter[key] = val || "";
  paintVendors();
  if(key === "q"){
    var inp = document.getElementById("ct-v-q");
    if(inp){ inp.focus(); try{ inp.setSelectionRange(inp.value.length, inp.value.length); }catch(e){} }
  }
}
function openVendor(id){ _vOpen = id; _vEdit = null; paintVendors(); }
function backToVendors(){ _vOpen = null; _vEdit = null; paintVendors(); }
function retry(){ stopSync(); startSync(); paintVendors(); }

function newVendor(){
  if(!canEdit()) return _toast("⚠ لا صلاحية لإضافة طرف","warn");
  _vOpen = null;
  _vEdit = { name:"", entityType:"establishment", kind:"subcontractor", legal:{}, bank:{}, docs:[], aliases:[], status:"active", taxRegistered:null };
  var el = document.getElementById("page-"+PAGE_VENDORS);
  if(el) el.innerHTML = vendorEditHTML(null);
}
function editVendor(){
  if(!canEdit()) return _toast("⚠ لا صلاحية للتعديل","warn");
  var v = vendorById(_vOpen); if(!v) return;
  _vEdit = {
    name: v.name||"", entityType: normEntity(v.entityType), kind: v.kind||"subcontractor",
    taxRegistered: (v.taxRegistered===true||v.taxRegistered===false) ? v.taxRegistered : null,
    legal: Object.assign({}, v.legal||{}),
    bank:  Object.assign({}, v.bank||{}),
    docs:  (Array.isArray(v.docs)?v.docs:[]).map(function(d){ return Object.assign({}, d); }),
    aliases: (Array.isArray(v.aliases)?v.aliases:[]).slice(),
    status: v.status||"active"
  };
  paintVendors();
}
function cancelVendorEdit(){ _vEdit = null; paintVendors(); }

/* تُقرأ قيمُ الحقول من الـDOM إلى المسوّدة قبل أيّ إعادةِ رسمٍ — وإلا ضاع ما كُتب. */
function syncDraft(){
  if(!_vEdit) return;
  function val(id){ var e=document.getElementById(id); return e ? String(e.value||"").trim() : ""; }
  function sel(id){ var e=document.getElementById(id); return e ? e.value : null; }
  _vEdit.name = val("ct-f-name");
  var k = document.getElementById("ct-f-kind"); if(k) _vEdit.kind = k.value;
  var en = sel("ct-f-entity"); if(en!==null) _vEdit.entityType = normEntity(en);
  _vEdit.legal = _vEdit.legal || {};
  // حقولُ الصفة الأخرى تبقى محفوظةً كما هي: تبديلُ الصفة ذهاباً وإياباً لا يمحو
  // سجلاً تجارياً أُدخل قبل قليل، ولا رقمَ هويةٍ أُدخل قبله.
  if(normEntity(_vEdit.entityType) === "individual"){
    var it = sel("ct-f-idtype"); if(it!==null) _vEdit.legal.idType = it;
    if(document.getElementById("ct-f-idnum")) _vEdit.legal.idNumber = val("ct-f-idnum");
    if(document.getElementById("ct-f-idexp")) _vEdit.legal.idExpiry = val("ct-f-idexp");
    if(document.getElementById("ct-f-nat"))   _vEdit.legal.nationality = val("ct-f-nat");
  } else {
    if(document.getElementById("ct-f-cr"))    _vEdit.legal.crNumber = val("ct-f-cr");
    if(document.getElementById("ct-f-crexp")) _vEdit.legal.crExpiry = val("ct-f-crexp");
    if(document.getElementById("ct-f-vat"))   _vEdit.legal.vatNumber = val("ct-f-vat");
  }
  var tx = sel("ct-f-taxreg");
  if(tx !== null) _vEdit.taxRegistered = (tx === "yes") ? true : (tx === "no" ? false : null);
  _vEdit.legal.nationalAddress = val("ct-f-addr");
  var al = val("ct-f-aliases");
  _vEdit.aliases = al ? al.split(/[،,]/).map(function(s){ return s.trim(); }).filter(Boolean) : [];
  if(canBank()){
    _vEdit.bank = _vEdit.bank || {};
    _vEdit.bank.iban = val("ct-f-iban");
    _vEdit.bank.bankName = val("ct-f-bank");
    _vEdit.bank.holder = val("ct-f-holder");
  }
  var tbl = document.getElementById("ct-docs-tbl");
  if(tbl){
    tbl.querySelectorAll("[data-f]").forEach(function(inp){
      var i = parseInt(inp.dataset.i,10), f = inp.dataset.f;
      if(!_vEdit.docs[i] || !f) return;
      _vEdit.docs[i][f] = String(inp.value||"").trim();
    });
  }
}
/* تبديلُ الصفة يُعيد رسمَ النموذج بحقولها — بعد مزامنةِ ما كُتب، فلا يضيع شيء. */
function setEntity(v){ syncDraft(); if(!_vEdit) return; _vEdit.entityType = normEntity(v); paintDraft(); }
function addDoc(){ syncDraft(); if(!_vEdit) return; _vEdit.docs.push({ type:(docTypesFor(_vEdit.entityType)[0]||{key:"other"}).key, number:"", expiry:"" }); paintDraft(); }
function delDoc(i){ syncDraft(); if(!_vEdit) return; _vEdit.docs.splice(i,1); paintDraft(); }
function paintDraft(){
  var el = document.getElementById("page-"+PAGE_VENDORS); if(!el) return;
  el.innerHTML = vendorEditHTML(_vOpen ? vendorById(_vOpen) : null);
}

function saveVendorEdit(){
  syncDraft();
  if(!_vEdit) return;
  var d = _vEdit;
  var ent = normEntity(d.entityType);
  if(!d.name){ _toast(ent==="individual" ? "⚠ اسم الشخص مطلوب" : "⚠ اسم المنشأة مطلوب","warn"); return; }
  var idInfo = identityOf(d);
  if(!idInfo.number){ _toast("⚠ "+idInfo.label+" مطلوب — به يُعرَف الطرف ويُمنع تكراره","warn"); return; }
  var dup = duplicateOf(d, _vOpen);
  if(dup.block){ _toast("⚠ "+dup.reason,"warn"); return; }
  if(dup.match) _toast("⚠ "+dup.reason,"warn");   // تشابهُ أسماء الأشخاص: تنبيهٌ لا منع

  var btn = document.getElementById("ct-save-btn");
  if(btn){ btn.disabled = true; btn.textContent = "جارٍ الحفظ…"; }

  // الملفاتُ تُرفع أولاً؛ فشلُ رفعِ ملفٍ **لا يمنع** حفظَ بقيةِ البيانات، لكنه
  // لا يسجّل رابطاً وهمياً — الوثيقةُ تُحفظ ببياناتها بلا مرفق ويُعلَن ذلك.
  var files = [];
  var tbl = document.getElementById("ct-docs-tbl");
  if(tbl){
    tbl.querySelectorAll("input.ct-file").forEach(function(inp){
      var i = parseInt(inp.dataset.i,10);
      if(inp.files && inp.files[0] && _vEdit.docs[i]) files.push({ i:i, file:inp.files[0] });
    });
  }

  var vidPromise = _vOpen ? Promise.resolve(_vOpen) : genVendorId();
  var failedUploads = 0;

  vidPromise.then(function(vid){
    var chain = Promise.resolve();
    files.forEach(function(f){
      chain = chain.then(function(){
        return uploadVendorDoc(vid, f.file, (d.docs[f.i]||{}).type||"doc")
          .then(function(att){ if(att){ d.docs[f.i].url = att.url; d.docs[f.i].fileName = att.name; } })
          .catch(function(e){ console.warn("contracts/uploadVendorDoc", e); failedUploads++; });
      });
    });
    return chain.then(function(){
      var payload = {
        name: d.name, entityType: ent, kind: d.kind, aliases: d.aliases,
        taxRegistered: (d.taxRegistered===true||d.taxRegistered===false) ? d.taxRegistered : null,
        legal: d.legal || {}, docs: d.docs || [],
        status: d.status || "active"
      };
      if(canBank()) payload.bank = d.bank || {};
      return saveVendor(payload, _vOpen || vid);
    }).then(function(){ return vid; });
  }).then(function(vid){
    _vEdit = null; _vOpen = vid;
    paintVendors();
    _toast(failedUploads ? ("✅ حُفظ الطرف — تعذّر رفع "+failedUploads+" مرفقاً") : "✅ حُفظ الطرف", failedUploads ? "warn" : "success");
  }).catch(function(e){
    console.warn("contracts/saveVendorEdit", e);
    if(btn){ btn.disabled = false; btn.innerHTML = _icn("save","ic-sm")+" حفظ"; }
    _toast("⚠ تعذّر الحفظ — "+(e && e.message ? e.message : "أعد المحاولة"), "warn");
  });
}

function changeStatus(next){
  if(!canStatus()) return _toast("⚠ تغيير حالة الطرف للأدمن فقط","warn");
  var v = vendorById(_vOpen); if(!v) return;
  var lbl = (VENDOR_STATUS[next]||{}).lbl || next;
  Promise.resolve(_confirm({
    title: "تغيير حالة الطرف",
    msg: 'هل تريد جعل «'+(v.name||v.id)+'» بحالة «'+lbl+'»؟'+(next==="blacklisted"?" الطرف المحظور لا يجوز الإسناد إليه.":"")
  })).then(function(ok){
    if(!ok) return;
    var reason = next==="active" ? "" : (window.prompt("سبب "+lbl+" (إلزامي):")||"").trim();
    if(next!=="active" && !reason){ _toast("⚠ السبب إلزامي","warn"); return; }
    return setVendorStatus(v.id, next, reason).then(function(){
      paintVendors();
      _toast("✅ حُدِّثت حالة الطرف","success");
    });
  }).catch(function(e){ console.warn("contracts/changeStatus", e); _toast("⚠ تعذّر التحديث","warn"); });
}

/* ════════════════════════════════════════════════════════════════════
   ٧-ب) طلباتُ التعاقد — الواجهة  [المرحلة ٢]
   ════════════════════════════════════════════════════════════════════ */
var _rFilter = { q:"", status:"", engagement:"" };
var _rOpen   = null;     // معرّفُ الطلب المفتوح
var _rDraft  = null;     // مسوّدةُ الطلب الجديد
var _boqCache = {};      // projId → بنودُ المقايسة (تُقرأ عبر projectMgmt لا بمسارٍ منسوخ)
var _budCache = {};      // projId → موازنةُ المشروع

function _pm(){ try{ return window.projectMgmt || null; }catch(e){ return null; } }
/* المسجّلةُ + اليدويةُ معاً — من `projectMgmt._allProjects` لا بقائمةٍ منسوخة،
   فالمشروعُ اليدويُّ الذي تعرفه إدارةُ المشاريع يعرفه طلبُ التعاقد. */
function _projects(){
  try{
    var pm=window.projectMgmt;
    if(pm && typeof pm._allProjects==="function"){
      return pm._allProjects().map(function(p){ return { id:p.id, name:p.name||p.id, manual:!!p.manual }; });
    }
  }catch(e){}
  try{
    var l = Array.isArray(window._projectsList) ? window._projectsList : [];
    return l.map(function(p){ return { id:p.id, name:p.name||p.id, manual:false }; });
  }catch(e){ return []; }
}
function _projName(doc){ return docProjectName(doc, _projects()); }
/* مفتاحُ تحميل المقايسة/الموازنة: اليدويُّ بمعرّفه الاصطناعيّ كما تخزّنه إدارةُ المشاريع. */
function _projLoadKey(doc){
  var d=doc||{};
  if(d.isCustomProject===true || d.projectId===MANUAL_ID) return pmManualPrefix()+String(d.projectName||"");
  return d.projectId||"";
}

function loadBoqFor(projId){
  if(_boqCache[projId]) return Promise.resolve(_boqCache[projId]);
  var pm=_pm();
  if(pm && typeof pm._loadBoq==="function"){
    return Promise.resolve(pm._loadBoq(projId)).then(function(b){
      _boqCache[projId] = (b && Array.isArray(b.items)) ? b.items : [];
      return _boqCache[projId];
    }).catch(function(){ _boqCache[projId]=[]; return []; });
  }
  _boqCache[projId]=[]; return Promise.resolve([]);
}
function loadBudgetFor(projId){
  if(_budCache[projId]) return Promise.resolve(_budCache[projId]);
  var pm=_pm();
  if(pm && typeof pm._loadBudget==="function"){
    return Promise.resolve(pm._loadBudget(projId)).then(function(b){
      _budCache[projId] = b || { categories:[] }; return _budCache[projId];
    }).catch(function(){ _budCache[projId]={categories:[]}; return _budCache[projId]; });
  }
  _budCache[projId]={categories:[]}; return Promise.resolve(_budCache[projId]);
}
function catName(key){
  var pm=_pm();
  try{ if(pm && pm._CAT_NAME && pm._CAT_NAME[key]) return pm._CAT_NAME[key]; }catch(e){}
  return key || "غير مصنّف";
}
function budgetPlanned(projId, catKey){
  var b=_budCache[projId]; if(!b || !Array.isArray(b.categories)) return null;
  for(var i=0;i<b.categories.length;i++){ if(b.categories[i].key===catKey) return Number(b.categories[i].planned)||0; }
  return null;
}

/* ── شارةُ الحالة ── */
var _RAIL = {
  crq_pending_pm:"var(--warn)", crq_pending_proc:"var(--warn)", crq_pending_finance:"var(--info)",
  crq_pending_ceo:"#7c3aed", crq_pending_pay:"var(--info)", crq_approved:"var(--accent)",
  crq_converted:"var(--accent)", crq_paid:"var(--accent)", crq_draft:"var(--muted)"
};
var _BADGE = {
  crq_pending_pm:{cls:"b-po-approval",icon:"send"}, crq_pending_proc:{cls:"b-po-approval",icon:"cart"},
  crq_pending_finance:{cls:"b-po-approval",icon:"banknote"}, crq_pending_ceo:{cls:"b-po-ceo",icon:"building2"},
  crq_pending_pay:{cls:"b-po-approval",icon:"banknote"}, crq_approved:{cls:"b-po-closed",icon:"checkCircle"},
  crq_converted:{cls:"b-po-closed",icon:"fileText"}, crq_paid:{cls:"b-po-closed",icon:"lock"},
  crq_draft:{cls:"",icon:"edit"}
};
function reqRail(s){ return _RAIL[s] || (crqIsBounced(s) ? "var(--danger)" : "var(--muted)"); }
function reqBadge(s){
  var m=_BADGE[s] || (crqIsBounced(s) ? {cls:"b-po-rejected",icon:"xCircle"} : {cls:"b-po-cancelled",icon:"ban"});
  return '<span class="badge '+m.cls+'">'+_icn(m.icon,"ic-sm")+' '+_esc(CRQ_STATUS[s]||s)+'</span>';
}

function renderReqs(){
  ensurePages();
  var el=document.getElementById("page-"+PAGE_REQS); if(!el) return;
  if(!canView()){ el.innerHTML='<div class="card" style="text-align:center;padding:34px 18px"><div style="color:var(--muted);font-size:13px">'+_icn("lock")+' هذا القسم غير متاح لدورك.</div></div>'; return; }
  startSync(); startReqSync();
  paintReqs();
}
function paintReqs(){
  var el=document.getElementById("page-"+PAGE_REQS); if(!el) return;
  if(_rDraft){ el.innerHTML = reqFormHTML(); return; }
  if(_rOpen){ el.innerHTML = reqCardHTML(_rOpen); return; }
  el.innerHTML = reqListHTML();
}

function reqListHTML(){
  var all=_reqs.slice(), role=_role(), q=normName(_rFilter.q);
  var list=all.filter(function(r){
    if(_rFilter.status==="__mine__"){ if(!crqCanAct(r.status, role)) return false; }
    else if(_rFilter.status && r.status!==_rFilter.status) return false;
    if(_rFilter.engagement && r.engagement!==_rFilter.engagement) return false;
    if(q){
      var hay=normName(r.id)+" "+normName(r.vendorName)+" "+normName(r.title)+" "+normName(_projName(r));
      if(hay.indexOf(q)===-1) return false;
    }
    return true;
  });

  var mine   = all.filter(function(r){ return crqCanAct(r.status, role); }).length;
  var wip    = all.filter(function(r){ return !crqIsFinal(r.status) && !crqIsBounced(r.status); });
  var ready  = all.filter(function(r){ return r.status==="crq_approved"; }).length;
  var wipVal = wip.reduce(function(s,r){ return s+(Number(r.value)||0); },0);

  var actions = canCreateReq()
    ? '<button class="btn btn-primary btn-sm" onclick="contracts.newRequest()">'+_icn("plus")+' طلب تعاقد جديد</button>' : "";
  var head = headHTML("طلبات التعاقد", "من المقايسة إلى عقدٍ ساري — أو أمرِ دفعٍ للاتفاق الصغير.", actions, "fileText");

  var strip = '<div class="ct-strip">'+
    '<div class="ct-stat'+(mine?' warn':'')+'"><span class="l">بانتظار دورك</span><span class="v">'+mine+'</span></div>'+
    '<div class="ct-stat"><span class="l">قيد الاعتماد</span><span class="v">'+wip.length+'</span></div>'+
    '<div class="ct-stat"><span class="l">قيمتها (ر.س)</span><span class="v">'+money0(wipVal)+'</span></div>'+
    '<div class="ct-stat"><span class="l">جاهزٌ للعقد</span><span class="v">'+ready+'</span></div>'+
  '</div>';

  var filters = '<div class="ct-filters">'+
    '<input class="form-input ct-search" id="ct-r-q" placeholder="ابحث برقم الطلب أو الطرف أو المشروع" value="'+_esc(_rFilter.q)+'" oninput="contracts.filterReqs(\'q\',this.value)">'+
    '<select class="form-input" onchange="contracts.filterReqs(\'status\',this.value)">'+
      '<option value="">كل الحالات</option>'+
      '<option value="__mine__"'+(_rFilter.status==="__mine__"?" selected":"")+'>بانتظار دوري</option>'+
      Object.keys(CRQ_STATUS).map(function(k){
        return '<option value="'+k+'"'+(_rFilter.status===k?' selected':'')+'>'+_esc(CRQ_STATUS[k])+'</option>';
      }).join("")+
    '</select>'+
    '<select class="form-input" onchange="contracts.filterReqs(\'engagement\',this.value)">'+
      '<option value="">عقودٌ وأوامرُ دفع</option>'+
      Object.keys(ENGAGEMENTS).map(function(k){
        return '<option value="'+k+'"'+(_rFilter.engagement===k?' selected':'')+'>'+_esc(ENGAGEMENTS[k].lbl)+'</option>';
      }).join("")+
    '</select>'+
  '</div>';

  var body;
  if(_rError){
    body='<div class="card" style="text-align:center;padding:30px 18px"><div style="color:var(--danger);font-size:13px;font-weight:700">'+_icn("alertTriangle")+' '+_esc(_rError)+'</div>'+
      '<button class="btn btn-ghost btn-sm" style="margin-top:12px" onclick="contracts.retryReqs()">'+_icn("rotateCcw")+' إعادة المحاولة</button></div>';
  } else if(!_rLoaded){
    body='<div class="card" style="text-align:center;padding:30px 18px;color:var(--muted);font-size:13px">جارٍ التحميل…</div>';
  } else if(!all.length){
    body='<div class="card ct-empty">'+
      '<div class="ct-empty-ic">'+_svg("fileText")+'</div>'+
      '<div class="ct-empty-t">لا طلبات تعاقد بعد</div>'+
      '<div class="ct-empty-s">ابدأ بطلبٍ من مقايسة مشروعك: تختار بنوداً، فيرث الطلبُ كمياتِها وبندَ موازنتها، ويمرّ على معتمِديه.</div>'+
      (canCreateReq()?'<button class="btn btn-primary btn-sm" style="margin-top:14px" onclick="contracts.newRequest()">'+_icn("plus")+' طلب تعاقد جديد</button>':'')+
    '</div>';
  } else if(!list.length){
    body='<div class="card" style="text-align:center;padding:26px 18px;color:var(--muted);font-size:13px">لا نتائج تطابق البحث.</div>';
  } else {
    body='<div class="ct-grid">'+list.map(reqTileHTML).join("")+'</div>';
  }
  return head+strip+filters+body;
}

function reqTileHTML(r){
  var eng=ENGAGEMENTS[r.engagement]||ENGAGEMENTS.contract;
  var owner=crqGateOwner(r.status);
  return '<div class="ct-tile" style="--rail:'+reqRail(r.status)+'" onclick="contracts.openReq(\''+_jq(r.id)+'\')">'+
    '<div class="ct-tile-top">'+
      '<div class="ct-tile-name">'+_esc(r.title||r.vendorName||r.id)+'</div>'+
      reqBadge(r.status)+
    '</div>'+
    '<div class="ct-tile-kind">'+_icn(eng.icon,"ic-sm")+' '+_esc(eng.lbl)+
      ' <span class="ct-dot">·</span> <span class="num">'+_esc(r.id)+'</span>'+
      ' <span class="ct-dot">·</span> '+_esc(_projName(r))+'</div>'+
    '<div class="ct-tile-foot">'+
      '<div class="ct-money"><span class="num">'+money(r.value)+'</span> <small>ر.س</small></div>'+
      '<div class="ct-tile-who">'+_esc(r.vendorName||"—")+(owner?' <span class="ct-dot">·</span> عند '+_esc(owner.lbl):'')+'</div>'+
    '</div>'+
  '</div>';
}

/* ── نموذجُ الطلب الجديد ── */
function canCreateReq(){ return ["project_manager","admin"].indexOf(_role()) !== -1; }

function newRequest(){
  if(!canCreateReq()) return _toast("⚠ إنشاء طلب التعاقد لمدير المشاريع أو الأدمن","warn");
  var projs=_projects();
  _rOpen=null;
  _rDraft = {
    engagement:"contract", projectSel:(projs[0]||{}).id||"__NEW_MANUAL__", projectName:"",
    title:"", scope:"",
    vendorId:"", vendorName:"", vatMode:"incl", budgetCategoryKey:"",
    lines:[], candidates:[], rationale:"", durationDays:0, startDate:"",
    advance:{pct:0,recoveryPct:0}, retention:{pct:0,releaseOn:"completion"},
    penalty:{perDayPct:0,capPct:0}, warranty:{months:0}, value:0
  };
  paintReqs();
  loadProjectData(_draftLoadKey());
}
/* مفتاحُ تحميلِ بيانات مشروع المسوّدة (المقايسة/الموازنة). */
function _draftLoadKey(){
  if(!_rDraft) return "";
  var ref = normalizeProjectRef(_rDraft.projectSel, _rDraft.projectName, pmManualPrefix());
  return _projLoadKey(ref);
}
function loadProjectData(projId){
  if(!projId){ if(_rDraft) paintReqs(); return; }
  Promise.all([loadBoqFor(projId), loadBudgetFor(projId)]).then(function(){ if(_rDraft) paintReqs(); });
}
function setReqProject(sel){
  syncReqDraft(); if(!_rDraft) return;
  _rDraft.projectSel=sel; _rDraft.lines=[]; _rDraft.budgetCategoryKey="";
  paintReqs(); loadProjectData(_draftLoadKey());
}
function setEngagement(v){ syncReqDraft(); if(!_rDraft) return; _rDraft.engagement=v; paintReqs(); }
function setReqVendor(vid){
  syncReqDraft(); if(!_rDraft) return;
  var v=vendorById(vid);
  _rDraft.vendorId=vid; _rDraft.vendorName=v?(v.name||""):"";
  if(v) _rDraft.vatMode = suggestVatMode(v);   // اقتراحٌ يُطبَّق ويبقى قابلاً للتغيير
  paintReqs();
}
function toggleBoqLine(i){
  syncReqDraft(); if(!_rDraft) return;
  var items=_boqCache[_draftLoadKey()]||[];
  var it=items[i]; if(!it) return;
  var key=it.id||("boq_"+i);
  var at=_rDraft.lines.findIndex(function(l){ return l.boqLineId===key; });
  if(at>=0) _rDraft.lines.splice(at,1);
  else _rDraft.lines.push({ id:_uid(), boqLineId:key, desc:it.desc||"", unit:it.unit||"",
                            qty:Number(it.qty)||0, unitPrice:Number(it.unitPrice)||0,
                            budgetCategoryKey:it.categoryKey||"uncategorized" });
  paintReqs();
}
function addFreeLine(){ syncReqDraft(); if(!_rDraft) return;
  _rDraft.lines.push({ id:_uid(), boqLineId:null, desc:"", unit:"", qty:0, unitPrice:0, budgetCategoryKey:_rDraft.budgetCategoryKey||"subcontractor" });
  paintReqs(); }
function delReqLine(i){ syncReqDraft(); if(!_rDraft) return; _rDraft.lines.splice(i,1); paintReqs(); }
function addCandidate(){ syncReqDraft(); if(!_rDraft) return; _rDraft.candidates.push({ vendorId:"", amount:0, notes:"" }); paintReqs(); }
function delCandidate(i){ syncReqDraft(); if(!_rDraft) return; _rDraft.candidates.splice(i,1); paintReqs(); }
function _uid(){ return "L"+Math.random().toString(36).slice(2,9); }

function syncReqDraft(){
  if(!_rDraft) return;
  var d=_rDraft;
  function v(id){ var e=document.getElementById(id); return e?String(e.value||"").trim():""; }
  function n(id){ var e=document.getElementById(id); return e?(Number(e.value)||0):0; }
  if(document.getElementById("ct-r-title")) d.title=v("ct-r-title");
  if(document.getElementById("ct-r-scope")) d.scope=v("ct-r-scope");
  if(document.getElementById("ct-r-vat"))   d.vatMode=normVatMode(v("ct-r-vat"));
  if(document.getElementById("ct-r-cat"))   d.budgetCategoryKey=v("ct-r-cat");
  if(document.getElementById("ct-r-mproj")) d.projectName=v("ct-r-mproj");
  if(document.getElementById("ct-r-dur"))   d.durationDays=n("ct-r-dur");
  if(document.getElementById("ct-r-start")) d.startDate=v("ct-r-start");
  if(document.getElementById("ct-r-rationale")) d.rationale=v("ct-r-rationale");
  if(document.getElementById("ct-r-adv"))   { d.advance=d.advance||{}; d.advance.pct=n("ct-r-adv"); d.advance.recoveryPct=n("ct-r-advrec"); }
  if(document.getElementById("ct-r-ret"))   { d.retention=d.retention||{}; d.retention.pct=n("ct-r-ret"); var ro=document.getElementById("ct-r-reton"); if(ro) d.retention.releaseOn=ro.value; }
  if(document.getElementById("ct-r-pen"))   { d.penalty=d.penalty||{}; d.penalty.perDayPct=n("ct-r-pen"); d.penalty.capPct=n("ct-r-pencap"); }
  if(document.getElementById("ct-r-warr"))  { d.warranty=d.warranty||{}; d.warranty.months=n("ct-r-warr"); }
  var lt=document.getElementById("ct-r-lines");
  if(lt) lt.querySelectorAll("[data-lf]").forEach(function(inp){
    var i=parseInt(inp.dataset.i,10), f=inp.dataset.lf;
    if(!d.lines[i]||!f) return;
    d.lines[i][f] = (f==="qty"||f==="unitPrice") ? (Number(inp.value)||0) : String(inp.value||"").trim();
  });
  var ct=document.getElementById("ct-r-cands");
  if(ct) ct.querySelectorAll("[data-cf]").forEach(function(inp){
    var i=parseInt(inp.dataset.i,10), f=inp.dataset.cf;
    if(!d.candidates[i]||!f) return;
    d.candidates[i][f] = (f==="amount") ? (Number(inp.value)||0) : String(inp.value||"").trim();
  });
  d.value = crqValueOf(d);
}

function reqFormHTML(){
  var d=_rDraft, projs=_projects();
  var pref=pmManualPrefix();
  var ref=normalizeProjectRef(d.projectSel, d.projectName, pref);
  var loadKey=_projLoadKey(ref);
  var items=_boqCache[loadKey]||[];
  var bud=_budCache[loadKey]||null;
  var isManual=ref.isCustomProject;
  var linkState=budgetLinkState(d.budgetCategoryKey, bud);
  var tot=linesTotal(d.lines, d.vatMode);
  var payTh=payOrderThreshold(), ceoTh=ceoThreshold();
  var payOk=payOrderAllowed(tot.total, payTh);
  var isPay=d.engagement==="pay_order";
  var vend=vendorById(d.vendorId);
  var elig=vend?vendorEligibility(vend,_today()):null;

  var back='<button class="btn btn-ghost btn-sm ct-back" onclick="contracts.cancelRequest()">'+_icn("rotateCcw")+' إلغاء</button>';

  /* اختيارُ نوع الارتباط — العتبةُ **تسمح ولا تُلزم**، وفوقها أمرُ الدفع مقفلٌ بنصٍّ
     يشرح السبب بدل زرٍّ ميّتٍ بلا تفسير. */
  var engCards = Object.keys(ENGAGEMENTS).map(function(k){
    var e=ENGAGEMENTS[k], locked = (k==="pay_order" && !payOk && tot.total>0);
    return '<label class="ct-pick'+(d.engagement===k?" on":"")+(locked?" off":"")+'">'+
      '<input type="radio" name="ct-eng" '+(d.engagement===k?"checked":"")+(locked?" disabled":"")+
        ' onchange="contracts.setEngagement(\''+k+'\')">'+
      '<span class="ct-pick-t">'+_icn(e.icon,"ic-sm")+' '+_esc(e.lbl)+'</span>'+
      '<span class="ct-pick-s">'+_esc(locked ? ("لا يجوز فوق "+money0(payTh)+" ر.س") : e.hint)+'</span>'+
    '</label>';
  }).join("");

  // بنودُ المقايسة
  var boqRows = items.length ? items.map(function(it,i){
    var key=it.id||("boq_"+i);
    var on=d.lines.some(function(l){ return l.boqLineId===key; });
    var t=lineTotal(it.qty,it.unitPrice,d.vatMode).total;
    return '<tr class="'+(on?"ct-on":"")+'" onclick="contracts.toggleBoqLine('+i+')" style="cursor:pointer">'+
      '<td><input type="checkbox" '+(on?"checked":"")+' onclick="event.stopPropagation();contracts.toggleBoqLine('+i+')"></td>'+
      '<td>'+_esc(it.desc||"—")+'</td>'+
      '<td>'+_esc(catName(it.categoryKey))+'</td>'+
      '<td class="num">'+money0(it.qty)+' '+_esc(it.unit||"")+'</td>'+
      '<td class="num">'+money(it.unitPrice)+'</td>'+
      '<td class="num">'+money(t)+'</td>'+
    '</tr>';
  }).join("") : '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:16px">لا مقايسة لهذا المشروع — أضِف بنوداً يدوياً بالأسفل.</td></tr>';

  // البنودُ المختارة (قابلةٌ للتحرير)
  var lineRows = d.lines.length ? d.lines.map(function(l,i){
    var t=lineTotal(l.qty,l.unitPrice,d.vatMode);
    return '<tr>'+
      '<td><input class="form-input" data-lf="desc" data-i="'+i+'" value="'+_esc(l.desc)+'" placeholder="وصف البند">'+
        (l.boqLineId?'':' <span class="ct-doc s-soon">خارج المقايسة</span>')+'</td>'+
      '<td><input class="form-input" data-lf="unit" data-i="'+i+'" value="'+_esc(l.unit)+'" style="min-width:70px"></td>'+
      '<td><input class="form-input num" data-lf="qty" data-i="'+i+'" type="number" step="any" value="'+_esc(l.qty)+'" style="min-width:80px" oninput="contracts.recalc()"></td>'+
      '<td><input class="form-input num" data-lf="unitPrice" data-i="'+i+'" type="number" step="any" value="'+_esc(l.unitPrice)+'" style="min-width:90px" oninput="contracts.recalc()"></td>'+
      '<td class="num">'+money(t.total)+'</td>'+
      '<td><button class="btn btn-delete" onclick="contracts.delReqLine('+i+')">'+_icn("trash","ic-sm")+'</button></td>'+
    '</tr>';
  }).join("") : '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:14px">لم تُختَر بنودٌ بعد.</td></tr>';

  // تحذيرُ الموازنة
  var budWarn="";
  var byCat={};
  d.lines.forEach(function(l){ var k=l.budgetCategoryKey||"uncategorized"; byCat[k]=(byCat[k]||0)+lineTotal(l.qty,l.unitPrice,d.vatMode).total; });
  if(linkState !== "no_budget") Object.keys(byCat).forEach(function(k){
    var planned=budgetPlanned(loadKey,k);
    if(planned!=null && byCat[k]>planned){
      budWarn += '<div class="ct-note warn">'+_icn("alertTriangle","ic-sm")+' بند «'+_esc(catName(k))+'»: الطلب '+money0(byCat[k])+
        ' ر.س والموازنة المخطّطة '+money0(planned)+' ر.س — تجاوزٌ يُسجَّل ولا يمنع الإرسال.</div>';
    }
  });

  // المرشّحون
  var candRows = d.candidates.map(function(c,i){
    return '<tr>'+
      '<td><select class="form-input" data-cf="vendorId" data-i="'+i+'">'+vendorOptions(c.vendorId)+'</select></td>'+
      '<td><input class="form-input num" data-cf="amount" data-i="'+i+'" type="number" step="any" value="'+_esc(c.amount)+'" style="min-width:100px"></td>'+
      '<td><input class="form-input" data-cf="notes" data-i="'+i+'" value="'+_esc(c.notes||"")+'" placeholder="ملاحظة"></td>'+
      '<td><button class="btn btn-delete" onclick="contracts.delCandidate('+i+')">'+_icn("trash","ic-sm")+'</button></td>'+
    '</tr>';
  }).join("");

  var terms = isPay ? '' :
    '<div class="card ct-sec">'+
      '<div class="ct-sec-h">'+_icn("shield","ic-sm")+' الشروط التجارية'+
        '<span class="ct-sec-lock">تُقرَّ هنا لتراها المالية — وتغييرُها بعد اعتمادها يُعيد الطلب إليها</span></div>'+
      '<div class="ct-form-row">'+
        field("الدفعة المقدمة %", '<input class="form-input num" id="ct-r-adv" type="number" step="any" value="'+_esc((d.advance||{}).pct||0)+'">')+
        field("تُستردّ من كل مستخلص %", '<input class="form-input num" id="ct-r-advrec" type="number" step="any" value="'+_esc((d.advance||{}).recoveryPct||0)+'">')+
      '</div>'+
      '<div class="ct-form-row">'+
        field("محتجز الضمان %", '<input class="form-input num" id="ct-r-ret" type="number" step="any" value="'+_esc((d.retention||{}).pct||0)+'">')+
        field("يُفرَج عنه", '<select class="form-input" id="ct-r-reton">'+
          '<option value="completion"'+(((d.retention||{}).releaseOn||"completion")==="completion"?" selected":"")+'>عند الاستلام الابتدائي</option>'+
          '<option value="warranty_end"'+(((d.retention||{}).releaseOn)==="warranty_end"?" selected":"")+'>بعد انتهاء الضمان</option>'+
        '</select>')+
      '</div>'+
      '<div class="ct-form-row">'+
        field("غرامة التأخير % لكل يوم", '<input class="form-input num" id="ct-r-pen" type="number" step="any" value="'+_esc((d.penalty||{}).perDayPct||0)+'">')+
        field("سقف الغرامة % من العقد", '<input class="form-input num" id="ct-r-pencap" type="number" step="any" value="'+_esc((d.penalty||{}).capPct||0)+'">')+
      '</div>'+
      '<div class="ct-form-row">'+
        field("مدة الضمان (شهراً)", '<input class="form-input num" id="ct-r-warr" type="number" step="any" value="'+_esc((d.warranty||{}).months||0)+'">')+
        field("مدة التنفيذ (يوماً)", '<input class="form-input num" id="ct-r-dur" type="number" step="any" value="'+_esc(d.durationDays||0)+'">')+
      '</div>'+
    '</div>';

  var vatSel='<select class="form-input" id="ct-r-vat" onchange="contracts.recalc(true)">'+
    Object.keys(VAT_MODES).map(function(k){ return '<option value="'+k+'"'+(d.vatMode===k?' selected':'')+'>'+_esc(VAT_MODES[k].lbl)+'</option>'; }).join("")+
    '</select>';

  var eligNote = elig && elig.reason
    ? '<div class="ct-note '+(elig.block?"crit":"warn")+'">'+_icn("alertTriangle","ic-sm")+' '+_esc(elig.reason)+'</div>' : "";

  var ceoNote = tot.total >= ceoTh
    ? '<div class="ct-note">'+_icn("building2","ic-sm")+' القيمة تتجاوز سقف المدير التنفيذي ('+money0(ceoTh)+' ر.س) — سيمرّ الطلب عليه.</div>' : "";

  return back +
  headHTML("طلب تعاقد جديد","","", "filePlus") +
  '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("clipboardList","ic-sm")+' الأساسيات</div>'+
    '<div class="ct-form-row">'+
      field("المشروع", '<select class="form-input" onchange="contracts.setReqProject(this.value)">'+
        projs.map(function(p){ return '<option value="'+_esc(p.id)+'"'+(d.projectSel===p.id?' selected':'')+'>'+_esc(p.name)+(p.manual?" — يدويّ":"")+'</option>'; }).join("")+
        '<option value="__NEW_MANUAL__"'+(d.projectSel==="__NEW_MANUAL__"?' selected':'')+'>— مشروع يدويّ جديد —</option>'+
      '</select>')+
      field("عنوان العمل *", '<input class="form-input" id="ct-r-title" value="'+_esc(d.title)+'" placeholder="مثال: محارة وبياض الدور الأول">')+
    '</div>'+
    (d.projectSel==="__NEW_MANUAL__" ? '<div class="ct-form-row">'+
      field("اسم المشروع اليدويّ *", '<input class="form-input" id="ct-r-mproj" value="'+_esc(d.projectName||"")+'" placeholder="اسمٌ يُكتب باليد — بلا سجلٍّ في قائمة المشاريع">')+
      '<div></div>'+
    '</div>' : '')+
    '<div class="ct-form-row">'+
      field("الطرف *", '<select class="form-input" onchange="contracts.setReqVendor(this.value)">'+vendorOptions(d.vendorId)+'</select>')+
      field("وضع الضريبة", vatSel)+
    '</div>'+
    budgetLinkHTML(linkState, d.budgetCategoryKey) +
    eligNote +
    '<div class="ct-picks">'+engCards+'</div>'+
  '</div>'+
  (isPay || !items.length ? '' :
  '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("book","ic-sm")+' بنود المقايسة — '+_esc(_projName(ref))+
      '<span class="ct-sec-lock">اختَر ما تُسنِده، فيرث الطلبُ كميتَه وبندَ موازنته</span></div>'+
    '<div class="ct-table-wrap"><table class="ct-table"><thead><tr>'+
      '<th></th><th>البند</th><th>بند الموازنة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th>'+
    '</tr></thead><tbody>'+boqRows+'</tbody></table></div>'+
  '</div>')+
  '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("layers","ic-sm")+' البنود المطلوبة'+
      '<button class="btn btn-ghost btn-sm" style="margin-inline-start:auto" onclick="contracts.addFreeLine()">'+_icn("plus","ic-sm")+' بند حرّ</button></div>'+
    '<div class="ct-table-wrap"><table class="ct-table" id="ct-r-lines"><thead><tr>'+
      '<th>الوصف</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th><th></th>'+
    '</tr></thead><tbody>'+lineRows+'</tbody></table></div>'+
    '<div class="ct-total" id="ct-r-total">'+totalsHTML(tot, d.vatMode)+'</div>'+
    budWarn + ceoNote +
  '</div>'+
  terms +
  '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("users","ic-sm")+' المرشّحون وعروضهم'+
      '<button class="btn btn-ghost btn-sm" style="margin-inline-start:auto" onclick="contracts.addCandidate()">'+_icn("plus","ic-sm")+' مرشّح</button></div>'+
    (candRows ? '<div class="ct-table-wrap"><table class="ct-table" id="ct-r-cands"><thead><tr>'+
      '<th>الطرف</th><th>قيمة العرض</th><th>ملاحظة</th><th></th></tr></thead><tbody>'+candRows+'</tbody></table></div>'
      : '<div style="color:var(--muted);font-size:12px">لا مرشّحين — أضِفهم ليرى معتمِدُ المشتريات التنافس.</div>')+
    '<div style="margin-top:12px">'+field("مبرّر اختيار الطرف (إلزامي إن لم يكن الأرخص)",
      '<textarea class="form-input" id="ct-r-rationale" rows="2">'+_esc(d.rationale||"")+'</textarea>')+'</div>'+
  '</div>'+
  '<div class="ct-save-bar">'+
    '<button class="btn btn-ghost btn-sm" onclick="contracts.cancelRequest()">إلغاء</button>'+
    '<button class="btn btn-success btn-sm" id="ct-r-send" onclick="contracts.submitRequest()">'+_icn("send","ic-sm")+' إرسال للاعتماد</button>'+
  '</div>';
}

/* الربطُ بالموازنة **اختياريّ** — والشاشةُ تقول ذلك صراحةً بدل أن تتركه لغزاً:
   مشروعٌ بلا موازنة لا يُلام ولا يُحذَّر، ومشروعٌ له موازنةٌ والمستخدمُ لم يربط
   يرى إشارةً محايدةً تشرح ما يفوته فقط. */
function budgetLinkHTML(state, catKey){
  var pm=_pm(), cats=[];
  try{ if(pm && pm._BUDGET_CATEGORIES) cats=pm._BUDGET_CATEGORIES; }catch(e){}
  if(state === "no_budget"){
    return '<div class="ct-note">'+_icn("landmark","ic-sm")+
      ' لا موازنةَ لهذا المشروع — <b>الربطُ بالموازنة اختياريّ</b>، والعقدُ صحيحٌ تامٌّ بدونه.</div>';
  }
  var sel='<select class="form-input" id="ct-r-cat" onchange="contracts.recalc(true)">'+
    '<option value=""'+(!catKey?' selected':'')+'>— بلا ربطٍ بالموازنة (اختياريّ) —</option>'+
    cats.map(function(c){ return '<option value="'+_esc(c.key)+'"'+(catKey===c.key?' selected':'')+'>'+_esc(c.name)+'</option>'; }).join("")+
  '</select>';
  return '<div class="ct-form-row">'+
    field("بند الموازنة (اختياريّ)", sel)+
    '<div class="ct-field"><span class="ct-field-l">&nbsp;</span>'+
      '<div class="ct-note" style="margin:0">'+_icn(state==="linked"?"checkCircle":"alertCircle","ic-sm")+' '+
        (state==="linked" ? "مربوطٌ — تُقارَن قيمةُ الطلب بالمخطَّط لهذا البند."
                          : "غيرُ مربوط — يمرّ الطلبُ عادياً، ولا يظهر في مقارنة المخطَّط بالمتعاقَد عليه.")+
      '</div></div>'+
  '</div>';
}

function totalsHTML(t, mode){
  var m=VAT_MODES[normVatMode(mode)];
  return '<div class="ct-tl"><span class="l">الأساس</span><span class="v num">'+money(t.base)+'</span></div>'+
    '<div class="ct-tl"><span class="l">ض.ق.م</span><span class="v num">'+money(t.vat)+'</span></div>'+
    '<div class="ct-tl big"><span class="l">الإجمالي — '+_esc(m.short)+'</span><span class="v num">'+money(t.total)+'</span></div>';
}
function vendorOptions(sel){
  return '<option value="">— اختر الطرف —</option>'+_vendors.map(function(v){
    var ent=ENTITY_TYPES[normEntity(v.entityType)];
    return '<option value="'+_esc(v.id)+'"'+(sel===v.id?' selected':'')+'>'+_esc(v.name||v.id)+' — '+_esc(ent.short)+'</option>';
  }).join("");
}
/* إعادةُ حسابِ الإجماليات وحدَها دون إعادة رسم النموذج — فلا يقفز مؤشّرُ الكتابة. */
function recalc(full){
  syncReqDraft();
  if(!_rDraft) return;
  if(full){ paintReqs(); return; }
  var box=document.getElementById("ct-r-total");
  if(box) box.innerHTML = totalsHTML(linesTotal(_rDraft.lines,_rDraft.vatMode), _rDraft.vatMode);
}
function cancelRequestForm(){ _rDraft=null; paintReqs(); }

function submitRequest(){
  syncReqDraft();
  var d=_rDraft; if(!d) return;
  if(!d.title){ _toast("⚠ عنوان العمل مطلوب","warn"); return; }
  var pref=pmManualPrefix();
  var ref=normalizeProjectRef(d.projectSel, d.projectName, pref);
  if(!ref.isCustomProject && !ref.projectId){ _toast("⚠ اختر المشروع","warn"); return; }
  if(ref.isCustomProject && !ref.projectName){ _toast("⚠ اكتب اسم المشروع اليدويّ","warn"); return; }
  if(!d.vendorId){ _toast("⚠ اختر الطرف المتعاقَد معه","warn"); return; }
  if(!d.lines.length){ _toast("⚠ أضِف بنداً واحداً على الأقل","warn"); return; }
  var v=vendorById(d.vendorId);
  var elig=v?vendorEligibility(v,_today()):null;
  if(elig && elig.block){ _toast("⚠ "+elig.reason,"warn"); return; }
  var total=crqValueOf(d);
  if(total<=0){ _toast("⚠ قيمة الطلب صفر — راجع الكميات والأسعار","warn"); return; }
  if(d.engagement==="pay_order" && !payOrderAllowed(total,payOrderThreshold())){
    _toast("⚠ أمر الدفع لا يجوز عند "+money0(payOrderThreshold())+" ر.س فأكثر — حوّله إلى عقد","warn"); return;
  }
  var btn=document.getElementById("ct-r-send"); if(btn){ btn.disabled=true; btn.textContent="جارٍ الإرسال…"; }
  // الشكلُ القياسيُّ للمشروع يُثبَّت هنا مرةً واحدة — ولا يُخزَّن معرّفُ العرض الداخليّ
  var payload=Object.assign({}, d, ref);
  delete payload.projectSel;
  createRequest(payload).then(function(id){
    _rDraft=null; _rOpen=id; paintReqs();
    _toast("✅ أُرسل الطلب "+id,"success");
  }).catch(function(e){
    console.warn("contracts/submitRequest",e);
    if(btn){ btn.disabled=false; btn.innerHTML=_icn("send","ic-sm")+" إرسال للاعتماد"; }
    _toast("⚠ تعذّر الإرسال — "+(e&&e.message?e.message:"أعد المحاولة"),"warn");
  });
}

/* ── بطاقةُ الطلب ── */
function reqCardHTML(id){
  var r=requestById(id);
  if(!r) return headHTML("طلبات التعاقد","","", "fileText")+'<div class="card">تعذّر العثور على الطلب.</div>';
  var eng=ENGAGEMENTS[r.engagement]||ENGAGEMENTS.contract;
  var owner=crqGateOwner(r.status);
  var mine=crqCanAct(r.status,_role());
  var back='<button class="btn btn-ghost btn-sm ct-back" onclick="contracts.backToReqs()">'+_icn("rotateCcw")+' كل الطلبات</button>';

  var tools="";
  if(r.status==="crq_approved" && ["procurement_officer","admin"].indexOf(_role())!==-1){
    tools+='<button class="btn btn-primary btn-sm" onclick="contracts.makeContract()">'+_icn("briefcase","ic-sm")+' إنشاء العقد</button> ';
  }
  if(r.status==="crq_converted" && r.contractId){
    tools+='<button class="btn btn-ghost btn-sm" onclick="contracts.openCtrFromReq(\''+_jq(r.contractId)+'\')">'+_icn("briefcase","ic-sm")+' العقد '+_esc(r.contractId)+'</button> ';
  }
  if(mine && r.status==="crq_pending_pay"){
    tools+='<button class="btn btn-success btn-sm" onclick="contracts.openPay()">'+_icn("banknote","ic-sm")+' تسجيل السداد</button> ';
  } else if(mine){
    tools+='<button class="btn btn-success btn-sm" onclick="contracts.act(\'approve\')">'+_icn("checkCircle","ic-sm")+' اعتماد</button> '+
           '<button class="btn btn-ghost btn-sm" onclick="contracts.act(\'reject\')">'+_icn("xCircle","ic-sm")+' رفض / إعادة</button> ';
  }
  if(!crqIsFinal(r.status) && (_role()==="admin" || r.createdByUser===_meUser())){
    tools+='<button class="btn btn-ghost btn-sm" onclick="contracts.doCancel()">'+_icn("ban","ic-sm")+' إلغاء</button>';
  }

  var t=linesTotal(r.lines||[], r.vatMode);
  var info='<div class="ct-info">'+
    infoCell("الطرف", _esc(r.vendorName||"—"))+
    infoCell("المشروع", _esc(_projName(r))+(r.isCustomProject?' <span class="ct-doc s-none">يدويّ</span>':""))+
    infoCell("نوع الارتباط", _icn(eng.icon,"ic-sm")+" "+_esc(eng.lbl))+
    infoCell("وضع الضريبة", _esc((VAT_MODES[normVatMode(r.vatMode)]||{}).short||"—"))+
    infoCell("مدة التنفيذ", r.durationDays?(money0(r.durationDays)+" يوماً"):"—")+
    infoCell("أنشأه", _esc(r.createdBy||"—"))+
  '</div>';

  var lineRows=(r.lines||[]).map(function(l){
    var lt=lineTotal(l.qty,l.unitPrice,r.vatMode);
    return '<tr><td>'+_esc(l.desc||"—")+'</td><td>'+_esc(l.unit||"")+'</td>'+
      '<td class="num">'+money0(l.qty)+'</td><td class="num">'+money(l.unitPrice)+'</td>'+
      '<td class="num">'+money(lt.total)+'</td></tr>';
  }).join("") || '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:14px">—</td></tr>';

  var termsRow = r.engagement==="pay_order" ? "" :
    '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("shield","ic-sm")+' الشروط التجارية</div><div class="ct-info">'+
      infoCell("الدفعة المقدمة", ((r.advance||{}).pct||0)+"٪")+
      infoCell("محتجز الضمان", ((r.retention||{}).pct||0)+"٪")+
      infoCell("غرامة التأخير", ((r.penalty||{}).perDayPct||0)+"٪ يومياً — سقف "+((r.penalty||{}).capPct||0)+"٪")+
      infoCell("مدة الضمان", ((r.warranty||{}).months||0)+" شهراً")+
    '</div></div>';

  var cands=(r.candidates||[]).filter(function(c){ return c.vendorId; });
  var candSec = cands.length ? '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("users","ic-sm")+' المرشّحون</div>'+
    '<div class="ct-table-wrap"><table class="ct-table"><thead><tr><th>الطرف</th><th>العرض</th><th>ملاحظة</th></tr></thead><tbody>'+
    cands.map(function(c){
      var v=vendorById(c.vendorId);
      var win=c.vendorId===r.vendorId;
      return '<tr'+(win?' class="ct-on"':'')+'><td>'+_esc(v?v.name:c.vendorId)+(win?' <span class="ct-doc s-ok">الفائز</span>':'')+'</td>'+
        '<td class="num">'+money(c.amount)+'</td><td>'+_esc(c.notes||"")+'</td></tr>';
    }).join("")+'</tbody></table></div>'+
    (r.rationale?'<div class="ct-note">'+_icn("lightbulb","ic-sm")+' '+_esc(r.rationale)+'</div>':'')+
  '</div>' : "";

  var tl=(r.timeline||[]).map(function(e){
    return '<div class="ct-tl-row"><span class="d"></span><div><div class="t">'+_esc(e.event)+'</div>'+
      '<div class="m">'+_esc(e.by||"")+' · '+_esc(String(e.at||"").slice(0,16).replace("T"," "))+
      (e.note?' — '+_esc(e.note):'')+'</div></div></div>';
  }).join("") || '<div style="color:var(--muted);font-size:12px">—</div>';

  var payBox = r.payment ? '<div class="ct-note">'+_icn("banknote","ic-sm")+' سُدِّد '+money(r.payment.amount)+' ر.س'+
    (r.payment.ref?(' — '+_esc(r.payment.ref)):'')+' · '+_esc(r.payment.by||"")+
    (r.payment.receiptUrl?' · <a class="ct-link" href="'+_esc(r.payment.receiptUrl)+'" target="_blank" rel="noopener">'+_icn("paperclip","ic-sm")+' الإيصال</a>':'')+'</div>' : "";

  var waiting = owner && !crqIsFinal(r.status)
    ? '<div class="ct-note '+(mine?"warn":"")+'">'+_icn("timer","ic-sm")+' '+
      (mine ? "الطلب بانتظار إجراءٍ منك — "+_esc(owner.lbl) : "بانتظار "+_esc(owner.lbl))+'</div>' : "";

  return back +
    headHTML(r.title||r.id, reqBadge(r.status)+' <span class="ct-id num">'+_esc(r.id)+'</span>', tools, eng.icon) +
    waiting + payBox +
    '<div class="card ct-sec">'+info+
      (r.scope?'<div class="ct-note" style="margin-top:12px">'+_esc(r.scope)+'</div>':'')+'</div>'+
    '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("layers","ic-sm")+' البنود</div>'+
      '<div class="ct-table-wrap"><table class="ct-table"><thead><tr><th>الوصف</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>'+
      '<tbody>'+lineRows+'</tbody></table></div>'+
      '<div class="ct-total">'+totalsHTML(t, r.vatMode)+'</div>'+
    '</div>'+
    termsRow + candSec +
    '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("scrollText","ic-sm")+' السجل الزمني</div><div class="ct-timeline">'+tl+'</div></div>';
}

/* ── أفعالُ الطلب ── */
function filterReqs(k,v){
  _rFilter[k]=v||""; paintReqs();
  if(k==="q"){ var i=document.getElementById("ct-r-q"); if(i){ i.focus(); try{ i.setSelectionRange(i.value.length,i.value.length); }catch(e){} } }
}
function openReq(id){ _rOpen=id; _rDraft=null; paintReqs(); }
function backToReqs(){ _rOpen=null; _rDraft=null; paintReqs(); }
function retryReqs(){ stopReqSync(); startReqSync(); paintReqs(); }

function act(action){
  var r=requestById(_rOpen); if(!r) return;
  var isRej = action==="reject";
  Promise.resolve(_confirm({
    title: isRej?"رفض / إعادة الطلب":"اعتماد الطلب",
    msg: isRej ? "سيعود الطلب لمُنشئه للتصحيح. اكتب السبب في الخطوة التالية."
               : 'اعتماد «'+(r.title||r.id)+'» بقيمة '+money(r.value)+' ر.س؟'
  })).then(function(ok){
    if(!ok) return;
    var note="";
    if(isRej){
      note=(window.prompt("سبب الرفض / الإعادة (إلزامي):")||"").trim();
      if(!note){ _toast("⚠ السبب إلزامي","warn"); return; }
    }
    return actOnRequest(_rOpen, action, note).then(function(){
      paintReqs(); _toast(isRej?"✅ أُعيد الطلب مع السبب":"✅ اعتُمد","success");
    });
  }).catch(function(e){
    console.warn("contracts/act",e);
    _toast("⚠ "+(e&&e.message?e.message:"تعذّر الإجراء"),"warn");
  });
}
function doCancel(){
  Promise.resolve(_confirm({ title:"إلغاء الطلب", msg:"سيُغلق الطلب نهائياً. متابعة؟" })).then(function(ok){
    if(!ok) return;
    var reason=(window.prompt("سبب الإلغاء:")||"").trim();
    return cancelRequest(_rOpen, reason).then(function(){ paintReqs(); _toast("✅ أُلغي الطلب","success"); });
  }).catch(function(e){ _toast("⚠ "+(e&&e.message?e.message:"تعذّر الإلغاء"),"warn"); });
}

/* سدادُ أمر الدفع — الإيصالُ إلزاميّ، وفشلُ رفعه **لا يُسجّل سداداً بلا إثبات**. */
function openPay(){
  var r=requestById(_rOpen); if(!r) return;
  var el=document.getElementById("page-"+PAGE_REQS); if(!el) return;
  var box=document.createElement("div");
  box.className="card ct-sec"; box.id="ct-pay-box";
  box.innerHTML='<div class="ct-sec-h">'+_icn("banknote","ic-sm")+' تسجيل السداد</div>'+
    '<div class="ct-form-row">'+
      field("المبلغ المسدَّد", '<input class="form-input num" id="ct-pay-amt" type="number" step="any" value="'+_esc(r.value)+'">')+
      field("مرجع التحويل", '<input class="form-input" id="ct-pay-ref" placeholder="رقم العملية">')+
    '</div>'+
    '<div class="ct-form-row">'+
      field("إيصال السداد * (صورة أو PDF)", '<input type="file" class="form-input ct-file" id="ct-pay-file" accept="image/*,application/pdf">')+
      '<div></div>'+
    '</div>'+
    '<div class="ct-save-bar" style="position:static">'+
      '<button class="btn btn-ghost btn-sm" onclick="contracts.closePay()">إلغاء</button>'+
      '<button class="btn btn-success btn-sm" id="ct-pay-btn" onclick="contracts.doPay()">'+_icn("save","ic-sm")+' تسجيل السداد</button>'+
    '</div>';
  var old=document.getElementById("ct-pay-box"); if(old) old.remove();
  el.insertBefore(box, el.children[2] || null);
  box.scrollIntoView({behavior:"smooth", block:"center"});
}
function closePay(){ var b=document.getElementById("ct-pay-box"); if(b) b.remove(); }
function doPay(){
  var r=requestById(_rOpen); if(!r) return;
  var f=(document.getElementById("ct-pay-file")||{}).files;
  if(!f || !f[0]){ _toast("⚠ إيصال السداد إلزامي","warn"); return; }
  var amt=Number((document.getElementById("ct-pay-amt")||{}).value)||0;
  var ref=String((document.getElementById("ct-pay-ref")||{}).value||"").trim();
  var btn=document.getElementById("ct-pay-btn"); if(btn){ btn.disabled=true; btn.textContent="جارٍ الرفع…"; }
  uploadVendorDoc(r.id, f[0], "receipt").then(function(att){
    if(!att || !att.url) throw new Error("تعذّر رفع الإيصال");
    return payRequest(r.id, { amount:amt, ref:ref, receiptUrl:att.url });
  }).then(function(){
    closePay(); paintReqs(); _toast("✅ سُجِّل السداد وأُغلق الطلب","success");
  }).catch(function(e){
    console.warn("contracts/doPay",e);
    if(btn){ btn.disabled=false; btn.innerHTML=_icn("save","ic-sm")+" تسجيل السداد"; }
    _toast("⚠ "+(e&&e.message?e.message:"تعذّر تسجيل السداد")+" — لم يُسجَّل سدادٌ بلا إيصال","warn");
  });
}

/* ════════════════════════════════════════════════════════════════════
   ٧-ج) العقود — الواجهة  [المرحلة ٣]
   ════════════════════════════════════════════════════════════════════ */
var _cFilter = { q:"", status:"" };
var _cOpen   = null;
var _cTab    = "overview";

var _CTR_RAIL = {
  ctr_pending_signature:"var(--warn)",
  ctr_active:"var(--accent)", ctr_suspended:"var(--warn)", ctr_completed:"var(--info)",
  ctr_closed:"var(--muted)", ctr_terminated:"var(--danger)"
};
var _CTR_BADGE = {
  ctr_pending_signature:{cls:"b-po-approval",icon:"edit"},
  ctr_active:{cls:"b-po-closed",icon:"checkCircle"}, ctr_suspended:{cls:"b-po-approval",icon:"alertTriangle"},
  ctr_completed:{cls:"b-po-approval",icon:"hourglass"}, ctr_closed:{cls:"b-po-cancelled",icon:"lock"},
  ctr_terminated:{cls:"b-po-rejected",icon:"ban"}
};
function ctrBadge(s){
  var m=_CTR_BADGE[s]||{cls:"",icon:"alertCircle"};
  return '<span class="badge '+m.cls+'">'+_icn(m.icon,"ic-sm")+' '+_esc(CTR_STATUS[s]||s)+'</span>';
}

function renderCtrs(){
  ensurePages();
  var el=document.getElementById("page-"+PAGE_CTRS); if(!el) return;
  if(!canView()){ el.innerHTML='<div class="card" style="text-align:center;padding:34px 18px"><div style="color:var(--muted);font-size:13px">'+_icn("lock")+' هذا القسم غير متاح لدورك.</div></div>'; return; }
  startSync(); startReqSync(); startCtrSync(); startExtSync(); startChgSync();
  paintCtrs();
}
function paintCtrs(){
  var el=document.getElementById("page-"+PAGE_CTRS); if(!el) return;
  el.innerHTML = _cOpen ? ctrCardHTML(_cOpen) : ctrListHTML();
}

function ctrListHTML(){
  var all=_ctrs.slice(), q=normName(_cFilter.q);
  var list=all.filter(function(c){
    if(_cFilter.status && c.status!==_cFilter.status) return false;
    if(q){
      var hay=normName(c.id)+" "+normName(c.vendorName)+" "+normName(c.title)+" "+normName(_projName(c));
      if(hay.indexOf(q)===-1) return false;
    }
    return true;
  });
  var live=all.filter(function(c){ return c.status==="ctr_active"; });
  var liveVal=live.reduce(function(s,c){ return s+contractValue(c); },0);
  var susp=all.filter(function(c){ return c.status==="ctr_suspended"; }).length;

  var head=headHTML("العقود","الالتزاماتُ النافذة — قيمتُها ومدّتُها ومستخلصاتُها.","", "briefcase");
  var strip='<div class="ct-strip">'+
    '<div class="ct-stat"><span class="l">عقودٌ سارية</span><span class="v">'+live.length+'</span></div>'+
    '<div class="ct-stat"><span class="l">قيمتُها (ر.س)</span><span class="v">'+money0(liveVal)+'</span></div>'+
    '<div class="ct-stat'+(susp?' warn':'')+'"><span class="l">موقوفة</span><span class="v">'+susp+'</span></div>'+
    '<div class="ct-stat"><span class="l">الإجمالي</span><span class="v">'+all.length+'</span></div>'+
  '</div>';

  var filters='<div class="ct-filters">'+
    '<input class="form-input ct-search" id="ct-c-q" placeholder="ابحث برقم العقد أو الطرف أو المشروع" value="'+_esc(_cFilter.q)+'" oninput="contracts.filterCtrs(\'q\',this.value)">'+
    '<select class="form-input" onchange="contracts.filterCtrs(\'status\',this.value)">'+
      '<option value="">كل الحالات</option>'+
      Object.keys(CTR_STATUS).map(function(k){ return '<option value="'+k+'"'+(_cFilter.status===k?' selected':'')+'>'+_esc(CTR_STATUS[k])+'</option>'; }).join("")+
    '</select><div></div>'+
  '</div>';

  var body;
  if(_cError){
    body='<div class="card" style="text-align:center;padding:30px 18px"><div style="color:var(--danger);font-size:13px;font-weight:700">'+_icn("alertTriangle")+' '+_esc(_cError)+'</div></div>';
  } else if(!_cLoaded){
    body='<div class="card" style="text-align:center;padding:30px 18px;color:var(--muted);font-size:13px">جارٍ التحميل…</div>';
  } else if(!all.length){
    body='<div class="card ct-empty">'+
      '<div class="ct-empty-ic">'+_svg("briefcase")+'</div>'+
      '<div class="ct-empty-t">لا عقود بعد</div>'+
      '<div class="ct-empty-s">العقدُ يُولَد من طلبِ تعاقدٍ معتمَد — اعتمِد طلباً ثم اضغط «إنشاء العقد» من بطاقته.</div>'+
      '<button class="btn btn-ghost btn-sm" style="margin-top:14px" onclick="showPage(\'contract-requests\')">'+_icn("fileText","ic-sm")+' طلبات التعاقد</button>'+
    '</div>';
  } else if(!list.length){
    body='<div class="card" style="text-align:center;padding:26px 18px;color:var(--muted);font-size:13px">لا نتائج تطابق البحث.</div>';
  } else {
    body='<div class="ct-grid">'+list.map(ctrTileHTML).join("")+'</div>';
  }
  return head+strip+filters+body;
}

function ctrTileHTML(c){
  var v=contractValue(c);
  return '<div class="ct-tile" style="--rail:'+(_CTR_RAIL[c.status]||"var(--muted)")+'" onclick="contracts.openCtr(\''+_jq(c.id)+'\')">'+
    '<div class="ct-tile-top">'+
      '<div class="ct-tile-name">'+_esc(c.title||c.id)+'</div>'+ctrBadge(c.status)+
    '</div>'+
    '<div class="ct-tile-kind"><span class="num">'+_esc(c.id)+'</span>'+
      ' <span class="ct-dot">·</span> '+_esc(_projName(c))+
      (c.isCustomProject?' <span class="ct-doc s-none">يدويّ</span>':'')+'</div>'+
    '<div class="ct-tile-foot">'+
      '<div class="ct-money"><span class="num">'+money(v)+'</span> <small>ر.س</small></div>'+
      '<div class="ct-tile-who">'+_esc(c.vendorName||"—")+'</div>'+
    '</div>'+
  '</div>';
}

function ctrCardHTML(id){
  var c=contractById(id);
  if(!c) return headHTML("العقود","","", "briefcase")+'<div class="card">تعذّر العثور على العقد.</div>';
  var role=_role();
  var back='<button class="btn btn-ghost btn-sm ct-back" onclick="contracts.backToCtrs()">'+_icn("rotateCcw")+' كل العقود</button>';
  var acts=ctrActionsFor(c.status, role);
  var tools='<button class="btn btn-ghost btn-sm" onclick="contracts.printCtr()">'+_icn("printer","ic-sm")+' طباعة العقد</button> ';
  if(c.status==="ctr_pending_signature" && ctrCanTransit("sign","ctr_pending_signature",role)){
    tools+='<button class="btn btn-primary btn-sm" onclick="contracts.openSign()">'+_icn("save","ic-sm")+' تسجيل التوقيع</button> ';
  }
  tools+=acts.filter(function(a){ return a!=="sign"; }).map(function(a){
    var t=CTR_TRANSITIONS[a];
    var cls = (a==="terminate") ? "btn-ghost" : (a==="resume"||a==="close" ? "btn-success" : "btn-ghost");
    return '<button class="btn '+cls+' btn-sm" onclick="contracts.transit(\''+a+'\')">'+_esc(t.lbl)+'</button>';
  }).join(" ");

  var tabs='<div class="ct-tabs">'+
    [["overview","نظرة عامة","clipboardList"],["lines","بنود الأعمال","layers"],
     ["clauses","شروط العقد","fileText"],["changes","أوامر التغيير","repeat"],
     ["extracts","المستخلصات","banknote"],["log","السجل","scrollText"]]
    .map(function(t){
      return '<button class="ct-tab'+(_cTab===t[0]?" on":"")+'" onclick="contracts.ctrTab(\''+t[0]+'\')">'+_icn(t[2],"ic-sm")+' '+t[1]+'</button>';
    }).join("")+'</div>';

  var signNote = c.status==="ctr_pending_signature"
    ? '<div class="ct-note warn">'+_icn("alertTriangle","ic-sm")+' العقد <b>لم يسرِ بعد</b> — اطبعه ووقّعه مع الطرف، ثم سجّل التوقيع برفع النسخة الموقّعة. ولا تُقبل مستخلصاتٌ قبل ذلك.</div>'
    : "";
  var signed = (Array.isArray(c.signedDocs)?c.signedDocs:[]);
  var signedNote = signed.length
    ? '<div class="ct-note">'+_icn("checkCircle","ic-sm")+' وُقِّع في '+_esc(String(c.signedAt||"").slice(0,10))+' · '+_esc(c.signedBy||"")+
      ' · '+signed.map(function(a){ return '<a class="ct-link" href="'+_esc(a.url)+'" target="_blank" rel="noopener">'+_icn("paperclip","ic-sm")+' '+_esc(a.name||"النسخة الموقّعة")+'</a>'; }).join(" ")+'</div>'
    : "";
  return back +
    headHTML(c.title||c.id, ctrBadge(c.status)+' <span class="ct-id num">'+_esc(c.id)+'</span>', tools, "briefcase") +
    signNote + signedNote + tabs + ctrTabBody(c);
}

function ctrTabBody(c){
  if(_cTab==="lines")    return ctrLinesHTML(c);
  if(_cTab==="clauses")  return ctrClausesHTML(c);
  if(_cTab==="changes")  return ctrChangesHTML(c);
  if(_cTab==="extracts") return ctrExtractsHTML(c);
  if(_cTab==="log")      return ctrLogHTML(c);
  return ctrOverviewHTML(c);
}

function ctrOverviewHTML(c){
  var v=contractValue(c), t=linesTotal(c.lines||[], c.vatMode);
  var adv=advanceAmountOf(c);
  var ret=r2(v * (Number((c.retention||{}).pct)||0) / 100);
  var req=requestById(c.requestId);
  var link = c.requestId
    ? '<button class="btn btn-ghost btn-sm" onclick="contracts.openReqFromCtr(\''+_jq(c.requestId)+'\')">'+_icn("fileText","ic-sm")+' الطلب '+_esc(c.requestId)+(req?'':' (غير محمَّل)')+'</button>'
    : '<span style="color:var(--muted);font-size:12px">—</span>';

  var budgetCell = c.budgetCategoryKey
    ? _esc(catName(c.budgetCategoryKey))
    : '<span style="color:var(--muted)">بلا ربط — اختياريّ</span>';

  /* عقدٌ عليه أوامرُ تغييرٍ مطبَّقةٌ يعرض **المعادلة** لا الرقمَ الحاليَّ وحدَه:
     مَن يقرأ «١١٥,٠٠٠» بلا تفسيرٍ يظنّه رقمَ التوقيع، وهو ليس كذلك. */
  var ch = contractChangeTotals(c);
  var chNote = ch.count
    ? '<div class="ct-note">'+_icn("repeat","ic-sm")+' القيمةُ الحالية = الأصليّ '+money(ch.base)+
      (ch.added?' + زيادات '+money(ch.added):'')+(ch.deducted?' − خفوضات '+money(Math.abs(ch.deducted)):'')+
      ' = <b>'+money(ch.effective)+'</b> ر.س — بـ'+money0(ch.count)+' أمرِ تغييرٍ معتمَد'+
      (ch.daysAdded?' وتمديدٍ '+money0(ch.daysAdded)+' يوماً':'')+'</div>'
    : "";

  return chNote+'<div class="card ct-sec">'+
    '<div class="ct-money-row">'+
      '<div class="ct-tl big"><span class="l">قيمة العقد النافذة</span><span class="v num">'+money(v)+'</span></div>'+
      '<div class="ct-tl"><span class="l">الأساس</span><span class="v num">'+money(t.base)+'</span></div>'+
      '<div class="ct-tl"><span class="l">ض.ق.م</span><span class="v num">'+money(t.vat)+'</span></div>'+
      '<div class="ct-tl"><span class="l">دفعة مقدمة</span><span class="v num">'+money(adv)+'</span></div>'+
      '<div class="ct-tl"><span class="l">محتجز الضمان</span><span class="v num">'+money(ret)+'</span></div>'+
    '</div>'+
  '</div>'+
  '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("clipboardList","ic-sm")+' بيانات العقد</div>'+
    '<div class="ct-info">'+
      infoCell("الطرف", _esc(c.vendorName||"—"))+
      infoCell("المشروع", _esc(_projName(c))+(c.isCustomProject?' <span class="ct-doc s-none">يدويّ</span>':""))+
      infoCell("بند الموازنة", budgetCell)+
      infoCell("وضع الضريبة", _esc((VAT_MODES[normVatMode(c.vatMode)]||{}).short||"—"))+
      infoCell("تاريخ البدء", _esc(c.startDate||"—"))+
      infoCell("مدة التنفيذ", c.durationDays?(money0(c.durationDays)+" يوماً"):"—")+
      infoCell("مدة الضمان", ((c.warranty||{}).months||0)+" شهراً")+
      infoCell("الطلب المصدر", link)+
    '</div>'+
    (c.scope?'<div class="ct-note" style="margin-top:12px">'+_esc(c.scope)+'</div>':'')+
  '</div>'+
  '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("shield","ic-sm")+' الشروط التجارية</div>'+
    '<div class="ct-info">'+
      infoCell("الدفعة المقدمة", ((c.advance||{}).pct||0)+"٪ — تُستردّ "+((c.advance||{}).recoveryPct||0)+"٪ من كل مستخلص")+
      infoCell("محتجز الضمان", ((c.retention||{}).pct||0)+"٪ — يُفرَج "+(((c.retention||{}).releaseOn)==="warranty_end"?"بعد انتهاء الضمان":"عند الاستلام الابتدائي"))+
      infoCell("غرامة التأخير", ((c.penalty||{}).perDayPct||0)+"٪ يومياً — سقف "+((c.penalty||{}).capPct||0)+"٪")+
      infoCell("المُفرَج من المحتجز", money((c.retention||{}).released||0)+" ر.س")+
    '</div>'+
  '</div>';
}

function ctrLinesHTML(c){
  var rows=(c.lines||[]).map(function(l){
    var lt=lineTotal(l.qty,l.unitPrice,c.vatMode);
    return '<tr><td>'+_esc(l.desc||"—")+(l.boqLineId?'':' <span class="ct-doc s-soon">خارج المقايسة</span>')+'</td>'+
      '<td>'+_esc(l.unit||"")+'</td><td class="num">'+money0(contractLineQty(c,l.id))+'</td>'+
      '<td class="num">'+money(l.unitPrice)+'</td><td class="num">'+money(lt.total)+'</td></tr>';
  }).join("") || '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:14px">—</td></tr>';
  var t=linesTotal(c.lines||[], c.vatMode);
  return '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("layers","ic-sm")+' بنود العقد'+
      '<span class="ct-sec-lock">الكميةُ تشمل أوامرَ التغيير المعتمدة</span></div>'+
    '<div class="ct-table-wrap"><table class="ct-table"><thead><tr>'+
      '<th>الوصف</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>'+
      '<tbody>'+rows+'</tbody></table></div>'+
    '<div class="ct-total">'+totalsHTML(t, c.vatMode)+'</div>'+
  '</div>';
}

var _extDraft = null;   // مسوّدةُ المستخلص الجاري إعدادُه
var _extOpen  = null;   // معرّفُ المستخلص المفتوح للعرض

var _EXT_BADGE = {
  ext_pending_pm:{cls:"b-po-approval",icon:"send"}, ext_pending_ceo:{cls:"b-po-ceo",icon:"building2"},
  ext_pending_finance:{cls:"b-po-approval",icon:"banknote"}, ext_paid:{cls:"b-po-closed",icon:"lock"},
  ext_pm_rejected:{cls:"b-po-rejected",icon:"xCircle"}, ext_returned:{cls:"b-po-rejected",icon:"rotateCcw"},
  ext_cancelled:{cls:"b-po-cancelled",icon:"ban"}, ext_draft:{cls:"",icon:"edit"}
};
function extBadge(s){
  var m=_EXT_BADGE[s]||{cls:"",icon:"alertCircle"};
  return '<span class="badge '+m.cls+'">'+_icn(m.icon,"ic-sm")+' '+_esc(EXT_STATUS[s]||s)+'</span>';
}

function ctrExtractsHTML(c){
  if(_extDraft) return extFormHTML(c);
  if(_extOpen)  return extCardHTML(c, _extOpen);

  var list = extractsFor(c.id);
  var open = openExtractOf(_exts, c.id);
  var canMake = ["project_manager","admin"].indexOf(_role())!==-1 && c.status==="ctr_active" && !open;

  var paid = list.filter(function(e){ return e.status==="ext_paid"; });
  var paidSum = paid.reduce(function(s,e){ return s + (Number((e.payment||{}).amount)||0); },0);
  var gross = prevGrossOf(_exts, c, null);
  var val = contractValue(c);
  var pct = val>0 ? Math.min(100, Math.round(gross/vatSplit(val, c.vatMode).base*100)) : 0;

  var head='<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("banknote","ic-sm")+' المستخلصات'+
      (canMake?'<button class="btn btn-primary btn-sm" style="margin-inline-start:auto" onclick="contracts.newExtract()">'+_icn("plus","ic-sm")+' مستخلص جديد</button>':'')+
    '</div>'+
    '<div class="ct-money-row">'+
      '<div class="ct-tl big"><span class="l">المنجَز التراكميّ</span><span class="v num">'+money(gross)+'</span></div>'+
      '<div class="ct-tl"><span class="l">نسبة الإنجاز</span><span class="v num">'+pct+'%</span></div>'+
      '<div class="ct-tl"><span class="l">المسدَّد صافياً</span><span class="v num">'+money(paidSum)+'</span></div>'+
      '<div class="ct-tl"><span class="l">عدد المستخلصات</span><span class="v num">'+list.length+'</span></div>'+
    '</div>'+
    '<div class="ct-bar"><span style="width:'+pct+'%"></span></div>'+
    (open?'<div class="ct-note warn" style="margin-top:12px">'+_icn("alertCircle","ic-sm")+' مستخلصٌ مفتوحٌ ('+_esc(open.id)+') — لا يُنشأ جديدٌ قبل إغلاقه.</div>':'')+
    (c.status!=="ctr_active"?'<div class="ct-note" style="margin-top:12px">'+_icn("lock","ic-sm")+' العقد ليس سارياً — لا مستخلصاتٍ جديدة.</div>':'')+
  '</div>';

  var rows = list.length ? list.map(function(e){
    var calc=extCalc(e,c);
    var owner=extGateOwner(e.status);
    return '<tr class="fa-click" style="cursor:pointer" onclick="contracts.openExt(\''+_jq(e.id)+'\')">'+
      '<td><span class="num">'+_esc(e.id)+'</span>'+(e.isFinal?' <span class="ct-doc s-ok">ختاميّ</span>':'')+'</td>'+
      '<td>'+_esc(e.period||"—")+'</td>'+
      '<td class="num">'+money(calc.period)+'</td>'+
      '<td class="num">'+money(calc.deductions)+'</td>'+
      '<td class="num"><b>'+money(calc.net)+'</b></td>'+
      '<td>'+extBadge(e.status)+(owner&&!extIsFinal(e.status)?' <span style="font-size:10px;color:var(--muted)">عند '+_esc(owner.lbl)+'</span>':'')+'</td>'+
    '</tr>';
  }).join("") : '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:18px">لا مستخلصات بعد.</td></tr>';

  return head+'<div class="card ct-sec">'+
    '<div class="ct-table-wrap"><table class="ct-table"><thead><tr>'+
      '<th>الرقم</th><th>الفترة</th><th>أعمال الفترة</th><th>الخصومات</th><th>الصافي</th><th>الحالة</th>'+
    '</tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}

/* ── سُلَّمُ الخصومات: العنصرُ المميّز — شكلُ الحساب نفسِه، لا زينةٌ فوقه ── */
function ladderHTML(calc, c){
  function rung(label, val, sign, strong){
    if(!strong && !val) return "";
    return '<div class="ct-rung'+(strong?" strong":"")+(sign<0?" minus":"")+'">'+
      '<span class="rl">'+(sign<0?'−':(sign>0?'+':''))+' '+_esc(label)+'</span>'+
      '<span class="rv num">'+money(val)+'</span></div>';
  }
  var vatLbl = calc.mode==="none" ? "ض.ق.م (بلا ضريبة)" : "ض.ق.م";
  return '<div class="ct-ladder">'+
    rung("المنجَز التراكميّ", calc.gross, 0, true)+
    rung("المستخلَص سابقاً", calc.prevGross, -1, true)+
    '<div class="ct-rung sum"><span class="rl">أعمال الفترة</span><span class="rv num">'+money(calc.period)+'</span></div>'+
    rung(vatLbl, calc.vat, 1, calc.mode!=="none")+
    rung("محتجز الضمان", calc.retention, -1, false)+
    rung("استرداد الدفعة المقدمة", calc.advanceRecovery, -1, false)+
    rung("غرامة التأخير", calc.penalty, -1, false)+
    rung("مواد مصروفة من مستودعنا", calc.materials, -1, false)+
    rung("خصم عدم مطابقة / جودة", calc.nonConformity, -1, false)+
    '<div class="ct-rung net"><span class="rl">صافي المستحق</span><span class="rv num">'+money(calc.net)+'</span></div>'+
  '</div>';
}

function extFormHTML(c){
  var d=_extDraft;
  var floor=prevCumByLine(_exts, c, null);
  var ctx={ prevGross:prevGrossOf(_exts,c,null), materialsIssued:d.materialsIssued,
            penaltyAmount:d.penaltyAmount, ncDeduction:d.ncDeduction };
  var calc=extNet(d, c, ctx);
  var g=extCumGuard(d, c, _exts);
  var late=lateDaysOf(c, _today());

  var rows=(d.lines||[]).map(function(l,i){
    var max=contractLineQty(c,l.lineId), was=Number(floor[l.lineId])||0;
    var bad=(Number(l.cumQty)||0)>max+1e-9 || (Number(l.cumQty)||0)<was-1e-9;
    var pct=max>0?Math.round((Number(l.cumQty)||0)/max*100):0;
    return '<tr'+(bad?' class="ct-bad"':'')+'>'+
      '<td>'+_esc(l.desc||"—")+'</td>'+
      '<td class="num">'+money0(max)+' '+_esc(l.unit||"")+'</td>'+
      '<td class="num">'+money0(was)+'</td>'+
      '<td><input class="form-input num" data-ef="cumQty" data-i="'+i+'" type="number" step="any" value="'+_esc(l.cumQty)+'" style="min-width:90px" oninput="contracts.extRecalc()"></td>'+
      '<td class="num">'+pct+'%</td>'+
      '<td class="num">'+money(r2(vatSplit(l.unitPrice,c.vatMode).base*(Number(l.cumQty)||0)))+'</td>'+
    '</tr>';
  }).join("");

  var warn = '<div id="ct-e-warn">'+(g.ok ? "" : '<div class="ct-note crit">'+_icn("alertTriangle","ic-sm")+' '+_esc(_guardMsg(g))+'</div>')+'</div>';
  var lateNote = late ? '<div class="ct-note warn">'+_icn("timer","ic-sm")+' تأخّرٌ '+late+' يوماً عن مدة العقد — غرامةٌ مقترَحة '+money(suggestedPenalty(c,late))+' ر.س. '+
    '<button class="btn btn-ghost btn-sm" style="margin-inline-start:auto" onclick="contracts.applyPenalty()">تطبيق المقترَح</button></div>' : "";

  return '<button class="btn btn-ghost btn-sm ct-back" onclick="contracts.cancelExtract()">'+_icn("rotateCcw")+' إلغاء</button>'+
  '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("banknote","ic-sm")+' مستخلص جديد — '+_esc(c.id)+
      '<span class="ct-sec-lock">أدخِل المنفَّذ <b>تراكمياً منذ بداية العقد</b> لا كميةَ الفترة</span></div>'+
    '<div class="ct-form-row">'+
      field("الفترة", '<input class="form-input" id="ct-e-period" value="'+_esc(d.period||"")+'" placeholder="مثال: أغسطس 2026">')+
      field("مستخلصٌ ختاميّ؟", '<select class="form-input" id="ct-e-final">'+
        '<option value=""'+(!d.isFinal?' selected':'')+'>لا — مستخلصٌ دوريّ</option>'+
        '<option value="1"'+(d.isFinal?' selected':'')+'>نعم — يُنهي العقد فنّياً</option>'+
      '</select>')+
    '</div>'+
    '<div class="ct-table-wrap"><table class="ct-table" id="ct-e-lines"><thead><tr>'+
      '<th>البند</th><th>كمية العقد</th><th>سبق اعتماده</th><th>المنفَّذ تراكمياً</th><th>%</th><th>القيمة</th>'+
    '</tr></thead><tbody>'+rows+'</tbody></table></div>'+
    warn+lateNote+
  '</div>'+
  '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("trendingDown","ic-sm")+' خصوماتٌ تُدخَل يدوياً</div>'+
    '<div class="ct-form-row">'+
      field("غرامة التأخير (ر.س)", '<input class="form-input num" id="ct-e-pen" type="number" step="any" value="'+_esc(d.penaltyAmount||0)+'" oninput="contracts.extRecalc()">')+
      field("مواد مصروفة له من مستودعنا (ر.س)", '<input class="form-input num" id="ct-e-mat" type="number" step="any" value="'+_esc(d.materialsIssued||0)+'" oninput="contracts.extRecalc()">')+
    '</div>'+
    '<div class="ct-form-row">'+
      field("خصم عدم مطابقة / جودة (ر.س)", '<input class="form-input num" id="ct-e-nc" type="number" step="any" value="'+_esc(d.ncDeduction||0)+'" oninput="contracts.extRecalc()">')+
      '<div></div>'+
    '</div>'+
    '<div class="ct-note">'+_icn("alertCircle","ic-sm")+' قيمةُ المواد تُدخَل يدوياً: أوامرُ الصرف تسجّل <b>الكميات بلا تكلفة</b>، فلا يملك النظامُ تسعيرةَ مخزونٍ يشتقّ منها المبلغ.</div>'+
  '</div>'+
  '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("pieChart","ic-sm")+' سُلَّم الحساب</div>'+
    '<div id="ct-e-ladder">'+ladderHTML(calc,c)+'</div>'+
  '</div>'+
  '<div class="ct-save-bar">'+
    '<button class="btn btn-ghost btn-sm" onclick="contracts.cancelExtract()">إلغاء</button>'+
    '<button class="btn btn-success btn-sm" id="ct-e-send"'+(g.ok?'':' disabled')+' onclick="contracts.submitExtract()">'+_icn("send","ic-sm")+' إرسال للاعتماد</button>'+
  '</div>';
}

function extCardHTML(c, id){
  var e=extractById(id);
  if(!e) return '<div class="card">تعذّر العثور على المستخلص.</div>';
  var calc = e.settled || extCalc(e,c);
  var owner=extGateOwner(e.status), mine=extCanAct(e.status,_role());
  var tools="";
  if(mine && e.status==="ext_pending_finance"){
    tools='<button class="btn btn-success btn-sm" onclick="contracts.openExtPay()">'+_icn("banknote","ic-sm")+' تسجيل السداد</button>';
  } else if(mine){
    tools='<button class="btn btn-success btn-sm" onclick="contracts.extAct(\'approve\')">'+_icn("checkCircle","ic-sm")+' اعتماد</button> '+
          '<button class="btn btn-ghost btn-sm" onclick="contracts.extAct(\'reject\')">'+_icn("xCircle","ic-sm")+' رفض / إعادة</button>';
  }
  var lineRows=(e.lines||[]).map(function(l){
    return '<tr><td>'+_esc(l.desc||"—")+'</td><td class="num">'+money0(contractLineQty(c,l.lineId))+'</td>'+
      '<td class="num">'+money0(l.cumQty)+'</td><td class="num">'+money(l.unitPrice)+'</td></tr>';
  }).join("") || '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:14px">—</td></tr>';
  var tl=(e.timeline||[]).map(function(x){
    return '<div class="ct-tl-row"><span class="d"></span><div><div class="t">'+_esc(x.event)+'</div>'+
      '<div class="m">'+_esc(x.by||"")+' · '+_esc(String(x.at||"").slice(0,16).replace("T"," "))+(x.note?' — '+_esc(x.note):'')+'</div></div></div>';
  }).join("") || '<div style="color:var(--muted);font-size:12px">—</div>';
  var pay = e.payment ? '<div class="ct-note">'+_icn("banknote","ic-sm")+' سُدِّد '+money(e.payment.amount)+' ر.س · '+_esc(e.payment.by||"")+
    (e.payment.ref?(' — '+_esc(e.payment.ref)):'')+
    (e.payment.receiptUrl?' · <a class="ct-link" href="'+_esc(e.payment.receiptUrl)+'" target="_blank" rel="noopener">'+_icn("paperclip","ic-sm")+' الإيصال</a>':'')+'</div>' : "";

  return '<button class="btn btn-ghost btn-sm ct-back" onclick="contracts.backToExts()">'+_icn("rotateCcw")+' كل المستخلصات</button>'+
  '<div class="ct-head"><div><h2 class="ct-title">'+_icn("banknote")+' '+_esc(e.id)+(e.isFinal?' <span class="ct-doc s-ok">ختاميّ</span>':'')+'</h2>'+
    '<div class="ct-sub">'+extBadge(e.status)+(owner&&!extIsFinal(e.status)?' <span class="ct-id">بانتظار '+_esc(owner.lbl)+'</span>':'')+' <span class="ct-id">'+_esc(e.period||"")+'</span></div></div>'+
    '<div class="ct-actions">'+tools+'</div></div>'+
  pay+
  '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("pieChart","ic-sm")+' سُلَّم الحساب'+
    (e.settled?'<span class="ct-sec-lock">لقطةٌ محفوظةٌ وقت السداد</span>':'')+'</div>'+ladderHTML(calc,c)+'</div>'+
  '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("layers","ic-sm")+' البنود المنفَّذة</div>'+
    '<div class="ct-table-wrap"><table class="ct-table"><thead><tr><th>البند</th><th>كمية العقد</th><th>المنفَّذ تراكمياً</th><th>سعر الوحدة</th></tr></thead>'+
    '<tbody>'+lineRows+'</tbody></table></div></div>'+
  '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("scrollText","ic-sm")+' السجل</div><div class="ct-timeline">'+tl+'</div></div>';
}

function ctrLogHTML(c){
  var tl=(c.timeline||[]).map(function(e){
    return '<div class="ct-tl-row"><span class="d"></span><div><div class="t">'+_esc(e.event)+'</div>'+
      '<div class="m">'+_esc(e.by||"")+' · '+_esc(String(e.at||"").slice(0,16).replace("T"," "))+
      (e.note?' — '+_esc(e.note):'')+'</div></div></div>';
  }).join("") || '<div style="color:var(--muted);font-size:12px">—</div>';
  return '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("scrollText","ic-sm")+' السجل الزمني</div>'+
    '<div class="ct-timeline">'+tl+'</div></div>';
}

/* ════════════ تبويبُ أوامر التغيير  [المرحلة ٧] ════════════ */
var _chgDraft = null;   // مسوّدةُ أمر التغيير الجاري إعدادُه
var _chgOpen  = null;   // أمرُ التغيير المفتوح (null = القائمة)

function ctrChangesHTML(c){
  if(_chgDraft) return chgFormHTML(c);
  if(_chgOpen)  return chgCardHTML(c, _chgOpen);

  var list = changesFor(c.id);
  var open = openChangeOf(_chgs, c.id);
  var canMake = ["project_manager","admin"].indexOf(_role())!==-1 && chgContractEligible(c) && !open;
  var t = contractChangeTotals(c);

  var head='<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("repeat","ic-sm")+' أوامر التغيير'+
      (canMake?'<button class="btn btn-primary btn-sm" style="margin-inline-start:auto" onclick="contracts.newChange()">'+_icn("plus","ic-sm")+' أمر تغيير جديد</button>':'')+
    '</div>'+
    // **المعادلةُ ظاهرةٌ لا مخفيّة**: القارئُ يرى من أين جاء الرقمُ الحاليّ
    '<div class="ct-money-row">'+
      '<div class="ct-tl"><span class="l">قيمة العقد الأصلية</span><span class="v num">'+money(t.base)+'</span></div>'+
      '<div class="ct-tl"><span class="l">زيادات معتمَدة</span><span class="v num">'+(t.added?"+"+money(t.added):"—")+'</span></div>'+
      '<div class="ct-tl"><span class="l">خفوضات معتمَدة</span><span class="v num">'+(t.deducted?money(t.deducted):"—")+'</span></div>'+
      '<div class="ct-tl big"><span class="l">القيمة الحالية</span><span class="v num">'+money(t.effective)+'</span></div>'+
    '</div>'+
    (t.daysAdded?'<div class="ct-note" style="margin-top:12px">'+_icn("timer","ic-sm")+' مدةُ العقد مُدَّت '+money0(t.daysAdded)+' يوماً بأوامر التغيير — وغرامةُ التأخير تُحتسب على المدة بعد التمديد.</div>':'')+
    (open?'<div class="ct-note warn" style="margin-top:12px">'+_icn("alertCircle","ic-sm")+' أمرُ تغييرٍ مفتوحٌ ('+_esc(open.id)+') — لا يُنشأ ثانٍ قبل إنهائه، وإلّا اعتُمد أمران على قيمتين مختلفتين.</div>':'')+
    (!chgContractEligible(c)?'<div class="ct-note" style="margin-top:12px">'+_icn("lock","ic-sm")+' أمرُ التغيير لا يُنشأ إلا على عقدٍ ساري أو موقوف.</div>':'')+
  '</div>';

  var rows = list.length ? list.map(function(g){
    var owner=chgGateOwner(g.status);
    var amt=Number(g.amount)||0;
    return '<tr class="fa-click" style="cursor:pointer" onclick="contracts.openChg(\''+_jq(g.id)+'\')">'+
      '<td><span class="num">'+_esc(g.id)+'</span></td>'+
      '<td>'+_esc(g.reason||"—")+'</td>'+
      '<td class="num">'+(amt>=0?"+":"")+money(amt)+'</td>'+
      '<td class="num">'+(g.durationDaysDelta?money0(g.durationDaysDelta)+" يوماً":"—")+'</td>'+
      '<td>'+chgBadge(g.status)+(owner&&!chgIsFinal(g.status)?' <span style="font-size:10px;color:var(--muted)">عند '+_esc(owner.lbl)+'</span>':'')+'</td>'+
    '</tr>';
  }).join("") : '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:18px">لا أوامر تغيير.</td></tr>';

  return head+'<div class="card ct-sec">'+
    '<div class="ct-table-wrap"><table class="ct-table"><thead><tr>'+
      '<th>الرقم</th><th>السبب</th><th>أثر القيمة</th><th>تمديد المدة</th><th>الحالة</th>'+
    '</tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}

function chgBadge(st){
  var cls = st==="chg_applied" ? "s-ok" : (st==="chg_rejected"||st==="chg_cancelled" ? "s-none" : (st==="chg_approved" ? "s-ok" : "s-warn"));
  return '<span class="ct-doc '+cls+'">'+_esc(CHG_STATUS[st]||st)+'</span>';
}

/* نموذجُ أمر التغيير — صفٌّ لكلّ بندٍ قائمٍ يُدخَل فيه **فارقُ الكمية** (± )، وبنودٌ
   جديدةٌ تُضاف تحت. والأثرُ يُحسب لحظةَ الكتابة فيرى المُنشئُ ما سيوقّع عليه غيرُه. */
function chgFormHTML(c){
  var d=_chgDraft;
  var done=prevCumByLine(_exts, c, null);
  d.amount = chgAmountOf(d, c.vatMode);
  var eff=chgEffect(c, d), g=chgGuard(d, c, _exts);

  var exist=(c.lines||[]).map(function(ln,i){
    var cur=contractLineQty(c, ln.id);
    var delta=_chgDeltaOf(d, ln.id);
    var executed=Number(done[ln.id])||0;
    var after=r2(cur+delta);
    var bad=delta<0 && after<executed-1e-9;
    return '<tr'+(bad?' class="ct-bad"':'')+'>'+
      '<td>'+_esc(ln.desc||"—")+'</td>'+
      '<td class="num">'+money0(cur)+' '+_esc(ln.unit||"")+'</td>'+
      '<td class="num">'+money0(executed)+'</td>'+
      '<td><input class="form-input num" data-cf="qty" data-line="'+_esc(ln.id)+'" data-price="'+_esc(ln.unitPrice)+'" data-desc="'+_esc(ln.desc||"")+'" data-unit="'+_esc(ln.unit||"")+'" type="number" step="any" value="'+_esc(delta||"")+'" placeholder="0" style="min-width:90px" oninput="contracts.chgRecalc()"></td>'+
      '<td class="num">'+money0(after)+'</td>'+
      '<td class="num">'+money(lineTotal(delta, ln.unitPrice, c.vatMode).total)+'</td>'+
    '</tr>';
  }).join("") || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:14px">لا بنودَ في العقد.</td></tr>';

  var news=(d.newLines||[]).map(function(l,i){
    return '<tr>'+
      '<td><input class="form-input" data-nf="desc" data-i="'+i+'" value="'+_esc(l.desc||"")+'" oninput="contracts.chgRecalc()" placeholder="وصف العمل"></td>'+
      '<td><input class="form-input" data-nf="unit" data-i="'+i+'" value="'+_esc(l.unit||"")+'" oninput="contracts.chgRecalc()" placeholder="م٢"></td>'+
      '<td><input class="form-input num" data-nf="qty" data-i="'+i+'" type="number" step="any" value="'+_esc(l.qty||"")+'" oninput="contracts.chgRecalc()"></td>'+
      '<td><input class="form-input num" data-nf="unitPrice" data-i="'+i+'" type="number" step="any" value="'+_esc(l.unitPrice||"")+'" oninput="contracts.chgRecalc()"></td>'+
      '<td class="num">'+money(lineTotal(l.qty,l.unitPrice,c.vatMode).total)+'</td>'+
      '<td><button class="btn btn-ghost btn-sm" onclick="contracts.chgDelNew('+i+')">'+_icn("trash","ic-sm")+'</button></td>'+
    '</tr>';
  }).join("") || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:14px">لا بنودَ جديدة.</td></tr>';

  var warn='<div id="ct-g-warn">'+(g.ok||g.empty ? "" : '<div class="ct-note crit">'+_icn("alertTriangle","ic-sm")+' '+_esc(_chgGuardMsg(g))+'</div>')+'</div>';

  return '<button class="btn btn-ghost btn-sm ct-back" onclick="contracts.cancelChgDraft()">'+_icn("rotateCcw")+' إلغاء</button>'+
  '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("repeat","ic-sm")+' أمرُ تغييرٍ على '+_esc(c.id)+
      '<span class="ct-sec-lock">أدخِل <b>فارقَ</b> الكمية لا الكميةَ الجديدة — بالسالب للخفض</span></div>'+
    '<div class="ct-table-wrap"><table class="ct-table" id="ct-g-lines"><thead><tr>'+
      '<th>البند</th><th>كمية العقد</th><th>المنفَّذ</th><th>فارق الكمية (±)</th><th>الكمية بعد</th><th>أثر القيمة</th>'+
    '</tr></thead><tbody>'+exist+'</tbody></table></div>'+
  '</div>'+
  '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("plus","ic-sm")+' بنودٌ جديدة'+
      '<button class="btn btn-ghost btn-sm" style="margin-inline-start:auto" onclick="contracts.chgAddNew()">'+_icn("plus","ic-sm")+' إضافة بند</button></div>'+
    '<div class="ct-table-wrap"><table class="ct-table" id="ct-g-new"><thead><tr>'+
      '<th>الوصف</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th><th></th>'+
    '</tr></thead><tbody>'+news+'</tbody></table></div>'+
    '<div class="ct-note">'+_icn("alertCircle","ic-sm")+' وضعُ الضريبة يُورَث من العقد ('+_esc((VAT_MODES[normVatMode(c.vatMode)]||{}).short||"—")+') — عقدٌ بلا ضريبةٍ لا يصير بعضُه خاضعاً لها بأمرِ تغيير.</div>'+
  '</div>'+
  '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("pieChart","ic-sm")+' الأثر على العقد</div>'+
    '<div id="ct-g-eff">'+chgEffectHTML(eff)+'</div>'+
    '<div class="ct-form-row" style="margin-top:12px">'+
      field("تمديد المدة (أيام)", '<input class="form-input num" id="ct-g-days" type="number" step="1" value="'+_esc(d.durationDaysDelta||0)+'" oninput="contracts.chgRecalc()">')+
      field("سبب التغيير <b>(إلزاميّ)</b>", '<input class="form-input" id="ct-g-reason" value="'+_esc(d.reason||"")+'" placeholder="مثال: توسعةُ نطاق الدهان للدور الثاني بطلب المالك" oninput="contracts.chgRecalc()">')+
    '</div>'+
    warn+
  '</div>'+
  '<div class="ct-save-bar">'+
    '<button class="btn btn-ghost btn-sm" onclick="contracts.cancelChgDraft()">إلغاء</button>'+
    '<button class="btn btn-success btn-sm" id="ct-g-send"'+((g.ok&&d.reason)?'':' disabled')+' onclick="contracts.submitChange()">'+_icn("send","ic-sm")+' إرسال للاعتماد</button>'+
  '</div>';
}

function chgEffectHTML(eff){
  var sign = eff.delta>=0 ? "+" : "";
  return '<div class="ct-money-row">'+
    '<div class="ct-tl"><span class="l">القيمة قبل</span><span class="v num">'+money(eff.baseValue)+'</span></div>'+
    '<div class="ct-tl"><span class="l">أثر التغيير</span><span class="v num">'+sign+money(eff.delta)+'</span></div>'+
    '<div class="ct-tl big"><span class="l">القيمة بعد</span><span class="v num">'+money(eff.newValue)+'</span></div>'+
    '<div class="ct-tl"><span class="l">نسبة التغيير</span><span class="v num">'+sign+eff.pct+'%</span></div>'+
    '<div class="ct-tl"><span class="l">المدة بعد</span><span class="v num">'+money0(eff.newDays)+' يوماً</span></div>'+
  '</div>';
}

function _chgDeltaOf(d, lineId){
  var out=0;
  (Array.isArray(d.lines)?d.lines:[]).forEach(function(l){ if(l && l.id===lineId) out += Number(l.qty)||0; });
  return out;
}

/* قراءةُ النموذج من الشاشة — مصدرُ الحقيقة هو الحقول لا الذاكرة (درسُ المستخلص) */
function syncChgDraft(){
  var d=_chgDraft; if(!d) return;
  var lines=[];
  Array.prototype.forEach.call(document.querySelectorAll('#ct-g-lines input[data-cf="qty"]'), function(inp){
    var q=Number(inp.value); if(!isFinite(q) || q===0) return;
    lines.push({ id:inp.getAttribute("data-line"), desc:inp.getAttribute("data-desc")||"",
                 unit:inp.getAttribute("data-unit")||"", qty:q,
                 unitPrice:Number(inp.getAttribute("data-price"))||0 });
  });
  (d.newLines||[]).forEach(function(l,i){
    var q=document.querySelector('#ct-g-new input[data-nf="qty"][data-i="'+i+'"]');
    var p=document.querySelector('#ct-g-new input[data-nf="unitPrice"][data-i="'+i+'"]');
    var de=document.querySelector('#ct-g-new input[data-nf="desc"][data-i="'+i+'"]');
    var un=document.querySelector('#ct-g-new input[data-nf="unit"][data-i="'+i+'"]');
    if(de) l.desc=de.value; if(un) l.unit=un.value;
    if(q) l.qty=Number(q.value)||0; if(p) l.unitPrice=Number(p.value)||0;
    if(l.desc && l.qty) lines.push({ id:l.id, desc:l.desc, unit:l.unit||"", qty:l.qty, unitPrice:l.unitPrice||0 });
  });
  d.lines=lines;
  var days=document.getElementById("ct-g-days"); if(days) d.durationDaysDelta=Number(days.value)||0;
  var rs=document.getElementById("ct-g-reason"); if(rs) d.reason=rs.value.trim();
}

/* إعادةُ الحساب الحيّة — الأثرُ والتحذيرُ وزرُّ الإرسال تتحرّك مع الإدخال، فلا يبقى
   زرٌّ معطَّلٌ بلا سببٍ ظاهرٍ على الشاشة (درسُ المستخلص نفسُه). */
function chgRecalc(){
  var c=contractById(_cOpen); if(!c || !_chgDraft) return;
  syncChgDraft();
  _chgDraft.amount = chgAmountOf(_chgDraft, c.vatMode);
  var eff=chgEffect(c,_chgDraft), g=chgGuard(_chgDraft, c, _exts);
  var e=document.getElementById("ct-g-eff"); if(e) e.innerHTML=chgEffectHTML(eff);
  var w=document.getElementById("ct-g-warn");
  if(w) w.innerHTML = (g.ok||g.empty) ? "" : '<div class="ct-note crit">'+_icn("alertTriangle","ic-sm")+' '+_esc(_chgGuardMsg(g))+'</div>';
  var done=prevCumByLine(_exts, c, null);
  Array.prototype.forEach.call(document.querySelectorAll('#ct-g-lines input[data-cf="qty"]'), function(inp){
    var id=inp.getAttribute("data-line"), delta=Number(inp.value)||0;
    var after=r2(contractLineQty(c,id)+delta), executed=Number(done[id])||0;
    var tr=inp.closest("tr"); if(!tr) return;
    var tds=tr.querySelectorAll("td");
    if(tds[4]) tds[4].textContent=money0(after);
    if(tds[5]) tds[5].textContent=money(lineTotal(delta, Number(inp.getAttribute("data-price"))||0, c.vatMode).total);
    tr.classList.toggle("ct-bad", delta<0 && after<executed-1e-9);
  });
  var btn=document.getElementById("ct-g-send");
  if(btn) btn.disabled = !(g.ok && _chgDraft.reason);
}

function newChange(){
  var c=contractById(_cOpen); if(!c) return;
  if(["project_manager","admin"].indexOf(_role())===-1) return _toast("⚠ أمرُ التغيير لمدير المشروع أو الأدمن","warn");
  if(!chgContractEligible(c)) return _toast("⚠ أمرُ التغيير لا يُنشأ إلا على عقدٍ ساري أو موقوف","warn");
  var open=openChangeOf(_chgs, c.id);
  if(open) return _toast("⚠ يوجد أمرُ تغييرٍ مفتوحٌ ("+open.id+")","warn");
  _chgDraft={ lines:[], newLines:[], durationDaysDelta:0, reason:"", amount:0 };
  _chgOpen=null; paintCtrs();
}
function cancelChgDraft(){ _chgDraft=null; paintCtrs(); }
function chgAddNew(){
  if(!_chgDraft) return; syncChgDraft();
  _chgDraft.newLines=(_chgDraft.newLines||[]).concat([{ id:"NEW-"+Date.now().toString(36).slice(-5).toUpperCase(), desc:"", unit:"", qty:0, unitPrice:0 }]);
  paintCtrs();
}
function chgDelNew(i){
  if(!_chgDraft) return; syncChgDraft();
  _chgDraft.newLines=(_chgDraft.newLines||[]).filter(function(_,k){ return k!==i; });
  paintCtrs();
}
function submitChange(){
  var c=contractById(_cOpen); if(!c || !_chgDraft) return;
  syncChgDraft();
  if(!_chgDraft.reason) return _toast("⚠ سببُ التغيير إلزاميّ","warn");
  var btn=document.getElementById("ct-g-send"); if(btn){ btn.disabled=true; btn.textContent="جارٍ الإرسال…"; }
  createChange(c, _chgDraft).then(function(id){
    _chgDraft=null; _chgOpen=id; paintCtrs(); _toast("✅ أُرسل أمرُ التغيير "+id,"success");
  }).catch(function(e){
    console.warn("contracts/submitChange",e);
    if(btn){ btn.disabled=false; btn.innerHTML=_icn("send","ic-sm")+" إرسال للاعتماد"; }
    _toast("⚠ "+(e&&e.message?e.message:"تعذّر الإرسال"),"warn");
  });
}
function openChg(id){ _chgOpen=id; _chgDraft=null; paintCtrs(); }
function backToChgs(){ _chgOpen=null; paintCtrs(); }

function chgCardHTML(c, id){
  var g=changeById(id);
  if(!g) return '<div class="card">تعذّر العثور على أمر التغيير.</div>';
  var owner=chgGateOwner(g.status), mine=chgCanAct(g.status,_role());
  var eff=chgEffect(c, g);
  var tools="";
  if(mine){
    tools='<button class="btn btn-success btn-sm" onclick="contracts.chgAct(\'approve\')">'+_icn("checkCircle","ic-sm")+' اعتماد</button> '+
          '<button class="btn btn-ghost btn-sm" onclick="contracts.chgAct(\'reject\')">'+_icn("xCircle","ic-sm")+' رفض</button> ';
  }
  if(g.status==="chg_approved" && ["procurement_officer","admin"].indexOf(_role())!==-1){
    tools+='<button class="btn btn-primary btn-sm" onclick="contracts.doApplyChange()">'+_icn("repeat","ic-sm")+' التطبيق على العقد</button> ';
  }
  if(!chgIsFinal(g.status) && (_role()==="admin" || g.createdByUser===_meUser())){
    tools+='<button class="btn btn-ghost btn-sm" onclick="contracts.doCancelChange()">'+_icn("ban","ic-sm")+' إلغاء</button>';
  }
  var rows=(g.lines||[]).map(function(l){
    return '<tr><td>'+_esc(l.desc||"—")+'</td><td>'+_esc(l.unit||"")+'</td>'+
      '<td class="num">'+((Number(l.qty)||0)>=0?"+":"")+money0(l.qty)+'</td>'+
      '<td class="num">'+money(l.unitPrice)+'</td>'+
      '<td class="num">'+money(lineTotal(l.qty,l.unitPrice,c.vatMode).total)+'</td></tr>';
  }).join("") || '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:14px">—</td></tr>';
  var tl=(g.timeline||[]).map(function(x){
    return '<div class="ct-tl-row"><span class="d"></span><div><div class="t">'+_esc(x.event)+'</div>'+
      '<div class="m">'+_esc(x.by||"")+' · '+_esc(String(x.at||"").slice(0,16).replace("T"," "))+(x.note?' — '+_esc(x.note):'')+'</div></div></div>';
  }).join("") || '<div style="color:var(--muted);font-size:12px">—</div>';

  // الأمرُ المطبَّقُ يعرض أثرَه كما وقع، لا كما لو طُبِّق الآن على قيمةٍ صارت أكبر
  var applied = g.status==="chg_applied";
  var effBox = applied
    ? '<div class="ct-note">'+_icn("checkCircle","ic-sm")+' طُبِّق على العقد في '+_esc(String(g.appliedAt||"").slice(0,10))+' · '+_esc(g.appliedBy||"")+
      ' — قيمةُ العقد الحالية '+money(contractValue(c))+' ر.س</div>'
    : chgEffectHTML(eff);

  return '<button class="btn btn-ghost btn-sm ct-back" onclick="contracts.backToChgs()">'+_icn("rotateCcw")+' كل أوامر التغيير</button>'+
  '<div class="ct-head"><div><h2 class="ct-title">'+_icn("repeat")+' '+_esc(g.id)+'</h2>'+
    '<div class="ct-sub">'+chgBadge(g.status)+(owner&&!chgIsFinal(g.status)?' <span class="ct-id">بانتظار '+_esc(owner.lbl)+'</span>':'')+'</div></div>'+
    '<div class="ct-actions">'+tools+'</div></div>'+
  '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("pieChart","ic-sm")+' الأثر على العقد</div>'+effBox+
    '<div class="ct-note" style="margin-top:12px">'+_icn("fileText","ic-sm")+' <b>السبب:</b> '+_esc(g.reason||"—")+'</div>'+
    (g.durationDaysDelta?'<div class="ct-note">'+_icn("timer","ic-sm")+' تمديدُ المدة '+money0(g.durationDaysDelta)+' يوماً</div>':'')+
  '</div>'+
  '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("layers","ic-sm")+' بنود التغيير</div>'+
    '<div class="ct-table-wrap"><table class="ct-table"><thead><tr><th>الوصف</th><th>الوحدة</th><th>فارق الكمية</th><th>سعر الوحدة</th><th>أثر القيمة</th></tr></thead>'+
    '<tbody>'+rows+'</tbody></table></div></div>'+
  '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("scrollText","ic-sm")+' السجل</div>'+
    '<div class="ct-timeline">'+tl+'</div></div>';
}

function chgAct(action){
  var id=_chgOpen; if(!id) return;
  var run=function(note){
    actOnChange(id, action, note).then(function(g){
      paintCtrs(); _toast("✅ "+(CHG_STATUS[g.status]||g.status),"success");
    }).catch(function(e){ _toast("⚠ "+(e&&e.message?e.message:"تعذّر الإجراء"),"warn"); });
  };
  if(action==="reject"){
    var r=prompt("سبب الرفض (إلزاميّ):"); if(!r) return;
    run(r);
  } else run("");
}
function doApplyChange(){
  var id=_chgOpen; if(!id) return;
  applyChange(id).then(function(){
    paintCtrs(); _toast("✅ طُبِّق أمرُ التغيير على العقد","success");
  }).catch(function(e){ _toast("⚠ "+(e&&e.message?e.message:"تعذّر التطبيق"),"warn"); });
}
function doCancelChange(){
  var id=_chgOpen; if(!id) return;
  var r=prompt("سبب الإلغاء (اختياريّ):");
  if(r===null) return;
  cancelChange(id, r).then(function(){ paintCtrs(); _toast("✅ أُلغي أمرُ التغيير","success"); })
    .catch(function(e){ _toast("⚠ "+(e&&e.message?e.message:"تعذّر الإلغاء"),"warn"); });
}

function filterCtrs(k,v){
  _cFilter[k]=v||""; paintCtrs();
  if(k==="q"){ var i=document.getElementById("ct-c-q"); if(i){ i.focus(); try{ i.setSelectionRange(i.value.length,i.value.length); }catch(e){} } }
}
function openCtr(id){ _cOpen=id; _cTab="overview"; _extDraft=null; _extOpen=null; _clEdit=null; _chgDraft=null; _chgOpen=null; paintCtrs(); }
function backToCtrs(){ _cOpen=null; paintCtrs(); }
function ctrTab(t){ _cTab=t; _extDraft=null; _extOpen=null; _clEdit=null; _chgDraft=null; _chgOpen=null; paintCtrs(); }
function openReqFromCtr(reqId){ try{ showPage(PAGE_REQS); }catch(e){} openReq(reqId); }
function openCtrFromReq(cid){ try{ showPage(PAGE_CTRS); }catch(e){} openCtr(cid); }

function transit(action){
  var c=contractById(_cOpen); if(!c) return;
  var t=CTR_TRANSITIONS[action]; if(!t) return;
  Promise.resolve(_confirm({ title:t.lbl, msg:'«'+(c.title||c.id)+'» — '+t.lbl+'؟' })).then(function(ok){
    if(!ok) return;
    var reason="";
    if(t.needsReason){
      reason=(window.prompt("السبب (إلزامي):")||"").trim();
      if(!reason){ _toast("⚠ السبب إلزامي","warn"); return; }
    }
    return transitContract(_cOpen, action, reason).then(function(){
      paintCtrs(); _toast("✅ "+t.lbl,"success");
    });
  }).catch(function(e){
    console.warn("contracts/transit",e);
    _toast("⚠ "+(e&&e.message?e.message:"تعذّر الإجراء"),"warn");
  });
}



/* ════ المخرَجُ الورقيّ — الوثيقةُ التي يوقّعها الطرف ════
   تُبنى بـ`_openPrintWindow` القائمة في النواة (ومعها معالجةُ iOS المجرَّبة)،
   بنمط مطبوعات المنصة نفسِه. وهنا يثمر سجلُّ الأطراف: المنشأةُ تُعرَّف بسجلها
   التجاريّ والشخصُ بهويته — كلٌّ بمسمّاه الصحيح، من `identityOf` لا بشرطٍ محلّيّ. */
function printContract(id){
  var c=contractById(id); if(!c) return _toast("⚠ العقد غير موجود","warn");
  var v=vendorById(c.vendorId), idn=v?identityOf(v):null;
  var val=contractValue(c), t=linesTotal(c.lines||[], c.vatMode);
  var groups=allClausesOf(c);
  var logo=""; try{ var im=document.querySelector('img[data-logo="1"]'); if(im&&im.src&&im.src.indexOf("data:,")!==0) logo=im.src; }catch(e){}

  var lineRows=(c.lines||[]).map(function(l,i){
    var lt=lineTotal(l.qty,l.unitPrice,c.vatMode);
    return '<tr><td style="text-align:center">'+(i+1)+'</td>'+
      '<td style="text-align:right">'+_esc(l.desc||"—")+'</td>'+
      '<td style="text-align:center">'+_esc(l.unit||"—")+'</td>'+
      '<td style="text-align:center">'+money0(contractLineQty(c,l.id))+'</td>'+
      '<td style="text-align:center">'+money(l.unitPrice)+'</td>'+
      '<td style="text-align:center;font-weight:700">'+money(lt.total)+'</td></tr>';
  }).join("") || '<tr><td colspan="6" style="text-align:center;padding:14px">—</td></tr>';

  var clauseHtml=groups.map(function(g){
    return '<div class="cl-grp"><div class="cl-cat">'+_esc(g.label)+'</div>'+
      g.items.map(function(x,i){
        return '<div class="cl"><div class="cl-t">'+(i+1)+'. '+_esc(x.title||"")+'</div>'+
          '<div class="cl-b">'+_esc(x.body||"")+'</div></div>';
      }).join("")+'</div>';
  }).join("");

  var vatRow = normVatMode(c.vatMode)==="none" ? "" :
    '<tr><td>ضريبة القيمة المضافة</td><td class="n">'+money(t.vat)+'</td></tr>';

  var html='<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">'+
  '<title>عقد '+_esc(c.id)+'</title><style>'+
  '*{box-sizing:border-box}'+
  'body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;margin:0;padding:26px;color:#111827;direction:rtl;font-size:13px;line-height:1.9}'+
  '.header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1b3a6b;padding-bottom:12px}'+
  '.header-right{display:flex;align-items:center;gap:12px}'+
  '.company-logo{width:56px;height:56px;object-fit:contain}'+
  '.company{font-size:18px;font-weight:800}.subtitle{font-size:13px;color:#1b3a6b;font-weight:700}'+
  '.doc-no{background:#eef2f7;color:#1b3a6b;border-radius:8px;padding:8px 14px;font-weight:800;font-family:monospace}'+
  'h2{font-size:15px;color:#1b3a6b;margin:22px 0 8px;border-bottom:1px solid #dde3ed;padding-bottom:5px}'+
  '.parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:10px}'+
  '.party{border:1px solid #dde3ed;border-radius:8px;padding:11px 13px}'+
  '.party .pl{font-size:11px;color:#64748b;font-weight:700;margin-bottom:4px}'+
  '.party .pn{font-size:14px;font-weight:800}'+
  '.party .pm{font-size:12px;color:#374151;margin-top:3px}'+
  'table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12.5px}'+
  'th{background:#1b3a6b;color:#fff;padding:8px;font-weight:700}'+
  'td{padding:7px 8px;border-bottom:1px solid #e5e7eb}'+
  'tbody tr:nth-child(even){background:#f8fafc}'+
  '.sum{width:340px;margin-inline-start:auto;margin-top:10px}'+
  '.sum td{border-bottom:1px solid #eef2f7}.sum .n{text-align:left;font-family:monospace;font-weight:700}'+
  '.sum tr:last-child td{border-top:2px solid #1b3a6b;font-weight:800;font-size:14px}'+
  '.cl-grp{margin-top:14px;break-inside:avoid}'+
  '.cl-cat{font-weight:800;color:#1b3a6b;font-size:13px;margin-bottom:6px}'+
  '.cl{margin-bottom:9px;break-inside:avoid}'+
  '.cl-t{font-weight:700;font-size:12.5px}'+
  '.cl-b{font-size:12.5px;color:#374151;text-align:justify}'+
  '.sign{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:56px;font-size:12px;break-inside:avoid}'+
  '.sign div{border-top:1px solid #9ca3af;padding-top:8px;text-align:center;color:#374151;min-height:70px}'+
  '.foot{margin-top:26px;font-size:10.5px;color:#94a3b8;text-align:center;border-top:1px solid #e5e7eb;padding-top:8px}'+
  '@media print{body{padding:14px}@page{margin:14mm}}'+
  '</style></head><body>'+
  '<div class="header"><div class="header-right">'+
    (logo?'<img src="'+_esc(logo)+'" class="company-logo" alt="">':'')+
    '<div><div class="company">شركة المباني السريعة للمقاولات</div>'+
    '<div class="subtitle">عقد إسناد أعمال — مقاول باطن</div></div></div>'+
    '<div class="doc-no">'+_esc(c.id)+'</div></div>'+

  '<h2>أطراف العقد</h2><div class="parties">'+
    '<div class="party"><div class="pl">الطرف الأول</div>'+
      '<div class="pn">شركة المباني السريعة للمقاولات</div>'+
      '<div class="pm">ويُشار إليها بـ«الطرف الأول»</div></div>'+
    '<div class="party"><div class="pl">الطرف الثاني</div>'+
      '<div class="pn">'+_esc(c.vendorName||"—")+'</div>'+
      '<div class="pm">'+(idn&&idn.number?(_esc(idn.label)+": "+_esc(idn.number)):"—")+
        '</div><div class="pm">ويُشار إليه بـ«الطرف الثاني»</div></div>'+
  '</div>'+

  '<h2>موضوع العقد</h2>'+
  '<div>'+_esc(c.title||"—")+(c.scope?(" — "+_esc(c.scope)):"")+
  '<br>المشروع: <b>'+_esc(docProjectName(c,_projects()))+'</b>'+
  (c.startDate?(' · تاريخ البدء: <b>'+_esc(c.startDate)+'</b>'):'')+
  (c.durationDays?(' · المدة: <b>'+money0(c.durationDays)+' يوماً</b>'):'')+'</div>'+

  '<h2>جدول بنود الأعمال</h2>'+
  '<table><thead><tr><th style="width:36px">#</th><th style="text-align:right">البند</th>'+
  '<th>الوحدة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>'+
  '<tbody>'+lineRows+'</tbody></table>'+
  '<table class="sum"><tr><td>إجمالي الأعمال</td><td class="n">'+money(t.base)+'</td></tr>'+
  vatRow+'<tr><td>قيمة العقد ('+_esc((VAT_MODES[normVatMode(c.vatMode)]||{}).short||"")+')</td><td class="n">'+money(val)+' ر.س</td></tr></table>'+

  '<h2>شروط العقد</h2>'+clauseHtml+

  '<div class="sign"><div>الطرف الأول — شركة المباني السريعة للمقاولات<br><br>الاسم / التوقيع / الختم</div>'+
  '<div>الطرف الثاني — '+_esc(c.vendorName||"")+'<br><br>الاسم / التوقيع / الختم</div></div>'+
  '<div class="foot">حُرِّر هذا العقد من نسختين بيد كل طرف نسخة للعمل بموجبها · '+_esc(c.id)+'</div>'+
  '</body></html>';

  try{
    if(typeof _openPrintWindow === "function") _openPrintWindow(html);
    else { var w=window.open("","_blank"); if(w){ w.document.write(html); w.document.close(); } }
    _audit("طباعة عقد", c.id);
  }catch(e){ console.warn("contracts/printContract",e); _toast("⚠ تعذّر فتح نافذة الطباعة","warn"); }
}


/* ── تبويبُ شروط العقد ── */
var _clEdit = null;
function ctrClausesHTML(c){
  var canEdit = ["procurement_officer","project_manager","admin"].indexOf(_role())!==-1 &&
                (c.status==="ctr_pending_signature" || c.status==="ctr_active");
  if(_clEdit) return clausesEditHTML(c);
  var groups=allClausesOf(c);
  var body=groups.map(function(g){
    return '<div class="ct-cl-grp"><div class="ct-cl-cat">'+_esc(g.label)+'</div>'+
      g.items.map(function(x){
        var auto = String(x.key||"").indexOf("_fin_")===0;
        return '<div class="ct-cl"><div class="ct-cl-t">'+_esc(x.title||"")+
          (auto?' <span class="ct-doc s-ok">يتولّد من الأرقام</span>':'')+'</div>'+
          '<div class="ct-cl-b">'+_esc(x.body||"")+'</div></div>';
      }).join("")+'</div>';
  }).join("") || '<div style="color:var(--muted);font-size:12.5px">لا شروط.</div>';
  return '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("fileText","ic-sm")+' شروط العقد'+
      '<span class="ct-sec-lock">نسخةُ هذا العقد وحدَه — تعديلُ القوالب لاحقاً لا يمسّه</span>'+
      (canEdit?'<button class="btn btn-ghost btn-sm" style="margin-inline-start:8px" onclick="contracts.editClauses()">'+_icn("edit","ic-sm")+' تحرير</button>':'')+
    '</div>'+body+
    '<div class="ct-note" style="margin-top:14px">'+_icn("alertCircle","ic-sm")+' الشروطُ الماليةُ (القيمة · المقدَّم · المحتجز · الغرامة · الضمان) <b>تتولّد نصّاً من أرقام العقد</b> — فلا يتناقض المطبوعُ مع المحسوب.</div>'+
  '</div>';
}
function clausesEditHTML(c){
  var rows=_clEdit.map(function(cl,i){
    return '<div class="card ct-sec" style="margin-bottom:10px">'+
      '<div class="ct-form-row">'+
        field("التصنيف", '<select class="form-input" data-cf2="category" data-i="'+i+'">'+
          CLAUSE_ORDER.map(function(k){ return '<option value="'+k+'"'+(cl.category===k?' selected':'')+'>'+_esc(CLAUSE_CATS[k].lbl)+'</option>'; }).join("")+
        '</select>')+
        field("عنوان البند", '<input class="form-input" data-cf2="title" data-i="'+i+'" value="'+_esc(cl.title||"")+'">')+
      '</div>'+
      field("النص", '<textarea class="form-input" data-cf2="body" data-i="'+i+'" rows="3">'+_esc(cl.body||"")+'</textarea>')+
      '<div style="text-align:left;margin-top:8px"><button class="btn btn-delete" onclick="contracts.delClause('+i+')">'+_icn("trash","ic-sm")+' حذف البند</button></div>'+
    '</div>';
  }).join("");
  return '<div class="ct-sec-h">'+_icn("edit","ic-sm")+' تحرير شروط '+_esc(c.id)+
    '<button class="btn btn-ghost btn-sm" style="margin-inline-start:auto" onclick="contracts.addClause()">'+_icn("plus","ic-sm")+' بند</button></div>'+
    (rows||'<div class="card" style="text-align:center;color:var(--muted);padding:20px;font-size:12.5px">لا شروط — أضِف بنداً.</div>')+
    '<div class="ct-save-bar">'+
      '<button class="btn btn-ghost btn-sm" onclick="contracts.cancelClauses()">إلغاء</button>'+
      '<button class="btn btn-success btn-sm" id="ct-cl-save" onclick="contracts.saveClauses()">'+_icn("save","ic-sm")+' حفظ الشروط</button>'+
    '</div>';
}
function editClauses(){
  var c=contractById(_cOpen); if(!c) return;
  _clEdit=(Array.isArray(c.clauses)?c.clauses:[]).map(function(x){ return Object.assign({},x); });
  paintCtrs();
}
function syncClauses(){
  if(!_clEdit) return;
  document.querySelectorAll("[data-cf2]").forEach(function(el){
    var i=parseInt(el.dataset.i,10), f=el.dataset.cf2;
    if(_clEdit[i] && f) _clEdit[i][f]=String(el.value||"").trim();
  });
}
function addClause(){ syncClauses(); if(!_clEdit) _clEdit=[]; _clEdit.push({ key:"c"+Date.now().toString(36), category:"general", title:"", body:"" }); paintCtrs(); }
function delClause(i){ syncClauses(); if(_clEdit){ _clEdit.splice(i,1); paintCtrs(); } }
function cancelClauses(){ _clEdit=null; paintCtrs(); }
function saveClauses(){
  syncClauses();
  var list=(_clEdit||[]).filter(function(x){ return x.title || x.body; });
  var btn=document.getElementById("ct-cl-save"); if(btn){ btn.disabled=true; btn.textContent="جارٍ الحفظ…"; }
  saveContractClauses(_cOpen, list).then(function(){
    _clEdit=null; paintCtrs(); _toast("✅ حُفظت شروط العقد","success");
  }).catch(function(e){
    if(btn){ btn.disabled=false; btn.innerHTML=_icn("save","ic-sm")+" حفظ الشروط"; }
    _toast("⚠ "+(e&&e.message?e.message:"تعذّر الحفظ"),"warn");
  });
}

function printCtr(){ printContract(_cOpen); }

/* ── تسجيلُ التوقيع برفع النسخة الموقّعة ── */
function openSign(){
  var el=document.getElementById("page-"+PAGE_CTRS); if(!el) return;
  var old=document.getElementById("ct-sign"); if(old) old.remove();
  var box=document.createElement("div");
  box.className="card ct-sec"; box.id="ct-sign";
  box.innerHTML='<div class="ct-sec-h">'+_icn("save","ic-sm")+' تسجيل توقيع الطرف</div>'+
    '<div class="ct-note">'+_icn("alertCircle","ic-sm")+' برفع النسخة الموقّعة يصير العقد <b>سارياً</b> وتُقبل عليه المستخلصات.</div>'+
    '<div class="ct-form-row">'+
      field("صورة العقد الموقَّع * (صورة أو PDF)", '<input type="file" class="form-input ct-file" id="ct-sg-file" accept="image/*,application/pdf">')+
      '<div></div>'+
    '</div>'+
    '<div class="ct-save-bar" style="position:static">'+
      '<button class="btn btn-ghost btn-sm" onclick="contracts.closeSign()">إلغاء</button>'+
      '<button class="btn btn-success btn-sm" id="ct-sg-btn" onclick="contracts.doSign()">'+_icn("checkCircle","ic-sm")+' تسجيل التوقيع</button>'+
    '</div>';
  el.insertBefore(box, el.children[2]||null);
  box.scrollIntoView({behavior:"smooth",block:"center"});
}
function closeSign(){ var b=document.getElementById("ct-sign"); if(b) b.remove(); }
function doSign(){
  var c=contractById(_cOpen); if(!c) return;
  var f=(document.getElementById("ct-sg-file")||{}).files;
  if(!f||!f[0]){ _toast("⚠ صورة العقد الموقَّع إلزامية","warn"); return; }
  var btn=document.getElementById("ct-sg-btn"); if(btn){ btn.disabled=true; btn.textContent="جارٍ الرفع…"; }
  uploadVendorDoc(c.id, f[0], "signed").then(function(att){
    if(!att||!att.url) throw new Error("تعذّر رفع النسخة الموقّعة");
    return signContract(c.id, att);
  }).then(function(){
    closeSign(); paintCtrs(); _toast("✅ سُجِّل التوقيع — العقد ساري","success");
  }).catch(function(e){
    console.warn("contracts/doSign",e);
    if(btn){ btn.disabled=false; btn.innerHTML=_icn("checkCircle","ic-sm")+" تسجيل التوقيع"; }
    _toast("⚠ "+(e&&e.message?e.message:"تعذّر التسجيل")+" — لا يسري عقدٌ بلا نسخةٍ موقّعة","warn");
  });
}

/* ── أفعالُ المستخلص ── */
function newExtract(){
  var c=contractById(_cOpen); if(!c) return;
  if(["project_manager","admin"].indexOf(_role())===-1) return _toast("⚠ إعداد المستخلص لمدير المشروع أو الأدمن","warn");
  var open=openExtractOf(_exts,c.id);
  if(open) return _toast("⚠ يوجد مستخلصٌ مفتوح ("+open.id+")","warn");
  var floor=prevCumByLine(_exts,c,null);
  _extOpen=null;
  _extDraft={ contractId:c.id, period:"", isFinal:false,
    materialsIssued:0, penaltyAmount:0, ncDeduction:0,
    lines:(c.lines||[]).map(function(l){
      return { lineId:l.id, desc:l.desc||"", unit:l.unit||"", unitPrice:Number(l.unitPrice)||0,
               cumQty: Number(floor[l.id])||0 };
    }) };
  paintCtrs();
}
function cancelExtract(){ _extDraft=null; paintCtrs(); }
function openExt(id){ _extOpen=id; _extDraft=null; paintCtrs(); }
function backToExts(){ _extOpen=null; paintCtrs(); }

function syncExtDraft(){
  if(!_extDraft) return;
  var d=_extDraft;
  function n(id){ var e=document.getElementById(id); return e?(Number(e.value)||0):0; }
  var p=document.getElementById("ct-e-period"); if(p) d.period=String(p.value||"").trim();
  var f=document.getElementById("ct-e-final"); if(f) d.isFinal = f.value==="1";
  if(document.getElementById("ct-e-pen")) d.penaltyAmount=n("ct-e-pen");
  if(document.getElementById("ct-e-mat")) d.materialsIssued=n("ct-e-mat");
  if(document.getElementById("ct-e-nc"))  d.ncDeduction=n("ct-e-nc");
  var t=document.getElementById("ct-e-lines");
  if(t) t.querySelectorAll("[data-ef]").forEach(function(inp){
    var i=parseInt(inp.dataset.i,10);
    if(d.lines[i]) d.lines[i].cumQty=Number(inp.value)||0;
  });
}
/* إعادةُ رسم السلّم وحدَه — فلا يقفز مؤشّرُ الكتابة أثناء الإدخال. */
function extRecalc(){
  syncExtDraft();
  var c=contractById(_cOpen); if(!c||!_extDraft) return;
  var ctx={ prevGross:prevGrossOf(_exts,c,null), materialsIssued:_extDraft.materialsIssued,
            penaltyAmount:_extDraft.penaltyAmount, ncDeduction:_extDraft.ncDeduction };
  var box=document.getElementById("ct-e-ladder");
  if(box) box.innerHTML=ladderHTML(extNet(_extDraft,c,ctx), c);
  var g=extCumGuard(_extDraft,c,_exts);
  var btn=document.getElementById("ct-e-send"); if(btn) btn.disabled=!g.ok;
  // التحذيرُ يُحدَّث مع الإدخال لا عند إعادة الرسم الكاملة — زرٌّ معطَّلٌ بلا سببٍ ظاهر
  // يترك المستخدمَ عالقاً لا يعرف ماذا يصلح.
  var wbox=document.getElementById("ct-e-warn");
  if(wbox) wbox.innerHTML = g.ok ? "" : '<div class="ct-note crit">'+_icn("alertTriangle","ic-sm")+' '+_esc(_guardMsg(g))+'</div>';
  // خلايا «%» و«القيمة» تُحدَّث مع الإدخال أيضاً — وإلا بقيت صفراً بينما السلّم يتغيّر
  var floor=prevCumByLine(_exts,c,null);
  var lt=document.getElementById("ct-e-lines");
  if(lt) lt.querySelectorAll("tbody tr").forEach(function(tr,i){
    var l=_extDraft.lines[i]; if(!l) return;
    var cum=Number(l.cumQty)||0, max=contractLineQty(c,l.lineId), was=Number(floor[l.lineId])||0;
    tr.classList.toggle("ct-bad", cum>max+1e-9 || cum<was-1e-9);
    var tds=tr.querySelectorAll("td");
    if(tds[4]) tds[4].textContent = (max>0?Math.round(cum/max*100):0)+"%";
    if(tds[5]) tds[5].textContent = money(r2(vatSplit(l.unitPrice,c.vatMode).base*cum));
  });
}
function applyPenalty(){
  syncExtDraft();
  var c=contractById(_cOpen); if(!c||!_extDraft) return;
  _extDraft.penaltyAmount = suggestedPenalty(c, lateDaysOf(c,_today()));
  paintCtrs();
}
function submitExtract(){
  syncExtDraft();
  var c=contractById(_cOpen), d=_extDraft; if(!c||!d) return;
  var btn=document.getElementById("ct-e-send"); if(btn){ btn.disabled=true; btn.textContent="جارٍ الإرسال…"; }
  createExtract(c, d).then(function(id){
    _extDraft=null; _extOpen=id; paintCtrs(); _toast("✅ أُرسل المستخلص "+id,"success");
  }).catch(function(e){
    console.warn("contracts/submitExtract",e);
    if(btn){ btn.disabled=false; btn.innerHTML=_icn("send","ic-sm")+" إرسال للاعتماد"; }
    _toast("⚠ "+(e&&e.message?e.message:"تعذّر الإرسال"),"warn");
  });
}
function extAct(action){
  var e=extractById(_extOpen); if(!e) return;
  var isRej=action==="reject";
  Promise.resolve(_confirm({ title:isRej?"رفض / إعادة المستخلص":"اعتماد المستخلص",
    msg:isRej?"سيعود المستخلص لمُعِدّه للتصحيح.":"اعتماد المستخلص "+e.id+"؟" })).then(function(ok){
    if(!ok) return;
    var note="";
    if(isRej){ note=(window.prompt("سبب الرفض (إلزامي):")||"").trim(); if(!note){ _toast("⚠ السبب إلزامي","warn"); return; } }
    return actOnExtract(_extOpen, action, note).then(function(){ paintCtrs(); _toast(isRej?"✅ أُعيد":"✅ اعتُمد","success"); });
  }).catch(function(err){ _toast("⚠ "+(err&&err.message?err.message:"تعذّر الإجراء"),"warn"); });
}
function openExtPay(){
  var e=extractById(_extOpen), c=contractById(_cOpen); if(!e||!c) return;
  var calc=extCalc(e,c);
  var el=document.getElementById("page-"+PAGE_CTRS); if(!el) return;
  var old=document.getElementById("ct-epay"); if(old) old.remove();
  var box=document.createElement("div");
  box.className="card ct-sec"; box.id="ct-epay";
  box.innerHTML='<div class="ct-sec-h">'+_icn("banknote","ic-sm")+' تسجيل سداد '+_esc(e.id)+'</div>'+
    '<div class="ct-note">'+_icn("alertCircle","ic-sm")+' المبلغُ المسدَّد هو <b>صافي السلّم</b> ('+money(calc.net)+' ر.س) — لا يُدخَل يدوياً.</div>'+
    '<div class="ct-form-row">'+
      field("مرجع التحويل", '<input class="form-input" id="ct-ep-ref" placeholder="رقم العملية">')+
      field("إيصال السداد * (صورة أو PDF)", '<input type="file" class="form-input ct-file" id="ct-ep-file" accept="image/*,application/pdf">')+
    '</div>'+
    '<div class="ct-save-bar" style="position:static">'+
      '<button class="btn btn-ghost btn-sm" onclick="contracts.closeExtPay()">إلغاء</button>'+
      '<button class="btn btn-success btn-sm" id="ct-ep-btn" onclick="contracts.doExtPay()">'+_icn("save","ic-sm")+' تسجيل السداد</button>'+
    '</div>';
  el.insertBefore(box, el.children[2]||null);
  box.scrollIntoView({behavior:"smooth",block:"center"});
}
function closeExtPay(){ var b=document.getElementById("ct-epay"); if(b) b.remove(); }
function doExtPay(){
  var e=extractById(_extOpen); if(!e) return;
  var f=(document.getElementById("ct-ep-file")||{}).files;
  if(!f||!f[0]){ _toast("⚠ إيصال السداد إلزامي","warn"); return; }
  var ref=String((document.getElementById("ct-ep-ref")||{}).value||"").trim();
  var btn=document.getElementById("ct-ep-btn"); if(btn){ btn.disabled=true; btn.textContent="جارٍ الرفع…"; }
  uploadVendorDoc(e.id, f[0], "receipt").then(function(att){
    if(!att||!att.url) throw new Error("تعذّر رفع الإيصال");
    return payExtract(e.id, { ref:ref, receiptUrl:att.url });
  }).then(function(){
    closeExtPay(); paintCtrs(); _toast("✅ سُجِّل السداد","success");
  }).catch(function(err){
    console.warn("contracts/doExtPay",err);
    if(btn){ btn.disabled=false; btn.innerHTML=_icn("save","ic-sm")+" تسجيل السداد"; }
    _toast("⚠ "+(err&&err.message?err.message:"تعذّر السداد")+" — لم يُسجَّل سدادٌ بلا إيصال","warn");
  });
}

/* زرُّ «إنشاء العقد» على بطاقة الطلب المعتمَد. */
function makeContract(){
  var r=requestById(_rOpen); if(!r) return;
  Promise.resolve(_confirm({
    title:"إنشاء العقد",
    msg:'سيُنشأ عقدٌ سارٍ من «'+(r.title||r.id)+'» بقيمة '+money(r.value)+' ر.س، ويُقفل الطلب.'
  })).then(function(ok){
    if(!ok) return;
    return convertToContract(_rOpen).then(function(cid){
      paintReqs();
      _toast("✅ أُنشئ العقد "+cid,"success");
      try{ showPage(PAGE_CTRS); }catch(e){}
      openCtr(cid);
    });
  }).catch(function(e){
    console.warn("contracts/makeContract",e);
    _toast("⚠ "+(e&&e.message?e.message:"تعذّر إنشاء العقد"),"warn");
  });
}

/* ════════════════════════════════════════════════════════════════════
   ٨) التركيبُ الذاتيّ — صفحة + مجموعةُ قائمةٍ جانبية + لفُّ showPage
   ════════════════════════════════════════════════════════════════════ */
function ensurePages(){
  injectCSS();
  var anyPage = document.querySelector(".page");
  var host = anyPage ? anyPage.parentElement : document.body;
  [PAGE_VENDORS, PAGE_REQS, PAGE_CTRS].forEach(function(id){
    if(document.getElementById("page-"+id)) return;
    var div = document.createElement("div");
    div.className = "page"; div.id = "page-"+id;
    host.appendChild(div);
  });
}

function injectCSS(){
  if(document.getElementById("ct-css")) return;
  var st = document.createElement("style"); st.id = "ct-css";
  /* بلا لونٍ جديدٍ ولا خطٍّ جديد — توكنزُ المنصة وكلاساتُها الجاهزة فقط، فيتبع
     النمطُ الثيمين معاً بلا صيانةٍ منفصلة. والأرقامُ كلُّها مونوسبيس بـ
     tabular-nums و direction:ltr كما في كل شاشات المنصة. */
  st.textContent = [
"#page-"+PAGE_VENDORS+",#page-"+PAGE_REQS+",#page-"+PAGE_CTRS+"{direction:rtl}",
".ct-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}",
".ct-title{font-size:19px;font-weight:800;font-family:'Cairo',sans-serif;color:var(--primary);margin:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
".ct-sub{font-size:12px;color:var(--muted);margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
".ct-actions{display:flex;gap:8px;flex-wrap:wrap}",
".ct-back{margin-bottom:10px}",
".ct-id{font-size:11px;color:var(--muted)}",
".num{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;direction:ltr;unicode-bidi:isolate}",
/* شريطُ الأرقام العلويّ */
".ct-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:12px}",
".ct-stat{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:11px 14px;display:flex;flex-direction:column;gap:3px;box-shadow:var(--shadow);border-top:3px solid var(--sla-ok)}",
".ct-stat.warn{border-top-color:var(--sla-warn)}.ct-stat.bad{border-top-color:var(--sla-crit)}",
".ct-stat .l{font-size:10.5px;color:var(--muted);font-weight:700}",
".ct-stat .v{font-size:21px;font-weight:800;font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;color:var(--text);line-height:1.1}",
".ct-stat.warn .v{color:var(--sla-warn)}.ct-stat.bad .v{color:var(--sla-crit)}",
/* المرشّحات */
".ct-filters{display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;margin-bottom:14px}",
".ct-filters .form-input{font-size:12.5px}",
/* شبكةُ الأطراف */
".ct-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(265px,1fr));gap:14px}",
".ct-tile{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:14px 15px;box-shadow:var(--shadow);cursor:pointer;position:relative;overflow:hidden;transition:transform .16s,box-shadow .16s}",
".ct-tile::before{content:'';position:absolute;inset-block:0;inset-inline-start:0;width:4px;background:var(--rail,var(--sla-ok))}",
".ct-tile:hover{transform:translateY(-3px);box-shadow:0 14px 32px rgba(20,30,55,.13)}",
".ct-tile-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:5px}",
".ct-tile-name{font-size:14.5px;font-weight:800;font-family:'Cairo',sans-serif;color:var(--primary);line-height:1.35}",
".ct-tile-kind{font-size:11.5px;color:var(--muted);font-weight:600;display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:10px}",
".ct-dot{opacity:.5}",
/* شريطُ سريان الوثائق — العنصرُ المميّز: يرمّز محتوًى حقيقياً (تواريخَ فعلية) لا زينة */
".ct-docs{display:flex;flex-wrap:wrap;gap:5px}",
".ct-doc{font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;border:1px solid;white-space:nowrap}",
".ct-doc.s-ok{background:var(--sla-ok-bg);color:var(--sla-ok);border-color:var(--sla-ok-bd)}",
".ct-doc.s-soon{background:var(--sla-warn-bg);color:var(--sla-warn);border-color:var(--sla-warn-bd)}",
".ct-doc.s-expired{background:var(--sla-crit-bg);color:var(--sla-crit);border-color:var(--sla-crit-bd)}",
".ct-doc.s-none{background:var(--surface2);color:var(--muted);border-color:var(--border)}",
".ct-row-id td{background:var(--surface2)}",
/* ── طلبات التعاقد ── */
".ct-tile-foot{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;margin-top:10px;padding-top:9px;border-top:1px dashed var(--border)}",
".ct-money{font-size:17px;font-weight:800;color:var(--text);font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;direction:ltr}",
".ct-money small{font-size:10px;color:var(--muted);font-family:'Cairo',sans-serif;font-weight:700}",
".ct-tile-who{font-size:11px;color:var(--muted);font-weight:700;text-align:end}",
".ct-picks{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px}",
".ct-pick{display:flex;flex-direction:column;gap:3px;border:1px solid var(--border);border-radius:12px;padding:11px 13px;cursor:pointer;background:var(--surface);transition:border-color .15s,background .15s}",
".ct-pick.on{border-color:var(--primary);background:var(--surface2)}",
".ct-pick.off{opacity:.5;cursor:not-allowed}",
".ct-pick input{position:absolute;opacity:0;pointer-events:none}",
".ct-pick-t{font-size:13px;font-weight:800;color:var(--primary);display:flex;align-items:center;gap:6px}",
".ct-pick-s{font-size:11px;color:var(--muted);font-weight:600}",
".ct-table tr.ct-on td{background:var(--sla-ok-bg)}",
".ct-total{display:flex;flex-wrap:wrap;gap:8px 22px;justify-content:flex-end;margin-top:12px;padding-top:11px;border-top:1px solid var(--border)}",
".ct-tl{display:flex;flex-direction:column;gap:2px;align-items:flex-end}",
".ct-tl .l{font-size:10.5px;color:var(--muted);font-weight:700}",
".ct-tl .v{font-size:15px;font-weight:800;color:var(--text);font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;direction:ltr}",
".ct-tl.big .v{font-size:20px;color:var(--primary)}",
".ct-timeline{display:flex;flex-direction:column;gap:13px}",
".ct-tl-row{display:flex;gap:10px;align-items:flex-start}",
".ct-tl-row .d{width:9px;height:9px;border-radius:50%;background:var(--primary);flex-shrink:0;margin-top:5px}",
".ct-tl-row .t{font-size:12.5px;font-weight:800;color:var(--text)}",
".ct-tl-row .m{font-size:11px;color:var(--muted);font-weight:600;margin-top:2px}",
/* ── بطاقة العقد ── */
".ct-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;border-bottom:1px solid var(--border);padding-bottom:2px}",
".ct-tab{background:none;border:none;border-bottom:2px solid transparent;padding:8px 13px;font-size:12.5px;font-weight:800;color:var(--muted);cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:5px;transition:color .15s,border-color .15s}",
".ct-tab:hover{color:var(--text)}",
".ct-tab.on{color:var(--primary);border-bottom-color:var(--primary)}",
".ct-money-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:14px}",
".ct-money-row .ct-tl{align-items:flex-start}",
/* ── سُلَّمُ المستخلص: شكلُ الحساب نفسِه ── */
".ct-ladder{display:flex;flex-direction:column;gap:1px;background:var(--border);border:1px solid var(--border);border-radius:12px;overflow:hidden}",
".ct-rung{display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--surface);padding:9px 15px}",
".ct-rung .rl{font-size:12.5px;font-weight:600;color:var(--muted)}",
".ct-rung .rv{font-size:14px;font-weight:700;color:var(--text)}",
".ct-rung.strong .rl{color:var(--text);font-weight:800}",
".ct-rung.minus .rv{color:var(--danger)}",
".ct-rung.sum{background:var(--surface2)}",
".ct-rung.sum .rl{font-weight:800;color:var(--text)}",
".ct-rung.sum .rv{font-weight:800}",
".ct-rung.net{background:var(--surface2);padding:13px 15px}",
".ct-rung.net .rl{font-size:13.5px;font-weight:800;color:var(--primary)}",
".ct-rung.net .rv{font-size:20px;font-weight:800;color:var(--primary)}",
".ct-bar{height:9px;background:var(--surface2);border-radius:20px;overflow:hidden;margin-top:12px;box-shadow:inset 0 0 0 1px var(--border)}",
".ct-bar>span{display:block;height:100%;background:var(--accent);border-radius:20px;transition:width .4s}",
".ct-table tr.ct-bad td{background:var(--sla-crit-bg)}",
/* ── شروط العقد ── */
".ct-cl-grp{margin-bottom:16px}",
".ct-cl-cat{font-size:12.5px;font-weight:800;color:var(--primary);margin-bottom:8px;padding-bottom:5px;border-bottom:1px dashed var(--border)}",
".ct-cl{margin-bottom:10px}",
".ct-cl-t{font-size:12.5px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:6px;flex-wrap:wrap}",
".ct-cl-b{font-size:12.5px;color:var(--muted);line-height:1.9;margin-top:2px;text-align:justify}",

/* الأقسام والجداول */
".ct-sec{margin-bottom:14px}",
".ct-sec-h{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:800;color:var(--primary);margin-bottom:12px;padding-bottom:9px;border-bottom:1px solid var(--border)}",
".ct-sec-lock{margin-inline-start:auto;font-size:10.5px;font-weight:700;color:var(--muted);display:inline-flex;align-items:center;gap:4px}",
".ct-info{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}",
".ct-cell{display:flex;flex-direction:column;gap:3px;min-width:0}",
".ct-cell-l{font-size:10.5px;color:var(--muted);font-weight:700}",
".ct-cell-v{font-size:13px;font-weight:700;color:var(--text);word-break:break-word}",
".ct-table-wrap{overflow-x:auto}",
".ct-table{width:100%;border-collapse:collapse;font-size:12.5px;min-width:520px}",
".ct-table th{text-align:right;font-size:11px;color:var(--muted);font-weight:800;padding:7px 9px;border-bottom:1px solid var(--border);white-space:nowrap}",
".ct-table td{padding:8px 9px;border-bottom:1px solid var(--border);vertical-align:middle}",
".ct-table tbody tr:last-child td{border-bottom:none}",
".ct-table .form-input{font-size:12px;padding:5px 8px;min-width:110px}",
".ct-link{color:var(--info);text-decoration:none;font-weight:700;font-size:11.5px;display:inline-flex;align-items:center;gap:4px}",
".ct-link:hover{text-decoration:underline}",
/* التنبيهات */
".ct-note{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;padding:9px 13px;border-radius:10px;margin-bottom:12px;background:var(--surface2);color:var(--muted);border:1px solid var(--border)}",
".ct-note.warn{background:var(--sla-warn-bg);color:var(--sla-warn);border-color:var(--sla-warn-bd)}",
".ct-note.crit{background:var(--sla-crit-bg);color:var(--sla-crit);border-color:var(--sla-crit-bd)}",
/* النموذج */
".ct-form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}",
".ct-field{display:flex;flex-direction:column;gap:5px}",
".ct-field-l{font-size:11px;color:var(--muted);font-weight:700}",
".ct-file{font-size:11px;padding:4px}",
".ct-save-bar{display:flex;gap:8px;justify-content:flex-end;position:sticky;bottom:0;background:var(--bg);padding:12px 0 4px;border-top:1px solid var(--border)}",
/* الفراغ */
".ct-empty{text-align:center;padding:38px 20px}",
".ct-empty-ic{width:46px;height:46px;margin:0 auto 12px;color:var(--muted);opacity:.55}",
".ct-empty-ic svg{width:46px;height:46px;stroke-width:1.5}",
".ct-empty-t{font-size:15px;font-weight:800;color:var(--primary);margin-bottom:6px}",
".ct-empty-s{font-size:12.5px;color:var(--muted);max-width:420px;margin:0 auto;line-height:1.7}",
"@media(max-width:760px){.ct-filters{grid-template-columns:1fr}.ct-form-row{grid-template-columns:1fr}.ct-grid{grid-template-columns:1fr}.ct-picks{grid-template-columns:1fr}}",
"@media(prefers-reduced-motion:reduce){.ct-tile{transition:none}.ct-tile:hover{transform:none}.ct-bar>span{transition:none}}"
  ].join("\n");
  document.head.appendChild(st);
}

/* ══ مجموعةُ «التعاقدات» في القائمة الجانبية ══ */
function injectSidebarGroup(){
  if(!canView()){
    var h=document.getElementById("hdr-grp-contracts"); if(h) h.remove();
    var g=document.getElementById("grp-contracts");     if(g) g.remove();
    return;
  }
  if(document.getElementById("hdr-grp-contracts")) return;
  var nav = document.querySelector(".sidebar-nav");
  if(!nav) return;

  var hdr = document.createElement("div");
  hdr.className = "sidebar-group-header collapsed";
  hdr.id = "hdr-grp-contracts";
  hdr.setAttribute("onclick","toggleSidebarGroup('grp-contracts')");
  hdr.innerHTML = '<span class="s-icon">'+_svg("briefcase")+'</span> التعاقدات <span class="grp-arrow" id="arrow-grp-contracts">▾</span>';

  var grp = document.createElement("div");
  grp.className = "sidebar-group collapsed";
  grp.id = "grp-contracts";
  grp.style.maxHeight = "0";

  [{ id:"nav-contract-reqs-btn", page:PAGE_REQS,    icon:"fileText", lbl:"طلبات التعاقد" },
   { id:"nav-contracts-btn",     page:PAGE_CTRS,    icon:"briefcase",lbl:"العقود" },
   { id:"nav-vendors-btn",       page:PAGE_VENDORS, icon:"hardHat",  lbl:"سجل الأطراف" }].forEach(function(b){
    var btn = document.createElement("button");
    btn.className = "sidebar-nav-btn sidebar-child";
    btn.id = b.id; btn.dataset.page = b.page;
    btn.innerHTML = '<span class="s-icon">'+_svg(b.icon)+'</span> '+b.lbl;
    btn.onclick = function(){ try{ showPage(b.page); }catch(e){} };
    grp.appendChild(btn);
  });

  // بعد مجموعة «إدارة المشاريع» إن وُجدت — فالتعاقد امتدادُ المشروع لا المشتريات
  var pmHdr = document.getElementById("hdr-grp-projects");
  var pmGrp = document.getElementById("grp-projects");
  if(pmGrp && pmGrp.parentElement === nav){ nav.insertBefore(hdr, pmGrp.nextSibling); nav.insertBefore(grp, hdr.nextSibling); }
  else if(pmHdr && pmHdr.parentElement === nav){ nav.insertBefore(hdr, pmHdr.nextSibling); nav.insertBefore(grp, hdr.nextSibling); }
  else { nav.appendChild(hdr); nav.appendChild(grp); }
}

/* ══ لفُّ showPage دون تعديل النواة ══ */
function hookShowPage(){
  if(window._ctHooked || typeof window.showPage !== "function") return;
  var orig = window.showPage;
  var OURS = [PAGE_VENDORS, PAGE_REQS, PAGE_CTRS];
  window.showPage = function(id){
    if(OURS.indexOf(id) !== -1 && !canView()){
      _toast("🔒 هذا القسم غير متاح لدورك","warn");
      return orig.apply(this, ["dashboard"]);
    }
    orig.apply(this, arguments);
    if(OURS.indexOf(id) !== -1){
      var pg = document.getElementById("page-"+id);
      if(!pg) return;
      // النواةُ لا تعرف صفحاتنا فلا تُفعّلها — نُفعّلها نحن ونطفئ البقية
      document.querySelectorAll(".page").forEach(function(p){ p.classList.remove("active"); });
      pg.classList.add("active");
      try{
        var g = document.getElementById("grp-contracts");
        if(g && g.classList.contains("collapsed") && typeof toggleSidebarGroup === "function") toggleSidebarGroup("grp-contracts");
      }catch(e){}
      document.querySelectorAll(".sidebar-nav-btn").forEach(function(b){ b.classList.toggle("active", b.dataset.page === id); });
      _page = id;
      if(id === PAGE_VENDORS) render(); else if(id === PAGE_CTRS) renderCtrs(); else renderReqs();
    } else if(OURS.indexOf(_page) !== -1){ _page = ""; }
  };
  window._ctHooked = true;
}

function init(){
  ensurePages();
  injectSidebarGroup();
  hookShowPage();
  loadConfig();
  // القائمةُ الجانبية قد يُعاد بناؤها بعد الدخول أو تبديل المستخدم — أعِد الحقن
  try{
    var obs = new MutationObserver(function(){ injectSidebarGroup(); hookShowPage(); });
    obs.observe(document.body, { childList:true, subtree:true });
  }catch(e){}
}
/* التركيبُ الذاتيُّ مشروطٌ بوجود DOM: الدوالُّ النقيةُ تُحمَّل وتُفحَص في سياق `vm`
   بلا مستند (نمطُ فحوص `hail-tests`)، فلا يجوز أن يسقط الملفُّ عند التحميل هناك. */
if(typeof document !== "undefined" && document && typeof document.addEventListener === "function"){
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}

/* ════════════════════════════════════════════════════════════════════
   ٩) الواجهة العامة
   ════════════════════════════════════════════════════════════════════ */
window.contracts = {
  // الشاشات
  render: render, refreshNav: injectSidebarGroup,
  startSync: startSync, stopSync: stopSync, retry: retry,
  // سجل الأطراف
  openVendor: openVendor, backToVendors: backToVendors, filterVendors: filterVendors,
  newVendor: newVendor, editVendor: editVendor, cancelVendorEdit: cancelVendorEdit,
  saveVendorEdit: saveVendorEdit, addDoc: addDoc, delDoc: delDoc, changeStatus: changeStatus,
  setEntity: setEntity,
  vendors: vendors, vendorById: vendorById,
  // طلبات التعاقد [المرحلة ٢]
  renderReqs: renderReqs, startReqSync: startReqSync, stopReqSync: stopReqSync, retryReqs: retryReqs,
  newRequest: newRequest, cancelRequest: cancelRequestForm, submitRequest: submitRequest,
  setReqProject: setReqProject, setEngagement: setEngagement, setReqVendor: setReqVendor,
  toggleBoqLine: toggleBoqLine, addFreeLine: addFreeLine, delReqLine: delReqLine,
  addCandidate: addCandidate, delCandidate: delCandidate, recalc: recalc,
  filterReqs: filterReqs, openReq: openReq, backToReqs: backToReqs,
  act: act, doCancel: doCancel, openPay: openPay, closePay: closePay, doPay: doPay,
  requests: requests, requestById: requestById,
  // العقود [المرحلة ٣]
  renderCtrs: renderCtrs, startCtrSync: startCtrSync, stopCtrSync: stopCtrSync,
  filterCtrs: filterCtrs, openCtr: openCtr, backToCtrs: backToCtrs, ctrTab: ctrTab,
  transit: transit, makeContract: makeContract,
  openReqFromCtr: openReqFromCtr, openCtrFromReq: openCtrFromReq,
  // الوثيقة التعاقدية [المرحلة ٤-ب]
  printCtr: printCtr, printContract: printContract,
  editClauses: editClauses, addClause: addClause, delClause: delClause,
  cancelClauses: cancelClauses, saveClauses: saveClauses,
  openSign: openSign, closeSign: closeSign, doSign: doSign,
  clauseTemplates: clauseTemplates, loadClauseTemplates: loadClauseTemplates,
  saveClauseTemplates: saveClauseTemplates,
  _sign: signContract, _saveClauses: saveContractClauses,
  contractsList: contractsList, contractById: contractById, contractForRequest: contractForRequest,
  _convert: convertToContract, _transit: transitContract,
  // المستخلصات [المرحلة ٤]
  startExtSync: startExtSync, stopExtSync: stopExtSync,
  newExtract: newExtract, cancelExtract: cancelExtract, submitExtract: submitExtract,
  extRecalc: extRecalc, applyPenalty: applyPenalty,
  openExt: openExt, backToExts: backToExts, extAct: extAct,
  openExtPay: openExtPay, closeExtPay: closeExtPay, doExtPay: doExtPay,
  extractsList: extractsList, extractById: extractById, extractsFor: extractsFor,
  _createExt: createExtract, _actExt: actOnExtract, _payExt: payExtract, _extCalc: extCalc,
  _extDraftOf: function(){ return _extDraft; },
  // أوامرُ التغيير [المرحلة ٧]
  startChgSync: startChgSync, stopChgSync: stopChgSync,
  newChange: newChange, cancelChgDraft: cancelChgDraft, submitChange: submitChange,
  chgRecalc: chgRecalc, chgAddNew: chgAddNew, chgDelNew: chgDelNew,
  openChg: openChg, backToChgs: backToChgs, chgAct: chgAct,
  doApplyChange: doApplyChange, doCancelChange: doCancelChange,
  changesList: changesList, changeById: changeById, changesFor: changesFor,
  _createChg: createChange, _actChg: actOnChange, _applyChg: applyChange, _cancelChg: cancelChange,
  _chgDraftOf: function(){ return _chgDraft; },
  _chgAmountOf: chgAmountOf, _chgNextStage: chgNextStage, _chgEffect: chgEffect,
  _chgGuard: chgGuard, _chgCanAct: chgCanAct, _chgIsFinal: chgIsFinal,
  _contractChangeTotals: contractChangeTotals, _openChangeOf: openChangeOf,
  _chgContractEligible: chgContractEligible, _contractLineQty: contractLineQty,
  _CHG_STATUS: CHG_STATUS, _CHG_GATES: CHG_GATES, _CHG_OPEN: CHG_OPEN,
  // مقابضُ طبقة البيانات — مكشوفةٌ لفحص المتصفّح ليختبر القواعد نفسَها التي
  // تحرسها الشاشة، لا نسخةً منها: الرفضُ يجب أن يقع في البيانات لا على الزرّ.
  _create: createRequest, _act: actOnRequest, _pay: payRequest, _cancel: cancelRequest,
  _draft: function(){ return _rDraft; },
  // الصلاحيات
  canView: canView, canEdit: canEdit, canBank: canBank, canStatus: canStatus, canCreateReq: canCreateReq,
  // الدوالُّ النقية — مكشوفةٌ لفحوص hail-tests
  _r2: r2,
  _vatSplit: vatSplit,
  _lineTotal: lineTotal,
  _linesTotal: linesTotal,
  _payOrderAllowed: payOrderAllowed,
  _crqNextStage: crqNextStage,
  _contractValue: contractValue,
  _contractLineQty: contractLineQty,
  _extNet: extNet,
  _docExpiryState: docExpiryState,
  _vendorComplianceState: vendorComplianceState,
  _vendorEligibility: vendorEligibility,
  _normName: normName,
  _identityOf: identityOf,
  _suggestVatMode: suggestVatMode,
  _allExpiring: allExpiring,
  _duplicateOf: duplicateOf,
  _docTypesFor: docTypesFor,
  _normEntity: normEntity,
  _crqProcKey: crqProcKey,
  _crqFinanceKey: crqFinanceKey,
  _crqRevalidate: crqRevalidate,
  _crqValueOf: crqValueOf,
  _crqCanAct: crqCanAct,
  _crqGateOwner: crqGateOwner,
  _crqIsFinal: crqIsFinal,
  _crqIsBounced: crqIsBounced,
  _normalizeProjectRef: normalizeProjectRef,
  _docProjectName: docProjectName,
  _docProjectKey: docProjectKey,
  _budgetLinkState: budgetLinkState,
  // الربط بالموازنة [المرحلة ٥]
  rollupForProject: rollupForProject,
  contractsLoaded: contractsLoaded,
  poIsUnderContract: poIsUnderContract,
  _contractRollup: contractRollup,
  _projectKeyOfPm: projectKeyOfPm,
  _reqIsPending: reqIsPending,
  _ctrIsCommitted: ctrIsCommitted,
  _contractFromRequest: contractFromRequest,
  _advanceAmountOf: advanceAmountOf,
  _ctrCanTransit: ctrCanTransit,
  _ctrActionsFor: ctrActionsFor,
  _ctrIsFinal: ctrIsFinal,
  _financialClauses: financialClauses,
  _allClausesOf: allClausesOf,
  _DEFAULT_CLAUSES: DEFAULT_CLAUSES,
  _CLAUSE_CATS: CLAUSE_CATS,
  _CTR_TRANSITIONS: CTR_TRANSITIONS,
  _prevGrossOf: prevGrossOf,
  _prevCumByLine: prevCumByLine,
  _extCumGuard: extCumGuard,
  _openExtractOf: openExtractOf,
  _extNextStage: extNextStage,
  _extCanAct: extCanAct,
  _extIsFinal: extIsFinal,
  _lateDaysOf: lateDaysOf,
  _suggestedPenalty: suggestedPenalty,
  // الثوابت
  _VAT_RATE: VAT_RATE,
  _VAT_MODES: VAT_MODES,
  _ENGAGEMENTS: ENGAGEMENTS,
  _ENTITY_TYPES: ENTITY_TYPES,
  _ID_TYPES: ID_TYPES,
  _VENDOR_KINDS: VENDOR_KINDS,
  _VENDOR_STATUS: VENDOR_STATUS,
  _DOC_TYPES: DOC_TYPES,
  _CRQ_STATUS: CRQ_STATUS,
  _CRQ_FINAL: CRQ_FINAL,
  _CRQ_BOUNCED: CRQ_BOUNCED,
  _CTR_STATUS: CTR_STATUS,
  _EXT_STATUS: EXT_STATUS,
  _ceoThreshold: ceoThreshold,
  _payOrderThreshold: payOrderThreshold,
  MODULE_BUILD: MODULE_BUILD
};
})();
