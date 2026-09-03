/* ═══════════════════════════════════════════════════════════════════════════
   نظام هيل — وحدة العقد القائم على الأداء  (performance-contract.js)   [المرحلة ١]
   ملف خارجي مستقل على نمط cleaning-operations.js: IIFE يعرض window.performanceContract،
   يركّب صفحته ذاتياً (page-performance) ويحقن زرّها في القائمة الجانبية ويلفّ showPage —
   فلا يحتاج من index.html إلا وسم <script> واحد.

   يقرأ خدمات النواة بالاسم (esc / toast / currentUser / CURRENT_PROJECT / _svgIcon /
   isPerfProject / perfConfig / perfMinScore / perfContractYear / perfContractMonth /
   perfInGrace / PERF_GRACE_MONTHS) — كل وسوم <script> الكلاسيكية تتشارك البيئة العامة.

   ── الفكرة الحاكمة ──
   المشروع القائم على الأداء **صفةٌ على المشروع لا منصةٌ ثانية**. العَلَم `perfContract`
   في سجلّ المشروع (`meta/projects`) هو المفتاح الوحيد: يُضيء هذا القسم ويُطفئه.
   والمشاريع التقليدية لا ترى شيئاً — لا زرّ ولا صفحة ولا حقل. سابقةٌ قائمة في المنصة:
   `type==="cleaning"` يبدّل سلوكها لعقود النظافة؛ والفارق أن الأداء **متعامدٌ على النوع**
   (مشروع صيانةٍ قد يكون بعقد أداء) فكان عَلَماً مستقلاً لا نوعاً رابعاً.

   ── نطاق المرحلة ١ (هذه) ──
   • بطاقةُ العقد: المبلغ الشهري المقطوع · سنة العقد · الحد الأدنى للنجاح هذه السنة ·
     شهر العقد وحالةُ مهلة الشهرين.
   • هيكلُ بطاقة الأداء المتوازن: المجموعات الخمس بأوزانها ومستهدفاتها السنوية،
     ومقياسُ الغرامة — مرجعاً حاضراً أمام المستخدم لا ملفَّ إكسل على مكتبٍ ما.
   • حالةٌ صريحةٌ لكل مجموعة: **من أين ستأتي درجتها** وما الذي ينقص لحسابها.

   ── المرحلة ٣ (سجلّ عدم المطابقة — NCR) ──
   ٥١٫٥٪ من درجة البطاقة «تقاريرُ عدم مطابقة» يكتبها الطرفُ الآخر — فدورُ المنصة فيها
   **دفاعيّ**: استقبالُ المخالفة وربطُها بمؤشرها (فيظهر أثرُها على درجة المؤشر
   وحسميتُها فوراً)، وخطةُ تصحيحٍ بموعدٍ ومسؤول، وإغلاقٌ بدليل، و**ملفُّ اعتراضٍ**
   يجمع سجلّات المنصة المؤرّخة قبل تاريخ المخالفة. كتالوجُ المؤشرات الـ٢٥ (KPIS)
   منسوخٌ من ملف الاستشاري V3 حرفياً: معاملُ خصم كل تقرير، ومبلغُ الحسمية الأساس.
   **قراران محاسبيان مُعلَنان لا مضمَران**: (١) عتبةُ الحسمية = الحدُّ الأدنى للسنة
   (٧٠٪ س١ — خلية X6 في ملف الاستشاري)؛ (٢) عدّادُ التكرار يتصفّر بعد شهرِ امتثالٍ —
   وهذا هو الاستفسار ٦ المفتوح مع الأمانة، فالافتراضُ الأرفقُ بنا مُعلَنٌ في الشاشة.

   ── ما ليس في هذه المرحلة (عمداً) ──
   لا درجةَ كليّةً محسوبةً ولا غرامةَ شهريةً مقدَّرة. أرقامُ هذه المرحلة كلُّها
   **على مستوى المؤشر الواحد** ومصدرُها سجلُّ مخالفاتٍ نُدخله بأيدينا — أما الدرجةُ
   الكليّة فتحتاج بقيةَ المؤشرات المقاسة نسباً، وعرضُ رقمٍ قبلها يكون **رقماً
   كاذباً**، وهو أسوأ من لا رقم في عقدٍ يُحاسَب عليه المال شهرياً.
   المرحلة ٤: الدرجة والغرامة الحيّة و«ماذا لو».
   المرجع الكامل: docs/performance-project-type-plan.md و docs/consultant-kpi-mapping.md

   ── الهوية البصرية: لغة المنصة نفسها ──
   تُستعمل أصناف المنصة (.page-hero / .card / .stat-tile / .ppm-pill / .btn) وما لا
   مقابل له فقط يُعرَّف هنا في طبقةٍ رقيقة — فتتبع الصفحةُ أيَّ تغييرٍ في هوية المنصة.

   ── ملاحظة تقنية مقصودة ──
   **لا onSnapshot في هذه الوحدة إطلاقاً** (انضباط المستمعين: تراكم targetId يُطلق
   خلل Firestore الداخلي ca9/b815 — درس v18.9sz، والوحدة خارج مسار فكّ switchProject).
   سجلُّ المخالفات يُقرأ بـ`.get()` عند فتح الصفحة وبعد كل كتابة، بكاشٍ لكل مشروعٍ
   وعمرٍ أدنى ٦٠ ثانية — بياناتٌ قليلةُ الحركة (مخالفاتٌ تُدخَل يدوياً) لا تستحق
   مستمعاً حيّاً، والقراءةُ المدفوعةُ عند الحاجة أرخصُ وأسلمُ من مستمعٍ يُنسى.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
"use strict";

const PAGE_ID      = "performance";
const VERSION      = "0.3";
const MODULE_BUILD = "v18.9.3017";

/* ════════════ خدمات النواة (قراءة بالاسم مع بدائل آمنة) ════════════ */
function _esc(s){ try{ return (typeof esc==="function") ? esc(s) : String(s==null?"":s); }catch(e){ return String(s==null?"":s); } }
function _toast(m,t){ try{ toast(m,t); }catch(e){ console.log(m); } }
function _user(){ try{ return currentUser||null; }catch(e){ return null; } }
function _proj(){ try{ return (typeof CURRENT_PROJECT!=="undefined" && CURRENT_PROJECT) ? CURRENT_PROJECT : null; }catch(e){ return null; } }
function _projId(){ const p=_proj(); return p&&p.id ? p.id : ""; }
/* كلُّ أيقونةٍ تخرج بأبعادٍ صريحة — _svgIcon في النواة يُرجع <svg> بلا width/height،
   وSVG بلا أبعاد داخل حاوية flex يتمدّد ليملأها (درسُ وحدة النظافة). */
function _svg(name, size){
  try{
    const raw=(typeof _svgIcon==="function") ? _svgIcon(name) : "";
    if(!raw) return "";
    const n=size||16;
    return raw.replace(/^<svg\b/, '<svg width="'+n+'" height="'+n+'"');
  }catch(e){ return ""; }
}
/* بوّابةُ العقد — تُقرأ من النواة وحدها، فلا تعريفَ محلّياً يتباعد عنها. */
function _isPerf(){ try{ return typeof isPerfProject==="function" && isPerfProject(); }catch(e){ return false; } }
function _cfg(){ try{ return (typeof perfConfig==="function") ? perfConfig() : null; }catch(e){ return null; } }
function _year(){ try{ return (typeof perfContractYear==="function") ? perfContractYear() : 1; }catch(e){ return 1; } }
function _month(){ try{ return (typeof perfContractMonth==="function") ? perfContractMonth() : 1; }catch(e){ return 1; } }
function _minScore(){ try{ return (typeof perfMinScore==="function") ? perfMinScore() : null; }catch(e){ return null; } }
function _inGrace(){ try{ return typeof perfInGrace==="function" && perfInGrace(); }catch(e){ return false; } }
function _graceMonths(){ try{ return (typeof PERF_GRACE_MONTHS!=="undefined") ? PERF_GRACE_MONTHS : 2; }catch(e){ return 2; } }
function _isTrial(){ try{ return typeof isPerfTrial==="function" && isPerfTrial(); }catch(e){ return false; } }
function _tickets(){ try{ return (typeof allTickets==="function") ? allTickets() : (typeof tickets!=="undefined" ? tickets : []); }catch(e){ return []; } }
function _isOp(t){ try{ return typeof isOperationTicket==="function" && isOperationTicket(t); }catch(e){ return false; } }

/* من يرى القسم: كلُّ من يرى المشروع عدا المراقب الخارجي.
   قرارُ الصلاحيات التفصيلي (من يُدخل المخالفات ومن يعتمد الدرجة) يُحسم في المرحلة ٣
   حين توجد كتابةٌ فعلية — ولا كتابةَ في هذه المرحلة إطلاقاً. */
function canView(){
  const u=_user(); if(!u) return false;
  try{ if(typeof isObserver==="function" && isObserver()) return false; }catch(e){}
  return true;
}

/* ════════════════════════════════════════════════════════════
   نموذج البطاقة — من ملف الاستشاري (V3 — ٢٥/٠٦/٢٠٢٥)
   المجموعات الخمس مطابقةٌ لركائز نطاق العمل في بند ٦٧ من الكراسة.
   الأوزان والمستهدفات **بياناتٌ لا منطق**: تُعدَّل هنا في موضعٍ واحد، وستنتقل
   في المرحلة ٤ إلى إعداداتٍ من الواجهة (الملحق قد يصل بأوزانٍ مختلفة).
   ════════════════════════════════════════════════════════════ */
const GROUPS = [
  { no:"٤", key:"preventive", name:"الصيانة الوقائية والروتينية المجدولة", weight:0.30,
    targets:[0.80,0.85,0.90,0.95,1.00], kpis:3,
    source:"من خطط الصيانة الوقائية في المنصة",
    gap:"✅ المرحلة ٢: البلاغ الوقائي صار يحمل استحقاقه المخطَّط، والجدولُ المعتمد لم يعد ينزاح" },
  { no:"٥", key:"corrective", name:"الصيانة التصحيحية", weight:0.25,
    targets:[0.80,0.85,0.90,0.95,1.00], kpis:4,
    source:"من البلاغات ومحرّك SLA القائم",
    gap:"جاهزٌ جزئياً: تكرارُ الأعطال على الأصل والإغلاقُ في المهلة محسوبان اليوم" },
  { no:"٣", key:"response", name:"الاستجابة للأحداث والطوارئ", weight:0.20,
    targets:[0.75,0.80,0.85,0.90,0.95], kpis:6,
    source:"من طوابع البلاغ الزمنية",
    gap:"✅ المرحلة ٢: طابعا «وصلتُ للموقع» و«رجعت الخدمة» يُلتقطان، وإيقافُ الساعة يُوثَّق" },
  { no:"٢", key:"hse", name:"السلامة المهنية والبيئية", weight:0.15,
    targets:[0.80,0.85,0.90,0.95,1.00], kpis:4,
    source:"من سجلّ الحوادث وتصاريح العمل",
    gap:"غير موجودٍ بعد — وساعاتُ العمل لمعدل الإصابات تُستمدّ من الحضور القائم في تطبيق الفنيين" },
  { no:"١", key:"contract", name:"إدارة العقود والسجلات", weight:0.10,
    targets:[0.75,0.80,0.85,0.90,0.95], kpis:3,
    source:"من سجلّ الأصول وتقارير عدم المطابقة",
    gap:"ينقص سجلُّ تغييرات الأصل، وسجلُّ المخالفات" }
];

/* النتيجة السنوية المستهدفة = Σ (وزن المجموعة × مستهدفها) — تُحسب لا تُكتب،
   فلا ينحرف الجدول عن الأوزان إن عُدِّلت. (٧٨٫٥٪ في السنة الأولى بأرقام الاستشاري.) */
function yearTarget(yIdx){
  return GROUPS.reduce((s,g)=> s + g.weight * (g.targets[yIdx] != null ? g.targets[yIdx] : g.targets[g.targets.length-1]), 0);
}

/* مقياس الغرامة (بند ٦٣ من الكراسة). الانحراف = الدرجة − الحد الأدنى. */
const PENALTY_SCALE = [
  { label:"٠٪ إلى −٢٪",   sub:"المتعادل", pct:0    },
  { label:"−٢٪ إلى −٣٪",  sub:"",         pct:0.07 },
  { label:"−٣٪ إلى −٤٪",  sub:"",         pct:0.08 },
  { label:"−٤٪ إلى −٥٪",  sub:"",         pct:0.09 },
  { label:"−٥٪ إلى −٦٪",  sub:"",         pct:0.10 },
  { label:"−٦٪ فأكثر",    sub:"",         pct:0.12 }
];

