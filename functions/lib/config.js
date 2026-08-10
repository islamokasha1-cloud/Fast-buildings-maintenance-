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
 * من ينتظر دوره الآن يُنبَّه (رسالة واحدة لكل مرحلة).
 * الأسماء مطابقة لرموز الحالة الفعلية في index.html (دالة أزرار الإجراء) — تحقّق 2026-07-26.
 * المسار: pending_pm→(اعتماد)→pm_approved→(مستودع)→wh_reviewed→(مشتريات)→
 *         pending_ceo/pending_finance/proc_executing→wh_receiving→closed.
 */
const PO_ROUTING = {
  pending_pm: { role: "project_manager", action: "موافقتك" },
  pm_approved: { role: "warehouse_manager", action: "مراجعتك" }, // بعد اعتماد مدير المشاريع
  wh_review: { role: "warehouse_manager", action: "مراجعتك" }, // مرادف قديم لنفس المرحلة
  wh_reviewed: { role: "procurement_officer", action: "اعتمادك" }, // بعد اعتماد المستودع
  pending_proc: { role: "procurement_officer", action: "اعتمادك" }, // مرادف قديم
  pending_ceo: { role: "ceo", action: "اعتمادك" },
  pending_finance: { role: "finance", action: "سدادك" },
  finance_returned: { role: "procurement_officer", action: "متابعتك" }, // المالية أعادته
  proc_executing: { role: "procurement_officer", action: "بدء التنفيذ" }, // تنفيذ الشراء
  wh_receiving: { role: "warehouse_manager", action: "استلامك" }, // إشعار المستودع بالاستلام
  pending_extra: { role: "ceo", action: "قرارك" },
};

/** حالات يُنبَّه فيها صاحب الطلب (createdBy) — الرفض والإغلاق فقط. */
const PO_NOTIFY_REQUESTER = new Set([
  "pm_rejected",
  "wh_rejected",
  "ceo_rejected",
  "rejected",
  "closed",
]);

/** تسميات الحالة العربية (للرسالة إلى صاحب الطلب). */
const PO_STATUS_LABELS = {
  pm_rejected: "مرفوض من مدير المشاريع",
  wh_rejected: "مرفوض من المستودع",
  ceo_rejected: "مرفوض من المدير التنفيذي",
  rejected: "مرفوض نهائياً",
  closed: "مغلق",
};

/* ═════════════ سداد أعمال الموارد البشرية (global_hr_payments) ═════════════
   وحدةٌ أُضيفت بعد المرحلة ٣ فبقيت بلا توجيهٍ خادميّ: الإشعار كان يُكتب في جرس
   التطبيق من متصفّح صاحب الإجراء وحده، فلا يصل المعتمِد على جواله إطلاقاً.
   التوجيه هنا نسخةُ منطقِ الشراء نفسها — من ينتظر دوره الآن يُنبَّه مرةً واحدة. */

/** مجموعة طلبات السداد (عامة، غير مقسّمة حسب المشروع — كطلبات الشراء). */
const HR_PAYMENTS_COLLECTION =
  process.env.WA_HR_PAYMENTS_COLLECTION || "global_hr_payments";

/**
 * قوالب رسائل السداد.
 * **الافتراض = قالبا الشراء المعتمَدان** (`po_approval_needed` / `po_status_update`)
 * — فتعمل الإشعارات لحظةَ النشر بلا انتظار مراجعة Meta لقالبٍ جديد. وبنيةُ القالبين
 * محايدة: {{2}} خانةُ سياقٍ (نكتب فيها «الموارد البشرية — نوع العمل») و{{5}} عددُ
 * البنود (طلب السداد بندٌ واحد دائماً). وعند اعتماد قالبين مخصّصين لاحقاً يكفي ضبط
 * `WA_HRP_APPROVAL_TEMPLATE` / `WA_HRP_STATUS_TEMPLATE` — بلا تعديل كود.
 */
const HRP = {
  approvalTemplate: process.env.WA_HRP_APPROVAL_TEMPLATE || PO.approvalTemplate,
  statusTemplate: process.env.WA_HRP_STATUS_TEMPLATE || PO.statusTemplate,
  lang: process.env.WA_HRP_TEMPLATE_LANG || PO.lang,
};

/**
 * توجيه: حالة طلب السداد الجديدة → { role, action }.
 * الرموز مطابقة لـ`HRP_STATUS` في `hr-payments.js` حرفياً (يحرسه فحصٌ في hail-tests).
 */
