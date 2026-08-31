/* ═══════════════════════════════════════════════════════════════════════════
   supervisor-receipt.js — استلام المشرف الميداني لطلب الشراء (طلب المالك 30/08)

   ── المشكلة التي يعالجها ──
   بعد «تم الشراء» كان الطلب يقفز مباشرةً إلى استلام المستودع وتدقيقه، بينما
   البضاعة تصل **الموقع** أولاً ويستلمها المشرف الميداني — بلا أثرٍ في النظام:
   لا مَن استلم، ولا كم وصل، ولا صورة لما وصل. فإذا اختلف المستودع والمورد على
   النقص لم يوجد دليلٌ ميدانيٌّ يُحتكم إليه.

   ── المبدأ ──
   **التوثيق الميداني ليس حركة مخزون.** محضر المشرف يثبت ما وصل الموقعَ فعلاً
   (كمياتٍ وصوراً واسمَ مستلم)، أمّا الرصيد فلا يدخله إلا سند استلام المستودع
   (GRN) عند التدقيق كما كان — فلا ازدواج ولا كاتبَ ثانٍ للمخزون.

   ── القرار ──
   مرحلة `sv_receiving` بين تنفيذ المشتريات واستلام المستودع، يفعّلها/يعطّلها
   `supervisorReceiptEnabled` في وثيقة إعدادات المشتريات (الافتراضي: مفعّلة).
   المشرف يسجّل محاضر استلامٍ جزئيةً متراكمة (p.svReceipts[]) بصورٍ اختيارية
   (مع تنبيهٍ عند غيابها — قرار المالك)، وعند اكتمال الكميات — أو بتحويلٍ قسريٍّ
   مسبَّبٍ — ينتقل الطلب إلى `wh_receiving` ويأخذ المستودع دوره بلا أي تغيير.
   وللطلبات التي لا استلامَ ميدانياً لها (خدمات/طلبات إدارية) زرُّ «تحويل مباشر
   للمستودع» للمشتريات/الأدمن — تجاوزٌ موثَّقٌ في السجل لا تجاوزٌ صامت.

   ── الاستقلال ──
   IIFE يعرّض `window.supervisorReceipt` وحده، ويقرأ خدمات النواة بالاسم المجرّد
   (purchases · savePurchaseAwait · _poUploadFile · esc · toast · showConfirm ·
   logAudit · addNotification · renderPurchases). الدوال الحسابية نقيةٌ ومعروضة
   على الكائن ليفحصها hail-tests.js بلا متصفح.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
"use strict";

const MODULE_BUILD = "v18.9.2968";
const MAX_PHOTOS   = 6;
const MAX_PHOTO_MB = 10;

/* ════════ الدوال النقية (تُفحص بلا متصفح) ════════ */

// بنود الطلب التي تصل الموقع فعلاً: المشتراة كمياتها موجبة، وليست مغطاةً كاملاً
// من المخزون (تلك لا يورّدها مورّد أصلاً). الفهرس المطلق في p.items يبقى المرساة.
function svDeliverables(items){
  return (Array.isArray(items)?items:[])
    .map((it,idx)=>({ idx,
      name:(it&&it.itemName)||("بند "+(idx+1)),
      unit:(it&&it.unit)||"",
      req: Math.max(0, parseFloat(it&&it.qty)||0),
      covered: !!(it&&it._fullyCoveredByStock) }))
    .filter(r=>!r.covered && r.req>0)
    .map(({idx,name,unit,req})=>({idx,name,unit,req}));
}

// التراكمي المستلَم لكل فهرسٍ من كل المحاضر السابقة
function svCum(receipts){
  const m={};
  (Array.isArray(receipts)?receipts:[]).forEach(r=>{
    (r&&Array.isArray(r.items)?r.items:[]).forEach(x=>{
      const i=parseInt(x&&x.idx); const q=parseFloat(x&&x.qty)||0;
      if(Number.isFinite(i)&&q>0) m[i]=Math.round(((m[i]||0)+q)*1000)/1000;
    });
  });
  return m;
}

// صفوف نافذة الاستلام: المطلوب/المستلَم سابقاً/المتبقي لكل بند
function svRows(p){
  const cum=svCum(p&&p.svReceipts);
  return svDeliverables(p&&p.items).map(r=>{
    const c=cum[r.idx]||0;
    return { ...r, cum:c, rem: Math.max(0, Math.round((r.req-c)*1000)/1000) };
  });
}

