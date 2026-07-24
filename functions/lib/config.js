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

/** مجموعة طلبات الشراء (عامة، غير مقسّمة حسب المشروع). */
const PURCHASES_COLLECTION = process.env.WA_PURCHASES_COLLECTION || "global_purchases";

/** الرابط الأساسي لفتح الطلب مباشرة في النظام (deep link في زر القالب). */
const APP_BASE_URL =
  process.env.WA_APP_BASE_URL ||
  "https://islamokasha1-cloud.github.io/Fast-buildings-maintenance-/";

/** قوالب الشراء المعتمَدة (عربية). */
const PO = {
  approvalTemplate: process.env.WA_PO_APPROVAL_TEMPLATE || "po_approval_needed",
  statusTemplate: process.env.WA_PO_STATUS_TEMPLATE || "po_status_update",
  lang: process.env.WA_PO_TEMPLATE_LANG || "ar",
};

/**
 * توجيه: حالة الطلب الجديدة → { role: الدور المطلوب, action: نص الإجراء في الرسالة }.
 * من ينتظر دوره الآن يُنبَّه (رسالة واحدة لكل مرحلة). متفق عليه 2026-07-24.
 */
const PO_ROUTING = {
  pending_pm: { role: "project_manager", action: "موافقتك" },
  wh_review: { role: "warehouse_manager", action: "مراجعتك" },
  pending_proc: { role: "procurement_officer", action: "اعتمادك" },
  pending_ceo: { role: "ceo", action: "اعتمادك" },
  pending_finance: { role: "finance", action: "سدادك" },
  finance_returned: { role: "procurement_officer", action: "متابعتك" },
  wh_receiving: { role: "warehouse_manager", action: "استلامك" },
  pending_extra: { role: "ceo", action: "قرارك" },
};

/** حالات يُنبَّه فيها صاحب الطلب (createdBy) — الرفض والإغلاق فقط. */
const PO_NOTIFY_REQUESTER = new Set([
  "rejected",
  "pm_rejected",
  "wh_rejected",
  "ceo_rejected",
  "rejected_final",
  "closed",
  "closed_after_receipt",
]);

/** تسميات الحالة العربية (للرسالة إلى صاحب الطلب). */
const PO_STATUS_LABELS = {
  rejected: "مرفوض",
  pm_rejected: "مرفوض من مدير المشاريع",
  wh_rejected: "مرفوض من المستودع",
  ceo_rejected: "مرفوض من المدير التنفيذي",
  rejected_final: "مرفوض نهائياً",
  closed: "مغلق",
  closed_after_receipt: "مغلق بعد الاستلام",
};

module.exports = {
  TICKET_COLLECTIONS,
  TECHNICIANS_COLLECTION,
  OUTBOX_COLLECTION,
  LOG_COLLECTION,
  SETTINGS_DOC,
  WA,
  MAX_ATTEMPTS,
  PURCHASES_COLLECTION,
  APP_BASE_URL,
  PO,
  PO_ROUTING,
  PO_NOTIFY_REQUESTER,
  PO_STATUS_LABELS,
};
