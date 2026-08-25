"use strict";
/**
 * واجهة API لنظامٍ خارجيّ — إنشاء طلب شراء وقراءة الطلبات (HTTPS / Cloud Run).
 *
 * ── المشكلة ──
 * المنصةُ SPA تكتب في Firestore من المتصفّح خلف Firebase Auth بدور — فلا بابَ
 * لنظامٍ خارجيّ يريد إنشاء طلب شراء أو قراءة حالته. ومنحُه حسابَ دخولٍ خطأٌ مزدوج:
 * القاعدةُ العامة تفتح له الكتابةَ في كل المجموعات تقريباً، وسيضطر لتقليد شكلِ
 * مستند الطلب (العدّاد الذرّي · التقريب · timeline · حقول التوافق) حرفياً — وأيُّ
 * انحرافٍ صغيرٍ يُنتج طلباتٍ تكسر الحسابات والتقارير بصمت.
 *
 * ── المبدأ ──
 * بابٌ واحدٌ خادميٌّ ضيّق: نقطة HTTPS بمفتاح سرّيّ (Secret Manager) تتحقّق من
 * المدخلات ثم تبني المستندَ **بالشكل القياسيّ نفسِه** الذي يبنيه `submitPurchase`
 * في `index.html` — العدّادُ بالمعاملة الذرّية نفسِها على `meta/global_po_counter`،
 * والحسابُ بمعادلات `addPurchaseItem` نفسِها (v18.9nc: vat البند اشتقاقاً طرحياً
 * فيصحّ `lineTotal + vat === itemCost` دائماً)، والحالةُ `pending_pm` **حصراً** —
 * فيدخل الطلبُ دورةَ الاعتماد من أوّلها ويلتقطه `poRouteCreate` فيُشعِر مديرَ
 * المشاريع واتسابَ بلا أيّ كودٍ إضافيّ. والقراءةُ نقطتان (قائمة بمرشّحات + طلب
 * واحد) مرتّبتان تنازلياً على **حقل `id` المخزَّن** (يساوي معرّفَ المستند حرفياً،
 * و`PO-YYYYMM-<عدّاد متزايد>` زمنيُّ الترتيب أصلاً). **لا على `__name__`**:
 * Firestore يرفض مسحَ المفاتيح تنازلياً بلا مرشّح ("descending key scans") —
 * خطأٌ لا يظهر إلا في الإنتاج (المحاكي يتساهل). ومع المرشّحات تلزم الفهارسُ
 * المركّبة المعلنةُ في `firestore.indexes.json` (status/projectId + id DESC).
 *
 * ── القرار ──
 * الدوالُّ الحسابية والتحقّقية هنا **نقيّةٌ** بلا أيّ استيرادٍ من Firebase، فيفحصها
 * `hail-tests.js` من جذر المشروع بلا متصفّحٍ ولا محاكٍ. والربطُ بالشبكة والقاعدة
 * في `makeHandler` وحدَها تُحقَن تبعيّاتُها (`db` · `FieldPath` · المفتاح) من
 * `functions/index.js`. **لا تعديلَ ولا حذفَ عبر هذا الباب عمداً**: الاعتمادُ
 * والرفضُ والإغلاقُ قراراتُ أصحاب الأدوار من داخل المنصة، وفتحُها لمفتاحٍ خارجيٍّ
 * يكسر فصلَ المهام الذي تحرسه القواعدُ والدورة.
 */

const crypto = require("crypto");

/* ═══════════════════════ ثوابت مطابقة للتطبيق ═══════════════════════ */

/** الأولويات كما في نموذج الإنشاء (`np-priority` في index.html) حرفياً. */
const VALID_PRIORITIES = ["عاجل", "متوسط", "عادي"];

/** الحالة الابتدائية الوحيدة المسموحة عبر هذا الباب. */
const INITIAL_STATUS = "pending_pm";

/** نص الحالة العربي — مطابق لـ`PO_STATUS.pending_pm` في index.html حرفياً. */
const INITIAL_STATUS_LABEL = "بانتظار موافقة مدير المشاريع";

