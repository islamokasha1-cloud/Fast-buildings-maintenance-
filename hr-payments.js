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
              ↓ (اختار «يحتاج اعتماد مدير المشاريع»؟)
         مدير المشاريع
              ↓ (التكلفة ≥ سقف التنفيذي؟)
         المدير التنفيذي
              ↓
         المالية للسداد  →  يُغلق الطلب فور تسجيل السداد.

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
   • العرض: hr_officer + project_manager + ceo + finance + admin **فقط**.
     مسؤول المستودعات ومسؤول المشتريات والزائر والمراقب لا يرون المجموعة أصلاً.
   • الإنشاء/التعديل/إعادة الإرسال/الإلغاء: hr_officer + admin.
   • اعتماد/رفض المرحلة الأولى: project_manager + admin.
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

  var MODULE_BUILD = "v18.9wz";

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
  var WORK_TYPES = [
    {k:"residency",   l:"إقامات (إصدار / تجديد)",      icon:"🪪"},
    {k:"work_permit", l:"رخص عمل",                     icon:"📄"},
    {k:"visa",        l:"تأشيرات",                     icon:"🛂"},
    {k:"exit_reentry",l:"خروج وعودة",                  icon:"✈️"},
    {k:"sponsor_move",l:"نقل كفالة",                   icon:"🔁"},
    {k:"insurance",   l:"تأمين طبي",                   icon:"🏥"},
    {k:"labor_office",l:"مكتب العمل / رسوم حكومية",    icon:"🏛️"},
    {k:"passport",    l:"جوازات / أحوال",              icon:"📕"},
    {k:"other",       l:"أخرى",                        icon:"🗂️"}
  ];
  var _WT_MAP = (function(){ var m={}; WORK_TYPES.forEach(function(w){ m[w.k]=w; }); return m; })();
  function workTypeLabel(req){
    if(!req) return "—";
    var w=_WT_MAP[req.workType];
    if(!w) return req.workType||"—";
    if(req.workType==="other") return (req.workTypeOther||"").trim() || w.l;
    return w.l;
  }
  function workTypeIcon(req){ var w=_WT_MAP[req&&req.workType]; return w?w.icon:"🗂️"; }

  /* ════════ الحالات ════════ */
  var HRP_STATUS = {
    hrp_pending_pm:      "بانتظار اعتماد مدير المشاريع",
    hrp_pending_ceo:     "بانتظار اعتماد المدير التنفيذي",
    hrp_pending_finance: "بانتظار سداد المالية",
    hrp_closed:          "مغلق — تم السداد",
    hrp_pm_rejected:     "مرفوض من مدير المشاريع",
    hrp_ceo_rejected:    "مرفوض من المدير التنفيذي",
    hrp_finance_returned:"مُعاد من المالية للتصحيح",
    hrp_cancelled:       "ملغي"
  };
  // الحالات النهائية — لا إجراء عليها بعد الآن (تُستثنى من «الجارية»).
  var HRP_FINAL = ["hrp_closed","hrp_cancelled"];
  // الحالات المرتدّة لمسؤول الموارد البشرية — قابلة للتصحيح وإعادة الإرسال.
  var HRP_BOUNCED = ["hrp_pm_rejected","hrp_ceo_rejected","hrp_finance_returned"];

  var HRP_STAGES = [
    {key:"hrp_pending_pm",      lbl:"مدير المشاريع",   icon:"👔", color:"#f59e0b", cls:"b-po-approval"},
    {key:"hrp_pending_ceo",     lbl:"المدير التنفيذي", icon:"🏢", color:"#7c3aed", cls:"b-po-ceo"},
    {key:"hrp_pending_finance", lbl:"سداد المالية",    icon:"💳", color:"#0891b2", cls:"b-po-approval"},
    {key:"hrp_closed",          lbl:"مغلق",            icon:"🔒", color:"#0a7c59", cls:"b-po-closed"}
  ];
  var _STATUS_CLS = {
    hrp_pending_pm:"b-po-approval", hrp_pending_ceo:"b-po-ceo",
    hrp_pending_finance:"b-po-approval", hrp_closed:"b-po-closed",
    hrp_pm_rejected:"b-po-rejected", hrp_ceo_rejected:"b-po-rejected",
    hrp_finance_returned:"b-po-rejected", hrp_cancelled:"b-po-cancelled"
  };
  var _STATUS_ICON = {
    hrp_pending_pm:"👔", hrp_pending_ceo:"🏢", hrp_pending_finance:"💳", hrp_closed:"🔒",
    hrp_pm_rejected:"❌", hrp_ceo_rejected:"❌", hrp_finance_returned:"↩", hrp_cancelled:"🚫"
  };
  function statusLabel(s){ return HRP_STATUS[s] || s || "—"; }
  function isFinalStatus(s){ return HRP_FINAL.indexOf(s)>=0; }
  function isBouncedStatus(s){ return HRP_BOUNCED.indexOf(s)>=0; }
  function statusBadge(s){
    return '<span class="status-badge '+(_STATUS_CLS[s]||"status-open")+'" style="font-size:10px">'+
      (_STATUS_ICON[s]||"") + ' ' + _esc(statusLabel(s)) + '</span>';
  }

  /* ════════════════════════════════════════════════════════════════════
     الدالة النقية لتوجيه المسار — مصدر الحقيقة الوحيد لتسلسل الاعتماد.
     مكشوفة على window.hrPayments لفحوص hail-tests.
     ════════════════════════════════════════════════════════════════════ */
  function _nextStage(req, threshold){
    var amt = Number(req && req.amount) || 0;
    var th  = Number(threshold) || 0;
    // (١) مدير المشاريع أولاً — إن طلبه مُنشئ الطلب ولم يعتمده بعد.
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
  function canPM(){     return _role()==="project_manager" || _isAdmin(); }
  function canCEO(){    return _role()==="ceo" || _isAdmin(); }
  function canFinance(){return _role()==="finance" || _isAdmin(); }
  // العرض للأدوار المعنية وحدها — بيانات الموارد البشرية لا تخصّ المستودع ولا المشتريات.
  function canView(){ return canCreate() || canPM() || canCEO() || canFinance(); }
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
  }

  function _applySnap(snap){
    _reqs = snap.docs.map(function(d){ return Object.assign({id:d.id}, d.data()); })
      .sort(function(a,b){ return String(b.createdAt||"").localeCompare(String(a.createdAt||"")); });
    _loaded=true; _connIssue=false;
    _rerenderIfActive();
  }

  function startSync(){
    _navToggle();
    if(typeof db==="undefined" || !db) return;
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
          url:url, kind:kind||"doc",
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
        '<div class="card"><div class="card-body hrp-note hrp-note-warn">🔒 إنشاء الطلبات من صلاحية مسؤول الموارد البشرية فقط.</div></div>';
      return;
    }
    var th=_threshold();
    el.innerHTML =
      _hero("➕ طلب سداد جديد — الموارد البشرية","نوع العمل، تكلفة السداد، والمستند — لا أكثر") +
      '<div class="card"><div class="card-body">' +
        '<div class="hrp-note">ℹ️ الطلب مختصر عمداً: نوعية الأعمال المطلوب سدادها، تكلفة السداد، ومستندٌ مرفق (ملف الإقامات مثلاً). '+
          'ما يتجاوز <b>'+_fmt0(th)+' ر.س</b> يمرّ على المدير التنفيذي تلقائياً قبل المالية.</div>' +

        '<div class="hrp-form">' +
          '<div class="hrp-field">' +
            '<label for="hrp-n-type">نوعية الأعمال المطلوب سدادها <span class="hrp-req">*</span></label>' +
            '<select class="form-select" id="hrp-n-type" onchange="hrPayments.onTypeChange()">' +
              WORK_TYPES.map(function(w){ return '<option value="'+w.k+'">'+w.icon+' '+_esc(w.l)+'</option>'; }).join("") +
            '</select>' +
          '</div>' +
          '<div class="hrp-field" id="hrp-n-other-wrap" style="display:none">' +
            '<label for="hrp-n-other">حدّد نوع العمل <span class="hrp-req">*</span></label>' +
            '<input class="form-input" id="hrp-n-other" placeholder="مثال: رسوم شهادة صحية">' +
          '</div>' +
          '<div class="hrp-field hrp-span2">' +
            '<label for="hrp-n-title">بيان مختصر <span class="hrp-req">*</span></label>' +
            '<input class="form-input" id="hrp-n-title" maxlength="140" placeholder="مثال: تجديد إقامات 12 عاملاً — دفعة أغسطس">' +
          '</div>' +
          '<div class="hrp-field">' +
            '<label for="hrp-n-amount">تكلفة السداد (ر.س) <span class="hrp-req">*</span></label>' +
            '<input class="form-input hrp-num" id="hrp-n-amount" type="number" min="0" step="0.01" placeholder="0.00" oninput="hrPayments.onAmountChange()">' +
          '</div>' +
          '<div class="hrp-field">' +
            '<label for="hrp-n-pm">اعتماد مدير المشاريع</label>' +
            '<select class="form-select" id="hrp-n-pm">' +
              '<option value="yes">نعم — يحتاج اعتماد مدير المشاريع</option>' +
              '<option value="no">لا — يُرفع مباشرةً</option>' +
            '</select>' +
          '</div>' +
          '<div class="hrp-field hrp-span2">' +
            '<label for="hrp-n-file">المستند المرفق (صورة أو PDF)</label>' +
            '<input type="file" id="hrp-n-file" accept="image/*,application/pdf" style="font-size:12px">' +
            '<div class="hrp-hint">مثال: كشف الإقامات، فاتورة الرسوم، إشعار مكتب العمل.</div>' +
          '</div>' +
          '<div class="hrp-field hrp-span2">' +
            '<div class="hrp-sub">بيانات التحويل (اختيارية — تُسهّل على المالية السداد)</div>' +
          '</div>' +
          '<div class="hrp-field">' +
            '<label for="hrp-n-benef">المستفيد</label>' +
            '<input class="form-input" id="hrp-n-benef" placeholder="اسم الجهة أو الشخص">' +
          '</div>' +
          '<div class="hrp-field">' +
            '<label for="hrp-n-iban">الآيبان</label>' +
            '<input class="form-input" id="hrp-n-iban" placeholder="SA…" style="direction:ltr;text-align:left">' +
          '</div>' +
          '<div class="hrp-field hrp-span2">' +
            '<label for="hrp-n-note">ملاحظة</label>' +
            '<input class="form-input" id="hrp-n-note" maxlength="240" placeholder="اختياري">' +
          '</div>' +
        '</div>' +

        '<div id="hrp-n-route" class="hrp-route"></div>' +

        '<div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;flex-wrap:wrap">' +
          '<button class="btn btn-ghost" onclick="showPage(\'hr-payments\')">إلغاء</button>' +
          '<button class="btn btn-primary" id="hrp-n-submit" onclick="hrPayments.submitNew()">📨 إرسال الطلب</button>' +
        '</div>' +
      '</div></div>';
    onTypeChange();
    onAmountChange();
  }

  function onTypeChange(){
    var t=_val("hrp-n-type");
    var w=document.getElementById("hrp-n-other-wrap");
    if(w) w.style.display = (t==="other") ? "" : "none";
  }

  // معاينة حيّة للمسار — المستخدم يرى إلى أين يذهب طلبه قبل أن يرسله.
  function onAmountChange(){
    var host=document.getElementById("hrp-n-route");
    if(!host) return;
    var amt=_num("hrp-n-amount");
    var needsPM=_val("hrp-n-pm")!=="no";
    var th=_threshold();
    var draft={amount:isFinite(amt)?amt:0, needsPM:needsPM};
    var steps=[];
    if(needsPM) steps.push("👔 مدير المشاريع");
    if((isFinite(amt)?amt:0) >= th) steps.push("🏢 المدير التنفيذي");
    steps.push("💳 المالية للسداد");
    steps.push("🔒 إغلاق");
    host.innerHTML =
      '<div class="hrp-route-t">مسار هذا الطلب:</div>' +
      '<div class="hrp-route-steps">'+steps.map(function(s){ return '<span class="hrp-route-step">'+s+'</span>'; }).join('<span class="hrp-route-arrow">←</span>')+'</div>' +
      ((isFinite(amt)?amt:0) >= th
        ? '<div class="hrp-route-note">التكلفة بلغت '+_fmt0(th)+' ر.س فأكثر — اعتماد المدير التنفيذي إلزامي ولا يُتخطّى.</div>'
        : '');
    // إبقاء المعاينة متزامنة مع تبديل خيار مدير المشاريع أيضاً
    var sel=document.getElementById("hrp-n-pm");
    if(sel && !sel._hrpBound){ sel._hrpBound=true; sel.addEventListener("change", onAmountChange); }
    return draft;
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
        '<div class="hrp-note" style="margin-top:10px">'+
          (willCEO
            ? 'التكلفة '+_fmt(r.amount)+' ر.س ≥ '+_fmt0(th)+' — سيُحال للمدير التنفيذي بعد اعتمادك، ثم للمالية.'
            : 'سيُحال مباشرةً إلى المالية للسداد بعد اعتمادك.')+
        '</div>'+
        '<input class="form-input" id="hrp-pm-note" placeholder="ملاحظة (اختياري)" style="margin-top:10px">',
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
        '<div class="hrp-note" style="margin-top:10px">بعد اعتمادك يُحال الطلب إلى المالية للسداد مباشرةً.</div>'+
        '<input class="form-input" id="hrp-ceo-note" placeholder="ملاحظة (اختياري)" style="margin-top:10px">',
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
        if(gate==="pm"){
          if(d.status!=="hrp_pending_pm") throw new Error("stale");
          d.pmApprovedAt=at; d.pmApprovedBy=by; d.pmRejectReason="";
        }else{
          if(d.status!=="hrp_pending_ceo") throw new Error("stale");
          d.ceoApprovedAt=at; d.ceoApprovedBy=by;
          d.ceoApprovedAmount=Number(d.amount)||0;  // توقيعه مربوطٌ بالمبلغ الذي رآه
          d.ceoRejectReason="";
        }
        d.status = nextStage(d);
        _push(d, gate==="pm" ? "اعتماد مدير المشاريع" : "اعتماد المدير التنفيذي", d.status, note||"", gate==="pm"?"👔":"🏢");
        return d;
      });
      _log("سداد موارد بشرية — "+(gate==="pm"?"اعتماد مدير المشاريع":"اعتماد المدير التنفيذي"),
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
    if(gate==="pm" && !canPM()){ _toast("⚠ صلاحية مدير المشاريع فقط","warn"); return; }
    if(gate==="ceo" && !canCEO()){ _toast("⚠ صلاحية المدير التنفيذي فقط","warn"); return; }
    showCustomModal({
      title: gate==="pm" ? "رفض — مدير المشاريع" : "رفض — المدير التنفيذي",
      body:
        _summaryHtml(r)+
        '<div class="hrp-note hrp-note-warn" style="margin-top:10px">يعود الطلب لمسؤول الموارد البشرية لتصحيحه وإعادة إرساله. سبب الرفض إلزامي.</div>'+
        '<textarea class="form-input" id="hrp-rej-reason" rows="3" placeholder="سبب الرفض" style="margin-top:10px"></textarea>',
      okText:"رفض الطلب",
      onOk:function(){ return _doReject(id, gate, _val("hrp-rej-reason")); }
    });
  }

  async function _doReject(id, gate, reason){
    if(_busy) return false;
    if(!reason){ _toast("⚠ اكتب سبب الرفض","warn"); return false; }
    _busy=true;
    try{
      var target = gate==="pm" ? "hrp_pm_rejected" : "hrp_ceo_rejected";
      var expect = gate==="pm" ? "hrp_pending_pm"  : "hrp_pending_ceo";
      var next=await _tx(id, function(d){
        if(d.status!==expect) throw new Error("stale");
        d.status=target;
        if(gate==="pm"){ d.pmRejectReason=reason; d.pmRejectedAt=_now(); }
        else           { d.ceoRejectReason=reason; d.ceoRejectedAt=_now(); }
        _push(d, gate==="pm" ? "رفض مدير المشاريع" : "رفض المدير التنفيذي", target, reason, "❌");
        return d;
      });
      _log("سداد موارد بشرية — رفض", "رقم الطلب: "+id+" — الجهة: "+(gate==="pm"?"مدير المشاريع":"المدير التنفيذي")+" — السبب: "+reason);
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
        '<div class="hrp-note hrp-note-warn" style="margin-top:10px">يعود لمسؤول الموارد البشرية لتصحيح البيانات وإعادة الإرسال.</div>'+
        '<textarea class="form-input" id="hrp-fr-reason" rows="3" placeholder="سبب الإعادة (بيانات ناقصة، آيبان خاطئ، مستند غير واضح…)" style="margin-top:10px"></textarea>',
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
        (pay.beneficiary?'<div class="hrp-kv"><span>المستفيد</span><b>'+_esc(pay.beneficiary)+'</b></div>':'')+
        (pay.iban?'<div class="hrp-kv"><span>الآيبان</span><b style="direction:ltr;font-family:\'JetBrains Mono\',monospace">'+_esc(pay.iban)+'</b></div>':'')+
        (pay.note?'<div class="hrp-kv"><span>ملاحظة</span><b>'+_esc(pay.note)+'</b></div>':'')+
        '<div class="hrp-note" style="margin-top:10px">السداد دفعة واحدة كاملة بمبلغ <b>'+_fmt(r.amount)+' ر.س</b>؛ بتسجيله يُغلق الطلب.</div>'+
        '<input class="form-input" id="hrp-pay-ref" placeholder="رقم عملية التحويل (اختياري)" style="margin-top:10px">'+
        '<div class="hrp-hint" style="margin-top:10px">إيصال التحويل (صورة أو PDF) — إلزامي:</div>'+
        '<input type="file" id="hrp-pay-file" accept="image/*,application/pdf" style="font-size:12px;margin-top:4px">',
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
    return !r.pmApprovedAt && !r.ceoApprovedAt;
  }

  function editModal(id){
    var r=byId(id); if(!r) return;
    if(!canEdit(r)){ _toast("⚠ لا يمكن تعديل الطلب في حالته الحالية","warn"); return; }
    var th=_threshold();
    showCustomModal({
      title:"تعديل الطلب",
      body:
        '<div class="hrp-note">تعديل التكلفة يعيد حساب المسار: ما يبلغ '+_fmt0(th)+' ر.س فأكثر يعود لبوابة المدير التنفيذي — حتى لو اعتُمد سابقاً بمبلغٍ أقل.</div>'+
        '<div style="margin-top:10px"><label class="hrp-lbl">بيان مختصر</label>'+
        '<input class="form-input" id="hrp-e-title" maxlength="140" value="'+_esc(r.title||"")+'"></div>'+
        '<div style="margin-top:8px"><label class="hrp-lbl">تكلفة السداد (ر.س)</label>'+
        '<input class="form-input hrp-num" id="hrp-e-amount" type="number" min="0" step="0.01" value="'+(Number(r.amount)||0)+'"></div>'+
        '<div style="margin-top:8px"><label class="hrp-lbl">المستفيد</label>'+
        '<input class="form-input" id="hrp-e-benef" value="'+_esc((r.payment&&r.payment.beneficiary)||"")+'"></div>'+
        '<div style="margin-top:8px"><label class="hrp-lbl">الآيبان</label>'+
        '<input class="form-input" id="hrp-e-iban" style="direction:ltr;text-align:left" value="'+_esc((r.payment&&r.payment.iban)||"")+'"></div>'+
        '<div style="margin-top:8px"><label class="hrp-lbl">ملاحظة</label>'+
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
        d.pmRejectReason=""; d.ceoRejectReason=""; d.financeReturnReason="";
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
      body:'<div class="hrp-hint">صورة أو PDF — يُضاف إلى مرفقات الطلب ويبقى في سجلّه.</div>'+
           '<input type="file" id="hrp-at-file" accept="image/*,application/pdf" style="font-size:12px;margin-top:8px">',
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

  /* ════════ الإشعارات ════════
     نصٌّ مقتضب بلا أسماء موظفين — الإشعارات في وثيقةٍ مشتركة، والتفاصيل تُقرأ
     من داخل الوحدة التي لا يفتحها إلا أصحاب الصلاحية. */
  function _notifyStage(r, status, reason){
    var id=r.id, amt=_fmt0(r.amount), wt=workTypeLabel(r);
    if(status==="hrp_pending_pm")
      _notify("سداد موارد بشرية — بانتظار مدير المشاريع 👔", id+" — "+wt+" — "+amt+" ر.س", id);
    else if(status==="hrp_pending_ceo")
      _notify("سداد موارد بشرية — بانتظار المدير التنفيذي 🏢", id+" — "+wt+" — "+amt+" ر.س (بلغت "+_fmt0(_threshold())+" ر.س فأكثر)", id);
    else if(status==="hrp_pending_finance")
      _notify("سداد موارد بشرية — بانتظار المالية 💳", id+" — "+wt+" — "+amt+" ر.س", id);
    else if(status==="hrp_closed")
      _notify("سداد موارد بشرية — تم السداد 🔒", id+" — "+wt+" — "+amt+" ر.س — أُغلق الطلب", id);
    else if(status==="hrp_pm_rejected" || status==="hrp_ceo_rejected")
      _notify("سداد موارد بشرية — مرفوض ❌", id+" — "+(reason||"")+" — يمكن التصحيح وإعادة الإرسال", id);
    else if(status==="hrp_finance_returned")
      _notify("سداد موارد بشرية — أُعيد من المالية ↩", id+" — "+(reason||"")+" — بانتظار التصحيح", id);
  }

  /* ════════ عدّاد السايدبار — «ما ينتظرك أنت» ════════ */
  function pendingForMe(){
    return _reqs.filter(function(r){
      if(!r) return false;
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

  // إظهار مجموعة السايدبار لأصحاب الصلاحية فقط (مخفية افتراضياً في HTML).
  function _navToggle(){
    try{
      var ok=canView();
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
    return _hero("🔒 غير مصرّح","سداد أعمال الموارد البشرية")+
      '<div class="card"><div class="card-body hrp-note hrp-note-warn">لا تملك صلاحية الاطلاع على طلبات سداد الموارد البشرية.</div></div>';
  }

  function _summaryHtml(r){
    return '<div class="hrp-sum">'+
      '<div class="hrp-sum-t">'+workTypeIcon(r)+' '+_esc(workTypeLabel(r))+'</div>'+
      '<div class="hrp-sum-s">'+_esc(r.id)+' — '+_esc(r.title||"")+'</div>'+
      '<div class="hrp-sum-a">'+_fmt(r.amount)+' <span>ر.س</span></div>'+
    '</div>';
  }

  function render(){
    var el=document.getElementById("page-hr-payments");
    if(!el) return;
    _injectCSS();
    _navToggle();
    if(!canView()){ el.innerHTML=_lockHtml(); return; }
    if(_curId){
      var r=byId(_curId);
      if(r){ el.innerHTML=_detailHtml(r); _badge(); return; }
      _curId=null;
    }
    el.innerHTML=_listHtml();
    _badge();
  }

  function _listHtml(){
    var h=_hero("🪪 سداد أعمال الموارد البشرية","إقامات، رخص عمل، تأشيرات ورسوم حكومية — من الإنشاء حتى السداد");

    if(!_loaded){
      return h+'<div class="card"><div class="card-body" style="text-align:center;color:var(--muted);font-size:13px;padding:26px">جارٍ تحميل الطلبات…</div></div>';
    }
    if(_connIssue){
      return h+'<div class="card"><div class="card-body" style="text-align:center;padding:22px">'+
        '<div style="font-size:13px;color:var(--muted);margin-bottom:10px">تعذّر الوصول إلى بيانات الطلبات — تحقّق من الاتصال.</div>'+
        '<button class="btn btn-primary btn-sm" onclick="hrPayments.retryLoad()">↻ إعادة المحاولة</button></div></div>';
    }

    var mine=pendingForMe().length;
    var wip=_reqs.filter(function(r){ return !isFinalStatus(r.status); });
    var cnt=function(s){ return _reqs.filter(function(r){ return r.status===s; }).length; };
    var mk=(new Date()).toISOString().slice(0,7);
    var paidMonth=_reqs.filter(function(r){ return r.status==="hrp_closed" && String(r.closedAt||"").slice(0,7)===mk; })
                       .reduce(function(s,r){ return s+(Number(r.amount)||0); },0);

    h+='<div class="hrp-stats">'+
      _stat("بانتظار إجرائك", mine, "#b45309", "mine")+
      _stat("مدير المشاريع", cnt("hrp_pending_pm"), "#f59e0b", "hrp_pending_pm")+
      _stat("المدير التنفيذي", cnt("hrp_pending_ceo"), "#7c3aed", "hrp_pending_ceo")+
      _stat("سداد المالية", cnt("hrp_pending_finance"), "#0891b2", "hrp_pending_finance")+
      _stat("مرتدّ للتصحيح", _reqs.filter(function(r){ return isBouncedStatus(r.status); }).length, "#dc2626", "bounced")+
      _stat("مسدَّد هذا الشهر", _fmt0(paidMonth)+" ر.س", "#0a7c59", "hrp_closed")+
    '</div>';

    // الفلاتر
    h+='<div class="card" style="margin-bottom:12px"><div class="card-body hrp-filters">'+
      '<input class="form-input" id="hrp-f-search" placeholder="بحث برقم الطلب أو البيان…" value="'+_esc(_fSearch)+'" oninput="hrPayments.setFilter(\'search\',this.value)">'+
      '<select class="form-select" id="hrp-f-status" onchange="hrPayments.setFilter(\'status\',this.value)">'+
        '<option value="">كل الحالات</option>'+
        '<option value="__wip"'+(_fStatus==="__wip"?" selected":"")+'>الجارية فقط ('+wip.length+')</option>'+
        '<option value="mine"'+(_fStatus==="mine"?" selected":"")+'>بانتظار إجرائي</option>'+
        '<option value="bounced"'+(_fStatus==="bounced"?" selected":"")+'>مرتدّ للتصحيح</option>'+
        Object.keys(HRP_STATUS).map(function(k){
          return '<option value="'+k+'"'+(_fStatus===k?" selected":"")+'>'+_esc(HRP_STATUS[k])+'</option>';
        }).join("")+
      '</select>'+
      '<select class="form-select" id="hrp-f-type" onchange="hrPayments.setFilter(\'type\',this.value)">'+
        '<option value="">كل أنواع الأعمال</option>'+
        WORK_TYPES.map(function(w){ return '<option value="'+w.k+'"'+(_fType===w.k?" selected":"")+'>'+w.icon+' '+_esc(w.l)+'</option>'; }).join("")+
      '</select>'+
      (canCreate()?'<button class="btn btn-primary btn-sm" onclick="showPage(\'new-hr-payment\')">➕ طلب سداد جديد</button>':'')+
    '</div></div>';

    var rows=_filtered();
    if(!rows.length){
      h+='<div class="card"><div class="card-body" style="text-align:center;color:var(--muted);font-size:13px;padding:26px">'+
         (_reqs.length?'لا توجد طلبات مطابقة للتصفية':'لا توجد طلبات سداد بعد')+'</div></div>';
      return h;
    }

    h+='<div class="hrp-table-wrap"><table class="hrp-table"><thead><tr>'+
      '<th>الطلب</th><th>نوع العمل</th><th>البيان</th><th>التكلفة</th><th>الحالة</th><th>أنشأه</th><th>التاريخ</th>'+
    '</tr></thead><tbody>'+
    rows.map(function(r){
      return '<tr class="hrp-click" onclick="hrPayments.open(\''+_jq(r.id)+'\')">'+
        '<td style="font-family:\'JetBrains Mono\',monospace;font-weight:700;white-space:nowrap">'+_esc(r.id)+'</td>'+
        '<td style="white-space:nowrap">'+workTypeIcon(r)+' '+_esc(workTypeLabel(r))+'</td>'+
        '<td>'+_esc(r.title||"—")+(r.attachments&&r.attachments.length?' <span title="مرفقات">📎'+r.attachments.length+'</span>':'')+'</td>'+
        '<td class="hrp-num">'+_fmt(r.amount)+'</td>'+
        '<td>'+statusBadge(r.status)+'</td>'+
        '<td style="white-space:nowrap">'+_esc(r.createdBy||"—")+'</td>'+
        '<td style="white-space:nowrap;color:var(--muted);font-size:11px">'+_esc(_date(r.createdAt))+'</td>'+
      '</tr>';
    }).join("")+
    '</tbody></table></div>';
    return h;
  }

  function _stat(lbl, val, color, filterKey){
    return '<div class="hrp-stat" style="--sc:'+color+'" onclick="hrPayments.setFilter(\'status\',\''+_jq(filterKey||"")+'\')">'+
      '<div class="hrp-stat-v">'+(typeof val==="number"?_fmt0(val):_esc(val))+'</div>'+
      '<div class="hrp-stat-l">'+_esc(lbl)+'</div>'+
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
      // إعادة رسم الجدول وحده حتى لا يفقد حقل البحث التركيز مع كل حرف
      var host=document.querySelector("#page-hr-payments .hrp-table-wrap");
      var el=document.getElementById("page-hr-payments");
      if(el){
        var scroll=window.scrollY;
        var sel=document.getElementById("hrp-f-search");
        var pos=sel?sel.selectionStart:null;
        el.innerHTML=_listHtml();
        var again=document.getElementById("hrp-f-search");
        if(again){ again.focus(); if(pos!=null){ try{ again.setSelectionRange(pos,pos); }catch(e){} } }
        window.scrollTo(0, scroll);
      }
      void host;
      return;
    }
    render();
  }

  /* ════════ التفاصيل ════════ */
  function open(id){ _curId=id; try{ showPage("hr-payments"); }catch(e){} render(); try{ window.scrollTo(0,0); }catch(e){} }
  function back(){ _curId=null; render(); }
  /* زرّ السايدبار يقصد «القائمة» دائماً. لولا تصفير _curId هنا لأعاد showPage رسم
     تفاصيل آخر طلبٍ فُتح (أو الذي أنشأه المستخدم للتوّ) — فيبدو الزرّ معطّلاً. */
  function list(){ _curId=null; try{ showPage("hr-payments"); }catch(e){} render(); }

  function _stepperHtml(r){
    // المراحل المعروضة تتبع شكل الطلب نفسه: مدير المشاريع يظهر إن طُلب،
    // والتنفيذي يظهر إن بلغت التكلفة السقف — فلا يرى المستخدم بوابةً لا تخصّه.
    var th=_threshold();
    var keys=[];
    if(r.needsPM) keys.push("hrp_pending_pm");
    if((Number(r.amount)||0) >= th) keys.push("hrp_pending_ceo");
    keys.push("hrp_pending_finance","hrp_closed");
    var doneAt={
      hrp_pending_pm:      r.pmApprovedAt,
      hrp_pending_ceo:     r.ceoApprovedAt,
      hrp_pending_finance: (r.payment&&r.payment.paidAt),
      hrp_closed:          r.closedAt
    };
    return '<div class="hrp-steps">'+keys.map(function(k){
      var d=HRP_STAGES.find(function(x){ return x.key===k; }) || {lbl:k, icon:"•"};
      var state = doneAt[k] ? "done" : (r.status===k ? "cur" : "todo");
      if(isFinalStatus(r.status) && r.status!=="hrp_closed") state = doneAt[k] ? "done" : "todo";
      return '<div class="hrp-step hrp-step-'+state+'">'+
        '<span class="hrp-step-i">'+d.icon+'</span>'+
        '<span class="hrp-step-l">'+_esc(d.lbl)+'</span>'+
        (doneAt[k]?'<span class="hrp-step-d">'+_esc(_date(doneAt[k]))+'</span>':'')+
      '</div>';
    }).join('<span class="hrp-step-sep">←</span>')+'</div>';
  }

  function _detailHtml(r){
    var th=_threshold();
    var h='<div class="page-hero"><div class="page-hero-titles">'+
      '<div class="page-hero-title">'+workTypeIcon(r)+' '+_esc(r.id)+'</div>'+
      '<div class="page-hero-sub">'+_esc(workTypeLabel(r))+' — '+_esc(r.title||"")+'</div>'+
      '</div><div class="page-hero-actions">'+
      '<button class="btn btn-ghost btn-sm" onclick="hrPayments.back()">→ رجوع للقائمة</button>'+
      '</div></div>';

    // شريط الحالة الحالية + الارتداد إن وُجد
    var reason = r.status==="hrp_pm_rejected" ? r.pmRejectReason
               : r.status==="hrp_ceo_rejected" ? r.ceoRejectReason
               : r.status==="hrp_finance_returned" ? r.financeReturnReason : "";
    h+='<div class="card" style="margin-bottom:12px"><div class="card-body">'+
      '<div class="hrp-head">'+
        '<div>'+statusBadge(r.status)+'</div>'+
        '<div class="hrp-amount">'+_fmt(r.amount)+' <span>ر.س</span></div>'+
      '</div>'+
      (reason?'<div class="hrp-note hrp-note-warn" style="margin-top:10px"><b>سبب الارتداد:</b> '+_esc(reason)+'</div>':'')+
      _stepperHtml(r)+
    '</div></div>';

    // البيانات
    var pay=r.payment||{};
    h+='<div class="hrp-cols">'+
      '<div class="card"><div class="card-body">'+
        '<div class="hrp-card-t">بيانات الطلب</div>'+
        _kv("نوعية الأعمال", workTypeIcon(r)+" "+workTypeLabel(r))+
        _kv("البيان", r.title||"—")+
        _kv("تكلفة السداد", _fmt(r.amount)+" ر.س")+
        _kv("اعتماد مدير المشاريع", r.needsPM?"مطلوب":"غير مطلوب")+
        _kv("بوابة المدير التنفيذي", (Number(r.amount)||0)>=th ? ("إلزامية — التكلفة ≥ "+_fmt0(th)+" ر.س") : ("غير مطلوبة — أقل من "+_fmt0(th)+" ر.س"))+
        _kv("أنشأه", (r.createdBy||"—")+" — "+_date(r.createdAt))+
      '</div></div>'+
      '<div class="card"><div class="card-body">'+
        '<div class="hrp-card-t">السداد</div>'+
        _kv("المستفيد", pay.beneficiary||"—")+
        _kv("الآيبان", pay.iban?('<span style="direction:ltr;font-family:\'JetBrains Mono\',monospace">'+_esc(pay.iban)+'</span>'):"—", true)+
        _kv("ملاحظة", pay.note||"—")+
        _kv("الحالة", pay.paid?("مسدَّد — "+_date(pay.paidAt)+" بواسطة "+(pay.paidBy||"—")):"لم يُسدَّد بعد")+
        (pay.transferRef?_kv("رقم العملية", pay.transferRef):"")+
      '</div></div>'+
    '</div>';

    // الأزرار
    var acts=_actionsHtml(r);
    if(acts) h+='<div class="card" style="margin-top:12px"><div class="card-body"><div class="hrp-actions">'+acts+'</div></div></div>';

    // المرفقات
    h+='<div class="card" style="margin-top:12px"><div class="card-body">'+
      '<div class="hrp-card-t">المرفقات'+(_canAttach(r)?'<button class="btn btn-ghost btn-sm" style="margin-inline-start:auto" onclick="hrPayments.attachModal(\''+_jq(r.id)+'\')">📎 إضافة مرفق</button>':'')+'</div>'+
      ((r.attachments&&r.attachments.length)
        ? '<div class="hrp-atts">'+r.attachments.map(function(a){
            return '<a class="hrp-att" href="'+_esc(a.url)+'" target="_blank" rel="noopener">'+
              '<span>'+((a.contentType||"").indexOf("pdf")>=0?"📄":"🖼️")+'</span>'+
              '<span class="hrp-att-n">'+_esc(a.label||a.name||"مرفق")+'</span>'+
              '<span class="hrp-att-m">'+_esc(a.by||"")+' — '+_esc(_date(a.at))+'</span>'+
            '</a>';
          }).join("")+'</div>'
        : '<div style="color:var(--muted);font-size:12px">لا مرفقات على هذا الطلب.</div>')+
    '</div></div>';

    // السجل الزمني
    h+='<div class="card" style="margin-top:12px"><div class="card-body">'+
      '<div class="hrp-card-t">سجل الطلب</div>'+
      '<div class="hrp-tl">'+((r.timeline||[]).slice().reverse().map(function(t){
        return '<div class="hrp-tl-i">'+
          '<span class="hrp-tl-ic">'+_esc(t.icon||"•")+'</span>'+
          '<div><div class="hrp-tl-e">'+_esc(t.event||"")+'</div>'+
          (t.notes?'<div class="hrp-tl-n">'+_esc(t.notes)+'</div>':'')+
          '<div class="hrp-tl-m">'+_esc(t.by||"—")+' — '+_esc(_date(t.at))+'</div></div>'+
        '</div>';
      }).join("")||'<div style="color:var(--muted);font-size:12px">لا سجل بعد.</div>')+'</div>'+
    '</div></div>';

    return h;
  }

  function _kv(k, v, raw){
    return '<div class="hrp-kv"><span>'+_esc(k)+'</span><b>'+(raw?v:_esc(v))+'</b></div>';
  }

  function _actionsHtml(r){
    var id=_jq(r.id), out=[];
    if(r.status==="hrp_pending_pm" && canPM()){
      out.push('<button class="btn btn-primary btn-sm" onclick="hrPayments.approvePM(\''+id+'\')">✅ اعتماد مدير المشاريع</button>');
      out.push('<button class="btn btn-delete btn-sm" onclick="hrPayments.reject(\''+id+'\',\'pm\')">❌ رفض</button>');
    }
    if(r.status==="hrp_pending_ceo" && canCEO()){
      out.push('<button class="btn btn-primary btn-sm" onclick="hrPayments.approveCEO(\''+id+'\')">✅ اعتماد المدير التنفيذي</button>');
      out.push('<button class="btn btn-delete btn-sm" onclick="hrPayments.reject(\''+id+'\',\'ceo\')">❌ رفض</button>');
    }
    if(r.status==="hrp_pending_finance" && canFinance()){
      out.push('<button class="btn btn-primary btn-sm" onclick="hrPayments.payModal(\''+id+'\')">💳 تسجيل السداد وإغلاق</button>');
      out.push('<button class="btn btn-ghost btn-sm" onclick="hrPayments.financeReturn(\''+id+'\')">↩ إعادة للتصحيح</button>');
    }
    if(canEdit(r)) out.push('<button class="btn btn-ghost btn-sm" onclick="hrPayments.editModal(\''+id+'\')">✏️ تعديل وإعادة إرسال</button>');
    if(isOwner(r) && !isFinalStatus(r.status)) out.push('<button class="btn btn-delete btn-sm" onclick="hrPayments.cancel(\''+id+'\')">🚫 إلغاء الطلب</button>');
    return out.join("");
  }

  /* ════════ ورقة الأنماط — بتوكنز المنصة (تعمل في الثيمين) ════════ */
  function _injectCSS(){
    if(document.getElementById("hrp-css")) return;
    var st=document.createElement("style"); st.id="hrp-css";
    st.textContent=
      '#page-hr-payments,#page-new-hr-payment{direction:rtl}'+
      '.hrp-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:12px}'+
      '.hrp-stat{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 14px;box-shadow:var(--shadow);cursor:pointer;border-top:3px solid var(--sc,var(--primary))}'+
      '.hrp-stat:hover{background:var(--surface2)}'+
      '.hrp-stat-v{font-family:\'JetBrains Mono\',monospace;font-size:19px;font-weight:800;color:var(--sc,var(--primary));font-variant-numeric:tabular-nums}'+
      '.hrp-stat-l{font-size:11px;color:var(--muted);font-weight:700;margin-top:3px}'+
      '.hrp-filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center}'+
      '.hrp-filters .form-input{flex:1 1 200px;min-width:150px}'+
      '.hrp-filters .form-select{flex:0 1 200px;min-width:150px}'+
      '.hrp-table-wrap{background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);overflow-x:auto}'+
      '.hrp-table{width:100%;border-collapse:collapse;font-size:12px;min-width:640px}'+
      '.hrp-table th{background:var(--surface2);padding:10px 12px;text-align:right;font-weight:700;color:var(--muted);font-size:11px;border-bottom:1px solid var(--border);white-space:nowrap}'+
      '.hrp-table td{padding:9px 12px;border-bottom:1px solid var(--border);vertical-align:middle}'+
      '.hrp-table tbody tr:last-child td{border-bottom:none}'+
      '.hrp-table tbody tr.hrp-click{cursor:pointer}'+
      '.hrp-table tbody tr.hrp-click:hover td{background:var(--surface2)}'+
      '.hrp-num{direction:ltr;text-align:right;font-family:\'JetBrains Mono\',monospace;font-variant-numeric:tabular-nums}'+
      '.hrp-note{background:color-mix(in srgb,var(--primary) 8%,var(--surface));border:1px solid color-mix(in srgb,var(--primary) 22%,var(--border));border-radius:8px;padding:9px 12px;font-size:12px;color:var(--text);line-height:1.7}'+
      '.hrp-note-warn{background:color-mix(in srgb,#f59e0b 12%,var(--surface));border-color:color-mix(in srgb,#f59e0b 32%,var(--border))}'+
      '.hrp-form{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}'+
      '.hrp-form .hrp-span2{grid-column:1/-1}'+
      '.hrp-field label,.hrp-lbl{display:block;font-size:11.5px;font-weight:700;color:var(--muted);margin-bottom:5px}'+
      '.hrp-req{color:#dc2626}'+
      '.hrp-hint{font-size:11px;color:var(--muted);margin-top:5px}'+
      '.hrp-sub{font-size:12px;font-weight:800;color:var(--primary);border-top:1px solid var(--border);padding-top:10px}'+
      '.hrp-route{margin-top:14px;background:var(--surface2);border:1px dashed var(--border);border-radius:10px;padding:10px 12px}'+
      '.hrp-route-t{font-size:11px;font-weight:800;color:var(--muted);margin-bottom:6px}'+
      '.hrp-route-steps{display:flex;flex-wrap:wrap;gap:6px;align-items:center}'+
      '.hrp-route-step{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:3px 11px;font-size:11.5px;font-weight:700;white-space:nowrap}'+
      '.hrp-route-arrow{color:var(--muted);font-size:11px}'+
      '.hrp-route-note{margin-top:7px;font-size:11px;color:#7c3aed;font-weight:700}'+
      '.hrp-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}'+
      '.hrp-amount{font-family:\'JetBrains Mono\',monospace;font-size:22px;font-weight:800;color:var(--primary);font-variant-numeric:tabular-nums}'+
      '.hrp-amount span{font-size:12px;font-family:\'Cairo\',sans-serif;color:var(--muted)}'+
      '.hrp-steps{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:12px}'+
      '.hrp-step{display:flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:20px;padding:4px 12px;font-size:11.5px;font-weight:700;background:var(--surface2);color:var(--muted)}'+
      '.hrp-step-done{background:color-mix(in srgb,#0a7c59 14%,var(--surface));border-color:color-mix(in srgb,#0a7c59 34%,var(--border));color:#0a7c59}'+
      '.hrp-step-cur{background:color-mix(in srgb,var(--primary) 14%,var(--surface));border-color:var(--primary);color:var(--primary)}'+
      '.hrp-step-d{font-family:\'JetBrains Mono\',monospace;font-size:9.5px;opacity:.75}'+
      '.hrp-step-sep{color:var(--muted);font-size:11px}'+
      '.hrp-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}'+
      '.hrp-card-t{display:flex;align-items:center;font-size:12.5px;font-weight:800;color:var(--primary);margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border)}'+
      '.hrp-kv{display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:5px 0;border-bottom:1px dashed var(--border)}'+
      '.hrp-kv:last-child{border-bottom:none}'+
      '.hrp-kv span{color:var(--muted);white-space:nowrap}'+
      '.hrp-kv b{text-align:left}'+
      '.hrp-actions{display:flex;flex-wrap:wrap;gap:8px}'+
      '.hrp-atts{display:flex;flex-direction:column;gap:7px}'+
      '.hrp-att{display:flex;align-items:center;gap:9px;background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:8px 11px;font-size:12px;text-decoration:none;color:var(--text)}'+
      '.hrp-att:hover{border-color:var(--primary)}'+
      '.hrp-att-n{font-weight:700;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
      '.hrp-att-m{font-size:10px;color:var(--muted);white-space:nowrap}'+
      '.hrp-tl{display:flex;flex-direction:column;gap:9px}'+
      '.hrp-tl-i{display:flex;gap:10px;align-items:flex-start}'+
      '.hrp-tl-ic{width:24px;height:24px;border-radius:50%;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0}'+
      '.hrp-tl-e{font-size:12px;font-weight:700}'+
      '.hrp-tl-n{font-size:11.5px;color:var(--text);opacity:.85;margin-top:2px}'+
      '.hrp-tl-m{font-size:10.5px;color:var(--muted);margin-top:2px}'+
      '.hrp-sum{background:var(--surface2);border-radius:9px;padding:10px 12px;margin-bottom:4px}'+
      '.hrp-sum-t{font-size:12.5px;font-weight:800}'+
      '.hrp-sum-s{font-size:11px;color:var(--muted);margin-top:2px}'+
      '.hrp-sum-a{font-family:\'JetBrains Mono\',monospace;font-size:17px;font-weight:800;color:var(--primary);margin-top:5px}'+
      '.hrp-sum-a span{font-size:11px;font-family:\'Cairo\',sans-serif;color:var(--muted)}'+
      '@media(max-width:720px){.hrp-form,.hrp-cols{grid-template-columns:1fr}}';
    document.head.appendChild(st);
  }

  /* ════════ التصدير ════════ */
  window.hrPayments = {
    startSync:startSync, render:render, renderNew:renderNew, retryLoad:retryLoad,
    open:open, back:back, list:list, setFilter:setFilter,
    onTypeChange:onTypeChange, onAmountChange:onAmountChange, submitNew:submitNew,
    approvePM:approvePM, approveCEO:approveCEO, reject:reject,
    payModal:payModal, financeReturn:financeReturn,
    editModal:editModal, attachModal:attachModal, cancel:cancel,
    canView:canView, canCreate:canCreate, pendingForMe:pendingForMe,
    all:all, byId:byId, refreshNav:_navToggle,
    // دوال نقية مكشوفة لفحوص hail-tests
    _nextStage:_nextStage, _iban:_iban, _threshold:_threshold,
    statusLabel:statusLabel, workTypeLabel:workTypeLabel,
    HRP_STATUS:HRP_STATUS, HRP_FINAL:HRP_FINAL, HRP_BOUNCED:HRP_BOUNCED, WORK_TYPES:WORK_TYPES,
    build:MODULE_BUILD
  };
})();
