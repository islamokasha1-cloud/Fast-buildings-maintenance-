/* ═══════════════════════════════════════════════════════════════════════════
   vendor-po.js — إصدار أمر الشراء الرسمي للمورد (Purchase Order)

   ── المشكلة ──
   دورة المشتريات كلها **داخلية**: طلب الشراء يُعتمد ويُسدَّد وينفَّذ، لكن لا وثيقة
   رسمية تخرج من الشركة إلى المورد تقول «نطلب منك توريد هذه البنود بهذه الأسعار
   بهذه الشروط». الاتفاق مع المورد مكالمة أو واتساب، وعند الخلاف على سعرٍ أو كمية
   لا مستند يُحتكم إليه — وفاتورة المورد تُطابَق مع تقديراتٍ داخلية لا مع التزامٍ
   موقَّع.

   ── المبدأ (قرارات المالك — نقاش أغسطس 2026) ──
   • **الإصدار اختياري لا مرحلة**: زرٌّ في تفاصيل الطلب، لا خطوة في سلّم الحالات.
     مسار المال (`status`/`timeline` بأكواد المراحل) لا يُمسّ — قيد الأمر يدخل
     الـtimeline بكود `vendor_po_issued` خارج STAGE_ORDER (نمط `delivery_extended`)
     فلا يقطع قياس أزمنة المراحل في purchase-kpi.
   • **التوقيت**: من مرحلة «تنفيذ المشتريات» فصاعداً — قبلها السعر والمورد غير
     نهائيين. عرضُ السعر المسبق من المورد **ليس شرطاً**: في مسار مقارنة الأسعار
     الأسعار الفائزة موجودة أصلاً، وفي الطلب المباشر الأمرُ نفسُه هو توثيق الاتفاق.
   • **نفس الرقم**: رقم الوثيقة = رقم طلب الشراء (`p.id`) — لا تسلسل ثانٍ يُطارَد.
     إعادة الإصدار ترفع `rev` وتحفظ النسخة السابقة في `vendorPOHistory` — الأثر
     لا يُمحى.
   • **الأسعار قابلة للتعديل** قبل الإصدار (قد يتفاوض المسؤول ويحصل على أفضل) —
     والمصدر الافتراضي أسعار بنود الطلب المعتمدة. **ولا يُكتب شيء على `p.vendor`
     أو بنود الطلب**: الأمرُ لقطةٌ مستقلة في `p.vendorPO`، فتعديل سعرٍ فيه لا يغيّر
     تقديرات الطلب ولا ملخّصات الموردين (تلك من المغلق فعلياً كما هي).
   • **الشروط قوالب + كتابة حرة**: القوالب في وثيقة `meta/vendor_po_terms`
     (نمط قوالب شروط العقود في contracts.js) والنص النهائي يُحفَظ مع الأمر.
   • **الإخراج PDF فقط** حالياً (نافذة طباعة على الورقة الرسمية للشركة إن توفّرت
     صورُها — نقرأ مساعدات الترويسة من `window.contracts` كي لا تُنسَخ هندستها
     المقيسة، وعند غيابها ترويسة نصية بالشعار). الإرسال الآلي للمورد لاحقاً.
   • **«المورد المعتمد» مؤجَّل** (قرار المالك): أي مورد من سجل الأطراف
     (`global_vendors`) يصلح، مع باب كتابة يدوية لمورد لم يُسجَّل بعد.

   ── الحساب ──
   اصطلاح ض.ق.م **على الوحدة** (v18.9nd — نفس `_poItemLine`): ضريبة الوحدة
   تُقرَّب لقرشين ثم إجمالي الوحدة ثم إجمالي السطر — فالرقم المطبوع للمورد هو
   نفسُه الذي تحسبه شاشات الطلب، ولا يفترقان بفلس تقريب.

   ── الاستقلال ──
   IIFE يعرّض `window.vendorPO` وحده، ويقرأ خدمات النواة بالاسم المجرّد وقتَ
   الاستدعاء (db · purchases · savePurchase · logAudit · toast · esc · openModal ·
   closeModal · currentUser · poStageOf · _openPrintWindow · فحوص الأدوار…).
   الدوال الحسابية والقرارية نقيّة ومعروضة على الكائن ليفحصها `hail-tests.js`
   بلا متصفح.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
"use strict";

const MODULE_BUILD = "v18.9.3001";

/* ════════ الثوابت ════════ */
// الأدوار التي تُصدر — المشتريات والأدمن (قرار المالك)
const VPO_ROLES = ["procurement_officer","admin"];
// مراحل الإصدار (مفاتيح PO_STAGES المركزية — لا قائمة حالاتٍ خام محلية؛
// التصنيف يمرّ عبر poStageOf فلا ينحرف عن بقية الشاشات)
const VPO_STAGES = ["proc_executing","wh_receiving","wh_auditing"];
// قوالب الشروط الافتراضية — تُستخدم فقط حين لا وثيقة قوالب محفوظة بعد
const VPO_DEFAULT_TEMPLATES = [
  { id:"delivery", title:"التوريد إلى الموقع",
    body:"يتم التوريد إلى موقع التسليم المحدد في هذا الأمر، مع إشعار مسبق قبل التسليم بوقتٍ كافٍ." },
  { id:"prices", title:"شمول الأسعار",
    body:"الأسعار المذكورة شاملة ضريبة القيمة المضافة 15٪ وجميع رسوم النقل والتحميل والتنزيل، ما لم يُنص على خلاف ذلك." },
  { id:"invoice-match", title:"مطابقة الفاتورة",
    body:"تُطابَق فاتورة المورد مع هذا الأمر رقماً وبنوداً وأسعاراً، وأي زيادة أو بند لم يرد فيه لا يُعتمد إلا بموافقة كتابية مسبقة." },
  { id:"delay", title:"التأخر في التوريد",
    body:"يلتزم المورد بموعد التوريد المذكور، وفي حال التأخر دون عذر مقبول يحق للشركة إلغاء الأمر أو التوريد من الغير." },
];

function _dev(){
  var dev = false;
  try{ dev = (typeof IS_DEV!=="undefined" && IS_DEV); }catch(e){}
  return dev;
}
function TERMS_DOC(){ return _dev() ? "meta/vendor_po_terms_dev" : "meta/vendor_po_terms"; }

