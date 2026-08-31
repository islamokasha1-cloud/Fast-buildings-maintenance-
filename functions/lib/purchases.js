"use strict";
/**
 * توجيه إشعارات اعتماد الشراء (المرحلة ٣).
 * الإشعار يتبع مسار الطلب: من ينتظر دوره الآن (حسب الحالة الجديدة) يُنبَّه — رسالة واحدة لكل مرحلة.
 * وصاحب الطلب يُنبَّه عند الرفض/الإغلاق فقط.
 */
const cfg = require("./config");
const { enqueue } = require("./outbox");
const { findByRole, findRequester, findNamedRecipientAnywhere } = require("./recipients");

/** اسم المشروع من مستند الطلب (مع بدائل). */
function projectName(po) {
  return po.projectName || po.building || po.projectId || "—";
}

/** عدد بنود الطلب. */
function itemCount(po) {
  return String((Array.isArray(po.items) ? po.items.length : 0) || 0);
}

/**
 * v18.9xb — مفتاحُ التوجيه: الحالةُ وحدَها لا تكفي.
 *
 * التوجيه كلُّه مبنيٌّ على «تغيّرت الحالة ⇒ انتقل الدورُ لمكتبٍ آخر». وهذا صحيحٌ
 * في كل المسار **إلا** `pending_extra`: البتُّ في البند الإضافي مرحلتان (مدير
 * المشاريع ثم التنفيذي فوق العتبة) وحالةُ الطلب واحدةٌ فيهما. فالنتيجة كانت:
 * رسالةٌ واحدةٌ تُرسَل لحظةَ الدخول — إلى **التنفيذي** بينما الدورُ لمدير المشاريع —
 * ثم **صمتٌ تام** حين يصير الدورُ للتنفيذي حقاً.
 *
 * `extraStage` (يكتبه التطبيق مع كل بتّ) يجعل المفتاحَ يتغيّر مع انتقال الدور،
 * فيلتقطه المشغّل. وغيابُه يُبقي السلوك على الحالة المجرّدة (توافقٌ رجعي).
 */
function routingKey(po) {
  if (!po) return null;
  const st = po.status || null;
  if (!st) return null;
  if (st === "pending_extra" && po.extraStage) return `${st}:${po.extraStage}`;
  return st;
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
  // v18.9xb: المقارنةُ على مفتاح التوجيه لا على الحالة — فمرحلتا البتّ في البند
  // الإضافي تُميَّزان رغم ثبات الحالة، وبقيةُ المسار بلا تغيير (المفتاح = الحالة).
  const newKey = routingKey(after);
  const prevKey = routingKey(before);
  if (!newStatus || !newKey) return;
  if (before && prevKey === newKey) return; // لم ينتقل الدور

  if (!(await isEnabled())) {
    logger.info("wa(po): مفتاح القتل مُفعّل — تخطّي");
    return;
  }

  const poId = String(after.id || "");
  const projectId = after.projectId || "";
  const proj = projectName(after);
  const transition = `${prevKey || ""}->${newKey}`;

  // (١) إشعار المسؤول الذي دوره الآن (حسب مفتاح التوجيه الجديد).
  // v18.9xb: المفتاحُ المركّب أولاً، ثم الحالةُ المجرّدة ارتداداً — فمرحلةُ بتٍّ
  // غيرُ معروفةٍ تصل مدير المشاريع بدل أن تسقط بصمت.
  const route = cfg.PO_ROUTING[newKey] || cfg.PO_ROUTING[newStatus];
  if (route) {
    /* ══ الاستلامُ الميدانيُّ تكليفٌ لشخصٍ بعينه — لا بثٌّ لكلّ المشرفين ══
       قرارُ المالك 31/08، شطران:
       (١) «تصل الرسالةُ المشرفَ المحدَّد في الطلب **أيّاً كان مسجَّلاً على أيّ مشروع**»
           — فالبحثُ صار `findNamedRecipientAnywhere`: مستندُ مشروع الطلب ثمّ المركزي
           (الحالةُ الغالبة بقراءتين)، ثمّ بقيّةُ مستندات المشاريع عند الفراغ. وقائمةُ
           الاختيار في الواجهة تجمع المشروعَ والمركزيَّ معاً، فمشرفٌ **يُختار ولا
           يُوجَد** أسوأُ من ألّا يُعرض أصلاً.
       (٢) «وإذا لم يُسجَّل مشرفٌ في طلب الشراء لا تُرسَل رسائلُ للجميع» — فبثُّ الدور
           سقط من هذه المرحلة وحدَها. وبديلُه ليس الصمت: **الدورُ الاحتياطيّ** (الأدمن)
           يقبض رسالةً واحدةً كي لا تقف المرحلةُ بلا عالمٍ بها — وهو نفسُ مبدأ
           `ROLE_FALLBACK` الموثَّق في config: الإشعارُ الضائعُ بصمتٍ أسوأُ عيبٍ ممكن،
           ورسالةٌ واحدةٌ لمن يملك كلَّ بوّابةٍ ليست «رسائلَ للجميع».
       وبقيةُ المراحل على بثِّ الدور كما كانت — لا مستلمَ **مسمّى** فيها أصلاً. */
    let recipients = null;
    let recipientRef = `role:${route.role}`;
    if (newKey === "sv_receiving") {
      const target = { user: after.receivingSupervisorUser, name: after.receivingSupervisor };
      const named = (target.user || target.name)
        ? await findNamedRecipientAnywhere(db, target, projectId)
        : [];
      if (named.length) {
        recipients = named;
        recipientRef = `named:${target.user || target.name}`;
      } else {
        const why = (target.user || target.name)
          ? `المشرف المستلم «${target.user || target.name}» بلا رقمٍ مفعَّلٍ في أيّ مشروع`
          : "لا مشرفَ مستلماً محدَّداً على الطلب";
        const fb = cfg.ROLE_FALLBACK;
        recipients = fb ? await findByRole(db, fb, projectId, true) : [];
        recipientRef = `fallback:${fb || "—"}`;
        logger.info(`wa(po): ${why} (${poId}) — لا بثَّ للمشرفين؛ ${recipients.length ? "الدورُ الاحتياطيّ " + fb : "ولا مستلمَ احتياطيّ"}`);
      }
    }
    if (!recipients) recipients = await findByRole(db, route.role, projectId);
    if (!recipients.length) {
      logger.info(`wa(po): لا مستلم للدور ${route.role} (طلب ${poId}) — تخطّي`);
    }
    for (const r of recipients) {
      const { queued } = await enqueue(db, {
        to: r.phone,
        recipientRef,
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

module.exports = { routePurchase, routingKey };