const HRP_ROUTING = {
  hrp_pending_pm: { role: "project_manager", action: "موافقتك" },
  hrp_pending_ceo: { role: "ceo", action: "اعتمادك" },
  hrp_pending_finance: { role: "finance", action: "سدادك" },
};

/**
 * حالات يُنبَّه فيها صاحب الطلب (مسؤول الموارد البشرية).
 * الرفض والإعادة للتصحيح **تنتظر فعلاً منه**، والإغلاق خبرُ اكتمال. أمّا `hrp_cancelled`
 * فهو فعلُه هو — لا يُشعَر به أحدٌ.
 */
const HRP_NOTIFY_REQUESTER = new Set([
  "hrp_pm_rejected",
  "hrp_ceo_rejected",
  "hrp_finance_returned",
  "hrp_closed",
]);

/** تسميات الحالة العربية (للرسالة إلى صاحب الطلب). */
const HRP_STATUS_LABELS = {
  hrp_pm_rejected: "مرفوض من مدير المشاريع",
  hrp_ceo_rejected: "مرفوض من المدير التنفيذي",
  hrp_finance_returned: "مُعاد من المالية للتصحيح",
  hrp_closed: "مغلق — تم السداد",
};

/**
 * تسميات نوعية الأعمال — نسخةٌ من `WORK_TYPES` في `hr-payments.js` (يحرسها فحص
 * تطابقٍ في hail-tests، فلا تنحرف النسختان بصمت). المفتاح المجهول يعود بنصّه الخام.
 */
const HRP_WORK_TYPES = {
  residency: "إقامات",
  work_permit: "رخص عمل",
  visa: "تأشيرات",
  exit_reentry: "خروج وعودة",
  sponsor_move: "نقل كفالة",
  insurance: "تأمين طبي",
  labor_office: "مكتب العمل / رسوم حكومية",
  passport: "جوازات / أحوال",
  other: "أخرى",
};

/* ═════════════ التعاقدات مع مقاولي الباطن والموردين ═════════════
   الوحدةُ الثالثةُ التي تُبنى بعد طبقة الإشعارات — فتقع في الفخّ نفسِه الذي وقعت فيه
   الموارد البشرية: `_notify` في `contracts.js` تكتب في **جرس التطبيق** من متصفّح
   صاحب الإجراء وحده. فمَن ينتظره اعتمادُ مستخلصٍ أو أمرِ تغييرٍ لا يعلم به إن لم
   يفتح النظام. هذا التوجيهُ يسدّ الفجوة بمنطق `purchases.js` نفسِه.

   **ثلاثُ مجموعاتٍ لا أربع:** الطلبُ والمستخلصُ وأمرُ التغيير — لأنّ لكلٍّ منها
   **بوّاباتِ انتظارٍ** يقف عندها شخصٌ بعينه. أمّا `global_contracts` فانتقالاتُها
   (توقيع · إيقاف · إقفال · فسخ) يفعلها صاحبُها وهو أمام الشاشة، فلا أحدَ ينتظرها
   في جواله — وإشعارٌ بلا منتظِرٍ ضجيجٌ يُدرَّب الناسُ على تجاهله. */

const CONTRACT_REQUESTS_COLLECTION =
  process.env.WA_CONTRACT_REQUESTS_COLLECTION || "global_contract_requests";
const CONTRACT_EXTRACTS_COLLECTION =
  process.env.WA_CONTRACT_EXTRACTS_COLLECTION || "global_contract_extracts";
const CONTRACT_CHANGES_COLLECTION =
  process.env.WA_CONTRACT_CHANGES_COLLECTION || "global_contract_changes";

/** قوالبُ التعاقدات — تستعير قالبَي الشراء المعتمَدَين حتى يُعتمَد مخصّصٌ (درسُ HRP). */
const CTR = {
  approvalTemplate: process.env.WA_CTR_APPROVAL_TEMPLATE || PO.approvalTemplate,
  statusTemplate: process.env.WA_CTR_STATUS_TEMPLATE || PO.statusTemplate,
  lang: process.env.WA_CTR_TEMPLATE_LANG || PO.lang,
};

