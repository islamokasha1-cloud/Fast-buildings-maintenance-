/* ═══════════════════════════════════════════════════════════════════════════
   project-hub.js — البطاقةُ الجامعة لبوّابة المشاريع (v18.9am · v18.9an)

   ── المشكلة ──
   بوّابةُ المشاريع كانت تفرش **بطاقةً لكلّ مشروع** في شبكةٍ تطول بطول المشاريع.
   مع أربعة مشاريع صار نصفُ الشاشة بطاقاتٍ متشابهةً في العنوان (كلُّها لجهةٍ
   واحدة، والفارقُ سطرٌ صغير)، وانزاح ما تحتها — «مركز العمليات» و«المشتريات
   المركزية» — إلى ما دون حافّة الشاشة. والزيادةُ لا تقف: كلُّ مشروعٍ جديدٍ يدفع
   الأزرارَ الثابتة أبعد.

   ── المبدأ ──
   **مستويان لا مستوى واحد.** الأول: بطاقةٌ جامعةٌ واحدة عنوانُها «المشاريع»
   تحمل العدد، وصفَّ «آخر مشروع فتحته» يدخله بنقرة، ورقاقاتِ أسماء الباقي.
   والثاني — بعد الضغط — قائمةُ المشاريع **نفسُها بلا تغيير**: البطاقاتُ كما هي،
   وقائمةُ الأدمن (تعديل/حذف) كما هي. فالبوّابة تثبت على ارتفاعٍ واحد.

   ── الفتحُ في المكان لا التبديل (v18.9an) ──
   الطبقتان **كلتاهما في الشجرة** دائماً، والفتحُ صنفٌ (`open`) يُبدَّل على الإطار
   لا إعادةُ رسم. السببُ أن حركةَ التمدّد تحتاج الحالتين معاً في الـDOM؛ وإعادةُ
   الرسم تُسقط الحركةَ وتُسقط معها قوائمَ الأدمن المفتوحة. الرأسُ نفسُه يصير
   زرَّ الرجوع: نصُّه وسهمُه يتبدّلان، وموضعُه لا.

   ── «آخر مشروع فتحته» ──
   أكثرُ الأيام تُفتح على المشروع نفسِه، فصفٌّ واحدٌ يوفّر نقرتين لكلّ مستخدمٍ
   كلَّ يوم. يُحفَظ في `localStorage` (لا `sessionStorage`) لأنّه عادةُ الجهاز لا
   جلسةَ الدخول، ويُعرض **فقط** إن كان ما زال ضمن المشاريع المرئية للمستخدم —
   فالرؤيةُ تُقرَّر في `_visibleProjectsFor` لا هنا.

   ── الاستثناء المقصود ──
   مشروعٌ واحدٌ مرئيّ ⇐ لا بطاقةَ جامعة. طبقةٌ لعنصرٍ واحدٍ نقرةٌ زائدةٌ بلا مقابل،
   وأكثرُ المستخدمين مسنَدٌ إليهم مشروعٌ واحد. القرارُ هنا لا في `index.html`.

   ── الاستقلال ──
   نمط IIFE يعرّض `window.ProjectHub` وحدَه. لا يعرف نموذجَ بيانات المشروع: يقرأ
   `id` و`name` و`desc` و`icon` فقط، ويقرأ خدماتِ النواة بالاسم المجرّد وقتَ النداء
   (`esc` · `projectIconMarkup` · `_svgIcon` · `selectProject` · `closeProjMenus`)
   فلا يتعطّل ترتيبُ تحميلِ الوسوم. وسماتُ `onclick` في مخرجاته تنادي
   `ProjectHub.toggle()` مؤهَّلةً — تُقيَّم في النطاق العام بلا أن يسكن الملفُّ فيه.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
"use strict";

const MODULE_BUILD = "v18.9.3080";
const LS_KEY = "hail_last_project";
const PREVIEW_MAX = 3;          // رقاقاتُ الأسماء في الحالة المطويّة

let _open = false;              // أمفتوحةٌ قائمةُ المشاريع؟ (المستوى الثاني)

/* خدماتُ النواة بالاسم المجرّد وقتَ النداء — لا التقاطَ لها وقتَ التحميل */
function _esc(v){ return (typeof esc === "function") ? esc(v) : String(v == null ? "" : v); }
function _icoOf(p){ return (typeof projectIconMarkup === "function") ? projectIconMarkup(p.icon, p.name) : ""; }
function _gridIcon(){ return (typeof _svgIcon === "function") ? _svgIcon("projectsGrid") : ""; }

