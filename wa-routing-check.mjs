/* ══════════════════════════════════════════════════════════════════════
   فحصُ طبقة التوجيه الخادمية — **تنفيذاً لا قراءةَ نصوص**.

   `hail-tests` يحرس هذه الطبقةَ بمطابقة تعابيرَ نمطية: تُثبت أنّ السطرَ مكتوبٌ ولا
   تُثبت أنّه يفعل ما يقول. وأخطاءُ التوجيه **صامتةٌ بطبعها**: مستلمٌ لا يُوجَد،
   خانةٌ زائدة، نصٌّ حرٌّ يتسرّب — لا شيءَ منها يظهر في النظام، والرسالةُ ببساطةٍ
   لا تصل أو ترفضها Meta.

   فهذا الملفُّ يستدعي الدوالَّ الحقيقيةَ على Firestore مُحاكاةً (كائنٌ بسيطٌ يردّ
   مستنداتٍ معدّة) ويتحقّق من **الناتج**: مَن المستلم، وكم خانةً، وما محتواها.
   لا شبكةَ ولا متصفّحَ ولا Java — نودٌ خالص، فيُشغَّل في CI مع بقية الفحوص.

   التشغيل:  node wa-routing-check.mjs
   ══════════════════════════════════════════════════════════════════════ */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const LIB = "./functions/lib";
let pass = 0, fail = 0;
const out = [];
function check(name, cond, detail) {
  if (cond) { pass++; out.push("  ✅ " + name + (detail ? " — " + detail : "")); }
  else { fail++; out.push("  ❌ " + name + (detail ? " — " + detail : "")); }
}
function head(t) { out.push("\n=== " + t + " ==="); }

/** يعيد تحميل الوحدات بعد تغيير البيئة — الإعدادُ يُقرأ عند التحميل لا عند الاستدعاء. */
function fresh() {
  for (const m of ["config.js", "recipients.js", "contracts.js", "purchases.js"]) {
    delete require.cache[require.resolve(`${LIB}/${m}`)];
  }
  return {
    cfg: require(`${LIB}/config.js`),
    rec: require(`${LIB}/recipients.js`),
    ctr: require(`${LIB}/contracts.js`),
    pur: require(`${LIB}/purchases.js`),
  };
}

/** Firestore مُحاكاة: مستنداتٌ معدّة + طابورُ صادرٍ يُجمَع في مصفوفة. */
function fakeDb(docs, sent) {
  return {
    doc: (p) => ({
      get: async () => ({ exists: Object.prototype.hasOwnProperty.call(docs, p), data: () => docs[p] }),
    }),
    collection: (c) => ({
      doc: (id) => ({
        create: async (d) => { sent.push({ coll: c, id, ...d }); },
      }),
    }),
  };
}

const USERS = {
  "meta/users": { users: [
    { user: "admin", name: "مدير النظام", role: "admin",               phone: "966500000001", waOptIn: true },
    { user: "fin",   name: "المالية",      role: "finance",             phone: "966500000002", waOptIn: true },
    { user: "proc",  name: "المشتريات",    role: "procurement_officer", phone: "966500000003", waOptIn: true },
    { user: "pm2",   name: "مديرٌ بلا رقم", role: "project_manager" },          // بلا هاتف
    { user: "ceo",   name: "التنفيذيّ",     role: "ceo",  phone: "966500000004", waOptIn: false } // بلا موافقة
  ] },
};
const logger = { info() {}, warn() {}, error() {} };
const deps = (db) => ({ db, logger, isEnabled: async () => true });