/** توجيهُ طلب التعاقد — الرموزُ مطابقةٌ لـ`GATE_ROLES` في `contracts.js` (يحرسه فحص). */
const CRQ_ROUTING = {
  crq_pending_pm: { role: "project_manager", action: "موافقتك" },
  crq_pending_proc: { role: "procurement_officer", action: "اعتمادك" },
  crq_pending_finance: { role: "finance", action: "اعتمادك" },
  crq_pending_ceo: { role: "ceo", action: "اعتمادك" },
  crq_pending_pay: { role: "finance", action: "سدادك" },
  // ليست بوّابةَ اعتماد، لكنّها بابُ إنشاء العقد — وهو عملٌ ينتظر المشتريات فعلاً
  crq_approved: { role: "procurement_officer", action: "إنشاء العقد" },
};
const CRQ_NOTIFY_REQUESTER = new Set([
  "crq_pm_rejected", "crq_proc_returned", "crq_finance_returned",
  "crq_ceo_rejected", "crq_paid", "crq_converted",
]);
const CRQ_STATUS_LABELS = {
  crq_pm_rejected: "مرفوض من مدير المشاريع",
  crq_proc_returned: "مُعاد من المشتريات للتصحيح",
  crq_finance_returned: "مُعاد من المالية للتصحيح",
  crq_ceo_rejected: "مرفوض من المدير التنفيذي",
  crq_paid: "مسدَّد — مغلق",
  crq_converted: "أُنشئ منه العقد",
};

/** توجيهُ المستخلص — مطابقٌ لـ`EXT_GATES`. */
const EXT_ROUTING = {
  ext_pending_pm: { role: "project_manager", action: "اعتمادك" },
  ext_pending_ceo: { role: "ceo", action: "اعتمادك" },
  ext_pending_finance: { role: "finance", action: "سدادك" },
};
const EXT_NOTIFY_REQUESTER = new Set(["ext_pm_rejected", "ext_returned", "ext_paid"]);
const EXT_STATUS_LABELS = {
  ext_pm_rejected: "مرفوض من مدير المشاريع",
  ext_returned: "مُعاد للتصحيح",
  ext_paid: "مسدَّد",
};

/** توجيهُ أمر التغيير — مطابقٌ لـ`CHG_GATES`. */
const CHG_ROUTING = {
  chg_pending_pm: { role: "project_manager", action: "موافقتك" },
  chg_pending_proc: { role: "procurement_officer", action: "اعتمادك" },
  chg_pending_finance: { role: "finance", action: "اعتمادك" },
  chg_pending_ceo: { role: "ceo", action: "اعتمادك" },
  chg_approved: { role: "procurement_officer", action: "تطبيقه على العقد" },
};
const CHG_NOTIFY_REQUESTER = new Set(["chg_rejected", "chg_applied"]);
const CHG_STATUS_LABELS = {
  chg_rejected: "مرفوض",
  chg_applied: "مطبَّق على العقد",
};

/** خانةُ السياق ({{2}} في قالب الشراء المستعار) — تميّز مستندَ التعاقدات عن طلب الشراء. */
const CTR_CONTEXT = {
  request: "تعاقد",
  extract: "مستخلص عقد",
  change: "أمر تغيير عقد",
};

/**
 * السياقُ المختصر — للقالب **المخصّص** وحدَه.
 * نصُّه الثابتُ يقول «مستند تعاقدات» أصلاً، فتكرارُ كلمة «عقد» في الخانة حشوٌ يُطيل
 * الرسالةَ بلا معنى. (نفسُ منطق الموارد البشرية: المستعارُ يعوّض النصَّ الثابت،
 * والمخصّصُ لا يحتاج تعويضاً.)
 */
const CTR_CONTEXT_SHORT = {
  request: "طلب تعاقد",
  extract: "مستخلص",
  change: "أمر تغيير",
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
  CONTRACT_REQUESTS_COLLECTION,
  CONTRACT_EXTRACTS_COLLECTION,
  CONTRACT_CHANGES_COLLECTION,
  CTR,
  CRQ_ROUTING,
  CRQ_NOTIFY_REQUESTER,
  CRQ_STATUS_LABELS,
  EXT_ROUTING,
  EXT_NOTIFY_REQUESTER,
  EXT_STATUS_LABELS,
  CHG_ROUTING,
  CHG_NOTIFY_REQUESTER,
  CHG_STATUS_LABELS,
  CTR_CONTEXT,
  CTR_CONTEXT_SHORT,
  HR_PAYMENTS_COLLECTION,
  HRP,
  HRP_ROUTING,
  HRP_NOTIFY_REQUESTER,
  HRP_STATUS_LABELS,
  HRP_WORK_TYPES,
};