const AR_YEARS = ["الأولى","الثانية","الثالثة","الرابعة","الخامسة"];
function _pct(n){ return Math.round(n*1000)/10; }
function _money(n){ try{ return Number(n||0).toLocaleString("en-US"); }catch(e){ return String(n||0); } }

/* ════════════════════════════════════════════════════════════
   [المرحلة ٣] كتالوج المؤشرات الخمسة والعشرين — من ملف الاستشاري V3 حرفياً
   (٢٠ موزوناً مجموعُ أوزانها ١ + ٥ مؤشراتِ حسميةٍ بلا وزن. ملاحظة: توثيقُنا
   الداخلي لخّصها «١٨+٦=٢٤» — والعبرةُ بصفوف الملف نفسِه، وقد نُسخت كلُّها.)
   ────────────────────────────────────────────────────────────
   w:      وزن المؤشر في الدرجة الكلية (null = مؤشرُ حسميةٍ نقديةٍ بلا وزن).
   ncrPct: خصمُ **كل تقرير عدم مطابقةٍ واحد** من درجة المؤشر (عمود F في الملف —
           ١٪ أو ٢٪ أو ٥٪). null = مؤشرٌ يُقاس نسبةً من بيانات التشغيل لا بالتقارير،
           فتُسجَّل مخالفتُه للتوثيق والاعتراض ولا يُحسب لها أثرُ درجةٍ هنا.
   ded:    الحسميةُ التلقائية للشهر الأول بالريال (عمود Q) — تتصاعد ×١→×٣ بالتكرار.
   البياناتُ بياناتٌ لا منطق: تُعدَّل هنا في موضعٍ واحد إن وصل ملحقٌ بأرقامٍ أخرى. */
const KPIS = [
  { id:"1.1", grp:"contract",   name:"تجديد شهادات ISO (9001/14001/45001)",              w:null,  ncrPct:null, ded:11000 },
  { id:"1.2", grp:"contract",   name:"تحديث نظام إدارة وسجل الأصول",                      w:0.04,  ncrPct:0.02, ded:2750  },
  { id:"1.3", grp:"contract",   name:"عمليات التفتيش المكتملة بتردد محدد",                w:0.04,  ncrPct:0.02, ded:2750  },
  { id:"1.4", grp:"contract",   name:"التعاون والتواصل",                                  w:0.02,  ncrPct:0.02, ded:2750  },
  { id:"1.5", grp:"contract",   name:"نسبة الرضا في الاستبيانات والتطبيقات الذكية",       w:null,  ncrPct:null, ded:2750  },
  { id:"1.6", grp:"contract",   name:"نسبة التصحيحية إلى (التصحيحية+الوقائية)",           w:null,  ncrPct:null, ded:11000 },
  { id:"2.1", grp:"hse",        name:"معدل وقوع الحوادث (AIR)",                           w:0.05,  ncrPct:null, ded:16500 },
  { id:"2.2", grp:"hse",        name:"الامتثال لأنظمة التحكم في السلامة بالمواقع",        w:0.04,  ncrPct:0.02, ded:5500  },
  { id:"2.3", grp:"hse",        name:"الامتثال للسلامة المهنية (ISO 45001)",              w:0.03,  ncrPct:0.02, ded:5500  },
  { id:"2.4", grp:"hse",        name:"الامتثال للسلامة البيئية (ISO 14001)",              w:0.03,  ncrPct:0.02, ded:5500  },
  { id:"2.5", grp:"hse",        name:"التدريب والتوعية للسلامة المهنية",                  w:null,  ncrPct:null, ded:11000 },
  { id:"2.6", grp:"hse",        name:"التدريب والتوعية للسلامة البيئية",                  w:null,  ncrPct:null, ded:11000 },
  { id:"3.1", grp:"response",   name:"الاستجابة لطلبات الإصلاح خلال المهل",               w:0.04,  ncrPct:null, ded:11000 },
  { id:"3.2", grp:"response",   name:"توفير قطع الغيار/الموارد الثانوية في الوقت",        w:0.025, ncrPct:0.01, ded:11000 },
  { id:"3.3", grp:"response",   name:"استعادة حالة الأصل بعد الحدث",                      w:0.04,  ncrPct:0.01, ded:5500  },
  { id:"3.4", grp:"response",   name:"الاستجابة للطوارئ (دليل إدارة الأزمات)",            w:0.05,  ncrPct:0.02, ded:16500 },
  { id:"3.5", grp:"response",   name:"معيار تقديم الخدمة مقابل خطة الاستجابة",            w:0.025, ncrPct:0.02, ded:5500  },
  { id:"3.6", grp:"response",   name:"الرضا على الاستجابة / إغلاق بلاغات 940",            w:0.02,  ncrPct:0.01, ded:11000 },
  { id:"4.1", grp:"preventive", name:"الالتزام ببرنامج الصيانة الوقائية المجدولة",        w:0.10,  ncrPct:null, ded:5500  },
  { id:"4.2", grp:"preventive", name:"الالتزام ببرنامج الفحص/الروتينية المجدولة",         w:0.10,  ncrPct:null, ded:5500  },
  { id:"4.3", grp:"preventive", name:"امتثال الجودة والمواد المستخدمة",                   w:0.10,  ncrPct:0.05, ded:5500  },
  { id:"5.1", grp:"corrective", name:"كفاءة تحديد/توصيف العيوب",                          w:0.07,  ncrPct:0.02, ded:5500  },
  { id:"5.2", grp:"corrective", name:"امتثال المواد عند إصلاح العيوب",                    w:0.07,  ncrPct:0.05, ded:5500  },
  { id:"5.3", grp:"corrective", name:"إصلاح العيوب خلال الوقت المستهدف",                  w:0.06,  ncrPct:null, ded:5500  },
  { id:"5.4", grp:"corrective", name:"متوسط الزمن بين الأعطال (MTBF)",                    w:0.05,  ncrPct:0.05, ded:5500  }
];
/* مضاعِفُ الحسمية بتكرار عدم الامتثال شهراً بعد شهر (الشهر ١…٥ فأكثر). */
const DED_STEPS = [1, 1.5, 2, 2.5, 3];
/* عتبةُ الحسمية الافتراضية (٧٠٪ — سنةٌ أولى). ثابتٌ محليٌّ لا قراءةَ من النواة:
   الدوالُّ النقيّة تُنفَّذ في hail-tests بلا متصفّحٍ ولا نواة، والقيمةُ الفعلية
   تمرّ من الشاشة عبر perfMinScore() وسيطاً. */
const NCR_TH_DEFAULT = 0.70;

/* ════════════ دوالُّ الحساب — نقيّةٌ ومعروضةٌ على الكائن ليفحصها hail-tests بلا متصفّح ════════════ */
function kpiById(id){ for(let i=0;i<KPIS.length;i++) if(KPIS[i].id===id) return KPIS[i]; return null; }
function ncrMonthKey(d){ const s=String(d||""); return /^\d{4}-\d{2}/.test(s) ? s.slice(0,7) : ""; }
function prevMonthKey(ym){
  const m=/^(\d{4})-(\d{2})$/.exec(String(ym||"")); if(!m) return "";
  let y=+m[1], mo=+m[2]-1; if(mo<1){ mo=12; y--; }
  return y+"-"+String(mo).padStart(2,"0");
}
/* درجةُ المؤشر بعد n تقريرَ عدم مطابقة = ١٠٠٪ − n×معامله، بأرضية صفر.
   null لمؤشرٍ لا يُقاس بالتقارير — **ولا نُصطنع له درجةً**: رقمٌ بلا أساسٍ أسوأ من «—». */
function kpiScoreAfterNCR(kpiId, count){
  const k=kpiById(kpiId); if(!k || k.ncrPct==null) return null;
  const n=Math.max(0, Math.floor(Number(count)||0));
  return Math.max(0, Math.round((1 - n*k.ncrPct)*1000)/1000);
}
function dedMultiplier(streak){
  const s=Math.max(1, Math.floor(Number(streak)||1));
  return DED_STEPS[Math.min(s, DED_STEPS.length)-1];
}
function dedAmount(kpiId, streak){
  const k=kpiById(kpiId); if(!k || !k.ded) return null;
  return Math.round(k.ded * dedMultiplier(streak));
}
function ncrCountFor(list, kpiId, ym){
  let n=0;
  (list||[]).forEach(r=>{ if(r && r.kpi===kpiId && ncrMonthKey(r.date)===ym) n++; });
  return n;
}
/* عدّادُ التكرار: كم شهراً متتالياً — منتهياً بالشهر المعطى — كان المؤشرُ فيه تحت عتبته؟
   الافتراضُ المُعلَن (الاستفسار ٦): شهرُ امتثالٍ واحدٌ يقطع السلسلة ويُعيد العدّاد. */
function ncrStreak(list, kpiId, ym, threshold){
  const th = (threshold==null) ? NCR_TH_DEFAULT : threshold;
  let s=0, cur=ym;
  for(let i=0;i<12 && cur;i++){
    const sc=kpiScoreAfterNCR(kpiId, ncrCountFor(list, kpiId, cur));
    if(sc==null || sc>th) break;
    s++; cur=prevMonthKey(cur);
  }
  return s;
}
/* التجميعُ الشهري: صفٌّ لكل مؤشرٍ عليه تقاريرُ هذا الشهر (أو سلسلةُ تكرارٍ حيّة)،
   ومجاميعُ الشهر. impactPts = مجموعُ (وزن × ما فقده المؤشر) — أي **أثرُ التقارير
   وحدها على الدرجة الكلية بالنقاط المئوية**، لا الدرجةَ الكليّة نفسَها. */
function ncrRollup(list, ym, threshold){
  const th=(threshold==null) ? NCR_TH_DEFAULT : threshold;
  const rows=[];
  let impactPts=0, dedTotal=0, monthCount=0;
  KPIS.forEach(k=>{
    const n=ncrCountFor(list, k.id, ym);
    monthCount+=n;
    const sc=kpiScoreAfterNCR(k.id, n);
    const breached = sc!=null && sc<=th;
    const streak = breached ? ncrStreak(list, k.id, ym, th) : 0;
    const ded = breached ? dedAmount(k.id, streak) : null;
    if(sc!=null && k.w) impactPts += k.w*(1-sc);
    if(ded) dedTotal += ded;
    if(n>0 || streak>0) rows.push({ id:k.id, name:k.name, grp:k.grp, w:k.w, count:n, score:sc, breached, streak, ded });
  });
  return { rows, monthCount, impactPts:Math.round(impactPts*1000)/1000, dedTotal };
}

/* ════════════════════════════════════════════════════════════
   [الرقابة الاستباقية] دوالُّ الحساب — نقيّةٌ ومعروضةٌ على الكائن
   ────────────────────────────────────────────────────────────
   المبدأ (من consultant-kpi-mapping §٣): «من يصل للاجتماع الشهري برقمه الموثّق
   يناقش؛ ومن يصل بلا رقمٍ يوقّع على رقم غيره». هذه البطاقة تراقب المؤشراتِ ذات
   الحسمية المباشرة **قبل** أن يكتبها الاستشاري: الشهادات (١٫١) · التدريب (٢٫٥/٢٫٦
   — ١٤ ساعة/موظف سنوياً وعتبة ٩٠٪) · نسبة التصحيحية (١٫٦ — سقف ٣٠٪) · الرضا
   الشهري (١٫٥ — عتبة ٩٠٪). القياسات الحدّية مُعلَنة: نسبة ١٫٦ تُحسب **بالعدد**
   لا بالقيمة (الاستفسار ٤ المفتوح — القياسُ بالقيمة يحتاج تكلفةً على أمر العمل).
   ════════════════════════════════════════════════════════════ */
/* حالة شهادة: كم يوماً بقي؟ مستوياتُ الإنذار ٩٠/٦٠/٣٠ يوماً ثم «منتهية». */
function certStatus(dateStr, todayStr){
  const re=/^\d{4}-\d{2}-\d{2}$/;
  if(!re.test(String(dateStr||"")) || !re.test(String(todayStr||""))) return null;
  const days=Math.round((new Date(dateStr+"T12:00:00") - new Date(todayStr+"T12:00:00"))/86400000);
  const level = days<0 ? "expired" : days<=30 ? "d30" : days<=60 ? "d60" : days<=90 ? "d90" : "ok";
  return { days, level };
}
/* بدايةُ سنة العقد الجارية (يوم الذكرى الأخير) — نافذةُ قياس التدريب،
   فالكراسة تقيسه «في ذكرى العقد من كل عام». */
