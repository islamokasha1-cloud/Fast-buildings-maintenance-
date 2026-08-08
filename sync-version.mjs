#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   sync-version.mjs — مصدرٌ واحدٌ يختم رقمَ الإصدار في كل مواضعه

   ── المشكلة التي يعالجها ──
   رقمُ الإصدار كان **يُختار يدوياً عند إنشاء الفرع** («الحرف التالي»: ai → aj)،
   ثم يُكتب بيد المطوّر في ثمانيةَ عشرَ موضعاً: `APP_VERSION` · تذييل الدخول ·
   أحدَ عشرَ `?v=` cache-buster · ستّةُ `MODULE_BUILD`. ونتيجتُه المحتومة: فرعان
   ينطلقان من نفس القاعدة يختاران **نفس الحرف**، فيتصادمان عند الدمج — وقع ذلك
   ثلاث مرّاتٍ متتاليةً (ag · aj · aj). وكلُّ موضعٍ منسيٍّ = وحدةٌ تُخدَم من الكاش
   القديم فلا يصل الإصلاحُ للمستخدم (وهو الخلل الذي بُني له كاشفُ الوحدات القديمة).

   ── المبدأ ──
   الإصدارُ **يُشتقّ ولا يُؤلَّف**: `v<BASE>.<عدد الـcommits>` — عددٌ يتزايد حتماً مع
   كل دمج، فلا اجتهادَ ولا حرفَ يُخمَّن. والمطوّر لا يكتب رقماً إطلاقاً: يكتب
   العلامة `vNEXT` في قيد `NOTES.md §6` ويشغّل `npm run stamp`، فيُكتب الرقمُ
   الحقيقي في كل المواضع دفعةً واحدة.

   ── فصلٌ مقصود: المولِّد مقابل الثابت ──
   **المولِّد** (`--write`) يقرأ git. أمّا **الثابتُ المفحوص** في hail-tests وCI فهو
   «كلُّ الأختام متطابقة، ولا `vNEXT` باقية، ولقيدِ الإصدار سطرٌ في NOTES» — ولا
   يُقارَن بعدّاد git. سببُه أن GitHub Actions تفحص **commit دمجٍ** للـPR فيختلف
   العدّاد عمّا كان لدى المطوّر، فربطُ الفحص بالعدّاد يُسقط الـPR بلا خطأٍ حقيقيّ.

   ── الاستعمال ──
     npm run stamp          # يحسب ويكتب في كل المواضع
     npm run stamp:check    # لا يكتب — يُبلغ عن أي انحراف ويُرجع 1
     node sync-version.mjs --print
   ═══════════════════════════════════════════════════════════════════════════ */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const REPO = path.dirname(fileURLToPath(import.meta.url));

/* خطُّ الإصدار — يُرفَع يدوياً عند إصدارٍ كبير فقط (18.9 → 19.0)، والباقي مشتقّ. */
const BASE = "18.9";
/* العلامة التي يكتبها المطوّر بدل الرقم — يستبدلها هذا السكربت في كل مكان. */
const PLACEHOLDER = "vNEXT";
/* نمطُ الإصدار المقبول: v18.9.532 (والقديمُ ذو الأحرف v18.9ak يُهاجَر تلقائياً). */
const VER_RE = "v\\d+\\.\\d+(?:\\.\\d+)?[a-z]*";

/* الاستنساخُ الضحل لا يُفشِل `rev-list` — **يُنجحه برقمٍ أقلّ**. فالـcatch أدناه لا
   يمسكه، والنتيجة أخطرُ من الفشل: يُختم رقمٌ **أدنى** من المختوم فعلاً، فيتراجع
   الإصدارُ في ثنتين وعشرين موضعاً دفعةً واحدة — تعود الوحداتُ إلى كاشٍ أقدم ويرى
   المستخدمُ رقماً ينقص. (وقع هذا فعلاً: بيئةٌ بعمق ١٣٠ ختمت `v18.9.130` بينما
   العدُّ الحقيقي ٢٤٨٩.) نرفض ولا نُخمّن. */
function assertFullHistory(){
  let shallow = "";
  try{
    shallow = execSync("git rev-parse --is-shallow-repository",
      { cwd:REPO, stdio:["ignore","pipe","ignore"] }).toString().trim();
  }catch(e){ return; }                      // إصدارُ git قديم لا يعرف الخيار — يكفيه حارسُ التراجع
  if(shallow === "true"){
    console.error("✗ الاستنساخ ضحل — عدّادُ الـcommits ناقصٌ فالإصدارُ سيتراجع.");
    console.error("  شغّل:  git fetch --unshallow      (أو fetch-depth: 0 في CI)");
    process.exit(2);
  }
}

/* حارسُ التراجع — يعمل أياً كان السبب (ضحالةٌ · فرعٌ مبتور · قاعدةٌ عُدِّلت).
   الإصدارُ عهدُه أن **يتزايد**؛ فالنزولُ خطأٌ في الاشتقاق لا نيّةُ مطوّر. */
