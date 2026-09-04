/* ═══════════════════════════════════════════════════════════════════════════
   ppm-schedule-repair.js — إعادةُ المواعيد المُستهلَكة قبل أوانها إلى مكانها

   ── المشكلة التي يعالجها (بلاغ المالك 02/09) ──
   كان التوليدُ التلقائيُّ لبلاغات PPM يقع **قبل الاستحقاق بثلاثة أيام**، ويُقدّم
   جدولَ الخطة في اللحظة نفسِها. فخطةٌ موعدُها ٥ سبتمبر وُلِّد بلاغُها يوم ٢،
   وفي اللحظة نفسِها استُهلك موعدُ ٥ سبتمبر وقفزت الخطةُ إلى الدورة التالية
   (وإن كان لها موعدٌ ثانٍ مختارٌ استُهلك ومُحي). فبقي على الفنيّ عملٌ يوم ٥،
   والخطةُ تقول «بعد ٩٤ يوماً». أُصلح المنطقُ في `index.html` (التقديمُ صار
   ببلوغ الموعد لا بتوليد بلاغه)، لكنّ **الخططَ التي قفزت بالفعل بقيت قافزة**:
   الإصلاحُ يمنع التكرار ولا يعيد كتابة الماضي.

   ── المبدأ: البلاغُ هو الشاهد، لا التخمين ──
   كلُّ بلاغٍ وقائيٍّ يحمل `scheduledFor` — موعدَ الخطة الحقيقيَّ لحظةَ توليده،
   يُلتقط **قبل** أيّ تقديم. فالموعدُ الضائع ليس مفقوداً: هو مكتوبٌ في البلاغ
   الذي وُلِّد لأجله. ولذلك لا تُصلح هذه الأداةُ خطةً إلا ولها **بلاغٌ مفتوحٌ**
   يشهد بموعدٍ أقدمَ من استحقاقها الحالي — أي التزامٌ قائمٌ لم يُنفَّذ بعدُ
   وقد سقط من الجدول. ولا تُصلح خطةً لا شاهدَ لها: **بلا شاهدٍ لا إصلاح.**

   ── وكيف يُعرف الموعدُ الثاني الممحوّ من موعدٍ لم يوجد أصلاً ──
   بعكس الحساب لا بالتخمين: لو كان التقديمُ دورةً عاديةً لكان الاستحقاقُ الحاليُّ
   = الموعدُ الشاهد + طولُ الدورة (بنفس حساب `ppmNextDue` ولحاقِه). فإن طابق،
   فالخطةُ لم يكن لها موعدٌ ثانٍ ولا يُخترع لها واحد. وإن خالف، فالقيمةُ الحاليةُ
   هي الموعدُ الثاني المستهلَك بعينه — تُعاد إلى مكانها. **ولا تُخترع بياناتٌ
   لا شاهدَ عليها**: خطةٌ لا يُفسَّر استحقاقُها بأيٍّ من الوجهين تُترك وتُعلَن.

   ── الاستقلال ──
   نمط IIFE يعرّض `window.ppmScheduleRepair` وحدَه. ودالّةُ الفحص `audit` **نقيّةٌ
   تماماً**: تأخذ الخططَ والبلاغاتِ واليومَ وخريطةَ الدورات، ولا تقرأ عالماً ولا
   تكتب شيئاً — فيفحصها `hail-tests.js` بلا متصفّح. والكتابةُ في `apply` وحدَها،
   وهي أداةُ **مرّةٍ واحدة**: بعد تشغيلها لا يبقى ما تُصلحه فتُعلن ذلك.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
"use strict";

const MODULE_BUILD = "v18.9.3037";
const MODAL_ID = "modal-ppm-schedule-repair";

/* ════════ حسابُ اليوم — بلا مُعدِّلات Date (درس v18.9vt) ════════ */
function _dayMs(v){
  if(!v) return NaN;
  const d = new Date(v);
  if(!isFinite(+d)) return NaN;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function _todayMs(){
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
}

/* التقديمُ العاديُّ لدورةٍ واحدة — نسخةٌ من حساب `ppmNextDue` بمرساةٍ صريحة.
   (يحرس `hail-tests` تطابقَها مع دالّة النواة: اختلافُهما يعني إصلاحاً يكذب.) */
function _expectedNext(fromISO, freqDays, todayMs){
  const base = new Date(fromISO);
  if(!isFinite(+base)) return NaN;
  const days = Number(freqDays) || 30;
  let next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, 12, 0, 0);
  let guard = 0;
  while(next.getTime() <= todayMs && guard++ < 400){
    next = new Date(next.getFullYear(), next.getMonth(), next.getDate() + days, 12, 0, 0);
  }
  return _dayMs(next);
}

