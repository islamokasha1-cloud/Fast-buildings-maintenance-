"use strict";
/**
 * توجيه إشعارات سداد أعمال الموارد البشرية (`global_hr_payments`).
 *
 * الوحدة أُضيفت بعد بناء طبقة الإشعارات، فبقيت بلا توجيهٍ خادميّ: `_notifyStage` في
 * `hr-payments.js` تكتب في جرس التطبيق من متصفّح صاحب الإجراء وحده — لا رسالةَ واتساب
 * تصل المعتمِد على جواله، ولو كان خارج التطبيق لم يعلم بالطلب أصلاً. هذا الملفّ يسدّ
 * الفجوة بنفس منطق `purchases.js` حرفياً: من ينتظر دوره الآن يُنبَّه رسالةً واحدة لكل
 * مرحلة، وصاحبُ الطلب يُنبَّه عند الرفض/الإعادة/الإغلاق.
 *
 * **بلا مبالغ في نصّ الرسالة** — كقاعدة الشراء: بيانات السداد والرواتب حسّاسة، والتفاصيل
 * تُقرأ داخل الوحدة التي لا يفتحها إلا صاحب الصلاحية (زرّ «فتح الطلب» يوصله إليها).
 */
const cfg = require("./config");
const { enqueue } = require("./outbox");
const { findByRoleAnywhere, findRequesterAnywhere } = require("./recipients");

/** تسمية نوعية العمل — «أخرى» تعرض النصّ الحرّ الذي كتبه مسؤول الموارد البشرية. */
function workTypeLabel(r) {
  const key = String((r && r.workType) || "");
  if (key === "other") {
    const free = String((r && r.workTypeOther) || "").trim();
    if (free) return free;
  }
  return cfg.HRP_WORK_TYPES[key] || key || "—";
}

/** خانة السياق ({{2}} في قالب الشراء المستعار) — تُميّز طلب السداد عن طلب الشراء. */
function context(r) {
  return "الموارد البشرية — " + workTypeLabel(r);
}

/* ════════════ شكلُ المتغيّرات يتبع القالبَ المستعمَل ════════════
   القالبُ نصٌّ ثابتٌ معتمَدٌ في Meta + خاناتٌ نملؤها. فحين نستعير قالبَ الشراء يبقى
   نصُّه الثابت «طلب شراء … المشروع … عدد البنود» — وأثبتت أوّلُ رسالةٍ حقيقيةٍ على
   جوّال المالك أن ذلك يُضلّل: المالية تقرأ «طلب شراء» فتبحث في شاشة المشتريات.
   فلمّا يُعتمد قالبٌ مخصّصٌ يصير نصُّه الثابت هو الصحيح، وتتغيّر الخانات تبعاً:

   • قالبُ الشراء المستعار (٥ خانات): {{2}} خانةُ «المشروع» ⇒ نكتب فيها «الموارد
     البشرية — النوع» لنعوّض النصَّ الثابت، و{{5}} «عدد البنود» ⇒ «1» دائماً.
   • القالبُ المخصّص (٤ خانات): نصُّه يقول «سداد موارد بشرية» فلا نكرّره في {{2}}
     (النوعُ وحدَه يكفي)، ولا خانةَ «عدد بنود» أصلاً — فتسقط الخانةُ الخامسة.

   **ولا خانةَ للبيان المختصر في القالبين.** البيانُ نصٌّ حرٌّ قد يحمل اسمَ موظّف
   («تجديد إقامة فلان») — وقاعدةُ هذه الوحدة أن الإشعارات **بلا أسماء موظفين** (كما
   في `_notifyStage`)، والتفاصيلُ تُقرأ داخل الوحدة التي لا يفتحها إلا صاحبُ الصلاحية. */
function usingPoApprovalTemplate() {
  return cfg.HRP.approvalTemplate === cfg.PO.approvalTemplate;
}
function usingPoStatusTemplate() {
  return cfg.HRP.statusTemplate === cfg.PO.statusTemplate;
}

/** متغيّرات رسالة «بانتظار إجراءك» بالشكل الذي يطلبه القالبُ المضبوط. */
function approvalParams(r, action) {
  const id = String(r.id || "");
  const requester = String(r.createdBy || r.createdByUser || "—");
  return usingPoApprovalTemplate()
    ? [action, context(r), id, requester, "1"]
    : [action, workTypeLabel(r), id, requester];
}

