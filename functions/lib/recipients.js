"use strict";
/**
 * إيجاد مستلمي إشعارات الشراء حسب الدور.
 * المستخدمون مخزّنون في مستند مصفوفة: meta/{projectId}_users و/أو meta/users (مركزي)،
 * كل عنصر: { user, name, role, phone?, waOptIn? }. نُضيف phone/waOptIn عبر شاشة إدارة
 * المستخدمين. نقرأ مستند مشروع الطلب + المستند المركزي، ندمج، ونُرشّح حسب الدور.
 */

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
async function findByRole(db, role, projectId) {
  const docs = ["meta/users"]; // المركزي (الأدوار العامة: مشتريات/مستودع/مالية/تنفيذي)
  if (projectId) docs.unshift(`meta/${projectId}_users`); // مستخدمو المشروع (مدير المشروع)

  const seen = new Set();
  const out = [];
  for (const path of docs) {
    const users = await _readUsersDoc(db, path);
    for (const u of users) {
      if (!u || u.role !== role) continue;
      if (!u.phone || u.waOptIn !== true) continue;
      const key = String(u.phone).replace(/[^\d]/g, "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ name: u.name || u.user || role, phone: u.phone });
    }
  }
  return out;
}

/** يجد صاحب الطلب (createdBy) إن كان له phone/waOptIn — للإشعار عند الرفض/الإغلاق. */
async function findRequester(db, po, projectId) {
  const createdBy = po.createdBy || null;
  if (!createdBy) return null;
  const docs = projectId ? [`meta/${projectId}_users`, "meta/users"] : ["meta/users"];
  for (const path of docs) {
    const users = await _readUsersDoc(db, path);
    const u = users.find((x) => x && (x.user === createdBy || x.name === createdBy));
    if (u && u.phone && u.waOptIn === true) {
      return { name: u.name || u.user, phone: u.phone };
    }
  }
  return null;
}

module.exports = { findByRole, findRequester };
