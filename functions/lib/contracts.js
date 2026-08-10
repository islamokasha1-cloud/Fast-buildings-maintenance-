"use strict";
/**
 * توجيه إشعارات التعاقدات مع مقاولي الباطن والموردين.
 *
 * ثلاثُ مجموعاتٍ لكلٍّ منها بوّاباتُ انتظار: طلبُ التعاقد (`global_contract_requests`)
 * والمستخلص (`global_contract_extracts`) وأمرُ التغيير (`global_contract_changes`).
 * الوحدةُ — كوحدةِ الموارد البشرية قبلها — بُنيت **بعد** طبقة الإشعارات، فبقيت بلا
 * توجيهٍ خادميّ: `_notify` في `contracts.js` تكتب في جرس التطبيق من متصفّح صاحب
 * الإجراء وحده. فمن ينتظره اعتمادُ مستخلصٍ لا يعلم به ما لم يفتح النظام.
 *
 * المنطقُ نسخةٌ من `purchases.js` حرفياً — من ينتظر دورَه الآن يُنبَّه رسالةً واحدةً
 * لكل مرحلة، وصاحبُ المستند يُنبَّه عند الرفض والإغلاق.
 *
 * **بلا مبالغ في نصّ الرسالة** — قاعدةُ الشراء والموارد البشرية نفسُها: قيمُ العقود
 * والمستخلصات حسّاسة، والتفصيلُ يُقرأ داخل الوحدة التي لا يفتحها إلا صاحبُ الصلاحية
 * (زرّ «فتح الطلب» يوصله إليها). ولا أسماءَ أطرافٍ في المتن للسبب نفسِه.
 */
const cfg = require("./config");
const { enqueue } = require("./outbox");
const { findByRoleAnywhere, findRequesterAnywhere } = require("./recipients");

/**
 * أنواعُ المستندات الثلاثة — جدولٌ واحدٌ يجمع ما يختلف بينها، فالمنطقُ أدناه واحدٌ
 * لا ثلاث نسخٍ تتفرّع بصمت.
 */
const KINDS = {
  request: {
    routing: cfg.CRQ_ROUTING,
    notifyRequester: cfg.CRQ_NOTIFY_REQUESTER,
    labels: cfg.CRQ_STATUS_LABELS,
    context: cfg.CTR_CONTEXT.request,
    contextShort: cfg.CTR_CONTEXT_SHORT.request,
    tag: "crq",
  },
  extract: {
    routing: cfg.EXT_ROUTING,
    notifyRequester: cfg.EXT_NOTIFY_REQUESTER,
    labels: cfg.EXT_STATUS_LABELS,
    context: cfg.CTR_CONTEXT.extract,
    contextShort: cfg.CTR_CONTEXT_SHORT.extract,
    tag: "ext",
  },
  change: {
    routing: cfg.CHG_ROUTING,
    notifyRequester: cfg.CHG_NOTIFY_REQUESTER,
    labels: cfg.CHG_STATUS_LABELS,
    context: cfg.CTR_CONTEXT.change,
    contextShort: cfg.CTR_CONTEXT_SHORT.change,
    tag: "chg",
  },
};

/**
 * خانةُ السياق ({{2}}) — تعوّض النصَّ الثابت في قالب الشراء المستعار الذي يقول
 * «طلب شراء». بلا هذا تقرأ المالية «طلب شراء» فتبحث في الشاشة الخطأ (درسٌ حقيقيٌّ
 * من أوّل رسالةٍ وصلت جوّالَ المالك في وحدة الموارد البشرية).
 */
/* ════════════ شكلُ المتغيّرات يتبع القالبَ المضبوط ════════════
   القالبُ نصٌّ ثابتٌ معتمَدٌ لدى Meta + خاناتٌ نملؤها. فحين نستعير قالبَ الشراء يبقى
   نصُّه «طلب شراء … المشروع … عدد البنود»، وتعوّض {{2}} ذلك بالسياق و{{5}} بـ«1».
   وحين يُعتمَد قالبٌ مخصّصٌ يصير نصُّه الثابتُ هو الصحيح فتسقط الخانةُ الخامسة.

   **والفرزُ بمطابقة اسم القالب المضبوط لا بعَلَمٍ منفصلٍ يُنسى** — درسُ الموارد
   البشرية حرفياً. وعطلُ الخطأ هنا **صامتٌ تماماً**: عددُ خاناتٍ لا يطابق القالبَ ⇒
   Meta ترفض **كلَّ** رسائل التعاقدات بلا أن يتغيّر سطرٌ في النظام. */
function usingPoApprovalTemplate() {
  return cfg.CTR.approvalTemplate === cfg.PO.approvalTemplate;
}
function usingPoStatusTemplate() {
  return cfg.CTR.statusTemplate === cfg.PO.statusTemplate;
}

function context(kind, doc) {
  const base = usingPoApprovalTemplate() ? KINDS[kind].context : KINDS[kind].contextShort;
  /* **اسمُ المشروع اليدويّ نصٌّ حرٌّ** يكتبه مقدّمُ الطلب بيده — و«استراحة فلان» اسمُ
     مشروعٍ طبيعيٌّ تماماً. فهو البابُ نفسُه الذي أُغلق في «أخرى» بوحدة الموارد البشرية
     (v18.9.2534): خانةٌ حرّةٌ تحمل اسمَ شخصٍ إلى رسالةٍ تخرج إلى جوّالٍ وتمرّ بخوادم
     Meta وتبقى في سجلّ المحادثة. أمّا مشاريعُ القائمة المسجّلة فأسماؤها من قائمةٍ
     مغلقةٍ يديرها المالك — لا نصَّ حرّاً فيها. */
  return contextOf(base, doc);
}

