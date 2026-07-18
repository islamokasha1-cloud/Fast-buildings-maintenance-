/* ═══════════════════════════════════════════════════════════════════════════
   نظام هيل — وحدة الجرد الشهري  (stocktake.js)
   ملف خارجي مستقل يُحقَن في صفحة #page-stocktake، على نمط labor-catalog.js
   و price-analysis.js: IIFE يعرض كائناً واحداً window.stocktake، ويقرأ خدمات
   النواة (db / firebase / currentUser / esc / toast / showConfirm /
   showCustomModal / _openPrintWindow / logAudit / فحوص الأدوار / أسماء
   المستودعات / أسماء المجموعات) مباشرةً بالاسم — إذ تتشارك كل وسوم <script>
   الكلاسيكية نفس البيئة المعجمية العامة.

   القرارات (متفق عليها مع المالك):
   • نطاق الجرد الواحد = مستودع واحد.
   • الفرق «الكبير» = نسبة مئوية من رصيد النظام (ST_BIG_PCT) مع حدٍّ أدنى
     مطلق (ST_ABS_FLOOR) يمنع أن يوقف فرقُ قطعةٍ واحدةٍ على رصيدٍ صغير الجردَ كله.
   • الفرق الصغير: يعتمده وينفّذه أمين المستودع (أو الأدمن) مباشرةً.
   • الفرق الكبير: يحتاج اعتماد المدير التنفيذي (أو الأدمن) قبل التطبيق.
   • الإدخال: يدوي + استيراد ملف Excel. (الباركود مؤجَّل لمرحلة تالية.)

   التسوية عند التطبيق: لكل بندٍ اختلف عدُّه عن رصيده، Transaction تقرأ الرصيد
   طازجاً ثم تُثبّت الرصيد = المعدود (الجرد حقيقةٌ مطلقة)، وتكتب قيد حركة
   type:"adjust" بـ adjustDelta = المعدود − الطازج — فيتوافق مع سجل الحركات
   ومع recalcInventoryFromLog. لا ترقيع محلي: onSnapshot مصدر الحقيقة.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
  "use strict";

  // ── عتبات القرار (قابلة للتعديل من سطر واحد) ──
  const ST_BIG_PCT   = 10;   // الفرق كبير إذا بلغت نسبته من رصيد النظام هذا الحد
  const ST_ABS_FLOOR = 3;    // ولم يقلّ فرقه المطلق عن هذا العدد من الوحدات

  // ── الحالة ──
  const STATUS = {
    counting:         "قيد العدّ",
    pending_approval: "بانتظار اعتماد المدير التنفيذي",
    applied:          "معتمد ومطبَّق",
    cancelled:        "ملغى"
  };

  let _takes   = [];     // كل عمليات الجرد (من onSnapshot)
  let _unsub   = null;   // إلغاء الاشتراك
  let _curId   = null;   // الجرد المفتوح حالياً في شاشة التفاصيل (أو null = القائمة)
  let _counts  = {};     // مسودة العدّ الحالية: itemId → كمية معدودة (رقم)
  let _applying= false;  // حارس ضد النقر المزدوج على التطبيق

  // ════════ أدوات مساعدة داخلية ════════

  function COLL(){ return (typeof STOCKTAKE_COLLECTION==="function") ? STOCKTAKE_COLLECTION() : "global_stocktakes"; }
  function _now(){ return new Date().toISOString(); }
  function _me(){ return (typeof currentUser!=="undefined" && currentUser && currentUser.name) || "النظام"; }
  function _myRole(){ return (typeof currentUser!=="undefined" && currentUser && currentUser.role) || ""; }

  function _canManage(){ // يبدأ الجرد ويعدّ وينفّذ الفروقات الصغيرة
    try{ return (typeof isWarehouseManager==="function" && isWarehouseManager()) || (typeof isAdmin==="function" && isAdmin()); }catch(e){ return false; }
  }
  function _canApproveBig(){ // يعتمد الفروقات الكبيرة
    try{ return (typeof isCEO==="function" && isCEO()) || (typeof isAdmin==="function" && isAdmin()); }catch(e){ return false; }
  }
  function _canView(){ // العرض متاح لكل من يرى المخزون
    return _canManage() || _canApproveBig() || (typeof isProcurementOfficer==="function" && isProcurementOfficer());
  }

  // تطبيع عربي بسيط للمطابقة عند الاستيراد (ألف/تاء مربوطة/ياء + إزالة تشكيل ومسافات)
  function _norm(s){
    return String(s==null?"":s)
      .replace(/[\u064B-\u0652\u0670]/g,"")
      .replace(/[أإآ]/g,"ا").replace(/ة/g,"ه").replace(/ى/g,"ي")
      .replace(/\s+/g,"").trim().toLowerCase();
  }

  function _esc(s){ try{ return esc(s); }catch(e){ return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); } }
  function _num(v){ const n=parseFloat(v); return isNaN(n)?0:n; }
  function _fmt(n){ return (_num(n)).toLocaleString("en-US",{maximumFractionDigits:3}); }

  function _warehouseNames(){
    try{ if(typeof getWarehouseNames==="function") return getWarehouseNames(); }catch(e){}
    // احتياط: اشتقاق من أصناف المخزون
    try{ return [...new Set((_inventoryItems||[]).map(i=>(i.warehouseName||"").trim()).filter(Boolean))].sort(); }catch(e){ return []; }
  }

  // كل أصناف مستودعٍ معيّن من الرصيد الحيّ
  function _itemsInWarehouse(wh){
    const inv = (typeof _inventoryItems!=="undefined" && _inventoryItems) ? _inventoryItems : [];
    return inv.filter(i=>(i.warehouseName||"").trim()===String(wh).trim());
  }

  // تصنيف الفرق: {delta, pct, big}
  function _classify(systemQty, countedQty){
    const sys = _num(systemQty), cnt = _num(countedQty);
    const delta = Math.round((cnt - sys)*1000)/1000;
    let pct, big;
    if(sys<=0){
      pct = cnt>0 ? Infinity : 0;
      big = cnt>0;                 // رصيد صفر وظهر مخزون = يستحق مراجعة
    } else {
      pct = Math.abs(delta)/sys*100;
      big = (pct>=ST_BIG_PCT) && (Math.abs(delta)>=ST_ABS_FLOOR);
    }
    return { delta, pct, big };
  }

  // ملخّص جردٍ من مسودة العدّ الحالية أو من counts المحفوظة
  function _summarize(take, countsMap){
    const counts = countsMap || {};
    let counted=0, surplus=0, shortage=0, matched=0, bigCount=0, totalDeltaAbs=0;
    (take.snapshot||[]).forEach(s=>{
      const has = Object.prototype.hasOwnProperty.call(counts, s.itemId);
      if(!has) return;
      counted++;
      const c = _classify(s.systemQty, counts[s.itemId]);
      if(c.delta>0) surplus++; else if(c.delta<0) shortage++; else matched++;
      if(c.big) bigCount++;
      totalDeltaAbs += Math.abs(c.delta);
    });
    return {
      total:(take.snapshot||[]).length,
      counted, surplus, shortage, matched, bigCount, totalDeltaAbs,
      remaining:(take.snapshot||[]).length - counted
    };
  }

  // ════════ الاشتراك الفوري ════════

  function startSync(){
    if(typeof db==="undefined" || !db) return;
    if(_unsub) _unsub();
    _unsub = db.collection(COLL())
      .orderBy("createdAt","desc").limit(200)
      .onSnapshot(snap=>{
        _takes = snap.docs.map(d=>({id:d.id,...d.data()}));
        const pg=document.getElementById("page-stocktake");
        if(pg && pg.classList.contains("active")) render();
      }, e=>console.warn("stocktake sync error:",e));
  }

  // ════════ العرض ════════

  function render(){
    const host = document.getElementById("page-stocktake");
    if(!host) return;
    if(!_canView()){
      host.innerHTML = `<div class="card" style="text-align:center;color:var(--muted);padding:40px">🔒 لا تملك صلاحية عرض الجرد</div>`;
      return;
    }
    if(_curId){
      const t = _takes.find(x=>x.id===_curId);
      if(!t){ _curId=null; return render(); }
      host.innerHTML = _detailHtml(t);
    } else {
      host.innerHTML = _listHtml();
    }
  }

  function _listHtml(){
    const open = _takes.filter(t=>t.status==="counting" || t.status==="pending_approval");
    const done = _takes.filter(t=>t.status==="applied" || t.status==="cancelled");

    const startBtn = _canManage()
      ? `<button class="btn btn-sm" onclick="window.stocktake.startNew()">➕ بدء جرد جديد</button>` : "";

    const openCards = open.length ? open.map(t=>{
      const sm = _summarize(t, t.counts||{});
      const badge = t.status==="pending_approval"
        ? `<span style="background:#fef3c7;color:#92400e;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:700">⏳ ${_esc(STATUS[t.status])}</span>`
        : `<span style="background:#dbeafe;color:#1e40af;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:700">✏️ ${_esc(STATUS[t.status])}</span>`;
      return `
      <div class="card" style="margin-bottom:10px;cursor:pointer" onclick="window.stocktake.open('${t.id}')">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <div>
            <div style="font-weight:800;font-size:14px">🏪 ${_esc(t.warehouseName)}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:3px">بدأه ${_esc(t.createdBy)} — ${_esc(_shortDate(t.createdAt))}</div>
          </div>
          <div style="text-align:left">
            ${badge}
            <div style="font-size:11px;color:var(--muted);margin-top:5px">عُدّ ${sm.counted}/${sm.total}${sm.bigCount?` — <span style="color:#b91c1c;font-weight:700">${sm.bigCount} فرق كبير</span>`:""}</div>
          </div>
        </div>
      </div>`;
    }).join("") : `<div class="card" style="text-align:center;color:var(--muted);padding:22px">لا توجد عمليات جرد مفتوحة حالياً</div>`;

    const doneRows = done.slice(0,50).map(t=>{
      const st = t.status==="applied"
        ? `<span style="color:#166534;font-weight:700">✅ ${_esc(STATUS[t.status])}</span>`
        : `<span style="color:var(--muted)">🚫 ${_esc(STATUS[t.status])}</span>`;
      const res = (t.results||[]);
      const adj = res.filter(r=>_num(r.delta)!==0).length;
      return `<tr style="cursor:pointer" onclick="window.stocktake.open('${t.id}')">
        <td style="padding:9px 12px;font-weight:700;font-size:13px">🏪 ${_esc(t.warehouseName)}</td>
        <td style="padding:9px 12px;text-align:center;font-size:12px">${_esc(_shortDate(t.appliedAt||t.cancelledAt||t.createdAt))}</td>
        <td style="padding:9px 12px;text-align:center;font-size:12px">${st}</td>
        <td style="padding:9px 12px;text-align:center;font-size:12px">${t.status==="applied"?`${adj} بند مُسوّى`:"—"}</td>
      </tr>`;
    }).join("");

    const doneTable = done.length ? `
      <div class="card">
        <div style="font-weight:800;font-size:14px;margin-bottom:10px">📜 سجل الجرد السابق</div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:var(--surface2)">
              <th style="padding:9px 12px;text-align:right;font-size:12px">المستودع</th>
              <th style="padding:9px 12px;text-align:center;font-size:12px">التاريخ</th>
              <th style="padding:9px 12px;text-align:center;font-size:12px">الحالة</th>
              <th style="padding:9px 12px;text-align:center;font-size:12px">النتيجة</th>
            </tr></thead>
            <tbody>${doneRows}</tbody>
          </table>
        </div>
      </div>` : "";

    return `
      <div class="page-hero">
        <div class="page-hero-titles">
          <div class="page-hero-title">📊 الجرد الشهري</div>
          <div class="page-hero-sub">جرد فعلي لكل مستودع ومطابقته برصيد النظام</div>
        </div>
        <div class="page-hero-actions">${startBtn}</div>
      </div>
      <div style="margin-bottom:14px">${openCards}</div>
      ${doneTable}`;
  }

  function _shortDate(iso){
    if(!iso) return "—";
    try{ const d=new Date(iso); return d.toLocaleDateString("en-GB")+" "+d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}); }
    catch(e){ return String(iso).slice(0,16); }
  }

  // ── شاشة التفاصيل ──
  function _detailHtml(t){
    // تهيئة مسودة العدّ من المحفوظ (مرة عند فتح الجرد)
    if(_counts.__forId !== t.id){
      _counts = {}; _counts.__forId = t.id;
      Object.entries(t.counts||{}).forEach(([k,v])=>{ _counts[k]=_num(v); });
    }
    const editable = (t.status==="counting") && _canManage();
    const canDecide = (t.status==="pending_approval") && _canApproveBig();
    const sm = _summarize(t, _liveCounts());

    // ترويسة الحالة
    let statusBadge;
    if(t.status==="counting")              statusBadge=`<span style="background:#dbeafe;color:#1e40af;padding:3px 11px;border-radius:12px;font-size:12px;font-weight:700">✏️ ${_esc(STATUS[t.status])}</span>`;
    else if(t.status==="pending_approval") statusBadge=`<span style="background:#fef3c7;color:#92400e;padding:3px 11px;border-radius:12px;font-size:12px;font-weight:700">⏳ ${_esc(STATUS[t.status])}</span>`;
    else if(t.status==="applied")          statusBadge=`<span style="background:#dcfce7;color:#166534;padding:3px 11px;border-radius:12px;font-size:12px;font-weight:700">✅ ${_esc(STATUS[t.status])}</span>`;
    else                                   statusBadge=`<span style="background:#f3f4f6;color:#374151;padding:3px 11px;border-radius:12px;font-size:12px;font-weight:700">🚫 ${_esc(STATUS[t.status])}</span>`;

    // صفوف البنود
    const applied = (t.status==="applied");
    const resById = {}; (t.results||[]).forEach(r=>{ resById[r.itemId]=r; });
    const rows = (t.snapshot||[]).map((s,idx)=>{
      const cVal = Object.prototype.hasOwnProperty.call(_liveCounts(), s.itemId) ? _liveCounts()[s.itemId] : "";
      const hasC = cVal!=="" && cVal!=null;
      const cls  = hasC ? _classify(s.systemQty, cVal) : null;
      let vCell = `<span style="color:var(--muted)">—</span>`;
      if(cls){
        if(cls.delta===0) vCell=`<span style="color:#166534;font-weight:700">مطابق</span>`;
        else{
          const sign = cls.delta>0?"+":"−";
          const col  = cls.delta>0?"#166534":"#b91c1c";
          const bigT = cls.big?` <span style="background:#fee2e2;color:#b91c1c;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700">كبير</span>`:"";
          vCell=`<span style="color:${col};font-weight:800">${sign}${_fmt(Math.abs(cls.delta))}</span>${bigT}`;
        }
      }
      const countCell = applied
        ? `<span style="font-weight:700">${resById[s.itemId]?_fmt(resById[s.itemId].countedQty):"—"}</span>`
        : (editable
            ? `<input type="number" step="any" min="0" inputmode="decimal"
                 data-item-id="${_esc(s.itemId)}" value="${hasC?_esc(cVal):""}"
                 oninput="window.stocktake._count(this)"
                 style="width:92px;padding:6px 8px;border:1px solid var(--border,#d1d5db);border-radius:8px;text-align:center;font-size:13px">`
            : `<span style="color:var(--muted)">${hasC?_fmt(cVal):"—"}</span>`);
      return `<tr style="border-bottom:1px solid var(--border,#eee)">
        <td style="padding:8px 10px">
          <div style="font-weight:700;font-size:13px">${_esc(s.itemName)}</div>
          ${s.itemCode?`<div style="font-size:11px;color:var(--muted)">${_esc(s.itemCode)}</div>`:""}
        </td>
        <td style="padding:8px 10px;text-align:center;font-size:13px">${_fmt(s.systemQty)} <span style="font-size:11px;color:var(--muted)">${_esc(s.unit||"")}</span></td>
        <td style="padding:8px 10px;text-align:center">${countCell}</td>
        <td style="padding:8px 10px;text-align:center;font-size:13px">${vCell}</td>
      </tr>`;
    }).join("");

    // أزرار الإجراءات
    let actions = "";
    if(editable){
      actions = `
        <label class="btn btn-ghost btn-sm" style="cursor:pointer">📥 استيراد Excel
          <input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="window.stocktake._import(this)">
        </label>
        <button class="btn btn-ghost btn-sm" onclick="window.stocktake.saveCounts()">💾 حفظ العدّ</button>
        <button class="btn btn-primary btn-sm" onclick="window.stocktake.submit()">✅ اعتماد وتطبيق</button>
        <button class="btn btn-danger btn-sm" onclick="window.stocktake.cancel()">🚫 إلغاء الجرد</button>`;
    } else if(canDecide){
      actions = `
        <button class="btn btn-primary btn-sm" onclick="window.stocktake.approve()">✅ اعتماد وتطبيق</button>
        <button class="btn btn-danger btn-sm" onclick="window.stocktake.reject()">↩ إرجاع للعدّ</button>`;
    }
    actions += ` <button class="btn btn-ghost btn-sm" onclick="window.stocktake.print()">🖨 تقرير للطباعة/التوقيع</button>`;

    // شريط الملخّص
    const summaryBar = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">
        ${_stat("عُدّ", sm.counted+"/"+sm.total, "#1e40af")}
        ${_stat("زيادة", sm.surplus, "#166534")}
        ${_stat("عجز", sm.shortage, "#b91c1c")}
        ${_stat("مطابق", sm.matched, "#374151")}
        ${sm.bigCount?_stat("فرق كبير ⚠", sm.bigCount, "#b91c1c"):""}
      </div>`;

    const bigNote = (editable && sm.bigCount) ? `
      <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:10px 14px;margin-bottom:10px;font-size:12px;color:#92400e">
        ⚠ يوجد <b>${sm.bigCount}</b> بند بفرق كبير (نسبته ≥ ${ST_BIG_PCT}%). عند الاعتماد سيُحوَّل الجرد لاعتماد المدير التنفيذي قبل تطبيق التسويات.
      </div>` : "";

    const pendingNote = (t.status==="pending_approval") ? `
      <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:10px 14px;margin-bottom:10px;font-size:12px;color:#92400e">
        ⏳ هذا الجرد بانتظار اعتماد المدير التنفيذي لوجود فروقات كبيرة. رفعه ${_esc(t.submittedBy||"—")} — ${_esc(_shortDate(t.submittedAt))}.
      </div>` : "";

    return `
      <div class="page-hero">
        <div class="page-hero-titles">
          <div class="page-hero-title">📊 جرد: ${_esc(t.warehouseName)}</div>
          <div class="page-hero-sub">${statusBadge} &nbsp; بدأه ${_esc(t.createdBy)} — ${_esc(_shortDate(t.createdAt))}</div>
        </div>
        <div class="page-hero-actions">
          <button class="btn btn-sm" onclick="window.stocktake.back()">← رجوع للقائمة</button>
        </div>
      </div>
      ${pendingNote}${bigNote}
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="font-weight:800;font-size:14px">بنود المستودع (${(t.snapshot||[]).length})</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">${actions}</div>
        </div>
        ${summaryBar}
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:var(--surface2)">
              <th style="padding:8px 10px;text-align:right;font-size:12px">البند</th>
              <th style="padding:8px 10px;text-align:center;font-size:12px">رصيد النظام</th>
              <th style="padding:8px 10px;text-align:center;font-size:12px">المعدود فعلياً</th>
              <th style="padding:8px 10px;text-align:center;font-size:12px">الفرق</th>
            </tr></thead>
            <tbody>${rows||`<tr><td colspan="4" style="padding:20px;text-align:center;color:var(--muted)">لا بنود في هذا المستودع</td></tr>`}</tbody>
          </table>
        </div>
      </div>
      ${_signedFileCardHtml(t)}`;
  }

  // ── بطاقة الملف الموقّع (رفع/عرض) — متاحة في أي حالة، بصلاحية مسؤول المستودع/الأدمن ──
  function _signedFileCardHtml(t){
    const canUp = _canManage();
    const has = !!t.signedFileUrl;
    let inner;
    if(has){
      const meta = `${_esc(t.signedUploadedBy||"—")} — ${_esc(_shortDate(t.signedUploadedAt))}`;
      inner = `
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <a href="${_safeUrl(t.signedFileUrl)}" target="_blank" rel="noopener"
             style="display:inline-flex;align-items:center;gap:6px;background:#dcfce7;color:#166534;padding:8px 14px;border-radius:10px;font-weight:800;font-size:13px;text-decoration:none">
            📎 عرض الملف الموقّع${t.signedIsPdf?" (PDF)":""}
          </a>
          <span style="font-size:11px;color:var(--muted)">رفعه ${meta}</span>
        </div>`;
    } else {
      inner = `<div style="font-size:12px;color:var(--muted)">لم يُرفع ملف موقّع بعد. اطبع التقرير ووقّعه ثم ارفعه هنا (PDF أو صورة).</div>`;
    }
    const upBtn = canUp ? `
        <label class="btn btn-ghost btn-sm" style="cursor:pointer;margin-top:10px">${has?"🔄 استبدال الملف الموقّع":"⬆ رفع الملف الموقّع"}
          <input type="file" accept="application/pdf,image/*" style="display:none" onchange="window.stocktake._uploadSigned(this)">
        </label>
        <div id="_st-signed-status" style="font-size:11px;color:var(--muted);margin-top:6px"></div>` : "";
    return `
      <div class="card" style="margin-top:12px">
        <div style="font-weight:800;font-size:14px;margin-bottom:10px">✍ الملف الموقّع</div>
        ${inner}
        ${upBtn}
      </div>`;
  }

  function _stat(label, val, color){
    return `<div style="background:var(--surface2);border-radius:10px;padding:8px 14px;min-width:78px;text-align:center">
      <div style="font-size:18px;font-weight:800;color:${color}">${_esc(String(val))}</div>
      <div style="font-size:11px;color:var(--muted)">${_esc(label)}</div>
    </div>`;
  }

  // مسودة العدّ الحية بدون المفتاح الداخلي __forId
  function _liveCounts(){
    const o={}; Object.keys(_counts).forEach(k=>{ if(k!=="__forId") o[k]=_counts[k]; }); return o;
  }

  // ════════ التفاعل ════════

  function open(id){ _curId=id; _counts={}; render(); window.scrollTo(0,0); }
  function back(){ _curId=null; _counts={}; render(); }

  // تحديث خلية الفرق فور الكتابة (بلا إعادة رسم كامل)
  function _count(inp){
    const id = inp.getAttribute("data-item-id");
    const raw = inp.value;
    if(raw===""){ delete _counts[id]; }
    else { _counts[id] = _num(raw); }
    // تحديث خلية الفرق في نفس الصف
    const tr = inp.closest("tr");
    if(tr){
      const t = _takes.find(x=>x.id===_curId);
      const s = t && (t.snapshot||[]).find(x=>x.itemId===id);
      const cell = tr.children[3];
      if(s && cell){
        if(raw===""){ cell.innerHTML=`<span style="color:var(--muted)">—</span>`; }
        else{
          const c=_classify(s.systemQty, _num(raw));
          if(c.delta===0) cell.innerHTML=`<span style="color:#166534;font-weight:700">مطابق</span>`;
          else{
            const sign=c.delta>0?"+":"−", col=c.delta>0?"#166534":"#b91c1c";
            const bigT=c.big?` <span style="background:#fee2e2;color:#b91c1c;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700">كبير</span>`:"";
            cell.innerHTML=`<span style="color:${col};font-weight:800">${sign}${_fmt(Math.abs(c.delta))}</span>${bigT}`;
          }
        }
      }
    }
  }

  // ── بدء جرد جديد: اختيار المستودع ──
  function startNew(){
    if(!_canManage()){ _toast("⚠ صلاحية مسؤول المستودع أو الأدمن فقط","warn"); return; }
    const names = _warehouseNames();
    if(!names.length){ _toast("⚠ لا توجد مستودعات مسجّلة بعد","warn"); return; }
    // امنع جردين مفتوحين على نفس المستودع
    const openWh = new Set(_takes.filter(t=>t.status==="counting"||t.status==="pending_approval").map(t=>t.warehouseName));
    const opts = names.map(n=>{
      const busy = openWh.has(n);
      return `<option value="${_esc(n)}"${busy?" disabled":""}>${_esc(n)}${busy?" — جردٌ مفتوح":""}</option>`;
    }).join("");
    _showModal({
      title:"➕ بدء جرد شهري جديد",
      body:`<div style="font-size:13px;color:var(--muted);margin-bottom:8px">اختر المستودع المراد جرده. ستُلتقط لقطة برصيد النظام الحالي لكل بنوده.</div>
            <select id="_st-wh-pick" style="width:100%;padding:9px;border:1px solid var(--border,#d1d5db);border-radius:8px;font-size:14px">
              <option value="">— اختر المستودع —</option>${opts}
            </select>`,
      okText:"بدء الجرد",
      onOk: async ()=>{
        const wh = (document.getElementById("_st-wh-pick")||{}).value || "";
        if(!wh){ _toast("⚠ اختر المستودع","warn"); return false; }
        return await _createTake(wh);
      }
    });
  }

  async function _createTake(wh){
    if(typeof db==="undefined" || !db){ _toast("⚠ لا اتصال بقاعدة البيانات","warn"); return false; }
    const items = _itemsInWarehouse(wh);
    if(!items.length){ _toast("⚠ لا بنود في هذا المستودع","warn"); return false; }
    const snapshot = items.map(i=>({
      itemId:   i.id,
      itemName: i.itemName || i.name || "—",
      itemCode: i.itemCode || "",
      category: i.category || "",
      unit:     i.unit || "",
      systemQty:_num(i.currentQty)
    }));
    try{
      const ref = await db.collection(COLL()).add({
        warehouseName: wh,
        status: "counting",
        createdAt: _now(),
        createdBy: _me(),
        createdByRole: _myRole(),
        bigPct: ST_BIG_PCT,
        absFloor: ST_ABS_FLOOR,
        snapshot,
        counts: {}
      });
      _audit("بدء جرد شهري","المستودع: "+wh+" — عدد البنود: "+snapshot.length);
      _toast("✅ بدأ الجرد — "+snapshot.length+" بند","success");
      _curId = ref.id; _counts={};
      render();
      return true;
    }catch(e){ console.warn("createTake:",e); _toast("⚠ تعذّر بدء الجرد: "+e.message,"warn"); return false; }
  }

  // ── حفظ العدّ (يبقى الجرد قيد العدّ) ──
  async function saveCounts(){
    const t = _takes.find(x=>x.id===_curId);
    if(!t){ return; }
    if(t.status!=="counting" || !_canManage()){ _toast("⚠ لا يمكن التعديل الآن","warn"); return; }
    try{
      await db.collection(COLL()).doc(t.id).update({ counts:_liveCounts(), countsUpdatedAt:_now(), countsUpdatedBy:_me() });
      _toast("💾 حُفظ العدّ","success");
    }catch(e){ console.warn("saveCounts:",e); _toast("⚠ تعذّر الحفظ: "+e.message,"warn"); }
  }

  // ── اعتماد وتطبيق (من أمين المستودع) ──
  async function submit(){
    const t = _takes.find(x=>x.id===_curId);
    if(!t || t.status!=="counting" || !_canManage()) return;
    const counts=_liveCounts();
    const sm=_summarize(t, counts);
    if(sm.counted===0){ _toast("⚠ لم تُدخل أي كمية معدودة","warn"); return; }

    // احفظ العدّ أولاً
    try{ await db.collection(COLL()).doc(t.id).update({ counts, countsUpdatedAt:_now(), countsUpdatedBy:_me() }); }catch(e){}

    if(sm.remaining>0){
      const ok = await _confirm({title:"بنود لم تُعدّ", msg:`لم تُدخل كمية لـ ${sm.remaining} بند من ${sm.total}. البنود غير المعدودة ستُترك دون تسوية (كأنها مطابقة). هل تريد المتابعة؟`, icon:"⚠", okText:"متابعة", okClass:"btn-primary"});
      if(!ok) return;
    }

    if(sm.bigCount>0){
      // يحتاج اعتماد المدير التنفيذي
      const ok = await _confirm({title:"فروقات كبيرة", msg:`يوجد ${sm.bigCount} بند بفرق كبير. سيُرفع الجرد لاعتماد المدير التنفيذي قبل تطبيق أي تسوية.`, icon:"⏳", okText:"رفع للاعتماد", okClass:"btn-primary"});
      if(!ok) return;
      try{
        await db.collection(COLL()).doc(t.id).update({ status:"pending_approval", counts, submittedAt:_now(), submittedBy:_me() });
        _audit("رفع جرد لاعتماد المدير التنفيذي","المستودع: "+t.warehouseName+" — فروقات كبيرة: "+sm.bigCount);
        _toast("⏳ رُفع الجرد لاعتماد المدير التنفيذي","success");
      }catch(e){ _toast("⚠ تعذّر الرفع: "+e.message,"warn"); }
      return;
    }

    // لا فروقات كبيرة → تطبيق مباشر بصلاحية أمين المستودع
    const ok = await _confirm({title:"اعتماد وتطبيق الجرد", msg:`سيتم تسوية ${sm.surplus+sm.shortage} بند (زيادة ${sm.surplus} / عجز ${sm.shortage}) ليطابق الرصيد الواقعَ المعدود. لا رجعة تلقائية عن هذه العملية.`, icon:"✅", okText:"اعتماد وتطبيق", okClass:"btn-primary"});
    if(!ok) return;
    await _apply(t, counts, {approvedBy:_me(), approverRole:_myRole(), auto:true});
  }

  // ── اعتماد المدير التنفيذي للفروقات الكبيرة ──
  async function approve(){
    const t = _takes.find(x=>x.id===_curId);
    if(!t || t.status!=="pending_approval" || !_canApproveBig()) return;
    const counts = t.counts||{};
    const sm=_summarize(t, counts);
    const ok = await _confirm({title:"اعتماد وتطبيق الجرد", msg:`اعتماد جرد «${t.warehouseName}» وتطبيق تسوية ${sm.surplus+sm.shortage} بند (منها ${sm.bigCount} فرق كبير). لا رجعة تلقائية عن هذه العملية.`, icon:"✅", okText:"اعتماد وتطبيق", okClass:"btn-primary"});
    if(!ok) return;
    await _apply(t, counts, {approvedBy:_me(), approverRole:_myRole(), auto:false});
  }

  async function reject(){
    const t = _takes.find(x=>x.id===_curId);
    if(!t || t.status!=="pending_approval" || !_canApproveBig()) return;
    const ok = await _confirm({title:"إرجاع للعدّ", msg:"سيُعاد الجرد إلى حالة العدّ ليراجعه أمين المستودع. لن تُطبَّق أي تسوية.", icon:"↩", okText:"إرجاع", okClass:"btn-danger"});
    if(!ok) return;
    try{
      await db.collection(COLL()).doc(t.id).update({ status:"counting", returnedAt:_now(), returnedBy:_me() });
      _audit("إرجاع جرد للعدّ","المستودع: "+t.warehouseName);
      _toast("↩ أُعيد الجرد للعدّ","success");
    }catch(e){ _toast("⚠ تعذّر الإرجاع: "+e.message,"warn"); }
  }

  async function cancel(){
    const t = _takes.find(x=>x.id===_curId);
    if(!t || t.status!=="counting" || !_canManage()) return;
    const ok = await _confirm({title:"إلغاء الجرد", msg:"سيُلغى هذا الجرد نهائياً دون أي تسوية. لا يمكن استرجاعه.", icon:"🚫", okText:"إلغاء الجرد", okClass:"btn-danger"});
    if(!ok) return;
    try{
      await db.collection(COLL()).doc(t.id).update({ status:"cancelled", cancelledAt:_now(), cancelledBy:_me() });
      _audit("إلغاء جرد","المستودع: "+t.warehouseName);
      _toast("🚫 أُلغي الجرد","success");
      back();
    }catch(e){ _toast("⚠ تعذّر الإلغاء: "+e.message,"warn"); }
  }

  // ════════ التطبيق (قلب الوحدة) ════════
  // لكل بندٍ اختلف عدُّه: Transaction تقرأ الرصيد طازجاً، تُثبّت الرصيد = المعدود،
  // وتكتب قيد حركة adjust بـ adjustDelta = المعدود − الطازج. آمن ضد التكرار:
  // الإسناد مطلق (currentQty = counted)، فإعادة التشغيل تعطي نفس النتيجة و delta=0.
  async function _apply(take, counts, meta){
    if(_applying) return;
    _applying=true;
    if(typeof db==="undefined" || !db){ _applying=false; _toast("⚠ لا اتصال بقاعدة البيانات","warn"); return; }

    // ابنِ قائمة البنود ذات الفرق فقط
    const targets = (take.snapshot||[]).filter(s=>{
      if(!Object.prototype.hasOwnProperty.call(counts, s.itemId)) return false;
      return _num(counts[s.itemId]) !== _num(s.systemQty);
    });

    const now=_now(), by=_me();
    const results = (take.snapshot||[]).map(s=>{
      const has=Object.prototype.hasOwnProperty.call(counts, s.itemId);
      const counted = has?_num(counts[s.itemId]):_num(s.systemQty);
      const c=_classify(s.systemQty, counted);
      return { itemId:s.itemId, itemName:s.itemName, unit:s.unit, systemQty:_num(s.systemQty), countedQty:counted, delta:has?c.delta:0, big:has?c.big:false };
    });

    let done=0, failed=0;
    _toast("⏳ جارٍ تطبيق التسويات...","info");
    for(const s of targets){
      const counted=_num(counts[s.itemId]);
      try{
        await db.runTransaction(async tx=>{
          const invRef = db.collection(INVENTORY_COLLECTION()).doc(s.itemId);
          const snap = await tx.get(invRef);
          const fresh = snap.exists ? _num(snap.data().currentQty) : 0;
          const target = counted;
          const delta = Math.round((target-fresh)*1000)/1000;
          // ثبّت الرصيد = المعدود (إسناد مطلق)
          if(snap.exists){
            tx.update(invRef, { currentQty: target, lastUpdated: now });
          } else {
            tx.set(invRef, {
              itemId:s.itemId, itemName:s.itemName, itemCode:(s.itemCode||""),
              category:(s.category||""), unit:(s.unit||""), currentQty:target,
              warehouseName:take.warehouseName, lastUpdated:now
            });
          }
          // قيد حركة تسوية — فقط إذا اختلف عن الطازج فعلاً
          if(delta!==0){
            const logRef = db.collection(INVENTORY_LOG_COLLECTION()).doc();
            tx.set(logRef, {
              type:"adjust",
              adjustDelta: delta,
              qty: Math.abs(delta),
              itemId: s.itemId,
              itemName: s.itemName,
              itemCode: (s.itemCode||""),
              category: (s.category||""),
              unit: (s.unit||""),
              warehouseName: take.warehouseName,
              relatedPO:"", projectId:"", location:"",
              source:"stocktake",
              stocktakeId: take.id,
              notes:"تسوية جرد شهري — النظام: "+_fmt(s.systemQty)+" / المعدود: "+_fmt(target),
              performedBy: by,
              date: now
            });
          }
        });
        done++;
      }catch(e){ console.warn("apply item:",s.itemId,e); failed++; }
    }

    // أغلق الجرد وسجّل النتائج
    try{
      await db.collection(COLL()).doc(take.id).update({
        status:"applied",
        counts,
        results,
        appliedAt: now,
        appliedBy: by,
        approvedBy: meta.approvedBy||by,
        approverRole: meta.approverRole||_myRole(),
        adjustedCount: targets.length,
        appliedFailed: failed
      });
    }catch(e){ console.warn("close take:",e); }

    _applying=false;
    _audit("تطبيق تسويات جرد","المستودع: "+take.warehouseName+" — بنود مُسوّاة: "+done+(failed?(" — فشل: "+failed):""));
    if(failed) _toast("⚠ طُبّق "+done+" بند وفشل "+failed+" — أعد المحاولة","warn");
    else       _toast("✅ اكتمل الجرد — سُوّي "+done+" بند","success");
    render();
  }

  // ════════ استيراد Excel ════════
  // يبحث عن عمود كود/اسم وعمود كمية معدودة، ويطابق ببنود اللقطة (كود ثم اسم مطبّع).
  function _import(input){
    const file = input.files && input.files[0];
    input.value="";
    if(!file) return;
    if(typeof XLSX==="undefined"){ _toast("⚠ مكتبة قراءة Excel غير متاحة","warn"); return; }
    const t = _takes.find(x=>x.id===_curId);
    if(!t || t.status!=="counting"){ _toast("⚠ الجرد غير قابل للتعديل","warn"); return; }

    const reader=new FileReader();
    reader.onload=(ev)=>{
      try{
        const wb=XLSX.read(ev.target.result,{type:"array"});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
        if(!rows.length){ _toast("⚠ الملف فارغ","warn"); return; }

        // تحديد الأعمدة من الصف الأول (ترويسة)
        const head=rows[0].map(h=>_norm(h));
        const findCol=(cands)=>{ for(let i=0;i<head.length;i++){ if(cands.some(c=>head[i].includes(_norm(c)))) return i; } return -1; };
        let codeCol =findCol(["code","كود","رمز","الكود"]);
        let nameCol =findCol(["name","اسم","البند","الصنف","المادة"]);
        let qtyCol  =findCol(["count","counted","معدود","الكمية","كمية","جرد","فعلي","الفعلي","actual","qty"]);
        // إن غابت ترويسة الكمية، افترض آخر عمود
        if(qtyCol<0 && rows[0].length>=2) qtyCol=rows[0].length-1;
        if(qtyCol<0){ _toast("⚠ لم يُعثر على عمود الكمية المعدودة","warn"); return; }

        // خرائط المطابقة من اللقطة
        const byCode={}, byName={};
        (t.snapshot||[]).forEach(s=>{
          if(s.itemCode) byCode[_norm(s.itemCode)]=s.itemId;
          byName[_norm(s.itemName)]=s.itemId;
        });

        let matched=0, unmatched=0;
        for(let r=1;r<rows.length;r++){
          const row=rows[r]; if(!row||!row.length) continue;
          const qRaw=row[qtyCol];
          if(qRaw===""||qRaw==null) continue;
          const q=_num(qRaw);
          let id=null;
          if(codeCol>=0 && row[codeCol]!=="" ) id=byCode[_norm(row[codeCol])]||null;
          if(!id && nameCol>=0 && row[nameCol]!=="") id=byName[_norm(row[nameCol])]||null;
          if(!id){ unmatched++; continue; }
          _counts[id]=q; matched++;
        }
        render();
        _toast(`📥 استُورد ${matched} بند${unmatched?` — تعذّرت مطابقة ${unmatched}`:""}. راجع ثم احفظ العدّ.`, matched?"success":"warn");
      }catch(e){ console.warn("import:",e); _toast("⚠ تعذّرت قراءة الملف: "+e.message,"warn"); }
    };
    reader.onerror=()=>_toast("⚠ تعذّرت قراءة الملف","warn");
    reader.readAsArrayBuffer(file);
  }

  // ════════ تقرير الطباعة — بهوية الشركة ولوجوها + خانتا توقيع ════════
  // مستند HTML كامل يُمرَّر إلى _openPrintWindow (يعمل على iOS عبر Blob وعلى سطح المكتب
  // عبر window.open). اللوجو من العنصر المشترك #_logo_src_ برابط مطلق فيظهر داخل نافذة Blob.
  function _safeUrl(u){ try{ return safeUrl(u); }catch(e){ return String(u==null?"#":u); } }

  function print(){
    const t=_takes.find(x=>x.id===_curId); if(!t) return;
    const counts = (t.status==="applied") ? (function(){ const o={}; (t.results||[]).forEach(r=>o[r.itemId]=r.countedQty); return o; })() : (t.counts||_liveCounts());
    const sm=_summarize(t, counts);
    const logoSrc=(document.getElementById('_logo_src_')||{}).src || 'logo.png';
    const printDate=_shortDate(_now());

    const rowsHtml=(t.snapshot||[]).map(s=>{
      const has=Object.prototype.hasOwnProperty.call(counts,s.itemId);
      const cnt=has?_num(counts[s.itemId]):null;
      const c=has?_classify(s.systemQty,cnt):null;
      const dTxt=c?(c.delta===0?"مطابق":(c.delta>0?"+":"−")+_fmt(Math.abs(c.delta))+(c.big?" (كبير)":"")):"—";
      const dCol=c?(c.delta===0?"#166534":(c.delta>0?"#166534":"#b91c1c")):"#999";
      return `<tr>
        <td style="text-align:right">${_esc(s.itemName)}${s.itemCode?` <span style="color:#94a3b8">(${_esc(s.itemCode)})</span>`:""}</td>
        <td style="text-align:center">${_fmt(s.systemQty)} ${_esc(s.unit||"")}</td>
        <td style="text-align:center">${has?_fmt(cnt):"—"}</td>
        <td style="text-align:center;color:${dCol};font-weight:700">${dTxt}</td>
      </tr>`;
    }).join("");

    const sigBlock=(label,name)=>`
      <div style="flex:1;min-width:230px;border:1px solid #cbd5e1;border-radius:10px;padding:14px 16px">
        <div style="font-weight:800;font-size:13px;color:#1b3a6b;margin-bottom:16px">${label}</div>
        <div style="font-size:12px;color:#334155;margin-bottom:20px">الاسم: <span style="border-bottom:1px dotted #94a3b8;display:inline-block;min-width:150px">${name?_esc(name):"&nbsp;"}</span></div>
        <div style="font-size:12px;color:#334155;margin-bottom:20px">التوقيع: <span style="border-bottom:1px dotted #94a3b8;display:inline-block;min-width:150px">&nbsp;</span></div>
        <div style="font-size:12px;color:#334155">التاريخ: <span style="border-bottom:1px dotted #94a3b8;display:inline-block;min-width:120px">&nbsp;</span></div>
      </div>`;

    const html=`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>تقرير جرد — ${_esc(t.warehouseName)}</title>
      <style>
        @page{size:A4;margin:12mm}
        *{box-sizing:border-box}
        body{font-family:'Cairo','Tajawal','Segoe UI',Tahoma,sans-serif;direction:rtl;color:#0f172a;margin:0;padding:0;background:#fff}
        .wrap{padding:6px 4px}
        .hdr{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#1b3a6b;color:#fff;padding:12px 18px;border-radius:12px}
        .hdr .co{display:flex;align-items:center;gap:12px}
        .hdr .logo{background:#fff;border-radius:8px;padding:4px;flex-shrink:0}
        .hdr .logo img{width:46px;height:46px;object-fit:contain;display:block}
        .hdr h1{font-size:16px;margin:0;font-weight:900}
        .hdr .sub{font-size:10px;opacity:.82;margin-top:2px}
        .hdr .meta{font-size:10px;opacity:.9;text-align:left;line-height:1.7}
        .title{font-size:18px;font-weight:900;margin:16px 0 6px}
        .info{color:#475569;font-size:12px;margin-bottom:4px}
        table{width:100%;border-collapse:collapse;font-size:12px;margin-top:10px}
        th{background:#eff3fb;padding:7px 8px;border:1px solid #d5deee;font-weight:800}
        td{padding:6px 8px;border:1px solid #e2e8f0}
        .sig{display:flex;gap:14px;flex-wrap:wrap;margin-top:28px}
        .foot{margin-top:22px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:10px;color:#64748b;display:flex;justify-content:space-between}
      </style></head><body>
      <div class="wrap">
        <div class="hdr">
          <div class="co">
            <div class="logo"><img src="${logoSrc}" alt="شعار الشركة"></div>
            <div>
              <h1>شركة المباني السريعة للمقاولات</h1>
              <div class="sub">أعمال التشغيل والصيانة لمباني أمانة منطقة حائل</div>
            </div>
          </div>
          <div class="meta">
            <div>الجهة: أمانة منطقة حائل</div>
            <div>تاريخ الإصدار: ${printDate}</div>
          </div>
        </div>
        <div class="title">تقرير جرد شهري — ${_esc(t.warehouseName)}</div>
        <div class="info">الحالة: ${_esc(STATUS[t.status]||t.status)} — بدأه: ${_esc(t.createdBy)} (${_esc(_shortDate(t.createdAt))})${t.status==="applied"?` — اعتمده: ${_esc(t.approvedBy||"—")} (${_esc(_shortDate(t.appliedAt))})`:""}</div>
        <div class="info">إجمالي البنود: ${sm.total} — عُدّ: ${sm.counted} — زيادة: ${sm.surplus} — عجز: ${sm.shortage} — مطابق: ${sm.matched}${sm.bigCount?` — فروقات كبيرة: ${sm.bigCount}`:""}</div>
        <table>
          <thead><tr>
            <th style="text-align:right">البند</th>
            <th>رصيد النظام</th>
            <th>المعدود</th>
            <th>الفرق</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="sig">
          ${sigBlock("مسؤول المستودع","")}
          ${sigBlock("مسؤول الجرد", t.createdBy||"")}
        </div>
        <div class="foot">
          <span>شركة المباني السريعة للمقاولات — نظام إدارة المرافق والمشتريات</span>
          <span>تاريخ الإصدار: ${printDate}</span>
        </div>
      </div>
    </body></html>`;
    try{ _openPrintWindow(html); }catch(e){ _toast("⚠ تعذّر فتح نافذة الطباعة","warn"); }
  }

  // ════════ رفع الملف الموقّع (بعد الطباعة والتوقيع) ════════
  // يُخزَّن على وثيقة الجرد مباشرةً تحت stocktakes/<id>/ في Storage. الاستبدال يحذف
  // القديم بعد نجاح رفع الجديد. onSnapshot يعيد الرسم — لا ترقيع محلي.
  async function _uploadSigned(input){
    const file = input.files && input.files[0];
    input.value="";
    if(!file) return;
    const t = _takes.find(x=>x.id===_curId);
    if(!t){ _toast("⚠ الجرد غير موجود","warn"); return; }
    if(!_canManage()){ _toast("⚠ صلاحية مسؤول المستودع أو الأدمن فقط","warn"); return; }
    if(typeof storage==="undefined" || !storage){ _toast("⚠ خدمة التخزين غير متاحة","warn"); return; }
    const isPdf = file.type==="application/pdf" || /\.pdf$/i.test(file.name||"");
    const isImg = /^image\//.test(file.type||"") || /\.(jpe?g|png|webp|gif)$/i.test(file.name||"");
    if(!isPdf && !isImg){ _toast("⚠ الملف يجب أن يكون PDF أو صورة","warn"); return; }
    const statusEl = document.getElementById("_st-signed-status");
    if(statusEl) statusEl.textContent="⏳ جارٍ الرفع...";
    try{
      if(typeof _waitForFirebaseAuth==="function") await _waitForFirebaseAuth();
      let up = file;
      if(!isPdf && file.size>300*1024 && typeof _compressImage==="function"){
        if(statusEl) statusEl.textContent="🗜 جارٍ ضغط الصورة...";
        up = await _compressImage(file, 1800, 0.78);
      }
      if(statusEl) statusEl.textContent="⏳ جارٍ الرفع...";
      const ext = isPdf?"pdf":"jpg";
      const ref = storage.ref(`stocktakes/${t.id}/signed_${Date.now()}.${ext}`);
      const snap = await ref.put(up, isPdf?{contentType:"application/pdf"}:{contentType:"image/jpeg"});
      const url = await snap.ref.getDownloadURL();
      const now = _now();
      const oldPath = t.signedFilePath;
      await db.collection(COLL()).doc(t.id).update({
        signedFileUrl:  url,
        signedFilePath: ref.fullPath,
        signedFileName: (file.name||("موقّع."+ext)),
        signedIsPdf:    isPdf,
        signedUploadedAt: now,
        signedUploadedBy: _me()
      });
      if(oldPath){ try{ await storage.ref(oldPath).delete(); }catch(_e){} }
      _audit("رفع ملف جرد موقّع","المستودع: "+t.warehouseName);
      _toast("✅ تم رفع الملف الموقّع","success");
      // onSnapshot يُعيد رسم البطاقة برابط العرض — لا ترقيع محلي
    }catch(e){
      console.warn("upload signed:",e);
      if(statusEl) statusEl.textContent="⚠ فشل الرفع — "+((e&&e.message)||"تحقق من الاتصال");
      _toast("⚠ تعذّر رفع الملف","warn");
    }
  }

  // ════════ أغلفة آمنة لخدمات النواة ════════
  function _toast(m,t){ try{ toast(m,t); }catch(e){ console.log(m); } }
  function _audit(a,d){ try{ if(typeof logAudit==="function") logAudit(a,d); }catch(e){} }
  function _confirm(o){ try{ return showConfirm(o); }catch(e){ return Promise.resolve(window.confirm((o&&o.msg)||"تأكيد؟")); } }
  function _showModal(o){ try{ return showCustomModal(o); }catch(e){ _toast("⚠ تعذّر فتح النافذة","warn"); } }

  // ════════ الواجهة العامة ════════
  window.stocktake = {
    startSync, render, open, back,
    startNew, saveCounts, submit, approve, reject, cancel, print,
    _count, _import, _uploadSigned
  };
})();
