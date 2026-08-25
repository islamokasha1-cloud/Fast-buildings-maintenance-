"use strict";
/**
 * طبقة إشعارات واتساب — Cloud Functions (2nd gen).
 *
 * المسار الكامل لحدث «إسناد فني»:
 *   tickets/<...>_tickets (onUpdate/onCreate)  →  notifyRouter  →  wa_outbox
 *   wa_outbox (onCreate)                        →  waSender      →  WhatsApp Cloud API
 *
 * وبنفس الشكل: `global_purchases` → `poRoute*`، و`global_hr_payments` → `hrpRoute*`.
 *
 * كل شيء محايد تجاه المزوّد؛ التوكن سرّ يُحقن من Secret Manager (لا في الكود ولا المتصفح).
 */
const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

const cfg = require("./lib/config");
const { enqueue } = require("./lib/outbox");
const { sendTemplate } = require("./lib/whatsapp");
const { routePurchase } = require("./lib/purchases");
const { routeHrPayment } = require("./lib/hr-payments");
const { routeContractDoc } = require("./lib/contracts");
const { makeHandler: makeExternalApiHandler } = require("./lib/external-api");

admin.initializeApp();
const db = admin.firestore();

const WHATSAPP_TOKEN = defineSecret("WHATSAPP_TOKEN");
const EXTERNAL_API_KEY = defineSecret("EXTERNAL_API_KEY");

/* ═══════════════════════ أدوات مساعدة ═══════════════════════ */

/** مفتاح القتل العام: meta/wa_settings.enabled === false يوقف كل الإرسال. */
async function isEnabled() {
  try {
    const snap = await db.doc(cfg.SETTINGS_DOC).get();
    if (snap.exists && snap.data().enabled === false) return false;
  } catch (_) {
    /* غياب المستند = مُفعّل افتراضياً */
  }
  return true;
}

/** يبني اسم export آمن من اسم المجموعة. */
function safeName(coll) {
  return coll.replace(/[^a-zA-Z0-9]/g, "_");
}

/**
 * منطق التوجيه لحدث إسناد الفني.
 * @param {object|null} before  حالة البلاغ قبل التغيير (null عند الإنشاء).
 * @param {object} after        حالة البلاغ بعد التغيير.
 */
async function routeTicketAssignment(before, after) {
  const newTech = (after && after.tech) || null;
  const prevTech = (before && before.tech) || null;

  // نرسل فقط عند إسناد فعلي: الفني تغيّر وله قيمة (ليس null).
  if (!newTech) return;
  if (before && prevTech === newTech) return; // لم يتغيّر ⇒ تجاهل

  if (!(await isEnabled())) {
    logger.info("wa: مفتاح القتل مُفعّل — تخطّي الإرسال");
    return;
  }

  // مطابقة الفني بالاسم في مجموعة technicians.
  const techName = String(newTech).trim();
  const techSnap = await db.collection(cfg.TECHNICIANS_COLLECTION).doc(techName).get();
  if (!techSnap.exists) {
    logger.warn(`wa: لا يوجد مستند فني باسم "${techName}" — تخطّي`);
    return;
  }
  const tech = techSnap.data();
  if (!tech.phone || tech.waOptIn !== true) {
    logger.info(`wa: الفني "${techName}" بلا هاتف أو لم يوافق (waOptIn) — تخطّي`);
    return;
  }

  // متغيّرات القالب ticket_assigned: {{1}}اسم {{2}}رقم {{3}}النوع {{4}}المبنى {{5}}الأولوية
  const params = [
    techName,
    String(after.id || ""),
    String(after.workType || after.type || "—"),
    String(after.building || "—"),
    String(after.priority || "—"),
  ];

  const { queued } = await enqueue(db, {
    to: tech.phone,
    recipientRef: `${cfg.TECHNICIANS_COLLECTION}/${techName}`,
    template: cfg.WA.template,
    lang: cfg.WA.templateLang,
    params,
    event: {
      type: "ticket_assigned",
      entityId: String(after.id || techSnap.id),
      transition: `${prevTech || ""}->${newTech}`,
      // v18.9ad — M14: طابعُ هذه الكتابة بعينها. ثابتٌ لو أُعيد إطلاق المشغّل على
      // النسخة نفسها، ومختلفٌ لإسنادٍ لاحقٍ ولو تكرّر الانتقالُ نفسه.
      occurrence: String(after.assignedAt || after.updatedAt || after.lastUpdated || ""),
    },
  });

  logger.info(`wa: ${queued ? "أُضيف للطابور" : "تكرار مُتجاهَل"} — بلاغ ${after.id} → ${techName}`);
}