/* ═════════ ١) الدورُ الاحتياطيّ ═════════ */
head("١) الدورُ الاحتياطيّ — «مديرُ المشاريع هو نفسُه الأدمن»");
{
  const { rec } = fresh();
  const db = fakeDb(USERS, []);
  const real = await rec.findByRoleAnywhere(db, "finance");
  const empty = await rec.findByRoleAnywhere(db, "project_manager");
  const self = await rec.findByRoleAnywhere(db, "admin");
  const noOptIn = await rec.findByRoleAnywhere(db, "ceo");

  check("دورٌ له رقمٌ مفعَّلٌ يُوجَد كما هو",
    real.length === 1 && real[0].phone === "966500000002", real.map(r => r.phone).join(","));
  check("★★ ودورٌ بلا مستلمٍ يرتدّ إلى الأدمن (لا يضيع الإشعارُ بصمت)",
    empty.length === 1 && empty[0].phone === "966500000001", empty.map(r => r.name + "/" + r.phone).join(","));
  check("★★ ولا يُضاف الأدمن نسخةً إلى دورٍ له مستلم",
    real.every(r => r.phone !== "966500000001"));
  check("★ والأدمن نفسُه لا يرتدّ على نفسه (بلا حلقة)",
    self.length === 1 && self[0].phone === "966500000001");
  check("★ ورقمٌ بلا موافقةٍ صريحةٍ لا يُستعمَل — ويرتدّ للأدمن",
    noOptIn.length === 1 && noOptIn[0].phone === "966500000001", noOptIn.map(r => r.phone).join(","));

  process.env.WA_ROLE_FALLBACK = "";
  const off = await fresh().rec.findByRoleAnywhere(fakeDb(USERS, []), "project_manager");
  delete process.env.WA_ROLE_FALLBACK;
  check("★ ويُعطَّل الارتدادُ بقيمةٍ فارغة", off.length === 0, String(off.length));
}

/* ═════════ ٢) التوجيه — مَن يُنبَّه ومتى ═════════ */
head("٢) التوجيه — المستلمُ الصحيحُ لكلّ حالة");
{
  const { ctr } = fresh();
  const mk = (extra) => Object.assign({ id: "X-1", projectId: "hail", createdBy: "فلان" }, extra);

  let sent = [];
  await ctr.routeContractDoc("change", null, mk({ id: "CHG-1", status: "chg_pending_pm" }), deps(fakeDb(USERS, sent)));
  check("★★ أمرُ تغييرٍ عند مدير المشاريع ⇐ يصل الأدمن (الارتدادُ يعمل في المسار الحقيقيّ)",
    sent.length === 1 && sent[0].to === "966500000001", JSON.stringify(sent.map(s => s.to)));

  sent = [];
  await ctr.routeContractDoc("extract", null, mk({ id: "EXT-1", status: "ext_pending_finance" }), deps(fakeDb(USERS, sent)));
  check("★ ومستخلصٌ بانتظار السداد ⇐ المالية",
    sent.length === 1 && sent[0].to === "966500000002");

  sent = [];
  await ctr.routeContractDoc("contract", null, mk({ id: "CTR-1", status: "ctr_pending_signature" }), deps(fakeDb(USERS, sent)));
  check("★★ وعقدٌ بانتظار التوقيع ⇐ المشتريات",
    sent.length === 1 && sent[0].to === "966500000003", JSON.stringify(sent.map(s => s.to)));

  sent = [];
  await ctr.routeContractDoc("contract",
    { status: "ctr_active" }, mk({ id: "CTR-1", status: "ctr_closed" }), deps(fakeDb(USERS, sent)));
  check("★★ وإقفالُ العقد لا يُشعِر أحداً (لا منتظِرَ له)", sent.length === 0, String(sent.length));

  sent = [];
  await ctr.routeContractDoc("change",
    { status: "chg_pending_pm" }, mk({ id: "CHG-1", status: "chg_pending_pm" }), deps(fakeDb(USERS, sent)));
  check("★ وكتابةٌ بلا تغيّرِ حالةٍ لا تُرسل شيئاً", sent.length === 0);
}

