/* ═══════════════════════════════════════════════════════════════════════════
   نظام هيل — وحدة تقارير المخزون  (inventory-reports.js)

   ملف خارجي مستقل يُحقَن في صفحة #page-inventory-reports، على نمط stocktake.js:
   IIFE يعرض كائناً واحداً window.inventoryReports، ويقرأ خدمات النواة
   (db / INVENTORY_LOG_COLLECTION / _inventoryItems / _catalogItems / esc /
   toast / logAudit / _openPrintWindow / XLSX / فحوص الأدوار / أسماء المستودعات)
   مباشرةً بالاسم — إذ تتشارك كل وسوم <script> الكلاسيكية نفس البيئة المعجمية.

   ── لماذا هذه الوحدة ──
   المخزون كان **يُعرَض ولا يُقرَّر عنه**: تصديرُ «رصيد المخزون» لقطةُ اللحظة وحدَها
   (بلا فترة ولا افتتاحيٍّ ولا ختاميّ)، ومستمعُ سجل الحركات مقصورٌ على آخر ٥٠٠ حركة
   فلا يصلح أساساً لتقريرٍ عن فترة. فما لم يكن للنظام جوابٌ عنه: حركةُ صنفٍ بين
   تاريخين · استهلاكُ مشروع · الراكد · قيمةُ المخزون · مَن سوّى الأرصدة.

   ── الوحدة قراءةٌ فقط ──
   لا تكتب حرفاً واحداً على Firestore. استعلامٌ واحدٌ لكل توليد على سجل الحركات
   بمدى تاريخٍ خاصٍّ بها (حقلٌ واحدٌ فلا يحتاج فهرساً مركّباً)، ولا تمسّ مستمع الـ٥٠٠.

   ── القرارات المحاسبية (وهي ما تحرسه الاختبارات) ──
   • **`_effects` تطابق `recalcInventoryFromLog` حرفاً بحرف** — فتلك هي الدالّة
     المعتمَدة في النظام لإعادة بناء الرصيد من السجل، وأيُّ انحرافٍ عنها يجعل
     التقريرَ يقول رقماً والنظامُ يقول غيرَه:
       in · manual_in →  +qty        |  out      → −qty
       adjust         →  adjustDelta (وإلا +qty — نفسُ افتراض recalc للسجل القديم)
       transfer       →  −qty على itemId **و** +qty على destItemId (طرفان لا طرف)
       direct_use     →  **صفر**
   • **و`direct_use` هي المصيدة**: بندٌ اشتُري وسُلّم للموقع مباشرةً بلا دخول
     المستودع — فهو **صفرٌ في تقارير الرصيد** (لا يُنقِص رصيداً لم يدخله)،
     و**يُحتسَب في تقرير الاستهلاك** (استهلاكٌ حقيقيٌّ على المشروع). أيُّ خلطٍ بين
     الوجهين يُنتج رصيداً كاذباً أو استهلاكاً ناقصاً — ولكلٍّ حارسُ اختبارٍ صريح.
   • **الرصيد الافتتاحي يُبنى بالعكس**: الافتتاحي = الرصيد الحالي − صافي كل حركةٍ
     تاريخها ≥ بداية الفترة (تشمل ما بعد نهايتها). دقيقٌ ما دام السجل كاملاً —
     ولذلك يُعلَن في وجه التقرير عددُ الأصناف التي لها رصيدٌ ولا حركةَ لها.
   • **سعرُ الوحدة: آخر وارد بسعر > 0 ← وثيقة الصنف ← الكتالوج.** وهذا الترتيب
     مقصودٌ ومعاكسٌ للحدس: `unitPrice` على وثيقة الصنف **يُكتب مرّةً عند الإنشاء
     ولا يُحدَّث عند أي استلام**، بينما سندُ الاستلام يكتب **سعر الفاتورة الفعليّ**
     على حركة الوارد. و«مصدر السعر» **عمودٌ ظاهرٌ** فلا يُخفى الاختيار، والأصنافُ
     بلا سعرٍ في أيّ مصدرٍ **تُعدّ وتُعلَن** لا تُصفَّر بصمت.
   • **حدود الفترة بالتوقيت المحلّي لا بـUTC**: السجل يخزّن ISO (UTC) والمستخدم
     يقرأ بتوقيته (+03:00)، فحركةُ الساعة الواحدة صباحاً تسقط في الشهر السابق لو
     قُصَّ النصُّ بـ`slice(0,10)`. الحدود تُحسب لحظتَي منتصف الليل المحلّيتين.
   • **سقفُ قراءةٍ معلَن (READ_CAP)**: إن بلغه الاستعلام ظهر تنبيهٌ بأن الفترة أوسعُ
     من أن تُقرأ كاملةً — رقمٌ ناقصٌ **مُعلَنٌ** خيرٌ من رقمٍ ناقصٍ صامت.

   ── مصدرٌ واحدٌ للأرقام ──
   كل تقريرٍ يُنتج `{cols, rows}`، ومنها **وحدَها** يُرسم الجدولُ ويُبنى ملفُّ Excel
   وتُطبَع الورقةُ الرسمية. فلا يمكن أن يختلف الرقمُ المرسوم عن الرقم المصدَّر.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
  "use strict";

  const MODULE_BUILD = "v18.9.2911";

  const HOST_ID   = "page-inventory-reports";
  const READ_CAP  = 5000;    // سقف الحركات المقروءة لكل توليد — يُعلَن عند بلوغه
  const LOW_DEF   = 5;       // عتبة «منخفض» الافتراضية (نفس عتبة شاشة الرصيد)
  const AC_MIN    = 2;       // أقلُّ عددِ حروفٍ يبدأ به البحث (كما في invAddItemSearch)
  const AC_CAP    = 8;       // سقفُ نتائج المنسدلة — **ويُعلَن الزائدُ عليه** لا يُبتلع

  // أنواع التقارير — المفتاح يدخل الحالة، والاسم يظهر في الشاشة وفي ورقة Excel
  const KINDS = {
    card:        "بطاقة الصنف (كشف حركة)",
    movement:    "حركة المخزون في فترة",
    stale:       "الأصناف الراكدة",
    reorder:     "الحدّ الأدنى والنافد",
    consumption: "الاستهلاك حسب المشروع / المستلم",
    warehouse:   "ملخّص المستودعات والتقييم",
    adjust:      "التسويات والفروقات"
  };

  const TYPE_LABEL = {
    in:"وارد (شراء)", manual_in:"وارد (يدوي)", out:"صادر",
    direct_use:"استخدام مباشر", transfer:"نقل بين مستودعات", adjust:"تسوية رصيد"
  };

  // ── الحالة ──
  let _f = {                         // معايير التقرير
    kind:"movement", from:"", to:"", wh:"", cat:"", docId:"",
    q:"", qLabel:"",                 // نصُّ بحث الصنف والاسمُ المعروضُ للمختار
    threshold:LOW_DEF, staleDays:90, groupBy:"project"
  };
  let _out    = null;                // التقرير المولَّد حالياً {kind,title,cols,rows,...}
  let _sheets = {};                  // كل ما وُلّد في هذه الجلسة: kind → التقرير (لتصدير Excel متعدد الأوراق)
  let _busy   = false;               // حارس ضد النقر المزدوج على «توليد»

  /* ════════════════════════════════════════════════════════════════════
     ١) أغلفة آمنة لخدمات النواة — الوحدة لا تسقط إن غاب واحدٌ منها
     ════════════════════════════════════════════════════════════════════ */

  function _esc(s){
    try{ return esc(s); }
    catch(e){ return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  }
  function _toast(m,t){ try{ toast(m,t); }catch(e){ console.log(m); } }
  function _audit(a,d){ try{ if(typeof logAudit==="function") logAudit(a,d); }catch(e){} }
  function _icn(n,c){ try{ return (typeof _ic==="function") ? _ic(n,c) : ""; }catch(e){ return ""; } }
  // أيقونةٌ عارية (بلا غلاف `.ic`) — لأن `.ast-stat .si svg` و`.ivr-empty svg` يقيسانها مباشرةً
  function _svg(n){ try{ return (typeof _svgIcon==="function") ? _svgIcon(n) : ""; }catch(e){ return ""; } }
  function _num(v){ const n=parseFloat(v); return isNaN(n)?0:n; }
  function _r3(n){ return Math.round(_num(n)*1000)/1000; }
  function _fmt(n){ return _num(n).toLocaleString("en-US",{maximumFractionDigits:3}); }
  function _money(n){ return _num(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}); }
  /* رقمٌ بإشارة — إشارةُ الطرح `−` (U+2212) قبل القيمة المطلقة، نفسُ اصطلاح سجل
     الحركات في `index.html`. والسالبُ الخام `-3` في سياق RTL يُرسم بشارطةٍ ملتصقةٍ
     بالرقم من الجهة الخاطئة، فيبدو الناقصُ زائداً لمن يمرّ سريعاً على البطاقة. */
  function _fmtSign(n){
    const v=_num(n);
    if(v===0) return "0";
    return (v>0?"+":"−")+_fmt(Math.abs(v));
  }
  function _shortDate(iso){
    if(!iso) return "—";
    try{
      const d=new Date(iso);
      if(isNaN(d)) return String(iso).slice(0,16);
      return d.toLocaleDateString("en-GB")+" "+d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
    }catch(e){ return String(iso).slice(0,16); }
  }
  function _dayOnly(iso){
    if(!iso) return "—";
    try{ const d=new Date(iso); return isNaN(d) ? String(iso).slice(0,10) : d.toLocaleDateString("en-GB"); }
    catch(e){ return String(iso).slice(0,10); }
  }
  function _projName(id){
    if(!id) return "";
    if(id==="__OTHER__") return "مشروع يدوي";
    try{ if(typeof _getProjName==="function") return _getProjName(id) || id; }catch(e){}
    return id;
  }
  // أصناف الرصيد الحيّة — بلا الوثائق المدموجة (نفس شرط _inventoryFiltered)
  function _invAll(){
    try{
      const inv = (typeof _inventoryItems!=="undefined" && _inventoryItems) ? _inventoryItems : [];
      return inv.filter(x=>!(x && x.mergedInto));
    }catch(e){ return []; }
  }

  /* ══ هل وصلت لقطةُ الأرصدة؟ ══
     كلُّ حسابٍ في هذه الوحدة يبدأ من الرصيد **الحاليّ** ثم يرجع بالحركات. فلو
     حُسِب قبل وصول أوّل لقطةٍ لـ`global_inventory` كانت الأرصدةُ فارغةً، فتُبنى
     الصفوفُ من السجلّ وحدَه ويخرج **تقريرٌ كاملُ الشكل كاذبُ الأرقام**: افتتاحيٌّ
     سالبٌ وختاميٌّ صفر — بلا رسالةِ خطأٍ في أيّ مكان. (رُصد بهذا الشكل بالضبط في
     أوّل تشغيلٍ لسيناريو ١٣: افتتاحي −15 وختامي 0 بدل 25 و40.)
     نفسُ العلَم الذي تفحصه شاشةُ الرصيد قبل أن ترسم جدولَها. */
  function _invReady(){
    try{ return !!(window._fsLoaded && window._fsLoaded.inventory); }catch(e){ return false; }
  }
  // حالةُ المزامنة — مكوّنُ المنصة نفسُه الذي تعرضه شاشةُ الرصيد
  function _syncHTML(){
    try{ if(typeof _syncLoadingHTML==="function") return _syncLoadingHTML(); }catch(e){}
    return '<div class="ivr-empty"><b>جارٍ مزامنة أرصدة المخزون...</b></div>';
  }
  function _catOf(it){
    try{ if(typeof _invResolvedCat==="function") return _invResolvedCat(it)||""; }catch(e){}
    return (it && it.category) || "";
  }
  function _warehouseNames(){
    try{ if(typeof getWarehouseNames==="function") return getWarehouseNames(); }catch(e){}
    return [...new Set(_invAll().map(i=>(i.warehouseName||"").trim()).filter(Boolean))].sort();
  }
  function _categories(){
    return [...new Set(_invAll().map(_catOf).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),"ar"));
  }
  /* ══ تطبيعُ البحث — دالّةُ المنصة نفسُها ══
     `_catSearchNorm` هي المعتمَدةُ في **كل** بحثٍ في النظام (ألف/همزة · تاء مربوطة ·
     ياء · تشكيل · تسويةُ المسافات). فمن يبحث هنا يبحث كما تعلّم في بقية الشاشات،
     ولا يُخترَع تطبيعٌ ثالث. والبديلُ عند غيابها **يُبقي المسافات** — فالبحثُ
     بالتوكِنات يقوم عليها (تطبيعُ `_norm` أدناه يحذفها، فلا يصلح لهذا). */
  function _snorm(s){
    try{ if(typeof _catSearchNorm==="function") return _catSearchNorm(s); }catch(e){}
    return String(s||"").toLowerCase()
      .replace(/[أإآا]/g,"ا").replace(/ة/g,"ه").replace(/ى/g,"ي")
      .replace(/[ً-ْـ]/g,"")
      .replace(/\s+/g," ").trim();
  }

  /* مطابقةُ صنفٍ باستعلام — **بالتوكِنات بأيّ ترتيب** (نمطُ `_catTokenMatch`):
     «نحاس كابل» تُطابق «كابل نحاس»، والبحثُ يشمل الكودَ والمستودعَ لا الاسمَ وحدَه
     (فالصنفُ الواحد وثيقتان في مستودعين، والمستودعُ هو ما يفرّق بينهما). */
  function _itemMatch(it, q){
    if(!it) return false;
    const nq=_snorm(q);
    if(!nq) return false;                 // بلا استعلامٍ لا مطابقة — المنسدلةُ تبقى مغلقة
    const hay=_snorm([it.itemName, it.itemCode, it.warehouseName].filter(Boolean).join(" "));
    return nq.split(" ").filter(Boolean).every(t=>hay.includes(t));
  }

  /* نتائجُ المنسدلة: مرتّبةٌ بالاسم ثم المستودع، مقصورةٌ على `cap`،
     **ويُعاد عددُ الزائد** ليُعلَن في ذيل المنسدلة — فلا يُظنّ أنّ المعروضَ هو الكلّ. */
  function _pickList(items, q, cap){
    const c = _num(cap)>0 ? _num(cap) : AC_CAP;
    const all = (items||[]).filter(it=>_itemMatch(it,q))
      .sort((a,b)=> String(a.itemName||"").localeCompare(String(b.itemName||""),"ar")
                 || String(a.warehouseName||"").localeCompare(String(b.warehouseName||""),"ar"));
    return { hits: all.slice(0,c), total: all.length, more: Math.max(0, all.length-c) };
  }

  // تطبيع عربي للمطابقة بالاسم (نفس تطبيع stocktake.js)
  function _norm(s){
    return String(s==null?"":s)
      .replace(/[ً-ْٰ]/g,"")
      .replace(/[أإآ]/g,"ا").replace(/ة/g,"ه").replace(/ى/g,"ي")
      .replace(/\s+/g,"").trim().toLowerCase();
  }

  // ── الصلاحية: مَن يرى المخزون يرى تقاريره (نفس بوّابة الجرد) ──
  function canView(){
    try{
      if(typeof isAdmin==="function" && isAdmin()) return true;
      if(typeof isWarehouseManager==="function" && isWarehouseManager()) return true;
      if(typeof isProcurementOfficer==="function" && isProcurementOfficer()) return true;
      if(typeof isFinance==="function" && isFinance()) return true;
      if(typeof isCEO==="function" && isCEO()) return true;
    }catch(e){}
    return false;
  }

  /* ════════════════════════════════════════════════════════════════════
     ٢) الدوالُّ النقيّة — قلبُ الوحدة، ومكشوفةٌ لفحوص hail-tests
     ════════════════════════════════════════════════════════════════════ */

  /* أثرُ حركةٍ واحدةٍ على أرصدة الوثائق — قائمةُ {docId, delta}.
     مطابقةٌ لـ`recalcInventoryFromLog` في index.html: نوعٌ مجهولٌ أو `direct_use`
     يعيد قائمةً فارغة (أثرٌ صفر)، والنقلُ يعيد **طرفين**. */
  function _effects(l){
    if(!l) return [];
    const t = l.type||"", q = _num(l.qty), id = l.itemId||"";
    if(t==="in" || t==="manual_in") return id ? [{docId:id, delta:q}] : [];
    if(t==="out")                   return id ? [{docId:id, delta:-q}] : [];
    if(t==="adjust"){
      if(!id) return [];
      const d = parseFloat(l.adjustDelta);
      return [{docId:id, delta: isNaN(d) ? q : d}];   // السجل القديم بلا adjustDelta يُقرأ موجباً
    }
    if(t==="transfer"){
      const out=[];
      if(id) out.push({docId:id, delta:-q});
      if(l.destItemId) out.push({docId:l.destItemId, delta:q});
      return out;
    }
    return [];   // direct_use: سُلّم للموقع مباشرةً بلا دخول المستودع — أثرُه على الرصيد صفر
  }

  // صافي أثر حركةٍ على وثيقةٍ بعينها
  function _net(l, docId){
    let s=0;
    _effects(l).forEach(e=>{ if(e.docId===docId) s+=e.delta; });
    return _r3(s);
  }

  /* حدود الفترة: لحظتا منتصف الليل **المحلّيتان** بصيغة ISO (UTC) — فتُقارَن
     مباشرةً بحقل `date` المخزَّن، ولا يسقط يومٌ بسبب فرق التوقيت. */
  function _bounds(from, to){
    const f = new Date(String(from)+"T00:00:00");
    const t = new Date(String(to)+"T23:59:59.999");
    if(isNaN(f.getTime()) || isNaN(t.getTime())) return null;
    if(f.getTime() > t.getTime()) return null;
    return { fromISO:f.toISOString(), toISO:t.toISOString() };
  }

  /* الرصيد الافتتاحي لكل وثيقة = الرصيد الحالي − صافي كل حركةٍ منذ بداية الفترة.
     `logs` **كلُّ** ما تاريخُه ≥ بداية الفترة (بلا حدٍّ أعلى) — وهو ما يجعل
     استعلاماً واحداً يخدم الافتتاحيَّ والفترةَ معاً. */
  function _openingMap(items, logs){
    const open={}, since={};
    (logs||[]).forEach(l=>_effects(l).forEach(e=>{ since[e.docId]=(since[e.docId]||0)+e.delta; }));
    (items||[]).forEach(it=>{ open[it.id]=_r3(_num(it.currentQty) - (since[it.id]||0)); });
    // وثيقةٌ تحرّكت في الفترة ولا وجودَ لها في الرصيد الآن (صنفٌ حُذف): رصيدُها الحالي صفر
    Object.keys(since).forEach(k=>{ if(!(k in open)) open[k]=_r3(0 - since[k]); });
    return open;
  }

  /* التجميع بوثيقة (صنف×مستودع): افتتاحي · وارد · صادر · نقل صافي · تسويات · ختامي.
     والنقلُ عمودٌ مستقلٌّ لا يُخلَط بالوارد ولا بالصادر — فهو ليس شراءً ولا استهلاكاً. */
  function _rollup(items, logs, fromISO, toISO){
    const open = _openingMap(items, logs);
    const byId = {}; (items||[]).forEach(it=>{ byId[it.id]=it; });
    const acc  = {};
    const touch = id => acc[id] || (acc[id] = {
      docId:id, item:byId[id]||null, orphan:!byId[id],
      name:"", code:"", unit:"", wh:"", cat:"",
      opening:_num(open[id]), inQty:0, outQty:0, xferNet:0, adjNet:0,
      moves:0, lastMove:""
    });
    (items||[]).forEach(it=>{
      const a=touch(it.id);
      a.name=it.itemName||""; a.code=it.itemCode||"";
      a.unit=it.unit||"";     a.wh=it.warehouseName||"";  a.cat=_catOf(it);
    });
    (logs||[]).forEach(l=>{
      const inPeriod = (l.date>=fromISO && l.date<=toISO);
      _effects(l).forEach(e=>{
        const a=touch(e.docId);
        if(!a.name){                                   // وثيقةٌ محذوفةٌ: هويّتها من السجل
          a.name=l.itemName||""; a.code=l.itemCode||""; a.unit=l.unit||"";
          a.wh = (e.docId===l.destItemId ? (l.toWarehouse||"") : (l.warehouseName||l.fromWarehouse||""));
          a.cat=l.category||"";
        }
        if(!a.lastMove || l.date>a.lastMove) a.lastMove=l.date;
        if(!inPeriod) return;
        a.moves++;
        const t=l.type||"";
        if(t==="in" || t==="manual_in") a.inQty  += e.delta;
        else if(t==="out")              a.outQty += -e.delta;
        else if(t==="adjust")           a.adjNet += e.delta;
        else if(t==="transfer")         a.xferNet += e.delta;
      });
    });
    Object.keys(acc).forEach(k=>{
      const a=acc[k];
      a.inQty=_r3(a.inQty); a.outQty=_r3(a.outQty); a.xferNet=_r3(a.xferNet); a.adjNet=_r3(a.adjNet);
      a.closing = _r3(a.opening + a.inQty - a.outQty + a.xferNet + a.adjNet);
    });
    return acc;
  }

  /* آخرُ سعرِ واردٍ لكل وثيقة (> 0 فقط) — من حركات الوارد داخل النافذة المقروءة. */
  function _lastInPrices(logs){
    const m={};
    (logs||[]).forEach(l=>{
      const t=l.type||"";
      if(t!=="in" && t!=="manual_in") return;
      const p=_num(l.unitPrice);
      if(p<=0 || !l.itemId) return;
      const prev=m[l.itemId];
      if(!prev || String(l.date||"")>prev.date) m[l.itemId]={price:p, date:String(l.date||"")};
    });
    return m;
  }

  // فهرسُ الكتالوج للمطابقة بالكود ثم بالاسم المطبَّع
  function _catalogIndex(){
    const byCode={}, byName={};
    try{
      const cat=(typeof _catalogItems!=="undefined" && _catalogItems) ? _catalogItems : [];
      cat.forEach(c=>{
        const code=String((c&&c.code)||"").trim().toLowerCase();
        if(code && !byCode[code]) byCode[code]=c;
        const nm=_norm(c&&c.name);
        if(nm && !byName[nm]) byName[nm]=c;
      });
    }catch(e){}
    return {byCode, byName};
  }

  /* سعرُ الوحدة ومصدرُه — الترتيب مقصودٌ (انظر ترويسة الملف):
     آخر وارد بسعر > 0  ←  unitPrice على وثيقة الصنف  ←  الكتالوج  ←  لا سعر. */
  function _priceOf(docId, item, lastIn, catIdx){
    const li = lastIn && lastIn[docId];
    if(li && _num(li.price)>0) return {price:_num(li.price), src:"آخر وارد"};
    if(item && _num(item.unitPrice)>0) return {price:_num(item.unitPrice), src:"وثيقة الصنف"};
    if(item && catIdx){
      const code=String(item.itemCode||"").trim().toLowerCase();
      let c = code ? catIdx.byCode[code] : null;
      if(!c) c = catIdx.byName[_norm(item.itemName)];
      if(c && _num(c.unitPrice)>0) return {price:_num(c.unitPrice), src:"الكتالوج"};
    }
    return {price:null, src:"—"};
  }

  // عمرُ السكون بالأيام من تاريخٍ إلى لحظةٍ مرجعية (nowMs)
  function _stale(lastISO, nowMs){
    if(!lastISO) return null;
    const t=new Date(lastISO).getTime();
    if(isNaN(t)) return null;
    return Math.max(0, Math.floor((nowMs - t)/86400000));
  }

  // عددُ أيام الفترة (شاملاً الطرفين) — مقامُ معدّل الاستهلاك
  function _periodDays(fromISO, toISO){
    const a=new Date(fromISO).getTime(), b=new Date(toISO).getTime();
    if(isNaN(a)||isNaN(b)||b<a) return 1;
    return Math.max(1, Math.round((b-a)/86400000));
  }

  /* ════════════════════════════════════════════════════════════════════
     ٣) القراءة من Firestore — استعلامٌ واحدٌ لكل توليد
     ════════════════════════════════════════════════════════════════════ */

  async function _loadLogs(b){
    if(typeof db==="undefined" || !db) throw new Error("لا يوجد اتصال بقاعدة البيانات");
    const snap = await db.collection(INVENTORY_LOG_COLLECTION())
      .where("date", ">=", b.fromISO)
      .orderBy("date", "asc")
      .limit(READ_CAP+1)
      .get();
    let logs = snap.docs.map(d=>({id:d.id, ...d.data()}));
    const capped = logs.length > READ_CAP;
    if(capped) logs = logs.slice(0, READ_CAP);
    return {logs, capped};
  }

  async function _loadStocktakes(b){
    if(typeof db==="undefined" || !db) return [];
    if(typeof STOCKTAKE_COLLECTION!=="function") return [];
    try{
      /* المعتمَدُ وحدَه يُقرأ — **حقلُ مساواةٍ واحدٌ فلا يحتاج فهرساً مركّباً**، وكان
         الاستعلامُ يجلب كلَّ وثائق الجرد ثم يفلتر في الذاكرة فتنمو القراءةُ بلا سبب.
         والتاريخُ يبقى فلترَ ذاكرةٍ لأنه **حقلان** (`appliedAt || createdAt`)، ومدًى
         على أحدهما يُسقط ما يحمل الآخر. */
      const snap = await db.collection(STOCKTAKE_COLLECTION())
        .where("status", "==", "applied").get();
      return snap.docs.map(d=>({id:d.id, ...d.data()}))
        .filter(t=>{
          const d = t.appliedAt || t.createdAt || "";
          return d>=b.fromISO && d<=b.toISO;
        });
    }catch(e){ console.warn("inventory-reports/stocktakes:", e); return []; }
  }

  /* ════════════════════════════════════════════════════════════════════
     ٤) بناء التقارير — كلٌّ منها يعيد {title, cols, rows, stats, caveats}
        ومن `cols`/`rows` **وحدَهما** يُرسم الجدول ويُصدَّر Excel وتُطبع الورقة.
     ════════════════════════════════════════════════════════════════════ */

  // الأصناف بعد فلاتر المستودع والفئة
  function _filteredItems(){
    let items=_invAll();
    if(_f.wh)  items=items.filter(i=>(i.warehouseName||"")===_f.wh);
    if(_f.cat) items=items.filter(i=>_catOf(i)===_f.cat);
    return items;
  }

  function _periodLabel(){
    return _dayOnly(_bounds(_f.from,_f.to).fromISO)+" ← "+_dayOnly(_bounds(_f.from,_f.to).toISO);
  }

  function _capCaveat(capped, caveats){
    if(capped) caveats.push("بلغت القراءةُ سقفَ "+_fmt(READ_CAP)+" حركة — الفترةُ أوسعُ من أن تُقرأ كاملةً، فالأرصدةُ الافتتاحيةُ والمجاميعُ **ناقصة**. ضيِّق الفترة أو المستودع.");
  }

  // ── ١) بطاقة الصنف ──
  function _buildCard(ctx){
    const {logs, capped, b} = ctx;
    const item = _invAll().find(i=>i.id===_f.docId) || null;
    const roll = _rollup(item?[item]:[], logs, b.fromISO, b.toISO)[_f.docId];
    const opening = roll ? roll.opening : 0;

    const mine = logs
      .filter(l=> l.date>=b.fromISO && l.date<=b.toISO && _effects(l).some(e=>e.docId===_f.docId))
      .sort((x,y)=>String(x.date||"").localeCompare(String(y.date||"")));

    let run = opening;
    const rows = mine.map(l=>{
      const d = _net(l, _f.docId);
      run = _r3(run + d);
      const ref = l.relatedPO || l.orderRef || l.grnRef || "";
      const who = l.recipient || l.location || (l.projectId?_projName(l.projectId):"") || "";
      return {
        date:_shortDate(l.date), type:TYPE_LABEL[l.type]||l.type||"—",
        delta:d, balance:run, ref:ref||"—", party:who||"—",
        by:l.performedBy||"—", notes:l.notes||l.reason||""
      };
    });

    const caveats=[];
    _capCaveat(capped, caveats);
    if(!item) caveats.push("الصنفُ المختار لا وثيقةَ رصيدٍ له الآن (محذوف أو مدموج) — الافتتاحيُّ محسوبٌ من رصيدٍ حاليٍّ = صفر.");
    if(!mine.length) caveats.push("لا حركةَ لهذا الصنف داخل الفترة — الافتتاحيُّ والختاميُّ متساويان.");

    return {
      title: KINDS.card + " — " + ((item&&item.itemName) || (roll&&roll.name) || "صنف"),
      subtitle: (item?("المستودع: "+(item.warehouseName||"—")+" · الوحدة: "+(item.unit||"—")):""),
      cols: [
        {k:"date",    l:"التاريخ",       al:"center", w:18},
        {k:"type",    l:"نوع الحركة",    al:"center", w:16},
        {k:"delta",   l:"الكمية",        al:"center", f:"sign", w:12},
        {k:"balance", l:"الرصيد بعدها",  al:"center", f:"num",  w:14},
        {k:"ref",     l:"المرجع",        al:"center", w:16},
        {k:"party",   l:"المستلم/الموقع",al:"center", w:20},
        {k:"by",      l:"المنفّذ",        al:"center", w:16},
        {k:"notes",   l:"ملاحظات",       al:"right",  w:26}
      ],
      rows,
      stats: [
        {v:_fmt(opening),                  l:"رصيد افتتاحي", ic:"package"},
        {v:_fmt(roll?roll.inQty:0),        l:"وارد",    cls:"good", ic:"download"},
        {v:_fmt(roll?roll.outQty:0),       l:"صادر",    cls:"crit", ic:"packageMinus"},
        {v:_fmt(roll?roll.closing:opening),l:"رصيد ختامي", ic:"clipboardCheck"},
        {v:String(rows.length),            l:"عدد الحركات", ic:"activity"}
      ],
      caveats
    };
  }

  // ── ٢) حركة المخزون في فترة ──
  function _buildMovement(ctx){
    const {logs, capped, b} = ctx;
    const items = _filteredItems();
    const acc   = _rollup(items, logs, b.fromISO, b.toISO);
    const wanted = {}; items.forEach(i=>wanted[i.id]=true);

    let orphans=0;
    const list = Object.keys(acc).map(k=>acc[k]).filter(a=>{
      if(wanted[a.docId]) return true;
      if(!a.orphan) return false;
      // وثيقةٌ محذوفةٌ تحرّكت في الفترة — تُدرَج إن طابقت فلترَي المستودع والفئة
      if(!a.moves) return false;
      if(_f.wh  && a.wh  !== _f.wh)  return false;
      if(_f.cat && a.cat !== _f.cat) return false;
      orphans++;
      return true;
    });

    const rows = list
      .sort((x,y)=>String(x.name).localeCompare(String(y.name),"ar") || String(x.wh).localeCompare(String(y.wh),"ar"))
      .map(a=>({
        name:a.name||"—", code:a.code||"—", wh:a.wh||"—", unit:a.unit||"—",
        opening:a.opening, inQty:a.inQty, outQty:a.outQty,
        xferNet:a.xferNet, adjNet:a.adjNet, closing:a.closing
      }));

    const sum = k => _r3(rows.reduce((s,r)=>s+_num(r[k]),0));
    const moved = rows.filter(r=>_num(r.inQty)||_num(r.outQty)||_num(r.xferNet)||_num(r.adjNet)).length;

    const caveats=[];
    _capCaveat(capped, caveats);
    const noLog = items.filter(i=>_num(i.currentQty)!==0 && !(acc[i.id]&&acc[i.id].lastMove)).length;
    if(noLog) caveats.push("تحفّظٌ على الافتتاحيّ: "+_fmt(noLog)+" صنفاً له رصيدٌ ولا حركةَ له داخل الفترة المقروءة — افتتاحيُّه = رصيدُه الحاليُّ نفسُه.");
    if(orphans) caveats.push(_fmt(orphans)+" صنفاً تحرّك في الفترة ولا وثيقةَ رصيدٍ له الآن (محذوف أو مدموج) — أُدرِج بهويّته من السجل.");
    caveats.push("«النقل» عمودٌ مستقلٌّ (± صافي) لأنه ليس شراءً ولا استهلاكاً، و«الاستخدام المباشر» غيرُ محتسَبٍ هنا إطلاقاً (لم يدخل المستودع) — انظر تقرير الاستهلاك.");

    return {
      title: KINDS.movement,
      subtitle: "الفترة: "+_periodLabel()+(_f.wh?(" · المستودع: "+_f.wh):"")+(_f.cat?(" · الفئة: "+_f.cat):""),
      cols: [
        {k:"name",    l:"المادة",        al:"right",  w:28},
        {k:"code",    l:"الكود",         al:"center", f:"code", w:14},
        {k:"wh",      l:"المستودع",      al:"center", w:18},
        {k:"unit",    l:"الوحدة",        al:"center", w:10},
        {k:"opening", l:"افتتاحي",       al:"center", f:"num",  w:12},
        {k:"inQty",   l:"وارد",          al:"center", f:"num",  w:12},
        {k:"outQty",  l:"صادر",          al:"center", f:"num",  w:12},
        {k:"xferNet", l:"نقل (صافي)",    al:"center", f:"sign", w:13},
        {k:"adjNet",  l:"تسويات",        al:"center", f:"sign", w:12},
        {k:"closing", l:"ختامي",         al:"center", f:"num",  w:12}
      ],
      rows,
      stats: [
        {v:String(rows.length),   l:"أصناف", ic:"package"},
        {v:String(moved),         l:"تحرّكت في الفترة", ic:"activity"},
        {v:_fmt(sum("inQty")),    l:"إجمالي الوارد", cls:"good", ic:"download"},
        {v:_fmt(sum("outQty")),   l:"إجمالي الصادر", cls:"crit", ic:"packageMinus"},
        {v:_fmtSign(sum("adjNet")), l:"صافي التسويات", ic:"wrench"}
      ],
      caveats
    };
  }

  // ── ٣) الأصناف الراكدة ──
  function _buildStale(ctx){
    const {logs, capped, b} = ctx;
    const items  = _filteredItems().filter(i=>_num(i.currentQty)>0);
    const acc    = _rollup(items, logs, b.fromISO, b.toISO);
    const lastIn = _lastInPrices(logs);
    const catIdx = _catalogIndex();
    const nowMs  = new Date(b.toISO).getTime();
    let fromLastUpdated = 0, noPrice = 0;

    const rows = items.map(it=>{
      const a   = acc[it.id];
      let src   = "حركة";
      let last  = (a && a.lastMove) || "";
      if(!last){ last = it.lastUpdated || ""; src = "آخر تحديث"; fromLastUpdated++; }
      const age = _stale(last, nowMs);
      const p   = _priceOf(it.id, it, lastIn, catIdx);
      if(p.price==null) noPrice++;
      const qty = _num(it.currentQty);
      return {
        name:it.itemName||"—", code:it.itemCode||"—", wh:it.warehouseName||"—",
        qty, unit:it.unit||"—",
        last: last?_dayOnly(last):"—", ageSrc:src,
        age: age==null?"" : age,
        price: p.price==null?"" : p.price, psrc:p.src,
        value: p.price==null?"" : _r3(qty*p.price)
      };
    }).filter(r=> r.age!=="" && _num(r.age) >= _num(_f.staleDays))
      .sort((x,y)=>_num(y.age)-_num(x.age));

    const frozen = _r3(rows.reduce((s,r)=>s+_num(r.value),0));
    const caveats=[];
    _capCaveat(capped, caveats);
    if(fromLastUpdated) caveats.push(_fmt(fromLastUpdated)+" صنفاً لا حركةَ له داخل الفترة المقروءة — قِيس سكونُه بحقل «آخر تحديث» على وثيقة الرصيد (يتغيّر أيضاً بتعديل البيانات، فهو حدٌّ أدنى للسكون لا رقمٌ قاطع).");
    if(noPrice) caveats.push(_fmt(noPrice)+" صنفاً بلا سعرٍ في أيّ مصدر — قيمتُه فارغةٌ لا صفر، فالقيمةُ المجمَّدةُ أدناه **حدٌّ أدنى**.");

    return {
      title: KINDS.stale,
      subtitle: "لم تتحرّك منذ "+_fmt(_f.staleDays)+" يوماً أو أكثر · حتى "+_dayOnly(b.toISO),
      cols: [
        {k:"name",  l:"المادة",         al:"right",  w:28},
        {k:"code",  l:"الكود",          al:"center", f:"code", w:14},
        {k:"wh",    l:"المستودع",       al:"center", w:18},
        {k:"qty",   l:"الرصيد",         al:"center", f:"num",   w:12},
        {k:"unit",  l:"الوحدة",         al:"center", w:10},
        {k:"last",  l:"آخر حركة",       al:"center", w:14},
        {k:"ageSrc",l:"مصدر التاريخ",   al:"center", f:"pill", w:14},
        {k:"age",   l:"أيام السكون",    al:"center", f:"num",   w:12},
        {k:"price", l:"سعر الوحدة",     al:"center", f:"money", w:13},
        {k:"psrc",  l:"مصدر السعر",     al:"center", f:"pill", w:14},
        {k:"value", l:"القيمة المجمَّدة",al:"center", f:"money", w:15}
      ],
      rows,
      stats: [
        {v:String(rows.length), l:"أصناف راكدة", cls:"warn", ic:"hourglass"},
        {v:_money(frozen),      l:"قيمة مجمَّدة (ر.س)", ic:"banknote"},
        {v:String(noPrice),     l:"بلا سعر", ic:"alertCircle"}
      ],
      caveats
    };
  }

  // ── ٤) الحدّ الأدنى والنافد ──
  function _buildReorder(ctx){
    const {logs, capped, b} = ctx;
    const th    = _num(_f.threshold);
    const items = _filteredItems();
    const acc   = _rollup(items, logs, b.fromISO, b.toISO);
    const days  = _periodDays(b.fromISO, b.toISO);

    const rows = items.filter(i=>_num(i.currentQty) <= th).map(it=>{
      const a    = acc[it.id];
      const used = a ? _num(a.outQty) : 0;                 // الصادرُ وحدَه استهلاكُ مستودع
      const rate = _r3(used/days);
      const qty  = _num(it.currentQty);
      const cover= rate>0 ? Math.floor(qty/rate) : "";
      return {
        name:it.itemName||"—", code:it.itemCode||"—", wh:it.warehouseName||"—",
        qty, unit:it.unit||"—",
        state: qty<=0 ? "نفد" : "منخفض",
        gap:_r3(Math.max(0, th-qty)),
        used, rate, cover
      };
    }).sort((x,y)=>_num(x.qty)-_num(y.qty) || _num(y.rate)-_num(x.rate));

    const out = rows.filter(r=>_num(r.qty)<=0).length;
    const caveats=[];
    _capCaveat(capped, caveats);
    caveats.push("لا يوجد حقلُ «حدٍّ أدنى» لكل صنفٍ في النظام — العتبةُ هنا **عامةٌ مُدخَلة** ("+_fmt(th)+") تُطبَّق على كل الأصناف بلا تمييز.");
    caveats.push("معدّلُ الاستهلاك = الصادرُ في الفترة ÷ "+_fmt(days)+" يوماً. «الاستخدام المباشر» غيرُ محتسَبٍ (لم يُصرَف من المستودع)، والنقلُ كذلك.");

    return {
      title: KINDS.reorder,
      subtitle: "العتبة: ≤ "+_fmt(th)+" · معدّل الاستهلاك من الفترة "+_periodLabel(),
      cols: [
        {k:"name", l:"المادة",              al:"right",  w:28},
        {k:"code", l:"الكود",               al:"center", f:"code", w:14},
        {k:"wh",   l:"المستودع",            al:"center", w:18},
        {k:"state",l:"الحالة",              al:"center", f:"pill", w:10},
        {k:"qty",  l:"الرصيد",              al:"center", f:"num", w:12},
        {k:"unit", l:"الوحدة",              al:"center", w:10},
        {k:"gap",  l:"النقص عن العتبة",     al:"center", f:"num", w:15},
        {k:"used", l:"الصادر في الفترة",    al:"center", f:"num", w:15},
        {k:"rate", l:"استهلاك/يوم",         al:"center", f:"num", w:13},
        {k:"cover",l:"يكفي (يوم)",          al:"center", f:"num", w:12}
      ],
      rows,
      stats: [
        {v:String(out),                l:"نفد",     cls:"crit", ic:"alertCircle"},
        {v:String(rows.length-out),    l:"منخفض",   cls:"warn", ic:"alertTriangle"},
        {v:String(rows.length),        l:"يحتاج إعادة طلب", ic:"cart"}
      ],
      caveats
    };
  }

  // ── ٥) الاستهلاك حسب المشروع / المستلم ──
  function _buildConsumption(ctx){
    const {logs, capped, b} = ctx;
    const lastIn = _lastInPrices(logs);
    const catIdx = _catalogIndex();
    const inv    = _invAll();
    const byId   = {}; inv.forEach(i=>byId[i.id]=i);

    const gKey = l => {
      if(_f.groupBy==="recipient") return (l.recipient||"—");
      if(_f.groupBy==="order")     return (l.orderRef||l.relatedPO||"—");
      return l.projectId ? _projName(l.projectId) : (l.location||"—");
    };

    const map={}; let noPrice=0;
    logs.forEach(l=>{
      if(l.date<b.fromISO || l.date>b.toISO) return;
      const t=l.type||"";
      if(t!=="out" && t!=="direct_use") return;           // direct_use استهلاكٌ حقيقيٌّ — يُحتسَب هنا
      const it = byId[l.itemId]||null;
      if(_f.wh){
        const wh = (it&&it.warehouseName) || l.warehouseName || "";
        if(t==="out" && wh!==_f.wh) return;               // الاستخدام المباشر بلا مستودع — يُستبعَد عند تحديد مستودع
        if(t==="direct_use") return;
      }
      if(_f.cat){
        const c = it ? _catOf(it) : (l.category||"");
        if(c!==_f.cat) return;
      }
      const g=gKey(l), nm=l.itemName||"—", key=g+"\u0000"+nm+"\u0000"+t;
      const p=_priceOf(l.itemId, it, lastIn, catIdx);
      if(!map[key]){
        if(p.price==null) noPrice++;
        map[key]={ grp:g, name:nm, unit:l.unit||"—", kind:TYPE_LABEL[t]||t,
                   qty:0, price:p.price, psrc:p.src, value:p.price==null?"":0, moves:0 };
      }
      const r=map[key];
      r.qty=_r3(r.qty+_num(l.qty)); r.moves++;
      if(r.price!=null) r.value=_r3(r.qty*r.price);
    });

    const rows = Object.keys(map).map(k=>map[k])
      .sort((x,y)=> String(x.grp).localeCompare(String(y.grp),"ar")
                 || _num(y.value)-_num(x.value)
                 || String(x.name).localeCompare(String(y.name),"ar"));

    const total  = _r3(rows.reduce((s,r)=>s+_num(r.value),0));
    const groups = new Set(rows.map(r=>r.grp)).size;

    const caveats=[];
    _capCaveat(capped, caveats);
    caveats.push("يشمل **الصادر** من المستودع و**الاستخدام المباشر** (بندٌ اشتُري وسُلّم للموقع بلا دخول المستودع) — فهو استهلاكٌ على المشروع وإن لم يمسّ رصيداً.");
    if(_f.wh) caveats.push("عند تحديد مستودع: «الاستخدام المباشر» مُستبعَدٌ كلَّه — لا مستودعَ له أصلاً.");
    if(noPrice) caveats.push(_fmt(noPrice)+" سطراً بلا سعرٍ في أيّ مصدر — قيمتُه فارغةٌ لا صفر، فالإجماليُّ **حدٌّ أدنى**.");

    const gLabel = _f.groupBy==="recipient" ? "المستلم" : (_f.groupBy==="order" ? "أمر الصرف / الطلب" : "المشروع / الموقع");
    return {
      title: KINDS.consumption,
      subtitle: "التجميع بـ"+gLabel+" · الفترة: "+_periodLabel(),
      cols: [
        {k:"grp",  l:gLabel,          al:"right",  w:26},
        {k:"name", l:"المادة",        al:"right",  w:28},
        {k:"kind", l:"النوع",         al:"center", w:15},
        {k:"qty",  l:"الكمية",        al:"center", f:"num",   w:12},
        {k:"unit", l:"الوحدة",        al:"center", w:10},
        {k:"moves",l:"عدد الحركات",   al:"center", f:"num",   w:12},
        {k:"price",l:"سعر الوحدة",    al:"center", f:"money", w:13},
        {k:"psrc", l:"مصدر السعر",    al:"center", f:"pill", w:14},
        {k:"value",l:"القيمة (ر.س)",  al:"center", f:"money", w:15}
      ],
      rows,
      stats: [
        {v:String(groups),      l:gLabel, ic:"folderOpen"},
        {v:String(rows.length), l:"سطور", ic:"scroll"},
        {v:_money(total),       l:"إجمالي القيمة (ر.س)", ic:"banknote"},
        {v:String(noPrice),     l:"بلا سعر", ic:"alertCircle"}
      ],
      caveats
    };
  }

  // ── ٦) ملخّص المستودعات والتقييم ──
  function _buildWarehouse(ctx){
    const {logs, capped, b} = ctx;
    const lastIn = _lastInPrices(logs);
    const catIdx = _catalogIndex();
    const th     = _num(_f.threshold);
    const items  = _filteredItems();
    const acc    = _rollup(items, logs, b.fromISO, b.toISO);

    const map={};
    let noPriceAll=0;
    items.forEach(it=>{
      const wh=it.warehouseName||"—";
      const g = map[wh] || (map[wh]={ wh, items:0, out:0, low:0, value:0, noPrice:0, moved:0 });
      g.items++;
      const qty=_num(it.currentQty);
      if(qty<=0) g.out++; else if(qty<=th) g.low++;
      const p=_priceOf(it.id, it, lastIn, catIdx);
      if(p.price==null){ g.noPrice++; noPriceAll++; } else g.value=_r3(g.value+qty*p.price);
      const a=acc[it.id];
      if(a && a.moves) g.moved++;
    });

    const rows=Object.keys(map).map(k=>map[k])
      .sort((x,y)=>_num(y.value)-_num(x.value) || String(x.wh).localeCompare(String(y.wh),"ar"));

    const total = _r3(rows.reduce((s,r)=>s+_num(r.value),0));
    const caveats=[];
    _capCaveat(capped, caveats);
    caveats.push("لا عمودَ «كمية إجمالية»: الأصنافُ بوحداتٍ مختلفة (قطعة · متر · لتر · طن)، وجمعُها رقمٌ بلا معنى.");
    if(noPriceAll) caveats.push(_fmt(noPriceAll)+" صنفاً بلا سعرٍ في أيّ مصدر — خارج القيمة تماماً، فكلُّ قيمةٍ أدناه **حدٌّ أدنى** لا رقمٌ محاسبيّ.");
    caveats.push("ترتيبُ مصادر السعر: آخر وارد بسعر > 0 ← سعرُ وثيقة الصنف ← الكتالوج. (سعرُ وثيقة الصنف يُكتب مرّةً عند الإنشاء ولا يُحدَّث عند الاستلام، فسعرُ الوارد أطزجُ منه.)");

    return {
      title: KINDS.warehouse,
      subtitle: "أرصدةُ اللحظة · حركةُ الفترة "+_periodLabel()+" · العتبة ≤ "+_fmt(th),
      cols: [
        {k:"wh",     l:"المستودع",           al:"right",  w:26},
        {k:"items",  l:"عدد الأصناف",        al:"center", f:"num",   w:13},
        {k:"moved",  l:"تحرّك في الفترة",    al:"center", f:"num",   w:15},
        {k:"low",    l:"منخفض",              al:"center", f:"num",   w:11},
        {k:"out",    l:"نفد",                al:"center", f:"num",   w:11},
        {k:"noPrice",l:"بلا سعر",            al:"center", f:"num",   w:12},
        {k:"value",  l:"القيمة (ر.س)",       al:"center", f:"money", w:17}
      ],
      rows,
      stats: [
        {v:String(rows.length),                          l:"مستودعات", ic:"warehouse"},
        {v:String(rows.reduce((s,r)=>s+_num(r.items),0)),l:"أصناف", ic:"package"},
        {v:_money(total),                                l:"القيمة الإجمالية (ر.س)", ic:"banknote"},
        {v:String(noPriceAll),                           l:"بلا سعر", cls:"warn", ic:"alertCircle"}
      ],
      caveats
    };
  }

  // ── ٧) التسويات والفروقات ──
  function _buildAdjust(ctx){
    const {logs, capped, b, takes} = ctx;
    const inv={}; _invAll().forEach(i=>inv[i.id]=i);

    const rows = logs.filter(l=>{
      if(l.type!=="adjust") return false;
      if(l.date<b.fromISO || l.date>b.toISO) return false;
      const it=inv[l.itemId]||null;
      if(_f.wh){ const wh=(it&&it.warehouseName)||l.warehouseName||""; if(wh!==_f.wh) return false; }
      if(_f.cat){ const c=it?_catOf(it):(l.category||""); if(c!==_f.cat) return false; }
      return true;
    }).map(l=>{
      const it=inv[l.itemId]||null;
      const d=_net(l, l.itemId||"");
      return {
        date:_shortDate(l.date),
        name:l.itemName||(it&&it.itemName)||"—",
        wh:(it&&it.warehouseName)||l.warehouseName||"—",
        delta:d, unit:l.unit||(it&&it.unit)||"—",
        reason:l.reason||l.notes||"—",
        ref:l.orderRef||l.relatedPO||"—",
        by:l.performedBy||"—"
      };
    }).sort((x,y)=>Math.abs(_num(y.delta))-Math.abs(_num(x.delta)));

    const up   = rows.filter(r=>_num(r.delta)>0).length;
    const down = rows.filter(r=>_num(r.delta)<0).length;
    const absSum = _r3(rows.reduce((s,r)=>s+Math.abs(_num(r.delta)),0));

    const caveats=[];
    _capCaveat(capped, caveats);
    caveats.push("الإشارةُ والكميةُ من `adjustDelta` — مصدرُ الحقيقة نفسُه الذي تعتمده إعادةُ حساب الرصيد. والسجلاتُ القديمةُ بلا `adjustDelta` تُقرأ موجبةً (نفسُ افتراض النظام، فلا يُعاد تفسيرُ الماضي).");
    if((takes||[]).length) caveats.push("وأسفلَ الجدول: عملياتُ الجرد المعتمدةُ في الفترة — مصدرُ التسويات المشروعة.");

    return {
      title: KINDS.adjust,
      subtitle: "الفترة: "+_periodLabel()+(_f.wh?(" · المستودع: "+_f.wh):""),
      cols: [
        {k:"date",  l:"التاريخ",    al:"center", w:18},
        {k:"name",  l:"المادة",     al:"right",  w:28},
        {k:"wh",    l:"المستودع",   al:"center", w:18},
        {k:"delta", l:"التسوية",    al:"center", f:"sign", w:12},
        {k:"unit",  l:"الوحدة",     al:"center", w:10},
        {k:"reason",l:"السبب",      al:"right",  w:30},
        {k:"ref",   l:"المرجع",     al:"center", w:16},
        {k:"by",    l:"المنفّذ",     al:"center", w:18}
      ],
      rows,
      stats: [
        {v:String(rows.length), l:"تسويات", ic:"wrench"},
        {v:String(up),          l:"بالزيادة", cls:"good", ic:"trendingUp"},
        {v:String(down),        l:"بالنقص",   cls:"crit", ic:"trendingDown"},
        {v:_fmt(absSum),        l:"مجموع الفروقات (مطلق)", ic:"activity"},
        {v:String((takes||[]).length), l:"جرد معتمد في الفترة", ic:"clipboardCheck"}
      ],
      caveats,
      extra: _takesTableHTML(takes||[])
    };
  }

  /* جدولُ الجرد المعتمد — يُبنى بنفس مكوّنات المنصة وأصنافها كجدول التقرير أعلاه:
     لا لونٌ مثبَّت ولا أنماطٌ سطرية، فيتبع الوضعَ الداكن معها بلا صيانةٍ ثانية. */
  function _takesTableHTML(takes){
    if(!takes.length) return "";
    const cols=[
      {k:"wh",   l:"المستودع",      al:"right"},
      {k:"date", l:"تاريخ الاعتماد", al:"center"},
      {k:"by",   l:"بدأه",           al:"center"},
      {k:"items",l:"بنود الجرد",     al:"center", f:"num"},
      {k:"adj",  l:"بنود مُسوّاة",    al:"center", f:"num"},
      {k:"net",  l:"صافي الفرق",     al:"center", f:"sign"}
    ];
    const rows=takes.map(t=>{
      const res=(t.results||[]);
      return {
        wh:t.warehouseName||"—", date:_shortDate(t.appliedAt||t.createdAt), by:t.createdBy||"—",
        items:res.length, adj:res.filter(r=>_num(r.delta)!==0).length,
        net:_r3(res.reduce((s,r)=>s+_num(r.delta),0))
      };
    });
    return `<div class="card" style="margin-top:14px;padding:14px 16px">
      <div class="section-label" style="margin-bottom:10px">${_icn("clipboardCheck")} عمليات الجرد المعتمدة في الفترة</div>
      ${_tableHTML({cols, rows})}
    </div>`;
  }

  const BUILDERS = {
    card:_buildCard, movement:_buildMovement, stale:_buildStale, reorder:_buildReorder,
    consumption:_buildConsumption, warehouse:_buildWarehouse, adjust:_buildAdjust
  };

  /* ════════════════════════════════════════════════════════════════════
     ٥) التوليد
     ════════════════════════════════════════════════════════════════════ */

  async function generate(){
    if(_busy) return;
    if(!canView()){ _toast("⚠ لا تملك صلاحية تقارير المخزون","warn"); return; }
    const b=_bounds(_f.from,_f.to);
    if(!b){ _toast("⚠ الفترة غير صالحة — تحقّق من التاريخين","warn"); return; }
    if(_f.kind==="card" && !_f.docId){ _toast("⚠ اختر الصنف أولاً — بطاقة الصنف تلزمها مادةٌ واحدة","warn"); return; }

    /* ── لا تقريرَ قبل وصول لقطة الأرصدة ──
       الرفضُ خيرٌ من توليدٍ صامتٍ خاطئ — نفسُ منطق «سقف القراءة المعلَن» في هذه
       الوحدة: رقمٌ ناقصٌ مُعلَنٌ خيرٌ من رقمٍ ناقصٍ صامت. ولا يُكتَب `_out` ولا
       تُضاف ورقةُ Excel، فلا يبقى في الجلسة أثرٌ لتقريرٍ لم يُحسَب على أرصدة.
       والمزامنةُ تُستدعى قبل الرفض — دالّتُها idempotent بحارسها الخاصّ، وهو نفسُ
       ما يفعله زرُّ التحديث في صفحة سجل الحركات. */
    if(!_invReady()){
      try{ if(typeof startInventorySync==="function") startInventorySync(); }catch(e){}
      _toast("⏳ جارٍ تحميل أرصدة المخزون — أعِد المحاولة بعد لحظة","info");
      render();
      return;
    }

    _busy=true; _paintBusy(true);
    try{
      const {logs, capped} = await _loadLogs(b);
      const takes = (_f.kind==="adjust") ? await _loadStocktakes(b) : [];
      const rep = _withSeq(BUILDERS[_f.kind]({logs, capped, b, takes}));
      rep.kind      = _f.kind;
      rep.kindName  = KINDS[_f.kind];
      rep.params    = _paramsList();
      rep.generated = new Date().toISOString();
      _out=rep; _sheets[_f.kind]=rep;
      _audit("توليد تقرير مخزون", rep.kindName+" — الفترة: "+_f.from+" ← "+_f.to
        +(_f.wh?(" — المستودع: "+_f.wh):"")+" — الأسطر: "+rep.rows.length+(capped?" — بلغ سقف القراءة":""));
      if(!rep.rows.length) _toast("لا نتائج مطابقة لهذه المعايير","info");
      else _toast("✅ وُلّد التقرير — "+rep.rows.length+" سطراً","success");
    }catch(e){
      console.error("inventory-reports/generate:", e);
      _toast("⚠ تعذّر توليد التقرير: "+((e&&e.message)||""),"warn");
    }finally{
      _busy=false; _paintBusy(false); render();
    }
  }

  function _paramsList(){
    const p=[["نوع التقرير",KINDS[_f.kind]],["الفترة",_f.from+" ← "+_f.to]];
    if(_f.wh)  p.push(["المستودع",_f.wh]);
    if(_f.cat) p.push(["الفئة",_f.cat]);
    if(_f.kind==="card"){
      const it=_invAll().find(x=>x.id===_f.docId);
      p.push(["الصنف",(it&&it.itemName)||_f.docId]);
      if(it) p.push(["مستودع الصنف",it.warehouseName||"—"]);
    }
    if(_f.kind==="stale")       p.push(["حدّ السكون (يوم)",String(_f.staleDays)]);
    if(_f.kind==="reorder"||_f.kind==="warehouse") p.push(["العتبة",String(_f.threshold)]);
    if(_f.kind==="consumption") p.push(["التجميع",_f.groupBy==="recipient"?"المستلم":_f.groupBy==="order"?"أمر الصرف":"المشروع/الموقع"]);
    p.push(["وقت التوليد",_shortDate(new Date().toISOString())]);
    p.push(["مولِّد التقرير",(typeof currentUser!=="undefined"&&currentUser&&currentUser.name)||"—"]);
    return p;
  }

  function _paintBusy(on){
    const btn=document.getElementById("invrep-gen");
    if(!btn) return;
    btn.disabled=!!on;
    btn.innerHTML = on ? "⏳ جارٍ التوليد..." : (_icn("barChart")+" توليد التقرير");
  }

  /* ════════════════════════════════════════════════════════════════════
     ٦) الرسم
     ════════════════════════════════════════════════════════════════════ */

  /* ════════ أنماطُ الصفحة — توكِنزُ المنصة وكلاساتُها الجاهزة فقط ════════
     **بلا لونٍ جديدٍ ولا خطٍّ جديد** (نفسُ قاعدة contracts.js و finance-audit.js):
     الأسطحُ والحدودُ من `--surface/--surface2/--border`، والدلالاتُ من
     `--sla-ok/--sla-warn/--sla-crit`، وكلُّ تظليلٍ بـ`color-mix` على التوكِن —
     فيتبع النمطُ الثيمين معاً بلا صيانةِ لونٍ منفصلة. والجدولُ يستعمل `.report-table`
     نفسَها التي تستعملها تقاريرُ المنصة (ولها قواعدُ وضعٍ داكنٍ مكتوبةٌ أصلاً)،
     فلا جدولَ ثانياً يُصان. **والأرقامُ كلُّها مونوسبيس بـtabular-nums و
     direction:ltr** — وهي بصمةُ كلِّ شاشةٍ رقميةٍ في المنصة، وأكبرُ ما كان يُنبئ
     أنّ هذه الصفحة ليست منها.                                                    */
  function _injectCSS(){
    if(document.getElementById("ivr-css")) return;
    const st=document.createElement("style"); st.id="ivr-css";
    st.textContent=[
      "#"+HOST_ID+"{direction:rtl}",
      /* شريطُ المعايير: شبكةٌ تنضغط على الجوال بدل صفٍّ يلتفّ عشوائياً */
      ".ivr-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:10px 12px;align-items:end}",
      ".ivr-fld{min-width:0}",
      ".ivr-fld>label{display:block;font-size:10.5px;font-weight:800;color:var(--muted);margin-bottom:4px;white-space:nowrap}",
      ".ivr-fld>select,.ivr-fld>input{width:100%;font-size:12px}",
      ".ivr-fld.wide{grid-column:span 2}",
      ".ivr-acts{display:flex;gap:8px;align-items:end;grid-column:span 2}",
      /* منسدلةُ منتقي الصنف — بتوكِنز المنصة وظلِّها، فتُقرأ في الثيمين معاً
         (منسدلةُ «إضافة مخزون» تستعمل لوناً مثبَّتاً للتحويم — لا يُنقل هنا) */
      ".ivr-pickwrap{position:relative}",
      ".ivr-ac{position:absolute;top:100%;inset-inline:0;z-index:200;margin-top:3px;"
        +"background:var(--surface);border:1px solid var(--border);border-radius:8px;"
        +"box-shadow:var(--shadow);max-height:236px;overflow-y:auto}",
      ".ivr-ac-item{padding:8px 11px;cursor:pointer;border-bottom:1px solid var(--border);font-size:12.5px}",
      ".ivr-ac-item:last-child{border-bottom:none}",
      ".ivr-ac-item:hover,.ivr-ac-item.on{background:var(--surface2)}",
      ".ivr-ac-sub{font-size:10.5px;color:var(--muted);margin-top:2px}",
      ".ivr-ac-note{padding:7px 11px;font-size:11px;color:var(--muted);background:var(--surface2)}",
      ".ivr-pick-ok{border-color:var(--sla-ok)}",
      ".ivr-acts .btn{height:36px;white-space:nowrap}",
      /* الأرقام — بصمةُ المنصة الرقمية */
      "#"+HOST_ID+" .ast-stat .sv{direction:ltr;unicode-bidi:isolate}",
      ".ivr-num{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;direction:ltr;unicode-bidi:isolate;white-space:nowrap}",
      ".ivr-up{color:var(--sla-ok);font-weight:700}",
      ".ivr-dn{color:var(--sla-crit);font-weight:700}",
      ".ivr-zero{color:var(--muted)}",
      /* الجدول: `.report-table` كما هي، وهذه تُصحّح محاذاةَ الأعمدة الرقمية فقط */
      ".ivr-table td.c,.ivr-table th.c{text-align:center}",
      ".ivr-table td.r{text-align:right;font-weight:600}",
      ".ivr-table th{color:var(--primary)}",
      /* رقاقةٌ صغيرةٌ للحالة ومصدرِ السعر — نفسُ أسلوب `.pi-pill` في جدول البنود */
      ".ivr-pill{display:inline-block;font-size:10px;font-weight:700;border-radius:6px;padding:2px 7px;white-space:nowrap;"
        +"border:1px solid color-mix(in srgb,var(--pc,var(--muted)) 30%,var(--border));"
        +"background:color-mix(in srgb,var(--pc,var(--muted)) 12%,var(--surface));color:var(--pc,var(--muted))}",
      ".ivr-pill.ok{--pc:var(--sla-ok)}.ivr-pill.warn{--pc:var(--sla-warn)}.ivr-pill.crit{--pc:var(--sla-crit)}",
      /* صندوقُ التحفّظات: `.info-box` بتظليل التحذير من التوكِن */
      ".ivr-cav{background:color-mix(in srgb,var(--sla-warn) 9%,var(--surface));"
        +"border:1px solid color-mix(in srgb,var(--sla-warn) 28%,var(--border));color:var(--text);line-height:1.8}",
      ".ivr-cav ul{margin:0;padding-inline-start:17px}",
      ".ivr-cav li+li{margin-top:4px}",
      /* حالةُ الفراغ — دعوةٌ لإجراءٍ لا رسالةُ عدم */
      ".ivr-empty{text-align:center;padding:44px 20px;color:var(--muted)}",
      ".ivr-empty .ic{color:var(--border)}",
      ".ivr-empty svg{width:42px;height:42px}",
      ".ivr-empty b{display:block;color:var(--text);font-size:14px;margin:8px 0 4px}",
      "@media(max-width:640px){.ivr-fld.wide{grid-column:span 1}.ivr-acts{grid-column:1/-1}.ivr-acts .btn{flex:1}}"
    ].join("");
    document.head.appendChild(st);
  }

  // خليّةٌ واحدة — الأرقامُ مونوسبيس، والإشاراتُ بتوكِنات الدلالة لا بألوانٍ مثبَّتة
  function _cell(r, c){
    const v=r[c.k];
    if(v==null || v==="") return '<span class="ivr-zero">—</span>';
    if(c.f==="num")   return '<span class="ivr-num">'+_fmt(v)+'</span>';
    if(c.f==="money") return '<span class="ivr-num">'+_money(v)+'</span>';
    if(c.f==="sign"){
      const n=_num(v);
      if(n===0) return '<span class="ivr-num ivr-zero">0</span>';
      return '<span class="ivr-num '+(n>0?"ivr-up":"ivr-dn")+'">'+(n>0?"+":"−")+_fmt(Math.abs(n))+'</span>';
    }
    if(c.f==="code")  return '<span class="po-code">'+_esc(v)+'</span>';
    if(c.f==="pill")  return '<span class="ivr-pill '+_esc(_pillTone(c.k,v))+'">'+_esc(v)+'</span>';
    return _esc(v);
  }

  // نبرةُ الرقاقة تُشتقّ من معناها — «نفد» أحمرُ لأنه نفد، لا لأن الصفَّ يحتاج لوناً
  function _pillTone(key, v){
    const s=String(v);
    if(key==="state")  return s==="نفد" ? "crit" : "warn";
    if(key==="psrc")   return s==="آخر وارد" ? "ok" : (s==="—" ? "crit" : "");
    if(key==="ageSrc") return s==="حركة" ? "" : "warn";
    return "";
  }

  function _tableHTML(rep){
    if(!rep.rows.length) return _emptyHTML(true);
    const cls=c=>(c.al==="right"?"r":"c");
    const head=rep.cols.map(c=>`<th class="${cls(c)}">${_esc(c.l)}</th>`).join("");
    const body=rep.rows.map(r=>`<tr>`+rep.cols.map(c=>`<td class="${cls(c)}">${_cell(r,c)}</td>`).join("")+`</tr>`).join("");
    return `<div class="report-table-wrap"><table class="report-table ivr-table">
      <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  /* شريطُ الإحصاء — `.ast-stat` كما تستعملها شاشاتُ الأصول والمخزون: أيقونةٌ في
     رقاقةٍ ٣٨px ثم القيمةُ ثم التسمية. وكانت الأيقونةُ ناقصةً فبدت البطاقاتُ
     نصفَ بطاقة. */
  function _statsHTML(rep){
    if(!rep.stats || !rep.stats.length) return "";
    const t=rep.stats.map(s=>
      `<div class="ast-stat ${s.cls||"total"}">
         <span class="si">${_svg(s.ic||"barChart")}</span>
         <div><div class="sv">${_esc(s.v)}</div><div class="sl">${_esc(s.l)}</div></div>
       </div>`).join("");
    return `<div class="ast-stats" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));padding:14px 16px;margin-bottom:0;border-bottom:1px solid var(--border)">${t}</div>`;
  }

  /* التوكيدُ في نصّ التحفّظ يحمل معنى («ناقصة» · «حدٌّ أدنى») فلا يُسطَّح. يُهرَّب
     النصُّ أولاً ثمّ تُحوَّل أزواجُ `**` — فالوسمُ الناتج وسمُنا وحدَنا لا وسمُ البيانات. */
  function _emph(s){
    return _esc(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  }

  function _caveatsHTML(rep){
    if(!rep.caveats || !rep.caveats.length) return "";
    const li=rep.caveats.map(c=>`<li>${_emph(c)}</li>`).join("");
    return `<div class="info-box ivr-cav" style="margin:14px 16px">
      <div class="section-label" style="margin-bottom:6px">حدودُ القراءة وتحفّظاتُها</div>
      <ul>${li}</ul></div>`;
  }

  // فراغٌ يقول ما يُفعَل، لا «لا توجد بيانات»
  function _emptyHTML(filtered){
    return `<div class="ivr-empty">
      <span class="ic">${_svg("package")}</span>
      <b>${filtered?"لا صفوفَ تطابق هذه المعايير":"اختر تقريراً وفترةً"}</b>
      ${filtered?"وسِّع الفترة أو أزِل فلترَ المستودع أو الفئة، ثم ولِّد التقرير مرّةً أخرى."
                :"حدِّد نوعَ التقرير والفترة ثم اضغط «توليد التقرير»."}
    </div>`;
  }

  function _outHTML(){
    // الأرصدةُ لم تصل بعد: حالةُ المزامنة صريحةٌ في مكان المخرَج، والمعاييرُ تبقى
    // قابلةً للتعبئة — فينتظر المستخدمُ لحظةً بدل أن يقرأ أصفاراً يظنّها حقيقة
    if(!_out && !_invReady()) return `<div class="card">${_syncHTML()}</div>`;
    if(!_out) return `<div class="card">${_emptyHTML(false)}</div>`;
    const rep=_out;
    return `<div class="card">
      <div style="padding:14px 16px;border-bottom:1px solid var(--border)">
        <div style="font-weight:800;font-size:15px">${_esc(rep.title)}</div>
        ${rep.subtitle?`<div style="font-size:12px;color:var(--muted);margin-top:3px">${_esc(rep.subtitle)}</div>`:""}
      </div>
      ${_statsHTML(rep)}
      ${_caveatsHTML(rep)}
      ${_tableHTML(rep)}
    </div>${rep.extra||""}`;
  }

  function _filtersHTML(){
    const kindOpts=Object.keys(KINDS).map(k=>`<option value="${k}"${k===_f.kind?" selected":""}>${_esc(KINDS[k])}</option>`).join("");
    const whOpts='<option value="">كل المستودعات</option>'+_warehouseNames()
      .map(w=>`<option value="${_esc(w)}"${w===_f.wh?" selected":""}>${_esc(w)}</option>`).join("");
    const catOpts='<option value="">كل الفئات</option>'+_categories()
      .map(c=>`<option value="${_esc(c)}"${c===_f.cat?" selected":""}>${_esc(c)}</option>`).join("");

    const fld=(label, inner, wide)=>`<div class="ivr-fld${wide?" wide":""}"><label>${label}</label>${inner}</div>`;
    const IR="window.inventoryReports";

    /* منتقي الصنف — لبطاقة الصنف وحدها (الوثيقة = صنف×مستودع).
       بحثٌ بإكمالٍ لا قائمةٌ منسدلةٌ بكل الأصناف: القائمةُ تصير غيرَ عمليةٍ عند
       الآلاف، وهذا أهمُّ تقريرٍ في الصفحة فلا يكون أصعبَ ما يُفتَح. والبحثُ داخل
       `_filteredItems()` فيحترم فلترَي المستودع والفئة القائمين. */
    let itemPicker="";
    if(_f.kind==="card"){
      itemPicker=fld('الصنف <span style="color:var(--danger)">*</span>',
        `<div class="ivr-pickwrap">
           <input class="form-input${_f.docId?" ivr-pick-ok":""}" id="ivr-pick" type="text"
             autocomplete="off" placeholder="ابحث بالاسم أو الكود أو المستودع..."
             value="${_esc(_f.q||"")}" oninput="${IR}._acSearch()" onkeydown="${IR}._acKey(event)">
           <div class="ivr-ac" id="ivr-ac" style="display:none"></div>
         </div>`, true);
    }

    const staleBox = _f.kind==="stale" ? fld("حدّ السكون (يوم)",
      `<select class="form-select" onchange="${IR}._set('staleDays',this.value)">${
        [30,60,90,180,365].map(d=>`<option value="${d}"${_num(_f.staleDays)===d?" selected":""}>${d}</option>`).join("")
      }</select>`) : "";

    const thBox = (_f.kind==="reorder"||_f.kind==="warehouse") ? fld("عتبة «منخفض»",
      `<input class="form-input ivr-num" type="number" min="0" step="0.001" value="${_esc(_f.threshold)}"
        onchange="${IR}._setq('threshold',this.value)">`) : "";

    const grpBox = _f.kind==="consumption" ? fld("التجميع",
      `<select class="form-select" onchange="${IR}._set('groupBy',this.value)">
        <option value="project"${_f.groupBy==="project"?" selected":""}>المشروع / الموقع</option>
        <option value="recipient"${_f.groupBy==="recipient"?" selected":""}>المستلم</option>
        <option value="order"${_f.groupBy==="order"?" selected":""}>أمر الصرف / الطلب</option>
      </select>`) : "";

    return `<div class="card" style="margin-bottom:14px"><div class="card-header">
      <div class="ivr-filters">
        ${fld("نوع التقرير", `<select class="form-select" onchange="${IR}._set('kind',this.value)">${kindOpts}</select>`, true)}
        ${fld("من تاريخ", `<input class="form-input" type="date" value="${_esc(_f.from)}" onchange="${IR}._setq('from',this.value)">`)}
        ${fld("إلى تاريخ", `<input class="form-input" type="date" value="${_esc(_f.to)}" onchange="${IR}._setq('to',this.value)">`)}
        ${fld("المستودع", `<select class="form-select" onchange="${IR}._set('wh',this.value)">${whOpts}</select>`)}
        ${fld("الفئة", `<select class="form-select" onchange="${IR}._set('cat',this.value)">${catOpts}</select>`)}
        ${itemPicker}${staleBox}${thBox}${grpBox}
        <div class="ivr-acts">
          <button class="btn btn-primary btn-sm" id="invrep-gen" onclick="${IR}.generate()">${_icn("barChart")} توليد التقرير</button>
          <button class="btn btn-ghost btn-sm" onclick="${IR}._reset()">مسح المعايير</button>
        </div>
      </div>
    </div></div>`;
  }

  function render(){
    const host=document.getElementById(HOST_ID);
    if(!host) return;
    _injectCSS();
    if(!canView()){
      host.innerHTML=`<div class="card" style="text-align:center;color:var(--muted);padding:40px">🔒 لا تملك صلاحية عرض تقارير المخزون</div>`;
      return;
    }
    if(!_f.from || !_f.to) _defaultPeriod();

    const nSheets=Object.keys(_sheets).length;
    host.innerHTML=`
      <div class="page-hero">
        <div class="page-hero-titles">
          <div class="page-hero-title">${_icn("barChart","ic-lg")} تقارير المخزون</div>
          <div class="page-hero-sub">سبعة تقارير عن فترة — أرصدة وحركة واستهلاك وتقييم وتسويات، بتصدير Excel وPDF</div>
        </div>
        <div class="page-hero-actions">
          <button class="btn btn-sm" onclick="window.inventoryReports.exportExcel()" ${nSheets?"":"disabled"} title="${nSheets?"ورقة لكل تقرير وُلّد في هذه الجلسة":"ولِّد تقريراً أولاً"}>
            ${_icn("sheet")} Excel${nSheets>1?" ("+nSheets+" أوراق)":""}
          </button>
          <button class="btn btn-sm" onclick="window.inventoryReports.exportPDF()" ${_out?"":"disabled"} title="${_out?"طباعة التقرير الحالي على الورقة الرسمية":"ولِّد تقريراً أولاً"}>
            ${_icn("printer")} PDF
          </button>
        </div>
      </div>
      ${_filtersHTML()}
      <div id="ivr-out">${_outHTML()}</div>`;
  }

  /* ══ وصلت لقطةُ الأرصدة والصفحةُ مفتوحة ══
     مستمعُ `global_inventory` كان يُعيد رسمَ شاشة الرصيد وحدَها. فمن يفتح التقارير
     قبل وصول أوّل لقطة يرى «جارٍ مزامنة أرصدة المخزون…» **ولا يتحرّك أبداً**: العلَم
     يرتفع بلا أن يُعيد أحدٌ الرسمَ، فتبقى الشاشةُ معلّقةً حتى يغادرها ويعود — وهذا
     أحدُ أشكال «التقارير لا تظهر». وهو تحديثٌ **جرّاحيّ لصندوق المخرَج وحدَه**: لو
     أعدنا رسمَ الصفحة كلَّها لمحونا ما يكتبه المستخدمُ في منتقي الصنف تلك اللحظةَ
     بالذات. ولا نلمس مخرَجاً مرسوماً (`_out`) — لا يُمحى تقريرٌ لم يُطلب محوُه. */
  function _onInvSnapshot(){
    try{
      const host=document.getElementById(HOST_ID);
      if(!host || !host.classList.contains("active")) return;
      if(_out || !_invReady()) return;
      const box=document.getElementById("ivr-out");
      if(box) box.innerHTML=_outHTML();
    }catch(e){ console.warn("inventory-reports/_onInvSnapshot:", e); }
  }

  function _defaultPeriod(){
    const now=new Date();
    const first=new Date(now.getFullYear(), now.getMonth(), 1);
    _f.from=_isoDay(first); _f.to=_isoDay(now);
  }
  function _isoDay(d){
    const p=n=>String(n).padStart(2,"0");
    return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate());
  }

  /* ════════════════════════════════════════════════════════════════════
     منتقي الصنف — بحثٌ بإكمالٍ لا قائمةٌ بألفِ صنف

     بطاقةُ الصنف تقريرُ الخلافات الأوّل، وأوّلُ خطوةٍ فيه أن تجد الصنف.

     **والقيدُ الحاسم:** `_set` في هذه الوحدة **يُعيد رسمَ الصفحة كلَّها** — فحقلُ
     نصٍّ يُعيد الرسمَ على كل حرفٍ **يفقد التركيزَ ومؤشّرَ الكتابة**، فيصير البحثُ
     غيرَ قابلٍ للاستخدام. ولذلك: النصُّ يُخزَّن في الحالة بلا إعادة رسم، والمنسدلةُ
     تُحدَّث بكتابة `innerHTML` عليها مباشرةً — نفسُ ما تفعله `invAddItemSearch` في
     صفحة «إضافة مخزون». وإعادةُ الرسم مرّةً واحدةً عند **الاختيار** (التركيزُ يغادر
     أصلاً)، ويُستعاد نصُّ الحقل من `_f.qLabel` فلا يبدو الاختيارُ ضائعاً.
     ════════════════════════════════════════════════════════════════════ */

  function _pickLabel(it){
    if(!it) return "";
    return (it.itemName||"—")+(it.itemCode?" ("+it.itemCode+")":"")+" — "+(it.warehouseName||"—");
  }

  function _acSearch(){
    const inp=document.getElementById("ivr-pick"), ac=document.getElementById("ivr-ac");
    if(!inp || !ac) return;
    const q=(inp.value||"").trim();
    _f.q=q;
    // تغيَّر النصُّ عن اسم المختار ⇒ يسقط الاختيار: لا يبقى معرّفٌ لصنفٍ لا يُقرأ اسمُه
    if(_f.docId && q!==_f.qLabel){ _f.docId=""; _f.qLabel=""; inp.classList.remove("ivr-pick-ok"); }
    if(q.length < AC_MIN){ ac.innerHTML=""; ac.style.display="none"; return; }
    const {hits, more} = _pickList(_filteredItems(), q);
    if(!hits.length){
      ac.innerHTML=`<div class="ivr-ac-note">لا صنفَ يطابق «${_esc(q)}» — جرّب كلمةً واحدةً أو الكود</div>`;
      ac.style.display="block"; return;
    }
    ac.innerHTML = hits.map((it,i)=>`
      <div class="ivr-ac-item${i===0?" on":""}" onclick="window.inventoryReports._pick('${_jsqSafe(it.id)}')">
        <b>${_esc(it.itemName||"—")}</b>
        <div class="ivr-ac-sub">${_esc(it.warehouseName||"—")}${it.itemCode?" · "+_esc(it.itemCode):""}
          · الرصيد ${_fmt(it.currentQty)} ${_esc(it.unit||"")}</div>
      </div>`).join("")
      + (more ? `<div class="ivr-ac-note">+${_fmt(more)} نتيجةً أخرى — ضيِّق البحث</div>` : "");
    ac.style.display="block";
  }

  // Enter يختار المطابقةَ الأولى · Escape يُغلق. (لا تنقّلَ بالأسهم — منتقي المنصة
  // نفسُه لا يملكه، فإضافتُه هنا وحدَها تُنشئ سلوكاً لا نظيرَ له في بقية الشاشات.)
  function _acKey(ev){
    if(!ev) return;
    const ac=document.getElementById("ivr-ac");
    if(ev.key==="Escape"){ if(ac){ ac.style.display="none"; } return; }
    if(ev.key!=="Enter") return;
    ev.preventDefault();
    const first=ac && ac.querySelector(".ivr-ac-item");
    if(first) first.click();
  }

  function _pick(id){
    const it=_invAll().find(x=>x.id===id);
    if(!it){ _toast("⚠ لم يُعثر على الصنف — حدّث الصفحة","warn"); return; }
    _f.docId=it.id;
    _f.qLabel=_pickLabel(it);
    _f.q=_f.qLabel;
    render();                            // مرّةً واحدةً، والتركيزُ يغادر الحقلَ أصلاً
  }

  function _jsqSafe(s){
    try{ if(typeof _jsq==="function") return _jsq(s); }catch(e){}
    return String(s==null?"":s).replace(/\\/g,"\\\\").replace(/'/g,"\\'");
  }

  // ── مُعدِّلات الحالة ──
  /* يعيد الرسم — الحقولُ المشروطة (منتقي الصنف · حدُّ السكون · العتبة · التجميع)
     تظهر وتختفي بنوع التقرير، ومنتقي الصنف يتبع فلترَي المستودع والفئة. */
  function _set(k,v){
    _f[k] = (k==="staleDays") ? _num(v) : v;
    render();
  }
  function _setq(k,v){                      // يخزّن بلا إعادة رسم (لا يقطع الكتابة)
    _f[k] = (k==="threshold") ? _num(v) : v;
  }
  function _reset(){
    _f={kind:_f.kind, from:"", to:"", wh:"", cat:"", docId:"", q:"", qLabel:"",
        threshold:LOW_DEF, staleDays:90, groupBy:"project"};
    _defaultPeriod(); _out=null; render();
  }

  /* ════════════════════════════════════════════════════════════════════
     ٧) تصدير Excel — ورقةٌ لكل تقريرٍ وُلّد + ورقةُ المعايير
     ════════════════════════════════════════════════════════════════════ */

  function _sheetRows(rep){
    return rep.rows.map(r=>{
      const o={};
      rep.cols.forEach(c=>{
        const v=r[c.k];
        if(v==null || v==="") o[c.l]="";
        else if(c.f==="num"||c.f==="money"||c.f==="sign") o[c.l]=_num(v);
        else o[c.l]=v;
      });
      return o;
    });
  }

  // اسمُ ورقة Excel: ٣١ حرفاً كحدٍّ أقصى وبلا : \ / ? * [ ]
  function _safeSheetName(s){
    return String(s||"تقرير").replace(/[:\\\/\?\*\[\]]/g,"-").slice(0,31);
  }

  async function exportExcel(){
    if(!await window._needLib(window._ensureXLSX,"Excel")) return;   // عند أوّل تصدير
    const kinds=Object.keys(_sheets);
    if(!kinds.length){ _toast("⚠ ولِّد تقريراً أولاً","warn"); return; }
    if(typeof XLSX==="undefined"){ _toast("⚠ مكتبة Excel غير محمّلة","warn"); return; }
    try{
      const wb=XLSX.utils.book_new();

      // ورقةُ المعايير أولاً — تقريرٌ بلا معاييرَ رقمٌ بلا سياق
      const meta=[];
      kinds.forEach(k=>{
        const rep=_sheets[k];
        meta.push({"التقرير":rep.kindName,"البند":"عدد الأسطر","القيمة":rep.rows.length});
        (rep.params||[]).forEach(([a,v])=>meta.push({"التقرير":rep.kindName,"البند":a,"القيمة":v}));
        (rep.caveats||[]).forEach(c=>meta.push({"التقرير":rep.kindName,"البند":"تحفّظ","القيمة":c}));
        meta.push({"التقرير":"","البند":"","القيمة":""});
      });
      const wsM=XLSX.utils.json_to_sheet(meta);
      wsM["!cols"]=[{wch:34},{wch:22},{wch:90}];
      XLSX.utils.book_append_sheet(wb, wsM, "المعايير والتحفّظات");

      kinds.forEach(k=>{
        const rep=_sheets[k];
        const rows=_sheetRows(rep);
        const ws=XLSX.utils.json_to_sheet(rows.length?rows:[{"لا نتائج":""}]);
        ws["!cols"]=rep.cols.map(c=>({wch:c.w||16}));
        XLSX.utils.book_append_sheet(wb, ws, _safeSheetName(rep.kindName));
      });

      XLSX.writeFile(wb, "تقارير_المخزون_"+new Date().toISOString().slice(0,10)+".xlsx");
      _audit("تصدير تقارير المخزون Excel", kinds.map(k=>KINDS[k]).join(" · ")+" — أوراق: "+kinds.length);
      _toast("✅ تم تصدير "+kinds.length+" ورقة","success");
    }catch(e){
      console.error("inventory-reports/exportExcel:", e);
      _toast("⚠ تعذّر تصدير الملف: "+((e&&e.message)||""),"warn");
    }
  }

  /* ════════════════════════════════════════════════════════════════════
     ٨) تصدير PDF — الورقةُ الرسمية (ترويسة · تذييل · علامة مائية على كل صفحة)

     الصورُ الثلاثُ **تُقرأ من الصفحة** (`img#_lh_*`) لا بمسارٍ نسبيّ: نافذةُ الطباعة
     على iOS مستندُ `blob:` لا أصلَ له فالمسارُ النسبيُّ فيه ميت، والمقروءُ من
     `img.src` مطلقٌ دائماً. ومَن وجدها غيرَ محمَّلةٍ عاد للترويسة النصّية —
     ورقةٌ بلا زخرفٍ خيرٌ من ورقةٍ بمربّعاتٍ مكسورة. (نفس آلية contracts.js،
     مكتوبةٌ هنا مستقلّةً فلا تعتمد الوحدةُ على ترتيب تحميل الوحدات.)
     ════════════════════════════════════════════════════════════════════ */

  function _lhSrc(id){
    try{
      const im=document.getElementById(id);
      if(im && im.src && im.naturalWidth>0) return im.src;
    }catch(e){}
    return "";
  }
  function _lhAssets(){ return {head:_lhSrc("_lh_head_"), foot:_lhSrc("_lh_foot_"), mark:_lhSrc("_lh_mark_")}; }
  function _lhOn(l){ return !!(l && l.head && l.foot); }
  /* ── الورقةُ **طوليّة** (portrait) — والهندسةُ كانت كذلك من أوّل يوم ──
     مقاساتُ الترويسة والتذييل أدناه منقولةٌ حرفياً عن `contracts.js`، وهي محسوبةٌ
     على ورقةٍ **عرضُها ٢١٠مم**: الترويسةُ ٢٠٢٫٥مم والتذييلُ ١٩١٫٨مم والعلامةُ
     المائيةُ تبدأ عند ٤٨٫٩٥مم فتتوسّط الورقة. لكنّ الإعلانَ هنا كان
     `size:A4 landscape` — ورقةً عرضُها ٢٩٧مم. فبقيت الصورُ على أعرضها المحسوب
     للطوليّ ملتصقةً بحافةٍ واحدة، ويبقى نحوُ ٩٥مم بياضاً في الجهة الأخرى،
     والعلامةُ المائيةُ منزاحةٌ عن المركز. **الأرقامُ لم تكن خاطئة، الورقةُ كانت.**
     فتوافق الإعلانُ مع هندسته: `size:A4` (طوليّ) كما في `contracts.js` حرفاً بحرف. */
  function _lhCSS(){
    return '@page{size:A4;margin:3mm 0 11.5mm}'
      +'html,body{margin:0;padding:0}'
      +'.lh{position:absolute;z-index:3}'
      +'.lh img{display:block;width:100%;height:auto}'
      +'.lh-h{left:-2.65mm;top:0;width:202.5mm}'
      +'.lh-f{left:3.72mm;bottom:0;width:191.8mm}'
      +'.lh-m{left:48.95mm;top:89.9mm;width:108.4mm;z-index:0;opacity:.5}'
      +'@media print{.lh{position:fixed}}'
      +'.pg{width:100%;border-collapse:collapse;margin:0;font-size:inherit}'
      +'.pg>thead>tr>td,.pg>tfoot>tr>td,.pg>tbody>tr>td{padding:0;border:0;background:none}'
      +'.pg>tbody>tr>td{padding:0 12mm;position:relative;z-index:1}'
      +'.sp-h{height:35.6mm}.sp-f{height:24.9mm}';
  }
  function _lhWrap(inner, l){
    if(!_lhOn(l)) return inner;
    return '<div class="lh lh-h"><img src="'+_esc(l.head)+'" alt=""></div>'
      +(l.mark?'<div class="lh lh-m"><img src="'+_esc(l.mark)+'" alt=""></div>':'')
      +'<div class="lh lh-f"><img src="'+_esc(l.foot)+'" alt=""></div>'
      +'<table class="pg"><thead><tr><td><div class="sp-h"></div></td></tr></thead>'
      +'<tfoot><tr><td><div class="sp-f"></div></td></tr></tfoot>'
      +'<tbody><tr><td>'+inner+'</td></tr></tbody></table>';
  }

  /* ── أعمدةُ الورقة الطوليّة: نسبٌ صريحةٌ لا عرضٌ يقرّره المحتوى ──
     الطوليُّ يعطي ١٨٦مم بدل ٢٧٣مم، وأعرضُ تقريرٍ أحدَ عشرَ عموداً. وبلا نسبٍ صريحة
     يوزّع المتصفّحُ العرضَ **بحسب أطول محتوى**، فعمودُ «المادة» يبتلع الورقةَ ويخرج
     الباقي عنها — والخارجُ عن الورقة **يُقصّ في الطباعة بلا رسالة**. فالنسبُ تُشتقّ
     من `c.w` نفسِها التي تُبنى منها أعمدةُ Excel: **مصدرٌ واحدٌ للعرض النسبيّ** فلا
     يتّسع عمودٌ في الملفّ ويضيق في الورقة. و`table-layout:fixed` تُلزم المتصفّحَ بها. */
  /* ══ عمودُ «م» — يُضاف **مرّةً واحدة** لا سبعَ مرّات ══
     التقاريرُ السبعةُ تُنتج `{cols, rows}`، ومنها وحدَها يُرسم الجدولُ ويُبنى ملفُّ
     Excel وتُطبَع الورقة. فلو أُضيف الرقمُ في كل بانٍ على حِدة لَكان سبعةَ مواضعَ
     تُنسى إحداها، **ولاختلف الترقيمُ بين الشاشة والملفّ إن رتّب أحدُهما غيرَ ترتيب
     الآخر**. فيُضاف هنا على المخرَج بعد أن يفرغ البانِي من الفرز — فالرقمُ يتبع
     **الترتيبَ المعروض** في المخارج الثلاثة معاً.
     ⛔ ولا يُكتب في `rows` قبل الفرز ولا يُخزَّن: الرقمُ صفةُ العرض لا صفةُ الصنف —
     فالصنفُ نفسُه رقمُه ٣ في تقريرٍ و١٧ في آخر. */
  const SEQ_COL = {k:"_n", l:"م", al:"center", w:5};
  function _withSeq(rep){
    if(!rep || !Array.isArray(rep.cols) || !Array.isArray(rep.rows)) return rep;
    if(rep.cols.length && rep.cols[0].k === SEQ_COL.k) return rep;   // idempotent
    rep.cols = [SEQ_COL].concat(rep.cols);
    rep.rows.forEach(function(r,i){ if(r) r._n = i+1; });
    return rep;
  }

  function _pdfColGroup(cols){
    const list = Array.isArray(cols) ? cols : [];
    const tot  = list.reduce((a,c)=>a+(_num(c&&c.w)||16),0) || 1;
    return "<colgroup>"+list.map(c=>
      '<col style="width:'+(Math.round(((_num(c&&c.w)||16)/tot)*10000)/100)+'%">').join("")+"</colgroup>";
  }

  function _pdfCell(r,c){
    const v=r[c.k];
    if(v==null||v==="") return "—";
    if(c.f==="num")   return _fmt(v);
    if(c.f==="money") return _money(v);
    if(c.f==="sign"){
      const n=_num(v);
      if(n===0) return "0";
      return '<span style="color:'+(n>0?"#166534":"#b91c1c")+';font-weight:700">'+(n>0?"+":"−")+_fmt(Math.abs(n))+'</span>';
    }
    return _esc(v);
  }

  function exportPDF(){
    if(!_out){ _toast("⚠ ولِّد تقريراً أولاً","warn"); return; }
    const rep=_out;
    const l=_lhAssets(), on=_lhOn(l);
    const logo=(document.querySelector('.logo-img')||{}).src||"";

    const head=rep.cols.map(c=>`<th style="text-align:${c.al==="right"?"right":"center"}">${_esc(c.l)}</th>`).join("");
    const body=rep.rows.length
      ? rep.rows.map(r=>`<tr>`+rep.cols.map(c=>`<td style="text-align:${c.al==="right"?"right":"center"}">${_pdfCell(r,c)}</td>`).join("")+`</tr>`).join("")
      : `<tr><td colspan="${rep.cols.length}" style="text-align:center;color:#64748b">لا نتائج مطابقة لهذه المعايير</td></tr>`;

    const stats=(rep.stats||[]).map(s=>`<div class="stat"><div class="sn">${_esc(s.v)}</div><div class="sl">${_esc(s.l)}</div></div>`).join("");
    const params=(rep.params||[]).map(([a,v])=>`<span class="pchip"><b>${_esc(a)}:</b> ${_esc(v)}</span>`).join("");
    const caveats=(rep.caveats||[]).length
      ? `<div class="cav"><div class="cav-t">حدودُ القراءة وتحفّظاتُها</div><ul>${rep.caveats.map(c=>`<li>${_esc(c)}</li>`).join("")}</ul></div>` : "";

    const docHead = on
      ? `<div class="dochead"><div class="dh-t">${_esc(rep.title)}</div><div class="dh-d">${_esc(_shortDate(rep.generated))}</div></div>`
      : `<div class="header"><div class="hr">${logo?`<img src="${_esc(logo)}" class="clogo" alt="">`:""}
           <div><div class="company">شركة المباني السريعة للمقاولات</div><div class="subtitle">${_esc(rep.title)}</div></div></div>
           <div class="dh-d">تاريخ التقرير<br><strong>${_esc(_shortDate(rep.generated))}</strong></div></div>`;

    const inner=`${docHead}
      ${rep.subtitle?`<div class="sub2">${_esc(rep.subtitle)}</div>`:""}
      <div class="params">${params}</div>
      ${stats?`<div class="stats">${stats}</div>`:""}
      ${caveats}
      <table class="tbl${rep.cols.length>=10?" dense":""}">${_pdfColGroup(rep.cols)}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
      <div class="foot">شركة المباني السريعة للمقاولات — تقارير المخزون · ${_esc(rep.kindName)} · ${_esc(String(rep.rows.length))} سطراً</div>`;

    const html=`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${_esc(rep.title)} — شركة المباني السريعة</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A4;margin:12mm}
body{font-family:'Cairo','Tajawal','Segoe UI',Tahoma,sans-serif;direction:rtl;background:#fff;color:#0f172a;font-size:11px}
.header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1b3a6b;padding-bottom:10px;margin-bottom:10px}
.hr{display:flex;align-items:center;gap:12px}
.clogo{width:50px;height:50px;object-fit:contain}
.company{font-size:18px;font-weight:800;color:#1b3a6b}
.subtitle{font-size:12px;color:#64748b;margin-top:2px}
.dochead{display:flex;justify-content:space-between;align-items:center;gap:14px;border-bottom:3px solid #1b3a6b;padding-bottom:8px;margin-bottom:8px}
.dh-t{font-size:16px;font-weight:800;color:#1b3a6b}
.dh-d{font-size:11px;color:#64748b;text-align:left;white-space:nowrap}
.sub2{font-size:11.5px;color:#475569;margin-bottom:8px}
.params{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:9px}
.pchip{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:2px 8px;font-size:10px;color:#334155}
.stats{display:flex;gap:8px;margin-bottom:9px;flex-wrap:wrap}
.stat{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:6px 14px;text-align:center;flex:1;min-width:110px}
.sn{font-size:16px;font-weight:800;color:#1b3a6b}
.sl{font-size:9.5px;color:#64748b}
.cav{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:7px 12px;margin-bottom:9px;font-size:9.5px;color:#78350f;line-height:1.65}
.cav-t{font-weight:800;margin-bottom:3px}
.cav ul{margin:0;padding-inline-start:15px}
.tbl{width:100%;table-layout:fixed;border-collapse:collapse;font-size:10px}
.tbl thead th{background:#1b3a6b;color:#fff;padding:6px 7px;font-weight:700;border:1px solid #1b3a6b;word-break:break-word}
.tbl tbody td{padding:5px 7px;border:1px solid #e2e8f0;word-break:break-word}
/* عشرةُ أعمدةٍ فأكثر على ورقةٍ طوليّة: تكثيفٌ محسوبٌ بدل قصٍّ صامتٍ عند الحافّة */
.tbl.dense{font-size:9px}
.tbl.dense thead th{padding:5px 4px}
.tbl.dense tbody td{padding:4px 4px}
.tbl tbody tr:nth-child(even){background:#f8fafc}
thead{display:table-header-group}
tr{page-break-inside:avoid}
.foot{margin-top:12px;padding-top:7px;border-top:1px solid #e2e8f0;font-size:9px;color:#64748b;text-align:center}
${on?_lhCSS():""}
</style></head><body>${_lhWrap(inner,l)}</body></html>`;

    try{
      let ok=false;
      if(typeof _openPrintWindow==="function") ok=_openPrintWindow(html);
      else { const w=window.open("","_blank"); if(w){ w.document.write(html); w.document.close(); ok=true; } }
      if(!ok){ _toast("⚠ تعذّر فتح نافذة الطباعة","warn"); return; }
      _audit("طباعة تقرير مخزون PDF", rep.kindName+" — الأسطر: "+rep.rows.length+(on?" — الورقة الرسمية":" — ترويسة نصّية"));
    }catch(e){
      console.error("inventory-reports/exportPDF:", e);
      _toast("⚠ تعذّرت الطباعة: "+((e&&e.message)||""),"warn");
    }
  }

  /* ════════════════════════════════════════════════════════════════════
     ٩) الواجهة العامة
     ════════════════════════════════════════════════════════════════════ */

  window.inventoryReports = {
    render, generate, exportExcel, exportPDF, canView, _onInvSnapshot,
    _set, _setq, _reset,
    _acSearch, _acKey, _pick,            // منتقي الصنف — يُنادى من الترميز المرسوم
    // دوالُّ نقيّة — مكشوفةٌ لفحوص hail-tests وسيناريوهات المتصفّح
    _invReady,
    _effects, _net, _bounds, _openingMap, _rollup, _priceOf, _lastInPrices,
    _itemMatch, _pickList, _snorm, _pickLabel,
    _stale, _periodDays, _catalogIndex, _sheetRows, _safeSheetName, _withSeq,
    _state: ()=>({f:{..._f}, out:_out, sheets:Object.keys(_sheets)}),
    KINDS, READ_CAP,
    build: MODULE_BUILD
  };
})();
