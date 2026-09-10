/* ═══════════════════════════════════════════════════════════════════════════
   نظام هيل — مهامُّ الموظفين وملاحظاتُهم  (staff-tasks.js)

   ── المشكلة التي تعالجها ──
   التكليفُ بين المدير وموظفيه، وبين الموظفين بعضِهم، كان يجري على الواتساب: يضيع
   في مجرى الرسائل، ولا أحدَ يعرف ما بقي مفتوحاً، ولا مرجعَ عند الخلاف على «كلّفتُك
   ولم تُنجز». وهذه الوحدةُ تنقل ذلك إلى النظام الذي يفتحه الموظفون أصلاً طوال
   اليوم — فالتذكيرُ الذي يُرى بلا قصدٍ هو وحدَه الذي يُقرأ.

   ── المبدأُ الحاكم: كلُّ مهمّةٍ غرفةٌ مغلقة ──
   لا «قائمةٌ عامة» ولا لوحةُ فريق. المهمّةُ يراها **مُنشئها والمكلَّفُ بها ومَن
   أُضيف إليها** فقط، ويحملهم المستندُ في مصفوفة `participants` (بأسماء الدخول
   لا بالأسماء المعروضة: المعروضُ يتكرّر ويتغيّر، واسمُ الدخول مفتاحٌ ثابت).
   والاستعلامُ نفسُه مقصورٌ على المشاركة:
       .where("participants", "array-contains", <اسم دخولي>)
   فلا يُنزَّل إلى المتصفّح مستندٌ لست طرفاً فيه أصلاً.

   ── سلسلةُ المشاركة: يضيف كلُّ طرفٍ مَن يحتاجه (قرارُ المالك 09/09) ──
   كانت الإضافةُ للمُنشئ وحدَه، فالمكلَّفُ الذي يحتاج زميلاً ليُتمّ عملَه يعود إلى
   مديره ليُضيفه — أو (وهو الأغلب) **يخرج بالمهمّة إلى الواتساب** فتضيع حيث أُريد
   لها ألّا تضيع، وتعود الوحدةُ إلى المشكلة التي أُنشئت لحلّها. فصارت الإضافةُ لكلّ
   طرف، وحُفظت الغرفةُ بثلاثةِ قيود:
     • **الإضافةُ إضافةٌ محضة**: لا يُخرج طرفٌ طرفاً. تفرضه القاعدةُ بـ`hasAll` على
       `participants` و`shared` معاً — لا الواجهةُ وحدَها.
     • **التحويلُ والإلغاءُ للمُنشئ كما كانا**: `assignedToUser` و`assignedToName`
       و`kind` خارجَ ما يمسّه الطرف، وإلا رمى المكلَّفُ عهدتَه على زميلٍ من بابِ
       «المشاركة» — وهو البابُ نفسُه الذي أُغلق في شاشة التحرير.
     • **وللمُنشئ إخراجُ مَن أُضيف**: صمّامُ المِلكيّة. بلا زرِّ إخراجٍ يصير فتحُ
       الإضافة تنازلاً نهائياً عن غرفةٍ فتحها هو، فلا يملك ردَّ اسمٍ لم يخترْه.
   وكلُّ إضافةٍ وإخراجٍ **يُكتب سطراً في ملاحظات المهمّة** (بـ`arrayUnion` فلا يُمحى)
   — فلا يجد المُنشئ اسماً جديداً في القائمة لا يعرف مَن أدخله ولا متى.

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

   ── المرفقاتُ داخل المهمّة (طلبُ المالك 10/09) ──
   المهمّةُ سطرُ كلامٍ بلا دليل: «صيانةُ المكيّف في الدور الثاني» لا تقول أيَّ مكيّفٍ
   ولا ما عطلُه ولا أين العرضُ الذي بُني عليه التكليف — فيخرج المكلَّفُ إلى الواتساب
   ليطلب الصورة، وهو البابُ الذي أُنشئت الوحدةُ لإغلاقه. فالمرفقُ (صورةٌ · PDF ·
   مستند) يسكن المهمّةَ نفسَها: يرفعه **أيُّ طرفٍ فيها** كما يعلّق، ويحمله الحقلُ
   `attachments` قيداً لكلّ ملفّ (رابطٌ · مسارُ التخزين · اسمٌ · نوعٌ · حجمٌ · مَن
   رفع ومتى). وثلاثةُ قيودٍ تحرسه:
     • **لا رابطَ محلّيٍّ في قاعدة البيانات**: القيدةُ تُكتب بعد نجاح الرفع لا قبلَه
       (درسُ `photo-queue.js`: رابطُ `blob:` يبدو سليماً لحظتَه ويموت إلى الأبد على
       كلّ جهازٍ آخر). والفشلُ يُقال صراحةً ويبقى جسمُ الملفّ في الذاكرة لزرّ إعادة.
     • **`https` وحدَها تُعرض** (`_attList`): الوثيقةُ يكتبها بشرٌ ورابطُها يُوضع في
       `href`، ومخطّطٌ آخر (`javascript:`) يصير نقرةً على قنبلة.
     • **الحذفُ لمَن رفع أو لمُنشئ المهمّة**، ويُكتب سطرُه في الملاحظات — المرفقُ
       دليلٌ، ودليلٌ يزول بلا أثرٍ يُبطل الثقةَ بالسجلّ كلِّه.
   والمرفقُ **حركةٌ كالتعليق** في `_lastActivity`: يلتهب به لونُ «فيها جديد» عند
   بقيّة الأطراف، وإلا رُفع الدليلُ فلم يفتحه أحد.

   ── قيدٌ مقصود: لا دردشةَ عامة ──
   الكلامُ كلُّه **داخل المهمّة**. لا رسائلَ مباشرة ولا قناةَ عامة. بلا هذا القيد
   تتحوّل الأداةُ واتساب ثانياً فتمتلئ كلاماً وتُهجَر.

   ── صمّامُ «ليست من اختصاصي» ──
   ولأنّ **أيَّ موظفٍ يكلّف أيَّ زميل** (قرارُ المالك)، فالمكلَّفُ يملك ردَّ المهمّة
   بسببٍ مكتوب. بدونه يبقى تكليفٌ لا يخصّه في قائمته أحمرَ متأخّراً وهو غيرُ مسؤولٍ
   عنه — فتصير القائمةُ كذبةً يتوقّف الناسُ عن قراءتها.

   ── خدمات النواة المقروءة بالاسم ──
   `db` · `firebase` · `storage` · `compressImage` · `esc` · `_jsq` · `toast` ·
   `currentUser` · `USERS` · `logAudit` · `showPage` · `IS_DEV`.
   (وغيابُ `storage` أو `compressImage` لا يكسر الوحدة: الأولى تُقال «خدمة التخزين
   غير متاحة» عند محاولة الإرفاق وحدَها، والثانيةُ تُرفع الصورةُ بلا ضغط.)
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
  "use strict";

  var MODULE_BUILD = "v18.9.3116";

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
  var _tab     = "mine";  // mine | sent | shared | notes | done | all
  var _openId  = null;    // المهمّة المفتوحة تفصيلاً
  var _draft   = [];      // مسوّدةُ التكليف السريع
  var _draftTo = "";      // اسمُ دخول المكلَّف في المسوّدة
  var _editing = false;  // شاشةُ التفصيل في وضع التحرير
  var _cssDone = false;
  var _atUp    = {};      // مرفقاتٌ قيدَ الرفع الآن: id المهمّة ⇐ [سجلّ رفع]

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

  /* ════════ مطابقةُ اسمِ الموظف في البحث ════════
     المشكلةُ التي بلّغ عنها المالك: قائمةُ التكليف صارت عشراتِ الأسماء، فاختيارُ
     زميلٍ على iPad لَفُّ عجلةٍ بالإصبع لا كتابة. والبحثُ لا يُجدي إن كان مطابقةً
     حرفيّة: الأسماءُ تُكتب بالهمزة وبدونها («أشرف» · «اشرف»)، وبالتاء المربوطة
     وبالهاء، وبالياء وبالألف المقصورة. فمن يكتب «اشرف» يجب أن يجد «أشرف عشري»،
     وإلا خرج بأنّ «البحث لا يعمل» وعاد إلى لفّ العجلة.

     ولذلك: تطبيعٌ عربيٌّ قبل المقارنة (الهمزاتُ ألفاً · الألفُ المقصورةُ ياءً ·
     التاءُ المربوطةُ هاءً · نزعُ التشكيل والتطويل)، ثمّ **كلُّ كلمةٍ في الاستعلام
     يجب أن تُوجد** — «اشرف عش» تجد «أشرف عشري»، ولا يشترط ترتيبُ الكلمات.
     والبحثُ يشمل اسمَ الدخول أيضاً: هو ما يميّز متشابهَي الاسم في القائمة. */
  function _normAr(s){
    return String(s==null?"":s)
      .replace(/[\u064B-\u065F\u0670\u0640]/g, "")   // تشكيلٌ وتطويل
      .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")   // أ إ آ ٱ ⇐ ا
      .replace(/\u0649/g, "\u064A")                       // ى ⇐ ي
      .replace(/\u0629/g, "\u0647")                       // ة ⇐ ه
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }
  function _userMatches(u, q){
    var needle=_normAr(q);
    if(!needle) return true;
    var hay=_normAr(((u&&u.name)||"")+" "+((u&&u.user)||"")+" "+((u&&u.role)||""));
    return needle.split(" ").every(function(w){ return !w || hay.indexOf(w)!==-1; });
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

  /* أطرافُ الوثيقة كما هي: المشتقّةُ ∪ المخزَّنة.
     الاشتقاقُ المحض (`_participantsOf`) هو مصدرُ الحقيقة عند الإنشاء والتحويل،
     لكنّ **الكتابةَ الإضافيّة** تحتاج ما في الوثيقة فعلاً: وثيقةٌ قد تحمل طرفاً لا
     يشتقّه (بقيّةُ تحويلٍ سابق أو مهمّةٌ قديمة)، واشتقاقٌ محضٌ في حزمة الإضافة
     يُسقطه — فتصير «إضافةُ زميل» **إخراجَ ثالثٍ بصمت**، وترفضها القاعدةُ أصلاً على
     غير المُنشئ (`hasAll`) فيُقال للمُضيف «تعذّر الحفظ» بلا سبب. */
  function _docParticipants(t){
    var out=_participantsOf(t);
    (Array.isArray(t&&t.participants)?t.participants:[]).forEach(function(u){
      u=String(u||"").trim();
      if(u && out.indexOf(u)===-1) out.push(u);
    });
    return out;
  }

  /* مَن يضيف مشاركاً: كلُّ طرفٍ في المهمّة (سلسلةُ المشاركة — انظر الترويسة).
     والإضافةُ لا تُعيد تركيبَ الغرفة: تبنيها `_sharePatch` وحدَها إضافةً محضة،
     وتحرسها القاعدةُ بـ`hasAll` — فلا يعتمد الوعدُ على زرٍّ في الواجهة. */
  function _canShare(t, login, role){
    if(role==="admin") return true;
    if(!login) return false;
    return _docParticipants(t).indexOf(login) !== -1;
  }

  /* ومَن يملك **تركيبةَ** الغرفة — إخراجَ طرفٍ وتحويلَ التكليف: المُنشئُ وحدَه.
     والفرقُ بينها وبين `_canShare` هو الفرقُ بين أن تُدخل من تحتاجه لتُتمّ عملاً،
     وأن تُخرج من أدخله غيرُك أو تنقل عهدةً أصدرها سواك. */
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

  /* ── حزمةُ الإضافة: إضافةٌ محضةٌ تُبنى في مكانٍ واحد ──
     تُرجع `null` عند المنع أو عند اسمٍ فارغ أو عند مشاركٍ أصلاً — فلا تُكتب كتابةٌ
     لا تغيّر شيئاً، ولا يُسأل المستخدمُ تأكيداً عن فعلٍ لن يقع. */
  function _sharePatch(t, who, login, role){
    who=String(who||"").trim();
    if(!t || !who) return null;
    if(!_canShare(t, login, role)) return null;
    var have=_docParticipants(t);
    if(have.indexOf(who)!==-1) return null;
    var shared=(Array.isArray(t.shared)?t.shared.slice():[]);
    shared.push(who);
    return { shared:shared, participants:have.concat([who]) };
  }

  /* ── حزمةُ الإخراج: للمُنشئ وحدَه، ولا تطال إلا مَن أُضيف ──
     المُنشئُ والمكلَّفُ ركنا المهمّة لا «مشاركان»: إخراجُ المكلَّف **تحويلٌ** يمرّ من
     شاشة التحرير بمصارحةِ `_droppedBy`، لا زرَّ × صامتاً يترك تكليفاً بلا مكلَّف. */
  function _unsharePatch(t, who, login, role){
    who=String(who||"").trim();
    if(!t || !who) return null;
    if(!_canEditParticipants(t, login, role)) return null;
    if(who===String((t&&t.createdByUser)||"") || who===String((t&&t.assignedToUser)||"")) return null;
    var have=_docParticipants(t);
    if(have.indexOf(who)===-1) return null;
    return {
      shared: (Array.isArray(t.shared)?t.shared:[])
                .map(function(u){ return String(u||"").trim(); })
                .filter(function(u){ return u && u!==who; }),
      participants: have.filter(function(u){ return u!==who; })
    };
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
     فلا يقول الشريطُ «٣» وتعرض الشاشةُ اثنتين.

     ── وخانةُ «شارَكوني فيها» ليست ترفاً ──
     بلاغُ المالك (08/09): «لماذا لا يظهر عندي غير مهمّةٍ واحدة؟» والجذرُ أنّ التوزيع
     كان يعرف ثلاثَ صفاتٍ فقط — مكلَّفٌ · مُنشئٌ · صاحبُ ملاحظة — والصفةُ الرابعةُ
     (**مُضافٌ مشاركاً** في `shared`) لا تُصادف أيَّ سطر، فتسقط المهمّةُ من كلّ
     الخانات. وهي تصل من Firestore فعلاً (الاستعلامُ `array-contains` يجلبها)
     وتُفتح صفحةُ تفصيلها برابطها، لكنها **لا تُرى في أيّ قائمة** — أسوأُ عطلٍ في
     قائمة: بياناتٌ حاضرةٌ ولا سبيلَ إليها، بلا خطأٍ ولا رسالةِ فراغٍ تدلّ عليها.
     فالقاعدةُ الآن: **كلُّ ما يجلبه الاستعلامُ له خانةٌ يظهر فيها**، وحارسٌ في
     `hail-tests` يمنع عودةَ المهمّة اليتيمة.
     ولم تُضَف إلى «مهامّي»: تلك التزامٌ عليّ أنا، وخلطُ ما أُشرِكتُ في متابعته بما
     أُلزِمتُ به يجعل الرقمَ الأحمرَ كذبةً لا تهبط بعملي. */
  function _splitTabs(list, login){
    var r={ mine:[], sent:[], shared:[], notes:[], done:[] };
    (Array.isArray(list)?list:[]).forEach(function(t){
      if(!t) return;
      if(t.status==="done"){ r.done.push(t); return; }
      if(t.kind==="note" && t.createdByUser===login && !t.assignedToUser){ r.notes.push(t); return; }
      var hit=false;
      if(t.assignedToUser===login){ r.mine.push(t); hit=true; }
      if(t.createdByUser===login && t.assignedToUser!==login){ r.sent.push(t); hit=true; }
      // لا مكلَّفٌ ولا مُنشئ — فهو طرفٌ أُضيف، أو ملاحظةُ زميلٍ أشركني فيها
      if(!hit && login && _participantsOf(t).indexOf(login)!==-1) r.shared.push(t);
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
  /* قراءةُ أيّ ختمٍ زمنيٍّ إلى مِلّي ثانية — **صيغةٌ واحدةٌ تفهم الصيغَ الأربع**.
     المشكلةُ أنّ المستندَ الواحد يخلطها: `createdAt` ختمُ خادم (`Timestamp`)،
     و`comments[].at` نصُّ ISO كتبه المتصفّح، و`seenBy` رقمٌ نكتبه نحن. ومقارنةُ
     صيغتين مختلفتين تُنتج «تحديثاً» وهميّاً دائماً أو تُخفيه دائماً — وكلاهما
     يُفقد اللونَ معناه. */
  function _msVal(v){
    try{
      if(v==null) return 0;
      if(typeof v==="number") return v;
      if(typeof v.toMillis==="function") return v.toMillis();
      if(typeof v.seconds==="number") return v.seconds*1000;
      if(v instanceof Date) return v.getTime();
      if(typeof v==="string"){ var n=Date.parse(v); return isNaN(n) ? 0 : n; }
      return 0;
    }catch(e){ return 0; }
  }
  function _ms(t){ return _msVal(t && t.createdAt); }

  /* ════════ «ما الجديد فيها؟» — آخرُ حركةٍ في المهمّة ومَن صنعها ════════
     المهمّةُ ليست سطراً ساكناً: تُعلَّق ويُعدَّل نصُّها وتُنجَز وتُردّ. والمستخدمُ
     يفتح الشاشةَ فيجد القائمةَ نفسَها فلا يعرف **أين جدّ الجديد** — فيفتحها
     واحدةً واحدة، أو (وهو الأغلب) لا يفتح شيئاً.
     والدالّةُ تُرجع **الحركةَ وصاحبَها معاً** لا الوقتَ وحدَه: بلا `by` يلتهب
     السطرُ من فعلِ صاحبه — أُعلّق أنا فتصير مهمّتي «محدَّثةً» عندي. */
  function _lastActivity(t){
    var best={ at:0, by:"", kind:"" };
    function bid(at, by, kind){
      var ms=_msVal(at);
      if(ms>best.at) best={ at:ms, by:String(by||""), kind:kind };
    }
    if(!t) return best;
    bid(t.createdAt,  t.createdByUser,   "new");
    bid(t.lastEditAt, t.lastEditBy,      "edit");
    bid(t.doneAt,     t.doneByUser,      "done");
    bid(t.returnedAt, t.returnedByUser,  "returned");
    (Array.isArray(t.comments)?t.comments:[]).forEach(function(c){
      if(c) bid(c.at, c.user, "comment");
    });
    /* والمرفقُ حركةٌ كالتعليق: صورةُ العطل التي رُفعت هي **الجديدُ** في المهمّة،
       وبلا هذا السطر تُرفَع بلا أن يلتهب لونُ «فيها جديد» عند بقيّة الأطراف —
       فيبقى الدليلُ في المهمّة لا يفتحه أحد. */
    _attList(t).forEach(function(a){ bid(a.at, a.by, "file"); });
    return best;
  }

  /* متى قرأتُ هذه المهمّةَ آخرَ مرّة — رقمٌ في `seenBy` مفتاحُه اسمُ دخولي.
     ولمَ في المستند لا في `localStorage`: الموظفُ يفتح النظامَ على الجوّال وعلى
     الحاسوب، وحالةُ القراءة في المتصفّح تعني أنّ ما قرأتَه على أحدهما يبقى
     ملتهباً على الآخر — فيصير اللونُ ضجيجاً يُتعلَّم تجاهلُه. */
  function _seenMs(t, login){
    try{ return _msVal((t && t.seenBy) ? t.seenBy[login] : 0); }catch(e){ return 0; }
  }

  /* «فيها جديدٌ لم أرَه» — الشرطُ ثلاثيّ، وكلُّ طرفٍ فيه يمنع لوناً كاذباً:
       • طرفٌ في المهمّة  — فلا يلتهب على الأدمن في «كل المهامّ» ما ليس شأنَه.
       • آخرُ حركةٍ ليست لي — فلا تلتهب مهمّةٌ من فعلِ صاحبها.
       • وهي أحدثُ من آخرِ فتحةٍ لي — وإلا بقي اللونُ بعد القراءة فبطل معناه. */
  function _isUnread(t, login){
    if(!t || !login) return false;
    if(_participantsOf(t).indexOf(login)===-1) return false;
    var a=_lastActivity(t);
    if(!a.at || a.by===login) return false;
    return a.at > _seenMs(t, login);
  }
  function _unreadLabel(kind){
    return kind==="comment"  ? "تعليقٌ جديد"
         : kind==="edit"     ? "عُدِّلت"
         : kind==="done"     ? "أُنجزت"
         : kind==="returned" ? "رُدّت"
         : kind==="file"     ? "مرفقٌ جديد"
         : "جديدة";
  }

  /* ════════ المرفقات — دوالٌّ نقيّة ════════
     المهمّةُ كلامٌ بلا دليل: «صيانةُ المكيّف في الدور الثاني» لا تقول أيَّ مكيّفٍ
     ولا ما عطلُه، فيعود المكلَّفُ إلى الواتساب ليطلب الصورة — وهو البابُ نفسُه الذي
     أُنشئت الوحدةُ لإغلاقه. فالمرفقُ يسكن المهمّةَ نفسَها.

     ── ثلاثةُ قيودٍ مقصودة ──
     • **لا رابطَ محلّيٍّ في قاعدة البيانات**: يُكتب المرفقُ بعد نجاح الرفع لا قبلَه.
       رابطُ `blob:` يبدو سليماً للحظته ثم يموت على كلّ جهازٍ آخر وإلى الأبد (درسُ
       `photo-queue.js`)، فالفشلُ يُقال صراحةً ويبقى الملفُّ في الذاكرة لإعادة
       المحاولة — ولا يُسجَّل مرفقٌ لا وجودَ له.
     • **`https` وحدَها تُعرض**: الوثيقةُ يكتبها بشرٌ وتُقرأ هنا في `href`، ورابطٌ
       بمخطّطٍ آخر (`javascript:`) يصير نقرةً على قنبلة. الفلترُ في `_attList` لا
       في موضع الرسم — فمصدرٌ واحدٌ يحرس كلَّ قارئ.
     • **الحذفُ لمَن رفع أو لمُنشئ المهمّة**: المرفقُ دليلٌ، ومَن يمحو دليلَ غيره
       يمحو أثراً لا يملكه. وهو صمّامُ المِلكيّة نفسُه في إخراج المشاركين. */
  var ATT_MAX        = 6;      // مرفقاتٍ للمهمّة الواحدة
  var ATT_MAX_MB     = 12;     // للملفّ غير الصورة
  var ATT_IMG_MAX_MB = 40;     // للصورة قبل الضغط (تُضغط إلى ~١٢٨٠px بعده)
  var ATT_IMG_EXT    = ["jpg","jpeg","png","webp","heic","heif","gif"];
  var ATT_DOC_EXT    = ["pdf","doc","docx","xls","xlsx","csv","txt"];
  var ATT_ACCEPT     = "image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt";

  function _attList(t){
    return (Array.isArray(t&&t.attachments)?t.attachments:[]).filter(function(a){
      return !!a && typeof a==="object" && /^https:\/\//i.test(String(a.url||""));
    });
  }
  function _attExt(name){
    var m=String(name==null?"":name).toLowerCase().match(/\.([a-z0-9]{1,5})$/);
    return m ? m[1] : "";
  }
  function _attKind(a){
    var ty=String((a&&a.type)||"").toLowerCase(), ex=_attExt(a&&a.name);
    if(ty.indexOf("image/")===0 || ATT_IMG_EXT.indexOf(ex)!==-1) return "image";
    if(ty==="application/pdf" || ex==="pdf") return "pdf";
    return "file";
  }
  function _attIcon(a){
    var k=_attKind(a);
    return k==="image" ? "image" : (k==="pdf" ? "fileText" : "paperclip");
  }
  /* الحجمُ بالعربية: رقمٌ واحدٌ بعد الفاصلة يكفي — «2.4 م.ب» تقول ما يقوله
     «2516582 بايت» وتُقرأ بلمحة. */
  function _fmtBytes(n){
    n=Number(n)||0;
    if(n<=0) return "";
    if(n<1024) return n+" بايت";
    if(n<1048576) return (Math.round(n/102.4)/10)+" ك.ب";
    return (Math.round(n/104857.6)/10)+" م.ب";
  }
  /* اسمُ العرض: بلا فواصلِ مسارٍ ولا أسطر، ومقصوصٌ فلا يكسر سطراً طويلٌ بلا حدّ.
     ولا يُبنى منه مسارُ التخزين: الأسماءُ عربيةٌ وفيها مسافاتٌ ورموز، والمسارُ
     يُولَّد من الوقت والصدفة — فيبقى الاسمُ للعرض وحدَه حيث لا يضرّ. */
  function _attSafeName(name){
    var s=String(name==null?"":name).replace(/[\\/\r\n\t]+/g," ").replace(/\s+/g," ").trim();
    if(!s) return "مرفق";
    return s.length>120 ? s.slice(0,117)+"…" : s;
  }
  function _attPath(taskId, ext){
    var e=String(ext||"").toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,5) || "bin";
    return "staff-tasks/"+String(taskId||"x")+"/"+Date.now()+"_"+
           Math.random().toString(36).slice(2,7)+"."+e;
  }
  /* يُرجع "" إن جاز المرفق، وإلا **سببَ المنع بنصّه المعروض** — فلا يُردّ الملفُّ
     بصمتٍ ولا برسالةٍ عامّةٍ لا تقول ما العمل. */
  function _attReject(file, have){
    if(!file) return "لا ملفَّ مختار";
    if(Number(have||0) >= ATT_MAX) return "الحدُّ "+ATT_MAX+" مرفقاتٍ للمهمّة";
    var ex=_attExt(file.name), img=(_attKind(file)==="image");
    if(!img && ATT_DOC_EXT.indexOf(ex)===-1) return "نوعُ الملفّ غيرُ مدعوم — صورةٌ أو PDF أو مستند";
    var mb=Number(file.size||0)/1048576, cap=img?ATT_IMG_MAX_MB:ATT_MAX_MB;
    if(mb > cap) return "حجمُ الملفّ فوق "+cap+" م.ب";
    return "";
  }
  /* قيدُ المرفق كما يُكتب في الوثيقة — **بلا حقلٍ غيرِ معرَّف**: `undefined` واحدٌ
     يُسقط الكتابةَ كلَّها في Firestore، فتبدو الشبكةُ هي العطل. */
  function _attEntry(o){
    o=o||{};
    return {
      url:    String(o.url||""),
      path:   String(o.path||""),
      name:   _attSafeName(o.name),
      type:   String(o.type||"").slice(0,80),
      size:   Number(o.size||0)||0,
      by:     String(o.by||""),
      byName: String(o.byName||""),
      at:     String(o.at||new Date().toISOString())
    };
  }
  /* مَن يُرفق: أطرافُ المهمّة (والأدمن) — كمن يعلّق تماماً.
     ولا يُشترط أن يكون المكلَّفَ: المُنشئُ يُرفق صورةَ العطل، والمكلَّفُ يُرفق
     صورةَ الإنجاز، والمُضافُ يُرفق العرضَ الذي أُدخل من أجله. */
  function _canAttach(t, login, role){
    if(role==="admin") return true;
    if(!login || !t) return false;
    return _docParticipants(t).indexOf(login) !== -1;
  }
  function _canDropAtt(t, att, login, role){
    if(role==="admin") return true;
    if(!login || !t || !att) return false;
    if(_docParticipants(t).indexOf(login)===-1) return false;
    return String(att.by||"")===login || String(t.createdByUser||"")===login;
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

  /* ── تعليمُ المهمّة مقروءةً — كتابةٌ جرّاحيّةٌ لا تلمس شيئاً آخر ──
     ثلاثةُ قيودٍ مقصودة:
     ١) **لا تُكتب إلا إن كان فيها جديدٌ فعلاً** — ففتحُ المهمّة عشرَ مرّاتٍ بعد
        قراءتها لا يكلّف كتابةً واحدة. (بلا هذا القيد يصير كلُّ فتحٍ كتابةً تُبثّ
        إلى كلّ الأطراف فتُعيد رسمَ شاشاتهم بلا سبب.)
     ٢) **لا تمرّ بـ`_update`** — فتلك تختم `updatedAt`، والقراءةُ ليست تعديلاً:
        ختمُها يجعل مجرّدَ فتحِ زميلٍ للمهمّة يبدو حركةً في سجلّها.
     ٣) **`FieldPath` لا مفتاحٌ منقوط** — أسماءُ الدخول في هذا النظام **عربية**
        (`اسامة` · `اشرف` · `حسن`)، و`update({"seenBy.اسامة":n})` يُفكَّك مساراً
        فيسقط على محلّل المسارات. والبانيةُ تأخذ المقاطعَ خاماً بلا تفكيك.
        وهي جرّاحيّةٌ أيضاً: لا تُعيد كتابةَ `seenBy` كلِّها فتمحو ما سجّله زميلٌ
        في الأثناء — درسُ `arrayUnion` نفسُه في التعليقات. */
  function _markSeen(t){
    var me=_me();
    if(!t || !me || !t.id) return;
    if(!_isUnread(t, me)) return;
    var at=_lastActivity(t).at;
    if(!at) return;
    if(typeof db==="undefined" || !db) return;
    try{
      var fp=new firebase.firestore.FieldPath("seenBy", me);
      db.collection(COLL()).doc(t.id).update(fp, at).catch(function(){});
    }catch(e){}
  }

  /* ── مهمّةٌ خارج المستمع الحيّ: تُحدَّث بجلبةٍ صريحةٍ بعد الكتابة ──
     «كل المهامّ (إدارة)» جلبةٌ واحدةٌ عند فتح الخانة لا تيّارٌ حيّ (وذاك مقصودٌ:
     المجموعةُ تكبر بلا حدّ فلا تُبَثّ لكل جلسة). ونتيجتُه أنّ الأدمن حين يفتح من
     تلك الخانة مهمّةً **ليس طرفاً فيها** ثم يعلّق عليها: الكتابةُ تنجح، ولا لقطةَ
     تصل — فتبقى الشاشةُ على نسخةٍ قديمةٍ بلا الملاحظة، ويبدو الأمرُ **كأنّ
     الملاحظة لم تُحفَظ** بينما هي في قاعدة البيانات. فتُجلَب الوثيقةُ صراحةً بعد
     الكتابة، وللوثيقةِ التي يغطّيها المستمعُ لا جلبةَ أصلاً (اللقطةُ أسرعُ وأصدق). */
  function _refreshLocalCopy(id){
    if(!id || typeof db==="undefined" || !db) return;
    if(_tasks.some(function(t){ return t.id===id; })) return;
    if(!_allTasks.some(function(t){ return t.id===id; })) return;
    try{
      db.collection(COLL()).doc(id).get().then(function(d){
        if(!d || !d.exists) return;
        var v=d.data()||{}; v.id=d.id;
        _allTasks=_allTasks.map(function(t){ return t.id===id ? v : t; });
        _rerender();
      }).catch(function(){});
    }catch(e){}
  }

  function _update(id, patch, okMsg){
    if(typeof db==="undefined" || !db) return Promise.reject();
    patch.updatedAt=_stamp();
    return db.collection(COLL()).doc(id).update(patch).then(function(){
      if(okMsg) _t(okMsg,"ok");
      _refreshLocalCopy(id);
    }).catch(function(e){
      console.warn("staff-tasks update failed:", e);
      _t("تعذّر الحفظ","warn");
      throw e;
    });
  }

  /* «تمّ الإنجاز» يُرسل ما في حقل الملاحظة معه (طلبُ المالك 09/09).
     السببُ أنّ آخرَ ما يُكتب قبل الإغلاق هو **خلاصةُ العمل**: «رُكِّب المحرّك،
     ناقصٌ فلتر». فمن كتبها ثم ضغط «تمّ الإنجاز» — وهو التسلسلُ الطبيعيّ — كان
     يفقدها بلا إنذار: الشاشةُ تُعاد رسمُها فيذهب ما في الحقل. وأسوأُ ما فيه أنّ
     **الفقدَ صامت**: لا يُكتشف إلا حين يُسأل عن تفصيلٍ ظنّ أنّه دوّنه.
     **وكتابةٌ واحدةٌ لا اثنتان:** لو أُرسلت الملاحظةُ ثم الإنجازُ في نداءين
     لأمكن أن تنجح إحداهما وتفشل الأخرى — فتُغلق المهمّةُ بلا خلاصتها، أو تُسجَّل
     خلاصةٌ لمهمّةٍ لم تُغلق. فالحقلان يمضيان معاً أو لا يمضيان. */
  function markDone(id){
    var t=byId(id); if(!t) return;
    var patch={ status:"done", doneAt:_stamp(), doneByUser:_me(), doneByName:_myName() };
    var p=_pendingComment(id), u=p ? _cmtUnion(p.entry) : null;
    if(p && u){ patch.comments=u; p.el.value=""; }
    /* وإن تعذّر بناءُ القيد: يُنجَز ولا يُفرَّغ الحقل، ويُقال صراحةً — فلا يظنّ
       صاحبُه أنّ ملاحظتَه حُفظت مع الإنجاز وهي لم تُحفظ. */
    else if(p) _t("أُنجزت، ولم تُحفَظ الملاحظة","warn");
    _update(id, patch, (p && u) ? "تمّ الإنجاز، وأُرسلت الملاحظة" : "تمّ الإنجاز");
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

  /* Enter يُرسل الملاحظة — **والشاشةُ نفسُها هي التي درّبت عليه**: حقلُ التكليف
     السريع في أعلاها يقول «اكتب المهمّة ثمّ Enter» وسطرُ الإرشاد تحته يُعيدها.
     فمن تعلّم الإيقاعَ في أعلى الشاشة يكرّره في أسفلها، ويجد **لا شيء**: لا حفظ
     ولا رسالةَ خطأ ولا حتى وميض — فيستنتج أنّ الملاحظات لا تعمل، لا أنّ زرّاً
     بجانبه هو الطريق. (بلاغُ المالك 09/09.)
     ولا Shift+Enter هنا: الحقلُ سطرٌ واحد، والملاحظةُ الطويلةُ مكانُها متن المهمّة. */
  function cmtKey(ev, id){
    try{
      if(!ev || ev.key!=="Enter" || ev.shiftKey) return;
      ev.preventDefault();
    }catch(e){ return; }
    addComment(id);
  }

  /* ما في حقل الملاحظة الآن — **مصدرٌ واحدٌ** يقرؤه «إرسال» و«تمّ الإنجاز» معاً.
     يُرجع `null` إن غاب الحقلُ أو كان فارغاً؛ ولا يمسّ الحقلَ ولا يكتب شيئاً. */
  function _pendingComment(id){
    var el=document.getElementById("st-cmt-"+id);
    if(!el) return null;
    var txt=String(el.value||"").trim();
    if(!txt) return null;
    return { el:el, entry:{ user:_me(), name:_myName(), text:txt, at:new Date().toISOString() } };
  }
  /* سطرُ نظامٍ في مجرى الملاحظات — دخولُ طرفٍ أو خروجُه.
     بالصيغة نفسِها التي تفهمها بقيّةُ التعليقات و`_lastActivity` (فيلتهب لونُ «فيها
     جديد» عند البقيّة كما يلتهب لتعليق — ودخولُ ثالثٍ إلى الغرفة أولى بالانتباه من
     تعليق)، ويميّزه `sys` في العرض فلا يُقرأ كلاماً كتبه صاحبُه بيده. */
  function _sysEntry(text){
    return { user:_me(), name:_myName(), text:String(text||""), at:new Date().toISOString(), sys:true };
  }
  /* arrayUnion لا كتابةُ المصفوفة كاملة: مشاركٌ آخر قد يكون علّق في الأثناء،
     وكتابةُ نسختي القديمة تمحو تعليقَه. والقاعدةُ نفسُها تحكم المرفقات: زميلٌ
     يرفع صورةً بينما أرفع أنا أخرى، وكتابةُ المصفوفة كاملةً تمحو إحداهما. */
  function _union(v){
    try{ return firebase.firestore.FieldValue.arrayUnion(v); }catch(e){ return null; }
  }
  function _arrRemove(v){
    try{ return firebase.firestore.FieldValue.arrayRemove(v); }catch(e){ return null; }
  }
  function _cmtUnion(entry){ return _union(entry); }

  function addComment(id){
    var el=document.getElementById("st-cmt-"+id);
    if(!el) return;
    if(!String(el.value||"").trim()){ _t("اكتب شيئاً أوّلاً","warn"); return; }
    if(typeof db==="undefined" || !db){ _t("تعذّر الحفظ","warn"); return; }
    var p=_pendingComment(id);
    if(!p) return;
    /* وغيابُ `arrayUnion` لا يُبتلع صامتاً: كان `return` وحدَه فيصير الزرُّ ميتاً
       بلا أثر، والمستخدمُ يظنّ الملاحظاتِ معطّلةً لا أنّ شيئاً أخفق. */
    var u=_cmtUnion(p.entry);
    if(!u){ _t("تعذّر الحفظ","warn"); return; }
    p.el.value="";
    _update(id, { comments:u }).catch(function(){});
  }

  /* ════════ المرفقات — الرفعُ والحذف ════════ */
  function _st(){
    try{ return (typeof storage!=="undefined" && storage) ? storage : null; }catch(e){ return null; }
  }
  function _attPending(id){ return (_atUp[String(id)]||[]); }
  function _attDrop(id, recId){
    var k=String(id);
    _atUp[k]=_attPending(k).filter(function(r){ return r.id!==recId; });
    if(!_atUp[k].length) delete _atUp[k];
  }
  /* اختيارُ الملفّ: زرّان لا زرٌّ واحد. «صورة» يفتح الكاميرا مباشرةً على الجوّال
     (الفنيُّ في الموقع يصوّر العطلَ ولا يبحث في معرضٍ)، و«إرفاق ملف» يفتح المتصفّحَ
     كاملاً — وفرضُ `capture` دائماً كان يمنع الاختيارَ من المعرض ومن الحاسوب. */
  function pickAttachment(id, fromCamera){
    var t=byId(id); if(!t) return;
    if(!_canAttach(t,_me(),_myRole())){ _t("المرفقاتُ لأطراف المهمّة","warn"); return; }
    var room=ATT_MAX-_attList(t).length-_attPending(id).length;
    if(room<=0){ _t("الحدُّ "+ATT_MAX+" مرفقاتٍ للمهمّة","warn"); return; }
    var inp;
    try{ inp=document.createElement("input"); }catch(e){ return; }
    inp.type="file"; inp.style.display="none";
    if(fromCamera){ inp.accept="image/*"; inp.setAttribute("capture","environment"); }
    else{ inp.accept=ATT_ACCEPT; inp.multiple=true; }
    inp.onchange=function(){
      var all=Array.prototype.slice.call(inp.files||[]);
      var files=all.slice(0,room);
      if(all.length>files.length) _t("أُخذت "+files.length+" — الحدُّ "+ATT_MAX+" مرفقاتٍ للمهمّة","warn");
      files.forEach(function(f){ _uploadAtt(id,f); });
      try{ document.body.removeChild(inp); }catch(e){}
    };
    try{ document.body.appendChild(inp); inp.click(); }catch(e){}
  }

  /* الرفع: Storage أوّلاً ثمّ الوثيقة — **بهذا الترتيب لا عكسِه**.
     ولا يُكتب في الوثيقة إلا رابطُ التنزيل الدائم بعد نجاح الرفع؛ فالفشلُ يترك
     المهمّةَ كما كانت ويُقال صراحةً، ويبقى **جسمُ الملفّ في الذاكرة** فزرُّ
     «إعادة» يُعيد المحاولةَ بلا أن يبحث صاحبُه عن الملفّ من جديد على جوّاله.
     والتقدّمُ يُكتب في عنصره مباشرةً لا بإعادة رسمٍ لكلّ حزمةِ بايتات: الرسمُ
     يعيد بناءَ الشاشة كلِّها، وإعادتُه ثلاثين مرّةً في الثانية تُجمّد الصفحة. */
  function _uploadAtt(id, file){
    var t=byId(id); if(!t || !file) return;
    var why=_attReject(file, _attList(t).length+_attPending(id).length);
    if(why){ _t(why,"warn"); return; }
    var st=_st();
    if(!st){ _t("خدمة التخزين غير متاحة","warn"); return; }
    var rec={ id:"u"+Date.now().toString(36)+Math.random().toString(36).slice(2,7),
              name:_attSafeName(file.name), pct:0, err:"", file:file };
    var k=String(id);
    (_atUp[k]=_atUp[k]||[]).push(rec);
    _rerender();

    var img=(_attKind(file)==="image");
    var prep = (img && typeof compressImage==="function")
      ? Promise.resolve(compressImage(file)).catch(function(){ return null; })
      : Promise.resolve(null);
    var saving=false;

    prep.then(function(small){
      var body = small || file;
      var type = small ? "image/jpeg" : String(file.type||"");
      var ext  = small ? "jpg" : (_attExt(file.name) || String(type.split("/")[1]||"bin"));
      var path = _attPath(id, ext);
      var task = st.ref(path).put(body, type ? { contentType:type } : undefined);
      try{
        task.on("state_changed", function(sn){
          var p = (sn && sn.totalBytes) ? Math.round((sn.bytesTransferred/sn.totalBytes)*100) : 0;
          rec.pct=p;
          var el=document.getElementById("st-atp-"+rec.id);
          if(el) el.textContent=p+"٪";
        });
      }catch(e){}
      return task.then(function(snap){
        return snap.ref.getDownloadURL().then(function(url){
          return _attEntry({ url:url, path:path, name:file.name, type:type||file.type,
                             size:(body&&body.size)||file.size, by:_me(), byName:_myName() });
        });
      });
    }).then(function(entry){
      if(!entry || !entry.url) throw new Error("no-url");
      var u=_union(entry);
      if(!u) throw new Error("no-arrayUnion");
      saving=true;
      return _update(id, { attachments:u }, "أُرفق "+entry.name).then(function(){
        _attDrop(id, rec.id);
        _rerender();
        try{ logAudit("staff_task_attach", (t.title||id)+" — "+entry.name); }catch(e){}
      });
    }).catch(function(e){
      console.warn("staff-tasks attach failed:", e);
      rec.pct=0;
      rec.err = saving ? "رُفع الملفُّ ولم يُسجَّل — أعِد المحاولة" : "تعذّر الرفع";
      if(!saving) _t("تعذّر رفع المرفق","warn");   // و`_update` تقول عطلَها بنفسها
      _rerender();
    });
  }

  /* إعادةُ محاولةٍ لملفٍّ لم يُرفع — من جسمه الباقي في الذاكرة. */
  function retryAtt(id, recId){
    var r=_attPending(id).filter(function(x){ return x.id===recId; })[0];
    if(!r || !r.file) return;
    _attDrop(id, recId);
    _uploadAtt(id, r.file);
  }
  function dismissAtt(id, recId){ _attDrop(id, recId); _rerender(); }

  /* الحذف: تُنزع القيدةُ بـ`arrayRemove` على القيمة نفسِها — لا بكتابة المصفوفة
     ناقصةً، فتلك تمحو مرفقاً رفعه زميلٌ في الأثناء. ثمّ يُحذف الجسمُ من Storage
     **بعد** نجاح الوثيقة وبلا تعليقِ النتيجة عليه: ملفٌّ يتيمٌ يكلّف مساحةً،
     وقيدةٌ بلا ملفٍّ تكلّف رابطاً مكسوراً أمام الناس. */
  function dropAttachment(id, url){
    var t=byId(id); if(!t) return;
    var a=_attList(t).filter(function(x){ return String(x.url)===String(url); })[0];
    if(!a){ _t("المرفقُ غيرُ موجود","warn"); return; }
    if(!_canDropAtt(t, a, _me(), _myRole())){ _t("حذفُ المرفق لمَن رفعه أو لمُنشئ المهمّة","warn"); return; }
    if(!window.confirm("حذفُ المرفق «"+(a.name||"")+"» نهائياً؟\n\nمتابعة؟")) return;
    var rm=_arrRemove(a);
    if(!rm){ _t("تعذّر الحذف","warn"); return; }
    var patch={ attachments:rm };
    /* ولا يختفي بصمت: سطرٌ في الملاحظات يقول مَن حذف وماذا — كسطرِ الإضافة
       والإخراج. مرفقٌ يزول بلا أثرٍ يجعل المهمّةَ سجلّاً لا يُوثق به. */
    var u=_union(_sysEntry("حذف المرفق «"+(a.name||"")+"»."));
    if(u) patch.comments=u;
    _update(id, patch, "حُذف المرفق").then(function(){
      try{ var st=_st(); if(st && a.path) st.ref(a.path).delete().catch(function(){}); }catch(e){}
      try{ logAudit("staff_task_attach_drop", (t.title||id)+" — "+(a.name||"")); }catch(e){}
    }).catch(function(){});
  }

  /* إضافةُ مشارك — يملكها كلُّ طرف، وتُصاحبها مصارحةٌ صريحة.
     المُضافُ سيقرأ المحادثةَ من أوّلها، فيُنبَّه المُضيفُ قبل الفعل لا بعدَه. */
  function shareTask(id){
    var t=byId(id); if(!t) return;
    var sel=document.getElementById("st-share-"+id);
    if(!sel) return;
    var who=String(sel.value||"");
    if(!who){ _t("اختر موظفاً","warn"); return; }
    if(!_canShare(t,_me(),_myRole())){ _t("إضافةُ مشاركٍ لأطراف المهمّة","warn"); return; }
    var patch=_sharePatch(t, who, _me(), _myRole());
    if(!patch){ _t("مشاركٌ أصلاً","warn"); return; }
    if(!window.confirm("سيطّلع "+_nameOf(who)+" على كامل تفاصيل المهمّة والمحادثة السابقة.\n\nمتابعة؟")) return;
    var u=_cmtUnion(_sysEntry("أضاف "+_nameOf(who)+" إلى المهمّة."));
    if(u) patch.comments=u;
    _update(id, patch, "أُضيف "+_nameOf(who));
    try{ logAudit("staff_task_shared", (t.title||id)+" → "+_nameOf(who)); }catch(e){}
  }

  /* إخراجُ مَن أُضيف — صمّامُ المُنشئ في مقابل فتحِ الإضافة لكلّ طرف.
     ولا يُخفى: يُكتب سطرُه في الملاحظات كما تُكتب الإضافة، فيعرف مَن أضافه أنّه
     أُخرج ولا يبحث عن اسمٍ اختفى من القائمة بلا خبر. */
  function unshareTask(id, who){
    var t=byId(id); if(!t) return;
    var patch=_unsharePatch(t, who, _me(), _myRole());
    if(!patch){ _t("الإخراجُ لمُنشئ المهمّة، ولا يطال مُنشئَها ولا المكلَّفَ بها","warn"); return; }
    if(!window.confirm("إخراجُ "+_nameOf(who)+" من المهمّة — لن يراها ولا محادثتَها بعد الآن.\n\nمتابعة؟")) return;
    var u=_cmtUnion(_sysEntry("أخرج "+_nameOf(who)+" من المهمّة."));
    if(u) patch.comments=u;
    _update(id, patch, "أُخرج "+_nameOf(who));
    try{ logAudit("staff_task_unshared", (t.title||id)+" ⇐ "+_nameOf(who)); }catch(e){}
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
  /* اختيارُ المكلَّف يُعيد رسمَ الشاشة (زرُّ الإرسال يحمل اسمَه)، وما كُتب في سطر
     المهمّة يعيش في الـDOM لا في الحالة — فيُحفَظ ويُعاد، وإلا محا الاختيارُ عنوانَ
     المهمّة الذي كتبه المدير قبل قليل. */
  function draftPick(v){
    _draftTo=String(v||"");
    var el=document.getElementById("st-quick-input");
    var txt=el ? String(el.value||"") : "";
    _rerender();
    var e2=document.getElementById("st-quick-input");
    if(e2 && txt) e2.value=txt;
  }
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
      /* منتقي الموظف: خانةُ كتابةٍ وقائمةٌ عائمةٌ تحتها. الحقلُ `.form-input` من
         المنصّة، وما هنا تخطيطُ الغلاف والقائمة وحدَه. */
      '#page-staff-tasks .st-up{position:relative}'+
      '#page-staff-tasks .st-up-in{width:100%;padding-inline-end:30px}'+
      '#page-staff-tasks .st-up-in.has{font-weight:700}'+
      '#page-staff-tasks .st-up-x{position:absolute;inset-inline-end:6px;top:50%;transform:translateY(-50%);'+
        'background:none;border:0;padding:2px;cursor:pointer;color:var(--muted);display:flex;line-height:0}'+
      '#page-staff-tasks .st-up-x:hover{color:var(--danger)}'+
      '#page-staff-tasks .st-up-list{position:absolute;z-index:40;inset-inline:0;top:calc(100% + 4px);'+
        'max-height:300px;overflow-y:auto;background:var(--surface);border:1px solid var(--border);'+
        'border-radius:12px;box-shadow:0 10px 26px rgba(0,0,0,.16);padding:5px}'+
      '#page-staff-tasks .st-up-row{display:flex;flex-direction:column;gap:2px;width:100%;text-align:start;'+
        'background:none;border:0;border-radius:9px;padding:8px 10px;cursor:pointer;font:inherit;color:var(--text)}'+
      '#page-staff-tasks .st-up-row:hover,#page-staff-tasks .st-up-row:focus-visible{background:var(--surface2);outline:none}'+
      '#page-staff-tasks .st-up-row.on{background:color-mix(in srgb,var(--primary) 10%,var(--surface))}'+
      '#page-staff-tasks .st-up-row .nm{font-size:13px;font-weight:800;color:var(--primary);'+
        'display:flex;align-items:center;gap:6px;flex-wrap:wrap}'+
      '#page-staff-tasks .st-up-row.none .nm{color:var(--muted)}'+
      '#page-staff-tasks .st-up-row .mt{font-size:11px;color:var(--muted);font-weight:700;padding-inline-start:18px}'+
      '#page-staff-tasks .st-up-empty{font-size:12px;color:var(--muted);padding:12px 10px;text-align:center;line-height:1.7}'+
      '#page-staff-tasks .st-draft{margin-top:12px;display:flex;flex-direction:column;gap:6px}'+
      '#page-staff-tasks .st-drow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;'+
        'background:var(--surface2);border-radius:9px;padding:7px 10px}'+
      '#page-staff-tasks .st-drow .t{flex:1;min-width:150px;font-size:13px;font-weight:600;color:var(--text)}'+
      '#page-staff-tasks .st-drow .form-input,#page-staff-tasks .st-drow .form-select{width:auto;padding:5px 9px;font-size:12px}'+
      /* البطاقة: الشريطُ الجانبيُّ وحدَه يحمل **حالةَ الموعد** — لا لونَ خلفيةٍ ولا
         حدٌّ ملوّن. السببُ أنّ الشاشة قد تحمل عشرين بطاقة، فمساحةٌ ملوّنةٌ في كلٍّ
         منها تُلغي التمييز: حين يصرخ كلُّ شيءٍ لا يُسمع شيء.

         ── واستثناءُ «فيها جديد» (`nw`) مشروطٌ بما يحفظ القاعدةَ نفسَها ──
         هو **قناةٌ أخرى** لا منازعةٌ على الشريط: الشريطُ يبقى للموعد، والجديدُ
         نقطةٌ قبل العنوان ورقاقةٌ تقول ما جدّ وخلفيةٌ بـ٧٪ من `--info`. ولا يخرق
         «لا يصرخ كلُّ شيء» لأنّه **زائلٌ بطبعه**: يخصّ الأقلّيةَ التي تحرّكت،
         ويُطفَأ بمجرّد فتحها. أمّا لونُ الموعد فدائمٌ ما دام الموعدُ قائماً —
         ولو حمل الشريطُ الاثنين لَما عُرف أيُّهما يتكلّم. */
      '#page-staff-tasks .st-card{background:var(--surface);border:1px solid var(--border);'+
        'border-radius:12px;padding:12px 14px;margin-bottom:8px;cursor:pointer;'+
        'border-inline-start:3px solid transparent;transition:border-color .15s,box-shadow .15s}'+
      '#page-staff-tasks .st-card:hover{border-color:var(--primary);box-shadow:var(--shadow)}'+
      '#page-staff-tasks .st-card.late{border-inline-start-color:var(--danger)}'+
      '#page-staff-tasks .st-card.due{border-inline-start-color:var(--warn)}'+
      '#page-staff-tasks .st-card.soon{border-inline-start-color:var(--stage-wait-fill)}'+
      '#page-staff-tasks .st-card.returned{border-inline-start-color:var(--ai)}'+
      '#page-staff-tasks .st-card.done{opacity:.6}'+
      '#page-staff-tasks .st-card.nw{background:color-mix(in srgb,var(--info) 7%,var(--surface));'+
        'border-color:color-mix(in srgb,var(--info) 32%,var(--border))}'+
      '#page-staff-tasks .st-card.nw .st-ttl{color:var(--info)}'+
      '#page-staff-tasks .st-dot{display:inline-block;width:7px;height:7px;border-radius:50%;'+
        'background:var(--info);margin-inline-end:7px;vertical-align:middle}'+
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
      '#page-staff-tasks .st-pill.nw{color:var(--info);background:color-mix(in srgb,var(--info) 13%,var(--surface));'+
        'border-color:color-mix(in srgb,var(--info) 38%,var(--border))}'+
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
      '#page-staff-tasks .st-who-x{background:none;border:0;padding:0;margin-inline-start:3px;'+
        'cursor:pointer;color:var(--muted);display:inline-flex;opacity:.6}'+
      '#page-staff-tasks .st-who-x:hover{opacity:1;color:var(--danger)}'+
      '#page-staff-tasks .st-note.sys{background:transparent;border:1px dashed var(--border)}'+
      '#page-staff-tasks .st-note.sys .txt{font-size:12px;color:var(--muted)}'+
      /* المرفقات: رقاقةٌ لكلّ ملفّ — مصغَّرةٌ للصورة وأيقونةٌ لغيرها. ولا شبكةَ
         معرضٍ كبيرة: المرفقُ هنا **سندٌ للمهمّة** لا معرضُ صور، والصفُّ المتدفّق
         يبقيه سطراً أو سطرين مهما كثر. */
      '#page-staff-tasks .st-atts{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}'+
      '#page-staff-tasks .st-att{display:inline-flex;align-items:center;gap:8px;max-width:100%;'+
        'background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:6px 10px}'+
      '#page-staff-tasks .st-att .lnk{display:inline-flex;align-items:center;gap:8px;min-width:0;'+
        'text-decoration:none;color:var(--text)}'+
      '#page-staff-tasks .st-att .lnk:hover .nm{color:var(--primary);text-decoration:underline}'+
      '#page-staff-tasks .st-att .nm{font-size:12px;font-weight:700;max-width:210px;overflow:hidden;'+
        'text-overflow:ellipsis;white-space:nowrap}'+
      '#page-staff-tasks .st-att .mt{font-size:11px;color:var(--muted);font-weight:600;white-space:nowrap}'+
      '#page-staff-tasks .st-att .ic svg{width:15px;height:15px}'+
      '#page-staff-tasks .st-att img{width:38px;height:38px;object-fit:cover;border-radius:7px;display:block;'+
        'border:1px solid var(--border)}'+
      '#page-staff-tasks .st-att.pend{border-style:dashed}'+
      '#page-staff-tasks .st-att.err{border-color:color-mix(in srgb,var(--danger) 40%,var(--border))}'+
      '#page-staff-tasks .st-att.err .mt{color:var(--danger)}'+
      '#page-staff-tasks .st-att-x{background:none;border:0;padding:2px;margin-inline-start:2px;'+
        'cursor:pointer;color:var(--muted);display:inline-flex;opacity:.6}'+
      '#page-staff-tasks .st-att-x:hover{opacity:1;color:var(--danger)}'+
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

  /* ما كُتب في حقل الملاحظة ولم يُرسَل يبقى عبر إعادة الرسم.
     الرسمُ يعيد بناءَ الشاشة كلَّها، وأسبابُه ليست من فعل صاحب الحقل وحدَه: تعليقُ
     زميلٍ يصل لقطةً، ومرفقٌ يكتمل رفعُه — فتذهب جملةٌ كُتب نصفُها **بلا خبر**، وهو
     الفقدُ الصامتُ نفسُه الذي عولج في «تمّ الإنجاز». */
  function _cmtDraft(){
    if(!_openId) return null;
    try{
      var el=document.getElementById("st-cmt-"+_openId);
      return el ? String(el.value||"") : null;
    }catch(e){ return null; }
  }
  function _cmtRestore(v){
    if(v==null || !v || !_openId) return;
    try{
      var el=document.getElementById("st-cmt-"+_openId);
      if(el && !el.value) el.value=v;
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
      var keep=_cmtDraft();
      host.innerHTML=_hero()+(_editing ? _editHtml(t) : _detailHtml(t));
      _cmtRestore(keep);
      /* الفتحُ هو القراءة — لا زرَّ «تعليم كمقروء» يُنسى فيبقى اللونُ كذبةً.
         ولا حلقةَ هنا: الكتابةُ تُبثّ فتُعيد الرسمَ، و`_isUnread` صارت false
         فتخرج `_markSeen` من أوّل سطرٍ بلا كتابةٍ ثانية. */
      _markSeen(t);
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
      tb("shared","شارَكوني فيها",s.shared.length)+
      tb("notes","ملاحظاتي",s.notes.length)+
      tb("done","المنجَزة",0)+
      (_isAdmin()? tb("all","كل المهامّ (إدارة)",0) : "")+
    '</div>';
  }

  /* ════════════════════════════════════════════════════════════════════
     منتقي الموظف — قائمةٌ **يُبحَث فيها**

     المشكلة: `<select>` بعشرات الأسماء على iPad عجلةٌ تُلَفُّ بالإصبع بلا كتابة،
     ومن يعرف اسمَ زميله لا يريد أن يمرّ على عشرين غيرِه ليصل إليه.

     القرار: خانةُ كتابةٍ عاديّةٌ لا `<select>`، تحتها قائمةٌ تُعاد كتابتُها **وحدَها**
     مع كل حرف — إعادةُ رسم الشاشة كلِّها مع كل حرفٍ تُفقد المؤشّرَ موضعَه (وتمحو ما
     كُتب في نموذج التحرير أصلاً، فهو في الـDOM لا في الحالة).

     ومصدرُ الحقيقة يبقى حيث كان: حقلٌ خفيٌّ يحمل **اسمَ الدخول** بالمعرّف نفسِه
     الذي كان للـ`<select>` (`st-ed-asg-<id>` · `st-share-<id>`)، فلم يتغيّر سطرٌ
     واحدٌ في `saveEdit` ولا في `shareTask`. والمكتوبُ في الخانة اسمُ العرض — يُقرأ
     ولا يُحفظ. أمّا التكليفُ السريع فحقيقتُه `_draftTo` كما كانت.
     ════════════════════════════════════════════════════════════════════ */
  var _upQ   = {};    // مفتاحُ المنتقي ⇐ نصُّ بحثه الحاليّ
  var _upTmr = {};    // مؤقّتُ الإغلاق بعد فقد التركيز (يُلغى إن وقع اختيار)

  /* المفاتيح: "quick" للتكليف السريع · "ed-<id>" للتحرير · "sh-<id>" لإضافة مشارك */
  function _upValId(key){
    if(key==="quick") return "st-quick-asg";
    var m=/^ed-([\s\S]*)$/.exec(key); if(m) return "st-ed-asg-"+m[1];
    var h=/^sh-([\s\S]*)$/.exec(key); if(h) return "st-share-"+h[1];
    return "st-up-v-"+key;
  }
  function _upUsers(key){
    var h=/^sh-([\s\S]*)$/.exec(key);
    if(h){
      var t=byId(h[1]); if(!t) return [];
      var p=_docParticipants(t);
      return _users().filter(function(u){ return p.indexOf(u.user)===-1; });
    }
    return _users();
  }
  /* سطرُ «بلا تكليف» ليس موظفاً، فلا يُطابَق بالبحث: يظهر والخانةُ فارغةٌ وحدَها.
     ولو ظهر مع كل بحثٍ لَزاحم النتيجةَ الوحيدةَ التي يبحث عنها الكاتب. */
  function _upNone(key){
    if(key==="quick")        return "— ملاحظةٌ لنفسي (بلا تكليف) —";
    if(/^ed-/.test(key))     return "— بلا تكليف (ملاحظةٌ شخصية) —";
    return "";
  }
  function _upCurrent(key){
    if(key==="quick") return _draftTo;
    var el=document.getElementById(_upValId(key));
    return el ? String(el.value||"") : "";
  }
  function _upLabel(key, login){
    if(login) return _nameOf(login);
    return "";
  }

  function _upickHTML(key, cur, ph){
    var k=_q(key), e=_e(key);
    return '<div class="st-up" id="st-up-'+e+'">'+
      '<input type="hidden" id="'+_e(_upValId(key))+'" value="'+_e(cur||"")+'">'+
      '<input type="text" class="form-input st-up-in'+(cur?" has":"")+'" id="st-up-q-'+e+'"'+
        ' autocomplete="off" role="combobox" aria-expanded="false" aria-autocomplete="list"'+
        ' value="'+_e(_upLabel(key,cur))+'" placeholder="'+_e(ph)+'"'+
        ' onfocus="staffTasks.upickOpen(\''+k+'\')"'+
        ' oninput="staffTasks.upickInput(\''+k+'\',this.value)"'+
        ' onkeydown="staffTasks.upickKey(\''+k+'\',event)"'+
        ' onblur="staffTasks.upickBlur(\''+k+'\')">'+
      (cur ? '<button type="button" class="st-up-x" title="مسح الاختيار" aria-label="مسح الاختيار"'+
             ' onmousedown="event.preventDefault()" onclick="staffTasks.upickClear(\''+k+'\')">'+
             _icn("xCircle","ic-sm")+'</button>' : "")+
      '<div class="st-up-list" id="st-up-l-'+e+'" role="listbox" hidden></div>'+
    '</div>';
  }

  function _upickListHTML(key){
    var q=String(_upQ[key]||""), cur=_upCurrent(key), none=_upNone(key);
    var all=_upUsers(key);
    var hits=all.filter(function(u){ return _userMatches(u, q); });
    var head = (none && !q.trim())
      ? '<button type="button" class="st-up-row none'+(cur?"":" on")+'" role="option"'+
        ' onmousedown="event.preventDefault()"'+
        ' onclick="staffTasks.upickChoose(\''+_q(key)+'\',\'\')">'+
        '<span class="nm">'+_icn("edit","ic-sm")+_e(none)+'</span></button>'
      : "";
    if(!all.length)
      return head+'<div class="st-up-empty">لا موظفين في القائمة.</div>';
    if(!hits.length)
      return head+'<div class="st-up-empty">لا موظفَ يطابق «'+_e(q)+'» — جرّب جزءاً من الاسم أو اسمَ الدخول.</div>';
    return head+hits.map(function(u){
      /* اسمُ الدخول في السطر نفسِه: في القائمة اسمان معروضان متطابقان لموظفين
         مختلفين («أشرف عشري» و«اشرف عشري»)، ولا يميّزهما إلا هو. */
      var sub=[u.user||"", u.role||""].filter(function(x){ return !!x; }).join(" · ");
      return '<button type="button" class="st-up-row'+(u.user===cur?" on":"")+'" role="option"'+
          ' aria-selected="'+(u.user===cur?"true":"false")+'"'+
          ' onmousedown="event.preventDefault()"'+
          ' onclick="staffTasks.upickChoose(\''+_q(key)+'\',\''+_q(u.user)+'\')">'+
        '<span class="nm">'+_icn("user","ic-sm")+_e(u.name||u.user)+'</span>'+
        (sub ? '<span class="mt">'+_e(sub)+'</span>' : "")+
      '</button>';
    }).join("");
  }

  function _upickPaint(key){
    var box=document.getElementById("st-up-l-"+key);
    if(box) box.innerHTML=_upickListHTML(key);
  }
  function upickOpen(key){
    clearTimeout(_upTmr[key]);
    var box=document.getElementById("st-up-l-"+key), inp=document.getElementById("st-up-q-"+key);
    if(!box) return;
    /* عند الفتح: البحثُ يبدأ فارغاً فتُعرض القائمةُ كاملة، والاسمُ المعروضُ يُظلَّل
       ليمحوه أوّلُ حرفٍ يُكتب — لا حذفٌ يدويٌّ قبل البحث. */
    _upQ[key]="";
    _upickPaint(key);
    box.hidden=false;
    if(inp){ inp.setAttribute("aria-expanded","true"); try{ inp.select(); }catch(e){} }
  }
  function upickInput(key, val){
    _upQ[key]=String(val||"");
    var box=document.getElementById("st-up-l-"+key);
    if(box && box.hidden) box.hidden=false;
    _upickPaint(key);        // القائمةُ وحدَها تُعاد — فيبقى المؤشّرُ حيث تركه الكاتب
  }
  /* الإغلاقُ بعد فقد التركيز يتأخّر لحظةً: النقرُ على صفٍّ يُفقد التركيزَ **قبل**
     أن يصل `click`، فإغلاقٌ فوريٌّ يبتلع الاختيار. */
  function upickBlur(key){
    clearTimeout(_upTmr[key]);
    _upTmr[key]=setTimeout(function(){ upickClose(key, true); }, 180);
  }
  function upickClose(key, restore){
    var box=document.getElementById("st-up-l-"+key), inp=document.getElementById("st-up-q-"+key);
    if(box) box.hidden=true;
    if(inp) inp.setAttribute("aria-expanded","false");
    _upQ[key]="";
    // ما لم يقع اختيارٌ يعود النصُّ إلى المختار الحاليّ — لا يبقى بحثٌ معلَّقٌ يُقرأ اختياراً
    if(restore && inp) inp.value=_upLabel(key, _upCurrent(key));
  }
  function upickKey(key, ev){
    var k=ev && (ev.key || ev.keyCode);
    if(k==="Escape" || k==="Esc" || k===27){
      clearTimeout(_upTmr[key]); upickClose(key, true);
      var inp=document.getElementById("st-up-q-"+key); if(inp) inp.blur();
      return;
    }
    if(k==="Enter" || k===13){
      if(ev && ev.preventDefault) ev.preventDefault();
      // «اكتب واضغط Enter» — تُؤخذ النتيجةُ الأولى، وهي الوحيدةُ غالباً بعد بحثٍ دقيق
      var hits=_upUsers(key).filter(function(u){ return _userMatches(u, _upQ[key]||""); });
      if(hits.length) upickChoose(key, hits[0].user);
    }
  }
  function upickClear(key){ clearTimeout(_upTmr[key]); _upickApply(key, ""); }
  function upickChoose(key, login){ clearTimeout(_upTmr[key]); _upickApply(key, String(login||"")); }

  function _upickApply(key, login){
    _upQ[key]="";
    if(key==="quick"){ draftPick(login); return; }   // حقيقتُه في الحالة، والرسمُ يتبعها
    var v=document.getElementById(_upValId(key));
    if(v) v.value=login;
    var inp=document.getElementById("st-up-q-"+key);
    if(inp){
      inp.value=_upLabel(key, login);
      if(login) inp.classList.add("has"); else inp.classList.remove("has");
    }
    /* زرُّ المسح يظهر أو يختفي تبعاً للاختيار، وهو خارج القائمة المُعادِ رسمُها —
       فيُبنى الغلافُ كلُّه من جديدٍ بحالته الصحيحة (والقائمةُ فيه مطويّة). ولا يُعاد
       التركيزُ إلى الخانة بعد الاختيار: التركيزُ يفتح القائمةَ من جديد، فيبدو للمختار
       أنّ اختيارَه لم يُسجَّل. */
    var wrap=document.getElementById("st-up-"+key);
    if(wrap && wrap.parentNode){
      var ph=inp ? (inp.getAttribute("placeholder")||"") : "";
      wrap.outerHTML=_upickHTML(key, login, ph);
    }else{
      upickClose(key, false);
    }
  }

  function _quickHtml(){
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
        '<div style="flex:0 1 230px;min-width:190px">'+
          _upickHTML("quick", _draftTo, "المكلَّف — اكتب للبحث")+
        '</div>'+
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
          : _tab==="shared"? ["users","لم يُشركك أحدٌ في مهمّةٍ بعد.<br>ما تُكلَّف به يظهر في «مهامّي»."]
          : _tab==="notes" ? ["edit","لا ملاحظات.<br>اكتب تذكيراً لنفسك من الأعلى بلا اختيار موظف."]
          : _tab==="all"   ? ["checkCircle","لا مهامَّ مفتوحةً في النظام."]
          : ["archive","لا مهامَّ منجَزةً بعد."];
    return '<div class="st-empty">'+_icn(m[0])+m[1]+'</div>';
  }

  function _cardHtml(t, today){
    var st=_dueState(t,today);
    var act=_lastActivity(t), nw=_isUnread(t,_me());
    var cls="st-card "+(t.status==="done"?"done":(t.status==="returned"?"returned":st))+(nw?" nw":"");
    var whoIcon = t.assignedToUser ? "user" : "edit";
    var who = t.assignedToUser
      ? (t.assignedToUser===_me() ? ("من: "+_nameOf(t.createdByUser)) : ("إلى: "+_nameOf(t.assignedToUser)))
      : "ملاحظةٌ شخصية";
    var dueTxt = t.due ? (st==="late" ? ("متأخّرة — "+t.due) : t.due) : "بلا موعد";
    var shared=(Array.isArray(t.shared)&&t.shared.length)
      ? ('<span>'+_icn("users")+(t.shared.length+1)+' مشاركين</span>') : "";
    var cn=(Array.isArray(t.comments)&&t.comments.length)
      ? ('<span>'+_icn("edit")+t.comments.length+'</span>') : "";
    /* المرفقُ يُعلَن على البطاقة: مَن يبحث عن الصورة يعرف أين هي بلا فتحِ عشرِ
       مهامَّ واحدةً واحدة. */
    var an=_attList(t).length ? ('<span>'+_icn("paperclip")+_attList(t).length+'</span>') : "";
    return '<div class="'+cls+'" onclick="staffTasks.open(\''+_q(t.id)+'\')">'+
      '<div class="st-ttl">'+(nw?'<i class="st-dot"></i>':"")+_e(t.title)+'</div>'+
      '<div class="st-meta">'+
        '<span>'+_icn(whoIcon)+_e(who)+'</span>'+
        '<span'+(st==="late"?' class="late"':'')+'>'+_icn(st==="late"?"alertTriangle":"clock")+_e(dueTxt)+'</span>'+
        /* «مردودة» حالةٌ قائمة، و«فيها جديد» ما طرأ — رقاقتان لا واحدة.
           ولا تُخفى الحالةُ خلف الجديد: مهمّةٌ مردودةٌ جدّ فيها تعليقٌ تبقى مردودة.
           والاستثناءُ الوحيد أنّ الجديدَ **هو** الردُّ نفسُه، فتقولهما رقاقةٌ واحدةٌ
           بلون الجديد — وإلا قرأ الموظفُ «رُدّت» و«مردودة» متجاورتين. */
        (nw && !(act.kind==="returned" && t.status==="returned")
          ? '<span class="st-pill nw">'+_e(_unreadLabel(act.kind))+'</span>' : "")+
        (t.priority==="high"?'<span class="st-pill hi">مهمّة</span>':"")+
        (t.status==="returned"?'<span class="st-pill '+(nw&&act.kind==="returned"?"nw":"rt")+'">مردودة</span>':"")+
        shared+cn+an+
      '</div>'+
    '</div>';
  }

  /* شاشةُ التحرير — نموذجٌ واحدٌ صريح، لا تحريرٌ في مكانه على البطاقة.
     التحريرُ في مكانه يُغري بالحفظ الضمنيّ عند فقد التركيز، فيتغيّر نصُّ مهمّةٍ
     يراها غيرُك بلا أن تقصد. هنا: حفظٌ بزرّ، وإلغاءٌ يعيد كلَّ شيء. */
  function _editHtml(t){
    var canAsg=_canReassign(t,_me(),_myRole());
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
            _upickHTML("ed-"+t.id, t.assignedToUser||"", "اكتب اسمَ الموظف للبحث — أو اتركه بلا تكليف")+
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
    var canShare=_canShare(t,me,_myRole());
    var canOut  =_canEditParticipants(t,me,_myRole());
    var parts=_docParticipants(t).map(function(u){
      var own=(u===t.createdByUser), asg=(u===t.assignedToUser);
      return '<span>'+_icn(own?"pin":"user")+_e(_nameOf(u))+(own?" · المُنشئ":"")+
        (canOut && !own && !asg
          ? '<button type="button" class="st-who-x" title="إخراجٌ من المهمّة"'+
            ' aria-label="إخراج '+_e(_nameOf(u))+' من المهمّة"'+
            ' onclick="staffTasks.unshareTask(\''+_q(t.id)+'\',\''+_q(u)+'\')">'+
            _icn("xCircle","ic-sm")+'</button>'
          : "")+'</span>';
    }).join("");
    var cmts=(Array.isArray(t.comments)?t.comments:[]).slice().sort(function(a,b){
      return String(a.at||"")<String(b.at||"") ? -1 : 1;
    }).map(function(c){
      return '<div class="st-note'+(c&&c.sys?" sys":"")+'"><div class="who">'+_e(c.name||c.user)+' · '+
             _e(String(c.at||"").slice(0,16).replace("T"," "))+'</div>'+
             '<div class="txt">'+_e(c.text)+'</div></div>';
    }).join("") || '<div class="st-hint">لا ملاحظاتٍ بعد.</div>';

    var shareCands=_upUsers("sh-"+t.id);

    var canAtt=_canAttach(t,me,_myRole());
    /* المرفوعُ فعلاً ثمّ ما هو قيدَ الرفع الآن — في صفٍّ واحدٍ لا صفّين: ما يرفعه
       المستخدمُ الآن يظهر مكانَه الذي سيستقرّ فيه، فلا يقفز من قائمةٍ إلى أخرى. */
    var attRows=_attList(t).map(function(a){
      var k=_attKind(a), canX=_canDropAtt(t,a,me,_myRole());
      return '<div class="st-att">'+
        '<a class="lnk" href="'+_e(a.url)+'" target="_blank" rel="noopener noreferrer">'+
          (k==="image"
            ? '<img src="'+_e(a.url)+'" alt="'+_e(a.name)+'" loading="lazy">'
            : _icn(_attIcon(a)))+
          '<span class="nm">'+_e(a.name)+'</span>'+
          '<span class="mt">'+_e(a.byName||_nameOf(a.by))+
            (a.size?(' · '+_e(_fmtBytes(a.size))):"")+'</span>'+
        '</a>'+
        (canX
          ? '<button type="button" class="st-att-x" title="حذفُ المرفق"'+
            ' aria-label="حذف المرفق '+_e(a.name)+'"'+
            ' onclick="staffTasks.dropAttachment(\''+_q(t.id)+'\',\''+_q(a.url)+'\')">'+
            _icn("trash","ic-sm")+'</button>'
          : "")+
      '</div>';
    }).join("")+
    _attPending(t.id).map(function(r){
      return '<div class="st-att pend'+(r.err?" err":"")+'">'+
        _icn(r.err?"alertTriangle":"paperclip")+
        '<span class="nm">'+_e(r.name)+'</span>'+
        (r.err
          ? '<span class="mt">'+_e(r.err)+'</span>'+
            '<button type="button" class="st-att-x" title="إعادةُ المحاولة" aria-label="إعادة رفع '+_e(r.name)+'"'+
              ' onclick="staffTasks.retryAtt(\''+_q(t.id)+'\',\''+_q(r.id)+'\')">'+_icn("repeat","ic-sm")+'</button>'+
            '<button type="button" class="st-att-x" title="إسقاطُ المرفق" aria-label="إسقاط '+_e(r.name)+'"'+
              ' onclick="staffTasks.dismissAtt(\''+_q(t.id)+'\',\''+_q(r.id)+'\')">'+_icn("xCircle","ic-sm")+'</button>'
          : '<span class="mt" id="st-atp-'+_e(r.id)+'">'+_e(r.pct+"٪")+'</span>')+
      '</div>';
    }).join("");

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
      (canShare && shareCands.length
        ? '<div class="st-row">'+
            '<div style="flex:0 1 240px;min-width:190px">'+
              _upickHTML("sh-"+t.id, "", "إضافة موظف — اكتب للبحث")+
            '</div>'+
            '<button class="btn btn-ghost" onclick="staffTasks.shareTask(\''+_q(t.id)+'\')">إضافة</button>'+
          '</div>'
        : "")+
      '<div class="st-sec">'+_icn("paperclip")+'المرفقات</div>'+
      (attRows
        ? ('<div class="st-atts">'+attRows+'</div>')
        : '<div class="st-hint">لا مرفقاتٍ بعد.</div>')+
      (canAtt
        ? '<div class="st-row" style="margin-top:9px">'+
            '<button class="btn btn-ghost" onclick="staffTasks.pickAttachment(\''+_q(t.id)+'\')">'+
              _icn("paperclip")+'إرفاق ملف</button>'+
            '<button class="btn btn-ghost" onclick="staffTasks.pickAttachment(\''+_q(t.id)+'\',true)">'+
              _icn("camera")+'صورة</button>'+
            '<span class="st-hint" style="margin:0">صورٌ · PDF · مستندات — حتى '+ATT_MAX+' مرفقاتٍ للمهمّة.</span>'+
          '</div>'
        : "")+
      '<div class="st-sec">'+_icn("edit")+'الملاحظات</div>'+cmts+
      '<div class="st-row" style="margin-top:9px">'+
        '<input type="text" class="form-input st-grow" id="st-cmt-'+_e(t.id)+'" placeholder="اكتب ملاحظة ثمّ Enter…" '+
          'onkeydown="staffTasks.cmtKey(event,\''+_q(t.id)+'\')">'+
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
    addComment:addComment, cmtKey:cmtKey, shareTask:shareTask, unshareTask:unshareTask,
    pickAttachment:pickAttachment, dropAttachment:dropAttachment,
    retryAtt:retryAtt, dismissAtt:dismissAtt,
    removeTask:removeTask,
    draftPick:draftPick, draftAdd:draftAdd, draftKey:draftKey, draftPaste:draftPaste, draftDrop:draftDrop,
    upickOpen:upickOpen, upickInput:upickInput, upickKey:upickKey, upickBlur:upickBlur,
    upickChoose:upickChoose, upickClear:upickClear,
    draftDue:draftDue, draftPrio:draftPrio, draftDueAll:draftDueAll,
    draftClear:draftClear, sendDraft:sendDraft,
    // دوالٌّ نقيّة مكشوفةٌ لفحوص hail-tests (بلا متصفّح)
    _parseBulk:_parseBulk, _participantsOf:_participantsOf, _canSee:_canSee,
    _normAr:_normAr, _userMatches:_userMatches,
    _msVal:_msVal, _lastActivity:_lastActivity, _seenMs:_seenMs, _isUnread:_isUnread,
    _unreadLabel:_unreadLabel,
    _canEditParticipants:_canEditParticipants, _canShare:_canShare,
    _docParticipants:_docParticipants, _sharePatch:_sharePatch, _unsharePatch:_unsharePatch,
    _dueState:_dueState, _isOverdue:_isOverdue,
    _canEdit:_canEdit, _canReassign:_canReassign, _editPatch:_editPatch, _droppedBy:_droppedBy,
    _attList:_attList, _attKind:_attKind, _attExt:_attExt, _attIcon:_attIcon,
    _attSafeName:_attSafeName, _attPath:_attPath, _attReject:_attReject, _attEntry:_attEntry,
    _fmtBytes:_fmtBytes, _canAttach:_canAttach, _canDropAtt:_canDropAtt,
    _ATT_MAX:ATT_MAX, _ATT_MAX_MB:ATT_MAX_MB, _ATT_IMG_MAX_MB:ATT_IMG_MAX_MB,
    _splitTabs:_splitTabs, _countOpen:_countOpen, _sortTasks:_sortTasks,
    build:MODULE_BUILD
  };
})();