/* ════════ دالّةٌ نقيّة: تمييزُ العدد بالعربية الصحيحة ════════
   مفردٌ ومثنّى وجمعُ قلّةٍ (٣–١٠) وتمييزٌ منصوبٌ مفرد (١١ فأكثر). */
function countLabel(n){
  const c = Math.max(0, Math.floor(Number(n) || 0));
  if(c === 0) return "لا مشاريع";
  if(c === 1) return "مشروع واحد";
  if(c === 2) return "مشروعان";
  if(c <= 10) return c + " مشاريع";
  return c + " مشروعاً";
}

/* ════════ دالّةٌ نقيّة: متى فُتح آخرُ مشروع ════════
   «اليوم 09:40» · «أمس 17:05» · وأبعدُ من ذلك تاريخٌ قصير. الساعةُ محلّيةٌ
   بأرقامٍ غربية (تفضيلُ المالك). */
function whenLabel(atISO, now){
  const at = new Date(atISO || 0), ref = now ? new Date(now) : new Date();
  if(isNaN(at.getTime()) || at.getTime() <= 0) return "";
  const hm = String(at.getHours()).padStart(2,"0") + ":" + String(at.getMinutes()).padStart(2,"0");
  const day = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(ref) - day(at)) / 86400000);
  if(diff <= 0) return "اليوم " + hm;
  if(diff === 1) return "أمس " + hm;
  return String(at.getDate()).padStart(2,"0") + "/" + String(at.getMonth()+1).padStart(2,"0") + " " + hm;
}

/* ════════ الذاكرة: آخرُ مشروعٍ فُتح على هذا الجهاز ════════ */
function remember(proj){
  if(!proj || !proj.id) return;
  try{ localStorage.setItem(LS_KEY, JSON.stringify({ id: String(proj.id), at: new Date().toISOString() })); }catch(e){}
}
function last(){
  try{
    const v = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    return (v && typeof v.id === "string") ? v : null;
  }catch(e){ return null; }
}
function lastId(){ const l = last(); return l ? l.id : ""; }

/* ════════ المستوى الأول: رأسُ الإطار (يصير زرَّ الرجوع عند الفتح) ════════ */
function _headHTML(n){
  return '<button type="button" class="proj-hub-top" id="proj-hub-top" aria-expanded="' + (_open ? "true" : "false") + '"'
    + ' aria-controls="proj-hub-body" onclick="ProjectHub.toggle()">'
    + '<span class="proj-hub-ico">' + _gridIcon() + '</span>'
    + '<span class="proj-hub-txt">'
    +   '<span class="proj-hub-ttl"><span id="proj-hub-ttl">' + (_open ? "اختر المشروع" : "المشاريع") + '</span>'
    +   '<span class="proj-hub-n">' + n + '</span></span>'
    +   '<span class="proj-hub-sub" id="proj-hub-sub">' + (_open ? "اضغط هنا للرجوع" : "اضغط لعرض المشاريع واختيار واحدٍ منها") + '</span>'
    + '</span>'
    + '<span class="proj-hub-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></span>'
    + '</button>';
}