/** حدود صلبة تمنع الإغراق والمستندات العملاقة. */
const MAX_ITEMS = 50;
const MAX_TEXT = 200;      // اسم مادة/مورد/مبنى/طالب المواد…
const MAX_NOTES = 300;     // كما يقصّ `addPurchaseItem` ملاحظةَ البند
const LIST_LIMIT_DEFAULT = 25;
const LIST_LIMIT_MAX = 100;

/* ═══════════════════════ دوالّ نقية — الحساب ═══════════════════════ */

const _r2 = (n) => Math.round(n * 100) / 100;

/**
 * حساب أرقام البند — نسخة معادلات `addPurchaseItem` (index.html) حرفياً:
 * vat = ض.ق.م البند كله اشتقاقاً طرحياً، فيُضمن lineTotal + vat === itemCost.
 * @param {{qty:number, unitCost:number}} it
 */
function computeItem(it) {
  const qty = Number(it.qty);
  const unitCost = Number(it.unitCost);
  const vatUnit = _r2(unitCost * 0.15);              // ض.ق.م الوحدة — عرض فقط
  const unitTotal = _r2(unitCost + vatUnit);         // سعر الوحدة شامل الضريبة
  const itemTotal = _r2(unitTotal * qty);            // إجمالي البند شامل الضريبة
  const lineTotal = _r2(unitCost * qty);             // صافي البند (بدون ضريبة)
  const vat = _r2(itemTotal - lineTotal);            // ض.ق.م البند
  return { vatUnit, unitTotal, itemCost: itemTotal, lineTotal, vat };
}

const _s = (v, max) => String(v == null ? "" : v).trim().slice(0, max || MAX_TEXT);

/** بند المستند الكامل بشكل `currentPurchaseItems` القياسي. */
function buildItem(raw) {
  const qty = Number(raw.qty);
  const unitCost = Number(raw.unitCost);
  const c = computeItem({ qty, unitCost });
  return {
    itemType: _s(raw.itemType),
    itemName: _s(raw.itemName),
    itemCode: _s(raw.itemCode),
    qty,
    unit: _s(raw.unit),
    unitCost,
    estUnitCost: unitCost,
    itemCost: c.itemCost,
    vat: c.vat,
    vatUnit: c.vatUnit,
    lineTotal: c.lineTotal,
    vendor: _s(raw.vendor),
    priceLocked: false,
    itemId: null,            // لا ربطَ كتالوجٍ خادمياً — يربطه المستودع عند المراجعة
    notes: _s(raw.notes, MAX_NOTES),
  };
}

/* ═══════════════════════ دوالّ نقية — التحقّق ═══════════════════════ */

/**
 * يتحقّق من جسم طلب الإنشاء. يعيد قائمة أخطاء عربية — فارغة = صالح.
 * الشرط: (projectId لمشروع مسجّل) **أو** (projectName لمشروع يدويّ) — كالتطبيق.
 */
function validateCreate(body) {
  const errs = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return ["جسم الطلب يجب أن يكون كائن JSON"];
  }
  const projectId = _s(body.projectId);
  const projectName = _s(body.projectName);
  if (!projectId && !projectName) {
    errs.push("حدّد المشروع: projectId لمشروع مسجّل أو projectName لمشروع يدوي");
  }
  if (!_s(body.supervisor)) errs.push("supervisor (طالب المواد) مطلوب");
  const priority = _s(body.priority);
  if (!priority) {
    errs.push("priority مطلوبة — إحدى: " + VALID_PRIORITIES.join(" / "));
  } else if (!VALID_PRIORITIES.includes(priority)) {
    errs.push("priority غير معروفة «" + priority + "» — إحدى: " + VALID_PRIORITIES.join(" / "));
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errs.push("items مطلوبة — بند واحد على الأقل");
  } else if (body.items.length > MAX_ITEMS) {
    errs.push("عدد البنود يتجاوز الحد (" + MAX_ITEMS + ")");
  } else {
    body.items.forEach((it, i) => {
      const n = "البند رقم " + (i + 1) + ": ";
      if (!it || typeof it !== "object") { errs.push(n + "ليس كائناً"); return; }
      if (!_s(it.itemName)) errs.push(n + "itemName مطلوب");
      if (!_s(it.itemType)) errs.push(n + "itemType مطلوب (نوع الخامة)");
      if (!_s(it.unit)) errs.push(n + "unit مطلوبة (الوحدة)");
      const q = Number(it.qty);
      if (!(Number.isFinite(q) && q > 0)) errs.push(n + "qty يجب أن تكون رقماً أكبر من صفر");
      const c = Number(it.unitCost);
      if (!(Number.isFinite(c) && c >= 0)) errs.push(n + "unitCost يجب أن تكون رقماً ≥ 0");
    });
  }
  return errs;
}

