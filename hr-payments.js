/* ═══════════════════════════════════════════════════════════════════════════
   نظام هيل — وحدة سداد أعمال الموارد البشرية  (hr-payments.js)
   ملف خارجي مستقل يُحقَن في صفحتَي #page-hr-payments و #page-new-hr-payment،
   على نمط finance-audit.js و substitute-budget.js: IIFE يعرض كائناً واحداً
   window.hrPayments، ويقرأ خدمات النواة (db / storage / currentUser / esc /
   _jsq / toast / showConfirm / showCustomModal / logAudit / addNotification /
   fmtDate / CEO_APPROVAL_THRESHOLD / فحوص الأدوار) مباشرةً بالاسم — إذ تتشارك
   كل وسوم <script> الكلاسيكية نفس البيئة المعجمية العامة.

   الفكرة (متفق عليها مع المالك):
   • نافذة داخل المشتريات المركزية لسداد أعمال الموارد البشرية: إقامات، رخص
     عمل، تأشيرات، نقل كفالة، تأمين طبي… الطلب **مختصر**: نوع العمل + بيان
     مختصر + تكلفة السداد + مستند مرفق. لا بنود ولا كميات ولا موردين.
   • تسلسل الاعتماد:
         مسؤول الموارد البشرية ينشئ الطلب
              ↓
         مدير الموارد البشرية (بوّابة إلزامية لكل طلب جديد — v18.9)
              ↓ (اختار «يحتاج اعتماد مدير المشاريع»؟)
         مدير المشاريع
              ↓ (التكلفة ≥ سقف التنفيذي؟)
         المدير التنفيذي
              ↓
         المالية للسداد  →  يُغلق الطلب فور تسجيل السداد.
     بوّابة مدير الموارد البشرية تُثبَّت عند الإنشاء بحقل `needsHRM` — فالطلبات
     الأقدم (بلا الحقل) تمضي في مسارها الذي اعتُمدت عليه ولا تُعاد لبوّابةٍ لم
     تكن قائمةً يومها.

   ثلاثة ثوابت محكومة في التصميم:
   (١) **بوابة التنفيذي تُحسب من التكلفة، لا من اختيار مُنشئ الطلب.** خيار
       «يحتاج مدير المشاريع» يخصّ مدير المشاريع وحده؛ لو ربطنا بوابة التنفيذي
       باختيارٍ بشري لأمكن تمرير أي مبلغ للمالية باختيار «لا».
   (٢) **السقف يُقرأ من CEO_APPROVAL_THRESHOLD الموحّد** (مصدر واحد للحقيقة مع
       طلبات الشراء وطلبات التسعير، قابل للتعديل من Firestore بلا إعادة نشر) —
       لا رقم مكتوب هنا يفترق عنه بصمت بعد شهر.
   (٣) **التوجيه كلّه في دالة نقية واحدة `_nextStage`** تُستدعى عند الإنشاء
       وبعد اعتماد مدير المشاريع وبعد اعتماد التنفيذي وبعد كل إعادة إرسال —
       فلا مساران يفترقان. واعتماد التنفيذي يسقط تلقائياً إن رُفعت التكلفة فوق
       ما اعتمده (ceoApprovedAmount)، فلا يُسدَّد مبلغٌ لم يره أحد.

   الصلاحيات (متفق عليها — بيانات الإقامات والتأشيرات حساسة):
   • العرض: hr_officer + hr_manager + project_manager + ceo + finance + admin **فقط**.
     مسؤول المستودعات ومسؤول المشتريات والزائر والمراقب لا يرون المجموعة أصلاً.
   • الإنشاء/التعديل/إعادة الإرسال/الإلغاء: hr_officer + admin.
   • اعتماد/رفض بوّابة الموارد البشرية الأولى: hr_manager + admin.
   • اعتماد/رفض مرحلة مدير المشاريع: project_manager + admin.
   • اعتماد/رفض ما فوق السقف: ceo + admin.
   • تسجيل السداد (إيصال إلزامي) أو الإعادة للتصحيح: finance + admin.

   التخزين: مجموعة global_hr_payments (وثيقة لكل طلب، معرّفها HRP-YYMM-NNNN)،
   والعدّاد في meta/global_hr_payments_counter. كل كتابة عبر معاملة تقرأ الوثيقة
   الطازجة ثم تطبّق التعديل (نمط finance-audit) — فلا يدهس معتمِدان متزامنان عمل
   بعضهما. onSnapshot مصدر الحقيقة اللحظي.

   **منفصلة تماماً عن global_purchases**: لا تدخل تقارير المشتريات ولا تكاليف
   المشاريع ولا المخزون ولا البند المستعاض — فهذا مصروفٌ إداري لا شراء، وخلطه
   بأرقام الشراء يُفسد كل مؤشّرات التوريد.

   المرفقات تُخزَّن تحت مسار Storage `po/hr/{id}/…` — أي داخل بادئة `po/` القائمة
   عمداً: قواعد Storage تُدار خارج المستودع، ومسارٌ جذريّ جديد قد يُرفَض صامتاً
   عند الرفع. المعرّف HRP-… يفصل ملفات الموارد البشرية عن ملفات طلبات الشراء.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
  "use strict";

  var MODULE_BUILD = "v18.9.3080";

  function COLL(){
    var dev=false;
    try{ dev=(typeof IS_DEV!=="undefined" && IS_DEV); }catch(e){}
    return dev ? "global_hr_payments_dev" : "global_hr_payments";
  }
  function META_DOC(){
    var dev=false;
    try{ dev=(typeof IS_DEV!=="undefined" && IS_DEV); }catch(e){}
    return dev ? "meta/global_hr_payments_counter_dev" : "meta/global_hr_payments_counter";
  }

  /* ════════ نوعية الأعمال ════════
     قائمة مغلقة + «أخرى» بنصّ حرّ. المفاتيح إنجليزية ثابتة (لا تتغيّر مع تحرير
     التسمية العربية)، والتسمية وحدها هي المعروضة. */
  // الأيقونات من مجموعة أيقونات المنصة (_ICON) — لا إيموجي في متن الصفحات، كما في
  // بقية شاشات المشتريات؛ الإيموجي يبقى في السايدبار وحده حيث تستعمله المنصة.
  var WORK_TYPES = [
    {k:"residency",   l:"إقامات (إصدار / تجديد)",      icon:"user"},
    {k:"work_permit", l:"رخص عمل",                     icon:"fileText"},
    {k:"visa",        l:"تأشيرات",                     icon:"scrollText"},
    {k:"exit_reentry",l:"خروج وعودة",                  icon:"repeat"},
    {k:"sponsor_move",l:"نقل كفالة",                   icon:"rotateCcw"},
    {k:"insurance",   l:"تأمين طبي",                   icon:"shield"},
    {k:"labor_office",l:"مكتب العمل / رسوم حكومية",    icon:"landmark"},
    {k:"passport",    l:"جوازات / أحوال",              icon:"book"},
    {k:"advance",     l:"سلفة موظف",                   icon:"banknote"},
    {k:"travel_ticket",l:"تذاكر السفر",                icon:"ticket"},
    {k:"settlement",  l:"تصفية مستحقات",               icon:"receipt"},
    {k:"overtime",    l:"سداد بدل عمل إضافي",          icon:"clock"},
    {k:"other",       l:"أخرى",                        icon:"folderOpen"}
  ];
  var _WT_MAP = (function(){ var m={}; WORK_TYPES.forEach(function(w){ m[w.k]=w; }); return m; })();
  function workTypeLabel(req){
    if(!req) return "—";
    var w=_WT_MAP[req.workType];
    if(!w) return req.workType||"—";
    if(req.workType==="other") return (req.workTypeOther||"").trim() || w.l;
    return w.l;
  }
  function workTypeIcon(req){ var w=_WT_MAP[req&&req.workType]; return w?w.icon:"folderOpen"; }

  /* ════════ الحالات ════════ */
  var HRP_STATUS = {
    hrp_pending_hrm:     "بانتظار اعتماد مدير الموارد البشرية",
    hrp_pending_pm:      "بانتظار اعتماد مدير المشاريع",
    hrp_pending_ceo:     "بانتظار اعتماد المدير التنفيذي",
    hrp_pending_finance: "بانتظار سداد المالية",
    hrp_closed:          "مغلق — تم السداد",
    hrp_hrm_rejected:    "مرفوض من مدير الموارد البشرية",
    hrp_pm_rejected:     "مرفوض من مدير المشاريع",
    hrp_ceo_rejected:    "مرفوض من المدير التنفيذي",
    hrp_finance_returned:"مُعاد من المالية للتصحيح",
    hrp_cancelled:       "ملغي"
  };
  // الحالات النهائية — لا إجراء عليها بعد الآن (تُستثنى من «الجارية»).
  var HRP_FINAL = ["hrp_closed","hrp_cancelled"];
  // الحالات المرتدّة لمسؤول الموارد البشرية — قابلة للتصحيح وإعادة الإرسال.
  var HRP_BOUNCED = ["hrp_hrm_rejected","hrp_pm_rejected","hrp_ceo_rejected","hrp_finance_returned"];

  /* البوّابات: نفس أيقونات المنصة وشاراتها لنفس المعاني — بوّابة التنفيذي هنا هي
     بوّابة التنفيذي في طلبات الشراء، فتُقرأ بلا تعلّمٍ جديد (PO_STAGES/poStatusBadge). */
  var HRP_STAGES = [
    {key:"hrp_pending_hrm",     lbl:"مدير الموارد البشرية", icon:"users"},
    {key:"hrp_pending_pm",      lbl:"مدير المشاريع",   icon:"send"},
    {key:"hrp_pending_ceo",     lbl:"المدير التنفيذي", icon:"building2"},
    {key:"hrp_pending_finance", lbl:"سداد المالية",    icon:"banknote"},
    {key:"hrp_closed",          lbl:"إغلاق",           icon:"lock"}
  ];
  var _BADGE = {
    hrp_pending_hrm:     {cls:"b-po-approval",  icon:"users"},
    hrp_pending_pm:      {cls:"b-po-approval",  icon:"send"},
    hrp_pending_ceo:     {cls:"b-po-ceo",       icon:"building2"},
    hrp_pending_finance: {cls:"b-po-approval",  icon:"banknote"},
    hrp_closed:          {cls:"b-po-closed",    icon:"lock"},
    hrp_hrm_rejected:    {cls:"b-po-rejected",  icon:"xCircle"},
    hrp_pm_rejected:     {cls:"b-po-rejected",  icon:"xCircle"},
    hrp_ceo_rejected:    {cls:"b-po-rejected",  icon:"xCircle"},
    hrp_finance_returned:{cls:"b-po-rejected",  icon:"rotateCcw"},
    hrp_cancelled:       {cls:"b-po-cancelled", icon:"ban"}
  };
  // لون شريط بطاقة الطلب — نفس دلالات ألوان المنصة (توكنز، بلا ألوان جديدة).
  var _RAIL = {
    hrp_pending_hrm:"var(--stage-wait)",
    hrp_pending_pm:"var(--stage-wait)", hrp_pending_ceo:"var(--stage-wait)",
    hrp_pending_finance:"var(--stage-wait)", hrp_closed:"var(--stage-done)",
    hrp_hrm_rejected:"var(--danger)",
    hrp_pm_rejected:"var(--danger)", hrp_ceo_rejected:"var(--danger)",
    hrp_finance_returned:"var(--danger)", hrp_cancelled:"var(--muted)"
  };
  function statusLabel(s){ return HRP_STATUS[s] || s || "—"; }
  function isFinalStatus(s){ return HRP_FINAL.indexOf(s)>=0; }
  function isBouncedStatus(s){ return HRP_BOUNCED.indexOf(s)>=0; }
  function statusBadge(s){
    var m=_BADGE[s]||{cls:"",icon:"alertCircle"};
    return '<span class="badge '+m.cls+'">'+_icon(m.icon,"ic-sm")+' '+_esc(statusLabel(s))+'</span>';
  }

  /* ════════════════════════════════════════════════════════════════════
     الدالة النقية لتوجيه المسار — مصدر الحقيقة الوحيد لتسلسل الاعتماد.
     مكشوفة على window.hrPayments لفحوص hail-tests.
     ════════════════════════════════════════════════════════════════════ */
  function _nextStage(req, threshold){
    var amt = Number(req && req.amount) || 0;
    var th  = Number(threshold) || 0;
    // (٠) مدير الموارد البشرية أولاً — بوّابة إلزامية تُثبَّت عند الإنشاء (needsHRM).
    //     الطلبات الأقدم بلا الحقل تمضي في مسارها القديم كما اعتُمدت.
    if(req && req.needsHRM && !req.hrmApprovedAt) return "hrp_pending_hrm";
    // (١) مدير المشاريع — إن طلبه مُنشئ الطلب ولم يعتمده بعد.
    if(req && req.needsPM && !req.pmApprovedAt) return "hrp_pending_pm";
    // (٢) بوابة التنفيذي بالتكلفة وحدها. واعتماده يسقط إن رُفعت التكلفة فوق
    //     ما اعتمده — فلا يمرّ مبلغ أكبر ممّا رآه على توقيعٍ قديم.
    var ceoOk = !!(req && req.ceoApprovedAt) &&
                (amt <= (Number(req.ceoApprovedAmount)||0) + 0.01);
    if(amt >= th && !ceoOk) return "hrp_pending_ceo";
    // (٣) وإلا فالمالية للسداد.
    return "hrp_pending_finance";
  }
  function _threshold(){
    try{
      var v = Number(typeof CEO_APPROVAL_THRESHOLD!=="undefined" ? CEO_APPROVAL_THRESHOLD : NaN);
      if(isFinite(v) && v>0) return v;
    }catch(e){}
    return 2000;
  }
  function nextStage(req){ return _nextStage(req, _threshold()); }

  /* ════════ أدوات مساعدة ════════ */
  function _now(){ return new Date().toISOString(); }
  function _me(){ try{ return (currentUser && currentUser.name) || "النظام"; }catch(e){ return "النظام"; } }
  function _meUser(){ try{ return (currentUser && currentUser.user) || ""; }catch(e){ return ""; } }
  function _esc(s){
    try{ return esc(s); }
    catch(e){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  }
  function _jq(s){
    try{ return _jsq(s); }
    catch(e){ return String(s==null?"":s).replace(/\\/g,"\\\\").replace(/'/g,"\\'").replace(/[&<>"]/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
  }
  // أيقونات المنصة — نفس الدالتين اللتين يستعملهما متن الصفحات في index.html
  function _icon(n,cls){ try{ return _ic(n,cls||"ic-sm"); }catch(e){ return ""; } }
  function _svg(n){ try{ return _svgIcon(n); }catch(e){ return ""; } }
  function _toast(m,t){ try{ toast(m,t); }catch(e){} }
  function _log(a,d){ try{ if(typeof logAudit==="function") logAudit(a,d); }catch(e){} }
  function _notify(t,b,id){ try{ if(typeof addNotification==="function") addNotification(t,b,id,"hr_payment"); }catch(e){} }
  function _confirm(o){ try{ return showConfirm(o); }catch(e){ return Promise.resolve(window.confirm((o&&o.msg)||"تأكيد؟")); } }
  function _date(d){ try{ return fmtDate(d); }catch(e){ return String(d||"—"); } }
  function _fmt(n){ return (Number(n)||0).toLocaleString("en-US",{maximumFractionDigits:2}); }
  function _fmt0(n){ return (Number(n)||0).toLocaleString("en-US",{maximumFractionDigits:0}); }
  function _val(id){ var el=document.getElementById(id); return el ? String(el.value||"").trim() : ""; }
  function _num(id){ var v=parseFloat(_val(id)); return isFinite(v)?v:NaN; }
  function _file(id){ var el=document.getElementById(id); return (el&&el.files&&el.files[0])||null; }

  /* ════════ الصلاحيات ════════ */
  function _role(){ try{ return (currentUser && currentUser.role) || ""; }catch(e){ return ""; } }
  function _isAdmin(){ return _role()==="admin"; }
  function canCreate(){ return _role()==="hr_officer" || _isAdmin(); }
  function canHRM(){    return _role()==="hr_manager" || _isAdmin(); }
  function canPM(){     return _role()==="project_manager" || _isAdmin(); }
  function canCEO(){    return _role()==="ceo" || _isAdmin(); }
  function canFinance(){return _role()==="finance" || _isAdmin(); }
  // العرض للأدوار المعنية وحدها — بيانات الموارد البشرية لا تخصّ المستودع ولا المشتريات.
  function canView(){ return canCreate() || canHRM() || canPM() || canCEO() || canFinance(); }
  // الوحدة ابنةُ المشتريات المركزية وحدَها (قرار المالك 29/08): سدادُ الإقامات
  // والتأشيرات مصروفٌ إداريّ عام لا يخصّ مشروعاً بعينه، فداخلَ مشروعٍ لا بطاقةَ
  // له في لوحة المشتريات ولا مجموعةَ في السايدبار — تظهران في الوضع المركزي فقط.
  function _inCentral(){ try{ return document.body.classList.contains("global-purchases-mode"); }catch(e){ return false; } }
  // صاحب الطلب — يعدّل ويعيد الإرسال ويلغي.
  function isOwner(req){
    if(!req) return false;
    if(_isAdmin()) return true;
    var u=_meUser();
    return !!u && (req.createdByUser===u);
  }

  /* ════════ الحالة الداخلية ════════ */
  var _reqs      = [];    // كل الطلبات (من onSnapshot، الأحدث أولاً)
  var _loaded    = false; // وصلت أول لقطة؟ قبلها «جارٍ التحميل» لا «لا طلبات» المضلّلة
  var _connIssue = false; // تعذّر الوصول — رسالة اتصال صادقة
  var _unsub     = null;
  var _curId     = null;  // الطلب المفتوح في التفاصيل (أو null = القائمة)
  var _busy      = false; // حارس ضد النقر المزدوج
  var _fStatus   = "";    // فلاتر القائمة
  var _fType     = "";
  var _fSearch   = "";
  // معرّفات حُذفت في هذه الجلسة — تمنع لقطةً في الطريق من إعادة الطلب للقائمة
  // بين الحذف المحلّي ووصول لقطة الخادم (نفس حارس _deletedPurchaseIds في النواة).
  var _deletedIds = {};

  function byId(id){ for(var i=0;i<_reqs.length;i++){ if(_reqs[i] && _reqs[i].id===id) return _reqs[i]; } return null; }
  function all(){ return _reqs.slice(); }

  /* ════════════════════════════════════════════════════════════════════
     المزامنة والتخزين
     ════════════════════════════════════════════════════════════════════ */

  function _rerenderIfActive(){
    var pg=document.getElementById("page-hr-payments");
    if(pg && pg.classList.contains("active")) render();
    _navToggle();
    _badge();
    // بطاقة لوحة المشتريات تتنفّس مع كل لقطة — لا تنتظر إعادة رسم اللوحة كلها.
    try{ renderMyTasks(); }catch(e){}
  }

  function _applySnap(snap){
    _reqs = snap.docs.map(function(d){ return Object.assign({id:d.id}, d.data()); })
      .filter(function(r){ return !_deletedIds[r.id]; })
      .sort(function(a,b){ return String(b.createdAt||"").localeCompare(String(a.createdAt||"")); });
    _loaded=true; _connIssue=false;
    _liveToast(_reqs);
    _rerenderIfActive();
  }

  /* ════════ التنبيه اللحظي (HailNotify) ════════
     جرسُ التطبيق يسجّل الحدث، لكنه لا يقاطع أحداً: المعتمِد الذي لا يفتح الجرس لا يعلم
     أن طلباً ينتظره. البلاغاتُ وطلباتُ الشراء تُظهر توستاً لحظياً منذ v18.9؛ سدادُ
     الموارد البشرية كان الوحيد بلا واحد. هنا نظيره — **لمن دورُه الآن وحده**، فلا يتحوّل
     إلى ضجيجٍ يراه كلُّ من يملك الاطلاع.

     ثلاثة حرّاس: (١) اللقطةُ الأولى خطُّ أساسٍ صامت (لا سيلَ تنبيهاتٍ عند كل دخول)،
     (٢) الحالةُ لم تتغيّر ⇒ لا تنبيه (لقطاتُ Firestore تتكرّر لأي حقلٍ يتغيّر)،
     (٣) من نقل الحالة بنفسه لا يُنبَّه بفعله (آخر قيدٍ في الخطّ الزمني بأسمه). */
  var _hnPrev = null;   // id → الحالة عند آخر لقطة. null = ما قبل خط الأساس.

  // «ينتظرك أنت» — نفس منطق عدّاد السايدبار (pendingForMe) مع إضافة خبر الإغلاق لصاحبه.
  function _awaitsMe(r){
    if(!r) return false;
    if(r.status==="hrp_pending_hrm")     return canHRM();
    if(r.status==="hrp_pending_pm")      return canPM();
    if(r.status==="hrp_pending_ceo")     return canCEO();
    if(r.status==="hrp_pending_finance") return canFinance();
    if(isBouncedStatus(r.status))        return isOwner(r);
    if(r.status==="hrp_closed")          return isOwner(r);
    return false;
  }
  function _lastActor(r){
    var tl = r && r.timeline;
    return (Array.isArray(tl) && tl.length) ? String(tl[tl.length-1].by||"") : "";
  }
  function _liveToast(list){
    var prev=_hnPrev, cur={};
    list.forEach(function(r){ if(r) cur[r.id]=r.status; });
    _hnPrev=cur;
    if(prev===null) return;                                   // (١) خط الأساس
    if(typeof HailNotify==="undefined" || !HailNotify.push) return;
    list.forEach(function(r){
      if(!r || prev[r.id]===r.status) return;                 // (٢) لم تتغيّر
      if(!_awaitsMe(r)) return;
      if(_lastActor(r)===_me()) return;                       // (٣) أنت من نقلها
      try{
        HailNotify.push({
          type:"hr",
          code:r.id,
          title:statusLabel(r.status),
          body:[workTypeLabel(r), r.title, (r.createdBy?("مُقدّم الطلب: "+r.createdBy):"")]
                 .filter(Boolean).join(" · "),
          onClick:function(){ try{ open(r.id); }catch(e){} }
        });
      }catch(e){}
    });
  }

  function startSync(){
    _navToggle();
    hookMyTasks();   // النواة تستدعينا عند بدء مزامنة المشتريات — renderPOMyTasks معرّفة حينها
    if(typeof db==="undefined" || !db) return;
    // بوّابة الدور قبل الاشتراك: دورٌ لا يرى طلبات السداد لا يُنزِّل مجموعتَها عن كل جلسة
    // (خفض قراءات Firestore — قياس ٢٦/٠٨). الشاشةُ وبطاقةُ مهامّي تناديان startSync عند العرض.
    if(!canView()) return;
    if(_unsub) return; // idempotent — المستمعون العامون يُركَّبون مرة واحدة (v18.9sz)
    // جلبةٌ فورية توازي فتح التيار: مصافحة Watch قد تطول على اتصال بارد.
    try{
      db.collection(COLL()).get().then(function(snap){ if(!_loaded) _applySnap(snap); }).catch(function(){});
    }catch(e){}
    _unsub = db.collection(COLL()).onSnapshot(_applySnap, function(e){
      console.warn("hr-payments sync error:", e);
      _loaded=true; _connIssue=true; _rerenderIfActive();
    });
    // مهلة أمان: لا دوّار أبديّ مهما حدث.
    setTimeout(function(){
      if(_loaded) return;
      _loaded=true; _connIssue=true; _rerenderIfActive();
    }, 8000);
  }

  function retryLoad(){
    _loaded=false; _connIssue=false; render();
    try{
      db.collection(COLL()).get().then(_applySnap).catch(function(){ _loaded=true; _connIssue=true; render(); });
    }catch(e){ _loaded=true; _connIssue=true; render(); }
  }

  function _applyLocal(id, doc){
    var i=_reqs.findIndex(function(x){ return x && x.id===id; });
    var next=Object.assign({id:id}, JSON.parse(JSON.stringify(doc)));
    if(i>=0) _reqs[i]=next; else _reqs.unshift(next);
    _reqs.sort(function(a,b){ return String(b.createdAt||"").localeCompare(String(a.createdAt||"")); });
  }

  // معاملة على وثيقة الطلب: تقرأ الطازج، تطبّق mutate على نسخة، تكتب.
  // كل تغييرٍ للحالة يمرّ من هنا — فلا يدهس معتمِدان متزامنان عمل بعضهما.
  function _tx(id, mutate){
    if(typeof db==="undefined" || !db) return Promise.reject(new Error("no db"));
    var ref=db.collection(COLL()).doc(id);
    return db.runTransaction(function(t){
      return t.get(ref).then(function(snap){
        if(!snap.exists) throw new Error("request missing");
        var doc=JSON.parse(JSON.stringify(snap.data()));
        var next=mutate(doc)||doc;
        next.updatedAt=_now();
        t.set(ref, next, {merge:false});
        return next;
      });
    }).then(function(next){ _applyLocal(id, next); _rerenderIfActive(); return next; });
  }

  function _push(doc, event, code, notes, icon){
    if(!Array.isArray(doc.timeline)) doc.timeline=[];
    doc.timeline.push({ event:event, code:code, by:_me(), at:_now(), icon:icon||(_STATUS_ICON[code]||"•"), notes:notes||"" });
    return doc;
  }

  // ── توليد المعرّف: HRP-YYMM-NNNN من عدّاد بمعاملة ──
  function _genId(){
    var now=new Date();
    var yr=String(now.getFullYear()).slice(-2), mon=String(now.getMonth()+1).padStart(2,"0");
    var fallback="HRP-"+yr+mon+"-"+Date.now().toString(36).slice(-5).toUpperCase();
    if(typeof db==="undefined" || !db) return Promise.resolve(fallback);
    var ref=db.doc(META_DOC());
    return db.runTransaction(function(t){
      return t.get(ref).then(function(s){
        var c=(s.exists && Number(s.data().counter)) || 0;
        c++;
        t.set(ref, {counter:c, updatedAt:_now()}, {merge:true});
        return c;
      });
    }).then(function(c){
      return "HRP-"+yr+mon+"-"+String(c).padStart(4,"0");
    }).catch(function(e){
      console.warn("hr-payments counter error:", e);
      return fallback;
    });
  }

  // ── رفع مرفق ──
  function _upload(id, file, kind){
    if(!file) return Promise.resolve(null);
    if(typeof storage==="undefined" || !storage) return Promise.reject(new Error("no storage"));
    var wait = Promise.resolve();
    try{ if(typeof _waitForFirebaseAuth==="function") wait=_waitForFirebaseAuth(); }catch(e){}
    return Promise.resolve(wait).then(function(){
      var isPdf = file.type==="application/pdf";
      var ext = isPdf ? "pdf" : (((file.name||"").split(".").pop()||"jpg").toLowerCase().slice(0,5));
      var ref = storage.ref("po/hr/"+id+"/"+(kind||"doc")+"_"+Date.now()+"."+ext);
      return ref.put(file, isPdf ? {contentType:"application/pdf"} : (file.type?{contentType:file.type}:undefined));
    }).then(function(snap){
      return snap.ref.getDownloadURL().then(function(url){
        return {
          url:url, storagePath:snap.ref.fullPath, kind:kind||"doc",
          name:String(file.name||"").slice(0,120),
          contentType:file.type || (file.type==="application/pdf"?"application/pdf":"image/jpeg"),
          by:_me(), at:_now()
        };
      });
    });
  }

  /* ════════════════════════════════════════════════════════════════════
     إنشاء الطلب
     ════════════════════════════════════════════════════════════════════ */

  function renderNew(){
    var el=document.getElementById("page-new-hr-payment");
    if(!el) return;
    _injectCSS();
    if(!canView()){ el.innerHTML=_lockHtml(); return; }
    if(!canCreate()){
      el.innerHTML=_hero("طلب سداد جديد","إنشاء طلب سداد لأعمال الموارد البشرية")+
        '<div class="card"><div style="text-align:center;padding:34px;color:var(--muted);font-size:13px">'+
        _icon("lock","ic-lg")+' إنشاء الطلبات من صلاحية مسؤول الموارد البشرية فقط.</div></div>';
      return;
    }
    var th=_threshold();
    el.innerHTML =
      '<div class="page-hero"><div class="page-hero-titles">'+
        '<div class="page-hero-title">'+_icon("filePlus")+' طلب سداد جديد</div>'+
        '<div class="page-hero-sub">نوعية الأعمال، تكلفة السداد، والمستند — لا أكثر</div>'+
      '</div><div class="page-hero-actions">'+
        '<button class="btn btn-ghost btn-sm" onclick="hrPayments.list()">'+_icon("scrollText")+' الطلبات</button>'+
      '</div></div>'+

      '<div class="card">'+
        '<div class="card-title">'+_icon("clipboardList")+' بيانات الطلب</div>'+

        '<div class="form-row">'+
          '<div class="form-group">'+
            '<label class="form-label" for="hrp-n-type">نوعية الأعمال المطلوب سدادها <span>*</span></label>'+
            '<select class="form-select" id="hrp-n-type" onchange="hrPayments.onTypeChange()">'+
              WORK_TYPES.map(function(w){ return '<option value="'+w.k+'">'+_esc(w.l)+'</option>'; }).join("")+
            '</select>'+
          '</div>'+
          '<div class="form-group" id="hrp-n-other-wrap" style="display:none">'+
            '<label class="form-label" for="hrp-n-other">حدّد نوع العمل <span>*</span></label>'+
            '<input class="form-input" id="hrp-n-other" placeholder="مثال: رسوم شهادة صحية">'+
          '</div>'+
        '</div>'+

        '<div class="form-group">'+
          '<label class="form-label" for="hrp-n-title">بيان مختصر <span>*</span></label>'+
          '<input class="form-input" id="hrp-n-title" maxlength="140" placeholder="مثال: تجديد إقامات 12 عاملاً — دفعة أغسطس">'+
        '</div>'+

        '<div class="form-row">'+
          '<div class="form-group">'+
            '<label class="form-label" for="hrp-n-amount">تكلفة السداد (ر.س) <span>*</span></label>'+
            '<input class="form-input mono" id="hrp-n-amount" type="number" min="0" step="0.01" placeholder="0.00" oninput="hrPayments.onAmountChange()">'+
          '</div>'+
          '<div class="form-group">'+
            '<label class="form-label" for="hrp-n-pm">اعتماد مدير المشاريع</label>'+
            '<select class="form-select" id="hrp-n-pm" onchange="hrPayments.onAmountChange()">'+
              '<option value="yes">نعم — يحتاج اعتماد مدير المشاريع</option>'+
              '<option value="no">لا — يُرفع مباشرةً</option>'+
            '</select>'+
          '</div>'+
        '</div>'+

        /* ══ مسار الطلب — قبل الإرسال لا بعده ══
           بقيّة الشاشات تعرض شريط المراحل لتقول «أين وصل الطلب». هذا الشريط يقول
           «إلى أين سيذهب»، ويُعاد رسمه مع كل رقمٍ يُكتب في التكلفة ومع تبديل خيار
           مدير المشاريع — فقاعدةُ سقف التنفيذي تُرى لحظةَ القرار لا بعد الإرسال.
           موضعه هنا مباشرةً بعد الحقلين اللذين يحرّكانه. نفس مكوّن المنصة (.po-wf)
           في لحظةٍ جديدة، بلا مفردات بصرية جديدة. */
        '<div id="hrp-n-route"></div>'+

        '<div class="form-group">'+
          '<label class="form-label" for="hrp-n-file">المستند المرفق</label>'+
          '<input type="file" class="form-input" id="hrp-n-file" accept="image/*,application/pdf">'+
          '<div class="hrp-hint">صورة أو PDF — كشف الإقامات، فاتورة الرسوم، إشعار مكتب العمل. يمكن الإرسال بدونه بتأكيد.</div>'+
        '</div>'+

        '<div class="d-sec-label" style="margin-top:6px">بيانات التحويل — اختيارية، تُسهّل على المالية السداد</div>'+
        '<div class="form-row">'+
          '<div class="form-group">'+
            '<label class="form-label" for="hrp-n-benef">المستفيد</label>'+
            '<input class="form-input" id="hrp-n-benef" placeholder="اسم الجهة أو الشخص">'+
          '</div>'+
          '<div class="form-group">'+
            '<label class="form-label" for="hrp-n-iban">الآيبان</label>'+
            '<input class="form-input mono" id="hrp-n-iban" placeholder="SA…">'+
          '</div>'+
        '</div>'+
        '<div class="form-group">'+
          '<label class="form-label" for="hrp-n-note">ملاحظة للمالية</label>'+
          '<input class="form-input" id="hrp-n-note" maxlength="240" placeholder="اختياري">'+
        '</div>'+

        '<div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;flex-wrap:wrap">'+
          '<button class="btn btn-ghost" onclick="hrPayments.list()">إلغاء</button>'+
          '<button class="btn btn-primary" id="hrp-n-submit" onclick="hrPayments.submitNew()">'+_icon("send")+' إرسال الطلب</button>'+
        '</div>'+
      '</div>';
    onTypeChange();
    onAmountChange();
  }

  function onTypeChange(){
    var t=_val("hrp-n-type");
    var w=document.getElementById("hrp-n-other-wrap");
    if(w) w.style.display = (t==="other") ? "" : "none";
  }

  /* معاينة المسار الحيّة — تُبنى بمكوّن شريط سير العمل نفسه (.po-wf/.po-step/.po-link)
     الذي تعرضه تفاصيل طلب الشراء، فلا يتعلّم المستخدم شكلاً جديداً. */
  function _trackHtml(steps, curIdx, tags){
    return '<div class="po-wf">'+
      '<div class="po-wf-head">'+(tags||"")+'</div>'+
      '<div class="po-wf-track">'+steps.map(function(st,i){
        var done = curIdx>i, active = curIdx===i;
        return '<div class="po-step'+(done?" done":"")+(active?" active":"")+'">'+
            '<div class="ps-ico">'+_svg(st.icon)+'</div>'+
            '<div class="ps-l">'+_esc(st.lbl)+'</div>'+
          '</div>'+(i<steps.length-1?'<div class="po-link'+(done?" done":"")+'"></div>':"");
      }).join("")+'</div>'+
    '</div>';
  }

  function onAmountChange(){
    var host=document.getElementById("hrp-n-route");
    if(!host) return;
    var amt=_num("hrp-n-amount"); if(!isFinite(amt)) amt=0;
    var needsPM=_val("hrp-n-pm")!=="no";
    var th=_threshold();
    var overTh = amt >= th;
    var steps=[];
    steps.push({icon:"users", lbl:"مدير الموارد البشرية"});  // بوّابة إلزامية لكل طلب جديد
    if(needsPM) steps.push({icon:"send", lbl:"مدير المشاريع"});
    if(overTh)  steps.push({icon:"building2", lbl:"المدير التنفيذي"});
    steps.push({icon:"banknote", lbl:"سداد المالية"});
    steps.push({icon:"lock", lbl:"إغلاق"});
    var tags='<span>مسار هذا الطلب</span>'+
      (overTh
        ? '<span class="po-wf-tag ceo">'+_fmt0(amt)+' ≥ '+_fmt0(th)+' ر.س — اعتماد التنفيذي إلزامي</span>'
        : (amt>0 ? '<span class="po-wf-tag fin">أقل من '+_fmt0(th)+' ر.س — بلا بوّابة التنفيذي</span>' : ''));
    // لا مرحلة «حالية»: الطلب لم يُنشأ بعد، فالشريط كلّه قادم.
    host.innerHTML=_trackHtml(steps, -1, tags);
  }

  async function submitNew(){
    if(_busy) return false;
    if(!canCreate()){ _toast("⚠ صلاحية مسؤول الموارد البشرية فقط","warn"); return false; }
    var type=_val("hrp-n-type");
    var other=_val("hrp-n-other");
    var title=_val("hrp-n-title");
    var amount=_num("hrp-n-amount");
    var needsPM=_val("hrp-n-pm")!=="no";
    var file=_file("hrp-n-file");
    var benef=_val("hrp-n-benef");
    var ibanRaw=_val("hrp-n-iban");
    var note=_val("hrp-n-note");

    if(!type){ _toast("⚠ اختر نوعية الأعمال","warn"); return false; }
    if(type==="other" && !other){ _toast("⚠ حدّد نوع العمل","warn"); return false; }
    if(!title){ _toast("⚠ اكتب بياناً مختصراً للطلب","warn"); return false; }
    if(!isFinite(amount) || amount<=0){ _toast("⚠ أدخل تكلفة سداد أكبر من صفر","warn"); return false; }

    var iban=_iban(ibanRaw);
    if(!iban.ok){ _toast("⚠ صيغة الآيبان غير صحيحة — يبدأ بـ SA ويتبعه 22 رقم","warn"); return false; }

    // المرفق اختياري — لكن بتأكيدٍ صريح، فالمعتمِد يقرّر على ورقة لا يراها.
    if(!file){
      var go=false;
      try{
        await _confirm({title:"بلا مستند مرفق", msg:"لم تُرفق مستنداً (كشف الإقامات أو فاتورة الرسوم). سيصل الطلب للمعتمِدين بلا سند. متابعة؟", icon:"📎", okText:"متابعة", okClass:"btn-warning"});
        go=true;
      }catch(e){ go=false; }
      if(!go) return false;
    }

    _busy=true;
    try{
      var id=await _genId();
      var att=null;
      if(file){
        try{ att=await _upload(id, file, "doc"); }
        catch(e){ console.warn("hrp upload error", e); _toast("⚠ فشل رفع المستند — حاول مجدداً","warn"); return false; }
      }
      var now=_now();
      var doc={
        workType:type, workTypeOther:(type==="other"?other:""),
        title:title, amount:+amount.toFixed(2),
        needsHRM:true,   // بوّابة مدير الموارد البشرية إلزامية لكل طلبٍ جديد
        needsPM:needsPM,
        status:"", // يُملأ من _nextStage أدناه
        attachments: att?[att]:[],
        payment:{ beneficiary:benef, bank:"", iban:iban.clean, note:note, paid:false },
        createdBy:_me(), createdByUser:_meUser(), createdAt:now, updatedAt:now,
        timeline:[]
      };
      doc.status = nextStage(doc);
      _push(doc, "إنشاء طلب سداد — الموارد البشرية", doc.status,
        workTypeLabel(doc)+" — "+_fmt(doc.amount)+" ر.س"+(needsPM?" — يحتاج اعتماد مدير المشاريع":" — بلا اعتماد مدير المشاريع"), "📨");

      await db.collection(COLL()).doc(id).set(doc);
      _applyLocal(id, doc);

      _log("سداد موارد بشرية — إنشاء طلب", "رقم الطلب: "+id+" — "+workTypeLabel(doc)+" — "+_fmt(doc.amount)+" ر.س");
      _notifyStage(Object.assign({id:id}, doc), doc.status);
      _toast("✅ أُرسل الطلب "+id+" — "+statusLabel(doc.status),"success");
      _curId=id;
      try{ showPage("hr-payments"); }catch(e){ render(); }
      return true;
    }catch(e){
      console.warn("hrp submitNew error", e);
      _toast("⚠ تعذّر إنشاء الطلب — تحقق من الاتصال","warn");
      return false;
    }finally{ _busy=false; }
  }

  // تحقق صيغة الآيبان السعودي — نفس قاعدة مسار المشتريات (SA + 22 رقماً).
  function _iban(raw){
    var clean=String(raw||"").replace(/\s+/g,"").toUpperCase();
    if(!clean) return {ok:true, clean:"", empty:true};
    return {ok:/^SA\d{22}$/.test(clean), clean:clean, empty:false};
  }

  /* ════════════════════════════════════════════════════════════════════
     الإجراءات على الطلب
     ════════════════════════════════════════════════════════════════════ */

  // ── اعتماد مدير الموارد البشرية (البوّابة الأولى) ──
  function approveHRM(id){
    var r=byId(id); if(!r) return;
    if(!canHRM()){ _toast("⚠ صلاحية مدير الموارد البشرية فقط","warn"); return; }
    if(r.status!=="hrp_pending_hrm"){ _toast("⚠ الطلب ليس بانتظار مدير الموارد البشرية","warn"); return; }
    var th=_threshold();
    var willCEO = (Number(r.amount)||0) >= th;
    showCustomModal({
      title:"اعتماد مدير الموارد البشرية",
      body:
        _summaryHtml(r)+
        '<div class="desc-box" style="margin:10px 0 0">'+
          (r.needsPM
            ? 'بعد اعتمادك يُحال الطلب إلى مدير المشاريع'+(willCEO?' ثم المدير التنفيذي':'')+'، ثم للمالية.'
            : (willCEO
                ? 'التكلفة '+_fmt(r.amount)+' ر.س ≥ '+_fmt0(th)+' — سيُحال للمدير التنفيذي بعد اعتمادك، ثم للمالية.'
                : 'سيُحال مباشرةً إلى المالية للسداد بعد اعتمادك.'))+
        '</div>'+
        '<div class="form-group" style="margin:10px 0 0"><label class="form-label" for="hrp-hrm-note">ملاحظة</label>'+
        '<input class="form-input" id="hrp-hrm-note" placeholder="اختياري"></div>',
      okText:"اعتماد",
      onOk:function(){ return _doApprove(id, "hrm", _val("hrp-hrm-note")); }
    });
  }

  // ── اعتماد مدير المشاريع ──
  function approvePM(id){
    var r=byId(id); if(!r) return;
    if(!canPM()){ _toast("⚠ صلاحية مدير المشاريع فقط","warn"); return; }
    if(r.status!=="hrp_pending_pm"){ _toast("⚠ الطلب ليس بانتظار مدير المشاريع","warn"); return; }
    var th=_threshold();
    var willCEO = (Number(r.amount)||0) >= th;
    showCustomModal({
      title:"اعتماد مدير المشاريع",
      body:
        _summaryHtml(r)+
        '<div class="desc-box" style="margin:10px 0 0">'+
          (willCEO
            ? 'التكلفة '+_fmt(r.amount)+' ر.س ≥ '+_fmt0(th)+' — سيُحال للمدير التنفيذي بعد اعتمادك، ثم للمالية.'
            : 'سيُحال مباشرةً إلى المالية للسداد بعد اعتمادك.')+
        '</div>'+
        '<div class="form-group" style="margin:10px 0 0"><label class="form-label" for="hrp-pm-note">ملاحظة</label>'+
        '<input class="form-input" id="hrp-pm-note" placeholder="اختياري"></div>',
      okText:"اعتماد",
      onOk:function(){ return _doApprove(id, "pm", _val("hrp-pm-note")); }
    });
  }

  // ── اعتماد المدير التنفيذي ──
  function approveCEO(id){
    var r=byId(id); if(!r) return;
    if(!canCEO()){ _toast("⚠ صلاحية المدير التنفيذي فقط","warn"); return; }
    if(r.status!=="hrp_pending_ceo"){ _toast("⚠ الطلب ليس بانتظار المدير التنفيذي","warn"); return; }
    showCustomModal({
      title:"اعتماد المدير التنفيذي",
      body:
        _summaryHtml(r)+
        '<div class="desc-box" style="margin:10px 0 0">بعد اعتمادك يُحال الطلب إلى المالية للسداد مباشرةً.</div>'+
        '<div class="form-group" style="margin:10px 0 0"><label class="form-label" for="hrp-ceo-note">ملاحظة</label>'+
        '<input class="form-input" id="hrp-ceo-note" placeholder="اختياري"></div>',
      okText:"اعتماد",
      onOk:function(){ return _doApprove(id, "ceo", _val("hrp-ceo-note")); }
    });
  }

  async function _doApprove(id, gate, note){
    if(_busy) return false;
    _busy=true;
    try{
      var by=_me(), at=_now();
      var next=await _tx(id, function(d){
        if(gate==="hrm"){
          if(d.status!=="hrp_pending_hrm") throw new Error("stale");
          d.hrmApprovedAt=at; d.hrmApprovedBy=by; d.hrmRejectReason="";
        }else if(gate==="pm"){
          if(d.status!=="hrp_pending_pm") throw new Error("stale");
          d.pmApprovedAt=at; d.pmApprovedBy=by; d.pmRejectReason="";
        }else{
          if(d.status!=="hrp_pending_ceo") throw new Error("stale");
          d.ceoApprovedAt=at; d.ceoApprovedBy=by;
          d.ceoApprovedAmount=Number(d.amount)||0;  // توقيعه مربوطٌ بالمبلغ الذي رآه
          d.ceoRejectReason="";
        }
        d.status = nextStage(d);
        _push(d, gate==="hrm" ? "اعتماد مدير الموارد البشرية" : gate==="pm" ? "اعتماد مدير المشاريع" : "اعتماد المدير التنفيذي",
          d.status, note||"", gate==="hrm"?"👥":gate==="pm"?"👔":"🏢");
        return d;
      });
      _log("سداد موارد بشرية — "+(gate==="hrm"?"اعتماد مدير الموارد البشرية":gate==="pm"?"اعتماد مدير المشاريع":"اعتماد المدير التنفيذي"),
           "رقم الطلب: "+id+" — الوجهة: "+next.status);
      _notifyStage(Object.assign({id:id}, next), next.status);
      _toast("✅ اعتُمد — "+statusLabel(next.status),"success");
      return true;
    }catch(e){
      console.warn("hrp approve error", e);
      _toast(String(e&&e.message)==="stale" ? "⚠ تغيّرت حالة الطلب — حدّث الصفحة" : "⚠ تعذّر الاعتماد — تحقق من الاتصال","warn");
      return false;
    }finally{ _busy=false; }
  }

  // ── الرفض (مدير المشاريع / التنفيذي) — يعود لمسؤول الموارد البشرية للتصحيح ──
  function reject(id, gate){
    var r=byId(id); if(!r) return;
    if(gate==="hrm" && !canHRM()){ _toast("⚠ صلاحية مدير الموارد البشرية فقط","warn"); return; }
    if(gate==="pm" && !canPM()){ _toast("⚠ صلاحية مدير المشاريع فقط","warn"); return; }
    if(gate==="ceo" && !canCEO()){ _toast("⚠ صلاحية المدير التنفيذي فقط","warn"); return; }
    showCustomModal({
      title: gate==="hrm" ? "رفض — مدير الموارد البشرية" : gate==="pm" ? "رفض — مدير المشاريع" : "رفض — المدير التنفيذي",
      body:
        _summaryHtml(r)+
        '<div class="desc-box" style="margin:10px 0 0;border-right:3px solid var(--danger)">يعود الطلب لمسؤول الموارد البشرية لتصحيحه وإعادة إرساله. سبب الرفض إلزامي.</div>'+
        '<div class="form-group" style="margin:10px 0 0"><label class="form-label" for="hrp-rej-reason">سبب الرفض <span>*</span></label>'+
        '<textarea class="form-textarea" id="hrp-rej-reason" rows="3" placeholder="ما الذي يمنع اعتماد هذا الطلب؟"></textarea></div>',
      okText:"رفض الطلب",
      onOk:function(){ return _doReject(id, gate, _val("hrp-rej-reason")); }
    });
  }

  async function _doReject(id, gate, reason){
    if(_busy) return false;
    if(!reason){ _toast("⚠ اكتب سبب الرفض","warn"); return false; }
    _busy=true;
    try{
      var target = gate==="hrm" ? "hrp_hrm_rejected" : gate==="pm" ? "hrp_pm_rejected" : "hrp_ceo_rejected";
      var expect = gate==="hrm" ? "hrp_pending_hrm"  : gate==="pm" ? "hrp_pending_pm"  : "hrp_pending_ceo";
      var next=await _tx(id, function(d){
        if(d.status!==expect) throw new Error("stale");
        d.status=target;
        if(gate==="hrm"){ d.hrmRejectReason=reason; d.hrmRejectedAt=_now(); }
        else if(gate==="pm"){ d.pmRejectReason=reason; d.pmRejectedAt=_now(); }
        else           { d.ceoRejectReason=reason; d.ceoRejectedAt=_now(); }
        _push(d, gate==="hrm" ? "رفض مدير الموارد البشرية" : gate==="pm" ? "رفض مدير المشاريع" : "رفض المدير التنفيذي", target, reason, "❌");
        return d;
      });
      _log("سداد موارد بشرية — رفض", "رقم الطلب: "+id+" — الجهة: "+(gate==="hrm"?"مدير الموارد البشرية":gate==="pm"?"مدير المشاريع":"المدير التنفيذي")+" — السبب: "+reason);
      _notifyStage(Object.assign({id:id}, next), target, reason);
      _toast("تم الرفض — أُعيد لمسؤول الموارد البشرية","success");
      return true;
    }catch(e){
      console.warn("hrp reject error", e);
      _toast(String(e&&e.message)==="stale" ? "⚠ تغيّرت حالة الطلب — حدّث الصفحة" : "⚠ تعذّر الرفض — تحقق من الاتصال","warn");
      return false;
    }finally{ _busy=false; }
  }

  // ── إعادة المالية للتصحيح ──
  function financeReturn(id){
    var r=byId(id); if(!r) return;
    if(!canFinance()){ _toast("⚠ صلاحية المالية فقط","warn"); return; }
    if(r.status!=="hrp_pending_finance"){ _toast("⚠ الطلب ليس عند المالية","warn"); return; }
    showCustomModal({
      title:"إعادة الطلب للتصحيح",
      body:
        _summaryHtml(r)+
        '<div class="desc-box" style="margin:10px 0 0;border-right:3px solid var(--warn)">يعود لمسؤول الموارد البشرية لتصحيح البيانات وإعادة الإرسال.</div>'+
        '<div class="form-group" style="margin:10px 0 0"><label class="form-label" for="hrp-fr-reason">سبب الإعادة <span>*</span></label>'+
        '<textarea class="form-textarea" id="hrp-fr-reason" rows="3" placeholder="بيانات ناقصة، آيبان خاطئ، مستند غير واضح…"></textarea></div>',
      okText:"إعادة للتصحيح",
      onOk:function(){ return _doFinanceReturn(id, _val("hrp-fr-reason")); }
    });
  }

  async function _doFinanceReturn(id, reason){
    if(_busy) return false;
    if(!reason){ _toast("⚠ اكتب سبب الإعادة","warn"); return false; }
    _busy=true;
    try{
      var next=await _tx(id, function(d){
        if(d.status!=="hrp_pending_finance") throw new Error("stale");
        d.status="hrp_finance_returned";
        d.financeReturnReason=reason; d.financeReturnedAt=_now();
        _push(d, "إعادة من المالية للتصحيح", "hrp_finance_returned", reason, "↩");
        return d;
      });
      _log("سداد موارد بشرية — إعادة من المالية", "رقم الطلب: "+id+" — السبب: "+reason);
      _notifyStage(Object.assign({id:id}, next), "hrp_finance_returned", reason);
      _toast("أُعيد الطلب لمسؤول الموارد البشرية","success");
      return true;
    }catch(e){
      console.warn("hrp financeReturn error", e);
      _toast("⚠ تعذّر إتمام العملية — تحقق من الاتصال","warn");
      return false;
    }finally{ _busy=false; }
  }

  // ── تسجيل السداد (المالية) — دفعة واحدة كاملة، إيصال إلزامي، ثم الإغلاق ──
  function payModal(id){
    var r=byId(id); if(!r) return;
    if(!canFinance()){ _toast("⚠ صلاحية المالية فقط","warn"); return; }
    if(r.status!=="hrp_pending_finance"){ _toast("⚠ الطلب ليس بانتظار السداد","warn"); return; }
    var pay=r.payment||{};
    showCustomModal({
      title:"تسجيل السداد وإغلاق الطلب",
      body:
        _summaryHtml(r)+
        ((pay.beneficiary||pay.iban||pay.note)?'<div class="d-facts" style="margin-bottom:10px">'+
          (pay.beneficiary?'<span class="d-fact"><span class="fl">المستفيد</span>'+_esc(pay.beneficiary)+'</span>':'')+
          (pay.iban?'<span class="d-fact"><span class="fl">الآيبان</span><span class="mono">'+_esc(pay.iban)+'</span></span>':'')+
          (pay.note?'<span class="d-fact"><span class="fl">ملاحظة</span>'+_esc(pay.note)+'</span>':'')+
        '</div>':'')+
        '<div class="desc-box">السداد دفعة واحدة كاملة بمبلغ <b class="mono">'+_fmt(r.amount)+'</b> ر.س؛ بتسجيله يُغلق الطلب.</div>'+
        '<div class="form-group"><label class="form-label" for="hrp-pay-ref">رقم عملية التحويل</label>'+
        '<input class="form-input mono" id="hrp-pay-ref" placeholder="اختياري"></div>'+
        '<div class="form-group" style="margin-bottom:0"><label class="form-label" for="hrp-pay-file">إيصال التحويل <span>*</span></label>'+
        '<input type="file" class="form-input" id="hrp-pay-file" accept="image/*,application/pdf"></div>',
      okText:"تسجيل السداد",
      onOk:function(){ return _doPay(id); }
    });
  }

  async function _doPay(id){
    if(_busy) return false;
    if(!canFinance()){ _toast("⚠ صلاحية المالية فقط","warn"); return false; }
    var file=_file("hrp-pay-file");
    var ref=_val("hrp-pay-ref");
    if(!file){ _toast("⚠ إيصال التحويل إلزامي — أرفق الإيصال","warn"); return false; }
    var r=byId(id);
    if(!r){ _toast("⚠ لم يُعثر على الطلب","warn"); return false; }
    if(r.status!=="hrp_pending_finance"){ _toast("⚠ الطلب ليس بانتظار السداد","warn"); return false; }

    _busy=true;
    try{
      var att=null;
      try{ att=await _upload(id, file, "receipt"); }
      catch(e){ console.warn("hrp receipt upload error", e); _toast("⚠ فشل رفع الإيصال — حاول مجدداً","warn"); return false; }
      if(!att){ _toast("⚠ تعذّر رفع الإيصال","warn"); return false; }
      att.label="إيصال السداد";

      var by=_me(), at=_now();
      var next=await _tx(id, function(d){
        if(d.status!=="hrp_pending_finance") throw new Error("stale");
        d.payment=Object.assign({}, d.payment||{}, {
          paid:true, paidBy:by, paidAt:at, transferRef:ref, paidAmount:Number(d.amount)||0
        });
        if(!Array.isArray(d.attachments)) d.attachments=[];
        d.attachments.push(att);
        d.status="hrp_closed"; d.closedAt=at; d.closedBy=by;
        _push(d, "سداد المالية — إغلاق الطلب", "hrp_closed",
          _fmt(d.amount)+" ر.س"+(ref?(" — عملية: "+ref):""), "💳");
        return d;
      });
      _log("سداد موارد بشرية — تسجيل السداد", "رقم الطلب: "+id+" — المبلغ: "+_fmt(next.amount)+(ref?(" — عملية: "+ref):""));
      _notifyStage(Object.assign({id:id}, next), "hrp_closed");
      _toast("✅ سُجِّل السداد وأُغلق الطلب","success");
      return true;
    }catch(e){
      console.warn("hrp pay error", e);
      _toast(String(e&&e.message)==="stale" ? "⚠ تغيّرت حالة الطلب — حدّث الصفحة" : "⚠ تعذّر تسجيل السداد — تحقق من الاتصال","warn");
      return false;
    }finally{ _busy=false; }
  }

  // ── تعديل الطلب وإعادة إرساله (صاحب الطلب، بعد الرفض أو قبل أي اعتماد) ──
  function canEdit(r){
    if(!r) return false;
    if(!isOwner(r)) return false;
    if(isFinalStatus(r.status)) return false;
    if(isBouncedStatus(r.status)) return true;
    // قبل أي اعتماد فعلي — ما دام في أول بوابة ولم يُعتمد شيء بعد
    return !r.hrmApprovedAt && !r.pmApprovedAt && !r.ceoApprovedAt;
  }

  function editModal(id){
    var r=byId(id); if(!r) return;
    if(!canEdit(r)){ _toast("⚠ لا يمكن تعديل الطلب في حالته الحالية","warn"); return; }
    var th=_threshold();
    showCustomModal({
      title:"تعديل الطلب",
      body:
        '<div class="desc-box">تعديل التكلفة يعيد حساب المسار: ما يبلغ '+_fmt0(th)+' ر.س فأكثر يعود لبوّابة المدير التنفيذي — حتى لو اعتُمد سابقاً بمبلغٍ أقل.</div>'+
        '<div class="form-group"><label class="form-label" for="hrp-e-title">بيان مختصر</label>'+
        '<input class="form-input" id="hrp-e-title" maxlength="140" value="'+_esc(r.title||"")+'"></div>'+
        '<div class="form-group"><label class="form-label" for="hrp-e-amount">تكلفة السداد (ر.س)</label>'+
        '<input class="form-input mono" id="hrp-e-amount" type="number" min="0" step="0.01" value="'+(Number(r.amount)||0)+'"></div>'+
        '<div class="form-row">'+
          '<div class="form-group"><label class="form-label" for="hrp-e-benef">المستفيد</label>'+
          '<input class="form-input" id="hrp-e-benef" value="'+_esc((r.payment&&r.payment.beneficiary)||"")+'"></div>'+
          '<div class="form-group"><label class="form-label" for="hrp-e-iban">الآيبان</label>'+
          '<input class="form-input mono" id="hrp-e-iban" value="'+_esc((r.payment&&r.payment.iban)||"")+'"></div>'+
        '</div>'+
        '<div class="form-group" style="margin-bottom:0"><label class="form-label" for="hrp-e-note">ملاحظة</label>'+
        '<input class="form-input" id="hrp-e-note" maxlength="240" value="'+_esc((r.payment&&r.payment.note)||"")+'"></div>',
      okText:"حفظ وإعادة الإرسال",
      onOk:function(){ return _doEdit(id); }
    });
  }

  async function _doEdit(id){
    if(_busy) return false;
    var r=byId(id);
    if(!r || !canEdit(r)){ _toast("⚠ لا يمكن تعديل الطلب","warn"); return false; }
    var title=_val("hrp-e-title");
    var amount=_num("hrp-e-amount");
    var benef=_val("hrp-e-benef");
    var ibanRaw=_val("hrp-e-iban");
    var note=_val("hrp-e-note");
    if(!title){ _toast("⚠ البيان المختصر مطلوب","warn"); return false; }
    if(!isFinite(amount) || amount<=0){ _toast("⚠ أدخل تكلفة سداد أكبر من صفر","warn"); return false; }
    var iban=_iban(ibanRaw);
    if(!iban.ok){ _toast("⚠ صيغة الآيبان غير صحيحة — يبدأ بـ SA ويتبعه 22 رقم","warn"); return false; }

    _busy=true;
    try{
      var next=await _tx(id, function(d){
        if(isFinalStatus(d.status)) throw new Error("stale");
        var oldAmt=Number(d.amount)||0;
        d.title=title;
        d.amount=+amount.toFixed(2);
        d.payment=Object.assign({}, d.payment||{}, {beneficiary:benef, iban:iban.clean, note:note});
        // مسح أسباب الارتداد — الطلب دخل دورةً جديدة
        d.hrmRejectReason=""; d.pmRejectReason=""; d.ceoRejectReason=""; d.financeReturnReason="";
        d.status = nextStage(d);   // المصدر الوحيد للتوجيه — يعيد فرض بوابة التنفيذي إن لزم
        _push(d, "تعديل وإعادة إرسال", d.status,
          (Math.abs(oldAmt-d.amount)>0.009 ? ("التكلفة: "+_fmt(oldAmt)+" ← "+_fmt(d.amount)+" ر.س") : ""), "✏️");
        return d;
      });
      _log("سداد موارد بشرية — تعديل وإعادة إرسال", "رقم الطلب: "+id+" — الوجهة: "+next.status);
      _notifyStage(Object.assign({id:id}, next), next.status);
      _toast("✅ حُفظ وأُعيد الإرسال — "+statusLabel(next.status),"success");
      return true;
    }catch(e){
      console.warn("hrp edit error", e);
      _toast("⚠ تعذّر الحفظ — تحقق من الاتصال","warn");
      return false;
    }finally{ _busy=false; }
  }

  // ── إضافة مرفق لاحق ──
  function attachModal(id){
    var r=byId(id); if(!r) return;
    if(!_canAttach(r)){ _toast("⚠ لا تملك صلاحية الإرفاق على هذا الطلب","warn"); return; }
    showCustomModal({
      title:"إضافة مرفق",
      body:'<div class="desc-box">صورة أو PDF — يُضاف إلى مرفقات الطلب ويبقى في سجلّه.</div>'+
           '<div class="form-group" style="margin-bottom:0"><label class="form-label" for="hrp-at-file">الملف</label>'+
           '<input type="file" class="form-input" id="hrp-at-file" accept="image/*,application/pdf"></div>',
      okText:"رفع المرفق",
      onOk:function(){ return _doAttach(id); }
    });
  }
  function _canAttach(r){
    if(isFinalStatus(r&&r.status) && !_isAdmin()) return false;
    return isOwner(r) || canFinance() || _isAdmin();
  }
  async function _doAttach(id){
    if(_busy) return false;
    var file=_file("hrp-at-file");
    if(!file){ _toast("⚠ اختر ملفاً","warn"); return false; }
    _busy=true;
    try{
      var att=await _upload(id, file, "doc");
      if(!att){ _toast("⚠ تعذّر الرفع","warn"); return false; }
      await _tx(id, function(d){
        if(!Array.isArray(d.attachments)) d.attachments=[];
        d.attachments.push(att);
        _push(d, "إضافة مرفق", d.status, att.name||"", "📎");
        return d;
      });
      _log("سداد موارد بشرية — إضافة مرفق", "رقم الطلب: "+id+" — "+(att.name||""));
      _toast("✅ أُضيف المرفق","success");
      return true;
    }catch(e){
      console.warn("hrp attach error", e);
      _toast("⚠ فشل الرفع — حاول مجدداً","warn");
      return false;
    }finally{ _busy=false; }
  }

  // ── إلغاء الطلب ──
  async function cancel(id){
    var r=byId(id); if(!r) return;
    if(!isOwner(r)){ _toast("⚠ الإلغاء لصاحب الطلب أو المسؤول فقط","warn"); return; }
    if(isFinalStatus(r.status)){ _toast("⚠ الطلب منتهٍ — لا يُلغى","warn"); return; }
    try{
      await _confirm({title:"إلغاء الطلب", msg:"سيُعلَّم الطلب "+id+" ملغياً ويخرج من كل المسارات. متابعة؟", icon:"🚫", okText:"إلغاء الطلب", okClass:"btn-danger"});
    }catch(e){ return; }
    try{
      await _tx(id, function(d){
        if(isFinalStatus(d.status)) throw new Error("stale");
        d.status="hrp_cancelled"; d.cancelledAt=_now(); d.cancelledBy=_me();
        _push(d, "إلغاء الطلب", "hrp_cancelled", "", "🚫");
        return d;
      });
      _log("سداد موارد بشرية — إلغاء طلب", "رقم الطلب: "+id);
      _toast("أُلغي الطلب","success");
    }catch(e){
      console.warn("hrp cancel error", e);
      _toast("⚠ تعذّر الإلغاء — تحقق من الاتصال","warn");
    }
  }

  /* ── حذف الطلب — المسؤول وحده ──
     الحذف نهائيّ ولا يُسجَّل في الطلب نفسه (فالوثيقة تزول)، فيُسجَّل في «سجل التدقيق»
     بكل ما يعرّف المحذوف: رقمه ونوع عمله ومبلغه وحالته وقت الحذف — وإلا اختفى الطلب
     بلا أثرٍ يُسأل عنه أحد. ومرفقاته تُحذف من التخزين بعده: مستندات الإقامات والتأشيرات
     بياناتُ أشخاص، وتركها يتيمةً بعد حذف سجلّها أسوأ من فقدها. الحذف أولاً والملفات
     بعده وبأفضل جهد — فشلُ ملفٍ لا يُبقي وثيقةً محذوفةً في القائمة. */
  function remove(id){
    var r=byId(id); if(!r) return;
    if(!_isAdmin()){ _toast("⚠ صلاحية المسؤول فقط","warn"); return; }
    _confirm({
      title:"حذف الطلب "+id,
      // نصٌّ في فقرةٍ واحدة: #confirm-msg لا يحترم أسطر \n (بلا white-space:pre-line)،
      // فالفواصل هنا « — » لا أسطراً تنهار إلى مسافات.
      msg:workTypeLabel(r)+" — "+(r.title||"")+" — المبلغ: "+_fmt(r.amount)+" ر.س"+
          " — الحالة: "+statusLabel(r.status)+
          ". يُحذف الطلب ومرفقاته نهائياً ولا يمكن التراجع.",
      icon:"🗑", okText:"حذف الطلب", okClass:"btn-danger"
    }).then(function(){ return _doRemove(id, r); }).catch(function(){});
  }

  async function _doRemove(id, snapshotOfReq){
    if(_busy) return false;
    if(!_isAdmin()){ _toast("⚠ صلاحية المسؤول فقط","warn"); return false; }
    _busy=true;
    try{
      var r=snapshotOfReq||{};
      // قيد التدقيق يُكتب قبل الحذف — فلو فشل الحذف بقي السجل صادقاً بالمحاولة،
      // ولو نجح بقي الأثر الوحيد لطلبٍ لم تعد له وثيقة.
      _log("سداد موارد بشرية — حذف طلب",
        "رقم الطلب: "+id+" — "+workTypeLabel(r)+" — "+_fmt(r.amount)+" ر.س — الحالة عند الحذف: "+statusLabel(r.status)+
        (r.createdBy?(" — أنشأه: "+r.createdBy):""));

      _deletedIds[id]=1;
      await db.collection(COLL()).doc(id).delete();

      var i=_reqs.findIndex(function(x){ return x && x.id===id; });
      if(i>=0) _reqs.splice(i,1);
      if(_curId===id) _curId=null;

      // المرفقات: أفضل جهد بعد نجاح الحذف — فشلها يترك ملفاً يتيماً لا وثيقةً شبحاً.
      (r.attachments||[]).forEach(function(a){
        try{ if(a && a.url && typeof storage!=="undefined" && storage) storage.refFromURL(a.url).delete().catch(function(){}); }catch(e){}
      });

      _toast("تم حذف الطلب "+id,"success");
      render(); _badge();
      return true;
    }catch(e){
      console.warn("hrp remove error", e);
      delete _deletedIds[id];          // فشل الحذف — يعود الطلب للظهور مع اللقطة التالية
      _toast("⚠ تعذّر حذف الطلب — تحقق من الاتصال","warn");
      return false;
    }finally{ _busy=false; }
  }

  /* ════════ الإشعارات ════════
     نصٌّ مقتضب بلا أسماء موظفين — الإشعارات في وثيقةٍ مشتركة، والتفاصيل تُقرأ
     من داخل الوحدة التي لا يفتحها إلا أصحاب الصلاحية. */
  function _notifyStage(r, status, reason){
    var id=r.id, amt=_fmt0(r.amount), wt=workTypeLabel(r);
    if(status==="hrp_pending_hrm")
      _notify("سداد موارد بشرية — بانتظار مدير الموارد البشرية 👥", id+" — "+wt+" — "+amt+" ر.س", id);
    else if(status==="hrp_pending_pm")
      _notify("سداد موارد بشرية — بانتظار مدير المشاريع 👔", id+" — "+wt+" — "+amt+" ر.س", id);
    else if(status==="hrp_pending_ceo")
      _notify("سداد موارد بشرية — بانتظار المدير التنفيذي 🏢", id+" — "+wt+" — "+amt+" ر.س (بلغت "+_fmt0(_threshold())+" ر.س فأكثر)", id);
    else if(status==="hrp_pending_finance")
      _notify("سداد موارد بشرية — بانتظار المالية 💳", id+" — "+wt+" — "+amt+" ر.س", id);
    else if(status==="hrp_closed")
      _notify("سداد موارد بشرية — تم السداد 🔒", id+" — "+wt+" — "+amt+" ر.س — أُغلق الطلب", id);
    else if(status==="hrp_hrm_rejected" || status==="hrp_pm_rejected" || status==="hrp_ceo_rejected")
      _notify("سداد موارد بشرية — مرفوض ❌", id+" — "+(reason||"")+" — يمكن التصحيح وإعادة الإرسال", id);
    else if(status==="hrp_finance_returned")
      _notify("سداد موارد بشرية — أُعيد من المالية ↩", id+" — "+(reason||"")+" — بانتظار التصحيح", id);
  }

  /* ════════ عدّاد السايدبار — «ما ينتظرك أنت» ════════ */
  function pendingForMe(){
    return _reqs.filter(function(r){
      if(!r) return false;
      if(r.status==="hrp_pending_hrm")     return canHRM();
      if(r.status==="hrp_pending_pm")      return canPM();
      if(r.status==="hrp_pending_ceo")     return canCEO();
      if(r.status==="hrp_pending_finance") return canFinance();
      if(isBouncedStatus(r.status))        return isOwner(r);
      return false;
    });
  }
  function _badge(){
    try{
      var b=document.getElementById("nav-hr-payments-badge");
      if(!b) return;
      var n=canView() ? pendingForMe().length : 0;
      b.textContent=n;
      b.style.display = n>0 ? "" : "none";
    }catch(e){}
  }

  // إظهار مجموعة السايدبار لأصحاب الصلاحية فقط (مخفية افتراضياً في HTML) —
  // وفي وضع المشتريات المركزية وحدَه: داخل مشروعٍ تُخفى ولو ملك الدورُ الصلاحية.
  function _navToggle(){
    try{
      var ok=canView() && _inCentral();
      ["hdr-grp-hrp","grp-hrp"].forEach(function(gid){
        var el=document.getElementById(gid);
        if(!el) return;
        if(!ok){ el.style.display="none"; return; }
        el.style.display = (gid==="hdr-grp-hrp") ? "flex" : "";
      });
      var nb=document.getElementById("nav-new-hr-payment-btn");
      if(nb) nb.style.display = (ok && canCreate()) ? "" : "none";
    }catch(e){}
  }

  /* ════════ بطاقة لوحة المشتريات — «سداد الموارد البشرية بانتظار إجراءك» ════════
     المعتمِد (التنفيذي · مدير المشاريع · المالية · مدير الموارد البشرية) يفتح لوحة
     المشتريات أول يومه، وطلبات السداد المتوقّفة عليه كانت خلف صفحةٍ لا يفتحها إلا
     قصداً — فتنام أياماً بلا سبب. البطاقة تُحقن بعد بطاقة «بانتظار إجراءك» لطلبات
     الشراء مباشرةً (وقبل بطاقة التعاقدات)، على نمط لفّ contracts.js نفسِه: لفٌّ حول
     renderPOMyTasks يستدعي الأصل ثم يرسمنا، فنُرسم مع كل رسمٍ للوحة بلا حاويةٍ
     ثابتةٍ في index.html.
     المصدر الموحّد للحقيقة هو pendingForMe نفسُها التي تغذّي عدّاد السايدبار وتوست
     HailNotify — إن قالت إن الطلب بانتظارك فستجد زرَّ الإجراء في تفاصيله، فلا تعِد
     البطاقة بزرٍّ لن يوجد. والعرض محكوم بـcanView (بيانات الموارد البشرية حساسة —
     لا تُعرض لمن لا يملك فتح الوحدة أصلاً) وبـ_inCentral (لوحةُ مشتريات المشروع
     تمرّ بالمُرسّم نفسِه، والسدادُ مصروفٌ عامّ لا شأنَ للمشروع به). */
  var MYTASK_ID = "hrp-my-tasks-card";
  function _daysSince(iso){
    if(!iso) return null;
    var t=new Date(String(iso)).getTime();
    if(!isFinite(t)) return null;
    return Math.max(0, Math.floor((Date.now()-t)/86400000));
  }
  function renderMyTasks(){
    var anchor=document.getElementById("po-my-tasks-card");
    if(!anchor || !anchor.parentNode) return;
    var host=document.getElementById(MYTASK_ID);
    if(!host){ host=document.createElement("div"); host.id=MYTASK_ID; host.style.margin="0 0 12px"; }
    // الموضع ثابتٌ بعد بطاقة طلبات الشراء مباشرةً مهما كان ترتيبُ تركيب اللفّات —
    // فتقرأ العين دائماً: طلبات الشراء ثم سداد الموارد البشرية ثم التعاقدات.
    if(anchor.nextSibling!==host) anchor.parentNode.insertBefore(host, anchor.nextSibling);
    if(!canView()){ host.style.display="none"; host.innerHTML=""; return; }
    // لوحة مشتريات المشروع ليست مكانها — البطاقة للوضع المركزي وحده (قرار المالك 29/08)
    if(!_inCentral()){ host.style.display="none"; host.innerHTML=""; return; }
    startSync();
    var items=pendingForMe();
    if(!items.length){ host.style.display="none"; host.innerHTML=""; return; }
    // الأقدم أولاً — ما نام أطول يُرى أولاً (نفس ترتيب بطاقتَي المشتريات والتعاقدات)
    items=items.slice().sort(function(a,b){
      return String(a.updatedAt||a.createdAt||"").localeCompare(String(b.updatedAt||b.createdAt||""));
    });
    var rows=items.map(function(r){
      var d=_daysSince(r.updatedAt||r.createdAt);
      var stale=d!=null && d>=3;
      return '<tr>'+
        '<td style="padding:6px 10px;white-space:nowrap"><a href="javascript:void(0)" onclick="hrPayments.open(\''+_jq(r.id)+'\')" style="color:var(--primary);font-weight:700;font-family:monospace;font-size:11px">'+_esc(r.id)+'</a></td>'+
        '<td style="padding:6px 10px;font-weight:700;white-space:nowrap">'+_icon(workTypeIcon(r))+' '+_esc(workTypeLabel(r))+'</td>'+
        '<td style="padding:6px 10px">'+_esc(r.title||"—")+'</td>'+
        '<td style="padding:6px 10px;text-align:center;font-family:monospace;font-size:11.5px;white-space:nowrap">'+_fmt0(r.amount)+' ر.س</td>'+
        '<td style="padding:6px 10px;white-space:nowrap">'+statusBadge(r.status)+'</td>'+
        '<td style="padding:6px 10px;text-align:center;white-space:nowrap'+(stale?';color:var(--danger);font-weight:800':'')+'">'+(d==null?"—":(d+" يوم"+(stale?" ⚠":"")))+'</td>'+
      '</tr>';
    }).join("");
    host.style.display="";
    host.innerHTML=
      '<div class="card" style="border:1.5px solid var(--primary)"><div class="card-body">'+
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">'+
          '<div style="font-weight:900;font-size:14px;color:var(--primary)">'+_icon("users")+' سداد الموارد البشرية بانتظار إجراءك</div>'+
          '<span style="font-size:11px;background:var(--surface2);color:var(--primary);border:1px solid var(--primary);border-radius:10px;padding:0 9px;font-weight:800">'+items.length+'</span>'+
          '<button class="btn btn-ghost btn-sm" style="margin-inline-start:auto" onclick="hrPayments.list()">'+_icon("users")+' الصفحة</button>'+
        '</div>'+
        '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">'+
          '<thead><tr style="background:var(--surface2);color:var(--muted)">'+
            '<th style="padding:6px 10px;text-align:right">الطلب</th>'+
            '<th style="padding:6px 10px;text-align:right">نوع العمل</th>'+
            '<th style="padding:6px 10px;text-align:right">البيان</th>'+
            '<th style="padding:6px 10px;text-align:center">المبلغ</th>'+
            '<th style="padding:6px 10px;text-align:right">المرحلة</th>'+
            '<th style="padding:6px 10px;text-align:center">منذ</th>'+
          '</tr></thead><tbody>'+rows+'</tbody></table></div>'+
      '</div></div>';
  }
  /* لفُّ بطاقة المشتريات — نستدعي الأصل ولا نستبدله، ومرةً واحدة مهما أُعيد الرسم. */
  function hookMyTasks(){
    try{
      if(window.__hrpMyTasksHooked) return;
      if(typeof window.renderPOMyTasks!=="function") return;
      var orig = window.renderPOMyTasks;
      window.renderPOMyTasks = function(){
        var r;
        try{ r = orig.apply(this, arguments); }catch(e){ console.warn("hr-payments/hookMyTasks orig", e); }
        try{ renderMyTasks(); }catch(e){ console.warn("hr-payments/renderMyTasks", e); }
        return r;
      };
      window.__hrpMyTasksHooked = true;
    }catch(e){ console.warn("hr-payments/hookMyTasks", e); }
  }

  /* ════════════════════════════════════════════════════════════════════
     العرض
     ════════════════════════════════════════════════════════════════════ */

  function _hero(title, sub){
    return '<div class="page-hero"><div class="page-hero-titles">'+
      '<div class="page-hero-title">'+title+'</div>'+
      '<div class="page-hero-sub">'+_esc(sub)+'</div>'+
      '</div></div>';
  }
  function _lockHtml(){
    return _hero(_icon("lock")+' غير مصرّح',"سداد أعمال الموارد البشرية")+
      '<div class="card"><div style="text-align:center;padding:34px;color:var(--muted);font-size:13px">'+
      'لا تملك صلاحية الاطلاع على طلبات سداد الموارد البشرية.</div></div>';
  }
  function _empty(icon, msg){
    return '<div style="text-align:center;color:var(--muted);padding:32px">'+
      '<div style="margin-bottom:10px;display:flex;justify-content:center;color:var(--border)">'+
        _svg(icon).replace('<svg ','<svg width="46" height="46" ')+'</div>'+msg+'</div>';
  }

  // ملخّص الطلب داخل نوافذ الاعتماد — بلغة .d-hero/.d-facts نفسها.
  function _summaryHtml(r){
    return '<div class="d-hero" style="border-right-color:'+(_RAIL[r.status]||"var(--muted)")+';margin-bottom:12px">'+
      '<div class="d-hero-top"><span class="po-id">'+_esc(r.id)+'</span>'+statusBadge(r.status)+'</div>'+
      '<div class="d-building">'+_icon(workTypeIcon(r))+' '+_esc(workTypeLabel(r))+'</div>'+
      '<div class="d-loc">'+_esc(r.title||"")+'</div>'+
      '<div class="d-facts"><span class="d-fact"><span class="fl">التكلفة</span>'+
        '<span class="mono">'+_fmt(r.amount)+'</span> ر.س</span></div>'+
    '</div>';
  }

  function render(){
    var el=document.getElementById("page-hr-payments");
    if(!el) return;
    _injectCSS();
    _navToggle();
    if(!canView()){ el.innerHTML=_lockHtml(); return; }
    startSync(); // فُتحت الشاشة ولا مشترك (دورٌ لم يُحمَّل له مسبقاً)؟ رَكِّبه — الدالة idempotent
    if(_curId){
      var r=byId(_curId);
      if(r){ el.innerHTML=_detailHtml(r); _badge(); return; }
      _curId=null;
    }
    el.innerHTML=_listHtml();
    _badge();
  }

  /* ════════ القائمة ════════ */
  function _listHtml(){
    var h='<div class="page-hero"><div class="page-hero-titles">'+
      '<div class="page-hero-title">'+_icon("users")+' سداد أعمال الموارد البشرية</div>'+
      '<div class="page-hero-sub">إقامات ورخص عمل وتأشيرات ورسوم حكومية — من إنشاء الطلب حتى السداد</div>'+
      '</div><div class="page-hero-actions">'+
        (canCreate()?'<button class="btn btn-ghost btn-sm" onclick="showPage(\'new-hr-payment\')">'+_icon("plus")+' طلب سداد جديد</button>':'')+
      '</div></div>';

    if(!_loaded){
      return h+'<div class="card"><div style="text-align:center;padding:30px;color:var(--muted);font-size:13px">جارٍ تحميل الطلبات…</div></div>';
    }
    if(_connIssue){
      return h+'<div class="card"><div style="text-align:center;padding:26px">'+
        '<div style="font-size:13px;color:var(--muted);margin-bottom:10px">تعذّر الوصول إلى بيانات الطلبات — تحقّق من الاتصال.</div>'+
        '<button class="btn btn-primary btn-sm" onclick="hrPayments.retryLoad()">'+_icon("repeat")+' إعادة المحاولة</button></div></div>';
    }

    var cnt=function(st){ return _reqs.filter(function(r){ return r.status===st; }).length; };
    var mk=(new Date()).toISOString().slice(0,7);
    var paidMonth=_reqs.filter(function(r){ return r.status==="hrp_closed" && String(r.closedAt||"").slice(0,7)===mk; })
                       .reduce(function(s,r){ return s+(Number(r.amount)||0); },0);

    // بطاقات اللوحة — نفس مكوّن لوحة المشتريات (.dash-top/.stat-tile)، وكلٌّ منها فلترٌ بنقرة.
    h+='<div class="dash-top" id="hrp-dash">'+
      _tile("mine",    "بانتظار إجرائك", pendingForMe().length, "var(--danger)", "bell")+
      _tile("hrp_pending_hrm",    "مدير الموارد البشرية", cnt("hrp_pending_hrm"), "var(--stage-wait)", "users")+
      _tile("hrp_pending_pm",     "مدير المشاريع",   cnt("hrp_pending_pm"),     "var(--stage-wait)", "send")+
      _tile("hrp_pending_ceo",    "المدير التنفيذي", cnt("hrp_pending_ceo"),    "var(--stage-wait)", "building2")+
      _tile("hrp_pending_finance","سداد المالية",    cnt("hrp_pending_finance"),"var(--stage-move)", "banknote")+
      _tile("hrp_closed",         "مسدَّد هذا الشهر", _fmt0(paidMonth),          "var(--stage-done)","checkCircle", "ر.س")+
    '</div>';

    h+='<div class="card"><div class="filters">'+
      '<input class="form-input" id="hrp-f-search" placeholder="بحث برقم الطلب أو البيان…" value="'+_esc(_fSearch)+'" oninput="hrPayments.setFilter(\'search\',this.value)">'+
      '<div class="filters-row">'+
        '<select class="form-select" id="hrp-f-status" onchange="hrPayments.setFilter(\'status\',this.value)">'+
          '<option value="">كل الحالات</option>'+
          '<option value="__wip"'+(_fStatus==="__wip"?" selected":"")+'>الجارية فقط</option>'+
          '<option value="mine"'+(_fStatus==="mine"?" selected":"")+'>بانتظار إجرائي</option>'+
          '<option value="bounced"'+(_fStatus==="bounced"?" selected":"")+'>مرتدّ للتصحيح</option>'+
          Object.keys(HRP_STATUS).map(function(k){
            return '<option value="'+k+'"'+(_fStatus===k?" selected":"")+'>'+_esc(HRP_STATUS[k])+'</option>';
          }).join("")+
        '</select>'+
        '<select class="form-select" id="hrp-f-type" onchange="hrPayments.setFilter(\'type\',this.value)">'+
          '<option value="">كل أنواع الأعمال</option>'+
          WORK_TYPES.map(function(w){ return '<option value="'+w.k+'"'+(_fType===w.k?" selected":"")+'>'+_esc(w.l)+'</option>'; }).join("")+
        '</select>'+
      '</div>'+
    '</div></div>';

    var rows=_filtered();
    if(!rows.length){
      return h+'<div class="card">'+_empty("receipt", _reqs.length?"لا توجد طلبات مطابقة للتصفية":"لا توجد طلبات سداد بعد")+'</div>';
    }

    h+=rows.map(_cardHtml).join("");
    return h;
  }

  // بطاقة الطلب — بنية بطاقات المنصة نفسها (شريط جانبي ملوّن بالحالة + معرّف + شارة + سطر بيانات).
  function _cardHtml(r){
    var atts=(r.attachments||[]).length;
    return '<div class="hrp-card" style="border-right-color:'+(_RAIL[r.status]||"var(--muted)")+'" onclick="hrPayments.open(\''+_jq(r.id)+'\')">'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">'+
        '<div style="flex:1;min-width:0">'+
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:5px">'+
            '<span class="po-id">'+_esc(r.id)+'</span>'+statusBadge(r.status)+
          '</div>'+
          '<div style="font-size:13px;font-weight:700;margin-bottom:3px">'+_icon(workTypeIcon(r))+' '+_esc(workTypeLabel(r))+'</div>'+
          '<div style="font-size:12px;color:var(--muted);margin-bottom:5px">'+_esc(r.title||"—")+'</div>'+
          '<div style="font-size:11px;color:var(--muted);display:flex;gap:12px;flex-wrap:wrap">'+
            '<span>'+_icon("user")+' '+_esc(r.createdBy||"—")+'</span>'+
            '<span>'+_icon("calendar")+' '+_esc(_date(r.createdAt))+'</span>'+
            (atts?'<span>'+_icon("paperclip")+' '+atts+' مرفق</span>':'')+
          '</div>'+
        '</div>'+
        '<div class="hrp-card-amt"><span class="mono">'+_fmt(r.amount)+'</span> <small>ر.س</small></div>'+
      '</div>'+
    '</div>';
  }

  function _tile(key, lbl, val, color, icon, unit){
    var active = _fStatus===key;
    return '<div class="stat-tile'+(active?" tile-active-filter":"")+'" style="--_c:'+color+';cursor:pointer" '+
      'title="اضغط للتصفية — اضغط مجدداً للإلغاء" onclick="hrPayments.setFilter(\'status\',\''+_jq(active?"":key)+'\')">'+
      '<div class="st-ico">'+_svg(icon)+'</div>'+
      '<div class="st-val" style="color:'+color+'">'+(typeof val==="number"?_fmt0(val):_esc(val))+
        (unit?' <span style="font-size:11px;font-family:\'Cairo\',sans-serif;color:var(--muted)">'+_esc(unit)+'</span>':'')+'</div>'+
      '<div class="st-lbl">'+_esc(lbl)+'</div>'+
    '</div>';
  }

  function _filtered(){
    var q=_fSearch.trim().toLowerCase();
    var mineIds=null;
    if(_fStatus==="mine"){ mineIds={}; pendingForMe().forEach(function(r){ mineIds[r.id]=1; }); }
    return _reqs.filter(function(r){
      if(!r) return false;
      if(_fStatus==="__wip" && isFinalStatus(r.status)) return false;
      if(_fStatus==="mine" && !(mineIds && mineIds[r.id])) return false;
      if(_fStatus==="bounced" && !isBouncedStatus(r.status)) return false;
      if(_fStatus && ["__wip","mine","bounced"].indexOf(_fStatus)<0 && r.status!==_fStatus) return false;
      if(_fType && r.workType!==_fType) return false;
      if(q){
        var hay=(String(r.id||"")+" "+String(r.title||"")+" "+workTypeLabel(r)+" "+String(r.createdBy||"")).toLowerCase();
        if(hay.indexOf(q)<0) return false;
      }
      return true;
    });
  }

  function setFilter(kind, v){
    if(kind==="status") _fStatus=v||"";
    else if(kind==="type") _fType=v||"";
    else if(kind==="search") _fSearch=v||"";
    if(kind==="search"){
      // إعادة رسم القائمة وحدها مع إعادة التركيز — حتى لا يفقد حقل البحث المؤشّر مع كل حرف
      var el=document.getElementById("page-hr-payments");
      if(!el) return;
      var scroll=window.scrollY;
      var box=document.getElementById("hrp-f-search");
      var pos=box?box.selectionStart:null;
      el.innerHTML=_listHtml();
      var again=document.getElementById("hrp-f-search");
      if(again){ again.focus(); if(pos!=null){ try{ again.setSelectionRange(pos,pos); }catch(e){} } }
      window.scrollTo(0, scroll);
      return;
    }
    render();
  }

  /* ════════ التفاصيل ════════ */
  /* المُمرَّرُ في سطح المكتب حاويةُ `.main-area` لا النافذة، فـ`window.scrollTo` وحدَه
     كان يُبقي التفاصيلَ عند موضع القائمة. `_scrollAppToTop` يصفّر الاثنين. */
  function open(id){ _curId=id; try{ showPage("hr-payments"); }catch(e){} render(); try{ (window._scrollAppToTop||function(){ window.scrollTo(0,0); })(); }catch(e){} }
  function back(){ _curId=null; render(); }
  /* زرّ السايدبار يقصد «القائمة» دائماً. لولا تصفير _curId هنا لأعاد showPage رسم
     تفاصيل آخر طلبٍ فُتح (أو الذي أنشأه المستخدم للتوّ) — فيبدو الزرّ معطّلاً. */
  function list(){ _curId=null; try{ showPage("hr-payments"); }catch(e){} render(); }

  // شريط المراحل الفعلي — المراحل المعروضة تتبع شكل الطلب: مدير المشاريع يظهر إن
  // طُلب، والتنفيذي إن بلغت التكلفة السقف — فلا يرى المستخدم بوّابةً لا تخصّه.
  function _stepperHtml(r){
    var th=_threshold();
    var keys=[];
    if(r.needsHRM) keys.push("hrp_pending_hrm");
    if(r.needsPM) keys.push("hrp_pending_pm");
    if((Number(r.amount)||0) >= th) keys.push("hrp_pending_ceo");
    keys.push("hrp_pending_finance","hrp_closed");
    var doneAt={
      hrp_pending_hrm:     r.hrmApprovedAt,
      hrp_pending_pm:      r.pmApprovedAt,
      hrp_pending_ceo:     r.ceoApprovedAt,
      hrp_pending_finance: (r.payment&&r.payment.paidAt),
      hrp_closed:          r.closedAt
    };
    var steps=keys.map(function(k){
      var d=HRP_STAGES.filter(function(x){ return x.key===k; })[0] || {lbl:k, icon:"alertCircle"};
      return {icon:d.icon, lbl:d.lbl, key:k};
    });
    var bounced=isBouncedStatus(r.status), cancelled=(r.status==="hrp_cancelled");
    var curIdx=-1;
    steps.forEach(function(st,i){ if(r.status===st.key) curIdx=i; });
    // المرتدّ والملغى: لا مرحلة «حالية» — ما أُنجز يبقى مُنجزاً وما بعده يُنتظر.
    var effIdx = (bounced||cancelled) ? -1 : curIdx;
    var html='<div class="po-wf"><div class="po-wf-head"><span>مسار الاعتماد</span>'+
      (bounced?'<span class="po-wf-tag rej">'+_esc(statusLabel(r.status))+'</span>':'')+
      (cancelled?'<span class="po-wf-tag rej">ملغي</span>':'')+
      ((Number(r.amount)||0)>=th?'<span class="po-wf-tag ceo">فوق سقف التنفيذي ('+_fmt0(th)+' ر.س)</span>':'')+
    '</div><div class="po-wf-track">'+
      steps.map(function(st,i){
        var done=!!doneAt[st.key] || (effIdx>i);
        var active=(effIdx===i) && !done;
        return '<div class="po-step'+(done?" done":"")+(active?" active":"")+'">'+
            '<div class="ps-ico">'+_svg(st.icon)+'</div>'+
            '<div class="ps-l">'+_esc(st.lbl)+'</div>'+
          '</div>'+(i<steps.length-1?'<div class="po-link'+(done?" done":"")+'"></div>':"");
      }).join("")+
    '</div></div>';
    return html;
  }

  function _detailHtml(r){
    var th=_threshold(), pay=r.payment||{};
    var rail=_RAIL[r.status]||"var(--muted)";
    var reason = r.status==="hrp_hrm_rejected" ? r.hrmRejectReason
               : r.status==="hrp_pm_rejected" ? r.pmRejectReason
               : r.status==="hrp_ceo_rejected" ? r.ceoRejectReason
               : r.status==="hrp_finance_returned" ? r.financeReturnReason : "";

    // الشريط العلويّ = مكانك في النظام (المعرّف + الوحدة)، و.d-hero = السجل نفسه.
    // بلا تكرارٍ ثلاثيّ للمعرّف ونوع العمل والبيان في ثلاثة أسطر متتالية.
    var h='<div class="page-hero"><div class="page-hero-titles">'+
      '<div class="page-hero-title">'+_esc(r.id)+'</div>'+
      '<div class="page-hero-sub">سداد أعمال الموارد البشرية</div>'+
      '</div><div class="page-hero-actions">'+
      '<button class="btn btn-ghost btn-sm" onclick="hrPayments.back()">'+_icon("scrollText")+' كل الطلبات</button>'+
      '</div></div>';

    // رأس التفاصيل — نفس بنية d-hero في تفاصيل طلب الشراء والبلاغ
    h+='<div class="d-hero" style="border-right-color:'+rail+'">'+
      '<div class="d-hero-top">'+statusBadge(r.status)+'</div>'+
      '<div class="d-building">'+_icon(workTypeIcon(r))+' '+_esc(workTypeLabel(r))+'</div>'+
      '<div class="d-loc">'+_esc(r.title||"—")+'</div>'+
      '<div class="d-facts">'+
        '<span class="d-fact"><span class="fl">التكلفة</span><span class="mono">'+_fmt(r.amount)+'</span> ر.س</span>'+
        '<span class="d-fact"><span class="fl">أنشأه</span>'+_esc(r.createdBy||"—")+'</span>'+
        '<span class="d-fact"><span class="fl">التاريخ</span>'+_esc(_date(r.createdAt))+'</span>'+
        (pay.paid?'<span class="d-fact" style="color:var(--accent);border-color:var(--accent)">'+_icon("checkCircle")+' سُدِّد '+_esc(_date(pay.paidAt))+'</span>':'')+
      '</div>'+
    '</div>';

    if(reason){
      h+='<div class="d-hero" style="border-right-color:var(--danger);background:color-mix(in srgb,var(--danger) 7%,var(--surface2))">'+
        '<div style="font-size:12px;font-weight:800;color:var(--danger);margin-bottom:4px">'+_icon("alertTriangle")+' سبب الارتداد</div>'+
        '<div style="font-size:12.5px;line-height:1.8">'+_esc(reason)+'</div>'+
      '</div>';
    }

    h+=_stepperHtml(r);

    // الأزرار
    var acts=_actionsHtml(r);
    if(acts) h+='<div class="card"><div class="card-title">'+_icon("zap")+' الإجراءات المتاحة لك</div><div class="hrp-actions">'+acts+'</div></div>';

    // البيانات
    h+='<div class="card">'+
      '<div class="d-sec">'+
        '<div class="d-sec-label">بيانات الطلب</div>'+
        '<div class="d-grid">'+
          _item("نوعية الأعمال", workTypeLabel(r))+
          _item("تكلفة السداد", '<span class="mono">'+_fmt(r.amount)+'</span> ر.س', true)+
          _item("اعتماد مدير الموارد البشرية", '<span class="po-bool '+(r.needsHRM?"yes":"no")+'">'+(r.needsHRM?"مطلوب":"غير مطلوب — طلب سابق للبوّابة")+'</span>', true)+
          _item("اعتماد مدير المشاريع", '<span class="po-bool '+(r.needsPM?"yes":"no")+'">'+(r.needsPM?"مطلوب":"غير مطلوب")+'</span>', true)+
          _item("بوّابة المدير التنفيذي",
            (Number(r.amount)||0)>=th
              ? '<span class="po-wf-tag ceo">إلزامية — التكلفة ≥ '+_fmt0(th)+' ر.س</span>'
              : '<span class="po-wf-tag fin">غير مطلوبة — أقل من '+_fmt0(th)+' ر.س</span>', true)+
        '</div>'+
      '</div>'+
      '<div class="d-sec" style="margin-bottom:0">'+
        '<div class="d-sec-label">السداد</div>'+
        '<div class="d-grid">'+
          _item("المستفيد", pay.beneficiary||"—")+
          _item("الآيبان", pay.iban?('<span class="mono">'+_esc(pay.iban)+'</span>'):"—", true)+
          _item("ملاحظة", pay.note||"—")+
          _item("الحالة", pay.paid ? ("سُدِّد بواسطة "+(pay.paidBy||"—")) : "لم يُسدَّد بعد")+
          (pay.transferRef?_item("رقم العملية", '<span class="mono">'+_esc(pay.transferRef)+'</span>', true):"")+
        '</div>'+
      '</div>'+
    '</div>';

    // المرفقات
    h+='<div class="card">'+
      '<div class="card-title"><span>'+_icon("paperclip")+' المرفقات</span>'+
      (_canAttach(r)?'<button class="btn btn-ghost btn-sm" onclick="hrPayments.attachModal(\''+_jq(r.id)+'\')">'+_icon("plus")+' إضافة مرفق</button>':'')+'</div>'+
      ((r.attachments&&r.attachments.length)
        ? '<div class="hrp-atts">'+r.attachments.map(function(a){
            return '<a class="hrp-att" href="'+_esc(a.url)+'" target="_blank" rel="noopener">'+
              _icon((a.contentType||"").indexOf("pdf")>=0?"fileText":"image")+
              '<span class="hrp-att-n">'+_esc(a.label||a.name||"مرفق")+'</span>'+
              '<span class="hrp-att-m">'+_esc(a.by||"")+' — '+_esc(_date(a.at))+'</span>'+
            '</a>';
          }).join("")+'</div>'
        : '<div style="color:var(--muted);font-size:12px">لا مرفقات على هذا الطلب.</div>')+
    '</div>';

    // السجل الزمني — مكوّن الخط الزمني نفسه في تفاصيل طلب الشراء (.dtl)
    h+='<div class="card">'+
      '<div class="card-title">'+_icon("clock")+' سجل الطلب</div>'+
      '<div class="dtl">'+((r.timeline||[]).slice().reverse().map(function(t){
        var c=_RAIL[t.code]||"var(--muted)";
        return '<div class="dtl-item"><div class="dtl-dot" style="background:'+c+'"></div><div>'+
          '<div class="dtl-ev">'+_esc(t.event||"")+'</div>'+
          (t.notes?'<div style="font-size:11.5px;color:var(--text);opacity:.8;margin-top:1px">'+_esc(t.notes)+'</div>':'')+
          '<div class="dtl-meta">'+_esc(t.by||"—")+' — '+_esc(_date(t.at))+'</div></div></div>';
      }).join("")||'<div style="color:var(--muted);font-size:12px">لا سجل بعد.</div>')+'</div>'+
    '</div>';

    return h;
  }

  function _item(label, value, raw){
    return '<div class="d-item"><div class="dl">'+_esc(label)+'</div><div class="dv">'+(raw?value:_esc(value))+'</div></div>';
  }

  function _actionsHtml(r){
    var id=_jq(r.id), out=[];
    if(r.status==="hrp_pending_hrm" && canHRM()){
      out.push('<button class="btn btn-success btn-sm" onclick="hrPayments.approveHRM(\''+id+'\')">'+_icon("checkCircle")+' اعتماد</button>');
      out.push('<button class="btn btn-danger btn-sm" onclick="hrPayments.reject(\''+id+'\',\'hrm\')">'+_icon("xCircle")+' رفض</button>');
    }
    if(r.status==="hrp_pending_pm" && canPM()){
      out.push('<button class="btn btn-success btn-sm" onclick="hrPayments.approvePM(\''+id+'\')">'+_icon("checkCircle")+' اعتماد</button>');
      out.push('<button class="btn btn-danger btn-sm" onclick="hrPayments.reject(\''+id+'\',\'pm\')">'+_icon("xCircle")+' رفض</button>');
    }
    if(r.status==="hrp_pending_ceo" && canCEO()){
      out.push('<button class="btn btn-success btn-sm" onclick="hrPayments.approveCEO(\''+id+'\')">'+_icon("checkCircle")+' اعتماد</button>');
      out.push('<button class="btn btn-danger btn-sm" onclick="hrPayments.reject(\''+id+'\',\'ceo\')">'+_icon("xCircle")+' رفض</button>');
    }
    if(r.status==="hrp_pending_finance" && canFinance()){
      out.push('<button class="btn btn-primary btn-sm" onclick="hrPayments.payModal(\''+id+'\')">'+_icon("banknote")+' تسجيل السداد وإغلاق</button>');
      out.push('<button class="btn btn-ghost btn-sm" onclick="hrPayments.financeReturn(\''+id+'\')">'+_icon("rotateCcw")+' إعادة للتصحيح</button>');
    }
    if(canEdit(r)) out.push('<button class="btn btn-ghost btn-sm" onclick="hrPayments.editModal(\''+id+'\')">'+_icon("edit")+' تعديل وإعادة إرسال</button>');
    if(isOwner(r) && !isFinalStatus(r.status)) out.push('<button class="btn btn-ghost btn-sm" onclick="hrPayments.cancel(\''+id+'\')">'+_icon("ban")+' إلغاء الطلب</button>');
    // الحذف للمسؤول وحده وفي أي حالة — آخر الصفّ، فالإجراءات النافعة تسبق الهادمة.
    if(_isAdmin()) out.push('<button class="btn btn-danger btn-sm" onclick="hrPayments.remove(\''+id+'\')">'+_icon("trash")+' حذف الطلب</button>');
    return out.join("");
  }

  /* ════════ ورقة الأنماط ════════
     الوحدة تستعير مكوّنات المنصة كما هي (page-hero / card / card-title / dash-top /
     stat-tile / filters / form-group / d-hero / d-facts / d-sec / d-grid / d-item /
     po-wf / po-step / po-link / po-bool / po-id / badge b-po-* / dtl / mono).
     ما يبقى هنا هو ما لا نظير له فيها فقط — أربع قواعد لا أكثر. */
  function _injectCSS(){
    if(document.getElementById("hrp-css")) return;
    var st=document.createElement("style"); st.id="hrp-css";
    st.textContent=
      '#page-hr-payments,#page-new-hr-payment{direction:rtl}'+
      /* بطاقة الطلب: هندسة .po-card نفسها، لكن بتوكنز السطح والحدود بدل #fff
         المثبّت فيها — فتعمل في الثيم الداكن أيضاً. */
      '.hrp-card{background:var(--surface);border:1px solid var(--border);border-right:4px solid var(--muted);'+
        'border-radius:12px;padding:14px 16px;margin-bottom:10px;cursor:pointer;box-shadow:var(--shadow);transition:box-shadow .15s}'+
      '.hrp-card:hover{box-shadow:0 4px 14px rgba(0,0,0,.11)}'+
      '.hrp-card-amt{font-size:19px;font-weight:800;color:var(--primary);white-space:nowrap;align-self:center}'+
      '.hrp-card-amt .mono{font-family:\'JetBrains Mono\',monospace;font-variant-numeric:tabular-nums}'+
      '.hrp-card-amt small{font-size:11px;font-family:\'Cairo\',sans-serif;color:var(--muted);font-weight:700}'+
      '.hrp-actions{display:flex;flex-wrap:wrap;gap:8px}'+
      '.hrp-hint{font-size:11px;color:var(--muted);margin-top:5px}'+
      '.hrp-atts{display:flex;flex-direction:column;gap:7px}'+
      '.hrp-att{display:flex;align-items:center;gap:9px;background:var(--surface2);border:1px solid var(--border);'+
        'border-radius:9px;padding:8px 11px;font-size:12px;text-decoration:none;color:var(--text)}'+
      '.hrp-att:hover{border-color:var(--primary)}'+
      '.hrp-att-n{font-weight:700;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
      '.hrp-att-m{font-size:10px;color:var(--muted);white-space:nowrap}'+
      '#hrp-dash{grid-template-columns:repeat(6,minmax(0,1fr))}'+
      // ستّ بطاقات على عمودين = ثلاثة صفوف مكتملة، فلا بطاقة يتيمة تحتاج مدّاً.
      '@media(max-width:900px){#hrp-dash{grid-template-columns:repeat(2,minmax(0,1fr))}}'+
      '@media(max-width:560px){.hrp-card-amt{font-size:16px}}';
    document.head.appendChild(st);
  }

  /* ════════ التصدير ════════ */
  window.hrPayments = {
    startSync:startSync, render:render, renderNew:renderNew, retryLoad:retryLoad,
    open:open, back:back, list:list, setFilter:setFilter,
    onTypeChange:onTypeChange, onAmountChange:onAmountChange, submitNew:submitNew,
    approveHRM:approveHRM, approvePM:approvePM, approveCEO:approveCEO, reject:reject,
    payModal:payModal, financeReturn:financeReturn,
    editModal:editModal, attachModal:attachModal, cancel:cancel, remove:remove,
    canView:canView, canCreate:canCreate, pendingForMe:pendingForMe,
    renderMyTasks:renderMyTasks, hookMyTasks:hookMyTasks,
    all:all, byId:byId, refreshNav:_navToggle,
    // دوال نقية مكشوفة لفحوص hail-tests
    _nextStage:_nextStage, _iban:_iban, _threshold:_threshold,
    statusLabel:statusLabel, workTypeLabel:workTypeLabel,
    HRP_STATUS:HRP_STATUS, HRP_FINAL:HRP_FINAL, HRP_BOUNCED:HRP_BOUNCED, WORK_TYPES:WORK_TYPES,
    build:MODULE_BUILD
  };

  // وسم الوحدة يأتي بعد تعريف renderPOMyTasks في النواة، فاللفّ يصحّ هنا مباشرةً —
  // وstartSync يعيد المحاولة احتياطاً إن تغيّر ترتيب التحميل يوماً.
  hookMyTasks();
})();
