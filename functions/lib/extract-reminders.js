"use strict";
/**
 * تذكيرُ واتساب بمواعيد المستخلصات الدورية — خزانةُ الوثائق (طلبُ المالك 12/09):
 * «يوجد مستخلصات دورية شهرية بتواريخ ثابتة … احتاج تذكير قبل موعد كل مستخلص بمدة
 * ٥ أيام وتكون مربوطة بمستخدمين من النظام حتى يرسل لهم رسائل واتساب للتذكير».
 *
 * ── المشكلة ──
 * موعدُ المستخلص الشهريّ في ذاكرة من يتابعه. ولا حدثَ في قاعدة البيانات يسبقه —
 * فلا مشغّلَ `onDocumentUpdated` يلتقطه كما تلتقط بقيةُ الطبقة انتقالاتِ الحالة.
 * الزمنُ هو الحدث، فالمصدرُ دالّةٌ **مجدولة** (`onSchedule`) تدور كلَّ صباحٍ وتسأل:
 * «أيُّ موعدٍ يقع تذكيرُه اليوم؟» — وهي أوّلُ استعمالٍ لِـ`onSchedule` خارج
 * `waRetry`، وتنبيهُ الخزانة المجدولُ الذي أُجّل في `v18.9.3172` بقرار المالك.
 *
 * ── المبدأ ──
 * • **الجدولُ على المستند** (`vault_extract_schedules`): يومُ الشهر · مهلةُ التذكير
 *   بالأيام (٥ افتراضاً) · المسؤولون بأسماء الدخول. والحسابُ هنا **نسخةٌ نقيّةٌ**
 *   من حساب `doc-vault.js` نفسِه — لا يستورد أحدُهما الآخر (الخادمُ لا يحمّل
 *   وحدةَ واجهة)، **والانحرافُ يمسكه حارسٌ في `hail-tests.js`** يطابق الاثنين على
 *   جدول تواريخ. وهو نمطُ `docVault.daysUntil` ↔ `contracts._docExpiryState`.
 * • **نافذةٌ لا لحظة**: التذكيرُ مستحقٌّ من (الموعد − المهلة) حتى الموعد نفسِه.
 *   فلو سقط يومٌ (نشرٌ متأخّر · عطلُ مجدوِل) لَحِق التذكيرُ في اليوم التالي بدل أن
 *   يضيع. والتكرارُ داخل النافذة مأمون: معرّفُ الطابور حتميٌّ (`sha1` يشمل
 *   الموعدَ والمستلم) فرسالةٌ واحدةٌ لكلّ (جدول · موعد · مستلم) مهما دارت الدالّة.
 * • **يومُ الاستحقاق يُقصّ إلى آخر يوم في الشهر**: «يوم ٣٠» في فبراير هو ٢٨ أو ٢٩.
 *   بلا هذا يختفي موعدُ فبراير كلُّه بصمت.
 * • **المستلمُ بالاسم أينما سُجِّل رقمُه** (`findNamedRecipientAnywhere`) — درسُ
 *   بلاغ ٣١/٠٨: الرقمُ قد يكون في مستند مشروعٍ آخر لا في المركزيّ.
 * • **بلا مبالغ** في المتن — قاعدةُ الطبقة كلِّها.
 * • **اليومُ بالتوقيت العالميّ** كما تحسبه الواجهة (`toISOString().slice(0,10)`)،
 *   والجدولةُ صباحاً بتوقيت الرياض حيث يتطابق التاريخان — فلا يفترق حسابُ الخادم
 *   عن حساب الشاشة بيومٍ عند حدود منتصف الليل.
 */
const cfg = require("./config");
const { enqueue } = require("./outbox");
const { findNamedRecipientAnywhere } = require("./recipients");

/* ════════ الدوالُّ النقيّة — يفحصها `hail-tests` ويطابقها بنسخة الواجهة ════════ */

const DEFAULT_LEAD = 5;
const MANUAL_ID = "__OTHER__";   // سنتينل المشروع اليدويّ في المنصّة (`doc-vault.js`) — لا مستندَ مستخدمين له

