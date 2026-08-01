"use strict";
/**
 * نقطة الإرسال الوحيدة (Provider Adapter) — WhatsApp Cloud API من Meta.
 * لتبديل المزوّد (Twilio/BSP) لاحقاً: تُغيَّر هذه الدالة فقط، ويبقى بقية النظام كما هو.
 */
const { WA } = require("./config");

/**
 * تطبيع رقم الجوال إلى الصيغة الدولية بلا + (كما تطلب Meta).
 * v18.9vu — M15: كان الإرسال يزيل الرموز فقط بلا تحويل، فرقمٌ محلي مثل 0501234567
 * يُرسَل بصفرٍ بادئ فترفضه Meta أو يذهب لرقمٍ خاطئ. الآن: 05XXXXXXXX ⇒ 9665XXXXXXXX.
 */
function normalizeMsisdn(raw) {
  let d = String(raw == null ? "" : raw).replace(/[^\d]/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);                 // بادئة اتصال دولي 00
  if (d.startsWith("966")) return d;                       // دولي سعودي بالفعل
  if (d.length === 10 && d.startsWith("05")) return "966" + d.slice(1); // محلي 05XXXXXXXX
  if (d.length === 9 && d.startsWith("5")) return "966" + d;            // بلا صفر بادئ
  return d;                                                // رقمٌ دوليٌّ آخر — كما هو
}

/**
 * يرسل رسالة قالب (Template) عبر WhatsApp Cloud API.
 * @param {object} p
 * @param {string} p.token       توكن الوصول (سرّ — يُحقن من Secret Manager).
 * @param {string} p.to          رقم المستلم بصيغة E.164 بدون + (Meta تقبل الرقم الدولي).
 * @param {string} p.template    اسم القالب المعتمد.
 * @param {string} p.lang        رمز لغة القالب (مثل "ar" أو "en_US").
 * @param {string[]} p.params    متغيّرات جسم القالب بالترتيب {{1}},{{2}}...
 * @param {string} [p.buttonParam] قيمة متغيّر زر الرابط الديناميكي (deep link) — لاحقة الـ URL.
 * @returns {Promise<{ok:boolean, id?:string, error?:string, status?:number}>}
 */
async function sendTemplate({ token, to, template, lang, params, buttonParam }) {
  if (!WA.phoneNumberId) {
    return { ok: false, error: "WHATSAPP_PHONE_NUMBER_ID غير مضبوط" };
  }
  if (!token) {
    return { ok: false, error: "توكن واتساب غير متوفّر (WHATSAPP_TOKEN)" };
  }

  const url = `https://graph.facebook.com/${WA.graphVersion}/${WA.phoneNumberId}/messages`;

  // قوالب اختبار Meta الجاهزة بلا متغيّرات — إرسال أي parameters لها يرفضه Meta.
  // نتجاهل المتغيّرات لها تلقائياً حتى تعمل تجربة hello_world من أول مرة.
  const NO_PARAM_TEMPLATES = new Set(["hello_world"]);
  const skipParams =
    NO_PARAM_TEMPLATES.has(template) || process.env.WA_TEMPLATE_NO_PARAMS === "true";

  // بناء مكوّن جسم القالب فقط إن وُجدت متغيّرات ولم يكن القالب بلا متغيّرات.
  const components =
    !skipParams && Array.isArray(params) && params.length
      ? [
          {
            type: "body",
            parameters: params.map((t) => ({ type: "text", text: String(t) })),
          },
        ]
      : [];

  // زر رابط ديناميكي (deep link): لاحقة تُلحق بالـ URL في القالب المعتمَد.
  if (!skipParams && buttonParam) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: String(buttonParam) }],
    });
  }

  const body = {
    messaging_product: "whatsapp",
    to: normalizeMsisdn(to), // أرقام فقط + تطبيع الصيغة السعودية 05→966
    type: "template",
    template: {
      name: template,
      language: { code: lang },
      ...(components.length ? { components } : {}),
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        (data && data.error && (data.error.message || data.error.type)) ||
        `HTTP ${res.status}`;
      return { ok: false, error: msg, status: res.status };
    }
    const id =
      data && data.messages && data.messages[0] && data.messages[0].id
        ? data.messages[0].id
        : null;
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

module.exports = { sendTemplate, normalizeMsisdn };
