/* ═══════════════════════════════════════════════════════════════════════════
   نظام هيل — وحدة البند المستعاض  (substitute-budget.js)
   ملف خارجي مستقل يُحقَن في صفحة #page-substitute-budget، على نمط stocktake.js
   و price-analysis.js: IIFE يعرض كائناً واحداً window.substituteBudget، ويقرأ
   خدمات النواة (db / currentUser / esc / toast / showConfirm / showCustomModal /
   logAudit / فحوص الأدوار / _projectsList / purchases / poIsClosed /
   poActualCost / getPOTotal / _getProjName) مباشرةً بالاسم — إذ تتشارك كل وسوم
   <script> الكلاسيكية نفس البيئة المعجمية العامة.

   الفكرة (متفق عليها مع المالك):
   • «البند المستعاض» رصيدٌ من المال لكل مشروع يُستخدم لشراء بنودٍ أو تقديم خدماتٍ
     خارج بنود العقد، مع هامش ربحٍ ثابتٍ لكل مشروع (10% / 25% ...).
   • الرصيد ليس خاصيةً على المشروع بل «حساب» مستقلّ، نوعان:
       - مربوط بمشروعٍ من القائمة (linked)  → يأخذ اسمه من _projectsList.
       - مستقلّ باسمه الخاص (standalone)     → لمشاريع خارج قائمة المشاريع.
     كلاهما في سجلٍّ واحد (وثيقة meta/substitute_accounts) بنفس الأعمدة والقواعد.
   • الطلب يُعلَّم «مستعاضاً» ويشير صراحةً لحسابٍ بعينه (substituteAccountId) — بلا
     مطابقة أسماء هشّة.
   • الخصم بسعر البيع (التكلفة الفعلية + الهامش) وعند الإغلاق الفعلي فقط.
   • «المستهلك قبل المنصة» يُدخَل رقماً افتتاحياً واحداً لكل حساب (openingConsumed).

   مصدرٌ واحدٌ للحقيقة (اتساقاً مع بقية النظام): لا نخزّن «المستهلك» متغيّراً نعدّله
   مع كل طلب — بل الإعداد ثابتٌ في الوثيقة، والمستهلك/الربح يُحسبان لحظياً من الطلبات
   المستعاضة المغلقة عبر poIsClosed / poActualCost. onSnapshot مصدر الحقيقة.

   الصلاحيات (متفق عليها):
   • عرض النشاط (قائمة الطلبات المستعاضة وتكلفتها) لكل المستخدمين.
   • بطاقة المال (الإجمالي/المتبقي/الهامش/سعر البيع/الربح) لـ admin + ceo + finance فقط.
   • إنشاء/تعديل/حذف الحسابات للمسؤول (admin) فقط — مثل إدارة المشاريع.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
  "use strict";

  // ════════ تخزين الحسابات ════════
  // وثيقة واحدة تحمل مصفوفة accounts — على نمط meta/projects تماماً.
  function DOC(){
    var dev = false;
    try{ dev = (typeof IS_DEV!=="undefined" && IS_DEV); }catch(e){}
    return dev ? "meta/substitute_accounts_dev" : "meta/substitute_accounts";
  }

  var _accounts = [];    // كل الحسابات (من onSnapshot)
  var _unsub    = null;  // إلغاء الاشتراك
  var _curId    = null;  // الحساب المفتوح في شاشة التفاصيل (أو null = القائمة)
  var _saving   = false; // حارس ضد النقر المزدوج على الحفظ

  // ════════ أدوات مساعدة داخلية ════════
  function _now(){ return new Date().toISOString(); }
  function _me(){ try{ return (currentUser && currentUser.name) || "النظام"; }catch(e){ return "النظام"; } }
  function _esc(s){ try{ return esc(s); }catch(e){ return String(s==null?"":s); } }
  function _toast(m,t){ try{ toast(m,t); }catch(e){} }
  function _audit(a,d){ try{ if(typeof logAudit==="function") logAudit(a,d); }catch(e){} }
  function _confirm(o){ try{ return showConfirm(o); }catch(e){ return Promise.resolve(window.confirm((o&&o.msg)||"تأكيد؟")); } }
  function _projects(){ try{ return window._projectsList || []; }catch(e){ return []; } }
  function _pos(){ try{ return (typeof purchases!=="undefined" && Array.isArray(purchases)) ? purchases : []; }catch(e){ return []; } }
  function _isClosed(p){ try{ return (typeof poIsClosed==="function") ? poIsClosed(p) : false; }catch(e){ return false; } }
  function _actualCost(p){ try{ return (typeof poActualCost==="function") ? Number(poActualCost(p))||0 : (Number(p&&p.actualCost)||0); }catch(e){ return 0; } }
  function _estTotal(p){ try{ return (typeof getPOTotal==="function") ? Number(getPOTotal(p))||0 : (Number(p&&p.estCost)||0); }catch(e){ return Number(p&&p.estCost)||0; } }

  function _fmt(n){ return (Number(n)||0).toLocaleString("en-US",{maximumFractionDigits:2}); }
  // أيقونة SVG من طقم المنصة (لغة الأيقونات الموحّدة) — بديل الإيموجي. آمنة إن غاب _ic.
  function _icn(name,cls){ try{ return (typeof _ic==="function") ? _ic(name,cls) : ""; }catch(e){ return ""; } }

  function _canManage(){ // إنشاء/تعديل/حذف الحسابات — المسؤول فقط
    try{ return (typeof isAdmin==="function") && isAdmin(); }catch(e){ return false; }
  }
  function _canSeeMoney(){ // بطاقة المال والأرباح — admin + ceo + finance
    try{
      return ((typeof isAdmin==="function") && isAdmin())
          || ((typeof isCEO==="function") && isCEO())
          || ((typeof isFinance==="function") && isFinance());
    }catch(e){ return false; }
  }

  // المصدر الموحّد للمشاريع (رسمية + يدوية مشتقّة من الطلبات و meta) — نفس ما
  // يستعمله فلتر/تقارير المشتريات، فيترابط البند المستعاض مع بنود طلبات الشراء.
  // القيمة (value): الرسمي بمعرّفه، واليدوي بـ "__CUSTOM__:"+الاسم.
  function _projOptions(){
    try{ if(typeof _allProjectOptions==="function"){ var o=_allProjectOptions(); if(Array.isArray(o)) return o; } }catch(e){}
    return _projects().map(function(p){ return { value:p.id, label:p.name }; });
  }
  function _isCustomKey(v){ return typeof v==="string" && v.indexOf("__CUSTOM__:")===0; }

  // اسم الحساب المعروض: للمربوط اسمُ المشروع الحيّ من المصدر الموحّد، وإلا المخزّن.
  function _acctName(acc){
    if(acc && acc.kind==="linked"){
      var hit = _projOptions().find(function(o){ return o.value===acc.projectId; });
      if(hit && hit.label) return hit.label;
      var pj = _projects().find(function(p){ return p.id===acc.projectId; });
      if(pj && pj.name) return pj.name;
      if(_isCustomKey(acc.projectId)) return acc.projectId.slice(11);
    }
    return (acc && acc.name) || "—";
  }

  // ════════ حساب السجل (لحظياً من الطلبات) ════════
  // consumed = openingConsumed + Σ سعر بيع الطلبات المستعاضة المغلقة لهذا الحساب.
  // sellingPrice = التكلفة الفعلية × (1 + الهامش/100).  الربح = سعر البيع − التكلفة.
  //
  // دالة نقية (بلا قراءة globals) لتكون قابلة للاختبار: تأخذ الحساب وقائمة طلباته
  // والدوال المُعينة (مغلق؟ / التكلفة الفعلية / التقديرية). تُستدعى من _stats بالدوال
  // المدعومة بالـ globals، وتُعرَّض كـ _calcStats لفحوص hail-tests.
  function _calcStats(acc, pos, isClosed, actualCost, estTotal){
    var margin = Number(acc && acc.margin)||0, f = 1 + margin/100;
    var closedCost=0, closedSell=0, closedProfit=0, wipSell=0, closedCount=0, wipCount=0;
    (pos||[]).forEach(function(p){
      if(isClosed(p)){
        var c = Number(actualCost(p))||0, s = c*f;
        closedCost += c; closedSell += s; closedProfit += (s-c); closedCount++;
      } else {
        wipSell += (Number(estTotal(p))||0)*f; wipCount++;
      }
    });
    var opening = Number(acc && acc.openingConsumed)||0;
    var total   = Number(acc && acc.total)||0;
    var consumed = opening + closedSell;
    return {
      margin:margin, total:total, opening:opening,
      closedCost:closedCost, closedSell:closedSell, closedProfit:closedProfit,
      consumed:consumed, remaining: total - consumed,
      wipSell:wipSell, closedCount:closedCount, wipCount:wipCount, count:(pos||[]).length
    };
  }

  function _stats(acc){
    var pos = _pos().filter(function(p){ return p && p.isSubstitute && p.substituteAccountId===acc.id; });
    return _calcStats(acc, pos, _isClosed, _actualCost, _estTotal);
  }

  // الطلبات المستعاضة التي تشير لحسابٍ غير موجود (حُذف مثلاً) — دلوٌ للتنبيه.
  function _orphanPOs(){
    var ids = {}; _accounts.forEach(function(a){ ids[a.id]=1; });
    return _pos().filter(function(p){ return p && p.isSubstitute && (!p.substituteAccountId || !ids[p.substituteAccountId]); });
  }

  // ════════ الاشتراك الفوري ════════
  function startSync(){
    if(typeof db==="undefined" || !db) return;
    // حمّل الأسماء اليدوية من meta (أفضل جهد) حتى تكتمل قائمة المشاريع للربط والعرض
    try{ if(typeof _loadManualProjectNames==="function") _loadManualProjectNames(); }catch(e){}
    if(_unsub) _unsub();
    _unsub = db.doc(DOC()).onSnapshot(function(snap){
      var d = snap.exists ? snap.data() : null;
      _accounts = (d && Array.isArray(d.accounts)) ? d.accounts : [];
      window._substituteAccounts = _accounts; // للوصول من نموذج طلب الشراء
      var pg = document.getElementById("page-substitute-budget");
      if(pg && pg.classList.contains("active")) render();
      // تحديث القائمة المنسدلة في نموذج طلب شراء مفتوح (إن وُجد)
      try{ if(typeof window._sbRefreshPOSelect==="function") window._sbRefreshPOSelect(); }catch(e){}
    }, function(e){ console.warn("substitute-budget sync error:", e); });
  }

  // ════════ الحفظ الذرّي ════════
  // القديم set({accounts:_accounts}) كان يكتب اللقطة المحلية كاملةً فوق مستند الخادم،
  // فتعديلُ مسؤولٍ على حسابٍ يدهس تعديلَ مسؤولٍ آخر على حسابٍ مختلف (فقدان تحديث).
  // الآن: معاملة تقرأ مصفوفة الخادم الحيّة، تدمج تغيير الحساب الواحد عليها، ثم تكتب —
  // فلا تُفقَد تعديلات متزامنة على حسابات أخرى. (تقتدي بنمط newId في index.html.)
  function _applyUpsert(list, account){                 // نقيّة — مكشوفة للاختبار
    var out = list.slice(), i = -1;
    for(var k=0;k<out.length;k++){ if(out[k] && out[k].id===account.id){ i=k; break; } }
    if(i>=0) out[i]=account; else out.push(account);
    return out;
  }
  function _applyRemove(list, id){                       // نقيّة — مكشوفة للاختبار
    return list.filter(function(a){ return a && a.id!==id; });
  }
  function _txAccounts(mutate){
    if(typeof db==="undefined" || !db) return Promise.reject(new Error("no db"));
    var ref = db.doc(DOC());
    return db.runTransaction(function(tx){
      return tx.get(ref).then(function(snap){
        var server = (snap.exists && Array.isArray(snap.data().accounts)) ? snap.data().accounts : [];
        var next = mutate(server.map(function(a){ return Object.assign({}, a); }));
        tx.set(ref, { accounts: next }, { merge:true });
        return next;
      });
    });
  }
  function _upsertAccount(account){ return _txAccounts(function(list){ return _applyUpsert(list, account); }); }
  function _removeAccountTx(id){    return _txAccounts(function(list){ return _applyRemove(list, id); }); }

  // ════════ العرض ════════
  function render(){
    var host = document.getElementById("page-substitute-budget");
    if(!host) return;
    if(_curId){
      var acc = _accounts.find(function(a){ return a.id===_curId; });
      if(!acc){ _curId=null; return render(); }
      host.innerHTML = _detailHtml(acc);
    } else {
      host.innerHTML = _listHtml();
    }
  }

  function _moneyNote(){
    return _canSeeMoney() ? "" :
      '<div style="font-size:11px;color:var(--muted);margin-top:4px">🔒 أرقام الرصيد والأرباح تظهر للمسؤول والمدير التنفيذي والمالية فقط.</div>';
  }

  function _listHtml(){
    var money = _canSeeMoney();
    var addBtn = _canManage()
      ? '<button class="btn btn-primary btn-sm" onclick="window.substituteBudget.openAdd()">➕ إضافة حساب</button>' : "";

    var head = '' +
      '<div class="card" style="margin-bottom:12px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">' +
          '<div>' +
            '<div style="font-size:17px;font-weight:800">'+(typeof _ic==="function"?_ic("landmark","ic-lg"):"")+' رصيد البند المستعاض</div>' +
            '<div style="font-size:12px;color:var(--muted);margin-top:2px">رصيد كل مشروع للمشتريات والخدمات خارج بنود العقد — يُخصم بسعر البيع عند إغلاق الطلب.</div>' +
            _moneyNote() +
          '</div>' + addBtn +
        '</div>' +
      '</div>';

    if(!_accounts.length){
      return head +
        '<div class="card" style="text-align:center;color:var(--muted);padding:40px">' +
          'لا توجد حسابات بند مستعاض بعد.' +
          (_canManage() ? '<div style="margin-top:12px">اضغط «➕ إضافة حساب» لإنشاء أول حساب.</div>'
                        : '<div style="margin-top:12px">يتولّى المسؤول إنشاء الحسابات.</div>') +
        '</div>';
    }

    // إجماليات (لأصحاب صلاحية المال فقط)
    var totBudget=0, totConsumed=0, totRemaining=0, totProfit=0;
    _accounts.forEach(function(a){ var s=_stats(a); totBudget+=s.total; totConsumed+=s.consumed; totRemaining+=s.remaining; totProfit+=s.closedProfit; });

    var summary = money ? '' +
      '<div class="card" style="margin-bottom:12px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;text-align:center">' +
        _kpi("إجمالي الأرصدة", _fmt(totBudget), "var(--primary)") +
        _kpi("إجمالي المستهلك", _fmt(totConsumed), "var(--accent)") +
        _kpi("إجمالي المتبقي", _fmt(totRemaining), totRemaining<0?"var(--danger)":"var(--success)") +
        _kpi("إجمالي الربح المحقّق", _fmt(totProfit), "var(--success)") +
      '</div>' : '';

    // أعمدة الجدول
    var moneyHeads = money
      ? '<th style="padding:8px;text-align:center">الإجمالي</th>' +
        '<th style="padding:8px;text-align:center">مستهلك سابقاً</th>' +
        '<th style="padding:8px;text-align:center">مصروف على المنصة</th>' +
        '<th style="padding:8px;text-align:center">المتبقي</th>' +
        '<th style="padding:8px;text-align:center">الربح المحقّق</th>' +
        '<th style="padding:8px;text-align:center">الهامش</th>'
      : '';

    var rows = _accounts.map(function(acc){
      var s = _stats(acc);
      var kindBadge = acc.kind==="linked"
        ? '<span style="font-size:10px;background:color-mix(in srgb,var(--primary) 12%,transparent);color:var(--primary);padding:2px 7px;border-radius:20px;font-weight:700">'+_icn("link","ic-sm")+' مربوط بمشروع</span>'
        : '<span style="font-size:10px;background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);padding:2px 7px;border-radius:20px;font-weight:700">'+_icn("edit","ic-sm")+' مستقلّ</span>';
      var moneyCells = money
        ? '<td style="padding:8px;text-align:center">'+_fmt(s.total)+'</td>' +
          '<td style="padding:8px;text-align:center;color:var(--muted)">'+_fmt(s.opening)+'</td>' +
          '<td style="padding:8px;text-align:center">'+_fmt(s.closedSell)+'</td>' +
          '<td style="padding:8px;text-align:center;font-weight:800;color:'+(s.remaining<0?"var(--danger)":"var(--success)")+'">'+_fmt(s.remaining)+'</td>' +
          '<td style="padding:8px;text-align:center;color:var(--success);font-weight:700">'+_fmt(s.closedProfit)+'</td>' +
          '<td style="padding:8px;text-align:center">'+_fmt(s.margin)+'%</td>'
        : '';
      return '<tr style="cursor:pointer;border-top:1px solid var(--border)" onclick="window.substituteBudget.open(\''+acc.id+'\')">' +
        '<td style="padding:8px;font-weight:700">'+_esc(_acctName(acc))+'<div style="margin-top:3px">'+kindBadge+'</div></td>' +
        '<td style="padding:8px;text-align:center">'+s.count+'</td>' +
        moneyCells +
      '</tr>';
    }).join("");

    var orphans = _orphanPOs();
    var orphanCard = orphans.length ? '' +
      '<div class="card" style="margin-top:12px;border-right:3px solid var(--danger)">' +
        '<div style="font-weight:800;color:var(--danger);margin-bottom:4px">⚠ طلبات مستعاضة بلا حساب صالح ('+orphans.length+')</div>' +
        '<div style="font-size:12px;color:var(--muted)">طلبات مُعلَّمة «مستعاض» لكنها لا تشير لحسابٍ موجود — لن تُخصم من أي رصيد. راجعها من صفحة الطلبات.</div>' +
      '</div>' : '';

    return head + summary +
      '<div class="card" style="overflow-x:auto">' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
          '<thead><tr style="background:var(--surface2)">' +
            '<th style="padding:8px;text-align:right">الحساب</th>' +
            '<th style="padding:8px;text-align:center">عدد الطلبات المستعاضة</th>' +
            moneyHeads +
          '</tr></thead>' +
          '<tbody>'+rows+'</tbody>' +
        '</table>' +
      '</div>' + orphanCard;
  }

  function _kpi(label,val,color){
    return '<div><div style="font-size:20px;font-weight:800;color:'+color+'">'+val+'</div>' +
           '<div style="font-size:11px;color:var(--muted);margin-top:2px">'+label+'</div></div>';
  }

  function _detailHtml(acc){
    var money = _canSeeMoney();
    var s = _stats(acc);
    var pos = _pos().filter(function(p){ return p && p.isSubstitute && p.substituteAccountId===acc.id; })
                    .sort(function(a,b){ return String(b.createdAt||"").localeCompare(String(a.createdAt||"")); });

    var manageBtns = _canManage()
      ? '<button class="btn btn-ghost btn-sm" onclick="window.substituteBudget.openEdit(\''+acc.id+'\')">'+_icn("edit")+' تعديل</button> ' +
        '<button class="btn btn-danger btn-sm" onclick="window.substituteBudget.remove(\''+acc.id+'\')">🗑 حذف</button>'
      : '';

    var moneyBox = money ? '' +
      '<div class="card" style="margin-bottom:12px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;text-align:center">' +
        _kpi("إجمالي الرصيد", _fmt(s.total), "var(--primary)") +
        _kpi("مستهلك قبل المنصة", _fmt(s.opening), "var(--muted)") +
        _kpi("مصروف على المنصة", _fmt(s.closedSell), "var(--accent)") +
        _kpi("المتبقي", _fmt(s.remaining), s.remaining<0?"var(--danger)":"var(--success)") +
        _kpi("الربح المحقّق", _fmt(s.closedProfit), "var(--success)") +
        _kpi("قيد التنفيذ (لم يُخصم بعد)", _fmt(s.wipSell), "var(--warn,#b45309)") +
      '</div>' : '';

    var moneyPOHeads = money
      ? '<th style="padding:8px;text-align:center">التكلفة</th>' +
        '<th style="padding:8px;text-align:center">سعر البيع</th>' +
        '<th style="padding:8px;text-align:center">الربح</th>' : '';

    var poRows = pos.length ? pos.map(function(p){
      var closed = _isClosed(p);
      var cost = closed ? _actualCost(p) : _estTotal(p);
      var sell = cost*(1+s.margin/100);
      var items = p.itemName || (Array.isArray(p.items)&&p.items.length?(p.items.length+" بند"):"—");
      var moneyCells = money
        ? '<td style="padding:8px;text-align:center">'+_fmt(cost)+'</td>' +
          '<td style="padding:8px;text-align:center">'+_fmt(sell)+'</td>' +
          '<td style="padding:8px;text-align:center;color:var(--success)">'+_fmt(sell-cost)+'</td>' : '';
      return '<tr style="border-top:1px solid var(--border);cursor:pointer" onclick="try{openPurchaseDetail(\''+p.id+'\')}catch(e){}">' +
        '<td style="padding:8px;font-weight:600">'+_esc(p.id)+'</td>' +
        '<td style="padding:8px">'+_esc(items)+'</td>' +
        '<td style="padding:8px;text-align:center">'+(closed?'<span style="color:var(--success);font-weight:700">مغلق ✓</span>':'<span style="color:var(--muted)">قيد التنفيذ</span>')+'</td>' +
        moneyCells +
      '</tr>';
    }).join("")
    : '<tr><td colspan="'+(money?6:3)+'" style="padding:20px;text-align:center;color:var(--muted)">لا توجد طلبات مستعاضة على هذا الحساب بعد.</td></tr>';

    return '' +
      '<div class="card" style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">' +
        '<div>' +
          '<button class="btn btn-ghost btn-sm" onclick="window.substituteBudget.back()">← رجوع</button> ' +
          '<span style="font-size:17px;font-weight:800;margin-inline-start:8px">'+_esc(_acctName(acc))+'</span>' +
          '<div style="font-size:12px;color:var(--muted);margin-top:4px">'+
            (acc.kind==="linked"?_icn("link","ic-sm")+' مربوط بمشروع (رسمي أو يدوي)':_icn("edit","ic-sm")+' حساب مستقلّ')+
            (acc.note?' — '+_esc(acc.note):'')+'</div>' +
          _moneyNote() +
        '</div>' +
        '<div>'+manageBtns+'</div>' +
      '</div>' +
      moneyBox +
      '<div class="card" style="overflow-x:auto">' +
        '<div style="font-weight:800;margin-bottom:8px">📋 الطلبات المستعاضة ('+pos.length+')</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
          '<thead><tr style="background:var(--surface2)">' +
            '<th style="padding:8px;text-align:right">رقم الطلب</th>' +
            '<th style="padding:8px;text-align:right">البنود</th>' +
            '<th style="padding:8px;text-align:center">الحالة</th>' +
            moneyPOHeads +
          '</tr></thead><tbody>'+poRows+'</tbody>' +
        '</table>' +
      '</div>';
  }

  // ════════ نموذج الإضافة/التعديل ════════
  // خيارات قائمة الربط (رسمية + يدوية من المصدر الموحّد) — يُستثنى المرتبط بحسابٍ آخر.
  // مُستخرَجة لتُعاد بناؤها في الخلفية عند وصول الأسماء اليدوية بلا حجب فتح النافذة.
  function _projSelectOptionsHtml(acc){
    var usedProj = {};
    _accounts.forEach(function(a){ if(a.kind==="linked" && (!acc||a.id!==acc.id)) usedProj[a.projectId]=1; });
    var opts = _projOptions().map(function(o){
      var dis = usedProj[o.value] ? ' disabled' : '';
      var sel = (acc && acc.projectId===o.value) ? ' selected' : '';
      var custom = _isCustomKey(o.value);
      return '<option value="'+_esc(o.value)+'"'+dis+sel+'>'+_esc(o.label)+(custom?' (يدوي)':'')+(dis?' (له حساب)':'')+'</option>';
    }).join("");
    return opts || '<option value="">لا مشاريع</option>';
  }

  // إعادة بناء قائمة الربط داخل نافذةٍ مفتوحة (بعد وصول الأسماء اليدوية) مع حفظ الاختيار.
  function _refreshFormProjectSelect(acc){
    var sel = document.getElementById("sb-project");
    if(!sel) return; // النافذة أُغلقت
    var cur = sel.value;
    sel.innerHTML = _projSelectOptionsHtml(acc);
    if(cur){ sel.value = cur; }
  }

  function _formHtml(acc){
    var isEdit = !!acc;
    var kind = (acc && acc.kind) || "linked";
    var projOpts = _projSelectOptionsHtml(acc);

    return '' +
      '<div class="form-group">' +
        '<label class="form-label">نوع الحساب</label>' +
        '<div style="display:flex;gap:16px;flex-wrap:wrap">' +
          '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px"><input type="radio" name="sb-kind" value="linked"'+(kind==="linked"?" checked":"")+' onchange="window.substituteBudget._kindToggle()"> '+_icn("link")+' مربوط بمشروع (رسمي أو يدوي)</label>' +
          '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px"><input type="radio" name="sb-kind" value="standalone"'+(kind==="standalone"?" checked":"")+' onchange="window.substituteBudget._kindToggle()"> '+_icn("edit")+' مستقلّ (اسمٌ جديد غير موجود)</label>' +
        '</div>' +
      '</div>' +
      '<div class="form-group" id="sb-linked-wrap" style="'+(kind==="linked"?"":"display:none")+'">' +
        '<label class="form-label">المشروع *</label>' +
        '<select class="form-select" id="sb-project">'+projOpts+'</select>' +
      '</div>' +
      '<div class="form-group" id="sb-name-wrap" style="'+(kind==="standalone"?"":"display:none")+'">' +
        '<label class="form-label">اسم الحساب/المشروع *</label>' +
        '<input class="form-input" id="sb-name" placeholder="مثال: مشروع جدة (سابق)" value="'+_esc((acc&&acc.kind==="standalone"&&acc.name)||"")+'">' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<div class="form-group"><label class="form-label">إجمالي الرصيد (ريال) *</label>' +
          '<input class="form-input" type="number" min="0" step="0.01" id="sb-total" placeholder="500000" value="'+((acc&&acc.total!=null)?acc.total:"")+'"></div>' +
        '<div class="form-group"><label class="form-label">المستهلك قبل المنصة (ريال)</label>' +
          '<input class="form-input" type="number" min="0" step="0.01" id="sb-opening" placeholder="0" value="'+((acc&&acc.openingConsumed!=null)?acc.openingConsumed:"")+'"></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<div class="form-group"><label class="form-label">نسبة هامش الربح (%) *</label>' +
          '<input class="form-input" type="number" min="0" step="0.01" id="sb-margin" placeholder="25" value="'+((acc&&acc.margin!=null)?acc.margin:"")+'"></div>' +
        '<div class="form-group"><label class="form-label">ملاحظة (اختياري)</label>' +
          '<input class="form-input" id="sb-note" value="'+_esc((acc&&acc.note)||"")+'"></div>' +
      '</div>';
  }

  function openAdd(){
    if(!_canManage()){ _toast("⚠ صلاحية المسؤول فقط","warn"); return; }
    _openForm(null);
  }
  function openEdit(id){
    if(!_canManage()){ _toast("⚠ صلاحية المسؤول فقط","warn"); return; }
    var acc = _accounts.find(function(a){ return a.id===id; });
    if(!acc){ _toast("⚠ الحساب غير موجود","warn"); return; }
    _openForm(acc);
  }

  function _openForm(acc){
    // اعرض النافذة فوراً ببيانات المتاح — لا تنتظر الشبكة (كان await يؤخّر ظهورها).
    try{
      showCustomModal({
        title: acc ? (_icn("edit")+" تعديل حساب: "+_acctName(acc)) : "➕ إضافة حساب بند مستعاض",
        body: _formHtml(acc),
        okText: acc ? "💾 حفظ التعديل" : "✅ إضافة",
        onOk: function(){ return _submitForm(acc); }
      });
    }catch(e){
      _toast("⚠ تعذّر فتح النموذج","warn");
      return;
    }
    // حمّل الأسماء اليدوية من meta في الخلفية، ثم حدّث قائمة الربط إن كانت النافذة
    // ما زالت مفتوحة — فتظهر المشاريع اليدوية بلا حجب فتح النافذة.
    try{
      if(typeof _loadManualProjectNames==="function"){
        Promise.resolve(_loadManualProjectNames())
          .then(function(){ _refreshFormProjectSelect(acc); })
          .catch(function(){});
      }
    }catch(e){}
  }

  function _kindToggle(){
    var kind = (document.querySelector('input[name="sb-kind"]:checked')||{}).value || "linked";
    var lw=document.getElementById("sb-linked-wrap"), nw=document.getElementById("sb-name-wrap");
    if(lw) lw.style.display = kind==="linked" ? "" : "none";
    if(nw) nw.style.display = kind==="standalone" ? "" : "none";
  }

  // يُرجع true للنجاح (يُغلق المودال) و false للبقاء مفتوحاً عند خطأ التحقق/الحفظ.
  async function _submitForm(acc){
    if(_saving) return false;
    var kind = (document.querySelector('input[name="sb-kind"]:checked')||{}).value || "linked";
    var total  = parseFloat((document.getElementById("sb-total")||{}).value);
    var opening= parseFloat((document.getElementById("sb-opening")||{}).value)||0;
    var margin = parseFloat((document.getElementById("sb-margin")||{}).value);
    var note   = ((document.getElementById("sb-note")||{}).value||"").trim();

    if(!(total>=0) || isNaN(total)){ _toast("⚠ أدخل إجمالي رصيدٍ صحيحاً","warn"); return false; }
    if(!(margin>=0) || isNaN(margin)){ _toast("⚠ أدخل نسبة هامشٍ صحيحة","warn"); return false; }
    if(!(opening>=0)) opening=0;

    var projectId="", name="";
    if(kind==="linked"){
      projectId = ((document.getElementById("sb-project")||{}).value||"").trim();
      if(!projectId){ _toast("⚠ اختر المشروع","warn"); return false; }
      // منع ربط مشروعين بنفس الحساب
      var dup = _accounts.find(function(a){ return a.kind==="linked" && a.projectId===projectId && (!acc||a.id!==acc.id); });
      if(dup){ _toast("⚠ هذا المشروع مربوطٌ بحسابٍ آخر","warn"); return false; }
      var hit = _projOptions().find(function(o){ return o.value===projectId; });
      name = (hit && hit.label) || (_isCustomKey(projectId) ? projectId.slice(11) : projectId);
    } else {
      name = ((document.getElementById("sb-name")||{}).value||"").trim();
      if(!name){ _toast("⚠ أدخل اسم الحساب","warn"); return false; }
    }

    _saving = true;
    var backup = _accounts.map(function(a){ return Object.assign({}, a); });
    var saved;
    if(acc){
      acc.kind=kind; acc.projectId=(kind==="linked"?projectId:""); acc.name=name;
      acc.total=total; acc.openingConsumed=opening; acc.margin=margin; acc.note=note;
      acc.updatedAt=_now();
      saved = acc;                                       // تحديثٌ محلّي متفائل — تُوحَّده onSnapshot
    } else {
      var id = "sb_" + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
      saved = {
        id:id, kind:kind, projectId:(kind==="linked"?projectId:""), name:name,
        total:total, openingConsumed:opening, margin:margin, note:note,
        createdAt:_now(), createdBy:_me(), updatedAt:_now()
      };
      _accounts.push(saved);
    }
    try{
      await _upsertAccount(saved);                        // معاملة تدمج هذا الحساب وحده
      _saving=false;
      _toast(acc?"✅ تم حفظ التعديل":"✅ تم إضافة الحساب","success");
      _audit(acc?"تعديل حساب بند مستعاض":"إضافة حساب بند مستعاض", name+" — إجمالي:"+_fmt(total)+" هامش:"+margin+"%");
      render();
      return true; // نجح — يُغلق المودال
    }catch(e){
      _saving=false; _accounts=backup; window._substituteAccounts=_accounts;
      _toast("⚠ خطأ في الحفظ — تحقق من الاتصال","warn"); render();
      return false; // يبقى المودال مفتوحاً لإعادة المحاولة
    }
  }

  function remove(id){
    if(!_canManage()){ _toast("⚠ صلاحية المسؤول فقط","warn"); return; }
    var acc = _accounts.find(function(a){ return a.id===id; });
    if(!acc){ return; }
    var linked = _pos().filter(function(p){ return p && p.isSubstitute && p.substituteAccountId===id; }).length;
    var warn = linked ? ("\n\n⚠ يشير إليه "+linked+" طلب مستعاض — ستبقى الطلبات لكنها ستصبح «بلا حساب» ولن تُخصم من أي رصيد.") : "";
    Promise.resolve(_confirm({
      title:"حذف حساب البند المستعاض؟",
      msg:"سيُحذف حساب «"+_acctName(acc)+"»."+warn,
      icon:"🗑", okText:"حذف", okClass:"btn-danger"
    })).then(function(ok){
      if(!ok) return;
      var backup=_accounts.slice();
      _accounts = _accounts.filter(function(a){ return a.id!==id; });
      _removeAccountTx(id).then(function(){               // معاملة تحذف هذا الحساب وحده من حالة الخادم
        _toast("✅ تم حذف الحساب","success");
        _audit("حذف حساب بند مستعاض", _acctName(acc));
        if(_curId===id) _curId=null;
        render();
      }).catch(function(){
        _accounts=backup; window._substituteAccounts=_accounts;
        _toast("⚠ خطأ في الحذف","warn"); render();
      });
    });
  }

  function open(id){ _curId=id; render(); }
  function back(){ _curId=null; render(); }

  // ════════ واجهة للنموذج (نموذج طلب الشراء) ════════
  // قائمة <option> لكل الحسابات — يستدعيها نموذج طلب الشراء لبناء القائمة المنسدلة.
  function optionsHtml(selectedId){
    var opts = '<option value="">— اختر الحساب —</option>';
    opts += _accounts.map(function(a){
      var sel = (a.id===selectedId) ? ' selected' : '';
      return '<option value="'+_esc(a.id)+'"'+sel+'>'+_esc(_acctName(a))+(a.kind==="linked"?'':' (مستقلّ)')+'</option>';
    }).join("");
    return opts;
  }
  function accounts(){ return _accounts.slice(); }
  // يجد الحساب المربوط بمشروعٍ ما (لترشيح تلقائي في النموذج).
  function accountForProject(projectId){
    var a = _accounts.find(function(x){ return x.kind==="linked" && x.projectId===projectId; });
    return a ? a.id : "";
  }

  // ════════ التصدير ════════
  window.substituteBudget = {
    startSync: startSync,
    render: render,
    open: open, back: back,
    openAdd: openAdd, openEdit: openEdit, remove: remove,
    _kindToggle: _kindToggle,
    optionsHtml: optionsHtml, accounts: accounts, accountForProject: accountForProject,
    _calcStats: _calcStats,  // دالة الحساب النقية — لفحوص hail-tests
    _applyUpsert: _applyUpsert, _applyRemove: _applyRemove   // مبدّلات الدمج النقية — للاختبار
  };
})();
