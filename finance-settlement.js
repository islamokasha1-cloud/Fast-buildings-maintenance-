/* ════════════════════════════════════════════════════════════════════
   تسويةُ المالية النهائية — Finance Final Settlement  (ملف خارجي IIFE)

   المشكلة (بلاغ المالك 05/09 — الطلب PO2026080217): أُحيل الطلبُ للسداد
   بـ22,402 ر.س، ثمّ عاد مسؤولُ المشتريات بعرضِ سعرٍ أرخص، فسدَّدت المالية
   21,592.4 — وبقي 809.6 «متبقّياً» إلى الأبد: الطلبُ عالقٌ عند المالية،
   وبطاقةُ «بانتظار السداد» تحمل رقماً لا أحدَ مدينٌ به.

   الجذر: **إجماليُّ الطلب مملوكٌ لمن سبق المالية** — بنودُ الطلب (getPOTotal)
   أو تدقيقُ المستودع (actualCost)، والمالية لا تملك تصحيحَه. ومخرجُها الوحيدُ
   كان «إعادةَ الطلب للمشتريات»: دورةٌ كاملةٌ لتصحيح رقم.

   القرار: تُقرّ المالية **المبلغَ النهائيَّ واجبَ السداد** بسببٍ مكتوبٍ وأثرٍ
   كامل، فيُقاس عليه المسدَّدُ والمتبقّي. وثلاثةُ قيودٍ تمنعه أن يصير باباً خلفياً:
     • **قبل الإقفال وحدَه** — طلبٌ اكتمل سدادُه لا يُسوّى بأثرٍ رجعيّ.
     • **السببُ إلزاميّ**، ويُقيَّد في المسار وسجلِّ التدقيق باسم مُقرِّه ومبلغِه القديم.
     • **فاتورةُ المورد تعلوه** — النواةُ (_poFinanceTotal) تتجاهل التسويةَ للطلب
       المُدقَّق، فلو أظهرت الفاتورةُ ديناً أكبرَ عاد المتبقّي يظهر.

   عقد صارم: يعرّض window.financeSettlement (وجسرَي onclick العامَّين) فقط |
   لا يكتب مجموعةَ Firestore بنفسه — يمرّ بـsavePurchase كبقيّة مسار الطلب |
   يقرأ حالةَ النواة بالاسم المجرّد: purchases · currentUser · savePurchase ·
   logAudit · toast · esc · showCustomModal · showConfirm · _ic ·
   normalizePOStatus · _poIsFinanceActor · _poPaidSoFar · _poFinanceTotal ·
   _poBaseFinanceTotal · _sendPurchaseWorkflowNotif · openPurchaseDetail ·
   updatePurchaseBadge · renderPurchases.
   ════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  const MODULE_BUILD = "v18.9.3085";

  // ══ جسور آمنة لدوال النواة ══
  function T(msg,type){ try{ if(typeof toast==='function') toast(msg,type); }catch(e){} }
  function E(s){ try{ return (typeof esc==='function') ? esc(s) : String(s==null?'':s); }catch(e){ return String(s==null?'':s); } }
  function ICON(name){ try{ return (typeof _ic==='function') ? _ic(name,"ic-sm") : ''; }catch(e){ return ''; } }
  function POS(){ try{ return (typeof purchases!=='undefined' && purchases) ? purchases : []; }catch(e){ return []; } }
  function findPO(id){ return POS().find(function(x){ return x && x.id===id; }) || null; }
  function isFinanceActor(){ try{ return (typeof _poIsFinanceActor==='function') ? _poIsFinanceActor() : false; }catch(e){ return false; } }
  function paidSoFarOf(p){ try{ return (typeof _poPaidSoFar==='function') ? (_poPaidSoFar(p)||0) : 0; }catch(e){ return 0; } }
  function dueOf(p){ try{ return (typeof _poFinanceTotal==='function') ? (_poFinanceTotal(p)||0) : 0; }catch(e){ return 0; } }
  function baseOf(p){ try{ return (typeof _poBaseFinanceTotal==='function') ? (_poBaseFinanceTotal(p)||0) : 0; }catch(e){ return 0; } }
  function userLabel(){ try{ return (currentUser && (currentUser.name||currentUser.user)) || "—"; }catch(e){ return "—"; } }
  function fmtA(n){ return (Number(n)||0).toLocaleString("en-US",{maximumFractionDigits:2}); }

  // ══ الدوالُّ النقيّة (يفحصها hail-tests.js بلا متصفّح) ══

  /* مَن يُسوّي ومتى — نقيّة. «اكتمل السداد» يقفل الباب: تسويةٌ بعد الإقفال تُعيد
     كتابةَ ماضٍ مُقفَل. و«hasIns» يُبقي البابَ مفتوحاً لطلبٍ سُدِّد جزئياً ثمّ
     تحرّكت حالتُه، فلا يُحبَس الفارقُ بلا مخرج. */
  function canSettleState(financeActor, payPaid, status, hasInstallments){
    if(!financeActor) return false;
    if(payPaid) return false;
    return status==="pending_finance" || !!hasInstallments;
  }

  /* أثرُ المبلغ الجديد — نقيّة. الهامشُ 0.01 هو هامشُ doFinancePaid نفسُه:
     كسورُ الهللة لا تترك «متبقّياً» وهمياً بـ0.004 ر.س. */
  function settleOutcome(paidSoFar, newTotal){
    const paid = Number(paidSoFar)||0, tot = Number(newTotal)||0;
    const fullyPaid = paid > 0 && paid >= (tot - 0.01);
    return { fullyPaid: fullyPaid, excess: +Math.max(0, paid - tot).toFixed(2),
             remaining: +Math.max(0, tot - paid).toFixed(2) };
  }

  // مبلغٌ مقروءٌ أو null — نقيّة (النصُّ والسالبُ يسقطان، والصفرُ صفرٌ حقيقيّ)
  function readAmount(raw){
    if(raw==null || raw==="") return null;
    const n = parseFloat(raw);
    if(!isFinite(n) || n<0) return null;
    return +n.toFixed(2);
  }

  function canSettle(p){
    if(!p) return false;
    const pay = p.payment || null;
    let st = p.status;
    try{ if(typeof normalizePOStatus==='function') st = normalizePOStatus(p.status); }catch(e){}
    const hasIns = !!(pay && Array.isArray(pay.installments) && pay.installments.length);
    return canSettleState(isFinanceActor(), !!(pay && pay.paid), st, hasIns);
  }

  function settledTotalOf(p){
    try{ return (typeof _poSettledTotal==='function') ? _poSettledTotal(p) : null; }catch(e){ return null; }
  }

  // ══ النافذة ══
  function openModalFor(poId){
    const p = findPO(poId);
    if(!p){ T("⚠ لم يُعثر على الطلب","warn"); return; }
    if(!canSettle(p)){ T("⚠ التسوية للمالية وقبل اكتمال السداد فقط","warn"); return; }
    const pay      = p.payment||{};
    const settled  = settledTotalOf(p);
    const baseTot  = baseOf(p);
    const curTot   = dueOf(p);
    const paidSoFar= paidSoFarOf(p);
    if(typeof showCustomModal!=='function'){ T("⚠ تعذّر فتح النافذة — حدّث الصفحة","warn"); return; }
    showCustomModal({
      title: "اعتماد المبلغ النهائي للسداد",
      body: `
        <div style="background:var(--surface2);border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12.5px">
          <div>إجمالي الطلب الأصلي: <b class="mono">${fmtA(baseTot)}</b> ر.س</div>
          ${settled!=null?`<div style="color:#0891b2;font-weight:700">المبلغ المعتمد حالياً: <b class="mono">${fmtA(settled)}</b> ر.س</div>`:""}
          <div style="color:#0a7c59">المسدَّد فعلاً: <b class="mono">${fmtA(paidSoFar)}</b> ر.س</div>
          <div style="color:#b45309;font-weight:800">المتبقّي حالياً: <b class="mono">${fmtA(Math.max(0,curTot-paidSoFar))}</b> ر.س</div>
        </div>
        <div style="font-size:11.5px;color:var(--muted);margin-bottom:4px">المبلغ النهائي واجب السداد (ر.س):</div>
        <input class="form-input" id="fs-amount" type="number" min="0.01" step="0.01" value="${paidSoFar>0?paidSoFar:curTot}" style="margin-bottom:4px">
        <div style="font-size:10.5px;color:var(--muted);margin-bottom:10px">اجعله مساوياً للمسدَّد لإقفال الطلب بلا متبقٍّ، أو أدخل المبلغ الصحيح ليُسدَّد الفرق. ويبقى الأصل ${fmtA(baseTot)} ر.س محفوظاً في السجل.</div>
        <div style="font-size:11.5px;color:var(--muted);margin-bottom:4px">سبب التعديل <b style="color:var(--danger)">(إلزامي)</b>:</div>
        <input class="form-input" id="fs-reason" placeholder="مثال: عرض سعر أقل من المورد بعد الإحالة للسداد" style="margin-bottom:8px">
        ${p.auditedBy?`<div style="font-size:10.5px;color:#b45309;font-weight:700;margin-bottom:8px">⚠ الطلب مُدقَّق من المستودع — المتبقّي يبقى محسوباً على فاتورة المورد الفعلية، ولن تعلوها هذه التسوية.</div>`:""}
        ${settled!=null?`<label style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--muted)"><input type="checkbox" id="fs-clear"> إلغاء التسوية والعودة إلى الإجمالي الأصلي (${fmtA(baseTot)} ر.س)</label>`:""}
      `,
      okText: "اعتماد المبلغ",
      onOk: function(){ return save(poId); }
    });
  }

  // ══ الحفظ ══
  async function save(poId){
    let p = findPO(poId);
    if(!p){ T("⚠ لم يُعثر على الطلب","warn"); return false; }
    if(!canSettle(p)){ T("⚠ التسوية للمالية وقبل اكتمال السداد فقط","warn"); return false; }

    // كلُّ قراءةٍ من النموذج قبل أيّ await — النافذةُ قد تُعاد بناؤها بعده
    const clearEl = document.getElementById("fs-clear");
    const doClear = !!(clearEl && clearEl.checked);
    const amtEl   = document.getElementById("fs-amount");
    const reason  = ((document.getElementById("fs-reason")||{}).value||"").trim();
    if(!reason){ T("⚠ اكتب سبب تعديل المبلغ — التسوية بلا سبب لا أثرَ لها","warn"); return false; }

    const baseTot   = baseOf(p);
    const prevTot   = dueOf(p);
    const paidSoFar = paidSoFarOf(p);

    let amount;
    if(doClear) amount = baseTot;
    else {
      amount = readAmount(amtEl ? amtEl.value : null);
      if(amount==null || !(amount>0)){ T("⚠ أدخل مبلغاً أكبر من صفر","warn"); return false; }
    }

    // المبلغُ دون المسدَّد يعني زيادةً تُستردّ — مسموحٌ بتأكيدٍ صريحٍ لا صدفةً
    if(amount < paidSoFar - 0.01){
      let okLess=false;
      try{
        okLess = await showConfirm({
          title:"المبلغ أقلّ من المسدَّد",
          msg:`المبلغ المعتمد (${fmtA(amount)} ر.س) أقلّ ممّا سُدِّد فعلاً (${fmtA(paidSoFar)} ر.س) بفارق ${fmtA(paidSoFar-amount)} ر.س.\n\nسيُسجَّل الفارق «زيادة تُستردّ» من المورد. هل تريد المتابعة؟`,
          icon:"⚠", okText:"اعتماد على أي حال", okClass:"btn-danger"
        });
      }catch(e){ okLess=false; }
      if(!okLess) return false;
    }

    { const _f = findPO(poId); if(_f) p = _f; }   // أحدثُ مرجعٍ بعد await
    const now = new Date().toISOString();
    const by  = userLabel();
    const oldStatus = p.status;

    const pay  = Object.assign({}, p.payment||{});
    const hist = Array.isArray(pay.settleLog) ? pay.settleLog.slice() : [];
    hist.push({ from: prevTot, to: amount, base: baseTot, reason: reason, by: by, at: now, cleared: doClear });
    pay.settleLog = hist;
    if(doClear){ delete pay.settledTotal; delete pay.settledBy; delete pay.settledAt; delete pay.settledReason; }
    else { pay.settledTotal = amount; pay.settledBy = by; pay.settledAt = now; pay.settledReason = reason; }
    p.payment = pay;
    /* التقاريرُ تقرأ actualCost للطلب غير المدقَّق — فلو بقي فارغاً لأعلنت الإنفاقَ
       بالإجمالي القديم بينما لم يُدفع إلّا المعتمَد. والتدقيقُ لاحقاً يعلوه. */
    if(!p.auditedBy){ if(doClear) delete p.actualCost; else p.actualCost = amount; }

    if(!Array.isArray(p.timeline)) p.timeline=[];
    p.timeline.push({
      event: doClear ? "أُلغيت تسوية المالية — عاد الإجمالي الأصلي" : "اعتماد المبلغ النهائي للسداد من المالية",
      code: "pending_finance", by: by, at: now, icon: "🧾",
      notes: fmtA(prevTot)+" ⇐ "+fmtA(amount)+" ر.س — "+reason
    });

    const out = settleOutcome(paidSoFar, dueOf(p));
    if(out.fullyPaid){
      pay.paid = true; pay.paidBy = by; pay.paidAt = now;
      p.status = "proc_executing";
      p.timeline.push({
        event: "اكتمل السداد بعد اعتماد المبلغ النهائي — إحالة لتنفيذ المشتريات",
        code: "proc_executing", by: by, at: now, icon: "💳",
        notes: "المسدَّد: "+fmtA(paidSoFar)+" ر.س — المعتمد: "+fmtA(dueOf(p))+" ر.س"+(out.excess>0.01?(" — فائض عن الإجمالي: "+fmtA(out.excess)+" ر.س"):"")
      });
    }
    p.updatedAt = now;

    if(typeof savePurchase!=='function' || !savePurchase(poId)) return false;
    try{
      logAudit(doClear?"طلب شراء — إلغاء تسوية المالية":"طلب شراء — اعتماد المبلغ النهائي للسداد",
        "رقم الطلب: "+poId+" — من "+prevTot.toFixed(2)+" إلى "+amount.toFixed(2)+" — السبب: "+reason+(out.fullyPaid?" — اكتمل السداد":""));
    }catch(e){}
    if(out.fullyPaid){
      try{ _sendPurchaseWorkflowNotif(p, oldStatus, "proc_executing"); }catch(e){}
      T("✅ اعتُمد المبلغ واكتمل السداد — أُحيل لتنفيذ المشتريات","success");
    } else {
      T(doClear?"↩ أُلغيت التسوية — عاد الإجمالي الأصلي":"✅ اعتُمد المبلغ النهائي للسداد","success");
    }

    try{
      const dm=document.getElementById("modal-purchase-detail");
      if(dm && dm.classList.contains("open")) openPurchaseDetail(poId);
    }catch(e){}
    try{ updatePurchaseBadge(); }catch(e){}
    try{ renderPurchases(); }catch(e){}
    return true;
  }

  // ══ التعريض ══
  window.financeSettlement = {
    canSettle: canSettle,
    open: openModalFor,
    save: save,
    build: MODULE_BUILD,
    // نقيّةٌ للاختبار بلا متصفّح
    _canSettleState: canSettleState,
    _settleOutcome: settleOutcome,
    _readAmount: readAmount
  };
  /* جسرا النطاق العام: سماتُ onclick تُقيَّم في النطاق العام، فاسمٌ يسقط منه =
     زرٌّ ميتٌ بصمت بلا خطأِ جافاسكربت يُنذر (CLAUDE.md §الاختبارات). */
  window.openFinanceSettleModal = function(poId){ try{ return openModalFor(poId); }catch(e){ console.warn("settle open error",e); } };
  window._poCanSettleFinance     = function(p){ try{ return canSettle(p); }catch(e){ return false; } };
})();
