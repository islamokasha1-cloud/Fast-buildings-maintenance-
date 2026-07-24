"use strict";
/**
 * توجيه إشعارات اعتماد الشراء (المرحلة ٣).
 * الإشعار يتبع مسار الطلب: من ينتظر دوره الآن (حسب الحالة الجديدة) يُنبَّه — رسالة واحدة لكل مرحلة.
 * وصاحب الطلب يُنبَّه عند الرفض/الإغلاق فقط.
 */
const cfg = require("./config");
const { enqueue } = require("./outbox");
const { findByRole, findRequester } = require("./recipients");

/** اسم المشروع من مستند الطلب (مع بدائل). */
function projectName(po) {
  return po.projectName || po.building || po.projectId || "—";
}

/** عدد بنود الطلب. */
function itemCount(po) {
  return String((Array.isArray(po.items) ? po.items.length : 0) || 0);
}

/**
 * يوجّه إشعارات تغيّر حالة طلب شراء.
 * @param {object|null} before  الطلب قبل التغيير (null عند الإنشاء).
 * @param {object} after        الطلب بعد التغيير.
 * @param {Function} isEnabled  دالة تُعيد Promise<boolean> لمفتاح القتل.
 * @param {object} db           Firestore.
 * @param {object} logger
 */
async function routePurchase(before, after, { db, logger, isEnabled }) {
  const newStatus = (after && after.status) || null;
  const prevStatus = (before && before.status) || null;
  if (!newStatus) return;
  if (before && prevStatus === newStatus) return; // لم تتغيّر الحالة

  if (!(await isEnabled())) {
    logger.info("wa(po): مفتاح القتل مُفعّل — تخطّي");
    return;
  }

  const poId = String(after.id || "");
  const projectId = after.projectId || "";
  const proj = projectName(after);
  const transition = `${prevStatus || ""}->${newStatus}`;

  // (١) إشعار المسؤول الذي دوره الآن (حسب الحالة الجديدة).
  const route = cfg.PO_ROUTING[newStatus];
  if (route) {
    const recipients = await findByRole(db, route.role, projectId);
    if (!recipients.length) {
      logger.info(`wa(po): لا مستلم للدور ${route.role} (طلب ${poId}) — تخطّي`);
    }
    for (const r of recipients) {
      const { queued } = await enqueue(db, {
        to: r.phone,
        recipientRef: `role:${route.role}`,
        template: cfg.PO.approvalTemplate,
        lang: cfg.PO.lang,
        // {{1}}الإجراء {{2}}المشروع {{3}}رقم الطلب {{4}}مقدّم الطلب {{5}}عدد البنود
        params: [
          route.action,
          proj,
          poId,
          String(after.createdByName || after.createdBy || "—"),
          itemCount(after),
        ],
        buttonParam: poId, // زر «فتح الطلب» → deep link
        event: { type: "po_approval_needed", entityId: poId, transition },
      });
      logger.info(`wa(po): ${queued ? "أُضيف" : "تكرار"} — ${poId} → ${route.role} (${r.phone})`);
    }
  }

  // (٢) إشعار صاحب الطلب عند الرفض/الإغلاق فقط.
  if (cfg.PO_NOTIFY_REQUESTER.has(newStatus)) {
    const requester = await findRequester(db, after, projectId);
    if (requester) {
      const label = cfg.PO_STATUS_LABELS[newStatus] || newStatus;
      const { queued } = await enqueue(db, {
        to: requester.phone,
        recipientRef: `${projectId ? "meta/" + projectId + "_users" : "meta/users"}:${after.createdBy}`,
        template: cfg.PO.statusTemplate,
        lang: cfg.PO.lang,
        params: [poId, proj, label], // {{1}}رقم {{2}}المشروع {{3}}الحالة
        buttonParam: poId,
        event: { type: "po_status_update", entityId: poId, transition },
      });
      logger.info(`wa(po): ${queued ? "أُضيف" : "تكرار"} تحديث لصاحب الطلب ${poId} (${label})`);
    }
  }
}

module.exports = { routePurchase };