function contractYearStartISO(startDateStr, todayStr){
  const re=/^\d{4}-\d{2}-\d{2}$/;
  if(!re.test(String(startDateStr||"")) || !re.test(String(todayStr||""))) return null;
  const s=startDateStr.split("-").map(Number);
  const tY=Number(todayStr.slice(0,4));
  const anniv=(y)=>{ const d=new Date(y, s[1]-1, s[2], 12); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  let cand=anniv(tY);
  if(cand>todayStr) cand=anniv(tY-1);
  return cand<startDateStr ? startDateStr : cand;
}
/* تقدّم التدريب في سنة العقد الجارية: المستهدف ١٤ ساعة/موظف، والحسمية تحت ٩٠٪.
   بلا عدد موظفين لا مستهدفَ — فتُعرض الساعات وحدها ولا يُصطنع «٪» كاذب. */
function trainingProgress(records, windowStartYMD, todayYMD, staffCount, kind){
  const hours=(records||[]).reduce((s,r)=>{
    if(!r || !r.date) return s;
    if(windowStartYMD && r.date<windowStartYMD) return s;
    if(todayYMD && r.date>todayYMD) return s;
    if(kind && r.kind!==kind) return s;
    const h=Number(r.hours); return s + (Number.isFinite(h)&&h>0 ? h : 0);
  },0);
  const staff=Math.max(0, Math.floor(Number(staffCount)||0));
  const target=staff*14;
  const pct=target ? Math.round(hours/target*1000)/1000 : null;
  const level = pct==null ? "na" : pct>=0.9 ? "ok" : pct>=0.7 ? "warn" : "low";
  return { hours:Math.round(hours*10)/10, staff, target, pct, level };
}
/* نسبة ١٫٦: التصحيحية ÷ (التصحيحية + الوقائية) **بالعدد** — سقفُ العقد ٣٠٪. */
function ratio16(corrCount, prevCount){
  const c=Math.max(0,Number(corrCount)||0), p=Math.max(0,Number(prevCount)||0);
  if(c+p===0) return { pct:null, level:"na" };
  const pct=Math.round(c/(c+p)*1000)/1000;
  return { pct, level: pct>0.30 ? "danger" : pct>0.25 ? "warn" : "ok" };
}
/* رضا الشهر: متوسط تقييمات (١–٥) نسبةً — وعتبة العقد ٩٠٪. بلا تقييماتٍ «—». */
function satisfactionMonthly(ratings){
  const rs=(ratings||[]).map(Number).filter(r=>Number.isFinite(r)&&r>0);
  if(!rs.length) return { pct:null, n:0, level:"na" };
  const pct=Math.round(rs.reduce((a,b)=>a+b,0)/rs.length/5*1000)/1000;
  return { pct, n:rs.length, level: pct>=0.9 ? "ok" : pct>=0.8 ? "warn" : "low" };
}

/* ════════════════════════════════════════════════════════════
   العرض
   ════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════
   تغطيةُ البيانات — الرقم الوحيد الصادق في التجربة
   ────────────────────────────────────────────────────────────
   في أول شهرٍ لا معنى لـ«درجةِ الأداء»: الحقولُ لم تكن تُملأ، فمؤشرٌ بلا بياناتٍ
   يُقرأ صفراً — لا لأن الفريق مقصّر بل لأن العادة لم تتشكّل بعد. لذلك تبدأ التجربة
   بسؤال **«كم مما نحتاجه صرنا نلتقطه؟»** لا بسؤال «كم درجتنا؟».
   وهذه النسبةُ هي المؤشر الحقيقي لجاهزيتنا للعقد.
   ════════════════════════════════════════════════════════════ */
function coverage(){
  const n=new Date();
  const mStart=new Date(n.getFullYear(), n.getMonth(), 1);
  const all=_tickets().filter(t=>t && !_isOp(t) && t.createdAt && new Date(t.createdAt)>=mStart);
  const corr=all.filter(t=>t.maintType!=="وقائية");
  const prev=all.filter(t=>t.maintType==="وقائية");
  const closed=all.filter(t=>t.status==="مغلق");
  const pct=(a,b)=> b? Math.round(a/b*100) : null;
  return {
    monthLabel: n.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn",{year:"numeric",month:"long"}),
    total: all.length,
    responded:{ n:all.filter(t=>t.respondedAt).length, d:all.length, pct:pct(all.filter(t=>t.respondedAt).length, all.length) },
    restored:{  n:closed.filter(t=>t.restoredAt).length, d:closed.length, pct:pct(closed.filter(t=>t.restoredAt).length, closed.length) },
    scheduled:{ n:prev.filter(t=>t.scheduledFor).length, d:prev.length, pct:pct(prev.filter(t=>t.scheduledFor).length, prev.length) },
    stops:      all.filter(t=>Array.isArray(t.clockStops) && t.clockStops.length).length,
    corrective: corr.length
  };
}

function coverageHTML(){
  const c=coverage();
  const row=(label, o, hint)=>{
    const has=o.pct!=null;
    const col=!has?"var(--muted)":(o.pct>=80?"var(--stage-done)":o.pct>=40?"var(--stage-wait)":"var(--danger)");
    return `<div class="pf-cov">
      <div class="pf-cov-top">
        <div class="pf-cov-l">${_esc(label)}</div>
        <div class="pf-cov-v" style="color:${col}">${has?o.pct+"%":"—"}</div>
      </div>
      <div class="pf-bar"><div class="pf-bar-fill" style="width:${has?o.pct:0}%;background:${col}"></div></div>
      <div class="pf-cov-h">${has?`${o.n} من ${o.d}`:"لا بلاغاتٍ في هذا النطاق بعد"} — ${_esc(hint)}</div>
    </div>`;
  };
  return `
  <div class="card">
    <div class="card-header"><div class="card-title">${_svg("activity",16)} تغطيةُ البيانات — ${_esc(c.monthLabel)}</div></div>
    <div class="pf-hint">هذا <b>مقياسُ التقاطِ البيانات لا مقياسُ أداءِ الفريق</b>. في العقد الحقيقي
      كلُّ بلاغٍ بلا طابعٍ زمنيٍّ يسقط من مؤشره — فالتغطيةُ هي جاهزيتنا للقياس. ابدأ هنا، والدرجةُ تأتي بعدها.</div>
    <div class="pf-covs">
      ${row("زمن الاستجابة (وصول الفني)", c.responded, "مؤشر ٣٫١ — وزن ٤٪")}
      ${row("عودة الخدمة", c.restored, "مؤشر ٣٫٣ — وزن ٤٪")}
      ${row("الاستحقاق المخطَّط للوقائي", c.scheduled, "مؤشرا ٤٫١ و٤٫٢ — وزن ٢٠٪")}
    </div>
    <div class="pf-cov-foot">
      ${_svg("clipboardCheck",13)} بلاغاتُ الشهر: <b>${c.total}</b> · تصحيحية: <b>${c.corrective}</b>
      · موثَّقٌ لها إيقافُ ساعة: <b>${c.stops}</b>
    </div>
  </div>`;
}

/* ════════════════════════════════════════════════════════════
   [المرحلة ٣] سجلُّ عدم المطابقة — الحفظُ والقراءة
   ────────────────────────────────────────────────────────────
   مجموعةٌ لكل مشروع (<pid>_perf_ncrs) على نمط بلاغات المشروع — لا مجموعةً عامةً
   تخلط مشاريع، فخلطُ بيانات مشروعين أخطرُ عطلٍ في هذه المنصّة. القراءةُ بـ.get()
   بكاشٍ (لا onSnapshot — انظر ترويسة الملف)، والكتابةُ تُعيد الجلب قسراً.
   ════════════════════════════════════════════════════════════ */
function NCR_COLL(){
  let base="";
  try{ base=(typeof _pfx==="function") ? _pfx("perf_ncrs") : ""; }catch(e){ base=""; }
  if(!base) base=(_projId()? _projId()+"_" : "")+"perf_ncrs";
  let dev=false; try{ dev=(typeof IS_DEV!=="undefined" && IS_DEV); }catch(e){}
  return dev ? base+"_dev" : base;
}
function _db(){ try{ return (typeof db!=="undefined" && db) ? db : null; }catch(e){ return null; } }
function _audit(ev, detail){ try{ if(typeof logAudit==="function") logAudit(ev, detail); }catch(e){} }
function _nowISO(){ return new Date().toISOString(); }
function _todayYMD(){ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
/* من يُدخل المخالفات ويحرّرها: كلُّ ذي دورٍ عدا المشاهد والمراقب (نفسُ حدود الكتابة
   العامة في قواعد Firestore). الحذفُ للأدمن وحده — محوُ مخالفةٍ محوُ أثرٍ تعاقديّ. */
function _canEdit(){
  if(!canView()) return false;
  try{ if(typeof isViewer==="function" && isViewer()) return false; }catch(e){}
  return true;
}
function _canDelete(){ try{ return typeof isAdmin==="function" && isAdmin(); }catch(e){ return false; } }

let _ncr = { pid:"", list:[], loaded:false, err:false, at:0, fetching:false };
function _ncrInvalidate(){ _ncr.at=0; }
function _ncrFetch(force){
  const pid=_projId(); if(!pid) return;
  if(_ncr.pid!==pid) _ncr={ pid, list:[], loaded:false, err:false, at:0, fetching:false };
  if(_ncr.fetching) return;
  if(!force && _ncr.loaded && (Date.now()-_ncr.at)<60000) return;
  const d=_db();
  if(!d){ _ncr.loaded=true; return; }
  _ncr.fetching=true;
  d.collection(NCR_COLL()).orderBy("date","desc").limit(500).get().then(snap=>{
    const arr=[]; snap.forEach(doc=>{ const x=doc.data(); if(x) arr.push(x); });
    _ncr.list=arr; _ncr.loaded=true; _ncr.err=false; _ncr.at=Date.now(); _ncr.fetching=false;
    _rerenderIfActive();
  }).catch(()=>{
    /* فشلُ القراءة يظهر صريحاً في الشاشة — لا فراغٌ يُقرأ «لا مخالفات». */
    _ncr.fetching=false; _ncr.loaded=true; _ncr.err=true;
    _rerenderIfActive();
  });
}
function _rerenderIfActive(){
  const pg=document.getElementById("page-"+PAGE_ID);
  if(pg && pg.classList.contains("active")) render();
}
function _ncrById(id){ return _ncr.list.find(r=>r && r.id===id) || null; }
function _ncrWrite(docData, ev, detail){
  const d=_db();
  if(!d){ _toast("⚠ لا اتصال بقاعدة البيانات","warn"); return; }
  d.collection(NCR_COLL()).doc(docData.id).set(docData, { merge:true }).then(()=>{
    _audit(ev, detail);
    _ncrFetch(true);
  }).catch(()=>{ _toast("⚠ تعذّر الحفظ — أعد المحاولة","warn"); });
}

/* ════════════ إجراءات السجل (تُستدعى من onclick عبر performanceContract.*) ════════════ */
function _modal(opts){
  if(typeof showCustomModal!=="function"){ _toast("⚠ تعذّر فتح النافذة","warn"); return; }
  showCustomModal(opts);
}
function _kpiOptionsHTML(sel){
  const grpName={}; GROUPS.forEach(g=>grpName[g.key]=g.name);
  const by={};
  KPIS.forEach(k=>{ (by[k.grp]=by[k.grp]||[]).push(k); });
  return GROUPS.map(g=>`<optgroup label="${_esc(g.no)} — ${_esc(g.name)}">`+
    (by[g.key]||[]).map(k=>{
      const eff = k.ncrPct!=null ? `كل تقرير −${_pct(k.ncrPct)}%` : "يُقاس نسبةً — توثيقٌ واعتراض";
      return `<option value="${_esc(k.id)}" ${sel===k.id?"selected":""}>${_esc(k.id)} — ${_esc(k.name)} (${_esc(eff)})</option>`;
    }).join("")+`</optgroup>`).join("");
}
function _buildingOptionsHTML(sel){
  let bs=[]; try{ bs=Array.isArray(BUILDINGS)?BUILDINGS:[]; }catch(e){ bs=[]; }
  return `<option value="">—</option>`+bs.map(b=>`<option ${b===sel?"selected":""}>${_esc(b)}</option>`).join("");
}
function ncrNew(){
  if(!_isPerf()) return;
  if(!_canEdit()){ _toast("⚠ لا صلاحية","warn"); return; }
  _modal({
    title:"🗂 تسجيل تقرير عدم مطابقة",
    body:`<div style="font-size:12px;color:var(--muted);line-height:1.9;margin-bottom:10px">
        سجِّل التقرير <b>يوم استلامه</b> بتاريخ التقرير نفسه — فالأثرُ يُحسب على شهر التاريخ،
        وعدّادُ التكرار يُبنى عليه.</div>
      <div class="form-group" style="margin-bottom:10px">
        <label class="form-label">تاريخ التقرير *</label>
        <input class="form-input" type="date" id="pfn-date" value="${_todayYMD()}">
      </div>
      <div class="form-group" style="margin-bottom:10px">
        <label class="form-label">المؤشر الذي يخصم منه *</label>
        <select class="form-select" id="pfn-kpi">${_kpiOptionsHTML("")}</select>
      </div>
      <div class="form-group" style="margin-bottom:10px">
        <label class="form-label">وصف المخالفة *</label>
        <input class="form-input" id="pfn-desc" placeholder="نصُّ التقرير كما ورد من الاستشاري/الأمانة">
      </div>
      <div class="form-group" style="margin-bottom:10px">
        <label class="form-label">المبنى</label>
        <select class="form-select" id="pfn-building">${_buildingOptionsHTML("")}</select>
      </div>
      <div class="form-group" style="margin-bottom:10px">
        <label class="form-label">الأصل / الموقع</label>
        <input class="form-input" id="pfn-asset" placeholder="اختياري — مثال: مضخة الحريق — سطح المبنى أ">
      </div>
      <div class="form-group" style="margin-bottom:10px">
        <label class="form-label">مصدر التقرير</label>
        <select class="form-select" id="pfn-source">
          <option>الاستشاري</option><option>ممثل الأمانة</option><option>رصدٌ داخلي</option>
        </select>
      </div>
      <div style="display:flex;gap:10px">
        <div class="form-group" style="flex:1;margin-bottom:0">
          <label class="form-label">موعد التصحيح</label>
          <input class="form-input" type="date" id="pfn-due">
        </div>
        <div class="form-group" style="flex:1;margin-bottom:0">
          <label class="form-label">مسؤول التصحيح</label>
          <input class="form-input" id="pfn-owner" placeholder="اسم المشرف/الفني">
        </div>
      </div>`,
    okText:"🗂 سجِّل المخالفة",
    onOk:()=>{
      const v=id=>((document.getElementById(id)||{}).value||"").trim();
      const date=v("pfn-date"), kpi=v("pfn-kpi"), desc=v("pfn-desc");
      if(!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)){ _toast("⚠ أدخل تاريخ التقرير","warn"); return false; }
      if(!kpiById(kpi)){ _toast("⚠ اختر المؤشر","warn"); return false; }
      if(!desc){ _toast("⚠ اكتب وصف المخالفة","warn"); return false; }
      const u=_user();
      const rec={
        id:"ncr_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,7),
        date, kpi, desc,
        building:v("pfn-building"), asset:v("pfn-asset"), source:v("pfn-source")||"الاستشاري",
        status:"open", planDue:v("pfn-due"), planOwner:v("pfn-owner"),
        createdAt:_nowISO(), createdBy:(u&&u.name)||"النظام"
      };
      _ncrWrite(rec, "تسجيل تقرير عدم مطابقة", "المؤشر "+kpi+" — "+desc.slice(0,80));
      _toast("🗂 سُجّلت المخالفة على المؤشر "+kpi,"success");
    }
  });
}
function ncrClose(id){
  const r=_ncrById(id); if(!r) return;
  if(!_canEdit()){ _toast("⚠ لا صلاحية","warn"); return; }
  _modal({
    title:"✅ إغلاق المخالفة "+(r.kpi||""),
    body:`<div style="font-size:12px;color:var(--muted);line-height:1.9;margin-bottom:10px">
        الإغلاقُ بدليلٍ لا بقرار: اذكر ما نُفِّذ فعلاً وأين يجده المدقق (بلاغ · صورة · محضر).
        <b>الإغلاقُ هنا لا يمحو أثرَ الشهر</b> — التقريرُ صدر وأثرُه على شهره باقٍ؛
        الإغلاقُ يقطع تكرارَه في الأشهر التالية.</div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">دليل الإغلاق *</label>
        <input class="form-input" id="pfc-note" placeholder="مثال: أُصلح ضمن البلاغ HT-1042 وأُرفقت صور الإنجاز">
      </div>`,
    okText:"✅ أغلق بدليل",
    onOk:()=>{
      const note=((document.getElementById("pfc-note")||{}).value||"").trim();
      if(!note){ _toast("⚠ الإغلاق يحتاج دليلاً مكتوباً","warn"); return false; }
      const u=_user();
      _ncrWrite({ id:r.id, status:"closed", closeNote:note, closedAt:_nowISO(), closedBy:(u&&u.name)||"النظام" },
        "إغلاق تقرير عدم مطابقة", "المؤشر "+(r.kpi||"")+" — "+note.slice(0,80));
      _toast("✅ أُغلقت المخالفة","success");
    }
  });
}
/* الاعتراضُ المُسنَد: يجمع تلقائياً سجلّات المنصة المؤرّخة **قبل تاريخ التقرير أو يومَه**
   على نفس المبنى/الأصل — صورةٌ وسجلٌّ يسبقان التقريرَ هما حجّةُ الردّ (المرجع: ق٣). */
function ncrEvidence(r){
  const out=[];
  if(!r || !r.date) return out;
  const cutoff=r.date+"T23:59:59";
  const bld=(r.building||"").trim(), asset=(r.asset||"").trim().toLowerCase();
  _tickets().forEach(t=>{
    if(!t || !t.createdAt || t.createdAt>cutoff) return;
    const sameB = bld && t.building===bld;
    const sameA = asset && ((t.assetName||t.asset||"")+" "+(t.issue||t.title||"")).toLowerCase().includes(asset);
    if(!sameB && !sameA) return;
    out.push({
      id:t.id, building:t.building||"", status:t.status||"",
      createdAt:t.createdAt, closedAt:t.closedAt||"",
      photos:(Array.isArray(t.photos)?t.photos.length:0) + (Array.isArray(t.completionPhotos)?t.completionPhotos.length:0)
    });
  });
  out.sort((a,b)=> (b.createdAt||"").localeCompare(a.createdAt||""));
  return out.slice(0,15);
}
function ncrDispute(id){
  const r=_ncrById(id); if(!r) return;
  if(!_canEdit()){ _toast("⚠ لا صلاحية","warn"); return; }
  const ev=ncrEvidence(r);
  const evRows = ev.length ? ev.map(e=>`<tr>
      <td style="text-align:right;font-weight:700">${_esc(e.id)}</td>
      <td>${_esc((e.createdAt||"").slice(0,10))}</td>
      <td>${_esc(e.status)}</td>
      <td>${e.photos||0} 📷</td>
    </tr>`).join("")
    : `<tr><td colspan="4" style="color:var(--muted)">لا سجلّات مطابقةً قبل تاريخ التقرير — الاعتراضُ سيعتمد على بيانك وحده.</td></tr>`;
  _modal({
    title:"🛡 اعتراضٌ مُسنَد — "+(r.kpi||""),
    body:`<div style="font-size:12px;color:var(--muted);line-height:1.9;margin-bottom:10px">
        سجلّاتُ المنصة على <b>${_esc(r.building||r.asset||"نطاق التقرير")}</b> المؤرّخةُ
        قبل تاريخ التقرير (${_esc(r.date||"")}) — ما يسبق التقريرَ يصلح حجّةً:</div>
      <div style="overflow-x:auto;margin-bottom:10px">
        <table class="pf-tbl" style="min-width:0">
          <thead><tr><th style="text-align:right">البلاغ</th><th>تاريخه</th><th>حالته</th><th>صور</th></tr></thead>
          <tbody>${evRows}</tbody>
        </table>
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">نصّ الاعتراض *</label>
        <input class="form-input" id="pfd-note" placeholder="مثال: العيب مسجَّل ومغلق في HT-1042 قبل التقرير بأسبوع">
      </div>`,
    okText:"🛡 سجِّل الاعتراض",
    onOk:()=>{
      const note=((document.getElementById("pfd-note")||{}).value||"").trim();
      if(!note){ _toast("⚠ اكتب نصّ الاعتراض","warn"); return false; }
      const u=_user();
      _ncrWrite({ id:r.id, status:"disputed",
          objection:{ at:_nowISO(), by:(u&&u.name)||"النظام", note, evidence:ev } },
        "اعتراض على تقرير عدم مطابقة", "المؤشر "+(r.kpi||"")+" — أدلة: "+ev.length);
      _toast("🛡 سُجّل الاعتراض ("+ev.length+" دليلاً)","success");
    }
  });
}
function ncrDelete(id){
  const r=_ncrById(id); if(!r) return;
  if(!_canDelete()){ _toast("⚠ الحذف للأدمن وحده","warn"); return; }
  _modal({
    title:"🗑 حذف قيد المخالفة",
    body:`<div style="font-size:12.5px;line-height:1.9">حذفُ القيد يمحو أثرَه من العدّادات
      — يصلح <b>لقيدٍ أُدخل خطأً</b> فقط، لا لمخالفةٍ صحيحةٍ نتمنى زوالَها.
      المخالفة: <b>${_esc(r.kpi||"")}</b> — ${_esc((r.desc||"").slice(0,90))}</div>`,
    okText:"🗑 احذف نهائياً",
    onOk:()=>{
      const d=_db(); if(!d){ _toast("⚠ لا اتصال","warn"); return false; }
      d.collection(NCR_COLL()).doc(r.id).delete().then(()=>{
        _audit("حذف قيد عدم مطابقة","المؤشر "+(r.kpi||"")+" — "+(r.desc||"").slice(0,60));
        _ncrFetch(true);
      }).catch(()=>_toast("⚠ تعذّر الحذف","warn"));
      _toast("🗑 حُذف القيد","success");
    }
  });
}
function ncrReload(){ _ncrFetch(true); }

/* ════════════════════════════════════════════════════════════
   [الرقابة الاستباقية] الحفظُ والقراءة — نفسُ عهد سجلّ المخالفات:
   مجموعتان لكل مشروع، قراءةٌ بـ.get() بكاش، ولا onSnapshot.
   ════════════════════════════════════════════════════════════ */
function CMP_COLL(){
  let base=""; try{ base=(typeof _pfx==="function") ? _pfx("perf_compliance") : ""; }catch(e){ base=""; }
  if(!base) base=(_projId()? _projId()+"_" : "")+"perf_compliance";
  let dev=false; try{ dev=(typeof IS_DEV!=="undefined" && IS_DEV); }catch(e){}
  return dev ? base+"_dev" : base;
}
function TRN_COLL(){
  let base=""; try{ base=(typeof _pfx==="function") ? _pfx("perf_trainings") : ""; }catch(e){ base=""; }
  if(!base) base=(_projId()? _projId()+"_" : "")+"perf_trainings";
  let dev=false; try{ dev=(typeof IS_DEV!=="undefined" && IS_DEV); }catch(e){}
  return dev ? base+"_dev" : base;
}
let _cmp = { pid:"", state:{}, trainings:[], loaded:false, err:false, at:0, fetching:false };
function _cmpFetch(force){
  const pid=_projId(); if(!pid) return;
  if(_cmp.pid!==pid) _cmp={ pid, state:{}, trainings:[], loaded:false, err:false, at:0, fetching:false };
  if(_cmp.fetching) return;
  if(!force && _cmp.loaded && (Date.now()-_cmp.at)<60000) return;
  const d=_db();
  if(!d){ _cmp.loaded=true; return; }
  _cmp.fetching=true;
  Promise.all([
    d.collection(CMP_COLL()).doc("state").get(),
    d.collection(TRN_COLL()).orderBy("date","desc").limit(400).get()
  ]).then(([st,snap])=>{
    _cmp.state=(st && st.exists && st.data()) || {};
    const arr=[]; snap.forEach(doc=>{ const x=doc.data(); if(x) arr.push(x); });
    _cmp.trainings=arr; _cmp.loaded=true; _cmp.err=false; _cmp.at=Date.now(); _cmp.fetching=false;
    _rerenderIfActive();
  }).catch(()=>{
    _cmp.fetching=false; _cmp.loaded=true; _cmp.err=true;
    _rerenderIfActive();
  });
}
/* تحرير تواريخ الشهادات وعدد العاملين — مُدخلاتُ الرقابة اليدوية القليلة. */
function cmpEditState(){
  if(!_isPerf()) return;
  if(!_canEdit()){ _toast("⚠ لا صلاحية","warn"); return; }
  const s=_cmp.state||{}, certs=s.certs||{};
  const certRow=(id,label)=>`
      <div class="form-group" style="margin-bottom:10px">
        <label class="form-label">${label}</label>
        <input class="form-input" type="date" id="pfe-${id}" value="${_esc(certs[id]||"")}">
      </div>`;
  _modal({
    title:"🛡 إعدادات الرقابة الاستباقية",
    body:`<div style="font-size:12px;color:var(--muted);line-height:1.9;margin-bottom:10px">
        تواريخُ <b>انتهاء</b> الشهادات كما في الوثائق — والتنبيه يبدأ قبل ٩٠ يوماً.
        وعددُ العاملين هو مقامُ مستهدف التدريب (١٤ ساعة لكل عامل سنوياً).</div>
      ${certRow("c9001","ISO 9001 (الجودة) — تاريخ الانتهاء")}
      ${certRow("c14001","ISO 14001 (البيئة) — تاريخ الانتهاء")}
      ${certRow("c45001","ISO 45001 (السلامة المهنية) — تاريخ الانتهاء")}
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">عدد العاملين بالمشروع</label>
        <input class="form-input" type="number" min="0" step="1" id="pfe-staff" value="${_esc(s.staffCount!=null?String(s.staffCount):"")}">
      </div>`,
    okText:"💾 احفظ الإعدادات",
    onOk:()=>{
      const v=id=>((document.getElementById(id)||{}).value||"").trim();
      const re=/^\d{4}-\d{2}-\d{2}$/;
      const certsNew={};
      [["c9001","ISO 9001"],["c14001","ISO 14001"],["c45001","ISO 45001"]].forEach(([id])=>{
        const d=v("pfe-"+id);
        if(d && re.test(d)) certsNew[id]=d;
      });
      const staff=parseInt(v("pfe-staff"),10);
      const u=_user();
      const d=_db(); if(!d){ _toast("⚠ لا اتصال بقاعدة البيانات","warn"); return false; }
      d.collection(CMP_COLL()).doc("state").set({
        certs:certsNew,
        staffCount:(Number.isFinite(staff)&&staff>0)?staff:0,
        updatedAt:_nowISO(), updatedBy:(u&&u.name)||"النظام"
      },{merge:true}).then(()=>{
        _audit("تحديث إعدادات الرقابة الاستباقية","شهادات: "+Object.keys(certsNew).length+" · عاملون: "+(staff||0));
        _cmpFetch(true);
      }).catch(()=>_toast("⚠ تعذّر الحفظ","warn"));
      _toast("💾 حُفظت الإعدادات","success");
    }
  });
}
/* تسجيل تدريبٍ منفَّذ — الساعاتُ تُحسب على نافذة سنة العقد الجارية. */
function cmpAddTraining(){
  if(!_isPerf()) return;
  if(!_canEdit()){ _toast("⚠ لا صلاحية","warn"); return; }
  _modal({
    title:"🎓 تسجيل تدريبٍ منفَّذ",
    body:`<div style="font-size:12px;color:var(--muted);line-height:1.9;margin-bottom:10px">
        سجِّل التدريب يومَ تنفيذه بساعاته <b>الإجمالية</b> (عدد الحضور × مدة الجلسة) —
        فالمستهدف السنوي يُقاس بإجمالي الساعات مقابل ١٤ ساعةً لكل عامل.</div>
      <div style="display:flex;gap:10px">
        <div class="form-group" style="flex:1;margin-bottom:10px">
          <label class="form-label">تاريخ التنفيذ *</label>
          <input class="form-input" type="date" id="pft-date" value="${_todayYMD()}">
        </div>
        <div class="form-group" style="flex:1;margin-bottom:10px">
          <label class="form-label">إجمالي الساعات *</label>
          <input class="form-input" type="number" min="0.5" step="0.5" id="pft-hours" placeholder="مثال: 24">
        </div>
      </div>
      <div class="form-group" style="margin-bottom:10px">
        <label class="form-label">النوع *</label>
        <select class="form-select" id="pft-kind">
          <option value="مهنية">سلامة مهنية (المؤشر ٢٫٥)</option>
          <option value="بيئية">سلامة بيئية (المؤشر ٢٫٦)</option>
        </select>
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">الموضوع والحضور</label>
        <input class="form-input" id="pft-topic" placeholder="مثال: إخلاء وإطفاء — 12 فنياً × ساعتان">
      </div>`,
    okText:"🎓 سجِّل التدريب",
    onOk:()=>{
      const v=id=>((document.getElementById(id)||{}).value||"").trim();
      const date=v("pft-date"), hours=parseFloat(v("pft-hours")), kind=v("pft-kind");
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){ _toast("⚠ أدخل تاريخ التنفيذ","warn"); return false; }
      if(!Number.isFinite(hours) || hours<=0){ _toast("⚠ أدخل الساعات","warn"); return false; }
      const u=_user();
      const rec={
        id:"trn_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,7),
        date, hours, kind:(kind==="بيئية"?"بيئية":"مهنية"), topic:v("pft-topic"),
        createdAt:_nowISO(), createdBy:(u&&u.name)||"النظام"
      };
      const d=_db(); if(!d){ _toast("⚠ لا اتصال بقاعدة البيانات","warn"); return false; }
      d.collection(TRN_COLL()).doc(rec.id).set(rec).then(()=>{
        _audit("تسجيل تدريب",""+rec.kind+" — "+rec.hours+" ساعة");
        _cmpFetch(true);
      }).catch(()=>_toast("⚠ تعذّر الحفظ","warn"));
      _toast("🎓 سُجّل التدريب","success");
    }
  });
}
function cmpDeleteTraining(id){
  const r=_cmp.trainings.find(x=>x&&x.id===id); if(!r) return;
  if(!_canDelete()){ _toast("⚠ الحذف للأدمن وحده","warn"); return; }
  _modal({
    title:"🗑 حذف قيد التدريب",
    body:`<div style="font-size:12.5px;line-height:1.9">حذفُ قيدٍ أُدخل خطأً:
      <b>${_esc(r.kind||"")}</b> — ${_esc(String(r.hours||""))} ساعة بتاريخ ${_esc(r.date||"")}</div>`,
    okText:"🗑 احذف",
    onOk:()=>{
      const d=_db(); if(!d){ _toast("⚠ لا اتصال","warn"); return false; }
      d.collection(TRN_COLL()).doc(r.id).delete().then(()=>{
        _audit("حذف قيد تدريب", r.kind+" — "+r.hours+" ساعة");
        _cmpFetch(true);
      }).catch(()=>_toast("⚠ تعذّر الحذف","warn"));
      _toast("🗑 حُذف القيد","success");
    }
  });
}
function cmpReload(){ _cmpFetch(true); }