/* ═══════════════════════ مشغّلات البلاغات (notifyRouter) ═══════════════════════ */
// نُصدِّر مشغّلاً لكل مجموعة بلاغات مُهيّأة (متعدّد المشاريع) — تحديثاً وإنشاءً.
cfg.TICKET_COLLECTIONS.forEach((coll) => {
  const key = safeName(coll);

  exports[`ticketAssignUpdate_${key}`] = onDocumentUpdated(
    `${coll}/{ticketId}`,
    async (event) => {
      const before = event.data.before.exists ? event.data.before.data() : null;
      const after = event.data.after.exists ? event.data.after.data() : null;
      if (!after) return; // حذف ⇒ لا شيء
      await routeTicketAssignment(before, after);
    }
  );

  exports[`ticketAssignCreate_${key}`] = onDocumentCreated(
    `${coll}/{ticketId}`,
    async (event) => {
      const after = event.data && event.data.exists ? event.data.data() : null;
      if (!after) return;
      // بلاغ أُنشئ ومعه فنيّ مُسنَد مباشرة.
      await routeTicketAssignment(null, after);
    }
  );
});

/* ═══════════════════════ مشغّلات الشراء (المرحلة ٣) ═══════════════════════ */
// إشعار المعنيين بطلب الشراء حسب مسار الحالة + إشعار صاحب الطلب عند الرفض/الإغلاق.
const _poDeps = () => ({ db, logger, isEnabled });

exports.poRouteUpdate = onDocumentUpdated(
  `${cfg.PURCHASES_COLLECTION}/{poId}`,
  async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    if (!after) return;
    if (!after.id) after.id = event.params.poId;
    await routePurchase(before, after, _poDeps());
  }
);

exports.poRouteCreate = onDocumentCreated(
  `${cfg.PURCHASES_COLLECTION}/{poId}`,
  async (event) => {
    const after = event.data && event.data.exists ? event.data.data() : null;
    if (!after) return;
    if (!after.id) after.id = event.params.poId;
    // طلب أُنشئ مباشرة بحالة تحتاج إشعاراً (عادةً pending_pm).
    await routePurchase(null, after, _poDeps());
  }
);

/* ═══════════════ مشغّلات سداد أعمال الموارد البشرية ═══════════════ */
// نفس منطق الشراء: من ينتظر دوره الآن يُنبَّه، وصاحب الطلب عند الرفض/الإعادة/الإغلاق.
// المجموعة عامّة بلا مشروع، فمشغّلٌ واحدٌ لكلٍّ من التحديث والإنشاء يكفي.
exports.hrpRouteUpdate = onDocumentUpdated(
  `${cfg.HR_PAYMENTS_COLLECTION}/{hrpId}`,
  async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    if (!after) return;
    if (!after.id) after.id = event.params.hrpId;
    await routeHrPayment(before, after, _poDeps());
  }
);

exports.hrpRouteCreate = onDocumentCreated(
  `${cfg.HR_PAYMENTS_COLLECTION}/{hrpId}`,
  async (event) => {
    const after = event.data && event.data.exists ? event.data.data() : null;
    if (!after) return;
    if (!after.id) after.id = event.params.hrpId;
    // الطلب يُنشأ مباشرةً بحالةٍ تنتظر مسؤولاً (مدير المشاريع/التنفيذي/المالية).
    await routeHrPayment(null, after, _poDeps());
  }
);