/* ═══════════════════════ دوالّ نقية — بناء المستند ═══════════════════════ */

/** رقم الطلب من العدّاد — صيغة `generatePOId` نفسها: PO-YYYYMM-0001. */
function formatPoId(counter, now) {
  const d = now instanceof Date ? now : new Date(now);
  const yr = d.getFullYear();
  const mon = String(d.getMonth() + 1).padStart(2, "0");
  return `PO-${yr}${mon}-${String(counter).padStart(4, "0")}`;
}

/**
 * يبني مستند طلب الشراء الكامل بالشكل القياسي (مرآة `submitPurchase`).
 * الحالة `pending_pm` **دائماً** مهما أرسل النظام الخارجي — لا تجاوزَ للدورة.
 * @param {object} p  { body, poId, projName, isCustomProject, nowIso }
 */
function buildPO(p) {
  const body = p.body;
  const items = body.items.map(buildItem);
  const first = items[0];
  const totalEstCost = _r2(items.reduce((s, it) => s + (it.itemCost || 0), 0));
  const totalVAT = _r2(items.reduce((s, it) => s + (it.vat || 0), 0));
  const totalNet = _r2(items.reduce((s, it) => s + (it.lineTotal || 0), 0));
  const itemsSummary = items.map((it) => `${it.itemName} (${it.qty} ${it.unit})`).join(" | ");
  const vendor = items.map((it) => it.vendor).filter(Boolean)[0] || "";
  const by = "نظام خارجي" + (_s(body.source) ? " — " + _s(body.source) : "");
  const building = p.isCustomProject ? "—" : (_s(body.building) || "—");

  return {
    id: p.poId,
    projectId: p.isCustomProject ? "__OTHER__" : _s(body.projectId),
    projectName: p.projName,
    isCustomProject: !!p.isCustomProject,
    building,
    itemType: first.itemType,
    itemName: items.length > 1 ? itemsSummary : first.itemName,
    qty: first.qty,
    unit: first.unit,
    items,
    priority: _s(body.priority),
    supervisor: _s(body.supervisor),
    estCost: totalEstCost,
    estCostNet: totalNet,
    estVAT: totalVAT,
    actualCost: 0,
    vendor,
    invoice: "",
    notes: _s(body.notes, 1000),
    ticketId: "",
    ticketIds: [],
    expectedDeliveryDate: _s(body.expectedDeliveryDate, 20),
    leadTimeDays: Math.max(0, Math.round(Number(body.leadTimeDays) || 0)),
    inContract: false,
    inBOQ: false,
    isSubstitute: false,
    substituteAccountId: "",
    status: INITIAL_STATUS,
    createdAt: p.nowIso,
    updatedAt: p.nowIso,
    createdBy: by,
    submittedBy: by,
    submittedByUser: "",
    source: "external_api",
    attachments: [],
    timeline: [
      { event: "تم إنشاء الطلب وتقديمه (عبر API خارجي)", by, at: p.nowIso, icon: "📤" },
      { event: "تغيير الحالة: " + INITIAL_STATUS_LABEL, code: INITIAL_STATUS, by, at: p.nowIso, icon: "👔" },
    ],
  };
}

/* ═══════════════════════ دوالّ نقية — المسارات والقائمة ═══════════════════════ */

/**
 * يفكّ المسار إلى عملية. المدعوم:
 *   POST /purchases            → create
 *   GET  /purchases            → list
 *   GET  /purchases/<id>       → get
 *   GET  /                     → info
 */
function parseRoute(method, rawPath) {
  const parts = String(rawPath || "/").split("/").filter(Boolean);
  const m = String(method || "").toUpperCase();
  if (parts.length === 0) return m === "GET" ? { op: "info" } : { op: null };
  if (parts[0] !== "purchases") return { op: null };
  if (parts.length === 1) {
    if (m === "POST") return { op: "create" };
    if (m === "GET") return { op: "list" };
    return { op: null };
  }
  if (parts.length === 2 && m === "GET") return { op: "get", id: decodeURIComponent(parts[1]) };
  return { op: null };
}

