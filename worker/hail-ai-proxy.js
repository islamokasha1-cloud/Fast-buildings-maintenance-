// ============================================================================
//  hail-ai-proxy — Worker v8   ← نسخةُ المستودع = **ما هو منشورٌ فعلاً** على Cloudflare
//  (نُشِر ١٤ أغسطس ٢٠٢٦ · تحقُّقٌ حيّ: بلا توكِن ⟵ 401، وموظّفٌ مُصادَقٌ ⟵ يعمل)
//  ⚠ لا أسرارَ في هذا الملف — كلُّها من env (Settings ▸ Variables ▸ Secrets).
//  جديد في v8 (إغلاق H3 — الوسيط كان مفتوحاً لمن يعرف عنوانه):
//    • مسار الذكاء صار يطلب هويّة: ترويسة Authorization: Bearer <Firebase ID token>
//      يُتحقَّق منها بمفاتيح Google العامة (توقيع + جهة الإصدار + المشروع + الصلاحية).
//    • مفتاح واحد يتحكّم بكل شيء:  AI_AUTH_ENFORCE
//        false = سجِّل ولا ترفض  (المرحلة أ — للتجربة الآمنة)
//        true  = ارفض من لا يحمل توكناً صحيحاً (المرحلة ب — الحماية الفعلية)
//    • CORS صار يسمح بترويسة Authorization (بدونها يحجب المتصفحُ الطلبَ قبل وصوله).
//    • /login و /health لم يُمسّا: الأول يُصدر التوكن أصلاً، والثاني للمراقبة.
//
//  جديد في v7:
//    • ملف الدخول (profile) صار يمرّر حقل projects (المشاريع المسموحة للمستخدم)
//      بجانب permissions — لتفعيل حصر رؤية المشاريع في واجهة اختيار المشروع.
//  جديد في v6:
//    • نقطة GET/HEAD /health ترجع 200 (للمراقبة الخارجية عبر UptimeRobot ونحوه)
//      — لا تلمس المصادقة ولا الـAI ولا تتطلب أي أسرار.
//
//  يجمع وظيفتين:
//   (1) وسيط Anthropic (كما هو في المرحلة 0) — المفتاح من env.ANTHROPIC_KEY
//   (2) مصادقة خادمية: POST /login يتحقق من المستخدم/كلمة المرور مقابل
//       Firestore (خادمياً) ويُصدر Firebase Custom Token يحمل الدور (custom claims)
//
//  الأسرار المطلوبة في الـ Worker (Settings ▸ Variables ▸ Secrets):
//    ANTHROPIC_KEY          ← موجود مسبقاً
//    FIREBASE_PROJECT_ID    = fast-buildings
//    FIREBASE_CLIENT_EMAIL  = xxxx@fast-buildings.iam.gserviceaccount.com
//    FIREBASE_PRIVATE_KEY   = -----BEGIN PRIVATE KEY-----\n....\n-----END PRIVATE KEY-----\n
//      (انسخ قيمة private_key من ملف الـ service account JSON كما هي،
//       بما فيها التسلسلات \n — الكود يحوّلها لأسطر فعلية)
//    DEBUG_KEY              ← (اختياري) مفتاح وضع التشخيص — إن لم يُضبط فوضع debug معطّل نهائياً
//  (v8 لا يحتاج أي سرٍّ جديد — يستعمل FIREBASE_PROJECT_ID الموجود.)
//
//  جديد في v5:
//    • DEBUG_KEY انتقل من الكود إلى Secrets (أضفه في Settings ▸ Variables ▸ Secrets)
//    • تحقق من مدخلات AI: نموذج مسموح فقط + سقف max_tokens + سقف حجم الطلب
//    • تحديد معدّل بسيط في الذاكرة لكل IP (AI + login) — يقطع الإساءة الآلية
//    • رسائل الخطأ العامة للعميل؛ التفاصيل في سجل الـWorker فقط
// ============================================================================

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// ════════════════════════════════════════════════════════════════════════════
//  🔑 v8 — المفتاح الوحيد الذي ستغيّره:
//
//     false  → المرحلة (أ): يسجّل من جاء ومعه هوية ومن جاء بلا هوية، ولا يرفض أحداً.
//     true   → المرحلة (ب): يرفض كل من لا يحمل هوية صحيحة. هذه هي الحماية الفعلية.
//
//  ابدأ بـ false، راقب السجل، ثم بدّلها إلى true وانشر ثانيةً.
// ════════════════════════════════════════════════════════════════════════════
const AI_AUTH_ENFORCE = true;