function _pad(n) { return (n < 10 ? "0" : "") + n; }
function _daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); } // m: 1..12
function _isoDay(d) { return d.toISOString().slice(0, 10); }
function _parse(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return isNaN(d.getTime()) ? null : d;
}

/** يومُ الشهر المضبوط: ١..٣١، وغيرُ الصالح ⇒ ٠ (لا موعد). */
function dueDayOf(s) {
  const d = Math.floor(Number(s && s.dueDay));
  return (isFinite(d) && d >= 1 && d <= 31) ? d : 0;
}
/** مهلةُ التذكير بالأيام: ٠..٦٠، والافتراضُ ٥. */
function leadDaysOf(s) {
  const v = s && s.leadDays;
  if (v === "" || v === null || v === undefined) return DEFAULT_LEAD;
  const n = Math.floor(Number(v));
  return (isFinite(n) && n >= 0 && n <= 60) ? n : DEFAULT_LEAD;
}

/** موعدُ الاستحقاق في شهرٍ بعينه (m: 1..12) — اليومُ يُقصّ إلى آخر يوم في الشهر. */
function dueInMonth(day, y, m) {
  const d = Math.floor(Number(day));
  if (!isFinite(d) || d < 1) return "";
  return y + "-" + _pad(m) + "-" + _pad(Math.min(d, _daysInMonth(y, m)));
}

/** أوّلُ موعدٍ لا يسبق اليومَ (اليومُ نفسُه يُحسَب). `""` لجدولٍ بلا يومٍ صالح. */
function nextDue(s, today) {
  const day = dueDayOf(s);
  const t = _parse(today);
  if (!day || !t) return "";
  const td = _isoDay(t);
  let y = t.getUTCFullYear(), m = t.getUTCMonth() + 1;
  for (let i = 0; i < 3; i++) {
    const due = dueInMonth(day, y, m);
    if (due >= td) return due;
    m++; if (m > 12) { m = 1; y++; }
  }
  return "";
}

/** أيامٌ من `today` إلى `due` (سالبةٌ لما مضى)، و`null` لتاريخٍ فاسد. */
function daysBetween(today, due) {
  const a = _parse(today), b = _parse(due);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * الموعدُ الذي **تذكيرُه مستحقٌّ اليوم**: `due` حيث `due − lead ≤ today ≤ due`،
 * وإلّا `""`. الموعدُ التالي وحدَه يُفحَص — نافذةُ موعدٍ لا تتداخل مع الذي يليه
 * لأنّ المهلةَ محدودةٌ بستّين يوماً والموعدان يفصلهما شهر… إلا حين تفوق المهلةُ
 * طولَ الشهر، وعندها يفوز الأقربُ وهو المقصود.
 */
function reminderDue(s, today) {
  if (!s || s.active === false) return "";
  const due = nextDue(s, today);
  if (!due) return "";
  const d = daysBetween(today, due);
  if (d === null) return "";
  return (d >= 0 && d <= leadDaysOf(s)) ? due : "";
}

/** قائمةُ المسؤولين مضبوطةً: `{ user, name }` بلا فارغٍ ولا مكرَّر (بالمعرّف). */
function usersOf(s) {
  const arr = Array.isArray(s && s.users) ? s.users : [];
  const seen = new Set(), out = [];
  for (const u of arr) {
    const user = String((u && (u.user || (typeof u === "string" ? u : ""))) || "").trim();
    const name = String((u && u.name) || "").trim();
    const key = user || name;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ user, name });
  }
  return out;
}

/** سياقُ {{2}} — المشروعُ والجهة، بلا مبالغ ولا أسماء أشخاص. */
function contextOf(s) {
  const proj = String((s && s.projectName) || "").trim();
  const party = String((s && s.party) || "").trim();
  const parts = [];
  if (proj) parts.push(proj);
  if (party) parts.push(party);
  return parts.length ? parts.join(" — ") : "خزانة الوثائق";
}

/**
 * متغيّراتُ القالب. المستعارُ (`po_status_update`): {{1}}الرقم {{2}}المشروع {{3}}الحالة —
 * فنكتب في الحالة نصَّ التذكير كاملاً. والمخصّصُ (`WA_EXS_TEMPLATE`): {{1}}العنوان
 * {{2}}السياق {{3}}الموعد {{4}}الأيام المتبقية.
 */
