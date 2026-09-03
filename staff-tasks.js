/* ═══════════════════════════════════════════════════════════════════════════
   نظام هيل — مهامُّ الموظفين وملاحظاتُهم  (staff-tasks.js)

   ── المشكلة التي تعالجها ──
   التكليفُ بين المدير وموظفيه، وبين الموظفين بعضِهم، كان يجري على الواتساب: يضيع
   في مجرى الرسائل، ولا أحدَ يعرف ما بقي مفتوحاً، ولا مرجعَ عند الخلاف على «كلّفتُك
   ولم تُنجز». وهذه الوحدةُ تنقل ذلك إلى النظام الذي يفتحه الموظفون أصلاً طوال
   اليوم — فالتذكيرُ الذي يُرى بلا قصدٍ هو وحدَه الذي يُقرأ.

   ── المبدأُ الحاكم: كلُّ مهمّةٍ غرفةٌ مغلقة ──
   لا «قائمةٌ عامة» ولا لوحةُ فريق. المهمّةُ يراها **مُنشئها والمكلَّفُ بها ومَن
   أضافه المُنشئ** فقط، ويحملهم المستندُ في مصفوفة `participants` (بأسماء الدخول
   لا بالأسماء المعروضة: المعروضُ يتكرّر ويتغيّر، واسمُ الدخول مفتاحٌ ثابت).
   والاستعلامُ نفسُه مقصورٌ على المشاركة:
       .where("participants", "array-contains", <اسم دخولي>)
   فلا يُنزَّل إلى المتصفّح مستندٌ لست طرفاً فيه أصلاً.

   ── ⚠ حدُّ الخصوصية اليوم — مُعلَنٌ لا مطويّ ──
   قواعدُ Firestore في هذا المستودع تمنح **القراءةَ لكلّ ذي دور** على كلّ مجموعة
   (`match /{document=**} { allow read: if hasRole(); }`)، وإخراجُ مجموعةٍ من تلك
   القاعدة يمرّ بشرطِ مسارٍ في سطر القراءة العامة — وذاك **أسقط استعلامَ كلّ مجموعةٍ
   في النظام** في انقطاع إنتاجٍ حقيقيّ (v18.9.2635)، وعليه اليومَ حارسٌ صريح في
   `hail-tests`. وقواعدُ Firestore تُقيَّم بـ«أو»: بلوكٌ صارمٌ للمجموعة **لا يطرح**
   ما منحته العامة. فالنتيجةُ الصادقة:
     • **الكتابةُ مقفولةٌ فعلاً على مستوى قاعدة البيانات** (البلوكُ أدناه في
       `firestore.rules` — يُثبته `npm run rules:check` على محاكٍ حقيقيّ): لا يعدّل
       المهمّةَ إلا مشاركٌ فيها، ولا يضيف مشاركاً إلا مُنشئُها.
     • **والقراءةُ محروسةٌ في الواجهة والاستعلام لا في القاعدة**: موظفٌ يفتح وحدةَ
       تحكّم المتصفّح ويكتب استعلاماً يدوياً يستطيع قراءةَ مهامّ غيره اليوم.
   وسدُّ ذلك = تضييقُ القراءة العامة، وهو بندٌ مؤجَّلٌ على مستوى المنصّة كلِّها
   (المرحلة ٣ في `docs/deep-review-2026-08.md`) يمسّ كلَّ المجموعات لا هذه وحدَها.
   والبلوكُ الصارمُ للقراءة مكتوبٌ في `firestore.rules` جاهزاً ليعمل يومَ تُضيَّق
   العامة، ويحرسه فحصٌ يرصد اللحظةَ التي ينقلب فيها الحالُ.

   ── الإشعاراتُ مؤجَّلةٌ بقرار المالك ──
   لا إرسالَ في هذه النسخة. والحقولُ التي تحتاجها قائمةٌ من الآن (`createdAt` ·
   `due` · `createdByUser` · `batchId` · `notifiedAt`) حتى لا تُعاد هيكلةُ البيانات
   حين تُفعَّل: تجميعةُ إرسالٍ واحدة (`batchId`) تُنتج إشعاراً واحداً «كلّفك فلانٌ
   بـ٥ مهامّ» بدل خمسةِ تنبيهاتٍ متتالية تدفع الموظف لإغلاق الإشعارات.

   ── قيدٌ مقصود: لا دردشةَ عامة ──
   الكلامُ كلُّه **داخل المهمّة**. لا رسائلَ مباشرة ولا قناةَ عامة. بلا هذا القيد
   تتحوّل الأداةُ واتساب ثانياً فتمتلئ كلاماً وتُهجَر.

   ── صمّامُ «ليست من اختصاصي» ──
   ولأنّ **أيَّ موظفٍ يكلّف أيَّ زميل** (قرارُ المالك)، فالمكلَّفُ يملك ردَّ المهمّة
   بسببٍ مكتوب. بدونه يبقى تكليفٌ لا يخصّه في قائمته أحمرَ متأخّراً وهو غيرُ مسؤولٍ
   عنه — فتصير القائمةُ كذبةً يتوقّف الناسُ عن قراءتها.

   ── خدمات النواة المقروءة بالاسم ──
   `db` · `firebase` · `esc` · `_jsq` · `toast` · `currentUser` · `USERS` ·
   `logAudit` · `showPage` · `IS_DEV`.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
  "use strict";

  var MODULE_BUILD = "v18.9.3017";

  function COLL(){
    var dev=false;
    try{ dev=(typeof IS_DEV!=="undefined" && IS_DEV); }catch(e){}
    return dev ? "staff_tasks_dev" : "staff_tasks";
  }

  /* ════════ الحالة المحلّية ════════ */
  var _tasks   = [];      // ما وصل من Firestore (مقصورٌ على ما أنا طرفٌ فيه)
  var _unsub   = null;
  var _loaded  = false;   // وصلت لقطةٌ حقيقيّة — لا تضعها مهلةٌ ولا مؤقّت
  var _connIssue = false; // المستمعُ أبلغ خطأً فعلياً
  var _slow    = false;   // طال الانتظارُ **والشاشةُ مفتوحة** — إبطاءٌ لا عطل
  var _slowTimer = null;
  var _allTasks = [];     // «كل المهامّ (إدارة)» — تُجلب عند فتح الخانة لا عند الدخول
  var _allState = "";     // "" | "loading" | "ok" | "err"
  var _lastTry = 0;       // آخرُ محاولةِ اشتراكٍ — تمنع حلقةَ إعادةٍ عند كل رسم
  var _tab     = "mine";  // mine | sent | notes | done | all
  var _openId  = null;    // المهمّة المفتوحة تفصيلاً
  var _draft   = [];      // مسوّدةُ التكليف السريع
  var _draftTo = "";      // اسمُ دخول المكلَّف في المسوّدة
  var _editing = false;  // شاشةُ التفصيل في وضع التحرير
  var _cssDone = false;

  /* ════════ هوية المستخدم ════════
     اسمُ الدخول هو المفتاح في كل مكان. الاسمُ المعروض للعرض فقط. */
  function _me(){
    try{ return (typeof currentUser!=="undefined" && currentUser && currentUser.user) ? currentUser.user : ""; }
    catch(e){ return ""; }
  }
  function _myName(){
    try{ return (typeof currentUser!=="undefined" && currentUser && (currentUser.name||currentUser.user)) || ""; }
    catch(e){ return ""; }
  }
  function _myRole(){
    try{ return (typeof currentUser!=="undefined" && currentUser && currentUser.role) ? currentUser.role : ""; }
    catch(e){ return ""; }
  }
  function _isAdmin(){ return _myRole()==="admin"; }
  function _users(){
    try{ return (typeof USERS!=="undefined" && Array.isArray(USERS)) ? USERS : []; }
    catch(e){ return []; }
  }
  function _nameOf(login){
    var u=_users().filter(function(x){ return x.user===login; })[0];
    return (u && u.name) ? u.name : (login||"—");
  }
  function _canView(){ return !!_me(); }

  /* ════════ دوالٌّ نقيّة — تُفحص في hail-tests بلا متصفّح ════════ */

  /* تفكيكُ لصقةٍ متعدّدةِ الأسطر إلى مهامّ مستقلّة.
     المديرُ ينسخ قائمةً جاهزةً من الواتساب أو من الملاحظات، فتنفكّ سطراً سطراً.
     ويُنظَّف كلُّ سطرٍ من ترقيمٍ أو شرطةٍ في أوّله — «١. راجع العقد» و«- راجع العقد»
     و«راجع العقد» مهمّةٌ واحدةٌ نصُّها واحد، وإلا حُفظ الترقيمُ داخل العنوان فصار
     الفرزُ والبحثُ عليه عبثاً. */
  function _parseBulk(text){
    if(typeof text!=="string" || !text) return [];
    return text.split(/\r?\n/)
      .map(function(l){
        return String(l)
          .replace(/^[\s‏‎]*(?:[-–—*•]|\(?\d+\)?[.)：:]|[٠-٩]+[.)：:])\s*/, "")
          .trim();
      })
      .filter(function(l){ return l.length>0; });
  }

  /* المشاركون: المُنشئ + المكلَّف + المضافون — بلا تكرارٍ وبلا فراغ.
     دالةٌ واحدةٌ تبنيها في كلّ المسارات (إنشاءٌ · إضافةُ مشارك · ردٌّ) فلا يفترق
     مسارٌ عن آخر فيُنتج مستنداً بمشاركين ناقصين لا يراه صاحبُه. */
  function _participantsOf(t){
    var out=[], seen={};
    [ (t&&t.createdByUser)||"", (t&&t.assignedToUser)||"" ]
      .concat(Array.isArray(t&&t.shared) ? t.shared : [])
      .forEach(function(u){
        u=String(u||"").trim();
        if(!u || seen[u]) return;
        seen[u]=true; out.push(u);
      });
    return out;
  }

  /* هل يرى فلانٌ هذه المهمّة؟ الأدمن يرى الكلّ، وغيرُه إن كان مشاركاً. */
  function _canSee(t, login, role){
    if(role==="admin") return true;
    if(!login) return false;
    return _participantsOf(t).indexOf(login) !== -1;
  }

  /* مَن يضيف مشاركاً: مُنشئُ المهمّة أو الأدمن — لا كلُّ مشارك.
     لو ملكها كلُّ مشارك لأمكن لمن أُضيف أن يُدخل الغرفةَ من شاء، فتُفتح غرفةٌ
     أنشأها المديرُ مغلقةً على مَن لم يخترْه هو. */
  function _canEditParticipants(t, login, role){
    if(role==="admin") return true;
    return !!login && (t&&t.createdByUser)===login;
  }

  /* مَن يعدّل نصَّ المهمّة: كلُّ مشاركٍ فيها.
     قرارُ المالك (03/09): المكلَّفُ يصحّح موعداً أو يُتمّ بياناً ناقصاً بلا أن يعود
     إلى مديره في كل حرف. والمسؤوليةُ محفوظةٌ بأنّ **التعديلَ يُنسَب**: يُكتب
     `lastEditBy`/`lastEditAt` ويظهران في التفصيل، ويُقيَّد في `audit_log`. */
  function _canEdit(t, login, role){
    if(role==="admin") return true;
    if(!login) return false;
    return _participantsOf(t).indexOf(login) !== -1;
  }

  /* ومَن يحوّل المهمّة إلى موظّفٍ آخر: المُنشئُ وحدَه — قاعدةُ الأطراف نفسُها.
     ولو ملكها المكلَّفُ لأمكنه أن يرمي ما كُلِّف به على زميلٍ ويخرج من الغرفة،
     فيضيع التكليفُ بلا أن يعلم مَن أصدره. */
  function _canReassign(t, login, role){
    return _canEditParticipants(t, login, role);
  }

  /* بناءُ حزمة التعديل — **دالّةٌ واحدةٌ تقرّر وتبني**، فلا تفترق شاشةٌ عن قاعدة.
     تُرجع `null` عند المنع أو عند عنوانٍ فارغ: مهمّةٌ بلا عنوانٍ سطرٌ أبيضُ في
     القائمة لا يعرف صاحبُه ما هو.
     وتحويلُ المكلَّف يُعيد بناءَ `participants` من `_participantsOf` نفسِها — فيخرج
     المكلَّفُ السابق تلقائياً (ما لم يكن مُضافاً صراحةً في `shared`) ويدخل الجديد.
     ولا يُنسَخ منطقُ الأطراف هنا: نسخةٌ ثانيةٌ تفترق بعد أوّل تعديل فتُنتج مستنداً
     لا يراه صاحبُه. */
  function _editPatch(t, form, login, role){
    if(!t || !_canEdit(t, login, role)) return null;
    var title=String((form&&form.title)||"").trim();
    if(!title) return null;
    var due=String((form&&form.due)||"");
    var p={
      title: title,
      body:  String((form&&form.body)||"").trim(),
      due:   /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : "",
      priority: (form&&form.priority)==="high" ? "high" : "normal"
    };
    if(_canReassign(t, login, role) && form && ("assignedToUser" in form)){
      var to=String(form.assignedToUser||"");
      p.assignedToUser = to;
      p.assignedToName = to ? _nameOf(to) : "";
      // بلا مكلَّفٍ تصير ملاحظةً شخصية — وإلا بقيت في «مهامّي» عند لا أحد
      p.kind = to ? "task" : "note";
      p.participants = _participantsOf({
        createdByUser: (t&&t.createdByUser)||"",
        assignedToUser: to,
        shared: (t&&t.shared)||[]
      });
    }
    return p;
  }

  /* مَن خرج من الغرفة بهذا التحويل — يُعرَض للمُنشئ **قبل** الحفظ لا بعده.
     إخراجُ زميلٍ من مهمّةٍ عَلّق فيها فعلٌ لا يُلغى بزرّ رجوع. */
  function _droppedBy(t, toUser){
    var before=_participantsOf(t);
    var after=_participantsOf({
      createdByUser:(t&&t.createdByUser)||"",
      assignedToUser:String(toUser||""),
      shared:(t&&t.shared)||[]
    });
    return before.filter(function(u){ return after.indexOf(u)===-1; });
  }

  /* حالةُ الموعد — أساسُ اللون في البطاقة.
     المقارنةُ بنصّ ISO (YYYY-MM-DD) لا بكائن Date: الأخيرُ يفسّر التاريخ بتوقيت
     الجهاز فينزلق يوماً كاملاً على جهازٍ بمنطقةٍ زمنيةٍ أخرى — والمتأخّرُ يوماً
     ليس متأخّراً. */
  function _dueState(t, todayISO){
    if(!t || t.status==="done") return "none";
    var d=String((t&&t.due)||"");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "none";
    var today=String(todayISO||"");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(today)) return "none";
    if(d < today)  return "late";
    if(d === today) return "due";
    return _daysBetween(today, d) <= 1 ? "soon" : "none";
  }
  function _daysBetween(aISO, bISO){
    var a=Date.UTC(+aISO.slice(0,4), +aISO.slice(5,7)-1, +aISO.slice(8,10));
    var b=Date.UTC(+bISO.slice(0,4), +bISO.slice(5,7)-1, +bISO.slice(8,10));
    return Math.round((b-a)/86400000);
  }
  function _isOverdue(t, todayISO){ return _dueState(t, todayISO)==="late"; }

  /* توزيعُ القائمة على الخانات — مصدرُ الحقيقة الوحيد للتبويب والعدّاد معاً،
     فلا يقول الشريطُ «٣» وتعرض الشاشةُ اثنتين. */
  function _splitTabs(list, login){
    var r={ mine:[], sent:[], notes:[], done:[] };
    (Array.isArray(list)?list:[]).forEach(function(t){
      if(!t) return;
      if(t.status==="done"){ r.done.push(t); return; }
      if(t.kind==="note" && t.createdByUser===login && !t.assignedToUser){ r.notes.push(t); return; }
      if(t.assignedToUser===login) r.mine.push(t);
      if(t.createdByUser===login && t.assignedToUser!==login) r.sent.push(t);
    });
    return r;
  }

  /* عدّادُ الشريط الجانبي: المفتوحُ المكلَّفُ به أنا — لا ما كلّفتُ به غيري.
     الرقمُ الأحمر التزامٌ عليّ؛ لو عدَّ ما أرسلتُه لصار الرقمُ لا يهبط بعملي أنا. */
  function _countOpen(list, login){
    return (Array.isArray(list)?list:[]).filter(function(t){
      return t && t.status!=="done" && t.assignedToUser===login;
    }).length;
  }

  /* الترتيب: المتأخّرُ أوّلاً، ثمّ الأقربُ موعداً، ثمّ بلا موعد، ثمّ الأحدثُ إنشاءً. */
  function _sortTasks(list, todayISO){
    var rank={ late:0, due:1, soon:2, none:3 };
    return (Array.isArray(list)?list.slice():[]).sort(function(a,b){
      var ra=rank[_dueState(a,todayISO)], rb=rank[_dueState(b,todayISO)];
      if(ra!==rb) return ra-rb;
      var da=String((a&&a.due)||"9999-99-99"), dbv=String((b&&b.due)||"9999-99-99");
      if(da!==dbv) return da<dbv ? -1 : 1;
      return _ms(b)-_ms(a);
    });
  }
  function _ms(t){
    try{
      var c=t&&t.createdAt;
      if(!c) return 0;
      if(typeof c.toMillis==="function") return c.toMillis();
      if(c.seconds) return c.seconds*1000;
      return 0;
    }catch(e){ return 0; }
  }

  function _todayISO(){
    var d=new Date();
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  }

  /* ════════ المزامنة ════════ */
  /* ── الاشتراكُ عند الدخول: **مقصورٌ على ما أنا طرفٌ فيه** ──
     كان الأدمن يشترك في المجموعة **كاملةً** حيّاً من لحظة الدخول، وهي تكبر بلا حدّ
     ولا يحتاجها إلا حين يفتح خانةَ الإدارة. والشارةُ لا تعدّ إلا ما عليّ أنا، فلا
     شيءَ في الشاشة الأولى يحتاج مهامَّ الآخرين. فصار الاشتراكُ واحداً للجميع
     (`array-contains` باسمي)، و«كل المهامّ» جلبةٌ واحدةٌ عند فتح خانتها.
     (درسُ `finance-audit`: دورٌ لا يرى الشاشة لا يُنزِّل مجموعتَها كلَّ جلسة.) */
  function startSync(){
    if(typeof db==="undefined" || !db) return;
    if(!_canView()) return;
    if(_unsub) return;                     // idempotent
    var me=_me(), q;
    try{ q = db.collection(COLL()).where("participants","array-contains", me); }
    catch(e){ return; }
    try{
      q.get().then(function(s){ if(!_loaded) _applySnap(s); })
       .catch(function(e){ console.warn("staff-tasks first fetch failed:", e); });
    }catch(e){}
    _unsub = q.onSnapshot(_applySnap, function(e){
      console.warn("staff-tasks sync error:", e);
      _connIssue=true; _clearSlow(); _rerender(); _refreshNav();
    });
  }
  function stopSync(){
    try{ if(_unsub) _unsub(); }catch(e){}
    _unsub=null; _loaded=false; _connIssue=false; _tasks=[];
    _clearSlow();
  }
  function _applySnap(snap){
    var out=[];
    snap.forEach(function(d){
      var v=d.data()||{}; v.id=d.id; out.push(v);
    });
    _tasks=out; _loaded=true; _connIssue=false;
    _clearSlow(); _rerender(); _refreshNav();
  }

  /* ── مهلةُ «يطول أكثر من المعتاد» — تُسلَّح عند العرض وحدَه ──
     كانت تُسلَّح داخل `startSync` أي **عند الدخول والشاشةُ مغلقة**، فتُثبّت حالةَ
     خطأٍ لا يراها أحد، ثم يفتحها المستخدم بعد دقائق فيجد «تعذّر الاتصال» بينما
     الشبكةُ سليمة — و`startSync` ترجع فوراً (`_unsub` موضوع) فلا تُعاد المحاولة.
     (بلاغُ المالك 03/09، أُعيد إنتاجُه في `staff-tasks-check.mjs`.)
     والآن: تُسلَّح وقتَ الرسم فقط، **ولا تلمس `_loaded`** — فهي تقول «أبطأُ من
     المعتاد» لا «تعذّر»، وأيُّ لقطةٍ لاحقةٍ تمسحها. */
  function _armSlow(){
    if(_slowTimer || _loaded || _connIssue) return;
    _slowTimer=setTimeout(function(){
      _slowTimer=null;
      if(_loaded || _connIssue) return;
      _slow=true; _rerender();
    }, 8000);
  }
  function _clearSlow(){
    if(_slowTimer){ try{ clearTimeout(_slowTimer); }catch(e){} _slowTimer=null; }
    _slow=false;
  }

  /* «كل المهامّ (إدارة)» — جلبةٌ واحدةٌ عند الطلب، لا تيّارٌ حيٌّ من لحظة الدخول */
  function _loadAll(){
    if(typeof db==="undefined" || !db || !_isAdmin()) return;
    if(_allState==="loading") return;
    _allState="loading"; _rerender();
    db.collection(COLL()).get().then(function(snap){
      var out=[]; snap.forEach(function(d){ var v=d.data()||{}; v.id=d.id; out.push(v); });
      _allTasks=out; _allState="ok"; _rerender();
    }).catch(function(e){
      console.warn("staff-tasks load-all failed:", e);
      _allState="err"; _rerender();
    });
  }
  function _visible(){
    var me=_me(), role=_myRole();
    return _tasks.filter(function(t){ return _canSee(t, me, role); });
  }

  /* ════════ شارةُ الشريط الجانبي ════════ */
  function refreshNav(){ _refreshNav(); }
  function _refreshNav(){
    try{
      var btn=document.getElementById("nav-staff-tasks-btn");
      if(btn) btn.style.display = _canView() ? "" : "none";
      var b=document.getElementById("nav-staff-tasks-badge");
      if(!b) return;
      var n=_countOpen(_visible(), _me());
      if(n>0){ b.textContent=String(n); b.style.display=""; }
      else { b.style.display="none"; }
    }catch(e){}
  }

  /* ════════ الكتابة ════════ */
  function _stamp(){
    try{ return firebase.firestore.FieldValue.serverTimestamp(); }catch(e){ return new Date(); }
  }
  function _newDoc(o){
    var base={
      title: String(o.title||"").trim(),
      body:  String(o.body||"").trim(),
      kind:  o.assignedToUser ? "task" : "note",
      status:"open",
      due:   String(o.due||""),
      priority: o.priority==="high" ? "high" : "normal",
      createdBy: _myName(),
      createdByUser: _me(),
      assignedToUser: String(o.assignedToUser||""),
      assignedToName: o.assignedToUser ? _nameOf(o.assignedToUser) : "",
      shared: [],
      comments: [],
      batchId: String(o.batchId||""),
      notifiedAt: null,                 // محجوزٌ للإشعارات المؤجَّلة
      createdAt: _stamp(),
      updatedAt: _stamp()
    };
    base.participants=_participantsOf(base);
    return base;
  }

  /* إرسالُ المسوّدة كاملةً — دفعةٌ واحدةٌ بمعرّفٍ واحد.
     كتابةُ الدفعة عبر `writeBatch` لا حلقةَ `add`: خمسُ كتاباتٍ متتاليةٍ قد تنجح
     ثلاثٌ منها ثمّ تنقطع الشبكة، فيستلم الموظفُ ثلاثاً من خمسٍ ولا يعرف أحدٌ أنّ
     اثنتين ضاعتا. الدفعةُ تنجح كاملةً أو تفشل كاملةً. */
  function sendDraft(){
    if(!_draft.length){ _t("لا توجد مهامٌّ في القائمة","warn"); return; }
    if(typeof db==="undefined" || !db){ _t("لا اتصال بقاعدة البيانات","warn"); return; }
    var bid = "B"+Date.now()+"-"+Math.random().toString(36).slice(2,7);
    var to  = _draftTo;
    var rows=_draft.slice();
    var batch;
    try{ batch=db.batch(); }catch(e){ _t("تعذّر التحضير","warn"); return; }
    rows.forEach(function(r){
      var ref=db.collection(COLL()).doc();
      batch.set(ref, _newDoc({ title:r.title, due:r.due, priority:r.priority, assignedToUser:to, batchId:bid }));
    });
    batch.commit().then(function(){
      try{ logAudit("staff_tasks_create", rows.length+" مهمّة → "+(to?_nameOf(to):"ملاحظات شخصية")); }catch(e){}
      _t("أُرسلت "+rows.length+" مهمّة"+(to?(" إلى "+_nameOf(to)):""), "ok");
      _draft=[]; _draftTo=""; _rerender();
    }).catch(function(e){
      console.warn("staff-tasks send failed:", e);
      _t("تعذّر الإرسال — لم تُحفظ أيُّ مهمّة","warn");
    });
  }

  function _update(id, patch, okMsg){
    if(typeof db==="undefined" || !db) return Promise.reject();
    patch.updatedAt=_stamp();
    return db.collection(COLL()).doc(id).update(patch).then(function(){
      if(okMsg) _t(okMsg,"ok");
    }).catch(function(e){
      console.warn("staff-tasks update failed:", e);
      _t("تعذّر الحفظ","warn");
      throw e;
    });
  }

  function markDone(id){
    var t=byId(id); if(!t) return;
    _update(id, { status:"done", doneAt:_stamp(), doneByUser:_me(), doneByName:_myName() }, "تمّ الإنجاز");
    try{ logAudit("staff_task_done", t.title||id); }catch(e){}
  }
  function reopen(id){
    _update(id, { status:"open", doneAt:null, doneByUser:"", doneByName:"" }, "أُعيدت المهمّة");
  }

  /* الردّ: «ليست من اختصاصي» — لا تُحذف بل تعود للمرسِل بسببٍ ظاهر. */
  function returnTask(id){
    var t=byId(id); if(!t) return;
    var reason=window.prompt("سببُ الردّ (يظهر للمرسِل):","");
    if(reason===null) return;
    reason=String(reason).trim();
    if(!reason){ _t("السببُ مطلوب","warn"); return; }
    _update(id, {
      status:"returned",
      returnedReason:reason,
      returnedByUser:_me(),
      returnedByName:_myName(),
      returnedAt:_stamp()
    }, "رُدّت المهمّة إلى المرسِل");
    try{ logAudit("staff_task_returned", (t.title||id)+" — "+reason); }catch(e){}
  }
  function acceptBack(id){
    _update(id, { status:"open", returnedReason:"", returnedByUser:"", returnedByName:"" }, "أُعيد فتح المهمّة");
  }

  function addComment(id){
    var el=document.getElementById("st-cmt-"+id);
    if(!el) return;
    var txt=String(el.value||"").trim();
    if(!txt){ _t("اكتب شيئاً أوّلاً","warn"); return; }
    if(typeof db==="undefined" || !db) return;
    var entry={ user:_me(), name:_myName(), text:txt, at:new Date().toISOString() };
    // arrayUnion لا كتابةُ المصفوفة كاملة: مشاركٌ آخر قد يكون علّق في الأثناء،
    // وكتابةُ نسختي القديمة تمحو تعليقَه.
    var u;
    try{ u=firebase.firestore.FieldValue.arrayUnion(entry); }catch(e){ return; }
    el.value="";
    _update(id, { comments:u }).catch(function(){});
  }

  /* إضافةُ مشارك — يملكها المُنشئ وحدَه، وتُصاحبها مصارحةٌ صريحة.
     المُضافُ سيقرأ المحادثةَ من أوّلها، فيُنبَّه المُنشئ قبل الفعل لا بعدَه. */
  function shareTask(id){
    var t=byId(id); if(!t) return;
    if(!_canEditParticipants(t,_me(),_myRole())){ _t("إضافةُ مشاركٍ لمُنشئ المهمّة","warn"); return; }
    var sel=document.getElementById("st-share-"+id);
    if(!sel) return;
    var who=String(sel.value||"");
    if(!who){ _t("اختر موظفاً","warn"); return; }
    if(_participantsOf(t).indexOf(who)!==-1){ _t("مشاركٌ أصلاً","warn"); return; }
    if(!window.confirm("سيطّلع "+_nameOf(who)+" على كامل تفاصيل المهمّة والمحادثة السابقة.\n\nمتابعة؟")) return;
    var shared=(Array.isArray(t.shared)?t.shared.slice():[]);
    shared.push(who);
    var next=Object.assign({}, t, { shared:shared });
    _update(id, { shared:shared, participants:_participantsOf(next) }, "أُضيف "+_nameOf(who));
    try{ logAudit("staff_task_shared", (t.title||id)+" → "+_nameOf(who)); }catch(e){}
  }

  /* ════════ التحرير ════════ */
  function startEdit(id){ _openId=id; _editing=true; _rerender(); }
  function cancelEdit(){ _editing=false; _rerender(); }

  function saveEdit(id){
    var t=byId(id); if(!t) return;
    var g=function(sfx){ return document.getElementById("st-ed-"+sfx+"-"+id); };
    var form={
      title:    (g("title")||{}).value,
      body:     (g("body")||{}).value,
      due:      (g("due")||{}).value,
      priority: (g("prio")||{}).value
    };
    var asg=g("asg");
    if(asg) form.assignedToUser=asg.value;

    var patch=_editPatch(t, form, _me(), _myRole());
    if(!patch){
      _t(String(form.title||"").trim() ? "لا تملك تعديلَ هذه المهمّة" : "العنوان مطلوب","warn");
      return;
    }
    // تحويلٌ يُخرج أحداً من الغرفة: يُصارَح به قبل الحفظ لا بعده
    if(asg && String(asg.value||"")!==String(t.assignedToUser||"")){
      var out=_droppedBy(t, asg.value).map(_nameOf);
      var msg = asg.value
        ? ("تحويلُ المهمّة إلى "+_nameOf(asg.value)+"."+(out.length?("\n\nوسيخرج منها: "+out.join(" · ")+" — فلن يراها بعد الآن."):""))
        : ("إلغاءُ التكليف — تصير ملاحظةً شخصيةً لك."+(out.length?("\n\nوسيخرج منها: "+out.join(" · ")+"."):""));
      if(!window.confirm(msg+"\n\nمتابعة؟")) return;
    }
    // التعديلُ يُنسَب: مَن غيّر ومتى — يظهران في التفصيل ويُقيَّدان في السجلّ
    patch.lastEditBy=_me(); patch.lastEditName=_myName(); patch.lastEditAt=_stamp();
    _update(id, patch, "حُفظ التعديل").then(function(){
      _editing=false; _rerender();
      try{ logAudit("staff_task_edit", (t.title||id)+" ⇐ "+patch.title); }catch(e){}
    }).catch(function(){});
  }

  function removeTask(id){
    var t=byId(id); if(!t) return;
    if(!(_isAdmin() || t.createdByUser===_me())){ _t("الحذفُ لمُنشئ المهمّة","warn"); return; }
    if(!window.confirm("حذفُ «"+(t.title||"")+"» نهائياً؟")) return;
    if(typeof db==="undefined" || !db) return;
    db.collection(COLL()).doc(id).delete().then(function(){
      _openId=null; _t("حُذفت","ok");
      try{ logAudit("staff_task_delete", t.title||id); }catch(e){}
    }).catch(function(){ _t("تعذّر الحذف","warn"); });
  }

  function byId(id){
    return _tasks.filter(function(t){ return t.id===id; })[0]
        || _allTasks.filter(function(t){ return t.id===id; })[0]
        || null;
  }

  /* ════════ المسوّدة (التكليف السريع) ════════ */
  function draftPick(v){ _draftTo=String(v||""); _rerender(); }
  function draftAdd(){
    var el=document.getElementById("st-quick-input");
    if(!el) return;
    var raw=String(el.value||"");
    var rows=_parseBulk(raw);
    if(!rows.length){ el.value=""; return; }
    rows.forEach(function(title){ _draft.push({ title:title, due:"", priority:"normal" }); });
    el.value="";
    _rerender();
    // السطرُ يبقى مركَّزاً: يكتب التاليةَ بلا رفعِ يدٍ عن لوحة المفاتيح
    setTimeout(function(){ var e2=document.getElementById("st-quick-input"); if(e2) e2.focus(); }, 0);
  }
  function draftKey(ev){
    if(ev && (ev.key==="Enter" || ev.keyCode===13)){ ev.preventDefault(); draftAdd(); }
  }
  /* لصقُ قائمةٍ جاهزةٍ من الجوّال — يُقرأ من الحافظة لا من قيمة الحقل.
     السببُ أنّ `<input type="text">` **حقلُ سطرٍ واحد**: المتصفّحُ يطوي أسطرَ اللصقة
     إلى سطرٍ واحدٍ قبل أن يراها أيُّ كود، فقائمةُ خمسِ مهامٍّ تصير مهمّةً واحدةً
     عنوانُها الخمسةُ ملتصقة. فلا سبيلَ إلى الأسطر إلا اعتراضُ حدث `paste` نفسِه.
     (رصده فحصُ المتصفّح؛ ولم يكن ليظهر في فحصٍ يستدعي `_parseBulk` مباشرةً — تلك
     تُثبت أنّ التفكيكَ صحيحٌ لا أنّ النصَّ يصل إليه أصلاً.)
     ولصقةُ السطر الواحد تمرّ كما هي: لا نصادر سلوكاً طبيعياً بلا سبب. */
  function draftPaste(ev){
    var txt="";
    try{ txt=((ev && ev.clipboardData) || window.clipboardData).getData("text") || ""; }catch(e){ return; }
    if(!/[\r\n]/.test(txt)) return;
    try{ ev.preventDefault(); }catch(e){}
    var rows=_parseBulk(txt);
    if(!rows.length) return;
    rows.forEach(function(title){ _draft.push({ title:title, due:"", priority:"normal" }); });
    var el=document.getElementById("st-quick-input");
    if(el) el.value="";
    _rerender();
    setTimeout(function(){ var e2=document.getElementById("st-quick-input"); if(e2) e2.focus(); }, 0);
  }
  function draftDrop(i){ _draft.splice(i,1); _rerender(); }
  function draftDue(i,v){ if(_draft[i]) _draft[i].due=String(v||""); }
  function draftPrio(i,v){ if(_draft[i]) _draft[i].priority = v==="high"?"high":"normal"; _rerender(); }
  function draftDueAll(v){
    v=String(v||"");
    _draft.forEach(function(r){ r.due=v; });
    _rerender();
  }
  function draftClear(){ _draft=[]; _rerender(); }

  /* ════════ التنقّل ════════ */
  function list(){ try{ showPage("staff-tasks"); }catch(e){} }
  function tab(t){
    _tab=t; _openId=null; _editing=false;
    if(t==="all" && _isAdmin()){
      try{ logAudit("staff_tasks_view_all","اطّلاعُ الإدارة على كل المهامّ"); }catch(e){}
      if(_allState!=="ok") _loadAll();
    }
    _rerender();
  }
  function open(id){ _openId=id; _editing=false; _rerender(); }
  function back(){ _openId=null; _editing=false; _rerender(); }

  function _t(m,k){ try{ toast(m,k); }catch(e){} }
  function _e(s){ try{ return esc(s==null?"":String(s)); }catch(e){ return String(s==null?"":s); } }
  function _q(s){ try{ return _jsq(s==null?"":String(s)); }catch(e){ return String(s==null?"":s).replace(/'/g,"\\'"); } }

  /* ════════ الأيقونات ════════
     تُقرأ من مُصنّع المنصّة `_ic` بالاسم من النطاق المشترك — لا نسخةَ ثانيةً من
     مسارات الـSVG هنا. السببُ أنّ نسخةً محلّيةً تتجمّد على شكلِ اليوم: تُبدَّل أيقونةُ
     المنصّة فتبقى أيقونتُنا وحدَها على القديم، فتظهر شاشةٌ بين شاشاتٍ بأسلوبٍ آخر.
     والسقوطُ الآمن نصٌّ فارغ: أيقونةٌ غائبةٌ تُنقص زينةً ولا تكسر سطراً. */
  function _icn(name, cls){
    try{ return (typeof _ic==="function") ? _ic(name, cls) : ""; }catch(e){ return ""; }
  }

  /* ════════ الأنماط ════════
     تُحقن مرّةً واحدةً وقتَ أوّل رسم، ومحصورةٌ ببادئة `st-` وبـ`#page-staff-tasks`
     فلا تنزلق قاعدةٌ منها على شاشةٍ أخرى (خمسُ وحداتٍ تحقن <style> وقتَ التشغيل،
     وترتيبُ التتالي بينها لا يُضمن).

     ── ولا حقلَ يُنسَّق هنا ──
     الحقولُ تأخذ `.form-input`/`.form-select` من `app.css`، والأزرارُ `.btn-*`،
     والبطاقاتُ `.card`. والسببُ ليس اختصاراً: القيمُ اللونية في المنصّة **متغيّراتٌ
     تنقلب في الوضع الداكن** (`html[data-theme="dark"]` يعيد تعريفها جملةً). فكلُّ
     لونٍ يُكتب هنا رقماً — أو يُقرأ من متغيّرٍ لا وجودَ له فيسقط على احتياطيّ — يبقى
     على حاله حين ينقلب كلُّ ما حوله. (وقع ذلك فعلاً في أول نسخة: كُتب
     `var(--bg2,#131a2b)` و`--bg2` **ليس من متغيّرات المنصّة**، فسقطت الحقول على
     الأزرق الداكن الاحتياطيّ وظهرت سوداءَ وسط شاشةٍ فاتحة.)
     فما يبقى هنا: **التخطيطُ وحدَه**، وألوانُه من متغيّرات المنصّة لا غير. */
  function _injectCSS(){
    if(_cssDone) return; _cssDone=true;
    var css=
      '#page-staff-tasks{direction:rtl}'+
      /* الخانات: نمطُ رقاقة المنصّة (pcli-grp-chip) — حدٌّ رفيعٌ ولونٌ خافت،
         والمفتوحةُ تمتلئ بلون الهوية `--primary` نفسِه الذي يعلّم السايدبار والترويسة. */
      '#page-staff-tasks .st-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 14px}'+
      '#page-staff-tasks .st-tab{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;'+
        'padding:6px 14px;border-radius:20px;border:1px solid var(--border);background:var(--surface2);'+
        'color:var(--muted);cursor:pointer;transition:all .12s;font-family:inherit}'+
      '#page-staff-tasks .st-tab:hover{border-color:var(--primary);color:var(--primary)}'+
      '#page-staff-tasks .st-tab.on{background:var(--primary);color:#fff;border-color:var(--primary)}'+
      '#page-staff-tasks .st-tab .n{min-width:17px;padding:0 5px;border-radius:9px;'+
        'background:color-mix(in srgb,var(--primary) 14%,var(--surface));color:var(--primary);font-size:10px}'+
      '#page-staff-tasks .st-tab.on .n{background:rgba(255,255,255,.22);color:#fff}'+
      /* التكليف السريع */
      '#page-staff-tasks .st-quick{background:var(--surface);border:1px solid var(--border);'+
        'border-radius:12px;padding:14px;margin-bottom:14px;box-shadow:var(--shadow)}'+
      '#page-staff-tasks .st-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}'+
      '#page-staff-tasks .st-form{max-width:640px}'+
      '#page-staff-tasks .st-form .st-row>div{flex:1 1 180px}'+
      '#page-staff-tasks .st-row .form-input,#page-staff-tasks .st-row .form-select{width:auto}'+
      '#page-staff-tasks .st-grow{flex:1;min-width:200px}'+
      '#page-staff-tasks .st-hint{font-size:11px;color:var(--muted);margin-top:8px;line-height:1.8}'+
      '#page-staff-tasks .st-draft{margin-top:12px;display:flex;flex-direction:column;gap:6px}'+
      '#page-staff-tasks .st-drow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;'+
        'background:var(--surface2);border-radius:9px;padding:7px 10px}'+
      '#page-staff-tasks .st-drow .t{flex:1;min-width:150px;font-size:13px;font-weight:600;color:var(--text)}'+
      '#page-staff-tasks .st-drow .form-input,#page-staff-tasks .st-drow .form-select{width:auto;padding:5px 9px;font-size:12px}'+
      /* البطاقة: الشريطُ الجانبيُّ وحدَه يحمل الحالة — لا لونَ خلفيةٍ ولا حدٌّ ملوّن.
         السببُ أنّ الشاشة قد تحمل عشرين بطاقة، فمساحةٌ ملوّنةٌ في كلٍّ منها تُلغي
         التمييز: حين يصرخ كلُّ شيءٍ لا يُسمع شيء. */
      '#page-staff-tasks .st-card{background:var(--surface);border:1px solid var(--border);'+
        'border-radius:12px;padding:12px 14px;margin-bottom:8px;cursor:pointer;'+
        'border-inline-start:3px solid transparent;transition:border-color .15s,box-shadow .15s}'+
      '#page-staff-tasks .st-card:hover{border-color:var(--primary);box-shadow:var(--shadow)}'+
      '#page-staff-tasks .st-card.late{border-inline-start-color:var(--danger)}'+
      '#page-staff-tasks .st-card.due{border-inline-start-color:var(--warn)}'+
      '#page-staff-tasks .st-card.soon{border-inline-start-color:var(--stage-wait-fill)}'+
      '#page-staff-tasks .st-card.returned{border-inline-start-color:var(--ai)}'+
      '#page-staff-tasks .st-card.done{opacity:.6}'+
      '#page-staff-tasks .st-ttl{font-size:14px;font-weight:700;color:var(--text);line-height:1.6;margin-bottom:5px}'+
      '#page-staff-tasks .st-card.done .st-ttl{text-decoration:line-through;text-decoration-color:var(--muted)}'+
      '#page-staff-tasks .st-meta{display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:11px;color:var(--muted);font-weight:600}'+
      '#page-staff-tasks .st-meta span{display:inline-flex;align-items:center;gap:4px}'+
      '#page-staff-tasks .st-meta .ic svg{width:12px;height:12px}'+
      '#page-staff-tasks .st-meta .late{color:var(--danger)}'+
      '#page-staff-tasks .st-pill{padding:1px 8px;border-radius:8px;font-size:10px;'+
        'background:var(--surface2);border:1px solid var(--border)}'+
      '#page-staff-tasks .st-pill.hi{color:var(--danger);border-color:color-mix(in srgb,var(--danger) 34%,var(--border))}'+
      '#page-staff-tasks .st-pill.rt{color:var(--ai-ink);border-color:color-mix(in srgb,var(--ai) 34%,var(--border))}'+
      /* الفراغ: دعوةٌ إلى فعلٍ لا احتفال — أيقونةٌ خافتةٌ وسطرٌ يقول ما التالي. */
      '#page-staff-tasks .st-empty{text-align:center;padding:44px 18px;color:var(--muted);font-size:13px;line-height:1.9}'+
      '#page-staff-tasks .st-empty .ic{display:block;margin:0 auto 10px}'+
      '#page-staff-tasks .st-empty .ic svg{width:30px;height:30px;stroke-width:1.5;color:var(--border)}'+
      /* التفصيل */
      '#page-staff-tasks .st-sec{font-size:12px;font-weight:800;color:var(--text);margin:16px 0 8px;'+
        'display:flex;align-items:center;gap:6px}'+
      '#page-staff-tasks .st-body{font-size:13px;line-height:1.9;color:var(--text);white-space:pre-wrap;margin-bottom:12px}'+
      '#page-staff-tasks .st-note{background:var(--surface2);border-radius:9px;padding:9px 11px;margin-bottom:7px}'+
      '#page-staff-tasks .st-note.rt{border-inline-start:3px solid var(--ai)}'+
      '#page-staff-tasks .st-note .who{font-size:11px;color:var(--muted);font-weight:700;margin-bottom:3px}'+
      '#page-staff-tasks .st-note .txt{font-size:13px;line-height:1.7;color:var(--text);white-space:pre-wrap}'+
      '#page-staff-tasks .st-who{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}'+
      '#page-staff-tasks .st-who span{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;'+
        'padding:4px 10px;border-radius:20px;background:var(--surface2);border:1px solid var(--border);color:var(--muted)}'+
      '#page-staff-tasks .st-who span .ic svg{width:12px;height:12px}'+
      '#page-staff-tasks .st-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;'+
        'padding-top:14px;border-top:1px solid var(--border)}'+
      '#page-staff-tasks .st-spin{width:22px;height:22px;border:3px solid var(--border);'+
        'border-top-color:var(--primary);border-radius:50%;animation:st-rot .8s linear infinite;margin:0 auto 12px}'+
      '@keyframes st-rot{to{transform:rotate(360deg)}}'+
      '@media (prefers-reduced-motion:reduce){#page-staff-tasks .st-spin{animation-duration:2.4s}}';
    try{
      var s=document.createElement("style");
      s.id="st-styles"; s.textContent=css;
      document.head.appendChild(s);
    }catch(e){}
  }

  /* ════════ الرسم ════════ */
  function _rerender(){
    var pg=document.getElementById("page-staff-tasks");
    if(pg && pg.classList.contains("active")) render();
  }

  function render(){
    var host=document.getElementById("page-staff-tasks");
    if(!host) return;
    _injectCSS();
    _refreshNav();
    if(!_canView()){
      host.innerHTML='<div class="card"><div class="st-empty">'+_icn("lock")+'سجّل الدخول لعرض مهامّك.</div></div>';
      return;
    }
    startSync();
    /* ── فتحُ الشاشة بلا بياناتٍ يُعيد المحاولةَ من نفسه ──
       ليس عند الخطأ المُبلَّغ وحدَه: **المستمعُ قد يموت صامتاً** — لا يُبلغ خطأً ولا
       يُسلّم لقطة (اشتراكٌ بُني عند الدخول ثم انقطعت الشبكة تحته). فالشرطُ هو
       «لا بيانات» لا «خطأٌ مُبلَّغ»، وإلا بقيت الشاشةُ على دوّارٍ أبديٍّ في أسوأ
       الحالات وأكثرِها شبهاً بما بلّغ عنه المالك.
       ومقيَّدةٌ بعشر ثوانٍ فلا تصير حلقةَ إعادةِ اشتراكٍ عند كل رسم. */
    if(!_loaded && (Date.now()-_lastTry) > 10000){
      _lastTry=Date.now();
      stopSync(); startSync();          // بلا _rerender: الرسمُ جارٍ الآن
    }
    if(!_loaded && !_connIssue){
      _armSlow();
      host.innerHTML=_hero()+'<div class="card"><div class="st-empty"><div class="st-spin"></div>'+
        (_slow ? 'التحميل يطول أكثر من المعتاد…<br><br><button class="btn btn-ghost" onclick="staffTasks.retry()">إعادة المحاولة</button>'
               : 'جارٍ تحميل المهامّ…')+
      '</div></div>';
      return;
    }
    if(_connIssue && !_loaded){
      host.innerHTML=_hero()+'<div class="card"><div class="st-empty">'+_icn("alertTriangle")+
        'تعذّر الاتصال بقاعدة البيانات.<br><br>'+
        '<button class="btn btn-ghost" onclick="staffTasks.retry()">إعادة المحاولة</button></div></div>';
      return;
    }
    if(_openId){
      var t=byId(_openId);
      if(!t){ _openId=null; _editing=false; return render(); }
      if(_editing && !_canEdit(t,_me(),_myRole())) _editing=false;
      host.innerHTML=_hero()+(_editing ? _editHtml(t) : _detailHtml(t));
      return;
    }
    host.innerHTML=_hero()+_quickHtml()+_tabsHtml()+'<div class="card">'+_listHtml()+'</div>';
  }

  function _hero(){
    return '<div class="page-hero">'+
      '<div class="page-hero-titles">'+
        '<div class="page-hero-title"><span class="ph-ico">'+_icn("clipboardCheck")+'</span>المهامّ والملاحظات</div>'+
        '<div class="page-hero-sub">تكليفاتٌ وتذكيراتٌ بينك وبين زملائك — كلُّ مهمّةٍ يراها أطرافُها وحدَهم.</div>'+
      '</div><div class="page-hero-actions"></div></div>';
  }

  function _tabsHtml(){
    var me=_me(), s=_splitTabs(_visible(), me);
    function tb(k,label,n){
      return '<button class="st-tab'+(_tab===k?" on":"")+'" onclick="staffTasks.tab(\''+k+'\')">'+
        _e(label)+(n>0?'<span class="n">'+n+'</span>':'')+'</button>';
    }
    return '<div class="st-tabs">'+
      tb("mine","مهامّي",s.mine.length)+
      tb("sent","كلّفتُ بها",s.sent.length)+
      tb("notes","ملاحظاتي",s.notes.length)+
      tb("done","المنجَزة",0)+
      (_isAdmin()? tb("all","كل المهامّ (إدارة)",0) : "")+
    '</div>';
  }

  function _quickHtml(){
    var opts='<option value="">— ملاحظةٌ لنفسي (بلا تكليف) —</option>'+
      _users().map(function(u){
        return '<option value="'+_e(u.user)+'"'+(_draftTo===u.user?" selected":"")+'>'+_e(u.name||u.user)+'</option>';
      }).join("");
    var draft=_draft.map(function(r,i){
      return '<div class="st-drow">'+
        '<span class="t">'+_e(r.title)+'</span>'+
        '<input type="date" class="form-input" value="'+_e(r.due)+'" onchange="staffTasks.draftDue('+i+',this.value)">'+
        '<select class="form-select" onchange="staffTasks.draftPrio('+i+',this.value)">'+
          '<option value="normal"'+(r.priority!=="high"?" selected":"")+'>عادية</option>'+
          '<option value="high"'+(r.priority==="high"?" selected":"")+'>مهمّة</option>'+
        '</select>'+
        '<button class="btn btn-ghost" onclick="staffTasks.draftDrop('+i+')" title="إزالة">'+_icn("xCircle")+'</button>'+
      '</div>';
    }).join("");
    return '<div class="st-quick">'+
      '<div class="st-row">'+
        '<select class="form-select" style="min-width:190px" onchange="staffTasks.draftPick(this.value)">'+opts+'</select>'+
        '<input type="text" class="form-input st-grow" id="st-quick-input" placeholder="اكتب المهمّة ثمّ Enter…" '+
          'onkeydown="staffTasks.draftKey(event)" onpaste="staffTasks.draftPaste(event)">'+
        '<button class="btn btn-ghost" onclick="staffTasks.draftAdd()">'+_icn("plus")+'إضافة</button>'+
      '</div>'+
      '<div class="st-hint">اكتب المهمّة واضغط <b>Enter</b> — تنزل تحت والسطرُ يبقى جاهزاً للتالية. '+
        'أو الصق قائمةً جاهزةً من الجوّال: كلُّ سطرٍ يصير مهمّةً مستقلّة.</div>'+
      (_draft.length ? (
        '<div class="st-draft">'+draft+'</div>'+
        '<div class="st-row" style="margin-top:12px">'+
          '<span style="font-size:12px;color:var(--muted);font-weight:700">موعدٌ موحّد للكلّ:</span>'+
          '<input type="date" class="form-input" onchange="staffTasks.draftDueAll(this.value)">'+
          '<button class="btn btn-primary" onclick="staffTasks.sendDraft()">'+_icn("send")+'إرسال '+_draft.length+' مهمّة'+
            (_draftTo? (" إلى "+_e(_nameOf(_draftTo))) : "")+'</button>'+
          '<button class="btn btn-ghost" onclick="staffTasks.draftClear()">مسح القائمة</button>'+
        '</div>'
      ) : "")+
    '</div>';
  }

  function _listHtml(){
    var me=_me(), today=_todayISO(), rows;
    if(_tab==="all" && _isAdmin()){
      if(_allState==="loading") return '<div class="st-empty"><div class="st-spin"></div>جارٍ تحميل كل المهامّ…</div>';
      if(_allState==="err")     return '<div class="st-empty">'+_icn("alertTriangle")+
        'تعذّر جلبُ كل المهامّ.<br><br><button class="btn btn-ghost" onclick="staffTasks.loadAll()">إعادة المحاولة</button></div>';
      rows=_sortTasks(_allTasks.filter(function(t){ return t.status!=="done"; }), today);
    } else {
      var s=_splitTabs(_visible(), me);
      rows=_sortTasks(s[_tab]||[], today);
    }
    if(!rows.length) return _emptyHtml();
    return rows.map(function(t){ return _cardHtml(t, today); }).join("");
  }

  /* الفراغُ دعوةٌ إلى فعل: أيقونةٌ خافتةٌ وسطرٌ يقول ما التالي — لا احتفالَ ولا مزاج. */
  function _emptyHtml(){
    var m = _tab==="mine"  ? ["checkCircle","لا مهامَّ عليك الآن."]
          : _tab==="sent"  ? ["send","لم تُكلّف أحداً بشيءٍ بعد.<br>اكتب مهمّةً في الأعلى واختر الموظف."]
          : _tab==="notes" ? ["edit","لا ملاحظات.<br>اكتب تذكيراً لنفسك من الأعلى بلا اختيار موظف."]
          : _tab==="all"   ? ["checkCircle","لا مهامَّ مفتوحةً في النظام."]
          : ["archive","لا مهامَّ منجَزةً بعد."];
    return '<div class="st-empty">'+_icn(m[0])+m[1]+'</div>';
  }

  function _cardHtml(t, today){
    var st=_dueState(t,today);
    var cls="st-card "+(t.status==="done"?"done":(t.status==="returned"?"returned":st));
    var whoIcon = t.assignedToUser ? "user" : "edit";
    var who = t.assignedToUser
      ? (t.assignedToUser===_me() ? ("من: "+_nameOf(t.createdByUser)) : ("إلى: "+_nameOf(t.assignedToUser)))
      : "ملاحظةٌ شخصية";
    var dueTxt = t.due ? (st==="late" ? ("متأخّرة — "+t.due) : t.due) : "بلا موعد";
    var shared=(Array.isArray(t.shared)&&t.shared.length)
      ? ('<span>'+_icn("users")+(t.shared.length+1)+' مشاركين</span>') : "";
    var cn=(Array.isArray(t.comments)&&t.comments.length)
      ? ('<span>'+_icn("edit")+t.comments.length+'</span>') : "";
    return '<div class="'+cls+'" onclick="staffTasks.open(\''+_q(t.id)+'\')">'+
      '<div class="st-ttl">'+_e(t.title)+'</div>'+
      '<div class="st-meta">'+
        '<span>'+_icn(whoIcon)+_e(who)+'</span>'+
        '<span'+(st==="late"?' class="late"':'')+'>'+_icn(st==="late"?"alertTriangle":"clock")+_e(dueTxt)+'</span>'+
        (t.priority==="high"?'<span class="st-pill hi">مهمّة</span>':"")+
        (t.status==="returned"?'<span class="st-pill rt">مردودة</span>':"")+
        shared+cn+
      '</div>'+
    '</div>';
  }

  /* شاشةُ التحرير — نموذجٌ واحدٌ صريح، لا تحريرٌ في مكانه على البطاقة.
     التحريرُ في مكانه يُغري بالحفظ الضمنيّ عند فقد التركيز، فيتغيّر نصُّ مهمّةٍ
     يراها غيرُك بلا أن تقصد. هنا: حفظٌ بزرّ، وإلغاءٌ يعيد كلَّ شيء. */
  function _editHtml(t){
    var canAsg=_canReassign(t,_me(),_myRole());
    var asgOpts='<option value="">— بلا تكليف (ملاحظةٌ شخصية) —</option>'+
      _users().map(function(u){
        return '<option value="'+_e(u.user)+'"'+(t.assignedToUser===u.user?" selected":"")+'>'+_e(u.name||u.user)+'</option>';
      }).join("");
    function row(label, field){
      return '<div style="margin-bottom:12px">'+
        '<label style="display:block;font-size:12px;font-weight:700;color:var(--muted);margin-bottom:5px">'+_e(label)+'</label>'+
        field+'</div>';
    }
    return '<div class="card"><div class="st-form">'+
      '<div class="st-sec" style="margin-top:0">'+_icn("edit")+'تعديل المهمّة</div>'+
      row("العنوان",
        '<input type="text" class="form-input" id="st-ed-title-'+_e(t.id)+'" value="'+_e(t.title)+'" maxlength="200">')+
      row("التفاصيل (اختياري)",
        '<textarea class="form-textarea" id="st-ed-body-'+_e(t.id)+'" rows="3">'+_e(t.body||"")+'</textarea>')+
      '<div class="st-row">'+
        '<div style="flex:1;min-width:150px">'+row("الموعد",
          '<input type="date" class="form-input" id="st-ed-due-'+_e(t.id)+'" value="'+_e(t.due||"")+'">')+'</div>'+
        '<div style="flex:1;min-width:150px">'+row("الأولوية",
          '<select class="form-select" id="st-ed-prio-'+_e(t.id)+'">'+
            '<option value="normal"'+(t.priority!=="high"?" selected":"")+'>عادية</option>'+
            '<option value="high"'+(t.priority==="high"?" selected":"")+'>مهمّة</option>'+
          '</select>')+'</div>'+
      '</div>'+
      (canAsg
        ? row("المكلَّف",
            '<select class="form-select" id="st-ed-asg-'+_e(t.id)+'" style="width:100%">'+asgOpts+'</select>'+
            '<div class="st-hint">تحويلُ المهمّة يُخرج المكلَّفَ السابق منها ما لم يكن مُضافاً مشاركاً.</div>')
        : '<div class="st-hint">تحويلُ المهمّة إلى موظّفٍ آخر لمُنشئها وحدَه.</div>')+
      '<div class="st-acts">'+
        '<button class="btn btn-primary btn-sm" onclick="staffTasks.saveEdit(\''+_q(t.id)+'\')">'+_icn("save")+'حفظ</button>'+
        '<button class="btn btn-ghost" onclick="staffTasks.cancelEdit()">إلغاء</button>'+
      '</div>'+
    '</div></div>';
  }

  function _detailHtml(t){
    var me=_me(), today=_todayISO();
    var mine   = t.assignedToUser===me;
    var owner  = t.createdByUser===me;
    var canShare=_canEditParticipants(t,me,_myRole());
    var parts=_participantsOf(t).map(function(u){
      return '<span>'+_icn(u===t.createdByUser?"pin":"user")+_e(_nameOf(u))+(u===t.createdByUser?" · المُنشئ":"")+'</span>';
    }).join("");
    var cmts=(Array.isArray(t.comments)?t.comments:[]).slice().sort(function(a,b){
      return String(a.at||"")<String(b.at||"") ? -1 : 1;
    }).map(function(c){
      return '<div class="st-note"><div class="who">'+_e(c.name||c.user)+' · '+
             _e(String(c.at||"").slice(0,16).replace("T"," "))+'</div>'+
             '<div class="txt">'+_e(c.text)+'</div></div>';
    }).join("") || '<div class="st-hint">لا ملاحظاتٍ بعد.</div>';

    var shareOpts=_users().filter(function(u){ return _participantsOf(t).indexOf(u.user)===-1; })
      .map(function(u){ return '<option value="'+_e(u.user)+'">'+_e(u.name||u.user)+'</option>'; }).join("");

    var acts="";
    if(t.status!=="done" && (mine||owner||_isAdmin()))
      acts+='<button class="btn btn-primary btn-sm" onclick="staffTasks.markDone(\''+_q(t.id)+'\')">'+_icn("checkCircle")+'تمّ الإنجاز</button>';
    if(_canEdit(t,me,_myRole()))
      acts+='<button class="btn btn-ghost" onclick="staffTasks.startEdit(\''+_q(t.id)+'\')">'+_icn("edit")+'تعديل</button>';
    if(t.status==="done"  && (mine||owner||_isAdmin()))
      acts+='<button class="btn btn-ghost" onclick="staffTasks.reopen(\''+_q(t.id)+'\')">'+_icn("repeat")+'إعادة فتح</button>';
    if(t.status==="open" && mine && !owner)
      acts+='<button class="btn btn-ghost" onclick="staffTasks.returnTask(\''+_q(t.id)+'\')">'+_icn("rotateCcw")+'ليست من اختصاصي</button>';
    if(t.status==="returned" && owner)
      acts+='<button class="btn btn-ghost" onclick="staffTasks.acceptBack(\''+_q(t.id)+'\')">'+_icn("repeat")+'إعادة فتحها</button>';
    if(owner||_isAdmin())
      acts+='<button class="btn btn-danger" onclick="staffTasks.removeTask(\''+_q(t.id)+'\')">'+_icn("trash")+'حذف</button>';

    return '<div class="card">'+
      '<button class="btn btn-ghost btn-sm" onclick="staffTasks.back()">← رجوع</button>'+
      '<h3 style="margin:14px 0 8px;font-size:17px;font-weight:800;line-height:1.6;color:var(--text)">'+_e(t.title)+'</h3>'+
      '<div class="st-meta" style="margin-bottom:12px">'+
        '<span>'+_icn("pin")+'أنشأها: '+_e(_nameOf(t.createdByUser))+'</span>'+
        (t.assignedToUser
          ? ('<span>'+_icn("user")+'المكلَّف: '+_e(_nameOf(t.assignedToUser))+'</span>')
          : ('<span>'+_icn("edit")+'ملاحظةٌ شخصية</span>'))+
        '<span'+(_isOverdue(t,today)?' class="late"':'')+'>'+_icn(_isOverdue(t,today)?"alertTriangle":"clock")+
          (t.due?(_e(t.due)+(_isOverdue(t,today)?" — متأخّرة":"")):'بلا موعد')+'</span>'+
        (t.priority==="high"?'<span class="st-pill hi">مهمّة</span>':"")+
        (t.lastEditBy?('<span>'+_icn("edit")+'آخر تعديل: '+_e(t.lastEditName||_nameOf(t.lastEditBy))+'</span>'):"")+
      '</div>'+
      (t.body?('<div class="st-body">'+_e(t.body)+'</div>'):"")+
      (t.status==="returned"
        ? '<div class="st-note rt"><div class="who">رُدّت من '+_e(_nameOf(t.returnedByUser))+'</div>'+
          '<div class="txt">'+_e(t.returnedReason)+'</div></div>'
        : "")+
      '<div class="st-sec">'+_icn("users")+'المشاركون</div>'+
      '<div class="st-who">'+parts+'</div>'+
      (canShare && shareOpts
        ? '<div class="st-row">'+
            '<select class="form-select" style="min-width:180px" id="st-share-'+_e(t.id)+'">'+
              '<option value="">إضافة موظف…</option>'+shareOpts+'</select>'+
            '<button class="btn btn-ghost" onclick="staffTasks.shareTask(\''+_q(t.id)+'\')">إضافة</button>'+
          '</div>'
        : "")+
      '<div class="st-sec">'+_icn("edit")+'الملاحظات</div>'+cmts+
      '<div class="st-row" style="margin-top:9px">'+
        '<input type="text" class="form-input st-grow" id="st-cmt-'+_e(t.id)+'" placeholder="اكتب ملاحظة…">'+
        '<button class="btn btn-ghost" onclick="staffTasks.addComment(\''+_q(t.id)+'\')">'+_icn("send")+'إرسال</button>'+
      '</div>'+
      '<div class="st-acts">'+acts+'</div>'+
    '</div>';
  }

  function retry(){
    stopSync();            // تُصفّر الحالةَ وتمسح المهلة
    startSync();
    _rerender();
  }

  /* ════════ التصدير ════════ */
  window.staffTasks = {
    startSync:startSync, stopSync:stopSync, render:render, list:list, retry:retry,
    loadAll:_loadAll,
    refreshNav:refreshNav, canView:_canView,
    tab:tab, open:open, back:back, byId:byId,
    markDone:markDone, reopen:reopen, returnTask:returnTask, acceptBack:acceptBack,
    startEdit:startEdit, cancelEdit:cancelEdit, saveEdit:saveEdit,
    addComment:addComment, shareTask:shareTask, removeTask:removeTask,
    draftPick:draftPick, draftAdd:draftAdd, draftKey:draftKey, draftPaste:draftPaste, draftDrop:draftDrop,
    draftDue:draftDue, draftPrio:draftPrio, draftDueAll:draftDueAll,
    draftClear:draftClear, sendDraft:sendDraft,
    // دوالٌّ نقيّة مكشوفةٌ لفحوص hail-tests (بلا متصفّح)
    _parseBulk:_parseBulk, _participantsOf:_participantsOf, _canSee:_canSee,
    _canEditParticipants:_canEditParticipants, _dueState:_dueState, _isOverdue:_isOverdue,
    _canEdit:_canEdit, _canReassign:_canReassign, _editPatch:_editPatch, _droppedBy:_droppedBy,
    _splitTabs:_splitTabs, _countOpen:_countOpen, _sortTasks:_sortTasks,
    build:MODULE_BUILD
  };
})();
