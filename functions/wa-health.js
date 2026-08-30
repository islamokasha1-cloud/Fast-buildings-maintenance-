"use strict";
/**
 * فحصُ صحّة منظومة إشعارات واتساب — تشغيلٌ يدويٌّ من Cloud Shell.
 *
 *   cd ~/Fast-buildings-maintenance-/functions && node wa-health.js
 *
 * يراجع الحلقةَ كاملةً من الإعداد إلى المستلِم، ويطبع تقريراً واحداً:
 *   ١) `.env` — المفاتيحُ التي لا افتراضَ لها في الكود.
 *   ٢) Meta   — القوالبُ المضبوطة موجودةٌ ومعتمَدةٌ في WABA الذي يملك الرقمَ المُرسِل.
 *   ٣) الخادم — المشغّلاتُ منشورةٌ وحيّة، وبيئةُ `waSender` تطابق `.env`.
 *   ٤) التشغيل — مفتاحُ القتل، وإخفاقاتُ الطابور الأخيرة.
 *   ٥) المستلِمون — من يصله فعلاً؟ دورٌ بلا رقمٍ مُفعَّلٍ = إشعارٌ يضيع بصمت.
 *
 * **لا يكتب شيئاً** — قراءةٌ محضة، فتشغيلُه آمنٌ في أي وقت.
 */
const fs = require("fs");
const { execSync } = require("child_process");
const admin = require("firebase-admin");

const PROJECT = "fast-buildings";
const WABA = "2149904325585354";
const REGION = "us-central1";

let pass = 0, warn = 0, fail = 0;
const ok = (m, d) => { pass++; console.log("  ✅ " + m + (d ? "  — " + d : "")); };
const wr = (m, d) => { warn++; console.log("  ⚠️  " + m + (d ? "  — " + d : "")); };
const no = (m, d) => { fail++; console.log("  ❌ " + m + (d ? "  — " + d : "")); };
const H = (t) => console.log("\n" + "═".repeat(58) + "\n  " + t + "\n" + "═".repeat(58));