/** يطبّع معاملات القائمة (يعيدها آمنةً محدودة). */
function normalizeListParams(q) {
  const query = q || {};
  let limit = parseInt(query.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = LIST_LIMIT_DEFAULT;
  if (limit > LIST_LIMIT_MAX) limit = LIST_LIMIT_MAX;
  return {
    status: _s(query.status, 40),
    projectId: _s(query.projectId, 80),
    after: _s(query.after, 40),
    limit,
  };
}

/** مقارنة مفتاح API بزمن ثابت — لا تسريبَ طولٍ ولا محتوى عبر التوقيت. */
function keyMatches(provided, expected) {
  const a = Buffer.from(String(provided || ""), "utf8");
  const b = Buffer.from(String(expected || ""), "utf8");
  if (!b.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* ═══════════════════════ المعالج (يُحقَن بتبعيّاته) ═══════════════════════ */

/**
 * يبني معالج HTTP. التبعيات كلها تُحقن — الوحدة نفسها بلا Firebase.
 * @param {object} deps { db, logger, FieldPath, getApiKey }
 */
function makeHandler(deps) {
  const { db, logger, getApiKey } = deps;
  const COLL = deps.purchasesCollection || "global_purchases";
  const META = deps.counterDoc || "meta/global_po_counter";
  const SETTINGS = deps.settingsDoc || "meta/external_api";
  const AUDIT = deps.auditCollection || "audit_log";

  const send = (res, code, obj) => res.status(code).json(obj);
  const fail = (res, code, error, message) => send(res, code, { ok: false, error, message });

  return async function handler(req, res) {
    // خدمة‑إلى‑خدمة؛ ترويسات CORS تسهيلاً للاختبار، والمفتاح لا يوضع في متصفّح.
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, X-Api-Key");
    if (req.method === "OPTIONS") return res.status(204).send("");

    const route = parseRoute(req.method, req.path);
    if (!route.op) return fail(res, 404, "not_found", "المسار غير معروف — المدعوم: POST /purchases · GET /purchases · GET /purchases/{id}");
    if (route.op === "info") {
      return send(res, 200, {
        ok: true,
        service: "external-purchases-api",
        endpoints: ["POST /purchases", "GET /purchases", "GET /purchases/{id}"],
      });
    }

    if (!keyMatches(req.get("x-api-key"), getApiKey())) {
      return fail(res, 401, "unauthorized", "مفتاح API مفقود أو غير صحيح (ترويسة x-api-key)");
    }

    // مفتاح قتلٍ إداريّ: meta/external_api { enabled: false } يوقف الباب كله.
    try {
      const st = await db.doc(SETTINGS).get();
      if (st.exists && st.data().enabled === false) {
        return fail(res, 503, "disabled", "الواجهة موقوفة إدارياً");
      }
    } catch (_) { /* غياب المستند = مُفعَّلة */ }

    try {
      if (route.op === "get") {
        const snap = await db.collection(COLL).doc(route.id).get();
        if (!snap.exists) return fail(res, 404, "not_found", "لا يوجد طلب بالرقم " + route.id);
        return send(res, 200, { ok: true, purchase: snap.data() });
      }

      if (route.op === "list") {
        const p = normalizeListParams(req.query);
        let q = db.collection(COLL);
        if (p.status) q = q.where("status", "==", p.status);
        if (p.projectId) q = q.where("projectId", "==", p.projectId);
        // الترتيب تنازلياً على حقل `id` المخزَّن (= معرّف المستند، زمنيّ الترتيب)
        // لا على __name__: الإنتاج يرفض مسح المفاتيح تنازلياً بلا مرشّح
        // ("Firestore does not support descending key scans"). فهرسُ الحقل
        // الأحاديّ التنازلي تلقائيّ، ومع المرشّحات تخدم الفهارسُ المركّبة
        // المعلنة في firestore.indexes.json.
        q = q.orderBy("id", "desc");
        if (p.after) q = q.startAfter(p.after);
        const snap = await q.limit(p.limit).get();
        const purchases = snap.docs.map((d) => d.data());
        return send(res, 200, {
          ok: true,
          count: purchases.length,
          nextAfter: snap.docs.length === p.limit ? snap.docs[snap.docs.length - 1].id : null,
          purchases,
        });
      }

      // ── create ──
      const body = req.body;
      const errs = validateCreate(body);
      if (errs.length) return send(res, 400, { ok: false, error: "invalid", errors: errs });

      // المشروع: معرّفٌ مسجّل يُقرأ اسمُه من meta/projects، وإلا مشروعٌ يدويّ باسمه.
      let projName = _s(body.projectName);
      let isCustomProject = true;
      const wantedId = _s(body.projectId);
      if (wantedId && wantedId !== "__OTHER__") {
        const projSnap = await db.doc("meta/projects").get();
        const list = projSnap.exists && Array.isArray(projSnap.data().projects)
          ? projSnap.data().projects : [];
        const found = list.find((pr) => pr && pr.id === wantedId);
        if (!found) {
          return send(res, 400, {
            ok: false, error: "invalid",
            errors: ["projectId غير مسجّل: " + wantedId + " — أرسل projectName بدلاً منه لمشروع يدوي"],
          });
        }
        projName = found.name || wantedId;
        isCustomProject = false;
      }

      // العدّاد الذرّي — المعاملة نفسها التي في `generatePOId` (بلا مسح محليّ:
      // المستند مصدرُ الحقيقة والتطبيق يُبقيه دائماً ≥ أكبر رقم مكتوب).
      const now = new Date();
      const nowIso = now.toISOString();
      const counter = await db.runTransaction(async (tx) => {
        const doc = await tx.get(db.doc(META));
        const cur = doc.exists ? (doc.data().counter || 0) : 0;
        const next = cur + 1;
        tx.set(db.doc(META), { counter: next }, { merge: true });
        return next;
      });
      const poId = formatPoId(counter, now);

      const po = buildPO({ body, poId, projName, isCustomProject, nowIso });
      // create() لا set(): لو تصادف وجود المعرّف (عدّاد أُعيد يدوياً) نفشل صراحةً
      // بدل الدهس فوق طلبٍ قائم.
      await db.collection(COLL).doc(poId).create(po);

      // قيد تدقيق بشكل `logAudit` نفسه — best effort لا يُسقط الإنشاء.
      try {
        const aud = {
          id: "AUD-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
          action: "إنشاء طلب شراء (API خارجي)",
          details: "رقم الطلب: " + poId + " — " + po.itemName + " — " + po.building,
          by: po.createdBy,
          role: "-",
          at: nowIso,
        };
        await db.collection(AUDIT).doc(aud.id).set(aud);
      } catch (e) {
        logger.warn("externalApi: تعذّر قيد التدقيق: " + e.message);
      }

      logger.info(`externalApi: أُنشئ ${poId} (${po.items.length} بند، ${po.estCost} شامل الضريبة)`);
      return send(res, 201, {
        ok: true,
        id: poId,
        status: po.status,
        statusLabel: INITIAL_STATUS_LABEL,
        estCost: po.estCost,
        estCostNet: po.estCostNet,
        estVAT: po.estVAT,
      });
    } catch (e) {
      logger.error("externalApi: خطأ غير متوقع", e);
      // detail يصل حاملَ المفتاح وحده (بعد المصادقة) — يختصر تشخيص التكامل
      // بدل "internal" أعمى (وهكذا اكتُشف خطأ descending key scans أصلاً).
      return send(res, 500, {
        ok: false, error: "internal", message: "خطأ داخلي — أعد المحاولة",
        detail: String((e && e.message) || e).slice(0, 300),
      });
    }
  };
}

module.exports = {
  VALID_PRIORITIES,
  INITIAL_STATUS,
  INITIAL_STATUS_LABEL,
  MAX_ITEMS,
  LIST_LIMIT_DEFAULT,
  LIST_LIMIT_MAX,
  computeItem,
  buildItem,
  validateCreate,
  formatPoId,
  buildPO,
  parseRoute,
  normalizeListParams,
  keyMatches,
  makeHandler,
};
