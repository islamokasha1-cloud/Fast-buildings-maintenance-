/* ════════════════════════════════════════════════════════════════════
   كتالوج المصنعيات — Labor / Workmanship Catalog  (ملف خارجي IIFE)
   عقد صارم: يعرّض window.laborCatalog فقط | يكتب على مجموعة Firestore
   خاصة به (global_labor_catalog) | يقرأ حالة النواة بالاسم المجرد فقط.
   يعتمد على دوال النواة: toast, esc, openModal, closeModal, showConfirm,
   pgSlice, pgBar, pgReset, canManageCatalog, isViewer  والمتغيرات:
   db, currentUser, IS_DEV, firebase, XLSX.
   ════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  // ══ إعدادات ══
  function COLLECTION(){
    return (typeof IS_DEV!=='undefined' && IS_DEV)
      ? "global_labor_catalog_dev" : "global_labor_catalog";
  }
  const CODE_PREFIX = "LAB";
  const PG_KEY = "laborCatalogTable";

  // التصنيفات الافتراضية — قابلة للتعديل: تُضاف تصنيفات جديدة بمجرد كتابتها
  const DEFAULT_CATEGORIES = [
    "أعمال ترابية","مباني","لياسة","بلاط وأرضيات","دهانات","عزل",
    "سباكة","كهرباء","أعمال حدادة","أعمال نجارة","أعمال جبس","تكييف","متفرقة"
  ];
  // وحدات المصنعيات (تختلف عن وحدات الخامات — تشمل المساحات والأطوال)
  const LABOR_UNITS = ["م2","م3","م.ط","عدد","ساعة","يومية","مقطوعية","طن","كجم","لتر","أخرى"];

  // ══ حالة داخلية ══
  let _items = [];
  let _unsub = null;
  let _loaded = false;
  let _domBuilt = false;

  // ══ جسور آمنة لدوال النواة ══
  function T(msg,type){ try{ if(typeof toast==='function') toast(msg,type); }catch(e){} }
  function E(s){ try{ return (typeof esc==='function') ? esc(s) : String(s==null?'':s); }catch(e){ return String(s==null?'':s); } }
  // JQ: تهريب قيمة داخل سلسلة JS بعلامة مفردة داخل سمة onclick — esc وحده لا يكفي
  // (يحوّل ' إلى &#39; فيفكّها مُحلِّل HTML قبل تصريف JS، فتُكسَر السلسلة). يستعمل _jsq النواة.
  function JQ(s){ try{ return (typeof window!=='undefined' && typeof window._jsq==='function') ? window._jsq(s) : E(s); }catch(e){ return E(s); } }
  function ICON(name){ try{ return (typeof _svgIcon==='function') ? _svgIcon(name) : ''; }catch(e){ return ''; } }
  // تحويل نصّ إلى رقم يقبل الفاصلة العربية العشرية دون إفساد فاصلة الآلاف: القديم
  // replace(/,/g,".") كان يحوّل «1,250.00» إلى «1.250.00»→parseFloat=1.25 (بخس 1000×).
  function num(v){
    if(typeof v==='number') return isFinite(v)?v:0;
    var s=String(v==null?"":v).trim();
    if(!s) return 0;
    s=s.replace(/[٠-٩]/g,function(d){return String(d.charCodeAt(0)-0x0660);})
       .replace(/[۰-۹]/g,function(d){return String(d.charCodeAt(0)-0x06F0);})
       .replace(/[\s ٬']/g,"");
    var hasDot=s.indexOf(".")>=0, hasComma=s.indexOf(",")>=0;
    if(hasDot&&hasComma){
      if(s.lastIndexOf(",")>s.lastIndexOf(".")) s=s.replace(/\./g,"").replace(/,/g,".");
      else s=s.replace(/,/g,"");
    } else if(hasComma){
      var pc=s.split(",");
      if(pc.length===2 && pc[1].length>0 && pc[1].length<3) s=pc[0]+"."+pc[1];
      else s=s.replace(/,/g,"");
    } else if(hasDot){
      var pd=s.split(".");
      if(pd.length>2) s=pd.slice(0,-1).join("")+"."+pd[pd.length-1];
    }
    var n=parseFloat(s);
    return isFinite(n)?n:0;
  }
  /* ══ أسعارٌ متعدّدةٌ للبند الواحد حسب درجة الجودة ══
     البندُ الواحد (لياسةٌ · بلاطٌ · دهان) يُنفَّذ بثلاث درجاتٍ ولكلِّ درجةٍ أجرتُها،
     فالسعرُ الواحد كان يُجبر المالكَ على تكرار البند ثلاثَ مرّاتٍ بأسماءٍ مصطنعة.
     البنيةُ `grades = {low,mid,high}` تحمل ما أُدخِل منها و`null` لما تُرِك فارغاً.
     و`rate` **يبقى موجوداً** سعراً أساسياً مشتقّاً: خارجَ هذه الوحدة (تحليلُ الأسعار ·
     الفلاتر · الإحصاءات) يقرأ `rate` وحدَه، فإسقاطُه كان يُصفّر كلَّ سعرٍ مسحوبٍ إلى
     تحليل. قاعدةُ الاشتقاق: الأساسُ = متوسطُ الجودة إن وُجد، وإلا فالمنخفضُ ثم العالي
     — لا متوسطٌ حسابيٌّ مخترَعٌ لا يساوي أجرةَ أحد.
     وبندٌ قديمٌ بلا `grades` يبقى **سعراً واحداً بلا درجة**: لا نصفُه بدرجةٍ لم يخترها
     أحدٌ، ويُعرض كما كان حتى يفتحه المالكُ ويصنّفه. */
  const GRADE_KEYS   = ["low","mid","high"];
  const GRADE_LABELS = { low:"منخفض الجودة", mid:"متوسط الجودة", high:"عالي الجودة" };
  const GRADE_SHORT  = { low:"منخفض", mid:"متوسط", high:"عالي" };
  function gradeLabel(k){ return GRADE_LABELS[k] || ""; }

  // خريطةُ الدرجات المُدخَلة وحدَها — نقيّة (للاختبار بلا متصفّح)
  function gradeMap(it){
    const g = (it && it.grades && typeof it.grades==='object') ? it.grades : null;
    const out = { low:null, mid:null, high:null };
    if(!g) return out;
    GRADE_KEYS.forEach(function(k){
      const v = g[k];
      if(v==null || v==="") return;
      const n = Number(v);
      if(isFinite(n)) out[k] = n;
    });
    return out;
  }
  function hasGrades(it){ const m=gradeMap(it); return GRADE_KEYS.some(function(k){ return m[k]!=null; }); }

  // السعرُ الأساسيُّ المشتقّ — نقيّة
  const BASE_PRIORITY = ["mid","low","high"];   // متوسطٌ أوّلاً، فإن غاب فالمنخفضُ ثم العالي
  function baseFrom(m, legacy){
    m = m || {};
    for(var i=0;i<BASE_PRIORITY.length;i++){
      var v = m[BASE_PRIORITY[i]];
      if(v!=null && isFinite(Number(v))) return Number(v);
    }
    return (legacy!=null && isFinite(Number(legacy))) ? Number(legacy) : null;
  }

  // سعرُ درجةٍ بعينها؛ ودرجةٌ فارغةٌ ⇒ السعرُ الأساسيّ — نقيّة
  function priceOf(it, gradeKey){
    if(!it) return null;
    if(gradeKey && GRADE_KEYS.indexOf(gradeKey)>=0){
      const v = gradeMap(it)[gradeKey];
      return v!=null ? v : null;
    }
    return (it.rate!=null && isFinite(Number(it.rate))) ? Number(it.rate) : null;
  }

  // كلُّ أسعار البند: مصنَّفةً إن وُجدت درجات، وسعراً واحداً بلا درجةٍ إن لم توجد — نقيّة
  function priceList(it){
    const m = gradeMap(it);
    const out = [];
    GRADE_KEYS.forEach(function(k){
      if(m[k]!=null) out.push({ key:k, label:GRADE_LABELS[k], short:GRADE_SHORT[k], value:m[k] });
    });
    if(out.length) return out;
    const r = priceOf(it, "");
    return r!=null ? [{ key:"", label:"", short:"", value:r }] : [];
  }

  // منخفضٌ ≤ متوسطٌ ≤ عالٍ على المُدخَل منها وحدَه — نقيّة (تحذيرٌ ناعمٌ لا منع)
  function gradeOrderOk(m){
    const seq = GRADE_KEYS.map(function(k){ return (m||{})[k]; }).filter(function(v){ return v!=null; });
    for(var i=1;i<seq.length;i++){ if(Number(seq[i]) < Number(seq[i-1])) return false; }
    return true;
  }

  function money(v){ return Number(v).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}); }

  function canManage(){ try{ return (typeof canManageCatalog==='function') ? canManageCatalog() : false; }catch(e){ return false; } }
  function isViewerMode(){ try{ return (typeof isViewer==='function') ? isViewer() : false; }catch(e){ return false; } }
  function userLabel(){ try{ return (currentUser && (currentUser.name||currentUser.user)) || "—"; }catch(e){ return "—"; } }
  function stamp(){ return firebase.firestore.FieldValue.serverTimestamp(); }

  // ══ توليد الكود التسلسلي LAB-### ══
  // genCode معاينةٌ محليّة فقط. التخصيص النهائي ذرّيّ عند الحفظ (allocCode) — فلا يتكرّر
  // الكود عند إضافة متزامنة من مستخدمين (كان كلاهما يحسب LAB-### نفسه من لقطته المحلية).
  function _localCodeMax(){
    return _items
      .filter(c => c.code && c.code.indexOf(CODE_PREFIX + "-") === 0)
      .reduce((mx,c)=>{ const n = parseInt(c.code.slice(CODE_PREFIX.length+1),10); return isNaN(n)?mx:Math.max(mx,n); }, 0);
  }
  function _nextCodeNum(serverCounter, localMax){ return Math.max(serverCounter||0, localMax||0) + 1; } // نقيّة — للاختبار
  function _codeFromNum(n){ return CODE_PREFIX + "-" + String(n).padStart(3,"0"); }
  function genCode(){ return _codeFromNum(_localCodeMax()+1); }
  function META_COUNTER(){ return COLLECTION() + "__counter"; }
  async function allocCode(){
    const localMax = _localCodeMax();
    if(typeof db==='undefined' || !db) return _codeFromNum(localMax+1);
    const ref = db.collection("meta").doc(META_COUNTER());
    try{
      const next = await db.runTransaction(async tx=>{
        const doc = await tx.get(ref);
        const svr = doc.exists ? (doc.data().counter||0) : 0;
        const n = _nextCodeNum(svr, localMax);
        tx.set(ref, { counter:n }, { merge:true });
        return n;
      });
      return _codeFromNum(next);
    }catch(e){
      console.warn("allocCode transaction failed — fallback:", e);
      return _codeFromNum(localMax+1) + "-" + Date.now().toString(36).slice(-3).toUpperCase();
    }
  }

  // ══ قائمة التصنيفات الحالية (افتراضية ∪ الموجودة فعلاً) ══
  function currentCategories(){
    const set = new Set(DEFAULT_CATEGORIES);
    _items.forEach(it=>{ if(it.category && it.category.trim()) set.add(it.category.trim()); });
    return Array.from(set);
  }

  // ══ بناء DOM مرة واحدة: محتوى الصفحة + المودال ══
  function buildDOM(){
    if(_domBuilt) return;
    const page = document.getElementById("page-labor-catalog");
    if(!page) return;

    page.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="card-header">
        <div class="card-title"><span class="ct-ico">${ICON("hammer")}</span> كتالوج المصنعيات وأسعار البنود</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" data-viewer-hide onclick="window.laborCatalog.exportExcel()" title="تصدير Excel">${ICON("download")} تصدير Excel</button>
          <button class="btn btn-ghost btn-sm" onclick="window.laborCatalog.downloadTemplate()" title="تحميل قالب الاستيراد">${ICON("clipboardList")} قالب الاستيراد</button>
          <button class="btn btn-ghost btn-sm" onclick="window.laborCatalog.triggerImport()" title="استيراد من Excel">${ICON("folderOpen")} استيراد Excel</button>
          <input type="file" id="lab-import-file" accept=".xlsx,.xls" style="display:none" onchange="window.laborCatalog.importExcel(this)">
          <button class="btn btn-primary btn-sm" onclick="window.laborCatalog.openItemModal()">${ICON("plus")} إضافة مصنعية</button>
        </div>
      </div>
      <div class="card-body">
        <div style="background:color-mix(in srgb,var(--accent) 8%,var(--surface));border:1px solid color-mix(in srgb,var(--accent) 26%,var(--border));border-radius:8px;padding:10px 14px;font-size:12px;color:var(--accent);margin-bottom:14px">
          ℹ️ مكتبة أسعار مرجعية عامة للمصنعيات (اليد العاملة) — مشتركة بين جميع المشاريع. سعر البند يمثّل أجرة التنفيذ للوحدة المنجَزة، ويُستخدم لاحقاً كمصدر لمكوّن العمالة في تحليل الأسعار.
        </div>
        <div class="ast-stats" id="lab-stat-grid" style="margin-bottom:14px"></div>
        <div class="cat-toolbar">
          <input class="form-input cat-search" id="lab-search-input" placeholder="🔍 بحث بالاسم أو الكود..." oninput="pgReset('${PG_KEY}');window.laborCatalog.render()">
          <select class="form-select" id="lab-filter-cat" onchange="pgReset('${PG_KEY}');window.laborCatalog.render()" style="min-width:150px">
            <option value="">كل التصنيفات</option>
          </select>
          <select class="form-select" id="lab-filter-unit" onchange="pgReset('${PG_KEY}');window.laborCatalog.render()" style="min-width:110px">
            <option value="">كل الوحدات</option>
            ${LABOR_UNITS.map(u=>`<option>${u}</option>`).join("")}
          </select>
          <select class="form-select" id="lab-filter-grade" onchange="pgReset('${PG_KEY}');window.laborCatalog.render()" style="min-width:130px" title="يُقصر فلترَ السعر على درجةٍ بعينها">
            <option value="">كل درجات الجودة</option>
            ${GRADE_KEYS.map(k=>`<option value="${k}">${GRADE_LABELS[k]}</option>`).join("")}
          </select>
          <input class="form-input" id="lab-filter-min" type="number" min="0" step="0.01" placeholder="سعر من" oninput="pgReset('${PG_KEY}');window.laborCatalog.render()" style="width:90px;font-family:monospace;direction:ltr">
          <input class="form-input" id="lab-filter-max" type="number" min="0" step="0.01" placeholder="سعر إلى" oninput="pgReset('${PG_KEY}');window.laborCatalog.render()" style="width:90px;font-family:monospace;direction:ltr">
          <button class="btn btn-ghost btn-sm" onclick="window.laborCatalog.resetFilters()" title="مسح الفلاتر" style="font-size:12px">✖ مسح</button>
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
                <th style="text-align:center">أسعار المصنعية (ر.س)</th>
                <th>نطاق العمل</th>
                <th style="width:90px;text-align:center">إجراءات</th>
              </tr>
            </thead>
            <tbody id="lab-tbody"></tbody>
          </table>
          <div id="lab-empty" class="cat-empty" style="display:none">📭 لا توجد مصنعيات — أضف بنداً جديداً من الزر أعلاه</div>
        </div>
        <div id="lab-count" style="text-align:left;font-size:11px;color:var(--muted);padding:6px 4px"></div>
        <div id="lab-pager" style="padding:0 4px"></div>
      </div>
    </div>`;

    // ── المودال (يُحقن في body مرة واحدة) ──
    if(!document.getElementById("modal-labor-item")){
      const wrap = document.createElement("div");
      wrap.innerHTML = `
      <div class="modal-overlay" id="modal-labor-item" style="display:none">
        <div class="modal" style="max-width:560px;width:100%">
          <div class="modal-header">
            <div class="modal-title" id="lab-modal-title">➕ إضافة مصنعية جديدة</div>
            <button class="modal-close" onclick="closeModal('modal-labor-item')">✕</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="lab-edit-id">
            <div class="form-row" style="margin-bottom:10px">
              <div class="form-group">
                <label class="form-label">التصنيف <span>*</span></label>
                <select class="form-select" id="lab-category-select" onchange="window.laborCatalog.onCategoryChange()">
                  <option value="">اختر...</option>
                </select>
                <input class="form-input" id="lab-category-custom" placeholder="اكتب التصنيف الجديد..." style="display:none;margin-top:6px">
              </div>
              <div class="form-group">
                <label class="form-label">الكود <span id="lab-code-lbl" style="color:var(--accent);font-size:10px;font-weight:600"></span></label>
                <input class="form-input" id="lab-code" placeholder="يُولَّد تلقائياً" style="font-family:monospace;direction:ltr;text-align:left">
              </div>
            </div>
            <div class="form-group" style="margin-bottom:10px">
              <label class="form-label">اسم البند / المصنعية <span>*</span></label>
              <input class="form-input" id="lab-name" placeholder="مثال: لياسة أسمنتية للجدران...">
            </div>
            <div class="form-row" style="margin-bottom:10px">
              <div class="form-group">
                <label class="form-label">الوحدة <span>*</span></label>
                <select class="form-select" id="lab-unit">
                  <option value="">اختر...</option>
                  ${LABOR_UNITS.map(u=>`<option>${u}</option>`).join("")}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">السعر الأساسي <span style="color:var(--muted);font-size:10px;font-weight:600">(الذي يُسحب إلى تحليل الأسعار)</span></label>
                <div id="lab-base-preview" style="font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--accent);border:1px dashed var(--border);border-radius:8px;padding:9px 11px;font-size:13px">—</div>
              </div>
            </div>
            <div class="form-group" style="margin-bottom:10px">
              <label class="form-label">أسعار المصنعية للوحدة (ر.س) حسب درجة الجودة <span>*</span>
                <span style="color:var(--accent);font-size:10px;font-weight:600">— سعرٌ واحدٌ على الأقل، واترك ما لا يلزم فارغاً</span>
              </label>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px">
                ${GRADE_KEYS.map(k=>`
                <div>
                  <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px">${GRADE_LABELS[k]}</div>
                  <input class="form-input" id="lab-rate-${k}" type="text" inputmode="decimal" placeholder="0.00"
                         oninput="window.laborCatalog.onRateInput()"
                         style="font-family:monospace;direction:ltr;text-align:left">
                </div>`).join("")}
              </div>
            </div>
            <div class="form-group" style="margin-bottom:6px">
              <label class="form-label">نطاق العمل — ما يشمله السعر وما لا يشمله <span style="color:var(--accent);font-size:10px">(موصى به بشدة)</span></label>
              <textarea class="form-input" id="lab-scope" rows="3" placeholder="مثال: يشمل الطرطشة والبطانة والضهارة والمعالجة — لا يشمل السقالات ولا الخامات."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" onclick="closeModal('modal-labor-item')">إلغاء</button>
            <button class="btn btn-primary" onclick="window.laborCatalog.save()">💾 حفظ</button>
          </div>
        </div>
      </div>`;
      document.body.appendChild(wrap.firstElementChild);
    }

    // تهيئة حالة الترقيم للمفتاح الجديد — يمنع cur=undefined ⇒ slice(NaN) في pgSlice أول مرة
    try{ if(typeof pgReset==='function') pgReset(PG_KEY); }catch(e){}

    _domBuilt = true;
  }

  // ══ تعبئة قوائم التصنيفات (select) — تعمل على WebKit بلا مشاكل datalist ══
  function populateCategorySelects(){
    const cats = currentCategories();
    const optsHtml = cats.map(c=>`<option value="${E(c)}">${E(c)}</option>`).join("");
    // مودال: قائمة + خيار "تصنيف جديد"
    const sel = document.getElementById("lab-category-select");
    if(sel){
      const cur = sel.value;
      sel.innerHTML = '<option value="">اختر...</option>' + optsHtml + '<option value="__new__">＋ تصنيف جديد…</option>';
      if(cur && cats.indexOf(cur)!==-1) sel.value = cur;
    }
    // فلتر: قائمة بدون خيار "جديد"
    const fsel = document.getElementById("lab-filter-cat");
    if(fsel){
      const curF = fsel.value;
      fsel.innerHTML = '<option value="">كل التصنيفات</option>' + optsHtml;
      if(curF && cats.indexOf(curF)!==-1) fsel.value = curF;
    }
  }

  // إظهار/إخفاء حقل التصنيف المخصّص عند اختيار "تصنيف جديد"
  function onCategoryChange(){
    const sel = document.getElementById("lab-category-select");
    const custom = document.getElementById("lab-category-custom");
    if(!sel || !custom) return;
    if(sel.value === "__new__"){
      custom.style.display = "";
      custom.value = "";
      try{ custom.focus(); }catch(e){}
    } else {
      custom.style.display = "none";
      custom.value = "";
    }
  }

  // القيمة الفعلية للتصنيف (من القائمة أو الحقل المخصّص)
  function readCategory(){
    const sel = document.getElementById("lab-category-select");
    const custom = document.getElementById("lab-category-custom");
    if(!sel) return "";
    if(sel.value === "__new__") return custom ? custom.value.trim() : "";
    return sel.value.trim();
  }

  // ══ مزامنة فورية (onSnapshot المصدر الوحيد) ══
  function startSync(){
    if(typeof db==='undefined' || !db) return;
    if(_unsub) return; // idempotent — المستمعون العامون يُركَّبون مرة واحدة (v18.9sz)
    _unsub = db.collection(COLLECTION())
      .orderBy("name","asc")
      .onSnapshot(function(snap){
        _items = snap.docs.map(function(d){ return Object.assign({id:d.id}, d.data()); });
        _loaded = true;
        const pg = document.getElementById("page-labor-catalog");
        if(pg && pg.classList.contains("active")) render();
      }, function(e){ console.warn("labor catalog sync error:", e); _loaded=true; });
  }

  // ══ عرض الجدول ══
  // ── شريط الإحصائيات الحيّ (v18.9lb) ──
  function paintStats(){
    const g = document.getElementById("lab-stat-grid");
    if(!g) return;
    const all = _items;
    const tot = all.length;
    const priced = all.filter(function(c){ return c.rate!=null && c.rate>0; });
    const avg = priced.length ? priced.reduce(function(s,c){ return s+c.rate; },0)/priced.length : 0;
    const cats = new Set(all.map(function(c){ return (c.category||"").trim(); }).filter(Boolean)).size;
    const noScope = all.filter(function(c){ return !((c.scopeNotes||"").trim()); }).length;
    const avgTxt = isViewerMode() ? ICON("lock")
      : avg.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0});
    g.innerHTML =
      '<div class="ast-stat total"><span class="si">'+ICON("hammer")+'</span><div><div class="sv">'+tot.toLocaleString("en-US")+'</div><div class="sl">إجمالي المصنعيات</div></div></div>'+
      '<div class="ast-stat"><span class="si">'+ICON("receipt")+'</span><div><div class="sv">'+avgTxt+'</div><div class="sl">متوسط السعر (ر.س)</div></div></div>'+
      '<div class="ast-stat"><span class="si">'+ICON("layers")+'</span><div><div class="sv">'+cats.toLocaleString("en-US")+'</div><div class="sl">عدد التصنيفات</div></div></div>'+
      '<div class="ast-stat '+(noScope?"warn":"good")+'"><span class="si">'+ICON(noScope?"alertTriangle":"checkCircle")+'</span><div><div class="sv">'+noScope.toLocaleString("en-US")+'</div><div class="sl">بنود بلا نطاق عمل</div></div></div>';
  }

  function render(){
    startSync(); // فُتحت الشاشة ولا مشترك (دورٌ لم يُحمَّل له مسبقاً)؟ رَكِّبه — الدالة idempotent
    buildDOM();
    populateCategorySelects();
    paintStats();
    const tbody = document.getElementById("lab-tbody");
    const emptyEl = document.getElementById("lab-empty");
    const countEl = document.getElementById("lab-count");
    if(!tbody) return;

    const q = (document.getElementById("lab-search-input")?.value||"").trim().toLowerCase();
    const catF = (document.getElementById("lab-filter-cat")?.value||"").trim().toLowerCase();
    const unitF = document.getElementById("lab-filter-unit")?.value||"";
    const gradeF = document.getElementById("lab-filter-grade")?.value||"";
    const minF = parseFloat(document.getElementById("lab-filter-min")?.value);
    const maxF = parseFloat(document.getElementById("lab-filter-max")?.value);

    let items = _items.filter(function(it){
      if(catF && !((it.category||"").toLowerCase().includes(catF))) return false;
      if(unitF && (it.unit||"") !== unitF) return false;
      /* فلترُ السعر يُطابَق على **سعرٍ واحدٍ بعينه**: بندٌ منخفضُه ٥ وعاليه ١٠٠ لا
         يُعدّ داخلَ المدى [١٠،٢٠] لأنّ طرفيه يقعان خارجَه — الشرطان معاً على القيمة
         نفسِها لا كلٌّ على قيمةٍ أخرى. ودرجةٌ مختارةٌ ⇒ سعرُها وحدَه، وبندٌ لا سعرَ
         له فيها يسقط. */
      if(gradeF || !isNaN(minF) || !isNaN(maxF)){
        const cand = gradeF
          ? (function(){ const v = priceOf(it, gradeF); return v==null ? [] : [v]; })()
          : priceList(it).map(function(pv){ return pv.value; });
        if(gradeF && !cand.length) return false;
        if(!isNaN(minF) || !isNaN(maxF)){
          const okp = cand.some(function(v){ return (isNaN(minF)||v>=minF) && (isNaN(maxF)||v<=maxF); });
          if(!okp) return false;
        }
      }
      if(!q) return true;
      return (it.name||"").toLowerCase().includes(q) ||
             (it.code||"").toLowerCase().includes(q) ||
             (it.category||"").toLowerCase().includes(q);
    });

    if(items.length===0){
      tbody.innerHTML="";
      if(emptyEl) emptyEl.style.display="";
      if(countEl) countEl.textContent="";
      const _p=document.getElementById("lab-pager"); if(_p) _p.innerHTML="";
      return;
    }
    if(emptyEl) emptyEl.style.display="none";
    if(countEl) countEl.textContent="إجمالي المصنعيات: "+items.length;

    const canEdit = canManage();
    const sl = pgSlice(PG_KEY, items);
    const pgItems = sl.items;
    const offset = (sl.page-1)*sl.size;
    const hideRate = isViewerMode();

    tbody.innerHTML = pgItems.map(function(it,i){
      const prices = priceList(it);
      const rateCell = hideRate ? '🔒'
        : (!prices.length ? "—"
          : prices.map(function(pv){
              return pv.key
                ? `<div style="display:flex;align-items:center;justify-content:center;gap:6px;line-height:1.7"><span style="font-family:inherit;font-size:10px;font-weight:700;color:var(--muted)">${pv.short}</span><span>${money(pv.value)}</span></div>`
                : money(pv.value)+" ر.س";
            }).join(""));
      const scope = (it.scopeNotes||"").trim();
      const scopeCell = scope
        ? `<span title="${E(scope)}" style="font-size:11px;color:var(--muted)">${E(scope.length>40?scope.slice(0,40)+"…":scope)}</span>`
        : '<span style="color:var(--danger);font-size:11px">⚠ غير محدد</span>';
      return `
      <tr>
        <td style="font-weight:700;color:var(--muted)">${offset+i+1}</td>
        <td>${it.code ? `<span class="cat-code-badge">${E(it.code)}</span>` : '<span style="color:var(--muted)">—</span>'}</td>
        <td style="font-weight:700">${E(it.name||"")}</td>
        <td><span style="font-size:11px;background:var(--surface2);border-radius:5px;padding:2px 7px">${E(it.category||"")}</span></td>
        <td style="text-align:center">${E(it.unit||"")}</td>
        <td style="text-align:center;font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--accent)">${rateCell}</td>
        <td>${scopeCell}</td>
        <td style="text-align:center">
          ${canEdit?`
            <button class="btn btn-ghost btn-sm" onclick="window.laborCatalog.openItemModal('${E(it.id)}')" style="padding:4px 9px;font-size:11px" title="تعديل">${ICON("edit")}</button>
            <button class="btn btn-delete btn-sm" onclick="window.laborCatalog.del('${JQ(it.id)}','${JQ(it.name||"")}')" style="padding:4px 9px;font-size:11px" title="حذف">${ICON("trash")}</button>
          `:"—"}
        </td>
      </tr>`;
    }).join("");

    const pagerEl=document.getElementById("lab-pager");
    if(pagerEl) pagerEl.innerHTML=pgBar(PG_KEY, sl.totalPages, sl.total);
  }

  function resetFilters(){
    ["lab-search-input","lab-filter-cat","lab-filter-unit","lab-filter-grade","lab-filter-min","lab-filter-max"]
      .forEach(function(idf){ const el=document.getElementById(idf); if(el) el.value=""; });
    pgReset(PG_KEY); render();
  }

  // ══ فتح مودال الإضافة/التعديل ══
  /* ══ v18.9ad — M24: تعارضُ التحرير المتزامن لا يُدهَس بصمت ══
     الكتالوج مجموعةٌ **مشتركة** بين المشاريع، ومحرّران على البند نفسه: الأخيرُ كان
     يكتب `update(data)` فيدهس عملَ الأول كاملاً — بلا فحصٍ ولا إشعار. الآن نلتقط
     `updatedAt` لحظةَ فتح المحرّر، ونتحقّق داخل معاملةٍ أنّه لم يتغيّر؛ إن تغيّر
     رفضنا الكتابة وطلبنا إعادةَ الفتح — فلا يضيع عملُ أحدٍ بلا علمه. */
  var _openedStamp = null;
  function _txUpdateGuarded(id, data){
    var ref = db.collection(COLLECTION()).doc(id);
    var opened = _openedStamp;
    return db.runTransaction(function(tx){
      return tx.get(ref).then(function(snap){
        if(!snap.exists) throw new Error("__GONE__");
        var cur = (snap.data()||{}).updatedAt || "";
        if(opened != null && String(cur) !== String(opened)) throw new Error("__CONFLICT__");
        tx.update(ref, data);
      });
    });
  }

  // ══ قراءةُ أسعار الدرجات من النموذج ══
  function readGradesFromForm(){
    const out = { low:null, mid:null, high:null };
    let any=false, bad=false;
    GRADE_KEYS.forEach(function(k){
      const el = document.getElementById("lab-rate-"+k);
      const raw = el ? String(el.value||"").trim() : "";
      if(!raw) return;
      if(!/\d/.test(raw)){ bad=true; return; }
      const v = num(raw);
      if(v<0){ bad=true; return; }
      out[k]=v; any=true;
    });
    return { grades:out, any:any, bad:bad };
  }

  // قاعدةُ الاشتقاق تُرى وقتَ الإدخال لا بعد الحفظ — فلا يفاجأ المالكُ بأيِّ سعرٍ سُحب
  function onRateInput(){
    const box = document.getElementById("lab-base-preview");
    if(!box) return;
    const gr = readGradesFromForm();
    const base = baseFrom(gr.grades, null);
    if(base==null){ box.textContent = "—"; box.style.color = "var(--muted)"; return; }
    const src = (gr.grades.mid!=null) ? "mid" : (gr.grades.low!=null ? "low" : "high");
    box.style.color = "var(--accent)";
    box.innerHTML = money(base)+' ر.س <span style="font-size:10px;color:var(--muted);font-weight:600">('+E(GRADE_LABELS[src])+')</span>';
  }

  function openItemModal(id){
    if(!canManage()){ T("⚠ صلاحية المسؤول أو مسؤول المشتريات فقط","warn"); return; }
    buildDOM();
    populateCategorySelects();
    const titleEl = document.getElementById("lab-modal-title");
    document.getElementById("lab-edit-id").value = id||"";
    document.getElementById("lab-code").value="";
    document.getElementById("lab-name").value="";
    { const _cs=document.getElementById("lab-category-select"); if(_cs) _cs.value=""; const _cc=document.getElementById("lab-category-custom"); if(_cc){ _cc.value=""; _cc.style.display="none"; } }
    document.getElementById("lab-unit").value="";
    GRADE_KEYS.forEach(function(k){ const el=document.getElementById("lab-rate-"+k); if(el) el.value=""; });
    document.getElementById("lab-scope").value="";
    const lblEl = document.getElementById("lab-code-lbl");
    if(lblEl) lblEl.textContent="";

    if(id){
      const it = _items.find(function(c){ return c.id===id; });
      if(!it){ T("⚠ البند غير موجود","warn"); return; }
      if(titleEl) titleEl.innerHTML=(typeof _ic==="function"?_ic("edit"):"")+" تعديل مصنعية";
      document.getElementById("lab-code").value = it.code||"";
      document.getElementById("lab-name").value = it.name||"";
      { const _cs=document.getElementById("lab-category-select"); if(_cs) _cs.value = it.category||""; }
      document.getElementById("lab-unit").value = it.unit||"";
      /* بندٌ قديمٌ بسعرٍ واحدٍ بلا درجة: يُوضَع سعرُه في «متوسط الجودة» ليصنّفه المالكُ
         بيده عند أوّل تعديل — ولا يتغيّر شيءٌ إن حفظه كما هو (الأساسُ = المتوسط). */
      const _gm = gradeMap(it);
      if(hasGrades(it)) GRADE_KEYS.forEach(function(k){ const el=document.getElementById("lab-rate-"+k); if(el) el.value = _gm[k]!=null ? _gm[k] : ""; });
      else { const el=document.getElementById("lab-rate-mid"); if(el) el.value = it.rate!=null ? it.rate : ""; }
      document.getElementById("lab-scope").value = it.scopeNotes||"";
      _openedStamp = it.updatedAt || "";   // v18.9ad — M24: بصمةُ النسخة المفتوحة
    } else {
      _openedStamp = null;   // v18.9ad — M24: إنشاءٌ جديد — لا بصمة تُقارَن
      if(titleEl) titleEl.textContent="➕ إضافة مصنعية جديدة";
      const code = genCode();
      document.getElementById("lab-code").value = code;
      if(lblEl) lblEl.textContent="(مُولَّد تلقائياً — قابل للتعديل)";
    }
    onRateInput();
    openModal("modal-labor-item");
  }

  // ══ حفظ (إضافة أو تعديل) ══
  async function save(){
    if(!canManage()){ T("⚠ صلاحية غير كافية","warn"); return; }
    const id       = document.getElementById("lab-edit-id").value.trim();
    const code     = document.getElementById("lab-code").value.trim();
    const name     = document.getElementById("lab-name").value.trim();
    const category = readCategory();
    const unit     = document.getElementById("lab-unit").value.trim();
    const gr       = readGradesFromForm();
    const grades   = gr.grades;
    const rate     = baseFrom(grades, null);
    const scope    = document.getElementById("lab-scope").value.trim();

    if(!name){ T("⚠ أدخل اسم البند","warn"); return; }
    if(!category){ T("⚠ اختر أو اكتب التصنيف","warn"); return; }
    if(!unit){ T("⚠ اختر الوحدة","warn"); return; }
    if(gr.bad){ T("⚠ أدخل أرقاماً صحيحةً غيرَ سالبةٍ في خانات الأسعار","warn"); return; }
    if(!gr.any || rate==null){ T("⚠ أدخل سعراً واحداً على الأقل لإحدى درجات الجودة","warn"); return; }

    // ترتيبُ الدرجات مقلوبٌ = خطأُ إدخالٍ غالباً (سعرٌ في الخانة الخطأ) — تحذيرٌ لا منع
    if(!gradeOrderOk(grades)){
      let okOrd=false;
      try{
        okOrd = await showConfirm({title:"ترتيب الأسعار مقلوب", msg:"سعرُ درجةٍ أعلى جودةً أقلُّ من درجةٍ أدنى منها. تأكّد أنّك لم تضع سعراً في الخانة الخطأ. هل تريد الحفظ كما هو؟", icon:"⚠", okText:"حفظ كما هو", okClass:"btn-danger"});
      }catch(e){ okOrd=false; }
      if(!okOrd) return;
    }

    // تكرار الكود
    if(code){
      const dup = _items.find(function(c){ return c.code && c.code.toLowerCase()===code.toLowerCase() && c.id!==id; });
      if(dup){ T('⚠ الكود "'+E(code)+'" موجود مسبقاً — اختر كوداً آخر',"warn"); return; }
    }

    // نطاق العمل موصى به بشدة — تأكيد ناعم عند تركه فارغاً
    if(!scope){
      let ok=false;
      try{
        ok = await showConfirm({title:"نطاق عمل غير محدد", msg:"لم تُدخل نطاق العمل. سعر المصنعية بلا نطاق واضح مصدر نزاعات لاحقة. هل تريد الحفظ بدون نطاق؟", icon:"⚠", okText:"حفظ بدون نطاق", okClass:"btn-danger"});
      }catch(e){ ok=false; }
      if(!ok) return;
    }

    const data = {
      code:code, name:name, category:category, unit:unit,
      rate:rate, grades:grades, scopeNotes:scope,
      updatedAt: stamp(), updatedBy: userLabel()
    };

    try{
      if(id){
        await _txUpdateGuarded(id, data);   // v18.9ad — M24
        T("✅ تم تحديث المصنعية","success");
      } else {
        // كود ذرّي عند غيابه أو بقائه على النمط التلقائي LAB-### — يمنع التكرار عند التزامن.
        if(!code || /^LAB-\d+$/i.test(code)) data.code = await allocCode();
        data.createdAt = stamp();
        data.createdBy = userLabel();
        await db.collection(COLLECTION()).add(data);
        T("✅ تم إضافة المصنعية","success");
      }
      closeModal("modal-labor-item");
    } catch(e){
      // v18.9ad — M24: التعارض والحذف رسالتان مفهومتان لا «خطأ في الاتصال»
      var _m = String((e&&e.message)||"");
      if(_m.indexOf("__CONFLICT__")>=0){
        T("⚠ عدّل زميلٌ هذا البند بينما كان مفتوحاً لديك — أغلق النافذة وافتحه من جديد ليُبنى تعديلُك على النسخة الحالية","warn");
        return;
      }
      if(_m.indexOf("__GONE__")>=0){ T("⚠ حُذف هذا البند من الكتالوج أثناء تحريرك","warn"); return; }
      console.error("labor save error", e);
      T("⚠ خطأ في الحفظ — تحقق من الاتصال","warn");
    }
  }

  // ══ حذف ══
  async function del(id, name){
    if(!canManage()){ T("⚠ صلاحية غير كافية","warn"); return; }
    let ok=false;
    try{
      ok = await showConfirm({title:"حذف مصنعية", msg:'هل تريد حذف "'+name+'" من كتالوج المصنعيات؟', icon:"🗑", okText:"حذف", okClass:"btn-danger"});
    }catch(e){ ok=false; }
    if(!ok) return;
    try{
      await db.collection(COLLECTION()).doc(id).delete();
      T("🗑 تم حذف المصنعية","success");
    } catch(e){
      console.error("labor delete error", e);
      T("⚠ خطأ في الحذف","warn");
    }
  }

  // ══ تصدير Excel ══
  async function exportExcel(){
    if(!await window._needLib(window._ensureXLSX,"Excel")) return;   // عند أوّل تصدير
    if(isViewerMode()){ T("🔒 وضع العرض فقط — الأسعار محجوبة","warn"); return; }
    if(!_items.length){ T("لا توجد مصنعيات للتصدير","warn"); return; }
    const rows = _items.map(function(it,i){
      // بندٌ قديمٌ بسعرٍ واحد: يُصدَّر في عمود «متوسط الجودة» — نفسُ عُرف المحرّر،
      // فالتصديرُ ثم الاستيرادُ يعيدان البندَ كما هو لا مبخوساً ولا مضاعَفاً.
      const m = gradeMap(it);
      const midOut = hasGrades(it) ? m.mid : (it.rate==null?null:it.rate);
      return {
        "#": i+1,
        "الكود": it.code||"",
        "اسم البند": it.name||"",
        "التصنيف": it.category||"",
        "الوحدة": it.unit||"",
        "سعر منخفض الجودة (ر.س)": m.low==null?"":m.low,
        "سعر متوسط الجودة (ر.س)": midOut==null?"":midOut,
        "سعر عالي الجودة (ر.س)": m.high==null?"":m.high,
        "نطاق العمل": it.scopeNotes||""
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "كتالوج المصنعيات");
    XLSX.writeFile(wb, "labor_catalog_"+new Date().toISOString().slice(0,10)+".xlsx");
  }

  // ══ قالب الاستيراد ══
  async function downloadTemplate(){
    if(!await window._needLib(window._ensureXLSX,"Excel")) return;   // عند أوّل تصدير
    const rows = [
      ["ℹ أدخل البنود من السطر 3 — المطلوب: اسم البند + سعرٌ واحدٌ على الأقل من أعمدة الجودة الثلاثة (اترك ما لا يلزم فارغاً) | الكود اختياري (يُولَّد تلقائياً) | لا تعدّل رؤوس الأعمدة","","","","","","","",""],
      ["#","الكود","اسم البند *","التصنيف","الوحدة","سعر منخفض الجودة (ر.س)","سعر متوسط الجودة (ر.س)","سعر عالي الجودة (ر.س)","نطاق العمل"],
      [1,"LAB-001","لياسة أسمنتية للجدران","لياسة","م2",12.00,15.00,19.00,"يشمل الطرطشة والبطانة والضهارة — لا يشمل السقالات ولا الخامات"],
      [2,"LAB-002","تركيب بلاط أرضيات","بلاط وأرضيات","م2",18.00,25.00,34.00,"يشمل الفرش والمونة — لا يشمل توريد البلاط"],
      [3,"LAB-003","دهان بلاستيك ثلاث أوجه","دهانات","م2","",12.00,17.00,"يشمل المعجون والتأسيس والثلاث أوجه"],
      [4,"LAB-004","مباني بلوك 20 سم","مباني","م2","",30.00,"","يشمل المونة والعمالة — لا يشمل توريد البلوك"],
      [5,"LAB-005","تمديد نقطة كهرباء","كهرباء","عدد",35.00,45.00,60.00,"يشمل المواسير والعلب — لا يشمل الأسلاك واللوحات"]
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{wch:5},{wch:12},{wch:32},{wch:16},{wch:10},{wch:22},{wch:22},{wch:22},{wch:50}];
    try{ ws["!merges"] = [{s:{r:0,c:0},e:{r:0,c:8}}]; }catch(e){}
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "كتالوج المصنعيات");
    XLSX.writeFile(wb, "labor_catalog_template.xlsx");
  }

  /* ══ خريطةُ أعمدة الاستيراد — نقيّةٌ للاختبار ══
     كان الاستيراد يقرأ بمواضعَ ثابتة (٥ = السعر، ٦ = نطاق العمل). وبإدخال ثلاثة
     أعمدةِ جودةٍ صار الموضعُ ٦ هو «متوسط الجودة»، فملفٌّ بالقالب القديم كان
     سيُستورَد ونطاقُ عمله في خانة سعر. فالأعمدةُ تُقرأ **بأسماء رؤوسها** الآن،
     والمواضعُ الثابتةُ خطّةٌ بديلةٌ لملفٍّ بلا رؤوسٍ مفهومة. */
  function _mapImportCols(headerRow){
    const hs = (headerRow||[]).map(function(h){ return String(h==null?"":h).replace(/\s+/g," ").trim(); });
    function col(test, fb){ for(var i=0;i<hs.length;i++){ if(hs[i] && test(hs[i])) return i; } return fb; }
    const has = function(sub){ return function(h){ return h.indexOf(sub)>=0; }; };
    const low  = col(has("منخفض"), -1);
    const mid  = col(has("متوسط"), -1);
    const high = col(has("عالي"),  -1);
    // قالبٌ قديمٌ بعمود سعرٍ واحد ⇒ يُقرأ في «متوسط الجودة»
    const legacy = (low<0 && mid<0 && high<0) ? col(has("سعر"), 5) : -1;
    let scope = col(has("نطاق"), -1);
    if(scope<0) scope = (legacy>=0) ? 6 : 8;
    return {
      code:  col(has("كود"),    1),
      name:  col(has("اسم"),    2),
      cat:   col(has("تصنيف"),  3),
      unit:  col(has("وحدة"),   4),
      low:low, mid:mid, high:high, legacy:legacy, scope:scope
    };
  }

  function triggerImport(){
    if(!canManage()){ T("⚠ صلاحية غير كافية","warn"); return; }
    const el = document.getElementById("lab-import-file");
    if(el) el.click();
  }

  // ══ استيراد Excel ══
  async function importExcel(input){
    if(!await window._needLib(window._ensureXLSX,"Excel")) return;   // عند أوّل تصدير
    if(!canManage()){ T("⚠ صلاحية غير كافية","warn"); return; }
    const file = input && input.files && input.files[0];
    if(!file) return;
    input.value = "";
    try{
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, {type:"array"});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, {header:1, defval:""});
      // تخطّي صف التعليمات + صف الرؤوس (أول صفين)
      const C = _mapImportCols(aoa[1]||[]);
      const PRICE_COLS = [C.low, C.mid, C.high, C.legacy].filter(function(ci){ return ci>=0; });
      const dataRows = aoa.slice(2).filter(function(r){
        if(!r) return false;
        if(String(r[C.name]||"").trim()) return true;
        return PRICE_COLS.some(function(ci){ return String(r[ci]==null?"":r[ci]).trim(); });
      });
      if(!dataRows.length){ T("⚠ لا توجد صفوف صالحة في الملف","warn"); return; }

      // أكواد مستخدمة (موجودة + مُولَّدة داخل هذه الدفعة)
      const usedCodes = new Set(_items.map(function(c){ return (c.code||"").toLowerCase(); }));
      let seq = (function(){
        const nums = _items.filter(function(c){ return c.code && c.code.indexOf(CODE_PREFIX+"-")===0; })
          .map(function(c){ const n=parseInt(c.code.slice(CODE_PREFIX.length+1),10); return isNaN(n)?0:n; });
        return nums.length ? Math.max.apply(null,nums) : 0;
      })();
      function nextCode(){ let c; do{ seq++; c=CODE_PREFIX+"-"+String(seq).padStart(3,"0"); }while(usedCodes.has(c.toLowerCase())); usedCodes.add(c.toLowerCase()); return c; }

      const valid = [];
      let skipped = 0, oddOrder = 0;
      dataRows.forEach(function(r){
        const name = String(r[C.name]||"").trim();
        const grades = { low:null, mid:null, high:null };
        let anyPrice = false;
        function take(ci, key){
          if(ci<0) return;
          const raw = String(r[ci]==null?"":r[ci]).trim();
          if(!raw || !/\d/.test(raw)) return;
          const v = num(raw);
          if(v<0) return;
          grades[key]=v; anyPrice=true;
        }
        take(C.low,"low"); take(C.mid,"mid"); take(C.high,"high");
        take(C.legacy,"mid");   // القالبُ القديم: عمودُ السعر الواحد ⇒ متوسطُ الجودة
        const rate = baseFrom(grades, null);
        if(!name || !anyPrice || rate==null){ skipped++; return; }
        if(!gradeOrderOk(grades)) oddOrder++;   // يُستورَد ويُعلَن — لا يُسقَط بصمت
        let code = String(r[C.code]||"").trim();
        if(!code || usedCodes.has(code.toLowerCase())) code = nextCode();
        else usedCodes.add(code.toLowerCase());
        valid.push({
          code:code, name:name,
          category:String(r[C.cat]||"متفرقة").trim()||"متفرقة",
          unit:String(r[C.unit]||"").trim(),
          rate:rate, grades:grades,
          scopeNotes:String(r[C.scope]||"").trim()
        });
      });

      if(!valid.length){ T("⚠ لا توجد صفوف صالحة (تحقق من الاسم وسعرٍ واحدٍ على الأقل)","warn"); return; }

      let ok=false;
      try{
        ok = await showConfirm({title:"تأكيد الاستيراد", msg:"سيُضاف "+valid.length+" بند مصنعية"+(skipped?(" (تخطّي "+skipped+" صف غير صالح)"):"")+(oddOrder?(" — تنبيه: "+oddOrder+" بنداً ترتيبُ أسعار جودته مقلوب"):"")+". متابعة؟", icon:"📤", okText:"استيراد", okClass:"btn-primary"});
      }catch(e){ ok=false; }
      if(!ok) return;

      // كتابة على دفعات ≤ 499
      const CHUNK = 400;
      for(let i=0;i<valid.length;i+=CHUNK){
        const batch = db.batch();
        valid.slice(i,i+CHUNK).forEach(function(v){
          const ref = db.collection(COLLECTION()).doc();
          batch.set(ref, Object.assign({}, v, {
            createdAt: stamp(), createdBy: userLabel(),
            updatedAt: stamp(), updatedBy: userLabel()
          }));
        });
        await batch.commit();
      }
      T("✅ تم استيراد "+valid.length+" بند مصنعية","success");
    } catch(e){
      console.error("labor import error", e);
      T("⚠ خطأ في قراءة الملف — تأكد من القالب الصحيح","warn");
    }
  }

  // ══ ربط توليد الكود عند تغيّر التصنيف يدوياً (اختياري — الكود تسلسلي عام) ══

  // ══ التعريض ══
  window.laborCatalog = {
    startSync: startSync,
    render: render,
    resetFilters: resetFilters,
    onCategoryChange: onCategoryChange,
    onRateInput: onRateInput,
    openItemModal: openItemModal,
    save: save,
    del: del,
    exportExcel: exportExcel,
    downloadTemplate: downloadTemplate,
    triggerImport: triggerImport,
    importExcel: importExcel,
    getItems: function(){ return _items.slice(); },
    // ── أسعارُ درجات الجودة: عقدٌ عامٌّ يقرؤه محرّك تحليل الأسعار، ونقيٌّ للاختبار ──
    GRADE_KEYS: GRADE_KEYS.slice(),
    gradeLabel: gradeLabel,
    gradeMap: gradeMap,
    hasGrades: hasGrades,
    priceOf: priceOf,
    priceList: priceList,
    baseFrom: baseFrom,
    gradeOrderOk: gradeOrderOk,
    _num: num,           // مكشوف للاختبار فقط (hail-tests.js) — دالة نقية
    _nextCodeNum: _nextCodeNum,  // منطق العدّاد الذرّي — للاختبار
    _mapImportCols: _mapImportCols   // خريطة أعمدة الاستيراد — للاختبار
  };
  // جسر ترقيم: pgBar في النواة يولّد onclick باسم render+<PG_KEY> = renderLaborCatalogTable()
  // الوحدة تعرّض render على كائنها، فنعرّف الاسم العام حتى تعمل أزرار الصفحات
  // (كان الضغط على صفحةٍ تالية يرمي ReferenceError فلا يُعاد الرسم).
  window.renderLaborCatalogTable = function(){ try{ return window.laborCatalog.render(); }catch(e){} };
})();
