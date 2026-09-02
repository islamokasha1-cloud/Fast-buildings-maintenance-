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

const MODULE_BUILD = "v18.9.2991";
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

/* التراكميُّ **حتى محضرٍ بعينه** — لا حتى الآن.
   ورقةُ المحضر تُوقَّع، فأرقامُها يجب أن تقف عند لحظتها: لو حُسب «المستلَم
   تراكمياً» و«المتبقي» من حالة الطلب الحاضرة، لتبدّلت أرقامُ محضرٍ وُقِّع أمسِ
   بمجرّد تسجيل محضرٍ ثانٍ اليوم — وورقةٌ تتغيّر بعد التوقيع ليست دليلاً. */
function svCumUpTo(receipts, idx){
  const list = Array.isArray(receipts) ? receipts.slice(0, Math.max(0, idx+1)) : [];
  return svCum(list);
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

      <div style="margin-top:12px">
        <div style="font-size:12px;font-weight:700;margin-bottom:4px">🏪 المورد الفعلي <span style="font-weight:400;color:var(--muted)">(من سلّم البضاعة فعلاً)</span></div>
        <input class="form-input" id="sv-vendor" placeholder="اكتب اسم المورد الذي سلّم فعلاً..." style="font-size:12px;width:100%">
        <div style="font-size:10.5px;color:var(--muted);margin-top:4px">
          مورد الطلب: <b>${_esc(p.vendor||"—")}</b>${p.vendor?`
          <button type="button" class="btn btn-ghost btn-sm" style="font-size:10px;padding:1px 7px;margin-inline-start:6px"
            onclick="supervisorReceipt._sameVendor()">هو نفسه ✓</button>`:""}
          — قد يورّد غيرُ المقترح في الطلب، والورقةُ تنسب التوريدَ لمن تكتبه هنا.
        </div>
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

/* «هو نفسه ✓» يملأ الحقلَ بمورد الطلب. ولمَ لا يُملأ سلفاً؟ لأنّ الحقلَ المعبَّأ
   يُمرَّر بلا قراءة، فيعود بنا إلى العيب نفسِه: ورقةٌ تنسب التوريدَ لمن لم يورّد
   لأنّ أحداً لم ينتبه. الملءُ بضغطةٍ **فعلٌ صريح** يُثبته صاحبُه. */
function _sameVendor(){
  const p=_po(_openPoId), inp=document.getElementById("sv-vendor");
  if(inp && p){ inp.value = p.vendor||""; inp.focus(); }
}

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
  const vendor=(document.getElementById("sv-vendor")?.value||"").trim();

  if(!typed.length && !force){ _toast("⚠ أدخل كميةً مستلمةً واحدةً على الأقل — أو علّم «تحويل رغم النقص»","warn"); return; }

  /* الصورُ واسمُ المورد اختياريان — بتنبيهٍ صريحٍ لا منع (قرار المالك في الصور،
     ويطّرد في المورد: قد يسلّم سائقٌ بلا ورقةٍ فلا يُعرف الاسمُ لحظتَها، ومنعُ
     الحفظ حينها يُضيّع المحضرَ كلَّه). **وتنبيهٌ واحدٌ يجمعهما** — نافذتان
     متتاليتان تُقرَآن نقراً لا قراءة، فيسقط أثرُ التنبيه أصلاً. */
  if(typed.length){
    const miss=[];
    if(!_files.length) miss.push("صورٌ للمستلَم");
    if(!vendor)        miss.push("اسمُ المورد الفعلي");
    if(miss.length){
      try{
        await showConfirm({ title:"محضرٌ ناقصُ التوثيق", icon:"📷",
          msg:"لم يُذكر في المحضر: "+miss.join(" و")+".\n\nوهما دليلُ ما وصل ومَن ورّده عند أي خلاف — والورقةُ تُوقَّع بما فيها. هل تريد الحفظ هكذا؟",
          okText:"حفظ رغم النقص", okClass:"btn-warning" });
      }catch(e){ return; }
    }
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
              by:_me(), at:now, notes, vendor, photos, items:taken };
  live.svReceipts.push(rec);
  if(!Array.isArray(live.timeline)) live.timeline=[];

  const takenStr=taken.map(t=>t.name+" ("+t.qty+" "+(t.unit||"")+")").join("، ");
  live.timeline.push({ event:"استلام ميداني — محضر المشرف "+rec.ref, code:"sv_receipt",
    by:rec.by, at:now, icon:"👷",
    notes:[takenStr, vendor?("المورد الفعلي: "+vendor):"⚠ بلا اسم مورد",
           photos.length?("صور: "+photos.length):"⚠ بلا صور", notes].filter(Boolean).join(" — ") });

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
/* اختلافُ المورد الفعلي عن مورد الطلب هو **الخبر** لا الاسمُ نفسُه: توريدٌ من
   غير المعتمَد يمسّ الفاتورةَ والسعرَ والضمان، فيُبرَز حيث يقع لا يُترك ليُقارَن
   بالعين. والمقارنةُ متساهلةٌ في الفراغات وحدَها — لا نُطبّع اسماً ولا نخمّن. */
function _vendorMismatch(r, poVendor){
  const a=String((r&&r.vendor)||"").trim(), b=String(poVendor||"").trim();
  return !!(a && b && a!==b);
}
function _vendorChip(r, poVendor){
  if(!r) return "";
  if(!r.vendor) return `<span style="color:#b45309;font-weight:700"> · ⚠ بلا اسم مورد</span>`;
  const diff=_vendorMismatch(r, poVendor);
  return ` · <span style="${diff?"background:#fef3c7;color:#92400e;border-radius:5px;padding:0 5px;font-weight:800":"color:var(--muted)"}">`
    +`🏪 ${_esc(r.vendor)}${diff?" ≠ مورد الطلب":""}</span>`;
}

function _recHtml(r, compact, poId, poVendor){
  const lines=(r.items||[]).map(t=>_esc(t.name)+" <b style='font-family:monospace'>"+t.qty+"</b> "+_esc(t.unit||"")).join(" · ");
  const thumbs=(r.photos||[]).map(ph=>`<a href="${_esc(ph.url)}" target="_blank"><img src="${_esc(ph.url)}" style="width:${compact?44:64}px;height:${compact?44:64}px;object-fit:cover;border-radius:6px;border:1px solid var(--border)"></a>`).join("");
  // زرُّ الوثيقة — في التفاصيل ونافذة التدقيق معاً (بطاقةٌ واحدةٌ تخدمهما)
  const prn = poId ? `<button class="btn btn-ghost btn-sm" style="font-size:10.5px;padding:2px 8px;float:inline-start"
      onclick="supervisorReceipt.printReceipt('${_esc(poId)}','${_esc(r.ref||"")}')">🖨 طباعة المحضر</button>` : "";
  return `<div style="border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-top:6px;background:var(--surface2)">
    <div style="font-size:11px">${prn}<b>👷 ${_esc(r.ref||"محضر")}</b> — ${_esc(r.by||"—")} · ${_esc(String(r.at||"").slice(0,10))}${_vendorChip(r, poVendor)}
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
    ${recs.length?recs.map(r=>_recHtml(r,false,p.id,p.vendor)).join(""):`<div style="font-size:11.5px;color:var(--muted)">لا محاضر بعد — بانتظار استلام المشرف للتوريد.</div>`}
  </div>`;
}

// شريط نافذة تدقيق المستودع — ما وثّقه الميدان أمام عين المدقّق
function auditHtml(p){
  const recs=(p&&p.svReceipts)||[];
  if(!recs.length) return "";
  return `<div style="margin-top:8px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 10px">
    <div style="font-size:11.5px;font-weight:800;color:#92400e">👷 استلام المشرف الميداني — ${recs.length} محضر (قارن به ما تدقّقه)</div>
    ${recs.map(r=>_recHtml(r,true,p&&p.id,p&&p.vendor)).join("")}
  </div>`;
}

// قسم الطباعة — أنماط مضمّنة (نافذة الطباعة مستند مستقل)
function printHtml(p){
  const recs=(p&&p.svReceipts)||[];
  if(!recs.length) return "";
  const rows=recs.map(r=>{
    const lines=(r.items||[]).map(t=>String(t.name||"")+" ("+t.qty+" "+(t.unit||"")+")").join("، ");
    const imgs=(r.photos||[]).map(ph=>`<img src="${String(ph.url||"")}" style="height:80px;border-radius:6px;border:1px solid #e2e8f0;margin:2px">`).join("");
    const vLine = r.vendor
      ? " · المورد الفعلي: "+String(r.vendor)+(_vendorMismatch(r,p&&p.vendor)?" (يخالف مورد الطلب)":"")
      : " · بلا اسم مورد";
    return `<div style="border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;margin-top:6px">
      <div style="font-size:10px"><b>${String(r.ref||"محضر")}</b> — ${String(r.by||"—")} · ${String(r.at||"").slice(0,10)}${vLine}${!(r.photos||[]).length?" · بلا صور":""}</div>
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

/* ════════════════════════════════════════════════════════════════════════
   وثيقةُ المحضر — الورقةُ التي تُوقَّع (طلب المالك 31/08)
   ────────────────────────────────────────────────────────────────────────
   المحضرُ كان يُطبع **فقرةً داخل ورقة طلب الشراء** وحدَها. لكنّ الاستلامَ
   الميدانيَّ حدثٌ قائمٌ بذاته: له مستلمٌ وتاريخٌ وكمياتٌ وصورٌ، ويُحتكم إليه
   عند الخلاف على النقص — فيحتاج **ورقةً يوقّعها من استلم** لا سطراً في مستندٍ
   عن شيءٍ آخر. وقبلها كان الإقرارُ بما وصل شفهياً، ثمّ يُنكَر.

   وثلاثةُ قراراتٍ تحكم الورقة:
   (١) **لقطةُ لحظتها لا حالةَ اليوم:** التراكميُّ والمتبقّي يُحسبان بـ`svCumUpTo`
       حتى هذا المحضر وحدَه. وإلّا تبدّلت أرقامُ ورقةٍ وُقّعت أمسِ بمجرّد تسجيل
       محضرٍ ثانٍ — والموقِّعُ يكون قد وقّع على غير ما تُظهره الورقة.
   (٢) **إقرارٌ منصوصٌ لا خانةُ توقيعٍ صامتة:** ما يوقّع عليه المستلمُ مكتوبٌ فوق
       توقيعه — أنّ هذه الكمياتِ وصلت الموقعَ فعلاً بحالتها المذكورة.
   (٣) **تُعلن حدَّها بصراحة:** سطرٌ يقول إنّ هذا توثيقٌ ميدانيٌّ لا حركةَ مخزون،
       وأنّ الرصيدَ يدخله سندُ استلام المستودع — فلا تُقرأ الورقةُ سنداً للمخزون.

   والورقةُ الرسمية (ترويسة/تذييل/علامة مائية) تُقرأ من `contracts` المعروضة، لا
   تُنسخ هندستُها هنا: مصدرٌ واحدٌ لهيئة أوراق الشركة. وغيابُ الوحدة لا يُعطّل
   الطباعة — تسقط الورقةُ الرسميةُ وحدَها إلى ترويسةٍ نصّية.
   ════════════════════════════════════════════════════════════════════════ */
function _lh(){
  try{
    const c=window.contracts;
    if(c && typeof c._letterheadAssets==="function"){
      const a=c._letterheadAssets();
      if(c._letterheadOn(a)) return { on:true, a, css:c._letterheadCSS, wrap:c._letterheadWrap, head:c._docHeadHTML };
    }
  }catch(e){}
  return { on:false };
}
function _projOf(p){
  try{ if(typeof _poMyTaskProjName==="function") return _poMyTaskProjName(p); }catch(e){}
  return (p&&(p.projectName||p.building))||"—";
}
function _dt(s){ return String(s||"").slice(0,16).replace("T"," ") || "—"; }

// نصُّ الوثيقة كاملاً — دالّةٌ تُعيد سلسلةً ليفحصها الاختبار بلا نافذة طباعة
function paperHTML(p, ref){
  if(!p) return "";
  const recs = Array.isArray(p.svReceipts)?p.svReceipts:[];
  const idx  = recs.findIndex(r=>r && String(r.ref)===String(ref));
  if(idx<0) return "";
  const rec  = recs[idx];

  // أرقامُ اللحظة: التراكميُّ حتى هذا المحضر، والسابقُ حتى الذي قبله
  const cumNow  = svCumUpTo(recs, idx);
  const cumPrev = svCumUpTo(recs, idx-1);
  const taken   = {};
  (rec.items||[]).forEach(t=>{ const i=parseInt(t&&t.idx); if(Number.isFinite(i)) taken[i]=(taken[i]||0)+(parseFloat(t.qty)||0); });

  const rows = svDeliverables(p.items).map(d=>{
    const now=cumNow[d.idx]||0, prev=cumPrev[d.idx]||0, nowQty=taken[d.idx]||0;
    return { ...d, prev, nowQty, cum:now, rem: Math.max(0, Math.round((d.req-now)*1000)/1000) };
  });
  const allDone = rows.length>0 && rows.every(r=>r.rem<=0.001);

  const lh=_lh();
  const body =
    (lh.on ? lh.head({ on:true, docNo:_esc(p.id)+" · "+_esc(rec.ref||""), subtitle:"محضر استلام ميداني" })
           : `<div class="header"><div><div class="company">شركة المباني السريعة للمقاولات</div>
                <div class="subtitle">محضر استلام ميداني</div></div>
                <div class="doc-no">${_esc(p.id)} · ${_esc(rec.ref||"")}</div></div>`)+

    `<div class="band ${allDone?"ok":"warn"}">${allDone?"اكتمل الاستلام الميدانيّ لكل بنود الطلب"
        :"استلامٌ جزئيّ — بقيت كمياتٌ لم تصل الموقع"}</div>`+

    `<h2>بيانات المحضر</h2><table class="kv">
      <tr><td>رقم طلب الشراء</td><td class="n">${_esc(p.id)}</td></tr>
      <tr><td>المشروع</td><td class="t">${_esc(_projOf(p))}</td></tr>
      <tr><td>الموقع / المبنى</td><td class="t">${_esc(p.building||"—")}</td></tr>
      <tr><td>المورد في الطلب</td><td class="t">${_esc(p.vendor||"—")}</td></tr>
      <tr><td>المورد الفعلي (أثبته المستلم)</td><td class="t">${
        rec.vendor ? _esc(rec.vendor)+(_vendorMismatch(rec,p.vendor)?' <b style="color:#92400e">— يخالف مورد الطلب</b>':"")
                   : '<span style="color:#92400e;font-weight:700">لم يُثبته المستلم</span>'}</td></tr>
      <tr><td>المستلم الميدانيّ</td><td class="t">${_esc(rec.by||"—")}</td></tr>
      <tr><td>تاريخ الاستلام</td><td class="n">${_esc(_dt(rec.at))}</td></tr>
      <tr><td>رقم المحضر</td><td class="n">${_esc(rec.ref||"—")}${recs.length>1?` (من ${recs.length} محاضر على الطلب)`:""}</td></tr>
    </table>`+

    `<h2>الكميات المستلمة في هذا المحضر</h2>
    <table><thead><tr>
      <th style="width:34px">#</th><th style="text-align:right">البند</th><th>الوحدة</th>
      <th>المطلوب</th><th>استُلم سابقاً</th><th>المستلَم الآن</th><th>المتبقّي</th>
    </tr></thead><tbody>${
      rows.length ? rows.map((r,i)=>`<tr>
        <td class="n">${i+1}</td>
        <td style="text-align:right">${_esc(r.name)}</td>
        <td class="n">${_esc(r.unit||"—")}</td>
        <td class="n">${r.req}</td>
        <td class="n">${r.prev||"—"}</td>
        <td class="n" style="font-weight:800">${r.nowQty||"—"}</td>
        <td class="n">${r.rem>0?r.rem:"—"}</td>
      </tr>`).join("")
      : `<tr><td colspan="7" style="text-align:center;color:#64748b">لا بنودَ توريدٍ في هذا الطلب</td></tr>`
    }</tbody></table>`+

    (rec.notes?`<h2>ملاحظات المستلم</h2><div class="notes">${_esc(rec.notes)}</div>`:"")+

    `<h2>صور الاستلام</h2>${
      (rec.photos||[]).length
        ? `<div class="shots">${(rec.photos||[]).map(ph=>`<img src="${_esc(ph.url)}" alt="">`).join("")}</div>`
        : `<div class="nophoto">⚠ لم تُرفَق صورٌ بهذا المحضر — التوثيقُ المصوَّر هو الدليلُ عند الخلاف على ما وصل.</div>`
    }`+

    `<div class="ack">أقرُّ بأنّ الكمياتِ المبيَّنة أعلاه وصلت موقعَ العمل فعلاً بتاريخه وبحالتها المذكورة،
      وأنّ ما لم يُذكَر استلامُه لم يصل. وهذا المحضر <b>توثيقٌ ميدانيّ</b> لا حركةَ مخزون؛
      ولا يدخل الرصيدَ إلا بسند استلام المستودع (GRN) عند التدقيق.</div>`+

    `<div class="sign">
      <div class="sg"><div class="sg-l">المستلم الميدانيّ (المشرف)</div>
        <div class="sg-n">${_esc(rec.by||"—")}</div>
        <div class="sg-d">${_esc(String(rec.at||"").slice(0,10))}</div><div class="sg-x">التوقيع</div></div>
      <div class="sg"><div class="sg-l">مسؤول المستودع</div>
        <div class="sg-n sg-w">يُستكمل عند التدقيق</div><div class="sg-x">التوقيع والتاريخ</div></div>
      <div class="sg"><div class="sg-l">مدير المشروع</div>
        <div class="sg-n sg-w">للاعتماد</div><div class="sg-x">التوقيع والتاريخ</div></div>
    </div>`+

    `<div class="foot">طُبع في ${_esc(_dt(new Date().toISOString()))} — بواسطة ${_esc(_me())} · ${_esc(p.id)} · ${_esc(rec.ref||"")}</div>`;

  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>محضر استلام ${_esc(p.id)} ${_esc(rec.ref||"")}</title><style>
*{box-sizing:border-box}
body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;margin:0;padding:26px;color:#111827;direction:rtl;font-size:13px;line-height:1.9}
.header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1b3a6b;padding-bottom:12px}
.company{font-size:18px;font-weight:800}.subtitle{font-size:13px;color:#1b3a6b;font-weight:700}
.doc-no{background:#eef2f7;color:#1b3a6b;border-radius:8px;padding:8px 14px;font-weight:800;font-family:monospace}
.band{margin-top:14px;border-radius:8px;padding:9px 13px;font-weight:800;font-size:13px;border:2px solid}
.band.ok{background:#ecfdf5;border-color:#059669;color:#065f46}
.band.warn{background:#fffbeb;border-color:#d97706;color:#92400e}
h2{font-size:15px;color:#1b3a6b;margin:20px 0 8px;border-bottom:1px solid #dde3ed;padding-bottom:5px;break-after:avoid;page-break-after:avoid}
table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12.5px}
th{background:#1b3a6b;color:#fff;padding:8px;font-weight:700}
td{padding:7px 8px;border-bottom:1px solid #e5e7eb;text-align:center}
tbody tr:nth-child(even){background:#f8fafc}
.n{font-family:monospace;font-weight:700}
.kv{width:100%;max-width:560px}.kv td{border-bottom:1px solid #eef2f7;text-align:right}
.kv td:first-child{width:170px;color:#64748b}
.kv .n,.kv .t{font-weight:700}
.notes{border:1px solid #dde3ed;border-radius:8px;padding:10px 13px;background:#f8fafc}
.shots{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.shots img{height:150px;border-radius:8px;border:1px solid #dde3ed;object-fit:cover}
.nophoto{border:1px dashed #d97706;border-radius:8px;padding:10px 13px;color:#92400e;background:#fffbeb}
.ack{margin-top:18px;border:1px solid #1b3a6b;border-radius:8px;padding:11px 14px;background:#f8fafc;font-size:12.5px;break-inside:avoid}
.sign{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-top:30px;break-inside:avoid}
.sg{border:1px solid #dde3ed;border-radius:8px;padding:10px;min-height:104px;text-align:center}
.sg-l{font-size:11px;color:#64748b;font-weight:700}
.sg-n{font-size:12.5px;font-weight:800;margin-top:4px}
.sg-w{color:#b45309;font-weight:700}
.sg-d{font-size:11px;color:#64748b;font-family:monospace}
.sg-x{margin-top:26px;border-top:1px solid #9ca3af;padding-top:5px;font-size:11px;color:#374151}
.foot{margin-top:22px;font-size:10.5px;color:#94a3b8;text-align:center;border-top:1px solid #e5e7eb;padding-top:8px}
@media print{body{padding:14px}@page{margin:14mm;size:A4}}
${lh.on?lh.css():""}
</style></head><body>${lh.on?lh.wrap(body, lh.a):body}</body></html>`;
}

function printReceipt(poId, ref){
  const p=_po(poId);
  if(!p){ _toast("⚠ لم يُعثر على الطلب","warn"); return false; }
  const html=paperHTML(p, ref);
  if(!html){ _toast("⚠ لم يُعثر على المحضر «"+ref+"» في هذا الطلب","warn"); return false; }
  let ok=false;
  try{ ok = (typeof _openPrintWindow==="function") ? _openPrintWindow(html) : false; }catch(e){ console.warn("sv print",e); }
  if(!ok){ _toast("⚠ تعذّر فتح نافذة الطباعة — تحقق من إعدادات المتصفح","warn"); return false; }
  try{ logAudit("طباعة محضر استلام ميداني", "الطلب: "+poId+" — "+ref); }catch(e){}
  return true;
}

/* ════════ الواجهة المعروضة ════════ */
window.supervisorReceipt = {
  open, close, save, directTransfer, canReceive,
  enabled:_enabled,
  sectionHtml, auditHtml, printHtml,
  printReceipt, paperHTML,
  _rmPhoto, _sameVendor,
  // نقية — لفحوص hail-tests
  _vendorMismatch,
  _deliverables:svDeliverables, _cum:svCum, _cumUpTo:svCumUpTo, _rows:svRows, _complete:svComplete,
  MODULE_BUILD
};
})();