function assertNoDowngrade(ver){
  const cur = readStamps().map(s => s.value.replace(/^v/, ""))
    .filter(v => /^\d+\.\d+\.\d+$/.test(v));
  if(!cur.length) return;                   // لا ختمَ سابقاً (أو صيغةٌ قديمة) — لا مرجعَ للمقارنة
  const num = v => Number(v.split(".")[2]);
  const top = cur.map(num).sort((a,b)=>b-a)[0];
  const next = num(ver.replace(/^v/, ""));
  if(next < top){
    console.error(`✗ الإصدار المشتقّ ${ver} **أدنى** من المختوم حالياً (v${BASE}.${top}).`);
    console.error("  تاريخُ git ناقصٌ هنا. شغّل:  git fetch --unshallow");
    process.exit(2);
  }
}

function computeVersion(){
  assertFullHistory();
  let n;
  try{
    n = execSync("git rev-list --count HEAD", { cwd:REPO, stdio:["ignore","pipe","ignore"] }).toString().trim();
  }catch(e){
    console.error("✗ تعذّر قراءة تاريخ git — لا يمكن اشتقاق الإصدار.");
    console.error("  (استنساخٌ ضحل؟ استخدم fetch-depth: 0)");
    process.exit(2);
  }
  if(!/^\d+$/.test(n)){ console.error("✗ عدّاد commits غير صالح: "+n); process.exit(2); }
  const ver = `v${BASE}.${n}`;
  assertNoDowngrade(ver);
  return ver;
}

/* ــ الأهداف ــ
   كلُّ هدفٍ نمطٌ يلتقط الموضع ويستبدل الرقم وحده. نُبقيها **مكتشِفة** لا مُعدَّدة:
   أي وحدةٍ جديدة تحمل MODULE_BUILD أو وسمَ ?v= تُختم تلقائياً بلا تعديل هنا —
   فالنسيانُ الذي يُنتج وحدةً قديمةً في الكاش لم يعد ممكناً. */
function targets(ver){
  const bare = ver.replace(/^v/, "");
  return [
    { file:"index.html",    what:"APP_VERSION",
      re:new RegExp(`(const APP_VERSION = ")${VER_RE}(")`, "g"),          to:`$1${ver}$2` },
    { file:"index.html",    what:"تذييل الدخول",
      re:new RegExp(`(id="login-version-footer">نظام صيانة المباني — )${VER_RE}`, "g"), to:`$1${ver}` },
    { file:"index.html",    what:"cache-busters",
      re:new RegExp(`(<script src="(?!https?:)[^"]+\\.js\\?v=)[^"]+(")`, "g"),          to:`$1${bare}$2` },
    { file:"tech-app.html", what:"cache-busters",
      re:new RegExp(`(<script src="(?!https?:)[^"]+\\.js\\?v=)[^"]+(")`, "g"),          to:`$1${bare}$2` },
    { file:"*",             what:"MODULE_BUILD",
      re:new RegExp(`((?:const|var) MODULE_BUILD = ")${VER_RE}(")`, "g"), to:`$1${ver}$2` },
    { file:"NOTES.md",      what:"قيد §6",
      re:new RegExp(`\\*\\*${PLACEHOLDER} —`, "g"),                       to:`**${ver} —` }
  ];
}

/* الملفات التي تُمسَح بحثاً عن MODULE_BUILD — كلُّ وحدةٍ محلية + الوحدة المدموجة
   داخل index.html. hail-tests مستثناة: تحوي أنماطَ الفحص لا ختماً. */
