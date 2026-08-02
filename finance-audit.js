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

  var MODULE_BUILD = "v18.9wk";

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
  var _unsub   = null;  // إلغاء الاشتراك
  var _curMonth= null;  // الدورة المفتوحة في شاشة التفاصيل (أو null = القائمة)
  var _busy    = false; // حارس ضد النقر المزدوج
  var _mq      = [];    // مسودة العروض اليدوية داخل نافذة المراجعة المفتوحة

  // ════════ أدوات مساعدة داخلية ════════
  function _now(){ return new Date().toISOString(); }
  function _me(){ try{ return (currentUser && currentUser.name) || "النظام"; }catch(e){ return "النظام"; } }
  function _esc(s){ try{ return esc(s); }catch(e){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); } }
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

  // صفوف المرجع لطلبٍ ما: بنود الطلبات المغلقة الأخرى خلال نافذة التاريخ + الكتالوج.
  function _refRows(p){
    var rows=[];
    var refAt=_poClosedAtISO(p,_normStatus) || _now();
    var refTS=new Date(refAt).getTime();
    if(isNaN(refTS)) refTS=Date.now();
    var winMs=FA_HIST_MONTHS*30.44*24*3600*1000;
    _pos().forEach(function(q){
      if(!q || q.id===(p&&p.id) || !_isClosed(q)) return;
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

  function startSync(){
    _navToggle();
    if(typeof db==="undefined" || !db) return;
    if(_unsub) return; // idempotent — المستمعون العامون يُركَّبون مرة واحدة (v18.9sz)
    _unsub = db.collection(COLL()).onSnapshot(function(snap){
      _audits = snap.docs.map(function(d){ return Object.assign({id:d.id}, d.data()); })
        .sort(function(a,b){ return String(b.month||b.id).localeCompare(String(a.month||a.id)); });
      _navToggle();
      var pg=document.getElementById("page-finance-audit");
      if(pg && pg.classList.contains("active")) render();
    }, function(e){ console.warn("finance-audit sync error:", e); });
  }

  // إظهار زر القائمة الجانبية لأصحاب الصلاحية فقط (الزر مخفي افتراضياً في HTML).
  function _navToggle(){
    try{
      var btn=document.getElementById("nav-finance-audit-btn");
      if(btn) btn.style.display=_canView() ? "" : "none";
    }catch(e){}
  }

  function _auditOf(month){ return _audits.find(function(a){ return (a.month||a.id)===month; }) || null; }

  // معاملة على وثيقة الدورة: تقرأ الطازج، تطبّق mutate على نسخة، تكتب.
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
    });
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
    pending:              {l:"بانتظار المراجعة",      c:"var(--muted)",  bg:"var(--surface2)"},
    awaiting_procurement: {l:"بانتظار رد المشتريات",  c:"#b45309",       bg:"#fef3c7"},
    responded:            {l:"ردّت المشتريات",         c:"#1d4ed8",       bg:"#dbeafe"},
    closed:               {l:"مغلقة",                  c:"#166534",       bg:"#dcfce7"}
  };
  var VERDICT_LABEL={
    match:      {l:"✅ مطابق — أفضل سعر متاح", c:"#166534"},
    acceptable: {l:"🟡 فرق ضمن التسامح",       c:"#a16207"},
    note:       {l:"🟠 ملاحظة — يوجد بديل أرخص", c:"#c2410c"},
    violation:  {l:"🔴 مخالفة — فرق جوهري",     c:"#b91c1c"}
  };
  function _statusBadge(st){
    var m=STATUS_LABEL[st]||STATUS_LABEL.pending;
    return '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:'+m.bg+';color:'+m.c+'">'+m.l+'</span>';
  }
  function _verdictBadge(v){
    var m=VERDICT_LABEL[v];
    return m ? '<span style="font-size:11px;font-weight:700;color:'+m.c+'">'+m.l+'</span>' : '<span style="color:var(--muted)">—</span>';
  }
  function _srcBadge(s){
    if(s.source==="auto")
      return '<span title="'+_esc((s.reasons||[]).map(function(r){ return FLAG_LABELS[r]||r; }).join(" · "))+'" style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:#fee2e2;color:#b91c1c">⚠ مُدرج آلياً</span>';
    if(s.source==="random_auto")
      return '<span title="'+_esc((s.reasons||[]).map(function(r){ return FLAG_LABELS[r]||r; }).join(" · "))+'" style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:#fef3c7;color:#b45309">🎲+⚠ عشوائي وعليه إشارة</span>';
    return '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:var(--surface2);color:var(--muted)">🎲 عشوائي</span>';
  }
  function _monthLabel(mk){
    try{
      var d=new Date(mk+"-01T12:00:00");
      if(!isNaN(d.getTime()))
        return d.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn",{year:"numeric",month:"long"});
    }catch(e){}
    return mk;
  }

  function render(){
    var host=document.getElementById("page-finance-audit");
    if(!host) return;
    _navToggle();
    if(!_canView()){
      host.innerHTML='<div class="card" style="text-align:center;color:var(--muted);padding:40px">🔒 هذا القسم متاح للمالية والمشتريات والإدارة فقط.</div>';
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
    var head='<div class="card" style="margin-bottom:12px">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">'+
        '<div>'+
          '<div style="font-size:17px;font-weight:800">'+_icn("shield","ic-lg")+'🔍 الرقابة المالية على المشتريات</div>'+
          '<div style="font-size:12px;color:var(--muted);margin-top:2px">عينة شهرية يحددها النظام (عشوائية حتمية + استثناءات آلية) لتدقيق المالية على الطلبات المنفذة — هل كان هناك مورد أرخص لنفس البنود؟</div>'+
        '</div>'+
        (canA?'<button class="btn btn-primary btn-sm" onclick="window.financeAudit.openCreate()">🎯 بدء دورة تدقيق</button>':"")+
      '</div>'+
    '</div>';

    if(!_audits.length){
      return head+'<div class="card" style="text-align:center;color:var(--muted);padding:40px">لا توجد دورات تدقيق بعد.'+
        (canA?'<div style="margin-top:12px">اضغط «🎯 بدء دورة تدقيق» لاختيار عينة أول شهر.</div>':"")+'</div>';
    }

    var rows=_audits.map(function(a){
      var st=_auditStats(a);
      var open=a.status!=="closed";
      return '<tr style="cursor:pointer;border-top:1px solid var(--border)" onclick="window.financeAudit.open(\''+_esc(a.month||a.id)+'\')">'+
        '<td style="padding:8px;font-weight:700">'+_monthLabel(a.month||a.id)+'</td>'+
        '<td style="padding:8px;text-align:center">'+st.total+' <span style="color:var(--muted);font-size:10px">من '+((a.pool&&a.pool.size)||"—")+'</span></td>'+
        '<td style="padding:8px;text-align:center">'+st.closed+'/'+st.total+'</td>'+
        '<td style="padding:8px;text-align:center;color:'+(st.issues?'#c2410c':'var(--muted)')+';font-weight:700">'+st.issues+'</td>'+
        '<td style="padding:8px;text-align:center;font-weight:700;color:'+(st.saving>0?'var(--warn,#b45309)':'var(--muted)')+'">'+_fmt(st.saving)+'</td>'+
        '<td style="padding:8px;text-align:center">'+(open?'<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:#dbeafe;color:#1d4ed8">جارية</span>':'<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:#dcfce7;color:#166534">مغلقة</span>')+'</td>'+
      '</tr>';
    }).join("");

    return head+
      '<div class="card" style="overflow-x:auto">'+
        '<table style="width:100%;border-collapse:collapse;font-size:13px">'+
          '<thead><tr style="background:var(--surface2)">'+
            '<th style="padding:8px;text-align:right">الشهر المُدقَّق</th>'+
            '<th style="padding:8px;text-align:center">العينة</th>'+
            '<th style="padding:8px;text-align:center">أُغلق</th>'+
            '<th style="padding:8px;text-align:center">ملاحظات/مخالفات</th>'+
            '<th style="padding:8px;text-align:center">وفر محتمل (ريال)</th>'+
            '<th style="padding:8px;text-align:center">الحالة</th>'+
          '</tr></thead><tbody>'+rows+'</tbody>'+
        '</table>'+
      '</div>';
  }

  function _kpi(label,val,color){
    return '<div><div style="font-size:20px;font-weight:800;color:'+color+'">'+val+'</div>'+
           '<div style="font-size:11px;color:var(--muted);margin-top:2px">'+label+'</div></div>';
  }

  function _detailHtml(a){
    var st=_auditStats(a);
    var canA=_canAudit(), canR=_canRespond();
    var open=a.status!=="closed";

    var tools='<button class="btn btn-ghost btn-sm" onclick="window.financeAudit.printReport()">🖨 تقرير الشهر</button>';
    if(canA && open && st.closed===st.total && st.total>0)
      tools+=' <button class="btn btn-primary btn-sm" onclick="window.financeAudit.closeAudit()">✅ إغلاق الدورة</button>';
    if(_isAdmin())
      tools+=' <button class="btn btn-danger btn-sm" onclick="window.financeAudit.removeAudit(\''+_esc(a.month||a.id)+'\')">🗑 حذف</button>';

    var head='<div class="card" style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">'+
      '<div>'+
        '<button class="btn btn-ghost btn-sm" onclick="window.financeAudit.back()">← رجوع</button> '+
        '<span style="font-size:17px;font-weight:800;margin-inline-start:8px">🔍 دورة تدقيق '+_monthLabel(a.month||a.id)+'</span>'+
        '<div style="font-size:11px;color:var(--muted);margin-top:4px">أنشأها '+_esc(a.createdBy||"—")+' — عينة '+st.total+' من '+((a.pool&&a.pool.size)||"—")+' طلباً مغلقاً · بصمة البذرة: '+((a.pool&&a.pool.seedHash)||"—")+' (حتمية — لا يمكن إعادة السحب)</div>'+
      '</div>'+
      '<div>'+tools+'</div>'+
    '</div>';

    var kpis='<div class="card" style="margin-bottom:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;text-align:center">'+
      _kpi("حجم العينة", st.total, "var(--primary)")+
      _kpi("بانتظار المراجعة", st.pending, st.pending?"#b45309":"var(--muted)")+
      _kpi("بانتظار رد المشتريات", st.awaiting, st.awaiting?"#b45309":"var(--muted)")+
      _kpi("ردّت المشتريات", st.responded, st.responded?"#1d4ed8":"var(--muted)")+
      _kpi("مغلقة", st.closed, "#166534")+
      _kpi("وفر محتمل (ريال)", _fmt(st.saving), st.saving>0?"var(--warn,#b45309)":"var(--muted)")+
    '</div>';

    var rows=(a.samples||[]).map(function(s){
      var p=_poMeta(s.poId);
      var cost=p?_actualCost(p):(Number(s.actualCost)||0);
      var vend=p?_vendorOf(p):(s.vendor||"");
      var acts='<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="event.stopPropagation();try{openPurchaseDetail(\''+_esc(s.poId)+'\')}catch(e){}">📄 الطلب</button>';
      if(canA && open && (s.status==="pending"||s.status==="awaiting_procurement"))
        acts+=' <button class="btn btn-primary btn-sm" style="font-size:11px" onclick="event.stopPropagation();window.financeAudit.openReview(\''+_esc(s.poId)+'\')">🔎 '+(s.status==="pending"?"مراجعة":"تعديل المراجعة")+'</button>';
      if(canR && open && s.status==="awaiting_procurement")
        acts+=' <button class="btn btn-primary btn-sm" style="font-size:11px" onclick="event.stopPropagation();window.financeAudit.openReply(\''+_esc(s.poId)+'\')">💬 رد المشتريات</button>';
      if(canA && open && s.status==="responded")
        acts+=' <button class="btn btn-primary btn-sm" style="font-size:11px" onclick="event.stopPropagation();window.financeAudit.openClose(\''+_esc(s.poId)+'\')">🔏 إغلاق البند</button>';
      var savings=Number(s.potentialSaving)||0;
      return '<tr style="border-top:1px solid var(--border)">'+
        '<td style="padding:8px;font-weight:700;font-family:monospace">'+_esc(s.poId)+'</td>'+
        '<td style="padding:8px">'+_srcBadge(s)+'</td>'+
        '<td style="padding:8px">'+_esc(vend||"—")+'</td>'+
        '<td style="padding:8px;text-align:center;direction:ltr">'+_fmt(cost)+'</td>'+
        '<td style="padding:8px">'+_verdictBadge(s.verdict)+(s.escalated?' <span style="font-size:10px;color:#b91c1c;font-weight:700">⬆ مُصعَّد</span>':"")+'</td>'+
        '<td style="padding:8px;text-align:center;color:'+(savings>0?'var(--warn,#b45309)':'var(--muted)')+';font-weight:700">'+(savings>0?_fmt(savings):"—")+'</td>'+
        '<td style="padding:8px;text-align:center">'+_statusBadge(s.status)+'</td>'+
        '<td style="padding:8px;white-space:nowrap">'+acts+'</td>'+
      '</tr>';
    }).join("");

    if(!rows) rows='<tr><td colspan="8" style="padding:20px;text-align:center;color:var(--muted)">لا عينات في هذه الدورة.</td></tr>';

    return head+kpis+
      '<div class="card" style="overflow-x:auto">'+
        '<table style="width:100%;border-collapse:collapse;font-size:12px">'+
          '<thead><tr style="background:var(--surface2)">'+
            '<th style="padding:8px;text-align:right">رقم الطلب</th>'+
            '<th style="padding:8px;text-align:right">مصدر الإدراج</th>'+
            '<th style="padding:8px;text-align:right">المورد الفعلي</th>'+
            '<th style="padding:8px;text-align:center">التكلفة الفعلية</th>'+
            '<th style="padding:8px;text-align:right">الحكم</th>'+
            '<th style="padding:8px;text-align:center">وفر محتمل</th>'+
            '<th style="padding:8px;text-align:center">الحالة</th>'+
            '<th style="padding:8px;text-align:right">إجراءات</th>'+
          '</tr></thead><tbody>'+rows+'</tbody>'+
        '</table>'+
      '</div>'+
      '<div class="card" style="margin-top:12px;font-size:11px;color:var(--muted);line-height:1.9">'+
        'ℹ️ المقارنات <b>استرشادية</b>: أسعار التاريخ والكتالوج صافي ضريبة وتُقارن بصافي سعر الوحدة الفعلي، وأرخص عرض مسجّل يُرفع '+Math.round((FA_VAT-1)*100)+'٪ ضريبةً قبل مقارنته بإجمالي الفاتورة. '+
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
    var head='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:10px;text-align:center;background:var(--surface2);border-radius:10px;padding:10px">'+
      _kpi("التكلفة الفعلية (شامل الضريبة)", _fmt(actual), "var(--primary)")+
      _kpi("التقديرية عند الطلب", est?_fmt(est):"—", "var(--muted)")+
      _kpi("أرخص عرض مسجّل (صافي)", qmin?_fmt(qmin):"—", qmin&&actual>qmin*FA_VAT?"#c2410c":"var(--muted)")+
      _kpi("وفر محتمل من البدائل", _fmt(bench.totalSaving), bench.totalSaving>0?"var(--warn,#b45309)":"var(--muted)")+
    '</div>';
    if(qmin>0 && actual>qmin*FA_VAT*(1+FA_TOL_PCT/100)){
      head+='<div style="background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:10px;padding:9px 12px;font-size:12px;font-weight:600;margin-bottom:10px">⚠ التكلفة الفعلية تجاوزت أرخص عرض كامل مسجّل على الطلب ('+_fmt(qmin)+' صافي ≈ '+_fmt(qmin*FA_VAT)+' مع الضريبة).</div>';
    }
    var rows=bench.rows.map(function(r){
      var b=r.best;
      var alt=b
        ? _esc(b.vendor||"—")+' — <b style="direction:ltr">'+_fmt(b.unit)+'</b> <span style="font-size:9px;color:var(--muted)">('+(b.src==="catalog"?"الكتالوج":"طلب "+_esc(b.ref))+')</span>'
        : '<span style="color:var(--muted)">لا مرجع لنفس البند</span>';
      var diff=(b&&r.unit>0)?Math.round((r.unit-b.unit)/b.unit*1000)/10:null;
      return '<tr style="border-top:1px solid var(--border)'+(r.overTol?';background:#fff7ed':'')+'">'+
        '<td style="padding:6px 8px">'+_esc(r.name)+'</td>'+
        '<td style="padding:6px 8px;text-align:center">'+r.qty+'</td>'+
        '<td style="padding:6px 8px;text-align:center;direction:ltr;font-weight:700">'+_fmt(r.unit)+'</td>'+
        '<td style="padding:6px 8px">'+alt+'</td>'+
        '<td style="padding:6px 8px;text-align:center;font-weight:700;color:'+(diff==null?'var(--muted)':(diff>0?'#c2410c':'#166534'))+'">'+(diff==null?"—":(diff>0?"+":"")+diff+"٪")+'</td>'+
        '<td style="padding:6px 8px;text-align:center;font-weight:700;color:'+(r.saving>0?'var(--warn,#b45309)':'var(--muted)')+'">'+(r.saving>0?_fmt(r.saving):"—")+'</td>'+
      '</tr>';
    }).join("");
    if(!rows) rows='<tr><td colspan="6" style="padding:14px;text-align:center;color:var(--muted)">لا بنود مسمّاة في الطلب.</td></tr>';
    return head+
      '<div style="overflow-x:auto;border:1px solid var(--border);border-radius:10px;margin-bottom:10px">'+
      '<table style="width:100%;border-collapse:collapse;font-size:11px">'+
        '<thead><tr style="background:var(--surface2)">'+
          '<th style="padding:6px 8px;text-align:right">البند</th>'+
          '<th style="padding:6px 8px;text-align:center">الكمية</th>'+
          '<th style="padding:6px 8px;text-align:center">سعر وحدتنا (صافي)</th>'+
          '<th style="padding:6px 8px;text-align:right">أفضل بديل (تاريخ '+FA_HIST_MONTHS+' أشهر + كتالوج)</th>'+
          '<th style="padding:6px 8px;text-align:center">الفرق</th>'+
          '<th style="padding:6px 8px;text-align:center">وفر محتمل</th>'+
        '</tr></thead><tbody>'+rows+'</tbody>'+
      '</table></div>';
  }

  function _mqListHtml(){
    if(!_mq.length) return '<div style="font-size:11px;color:var(--muted)">لا عروض يدوية مضافة.</div>';
    return _mq.map(function(q,i){
      return '<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 0;border-bottom:1px dashed var(--border)">'+
        '<b>'+_esc(q.supplier)+'</b>'+
        '<span style="direction:ltr">'+_fmt(q.price)+' ر.س</span>'+
        (q.note?'<span style="color:var(--muted)">— '+_esc(q.note)+'</span>':"")+
        '<button class="btn btn-ghost btn-sm" style="font-size:10px;margin-inline-start:auto" onclick="window.financeAudit.removeManualQuote('+i+')">✖</button>'+
      '</div>';
    }).join("");
  }

  function openReview(poId){
    if(!_canAudit()){ _toast("⚠ صلاحية المالية أو المسؤول فقط","warn"); return; }
    var a=_auditOf(_curMonth);
    var s=a&&(a.samples||[]).find(function(x){ return x.poId===poId; });
    if(!s){ _toast("⚠ العينة غير موجودة","warn"); return; }
    var p=_poMeta(poId);
    if(!p){ _toast("⚠ الطلب غير موجود في الذاكرة — حدّث الصفحة","warn"); return; }

    _mq=(s.manualQuotes||[]).map(function(q){ return Object.assign({},q); });
    var bench=_benchForPO(p);
    var reasons=(s.reasons||[]).map(function(r){ return FLAG_LABELS[r]||r; });

    var body=
      (reasons.length?'<div style="background:#fef3c7;border-radius:10px;padding:8px 12px;font-size:11px;color:#92400e;font-weight:600;margin-bottom:10px">⚠ أسباب الإدراج الآلي: '+_esc(reasons.join(" · "))+'</div>':"")+
      _benchHtml(p, bench)+
      '<div class="form-group" style="margin-top:6px"><label class="form-label">عروض بديلة يدوية (اتصال المدقّق بموردين)</label>'+
        '<div id="fa-mq-list" style="margin-bottom:6px">'+_mqListHtml()+'</div>'+
        '<div style="display:flex;gap:6px;flex-wrap:wrap">'+
          '<input class="form-input" id="fa-mq-sup" placeholder="اسم المورد" style="flex:2;min-width:120px">'+
          '<input class="form-input" id="fa-mq-price" type="number" min="0" step="0.01" placeholder="السعر (ريال)" style="flex:1;min-width:90px">'+
          '<input class="form-input" id="fa-mq-note" placeholder="ملاحظة (اختياري)" style="flex:2;min-width:120px">'+
          '<button class="btn btn-ghost btn-sm" onclick="window.financeAudit.addManualQuote()">➕ إضافة</button>'+
        '</div>'+
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
        '<textarea class="form-input" id="fa-findings" rows="2" placeholder="مثال: مورد عالم الريتاج ورّد مواد النظافة بسعر أعلى 12% من مورد X في طلب سابق...">'+_esc(s.findings||"")+'</textarea></div>'+
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
    }catch(e){ _toast("⚠ تعذّر فتح نافذة المراجعة","warn"); }
  }

  function addManualQuote(){
    var sup=((document.getElementById("fa-mq-sup")||{}).value||"").trim();
    var price=parseFloat((document.getElementById("fa-mq-price")||{}).value);
    var note=((document.getElementById("fa-mq-note")||{}).value||"").trim();
    if(!sup || !(price>0)){ _toast("⚠ أدخل اسم المورد وسعراً صحيحاً","warn"); return; }
    _mq.push({supplier:sup, price:price, note:note, by:_me(), at:_now()});
    var list=document.getElementById("fa-mq-list");
    if(list) list.innerHTML=_mqListHtml();
    var i1=document.getElementById("fa-mq-sup"), i2=document.getElementById("fa-mq-price"), i3=document.getElementById("fa-mq-note");
    if(i1) i1.value=""; if(i2) i2.value=""; if(i3) i3.value="";
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
      '<div style="background:var(--surface2);border-radius:10px;padding:10px 12px;font-size:12px;margin-bottom:10px;line-height:1.9">'+
        '<div><b>حكم المالية:</b> '+_verdictBadge(s.verdict)+'</div>'+
        (s.findings?'<div><b>الملاحظات:</b> '+_esc(s.findings)+'</div>':"")+
        (s.recommendation?'<div><b>التوصية:</b> '+_esc(s.recommendation)+'</div>':"")+
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
      '<div style="background:var(--surface2);border-radius:10px;padding:10px 12px;font-size:12px;margin-bottom:10px;line-height:1.9">'+
        '<div><b>الحكم:</b> '+_verdictBadge(s.verdict)+'</div>'+
        (s.findings?'<div><b>ملاحظات المالية:</b> '+_esc(s.findings)+'</div>':"")+
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
      var src=s.source==="auto"?"مُدرج آلياً":(s.source==="random_auto"?"عشوائي + إشارة":"عشوائي");
      var v=VERDICT_LABEL[s.verdict];
      return '<tr>'+
        '<td style="padding:5px 8px;font-family:monospace">'+_esc(s.poId)+'</td>'+
        '<td style="padding:5px 8px">'+src+'</td>'+
        '<td style="padding:5px 8px">'+_esc(vend||"—")+'</td>'+
        '<td style="padding:5px 8px;text-align:center;direction:ltr">'+_fmt(cost)+'</td>'+
        '<td style="padding:5px 8px">'+(v?v.l:"—")+(s.escalated?' (مُصعَّد)':'')+'</td>'+
        '<td style="padding:5px 8px;text-align:center;direction:ltr">'+((Number(s.potentialSaving)||0)>0?_fmt(s.potentialSaving):"—")+'</td>'+
        '<td style="padding:5px 8px;font-size:10px">'+_esc(s.findings||"—")+(s.procurementReply?'<div style="color:#1d4ed8;margin-top:2px">رد المشتريات: '+_esc(s.procurementReply)+'</div>':"")+'</td>'+
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

  /* ════════ التنقّل ════════ */
  function open(month){ _curMonth=month; render(); }
  function back(){ _curMonth=null; render(); }

  /* ════════ التصدير ════════ */
  window.financeAudit = {
    startSync:startSync, render:render,
    open:open, back:back,
    openCreate:openCreate, createAudit:createAudit, removeAudit:removeAudit,
    openReview:openReview, saveReview:saveReview,
    addManualQuote:addManualQuote, removeManualQuote:removeManualQuote,
    openReply:openReply, saveReply:saveReply,
    openClose:openClose, saveClose:saveClose,
    closeAudit:closeAudit, printReport:printReport,
    // دوال نقية مكشوفة لفحوص hail-tests
    _norm:_norm, _hashSeed:_hashSeed, _mulberry:_mulberry, _pickSample:_pickSample,
    _monthKey:_monthKey, _prevMonthKey:_prevMonthKey, _poClosedAtISO:_poClosedAtISO,
    _unitNet:_unitNet, _autoFlags:_autoFlags, _itemBench:_itemBench,
    _FLAG_LABELS:FLAG_LABELS,
    build:MODULE_BUILD
  };
})();