/* ════════════════════════════════════════════════════════════════
   الفحص — دالّةٌ نقيّةٌ لا تكتب شيئاً
   ترجع { repairs, unexplained, intact } :
     repairs     خططٌ قفزت فوق التزامٍ قائم، ولكلٍّ منها القيمُ المقترحة
     unexplained خططٌ قفزت ولا يُفسَّر استحقاقُها الحالي — تُعلَن ولا تُمَسّ
     intact      عددُ الخطط السليمة
   ════════════════════════════════════════════════════════════════ */
function audit(planList, ticketList, todayMs, freqMap){
  const plans   = Array.isArray(planList)   ? planList   : [];
  const tickets = Array.isArray(ticketList) ? ticketList : [];
  const today   = Number.isFinite(todayMs) ? todayMs : _todayMs();
  const FREQ    = freqMap || {};
  const repairs = [], unexplained = [];
  let intact = 0;

  plans.forEach(p => {
    if(!p || !p.id || p.disabled){ return; }
    const curMs = _dayMs(p.nextDueDate);
    if(!Number.isFinite(curMs)){ return; }

    // الشاهد: أقدمُ بلاغٍ **مفتوحٍ** لهذه الخطة — التزامٌ قائمٌ لم يُنفَّذ بعد
    let witness = null, witMs = Infinity;
    for(const t of tickets){
      if(!t || t.ppmId !== p.id || t.status === "مغلق") continue;
      const ms = _dayMs(t.scheduledFor);
      if(!Number.isFinite(ms) || ms >= witMs) continue;
      witMs = ms; witness = t;
    }
    if(!witness){ intact++; return; }            // بلا شاهدٍ لا إصلاح
    if(curMs <= witMs){ intact++; return; }      // لم تقفز فوق التزامها

    // قفزت. أهو تقديمُ دورةٍ عاديّ أم موعدٌ ثانٍ استُهلك؟
    const days = FREQ[p.freq] || 30;
    const ordinary = _expectedNext(witness.scheduledFor, days, today);
    const usedSecond = (curMs !== ordinary);

    // موعدٌ ثانٍ محفوظٌ أصلاً يعني أنّ القفزة لم تستهلكه — فلا يُستبدل
    const hasSecond = Number.isFinite(_dayMs(p.secondDueDate));
    if(usedSecond && hasSecond){
      unexplained.push({ id:p.id, name:p.name||"", from:p.nextDueDate,
        witness:witness.scheduledFor, ticketId:witness.id||"",
        why:"الاستحقاقُ الحاليُّ لا يطابق دورةً عاديةً والموعدُ الثاني محفوظٌ أصلاً" });
      return;
    }

    repairs.push({
      id: p.id, name: p.name||"", freq: p.freq||"", building: p.building||"",
      from: p.nextDueDate, to: witness.scheduledFor,
      secondFrom: p.secondDueDate || null,
      secondTo: usedSecond ? p.nextDueDate : (p.secondDueDate || null),
      restoredSecond: usedSecond,
      ticketId: witness.id || "", ticketStatus: witness.status || ""
    });
  });

  return { repairs, unexplained, intact };
}

/* ════════ قراءةُ خدمات النواة بالاسم المجرَّد وقتَ التشغيل ════════
   **لا يكفي `window[name]`**: حالةُ النواة معلَنةٌ بـ`let`/`const` في أعلى النصّ
   (`let ppmPlans` · `let tickets` · `let currentUser` · `const PPM_FREQ_DAYS`)،
   والإعلانُ المُعجميُّ في النطاق العام **لا يُنشئ خاصيةً على `window`**. فقراءةُ
   `window.ppmPlans` تُرجع `undefined` فتظنّ الأداةُ أن لا خطط، فلا بطاقةَ ولا
   إصلاح — عطلٌ صامتٌ بلا خطأٍ واحدٍ في وحدة التحكّم. (كشفه الفحصُ الحيّ لا
   المراجعة.) و`new Function` يُقيَّم جسمُه في **النطاق العام** فيرى السجلَّ
   المُعجميَّ كذلك؛ ودوالُّ النواة (`savePPMDoc`…) تبقى على `window` فتُقرأ منه أولاً. */