/* ════════ أغلفة النواة (آمنة في بيئة الفحص بلا متصفح) ════════ */
function _e(s){
  if(typeof esc === "function") return esc(s);
  return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function _toast(msg, kind){ try{ if(typeof toast==="function") toast(msg, kind); }catch(e){} }
/* أيقونات svg من طقم المنصّة (_ICON عبر _ic) — لا إيموجي في الشاشة ولا في المطبوع
   (طلب المالك). مقاسُ `.ic` في المطبوع يحقنه _openPrintWindow من مصدرٍ واحد،
   والقالبُ لا يعرّف `.ic` بنفسه أبداً (درسُ v18.9.2841). */
function _icx(name, cls){ try{ if(typeof _ic==="function") return _ic(name, cls); }catch(e){} return ""; }
function _db(){ try{ return (typeof db!=="undefined") ? db : null; }catch(e){ return null; } }
function _me(){ try{ return (typeof currentUser!=="undefined" && currentUser) ? currentUser : null; }catch(e){ return null; } }
function _role(){ var u=_me(); return (u&&u.role)||""; }
function _findPO(poId){
  try{ if(typeof purchases!=="undefined" && Array.isArray(purchases)) return purchases.find(function(x){ return x.id===poId; })||null; }catch(e){}
  return null;
}
function _fmtN(n){ return (Number(n)||0).toLocaleString("en-US",{maximumFractionDigits:2}); }
function _fmtD(d){ return d ? new Date(d).toLocaleDateString("en-GB",{year:"numeric",month:"2-digit",day:"2-digit"}) : "—"; }

/* ════════ الدوال النقية (يفحصها hail-tests.js بلا متصفح) ════════ */

/* حساب السطر — ض.ق.م على الوحدة (اصطلاح v18.9nd، مطابق لمنهج _poItemLine) */
function lineCalc(unitCost, qty){
  var unit = Number(unitCost)||0, q = Number(qty)||0;
  var vatUnit   = Math.round(unit*0.15*100)/100;
  var unitTotal = Math.round((unit+vatUnit)*100)/100;
  var total     = Math.round(unitTotal*q*100)/100;
  var net       = Math.round(unit*q*100)/100;
  var vat       = Math.round((total-net)*100)/100;
  return { net:net, vat:vat, total:total };
}
function totalsOf(items){
  var net=0, vat=0, total=0;
  (items||[]).forEach(function(it){
    if(!it) return;
    var l = lineCalc(it.unitCost, it.qty);
    net+=l.net; vat+=l.vat; total+=l.total;
  });
  return { net:Math.round(net*100)/100, vat:Math.round(vat*100)/100, total:Math.round(total*100)/100 };
}
/* البنود الإضافية — ما أُضيف في الأمر زيادةً على بنود طلب الشراء (`extra:true`).
   عددُها وإجماليُّها يُعرَضان في النافذة ويُقيَّدان في الـtimeline وسجل التدقيق:
   الأمرُ يتجاوز حينئذٍ المعتمَدَ في الطلب، وتجاوزٌ لا أثرَ له تجاوزٌ خفيّ. */
function extrasOf(items){
  var n=0, t=0;
  (items||[]).forEach(function(it){
    if(!it || !it.extra) return;
    n++; t += lineCalc(it.unitCost, it.qty).total;
  });
  return { count:n, total:Math.round(t*100)/100 };
}
/* الكمية التي تُشترى فعلاً — المغطّى من المخزون بالكامل لا يدخل أمر المورد */
function buyQty(it){
  if(!it) return 0;
  if(it._fullyCoveredByStock) return 0;
  return Math.max(0, Number(it.qty)||0);
}
/* بنود الأمر الافتراضية من بنود الطلب — الاسم والكود من مرساة الكتالوج إن توفّرت
   (قاعدة v18.9xb: ممنوع قراءة itemName/itemCode مباشرةً حين تتوفر الدالة المركزية) */
function defaultItems(p){
  var out=[];
  ((p&&p.items)||[]).forEach(function(it){
    var q = buyQty(it);
    if(q<=0) return;
    var nm, cd;
    try{ nm = (typeof _poShownName==="function") ? _poShownName(it) : (it.itemName||""); }catch(e){ nm = it.itemName||""; }
    try{ cd = (typeof _poShownCode==="function") ? _poShownCode(it) : (it.itemCode||""); }catch(e){ cd = it.itemCode||""; }
    out.push({
      itemId: it.itemId||"", itemCode: cd||"", itemName: nm||"",
      qty: q, unit: it.unit||"",
      unitCost: Number(it.unitCost)||Number(it.estUnitCost)||0,
    });
  });
  return out;
}
/* بوابة الإصدار — الدور ثم المرحلة (عبر poStageOf المركزية لا قائمة حالات محلية).
   خارج مراحل الإصدار: أمرٌ صادرٌ سابقاً يبقى قابلاً للعرض والطباعة (reprintOnly). */
function canIssue(p, role, stageOfFn){
  if(!p) return { ok:false, why:"لا طلب", reprintOnly:false };
  if(VPO_ROLES.indexOf(role)===-1) return { ok:false, why:"الإصدار لمسؤول المشتريات والمسؤول", reprintOnly:false };
  var stage = null;
  try{
    var fn = stageOfFn || (typeof poStageOf==="function" ? poStageOf : null);
    if(fn) stage = fn(p.status);
  }catch(e){}
  if(VPO_STAGES.indexOf(stage)!==-1) return { ok:true, why:"", reprintOnly:false };
  if(p.vendorPO) return { ok:true, why:"", reprintOnly:true };
  return { ok:false, why:"يُتاح الإصدار من مرحلة «تنفيذ المشتريات» فصاعداً — بعد اكتمال الاعتمادات", reprintOnly:false };
}
/* تطبيق الإصدار على الطلب — نقيّة في مدخلاتها: تعدّل p وتُرجع الأمر المحفوظ.
   إعادة الإصدار ترفع rev وتدفع السابق إلى vendorPOHistory (الأثر لا يُمحى)،
   وقيد الـtimeline بكود خارج STAGE_ORDER فلا يمسّ قياس أزمنة المراحل. */
function applyIssue(p, payload, ctx){
  if(!p || !payload || !ctx) return null;
  var prev = p.vendorPO || null;
  var rev = (prev && Number(prev.rev)||0) + 1;
  if(prev){
    if(!Array.isArray(p.vendorPOHistory)) p.vendorPOHistory = [];
    p.vendorPOHistory.push(prev);
  }
  var t = totalsOf(payload.items);
  var ex = extrasOf(payload.items);
  var vpo = {
    docNo: p.id, rev: rev,
    issuedAt: ctx.now, issuedBy: ctx.by||"—", issuedByUser: ctx.byUser||"",
    vendorId: payload.vendorId||"", vendorName: payload.vendorName||"",
    vendorPhone: payload.vendorPhone||"", vendorVatNo: payload.vendorVatNo||"",
    vendorCrNo: payload.vendorCrNo||"",
    deliveryPlace: payload.deliveryPlace||"", deliveryDate: payload.deliveryDate||"",
    terms: payload.terms||"", notes: payload.notes||"",
    items: (payload.items||[]).map(function(it){
      var l = lineCalc(it.unitCost, it.qty);
      return { itemId:it.itemId||"", itemCode:it.itemCode||"", itemName:it.itemName||"",
               qty:Number(it.qty)||0, unit:it.unit||"", unitCost:Number(it.unitCost)||0,
               extra: !!it.extra,
               net:l.net, vat:l.vat, total:l.total };
    }),
    net:t.net, vat:t.vat, total:t.total,
    extrasCount:ex.count, extrasTotal:ex.total,
  };
  p.vendorPO = vpo;
  p.updatedAt = ctx.now;
  if(!Array.isArray(p.timeline)) p.timeline = [];
  p.timeline.push({
    event: "إصدار أمر شراء للمورد — "+(vpo.vendorName||"—")+(rev>1?(" (مراجعة "+rev+")"):""),
    code: "vendor_po_issued",          // خارج STAGE_ORDER — لا يقطع قياس أزمنة المراحل
    by: ctx.by||"—", at: ctx.now, icon: "📤",
    notes: "الإجمالي شامل ض.ق.م: "+_fmtN(vpo.total)+" ر.س — "+vpo.items.length+" بنداً"+
           (ex.count ? (" — منها "+ex.count+" بند إضافي خارج بنود الطلب بإجمالي "+_fmtN(ex.total)+" ر.س") : ""),
  });
  return vpo;
}

/* مطابقةُ اسمٍ مكتوبٍ يدوياً بسجل الأطراف — بالتطبيع العربيّ الخفيف (تشكيل ·
   تطويل · همزات · تاء مربوطة · ياء · مسافات) على نهج مطابقة أسماء المشتريات.
   الغرضُ (طلب المالك): السجلُّ التجاريّ والرقمُ الضريبيّ يُحمَّلان تلقائياً حتى لو
   كُتب اسمُ المورد يدوياً مطابقاً لطرفٍ مسجَّل. مطابقةٌ تامةٌ بعد التطبيع فقط —
   لا تخمينَ جزئياً، فبيانا هويةٍ خاطئان أسوأُ من خانةٍ فارغة. */
function normVendorName(s){
  return String(s||"")
    .replace(/[ـً-ْ]/g,"")
    .replace(/[أإآ]/g,"ا")
    .replace(/ة/g,"ه")
    .replace(/ى/g,"ي")
    .replace(/\s+/g," ").trim().toLowerCase();
}
function matchVendor(list, name){
  var k = normVendorName(name);
  if(!k) return null;
  for(var i=0;i<(list||[]).length;i++){
    var v=list[i];
    if(v && normVendorName(v.name)===k) return v;
  }
  return null;
}
function _vendorFromRegistry(name){
  try{
    if(window.contracts && typeof contracts.vendors==="function")
      return matchVendor(contracts.vendors(), name);
  }catch(e){}
  return null;
}

/* ════════ الاعتمادات الداخلية — تُطبع أسفل الوثيقة (طلب المالك: كما في ورقة المستخلص) ════════
   المصدرُ سجلُّ الطلب نفسُه: قيودُ الـtimeline تحمل `code` الحالةَ الجديدةَ بعد كل
   انتقال (v18.9od)، فتسلسلُ الأكواد هو مسارُ الطلب. **البوّابةُ تُعرَّف بالحالة التي
   تُغادَر**: من غادر `pending_pm` قُدُماً فهو اعتمادُ مدير المشاريع، وهكذا. وهذه
   **خريطةُ انتقالاتٍ** لقراءة السجل لا قائمةُ تصنيفِ حالاتٍ تنافس `poStageOf` —
   التصنيفُ المركزيُّ يبقى للمراحل، وهذه لقراءة «مَن وقّع كلَّ بوّابة».
   وآخرُ عبورٍ يغلب (إرجاعُ الأدمن ثم إعادةُ الاعتماد ⇒ يُقرأ الاعتمادُ الأخير).
   وللتنفيذيّ ختمُه المقرونُ بمبلغه (`ceoApprovedBy/At`) وللسداد مستندُ الدفع
   (`payment.paidBy/paidAt`) — مصادرُ أدقُّ من السجل فتُقدَّم عليه. */
var VPO_GATES = [
  { key:"pm",   lbl:"اعتماد مدير المشاريع",
    from:["pending_pm"],
    to:["pm_approved","wh_review","wh_reviewed","wh_approved","pending_proc","pending_ceo","pending_finance","proc_executing"] },
  { key:"wh",   lbl:"مراجعة المستودع",
    from:["wh_review","pm_approved"],
    to:["wh_reviewed","wh_approved","pending_proc"] },
  { key:"proc", lbl:"اعتماد المشتريات",
    from:["pending_proc","wh_reviewed","wh_approved"],
    to:["pending_ceo","pending_finance","proc_executing"] },
];
/* قرار المالك (قبل دمج #352): «مدير النظام» في خانات الاعتمادات يُعرَض «مدير
   المشاريع» — حسابُ الأدمن يقوم بدور مدير المشاريع فعلياً، والوثيقةُ الموجَّهةُ
   للمورد تُظهر الصفةَ لا اسمَ الحساب التقنيّ. العرضُ وحدَه يتبدّل: السجلُّ
   والـtimeline يبقيان على الاسم الحقيقيّ كما كُتب. */
var VPO_BY_ALIAS = { "مدير النظام": "مدير المشاريع" };
function poSignoffs(p){
  if(!p) return [];
  var alias = function(by){ return VPO_BY_ALIAS[by] || by || ""; };
  var norm = function(s){
    try{ if(typeof normalizePOStatus==="function") return normalizePOStatus(s); }catch(e){}
    return s;
  };
  var found = {}, finTl = null;
  var prev = "pending_pm";
  ((p.timeline)||[]).forEach(function(tl){
    if(!tl || !tl.code) return;
    var t = norm(tl.code);
    if(t === "vendor_po_issued") return;      // قيدُ هذه الوحدة — ليس انتقالَ حالة
    VPO_GATES.forEach(function(g){
      if(g.from.indexOf(prev)!==-1 && g.to.indexOf(t)!==-1) found[g.key] = { by:tl.by||"", at:tl.at||"" };
    });
    if(prev==="pending_finance" && t==="proc_executing") finTl = { by:tl.by||"", at:tl.at||"" };
    if(t !== prev) prev = t;
  });
  var out = VPO_GATES.map(function(g){
    return { key:g.key, lbl:g.lbl, by:(found[g.key]||{}).by||"", at:(found[g.key]||{}).at||"" };
  });
  // ارتدادُ المستودع لحقله المخصَّص إن خلا السجل (الطلبات القديمة)
  if(!out[1].by && p.whReviewedBy){ out[1].by = p.whReviewedBy; out[1].at = p.whReviewedAt||""; }
  // بوّابةُ التنفيذي شرطية — تظهر فقط إن مرّ الطلبُ بها (كما تشرط ورقةُ المستخلص عتبتَها)
  var ceoPassed = !!p.ceoApprovedAt ||
    ((p.timeline)||[]).some(function(tl){ return tl && norm(tl.code)==="pending_ceo"; });
  if(ceoPassed) out.push({ key:"ceo", lbl:"اعتماد المدير التنفيذي", by:p.ceoApprovedBy||"", at:p.ceoApprovedAt||"" });
  var pay = (p.payment)||{};
  var fin = { key:"fin", lbl:"سداد المالية", by:pay.paidBy||pay.by||"", at:pay.paidAt||pay.at||"" };
  if(!fin.by && finTl){ fin.by = finTl.by; fin.at = finTl.at; }
  out.push(fin);
  out.forEach(function(g){ g.by = alias(g.by); });
  return out;
}

/* ════════ قوالب الشروط ════════ */
var _tpl = null;   // تُحمَّل مرة وتُحدَّث محلياً بعد كل حفظ
function templates(){ return Array.isArray(_tpl) ? _tpl.slice() : VPO_DEFAULT_TEMPLATES.slice(); }
function loadTemplates(){
  if(_tpl) return Promise.resolve(_tpl);
  var database=_db();
  if(!database){ _tpl = VPO_DEFAULT_TEMPLATES.slice(); return Promise.resolve(_tpl); }
  return database.doc(TERMS_DOC()).get().then(function(snap){
    var d=(snap&&snap.exists)?(snap.data()||{}):{};
    _tpl = (Array.isArray(d.templates)&&d.templates.length) ? d.templates : VPO_DEFAULT_TEMPLATES.slice();
    return _tpl;
  }).catch(function(e){ console.warn("vendorPO/loadTemplates",e); _tpl=VPO_DEFAULT_TEMPLATES.slice(); return _tpl; });
}
function _persistTemplates(list, action){
  var database=_db(); if(!database){ _toast("❌ لا اتصال بقاعدة البيانات","warn"); return Promise.reject(new Error("no db")); }
  var u=_me();
  return database.doc(TERMS_DOC()).set({
    templates:list, updatedAt:new Date().toISOString(), updatedBy:(u&&u.name)||"—",
  },{merge:true}).then(function(){
    _tpl=list.slice();
    try{ if(typeof logAudit==="function") logAudit("قوالب شروط أمر الشراء — "+action, list.length+" قالباً"); }catch(e){}
  });
}

/* ════════ نافذة الإصدار ════════ */
var _openId = null;

function _ensureModal(){
  if(document.getElementById("modal-vendor-po")) return;
  var d=document.createElement("div");
  d.className="modal-overlay"; d.id="modal-vendor-po";
  d.innerHTML =
    '<div class="modal" style="max-width:900px">'+
      '<div class="modal-header">'+
        '<div class="modal-title" id="vpo-title">إصدار أمر شراء للمورد</div>'+
        '<button class="modal-close" onclick="closeModal(\'modal-vendor-po\')">✕</button>'+
      '</div>'+
      '<div class="modal-body" id="vpo-body"></div>'+
      '<div class="modal-footer" id="vpo-footer"></div>'+
    '</div>';
  document.body.appendChild(d);
}

function _vendorOptions(selName){
  var list=[];
  try{ if(window.contracts && typeof contracts.vendors==="function") list = contracts.vendors(); }catch(e){}
  var norm=function(s){ return String(s||"").trim(); };
  var found = list.find(function(v){ return norm(v.name)===norm(selName) && norm(selName); });
  var opts = list.map(function(v){
    return '<option value="'+_e(v.id)+'"'+(found&&found.id===v.id?' selected':'')+'>'+_e(v.name||v.id)+'</option>';
  }).join("");
  return { html: opts + '<option value="__manual__"'+(!found?' selected':'')+'>— كتابة اسم المورد يدوياً —</option>',
           matched: !!found };
}

function open(poId){
  var p=_findPO(poId);
  if(!p){ _toast("⚠ لم يُعثر على الطلب","warn"); return; }
  var gate = canIssue(p, _role(), null);
  if(!gate.ok){ _toast("⚠ "+gate.why,"warn"); return; }
  _openId = poId;
  _ensureModal();
  loadTemplates().then(function(){ _render(p, gate); });
  _render(p, gate);
  if(typeof openModal==="function") openModal("modal-vendor-po");
}
function close(){ _openId=null; if(typeof closeModal==="function") closeModal("modal-vendor-po"); }

function _projName(p){
  try{
    if(typeof poProjectDisplayName==="function") return poProjectDisplayName(p)||"—";
    if(p.isCustomProject) return p.projectName||"—";
    if(typeof _getProjName==="function") return _getProjName(p.projectId)||p.projectName||"—";
  }catch(e){}
  return p.projectName||p.building||"—";
}
function _defaultDate(p){
  try{
    if(typeof poPromiseDate==="function" && poPromiseDate(p)) return String(poPromiseDate(p)).slice(0,10);
    if(typeof poNeedDate==="function" && poNeedDate(p)) return String(poNeedDate(p)).slice(0,10);
  }catch(e){}
  return "";
}

/* صفُّ بندٍ في جدول النافذة — مصدرٌ واحدٌ للرسم الأوّليّ ولزرّ «إضافة بند».
   الفرقُ الوحيدُ بين بندِ الطلب والبندِ الإضافيّ: الأوّلُ اسمُه ووحدتُه نصٌّ ثابت
   (لا يُحرَّر ما اعتُمد)، والثاني حقولٌ مفتوحةٌ وزرُّ حذف. وكلاهما يقرؤه
   `_readItems` بنفس الأصناف — فلا مسارَ قراءةٍ ثانٍ ينحرف. */
function _rowHTML(it, i){
  it = it || {};
  var ex = !!it.extra;
  var nameCell = ex
    ? '<div style="display:flex;gap:6px;align-items:center">'+
        '<input class="form-input vpo-nm" value="'+_e(it.itemName||"")+'" placeholder="اسم البند الإضافي" style="min-width:150px">'+
        '<button class="btn btn-ghost btn-sm vpo-del" onclick="vendorPO.removeItem(this)" title="حذف البند الإضافي" style="padding:2px 8px;line-height:1.6">✕</button>'+
        '<input type="hidden" class="vpo-cd" value=""><input type="hidden" class="vpo-id" value="">'+
      '</div>'+
      '<div style="font-size:10.5px;color:var(--muted);margin-top:3px">بند إضافي — خارج بنود طلب الشراء</div>'
    : (it.itemCode?'<span class="po-code">'+_e(it.itemCode)+'</span> ':'')+_e(it.itemName||"—")+
      '<input type="hidden" class="vpo-nm" value="'+_e(it.itemName||"")+'">'+
      '<input type="hidden" class="vpo-cd" value="'+_e(it.itemCode||"")+'">'+
      '<input type="hidden" class="vpo-id" value="'+_e(it.itemId||"")+'">';
  var unitCell = ex
    ? '<input class="form-input vpo-un" value="'+_e(it.unit||"")+'" placeholder="الوحدة" style="width:84px;text-align:center">'
    : _e(it.unit||"—")+'<input type="hidden" class="vpo-un" value="'+_e(it.unit||"")+'">';
  return '<tr data-i="'+i+'"'+(ex?' data-extra="1"':'')+'>'+
    '<td style="text-align:center"><input type="checkbox" class="vpo-inc" checked onchange="vendorPO.recalc()"></td>'+
    '<td>'+nameCell+'</td>'+
    '<td style="text-align:center"><input type="number" class="form-input vpo-qty" value="'+(Number(it.qty)||0)+'" min="0" step="any" style="width:84px;text-align:center" oninput="vendorPO.recalc()"></td>'+
    '<td style="text-align:center">'+unitCell+'</td>'+
    '<td style="text-align:center"><input type="number" class="form-input vpo-price" value="'+(Number(it.unitCost)||0)+'" min="0" step="any" style="width:104px;text-align:center" oninput="vendorPO.recalc()"></td>'+
    /* «mono» في app.css تحمل display:inline-block — على <td> تُخرج الخليةَ من
       تخطيط الجدول فتطفو الأرقام خارج أعمدتها (بلاغ المالك v18.9.2841).
       فالخطُّ هنا سطريٌّ على الخلية، والصنفُ لا يُوضَع على خلايا جدولٍ أبداً. */
    '<td style="text-align:center;font-family:\'JetBrains Mono\',monospace" class="vpo-vat">—</td>'+
    '<td style="text-align:center;font-weight:800;font-family:\'JetBrains Mono\',monospace" class="vpo-line">—</td>'+
  '</tr>';
}

function _render(p, gate){
  var body=document.getElementById("vpo-body"), foot=document.getElementById("vpo-footer");
  if(!body||!foot) return;
  var existing = p.vendorPO||null;
  var src = existing || {};
  var items = existing ? (existing.items||[]).map(function(it){ return {itemId:it.itemId,itemCode:it.itemCode,itemName:it.itemName,qty:it.qty,unit:it.unit,unitCost:it.unitCost,extra:!!it.extra}; })
                       : defaultItems(p);
  var vop = _vendorOptions(existing?existing.vendorName:(p.vendor||""));
  var covered = ((p.items)||[]).filter(function(it){ return it&&it._fullyCoveredByStock; }).length;
  var tpls = templates();

  var existBanner = existing ?
    '<div style="background:color-mix(in srgb,var(--accent) 10%,var(--surface));border:1.5px solid color-mix(in srgb,var(--accent) 35%,var(--border));border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:12.5px">'+
      _icx("checkCircle","ic-sm")+' صدر أمر شراء لهذا الطلب — <b>'+_e(existing.vendorName||"—")+'</b> · مراجعة '+(Number(existing.rev)||1)+' · '+_fmtD(existing.issuedAt)+
      ' · الإجمالي <b class="mono">'+_fmtN(existing.total)+'</b> ر.س'+
      (gate.reprintOnly?'':' — الإصدار من جديد يحفظ هذه النسخة في السجل ويرفع رقم المراجعة.')+
    '</div>' : '';

  var rows = items.map(function(it,i){ return _rowHTML(it,i); }).join("");

  body.innerHTML =
    existBanner+
    (gate.reprintOnly?
      '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:12.5px">الطلب خارج مراحل الإصدار — العرض والطباعة فقط.</div>' : '')+
    '<div class="d-sec"><div class="d-sec-label">المورد</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'+
        '<div><label class="form-label">المورد (من سجل الأطراف)</label>'+
          '<select class="form-input" id="vpo-vendor" onchange="vendorPO.vendorChanged()" '+(gate.reprintOnly?'disabled':'')+'>'+vop.html+'</select></div>'+
        '<div id="vpo-manual-wrap" style="'+(vop.matched?'display:none':'')+'"><label class="form-label">اسم المورد (يدوي)</label>'+
          '<input class="form-input" id="vpo-vendor-manual" value="'+_e(existing?existing.vendorName:(p.vendor||""))+'" placeholder="اسم المورد كما سيُطبع" '+(gate.reprintOnly?'disabled':'')+'></div>'+
      '</div></div>'+
    '<div class="d-sec" style="margin-top:12px"><div class="d-sec-label">التوريد</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'+
        '<div><label class="form-label">مكان التسليم</label>'+
          '<input class="form-input" id="vpo-place" value="'+_e(existing?existing.deliveryPlace:_projName(p))+'" '+(gate.reprintOnly?'disabled':'')+'></div>'+
        '<div><label class="form-label">موعد التوريد المطلوب</label>'+
          '<input class="form-input" type="date" id="vpo-date" value="'+_e(existing?String(existing.deliveryDate||"").slice(0,10):_defaultDate(p))+'" '+(gate.reprintOnly?'disabled':'')+'></div>'+
      '</div></div>'+
    '<div class="d-sec" style="margin-top:12px"><div class="d-sec-label">البنود والأسعار (قابلة للتعديل قبل الإصدار)</div>'+
      (covered?'<div style="font-size:11.5px;color:var(--muted);margin-bottom:6px">'+_icx("alertCircle","ic-sm ic-muted")+' '+covered+' بند مغطّى من المخزون بالكامل — لا يدخل أمر المورد.</div>':'')+
      '<div class="po-items-scroll"><table class="po-table" style="min-width:760px" id="vpo-items">'+
        '<thead><tr><th style="text-align:center">✔</th><th class="th-r">البند</th><th>الكمية</th><th>الوحدة</th><th>سعر الوحدة (قبل الضريبة)</th><th>ض.ق.م 15%</th><th>إجمالي البند</th></tr></thead>'+
        '<tbody>'+(rows||'<tr><td colspan="7" style="text-align:center;padding:14px">لا بنود للشراء</td></tr>')+'</tbody>'+
        '<tfoot><tr style="font-weight:800"><td colspan="4" style="text-align:left">الإجمالي</td>'+
          '<td style="text-align:center;font-family:\'JetBrains Mono\',monospace" id="vpo-net">—</td>'+
          '<td style="text-align:center;font-family:\'JetBrains Mono\',monospace" id="vpo-vatsum">—</td>'+
          '<td style="text-align:center;font-family:\'JetBrains Mono\',monospace" id="vpo-total">—</td></tr></tfoot>'+
      '</table></div>'+
      (gate.reprintOnly?'':
        '<div style="margin-top:8px"><button class="btn btn-ghost btn-sm" onclick="vendorPO.addItem()" title="بندٌ يُضاف إلى أمر المورد وحدَه — لا يُكتب على بنود طلب الشراء">'+_icx("plus","ic-sm")+' إضافة بند خارج بنود الطلب</button></div>')+
      '<div id="vpo-extra-note" style="margin-top:8px"></div>'+
    '</div>'+
    '<div class="d-sec" style="margin-top:12px"><div class="d-sec-label">الشروط</div>'+
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px">'+
        '<select class="form-input" id="vpo-tpl" style="max-width:280px">'+
          tpls.map(function(t,i){ return '<option value="'+i+'">'+_e(t.title||("قالب "+(i+1)))+'</option>'; }).join("")+
        '</select>'+
        '<button class="btn btn-ghost btn-sm" onclick="vendorPO.insertTemplate()" '+(gate.reprintOnly?'disabled':'')+'>إدراج القالب</button>'+
        (VPO_ROLES.indexOf(_role())!==-1?'<button class="btn btn-ghost btn-sm" onclick="vendorPO.saveTemplate()" '+(gate.reprintOnly?'disabled':'')+' title="يحفظ نص الشروط الحالي قالباً جديداً">حفظ الشروط كقالب</button>':'')+
        (_role()==="admin"?'<button class="btn btn-ghost btn-sm" onclick="vendorPO.deleteTemplate()" title="حذف القالب المحدد — للمسؤول">حذف القالب المحدد</button>':'')+
      '</div>'+
      '<textarea class="form-textarea" id="vpo-terms" rows="5" placeholder="شروط أمر الشراء — أدرج قالباً أو اكتب يدوياً" '+(gate.reprintOnly?'disabled':'')+'>'+
        _e(existing?existing.terms:"")+'</textarea></div>'+
    '<div class="d-sec" style="margin-top:12px"><div class="d-sec-label">ملاحظات (تُطبع على الأمر)</div>'+
      '<textarea class="form-textarea" id="vpo-notes" rows="2" '+(gate.reprintOnly?'disabled':'')+'>'+_e(existing?existing.notes:"")+'</textarea></div>';

  foot.innerHTML =
    '<button class="btn btn-ghost btn-sm" onclick="vendorPO.close()">إغلاق</button>'+
    (existing?'<button class="btn btn-sm po-btn-accent" onclick="vendorPO.print(\''+_e(p.id)+'\')">'+_icx("printer","ic-sm ic-white")+' طباعة النسخة الصادرة (مراجعة '+(Number(existing.rev)||1)+')</button>':'')+
    (gate.reprintOnly?'':'<button class="btn btn-primary btn-sm" onclick="vendorPO.issue()">'+_icx("send","ic-sm ic-white")+' '+(existing?"إصدار مراجعة جديدة وطباعتها":"إصدار الأمر وطباعته")+'</button>');

  recalc();
}

function vendorChanged(){
  var sel=document.getElementById("vpo-vendor"), wrap=document.getElementById("vpo-manual-wrap");
  if(sel&&wrap) wrap.style.display = (sel.value==="__manual__") ? "" : "none";
}
function insertTemplate(){
  var sel=document.getElementById("vpo-tpl"), ta=document.getElementById("vpo-terms");
  if(!sel||!ta) return;
  var t=templates()[Number(sel.value)||0]; if(!t) return;
  ta.value = (ta.value?ta.value.replace(/\s+$/,"")+"\n":"") + "• " + (t.body||"");
}
function saveTemplate(){
  var ta=document.getElementById("vpo-terms");
  var text=(ta&&ta.value||"").trim();
  if(!text){ _toast("⚠ لا نص شروطٍ ليُحفَظ قالباً","warn"); return; }
  if(VPO_ROLES.indexOf(_role())===-1){ _toast("⚠ حفظ القوالب لمسؤول المشتريات والمسؤول","warn"); return; }
  var title=prompt("اسم القالب:"); if(!title||!title.trim()) return;
  var list=templates();
  list.push({ id:"t"+Date.now(), title:title.trim(), body:text });
  _persistTemplates(list,"إضافة «"+title.trim()+"»").then(function(){
    _toast("✅ حُفظ القالب","success");
    var p=_findPO(_openId); if(p) _render(p, canIssue(p,_role(),null));
  }).catch(function(){ _toast("⚠ تعذّر حفظ القالب","warn"); });
}
function deleteTemplate(){
  if(_role()!=="admin"){ _toast("⚠ حذف القوالب للمسؤول فقط","warn"); return; }
  var sel=document.getElementById("vpo-tpl"); if(!sel) return;
  var list=templates(), i=Number(sel.value)||0;
  if(!list[i]) return;
  if(!confirm("حذف قالب «"+(list[i].title||"")+"»؟")) return;
  var removed=list.splice(i,1)[0];
  _persistTemplates(list,"حذف «"+(removed.title||"")+"»").then(function(){
    _toast("✅ حُذف القالب","success");
    var p=_findPO(_openId); if(p) _render(p, canIssue(p,_role(),null));
  }).catch(function(){ _toast("⚠ تعذّر الحذف","warn"); });
}

function _readItems(){
  var out=[];
  var tb=document.querySelectorAll("#vpo-items tbody tr[data-i]");
  tb.forEach(function(tr){
    var inc=tr.querySelector(".vpo-inc");
    var item={
      itemId:(tr.querySelector(".vpo-id")||{}).value||"",
      itemCode:(tr.querySelector(".vpo-cd")||{}).value||"",
      itemName:(tr.querySelector(".vpo-nm")||{}).value||"",
      unit:(tr.querySelector(".vpo-un")||{}).value||"",
      qty:Number((tr.querySelector(".vpo-qty")||{}).value)||0,
      unitCost:Number((tr.querySelector(".vpo-price")||{}).value)||0,
      extra: tr.getAttribute("data-extra")==="1",
      _included: !!(inc&&inc.checked),
      _tr: tr,
    };
    out.push(item);
  });
  return out;
}
function recalc(){
  var items=_readItems(), inc=[];
  items.forEach(function(it){
    var l=lineCalc(it.unitCost, it.qty);
    var vc=it._tr.querySelector(".vpo-vat"), lc=it._tr.querySelector(".vpo-line");
    if(vc) vc.textContent = it._included ? _fmtN(l.vat) : "—";
    if(lc) lc.textContent = it._included ? _fmtN(l.total) : "—";
    it._tr.style.opacity = it._included ? "" : ".45";
    if(it._included) inc.push(it);
  });
  var t=totalsOf(inc);
  var en=document.getElementById("vpo-net"), ev=document.getElementById("vpo-vatsum"), et=document.getElementById("vpo-total");
  if(en) en.textContent=_fmtN(t.net);
  if(ev) ev.textContent=_fmtN(t.vat);
  if(et) et.textContent=_fmtN(t.total);
  /* تنبيهُ التجاوز: البنودُ الإضافيةُ خارجُ ما اعتُمد في الطلب — يُعرَض عددُها
     وإجماليُّها صراحةً قبل الإصدار، فلا يمرّ التجاوزُ في رقمٍ مجموعٍ صامت. */
  var note=document.getElementById("vpo-extra-note");
  if(note){
    var ex=extrasOf(inc);
    note.innerHTML = ex.count ?
      '<div style="background:color-mix(in srgb,var(--warn,#b45309) 10%,var(--surface));border:1.5px solid color-mix(in srgb,var(--warn,#b45309) 35%,var(--border));border-radius:10px;padding:8px 12px;font-size:12px">'+
        _icx("alertCircle","ic-sm")+' <b>'+ex.count+' بند إضافي</b> خارج بنود طلب الشراء بإجمالي <b class="mono">'+_fmtN(ex.total)+'</b> ر.س — '+
        'أمرُ المورد يتجاوز بذلك المعتمَدَ في الطلب، ويُقيَّد ذلك في سجلّ الطلب وسجلّ التدقيق.'+
      '</div>' : "";
  }
}

/* إضافةُ بندٍ خارج بنود الطلب — يُلحَق بالجدول مباشرةً (لا إعادةَ رسمٍ للنافذة)
   كي لا تضيع تعديلاتُ الأسعار والكميات التي كتبها المستخدمُ قبل الإضافة. */
function addItem(){
  var tb=document.querySelector("#vpo-items tbody");
  if(!tb) return;
  var blank=tb.querySelector("tr:not([data-i])");
  if(blank) blank.remove();
  var i=tb.querySelectorAll("tr[data-i]").length;
  var wrap=document.createElement("tbody");
  wrap.innerHTML=_rowHTML({ itemName:"", unit:"", qty:1, unitCost:0, extra:true }, i);
  var tr=wrap.firstElementChild;
  if(!tr) return;
  tb.appendChild(tr);
  try{ var nm=tr.querySelector(".vpo-nm"); if(nm){ nm.oninput=recalc; nm.focus(); } }catch(e){}
  recalc();
}
function removeItem(btn){
  var tr=btn&&btn.closest?btn.closest("tr[data-i]"):null;
  if(!tr || tr.getAttribute("data-extra")!=="1") return;
  tr.remove();
  recalc();
}

function _selectedVendor(){
  var sel=document.getElementById("vpo-vendor");
  if(sel && sel.value!=="__manual__" && window.contracts && typeof contracts.vendorById==="function"){
    var v=contracts.vendorById(sel.value);
    if(v){
      var lg=v.legal||{};
      return { vendorId:v.id, vendorName:v.name||"", vendorPhone:v.phone||"",
               vendorVatNo:lg.vatNumber||"", vendorCrNo:lg.crNumber||"" };
    }
  }
  var manual=((document.getElementById("vpo-vendor-manual")||{}).value||"").trim();
  // اسمٌ يدويٌّ يطابق طرفاً مسجَّلاً (بالتطبيع) ⇒ تُحمَّل هويتُه تلقائياً (طلب المالك)
  var reg=_vendorFromRegistry(manual);
  if(reg){
    var rlg=reg.legal||{};
    return { vendorId:reg.id, vendorName:reg.name||manual, vendorPhone:reg.phone||"",
             vendorVatNo:rlg.vatNumber||"", vendorCrNo:rlg.crNumber||"" };
  }
  return { vendorId:"", vendorName:manual, vendorPhone:"", vendorVatNo:"", vendorCrNo:"" };
}

function issue(){
  var p=_findPO(_openId);
  if(!p){ _toast("⚠ لم يُعثر على الطلب","warn"); return false; }
  var gate=canIssue(p,_role(),null);
  if(!gate.ok||gate.reprintOnly){ _toast("⚠ "+(gate.why||"الطلب خارج مراحل الإصدار"),"warn"); return false; }
  var vend=_selectedVendor();
  if(!vend.vendorName){ _toast("⚠ اختر المورد أو اكتب اسمه","warn"); return false; }
  var items=_readItems().filter(function(it){ return it._included && it.qty>0; })
    .map(function(it){ return { itemId:it.itemId, itemCode:it.itemCode, itemName:String(it.itemName||"").trim(),
                                unit:String(it.unit||"").trim(), qty:it.qty, unitCost:it.unitCost, extra:!!it.extra }; });
  if(!items.length){ _toast("⚠ لا بند واحداً مشمولاً في الأمر","warn"); return false; }
  /* بندٌ إضافيٌّ بلا اسمٍ يُطبَع سطراً فارغاً في وثيقةٍ تخرج للمورد — يُوقَف هنا */
  if(items.some(function(it){ return it.extra && !it.itemName; })){
    _toast("⚠ اكتب اسم البند الإضافي أو احذف سطره","warn"); return false;
  }
  if(items.some(function(it){ return !(it.unitCost>0); })){
    if(!confirm("يوجد بند بسعر صفر — إصدار الأمر مع ذلك؟")) return false;
  }
  var _ex=extrasOf(items);
  if(_ex.count && !confirm("الأمرُ يتضمّن "+_ex.count+" بنداً إضافياً خارج بنود طلب الشراء بإجمالي "+_fmtN(_ex.total)+" ر.س — إصداره على هذا النحو؟")) return false;
  if(p.vendorPO && !confirm("صدر أمرٌ سابق لهذا الطلب (مراجعة "+(Number(p.vendorPO.rev)||1)+") — إصدار مراجعة جديدة؟ النسخة السابقة تُحفظ في السجل.")) return false;

  var u=_me();
  var payload={
    vendorId:vend.vendorId, vendorName:vend.vendorName, vendorPhone:vend.vendorPhone,
    vendorVatNo:vend.vendorVatNo, vendorCrNo:vend.vendorCrNo,
    deliveryPlace:((document.getElementById("vpo-place")||{}).value||"").trim(),
    deliveryDate:((document.getElementById("vpo-date")||{}).value||"").trim(),
    terms:((document.getElementById("vpo-terms")||{}).value||"").trim(),
    notes:((document.getElementById("vpo-notes")||{}).value||"").trim(),
    items:items,
  };
  var vpo=applyIssue(p, payload, { now:new Date().toISOString(), by:(u&&u.name)||"—", byUser:(u&&u.user)||"" });
  if(!vpo) return false;
  if(typeof savePurchase==="function" && !savePurchase(p.id)) return false;
  try{ if(typeof logAudit==="function") logAudit("إصدار أمر شراء للمورد",
    "رقم الطلب: "+p.id+" — المورد: "+vpo.vendorName+" — مراجعة "+vpo.rev+" — الإجمالي: "+_fmtN(vpo.total)+" ر.س"+
    (_ex.count ? (" — بنود إضافية خارج الطلب: "+_ex.count+" بإجمالي "+_fmtN(_ex.total)+" ر.س") : "")); }catch(e){}
  _toast("✅ صدر أمر الشراء — "+p.id+(vpo.rev>1?" (مراجعة "+vpo.rev+")":""),"success");
  close();
  try{ if(typeof updatePurchaseBadge==="function") updatePurchaseBadge(); }catch(e){}
  try{ if(typeof renderPurchases==="function") renderPurchases(); }catch(e){}
  try{
    var overlay=document.getElementById("modal-purchase-detail");
    if(overlay && overlay.classList.contains("open") && typeof openPurchaseDetail==="function") openPurchaseDetail(p.id);
  }catch(e){}
  print(p.id);
  return true;
}

/* ════════ المخرَج الورقي (PDF عبر نافذة الطباعة) ════════ */
function _letterhead(){
  try{
    if(window.contracts && typeof contracts._letterheadAssets==="function"){
      var l=contracts._letterheadAssets();
      if(typeof contracts._letterheadOn==="function" && contracts._letterheadOn(l)) return l;
    }
  }catch(e){}
  return null;
}
function print(poId){
  var p=_findPO(poId||_openId);
  if(!p||!p.vendorPO){ _toast("⚠ لا أمر شراء صادراً لهذا الطلب","warn"); return; }
  var v=p.vendorPO;
  var lh=_letterhead(), lhOn=!!lh;
  var logoSrc=""; try{ logoSrc=(document.querySelector(".logo-img")||{}).src||""; }catch(e){}

  var rows=(v.items||[]).map(function(it,i){
    return '<tr>'+
      '<td style="text-align:center">'+(i+1)+'</td>'+
      '<td>'+(it.itemCode?'<span style="font-family:monospace;font-size:10px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:4px;padding:1px 5px">'+_e(it.itemCode)+'</span> ':'')+_e(it.itemName||"—")+
        (it.extra?' <span style="font-size:9px;font-weight:700;color:#b45309;background:#fff7ed;border:1px solid #fed7aa;border-radius:4px;padding:1px 5px">إضافي</span>':'')+'</td>'+
      '<td style="text-align:center;font-weight:700">'+_fmtN(it.qty)+'</td>'+
      '<td style="text-align:center">'+_e(it.unit||"—")+'</td>'+
      '<td style="text-align:center;direction:ltr;font-family:monospace">'+_fmtN(it.unitCost)+'</td>'+
      '<td style="text-align:center;direction:ltr;font-family:monospace">'+_fmtN(it.vat)+'</td>'+
      '<td style="text-align:center;direction:ltr;font-family:monospace;font-weight:800">'+_fmtN(it.total)+'</td>'+
    '</tr>';
  }).join("");

  // الاعتمادات الداخلية أسفل الوثيقة (طلب المالك) — «لم يعتمد بعد» تُطبع صراحةً
  // كما في ورقة المستخلص، فمن يقرأ الورقة يعرف أين يقف الطلب لا يستنتجه من فراغ.
  var signoffs = poSignoffs(p);
  // الخانات صفٌّ واحدٌ دائماً بعددها الفعليّ — auto-fit كانت تكسر الخامسة سطراً وحدها
  var apprHtml = signoffs.length ? '<div class="st">'+_icx("clipboardCheck","ic-sm")+' الاعتمادات الداخلية</div><div class="appr" style="grid-template-columns:repeat('+signoffs.length+',1fr)">'+
    signoffs.map(function(g){
      return '<div class="ap"><div class="ap-l">'+_e(g.lbl)+'</div>'+
        '<div class="ap-n">'+(g.by?_e(g.by):'<span class="ap-w">لم يعتمد بعد</span>')+'</div>'+
        '<div class="ap-d">'+(g.at?_fmtD(g.at):'—')+'</div></div>';
    }).join("")+'</div>' : '';

  var termsHtml = v.terms ? '<div class="st">'+_icx("scrollText","ic-sm")+' شروط أمر الشراء</div>'+
    '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:11px;white-space:pre-line;line-height:1.75">'+_e(v.terms)+'</div>' : '';
  var notesHtml = v.notes ? '<div style="background:#f0f4ff;border:1px solid #c7d7f5;border-radius:8px;padding:8px 12px;margin-top:10px;font-size:11.5px;white-space:pre-line"><b>ملاحظات:</b> '+_e(v.notes)+'</div>' : '';

  /* رقمُ الشريط لاتينيٌّ صِرف («Rev 2» لا «مراجعة 2») — خلطُ العربية بالرقم داخل
     خانة monospace كان يعبث بترتيب البِيدي في الترويسة (بلاغ المالك). */
  var headHtml = (window.contracts && typeof contracts._docHeadHTML==="function")
    ? contracts._docHeadHTML({ on:lhOn, logo:logoSrc, subtitle:"أمر شراء — Purchase Order", docNo:v.docNo+(v.rev>1?" - Rev "+v.rev:"") })
    : '<div class="dochead"><div class="dh-t">أمر شراء — Purchase Order</div><div class="doc-no">'+_e(v.docNo)+'</div></div>';

  /* هويةُ المورد (السجل التجاري · الرقم الضريبي) بطاقتان دائمتان (طلب المالك) —
     وإن خلت لقطةُ الأمر منهما (اسمٌ يدويٌّ وقتَ الإصدار) تُحمَّلان من سجل الأطراف
     بمطابقة الاسم المطبَّع لحظةَ الطباعة، فتنفع الأوامرَ الصادرةَ قبل هذه الميزة. */
  var _vv = v.vendorVatNo||"", _vc = v.vendorCrNo||"", _vp = v.vendorPhone||"";
  if(!_vv || !_vc || !_vp){
    var _reg = _vendorFromRegistry(v.vendorName);
    if(_reg){
      var _rlg = _reg.legal||{};
      _vv = _vv || _rlg.vatNumber || "";
      _vc = _vc || _rlg.crNumber || "";
      _vp = _vp || _reg.phone || "";
    }
  }

  /* أوامرُ صدرت قبل هذه الميزة لا تحمل `extrasCount` — تُحسَب من البنود، والنتيجةُ
     صفرٌ لأن لا بند فيها يحمل `extra` (لا تُقرأ اللقطةُ الغائبةُ صفراً بالخطأ). */
  var _pex = { count:Number(v.extrasCount)||0, total:Number(v.extrasTotal)||0 };
  if(!_pex.count) _pex = extrasOf(v.items);

  var inner =
    headHtml+
    '<div class="ig" style="margin-top:12px">'+
      '<div class="ii"><div class="il">تاريخ الإصدار</div><div class="iv">'+_fmtD(v.issuedAt)+(v.rev>1?' <span style="color:#b45309">(مراجعة '+v.rev+')</span>':'')+'</div></div>'+
      '<div class="ii"><div class="il">أصدره</div><div class="iv">'+_e(v.issuedBy||"—")+'</div></div>'+
      '<div class="ii"><div class="il">المورد</div><div class="iv">'+_e(v.vendorName||"—")+'</div></div>'+
      '<div class="ii"><div class="il">السجل التجاري للمورد</div><div class="iv" style="font-family:monospace">'+(_vc?_e(_vc):"—")+'</div></div>'+
      '<div class="ii"><div class="il">الرقم الضريبي للمورد</div><div class="iv" style="font-family:monospace">'+(_vv?_e(_vv):"—")+'</div></div>'+
      '<div class="ii"><div class="il">جوال المورد</div><div class="iv" style="direction:ltr">'+(_vp?_e(_vp):"—")+'</div></div>'+
      '<div class="ii"><div class="il">مكان التسليم</div><div class="iv">'+_e(v.deliveryPlace||"—")+'</div></div>'+
      '<div class="ii"><div class="il">موعد التوريد المطلوب</div><div class="iv">'+_fmtD(v.deliveryDate)+'</div></div>'+
    '</div>'+
    '<div class="st">'+_icx("clipboardList","ic-sm")+' البنود المطلوب توريدها ('+(v.items||[]).length+')</div>'+
    '<table class="items">'+
      '<thead><tr><th style="width:24px">#</th><th style="text-align:right">البند</th><th>الكمية</th><th>الوحدة</th><th>سعر الوحدة</th><th>ض.ق.م 15%</th><th>الإجمالي</th></tr></thead>'+
      '<tbody>'+rows+
        '<tr style="background:#f0f4ff;font-weight:800">'+
          '<td colspan="4" style="text-align:left">الإجمالي</td>'+
          '<td style="text-align:center;direction:ltr;font-family:monospace">'+_fmtN(v.net)+'</td>'+
          '<td style="text-align:center;direction:ltr;font-family:monospace">'+_fmtN(v.vat)+'</td>'+
          '<td style="text-align:center;direction:ltr;font-family:monospace">'+_fmtN(v.total)+'</td>'+
        '</tr>'+
      '</tbody>'+
    '</table>'+
    '<div style="margin-top:6px;font-size:11px;color:#475569">الإجمالي شامل ضريبة القيمة المضافة 15٪: <b style="direction:ltr;display:inline-block;font-family:monospace">'+_fmtN(v.total)+'</b> ر.س'+
      (_pex.count?' — منها <b>'+_pex.count+'</b> بند إضافي بإجمالي <b style="direction:ltr;display:inline-block;font-family:monospace">'+_fmtN(_pex.total)+'</b> ر.س':'')+'</div>'+
    termsHtml+notesHtml+
    /* الترقيمُ ديناميكيّ (بلاغا المالك): وحدتان صغيرتان لا كتلةٌ واحدة — الاعتماداتُ
       وحدةٌ (.appr) والتوقيعاتُ مع التذييل وحدةٌ (.sigblk). فما اتّسعت له صفحةُ
       البنود بقي فيها، وما ضاق انتقل وحدَه كاملاً. الكتلةُ الكبيرةُ الواحدة كانت
       تقفز بكاملها لصفحةٍ ثانية رغم اتّساع الأولى — محرّكُ التقسيم داخل جدول
       الورقة الرسمية يتحفّظ مع الكتل الكبيرة. */
    apprHtml+
    '<div class="sigblk">'+
    '<div class="sig">'+
      '<div>مسؤول المشتريات<br><b>'+_e(v.issuedBy||"")+'</b></div>'+
      '<div>ختم وتوقيع الشركة<br><b>&nbsp;</b></div>'+
      '<div>استلام المورد (الاسم والتوقيع)<br><b>&nbsp;</b></div>'+
    '</div>'+
    '<div class="pf foot"><span>طُبع بتاريخ: '+_fmtD(new Date().toISOString())+'</span><span>'+_e(v.docNo)+'</span><span>شركة المباني السريعة للمقاولات</span></div>'+
    '</div>';

  var baseCss =
    '@page{size:A4 portrait;margin:12mm 14mm}'+
    '*{box-sizing:border-box}'+
    "body{font-family:'Cairo','Tajawal',sans-serif;direction:rtl;background:#fff;color:#1a202c;font-size:12.5px}"+
    '.dochead{display:flex;justify-content:space-between;align-items:center;gap:14px;border-bottom:3px solid #1b3a6b;padding-bottom:10px}'+
    '.dh-t{font-size:17px;font-weight:800;color:#1b3a6b}'+
    '.header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #1b3a6b;padding-bottom:10px}'+
    '.header-right{display:flex;align-items:center;gap:10px}'+
    '.company{font-size:16px;font-weight:900;color:#1b3a6b}'+
    '.subtitle{font-size:11px;color:#64748b}'+
    '.company-logo{width:54px;height:54px;object-fit:contain}'+
    '.doc-no{font-family:monospace;font-size:13px;font-weight:800;color:#1b3a6b}'+
    /* بطاقاتُ المعلومات ٤ أعمدة مضغوطة — كانت ٣ أعمدةً بثلاثة صفوفٍ عريضة تلتهم
       ~٥ سم فترحّل التوقيعاتِ للصفحة الثانية (بلاغ المالك الثالث). */
    '.ig{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:8px}'+
    '.ii{background:#f8fafc;border-radius:6px;padding:4px 7px;border:1px solid #e2e8f0}'+
    '.il{font-size:8.5px;font-weight:700;color:#64748b;margin-bottom:1px}'+
    '.iv{font-size:10.5px;font-weight:700;color:#1a202c;line-height:1.5}'+
    '.st{font-size:13px;font-weight:800;color:#1b3a6b;margin:11px 0 6px;padding-bottom:4px;border-bottom:2px solid #e2e8f0}'+
    /* أنماطُ الجدول محصورةٌ في جدول البنود (.items) — قاعدةٌ عامةٌ على `table thead`
       كانت تلوّن **صفَّ ترويسة جدول الورقة الرسمية** (`.pg` جدولٌ بـthead يحجز مساحةَ
       الترويسة وحاشيتُه شفافة) شريطاً كحلياً أسفل الترويسة على كل صفحة (بلاغ المالك). */
    '.items{width:100%;border-collapse:collapse;font-size:11px}'+
    '.items th,.items td{border:1px solid #dde3ed;padding:5px 7px}'+
    '.items thead tr{background:#1b3a6b;color:#fff}'+
    '.appr{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:8px;break-inside:avoid}'+
    '.ap{border:1px solid #dde3ed;border-radius:8px;padding:8px;text-align:center}'+
    '.ap-l{font-size:10px;color:#64748b;font-weight:700}'+
    '.ap-n{font-size:12px;font-weight:800;margin-top:3px}'+
    '.ap-w{color:#b45309;font-weight:700;font-size:10.5px}'+
    '.ap-d{font-size:10px;color:#64748b;font-family:monospace}'+
    '.dochead{margin-top:3mm}'+
    '.sigblk{break-inside:avoid;page-break-inside:avoid}'+
    '.sig{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-top:18px;text-align:center;font-size:11px}'+
    '.sig div{border-top:1.5px solid #94a3b8;padding-top:6px}'+
    '.pf{margin-top:10px;padding-top:7px;border-top:1px solid #dde3ed;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between}';
  var lhCss = (lhOn && window.contracts && typeof contracts._letterheadCSS==="function") ? contracts._letterheadCSS() : "";
  var wrapped = (lhOn && window.contracts && typeof contracts._letterheadWrap==="function") ? contracts._letterheadWrap(inner, lh) : inner;

  var html='<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">'+
    /* عنوانُ النافذة هو اسمُ الملف الذي يقترحه المتصفّح عند «حفظ PDF» (طلب المالك:
       يُحفَظ باسمه) — رقمُ الأمر وحده بحروفٍ لاتينية، فالعربيةُ والشَّرطةُ الطويلة
       كانتا تُفسدان الاسمَ المقترَح فيكتبه المستخدمُ يدوياً. */
    '<title>'+_e(v.docNo+(v.rev>1?"-Rev"+v.rev:""))+'</title>'+
    '<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">'+
    '<style>'+baseCss+lhCss+'</style></head><body>'+wrapped+'</body></html>';

  try{
    if(typeof _openPrintWindow==="function") _openPrintWindow(html);
    else{ var w=window.open("","_blank"); if(w){ w.document.write(html); w.document.close(); } }
  }catch(e){ console.warn("vendorPO/print",e); _toast("⚠ تعذّر فتح نافذة الطباعة","warn"); }
}

/* بوابة زر التفاصيل — تُنادى من index.html */
function canIssueBtn(p){ return canIssue(p, _role(), null).ok; }

/* ════════ الواجهة العامة ════════ */
window.vendorPO = {
  MODULE_BUILD: MODULE_BUILD,
  open: open, close: close, issue: issue, print: print,
  recalc: recalc, vendorChanged: vendorChanged,
  addItem: addItem, removeItem: removeItem,
  insertTemplate: insertTemplate, saveTemplate: saveTemplate, deleteTemplate: deleteTemplate,
  canIssueBtn: canIssueBtn,
  templates: templates, loadTemplates: loadTemplates,
  // نقيّة — يفحصها hail-tests.js بلا متصفح
  _lineCalc: lineCalc, _totals: totalsOf, _buyQty: buyQty,
  _defaultItems: defaultItems, _canIssue: canIssue, _applyIssue: applyIssue, _extras: extrasOf,
  _signoffs: poSignoffs,
  _matchVendor: matchVendor, _normVendorName: normVendorName,
  _ISSUE_STAGES: VPO_STAGES.slice(), _ROLES: VPO_ROLES.slice(),
  _DEFAULT_TEMPLATES: VPO_DEFAULT_TEMPLATES.slice(),
};

})();
