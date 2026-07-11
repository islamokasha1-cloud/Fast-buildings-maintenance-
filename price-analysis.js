/* ════════════════════════════════════════════════════════════════════
   محرك تحليل الأسعار — Price / Rate Build-up Engine  (ملف خارجي IIFE)
   عقد صارم: يعرّض window.priceAnalysis فقط | يكتب على مجموعة Firestore
   خاصة به (global_price_analysis) | يقرأ حالة النواة بالاسم المجرد فقط.
   المصادر: الخامات ← _catalogItems (كتالوج البنود) | المصنعيات ←
   window.laborCatalog.getItems() | إدخال يدوي مسموح في الطرفين.
   يعتمد على دوال النواة: toast, esc, openModal, closeModal, showConfirm,
   pgSlice, pgBar, pgReset, canManageCatalog, isViewer  والمتغيرات:
   db, currentUser, IS_DEV, firebase, XLSX.
   ════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  // ══ إعدادات ══
  function COLLECTION(){
    return (typeof IS_DEV!=='undefined' && IS_DEV)
      ? "global_price_analysis_dev" : "global_price_analysis";
  }
  const CODE_PREFIX = "PA";
  const PG_KEY = "priceAnalysisTable";

  const DEFAULT_CATEGORIES = [
    "أعمال ترابية","مباني","لياسة","بلاط وأرضيات","دهانات","عزل",
    "سباكة","كهرباء","أعمال حدادة","أعمال نجارة","أعمال جبس","تكييف","متفرقة"
  ];
  // وحدات البند المحلَّل (الوحدة المنجَزة)
  const ITEM_UNITS = ["م2","م3","م.ط","عدد","مقطوعية","طن","كجم","لتر","ساعة","يومية","أخرى"];

  // ══ حالة داخلية ══
  let _items = [];
  let _unsub = null;
  let _loaded = false;
  let _domBuilt = false;
  // مسودة المحرّر الحالي — المصدر الوحيد لصفوف المكوّنات أثناء التحرير
  let _draft = null;   // { materials:[...], labor:[...] }
  // حالة نافذة المنتقي المشتركة
  let _pickerMode = null;   // 'mat' | 'labor' | 'rfq'
  let _rfqCb = null;        // كولباك تغذية RFQ

  // ══ جسور آمنة لدوال النواة ══
  function T(msg,type){ try{ if(typeof toast==='function') toast(msg,type); }catch(e){} }
  function E(s){ try{ return (typeof esc==='function') ? esc(s) : String(s==null?'':s); }catch(e){ return String(s==null?'':s); } }
  function canManage(){ try{ return (typeof canManageCatalog==='function') ? canManageCatalog() : false; }catch(e){ return false; } }
  function isViewerMode(){ try{ return (typeof isViewer==='function') ? isViewer() : false; }catch(e){ return false; } }
  function userLabel(){ try{ return (currentUser && (currentUser.name||currentUser.user)) || "—"; }catch(e){ return "—"; } }
  function stamp(){ return firebase.firestore.FieldValue.serverTimestamp(); }
  function matSource(){ try{ return (typeof _catalogItems!=='undefined' && _catalogItems) ? _catalogItems : []; }catch(e){ return []; } }
  function laborSource(){ try{ return (window.laborCatalog && window.laborCatalog.getItems) ? (window.laborCatalog.getItems()||[]) : []; }catch(e){ return []; } }

  function num(v){ const n = parseFloat(String(v==null?"":v).replace(/,/g,".")); return isNaN(n)?0:n; }
  function fmt(n){ return (n==null?0:n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}); }

  // ══ توليد الكود التسلسلي PA-### ══
  function genCode(){
    const nums = _items
      .filter(c => c.code && c.code.indexOf(CODE_PREFIX + "-") === 0)
      .map(c => { const n = parseInt(c.code.slice(CODE_PREFIX.length+1),10); return isNaN(n)?0:n; });
    const next = nums.length ? Math.max.apply(null,nums)+1 : 1;
    return CODE_PREFIX + "-" + String(next).padStart(3,"0");
  }

  function currentCategories(){
    const set = new Set(DEFAULT_CATEGORIES);
    _items.forEach(it=>{ if(it.category && it.category.trim()) set.add(it.category.trim()); });
    return Array.from(set);
  }

  // ══ الحساب — المصدر الوحيد لكل الأرقام ══
  function compute(draft, wastePct, overheadPct){
    const w = num(wastePct)/100, o = num(overheadPct)/100;
    let matBase = 0, laborCost = 0;
    (draft.materials||[]).forEach(m=>{ matBase += num(m.qty)*num(m.price); });
    (draft.labor||[]).forEach(l=>{ laborCost += num(l.qty)*num(l.rate); });
    const matCost = matBase*(1+w);
    const directCost = matCost + laborCost;
    const unitPrice = directCost*(1+o);
    return { matBase, matCost, laborCost, directCost, unitPrice };
  }

  // ══ بناء DOM مرة واحدة ══
  function buildDOM(){
    if(_domBuilt) return;
    const page = document.getElementById("page-price-analysis");
    if(!page) return;

    page.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="card-header">
        <div class="card-title">🧮 محرك تحليل الأسعار</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" data-viewer-hide onclick="window.priceAnalysis.exportExcel()" title="تصدير Excel">📥 تصدير Excel</button>
          <button class="btn btn-primary btn-sm" onclick="window.priceAnalysis.openEditor()">➕ تحليل بند جديد</button>
        </div>
      </div>
      <div class="card-body">
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;font-size:12px;color:#1e40af;margin-bottom:14px">
          ℹ️ يبني سعر الوحدة لكل بند من مكوّناته: خامات (من كتالوج البنود أو يدوياً) + مصنعيات (من كتالوج المصنعيات أو يدوياً)، مع نسبة هدر على الخامات ومصاريف إدارية. البنود المحلَّلة مكتبة عامة مشتركة تُستخدم لاحقاً كأسعار تقديرية في طلبات التسعير.
        </div>
        <div class="cat-toolbar">
          <input class="form-input cat-search" id="pa-search-input" placeholder="🔍 بحث بالاسم أو الكود..." oninput="pgReset('${PG_KEY}');window.priceAnalysis.render()">
          <select class="form-select" id="pa-filter-cat" onchange="pgReset('${PG_KEY}');window.priceAnalysis.render()" style="min-width:150px">
            <option value="">كل التصنيفات</option>
          </select>
          <select class="form-select" id="pa-filter-unit" onchange="pgReset('${PG_KEY}');window.priceAnalysis.render()" style="min-width:110px">
            <option value="">كل الوحدات</option>
            ${ITEM_UNITS.map(u=>`<option>${u}</option>`).join("")}
          </select>
          <button class="btn btn-ghost btn-sm" onclick="window.priceAnalysis.resetFilters()" title="مسح الفلاتر" style="font-size:12px">✖ مسح</button>
        </div>
        <div class="cat-table-wrap">
          <table class="cat-table">
            <thead>
              <tr>
                <th style="width:40px">#</th>
                <th>الكود</th>
                <th>اسم البند</th>
                <th>التصنيف</th>
                <th>الوحدة</th>
                <th style="text-align:center">تكلفة الخامات</th>
                <th style="text-align:center">تكلفة العمالة</th>
                <th style="text-align:center">سعر الوحدة (ر.س)</th>
                <th style="width:90px;text-align:center">إجراءات</th>
              </tr>
            </thead>
            <tbody id="pa-tbody"></tbody>
          </table>
          <div id="pa-empty" class="cat-empty" style="display:none">📭 لا توجد بنود محلَّلة — أضف تحليلاً جديداً من الزر أعلاه</div>
        </div>
        <div id="pa-count" style="text-align:left;font-size:11px;color:var(--muted);padding:6px 4px"></div>
        <div id="pa-pager" style="padding:0 4px"></div>
      </div>
    </div>`;

    injectEditorModal();
    injectPickerModal();

    try{ if(typeof pgReset==='function') pgReset(PG_KEY); }catch(e){}
    _domBuilt = true;
  }

  // ── مودال المحرّر ──
  function injectEditorModal(){
    if(document.getElementById("modal-price-analysis")) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = `
    <div class="modal-overlay" id="modal-price-analysis" style="display:none">
      <div class="modal" style="max-width:760px;width:100%">
        <div class="modal-header">
          <div class="modal-title" id="pa-modal-title">➕ تحليل بند جديد</div>
          <button class="modal-close" onclick="closeModal('modal-price-analysis')">✕</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="pa-edit-id">
          <div class="form-row" style="margin-bottom:10px">
            <div class="form-group">
              <label class="form-label">التصنيف <span>*</span></label>
              <select class="form-select" id="pa-category-select" onchange="window.priceAnalysis.onCategoryChange()">
                <option value="">اختر...</option>
              </select>
              <input class="form-input" id="pa-category-custom" placeholder="اكتب التصنيف الجديد..." style="display:none;margin-top:6px">
            </div>
            <div class="form-group">
              <label class="form-label">الكود <span id="pa-code-lbl" style="color:var(--accent);font-size:10px;font-weight:600"></span></label>
              <input class="form-input" id="pa-code" placeholder="يُولَّد تلقائياً" style="font-family:monospace;direction:ltr;text-align:left">
            </div>
          </div>
          <div class="form-row" style="margin-bottom:12px">
            <div class="form-group" style="flex:2">
              <label class="form-label">اسم البند المحلَّل <span>*</span></label>
              <input class="form-input" id="pa-name" placeholder="مثال: لياسة أسمنتية للجدران (م2)...">
            </div>
            <div class="form-group">
              <label class="form-label">وحدة البند <span>*</span></label>
              <select class="form-select" id="pa-unit">
                <option value="">اختر...</option>
                ${ITEM_UNITS.map(u=>`<option>${u}</option>`).join("")}
              </select>
            </div>
          </div>

          <!-- ══ الخامات ══ -->
          <div style="display:flex;align-items:center;justify-content:space-between;margin:4px 0 6px">
            <b style="font-size:13px">🧱 الخامات <span style="font-weight:400;color:var(--muted);font-size:11px">(الكمية لكل وحدة واحدة من البند)</span></b>
            <div style="display:flex;gap:6px">
              <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="window.priceAnalysis.openPicker('mat')">📦 من الكتالوج</button>
              <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="window.priceAnalysis.addManualRow('mat')">➕ يدوي</button>
            </div>
          </div>
          <div id="pa-mat-rows"></div>

          <!-- ══ المصنعيات ══ -->
          <div style="display:flex;align-items:center;justify-content:space-between;margin:14px 0 6px">
            <b style="font-size:13px">🛠️ المصنعيات <span style="font-weight:400;color:var(--muted);font-size:11px">(الكمية لكل وحدة واحدة من البند)</span></b>
            <div style="display:flex;gap:6px">
              <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="window.priceAnalysis.openPicker('labor')">🛠️ من الكتالوج</button>
              <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="window.priceAnalysis.addManualRow('labor')">➕ يدوي</button>
            </div>
          </div>
          <div id="pa-labor-rows"></div>

          <!-- ══ التحميلات ══ -->
          <div class="form-row" style="margin:14px 0 4px">
            <div class="form-group">
              <label class="form-label">نسبة الهدر على الخامات (%)</label>
              <input class="form-input" id="pa-waste" type="text" inputmode="decimal" placeholder="0" value="0" oninput="window.priceAnalysis.markupInput()" style="font-family:monospace;direction:ltr;text-align:left">
            </div>
            <div class="form-group">
              <label class="form-label">مصاريف إدارية (%)</label>
              <input class="form-input" id="pa-overhead" type="text" inputmode="decimal" placeholder="0" value="0" oninput="window.priceAnalysis.markupInput()" style="font-family:monospace;direction:ltr;text-align:left">
            </div>
            <div class="form-group" style="align-self:flex-end">
              <button class="btn btn-ghost btn-sm" style="font-size:11px;width:100%" onclick="window.priceAnalysis.refreshPrices()" title="تحديث أسعار البنود المسحوبة من الكتالوج">🔄 تحديث الأسعار</button>
            </div>
          </div>

          <!-- ══ الملخّص الحيّ ══ -->
          <div id="pa-summary" style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-top:10px;font-size:13px"></div>

          <div class="form-group" style="margin-top:12px">
            <label class="form-label">ملاحظات (اختياري)</label>
            <textarea class="form-input" id="pa-notes" rows="2" placeholder="افتراضات التحليل أو مواصفات..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal('modal-price-analysis')">إلغاء</button>
          <button class="btn btn-primary" onclick="window.priceAnalysis.save()">💾 حفظ التحليل</button>
        </div>
      </div>
    </div>`;
    document.body.appendChild(wrap.firstElementChild);
  }

  // ── مودال المنتقي المشترك (خامات / مصنعيات / تغذية RFQ) ──
  function injectPickerModal(){
    if(document.getElementById("modal-pa-picker")) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = `
    <div class="modal-overlay" id="modal-pa-picker" style="display:none;z-index:9200">
      <div class="modal" style="max-width:560px;width:100%;display:flex;flex-direction:column;max-height:80vh">
        <div class="modal-header">
          <div class="modal-title" id="pa-picker-title">اختر من الكتالوج</div>
          <button class="modal-close" onclick="document.getElementById('modal-pa-picker').style.display='none'">✕</button>
        </div>
        <div style="padding:10px 16px 6px">
          <input class="form-input" type="text" id="pa-picker-search" placeholder="🔍 بحث بالاسم أو الكود..." oninput="window.priceAnalysis.pickerSearch()" autocomplete="off">
        </div>
        <div id="pa-picker-list" style="overflow-y:auto;flex:1;min-height:200px;max-height:56vh;padding:6px 0"></div>
      </div>
    </div>`;
    document.body.appendChild(wrap.firstElementChild);
  }

  // ══ تعبئة قوائم التصنيفات ══
  function populateCategorySelects(){
    const cats = currentCategories();
    const optsHtml = cats.map(c=>`<option value="${E(c)}">${E(c)}</option>`).join("");
    const sel = document.getElementById("pa-category-select");
    if(sel){
      const cur = sel.value;
      sel.innerHTML = '<option value="">اختر...</option>' + optsHtml + '<option value="__new__">＋ تصنيف جديد…</option>';
      if(cur && cats.indexOf(cur)!==-1) sel.value = cur;
    }
    const fsel = document.getElementById("pa-filter-cat");
    if(fsel){
      const curF = fsel.value;
      fsel.innerHTML = '<option value="">كل التصنيفات</option>' + optsHtml;
      if(curF && cats.indexOf(curF)!==-1) fsel.value = curF;
    }
  }

  function onCategoryChange(){
    const sel = document.getElementById("pa-category-select");
    const custom = document.getElementById("pa-category-custom");
    if(!sel || !custom) return;
    if(sel.value === "__new__"){ custom.style.display=""; custom.value=""; try{ custom.focus(); }catch(e){} }
    else { custom.style.display="none"; custom.value=""; }
  }
  function readCategory(){
    const sel = document.getElementById("pa-category-select");
    const custom = document.getElementById("pa-category-custom");
    if(!sel) return "";
    if(sel.value === "__new__") return custom ? custom.value.trim() : "";
    return sel.value.trim();
  }

  // ══ مزامنة فورية ══
  function startSync(){
    if(typeof db==='undefined' || !db) return;
    if(_unsub){ _unsub(); _unsub=null; }
    _unsub = db.collection(COLLECTION())
      .orderBy("name","asc")
      .onSnapshot(function(snap){
        _items = snap.docs.map(function(d){ return Object.assign({id:d.id}, d.data()); });
        _loaded = true;
        const pg = document.getElementById("page-price-analysis");
        if(pg && pg.classList.contains("active")) render();
      }, function(e){ console.warn("price analysis sync error:", e); _loaded=true; });
  }

  // ══ عرض الجدول ══
  function render(){
    buildDOM();
    populateCategorySelects();
    const tbody = document.getElementById("pa-tbody");
    const emptyEl = document.getElementById("pa-empty");
    const countEl = document.getElementById("pa-count");
    if(!tbody) return;

    const q = (document.getElementById("pa-search-input")?.value||"").trim().toLowerCase();
    const catF = (document.getElementById("pa-filter-cat")?.value||"").trim().toLowerCase();
    const unitF = document.getElementById("pa-filter-unit")?.value||"";

    let items = _items.filter(function(it){
      if(catF && !((it.category||"").toLowerCase().includes(catF))) return false;
      if(unitF && (it.unit||"") !== unitF) return false;
      if(!q) return true;
      return (it.name||"").toLowerCase().includes(q) ||
             (it.code||"").toLowerCase().includes(q) ||
             (it.category||"").toLowerCase().includes(q);
    });

    if(items.length===0){
      tbody.innerHTML="";
      if(emptyEl) emptyEl.style.display="";
      if(countEl) countEl.textContent="";
      const _p=document.getElementById("pa-pager"); if(_p) _p.innerHTML="";
      return;
    }
    if(emptyEl) emptyEl.style.display="none";
    if(countEl) countEl.textContent="إجمالي البنود المحلَّلة: "+items.length;

    const canEdit = canManage();
    const hideRate = isViewerMode();
    const sl = pgSlice(PG_KEY, items);
    const pgItems = sl.items;
    const offset = (sl.page-1)*sl.size;

    tbody.innerHTML = pgItems.map(function(it,i){
      const mat = hideRate ? '🔒' : fmt(it.matCost);
      const lab = hideRate ? '🔒' : fmt(it.laborCost);
      const up  = hideRate ? '🔒' : (fmt(it.unitPrice)+" ر.س");
      const nMat = (it.materials||[]).length, nLab = (it.labor||[]).length;
      return `
      <tr>
        <td style="font-weight:700;color:var(--muted)">${offset+i+1}</td>
        <td>${it.code ? `<span class="cat-code-badge">${E(it.code)}</span>` : '<span style="color:var(--muted)">—</span>'}</td>
        <td style="font-weight:700">${E(it.name||"")}<div style="font-size:10px;color:var(--muted);font-weight:400">${nMat} خامة • ${nLab} مصنعية</div></td>
        <td><span style="font-size:11px;background:var(--surface2);border-radius:5px;padding:2px 7px">${E(it.category||"")}</span></td>
        <td style="text-align:center">${E(it.unit||"")}</td>
        <td style="text-align:center;font-family:'JetBrains Mono',monospace">${mat}</td>
        <td style="text-align:center;font-family:'JetBrains Mono',monospace">${lab}</td>
        <td style="text-align:center;font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--accent)">${up}</td>
        <td style="text-align:center">
          ${canEdit?`
            <button class="btn btn-ghost btn-sm" onclick="window.priceAnalysis.openEditor('${E(it.id)}')" style="padding:3px 8px;font-size:11px" title="تعديل">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="window.priceAnalysis.del('${E(it.id)}','${E((it.name||"").replace(/'/g,"\\'"))}')" style="padding:3px 8px;font-size:11px" title="حذف">🗑</button>
          `:"—"}
        </td>
      </tr>`;
    }).join("");

    const pagerEl=document.getElementById("pa-pager");
    if(pagerEl) pagerEl.innerHTML=pgBar(PG_KEY, sl.totalPages, sl.total);
  }

  function resetFilters(){
    ["pa-search-input","pa-filter-cat","pa-filter-unit"]
      .forEach(function(idf){ const el=document.getElementById(idf); if(el) el.value=""; });
    pgReset(PG_KEY); render();
  }

  // ══ رسم صفوف المكوّنات من المسودة ══
  function rowsHtml(kind){
    const arr = (_draft && _draft[kind]) || [];
    const isMat = kind==="mat";
    const priceField = isMat ? "price" : "rate";
    const priceLbl = isMat ? "السعر" : "الأجرة";
    if(!arr.length){
      return `<div style="font-size:11px;color:var(--muted);padding:6px 2px 2px">— لا توجد ${isMat?"خامات":"مصنعيات"} بعد —</div>`;
    }
    return arr.map(function(r,i){
      const line = num(r.qty)*num(r[priceField]);
      const badge = r.source==="catalog"
        ? `<span style="font-size:9px;background:#dbeafe;color:#1e40af;border-radius:4px;padding:1px 5px">📦 كتالوج</span>`
        : `<span style="font-size:9px;background:#f1f5f9;color:#64748b;border-radius:4px;padding:1px 5px">يدوي</span>`;
      return `
      <div style="display:grid;grid-template-columns:2fr 70px 60px 72px 78px 30px;gap:6px;align-items:center;margin-bottom:6px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:6px 8px">
        <div style="min-width:0">
          <input class="form-input" style="font-size:12px;padding:5px 7px" placeholder="${isMat?"اسم الخامة":"اسم المصنعية"}" value="${E(r.name||"")}" oninput="window.priceAnalysis.rowInput('${kind}',${i},'name',this.value)">
          <div style="margin-top:2px">${badge}${r.refCode?` <span style="font-size:9px;font-family:monospace;color:var(--muted)">${E(r.refCode)}</span>`:""}</div>
        </div>
        <input class="form-input" style="font-size:12px;padding:5px 6px;text-align:center" placeholder="وحدة" value="${E(r.unit||"")}" oninput="window.priceAnalysis.rowInput('${kind}',${i},'unit',this.value)">
        <input class="form-input" style="font-size:12px;padding:5px 6px;font-family:monospace;direction:ltr;text-align:center" inputmode="decimal" placeholder="كمية" value="${r.qty!=null?E(r.qty):""}" oninput="window.priceAnalysis.rowInput('${kind}',${i},'qty',this.value)" title="الكمية">
        <input class="form-input" style="font-size:12px;padding:5px 6px;font-family:monospace;direction:ltr;text-align:center" inputmode="decimal" placeholder="${priceLbl}" value="${r[priceField]!=null?E(r[priceField]):""}" oninput="window.priceAnalysis.rowInput('${kind}',${i},'${priceField}',this.value)" title="${priceLbl}">
        <div id="pa-line-${kind}-${i}" style="font-size:12px;font-family:monospace;text-align:center;font-weight:700;color:var(--accent)">${fmt(line)}</div>
        <button class="btn btn-ghost btn-sm" style="color:var(--danger);padding:2px 6px" onclick="window.priceAnalysis.removeRow('${kind}',${i})" title="حذف">🗑</button>
      </div>`;
    }).join("");
  }

  function renderRows(kind){
    const el = document.getElementById(kind==="mat"?"pa-mat-rows":"pa-labor-rows");
    if(el) el.innerHTML = rowsHtml(kind);
  }

  function renderSummary(){
    const el = document.getElementById("pa-summary");
    if(!el || !_draft) return;
    const waste = document.getElementById("pa-waste")?.value||"0";
    const over  = document.getElementById("pa-overhead")?.value||"0";
    const c = compute(_draft, waste, over);
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;padding:2px 0"><span>تكلفة الخامات ${num(waste)>0?`<small style="color:var(--muted)">(+هدر ${E(waste)}%)</small>`:""}</span><b style="font-family:monospace">${fmt(c.matCost)}</b></div>
      <div style="display:flex;justify-content:space-between;padding:2px 0"><span>تكلفة العمالة</span><b style="font-family:monospace">${fmt(c.laborCost)}</b></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;border-top:1px dashed var(--border);margin-top:4px"><span>التكلفة المباشرة</span><b style="font-family:monospace">${fmt(c.directCost)}</b></div>
      ${num(over)>0?`<div style="display:flex;justify-content:space-between;padding:2px 0;color:var(--muted);font-size:12px"><span>+ مصاريف إدارية ${E(over)}%</span><span style="font-family:monospace">${fmt(c.unitPrice-c.directCost)}</span></div>`:""}
      <div style="display:flex;justify-content:space-between;padding:6px 0 0;border-top:2px solid var(--accent);margin-top:6px;font-size:15px"><b>سعر الوحدة</b><b style="font-family:monospace;color:var(--accent)">${fmt(c.unitPrice)} ر.س</b></div>`;
  }

  function refreshLine(kind, i){
    const arr = _draft && _draft[kind]; if(!arr||!arr[i]) return;
    const priceField = kind==="mat"?"price":"rate";
    const line = num(arr[i].qty)*num(arr[i][priceField]);
    const cell = document.getElementById(`pa-line-${kind}-${i}`);
    if(cell) cell.textContent = fmt(line);
  }

  // ══ محرّرات الصفوف (تحدّث المسودة بلا إعادة رسم كامل للحفاظ على التركيز) ══
  function rowInput(kind, i, field, value){
    if(!_draft || !_draft[kind] || !_draft[kind][i]) return;
    _draft[kind][i][field] = value;
    // كتابة يدوية على اسم/سعر صف مسحوب من الكتالوج ⇒ يصبح يدوياً (كسر الرابط)
    if((field==="price"||field==="rate"||field==="name") && _draft[kind][i].source==="catalog"){
      // لا نكسر الرابط لمجرد تعديل الكمية؛ فقط السعر أو الاسم
      // (نُبقي refCode للعرض لكن نُعلّمه معدّلاً)
    }
    refreshLine(kind, i);
    renderSummary();
  }
  function addManualRow(kind){
    if(!_draft) return;
    if(kind==="mat") _draft.materials.push({source:"manual",name:"",unit:"",qty:1,price:0});
    else _draft.labor.push({source:"manual",name:"",unit:"",qty:1,rate:0});
    renderRows(kind); renderSummary();
  }
  function removeRow(kind, i){
    if(!_draft) return;
    const arr = kind==="mat"?_draft.materials:_draft.labor;
    if(i>=0 && i<arr.length){ arr.splice(i,1); renderRows(kind); renderSummary(); }
  }
  function markupInput(){ renderSummary(); }

  // ══ المنتقي المشترك ══
  function openPicker(mode){
    _pickerMode = mode;
    const titleEl = document.getElementById("pa-picker-title");
    if(titleEl) titleEl.textContent = mode==="mat" ? "📦 اختر خامة من الكتالوج"
      : mode==="labor" ? "🛠️ اختر مصنعية من الكتالوج" : "🧮 اختر بنداً محلَّلاً";
    const s = document.getElementById("pa-picker-search"); if(s) s.value="";
    renderPicker();
    const ov = document.getElementById("modal-pa-picker");
    if(ov) ov.style.display="flex";
    try{ if(s) s.focus(); }catch(e){}
  }
  function pickForRFQ(cb){
    _rfqCb = (typeof cb==="function") ? cb : null;
    if(!_items.length){ T("لا توجد بنود محلَّلة بعد — أنشئ تحليلاً أولاً","warn"); return; }
    openPicker("rfq");
  }
  function pickerSearch(){ renderPicker(); }
  function renderPicker(){
    const list = document.getElementById("pa-picker-list");
    if(!list) return;
    const q = (document.getElementById("pa-picker-search")?.value||"").trim().toLowerCase();
    let src = _pickerMode==="mat" ? matSource()
            : _pickerMode==="labor" ? laborSource() : _items;
    const priceField = _pickerMode==="mat" ? "unitPrice" : _pickerMode==="labor" ? "rate" : "unitPrice";
    let arr = src.filter(function(it){
      if(!q) return true;
      return (it.name||"").toLowerCase().includes(q) || (it.code||"").toLowerCase().includes(q);
    }).slice(0,60);
    if(!arr.length){
      list.innerHTML = `<div style="text-align:center;padding:30px;color:var(--muted)">${src.length===0?"لا توجد بنود في المصدر":"لا توجد نتائج مطابقة"}</div>`;
      return;
    }
    list.innerHTML = arr.map(function(it){
      const p = it[priceField];
      return `
      <div class="catalog-ac-item" style="display:flex;align-items:center;justify-content:space-between;padding:9px 14px;cursor:pointer;border-bottom:1px solid var(--border);font-size:12px" onmousedown="window.priceAnalysis.pickerSelect('${E(it.id)}')">
        <div style="min-width:0">
          ${it.code?`<span style="font-family:monospace;font-size:10px;background:var(--surface2);border:1px solid var(--border);border-radius:3px;padding:1px 5px;margin-left:6px">${E(it.code)}</span>`:""}
          <span style="font-weight:600">${E(it.name||"")}</span>
          <span style="color:var(--muted)"> • ${E(it.unit||"")}</span>
        </div>
        ${p!=null?`<span style="color:var(--accent);font-weight:700;font-size:11px;white-space:nowrap">${fmt(p)} ر.س</span>`:""}
      </div>`;
    }).join("");
  }
  function pickerSelect(id){
    const ov = document.getElementById("modal-pa-picker");
    if(_pickerMode==="rfq"){
      const a = _items.find(x=>x.id===id);
      if(ov) ov.style.display="none";
      if(a && _rfqCb){ try{ _rfqCb(a); }catch(e){ console.warn("rfq feed cb error",e); } }
      return;
    }
    const src = _pickerMode==="mat" ? matSource() : laborSource();
    const it = src.find(x=>x.id===id);
    if(!it){ if(ov) ov.style.display="none"; return; }
    if(_pickerMode==="mat"){
      _draft.materials.push({source:"catalog",refId:it.id,refCode:it.code||"",name:it.name||"",unit:it.unit||"",qty:1,price:(it.unitPrice!=null?it.unitPrice:0)});
      renderRows("mat");
    } else {
      _draft.labor.push({source:"catalog",refId:it.id,refCode:it.code||"",name:it.name||"",unit:it.unit||"",qty:1,rate:(it.rate!=null?it.rate:0)});
      renderRows("labor");
    }
    renderSummary();
    if(ov) ov.style.display="none";
  }

  // ══ تحديث الأسعار من الكتالوج للصفوف المسحوبة ══
  function refreshPrices(){
    if(!_draft) return;
    const mats = matSource(), labs = laborSource();
    let n=0;
    (_draft.materials||[]).forEach(function(r){
      if(r.source!=="catalog") return;
      const it = mats.find(x=>x.id===r.refId) || mats.find(x=>x.code&&r.refCode&&x.code===r.refCode);
      if(it && it.unitPrice!=null && r.price!==it.unitPrice){ r.price=it.unitPrice; n++; }
    });
    (_draft.labor||[]).forEach(function(r){
      if(r.source!=="catalog") return;
      const it = labs.find(x=>x.id===r.refId) || labs.find(x=>x.code&&r.refCode&&x.code===r.refCode);
      if(it && it.rate!=null && r.rate!==it.rate){ r.rate=it.rate; n++; }
    });
    renderRows("mat"); renderRows("labor"); renderSummary();
    T(n>0?("🔄 حُدِّث "+n+" سعر من الكتالوج"):"الأسعار محدَّثة بالفعل", n>0?"success":"info");
  }

  // ══ فتح المحرّر ══
  function openEditor(id){
    if(!canManage()){ T("⚠ صلاحية المسؤول أو مسؤول المشتريات فقط","warn"); return; }
    buildDOM();
    populateCategorySelects();
    const titleEl = document.getElementById("pa-modal-title");
    document.getElementById("pa-edit-id").value = id||"";
    document.getElementById("pa-code").value="";
    document.getElementById("pa-name").value="";
    { const _cs=document.getElementById("pa-category-select"); if(_cs) _cs.value=""; const _cc=document.getElementById("pa-category-custom"); if(_cc){ _cc.value=""; _cc.style.display="none"; } }
    document.getElementById("pa-unit").value="";
    document.getElementById("pa-waste").value="0";
    document.getElementById("pa-overhead").value="0";
    document.getElementById("pa-notes").value="";
    const lblEl = document.getElementById("pa-code-lbl"); if(lblEl) lblEl.textContent="";

    if(id){
      const it = _items.find(function(c){ return c.id===id; });
      if(!it){ T("⚠ البند غير موجود","warn"); return; }
      if(titleEl) titleEl.textContent="✏️ تعديل تحليل بند";
      document.getElementById("pa-code").value = it.code||"";
      document.getElementById("pa-name").value = it.name||"";
      { const _cs=document.getElementById("pa-category-select"); if(_cs) _cs.value = it.category||""; }
      document.getElementById("pa-unit").value = it.unit||"";
      document.getElementById("pa-waste").value = it.wastePct!=null?it.wastePct:0;
      document.getElementById("pa-overhead").value = it.overheadPct!=null?it.overheadPct:0;
      document.getElementById("pa-notes").value = it.notes||"";
      _draft = {
        materials: (it.materials||[]).map(m=>Object.assign({},m)),
        labor: (it.labor||[]).map(l=>Object.assign({},l))
      };
    } else {
      if(titleEl) titleEl.textContent="➕ تحليل بند جديد";
      document.getElementById("pa-code").value = genCode();
      if(lblEl) lblEl.textContent="(مُولَّد تلقائياً — قابل للتعديل)";
      _draft = { materials:[], labor:[] };
    }
    renderRows("mat"); renderRows("labor"); renderSummary();
    openModal("modal-price-analysis");
  }

  // ══ الحفظ ══
  async function save(){
    if(!canManage()){ T("⚠ صلاحية غير كافية","warn"); return; }
    const id       = document.getElementById("pa-edit-id").value.trim();
    const code     = document.getElementById("pa-code").value.trim();
    const name     = document.getElementById("pa-name").value.trim();
    const category = readCategory();
    const unit     = document.getElementById("pa-unit").value.trim();
    const wastePct = num(document.getElementById("pa-waste").value);
    const overheadPct = num(document.getElementById("pa-overhead").value);
    const notes    = document.getElementById("pa-notes").value.trim();

    if(!name){ T("⚠ أدخل اسم البند","warn"); return; }
    if(!category){ T("⚠ اختر أو اكتب التصنيف","warn"); return; }
    if(!unit){ T("⚠ اختر وحدة البند","warn"); return; }

    // تنقية الصفوف: خامة تحتاج اسماً + كمية وسعر ≥ 0
    const materials = (_draft.materials||[]).map(function(m){
      return { source:m.source==="catalog"?"catalog":"manual", refId:m.refId||"", refCode:m.refCode||"",
               name:(m.name||"").trim(), unit:(m.unit||"").trim(), qty:num(m.qty), price:num(m.price) };
    }).filter(function(m){ return m.name && m.qty>=0 && m.price>=0; });
    const labor = (_draft.labor||[]).map(function(l){
      return { source:l.source==="catalog"?"catalog":"manual", refId:l.refId||"", refCode:l.refCode||"",
               name:(l.name||"").trim(), unit:(l.unit||"").trim(), qty:num(l.qty), rate:num(l.rate) };
    }).filter(function(l){ return l.name && l.qty>=0 && l.rate>=0; });

    if(!materials.length && !labor.length){ T("⚠ أضف مكوّناً واحداً على الأقل (خامة أو مصنعية)","warn"); return; }

    // تكرار الكود
    if(code){
      const dup = _items.find(function(c){ return c.code && c.code.toLowerCase()===code.toLowerCase() && c.id!==id; });
      if(dup){ T('⚠ الكود "'+E(code)+'" موجود مسبقاً','warn'); return; }
    }

    const c = compute({materials,labor}, wastePct, overheadPct);
    const data = {
      code:code, name:name, category:category, unit:unit,
      materials:materials, labor:labor,
      wastePct:wastePct, overheadPct:overheadPct, notes:notes,
      matCost: +c.matCost.toFixed(2), laborCost: +c.laborCost.toFixed(2),
      directCost: +c.directCost.toFixed(2), unitPrice: +c.unitPrice.toFixed(2),
      updatedAt: stamp(), updatedBy: userLabel()
    };

    try{
      if(id){
        await db.collection(COLLECTION()).doc(id).update(data);
        T("✅ تم تحديث التحليل","success");
      } else {
        data.createdAt = stamp(); data.createdBy = userLabel();
        await db.collection(COLLECTION()).add(data);
        T("✅ تم حفظ التحليل","success");
      }
      closeModal("modal-price-analysis");
    } catch(e){
      console.error("price analysis save error", e);
      T("⚠ خطأ في الحفظ — تحقق من الاتصال","warn");
    }
  }

  // ══ حذف ══
  async function del(id, name){
    if(!canManage()){ T("⚠ صلاحية غير كافية","warn"); return; }
    let ok=false;
    try{
      ok = await showConfirm({title:"حذف تحليل بند", msg:'هل تريد حذف تحليل "'+name+'"؟', icon:"🗑", okText:"حذف", okClass:"btn-danger"});
    }catch(e){ ok=false; }
    if(!ok) return;
    try{
      await db.collection(COLLECTION()).doc(id).delete();
      T("🗑 تم حذف التحليل","success");
    } catch(e){
      console.error("price analysis delete error", e);
      T("⚠ خطأ في الحذف","warn");
    }
  }

  // ══ تصدير Excel ══
  function exportExcel(){
    if(isViewerMode()){ T("🔒 وضع العرض فقط — الأسعار محجوبة","warn"); return; }
    if(!_items.length){ T("لا توجد بنود للتصدير","warn"); return; }
    const rows = _items.map(function(it,i){
      return {
        "#": i+1, "الكود": it.code||"", "اسم البند": it.name||"", "التصنيف": it.category||"",
        "الوحدة": it.unit||"",
        "عدد الخامات": (it.materials||[]).length, "عدد المصنعيات": (it.labor||[]).length,
        "تكلفة الخامات": it.matCost==null?0:it.matCost,
        "تكلفة العمالة": it.laborCost==null?0:it.laborCost,
        "هدر %": it.wastePct==null?0:it.wastePct,
        "مصاريف إدارية %": it.overheadPct==null?0:it.overheadPct,
        "التكلفة المباشرة": it.directCost==null?0:it.directCost,
        "سعر الوحدة (ر.س)": it.unitPrice==null?0:it.unitPrice,
        "ملاحظات": it.notes||""
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تحليل الأسعار");
    XLSX.writeFile(wb, "price_analysis_"+new Date().toISOString().slice(0,10)+".xlsx");
  }

  // ══ التعريض ══
  window.priceAnalysis = {
    startSync: startSync,
    render: render,
    resetFilters: resetFilters,
    onCategoryChange: onCategoryChange,
    openEditor: openEditor,
    save: save,
    del: del,
    rowInput: rowInput,
    addManualRow: addManualRow,
    removeRow: removeRow,
    markupInput: markupInput,
    openPicker: openPicker,
    pickerSearch: pickerSearch,
    pickerSelect: pickerSelect,
    refreshPrices: refreshPrices,
    exportExcel: exportExcel,
    pickForRFQ: pickForRFQ,
    getItems: function(){ return _items.slice(); }
  };
})();