// v5: مفتاح التشخيص انتقل إلى env.DEBUG_KEY (Secret) — إن لم يُضبط فالوضع معطّل.

// ── v5: قيود مدخلات AI ──
const ALLOWED_MODELS = ["claude-sonnet-4-6"]; // حدّث القائمة عند تغيير النموذج في الواجهة
// v18.9ua: 4096 كانت تبتر جدولَ المقارنة البندية (~150 رمزاً للبند بمورّدين → ينقطع
// عند ~25 بنداً فيسقط تفسيرُ الناتج كلّه). 8192 يتّسع لـ~50 بنداً والسقفُ يبقى حارساً للكلفة.
const MAX_TOKENS_CAP = 8192;                   // سقف max_tokens مهما طلب العميل
const MAX_BODY_BYTES = 8 * 1024 * 1024;        // 8MB — يتّسع لمرفقات PDF/صور base64 المضغوطة

// ── v5: تحديد معدّل بسيط في ذاكرة الـ isolate (نافذة ثابتة لكل IP) ──
// ملاحظة: Cloudflare قد يشغّل عدة isolates فالحد تقريبي لا صارم —
// كافٍ لقطع الإساءة الآلية في بيئة داخلية، بلا KV ولا كلفة إضافية.
const RATE_LIMITS = { ai: { max: 30, windowMs: 60000 }, login: { max: 10, windowMs: 60000 } };
const _rateBuckets = new Map(); // key = "ai:1.2.3.4" → { count, windowStart }

function rateLimited(kind, ip) {
  const cfg = RATE_LIMITS[kind];
  const key = kind + ":" + (ip || "unknown");
  const nowMs = Date.now();
  let b = _rateBuckets.get(key);
  if (!b || nowMs - b.windowStart >= cfg.windowMs) {
    b = { count: 0, windowStart: nowMs };
    _rateBuckets.set(key, b);
  }
  b.count++;
  // تنظيف دوري بسيط يمنع نمو الذاكرة
  if (_rateBuckets.size > 2000) {
    for (const [k, v] of _rateBuckets) {
      if (nowMs - v.windowStart >= 120000) _rateBuckets.delete(k);
    }
  }
  return b.count > cfg.max;
}

// النطاقات المسموح لها (CORS). github.io هو الإنتاج؛ أضِف نطاقات الاختبار إن لزم.
const ALLOWED_ORIGINS = [
  "https://islamokasha1-cloud.github.io",
    "https://maintenance.fast-building.com",

];

function corsHeaders(origin) {
  // اعكس الأصل المسموح؛ وإلا اسمح بـ github.io افتراضياً (لا نستخدم كوكيز، التوكن في الجسم)
  const allow = (origin && ALLOWED_ORIGINS.includes(origin)) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // v8: Authorization إلزامية هنا — بدونها يحجب المتصفحُ الطلبَ في مرحلة preflight
    // فلا يصل إلى الـWorker أصلاً، ويظهر كأن التعديل لم يُنفَّذ.
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, ""); // إزالة الشرطة الأخيرة

    // ── نقطة فحص الصحة (Health check) للمراقبة الخارجية مثل UptimeRobot ──
    // GET/HEAD /health → 200 فوراً، بلا مصادقة ولا أسرار ولا لمس لمنطق الدخول/الـAI.
    // تُوضَع قبل فحص POST حتى يتمكّن المراقب (الذي يستخدم GET) من الوصول إليها.
    if (path.endsWith("/health") && (request.method === "GET" || request.method === "HEAD")) {
      return new Response(
        JSON.stringify({ status: "ok", service: "hail-ai-proxy", v: "8" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
      );
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, origin);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "";

    try {
      // ملاحظة v8: /login يبقى بلا تفويض عمداً — هو الذي يُصدر التوكن أصلاً،
      // فقفلُه يُغلق الدخول على الجميع. التحقق يقع داخل handleAI وحدها.
      if (path.endsWith("/login")) {
        return await handleLogin(request, env, origin, ip);
      }
      return await handleAI(request, env, origin, ip);
    } catch (e) {
      // v5: لا تُسرَّب التفاصيل للعميل — تُسجَّل في لوغ الـWorker فقط
      console.error("worker_error:", e && e.stack || e);
      return json({ error: "worker_error" }, 500, origin);
    }
  },
};