// اكتمل الاستلام الميداني؟ (لا بنودَ للتوريد = لا اكتمال — تلك حالة التحويل المباشر)
function svComplete(p){
  const rows=svRows(p);
  return rows.length>0 && rows.every(r=>r.rem<=0.001);
}

/* ════════ قراءة خدمات النواة بأمان ════════ */
function _po(id){ try{ return (purchases||[]).find(x=>x.id===id)||null; }catch(e){ return null; } }
function _me(){ try{ return (currentUser&&currentUser.name)||"—"; }catch(e){ return "—"; } }
function _esc(s){ try{ return esc(s); }catch(e){ return String(s==null?"":s); } }
function _toast(m,t){ try{ toast(m,t); }catch(e){} }
function _enabled(){ return window.SUPERVISOR_RECEIPT_ENABLED !== false; }
function canReceive(){
  try{ return !!currentUser && (currentUser.role==="admin" || currentUser.role==="مشرف" || currentUser.role==="supervisor"); }
  catch(e){ return false; }
}

/* ════════ النافذة ════════ */
let _openPoId=null, _files=[];

function _modal(){
  let m=document.getElementById("modal-sv-receipt");
  if(!m){
    m=document.createElement("div");
    m.id="modal-sv-receipt";
    m.style.cssText="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5);align-items:center;justify-content:center;padding:14px";
    document.body.appendChild(m);
  }
  return m;
}
function close(){ const m=document.getElementById("modal-sv-receipt"); if(m) m.style.display="none"; _openPoId=null; _files=[]; }

