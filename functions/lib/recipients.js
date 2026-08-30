"use strict";
/**
 * إيجاد مستلمي إشعارات الشراء حسب الدور.
 * المستخدمون مخزّنون في مستند مصفوفة: meta/{projectId}_users و/أو meta/users (مركزي)،
 * كل عنصر: { user, name, role, phone?, waOptIn? }. نُضيف phone/waOptIn عبر شاشة إدارة
 * المستخدمين. نقرأ مستند مشروع الطلب + المستند المركزي، ندمج، ونُرشّح حسب الدور.
 */

const { ROLE_FALLBACK } = require("./config");

/* دورُ المشرف يُسجَّل بصيغتين في meta/users («مشرف» العربية وsupervisor اللاتينية —
   الجذرُ موثَّق في v18.9wj)، والمطابقةُ الحرفية كانت ستُسقط نصفَ المشرفين بصمت.
   المكافئاتُ هنا وحدَها — بقيةُ الأدوار مطابقةٌ حرفية كما كانت. */
const ROLE_EQUIV = { "مشرف": ["مشرف", "supervisor"], supervisor: ["مشرف", "supervisor"] };
function roleMatches(userRole, role) {
  const set = ROLE_EQUIV[role];
  return set ? set.includes(userRole) : userRole === role;
}

/** يقرأ مصفوفة users من مستند meta واحد بأمان. */
async function _readUsersDoc(db, path) {
  try {
    const snap = await db.doc(path).get();
    if (snap.exists) {
      const d = snap.data();
      if (Array.isArray(d.users)) return d.users;
    }
  } catch (_) {
    /* غياب المستند = لا مستخدمين منه */
  }
  return [];
}

/**
 * يُرجع قائمة مستلمين { name, phone } لدورٍ معيّن، ممن لهم phone و waOptIn===true.
 * @param {string} role     الدور المطلوب (مثل "procurement_officer").
 * @param {string} projectId  معرّف مشروع الطلب (قد يكون فارغاً).
 */