// ──────────────────────────────────────────────────────────────────────────
//  (1) وسيط Anthropic — نفس عقد المرحلة 0
// ──────────────────────────────────────────────────────────────────────────
async function handleAI(request, env, origin, ip) {
  if (!env.ANTHROPIC_KEY) {
    return json({ error: "server_misconfigured", detail: "ANTHROPIC_KEY missing" }, 500, origin);
  }

  // v5: تحديد المعدّل قبل أي معالجة
  if (rateLimited("ai", ip)) {
    return json({ error: "rate_limited", detail: "عدد الطلبات تجاوز الحد — انتظر دقيقة ثم أعد المحاولة" }, 429, origin);
  }

  // ── v8: مَن أنت؟ ──────────────────────────────────────────────────────
  // CORS وحدها لا تحمي: هي قيدُ متصفّحٍ لا قيدُ خادم — وأي سكربت أو curl يتجاوزها.
  // فالبوابة الحقيقية هي هذه: توكن هوية موقَّع من Firebase، يُتحقَّق من توقيعه
  // بمفاتيح Google العامة. لا يمكن تزويره، ولا يُقرأ من متصفّح مستخدمٍ آخر.
  const authHeader = request.headers.get("Authorization") || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const idClaims = idToken ? await verifyIdToken(idToken, env) : null;

  if (idClaims && idClaims.role) {
    console.log("ai-auth: ✅ مقبول | الدور:", idClaims.role, "| المستخدم:", idClaims.u || idClaims.name || "—");
  } else {
    console.log("ai-auth: ⛔ مرفوض |", idToken ? "توكن غير صالح أو منتهٍ أو بلا دور" : "بلا توكن إطلاقاً",
                "| الوضع:", AI_AUTH_ENFORCE ? "يرفض (المرحلة ب)" : "يسجّل فقط (المرحلة أ)");
    if (AI_AUTH_ENFORCE) {
      return json({ error: "unauthorized" }, 401, origin);
    }
  }
  // ──────────────────────────────────────────────────────────────────────

  // v5: سقف حجم الطلب (اقرأ النص أولاً ثم حلّله)
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return json({ error: "payload_too_large" }, 413, origin);
  }
  let payload;
  try { payload = JSON.parse(rawBody); }
  catch { return json({ error: "bad_json" }, 400, origin); }

  // v5: نموذج مسموح فقط + سقف max_tokens + بنية messages سليمة
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.messages)) {
    return json({ error: "bad_request" }, 400, origin);
  }
  if (!ALLOWED_MODELS.includes(payload.model)) {
    return json({ error: "model_not_allowed" }, 400, origin);
  }
  if (typeof payload.max_tokens !== "number" || payload.max_tokens > MAX_TOKENS_CAP) {
    payload.max_tokens = Math.min(Number(payload.max_tokens) || 1000, MAX_TOKENS_CAP);
  }

  const beta = payload._beta;
  if ("_beta" in payload) delete payload._beta;

  const headers = {
    "Content-Type": "application/json",
    "x-api-key": env.ANTHROPIC_KEY,
    "anthropic-version": ANTHROPIC_VERSION,
  };
  if (beta) headers["anthropic-beta"] = beta;

  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

// ──────────────────────────────────────────────────────────────────────────
//  v8: التحقق من Firebase ID Token بمفاتيح Google العامة
//  (لا يحتاج مكتبات ولا أسرار جديدة — المفاتيح عامة ومُخزَّنة مؤقتاً في الذاكرة)
// ──────────────────────────────────────────────────────────────────────────
const FIREBASE_JWK_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let _jwks = null, _jwksExp = 0;

async function firebaseJwks() {
  const nowMs = Date.now();
  if (_jwks && nowMs < _jwksExp) return _jwks;
  const res = await fetch(FIREBASE_JWK_URL);
  if (!res.ok) throw new Error("jwks_fetch_failed: " + res.status);
  const m = /max-age=(\d+)/.exec(res.headers.get("cache-control") || "");
  _jwks = await res.json();
  _jwksExp = nowMs + ((m ? +m[1] : 3600) * 1000);
  return _jwks;
}

