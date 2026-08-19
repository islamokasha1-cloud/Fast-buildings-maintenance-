/* ═══════════════════════════════════════════════════════════════════════════
   photo-queue.js — طابورُ رفعٍ مؤجَّلٌ للصور (v18.9ak)

   ── المشكلة التي يعالجها (عطلٌ صامتٌ كان يُفقد الأدلّة) ──
   كان النظام عند فشل رفع صورةٍ إلى Storage — شبكةٌ ضعيفةٌ داخل المباني، أو مهلةُ
   الـ٤٥ ثانية — يحفظ **الرابط المحلّي المؤقّت** بدلاً منها:
       p.finalizedUrl = p.storageUrl || p.preview;     // ← p.preview = blob:
   ورابطُ `blob:` يعيش داخل تبويب المتصفّح الذي التقط الصورة **فقط**. يُكتب في
   Firestore كأنه صورةٌ دائمة، فيراه صاحبُه سليماً لحظتها، ثم يموت عند أول تحديثٍ
   للصفحة، وعلى كل جهازٍ آخر، وإلى الأبد — فيصل العميلَ تقريرٌ مصوَّرٌ فيه مربّعاتٌ
   مكسورة، وتضيع الصورةُ الأصلية لأنها لم تُرفَع قطّ ولم تُحفَظ في مكانٍ يُعاد منه.

   ── المبدأ ──
   **لا يُحفَظ رابطٌ محلّيٌّ في قاعدة البيانات إطلاقاً.** الصورةُ التي تعذّر رفعُها
   تُخزَّن **بجسمها الكامل** (Blob) في IndexedDB — وهو تخزينٌ يبقى بعد إغلاق التبويب
   وإعادة تشغيل الجهاز — ويُعاد رفعُها تلقائياً عند عودة الشبكة، ثم يُضاف رابطُها
   الدائم إلى البلاغ. فالبلاغ يُغلق فوراً بلا تعطيلٍ للفني، ولا صورةَ تضيع.

   ── لماذا arrayUnion لا كتابةُ المصفوفة كاملة ──
   الرفعُ المؤجَّل قد ينجح بعد دقائق، وقد يكون البلاغ عُدِّل من جهازٍ آخر في الأثناء.
   كتابةُ `photos` كاملةً من نسخةٍ قديمةٍ تمحو صورَ الآخرين. `arrayUnion` تُلحق
   الرابط ذرّياً على الوثيقة الطازجة في السيرفر — فلا تصادم.

   ── الاستقلال ──
   نمط IIFE يعرّض `window.photoQueue` فقط، ولا يعرف شيئاً عن نموذج بيانات التطبيق:
   كلُّ عنصرٍ يحمل وجهته بنفسه (collection/docId/field/mode). لذلك يخدم
   `index.html` و`tech-app.html` معاً بمصدرٍ واحد.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
"use strict";

const MODULE_BUILD = "v18.9.2753";
const DB_NAME = "hailPhotoQueue";
const STORE   = "pending";
const DB_VER  = 1;
const RETRY_MS = 60000;          // محاولةٌ دوريةٌ ما دام في الطابور عنصر
const MAX_TRIES_AUTO = 25;       // بعدها لا محاولةَ تلقائية — لكن **لا يُحذف العنصر**

let _cfg = { storage:null, db:null, firebase:null, onChange:null, toast:null };
let _dbp = null, _timer = null, _flushing = false;

/* ════════ IndexedDB (وعودٌ رقيقةٌ حول واجهةٍ حَدَثية) ════════ */
function _idb(){
  if(_dbp) return _dbp;
  _dbp = new Promise((resolve, reject)=>{
    let req;
    try{ req = indexedDB.open(DB_NAME, DB_VER); }
    catch(e){ reject(e); return; }
    req.onupgradeneeded = ()=>{
      const d = req.result;
      if(!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath:"id" });
    };
    req.onsuccess = ()=>resolve(req.result);
    req.onerror   = ()=>reject(req.error);
  });
  _dbp.catch(()=>{ _dbp = null; });   // فشلُ الفتح لا يُجمّد كلَّ نداءٍ لاحق
  return _dbp;
}
function _tx(mode, fn){
  return _idb().then(d=>new Promise((resolve, reject)=>{
    const t = d.transaction(STORE, mode), s = t.objectStore(STORE);
    let out;
    try{ out = fn(s); }catch(e){ reject(e); return; }
    t.oncomplete = ()=>resolve(out && out.result !== undefined ? out.result : out);
    t.onerror    = ()=>reject(t.error);
    t.onabort    = ()=>reject(t.error);
  }));
}
function _all(){
  return _tx("readonly", s=>s.getAll()).then(r=>Array.isArray(r)?r:[]).catch(()=>[]);
}
function _put(item){ return _tx("readwrite", s=>s.put(item)); }
function _del(id){   return _tx("readwrite", s=>s.delete(id)); }

/* ════════ الواجهة العامة ════════ */
function configure(o){
  o = o || {};
  if(o.storage)  _cfg.storage  = o.storage;
  if(o.db)       _cfg.db       = o.db;
  if(o.firebase) _cfg.firebase = o.firebase;
  if(o.onChange) _cfg.onChange = o.onChange;
  if(o.toast)    _cfg.toast    = o.toast;
  return _cfg;
}
function _notify(){ try{ if(_cfg.onChange) _cfg.onChange(); }catch(e){} }
function _say(m,k){ try{ if(_cfg.toast) _cfg.toast(m,k); }catch(e){} }