const _lex = (()=>{ const cache = Object.create(null);
  return n => {
    if(!(n in cache)){
      try{ cache[n] = new Function("try{return typeof "+n+"==='undefined'?null:"+n+"}catch(e){return null}"); }
      catch(e){ cache[n] = () => null; }
    }
    try{ return cache[n](); }catch(e){ return null; }
  };
})();
const _g = n => {
  if(typeof window !== "undefined" && window[n] != null) return window[n];
  return _lex(n);
};
const _esc = s => { const f=_g("esc"); return f ? f(String(s==null?"":s)) : String(s==null?"":s); };
const _toast = (m,k) => { const f=_g("toast"); if(f) f(m,k); };
const _fmt = v => { const f=_g("fmtDateOnly"); return f ? f(v) : String(v||"—"); };
const _isAdmin = () => { const u=_g("currentUser"); return !!(u && u.role === "admin"); };

function _currentAudit(){
  return audit(_g("ppmPlans")||[], _g("tickets")||[], _todayMs(), _g("PPM_FREQ_DAYS")||{});
}

/* ════════ الشاشة ════════ */
function _ensureModal(){
  let el = document.getElementById(MODAL_ID);
  if(el) return el;
  el = document.createElement("div");
  el.className = "modal-overlay";
  el.id = MODAL_ID;
  el.style.display = "none";
  el.innerHTML = `
    <div class="modal" style="max-width:820px">
      <div class="modal-header">
        <div class="modal-title">🗓️ إصلاح مواعيد خطط الصيانة</div>
        <button class="modal-close" onclick="ppmScheduleRepair.close()">✕</button>
      </div>
      <div class="modal-body" id="${MODAL_ID}-body"></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="ppmScheduleRepair.close()">إغلاق</button>
        <button class="btn btn-primary" id="${MODAL_ID}-apply" onclick="ppmScheduleRepair.apply()">✅ تطبيق الإصلاح</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  return el;
}

function _row(r){
  return `<tr>
    <td style="padding:6px 8px;font-weight:700">${_esc(r.name)}<div style="font-size:10px;color:var(--muted);font-weight:400">${_esc(r.building)}${r.freq?" • "+_esc(r.freq):""}</div></td>
    <td style="padding:6px 8px;color:var(--danger);text-decoration:line-through;white-space:nowrap">${_esc(_fmt(r.from))}</td>
    <td style="padding:6px 8px;color:var(--accent);font-weight:700;white-space:nowrap">${_esc(_fmt(r.to))}</td>
    <td style="padding:6px 8px;white-space:nowrap">${r.restoredSecond?`<span style="color:var(--info)">↩︎ ${_esc(_fmt(r.secondTo))}</span>`:`<span style="color:var(--muted)">—</span>`}</td>
    <td style="padding:6px 8px;font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--info);white-space:nowrap">${_esc(r.ticketId)}</td>
  </tr>`;
}

function render(){
  const box = document.getElementById(MODAL_ID+"-body");
  if(!box) return;
  const a = _currentAudit();
  const btn = document.getElementById(MODAL_ID+"-apply");
  if(btn) btn.style.display = a.repairs.length ? "" : "none";

  const head = `<div style="font-size:12px;color:var(--muted);line-height:1.8;margin-bottom:12px">
      الأداةُ تُعيد إلى الخطة موعداً <b>استُهلك قبل أوانه</b> — والشاهدُ عليه بلاغٌ
      وقائيٌّ <b>ما زال مفتوحاً</b> يحمل ذلك الموعد في «الاستحقاق المخطط».
      الخططُ التي لا شاهدَ لها لا تُمَسّ.
    </div>`;

  if(!a.repairs.length && !a.unexplained.length){
    box.innerHTML = head + `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:16px;color:#065f46;font-weight:700;text-align:center">
      ✅ لا توجد خطةٌ تحتاج إصلاحاً — ${a.intact} خطة سليمة</div>`;
    return;
  }

  const tbl = a.repairs.length ? `
    <div style="overflow-x:auto;border:1px solid var(--border);border-radius:10px">
      <table style="width:100%;border-collapse:collapse;font-size:11.5px">
        <thead><tr style="background:var(--surface2);text-align:right">
          <th style="padding:8px">الخطة</th>
          <th style="padding:8px">الاستحقاق الحالي</th>
          <th style="padding:8px">يعود إلى</th>
          <th style="padding:8px">الموعد الثاني</th>
          <th style="padding:8px">البلاغ الشاهد</th>
        </tr></thead>
        <tbody>${a.repairs.map(_row).join("")}</tbody>
      </table>
    </div>` : "";

  const warn = a.unexplained.length ? `
    <div style="margin-top:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px;font-size:11.5px;color:#92400e;line-height:1.8">
      <b>⚠ ${a.unexplained.length} خطة تُعلَن ولا تُمَسّ</b> — استحقاقُها لا يُفسَّر بدورةٍ عاديةٍ
      ولا بموعدٍ ثانٍ مستهلَك، فإصلاحُها تخمينٌ لا استنتاج. عدّلها يدوياً من صفحة الخطط:
      <div style="margin-top:6px">${a.unexplained.map(u=>`• ${_esc(u.name)} — الحالي ${_esc(_fmt(u.from))} · شاهدُه ${_esc(_fmt(u.witness))}`).join("<br>")}</div>
    </div>` : "";

  box.innerHTML = head + tbl + warn +
    `<div style="margin-top:12px;font-size:11px;color:var(--muted)">
      ${a.repairs.length} خطة ستُصلَح • ${a.intact} خطة سليمة${a.unexplained.length?` • ${a.unexplained.length} تحتاج نظرك`:""}
    </div>`;
}

function open(){
  if(!_isAdmin()){ _toast("⚠ إصلاح المواعيد من صلاحية المسؤول","warn"); return; }
  _ensureModal();
  render();
  const f = _g("openModal"); if(f) f(MODAL_ID);
}
function close(){ const f=_g("closeModal"); if(f) f(MODAL_ID); }

/* ════════ التطبيق — الموضعُ الوحيد الذي يكتب ════════ */
function apply(){
  if(!_isAdmin()){ _toast("⚠ إصلاح المواعيد من صلاحية المسؤول","warn"); return; }
  const plans = _g("ppmPlans");
  const save  = _g("savePPMDoc");
  if(!Array.isArray(plans) || typeof save !== "function"){ _toast("⚠ خطط PPM غير محمّلة بعد","warn"); return; }

  const { repairs } = _currentAudit();
  if(!repairs.length){ _toast("لا توجد خطةٌ تحتاج إصلاحاً","info"); render(); return; }

  let done = 0;
  repairs.forEach(r => {
    const i = plans.findIndex(x => x && x.id === r.id);
    if(i < 0) return;
    plans[i].nextDueDate = r.to;
    if(r.restoredSecond) plans[i].secondDueDate = r.secondTo;
    save(r.id);
    done++;
  });

  const log = _g("logAudit");
  if(log) log("إصلاح مواعيد خطط PPM", "عدد الخطط: "+done+" — أُعيدت المواعيد المستهلَكة قبل أوانها من «الاستحقاق المخطط» في بلاغاتها المفتوحة");
  _toast(`✅ أُعيد موعدُ ${done} خطة إلى مكانه`, "success");

  const rp = _g("renderPPM");       if(rp) rp();
  const ub = _g("updatePPMBadge");  if(ub) ub();
  render();
}

/* بطاقةُ لوحة الإدارة — تُحقن بعد رسم اللوحة، وتختفي حين لا شيء يُصلَح. */
function mountAdminCard(){
  if(!_isAdmin()) return;
  const host = document.getElementById("ppm-repair-card");
  if(!host) return;
  const a = _currentAudit();
  const n = a.repairs.length + a.unexplained.length;
  if(!n){ host.innerHTML = ""; return; }
  host.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="card-header"><div class="card-title">🗓️ إصلاح مواعيد خطط الصيانة</div></div>
      <div class="card-body">
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.7">
          خططٌ استُهلك موعدُها قبل أوانه (التوليدُ المبكّر كان يُقدّم الجدول)، وعليها
          بلاغٌ وقائيٌّ مفتوحٌ يشهد بالموعد الأصلي. الأداةُ تُعيده من البلاغ نفسِه.
        </div>
        <button class="btn btn-warn" onclick="ppmScheduleRepair.open()" style="width:100%;font-size:12px">
          🔎 فحص المواعيد وإصلاحها (${n} خطة)
        </button>
      </div>
    </div>`;
}

window.ppmScheduleRepair = {
  audit, open, close, apply, render, mountAdminCard,
  build: MODULE_BUILD,
  _expectedNext, _dayMs, _todayMs
};

})();
