/* ═══════════════════════════════════════════════════════════════════════════
   نظام هيل — وحدة البند المستعاض  (substitute-budget.js)
   ملف خارجي مستقل يُحقَن في صفحة #page-substitute-budget، على نمط stocktake.js
   و price-analysis.js: IIFE يعرض كائناً واحداً window.substituteBudget، ويقرأ
   خدمات النواة (db / currentUser / esc / toast / showConfirm / showCustomModal /
   logAudit / فحوص الأدوار / _projectsList / purchases / poIsClosed /
   poActualCost / getPOTotal / _getProjName) مباشرةً بالاسم — إذ تتشارك كل وسوم
   <script> الكلاسيكية نفس البيئة المعجمية العامة.

   الفكرة (متفق عليها مع المالك):
   • «البند المستعاض» رصيدٌ من المال لكل مشروع يُستخدم لشراء بنودٍ أو تقديم خدماتٍ
     خارج بنود العقد، مع هامش ربحٍ ثابتٍ لكل مشروع (10% / 25% ...).
   • الرصيد ليس خاصيةً على المشروع بل «حساب» مستقلّ، نوعان:
       - مربوط بمشروعٍ من القائمة (linked)  → يأخذ اسمه من _projectsList.
       - مستقلّ باسمه الخاص (standalone)     → لمشاريع خارج قائمة المشاريع.
     كلاهما في سجلٍّ واحد (وثيقة meta/substitute_accounts) بنفس الأعمدة والقواعد.
   • الطلب يُعلَّم «مستعاضاً» ويشير صراحةً لحسابٍ بعينه (substituteAccountId) — بلا
     مطابقة أسماء هشّة.
   • الخصم بسعر البيع (التكلفة الفعلية + الهامش) وعند الإغلاق الفعلي فقط.
   • «المستهلك قبل المنصة» يُدخَل رقماً افتتاحياً واحداً لكل حساب (openingConsumed).
   • الفلاتر تصفّي **ما يُعرَض** لا ما يُحسَب: رصيدُ الحساب (الإجمالي/المستهلك/المتبقي/
     الربح/قيد التنفيذ) يبقى على كل مستنداته مهما ضاق الجدول — وإلا قرأ المستخدمُ
     رصيداً ناقصاً حقيقةً. الاستثناء الوحيد إجماليّاتُ شاشة القائمة: تتبع الصفوفَ
     المعروضة كي تطابق ما تحتها، ويُقال ذلك صراحةً في سطر النطاق.

   مصدرٌ واحدٌ للحقيقة (اتساقاً مع بقية النظام): لا نخزّن «المستهلك» متغيّراً نعدّله
   مع كل طلب — بل الإعداد ثابتٌ في الوثيقة، والمستهلك/الربح يُحسبان لحظياً من الطلبات
   المستعاضة المغلقة عبر poIsClosed / poActualCost. onSnapshot مصدر الحقيقة.

   الصلاحيات (متفق عليها):
   • عرض النشاط (قائمة الطلبات المستعاضة وتكلفتها) لكل المستخدمين.
   • بطاقة المال (الإجمالي/المتبقي/الهامش/سعر البيع/الربح) لـ admin + ceo + finance فقط.
   • إنشاء/تعديل/حذف الحسابات للمسؤول (admin) فقط — مثل إدارة المشاريع.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
  "use strict";

  // ════════ تخزين الحسابات ════════
  // وثيقة واحدة تحمل مصفوفة accounts — على نمط meta/projects تماماً.
  function DOC(){
    var dev = false;
    try{ dev = (typeof IS_DEV!=="undefined" && IS_DEV); }catch(e){}
    return dev ? "meta/substitute_accounts_dev" : "meta/substitute_accounts";
  }

  var _accounts = [];    // كل الحسابات (من onSnapshot)
  var _unsub    = null;  // إلغاء الاشتراك
  var _curId    = null;  // الحساب المفتوح في شاشة التفاصيل (أو null = القائمة)
  var _saving   = false; // حارس ضد النقر المزدوج على الحفظ
  // فلاتر الشاشتين — في الوحدة لا في الـDOM: onSnapshot يعيد رسم الصفحة كاملةً،
  // فحالةٌ محفوظةٌ في حقلٍ معروضٍ تُمحى مع أول تحديثٍ يصل من الخادم.
  var _lf = { q:"", kind:"", state:"" };   // شاشة القائمة (الحسابات)
  var _df = { q:"", state:"" };            // شاشة الحساب (الطلبات + التعاقدات)
  /* حالةُ المزامنة — «لا حسابات» قبل وصول اللقطة **كذبةٌ كاملةُ الشكل**: الشاشةُ
     تقول «لا توجد حسابات بند مستعاض بعد» وتعرض زرَّ إنشاء أوّل حساب، بينما في
     الخادم حساباتٌ بملايين الريالات. فيُفصَل «لم يصل بعد» عن «وصل وكان فارغاً». */
  var _loaded   = false; // وصلت أوّل لقطةٍ للحسابات؟
  var _syncing  = false; // اشتراكٌ مركَّبٌ الآن؟ (حارسٌ من انتظارٍ أبديٍّ بلا مشترِك)
  var _error    = "";    // نصُّ عطلِ التحميل (إن وقع)

  // ════════ أدوات مساعدة داخلية ════════
  function _now(){ return new Date().toISOString(); }
  function _me(){ try{ return (currentUser && currentUser.name) || "النظام"; }catch(e){ return "النظام"; } }
  function _esc(s){ try{ return esc(s); }catch(e){ return String(s==null?"":s); } }
  function _toast(m,t){ try{ toast(m,t); }catch(e){} }
  function _audit(a,d){ try{ if(typeof logAudit==="function") logAudit(a,d); }catch(e){} }
  function _confirm(o){ try{ return showConfirm(o); }catch(e){ return Promise.resolve(window.confirm((o&&o.msg)||"تأكيد؟")); } }
  function _projects(){ try{ return window._projectsList || []; }catch(e){ return []; } }
  function _pos(){ try{ return (typeof purchases!=="undefined" && Array.isArray(purchases)) ? purchases : []; }catch(e){ return []; } }
  function _isClosed(p){ try{ return (typeof poIsClosed==="function") ? poIsClosed(p) : false; }catch(e){ return false; } }
  function _actualCost(p){ try{ return (typeof poActualCost==="function") ? Number(poActualCost(p))||0 : (Number(p&&p.actualCost)||0); }catch(e){ return 0; } }
  function _estTotal(p){ try{ return (typeof getPOTotal==="function") ? Number(getPOTotal(p))||0 : (Number(p&&p.estCost)||0); }catch(e){ return Number(p&&p.estCost)||0; } }
  // الطلب «ميّت» = ملغى/مرفوض/محذوف — لا مغلقٌ (لا يُخصَم) ولا جارٍ (لا يُحسَب WIP).
  // بدونه كان الطلب الملغى يبقى «قيد التنفيذ» أبداً فيضخّم wipSell وعدّ الطلبات.
  // v18.9vu — H10: أُضيف rejected_final (مرفوض نهائي) — كان ناقصاً فيسقط الطلب المرفوض
  // نهائياً في فرع WIP فيبقى «قيد التنفيذ» أبداً ويضخّم wipSell وعدّ الطلبات. مطابق الآن
  // لقائمة «خارج المسار» المركزية في index.html (PO_STAGES).
  var _DEAD_STATUSES = ["cancelled","deleted","rejected","rejected_final","pm_rejected","wh_rejected","ceo_rejected"];
  function _isDead(p){
    try{
      if(!p) return false;
      var st = (typeof normalizePOStatus==="function") ? normalizePOStatus(p.status) : (p.status||"");
      return _DEAD_STATUSES.indexOf(st) >= 0;
    }catch(e){ return false; }
  }

  function _fmt(n){ return (Number(n)||0).toLocaleString("en-US",{maximumFractionDigits:2}); }
  // أيقونة SVG من طقم المنصة (لغة الأيقونات الموحّدة) — بديل الإيموجي. آمنة إن غاب _ic.
  function _icn(name,cls){ try{ return (typeof _ic==="function") ? _ic(name,cls) : ""; }catch(e){ return ""; } }

  function _canManage(){ // إنشاء/تعديل/حذف الحسابات — المسؤول فقط
    try{ return (typeof isAdmin==="function") && isAdmin(); }catch(e){ return false; }
  }
  function _canSeeMoney(){ // بطاقة المال والأرباح — admin + ceo + finance
    try{
      return ((typeof isAdmin==="function") && isAdmin())
          || ((typeof isCEO==="function") && isCEO())
          || ((typeof isFinance==="function") && isFinance());
    }catch(e){ return false; }
  }

  // المصدر الموحّد للمشاريع (رسمية + يدوية مشتقّة من الطلبات و meta) — نفس ما
  // يستعمله فلتر/تقارير المشتريات، فيترابط البند المستعاض مع بنود طلبات الشراء.
  // القيمة (value): الرسمي بمعرّفه، واليدوي بـ "__CUSTOM__:"+الاسم.
  function _projOptions(){
    try{ if(typeof _allProjectOptions==="function"){ var o=_allProjectOptions(); if(Array.isArray(o)) return o; } }catch(e){}
    return _projects().map(function(p){ return { value:p.id, label:p.name }; });
  }
  function _isCustomKey(v){ return typeof v==="string" && v.indexOf("__CUSTOM__:")===0; }

  // اسم الحساب المعروض: للمربوط اسمُ المشروع الحيّ من المصدر الموحّد، وإلا المخزّن.
  function _acctName(acc){
    if(acc && acc.kind==="linked"){
      var hit = _projOptions().find(function(o){ return o.value===acc.projectId; });
      if(hit && hit.label) return hit.label;
      var pj = _projects().find(function(p){ return p.id===acc.projectId; });
      if(pj && pj.name) return pj.name;
      if(_isCustomKey(acc.projectId)) return acc.projectId.slice(11);
    }
    return (acc && acc.name) || "—";
  }

  // ════════ حساب السجل (لحظياً من الطلبات) ════════
  // consumed = openingConsumed + Σ سعر بيع الطلبات المستعاضة المغلقة لهذا الحساب.
  // sellingPrice = التكلفة الفعلية × (1 + الهامش/100).  الربح = سعر البيع − التكلفة.
  //
  // دالة نقية (بلا قراءة globals) لتكون قابلة للاختبار: تأخذ الحساب وقائمة طلباته
  // والدوال المُعينة (مغلق؟ / التكلفة الفعلية / التقديرية). تُستدعى من _stats بالدوال
  // المدعومة بالـ globals، وتُعرَّض كـ _calcStats لفحوص hail-tests.
  // `ctr` (اختياريّ) = مساهمةُ التعاقدات: { spent, wip } بالتكلفة قبل الهامش —
  // تأتي من `contracts.substituteRollupFor`، وتُمرَّر وسيطاً لتبقى الدالّةُ نقيّة.
  function _calcStats(acc, pos, isClosed, actualCost, estTotal, isDead, ctr){
    var margin = Number(acc && acc.margin)||0, f = 1 + margin/100;
    var closedCost=0, closedSell=0, closedProfit=0, wipSell=0, closedCount=0, wipCount=0, deadCount=0;
    (pos||[]).forEach(function(p){
      if(isDead && isDead(p)){ deadCount++; return; }   // ملغى/مرفوض/محذوف — لا مغلق ولا WIP
      if(isClosed(p)){
        var c = Number(actualCost(p))||0, s = c*f;
        closedCost += c; closedSell += s; closedProfit += (s-c); closedCount++;
      } else {
        wipSell += (Number(estTotal(p))||0)*f; wipCount++;
      }
    });
    var opening = Number(acc && acc.openingConsumed)||0;
    var total   = Number(acc && acc.total)||0;
    // التعاقدات: المصروفُ يُخصَم بسعر بيعه كطلب الشراء المغلق، والالتزامُ القائم
    // (طلباتٌ قيد الاعتماد + متبقّي عقودٍ سارية) قيدُ تنفيذٍ يُعرَض ولا يُخصَم.
    var ctrCost   = Number(ctr && ctr.spent)||0;
    var ctrSell   = ctrCost*f;
    var ctrProfit = ctrSell - ctrCost;
    var ctrWip    = (Number(ctr && ctr.wip)||0)*f;
    var ctrCount  = Number(ctr && ctr.count)||0;
    wipSell += ctrWip;
    var spentCost = closedCost + ctrCost;
    var spentSell = closedSell + ctrSell;
    var profit    = closedProfit + ctrProfit;
    var consumed = opening + spentSell;
    return {
      margin:margin, total:total, opening:opening,
      closedCost:closedCost, closedSell:closedSell, closedProfit:closedProfit,
      ctrCost:ctrCost, ctrSell:ctrSell, ctrProfit:ctrProfit, ctrWip:ctrWip, ctrCount:ctrCount,
      spentCost:spentCost, spentSell:spentSell, profit:profit,
      consumed:consumed, remaining: total - consumed,
      wipSell:wipSell, closedCount:closedCount, wipCount:wipCount, deadCount:deadCount,
      count: closedCount + wipCount + ctrCount   // الحيّة فقط (تستبعد الميّتة) + مستندات التعاقد
    };
  }

  /* ── مساهمةُ التعاقدات ──
     المصدرُ الوحيدُ هو `contracts.substituteRollupFor` — لا نسخةَ ثانيةً هنا من
     قواعد «متى يُعدّ العقدُ مصروفاً». وإن غابت الوحدةُ (ملفٌّ خارجيّ قد لا يصل)
     رجعت الأصفارُ فتعمل الشاشةُ كما كانت بلا كسر. */
  function _ctrRollup(accId){
    try{
      if(window.contracts && typeof window.contracts.substituteRollupFor==="function"){
        var r = window.contracts.substituteRollupFor(accId) || {};
        var docs = Array.isArray(r.docs)?r.docs:[];
        return { spent:Number(r.spent)||0, wip:(Number(r.pending)||0)+(Number(r.contracted)||0),
                 count:docs.length, docs:docs };
      }
    }catch(e){}
    return { spent:0, wip:0, count:0, docs:[] };
  }
  /* **حارسُ منع الازدواج**: طلبُ شراءٍ تحت عقدٍ محمولٍ على رصيدِ استعاضةٍ محسوبٌ
     مرةً في مستخلصات ذلك العقد — فعدُّه هنا ثانيةً يُخصم المالَ مرتين لعملٍ واحد.
     القاعدةُ تُقرأ من وحدة التعاقدات ولا تُنسَخ (كما تفعل `project-management`). */
  function _poDoubleCounted(p){
    try{
      if(!p || !p.contractId) return false;
      if(window.contracts && typeof window.contracts.contractSubstituteId==="function")
        return !!window.contracts.contractSubstituteId(p.contractId);
    }catch(e){}
    return false;
  }
  function _posOf(accId){
    return _pos().filter(function(p){
      return p && p.isSubstitute && p.substituteAccountId===accId && !_poDoubleCounted(p);
    });
  }
  function _stats(acc){
    return _calcStats(acc, _posOf(acc.id), _isClosed, _actualCost, _estTotal, _isDead, _ctrRollup(acc.id));
  }

  /* ══════ الفلاتر — دوالُّ نقيّةٌ معروضةٌ لفحوص hail-tests ══════
     كلُّها تأخذ ما تحتاجه وسائطَ ولا تقرأ globals، فتُفحَص بلا متصفّح. */

  // تطبيع عربي للمطابقة (نهج stocktake/finance-audit): إزالة تشكيل، توحيد الألف
  // والتاء المربوطة والياء، وإسقاط المسافات — «مبانى الامانه» ≡ «مباني الأمانة».
  // ويزيد عليه توحيدَ الهمزة المتوسّطة (ئ/ؤ)، إذ اسمُ «حائل» في أكثر أسماء الحسابات
  // ومَن يكتبه «حايل» في البحث كان يخرج بصفر نتائج.
  function _norm(s){
    return String(s==null?"":s)
      .replace(/[\u064B-\u0652\u0670]/g,"")
      .replace(/[\u0623\u0625\u0622]/g,"\u0627").replace(/\u0629/g,"\u0647")
      .replace(/[\u0649\u0626]/g,"\u064A").replace(/\u0624/g,"\u0648")
      .replace(/\s+/g,"").trim().toLowerCase();
  }
  function _hit(hay, q){ return _norm(hay).indexOf(q) >= 0; }

  /* حالةُ الحساب من رصيده: «نفد» يشمل التجاوزَ (سالب) لأن كليهما يمنع الصرف،
     و«أوشك» عتبتُه خُمسُ الرصيد — تنبيهٌ قبل الوقوع لا بعده. */
  var LOW_RATIO = 0.2;
  function _accState(s){
    var total = Number(s && s.total)||0, rem = Number(s && s.remaining)||0;
    if(rem <= 0) return "exhausted";
    if(total > 0 && rem <= total*LOW_RATIO) return "low";
    return "active";
  }
  // الاسمُ يُمرَّر وسيطاً لا يُشتقّ هنا: المربوطُ اسمُه من قائمة المشاريع الحيّة.
  function _matchAccount(acc, name, stats, f){
    f = f || {};
    if(f.kind && ((acc && acc.kind) || "") !== f.kind) return false;
    if(f.state && _accState(stats) !== f.state) return false;
    var q = _norm(f.q); if(!q) return true;
    return _hit(name, q) || _hit((acc && acc.note)||"", q) || _hit((acc && acc.id)||"", q);
  }

  // حالةُ المستند الواحد بلغةٍ واحدةٍ للجدولين: مغلق/مصروف · قيد تنفيذ · بلا أثر.
  function _poState(p, isClosed, isDead){
    if(isDead && isDead(p)) return "dead";
    return isClosed && isClosed(p) ? "closed" : "wip";
  }
  function _ctrState(d){
    var st = d && d.state;
    return st==="spent" ? "closed" : (st==="live" ? "wip" : "dead");
  }
  function _poText(p){
    if(!p) return "";
    var items = Array.isArray(p.items)
      ? p.items.map(function(i){ return (i && (i.itemName || i.name)) || ""; }).join(" ") : "";
    return [p.id, p.itemName, items, p.vendorName, p.notes].join(" ");
  }
  function _matchPO(p, state, f){
    f = f || {};
    if(f.state && state !== f.state) return false;
    var q = _norm(f.q); if(!q) return true;
    return _hit(_poText(p), q);
  }
  function _matchCtrDoc(d, f){
    f = f || {};
    if(f.state && _ctrState(d) !== f.state) return false;
    var q = _norm(f.q); if(!q) return true;
    return _hit([d && d.id, d && d.title, d && d.vendorName, d && d.statusLbl].join(" "), q);
  }
  function _lfActive(){ return !!(_lf.q || _lf.kind || _lf.state); }
  function _dfActive(){ return !!(_df.q || _df.state); }

  // الطلبات المستعاضة التي تشير لحسابٍ غير موجود (حُذف مثلاً) — دلوٌ للتنبيه.
  function _orphanPOs(){
    var ids = {}; _accounts.forEach(function(a){ ids[a.id]=1; });
    return _pos().filter(function(p){ return p && p.isSubstitute && (!p.substituteAccountId || !ids[p.substituteAccountId]); });
  }

  // ════════ الاشتراك الفوري ════════
  function _repaint(){
    var pg = document.getElementById("page-substitute-budget");
    if(pg && pg.classList.contains("active")) render();
  }
  function startSync(){
    if(typeof db==="undefined" || !db){
      // بلا قاعدةِ بيانات: قُل ذلك بدل انتظارٍ أبديٍّ أو «لا حسابات» كاذبة.
      _syncing=false; _error="تعذّر الاتصال بقاعدة البيانات."; _repaint(); return;
    }
    // حمّل الأسماء اليدوية من meta (أفضل جهد) حتى تكتمل قائمة المشاريع للربط والعرض
    try{ if(typeof _loadManualProjectNames==="function") _loadManualProjectNames(); }catch(e){}
    if(_unsub) _unsub();
    _syncing = true; _error = "";
    _unsub = db.doc(DOC()).onSnapshot(function(snap){
      var d = snap.exists ? snap.data() : null;
      _accounts = (d && Array.isArray(d.accounts)) ? d.accounts : [];
      _loaded = true; _error = "";
      window._substituteAccounts = _accounts; // للوصول من نموذج طلب الشراء
      _repaint();
      // تحديث القائمة المنسدلة في نموذج طلب شراء مفتوح (إن وُجد)
      try{ if(typeof window._sbRefreshPOSelect==="function") window._sbRefreshPOSelect(); }catch(e){}
    }, function(e){
      console.warn("substitute-budget sync error:", e);
      // العطلُ يُقال في الشاشة لا في وحدة التحكّم — وإلا بقيت دوّامةٌ إلى الأبد.
      _syncing=false; _error="تعذّر تحميل حسابات البند المستعاض — تحقّق من الاتصال.";
      _repaint();
    });
  }
  // إعادةُ المحاولة بعد عطل — يستدعيها زرُّ الشاشة.
  function retry(){ _error=""; _loaded=false; _syncing=false; startSync(); render(); }

  /* «جاهزة» ليست وصولَ الحسابات وحدَه: كلُّ عمودِ مالٍ في الجدول محسوبٌ من
     `purchases`، فالرسمُ قبل أوّل لقطةٍ لها يُظهر لحسابٍ حقيقيٍّ «٠ مستندات · ٠
     مصروف · المتبقي = كامل الرصيد» — أرقامٌ كاملةُ الشكل كاذبةُ الحقيقة، وهي
     الغلطةُ نفسُها التي حرسها `inventory-reports` بعلَم `_fsLoaded`. */
  function _poSynced(){
    try{ return !!(window._fsLoaded && window._fsLoaded.purchases); }catch(e){ return false; }
  }
  function _ready(){ return _loaded && _poSynced(); }
  // مكوّنُ المزامنة من المنصة (نفسُه في شاشة الرصيد والتقارير) — بديلٌ آمنٌ إن غاب.
  function _syncHTML(){
    try{ if(typeof _syncLoadingHTML==="function") return _syncLoadingHTML(); }catch(e){}
    return '<div style="text-align:center;padding:38px 20px;font-weight:700;color:var(--primary)">جارٍ مزامنة البيانات...</div>';
  }

  // ════════ الحفظ الذرّي ════════
  // القديم set({accounts:_accounts}) كان يكتب اللقطة المحلية كاملةً فوق مستند الخادم،
  // فتعديلُ مسؤولٍ على حسابٍ يدهس تعديلَ مسؤولٍ آخر على حسابٍ مختلف (فقدان تحديث).
  // الآن: معاملة تقرأ مصفوفة الخادم الحيّة، تدمج تغيير الحساب الواحد عليها، ثم تكتب —
  // فلا تُفقَد تعديلات متزامنة على حسابات أخرى. (تقتدي بنمط newId في index.html.)
  function _applyUpsert(list, account){                 // نقيّة — مكشوفة للاختبار
    var out = list.slice(), i = -1;
    for(var k=0;k<out.length;k++){ if(out[k] && out[k].id===account.id){ i=k; break; } }
    if(i>=0) out[i]=account; else out.push(account);
    return out;
  }
  function _applyRemove(list, id){                       // نقيّة — مكشوفة للاختبار
    return list.filter(function(a){ return a && a.id!==id; });
  }
  function _txAccounts(mutate){
    if(typeof db==="undefined" || !db) return Promise.reject(new Error("no db"));
    var ref = db.doc(DOC());
    return db.runTransaction(function(tx){
      return tx.get(ref).then(function(snap){
        var server = (snap.exists && Array.isArray(snap.data().accounts)) ? snap.data().accounts : [];
        var next = mutate(server.map(function(a){ return Object.assign({}, a); }));
        tx.set(ref, { accounts: next }, { merge:true });
        return next;
      });
    });
  }
  function _upsertAccount(account){ return _txAccounts(function(list){ return _applyUpsert(list, account); }); }
  function _removeAccountTx(id){    return _txAccounts(function(list){ return _applyRemove(list, id); }); }

  // ════════ العرض ════════
  function render(){
    var host = document.getElementById("page-substitute-budget");
    if(!host) return;
    // فُتحت الشاشةُ ولا مشترِك؟ رَكِّبه — لا انتظارَ بلا سببٍ ولا فراغَ صامت.
    if(!_loaded && !_syncing && !_error){ startSync(); }
    /* العطلُ يحجب الشاشةَ حين لا شيءَ وصل بعد؛ أمّا عطلٌ **بعد** وصول البيانات
       فلا يمحوها — بياناتٌ قائمةٌ مع شريطِ تحذيرٍ أنفعُ من شاشةِ خطأٍ فارغة. */
    if(!_ready()){ host.innerHTML = _headHtml(false) + _stateCardHtml(); return; }
    if(_curId){
      var acc = _accounts.find(function(a){ return a.id===_curId; });
      if(!acc){ _curId=null; return render(); }
      host.innerHTML = _detailHtml(acc);
    } else {
      host.innerHTML = _listHtml();
    }
  }

  function _moneyNote(){
    return _canSeeMoney() ? "" :
      '<div style="font-size:11px;color:var(--muted);margin-top:4px">🔒 أرقام الرصيد والأرباح تظهر للمسؤول والمدير التنفيذي والمالية فقط.</div>';
  }

  /* شريطُ الفلاتر — عرضٌ واحدٌ للشاشتين. مبنيٌّ بالخيارات وسيطاً فلا يُنسَخ مرّتين،
     و«مسح» لا يظهر إلا وفلترٌ فعّالٌ فعلاً (زرٌّ لا يفعل شيئاً يُربك). */
  function _selHtml(onchange, cur, opts){
    return '<select class="form-select" style="flex:0 1 180px;min-width:140px;font-size:12.5px" onchange="'+onchange+'">' +
      opts.map(function(o){
        return '<option value="'+_esc(o.v)+'"'+(cur===o.v?" selected":"")+'>'+_esc(o.l)+'</option>';
      }).join("") + '</select>';
  }
  function _filterBar(inputId, ph, val, setter, selects, active){
    return '<div class="card" style="margin-bottom:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">' +
      '<input class="form-input" id="'+inputId+'" style="flex:1 1 240px;min-width:180px;font-size:12.5px" ' +
        'placeholder="'+_esc(ph)+'" value="'+_esc(val)+'" oninput="'+setter+'(\'q\',this.value)">' +
      selects +
      (active ? '<button class="btn btn-ghost btn-sm" style="font-size:11.5px" onclick="'+setter+'(\'__clear__\')">'+_icn("xCircle","ic-sm")+' مسح الفلاتر</button>' : '') +
    '</div>';
  }

  /* ترويسةُ الصفحة — مشتركةٌ بين شاشة الحالة والقائمة، فتظهر الشاشةُ **بهويّتها**
     أثناء التحميل لا كصفحةٍ بيضاءَ مجهولة. وزرُّ الإضافة يُخفى حتى تصل الحسابات:
     فحصُ «مشروعٌ له حسابٌ آخر» يقرأ القائمةَ التي لم تصل بعد. */
  function _headHtml(showAdd){
    var addBtn = (showAdd && _canManage())
      ? '<button class="btn btn-primary btn-sm" onclick="window.substituteBudget.openAdd()">➕ إضافة حساب</button>' : "";
    return '' +
      '<div class="card" style="margin-bottom:12px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">' +
          '<div>' +
            '<div style="font-size:17px;font-weight:800">'+(typeof _ic==="function"?_ic("landmark","ic-lg"):"")+' رصيد البند المستعاض</div>' +
            '<div style="font-size:12px;color:var(--muted);margin-top:2px">رصيد كل مشروع للمشتريات والخدمات خارج بنود العقد — يُخصم بسعر البيع ممّا صُرف فعلاً: طلبُ شراءٍ مغلق، أو أمرُ دفعٍ مسدَّد، أو مستخلصُ عقدٍ مسدَّد.</div>' +
            _moneyNote() +
          '</div>' + addBtn +
        '</div>' +
      '</div>';
  }

  /* شاشةُ الحالة: عطلٌ يُقال ويُعاد المحاولةُ منه، أو مزامنةٌ تُرى — وهيكلٌ عظميٌّ
     بشكل الجدول القادم كي يعرف القارئُ **ما الذي يُحمَّل**، لا شريطاً معلّقاً. */
  function _skelRow(){
    return '<div style="display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--border)">' +
      '<div class="skeleton" style="height:14px;border-radius:5px;flex:2 1 180px"></div>' +
      '<div class="skeleton" style="height:14px;border-radius:5px;flex:1 1 70px"></div>' +
      '<div class="skeleton" style="height:14px;border-radius:5px;flex:1 1 70px"></div>' +
      '<div class="skeleton" style="height:14px;border-radius:5px;flex:1 1 70px"></div>' +
    '</div>';
  }
  function _stateCardHtml(){
    if(_error){
      return '<div class="card" style="text-align:center;padding:34px 18px">' +
        '<div style="color:var(--danger);font-weight:800;font-size:13.5px">'+_icn("alertTriangle")+' '+_esc(_error)+'</div>' +
        '<div style="font-size:12px;color:var(--muted);margin-top:6px">لم تُعرَض أيُّ أرصدة — فلا يُقرأ نقصُ الاتصال رصيداً فارغاً.</div>' +
        '<button class="btn btn-ghost btn-sm" style="margin-top:14px" onclick="window.substituteBudget.retry()">'+_icn("rotateCcw")+' إعادة المحاولة</button>' +
      '</div>';
    }
    var what = !_loaded ? "جارٍ تحميل حسابات البند المستعاض…"
                        : "وصلت الحسابات — بانتظار طلبات الشراء لحساب المصروف والمتبقي…";
    return '<div class="card">' + _syncHTML() +
      '<div style="text-align:center;font-size:12px;color:var(--muted);margin:-14px 0 18px">'+_esc(what)+'</div>' +
      _skelRow() + _skelRow() + _skelRow() + _skelRow() +
    '</div>';
  }

  function _listHtml(){
    var money = _canSeeMoney();
    var head = _headHtml(true) + (_error ? '' +
      '<div class="card" style="margin-bottom:12px;border-right:3px solid var(--warn,#b45309);font-size:12.5px">' +
        _icn("alertTriangle","ic-sm")+' '+_esc(_error)+' الأرقامُ المعروضة آخرُ ما وصل — قد لا تكون محدَّثة. ' +
        '<button class="btn btn-ghost btn-sm" style="font-size:11.5px" onclick="window.substituteBudget.retry()">'+_icn("rotateCcw","ic-sm")+' إعادة المزامنة</button>' +
      '</div>' : "");

    if(!_accounts.length){
      return head +
        '<div class="card" style="text-align:center;color:var(--muted);padding:40px">' +
          'لا توجد حسابات بند مستعاض بعد.' +
          (_canManage() ? '<div style="margin-top:12px">اضغط «➕ إضافة حساب» لإنشاء أول حساب.</div>'
                        : '<div style="margin-top:12px">يتولّى المسؤول إنشاء الحسابات.</div>') +
        '</div>';
    }

    /* الصفوفُ تُحسَب مرّةً واحدة ثم تُصفّى — لا حسابَ مكرّرٌ للفلتر وللعرض.
       وفلترُ الحالة (متاح/أوشك/نفد) لأصحاب صلاحية المال وحدهم: من لا يرى المتبقي
       لا يُعطى مِصفاةً عليه (وإلا استُنتج الرقمُ من عدد النتائج). */
    var all  = _accounts.map(function(a){ return { acc:a, s:_stats(a), name:_acctName(a) }; });
    var rowsData = all.filter(function(r){ return _matchAccount(r.acc, r.name, money?r.s:null, money?_lf:{ q:_lf.q, kind:_lf.kind }); });

    var stateOpts = money ? _selHtml("window.substituteBudget.filter('state',this.value)", _lf.state, [
      { v:"", l:"كل حالات الرصيد" },
      { v:"active", l:"رصيدٌ متاح" },
      { v:"low", l:"أوشك على النفاد (≤ 20%)" },
      { v:"exhausted", l:"نفد أو تجاوز" }
    ]) : "";
    var filters = _filterBar("sb-f-q", "🔍 ابحث باسم الحساب أو ملاحظته", _lf.q, "window.substituteBudget.filter",
      _selHtml("window.substituteBudget.filter('kind',this.value)", _lf.kind, [
        { v:"", l:"كل الأنواع" },
        { v:"linked", l:"مربوط بمشروع" },
        { v:"standalone", l:"مستقلّ" }
      ]) + stateOpts, _lfActive());

    /* سطرُ النطاق: قائمةٌ أقصرُ بلا تفسيرٍ تُقرأ نقصاً في البيانات لا تصفيةً —
       ويقول صراحةً إن الإجماليّات تتبع المعروض، وإلا نُسبت للنظام كلّه. */
    var scopeLine = _lfActive() ? '' +
      '<div style="font-size:12px;color:var(--muted);margin:-4px 0 12px;padding:0 4px">' +
        'عرض '+rowsData.length+' من '+all.length+' حساباً' +
        (money ? ' — الإجماليّات أدناه للمعروض فقط.' : '.') +
      '</div>' : '';

    // إجماليات (لأصحاب صلاحية المال فقط) — على الصفوف المعروضة
    var totBudget=0, totConsumed=0, totRemaining=0, totProfit=0;
    rowsData.forEach(function(r){ var s=r.s; totBudget+=s.total; totConsumed+=s.consumed; totRemaining+=s.remaining; totProfit+=s.profit; });

    var summary = money ? '' +
      '<div class="card" style="margin-bottom:12px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;text-align:center">' +
        _kpi("إجمالي الأرصدة", _fmt(totBudget), "var(--primary)") +
        _kpi("إجمالي المستهلك", _fmt(totConsumed), "var(--accent)") +
        _kpi("إجمالي المتبقي", _fmt(totRemaining), totRemaining<0?"var(--danger)":"var(--success)") +
        _kpi("إجمالي الربح المحقّق", _fmt(totProfit), "var(--success)") +
      '</div>' : '';

    // أعمدة الجدول
    var moneyHeads = money
      ? '<th style="padding:8px;text-align:center">الإجمالي</th>' +
        '<th style="padding:8px;text-align:center">مستهلك سابقاً</th>' +
        '<th style="padding:8px;text-align:center">مصروف على المنصة</th>' +
        '<th style="padding:8px;text-align:center">المتبقي</th>' +
        '<th style="padding:8px;text-align:center">الربح المحقّق</th>' +
        '<th style="padding:8px;text-align:center">الهامش</th>'
      : '';

    var rows = rowsData.map(function(r){
      var acc = r.acc, s = r.s;
      var kindBadge = acc.kind==="linked"
        ? '<span style="font-size:10px;background:color-mix(in srgb,var(--primary) 12%,transparent);color:var(--primary);padding:2px 7px;border-radius:20px;font-weight:700">'+_icn("link","ic-sm")+' مربوط بمشروع</span>'
        : '<span style="font-size:10px;background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);padding:2px 7px;border-radius:20px;font-weight:700">'+_icn("edit","ic-sm")+' مستقلّ</span>';
      var moneyCells = money
        ? '<td style="padding:8px;text-align:center">'+_fmt(s.total)+'</td>' +
          '<td style="padding:8px;text-align:center;color:var(--muted)">'+_fmt(s.opening)+'</td>' +
          '<td style="padding:8px;text-align:center">'+_fmt(s.spentSell)+'</td>' +
          '<td style="padding:8px;text-align:center;font-weight:800;color:'+(s.remaining<0?"var(--danger)":"var(--success)")+'">'+_fmt(s.remaining)+'</td>' +
          '<td style="padding:8px;text-align:center;color:var(--success);font-weight:700">'+_fmt(s.profit)+'</td>' +
          '<td style="padding:8px;text-align:center">'+_fmt(s.margin)+'%</td>'
        : '';
      return '<tr style="cursor:pointer;border-top:1px solid var(--border)" onclick="window.substituteBudget.open(\''+acc.id+'\')">' +
        '<td style="padding:8px;font-weight:700">'+_esc(r.name)+'<div style="margin-top:3px">'+kindBadge+'</div></td>' +
        '<td style="padding:8px;text-align:center">'+s.count+'</td>' +
        moneyCells +
      '</tr>';
    }).join("") ||
      '<tr><td colspan="'+(money?8:2)+'" style="padding:22px;text-align:center;color:var(--muted)">لا حسابات تطابق الفلاتر الحالية.</td></tr>';

    var orphans = _orphanPOs();
    var orphanCard = orphans.length ? '' +
      '<div class="card" style="margin-top:12px;border-right:3px solid var(--danger)">' +
        '<div style="font-weight:800;color:var(--danger);margin-bottom:4px">⚠ طلبات مستعاضة بلا حساب صالح ('+orphans.length+')</div>' +
        '<div style="font-size:12px;color:var(--muted)">طلبات مُعلَّمة «مستعاض» لكنها لا تشير لحسابٍ موجود — لن تُخصم من أي رصيد. راجعها من صفحة الطلبات.</div>' +
      '</div>' : '';

    return head + filters + summary + scopeLine +
      '<div class="card" style="overflow-x:auto">' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
          '<thead><tr style="background:var(--surface2)">' +
            '<th style="padding:8px;text-align:right">الحساب</th>' +
            '<th style="padding:8px;text-align:center">مستندات مستعاضة</th>' +
            moneyHeads +
          '</tr></thead>' +
          '<tbody>'+rows+'</tbody>' +
        '</table>' +
      '</div>' + orphanCard;
  }

  function _kpi(label,val,color){
    return '<div><div style="font-size:20px;font-weight:800;color:'+color+'">'+val+'</div>' +
           '<div style="font-size:11px;color:var(--muted);margin-top:2px">'+label+'</div></div>';
  }

  function _detailHtml(acc){
    var money = _canSeeMoney();
    var ctr = _ctrRollup(acc.id);
    var s = _calcStats(acc, _posOf(acc.id), _isClosed, _actualCost, _estTotal, _isDead, ctr);
    var allPos = _posOf(acc.id)
                    .sort(function(a,b){ return String(b.createdAt||"").localeCompare(String(a.createdAt||"")); });
    /* الفلترُ على العرض وحدَه: `s` أعلاه محسوبٌ من كلّ المستندات، فلا يتحرّك الرصيد
       حين تضيق القائمة — رصيدٌ يتغيّر مع مِصفاةِ عرضٍ رقمٌ كاذب. */
    var pos = allPos.filter(function(p){ return _matchPO(p, _poState(p, _isClosed, _isDead), _df); });
    var allDocs = ctr.docs || [];
    var ctrDocs = allDocs.filter(function(d){ return _matchCtrDoc(d, _df); });
    var dFilters = (allPos.length || allDocs.length) ? _filterBar(
      "sb-d-q", "🔍 ابحث برقم المستند أو البند أو الطرف", _df.q, "window.substituteBudget.filterDoc",
      _selHtml("window.substituteBudget.filterDoc('state',this.value)", _df.state, [
        { v:"", l:"كل الحالات" },
        { v:"closed", l:"مغلق / مصروف" },
        { v:"wip", l:"قيد التنفيذ" },
        { v:"dead", l:"ملغى / مرفوض / بلا أثر" }
      ]), _dfActive()) : "";
    var dScope = _dfActive() ? '' +
      '<div style="font-size:12px;color:var(--muted);margin:-4px 0 12px;padding:0 4px">' +
        'عرض '+(pos.length+ctrDocs.length)+' من '+(allPos.length+allDocs.length)+
        ' مستنداً — أرقامُ الرصيد أعلاه على كامل الحساب بلا تصفية.' +
      '</div>' : '';

    var manageBtns = _canManage()
      ? '<button class="btn btn-ghost btn-sm" onclick="window.substituteBudget.openEdit(\''+acc.id+'\')">'+_icn("edit")+' تعديل</button> ' +
        '<button class="btn btn-danger btn-sm" onclick="window.substituteBudget.remove(\''+acc.id+'\')">🗑 حذف</button>'
      : '';

    var moneyBox = money ? '' +
      '<div class="card" style="margin-bottom:12px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;text-align:center">' +
        _kpi("إجمالي الرصيد", _fmt(s.total), "var(--primary)") +
        _kpi("مستهلك قبل المنصة", _fmt(s.opening), "var(--muted)") +
        _kpi("مصروف على المنصة", _fmt(s.spentSell), "var(--accent)") +
        _kpi("المتبقي", _fmt(s.remaining), s.remaining<0?"var(--danger)":"var(--success)") +
        _kpi("الربح المحقّق", _fmt(s.profit), "var(--success)") +
        _kpi("قيد التنفيذ (لم يُخصم بعد)", _fmt(s.wipSell), "var(--stage-wait)") +
      '</div>' : '';

    /* من أين جاء «المصروف»؟ رقمٌ واحدٌ يجمع شراءً وتعاقداً يُقرأ لغزاً حين لا يطابق
       ما يذكره صاحبُه. فالسطرُ يفصل المصدرين بلا فتح شاشةٍ أخرى. */
    var splitBox = (money && (s.ctrSell>0 || s.ctrWip>0)) ? '' +
      '<div class="card" style="margin-bottom:12px;font-size:12.5px;display:flex;flex-wrap:wrap;gap:6px 22px">' +
        '<span>'+_icn("cart","ic-sm")+' طلبات شراء: <b>'+_fmt(s.closedSell)+'</b> ر.س</span>' +
        '<span>'+_icn("fileText","ic-sm")+' أعمال تعاقدية: <b>'+_fmt(s.ctrSell)+'</b> ر.س</span>' +
        (s.ctrWip>0?'<span style="color:var(--muted)">منها قيد التنفيذ تعاقدياً: '+_fmt(s.ctrWip)+' ر.س</span>':'') +
      '</div>' : '';

    /* جدولُ الأعمال التعاقدية — عمودُ المال فيه **ما خرج فعلاً** لا القيمة: العقدُ
       الساري التزامٌ لم يُدفَع، وخلطُهما يُظهر خصماً لم يقع. */
    var ctrRows = ctrDocs.map(function(d){
      var isReq = d.kind==="req";
      var lbl = isReq ? (d.engagement==="pay_order" ? "أمر دفع" : "طلب تعاقد") : "عقد";
      var sell = (Number(d.spent)||0)*(1+s.margin/100);
      var stateCell = d.state==="spent"
        ? '<span style="color:var(--success);font-weight:700">مصروف ✓</span>'
        : (d.state==="live" ? '<span style="color:var(--muted)">قيد التنفيذ</span>'
                            : '<span style="color:var(--danger,#dc2626)">بلا أثر</span>');
      var moneyCells = money
        ? '<td style="padding:8px;text-align:center">'+_fmt(d.value)+'</td>' +
          '<td style="padding:8px;text-align:center">'+_fmt(d.spent)+'</td>' +
          '<td style="padding:8px;text-align:center">'+(d.spent>0?_fmt(sell):"—")+'</td>' : '';
      var open = isReq ? "openReqFrom" : "openCtrFrom";
      return '<tr style="border-top:1px solid var(--border);cursor:pointer" onclick="try{window.contracts.'+open+'(\''+d.id+'\')}catch(e){}">' +
        '<td style="padding:8px;font-weight:600">'+_esc(d.id)+'</td>' +
        '<td style="padding:8px">'+_esc(lbl)+' — '+_esc(d.title||d.vendorName||"—")+'</td>' +
        '<td style="padding:8px;text-align:center">'+stateCell+
          '<div style="font-size:10.5px;color:var(--muted);margin-top:2px">'+_esc(d.statusLbl||"")+'</div></td>' +
        moneyCells +
      '</tr>';
    }).join("");
    var ctrRowsOrEmpty = ctrRows ||
      '<tr><td colspan="'+(money?6:3)+'" style="padding:18px;text-align:center;color:var(--muted)">لا أعمال تعاقدية تطابق الفلاتر.</td></tr>';
    var ctrTable = allDocs.length ? '' +
      '<div class="card" style="overflow-x:auto;margin-top:12px">' +
        '<div style="font-weight:800;margin-bottom:8px">'+_icn("fileText","ic-sm")+' الأعمال التعاقدية ('+
          (_dfActive() ? ctrDocs.length+' من '+allDocs.length : allDocs.length)+')</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
          '<thead><tr style="background:var(--surface2)">' +
            '<th style="padding:8px;text-align:right">المستند</th>' +
            '<th style="padding:8px;text-align:right">النوع والعنوان</th>' +
            '<th style="padding:8px;text-align:center">الحالة</th>' +
            (money?'<th style="padding:8px;text-align:center">القيمة</th>' +
                   '<th style="padding:8px;text-align:center">المصروف فعلاً</th>' +
                   '<th style="padding:8px;text-align:center">سعر البيع</th>':'') +
          '</tr></thead><tbody>'+ctrRowsOrEmpty+'</tbody>' +
        '</table>' +
      '</div>' : '';

    var moneyPOHeads = money
      ? '<th style="padding:8px;text-align:center">التكلفة</th>' +
        '<th style="padding:8px;text-align:center">سعر البيع</th>' +
        '<th style="padding:8px;text-align:center">الربح</th>' : '';

    var poRows = pos.length ? pos.map(function(p){
      var dead = _isDead(p);
      var closed = !dead && _isClosed(p);
      var cost = closed ? _actualCost(p) : _estTotal(p);
      var sell = cost*(1+s.margin/100);
      var items = p.itemName || (Array.isArray(p.items)&&p.items.length?(p.items.length+" بند"):"—");
      // الطلب الميّت لا يُظهر سعر بيع/ربح (لا يدخل أي رصيد) — شرطة بدل رقمٍ وهمي
      var moneyCells = money
        ? (dead
            ? '<td style="padding:8px;text-align:center;color:var(--muted)">—</td>' +
              '<td style="padding:8px;text-align:center;color:var(--muted)">—</td>' +
              '<td style="padding:8px;text-align:center;color:var(--muted)">—</td>'
            : '<td style="padding:8px;text-align:center">'+_fmt(cost)+'</td>' +
              '<td style="padding:8px;text-align:center">'+_fmt(sell)+'</td>' +
              '<td style="padding:8px;text-align:center;color:var(--success)">'+_fmt(sell-cost)+'</td>') : '';
      var statusCell = dead
        ? '<span style="color:var(--danger,#dc2626)">ملغى/مرفوض</span>'
        : (closed?'<span style="color:var(--success);font-weight:700">مغلق ✓</span>':'<span style="color:var(--muted)">قيد التنفيذ</span>');
      return '<tr style="border-top:1px solid var(--border);cursor:pointer" onclick="try{openPurchaseDetail(\''+p.id+'\')}catch(e){}">' +
        '<td style="padding:8px;font-weight:600">'+_esc(p.id)+'</td>' +
        '<td style="padding:8px">'+_esc(items)+'</td>' +
        '<td style="padding:8px;text-align:center">'+statusCell+'</td>' +
        moneyCells +
      '</tr>';
    }).join("")
    : '<tr><td colspan="'+(money?6:3)+'" style="padding:20px;text-align:center;color:var(--muted)">' +
        (allPos.length ? 'لا طلبات تطابق الفلاتر الحالية.' : 'لا توجد طلبات مستعاضة على هذا الحساب بعد.') +
      '</td></tr>';

    return '' +
      '<div class="card" style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">' +
        '<div>' +
          '<button class="btn btn-ghost btn-sm" onclick="window.substituteBudget.back()">← رجوع</button> ' +
          '<span style="font-size:17px;font-weight:800;margin-inline-start:8px">'+_esc(_acctName(acc))+'</span>' +
          '<div style="font-size:12px;color:var(--muted);margin-top:4px">'+
            (acc.kind==="linked"?_icn("link","ic-sm")+' مربوط بمشروع (رسمي أو يدوي)':_icn("edit","ic-sm")+' حساب مستقلّ')+
            (acc.note?' — '+_esc(acc.note):'')+'</div>' +
          _moneyNote() +
        '</div>' +
        '<div>'+manageBtns+'</div>' +
      '</div>' +
      moneyBox + splitBox + dFilters + dScope +
      '<div class="card" style="overflow-x:auto">' +
        '<div style="font-weight:800;margin-bottom:8px">📋 طلبات الشراء المستعاضة ('+
          (_dfActive() ? pos.length+' من '+allPos.length : allPos.length)+')</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
          '<thead><tr style="background:var(--surface2)">' +
            '<th style="padding:8px;text-align:right">رقم الطلب</th>' +
            '<th style="padding:8px;text-align:right">البنود</th>' +
            '<th style="padding:8px;text-align:center">الحالة</th>' +
            moneyPOHeads +
          '</tr></thead><tbody>'+poRows+'</tbody>' +
        '</table>' +
      '</div>' + ctrTable;
  }

  // ════════ نموذج الإضافة/التعديل ════════
  // خيارات قائمة الربط (رسمية + يدوية من المصدر الموحّد) — يُستثنى المرتبط بحسابٍ آخر.
  // مُستخرَجة لتُعاد بناؤها في الخلفية عند وصول الأسماء اليدوية بلا حجب فتح النافذة.
  function _projSelectOptionsHtml(acc){
    var usedProj = {};
    _accounts.forEach(function(a){ if(a.kind==="linked" && (!acc||a.id!==acc.id)) usedProj[a.projectId]=1; });
    var opts = _projOptions().map(function(o){
      var dis = usedProj[o.value] ? ' disabled' : '';
      var sel = (acc && acc.projectId===o.value) ? ' selected' : '';
      var custom = _isCustomKey(o.value);
      return '<option value="'+_esc(o.value)+'"'+dis+sel+'>'+_esc(o.label)+(custom?' (يدوي)':'')+(dis?' (له حساب)':'')+'</option>';
    }).join("");
    return opts || '<option value="">لا مشاريع</option>';
  }

  // إعادة بناء قائمة الربط داخل نافذةٍ مفتوحة (بعد وصول الأسماء اليدوية) مع حفظ الاختيار.
  function _refreshFormProjectSelect(acc){
    var sel = document.getElementById("sb-project");
    if(!sel) return; // النافذة أُغلقت
    var cur = sel.value;
    sel.innerHTML = _projSelectOptionsHtml(acc);
    if(cur){ sel.value = cur; }
  }

  function _formHtml(acc){
    var isEdit = !!acc;
    var kind = (acc && acc.kind) || "linked";
    var projOpts = _projSelectOptionsHtml(acc);

    return '' +
      '<div class="form-group">' +
        '<label class="form-label">نوع الحساب</label>' +
        '<div style="display:flex;gap:16px;flex-wrap:wrap">' +
          '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px"><input type="radio" name="sb-kind" value="linked"'+(kind==="linked"?" checked":"")+' onchange="window.substituteBudget._kindToggle()"> '+_icn("link")+' مربوط بمشروع (رسمي أو يدوي)</label>' +
          '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px"><input type="radio" name="sb-kind" value="standalone"'+(kind==="standalone"?" checked":"")+' onchange="window.substituteBudget._kindToggle()"> '+_icn("edit")+' مستقلّ (اسمٌ جديد غير موجود)</label>' +
        '</div>' +
      '</div>' +
      '<div class="form-group" id="sb-linked-wrap" style="'+(kind==="linked"?"":"display:none")+'">' +
        '<label class="form-label">المشروع *</label>' +
        '<select class="form-select" id="sb-project">'+projOpts+'</select>' +
      '</div>' +
      '<div class="form-group" id="sb-name-wrap" style="'+(kind==="standalone"?"":"display:none")+'">' +
        '<label class="form-label">اسم الحساب/المشروع *</label>' +
        '<input class="form-input" id="sb-name" placeholder="مثال: مشروع جدة (سابق)" value="'+_esc((acc&&acc.kind==="standalone"&&acc.name)||"")+'">' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<div class="form-group"><label class="form-label">إجمالي الرصيد (ريال) *</label>' +
          '<input class="form-input" type="number" min="0" step="0.01" id="sb-total" placeholder="500000" value="'+((acc&&acc.total!=null)?acc.total:"")+'"></div>' +
        '<div class="form-group"><label class="form-label">المستهلك قبل المنصة (ريال)</label>' +
          '<input class="form-input" type="number" min="0" step="0.01" id="sb-opening" placeholder="0" value="'+((acc&&acc.openingConsumed!=null)?acc.openingConsumed:"")+'"></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<div class="form-group"><label class="form-label">نسبة هامش الربح (%) *</label>' +
          '<input class="form-input" type="number" min="0" step="0.01" id="sb-margin" placeholder="25" value="'+((acc&&acc.margin!=null)?acc.margin:"")+'"></div>' +
        '<div class="form-group"><label class="form-label">ملاحظة (اختياري)</label>' +
          '<input class="form-input" id="sb-note" value="'+_esc((acc&&acc.note)||"")+'"></div>' +
      '</div>';
  }

  function openAdd(){
    if(!_canManage()){ _toast("⚠ صلاحية المسؤول فقط","warn"); return; }
    _openForm(null);
  }
  function openEdit(id){
    if(!_canManage()){ _toast("⚠ صلاحية المسؤول فقط","warn"); return; }
    var acc = _accounts.find(function(a){ return a.id===id; });
    if(!acc){ _toast("⚠ الحساب غير موجود","warn"); return; }
    _openForm(acc);
  }

  function _openForm(acc){
    // اعرض النافذة فوراً ببيانات المتاح — لا تنتظر الشبكة (كان await يؤخّر ظهورها).
    try{
      showCustomModal({
        title: acc ? (_icn("edit")+" تعديل حساب: "+_acctName(acc)) : "➕ إضافة حساب بند مستعاض",
        body: _formHtml(acc),
        okText: acc ? "💾 حفظ التعديل" : "✅ إضافة",
        onOk: function(){ return _submitForm(acc); }
      });
    }catch(e){
      _toast("⚠ تعذّر فتح النموذج","warn");
      return;
    }
    // حمّل الأسماء اليدوية من meta في الخلفية، ثم حدّث قائمة الربط إن كانت النافذة
    // ما زالت مفتوحة — فتظهر المشاريع اليدوية بلا حجب فتح النافذة.
    try{
      if(typeof _loadManualProjectNames==="function"){
        Promise.resolve(_loadManualProjectNames())
          .then(function(){ _refreshFormProjectSelect(acc); })
          .catch(function(){});
      }
    }catch(e){}
  }

  function _kindToggle(){
    var kind = (document.querySelector('input[name="sb-kind"]:checked')||{}).value || "linked";
    var lw=document.getElementById("sb-linked-wrap"), nw=document.getElementById("sb-name-wrap");
    if(lw) lw.style.display = kind==="linked" ? "" : "none";
    if(nw) nw.style.display = kind==="standalone" ? "" : "none";
  }

  // يُرجع true للنجاح (يُغلق المودال) و false للبقاء مفتوحاً عند خطأ التحقق/الحفظ.
  async function _submitForm(acc){
    if(_saving) return false;
    var kind = (document.querySelector('input[name="sb-kind"]:checked')||{}).value || "linked";
    var total  = parseFloat((document.getElementById("sb-total")||{}).value);
    var opening= parseFloat((document.getElementById("sb-opening")||{}).value)||0;
    var margin = parseFloat((document.getElementById("sb-margin")||{}).value);
    var note   = ((document.getElementById("sb-note")||{}).value||"").trim();

    if(!(total>=0) || isNaN(total)){ _toast("⚠ أدخل إجمالي رصيدٍ صحيحاً","warn"); return false; }
    if(!(margin>=0) || isNaN(margin)){ _toast("⚠ أدخل نسبة هامشٍ صحيحة","warn"); return false; }
    if(!(opening>=0)) opening=0;

    var projectId="", name="";
    if(kind==="linked"){
      projectId = ((document.getElementById("sb-project")||{}).value||"").trim();
      if(!projectId){ _toast("⚠ اختر المشروع","warn"); return false; }
      // منع ربط مشروعين بنفس الحساب
      var dup = _accounts.find(function(a){ return a.kind==="linked" && a.projectId===projectId && (!acc||a.id!==acc.id); });
      if(dup){ _toast("⚠ هذا المشروع مربوطٌ بحسابٍ آخر","warn"); return false; }
      var hit = _projOptions().find(function(o){ return o.value===projectId; });
      name = (hit && hit.label) || (_isCustomKey(projectId) ? projectId.slice(11) : projectId);
    } else {
      name = ((document.getElementById("sb-name")||{}).value||"").trim();
      if(!name){ _toast("⚠ أدخل اسم الحساب","warn"); return false; }
    }

    _saving = true;
    var backup = _accounts.map(function(a){ return Object.assign({}, a); });
    var saved;
    if(acc){
      acc.kind=kind; acc.projectId=(kind==="linked"?projectId:""); acc.name=name;
      acc.total=total; acc.openingConsumed=opening; acc.margin=margin; acc.note=note;
      acc.updatedAt=_now();
      saved = acc;                                       // تحديثٌ محلّي متفائل — تُوحَّده onSnapshot
    } else {
      var id = "sb_" + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
      saved = {
        id:id, kind:kind, projectId:(kind==="linked"?projectId:""), name:name,
        total:total, openingConsumed:opening, margin:margin, note:note,
        createdAt:_now(), createdBy:_me(), updatedAt:_now()
      };
      _accounts.push(saved);
    }
    try{
      await _upsertAccount(saved);                        // معاملة تدمج هذا الحساب وحده
      _saving=false;
      _toast(acc?"✅ تم حفظ التعديل":"✅ تم إضافة الحساب","success");
      _audit(acc?"تعديل حساب بند مستعاض":"إضافة حساب بند مستعاض", name+" — إجمالي:"+_fmt(total)+" هامش:"+margin+"%");
      render();
      return true; // نجح — يُغلق المودال
    }catch(e){
      _saving=false; _accounts=backup; window._substituteAccounts=_accounts;
      _toast("⚠ خطأ في الحفظ — تحقق من الاتصال","warn"); render();
      return false; // يبقى المودال مفتوحاً لإعادة المحاولة
    }
  }

  function remove(id){
    if(!_canManage()){ _toast("⚠ صلاحية المسؤول فقط","warn"); return; }
    var acc = _accounts.find(function(a){ return a.id===id; });
    if(!acc){ return; }
    var linked = _pos().filter(function(p){ return p && p.isSubstitute && p.substituteAccountId===id; }).length
                 + (_ctrRollup(id).docs||[]).length;
    var warn = linked ? ("\n\n⚠ يشير إليه "+linked+" مستند مستعاض (طلبات شراء · تعاقدات) — ستبقى المستندات لكنها ستصبح «بلا حساب» ولن تُخصم من أي رصيد.") : "";
    Promise.resolve(_confirm({
      title:"حذف حساب البند المستعاض؟",
      msg:"سيُحذف حساب «"+_acctName(acc)+"»."+warn,
      icon:"🗑", okText:"حذف", okClass:"btn-danger"
    })).then(function(ok){
      if(!ok) return;
      var backup=_accounts.slice();
      _accounts = _accounts.filter(function(a){ return a.id!==id; });
      _removeAccountTx(id).then(function(){               // معاملة تحذف هذا الحساب وحده من حالة الخادم
        _toast("✅ تم حذف الحساب","success");
        _audit("حذف حساب بند مستعاض", _acctName(acc));
        if(_curId===id) _curId=null;
        render();
      }).catch(function(){
        _accounts=backup; window._substituteAccounts=_accounts;
        _toast("⚠ خطأ في الحذف","warn"); render();
      });
    });
  }

  function open(id){ _curId=id; _df={ q:"", state:"" }; render(); }   // فلترُ حسابٍ لا يتبع غيرَه
  function back(){ _curId=null; render(); }

  /* ════════ أفعالُ الفلاتر ════════
     `render()` يعيد بناء innerHTML كاملاً، فيضيع تركيزُ حقل البحث بعد كل حرف —
     تُعاد المؤشّرةُ إلى آخر النصّ كما في وحدة التعاقدات. */
  function _refocus(id){
    var i = document.getElementById(id);
    if(i){ i.focus(); try{ i.setSelectionRange(i.value.length, i.value.length); }catch(e){} }
  }
  function filter(k,v){
    if(k==="__clear__"){ _lf={ q:"", kind:"", state:"" }; render(); return; }
    if(!(k in _lf)) return;
    _lf[k] = v || ""; render();
    if(k==="q") _refocus("sb-f-q");
  }
  function filterDoc(k,v){
    if(k==="__clear__"){ _df={ q:"", state:"" }; render(); return; }
    if(!(k in _df)) return;
    _df[k] = v || ""; render();
    if(k==="q") _refocus("sb-d-q");
  }

  // ════════ واجهة للنموذج (نموذج طلب الشراء) ════════
  // قائمة <option> لكل الحسابات — يستدعيها نموذج طلب الشراء لبناء القائمة المنسدلة.
  function optionsHtml(selectedId){
    var opts = '<option value="">— اختر الحساب —</option>';
    opts += _accounts.map(function(a){
      var sel = (a.id===selectedId) ? ' selected' : '';
      return '<option value="'+_esc(a.id)+'"'+sel+'>'+_esc(_acctName(a))+(a.kind==="linked"?'':' (مستقلّ)')+'</option>';
    }).join("");
    return opts;
  }
  function accounts(){ return _accounts.slice(); }
  // يجد الحساب المربوط بمشروعٍ ما (لترشيح تلقائي في النموذج).
  function accountForProject(projectId){
    var a = _accounts.find(function(x){ return x.kind==="linked" && x.projectId===projectId; });
    return a ? a.id : "";
  }

  // ════════ التصدير ════════
  window.substituteBudget = {
    startSync: startSync,
    render: render,
    open: open, back: back,
    filter: filter, filterDoc: filterDoc, retry: retry,
    openAdd: openAdd, openEdit: openEdit, remove: remove,
    _kindToggle: _kindToggle,
    optionsHtml: optionsHtml, accounts: accounts, accountForProject: accountForProject,
    _calcStats: _calcStats,  // دالة الحساب النقية — لفحوص hail-tests
    _applyUpsert: _applyUpsert, _applyRemove: _applyRemove,  // مبدّلات الدمج النقية — للاختبار
    _isDead: _isDead,        // كاشف الطلب الميّت — للاختبار
    // مِصفاةُ العرض — دوالُّ نقيّةٌ لفحوص hail-tests (تصفية بلا متصفّح)
    _norm: _norm, _accState: _accState, _matchAccount: _matchAccount,
    _poState: _poState, _ctrState: _ctrState, _matchPO: _matchPO, _matchCtrDoc: _matchCtrDoc
  };
})();