/* ═════════ ٣) المحتوى — الخانات وما لا يخرج ═════════ */
head("٣) المحتوى — عددُ الخانات وما لا يخرج إلى الجوّال");
{
  let sent = [];
  await fresh().ctr.routeContractDoc("extract", null,
    { id: "EXT-9", status: "ext_pending_finance", projectId: "hail", createdBy: "فلان" },
    deps(fakeDb(USERS, sent)));
  check("★★ القالبُ المستعارُ يأخذ ٥ خانات", sent[0].params.length === 5, JSON.stringify(sent[0].params));
  check("★ والخانةُ الثانيةُ تقول «مستخلص عقد» لا «طلب شراء»",
    /مستخلص عقد/.test(sent[0].params[1]), sent[0].params[1]);
  check("★ ولا مبلغَ في أيّ خانة",
    sent[0].params.every(p => !/\d{3,}/.test(String(p))), JSON.stringify(sent[0].params));

  process.env.WA_CTR_APPROVAL_TEMPLATE = "ctr_approval_needed";
  sent = [];
  await fresh().ctr.routeContractDoc("extract", null,
    { id: "EXT-9", status: "ext_pending_finance", projectId: "hail", createdBy: "فلان" },
    deps(fakeDb(USERS, sent)));
  delete process.env.WA_CTR_APPROVAL_TEMPLATE;
  check("★★ والقالبُ المخصّصُ يأخذ ٤ (وإلّا رفضت Meta كلَّ الرسائل بلا أثرٍ ظاهر)",
    sent[0].params.length === 4 && sent[0].template === "ctr_approval_needed",
    JSON.stringify(sent[0].params));
  check("★ وسياقُه مختصرٌ بلا حشو «عقد»",
    sent[0].params[1].startsWith("مستخلص —"), sent[0].params[1]);

  sent = [];
  await fresh().ctr.routeContractDoc("change", null,
    { id: "CHG-9", status: "chg_pending_finance", isCustomProject: true, projectName: "استراحة فلان", createdBy: "فلان" },
    deps(fakeDb(USERS, sent)));
  check("★★ واسمُ المشروع اليدويِّ (نصٌّ حرٌّ قد يحمل اسمَ شخص) لا يخرج",
    !/استراحة فلان/.test(JSON.stringify(sent[0].params)) && /مشروع يدويّ/.test(sent[0].params[1]),
    sent[0].params[1]);

  sent = [];
  await fresh().ctr.routeContractDoc("request", null,
    { id: "CRQ-9", status: "crq_pending_finance", projectId: "hail", projectName: "هايل", createdBy: "فلان" },
    deps(fakeDb(USERS, sent)));
  check("★ واسمُ المشروع المسجَّل يمرّ (قائمةٌ مغلقةٌ لا نصٌّ حرّ)",
    /هايل/.test(sent[0].params[1]), sent[0].params[1]);
}

/* ═════════ ٤) مفتاحُ القتل ═════════ */
head("٤) مفتاحُ القتل العام");
{
  const sent = [];
  await fresh().ctr.routeContractDoc("extract", null,
    { id: "EXT-K", status: "ext_pending_finance", projectId: "hail" },
    { db: fakeDb(USERS, sent), logger, isEnabled: async () => false });
  check("★ يوقف رسائلَ التعاقدات أيضاً", sent.length === 0, String(sent.length));
}

/* ═════════ ٥) البتُّ في البند الإضافي — مرحلتان بحالةٍ واحدة (v18.9xb) ═════════
   حالةُ الطلب تبقى `pending_extra` من أول البتّ إلى آخره، والمشغّلُ لا يرسل إلا
   حين يتغيّر شيء. فكان مدير المشاريع — أولُ من يبتّ — لا يُنبَّه إطلاقاً، والتنفيذيُّ
   يُنبَّه في لحظةٍ لا يملك فيها البتّ، ثم يُترك بلا تنبيهٍ حين يصير الدورُ له.     */