/* الحالةُ المطويّة: صفُّ «آخر مشروع» + رقاقاتُ أسماء الباقي */
function _foldHTML(list, lastProj, lastAt){
  const others = list.filter(p => !lastProj || p.id !== lastProj.id);
  let html = "";
  if(lastProj){
    html += '<div class="proj-hub-resume" role="button" tabindex="0" onclick="event.stopPropagation();selectProject(\'' + _esc(lastProj.id) + '\')"'
      + ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();event.stopPropagation();selectProject(\'' + _esc(lastProj.id) + '\')}">'
      + '<span class="proj-hub-ri">' + _icoOf(lastProj) + '</span>'
      + '<span class="proj-hub-rt">'
      +   '<span class="proj-hub-rk"><i></i>آخر مشروع فتحته' + (lastAt ? ' — ' + _esc(lastAt) : '') + '</span>'
      +   '<span class="proj-hub-rn">' + _esc(lastProj.name) + '</span>'
      +   (lastProj.desc ? '<span class="proj-hub-rs">' + _esc(lastProj.desc) + '</span>' : '')
      + '</span>'
      + '<span class="proj-hub-go">تابع <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg></span>'
      + '</div>';
  }
  if(others.length){
    const shown = others.slice(0, PREVIEW_MAX);
    const more = others.length - shown.length;
    html += '<div class="proj-hub-names">'
      + (lastProj ? '<b>وأيضاً:</b>' : '')
      + shown.map(p => '<span title="' + _esc(p.name) + '" onclick="event.stopPropagation();selectProject(\'' + _esc(p.id) + '\')">' + _icoOf(p) + _esc(p.name) + '</span>').join("")
      + (more > 0 ? '<span class="proj-hub-more">+' + more + '</span>' : '')
      + '</div>';
  }
  return '<div class="proj-hub-fold"><div>' + html + '</div></div>';
}

/* ════════ الإطارُ كاملاً — النداءُ الوحيدُ من `renderProjectGrid` ════════
   يُعيد `null` حين لا طبقةَ أصلاً (مشروعٌ واحدٌ أو لا شيء). وإلا فالحالتان معاً:
   الرأسُ، والطيّةُ، والجسمُ الذي يستضيف بطاقاتِ المشاريع كما رسمتها النواة. */
function render(list, cardsHTML){
  const arr = Array.isArray(list) ? list : [];
  if(arr.length <= 1) return null;
  const l = last();
  const lastProj = l ? arr.find(p => p.id === l.id) : null;
  return {
    collapsed: !_open,
    html: '<div class="proj-hub' + (_open ? " open" : "") + '" id="proj-hub">'
      + '<div class="proj-hub-hair"></div>'
      + _headHTML(arr.length)
      + _foldHTML(arr, lastProj, lastProj ? whenLabel(l.at) : "")
      + '<div class="proj-hub-body" id="proj-hub-body"><div><div class="proj-hub-grid">' + (cardsHTML || "") + '</div></div></div>'
      + '</div>'
  };
}

/* ════════ الفتحُ والإغلاق: تبديلُ صنفٍ لا إعادةُ رسم ════════ */
function _apply(){
  const hub = document.getElementById("proj-hub");
  if(!hub) return;
  hub.classList.toggle("open", _open);
  const top = document.getElementById("proj-hub-top");
  if(top) top.setAttribute("aria-expanded", _open ? "true" : "false");
  const t = document.getElementById("proj-hub-ttl"), s = document.getElementById("proj-hub-sub");
  if(t) t.textContent = _open ? "اختر المشروع" : "المشاريع";
  if(s) s.textContent = _open ? "اضغط هنا للرجوع" : "اضغط لعرض المشاريع واختيار واحدٍ منها";
  if(!_open && typeof closeProjMenus === "function") closeProjMenus();
}

window.ProjectHub = {
  build: MODULE_BUILD,
  countLabel,
  whenLabel,
  remember,
  last,
  lastId,
  render,
  isOpen(){ return _open; },
  setOpen(v){ _open = !!v; _apply(); },
  open(){ _open = true; _apply(); },
  close(){ _open = false; _apply(); },
  toggle(){ _open = !_open; _apply(); }
};

})();
