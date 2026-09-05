/* ═══════════════════════════════════════════════════════════════════════════
   نظام هيل — وحدة الرقابة المالية على المشتريات  (finance-audit.js)
   ملف خارجي مستقل يُحقَن في صفحة #page-finance-audit، على نمط substitute-budget.js
   و stocktake.js: IIFE يعرض كائناً واحداً window.financeAudit، ويقرأ خدمات النواة
   (db / currentUser / esc / toast / showConfirm / showCustomModal / logAudit /
   addNotification / _openPrintWindow / فحوص الأدوار / purchases / poIsClosed /
   poActualCost / poEstTotal / normalizePOStatus / _pcGroupsFromPO / _catalogItems /
   openPurchaseDetail) مباشرةً بالاسم — إذ تتشارك كل وسوم <script> الكلاسيكية
   نفس البيئة المعجمية العامة.

   الفكرة (متفق عليها مع المالك):
   • كل شهر يعتمد قسم المالية «دورة تدقيق» على طلبات الشراء التي أُغلقت فعلياً
     في الشهر السابق: النظام يختار عينة عشوائية **حتمية** (seeded — البذرة من
     الشهر ومعرّفات الطلبات المرشّحة، فلا يمكن «إعادة السحب» حتى تخرج عينة
     مريحة، والعينة قابلة للتحقق لاحقاً) مرجّحة بالقيمة (الطلب الأغلى احتمال
     اختياره أعلى)، **ويضيف آلياً** أي طلب فيه إشارة خطر (تجاوز أرخص عرض مسجّل /
     تجاوز كبير للتقدير / مبلغ عالٍ بلا مقارنة أسعار).
   • لكل طلب في العينة يجهّز النظام مقارنة استرشادية لكل بند: سعر الشراء الفعلي
     مقابل أفضل سعر تاريخي لنفس البند (آخر ٦ أشهر، بالتطبيع العربي) وسعر كتالوج
     الأسعار، مع أرخص عرض كامل مسجّل على الطلب نفسه — والمدقّق يضيف عروضاً يدوية.
   • الحكم لكل طلب: مطابق / فرق مقبول / ملاحظة / مخالفة. الملاحظة والمخالفة
     تفتحان «دورة رد»: تظهر لقسم المشتريات ليكتب مبرره، ثم المالية تغلق البند
     (قبول الرد أو التصعيد للتنفيذي). تقرير شهري قابل للطباعة.

   الصلاحيات:
   • العرض: admin + ceo + finance + procurement_officer.
   • إنشاء الدورة والمراجعة والإغلاق: finance + admin.
   • الرد على الملاحظات: procurement_officer + admin.
   • حذف دورة: admin فقط.

   التخزين: مجموعة global_finance_audits — وثيقة واحدة لكل شهر مُدقَّق
   (معرّفها = "YYYY-MM")، تحمل معايير العينة وبصمة البذرة ومصفوفة samples.
   الكتابة كلها عبر معاملات تدمج تعديل عينة واحدة على وثيقة الخادم الطازجة
   (نمط substitute-budget) — فلا يدهس مدقّقان متزامنان عمل بعضهما.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
  "use strict";

  var MODULE_BUILD = "v18.9.3082";

  // ── معايير العينة والأعلام (قابلة للتعديل من هنا — تُخزَّن مع كل دورة) ──
  var FA_PCT            = 10;    // نسبة العينة العشوائية من طلبات الشهر المغلقة
  var FA_MIN            = 3;     // حدّ أدنى لعدد العينة العشوائية
  var FA_MAX            = 10;    // حدّ أقصى لعدد العينة العشوائية
  var FA_TOL_PCT        = 5;     // نسبة التسامح في فرق السعر (٪)
  var FA_HIST_MONTHS    = 6;     // نافذة التاريخ الشرائي للمقارنة (أشهر)
  var FA_BIG_NO_COMPARE = 20000; // «مبلغ عالٍ»: طلب بلا أي مقارنة أسعار فوقه يُدرَج آلياً
  var FA_EST_OVER_PCT   = 25;    // تجاوز التقدير بأكثر من هذه النسبة يُدرَج آلياً
  var FA_VAT            = 1.15;  // العروض المسجّلة تُعامل صافي ضريبة عند مقارنتها بالفعلي

  function COLL(){
    var dev=false;
    try{ dev=(typeof IS_DEV!=="undefined" && IS_DEV); }catch(e){}
    return dev ? "global_finance_audits_dev" : "global_finance_audits";
  }

  // ── الحالة ──
  var _audits  = [];    // كل دورات التدقيق (من onSnapshot، الأحدث أولاً)
  var _loaded  = false; // وصلت أول لقطة من Firestore؟ قبلها تُعرض حالة تحميل لا «لا دورات» المضللة
  var _connIssue=false; // تعذّر الوصول للبيانات (خطأ/مهلة)؟ تُعرض رسالة اتصال صادقة لا «لا دورات»
  var _unsub   = null;  // إلغاء الاشتراك
  var _curMonth= null;  // الدورة المفتوحة في شاشة التفاصيل (أو null = القائمة)
  var _busy    = false; // حارس ضد النقر المزدوج
  var _mq      = [];    // مسودة العروض اليدوية داخل نافذة المراجعة المفتوحة
  var _mqBusy  = false; // حارس ضد النقر المزدوج أثناء رفع مرفق الدليل
  var _curPoIdForMq=""; // الطلب المفتوح في نافذة المراجعة — مسار تخزين مرفقات أدلته

  // ════════ أدوات مساعدة داخلية ════════
  function _now(){ return new Date().toISOString(); }
  function _me(){ try{ return (currentUser && currentUser.name) || "النظام"; }catch(e){ return "النظام"; } }
  function _esc(s){ try{ return esc(s); }catch(e){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); } }
  // تهريب معاملات onclick داخل سياق سلسلة JS — درس v18.9vu (H5): esc تحوّل ' إلى
  // &#39; فتُفكّ داخل الخاصية ويُكسر سياق الـ JS (XSS مخزّن). JQ النواة تهرّب \ و '
  // أولاً ثم محارف HTML — فلا يكسر أي معرّفٍ خبيث السياقَ مهما كان مصدره.
  function _jq(s){ try{ return _jsq(s); }catch(e){ return String(s==null?"":s).replace(/\\/g,"\\\\").replace(/'/g,"\\'").replace(/[&<>"]/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); } }
  function _toast(m,t){ try{ toast(m,t); }catch(e){} }
  function _log(a,d){ try{ if(typeof logAudit==="function") logAudit(a,d); }catch(e){} }
  function _notify(t,b,id,ty){ try{ if(typeof addNotification==="function") addNotification(t,b,id,ty||"po"); }catch(e){} }
  function _confirm(o){ try{ return showConfirm(o); }catch(e){ return Promise.resolve(window.confirm((o&&o.msg)||"تأكيد؟")); } }
  function _fmt(n){ return (Number(n)||0).toLocaleString("en-US",{maximumFractionDigits:2}); }
  function _icn(name,cls){ try{ return (typeof _ic==="function") ? _ic(name,cls) : ""; }catch(e){ return ""; } }
  function _pos(){ try{ return (typeof purchases!=="undefined" && Array.isArray(purchases)) ? purchases : []; }catch(e){ return []; } }
  function _isClosed(p){ try{ return (typeof poIsClosed==="function") ? poIsClosed(p) : false; }catch(e){ return false; } }
  function _actualCost(p){ try{ return (typeof poActualCost==="function") ? Number(poActualCost(p))||0 : (Number(p&&p.actualCost)||0); }catch(e){ return 0; } }
  function _estTotal(p){ try{ return (typeof poEstTotal==="function") ? Number(poEstTotal(p))||0 : (Number(p&&p.estCost)||0); }catch(e){ return Number(p&&p.estCost)||0; } }
  function _normStatus(s){ try{ return (typeof normalizePOStatus==="function") ? normalizePOStatus(s) : (s||""); }catch(e){ return s||""; } }
  function _vendorOf(p){ return (p && (p.actualVendor || p.vendor)) || ""; }
  function _poMeta(id){ return _pos().find(function(p){ return p && p.id===id; }) || null; }

  // ── الصلاحيات ──
  function _r(fn){ try{ return (typeof window[fn]==="function") && window[fn](); }catch(e){ return false; } }
  function _isAdmin(){ try{ return (typeof isAdmin==="function") && isAdmin(); }catch(e){ return false; } }
  function _canAudit(){ // إنشاء الدورة + المراجعة + الإغلاق — المالية والمسؤول
    try{ return ((typeof isFinance==="function") && isFinance()) || _isAdmin(); }catch(e){ return _isAdmin(); }
  }
  function _canRespond(){ // الرد على الملاحظات — المشتريات والمسؤول
    try{ return ((typeof isProcurementOfficer==="function") && isProcurementOfficer()) || _isAdmin(); }catch(e){ return _isAdmin(); }
  }
  function _canView(){
    try{ return _canAudit() || _canRespond() || ((typeof isCEO==="function") && isCEO()); }catch(e){ return _canAudit(); }
  }

  /* ════════════════════════════════════════════════════════════════════
     الدوال النقية — مكشوفة على window.financeAudit لفحوص hail-tests
     ════════════════════════════════════════════════════════════════════ */

  // تطبيع عربي للمطابقة بالاسم (نفس نهج stocktake): إزالة تشكيل، توحيد الألف
  // والتاء المربوطة والياء، إسقاط المسافات — «مواد نظافه» ≡ «مواد نظافة».
  function _norm(s){
    return String(s==null?"":s)
      .replace(/[ً-ْٰ]/g,"")
      .replace(/[أإآ]/g,"ا").replace(/ة/g,"ه").replace(/ى/g,"ي")
      .replace(/\s+/g,"").trim().toLowerCase();
  }

  // بصمة FNV-1a 32-bit — بذرة حتمية من نص (الشهر + معرّفات المرشّحين).
  function _hashSeed(str){
    var h=0x811c9dc5; str=String(str==null?"":str);
    for(var i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,0x01000193)>>>0; }
    return h>>>0;
  }

  // مولّد mulberry32 — عشوائية حتمية قابلة للتكرار من البذرة نفسها.
  function _mulberry(a){
    return function(){
      a|=0; a=(a+0x6D2B79F5)|0;
      var t=Math.imul(a^(a>>>15), 1|a);
      t=(t+Math.imul(t^(t>>>7), 61|t))^t;
      return ((t^(t>>>14))>>>0)/4294967296;
    };
  }

  // اختيار العينة العشوائية الحتمية المرجّحة بالقيمة — بلا إرجاع.
  // pool: [{id, cost}]، opts: {pct, min, max, seed}. الترتيب الداخلي ثابت
  // (فرز بالمعرّف) فالنتيجة واحدة مهما كان ترتيب الإدخال — حتمية كاملة.
  function _pickSample(pool, opts){
    var o=opts||{};
    var pct=Number(o.pct)||0, min=Number(o.min)||0, max=Number(o.max)||Infinity;
    var sorted=(pool||[]).filter(function(x){ return x && x.id!=null; })
      .slice().sort(function(a,b){ return String(a.id)<String(b.id)?-1:(String(a.id)>String(b.id)?1:0); });
    if(!sorted.length) return { picked:[], target:0 };
    var target=Math.ceil(sorted.length*pct/100);
    if(target<min) target=min;
    if(target>max) target=max;
    if(target>sorted.length) target=sorted.length;
    var rnd=_mulberry(_hashSeed(String(o.seed||"")));
    var rem=sorted.slice(), picked=[];
    while(picked.length<target && rem.length){
      var wsum=0, i;
      for(i=0;i<rem.length;i++) wsum+=Math.max(1, Number(rem[i].cost)||0);
      var r=rnd()*wsum, acc=0, idx=rem.length-1;
      for(i=0;i<rem.length;i++){
        acc+=Math.max(1, Number(rem[i].cost)||0);
        if(r<acc){ idx=i; break; }
      }
      picked.push(rem[idx].id);
      rem.splice(idx,1);
    }
    return { picked:picked, target:target };
  }

  // مفتاح الشهر من تاريخ ISO — "YYYY-MM" (بلا مُعدِّلات Date — درس v18.9vt).
  function _monthKey(iso){
    if(!iso) return "";
    var d=new Date(iso);
    if(isNaN(d.getTime())) return "";
    var m=d.getMonth()+1;
    return d.getFullYear()+"-"+(m<10?"0":"")+m;
  }

  // الشهر السابق لمفتاح شهر ("2026-08" → "2026-07").
  function _prevMonthKey(mk){
    var m=/^(\d{4})-(\d{2})$/.exec(String(mk||""));
    if(!m) return "";
    var y=parseInt(m[1],10), mo=parseInt(m[2],10)-1;
    if(mo<1){ mo=12; y--; }
    return y+"-"+(mo<10?"0":"")+mo;
  }

  // لحظة الإغلاق الفعلي للطلب: آخر حدث closed/closed_after_receipt في timeline،
  // وإلا updatedAt ثم createdAt (لطلب مغلق قديم بلا حدث موقوت).
  function _poClosedAtISO(p, normFn){
    if(!p) return "";
    var norm=normFn||function(s){ return s||""; };
    var best="";
    var tl=Array.isArray(p.timeline)?p.timeline:[];
    for(var i=0;i<tl.length;i++){
      var e=tl[i]; if(!e) continue;
      var code=norm(e.code||e.event||"");
      if((code==="closed"||code==="closed_after_receipt") && e.at){
        if(!best || String(e.at)>String(best)) best=e.at;
      }
    }
    return best || p.updatedAt || p.createdAt || "";
  }

  // صافي سعر الوحدة لبند مخزّن: (إجمالي البند − ضريبته) ÷ الكمية المستلَمة
  // (أو المطلوبة)، وإلا unitCost المخزّن. صفر إن تعذّر الحساب.
  function _unitNet(it){
    if(!it) return 0;
    var rcv=Number(it.rcvQty);
    var qty=(it.rcvQty!=null && rcv>0) ? rcv : (Number(it.qty)||0);
    var tot=Number(it.itemCost)||0, vat=Number(it.vat)||0;
    if(qty>0 && tot>0) return Math.round((tot-vat)/qty*100)/100;
    return Number(it.unitCost)||0;
  }

  // أعلام الإدراج الآلي — من أرقام مجرّدة (نقية للاختبار):
  // m = {actual, est, quoteMin, hasComparison, bigLimit, estOverPct, tolPct, vat}
  function _autoFlags(m){
    m=m||{};
    var flags=[];
    var actual=Number(m.actual)||0, est=Number(m.est)||0, qmin=Number(m.quoteMin)||0;
    var tol=1+(Number(m.tolPct)||0)/100, vat=Number(m.vat)||1;
    if(qmin>0 && actual>qmin*vat*tol) flags.push("over_quote");
    if(est>0 && actual>est*(1+(Number(m.estOverPct)||0)/100)) flags.push("over_estimate");
    if(!m.hasComparison && actual>=(Number(m.bigLimit)||Infinity)) flags.push("no_compare_big");
    return flags;
  }

  var FLAG_LABELS = {
    over_quote:    "التكلفة الفعلية تجاوزت أرخص عرض مسجّل على الطلب",
    over_estimate: "التكلفة الفعلية تجاوزت التقدير بنسبة كبيرة",
    no_compare_big:"مبلغ عالٍ بلا أي مقارنة أسعار مسجّلة"
  };

  // مقارنة بنود الطلب بالمرجع (تاريخ + كتالوج) — نقية:
  // items: [{name, qty, unit}] بسعر وحدتنا الصافي، refRows: [{name, vendor, unit, src, ref}].
  // تُرجع لكل بند أفضل بديل أرخص والوفر المحتمل، والإجمالي.
  function _itemBench(items, refRows, tolPct){
    var tol=(Number(tolPct)||0)/100;
    var byName={};
    (refRows||[]).forEach(function(r){
      if(!r || !(Number(r.unit)>0)) return;
      var k=_norm(r.name);
      if(!k) return;
      if(!byName[k]) byName[k]=[];
      byName[k].push(r);
    });
    var totalSaving=0;
    var rows=(items||[]).map(function(it){
      var name=(it&&it.name)||"", qty=Number(it&&it.qty)||0, unit=Number(it&&it.unit)||0;
      var cands=byName[_norm(name)]||[];
      var best=null;
      cands.forEach(function(r){ if(!best || Number(r.unit)<Number(best.unit)) best=r; });
      var cheaper=!!(best && unit>0 && Number(best.unit)<unit);
      var overTol=!!(best && unit>0 && unit>Number(best.unit)*(1+tol));
      var saving=cheaper ? Math.round((unit-Number(best.unit))*qty*100)/100 : 0;
      if(saving>0) totalSaving+=saving;
      return { name:name, qty:qty, unit:unit, best:best, cheaper:cheaper, overTol:overTol, saving:saving, matches:cands.length };
    });
    return { rows:rows, totalSaving:Math.round(totalSaving*100)/100 };
  }

  // بناء عينة يدوية — نقية للاختبار: نفس بنية عينات الإنشاء حرفياً (حقول المراجعة
  // والرد والإغلاق كلها) حتى تمرّ بدورة الحياة نفسها، مع مصدر "manual" وسبب
  // الإضافة واسم المضيف ولحظتها — فالإدخال اليدوي في العينة قرار رقابي موثَّق.
  function _manualSample(meta, reason, by, at){
    meta=meta||{};
    return {
      poId:String(meta.poId||""),
      source:"manual", reasons:[],
      manualReason:String(reason||""), addedBy:String(by||""), addedAt:String(at||""),
      vendor:meta.vendor||"", actualCost:Number(meta.actualCost)||0,
      status:"pending", verdict:"",
      findings:"", recommendation:"", potentialSaving:0,
      manualQuotes:[],
      reviewedBy:"", reviewedAt:"",
      procurementReply:"", procurementBy:"", procurementAt:"",
      closedBy:"", closedAt:"", closeNote:"", escalated:false
    };
  }

  /* ════════════════════════════════════════════════════════════════════
     قراءة بيانات المقارنة من النواة (غير نقية — مسوّرة كلها)
     ════════════════════════════════════════════════════════════════════ */

  // أرخص عرض «كامل التغطية» مسجّل على الطلب (صافي ضريبة):
  // من مجموعات المقارنة (priceComparisons2 عبر _pcGroupsFromPO) إن غطّت كل البنود،
  // وإلا من المقارنة البسيطة القديمة p.priceComparison (إجماليات موردين).
  function _quoteMin(p){
    if(!p) return 0;
    try{
      if(typeof _pcGroupsFromPO==="function"){
        var groups=_pcGroupsFromPO(p)||[];
        var items=p.items||[];
        if(groups.length && items.length){
          var covered={}, sum=0, ok=true;
          groups.forEach(function(g){
            var idxs=Array.isArray(g.itemIndices)?g.itemIndices:[];
            var sups=Array.isArray(g.suppliers)?g.suppliers:[];
            var fulls=[];
            sups.forEach(function(s){
              var tot=0, full=idxs.length>0;
              idxs.forEach(function(ai){
                var e=(s.items||[]).find(function(x){ return x.idx===ai; });
                var up=e?(parseFloat(e.unitPrice)||0):0;
                if(up>0){ tot+=up*(parseFloat((items[ai]||{}).qty)||1); } else full=false;
              });
              if(full && tot>0) fulls.push(tot);
            });
            if(fulls.length){ sum+=Math.min.apply(null,fulls); idxs.forEach(function(ai){ covered[ai]=1; }); }
          });
          var allCovered=items.every(function(_,i){ return covered[i]; });
          if(allCovered && sum>0) return Math.round(sum*100)/100;
        }
      }
    }catch(e){}
    try{
      var pc=p.priceComparison;
      if(Array.isArray(pc) && pc.length>=2){
        var prices=pc.map(function(q){ return parseFloat(q&&q.price)||0; }).filter(function(v){ return v>0; });
        if(prices.length) return Math.min.apply(null,prices);
      }
    }catch(e){}
    return 0;
  }

  // هل سُجّلت على الطلب أي مقارنة أسعار (مجموعات أو بسيطة)؟
  function _hasComparison(p){
    if(!p) return false;
    if(_quoteMin(p)>0) return true;
    try{
      if(Array.isArray(p.priceComparisons2) && p.priceComparisons2.length) return true;
      if(Array.isArray(p.priceComparison) && p.priceComparison.length>=2) return true;
    }catch(e){}
    return false;
  }

  // صفوف المرجع حول لحظةٍ ما: بنود الطلبات المغلقة خلال نافذة التاريخ + الكتالوج.
  // refISO = مركز النافذة (لحظة إغلاق الطلب المُدقَّق، أو «الآن» للفحص الوقائي)،
  // excludeId = طلب يُستثنى من المرجع (الطلب نفسه عند التدقيق).
  function _refRowsAt(refISO, excludeId){
    var rows=[];
    var refTS=new Date(refISO||_now()).getTime();
    if(isNaN(refTS)) refTS=Date.now();
    var winMs=FA_HIST_MONTHS*30.44*24*3600*1000;
    _pos().forEach(function(q){
      if(!q || (excludeId && q.id===excludeId) || !_isClosed(q)) return;
      var at=_poClosedAtISO(q,_normStatus);
      var ts=new Date(at).getTime();
      if(isNaN(ts) || Math.abs(refTS-ts)>winMs) return;
      var vend=_vendorOf(q);
      (q.items||[]).forEach(function(it){
        var u=_unitNet(it);
        if(u>0 && it && it.itemName) rows.push({ name:it.itemName, vendor:vend, unit:u, src:"history", ref:q.id, at:at });
      });
    });
    try{
      if(typeof _catalogItems!=="undefined" && Array.isArray(_catalogItems)){
        _catalogItems.forEach(function(c){
          var u=parseFloat(c&&c.unitPrice)||0;
          if(u>0 && c && c.name) rows.push({ name:c.name, vendor:c.vendor||"", unit:u, src:"catalog", ref:"كتالوج الأسعار", at:"" });
        });
      }
    }catch(e){}
    return rows;
  }
  function _refRows(p){
    return _refRowsAt(_poClosedAtISO(p,_normStatus)||_now(), p&&p.id);
  }

  // أعلام الإدراج الآلي لطلبٍ حي (تجمع الأرقام ثم تمرّ بالنقية).
  function _autoFlagsFor(p){
    return _autoFlags({
      actual:_actualCost(p), est:_estTotal(p), quoteMin:_quoteMin(p),
      hasComparison:_hasComparison(p),
      bigLimit:FA_BIG_NO_COMPARE, estOverPct:FA_EST_OVER_PCT, tolPct:FA_TOL_PCT, vat:FA_VAT
    });
  }

  /* ════════════════════════════════════════════════════════════════════
     المزامنة والتخزين
     ════════════════════════════════════════════════════════════════════ */

  function _rerenderIfActive(){
    var pg=document.getElementById("page-finance-audit");
    if(pg && pg.classList.contains("active")) render();
  }

  function _applySnap(snap){
    _audits = snap.docs.map(function(d){ return Object.assign({id:d.id}, d.data()); })
      .sort(function(a,b){ return String(b.month||b.id).localeCompare(String(a.month||a.id)); });
    _loaded = true; _connIssue = false;
    _navToggle();
    _rerenderIfActive();
  }

  function startSync(){
    _navToggle();
    if(typeof db==="undefined" || !db) return;
    // بوّابة الدور قبل الاشتراك: دورٌ لا يرى الشاشة لا يُنزِّل مجموعتَها عن كل جلسة
    // (خفض قراءات Firestore — قياس ٢٦/٠٨). والشاشةُ تنادي startSync عند الفتح فلا يُحرم أهلُها.
    if(!_canView()) return;
    if(_unsub) return; // idempotent — المستمعون العامون يُركَّبون مرة واحدة (v18.9sz)
    // (١) جلبٌ فوري بطلبٍ واحد يوازي فتح التيار: مصافحة تيار Watch قد تستغرق
    // ثوانيَ طويلة على اتصال بارد (أبلغها المستخدم: «جارٍ تحميل بنود التدقيق»
    // تطول) — بينما get() يعود أسرع بكثير فيظهر المحتوى فوراً، والتيار يتكفل
    // بالتحديث الحي بعد لحوقه. أيهما وصل أولاً يعرض (حارس _loaded).
    try{
      db.collection(COLL()).get().then(function(snap){ if(!_loaded) _applySnap(snap); })
        .catch(function(){ /* يتكفل به مسار التيار أو المهلة */ });
    }catch(e){}
    _unsub = db.collection(COLL()).onSnapshot(_applySnap, function(e){
      console.warn("finance-audit sync error:", e);
      // خطأ المزامنة لا يترك الصفحة على «جارٍ التحميل» للأبد — رسالة اتصال صادقة
      _loaded = true; _connIssue = true;
      _rerenderIfActive();
    });
    // (٢) مهلة أمان: مهما حدث لا دوّار أبدياً — بعد 8 ثوانٍ بلا أي بيانات تُعرض
    // رسالة الاتصال (لا «لا توجد دورات» المضللة)، وأي لقطة لاحقة تصحح تلقائياً.
    setTimeout(function(){
      if(_loaded) return;
      _loaded = true; _connIssue = true;
      _rerenderIfActive();
    }, 8000);
  }

  // إعادة محاولة يدوية من رسالة تعذر الاتصال — جلبة واحدة جديدة
  function retryLoad(){
    _loaded=false; _connIssue=false; render();
    try{
      db.collection(COLL()).get()
        .then(function(snap){ _applySnap(snap); })
        .catch(function(){ _loaded=true; _connIssue=true; render(); });
    }catch(e){ _loaded=true; _connIssue=true; render(); }
  }

  // إظهار زر القائمة الجانبية لأصحاب الصلاحية فقط (الزر مخفي افتراضياً في HTML).
  function _navToggle(){
    try{
      var btn=document.getElementById("nav-finance-audit-btn");
      if(btn) btn.style.display=_canView() ? "" : "none";
    }catch(e){}
  }

  // ── ورقة أنماط الوحدة — بلغة تصميم المنصة نفسها ──
  // كل الألوان من توكنز النواة (--primary/--surface/--warn...) عبر color-mix،
  // فتعمل في الثيمين الفاتح والداكن تلقائياً (لا hex مثبّتة تنكسر في الداكن)،
  // والأرقام JetBrains Mono بأرقام جدولية كبقية شاشات المنصة.
  function _injectCSS(){
    if(document.getElementById("fa-css")) return;
    var st=document.createElement("style"); st.id="fa-css";
    st.textContent=
      '#page-finance-audit{direction:rtl}'+
      '.fa-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:14px}'+
      '.fa-stats .stat-card{cursor:default}'+
      '.fa-stats .sv{font-family:\'JetBrains Mono\',monospace}'+
      '.fa-table-wrap{background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);overflow-x:auto}'+
      '.fa-table{width:100%;border-collapse:collapse;font-size:12px}'+
      '.fa-table th{background:var(--surface2);padding:10px 12px;text-align:right;font-weight:700;color:var(--muted);font-size:11px;border-bottom:1px solid var(--border);white-space:nowrap}'+
      '.fa-table td{padding:9px 12px;border-bottom:1px solid var(--border);vertical-align:middle}'+
      '.fa-table tbody tr:last-child td{border-bottom:none}'+
      '.fa-table tbody tr.fa-click{cursor:pointer}'+
      '.fa-table tbody tr.fa-click:hover td{background:var(--surface2)}'+
      '.fa-num{direction:ltr;text-align:right;font-family:\'JetBrains Mono\',monospace;font-variant-numeric:tabular-nums}'+
      '.fa-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;white-space:nowrap;background:color-mix(in srgb,var(--pc,var(--muted)) 12%,var(--surface));color:var(--pc,var(--muted))}'+
      '.fa-pill .fa-dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex-shrink:0}'+
      '.fa-seed{display:inline-flex;align-items:center;gap:6px;font-family:\'JetBrains Mono\',monospace;font-size:10px;color:var(--muted);background:var(--surface2);border:1px dashed var(--border);border-radius:8px;padding:3px 9px;direction:ltr}'+
      '.fa-progress{height:7px;background:var(--surface2);border-radius:20px;overflow:hidden;min-width:80px;flex:1}'+
      '.fa-progress i{display:block;height:100%;border-radius:20px;background:var(--accent);transition:width .3s}'+
      '.fa-progress-cell{display:flex;align-items:center;gap:8px;min-width:130px}'+
      '.fa-empty{text-align:center;color:var(--muted);padding:46px 20px}'+
      '.fa-empty-ic{width:52px;height:52px;border-radius:14px;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;background:var(--surface2);color:var(--muted)}'+
      '.fa-empty-ic svg{width:26px;height:26px}'+
      '.fa-sec{font-size:11px;font-weight:800;color:var(--muted);margin:12px 0 6px;display:flex;align-items:center;gap:6px}'+
      '.fa-note{background:var(--surface2);border-radius:10px;padding:10px 13px;font-size:11px;color:var(--muted);line-height:1.9}'+
      '.fa-alert{background:color-mix(in srgb,var(--danger) 9%,var(--surface));border:1px solid color-mix(in srgb,var(--danger) 30%,var(--border));color:var(--danger);border-radius:10px;padding:9px 12px;font-size:12px;font-weight:600;margin-bottom:10px}'+
      '.fa-flag{background:color-mix(in srgb,var(--warn) 10%,var(--surface));border:1px solid color-mix(in srgb,var(--warn) 30%,var(--border));color:var(--warn);border-radius:10px;padding:8px 12px;font-size:11px;font-weight:600;margin-bottom:10px}'+
      '.fa-mini{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:10px;text-align:center;background:var(--surface2);border-radius:10px;padding:10px}'+
      '.fa-mini b{display:block;font-size:17px;font-family:\'JetBrains Mono\',monospace;font-variant-numeric:tabular-nums}'+
      '.fa-mini span{font-size:10px;color:var(--muted)}'+
      '.fa-mq-row{display:flex;align-items:center;gap:8px;font-size:12px;padding:5px 0;border-bottom:1px dashed var(--border)}'+
      '.fa-benchrow-hi td{background:color-mix(in srgb,var(--warn) 8%,var(--surface))}'+
      '.fa-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--muted)}'+
      // خطوات نافذة «تفاصيل المراجعة» — خط زمني قرائي لما فعله المدقّق والمشتريات
      '.fa-step{border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;background:var(--surface)}'+
      '.fa-step-h{display:flex;align-items:center;gap:8px;font-weight:800;font-size:12px;margin-bottom:5px;flex-wrap:wrap}'+
      '.fa-step-meta{font-size:10px;color:var(--muted);font-weight:600}'+
      '.fa-step-body{font-size:12px;line-height:1.9}'+
      '.fa-step-body b{font-weight:700}'+
      '.fa-step-off{opacity:.6}'+
      // مؤشر تحميل بنود التدقيق — قبل وصول أول لقطة من Firestore
      '.fa-spin{width:34px;height:34px;border-radius:50%;border:3px solid var(--border);border-top-color:var(--primary);margin:0 auto 12px;animation:fa-rot .8s linear infinite}'+
      '@keyframes fa-rot{to{transform:rotate(360deg)}}'+
      '@media (prefers-reduced-motion: reduce){ .fa-spin{animation:none} }'+
      // نافذة المراجعة بحجم نافذة تفاصيل طلب الشراء (max-width:min(1180px,96vw))
      // مع تمرير داخلي وارتفاع أقصى 92vh — showCustomModal النواة صندوقها 420px
      // بلا max-height فيفيض المحتوى الطويل خارج الشاشة (أبلغها المستخدم من الآيباد).
      // الأنماط inline على الصندوق فالتجاوز يحتاج !important، وورقة الوحدة تُحقن
      // لاحقاً فتفوز (نفس درس v18.9wd). الخلفية من توكن الثيم بدل #fff الصلبة.
      '#_dyn-inv-modal > div.fa-modal-wide{max-width:min(1180px,96vw)!important;width:96%!important;max-height:92vh;overflow-y:auto;background:var(--surface)!important;color:var(--text)}'+
      '@media (max-width:560px){ #_dyn-inv-modal > div.fa-modal-wide{max-height:97vh;border-radius:12px} }'+
      '@media (max-width:560px){ .fa-stats{grid-template-columns:repeat(2,1fr)} }';
    document.head.appendChild(st);
  }

  // توسيع نافذة showCustomModal المفتوحة لحجم نافذة تفاصيل طلب الشراء — يُستدعى بعد فتحها
  function _widenModal(){
    try{
      var box=document.querySelector('#_dyn-inv-modal > div');
      if(box) box.classList.add("fa-modal-wide");
    }catch(e){}
  }

  function _auditOf(month){ return _audits.find(function(a){ return (a.month||a.id)===month; }) || null; }

  // تحديث النسخة المحلية لدورةٍ بعد نجاح معاملة — فتعكس الشاشة الحالة الجديدة
  // فوراً (closeAudit يقرأ المحلي!) ولا تنتظر لقطة onSnapshot؛ اللقطة توحّد لاحقاً.
  // كشفته رحلة E2E: بلا هذا كان إغلاق الدورة يُرفض ظلماً («بنود مفتوحة») لأن
  // الذاكرة المحلية بقيت على الحالة السابقة رغم نجاح كل المعاملات.
  function _applyLocalDoc(month, doc){
    _audits=_audits.filter(function(a){ return (a.month||a.id)!==month; });
    _audits.unshift(Object.assign({id:month}, JSON.parse(JSON.stringify(doc))));
    _audits.sort(function(a,b){ return String(b.month||b.id).localeCompare(String(a.month||a.id)); });
  }

  // معاملة على وثيقة الدورة: تقرأ الطازج، تطبّق mutate على نسخة، تكتب —
  // وعند النجاح تحدّث النسخة المحلية فوراً.
  function _txAudit(month, mutate){
    if(typeof db==="undefined" || !db) return Promise.reject(new Error("no db"));
    var ref=db.collection(COLL()).doc(month);
    return db.runTransaction(function(tx){
      return tx.get(ref).then(function(snap){
        if(!snap.exists) throw new Error("audit missing");
        var doc=JSON.parse(JSON.stringify(snap.data()));
        var next=mutate(doc)||doc;
        tx.set(ref, next, {merge:false});
        return next;
      });
    }).then(function(next){ _applyLocalDoc(month, next); return next; });
  }

  // تعديل عينة واحدة داخل الدورة (بالدمج على الطازج — لا دهس لعمل متزامن).
  function _txSample(month, poId, patch){
    return _txAudit(month, function(doc){
      var s=(doc.samples||[]).find(function(x){ return x && x.poId===poId; });
      if(!s) throw new Error("sample missing");
      Object.assign(s, patch);
      return doc;
    });
  }

  /* ════════════════════════════════════════════════════════════════════
     إنشاء دورة التدقيق الشهرية
     ════════════════════════════════════════════════════════════════════ */

  function _poolForMonth(month){
    return _pos().filter(function(p){
      return p && _isClosed(p) && _monthKey(_poClosedAtISO(p,_normStatus))===month;
    });
  }

  function openCreate(){
    if(!_canAudit()){ _toast("⚠ صلاحية المالية أو المسؤول فقط","warn"); return; }
    // خيارات آخر ٦ أشهر (الافتراضي: الشهر السابق) مع عدد الطلبات المغلقة في كلٍّ
    var mk=_monthKey(_now());
    var opts=[], cur=_prevMonthKey(mk);
    for(var i=0;i<6 && cur;i++){
      var n=_poolForMonth(cur).length;
      var has=!!_auditOf(cur);
      opts.push('<option value="'+cur+'"'+(i===0?' selected':'')+(has?' disabled':'')+'>'+_monthLabel(cur)+' — '+n+' طلب مغلق'+(has?' (له دورة)':'')+'</option>');
      cur=_prevMonthKey(cur);
    }
    try{
      showCustomModal({
        title:"🎯 بدء دورة تدقيق شهرية",
        body:'<div class="form-group"><label class="form-label">الشهر المُدقَّق (شهر الإغلاق الفعلي للطلبات)</label>'+
             '<select class="form-select" id="fa-month">'+opts.join("")+'</select></div>'+
             '<div style="font-size:11px;color:var(--muted);line-height:1.9">'+
             'يختار النظام عينة عشوائية <b>حتمية</b> ('+FA_PCT+'٪ — بين '+FA_MIN+' و'+FA_MAX+' طلبات) مرجّحة بالقيمة، '+
             'ويضيف آلياً أي طلب فيه إشارة خطر (تجاوز أرخص عرض / تجاوز التقدير '+FA_EST_OVER_PCT+'٪ / مبلغ ≥ '+_fmt(FA_BIG_NO_COMPARE)+' بلا مقارنة). '+
             'البذرة تُشتق من الشهر والطلبات المرشّحة فلا يمكن إعادة السحب.</div>',
        okText:"🎲 اختيار العينة وبدء الدورة",
        onOk:function(){
          var m=((document.getElementById("fa-month")||{}).value||"").trim();
          if(!m){ _toast("⚠ اختر الشهر","warn"); return false; }
          return createAudit(m);
        }
      });
    }catch(e){ _toast("⚠ تعذّر فتح النموذج","warn"); }
  }

  // يُرجع true للنجاح (يغلق المودال) — false للبقاء.
  async function createAudit(month){
    if(_busy) return false;
    if(!_canAudit()){ _toast("⚠ صلاحية المالية أو المسؤول فقط","warn"); return false; }
    var pool=_poolForMonth(month);
    if(!pool.length){ _toast("⚠ لا توجد طلبات مغلقة فعلياً في "+_monthLabel(month),"warn"); return false; }

    var poolIds=pool.map(function(p){ return p.id; }).sort();
    var seedStr=month+"|"+poolIds.join(",");
    var pick=_pickSample(pool.map(function(p){ return {id:p.id, cost:_actualCost(p)}; }),
                         {pct:FA_PCT, min:FA_MIN, max:FA_MAX, seed:seedStr});
    var samples=[];
    var pickedSet={};
    pick.picked.forEach(function(id){ pickedSet[id]=1; });
    pool.forEach(function(p){
      var flags=_autoFlagsFor(p);
      var isRandom=!!pickedSet[p.id];
      if(!isRandom && !flags.length) return;
      samples.push({
        poId:p.id,
        source:(isRandom && flags.length)?"random_auto":(isRandom?"random":"auto"),
        reasons:flags,
        vendor:_vendorOf(p),          // لقطة للعرض السريع — المصدر الحي يبقى الطلب
        actualCost:_actualCost(p),
        status:"pending", verdict:"",
        findings:"", recommendation:"", potentialSaving:0,
        manualQuotes:[],
        reviewedBy:"", reviewedAt:"",
        procurementReply:"", procurementBy:"", procurementAt:"",
        closedBy:"", closedAt:"", closeNote:"", escalated:false
      });
    });
    var doc={
      month:month, createdAt:_now(), createdBy:_me(), status:"open",
      params:{pct:FA_PCT, min:FA_MIN, max:FA_MAX, tolerancePct:FA_TOL_PCT,
              histMonths:FA_HIST_MONTHS, bigNoCompare:FA_BIG_NO_COMPARE,
              estOverPct:FA_EST_OVER_PCT, vat:FA_VAT},
      pool:{size:pool.length, target:pick.target, seedHash:_hashSeed(seedStr)},
      samples:samples
    };

    _busy=true;
    try{
      var ref=db.collection(COLL()).doc(month);
      await db.runTransaction(function(tx){
        return tx.get(ref).then(function(snap){
          if(snap.exists) throw new Error("__EXISTS__");
          tx.set(ref, doc);
        });
      });
      _busy=false;
      _toast("✅ بدأت دورة تدقيق "+_monthLabel(month)+" — "+samples.length+" طلب في العينة","success");
      _log("بدء دورة رقابة مالية على المشتريات",
           _monthLabel(month)+" — عينة "+samples.length+"/"+pool.length+" (عشوائي "+pick.picked.length+" + آلي "+samples.filter(function(s){ return s.source==="auto"; }).length+")");
      // إدراجٌ متفائل محلياً حتى تظهر التفاصيل فوراً — onSnapshot يوحّدها لاحقاً
      _applyLocalDoc(month, doc);
      _curMonth=month; render();
      return true;
    }catch(e){
      _busy=false;
      if(String(e&&e.message)==="__EXISTS__"){
        _toast("⚠ لهذا الشهر دورة قائمة — فُتحت","warn");
        _curMonth=month; render();
        return true;
      }
      _toast("⚠ خطأ في إنشاء الدورة — تحقق من الاتصال","warn");
      return false;
    }
  }

  // حذف طلب واحد من عينة الدورة — المسؤول فقط (قرارٌ رقابي حسّاس: إخراج طلب من
  // التدقيق يُسجَّل في سجل التدقيق بمصدره وحالته حتى لا يكون باباً خلفياً صامتاً).
  function removeSample(poId){
    if(!_isAdmin()){ _toast("⚠ حذف طلب من العينة — صلاحية المسؤول فقط","warn"); return; }
    var a=_auditOf(_curMonth);
    if(!a || a.status==="closed"){ _toast("⚠ الدورة مغلقة — لا حذف بعد الإغلاق","warn"); return; }
    var s=(a.samples||[]).find(function(x){ return x && x.poId===poId; });
    if(!s) return;
    Promise.resolve(_confirm({
      title:"حذف الطلب من العينة؟",
      msg:"سيُحذف "+poId+" من عينة دورة "+_monthLabel(a.month||a.id)+
          (s.status!=="pending"?" بما فيه مراجعته وردوده المسجّلة":"")+
          ".\nالحذف يُقيَّد في سجل التدقيق باسمك.",
      icon:"🗑", okText:"حذف من العينة", okClass:"btn-danger"
    })).then(function(ok){
      if(!ok) return;
      _txAudit(a.month||a.id, function(doc){
        doc.samples=(doc.samples||[]).filter(function(x){ return x && x.poId!==poId; });
        return doc;
      }).then(function(){
        _toast("✅ حُذف "+poId+" من العينة","success");
        _log("حذف طلب من عينة الرقابة المالية",
             poId+" — دورة "+_monthLabel(a.month||a.id)+" — المصدر: "+(s.source||"—")+
             " — حالته عند الحذف: "+((STATUS_LABEL[s.status]||{}).l||s.status||"—"));
        render();
      }).catch(function(){ _toast("⚠ خطأ في الحذف — تحقق من الاتصال","warn"); });
    });
  }

  function removeAudit(month){
    if(!_isAdmin()){ _toast("⚠ صلاحية المسؤول فقط","warn"); return; }
    var a=_auditOf(month);
    if(!a) return;
    Promise.resolve(_confirm({
      title:"حذف دورة التدقيق؟",
      msg:"ستُحذف دورة "+_monthLabel(month)+" بكل عيناتها ونتائجها ("+(a.samples||[]).length+" عينة).",
      icon:"🗑", okText:"حذف", okClass:"btn-danger"
    })).then(function(ok){
      if(!ok) return;
      db.collection(COLL()).doc(month).delete().then(function(){
        _toast("✅ حُذفت الدورة","success");
        _log("حذف دورة رقابة مالية", _monthLabel(month));
        if(_curMonth===month) _curMonth=null;
        render();
      }).catch(function(){ _toast("⚠ خطأ في الحذف","warn"); });
    });
  }

  /* ════════════════════════════════════════════════════════════════════
     العرض
     ════════════════════════════════════════════════════════════════════ */

  var STATUS_LABEL={
    pending:              {l:"بانتظار المراجعة",     c:"var(--muted)"},
    awaiting_procurement: {l:"بانتظار رد المشتريات", c:"var(--warn)"},
    responded:            {l:"ردّت المشتريات",        c:"var(--info)"},
    closed:               {l:"مغلقة",                 c:"var(--accent)"}
  };
  var VERDICT_LABEL={
    match:      {l:"مطابق — أفضل سعر متاح",     c:"var(--accent)"},
    acceptable: {l:"فرق ضمن التسامح",            c:"var(--info)"},
    note:       {l:"ملاحظة — يوجد بديل أرخص",   c:"var(--warn)"},
    violation:  {l:"مخالفة — فرق جوهري",         c:"var(--danger)"}
  };
  // حبة موحّدة على نمط .badge في النواة — اللون من توكنز الثيم عبر --pc
  function _pill(label,color,title){
    return '<span class="fa-pill" style="--pc:'+color+'"'+(title?' title="'+_esc(title)+'"':'')+'><span class="fa-dot"></span>'+label+'</span>';
  }
  function _statusBadge(st){
    var m=STATUS_LABEL[st]||STATUS_LABEL.pending;
    return _pill(m.l, m.c);
  }
  function _verdictBadge(v){
    var m=VERDICT_LABEL[v];
    return m ? _pill(m.l, m.c) : '<span style="color:var(--muted)">—</span>';
  }
  function _reasonsTitle(s){
    var parts=(s.reasons||[]).map(function(r){ return FLAG_LABELS[r]||r; });
    if(s.source==="manual" && s.manualReason) parts.unshift("سبب الإضافة اليدوية: "+s.manualReason);
    return parts.join(" · ");
  }
  function _srcBadge(s){
    if(s.source==="auto")        return _pill("مُدرج آلياً","var(--danger)",_reasonsTitle(s));
    if(s.source==="random_auto") return _pill("عشوائي + إشارة","var(--warn)",_reasonsTitle(s));
    if(s.source==="manual")      return _pill("مُضاف يدوياً","var(--info)",_reasonsTitle(s));
    return _pill("عشوائي","var(--muted)");
  }
  function _monthLabel(mk){
    try{
      var d=new Date(mk+"-01T12:00:00");
      if(!isNaN(d.getTime()))
        return d.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn",{year:"numeric",month:"long"});
    }catch(e){}
    return mk;
  }
  // تاريخ ووقت قرائيان لطوابع المراجعة/الرد/الإغلاق (ميلادي بأرقام لاتينية)
  function _fmtDT(iso){
    if(!iso) return "";
    try{
      var d=new Date(iso);
      if(!isNaN(d.getTime()))
        return d.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn",{year:"numeric",month:"2-digit",day:"2-digit"})+
               " "+d.toLocaleTimeString("ar-SA-u-ca-gregory-nu-latn",{hour:"2-digit",minute:"2-digit"});
    }catch(e){}
    return String(iso).slice(0,16).replace("T"," ");
  }

  function render(){
    var host=document.getElementById("page-finance-audit");
    if(!host) return;
    _injectCSS();
    _navToggle();
    if(!_canView()){
      host.innerHTML='<div class="card"><div class="fa-empty"><div class="fa-empty-ic">'+_icn("lock")+'</div>هذا القسم متاح للمالية والمشتريات والإدارة فقط.</div></div>';
      return;
    }
    startSync(); // فُتحت الشاشة ولا مشترك (دورٌ لم يُحمَّل له مسبقاً)؟ رَكِّبه — الدالة idempotent
    // قبل وصول أول لقطة من Firestore: مؤشر تحميل — لا «لا توجد دورات» المضللة
    if(!_loaded){
      host.innerHTML=_heroHtml(
        "الرقابة المالية على المشتريات",
        "عينة شهرية يحددها النظام (عشوائية حتمية + استثناءات آلية) لتدقيق المالية على الطلبات المنفَّذة.",
        ""
      )+'<div class="card"><div class="fa-empty"><div class="fa-spin"></div>جارٍ تحميل بنود التدقيق…</div></div>';
      return;
    }
    if(_curMonth){
      var a=_auditOf(_curMonth);
      if(!a){ _curMonth=null; return render(); }
      host.innerHTML=_detailHtml(a);
    } else {
      host.innerHTML=_listHtml();
    }
  }

  // هيرو الصفحة — نفس نمط page-hero في النواة (تدرّج كحلي + أزرار شفافة بيضاء)
  function _heroHtml(title, sub, actionsHtml){
    return '<div class="page-hero">'+
      '<div class="page-hero-titles">'+
        '<div class="page-hero-title"><span class="ph-ico">'+_icn("shield")+'</span>'+title+'</div>'+
        '<div class="page-hero-sub">'+sub+'</div>'+
      '</div>'+
      '<div class="page-hero-actions">'+(actionsHtml||"")+'</div>'+
    '</div>';
  }

  function _auditStats(a){
    var ss=a.samples||[];
    var closed=ss.filter(function(s){ return s.status==="closed"; }).length;
    var awaiting=ss.filter(function(s){ return s.status==="awaiting_procurement"; }).length;
    var responded=ss.filter(function(s){ return s.status==="responded"; }).length;
    var pending=ss.filter(function(s){ return s.status==="pending"; }).length;
    var saving=ss.reduce(function(t,s){ return t+(Number(s.potentialSaving)||0); },0);
    var issues=ss.filter(function(s){ return s.verdict==="note"||s.verdict==="violation"; }).length;
    return { total:ss.length, closed:closed, awaiting:awaiting, responded:responded, pending:pending,
             saving:Math.round(saving*100)/100, issues:issues };
  }

  function _listHtml(){
    var canA=_canAudit();
    var hero=_heroHtml(
      "الرقابة المالية على المشتريات",
      "عينة شهرية يحددها النظام (عشوائية حتمية + استثناءات آلية) لتدقيق المالية على الطلبات المنفَّذة.",
      canA?'<button class="btn btn-sm" onclick="window.financeAudit.openCreate()">'+_icn("target")+' بدء دورة تدقيق</button>':""
    );

    if(!_audits.length){
      // تعذر الوصول للبيانات ≠ «لا دورات» — رسالة صادقة مع إعادة محاولة
      if(_connIssue){
        return hero+'<div class="card"><div class="fa-empty">'+
          '<div class="fa-empty-ic">'+_icn("alertTriangle")+'</div>'+
          'تعذّر تحميل بيانات التدقيق — تحقق من الاتصال.'+
          '<div style="margin-top:14px"><button class="btn btn-primary btn-sm" onclick="window.financeAudit.retryLoad()">🔄 إعادة المحاولة</button></div>'+
        '</div></div>';
      }
      return hero+'<div class="card"><div class="fa-empty">'+
        '<div class="fa-empty-ic">'+_icn("search")+'</div>'+
        'لا توجد دورات تدقيق بعد.'+
        (canA?'<div style="margin-top:14px"><button class="btn btn-primary btn-sm" onclick="window.financeAudit.openCreate()">'+_icn("target")+' بدء أول دورة تدقيق</button></div>':'<div style="margin-top:10px">يتولّى قسم المالية بدء الدورات.</div>')+
      '</div></div>';
    }

    // إجماليات تراكمية عبر كل الدورات
    var tTotal=0,tIssues=0,tSaving=0,tOpen=0;
    _audits.forEach(function(a){
      var st=_auditStats(a);
      tTotal+=st.total; tIssues+=st.issues; tSaving+=st.saving;
      if(a.status!=="closed") tOpen++;
    });
    var stats='<div class="fa-stats">'+
      _stat("دورات التدقيق", _audits.length, "var(--primary)")+
      _stat("دورات جارية", tOpen, tOpen?"var(--warn)":"var(--muted)")+
      _stat("بنود مُدقَّقة", tTotal, "var(--info)")+
      _stat("ملاحظات ومخالفات", tIssues, tIssues?"var(--danger)":"var(--muted)")+
      _stat("وفر محتمل (ريال)", _fmt(tSaving), tSaving>0?"var(--accent)":"var(--muted)")+
    '</div>';

    var rows=_audits.map(function(a){
      var st=_auditStats(a);
      var open=a.status!=="closed";
      var pct=st.total?Math.round(st.closed/st.total*100):0;
      return '<tr class="fa-click" onclick="window.financeAudit.open(\''+_jq(a.month||a.id)+'\')">'+
        '<td style="font-weight:700">'+_monthLabel(a.month||a.id)+'</td>'+
        '<td style="text-align:center"><span class="fa-num">'+st.total+'</span> <span style="color:var(--muted);font-size:10px">من '+((a.pool&&a.pool.size)||"—")+'</span></td>'+
        '<td><div class="fa-progress-cell"><div class="fa-progress"><i style="width:'+pct+'%"></i></div><span class="fa-num" style="font-size:11px;color:var(--muted)">'+st.closed+'/'+st.total+'</span></div></td>'+
        '<td style="text-align:center;font-weight:700;color:'+(st.issues?'var(--danger)':'var(--muted)')+'"><span class="fa-num">'+st.issues+'</span></td>'+
        '<td style="text-align:center;font-weight:700;color:'+(st.saving>0?'var(--accent)':'var(--muted)')+'"><span class="fa-num">'+_fmt(st.saving)+'</span></td>'+
        '<td style="text-align:center">'+(open?_pill("جارية","var(--info)"):_pill("مغلقة","var(--accent)"))+'</td>'+
      '</tr>';
    }).join("");

    return hero+stats+
      '<div class="fa-table-wrap">'+
        '<table class="fa-table">'+
          '<thead><tr>'+
            '<th>الشهر المُدقَّق</th>'+
            '<th style="text-align:center">العينة</th>'+
            '<th>التقدّم</th>'+
            '<th style="text-align:center">ملاحظات/مخالفات</th>'+
            '<th style="text-align:center">وفر محتمل (ريال)</th>'+
            '<th style="text-align:center">الحالة</th>'+
          '</tr></thead><tbody>'+rows+'</tbody>'+
        '</table>'+
      '</div>';
  }

  // بطاقة إحصاء بنمط stat-card في النواة (شريط علوي بلون --sc + رقم جدولي)
  function _stat(label,val,color){
    return '<div class="stat-card" style="--sc:'+color+'"><div class="sl">'+label+'</div><div class="sv">'+val+'</div></div>';
  }
  // إحصاء مصغّر داخل النوافذ/الملخصات
  function _kpi(label,val,color){
    return '<div><b style="color:'+color+'">'+val+'</b><span>'+label+'</span></div>';
  }

  function _detailHtml(a){
    var st=_auditStats(a);
    var canA=_canAudit(), canR=_canRespond();
    var open=a.status!=="closed";
    var month=a.month||a.id;

    var tools='<button class="btn btn-sm" onclick="window.financeAudit.back()">← رجوع</button>'+
      ' <button class="btn btn-sm" onclick="window.financeAudit.printReport()">'+_icn("printer")+' تقرير الشهر</button>';
    if(canA && open)
      tools+=' <button class="btn btn-sm" onclick="window.financeAudit.openAddManual()">'+_icn("plus")+' إضافة طلب للعينة</button>';
    if(canA && open && st.closed===st.total && st.total>0)
      tools+=' <button class="btn btn-sm" onclick="window.financeAudit.closeAudit()">'+_icn("checkCircle")+' إغلاق الدورة</button>';
    if(_isAdmin())
      tools+=' <button class="btn btn-sm" onclick="window.financeAudit.removeAudit(\''+_jq(month)+'\')">'+_icn("trash")+' حذف</button>';

    var hero=_heroHtml(
      "دورة تدقيق "+_monthLabel(month),
      "الرقابة المالية على المشتريات — أنشأها "+_esc(a.createdBy||"—")+" · عينة "+st.total+" من "+((a.pool&&a.pool.size)||"—")+" طلباً مغلقاً"+(open?"":" · الدورة مغلقة"),
      tools
    );

    // شريط النزاهة: بصمة البذرة الحتمية (لا يمكن إعادة السحب) + معايير الدورة المخزّنة
    var prm=a.params||{};
    var meta='<div class="card" style="padding:10px 14px"><div class="fa-meta">'+
      '<span class="fa-seed" title="البذرة مشتقة من الشهر ومعرّفات كل المرشّحين — نفس المدخلات تعطي نفس العينة دائماً">'+_icn("lock")+' seed '+((a.pool&&a.pool.seedHash)||"—")+'</span>'+
      '<span>عينة حتمية — لا يمكن إعادة السحب</span>'+
      '<span>·</span><span>عشوائي '+(prm.pct!=null?prm.pct:"—")+'٪ ['+(prm.min!=null?prm.min:"—")+'–'+(prm.max!=null?prm.max:"—")+']</span>'+
      '<span>·</span><span>تسامح '+(prm.tolerancePct!=null?prm.tolerancePct:"—")+'٪</span>'+
      '<span>·</span><span>تاريخ '+(prm.histMonths!=null?prm.histMonths:"—")+' أشهر</span>'+
    '</div></div>';

    var kpis='<div class="fa-stats">'+
      _stat("حجم العينة", st.total, "var(--primary)")+
      _stat("بانتظار المراجعة", st.pending, st.pending?"var(--warn)":"var(--muted)")+
      _stat("بانتظار رد المشتريات", st.awaiting, st.awaiting?"var(--warn)":"var(--muted)")+
      _stat("ردّت المشتريات", st.responded, st.responded?"var(--info)":"var(--muted)")+
      _stat("مغلقة", st.closed, "var(--accent)")+
      _stat("وفر محتمل (ريال)", _fmt(st.saving), st.saving>0?"var(--accent)":"var(--muted)")+
    '</div>';

    var rows=(a.samples||[]).map(function(s){
      var p=_poMeta(s.poId);
      var cost=p?_actualCost(p):(Number(s.actualCost)||0);
      var vend=p?_vendorOf(p):(s.vendor||"");
      var acts='<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="event.stopPropagation();try{openPurchaseDetail(\''+_jq(s.poId)+'\')}catch(e){}">'+_icn("receipt")+' الطلب</button>'+
        ' <button class="btn btn-ghost btn-sm" style="font-size:11px" title="ماذا فعل المدقّق: الحكم والملاحظات والعروض والرد والإغلاق" onclick="event.stopPropagation();window.financeAudit.openDetails(\''+_jq(s.poId)+'\')">'+_icn("eye")+' التفاصيل</button>';
      if(canA && open && (s.status==="pending"||s.status==="awaiting_procurement"))
        acts+=' <button class="btn btn-primary btn-sm" style="font-size:11px" onclick="event.stopPropagation();window.financeAudit.openReview(\''+_jq(s.poId)+'\')">'+_icn("search")+' '+(s.status==="pending"?"مراجعة":"تعديل المراجعة")+'</button>';
      if(canR && open && s.status==="awaiting_procurement")
        acts+=' <button class="btn btn-primary btn-sm" style="font-size:11px" onclick="event.stopPropagation();window.financeAudit.openReply(\''+_jq(s.poId)+'\')">💬 رد المشتريات</button>';
      if(canA && open && s.status==="responded")
        acts+=' <button class="btn btn-primary btn-sm" style="font-size:11px" onclick="event.stopPropagation();window.financeAudit.openClose(\''+_jq(s.poId)+'\')">'+_icn("checkCircle")+' إغلاق البند</button>';
      if(_isAdmin() && open)
        acts+=' <button class="btn btn-ghost btn-sm" style="font-size:11px;color:var(--danger)" title="حذف الطلب من العينة (المسؤول فقط)" onclick="event.stopPropagation();window.financeAudit.removeSample(\''+_jq(s.poId)+'\')">🗑</button>';
      var savings=Number(s.potentialSaving)||0;
      // أسباب الإدراج الآلي ظاهرة نصاً تحت الشارة — الـ tooltip وحده لا يظهر على اللمس (آيباد/جوال)
      var reasonsTxt=_reasonsTitle(s);
      var srcCell=_srcBadge(s)+(reasonsTxt?'<div style="font-size:9px;color:var(--muted);margin-top:3px;max-width:230px;line-height:1.7">'+_esc(reasonsTxt)+'</div>':"");
      return '<tr>'+
        '<td style="font-weight:700"><span class="fa-num">'+_esc(s.poId)+'</span></td>'+
        '<td>'+srcCell+'</td>'+
        '<td>'+_esc(vend||"—")+'</td>'+
        '<td style="text-align:center"><span class="fa-num">'+_fmt(cost)+'</span></td>'+
        '<td>'+_verdictBadge(s.verdict)+(s.escalated?' '+_pill("مُصعَّد للتنفيذي","var(--danger)"):"")+'</td>'+
        '<td style="text-align:center;font-weight:700;color:'+(savings>0?'var(--accent)':'var(--muted)')+'"><span class="fa-num">'+(savings>0?_fmt(savings):"—")+'</span></td>'+
        '<td style="text-align:center">'+_statusBadge(s.status)+'</td>'+
        '<td style="white-space:nowrap">'+acts+'</td>'+
      '</tr>';
    }).join("");

    if(!rows) rows='<tr><td colspan="8" style="padding:20px;text-align:center;color:var(--muted)">لا عينات في هذه الدورة.</td></tr>';

    return hero+meta+kpis+
      '<div class="fa-table-wrap">'+
        '<table class="fa-table">'+
          '<thead><tr>'+
            '<th>رقم الطلب</th>'+
            '<th>مصدر الإدراج</th>'+
            '<th>المورد الفعلي</th>'+
            '<th style="text-align:center">التكلفة الفعلية</th>'+
            '<th>الحكم</th>'+
            '<th style="text-align:center">وفر محتمل</th>'+
            '<th style="text-align:center">الحالة</th>'+
            '<th>إجراءات</th>'+
          '</tr></thead><tbody>'+rows+'</tbody>'+
        '</table>'+
      '</div>'+
      '<div class="fa-note" style="margin-top:12px">'+
        'المقارنات <b>استرشادية</b>: أسعار التاريخ والكتالوج صافي ضريبة وتُقارن بصافي سعر الوحدة الفعلي، وأرخص عرض مسجّل يُرفع '+Math.round((FA_VAT-1)*100)+'٪ ضريبةً قبل مقارنته بإجمالي الفاتورة. '+
        'الملاحظة/المخالفة تُحال لرد قسم المشتريات قبل الإغلاق — الفرق السعري قد يبرَّر بالجودة أو سرعة التوريد أو حد أدنى للطلب.'+
      '</div>';
  }

  /* ════════════════════════════════════════════════════════════════════
     نافذة المراجعة (المالية)
     ════════════════════════════════════════════════════════════════════ */

  function _benchForPO(p){
    var items=(p.items||[]).map(function(it){
      var rcv=Number(it.rcvQty);
      return { name:(it&&it.itemName)||"", qty:(it.rcvQty!=null&&rcv>0)?rcv:(Number(it&&it.qty)||1), unit:_unitNet(it) };
    }).filter(function(x){ return x.name; });
    return _itemBench(items, _refRows(p), FA_TOL_PCT);
  }

  function _benchHtml(p, bench){
    var actual=_actualCost(p), est=_estTotal(p), qmin=_quoteMin(p);
    var head='<div class="fa-mini">'+
      _kpi("التكلفة الفعلية (شامل الضريبة)", _fmt(actual), "var(--primary)")+
      _kpi("التقديرية عند الطلب", est?_fmt(est):"—", "var(--muted)")+
      _kpi("أرخص عرض مسجّل (صافي)", qmin?_fmt(qmin):"—", qmin&&actual>qmin*FA_VAT?"var(--danger)":"var(--muted)")+
      _kpi("وفر محتمل من البدائل", _fmt(bench.totalSaving), bench.totalSaving>0?"var(--accent)":"var(--muted)")+
    '</div>';
    if(qmin>0 && actual>qmin*FA_VAT*(1+FA_TOL_PCT/100)){
      head+='<div class="fa-alert">'+_icn("alertTriangle")+' التكلفة الفعلية تجاوزت أرخص عرض كامل مسجّل على الطلب ('+_fmt(qmin)+' صافي ≈ '+_fmt(qmin*FA_VAT)+' مع الضريبة).</div>';
    }
    var rows=bench.rows.map(function(r){
      var b=r.best;
      var alt=b
        ? _esc(b.vendor||"—")+' — <b class="fa-num" style="display:inline">'+_fmt(b.unit)+'</b> <span style="font-size:9px;color:var(--muted)">('+(b.src==="catalog"?"الكتالوج":"طلب "+_esc(b.ref))+')</span>'
        : '<span style="color:var(--muted)">لا مرجع لنفس البند</span>';
      var diff=(b&&r.unit>0)?Math.round((r.unit-b.unit)/b.unit*1000)/10:null;
      return '<tr'+(r.overTol?' class="fa-benchrow-hi"':'')+'>'+
        '<td>'+_esc(r.name)+'</td>'+
        '<td style="text-align:center"><span class="fa-num">'+r.qty+'</span></td>'+
        '<td style="text-align:center;font-weight:700"><span class="fa-num">'+_fmt(r.unit)+'</span></td>'+
        '<td>'+alt+'</td>'+
        '<td style="text-align:center;font-weight:700;color:'+(diff==null?'var(--muted)':(diff>0?'var(--danger)':'var(--accent)'))+'"><span class="fa-num">'+(diff==null?"—":(diff>0?"+":"")+diff+"٪")+'</span></td>'+
        '<td style="text-align:center;font-weight:700;color:'+(r.saving>0?'var(--accent)':'var(--muted)')+'"><span class="fa-num">'+(r.saving>0?_fmt(r.saving):"—")+'</span></td>'+
      '</tr>';
    }).join("");
    if(!rows) rows='<tr><td colspan="6" style="padding:14px;text-align:center;color:var(--muted)">لا بنود مسمّاة في الطلب.</td></tr>';
    return head+
      '<div class="fa-table-wrap" style="margin-bottom:10px;box-shadow:none">'+
      '<table class="fa-table" style="font-size:11px">'+
        '<thead><tr>'+
          '<th>البند</th>'+
          '<th style="text-align:center">الكمية</th>'+
          '<th style="text-align:center">سعر وحدتنا (صافي)</th>'+
          '<th>أفضل بديل (تاريخ '+FA_HIST_MONTHS+' أشهر + كتالوج)</th>'+
          '<th style="text-align:center">الفرق</th>'+
          '<th style="text-align:center">وفر محتمل</th>'+
        '</tr></thead><tbody>'+rows+'</tbody>'+
      '</table></div>';
  }

  // رابط مرفق الدليل (صورة عرض المورد/PDF) — عبر safeUrl النواة، يفتح في تبويب جديد
  function _mqFileLink(q){
    if(!q || !q.fileUrl) return "";
    var u=q.fileUrl;
    try{ if(typeof safeUrl==="function") u=safeUrl(u); }catch(e){}
    return ' <a href="'+u+'" target="_blank" rel="noopener" style="font-size:10px;color:var(--info);font-weight:700;white-space:nowrap">📎 '+_esc(q.fileName||"مرفق")+'</a>';
  }

  function _mqListHtml(){
    if(!_mq.length) return '<div style="font-size:11px;color:var(--muted)">لا عروض يدوية مضافة.</div>';
    return _mq.map(function(q,i){
      return '<div class="fa-mq-row">'+
        '<b>'+_esc(q.supplier)+'</b>'+
        '<span class="fa-num" style="text-align:left">'+_fmt(q.price)+' ر.س</span>'+
        (q.note?'<span style="color:var(--muted)">— '+_esc(q.note)+'</span>':"")+
        _mqFileLink(q)+
        '<button class="btn btn-ghost btn-sm" style="font-size:10px;margin-inline-start:auto" onclick="window.financeAudit.removeManualQuote('+i+')">✖</button>'+
      '</div>';
    }).join("");
  }

  // عرضٌ قرائي للعروض اليدوية المحفوظة على عينة (لنافذتي رد المشتريات والإغلاق):
  // المشتريات تحتاج رؤية العرض البديل ودليله المرفق لتكتب مبررها على بيّنة.
  function _mqReadonlyHtml(s){
    var list=(s&&s.manualQuotes)||[];
    if(!list.length) return "";
    return '<div><b>عروض بديلة سجّلها التدقيق:</b> '+list.map(function(q){
      return _esc(q.supplier)+' — <span class="fa-num" style="display:inline">'+_fmt(q.price)+'</span> ر.س'+_mqFileLink(q);
    }).join(" · ")+'</div>';
  }

  function openReview(poId){
    if(!_canAudit()){ _toast("⚠ صلاحية المالية أو المسؤول فقط","warn"); return; }
    var a=_auditOf(_curMonth);
    var s=a&&(a.samples||[]).find(function(x){ return x.poId===poId; });
    if(!s){ _toast("⚠ العينة غير موجودة","warn"); return; }
    var p=_poMeta(poId);
    if(!p){ _toast("⚠ الطلب غير موجود في الذاكرة — حدّث الصفحة","warn"); return; }

    _mq=(s.manualQuotes||[]).map(function(q){ return Object.assign({},q); });
    _curPoIdForMq=poId;
    var bench=_benchForPO(p);
    var reasons=(s.reasons||[]).map(function(r){ return FLAG_LABELS[r]||r; });

    var body=
      (reasons.length?'<div class="fa-flag">'+_icn("alertTriangle")+' أسباب الإدراج الآلي: '+_esc(reasons.join(" · "))+'</div>':"")+
      _benchHtml(p, bench)+
      '<div class="form-group" style="margin-top:6px"><label class="form-label">عروض بديلة يدوية (اتصال المدقّق بموردين)</label>'+
        '<div id="fa-mq-list" style="margin-bottom:6px">'+_mqListHtml()+'</div>'+
        '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'+
          '<input class="form-input" id="fa-mq-sup" placeholder="اسم المورد" style="flex:2;min-width:120px">'+
          '<input class="form-input" id="fa-mq-price" type="number" min="0" step="0.01" placeholder="السعر (ريال)" style="flex:1;min-width:90px">'+
          '<input class="form-input" id="fa-mq-note" placeholder="ملاحظة (اختياري)" style="flex:2;min-width:120px">'+
          '<input class="form-input" id="fa-mq-file" type="file" accept="image/*,application/pdf" style="flex:2;min-width:150px;font-size:11px" title="دليل العرض: صورة عرض المورد أو PDF (اختياري)">'+
          '<button class="btn btn-ghost btn-sm" id="fa-mq-add-btn" onclick="window.financeAudit.addManualQuote()">➕ إضافة</button>'+
        '</div>'+
        '<div id="fa-mq-status" style="font-size:10px;color:var(--muted);margin-top:4px"></div>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'+
        '<div class="form-group"><label class="form-label">الحكم *</label>'+
          '<select class="form-select" id="fa-verdict">'+
            '<option value="">— اختر —</option>'+
            Object.keys(VERDICT_LABEL).map(function(k){ return '<option value="'+k+'"'+(s.verdict===k?' selected':'')+'>'+VERDICT_LABEL[k].l+'</option>'; }).join("")+
          '</select></div>'+
        '<div class="form-group"><label class="form-label">وفر محتمل (ريال)</label>'+
          '<input class="form-input" type="number" min="0" step="0.01" id="fa-saving" value="'+(s.potentialSaving||bench.totalSaving||"")+'"></div>'+
      '</div>'+
      '<div class="form-group"><label class="form-label">الملاحظات (ما وجده التدقيق)</label>'+
        '<textarea class="form-input" id="fa-findings" rows="2" placeholder="مثال: المورد Y ورّد مواد النظافة بسعر أعلى 12% من المورد X في طلب سابق...">'+_esc(s.findings||"")+'</textarea></div>'+
      '<div class="form-group"><label class="form-label">التوصية</label>'+
        '<textarea class="form-input" id="fa-reco" rows="2" placeholder="مثال: اعتماد المورد X لمواد النظافة في الطلبات القادمة">'+_esc(s.recommendation||"")+'</textarea></div>'+
      '<div style="font-size:11px;color:var(--muted)">حكم «ملاحظة» أو «مخالفة» يُحيل البند تلقائياً لرد قسم المشتريات قبل الإغلاق؛ «مطابق» و«فرق مقبول» يُغلقان البند مباشرة.</div>';

    try{
      showCustomModal({
        title:"🔎 مراجعة مالية — طلب "+poId,
        body:body,
        okText:"💾 حفظ المراجعة",
        onOk:function(){ return saveReview(poId); }
      });
      _widenModal();   // بحجم نافذة تفاصيل طلب الشراء + تمرير داخلي (كانت تفيض خارج الشاشة)
    }catch(e){ _toast("⚠ تعذّر فتح نافذة المراجعة","warn"); }
  }

  // رفع دليل العرض اليدوي إلى Storage — نفس نمط رفع الفاتورة في النواة:
  // انتظار المصادقة، ضغط الصورة فوق 300KB (PDF كما هو)، ثم put + getDownloadURL.
  async function _uploadEvidence(file, poId){
    if(typeof storage==="undefined" || !storage) throw new Error("no-storage");
    try{ if(typeof _waitForFirebaseAuth==="function") await _waitForFirebaseAuth(); }catch(e){}
    var isPdf=(file.type==="application/pdf");
    var toUpload=file;
    if(!isPdf && file.size>300*1024 && typeof _compressImage==="function"){
      try{ toUpload=await _compressImage(file, 1800, 0.78); }catch(e){ toUpload=file; }
    }
    var ext=isPdf?"pdf":"jpg";
    var ref=storage.ref("finance_audits/"+(_curMonth||"misc")+"/"+poId+"/mq_"+Date.now()+"."+ext);
    var snap=await ref.put(toUpload, isPdf?{contentType:"application/pdf"}:{contentType:"image/jpeg"});
    var url=await snap.ref.getDownloadURL();
    return { url:url, name:(file.name||("دليل."+ext)) };
  }

  async function addManualQuote(){
    if(_mqBusy) return;
    var sup=((document.getElementById("fa-mq-sup")||{}).value||"").trim();
    var price=parseFloat((document.getElementById("fa-mq-price")||{}).value);
    var note=((document.getElementById("fa-mq-note")||{}).value||"").trim();
    var fileEl=document.getElementById("fa-mq-file");
    var file=(fileEl && fileEl.files && fileEl.files[0])||null;
    if(!sup || !(price>0)){ _toast("⚠ أدخل اسم المورد وسعراً صحيحاً","warn"); return; }

    var q={supplier:sup, price:price, note:note, fileUrl:"", fileName:"", by:_me(), at:_now()};
    var status=document.getElementById("fa-mq-status");
    var addBtn=document.getElementById("fa-mq-add-btn");
    if(file){
      _mqBusy=true;
      if(addBtn){ addBtn.disabled=true; addBtn.textContent="⏳ جارٍ رفع الدليل..."; }
      if(status) status.textContent="⏳ جارٍ رفع مرفق الدليل ("+_esc(file.name)+")…";
      try{
        var up=await _uploadEvidence(file, _curPoIdForMq||"");
        q.fileUrl=up.url; q.fileName=up.name;
        if(status) status.textContent="";
      }catch(e){
        _mqBusy=false;
        if(addBtn){ addBtn.disabled=false; addBtn.textContent="➕ إضافة"; }
        if(status) status.textContent="";
        _toast(String(e&&e.message)==="no-storage"
          ? "⚠ خدمة التخزين غير متاحة — أزل الملف لإضافة العرض بلا مرفق"
          : "⚠ فشل رفع المرفق — تحقق من الاتصال وأعد المحاولة","warn");
        return;   // لا يُضاف العرض بلا دليله المختار — حتى لا يظن المدقق أنه أُرفق
      }
      _mqBusy=false;
      if(addBtn){ addBtn.disabled=false; addBtn.textContent="➕ إضافة"; }
    }
    _mq.push(q);
    var list=document.getElementById("fa-mq-list");
    if(list) list.innerHTML=_mqListHtml();
    var i1=document.getElementById("fa-mq-sup"), i2=document.getElementById("fa-mq-price"), i3=document.getElementById("fa-mq-note");
    if(i1) i1.value=""; if(i2) i2.value=""; if(i3) i3.value="";
    if(fileEl) fileEl.value="";
  }
  function removeManualQuote(i){
    _mq.splice(i,1);
    var list=document.getElementById("fa-mq-list");
    if(list) list.innerHTML=_mqListHtml();
  }

  // يُرجع true للنجاح (يغلق المودال).
  async function saveReview(poId){
    if(_busy) return false;
    if(!_canAudit()){ _toast("⚠ صلاحية المالية أو المسؤول فقط","warn"); return false; }
    var verdict=((document.getElementById("fa-verdict")||{}).value||"").trim();
    if(!VERDICT_LABEL[verdict]){ _toast("⚠ اختر الحكم","warn"); return false; }
    var saving=parseFloat((document.getElementById("fa-saving")||{}).value)||0;
    var findings=((document.getElementById("fa-findings")||{}).value||"").trim();
    var reco=((document.getElementById("fa-reco")||{}).value||"").trim();
    if((verdict==="note"||verdict==="violation") && !findings){
      _toast("⚠ الملاحظة/المخالفة تحتاج وصفاً في «الملاحظات»","warn"); return false;
    }
    var needsReply=(verdict==="note"||verdict==="violation");
    var month=_curMonth;
    _busy=true;
    try{
      await _txSample(month, poId, {
        verdict:verdict, findings:findings, recommendation:reco,
        potentialSaving:Math.round(saving*100)/100,
        manualQuotes:_mq.map(function(q){ return Object.assign({},q); }),
        reviewedBy:_me(), reviewedAt:_now(),
        status:needsReply?"awaiting_procurement":"closed",
        closedBy:needsReply?"":_me(), closedAt:needsReply?"":_now()
      });
      _busy=false;
      _toast(needsReply?"✅ حُفظت المراجعة وأُحيل البند لرد المشتريات":"✅ حُفظت المراجعة وأُغلق البند","success");
      _log("مراجعة مالية لطلب شراء", poId+" — "+VERDICT_LABEL[verdict].l+(saving>0?" — وفر محتمل "+_fmt(saving):""));
      if(needsReply) _notify("ملاحظة رقابة مالية على طلب 🔍", poId+" — "+VERDICT_LABEL[verdict].l+" — مطلوب رد قسم المشتريات", poId, "po");
      render();
      return true;
    }catch(e){
      _busy=false;
      _toast("⚠ خطأ في الحفظ — تحقق من الاتصال","warn");
      return false;
    }
  }

  /* ════════════════════════════════════════════════════════════════════
     رد المشتريات ثم إغلاق المالية
     ════════════════════════════════════════════════════════════════════ */

  function openReply(poId){
    if(!_canRespond()){ _toast("⚠ صلاحية المشتريات أو المسؤول فقط","warn"); return; }
    var a=_auditOf(_curMonth);
    var s=a&&(a.samples||[]).find(function(x){ return x.poId===poId; });
    if(!s){ _toast("⚠ العينة غير موجودة","warn"); return; }
    var body=
      '<div class="fa-note" style="margin-bottom:10px;color:var(--text)">'+
        '<div><b>حكم المالية:</b> '+_verdictBadge(s.verdict)+'</div>'+
        (s.findings?'<div><b>الملاحظات:</b> '+_esc(s.findings)+'</div>':"")+
        (s.recommendation?'<div><b>التوصية:</b> '+_esc(s.recommendation)+'</div>':"")+
        _mqReadonlyHtml(s)+
      '</div>'+
      '<div class="form-group"><label class="form-label">رد قسم المشتريات (المبرر) *</label>'+
        '<textarea class="form-input" id="fa-reply" rows="3" placeholder="مثال: المورد الأرخص لا يوفر التوريد خلال 24 ساعة المطلوبة للموقع / جودة الصنف البديل أقل...">'+_esc(s.procurementReply||"")+'</textarea></div>';
    try{
      showCustomModal({
        title:"💬 رد المشتريات — طلب "+poId,
        body:body,
        okText:"📨 إرسال الرد للمالية",
        onOk:function(){ return saveReply(poId); }
      });
    }catch(e){ _toast("⚠ تعذّر فتح نافذة الرد","warn"); }
  }

  async function saveReply(poId){
    if(_busy) return false;
    if(!_canRespond()){ _toast("⚠ صلاحية المشتريات أو المسؤول فقط","warn"); return false; }
    var reply=((document.getElementById("fa-reply")||{}).value||"").trim();
    if(!reply){ _toast("⚠ اكتب المبرر","warn"); return false; }
    _busy=true;
    try{
      await _txSample(_curMonth, poId, {
        procurementReply:reply, procurementBy:_me(), procurementAt:_now(), status:"responded"
      });
      _busy=false;
      _toast("✅ أُرسل الرد للمالية","success");
      _log("رد المشتريات على ملاحظة رقابية", poId);
      _notify("رد المشتريات على ملاحظة رقابية 💬", poId+" — بانتظار إغلاق المالية", poId, "po");
      render();
      return true;
    }catch(e){ _busy=false; _toast("⚠ خطأ في الحفظ","warn"); return false; }
  }

  function openClose(poId){
    if(!_canAudit()){ _toast("⚠ صلاحية المالية أو المسؤول فقط","warn"); return; }
    var a=_auditOf(_curMonth);
    var s=a&&(a.samples||[]).find(function(x){ return x.poId===poId; });
    if(!s){ _toast("⚠ العينة غير موجودة","warn"); return; }
    var body=
      '<div class="fa-note" style="margin-bottom:10px;color:var(--text)">'+
        '<div><b>الحكم:</b> '+_verdictBadge(s.verdict)+'</div>'+
        (s.findings?'<div><b>ملاحظات المالية:</b> '+_esc(s.findings)+'</div>':"")+
        _mqReadonlyHtml(s)+
        (s.procurementReply?'<div><b>رد المشتريات:</b> '+_esc(s.procurementReply)+' <span style="color:var(--muted);font-size:10px">('+_esc(s.procurementBy||"")+')</span></div>':"")+
      '</div>'+
      '<div class="form-group"><label class="form-label">قرار الإغلاق *</label>'+
        '<div style="display:flex;gap:16px;flex-wrap:wrap">'+
          '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px"><input type="radio" name="fa-close-kind" value="accept" checked> ✅ الرد مقبول — إغلاق</label>'+
          '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px"><input type="radio" name="fa-close-kind" value="escalate"> ⬆ تصعيد للمدير التنفيذي</label>'+
        '</div></div>'+
      '<div class="form-group"><label class="form-label">ملاحظة الإغلاق (اختياري)</label>'+
        '<input class="form-input" id="fa-close-note" value="'+_esc(s.closeNote||"")+'"></div>';
    try{
      showCustomModal({
        title:"🔏 إغلاق بند الرقابة — طلب "+poId,
        body:body,
        okText:"✅ إغلاق البند",
        onOk:function(){ return saveClose(poId); }
      });
    }catch(e){ _toast("⚠ تعذّر فتح النافذة","warn"); }
  }

  async function saveClose(poId){
    if(_busy) return false;
    if(!_canAudit()){ _toast("⚠ صلاحية المالية أو المسؤول فقط","warn"); return false; }
    var kind=(document.querySelector('input[name="fa-close-kind"]:checked')||{}).value||"accept";
    var note=((document.getElementById("fa-close-note")||{}).value||"").trim();
    _busy=true;
    try{
      await _txSample(_curMonth, poId, {
        status:"closed", closedBy:_me(), closedAt:_now(), closeNote:note, escalated:(kind==="escalate")
      });
      _busy=false;
      _toast(kind==="escalate"?"✅ أُغلق البند مع التصعيد للتنفيذي":"✅ أُغلق البند","success");
      _log("إغلاق بند رقابة مالية", poId+(kind==="escalate"?" — مُصعَّد للتنفيذي":" — الرد مقبول"));
      if(kind==="escalate") _notify("تصعيد ملاحظة رقابة مالية ⬆", poId+" — للمدير التنفيذي"+(note?" — "+note:""), poId, "po");
      render();
      return true;
    }catch(e){ _busy=false; _toast("⚠ خطأ في الحفظ","warn"); return false; }
  }

  /* ════════════════════════════════════════════════════════════════════
     تفاصيل المراجعة (قراءة) — ماذا فعل المدقّق ومتى، ورد المشتريات، والإغلاق
     ════════════════════════════════════════════════════════════════════ */

  // خطوة في الخط الزمني: منجَزة تُعرض كاملة، وغير المنجَزة باهتة بنصّ حالة.
  function _stepHtml(ic, title, metaTxt, bodyHtml, done){
    return '<div class="fa-step'+(done?'':' fa-step-off')+'">'+
      '<div class="fa-step-h">'+ic+' '+title+(metaTxt?' <span class="fa-step-meta">'+metaTxt+'</span>':'')+'</div>'+
      (bodyHtml?'<div class="fa-step-body">'+bodyHtml+'</div>':'')+
    '</div>';
  }

  // قائمة العروض اليدوية كاملة (المورد · السعر · الملاحظة · الدليل · مَن ومتى)
  function _mqDetailsHtml(s){
    var list=(s&&s.manualQuotes)||[];
    if(!list.length) return "";
    return '<div style="margin-top:4px"><b>عروض بديلة سجّلها المدقّق ('+list.length+'):</b>'+
      list.map(function(q){
        return '<div class="fa-mq-row">'+
          '<b>'+_esc(q.supplier)+'</b>'+
          '<span class="fa-num" style="text-align:left">'+_fmt(q.price)+' ر.س</span>'+
          (q.note?'<span style="color:var(--muted)">— '+_esc(q.note)+'</span>':"")+
          _mqFileLink(q)+
          (q.by?'<span class="fa-step-meta" style="margin-inline-start:auto">'+_esc(q.by)+(q.at?' · '+_fmtDT(q.at):'')+'</span>':"")+
        '</div>';
      }).join("")+'</div>';
  }

  function openDetails(poId){
    if(!_canView()){ _toast("⚠ غير مخوَّل","warn"); return; }
    var a=_auditOf(_curMonth);
    var s=a&&(a.samples||[]).find(function(x){ return x.poId===poId; });
    if(!s){ _toast("⚠ العينة غير موجودة","warn"); return; }
    var p=_poMeta(poId);
    var cost=p?_actualCost(p):(Number(s.actualCost)||0);
    var vend=p?_vendorOf(p):(s.vendor||"");

    // بطاقة الإدراج: مصدره وأسبابه — واليدوي بمن أضافه ولماذا (قرار رقابي موثَّق)
    var srcBody='<div><b>المورد الفعلي:</b> '+_esc(vend||"—")+' · <b>التكلفة الفعلية:</b> <span class="fa-num" style="display:inline">'+_fmt(cost)+'</span> ر.س</div>';
    var autoReasons=(s.reasons||[]).map(function(r){ return FLAG_LABELS[r]||r; });
    if(autoReasons.length) srcBody+='<div><b>إشارات الإدراج الآلي:</b> '+_esc(autoReasons.join(" · "))+'</div>';
    if(s.source==="manual"){
      srcBody+='<div><b>أضافه يدوياً:</b> '+_esc(s.addedBy||"—")+(s.addedAt?' <span class="fa-step-meta">'+_fmtDT(s.addedAt)+'</span>':'')+'</div>'+
               (s.manualReason?'<div><b>سبب الإضافة:</b> '+_esc(s.manualReason)+'</div>':'');
    }

    // ١) المراجعة المالية
    var reviewed=!!s.reviewedAt;
    var revBody="";
    if(reviewed){
      revBody='<div><b>الحكم:</b> '+_verdictBadge(s.verdict)+
        ((Number(s.potentialSaving)||0)>0?' · <b>وفر محتمل:</b> <span class="fa-num" style="display:inline;color:var(--accent);font-weight:700">'+_fmt(s.potentialSaving)+'</span> ر.س':'')+'</div>'+
        (s.findings?'<div><b>ما وجده المدقّق:</b> '+_esc(s.findings)+'</div>':'')+
        (s.recommendation?'<div><b>التوصية:</b> '+_esc(s.recommendation)+'</div>':'')+
        _mqDetailsHtml(s);
    } else revBody='لم تتم المراجعة بعد.';

    // ٢) رد المشتريات — يظهر فقط حين استدعاه الحكم (ملاحظة/مخالفة)
    var needsReply=(s.verdict==="note"||s.verdict==="violation");
    var replied=!!s.procurementAt;
    var repBody="";
    if(replied){
      repBody='<div><b>المبرر:</b> '+_esc(s.procurementReply||"—")+'</div>';
    } else if(reviewed && needsReply) repBody='بانتظار رد قسم المشتريات.';
    else if(reviewed) repBody='لم يُطلب رد — الحكم لا يستدعي دورة رد.';
    else repBody='يتحدد بعد المراجعة.';

    // ٣) إغلاق البند
    var closed=(s.status==="closed");
    var clsBody="";
    if(closed){
      clsBody='<div><b>القرار:</b> '+(s.escalated?_pill("مُصعَّد للمدير التنفيذي","var(--danger)"):_pill(needsReply?"الرد مقبول — أُغلق":"أُغلق مع المراجعة","var(--accent)"))+'</div>'+
        (s.closeNote?'<div><b>ملاحظة الإغلاق:</b> '+_esc(s.closeNote)+'</div>':'');
    } else clsBody='البند ما زال مفتوحاً.';

    var body=
      _stepHtml(_srcBadge(s),'إدراج الطلب في العينة','', srcBody, true)+
      _stepHtml('🔎','المراجعة المالية', reviewed?_esc(s.reviewedBy||"—")+' · '+_fmtDT(s.reviewedAt):'', revBody, reviewed)+
      _stepHtml('💬','رد قسم المشتريات', replied?_esc(s.procurementBy||"—")+' · '+_fmtDT(s.procurementAt):'', repBody, replied)+
      _stepHtml('🔏','إغلاق البند', closed?_esc(s.closedBy||"—")+' · '+_fmtDT(s.closedAt):'', clsBody, closed)+
      '<div style="font-size:10px;color:var(--muted)">عرض قرائي — التعديل من أزرار «مراجعة» و«رد المشتريات» و«إغلاق البند» في جدول الدورة.</div>';

    try{
      showCustomModal({
        title:"👁 تفاصيل المراجعة — طلب "+poId,
        body:body,
        okText:"إغلاق",
        onOk:function(){ return true; }
      });
      _widenModal();
    }catch(e){ _toast("⚠ تعذّر فتح النافذة","warn"); }
  }

  /* ════════════════════════════════════════════════════════════════════
     إضافة طلب يدوياً لعينة الدورة — في أي وقت خلال الشهر، لأي طلب مغلق
     خارج العينة (شكوى · اشتباه · طلب الإدارة). القرار يُوثَّق بسببه واسم
     مضيفه في العينة نفسها وفي سجل التدقيق — لا إدخال صامتاً.
     ════════════════════════════════════════════════════════════════════ */

  var _manCands=[]; // مرشّحو الإضافة اليدوية داخل النافذة المفتوحة (للفلترة)

  function _manOptsHtml(filter){
    var q=_norm(filter||"");
    var list=q?_manCands.filter(function(c){ return _norm(c.id+" "+c.vendor).indexOf(q)>=0; }):_manCands;
    return list.slice(0,200).map(function(c){
      return '<option value="'+_esc(c.id)+'">'+_esc(c.id)+' — '+_esc(c.vendor||"بلا مورد")+' — '+_fmt(c.cost)+' ر.س — أُغلق '+_monthLabel(_monthKey(c.at))+'</option>';
    }).join("");
  }

  function filterManualOptions(){
    var f=((document.getElementById("fa-man-filter")||{}).value||"");
    var sel=document.getElementById("fa-man-po");
    if(sel) sel.innerHTML=_manOptsHtml(f)||'<option value="">— لا نتائج مطابقة —</option>';
  }

  function openAddManual(){
    if(!_canAudit()){ _toast("⚠ صلاحية المالية أو المسؤول فقط","warn"); return; }
    var a=_auditOf(_curMonth);
    if(!a){ _toast("⚠ افتح دورة أولاً","warn"); return; }
    if(a.status==="closed"){ _toast("⚠ الدورة مغلقة — لا إضافة بعد الإغلاق","warn"); return; }
    var inSample={};
    (a.samples||[]).forEach(function(s){ if(s) inSample[s.poId]=1; });
    _manCands=_pos().filter(function(p){ return p && _isClosed(p) && !inSample[p.id]; })
      .map(function(p){ return { id:p.id, vendor:_vendorOf(p), cost:_actualCost(p), at:_poClosedAtISO(p,_normStatus) }; })
      .sort(function(x,y){ return String(y.at).localeCompare(String(x.at)); });
    if(!_manCands.length){ _toast("⚠ لا طلبات مغلقة خارج العينة","warn"); return; }
    var body=
      '<div class="form-group"><label class="form-label">بحث (رقم الطلب أو المورد)</label>'+
        '<input class="form-input" id="fa-man-filter" placeholder="اكتب للتصفية..." oninput="window.financeAudit.filterManualOptions()"></div>'+
      '<div class="form-group"><label class="form-label">الطلب المغلق (الأحدث إغلاقاً أولاً) *</label>'+
        '<select class="form-select" id="fa-man-po">'+_manOptsHtml("")+'</select></div>'+
      '<div class="form-group"><label class="form-label">سبب الإضافة اليدوية *</label>'+
        '<textarea class="form-input" id="fa-man-reason" rows="2" placeholder="مثال: شكوى من الموقع على جودة التوريد / اشتباه في فرق سعر / طلب الإدارة"></textarea></div>'+
      '<div style="font-size:11px;color:var(--muted);line-height:1.9">تدخل الإضافة اليدوية دورة المراجعة نفسها (مراجعة ← رد ← إغلاق)، وتُقيَّد في سجل التدقيق باسمك وسببها — العينة العشوائية الحتمية لا تتأثر.</div>';
    try{
      showCustomModal({
        title:"➕ إضافة طلب لعينة دورة "+_monthLabel(a.month||a.id),
        body:body,
        okText:"➕ إضافة للعينة",
        onOk:function(){ return saveAddManual(); }
      });
    }catch(e){ _toast("⚠ تعذّر فتح النافذة","warn"); }
  }

  // يُرجع true للنجاح (يغلق المودال).
  async function saveAddManual(){
    if(_busy) return false;
    if(!_canAudit()){ _toast("⚠ صلاحية المالية أو المسؤول فقط","warn"); return false; }
    var poId=((document.getElementById("fa-man-po")||{}).value||"").trim();
    var reason=((document.getElementById("fa-man-reason")||{}).value||"").trim();
    if(!poId){ _toast("⚠ اختر الطلب","warn"); return false; }
    if(!reason){ _toast("⚠ اكتب سبب الإضافة — يُقيَّد في سجل الرقابة","warn"); return false; }
    var p=_poMeta(poId);
    var month=_curMonth;
    var sample=_manualSample({ poId:poId, vendor:p?_vendorOf(p):"", actualCost:p?_actualCost(p):0 }, reason, _me(), _now());
    _busy=true;
    try{
      await _txAudit(month, function(doc){
        if(doc.status==="closed") throw new Error("__CLOSED__");
        if((doc.samples||[]).some(function(s){ return s && s.poId===poId; })) throw new Error("__DUP__");
        doc.samples=(doc.samples||[]).concat([sample]);
        return doc;
      });
      _busy=false;
      _toast("✅ أُضيف "+poId+" للعينة — بانتظار المراجعة","success");
      _log("إضافة طلب يدوياً لعينة الرقابة المالية",
           poId+" — دورة "+_monthLabel(month)+" — السبب: "+reason);
      render();
      return true;
    }catch(e){
      _busy=false;
      var msg=String(e&&e.message);
      if(msg==="__DUP__"){ _toast("⚠ الطلب موجود في العينة أصلاً","warn"); return false; }
      if(msg==="__CLOSED__"){ _toast("⚠ الدورة أُغلقت — لا إضافة بعد الإغلاق","warn"); return false; }
      _toast("⚠ خطأ في الإضافة — تحقق من الاتصال","warn");
      return false;
    }
  }

  function closeAudit(){
    if(!_canAudit()){ _toast("⚠ صلاحية المالية أو المسؤول فقط","warn"); return; }
    var a=_auditOf(_curMonth);
    if(!a) return;
    var st=_auditStats(a);
    if(st.closed!==st.total){ _toast("⚠ لا تُغلق الدورة وفيها بنود مفتوحة ("+(st.total-st.closed)+")","warn"); return; }
    Promise.resolve(_confirm({
      title:"إغلاق دورة "+_monthLabel(a.month||a.id)+"؟",
      msg:"كل البنود مغلقة ("+st.total+"). ستُعلَّم الدورة «مغلقة» ويبقى تقريرها متاحاً.",
      icon:"✅", okText:"إغلاق الدورة"
    })).then(function(ok){
      if(!ok) return;
      _txAudit(_curMonth, function(doc){ doc.status="closed"; doc.closedAt=_now(); doc.closedBy=_me(); return doc; })
        .then(function(){
          _toast("✅ أُغلقت الدورة","success");
          _log("إغلاق دورة رقابة مالية", _monthLabel(a.month||a.id)+" — ملاحظات/مخالفات: "+st.issues+" — وفر محتمل: "+_fmt(st.saving));
          render();
        })
        .catch(function(){ _toast("⚠ خطأ في الإغلاق","warn"); });
    });
  }

  /* ════════════════════════════════════════════════════════════════════
     تقرير الشهر (طباعة)
     ════════════════════════════════════════════════════════════════════ */

  function printReport(){
    var a=_auditOf(_curMonth);
    if(!a){ _toast("⚠ افتح دورة أولاً","warn"); return; }
    var st=_auditStats(a);
    var rows=(a.samples||[]).map(function(s){
      var p=_poMeta(s.poId);
      var cost=p?_actualCost(p):(Number(s.actualCost)||0);
      var vend=p?_vendorOf(p):(s.vendor||"");
      var src=s.source==="auto"?"مُدرج آلياً":(s.source==="random_auto"?"عشوائي + إشارة":(s.source==="manual"?"مُضاف يدوياً":"عشوائي"));
      if(s.source==="manual" && s.addedBy) src+='<div style="font-size:9px;color:#64748b">'+_esc(s.addedBy)+'</div>';
      var v=VERDICT_LABEL[s.verdict];
      return '<tr>'+
        '<td style="padding:5px 8px;font-family:monospace">'+_esc(s.poId)+'</td>'+
        '<td style="padding:5px 8px">'+src+'</td>'+
        '<td style="padding:5px 8px">'+_esc(vend||"—")+'</td>'+
        '<td style="padding:5px 8px;text-align:center;direction:ltr">'+_fmt(cost)+'</td>'+
        '<td style="padding:5px 8px">'+(v?v.l:"—")+(s.escalated?' (مُصعَّد)':'')+'</td>'+
        '<td style="padding:5px 8px;text-align:center;direction:ltr">'+((Number(s.potentialSaving)||0)>0?_fmt(s.potentialSaving):"—")+'</td>'+
        '<td style="padding:5px 8px;font-size:10px">'+_esc(s.findings||"—")+
          ((s.source==="manual"&&s.manualReason)?'<div style="color:#92400e;margin-top:2px">سبب الإضافة اليدوية: '+_esc(s.manualReason)+'</div>':"")+
          ((s.manualQuotes&&s.manualQuotes.length)?'<div style="color:#0e7490;margin-top:2px">عروض بديلة: '+s.manualQuotes.map(function(q){ return _esc(q.supplier)+" — "+_fmt(q.price)+" ر.س"+(q.fileUrl?' <a href="'+(typeof safeUrl==="function"?safeUrl(q.fileUrl):q.fileUrl)+'" style="color:#0e7490">📎 مرفق</a>':""); }).join(" · ")+'</div>':"")+
          (s.procurementReply?'<div style="color:#1d4ed8;margin-top:2px">رد المشتريات: '+_esc(s.procurementReply)+'</div>':"")+'</td>'+
      '</tr>';
    }).join("");
    var html=
      '<div dir="rtl" style="font-family:\'Cairo\',sans-serif;padding:8px">'+
      '<h2 style="margin:0 0 4px">🔍 تقرير الرقابة المالية على المشتريات — '+_monthLabel(a.month||a.id)+'</h2>'+
      '<div style="font-size:11px;color:#64748b;margin-bottom:12px">أُنشئت الدورة: '+_esc((a.createdAt||"").slice(0,10))+' بواسطة '+_esc(a.createdBy||"—")+' · عينة '+st.total+' من '+((a.pool&&a.pool.size)||"—")+' طلباً مغلقاً · بصمة البذرة: '+((a.pool&&a.pool.seedHash)||"—")+' · حالة الدورة: '+(a.status==="closed"?"مغلقة":"جارية")+'</div>'+
      '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px"><tr>'+
        '<td style="padding:8px;border:1px solid #e2e8f0;text-align:center"><b>'+st.total+'</b><br><span style="font-size:10px;color:#64748b">حجم العينة</span></td>'+
        '<td style="padding:8px;border:1px solid #e2e8f0;text-align:center"><b>'+st.closed+'</b><br><span style="font-size:10px;color:#64748b">بنود مغلقة</span></td>'+
        '<td style="padding:8px;border:1px solid #e2e8f0;text-align:center"><b>'+st.issues+'</b><br><span style="font-size:10px;color:#64748b">ملاحظات/مخالفات</span></td>'+
        '<td style="padding:8px;border:1px solid #e2e8f0;text-align:center"><b>'+_fmt(st.saving)+'</b><br><span style="font-size:10px;color:#64748b">وفر محتمل (ريال)</span></td>'+
        '<td style="padding:8px;border:1px solid #e2e8f0;text-align:center"><b>'+(st.total?Math.round((st.total-st.issues)/st.total*100):100)+'٪</b><br><span style="font-size:10px;color:#64748b">نسبة الالتزام</span></td>'+
      '</tr></table>'+
      '<table style="width:100%;border-collapse:collapse;font-size:11px">'+
        '<thead><tr style="background:#1e3a8a;color:#fff">'+
          '<th style="padding:6px 8px;text-align:right">الطلب</th><th style="padding:6px 8px;text-align:right">المصدر</th>'+
          '<th style="padding:6px 8px;text-align:right">المورد</th><th style="padding:6px 8px;text-align:center">التكلفة الفعلية</th>'+
          '<th style="padding:6px 8px;text-align:right">الحكم</th><th style="padding:6px 8px;text-align:center">وفر محتمل</th>'+
          '<th style="padding:6px 8px;text-align:right">الملاحظات والرد</th>'+
        '</tr></thead>'+
        '<tbody>'+(rows||'<tr><td colspan="7" style="padding:14px;text-align:center;color:#64748b">لا عينات</td></tr>')+'</tbody>'+
      '</table>'+
      '<div style="font-size:10px;color:#64748b;margin-top:12px">المقارنات استرشادية (صافي ضريبة مقابل صافي). العينة عشوائية حتمية مرجّحة بالقيمة + استثناءات آلية — بصمة البذرة أعلاه تتيح التحقق من نزاهة الاختيار.</div>'+
      '</div>';
    try{ _openPrintWindow(html); }
    catch(e){
      try{ var w=window.open("","_blank"); w.document.write(html); w.document.close(); w.print(); }
      catch(e2){ _toast("⚠ تعذّرت الطباعة","warn"); }
    }
  }

  /* ════════════════════════════════════════════════════════════════════
     الفحص الوقائي عند إنشاء طلب الشراء — نفس محرك مقارنة التدقيق يعمل
     لحظة الإدخال: تستدعيه النواة (renderPurchaseItemsTable) بعد كل تعديل
     على بنود الطلب الجديد. يُنبَّه فقط عند وجود بديل أرخص يتجاوز التسامح —
     صمت تام عندما الأسعار سليمة (لا ضوضاء تعوّد المستخدم على التجاهل).
     ════════════════════════════════════════════════════════════════════ */
  function renderPrecheck(items, hostId){
    var host=document.getElementById(hostId||"np-precheck-host");
    if(!host) return;
    var list=(items||[]).map(function(it){
      return { name:(it&&it.itemName)||"", qty:Number(it&&it.qty)||1, unit:Number(it&&it.unitCost)||0 };
    }).filter(function(x){ return x.name && x.unit>0; });
    if(!list.length){ host.innerHTML=""; return; }
    var bench;
    try{ bench=_itemBench(list, _refRowsAt(_now(), null), FA_TOL_PCT); }
    catch(e){ host.innerHTML=""; return; }
    var hits=bench.rows.filter(function(r){ return r.best && r.overTol; });
    if(!hits.length){ host.innerHTML=""; return; }
    _injectCSS();
    var lines=hits.map(function(r){
      var b=r.best;
      return '<div style="margin-top:4px">• <b>'+_esc(r.name)+'</b>: سعرك <span class="fa-num" style="display:inline">'+_fmt(r.unit)+'</span>'+
        ' مقابل <span class="fa-num" style="display:inline;font-weight:800">'+_fmt(b.unit)+'</span> من '+_esc(b.vendor||"—")+
        ' <span style="font-size:9px;color:var(--muted)">('+(b.src==="catalog"?"كتالوج الأسعار":"طلب "+_esc(b.ref))+')</span>'+
        (r.saving>0?' — وفر محتمل <b class="fa-num" style="display:inline">'+_fmt(r.saving)+'</b> ر.س':"")+
      '</div>';
    }).join("");
    host.innerHTML='<div class="fa-flag" style="margin-top:10px">'+
      '💡 <b>فحص وقائي (الرقابة المالية):</b> بنود لها بديل أرخص خلال آخر '+FA_HIST_MONTHS+' أشهر:'+
      lines+
      '<div style="font-size:9px;color:var(--muted);margin-top:5px">استرشادي — أسعار صافي ضريبة بمطابقة اسم البند؛ قد يبرَّر الفرق بالجودة أو سرعة التوريد أو حد أدنى للطلب.</div>'+
    '</div>';
  }

  /* ════════ التنقّل ════════ */
  function open(month){ _curMonth=month; render(); }
  function back(){ _curMonth=null; render(); }

  /* ════════ التصدير ════════ */
  window.financeAudit = {
    startSync:startSync, render:render, retryLoad:retryLoad,
    renderPrecheck:renderPrecheck,
    open:open, back:back,
    openCreate:openCreate, createAudit:createAudit, removeAudit:removeAudit, removeSample:removeSample,
    openReview:openReview, saveReview:saveReview,
    addManualQuote:addManualQuote, removeManualQuote:removeManualQuote,
    openReply:openReply, saveReply:saveReply,
    openClose:openClose, saveClose:saveClose,
    openDetails:openDetails,
    openAddManual:openAddManual, saveAddManual:saveAddManual, filterManualOptions:filterManualOptions,
    closeAudit:closeAudit, printReport:printReport,
    // دوال نقية مكشوفة لفحوص hail-tests
    _norm:_norm, _hashSeed:_hashSeed, _mulberry:_mulberry, _pickSample:_pickSample,
    _monthKey:_monthKey, _prevMonthKey:_prevMonthKey, _poClosedAtISO:_poClosedAtISO,
    _unitNet:_unitNet, _autoFlags:_autoFlags, _itemBench:_itemBench, _manualSample:_manualSample,
    _FLAG_LABELS:FLAG_LABELS,
    build:MODULE_BUILD
  };
})();
