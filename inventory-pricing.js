/* ═══════════════════════════════════════════════════════════════════════════
   نظام هيل — وحدة ربط المخزون بأسعار البنود  (inventory-pricing.js)

   محرّكُ ربطٍ وتسعيرٍ نقيّ. يعرض كائناً واحداً `window.inventoryPricing`،
   ويقرأ خدماتِ النواة بالاسم المجرّد (`_catalogItems` · `_inventoryItems` ·
   `_inventoryLog` · `db` · `INVENTORY_COLLECTION` · `toast` · `logAudit` ·
   `currentUser` · فحوص الأدوار) — إذ تتشارك كلُّ وسوم <script> الكلاسيكية
   البيئةَ المعجمية نفسَها.

   ── لماذا هذه الوحدة ──
   وثيقةُ رصيد المخزون تحمل `unitPrice` **يُكتب مرّةً عند الإنشاء ولا يُحدَّث عند
   أيّ استلام**، وكتالوجُ البنود يحمل قائمةَ الأسعار الحيّة — ولا رابطةَ صريحةَ
   بينهما. فشاشةُ الرصيد كانت تعرض كمياتٍ بلا سعرٍ ولا قيمة، ولا جوابَ فيها
   لسؤالٍ بسيط: **«كم تساوي المواد في مستودعٍ بعينه؟»**.

   وكان الأسوأُ أن الرابطةَ **مشقوقةٌ**: الفئةُ تُشتقّ بمطابقةٍ في `index.html`،
   والسعرُ يُشتقّ بمطابقةٍ **أخرى** في `inventory-reports.js` (تطبيعٌ عربيٌّ
   مختلف) — رابطتان لبندٍ واحدٍ قد تشيران إلى بندَي كتالوجٍ مختلفين، فتقول
   الشاشةُ سعراً ويقول التقريرُ غيرَه بلا سطرٍ يفسّر.

   ── القرار: رابطةٌ واحدةٌ سلّمُها معلَنٌ ومُسمّى ──
       ربطٌ يدويٌّ صريح (`catalogItemId`) ← معرّفُ البند ← الكود ← الاسمُ المطبَّع
   وكلُّ درجةٍ تُسمّى في المخرَج (`via`)، فيعرف قارئُ الشاشة **لماذا** رُبط هذا
   البند بذاك. والربطُ اليدويُّ يحسم ما تعجز عنه المطابقةُ التلقائية (اسمٌ
   مختلفٌ · بلا كود) — وهو **حقلٌ يُكتب "" لا يُحذف** عند فكّه: الحذفُ يجعل
   «لم يُربط قطّ» و«فُكَّ ربطُه» حالةً واحدةً في القراءة، وهما قراران مختلفان.

   ── التطبيع متعمَّدٌ أوسعُ ممّا كان ──
   `nameKey` = تطبيعُ `_catSearchNorm` (همزة · تاء مربوطة · ألف مقصورة · تشكيل ·
   تطويل) ثم حذفُ المسافات كلِّها — وهو **جامعٌ** لِما كانت تطابقه المطابقةُ
   القديمة في النواة (`trim().toLowerCase()`) ولِما يطابقه `_norm` في وحدة
   التقارير. فلا يسقط ربطٌ كان قائماً، ويُلتقط ما كان يسقط بهمزةٍ أو مسافة.

   ── سلّمُ السعر (وهو ما تحرسه الاختبارات) ──
       آخرُ واردٍ بسعر > 0  ←  `unitPrice` على وثيقة الصنف  ←  سعرُ بند الكتالوج
   وترتيبُه **مقصودٌ ومعاكسٌ للحدس**: سعرُ الوثيقة يُكتب مرّةً عند الإنشاء ولا
   يُحدَّث عند الاستلام، بينما سندُ الاستلام يكتب سعرَ الفاتورة الفعليّ على حركة
   الوارد — فالوارد أطزجُ من الوثيقة. وهو **نفسُ سلّم `_priceOf` في
   `inventory-reports.js` حرفاً بحرف**؛ ما يختلف بين الشاشة والتقرير هو **مدى
   التاريخ المقروء** لا السلّم (الشاشةُ من سجلّها المحمَّل، والتقريرُ من مدى
   فترته) — ولذلك **يُعلَن مصدرُ السعر في عمودٍ ظاهرٍ** في الوجهين.

   ── و«بلا سعر» ليست صفراً ──
   `price:null` تعني «بلا سعرٍ في أيّ مصدر»: تُعدّ وتُعلَن في وجه الشاشة
   والتقرير، ولا تُحتسب صفراً في القيمة. فكلُّ قيمةٍ معروضةٍ **حدٌّ أدنى مُعلَن**
   لا رقمٌ محاسبيٌّ نهائيّ. صفرٌ صامتٌ في عمود القيمة يُجمَع فيكذب.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
  "use strict";

  const MODULE_BUILD = "v18.9.3080";

  const PRICE_SRC = { in:"آخر وارد", doc:"وثيقة الصنف", cat:"الكتالوج", none:"—" };
  const LINK_VIA  = { link:"ربط يدوي", id:"المعرّف", code:"الكود", name:"الاسم" };

  // ── جسورٌ آمنة لخدمات النواة ──
  function T(msg,type){ try{ if(typeof toast==="function") toast(msg,type); }catch(e){} }
  function AUD(a,b){ try{ if(typeof logAudit==="function") logAudit(a,b); }catch(e){} }
  function CATALOG(){ try{ return (typeof _catalogItems!=="undefined" && Array.isArray(_catalogItems)) ? _catalogItems : []; }catch(e){ return []; } }
  function INV(){ try{ return (typeof _inventoryItems!=="undefined" && Array.isArray(_inventoryItems)) ? _inventoryItems : []; }catch(e){ return []; } }
  function LOG(){ try{ return (typeof _inventoryLog!=="undefined" && Array.isArray(_inventoryLog)) ? _inventoryLog : []; }catch(e){ return []; } }
  function mergedInto(c){
    try{ if(typeof _catMergedInto==="function") return _catMergedInto(c); }catch(e){}
    return (c && typeof c.mergedInto==="string" && c.mergedInto) ? c.mergedInto : "";
  }
  function resolveId(id){
    try{ if(typeof _catResolveId==="function") return _catResolveId(id)||id; }catch(e){}
    return id;
  }
  function num(v){ const n=parseFloat(v); return isFinite(n)?n:0; }

  /* مفتاحُ الاسم للربط — جامعُ التطبيعين (انظر الترويسة). ويُنفَّذ بلا نواةٍ
     أيضاً (صندوقُ الفحص) فالنسخةُ الاحتياطية مكتوبةٌ هنا لا مُستدعاة. */
  const _TASHKEEL = /[ً-ْـٰ]/g;
  function nameKey(s){
    try{ if(typeof _catSearchNorm==="function") return _catSearchNorm(s).replace(/\s+/g,""); }catch(e){}
    return String(s==null?"":s).toLowerCase()
      .replace(_TASHKEEL,"")
      .replace(/[أإآا]/g,"ا")
      .replace(/ة/g,"ه").replace(/ى/g,"ي")
      .replace(/\s+/g,"");
  }

  /* فهرسُ الكتالوج — يُعاد بناؤه حين تتبدّل **هويّةُ** المصفوفة (كلُّ لقطةٍ من
     Firestore تُسند مصفوفةً جديدة)، فلا يبقى مرجعٌ لوثيقةٍ قديمةٍ سعرُها قديم.
     والمدموجُ يدخل `byId` وحدَه (ليُتبَع إلى وجهته) ولا يدخل الكودَ ولا الاسم —
     فلا يُربَط به بندٌ جديد. */
  let _idxArr = null, _idxMap = null;
  function catalogIndex(arr){
    const a = Array.isArray(arr) ? arr : CATALOG();
    if(_idxArr===a && _idxMap) return _idxMap;
    const byId={}, byCode={}, byName={};
    a.forEach(function(c){
      if(!c) return;
      if(c.id && !byId[c.id]) byId[c.id]=c;
      if(mergedInto(c)) return;
      const code=String(c.code||"").trim().toLowerCase();
      if(code && !byCode[code]) byCode[code]=c;
      const nm=nameKey(c.name);
      if(nm && !byName[nm]) byName[nm]=c;
    });
    _idxArr=a; _idxMap={byId, byCode, byName};
    return _idxMap;
  }

  /* بندُ الكتالوج المرتبطُ بصنف المخزون ودرجةُ الربط — المصدرُ الواحد للفئة
     والسعر معاً. النتيجةُ تُخبَّأ على الصنف نفسِه بمفتاحَي (مصفوفةُ الكتالوج +
     بصمةُ هويّة الصنف)، فتبطل وحدَها عند أيّ لقطةٍ جديدةٍ أو تعديلِ ربط. */
  function catalogOf(it, arr){
    if(!it) return {c:null, via:""};
    const idx=catalogIndex(arr);
    const sig=(it.catalogItemId||"")+" | "+(it.itemId||it.id||"")+" | "+(it.itemCode||"")+" | "+(it.itemName||"");
    if(it._clArr===_idxArr && it._clSig===sig && it._clRes) return it._clRes;
    const pick=function(id){
      if(!id) return null;
      return idx.byId[resolveId(id)] || idx.byId[id] || null;
    };
    let c=null, via="";
    if(it.catalogItemId){ c=pick(it.catalogItemId); if(c) via="link"; }
    if(!c){ const g=pick(it.itemId||it.id); if(g){ c=g; via="id"; } }
    if(!c && it.itemCode){ const g=idx.byCode[String(it.itemCode).trim().toLowerCase()]; if(g){ c=g; via="code"; } }
    if(!c && it.itemName){ const g=idx.byName[nameKey(it.itemName)]; if(g){ c=g; via="name"; } }
    const res={c:c||null, via:c?via:""};
    try{ it._clArr=_idxArr; it._clSig=sig; it._clRes=res; }catch(e){}
    return res;
  }

  /* سعرُ وحدة الصنف ومصدرُه — السلّمُ في الترويسة. `lastIn` خريطةُ
     {docId:{price}} يوفّرها المتّصل: الشاشةُ من سجلّها المحمَّل، والتقريرُ من
     مدى فترته — فما يختلف هو المدى المقروء لا السلّم. */
  function unitPrice(it, lastIn, arr){
    if(!it) return {price:null, src:PRICE_SRC.none, cat:null, via:""};
    const li = lastIn && (lastIn[it.id] || (it.itemId?lastIn[it.itemId]:null));
    const lp = li ? num(li.price!=null?li.price:li) : 0;
    const link=catalogOf(it, arr);
    if(lp>0) return {price:lp, src:PRICE_SRC.in,  cat:link.c, via:link.via};
    const dp=num(it.unitPrice);
    if(dp>0) return {price:dp, src:PRICE_SRC.doc, cat:link.c, via:link.via};
    const cp=link.c ? num(link.c.unitPrice) : 0;
    if(cp>0) return {price:cp, src:PRICE_SRC.cat, cat:link.c, via:link.via};
    return {price:null, src:PRICE_SRC.none, cat:link.c, via:link.via};
  }

  /* خريطةُ «آخر وارد» من سجل الحركات — آخرُ سعرٍ **موجبٍ** لا آخرُ سجلٍّ مطلقاً
     (سندٌ بسعر صفرٍ لا يمحو سعراً معروفاً). مداها في الشاشة آخرُ ٥٠٠ حركة. */
  function lastInMap(logs){
    const out={};
    (Array.isArray(logs)?logs:LOG()).forEach(function(l){
      if(!l || (l.type!=="in" && l.type!=="manual_in") || !l.itemId) return;
      const p=num(l.unitPrice);
      if(p<=0) return;
      const prev=out[l.itemId];
      if(!prev || String(l.date||"")>prev.date) out[l.itemId]={price:p, date:String(l.date||"")};
    });
    return out;
  }

  // إبطالُ خبيئةِ الربط على صنفٍ بعينه بعد كتابةٍ محليّة
  function _bust(it){ if(it){ it._clRes=null; it._clSig=null; it._clArr=null; } }

  function canWrite(){
    try{
      const a=(typeof isAdmin==="function") && isAdmin();
      const w=(typeof isWarehouseManager==="function") && isWarehouseManager();
      return !!(a||w);
    }catch(e){ return false; }
  }

  // ── ربطٌ يدويٌّ: كتابةُ `catalogItemId` على وثيقة الرصيد ──
  async function linkTo(itemId, catId){
    if(!canWrite()){ T("غير مصرح","warn"); return false; }
    const it=INV().find(function(x){ return x.id===itemId; });
    const c =CATALOG().find(function(x){ return x.id===catId; });
    if(!it||!c){ T("تعذّر الربط — حدّث الصفحة","warn"); return false; }
    if(typeof db==="undefined" || !db){ T("لا يوجد اتصال","warn"); return false; }
    const now=new Date().toISOString();
    let by="—"; try{ by=(currentUser&&(currentUser.name||currentUser.user))||"—"; }catch(e){}
    try{
      await db.collection(INVENTORY_COLLECTION()).doc(itemId).set({
        catalogItemId:c.id, catalogLinkedAt:now, catalogLinkedBy:by
      },{merge:true});
      // مرآةٌ محليّةٌ خفيفةٌ لِما ستؤكّده اللقطة (onSnapshot يبقى المصدر)
      const f=INV().find(function(x){ return x.id===itemId; });
      if(f){ f.catalogItemId=c.id; f.catalogLinkedAt=now; f.catalogLinkedBy=by; _bust(f); }
      AUD("ربط صنف مخزون بالكتالوج",
        "الصنف: "+(it.itemName||"—")+" ← البند: "+(c.name||"—")+(c.code?" ("+c.code+")":"")+
        (num(c.unitPrice)>0 ? " — سعر الكتالوج: "+num(c.unitPrice)+" ر.س" : " — بلا سعر في الكتالوج"));
      T("تم ربط «"+(it.itemName||"")+"» ببند «"+(c.name||"")+"»","success");
      try{ if(typeof renderInventory==="function") renderInventory(); }catch(e){}
      return true;
    }catch(e){
      console.error("inventoryPricing/linkTo:", e);
      T("تعذّر حفظ الربط: "+e.message,"warn");
      return false;
    }
  }

  /* فكُّ الربط اليدويّ يُعيد المطابقةَ التلقائية — ولا يمحو شيئاً غيرَها.
     والحقلُ يُكتب "" لا يُحذف (انظر الترويسة). */
  async function unlink(itemId){
    if(!canWrite()){ T("غير مصرح","warn"); return false; }
    const it=INV().find(function(x){ return x.id===itemId; });
    if(!it){ T("الصنف غير موجود — حدّث الصفحة","warn"); return false; }
    if(typeof db==="undefined" || !db){ T("لا يوجد اتصال","warn"); return false; }
    try{
      await db.collection(INVENTORY_COLLECTION()).doc(itemId).set({
        catalogItemId:"", catalogLinkedAt:"", catalogLinkedBy:""
      },{merge:true});
      const f=INV().find(function(x){ return x.id===itemId; });
      if(f){ f.catalogItemId=""; f.catalogLinkedAt=""; f.catalogLinkedBy=""; _bust(f); }
      AUD("فكّ ربط صنف مخزون بالكتالوج","الصنف: "+(it.itemName||"—"));
      T("فُكَّ الربط اليدوي — عادت المطابقة التلقائية","success");
      try{ if(typeof renderInventory==="function") renderInventory(); }catch(e){}
      return true;
    }catch(e){
      console.error("inventoryPricing/unlink:", e);
      T("تعذّر فكّ الربط: "+e.message,"warn");
      return false;
    }
  }

  window.inventoryPricing = {
    PRICE_SRC, LINK_VIA,
    nameKey, catalogIndex, catalogOf, unitPrice, lastInMap,
    linkTo, unlink, canWrite,
    build: MODULE_BUILD
  };
})();
