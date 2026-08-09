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

var MODULE_BUILD = "v18.9.2500";

/* ════════════════════════════════════════════════════════════════════
   ١) الثوابت
   ════════════════════════════════════════════════════════════════════ */

var PAGE_VENDORS = "vendors";
var PAGE_REQS    = "contract-requests";

function _dev(){ try{ return typeof IS_DEV!=="undefined" && IS_DEV; }catch(e){ return false; } }
function VENDORS_COL(){   return _dev() ? "global_vendors_dev"            : "global_vendors"; }
function REQUESTS_COL(){  return _dev() ? "global_contract_requests_dev"  : "global_contract_requests"; }
function CONTRACTS_COL(){ return _dev() ? "global_contracts_dev"          : "global_contracts"; }
function EXTRACTS_COL(){  return _dev() ? "global_contract_extracts_dev"  : "global_contract_extracts"; }
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
function _projects(){
  try{
    var l = Array.isArray(window._projectsList) ? window._projectsList : [];
    return l.map(function(p){ return { id:p.id, name:p.name||p.id }; });
  }catch(e){ return []; }
}
function _projName(id){ var p=_projects().filter(function(x){ return x.id===id; })[0]; return p?p.name:(id||"—"); }

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
      var hay=normName(r.id)+" "+normName(r.vendorName)+" "+normName(r.title)+" "+normName(_projName(r.projectId));
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
      ' <span class="ct-dot">·</span> '+_esc(_projName(r.projectId))+'</div>'+
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
    engagement:"contract", projectId:(projs[0]||{}).id||"", title:"", scope:"",
    vendorId:"", vendorName:"", vatMode:"incl", budgetCategoryKey:"subcontractor",
    lines:[], candidates:[], rationale:"", durationDays:0, startDate:"",
    advance:{pct:0,recoveryPct:0}, retention:{pct:0,releaseOn:"completion"},
    penalty:{perDayPct:0,capPct:0}, warranty:{months:0}, value:0
  };
  paintReqs();
  if(_rDraft.projectId) loadProjectData(_rDraft.projectId);
}
function loadProjectData(projId){
  if(!projId) return;
  Promise.all([loadBoqFor(projId), loadBudgetFor(projId)]).then(function(){ if(_rDraft) paintReqs(); });
}
function setReqProject(projId){ syncReqDraft(); if(!_rDraft) return; _rDraft.projectId=projId; _rDraft.lines=[]; paintReqs(); loadProjectData(projId); }
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
  var items=_boqCache[_rDraft.projectId]||[];
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
  var items=_boqCache[d.projectId]||[];
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
  Object.keys(byCat).forEach(function(k){
    var planned=budgetPlanned(d.projectId,k);
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
        projs.map(function(p){ return '<option value="'+_esc(p.id)+'"'+(d.projectId===p.id?' selected':'')+'>'+_esc(p.name)+'</option>'; }).join("")+
      '</select>')+
      field("عنوان العمل *", '<input class="form-input" id="ct-r-title" value="'+_esc(d.title)+'" placeholder="مثال: محارة وبياض الدور الأول">')+
    '</div>'+
    '<div class="ct-form-row">'+
      field("الطرف *", '<select class="form-input" onchange="contracts.setReqVendor(this.value)">'+vendorOptions(d.vendorId)+'</select>')+
      field("وضع الضريبة", vatSel)+
    '</div>'+
    eligNote +
    '<div class="ct-picks">'+engCards+'</div>'+
  '</div>'+
  (isPay ? '' :
  '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("book","ic-sm")+' بنود المقايسة — '+_esc(_projName(d.projectId))+
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
  createRequest(d).then(function(id){
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
    infoCell("المشروع", _esc(_projName(r.projectId)))+
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
   ٨) التركيبُ الذاتيّ — صفحة + مجموعةُ قائمةٍ جانبية + لفُّ showPage
   ════════════════════════════════════════════════════════════════════ */
function ensurePages(){
  injectCSS();
  var anyPage = document.querySelector(".page");
  var host = anyPage ? anyPage.parentElement : document.body;
  [PAGE_VENDORS, PAGE_REQS].forEach(function(id){
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
"#page-"+PAGE_VENDORS+",#page-"+PAGE_REQS+"{direction:rtl}",
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
"@media(prefers-reduced-motion:reduce){.ct-tile{transition:none}.ct-tile:hover{transform:none}}"
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
  var OURS = [PAGE_VENDORS, PAGE_REQS];
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
      if(id === PAGE_VENDORS) render(); else renderReqs();
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