head("٥) البتُّ في البند الإضافي — مرحلتان بحالةٍ واحدة");
{
  const { pur } = fresh();
  const po = (extra) => Object.assign(
    { id: "PO-202608-0160", projectId: "hail", projectName: "هايل", createdBy: "محمد", items: [{}] }, extra);

  // مفتاحُ التوجيه: الحالةُ وحدَها لبقية المسار، ومركَّبٌ لـ pending_extra
  check("★ المفتاحُ = الحالةُ في بقية المسار (لا تغيير في السلوك القائم)",
    pur.routingKey(po({ status: "pending_ceo" })) === "pending_ceo");
  check("★★ ومركَّبٌ عند البتّ في البند الإضافي — فتُميَّز المرحلتان رغم ثبات الحالة",
    pur.routingKey(po({ status: "pending_extra", extraStage: "pending_pm" })) === "pending_extra:pending_pm" &&
    pur.routingKey(po({ status: "pending_extra", extraStage: "pending_ceo" })) === "pending_extra:pending_ceo");
  check("★ وطلبٌ أقدمُ بلا extraStage يبقى على الحالة المجرّدة (توافقٌ رجعي)",
    pur.routingKey(po({ status: "pending_extra" })) === "pending_extra");

  // (أ) دخولُ الطلب مرحلةَ البتّ ⇒ مدير المشاريع لا التنفيذي
  let sent = [];
  await fresh().pur.routePurchase(
    po({ status: "wh_receiving" }),
    po({ status: "pending_extra", extraStage: "pending_pm" }),
    deps(fakeDb(USERS, sent)));
  check("★★ أولُ البتّ ⇒ مدير المشاريع (كان يذهب للتنفيذيّ وهو لا يملك البتّ)",
    sent.length === 1 && sent[0].recipientRef === "role:project_manager",
    JSON.stringify(sent.map((s) => s.recipientRef)));
  check("★ ولا نسخةَ للتنفيذيّ في هذه المرحلة",
    sent.every((s) => s.recipientRef !== "role:ceo"));

  // (ب) انتقالُ الدور للتنفيذي — الحالةُ لم تتغيّر، والرسالةُ يجب أن تُرسَل
  sent = [];
  await fresh().pur.routePurchase(
    po({ status: "pending_extra", extraStage: "pending_pm" }),
    po({ status: "pending_extra", extraStage: "pending_ceo" }),
    deps(fakeDb(USERS, sent)));
  check("★★ انتقالُ الدور للتنفيذيّ يُرسِل رغم ثبات الحالة (كان صمتاً تامّاً)",
    sent.length === 1 && sent[0].recipientRef === "role:ceo",
    JSON.stringify(sent.map((s) => s.recipientRef)));
  check("★ والانتقالُ يُسمّى بمفتاحيه في الحدث (منعُ التكرار يفرّق المرحلتين)",
    sent[0].event.transition === "pending_extra:pending_pm->pending_extra:pending_ceo",
    sent[0].event.transition);

  // (ج) كتابةٌ أخرى على الطلب بلا انتقالِ دور ⇒ لا رسالة (لا إزعاج)
  sent = [];
  await fresh().pur.routePurchase(
    po({ status: "pending_extra", extraStage: "pending_ceo" }),
    po({ status: "pending_extra", extraStage: "pending_ceo", updatedAt: "x" }),
    deps(fakeDb(USERS, sent)));
  check("★ كتابةٌ بلا انتقالِ دورٍ لا تُرسِل شيئاً", sent.length === 0, String(sent.length));

  // (د) المرحلةُ تُصفَّر بعد آخر بتّ ⇒ الإقفالُ يُنبِّه صاحبَ الطلب وحدَه.
  // صاحبُ الطلب هنا «المالية» — مستخدمٌ حقيقيٌّ في العيّنة له رقمٌ وموافقة، وإلّا
  // خرجت القائمةُ فارغةً ومرّ الفحصُ خواءً (every على فارغٍ صادقةٌ دائماً).
  sent = [];
  await fresh().pur.routePurchase(
    po({ status: "pending_extra", extraStage: "pending_ceo", createdBy: "fin" }),
    po({ status: "closed", extraStage: "", createdBy: "fin" }),
    deps(fakeDb(USERS, sent)));
  check("★ الإقفالُ بعد البتّ يُنبِّه صاحبَ الطلب — ولا يستدعي معتمِداً جديداً",
    sent.length === 1 && sent[0].event.type === "po_status_update",
    JSON.stringify(sent.map((s) => s.event.type)));
  check("★★ ولا رسالةَ اعتمادٍ على الإقفال (لا معتمِدَ بعد البتّ)",
    sent.every((s) => s.event.type !== "po_approval_needed"));
}

console.log(out.join("\n"));
console.log("\n" + "═".repeat(58));
console.log(fail ? `❌ ${fail} فشلت من ${pass + fail}` : `✅ ${pass}/${pass} — طبقةُ التوجيه الخادمية مفحوصةٌ تنفيذاً`);
console.log("═".repeat(58) + "\n");
process.exit(fail ? 1 : 0);
