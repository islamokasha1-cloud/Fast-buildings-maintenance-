/* ═══════════════════════════════════════════════════════════════════════════
   نظام هيل — تقارير تغيّر أسعار البنود  (price-history.js)

   ملف خارجي مستقل يُحقَن **تبويباً داخل صفحة «تقارير المشتريات»** (#page-purchase-reports)
   على نمط inventory-reports.js: IIFE يعرض كائناً واحداً window.priceHistory، ويقرأ
   خدمات النواة بالاسم المجرّد (purchases / _catalogItems / _catResolveId /
   _catSearchNorm / vendorCanonical / vendorMatchKey / _kpiVendorOf / poIsClosed /
   VREF_DEV_PCT / esc / toast / logAudit / _openPrintWindow / XLSX / فحوص الأدوار).

   ── المشكلة ──
   المورّدُ يغيّر سعرَ البند بين فاتورةٍ وأخرى، والبندُ الواحد يُشترى من مورّدين بأسعارٍ
   مختلفة — والنظامُ كان يحفظ **آخرَ سعرٍ فقط** لكل زوج (بند × مورّد) في `vendorRefs`
   على بند الكتالوج: إسقاطٌ لا سجل، يُدهس ولا يتراكم. فلا جوابَ عن «كيف تحرّك سعرُ
   هذا البند عند هذا المورّد خلال السنة؟» ولا عن «مَن الأرخصُ في هذا البند اليوم؟».

   ── المبدأ ──
   • **السجلُّ الحقيقي موجودٌ أصلاً** في سندات الاستلام (`p.grnDocs[]`): المورّد وتاريخ
     الاستلام ورقم الفاتورة، ولكل بند مرساةُ الكتالوج (`itemId`) وسعرُ الوحدة الفعليّ من
     الفاتورة (`unitPrice` — صافٍ قبل الضريبة) والكمية المستلمة (`rcvQty`). فالوحدة
     **تشتقّ ولا تخزّن**: لا حقولَ جديدة ولا هجرةَ ولا تعديلَ على `firestore.rules`.
   • **قراءةٌ فقط** — لا تكتب حرفاً على Firestore، وتحسب من مصفوفة `purchases`
     المحمَّلة في الذاكرة أصلاً (مستمعُ المشتريات يبقى حيّاً طوال الجلسة).
   • **الأسعارُ المدفوعةُ فعلاً** هي الأصل (قرار المالك 18/09). والطلباتُ الأقدم من
     وجود `grnDocs` تُقرأ من `auditItems` (سعرُ فاتورة التدقيق القديم) وتُوسَم
     «تدقيق قديم»؛ والمغلقُ بلا سندٍ ولا تدقيق يُقرأ من سعر البند في الطلب ويُوسَم
     **«تقديري»** ظاهراً في كل صفّ — لا يُخفى ولا يُخلط بالفعليّ. وعروضُ الأسعار
     (`rfqs`) خارجُ هذه الوحدة عمداً: عرضٌ لم يُدفع ليس سعراً.
   • **هويةُ البند** بمرساة الكتالوج مع تتبّع الدمج (`_catResolveId`)، والبندُ غير
     المربوط يُجمَّع بالاسم المطبَّع (`_catSearchNorm`) ويُعلَّم «غير مربوط».
   • **هويةُ المورّد** بالاسم المعتمد من جدول المرادفات (`vendorCanonical`) فلا ينقسم
     «شركة فلان» و«فلان» إلى مورّدَين، والمفتاحُ `vendorMatchKey`.
   • **عتبةُ التنبيه** هي عتبةُ مراجعة الكتالوج نفسُها (`VREF_DEV_PCT` = 10%) — رقمٌ
     واحدٌ في النظام لا رقمان.
   • **الترتيبُ بالأثر لا بالنسبة**: الأثر = (الفرق × الكمية المشتراة). بندٌ يرتفع 12%
     ويُشترى أسبوعياً أهمُّ من بندٍ يرتفع 60% ويُشترى مرةً في السنة.

   ── القرار ──
   وحدةٌ مستقلّة (CLAUDE.md: العملُ الكبيرُ الجديد في ملفٍّ مستقل) تُركّب نفسَها تبويباً
   في صفحة تقارير المشتريات القائمة — فالمالكُ أرادها «داخل تقارير المشتريات» — بلا
   صفحةٍ جديدة ولا زرٍّ في القائمة الجانبية. الدوالُّ الحسابية نقيّةٌ ومكشوفةٌ على الكائن
   ليفحصها `hail-tests.js` بلا متصفّح.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
  "use strict";

  const MODULE_BUILD = "v18.9.3250";
  const PAGE_ID = "page-purchase-reports";
  const HOST_ID = "prh-root";
  const TABS_ID = "prh-tabs";
  const DEV_PCT_FALLBACK = 10;

  const KINDS = {
    same : "تغيّر سعر البند عند نفس المورّد",
    cross: "البند الواحد عند أكثر من مورّد"
  };
  const SRC = { grn:"سند استلام", audit:"تدقيق قديم", est:"تقديري" };

  /* ════════════════════════════════════════════════════════════════════
     ١) مساعدات النواة — بالاسم المجرّد، وباحتياطٍ لا يكسر الوحدة خارج المتصفّح
     ════════════════════════════════════════════════════════════════════ */
  function _esc(s){
    try{ if(typeof esc==="function") return esc(s==null?"":String(s)); }catch(e){}
    return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function _toast(m,t){ try{ toast(m,t); }catch(e){ console.log(m); } }
  function _audit(a,d){ try{ if(typeof logAudit==="function") logAudit(a,d); }catch(e){} }
  function _icn(n,c){ try{ return (typeof _ic==="function") ? _ic(n,c) : ""; }catch(e){ return ""; } }
  function _svg(n){ try{ return (typeof _svgIcon==="function") ? _svgIcon(n) : ""; }catch(e){ return ""; } }
  function _num(v){ const n=parseFloat(v); return isNaN(n)?0:n; }
  function _r2(n){ return Math.round(_num(n)*100)/100; }
  function _r3(n){ return Math.round(_num(n)*1000)/1000; }
  function _money(n){ return _num(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function _fmt(n){ return _num(n).toLocaleString("en-US",{maximumFractionDigits:3}); }
  function _pctTxt(p){ if(p==null) return "—"; return (p>0?"+":(p<0?"−":""))+Math.abs(p).toLocaleString("en-US",{maximumFractionDigits:1})+"%"; }
  function _signMoney(n){ const v=_num(n); if(v===0) return "0.00"; return (v>0?"+":"−")+_money(Math.abs(v)); }
  function _dayOnly(iso){
    if(!iso) return "—";
    try{ const d=new Date(iso); return isNaN(d) ? String(iso).slice(0,10) : d.toLocaleDateString("en-GB"); }
    catch(e){ return String(iso).slice(0,10); }
  }
  function _shortDate(iso){
    if(!iso) return "—";
    try{
      const d=new Date(iso);
      if(isNaN(d)) return String(iso).slice(0,16);
      return d.toLocaleDateString("en-GB")+" "+d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
    }catch(e){ return String(iso).slice(0,16); }
  }
  function _isoDay(d){
    const z=n=>String(n).padStart(2,"0");
    return d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate());
  }

  // ── الصلاحية: المشتريات والمالية والإدارة (قرار المالك 18/09) ──
  function canView(){
    try{
      if(typeof isAdmin==="function" && isAdmin()) return true;
      if(typeof isCEO==="function" && isCEO()) return true;
      if(typeof isProcurementOfficer==="function" && isProcurementOfficer()) return true;
      if(typeof isFinance==="function" && isFinance()) return true;
    }catch(e){}
    return false;
  }

  function devPct(){
    try{ if(typeof VREF_DEV_PCT!=="undefined" && _num(VREF_DEV_PCT)>0) return _num(VREF_DEV_PCT); }catch(e){}
    return DEV_PCT_FALLBACK;
  }

  /* ════════════════════════════════════════════════════════════════════
     ٢) الدوالُّ النقيّة — قلبُ الوحدة، ومكشوفةٌ لفحوص hail-tests

     كلُّ دالّةٍ هنا تأخذ بياناتها ومعتمداتها وسيطاً (`deps`) ولا تقرأ متغيّراً
     عامّاً — فتُفحص في node بلا متصفّح، وتُشغَّل في المتصفّح بـ`_deps()` أدناه.
     ════════════════════════════════════════════════════════════════════ */

  // تطبيعٌ احتياطيّ مطابقٌ لـ`_catSearchNorm` في index.html
  function _normFallback(s){
    return String(s||"").toLowerCase()
      .replace(/[أإآا]/g,"ا").replace(/ة/g,"ه").replace(/ى/g,"ي")
      .replace(/[ً-ْـ]/g,"")
      .replace(/\s+/g," ").trim();
  }
  function _vkeyFallback(s){
    return String(s==null?"":s)
      .replace(/[ً-ٰٟ]/g,"").replace(/ـ/g,"")
      .replace(/[أإآٱ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه")
      .replace(/ؤ/g,"و").replace(/ئ/g,"ي")
      .replace(/[^؀-ۿ0-9a-zA-Z]+/g," ")
      .trim().replace(/\s+/g," ").toLowerCase();
  }
  function _defaultDeps(){
    return {
      resolveId: id=>id||null,
      norm     : _normFallback,
      canon    : v=>String(v==null?"":v).trim(),
      vkey     : _vkeyFallback,
      vendorOf : p=>{
        const first=v=>(v!=null && (""+v).trim()) ? (""+v).trim() : "";
        let v=first(p&&p.actualVendor); if(!v) v=first(p&&p.supplier); if(!v) v=first(p&&p.vendor);
        return v;
      },
      isClosed : p=>{ const s=String((p&&p.status)||""); return s==="closed"||s==="closed_after_receipt"; },
      catalogVendor: ()=>""
    };
  }
  function _mergeDeps(d){ return Object.assign(_defaultDeps(), d||{}); }

  // انحراف السعر الجديد عن المرجع (٪) — موجبٌ أي ارتفاع، ومطابقٌ لـ`_vrefDev`
  function _dev(refPrice,newPrice){
    const a=parseFloat(refPrice), b=parseFloat(newPrice);
    if(!(a>0)||!(b>=0)) return null;
    return Math.round(((b-a)/a)*1000)/10;
  }

  // مفتاحُ هوية البند: المرساةُ إن وُجدت، وإلا الاسمُ المطبَّع
  function _itemKey(r, deps){
    const d=_mergeDeps(deps);
    if(r && r.itemId) return "id:"+r.itemId;
    const n=d.norm((r&&r.itemName)||"");
    return n ? "nm:"+n : "";
  }

  /* ── جمعُ الاستلامات من الطلبات ──
     سطرٌ لكل (بند × سند استلام) بسعرٍ > 0 وكميةٍ > 0. سلّمُ المصادر لكل طلب:
       grnDocs (سند استلام — فعليّ) ← auditItems (تدقيق قديم — فعليّ) ← بنود
       الطلب المغلق (تقديري). ولا يُخلط مصدران لطلبٍ واحد: السندُ إن وُجد فهو
       المصدر، فلا يُعدّ الاستلامُ مرّتين. */
  function _collect(list, deps){
    const d=_mergeDeps(deps);
    const out=[];
    const skipped={ noVendor:0, noPrice:0 };
    (Array.isArray(list)?list:[]).forEach(p=>{
      if(!p || !p.id) return;
      const poVendor=d.canon(d.vendorOf(p)||"");
      const push=(src, vendorRaw, dateISO, it, price, qty, grnRef, invoiceNo)=>{
        const pr=_num(price), q=_num(qty);
        if(!(pr>0) || !(q>0)) { if(!(pr>0) && q>0) skipped.noPrice++; return; }
        const vendor=d.canon(vendorRaw||"")||poVendor;
        if(!vendor){ skipped.noVendor++; return; }
        const itemId=d.resolveId(it.itemId||null)||null;
        const r={
          poId:p.id, grnRef:grnRef||"", invoiceNo:invoiceNo||"",
          vendor, vkey:d.vkey(vendor),
          itemId, itemName:it.itemName||"", itemCode:it.itemCode||"", unit:it.unit||"",
          qty:_r3(q), price:_r2(pr), date:dateISO||"", src,
          project:(p.projectName||p.projectId||"")
        };
        r.itemKey=_itemKey(r,d);
        if(!r.itemKey) return;
        out.push(r);
      };
      const grns=Array.isArray(p.grnDocs)?p.grnDocs.filter(g=>g&&Array.isArray(g.items)&&g.items.length):[];
      if(grns.length){
        grns.forEach(g=>{
          const date=g.receiptDate||g.createdAt||p.auditedAt||p.updatedAt||"";
          g.items.forEach(it=>{
            if(!it || it._fromStockOnly) return;
            push("grn", g.vendor, date, it, it.unitPrice, it.rcvQty, g.grnRef, g.invoiceNo);
          });
        });
        return;
      }
      if(p.auditedBy && Array.isArray(p.auditItems) && p.auditItems.length){
        const date=p.auditedAt||p.updatedAt||"";
        p.auditItems.forEach(it=>{
          if(!it || it._fromStockOnly) return;
          push("audit", "", date, it, it.unitPrice, (it.rcvQty!=null?it.rcvQty:it.qty), p.grnRef||"", p.invoice||"");
        });
        return;
      }
      if(d.isClosed(p) && Array.isArray(p.items) && p.items.length){
        const date=p.closedAt||p.updatedAt||p.createdAt||"";
        p.items.forEach(it=>{
          if(!it) return;
          push("est", it.vendor||"", date, it, it.unitCost, it.qty, "", p.invoice||"");
        });
      }
    });
    out._skipped=skipped;
    return out;
  }

  // حدودُ الفترة بالتوقيت المحلّي (منتصفُ الليل) — لا بقصّ النصّ ISO
  function _bounds(from, to){
    if(!from || !to) return null;
    const a=new Date(from+"T00:00:00"), b=new Date(to+"T00:00:00");
    if(isNaN(a)||isNaN(b)||a>b) return null;
    b.setDate(b.getDate()+1);
    return { fromMs:a.getTime(), toMs:b.getTime() };
  }
  function _filter(receipts, f, deps){
    const d=_mergeDeps(deps);
    const b=_bounds(f&&f.from, f&&f.to);
    // بالاسم المعتمد ثم مفتاحه — كما بُني `vkey` على الصفوف، وإلا لم تُصِب «شركة الف» صفوفَ «الف»
    const vk=(f&&f.vendor)?d.vkey(d.canon(f.vendor)):"";
    const q=d.norm((f&&f.q)||"");
    return (receipts||[]).filter(r=>{
      if(b){ const t=Date.parse(r.date||""); if(isNaN(t) || t<b.fromMs || t>=b.toMs) return false; }
      if(vk && r.vkey!==vk) return false;
      if(q){
        const hay=d.norm([r.itemName,r.itemCode].filter(Boolean).join(" "));
        if(hay.indexOf(q)===-1) return false;
      }
      return true;
    });
  }

  function _sortByDate(arr){
    return arr.slice().sort((a,b)=>{
      const c=String(a.date||"").localeCompare(String(b.date||""));
      return c!==0 ? c : String(a.poId||"").localeCompare(String(b.poId||""), undefined, {numeric:true});
    });
  }
  function _itemHead(entries){
    // آخرُ اسمٍ مسجَّل هو الأحدث (بعد الربط بالكتالوج يُكتب اسمُ المرساة)
    const last=entries[entries.length-1];
    return { itemId:last.itemId||null, itemName:last.itemName||"", itemCode:last.itemCode||"", unit:last.unit||"", linked:!!last.itemId };
  }

  /* ── التقرير ١: تغيّر السعر عند نفس المورّد ──
     مجموعةٌ لكل زوج (بند × مورّد) له استلامان فأكثر. لكل استلامٍ سعرُه السابق
     وفرقُه ونسبتُه. أثرُ المجموعة = Σ (السعر − السابق) × الكمية — ما دُفع زيادةً
     (أو وُفّر) قياساً بالسعر الذي سبقه. `minPct` يُبقي المجموعاتِ التي بلغ أكبرُ
     تغيّرٍ فيها العتبةَ؛ وصفرٌ يعرض كلَّ ما تغيّر. */
  function _sameVendor(receipts, opts){
    const o=Object.assign({minPct:0, flagPct:DEV_PCT_FALLBACK}, opts||{});
    const by={};
    (receipts||[]).forEach(r=>{ const k=r.itemKey+"|"+r.vkey; (by[k]=by[k]||[]).push(r); });
    const groups=[];
    Object.keys(by).forEach(k=>{
      const es=_sortByDate(by[k]);
      if(es.length<2) return;
      let prev=null, impact=0, riseImpact=0, maxAbs=0, changes=0;
      const rows=es.map(r=>{
        const pct=prev?_dev(prev.price,r.price):null;
        const delta=prev?_r2(r.price-prev.price):null;
        if(prev && delta!==0){ changes++; impact+=delta*r.qty; if(delta>0) riseImpact+=delta*r.qty; }
        if(pct!=null && Math.abs(pct)>maxAbs) maxAbs=Math.abs(pct);
        const row=Object.assign({}, r, { prevPrice:prev?prev.price:null, delta, pct, flag:(pct!=null && Math.abs(pct)>=o.flagPct) });
        prev=r; return row;
      });
      if(!changes) return;                          // سعرٌ ثابت — لا تغيّرَ يُبلَّغ عنه
      if(o.minPct>0 && maxAbs<o.minPct) return;
      const first=es[0], last=es[es.length-1];
      const head=_itemHead(es);
      groups.push(Object.assign(head, {
        key:k, vendor:last.vendor, vkey:last.vkey, n:es.length, changes,
        firstPrice:first.price, firstDate:first.date, lastPrice:last.price, lastDate:last.date,
        totalPct:_dev(first.price,last.price), maxAbsPct:maxAbs,
        impact:_r2(impact), riseImpact:_r2(riseImpact),
        trend: last.price>first.price ? "up" : (last.price<first.price ? "down" : "flat"),
        est: es.some(r=>r.src==="est"),
        rows
      }));
    });
    groups.sort((a,b)=> (Math.abs(b.impact)-Math.abs(a.impact)) || (b.maxAbsPct-a.maxAbsPct) || String(a.itemName).localeCompare(String(b.itemName),"ar"));
    const summary={
      groups:groups.length,
      up:groups.filter(g=>g.trend==="up").length,
      down:groups.filter(g=>g.trend==="down").length,
      flagged:groups.filter(g=>g.maxAbsPct>=o.flagPct).length,
      impact:_r2(groups.reduce((s,g)=>s+g.impact,0)),
      riseImpact:_r2(groups.reduce((s,g)=>s+g.riseImpact,0))
    };
    return { groups, summary };
  }

  /* ── التقرير ٢: البند الواحد عند أكثر من مورّد ──
     مجموعةٌ لكل بندٍ استُلم من مورّدَين فأكثر. لكل مورّد: آخرُ سعرٍ وتاريخُه وعددُ
     الاستلامات والكميةُ والمتوسّطُ المرجَّح بالكمية وأدنى وأعلى. الأرخصُ = أدنى
     **آخر سعر** (السعرُ الحاليُّ لا التاريخيّ). الفارق = (أعلى آخر سعر − أرخص) ÷
     الأرخص. الأثر = Σ (آخر سعر المورّد − الأرخص) × كميتُه — ما كان يُوفَّر لو اشتُري
     كلُّه من الأرخص بآخر أسعاره. */
  function _crossVendor(receipts, deps){
    const d=_mergeDeps(deps);
    const by={};
    (receipts||[]).forEach(r=>{ (by[r.itemKey]=by[r.itemKey]||[]).push(r); });
    const groups=[];
    Object.keys(by).forEach(k=>{
      const es=_sortByDate(by[k]);
      const byV={};
      es.forEach(r=>{ (byV[r.vkey]=byV[r.vkey]||[]).push(r); });
      const vks=Object.keys(byV);
      if(vks.length<2) return;
      const head=_itemHead(es);
      const vendors=vks.map(vk=>{
        const vs=byV[vk]; const last=vs[vs.length-1];
        const qty=vs.reduce((s,r)=>s+r.qty,0);
        const wsum=vs.reduce((s,r)=>s+r.price*r.qty,0);
        const prices=vs.map(r=>r.price);
        return {
          vendor:last.vendor, vkey:vk, n:vs.length, qty:_r3(qty),
          lastPrice:last.price, lastDate:last.date, lastPo:last.poId, lastSrc:last.src,
          avg:qty>0?_r2(wsum/qty):null, min:Math.min.apply(null,prices), max:Math.max.apply(null,prices),
          est: vs.some(r=>r.src==="est")
        };
      });
      const cheapest=vendors.reduce((m,v)=> (m==null || v.lastPrice<m.lastPrice) ? v : m, null);
      const dearest =vendors.reduce((m,v)=> (m==null || v.lastPrice>m.lastPrice) ? v : m, null);
      vendors.forEach(v=>{
        v.vsCheapestPct=_dev(cheapest.lastPrice, v.lastPrice);
        v.cheapest=(v.vkey===cheapest.vkey);
        v.impact=_r2((v.lastPrice-cheapest.lastPrice)*v.qty);
      });
      vendors.sort((a,b)=> a.lastPrice-b.lastPrice || String(a.vendor).localeCompare(String(b.vendor),"ar"));
      const defV=d.canon(d.catalogVendor(head.itemId)||"");
      const defKey=defV?d.vkey(defV):"";
      const defRow=defKey?vendors.find(v=>v.vkey===defKey):null;
      groups.push(Object.assign(head, {
        key:k, vendorsCount:vendors.length,
        cheapestVendor:cheapest.vendor, cheapestPrice:cheapest.lastPrice,
        dearestVendor:dearest.vendor, dearestPrice:dearest.lastPrice,
        spreadPct:_dev(cheapest.lastPrice, dearest.lastPrice),
        impact:_r2(vendors.reduce((s,v)=>s+v.impact,0)),
        defaultVendor:defV, defaultNotCheapest:!!(defRow && !defRow.cheapest),
        defaultUnknownHere:!!(defV && !defRow),
        est: vendors.some(v=>v.est),
        vendors
      }));
    });
    groups.sort((a,b)=> (b.impact-a.impact) || ((b.spreadPct||0)-(a.spreadPct||0)) || String(a.itemName).localeCompare(String(b.itemName),"ar"));
    const summary={
      groups:groups.length,
      impact:_r2(groups.reduce((s,g)=>s+g.impact,0)),
      defaultNotCheapest:groups.filter(g=>g.defaultNotCheapest).length,
      maxSpread:groups.reduce((m,g)=>Math.max(m,g.spreadPct||0),0)
    };
    return { groups, summary };
  }

  /* ── تسطيحُ المجموعات إلى أسطرٍ وأعمدة — مصدرٌ واحدٌ للشاشة وExcel وPDF ── */
  const COLS = {
    same: [
      {k:"_n",l:"م",al:"center",w:5},
      {k:"itemName",l:"البند",al:"right",w:30},
      {k:"itemCode",l:"الكود",al:"center",w:12},
      {k:"unit",l:"الوحدة",al:"center",w:8},
      {k:"vendor",l:"المورّد",al:"right",w:22},
      {k:"date",l:"تاريخ الاستلام",al:"center",w:13,f:"day"},
      {k:"poId",l:"رقم الطلب",al:"center",w:12},
      {k:"invoiceNo",l:"رقم الفاتورة",al:"center",w:12},
      {k:"qty",l:"الكمية",al:"center",w:9,f:"num"},
      {k:"price",l:"سعر الوحدة",al:"center",w:11,f:"money"},
      {k:"prevPrice",l:"السعر السابق",al:"center",w:11,f:"money"},
      {k:"delta",l:"الفرق",al:"center",w:10,f:"sign"},
      {k:"pct",l:"التغيّر %",al:"center",w:9,f:"pct"},
      {k:"src",l:"المصدر",al:"center",w:11,f:"src"}
    ],
    cross: [
      {k:"_n",l:"م",al:"center",w:5},
      {k:"itemName",l:"البند",al:"right",w:30},
      {k:"itemCode",l:"الكود",al:"center",w:12},
      {k:"unit",l:"الوحدة",al:"center",w:8},
      {k:"vendor",l:"المورّد",al:"right",w:22},
      {k:"lastPrice",l:"آخر سعر",al:"center",w:11,f:"money"},
      {k:"lastDate",l:"تاريخه",al:"center",w:13,f:"day"},
      {k:"lastPo",l:"رقم الطلب",al:"center",w:12},
      {k:"n",l:"عدد الاستلامات",al:"center",w:9,f:"num"},
      {k:"qty",l:"الكمية الإجمالية",al:"center",w:10,f:"num"},
      {k:"avg",l:"متوسّط مرجَّح",al:"center",w:11,f:"money"},
      {k:"min",l:"أدنى",al:"center",w:10,f:"money"},
      {k:"max",l:"أعلى",al:"center",w:10,f:"money"},
      {k:"vsCheapestPct",l:"فوق الأرخص %",al:"center",w:10,f:"pct"},
      {k:"note",l:"ملاحظة",al:"right",w:24}
    ]
  };
  function _flatten(kind, groups){
    const rows=[];
    if(kind==="same"){
      groups.forEach(g=>g.rows.forEach(r=>rows.push(Object.assign({}, r, {_g:g.key}))));
    }else{
      groups.forEach(g=>g.vendors.forEach(v=>{
        const notes=[];
        if(v.cheapest) notes.push("الأرخص");
        if(g.defaultVendor && v.vkey && v.vendor===g.defaultVendor) notes.push("الافتراضي في الكتالوج");
        if(v.est) notes.push("يشمل سعراً تقديرياً");
        rows.push(Object.assign({}, v, { itemName:g.itemName, itemCode:g.itemCode, unit:g.unit, note:notes.join(" · "), _g:g.key }));
      }));
    }
    rows.forEach((r,i)=>{ r._n=i+1; });
    return rows;
  }

  /* ════════════════════════════════════════════════════════════════════
     ٣) الحالة والتوليد
     ════════════════════════════════════════════════════════════════════ */
  const _f = { kind:"same", from:"", to:"", vendor:"", q:"", minPct:0 };
  let _out=null;               // آخرُ تقريرٍ مولَّد (للشاشة وPDF)
  const _sheets={};            // ورقةٌ لكل نوعٍ وُلّد في الجلسة (Excel)
  let _tab="po";               // التبويب النشط: po (تقرير الشراء الأصلي) | prh

  function _deps(){
    const d=_defaultDeps();
    try{ if(typeof _catResolveId==="function") d.resolveId=id=>_catResolveId(id)||id||null; }catch(e){}
    try{ if(typeof _catSearchNorm==="function") d.norm=_catSearchNorm; }catch(e){}
    try{ if(typeof vendorCanonical==="function") d.canon=v=>vendorCanonical(v)||String(v==null?"":v).trim(); }catch(e){}
    try{ if(typeof vendorMatchKey==="function") d.vkey=vendorMatchKey; }catch(e){}
    try{ if(typeof _kpiVendorOf==="function") d.vendorOf=p=>{ const v=_kpiVendorOf(p); return (v==="غير محدد")?"":v; }; }catch(e){}
    try{ if(typeof poIsClosed==="function") d.isClosed=poIsClosed; }catch(e){}
    try{
      if(typeof _catalogItems!=="undefined" && Array.isArray(_catalogItems))
        d.catalogVendor=id=>{ if(!id) return ""; const c=_catalogItems.find(x=>x&&x.id===id); return (c&&c.vendor)||""; };
    }catch(e){}
    return d;
  }
  function _purchases(){ try{ return (typeof purchases!=="undefined" && Array.isArray(purchases)) ? purchases : []; }catch(e){ return []; } }
  function _allReceipts(){ return _collect(_purchases(), _deps()); }

  function _defaultPeriod(){
    const now=new Date(); const from=new Date(now); from.setFullYear(from.getFullYear()-1);
    _f.from=_isoDay(from); _f.to=_isoDay(now);
  }

  function _paramsList(){
    const p=[["نوع التقرير",KINDS[_f.kind]],["الفترة",_f.from+" ← "+_f.to]];
    if(_f.vendor) p.push(["المورّد",_f.vendor]);
    if(_f.q) p.push(["البند",_f.q]);
    if(_f.kind==="same") p.push(["أدنى نسبة تغيّر",_f.minPct>0?(_f.minPct+"%"):"كل التغيّرات"]);
    p.push(["عتبة التنبيه",devPct()+"%"]);
    p.push(["المصدر","الأسعار المدفوعة فعلاً (سندات الاستلام) — والتقديري موسومٌ"]);
    p.push(["وقت التوليد",_shortDate(new Date().toISOString())]);
    p.push(["مولِّد التقرير",(typeof currentUser!=="undefined"&&currentUser&&currentUser.name)||"—"]);
    return p;
  }

  function generate(){
    if(!canView()){ _toast("⚠ لا تملك صلاحية تقارير الأسعار","warn"); return; }
    if(!_bounds(_f.from,_f.to)){ _toast("⚠ الفترة غير صالحة — تحقّق من التاريخين","warn"); return; }
    try{
      const deps=_deps();
      const all=_allReceipts();
      const rs=_filter(all,_f,deps);
      const res=(_f.kind==="same") ? _sameVendor(rs,{minPct:_num(_f.minPct), flagPct:devPct()}) : _crossVendor(rs,deps);
      const rows=_flatten(_f.kind,res.groups);
      const caveats=[];
      const est=rs.filter(r=>r.src==="est").length, aud=rs.filter(r=>r.src==="audit").length;
      const unlinked=res.groups.filter(g=>!g.linked).length;
      if(est) caveats.push(est+" سطراً مصدرُه سعرُ البند في طلبٍ مغلقٍ بلا سند استلام — **تقديري** لا فاتورة، موسومٌ في عمود المصدر.");
      if(aud) caveats.push(aud+" سطراً من تدقيقٍ قديم سبق وجود سندات الاستلام — سعرُ الفاتورة، بلا رقم سند.");
      if(unlinked) caveats.push(unlinked+" بنداً **غير مربوطٍ بالكتالوج** — جُمّع بالاسم المطبَّع، فاختلافُ الإملاء يفرّق البندَ الواحد.");
      if(all._skipped && all._skipped.noVendor) caveats.push(all._skipped.noVendor+" سطراً بلا اسم مورّدٍ في أيّ حقل — أُسقط، فلا مقارنةَ بلا مورّد.");
      if(!all.length) caveats.push("لا استلاماتٍ في الذاكرة بعد — تأكّد من تحميل المشتريات.");
      if(_f.kind==="cross" && res.groups.length) caveats.push("المورّدون يُوحَّدون بجدول المرادفات المعتمد (أداة توحيد الموردين) — صيغتان لاسمٍ واحدٍ بلا مرادفٍ معتمد تظهران مورّدَين.");
      const rep={
        kind:_f.kind, kindName:KINDS[_f.kind], title:"تقرير "+KINDS[_f.kind],
        cols:COLS[_f.kind], rows, groups:res.groups, summary:res.summary,
        stats:_stats(_f.kind,res.summary), params:_paramsList(), caveats,
        receipts:rs.length, generated:new Date().toISOString()
      };
      _out=rep; _sheets[_f.kind]=rep;
      _audit("توليد تقرير أسعار", rep.kindName+" — الفترة: "+_f.from+" ← "+_f.to+(_f.vendor?(" — المورّد: "+_f.vendor):"")+" — المجموعات: "+res.groups.length);
      if(!res.groups.length) _toast("لا نتائج مطابقة لهذه المعايير","info");
      else _toast("✅ وُلّد التقرير — "+res.groups.length+" مجموعة","success");
    }catch(e){
      console.error("price-history/generate:", e);
      _toast("⚠ تعذّر توليد التقرير: "+((e&&e.message)||""),"warn");
    }
    render();
  }

  function _stats(kind, s){
    if(kind==="same") return [
      {l:"أزواج (بند × مورّد) تغيّر سعرُها", v:_fmt(s.groups), ic:"barChart", cls:"total"},
      {l:"ارتفع", v:_fmt(s.up), ic:"trendingUp", cls:"crit"},
      {l:"انخفض", v:_fmt(s.down), ic:"trendingDown", cls:"ok"},
      {l:"تجاوز عتبة "+devPct()+"%", v:_fmt(s.flagged), ic:"alert", cls:"warn"},
      {l:"زيادةٌ مدفوعة (ر.س)", v:_money(s.riseImpact), ic:"coins", cls:"crit"}
    ];
    return [
      {l:"بنودٌ عند أكثر من مورّد", v:_fmt(s.groups), ic:"barChart", cls:"total"},
      {l:"أكبر فارقٍ بين مورّدَين", v:_pctTxt(s.maxSpread), ic:"alert", cls:"warn"},
      {l:"الافتراضيُّ ليس الأرخص", v:_fmt(s.defaultNotCheapest), ic:"tag", cls:"warn"},
      {l:"فرقٌ محتملُ التوفير (ر.س)", v:_money(s.impact), ic:"coins", cls:"ok"}
    ];
  }

  /* ════════════════════════════════════════════════════════════════════
     ٤) التركيب داخل صفحة تقارير المشتريات — تبويبان بلا صفحةٍ جديدة
     ════════════════════════════════════════════════════════════════════ */
  function _page(){ return document.getElementById(PAGE_ID); }
  // عناصرُ التقرير الأصلي: بطاقةُ المعايير الأولى وصندوقُ المخرَج
  function _poNodes(){
    const pg=_page(); if(!pg) return [];
    const out=[];
    const card=pg.querySelector(":scope > .card"); if(card) out.push(card);
    const o=document.getElementById("purchase-report-output"); if(o) out.push(o);
    return out;
  }
  function mount(){
    const pg=_page(); if(!pg) return;
    if(!canView()){
      const t=document.getElementById(TABS_ID); if(t) t.remove();
      const h=document.getElementById(HOST_ID); if(h) h.remove();
      _tab="po"; _applyTab();
      return;
    }
    _injectCSS();
    if(!document.getElementById(TABS_ID)){
      const bar=document.createElement("div");
      bar.id=TABS_ID; bar.className="pcli-tab-bar"; bar.setAttribute("dir","rtl");
      bar.innerHTML=
        `<button type="button" class="pcli-tab" data-tab="po" onclick="window.priceHistory.switchTab('po')">${_icn("barChart")} تقرير الشراء</button>`+
        `<button type="button" class="pcli-tab" data-tab="prh" onclick="window.priceHistory.switchTab('prh')">${_icn("trendingUp")} تغيّر الأسعار</button>`;
      const hero=pg.querySelector(":scope > .page-hero");
      if(hero && hero.nextSibling) pg.insertBefore(bar, hero.nextSibling); else pg.insertBefore(bar, pg.firstChild);
    }
    if(!document.getElementById(HOST_ID)){
      const host=document.createElement("div"); host.id=HOST_ID; host.setAttribute("dir","rtl");
      pg.appendChild(host);
    }
    _applyTab();
    if(_tab==="prh") render();
  }
  function switchTab(k){
    _tab=(k==="prh")?"prh":"po";
    _applyTab();
    if(_tab==="prh") render();
  }
  function _applyTab(){
    const on=(_tab==="prh");
    _poNodes().forEach(n=>{ n.style.display=on?"none":""; });
    const host=document.getElementById(HOST_ID); if(host) host.style.display=on?"":"none";
    const bar=document.getElementById(TABS_ID);
    if(bar) bar.querySelectorAll(".pcli-tab").forEach(b=>b.classList.toggle("active", b.getAttribute("data-tab")===_tab));
  }

  function _injectCSS(){
    if(document.getElementById("prh-css")) return;
    const st=document.createElement("style"); st.id="prh-css";
    st.textContent=[
      "#"+HOST_ID+"{direction:rtl}",
      ".prh-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px 12px;align-items:end}",
      ".prh-fld{min-width:0}",
      ".prh-fld>label{display:block;font-size:10.5px;font-weight:800;color:var(--muted);margin-bottom:4px;white-space:nowrap}",
      ".prh-fld>select,.prh-fld>input{width:100%;font-size:12px}",
      ".prh-acts{display:flex;gap:8px;align-items:end;grid-column:span 2;flex-wrap:wrap}",
      ".prh-acts .btn{height:36px;white-space:nowrap}",
      ".prh-num{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;direction:ltr;unicode-bidi:isolate;white-space:nowrap;text-align:center}",
      ".prh-up{color:var(--sla-crit);font-weight:700}",
      ".prh-dn{color:var(--sla-ok);font-weight:700}",
      ".prh-zero{color:var(--muted)}",
      ".prh-table td.c,.prh-table th.c{text-align:center}",
      ".prh-table td.r{text-align:right;font-weight:600}",
      ".prh-table th{color:var(--primary)}",
      ".prh-table tr.prh-g td{background:var(--surface2);font-weight:800;border-top:2px solid var(--border);padding:9px 12px}",
      ".prh-table tr.prh-g .prh-gsub{font-weight:500;color:var(--muted);font-size:11px;margin-inline-start:8px}",
      ".prh-table tr.prh-flag td{background:color-mix(in srgb,var(--sla-warn) 9%,var(--surface))}",
      ".prh-pill{display:inline-block;font-size:10px;font-weight:700;border-radius:6px;padding:2px 7px;white-space:nowrap;"
        +"border:1px solid color-mix(in srgb,var(--pc,var(--muted)) 30%,var(--border));"
        +"background:color-mix(in srgb,var(--pc,var(--muted)) 12%,var(--surface));color:var(--pc,var(--muted))}",
      ".prh-pill.ok{--pc:var(--sla-ok)}.prh-pill.warn{--pc:var(--sla-warn)}.prh-pill.crit{--pc:var(--sla-crit)}.prh-pill.info{--pc:var(--primary)}",
      ".prh-cav{background:color-mix(in srgb,var(--sla-warn) 9%,var(--surface));border:1px solid color-mix(in srgb,var(--sla-warn) 28%,var(--border));color:var(--text);line-height:1.8}",
      ".prh-cav ul{margin:0;padding-inline-start:17px}",
      ".prh-empty{text-align:center;padding:44px 20px;color:var(--muted)}",
      ".prh-empty b{display:block;color:var(--text);font-size:14px;margin:8px 0 4px}",
      ".prh-wrap{overflow-x:auto}",
      "@media(max-width:640px){.prh-acts{grid-column:1/-1}.prh-acts .btn{flex:1}}"
    ].join("");
    document.head.appendChild(st);
  }

  /* ════════════════════════════════════════════════════════════════════
     ٥) الرسم
     ════════════════════════════════════════════════════════════════════ */
  function _set(k,v){
    if(k==="minPct"){ _f.minPct=Math.max(0,_num(v)); return; }
    _f[k]=(v==null?"":String(v));
    if(k==="kind") render();
  }
  function _vendorOptions(){
    const seen={}; const out=[];
    _allReceipts().forEach(r=>{ if(r.vkey && !seen[r.vkey]){ seen[r.vkey]=1; out.push(r.vendor); } });
    return out.sort((a,b)=>a.localeCompare(b,"ar"));
  }
  function _filtersHTML(){
    const vs=_vendorOptions();
    const opt=(v,l,cur)=>`<option value="${_esc(v)}"${String(v)===String(cur)?" selected":""}>${_esc(l)}</option>`;
    return `
      <div class="card" style="margin-bottom:14px"><div class="card-body">
        <div class="prh-filters">
          <div class="prh-fld"><label>نوع التقرير</label>
            <select class="form-select" onchange="window.priceHistory._set('kind',this.value)">
              ${Object.keys(KINDS).map(k=>opt(k,KINDS[k],_f.kind)).join("")}
            </select></div>
          <div class="prh-fld"><label>من تاريخ</label><input class="form-input" type="date" value="${_esc(_f.from)}" onchange="window.priceHistory._set('from',this.value)"></div>
          <div class="prh-fld"><label>إلى تاريخ</label><input class="form-input" type="date" value="${_esc(_f.to)}" onchange="window.priceHistory._set('to',this.value)"></div>
          <div class="prh-fld"><label>المورّد</label>
            <select class="form-select" onchange="window.priceHistory._set('vendor',this.value)">
              <option value="">كل المورّدين</option>${vs.map(v=>opt(v,v,_f.vendor)).join("")}
            </select></div>
          <div class="prh-fld"><label>البند (اسم أو كود)</label><input class="form-input" type="text" value="${_esc(_f.q)}" placeholder="بحث…" oninput="window.priceHistory._set('q',this.value)"></div>
          ${_f.kind==="same"?`<div class="prh-fld"><label>أدنى نسبة تغيّر %</label><input class="form-input" type="number" min="0" step="1" value="${_esc(_f.minPct)}" placeholder="0 = الكل" onchange="window.priceHistory._set('minPct',this.value)"></div>`:""}
          <div class="prh-acts">
            <button class="btn btn-primary" data-viewer-hide onclick="window.priceHistory.generate()">${_icn("barChart")} إنشاء التقرير</button>
            <button class="btn btn-ghost btn-sm" data-viewer-hide onclick="window.priceHistory.exportExcel()" ${Object.keys(_sheets).length?"":"disabled"}>${_icn("sheet")} Excel</button>
            <button class="btn btn-ghost btn-sm" data-viewer-hide onclick="window.priceHistory.exportPDF()" ${_out?"":"disabled"}>${_icn("printer")} PDF</button>
          </div>
        </div>
      </div></div>`;
  }
  function _svSize(v){ const n=String(v==null?"":v).length; return n>=12 ? "sv-xl" : (n>=9 ? "sv-l" : ""); }
  function _statsHTML(rep){
    if(!rep.stats||!rep.stats.length) return "";
    return `<div class="ast-stats" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));padding:14px 16px;margin-bottom:0;border-bottom:1px solid var(--border)">${
      rep.stats.map(s=>`<div class="ast-stat ${s.cls||"total"}"><span class="si">${_svg(s.ic||"barChart")}</span><div><div class="sv ${_svSize(s.v)}">${_esc(s.v)}</div><div class="sl">${_esc(s.l)}</div></div></div>`).join("")
    }</div>`;
  }
  function _emph(s){ return _esc(s).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>"); }
  function _caveatsHTML(rep){
    if(!rep.caveats||!rep.caveats.length) return "";
    return `<div class="info-box prh-cav" style="margin:12px 16px 0"><b>حدودُ القراءة وتحفّظاتُها</b><ul>${rep.caveats.map(c=>`<li>${_emph(c)}</li>`).join("")}</ul></div>`;
  }
  function _pctCell(p){
    if(p==null) return `<span class="prh-zero">—</span>`;
    const cls=p>0?"prh-up":(p<0?"prh-dn":"prh-zero");
    return `<span class="prh-num ${cls}">${_esc(_pctTxt(p))}</span>`;
  }
  function _srcPill(src){
    const cls=src==="grn"?"ok":(src==="audit"?"info":"warn");
    return `<span class="prh-pill ${cls}">${_esc(SRC[src]||src)}</span>`;
  }
  function _itemCell(g){
    return `${_esc(g.itemName)}${g.itemCode?` <span class="prh-gsub">${_esc(g.itemCode)}</span>`:""}${g.unit?` <span class="prh-gsub">(${_esc(g.unit)})</span>`:""}${g.linked?"":` <span class="prh-pill warn">غير مربوط</span>`}`;
  }
  function _tableSame(rep){
    const head=`<tr><th class="c">م</th><th>التاريخ</th><th>رقم الطلب</th><th>الفاتورة</th><th class="c">الكمية</th><th class="c">سعر الوحدة</th><th class="c">السابق</th><th class="c">الفرق</th><th class="c">التغيّر</th><th class="c">المصدر</th></tr>`;
    let n=0;
    const body=rep.groups.map(g=>{
      const tr=g.trend==="up"?`<span class="prh-pill crit">ارتفع ${_esc(_pctTxt(g.totalPct))}</span>`:(g.trend==="down"?`<span class="prh-pill ok">انخفض ${_esc(_pctTxt(g.totalPct))}</span>`:`<span class="prh-pill">عاد إلى سعره</span>`);
      const gh=`<tr class="prh-g"><td colspan="10">${_itemCell(g)} <span class="prh-gsub">—</span> ${_esc(g.vendor)}
        <span class="prh-gsub">${g.n} استلاماً · ${_esc(_money(g.firstPrice))} ← ${_esc(_money(g.lastPrice))}</span> ${tr}
        <span class="prh-gsub">الأثر: <span class="prh-num ${g.impact>0?"prh-up":(g.impact<0?"prh-dn":"prh-zero")}">${_esc(_signMoney(g.impact))}</span> ر.س</span></td></tr>`;
      const rs=g.rows.map(r=>{ n++; return `<tr${r.flag?' class="prh-flag"':""}>
        <td class="c">${n}</td><td>${_esc(_dayOnly(r.date))}</td><td>${_esc(r.poId)}${r.grnRef?`<div class="prh-gsub">${_esc(r.grnRef)}</div>`:""}</td><td>${_esc(r.invoiceNo||"—")}</td>
        <td class="c prh-num">${_esc(_fmt(r.qty))}</td><td class="c prh-num"><b>${_esc(_money(r.price))}</b></td>
        <td class="c prh-num">${r.prevPrice!=null?_esc(_money(r.prevPrice)):"—"}</td>
        <td class="c">${r.delta==null?"—":`<span class="prh-num ${r.delta>0?"prh-up":(r.delta<0?"prh-dn":"prh-zero")}">${_esc(_signMoney(r.delta))}</span>`}</td>
        <td class="c">${_pctCell(r.pct)}</td><td class="c">${_srcPill(r.src)}</td></tr>`; }).join("");
      return gh+rs;
    }).join("");
    return `<div class="prh-wrap"><table class="report-table prh-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }
  function _tableCross(rep){
    const head=`<tr><th class="c">م</th><th>المورّد</th><th class="c">آخر سعر</th><th class="c">تاريخه</th><th class="c">الطلب</th><th class="c">الاستلامات</th><th class="c">الكمية</th><th class="c">متوسّط مرجَّح</th><th class="c">أدنى</th><th class="c">أعلى</th><th class="c">فوق الأرخص</th></tr>`;
    let n=0;
    const body=rep.groups.map(g=>{
      const gh=`<tr class="prh-g"><td colspan="11">${_itemCell(g)}
        <span class="prh-gsub">${g.vendorsCount} مورّدين · الأرخص: <b>${_esc(g.cheapestVendor)}</b> (${_esc(_money(g.cheapestPrice))}) · الفارق ${_esc(_pctTxt(g.spreadPct))}</span>
        ${g.defaultNotCheapest?`<span class="prh-pill warn">الافتراضي في الكتالوج (${_esc(g.defaultVendor)}) ليس الأرخص</span>`:""}
        <span class="prh-gsub">توفيرٌ محتمل: <span class="prh-num">${_esc(_money(g.impact))}</span> ر.س</span></td></tr>`;
      const rs=g.vendors.map(v=>{ n++; return `<tr>
        <td class="c">${n}</td><td class="r">${_esc(v.vendor)} ${v.cheapest?`<span class="prh-pill ok">الأرخص</span>`:""}${v.est?` <span class="prh-pill warn">تقديري</span>`:""}</td>
        <td class="c prh-num"><b>${_esc(_money(v.lastPrice))}</b></td><td class="c">${_esc(_dayOnly(v.lastDate))}</td><td class="c">${_esc(v.lastPo)}</td>
        <td class="c prh-num">${v.n}</td><td class="c prh-num">${_esc(_fmt(v.qty))}</td><td class="c prh-num">${v.avg!=null?_esc(_money(v.avg)):"—"}</td>
        <td class="c prh-num">${_esc(_money(v.min))}</td><td class="c prh-num">${_esc(_money(v.max))}</td><td class="c">${v.cheapest?`<span class="prh-zero">—</span>`:_pctCell(v.vsCheapestPct)}</td></tr>`; }).join("");
      return gh+rs;
    }).join("");
    return `<div class="prh-wrap"><table class="report-table prh-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }
  function _outHTML(){
    if(!_out) return `<div class="card"><div class="prh-empty"><b>اختر المعايير ثم «إنشاء التقرير»</b>يُقرأ من الأسعار المدفوعة فعلاً في سندات الاستلام — لا يكتب شيئاً.</div></div>`;
    const rep=_out;
    const tbl=rep.groups.length ? (rep.kind==="same"?_tableSame(rep):_tableCross(rep))
      : `<div class="prh-empty"><b>لا نتائج مطابقة لهذه المعايير</b>${rep.kind==="same"?"لا زوجَ (بند × مورّد) تغيّر سعرُه في الفترة":"لا بندَ استُلم من مورّدَين فأكثر في الفترة"} — وسّع الفترة أو أزل الفلاتر.</div>`;
    return `<div class="card"><div class="card-header"><h3>${_esc(rep.title)}</h3><span class="prh-gsub">${_esc(rep.receipts)} سطرَ استلامٍ مقروءاً · ${_esc(_shortDate(rep.generated))}</span></div>
      ${_statsHTML(rep)}${_caveatsHTML(rep)}<div style="padding:12px 16px">${tbl}</div></div>`;
  }
  function render(){
    const host=document.getElementById(HOST_ID);
    if(!host) return;
    if(!canView()){ host.innerHTML=`<div class="card" style="text-align:center;color:var(--muted);padding:40px">🔒 لا تملك صلاحية تقارير الأسعار</div>`; return; }
    if(!_f.from||!_f.to) _defaultPeriod();
    host.innerHTML=_filtersHTML()+`<div id="prh-out">${_outHTML()}</div>`;
  }

  /* ════════════════════════════════════════════════════════════════════
     ٦) التصدير — Excel (ورقةٌ لكل تقرير وُلّد) وPDF على الورقة الرسمية
     ════════════════════════════════════════════════════════════════════ */
  function _cellVal(r,c){
    const v=r[c.k];
    if(v==null||v==="") return "";
    if(c.f==="day") return _dayOnly(v);
    if(c.f==="src") return SRC[v]||v;
    if(c.f==="pct") return _num(v);
    if(c.f==="num"||c.f==="money"||c.f==="sign") return _num(v);
    return v;
  }
  function _sheetRows(rep){
    return rep.rows.map(r=>{ const o={}; rep.cols.forEach(c=>{ o[c.l]=_cellVal(r,c); }); return o; });
  }
  function _safeSheetName(s){ return String(s||"تقرير").replace(/[:\\\/\?\*\[\]]/g,"-").slice(0,31); }
  async function exportExcel(){
    if(typeof window._needLib==="function" && !await window._needLib(window._ensureXLSX,"Excel")) return;
    const kinds=Object.keys(_sheets);
    if(!kinds.length){ _toast("⚠ ولِّد تقريراً أولاً","warn"); return; }
    if(typeof XLSX==="undefined"){ _toast("⚠ مكتبة Excel غير محمّلة","warn"); return; }
    try{
      const wb=XLSX.utils.book_new();
      const meta=[];
      kinds.forEach(k=>{
        const rep=_sheets[k];
        meta.push({"التقرير":rep.kindName,"البند":"عدد الأسطر","القيمة":rep.rows.length});
        (rep.params||[]).forEach(([a,v])=>meta.push({"التقرير":rep.kindName,"البند":a,"القيمة":v}));
        (rep.caveats||[]).forEach(c=>meta.push({"التقرير":rep.kindName,"البند":"تحفّظ","القيمة":String(c).replace(/\*\*/g,"")}));
        meta.push({"التقرير":"","البند":"","القيمة":""});
      });
      const wsM=XLSX.utils.json_to_sheet(meta); wsM["!cols"]=[{wch:34},{wch:22},{wch:90}];
      XLSX.utils.book_append_sheet(wb, wsM, "المعايير والتحفّظات");
      kinds.forEach(k=>{
        const rep=_sheets[k]; const rows=_sheetRows(rep);
        const ws=XLSX.utils.json_to_sheet(rows.length?rows:[{"لا نتائج":""}]);
        ws["!cols"]=rep.cols.map(c=>({wch:c.w||16}));
        XLSX.utils.book_append_sheet(wb, ws, _safeSheetName(rep.kindName));
      });
      XLSX.writeFile(wb, "تقارير_الأسعار_"+new Date().toISOString().slice(0,10)+".xlsx");
      _audit("تصدير تقارير الأسعار Excel", kinds.map(k=>KINDS[k]).join(" · "));
      _toast("✅ تم تصدير "+kinds.length+" ورقة","success");
    }catch(e){
      console.error("price-history/exportExcel:", e);
      _toast("⚠ تعذّر تصدير الملف: "+((e&&e.message)||""),"warn");
    }
  }

  // الورقة الرسمية — الصورُ تُقرأ من الصفحة (`img#_lh_*`) كما في inventory-reports.js
  function _lhSrc(id){ try{ const im=document.getElementById(id); if(im&&im.src&&im.naturalWidth>0) return im.src; }catch(e){} return ""; }
  function _lhAssets(){ return {head:_lhSrc("_lh_head_"), foot:_lhSrc("_lh_foot_"), mark:_lhSrc("_lh_mark_")}; }
  function _lhOn(l){ return !!(l&&l.head&&l.foot); }
  function _lhCSS(){
    return '@page{size:A4;margin:3mm 0 11.5mm}html,body{margin:0;padding:0}'
      +'.lh{position:absolute;z-index:3}.lh img{display:block;width:100%;height:auto}'
      +'.lh-h{left:-2.65mm;top:0;width:202.5mm}.lh-f{left:3.72mm;bottom:0;width:191.8mm}'
      +'.lh-m{left:48.95mm;top:89.9mm;width:108.4mm;z-index:0;opacity:.5}'
      +'@media print{.lh{position:fixed}}'
      +'.pg{width:100%;border-collapse:collapse;margin:0;font-size:inherit}'
      +'.pg>thead>tr>td,.pg>tfoot>tr>td,.pg>tbody>tr>td{padding:0;border:0;background:none}'
      +'.pg>tbody>tr>td{padding:0 12mm;position:relative;z-index:1}'
      +'.sp-h{height:35.6mm}.sp-f{height:24.9mm}';
  }
  function _lhWrap(inner,l){
    if(!_lhOn(l)) return inner;
    return '<div class="lh lh-h"><img src="'+_esc(l.head)+'" alt=""></div>'
      +(l.mark?'<div class="lh lh-m"><img src="'+_esc(l.mark)+'" alt=""></div>':'')
      +'<div class="lh lh-f"><img src="'+_esc(l.foot)+'" alt=""></div>'
      +'<table class="pg"><thead><tr><td><div class="sp-h"></div></td></tr></thead>'
      +'<tfoot><tr><td><div class="sp-f"></div></td></tr></tfoot>'
      +'<tbody><tr><td>'+inner+'</td></tr></tbody></table>';
  }
  function _pdfPct(p){ if(p==null) return "—"; return `<span class="${p>0?"up":(p<0?"dn":"")}">${_esc(_pctTxt(p))}</span>`; }
  function _pdfTable(rep){
    if(!rep.groups.length) return `<div class="empty">لا نتائج مطابقة لهذه المعايير</div>`;
    if(rep.kind==="same"){
      let n=0;
      const rows=rep.groups.map(g=>`<tr class="g"><td colspan="9">${_esc(g.itemName)}${g.itemCode?" · "+_esc(g.itemCode):""}${g.unit?" ("+_esc(g.unit)+")":""} — ${_esc(g.vendor)}
          <span class="sub">${g.n} استلاماً · ${_esc(_money(g.firstPrice))} ← ${_esc(_money(g.lastPrice))} (${_esc(_pctTxt(g.totalPct))}) · الأثر ${_esc(_signMoney(g.impact))} ر.س</span></td></tr>`
        + g.rows.map(r=>{ n++; return `<tr${r.flag?' class="f"':""}><td class="c">${n}</td><td class="c">${_esc(_dayOnly(r.date))}</td><td class="c">${_esc(r.poId)}</td><td class="c">${_esc(r.invoiceNo||"—")}</td><td class="c">${_esc(_fmt(r.qty))}</td><td class="c"><b>${_esc(_money(r.price))}</b></td><td class="c">${r.prevPrice!=null?_esc(_money(r.prevPrice)):"—"}</td><td class="c">${_pdfPct(r.pct)}</td><td class="c">${_esc(SRC[r.src]||r.src)}</td></tr>`; }).join("")
      ).join("");
      return `<table class="tbl"><colgroup><col style="width:5%"><col style="width:12%"><col style="width:13%"><col style="width:13%"><col style="width:9%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col style="width:12%"></colgroup>
        <thead><tr><th>م</th><th>التاريخ</th><th>رقم الطلب</th><th>الفاتورة</th><th>الكمية</th><th>سعر الوحدة</th><th>السابق</th><th>التغيّر</th><th>المصدر</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    let n=0;
    const rows=rep.groups.map(g=>`<tr class="g"><td colspan="9">${_esc(g.itemName)}${g.itemCode?" · "+_esc(g.itemCode):""}${g.unit?" ("+_esc(g.unit)+")":""}
        <span class="sub">${g.vendorsCount} مورّدين · الأرخص: ${_esc(g.cheapestVendor)} (${_esc(_money(g.cheapestPrice))}) · الفارق ${_esc(_pctTxt(g.spreadPct))}${g.defaultNotCheapest?" · الافتراضي في الكتالوج ليس الأرخص":""} · توفيرٌ محتمل ${_esc(_money(g.impact))} ر.س</span></td></tr>`
      + g.vendors.map(v=>{ n++; return `<tr><td class="c">${n}</td><td>${_esc(v.vendor)}${v.cheapest?" ★":""}${v.est?" (تقديري)":""}</td><td class="c"><b>${_esc(_money(v.lastPrice))}</b></td><td class="c">${_esc(_dayOnly(v.lastDate))}</td><td class="c">${v.n}</td><td class="c">${_esc(_fmt(v.qty))}</td><td class="c">${v.avg!=null?_esc(_money(v.avg)):"—"}</td><td class="c">${_esc(_money(v.min))} – ${_esc(_money(v.max))}</td><td class="c">${v.cheapest?"—":_pdfPct(v.vsCheapestPct)}</td></tr>`; }).join("")
    ).join("");
    return `<table class="tbl"><colgroup><col style="width:5%"><col style="width:23%"><col style="width:11%"><col style="width:11%"><col style="width:8%"><col style="width:9%"><col style="width:11%"><col style="width:13%"><col style="width:9%"></colgroup>
      <thead><tr><th>م</th><th>المورّد</th><th>آخر سعر</th><th>تاريخه</th><th>الاستلامات</th><th>الكمية</th><th>متوسّط</th><th>أدنى – أعلى</th><th>فوق الأرخص</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  function exportPDF(){
    if(!_out){ _toast("⚠ ولِّد تقريراً أولاً","warn"); return; }
    const rep=_out, l=_lhAssets(), on=_lhOn(l);
    const logo=(document.querySelector('.logo-img')||{}).src||"";
    const stats=(rep.stats||[]).map(s=>`<div class="stat"><div class="sn">${_esc(s.v)}</div><div class="sl">${_esc(s.l)}</div></div>`).join("");
    const params=(rep.params||[]).map(([a,v])=>`<span class="pchip"><b>${_esc(a)}:</b> ${_esc(v)}</span>`).join("");
    const caveats=(rep.caveats||[]).length?`<div class="cav"><div class="cav-t">حدودُ القراءة وتحفّظاتُها</div><ul>${rep.caveats.map(c=>`<li>${_emph(c)}</li>`).join("")}</ul></div>`:"";
    const docHead=on
      ? `<div class="dochead"><div class="dh-t">${_esc(rep.title)}</div><div class="dh-d">${_esc(_shortDate(rep.generated))}</div></div>`
      : `<div class="header"><div class="hr">${logo?`<img src="${_esc(logo)}" class="clogo" alt="">`:""}<div><div class="company">شركة المباني السريعة للمقاولات</div><div class="subtitle">${_esc(rep.title)}</div></div></div><div class="dh-d">تاريخ التقرير<br><strong>${_esc(_shortDate(rep.generated))}</strong></div></div>`;
    const inner=`${docHead}<div class="params">${params}</div>${stats?`<div class="stats">${stats}</div>`:""}${caveats}${_pdfTable(rep)}
      <div class="foot">شركة المباني السريعة للمقاولات — تقارير المشتريات · ${_esc(rep.kindName)} · ${_esc(String(rep.groups.length))} مجموعة</div>`;
    const html=`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${_esc(rep.title)} — شركة المباني السريعة</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A4;margin:12mm}
body{font-family:'Cairo','Tajawal','Segoe UI',Tahoma,sans-serif;direction:rtl;background:#fff;color:#0f172a;font-size:10.5px}
.header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1b3a6b;padding-bottom:10px;margin-bottom:10px}
.hr{display:flex;align-items:center;gap:12px}.clogo{width:50px;height:50px;object-fit:contain}
.company{font-size:18px;font-weight:800;color:#1b3a6b}.subtitle{font-size:12px;color:#64748b;margin-top:2px}
.dochead{display:flex;justify-content:space-between;align-items:center;gap:14px;border-bottom:3px solid #1b3a6b;padding-bottom:8px;margin-bottom:8px}
.dh-t{font-size:16px;font-weight:800;color:#1b3a6b}.dh-d{font-size:11px;color:#64748b;text-align:left;white-space:nowrap}
.params{display:flex;flex-wrap:wrap;gap:5px 10px;margin-bottom:8px}.pchip{font-size:9.5px;color:#334155;background:#f1f5f9;border-radius:6px;padding:2px 7px}
.stats{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap}.stat{flex:1;min-width:110px;border:1px solid #e2e8f0;border-radius:8px;padding:6px 8px;text-align:center}
.sn{font-size:14px;font-weight:800;color:#1b3a6b;direction:ltr}.sl{font-size:9px;color:#64748b}
.cav{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:7px 10px;margin-bottom:10px;font-size:9.5px}.cav-t{font-weight:800;margin-bottom:3px}.cav ul{padding-inline-start:16px}
.tbl{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px}
.tbl th{background:#1b3a6b;color:#fff;padding:6px 5px;text-align:center;font-weight:700}
.tbl td{padding:5px 5px;border-bottom:1px solid #e2e8f0;text-align:right;word-wrap:break-word}
.tbl td.c{text-align:center;direction:ltr}
.tbl tr.g td{background:#eef2f7;font-weight:800;border-top:2px solid #cbd5e1;text-align:right;direction:rtl}
.tbl tr.f td{background:#fff7ed}
.sub{font-weight:500;color:#475569;font-size:9.5px;margin-inline-start:6px}
.up{color:#b91c1c;font-weight:700}.dn{color:#15803d;font-weight:700}
.empty{text-align:center;color:#64748b;padding:20px}
thead{display:table-header-group}tr{page-break-inside:avoid}
.foot{margin-top:12px;padding-top:7px;border-top:1px solid #e2e8f0;font-size:9px;color:#64748b;text-align:center}
${on?_lhCSS():""}
</style></head><body>${_lhWrap(inner,l)}</body></html>`;
    try{
      let ok=false;
      if(typeof _openPrintWindow==="function") ok=_openPrintWindow(html);
      else { const w=window.open("","_blank"); if(w){ w.document.write(html); w.document.close(); ok=true; } }
      if(!ok){ _toast("⚠ تعذّر فتح نافذة الطباعة","warn"); return; }
      _audit("طباعة تقرير أسعار PDF", rep.kindName+" — المجموعات: "+rep.groups.length);
    }catch(e){
      console.error("price-history/exportPDF:", e);
      _toast("⚠ تعذّرت الطباعة: "+((e&&e.message)||""),"warn");
    }
  }

  /* ════════════════════════════════════════════════════════════════════
     ٧) الواجهة العامة
     ════════════════════════════════════════════════════════════════════ */
  window.priceHistory = {
    mount, switchTab, render, generate, exportExcel, exportPDF, canView, _set,
    // دوالُّ نقيّة — مكشوفةٌ لفحوص hail-tests
    _collect, _filter, _bounds, _sameVendor, _crossVendor, _flatten, _itemKey, _dev,
    _sheetRows, _cellVal, _safeSheetName, _defaultDeps, _normFallback, _vkeyFallback,
    _state: ()=>({f:Object.assign({},_f), tab:_tab, out:_out, sheets:Object.keys(_sheets)}),
    KINDS, SRC, COLS, DEV_PCT_FALLBACK,
    build: MODULE_BUILD
  };
})();