function _uid(){
  return "pq_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,9);
}

/* إدراجُ صورةٍ تعذّر رفعُها. `blob` إلزاميّ — بدون جسم الصورة لا معنى للطابور،
   ونرفض بصمتٍ بدل إيهام المستخدم بأنها محفوظة. */
function enqueue(o){
  o = o || {};
  if(!o.blob || !o.storagePath || !o.collection || !o.docId || !o.field){
    return Promise.resolve(null);
  }
  const item = {
    id: _uid(),
    blob: o.blob,
    storagePath: String(o.storagePath),
    collection: String(o.collection),
    docId: String(o.docId),
    field: String(o.field),
    mode: o.mode === "set" ? "set" : "arrayUnion",
    label: String(o.label || o.docId || ""),
    createdAt: new Date().toISOString(),
    tries: 0,
    lastError: ""
  };
  return _put(item).then(()=>{ _notify(); _arm(); return item.id; }).catch(()=>null);
}

function count(){ return _all().then(a=>a.length); }
function list(){  return _all(); }

/* حذفٌ يدويٌّ صريح — الطريق الوحيد لإسقاط صورةٍ من الطابور (لا إسقاطَ تلقائيّ). */
function drop(id){ return _del(id).then(()=>{ _notify(); return true; }).catch(()=>false); }

/* رفعُ عنصرٍ واحد: Storage ← ثم إلحاقُ الرابط بالوثيقة الطازجة ← ثم الحذفُ من الطابور.
   الترتيبُ مقصود: لو انقطع التيّار بين الخطوتين بقي العنصرُ في الطابور فأُعيدت
   المحاولة — تكرارُ رفعٍ أهونُ من صورةٍ تضيع. و`arrayUnion` مُتسانِدة (idempotent)
   على نفس الرابط، فإعادةُ المحاولة لا تُكرّر الصورة في البلاغ. */
function _uploadOne(item){
  const st = _cfg.storage, db = _cfg.db, fb = _cfg.firebase;
  if(!st || !db) return Promise.reject(new Error("no-services"));
  return st.ref(item.storagePath).put(item.blob, { contentType:"image/jpeg" })
    .then(snap=>snap.ref.getDownloadURL())
    .then(url=>{
      let val = url;
      if(item.mode === "arrayUnion"){
        const FV = fb && fb.firestore && fb.firestore.FieldValue;
        if(FV && typeof FV.arrayUnion === "function") val = FV.arrayUnion(url);
        else return Promise.reject(new Error("no-arrayUnion"));
      }
      const patch = {}; patch[item.field] = val;
      // set+merge لا update: الوثيقة قد تكون غابت أو لم تصل بعد، وupdate تفشل حينها.
      return db.collection(item.collection).doc(item.docId).set(patch, { merge:true }).then(()=>url);
    });
}

function flush(){
  if(_flushing) return Promise.resolve({ ok:0, fail:0, skipped:true });
  if(!_cfg.storage || !_cfg.db) return Promise.resolve({ ok:0, fail:0, skipped:true });
  if(typeof navigator!=="undefined" && navigator && navigator.onLine === false){
    return Promise.resolve({ ok:0, fail:0, skipped:true });
  }
  _flushing = true;
  let ok=0, fail=0;
  return _all().then(items=>{
    const due = items.filter(x=>Number(x.tries||0) < MAX_TRIES_AUTO);
    return due.reduce((chain,item)=>chain.then(()=>
      _uploadOne(item)
        .then(()=>{ ok++; return _del(item.id); })
        .catch(err=>{
          fail++;
          item.tries = Number(item.tries||0) + 1;
          item.lastError = String((err && err.message) || err || "").slice(0,140);
          return _put(item).catch(()=>{});
        })
    ), Promise.resolve());
  }).then(()=>{
    _flushing = false;
    if(ok) _say("✅ اكتمل رفع "+ok+" صورة كانت مؤجَّلة","success");
    _notify();
    _arm();
    return { ok, fail };
  }).catch(()=>{ _flushing=false; _arm(); return { ok, fail }; });
}

/* المؤقّتُ يعمل **فقط** ما دام في الطابور عنصر — فلا نبضَ دوريٌّ في الحالة العادية. */
function _arm(){
  count().then(n=>{
    if(!n){ if(_timer){ clearInterval(_timer); _timer=null; } return; }
    if(_timer) return;
    _timer = setInterval(()=>{ flush(); }, RETRY_MS);
  }).catch(()=>{});
}

function start(){
  try{
    window.addEventListener("online", ()=>{ flush(); });
    document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) flush(); });
  }catch(e){}
  _arm();
  setTimeout(()=>{ flush(); }, 4000);   // بعد تهيئة Firebase والمصادقة
}

window.photoQueue = {
  configure, enqueue, flush, count, list, drop, start,
  build: MODULE_BUILD,
  _MAX_TRIES_AUTO: MAX_TRIES_AUTO, _RETRY_MS: RETRY_MS, _DB_NAME: DB_NAME, _STORE: STORE
};

})();
