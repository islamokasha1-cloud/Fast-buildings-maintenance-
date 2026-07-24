"use strict";
/**
 * مساعدات طابور الصادر wa_outbox — منع التكرار عبر معرّف مستند حتمي.
 * مشغّلات Firestore at-least-once (قد تُطلق مرتين)، لذا نستخدم .create() مع معرّف
 * حتمي: لو المستند موجود يفشل الإنشاء ⇒ نتجاهل التكرار بدل إرسال رسالة مكرّرة.
 */
const crypto = require("crypto");
const { OUTBOX_COLLECTION } = require("./config");

/**
 * معرّف حتمي = sha1(eventType|entityId|transition|recipient).
 * أي إعادة إطلاق لنفس الحدث لنفس المستلم تُنتج نفس المعرّف فيُدمج.
 */
function idempotencyId({ eventType, entityId, transition, recipient }) {
  const raw = [eventType, entityId, transition, recipient].join("|");
  return crypto.createHash("sha1").update(raw).digest("hex");
}

/**
 * يكتب مستند صادر واحداً إن لم يكن موجوداً مسبقاً.
 * @returns {Promise<{queued:boolean, id:string}>} queued=false يعني تكرار مُتجاهَل.
 */
async function enqueue(db, payload) {
  const id = idempotencyId(payload.event ? {
    eventType: payload.event.type,
    entityId: payload.event.entityId,
    transition: payload.event.transition,
    recipient: payload.to,
  } : payload);

  const ref = db.collection(OUTBOX_COLLECTION).doc(id);
  const doc = {
    to: payload.to,
    recipientRef: payload.recipientRef || null,
    template: payload.template,
    lang: payload.lang,
    params: payload.params || [],
    buttonParam: payload.buttonParam || null,
    event: payload.event || null,
    status: "queued", // queued → sent → delivered | failed | skipped
    attempts: 0,
    lastError: null,
    providerMessageId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    sentAt: null,
  };

  try {
    await ref.create(doc); // يفشل لو موجود ⇒ تكرار
    return { queued: true, id };
  } catch (e) {
    // ALREADY_EXISTS (code 6) ⇒ تكرار مقصود، ليس خطأ.
    if (e && (e.code === 6 || /already exists/i.test(e.message || ""))) {
      return { queued: false, id };
    }
    throw e;
  }
}

module.exports = { idempotencyId, enqueue };