function render(){
  const el=document.getElementById("page-"+PAGE_ID);
  if(!el) return;
  if(!_isPerf()){
    el.innerHTML = `<div class="pf-empty"><div class="pf-empty-t">هذا القسم لمشاريع «العقد القائم على الأداء»</div>
      <div class="pf-empty-s">فعّل الخيار من: لوحة الإدارة ← المشاريع ← تعديل المشروع.</div></div>`;
    return;
  }
  const cfg=_cfg()||{}, y=_year(), m=_month(), minS=_minScore(), grace=_inGrace();
  const yIdx=Math.min(Math.max(y,1),AR_YEARS.length)-1;

  _ncrFetch(false);
  _cmpFetch(false);
  el.innerHTML =
    heroHTML(cfg, y, m, minS, grace) +
    proactiveHTML(cfg) +
    ncrSectionHTML(minS) +
    coverageHTML() +
    scorecardHTML(yIdx) +
    penaltyHTML(cfg) +
    roadmapHTML();
}

/* ════════════════════════════════════════════════════════════
   [الرقابة الاستباقية] الشاشة — كلُّ نقطةٍ ذاتِ حسميةٍ مباشرة بحالتها
   **قبل** أن يكتبها الاستشاري. ألوانُ الحالة من مستويات الدوال النقية.
   ════════════════════════════════════════════════════════════ */