function usingPoStatusTemplate() { return cfg.EXS.template === cfg.PO.statusTemplate; }
function params(s, due, days) {
  const title = String((s && s.title) || "مستخلص دوريّ").trim();
  const id = String((s && s.id) || "");
  const left = days === 0 ? "اليوم" : ("بعد " + days + (days === 1 ? " يوم" : days === 2 ? " يومين" : days <= 10 ? " أيام" : " يوماً"));
  if (usingPoStatusTemplate()) {
    return [
      id + " — " + title,
      contextOf(s),
      "تذكير: موعد تقديم المستخلص " + due + " (" + left + ")",
    ];
  }
  return [title, contextOf(s), due, left];
}

/* ════════ التشغيل — يقرأ الجداولَ ويُدرج التذكيرات ════════ */

/**
 * @param {object} deps { db, logger, isEnabled, today?, coll? }
 * @returns {Promise<{checked:number, due:number, queued:number, missing:number}>}
 */
async function runExtractReminders(deps) {
  const { db, logger } = deps;
  const today = deps.today || _isoDay(new Date());
  const coll = deps.coll || cfg.EXS.collection;
  const out = { today, checked: 0, due: 0, queued: 0, missing: 0 };
  if (deps.isEnabled && !(await deps.isEnabled())) {
    logger.info("wa(exs): مفتاح القتل مُفعّل — تخطّي");
    return out;
  }
  const snap = await db.collection(coll).where("active", "==", true).get();
  for (const docSnap of snap.docs) {
    const s = docSnap.data() || {};
    s.id = docSnap.id;
    out.checked++;
    const due = reminderDue(s, today);
    if (!due) continue;
    out.due++;
    const days = daysBetween(today, due);
    const projectId = (s.projectId && s.projectId !== MANUAL_ID) ? String(s.projectId) : "";
    const sent = [], missing = [];
    for (const u of usersOf(s)) {
      const rs = await findNamedRecipientAnywhere(db, u, projectId);
      if (!rs.length) { missing.push(u.name || u.user); continue; }
      const r = rs[0];
      const { queued } = await enqueue(db, {
        to: r.phone,
        recipientRef: `meta/users:${u.user || u.name}`,
        template: cfg.EXS.template,
        lang: cfg.EXS.lang,
        params: params(s, due, days),
        buttonParam: s.id,   // زرُّ «فتح» → `?po=EXS-…` والعميلُ يوجّهه إلى الخزانة
        event: { type: "extract_due_reminder", entityId: s.id, transition: due },
      });
      sent.push(r.name || u.name || u.user);
      if (queued) out.queued++;
      logger.info(`wa(exs): ${queued ? "أُضيف" : "تكرار"} — ${s.id} (${due}) → ${r.name} (${r.phone})`);
    }
    out.missing += missing.length;
    if (missing.length) logger.warn(`wa(exs): ${s.id} — بلا رقم واتساب مفعَّل: ${missing.join("، ")}`);
    /* أثرٌ على الجدول تقرؤه الشاشة: «ذُكِّر فلانٌ وفلان في …» — وبلا رقمٍ يُقال باسمه. */
    try {
      /* `set` بدمجٍ لا `update` بمسارٍ منقوط: الشرطاتُ في المفتاح (`2026-09-25`)
         تحتاج اقتباساً في مسار الحقل، والدمجُ يُبقي بقيّةَ المواعيد كما هي. */
      const mark = { reminded: {} };
      mark.reminded[due] = { at: new Date().toISOString(), sent, missing };
      await docSnap.ref.set(mark, { merge: true });
    } catch (e) {
      logger.warn(`wa(exs): تعذّر تسجيل الأثر على ${s.id}: ${e.message}`);
    }
  }
  logger.info(`wa(exs): ${today} — فُحص ${out.checked} · مستحقّ ${out.due} · أُدرج ${out.queued} · بلا رقم ${out.missing}`);
  return out;
}

module.exports = {
  DEFAULT_LEAD, MANUAL_ID,
  dueDayOf, leadDaysOf, dueInMonth, nextDue, daysBetween, reminderDue, usersOf, contextOf, params,
  runExtractReminders,
};
