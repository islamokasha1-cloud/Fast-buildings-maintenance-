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
       صريح. وفوقَ العتبة لا يمرّ أمرُ الدفع إلا **بإقرارٍ صريحٍ يُختم على الوثيقة**
       (`overThresholdAck` — طلبُ المالك): البابُ يُفتح عمداً معلَناً لا سهواً،
       والمبلغُ يمرّ على بوّابات الاعتماد كلِّها والتنفيذيِّ فوق سقفه.
       وسدادُه **على دفعات** (`payments[]`): يبقى مفتوحاً «بانتظار السداد» حتى
       يكتمل مبلغُه — وكلُّ دفعةٍ بإيصالها، وما خرج منه مصروفٌ منذ خروجه.
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

var MODULE_BUILD = "v18.9.2968";

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
  pay_order: { key:"pay_order", lbl:"أمر دفع",         icon:"banknote", hint:"مبلغٌ يُسدَّد دفعةً واحدةً أو على دفعات" }
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

/* ── نوعُ الأعمال (تخصّصُ الطرف) — **قائمةٌ يُختار منها أو نصٌّ يُكتب** ──
   «النوع» أعلاه يقول **ماذا يكون** الطرف (مقاولٌ أم مورّد)، وهذا يقول **ماذا يعمل**
   (كهرباءَ أم تكييفاً أم عزلاً). المحوران مستقلّان تماماً: مقاولُ باطنٍ للكهرباء
   ومورّدُ موادَّ كهربائيةٍ يتشاركان التخصّصَ ويفترقان في النوع — ومن يبحث عن
   «مقاولي الكهرباء» يريد الأوّلَ وحدَه.

   **ولماذا القائمةُ والكتابةُ معاً؟** كتالوجٌ مغلقٌ يعني أن أوّلَ تخصّصٍ لم نتوقّعه
   يُسجَّل تحت «أخرى» فيضيع، ونصٌّ حرٌّ محضٌ يعني بعد سنةٍ سبعَ تهجئاتٍ لـ«تكييف»
   لا يجمعها مرشّح. فالقائمةُ هي الطريقُ المعبَّد، والكتابةُ مخرجُ الطوارئ —
   و`normTrade` تلمّ الاثنين: ما يُكتب مطابقاً لاسمٍ في القائمة **يصير مفتاحَها**
   لا تخصّصاً ثانياً بالاسم نفسِه.

   التخزينُ: `vendor.trades` مصفوفةُ نصوص — مفتاحٌ لاتينيٌّ لما جاء من القائمة،
   والنصُّ كما كُتب لما جاء يدوياً. واللاتينيُّ لا يصطدم بالعربيّ فلا لبس. */
var TRADES = [
  { key:"civil",        lbl:"أعمال مدنية وإنشائية" },
  { key:"plumbing",     lbl:"سباكة" },
  { key:"electrical",   lbl:"كهرباء" },
  { key:"hvac",         lbl:"تكييف وتبريد" },
  { key:"firefighting", lbl:"مكافحة حريق وإنذار" },
  { key:"lowCurrent",   lbl:"تيار خفيف (كاميرات وشبكات)" },
  { key:"elevators",    lbl:"مصاعد" },
  { key:"generators",   lbl:"مولّدات وأنظمة طوارئ" },
  { key:"solar",        lbl:"طاقة شمسية" },
  { key:"water",        lbl:"خزانات ومضخّات ومياه" },
  { key:"plaster",      lbl:"محارة وبياض" },
  { key:"tiling",       lbl:"بلاط وسيراميك ورخام" },
  { key:"paint",        lbl:"دهانات" },
  { key:"gypsum",       lbl:"جبس بورد وأسقف مستعارة" },
  { key:"finishes",     lbl:"تشطيبات عامة" },
  { key:"carpentry",    lbl:"نجارة وأبواب" },
  { key:"aluminum",     lbl:"ألوميتال وزجاج" },
  { key:"metalwork",    lbl:"حدادة وأعمال معدنية" },
  { key:"steel",        lbl:"هناجر وإنشاءات معدنية" },
  { key:"insulation",   lbl:"عزل مائي وحراري" },
  { key:"roads",        lbl:"طرق وأسفلت وأرصفة" },
  { key:"landscape",    lbl:"تنسيق حدائق وريّ" },
  { key:"cleaning",     lbl:"نظافة" },
  { key:"pestControl",  lbl:"مكافحة حشرات" },
  { key:"safety",       lbl:"سلامة ومعدات وقاية" },
  { key:"equipment",    lbl:"تأجير معدات" },
  { key:"transport",    lbl:"نقل ومناولة" },
  { key:"manpower",     lbl:"توريد عمالة" },
  { key:"materials",    lbl:"توريد مواد بناء" },
  { key:"elecSupply",   lbl:"توريد مواد كهربائية" },
  { key:"plumbSupply",  lbl:"توريد مواد صحية وسباكة" },
  { key:"hvacSupply",   lbl:"توريد مواد تكييف" },
  { key:"hardware",     lbl:"توريد عُدد وأدوات" },
  { key:"cleanSupply",  lbl:"توريد مواد نظافة" },
  { key:"furniture",    lbl:"أثاث وتجهيزات مكتبية" },
  { key:"itSupply",     lbl:"توريد حاسبات وطابعات" },
  { key:"printing",     lbl:"دعاية وطباعة" },
  { key:"consulting",   lbl:"استشارات وتصميم هندسي" }
];
var TRADE_LBL = (function(){ var m={}; TRADES.forEach(function(t){ m[t.key]=t.lbl; }); return m; })();
/* اسمُ التخصّص مطبَّعاً ⇐ مفتاحُه — به يلتقي المكتوبُ يدوياً بنظيره في القائمة. */
var TRADE_BY_NAME = (function(){ var m={}; TRADES.forEach(function(t){ m[normName(t.lbl)]=t.key; }); return m; })();

/* المفتاحُ القانونيُّ للتخصّص — كلُّ ما يعني الشيءَ نفسَه يعود بمفتاحٍ واحد.
   بدونه تصير «كهرباء» المكتوبةُ يدوياً تخصّصاً ثانياً غيرَ `electrical`، فيبحث
   المشتري عن مقاولي الكهرباء فلا يجد نصفَهم — وهو أسوأُ من ألّا يجد أحداً،
   لأنه يظنّ أنه رأى القائمةَ كاملة. النصُّ الحرُّ يُصدَّر بادئةً `~` فلا يصطدم بمفتاح. */
function normTrade(t){
  var s = String(t==null?"":t).trim();
  if(!s) return "";
  if(TRADE_LBL[s]) return s;
  var n = normName(s);
  if(!n) return "";
  return TRADE_BY_NAME[n] || ("~"+n);
}
/* التسميةُ المعروضة: مفتاحُ القائمة يُترجَم، والنصُّ الحرُّ يُعرَض كما كُتب. */
function tradeLabel(t){
  var s = String(t==null?"":t).trim();
  if(TRADE_LBL[s]) return TRADE_LBL[s];
  var k = normTrade(s);
  return TRADE_LBL[k] ? TRADE_LBL[k] : s;
}
/* تخصّصاتُ الطرف مقنّنةً: تُنقّى وتُزال تكراراتُها (بالمفتاح لا بالحرف) ويُحفَظ الترتيب. */
function vendorTrades(v){
  var raw = (v && Array.isArray(v.trades)) ? v.trades : [];
  var seen = {}, out = [];
  raw.forEach(function(t){
    var k = normTrade(t); if(!k || seen[k]) return;
    seen[k] = true;
    out.push(TRADE_LBL[k] ? k : String(t).trim());
  });
  return out;
}
/* مرشّحٌ فارغٌ يعني «الكلّ» — لا «من لا تخصّصَ له». */
function vendorHasTrade(v, trade){
  var k = normTrade(trade); if(!k) return true;
  return vendorTrades(v).some(function(x){ return normTrade(x) === k; });
}
/* **«مقاول ومورّد» مقاولٌ حقّاً ومورّدٌ حقّاً.** المطابقةُ الحرفيةُ كانت تُسقطه من
   نتيجة «أرِني المقاولين» — فيبحث المشتري عمّن يعرف أنه موجودٌ فلا يجده. */
function kindMatches(v, kind){
  if(!kind) return true;
  var k = (v && v.kind) || "subcontractor";
  if(k === kind) return true;
  return k === "both" && (kind === "subcontractor" || kind === "supplier");
}
/* خياراتُ المرشّح = الكتالوجُ + **ما كُتب يدوياً فعلاً** في السجل.
   كتالوجٌ وحدَه يجعل التخصّصَ المكتوبَ يدوياً غيرَ قابلٍ للترشيح أصلاً — فيصير
   بابُ الكتابة اليدوية بابَ دفنٍ لا بابَ مرونة. */
function tradeOptions(list){
  var pool = Array.isArray(list) ? list : _vendors;
  var seen = {};
  var out = TRADES.map(function(t){ seen[t.key]=true; return { key:t.key, lbl:t.lbl, custom:false }; });
  (pool||[]).forEach(function(v){
    vendorTrades(v).forEach(function(t){
      var k = normTrade(t); if(!k || seen[k]) return;
      seen[k] = true; out.push({ key:t, lbl:tradeLabel(t), custom:true });
    });
  });
  return out;
}
/* الدالّةُ النقيّةُ التي يقوم عليها الطلبُ كلُّه: «مقاولون أو موردون لنوع أعمالٍ
   معيّن». تقرؤها الشاشةُ ويقرؤها الفحص — فلا مرشّحَ ثانٍ يفترق عنها. */
function vendorsByTrade(trade, kind, list){
  var pool = Array.isArray(list) ? list : _vendors;
  return (pool||[]).filter(function(v){
    return kindMatches(v, kind) && vendorHasTrade(v, trade);
  });
}

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
  /* للصفتين معاً: للشخص آيبانٌ وعنوانٌ وطنيٌّ كما للمنشأة. وهما بلا انتهاءٍ عادةً
     فيبقى حقلُ التاريخ اختيارياً — ومحرّكُ الانتهاء لا يُنبّه على ما لا تاريخَ له. */
  { key:"bank",      lbl:"شهادة الحساب البنكي (الآيبان)", short:"آيبان",  noExpiry:true },
  { key:"natAddr",   lbl:"العنوان الوطني",             short:"عنوان",   noExpiry:true },
  { key:"other",     lbl:"مستند آخر",                  short:"مستند"    }
];
/* الوثائقُ المتاحةُ لصفةٍ بعينها: العامّةُ (بلا `entity`) + الخاصةُ بها. */
function docTypesFor(entityType){
  var e = normEntity(entityType);
  return DOC_TYPES.filter(function(d){ return !d.entity || d.entity === e; });
}
/* ── الوثيقةُ تقرأ بياناتها من فوقها ──
   أربعُ وثائقَ بياناتُها **مكتوبةٌ أصلاً** في البيانات الأساسية: السجلُّ التجاريُّ
   ورقمُه وانتهاؤه · الشهادةُ الضريبيةُ ورقمُها · الحسابُ البنكيُّ وآيبانُه · العنوانُ
   الوطنيّ. وإعادةُ كتابتها في صفّ الوثيقة ليست إزعاجاً فحسب: هي **مصدرُ حقيقةٍ ثانٍ**
   يفترق عن الأول بأوّل تصحيحٍ في أحدهما، فيُقرأ سجلٌّ تجاريٌّ في الأعلى وآخرُ أسفلَه.
   فتُشتقّ هنا اشتقاقاً — دالّةٌ نقيّةٌ واحدةٌ تقرؤها الشاشةُ والفحصُ معاً.

   و`canBank` شرطٌ في الآيبان لا زينة: الآيبانُ مقنَّعٌ لغير المخوَّل في كل شاشة،
   فملؤُه في خانةٍ ظاهرةٍ يكشفه لمن لا يراه — تسريبٌ من بابٍ خلفيّ. */
var DOC_AUTOFILL = {
  cr:      function(d){ return { number:(d.legal||{}).crNumber, expiry:(d.legal||{}).crExpiry }; },
  vat:     function(d){ return { number:(d.legal||{}).vatNumber }; },
  natAddr: function(d){ return { number:(d.legal||{}).nationalAddress }; },
  bank:    function(d){ return canBank() ? { number:(d.bank||{}).iban } : null; }
};
/* ما يُقترَح لهذه الوثيقة من بيانات الطرف — أو `null` إن لا شيء. */
function docAutoValue(type, vendorDraft){
  var f = DOC_AUTOFILL[type];
  if(!f) return null;
  var got = f(vendorDraft || {}) || {};
  var out = {};
  if(String(got.number||"").trim()) out.number = String(got.number).trim();
  if(String(got.expiry||"").trim()) out.expiry = String(got.expiry).trim();
  return Object.keys(out).length ? out : null;
}
/* ما يُكتب في الوثيقة فعلاً — بلا حقول المسوّدة المؤقّتة (`_file` جسمُ ملفٍّ حيٌّ
   ترفضه Firestore، و`_auto` شارةُ عرضٍ لا بيانات). القاعدةُ صريحة: **ما بدأ بشَرطةٍ
   سفليةٍ لا يُحفَظ** — فمن أضاف حقلَ مسوّدةٍ جديداً لا يحتاج تذكُّرَ تنقيته. */
function docsForSave(docs){
  return (Array.isArray(docs)?docs:[]).map(function(dc){
    var out = {};
    Object.keys(dc||{}).forEach(function(k){ if(k.charAt(0) !== "_") out[k] = dc[k]; });
    return out;
  });
}
/* يملأ **الفارغَ وحدَه** في صفوف الوثائق — ما كتبه المستخدمُ بيده لا يُدهَس أبداً،
   ولو خالف ما في الأعلى (قد يكون سجلاً فرعياً أو عنواناً ثانياً بقصد). */
function applyDocAutofill(vendorDraft){
  var d = vendorDraft || {};
  (Array.isArray(d.docs) ? d.docs : []).forEach(function(dc){
    if(!dc) return;
    var auto = docAutoValue(dc.type, d);
    if(!auto) return;
    if(auto.number && !String(dc.number||"").trim()){ dc.number = auto.number; dc._auto = true; }
    if(auto.expiry && !String(dc.expiry||"").trim()){ dc.expiry = auto.expiry; dc._auto = true; }
  });
  return d;
}
/* عكسُ الملء: يُسقط من صفٍّ **ما اشتُقّ له لنوعٍ سابق** — والمعيارُ أن تكون القيمةُ
   مطابقةً لاشتقاقِ ذلك النوع حرفياً. فما كتبه المستخدمُ بيده يبقى ولو خالف الأعلى،
   وما اشتُقّ لا يُترك في صفٍّ لم يعد يعنيه. نقيّةٌ عمداً: يفحصها `hail-tests.js`
   بلا متصفّح، فالخللُ هنا صامتٌ في الشاشة (رقمٌ صحيحُ الشكل تحت عنوانٍ خاطئ). */
function clearStaleDocAuto(dc, prevType, vendorDraft){
  if(!dc) return dc;
  var wasAuto = docAutoValue(prevType, vendorDraft) || {};
  if(wasAuto.number && String(dc.number||"") === wasAuto.number){ dc.number = ""; dc._auto = false; }
  if(wasAuto.expiry && String(dc.expiry||"") === wasAuto.expiry){ dc.expiry = ""; dc._auto = false; }
  return dc;
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

/* هل يجوز لهذا المبلغ مسارُ أمر الدفع المختصر **بلا إقرار**؟
   **دون** العتبة فقط. وفوقها لا يمرّ إلا **بإقرارٍ صريحٍ يُختم على الوثيقة**
   (`overThresholdAck` — طلبُ المالك): العتبةُ تبقى حاجزاً يمنع الانزلاقَ الصامت،
   والإقرارُ المسجَّلُ باسم صاحبه يفتح البابَ عمداً لا سهواً — والمبلغُ الكبيرُ
   يمرّ على بوّابات الاعتماد نفسِها (والتنفيذيِّ فوق سقفه) كأيّ التزام. */
function payOrderAllowed(value, threshold){
  var v = Number(value), t = Number(threshold);
  if(!isFinite(v) || !isFinite(t) || t<=0) return false;
  return v > 0 && v < t;
}

/* ════ سدادُ أمر الدفع على دفعات — الدوالُّ النقية ════   (طلبُ المالك)

   كان السدادُ ضربةً واحدة: `payment` واحدٌ يُغلق الطلب. والواقعُ أن أمرَ الدفع
   يُسدَّد نسبةً ثم نسبةً — فالمصدرُ الآن **مصفوفةُ `payments`**، ويبقى الأمرُ
   «بانتظار السداد» حتى يكتمل المبلغ فيُغلق. نهجُ سداد الدفعة المقدمة نفسُه.
   • `crqPaidTotal` — المسدَّدُ فعلاً: مجموعُ الدفعات؛ و`payment` القديمُ احتياطٌ
     للوثائق التي سبقت الدفعات، والمغلقُ القديمُ بلا أيّهما قيمتُه كلُّها.
   • `crqPayDue`   — المتبقّي المستحقّ. وبهما تقرأ الموازنةُ والرصيدُ المستعاض
     **ما خرج من الخزينة فعلاً** ولو كان الأمرُ ما زال مفتوحاً. */
function crqPaidTotal(req){
  var r = req || {};
  var sum = 0;
  (Array.isArray(r.payments) ? r.payments : []).forEach(function(p){
    sum += Number((p||{}).amount) || 0;
  });
  if(sum > 0) return r2(sum);
  if(r.payment && r.payment.amount != null) return r2(Number(r.payment.amount)||0);
  return r.status === "crq_paid" ? r2(Number(r.value)||0) : 0;
}
function crqPayDue(req){
  var r = req || {};
  return r2(Math.max(0, r2(Number(r.value)||0) - crqPaidTotal(r)));
}

/* ════ خطةُ صرف الدفعات — **منشئُ الطلب هو من يحدّدها** ════   (طلبُ المالك)

   نسبُ الدفعات ليست قرارَ المالية: المنشئُ يكتبها في الطلب نفسِه (٥٠٪ ثم ٥٠٪…)
   فيوقّع المعتمِدون عليها مع القيمة، والماليةُ **تنفّذ الدفعةَ التالية وفق الخطة
   حرفياً** — «مُسدِّدةٌ لا مُقرِّرة»، وهو مبدأُ الوحدة نفسُه في كل بوّابة.
   • `normPaymentPlan` — تطبيعُ الخطة: نسبٌ موجبةٌ وحدَها (تقبل أرقاماً أو {pct}).
   • `paymentPlanOk`   — الخطةُ الصالحة: دفعةٌ فأكثر ومجموعُها ١٠٠٪ بالضبط.
   • `crqPlanInstallment` — الدفعةُ التالية المستحقّة: مبلغُها نسبتُها من القيمة،
     و**الأخيرةُ تلتهم فروقَ التقريب** فتساوي المتبقّي بالضبط — فلا يبقى في
     الأمر هللةٌ عالقةٌ لا تُغلقه ولا تُصرف. لا خطةَ على الوثيقة ⇒ null
     (مبلغٌ حرّ — سلوكُ الوثائق القديمة ومسارات الـAPI). */
function normPaymentPlan(plan){
  return (Array.isArray(plan)?plan:[]).map(function(p){
    return r2(Number((p && p.pct != null) ? p.pct : p) || 0);
  }).filter(function(p){ return p > 0; });
}
function paymentPlanOk(plan){
  var l = normPaymentPlan(plan);
  if(!l.length) return false;
  var s = 0; l.forEach(function(p){ s += p; });
  return Math.abs(r2(s) - 100) <= 0.01;
}
function crqPlanInstallment(req){
  var r = req || {};
  var plan = normPaymentPlan(r.paymentPlan);
  if(!plan.length) return null;
  var i = Array.isArray(r.payments) ? r.payments.length : 0;
  var due = crqPayDue(r);
  if(i >= plan.length || due <= 0) return null;   // استُنفدت الخطة أو اكتمل السداد
  if(i === plan.length - 1) return { index:i, count:plan.length, pct:plan[i], amount:due };
  return { index:i, count:plan.length, pct:plan[i],
           amount: Math.min(due, r2(r2(Number(r.value)||0) * plan[i] / 100)) };
}

/* نسبةُ السداد المئوية — نقيّةٌ تُفحص بلا متصفّح: المسدَّدُ من قيمة الأمر،
   مسقوفةٌ بـ١٠٠ (سدادٌ زائدٌ لا يرسم شريطاً فائضاً)، وقيمةٌ صفريةٌ ⇒ صفر. */
function crqPaidPct(req){
  var r = req || {};
  var v = r2(Number(r.value)||0);
  if(v <= 0) return 0;
  return Math.min(100, r2(crqPaidTotal(r) * 100 / v));
}

/* شريطُ نسبة السداد على أمر الدفع (طلبُ المالك: النسبةُ واضحةٌ لا مدفونةٌ في
   الأرقام) — يظهر متى كانت للأمر خطةُ دفعاتٍ أو سدادٌ فعليّ: شريطُ تقدّمٍ
   ونسبةٌ مئويةٌ والمتبقّي، وفي البطاقة الكاملة الدفعةُ القادمةُ من الخطة.
   compact لبلاطة القائمة، والكاملُ لبطاقة الطلب. */
function payProgressHTML(r, compact){
  if(!r || r.engagement !== "pay_order") return "";
  var plan = normPaymentPlan(r.paymentPlan);
  var paid = crqPaidTotal(r);
  if(!plan.length && paid <= 0) return "";
  var pct  = crqPaidPct(r);
  var done = r.status === "crq_paid" || crqPayDue(r) <= 0;
  var inst = crqPlanInstallment(r);
  var lbl;
  if(done) lbl = 'سُدِّد <span class="num">100</span>٪ — اكتمل ✓';
  else{
    lbl = 'المسدَّد <span class="num">'+pct+'</span>٪ — بقي <span class="num">'+money(crqPayDue(r))+'</span> ر.س';
    if(!compact && inst)
      lbl += ' · الدفعة القادمة <span class="num">'+inst.pct+'</span>٪ (<span class="num">'+money(inst.amount)+'</span> ر.س — دفعة '+(inst.index+1)+' من '+inst.count+')';
  }
  return '<div class="ct-payprog'+(compact?' sm':'')+(done?' done':'')+'">'+
    '<span class="bar"><i style="width:'+pct+'%"></i></span>'+
    '<span class="t">'+lbl+'</span>'+
  '</div>';
}

/* ════ تفقيطُ المبلغ — «المبلغُ كتابةً» على أمر الدفع ════

   ورقةُ صرفٍ تحمل رقماً وحدَه ورقةٌ يكفي فيها قلمٌ لتصير عشرةَ أضعافها. ولذلك
   يكتب كلُّ سند صرفٍ المبلغَ **مرّتين**: رقماً وكتابةً — فلا يُغيَّر أحدُهما دون
   أن يفضحه الآخر. والتفقيطُ **دالّةٌ نقيةٌ واحدة** يقرؤها المخرَجُ الورقيّ، ويحرسها
   فحصٌ في `hail-tests` — فلا تُكتَب نسخةٌ ثانيةٌ تنحرف عن الأولى.
   والهللاتُ تُقرَّب بـ`r2` نفسِها التي تحسب الإجماليّ، فلا يفترق المكتوبُ عن المرسوم. */
var AW_ONES = ["","واحد","اثنان","ثلاثة","أربعة","خمسة","ستة","سبعة","ثمانية","تسعة","عشرة",
               "أحد عشر","اثنا عشر","ثلاثة عشر","أربعة عشر","خمسة عشر","ستة عشر","سبعة عشر",
               "ثمانية عشر","تسعة عشر"];
var AW_TENS = ["","","عشرون","ثلاثون","أربعون","خمسون","ستون","سبعون","ثمانون","تسعون"];
var AW_HUND = ["","مائة","مائتان","ثلاثمائة","أربعمائة","خمسمائة","ستمائة","سبعمائة","ثمانمائة","تسعمائة"];
/* أسماءُ المراتب بصيغها العربية الأربع (مفردٌ · مثنّى · جمعُ قلّةٍ ٣–١٠ · تمييزٌ مفرد) */
var AW_GROUPS = [ null,
  { one:"ألف",   two:"ألفان",    few:"آلاف",    many:"ألفاً" },
  { one:"مليون", two:"مليونان",  few:"ملايين",  many:"مليوناً" },
  { one:"مليار", two:"ملياران",  few:"مليارات", many:"ملياراً" } ];

function awUnder1000(n){
  var out = [], h = Math.floor(n/100), r = n%100;
  if(h) out.push(AW_HUND[h]);
  if(r < 20){ if(r) out.push(AW_ONES[r]); }
  else {
    var o = r%10, t = Math.floor(r/10);
    out.push(o ? (AW_ONES[o]+" و"+AW_TENS[t]) : AW_TENS[t]);
  }
  return out.join(" و");
}
function awGroup(n, g){
  if(!g) return awUnder1000(n);
  if(n === 1) return g.one;
  if(n === 2) return g.two;
  if(n <= 10) return awUnder1000(n)+" "+g.few;
  return awUnder1000(n)+" "+g.many;
}
function amountWords(value){
  var num = Number(value);
  if(!isFinite(num)) num = 0;
  var neg = num < 0;
  num = r2(Math.abs(num));
  var whole = Math.floor(num), cents = Math.round((num - whole)*100);
  if(cents >= 100){ whole += 1; cents = 0; }
  // فوق سقف المراتب الأربع لا نخترع اسماً: نعيد الرقم كما هو بدل نصٍّ مغلوط
  if(whole >= 1e12) return money(num)+" ريال";
  var parts = [], i = 0, x = whole;
  while(x > 0){
    var grp = x % 1000; x = Math.floor(x/1000);
    if(grp) parts.unshift(awGroup(grp, AW_GROUPS[i]));
    i++;
  }
  var out = awMoneyPhrase(whole, parts.join(" و"), AW_RIYAL);
  if(cents > 0) out += " و" + awMoneyPhrase(cents, awUnder1000(cents), AW_HALALA);
  return (neg ? "سالب " : "") + out + " لا غير";
}
/* صيغةُ اسم العملة تتبع العددَ لا العكس: **ريالٌ واحد** · **ريالان** · ثلاثةُ
   **ريالاتٍ** · وما فوق العشرة «ريال». والواحدُ والاثنان يبتلعان عددَهما فلا
   يُكتب «واحد ريال» ولا «اثنان ريال» — وهي أوّلُ ما يكشف ورقةً كتبتها آلة. */
var AW_RIYAL  = { one:"ريال واحد", two:"ريالان",  few:"ريالات", plain:"ريال" };
var AW_HALALA = { one:"هللة واحدة", two:"هللتان", few:"هللات",  plain:"هللة" };
function awMoneyPhrase(n, numeral, f){
  if(n === 1) return f.one;
  if(n === 2) return f.two;
  return (numeral || "صفر") + " " + ((n >= 3 && n <= 10) ? f.few : f.plain);
}

/* ════ غرامةُ التأخير — **بالريال** ════   (طلبُ المالك)

   كانت نسبةً من قيمة العقد. والنسبةُ رقمٌ لا يراه أحد: المقاولُ يفاوض على ريالاتٍ
   في اليوم، والمهندسُ يريد أن يقرأ في الوثيقة المبلغَ الذي اتُّفق عليه لا نسبةً
   يحسبها في رأسه عند كل مطالبة. فصارت الغرامةُ **مبلغاً يومياً وسقفاً بالريال**.

   **والوثائقُ القديمةُ لا تُكسَر.** عقودٌ سارية وطلباتٌ قائمةٌ خُزِّنت بالنسبة —
   وتحويلُها حسابياً عند القراءة كان سيغيّر أرقاماً وقّع عليها الطرفان. فالوسمُ
   (`mode`) يحفظ لكلّ وثيقةٍ لغتَها: القديمةُ تُقرأ نسبةً كما كُتبت، والجديدةُ
   ريالاً. وكلُّ حسابٍ في الوحدة يمرّ بهاتين الدالّتين — فلا موضعان يفترقان. */
function penaltyIsPct(pen){
  var p = pen || {};
  if(p.mode === "amount") return false;
  if(p.mode === "pct")    return true;
  // بلا وسمٍ: وثيقةٌ قديمةٌ إن حملت نسبةً، وإلا فالافتراضُ الجديدُ بالريال
  return (Number(p.perDayPct)||0) > 0 || (Number(p.capPct)||0) > 0;
}
function penaltyPerDay(pen, contractVal){          // ريالاً عن كل يوم تأخير
  var p = pen || {};
  return penaltyIsPct(p) ? r2((Number(contractVal)||0) * (Number(p.perDayPct)||0) / 100)
                         : r2(Number(p.perDayAmount)||0);
}
function penaltyCap(pen, contractVal){             // سقفُ الغرامة بالريال (٠ = بلا سقف)
  var p = pen || {};
  return penaltyIsPct(p) ? r2((Number(contractVal)||0) * (Number(p.capPct)||0) / 100)
                         : r2(Number(p.capAmount)||0);
}
/* التطبيعُ عند الحفظ: يُثبَّت الوسمُ صراحةً فلا تبقى وثيقةٌ تُخمَّن لغتُها. */
function normPenalty(pen){
  var p = pen || {};
  return penaltyIsPct(p)
    ? { mode:"pct",    perDayPct:Number(p.perDayPct)||0,       capPct:Number(p.capPct)||0 }
    : { mode:"amount", perDayAmount:Number(p.perDayAmount)||0, capAmount:Number(p.capAmount)||0 };
}
/* نصُّ الغرامة المعروض — مصدرٌ واحدٌ تقرؤه البطاقتان والوثيقةُ الورقية. */
function penaltyText(pen, contractVal){
  var p = pen || {};
  if(penaltyIsPct(p)){
    var pd = Number(p.perDayPct)||0, cp = Number(p.capPct)||0;
    if(pd <= 0) return "—";
    return pd+"٪ من قيمة العقد يومياً"+(cp>0 ? " — سقف "+cp+"٪ ("+money(penaltyCap(p, contractVal))+" ر.س)" : " — بلا سقف");
  }
  var pda = Number(p.perDayAmount)||0, ca = Number(p.capAmount)||0;
  if(pda <= 0) return "—";
  return money(pda)+" ر.س يومياً"+(ca>0 ? " — سقف "+money(ca)+" ر.س" : " — بلا سقف");
}

/* توجيهُ طلب التعاقد وأمرِ الدفع معاً — **مصدرُ الحقيقة الوحيد للتسلسل**.

   • العقد:      مدير المشاريع ← المشتريات ← المالية ← (التنفيذي فوق السقف) ← معتمَد.
   • أمرُ الدفع: مدير المشاريع ← **المشتريات** ← (التنفيذي فوق السقف) ← سدادُ المالية.

   بوّابةُ المشتريات في أمر الدفع (طلبُ المالك v18.9.2553): كانت مُتخطّاةً بحجّة «لا
   نطاقَ يُراجَع ولا شروطَ تجارية» — وهي حجّةٌ تنظر إلى الورقة لا إلى المال. فأمرُ
   الدفع **صرفٌ لطرفٍ خارجيّ**، ومراجعةُ المشتريات هي التي تسأل: أهذا الطرفُ صحيحٌ
   وسعرُه معقول؟ ولا يُعوّضها اعتمادُ مدير المشاريع (يراجع الحاجةَ لا التوريد) ولا
   سدادُ المالية (يُنفّذ ولا يُقرّر).
   وتبقى المالية في أمر الدفع **مُسدِّدةً لا مُعتمِدة**: بوّابةُ اعتمادِها للشروط
   التجارية والمحتجز — ولا شروطَ في أمر الدفع. فالمسارُ يزيد بوّابةً واحدةً لا اثنتين.
   وبوّابةُ التنفيذي على حالها: السقفُ سقفُ المال لا سقفُ نوع الورقة.
   والمسارُ يبقى دالةً واحدةً فلا يفترق فرعان بصمت. */
function crqNextStage(req, ceoThreshold){
  var r = req || {};
  var isPay = r.engagement === "pay_order";
  if(!r.pmApprovedAt) return "crq_pending_pm";
  if(!r.procApprovedAt)              return "crq_pending_proc";
  if(!isPay && !r.financeApprovedAt) return "crq_pending_finance";
  var amt = Number(r.value); if(!isFinite(amt)) amt = 0;
  var th  = Number(ceoThreshold); if(!isFinite(th)) th = 0;
  // اعتمادُ التنفيذي يسقط إن رُفعت القيمةُ فوق ما اعتمده — فلا يمرّ مبلغٌ أكبرُ
  // ممّا رآه على توقيعٍ قديم (حارسُ hr-payments نفسُه).
  var ceoOk = !!r.ceoApprovedAt && amt <= (Number(r.ceoApprovedAmount)||0) + 0.01;
  if(th > 0 && amt >= th && !ceoOk) return "crq_pending_ceo";
  return isPay ? "crq_pending_pay" : "crq_approved";
}

/* ════ الإرجاعُ إلى بوّابةٍ محدّدة — للأدمن ════   (طلبُ المالك)

   **الفجوة.** «رفض/إعادة» يُرجع الطلبَ إلى **مُنشئه** دائماً: خطوةٌ واحدةٌ إلى
   الخلف مهما كان الخطأ. فإن اكتُشف بعد اعتماد التنفيذيِّ أن المشتريات وقّعت على
   مرشَّحٍ خطأ، لم يكن أمام الأدمن إلا إلغاءُ الطلب وإعادةُ إنشائه من الصفر —
   فيضيع خطُّه الزمنيُّ ورقمُه ومرفقاتُه، ويُعاد كلُّ اعتمادٍ صحيحٍ بلا سبب.

   **الآلية — بلا آلةِ حالاتٍ ثانية.** الإرجاعُ ليس حالةً جديدةً تُضاف، بل **مسحُ
   اعتماداتِ البوّابة المقصودة وما بعدها**؛ ثمّ `crqNextStage` وحدَها تقرّر أين يقف
   الطلب. فمصدرُ الحقيقة يبقى واحداً، ويستحيل أن يقف الطلبُ في مكانٍ لا تعرفه.

   **وقائمةُ الوجهات تُشتقّ لا تُكتب.** لكلّ طلبٍ مسارُه: أمرُ الدفع بلا بوّابةِ
   اعتمادٍ ماليّ، وما دون سقف التنفيذيِّ بلا بوّابته. فالوجهةُ تُقبَل إن كانت
   الآلةُ **ستقف عندها فعلاً** — نجرّبها ونسأل النتيجة، فلا نَعِد ببوّابةٍ يقفز
   الطلبُ فوقها فيبدو الإرجاعُ كذباً. */
/* **مصدرٌ واحدٌ للمستندات الثلاثة** (الطلب · المستخلص · أمر التغيير): حقولُ
   الاعتماد فيها متطابقةُ الأسماء (`pmApprovedAt`…)، ولا يفترق بعضُها عن بعضٍ إلا
   في شيئين — **ترتيبِ بوّاباته** و**دالّةِ توجيهه**. فيُمرَّران وسيطين، ويبقى
   المنطقُ نسخةً واحدةً: ثلاثُ نسخٍ منه كانت ستنحرف عند أوّل تعديل. */
var GATE_ORDER = ["pm","proc","finance","ceo"];
var GATE_STATUS_OF = { pm:"crq_pending_pm", proc:"crq_pending_proc",
                       finance:"crq_pending_finance", ceo:"crq_pending_ceo" };
var EXT_ORDER = ["pm","ceo"];
var EXT_STATUS_OF = { pm:"ext_pending_pm", ceo:"ext_pending_ceo" };
var CHG_ORDER = ["pm","proc","finance","ceo"];
var CHG_STATUS_OF = { pm:"chg_pending_pm", proc:"chg_pending_proc",
                      finance:"chg_pending_finance", ceo:"chg_pending_ceo" };
function docRewind(doc, gateKey, order, nextStage){
  if(order.indexOf(gateKey) < 0) return null;
  var r = Object.assign({}, doc || {});
  order.slice(order.indexOf(gateKey)).forEach(function(k){
    r[k+"ApprovedAt"]=null; r[k+"ApprovedBy"]=null; r[k+"ApprovedByUser"]=null;
    if(k==="proc")    r.procApprovedKey=null;
    if(k==="finance") r.financeApprovedKey=null;
    if(k==="ceo")     r.ceoApprovedAmount=null;
  });
  r.status = nextStage(r);
  return r;
}
/* الوجهاتُ المتاحة: ما تقف عندها الآلةُ فعلاً، وما يُغيّر الحالةَ الحاليةَ حقاً. */
function docRewindTargets(doc, order, statusOf, nextStage){
  var cur = (doc||{}).status;
  return order.filter(function(k){
    var probe = docRewind(doc, k, order, nextStage);
    return probe && probe.status === statusOf[k] && probe.status !== cur;
  });
}
function crqRewind(req, gateKey, ceoTh){
  return docRewind(req, gateKey, GATE_ORDER, function(r){ return crqNextStage(r, ceoTh); });
}
function crqRewindTargets(req, ceoTh){
  return docRewindTargets(req, GATE_ORDER, GATE_STATUS_OF, function(r){ return crqNextStage(r, ceoTh); });
}
/* المستخلصُ: بوّابتان (مدير المشاريع ثمّ التنفيذيُّ فوق السقف) — وتوجيهُه يحتاج
   **صافيَ المستخلص** لا قيمةً مخزَّنة، فيُمرَّر مع الوسيط. */
function extRewind(ext, gateKey, net, ceoTh){
  return docRewind(ext, gateKey, EXT_ORDER, function(e){ return extNextStage(e, net, ceoTh); });
}
function extRewindTargets(ext, net, ceoTh){
  return docRewindTargets(ext, EXT_ORDER, EXT_STATUS_OF, function(e){ return extNextStage(e, net, ceoTh); });
}
function chgRewind(chg, gateKey, ceoTh){
  return docRewind(chg, gateKey, CHG_ORDER, function(g){ return chgNextStage(g, ceoTh); });
}
function chgRewindTargets(chg, ceoTh){
  return docRewindTargets(chg, CHG_ORDER, CHG_STATUS_OF, function(g){ return chgNextStage(g, ceoTh); });
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
    penaltyIsPct(pn)?"pct":"amount", r2(pn.perDayPct), r2(pn.capPct),
    r2(pn.perDayAmount), r2(pn.capAmount), r2(w.months), r2(r.durationDays)
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

/* ── حصرُ العرض بمشروع التشغيل الحالي (طلبُ المالك: كلُّ مشروعٍ يرى تعاقداتِه
   وطلباتِه وحدَها) ──
   المجموعاتُ `global_*` تبقى عامدةً بمستمعٍ واحدٍ حيٍّ عبر تبديل المشاريع
   (قرارُ v18.9sz — فكُّ المستمعين وإعادةُ تركيبهم يراكم خلل ca9/b815)، فالحصرُ
   **عرضيٌّ وقتَ الرسم** كالمشتريات لا في الاستعلام. القاعدة — دالةٌ نقيةٌ تُختبَر
   وحدَها:
   • الوثيقةُ الرسمية: مشروعُها `projectId` هو الفيصل — طلبٌ سُجِّل على مشروعٍ
     يظهر عنده أياً كان المشروعُ المفتوحُ لحظةَ إنشائه.
   • اليدويةُ (بلا مشروعٍ رسميّ): **في المشتريات المركزية وحدَها** — قرارُ المالك
     بعد v18.9.2905: المشروعُ اليدويُّ ليس جزءاً من أيّ مشروعِ تشغيل، فوثائقُه
     تُدار من الوضع المركزيّ ولا تظهر داخل المشاريع (وسطرُ نطاقٍ في القائمتين
     يقول أين هي — فالغيابُ بلا تفسيرٍ يُقرأ فقداً في البيانات).
   • بلا مشروعٍ حاليٍّ (وضعٌ مركزيّ/شاشاتٌ عامة): الكل. */
function ctDocInTenant(d, tenantId){
  if(!tenantId || !d) return true;
  var manual = d.isCustomProject === true || d.projectId === MANUAL_ID || !d.projectId;
  if(manual) return false;
  return d.projectId === tenantId;
}
function _tenantId(){
  try{ return (typeof CURRENT_PROJECT!=="undefined" && CURRENT_PROJECT && CURRENT_PROJECT.id) || ""; }
  catch(e){ return ""; }
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

/* ════ فصلُ المهام: من اعتمد بوّابةً لا يعتمد التاليةَ ════   (طلبُ المالك)

   **العلّة.** الأدمن عضوٌ في كلّ بوّابة (عمداً — «مديرُ المشاريع هو نفسُه الأدمن»).
   فبعد أن يعتمد كمدير مشاريع يظهر له زرُّ الاعتماد ثانيةً — للمشتريات هذه المرّة —
   فيمرّر الطلبَ من الإنشاء إلى السداد بنقراتٍ متتالية. والبوّاباتُ الأربعُ حينها
   أربعُ نسخٍ من رأيٍ واحد: صُورةُ رقابةٍ بلا رقابة.

   **القاعدة.** من وقّع بوّابةً لا يوقّع التاليةَ على **الطلب نفسِه**.

   **والمهرب — شرطُ ألّا تتحوّل القاعدةُ إلى تعطيل.** في فريقٍ لا ثانيَ فيه لتلك
   البوّابة يصير المنعُ باباً مسدوداً: الطلبُ يقف بلا أحدٍ يحرّكه. فالمنعُ مشروطٌ
   **بوجود شخصٍ آخرَ يملك البوّابة فعلاً**؛ وإلا بقي الزرُّ وسُجِّل الاعتمادُ
   **«نيابةً»** في الخطّ الزمني — فالقيدُ يظهر في السجلّ ولو لم يمنع.

   **حدُّها الصريح.** هذا ضبطٌ إجرائيٌّ لا حاجزٌ أمنيّ: الأدمن يملك القاعدةَ نفسَها
   ويستطيع تجاوزَه من أدوات المطوّر. غايتُه أن يجعل تجاوزَ الفصل **فعلاً واعياً
   مسجَّلاً** لا نقرةً عابرة. والرفضُ/الإعادة لا يُمنع أبداً — لا يراكم سلطةً،
   ومنعُه كان سيحبس الطلبَ بلا مخرج. */
var APPROVAL_KEYS = ["pm","proc","finance","ceo"];
function crqApprovers(req){
  var r = req || {}, out = [];
  APPROVAL_KEYS.forEach(function(k){
    if(!r[k+"ApprovedAt"]) return;
    out.push({ user:String(r[k+"ApprovedByUser"]||""), name:String(r[k+"ApprovedBy"]||"") });
  });
  return out;
}
/* المطابقةُ **باسم الدخول** أوّلاً — مستقرٌّ لا يتغيّر بتعديل الاسم المعروض؛
   وبالاسم المعروض للوثائق التي خُزِّنت قبل إضافة الحقل (وإلا سقط القيدُ عنها بصمت). */
function crqAlreadyApproved(req, meUser, meName){
  var u = String(meUser||""), n = String(meName||"");
  return crqApprovers(req).some(function(a){
    return (a.user && u && a.user === u) || (!a.user && a.name && n && a.name === n);
  });
}
function crqOtherGateHolder(status, meUser, users){ return gateOtherHolder(GATE_ROLES, status, meUser, users); }
function gateOtherHolder(gates, status, meUser, users){
  var g = gates[status]; if(!g) return false;
  var me = String(meUser||"");
  return (Array.isArray(users)?users:[]).some(function(u){
    return u && u.role && g.roles.indexOf(u.role) !== -1 && String(u.user||"") !== me;
  });
}
/* القرارُ الواحد الذي تقرؤه الشاشةُ **وطبقةُ البيانات** — فلا ينحرف زرٌّ عن قاعدة:
   "none" ليست لدورك · "act" اعتمادٌ عاديّ · "delegate" اعتمادٌ نيابةً (لا ثانيَ
   يملك البوّابة) · "blocked" ممنوعٌ لأنك وقّعت بوّابةً سابقة وغيرُك يملك هذه. */
function gateActMode(gates, doc, status, role, meUser, meName, users){
  var g = gates[status];
  if(!g || g.roles.indexOf(role) === -1) return "none";
  if(!crqAlreadyApproved(doc, meUser, meName)) return "act";
  return gateOtherHolder(gates, status, meUser, users) ? "blocked" : "delegate";
}
function crqActMode(req, status, role, meUser, meName, users){
  return gateActMode(GATE_ROLES, req, status, role, meUser, meName, users);
}
/* المستخلصُ وأمرُ التغيير تحت القاعدة نفسِها — بل المستخلصُ أولاها: هو موضعُ خروج
   المال شهرياً لا مرّةً واحدة. (حقولُ الاعتماد متطابقةُ الأسماء فتُقرأ بالدالّة نفسِها.) */
function extActMode(ext, status, role, meUser, meName, users){
  return gateActMode(EXT_GATES, ext, status, role, meUser, meName, users);
}
function chgActMode(chg, status, role, meUser, meName, users){
  return gateActMode(CHG_GATES, chg, status, role, meUser, meName, users);
}
function crqIsFinal(s){ return CRQ_FINAL.indexOf(s) !== -1; }
function crqIsBounced(s){ return CRQ_BOUNCED.indexOf(s) !== -1; }

/* ════ أمرُ الدفع ورقةً — الحالةُ والتوقيعات ════

   دالّتان نقيّتان يقرؤهما المخرَجُ الورقيُّ وحدَه، وسببُ وجودهما أن الورقةَ تخرج من
   المنصّة فتُصدَّق وتُصرَف بها الأموال — فيجب أن تقول عن نفسها الصدقَ بلا وسيط.

   • `payOrderPrintState` — **أهمُّ سطرٍ في الورقة**: أمرُ دفعٍ لم تكتمل بوّاباتُه
     يُطبَع، نعم (للمراجعة والتمرير)، لكنه يخرج موسوماً **«غير صالحٍ للصرف»** —
     ومنعُ طباعته كان سيدفع الناسَ إلى تصوير الشاشة، وهو أسوأُ: صورةٌ بلا وسم.
   • `payOrderSignoffs` — التوقيعاتُ **مشتقّةٌ من حقول الاعتماد نفسِها** التي تقرؤها
     `crqNextStage`، لا من قائمةٍ مكتوبةٍ هنا: فلا تطبع الورقةُ بوّابةً لم يمرّ بها
     الأمرُ، ولا تُسقط بوّابةً مرّ بها. وبوّابةُ التنفيذيِّ تظهر إن اعتمد فعلاً أو
     كان المبلغُ يبلغ سقفَه — بالقاعدة نفسِها التي تُوقف الطلبَ عندها. */
function payOrderPrintState(req){
  var st = (req||{}).status;
  if(st === "crq_paid")
    return { key:"paid",  cls:"ok",   lbl:"مسدَّد — مغلق",
             note:"سُدِّد هذا الأمر وأُغلق. هذه نسخةٌ للحفظ لا أمرُ صرفٍ جديد." };
  if(st === "crq_pending_pay"){
    // المسدَّدُ جزئياً يقولها الورقةُ بصراحة — فلا يُصرَف المتبقّي مرتين على سندٍ
    // يوحي أن شيئاً لم يُدفع بعد.
    var _pp = crqPaidTotal(req);
    if(_pp > 0)
      return { key:"due", cls:"ok", lbl:"معتمَد — سُدِّد جزئياً",
               note:"سُدِّد "+money(_pp)+" ر.س والمتبقّي "+money(crqPayDue(req))+
                    " ر.س. الأمرُ مفتوحٌ حتى اكتمال السداد — لا يُصرَف فوق المتبقّي." };
    return { key:"due",   cls:"ok",   lbl:"معتمَد — صالحٌ للصرف",
             note:"اكتملت بوّاباتُ الاعتماد. للمالية صرفُه وتسجيلُ إيصاله على المنصّة." };
  }
  if(st === "crq_cancelled")
    return { key:"void",  cls:"bad",  lbl:"ملغى — لا يُصرَف",
             note:"أُلغي هذا الأمر على المنصّة. أيُّ نسخةٍ منه لاغيةٌ." };
  if(crqIsBounced(st))
    return { key:"void",  cls:"bad",  lbl:(CRQ_STATUS[st]||"مُعاد للتصحيح")+" — لا يُصرَف",
             note:"أُعيد هذا الأمر إلى مُنشئه للتصحيح، فلا يُصرَف بصيغته هذه." };
  if(crqIsFinal(st))
    return { key:"void",  cls:"bad",  lbl:(CRQ_STATUS[st]||"منتهٍ")+" — لا يُصرَف", note:"" };
  return { key:"draft", cls:"warn", lbl:"قيد الاعتماد — غير صالحٍ للصرف",
           note:"لم تكتمل بوّاباتُ الاعتماد بعد. هذه نسخةُ مراجعةٍ لا أمرُ صرف." };
}
/* بوّاباتُ الطلب موقّعةً — **مصدرٌ واحدٌ للورقتين** (سندُ صرف أمر الدفع ومسودةُ
   العقد). ومسمّياتُها تُقرأ من `GATE_ROLES` نفسِها التي تحرس الأزرار، فلا تُسمّى
   بوّابةٌ على الورق باسمٍ غيرِ اسمها على الشاشة. */
function crqSignoffs(req, ceoTh){
  var r = req || {};
  var isPay = r.engagement === "pay_order";
  var amt = Number(crqValueOf(r)); if(!isFinite(amt)) amt = 0;
  var th  = Number(ceoTh);         if(!isFinite(th))  th  = 0;
  var lbl = function(k){ return (GATE_ROLES[GATE_STATUS_OF[k]] || {}).lbl || k; };
  var cell = function(k){
    return { key:k, lbl:lbl(k), by:r[k+"ApprovedBy"] || "", at:r[k+"ApprovedAt"] || "" };
  };
  var out = [cell("pm"), cell("proc")];
  // الماليةُ في أمر الدفع **مُسدِّدةٌ لا مُعتمِدة** — فلا خانةَ اعتمادٍ لها فيه
  if(!isPay) out.push(cell("finance"));
  if(r.ceoApprovedAt || (th > 0 && amt >= th)) out.push(cell("ceo"));
  return out;
}
function payOrderSignoffs(req, ceoTh){
  var p = (req || {}).payment || {};
  return crqSignoffs(req, ceoTh).concat(
    [{ key:"pay", lbl:"المالية — السداد", by:p.by || "", at:p.at || "" }]);
}

/* ════ مسودةُ العقد في مراحل الاعتماد ════   (طلبُ المالك)

   **الفجوة.** المعتمِدون الأربعة يوقّعون على طلبٍ يعرض بنوداً وأرقاماً وشروطاً
   تجاريةً مختصرة — بينما ما سيوقّعه الطرفُ الآخرُ **وثيقةٌ كاملة**: نطاقٌ والتزاماتٌ
   وسلامةٌ وجزاءاتٌ وضمان. فالماليةُ تعتمد قيمةً لا تعرف بأيّ شروطٍ ستُصرف، ومديرُ
   المشاريع يعتمد نطاقاً لا يرى صياغتَه التي سيُحاسَب عليها المستخلص. وأوّلُ من يرى
   الوثيقةَ كاملةً اليومَ هو **المشتريات بعد اكتمال الاعتمادات** — حين لم يبقَ لأحدٍ
   اعتراض.

   **العلاج — ولا وثيقةَ ثانية.** المسودةُ ليست عرضاً موازياً يُصاغ هنا: هي
   `contractFromRequest` نفسُها (الدالّةُ التي ستُنشئ العقدَ فعلاً) مطبوعةً بورقة
   `contractPaperHTML` نفسِها. فما يراه المعتمِدُ اليومَ هو **ما سيخرج غداً حرفياً**،
   ولا سبيلَ لافتراقهما لأن لا نسخةَ ثانيةَ تفترق.

   **وتُعلن عن نفسها** بشريطٍ من `crqDraftState` — بالمنطق نفسِه الذي يحرس سندَ صرف
   أمر الدفع: ورقةٌ بلا وسمٍ تُصوَّر وتُرسَل فتُقرأ عقداً.

   **ولمن تظهر؟ للجميع وفي كلّ مرحلة.** لا بوّابةَ على القراءة: من يرى الطلبَ يرى
   مسودتَه — حجبُها عمّن لم يحن دورُه يجعله يعتمد على وصفٍ شفهيّ حين يحين. */
function crqDraftState(req){
  var r = req || {}, st = r.status;
  if(st === "crq_converted")
    return { key:"issued", cls:"ok",   lbl:"صار عقداً"+(r.contractId ? (" — "+r.contractId) : ""),
             note:"أُنشئ العقدُ من هذا الطلب، والوثيقةُ النافذةُ هي العقدُ نفسُه لا هذه المسودة." };
  if(st === "crq_approved")
    return { key:"ready",  cls:"ok",   lbl:"معتمَد — بانتظار إنشاء العقد",
             note:"اكتملت بوّاباتُ الاعتماد. هذه صورةُ العقد الذي سيُنشأ من هذا الطلب." };
  if(st === "crq_cancelled")
    return { key:"void",   cls:"bad",  lbl:"ملغى — لا يُتعاقَد به",
             note:"أُلغي الطلبُ على المنصّة، وأيُّ نسخةٍ من مسودته لاغية." };
  if(crqIsBounced(st))
    return { key:"void",   cls:"bad",  lbl:(CRQ_STATUS[st]||"مُعاد للتصحيح")+" — لا يُتعاقَد به",
             note:"أُعيد الطلبُ إلى مُنشئه للتصحيح، فلا يُوقَّع بصيغته هذه." };
  if(crqIsFinal(st))
    return { key:"void",   cls:"bad",  lbl:(CRQ_STATUS[st]||"منتهٍ")+" — لا يُتعاقَد به", note:"" };
  return { key:"draft",    cls:"warn", lbl:"مسودة — قيد الاعتماد ولا تُوقَّع",
           note:"لم تكتمل بوّاباتُ الاعتماد بعد. هذه نسخةُ مراجعةٍ للمعتمِدين لا عقدٌ نافذ." };
}

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
      /* الاستردادُ **يُنصّ عليه دائماً** — لا شرطَ يمنح سلفةً ويسكت عن ردّها. */
      body:"يُصرف للطرف الثاني دفعة مقدمة قدرها "+adv.pct+"٪ من قيمة العقد ("+money(advanceAmountOf(c))+" ريال)"+
           (Number(adv.recoveryPct)>0
             ? "، تُستردّ بخصم "+adv.recoveryPct+"٪ من قيمة أعمال كل مستخلص حتى استيفائها كاملة"
             : "، تُستردّ بالخصم من مستخلصات الطرف الثاني ابتداءً من أوّل مستخلص وبما يتّسع له، حتى استيفائها كاملة")+"." });
  }
  if(Number(ret.pct)>0){
    out.push({ key:"_fin_ret", category:"quality", title:"محتجز الضمان",
      body:"يُحتجز من قيمة أعمال كل مستخلص ما نسبته "+ret.pct+"٪ ضماناً لحسن التنفيذ، "+
           (ret.releaseOn==="warranty_end" ? "ويُفرج عنه بعد انتهاء مدة الضمان" : "ويُفرج عنه عند الاستلام الابتدائي للأعمال")+"." });
  }
  if(penaltyPerDay(pen, contractValue(c))>0){
    out.push({ key:"_fin_pen", category:"penalty", title:"غرامة التأخير",
      /* الوثيقةُ الورقيةُ تقول ما تقوله الشاشةُ بالضبط: الجديدُ ريالاً صريحاً،
         والقديمُ نسبةً **كما وُقِّع عليه** — ولا يُترجَم عقدٌ قائمٌ إلى لغةٍ أخرى. */
      body:"إذا تأخر الطرف الثاني عن إنجاز الأعمال في المدة المتفق عليها، تُطبَّق غرامة تأخير قدرها "+
           (penaltyIsPct(pen)
             ? (pen.perDayPct+"٪ من قيمة العقد عن كل يوم تأخير"+
                (Number(pen.capPct)>0 ? "، بحد أقصى "+pen.capPct+"٪ من قيمة العقد ("+money(penaltyCap(pen, contractValue(c)))+" ريال)" : ""))
             : (money(penaltyPerDay(pen, contractValue(c)))+" ريال عن كل يوم تأخير"+
                (penaltyCap(pen, contractValue(c))>0 ? "، بحد أقصى "+money(penaltyCap(pen, contractValue(c)))+" ريال" : "")))+
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
    // رصيدُ «البند المستعاض» يُختار مرةً على الطلب ويُورَث حرفياً — لا يُسأل ثانيةً
    isSubstitute: r.isSubstitute === true, substituteAccountId: r.substituteAccountId || "",
    title: r.title || "", scope: r.scope || "",
    type: r.engagement === "pay_order" ? "pay_order" : "works_order",
    lines: lines,
    value: crqValueOf(r), vatMode: normVatMode(r.vatMode),
    startDate: r.startDate || "", durationDays: Number(r.durationDays)||0,
    /* `paid:0` و`payments:[]` يفتحان تتبّعَ سداد الدفعة المقدمة (طلبُ المالك):
       عقدٌ جديدٌ دفعتُه **مستحقّةٌ للسداد عند المالية** حتى تُسدَّد فعلاً — بينما
       العقودُ القديمة (بلا حقل `paid`) تبقى على سلوكها التاريخيّ في الاسترداد. */
    advance:   Object.assign({ pct:0, recoveryPct:0, amount:0, recovered:0, paid:0, payments:[] }, r.advance||{}),
    retention: Object.assign({ pct:0, releaseOn:"completion", released:0 }, r.retention||{}),
    penalty:   normPenalty(r.penalty),
    warranty:  Object.assign({ months:0 }, r.warranty||{}),
    guarantees: [], changeOrders: [],
    // نسخةٌ **مجمَّدةٌ** من الشروط وقت الإنشاء — تعديلُ القالب لاحقاً لا يمسّ عقداً موقَّعاً
    clauses: (Array.isArray(clauses) ? clauses : DEFAULT_CLAUSES).map(function(cl){
      return { key:cl.key, category:cl.category||"general", title:cl.title||"", body:cl.body||"" };
    }),
    signedDocs: [],
    /* v18.9xi: ملاحظاتُ المعتمِدين تُجمَّد مع العقد نسخةً لا تتأثر بما يطرأ على
       الطلب — تُعرض في تفاصيل العقد وحدها، وورقةُ العقد المطبوعة
       (contractPaperHTML) لا تقرؤها أصلاً فلا تتسرّب للورق. */
    approvalNotes: (r.timeline||[]).filter(function(e){ return e && e.code==="approved" && e.note; })
      .map(function(e){ return { gate:e.event||"", by:e.by||"", at:e.at||"", note:e.note||"" }; }),
    // **لا يسري قبل التوقيع**: قرارُ المالك — فلا يُصرف مالٌ على عقدٍ لم يوقّعه الطرف
    status: "ctr_pending_signature",
    timeline: [{ event:"إنشاء العقد من الطلب "+(r.id||""), code:"created", by:by||"", at:now||"", note:"" }],
    createdAt: now||"", createdBy: by||"", id: contractId||""
  };
}
/* مسودةُ عقدِ الطلب — **الدالّةُ الناقلةُ نفسُها** لا محاكاةٌ لها. فرقُها الوحيدُ
   أنها بلا معرّفٍ ولا وقتِ إنشاء: ما دام العقدُ لم يُنشأ بعدُ فلا رقمَ له، ورقمٌ
   مخترَعٌ في مسودةٍ تُطبَع أسوأُ من لا رقم. وما عداه — البنودُ والقيمةُ والشروطُ
   التجاريةُ والقانونية — هو ما سيحمله العقدُ حرفياً. */
function crqDraftContract(req, clauses){
  var r = req || {};
  return contractFromRequest(r, r.contractId || "", "", r.createdBy || "", clauses);
}

/* مبلغُ الدفعة المقدمة يُشتقّ من نسبتها على قيمة العقد — رقمٌ محسوبٌ لا مُدخَل. */
function advanceAmountOf(contract){
  var c = contract || {}, pct = Number((c.advance||{}).pct);
  if(!isFinite(pct) || pct <= 0) return 0;
  return r2(contractValue(c) * pct / 100);
}

/* ════ استردادُ المقدمة — المبلغُ النافذ ════   (بلاغُ المالك 31/08)
   «المفروض الدفعة المقدمة المسدَّدة تُخصم من المستخلصات… المفروض يخصم الدفعة
   المسدَّدة بالفعل اللي هي 11,900 ريال».
   **الجذر.** كان الاستردادُ معلَّقاً على حقلٍ مُدخَلٍ وحدَه (`advance.recoveryPct`)،
   وصفرُه يعني **لا استرداد أبداً** — فعقدٌ بمقدمةٍ ٥٠٪ وحقلِ استردادٍ صفرٍ يصرف
   نصفَ قيمته سلفةً ثم لا يستردّ منها ريالاً: المقدمةُ هبةٌ لا سلفة. وليس في المنصّة
   بابٌ آخرُ يستردّها، فالصفرُ **سهوٌ لا سياسة**.
   **القاعدة (قرارُ المالك).** بلا نسبةٍ مكتوبةٍ في العقد، يُستردّ **كلُّ ما تبقّى
   من المسدَّد فعلاً** من أوّل مستخلصٍ يتّسع له — لا نسبةً منه ولا تقسيطاً: السلفةُ
   دَينٌ على المقاول، وأسرعُ ردٍّ يسمح به العملُ هو الأصل، وما لا يتّسع له هذا
   المستخلصُ يُرحَّل إلى التالي بلا ضياع.
   **ثلاثةُ سقوفٍ يقف عندها المبلغ:**
   • **ما سُدِّد فعلاً** (`advancePaidOf`) ناقصَ ما استُردّ — لا يُستردّ ما لم يُدفع.
     والعقودُ القديمة (بلا حقل `paid`) تبقى بسقف دفعة العقد: مستخلصاتُها التاريخية
     بُنيت عليه، وتصفيرُها بأثرٍ رجعيٍّ يكسر أرقاماً مسدَّدة.
   • **أعمالُ الفترة** — لا يُخصَم من عملٍ لم يُنجَز.
   • **وصافي المستخلص لا يهبط تحت الصفر**: الاستردادُ يتأخّر خلفَ بقية الخصوم
     (محتجزٌ · غرامةٌ · موادُّ · عدمُ مطابقة)، فمستخلصٌ صغيرٌ لا يخرج بصافٍ سالبٍ
     يستحيل تحصيلُه — والباقي يُرحَّل، فلا يسقط ريالٌ من الدَّين.
   **والمكتوبُ يسبق التلقائيّ.** نسبةٌ صريحةٌ في العقد (> 0) تُقسّط الاستردادَ
   بها — التلقائيُّ للسهو لا ليُلغي شرطاً وُقِّع عليه. */
function advanceRecoveryCapOf(contract){
  var c = contract || {}, a = c.advance || {};
  var total = Number(a.amount); if(!isFinite(total)) total = 0;
  var cap = (a.paid == null) ? r2(total) : r2(Math.min(r2(total), advancePaidOf(c)));
  return r2(Math.max(0, r2(cap - advanceRecoveredOf(c))));
}
/* `room` = ما يتّسع له الصافي بعد بقية الخصوم (اختياريّ — تمرّره `extNet`). */
function advanceRecoveryOf(contract, period, room){
  var c = contract || {}, a = c.advance || {};
  var per = r2(Math.max(0, Number(period)||0));
  var left = advanceRecoveryCapOf(c);
  if(!(left > 0) || !(per > 0)) return 0;
  var pct = Number(a.recoveryPct);
  var want;
  if(isFinite(pct) && pct > 0) want = r2(per * pct / 100);             // المكتوبُ يُقسّط
  /* التلقائيُّ **للمسدَّد الموثَّق وحدَه**: `paid` هو دليلُنا أنّ مالاً خرج فعلاً.
     والعقدُ القديم (بلا الحقل — سبق التتبّع) لا دليلَ عندنا على سداده ولا على
     ما استُردّ منه خارج المنصّة، فخصمُ مبلغٍ لم نره خطرٌ أكبرُ من تركِه: يبقى
     على سلوكه التاريخيّ — لا يستردّ إلّا بنسبةٍ مكتوبةٍ في عقده. */
  else if(a.paid != null && advancePaidOf(c) > 0) want = per;          // كلُّ ما يسمح به العمل
  else return 0;
  var amt = r2(Math.min(want, left, per));
  if(room != null) amt = r2(Math.max(0, Math.min(amt, r2(Number(room)||0))));
  return amt;
}
/* هل الاستردادُ تلقائيٌّ (كاملُ المتبقّي) لا بنسبةٍ مكتوبةٍ في العقد؟ الشاشةُ
   تقولها صراحةً — رقمٌ ظهر بلا أن يكتبه أحدٌ يجب أن يُعرَف من أين جاء. */
function advanceRecoveryDerived(contract){
  var c = contract || {}, a = c.advance || {};
  var p = Number(a.recoveryPct);
  return !(isFinite(p) && p > 0) && a.paid != null && advancePaidOf(c) > 0;
}
/* عنوانُ صفِّ الاسترداد في السُّلَّم — بنسبتِه إن كُتبت، وإلّا بقاعدتِه. */
function advanceRecoveryLabel(contract){
  var p = Number(((contract||{}).advance||{}).recoveryPct);
  if(isFinite(p) && p > 0) return "استرداد الدفعة المقدمة "+p+"٪";
  return advanceRecoveryDerived(contract)
    ? "استرداد الدفعة المقدمة — كامل المتبقّي من المسدَّد"
    : "استرداد الدفعة المقدمة";
}

/* ════ سدادُ الدفعة المقدمة — الدوالُّ النقية ════   (طلبُ المالك)
   الدفعةُ المكتوبةُ في العقد **التزامٌ لا صرف**: بعد إنشاء العقد تنتقل إلى
   «بانتظار سداد المالية»، والماليةُ تدوّن **كم سُدِّد فعلاً** — وقد يكون أقلَّ
   من دفعة العقد، وقد يُسدَّد على دفعات. ثلاثُ دوالَّ يقرؤها كلُّ شيء:
   • `advancePaidOf`  — المسدَّدُ الفعليُّ التراكميّ.
   • `advanceDueOf`   — المتبقّي المستحقُّ للسداد (صفرٌ للعقود القديمة غير المتتبَّعة —
                        فلا مطالبةٌ وهميةٌ على دفعةٍ صُرفت قبل التتبّع).
   • والتمييزُ بوجود حقل `paid`: العقودُ القديمة بلا الحقل تبقى على سلوكها
     التاريخيّ في استرداد المستخلصات (السقفُ دفعةُ العقد كاملةً). */
function advancePaidOf(contract){
  var p = Number(((contract||{}).advance||{}).paid);
  return (isFinite(p) && p > 0) ? r2(p) : 0;
}
function advanceDueOf(contract){
  var c = contract || {}, a = c.advance || {};
  if(a.paid == null) return 0;
  var amt = Number(a.amount); if(!isFinite(amt)) amt = 0;
  return r2(Math.max(0, r2(amt) - advancePaidOf(c)));
}
/* الحالاتُ التي يجوز فيها تسجيلُ السداد: العقدُ الجاري — لا منتهٍ ولا مقفلٌ ولا مفسوخ. */
var ADV_PAY_STATUSES = ["ctr_pending_signature","ctr_active","ctr_suspended"];
function advancePayable(contract){
  var c = contract || {};
  return ADV_PAY_STATUSES.indexOf(c.status) !== -1 && advanceDueOf(c) > 0;
}

/* ════ تصحيحُ قيدِ سدادٍ أُدخل بالخطأ ════   (طلبُ المالك)
   المحاسبُ يخطئ في المبلغ، والخطأُ **لا يُمحى بل يُعكَس**: القيدُ يبقى في السجلّ
   موسوماً بالإلغاء وسببِه ومَن ألغاه، ويُخصَم مبلغُه من المسدَّد. ثم يُسجَّل القيدُ
   الصحيح — فالتعديلُ عندنا «إلغاءٌ وإعادةُ تسجيل» لا كتابةٌ فوق رقمٍ سابق: الرقمُ
   الممحوُّ إيصالٌ صُرف بموجبه مالٌ، ومحوُه يترك سداداً بلا أثرٍ يُراجَع.
   • السقفُ **المسترَدُّ من المستخلصات**: لا يُلغى قيدٌ يهبط بالمسدَّد تحت ما استُردّ
     فعلاً منه — وإلا صار الاستردادُ أكبرَ من دفعةٍ لم تُسدَّد. */
function advanceRecoveredOf(contract){
  var r = Number(((contract||{}).advance||{}).recovered);
  return (isFinite(r) && r > 0) ? r2(r) : 0;
}
/* أقصى ما يجوز إلغاؤه من المسدَّد الآن — المسدَّدُ ناقصَ ما استُردّ منه. */
function advanceVoidableOf(contract){
  return r2(Math.max(0, r2(advancePaidOf(contract) - advanceRecoveredOf(contract))));
}
/* هل يُلغى هذا القيدُ بعينِه؟ قيدٌ قائمٌ (غير ملغىً) ومبلغُه ضمن المتاح للإلغاء،
   والعقدُ غيرُ نهائيّ. مصدرٌ واحدٌ يقرؤه الزرُّ والمعاملةُ معاً. */
function advVoidable(contract, payment){
  var c = contract || {}, p = payment || {};
  if(ctrIsFinal(c.status)) return false;
  if((c.advance||{}).paid == null) return false;
  if(p.voided === true) return false;
  var amt = Number(p.amount);
  if(!isFinite(amt) || amt <= 0) return false;
  return amt <= advanceVoidableOf(c) + 0.01;
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
   ٤-ب-٢) أداءُ الطرف — وقائعُ لا تقدير  [المرحلة ١٠]

   السؤالُ الذي تجيبه: **هل نتعاقد معه ثانيةً؟** واليومَ يُتّخذ القرارُ بالذاكرة —
   ومَن يتذكّر أنّ هذا المقاولَ تأخّر أربعين يوماً في عقدٍ قبل سنة؟

   **ولا درجةَ مخترَعةً ولا نجوم.** إعطاءُ «٤٫٢ من ٥» من عقدين يوهم بدقّةٍ لا تحتملها
   البيانات، ويُخفي خلف رقمٍ واحدٍ وقائعَ متعارضة. نعرض **الوقائعَ كما هي**، ومعها
   **إشاراتٌ مسمّاةٌ** لكلٍّ سببُها الظاهر — فالقارئُ يزن بنفسه ويعرف من أين جاء الحكم.
   ════════════════════════════════════════════════════════════════════ */

/* تأخّرُ عقدٍ منتهٍ يُقاس بتاريخ إقفاله لا باليوم — وإلا صار كلُّ عقدٍ قديمٍ «متأخّراً»
   بمرور الزمن. والعقدُ الجاري يُقاس باليوم فعلاً: تأخّرُه ما زال يتراكم. */
function ctrLateDays(contract, today){
  var c = contract || {};
  var asOf = ctrIsFinal(c.status) || c.status==="ctr_completed"
    ? String(c.updatedAt||"").slice(0,10) || today
    : today;
  return lateDaysOf(c, asOf || today);
}

/* بطاقةُ أداءِ طرفٍ — تُبنى من القوائم فتُختبَر بلا Firestore. */
function vendorScorecard(vendorId, contracts, extracts, changes, today){
  var out = {
    contracts:0, active:0, done:0, terminated:0,
    value:0, paid:0, remaining:0,
    lateContracts:0, lateDaysMax:0, lateDaysSum:0,
    extracts:0, extBounced:0,
    changes:0, changeNet:0,
    flags:[]
  };
  var mine = (Array.isArray(contracts)?contracts:[]).filter(function(c){ return c && c.vendorId===vendorId; });
  var ids = {};
  mine.forEach(function(c){
    ids[c.id] = 1;
    out.contracts++;
    if(c.status==="ctr_active" || c.status==="ctr_suspended" || c.status==="ctr_pending_signature") out.active++;
    else if(c.status==="ctr_completed" || c.status==="ctr_closed") out.done++;
    else if(c.status==="ctr_terminated") out.terminated++;
    out.value += contractValue(c);
    var late = ctrLateDays(c, today);
    if(late > 0){ out.lateContracts++; out.lateDaysSum += late; if(late > out.lateDaysMax) out.lateDaysMax = late; }
    // أثرُ أوامر التغيير المطبَّقة يُقرأ من العقد نفسِه (لا من المجموعة) — فيبقى صحيحاً
    // ولو لم تكن قائمةُ الأوامر محمَّلة
    var t = contractChangeTotals(c);
    out.changeNet += t.net;
  });
  (Array.isArray(extracts)?extracts:[]).forEach(function(e){
    if(!e || !ids[e.contractId]) return;
    out.extracts++;
    if(e.status==="ext_paid") out.paid += r2((e.payment||{}).amount);
    if(e.status==="ext_pm_rejected" || e.status==="ext_returned") out.extBounced++;
  });
  (Array.isArray(changes)?changes:[]).forEach(function(g){
    if(!g || !ids[g.contractId]) return;
    if(g.status==="chg_applied") out.changes++;
  });
  out.value = r2(out.value); out.paid = r2(out.paid);
  out.remaining = r2(Math.max(0, out.value - out.paid));
  out.changeNet = r2(out.changeNet);
  out.lateDaysAvg = out.lateContracts ? Math.round(out.lateDaysSum / out.lateContracts) : 0;

  /* الإشاراتُ — كلٌّ بسببها الظاهر، ولا إشارةَ بلا واقعةٍ تُريها. */
  if(out.terminated > 0) out.flags.push({ key:"terminated", sev:"crit",
    lbl:"فُسخ معه "+money0(out.terminated)+" عقد" });
  if(out.lateContracts > 0) out.flags.push({ key:"late", sev: out.lateDaysMax>=30?"crit":"warn",
    lbl:"تأخّر في "+money0(out.lateContracts)+" من "+money0(out.contracts)+" — أقصاه "+money0(out.lateDaysMax)+" يوماً" });
  if(out.extBounced > 0) out.flags.push({ key:"bounced", sev:"warn",
    lbl:money0(out.extBounced)+" مستخلصاً أُعيد أو رُفض" });
  if(out.changes > 0) out.flags.push({ key:"changes", sev:"info",
    lbl:money0(out.changes)+" أمرَ تغييرٍ مطبَّق — أثرُها الصافي "+(out.changeNet>=0?"+":"")+money(out.changeNet) });
  return out;
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

  // (٥) − غرامةُ التأخير (بسقفها من قيمة العقد إن حُدِّد)
  var penalty = r2(Math.max(0, Number(x.penaltyAmount)||0));
  var penCap = penaltyCap(c.penalty, contractValue(c));
  if(penCap > 0) penalty = r2(Math.min(penalty, penCap));

  // (٦) − الموادُّ المصروفةُ له من مستودعنا
  var materials = r2(Math.max(0, Number(x.materialsIssued)||0));

  // (٧) − خصومُ عدم المطابقة / الجودة / السلامة
  var nonConformity = r2(Math.max(0, Number(x.ncDeduction)||0));

  /* (٨) − استردادُ الدفعة المقدمة — **آخرُ الخصوم رتبةً** لا أوّلَها.
     قاعدتُه في `advanceRecoveryOf`: كاملُ المتبقّي من المسدَّد ما لم تُكتب نسبةٌ
     في العقد. وتأخيرُه هنا مقصود: يُحسب على ما **يتّسع له الصافي** بعد بقية
     الخصوم، فلا يخرج مستخلصٌ بصافٍ سالبٍ يستحيل تحصيلُه — والباقي يُرحَّل إلى
     المستخلص التالي، فلا يسقط ريالٌ من الدَّين. */
  var advRoom = r2(Math.max(0, r2(withVat - r2(retention + penalty + materials + nonConformity))));
  var advanceRecovery = advanceRecoveryOf(c, period, advRoom);

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
  var c = contract || {}, val = contractValue(c);
  var perDay = penaltyPerDay(c.penalty, val);
  if(perDay<=0 || !lateDays) return 0;
  var raw = r2(perDay * lateDays);
  var cap = penaltyCap(c.penalty, val);
  if(cap>0) raw = r2(Math.min(raw, cap));
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

/* ════ توقيعُ المقاول على المستخلص ════   (طلبُ المالك)

   **الفجوة.** كان المستخلصُ مستنداً من طرفٍ واحد: نحن نقيس ونخصم ونعتمد
   ونصرف، والمقاولُ يستلم المال بلا ورقةٍ تُثبت أنّه أقرّ الكمياتِ التي نُسبت إليه ولا
   الخصوماتِ التي أُخذت منه. وأوّلُ نزاعٍ على «كم نُفّذ» أو «لماذا خُصم» يقع بلا
   دليلٍ يُحتجّ به: لا مقياسَ موقّعاً ولا إقرارَ استلام.

   **العلاجُ ورقةٌ وشرط.** ورقةٌ تُطبَع بالأرقام نفسِها (`extractPaperHTML`) يوقّعُها
   المقاول، و**نسختُها الموقّعةُ شرطٌ في السداد** — والشرطُ في ثلاثة مواضعَ لا
   واحد: الشاشةُ تحجب الزرّ، و`payExtract` ترفض، و`firestore.rules` تحرس الكتابةَ نفسَها.
   والواحدُ منها لا يكفي: منعٌ في الشاشة وحدَها يُدار من وحدة تحكمٍ، وفي القواعد وحدَها
   يُنتج زرّاً يعِد ثمّ يفشل برسالةٍ لا تدلّ على العلاج.

   **والتوقيعُ على رقمٍ بعينه** — كبصمتَي الطلب: يُحفَظ مع النسخة **صافي المستخلص
   وقتَ التوقيع**، فإن تغيّر بعده (تعديلُ شروطٍ · أمرُ تغييرٍ يمسّ المحتجَز أو
   المقدّم) سقط التوقيعُ وحدَه ولزمت نسخةٌ على الرقم الجديد. ورقةٌ وُقّعت على ٢٥,٠٠٠
   لا تُجيز صرفَ ٢٢,٠٠٠. */
function extSignature(ext){
  var s = (ext||{}).signature;
  return (s && s.url) ? s : null;
}
/* التوقيعُ صالحٌ ما دام الصافي هو الذي وُقّع عليه — بهامش قرشٍ للتقريب. */
function extSigValid(ext, net){
  var s = extSignature(ext); if(!s) return false;
  var signed = Number(s.net); if(!isFinite(signed)) return false;
  var now = Number(net); if(!isFinite(now)) now = 0;
  return Math.abs(r2(signed) - r2(now)) <= 0.011;
}
/* حارسُ السداد نقيّاً — نصُّه واحدٌ للشاشة وللكتابة، فلا تقول إحداهما غيرَ الأخرى. */
function extPayGuard(ext, net){
  var s = extSignature(ext);
  if(!s) return { ok:false, why:"لا سدادَ قبل رفع نسخة المستخلص موقّعةً من المقاول" };
  if(!extSigValid(ext, net))
    return { ok:false, why:"تغيّر صافي المستخلص بعد توقيع المقاول ("+money(s.net)+" ⇐ "+money(net)+" ر.س) — تلزم نسخةٌ موقّعةٌ على الرقم الجديد" };
  return { ok:true, why:"" };
}
/* بوّاباتُ المستخلص موقّعةً — مشتقّةٌ من حقول الاعتماد نفسِها ومن `EXT_GATES`،
   فلا تطبع الورقةُ بوّابةً لم يمرّ بها ولا تُسمّيها باسمٍ غيرِ اسمها على الشاشة.
   (وبوّابةُ التنفيذيّ تظهر إن اعتمد فعلاً أو كان الصافي يبلغ سقفَه — بقاعدة
   `extNextStage` نفسِها التي توقِفُ المستخلصَ عندها.) */
function extSignoffs(ext, net, ceoTh){
  var e = ext||{}, p = e.payment||{};
  var amt = Number(net);   if(!isFinite(amt)) amt = 0;
  var th  = Number(ceoTh); if(!isFinite(th))  th  = 0;
  var out = [{ key:"pm", lbl:EXT_GATES.ext_pending_pm.lbl, by:e.pmApprovedBy||"", at:e.pmApprovedAt||"" }];
  if(e.ceoApprovedAt || (th > 0 && amt >= th))
    out.push({ key:"ceo", lbl:EXT_GATES.ext_pending_ceo.lbl, by:e.ceoApprovedBy||"", at:e.ceoApprovedAt||"" });
  out.push({ key:"pay", lbl:EXT_GATES.ext_pending_finance.lbl, by:p.by||"", at:p.at||"" });
  return out;
}
/* وسمُ الورقة — بمنطق `payOrderPrintState` نفسِه: ورقةٌ تخرج من المنصّة تقول عن
   نفسها الصدقَ بلا وسيط، فلا تُقرأ نسخةُ مراجعةٍ مطالبةً معتمَدة. */
function extPrintState(ext, net){
  var e = ext||{}, st = e.status;
  if(st === "ext_paid")
    return { key:"paid", cls:"ok", lbl:"مسدَّد — مغلق",
             note:"سُدّد هذا المستخلصُ وأُغلق. هذه نسخةٌ للحفظ لا مطالبةٌ جديدة." };
  if(st === "ext_cancelled")
    return { key:"void", cls:"bad", lbl:"ملغى — لا يُصرَف",
             note:"أُلغي هذا المستخلصُ على المنصّة، فأيُّ نسخةٍ منه لاغيةٌ." };
  if(st === "ext_pm_rejected" || st === "ext_returned")
    return { key:"void", cls:"bad", lbl:(EXT_STATUS[st]||"مُعاد للتصحيح")+" — لا يُصرَف",
             note:"أُعيد هذا المستخلصُ إلى مُعِدّه للتصحيح، فلا يُصرَف بصيغته هذه." };
  if(st === "ext_pending_finance"){
    if(extSigValid(e, net))
      return { key:"due", cls:"ok", lbl:"معتمَدٌ وموقّع — صالحٌ للسداد",
               note:"اكتملت بوّاباتُ الاعتماد ووُقّعت نسختُه من المقاول على هذا الصافي." };
    return { key:"sign", cls:"warn", lbl:"معتمَد — بانتظار توقيع المقاول",
             note:"يوقّع المقاولُ هذه الورقةَ إقراراً بالكميات والخصومات، ثمّ تُرفع نسختُها الموقّعة — ولا سدادَ قبلها." };
  }
  return { key:"draft", cls:"warn", lbl:"قيد الاعتماد — غيرُ صالحٍ للصرف",
           note:"لم تكتمل بوّاباتُ اعتماد المستخلص بعد. هذه نسخةُ مراجعةٍ لا مطالبةٌ معتمَدة." };
}

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

  // (١) قيدَ الاعتماد — من طلبات التعاقد غير المنتهية.
  // أمرُ الدفع المسدَّدُ جزئياً: ما سُدِّد منه صار مصروفاً (البند ٤) فلا يبقى
  // هنا إلا **متبقّيه** — وإلا حُسب الريالُ مرتين: معلّقاً ومصروفاً معاً.
  (Array.isArray(requests)?requests:[]).forEach(function(r){
    if(docProjectKey(r) !== projectKey) return;
    if(!reqIsPending(r)) return;
    var v = r2(r.value);
    if(r.engagement === "pay_order") v = r2(Math.max(0, v - crqPaidTotal(r)));
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
    // الدفعةُ المقدمةُ **المسدَّدةُ فعلاً** مالٌ خرج — تدخل المصروفَ مع المستخلصات،
    // ولا ازدواجَ: صافي المستخلص يخصم استردادَها أصلاً، فالمجموعُ = النقدُ الخارج.
    var paid = advancePaidOf(c);
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

  // (٤) المسدَّدُ من أوامر الدفع — مصروفٌ تعاقديٌّ لا عقدَ له. **والدفعةُ الجزئية
  // مصروفٌ منذ خروجها**: أمرٌ ما زال مفتوحاً وقد سُدِّد نصفُه — نصفُه خرج من
  // الخزينة فعلاً (قاعدةُ «المالُ المدفوعُ مصروفٌ أبداً» نفسُها في العقود أعلاه).
  // (والمغلقُ القديمُ قد لا يحمل حقلَ engagement — و«مسدَّد» لا تبلغها إلا أوامرُ الدفع)
  (Array.isArray(requests)?requests:[]).forEach(function(r){
    if(docProjectKey(r) !== projectKey) return;
    if(r.engagement !== "pay_order" && r.status !== "crq_paid") return;
    var v = crqPaidTotal(r);
    if(v <= 0) return;
    bucket(r.budgetCategoryKey).spent += v;
    out.total.spent += v;
  });

  Object.keys(out.byCat).forEach(function(k){
    var b=out.byCat[k]; b.pending=r2(b.pending); b.contracted=r2(b.contracted); b.spent=r2(b.spent);
  });
  out.total.pending=r2(out.total.pending); out.total.contracted=r2(out.total.contracted); out.total.spent=r2(out.total.spent);
  return out;
}

/* ════ الأعمالُ التعاقديةُ على رصيد «البند المستعاض» ════   [طلبُ المالك]

   **الفجوة.** «البند المستعاض» رصيدٌ من مال العميل يُنفَق على أعمالٍ خارج بنود
   العقد. وكان يُخصَم من **طلبات الشراء وحدَها** — بينما نصفُ هذا العمل يُنفَّذ
   بمقاولِ باطن: أمرُ دفعٍ صغير أو عقدٌ بمستخلصات. فالمصروفُ الحقيقيُّ أكبرُ ممّا
   تعرضه شاشةُ الرصيد، و«المتبقّي» رقمٌ يُطمئن كذباً.

   **العلَمُ على الطلب لا على العقد.** يُختار مرةً واحدةً عند إنشاء طلب التعاقد
   (عقداً كان أو أمرَ دفع)، ثم **يرثه العقدُ حرفياً** عند التحويل (`contractFromRequest`)
   وترثه مستخلصاتُه بالتبعية — فلا يُسأل أحدٌ مرتين ولا ينحرف الجوابان.

   **الخصمُ ممّا خرج من الخزينة فعلاً** — لا من الالتزام. وهو اصطلاحُ `contractRollup`
   نفسُه في هذه الوحدة، والمصدرُ نفسُه لأرقامه، فلا يقول رقمانِ الشيءَ ذاته بصيغتين:
     • `spent`      = أوامرُ الدفع المسدَّدة + المستخلصاتُ المسدَّدة (`ext_paid`).
     • `pending`    = طلباتٌ قيدَ الاعتماد (لم تُحوَّل ولم تُسدَّد بعد).
     • `contracted` = المتبقّي من التزامِ عقدٍ قائم (قيمتُه − المسدَّدُ منه).
   والاثنانِ الأخيرانِ **قيدُ التنفيذ**: يُعرَضان ولا يُخصَمان — تماماً كطلب الشراء
   الجاري في `_calcStats`.

   **الطلبُ المحوَّلُ لا يُعدُّ مرتين**: بعد التحويل تصير حالتُه `crq_converted`
   (نهائية) فيسقط من `reqIsPending`، ويتولّى عقدُه الحساب. */
function docSubstituteId(d){
  return (d && d.isSubstitute === true) ? String(d.substituteAccountId || "") : "";
}
/* حالةُ المستند على الرصيد: `spent` خرج · `live` قيد التنفيذ · `idle` لا أثرَ له. */
function substituteRollup(accountId, requests, contracts, extracts){
  var id = String(accountId||"");
  var out = { pending:0, contracted:0, spent:0, docs:[], liveCount:0, spentCount:0 };
  if(!id) return out;
  var reqs = Array.isArray(requests)?requests:[];
  var ctrs = Array.isArray(contracts)?contracts:[];
  var exts = Array.isArray(extracts)?extracts:[];

  reqs.forEach(function(r){
    if(docSubstituteId(r) !== id) return;
    if(r.status === "crq_converted") return;              // عقدُه يحمله — لا يُعدّ مرتين
    var eng = (r.engagement === "pay_order") ? "pay_order" : "contract";
    var val = r2(crqValueOf(r));
    var row = { kind:"req", engagement:eng, id:r.id||"", title:r.title||"",
                vendorName:r.vendorName||"", status:r.status||"", statusLbl:CRQ_STATUS[r.status]||r.status||"—",
                value:val, spent:0, state:"idle" };
    if(r.status === "crq_paid"){
      var paid = crqPaidTotal(r);
      out.spent += paid; out.spentCount++;
      row.spent = paid; row.state = "spent";
    } else if(reqIsPending(r)){
      /* أمرُ الدفع المسدَّدُ جزئياً: ما خرج مصروفٌ منذ خروجه (قاعدةُ العقود
         نفسُها أدناه)، ولا يبقى معلّقاً إلا متبقّيه — فلا يُعدّ الريالُ مرتين. */
      var part = (eng === "pay_order") ? crqPaidTotal(r) : 0;
      if(part > 0){ out.spent += part; out.spentCount++; }
      out.pending += r2(Math.max(0, val - part)); out.liveCount++;
      row.spent = part; row.state = "live";
    }
    out.docs.push(row);
  });

  ctrs.forEach(function(c){
    if(docSubstituteId(c) !== id) return;
    var val = r2(contractValue(c));
    // الدفعةُ المقدمةُ المسدَّدةُ فعلاً «ما يخرج فعلاً» — كقاعدة الحساب المعلنة،
    // ولا ازدواج: صافي المستخلص يخصم استردادَها.
    var paid = advancePaidOf(c);
    exts.forEach(function(e){
      if(e && e.contractId === c.id && e.status === "ext_paid") paid += r2((e.payment||{}).amount);
    });
    paid = r2(paid);
    // **المالُ المدفوعُ مصروفٌ أبداً** مهما صارت حالةُ العقد (قاعدةُ `contractRollup`)
    out.spent += paid;
    var live = ctrIsCommitted(c);
    var remaining = live ? r2(Math.max(0, val - paid)) : 0;
    out.contracted += remaining;
    if(paid > 0) out.spentCount++;
    if(live) out.liveCount++;
    out.docs.push({ kind:"ctr", engagement:"contract", id:c.id||"", title:c.title||"",
                    vendorName:c.vendorName||"", status:c.status||"", statusLbl:CTR_STATUS[c.status]||c.status||"—",
                    value:val, spent:paid, remaining:remaining,
                    state: live ? "live" : (paid>0 ? "spent" : "idle") });
  });

  out.pending=r2(out.pending); out.contracted=r2(out.contracted); out.spent=r2(out.spent);
  out.docs.sort(function(a,b){ return String(b.id).localeCompare(String(a.id)); });
  return out;
}
/* الغلافُ الذي تستدعيه `substitute-budget`: يضمن تشغيلَ المستمعين ثم يجمّع —
   كما يفعل `rollupForProject` لإدارة المشاريع بالضبط. */
function substituteRollupFor(accountId){
  startReqSync(); startCtrSync(); startExtSync();
  return substituteRollup(accountId, _reqs, _ctrs, _exts);
}
/* هل هذا العقدُ (أبو طلبِ شراءٍ ما) محمولٌ على رصيد استعاضة؟ يقرؤها حارسُ منع
   الازدواج في `substitute-budget`: طلبُ شراءٍ تحت عقدٍ مستعاضٍ محسوبٌ في مستخلصاته. */
function contractSubstituteId(contractId){
  var c = contractById(contractId);
  return c ? docSubstituteId(c) : "";
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

/* ── أرقامُ التواصل ──
   رقمٌ واحدٌ يُكتب بعشر صيغٍ ويجب أن يُقرأ واحدة: `0501234567` و`+966 50 123 4567`
   و`٠٥٠١٢٣٤٥٦٧` كلُّها الرقمُ نفسُه. فالتخزينُ **مطبَّعٌ** (صيغةٌ دوليةٌ بلا `+`)
   والعرضُ محلّيٌّ مقروء — وإلا صار الطرفُ الواحدُ رقمين لا يلتقيان في بحث.

   ونسخةُ التطبيع هنا **مطابقةٌ عمداً** لـ`normalizeMsisdn` في
   `functions/lib/whatsapp.js` (يحرسها فحصٌ يقارن السلوكين على المدخلات نفسِها):
   ما يُحفَظ في السجل هو ما سيصله إشعارُ واتساب حرفاً بحرف — لا صيغةٌ تُقبَل هنا
   وتُرفَض هناك. والفرقُ الوحيدُ المتعمَّد: الأرقامُ العربيةُ تُطوى هنا قبل كل شيء،
   لأنّ مَن يكتب في المتصفّح قد تكون لوحتُه عربية، والخادمُ لا يستقبل إلا المطبَّع. */
var _AR_DIGITS = "٠١٢٣٤٥٦٧٨٩٠١٢٣٤٥٦٧٨٩";   // العربية الهندية والفارسية
function phoneDigits(raw){
  var s = String(raw==null?"":raw), out = "";
  for(var i=0;i<s.length;i++){
    var c = s.charAt(i), k = _AR_DIGITS.indexOf(c);
    if(k >= 0) out += String(k % 10);
    else if(c >= "0" && c <= "9") out += c;
  }
  return out;
}
function normPhone(raw){
  var d = phoneDigits(raw);
  if(!d) return "";
  if(d.indexOf("00") === 0) d = d.slice(2);                          // بادئةُ الاتصال الدوليّ
  if(d.indexOf("966") === 0) return d;                               // دوليٌّ سعوديٌّ بالفعل
  if(d.length === 10 && d.indexOf("05") === 0) return "966"+d.slice(1); // محلّيّ 05XXXXXXXX
  if(d.length === 9  && d.charAt(0) === "5")   return "966"+d;          // بلا صفرٍ بادئ
  return d;                                                          // رقمٌ دوليٌّ آخر — كما هو
}

/* صلاحيةُ الرقم: السعوديُّ **جوّالٌ** لا هاتفٌ ثابت (`9665XXXXXXXX`)، وغيرُه يُقبَل
   بطولٍ دوليٍّ معقول. والحقلُ اسمُه «جوال» — فرقمُ مقسمٍ أرضيٍّ فيه يعني رسالةً
   لا تصل وأحداً لا يُبلَّغ، وهو أسوأُ من خانةٍ فارغةٍ تُرى فارغة. */
function phoneOk(raw){
  var p = normPhone(raw);
  if(!p) return false;
  if(p.indexOf("966") === 0) return /^9665\d{8}$/.test(p);
  // صفرٌ بادٍ نجا من التطبيع ⇒ رقمٌ محلّيٌّ ليس جوالاً سعودياً (ثابتٌ أو ناقص).
  // ولو مرّ لظُنّ سليماً حتى يومِ الاتصال به. وغيرُ السعوديّ يُكتب بمفتاح دولته.
  if(p.charAt(0) === "0") return false;
  return /^\d{8,15}$/.test(p);
}
function phoneHint(raw){
  var p = normPhone(raw);
  if(!p) return "";
  if(phoneOk(p)) return "";
  if(p.indexOf("966") === 0 || p.charAt(0) === "0")
    return "رقمُ الجوال السعوديّ يبدأ بـ05 ويتكوّن من عشرة أرقام (والرقمُ غيرُ السعوديّ يُكتب بمفتاح دولته بلا صفرٍ بادئ)";
  return "رقمٌ غير مكتمل — اكتبه محلياً (05XXXXXXXX) أو دولياً كاملاً بمفتاح الدولة";
}
/* العرضُ محلّيٌّ للسعوديّ ودوليٌّ لغيره — القراءةُ بالعين قبل الاتصال. */
function phoneFmt(raw){
  var p = normPhone(raw);
  if(!p) return "";
  if(/^9665\d{8}$/.test(p)) return "0"+p.slice(3,5)+" "+p.slice(5,8)+" "+p.slice(8);
  return "+"+p;
}
/* صيغُ الرقم التي قد يكتبها الباحث: كما خُزِّن، وبصفرٍ محلّيّ، وبلا مفتاحٍ ولا صفر. */
function phoneVariants(e164){
  var p = String(e164||""), out = [p];
  if(/^9665\d{8}$/.test(p)) out.push("0"+p.slice(3), p.slice(3));
  return out;
}

/* كلُّ أرقام الطرف في قائمةٍ واحدة: جوّالُه الرئيسيُّ ثمّ جهاتُ اتصاله.
   **مصدرُ حقيقةٍ واحدٌ** يقرؤه العرضُ والبحثُ والاتصالُ معاً — فلا تُكرَّر قراءةُ
   `contacts` في خمسة مواضعَ تفترق. والتكرارُ يُطوى بالمطبَّع: رقمٌ كُتب مرّتين
   بصيغتين ليس رقمين. */
function vendorPhones(vendor){
  var v = vendor || {}, out = [], seen = {};
  function push(label, raw){
    var e = normPhone(raw);
    if(!e || seen[e]) return;
    seen[e] = 1;
    out.push({ label:label||"جوال", e164:e, display:phoneFmt(e), valid:phoneOk(e) });
  }
  push(v.phoneLabel || "الجوال الرئيسي", v.phone);
  (Array.isArray(v.contacts) ? v.contacts : []).forEach(function(c){
    c = c || {};
    push((c.name || "جهة اتصال") + (c.role ? (" — "+c.role) : ""), c.phone);
  });
  return out;
}
/* مطابقةُ البحث بالرقم — بأيّ صيغةٍ كتبها الباحث، ومن ثلاثة أرقامٍ فصاعداً
   (أقلُّ من ذلك يطابق نصفَ السجل فيصير المرشّحُ ضجيجاً). */
function vendorMatchesPhone(vendor, query){
  var qd = phoneDigits(query);
  if(qd.length < 3) return false;
  var ph = vendorPhones(vendor);
  for(var i=0;i<ph.length;i++){
    var vs = phoneVariants(ph[i].e164);
    for(var j=0;j<vs.length;j++) if(vs[j].indexOf(qd) !== -1) return true;
  }
  return false;
}
/* مَن يملك هذا الرقمَ غيرَ الطرفِ الذي نحرّره؟ **تنبيهٌ لا منع**: الرقمُ الواحد
   قد يكون لمكتبٍ يمثّل مقاولين، لكنه في الغالب طرفٌ سُجِّل مرّتين — ورؤيةُ من
   يملكه الآن هي الفرقُ بين تنبيهٍ يُفهم وتنبيهٍ يُتجاهَل. */
function phoneOwner(raw, exceptId, pool){
  var e = normPhone(raw);
  if(!e) return null;
  var list = Array.isArray(pool) ? pool : _vendors;
  for(var i=0;i<list.length;i++){
    var u = list[i];
    if(!u || u.id === exceptId) continue;
    var ph = vendorPhones(u);
    for(var j=0;j<ph.length;j++) if(ph[j].e164 === e) return u;
  }
  return null;
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
   محرّكُ الانتهاء واحدٌ لا اثنان: لو بقيت الهويةُ خارجه لمرّت إقامةٌ منتهيةٌ بلا تنبيه.

   لكنّ الهويةَ **تُدمَج في الوثيقة التي تمثّلها ولا تُضاف بجوارها**: صفُّ الوثائق
   يشتقّ رقمَه من البيانات الأساسية أصلاً (`applyDocAutofill`)، فالمنشأةُ التي لها
   وثيقةُ «سجلّ تجاريّ» برقم سجلّها **هي هي** الهويةُ الرسمية — وإضافتُها صفّاً
   ثانياً تعرض السجلَّ التجاريَّ مرّتين في شاشة الطرف وشارتين «س.ت» في بطاقته،
   وتَعُدُّه وثيقتين في حالة الامتثال. (بلاغُ المالك: «السجلّ التجاريّ الأخير في
   قائمة الوثائق أنا لم أُضفه، وفي التعديل لا يظهر أنه موجودٌ مرّتين» — لأنه لم يكن
   في `docs` أصلاً بل صفٌّ مشتقٌّ في العرض وحدَه.)

   والمعيارُ **النوعُ والرقمُ معاً** لا النوعُ وحدَه: سجلٌّ فرعيٌّ برقمٍ آخرَ وثيقةٌ
   قائمةٌ بذاتها، وانتهاءُ السجلّ الرئيس يبقى محروساً بصفّه.

   والدمجُ يورّث التاريخَ ولا يأخذه: صفٌّ يحمل الرقمَ بلا تاريخِ انتهاءٍ (بياناتٌ
   قديمةٌ حُفظت قبل الاشتقاق) يرث `crExpiry`/`idExpiry` — فلا يسقط تاريخٌ من
   المحرّك بحجّة الدمج. والوراثةُ **على نسخةٍ** لا على المخزَّن: العرضُ لا يكتب. */
function allExpiring(vendor){
  var v = vendor || {};
  var id = identityOf(v);
  var idType = (id.entity === "individual") ? "identity" : "cr";
  var idNum  = String(id.number||"").trim();
  var merged = false;
  var out = (Array.isArray(v.docs) ? v.docs : []).map(function(dc){
    if(!dc || merged || dc.type !== idType) return dc;
    if(!idNum || String(dc.number||"").trim() !== idNum) return dc;
    merged = true;
    var row = Object.assign({}, dc, { _identity:true });
    if(!String(row.expiry||"").trim() && id.expiry) row.expiry = id.expiry;
    return row;
  });
  if(!merged && id.expiry) out.push({ type:idType, number:id.number, expiry:id.expiry, _identity:true });
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
function _sb(){ try{ return (window.substituteBudget && typeof window.substituteBudget.accounts==="function") ? window.substituteBudget : null; }catch(e){ return null; } }
function _role(){ var u=_user(); return (u && u.role) ? u.role : ""; }
function _me(){ var u=_user(); return (u && u.name) || "النظام"; }
function _now(){ return new Date().toISOString(); }
function _audit(a,d){ try{ if(typeof logAudit==="function") logAudit(a,d); }catch(e){} }
/* نافذةُ التأكيد: `showConfirm` افتراضاتُها **للحذف** (سلّةٌ حمراء وزرُّ «حذف»)،
   فاعتمادُ طلبٍ كان يظهر بزرِّ حذفٍ أحمر — نصٌّ يناقض الفعل. لذا تُمرَّر نيّةُ
   الإجراء (`kind`) صراحةً، وافتراضُنا محايدٌ لا مدمِّر.
   وهي كذلك **تَرفُض** عند «إلغاء» بـ`false`، فكان الإلغاءُ يهبط في `catch` المُستدعي
   ويظهر تنبيهُ «تعذّر الإجراء» بلا خطأ. فنُطبّعها هنا إلى وعدٍ يُحلّ دائماً:
   `true` للموافقة و`false` لغيرها — والخطأُ الحقيقيُّ وحدَه يبقى خطأً. */
var _CONFIRM_KINDS = {
  neutral: { icon:"❓", okText:"متابعة",  okClass:"btn-primary" },
  approve: { icon:"✅", okText:"اعتماد",  okClass:"btn-primary" },
  reject:  { icon:"↩",  okText:"رفض / إعادة", okClass:"btn-danger" },
  danger:  { icon:"⚠",  okText:"متابعة",  okClass:"btn-danger" }
};
function _confirm(o){
  var opt = Object.assign({}, _CONFIRM_KINDS[(o&&o.kind)||"neutral"], o||{});
  delete opt.kind;
  try{
    return Promise.resolve(showConfirm(opt)).then(
      /* v18.9xi: مع `input` تعود قيمةُ الخانة ({ok,value}) كما هي — وبدونها
         السلوكُ القديم حرفياً (منطقيٌّ صرف). */
      function(v){ return v === false ? false : (opt.input ? v : v !== false); },
      function(){ return false; }
    );
  }catch(e){ return Promise.resolve(window.confirm(opt.msg||"تأكيد؟")); }
}
/* رسالةُ الخطأ للمستخدم: رفضُ الخادم يصل بالإنجليزية «Missing or insufficient
   permissions» فيبدو **عطلاً في النظام** وهو في الغالب **قواعدُ لم تُنشَر بعد**.
   وقع فعلاً: زرُّ حذف العقد ظهر وعمل، والقواعدُ المنشورةُ ترفض الكتابةَ الثانية في
   معاملته — فرأى المالكُ سطراً إنجليزياً لا يدلّ على شيء. الآن يدلّ على مكان العلاج. */
function _errMsg(e){
  var m = (e && (e.message || e.code)) ? String(e.message || e.code) : "";
  if(!m) return "تعذّر تنفيذ العملية";
  if(/permission-denied|Missing or insufficient permissions|PERMISSION_DENIED/i.test(m))
    return "رفضَ الخادمُ العملية — غالباً قواعدُ Firestore لم تُنشَر بآخر نسخة "+
           "(لوحة Firebase ← Firestore ← Rules ← Publish). وإن تكرّر بعد النشر فأبلغ الدعم.";
  if(/unavailable|Failed to fetch|Load failed|network/i.test(m))
    return "تعذّر الاتصال بالخادم — تحقّق من الشبكة ثمّ أعِد المحاولة";
  return m;
}

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
var EDIT_ROLES   = ["admin","procurement_officer"];   // تعديلُ بيانات طرفٍ قائم
/* ── إضافةُ طرفٍ جديد: دائرةٌ أوسعُ من التعديل، وهذا مقصود ──
   بلاغُ المالك: المشرفُ هو مَن يقف أمام المقاول في الموقع، فهو أوّلُ من يعرف أنّ
   طرفاً جديداً دخل العمل. وحبسُ **الإضافة** في المشتريات يجعل الطرفَ يعمل أسابيعَ
   قبل أن يوجد له سجلّ — أو يُسجَّل بأسماءٍ مرتجلةٍ في حقولٍ نصّية، وهو ما بُني سجلُّ
   الأطراف أصلاً ليمنعه.
   **والإضافةُ ليست التعديل**، فالفصلُ بينهما هو ما يجعل التوسيعَ آمناً:
   • الإضافةُ تُنشئ سجلاً **بلا آيبان** (`canBank` تحجبه في الواجهة، و`saveVendor`
     تُسقطه من الحمولة، و`vendorCreateOk` في `firestore.rules` تردّه على الخادم).
   • والتعديلُ على طرفٍ قائم — تغييرُ اسمٍ أو سجلٍّ أو حالة — يبقى لـ`EDIT_ROLES`
     وحدَها: مَن يضيف لا يعيد كتابةَ ما اعتمده غيرُه.
   نفسُ الفصل الذي طُبِّق في كتالوج البنود (`canAddCatalogItem` مقابل التعديل الكامل).
   **ودورُ المشرف مكتوبٌ بصيغتيه**: المسجَّلُ في `meta/users` من نافذة الإدارة هو
   «مشرف» بالعربية (قيمةُ الخيار في القائمة)، بينما توكِنُ تطبيق الفنيين يحمل
   `supervisor`. وقائمةٌ بإحداهما وحدَها تُنتج **ميزةً ميتةً بلا خطأ**: الزرُّ لا
   يظهر لأحدٍ في الإنتاج وكلُّ سطرٍ يبدو صحيحاً. (نفسُ ما تحرسه `_isSupRole` في
   وحدة النظافة، وما يفعله كاشفُ إشعارات الواتساب في النواة.) */
var ADD_ROLES    = ["admin","procurement_officer","supervisor","مشرف"];
var BANK_ROLES   = ["admin","finance"];               // الآيبان — ناقلُ الاحتيال الأول
var STATUS_ROLES = ["admin"];                         // الإيقافُ والحظر

/* ── الإذنُ الفرديُّ فوق الدور — **مفتاحٌ مزدوجُ الطبع** ──
   الدورُ يقول «هذا النوعُ من المستخدمين قد يرى التعاقدات»، والإذنُ يقول «وهذا
   المستخدمُ بعينه يراها أو لا».

   وكان الشرطان **لازمَين معاً**: الدورُ أوّلاً ثمّ الإذن. فبلاغُ المالك (رغده،
   دورُها المسجَّل «مشرف»): الخانةُ في نافذة الصلاحيات مؤشَّرةٌ ✅ والقسمُ غائبٌ —
   لأنّ المفتاحَ **حاجبٌ** فيظهر مؤشَّراً بالافتراض، والدورُ يحجب قبل أن يُقرأ.
   **وخانةٌ لا أثرَ لها أسوأُ من غيابها** لأنها تُوهم المسؤولَ أنه منح شيئاً.

   فالمفتاحُ الآن **مزدوجُ الطبع** — كما فعل `cleaningEdit` مع «إدارة مهام النظافة»:
   • دورٌ **مؤهَّلٌ بطبعه** (`VIEW_ROLES`): المفتاحُ **حاجبٌ** كما كان — الافتراضُ
     مسموح، ولا يُغلق إلا بعلامةٍ صريحةٍ `false`. فلا مستخدمَ قائمٌ يفقد شيئاً.
   • دورٌ **غيرُ مؤهَّل** (مشرف · فني · مستودع …): المفتاحُ **مانحٌ** — الافتراضُ
     ممنوع، ولا يفتح إلا `true` صريح. فلا يُفتح القسمُ لأحدٍ بأثرٍ رجعيّ لمجرّد
     أنّ خانتَه كانت مؤشَّرةً بالافتراض القديم.

   **والمنحُ اطّلاعٌ إلا في بابٍ واحد**: `canEdit`/`canBank`/`canStatus`/`canCreateReq`
   تبقى على أدوارها، وكلُّ كتابةٍ في `firestore.rules` مقيّدةٌ بالدور (`vendorCreateOk`
   و`crqGate` و`ctrTransitOk` …). والبابُ الوحيدُ المفتوحُ للممنوح هو **إضافةُ طرف**
   لمن دورُه في `ADD_ROLES` (المشرف) — وله قاعدتُه على الخادم لا في المتصفّح وحدَه. */
function roleEligible(r){
  return VIEW_ROLES.indexOf(r === undefined ? _role() : (r || "")) !== -1;
}
function _permAllows(key){
  try{
    var u = _user();
    if(!u) return false;
    if(u.role === "admin") return true;
    var p = u.permissions;
    return roleEligible(u.role) ? (!p || p[key] !== false)   // مؤهَّلٌ: حاجب
                                : !!(p && p[key] === true);  // غيرُ مؤهَّل: مانح
  }catch(e){ return false; }
}
/* بوّابةُ القسم كلِّه: تقرؤها الصفحاتُ الثلاثُ وبطاقةُ اللوحة و«بانتظار إجراءك»
   وزرُّ «تفاصيل الطرف» والرابطُ العميق وحقنُ القائمة الجانبية — أحدَ عشرَ موضعاً
   من مصدرٍ واحد، فلا بابَ يبقى مفتوحاً حين يُغلق الباقي.
   والدورُ لم يعد شرطاً سابقاً بل **يختار طبعَ المفتاح** — و`_permAllows` وحدَها
   تقرّر، فلا يبقى في الترميز موضعان يحكمان الشيءَ نفسَه باصطلاحين. */
function canView(){   return _permAllows("contracts"); }
function canEdit(){   return EDIT_ROLES.indexOf(_role())   !== -1; }
/* الإضافةُ تشترط **الاطّلاعَ والدورَ معاً**: بلا اطّلاعٍ لا شاشةَ يُضاف منها، ولولا
   اشتراطُه لكان كلُّ مشرفٍ في المنصّة مضيفاً وإن لم يُمنح القسمَ أصلاً. */
function canAdd(){    return canView() && ADD_ROLES.indexOf(_role()) !== -1; }

/* ── تعديلُ **هذا** الطرف: بوّابةٌ على المستند لا على الدور وحدَه ──
   `canEdit` تقول «هذا الدورُ يعدّل الأطراف»، وهي تبقى لـ`EDIT_ROLES`. وهذه تقول
   «هذا المستخدمُ يعدّل **هذا** الطرف» — فالمضيفُ يصحّح ما أدخله (رقمُ سجلٍّ نُقل
   خطأً · اسمٌ ناقص · وثيقةٌ نُسيت)، ولا يمتدّ إلى ما أدخله غيرُه.

   **والمِلكيّةُ باسم الدخول لا بالاسم المعروض** (`createdByUser` لا `createdBy`):
   الأسماءُ المعروضةُ تتكرّر وتتغيّر، وهذه **بوّابةُ كتابةٍ لا سطرُ عرض** — فمطابقةُ
   اسمٍ معروضٍ تمنح التعديلَ لمن وافق اسمُه اسمَ المُنشئ. ولذلك **لا ارتدادَ** إليه
   هنا خلافاً لخانات الاعتماد في الوثائق: هناك يُقرأ، وهنا يُؤذَن.
   ونتيجتُه المعلَنة: طرفٌ أُنشئ قبل هذا التغيير لا يحمل `createdByUser` فلا يعدّله
   مشرفٌ أبداً — وأصحابُه أدمنُ ومشترياتٌ يعدّلونه كما كانوا. */
/* ══ رقمُ البند — عمودٌ واحدٌ من مصدرٍ واحد ══
   العقدُ المطبوع يرقّم بنودَه بترتيبها في `lines` منذ اليوم الأول (`(i+1)` في
   `contractPaperHTML`)، وشاشاتُ البنود كانت **بلا رقم**: فمن يُراسَل بـ«البند ٤»
   يعدّ بإصبعه على الشاشة ليعرف أيَّ بندٍ يقصد، ومن يناقش مستخلصاً يصف البندَ بنصّه
   لا برقمه. والترقيمُ هنا **بترتيب مستندِ العرض نفسِه**، وهو ما يجعله متّسقاً بلا
   حيلة: بنودُ المستخلص وبنودُ العقد في أمر التغيير **مبنيّةٌ من `c.lines` واحداً
   بواحدٍ وبترتيبها** (`_extDraft.lines = (c.lines||[]).map(…)`)، فرقمُها هو رقمُ
   بند العقد عينُه؛ وبنودُ أمر التغيير الجديدةُ ترقيمُ مستندِها هي.
   ⛔ ولا يُخزَّن الرقمُ في الوثيقة: البنودُ تُحذف وتُضاف قبل الإرسال، ورقمٌ محفوظٌ
   يصير كاذباً عند أوّل حذف. المرجعُ ترتيبُ المصفوفة — وهو ما تطبعه الورقةُ أصلاً. */
var LN_TH = '<th class="ct-seq">م</th>';
function lnSeq(i){ return '<td class="ct-seq">'+(i+1)+'</td>'; }

function canEditVendor(v){
  /* ★ والماليةُ معهم: `vendorUpdateOk` على الخادم تسمح لها منذ اليوم الأول
     (`['procurement_officer','finance','admin']`)، و`BANK_ROLES` تجعلها **الجهةَ
     الوحيدةَ التي تبدّل الآيبان** — لكنّ الشاشةَ لم تكن تفتح لها النموذجَ أصلاً،
     فكانت صلاحيتُها على الورق بلا بابٍ تدخل منه. وظهر ذلك حين صار المضيفُ يكتب
     الآيبانَ مرّةً ويُقال له «تصحيحُه يمرّ بالمالية» — وعدٌ لا تملك المالية الوفاءَ
     به. فالواجهةُ لحقت بالقاعدة، لا العكس. */
  if(canEdit() || canBank()) return true;    // أدمن ومشتريات ومالية: كلُّ طرف
  if(!canAdd() || !v) return false;          // ومَن لا يملك الإضافةَ لا يملك التصحيح
  var me = _meUser();
  return !!me && String(v.createdByUser || "") === me;
}
function canBank(){   return BANK_ROLES.indexOf(_role())   !== -1; }

/* ══ كتابةُ الآيبان: المالية دائماً، والمضيفُ **عند الإنشاء وحدَه** ══
   الآيبانُ ناقلُ الاحتيال الأوّل، ولذلك كان لـ`BANK_ROLES` وحدَها. والحاجةُ التي
   فتحته: المشرفُ يلقى المقاولَ في الموقع ومعه بياناتُه البنكية، فيسجّلها معه في
   السطر نفسِه — لا أن يمرّرها برسالةٍ إلى المالية لتُدخلها.

   **والحدُّ مقصودٌ عند الإنشاء لأنّ الخطرَ ليس في الكتابة الأولى بل في التبديل:**
   سيناريو الاحتيال الحقيقيُّ هو **تحويلُ مستحقِّ مقاولٍ قائمٍ إلى حسابٍ آخر** —
   طرفٌ عمل شهوراً ثم يتغيّر آيبانُه فجأةً قبل الصرف. أمّا طرفٌ جديدٌ فآيبانُه
   يُدخَل مرّةً مع بقيةِ بياناته ويمرّ على بوّابات الاعتماد كلِّها قبل أن يُصرف
   له ريال. فالمضيفُ يكتبه عند الإنشاء، **ولا يملك تعديلَه بعدها أبداً** — ولا
   حتى على الطرف الذي أضافه هو (`vendorOwnUpdateOk` تُجمّد الآيبانَ صراحةً).

   ⛔ **ولا يُقرأ هذا كإذنِ اطّلاع**: العرضُ يبقى بـ`canBank` — مقنَّعٌ في كل شاشةٍ
   وورقةٍ لغير المالية. مَن يكتبه مرّةً لا يصير مخوَّلاً برؤية حسابات المورّدين. */
var IBAN_NEW_ROLES = ["supervisor","مشرف"];   // يكتبونه عند الإنشاء وحدَه
function canWriteIban(isNew){
  if(canBank()) return true;
  /* ⛔ **`canAdd()` وحدَها لا تكفي**: مسؤولُ المشتريات فيها وهو ممنوعٌ من الآيبان
     في `vendorCreateOk` (لم يُطلَب توسيعُه). ولو قيست البوّابةُ به لَظهر الحقلُ
     له ثمّ **ردّ الخادمُ الحفظَ كلَّه** بعد أن يملأ النموذج — عطلٌ لا يُفهم سببُه.
     فالقائمةُ هنا **نسخةٌ من القائمة الثانية في القاعدة** حرفاً بحرف، ويحرس
     تطابقَهما فحصٌ في hail-tests. و`canAdd()` تبقى شرطاً ثانياً: مَن لا يملك
     إضافةَ الطرف أصلاً لا يكتب آيبانَه. */
  return !!isNew && canAdd() && IBAN_NEW_ROLES.indexOf(_role()) !== -1;
}
/* صيغةُ الآيبان السعوديّ — `SA` ثمّ ٢٢ رقماً. والفحصُ **على الحفظ لا على الحقل**:
   رقمٌ ناقصٌ يُحفَظ يُقرأ صحيحاً ويُحوَّل إليه يومَ الصرف. (نفسُ قاعدة `_iban` في
   `hr-payments.js` — وهي هناك على مسار السداد نفسِه.) */
function ibanClean(raw){ return String(raw==null?"":raw).replace(/[\s-]/g,"").toUpperCase(); }
function ibanOk(raw){
  var v=ibanClean(raw);
  return v==="" || /^SA\d{22}$/.test(v);
}
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
        /* الآيبان لا يُكتب إلا من مخوَّل — ولو وصل في الحمولة من واجهةٍ قديمة.
           و«جديد» هنا **`!s.exists` لا `!id`**: المعرّفُ يُولَّد قبل الحفظ فيصل
           مملوءاً في الحالتين، ووجودُ الوثيقة في المعاملة هو الفيصلُ الوحيد. */
        if(!canWriteIban(!s.exists)) next.bank = cur.bank || { };
        next.updatedAt = _now(); next.updatedBy = _me();
        /* **المِلكيّةُ تُكتب باسم الدخول**: `createdBy` اسمٌ معروضٌ للعرض، و
           `createdByUser` هو ما تُطابقه بوّابةُ `canEditVendor` وقاعدةُ الخادم —
           نفسُ ما تفعله طلباتُ التعاقد وأوامرُ التغيير (`createdByUser`). وبدونه
           لا يعدّل المضيفُ ما أضافه: الشرطُ لا يجد ما يطابقه. */
        if(!s.exists){ next.createdAt=_now(); next.createdBy=_me(); next.createdByUser=_meUser(); }
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
      return { url:url, storagePath:snap.ref.fullPath, name:String(file.name||"").slice(0,120), at:_now(), by:_me() };
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

/* المرآةُ المحلّيةُ تُحدَّث **بالمعرّف** لا بإضافةٍ عمياء.
   جذرُ العلّة: مستمعُ Firestore يعرض الكتابةَ محلّياً (تعويضُ الكمون) قبل أن يُحلَّ
   وعدُ `set()`، فيكون الطلبُ قد دخل المصفوفةَ من اللقطة؛ ثمّ تُضيفه الإضافةُ بعده
   مرّةً ثانية — فتظهر بطاقتان لطلبٍ واحدٍ بالمعرّف نفسِه، وتُحسب مرّتين في
   العدّادات. الإسنادُ بالمعرّف يجعل التكرارَ مستحيلاً مهما كان ترتيبُ الوصول. */
function _mirror(arr, doc, front){
  if(!Array.isArray(arr) || !doc || !doc.id) return arr;
  var i = arr.findIndex(function(x){ return x && x.id === doc.id; });
  if(i >= 0) arr[i] = doc;
  else if(front) arr.unshift(doc);
  else arr.push(doc);
  return arr;
}

function _pushTimeline(doc, event, code, note){
  if(!Array.isArray(doc.timeline)) doc.timeline=[];
  doc.timeline.push({ event:event, code:code, by:_me(), at:_now(), note:note||"" });
  return doc;
}

/* الإنشاء: القيمةُ تُحسب من البنود، والحالةُ من `crqNextStage` — لا من الشاشة.
   وأمرُ الدفع فوق العتبة لا يمرّ إلا بإقرارٍ صريح (طلبُ المالك): العلَمُ يُختم على
   الوثيقة باسم صاحبه ووقتِه والعتبةِ لحظتَها — فيقرأ كلُّ معتمِدٍ أن التجاوز عمدٌ
   معلَنٌ لا سهو، ويبقى الأثرُ في الخطّ الزمنيّ. */
function createRequest(draft){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال بقاعدة البيانات"));
  return genReqId().then(function(id){
    var doc = Object.assign({}, draft);
    doc.value = crqValueOf(doc);
    var overAck = doc.overThreshold === true; delete doc.overThreshold;
    if(doc.engagement==="pay_order" && !payOrderAllowed(doc.value, payOrderThreshold())){
      if(!overAck) return Promise.reject(new Error(
        "أمر الدفع عند "+money0(payOrderThreshold())+" ر.س فأكثر يلزمه إقرارٌ صريح بالتجاوز — أو حوّله إلى عقد"));
      doc.overThresholdAck = { by:_me(), byUser:_meUser(), at:_now(), threshold:payOrderThreshold() };
    }
    /* خطةُ صرف الدفعات — يحدّدها المنشئ هنا وتُجمَّد على الوثيقة: نسبٌ مجموعُها
       ١٠٠٪ وإلا رُفض الإنشاء. ولغير أمر الدفع لا معنى لها فلا تُخزَّن. */
    if(doc.engagement === "pay_order" && doc.paymentPlan != null){
      doc.paymentPlan = normPaymentPlan(doc.paymentPlan);
      if(!paymentPlanOk(doc.paymentPlan))
        return Promise.reject(new Error("خطة صرف الدفعات: نسبٌ موجبةٌ مجموعُها ١٠٠٪ بالضبط"));
    } else if(doc.paymentPlan != null) delete doc.paymentPlan;
    doc.createdAt=_now(); doc.createdBy=_me(); doc.createdByUser=_meUser();
    doc.status = crqNextStage(doc, ceoThreshold());
    _pushTimeline(doc, "إنشاء الطلب", "created",
      (ENGAGEMENTS[doc.engagement]||{}).lbl + " — " + money(doc.value) + " ر.س");
    if(doc.overThresholdAck)
      _pushTimeline(doc, "أمر دفع فوق العتبة — بإقرارٍ صريح", "over_threshold",
        money(doc.value)+" ر.س والعتبة "+money0(doc.overThresholdAck.threshold)+" ر.س");
    if(Array.isArray(doc.paymentPlan) && doc.paymentPlan.length > 1)
      _pushTimeline(doc, "خطة صرف الدفعات — حدّدها منشئ الطلب", "payment_plan",
        doc.paymentPlan.map(function(p){ return p+"٪"; }).join(" ثم "));
    return database.collection(REQUESTS_COL()).doc(id).set(doc).then(function(){
      doc.id=id; _mirror(_reqs, doc, true);
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
        /* فصلُ المهام يُفحَص على **الوثيقة الطازجة**: قد يكون معتمِدٌ آخرُ حرّك
           الطلبَ بعد آخر لقطةٍ رآها المتصفّح، فالقرارُ من الخادم لا من الشاشة. */
        var mode = crqActMode(r, st, role, _meUser(), _me(), _users());
        if(mode === "blocked") throw new Error("اعتمدتَ هذا الطلب في بوّابةٍ سابقة — هذه البوّابة لغيرك");
        if(st === "crq_pending_pm"){ r.pmApprovedAt=_now(); r.pmApprovedBy=_me(); r.pmApprovedByUser=_meUser(); }
        else if(st === "crq_pending_proc"){ r.procApprovedAt=_now(); r.procApprovedBy=_me(); r.procApprovedByUser=_meUser(); r.procApprovedKey=crqProcKey(r); }
        else if(st === "crq_pending_finance"){ r.financeApprovedAt=_now(); r.financeApprovedBy=_me(); r.financeApprovedByUser=_meUser(); r.financeApprovedKey=crqFinanceKey(r); }
        else if(st === "crq_pending_ceo"){ r.ceoApprovedAt=_now(); r.ceoApprovedBy=_me(); r.ceoApprovedByUser=_meUser(); r.ceoApprovedAmount=r2(r.value); }
        else if(st === "crq_pending_pay") throw new Error("السداد يُسجَّل بإيصال");
        // الاعتمادُ نيابةً يُوسَم في الخطّ الزمني — القيدُ يظهر في السجلّ ولو لم يمنع
        var dlg = (mode === "delegate") ? "نيابةً — لا يوجد غيرُك يملك هذه البوّابة" : "";
        _pushTimeline(r, "اعتماد — "+(crqGateOwner(st)||{}).lbl, "approved",
          dlg ? (note ? (note+" · "+dlg) : dlg) : note);
        if(mode === "delegate") r.delegatedApproval = true;
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
    _mirror(_reqs, r, true);
    _audit("إجراء على طلب تعاقد", id+" ⇐ "+(CRQ_STATUS[r.status]||r.status));
    _notify("طلب تعاقد "+id, CRQ_STATUS[r.status]||r.status, id);
    return r;
  });
}

/* تسجيلُ سداد أمر الدفع — **المالية فقط وبإيصالٍ إلزاميّ لكلّ دفعة**.
   (طلبُ المالك) السدادُ **على دفعات**: كلُّ دفعةٍ بمبلغها وإيصالها تُلحَق بمصفوفة
   `payments`، ويبقى الأمرُ «بانتظار السداد» مفتوحاً حتى يكتمل المبلغ فيُغلق —
   نهجُ سداد الدفعة المقدمة نفسُه. و`payment` القديمُ يبقى مكتوباً **بالمجموع
   التراكميّ** وآخرِ إيصال، فكلُّ قارئٍ قديمٍ (الموازنة · الرصيد المستعاض · سند
   الصرف) يرى الرقمَ الصحيح ولو لم يُحدَّث. والدفعةُ لا تتجاوز المتبقّي: سندٌ
   بمبلغٍ فوق قيمته بابُ صرفٍ بلا اعتماد. */
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
      /* والسدادُ تحت فصل المهام كبقية البوّابات — بل هو أولاها: هنا يخرج المال. */
      var pmode = crqActMode(r, r.status, role, _meUser(), _me(), _users());
      if(pmode === "blocked") throw new Error("اعتمدتَ هذا الطلب في بوّابةٍ سابقة — السدادُ لغيرك");
      var due = crqPayDue(r);
      /* منشئُ الطلب هو من يحدّد نسبَ الدفعات: خطةٌ على الوثيقة تقفل مبلغَ الدفعة
         التالية — الماليةُ تنفّذها حرفياً لا تختار. وبلا خطةٍ (وثائقُ قديمة) يبقى
         المبلغُ حراً في حدود المتبقّي. */
      var inst = crqPlanInstallment(r), amt;
      if(inst){
        amt = inst.amount;
        if(payload.amount != null && Math.abs(r2(payload.amount) - amt) > 0.01)
          throw new Error("منشئ الطلب حدّد خطة الصرف — الدفعة "+(inst.index+1)+" من "+inst.count+
                          " هي "+inst.pct+"٪ ("+money(amt)+" ر.س) لا غير");
      } else {
        amt = r2(payload.amount != null ? payload.amount : due);
      }
      if(!(amt > 0)) throw new Error("مبلغ الدفعة إلزامي — اكتب كم يُسدَّد فعلاً");
      if(amt > due + 0.01) throw new Error("الدفعة أكبر من المتبقّي ("+money(due)+" ر.س) — لا يُسدَّد فوق قيمة الأمر");
      if(!Array.isArray(r.payments)) r.payments = [];
      r.payments.push({ id:"PAY-"+Date.now()+"-"+Math.random().toString(36).slice(2,7),
        amount:amt, ref:payload.ref||"", receiptUrl:payload.receiptUrl,
        at:_now(), by:_me(), byUser:_meUser() });
      var paid = 0; r.payments.forEach(function(p){ paid += Number((p||{}).amount)||0; });
      paid = r2(paid);
      // الملخّصُ القديم = المجموعُ التراكميّ وآخرُ إيصال — لقرّاء ما قبل الدفعات
      r.payment = { amount:paid, ref:payload.ref||"", receiptUrl:payload.receiptUrl, at:_now(), by:_me() };
      var done = paid >= r2(Number(r.value)||0) - 0.01;
      r.status = done ? "crq_paid" : "crq_pending_pay";
      var pdlg = (pmode === "delegate") ? " · نيابةً — لا يوجد غيرُك يملك السداد" : "";
      if(pmode === "delegate") r.delegatedApproval = true;
      _pushTimeline(r, done ? "سداد أمر الدفع — اكتمل" : "سداد دفعة من أمر الدفع", "paid",
        money(amt)+" ر.س"+
        (inst?(" (الدفعة "+(inst.index+1)+" من "+inst.count+" — "+inst.pct+"٪ وفق خطة المنشئ)"):"")+
        (payload.ref?(" — "+payload.ref):"")+
        " · المسدَّد "+money(paid)+" من "+money(r.value)+" ر.س"+pdlg);
      r.updatedAt=_now(); r.updatedBy=_me();
      var out=Object.assign({},r); delete out.id;
      t.set(ref, out, { merge:true });
      return r;
    });
  }).then(function(r){
    var i=_reqs.findIndex(function(x){ return x.id===id; });
    if(i>=0) _reqs[i]=r;
    _audit("سداد أمر دفع", id+" — دفعة "+money((r.payments[r.payments.length-1]||{}).amount)+
      " ر.س · المسدَّد "+money(crqPaidTotal(r))+" من "+money(r.value)+" ر.س");
    return r;
  });
}

/* ════ مرفقاتُ الطلب — عرضُ السعر والفاتورةُ وكلُّ مستندٍ يسند القرار ════
   (طلبُ المالك) الرفعُ بـ`uploadVendorDoc` نفسِها — بادئةُ Storage القائمة `po/…`
   عمداً (درسُ hr-payments: مسارٌ جذريٌّ جديدٌ قد يُرفَض صامتاً). والتسجيلُ **معاملةٌ
   على الوثيقة الطازجة** كسائر الإجراءات، فلا يدهس مرفقان متزامنان بعضَهما.
   والحذفُ يرفع **الإشارةَ** من الوثيقة ويُبقي الملفَّ في التخزين: السجلُّ الزمنيُّ
   يذكر من حذف وماذا، وبقاءُ الملفّ أرخصُ من فقدِ أثرٍ يسند قراراً ماليّاً. */
function canAttachReq(r){
  if(!r || crqIsFinal(r.status)) return false;
  var role=_role();
  if(role==="admin" || ["project_manager","procurement_officer","finance","ceo"].indexOf(role)!==-1) return true;
  /* مُنشئُ الطلب يرفق ولو لم يكن من أدوار السلسلة — المطابقةُ باسم الدخول،
     وبالاسم المعروض للوثائق القديمة التي سبقت حقلَه (نهجُ فصل المهام نفسُه). */
  return r.createdByUser ? r.createdByUser===_meUser() : r.createdBy===_me();
}
function canDelAttach(r, att){
  if(!r || !att || crqIsFinal(r.status)) return false;
  if(_role()==="admin") return true;
  return att.byUser ? att.byUser===_meUser() : att.by===_me();
}
function addReqAttachments(id, atts){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  var list=(Array.isArray(atts)?atts:[atts]).filter(function(a){ return a && a.url; });
  if(!list.length) return Promise.resolve(null);
  var ref=database.collection(REQUESTS_COL()).doc(id);
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      if(!s.exists) throw new Error("الطلب غير موجود");
      var r=s.data()||{}; r.id=id;
      if(crqIsFinal(r.status)) throw new Error("الطلب في حالةٍ نهائية — لا تُضاف مرفقات");
      if(!canAttachReq(r)) throw new Error("إضافة المرفق لمُنشئ الطلب أو لأدوار سلسلة اعتماده");
      if(!Array.isArray(r.attachments)) r.attachments=[];
      list.forEach(function(a){
        r.attachments.push({ id:"ATT-"+Date.now()+"-"+Math.random().toString(36).slice(2,7),
          url:String(a.url), storagePath:a.storagePath||"", name:String(a.name||"مرفق").slice(0,120),
          at:_now(), by:_me(), byUser:_meUser() });
      });
      _pushTimeline(r, "إضافة مرفق", "attached",
        list.map(function(a){ return String(a.name||"مرفق").slice(0,120); }).join(" · "));
      r.updatedAt=_now(); r.updatedBy=_me();
      var out=Object.assign({},r); delete out.id;
      t.set(ref,out,{merge:true});
      return r;
    });
  }).then(function(r){
    _mirror(_reqs, r, true);
    _audit("إضافة مرفق لطلب تعاقد", id+" — "+list.length+" ملفاً");
    return r;
  });
}
function deleteReqAttachment(id, attId){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  var ref=database.collection(REQUESTS_COL()).doc(id);
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      if(!s.exists) throw new Error("الطلب غير موجود");
      var r=s.data()||{}; r.id=id;
      var att=(r.attachments||[]).find(function(a){ return a && a.id===attId; });
      if(!att) throw new Error("المرفق غير موجود");
      if(crqIsFinal(r.status)) throw new Error("الطلب في حالةٍ نهائية — لا تُحذف مرفقاته");
      if(!canDelAttach(r, att)) throw new Error("حذف المرفق للأدمن أو لمن أضافه");
      r.attachments=r.attachments.filter(function(a){ return a.id!==attId; });
      _pushTimeline(r, "حذف مرفق", "attach_removed", att.name||"مرفق");
      r.updatedAt=_now(); r.updatedBy=_me();
      var out=Object.assign({},r); delete out.id;
      t.set(ref,out,{merge:true});
      return r;
    });
  }).then(function(r){
    _mirror(_reqs, r, true);
    _audit("حذف مرفق من طلب تعاقد", id);
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

/* تعديلُ بنود الطلب — **للأدمن وحدَه** (طلبُ المالك).

   **العهدُ الذي لا يُنقَض:** «وقّع المعتمِدُ على رقمٍ وسُدِّد غيرُه» — وهو سببُ تجميد
   البنود أصلاً. فالتعديلُ هنا لا يخرقه بل يحترمه بطريقٍ آخر: القيمةُ تُعاد حسابُها
   من البنود، ثمّ **`crqRevalidate` تُسقط بصمةَ المالية** (مفتاحُها يضمّ القيمةَ
   والشروط) و**اعتمادُ التنفيذيِّ يسقط بقيمته** (`ceoApprovedAmount`)، ثمّ
   `crqNextStage` تُرجع الطلبَ إلى بوّابتهما. فما وُقِّع على رقمٍ قديمٍ **يُبطَل**
   لا يُمرَّر. واعتمادُ مدير المشاريع والمشتريات يبقى — بصمتُهما (الطرفُ والتنافس)
   لم تتغيّر.

   والسببُ إلزاميّ: من سقط توقيعُه يقرأ في الخطّ الزمنيِّ لماذا، وبكم تغيّرت القيمة. */
function editRequestLines(id, lines, reason){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  if(_role() !== "admin") return Promise.reject(new Error("تعديل بنود الطلب للأدمن فقط"));
  if(!reason) return Promise.reject(new Error("سبب التعديل إلزامي"));
  var clean = (Array.isArray(lines)?lines:[]).map(function(l){
    return { id: String((l&&l.id)||_uid()), boqLineId: (l&&l.boqLineId)||null,
             desc: String((l&&l.desc)||"").trim(), unit: String((l&&l.unit)||"").trim(),
             qty: Number((l&&l.qty))||0, unitPrice: Number((l&&l.unitPrice))||0,
             budgetCategoryKey: (l&&l.budgetCategoryKey)||"" };
  }).filter(function(l){ return l.desc && l.qty>0; });
  if(!clean.length) return Promise.reject(new Error("أضِف بنداً واحداً على الأقل بوصفٍ وكمية"));
  var ref = database.collection(REQUESTS_COL()).doc(id), th = ceoThreshold();
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      if(!s.exists) throw new Error("الطلب غير موجود");
      var r = s.data()||{}; r.id = id;
      if(crqIsFinal(r.status)) throw new Error("الطلب في حالةٍ نهائية — لا تُعدَّل بنوده");
      var was = r2(r.value);
      r.lines = clean;
      r.value = crqValueOf(r);
      if(r.value <= 0) throw new Error("قيمة الطلب صفر — راجع الكميات والأسعار");
      // فوق العتبة يمرّ **ما وُلد بإقرارٍ صريح** وحدَه — والتعديلُ لا يفتح الباب
      if(r.engagement==="pay_order" && !payOrderAllowed(r.value, payOrderThreshold()) && !r.overThresholdAck)
        throw new Error("أمر الدفع عند "+money0(payOrderThreshold())+" ر.س فأكثر يلزمه إقرارٌ صريح عند الإنشاء — حوّله إلى عقد");
      var next = crqRevalidate(r);              // ما بطَل من التوقيعات يسقط وحدَه
      next.status = crqNextStage(next, th);
      next.id = id; next.updatedAt=_now(); next.updatedBy=_me();
      _pushTimeline(next, "تعديل البنود", "edited",
        money(was)+" ← "+money(next.value)+" ر.س — "+reason);
      var out = Object.assign({}, next); delete out.id;
      t.set(ref, out, { merge:true });
      return next;
    });
  }).then(function(r){
    _mirror(_reqs, r, true);
    _audit("تعديل بنود طلب تعاقد", id+" ⇐ "+money(r.value)+" ر.س — "+reason);
    _notify("طلب تعاقد "+id, "عُدِّلت بنوده — "+money(r.value)+" ر.س", id);
    return r;
  });
}

/* تنفيذُ الإرجاع — **معاملةٌ على الوثيقة الطازجة**، والسببُ إلزاميّ.
   إلزامُ السبب ليس تشدّداً: هذا الفعلُ يُسقط اعتماداتٍ وقّعها آخرون، فمن حقّهم أن
   يقرؤوا في الخطّ الزمنيِّ **لماذا** سقط توقيعُهم. والمنتهي لا يُرجَع: المحوَّلُ
   صار عقداً، والمسدَّدُ خرج ماله، والملغى مغلق. */
function rewindRequest(id, gateKey, reason){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  if(_role() !== "admin") return Promise.reject(new Error("إرجاع الطلب لمرحلةٍ سابقة للأدمن فقط"));
  if(!reason) return Promise.reject(new Error("سبب الإرجاع إلزامي"));
  var ref = database.collection(REQUESTS_COL()).doc(id), th = ceoThreshold();
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      if(!s.exists) throw new Error("الطلب غير موجود");
      var r = s.data()||{}; r.id = id;
      if(crqIsFinal(r.status)) throw new Error("الطلب في حالةٍ نهائية — لا يُرجَع");
      if(crqRewindTargets(r, th).indexOf(gateKey) === -1) throw new Error("هذه المرحلة ليست وجهةً صالحةً لهذا الطلب");
      var from = CRQ_STATUS[r.status] || r.status;
      var next = crqRewind(r, gateKey, th);
      next.id = id; next.updatedAt=_now(); next.updatedBy=_me();
      _pushTimeline(next, "إرجاع إلى "+(crqGateOwner(next.status)||{}).lbl, "rewound",
        "من «"+from+"» — "+reason);
      var out = Object.assign({}, next); delete out.id;
      t.set(ref, out, { merge:true });
      return next;
    });
  }).then(function(r){
    _mirror(_reqs, r, true);
    _audit("إرجاع طلب تعاقد لمرحلة", id+" ⇐ "+(CRQ_STATUS[r.status]||r.status)+" — "+reason);
    _notify("طلب تعاقد "+id, "أُرجع إلى "+(CRQ_STATUS[r.status]||r.status), id);
    return r;
  });
}

/* حذفُ طلبٍ **ملغى** — للأدمن وحدَه (طلبُ المالك).
   لماذا الملغى وحدَه: هو الورقةُ الوحيدةُ التي ماتت **قبل أن تُنتج أثراً** — لا عقدَ
   ولا سداد. فحذفُه تنظيفُ شاشةٍ لا طمسُ سجلٍّ ماليّ. وما عداه لا يُحذف مهما كان
   الدور: المعتمَدُ والمحوَّلُ والمسدَّدُ أثرٌ ماليٌّ يُقرأ ولا يُمحى.
   والحالةُ تُقرأ من **الوثيقة الطازجة** لا من المرآة المحلّية: لقطةٌ قديمةٌ في
   المتصفّح كانت ستسمح بحذف طلبٍ خرج من الإلغاء في متصفّحٍ آخر. والقاعدةُ نفسُها
   مكتوبةٌ في `firestore.rules` — فالرفضُ يقع في الخادم ولو زُوِّرت الواجهة.
   ويبقى **قيدُ التدقيق** شاهداً على الحذف: ما حُذف يُذكر ولا يُنسى. */
function deleteRequest(id){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  if(_role() !== "admin") return Promise.reject(new Error("حذف الطلبات للأدمن فقط"));
  var ref=database.collection(REQUESTS_COL()).doc(id);
  return ref.get().then(function(s){
    if(!s.exists) throw new Error("الطلب غير موجود");
    var r=s.data()||{};
    if(r.status !== "crq_cancelled") throw new Error("لا يُحذف إلا الطلبُ الملغى");
    return ref.delete().then(function(){
      var i=_reqs.findIndex(function(x){ return x.id===id; });
      if(i>=0) _reqs.splice(i,1);
      if(_rOpen===id) _rOpen=null;
      _audit("حذف طلب تعاقد ملغى", id+" — "+(r.vendorName||"")+" — "+money(r.value)+" ر.س");
      return id;
    });
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
    if(res.contract) _mirror(_ctrs, res.contract, true);
    if(res.request)  _mirror(_reqs, res.request, true);
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

/* ════ تسجيلُ سداد الدفعة المقدمة — المالية فقط وبإيصالٍ إلزاميّ ════
   (طلبُ المالك) الماليةُ تدوّن **المبلغَ الفعليَّ** — وقد يكون أقلَّ من دفعة العقد،
   ويجوز السدادُ على دفعاتٍ حتى سقفِ الدفعة. المعاملةُ على الوثيقة الطازجة، وفصلُ
   السقف في طبقة البيانات: لا يُسدَّد فوق المتبقّي، فلا يخرج مالٌ زائدٌ باسم مقدمة. */
function payAdvance(id, payload){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  var p = payload || {};
  if(!p.receiptUrl) return Promise.reject(new Error("إيصال السداد إلزامي"));
  var amt = r2(Number(p.amount));
  if(!(amt > 0)) return Promise.reject(new Error("مبلغ السداد إلزامي — اكتب كم سُدِّد فعلاً"));
  var role=_role();
  if(["finance","admin"].indexOf(role) === -1) return Promise.reject(new Error("سداد الدفعة المقدمة للمالية فقط"));
  var ref=database.collection(CONTRACTS_COL()).doc(id);
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      if(!s.exists) throw new Error("العقد غير موجود");
      var c=s.data()||{}; c.id=id;
      if(ADV_PAY_STATUSES.indexOf(c.status) === -1) throw new Error("لا يُسدَّد على حالة العقد الحالية");
      var a=Object.assign({}, c.advance||{});
      if(a.paid == null) throw new Error("هذا العقد لا يتتبّع سداد المقدمة (أُنشئ قبل الميزة)");
      var due = advanceDueOf(c);
      if(!(due > 0)) throw new Error("الدفعة المقدمة مسدَّدة بالفعل — لا متبقٍّ عليها");
      if(amt > due + 0.01) throw new Error("المبلغ يتجاوز المتبقّي من الدفعة المقدمة ("+money(due)+" ر.س)");
      a.paid = r2((Number(a.paid)||0) + amt);
      a.payments = (Array.isArray(a.payments)?a.payments:[]).concat([{
        amount:amt, ref:String(p.ref||""), receiptUrl:String(p.receiptUrl),
        at:_now(), by:_me(), byUser:_meUser()
      }]);
      c.advance = a;
      var left = r2(Math.max(0, (Number(a.amount)||0) - a.paid));
      _pushTimeline(c, "سداد دفعة مقدمة", "advance_paid",
        money(amt)+" ر.س من "+money(a.amount)+(p.ref?(" — "+p.ref):"")+
        (left>0 ? " · المتبقّي "+money(left)+" ر.س" : " · اكتملت الدفعة"));
      c.updatedAt=_now(); c.updatedBy=_me();
      var out=Object.assign({},c); delete out.id;
      t.set(ref,out,{merge:true});
      return c;
    });
  }).then(function(c){
    var i=_ctrs.findIndex(function(x){ return x.id===id; });
    if(i>=0) _ctrs[i]=c;
    _audit("سداد دفعة مقدمة", id+" — "+money(amt)+" ر.س");
    _notify("سداد دفعة مقدمة", id+" — "+money(amt)+" ر.س", id);
    return c;
  });
}

/* ════ إلغاءُ قيدِ سدادٍ للمقدمة — تصحيحُ خطأِ المحاسب ════   (طلبُ المالك)
   المعاملةُ تُعيد قراءةَ الوثيقة الطازجة وتُطابق القيدَ **بختمِ وقتِه** لا بموضعِه
   وحدَه: لو أُضيف قيدٌ من جهازٍ آخر بين العرضِ والضغط، فُهرسُ الصفّ نفسُه قد يشير
   إلى قيدٍ آخر — فالمطابقةُ بالوقت تُسقط الإلغاءَ بدل أن تُلغي البريء. */
function voidAdvancePayment(id, payload){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  var p = payload || {};
  var reason = String(p.reason||"").trim();
  if(!reason) return Promise.reject(new Error("سبب الإلغاء إلزامي — يبقى في السجل"));
  var idx = Number(p.index);
  if(!isFinite(idx) || idx < 0) return Promise.reject(new Error("قيد السداد غير محدَّد"));
  var role=_role();
  if(["finance","admin"].indexOf(role) === -1) return Promise.reject(new Error("إلغاء قيد السداد للمالية فقط"));
  var ref=database.collection(CONTRACTS_COL()).doc(id);
  var voided=0;
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      if(!s.exists) throw new Error("العقد غير موجود");
      var c=s.data()||{}; c.id=id;
      if(ctrIsFinal(c.status)) throw new Error("العقد في حالةٍ نهائية — لا يُعدَّل قيدُ سدادِه");
      var a=Object.assign({}, c.advance||{});
      if(a.paid == null) throw new Error("هذا العقد لا يتتبّع سداد المقدمة (أُنشئ قبل الميزة)");
      var pays=(Array.isArray(a.payments)?a.payments:[]).slice();
      var e=pays[idx];
      if(!e) throw new Error("قيد السداد غير موجود");
      if(p.at && String(e.at||"") !== String(p.at)) throw new Error("تغيّرت قيودُ السداد — أعد فتح العقد ثم حاول");
      if(e.voided === true) throw new Error("هذا القيد ملغىً بالفعل");
      var amt=r2(Number(e.amount)); if(!(amt > 0)) throw new Error("قيدٌ بلا مبلغ — لا يُلغى");
      var room=advanceVoidableOf(c);
      if(amt > room + 0.01)
        throw new Error("لا يُلغى: استُردّ من المستخلصات "+money(advanceRecoveredOf(c))+" ر.س، والمتاح للإلغاء "+money(room)+" ر.س");
      pays[idx]=Object.assign({}, e, { voided:true, voidReason:reason, voidedAt:_now(), voidedBy:_me(), voidedByUser:_meUser() });
      a.payments=pays;
      a.paid=r2(Math.max(0, r2((Number(a.paid)||0) - amt)));
      c.advance=a; voided=amt;
      _pushTimeline(c, "إلغاء قيد سداد الدفعة المقدمة", "advance_void",
        money(amt)+" ر.س"+(e.ref?(" — "+e.ref):"")+" · "+reason+
        " · المسدَّدُ الآن "+money(a.paid)+" من "+money(Number(a.amount)||0)+" ر.س");
      c.updatedAt=_now(); c.updatedBy=_me();
      var out=Object.assign({},c); delete out.id;
      t.set(ref,out,{merge:true});
      return c;
    });
  }).then(function(c){
    var i=_ctrs.findIndex(function(x){ return x.id===id; });
    if(i>=0) _ctrs[i]=c;
    _audit("إلغاء قيد سداد دفعة مقدمة", id+" — "+money(voided)+" ر.س — "+reason);
    _notify("إلغاء قيد سداد دفعة مقدمة", id+" — "+money(voided)+" ر.س — "+reason, id);
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
function extCtx(ext, contract, exts){
  return {
    prevGross: prevGrossOf(exts||_exts, contract, ext && ext.id),
    materialsIssued: Number((ext||{}).materialsIssued)||0,
    penaltyAmount:   Number((ext||{}).penaltyAmount)||0,
    ncDeduction:     Number((ext||{}).ncDeduction)||0
  };
}
function extCalc(ext, contract){ return extNet(ext, contract, extCtx(ext, contract)); }
/* الصافي المستحقُّ للمستخلص كما تعرضه شاشتُه وزرُّ سداده: لقطةُ السداد إن
   وُجدت (تُكتب في payExtract وقتَ الصرف)، وإلا الحسابُ الحيُّ من البنود.
   كانت بطاقةُ «المالية — السداد» وملخّصُ اللوحة و«بانتظار إجراءك» تقرأ
   `settled.net` وحدَه — وهو لا يوجد قبل السداد — فيظهر المستخلصُ المعلّق
   بمتبقٍّ صفر. نقيةٌ: تأخذ قائمةَ المستخلصات وسيطاً لحساب prevGross منها
   لا من حالة الوحدة، فيفحصها hail-tests بلا متصفّح. */
function extDueNet(e, c, exts){
  if(e && e.settled) return r2(Number(e.settled.net)||0);
  return r2(extNet(e, c, extCtx(e, c, exts)).net);
}

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
    delete doc.attachFiles;   // ملفاتُ المتصفّح لا تُكتب في Firestore — تُرفَع بعد الإنشاء برقم المستخلص
    doc.contractId = contract.id;
    doc.createdAt=_now(); doc.createdBy=_me(); doc.createdByUser=_meUser();
    doc.status = extNextStage(doc, calc.net, ceoThreshold());
    _pushTimeline(doc, "إعداد المستخلص", "created", "صافي "+money(calc.net)+" ر.س");
    return database.collection(EXTRACTS_COL()).doc(id).set(doc).then(function(){
      doc.id=id; _mirror(_exts, doc, false);
      _audit("إعداد مستخلص", id+" — "+contract.id+" — صافي "+money(calc.net)+" ر.س");
      _notify("مستخلصٌ جديد "+id, contract.vendorName||"", id);
      return id;
    });
  });
}

/* حذفُ عقدٍ **لم يُوقَّع بعد** — للأدمن (طلبُ المالك: عقدٌ أُنشئ تجربةً).

   **لماذا يجوز هنا وحدَه.** العقدُ سجلٌّ ماليٌّ لا يُمحى — إلا في نافذةٍ واحدة:
   ما بين إنشائه وتوقيعِ الطرف. في تلك النافذة **لم يُنتج أثراً**: لا مستخلصَ ولا
   أمرَ تغييرٍ ولا سداد — لأن الثلاثة لا تُنشأ إلا على عقدٍ **سارٍ** (يحرسه الكود
   والقواعد معاً). فحالةُ «بانتظار التوقيع» وحدَها ضمانةٌ كافيةٌ على الخادم: لا
   حاجةَ لاستعلامٍ عن أبناءٍ لا يمكن أن يوجدوا. وما بعدها لا يُحذف مهما كان الدور —
   والفسخُ (`terminate`) هو بابُ إنهاء العقد الساري، لا الحذف.

   **وحذفُه يُحرِّر طلبَه.** الطلبُ صار `crq_converted` وقتَ التحويل، فلو حُذف العقدُ
   وحدَه لبقي الطلبُ يشير إلى عقدٍ غيرِ موجود — سطرٌ ميتٌ في البيانات. فالمعاملةُ
   الواحدةُ تحذف العقدَ **وتُعيد الطلبَ إلى «معتمَد»** وتمسح `contractId`: كأنّ
   التحويلَ لم يقع. وبذلك يستأنف الطلبُ مسارَه — يُحوَّل ثانيةً أو يُلغى ثمّ يُحذف. */
function deleteContract(id, reason){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  if(_role() !== "admin") return Promise.reject(new Error("حذف العقد للأدمن فقط"));
  if(!reason) return Promise.reject(new Error("سبب الحذف إلزامي"));
  // حزامٌ ثانٍ فوق ضمانة الحالة: بياناتٌ قديمةٌ قد تحمل ما لا يسمح به الكودُ اليوم
  if(extractsFor(id).length) return Promise.reject(new Error("للعقد مستخلصاتٌ — لا يُحذف"));
  if(changesFor(id).length)  return Promise.reject(new Error("للعقد أوامرُ تغيير — لا يُحذف"));
  var cRef=database.collection(CONTRACTS_COL()).doc(id);
  return database.runTransaction(function(t){
    return t.get(cRef).then(function(cs){
      if(!cs.exists) throw new Error("العقد غير موجود");
      var c=cs.data()||{}; c.id=id;
      if(c.status !== "ctr_pending_signature")
        throw new Error("لا يُحذف إلا عقدٌ لم يُوقَّع بعد — الساري يُفسَخ ولا يُمحى");
      var reqId=String(c.requestId||"");
      if(!reqId){ t.delete(cRef); return { id:id, req:null }; }
      var rRef=database.collection(REQUESTS_COL()).doc(reqId);
      return t.get(rRef).then(function(rs){
        t.delete(cRef);
        if(!rs.exists) return { id:id, req:null };
        var r=rs.data()||{}; r.id=reqId;
        if(r.contractId === id || r.status === "crq_converted"){
          r.status="crq_approved"; r.contractId="";
          r.updatedAt=_now(); r.updatedBy=_me();
          _pushTimeline(r, "أُلغي التحويل — حُذف العقد "+id, "unconverted", reason);
          var out=Object.assign({}, r); delete out.id;
          t.set(rRef, out, { merge:true });
          return { id:id, req:r };
        }
        return { id:id, req:null };
      });
    });
  }).then(function(res){
    var i=_ctrs.findIndex(function(x){ return x.id===id; });
    if(i>=0) _ctrs.splice(i,1);
    if(_cOpen===id) _cOpen=null;
    if(res.req) _mirror(_reqs, res.req, true);
    _audit("حذف عقد لم يُوقَّع", id+(res.req?(" — أُعيد الطلب "+res.req.id+" إلى «معتمد»"):"")+" — "+reason);
    return res;
  });
}

/* إرجاعُ المستخلص إلى بوّابةٍ محدّدة — للأدمن، بالقاعدة نفسِها التي للطلب.
   والصافي يُحسب من العقد لا يُقرأ مخزَّناً: توجيهُ المستخلص دالّةٌ في صافيه. */
function rewindExtract(id, gateKey, reason){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  if(_role() !== "admin") return Promise.reject(new Error("إرجاع المستخلص لمرحلةٍ سابقة للأدمن فقط"));
  if(!reason) return Promise.reject(new Error("سبب الإرجاع إلزامي"));
  var ref=database.collection(EXTRACTS_COL()).doc(id), th=ceoThreshold();
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      if(!s.exists) throw new Error("المستخلص غير موجود");
      var e=s.data()||{}; e.id=id;
      if(extIsFinal(e.status)) throw new Error("المستخلص في حالةٍ نهائية — لا يُرجَع");
      var c=contractById(e.contractId);
      if(!c) throw new Error("عقد المستخلص غير محمَّل");
      var net=r2(extCalc(e,c).net);
      if(extRewindTargets(e, net, th).indexOf(gateKey) === -1) throw new Error("هذه المرحلة ليست وجهةً صالحةً لهذا المستخلص");
      var from=EXT_STATUS[e.status]||e.status;
      var next=extRewind(e, gateKey, net, th);
      next.id=id; next.updatedAt=_now(); next.updatedBy=_me();
      _pushTimeline(next, "إرجاع إلى "+(extGateOwner(next.status)||{}).lbl, "rewound", "من «"+from+"» — "+reason);
      var out=Object.assign({}, next); delete out.id;
      t.set(ref, out, { merge:true });
      return next;
    });
  }).then(function(e){
    var i=_exts.findIndex(function(x){ return x.id===id; });
    if(i>=0) _exts[i]=e; else _mirror(_exts, e, false);
    _audit("إرجاع مستخلص لمرحلة", id+" ⇐ "+(EXT_STATUS[e.status]||e.status)+" — "+reason);
    _notify("مستخلص "+id, "أُرجع إلى "+(EXT_STATUS[e.status]||e.status), id);
    return e;
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
        var mode = extActMode(e, e.status, role, _meUser(), _me(), _users());
        if(mode === "blocked") throw new Error("اعتمدتَ هذا المستخلص في بوّابةٍ سابقة — هذه البوّابة لغيرك");
        if(e.status==="ext_pending_pm"){ e.pmApprovedAt=_now(); e.pmApprovedBy=_me(); e.pmApprovedByUser=_meUser(); }
        else if(e.status==="ext_pending_ceo"){ e.ceoApprovedAt=_now(); e.ceoApprovedBy=_me(); e.ceoApprovedByUser=_meUser(); e.ceoApprovedAmount=r2(calc.net); }
        else if(e.status==="ext_pending_finance") throw new Error("السداد يُسجَّل بإيصال");
        var edlg = (mode === "delegate") ? "نيابةً — لا يوجد غيرُك يملك هذه البوّابة" : "";
        if(mode === "delegate") e.delegatedApproval = true;
        _pushTimeline(e, "اعتماد — "+(extGateOwner(e.status)||{}).lbl, "approved",
          edlg ? (note ? (note+" · "+edlg) : edlg) : note);
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

/* تعديلُ المستخلص — **بالقاعدة التي حكمت تعديلَ بنود الطلب**: البابُ يُفتَح،
   وما وُقّع على رقمٍ قديمٍ يُبطَل.

   **لماذا كان مغلقاً ولماذا يُفتَح.** المستخلصُ كان يُنشأ مرّةً ثمّ لا يُمسّ: من
   أخطأ كميةً أو نسي خصماً أو اختار «دوريّ» وهو ختاميٌّ **لا سبيلَ له إلا الرفض
   وإعداد مستخلصٍ جديد** — فيُلوّث الخطُّ الزمنيُّ للعقد بمستخلصٍ مرفوضٍ سببُه خطأٌ
   كتابيّ. والحاجةُ حقيقيةٌ ويوميّة.

   **والخطرُ الحقيقيُّ ليس التعديلَ بل التعديلَ الصامت:** رقمٌ اعتمده مديرُ
   المشاريع ووقّع المقاولُ على صافيه يتغيّر بعده بلا أن يعلم أحد. ولذلك:
   • **تسقط الاعتماداتُ كلُّها** — لا واحدةٌ منها: الكمياتُ هي عينُ ما يعتمدونه.
   • **ويسقط توقيعُ المقاول** — أقرّ بكمياتٍ لم تعد هي.
   • ثمّ `extNextStage` تقرّر من الصفر، فيعود المستخلصُ إلى بوّابته الأولى.
   • **والسببُ إلزاميّ**، ويُكتب في الخطّ الزمنيّ مع الصافي قبلَه وبعدَه — فمن سقط
     اعتمادُه يقرأ لماذا وبكم تغيّر. */
function editExtract(id, patch, reason){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  if(["project_manager","admin"].indexOf(_role()) === -1)
    return Promise.reject(new Error("تعديلُ المستخلص لمدير المشروع أو الأدمن"));
  var why=String(reason||"").trim();
  if(!why) return Promise.reject(new Error("سبب التعديل إلزامي"));
  var ref=database.collection(EXTRACTS_COL()).doc(id);
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      if(!s.exists) throw new Error("المستخلص غير موجود");
      var e=s.data()||{}; e.id=id;
      if(extIsFinal(e.status)) throw new Error("المستخلصُ في حالةٍ نهائية — لا يُعدَّل");
      var c=contractById(e.contractId);
      if(!c) throw new Error("عقد المستخلص غير محمَّل");
      var was=r2(extCalc(e, c).net);
      var d=patch||{};
      /* الحقولُ القابلةُ للتعديل وحدَها تُنسَخ — لا عقدٌ ولا حالةٌ ولا خطٌّ زمنيٌّ
         ولا سدادٌ يُكتب من الشاشة (وإلا صار «التعديل» باباً خلفياً لكل حقل). */
      var next=Object.assign({}, e);
      next.period = String(d.period||"");
      next.isFinal = !!d.isFinal;
      next.materialsIssued = r2(Math.max(0, Number(d.materialsIssued)||0));
      next.penaltyAmount   = r2(Math.max(0, Number(d.penaltyAmount)||0));
      next.ncDeduction     = r2(Math.max(0, Number(d.ncDeduction)||0));
      next.lines = (Array.isArray(d.lines)?d.lines:[]).map(function(l){
        return { lineId:l.lineId, desc:l.desc||"", unit:l.unit||"",
                 unitPrice:Number(l.unitPrice)||0, cumQty:Number(l.cumQty)||0 };
      });
      if(!next.lines.length) throw new Error("لا بنودَ في المستخلص");
      var g=extCumGuard(next, c, _exts);
      if(!g.ok) throw new Error(_guardMsg(g));
      var calc=extNet(next, c, { prevGross:prevGrossOf(_exts, c, id),
        materialsIssued:next.materialsIssued, penaltyAmount:next.penaltyAmount,
        ncDeduction:next.ncDeduction });
      if(calc.period < 0) throw new Error("قيمة الفترة سالبة — التراكميُّ أقلُّ ممّا اعتُمد سابقاً");
      /* ما وُقّع على الأرقام القديمة يسقط — الاعتماداتُ وتوقيعُ المقاول معاً */
      ["pmApprovedAt","pmApprovedBy","pmApprovedByUser","ceoApprovedAt","ceoApprovedBy",
       "ceoApprovedByUser","ceoApprovedAmount","delegatedApproval","signature"].forEach(function(k){
        next[k] = null;   // `null` لا `delete`: الكتابةُ بالدمج لا تمحو حقلاً محذوفاً
      });
      next.status = extNextStage(next, calc.net, ceoThreshold());
      _pushTimeline(next, "تعديل المستخلص", "edited",
        money(was)+" ← "+money(calc.net)+" ر.س — "+why+" · سقطت الاعتماداتُ وتوقيعُ المقاول");
      next.updatedAt=_now(); next.updatedBy=_me();
      var out=Object.assign({}, next); delete out.id;
      t.set(ref, out, { merge:true });
      return next;
    });
  }).then(function(next){
    var i=_exts.findIndex(function(x){ return x.id===id; });
    if(i>=0) _exts[i]=next;
    _audit("تعديل مستخلص", id+" — "+why);
    _notify("مستخلص "+id, "عُدِّل وأُعيد للاعتماد", id);
    return next;
  });
}

/* رفعُ نسخة المستخلص موقّعةً من المقاول — **بابُ السداد**.

   تُقبَل في أيّ مرحلةٍ غيرِ نهائية لا عند المالية وحدَها: المقاولُ يوقّع حين يستلم
   الورقةَ من مدير المشروع، لا حين تصل الماليةَ. ويُحفَظ مع النسخة **صافي وقتِ
   التوقيع** — فما وُقّع عليه رقمٌ لا مستند. */
function signExtract(id, att){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  if(!att || !att.url) return Promise.reject(new Error("نسخةُ المستخلص الموقّعة إلزامية"));
  if(["project_manager","finance","admin"].indexOf(_role()) === -1)
    return Promise.reject(new Error("رفعُ النسخة الموقّعة لمدير المشروع أو المالية أو الأدمن"));
  var ref=database.collection(EXTRACTS_COL()).doc(id);
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      if(!s.exists) throw new Error("المستخلص غير موجود");
      var e=s.data()||{}; e.id=id;
      if(extIsFinal(e.status)) throw new Error("المستخلص في حالةٍ نهائية — لا تُرفع له نسخةٌ موقّعة");
      var c=contractById(e.contractId);
      if(!c) throw new Error("عقد المستخلص غير محمَّل");
      var calc=extCalc(e, c);
      e.signature={ url:att.url, name:att.name||"", storagePath:att.storagePath||"",
                    net:r2(calc.net), at:_now(), by:_me() };
      _pushTimeline(e, "استلامُ نسخة المستخلص موقّعةً من المقاول", "signed", money(calc.net)+" ر.س");
      e.updatedAt=_now(); e.updatedBy=_me();
      var out=Object.assign({},e); delete out.id;
      t.set(ref, out, { merge:true });
      return e;
    });
  }).then(function(e){
    var i=_exts.findIndex(function(x){ return x.id===id; });
    if(i>=0) _exts[i]=e;
    _audit("توقيعُ مقاولٍ على مستخلص", id+" — "+money((e.signature||{}).net)+" ر.س");
    return e;
  });
}

/* ════ مرفقاتُ المستخلص — بنمط مرفقات الطلب نفسِه ════   (طلبُ المالك)
   محاضرُ القياس وصورُ الموقع وكشوفُ الكميات تسند أرقامَ المستخلص، فتُرفَق به
   عند الإنشاء أو من بطاقته القائمة. الرفعُ بـ`uploadVendorDoc` — بادئةُ Storage
   القائمة `po/…` عمداً (درسُ hr-payments: مسارٌ جذريٌّ جديدٌ قد يُرفَض صامتاً).
   والتسجيلُ **معاملةٌ على الوثيقة الطازجة**، والحذفُ يرفع الإشارةَ ويُبقي الملفَّ
   في التخزين — كمرفقات الطلب حرفاً بحرف. والإرفاقُ **لا يمسّ الحالة**: لا اعتمادَ
   يسقط ولا بوّابةَ تتقدّم، فقواعدُ الخادم القائمة (`extUpdateOk`) تُجيزه لأدوار
   سلسلة المستخلص بلا تعديل. */
function canAttachExt(e){
  if(!e || extIsFinal(e.status)) return false;
  return ["project_manager","ceo","finance","admin"].indexOf(_role())!==-1;
}
function canDelExtAttach(e, att){
  if(!e || !att || extIsFinal(e.status)) return false;
  if(_role()==="admin") return true;
  return att.byUser ? att.byUser===_meUser() : att.by===_me();
}
function addExtAttachments(id, atts){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  var list=(Array.isArray(atts)?atts:[atts]).filter(function(a){ return a && a.url; });
  if(!list.length) return Promise.resolve(null);
  var ref=database.collection(EXTRACTS_COL()).doc(id);
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      if(!s.exists) throw new Error("المستخلص غير موجود");
      var e=s.data()||{}; e.id=id;
      if(extIsFinal(e.status)) throw new Error("المستخلص في حالةٍ نهائية — لا تُضاف مرفقات");
      if(!canAttachExt(e)) throw new Error("إضافة المرفق لأدوار سلسلة اعتماد المستخلص");
      if(!Array.isArray(e.attachments)) e.attachments=[];
      list.forEach(function(a){
        e.attachments.push({ id:"ATT-"+Date.now()+"-"+Math.random().toString(36).slice(2,7),
          url:String(a.url), storagePath:a.storagePath||"", name:String(a.name||"مرفق").slice(0,120),
          at:_now(), by:_me(), byUser:_meUser() });
      });
      _pushTimeline(e, "إضافة مرفق", "attached",
        list.map(function(a){ return String(a.name||"مرفق").slice(0,120); }).join(" · "));
      e.updatedAt=_now(); e.updatedBy=_me();
      var out=Object.assign({},e); delete out.id;
      t.set(ref,out,{merge:true});
      return e;
    });
  }).then(function(e){
    var i=_exts.findIndex(function(x){ return x.id===id; });
    if(i>=0) _exts[i]=e; else _mirror(_exts, e, false);
    _audit("إضافة مرفق لمستخلص", id+" — "+list.length+" ملفاً");
    return e;
  });
}
function deleteExtAttachment(id, attId){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  var ref=database.collection(EXTRACTS_COL()).doc(id);
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      if(!s.exists) throw new Error("المستخلص غير موجود");
      var e=s.data()||{}; e.id=id;
      var att=(e.attachments||[]).find(function(a){ return a && a.id===attId; });
      if(!att) throw new Error("المرفق غير موجود");
      if(extIsFinal(e.status)) throw new Error("المستخلص في حالةٍ نهائية — لا تُحذف مرفقاته");
      if(!canDelExtAttach(e, att)) throw new Error("حذف المرفق للأدمن أو لمن أضافه");
      e.attachments=e.attachments.filter(function(a){ return a.id!==attId; });
      _pushTimeline(e, "حذف مرفق", "attach_removed", att.name||"مرفق");
      e.updatedAt=_now(); e.updatedBy=_me();
      var out=Object.assign({},e); delete out.id;
      t.set(ref,out,{merge:true});
      return e;
    });
  }).then(function(e){
    var i=_exts.findIndex(function(x){ return x.id===id; });
    if(i>=0) _exts[i]=e; else _mirror(_exts, e, false);
    _audit("حذف مرفق من مستخلص", id);
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
      /* سدادُ المستخلص تحت فصل المهام — وهو أولى المواضع به: هنا يخرج المال شهرياً. */
      var pmode = extActMode(e, e.status, role, _meUser(), _me(), _users());
      if(pmode === "blocked") throw new Error("اعتمدتَ هذا المستخلص في بوّابةٍ سابقة — السدادُ لغيرك");
      if(pmode === "delegate") e.delegatedApproval = true;
      var c=contractById(e.contractId);
      if(!c) throw new Error("عقد المستخلص غير محمَّل");
      var cRef=database.collection(CONTRACTS_COL()).doc(e.contractId);
      return t.get(cRef).then(function(cs){
        if(!cs.exists) throw new Error("العقد غير موجود");
        var fresh=cs.data()||{}; fresh.id=e.contractId;
        var calc=extCalc(e, fresh);
        /* **لا مالَ بلا إقرارِ المقاول** — والحارسُ هنا لا في الزرّ وحدَه، وعلى
           الصافي الطازج لا على المخزَّن: توقيعٌ على رقمٍ قديمٍ ليس توقيعاً على هذا. */
        var sgOk=extPayGuard(e, calc.net);
        if(!sgOk.ok) throw new Error(sgOk.why);
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
      doc.id=id; _mirror(_chgs, doc, false);
      _audit("إنشاء أمر تغيير", id+" — "+contract.id+" — "+money(doc.amount)+" ر.س");
      _notify("أمرُ تغييرٍ جديد "+id, (contract.vendorName||"")+" — "+money(doc.amount)+" ر.س", id);
      return id;
    });
  });
}

/* اعتمادٌ أو رفضٌ — معاملةٌ تقرأ الوثيقةَ الطازجة كبقية البوّابات. */
/* إرجاعُ أمر التغيير إلى بوّابةٍ محدّدة — للأدمن، بالقاعدة نفسِها. */
function rewindChange(id, gateKey, reason){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  if(_role() !== "admin") return Promise.reject(new Error("إرجاع أمر التغيير لمرحلةٍ سابقة للأدمن فقط"));
  if(!reason) return Promise.reject(new Error("سبب الإرجاع إلزامي"));
  var ref=database.collection(CHANGES_COL()).doc(id), th=ceoThreshold();
  return database.runTransaction(function(t){
    return t.get(ref).then(function(s){
      if(!s.exists) throw new Error("أمر التغيير غير موجود");
      var g=s.data()||{}; g.id=id;
      if(chgIsFinal(g.status)) throw new Error("أمر التغيير في حالةٍ نهائية — لا يُرجَع");
      if(chgRewindTargets(g, th).indexOf(gateKey) === -1) throw new Error("هذه المرحلة ليست وجهةً صالحةً لهذا الأمر");
      var from=CHG_STATUS[g.status]||g.status;
      var next=chgRewind(g, gateKey, th);
      next.id=id; next.updatedAt=_now(); next.updatedBy=_me();
      _pushTimeline(next, "إرجاع إلى "+(chgGateOwner(next.status)||{}).lbl, "rewound", "من «"+from+"» — "+reason);
      var out=Object.assign({}, next); delete out.id;
      t.set(ref, out, { merge:true });
      return next;
    });
  }).then(function(g){
    var i=_chgs.findIndex(function(x){ return x.id===id; });
    if(i>=0) _chgs[i]=g; else _mirror(_chgs, g, false);
    _audit("إرجاع أمر تغيير لمرحلة", id+" ⇐ "+(CHG_STATUS[g.status]||g.status)+" — "+reason);
    _notify("أمر تغيير "+id, "أُرجع إلى "+(CHG_STATUS[g.status]||g.status), id);
    return g;
  });
}

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
        var cmode = chgActMode(g, g.status, role, _meUser(), _me(), _users());
        if(cmode === "blocked") throw new Error("اعتمدتَ أمرَ التغيير في بوّابةٍ سابقة — هذه البوّابة لغيرك");
        if(g.status==="chg_pending_pm"){ g.pmApprovedAt=_now(); g.pmApprovedBy=_me(); g.pmApprovedByUser=_meUser(); }
        else if(g.status==="chg_pending_proc"){ g.procApprovedAt=_now(); g.procApprovedBy=_me(); g.procApprovedByUser=_meUser(); }
        else if(g.status==="chg_pending_finance"){ g.financeApprovedAt=_now(); g.financeApprovedBy=_me(); g.financeApprovedByUser=_meUser(); }
        else if(g.status==="chg_pending_ceo"){ g.ceoApprovedAt=_now(); g.ceoApprovedBy=_me(); g.ceoApprovedByUser=_meUser(); g.ceoApprovedAmount=r2(Math.abs(Number(g.amount)||0)); }
        var cdlg = (cmode === "delegate") ? "نيابةً — لا يوجد غيرُك يملك هذه البوّابة" : "";
        if(cmode === "delegate") g.delegatedApproval = true;
        _pushTimeline(g, "اعتماد — "+(chgGateOwner(g.status)||{}).lbl, "approved",
          cdlg ? (note ? (note+" · "+cdlg) : cdlg) : note);
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
/* قائمةُ المستخدمين وأدوارُهم — مصدرٌ واحدٌ تديره «إدارة مستخدمي المشتريات».
   يقرؤها مهربُ فصل المهام ليعرف: أثمّةَ شخصٌ آخرُ يملك هذه البوّابة أصلاً؟ */
function _users(){ try{ return Array.isArray(USERS) ? USERS : []; }catch(e){ return []; } }

/* ════════════════════════════════════════════════════════════════════
   ٦) سجلُّ الأطراف — الواجهة
   ════════════════════════════════════════════════════════════════════ */
var _page    = "";        // الصفحةُ المعروضة حالياً من هذه الوحدة
var _vFilter = { q:"", kind:"", entity:"", status:"", trade:"" };
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
    if(!kindMatches(v, _vFilter.kind)) return false;
    if(_vFilter.entity && normEntity(v.entityType) !== _vFilter.entity) return false;
    if(_vFilter.status && (v.status||"active") !== _vFilter.status) return false;
    if(!vendorHasTrade(v, _vFilter.trade)) return false;
    if(q){
      // نوعُ الأعمال داخلَ البحث: من يكتب «عزل» في المربّع يقصد التخصّصَ لا الاسمَ فقط
      var hay = normName(v.name) + " " + normName((v.aliases||[]).join(" ")) + " " +
                normName(identityOf(v).number) + " " + normName((v.legal||{}).vatNumber) + " " +
                normName(vendorTrades(v).map(tradeLabel).join(" "));
      // والرقمُ مسارٌ مستقلٌّ لا حرفٌ في كومة النصّ: مَن يبحث برقمٍ يكتبه بالصيغة
      // التي حفظها في جوّاله (بصفرٍ أو بمفتاحٍ دوليّ)، وهي غيرُ الصيغة المخزَّنة.
      if(hay.indexOf(q) === -1 && !vendorMatchesPhone(v, _vFilter.q)) return false;
    }
    return true;
  });

  // عدّادُ الامتثال — رقمٌ واحدٌ يُقرأ قبل أيّ شيءٍ آخر في الشاشة
  var expired=0, soon=0;
  all.forEach(function(v){ var c=vendorComplianceState(v,today); expired+=c.expired?1:0; soon+=(!c.expired&&c.soon)?1:0; });

  var actions = canAdd()
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
    '<input class="form-input ct-search" id="ct-v-q" placeholder="ابحث باسم الطرف أو رقم السجل أو رقم الجوال" value="'+_esc(_vFilter.q)+'" oninput="contracts.filterVendors(\'q\',this.value)">'+
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
    '<select class="form-input" id="ct-v-trade" onchange="contracts.filterVendors(\'trade\',this.value)">'+
      tradeFilterOptionsHTML(all, _vFilter.trade)+
    '</select>'+
  '</div>'+
  // **يُقال ما وُجد ومن أيّ مجموعة** — «٣ نتائج» وحدَه لا يخبر أنّ المرشَّح مقاولون
  // من تخصّصٍ بعينه، ومن نسي مرشّحاً مفعَّلاً يقرأ سجلاً ناقصاً ويظنّه كاملاً.
  (tradeNoteHTML(list) || "");

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
      (canAdd()?'<button class="btn btn-primary btn-sm" style="margin-top:14px" onclick="contracts.newVendor()">'+_icn("plus")+' طرف جديد</button>':'')+
    '</div>';
  } else if(!list.length){
    body = '<div class="card" style="text-align:center;padding:26px 18px;color:var(--muted);font-size:13px">لا نتائج تطابق البحث.</div>';
  } else {
    body = '<div class="ct-grid">'+list.map(function(v){ return vendorTileHTML(v, today); }).join("")+'</div>';
  }

  return head + strip + filters + body;
}

/* خياراتُ مرشّح نوع الأعمال — مجموعتان مفصولتان صراحةً: ما جاء من القائمة وما
   كُتب يدوياً. الفصلُ ليس زينة: المكتوبُ يدوياً مرشَّحٌ للتوحيد لاحقاً، ورؤيتُه
   مجموعاً تحت عنوانه هي ما يجعل «سبعَ تهجئاتٍ لتكييف» ظاهرةً بدل أن تتوارى. */
function tradeFilterOptionsHTML(pool, sel){
  var opts = tradeOptions(pool);
  var selK = normTrade(sel);
  function o(t){
    return '<option value="'+_esc(t.key)+'"'+(selK && normTrade(t.key)===selK?' selected':'')+'>'+_esc(t.lbl)+'</option>';
  }
  var cat = opts.filter(function(t){ return !t.custom; });
  var cus = opts.filter(function(t){ return t.custom; });
  return '<option value=""'+(selK?'':' selected')+'>كل أنواع الأعمال</option>'+
    '<optgroup label="من القائمة">'+cat.map(o).join("")+'</optgroup>'+
    (cus.length ? '<optgroup label="مكتوبة يدوياً">'+cus.map(o).join("")+'</optgroup>' : "");
}

/* سطرُ «ما تراه الآن» — يظهر فقط حين يكون مرشّحُ النوع أو التخصّص مفعَّلاً. */
function tradeNoteHTML(list){
  if(!_vFilter.trade && !_vFilter.kind) return "";
  var kindLbl = _vFilter.kind ? ((VENDOR_KINDS[_vFilter.kind]||{}).lbl || "") : "كل الأطراف";
  var who = _vFilter.trade
    ? kindLbl + " — نوع الأعمال: «" + tradeLabel(_vFilter.trade) + "»"
    : kindLbl;
  return '<div class="ct-note" style="margin:-6px 0 12px">'+_icn("search","ic-sm")+
    ' '+_esc(who)+' · <b class="num">'+list.length+'</b> نتيجة'+
    (_vFilter.kind==="subcontractor"||_vFilter.kind==="supplier"
      ? ' <span style="color:var(--muted)">(ويشمل «مقاول ومورّد»)</span>' : '')+
    ' <button class="btn btn-ghost btn-sm" onclick="contracts.clearTradeFilter()">'+_icn("rotateCcw","ic-sm")+' إلغاء الترشيح</button></div>';
}

function vendorTileHTML(v, today){
  var kind = VENDOR_KINDS[v.kind] || VENDOR_KINDS.subcontractor;
  var ent  = ENTITY_TYPES[normEntity(v.entityType)];
  var id   = identityOf(v);
  var st   = VENDOR_STATUS[v.status||"active"] || VENDOR_STATUS.active;
  var comp = vendorComplianceState(v, today);
  var rail = comp.expired ? "var(--sla-crit)" : (comp.soon ? "var(--sla-warn)" : "var(--sla-ok)");
  if((v.status||"active") !== "active") rail = "var(--muted)";

  // نوعُ الأعمال على البطاقة: هو أوّلُ ما يبحث عنه الناظرُ في شبكةٍ من عشرات الأطراف
  var tr = vendorTrades(v);
  var trHTML = tr.length
    ? '<div class="ct-trades">'+
        tr.slice(0,3).map(function(t){ return '<span class="ct-trade">'+_esc(tradeLabel(t))+'</span>'; }).join("")+
        (tr.length>3 ? '<span class="ct-trade more">+'+(tr.length-3)+'</span>' : '')+
      '</div>'
    : '';

  /* الرقمُ على البطاقة **قابلٌ للاتصال من الشبكة نفسِها** — لا فتحَ بطاقةٍ ثم رجوعاً
     لكلّ مكالمة. و`stopPropagation` لأنّ البطاقةَ كلَّها زرُّ فتحٍ: بدونه يفتح
     الاتصالُ السجلَّ خلفه فيعود المستخدمُ من المكالمة إلى شاشةٍ لم يطلبها. */
  var ph = vendorPhones(v);
  var phHTML = ph.length
    ? '<div class="ct-tile-ph" onclick="event.stopPropagation()">'+
        '<a class="ct-link num" href="tel:+'+_esc(ph[0].e164)+'" dir="ltr">'+_icn("phone","ic-sm")+_esc(ph[0].display)+'</a>'+
        '<a class="ct-link" href="https://wa.me/'+_esc(ph[0].e164)+'" target="_blank" rel="noopener" title="واتساب">'+_icn("messageCircle","ic-sm")+'</a>'+
        (ph.length>1 ? '<span class="ct-dot">·</span><span style="font-size:10.5px;color:var(--muted);font-weight:700">+'+(ph.length-1)+' رقماً</span>' : '')+
      '</div>'
    : '';

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
    trHTML + phHTML +
    '<div class="ct-docs">'+chips+'</div>'+
  '</div>';
}

/* قسمُ الأداء في بطاقة الطرف — يظهر فقط إن كان له تاريخٌ يُقرأ.
   طرفٌ بلا عقودٍ لا يُعرض له صفرٌ في خمس خانات: صفرٌ يوهم بحكمٍ ولا حكمَ بلا واقعة. */
function vendorPerfHTML(v){
  startCtrSync(); startExtSync(); startChgSync();
  var sc = vendorScorecard(v.id, _ctrs, _exts, _chgs, _today());
  if(!sc.contracts){
    return '<div class="card ct-sec">'+
      '<div class="ct-sec-h">'+_icn("trendingUp","ic-sm")+' الأداء</div>'+
      '<div class="ct-note">'+_icn("alertCircle","ic-sm")+' لا عقودَ معه بعد — لا أداءَ يُقاس. تظهر الأرقامُ بعد أوّل عقد.</div>'+
    '</div>';
  }
  var flags = sc.flags.length
    ? sc.flags.map(function(f){
        var cls = f.sev==="crit" ? "crit" : (f.sev==="warn" ? "warn" : "");
        return '<div class="ct-note '+cls+'">'+_icn(f.sev==="info"?"alertCircle":"alertTriangle","ic-sm")+' '+_esc(f.lbl)+'</div>';
      }).join("")
    : '<div class="ct-note">'+_icn("checkCircle","ic-sm")+' لا ملاحظاتِ تأخّرٍ ولا فسخٍ ولا مستخلصاتٍ مُعادة.</div>';

  return '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("trendingUp","ic-sm")+' الأداء'+
      '<span class="ct-sec-lock">وقائعُ من عقوده — بلا درجةٍ ولا نجوم</span></div>'+
    '<div class="ct-money-row">'+
      '<div class="ct-tl"><span class="l">عقود</span><span class="v num">'+money0(sc.contracts)+'</span></div>'+
      '<div class="ct-tl"><span class="l">سارية</span><span class="v num">'+money0(sc.active)+'</span></div>'+
      '<div class="ct-tl"><span class="l">منتهية</span><span class="v num">'+money0(sc.done)+'</span></div>'+
      '<div class="ct-tl big"><span class="l">قيمة التعاقدات</span><span class="v num">'+money(sc.value)+'</span></div>'+
      '<div class="ct-tl"><span class="l">المسدَّد له</span><span class="v num">'+money(sc.paid)+'</span></div>'+
    '</div>'+
    '<div class="ct-money-row" style="margin-top:10px">'+
      '<div class="ct-tl"><span class="l">عقودٌ تأخّرت</span><span class="v num">'+money0(sc.lateContracts)+'</span></div>'+
      '<div class="ct-tl"><span class="l">أقصى تأخّر</span><span class="v num">'+money0(sc.lateDaysMax)+' يوماً</span></div>'+
      '<div class="ct-tl"><span class="l">متوسّط التأخّر</span><span class="v num">'+money0(sc.lateDaysAvg)+' يوماً</span></div>'+
      '<div class="ct-tl"><span class="l">مستخلصات</span><span class="v num">'+money0(sc.extracts)+'</span></div>'+
      '<div class="ct-tl"><span class="l">أوامر تغيير</span><span class="v num">'+money0(sc.changes)+'</span></div>'+
    '</div>'+
    flags+
    '<div class="ct-note">'+_icn("alertCircle","ic-sm")+' <b>لا درجةَ إجمالية عمداً:</b> رقمٌ واحدٌ من عقدين يوهم بدقّةٍ لا تحتملها البيانات ويُخفي وقائعَ متعارضة. الوقائعُ أعلاه، والحكمُ لك.</div>'+
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
  if(canEditVendor(v)) tools += '<button class="btn btn-primary btn-sm" onclick="contracts.editVendor()">'+_icn("edit")+' تعديل</button> ';
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
    infoCell("رقم الجوال", phoneHTML(v.phone)) +
    infoCell("العنوان الوطني", _esc((v.legal||{}).nationalAddress||"—")) +
    infoCell("نوع الأعمال", vendorTradesHTML(v), true) +
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

  /* جهاتُ الاتصال — تُعرَض دائماً ولو كانت فارغة: القسمُ المخفيُّ عند الفراغ لا
     يُقرأ «لا جهاتَ اتصال» بل «لا مكانَ لها»، فيُكتب الرقمُ في ورقةٍ جانبية. */
  var contacts = (Array.isArray(v.contacts)?v.contacts:[]).filter(function(c){ return c && (c.name||c.phone||c.role); });
  var contactsSec = '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("users","ic-sm")+' جهات الاتصال</div>'+
    (contacts.length
      ? '<div class="ct-info">'+contacts.map(function(c){
          return infoCell(c.role||"جهة اتصال", '<span>'+_esc(c.name||"—")+'</span>'+
            (c.phone ? '<div style="margin-top:4px">'+phoneHTML(c.phone)+'</div>' : ''));
        }).join("")+'</div>'
      : '<div class="ct-note" style="margin:0">'+_icn("alertCircle","ic-sm")+
        ' لا جهاتِ اتصالٍ مسجّلة — أضِف مسؤولَ التواصل ورقمَه ليُعرف بمن يُتّصل عند تنفيذ العقد.</div>')+
  '</div>';

  return back +
    headHTML(v.name||v.id, '<span class="badge '+st.cls+'">'+_icn(st.icon,"ic-sm")+' '+_esc(st.lbl)+'</span> <span class="ct-id num">'+_esc(v.id)+'</span>', tools, (VENDOR_KINDS[v.kind]||VENDOR_KINDS.subcontractor).icon) +
    warn + '<div class="card ct-sec">'+info+'</div>' + bank + vendorPerfHTML(v) + docsSec + contactsSec;
}

/* **سببُ غياب الزرّ يُقال صراحةً** — للمستندات الثلاثة بنصٍّ واحد. زرٌّ يختفي
   بلا تفسيرٍ يُقرأ عطلاً لا قاعدة، ومن رآه ظاهراً قبل قليلٍ سيظنّ النظامَ نسي
   اعتمادَه. (وهو أصلُ بلاغ المالك الذي وُلدت منه القاعدةُ كلُّها.) */
function sodNoteHTML(mode, owner){
  var lbl = _esc(owner ? owner.lbl : "");
  if(mode === "blocked")
    return '<div class="ct-note">'+_icn("shield","ic-sm")+
      ' اعتمدتَ هذا المستند في بوّابةٍ سابقة — فبوّابةُ <strong>'+lbl+
      '</strong> لغيرِك (فصلُ المهام). والرفضُ/الإعادة ما زال متاحاً لك.</div>';
  if(mode === "delegate")
    return '<div class="ct-note warn">'+_icn("shield","ic-sm")+
      ' اعتمدتَ بوّابةً سابقةً عليه، ولا يوجد مستخدمٌ آخرُ يملك <strong>'+lbl+
      '</strong> — فاعتمادُك يُسجَّل <strong>نيابةً</strong> في السجل الزمني.</div>';
  return "";
}

function infoCell(label, valueHtml, wide){
  return '<div class="ct-cell'+(wide?' wide':'')+'"><div class="ct-cell-l">'+_esc(label)+'</div><div class="ct-cell-v">'+valueHtml+'</div></div>';
}

/* الرقمُ **يُتّصل به** لا يُقرأ فقط: نصٌّ مجرَّدٌ يعني نسخاً يدوياً وخطأً في رقمٍ
   واحد. فالمعروضُ رابطُ اتصالٍ ورابطُ واتساب — والصيغةُ المطبَّعةُ هي المرسَلة
   إليهما، فما يُطلَب هو ما خُزِّن لا ما رآه العين. ورقمٌ مخزَّنٌ لا يصلح للجوال
   (ثابتٌ أو ناقص) يُوسَم بدل أن يُعرَض سليماً كاذباً. */
function phoneHTML(raw){
  var e = normPhone(raw);
  if(!e) return '<span style="color:var(--muted)">—</span>';
  var bad = phoneOk(e) ? "" : ' <span class="ct-doc s-expired" title="'+_esc(phoneHint(e))+'">يُراجَع</span>';
  return '<a class="ct-link num" href="tel:+'+_esc(e)+'" dir="ltr">'+_icn("phone","ic-sm")+_esc(phoneFmt(e))+'</a>'+
    ' <a class="ct-link ct-wa" href="https://wa.me/'+_esc(e)+'" target="_blank" rel="noopener" title="مراسلة على واتساب">'+
      _icn("messageCircle","ic-sm")+' واتساب</a>'+ bad;
}

/* شارات تخصّصات الطرف — وحين لا تخصّصَ **يُقال السبب**: الفراغُ هنا ليس «لا شيء»
   بل «لن يجدَه أحدٌ بالبحث»، وهو ما يجب أن يقرأه من يفتح البطاقة. */
function vendorTradesHTML(v){
  var tr = vendorTrades(v);
  if(!tr.length) return '<span style="color:var(--muted);font-weight:600">— لم يُحدَّد بعد</span>';
  return '<div class="ct-trades" style="margin:0">'+tr.map(function(t){
    return '<span class="ct-trade">'+_esc(tradeLabel(t))+'</span>';
  }).join("")+'</div>';
}

/* خانةُ الطرف: الاسمُ **وزرٌّ يفتح سجلَّه**.
   الاسمُ وحدَه كان نصّاً ميتاً في أهمّ لحظة: المعتمِدُ يقرّر على طرفٍ لا يرى وثائقَه
   ولا صلاحيتَها ولا حالتَه (محظورٌ؟) ولا أداءَه السابق — وكلُّ ذلك في سجلّ الأطراف
   على بُعد صفحتين من التنقّل اليدويّ. والزرُّ لا يظهر إلا حين يكون خلفه شيءٌ يُفتَح:
   معرّفُ طرفٍ مخزَّن **وصلاحيةُ اطّلاعٍ** على السجل — فلا زرَّ يَعِد ولا يفي. */
function vendorCell(vendorId, vendorName){
  var name = _esc(vendorName || "—");
  if(!vendorId || !canView()) return name;
  return name +
    '<div><button class="btn btn-ghost btn-sm ct-vbtn" onclick="contracts.openVendorFrom(\''+_jq(vendorId)+'\')">'+
      _icn("hardHat","ic-sm")+' تفاصيل الطرف</button></div>';
}
function numOrDash(s){ return s ? '<span class="num">'+_esc(s)+'</span>' : "—"; }

/* ── نوعُ الأعمال في النموذج: قائمةٌ **و**كتابة ──
   الاختيارُ من القائمة يُضيف فوراً (بلا زرِّ تأكيدٍ ثانٍ يُنسى)، والكتابةُ تُضيف
   بـEnter أو بالزرّ. والمختارُ يُعرَض شاراتٍ تُحذَف بنقرة — فلا حقلَ نصٍّ واحدٍ
   بفواصلَ يقرؤه المستخدمُ خطأً «تخصّصاً واحداً طويلاً». */
function tradeEditHTML(d){
  var picked = vendorTrades(d);
  var avail  = TRADES.filter(function(t){ return !vendorHasTrade(d, t.key); });

  var chips = picked.length
    ? '<div class="ct-trades edit">'+picked.map(function(t,i){
        return '<span class="ct-trade">'+_esc(tradeLabel(t))+
          '<button type="button" class="ct-trade-x" title="إزالة" onclick="contracts.delTrade('+i+')">×</button></span>';
      }).join("")+'</div>'
    : '<div class="ct-note" style="margin:2px 0 8px">'+_icn("alertCircle","ic-sm")+
      ' لا نوعَ أعمالٍ بعد — وبدونه لا يظهر هذا الطرف حين يُبحث عن «مقاولي الكهرباء» ونظائرِها.</div>';

  return '<div class="ct-form-row">'+
    '<div class="ct-field" style="grid-column:1/-1">'+
      '<span class="ct-field-l">نوع الأعمال (تخصّصه) — اختر من القائمة أو اكتب نوعاً غيرَ موجودٍ فيها</span>'+
      chips+
      '<div class="ct-trade-add">'+
        '<select class="form-input" id="ct-f-trade-pick" onchange="contracts.addTrade(this.value)">'+
          '<option value="">— اختر من القائمة —</option>'+
          avail.map(function(t){ return '<option value="'+_esc(t.key)+'">'+_esc(t.lbl)+'</option>'; }).join("")+
        '</select>'+
        '<input class="form-input" id="ct-f-trade-new" placeholder="أو اكتب نوعاً آخر ثم Enter" '+
          'onkeydown="if(event.key===\'Enter\'){event.preventDefault();contracts.addTradeText();}">'+
        '<button class="btn btn-ghost btn-sm" type="button" onclick="contracts.addTradeText()">'+_icn("plus","ic-sm")+' إضافة</button>'+
      '</div>'+
      '<div class="ct-note" style="margin:8px 0 0">'+_icn("alertCircle","ic-sm")+
        ' يجوز أكثرُ من نوع. وما تكتبه مطابقاً لاسمٍ في القائمة يُوحَّد معه تلقائياً فلا يتكرّر التخصّصُ باسمين.</div>'+
    '</div>'+
  '</div>';
}

/* ── نموذجُ التحرير ── */
function vendorEditHTML(v){
  var d = _vEdit;
  var isNew = !v || !v.id;
  var back = '<button class="btn btn-ghost btn-sm ct-back" onclick="contracts.cancelVendorEdit()">'+_icn("rotateCcw")+' إلغاء</button>';

  var ent = normEntity(d.entityType);
  // قائمةُ الوثائق تتبع الصفة — ويبقى النوعُ المحفوظ ظاهراً ولو خرج عنها بعد تبديلها،
  // فلا تُمحى وثيقةٌ سجّلها أحدٌ لمجرّد تغييرِ صفةٍ بالخطأ.
  var docOpts = docTypesFor(ent);
  applyDocAutofill(d);          // ما في الأعلى يملأ ما تحته — الفارغَ وحدَه
  var docRows = (d.docs||[]).map(function(dc,i){
    var opts = docOpts.slice();
    if(dc.type && !opts.some(function(t){ return t.key===dc.type; })){
      var keep = DOC_TYPES.filter(function(t){ return t.key===dc.type; })[0];
      if(keep) opts = opts.concat([keep]);
    }
    var meta = DOC_TYPES.filter(function(t){ return t.key===dc.type; })[0] || {};
    var ph = dc.type==="natAddr" ? "العنوان الوطني" : dc.type==="bank" ? "الآيبان (SA…)" : "الرقم";
    /* **الملفُّ المختارُ يبقى مختاراً**: حقلُ `input[type=file]` لا يُملأ برمجياً
       (حاجزُ المتصفّح الأمنيّ)، فإعادةُ رسم النموذج تمحو ما اختاره المستخدم بلا أثر.
       فالمسوّدةُ تحمل الملفَّ نفسَه (`_file`)، والصفُّ يُعلن اسمَه بدلاً من حقلٍ
       يبدو فارغاً كذباً. (وهو بلاغُ المالك: إضافةُ وثيقةٍ ثانيةٍ تُضيّع ملفَ الأولى.) */
    var fileCell = dc._file
      ? '<div class="ct-file-chip">'+_icn("paperclip","ic-sm")+'<span class="ct-file-nm">'+_esc(dc._fileName||"ملف")+'</span>'+
          '<button type="button" class="ct-trade-x" title="إزالة الملف المختار" onclick="contracts.delDocFile('+i+')">×</button></div>'
      : '<input type="file" class="form-input ct-file" data-i="'+i+'" accept="image/*,application/pdf" onchange="contracts.pickDocFile('+i+',this)">';
    return '<tr>'+
      '<td><select class="form-input" data-f="type" data-i="'+i+'" onchange="contracts.setDocType('+i+',this.value)">'+
        opts.map(function(t){ return '<option value="'+t.key+'"'+(dc.type===t.key?' selected':'')+'>'+_esc(t.lbl)+'</option>'; }).join("")+
      '</select></td>'+
      '<td><input class="form-input" data-f="number" data-i="'+i+'" value="'+_esc(dc.number||"")+'" placeholder="'+_esc(ph)+'">'+
        (dc._auto?'<div class="ct-auto">'+_icn("checkCircle","ic-sm")+' من البيانات الأساسية</div>':'')+'</td>'+
      '<td>'+(meta.noExpiry
        ? '<input class="form-input" type="date" data-f="expiry" data-i="'+i+'" value="'+_esc(dc.expiry||"")+'" title="اختياريّ — هذه الوثيقة لا تنتهي عادةً">'
        : '<input class="form-input" type="date" data-f="expiry" data-i="'+i+'" value="'+_esc(dc.expiry||"")+'">')+'</td>'+
      '<td>'+fileCell+
        (dc.url?'<a href="'+_esc(dc.url)+'" target="_blank" rel="noopener" class="ct-link">'+_icn("paperclip","ic-sm")+' الحالي</a>':'')+'</td>'+
      '<td><button class="btn btn-delete" onclick="contracts.delDoc('+i+')">'+_icn("trash","ic-sm")+'</button></td>'+
    '</tr>';
  }).join("");

  var contactRows = (d.contacts||[]).map(function(c,i){
    return '<tr>'+
      '<td><input class="form-input" data-cf="name"  data-ci="'+i+'" value="'+_esc(c.name||"")+'" placeholder="الاسم"></td>'+
      '<td><input class="form-input" data-cf="role"  data-ci="'+i+'" value="'+_esc(c.role||"")+'" placeholder="المدير · مسؤول التنفيذ"></td>'+
      // كالحقل الرئيسيّ: المخزَّنُ دوليٌّ والمعروضُ في النموذج محلّيٌّ مقروء
      '<td><input class="form-input num" data-cf="phone" data-ci="'+i+'" value="'+_esc(phoneFmt(c.phone)||c.phone||"")+'" placeholder="05XXXXXXXX" dir="ltr" inputmode="tel"></td>'+
      '<td><button class="btn btn-delete" onclick="contracts.delContact('+i+')">'+_icn("trash","ic-sm")+'</button></td>'+
    '</tr>';
  }).join("");

  var bankBlock = canWriteIban(isNew)
    ? '<div class="ct-form-row">'+
        field("الآيبان (IBAN)", '<input class="form-input num" id="ct-f-iban" value="'+_esc((d.bank||{}).iban||"")+'" placeholder="SA…" dir="ltr">') +
        field("اسم البنك", '<input class="form-input" id="ct-f-bank" value="'+_esc((d.bank||{}).bankName||"")+'">') +
      '</div>'+
      '<div class="ct-form-row">'+
        field("اسم صاحب الحساب", '<input class="form-input" id="ct-f-holder" value="'+_esc((d.bank||{}).holder||"")+'" placeholder="'+(ent==="individual"?"يجب أن يطابق اسم الشخص في هويته":"كما في خطاب البنك")+'">') +
        '<div></div>'+
      '</div>'+
      (canBank() ? '' :
        '<div class="ct-note crit" style="margin-top:2px">'+_icn("alertTriangle","ic-sm")+
        ' <b>تُدخِله مرّةً واحدة.</b> بعد الحفظ لا تملك تعديلَه — تصحيحُه يمرّ بالمالية. تحقّق من الرقم قبل الحفظ.</div>')+
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
    tradeEditHTML(d)+
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
      field("رقم الجوال", '<input class="form-input num" id="ct-f-phone" value="'+_esc(phoneFmt(d.phone)||d.phone||"")+'" '+
        'placeholder="05XXXXXXXX" dir="ltr" inputmode="tel" autocomplete="tel">') +
      field("صفةُ صاحب الرقم (اختياري)", '<input class="form-input" id="ct-f-phonelbl" value="'+_esc(d.phoneLabel||"")+'" placeholder="المالك · المدير · مسؤول التنفيذ">') +
    '</div>'+
    '<div class="ct-note" style="margin:-4px 0 12px">'+_icn("phone","ic-sm")+
      ' اكتبه محلياً (05XXXXXXXX) أو دولياً بمفتاح دولته — ويُحفَظ بصيغةٍ دوليةٍ موحّدة ليصلح للاتصال وواتساب والبحث معاً.</div>'+
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
    '<div class="ct-sec-h">'+_icn("users","ic-sm")+' جهات الاتصال'+
      '<button class="btn btn-ghost btn-sm" style="margin-inline-start:auto" onclick="contracts.addContact()">'+_icn("plus","ic-sm")+' جهة اتصال</button></div>'+
    '<div class="ct-table-wrap"><table class="ct-table" id="ct-contacts-tbl"><thead><tr>'+
      '<th>الاسم</th><th>الصفة</th><th>رقم الجوال</th><th></th>'+
    '</tr></thead><tbody>'+(contactRows||'<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:14px">لا جهاتِ اتصال — أضِف مسؤولَ التواصل ورقمَه.</td></tr>')+'</tbody></table></div>'+
    '<div class="ct-note" style="margin:12px 0 0">'+_icn("alertCircle","ic-sm")+
      ' أرقامُ جهات الاتصال تُبحَث من مربّع البحث في السجل كما يُبحَث الجوالُ الرئيسيّ. والصفُّ الفارغُ تماماً يُهمَل عند الحفظ.</div>'+
  '</div>'+
  '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("landmark","ic-sm")+' البيانات البنكية</div>'+ bankBlock +
  '</div>'+
  '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("fileText","ic-sm")+' الوثائق'+
      '<button class="btn btn-ghost btn-sm" style="margin-inline-start:auto" onclick="contracts.addDoc()">'+_icn("plus","ic-sm")+' وثيقة</button></div>'+
    '<div class="ct-table-wrap"><table class="ct-table" id="ct-docs-tbl"><thead><tr>'+
      '<th>الوثيقة</th><th>الرقم / البيان</th><th>تنتهي في</th><th>المرفق</th><th></th>'+
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
function clearTradeFilter(){ _vFilter.trade = ""; _vFilter.kind = ""; paintVendors(); }
function openVendor(id){ _vOpen = id; _vEdit = null; paintVendors(); }
function backToVendors(){ _vOpen = null; _vEdit = null; paintVendors(); }
function retry(){ stopSync(); startSync(); paintVendors(); }

function newVendor(){
  if(!canAdd()) return _toast("⚠ لا صلاحية لإضافة طرف","warn");
  _vOpen = null;
  _vEdit = { name:"", entityType:"establishment", kind:"subcontractor", legal:{}, bank:{}, docs:[], aliases:[], trades:[], contacts:[], phone:"", phoneLabel:"", status:"active", taxRegistered:null };
  var el = document.getElementById("page-"+PAGE_VENDORS);
  if(el) el.innerHTML = vendorEditHTML(null);
}
function editVendor(){
  var v = vendorById(_vOpen); if(!v) return;
  if(!canEditVendor(v)) return _toast(canAdd()
    ? "⚠ تعديلُ هذا الطرف لمن أضافه أو للمشتريات — يمكنك تعديل ما تضيفه أنت"
    : "⚠ لا صلاحية للتعديل","warn");
  _vEdit = {
    name: v.name||"", entityType: normEntity(v.entityType), kind: v.kind||"subcontractor",
    taxRegistered: (v.taxRegistered===true||v.taxRegistered===false) ? v.taxRegistered : null,
    legal: Object.assign({}, v.legal||{}),
    bank:  Object.assign({}, v.bank||{}),
    docs:  (Array.isArray(v.docs)?v.docs:[]).map(function(d){ return Object.assign({}, d); }),
    aliases: (Array.isArray(v.aliases)?v.aliases:[]).slice(),
    trades: vendorTrades(v),
    phone: v.phone||"", phoneLabel: v.phoneLabel||"",
    contacts: (Array.isArray(v.contacts)?v.contacts:[]).map(function(c){ return Object.assign({}, c); }),
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
  // الرقمُ يبقى في المسوّدة **كما كُتب** ولا يُطبَّع إلا عند الحفظ: تطبيعُه مع كل
  // إعادةِ رسمٍ يقلب ما تحت الإصبع (`05` تصير `9665`) فيظنّ الكاتبُ الحقلَ عصيّاً.
  var pv = document.getElementById("ct-f-phone"); if(pv) _vEdit.phone = String(pv.value||"").trim();
  _vEdit.phoneLabel = val("ct-f-phonelbl");
  var tx = sel("ct-f-taxreg");
  if(tx !== null) _vEdit.taxRegistered = (tx === "yes") ? true : (tx === "no" ? false : null);
  _vEdit.legal.nationalAddress = val("ct-f-addr");
  var al = val("ct-f-aliases");
  _vEdit.aliases = al ? al.split(/[،,]/).map(function(s){ return s.trim(); }).filter(Boolean) : [];
  if(canWriteIban(!_vOpen)){
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
      var was = _vEdit.docs[i][f];
      _vEdit.docs[i][f] = String(inp.value||"").trim();
      // ما لمسه المستخدمُ بيده لم يعد «مملوءاً تلقائياً» — تسقط الشارةُ عنه
      if(_vEdit.docs[i]._auto && _vEdit.docs[i][f] !== was) _vEdit.docs[i]._auto = false;
    });
    // **الملفُّ قبل كل شيء**: هذه الدالّةُ تُستدعى قبل كلّ إعادةِ رسم، وإعادةُ الرسم
    // تُتلف حقولَ الملفّات. فما لم يُلتقط هنا يضيع بلا أثرٍ ولا رسالة.
    tbl.querySelectorAll("input.ct-file").forEach(function(inp){
      var i = parseInt(inp.dataset.i,10);
      if(!_vEdit.docs[i]) return;
      if(inp.files && inp.files[0]){
        _vEdit.docs[i]._file = inp.files[0];
        _vEdit.docs[i]._fileName = String(inp.files[0].name||"ملف").slice(0,120);
      }
    });
  }
  var ctb = document.getElementById("ct-contacts-tbl");
  if(ctb){
    _vEdit.contacts = _vEdit.contacts || [];
    ctb.querySelectorAll("[data-cf]").forEach(function(inp){
      var i = parseInt(inp.dataset.ci,10), f = inp.dataset.cf;
      if(!_vEdit.contacts[i] || !f) return;
      _vEdit.contacts[i][f] = String(inp.value||"").trim();
    });
  }
}
/* تبديلُ الصفة يُعيد رسمَ النموذج بحقولها — بعد مزامنةِ ما كُتب، فلا يضيع شيء. */
function setEntity(v){ syncDraft(); if(!_vEdit) return; _vEdit.entityType = normEntity(v); paintDraft(); }

/* إضافةُ تخصّصٍ من القائمة — تُضاف فوراً بلا زرِّ تأكيدٍ ثانٍ. */
function addTrade(key){
  syncDraft(); if(!_vEdit) return;
  var k = String(key||"").trim(); if(!k){ paintDraft(); return; }
  _vEdit.trades = vendorTrades({ trades: vendorTrades(_vEdit).concat([k]) });
  paintDraft();
}
/* إضافةُ تخصّصٍ مكتوبٍ يدوياً — يُوحَّد مع القائمة إن طابق اسماً فيها (`normTrade`). */
function addTradeText(){
  var inp = document.getElementById("ct-f-trade-new");
  var txt = inp ? String(inp.value||"").trim() : "";
  syncDraft(); if(!_vEdit) return;
  if(!txt) return _toast("⚠ اكتب نوع الأعمال أوّلاً","warn");
  var before = vendorTrades(_vEdit);
  var after  = vendorTrades({ trades: before.concat([txt]) });
  if(after.length === before.length) return _toast("⚠ «"+tradeLabel(txt)+"» مُضافٌ بالفعل","warn");
  _vEdit.trades = after;
  paintDraft();
}
function delTrade(i){
  syncDraft(); if(!_vEdit) return;
  var t = vendorTrades(_vEdit); t.splice(i,1); _vEdit.trades = t; paintDraft();
}
function addDoc(){ syncDraft(); if(!_vEdit) return; _vEdit.docs.push({ type:(docTypesFor(_vEdit.entityType)[0]||{key:"other"}).key, number:"", expiry:"" }); paintDraft(); }
function delDoc(i){ syncDraft(); if(!_vEdit) return; _vEdit.docs.splice(i,1); paintDraft(); }
/* اختيارُ الملفّ يُثبَّت في المسوّدة **فور اختياره** لا عند الحفظ: بينهما إعادةُ رسمٍ
   واحدةٌ تكفي لمحوه (إضافةُ وثيقةٍ أخرى · تبديلُ الصفة · إضافةُ تخصّص). */
function pickDocFile(i, inp){
  if(!_vEdit || !_vEdit.docs[i]) return;
  var f = inp && inp.files && inp.files[0];
  if(!f) return;
  syncDraft();
  _vEdit.docs[i]._file = f;
  _vEdit.docs[i]._fileName = String(f.name||"ملف").slice(0,120);
  paintDraft();
}
function delDocFile(i){
  syncDraft(); if(!_vEdit || !_vEdit.docs[i]) return;
  delete _vEdit.docs[i]._file; delete _vEdit.docs[i]._fileName;
  paintDraft();
}
/* تبديلُ نوع الوثيقة: **ما اشتُقّ للنوع القديم يسقط** ثمّ يُشتقّ للجديد. بدونه يبقى
   رقمُ السجل التجاريّ في صفٍّ صار «عنواناً وطنياً» — قيمةٌ باليةٌ لا خطأَ مستخدمٍ
   ولا بيانَ وثيقة. والمقارنةُ **بقيمة الاشتقاق القديمة نفسِها** لا بشارةٍ عامّة:
   فما كتبه المستخدمُ بيده لا يُمسّ ولو بدّل النوعَ عشر مرّات.

   و**النوعُ القديم يُلتقط قبل `syncDraft`** لا بعدَها، وذلك جوهرُ الإصلاح لا ترتيبَ
   أسطر: قائمةُ النوع تحمل `data-f="type"`، فـ`syncDraft` تقرؤها من الشاشة وتكتب
   **النوعَ الجديد** في المسوّدة قبل أن يُحسب المسقَط — فيُقاس الاشتقاقُ القديم
   بالنوع الجديد، ولا يطابق رقمَ الصفّ شيءٌ، فلا يسقط شيء. (بلاغُ المالك: صفٌّ
   بُدّل إلى «شهادة ضريبة القيمة المضافة» يعرض رقمَ السجل التجاريّ وانتهاءَه.) */
function setDocType(i, type){
  var prevType = (_vEdit && _vEdit.docs && _vEdit.docs[i]) ? _vEdit.docs[i].type : null;
  syncDraft(); if(!_vEdit || !_vEdit.docs[i]) return;
  var dc = _vEdit.docs[i];
  clearStaleDocAuto(dc, prevType, _vEdit);
  dc.type = String(type||"other");
  paintDraft();
}
function addContact(){ syncDraft(); if(!_vEdit) return; _vEdit.contacts = (_vEdit.contacts||[]).concat([{ name:"", role:"", phone:"" }]); paintDraft(); }
function delContact(i){ syncDraft(); if(!_vEdit) return; (_vEdit.contacts||[]).splice(i,1); paintDraft(); }
function paintDraft(){
  var el = document.getElementById("page-"+PAGE_VENDORS); if(!el) return;
  el.innerHTML = vendorEditHTML(_vOpen ? vendorById(_vOpen) : null);
}

function saveVendorEdit(){
  syncDraft();
  if(!_vEdit) return;
  /* البوّابةُ على **الكتابة** لا على الزرّ وحدَه: الزرُّ يُخفى، والدالّةُ معروضةٌ على
     `window.contracts` فتُنادى من أيّ مكان. والعمليةُ هي التي تختار بوّابتَها —
     `_vOpen` فارغٌ ⇐ إنشاءٌ (`canAdd`)، ومملوءٌ ⇐ تعديلٌ على قائم (`canEdit`) —
     فلا يُعدّل بياناتِ طرفٍ قائمٍ مَن لا يملك إلا الإضافة. */
  if(_vOpen ? !canEditVendor(vendorById(_vOpen)) : !canAdd())
    return _toast(_vOpen ? "⚠ لا صلاحية لتعديل هذا الطرف" : "⚠ لا صلاحية لإضافة طرف","warn");
  var d = _vEdit;
  var ent = normEntity(d.entityType);
  if(!d.name){ _toast(ent==="individual" ? "⚠ اسم الشخص مطلوب" : "⚠ اسم المنشأة مطلوب","warn"); return; }
  var idInfo = identityOf(d);
  if(!idInfo.number){ _toast("⚠ "+idInfo.label+" مطلوب — به يُعرَف الطرف ويُمنع تكراره","warn"); return; }
  var dup = duplicateOf(d, _vOpen);
  if(dup.block){ _toast("⚠ "+dup.reason,"warn"); return; }
  if(dup.match) _toast("⚠ "+dup.reason,"warn");   // تشابهُ أسماء الأشخاص: تنبيهٌ لا منع

  /* الرقمُ الخاطئ **يُمنَع** لا يُحذَّر منه: خانةٌ فارغةٌ تُرى فارغة، أمّا رقمٌ ناقصٌ
     محفوظٌ فيُقرأ صحيحاً ويُتّصل به يوم الحاجة. (والفراغُ نفسُه مقبولٌ — كثيرٌ من
     الأطراف القديمة بلا رقمٍ ولا يجوز أن يقف تعديلُ اسمها على ذلك.) */
  if(d.phone && !phoneOk(d.phone)){ _toast("⚠ رقم الجوال غير صالح — "+phoneHint(d.phone),"warn"); return; }
  /* الآيبانُ **يُمنَع ناقصاً لا يُحذَّر منه**: خانةٌ فارغةٌ تُرى فارغة، أمّا رقمٌ
     ناقصٌ محفوظٌ فيُقرأ صحيحاً ويُحوَّل إليه يومَ الصرف — ولا أحدَ يراجعه بعد أن
     صار المضيفُ هو مَن يكتبه. (نفسُ منطق فحص الجوال في هذه الدالّة.) */
  if(canWriteIban(!_vOpen) && !ibanOk((d.bank||{}).iban)){
    _toast("⚠ صيغة الآيبان غير صحيحة — يبدأ بـ SA ويتبعه ٢٢ رقماً","warn"); return;
  }
  var badContact = null;
  (d.contacts||[]).forEach(function(c,i){
    if(!badContact && c && c.phone && !phoneOk(c.phone)) badContact = { i:i, c:c };
  });
  if(badContact){
    _toast("⚠ رقم جهة الاتصال «"+((badContact.c.name)||("رقم "+(badContact.i+1)))+"» غير صالح — "+phoneHint(badContact.c.phone),"warn");
    return;
  }
  // رقمٌ يملكه طرفٌ آخر: تنبيهٌ لا منع — قد يكون مكتباً يمثّل أكثرَ من مقاول،
  // وقد يكون الطرفَ نفسَه مسجَّلاً مرّتين. ورؤيةُ **مَن يملكه** هي ما يحسم الأمر.
  var owner = d.phone ? phoneOwner(d.phone, _vOpen, _vendors) : null;
  if(owner) _toast("⚠ رقم الجوال مسجَّلٌ أيضاً للطرف «"+(owner.name||owner.id)+"» — تحقّق أنه ليس تكراراً","warn");

  var btn = document.getElementById("ct-save-btn");
  if(btn){ btn.disabled = true; btn.textContent = "جارٍ الحفظ…"; }

  // الملفاتُ تُرفع أولاً؛ فشلُ رفعِ ملفٍ **لا يمنع** حفظَ بقيةِ البيانات، لكنه
  // لا يسجّل رابطاً وهمياً — الوثيقةُ تُحفظ ببياناتها بلا مرفق ويُعلَن ذلك.
  // **ومصدرُها المسوّدةُ لا الـDOM**: حقولُ الملفّات تُتلَف مع كل إعادةِ رسم، فقراءتُها
  // من الشاشة عند الحفظ تُسقط كلَّ ملفٍّ اختير قبل آخرِ إعادةِ رسم — وهو العطلُ نفسُه.
  var files = [];
  (d.docs||[]).forEach(function(dc,i){ if(dc && dc._file) files.push({ i:i, file:dc._file }); });

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
        trades: vendorTrades(d),
        // **التخزينُ مطبَّعٌ دائماً**: صيغةٌ واحدةٌ في القاعدة مهما تعدّدت صيغُ الكتابة،
        // وإلا صار الرقمُ الواحدُ رقمين لا يلتقيان في بحثٍ ولا في كشفِ تكرار.
        phone: normPhone(d.phone), phoneLabel: d.phoneLabel||"",
        contacts: (d.contacts||[]).map(function(c){
          return { name:(c.name||"").trim(), role:(c.role||"").trim(), phone:normPhone(c.phone) };
        }).filter(function(c){ return c.name || c.role || c.phone; }),
        taxRegistered: (d.taxRegistered===true||d.taxRegistered===false) ? d.taxRegistered : null,
        legal: d.legal || {}, docs: docsForSave(d.docs),
        status: d.status || "active"
      };
      if(canWriteIban(!_vOpen)) payload.bank = Object.assign({}, d.bank||{}, { iban: ibanClean((d.bank||{}).iban) });
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
    kind: next==="blacklisted" ? "danger" : "neutral",
    icon: next==="blacklisted" ? "🚫" : "🔄", okText: "تغيير الحالة",
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
var _rFilter = { q:"", status:"", project:"", tab:"requests" };
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
  crq_pending_pm:"var(--stage-wait)", crq_pending_proc:"var(--stage-wait)",
  crq_pending_finance:"var(--stage-wait)", crq_pending_ceo:"var(--stage-wait)",
  crq_pending_pay:"var(--stage-wait)", crq_approved:"var(--stage-move)",
  crq_converted:"var(--stage-move)", crq_paid:"var(--stage-done)", crq_draft:"var(--muted)"
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

/* ── تبويباتُ الصفحة: ثلاثُ قوائمَ لا تختلط، والمحوَّلُ لعقدٍ خارجَها كلِّها ──
   (طلبُ المالك) كانت القائمةُ الواحدةُ تخلط أربعةَ أشياءَ مختلفةِ المصير: طلباً
   جارياً، وأمرَ دفعٍ تحت إجراء السداد، وأمرَ دفعٍ سُدِّد وأُغلق، وطلباً **صار عقداً**
   فصار سجلُّه الحيُّ في صفحة العقود لا هنا. فالفصلُ على المصير لا على الحالة وحدَها:
   • «طلبات التعاقد»    = ارتباطُ عقدٍ لم يتحوّل بعد (جارٍ · مُعادٌ · ملغيٌّ…).
   • «أوامر الدفع»      = أمرُ دفعٍ لم يُسدَّد بعد — اعتمادُه وسدادُه كلُّه هنا.
   • «مسدَّدة»          = أمرُ دفعٍ أُغلق بالسداد — أرشيفٌ يُرجَع إليه لا عملٌ ينتظر.
   • والمحوَّلُ لعقد (`crq_converted`) **لا تبويبَ له**: بطاقتُه الحيّةُ هي العقدُ في
     صفحة العقود (وسطرٌ هناك يفتح طلبَه الأصليَّ عند الحاجة `openReqFromCtr`)، وهنا
     يبقى سطرُ إحالةٍ يقول كم طلباً تحوّل وأين يُقرأ — فلا يُعَدُّ عملاً منتظراً.
   `reqTabOf` **دالةٌ نقيةٌ واحدة** تُسند كلَّ طلبٍ إلى تبويبه — يقرؤها العدُّ
   والقائمةُ والشريطُ معاً فلا يفترق رقمٌ عن قائمته. */
var REQ_TABS = [
  { key:"requests",   lbl:"طلبات التعاقد",     icon:"fileText" },
  { key:"pay_orders", lbl:"أوامر الدفع",       icon:"banknote" },
  { key:"pay_paid",   lbl:"أوامر دفع مسدَّدة", icon:"lock" }
];
function reqTabOf(r){
  var o = r || {};
  if(o.engagement==="pay_order") return o.status==="crq_paid" ? "pay_paid" : "pay_orders";
  return o.status==="crq_converted" ? "converted" : "requests";
}
function reqCurTab(){
  var t=_rFilter.tab;
  return (t==="pay_orders" || t==="pay_paid") ? t : "requests";
}
/* «قيد الاعتماد» بلا بوّابة السداد: للسداد بطاقتُه الخاصة في تبويب أوامر الدفع،
   وفي تبويب العقود لا يمرّ طلبٌ بها أصلاً — فالشرطُ واحدٌ للتبويبين. */
function reqStatSet(r, key){
  if(key==="__wip__") return !crqIsFinal(r.status) && !crqIsBounced(r.status) && r.status!=="crq_pending_pay";
  return true;
}

function reqListHTML(){
  /* نطاقُ المشروع الحالي أولاً (ctDocInTenant) — التبويبُ والشريطُ وخياراتُ
     المشروع كلُّها تُبنى من داخله فلا يظهر لمشروعٍ ما ليس له. */
  var t=_tenantId();
  var all=_reqs.filter(function(r){ return ctDocInTenant(r, t); }), role=_role(), q=normName(_rFilter.q), tab=reqCurTab();
  /* فلترُ المشروع **نطاقٌ** لا تنقيبٌ داخل النطاق: يقرؤه التبويبُ والشريطُ والقائمةُ
     معاً، بينما الحالةُ والبحثُ تنقّب في القائمة وحدَها — وإلا صار الشريطُ يعدّ
     ما نقّبتَ عنه لا ما بقي أمامك، وبطاقاتُه (وهي فلاترُ الحالة) تصفّي نفسَها. */
  var pScoped = _rFilter.project ? all.filter(function(r){ return docProjectKey(r)===_rFilter.project; }) : all;
  /* التبويبُ نطاقٌ فوق نطاق المشروع — والمحوَّلُ لعقدٍ خارج التبويبات كلِّها. */
  var scoped    = pScoped.filter(function(r){ return reqTabOf(r)===tab; });
  var converted = pScoped.filter(function(r){ return reqTabOf(r)==="converted"; });
  /* «بانتظار دورك» يحترم فصلَ المهام كالبطاقة تماماً — عدّادٌ يعدّ ما لا زرَّ له
     يبعث المستخدمَ يبحث عن عملٍ ليس له. v18.9ub: **والفلترُ يقرأ نفسَ الشرط**؛ كان
     يكتفي بـ`crqCanAct` فيعرض ما مُنع عنه المستخدمُ لفصل المهام — بطاقةٌ تقول ٢
     وقائمةٌ تعرض ٣. وما دامت البطاقةُ صارت زرَّ الفلتر، فالفرقُ يظهر بنقرةٍ واحدة. */
  var meU=_meUser(), meN=_me(), us=_users();
  var isMine = function(r){ return crqCanAct(r.status, role) && crqActMode(r, r.status, role, meU, meN, us) !== "blocked"; };
  var list=scoped.filter(function(r){
    if(_rFilter.status==="__mine__"){ if(!isMine(r)) return false; }
    else if(_rFilter.status==="__wip__"){ if(!reqStatSet(r, "__wip__")) return false; }
    else if(_rFilter.status && r.status!==_rFilter.status) return false;
    if(q){
      var hay=normName(r.id)+" "+normName(r.vendorName)+" "+normName(r.title)+" "+normName(_projName(r));
      if(hay.indexOf(q)===-1) return false;
    }
    return true;
  });

  var mine   = scoped.filter(isMine).length;
  var wip    = scoped.filter(function(r){ return reqStatSet(r, "__wip__"); });
  var readyL = scoped.filter(function(r){ return r.status==="crq_approved"; });
  var payL   = scoped.filter(function(r){ return r.status==="crq_pending_pay"; });
  var sumVal = function(a){ return a.reduce(function(s,r){ return s+(Number(r.value)||0); },0); };
  var wipVal = sumVal(wip), readyVal = sumVal(readyL), payVal = sumVal(payL);
  var convVal = sumVal(converted), paidVal = sumVal(scoped.filter(function(r){ return r.status==="crq_paid"; }));

  var actions = canCreateReq()
    ? '<button class="btn btn-primary btn-sm" onclick="contracts.newRequest()">'+_icn("plus")+' طلب تعاقد جديد</button>' : "";
  var head = headHTML("طلبات التعاقد وأوامر الدفع", "من المقايسة إلى عقدٍ ساري — أو أمرِ دفعٍ للاتفاق الصغير.", actions, "fileText");

  /* شريطُ التبويبات — العدُّ من نطاق المشروع نفسِه، فلا تبويبٌ يَعِد بما لا يعرضه. */
  var tabsBar = '<div class="ct-tabs">'+REQ_TABS.map(function(t){
    var n = pScoped.filter(function(r){ return reqTabOf(r)===t.key; }).length;
    return '<button type="button" class="ct-tab'+(tab===t.key?" on":"")+'" onclick="contracts.reqTab(\''+t.key+'\')">'+
      _icn(t.icon,"ic-sm")+' '+t.lbl+' <span class="num">'+n+'</span></button>';
  }).join("")+'</div>';

  /* بطاقةُ الشريط زرٌّ يصفّي القائمةَ على مجموعتها، ونقرُها ثانيةً يُلغي — والقيمةُ
     سطرٌ فرعيٌّ فيها فلا تُقرأ إجمالياً عاماً. `aria-pressed` يقول أيُّها مُفعَّل. */
  var curSt = _rFilter.status||"";
  var stat = function(lbl, val, sub, key, cls){
    var on = key && curSt===key;
    var body = '<span class="l">'+lbl+'</span><span class="v">'+val+'</span>'+(sub?'<span class="s">'+sub+'</span>':'');
    if(!key) return '<div class="ct-stat'+(cls?" "+cls:"")+'">'+body+'</div>';
    return '<button type="button" class="ct-stat ct-stat-btn'+(cls?" "+cls:"")+(on?" is-on":"")+'"'+
      ' aria-pressed="'+(on?"true":"false")+'" title="'+_esc("اعرض: "+lbl)+'"'+
      ' onclick="contracts.filterReqs(\'status\',\''+(on?"":key)+'\')">'+body+'</button>';
  };
  /* لكلِّ تبويبٍ شريطُه: بطاقاتُ العقود تنتهي بـ«جاهزٌ للعقد»، وبطاقاتُ أوامر الدفع
     بـ«بانتظار السداد»، وتبويبُ المسدَّد أرشيفٌ فبطاقتُه عدٌّ وقيمةٌ بلا فلتر. */
  var strip;
  if(tab==="pay_paid"){
    strip = '<div class="ct-strip">'+
      stat("أوامرُ دفعٍ مسدَّدة — مغلقة", scoped.length, "قيمتها "+money0(paidVal)+" ر.س", "")+
    '</div>';
  } else if(tab==="pay_orders"){
    strip = '<div class="ct-strip">'+
      stat("بانتظار دورك", mine, "", "__mine__", mine?"warn":"")+
      stat("قيد الاعتماد", wip.length, "قيمتها "+money0(wipVal)+" ر.س", "__wip__")+
      stat("بانتظار سداد المالية", payL.length, "قيمتها "+money0(payVal)+" ر.س", "crq_pending_pay", payL.length?"warn":"")+
    '</div>';
  } else {
    strip = '<div class="ct-strip">'+
      stat("بانتظار دورك", mine, "", "__mine__", mine?"warn":"")+
      stat("قيد الاعتماد", wip.length, "قيمتها "+money0(wipVal)+" ر.س", "__wip__")+
      stat("جاهزٌ للعقد", readyL.length, "قيمتها "+money0(readyVal)+" ر.س", "crq_approved")+
    '</div>';
  }
  /* سطرُ الإحالة: المحوَّلُ لعقدٍ غادر هذه الصفحة — يُقال أين صار لا يُعرَض هنا،
     فغيابُه بلا تفسيرٍ يُقرأ فقداً في البيانات. */
  var convLine = (tab==="requests" && converted.length)
    ? '<div class="ct-scope">'+_icn("briefcase","ic-sm")+' '+converted.length+
      ' طلباً صار عقداً وقيمتُه '+money0(convVal)+' ر.س — سجلُّه في صفحة العقود '+
      '<button class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 8px" onclick="showPage(\''+PAGE_CTRS+'\')">'+
      _icn("briefcase","ic-sm")+' فتح العقود</button></div>'
    : "";
  /* اليدويةُ المحجوبةُ عن هذا المشروع تُذكَر لا تُعرَض — الغيابُ بلا تفسيرٍ يُقرأ
     فقداً في البيانات (نفسُ منطق سطرِ المحوَّل أعلاه). */
  var hiddenManual = t ? _reqs.filter(function(r){ return !ctDocInTenant(r, t); }).filter(function(r){
    return r.isCustomProject===true || r.projectId===MANUAL_ID || !r.projectId; }).length : 0;
  var manualLine = hiddenManual
    ? '<div class="ct-scope">'+_icn("cart","ic-sm")+' '+hiddenManual+
      ' من طلبات المشاريع اليدوية تُدار من المشتريات المركزية — لا تظهر داخل المشاريع</div>'
    : "";

  /* خياراتُ المشروع **من الطلبات نفسِها** لا من قائمة المشاريع: فكلُّ خيارٍ يقابله
     طلبٌ واحدٌ على الأقلّ، ولا يسقط طلبُ مشروعٍ حُذف من القائمة أو مشروعٍ يدويٍّ لم
     يُسجَّل. والمفتاحُ `docProjectKey` نفسُه الذي يميّز اليدويَّ بالاسم — فلا ينطوي
     مشروعان يدويّان في خيارٍ واحد. */
  var pOpts=[], pName={};
  all.forEach(function(r){
    var k=docProjectKey(r); if(pName[k]!==undefined) return;
    pName[k]=_projName(r); pOpts.push({ k:k, n:pName[k] });
  });
  pOpts.sort(function(a,b){ return String(a.n).localeCompare(String(b.n),"ar"); });

  /* خياراتُ الحالة **من التبويب نفسِه**: أمرُ الدفع لا يمرّ باعتماد المالية ولا
     يصير عقداً، والعقدُ لا يمرّ ببوّابة السداد — فخيارٌ لا يقع في التبويب وعدٌ
     بقائمةٍ فارغة. والتبويبُ المسدَّدُ حالةٌ واحدةٌ فلا قائمةَ له. */
  var stOf = function(k){
    if(tab==="pay_paid")   return false;
    if(tab==="pay_orders") return ["crq_pending_finance","crq_approved","crq_converted","crq_paid"].indexOf(k)===-1;
    return ["crq_pending_pay","crq_paid","crq_converted"].indexOf(k)===-1;
  };
  var stSelect = tab==="pay_paid" ? '<div></div>' :
    '<select class="form-input" onchange="contracts.filterReqs(\'status\',this.value)">'+
      '<option value="">كل الحالات</option>'+
      '<option value="__mine__"'+(_rFilter.status==="__mine__"?" selected":"")+'>بانتظار دوري</option>'+
      '<option value="__wip__"'+(_rFilter.status==="__wip__"?" selected":"")+'>قيد الاعتماد (كلّها)</option>'+
      Object.keys(CRQ_STATUS).filter(stOf).map(function(k){
        return '<option value="'+k+'"'+(_rFilter.status===k?' selected':'')+'>'+_esc(CRQ_STATUS[k])+'</option>';
      }).join("")+
    '</select>';
  var filters = '<div class="ct-filters">'+
    '<input class="form-input ct-search" id="ct-r-q" placeholder="ابحث برقم الطلب أو الطرف أو المشروع" value="'+_esc(_rFilter.q)+'" oninput="contracts.filterReqs(\'q\',this.value)">'+
    '<select class="form-input" onchange="contracts.filterReqs(\'project\',this.value)">'+
      '<option value="">كل المشاريع</option>'+
      pOpts.map(function(o){
        return '<option value="'+_esc(o.k)+'"'+(_rFilter.project===o.k?' selected':'')+'>'+_esc(o.n)+'</option>';
      }).join("")+
    '</select>'+
    stSelect+
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
  } else if(!scoped.length){
    /* التبويبُ فارغٌ والبياناتُ موجودة — يُقال معناه لا «لا نتائج» عامةٌ تُقرأ عطلاً. */
    var emptyT = tab==="pay_orders" ? "لا أوامرَ دفعٍ تحت إجراء السداد."
               : tab==="pay_paid"   ? "لا أوامرَ دفعٍ مسدَّدةً بعد — ما يُسدَّد ينتقل إلى هنا."
               : (converted.length ? "لا طلباتِ تعاقدٍ جاريةً — ما صار عقداً تجده في صفحة العقود." : "لا طلباتِ تعاقدٍ جارية.");
    body='<div class="card" style="text-align:center;padding:26px 18px;color:var(--muted);font-size:13px">'+emptyT+'</div>';
  } else if(!list.length){
    body='<div class="card" style="text-align:center;padding:26px 18px;color:var(--muted);font-size:13px">لا نتائج تطابق البحث.</div>';
  } else {
    body='<div class="ct-grid">'+list.map(reqTileHTML).join("")+'</div>';
  }
  /* سطرُ النطاق: قائمةٌ أقصرُ بلا تفسيرٍ في الشاشة تُقرأ نقصاً في البيانات لا تصفيةً.
     والأساسُ ما في **التبويب** كلِّه — فالتبويبُ فصلٌ مُعلَنٌ في الشاشة لا تصفيةٌ خفية. */
  var tabAll = all.filter(function(r){ return reqTabOf(r)===tab; });
  var scopeLine = "";
  if(_rLoaded && tabAll.length && list.length!==tabAll.length){
    var lbl = _rFilter.project ? (" — مشروع: "+_esc(pName[_rFilter.project]||"—")) : "";
    scopeLine = '<div class="ct-scope">عرض '+list.length+' من '+tabAll.length+' طلباً'+lbl+
      ' <button class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 8px" onclick="contracts.clearReqFilters()">'+_icn("xCircle","ic-sm")+' مسح الفلاتر</button></div>';
  }
  return head+tabsBar+strip+filters+scopeLine+convLine+manualLine+body;
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
    (docSubstituteId(r)?'<div style="margin-top:5px">'+substituteChip(r,true)+'</div>':'')+
    // نسبةُ سداد أمر الدفع تُقال في القائمة بشريطٍ واضح — لا داخل البطاقة وحدها
    payProgressHTML(r, true)+
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
    isSubstitute:false, substituteAccountId:"",
    advance:{pct:0,recoveryPct:0}, retention:{pct:0,releaseOn:"completion"},
    penalty:{mode:"amount",perDayAmount:0,capAmount:0}, warranty:{months:0}, value:0,
    attachFiles:[], overThreshold:false, payPlan:[100]
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
/* إقرارُ تجاوز العتبة — `syncReqDraft` أولاً فلا تضيع كتابةٌ في الحقول عند إعادة الرسم. */
function setOverTh(v){ syncReqDraft(); if(!_rDraft) return; _rDraft.overThreshold=!!v; paintReqs(); }

/* ── خطةُ صرف الدفعات في النموذج ──
   الإضافةُ والحذفُ يعيدان الرسم (نقرُ زرٍّ لا كتابة)، أمّا الكتابةُ في نسبةٍ
   فتُحدَّث مبالغُها وسطرُ المجموع **في مكانها** — إعادةُ رسمٍ كاملةٌ عند كل رقمٍ
   كانت ستُفقد التركيزَ من الحقل وسطَ الكتابة. */
function addPlanRow(){
  syncReqDraft(); if(!_rDraft) return;
  if(!Array.isArray(_rDraft.payPlan) || !_rDraft.payPlan.length) _rDraft.payPlan=[100];
  _rDraft.payPlan.push(0);
  paintReqs();
}
function delPlanRow(i){
  syncReqDraft(); if(!_rDraft) return;
  (_rDraft.payPlan||[]).splice(i,1);
  if(!(_rDraft.payPlan||[]).length) _rDraft.payPlan=[100];
  paintReqs();
}
function planInput(){
  if(!_rDraft) return;
  var pcts=[];
  document.querySelectorAll(".ct-plan-pct").forEach(function(inp){
    pcts[parseInt(inp.dataset.i,10)] = Number(inp.value)||0;
  });
  _rDraft.payPlan = pcts;
  var tot = linesTotal(_rDraft.lines, _rDraft.vatMode).total;
  document.querySelectorAll(".ct-plan-amt").forEach(function(td){
    var i=parseInt(td.dataset.i,10);
    td.textContent = money(r2(tot*(pcts[i]||0)/100));
  });
  var s = r2(pcts.reduce(function(a,b){ return a+(b||0); },0));
  var el=document.getElementById("ct-plan-sum");
  if(el){
    var ok = Math.abs(s-100) <= 0.01;
    el.style.color = ok ? "var(--success)" : "var(--danger)";
    el.innerHTML = 'المجموع: <span class="num">'+s+'</span>٪'+(ok?' ✓':' — يجب أن يبلغ ١٠٠٪');
  }
}
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
  var sbc=document.getElementById("ct-r-sub");
  if(sbc){ d.isSubstitute = !!sbc.checked; d.substituteAccountId = d.isSubstitute ? v("ct-r-subacc") : ""; }
  var oth=document.getElementById("ct-r-overth");
  if(oth) d.overThreshold = !!oth.checked;
  var pl=document.querySelectorAll(".ct-plan-pct");
  if(pl.length){
    var pp=[];
    pl.forEach(function(inp){ pp[parseInt(inp.dataset.i,10)]=Number(inp.value)||0; });
    d.payPlan=pp;
  }
  if(document.getElementById("ct-r-mproj")) d.projectName=v("ct-r-mproj");
  if(document.getElementById("ct-r-dur"))   d.durationDays=n("ct-r-dur");
  if(document.getElementById("ct-r-start")) d.startDate=v("ct-r-start");
  if(document.getElementById("ct-r-rationale")) d.rationale=v("ct-r-rationale");
  if(document.getElementById("ct-r-adv"))   { d.advance=d.advance||{}; d.advance.pct=n("ct-r-adv"); d.advance.recoveryPct=n("ct-r-advrec"); }
  if(document.getElementById("ct-r-ret"))   { d.retention=d.retention||{}; d.retention.pct=n("ct-r-ret"); var ro=document.getElementById("ct-r-reton"); if(ro) d.retention.releaseOn=ro.value; }
  // الغرامةُ بالريال — والوسمُ يُكتب صراحةً فلا تُخمَّن لغةُ الوثيقة لاحقاً
  if(document.getElementById("ct-r-pen"))   { d.penalty={ mode:"amount", perDayAmount:n("ct-r-pen"), capAmount:n("ct-r-pencap") }; }
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

  /* اختيارُ نوع الارتباط — العتبةُ **تسمح ولا تُلزم**، وفوقها لا يُقفل أمرُ الدفع
     بل يُفتح **بإقرارٍ صريح** (طلبُ المالك): مربّعُ الإقرار أدناه، والعلَمُ يُختم
     على الوثيقة باسم صاحبه فيراه كلُّ معتمِد. */
  var overTh = (d.engagement==="pay_order" && !payOk && tot.total>0);
  var engCards = Object.keys(ENGAGEMENTS).map(function(k){
    var e=ENGAGEMENTS[k], over = (k==="pay_order" && !payOk && tot.total>0);
    return '<label class="ct-pick'+(d.engagement===k?" on":"")+'">'+
      '<input type="radio" name="ct-eng" '+(d.engagement===k?"checked":"")+
        ' onchange="contracts.setEngagement(\''+k+'\')">'+
      '<span class="ct-pick-t">'+_icn(e.icon,"ic-sm")+' '+_esc(e.lbl)+'</span>'+
      '<span class="ct-pick-s">'+_esc(over ? ("فوق "+money0(payTh)+" ر.س — يلزمه إقرارٌ صريح") : e.hint)+'</span>'+
    '</label>';
  }).join("");
  /* مربّعُ الإقرار — لا يظهر إلا حين يلزم، ونصُّه يسمّي ما يُتنازل عنه بالاسم:
     لا بنودَ عقدٍ ولا محتجزَ ضمانٍ ولا مستخلصات — والاعتماداتُ كلُّها باقية. */
  /* خطةُ صرف الدفعات — **منشئُ الطلب هو من يحدّدها** (طلبُ المالك): نسبٌ مجموعُها
     ١٠٠٪، يوقّع عليها المعتمِدون مع القيمة، والماليةُ تنفّذها دفعةً دفعةً حرفياً. */
  var planRows = (d.payPlan||[]).map(function(p,i){
    var amt = r2(tot.total * (Number(p)||0) / 100);
    return '<tr>'+
      '<td style="font-weight:700">'+(i+1)+'</td>'+
      '<td><input class="form-input num ct-plan-pct" data-i="'+i+'" type="number" step="any" min="0" max="100" value="'+_esc(p)+'" oninput="contracts.planInput()" style="min-width:80px"></td>'+
      '<td class="num ct-plan-amt" data-i="'+i+'">'+money(amt)+'</td>'+
      '<td>'+((d.payPlan||[]).length>1?'<button class="btn btn-delete" onclick="contracts.delPlanRow('+i+')">'+_icn("trash","ic-sm")+'</button>':'')+'</td>'+
    '</tr>';
  }).join("");
  var planSum = r2((d.payPlan||[]).reduce(function(s,p){ return s+(Number(p)||0); },0));
  var planOk  = Math.abs(planSum-100) <= 0.01;
  var planSec = !isPay ? '' :
    '<div class="card ct-sec">'+
      '<div class="ct-sec-h">'+_icn("banknote","ic-sm")+' خطة صرف الدفعات'+
        '<span class="ct-sec-lock">أنت من يحدّد نسبَ الدفعات — المالية تنفّذها حرفياً دفعةً بإيصالها، والأمرُ مفتوحٌ حتى تكتمل</span>'+
        '<button class="btn btn-ghost btn-sm" style="margin-inline-start:auto" onclick="contracts.addPlanRow()">'+_icn("plus","ic-sm")+' دفعة</button></div>'+
      '<div class="ct-table-wrap"><table class="ct-table"><thead><tr>'+
        '<th style="width:40px">#</th><th>نسبة الدفعة ٪</th><th>مبلغها من القيمة الحالية</th><th></th>'+
      '</tr></thead><tbody>'+planRows+'</tbody></table></div>'+
      '<div id="ct-plan-sum" style="margin-top:8px;font-size:12px;font-weight:800;color:'+(planOk?'var(--success)':'var(--danger)')+'">'+
        'المجموع: <span class="num">'+planSum+'</span>٪'+(planOk?' ✓':' — يجب أن يبلغ ١٠٠٪')+'</div>'+
    '</div>';

  var overThBox = overTh
    ? '<div class="ct-note '+(d.overThreshold?'':'warn')+'" style="display:block">'+
        '<label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;font-weight:700">'+
          '<input type="checkbox" id="ct-r-overth" '+(d.overThreshold?'checked':'')+
            ' onchange="contracts.setOverTh(this.checked)" style="margin-top:3px">'+
          '<span>'+_icn("alertTriangle","ic-sm")+' أُقرّ بإنشاء أمر دفعٍ بقيمة '+money0(tot.total)+
            ' ر.س رغم تجاوزه عتبةَ '+money0(payTh)+' ر.س — بلا بنود عقدٍ ولا محتجز ضمانٍ ولا مستخلصات، '+
            'ويمرّ على بوّابات الاعتماد كلِّها (والتنفيذيِّ فوق سقفه)، ويُختم الإقرارُ باسمي على الطلب.</span>'+
        '</label>'+
      '</div>'
    : '';

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
    return '<tr>'+lnSeq(i)+
      '<td><input class="form-input" data-lf="desc" data-i="'+i+'" value="'+_esc(l.desc)+'" placeholder="وصف البند">'+
        (l.boqLineId?'':' <span class="ct-doc s-soon">خارج المقايسة</span>')+'</td>'+
      '<td><input class="form-input" data-lf="unit" data-i="'+i+'" value="'+_esc(l.unit)+'" style="min-width:70px"></td>'+
      '<td><input class="form-input num" data-lf="qty" data-i="'+i+'" type="number" step="any" value="'+_esc(l.qty)+'" style="min-width:80px" oninput="contracts.recalc()"></td>'+
      '<td><input class="form-input num" data-lf="unitPrice" data-i="'+i+'" type="number" step="any" value="'+_esc(l.unitPrice)+'" style="min-width:90px" oninput="contracts.recalc()"></td>'+
      '<td class="num">'+money(t.total)+'</td>'+
      '<td><button class="btn btn-delete" onclick="contracts.delReqLine('+i+')">'+_icn("trash","ic-sm")+'</button></td>'+
    '</tr>';
  }).join("") : '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:14px">لم تُختَر بنودٌ بعد.</td></tr>';

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
        field("تُستردّ من كل مستخلص %", '<input class="form-input num" id="ct-r-advrec" type="number" step="any" value="'+_esc((d.advance||{}).recoveryPct||0)+'">'+
          '<div class="ct-hint">اتركها صفراً ⇐ يُستردّ كاملُ المسدَّد من أوّل مستخلصٍ يتّسع له. واكتب نسبةً لتقسيط الاسترداد.</div>')+
      '</div>'+
      '<div class="ct-form-row">'+
        field("محتجز الضمان %", '<input class="form-input num" id="ct-r-ret" type="number" step="any" value="'+_esc((d.retention||{}).pct||0)+'">')+
        field("يُفرَج عنه", '<select class="form-input" id="ct-r-reton">'+
          '<option value="completion"'+(((d.retention||{}).releaseOn||"completion")==="completion"?" selected":"")+'>عند الاستلام الابتدائي</option>'+
          '<option value="warranty_end"'+(((d.retention||{}).releaseOn)==="warranty_end"?" selected":"")+'>بعد انتهاء الضمان</option>'+
        '</select>')+
      '</div>'+
      '<div class="ct-form-row">'+
        field("غرامة التأخير (ر.س) لكل يوم", '<input class="form-input num" id="ct-r-pen" type="number" step="any" min="0" value="'+_esc((d.penalty||{}).perDayAmount||0)+'">')+
        field("سقف الغرامة (ر.س) — ٠ بلا سقف", '<input class="form-input num" id="ct-r-pencap" type="number" step="any" min="0" value="'+_esc((d.penalty||{}).capAmount||0)+'">')+
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
    substituteLinkHTML(d, ref) +
    eligNote +
    '<div class="ct-picks">'+engCards+'</div>'+
    overThBox +
  '</div>'+
  planSec +
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
      '<span style="margin-inline-start:auto"></span>'+aiBtnHTML()+
      '<button class="btn btn-ghost btn-sm" onclick="contracts.addFreeLine()">'+_icn("plus","ic-sm")+' بند حرّ</button></div>'+
    '<div class="ct-table-wrap"><table class="ct-table" id="ct-r-lines"><thead><tr>'+LN_TH+
      '<th>الوصف</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th><th></th>'+
    '</tr></thead><tbody>'+lineRows+'</tbody></table></div>'+
    '<div class="ct-total" id="ct-r-total">'+totalsHTML(tot, d.vatMode)+'</div>'+
    budWarn + ceoNote +
  '</div>'+
  aiPanelHTML()+
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
  /* المرفقات (طلبُ المالك): تُختار هنا وتُرفَع **بعد** إنشاء الطلب برقمه — ملفاتُ
     المتصفّح لا تُكتب في Firestore، فتبقى في المسوّدة حتى الإرسال. */
  '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("paperclip","ic-sm")+' المرفقات '+
      '<span class="ct-sec-lock">عرضُ السعر · الفاتورة · أيُّ مستندٍ يسند القرار</span>'+
      '<input type="file" id="ct-r-attadd" style="display:none" accept="image/*,application/pdf" multiple onchange="contracts.addDraftAttach(this)">'+
      '<button class="btn btn-ghost btn-sm" style="margin-inline-start:auto" onclick="document.getElementById(\'ct-r-attadd\').click()">'+_icn("plus","ic-sm")+' إضافة مرفق</button></div>'+
    ((d.attachFiles||[]).length ? (d.attachFiles||[]).map(function(f,i){
      return '<div class="ct-att"><span>'+_icn("paperclip","ic-sm")+' '+_esc(f.name||"ملف")+'</span>'+
        '<span class="ct-att-m"><span class="num">'+money0(Math.max(1,Math.round((f.size||0)/1024)))+'</span> ك.ب — يُرفَع مع الإرسال</span>'+
        '<button class="btn btn-delete" onclick="contracts.delDraftAttach('+i+')">'+_icn("trash","ic-sm")+'</button></div>';
    }).join("") : '<div style="color:var(--muted);font-size:12px">لا مرفقات — الإرفاق اختياريٌّ، ويمكن إضافته لاحقاً من بطاقة الطلب.</div>')+
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

/* ── رصيدُ «البند المستعاض» على طلب التعاقد ──
   يظهر السؤالُ **فقط** إن كانت وحدةُ الرصيد حاضرةً وفيها حسابٌ واحدٌ على الأقل:
   سؤالٌ بلا جوابٍ ممكنٍ ضوضاءُ نموذجٍ لا خيار. والحسابُ المربوطُ بمشروع الطلب
   يُرشَّح تلقائياً بالمفتاح الموحّد نفسِه (`docProjectKey`: الرسميُّ بمعرّفه
   واليدويُّ بـ`__CUSTOM__:`) — كما يفعل نموذجُ طلب الشراء حرفياً. */
function substituteLinkHTML(d, ref){
  var sb=_sb(); if(!sb) return "";
  var accs=[]; try{ accs=sb.accounts()||[]; }catch(e){}
  if(!accs.length) return "";
  var on = d.isSubstitute === true;
  var preferred = d.substituteAccountId || "";
  if(on && !preferred){ try{ preferred = sb.accountForProject(docProjectKey(ref))||""; }catch(e){} }
  var opts=""; try{ opts=sb.optionsHtml(preferred); }catch(e){}
  return '<div class="ct-sub'+(on?" on":"")+'">'+
    '<label class="ct-sub-h"><input type="checkbox" id="ct-r-sub"'+(on?" checked":"")+
      ' onchange="contracts.toggleSubstitute()"> '+_icn("landmark","ic-sm")+' هذا العمل من البند المستعاض</label>'+
    '<div class="ct-sub-s">يُخصَم من رصيد الحساب المختار ما يخرج فعلاً — أمرُ الدفع المسدَّد أو مستخلصاتُ العقد المسدَّدة.</div>'+
    (on ? '<div style="margin-top:9px">'+field("حساب البند المستعاض *",
        '<select class="form-input" id="ct-r-subacc">'+opts+'</select>')+'</div>' : '')+
  '</div>';
}

/* شارةُ «البند المستعاض» على الطلب والعقد — دالّةٌ واحدةٌ تُستدعى في كلّ موضع.
   `compact` للمواضع الضيّقة (بلاطاتُ القائمة). واسمُ الحساب في `title` لمن أراده. */
function substituteChip(doc, compact){
  if(!docSubstituteId(doc)) return "";
  var nm=""; try{
    var sb=_sb();
    if(sb){ var a=(sb.accounts()||[]).find(function(x){ return x && x.id===doc.substituteAccountId; }); if(a) nm=a.name||""; }
  }catch(e){}
  return '<span class="ct-sub-chip" title="'+_esc("يُخصَم من رصيد البند المستعاض"+(nm?" — "+nm:""))+'">'+
    _icn("landmark","ic-sm")+' '+(compact?"مستعاض":"البند المستعاض")+'</span>';
}

function totalsHTML(t, mode){
  var m=VAT_MODES[normVatMode(mode)];
  return '<div class="ct-tl"><span class="l">الأساس</span><span class="v num">'+money(t.base)+'</span></div>'+
    '<div class="ct-tl"><span class="l">ض.ق.م</span><span class="v num">'+money(t.vat)+'</span></div>'+
    '<div class="ct-tl big"><span class="l">الإجمالي — '+_esc(m.short)+'</span><span class="v num">'+money(t.total)+'</span></div>';
}
/* تخصّصُ الطرف داخلَ خيار الاختيار: من يُسند عملَ كهرباءَ يحتاج أن يميّز
   كهربائياً من سبّاكٍ **وهو في لحظة الاختيار**، لا بعد فتح سجلّ الأطراف. */
function vendorOptions(sel){
  return '<option value="">— اختر الطرف —</option>'+_vendors.map(function(v){
    var ent=ENTITY_TYPES[normEntity(v.entityType)];
    var tr =vendorTrades(v).slice(0,2).map(tradeLabel).join(" · ");
    return '<option value="'+_esc(v.id)+'"'+(sel===v.id?' selected':'')+'>'+_esc(v.name||v.id)+' — '+_esc(ent.short)+
      (tr?' · '+_esc(tr):'')+'</option>';
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
function toggleSubstitute(){
  syncReqDraft(); if(!_rDraft) return;
  paintReqs();
}
function cancelRequestForm(){ _rDraft=null; paintReqs(); }

/* ── مرفقاتُ المسوّدة: ملفاتٌ تُمسَك في الذاكرة حتى الإرسال ── */
var ATTACH_MAX_MB = 10;
function addDraftAttach(inp){
  syncReqDraft(); if(!_rDraft) return;
  var fs=inp&&inp.files?Array.prototype.slice.call(inp.files):[];
  if(!fs.length) return;
  if(!Array.isArray(_rDraft.attachFiles)) _rDraft.attachFiles=[];
  var dropped=0;
  fs.forEach(function(f){
    if((f.size||0) > ATTACH_MAX_MB*1024*1024){ dropped++; return; }
    _rDraft.attachFiles.push(f);
  });
  if(dropped) _toast("⚠ "+dropped+" ملفاً تجاوز "+ATTACH_MAX_MB+" م.ب فأُسقط","warn");
  paintReqs();
}
function delDraftAttach(i){ syncReqDraft(); if(!_rDraft) return; (_rDraft.attachFiles||[]).splice(i,1); paintReqs(); }

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
  if(d.isSubstitute && !d.substituteAccountId){ _toast("⚠ اختر حساب البند المستعاض","warn"); return; }
  if(d.engagement==="pay_order" && !payOrderAllowed(total,payOrderThreshold()) && !d.overThreshold){
    _toast("⚠ أمر الدفع عند "+money0(payOrderThreshold())+" ر.س فأكثر يلزمه إقرارٌ صريح — فعِّل مربّع الإقرار أو حوّله إلى عقد","warn"); return;
  }
  if(d.engagement==="pay_order" && !paymentPlanOk(d.payPlan)){
    _toast("⚠ خطة صرف الدفعات: نسبٌ موجبةٌ مجموعُها ١٠٠٪ بالضبط — راجع الخطة","warn"); return;
  }
  var btn=document.getElementById("ct-r-send"); if(btn){ btn.disabled=true; btn.textContent="جارٍ الإرسال…"; }
  // الشكلُ القياسيُّ للمشروع يُثبَّت هنا مرةً واحدة — ولا يُخزَّن معرّفُ العرض الداخليّ
  var files=(d.attachFiles||[]).slice();
  var payload=Object.assign({}, d, ref);
  delete payload.projectSel;
  delete payload.attachFiles;   // ملفاتُ المتصفّح لا تُكتب في Firestore — تُرفَع بعد الإنشاء برقم الطلب
  delete payload.payPlan;       // حقلُ المسوّدة — يُخزَّن مطبَّعاً باسم paymentPlan
  if(d.engagement==="pay_order") payload.paymentPlan = normPaymentPlan(d.payPlan);
  createRequest(payload).then(function(id){
    /* المرفقاتُ بعد الإنشاء: فشلُ رفعِ ملفٍّ لا يُسقط طلباً أُنشئ فعلاً — يُقال
       صراحةً ويبقى بابُ الإضافة من البطاقة مفتوحاً (نهجُ مستندات الأطراف). */
    var failed=0;
    var up = !files.length ? Promise.resolve() :
      Promise.all(files.map(function(f){
        return uploadVendorDoc(id, f, "attachment")
          .catch(function(e){ console.warn("contracts/attachUpload", e); failed++; return null; });
      })).then(function(atts){
        var ok=atts.filter(Boolean);
        return ok.length ? addReqAttachments(id, ok).catch(function(e){
          console.warn("contracts/attachSave", e); failed+=ok.length;
        }) : null;
      });
    return Promise.resolve(up).then(function(){
      _rDraft=null; _rOpen=id; paintReqs();
      if(failed) _toast("⚠ أُرسل الطلب "+id+" لكن تعذّر رفع "+failed+" مرفق — أضِفه من بطاقة الطلب","warn");
      else _toast("✅ أُرسل الطلب "+id,"success");
    });
  }).catch(function(e){
    console.warn("contracts/submitRequest",e);
    if(btn){ btn.disabled=false; btn.innerHTML=_icn("send","ic-sm")+" إرسال للاعتماد"; }
    _toast("⚠ تعذّر الإرسال — "+(e&&e.message?e.message:"أعد المحاولة"),"warn");
  });
}

/* ── بطاقةُ الطلب ── */
function reqCardHTML(id){
  var r=requestById(id);
  if(!r) return headHTML("طلبات التعاقد وأوامر الدفع","","", "fileText")+'<div class="card">تعذّر العثور على الطلب.</div>';
  var eng=ENGAGEMENTS[r.engagement]||ENGAGEMENTS.contract;
  var owner=crqGateOwner(r.status);
  var mine=crqCanAct(r.status,_role());
  /* فصلُ المهام: مَن وقّع بوّابةً سابقةً لا يوقّع هذه — إلا إن لم يوجد غيرُه.
     والقرارُ من الدالّة نفسِها التي تحرس طبقةَ البيانات، فلا ينحرف زرٌّ عن قاعدة. */
  var mode=crqActMode(r, r.status, _role(), _meUser(), _me(), _users());
  var back='<button class="btn btn-ghost btn-sm ct-back" onclick="contracts.backToReqs()">'+_icn("rotateCcw")+' كل الطلبات</button>';

  var tools="";
  /* طباعةُ أمر الدفع متاحةٌ في كل مراحله — والورقةُ نفسُها تُعلن أصالحةٌ للصرف هي
     أم نسخةُ مراجعة (`payOrderPrintState`). فمنعُ الزرّ قبل الاعتماد كان سيدفع إلى
     تصوير الشاشة: صورةٌ بلا وسمٍ ولا توقيعاتٍ ولا مبلغٍ كتابة. */
  if(r.engagement==="pay_order"){
    tools+='<button class="btn btn-ghost btn-sm" onclick="contracts.printPay()">'+_icn("printer","ic-sm")+' طباعة أمر الدفع</button> ';
  } else {
    /* مسودةُ العقد — **في كلّ مرحلةٍ ولكلّ دور**: مَن يُطلَب منه اعتمادُ ارتباطٍ
       يرى الوثيقةَ التي سيوقّعها الطرفُ الآخر، لا ملخّصَها. */
    tools+='<button class="btn btn-ghost btn-sm" onclick="contracts.printDraft()">'+_icn("printer","ic-sm")+' طباعة مسودة العقد</button> ';
  }
  if(r.status==="crq_approved" && ["procurement_officer","admin"].indexOf(_role())!==-1){
    tools+='<button class="btn btn-primary btn-sm" onclick="contracts.makeContract()">'+_icn("briefcase","ic-sm")+' إنشاء العقد</button> ';
  }
  if(r.status==="crq_converted" && r.contractId){
    tools+='<button class="btn btn-ghost btn-sm" onclick="contracts.openCtrFromReq(\''+_jq(r.contractId)+'\')">'+_icn("briefcase","ic-sm")+' العقد '+_esc(r.contractId)+'</button> ';
  }
  if(mine && r.status==="crq_pending_pay"){
    // الممنوعُ بفصل المهام لا يرى زرَّ السداد — ويرى سببَ غيابه في الشريط أدناه
    if(mode!=="blocked")
      tools+='<button class="btn btn-success btn-sm" onclick="contracts.openPay()">'+_icn("banknote","ic-sm")+' تسجيل السداد</button> ';
  } else if(mine){
    // زرُّ الاعتماد يحمل **اسمَ بوّابته** — فلا يُقرأ ظهورُه ثانيةً زرّاً عالقاً
    if(mode!=="blocked")
      tools+='<button class="btn btn-success btn-sm" onclick="contracts.act(\'approve\')">'+_icn("checkCircle","ic-sm")+
             ' اعتماد — '+_esc((owner||{}).lbl||"")+'</button> ';
    // الرفضُ/الإعادة لا يُمنع أبداً: لا يراكم سلطةً، ومنعُه يحبس الطلبَ بلا مخرج
    tools+='<button class="btn btn-ghost btn-sm" onclick="contracts.act(\'reject\')">'+_icn("xCircle","ic-sm")+' رفض / إعادة</button> ';
  }
  /* إرجاعٌ إلى بوّابةٍ محدّدة — للأدمن، وعلى الطلب غيرِ المنتهي، وحين توجد وجهةٌ
     صالحةٌ أصلاً (فلا زرَّ يفتح قائمةً فارغة). */
  if(!crqIsFinal(r.status) && _role()==="admin" && crqRewindTargets(r, ceoThreshold()).length){
    tools+='<button class="btn btn-ghost btn-sm" onclick="contracts.openRewind()">'+_icn("rotateCcw","ic-sm")+' إرجاع لمرحلة</button> ';
  }
  if(!crqIsFinal(r.status) && (_role()==="admin" || r.createdByUser===_meUser())){
    tools+='<button class="btn btn-ghost btn-sm" onclick="contracts.doCancel()">'+_icn("ban","ic-sm")+' إلغاء</button>';
  }
  /* حذفُ الملغى — للأدمن وحدَه: الورقةُ التي ماتت قبل أن تُنتج أثراً تُنظَّف،
     وما أنتج أثراً ماليّاً (معتمَدٌ · محوَّلٌ · مسدَّد) لا يظهر له زرُّ حذفٍ أصلاً. */
  if(r.status==="crq_cancelled" && _role()==="admin"){
    tools+='<button class="btn btn-delete btn-sm" onclick="contracts.doDelete()">'+_icn("trash","ic-sm")+' حذف الطلب</button>';
  }

  var t=linesTotal(r.lines||[], r.vatMode);
  var info='<div class="ct-info">'+
    infoCell("الطرف", vendorCell(r.vendorId, r.vendorName))+
    infoCell("المشروع", _esc(_projName(r))+(r.isCustomProject?' <span class="ct-doc s-none">يدويّ</span>':""))+
    infoCell("نوع الارتباط", _icn(eng.icon,"ic-sm")+" "+_esc(eng.lbl))+
    (r.overThresholdAck?infoCell("فوق عتبة أمر الدفع",
      '<span class="ct-doc s-soon">'+_icn("alertTriangle","ic-sm")+' بإقرار '+_esc(r.overThresholdAck.by||"")+
      ' — العتبة '+money0(r.overThresholdAck.threshold)+' ر.س</span>'):"")+
    (function(){
      // خطةُ الصرف كما حدّدها المنشئ — والمسدَّدُ منها موسومٌ ✓ فيقرؤها كلُّ معتمِد
      if(r.engagement!=="pay_order") return "";
      var _plan=normPaymentPlan(r.paymentPlan);
      if(!_plan.length) return "";
      var _pc=Array.isArray(r.payments)?r.payments.length:0;
      return infoCell("خطة الصرف (حدّدها المنشئ)", _plan.map(function(p,i){
        return '<span class="ct-doc '+(i<_pc?'s-ok':'s-soon')+'">'+p+'٪'+(i<_pc?' ✓':'')+'</span>';
      }).join(' '));
    })()+
    (docSubstituteId(r)?infoCell("البند المستعاض", substituteChip(r)):"")+
    infoCell("وضع الضريبة", _esc((VAT_MODES[normVatMode(r.vatMode)]||{}).short||"—"))+
    infoCell("مدة التنفيذ", r.durationDays?(money0(r.durationDays)+" يوماً"):"—")+
    infoCell("أنشأه", _esc(r.createdBy||"—"))+
  '</div>';

  var lineRows=(r.lines||[]).map(function(l,i){
    var lt=lineTotal(l.qty,l.unitPrice,r.vatMode);
    return '<tr>'+lnSeq(i)+'<td>'+_esc(l.desc||"—")+'</td><td>'+_esc(l.unit||"")+'</td>'+
      '<td class="num">'+money0(l.qty)+'</td><td class="num">'+money(l.unitPrice)+'</td>'+
      '<td class="num">'+money(lt.total)+'</td></tr>';
  }).join("") || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:14px">—</td></tr>';

  var termsRow = r.engagement==="pay_order" ? "" :
    '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("shield","ic-sm")+' الشروط التجارية</div><div class="ct-info">'+
      infoCell("الدفعة المقدمة", ((r.advance||{}).pct||0)+"٪")+
      infoCell("محتجز الضمان", ((r.retention||{}).pct||0)+"٪")+
      infoCell("غرامة التأخير", _esc(penaltyText(r.penalty, crqValueOf(r))))+
      infoCell("مدة الضمان", ((r.warranty||{}).months||0)+" شهراً")+
    '</div></div>';

  var draftSec = r.engagement==="pay_order" ? "" : crqDraftSecHTML(r);

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

  /* المرفقات — تظهر الفقرةُ لمن يرى الطلب، وزرُّ الإضافة لمن يملكها فقط */
  var atts=Array.isArray(r.attachments)?r.attachments:[];
  var attRows=atts.map(function(a){
    return '<div class="ct-att">'+
      '<a class="ct-link" href="'+_esc(a.url)+'" target="_blank" rel="noopener">'+_icn("paperclip","ic-sm")+' '+_esc(a.name||"مرفق")+'</a>'+
      '<span class="ct-att-m">'+_esc(a.by||"")+' · '+_esc(String(a.at||"").slice(0,16).replace("T"," "))+'</span>'+
      (canDelAttach(r,a)?'<button class="btn btn-delete" title="حذف المرفق" onclick="contracts.delReqAttach(\''+_jq(a.id)+'\')">'+_icn("trash","ic-sm")+'</button>':'')+
    '</div>';
  }).join("");
  var attSec=(atts.length||canAttachReq(r)) ? '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("paperclip","ic-sm")+' المرفقات'+
      (canAttachReq(r)?'<input type="file" id="ct-r-attfile" style="display:none" accept="image/*,application/pdf" onchange="contracts.pickReqAttach(this)">'+
        '<button class="btn btn-ghost btn-sm" id="ct-r-attbtn" style="margin-inline-start:auto" onclick="document.getElementById(\'ct-r-attfile\').click()">'+_icn("plus","ic-sm")+' إضافة مرفق</button>':'')+
    '</div>'+
    (attRows||'<div style="color:var(--muted);font-size:12px">لا مرفقات — أرفق عرضَ السعر أو الفاتورة أو أيَّ مستندٍ يسند القرار.</div>')+
  '</div>' : "";

  var tl=(r.timeline||[]).map(function(e){
    return '<div class="ct-tl-row"><span class="d"></span><div><div class="t">'+_esc(e.event)+'</div>'+
      '<div class="m">'+_esc(e.by||"")+' · '+_esc(String(e.at||"").slice(0,16).replace("T"," "))+
      (e.note?' — '+_esc(e.note):'')+'</div></div></div>';
  }).join("") || '<div style="color:var(--muted);font-size:12px">—</div>';

  /* بيانُ السداد — دفعةً دفعةً (طلبُ المالك): كلُّ دفعةٍ بمبلغها وإيصالها ومَن
     سجّلها، وسطرُ المجموع يقول كم سُدِّد وكم بقي والأمرُ مفتوحٌ أو اكتمل.
     والوثائقُ القديمةُ بلا مصفوفةٍ تُعرَض من ملخّصها القديم كما كانت. */
  var _pays = Array.isArray(r.payments) && r.payments.length ? r.payments
            : (r.payment && r.payment.amount!=null ? [r.payment] : []);
  var _paidT = crqPaidTotal(r), _dueT = crqPayDue(r);
  var payBox = _pays.length ? '<div class="ct-note" style="display:block">'+
    _pays.map(function(p,i){
      return '<div'+(i?' style="margin-top:4px"':'')+'>'+_icn("banknote","ic-sm")+
        ' دفعة <span class="num">'+money(p.amount)+'</span> ر.س'+
        (p.ref?(' — '+_esc(p.ref)):'')+' · '+_esc(p.by||"")+
        ' · '+_esc(String(p.at||"").slice(0,16).replace("T"," "))+
        (p.receiptUrl?' · <a class="ct-link" href="'+_esc(p.receiptUrl)+'" target="_blank" rel="noopener">'+_icn("paperclip","ic-sm")+' الإيصال</a>':'')+
      '</div>';
    }).join("")+
    '<div style="margin-top:6px;font-weight:800">المسدَّد <span class="num">'+money(_paidT)+'</span> من <span class="num">'+money(r.value)+'</span> ر.س'+
      (r.status==="crq_paid" ? ' — اكتمل السداد ✓'
        : ' — المتبقّي <span class="num">'+money(_dueT)+'</span> ر.س والأمرُ مفتوح')+
    '</div>'+
  '</div>' : "";

  var waiting = owner && !crqIsFinal(r.status)
    ? '<div class="ct-note '+(mine && mode!=="blocked" ?"warn":"")+'">'+_icn("timer","ic-sm")+' '+
      (mine && mode!=="blocked" ? "الطلب بانتظار إجراءٍ منك — "+_esc(owner.lbl) : "بانتظار "+_esc(owner.lbl))+'</div>' : "";

  var sod = sodNoteHTML(mode, owner);

  return back +
    headHTML(r.title||r.id, reqBadge(r.status)+' <span class="ct-id num">'+_esc(r.id)+'</span>', tools, eng.icon) +
    waiting + sod + payProgressHTML(r, false) + payBox +
    '<div class="card ct-sec">'+info+
      (r.scope?'<div class="ct-note" style="margin-top:12px">'+_esc(r.scope)+'</div>':'')+'</div>'+
    // في وضع التحرير يحلّ المحرّرُ محلَّ الجدول — لا جدولان لبنودٍ واحدة
    (_lnEdit ? linesEditHTML(r) :
      '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("layers","ic-sm")+' البنود'+
        (canEditLines(r) ? '<button class="btn btn-ghost btn-sm" style="margin-inline-start:auto" onclick="contracts.editLines()">'+_icn("edit","ic-sm")+' تعديل البنود</button>' : '')+
      '</div>'+
      '<div class="ct-table-wrap"><table class="ct-table"><thead><tr>'+LN_TH+'<th>الوصف</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>'+
      '<tbody>'+lineRows+'</tbody></table></div>'+
      '<div class="ct-total">'+totalsHTML(t, r.vatMode)+'</div>'+
    '</div>')+
    termsRow + candSec + draftSec + attSec +
    '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("scrollText","ic-sm")+' السجل الزمني</div><div class="ct-timeline">'+tl+'</div></div>';
}

/* ── إضافةُ مرفقٍ من البطاقة وحذفُه ── */
var _attBusy=false;
function pickReqAttach(inp){
  var r=requestById(_rOpen); if(!r) return;
  var f=inp&&inp.files&&inp.files[0]; if(!f) return;
  if(_attBusy) return;
  if((f.size||0) > ATTACH_MAX_MB*1024*1024){ _toast("⚠ حجم المرفق يتجاوز "+ATTACH_MAX_MB+" م.ب","warn"); inp.value=""; return; }
  _attBusy=true;
  var btn=document.getElementById("ct-r-attbtn"); if(btn){ btn.disabled=true; btn.textContent="جارٍ الرفع…"; }
  uploadVendorDoc(r.id, f, "attachment").then(function(att){
    return addReqAttachments(r.id, [att]);
  }).then(function(){
    _attBusy=false; _toast("✅ أُضيف المرفق","success"); paintReqs();
  }).catch(function(e){
    _attBusy=false;
    console.warn("contracts/pickReqAttach", e);
    _toast("⚠ تعذّر رفع المرفق — "+_errMsg(e),"warn");
    paintReqs();
  });
}
function delReqAttach(attId){
  var r=requestById(_rOpen); if(!r) return;
  var att=(r.attachments||[]).find(function(a){ return a && a.id===attId; }); if(!att) return;
  Promise.resolve(_confirm({ kind:"danger", icon:"🗑", okText:"حذف",
    title:"حذف المرفق",
    msg:'سيُحذف المرفق «'+(att.name||"مرفق")+'» من الطلب. يبقى الحذفُ مسجّلاً في السجل الزمني.'
  })).then(function(ok){
    if(!ok) return;
    return deleteReqAttachment(r.id, attId).then(function(){ _toast("✅ حُذف المرفق","success"); paintReqs(); });
  }).catch(function(e){ _toast("⚠ "+_errMsg(e),"warn"); });
}

/* ── مسودةُ العقد على الشاشة ──
   الورقةُ تُطبَع، وهذه تُقرأ في مكانها: الشروطُ القانونيةُ والماليةُ كما ستُنسَخ إلى
   العقد حرفياً، مع شريطِ حالتها. **بلا شرطِ دورٍ ولا شرطِ مرحلة** — القراءةُ ليست
   بوّابة، ومَن يرى الطلبَ يرى ما سيصير إليه.

   والنصُّ من `allClausesOf(crqDraftContract(...))` — القوالبُ المخزَّنةُ نفسُها التي
   ستُجمَّد في العقد، والشروطُ الماليةُ متولّدةٌ من أرقام الطلب. فلا نصَّ يُكتب هنا
   ويُخالف ما سيُطبَع هناك. */
function crqDraftSecHTML(r){
  var st = crqDraftState(r);
  var d  = crqDraftContract(r, clauseTemplates());
  var groups = allClausesOf(d);
  var body = groups.map(function(g){
    return '<div class="ct-cl-grp"><div class="ct-cl-cat">'+_esc(g.label)+'</div>'+
      g.items.map(function(x){
        var auto = String(x.key||"").indexOf("_fin_")===0;
        return '<div class="ct-cl"><div class="ct-cl-t">'+_esc(x.title||"")+
          (auto?' <span class="ct-doc s-ok">يتولّد من أرقام الطلب</span>':'')+'</div>'+
          '<div class="ct-cl-b">'+_esc(x.body||"")+'</div></div>';
      }).join("")+'</div>';
  }).join("") || '<div style="color:var(--muted);font-size:12.5px">لا شروط.</div>';

  // شريطُ الحالة بلغة الشاشة: `ok` حيادٌ · `warn` تنبيهٌ · `bad` ⇐ `crit`
  var cls = st.cls==="ok" ? "" : (st.cls==="bad" ? "crit" : "warn");
  return '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("fileText","ic-sm")+' مسودة العقد'+
      '<span class="ct-sec-lock">الوثيقةُ التي سيوقّعها الطرف — تُعرَض في كل مراحل الاعتماد</span>'+
      '<button class="btn btn-ghost btn-sm" style="margin-inline-start:auto" onclick="contracts.printDraft()">'+
        _icn("printer","ic-sm")+' طباعة</button>'+
    '</div>'+
    '<div class="ct-note '+cls+'">'+_icn("alertCircle","ic-sm")+' <b>'+_esc(st.lbl)+'</b>'+
      (st.note?' — '+_esc(st.note):'')+'</div>'+
    body+
  '</div>';
}

/* ── أفعالُ الطلب ── */
function filterReqs(k,v){
  _rFilter[k]=v||""; paintReqs();
  if(k==="q"){ var i=document.getElementById("ct-r-q"); if(i){ i.focus(); try{ i.setSelectionRange(i.value.length,i.value.length); }catch(e){} } }
}
/* «مسح الفلاتر» يمسح التصفيةَ لا المكان: التبويبُ موضعُ وقوفٍ يبقى حيث أنت. */
function clearReqFilters(){ _rFilter={ q:"", status:"", project:"", tab:reqCurTab() }; paintReqs(); }
/* تبديلُ التبويب يُصفّر فلترَ الحالة وحدَه — مفاتيحُ مجموعاته تختلف بين التبويبات،
   ويبقى البحثُ ونطاقُ المشروع فهُما سؤالُ المستخدم لا سؤالَ التبويب. */
function reqTab(t){
  var to = (t==="pay_orders"||t==="pay_paid") ? t : "requests";
  if(to===reqCurTab()) return;
  _rFilter.tab=to; _rFilter.status="";
  paintReqs();
}
function openReq(id){ _rOpen=id; _rDraft=null; _lnEdit=null; _aiLines=null; paintReqs(); }
function backToReqs(){ _rOpen=null; _rDraft=null; _lnEdit=null; _aiLines=null; paintReqs(); }
function retryReqs(){ stopReqSync(); startReqSync(); paintReqs(); }

function act(action){
  var r=requestById(_rOpen); if(!r) return;
  var isRej = action==="reject";
  Promise.resolve(_confirm({
    kind: isRej?"reject":"approve",
    title: isRej?"رفض / إعادة الطلب":"اعتماد الطلب",
    msg: isRej ? "سيعود الطلب لمُنشئه للتصحيح. اكتب السبب في الخطوة التالية."
               : 'اعتماد «'+(r.title||r.id)+'» بقيمة '+money(r.value)+' ر.س؟',
    /* v18.9xi: خانةُ ملاحظات المعتمِد (طلبُ المالك) — اختياريةٌ، تُقيَّد في السجل
       الزمنيّ وتُجمَّد مع العقد فتظهر في تفاصيله، ولا تدخل ورقتَه المطبوعة. */
    input: isRej ? null : { label:"ملاحظات الاعتماد (اختياري)",
                            placeholder:"تظهر في تفاصيل الطلب والعقد — ولا تُطبَع في العقد نفسه" }
  })).then(function(ok){
    if(!ok) return;
    var note = (!isRej && ok && ok.value) ? String(ok.value).trim() : "";
    if(isRej){
      note=(window.prompt("سبب الرفض / الإعادة (إلزامي):")||"").trim();
      if(!note){ _toast("⚠ السبب إلزامي","warn"); return; }
    }
    return actOnRequest(_rOpen, action, note).then(function(){
      paintReqs(); _toast(isRej?"✅ أُعيد الطلب مع السبب":"✅ اعتُمد","success");
    });
  }).catch(function(e){
    console.warn("contracts/act",e);
    _toast("⚠ "+_errMsg(e),"warn");
  });
}
function doCancel(){
  Promise.resolve(_confirm({ kind:"danger", icon:"🚫", okText:"إلغاء الطلب",
    title:"إلغاء الطلب", msg:"سيُغلق الطلب نهائياً. متابعة؟" })).then(function(ok){
    if(!ok) return;
    var reason=(window.prompt("سبب الإلغاء:")||"").trim();
    return cancelRequest(_rOpen, reason).then(function(){ paintReqs(); _toast("✅ أُلغي الطلب","success"); });
  }).catch(function(e){ _toast("⚠ "+_errMsg(e),"warn"); });
}

/* حذفُ طلبٍ ملغى — الفعلُ الوحيدُ في الوحدة الذي **لا رجعةَ فيه**، فرسالتُه تقول
   ذلك صراحةً وتذكر المعرّفَ الذي سيُمحى. والرفضُ الحقيقيُّ في طبقة البيانات وفي
   قواعد الخادم — وهذه الشاشةُ آخرُ حاجزٍ لا أوّلُه. */
function doDelete(){
  var r=requestById(_rOpen); if(!r) return;
  var id=_rOpen;
  Promise.resolve(_confirm({ kind:"danger", icon:"🗑", okText:"حذف نهائياً",
    title:"حذف الطلب الملغى",
    msg:'سيُحذف الطلب «'+(r.title||id)+'» ('+id+') نهائياً ولا يمكن استرجاعه. يبقى الحذفُ مسجّلاً في سجل التدقيق.'
  })).then(function(ok){
    if(!ok) return;
    return deleteRequest(id).then(function(){
      paintReqs(); _toast("✅ حُذف الطلب "+id,"success");
    });
  }).catch(function(e){
    console.warn("contracts/doDelete",e);
    _toast("⚠ "+_errMsg(e),"warn");
  });
}

/* من يملك تعديلَ البنود؟ الأدمن، وعلى طلبٍ غيرِ منتهٍ. قاعدةٌ في موضعٍ واحد
   يقرؤها الزرُّ **وطبقةُ البيانات** (وقواعدُ الخادم تقول مثلَها). */
function canEditLines(req){ return _role()==="admin" && !!req && !crqIsFinal(req.status); }

/* ════════════════════════════════════════════════════════════════════
   الصياغةُ الهندسيةُ لبنود الأعمال بالذكاء الاصطناعي        (طلبُ المالك)
   ════════════════════════════════════════════════════════════════════

   **الحاجة.** بنودُ الأعمال تُكتب على عجلٍ في الميدان: «محارة»، «تركيب أبواب».
   وهذا الوصفُ يذهب إلى **وثيقةٍ يوقّعها الطرفان** ويُحاسَب عليها المستخلص. فبندٌ
   غامضٌ خلافٌ مؤجَّل: أيُّ محارةٍ؟ بأيّ سُمكٍ؟ وهل تشمل الزوايا والشبك؟

   **الحدُّ الذي لا يُتجاوَز — الذكاءُ يصوغ الكلماتِ لا الأرقام.**
   الكميةُ وسعرُ الوحدة والإجماليُّ **لا تمرّ من هنا إطلاقاً**: هي مالٌ يقرّره
   الإنسان، وإدخالُ نموذجٍ لغويٍّ عليها بابٌ لخطأٍ صامتٍ يوقّع عليه الطرفان. فما
   يُقترَح هو **الوصفُ ووحدةُ القياس** فقط، والوحدةُ لأنها لغةُ البند لا قيمتَه.

   **ولا تطبيقَ صامت.** الاقتراحُ يُعرَض جنباً إلى جنبٍ مع الأصل (قبل/بعد) ويُطبَّق
   ببندٍ ببند أو دفعةً — بقرار المستخدم. والنموذجُ **لا يزيد بنداً ولا ينقص**:
   المطابقةُ بالمعرّف، وما لم يُطابِق يُهمَل. فهو محرّرُ صياغةٍ لا مُقايِسٌ ثانٍ.

   **ويعمل النظامُ بدونه.** الزرُّ لا يظهر إن لم تكن **طبقةُ الذكاء موجودةً** في
   الصفحة أصلاً (`_aiText`). وإن كانت موجودةً بلا إعدادٍ (بروكسي غيرُ محفوظ) فالزرُّ
   يظهر ورسالتُه صريحةٌ تدلّ على مكان الإعداد — وهو سلوكُ بقية أدوات الذكاء في
   المنصة، ولا نخفي زرّاً لأن إعداداً ناقصٌ قد يُستكمَل بعد لحظة. وفشلُ النداء توستٌ
   عربيٌّ مفهوم (`_msgErr` نفسُها التي تخدم بقية المنصة)، والنموذجُ يبقى قابلاً
   للتعبئة يدوياً كما كان. */
var _aiLines = null;          // [{id, wasDesc, newDesc, wasUnit, newUnit}]
var _aiBusy  = false;

function aiReady(){
  try{ return typeof _aiText === "function"; }catch(e){ return false; }
}
/* السياقُ الذي يراه النموذج: طبيعةُ العمل ومشروعُه ونطاقُه — بلا أرقامٍ ماليّة.
   لا يُمرَّر سعرٌ ولا إجماليٌّ: ما لا يحتاجه لصياغة الوصف لا يُرسَل. */
function aiLinesPrompt(head, lines){
  var body = lines.map(function(l,i){
    return (i+1)+") [id:"+String(l.id||"")+"] الوصف: "+String(l.desc||"—")+
           " · الوحدة: "+(String(l.unit||"").trim()||"—")+
           " · الكمية: "+(Number(l.qty)||0);
  }).join("\n");
  return "أنت مهندسٌ مدنيٌّ يُعِدّ جداول الكميات (BOQ) لعقود مقاولات الباطن في السعودية.\n"+
    "أعِد صياغة **وصف** كل بندٍ صياغةً هندسيةً دقيقةً تصلح لوثيقةٍ يوقّعها الطرفان:\n"+
    "• حدِّد العملَ ومكوّناتِه ومعيارَ التنفيذ المتعارف عليه (السُّمك · النوع · التشطيب) متى دلّ عليه الوصفُ الأصليّ.\n"+
    "• اذكر ما يشمله البندُ عادةً (التجهيز · التوريد · التركيب · التنظيف) إن كان لازماً لرفع الغموض.\n"+
    "• صحِّح وحدةَ القياس إن كانت غيرَ مناسبة (م٢ · م.ط · م٣ · عدد · طن · مقطوعية).\n"+
    "• **لا تخترع** مواصفةً لا يدلّ عليها الوصفُ الأصليُّ ولا سياقُ العمل، ولا تُضِف بنوداً ولا تحذف.\n"+
    "• **لا تذكر أسعاراً ولا كمياتٍ ولا مبالغَ إطلاقاً** — الوصفُ فقط.\n"+
    "• عربيةٌ فصحى مهنيةٌ موجزة: سطرٌ واحدٌ لكل بند، وحدُّه ٢٠٠ حرف.\n\n"+
    "سياق العمل:\n"+head+"\n\nالبنود:\n"+body+"\n\n"+
    "أعِد **JSON فقط** بلا أيّ نصٍّ آخر، مصفوفةً بهذا الشكل:\n"+
    '[{"id":"<المعرّف كما هو>","desc":"<الوصف الهندسي>","unit":"<وحدة القياس>"}]';
}
/* قراءةُ ردّ النموذج: JSON صارمٌ، ومطابقةٌ بالمعرّف، وحدٌّ للطول.
   دالّةٌ نقيةٌ تُختبَر وحدَها — فهي الحاجزُ الذي يمنع ردّاً مشوَّهاً من إفساد نموذجٍ
   يعمل: ما لا يُفهَم يُهمَل ولا يُرمى خطأً في وجه المستخدم. */
function aiParseLines(raw, lines){
  var txt = String(raw||"").replace(/^```[a-z]*\s*/i,"").replace(/```\s*$/,"").trim();
  var a = txt.indexOf("["), b = txt.lastIndexOf("]");
  if(a < 0 || b <= a) return [];
  var arr; try{ arr = JSON.parse(txt.slice(a, b+1)); }catch(e){ return []; }
  if(!Array.isArray(arr)) return [];
  var byId = {}; (lines||[]).forEach(function(l){ if(l && l.id) byId[String(l.id)] = l; });
  var out = [];
  arr.forEach(function(o){
    if(!o || typeof o !== "object") return;
    var src = byId[String(o.id||"")];
    if(!src) return;                                   // بندٌ لا نعرفه ⇒ يُهمَل
    var nd = String(o.desc||"").replace(/\s+/g," ").trim().slice(0,200);
    var nu = String(o.unit||"").replace(/\s+/g," ").trim().slice(0,20);
    if(!nd && !nu) return;
    var wasD = String(src.desc||""), wasU = String(src.unit||"");
    if(nd === wasD && (!nu || nu === wasU)) return;     // بلا تغيير ⇒ لا يُعرَض
    out.push({ id:String(src.id), wasDesc:wasD, newDesc:nd||wasD, wasUnit:wasU, newUnit:nu||wasU });
  });
  return out;
}
/* الهدفُ الحيُّ: مسودّةُ النموذج أو مسودّةُ تحرير الأدمن — أيُّهما مفتوحة. */
function aiTargetLines(){
  if(_lnEdit) return _lnEdit;
  if(_rDraft) return _rDraft.lines;
  return null;
}
function aiHeadContext(){
  if(_rDraft){
    var ref = normalizeProjectRef(_rDraft.projectSel, _rDraft.projectName, pmManualPrefix());
    return "العمل: "+(_rDraft.title||"—")+"\nالمشروع: "+_projName(ref)+
           (_rDraft.scope?("\nنطاق العمل: "+_rDraft.scope):"");
  }
  var r = requestById(_rOpen) || {};
  return "العمل: "+(r.title||"—")+"\nالمشروع: "+_projName(r)+(r.scope?("\nنطاق العمل: "+r.scope):"");
}
function aiDraftLines(){
  if(_aiBusy) return;
  if(!aiReady()) return _toast("⚠ الذكاء الاصطناعي غير مُفعّل — راجع: الإدارة › إعدادات الذكاء الاصطناعي","warn");
  if(_lnEdit) syncLines(); else syncReqDraft();
  var lines = aiTargetLines();
  var usable = (lines||[]).filter(function(l){ return l && String(l.desc||"").trim(); });
  if(!usable.length) return _toast("⚠ اكتب وصفاً مختصراً لبندٍ واحدٍ على الأقل، ثم اطلب الصياغة","warn");
  _aiBusy = true; _aiLines = null;
  var btn = document.getElementById("ct-ai-btn");
  if(btn){ btn.disabled = true; btn.textContent = "⏳ جارٍ الصياغة…"; }
  Promise.resolve(_aiText([{ role:"user", content: aiLinesPrompt(aiHeadContext(), usable) }],
                          { maxTokens: 1200, feature: "صياغة بنود العقد" }))
    .then(function(out){
      _aiLines = aiParseLines(out, usable);
      if(!_aiLines.length) _toast("⚠ لم يصل اقتراحٌ مختلفٌ عمّا كتبت","warn");
      else _toast("✅ وصلت "+_aiLines.length+" صياغة — راجِعها قبل الاستبدال","success");
    })
    .catch(function(e){
      console.warn("contracts/aiDraftLines", e);
      var m; try{ m = _msgErr(e); }catch(_){ m = (e&&e.message)||"تعذّر الاتصال"; }
      _toast("⚠ فشلت الصياغة: "+m, "warn");
    })
    .then(function(){ _aiBusy=false; paintReqs(); });
}
function aiCloseLines(){ _aiLines=null; paintReqs(); }
/* الاستبدالُ يمسّ **الوصفَ والوحدةَ وحدَهما** — الكميةُ والسعرُ لا يُقرآن هنا أصلاً. */
function aiApplyLine(i){
  var s = _aiLines && _aiLines[i]; if(!s) return;
  if(_lnEdit) syncLines(); else syncReqDraft();
  var arr = aiTargetLines() || [];
  for(var k=0;k<arr.length;k++){
    if(String(arr[k].id) === s.id){ arr[k].desc = s.newDesc; if(s.newUnit) arr[k].unit = s.newUnit; break; }
  }
  _aiLines.splice(i,1);
  if(!_aiLines.length) _aiLines=null;
  paintReqs();
  _toast("✅ استُبدل وصفُ البند","success");
}
function aiApplyAllLines(){
  if(!_aiLines || !_aiLines.length) return;
  var n = _aiLines.length;
  while(_aiLines && _aiLines.length) aiApplyLine(0);
  _toast("✅ استُبدلت "+n+" صياغة","success");
}
/* لوحةُ المراجعة: قبل/بعد صريحان — فالمستخدمُ يقارن ثمّ يقرّر، ولا يُفاجأ بنصٍّ
   حلّ محلَّ نصِّه. والأرقامُ غائبةٌ عن اللوحة كغيابها عن النداء. */
function aiPanelHTML(){
  if(!_aiLines || !_aiLines.length) return "";
  var rows = _aiLines.map(function(s,i){
    return '<tr>'+
      '<td style="color:var(--muted)">'+_esc(s.wasDesc||"—")+
        (s.wasUnit?'<div class="ct-id">'+_esc(s.wasUnit)+'</div>':'')+'</td>'+
      '<td><strong>'+_esc(s.newDesc)+'</strong>'+
        (s.newUnit && s.newUnit!==s.wasUnit ? '<div class="ct-id">الوحدة: '+_esc(s.newUnit)+'</div>' : '')+'</td>'+
      '<td><button class="btn btn-ghost btn-sm" onclick="contracts.aiApplyLine('+i+')">'+_icn("checkCircle","ic-sm")+' استبدال</button></td>'+
    '</tr>';
  }).join("");
  return '<div class="card ct-sec" id="ct-ai-box"><div class="ct-sec-h">'+_icn("sparkles","ic-sm")+' صياغةٌ هندسيةٌ مقترَحة'+
      '<span class="ct-sec-lock">اقتراحٌ يُراجَع — الكمياتُ والأسعارُ لا تُمَسّ</span></div>'+
    '<div class="ct-table-wrap"><table class="ct-table"><thead><tr>'+
      '<th>الوصف الحالي</th><th>الصياغة الهندسية المقترَحة</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div class="ct-save-bar" style="position:static">'+
      '<button class="btn btn-ghost btn-sm" onclick="contracts.aiCloseLines()">تجاهل</button>'+
      '<button class="btn btn-primary btn-sm" onclick="contracts.aiApplyAllLines()">'+_icn("checkCircle","ic-sm")+' استبدال الكل</button>'+
    '</div></div>';
}
function aiBtnHTML(){
  return aiReady()
    ? '<button class="btn btn-ghost btn-sm" id="ct-ai-btn" onclick="contracts.aiDraftLines()">'+
      _icn("sparkles","ic-sm")+' صياغة هندسية (AI)</button> '
    : "";
}

/* ── تحريرُ بنود الطلب (الأدمن) ── مسودّةٌ محلّيةٌ حتى الحفظ، فلا تُكتب كتابةٌ
   جزئيةٌ في القاعدة أثناء الطباعة. والإجماليُّ يُحسب بالدالّة نفسِها التي تحسبه
   في النموذج — لا حسابَ ثانٍ في الترميز. */
var _lnEdit = null;
function editLines(){
  var r=requestById(_rOpen); if(!r) return;
  if(_role()!=="admin") return _toast("⚠ تعديل البنود للأدمن فقط","warn");
  _lnEdit = (r.lines||[]).map(function(l){ return Object.assign({}, l); });
  if(!_lnEdit.length) _lnEdit.push({ id:_uid(), desc:"", unit:"", qty:0, unitPrice:0 });
  paintReqs();
  var b=document.getElementById("ct-ln-box"); if(b) b.scrollIntoView({behavior:"smooth", block:"center"});
}
function cancelLines(){ _lnEdit=null; _aiLines=null; paintReqs(); }
function syncLines(){
  if(!_lnEdit) return;
  var box=document.getElementById("ct-ln-rows"); if(!box) return;
  box.querySelectorAll("[data-ef]").forEach(function(inp){
    var i=parseInt(inp.dataset.i,10), f=inp.dataset.ef;
    if(!_lnEdit[i]||!f) return;
    _lnEdit[i][f] = (f==="qty"||f==="unitPrice") ? (Number(inp.value)||0) : String(inp.value||"").trim();
  });
}
function addEditLine(){ syncLines(); if(!_lnEdit) return; _lnEdit.push({ id:_uid(), desc:"", unit:"", qty:0, unitPrice:0 }); paintReqs(); }
function delEditLine(i){ syncLines(); if(!_lnEdit) return; _lnEdit.splice(i,1); if(!_lnEdit.length) _lnEdit.push({ id:_uid(), desc:"", unit:"", qty:0, unitPrice:0 }); paintReqs(); }
function editLinesRecalc(){
  syncLines();
  var r=requestById(_rOpen); if(!r||!_lnEdit) return;
  var box=document.getElementById("ct-ln-total");
  if(box) box.innerHTML = totalsHTML(linesTotal(_lnEdit, r.vatMode), r.vatMode);
}
function linesEditHTML(r){
  var rows=_lnEdit.map(function(l,i){
    var lt=lineTotal(l.qty,l.unitPrice,r.vatMode);
    return '<tr>'+lnSeq(i)+
      '<td><input class="form-input" data-ef="desc" data-i="'+i+'" value="'+_esc(l.desc||"")+'" placeholder="وصف البند"></td>'+
      '<td><input class="form-input" data-ef="unit" data-i="'+i+'" value="'+_esc(l.unit||"")+'" style="min-width:70px"></td>'+
      '<td><input class="form-input num" data-ef="qty" data-i="'+i+'" type="number" step="any" value="'+_esc(l.qty||0)+'" style="min-width:80px" oninput="contracts.editLinesRecalc()"></td>'+
      '<td><input class="form-input num" data-ef="unitPrice" data-i="'+i+'" type="number" step="any" value="'+_esc(l.unitPrice||0)+'" style="min-width:90px" oninput="contracts.editLinesRecalc()"></td>'+
      '<td class="num">'+money(lt.total)+'</td>'+
      '<td><button class="btn btn-delete" onclick="contracts.delEditLine('+i+')">'+_icn("trash","ic-sm")+'</button></td>'+
    '</tr>';
  }).join("");
  return '<div class="card ct-sec" id="ct-ln-box"><div class="ct-sec-h">'+_icn("layers","ic-sm")+' تعديل البنود'+
    '<span style="margin-inline-start:auto"></span>'+aiBtnHTML()+'</div>'+
    '<div class="ct-note">'+_icn("shield","ic-sm")+
      ' تغيّرُ القيمة يُسقط اعتمادَ المالية والتنفيذيِّ ويعيد الطلبَ إلى بوّابتهما — '+
      'فلا يمرّ رقمٌ جديدٌ على توقيعٍ قديم. واعتمادُ مدير المشاريع والمشتريات يبقى.</div>'+
    '<div class="ct-table-wrap" id="ct-ln-rows"><table class="ct-table"><thead><tr>'+LN_TH+
      '<th>الوصف</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th><th></th>'+
    '</tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div style="margin-top:10px"><button class="btn btn-ghost btn-sm" onclick="contracts.addEditLine()">'+_icn("plus","ic-sm")+' بند جديد</button></div>'+
    '<div class="ct-total" id="ct-ln-total">'+totalsHTML(linesTotal(_lnEdit, r.vatMode), r.vatMode)+'</div>'+
    aiPanelHTML()+
    '<div class="ct-form-row"><div>'+field("سبب التعديل *", '<input class="form-input" id="ct-ln-why" placeholder="لماذا تُعدَّل البنود؟">')+'</div><div></div></div>'+
    '<div class="ct-save-bar" style="position:static">'+
      '<button class="btn btn-ghost btn-sm" onclick="contracts.cancelLines()">إلغاء</button>'+
      '<button class="btn btn-primary btn-sm" id="ct-ln-btn" onclick="contracts.saveLines()">'+_icn("save","ic-sm")+' حفظ البنود</button>'+
    '</div></div>';
}
function saveLines(){
  syncLines();
  var w=document.getElementById("ct-ln-why"); var why=(w?w.value:"").trim();
  if(!why){ _toast("⚠ سبب التعديل إلزامي","warn"); if(w) w.focus(); return; }
  var btn=document.getElementById("ct-ln-btn"); if(btn) btn.disabled=true;
  editRequestLines(_rOpen, _lnEdit, why).then(function(r){
    _lnEdit=null; paintReqs();
    _toast("✅ عُدِّلت البنود — "+money(r.value)+" ر.س ⇐ "+(CRQ_STATUS[r.status]||r.status),"success");
  }).catch(function(e){
    if(btn) btn.disabled=false;
    console.warn("contracts/saveLines",e);
    _toast("⚠ "+_errMsg(e),"warn");
  });
}

/* صندوقُ الإرجاع: الوجهاتُ **مشتقّةٌ من الطلب نفسِه** لا قائمةٌ ثابتة، ومعها
   تحذيرٌ يقول بالضبط أيُّ اعتماداتٍ ستسقط — فلا يُفاجَأ الأدمن بما فعله. */
function openRewind(){
  var r=requestById(_rOpen); if(!r) return;
  var el=document.getElementById("page-"+PAGE_REQS); if(!el) return;
  var targets=crqRewindTargets(r, ceoThreshold());
  if(!targets.length) return _toast("⚠ لا توجد مرحلةٌ سابقةٌ يُرجَع إليها هذا الطلب","warn");
  var opts=targets.map(function(k){
    var st=GATE_STATUS_OF[k];
    return '<option value="'+_esc(k)+'">'+_esc((GATE_ROLES[st]||{}).lbl||st)+'</option>';
  }).join("");
  var box=document.createElement("div");
  box.className="card ct-sec"; box.id="ct-rw-box";
  box.innerHTML='<div class="ct-sec-h">'+_icn("rotateCcw","ic-sm")+' إرجاع الطلب إلى مرحلة</div>'+
    '<div class="ct-note">'+_icn("shield","ic-sm")+
      ' ستسقط اعتماداتُ المرحلة المختارة <strong>وما بعدها</strong> ويعود الطلبُ إليها. '+
      'ولا يمسّ ذلك بنودَ الطلب ولا قيمتَه ولا خطَّه الزمنيّ — والإرجاعُ نفسُه يُسجَّل فيه.</div>'+
    '<div class="ct-form-row">'+
      field("المرحلة", '<select class="form-input" id="ct-rw-gate">'+opts+'</select>')+
      field("سبب الإرجاع *", '<input class="form-input" id="ct-rw-why" placeholder="لماذا يُعاد الاعتماد؟">')+
    '</div>'+
    '<div class="ct-save-bar" style="position:static">'+
      '<button class="btn btn-ghost btn-sm" onclick="contracts.closeRewind()">إلغاء</button>'+
      '<button class="btn btn-primary btn-sm" id="ct-rw-btn" onclick="contracts.doRewind()">'+_icn("rotateCcw","ic-sm")+' إرجاع</button>'+
    '</div>';
  var old=document.getElementById("ct-rw-box"); if(old) old.remove();
  el.insertBefore(box, el.children[2] || null);
  box.scrollIntoView({behavior:"smooth", block:"center"});
}
function closeRewind(){ var b=document.getElementById("ct-rw-box"); if(b) b.remove(); }
function doRewind(){
  var g=document.getElementById("ct-rw-gate"), w=document.getElementById("ct-rw-why");
  var gate=g?g.value:"", why=(w?w.value:"").trim();
  if(!why){ _toast("⚠ سبب الإرجاع إلزامي","warn"); if(w) w.focus(); return; }
  var btn=document.getElementById("ct-rw-btn"); if(btn) btn.disabled=true;
  rewindRequest(_rOpen, gate, why).then(function(r){
    closeRewind(); paintReqs();
    _toast("✅ أُرجع الطلب إلى "+(CRQ_STATUS[r.status]||r.status),"success");
  }).catch(function(e){
    if(btn) btn.disabled=false;
    console.warn("contracts/doRewind",e);
    _toast("⚠ "+_errMsg(e),"warn");
  });
}

/* سدادُ أمر الدفع — الإيصالُ إلزاميّ، وفشلُ رفعه **لا يُسجّل سداداً بلا إثبات**.
   (طلبُ المالك) والسدادُ **على دفعات**: المبلغُ الافتراضيُّ المتبقّي كلُّه، وأزرارُ
   النسب تكتبه نسبةً من قيمة الأمر (مقصوصةً على المتبقّي) — والدفعةُ الجزئية تُبقي
   الأمرَ مفتوحاً «بانتظار السداد» حتى يكتمل المبلغ. */
function openPay(){
  var r=requestById(_rOpen); if(!r) return;
  var el=document.getElementById("page-"+PAGE_REQS); if(!el) return;
  var paid=crqPaidTotal(r), due=crqPayDue(r);
  var box=document.createElement("div");
  box.className="card ct-sec"; box.id="ct-pay-box";
  var pctBtns=[25,50,75].map(function(p){
    return '<button type="button" class="btn btn-ghost btn-sm" onclick="contracts.setPayPct('+p+')" style="font-size:11px;padding:3px 10px">'+p+'٪</button>';
  }).join(" ")+' <button type="button" class="btn btn-ghost btn-sm" onclick="contracts.setPayPct(100)" style="font-size:11px;padding:3px 10px">المتبقّي كاملاً</button>';
  /* الخطةُ على الوثيقة تحكم: مبلغُ الدفعة التالية مقفولٌ على ما حدّده المنشئ —
     الماليةُ تنفّذ لا تختار. وبلا خطةٍ (وثائقُ قديمة) يبقى المبلغُ حراً بالأزرار. */
  var inst=crqPlanInstallment(r);
  var amtField = inst
    ? field("مبلغ هذه الدفعة — وفق خطة المنشئ",
        '<input class="form-input num" id="ct-pay-amt" type="number" step="any" value="'+_esc(inst.amount)+'" readonly style="background:var(--surface2)">'+
        '<div style="margin-top:6px;font-size:11px;color:var(--muted)">الدفعة '+(inst.index+1)+' من '+inst.count+' — '+inst.pct+'٪ حدّدها منشئ الطلب، ولا يُقبل غيرُها.</div>')
    : field("مبلغ هذه الدفعة",
        '<input class="form-input num" id="ct-pay-amt" type="number" step="any" max="'+_esc(due)+'" value="'+_esc(due)+'">'+
        '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span style="font-size:11px;color:var(--muted)">نسبةً من القيمة:</span> '+pctBtns+'</div>');
  box.innerHTML='<div class="ct-sec-h">'+_icn("banknote","ic-sm")+' تسجيل دفعة سداد</div>'+
    '<div class="ct-note" style="display:block">'+_icn("banknote","ic-sm")+
      ' قيمة الأمر <b class="num">'+money(r.value)+'</b> ر.س'+
      (paid>0?' · سُدِّد <b class="num">'+money(paid)+'</b> ر.س':'')+
      ' · المتبقّي <b class="num">'+money(due)+'</b> ر.س — الدفعةُ الجزئية تُبقي الأمرَ مفتوحاً حتى اكتمال السداد.</div>'+
    '<div class="ct-form-row">'+
      amtField+
      field("مرجع التحويل", '<input class="form-input" id="ct-pay-ref" placeholder="رقم العملية">')+
    '</div>'+
    '<div class="ct-form-row">'+
      field("إيصال السداد * (صورة أو PDF)", '<input type="file" class="form-input ct-file" id="ct-pay-file" accept="image/*,application/pdf">')+
      '<div></div>'+
    '</div>'+
    '<div class="ct-save-bar" style="position:static">'+
      '<button class="btn btn-ghost btn-sm" onclick="contracts.closePay()">إلغاء</button>'+
      '<button class="btn btn-success btn-sm" id="ct-pay-btn" onclick="contracts.doPay()">'+_icn("save","ic-sm")+' تسجيل الدفعة</button>'+
    '</div>';
  var old=document.getElementById("ct-pay-box"); if(old) old.remove();
  el.insertBefore(box, el.children[2] || null);
  box.scrollIntoView({behavior:"smooth", block:"center"});
}
/* نسبةُ الدفعة تُحسب من **قيمة الأمر** (هي ما يطلبه الناس: «ادفعوا ٥٠٪ منه»)
   وتُقصّ على المتبقّي فلا يُكتب فوقه رقمٌ مرفوض. */
function setPayPct(p){
  var r=requestById(_rOpen); if(!r) return;
  if(crqPlanInstallment(r)) return;   // خطةُ المنشئ تحكم المبلغ — لا اختيارَ حراً
  var el=document.getElementById("ct-pay-amt"); if(!el) return;
  var due=crqPayDue(r);
  var amt=(Number(p)>=100) ? due : Math.min(due, r2(r2(Number(r.value)||0)*(Number(p)||0)/100));
  el.value=amt;
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
  }).then(function(res){
    closePay(); paintReqs();
    if(res && res.status==="crq_paid") _toast("✅ اكتمل السداد وأُغلق الطلب","success");
    else _toast("✅ سُجِّلت الدفعة — المتبقّي "+money(crqPayDue(res))+" ر.س والأمرُ مفتوح","success");
  }).catch(function(e){
    console.warn("contracts/doPay",e);
    if(btn){ btn.disabled=false; btn.innerHTML=_icn("save","ic-sm")+" تسجيل الدفعة"; }
    _toast("⚠ "+(e&&e.message?e.message:"تعذّر تسجيل السداد")+" — لم يُسجَّل سدادٌ بلا إيصال","warn");
  });
}

/* ════════════════════════════════════════════════════════════════════
   ٧-ج) العقود — الواجهة  [المرحلة ٣]
   ════════════════════════════════════════════════════════════════════ */
var _cFilter = { q:"", status:"", tab:"running" };
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
  hookMyTasks(); hookDash();
  paintCtrs();
}
/* ⛔ **تُزامَن المسوّدةُ قبل كلّ إعادة رسم.** بلاغُ المالك: «المستخلص نهائيّ فلماذا
   يخرج دوريّاً في الـPDF؟» — والجوابُ أنّ اختيارَه لم يصل المسوّدةَ أصلاً. فحقولُ
   الكميات تُزامَن مع كل ضغطة (`oninput`)، أمّا «الفترة» و«ختاميّ؟» فلا؛ **وأيُّ لقطةٍ
   من Firestore** (مستخلصٌ أو عقدٌ أو أمرُ تغييرٍ يتحرّك عند أيّ مستخدم) تستدعي
   `paintCtrs` فتُعيد بناء النموذج من `_extDraft` — فيرتدّ الحقلُ غيرُ المزامَن إلى
   قيمته الأولى **بلا خطأٍ ولا رسالة**، ويُرسَل المستخلصُ دوريّاً وقد اختير ختاميّاً.
   والعلاجُ بنيويٌّ لا حقلٌ بحقل: تُقرأ المسوّداتُ المفتوحةُ من الشاشة **قبل** هدمها،
   فيحمي ذلك كلَّ حقلٍ يُضاف لاحقاً لا الحقلَين وحدَهما. */
function _syncOpenDrafts(){
  try{ if(_extDraft) syncExtDraft(); }catch(e){}
  try{ if(_chgDraft) syncChgDraft(); }catch(e){}
  try{ if(_clEdit)   syncClauses();  }catch(e){}
}
function paintCtrs(){
  var el=document.getElementById("page-"+PAGE_CTRS); if(!el) return;
  _syncOpenDrafts();
  el.innerHTML = _cOpen ? ctrCardHTML(_cOpen) : ctrListHTML();
}

/* ── تبويبا الصفحة: الجاري والمنتهي لا يختلطان (طلبُ المالك) ──
   المنتهي (منتهٍ بانتظار الضمان · مقفل · مفسوخ) سجلٌّ يُرجَع إليه لا عملٌ ينتظر،
   وخلطُه بالجاري يدفن ما يحتاج المتابعةَ فعلاً بين ما أُغلق. `ctrTabOf` دالةٌ
   نقيةٌ واحدةٌ يقرؤها العدُّ والقائمةُ والشريطُ معاً — نهجُ `reqTabOf` نفسُه. */
var CTR_TABS = [
  { key:"running",  lbl:"العقود الجارية",  icon:"briefcase" },
  { key:"finished", lbl:"العقود المنتهية", icon:"lock" }
];
var CTR_FINISHED = ["ctr_completed","ctr_closed","ctr_terminated"];
function ctrTabOf(c){
  return CTR_FINISHED.indexOf((c||{}).status) !== -1 ? "finished" : "running";
}
function ctrCurTab(){ return _cFilter.tab==="finished" ? "finished" : "running"; }

function ctrListHTML(){
  /* نفسُ نطاق المشروع الحالي المطبَّق على طلبات التعاقد (ctDocInTenant). */
  var t=_tenantId();
  var all=_ctrs.filter(function(c){ return ctDocInTenant(c, t); }), q=normName(_cFilter.q), tab=ctrCurTab();
  var scoped=all.filter(function(c){ return ctrTabOf(c)===tab; });
  var list=scoped.filter(function(c){
    if(_cFilter.status && c.status!==_cFilter.status) return false;
    if(q){
      var hay=normName(c.id)+" "+normName(c.vendorName)+" "+normName(c.title)+" "+normName(_projName(c));
      if(hay.indexOf(q)===-1) return false;
    }
    return true;
  });

  var head=headHTML("العقود","الالتزاماتُ النافذة — قيمتُها ومدّتُها ومستخلصاتُها.","", "briefcase");

  /* شريطُ التبويبين — العدُّ من `ctrTabOf` نفسِها فلا يَعِد تبويبٌ بما لا يعرضه. */
  var tabsBar='<div class="ct-tabs">'+CTR_TABS.map(function(t){
    var n=all.filter(function(c){ return ctrTabOf(c)===t.key; }).length;
    return '<button type="button" class="ct-tab'+(tab===t.key?" on":"")+'" onclick="contracts.ctrsTab(\''+t.key+'\')">'+
      _icn(t.icon,"ic-sm")+' '+t.lbl+' <span class="num">'+n+'</span></button>';
  }).join("")+'</div>';

  /* لكلِّ تبويبٍ شريطُه: الجاري يسأل «ماذا ينتظرني؟»، والمنتهي «كيف انتهى؟». */
  var strip;
  if(tab==="finished"){
    var wait=scoped.filter(function(c){ return c.status==="ctr_completed"; }).length;
    var closed=scoped.filter(function(c){ return c.status==="ctr_closed"; }).length;
    var term=scoped.filter(function(c){ return c.status==="ctr_terminated"; }).length;
    var finVal=scoped.reduce(function(s,c){ return s+contractValue(c); },0);
    strip='<div class="ct-strip">'+
      '<div class="ct-stat'+(wait?' warn':'')+'"><span class="l">بانتظار انتهاء الضمان</span><span class="v">'+wait+'</span></div>'+
      '<div class="ct-stat"><span class="l">مقفلة — أُفرِج عن المحتجز</span><span class="v">'+closed+'</span></div>'+
      '<div class="ct-stat'+(term?' bad':'')+'"><span class="l">مفسوخة</span><span class="v">'+term+'</span></div>'+
      '<div class="ct-stat"><span class="l">قيمتُها (ر.س)</span><span class="v">'+money0(finVal)+'</span></div>'+
      '<div class="ct-stat"><span class="l">الإجمالي</span><span class="v">'+scoped.length+'</span></div>'+
    '</div>';
  } else {
    var live=scoped.filter(function(c){ return c.status==="ctr_active"; });
    var liveVal=live.reduce(function(s,c){ return s+contractValue(c); },0);
    var susp=scoped.filter(function(c){ return c.status==="ctr_suspended"; }).length;
    var openExts=scoped.filter(function(c){ return !!openExtractOf(_exts, c.id); }).length;
    var advDueN=scoped.filter(advancePayable).length;
    strip='<div class="ct-strip">'+
      '<div class="ct-stat"><span class="l">عقودٌ سارية</span><span class="v">'+live.length+'</span></div>'+
      '<div class="ct-stat"><span class="l">قيمتُها (ر.س)</span><span class="v">'+money0(liveVal)+'</span></div>'+
      '<div class="ct-stat'+(openExts?' warn':'')+'"><span class="l">مستخلصاتٌ مفتوحة</span><span class="v">'+openExts+'</span></div>'+
      '<div class="ct-stat'+(susp?' warn':'')+'"><span class="l">موقوفة</span><span class="v">'+susp+'</span></div>'+
      '<div class="ct-stat"><span class="l">الإجمالي</span><span class="v">'+scoped.length+'</span></div>'+
      (advDueN?'<div class="ct-stat warn"><span class="l">دفعاتٌ مقدمةٌ بانتظار السداد</span><span class="v">'+advDueN+'</span></div>':'')+
    '</div>';
  }

  /* خياراتُ الحالة من التبويب نفسِه — خيارٌ لا يقع فيه وعدٌ بقائمةٍ فارغة. */
  var stOf=function(k){ return (CTR_FINISHED.indexOf(k)!==-1) === (tab==="finished"); };
  var filters='<div class="ct-filters">'+
    '<input class="form-input ct-search" id="ct-c-q" placeholder="ابحث برقم العقد أو الطرف أو المشروع" value="'+_esc(_cFilter.q)+'" oninput="contracts.filterCtrs(\'q\',this.value)">'+
    '<select class="form-input" onchange="contracts.filterCtrs(\'status\',this.value)">'+
      '<option value="">كل الحالات</option>'+
      Object.keys(CTR_STATUS).filter(stOf).map(function(k){ return '<option value="'+k+'"'+(_cFilter.status===k?' selected':'')+'>'+_esc(CTR_STATUS[k])+'</option>'; }).join("")+
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
      '<button class="btn btn-ghost btn-sm" style="margin-top:14px" onclick="showPage(\'contract-requests\')">'+_icn("fileText","ic-sm")+' طلبات التعاقد وأوامر الدفع</button>'+
    '</div>';
  } else if(!scoped.length){
    /* التبويبُ فارغٌ والبياناتُ موجودة — يُقال معناه لا «لا نتائج» تُقرأ عطلاً. */
    body='<div class="card" style="text-align:center;padding:26px 18px;color:var(--muted);font-size:13px">'+
      (tab==="finished" ? "لا عقودَ منتهيةً بعد — ما يُقفَل أو يُفسَخ ينتقل إلى هنا." : "لا عقودَ جاريةً — المنتهيةُ في تبويبها.")+'</div>';
  } else if(!list.length){
    body='<div class="card" style="text-align:center;padding:26px 18px;color:var(--muted);font-size:13px">لا نتائج تطابق البحث.</div>';
  } else {
    body='<div class="ct-grid">'+list.map(ctrTileHTML).join("")+'</div>';
  }
  /* عقودُ المشاريع اليدوية المحجوبةُ عن هذا المشروع تُذكَر لا تُعرَض — كسطرِ
     الطلبات: الغيابُ بلا تفسيرٍ يُقرأ فقداً في البيانات. */
  var hiddenManual = t ? _ctrs.filter(function(c){ return !ctDocInTenant(c, t); }).filter(function(c){
    return c.isCustomProject===true || c.projectId===MANUAL_ID || !c.projectId; }).length : 0;
  var manualLine = hiddenManual
    ? '<div class="ct-scope">'+_icn("cart","ic-sm")+' '+hiddenManual+
      ' من عقود المشاريع اليدوية تُدار من المشتريات المركزية — لا تظهر داخل المشاريع</div>'
    : "";
  return head+tabsBar+strip+filters+manualLine+body;
}

/* بلاغُ المالك: «العقدُ لا يُظهر أنّ له مستخلصاً ولا عند مَن يقف». وكان المستخلصُ
   مدفوناً في تبويبٍ داخل بطاقة العقد: لا تعرفه إلا بفتح العقد ثمّ التبويب. وهو
   **حالةُ العقد الحيّةُ الوحيدة** التي تتحرّك شهرياً — فمن يفتح صفحةَ العقود يريد
   أن يعرف أيُّها ينتظره الآن. فيظهر السطرُ حيث تُتَّخذ القرارُ: على البطاقة نفسِها،
   ومن `openExtractOf`/`extGateOwner` — البوّاباتِ نفسِها التي تحرس الأزرار لا وصفاً
   ثانياً ينحرف عنها. */
function ctrTileHTML(c){
  var v=contractValue(c);
  var openE=openExtractOf(_exts, c.id);
  var allE=extractsFor(c.id);
  var paidE=allE.filter(function(e){ return e.status==="ext_paid"; });
  /* الدفعةُ المقدمةُ المستحقّةُ حالةٌ حيّةٌ كالمستخلص المفتوح — تُقال على البطاقة
     حيث يُتَّخذ القرار، من `advancePayable` نفسِها التي تحرس زرَّ السداد. */
  var advLine = advancePayable(c)
    ? '<div class="ct-tile-ext warn">'+_icn("banknote","ic-sm")+
      ' دفعةٌ مقدمةٌ بانتظار سداد المالية — المتبقّي <span class="num">'+money(advanceDueOf(c))+'</span> ر.س</div>'
    : "";
  var extLine="";
  if(openE){
    var og=extGateOwner(openE.status);
    var needSig = openE.status==="ext_pending_finance" && !extSignature(openE);
    extLine='<div class="ct-tile-ext'+(needSig?' warn':'')+'">'+_icn("banknote","ic-sm")+
      ' <span class="num">'+_esc(openE.id)+'</span> — '+
      _esc(needSig ? "بانتظار نسخةٍ موقّعةٍ من المقاول" : ("بانتظار "+((og||{}).lbl||"إجراء")))+'</div>';
  } else if(allE.length){
    extLine='<div class="ct-tile-ext done">'+_icn("checkCircle","ic-sm")+' '+allE.length+
      ' مستخلصات · '+paidE.length+' مسدَّد</div>';
  }
  return '<div class="ct-tile" style="--rail:'+(_CTR_RAIL[c.status]||"var(--muted)")+'" onclick="contracts.openCtr(\''+_jq(c.id)+'\')">'+
    '<div class="ct-tile-top">'+
      '<div class="ct-tile-name">'+_esc(c.title||c.id)+'</div>'+ctrBadge(c.status)+
    '</div>'+
    '<div class="ct-tile-kind"><span class="num">'+_esc(c.id)+'</span>'+
      ' <span class="ct-dot">·</span> '+_esc(_projName(c))+
      (c.isCustomProject?' <span class="ct-doc s-none">يدويّ</span>':'')+'</div>'+
    (docSubstituteId(c)?'<div style="margin-top:5px">'+substituteChip(c,true)+'</div>':'')+
    advLine+extLine+
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
  /* سدادُ الدفعة المقدمة — للمالية والأدمن ما دام عليها متبقٍّ والعقدُ جارياً */
  if(advancePayable(c) && ["finance","admin"].indexOf(role)!==-1){
    tools+='<button class="btn btn-success btn-sm" onclick="contracts.openAdvPay()">'+_icn("banknote","ic-sm")+' تسجيل سداد الدفعة المقدمة</button> ';
  }
  /* حذفُ العقد غيرِ الموقَّع — للأدمن: النافذةُ الوحيدةُ التي لم يُنتج فيها أثراً. */
  if(c.status==="ctr_pending_signature" && role==="admin"){
    tools+='<button class="btn btn-delete btn-sm" onclick="contracts.doDeleteCtr()">'+_icn("trash","ic-sm")+' حذف العقد</button> ';
  }
  tools+=acts.filter(function(a){ return a!=="sign"; }).map(function(a){
    var t=CTR_TRANSITIONS[a];
    var cls = (a==="terminate") ? "btn-ghost" : (a==="resume"||a==="close" ? "btn-success" : "btn-ghost");
    return '<button class="btn '+cls+' btn-sm" onclick="contracts.transit(\''+a+'\')">'+_esc(t.lbl)+'</button>';
  }).join(" ");

  var tabs='<div class="ct-tabs">'+
    [["overview","نظرة عامة","clipboardList"],["lines","بنود الأعمال","layers"],
     ["clauses","شروط العقد","fileText"],["changes","أوامر التغيير","repeat"],
     ["extracts","المستخلصات","banknote"],["purchases","طلبات الشراء","cart"],
     ["log","السجل","scrollText"]]
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
  if(_cTab==="purchases") return ctrPurchasesHTML(c);
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

  /* الدفعةُ المقدمة على العقود المتتبَّعة: المستحقُّ يُقال بلونه، والمسدَّدُ يُدوَّن
     **بمبلغه الفعليّ** دفعةً دفعةً — فقد تسدّد الماليةُ أقلَّ من دفعة العقد. */
  var advPaid=advancePaidOf(c), advDue=advanceDueOf(c);
  var advTracked=(c.advance||{}).paid!=null && adv>0;
  var advNote="";
  if(advTracked){
    /* القيدُ الملغى **يبقى معروضاً** مشطوباً بسببِه ومَن ألغاه — الحذفُ من الشاشة
       يترك سداداً حدث ثم اختفى بلا أثرٍ يُراجَع. وزرُّ التصحيح على القيد القائم
       وحدَه، وبالشرط نفسِه الذي تحرس به المعاملةُ الإلغاء (`advVoidable`). */
    var mayVoid=["finance","admin"].indexOf(_role())!==-1;
    var pays=(Array.isArray((c.advance||{}).payments)?(c.advance||{}).payments:[]).map(function(p,i){
      if(p && p.voided===true)
        return '<div class="ct-att"><span style="opacity:.62">'+_icn("xCircle","ic-sm")+
          ' <s>سُدِّد <b class="num">'+money(p.amount)+'</b> ر.س'+(p.ref?' — <span class="num">'+_esc(p.ref)+'</span>':'')+'</s>'+
          ' <b>ملغى</b> — '+_esc(p.voidReason||"")+'</span>'+
          '<span class="ct-att-m">ألغاه '+_esc(p.voidedBy||"")+' · '+_esc(String(p.voidedAt||"").slice(0,16).replace("T"," "))+
          (p.receiptUrl?' · <a class="ct-link" href="'+_esc(p.receiptUrl)+'" target="_blank" rel="noopener">'+_icn("paperclip","ic-sm")+' الإيصال</a>':'')+'</span></div>';
      return '<div class="ct-att"><span>'+_icn("banknote","ic-sm")+' سُدِّد <b class="num">'+money(p.amount)+'</b> ر.س'+
        (p.ref?' — <span class="num">'+_esc(p.ref)+'</span>':'')+
        (mayVoid && advVoidable(c,p)
          ? ' <button class="btn btn-ghost btn-sm" onclick="contracts.openAdvVoid('+i+')">'+_icn("rotateCcw","ic-sm")+' تصحيح القيد</button>' : '')+'</span>'+
        '<span class="ct-att-m">'+_esc(p.by||"")+' · '+_esc(String(p.at||"").slice(0,16).replace("T"," "))+
        (p.receiptUrl?' · <a class="ct-link" href="'+_esc(p.receiptUrl)+'" target="_blank" rel="noopener">'+_icn("paperclip","ic-sm")+' الإيصال</a>':'')+'</span></div>';
    }).join("");
    advNote='<div class="card ct-sec"><div class="ct-sec-h">'+_icn("banknote","ic-sm")+' الدفعة المقدمة'+
      (advancePayable(c) && ["finance","admin"].indexOf(_role())!==-1
        ? '<button class="btn btn-success btn-sm" style="margin-inline-start:auto" onclick="contracts.openAdvPay()">'+_icn("banknote","ic-sm")+' تسجيل السداد</button>' : '')+
      '</div>'+
      (advDue>0
        ? '<div class="ct-note warn">'+_icn("timer","ic-sm")+' بانتظار سداد المالية — المتبقّي <b class="num">'+money(advDue)+'</b> من <span class="num">'+money(adv)+'</span> ر.س'+
          (advPaid>0?' (سُدِّد <span class="num">'+money(advPaid)+'</span>)':'')+'</div>'
        : '<div class="ct-note">'+_icn("checkCircle","ic-sm")+' سُدِّدت الدفعة المقدمة — <b class="num">'+money(advPaid)+'</b> ر.س'+
          (advPaid+0.01<adv?' من أصل <span class="num">'+money(adv)+'</span> ر.س (سُدِّد أقلُّ من دفعة العقد)':'')+'</div>')+
      pays+
      '<div class="ct-note" style="margin-top:8px">'+_icn("rotateCcw","ic-sm")+' '+
        (advanceRecoveryDerived(c)
          ? 'يُخصَم <b>كاملُ المتبقّي من المسدَّد</b> من أوّل مستخلصٍ يتّسع له (لم تُكتب نسبةٌ في العقد)'
          : 'يُخصَم <b class="num">'+(Number((c.advance||{}).recoveryPct)||0)+'٪</b> من أعمال كل مستخلص')+
        ' — استُردّ حتى الآن <span class="num">'+money((c.advance||{}).recovered||0)+'</span> ر.س، ويتبقّى <b class="num">'+
        money(advanceRecoveryCapOf(c))+'</b> ر.س — والاستردادُ بسقفِ المسدَّد فعلاً.</div>'+
    '</div>';
  }

  /* v18.9xi: ملاحظاتُ الاعتماد — من نسخة العقد المجمَّدة، وارتداداً من الطلب
     المصدر للعقود المنشأة قبل الميزة (العلاجُ عند العرض فتنتفع كلُّها بلا ترحيل).
     تُعرض هنا وحدها ولا تدخل ورقةَ العقد المطبوعة. */
  var apprNotes = (Array.isArray(c.approvalNotes) ? c.approvalNotes
    : (req ? (req.timeline||[]).filter(function(e){ return e && e.code==="approved" && e.note; })
        .map(function(e){ return { gate:e.event||"", by:e.by||"", at:e.at||"", note:e.note||"" }; }) : []))
    .filter(function(n){ return n && n.note; });
  var apprSec = apprNotes.length ? '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("scrollText","ic-sm")+' ملاحظات الاعتماد'+
      '<span class="ct-sec-lock">تُعرض هنا ولا تُطبَع في العقد</span></div>'+
    apprNotes.map(function(n){
      return '<div class="ct-note"><b>'+_esc(n.gate||"اعتماد")+'</b> — '+_esc(n.note)+
        '<div style="color:var(--muted);font-size:11px;margin-top:2px">'+_esc(n.by||"")+' · '+_esc(String(n.at||"").slice(0,16).replace("T"," "))+'</div></div>';
    }).join("")+'</div>' : "";

  return chNote+'<div class="card ct-sec">'+
    '<div class="ct-money-row">'+
      '<div class="ct-tl big"><span class="l">قيمة العقد النافذة</span><span class="v num">'+money(v)+'</span></div>'+
      '<div class="ct-tl"><span class="l">الأساس</span><span class="v num">'+money(t.base)+'</span></div>'+
      '<div class="ct-tl"><span class="l">ض.ق.م</span><span class="v num">'+money(t.vat)+'</span></div>'+
      '<div class="ct-tl"><span class="l">دفعة مقدمة</span><span class="v num">'+money(adv)+'</span></div>'+
      (advTracked?'<div class="ct-tl"><span class="l">المسدَّد من المقدمة</span><span class="v num">'+money(advPaid)+'</span></div>':'')+
      '<div class="ct-tl"><span class="l">محتجز الضمان</span><span class="v num">'+money(ret)+'</span></div>'+
    '</div>'+
  '</div>'+
  advNote+
  '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("clipboardList","ic-sm")+' بيانات العقد</div>'+
    '<div class="ct-info">'+
      infoCell("الطرف", vendorCell(c.vendorId, c.vendorName))+
      infoCell("المشروع", _esc(_projName(c))+(c.isCustomProject?' <span class="ct-doc s-none">يدويّ</span>':""))+
      infoCell("بند الموازنة", budgetCell)+
      (docSubstituteId(c)?infoCell("البند المستعاض", substituteChip(c)):"")+
      infoCell("وضع الضريبة", _esc((VAT_MODES[normVatMode(c.vatMode)]||{}).short||"—"))+
      infoCell("تاريخ البدء", _esc(c.startDate||"—"))+
      infoCell("مدة التنفيذ", c.durationDays?(money0(c.durationDays)+" يوماً"):"—")+
      infoCell("مدة الضمان", ((c.warranty||{}).months||0)+" شهراً")+
      infoCell("الطلب المصدر", link)+
    '</div>'+
    (c.scope?'<div class="ct-note" style="margin-top:12px">'+_esc(c.scope)+'</div>':'')+
  '</div>'+
  apprSec+
  '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("shield","ic-sm")+' الشروط التجارية</div>'+
    '<div class="ct-info">'+
      infoCell("الدفعة المقدمة", ((c.advance||{}).pct||0)+"٪ — "+
        (Number((c.advance||{}).recoveryPct)>0
          ? "تُستردّ "+(c.advance||{}).recoveryPct+"٪ من كل مستخلص"
          : "يُستردّ كاملُ المسدَّد من أوّل مستخلصٍ يتّسع له"))+
      infoCell("محتجز الضمان", ((c.retention||{}).pct||0)+"٪ — يُفرَج "+(((c.retention||{}).releaseOn)==="warranty_end"?"بعد انتهاء الضمان":"عند الاستلام الابتدائي"))+
      infoCell("غرامة التأخير", _esc(penaltyText(c.penalty, contractValue(c))))+
      infoCell("المُفرَج من المحتجز", money((c.retention||{}).released||0)+" ر.س")+
    '</div>'+
  '</div>';
}

function ctrLinesHTML(c){
  var rows=(c.lines||[]).map(function(l,i){
    var lt=lineTotal(l.qty,l.unitPrice,c.vatMode);
    return '<tr>'+lnSeq(i)+'<td>'+_esc(l.desc||"—")+(l.boqLineId?'':' <span class="ct-doc s-soon">خارج المقايسة</span>')+'</td>'+
      '<td>'+_esc(l.unit||"")+'</td><td class="num">'+money0(contractLineQty(c,l.id))+'</td>'+
      '<td class="num">'+money(l.unitPrice)+'</td><td class="num">'+money(lt.total)+'</td></tr>';
  }).join("") || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:14px">—</td></tr>';
  var t=linesTotal(c.lines||[], c.vatMode);
  return '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("layers","ic-sm")+' بنود العقد'+
      '<span class="ct-sec-lock">الكميةُ تشمل أوامرَ التغيير المعتمدة</span></div>'+
    '<div class="ct-table-wrap"><table class="ct-table"><thead><tr>'+LN_TH+
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
    rung(advanceRecoveryLabel(c), calc.advanceRecovery, -1, false)+
    rung("غرامة التأخير", calc.penalty, -1, false)+
    rung("مواد مصروفة من مستودعنا", calc.materials, -1, false)+
    rung("خصم عدم مطابقة / جودة", calc.nonConformity, -1, false)+
    '<div class="ct-rung net"><span class="rl">صافي المستحق</span><span class="rv num">'+money(calc.net)+'</span></div>'+
  '</div>';
}

function extFormHTML(c){
  var d=_extDraft;
  /* **المستخلصُ لا يُقاس على نفسِه.** في وضع التعديل يُستثنى من «سبق اعتمادُه» ومن
     «المستخلَص سابقاً» — وإلا قرأ المُعدِّلُ كمياتِه هو أرضيةً لا يجوز النزولُ تحتها،
     فامتنع عليه تصحيحُ الخطأ الذي فتح البابَ من أجله. */
  var xid=d.editOf||null;
  var floor=prevCumByLine(_exts, c, xid);
  var ctx={ prevGross:prevGrossOf(_exts,c,xid), materialsIssued:d.materialsIssued,
            penaltyAmount:d.penaltyAmount, ncDeduction:d.ncDeduction };
  var calc=extNet(d, c, ctx);
  var g=extCumGuard(d, c, _exts);
  var late=lateDaysOf(c, _today());

  var rows=(d.lines||[]).map(function(l,i){
    var max=contractLineQty(c,l.lineId), was=Number(floor[l.lineId])||0;
    var bad=(Number(l.cumQty)||0)>max+1e-9 || (Number(l.cumQty)||0)<was-1e-9;
    var pct=max>0?Math.round((Number(l.cumQty)||0)/max*100):0;
    return '<tr'+(bad?' class="ct-bad"':'')+'>'+lnSeq(i)+
      '<td>'+_esc(l.desc||"—")+'</td>'+
      '<td class="num">'+money0(max)+' '+_esc(l.unit||"")+'</td>'+
      '<td class="num">'+money0(was)+'</td>'+
      '<td><input class="form-input num" data-ef="cumQty" data-i="'+i+'" type="number" step="any" value="'+_esc(l.cumQty)+'" style="min-width:90px" oninput="contracts.extRecalc(\'q\','+i+')"></td>'+
      '<td><input class="form-input num ct-e-pct" data-ef="pct" data-i="'+i+'" type="number" step="any" min="0" max="100" value="'+_esc(pct)+'" style="min-width:74px" oninput="contracts.extRecalc(\'p\','+i+')"></td>'+
      '<td class="num ct-e-val">'+money(r2(vatSplit(l.unitPrice,c.vatMode).base*(Number(l.cumQty)||0)))+'</td>'+
    '</tr>';
  }).join("");

  var warn = '<div id="ct-e-warn">'+(g.ok ? "" : '<div class="ct-note crit">'+_icn("alertTriangle","ic-sm")+' '+_esc(_guardMsg(g))+'</div>')+'</div>';
  var lateNote = late ? '<div class="ct-note warn">'+_icn("timer","ic-sm")+' تأخّرٌ '+late+' يوماً عن مدة العقد — غرامةٌ مقترَحة '+money(suggestedPenalty(c,late))+' ر.س. '+
    '<button class="btn btn-ghost btn-sm" style="margin-inline-start:auto" onclick="contracts.applyPenalty()">تطبيق المقترَح</button></div>' : "";

  return '<button class="btn btn-ghost btn-sm ct-back" onclick="contracts.cancelExtract()">'+_icn("rotateCcw")+' إلغاء</button>'+
  '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("banknote","ic-sm")+' '+(d.editOf?('تعديل المستخلص '+_esc(d.editOf)):('مستخلص جديد — '+_esc(c.id)))+
      '<span class="ct-sec-lock">أدخِل المنفَّذ <b>تراكمياً منذ بداية العقد</b> — بالكمية أو بالنسبة، وكلٌّ يتبع الآخر</span></div>'+
    '<div class="ct-form-row">'+
      field("الفترة", '<input class="form-input" id="ct-e-period" value="'+_esc(d.period||"")+'" placeholder="مثال: أغسطس 2026" oninput="contracts.extRecalc()">')+
      field("مستخلصٌ ختاميّ؟", '<select class="form-input" id="ct-e-final" onchange="contracts.extRecalc()">'+
        '<option value=""'+(!d.isFinal?' selected':'')+'>لا — مستخلصٌ دوريّ</option>'+
        '<option value="1"'+(d.isFinal?' selected':'')+'>نعم — يُنهي العقد فنّياً</option>'+
      '</select>')+
    '</div>'+
    '<div class="ct-table-wrap"><table class="ct-table" id="ct-e-lines"><thead><tr>'+LN_TH+
      '<th>البند</th><th>كمية العقد</th><th>سبق اعتماده</th><th>المنفَّذ تراكمياً</th><th>نسبة الإنجاز %</th><th>القيمة</th>'+
    '</tr></thead><tbody>'+rows+'</tbody></table></div>'+
    warn+lateNote+
    (d.editOf ? '<div class="ct-form-row">'+
      field("سبب التعديل <b>(إلزاميّ)</b>", '<input class="form-input" id="ct-e-why" value="'+_esc(d.reason||"")+'" placeholder="مثال: تصحيحُ كمية البند الأول بعد إعادة القياس" oninput="contracts.extRecalc()">')+
      '<div></div></div>'+
      '<div class="ct-note warn">'+_icn("alertTriangle","ic-sm")+' بحفظ التعديل <b>تسقط الاعتماداتُ كلُّها وتوقيعُ المقاول</b> ويعود المستخلصُ إلى بوّابته الأولى — فلا يُصرَف على رقمٍ لم يُعتمد.</div>'
      : '')+
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
  /* المرفقات (طلبُ المالك): تُختار هنا وتُرفَع **بعد** إنشاء المستخلص برقمه —
     ملفاتُ المتصفّح لا تُكتب في Firestore، فتبقى في المسوّدة حتى الإرسال.
     وفي وضع التعديل تُدار المرفقاتُ من بطاقة المستخلص نفسِها لا من النموذج. */
  (d.editOf ? '' :
  '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("paperclip","ic-sm")+' المرفقات '+
      '<span class="ct-sec-lock">محضرُ القياس · صورُ الموقع · أيُّ مستندٍ يسند الكميات</span>'+
      '<input type="file" id="ct-e-attadd" style="display:none" accept="image/*,application/pdf" multiple onchange="contracts.addExtDraftAttach(this)">'+
      '<button class="btn btn-ghost btn-sm" style="margin-inline-start:auto" onclick="document.getElementById(\'ct-e-attadd\').click()">'+_icn("plus","ic-sm")+' إضافة مرفق</button></div>'+
    ((d.attachFiles||[]).length ? (d.attachFiles||[]).map(function(f,i){
      return '<div class="ct-att"><span>'+_icn("paperclip","ic-sm")+' '+_esc(f.name||"ملف")+'</span>'+
        '<span class="ct-att-m"><span class="num">'+money0(Math.max(1,Math.round((f.size||0)/1024)))+'</span> ك.ب — يُرفَع مع الإرسال</span>'+
        '<button class="btn btn-delete" onclick="contracts.delExtDraftAttach('+i+')">'+_icn("trash","ic-sm")+'</button></div>';
    }).join("") : '<div style="color:var(--muted);font-size:12px">لا مرفقات — الإرفاق اختياريٌّ، ويمكن إضافته لاحقاً من بطاقة المستخلص.</div>')+
  '</div>')+
  '<div class="ct-save-bar">'+
    '<button class="btn btn-ghost btn-sm" onclick="contracts.cancelExtract()">إلغاء</button>'+
    '<button class="btn btn-success btn-sm" id="ct-e-send"'+((g.ok && (!d.editOf || d.reason))?'':' disabled')+' onclick="contracts.submitExtract()">'+
      _icn(d.editOf?"save":"send","ic-sm")+' '+(d.editOf?'حفظ التعديل':'إرسال للاعتماد')+'</button>'+
  '</div>';
}

function extCardHTML(c, id){
  var e=extractById(id);
  if(!e) return '<div class="card">تعذّر العثور على المستخلص.</div>';
  var calc = e.settled || extCalc(e,c);
  var owner=extGateOwner(e.status), mine=extCanAct(e.status,_role());
  var mode=extActMode(e, e.status, _role(), _meUser(), _me(), _users());
  /* **زرُّ السداد يختفي بلا نسخةٍ موقّعة** — لا يظهر ثمّ يفشل: زرٌّ يعِد ولا يفي
     أسوأُ من زرٍّ غائبٍ بجانبه سببُ غيابه (والنصُّ واحدٌ من `extPayGuard`). */
  var pguard = extPayGuard(e, calc.net);
  var canSign = !extIsFinal(e.status) && ["project_manager","finance","admin"].indexOf(_role())!==-1;
  var tools='<button class="btn btn-ghost btn-sm" onclick="contracts.printExt()">'+_icn("printer","ic-sm")+' طباعة المستخلص</button> ';
  if(!extIsFinal(e.status) && ["project_manager","admin"].indexOf(_role())!==-1)
    tools+='<button class="btn btn-ghost btn-sm" onclick="contracts.openExtEdit()">'+_icn("edit","ic-sm")+' تعديل المستخلص</button> ';
  if(canSign)
    tools+='<button class="btn btn-primary btn-sm" onclick="contracts.openExtSign()">'+_icn("save","ic-sm")+' '+
           (extSignature(e)?'استبدال النسخة الموقّعة':'رفع النسخة الموقّعة')+'</button> ';
  if(mine && e.status==="ext_pending_finance"){
    if(mode!=="blocked" && pguard.ok)
      tools+='<button class="btn btn-success btn-sm" onclick="contracts.openExtPay()">'+_icn("banknote","ic-sm")+' تسجيل السداد</button>';
  } else if(mine){
    if(mode!=="blocked")
      tools='<button class="btn btn-success btn-sm" onclick="contracts.extAct(\'approve\')">'+_icn("checkCircle","ic-sm")+
            ' اعتماد — '+_esc((owner||{}).lbl||"")+'</button> ';
    tools+='<button class="btn btn-ghost btn-sm" onclick="contracts.extAct(\'reject\')">'+_icn("xCircle","ic-sm")+' رفض / إعادة</button>';
  }
  if(!extIsFinal(e.status) && _role()==="admin" && extRewindTargets(e, r2(calc.net), ceoThreshold()).length){
    tools+=' <button class="btn btn-ghost btn-sm" onclick="contracts.openExtRewind()">'+_icn("rotateCcw","ic-sm")+' إرجاع لمرحلة</button>';
  }
  var extSod = sodNoteHTML(mode, owner);
  var lineRows=(e.lines||[]).map(function(l,i){
    var max=contractLineQty(c,l.lineId), cum=Number(l.cumQty)||0;
    return '<tr>'+lnSeq(i)+'<td>'+_esc(l.desc||"—")+'</td><td class="num">'+money0(max)+'</td>'+
      '<td class="num">'+money0(cum)+'</td>'+
      '<td class="num">'+(max>0?Math.round(cum/max*100):0)+'%</td>'+
      '<td class="num">'+money(l.unitPrice)+'</td></tr>';
  }).join("") || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:14px">—</td></tr>';
  var tl=(e.timeline||[]).map(function(x){
    return '<div class="ct-tl-row"><span class="d"></span><div><div class="t">'+_esc(x.event)+'</div>'+
      '<div class="m">'+_esc(x.by||"")+' · '+_esc(String(x.at||"").slice(0,16).replace("T"," "))+(x.note?' — '+_esc(x.note):'')+'</div></div></div>';
  }).join("") || '<div style="color:var(--muted);font-size:12px">—</div>';
  var pay = e.payment ? '<div class="ct-note">'+_icn("banknote","ic-sm")+' سُدِّد '+money(e.payment.amount)+' ر.س · '+_esc(e.payment.by||"")+
    (e.payment.ref?(' — '+_esc(e.payment.ref)):'')+
    (e.payment.receiptUrl?' · <a class="ct-link" href="'+_esc(e.payment.receiptUrl)+'" target="_blank" rel="noopener">'+_icn("paperclip","ic-sm")+' الإيصال</a>':'')+'</div>' : "";

  /* توقيعُ المقاول على الورقة — يُرى حيث يُعمَل به: بطاقةُ المستخلص نفسُها. */
  var sgd = extSignature(e);
  var sigNote = "";
  if(sgd)
    sigNote='<div class="ct-note'+(extSigValid(e, calc.net)?'':' warn')+'">'+
      _icn(extSigValid(e, calc.net)?"checkCircle":"alertTriangle","ic-sm")+
      ' وقّع المقاولُ نسخةَ هذا المستخلص في '+_esc(String(sgd.at||"").slice(0,10))+' على صافي '+money(sgd.net)+' ر.س · '+_esc(sgd.by||"")+
      ' · <a class="ct-link" href="'+_esc(sgd.url)+'" target="_blank" rel="noopener">'+_icn("paperclip","ic-sm")+' '+_esc(sgd.name||"النسخة الموقّعة")+'</a>'+
      (extSigValid(e, calc.net)?'':' — <b>تغيّر الصافي بعد التوقيع ('+money(calc.net)+' ر.س) فلا يُصرَف عليه: اطبع المستخلصَ ووقّعه على الرقم الجديد.</b>')+
      '</div>';
  else if(!extIsFinal(e.status))
    sigNote='<div class="ct-note warn">'+_icn("alertTriangle","ic-sm")+
      ' لم تُرفع نسخةُ هذا المستخلص موقّعةً من المقاول — <b>ولا سدادَ قبلها</b>. اطبع المستخلصَ ووقّعه معه إقراراً بالكميات والخصومات، ثمّ ارفع النسخة.</div>';

  /* المرفقات — تظهر الفقرةُ لمن يرى المستخلص، وزرُّ الإضافة لأدوار سلسلته فقط
     (نمطُ بطاقة الطلب نفسُه: الملفُّ يُرفَع أولاً ثم يُسجَّل معاملةً). */
  var xAtts=Array.isArray(e.attachments)?e.attachments:[];
  var xAttRows=xAtts.map(function(a){
    return '<div class="ct-att">'+
      '<a class="ct-link" href="'+_esc(a.url)+'" target="_blank" rel="noopener">'+_icn("paperclip","ic-sm")+' '+_esc(a.name||"مرفق")+'</a>'+
      '<span class="ct-att-m">'+_esc(a.by||"")+' · '+_esc(String(a.at||"").slice(0,16).replace("T"," "))+'</span>'+
      (canDelExtAttach(e,a)?'<button class="btn btn-delete" title="حذف المرفق" onclick="contracts.delExtAttach(\''+_jq(a.id)+'\')">'+_icn("trash","ic-sm")+'</button>':'')+
    '</div>';
  }).join("");
  var attSec=(xAtts.length||canAttachExt(e)) ? '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("paperclip","ic-sm")+' المرفقات'+
      (canAttachExt(e)?'<input type="file" id="ct-x-attfile" style="display:none" accept="image/*,application/pdf" onchange="contracts.pickExtAttach(this)">'+
        '<button class="btn btn-ghost btn-sm" id="ct-x-attbtn" style="margin-inline-start:auto" onclick="document.getElementById(\'ct-x-attfile\').click()">'+_icn("plus","ic-sm")+' إضافة مرفق</button>':'')+
    '</div>'+
    (xAttRows||'<div style="color:var(--muted);font-size:12px">لا مرفقات — أرفق محضرَ القياس أو صورَ الموقع أو أيَّ مستندٍ يسند الكميات.</div>')+
  '</div>' : "";

  return '<button class="btn btn-ghost btn-sm ct-back" onclick="contracts.backToExts()">'+_icn("rotateCcw")+' كل المستخلصات</button>'+
  '<div class="ct-head"><div><h2 class="ct-title">'+_icn("banknote")+' '+_esc(e.id)+(e.isFinal?' <span class="ct-doc s-ok">ختاميّ</span>':'')+'</h2>'+
    '<div class="ct-sub">'+extBadge(e.status)+(owner&&!extIsFinal(e.status)?' <span class="ct-id">بانتظار '+_esc(owner.lbl)+'</span>':'')+' <span class="ct-id">'+_esc(e.period||"")+'</span></div></div>'+
    '<div class="ct-actions">'+tools+'</div></div>'+
  extSod + pay + sigNote+
  '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("pieChart","ic-sm")+' سُلَّم الحساب'+
    (e.settled?'<span class="ct-sec-lock">لقطةٌ محفوظةٌ وقت السداد</span>':'')+'</div>'+ladderHTML(calc,c)+'</div>'+
  '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("layers","ic-sm")+' البنود المنفَّذة</div>'+
    '<div class="ct-table-wrap"><table class="ct-table"><thead><tr>'+LN_TH+'<th>البند</th><th>كمية العقد</th><th>المنفَّذ تراكمياً</th><th>نسبة الإنجاز</th><th>سعر الوحدة</th></tr></thead>'+
    '<tbody>'+lineRows+'</tbody></table></div></div>'+
  attSec+
  '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("scrollText","ic-sm")+' السجل</div><div class="ct-timeline">'+tl+'</div></div>';
}

/* ════════════════════════════════════════════════════════════════════
   ٥-و) ربطُ طلبات الشراء بالعقد  [المرحلة ٨]

   المرحلةُ ٥ بنَت حارسَ منع الازدواج: طلبُ شراءٍ يحمل `contractId` محسوبٌ أصلاً في
   خانتَي «متعاقَدٌ عليه»/«المصروف» التعاقديّتين، فيُستبعَد من مصروف الشراء. لكنّ
   **لا شاشةَ كانت تكتب ذلك الحقل** — فبقي الحارسُ باباً بلا مفتاح، والموادُّ التي
   تُشترى لعقدٍ عبر طلبِ شراءٍ تُحسب مرّتين في الموازنة.

   والربطُ يُدار **من جهة العقد** لا من طلب الشراء: هناك يعرف القارئُ ما يربط وبماذا،
   وهناك يظهر أثرُه فوراً في أرقام العقد. وطلبُ الشراء يعرض شارةً تقول إنه مرتبط.
   ════════════════════════════════════════════════════════════════════ */

function PURCH_COL(){ return _dev() ? "global_purchases_dev" : "global_purchases"; }

/* قائمةُ طلبات الشراء من نواة التطبيق — بلا نسخِ مستمعٍ ثانٍ للمجموعة نفسِها. */
function allPurchases(){
  try{ if(typeof purchases !== "undefined" && Array.isArray(purchases)) return purchases; }catch(e){}
  try{ if(Array.isArray(window.purchases)) return window.purchases; }catch(e){}
  return [];
}

/* طلباتُ الشراء المرشَّحةُ للربط بعقد: **مشروعُ العقد نفسُه**، غيرُ محذوفة، وغيرُ
   مرتبطةٍ بعقدٍ آخر. مطابقةُ المشروع بمفتاحٍ واحدٍ (`docProjectKey`) يشمل اليدويّ. */
function poCandidatesFor(contract){
  var c = contract || {}, key = docProjectKey(c);
  return allPurchases().filter(function(p){
    if(!p || p.status === "deleted") return false;
    if(p.contractId && p.contractId !== c.id) return false;
    return docProjectKey({ projectId:(p.projectId||"hail"), isCustomProject:p.isCustomProject,
                           projectName:p.projectName }) === key;
  });
}
function poLinkedTo(contractId){
  return allPurchases().filter(function(p){ return p && p.contractId === contractId; });
}

/* الربطُ والفكّ — كتابةُ حقلٍ واحدٍ على طلب الشراء، وتحديثُ الذاكرة المحلية فوراً
   (درسُ finance-audit) فلا ينتظر القارئُ دورةَ مستمع. */
function linkPurchase(poId, contractId){
  var database=_db(); if(!database) return Promise.reject(new Error("لا اتصال"));
  if(["procurement_officer","project_manager","admin"].indexOf(_role()) === -1)
    return Promise.reject(new Error("ربطُ طلب الشراء بعقدٍ للمشتريات أو مدير المشروع أو الأدمن"));
  var c = contractId ? contractById(contractId) : null;
  if(contractId && !c) return Promise.reject(new Error("العقد غير محمَّل"));
  var po = null;
  allPurchases().forEach(function(p){ if(p && p.id===poId) po = p; });
  if(!po) return Promise.reject(new Error("طلب الشراء غير موجود"));
  if(contractId && po.contractId && po.contractId !== contractId)
    return Promise.reject(new Error("الطلب مرتبطٌ بعقدٍ آخر ("+po.contractId+") — فُكَّه أولاً"));
  var patch = contractId ? { contractId:contractId } : { contractId:null };
  return database.collection(PURCH_COL()).doc(poId).set(
    Object.assign({}, patch, { updatedAt:_now(), updatedBy:_me() }), { merge:true }
  ).then(function(){
    if(contractId) po.contractId = contractId; else delete po.contractId;
    _audit(contractId ? "ربط طلب شراء بعقد" : "فكّ ربط طلب شراء",
           poId + (contractId ? (" ⇐ "+contractId) : ""));
    return poId;
  });
}

function ctrPurchasesHTML(c){
  var linked = poLinkedTo(c.id);
  var cands  = poCandidatesFor(c).filter(function(p){ return p.contractId !== c.id; });
  var can    = ["procurement_officer","project_manager","admin"].indexOf(_role()) !== -1;
  var total  = linked.reduce(function(s,p){ return s + _poAmount(p); }, 0);

  var rows = linked.length ? linked.map(function(p){
    return '<tr>'+
      '<td><span class="num">'+_esc(p.id)+'</span></td>'+
      '<td>'+_esc(_poStatusLbl(p))+'</td>'+
      '<td class="num">'+money(_poAmount(p))+'</td>'+
      '<td>'+(can?'<button class="btn btn-ghost btn-sm" onclick="contracts.unlinkPO(\''+_jq(p.id)+'\')">'+_icn("xCircle","ic-sm")+' فكّ الربط</button>':'—')+'</td>'+
    '</tr>';
  }).join("") : '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:16px">لا طلباتِ شراءٍ مرتبطة.</td></tr>';

  var picker = can && cands.length
    ? '<div class="ct-form-row" style="margin-top:12px">'+
        field("اربط طلبَ شراءٍ من مشروع العقد",
          '<select class="form-input" id="ct-po-pick">'+
          '<option value="">— اختر طلباً —</option>'+
          cands.map(function(p){
            return '<option value="'+_esc(p.id)+'">'+_esc(p.id)+' · '+_esc(_poStatusLbl(p))+' · '+money0(_poAmount(p))+' ر.س</option>';
          }).join("")+'</select>')+
        '<div style="display:flex;align-items:flex-end"><button class="btn btn-primary btn-sm" onclick="contracts.linkPO()">'+_icn("link","ic-sm")+' ربط</button></div>'+
      '</div>'
    : (can ? '<div class="ct-note" style="margin-top:12px">'+_icn("alertCircle","ic-sm")+' لا طلباتِ شراءٍ حرّةً في مشروع هذا العقد.</div>' : "");

  return '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("cart","ic-sm")+' طلبات الشراء المرتبطة'+
      '<span class="ct-sec-lock">تُحسب في العقد فتُستبعَد من مصروف الشراء</span></div>'+
    '<div class="ct-note">'+_icn("alertTriangle","ic-sm")+' <b>لماذا الربط؟</b> موادُّ تُشترى لهذا العقد بطلبِ شراءٍ تُحسب في الموازنة '+
      '<b>مرّتين</b> — مرّةً في «متعاقَدٌ عليه» ومرّةً في «مصروف الشراء». والربطُ يُسقطها من الثانية فيبقى رقمٌ واحدٌ لعملٍ واحد.</div>'+
    (linked.length ? '<div class="ct-money-row" style="margin-top:12px">'+
      '<div class="ct-tl"><span class="l">عدد الطلبات</span><span class="v num">'+linked.length+'</span></div>'+
      '<div class="ct-tl big"><span class="l">قيمتها</span><span class="v num">'+money(total)+'</span></div>'+
    '</div>' : "")+
    '<div class="ct-table-wrap" style="margin-top:12px"><table class="ct-table"><thead><tr>'+
      '<th>الطلب</th><th>الحالة</th><th>القيمة</th><th></th>'+
    '</tr></thead><tbody>'+rows+'</tbody></table></div>'+
    picker+
  '</div>';
}

/* قيمةُ طلب الشراء وحالتُه **تُقرآن من النواة** لا يُعاد حسابُهما هنا:
   الفعليُّ للمغلَق والتقديريُّ للجاري — نفسُ ما تعرضه شاشةُ المشتريات. */
function _poAmount(p){
  try{ if(typeof poIsClosed==="function" && poIsClosed(p) && typeof poActualCost==="function"){
    var a = poActualCost(p); if(a != null && isFinite(a)) return r2(a);
  } }catch(e){}
  try{ if(typeof getPOTotal==="function") return r2(getPOTotal(p)); }catch(e){}
  return r2(p && p.estCost);
}
function _poStatusLbl(p){
  try{ if(typeof poStatusLabel==="function") return poStatusLabel(p && p.status); }catch(e){}
  return String((p&&p.status)||"—");
}

function linkPO(){
  var sel=document.getElementById("ct-po-pick"); if(!sel || !sel.value) return _toast("⚠ اختر طلباً","warn");
  var cid=_cOpen; if(!cid) return;
  linkPurchase(sel.value, cid).then(function(id){
    paintCtrs(); _toast("✅ رُبط الطلب "+id+" بالعقد","success");
  }).catch(function(e){ _toast("⚠ "+(e&&e.message?e.message:"تعذّر الربط"),"warn"); });
}
function unlinkPO(poId){
  linkPurchase(poId, null).then(function(id){
    paintCtrs(); _toast("✅ فُكَّ ربط الطلب "+id,"success");
  }).catch(function(e){ _toast("⚠ "+(e&&e.message?e.message:"تعذّر الفكّ"),"warn"); });
}

/* ════════════════════════════════════════════════════════════════════
   ٥-ز) «بانتظار إجراءك» — التعاقداتُ في المكان الذي يفتحه المعتمِد  [المرحلة ٨]

   لوحةُ المشتريات تعرض بطاقةَ «بانتظار إجراءك» لطلبات الشراء. ووحدةُ التعاقدات
   كانت غائبةً عنها تماماً: فمديرُ المشاريع الذي ينتظره مستخلص، والماليةُ التي
   ينتظرها سداد — عليهم أن **يتذكّروا** فتحَ الشاشة. والاعتمادُ على الذاكرة هو ما
   يجعل الطلباتِ تنام أسابيع.

   نلفّ `renderPOMyTasks` بدل تعديلها (نمطُ `hookShowPage` نفسُه)، فلا تطلب الوحدةُ
   من `index.html` إلا وسمَ <script> واحداً كما هي منذ المرحلة ١.
   ════════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════════
   ٥-ح) التعاقداتُ في لوحة المعلومات  [المرحلة ١١]

   الوحدةُ تظهر في صفحتها وفي الموازنة و«بانتظار إجراءك» — وتغيب عن الشاشة التي
   يفتحها المالكُ أوّلَ الصباح. فلا يعرف منها: كم عقداً سارياً، وكم مالاً ما زال
   ملتزَماً به، وكم مستخلصاً ينتظر السداد، وكم عقداً تجاوز مدّته.
   تُلَفُّ `renderDashboardPurchaseSummary` كما لُفَّت بطاقةُ المهامّ — بلا تعديلٍ
   في `index.html`.
   ════════════════════════════════════════════════════════════════════ */
var DASH_ID = "ct-dash-card";

/* ملخّصُ لوحة المعلومات — دالّةٌ نقيةٌ تأخذ القوائم. */
function dashSummary(contracts, extracts, today){
  var out = { active:0, value:0, remaining:0, awaitingPay:0, awaitingPayAmt:0,
              pendingSign:0, late:0, lateMax:0 };
  var live = {};
  (Array.isArray(contracts)?contracts:[]).forEach(function(c){
    if(!c) return;
    if(c.status==="ctr_pending_signature") out.pendingSign++;
    if(!ctrIsCommitted(c)) return;
    live[c.id] = c;   // العقدُ نفسُه لا علَمٌ — يقرؤه حسابُ صافي المستخلص المعلّق أدناه
    out.active++;
    out.value += contractValue(c);
    var late = ctrLateDays(c, today);
    if(late > 0){ out.late++; if(late > out.lateMax) out.lateMax = late; }
  });
  var paid = {};
  (Array.isArray(extracts)?extracts:[]).forEach(function(e){
    if(!e || !live[e.contractId]) return;
    if(e.status==="ext_paid") paid[e.contractId] = r2((paid[e.contractId]||0) + r2((e.payment||{}).amount));
    if(e.status==="ext_pending_finance"){ out.awaitingPay++; out.awaitingPayAmt += extDueNet(e, live[e.contractId], extracts); }
  });
  (Array.isArray(contracts)?contracts:[]).forEach(function(c){
    if(!c || !live[c.id]) return;
    out.remaining += Math.max(0, contractValue(c) - (paid[c.id]||0));
  });
  out.value=r2(out.value); out.remaining=r2(out.remaining); out.awaitingPayAmt=r2(out.awaitingPayAmt);
  return out;
}

function renderDashCard(){
  var host = document.getElementById(DASH_ID);
  if(!host){
    var anchor = document.getElementById("dash-purchase-summary-card");
    if(!anchor || !anchor.parentNode) return;
    host = document.createElement("div");
    host.id = DASH_ID;
    anchor.parentNode.insertBefore(host, anchor.nextSibling);
  }
  if(!canView()){ host.style.display="none"; host.innerHTML=""; return; }
  startCtrSync(); startExtSync();
  var d = dashSummary(_ctrs, _exts, _today());
  if(!d.active && !d.pendingSign){ host.style.display="none"; host.innerHTML=""; return; }

  var tile = function(l, v, cls){
    return '<div class="ct-tl'+(cls?" "+cls:"")+'"><span class="l">'+l+'</span><span class="v num">'+v+'</span></div>';
  };
  host.style.display="";
  host.innerHTML =
    '<div class="card" style="margin-bottom:16px"><div class="card-body">'+
      '<div class="ct-mt-h" style="color:var(--primary)">'+_icn("briefcase","ic-sm")+' التعاقدات'+
        '<button class="btn btn-ghost btn-sm" style="margin-inline-start:auto" onclick="contracts.openCtrsPage()">'+_icn("briefcase","ic-sm")+' الصفحة</button></div>'+
      '<div class="ct-money-row">'+
        tile("عقود سارية", money0(d.active), "big")+
        tile("قيمتها", money(d.value))+
        tile("ملتزَمٌ به متبقٍّ", money(d.remaining))+
        tile("مستخلصات بانتظار السداد", money0(d.awaitingPay))+
        (d.awaitingPayAmt ? tile("قيمتها", money(d.awaitingPayAmt)) : "")+
      '</div>'+
      (d.pendingSign ? '<div class="ct-note warn" style="margin-top:10px">'+_icn("alertTriangle","ic-sm")+' '+money0(d.pendingSign)+' عقداً <b>بانتظار التوقيع</b> — لا تُقبل عليها مستخلصات.</div>' : "")+
      (d.late ? '<div class="ct-note crit">'+_icn("timer","ic-sm")+' '+money0(d.late)+' عقداً تجاوز مدّتَه — أقصاه '+money0(d.lateMax)+' يوماً.</div>' : "")+
    '</div></div>';
}
function openCtrsPage(){ try{ showPage(PAGE_CTRS); }catch(e){} }

function hookDash(){
  try{
    if(window.__ctDashHooked) return;
    if(typeof window.renderDashboardPurchaseSummary !== "function") return;
    var orig = window.renderDashboardPurchaseSummary;
    window.renderDashboardPurchaseSummary = function(){
      var r;
      try{ r = orig.apply(this, arguments); }catch(e){ console.warn("contracts/hookDash orig", e); }
      try{ renderDashCard(); }catch(e){ console.warn("contracts/renderDashCard", e); }
      return r;
    };
    window.__ctDashHooked = true;
  }catch(e){ console.warn("contracts/hookDash", e); }
}

var MYTASK_ID = "ct-my-tasks-card";

/* ما ينتظر دورَ المستخدم الآن — من **البوّابات نفسِها** التي تحرس الأزرار، لا من
   قائمةٍ ثانيةٍ تنحرف عنها. أربعةُ مصادر: طلبٌ · عقدٌ بانتظار توقيع · مستخلص · أمرُ تغيير. */
function myPendingItems(role){
  var out = [];
  if(!role || role==="viewer" || role==="observer") return out;
  /* «بانتظار إجراءك» تُبنى من البوّابات نفسِها — **وتحترم فصلَ المهام**: ما مُنع
     عنك ليس بانتظارك، وإدراجُه يعِد بزرٍّ لن تجده (الدرسُ نفسُه الذي علّمنا إيّاه
     تناقضُ «بانتظار التوقيع» بين البطاقة والرسالة). */
  var meU=_meUser(), meN=_me(), us=_users();
  _reqs.forEach(function(r){
    if(r && !crqIsFinal(r.status) && crqCanAct(r.status, role) &&
       crqActMode(r, r.status, role, meU, meN, us) !== "blocked")
      out.push({ kind:"req", id:r.id, lbl:"طلب تعاقد", title:r.title||r.vendorName||"", value:r2(r.value),
                 gate:(crqGateOwner(r.status)||{}).lbl||"", at:r.updatedAt||r.createdAt||"" });
  });
  _ctrs.forEach(function(c){
    if(c && c.status==="ctr_pending_signature" && ctrCanTransit("sign","ctr_pending_signature",role))
      out.push({ kind:"ctr", id:c.id, lbl:"عقد بانتظار التوقيع", title:c.title||c.vendorName||"",
                 value:contractValue(c), gate:"تسجيل التوقيع", at:c.updatedAt||c.createdAt||"" });
    /* الدفعةُ المقدمةُ المستحقّة عملُ المالية — من `advancePayable` نفسِها التي تحرس الزرّ */
    if(c && advancePayable(c) && ["finance","admin"].indexOf(role)!==-1)
      out.push({ kind:"ctr", id:c.id, lbl:"دفعة مقدمة", title:c.title||c.vendorName||"",
                 value:advanceDueOf(c), gate:"المالية — سداد الدفعة المقدمة", at:c.updatedAt||c.createdAt||"" });
  });
  _exts.forEach(function(e){
    if(e && !extIsFinal(e.status) && extCanAct(e.status, role) &&
       extActMode(e, e.status, role, meU, meN, us) !== "blocked"){
      var c=contractById(e.contractId);
      /* والماليةُ التي ينقصها ورقةٌ موقّعةٌ تقرأ **ما ينقصها** لا اسمَ البوّابة:
         «بانتظار السداد» على مستخلصٍ لا يُصرَف رسالةٌ تُضيّع اليومَ في البحث عن زرّ. */
      var egate=(extGateOwner(e.status)||{}).lbl||"";
      if(e.status==="ext_pending_finance" && !extSignature(e)) egate="بانتظار نسخةٍ موقّعةٍ من المقاول";
      out.push({ kind:"ext", id:e.id, lbl:"مستخلص", title:(c&&(c.title||c.vendorName))||e.contractId||"",
                 value:extDueNet(e, c, _exts), gate:egate,
                 at:e.updatedAt||e.createdAt||"", ctr:e.contractId });
    }
  });
  _chgs.forEach(function(g){
    if(g && !chgIsFinal(g.status) && chgCanAct(g.status, role) &&
       chgActMode(g, g.status, role, meU, meN, us) !== "blocked"){
      var c2=contractById(g.contractId);
      out.push({ kind:"chg", id:g.id, lbl:"أمر تغيير", title:(c2&&(c2.title||c2.vendorName))||g.contractId||"",
                 value:r2(g.amount), gate:(chgGateOwner(g.status)||{}).lbl||"",
                 at:g.updatedAt||g.createdAt||"", ctr:g.contractId });
    }
  });
  // الأقدمُ أولاً — كبطاقة المشتريات: ما نام أطول يُرى أولاً
  out.sort(function(a,b){ return String(a.at||"").localeCompare(String(b.at||"")); });
  return out;
}

/* ── ما ينتظر **سدادَ المالية** من جهة التعاقدات — لبطاقة «المالية — السداد» ──
   (طلبُ المالك): بطاقةُ السداد في المشتريات كانت تعرض طلبات الشراء وحدَها،
   بينما تقف عندها أيضاً أوامرُ دفعٍ ودفعاتٌ مقدمةٌ ومستخلصاتٌ لا تُرى إلا بدخول
   صفحات التعاقدات. المصدرُ **الدوالُّ نفسُها** التي تحرس أزرارَ السداد
   (`crqPayDue` · `advancePayable` · حالة `ext_pending_finance`) لا نسخةٌ منها —
   فالرقمُ في البطاقة هو الرقمُ على الزرّ. نقيةٌ تأخذ المصفوفاتِ وسائطَ
   ليفحصها `hail-tests.js` بلا متصفّح. */
function financePayables(reqs, ctrs, exts){
  var out = [];
  (Array.isArray(reqs)?reqs:[]).forEach(function(r){
    if(r && r.status === "crq_pending_pay")
      out.push({ kind:"req", id:r.id, lbl:"أمر دفع", title:r.title||r.vendorName||"",
                 due:crqPayDue(r), total:r2(Number(r.value)||0), at:r.updatedAt||r.createdAt||"" });
  });
  var byId = {};
  (Array.isArray(ctrs)?ctrs:[]).forEach(function(c){
    if(!c) return;
    byId[c.id] = c;
    if(advancePayable(c))
      out.push({ kind:"ctr", id:c.id, lbl:"دفعة مقدمة", title:c.title||c.vendorName||"",
                 due:advanceDueOf(c), total:r2(Number((c.advance||{}).amount)||0), at:c.updatedAt||c.createdAt||"" });
  });
  (Array.isArray(exts)?exts:[]).forEach(function(e){
    if(!e || e.status !== "ext_pending_finance") return;
    var c = byId[e.contractId];
    /* الصافي الحيُّ لا `settled.net` — تلك اللقطةُ تُكتب وقتَ السداد فقط،
       فقراءتُها هنا كانت تعرض المستخلصَ المعلّق بمتبقٍّ صفر */
    var net = extDueNet(e, c, exts);
    out.push({ kind:"ext", id:e.id, lbl:"مستخلص", title:(c&&(c.title||c.vendorName))||e.contractId||"",
               due:net, total:net, ctr:e.contractId||"", at:e.updatedAt||e.createdAt||"",
               /* الماليةُ لا تصرف مستخلصاً بلا نسخةٍ موقّعة — البطاقةُ تقول ما ينقص لا اسمَ البوّابة */
               needsSig: !extSignature(e) });
  });
  out.sort(function(a,b){ return String(a.at||"").localeCompare(String(b.at||"")); });
  return out;
}
/* القراءةُ الحيّة لبطاقة المشتريات: تُشغّل المزامنةَ وتحترم صلاحيةَ العرض —
   من لا يرى التعاقدات لا تتسرّب إليه أرقامُها عبر بطاقةٍ أخرى. */
function financePayablesLive(){
  if(!canView()) return [];
  startReqSync(); startCtrSync(); startExtSync();
  return financePayables(_reqs, _ctrs, _exts);
}

function _daysSince(iso){
  if(!iso) return null;
  var t = new Date(String(iso)).getTime();
  if(!isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now()-t)/86400000));
}

function renderMyTasks(){
  var host = document.getElementById(MYTASK_ID);
  if(!host){
    var anchor = document.getElementById("po-my-tasks-card");
    if(!anchor || !anchor.parentNode) return;
    host = document.createElement("div");
    host.id = MYTASK_ID; host.style.margin = "0 0 12px";
    anchor.parentNode.insertBefore(host, anchor.nextSibling);
  }
  if(!canView()){ host.style.display="none"; host.innerHTML=""; return; }
  startReqSync(); startCtrSync(); startExtSync(); startChgSync();
  var items = myPendingItems(_role());
  if(!items.length){ host.style.display="none"; host.innerHTML=""; return; }

  var open = { req:"openReqFrom", ctr:"openCtrFrom", ext:"openExtFrom", chg:"openChgFrom" };
  var rows = items.map(function(it){
    var d = _daysSince(it.at);
    var stale = d != null && d >= 3;
    return '<tr>'+
      '<td style="white-space:nowrap"><a href="javascript:void(0)" onclick="contracts.'+open[it.kind]+'(\''+_jq(it.id)+'\''+(it.ctr?(",\'"+_jq(it.ctr)+"\'"):"")+')" class="ct-link num">'+_esc(it.id)+'</a></td>'+
      '<td>'+_esc(it.lbl)+'</td>'+
      '<td>'+_esc(it.title||"—")+'</td>'+
      '<td class="num">'+(it.value?money0(it.value):"—")+'</td>'+
      '<td style="text-align:center'+(stale?';color:var(--sla-crit);font-weight:800':'')+'">'+(d==null?"—":(d+" يوم"+(stale?" ⚠":"")))+'</td>'+
    '</tr>';
  }).join("");

  host.style.display="";
  host.innerHTML =
    '<div class="card ct-mytasks"><div class="card-body">'+
      '<div class="ct-mt-h">'+_icn("hourglass","ic-sm")+' التعاقدات بانتظار إجراءك'+
        '<span class="ct-mt-badge">'+items.length+'</span></div>'+
      '<div class="ct-table-wrap"><table class="ct-table"><thead><tr>'+
        '<th>المستند</th><th>النوع</th><th>الجهة</th><th>القيمة</th><th>منذ</th>'+
      '</tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '</div></div>';
}

/* ════════════════════════════════════════════════════════════════════
   فتحُ مستندٍ برابطٍ عميق (زرُّ «فتح المستند» في رسالة واتساب)  [المرحلة ٩]

   الرسالةُ تحمل معرّفاً (`CRQ-…`/`CTR-…`/`EXT-…`/`CHG-…`) وزرّاً يفتح التطبيق به.
   وموجِّهُ الروابط في النواة كان يعرف `HRP-` وحدَها ويعتبر كلَّ ما عداه **طلبَ شراء** —
   فرسالةُ مستخلصٍ تنتهي بـ«تعذّر إيجاد الطلب»: زرٌّ يَعِد ولا يفي، وهو أسوأُ من زرٍّ
   غائبٍ لأنّ المستخدم يظنّ العطلَ في بياناته.

   والبادئةُ هي ما يوجّه لا اسمُ المتغيّر في الرابط (درسُ `HRP-` نفسُه) — فتعمل مع
   القالب المستعار (`?po=`) والمخصّص معاً بلا تغيير.

   والانتظارُ ضروريّ: المستمعُ قد لا تصل لقطتُه لحظةَ الدخول، فنفتح الصفحةَ فوراً
   (فيرى المستخدمُ مكانَه لا شاشةً غريبة) ثمّ نفتح المستندَ فور وصوله — **بحدٍّ زمنيٍّ
   صريحٍ** لا انتظارَ أبديٍّ لمعرّفٍ خاطئٍ أو مستندٍ حُذف. */
function ctrIdKind(id){
  var v = String(id||"").toUpperCase();
  if(/^CRQ-/.test(v)) return "req";
  if(/^CTR-/.test(v)) return "ctr";
  if(/^EXT-/.test(v)) return "ext";
  if(/^CHG-/.test(v)) return "chg";
  return "";
}
function ctrOwnsId(id){ return ctrIdKind(id) !== ""; }

function openById(id){
  var kind = ctrIdKind(id);
  if(!kind) return false;
  if(!canView()){ _toast("⚠ لا تملك صلاحية الاطلاع على التعاقدات","warn"); return true; }
  startSync(); startReqSync(); startCtrSync(); startExtSync(); startChgSync();

  var finders = {
    req: function(){ return requestById(id); },
    ctr: function(){ return contractById(id); },
    ext: function(){ return extractById(id); },
    chg: function(){ return changeById(id); }
  };
  var openers = {
    req: function(){ openReqFrom(id); },
    ctr: function(){ openCtrFrom(id); },
    ext: function(){ var e=extractById(id); openExtFrom(id, e && e.contractId); },
    chg: function(){ var g=changeById(id); openChgFrom(id, g && g.contractId); }
  };
  // انقل المستخدمَ لمكانه فوراً ولو لم تصل البيانات بعد
  try{ showPage(kind==="req" ? PAGE_REQS : PAGE_CTRS); }catch(e){}
  if(finders[kind]()){ openers[kind](); return true; }

  var tries = 0;
  var timer = setInterval(function(){
    if(++tries > 40){ clearInterval(timer); _toast("⚠ تعذّر إيجاد المستند "+id,"warn"); return; }
    if(finders[kind]()){ clearInterval(timer); openers[kind](); }
  }, 500);   // حتى ٢٠ ثانية
  return true;
}

function openReqFrom(id){ try{ showPage(PAGE_REQS); }catch(e){} openReq(id); }
function openCtrFrom(id){ try{ showPage(PAGE_CTRS); }catch(e){} openCtr(id); }
function openExtFrom(id, cid){ try{ showPage(PAGE_CTRS); }catch(e){} openCtr(cid||""); _cTab="extracts"; _extOpen=id; paintCtrs(); }
function openChgFrom(id, cid){ try{ showPage(PAGE_CTRS); }catch(e){} openCtr(cid||""); _cTab="changes"; _chgOpen=id; paintCtrs(); }

/* لفُّ بطاقة المشتريات — تُرسَم بطاقتُنا بعدها مباشرةً، ومرةً واحدةً لكلّ رسم. */
function hookMyTasks(){
  try{
    if(window.__ctMyTasksHooked) return;
    if(typeof window.renderPOMyTasks !== "function") return;
    var orig = window.renderPOMyTasks;
    window.renderPOMyTasks = function(){
      var r;
      try{ r = orig.apply(this, arguments); }catch(e){ console.warn("contracts/hookMyTasks orig", e); }
      try{ renderMyTasks(); }catch(e){ console.warn("contracts/renderMyTasks", e); }
      return r;
    };
    window.__ctMyTasksHooked = true;
  }catch(e){ console.warn("contracts/hookMyTasks", e); }
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
    return '<tr'+(bad?' class="ct-bad"':'')+'>'+lnSeq(i)+
      '<td>'+_esc(ln.desc||"—")+'</td>'+
      '<td class="num">'+money0(cur)+' '+_esc(ln.unit||"")+'</td>'+
      '<td class="num">'+money0(executed)+'</td>'+
      '<td><input class="form-input num" data-cf="qty" data-line="'+_esc(ln.id)+'" data-price="'+_esc(ln.unitPrice)+'" data-desc="'+_esc(ln.desc||"")+'" data-unit="'+_esc(ln.unit||"")+'" type="number" step="any" value="'+_esc(delta||"")+'" placeholder="0" style="min-width:90px" oninput="contracts.chgRecalc()"></td>'+
      '<td class="num ct-g-after">'+money0(after)+'</td>'+
      '<td class="num ct-g-delta">'+money(lineTotal(delta, ln.unitPrice, c.vatMode).total)+'</td>'+
    '</tr>';
  }).join("") || '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:14px">لا بنودَ في العقد.</td></tr>';

  var news=(d.newLines||[]).map(function(l,i){
    return '<tr>'+lnSeq(i)+
      '<td><input class="form-input" data-nf="desc" data-i="'+i+'" value="'+_esc(l.desc||"")+'" oninput="contracts.chgRecalc()" placeholder="وصف العمل"></td>'+
      '<td><input class="form-input" data-nf="unit" data-i="'+i+'" value="'+_esc(l.unit||"")+'" oninput="contracts.chgRecalc()" placeholder="م٢"></td>'+
      '<td><input class="form-input num" data-nf="qty" data-i="'+i+'" type="number" step="any" value="'+_esc(l.qty||"")+'" oninput="contracts.chgRecalc()"></td>'+
      '<td><input class="form-input num" data-nf="unitPrice" data-i="'+i+'" type="number" step="any" value="'+_esc(l.unitPrice||"")+'" oninput="contracts.chgRecalc()"></td>'+
      '<td class="num">'+money(lineTotal(l.qty,l.unitPrice,c.vatMode).total)+'</td>'+
      '<td><button class="btn btn-ghost btn-sm" onclick="contracts.chgDelNew('+i+')">'+_icn("trash","ic-sm")+'</button></td>'+
    '</tr>';
  }).join("") || '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:14px">لا بنودَ جديدة.</td></tr>';

  var warn='<div id="ct-g-warn">'+(g.ok||g.empty ? "" : '<div class="ct-note crit">'+_icn("alertTriangle","ic-sm")+' '+_esc(_chgGuardMsg(g))+'</div>')+'</div>';

  return '<button class="btn btn-ghost btn-sm ct-back" onclick="contracts.cancelChgDraft()">'+_icn("rotateCcw")+' إلغاء</button>'+
  '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("repeat","ic-sm")+' أمرُ تغييرٍ على '+_esc(c.id)+
      '<span class="ct-sec-lock">أدخِل <b>فارقَ</b> الكمية لا الكميةَ الجديدة — بالسالب للخفض</span></div>'+
    '<div class="ct-table-wrap"><table class="ct-table" id="ct-g-lines"><thead><tr>'+LN_TH+
      '<th>البند</th><th>كمية العقد</th><th>المنفَّذ</th><th>فارق الكمية (±)</th><th>الكمية بعد</th><th>أثر القيمة</th>'+
    '</tr></thead><tbody>'+exist+'</tbody></table></div>'+
  '</div>'+
  '<div class="card ct-sec">'+
    '<div class="ct-sec-h">'+_icn("plus","ic-sm")+' بنودٌ جديدة'+
      '<button class="btn btn-ghost btn-sm" style="margin-inline-start:auto" onclick="contracts.chgAddNew()">'+_icn("plus","ic-sm")+' إضافة بند</button></div>'+
    '<div class="ct-table-wrap"><table class="ct-table" id="ct-g-new"><thead><tr>'+LN_TH+
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
   زرٌّ معطَّلٌ بلا سببٍ ظاهرٍ على الشاشة (درسُ المستخلص نفسُه).
   ⛔ **والكتابةُ في الخلايا بصنفها لا بفهرسها.** كانت بالفهرس، فعمودٌ يُضاف في مقدّمة
   الجدول يُزيحه خليّةً: يُكتب «الكمية بعد» في خانة الإدخال و«أثرُ القيمة» في خانة
   «الكمية بعد» — **بلا خطأِ جافاسكربت ولا رسالة**، وأرقامٌ صحيحةٌ في أماكنَ خاطئة.
   (وقع فعلاً عند إضافة عمود «م» — v18.9.2743.) ويحرسه فحصٌ يمنع عودةَ الفهرس. */
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
    // ⛔ بالصنف لا بالفهرس (§3-ب/١١)
    var elA=tr.querySelector(".ct-g-after"), elE=tr.querySelector(".ct-g-delta");
    if(elA) elA.textContent=money0(after);
    if(elE) elE.textContent=money(lineTotal(delta, Number(inp.getAttribute("data-price"))||0, c.vatMode).total);
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
  var mode=chgActMode(g, g.status, _role(), _meUser(), _me(), _users());
  var eff=chgEffect(c, g);
  var tools="";
  if(mine){
    if(mode!=="blocked")
      tools='<button class="btn btn-success btn-sm" onclick="contracts.chgAct(\'approve\')">'+_icn("checkCircle","ic-sm")+
            ' اعتماد — '+_esc((owner||{}).lbl||"")+'</button> ';
    tools+='<button class="btn btn-ghost btn-sm" onclick="contracts.chgAct(\'reject\')">'+_icn("xCircle","ic-sm")+' رفض</button> ';
  }
  if(!chgIsFinal(g.status) && _role()==="admin" && chgRewindTargets(g, ceoThreshold()).length){
    tools+='<button class="btn btn-ghost btn-sm" onclick="contracts.openChgRewind()">'+_icn("rotateCcw","ic-sm")+' إرجاع لمرحلة</button> ';
  }
  var chgSod = sodNoteHTML(mode, owner);
  if(g.status==="chg_approved" && ["procurement_officer","admin"].indexOf(_role())!==-1){
    tools+='<button class="btn btn-primary btn-sm" onclick="contracts.doApplyChange()">'+_icn("repeat","ic-sm")+' التطبيق على العقد</button> ';
  }
  if(!chgIsFinal(g.status) && (_role()==="admin" || g.createdByUser===_meUser())){
    tools+='<button class="btn btn-ghost btn-sm" onclick="contracts.doCancelChange()">'+_icn("ban","ic-sm")+' إلغاء</button>';
  }
  var rows=(g.lines||[]).map(function(l,i){
    return '<tr>'+lnSeq(i)+'<td>'+_esc(l.desc||"—")+'</td><td>'+_esc(l.unit||"")+'</td>'+
      '<td class="num">'+((Number(l.qty)||0)>=0?"+":"")+money0(l.qty)+'</td>'+
      '<td class="num">'+money(l.unitPrice)+'</td>'+
      '<td class="num">'+money(lineTotal(l.qty,l.unitPrice,c.vatMode).total)+'</td></tr>';
  }).join("") || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:14px">—</td></tr>';
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
  chgSod +
  '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("pieChart","ic-sm")+' الأثر على العقد</div>'+effBox+
    '<div class="ct-note" style="margin-top:12px">'+_icn("fileText","ic-sm")+' <b>السبب:</b> '+_esc(g.reason||"—")+'</div>'+
    (g.durationDaysDelta?'<div class="ct-note">'+_icn("timer","ic-sm")+' تمديدُ المدة '+money0(g.durationDaysDelta)+' يوماً</div>':'')+
  '</div>'+
  '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("layers","ic-sm")+' بنود التغيير</div>'+
    '<div class="ct-table-wrap"><table class="ct-table"><thead><tr>'+LN_TH+'<th>الوصف</th><th>الوحدة</th><th>فارق الكمية</th><th>سعر الوحدة</th><th>أثر القيمة</th></tr></thead>'+
    '<tbody>'+rows+'</tbody></table></div></div>'+
  '<div class="card ct-sec"><div class="ct-sec-h">'+_icn("scrollText","ic-sm")+' السجل</div>'+
    '<div class="ct-timeline">'+tl+'</div></div>';
}

function chgAct(action){
  var id=_chgOpen; if(!id) return;
  var run=function(note){
    actOnChange(id, action, note).then(function(g){
      paintCtrs(); _toast("✅ "+(CHG_STATUS[g.status]||g.status),"success");
    }).catch(function(e){ _toast("⚠ "+_errMsg(e),"warn"); });
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
    .catch(function(e){ _toast("⚠ "+_errMsg(e),"warn"); });
}

function filterCtrs(k,v){
  _cFilter[k]=v||""; paintCtrs();
  if(k==="q"){ var i=document.getElementById("ct-c-q"); if(i){ i.focus(); try{ i.setSelectionRange(i.value.length,i.value.length); }catch(e){} } }
}
/* تبديلُ تبويب القائمة يُصفّر فلترَ الحالة وحدَه — حالاتُ التبويبين لا تتقاطع،
   ويبقى البحثُ فهو سؤالُ المستخدم لا سؤالَ التبويب. (الاسمُ `ctrsTab` لأن
   `ctrTab` محجوزٌ لتبويبات بطاقة العقد المفتوح.) */
function ctrsTab(t){
  var to = t==="finished" ? "finished" : "running";
  if(to===ctrCurTab()) return;
  _cFilter.tab=to; _cFilter.status="";
  paintCtrs();
}
function openCtr(id){ _cOpen=id; _cTab="overview"; _extDraft=null; _extOpen=null; _clEdit=null; _chgDraft=null; _chgOpen=null; paintCtrs(); }
function backToCtrs(){ _cOpen=null; paintCtrs(); }
function ctrTab(t){ _cTab=t; _extDraft=null; _extOpen=null; _clEdit=null; _chgDraft=null; _chgOpen=null; paintCtrs(); }
/* فتحُ سجلّ الطرف من بطاقة الطلب أو العقد.
   يُنقَل المستخدمُ فوراً ولو لم تصل بياناتُ الأطراف بعد: `showPage` تُشغّل مزامنتَها،
   ولقطتُها تُعيد الرسمَ وحدَها متى وصلت (`_page===PAGE_VENDORS`) — فلا حاجةَ لمؤقّتٍ
   ولا تبقى «تعذّر العثور على الطرف» معلّقةً لطرفٍ موجودٍ لم يُحمَّل بعد. */
function openVendorFrom(vendorId){
  if(!vendorId) return;
  if(!canView()) return _toast("⚠ لا تملك صلاحية الاطلاع على سجلّ الأطراف","warn");
  try{ showPage(PAGE_VENDORS); }catch(e){}
  openVendor(vendorId);
}

function openReqFromCtr(reqId){ try{ showPage(PAGE_REQS); }catch(e){} openReq(reqId); }
function openCtrFromReq(cid){ try{ showPage(PAGE_CTRS); }catch(e){} openCtr(cid); }

/* حذفُ العقد: الرسالةُ تقول بالضبط ما سيقع للطلب — فلا يُفاجأ الأدمن بعودته
   إلى «معتمَد». وهذا الفعلُ لا رجعةَ فيه، فنصُّه صريحٌ ويذكر المعرّف. */
function doDeleteCtr(){
  var c=contractById(_cOpen); if(!c) return;
  var id=_cOpen;
  var reqNote = c.requestId ? ' وسيعود طلبُه '+c.requestId+' إلى «معتمَد» فتستأنفه أو تُلغيه.' : '';
  Promise.resolve(_confirm({ kind:"danger", icon:"🗑", okText:"حذف نهائياً",
    title:"حذف العقد غير الموقَّع",
    msg:'سيُحذف العقد «'+(c.title||id)+'» ('+id+') نهائياً ولا يمكن استرجاعه.'+reqNote+' يبقى الحذفُ مسجّلاً في سجل التدقيق.'
  })).then(function(ok){
    if(!ok) return;
    var reason=(window.prompt("سبب الحذف (إلزامي):")||"").trim();
    if(!reason){ _toast("⚠ سبب الحذف إلزامي","warn"); return; }
    return deleteContract(id, reason).then(function(res){
      paintCtrs();
      _toast("✅ حُذف العقد "+id+(res.req?" — وعاد الطلب "+res.req.id+" إلى «معتمد»":""),"success");
    });
  }).catch(function(e){
    console.warn("contracts/doDeleteCtr",e);
    _toast("⚠ "+_errMsg(e),"warn");
  });
}

function transit(action){
  var c=contractById(_cOpen); if(!c) return;
  var t=CTR_TRANSITIONS[action]; if(!t) return;
  /* الفسخُ والإيقافُ إجراءان يُفقدان عملاً — لهما الزرُّ الأحمر؛ وما عداهما تقدُّمٌ
     في دورة حياة العقد، فزرُّه محايد. */
  Promise.resolve(_confirm({ kind:t.needsReason?"danger":"approve", okText:t.lbl,
    title:t.lbl, msg:'«'+(c.title||c.id)+'» — '+t.lbl+'؟' })).then(function(ok){
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
    _toast("⚠ "+_errMsg(e),"warn");
  });
}



/* ════ المخرَجُ الورقيّ — الوثيقةُ التي يوقّعها الطرف ════
   تُبنى بـ`_openPrintWindow` القائمة في النواة (ومعها معالجةُ iOS المجرَّبة)،
   بنمط مطبوعات المنصة نفسِه. وهنا يثمر سجلُّ الأطراف: المنشأةُ تُعرَّف بسجلها
   التجاريّ والشخصُ بهويته — كلٌّ بمسمّاه الصحيح، من `identityOf` لا بشرطٍ محلّيّ.

   وفتحُ النافذة نفسُها **دالّةٌ واحدةٌ** (`_emitPrint`) تقرؤها كلُّ مطبوعاتنا: سقوطُ
   `_openPrintWindow` إلى `window.open` ومعالجةُ الفشل والقيدُ في السجلّ — ثلاثةُ
   أشياءَ تُنسى في النسخة الثانية إن نُسخت. */
function _printLogo(){
  try{
    var im = document.querySelector('img[data-logo="1"]');
    if(im && im.src && im.src.indexOf("data:,") !== 0) return im.src;
  }catch(e){}
  return "";
}

/* ════ الورقةُ الرسميةُ للشركة — ترويسةٌ وتذييلٌ وعلامةٌ مائيةٌ على كل صفحة ════
   (طلبُ المالك: «صفحاتُ التعاقد نفسُ الصفحة المرفقة»)

   **الهندسةُ مقيسةٌ من قالب الشركة الورقيّ نفسِه** (A4 = ٢١٠×٢٩٧مم) لا مقدَّرةً
   بالعين — فما يخرج من الطابعة ينطبق على الورقة المعتمَدة:
     · الترويسة: عرضُها ٢٠٢٫٥مم يبدأ عند −٢٫٦٥مم (نَزفٌ يسيرٌ خارج الحافّة كما في
       الأصل)، وقمّتُها على بُعد ٣مم من رأس الورقة.
     · التذييل: عرضُه ١٩١٫٨مم يبدأ عند ٣٫٧٢مم، وقاعُه على بُعد ١١٫٥مم من أسفلها.
     · العلامةُ المائية: ١٠٨٫٤مم عرضاً، يسارُها ٤٨٫٩٥مم وقمّتُها ٩٢٫٩مم من الرأس.
     · فيبقى للنصّ: ٣٨٫٦مم أعلى · ٣٦٫٤مم أسفل · ٢٠٫٧مم جانبين.

   **ولماذا جدولٌ يلفّ المحتوى وثلاثُ صورٍ مثبَّتةٍ لا صورٌ في مجرى النصّ؟** لأن
   العقدَ **يتجاوز الصفحةَ الواحدة**، والترويسةُ تلزم كلَّ صفحةٍ لا الأولى وحدَها.
   والمتصفّحُ يكرّر العنصرَ `fixed` على كل صفحةٍ مطبوعةٍ — فحُلَّ الرسمُ به. لكنّه
   **يحصره في صندوق المحتوى ويلوي الإزاحةَ السالبة**: قِيس فعلاً أن `top:-20mm`
   يرتدّ إلى أسفل الصفحة لا إلى هامشها العلويّ. فلا سبيلَ إلى الرسم في هامش
   `@page`؛ ولذلك **جُعل الهامشُ عند حافّة الصورة نفسِها** (٣مم / ١١٫٥مم) وحُجز
   فراغُ النصّ بصفَّي `thead`/`tfoot` — وهما وحدَهما ما تضمن المواصفةُ تكرارَه على
   كل صفحة — ثمّ ثُبِّت الرسمُ فوقهما.

   **وثلاثُ الصور تُقرأ من الصفحة لا تُكتَب هنا** (`img#_lh_*`): نافذةُ الطباعة على
   iOS مستندُ `blob:` لا أصلَ له، فالمسارُ النسبيّ فيه ميت — والمقروءُ من `img.src`
   مطلقٌ دائماً. ومن وجدها غيرَ محمَّلةٍ (`naturalWidth === 0`) عاد إلى الترويسة
   النصّية القديمة: ورقةٌ بلا زخرفٍ خيرٌ من ورقةٍ بمربّعاتٍ مكسورة. */
function _lhSrc(id){
  try{
    var im = document.getElementById(id);
    if(im && im.src && im.naturalWidth > 0) return im.src;
  }catch(e){}
  return "";
}
function letterheadAssets(){
  return { head:_lhSrc("_lh_head_"), foot:_lhSrc("_lh_foot_"), mark:_lhSrc("_lh_mark_") };
}
function letterheadOn(l){ return !!(l && l.head && l.foot); }

/* أنماطُ الورقة الرسمية — تُلحَق **بعد** أنماط المطبوعة فتغلبها بالترتيب
   (الهامشُ والحشوةُ والـ`@page` كلُّها إعلاناتٌ متأخّرةٌ تكسب). */
function letterheadCSS(){
  return '@page{size:A4;margin:3mm 0 11.5mm}'+
    'html,body{margin:0;padding:0}'+
    '@media print{body{padding:0}}'+
    '.lh{position:absolute;z-index:3}'+
    '.lh img{display:block;width:100%;height:auto}'+
    '.lh-h{left:-2.65mm;top:0;width:202.5mm}'+
    '.lh-f{left:3.72mm;bottom:0;width:191.8mm}'+
    /* العلامةُ المائيةُ بنصف شدّتها (طلبُ المالك): بشدّة القالب الأصلية كانت تُقرأ
       خلف جدول البنود والأرقام فتزاحم ما يُوقَّع عليه. والتخفيفُ بالشفافية لا
       بصورةٍ ثانيةٍ أفتح — فالأصلُ يبقى مصدراً واحداً، والشدّةُ رقمٌ يُعدَّل. */
    '.lh-m{left:48.95mm;top:89.9mm;width:108.4mm;z-index:0;opacity:.5}'+
    /* على الشاشة تُرسَم مرّةً في مجرى الصفحة، وفي الطباعة تتكرّر على كل ورقة */
    '@media print{.lh{position:fixed}}'+
    '.pg{width:100%;border-collapse:collapse;margin:0;font-size:inherit}'+
    '.pg>thead>tr>td,.pg>tfoot>tr>td,.pg>tbody>tr>td{padding:0;border:0;background:none}'+
    '.pg>tbody>tr>td{padding:0 20.7mm;position:relative;z-index:1}'+
    '.sp-h{height:35.6mm}.sp-f{height:24.9mm}'+
    /* شريطُ عنوان المستند حين تحمله الورقةُ الرسمية — بلا اسم شركةٍ ولا شعارٍ
       مكرَّرين، فهما في الترويسة فوقه */
    '.dochead{display:flex;justify-content:space-between;align-items:center;gap:14px;'+
      'border-bottom:3px solid #1b3a6b;padding-bottom:10px}'+
    '.dh-t{font-size:17px;font-weight:800;color:#1b3a6b}'+
    /* سطرُ التذييل يمرّ فوق العلامة المائية — فيُغمَق قليلاً ليبقى مقروءاً */
    '.foot{color:#64748b}';
}
/* يلفّ محتوى المطبوعة بإطار الورقة — أو يعيده كما هو إن غابت الصور. */
function letterheadWrap(inner, l){
  if(!letterheadOn(l)) return inner;
  return '<div class="lh lh-h"><img src="'+_esc(l.head)+'" alt=""></div>'+
    (l.mark ? '<div class="lh lh-m"><img src="'+_esc(l.mark)+'" alt=""></div>' : '')+
    '<div class="lh lh-f"><img src="'+_esc(l.foot)+'" alt=""></div>'+
    '<table class="pg"><thead><tr><td><div class="sp-h"></div></td></tr></thead>'+
    '<tfoot><tr><td><div class="sp-f"></div></td></tr></tfoot>'+
    '<tbody><tr><td>'+inner+'</td></tr></tbody></table>';
}
/* رأسُ المستند: شريطٌ نحيلٌ فوق الورقة الرسمية، والترويسةُ النصّيةُ القديمةُ دونها. */
function docHeadHTML(o){
  if(o.on) return '<div class="dochead"><div class="dh-t">'+_esc(o.subtitle||"")+'</div>'+
    '<div class="doc-no">'+_esc(o.docNo||"")+'</div></div>';
  return '<div class="header"><div class="header-right">'+
    (o.logo?'<img src="'+_esc(o.logo)+'" class="company-logo" alt="">':'')+
    '<div><div class="company">شركة المباني السريعة للمقاولات</div>'+
    '<div class="subtitle">'+_esc(o.subtitle||"")+'</div></div></div>'+
    '<div class="doc-no">'+_esc(o.docNo||"")+'</div></div>';
}

function _emitPrint(html, auditAction, auditData){
  try{
    if(typeof _openPrintWindow === "function") _openPrintWindow(html);
    else { var w=window.open("","_blank"); if(w){ w.document.write(html); w.document.close(); } }
    _audit(auditAction, auditData);
    return true;
  }catch(e){
    console.warn("contracts/"+auditAction, e);
    _toast("⚠ تعذّر فتح نافذة الطباعة","warn");
    return false;
  }
}
/* **ورقةُ العقد دالّةٌ واحدةٌ** يقرؤها العقدُ النافذُ ومسودتُه معاً (`opt`):
   رقمُ المستند · شريطُ الحالة · خاناتُ الاعتماد الداخليّ · التذييل. ونسخُها لصنع
   «ورقةِ مسودةٍ» ثانيةٍ كان سيُنتج وثيقتين تفترقان عند أوّل تعديلٍ على أيّهما —
   والمعتمِدُ حينها يوقّع على ورقةٍ ليست التي ستُوقَّع. */
function contractPaperHTML(c, opt){
  var o=opt||{};
  var docNo=o.docNo || c.id || "";
  var v=vendorById(c.vendorId), idn=v?identityOf(v):null;
  var ph2 = v ? ((vendorPhones(v)[0]||{}).display || "") : "";
  var val=contractValue(c), t=linesTotal(c.lines||[], c.vatMode);
  var groups=allClausesOf(c);
  var logo=_printLogo();
  var lh=letterheadAssets(), lhOn=letterheadOn(lh);
  var dt=function(s){ return String(s||"").slice(0,16).replace("T"," ") || "—"; };

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

  /* شريطُ الحالة — يُطبَع فقط حين تُمرَّر حالةٌ (العقدُ النافذُ لا يحتاج وسماً). */
  var st = o.band || null;
  var bandHtml = st ? '<div class="band '+_esc(st.cls||"warn")+'">'+_esc(st.lbl||"")+
    (st.note?'<span class="bn">'+_esc(st.note)+'</span>':'')+'</div>' : "";

  /* خاناتُ الاعتماد الداخليّ — بوّاباتُ الطلب كما وقّعتها فعلاً (`crqSignoffs`):
     فيقرأ المعتمِدُ التاليّ من الورقة نفسِها **أين تقف** قبل أن يوقّع. */
  var sig = Array.isArray(o.signoffs) ? o.signoffs : [];
  var apprHtml = sig.length ? '<h2>الاعتمادات الداخلية</h2><div class="appr">'+
    sig.map(function(g){
      return '<div class="ap"><div class="ap-l">'+_esc(g.lbl)+'</div>'+
        '<div class="ap-n">'+(g.by?_esc(g.by):'<span class="ap-w">لم يعتمد بعد</span>')+'</div>'+
        '<div class="ap-d">'+(g.at?_esc(dt(g.at)):'—')+'</div></div>';
    }).join("")+'</div>' : "";

  var html='<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">'+
  '<title>'+_esc(o.title || ("عقد "+docNo))+'</title><style>'+
  '*{box-sizing:border-box}'+
  'body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;margin:0;padding:26px;color:#111827;direction:rtl;font-size:13px;line-height:1.9}'+
  '.header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1b3a6b;padding-bottom:12px}'+
  '.header-right{display:flex;align-items:center;gap:12px}'+
  '.company-logo{width:56px;height:56px;object-fit:contain}'+
  '.company{font-size:18px;font-weight:800}.subtitle{font-size:13px;color:#1b3a6b;font-weight:700}'+
  '.doc-no{background:#eef2f7;color:#1b3a6b;border-radius:8px;padding:8px 14px;font-weight:800;font-family:monospace}'+
  '.band{margin-top:14px;border-radius:8px;padding:9px 13px;font-weight:800;font-size:13px;border:2px solid}'+
  '.band .bn{display:block;font-weight:600;font-size:11.5px;margin-top:2px}'+
  '.band.ok{background:#ecfdf5;border-color:#059669;color:#065f46}'+
  '.band.warn{background:#fffbeb;border-color:#d97706;color:#92400e}'+
  '.band.bad{background:#fef2f2;border-color:#dc2626;color:#991b1b}'+
  '.appr{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-top:10px;break-inside:avoid}'+
  '.ap{border:1px solid #dde3ed;border-radius:8px;padding:9px;text-align:center}'+
  '.ap-l{font-size:11px;color:#64748b;font-weight:700}'+
  '.ap-n{font-size:12.5px;font-weight:800;margin-top:4px}'+
  '.ap-w{color:#b45309;font-weight:700}'+
  '.ap-d{font-size:11px;color:#64748b;font-family:monospace}'+
  'h2{font-size:15px;color:#1b3a6b;margin:22px 0 8px;border-bottom:1px solid #dde3ed;padding-bottom:5px;break-after:avoid;page-break-after:avoid}'+
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
  (lhOn?letterheadCSS():"")+
  '</style></head><body>'+
  letterheadWrap(
  docHeadHTML({ on:lhOn, logo:logo, docNo:docNo,
                subtitle:(o.subtitle || "عقد إسناد أعمال — مقاول باطن") })+

  bandHtml+

  '<h2>أطراف العقد</h2><div class="parties">'+
    '<div class="party"><div class="pl">الطرف الأول</div>'+
      '<div class="pn">شركة المباني السريعة للمقاولات</div>'+
      '<div class="pm">ويُشار إليها بـ«الطرف الأول»</div></div>'+
    '<div class="party"><div class="pl">الطرف الثاني</div>'+
      '<div class="pn">'+_esc(c.vendorName||"—")+'</div>'+
      '<div class="pm">'+(idn&&idn.number?(_esc(idn.label)+": "+_esc(idn.number)):"—")+'</div>'+
      /* رقمُ التواصل في وثيقة العقد نفسِها: الإشعارُ الرسميُّ والإنذارُ قبل السحب
         يحتاجان وسيلةَ تواصلٍ **مثبَتةً في العقد**، لا رقماً في شاشةٍ يتغيّر بعده. */
      (ph2 ? '<div class="pm">جوال: <span dir="ltr">'+_esc(ph2)+'</span></div>' : '')+
      '<div class="pm">ويُشار إليه بـ«الطرف الثاني»</div></div>'+
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

  apprHtml+

  '<div class="sign"><div>الطرف الأول — شركة المباني السريعة للمقاولات<br><br>الاسم / التوقيع / الختم</div>'+
  '<div>الطرف الثاني — '+_esc(c.vendorName||"")+'<br><br>الاسم / التوقيع / الختم</div></div>'+
  '<div class="foot">'+_esc(o.foot || ("حُرِّر هذا العقد من نسختين بيد كل طرف نسخة للعمل بموجبها · "+docNo))+'</div>'
  , lh)+
  '</body></html>';

  return html;
}
function printContract(id){
  var c=contractById(id); if(!c) return _toast("⚠ العقد غير موجود","warn");
  _emitPrint(contractPaperHTML(c, {}), "طباعة عقد", c.id);
}

/* مسودةُ عقدِ الطلب — تُطبَع في **كلّ مرحلةٍ ولكلّ دور**. وحين يكون العقدُ قد أُنشئ
   فعلاً تُحوَّل الطباعةُ إليه: الوثيقةُ النافذةُ أولى بالورق من صورةٍ عنها. */
function printContractDraft(id){
  var r = requestById(id); if(!r) return _toast("⚠ الطلب غير موجود","warn");
  if(r.engagement === "pay_order")
    return _toast("⚠ أمرُ الدفع ليس عقداً — اطبع سندَ صرفه","warn");
  if(r.contractId && contractById(r.contractId)) return printContract(r.contractId);

  var d  = crqDraftContract(r, clauseTemplates());
  var st = crqDraftState(r);
  var html = contractPaperHTML(d, {
    docNo:    r.id,
    title:    "مسودة عقد "+r.id,
    subtitle: "مسودة عقد إسناد أعمال — للمراجعة والاعتماد",
    band:     st,
    signoffs: crqSignoffs(r, ceoThreshold()),
    foot:     "مسودةٌ من طلب التعاقد "+r.id+" — تصير عقداً برقمه الخاصّ بعد اكتمال الاعتماد · طُبعت في "+
              String(_now()||"").slice(0,16).replace("T"," ")
  });
  _emitPrint(html, "طباعة مسودة عقد", r.id);
}
function printDraft(){ printContractDraft(_rOpen); }


/* ════ المخرَجُ الورقيّ لأمر الدفع — سندُ الصرف ════   (طلبُ المالك)

   **لماذا ورقةٌ أصلاً وكلُّ شيءٍ على المنصّة؟** لأن أمر الدفع هو المستندُ الوحيدُ
   في المسار الذي **يخرج من المنصّة**: يُرفَق بالتحويل البنكيّ، ويُحفَظ في ملفّ
   المحاسبة، ويُطلَب في المراجعة الخارجية بعد سنة. فحتّى تُطبَع، كانت المالية
   تصوّر الشاشةَ — صورةٌ بلا رقمٍ ولا توقيعاتٍ ولا مبلغٍ كتابةً.

   **ثلاثةُ قراراتٍ تحكم هذه الورقة:**
   (١) **كلُّ أرقامها من دوالِّ الوحدة النقية** (`lineTotal`/`linesTotal`/`crqValueOf`)
       لا من حسابٍ محلّيّ — فما يُطبَع هو ما تراه الشاشةُ وما تحرسه الفحوص. حسبةٌ
       واحدةٌ هنا كانت ستجعل الورقةَ تكذب على الشاشة بلا أن يسقط فحص.
   (٢) **الورقةُ تعلن حالتَها بصراحة**: شريطٌ في رأسها من `payOrderPrintState`، فأمرٌ
       لم تكتمل بوّاباتُه يخرج موسوماً «غير صالحٍ للصرف» — والمنعُ من الطباعة كان
       سيُنتج صورةَ شاشةٍ بلا وسمٍ أصلاً.
   (٣) **الآيبانُ يُقنَّع على الورق كما يُقنَّع على الشاشة** (`canBank`): تسريبُ الحساب
       البنكيِّ في ورقةٍ تُصوَّر وتُرسَل أخطرُ من تسريبه في شاشةٍ تُغلَق. */
function printPayOrder(id){
  var r = requestById(id); if(!r) return _toast("⚠ الطلب غير موجود","warn");
  if(r.engagement !== "pay_order")
    return _toast("⚠ هذا المستند ليس أمرَ دفع — العقدُ يُطبَع من بطاقة العقد","warn");

  var v    = vendorById(r.vendorId), idn = v ? identityOf(v) : null;
  var t    = linesTotal(r.lines||[], r.vatMode);
  var val  = crqValueOf(r);
  var st   = payOrderPrintState(r);
  var sig  = payOrderSignoffs(r, ceoThreshold());
  var vm   = VAT_MODES[normVatMode(r.vatMode)] || {};
  var logo = _printLogo();
  var lh   = letterheadAssets(), lhOn = letterheadOn(lh);

  /* الآيبانُ بقاعدة الشاشة نفسِها — لا استثناءَ للورق */
  var ibanRaw   = (v && v.bank && v.bank.iban) || "";
  var ibanShown = canBank() ? (ibanRaw||"—") : (ibanRaw ? ("•••• "+String(ibanRaw).slice(-4)) : "—");

  var dt = function(s){ return String(s||"").slice(0,16).replace("T"," ") || "—"; };

  var lineRows=(r.lines||[]).map(function(l,i){
    var lt=lineTotal(l.qty,l.unitPrice,r.vatMode);
    return '<tr><td style="text-align:center">'+(i+1)+'</td>'+
      '<td style="text-align:right">'+_esc(l.desc||"—")+'</td>'+
      '<td style="text-align:center">'+_esc(l.unit||"—")+'</td>'+
      '<td style="text-align:center">'+money0(l.qty)+'</td>'+
      '<td style="text-align:center">'+money(l.unitPrice)+'</td>'+
      '<td style="text-align:center;font-weight:700">'+money(lt.total)+'</td></tr>';
  }).join("") || '<tr><td colspan="6" style="text-align:center;padding:14px">—</td></tr>';

  var vatRow = normVatMode(r.vatMode)==="none" ? "" :
    '<tr><td>ضريبة القيمة المضافة</td><td class="n">'+money(t.vat)+'</td></tr>';

  var sigCells = sig.map(function(g){
    return '<div class="sg">'+
      '<div class="sg-l">'+_esc(g.lbl)+'</div>'+
      '<div class="sg-n">'+(g.by?_esc(g.by):'<span class="sg-w">لم يوقّع بعد</span>')+'</div>'+
      '<div class="sg-d">'+(g.at?_esc(dt(g.at)):'—')+'</div>'+
      '<div class="sg-x">التوقيع</div></div>';
  }).join("");

  /* بيانُ السداد دفعةً دفعةً (طلبُ المالك) — الورقةُ التي تخرج للمحاسبة تحمل كلَّ
     دفعةٍ بمرجعها ومسجِّلها، وسطرَ المجموع والمتبقّي. والقديمُ بلا مصفوفةٍ يُقرأ
     من ملخّصه كدفعةٍ واحدة. */
  var _pl = Array.isArray(r.payments) && r.payments.length ? r.payments
          : (r.payment && r.payment.at ? [r.payment] : []);
  var _pt = crqPaidTotal(r), _pd = crqPayDue(r);
  /* خطةُ الصرف على الورقة نفسِها — المنشئُ حدّدها والمعتمِدون وقّعوا عليها،
     فتقرؤها المحاسبةُ والمراجعةُ من السند لا من الشاشة. تظهر ولو قبل أول دفعة. */
  var _plan = normPaymentPlan(r.paymentPlan);
  var planBox = _plan.length ? '<h2>خطةُ صرف الدفعات — حدّدها منشئ الطلب</h2>'+
    '<table class="kv">'+_plan.map(function(p,i){
      var _paidRow = i < _pl.length;
      return '<tr><td>الدفعة '+(i+1)+' — '+p+'٪</td><td class="n">'+
        money(r2(r2(Number(r.value)||0)*p/100))+' ر.س'+(_paidRow?' — سُدِّدت ✓':'')+'</td></tr>';
    }).join("")+'</table>' : "";
  var paidBox = _pl.length ? '<h2>بيانُ السداد</h2>'+
    '<table><thead><tr><th style="width:36px">#</th><th>المبلغ</th><th>مرجع التحويل</th><th>سجّله</th><th>التاريخ</th></tr></thead><tbody>'+
    _pl.map(function(p,i){
      return '<tr><td style="text-align:center;color:#64748b">'+(i+1)+'</td>'+
        '<td style="text-align:center;font-weight:700">'+money(p.amount)+' ر.س</td>'+
        '<td style="text-align:center">'+_esc(p.ref||"—")+'</td>'+
        '<td style="text-align:center">'+_esc(p.by||"—")+'</td>'+
        '<td style="text-align:center">'+_esc(dt(p.at))+'</td></tr>';
    }).join("")+'</tbody></table>'+
    '<table class="sum"><tr><td>المسدَّد</td><td class="n">'+money(_pt)+' ر.س</td></tr>'+
      (r.status==="crq_paid" ? '<tr><td>الحالة</td><td class="n">اكتمل السداد ✓</td></tr>'
        : '<tr><td>المتبقّي المستحقّ</td><td class="n">'+money(_pd)+' ر.س</td></tr>')+
    '</table>' : "";

  var html='<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">'+
  '<title>أمر دفع '+_esc(r.id)+'</title><style>'+
  '*{box-sizing:border-box}'+
  'body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;margin:0;padding:26px;color:#111827;direction:rtl;font-size:13px;line-height:1.9}'+
  '.header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1b3a6b;padding-bottom:12px}'+
  '.header-right{display:flex;align-items:center;gap:12px}'+
  '.company-logo{width:56px;height:56px;object-fit:contain}'+
  '.company{font-size:18px;font-weight:800}.subtitle{font-size:13px;color:#1b3a6b;font-weight:700}'+
  '.doc-no{background:#eef2f7;color:#1b3a6b;border-radius:8px;padding:8px 14px;font-weight:800;font-family:monospace}'+
  '.band{margin-top:14px;border-radius:8px;padding:9px 13px;font-weight:800;font-size:13px;border:2px solid}'+
  '.band .bn{display:block;font-weight:600;font-size:11.5px;margin-top:2px}'+
  '.band.ok{background:#ecfdf5;border-color:#059669;color:#065f46}'+
  '.band.warn{background:#fffbeb;border-color:#d97706;color:#92400e}'+
  '.band.bad{background:#fef2f2;border-color:#dc2626;color:#991b1b}'+
  'h2{font-size:15px;color:#1b3a6b;margin:20px 0 8px;border-bottom:1px solid #dde3ed;padding-bottom:5px;break-after:avoid;page-break-after:avoid}'+
  '.parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:10px}'+
  '.party{border:1px solid #dde3ed;border-radius:8px;padding:11px 13px}'+
  '.party .pl{font-size:11px;color:#64748b;font-weight:700;margin-bottom:4px}'+
  '.party .pn{font-size:14px;font-weight:800}'+
  '.party .pm{font-size:12px;color:#374151;margin-top:3px}'+
  'table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12.5px}'+
  'th{background:#1b3a6b;color:#fff;padding:8px;font-weight:700}'+
  'td{padding:7px 8px;border-bottom:1px solid #e5e7eb}'+
  'tbody tr:nth-child(even){background:#f8fafc}'+
  '.kv{width:100%;max-width:520px}.kv td{border-bottom:1px solid #eef2f7}'+
  '.kv td:first-child{width:150px;color:#64748b}'+
  /* الأرقامُ وحدَها بخطٍّ أحاديِّ العرض ومحاذاةٍ يسرى — والنصُّ يبقى نصّاً */
  '.kv .n{text-align:left;font-family:monospace;font-weight:700}'+
  '.kv .t{text-align:right;font-weight:700}'+
  '.sum{width:340px;margin-inline-start:auto;margin-top:10px}'+
  '.sum td{border-bottom:1px solid #eef2f7}.sum .n{text-align:left;font-family:monospace;font-weight:700}'+
  '.sum tr:last-child td{border-top:2px solid #1b3a6b;font-weight:800;font-size:14px}'+
  '.words{margin-top:10px;border:1px solid #1b3a6b;border-radius:8px;padding:10px 13px;background:#f8fafc;break-inside:avoid}'+
  '.words .wl{font-size:11px;color:#64748b;font-weight:700}'+
  '.words .wv{font-size:14px;font-weight:800;color:#1b3a6b}'+
  '.sign{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-top:34px;break-inside:avoid}'+
  '.sg{border:1px solid #dde3ed;border-radius:8px;padding:10px;min-height:104px;text-align:center}'+
  '.sg-l{font-size:11px;color:#64748b;font-weight:700}'+
  '.sg-n{font-size:12.5px;font-weight:800;margin-top:4px}'+
  '.sg-w{color:#b45309;font-weight:700}'+
  '.sg-d{font-size:11px;color:#64748b;font-family:monospace}'+
  '.sg-x{margin-top:26px;border-top:1px solid #9ca3af;padding-top:5px;font-size:11px;color:#374151}'+
  '.foot{margin-top:22px;font-size:10.5px;color:#94a3b8;text-align:center;border-top:1px solid #e5e7eb;padding-top:8px}'+
  '@media print{body{padding:14px}@page{margin:14mm;size:A4}}'+
  (lhOn?letterheadCSS():"")+
  '</style></head><body>'+

  letterheadWrap(
  docHeadHTML({ on:lhOn, logo:logo, docNo:r.id, subtitle:"أمر دفع — سند صرف" })+

  '<div class="band '+_esc(st.cls)+'">'+_esc(st.lbl)+
    (st.note?'<span class="bn">'+_esc(st.note)+'</span>':'')+'</div>'+

  '<h2>أطراف الصرف</h2><div class="parties">'+
    '<div class="party"><div class="pl">الجهة الصارفة</div>'+
      '<div class="pn">شركة المباني السريعة للمقاولات</div>'+
      '<div class="pm">المشروع: '+_esc(_projName(r))+'</div></div>'+
    '<div class="party"><div class="pl">المستفيد</div>'+
      '<div class="pn">'+_esc(r.vendorName||"—")+'</div>'+
      '<div class="pm">'+(idn&&idn.number?(_esc(idn.label)+": "+_esc(idn.number)):"—")+'</div>'+
      '<div class="pm">الآيبان: <span style="font-family:monospace" dir="ltr">'+_esc(ibanShown)+'</span>'+
        ((v&&v.bank&&v.bank.bankName)?(' — '+_esc(v.bank.bankName)):'')+'</div></div>'+
  '</div>'+

  '<h2>بيانات الأمر</h2><table class="kv">'+
    '<tr><td>موضوع الصرف</td><td class="t">'+_esc(r.title||"—")+'</td></tr>'+
    (r.scope?'<tr><td>الوصف</td><td class="t">'+_esc(r.scope)+'</td></tr>':'')+
    '<tr><td>تاريخ الإنشاء</td><td class="n">'+_esc(dt(r.createdAt))+'</td></tr>'+
    '<tr><td>أنشأه</td><td class="t">'+_esc(r.createdBy||"—")+'</td></tr>'+
    '<tr><td>وضع الضريبة</td><td class="t">'+_esc(vm.short||"—")+'</td></tr>'+
  '</table>'+

  '<h2>بنود الصرف</h2>'+
  '<table><thead><tr><th style="width:36px">#</th><th style="text-align:right">البند</th>'+
  '<th>الوحدة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>'+
  '<tbody>'+lineRows+'</tbody></table>'+
  '<table class="sum"><tr><td>الأساس</td><td class="n">'+money(t.base)+'</td></tr>'+
  vatRow+'<tr><td>المطلوب صرفه ('+_esc(vm.short||"")+')</td><td class="n">'+money(val)+' ر.س</td></tr></table>'+
  '<div class="words"><div class="wl">المبلغ كتابةً</div><div class="wv">'+_esc(amountWords(val))+'</div></div>'+

  planBox+
  paidBox+

  '<h2>الاعتمادات والتوقيعات</h2><div class="sign">'+sigCells+'</div>'+

  '<div class="foot">صدر هذا الأمر من نظام إدارة المشتريات — شركة المباني السريعة للمقاولات · '+
    _esc(r.id)+' · طُبع في '+_esc(dt(_now()))+'</div>'
  , lh)+
  '</body></html>';

  _emitPrint(html, "طباعة أمر دفع", r.id);
}
function printPay(){ printPayOrder(_rOpen); }


/* ════ المخرَجُ الورقيُّ للمستخلص — الورقةُ التي يوقّعها المقاول ════   (طلبُ المالك)

   **لماذا ورقةٌ للمستخلص وحدَه؟** لأنّه المستندُ الذي **يخرج إلى الطرف الآخر**:
   المقاولُ لا يرى شاشتَنا، ولا يوقّع على قاعدة بيانات. فحتّى تُطبَع كان الإقرارُ
   بالكميات والخصومات شفهياً — ثمّ يُنكَر عند أوّل خلاف.

   **وثلاثةُ قراراتٍ تحكمها** (بدرسِ سند صرف أمر الدفع نفسِه):
   (١) **كلُّ أرقامها من `extNet` وحدَها** — سلّمُ الحساب هنا هو سلّمُ الشاشة حرفياً،
       ولا حسبةَ واحدةً في الترميز. والمسدَّدُ يُطبَع من **لقطته المحفوظة** (`settled`)
       لا من حسابٍ جديد: ورقةُ ما مضى تُظهر ما صُرف فعلاً لا ما كان يُصرف اليوم.
   (٢) **تعلن حالتَها بصراحة** من `extPrintState`: نسخةُ مراجعةٍ قبل اكتمال الاعتماد،
       و«بانتظار توقيع المقاول» بعده، و«صالحٌ للسداد» متى وُقّع على هذا الصافي.
   (٣) **إقرارٌ منصوصٌ لا خانةُ توقيعٍ صامتة**: ما يوقّع عليه المقاولُ مكتوبٌ فوق
       توقيعه — الكمياتُ والخصوماتُ وأنّ الصافيَ كاملُ استحقاقه عن هذه الفترة. */
function extractPaperHTML(e, c, opt){
  var o=opt||{};
  var v=vendorById(c.vendorId), idn=v?identityOf(v):null;
  var calc=e.settled || extCalc(e, c);
  var st=extPrintState(e, calc.net);
  var sig=extSignoffs(e, calc.net, ceoThreshold());
  var sg=extSignature(e);
  var floor=prevCumByLine(_exts, c, e.id);
  var logo=_printLogo();
  var lh=letterheadAssets(), lhOn=letterheadOn(lh);
  var vm=VAT_MODES[normVatMode(c.vatMode)] || {};
  var dt=function(x){ return String(x||"").slice(0,16).replace("T"," ") || "—"; };

  var lineRows=(e.lines||[]).map(function(l,i){
    var max=contractLineQty(c, l.lineId), was=Number(floor[l.lineId])||0;
    var cum=Number(l.cumQty)||0;
    var val=r2(vatSplit(l.unitPrice, c.vatMode).base * cum);
    return '<tr><td style="text-align:center">'+(i+1)+'</td>'+
      '<td style="text-align:right">'+_esc(l.desc||"—")+'</td>'+
      '<td style="text-align:center">'+_esc(l.unit||"—")+'</td>'+
      '<td style="text-align:center">'+money0(max)+'</td>'+
      '<td style="text-align:center">'+money0(was)+'</td>'+
      '<td style="text-align:center;font-weight:700">'+money0(cum)+'</td>'+
      '<td style="text-align:center">'+(max>0?Math.round(cum/max*100):0)+'%</td>'+
      '<td style="text-align:center">'+money(l.unitPrice)+'</td>'+
      '<td style="text-align:center;font-weight:700">'+money(val)+'</td></tr>';
  }).join("") || '<tr><td colspan="9" style="text-align:center;padding:14px">—</td></tr>';

  /* سلّمُ الحساب ورقةً — **الصفوفُ نفسُها التي يرسمها `ladderHTML` على الشاشة**
     بالقاعدة نفسِها: خصمٌ قيمتُه صفرٌ لا يُطبَع. (وكان يُطبَع أوّلَ مرّة بحجّة أنّ
     الخصمَ الغائبَ خبر — فأكل خمسةَ صفوفٍ من ورقةٍ يريدها المالكُ صفحةً واحدة،
     وخالف الشاشةَ في الوقت نفسِه. والورقةُ والشاشةُ لا تختلفان في ما تعرضان.) */
  function rung(lbl, val, sign, cls){
    if(!cls && !val) return "";
    return '<tr'+(cls?' class="'+cls+'"':'')+'><td>'+(sign<0?'− ':(sign>0?'+ ':''))+_esc(lbl)+'</td>'+
      '<td class="n">'+money(val)+'</td></tr>';
  }
  var ladder='<table class="sum lad">'+
    rung("المنجَز التراكميّ منذ بداية العقد", calc.gross, 0, "")+
    /* «سابقاً» يُطبَع ولو كان صفراً — بدونه لا تُقرأ المعادلةُ (منجَزٌ − سابقاً = فترة) */
    rung("المستخلَص المعتمَد سابقاً", calc.prevGross, -1, "keep")+
    rung("أعمال الفترة", calc.period, 0, "mid")+
    (calc.mode==="none" ? "" : rung("ض.ق.م "+Math.round(VAT_RATE*100)+"٪ على أعمال الفترة", calc.vat, 1, "vat"))+
    rung("محتجز الضمان "+(Number((c.retention||{}).pct)||0)+"٪", calc.retention, -1, "")+
    rung(advanceRecoveryLabel(c), calc.advanceRecovery, -1, "")+
    rung("غرامة التأخير", calc.penalty, -1, "")+
    rung("مواد مصروفة له من مستودعنا", calc.materials, -1, "")+
    rung("خصم عدم مطابقة / جودة", calc.nonConformity, -1, "")+
    rung("صافي المستحق (ر.س)", calc.net, 0, "net")+
  '</table>';

  var sigCells=sig.map(function(g){
    return '<div class="sg">'+
      '<div class="sg-l">'+_esc(g.lbl)+'</div>'+
      '<div class="sg-n">'+(g.by?_esc(g.by):'<span class="sg-w">لم يعتمد بعد</span>')+'</div>'+
      '<div class="sg-d">'+(g.at?_esc(dt(g.at)):'—')+'</div>'+
      '<div class="sg-x">التوقيع</div></div>';
  }).join("");

  var signedNote = sg
    ? '<div class="note ok">نسخةٌ موقّعةٌ من المقاول مسجَّلةٌ على المنصّة — '+_esc(dt(sg.at))+
      ' · سجّلها '+_esc(sg.by||"—")+' · على صافي '+money(sg.net)+' ر.س'+
      (extSigValid(e, calc.net) ? '' : ' <b>(تغيّر الصافي بعدها — تلزم نسخةٌ جديدة)</b>')+'</div>'
    : "";

  var paidBox = (e.payment && e.payment.at) ? '<h2>بيانُ السداد</h2><table class="kv">'+
      '<tr><td>المبلغ المسدَّد</td><td class="n">'+money(e.payment.amount)+' ر.س</td></tr>'+
      '<tr><td>مرجع التحويل</td><td class="n">'+_esc(e.payment.ref||"—")+'</td></tr>'+
      '<tr><td>سجّله</td><td class="t">'+_esc(e.payment.by||"—")+'</td></tr>'+
      '<tr><td>تاريخ السداد</td><td class="n">'+_esc(dt(e.payment.at))+'</td></tr>'+
    '</table>' : "";

  var html='<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">'+
  '<title>مستخلص '+_esc(e.id)+'</title><style>'+
  '*{box-sizing:border-box}'+
  /* **الورقةُ مضغوطةٌ عمداً** (بلاغُ المالك: «صغّر البطاقات ليكون بندان صفحةً واحدة»).
     المستخلصُ ورقةُ عملٍ شهريةٌ تُوقَّع وتُصوَّر وتُرسَل — لا كرّاسةَ عقد. فالمقاساتُ
     هنا أضيقُ من ورقة العقد بمقدارٍ محسوب: ٣٫٥مم هامشُ صفحةٍ أقلّ · سطرٌ أقصرُ
     (1.5 بدل 1.9) · وحشواتُ الجداول والبطاقات إلى النصف تقريباً. */
  'body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;margin:0;padding:18px;color:#111827;direction:rtl;font-size:11.5px;line-height:1.5}'+
  '.header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1b3a6b;padding-bottom:8px}'+
  '.header-right{display:flex;align-items:center;gap:10px}'+
  '.company-logo{width:44px;height:44px;object-fit:contain}'+
  '.company{font-size:15px;font-weight:800}.subtitle{font-size:12px;color:#1b3a6b;font-weight:700}'+
  '.doc-no{background:#eef2f7;color:#1b3a6b;border-radius:7px;padding:5px 11px;font-weight:800;font-family:monospace;font-size:11.5px}'+
  '.band{margin-top:7px;border-radius:7px;padding:4px 9px;font-weight:800;font-size:11px;border:1.5px solid}'+
  '.band .bn{display:block;font-weight:600;font-size:10.5px;margin-top:1px}'+
  '.band.ok{background:#ecfdf5;border-color:#059669;color:#065f46}'+
  '.band.warn{background:#fffbeb;border-color:#d97706;color:#92400e}'+
  '.band.bad{background:#fef2f2;border-color:#dc2626;color:#991b1b}'+
  /* **العنوانُ لا يُفارق فقرتَه**: `break-after:avoid` يرحّل العنوانَ إلى الصفحة
     التالية مع أوّل سطرٍ من محتواه، بدل أن يبقى وحيداً في قاع الورقة. */
  'h2{font-size:12.5px;color:#1b3a6b;margin:8px 0 4px;border-bottom:1px solid #dde3ed;padding-bottom:3px;break-after:avoid;page-break-after:avoid}'+
  /* والكتلُ القصيرةُ لا تُشقّ أصلاً — أمّا جدولُ البنود فيُشقّ وترويسةُ أعمدته تتكرّر */
  '.parties,.kv,.meta,.calc,.lad,.words,.ack,.sign,.signs{break-inside:avoid}'+
  'thead{display:table-header-group}'+
  '.parties{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:7px}'+
  '.party{border:1px solid #dde3ed;border-radius:7px;padding:7px 9px}'+
  '.party .pl{font-size:10px;color:#64748b;font-weight:700;margin-bottom:2px}'+
  '.party .pn{font-size:12.5px;font-weight:800}'+
  '.party .pm{font-size:11px;color:#374151;margin-top:2px}'+
  'table{width:100%;border-collapse:collapse;margin-top:5px;font-size:11px}'+
  'th{background:#1b3a6b;color:#fff;padding:5px 4px;font-weight:700}'+
  'td{padding:3px 6px;border-bottom:1px solid #e5e7eb}'+
  'tbody tr:nth-child(even){background:#f8fafc}'+
  '.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:5px 8px;margin-top:6px}'+
  '.mf{border:1px solid #eef2f7;border-radius:6px;padding:3px 6px;background:#fbfdff;min-width:0}'+
  '.mf .ml{display:block;font-size:9.5px;color:#64748b;font-weight:700}'+
  '.mf .mv{display:block;font-size:11px;font-weight:800;overflow-wrap:anywhere}'+
  '.mf .ms{display:block;font-size:9.5px;color:#374151;margin-top:1px;overflow-wrap:anywhere}'+
  '.mf.w2{grid-column:span 2}'+
  '.calc{display:flex;gap:10px;align-items:flex-start;margin-top:5px}'+
  '.calc .words{flex:1;margin-top:0;align-self:stretch}'+
  '.calc .sum{margin-top:0}'+
  '.lad td{padding:2.5px 6px}'+
  '.kv{width:100%;max-width:470px}.kv td{border-bottom:1px solid #eef2f7}'+
  '.kv td:first-child{width:125px;color:#64748b}'+
  '.kv .n{text-align:left;font-family:monospace;font-weight:700}'+
  '.kv .t{text-align:right;font-weight:700}'+
  '.sum{width:355px;margin-inline-start:auto;margin-top:6px}'+
  '.sum td{border-bottom:1px solid #eef2f7}.sum .n{text-align:left;font-family:monospace;font-weight:700}'+
  '.lad tr.mid td{background:#f1f5f9;font-weight:800;border-top:1px solid #cbd5e1}'+
  '.lad tr.net td{border-top:2px solid #1b3a6b;font-weight:800;font-size:12.5px;background:#eef2f7}'+
  '.words{margin-top:7px;border:1px solid #1b3a6b;border-radius:7px;padding:6px 10px;background:#f8fafc}'+
  '.words .wl{font-size:10px;color:#64748b;font-weight:700}'+
  '.words .wv{font-size:12.5px;font-weight:800;color:#1b3a6b}'+
  '.note{margin-top:7px;border-radius:7px;padding:6px 10px;font-size:10.5px;border:1px solid}'+
  '.note.ok{background:#ecfdf5;border-color:#a7f3d0;color:#065f46}'+
  '.ack{border:1px solid #1b3a6b;border-radius:7px;padding:6px 8px;background:#f8fafc;font-size:10px;line-height:1.45;text-align:justify}'+
  '.ack .al{font-size:10px;color:#64748b;font-weight:700;margin-bottom:3px}'+
  /* **الإقرارُ والاعتماداتُ عمودان لا كتلتان**: الورقةُ شهريةٌ تُوقَّع وتُصوَّر،
     وكلُّ ٣٠مم تُوفَّر تعني بنداً إضافياً يبقى في الصفحة الأولى. */
  '.signs{display:grid;grid-template-columns:1.3fr 1fr;gap:9px;margin-top:5px;break-inside:avoid}'+
  '.sign{display:grid;grid-template-columns:repeat(auto-fit,minmax(84px,1fr));gap:7px;align-content:start}'+
  '.sg{border:1px solid #dde3ed;border-radius:7px;padding:6px 5px;min-height:58px;text-align:center}'+
  '.sg-l{font-size:10px;color:#64748b;font-weight:700}'+
  '.sg-n{font-size:11px;font-weight:800;margin-top:2px}'+
  '.sg-w{color:#b45309;font-weight:700}'+
  '.sg-d{font-size:10px;color:#64748b;font-family:monospace}'+
  '.sg-x{margin-top:14px;border-top:1px solid #9ca3af;padding-top:4px;font-size:10px;color:#374151}'+
  '.ctr-sign{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-top:12px;break-inside:avoid;font-size:11px}'+
  '.ctr-sign div{border-top:1px solid #9ca3af;padding-top:4px;text-align:center;color:#374151;min-height:30px}'+
  '.foot{margin-top:12px;font-size:9.5px;color:#94a3b8;text-align:center;border-top:1px solid #e5e7eb;padding-top:6px}'+
  '@media print{body{padding:8px}@page{margin:10mm;size:A4}}'+
  (lhOn?letterheadCSS():"")+
  '</style></head><body>'+

  letterheadWrap(
  docHeadHTML({ on:lhOn, logo:logo, docNo:e.id,
                subtitle:"مستخلص أعمال — "+(e.isFinal?"ختاميّ":"دوريّ") })+

  '<div class="band '+_esc(st.cls)+'">'+_esc(st.lbl)+
    (st.note?'<span class="bn">'+_esc(st.note)+'</span>':'')+'</div>'+

  '<h2>أطراف المستخلص وبياناته</h2>'+

  /* بياناتُ المستخلص **شبكةً لا جدولَ صفوف**: سبعةُ صفوفٍ كانت تأكل ٤٧مم من ورقةٍ
     ارتفاعُها ٢٢٢مم — ثلثَ الصفحة لسبع كلمات. والشبكةُ تعرضها في ١٤مم. */
  '<div class="meta">'+
    '<div class="mf w2"><span class="ml">مالك العمل</span>'+
      '<span class="mv">شركة المباني السريعة للمقاولات</span>'+
      '<span class="ms">المشروع: '+_esc(_projName(c))+'</span></div>'+
    '<div class="mf w2"><span class="ml">المقاول</span>'+
      '<span class="mv">'+_esc(c.vendorName||"—")+'</span>'+
      '<span class="ms">'+(idn&&idn.number?(_esc(idn.label)+": "+_esc(idn.number)):"—")+'</span></div>'+
    '<div class="mf"><span class="ml">رقم العقد</span><span class="mv">'+_esc(c.id||"—")+'</span></div>'+
    '<div class="mf"><span class="ml">قيمة العقد</span><span class="mv num">'+money(contractValue(c))+' ر.س</span></div>'+
    '<div class="mf"><span class="ml">الفترة</span><span class="mv">'+_esc(e.period||"—")+'</span></div>'+
    '<div class="mf"><span class="ml">نوع المستخلص</span><span class="mv">'+(e.isFinal?"ختاميّ — يُنهي العقد فنّياً":"دوريّ")+'</span></div>'+
    '<div class="mf"><span class="ml">تاريخ الإعداد</span><span class="mv num">'+_esc(dt(e.createdAt))+'</span></div>'+
    '<div class="mf"><span class="ml">أعدّه</span><span class="mv">'+_esc(e.createdBy||"—")+'</span></div>'+
    '<div class="mf"><span class="ml">وضع الضريبة</span><span class="mv">'+_esc(vm.short||"—")+'</span></div>'+
    '<div class="mf"><span class="ml">موضوع العقد</span><span class="mv">'+_esc(c.title||"—")+'</span></div>'+
  '</div>'+

  '<h2>الأعمال المنفَّذة — قياسٌ تراكميٌّ منذ بداية العقد</h2>'+
  '<table><thead><tr><th style="width:32px">#</th><th style="text-align:right">البند</th>'+
  '<th>الوحدة</th><th>كمية العقد</th><th>سبق اعتماده</th><th>المنفَّذ تراكمياً</th><th>%</th>'+
  '<th>سعر الوحدة</th><th>القيمة التراكمية</th></tr></thead>'+
  '<tbody>'+lineRows+'</tbody></table>'+

  '<h2>سُلَّم الحساب</h2>'+
  '<div class="calc">'+
    '<div class="words"><div class="wl">صافي المستحق كتابةً</div><div class="wv">'+_esc(amountWords(calc.net))+'</div></div>'+
    ladder+
  '</div>'+

  paidBox+

  '<h2>التوقيعات — إقرارُ المقاول والاعتماداتُ الداخلية</h2>'+
  '<div class="signs">'+
  '<div class="ack"><div class="al">إقرارُ المقاول — يُوقَّع منه أو ممّن يمثّله قانوناً</div>'+
    'أقرّ أنا الموقّع أدناه بأنّ الكميات المبيَّنة في هذا المستخلص مطابقةٌ لما نفّذتُه فعلاً '+
    'حتى تاريخه، وأنّني اطّلعتُ على الخصومات الواردة فيه ووافقتُ عليها، وأنّ صافي المستحق '+
    'المبيَّن أعلاه يمثّل كاملَ استحقاقي عن الأعمال المنفَّذة حتى تاريخ هذا المستخلص، '+
    'ولا مطالبةَ لي بغيره عنها.'+
    '<div class="ctr-sign"><div>اسم المقاول / الممثّل</div><div>التاريخ</div><div>التوقيع والختم</div></div>'+
  '</div>'+
  '<div class="sign">'+sigCells+'</div>'+
  '</div>'+
  signedNote+

  '<div class="foot">صدر هذا المستخلص من نظام إدارة المشتريات — شركة المباني السريعة للمقاولات · '+
    _esc(e.id)+' · عقد '+_esc(c.id||"")+' · طُبع في '+_esc(dt(_now()))+'</div>'
  , lh)+
  '</body></html>';

  return html;
}
function printExtract(id){
  var e=extractById(id); if(!e) return _toast("⚠ المستخلص غير موجود","warn");
  var c=contractById(e.contractId);
  if(!c) return _toast("⚠ عقد المستخلص غير محمَّل","warn");
  _emitPrint(extractPaperHTML(e, c, {}), "طباعة مستخلص", e.id);
}
function printExt(){ printExtract(_extOpen); }


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

/* ── سدادُ الدفعة المقدمة — صندوقُه على بطاقة العقد (نهجُ صندوق سداد أمر الدفع) ── */
function openAdvPay(){
  var c=contractById(_cOpen); if(!c) return;
  var el=document.getElementById("page-"+PAGE_CTRS); if(!el) return;
  var due=advanceDueOf(c);
  var old=document.getElementById("ct-advpay"); if(old) old.remove();
  var box=document.createElement("div");
  box.className="card ct-sec"; box.id="ct-advpay";
  box.innerHTML='<div class="ct-sec-h">'+_icn("banknote","ic-sm")+' تسجيل سداد الدفعة المقدمة</div>'+
    '<div class="ct-note">'+_icn("alertCircle","ic-sm")+' اكتب <b>المبلغَ المسدَّد فعلاً</b> — يجوز أقلُّ من دفعة العقد ولا يجوز أكثرُ من المتبقّي ('+money(due)+' ر.س)، ويجوز الإكمالُ لاحقاً على دفعات.</div>'+
    '<div class="ct-form-row">'+
      field("المبلغ المسدَّد فعلاً *", '<input class="form-input num" id="ct-adv-amt" type="number" step="any" min="0" value="'+_esc(due)+'">')+
      field("مرجع التحويل", '<input class="form-input" id="ct-adv-ref" placeholder="رقم العملية">')+
    '</div>'+
    '<div class="ct-form-row">'+
      field("إيصال السداد * (صورة أو PDF)", '<input type="file" class="form-input ct-file" id="ct-adv-file" accept="image/*,application/pdf">')+
      '<div></div>'+
    '</div>'+
    '<div class="ct-save-bar" style="position:static">'+
      '<button class="btn btn-ghost btn-sm" onclick="contracts.closeAdvPay()">إلغاء</button>'+
      '<button class="btn btn-success btn-sm" id="ct-adv-btn" onclick="contracts.doAdvPay()">'+_icn("save","ic-sm")+' تسجيل السداد</button>'+
    '</div>';
  el.insertBefore(box, el.children[2]||null);
  box.scrollIntoView({behavior:"smooth",block:"center"});
}
function closeAdvPay(){ var b=document.getElementById("ct-advpay"); if(b) b.remove(); }
function doAdvPay(){
  var c=contractById(_cOpen); if(!c) return;
  var f=(document.getElementById("ct-adv-file")||{}).files;
  if(!f||!f[0]){ _toast("⚠ إيصال السداد إلزامي","warn"); return; }
  var amt=Number((document.getElementById("ct-adv-amt")||{}).value)||0;
  var ref=String((document.getElementById("ct-adv-ref")||{}).value||"").trim();
  var btn=document.getElementById("ct-adv-btn"); if(btn){ btn.disabled=true; btn.textContent="جارٍ الرفع…"; }
  uploadVendorDoc(c.id, f[0], "adv_receipt").then(function(att){
    if(!att||!att.url) throw new Error("تعذّر رفع الإيصال");
    return payAdvance(c.id, { amount:amt, ref:ref, receiptUrl:att.url });
  }).then(function(cc){
    closeAdvPay(); paintCtrs();
    var left=advanceDueOf(cc);
    _toast(left>0 ? "✅ سُجِّل سداد "+money(amt)+" ر.س — المتبقّي "+money(left)+" ر.س" : "✅ سُدِّدت الدفعة المقدمة","success");
  }).catch(function(e){
    console.warn("contracts/doAdvPay",e);
    if(btn){ btn.disabled=false; btn.innerHTML=_icn("save","ic-sm")+" تسجيل السداد"; }
    _toast("⚠ "+_errMsg(e)+" — لا يُسجَّل سدادٌ بلا إيصال","warn");
  });
}

/* ── تصحيحُ قيدِ سدادِ المقدمة — إلغاءٌ بسببٍ ثم إعادةُ تسجيلٍ بالمبلغ الصحيح ──
   بعد الإلغاء يُفتح صندوقُ السداد تلقائياً ما دامت الدفعةُ مستحقّةً: الخطأُ في
   الرقم لا في وجودِ السداد، فمَن جاء ليصحّح يحتاج أن يكتب الصحيحَ في النفَس نفسِه. */
function openAdvVoid(i){
  var c=contractById(_cOpen); if(!c) return;
  var idx=Number(i);
  var p=(Array.isArray((c.advance||{}).payments)?(c.advance||{}).payments:[])[idx];
  if(!p) return _toast("⚠ قيد السداد غير موجود","warn");
  if(["finance","admin"].indexOf(_role())===-1) return _toast("⚠ إلغاء قيد السداد للمالية فقط","warn");
  if(!advVoidable(c,p))
    return _toast("⚠ لا يُلغى هذا القيد — استُردّ من المستخلصات "+money(advanceRecoveredOf(c))+" ر.س","warn");
  var el=document.getElementById("page-"+PAGE_CTRS); if(!el) return;
  closeAdvPay();
  var old=document.getElementById("ct-advvoid"); if(old) old.remove();
  var box=document.createElement("div");
  box.className="card ct-sec"; box.id="ct-advvoid";
  box.dataset.idx=String(idx); box.dataset.at=String(p.at||"");
  box.innerHTML='<div class="ct-sec-h">'+_icn("rotateCcw","ic-sm")+' تصحيح قيد سداد الدفعة المقدمة</div>'+
    '<div class="ct-note warn">'+_icn("alertCircle","ic-sm")+' سيُلغى قيدُ <b class="num">'+money(p.amount)+'</b> ر.س'+
      (p.ref?' (<span class="num">'+_esc(p.ref)+'</span>)':'')+' المسجَّلُ في '+
      _esc(String(p.at||"").slice(0,16).replace("T"," "))+'. <b>القيدُ لا يُمحى</b> — يبقى في السجل مشطوباً بسببِه، '+
      'ويعود المبلغُ مستحقّاً فتسجّل السدادَ الصحيح بإيصالِه.</div>'+
    '<div class="ct-form-row">'+
      field("سبب الإلغاء <b>(إلزاميّ)</b>", '<input class="form-input" id="ct-advv-why" placeholder="مثال: أُدخل المبلغ خطأً — الصحيح 7,000 ر.س">')+
      '<div></div>'+
    '</div>'+
    '<div class="ct-save-bar" style="position:static">'+
      '<button class="btn btn-ghost btn-sm" onclick="contracts.closeAdvVoid()">تراجع</button>'+
      '<button class="btn btn-danger btn-sm" id="ct-advv-btn" onclick="contracts.doAdvVoid()">'+_icn("rotateCcw","ic-sm")+' إلغاء القيد</button>'+
    '</div>';
  el.insertBefore(box, el.children[2]||null);
  box.scrollIntoView({behavior:"smooth",block:"center"});
}
function closeAdvVoid(){ var b=document.getElementById("ct-advvoid"); if(b) b.remove(); }
function doAdvVoid(){
  var c=contractById(_cOpen); if(!c) return;
  var box=document.getElementById("ct-advvoid"); if(!box) return;
  var why=String((document.getElementById("ct-advv-why")||{}).value||"").trim();
  if(!why){ _toast("⚠ سبب الإلغاء إلزامي — يبقى في السجل","warn"); return; }
  var btn=document.getElementById("ct-advv-btn"); if(btn){ btn.disabled=true; btn.textContent="جارٍ الإلغاء…"; }
  voidAdvancePayment(c.id, { index:Number(box.dataset.idx), at:box.dataset.at, reason:why })
  .then(function(cc){
    closeAdvVoid(); paintCtrs();
    _toast("✅ أُلغي القيد — المتبقّي "+money(advanceDueOf(cc))+" ر.س، سجِّل السداد الصحيح","success");
    if(advancePayable(cc) && ["finance","admin"].indexOf(_role())!==-1) openAdvPay();
  }).catch(function(e){
    console.warn("contracts/doAdvVoid",e);
    if(btn){ btn.disabled=false; btn.innerHTML=_icn("rotateCcw","ic-sm")+" إلغاء القيد"; }
    _toast("⚠ "+_errMsg(e),"warn");
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
    materialsIssued:0, penaltyAmount:0, ncDeduction:0, attachFiles:[],
    lines:(c.lines||[]).map(function(l){
      return { lineId:l.id, desc:l.desc||"", unit:l.unit||"", unitPrice:Number(l.unitPrice)||0,
               cumQty: Number(floor[l.id])||0 };
    }) };
  paintCtrs();
}
/* فتحُ مستخلصٍ قائمٍ في **النموذج نفسِه** — لا نموذجَ تحريرٍ ثانٍ يفترق عنه عند
   أوّل تعديلٍ على أيّهما (درسُ `contractPaperHTML` للعقد ومسودّته). */
function openExtEdit(){
  var e=extractById(_extOpen), c=contractById(_cOpen); if(!e||!c) return;
  if(["project_manager","admin"].indexOf(_role())===-1) return _toast("⚠ تعديلُ المستخلص لمدير المشروع أو الأدمن","warn");
  if(extIsFinal(e.status)) return _toast("⚠ المستخلصُ في حالةٍ نهائية — لا يُعدَّل","warn");
  _extDraft={ editOf:e.id, id:e.id, contractId:c.id, period:e.period||"", isFinal:!!e.isFinal,
    reason:"",
    materialsIssued:Number(e.materialsIssued)||0, penaltyAmount:Number(e.penaltyAmount)||0,
    ncDeduction:Number(e.ncDeduction)||0,
    lines:(e.lines||[]).map(function(l){
      return { lineId:l.lineId, desc:l.desc||"", unit:l.unit||"",
               unitPrice:Number(l.unitPrice)||0, cumQty:Number(l.cumQty)||0 };
    }) };
  _extOpen=null; paintCtrs();
}
function cancelExtract(){
  var back=_extDraft && _extDraft.editOf;
  _extDraft=null; if(back) _extOpen=back;
  paintCtrs();
}
function openExt(id){ _extOpen=id; _extDraft=null; paintCtrs(); }
function backToExts(){ _extOpen=null; paintCtrs(); }

function syncExtDraft(){
  if(!_extDraft) return;
  var d=_extDraft;
  function n(id){ var e=document.getElementById(id); return e?(Number(e.value)||0):0; }
  var p=document.getElementById("ct-e-period"); if(p) d.period=String(p.value||"").trim();
  var f=document.getElementById("ct-e-final"); if(f) d.isFinal = f.value==="1";
  var w=document.getElementById("ct-e-why"); if(w) d.reason=String(w.value||"").trim();
  if(document.getElementById("ct-e-pen")) d.penaltyAmount=n("ct-e-pen");
  if(document.getElementById("ct-e-mat")) d.materialsIssued=n("ct-e-mat");
  if(document.getElementById("ct-e-nc"))  d.ncDeduction=n("ct-e-nc");
  var t=document.getElementById("ct-e-lines");
  /* **الكميةُ وحدَها تُقرأ** — لا كلُّ ما يحمل `data-ef`. فحقلُ النسبة يشاركها
     الصفَّ والفهرس، ولو قُرئ الاثنان لكتب الثاني قيمتَه في الكمية (وهو ما وقع
     فعلاً: صار «٥٠٪» كميةً فسقط حارسُ تجاوز العقد بلا أن يظهر خطأ). والنسبةُ
     مُدخَلٌ يُترجَم في `extRecalc` ثمّ يُنسى — لا تُخزَّن ولا تُقرأ هنا. */
  if(t) t.querySelectorAll('[data-ef="cumQty"]').forEach(function(inp){
    var i=parseInt(inp.dataset.i,10);
    if(d.lines[i]) d.lines[i].cumQty=Number(inp.value)||0;
  });
}
/* إعادةُ رسم السلّم وحدَه — فلا يقفز مؤشّرُ الكتابة أثناء الإدخال. */
/* إعادةُ الحساب الحيّة — وفيها **الكميةُ والنسبةُ وجهان لرقمٍ واحد**.

   بلاغُ المالك: «لا توجد نِسَبُ تنفيذٍ في المستخلص عند إنشائه». وكانت النسبةُ
   **تُعرَض ولا تُكتَب**: يُدخِل المُعِدُّ كميةً فتُحسب النسبةُ عرَضاً. وهذا يقلب عُرفَ
   المقاولات: البندُ بالمقطوعية (كميتُه ١) إنجازُه **٣٥٪** لا «٠٫٣٥ مقطوعية»، وبندُ
   المتر الطوليّ يُتابَع أسبوعياً بنسبته.

   **والمخزَّنُ كميةٌ لا نسبة** — بها يُحسب السلّمُ وتُقاس ضدّ العقد. فالنسبةُ مُدخَلٌ
   يُشتقّ منه فوراً (`qty = كميةُ العقد × النسبة`)، ثمّ يُنسى: مصدرُ حقيقةٍ واحدٌ
   ورقمان يقودان إليه. و`from` تقول أيُّهما كتب المستخدمُ الآن، فلا يُعاد كتابةُ
   الحقل الذي بين يديه فيقفز مؤشّرُه. */
function extRecalc(from, i){
  var c=contractById(_cOpen); if(!c||!_extDraft) return;
  /* النسبةُ تُترجَم إلى كميةٍ **قبل** المزامنة — فما يُقرأ إلى المسوّدة كميةٌ دائماً */
  if(from==="p"){
    var pIn=document.querySelector('#ct-e-lines input[data-ef="pct"][data-i="'+i+'"]');
    var qIn=document.querySelector('#ct-e-lines input[data-ef="cumQty"][data-i="'+i+'"]');
    var ln=_extDraft.lines[i];
    if(pIn && qIn && ln){
      var pv=Number(pIn.value); if(!isFinite(pv)) pv=0;
      qIn.value = r2(contractLineQty(c, ln.lineId) * pv / 100);
    }
  }
  syncExtDraft();
  var xid=_extDraft.editOf||null;
  var ctx={ prevGross:prevGrossOf(_exts,c,xid), materialsIssued:_extDraft.materialsIssued,
            penaltyAmount:_extDraft.penaltyAmount, ncDeduction:_extDraft.ncDeduction };
  var box=document.getElementById("ct-e-ladder");
  if(box) box.innerHTML=ladderHTML(extNet(_extDraft,c,ctx), c);
  var g=extCumGuard(_extDraft,c,_exts);
  var btn=document.getElementById("ct-e-send");
  if(btn) btn.disabled = !g.ok || (!!_extDraft.editOf && !_extDraft.reason);
  // التحذيرُ يُحدَّث مع الإدخال لا عند إعادة الرسم الكاملة — زرٌّ معطَّلٌ بلا سببٍ ظاهر
  // يترك المستخدمَ عالقاً لا يعرف ماذا يصلح.
  var wbox=document.getElementById("ct-e-warn");
  if(wbox) wbox.innerHTML = g.ok ? "" : '<div class="ct-note crit">'+_icn("alertTriangle","ic-sm")+' '+_esc(_guardMsg(g))+'</div>';
  // خلايا «%» و«القيمة» تُحدَّث مع الإدخال أيضاً — وإلا بقيت صفراً بينما السلّم يتغيّر
  var floor=prevCumByLine(_exts,c,xid);
  var lt=document.getElementById("ct-e-lines");
  if(lt) lt.querySelectorAll("tbody tr").forEach(function(tr,idx){
    var l=_extDraft.lines[idx]; if(!l) return;
    var cum=Number(l.cumQty)||0, max=contractLineQty(c,l.lineId), was=Number(floor[l.lineId])||0;
    tr.classList.toggle("ct-bad", cum>max+1e-9 || cum<was-1e-9);
    // بصنف الخليّة لا بفهرسها — نفسُ سبب `ct-g-after`/`ct-g-delta` أعلاه
    var elP=tr.querySelector(".ct-e-pct"), elV=tr.querySelector(".ct-e-val");
    // ولا يُكتَب في الحقل الذي يكتب فيه المستخدمُ الآن — وإلا قفز مؤشّرُه وهو يُدخِل
    if(elP && !(from==="p" && idx===i)) elP.value = max>0 ? r2(cum/max*100) : 0;
    if(elV) elV.textContent = money(r2(vatSplit(l.unitPrice,c.vatMode).base*cum));
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
  var edit=d.editOf||null;
  if(edit && !d.reason){ _toast("⚠ سبب التعديل إلزامي","warn"); return; }
  var btn=document.getElementById("ct-e-send"); if(btn){ btn.disabled=true; btn.textContent=edit?"جارٍ الحفظ…":"جارٍ الإرسال…"; }
  var files=edit?[]:(d.attachFiles||[]).slice();
  var job = edit ? editExtract(edit, d, d.reason).then(function(){ return edit; })
                 : createExtract(c, d);
  job.then(function(id){
    /* المرفقاتُ بعد الإنشاء (نهجُ الطلب): فشلُ رفعِ ملفٍّ لا يُسقط مستخلصاً أُنشئ
       فعلاً — يُقال صراحةً ويبقى بابُ الإضافة من البطاقة مفتوحاً. */
    var failed=0;
    var up = !files.length ? Promise.resolve() :
      Promise.all(files.map(function(f){
        return uploadVendorDoc(id, f, "attachment")
          .catch(function(e){ console.warn("contracts/extAttachUpload", e); failed++; return null; });
      })).then(function(atts){
        var ok=atts.filter(Boolean);
        return ok.length ? addExtAttachments(id, ok).catch(function(e){
          console.warn("contracts/extAttachSave", e); failed+=ok.length;
        }) : null;
      });
    return Promise.resolve(up).then(function(){
      _extDraft=null; _extOpen=id; paintCtrs();
      if(failed) _toast("⚠ أُرسل المستخلص "+id+" لكن تعذّر رفع "+failed+" مرفق — أضِفه من بطاقة المستخلص","warn");
      else _toast(edit ? "✅ حُفظ التعديل — عاد المستخلصُ للاعتماد" : ("✅ أُرسل المستخلص "+id),"success");
    });
  }).catch(function(e){
    console.warn("contracts/submitExtract",e);
    if(btn){ btn.disabled=false; btn.innerHTML=_icn(edit?"save":"send","ic-sm")+(edit?" حفظ التعديل":" إرسال للاعتماد"); }
    _toast("⚠ "+(e&&e.message?e.message:"تعذّر الحفظ"),"warn");
  });
}

/* ── مرفقاتُ مسوّدة المستخلص: ملفاتٌ تُمسَك في الذاكرة حتى الإرسال (نهجُ الطلب) ── */
function addExtDraftAttach(inp){
  syncExtDraft(); if(!_extDraft) return;
  var fs=inp&&inp.files?Array.prototype.slice.call(inp.files):[];
  if(!fs.length) return;
  if(!Array.isArray(_extDraft.attachFiles)) _extDraft.attachFiles=[];
  var dropped=0;
  fs.forEach(function(f){
    if((f.size||0) > ATTACH_MAX_MB*1024*1024){ dropped++; return; }
    _extDraft.attachFiles.push(f);
  });
  if(dropped) _toast("⚠ "+dropped+" ملفاً تجاوز "+ATTACH_MAX_MB+" م.ب فأُسقط","warn");
  paintCtrs();
}
function delExtDraftAttach(i){ syncExtDraft(); if(!_extDraft) return; (_extDraft.attachFiles||[]).splice(i,1); paintCtrs(); }

/* ── إضافةُ مرفقٍ من بطاقة المستخلص وحذفُه — نمطُ بطاقة الطلب نفسُه ── */
var _extAttBusy=false;
function pickExtAttach(inp){
  var e=extractById(_extOpen); if(!e) return;
  var f=inp&&inp.files&&inp.files[0]; if(!f) return;
  if(_extAttBusy) return;
  if((f.size||0) > ATTACH_MAX_MB*1024*1024){ _toast("⚠ حجم المرفق يتجاوز "+ATTACH_MAX_MB+" م.ب","warn"); inp.value=""; return; }
  _extAttBusy=true;
  var btn=document.getElementById("ct-x-attbtn"); if(btn){ btn.disabled=true; btn.textContent="جارٍ الرفع…"; }
  uploadVendorDoc(e.id, f, "attachment").then(function(att){
    return addExtAttachments(e.id, [att]);
  }).then(function(){
    _extAttBusy=false; _toast("✅ أُضيف المرفق","success"); paintCtrs();
  }).catch(function(err){
    _extAttBusy=false;
    console.warn("contracts/pickExtAttach", err);
    _toast("⚠ تعذّر رفع المرفق — "+_errMsg(err),"warn");
    paintCtrs();
  });
}
function delExtAttach(attId){
  var e=extractById(_extOpen); if(!e) return;
  var att=(e.attachments||[]).find(function(a){ return a && a.id===attId; }); if(!att) return;
  Promise.resolve(_confirm({ kind:"danger", icon:"🗑", okText:"حذف",
    title:"حذف المرفق",
    msg:'سيُحذف المرفق «'+(att.name||"مرفق")+'» من المستخلص. يبقى الحذفُ مسجّلاً في السجل الزمني.'
  })).then(function(ok){
    if(!ok) return;
    return deleteExtAttachment(e.id, attId).then(function(){ _toast("✅ حُذف المرفق","success"); paintCtrs(); });
  }).catch(function(err){ _toast("⚠ "+_errMsg(err),"warn"); });
}

function extAct(action){
  var e=extractById(_extOpen); if(!e) return;
  var isRej=action==="reject";
  Promise.resolve(_confirm({ kind:isRej?"reject":"approve",
    title:isRej?"رفض / إعادة المستخلص":"اعتماد المستخلص",
    msg:isRej?"سيعود المستخلص لمُعِدّه للتصحيح.":"اعتماد المستخلص "+e.id+"؟",
    /* ملاحظةُ المعتمِد (طلبُ المالك) — اختياريةٌ، تُقيَّد في السجل الزمنيّ للمستخلص
       مع بوّابة الاعتماد (النهجُ نفسُه الذي في اعتماد الطلب v18.9xi). */
    input: isRej ? null : { label:"ملاحظة / تعليق (اختياري)",
                            placeholder:"تُقيَّد في سجلّ المستخلص مع الاعتماد" }
  })).then(function(ok){
    if(!ok) return;
    var note = (!isRej && ok && ok.value) ? String(ok.value).trim() : "";
    if(isRej){ note=(window.prompt("سبب الرفض (إلزامي):")||"").trim(); if(!note){ _toast("⚠ السبب إلزامي","warn"); return; } }
    return actOnExtract(_extOpen, action, note).then(function(){ paintCtrs(); _toast(isRej?"✅ أُعيد":"✅ اعتُمد","success"); });
  }).catch(function(err){ _toast("⚠ "+(err&&err.message?err.message:"تعذّر الإجراء"),"warn"); });
}
/* صندوقا الإرجاع للمستخلص وأمر التغيير — بنيةٌ واحدةٌ ونصٌّ واحد، والوجهاتُ
   مشتقّةٌ من المستند نفسِه كما في الطلب. */
function _rewindBoxHTML(title, targets, statusOf, gates, closeFn, saveFn){
  var opts=targets.map(function(k){
    var st=statusOf[k];
    return '<option value="'+_esc(k)+'">'+_esc((gates[st]||{}).lbl||st)+'</option>';
  }).join("");
  return '<div class="ct-sec-h">'+_icn("rotateCcw","ic-sm")+' '+_esc(title)+'</div>'+
    '<div class="ct-note">'+_icn("shield","ic-sm")+
      ' ستسقط اعتماداتُ المرحلة المختارة <strong>وما بعدها</strong> ويعود المستند إليها. '+
      'ولا يمسّ ذلك أرقامَه ولا خطَّه الزمنيّ — والإرجاعُ نفسُه يُسجَّل فيه.</div>'+
    '<div class="ct-form-row">'+
      field("المرحلة", '<select class="form-input" id="ct-rw2-gate">'+opts+'</select>')+
      field("سبب الإرجاع *", '<input class="form-input" id="ct-rw2-why" placeholder="لماذا يُعاد الاعتماد؟">')+
    '</div>'+
    '<div class="ct-save-bar" style="position:static">'+
      '<button class="btn btn-ghost btn-sm" onclick="'+closeFn+'">إلغاء</button>'+
      '<button class="btn btn-primary btn-sm" id="ct-rw2-btn" onclick="'+saveFn+'">'+_icn("rotateCcw","ic-sm")+' إرجاع</button>'+
    '</div>';
}
function _mountRewindBox(html){
  var el=document.getElementById("page-"+PAGE_CTRS); if(!el) return;
  var old=document.getElementById("ct-rw2"); if(old) old.remove();
  var box=document.createElement("div");
  box.className="card ct-sec"; box.id="ct-rw2"; box.innerHTML=html;
  el.insertBefore(box, el.children[2]||null);
  box.scrollIntoView({behavior:"smooth",block:"center"});
}
function closeDocRewind(){ var b=document.getElementById("ct-rw2"); if(b) b.remove(); }
function _readRewindBox(){
  var g=document.getElementById("ct-rw2-gate"), w=document.getElementById("ct-rw2-why");
  return { gate:g?g.value:"", why:(w?w.value:"").trim(), whyEl:w,
           btn:document.getElementById("ct-rw2-btn") };
}
function openExtRewind(){
  var e=extractById(_extOpen), c=contractById(_cOpen); if(!e||!c) return;
  var targets=extRewindTargets(e, r2(extCalc(e,c).net), ceoThreshold());
  if(!targets.length) return _toast("⚠ لا توجد مرحلةٌ سابقةٌ يُرجَع إليها هذا المستخلص","warn");
  _mountRewindBox(_rewindBoxHTML("إرجاع المستخلص "+e.id+" إلى مرحلة", targets, EXT_STATUS_OF, EXT_GATES,
    "contracts.closeDocRewind()", "contracts.doExtRewind()"));
}
function doExtRewind(){
  var f=_readRewindBox();
  if(!f.why){ _toast("⚠ سبب الإرجاع إلزامي","warn"); if(f.whyEl) f.whyEl.focus(); return; }
  if(f.btn) f.btn.disabled=true;
  rewindExtract(_extOpen, f.gate, f.why).then(function(e){
    closeDocRewind(); paintCtrs(); _toast("✅ أُرجع المستخلص إلى "+(EXT_STATUS[e.status]||e.status),"success");
  }).catch(function(err){
    if(f.btn) f.btn.disabled=false;
    _toast("⚠ "+_errMsg(err),"warn");
  });
}
function openChgRewind(){
  var g=changeById(_chgOpen); if(!g) return;
  var targets=chgRewindTargets(g, ceoThreshold());
  if(!targets.length) return _toast("⚠ لا توجد مرحلةٌ سابقةٌ يُرجَع إليها هذا الأمر","warn");
  _mountRewindBox(_rewindBoxHTML("إرجاع أمر التغيير "+g.id+" إلى مرحلة", targets, CHG_STATUS_OF, CHG_GATES,
    "contracts.closeDocRewind()", "contracts.doChgRewind()"));
}
function doChgRewind(){
  var f=_readRewindBox();
  if(!f.why){ _toast("⚠ سبب الإرجاع إلزامي","warn"); if(f.whyEl) f.whyEl.focus(); return; }
  if(f.btn) f.btn.disabled=true;
  rewindChange(_chgOpen, f.gate, f.why).then(function(g){
    closeDocRewind(); paintCtrs(); _toast("✅ أُرجع أمرُ التغيير إلى "+(CHG_STATUS[g.status]||g.status),"success");
  }).catch(function(err){
    if(f.btn) f.btn.disabled=false;
    _toast("⚠ "+_errMsg(err),"warn");
  });
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

/* ── رفعُ نسخة المستخلص موقّعةً من المقاول — بنيةُ صندوق توقيع العقد نفسُها ── */
function openExtSign(){
  var e=extractById(_extOpen), c=contractById(_cOpen); if(!e||!c) return;
  var calc=e.settled || extCalc(e,c);
  var el=document.getElementById("page-"+PAGE_CTRS); if(!el) return;
  var old=document.getElementById("ct-esign"); if(old) old.remove();
  var box=document.createElement("div");
  box.className="card ct-sec"; box.id="ct-esign";
  box.innerHTML='<div class="ct-sec-h">'+_icn("save","ic-sm")+' رفع نسخة '+_esc(e.id)+' موقّعةً من المقاول</div>'+
    '<div class="ct-note">'+_icn("alertCircle","ic-sm")+' يوقّع المقاولُ على صافي <b>'+money(calc.net)+' ر.س</b> إقراراً بالكميات والخصومات — '+
      'ويُحفَظ الرقمُ مع النسخة، فإن تغيّر بعده لزمت نسخةٌ جديدة.</div>'+
    '<div class="ct-form-row">'+
      field("صورة المستخلص الموقَّع * (صورة أو PDF)", '<input type="file" class="form-input ct-file" id="ct-es-file" accept="image/*,application/pdf">')+
      '<div></div>'+
    '</div>'+
    '<div class="ct-save-bar" style="position:static">'+
      '<button class="btn btn-ghost btn-sm" onclick="contracts.closeExtSign()">إلغاء</button>'+
      '<button class="btn btn-success btn-sm" id="ct-es-btn" onclick="contracts.doExtSign()">'+_icn("checkCircle","ic-sm")+' حفظ النسخة الموقّعة</button>'+
    '</div>';
  el.insertBefore(box, el.children[2]||null);
  box.scrollIntoView({behavior:"smooth",block:"center"});
}
function closeExtSign(){ var b=document.getElementById("ct-esign"); if(b) b.remove(); }
function doExtSign(){
  var e=extractById(_extOpen); if(!e) return;
  var f=(document.getElementById("ct-es-file")||{}).files;
  if(!f||!f[0]){ _toast("⚠ نسخةُ المستخلص الموقّعة إلزامية","warn"); return; }
  var btn=document.getElementById("ct-es-btn"); if(btn){ btn.disabled=true; btn.textContent="جارٍ الرفع…"; }
  uploadVendorDoc(e.id, f[0], "ext_signed").then(function(att){
    if(!att||!att.url) throw new Error("تعذّر رفع النسخة الموقّعة");
    return signExtract(e.id, att);
  }).then(function(){
    closeExtSign(); paintCtrs(); _toast("✅ حُفظت النسخة الموقّعة — صار المستخلصُ صالحاً للسداد","success");
  }).catch(function(err){
    console.warn("contracts/doExtSign",err);
    if(btn){ btn.disabled=false; btn.innerHTML=_icn("checkCircle","ic-sm")+" حفظ النسخة الموقّعة"; }
    _toast("⚠ "+(err&&err.message?err.message:"تعذّر الحفظ")+" — لا سدادَ بلا نسخةٍ موقّعة","warn");
  });
}

/* زرُّ «إنشاء العقد» على بطاقة الطلب المعتمَد. */
function makeContract(){
  var r=requestById(_rOpen); if(!r) return;
  Promise.resolve(_confirm({
    kind:"approve", icon:"📄", okText:"إنشاء العقد",
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
/* v18.9ub: سطرُ القيمة داخل بطاقةِ مجموعتها — «قيمتها» بلا مرجعٍ تُقرأ إجمالياً عاماً */
".ct-stat .s{font-size:10px;color:var(--muted);font-weight:700;font-variant-numeric:tabular-nums}",
/* بطاقاتُ الشريط أزرارٌ تصفّي القائمة — زرٌّ حقيقيّ لا div بمستمع (لوحةُ المفاتيح) */
".ct-stat-btn{font:inherit;text-align:start;cursor:pointer;transition:transform .12s,box-shadow .12s,border-color .12s}",
".ct-stat-btn:hover{transform:translateY(-1px);border-color:var(--primary);box-shadow:0 4px 12px rgba(0,0,0,.10)}",
".ct-stat-btn:focus-visible{outline:2px solid var(--primary);outline-offset:2px}",
".ct-stat-btn.is-on{border-color:var(--primary);background:var(--surface2);box-shadow:inset 0 0 0 1px var(--primary)}",
/* المرشّحات */
".ct-filters{display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;margin-bottom:14px}",
".ct-scope{font-size:11.5px;color:var(--muted);font-weight:700;margin:-6px 0 12px}",
/* شريطُ نسبة سداد أمر الدفع — توكنزُ SLA نفسُها: برتقاليٌّ ما دام مفتوحاً وأخضرُ عند الاكتمال */
".ct-payprog{display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:9px 12px;margin-bottom:12px;font-size:12px;font-weight:700;color:var(--text)}",
".ct-payprog .bar{flex:0 0 120px;height:8px;border-radius:99px;background:var(--surface2);border:1px solid var(--border);overflow:hidden;direction:ltr}",
".ct-payprog .bar i{display:block;height:100%;background:var(--sla-warn);border-radius:99px;transition:width .3s}",
".ct-payprog.done .bar i{background:var(--sla-ok)}",
".ct-payprog.done{border-color:var(--sla-ok);color:var(--sla-ok)}",
".ct-payprog .t{min-width:0}",
".ct-payprog.sm{margin:7px 0 0;padding:5px 9px;font-size:10.5px;gap:8px;border-radius:8px}",
".ct-payprog.sm .bar{flex-basis:70px;height:6px}",
".ct-filters .form-input{font-size:12.5px}",
/* شبكةُ الأطراف */
".ct-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(265px,1fr));gap:14px}",
".ct-tile{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:14px 15px;box-shadow:var(--shadow);cursor:pointer;position:relative;overflow:hidden;transition:transform .16s,box-shadow .16s}",
".ct-tile::before{content:'';position:absolute;inset-block:0;inset-inline-start:0;width:4px;background:var(--rail,var(--sla-ok))}",
".ct-tile:hover{transform:translateY(-3px);box-shadow:0 14px 32px rgba(20,30,55,.13)}",
/* ترويسةُ البطاقة (بلاغُ المالك): شارةُ حالةٍ طويلة («مقفل — أُفرِج عن المحتجز»)
   كانت تعصر الاسمَ إلى عمودٍ ضيّقٍ فيتكسّر كلمةً كلمة. العلاج بنيويٌّ لا قصّاً:
   الاسمُ لا ينزل تحت ٥٦٪ من العرض، والشارةُ التي لا تسَعُها البقيّةُ تنزل سطراً
   كاملاً وحدَها — وتلتفّ داخلياً بدل nowrap العامة فلا تفيض خارج البطاقة. */
".ct-tile-top{display:flex;align-items:flex-start;justify-content:space-between;gap:6px 8px;margin-bottom:5px;flex-wrap:wrap}",
".ct-tile-name{font-size:14.5px;font-weight:800;font-family:'Cairo',sans-serif;color:var(--primary);line-height:1.35;flex:1 1 auto;min-width:56%}",
".ct-tile-top .badge{flex:0 0 auto;max-width:100%;white-space:normal;text-align:start;line-height:1.4}",
".ct-tile-kind{font-size:11.5px;color:var(--muted);font-weight:600;display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:10px}",
".ct-dot{opacity:.5}",
/* سطرُ المستخلص على بطاقة العقد — بألوان SLA نفسِها: منتظِرٌ (تنبيه) · منجَزٌ (سلامة) */
".ct-tile-ext{font-size:11px;font-weight:700;display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin:-4px 0 10px;padding:4px 8px;border-radius:8px;background:var(--sla-warn-bg);color:var(--sla-warn);border:1px solid var(--sla-warn-bd)}",
".ct-tile-ext.warn{background:var(--sla-crit-bg);color:var(--sla-crit);border-color:var(--sla-crit-bd)}",
".ct-tile-ext.done{background:var(--sla-ok-bg);color:var(--sla-ok);border-color:var(--sla-ok-bd)}",
/* شريطُ سريان الوثائق — العنصرُ المميّز: يرمّز محتوًى حقيقياً (تواريخَ فعلية) لا زينة */
".ct-docs{display:flex;flex-wrap:wrap;gap:5px}",
".ct-doc{font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;border:1px solid;white-space:nowrap}",
".ct-doc.s-ok{background:var(--sla-ok-bg);color:var(--sla-ok);border-color:var(--sla-ok-bd)}",
".ct-doc.s-soon{background:var(--sla-warn-bg);color:var(--sla-warn);border-color:var(--sla-warn-bd)}",
".ct-doc.s-expired{background:var(--sla-crit-bg);color:var(--sla-crit);border-color:var(--sla-crit-bd)}",
".ct-doc.s-none{background:var(--surface2);color:var(--muted);border-color:var(--border)}",
".ct-row-id td{background:var(--surface2)}",
/* شاراتُ نوع الأعمال — تُميَّز عن شارات الوثائق بلونها المحايد: تلك حالةُ سريانٍ
   تتغيّر بالزمن، وهذه صفةٌ ثابتة. تشابهُهما بصرياً يُقرأ حالةً حيث لا حالة. */
".ct-trades{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:9px}",
".ct-trade{font-size:10.5px;font-weight:700;padding:2px 9px;border-radius:7px;background:var(--surface2);color:var(--primary);border:1px solid var(--border);white-space:nowrap;display:inline-flex;align-items:center;gap:4px}",
".ct-trade.more{color:var(--muted)}",
".ct-trade-x{border:0;background:none;color:var(--muted);font-size:14px;line-height:1;cursor:pointer;padding:0;font-weight:800}",
".ct-trade-x:hover{color:var(--danger)}",
".ct-trades.edit{margin:2px 0 8px}",
".ct-trade-add{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center}",
".ct-cell.wide{grid-column:1/-1}",
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
".ct-sub{margin-top:10px;border:1px solid var(--border);border-radius:12px;padding:11px 13px;background:var(--surface)}",
".ct-sub.on{border-color:var(--subst-bd);background:var(--subst-bg)}",
".ct-sub-h{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:800;color:var(--subst);cursor:pointer}",
".ct-sub-h input{width:17px;height:17px;accent-color:var(--subst);cursor:pointer}",
".ct-sub-s{font-size:11px;color:var(--muted);font-weight:600;margin-top:3px}",
".ct-sub-chip{display:inline-flex;align-items:center;gap:4px;white-space:nowrap;font-size:10px;font-weight:800;padding:2px 8px;border-radius:10px;color:var(--subst);background:var(--subst-bg);border:1px solid var(--subst-bd)}",
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
/* سطرُ المرفق — رابطٌ ومَن أضافه ومتى، وزرُّ حذفٍ لمن يملكه */
".ct-att{display:flex;align-items:center;gap:8px;padding:7px 2px;border-bottom:1px dashed var(--border);font-size:12.5px;flex-wrap:wrap}",
".ct-att:last-child{border-bottom:none}",
".ct-att .ct-link{display:inline-flex;align-items:center;gap:4px;min-width:0;overflow-wrap:anywhere}",
".ct-att-m{color:var(--muted);font-size:11px;font-weight:600;margin-inline-start:auto}",
/* ── بطاقة العقد ── */
".ct-mytasks{border:1.5px solid var(--warn)}",
".ct-mt-h{display:flex;align-items:center;gap:8px;font-weight:900;font-size:14px;color:var(--warn);margin-bottom:10px}",
".ct-mt-badge{font-size:11px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:1px 9px;font-weight:800;color:var(--text)}",
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
/* زرُّ «تفاصيل الطرف» يسكن داخل الخانة: سطرٌ خاصٌّ به تحت الاسم فلا يُزاحمه على
   الجوال، ومقاسٌ يناسب النصَّ لا أزرارَ الأوامر. */
".ct-vbtn{margin-top:5px;padding:4px 10px;font-size:11px;gap:5px}",
".ct-table-wrap{overflow-x:auto}",
".ct-table{width:100%;border-collapse:collapse;font-size:12.5px;min-width:520px}",
".ct-table th{text-align:right;font-size:11px;color:var(--muted);font-weight:800;padding:7px 9px;border-bottom:1px solid var(--border);white-space:nowrap}",
".ct-table td{padding:8px 9px;border-bottom:1px solid var(--border);vertical-align:middle}",
  /* ★ الرقمُ يقف تحت رأسِ عموده.
     `.num` تضبط `direction:ltr` ليُقرأ الرقمُ بترتيب خاناته الصحيح — وحين تُوضع على
     **الخليّة** نفسِها (لا على `span` داخلها) ينقلب معها معنى `text-align:start` من
     اليمين إلى اليسار، فيلتصق الرقمُ بالحافّة اليسرى للعمود ورأسُه (`th` بـ
     `text-align:right`) بالحافّة اليمنى — عمودٌ واحدٌ يُقرأ عمودين، والانزياحُ قِيس
     ١٢٩–١٥٩ بكسلاً. (بلاغُ المالك: «البيانات غير مظبوطة تحت رأس العنوان… وكذلك في
     المستخلصات».) والعلّةُ صامتةٌ بطبعها: لا مترجمَ يُنذر ولا خطأَ جافاسكربت.
     التصحيحُ يفصل الأمرين في الخليّة: **يمينٌ** للمحاذاة، وLTR لترتيب الخانات —
     كما تفعل `.co-num` في وحدة النظافة و`.ivr-num` في تقارير المخزون. */
  ".ct-table td.num,.ct-table th.num{text-align:right}",
/* عمودُ رقم البند: أضيقُ ما يكفي رقمين، ورماديٌّ فلا يزاحم الوصفَ في القراءة.
   `text-align:center` صراحةً — الجدولُ يُحاذي لليمين افتراضاً فيلتصق الرقمُ بالحدّ. */
".ct-table th.ct-seq,.ct-table td.ct-seq{width:34px;text-align:center;color:var(--muted);font-weight:700;padding-inline:4px}",
".ct-table tbody tr:last-child td{border-bottom:none}",
".ct-table .form-input{font-size:12px;padding:5px 8px;min-width:110px}",
".ct-link{color:var(--info);text-decoration:none;font-weight:700;font-size:11.5px;display:inline-flex;align-items:center;gap:4px}",
".ct-link:hover{text-decoration:underline}",
/* رقمُ الجوال: يبقى **يساريَّ الاتجاه** في صفحةٍ عربية — رقمٌ مقلوبٌ يُنسَخ خطأً. */
".ct-link.num{direction:ltr;unicode-bidi:isolate}",
".ct-tile-ph{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}",
".ct-wa{color:var(--sla-ok)}",
/* التنبيهات */
".ct-note{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;padding:9px 13px;border-radius:10px;margin-bottom:12px;background:var(--surface2);color:var(--muted);border:1px solid var(--border)}",
".ct-note.warn{background:var(--sla-warn-bg);color:var(--sla-warn);border-color:var(--sla-warn-bd)}",
".ct-note.crit{background:var(--sla-crit-bg);color:var(--sla-crit);border-color:var(--sla-crit-bd)}",
/* النموذج */
".ct-form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}",
".ct-field{display:flex;flex-direction:column;gap:5px}",
".ct-field-l{font-size:11px;color:var(--muted);font-weight:700}",
".ct-hint{font-size:10.5px;color:var(--muted);font-weight:600;line-height:1.6}",
".ct-file{font-size:11px;padding:4px}",
/* الملفُّ المختارُ يُعلَن باسمه: حقلُ الملفّ لا يُملأ برمجياً، فلولا هذه الشارةُ
   لبدا الحقلُ فارغاً بعد إعادة الرسم والملفُّ محفوظٌ في المسوّدة. */
".ct-file-chip{display:inline-flex;align-items:center;gap:5px;max-width:190px;font-size:10.5px;font-weight:700;color:var(--sla-ok);background:var(--sla-ok-bg);border:1px solid var(--sla-ok-bd);border-radius:20px;padding:3px 9px}",
".ct-file-nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr}",
".ct-auto{font-size:9.5px;font-weight:700;color:var(--sla-ok);display:flex;align-items:center;gap:3px;margin-top:3px}",
".ct-save-bar{display:flex;gap:8px;justify-content:flex-end;position:sticky;bottom:0;background:var(--bg);padding:12px 0 4px;border-top:1px solid var(--border)}",
/* الفراغ */
".ct-empty{text-align:center;padding:38px 20px}",
".ct-empty-ic{width:46px;height:46px;margin:0 auto 12px;color:var(--muted);opacity:.55}",
".ct-empty-ic svg{width:46px;height:46px;stroke-width:1.5}",
".ct-empty-t{font-size:15px;font-weight:800;color:var(--primary);margin-bottom:6px}",
".ct-empty-s{font-size:12.5px;color:var(--muted);max-width:420px;margin:0 auto;line-height:1.7}",
"@media(max-width:760px){.ct-filters{grid-template-columns:1fr}.ct-form-row{grid-template-columns:1fr}.ct-grid{grid-template-columns:1fr}.ct-picks{grid-template-columns:1fr}.ct-trade-add{grid-template-columns:1fr}}",
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

  [{ id:"nav-contract-reqs-btn", page:PAGE_REQS,    icon:"fileText", lbl:"طلبات التعاقد وأوامر الدفع" },
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
  /* اللفّان يُركَّبان **عند الإقلاع** لا عند فتح صفحتنا: بطاقتا «بانتظار إجراءك» ولوحةِ
     المعلومات تظهران في شاشاتِ النواة، ومَن لا يفتح صفحةَ التعاقدات أبداً هو أوّلُ من
     يحتاجهما. (كانتا مربوطتين بـ`renderCtrs` — فلا تظهران إلا بعد زيارةٍ واحدةٍ على الأقلّ.) */
  hookMyTasks();
  hookDash();
  loadConfig();
  // القائمةُ الجانبية قد يُعاد بناؤها بعد الدخول أو تبديل المستخدم — أعِد الحقن
  try{
    var obs = new MutationObserver(function(){ injectSidebarGroup(); hookShowPage(); hookMyTasks(); hookDash(); });
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
  pickDocFile: pickDocFile, delDocFile: delDocFile, setDocType: setDocType,
  _draftVendor: function(){ return _vEdit; },
  addContact: addContact, delContact: delContact,
  setEntity: setEntity,
  addTrade: addTrade, addTradeText: addTradeText, delTrade: delTrade,
  clearTradeFilter: clearTradeFilter,
  vendors: vendors, vendorById: vendorById,
  // طلبات التعاقد [المرحلة ٢]
  renderReqs: renderReqs, startReqSync: startReqSync, stopReqSync: stopReqSync, retryReqs: retryReqs,
  newRequest: newRequest, cancelRequest: cancelRequestForm, submitRequest: submitRequest,
  setReqProject: setReqProject, setEngagement: setEngagement, setOverTh: setOverTh, setReqVendor: setReqVendor,
  addPlanRow: addPlanRow, delPlanRow: delPlanRow, planInput: planInput,
  toggleBoqLine: toggleBoqLine, addFreeLine: addFreeLine, delReqLine: delReqLine,
  addCandidate: addCandidate, delCandidate: delCandidate, recalc: recalc,
  toggleSubstitute: toggleSubstitute,
  filterReqs: filterReqs, clearReqFilters: clearReqFilters, reqTab: reqTab,
  openReq: openReq, backToReqs: backToReqs,
  act: act, doCancel: doCancel, doDelete: doDelete, openPay: openPay,
  pickReqAttach: pickReqAttach, delReqAttach: delReqAttach,
  addDraftAttach: addDraftAttach, delDraftAttach: delDraftAttach,
  openRewind: openRewind, closeRewind: closeRewind, doRewind: doRewind,
  openExtRewind: openExtRewind, doExtRewind: doExtRewind,
  openChgRewind: openChgRewind, doChgRewind: doChgRewind, closeDocRewind: closeDocRewind,
  editLines: editLines, cancelLines: cancelLines, addEditLine: addEditLine, canEditLines: canEditLines,
  aiDraftLines: aiDraftLines, aiApplyLine: aiApplyLine, aiApplyAllLines: aiApplyAllLines,
  aiCloseLines: aiCloseLines,
  _aiParseLines: aiParseLines, _aiLinesPrompt: aiLinesPrompt, _aiReady: aiReady,
  _aiSuggestions: function(){ return _aiLines; },
  delEditLine: delEditLine, editLinesRecalc: editLinesRecalc, saveLines: saveLines, closePay: closePay, doPay: doPay,
  requests: requests, requestById: requestById,
  _ctDocInTenant: ctDocInTenant,   // حصرُ العرض بمشروع التشغيل — دالةٌ نقيةٌ تُفحص بلا متصفّح
  // المخرَجُ الورقيُّ لأمر الدفع — سندُ الصرف
  printPay: printPay, printPayOrder: printPayOrder,
  _amountWords: amountWords,
  _payOrderSignoffs: payOrderSignoffs,
  _payOrderPrintState: payOrderPrintState,
  _crqSignoffs: crqSignoffs,
  // مسودةُ العقد في مراحل الاعتماد
  printDraft: printDraft, printContractDraft: printContractDraft,
  _crqDraftState: crqDraftState, _crqDraftContract: crqDraftContract,
  // العقود [المرحلة ٣]
  renderCtrs: renderCtrs, startCtrSync: startCtrSync, stopCtrSync: stopCtrSync,
  filterCtrs: filterCtrs, openCtr: openCtr, backToCtrs: backToCtrs, ctrTab: ctrTab, ctrsTab: ctrsTab,
  transit: transit, makeContract: makeContract, doDeleteCtr: doDeleteCtr,
  openReqFromCtr: openReqFromCtr, openCtrFromReq: openCtrFromReq,
  openVendorFrom: openVendorFrom,
  // الوثيقة التعاقدية [المرحلة ٤-ب]
  printCtr: printCtr, printContract: printContract,
  _contractPaperHTML: contractPaperHTML,
  _ctrLinesHTML: ctrLinesHTML,     // جدولُ بنود العقد — يُنفَّذ في فحص المتصفّح
  _letterheadAssets: letterheadAssets, _letterheadOn: letterheadOn,
  // هندسة الورقة الرسمية مصدرها الواحد هنا — تقرؤها vendor-po.js لأمر الشراء بدل نسخ مقاساتها
  _letterheadCSS: letterheadCSS, _letterheadWrap: letterheadWrap, _docHeadHTML: docHeadHTML,
  editClauses: editClauses, addClause: addClause, delClause: delClause,
  cancelClauses: cancelClauses, saveClauses: saveClauses,
  openSign: openSign, closeSign: closeSign, doSign: doSign,
  clauseTemplates: clauseTemplates, loadClauseTemplates: loadClauseTemplates,
  saveClauseTemplates: saveClauseTemplates,
  _sign: signContract, _saveClauses: saveContractClauses,
  _payAdvance: payAdvance,
  _advancePaidOf: advancePaidOf, _advanceDueOf: advanceDueOf, _advancePayable: advancePayable,
  _voidAdvancePayment: voidAdvancePayment,
  _advanceRecoveredOf: advanceRecoveredOf, _advanceVoidableOf: advanceVoidableOf, _advVoidable: advVoidable,
  _advanceRecoveryCapOf: advanceRecoveryCapOf, _advanceRecoveryOf: advanceRecoveryOf,
  _advanceRecoveryDerived: advanceRecoveryDerived, _advanceRecoveryLabel: advanceRecoveryLabel,
  openAdvPay: openAdvPay, closeAdvPay: closeAdvPay, doAdvPay: doAdvPay,
  openAdvVoid: openAdvVoid, closeAdvVoid: closeAdvVoid, doAdvVoid: doAdvVoid,
  contractsList: contractsList, contractById: contractById, contractForRequest: contractForRequest,
  _convert: convertToContract, _transit: transitContract, _deleteCtr: deleteContract,
  // المستخلصات [المرحلة ٤]
  startExtSync: startExtSync, stopExtSync: stopExtSync,
  newExtract: newExtract, cancelExtract: cancelExtract, submitExtract: submitExtract,
  addExtDraftAttach: addExtDraftAttach, delExtDraftAttach: delExtDraftAttach,
  pickExtAttach: pickExtAttach, delExtAttach: delExtAttach,
  extRecalc: extRecalc, applyPenalty: applyPenalty,
  openExt: openExt, backToExts: backToExts, extAct: extAct,
  openExtPay: openExtPay, closeExtPay: closeExtPay, doExtPay: doExtPay,
  // ورقةُ المستخلص وتوقيعُ المقاول عليها
  printExt: printExt, printExtract: printExtract, _extractPaperHTML: extractPaperHTML,
  openExtSign: openExtSign, closeExtSign: closeExtSign, doExtSign: doExtSign,
  openExtEdit: openExtEdit, _editExt: editExtract, _paint: paintCtrs,
  _signExt: signExtract, _extSignature: extSignature, _extSigValid: extSigValid,
  _extPayGuard: extPayGuard, _extSignoffs: extSignoffs, _extPrintState: extPrintState,
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
  // ربطُ طلبات الشراء و«بانتظار إجراءك» [المرحلة ٨]
  linkPO: linkPO, unlinkPO: unlinkPO,
  openReqFrom: openReqFrom, openCtrFrom: openCtrFrom,
  openExtFrom: openExtFrom, openChgFrom: openChgFrom,
  renderMyTasks: renderMyTasks, hookMyTasks: hookMyTasks,
  // الأداء ولوحة المعلومات [المرحلتان ١٠ و١١]
  renderDashCard: renderDashCard, hookDash: hookDash, openCtrsPage: openCtrsPage,
  // ما ينتظر سدادَ المالية من جهة التعاقدات — تقرؤه بطاقةُ «المالية — السداد» في المشتريات
  financePayables: financePayablesLive, _financePayables: financePayables, _extDueNet: extDueNet,
  _vendorScorecard: vendorScorecard, _dashSummary: dashSummary, _ctrLateDays: ctrLateDays,
  _linkPurchase: linkPurchase, _poCandidatesFor: poCandidatesFor,
  _poLinkedTo: poLinkedTo, _myPendingItems: myPendingItems,
  _chgAmountOf: chgAmountOf, _chgNextStage: chgNextStage, _chgEffect: chgEffect,
  _chgGuard: chgGuard, _chgCanAct: chgCanAct, _chgIsFinal: chgIsFinal,
  _contractChangeTotals: contractChangeTotals, _openChangeOf: openChangeOf,
  _chgContractEligible: chgContractEligible, _contractLineQty: contractLineQty,
  _CHG_STATUS: CHG_STATUS, _CHG_GATES: CHG_GATES, _CHG_OPEN: CHG_OPEN,
  // مقابضُ طبقة البيانات — مكشوفةٌ لفحص المتصفّح ليختبر القواعد نفسَها التي
  // تحرسها الشاشة، لا نسخةً منها: الرفضُ يجب أن يقع في البيانات لا على الزرّ.
  _create: createRequest, _act: actOnRequest, _pay: payRequest, _cancel: cancelRequest,
  _addAttach: addReqAttachments, _delAttach: deleteReqAttachment,
  _canAttachReq: canAttachReq, _canDelAttach: canDelAttach,
  _addExtAtts: addExtAttachments, _delExtAtt: deleteExtAttachment,
  _canAttachExt: canAttachExt, _canDelExtAttach: canDelExtAttach,
  _delete: deleteRequest, _rewind: rewindRequest, _editLines: editRequestLines,
  _crqRewind: crqRewind, _crqRewindTargets: crqRewindTargets,
  _extRewind: extRewind, _extRewindTargets: extRewindTargets, _rewindExt: rewindExtract,
  _chgRewind: chgRewind, _chgRewindTargets: chgRewindTargets, _rewindChg: rewindChange,
  _extActMode: extActMode, _chgActMode: chgActMode,
  _draft: function(){ return _rDraft; },
  _mirror: _mirror, _confirm: _confirm, _CONFIRM_KINDS: _CONFIRM_KINDS,
  // الصلاحيات
  // الرابطُ العميق من رسالة واتساب [المرحلة ٩]
  openById: openById, ownsId: ctrOwnsId, _idKind: ctrIdKind,
  canView: canView, canEdit: canEdit, canAdd: canAdd, canEditVendor: canEditVendor,
  canBank: canBank, canWriteIban: canWriteIban, canStatus: canStatus, canCreateReq: canCreateReq,
  _ibanOk: ibanOk, _ibanClean: ibanClean,
  /* طبعُ مفتاح «التعاقدات» بحسب الدور — **مصدرٌ واحد** تقرؤه نافذةُ الصلاحيات في
     النواة، فلا تُنسَخ `VIEW_ROLES` في ملفٍّ ثانٍ ينحرف عنها بصمت. */
  viewRoles: VIEW_ROLES.slice(), roleEligible: roleEligible,
  // الدوالُّ النقية — مكشوفةٌ لفحوص hail-tests
  _r2: r2,
  _vatSplit: vatSplit,
  _lineTotal: lineTotal,
  _linesTotal: linesTotal,
  _payOrderAllowed: payOrderAllowed,
  _crqPaidPct: crqPaidPct,   // نسبةُ السداد — دالةٌ نقيةٌ تُفحص بلا متصفّح
  _crqPaidTotal: crqPaidTotal,
  _crqPayDue: crqPayDue,
  _normPaymentPlan: normPaymentPlan,
  _paymentPlanOk: paymentPlanOk,
  _crqPlanInstallment: crqPlanInstallment,
  _penaltyIsPct: penaltyIsPct, _penaltyPerDay: penaltyPerDay, _penaltyCap: penaltyCap,
  _normPenalty: normPenalty, _penaltyText: penaltyText,
  _crqNextStage: crqNextStage,
  _contractValue: contractValue,
  _contractLineQty: contractLineQty,
  _extNet: extNet,
  _docExpiryState: docExpiryState,
  _vendorComplianceState: vendorComplianceState,
  _vendorEligibility: vendorEligibility,
  _normName: normName,
  _identityOf: identityOf,
  // أرقامُ التواصل — الدوالُّ النقيّةُ التي تقرؤها الشاشةُ والبحثُ والفحصُ معاً
  _phoneDigits: phoneDigits, _normPhone: normPhone, _phoneOk: phoneOk,
  _phoneFmt: phoneFmt, _phoneHint: phoneHint, _phoneVariants: phoneVariants,
  _vendorPhones: vendorPhones, _vendorMatchesPhone: vendorMatchesPhone, _phoneOwner: phoneOwner,
  _suggestVatMode: suggestVatMode,
  _allExpiring: allExpiring,
  _duplicateOf: duplicateOf,
  _docTypesFor: docTypesFor,
  _DOC_TYPES: DOC_TYPES,
  _docAutoValue: docAutoValue, _applyDocAutofill: applyDocAutofill, _clearStaleDocAuto: clearStaleDocAuto, _docsForSave: docsForSave,
  _normEntity: normEntity,
  // نوعُ الأعمال (التخصّص) — الدوالُّ النقيّةُ التي تقرؤها الشاشةُ والفحصُ معاً
  _TRADES: TRADES,
  _normTrade: normTrade, _tradeLabel: tradeLabel,
  _vendorTrades: vendorTrades, _vendorHasTrade: vendorHasTrade,
  _kindMatches: kindMatches, _tradeOptions: tradeOptions,
  _vendorsByTrade: vendorsByTrade,
  _crqProcKey: crqProcKey,
  _crqFinanceKey: crqFinanceKey,
  _crqRevalidate: crqRevalidate,
  _crqValueOf: crqValueOf,
  _crqCanAct: crqCanAct,
  _crqActMode: crqActMode, _crqApprovers: crqApprovers,
  _crqAlreadyApproved: crqAlreadyApproved, _crqOtherGateHolder: crqOtherGateHolder,
  _crqGateOwner: crqGateOwner,
  _crqIsFinal: crqIsFinal,
  _crqIsBounced: crqIsBounced,
  _reqTabOf: reqTabOf,
  _reqStatSet: reqStatSet,
  _ctrTabOf: ctrTabOf,
  _normalizeProjectRef: normalizeProjectRef,
  _docProjectName: docProjectName,
  _docProjectKey: docProjectKey,
  _budgetLinkState: budgetLinkState,
  // الربط بالموازنة [المرحلة ٥]
  rollupForProject: rollupForProject,
  contractsLoaded: contractsLoaded,
  poIsUnderContract: poIsUnderContract,
  _contractRollup: contractRollup,
  // البند المستعاض — تقرؤها `substitute-budget.js`
  substituteRollupFor: substituteRollupFor,
  contractSubstituteId: contractSubstituteId,
  _substituteRollup: substituteRollup,
  _docSubstituteId: docSubstituteId,
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