const _CMP_LEVELS = {
  ok:      { txt:"آمن",            col:"var(--stage-done)" },
  d90:     { txt:"٩٠ يوماً",       col:"var(--warn)" },
  d60:     { txt:"٦٠ يوماً",       col:"var(--warn)" },
  d30:     { txt:"٣٠ يوماً ⚠",     col:"var(--danger)" },
  expired: { txt:"منتهية ❌",       col:"var(--danger)" },
  warn:    { txt:"يقترب",          col:"var(--warn)" },
  low:     { txt:"تحت المستهدف",   col:"var(--danger)" },
  danger:  { txt:"تجاوز السقف",    col:"var(--danger)" },
  na:      { txt:"—",              col:"var(--muted)" }
};
function _cmpRow(icon, label, hint, valueTxt, level){
  const lv=_CMP_LEVELS[level]||_CMP_LEVELS.na;
  return `<div class="pf-cmp">
    <div class="pf-cmp-i">${_svg(icon,15)}</div>
    <div style="flex:1;min-width:0">
      <div class="pf-cmp-l">${label}</div>
      <div class="pf-cmp-h">${hint}</div>
    </div>
    <div class="pf-cmp-v" style="color:${lv.col}">${valueTxt}</div>
    <div class="pf-cmp-s" style="color:${lv.col}">${_esc(lv.txt)}</div>
  </div>`;
}
function proactiveHTML(cfg){
  const s=_cmp.state||{}, certs=s.certs||{};
  const today=_todayYMD();

  const loadNote = !_cmp.loaded ? `<div class="pf-hint">جارٍ تحميل بيانات الرقابة…</div>`
    : (_cmp.err ? `<div class="pf-note pf-note-warn">${_svg("alertTriangle",16)}
        <div><b>تعذّرت قراءة بيانات الرقابة.</b>
        <button class="btn btn-sm" onclick="performanceContract.cmpReload()">↻ إعادة التحميل</button></div></div>` : "");

  /* الشهادات الثلاث (١٫١) */
  const certDefs=[["c9001","ISO 9001 — الجودة"],["c14001","ISO 14001 — البيئة"],["c45001","ISO 45001 — السلامة"]];
  const certRows=certDefs.map(([id,label])=>{
    const st=certStatus(certs[id], today);
    const val = st ? (st.days<0 ? "منذ "+Math.abs(st.days)+" يوماً" : "بعد "+st.days+" يوماً") : "لم يُدخَل";
    return _cmpRow("shield", label,
      "المؤشر ١٫١ — حسمية ١١–٢٠ ألف ريال/شهادة سنوياً (التعارض ٥ مفتوح)"+(certs[id]?" · تنتهي "+_esc(certs[id]):""),
      _esc(val), st?st.level:"na");
  }).join("");

  /* التدريب (٢٫٥/٢٫٦) على نافذة سنة العقد الجارية */
  const winStart=contractYearStartISO((cfg&&cfg.startDate)||"", today);
  const trnKinds=[["مهنية","التدريب — سلامة مهنية","المؤشر ٢٫٥"],["بيئية","التدريب — سلامة بيئية","المؤشر ٢٫٦"]];
  const trnRows=trnKinds.map(([kind,label,ind])=>{
    const p=trainingProgress(_cmp.trainings, winStart, today, s.staffCount, kind);
    const val = p.pct!=null ? _pct(p.pct)+"% ("+p.hours+" من "+p.target+" ساعة)"
              : (p.hours+" ساعة"+(p.staff?"":" — أدخِل عدد العاملين للمستهدف"));
    return _cmpRow("users", label,
      ind+" — المستهدف ١٤ ساعة/عامل في سنة العقد، والحسمية تحت ٩٠٪ (١١ ألف ريال)"+(winStart?" · منذ "+_esc(winStart):""),
      _esc(val), p.level);
  }).join("");

  /* نسبة ١٫٦ لشهرنا — بالعدد (الاستفسار ٤ مُعلَن) */
  const c=coverage();
  const prevCount=c.total-c.corrective;
  const r16=ratio16(c.corrective, prevCount);
  const r16Row=_cmpRow("activity","نسبة التصحيحية إلى الإجمالية — هذا الشهر",
    "المؤشر ١٫٦ — سقف العقد ٣٠٪، وتُحسب هنا بالعدد لا بالقيمة (الاستفسار ٤ المفتوح) · تصحيحية "+c.corrective+" · وقائية "+prevCount,
    r16.pct!=null?_pct(r16.pct)+"%":"لا بلاغات بعد", r16.level);

  /* رضا الشهر (١٫٥) من تقييمات الإغلاق */
  const n=new Date(); const mStart=new Date(n.getFullYear(), n.getMonth(), 1);
  const ratings=_tickets().filter(t=>t && !_isOp(t) && t.status==="مغلق" && t.closedAt && new Date(t.closedAt)>=mStart).map(t=>t.rating);
  const sat=satisfactionMonthly(ratings);
  const satRow=_cmpRow("checkCircle","رضا المستفيدين — هذا الشهر",
    "المؤشر ١٫٥ — عتبة العقد ٩٠٪ والحسمية ١٠ آلاف ريال · من تقييمات إغلاق البلاغات ("+sat.n+" تقييماً)",
    sat.pct!=null?_pct(sat.pct)+"%":"لا تقييمات بعد — درِّب المشرفين على تقييم كل إغلاق", sat.level);

  return `
  <div class="card">
    <div class="card-header">
      <div class="card-title">${_svg("shield",16)} الرقابة الاستباقية — قبل أن يكتبها الاستشاري</div>
      ${_canEdit()?`<div style="display:flex;gap:7px;flex-wrap:wrap">
        <button class="btn btn-sm" onclick="performanceContract.cmpEditState()">⚙ الشهادات والعاملون</button>
        <button class="btn btn-primary btn-sm" onclick="performanceContract.cmpAddTraining()">🎓 تسجيل تدريب</button>
      </div>`:""}
    </div>
    <div class="pf-hint">من يصل للاجتماع الشهري برقمه الموثّق يناقش؛ ومن يصل بلا رقمٍ يوقّع على رقم غيره.
      هذه النقاط ذاتُ حسميةٍ نقديةٍ مباشرة — راقبها هنا وأغلقها <b>قبل</b> أن تصير تقريرَ عدم مطابقة.
      وجولاتُ التفتيش والسلامة تُدار من <b>خطط الصيانة الدورية</b> (خطة «جولة تفتيش سلامة» لكل موقع)
      فتُغذّي مؤشرَي ٤٫١/٤٫٢ وتحميك في ٥٫١.</div>
    ${loadNote}
    <div class="pf-cmps">
      ${certRows}
      ${trnRows}
      ${r16Row}
      ${satRow}
    </div>
    ${_cmp.trainings.length?`<div class="pf-cov-foot">${_svg("clipboardCheck",13)}
      آخر تدريب: <b>${_esc(_cmp.trainings[0].date||"")}</b> — ${_esc(_cmp.trainings[0].kind||"")}
      (${_esc(String(_cmp.trainings[0].hours||""))} ساعة)
      ${_canDelete()?`<button class="btn btn-sm" onclick="performanceContract.cmpDeleteTraining('${_esc(_cmp.trainings[0].id)}')">🗑</button>`:""}
      · إجمالي القيود: ${_cmp.trainings.length}</div>`:""}
  </div>`;
}