const sh = (cmd) => {
  try { return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch (_) { return null; }
};

/* ── ١) الإعدادات المحلّية ─────────────────────────────────── */
function readEnv() {
  H("١) functions/.env");
  let raw;
  try { raw = fs.readFileSync(".env", "utf8"); }
  catch (_) { no("الملفُّ غير موجود", "شغّل الفحصَ من داخل مجلد functions"); return {}; }

  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  // المفتاحُ الوحيدُ بلا افتراضٍ في config.js — غيابُه يوقف كلَّ إرسال.
  if (env.WHATSAPP_PHONE_NUMBER_ID) ok("WHATSAPP_PHONE_NUMBER_ID", env.WHATSAPP_PHONE_NUMBER_ID);
  else no("WHATSAPP_PHONE_NUMBER_ID مفقود", "النشرُ سيمسحه من waSender ويتوقّف الإرسال");

  for (const k of ["WA_HRP_APPROVAL_TEMPLATE", "WA_HRP_STATUS_TEMPLATE",
                   "WA_CTR_APPROVAL_TEMPLATE", "WA_CTR_STATUS_TEMPLATE"]) {
    if (env[k]) ok(k, env[k]);
    else wr(k + " غير مضبوط", "يعمل على قالب الشراء المستعار (صياغةٌ ناقصة لا تعطُّل)");
  }
  return env;
}

/* ── ٢) قوالب Meta ────────────────────────────────────────── */
async function checkTemplates(env) {
  H("٢) قوالب Meta في WABA " + WABA);
  const token = sh(`gcloud secrets versions access latest --secret=WHATSAPP_TOKEN --project=${PROJECT}`);
  if (!token) { no("تعذّر قراءة WHATSAPP_TOKEN", "صلاحيةُ Secret Manager؟"); return; }

  let data;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${WABA}/message_templates` +
      `?fields=name,language,status&limit=100`,
      { headers: { Authorization: "Bearer " + token } }
    );
    data = await res.json();
    if (data.error) { no("Meta ردّت بخطأ", data.error.message); return; }
  } catch (e) { no("تعذّر الاتصال بـMeta", e.message); return; }

  const rows = data.data || [];
  const byName = new Map(rows.map((t) => [t.name, t]));
  console.log("  (" + rows.length + " قالباً في هذا الحساب)");

  // كلُّ قالبٍ يستعمله النظام فعلاً — المضبوطُ في .env أو الافتراضيُّ في الكود.
  const used = [
    ["إسناد فني", "ticket_assigned"],
    ["اعتماد شراء", "po_approval_needed"],
    ["حالة شراء", "po_status_update"],
    ["اعتماد سداد", env.WA_HRP_APPROVAL_TEMPLATE || "po_approval_needed"],
    ["حالة سداد", env.WA_HRP_STATUS_TEMPLATE || "po_status_update"],
    ["اعتماد تعاقدات", env.WA_CTR_APPROVAL_TEMPLATE || "po_approval_needed"],
    ["حالة تعاقدات", env.WA_CTR_STATUS_TEMPLATE || "po_status_update"],
  ];
  const seen = new Set();
  for (const [label, name] of used) {
    if (seen.has(name)) { ok(label, name + " (مُستعار)"); continue; }
    seen.add(name);
    const t = byName.get(name);
    if (!t) no(label + ": «" + name + "» غير موجودٍ في هذا الحساب",
               "أُنشئ تحت WABA آخر؟ القوالبُ لا تُنقَل — أعِد إنشاءه هنا");
    else if (t.status !== "APPROVED") wr(label + ": " + name, "الحالة " + t.status);
    else if (t.language !== "ar") wr(label + ": " + name, "اللغة " + t.language + " لا ar");
    else ok(label, name);
  }
}

/* ── ٣) الخادم ────────────────────────────────────────────── */
function checkFunctions(env) {
  H("٣) الدوالُّ المنشورة");
  const raw = sh(`gcloud functions list --project=${PROJECT} --regions=${REGION} --format="value(name,state)"`);
  if (!raw) { no("تعذّر سردُ الدوال", "صلاحيةٌ أو مشروعٌ خاطئ"); return; }

  const state = new Map(raw.split("\n").map((l) => {
    const [n, s] = l.split(/\s+/);
    return [String(n).split("/").pop(), s];
  }));

  const need = [
    ["المُرسِل", ["waSender", "waRetry"]],
    ["البلاغات", ["ticketAssignCreate_hail_tickets", "ticketAssignUpdate_hail_tickets"]],
    ["الشراء", ["poRouteCreate", "poRouteUpdate"]],
    ["سداد الموارد البشرية", ["hrpRouteCreate", "hrpRouteUpdate"]],
    ["التعاقدات", ["crqRouteCreate", "crqRouteUpdate", "extRouteCreate", "extRouteUpdate",
                   "chgRouteCreate", "chgRouteUpdate", "ctrRouteCreate", "ctrRouteUpdate"]],
  ];
  for (const [group, fns] of need) {
    const missing = fns.filter((f) => !state.has(f));
    const down = fns.filter((f) => state.has(f) && state.get(f) !== "ACTIVE");
    if (missing.length) no(group, "غير منشور: " + missing.join(" · "));
    else if (down.length) no(group, "غير نشط: " + down.join(" · "));
    else ok(group, fns.length + " دالّة نشطة");
  }

  // بيئةُ waSender هي ما يُرسَل به فعلاً — لا ما في الملفّ.
  const live = sh(`gcloud functions describe waSender --gen2 --region=${REGION} --project=${PROJECT} ` +
                  `--format="value(serviceConfig.environmentVariables.WHATSAPP_PHONE_NUMBER_ID)"`);
  if (!live) no("waSender بلا WHATSAPP_PHONE_NUMBER_ID", "الإرسالُ متوقّف — أعِد النشر بعد إصلاح .env");
  else if (env.WHATSAPP_PHONE_NUMBER_ID && live !== env.WHATSAPP_PHONE_NUMBER_ID)
    wr("waSender تحمل رقماً غير الذي في .env", "منشور=" + live + " · ملف=" + env.WHATSAPP_PHONE_NUMBER_ID);
  else ok("بيئةُ waSender تطابق .env", live);
}

/* ── ٤) التشغيل ───────────────────────────────────────────── */
async function checkRuntime(db) {
  H("٤) التشغيل");
  try {
    const s = await db.doc("meta/wa_settings").get();
    if (s.exists && s.data().enabled === false) no("مفتاحُ القتل مُفعّل", "meta/wa_settings.enabled=false");
    else ok("مفتاحُ القتل مُطفأ (الإرسالُ مسموح)");
  } catch (e) { wr("تعذّرت قراءة meta/wa_settings", e.message); }

  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const snap = await db.collection("wa_outbox").where("createdAt", ">=", since).get();
    const by = { sent: 0, queued: 0, failed: 0, other: 0 };
    const errs = new Map();
    snap.forEach((d) => {
      const x = d.data();
      by[x.status] !== undefined ? by[x.status]++ : by.other++;
      if (x.status === "failed" && x.lastError) errs.set(x.lastError, (errs.get(x.lastError) || 0) + 1);
    });
    const line = `آخر ٢٤س: ${by.sent} مُرسَلة · ${by.queued} منتظرة · ${by.failed} فاشلة`;
    if (by.failed) { no("إخفاقاتٌ في الطابور", line); errs.forEach((n, e) => console.log("      × " + n + " — " + e)); }
    else if (by.queued) wr("رسائلُ عالقةٌ في الطابور", line + " (waRetry يعيد المحاولة كلَّ دقيقتين)");
    else ok("الطابورُ نظيف", line);
  } catch (e) { wr("تعذّرت قراءة wa_outbox", e.message); }
}

/* ── ٥) المستلِمون ────────────────────────────────────────── */
async function checkRecipients(db) {
  H("٥) من تصله الرسائل فعلاً؟");
  // دورٌ بلا رقمٍ مُفعَّلٍ = الإشعارُ يُسقَط بسطرٍ في سجلٍّ لا يقرؤه أحد.
  const ROLES = {
    project_manager: "مدير المشاريع", ceo: "المدير التنفيذي", finance: "المالية",
    hr_officer: "مسؤول الموارد البشرية", hr_manager: "مدير الموارد البشرية",
    procurement_officer: "مسؤول المشتريات",
    warehouse_manager: "مسؤول المستودعات",
    "مشرف": "المشرف الميداني (استلام المواد)",
    admin: "الأدمن (الدورُ الاحتياطيّ)",
  };
  const found = {};
  const scan = (users, src) => (users || []).forEach((u) => {
    // دورُ المشرف يُسجَّل بصيغتين («مشرف»/supervisor — v18.9wj) كما في recipients.js
    const rk = u && u.role === "supervisor" ? "مشرف" : u && u.role;
    if (!u || !ROLES[rk]) return;
    if (!u.phone || u.waOptIn !== true) return;
    (found[rk] = found[rk] || []).push((u.name || u.user) + " (" + src + ")");
  });

  try {
    const c = await db.doc("meta/users").get();
    if (c.exists) scan(c.data().users, "مركزي");
    const p = await db.doc("meta/projects").get();
    const projects = p.exists && Array.isArray(p.data().projects) ? p.data().projects : [];
    for (const pr of projects.slice(0, 25)) {
      const id = pr && (pr.id || pr.projectId);
      if (!id) continue;
      const d = await db.doc("meta/" + id + "_users").get();
      if (d.exists) scan(d.data().users, id);
    }
  } catch (e) { wr("تعذّرت قراءة المستخدمين", e.message); return; }

  // الدورُ الاحتياطيّ (`ROLE_FALLBACK` في config.js) يلتقط ما لا مستلمَ له. فدورٌ بلا رقمٍ
  // **والاحتياطيُّ مغطّى** = الرسالةُ تصل فعلاً ⇒ تنبيهٌ لا خلل. أمّا أن يخلو الاثنان
  // فالإشعارُ يضيع بصمت — وذلك وحدَه خلل. فحصٌ يصرخ بلا سببٍ يُهمَل بعد أسبوع.
  let fb = "admin";
  try { fb = require("./lib/config").ROLE_FALLBACK ?? "admin"; } catch (_) { }
  const fbCovered = !!(fb && found[fb]);

  for (const [role, label] of Object.entries(ROLES)) {
    if (found[role]) { ok(label, found[role].join(" · ")); continue; }
    if (role === fb) { wr(label + ": لا رقمَ مُفعَّل", "لا شبكةَ أمانٍ لدورٍ بلا مستلم"); continue; }
    if (fbCovered) wr(label + ": لا رقمَ مُفعَّل",
                      "ترتدّ إلى «" + (ROLES[fb] || fb) + "» فتصل — اضبط رقماً له إن أردتها مباشرة");
    else no(label + ": لا رقمَ مُفعَّل", "ولا احتياطيَّ يغطّيه ⇒ الإشعارُ يضيع بصمت");
  }
}

/* ── التشغيل ──────────────────────────────────────────────── */
(async () => {
  console.log("\n🔍 فحصُ صحّة منظومة إشعارات واتساب — مشروع " + PROJECT);
  const env = readEnv();
  await checkTemplates(env);
  checkFunctions(env);

  admin.initializeApp({ projectId: PROJECT });
  const db = admin.firestore();
  await checkRuntime(db);
  await checkRecipients(db);

  console.log("\n" + "═".repeat(58));
  console.log(`  ✅ ${pass} سليم   ⚠️  ${warn} تنبيه   ❌ ${fail} خلل`);
  console.log("═".repeat(58) + "\n");
  process.exit(fail ? 1 : 0);
})();