async function findByRole(db, role, projectId, _noFallback) {
  const docs = ["meta/users"]; // المركزي (الأدوار العامة: مشتريات/مستودع/مالية/تنفيذي)
  if (projectId) docs.unshift(`meta/${projectId}_users`); // مستخدمو المشروع (مدير المشروع)

  const seen = new Set();
  const out = [];
  for (const path of docs) {
    const users = await _readUsersDoc(db, path);
    for (const u of users) {
      if (!u || !roleMatches(u.role, role)) continue;
      if (!u.phone || u.waOptIn !== true) continue;
      const key = String(u.phone).replace(/[^\d]/g, "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ name: u.name || u.user || role, phone: u.phone });
    }
  }
  // لا مستلمَ لهذا الدور ⇒ الدورُ الاحتياطيّ. **عند الفراغ فقط** — لا نسخةً إضافية.
  if (!out.length && !_noFallback && ROLE_FALLBACK && ROLE_FALLBACK !== role) {
    return findByRole(db, ROLE_FALLBACK, projectId, true);
  }
  return out;
}

/**
 * يُرجع مستلمي دورٍ معيّن **أينما سُجّل رقمُهم** — للأحداث التي لا مشروعَ لها
 * (سداد الموارد البشرية: مجموعةٌ عامّة بلا `projectId`).
 *
 * لماذا لا يكفي `meta/users` وحده: الرقمُ يُخزَّن في موضعين حسب الشاشة التي أُدخل منها —
 * «إدارة مستخدمي المشتريات» تُزامنه مع المركزي `meta/users`، بينما لوحةُ الأدمن **داخل
 * المشروع** تكتبه في `meta/{projectId}_users` فقط. وتوجيهُ الشراء لا يتأثّر (يقرأ مستندَ
 * مشروعِ الطلب ثم المركزي)، أمّا حدثٌ بلا مشروعٍ فكان يقرأ المركزيَّ وحده — فمستخدمٌ
 * تصله رسائلُ الشراء ولا تصله رسائلُ السداد، وهو فرقٌ لا يفسّره شيءٌ للمستخدم.
 *
 * الترتيب: المركزيُّ أوّلاً (الحالة السويّة، قراءةٌ واحدة)، ولا نمسح مستندات المشاريع
 * إلا إن **لم يوجد** مستلمٌ للدور — فلا كلفةَ إضافية في الحالة الغالبة. والمسحُ محدودٌ
 * بسقفٍ صريح (`MAX_PROJECT_DOCS`) فلا يتحوّل إلى قراءةٍ مفتوحة مع نموّ المشاريع.
 */
const MAX_PROJECT_DOCS = 25;

async function findByRoleAnywhere(db, role, _noFallback) {
  // `true` هنا مقصود: نستنفد الدورَ الحقيقيَّ في **كلّ** المواضع قبل الارتداد —
  // وإلّا ارتدّ إلى الأدمن بينما رقمُ صاحب الدور مسجَّلٌ في مستند مشروع.
  const central = await findByRole(db, role, "", true);
  if (central.length) return central;

  let projects = [];
  try {
    const snap = await db.doc("meta/projects").get();
    if (snap.exists && Array.isArray(snap.data().projects)) projects = snap.data().projects;
  } catch (_) {
    return central; // تعذّرت قراءة المشاريع ⇒ المركزيُّ هو كلُّ ما لدينا
  }

  const seen = new Set();
  const out = [];
  for (const p of projects.slice(0, MAX_PROJECT_DOCS)) {
    const pid = p && (p.id || p.projectId);
    if (!pid) continue;
    const users = await _readUsersDoc(db, `meta/${pid}_users`);
    for (const u of users) {
      if (!u || !roleMatches(u.role, role)) continue;
      if (!u.phone || u.waOptIn !== true) continue;
      const key = String(u.phone).replace(/[^\d]/g, "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ name: u.name || u.user || role, phone: u.phone });
    }
  }
  if (!out.length && !_noFallback && ROLE_FALLBACK && ROLE_FALLBACK !== role) {
    return findByRoleAnywhere(db, ROLE_FALLBACK, true);
  }
  return out;
}

/**
 * يجد صاحب الطلب إن كان له phone/waOptIn — للإشعار عند الرفض/الإغلاق.
 *
 * الهوية تُقرأ من `createdByUser` (اسم الدخول) و`createdBy` معاً: طلبات الشراء تخزّن
 * اسمَ الدخول في `createdBy`، ووحدةُ سداد الموارد البشرية تخزّن الاسمَ المعروض في
 * `createdBy` واسمَ الدخول في `createdByUser`. مطابقةُ الاثنين معاً تخدم الشكلين بلا
 * فرعٍ خاصّ — ولو حمل أحدُهما قيمةً فارغة أُسقِط من المطابقة.
 */
async function findRequester(db, po, projectId) {
  const ids = [po.createdByUser, po.createdBy].filter(Boolean).map(String);
  if (!ids.length) return null;
  const docs = projectId ? [`meta/${projectId}_users`, "meta/users"] : ["meta/users"];
  for (const path of docs) {
    const users = await _readUsersDoc(db, path);
    const u = users.find(
      (x) => x && (ids.includes(String(x.user)) || ids.includes(String(x.name)))
    );
    if (u && u.phone && u.waOptIn === true) {
      return { name: u.name || u.user, phone: u.phone };
    }
  }
  return null;
}

/** نظير `findByRoleAnywhere` لصاحب الطلب — لحدثٍ بلا مشروع. نفس المنطق ونفس السقف. */
async function findRequesterAnywhere(db, po) {
  const central = await findRequester(db, po, "");
  if (central) return central;

  let projects = [];
  try {
    const snap = await db.doc("meta/projects").get();
    if (snap.exists && Array.isArray(snap.data().projects)) projects = snap.data().projects;
  } catch (_) {
    return null;
  }
  const ids = [po.createdByUser, po.createdBy].filter(Boolean).map(String);
  if (!ids.length) return null;
  // نقرأ مستندَ كل مشروعٍ مباشرةً — لا عبر findRequester، فهي تُعيد قراءة المركزيِّ
  // الذي فُحص للتوّ مع كل دورة.
  for (const p of projects.slice(0, MAX_PROJECT_DOCS)) {
    const pid = p && (p.id || p.projectId);
    if (!pid) continue;
    const users = await _readUsersDoc(db, `meta/${pid}_users`);
    const u = users.find(
      (x) => x && (ids.includes(String(x.user)) || ids.includes(String(x.name)))
    );
    if (u && u.phone && u.waOptIn === true) return { name: u.name || u.user, phone: u.phone };
  }
  return null;
}

module.exports = { findByRole, findRequester, findByRoleAnywhere, findRequesterAnywhere };
