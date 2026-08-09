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
const { findByRole, findRequester } = require("./recipients");

/** تسمية نوعية العمل — «أخرى» تعرض النصّ الحرّ الذي كتبه مسؤول الموارد البشرية. */
function workTypeLabel(r) {
  const key = String((r && r.workType) || "");
  if (key === "other") {
    const free = String((r && r.workTypeOther) || "").trim();
    if (free) return free;
  }
  return cfg.HRP_WORK_TYPES[key] || key || "—";
}

/** خانة السياق ({{2}} في القالب) — تُميّز طلب السداد عن طلب الشراء في الرسالة نفسها. */
function context(r) {
  return "الموارد البشرية — " + workTypeLabel(r);
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
  const requesterName = String(after.createdBy || after.createdByUser || "—");

  // (١) إشعار المسؤول الذي دوره الآن.
  const route = cfg.HRP_ROUTING[newStatus];
  if (route) {
    // المجموعة عامّة بلا مشروع — المستلمون من `meta/users` المركزي وحده.
    const recipients = await findByRole(db, route.role, "");
    if (!recipients.length) {
      logger.info(`wa(hrp): لا مستلم للدور ${route.role} (طلب ${id}) — تخطّي`);
    }
    for (const r of recipients) {
      const { queued } = await enqueue(db, {
        to: r.phone,
        recipientRef: `role:${route.role}`,
        template: cfg.HRP.approvalTemplate,
        lang: cfg.HRP.lang,
        // {{1}}الإجراء {{2}}السياق {{3}}رقم الطلب {{4}}مقدّم الطلب {{5}}عدد البنود
        params: [route.action, context(after), id, requesterName, "1"],
        buttonParam: id, // زر «فتح الطلب» — المعرّف HRP-… يوجّهه العميل للوحدة الصحيحة
        event: { type: "hrp_approval_needed", entityId: id, transition, occurrence },
      });
      logger.info(`wa(hrp): ${queued ? "أُضيف" : "تكرار"} — ${id} → ${route.role} (${r.phone})`);
    }
  }

  // (٢) إشعار صاحب الطلب عند الرفض/الإعادة/الإغلاق.
  if (cfg.HRP_NOTIFY_REQUESTER.has(newStatus)) {
    const requester = await findRequester(db, after, "");
    if (requester) {
      const label = cfg.HRP_STATUS_LABELS[newStatus] || newStatus;
      const { queued } = await enqueue(db, {
        to: requester.phone,
        recipientRef: `meta/users:${after.createdByUser || after.createdBy}`,
        template: cfg.HRP.statusTemplate,
        lang: cfg.HRP.lang,
        params: [id, context(after), label], // {{1}}رقم {{2}}السياق {{3}}الحالة
        buttonParam: id,
        event: { type: "hrp_status_update", entityId: id, transition, occurrence },
      });
      logger.info(`wa(hrp): ${queued ? "أُضيف" : "تكرار"} تحديث لصاحب الطلب ${id} (${label})`);
    } else {
      logger.info(`wa(hrp): صاحب الطلب ${id} بلا هاتف/موافقة — تخطّي`);
    }
  }
}

module.exports = { routeHrPayment, workTypeLabel, context };