/* ═══════════ التعاقدات (طلب · مستخلص · أمر تغيير) ═══════════
   ثلاثُ مجموعاتٍ بمنطقٍ واحد — تُبنى محفّزاتُها في حلقةٍ فلا يُنسى تحديثُ إحداها
   حين يتغيّر المنطق (كما نُسيت الوحدةُ كلُّها عن طبقة الإشعارات أوّلَ مرّة). */
const CTR_SOURCES = [
  { key: "crq", kind: "request", coll: cfg.CONTRACT_REQUESTS_COLLECTION },
  { key: "ext", kind: "extract", coll: cfg.CONTRACT_EXTRACTS_COLLECTION },
  { key: "chg", kind: "change", coll: cfg.CONTRACT_CHANGES_COLLECTION },
  // العقدُ نفسُه — حالةٌ واحدةٌ تُشعِر: بانتظار التوقيع (انتظارٌ حقيقيٌّ له صاحب)
  { key: "ctr", kind: "contract", coll: cfg.CONTRACTS_COLLECTION },
];
for (const src of CTR_SOURCES) {
  exports[`${src.key}RouteUpdate`] = onDocumentUpdated(
    `${src.coll}/{docId}`,
    async (event) => {
      const before = event.data.before.data();
      const after = event.data.after.data();
      if (!after) return;
      if (!after.id) after.id = event.params.docId;
      await routeContractDoc(src.kind, before, after, _poDeps());
    }
  );
  exports[`${src.key}RouteCreate`] = onDocumentCreated(
    `${src.coll}/{docId}`,
    async (event) => {
      const after = event.data.data();
      if (!after) return;
      if (!after.id) after.id = event.params.docId;
      await routeContractDoc(src.kind, null, after, _poDeps());
    }
  );
}

/* ═══════════ واجهة النظام الخارجي (externalApi — HTTPS/Cloud Run) ═══════════
   نقطتان: POST /purchases (إنشاء طلب شراء بالشكل القياسي وبحالة pending_pm حصراً)
   و GET /purchases[/{id}] (قراءة القائمة بمرشّحات أو طلب واحد). المفتاح سرٌّ في
   Secret Manager (EXTERNAL_API_KEY) ويُرسَل في ترويسة x-api-key. المنطق كله —
   تحقّقاً وحساباً وبناءً — في `lib/external-api.js` (دوالّ نقية يفحصها hail-tests)،
   وهنا الحقن وحده. الطلب المُنشأ يلتقطه `poRouteCreate` فيُشعِر واتساب تلقائياً. */
exports.externalApi = onRequest(
  { secrets: [EXTERNAL_API_KEY], maxInstances: 5 },
  (req, res) =>
    makeExternalApiHandler({
      db,
      logger,
      getApiKey: () => EXTERNAL_API_KEY.value(),
      purchasesCollection: cfg.PURCHASES_COLLECTION,
    })(req, res)
);

/* ═══════════════════════ المُرسِل (waSender) ═══════════════════════ */
exports.waSender = onDocumentCreated(
  { document: `${cfg.OUTBOX_COLLECTION}/{id}`, secrets: [WHATSAPP_TOKEN] },
  async (event) => {
    const ref = event.data.ref;
    const doc = event.data.data();
    if (!doc || doc.status !== "queued") return; // نرسل المُدرَج فقط
    await deliver(ref);
  }
);