/* ════════════════════════════════════════════════════════════
   [المرحلة ٣] شاشة سجلّ عدم المطابقة
   ════════════════════════════════════════════════════════════ */
const NCR_STATUS = {
  open:     { label:"مفتوحة",       cls:"pf-st-open" },
  disputed: { label:"معترَضٌ عليها", cls:"pf-st-disp" },
  closed:   { label:"مغلقةٌ بدليل",  cls:"pf-st-done" }
};
function ncrSectionHTML(minS){
  const ymNow=ncrMonthKey(_todayYMD());
  const th=(minS!=null)?minS:NCR_TH_DEFAULT;
  const roll=ncrRollup(_ncr.list, ymNow, th);
  const trial=_isTrial();
  const monthLabel=new Date().toLocaleDateString("ar-SA-u-ca-gregory-nu-latn",{year:"numeric",month:"long"});

  const loadNote = !_ncr.loaded
    ? `<div class="pf-hint">جارٍ تحميل السجل…</div>`
    : (_ncr.err ? `<div class="pf-note pf-note-warn">${_svg("alertTriangle",16)}
        <div><b>تعذّرت قراءة سجلّ المخالفات.</b> ما تراه غير مكتمل — أعد المحاولة.
        <button class="btn btn-sm" onclick="performanceContract.ncrReload()">↻ إعادة التحميل</button></div></div>` : "");

  /* بطاقات الشهر */
  const overduePlans=_ncr.list.filter(r=>r && r.status==="open" && r.planDue && r.planDue<_todayYMD()).length;
  const tiles=`
  <div class="stats-grid" style="margin-bottom:14px">
    <div class="stat-tile">
      <div class="st-label">تقارير ${_esc(monthLabel)}</div>
      <div class="st-value">${roll.monthCount}</div>
      <div class="st-sub">${_ncr.list.filter(r=>r&&r.status==="open").length} مفتوحةٌ إجمالاً</div>
    </div>
    <div class="stat-tile">
      <div class="st-label">أثرُ التقارير على الدرجة</div>
      <div class="st-value" style="color:${roll.impactPts>0?"var(--danger)":"var(--stage-done)"}">−${_pct(roll.impactPts)}</div>
      <div class="st-sub">نقطةً مئويةً من المؤشرات الموزونة</div>
    </div>
    <div class="stat-tile">
      <div class="st-label">حسمياتٌ مقدَّرة${trial?' <span class="pf-tag">تدريبيّ</span>':''}</div>
      <div class="st-value" style="color:${roll.dedTotal>0?"var(--danger)":"var(--stage-done)"}">${_money(roll.dedTotal)}</div>
      <div class="st-sub">ريال — للمؤشرات تحت عتبة ${_pct(th)}%</div>
    </div>
    <div class="stat-tile">
      <div class="st-label">تصحيحاتٌ متأخرة</div>
      <div class="st-value" style="color:${overduePlans?"var(--danger)":"var(--stage-done)"}">${overduePlans}</div>
      <div class="st-sub">مخالفةٌ مفتوحةٌ تجاوزت موعدَ تصحيحها</div>
    </div>
  </div>`;

  /* جدول الاتجاه: مؤشرٌ عليه حركةٌ هذا الشهر أو سلسلةُ تكرارٍ حيّة */
  const trendRows=roll.rows.map(r=>{
    const scoreTxt = r.score==null ? "—" : _pct(r.score)+"%";
    const state = r.score==null
      ? `<span class="pf-muted">توثيقٌ فقط</span>`
      : (r.breached
          ? `<span style="color:var(--danger);font-weight:800">تحت العتبة ×${dedMultiplier(r.streak)}</span>`
          : (r.score<=th+0.10
              ? `<span style="color:var(--warn);font-weight:800">يقترب</span>`
              : `<span style="color:var(--stage-done);font-weight:800">آمن</span>`));
    return `<tr>
      <td style="text-align:right;white-space:normal"><b>${_esc(r.id)}</b> ${_esc(r.name)}</td>
      <td>${r.count}</td>
      <td>${scoreTxt}</td>
      <td>${r.breached?r.streak:"—"}</td>
      <td>${r.ded?_money(r.ded):"—"}</td>
      <td>${state}</td>
    </tr>`;
  }).join("");
  const trend = roll.rows.length ? `
    <div class="pf-tbl-wrap">
      <table class="pf-tbl">
        <thead><tr>
          <th style="text-align:right">المؤشر</th><th>تقارير الشهر</th><th>درجته</th>
          <th>تكرارٌ متتالٍ</th><th>حسميته${trial?" (تدريبيّ)":""}</th><th>الحالة</th>
        </tr></thead>
        <tbody>${trendRows}</tbody>
      </table>
    </div>` : (_ncr.loaded && !_ncr.err ? `<div class="pf-hint" style="padding-top:4px">لا تقاريرَ هذا الشهر — الجدول يظهر مع أول تسجيل.</div>` : "");

  /* السجل نفسه */
  const listRows=_ncr.list.slice(0,60).map(r=>{
    const st=NCR_STATUS[r.status]||NCR_STATUS.open;
    const k=kpiById(r.kpi);
    const acts=[
      (r.status!=="closed" && _canEdit()) ? `<button class="btn btn-sm" onclick="performanceContract.ncrClose('${_esc(r.id)}')">✅ إغلاق</button>` : "",
      (r.status==="open" && _canEdit())   ? `<button class="btn btn-sm" onclick="performanceContract.ncrDispute('${_esc(r.id)}')">🛡 اعتراض</button>` : "",
      _canDelete() ? `<button class="btn btn-sm" onclick="performanceContract.ncrDelete('${_esc(r.id)}')">🗑</button>` : ""
    ].filter(Boolean).join(" ");
    return `<tr>
      <td>${_esc(r.date||"")}</td>
      <td><b>${_esc(r.kpi||"")}</b>${k&&k.ncrPct!=null?` <span class="pf-muted">−${_pct(k.ncrPct)}%</span>`:""}</td>
      <td style="text-align:right;white-space:normal;max-width:260px">${_esc(r.desc||"")}
        ${r.building?`<div class="pf-muted" style="font-size:10.5px">${_esc(r.building)}${r.asset?" — "+_esc(r.asset):""}</div>`:""}
        ${r.status==="disputed"&&r.objection?`<div class="pf-muted" style="font-size:10.5px">🛡 ${_esc((r.objection.note||"").slice(0,70))} (${(r.objection.evidence||[]).length} دليلاً)</div>`:""}
        ${r.status==="closed"&&r.closeNote?`<div class="pf-muted" style="font-size:10.5px">✅ ${_esc((r.closeNote||"").slice(0,70))}</div>`:""}</td>
      <td>${_esc(r.source||"")}</td>
      <td>${r.planDue?`${_esc(r.planDue)}${r.status==="open"&&r.planDue<_todayYMD()?' <span style="color:var(--danger);font-weight:800">متأخر</span>':""}`:"—"}</td>
      <td><span class="pf-st ${st.cls}">${st.label}</span></td>
      <td style="white-space:nowrap">${acts}</td>
    </tr>`;
  }).join("");
  const list=_ncr.list.length?`
    <div class="pf-tbl-wrap">
      <table class="pf-tbl">
        <thead><tr>
          <th>التاريخ</th><th>المؤشر</th><th style="text-align:right">المخالفة</th>
          <th>المصدر</th><th>موعد التصحيح</th><th>الحالة</th><th>إجراء</th>
        </tr></thead>
        <tbody>${listRows}</tbody>
      </table>
      ${_ncr.list.length>60?`<div class="pf-hint">يُعرض أحدث ٦٠ قيداً من ${_ncr.list.length}.</div>`:""}
    </div>`:"";

  return `
  <div class="card">
    <div class="card-header">
      <div class="card-title">${_svg("clipboardCheck",16)} سجلّ عدم المطابقة (NCR)</div>
      ${_canEdit()?`<button class="btn btn-primary btn-sm" onclick="performanceContract.ncrNew()">＋ تسجيل مخالفة</button>`:""}
    </div>
    <div class="pf-hint"><b>٥١٫٥٪ من درجة البطاقة تقاريرُ يكتبها الطرف الآخر</b> — فكلُّ تقريرٍ يُسجَّل
      هنا يومَ وصوله، ويُربط بمؤشره فيظهر أثرُه فوراً، ويُغلق بدليلٍ أو يُعترَض عليه بسجلّاتٍ
      تسبق تاريخه. <b>كسرُ التكرار أهمُّ من كل شيء</b>: مؤشرٌ سقط الشهرَ الماضي إنقاذُه هذا
      الشهرَ يوفّر ثلثي حسميته. <span class="pf-muted">(عدّادُ التكرار يفترض التصفيرَ بعد شهرِ
      امتثالٍ — الاستفسار ٦ المرفوع للأمانة، والعتبةُ حدُّ السنة الأدنى — الاستفسار ٢.)</span></div>
    ${loadNote}
    ${tiles}
    ${trend}
    ${list}
  </div>`;
}

function heroHTML(cfg, y, m, minS, grace){
  const yName = AR_YEARS[Math.min(Math.max(y,1),AR_YEARS.length)-1] || ("رقم "+y);
  return `
  <div class="page-hero">
    <div class="page-hero-title">${_svg("barChart",20)} تقييم الأداء</div>
    <div class="page-hero-sub">${_esc((_proj()&&_proj().name)||"")} — عقدٌ قائمٌ على الأداء</div>
  </div>

  ${_isTrial() ? `<div class="pf-note pf-note-trial">${_svg("alertTriangle",16)}
    <div><b>وضعٌ تجريبيّ — قياسٌ بلا غرامات.</b> العقد يعمل هنا للتدريب وبناء البيانات
    قبل الاستلام: لا خصمَ ولا التزامَ ماليّاً، وكلُّ مبلغٍ معروضٍ <b>تدريبيٌّ للتوضيح</b>.
    الغرضُ أن تتشكّل العادةُ ويظهر خطُّ الأساس قبل أن يصير المال على المحكّ.</div>
  </div>` : ""}

  ${grace ? `<div class="pf-note pf-note-ok">${_svg("shield",16)}
    <div><b>مهلة الإعفاء سارية</b> — نحن في الشهر ${m} من العقد، ولا تُطبَّق الغرامات قبل
    الشهر ${_graceMonths()+1} (بند ٦٣). هذه نافذةُ الضبط: ما يُبنى الآن يحدّد درجة أول شهرٍ محتسَب.</div>
  </div>` : ""}

  <div class="stats-grid" style="margin-bottom:14px">
    <div class="stat-tile">
      <div class="st-label">المبلغ الشهري المقطوع${_isTrial()?' <span class="pf-tag">تدريبيّ</span>':''}</div>
      <div class="st-value">${cfg.monthlyAmount ? _money(cfg.monthlyAmount) : "—"}</div>
      <div class="st-sub">${cfg.monthlyAmount ? "ريال / بلا ضريبة" : "لم يُدخَل بعد"}</div>
    </div>
    <div class="stat-tile">
      <div class="st-label">سنة العقد</div>
      <div class="st-value">${yName}</div>
      <div class="st-sub">الشهر ${m} من التنفيذ</div>
    </div>
    <div class="stat-tile">
      <div class="st-label">الحد الأدنى للنجاح</div>
      <div class="st-value" style="color:var(--stage-wait)">${minS!=null?_pct(minS)+"%":"—"}</div>
      <div class="st-sub">النزول تحته ثلاث مراتٍ متتالية ⇒ حقُّ الفسخ</div>
    </div>
    <div class="stat-tile">
      <div class="st-label">النتيجة السنوية المستهدفة</div>
      <div class="st-value">${_pct(yearTarget(Math.min(Math.max(y,1),AR_YEARS.length)-1))}%</div>
      <div class="st-sub">مجموع الأوزان × مستهدفات السنة</div>
    </div>
  </div>`;
}

