"use strict";
/**
 * إعدادات مركزية لطبقة إشعارات واتساب.
 * كل القيم قابلة للتهيئة عبر متغيّرات البيئة / الأسرار حتى لا نضع أي سرّ في الكود.
 * التصميم محايد تجاه المزوّد: تبديل المزوّد = تغيير نقطة الإرسال في whatsapp.js فقط.
 */

/**
 * مجموعات البلاغات التي نراقبها لحدث «إسناد فني».
 * النظام متعدّد المشاريع: البلاغات تُخزَّن في مجموعات عليا اسمها "<projectId>_tickets"
 * (مثل hail_tickets، bathroom001_tickets). Firestore triggers تحتاج مساراً لكل مجموعة،
 * لذا نُعرّفها هنا كقائمة قابلة للتوسّع. عند إضافة مشروع جديد: أضف مجموعته هنا وأعِد النشر.
 *
 * تُضبط عبر متغيّر البيئة WA_TICKET_COLLECTIONS (مفصولة بفواصل)، وإلّا الافتراضي أدناه.
 */
const TICKET_COLLECTIONS = (process.env.WA_TICKET_COLLECTIONS || "hail_tickets")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** مجموعة الفنيين — المعرّف = اسم الفني (نفس القيمة المخزّنة في حقل tickets.tech). */
const TECHNICIANS_COLLECTION = process.env.WA_TECHNICIANS_COLLECTION || "technicians";

/** طابور الصادر ومستند الإعدادات وأرشيف السجل. */
const OUTBOX_COLLECTION = "wa_outbox";
const LOG_COLLECTION = "wa_log";
const SETTINGS_DOC = "meta/wa_settings"; // { enabled: true, quietHours: {...} }

/** إعدادات مزوّد واتساب (Meta Cloud API). التوكن سرّ يُحقن من Secret Manager. */
const WA = {
  // معرّف الرقم المُرسِل (Phone Number ID من لوحة WhatsApp). ليس سرّاً لكنه قابل للتهيئة.
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  // إصدار Graph API.
  graphVersion: process.env.WHATSAPP_GRAPH_VERSION || "v21.0",
  // القالب المستخدم لإشعار إسناد الفني ولغته.
  // للاختبار السريع قبل اعتماد القوالب: اضبط WA_TEMPLATE=hello_world و WA_TEMPLATE_LANG=en_US.
  template: process.env.WA_TEMPLATE || "ticket_assigned",
  templateLang: process.env.WA_TEMPLATE_LANG || "ar",
};

/** الحد الأقصى لمحاولات الإرسال قبل وسم الرسالة failed. */
const MAX_ATTEMPTS = parseInt(process.env.WA_MAX_ATTEMPTS || "3", 10);

module.exports = {
  TICKET_COLLECTIONS,
  TECHNICIANS_COLLECTION,
  OUTBOX_COLLECTION,
  LOG_COLLECTION,
  SETTINGS_DOC,
  WA,
  MAX_ATTEMPTS,
};