// يُعيد الـclaims عند صحة التوكن، أو null عند أي خلل (بلا تفاصيل للعميل).
async function verifyIdToken(jwt, env) {
  try {
    const pid = env.FIREBASE_PROJECT_ID;
    if (!pid) return null;

    const parts = String(jwt || "").split(".");
    if (parts.length !== 3) return null;

    const head = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));

    // (1) الشكل والجهة والمشروع والصلاحية — قبل أي عمل تعمية مكلف
    if (head.alg !== "RS256" || !head.kid) return null;
    if (claims.aud !== pid) return null;
    if (claims.iss !== "https://securetoken.google.com/" + pid) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    if (!claims.exp || claims.exp <= nowSec) return null;   // منتهٍ
    if (claims.iat && claims.iat > nowSec + 300) return null; // صادر في المستقبل

    // (2) التوقيع — وهو الحَكَم: بلا مفتاح Google الخاص لا يمكن تزويره
    const set = await firebaseJwks();
    const jwk = (set.keys || []).find(k => k.kid === head.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]
    );
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", key,
      b64urlToBytes(parts[2]),
      new TextEncoder().encode(parts[0] + "." + parts[1])
    );
    return ok ? claims : null;
  } catch (e) {
    console.error("verify_id_token_failed:", e && e.message || e);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────
//  (2) المصادقة الخادمية — POST /login
// ──────────────────────────────────────────────────────────────────────────
async function handleLogin(request, env, origin, ip) {
  // v5: تحديد معدّل يقطع محاولات تخمين كلمات المرور الآلية
  if (rateLimited("login", ip)) {
    return json({ error: "rate_limited", detail: "محاولات كثيرة — انتظر دقيقة ثم أعد المحاولة" }, 429, origin);
  }
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return json({ error: "server_misconfigured", detail: "firebase service account secrets missing" }, 500, origin);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ error: "bad_json" }, 400, origin); }

  const user = (body.user || "").trim();
  const pass = (body.pass || "").trim(); // يطابق .trim() في دالة دخول الواجهة
  const dev = body.dev === true; // اختبار على مستندات *_dev

  if (!user || !pass) return json({ error: "bad_credentials" }, 401, origin);

  const accessToken = await getAccessToken(env);
  const diag = [];
  const all = await loadAllUsers(env, accessToken, dev, diag);

  const passHash = await sha256hex(pass);
  const found = all.find(u => u.user === user && u.hash === passHash);

  // وضع تشخيص محمي بمفتاح: {"user":"...","pass":"...","debug":true,"debugKey":"..."}
  // لا يكشف أي hash؛ ولا يعمل إلا بمفتاح صحيح (يمنع تعداد المستخدمين).
  if (body.debug === true && env.DEBUG_KEY && body.debugKey === env.DEBUG_KEY) {
    return json({
      _debug: true,
      docsRead: diag,
      mergedUserCount: all.length,
      targetUserExists: all.some(u => u.user === user),
      hashMatchedForTarget: found ? true : false,
    }, 200, origin);
  }

  if (!found) {
    // 401 موحّد لمنع تعداد المستخدمين
    return json({ error: "bad_credentials" }, 401, origin);
  }

  const uid = "hail_" + await sha256hex(user); // معرّف ثابت ASCII لكل اسم مستخدم
  const claims = {
    role: found.role || "",
    name: found.name || found.user || "",
    u: found.user,
  };
  // أدرِج صلاحيات إن وُجدت (صغيرة الحجم — حد custom claims ~1000 بايت)
  if (found.permissions && typeof found.permissions === "object") {
    claims.perm = found.permissions;
  }

  const customToken = await mintCustomToken(env, uid, claims);

  return json({
    token: customToken,
    profile: {
      user: found.user,
      name: found.name || found.user,
      role: found.role || "",
      permissions: found.permissions || null,
      projects: Array.isArray(found.projects) ? found.projects : [],
    },
  }, 200, origin);
}