function scorecardHTML(yIdx){
  // الشريط نسبيٌّ إلى **أثقل مجموعة** لا نسبةٌ مطلقة: فأثقلُها يملأ الشريط
  // وتُقرأ الأوزان بالمقارنة البصرية. (نسبةٌ مطلقةٌ تجعل كلَّ الأشرطة شبه فارغة.)
  const maxW = GROUPS.reduce((m,g)=> g.weight>m ? g.weight : m, 0) || 1;
  const rows = GROUPS.map(g=>`
    <div class="pf-grp">
      <div class="pf-grp-head">
        <div class="pf-grp-no">${g.no}</div>
        <div style="flex:1;min-width:0">
          <div class="pf-grp-name">${_esc(g.name)}</div>
          <div class="pf-grp-meta">${g.kpis} مؤشرات — مستهدف السنة ${_pct(g.targets[yIdx]!=null?g.targets[yIdx]:g.targets[g.targets.length-1])}%</div>
        </div>
        <div class="pf-grp-w">${_pct(g.weight)}<span>%</span></div>
      </div>
      <div class="pf-bar"><div class="pf-bar-fill" style="width:${Math.round(g.weight/maxW*100)}%"></div></div>
      <div class="pf-grp-src">${_svg("layers",13)} <span>${_esc(g.source)}</span></div>
      <div class="pf-grp-gap">${_svg("alertTriangle",13)} <span>${_esc(g.gap)}</span></div>
    </div>`).join("");

  const yearsHead = AR_YEARS.map((n,i)=>`<th class="${i===yIdx?"pf-th-now":""}">${n}</th>`).join("");
  const yearsRow  = AR_YEARS.map((n,i)=>`<td class="${i===yIdx?"pf-td-now":""}">${_pct(yearTarget(i))}%</td>`).join("");

  return `
  <div class="card">
    <div class="card-header"><div class="card-title">${_svg("target",16)} بطاقة الأداء المتوازن — المجموعات الخمس</div></div>
    <div class="pf-hint">المجموعات مطابقةٌ لركائز نطاق العمل في بند ٦٧ من الكراسة، والأوزان من ملف الاستشاري (V3).
      كلُّ درجةٍ مردودةٌ إلى نصٍّ في العقد — فتَقصُر مسافةُ الجدل في الاجتماع الشهري.</div>
    <div class="pf-grps">${rows}</div>
    <div class="pf-tbl-wrap">
      <table class="pf-tbl">
        <thead><tr><th style="text-align:right">النتيجة السنوية المستهدفة</th>${yearsHead}</tr></thead>
        <tbody><tr><td style="text-align:right;font-weight:800">المطلوب تحقيقه</td>${yearsRow}</tr></tbody>
      </table>
    </div>
  </div>`;
}

function penaltyHTML(cfg){
  const amt=cfg.monthlyAmount||0;
  const rows=PENALTY_SCALE.map(r=>`
    <tr>
      <td style="text-align:right">${r.label}${r.sub?` <span class="pf-muted">(${r.sub})</span>`:""}</td>
      <td>${r.pct?_pct(r.pct)+"%":"لا يوجد"}</td>
      <td>${r.pct&&amt?_money(Math.round(amt*r.pct)):(r.pct?"—":"0")}</td>
    </tr>`).join("");
  return `
  <div class="card">
    <div class="card-header"><div class="card-title">${_svg("alertTriangle",16)} مقياس الغرامة الشهرية${_isTrial()?' <span class="pf-tag">تدريبيّ — لا يُحتسب</span>':''}</div></div>
    <div class="pf-hint">الانحراف = الدرجة الشهرية − الحد الأدنى. والغرامة نسبةٌ من المبلغ الشهري المقطوع (بند ٦٣)،
      بسقفٍ تراكميٍّ ٢٠٪ من قيمة العقد (بند ٦٥).</div>
    <div class="pf-tbl-wrap">
      <table class="pf-tbl">
        <thead><tr><th style="text-align:right">نطاق الانحراف</th><th>نسبة الغرامة</th><th>القيمة (ريال)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${!amt?`<div class="pf-note pf-note-warn" style="margin:12px 0 0">${_svg("alertTriangle",16)}
      <div>لم يُدخَل المبلغ الشهري المقطوع بعد — أدخِله من: لوحة الإدارة ← المشاريع ← تعديل المشروع، لتظهر القيم بالريال.</div></div>`:""}
    <div class="pf-note pf-note-warn" style="margin:12px 0 0">${_svg("alertCircle",16)}
      <div><b>الغرامة ليست الخطر الأكبر.</b> بجانبها «حسمياتٌ تلقائية»: مبالغُ ثابتةٌ لكل مؤشرٍ ينزل عن عتبته،
      <b>تتضاعف حتى ثلاثة أضعافٍ</b> بتكرار التقصير شهراً بعد شهر. في المثال المحسوب في ملف الاستشاري بلغت
      ٩٠٪ من إجمالي الاقتطاع. ولهذا يتتبّع النظام — في المرحلة ٤ — عدّادَ تكرارٍ لكل مؤشرٍ على حدة.</div>
    </div>
  </div>`;
}

function roadmapHTML(){
  const steps=[
    { n:"١", t:"نوعُ المشروع", d:"عَلَمُ «عقد قائم على الأداء» وإعداداته، وهذا القسم.", done:true },
    { n:"٢", t:"الحقول التي تُغذّي المؤشرات", d:"«وصلتُ للموقع» · «رجعت الخدمة» · «توقف الساعة» · تاريخُ استحقاق المهمة الوقائية — والجدولُ المعتمد لم يعد ينزاح. تفتح ٢٨ درجةً من ١٠٠.", done:true },
    { n:"٣", t:"سجلّ عدم المطابقة", d:"استقبالُ المخالفة وربطُها بالمؤشر، وأثرُها المحسوب فوراً (درجةُ المؤشر · عدّادُ التكرار · الحسمية)، واعتراضٌ مُسنَدٌ بسجلّاتٍ تسبق التقرير. يحمي ٥١٫٥ درجة.", done:true },
    { n:"٤", t:"الدرجة والغرامة الحيّة", d:"الدرجةُ أثناء الشهر · الخصمُ المتوقَّع · عدّادا التكرار والإنذار · «ماذا لو».", done:false },
    { n:"٥", t:"السلامة والتوطين و٩٤٠", d:"سجلُّ الحوادث · تصاريحُ العمل · لوحةُ التوطين · بلاغاتُ ٩٤٠. (سُبقت منها الشهاداتُ والتدريبُ ونسبةُ ١٫٦ والرضا — في بطاقة «الرقابة الاستباقية».)", done:false }
  ];
  return `
  <div class="card">
    <div class="card-header"><div class="card-title">${_svg("map",16)} خطة التفعيل</div></div>
    <div class="pf-hint">لا تُعرَض درجةٌ محسوبةٌ قبل اكتمال حقولها — <b>رقمٌ كاذبٌ في عقدٍ يُحاسَب عليه المال
      أسوأ من لا رقم</b>. كلُّ مرحلةٍ تُضيء ما تملك بياناته.</div>
    <div class="pf-steps">
      ${steps.map(s=>`
      <div class="pf-step ${s.done?"pf-step-done":""}">
        <div class="pf-step-n">${s.done?_svg("checkCircle",15):s.n}</div>
        <div style="flex:1;min-width:0">
          <div class="pf-step-t">${_esc(s.t)} ${s.done?'<span class="pf-badge-ok">مكتملة</span>':'<span class="pf-badge-wait">قادمة</span>'}</div>
          <div class="pf-step-d">${_esc(s.d)}</div>
        </div>
      </div>`).join("")}
    </div>
  </div>`;
}

/* ════════════════════════════════════════════════════════════
   طبقة CSS رقيقة — ما لا مقابل له في المنصة فقط
   ════════════════════════════════════════════════════════════ */
