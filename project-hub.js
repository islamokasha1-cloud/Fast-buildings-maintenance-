/* ═══════════════════════════════════════════════════════════════════════════
   project-hub.js — البطاقةُ الجامعة لبوّابة المشاريع (v18.9am)

   ── المشكلة ──
   بوّابةُ المشاريع كانت تفرش **بطاقةً لكلّ مشروع** في شبكةٍ تطول بطول المشاريع.
   مع أربعة مشاريع صار نصفُ الشاشة بطاقاتٍ متشابهةً في العنوان (كلُّها لجهةٍ
   واحدة، والفارقُ سطرٌ صغير)، وانزاح ما تحتها — «مركز العمليات» و«المشتريات
   المركزية» — إلى ما دون حافّة الشاشة. والزيادةُ لا تقف: كلُّ مشروعٍ جديدٍ يدفع
   الأزرارَ الثابتة أبعد.

   ── المبدأ ──
   **مستويان لا مستوى واحد.** الأول: بطاقةٌ جامعةٌ واحدة عنوانُها «المشاريع»
   تحمل العدد ولمحةً من أيقونات المشاريع. والثاني — بعد الضغط — قائمةُ المشاريع
   **نفسُها بلا تغيير**: البطاقاتُ كما هي، وقائمةُ الأدمن (تعديل/حذف) كما هي،
   وزرُّ الإضافة كما هو. فالبوّابة تثبت على ارتفاعٍ واحدٍ مهما كثرت المشاريع.

   ── الاستثناء المقصود ──
   مشروعٌ واحدٌ مرئيّ ⇐ لا بطاقةَ جامعة. طبقةٌ لعنصرٍ واحدٍ نقرةٌ زائدةٌ بلا مقابل،
   وأكثرُ المستخدمين مسنَدٌ إليهم مشروعٌ واحد. القرارُ هنا لا في `index.html`.

   ── الاستقلال ──
   نمط IIFE يعرّض `window.ProjectHub` وحدَه. لا يعرف نموذجَ بيانات المشروع: يقرأ
   `id` و`name` و`icon` فقط، ويقرأ خدماتِ النواة بالاسم المجرّد وقتَ النداء
   (`esc` · `projectIconMarkup` · `_svgIcon` · `renderProjectGrid` · `currentUser`)
   فلا يتعطّل ترتيبُ تحميلِ الوسوم. وسماتُ `onclick` في مخرجاته تنادي
   `ProjectHub.open()` / `ProjectHub.close()` — أسماءٌ مؤهَّلةٌ تُقيَّم في النطاق
   العام بلا أن يسكن الملفُّ فيه.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
"use strict";

const MODULE_BUILD = "v18.9.3076";

let _open = false;   // أمفتوحةٌ قائمةُ المشاريع؟ (المستوى الثاني)

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

/* ════════ المستوى الأول: البطاقةُ الجامعة ════════ */
function cardHTML(list){
  const arr = Array.isArray(list) ? list : [];
  const chips = arr.slice(0, 4).map(p =>
    '<span class="proj-hub-chip" title="' + _esc(p.name) + '">' + _icoOf(p) + '</span>').join("");
  const more = arr.length > 4 ? '<span class="proj-hub-chip proj-hub-more">+' + (arr.length - 4) + '</span>' : "";
  return '<div class="project-card proj-hub-card" role="button" tabindex="0"'
    + ' aria-label="' + _esc("فتح قائمة المشاريع — " + countLabel(arr.length)) + '"'
    + ' onclick="ProjectHub.open()"'
    + ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();ProjectHub.open()}">'
    + '<div class="project-card-icon">' + _gridIcon() + '</div>'
    + '<div class="project-card-name">المشاريع</div>'
    + '<div class="project-card-desc">' + _esc(countLabel(arr.length)) + ' — اضغط لاختيار المشروع</div>'
    + '<div class="proj-hub-preview">' + chips + more + '</div>'
    + '</div>';
}

/* ════════ المستوى الثاني: شريطُ العودة فوق بطاقات المشاريع ════════ */
function barHTML(n){
  return '<div class="proj-hub-bar">'
    + '<button type="button" class="proj-hub-back" onclick="ProjectHub.close()">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>'
    + 'رجوع</button>'
    + '<div class="proj-hub-bar-title">اختر المشروع <span>(' + _esc(countLabel(n)) + ')</span></div>'
    + '</div>';
}

/* ════════ القرارُ الوحيد الذي تسأل عنه `renderProjectGrid` ════════
   يُعيد `null` حين لا طبقةَ أصلاً (مشروعٌ واحدٌ أو لا شيء)، وإلا كائناً يقول
   أيُطوى العرضُ على البطاقة الجامعة (`collapsed`) أم يُسبَق بشريط العودة. */
function shell(list){
  const arr = Array.isArray(list) ? list : [];
  if(arr.length <= 1) return null;
  return _open ? { collapsed:false, html: barHTML(arr.length) }
               : { collapsed:true,  html: cardHTML(arr) };
}

function _rerender(){
  if(typeof renderProjectGrid === "function")
    renderProjectGrid(typeof currentUser !== "undefined" ? currentUser : null);
}

window.ProjectHub = {
  build: MODULE_BUILD,
  countLabel,
  cardHTML,
  barHTML,
  shell,
  isOpen(){ return _open; },
  setOpen(v){ _open = !!v; },
  open(){ _open = true; _rerender(); },
  close(){
    _open = false;
    if(typeof closeProjMenus === "function") closeProjMenus();
    _rerender();
  }
};

})();