// ──────────────────────────────────────────────────────────────────────────
//  قراءة المستخدمين من Firestore عبر REST (خادمياً) — يطابق منطق الواجهة:
//  meta/projects → لكل مشروع meta/{id}_users + meta/users المركزي. الدمج: أول تطابق.
// ──────────────────────────────────────────────────────────────────────────
async function loadAllUsers(env, accessToken, dev, diag) {
  const pid = env.FIREBASE_PROJECT_ID;
  const sfx = dev ? "_dev" : "";
  const base = `https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents`;

  async function readDoc(docPath) {
    let status = 0, ok = false, errText = "";
    try {
      const res = await fetch(`${base}/${docPath}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      status = res.status;
      ok = res.ok;
      if (!res.ok) {
        errText = (await res.text()).slice(0, 200);
        if (diag) diag.push({ path: docPath, status, ok, err: errText });
        return null; // 404 = مستند غير موجود
      }
      const dataDoc = await res.json();
      if (diag) {
        const arr = decodeField(dataDoc, "users");
        diag.push({ path: docPath, status, ok, userCount: Array.isArray(arr) ? arr.length : 0 });
      }
      return dataDoc;
    } catch (e) {
      if (diag) diag.push({ path: docPath, status, ok: false, err: String(e && e.message || e) });
      return null;
    }
  }

  // 1) قائمة المشاريع
  const projDoc = await readDoc(`meta/projects${sfx}`);
  const projects = projDoc ? (decodeField(projDoc, "projects") || []) : [];

  // 2) مستندات المستخدمين: مستندات المشاريع أولاً ثم المركزي (مطابق للواجهة)
  const docPaths = projects
    .map(p => p && p.id ? `meta/${p.id}_users${sfx}` : null)
    .filter(Boolean);
  docPaths.push(`meta/users${sfx}`);

  const docs = await Promise.all(docPaths.map(dp => readDoc(dp).catch(() => null)));

  const merged = [];
  const seen = new Set();
  for (const d of docs) {
    if (!d) continue;
    const users = decodeField(d, "users");
    if (!Array.isArray(users)) continue;
    for (const u of users) {
      if (!u || !u.user) continue;
      if (seen.has(u.user)) continue; // أول تطابق يفوز
      seen.add(u.user);
      merged.push(u);
    }
  }
  return merged;
}

// استخراج حقل مفرد من مستند Firestore REST وفك تشفيره لقيمة JS عادية
function decodeField(doc, field) {
  if (!doc || !doc.fields || !(field in doc.fields)) return null;
  return decodeValue(doc.fields[field]);
}

// فك قيمة Firestore REST المُمَيَّزة (typed value) لقيمة JS
function decodeValue(v) {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) {
    const vals = (v.arrayValue && v.arrayValue.values) || [];
    return vals.map(decodeValue);
  }
  if ("mapValue" in v) {
    const out = {};
    const f = (v.mapValue && v.mapValue.fields) || {};
    for (const k in f) out[k] = decodeValue(f[k]);
    return out;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
//  service account: access token (scope datastore) + custom token
// ──────────────────────────────────────────────────────────────────────────
async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const assertion = await signJwt(header, claims, env.FIREBASE_PRIVATE_KEY);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("oauth_token_failed: " + t);
  }
  const data = await res.json();
  return data.access_token;
}

async function mintCustomToken(env, uid, customClaims) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    sub: env.FIREBASE_CLIENT_EMAIL,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now,
    exp: now + 3600,
    uid,
    claims: customClaims,
  };
  return await signJwt(header, claims, env.FIREBASE_PRIVATE_KEY);
}

// ──────────────────────────────────────────────────────────────────────────
//  أدوات تشفير: RS256 JWT + SHA-256 + base64url
// ──────────────────────────────────────────────────────────────────────────
let _cachedKey = null;
async function importPrivateKey(pem) {
  if (_cachedKey) return _cachedKey;
  // تنظيف متسامح: يتعامل مع \n النصية، الأسطر الفعلية، علامات الاقتباس،
  // المسافات، وأي ترويسة/تذييل PEM — ثم يُعيد ضبط الحشو (padding).
  let s = String(pem)
    .replace(/\\r/g, "")
    .replace(/\\n/g, "\n")                  // \n نصية → أسطر فعلية
    .replace(/-----BEGIN [^-]+-----/g, "")  // أزل أي ترويسة
    .replace(/-----END [^-]+-----/g, "")    // أزل أي تذييل
    .replace(/[^A-Za-z0-9+/]/g, "");        // أبقِ محارف base64 فقط (يزيل " ومسافات و=)
  if (s.length % 4 === 1) {
    // طول لا يمكن أن يكون base64 صحيحاً → المفتاح مقطوع/ناقص
    throw new Error("private_key_truncated: قيمة FIREBASE_PRIVATE_KEY تبدو ناقصة — أعد لصق المفتاح كاملاً");
  }
  while (s.length % 4 !== 0) s += "=";       // أعِد الحشو
  let der;
  try {
    der = b64ToBytes(s);
  } catch (e) {
    throw new Error("private_key_decode_failed: تعذّر فكّ ترميز FIREBASE_PRIVATE_KEY — تحقق أنه كامل وغير مقطوع");
  }
  _cachedKey = await crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return _cachedKey;
}

async function signJwt(header, claims, privateKeyPem) {
  const enc = (obj) => b64urlFromString(JSON.stringify(obj));
  const signingInput = `${enc(header)}.${enc(claims)}`;
  const key = await importPrivateKey(privateKeyPem);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${b64urlFromBytes(new Uint8Array(sig))}`;
}

async function sha256hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
// v8: base64url (المستعمل في JWT) → بايتات، عبر إعادة الحشو ثم b64ToBytes
function b64urlToBytes(x) {
  let s = String(x).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return b64ToBytes(s);
}
function b64urlFromString(str) {
  return b64urlFromBytes(new TextEncoder().encode(str));
}
function b64urlFromBytes(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