/** متغيّرات رسالة «تحديث الحالة» لصاحب الطلب (ثلاث خانات في القالبين). */
function statusParams(r, label) {
  const id = String(r.id || "");
  return usingPoStatusTemplate()
    ? [id, context(r), label]
    : [id, workTypeLabel(r), label];
}

/**
 * يوجّه إشعارات تغيّر حالة طلب سداد.
 * @param {object|null} before  الطلب قبل التغيير (null عند الإنشاء).
 * @param {object} after        الطلب بعد التغيير.
 * @param {object} deps         { db, logger, isEnabled }
 */
async function routeHrPayment(before, after, { db, logger, isEnabled }) {
  const newStatus = (after && after.status) || null;
  const prevStatus = (before && before.status) || null;
  if (!newStatus) return;
  if (before && prevStatus === newStatus) return; // لم تتغيّر الحالة

  if (!(await isEnabled())) {
    logger.info("wa(hrp): مفتاح القتل مُفعّل — تخطّي");
    return;
  }

  const id = String(after.id || "");
  const transition = `${prevStatus || ""}->${newStatus}`;
  // طابعُ هذه الكتابة بعينها (M14): ثابتٌ لو أُعيد إطلاق المشغّل، ومختلفٌ لانتقالٍ
  // لاحقٍ ولو تكرّر الانتقالُ نفسه (رُفض ⇒ صُحّح ⇒ أُعيد إرساله ⇒ رُفض ثانيةً).
  const occurrence = String(after.updatedAt || after.createdAt || "");

  // (١) إشعار المسؤول الذي دوره الآن.
  const route = cfg.HRP_ROUTING[newStatus];
  if (route) {
    // المجموعة عامّة بلا مشروع ⇒ المركزيُّ `meta/users` أوّلاً، وإن خلا من الدور فمستنداتُ
    // المشاريع (رقمٌ أُدخل من لوحة الأدمن داخل مشروعٍ يعيش هناك وحده) — وإلّا كان
    // المستخدمُ نفسه تصله رسائلُ الشراء ولا تصله رسائلُ السداد.
    const recipients = await findByRoleAnywhere(db, route.role);
    if (!recipients.length) {
      logger.info(`wa(hrp): لا مستلم للدور ${route.role} (طلب ${id}) — تخطّي`);
    }
    for (const r of recipients) {
      const { queued } = await enqueue(db, {
        to: r.phone,
        recipientRef: `role:${route.role}`,
        template: cfg.HRP.approvalTemplate,
        lang: cfg.HRP.lang,
        // {{1}}الإجراء {{2}}النوع/السياق {{3}}رقم الطلب {{4}}مقدّم الطلب (+{{5}} على قالب الشراء)
        params: approvalParams(after, route.action),
        buttonParam: id, // زر «فتح الطلب» — المعرّف HRP-… يوجّهه العميل للوحدة الصحيحة
        event: { type: "hrp_approval_needed", entityId: id, transition, occurrence },
      });
      logger.info(`wa(hrp): ${queued ? "أُضيف" : "تكرار"} — ${id} → ${route.role} (${r.phone})`);
    }
  }

  // (٢) إشعار صاحب الطلب عند الرفض/الإعادة/الإغلاق.
  if (cfg.HRP_NOTIFY_REQUESTER.has(newStatus)) {
    const requester = await findRequesterAnywhere(db, after);
    if (requester) {
      const label = cfg.HRP_STATUS_LABELS[newStatus] || newStatus;
      const { queued } = await enqueue(db, {
        to: requester.phone,
        recipientRef: `meta/users:${after.createdByUser || after.createdBy}`,
        template: cfg.HRP.statusTemplate,
        lang: cfg.HRP.lang,
        params: statusParams(after, label), // {{1}}رقم {{2}}النوع/السياق {{3}}الحالة
        buttonParam: id,
        event: { type: "hrp_status_update", entityId: id, transition, occurrence },
      });
      logger.info(`wa(hrp): ${queued ? "أُضيف" : "تكرار"} تحديث لصاحب الطلب ${id} (${label})`);
    } else {
      logger.info(`wa(hrp): صاحب الطلب ${id} بلا هاتف/موافقة — تخطّي`);
    }
  }
}

module.exports = { routeHrPayment, workTypeLabel, context, approvalParams, statusParams };