function stampedFiles(){
  const js = fs.readdirSync(REPO)
    .filter(f => f.endsWith(".js") && f !== "hail-tests.js")
    .filter(f => /(?:const|var) MODULE_BUILD = "/.test(fs.readFileSync(path.join(REPO,f),"utf8")));
  return ["index.html", ...js];
}

function apply(ver, write){
  const drift = [];
  let changed = 0;
  const byFile = {};
  for(const t of targets(ver)){
    const files = t.file === "*" ? stampedFiles() : [t.file];
    for(const f of files){
      const p = path.join(REPO, f);
      if(!fs.existsSync(p)) continue;
      const src = byFile[f] !== undefined ? byFile[f] : fs.readFileSync(p, "utf8");
      const hits = src.match(t.re);
      const out = src.replace(t.re, t.to);
      if(out !== src){
        drift.push(`${f} — ${t.what} (${hits ? hits.length : 0} موضعاً)`);
        changed += hits ? hits.length : 0;
      }
      byFile[f] = out;
    }
  }
  if(write) for(const [f, out] of Object.entries(byFile)) fs.writeFileSync(path.join(REPO, f), out, "utf8");
  return { drift, changed };
}

/* العلامةُ الباقية أخطرُ من الانحراف: تصل المستخدمَ نصّاً حرفياً «vNEXT» في تذييل
   الدخول. لكنّ الكشفَ يجب أن يكون **دقيقاً**: هذا الملفُّ وNOTES يذكران الكلمة
   شرحاً، فلا يصحّ أن يُسقِط ذكرُها الفحصَ. لذلك في الوثائق نبحث عن **علامة القيد**
   وحدها (`**vNEXT —`)، وفي ملفات الكود عن أي ظهورٍ (الكودُ لا يذكرها إطلاقاً). */
function leftoverPlaceholders(){
  const out = [];
  const code = ["index.html", "tech-app.html", ...stampedFiles()];
  for(const f of new Set(code)){
    const p = path.join(REPO, f);
    if(fs.existsSync(p) && fs.readFileSync(p,"utf8").includes(PLACEHOLDER)) out.push(f);
  }
  const notes = path.join(REPO, "NOTES.md");
  if(fs.existsSync(notes) && fs.readFileSync(notes,"utf8").includes(`**${PLACEHOLDER} —`)) out.push("NOTES.md");
  return [...new Set(out)];
}

/* الأختامُ المقروءة من الملفات — أساسُ فحص الاتّساق. */
function readStamps(){
  const found = [];
  const push = (file, what, re, src) => {
    let m; const r = new RegExp(re.source, "g");
    while((m = r.exec(src)) !== null) found.push({ file, what, value: m[1] });
  };
  const idx = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  push("index.html", "APP_VERSION",   new RegExp(`const APP_VERSION = "(${VER_RE})"`), idx);
  push("index.html", "تذييل الدخول",  new RegExp(`id="login-version-footer">نظام صيانة المباني — (${VER_RE})<`), idx);
  for(const f of ["index.html", "tech-app.html"]){
    const p = path.join(REPO, f);
    if(!fs.existsSync(p)) continue;
    push(f, "cache-buster", /<script src="(?!https?:)[^"]+\.js\?v=([^"]+)"/, fs.readFileSync(p, "utf8"));
  }
  for(const f of stampedFiles()){
    push(f, "MODULE_BUILD", new RegExp(`(?:const|var) MODULE_BUILD = "(${VER_RE})"`), fs.readFileSync(path.join(REPO, f), "utf8"));
  }
  return found;
}

const argv = process.argv.slice(2);

if(argv.includes("--print")){ console.log(computeVersion()); process.exit(0); }

/* ── وضعُ الفحص: **لا يلمس git إطلاقاً** ──
   الثابتُ المفحوص هو الاتّساقُ الداخلي ووجودُ قيدِ §6 وغيابُ العلامة — لا مطابقةُ
   عدّاد git. سببُه أن GitHub Actions تفحص commit دمجٍ للـPR فيختلف العدّاد عمّا كان
   لدى المطوّر (وقد يكون الاستنساخُ ضحلاً فيعطي 1)، فربطُ الفحص بالعدّاد يُسقط
   الـPR بلا خطأٍ حقيقيّ. المولِّد وحده يقرأ git. */
if(argv.includes("--check")){
  const stamps = readStamps();
  const left = leftoverPlaceholders();
  const norm = s => String(s).replace(/^v/, "");
  const values = [...new Set(stamps.map(x => norm(x.value)))];
  const bad = [];
  if(!stamps.length) bad.push("لم يُعثر على أي ختمِ إصدار — تغيّرت البنية؟");
  if(values.length > 1){
    bad.push("أختامٌ مختلفة: " + values.join(" ≠ "));
    const majority = values.map(v => [v, stamps.filter(x => norm(x.value) === v).length])
      .sort((a, b) => b[1] - a[1])[0][0];
    stamps.filter(x => norm(x.value) !== majority)
      .forEach(x => bad.push(`${x.file} — ${x.what} = ${x.value} (المتوقّع ${majority})`));
  }
  const ver = values.length === 1 ? "v" + values[0] : null;
  if(ver && !/^v\d+\.\d+\.\d+$/.test(ver)) bad.push(`صيغةُ الإصدار ${ver} ليست مشتقّةً — شغّل npm run stamp`);
  const notes = path.join(REPO, "NOTES.md");
  if(ver && fs.existsSync(notes) && !fs.readFileSync(notes, "utf8").includes(`**${ver} —`))
    bad.push(`لا قيدَ لـ${ver} في NOTES.md §6 — اكتب القيد بعلامة ${PLACEHOLDER} ثم شغّل npm run stamp`);
  left.forEach(f => bad.push(`${f} — ما زالت فيه علامة ${PLACEHOLDER}`));

  if(!bad.length){ console.log(`✅ الأختام متّسقة على ${ver} (${stamps.length} موضعاً)`); process.exit(0); }
  console.error("❌ ختمُ الإصدار غير سليم:");
  bad.forEach(b => console.error("   • " + b));
  console.error("\n   شغّل:  npm run stamp");
  process.exit(1);
}

/* ── وضعُ الكتابة ── */
const ver = computeVersion();
const { drift, changed } = apply(ver, true);
console.log(`✅ خُتم ${ver} في ${changed} موضعاً`);
drift.forEach(d => console.log("   • " + d));
const left = leftoverPlaceholders();
if(left.length){
  console.log("\n⚠ علاماتٌ باقية (راجعها):");
  left.forEach(f => console.log("   • " + f));
}
if(!changed) console.log("   (كان كلُّ شيءٍ مختوماً أصلاً)");