function injectCSS(){
  if(document.getElementById("pf-css")) return;
  const st=document.createElement("style"); st.id="pf-css";
  st.textContent=`
  #page-${PAGE_ID} .pf-note{display:flex;gap:9px;align-items:flex-start;border-radius:10px;padding:11px 13px;font-size:12.5px;line-height:1.9;margin-bottom:14px}
  #page-${PAGE_ID} .pf-note svg{flex:0 0 auto;margin-top:3px}
  #page-${PAGE_ID} .pf-note-ok{background:color-mix(in srgb,var(--stage-done) 8%,var(--surface));border:1px solid color-mix(in srgb,var(--stage-done) 25%,var(--border));color:var(--text)}
  #page-${PAGE_ID} .pf-note-warn{background:color-mix(in srgb,var(--warn) 8%,var(--surface));border:1px solid color-mix(in srgb,var(--warn) 25%,var(--border));color:var(--text)}
  #page-${PAGE_ID} .pf-hint{font-size:11.5px;color:var(--muted);line-height:1.95;padding:0 4px 12px}
  #page-${PAGE_ID} .pf-muted{color:var(--muted);font-weight:400}
  #page-${PAGE_ID} .pf-grps{display:flex;flex-direction:column;gap:11px}
  #page-${PAGE_ID} .pf-grp{border:1px solid var(--border);border-radius:12px;padding:12px 13px;background:var(--surface)}
  #page-${PAGE_ID} .pf-grp-head{display:flex;align-items:center;gap:11px}
  #page-${PAGE_ID} .pf-grp-no{width:26px;height:26px;flex:0 0 auto;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;background:color-mix(in srgb,var(--primary) 10%,var(--surface));color:var(--primary);border:1px solid color-mix(in srgb,var(--primary) 20%,var(--border))}
  #page-${PAGE_ID} .pf-grp-name{font-weight:800;font-size:13.5px;line-height:1.5}
  #page-${PAGE_ID} .pf-grp-meta{font-size:11px;color:var(--muted);margin-top:2px}
  #page-${PAGE_ID} .pf-grp-w{font-weight:900;font-size:20px;color:var(--primary);flex:0 0 auto;line-height:1}
  #page-${PAGE_ID} .pf-grp-w span{font-size:11px;font-weight:800;opacity:.7}
  #page-${PAGE_ID} .pf-bar{height:6px;border-radius:99px;background:var(--surface2);overflow:hidden;margin:10px 0 9px}
  #page-${PAGE_ID} .pf-bar-fill{height:100%;border-radius:99px;background:var(--primary);max-width:100%}
  #page-${PAGE_ID} .pf-grp-src,#page-${PAGE_ID} .pf-grp-gap{display:flex;gap:7px;align-items:flex-start;font-size:11.5px;line-height:1.8}
  #page-${PAGE_ID} .pf-grp-src{color:var(--muted)}
  #page-${PAGE_ID} .pf-grp-gap{color:var(--warn);margin-top:3px}
  #page-${PAGE_ID} .pf-grp-src svg,#page-${PAGE_ID} .pf-grp-gap svg{flex:0 0 auto;margin-top:3px}
  #page-${PAGE_ID} .pf-tbl-wrap{overflow-x:auto;margin-top:14px}
  #page-${PAGE_ID} .pf-tbl{width:100%;border-collapse:collapse;font-size:12px;min-width:420px}
  #page-${PAGE_ID} .pf-tbl th,#page-${PAGE_ID} .pf-tbl td{padding:8px 10px;text-align:center;border-bottom:1px solid var(--border);white-space:nowrap}
  #page-${PAGE_ID} .pf-tbl th{font-weight:800;color:var(--muted);font-size:11px;background:var(--surface2)}
  #page-${PAGE_ID} .pf-th-now,#page-${PAGE_ID} .pf-td-now{background:color-mix(in srgb,var(--primary) 10%,var(--surface));color:var(--primary);font-weight:900}
  #page-${PAGE_ID} .pf-steps{display:flex;flex-direction:column;gap:9px}
  #page-${PAGE_ID} .pf-step{display:flex;gap:11px;align-items:flex-start;border:1px solid var(--border);border-radius:11px;padding:11px 12px}
  #page-${PAGE_ID} .pf-step-done{background:color-mix(in srgb,var(--stage-done) 6%,var(--surface));border-color:color-mix(in srgb,var(--stage-done) 22%,var(--border))}
  #page-${PAGE_ID} .pf-step-n{width:25px;height:25px;flex:0 0 auto;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:11.5px;background:var(--surface2);color:var(--muted);border:1px solid var(--border)}
  #page-${PAGE_ID} .pf-step-done .pf-step-n{background:var(--stage-done);color:var(--surface);border-color:var(--stage-done)}
  #page-${PAGE_ID} .pf-step-t{font-weight:800;font-size:13px;display:flex;align-items:center;gap:7px;flex-wrap:wrap}
  #page-${PAGE_ID} .pf-step-d{font-size:11.5px;color:var(--muted);line-height:1.85;margin-top:3px}
  #page-${PAGE_ID} .pf-badge-ok{font-size:9.5px;font-weight:800;color:var(--stage-done);background:color-mix(in srgb,var(--stage-done) 12%,var(--surface));border:1px solid color-mix(in srgb,var(--stage-done) 30%,var(--border));border-radius:99px;padding:2px 8px}
  #page-${PAGE_ID} .pf-badge-wait{font-size:9.5px;font-weight:800;color:var(--muted);background:var(--surface2);border:1px solid var(--border);border-radius:99px;padding:2px 8px}
  #page-${PAGE_ID} .pf-note-trial{background:color-mix(in srgb,var(--warn) 12%,var(--surface));border:1px solid color-mix(in srgb,var(--warn) 38%,var(--border));color:var(--text)}
  #page-${PAGE_ID} .pf-tag{font-size:9px;font-weight:800;color:var(--warn);background:color-mix(in srgb,var(--warn) 16%,var(--surface));border:1px solid color-mix(in srgb,var(--warn) 38%,var(--border));border-radius:99px;padding:1px 7px;vertical-align:middle}
  #page-${PAGE_ID} .pf-covs{display:flex;flex-direction:column;gap:13px}
  #page-${PAGE_ID} .pf-cov-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:7px}
  #page-${PAGE_ID} .pf-cov-l{font-weight:800;font-size:12.5px}
  #page-${PAGE_ID} .pf-cov-v{font-weight:900;font-size:18px;line-height:1}
  #page-${PAGE_ID} .pf-cov-h{font-size:10.5px;color:var(--muted);margin-top:5px;line-height:1.8}
  #page-${PAGE_ID} .pf-cov-foot{font-size:11.5px;color:var(--muted);margin-top:14px;padding-top:11px;border-top:1px solid var(--border);display:flex;align-items:center;gap:7px;flex-wrap:wrap}
  #page-${PAGE_ID} .pf-cmps{display:flex;flex-direction:column;gap:9px}
  #page-${PAGE_ID} .pf-cmp{display:flex;gap:11px;align-items:center;border:1px solid var(--border);border-radius:11px;padding:10px 12px}
  #page-${PAGE_ID} .pf-cmp-i{width:26px;height:26px;flex:0 0 auto;border-radius:8px;display:flex;align-items:center;justify-content:center;background:var(--surface2);color:var(--muted);border:1px solid var(--border)}
  #page-${PAGE_ID} .pf-cmp-l{font-weight:800;font-size:12.5px;line-height:1.5}
  #page-${PAGE_ID} .pf-cmp-h{font-size:10.5px;color:var(--muted);line-height:1.75;margin-top:2px}
  #page-${PAGE_ID} .pf-cmp-v{font-weight:900;font-size:13px;flex:0 0 auto;white-space:nowrap}
  #page-${PAGE_ID} .pf-cmp-s{font-size:10px;font-weight:800;flex:0 0 auto;border:1px solid var(--border);border-radius:99px;padding:2px 8px;white-space:nowrap;background:var(--surface2)}
  @media(max-width:560px){ #page-${PAGE_ID} .pf-cmp{flex-wrap:wrap} #page-${PAGE_ID} .pf-cmp-v{font-size:12px} }
  #page-${PAGE_ID} .pf-st{font-size:10px;font-weight:800;border-radius:99px;padding:2px 9px;white-space:nowrap}
  #page-${PAGE_ID} .pf-st-open{color:var(--warn);background:color-mix(in srgb,var(--warn) 14%,var(--surface));border:1px solid color-mix(in srgb,var(--warn) 35%,var(--border))}
  #page-${PAGE_ID} .pf-st-disp{color:var(--primary);background:color-mix(in srgb,var(--primary) 12%,var(--surface));border:1px solid color-mix(in srgb,var(--primary) 30%,var(--border))}
  #page-${PAGE_ID} .pf-st-done{color:var(--stage-done);background:color-mix(in srgb,var(--stage-done) 12%,var(--surface));border:1px solid color-mix(in srgb,var(--stage-done) 30%,var(--border))}
  #page-${PAGE_ID} .card-header .btn{flex:0 0 auto}
  #page-${PAGE_ID} .pf-empty{text-align:center;padding:48px 20px;color:var(--muted)}
  #page-${PAGE_ID} .pf-empty-t{font-weight:800;font-size:15px;margin-bottom:7px;color:var(--text)}
  #page-${PAGE_ID} .pf-empty-s{font-size:12.5px;line-height:1.9}
  @media(max-width:520px){
    #page-${PAGE_ID} .pf-grp-w{font-size:17px}
    #page-${PAGE_ID} .pf-grp-name{font-size:12.5px}
  }`;
  document.head.appendChild(st);
}

/* ════════════════════════════════════════════════════════════
   التركيب الذاتي: صفحة + زرّ قائمة جانبية + لفّ showPage
   ════════════════════════════════════════════════════════════ */
function ensurePage(){
  injectCSS();
  if(document.getElementById("page-"+PAGE_ID)) return;
  const anyPage=document.querySelector(".page");
  const host=anyPage ? anyPage.parentElement : document.body;
  const div=document.createElement("div");
  div.className="page"; div.id="page-"+PAGE_ID;
  host.appendChild(div);
}

/* زرّ القائمة الجانبية — لمشاريع عقد الأداء وحدها.
   يُحقن بعد applyPermissions فلا تحجبه النواة؛ نقرأ حاجبها بأنفسنا كما تفعل وحدة النظافة. */
function injectSidebarButton(){
  const blocked = (window._blockedPages && typeof window._blockedPages.has==="function")
    ? window._blockedPages.has(PAGE_ID) : false;
  const shouldShow = canView() && _isPerf() && !blocked;
  const existing=document.getElementById("nav-performance-btn");
  if(!shouldShow){ if(existing) existing.remove(); return; }
  if(existing) return;
  const nav=document.querySelector(".sidebar-nav");
  if(!nav) return;
  // مكانُه الطبيعي: داخل مجموعة «الأداء» بجوار «مؤشرات الأداء» — لا زرَّاً عائماً
  // في جذر القائمة. فيرث سلوكَ الطيّ والتنسيق (sidebar-child) كبقية أبناء المجموعة،
  // ومجموعةُ الطيّ تقيس ارتفاعها بـ scrollHeight فتتّسع للزرّ الجديد تلقائياً.
  const anchor = nav.querySelector('.sidebar-nav-btn[data-page="kpi"]')
              || nav.querySelector('.sidebar-nav-btn[data-page="dashboard"]');
  const btn=document.createElement("button");
  btn.className = "sidebar-nav-btn" + (anchor && anchor.classList.contains("sidebar-child") ? " sidebar-child" : "");
  btn.id="nav-performance-btn";
  btn.dataset.page=PAGE_ID;
  btn.innerHTML='<span class="s-icon">'+_svg("barChart")+'</span> تقييم الأداء';
  btn.onclick=()=>{ try{ showPage(PAGE_ID); }catch(e){} };
  /* ★ الإدراج نسبةً إلى **والد المرساة** لا إلى nav.
     أزرارُ القائمة ليست كلها أبناءً مباشرين لـ .sidebar-nav — أكثرها داخل
     مجموعاتٍ (#grp-*)، و`nav.insertBefore(btn, anchor.nextSibling)` بعقدةٍ ليست
     ابناً مباشراً يرمي NotFoundError فيسقط الحقنُ كلُّه صامتاً (رُصد في فحص
     المتصفّح: الزرّ لم يظهر إطلاقاً في مشروع الأداء). */
  try{
    if(anchor && anchor.parentNode) anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    else nav.insertBefore(btn, nav.firstChild);
  }catch(e){
    try{ nav.appendChild(btn); }catch(_e){}
  }
}

function hookShowPage(){
  if(window._pfHooked || typeof window.showPage!=="function") return;
  const orig=window.showPage;
  window.showPage=function(id){
    if(id===PAGE_ID && !(canView() && _isPerf())){
      try{ _toast("🔒 هذا القسم متاح لمشاريع «العقد القائم على الأداء» فقط","warn"); }catch(e){}
      return orig.apply(this, ["dashboard"]);
    }
    orig.apply(this, arguments);
    if(id===PAGE_ID){
      const pg=document.getElementById("page-"+PAGE_ID);
      if(!pg) return;
      // النواة لا تعرف صفحتنا فلا تُفعّلها — نُفعّلها نحن (ونطفئ البقية)
      document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
      pg.classList.add("active");
      document.querySelectorAll(".sidebar-nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.page===PAGE_ID));
      render();
    }
  };
  window._pfHooked=true;
}

/* تبديلُ المشروع يعيد تقييم البوّابة: مشروعٌ تقليديٌّ يُزيل الزرّ، وقائمٌ على الأداء يُعيده.
   وإن كنّا واقفين على الصفحة حين تبديلٍ إلى مشروعٍ تقليديّ نغادرها فوراً — فلا تبقى
   شاشةُ عقدٍ لا ينتمي للمشروع الحالي معروضةً. */
function _watchProject(){
  let last=_projId(), lastPerf=_isPerf();
  setInterval(()=>{
    const cur=_projId(), curPerf=_isPerf();
    if(cur!==last || curPerf!==lastPerf){
      last=cur; lastPerf=curPerf;
      injectSidebarButton();
      const pg=document.getElementById("page-"+PAGE_ID);
      if(pg && pg.classList.contains("active")){
        if(curPerf) render();
        else { try{ showPage("dashboard"); }catch(e){} }
      }
    }
  }, 1200);
}

function init(){
  ensurePage();
  hookShowPage();
  injectSidebarButton();
  _watchProject();
  // القائمة الجانبية تُعاد بناؤها بعد الدخول/تبديل المشروع — نُعيد الحقن بعد استقرارها
  [400, 1200, 2500].forEach(ms=> setTimeout(()=>{ try{ injectSidebarButton(); }catch(e){} }, ms));
  const nav=document.querySelector(".sidebar-nav");
  if(nav && typeof MutationObserver==="function"){
    const obs=new MutationObserver(()=>{ try{ injectSidebarButton(); }catch(e){} });
    obs.observe(nav,{childList:true});
  }
}

if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
else init();

window.performanceContract = {
  render,
  isActive: _isPerf,
  groups: GROUPS,
  yearTarget,
  penaltyScale: PENALTY_SCALE,
  // [المرحلة ٣] الكتالوج والدوالُّ النقيّة — يفحصها hail-tests بلا متصفّح
  kpis: KPIS,
  kpiById,
  kpiScoreAfterNCR,
  dedMultiplier,
  dedAmount,
  ncrMonthKey,
  prevMonthKey,
  ncrCountFor,
  ncrStreak,
  ncrRollup,
  ncrEvidence,
  // [الرقابة الاستباقية] الدوالُّ النقيّة
  certStatus,
  contractYearStartISO,
  trainingProgress,
  ratio16,
  satisfactionMonthly,
  // إجراءات الشاشة (onclick)
  ncrNew, ncrClose, ncrDispute, ncrDelete, ncrReload,
  cmpEditState, cmpAddTraining, cmpDeleteTraining, cmpReload,
  version: VERSION,
  build: MODULE_BUILD
};

})();