/** بناءُ السياق من أساسٍ معطى — منطقُ المشروع اليدويّ في موضعٍ واحدٍ لا اثنين. */
function contextOf(base, doc) {
  if (doc && (doc.isCustomProject === true || doc.projectId === "__OTHER__")) {
    return `${base} — مشروع يدويّ`;
  }
  const proj = String((doc && (doc.projectName || doc.projectId)) || "").trim();
  return proj ? `${base} — ${proj}` : base;
}

/** خاناتُ رسالة «بانتظار إجراءك» بالشكل الذي يطلبه القالبُ المضبوط. */
function approvalParams(action, ctx, docId, requester) {
  return usingPoApprovalTemplate()
    ? [action, ctx, docId, requester, "1"]   // {{5}} «عدد البنود» في قالب الشراء
    : [action, ctx, docId, requester];
}

/** معرّفُ العقد إن وُجد — يُذكر في رسالة صاحب المستند ليعرف أيَّ عقدٍ يخصّ. */
function contractRef(doc) {
  return String((doc && (doc.contractId || doc.id)) || "—");
}

/**
 * يوجّه إشعارات تغيّر حالة مستندِ تعاقد.
 *
 * @param {"request"|"extract"|"change"} kind نوعُ المستند
 * @param {object|null} before الحالة قبل التغيير (null عند الإنشاء)
 * @param {object} after  الحالة بعد التغيير
 * @param {object} deps   { db, logger, isEnabled }
 */
async function routeContractDoc(kind, before, after, { db, logger, isEnabled }) {
  const K = KINDS[kind];
  if (!K) return;

  const newStatus = (after && after.status) || null;
  const prevStatus = (before && before.status) || null;
  if (!newStatus) return;
  if (before && prevStatus === newStatus) return; // لم تتغيّر الحالة

  if (!(await isEnabled())) {
    logger.info(`wa(${K.tag}): مفتاح القتل مُفعّل — تخطّي`);
    return;
  }

  const docId = String(after.id || "");
  const ctx = context(kind, after);
  // رسالةُ الحالة قالبُها مستقلّ — قد يُعتمَد المخصّصُ لأحدهما قبل الآخر
  const ctxStatus = usingPoStatusTemplate() ? ctx : contextOf(KINDS[kind].contextShort, after);
  const transition = `${prevStatus || ""}->${newStatus}`;

  // (١) مَن دورُه الآن — رسالةٌ واحدةٌ لكلّ مرحلة.
  // `findByRoleAnywhere`: مجموعاتُ التعاقدات **عامةٌ لا تتبع مشروعاً** (كطلبات
  // السداد)، فالبحثُ عن المستلم يشمل كلّ وثائق المستخدمين لا وثيقةَ مشروعٍ واحد.
  const route = K.routing[newStatus];
  if (route) {
    const recipients = await findByRoleAnywhere(db, route.role);
    if (!recipients.length) {
      logger.info(`wa(${K.tag}): لا مستلم للدور ${route.role} (${docId}) — تخطّي`);
    }
    for (const r of recipients) {
      const { queued } = await enqueue(db, {
        to: r.phone,
        recipientRef: `role:${route.role}`,
        template: cfg.CTR.approvalTemplate,
        lang: cfg.CTR.lang,
        // {{1}}الإجراء {{2}}السياق {{3}}رقم المستند {{4}}مقدّمه (+{{5}}عدد البنود للمستعار)
        params: approvalParams(
          route.action, ctx, docId,
          String(after.createdBy || after.createdByUser || "—")
        ),
        buttonParam: docId, // زرّ «فتح» → deep link
        event: { type: `${K.tag}_approval_needed`, entityId: docId, transition },
      });
      logger.info(
        `wa(${K.tag}): ${queued ? "أُضيف" : "تكرار"} — ${docId} → ${route.role} (${r.phone})`
      );
    }
  }

  // (٢) صاحبُ المستند — عند الرفض/الإعادة/الإغلاق فقط.
  if (K.notifyRequester.has(newStatus)) {
    const requester = await findRequesterAnywhere(db, after);
    if (requester) {
      const label = K.labels[newStatus] || newStatus;
      const { queued } = await enqueue(db, {
        to: requester.phone,
        recipientRef: `meta/users:${after.createdBy || after.createdByUser || ""}`,
        template: cfg.CTR.statusTemplate,
        lang: cfg.CTR.lang,
        params: [docId, ctxStatus, label], // {{1}}رقم {{2}}السياق {{3}}الحالة
        buttonParam: docId,
        event: { type: `${K.tag}_status_update`, entityId: docId, transition },
      });
      logger.info(
        `wa(${K.tag}): ${queued ? "أُضيف" : "تكرار"} تحديث لصاحب المستند ${docId} (${label})` +
          ` — عقد ${contractRef(after)}`
      );
    }
  }
}

module.exports = { routeContractDoc, KINDS, approvalParams, usingPoApprovalTemplate };