function open(poId){
  if(!canReceive()){ _toast("⚠ استلام المواد من صلاحية المشرف أو المسؤول فقط","warn"); return; }
  const p=_po(poId);
  if(!p){ _toast("⚠ لم يُعثر على الطلب","warn"); return; }
  if(normalizePOStatus(p.status)!=="sv_receiving"){
    _toast("⚠ حالة الطلب «"+poStatusLabel(p.status)+"» — استلام المشرف لا يصحّ إلا في مرحلته","warn"); return;
  }
  _openPoId=poId; _files=[];
  const rows=svRows(p);
  const prevCnt=(p.svReceipts||[]).length;
  const rowsHtml = rows.length ? rows.map(r=>`
    <tr>
      <td style="padding:6px 8px;font-size:12px">${_esc(r.name)}</td>
      <td style="padding:6px 8px;text-align:center;font-size:12px;color:var(--muted)">${r.req} ${_esc(r.unit)}</td>
      <td style="padding:6px 8px;text-align:center;font-size:12px;${r.cum>0?"color:#0a7c59;font-weight:700":"color:var(--muted)"}">${r.cum}</td>
      <td style="padding:6px 8px;text-align:center">
        <input type="number" class="form-input sv-qty" data-idx="${r.idx}" min="0" max="${r.rem}" step="any" value="${r.rem}"
          style="width:80px;font-family:monospace;direction:ltr;text-align:center;font-size:12px${r.rem<=0?";opacity:.5":""}" ${r.rem<=0?"disabled":""}>
        <div style="font-size:9.5px;color:var(--muted)">المتبقي ${r.rem}</div>
      </td>
    </tr>`).join("")
    : `<tr><td colspan="4" style="padding:14px;text-align:center;color:var(--muted);font-size:12px">لا بنود توريدٍ في هذا الطلب — استخدم «تحويل مباشر للمستودع»</td></tr>`;

  const m=_modal();
  m.innerHTML=`
    <div style="background:var(--surface,#fff);border-radius:12px;width:100%;max-width:640px;max-height:92vh;overflow-y:auto;direction:rtl;padding:20px">
      <div style="font-size:15px;font-weight:800;margin-bottom:4px">👷 محضر استلام المشرف — ${_esc(poId)}</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:12px">
        طالب المواد: <b>${_esc(p.supervisor||"—")}</b>${p.receivingSupervisor?` · المشرف المستلم: <b>${_esc(p.receivingSupervisor)}</b>`:""}${prevCnt?` · محاضر سابقة: ${prevCnt}`:""}
        — التوثيق ميدانيٌّ فقط؛ الرصيد يدخله المستودع عند التدقيق.
      </div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;border:1px solid var(--border);border-radius:8px;overflow:hidden">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:6px 8px;text-align:right;font-size:11px">البند</th>
          <th style="padding:6px 8px;text-align:center;font-size:11px">المطلوب</th>
          <th style="padding:6px 8px;text-align:center;font-size:11px">استُلم سابقاً</th>
          <th style="padding:6px 8px;text-align:center;font-size:11px">المستلَم الآن</th>
        </tr></thead><tbody>${rowsHtml}</tbody></table></div>

      <div style="margin-top:12px">
        <div style="font-size:12px;font-weight:700;margin-bottom:4px">📷 صور الاستلام <span style="font-weight:400;color:var(--muted)">(حتى ${MAX_PHOTOS} — يُستحسن توثيق ما وصل)</span></div>
        <input type="file" id="sv-photos" accept="image/*" multiple style="font-size:12px">
        <div id="sv-photo-previews" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"></div>
      </div>

      <div style="margin-top:10px">
        <input class="form-input" id="sv-notes" placeholder="ملاحظات الاستلام (حالة البضاعة، نواقص، أضرار...)" style="font-size:12px;width:100%">
      </div>

      <label id="sv-force-row" style="display:${rows.some(r=>r.rem>0)?"flex":"none"};align-items:flex-start;gap:8px;margin-top:12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:8px 10px;cursor:pointer">
        <input type="checkbox" id="sv-force" style="margin-top:2px">
        <span style="font-size:11.5px;color:#9a3412">تحويل الطلب للمستودع رغم النقص (لن يصل المتبقي) — اذكر السبب:
          <input class="form-input" id="sv-force-reason" placeholder="سبب التحويل بنقص..." style="font-size:11px;margin-top:4px;width:100%" onclick="event.preventDefault()">
        </span>
      </label>

      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
        <button class="btn btn-ghost" onclick="supervisorReceipt.close()">إلغاء</button>
        <button class="btn btn-primary" id="sv-save-btn" onclick="supervisorReceipt.save()">💾 حفظ محضر الاستلام</button>
      </div>
    </div>`;
  m.style.display="flex";

  const fi=document.getElementById("sv-photos");
  if(fi) fi.onchange=()=>{
    const picked=Array.from(fi.files||[]);
    fi.value="";
    for(const f of picked){
      if(_files.length>=MAX_PHOTOS){ _toast("⚠ الحد الأقصى "+MAX_PHOTOS+" صور للمحضر الواحد","warn"); break; }
      if(!/^image\//.test(f.type||"")){ _toast("⚠ صور فقط","warn"); continue; }
      if(f.size>MAX_PHOTO_MB*1024*1024){ _toast("⚠ حجم الصورة يتجاوز "+MAX_PHOTO_MB+" MB","warn"); continue; }
      _files.push(f);
    }
    _renderPreviews();
  };
}

function _renderPreviews(){
  const box=document.getElementById("sv-photo-previews");
  if(!box) return;
  box.innerHTML=_files.map((f,i)=>`
    <span style="position:relative;display:inline-block">
      <img src="${URL.createObjectURL(f)}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border)">
      <button onclick="supervisorReceipt._rmPhoto(${i})" style="position:absolute;top:-6px;inset-inline-start:-6px;background:var(--danger,#dc2626);color:#fff;border:0;border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer;line-height:1">×</button>
    </span>`).join("");
}
function _rmPhoto(i){ _files.splice(i,1); _renderPreviews(); }

/* ════════ الحفظ ════════ */
async function save(){
  const poId=_openPoId;
  const p=_po(poId);
  if(!p){ _toast("⚠ لم يُعثر على الطلب","warn"); return; }
  if(!canReceive()){ _toast("⚠ صلاحية غير كافية","warn"); return; }

  // حالة طازجة — لا محضرَ على طلبٍ حُوِّل أو أُرجع في الأثناء
  let fresh=null;
  try{ if(typeof _poFreshStatus==="function") fresh=await _poFreshStatus(poId); }catch(e){}
  const st=fresh||normalizePOStatus(p.status);
  if(st!=="sv_receiving"){ _toast("⚠ حالة الطلب الآن «"+poStatusLabel(st)+"» — لم يُحفظ المحضر","warn"); close(); try{renderPurchases();}catch(e){} return; }

  // كمياتُ الإدخال الخام — القصُّ لسقف المتبقي يقع لاحقاً على النسخة الحيّة
  // (بعد كل await قد يكون مستمعُ اللقطات استبدل كائنَ الطلب في purchases)
  const typed=[];
  document.querySelectorAll("#modal-sv-receipt .sv-qty").forEach(inp=>{
    const idx=parseInt(inp.dataset.idx);
    const q=parseFloat(inp.value)||0;
    if(Number.isFinite(idx)&&q>0) typed.push({ idx, qty:q });
  });

  const force=!!document.getElementById("sv-force")?.checked;
  const forceReason=(document.getElementById("sv-force-reason")?.value||"").trim();
  const notes=(document.getElementById("sv-notes")?.value||"").trim();

  if(!typed.length && !force){ _toast("⚠ أدخل كميةً مستلمةً واحدةً على الأقل — أو علّم «تحويل رغم النقص»","warn"); return; }

  // الصور اختيارية — مع تنبيه (قرار المالك): تأكيدٌ صريح لا منع
  if(!_files.length && typed.length){
    try{
      await showConfirm({ title:"استلام بلا صور", icon:"📷",
        msg:"لم تُرفَق أي صورة للمحضر. الصورُ دليلُ ما وصل الموقعَ فعلاً عند أي خلاف — هل تريد الحفظ بدونها؟",
        okText:"حفظ بلا صور", okClass:"btn-warning" });
    }catch(e){ return; }
  }

  const btn=document.getElementById("sv-save-btn");
  if(btn){ btn.disabled=true; btn.textContent="⏳ جارٍ الحفظ..."; }
  const _fail=(msg)=>{ if(btn){btn.disabled=false;btn.textContent="💾 حفظ محضر الاستلام";} _toast(msg,"warn"); };

  // رفع الصور — فشلُ صورةٍ يوقف الحفظ (محضرٌ بلا صوره المقصودة نصفُ دليل)
  const photos=[];
  for(const f of _files){
    try{
      const up=await _poUploadFile(poId, f, "sv_receipt");
      if(up) photos.push({ url:up.url, storagePath:up.storagePath, name:up.name||"" });
    }catch(e){ console.warn("sv photo upload",e); _fail("⚠ فشل رفع صورة — لم يُحفظ المحضر، حاول مجدداً"); return; }
  }

  /* النسخةُ الحيّة بعد كل الانتظارات — الرفعُ والتأكيدُ awaits قد يستبدل مستمعُ
     اللقطات خلالها كائنَ الطلب في purchases، وsavePurchaseAwait تكتب ما تجده
     هناك: الكتابةُ على المرجع القديم كانت ستضيع بصمت. */
  const live=_po(poId)||p;
  const rows=svRows(live);
  const taken=[];
  typed.forEach(t=>{
    const row=rows.find(r=>r.idx===t.idx);
    if(!row||row.rem<=0) return;
    const q=Math.min(t.qty,row.rem);               // لا استلامَ فوق المتبقي
    if(q>0) taken.push({ idx:t.idx, name:row.name, unit:row.unit, qty:Math.round(q*1000)/1000 });
  });
  if(!taken.length && !force){ _fail("⚠ لا متبقٍّ للاستلام في هذه البنود — حدّث الشاشة"); return; }

  const now=new Date().toISOString();
  if(!Array.isArray(live.svReceipts)) live.svReceipts=[];
  const rec={ ref:"SVR-"+String(live.svReceipts.length+1).padStart(2,"0"),
              by:_me(), at:now, notes, photos, items:taken };
  live.svReceipts.push(rec);
  if(!Array.isArray(live.timeline)) live.timeline=[];

  const takenStr=taken.map(t=>t.name+" ("+t.qty+" "+(t.unit||"")+")").join("، ");
  live.timeline.push({ event:"استلام ميداني — محضر المشرف "+rec.ref, code:"sv_receipt",
    by:rec.by, at:now, icon:"👷",
    notes:[takenStr, photos.length?("صور: "+photos.length):"⚠ بلا صور", notes].filter(Boolean).join(" — ") });

  const complete=svComplete(live);
  const moved=complete||force;
  if(moved){
    live.status="wh_receiving";
    live.timeline.push({ event: complete ? "اكتمل استلام المشرف — أُحيل للمستودع للتدقيق"
                                         : "حُوِّل للمستودع رغم النقص — بقرار المشرف",
      code:"wh_receiving", by:rec.by, at:now, icon:"🚚",
      notes: complete ? "" : ("السبب: "+(forceReason||"—")) });
  }
  live.updatedAt=now;

  const ok=await savePurchaseAwait(poId);
  if(!ok){
    // تراجعٌ محلي — لا محضرَ في الذاكرة لم يصل القاعدة
    live.svReceipts.pop(); live.timeline.pop(); if(moved){ live.timeline.pop(); live.status="sv_receiving"; }
    _fail("⚠ تعذّر حفظ المحضر — تحقق من الاتصال وأعد المحاولة"); return;
  }

  try{ logAudit("استلام ميداني — محضر مشرف", "الطلب: "+poId+" — "+rec.ref+" — "+(takenStr||"بلا كميات")+(photos.length?" — صور: "+photos.length:"")); }catch(e){}
  try{
    if(moved) _sendPurchaseWorkflowNotif(live, "sv_receiving", "wh_receiving");
    else addNotification("استلام ميداني جزئي 👷", poId+" — "+rec.ref+" — "+takenStr+" — بانتظار بقية التوريد", poId, "purchase");
  }catch(e){}
  close();
  try{ renderPurchases(); updatePurchaseBadge(); }catch(e){}
  _toast(moved ? "✅ حُفظ المحضر وأُحيل الطلب للمستودع للتدقيق" : "✅ حُفظ محضر الاستلام الجزئي","success");
}

/* ════════ تحويل مباشر للمستودع — طلبٌ لا استلامَ ميدانياً له (قرار المالك) ════════ */
async function directTransfer(poId){
  let isAllowed=false;
  try{ isAllowed=isProcurementOfficer()||isAdmin(); }catch(e){}
  if(!isAllowed){ _toast("⚠ التحويل المباشر لمسؤول المشتريات أو الأدمن فقط","warn"); return; }
  const p=_po(poId);
  if(!p){ _toast("⚠ لم يُعثر على الطلب","warn"); return; }
  let fresh=null;
  try{ if(typeof _poFreshStatus==="function") fresh=await _poFreshStatus(poId); }catch(e){}
  const st=fresh||normalizePOStatus(p.status);
  if(st!=="sv_receiving"){ _toast("⚠ حالة الطلب «"+poStatusLabel(st)+"» — التحويل المباشر من مرحلة استلام المشرف فقط","warn"); return; }
  try{
    await showConfirm({ title:"تحويل مباشر للمستودع", icon:"🏭",
      msg:"سيتخطى الطلب "+poId+" مرحلةَ استلام المشرف الميداني وينتقل مباشرةً لاستلام المستودع وتدقيقه.\n\nيصلح هذا للخدمات والطلبات الإدارية التي لا توريدَ ميدانياً لها — ويُقيَّد التجاوز باسمك في السجل.",
      okText:"تحويل للمستودع", okClass:"btn-warning" });
  }catch(e){ return; }
  const now=new Date().toISOString();
  const live=_po(poId)||p;   // النسخة الحيّة بعد awaits — كالحفظ تماماً
  live.status="wh_receiving";
  if(!Array.isArray(live.timeline)) live.timeline=[];
  live.timeline.push({ event:"تحويل مباشر للمستودع — بلا استلامٍ ميداني", code:"wh_receiving",
    by:_me(), at:now, icon:"🏭", notes:"طلبٌ لا استلامَ ميدانياً له (خدمة/إداري) — تجاوزُ مرحلة المشرف موثَّق" });
  live.updatedAt=now;
  const ok=await savePurchaseAwait(poId);
  if(!ok){ live.timeline.pop(); live.status="sv_receiving"; _toast("⚠ تعذّر الحفظ — حاول مجدداً","warn"); return; }
  try{ logAudit("تحويل مباشر للمستودع", "الطلب: "+poId+" — تجاوز استلام المشرف (بلا توريد ميداني)"); }catch(e){}
  try{ _sendPurchaseWorkflowNotif(live, "sv_receiving", "wh_receiving"); }catch(e){}
  try{ renderPurchases(); updatePurchaseBadge(); closeModal("modal-purchase-detail"); }catch(e){}
  _toast("✅ حُوِّل الطلب لاستلام المستودع","success");
}

/* ════════ العرض: تفاصيل الطلب · نافذة التدقيق · الطباعة ════════ */
function _recHtml(r, compact){
  const lines=(r.items||[]).map(t=>_esc(t.name)+" <b style='font-family:monospace'>"+t.qty+"</b> "+_esc(t.unit||"")).join(" · ");
  const thumbs=(r.photos||[]).map(ph=>`<a href="${_esc(ph.url)}" target="_blank"><img src="${_esc(ph.url)}" style="width:${compact?44:64}px;height:${compact?44:64}px;object-fit:cover;border-radius:6px;border:1px solid var(--border)"></a>`).join("");
  return `<div style="border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-top:6px;background:var(--surface2)">
    <div style="font-size:11px"><b>👷 ${_esc(r.ref||"محضر")}</b> — ${_esc(r.by||"—")} · ${_esc(String(r.at||"").slice(0,10))}
      ${!(r.photos||[]).length?'<span style="color:#b45309;font-weight:700"> · ⚠ بلا صور</span>':""}</div>
    ${lines?`<div style="font-size:11px;margin-top:3px">${lines}</div>`:""}
    ${r.notes?`<div style="font-size:10.5px;color:var(--muted);margin-top:3px">${_esc(r.notes)}</div>`:""}
    ${thumbs?`<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px">${thumbs}</div>`:""}
  </div>`;
}

// قسم تفاصيل الطلب — يظهر متى وُجدت محاضر أو كان الطلب في مرحلة المشرف
function sectionHtml(p){
  if(!p) return "";
  const recs=p.svReceipts||[];
  const atStage=normalizePOStatus(p.status)==="sv_receiving";
  if(!recs.length && !atStage) return "";
  const rows=svRows(p);
  const done=rows.filter(r=>r.rem<=0.001).length;
  const progress=rows.length?`<span style="font-size:10.5px;background:${done===rows.length?"#dcfce7;color:#166534":"#fef3c7;color:#92400e"};border-radius:6px;padding:2px 8px;font-weight:700">${done}/${rows.length} بند مكتمل الاستلام</span>`:"";
  return `<div class="d-sec" style="margin-top:14px">
    <div class="d-sec-label">استلام المشرف الميداني (${recs.length} محضر) ${progress}</div>
    ${recs.length?recs.map(r=>_recHtml(r,false)).join(""):`<div style="font-size:11.5px;color:var(--muted)">لا محاضر بعد — بانتظار استلام المشرف للتوريد.</div>`}
  </div>`;
}

// شريط نافذة تدقيق المستودع — ما وثّقه الميدان أمام عين المدقّق
function auditHtml(p){
  const recs=(p&&p.svReceipts)||[];
  if(!recs.length) return "";
  return `<div style="margin-top:8px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 10px">
    <div style="font-size:11.5px;font-weight:800;color:#92400e">👷 استلام المشرف الميداني — ${recs.length} محضر (قارن به ما تدقّقه)</div>
    ${recs.map(r=>_recHtml(r,true)).join("")}
  </div>`;
}

// قسم الطباعة — أنماط مضمّنة (نافذة الطباعة مستند مستقل)
function printHtml(p){
  const recs=(p&&p.svReceipts)||[];
  if(!recs.length) return "";
  const rows=recs.map(r=>{
    const lines=(r.items||[]).map(t=>String(t.name||"")+" ("+t.qty+" "+(t.unit||"")+")").join("، ");
    const imgs=(r.photos||[]).map(ph=>`<img src="${String(ph.url||"")}" style="height:80px;border-radius:6px;border:1px solid #e2e8f0;margin:2px">`).join("");
    return `<div style="border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;margin-top:6px">
      <div style="font-size:10px"><b>${String(r.ref||"محضر")}</b> — ${String(r.by||"—")} · ${String(r.at||"").slice(0,10)}${!(r.photos||[]).length?" · بلا صور":""}</div>
      ${lines?`<div style="font-size:10px;margin-top:2px">${lines}</div>`:""}
      ${r.notes?`<div style="font-size:9px;color:#64748b;margin-top:2px">${String(r.notes)}</div>`:""}
      ${imgs?`<div style="margin-top:4px">${imgs}</div>`:""}
    </div>`;
  }).join("");
  return `<div style="margin-top:14px">
    <div style="font-size:12px;font-weight:800;color:#92400e;border-bottom:2px solid #e2e8f0;padding-bottom:3px">👷 استلام المشرف الميداني (${recs.length} محضر)</div>
    ${rows}
  </div>`;
}

/* ════════ الواجهة المعروضة ════════ */
window.supervisorReceipt = {
  open, close, save, directTransfer, canReceive,
  enabled:_enabled,
  sectionHtml, auditHtml, printHtml,
  _rmPhoto,
  // نقية — لفحوص hail-tests
  _deliverables:svDeliverables, _cum:svCum, _rows:svRows, _complete:svComplete,
  MODULE_BUILD
};
})();
