"use strict";
/**
 * نقطة الإرسال الوحيدة (Provider Adapter) — WhatsApp Cloud API من Meta.
 * لتبديل المزوّد (Twilio/BSP) لاحقاً: تُغيَّر هذه الدالة فقط، ويبقى بقية النظام كما هو.
 */
const { WA } = require("./config");

/**
 * يرسل رسالة قالب (Template) عبر WhatsApp Cloud API.
 * @param {object} p
 * @param {string} p.token       توكن الوصول (سرّ — يُحقن من Secret Manager).
 * @param {string} p.to          رقم المستلم بصيغة E.164 بدون + (Meta تقبل الرقم الدولي).
 * @param {string} p.template    اسم القالب المعتمد.
 * @param {string} p.lang        رمز لغة القالب (مثل "ar" أو "en_US").
 * @param {string[]} p.params    متغيّرات جسم القالب بالترتيب {{1}},{{2}}...
 * @returns {Promise<{ok:boolean, id?:string, error?:string, status?:number}>}
 */
async function sendTemplate({ token, to, template, lang, params }) {
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

  const body = {
    messaging_product: "whatsapp",
    to: String(to).replace(/[^\d]/g, ""), // أرقام فقط
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

module.exports = { sendTemplate };