/** يقرأ الرسائل العالقة ويعيد محاولتها (إعادة المحاولة + شبكة صمود). كل دقيقتين. */
exports.waRetry = onSchedule(
  { schedule: "every 2 minutes", secrets: [WHATSAPP_TOKEN] },
  async () => {
    const cutoff = new Date(Date.now() - 60 * 1000); // أقدم من دقيقة
    const snap = await db
      .collection(cfg.OUTBOX_COLLECTION)
      .where("status", "==", "queued")
      .where("createdAt", "<", cutoff)
      .limit(20)
      .get();
    // v18.9vu — C5: استعادة الرسائل العالقة في "sending" (حُجزت ثم مات التنفيذ قبل
    // الإرسال أو التحديث) — أقدم من 5 دقائق. الحجز الذرّي في deliver يمنع الإرسال المزدوج.
    const staleSending = await db
      .collection(cfg.OUTBOX_COLLECTION)
      .where("status", "==", "sending")
      .where("updatedAt", "<", new Date(Date.now() - 5 * 60 * 1000))
      .limit(20)
      .get();
    const refs = [];
    const seen = new Set();
    for (const d of snap.docs) { refs.push(d.ref); seen.add(d.ref.id); }
    for (const d of staleSending.docs) { if (!seen.has(d.ref.id)) refs.push(d.ref); }
    for (const r of refs) {
      await deliver(r);
    }
  }
);

/**
 * إرسال فعلي لرسالة صادرة واحدة + تحديث حالتها + أرشفة في wa_log.
 */
async function deliver(ref) {
  // v18.9vu — C5: احجز الرسالة ذرّياً (queued/sending عالق → sending) قبل الإرسال.
  // كان deliver يقرأ الحالة ثم يرسل ثم يحدّث بلا حجز — فتنفيذان متزامنان (waSender
  // مزدوج، أو waSender + waRetry) يريان "queued" فيرسلان مرتين. الآن من يفشل الحجز
  // لا يرسل. الحجز يقبل أيضاً "sending" العالق أقدم من 5 دقائق (تنفيذٌ مات في المنتصف).
  const STALE_MS = 5 * 60 * 1000;
  const doc = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const cur = snap.data();
    const isQueued = cur.status === "queued";
    const staleSending =
      cur.status === "sending" &&
      cur.updatedAt &&
      typeof cur.updatedAt.toMillis === "function" &&
      Date.now() - cur.updatedAt.toMillis() > STALE_MS;
    if (!isQueued && !staleSending) return null; // عولجت/يعالجها آخر — لا نرسل
    tx.update(ref, { status: "sending", updatedAt: new Date() });
    return cur;
  });
  if (!doc) return; // لم نحجزها

  const attempts = (doc.attempts || 0) + 1;

  const result = await sendTemplate({
    token: WHATSAPP_TOKEN.value(),
    to: doc.to,
    template: doc.template,
    lang: doc.lang,
    params: doc.params,
    buttonParam: doc.buttonParam || null,
  });

  const now = new Date();
  if (result.ok) {
    await ref.update({
      status: "sent",
      providerMessageId: result.id || null,
      attempts,
      sentAt: now,
      updatedAt: now,
      lastError: null,
    });
    await archive(ref.id, doc, "sent", result.id, null, attempts);
    logger.info(`wa: أُرسلت ${ref.id} → ${doc.to} (msg ${result.id || "?"})`);
  } else {
    const failed = attempts >= cfg.MAX_ATTEMPTS;
    await ref.update({
      status: failed ? "failed" : "queued", // يبقى queued ليعيد waRetry المحاولة
      attempts,
      lastError: result.error || "unknown",
      updatedAt: now,
    });
    if (failed) {
      await archive(ref.id, doc, "failed", null, result.error, attempts);
      logger.error(`wa: فشل نهائي ${ref.id} → ${doc.to}: ${result.error}`);
    } else {
      logger.warn(`wa: فشل مؤقت ${ref.id} (محاولة ${attempts}): ${result.error}`);
    }
  }
}

/** أرشيف نهائي لكل نتيجة إرسال (للتدقيق واللوحات). */
async function archive(outboxId, doc, status, msgId, error, attempts) {
  try {
    await db.collection(cfg.LOG_COLLECTION).add({
      outboxId,
      to: doc.to,
      recipientRef: doc.recipientRef || null,
      template: doc.template,
      event: doc.event || null,
      status,
      providerMessageId: msgId || null,
      error: error || null,
      attempts,
      at: new Date(),
    });
  } catch (e) {
    logger.warn(`wa: تعذّر الأرشفة في ${cfg.LOG_COLLECTION}: ${e.message}`);
  }
}
