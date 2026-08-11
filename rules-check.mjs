/* ══════════════════════════════════════════════════════════════════════
   فحصُ قواعد Firestore — على **محاكٍ حقيقيّ** لا بمطابقة نصوص.

   القاعدةُ الأمنيةُ لا تُختبَر بقراءة سطرها: تُقيَّم بـ«أو» عبر كلّ البلوكات
   المتطابقة، وقاعدةٌ عامةٌ واحدةٌ تُبطل عشر قواعدَ صارمةٍ بلا أن يظهر ذلك في
   أيّ سطر. فالفحصُ الوحيدُ المعتبَر هو: اكتب بدورٍ معيّن — أقُبِلت الكتابةُ أم رُدَّت؟

   التشغيل:  node rules-check.mjs        (يحتاج Java + firebase-tools)
   ويشغّله CI في وظيفةٍ مستقلّةٍ عند تغيّر firestore.rules.
   ══════════════════════════════════════════════════════════════════════ */
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from "@firebase/rules-unit-testing";
import fs from "node:fs";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc
} from "firebase/firestore";

const HOST = "127.0.0.1";
const PORT = Number(process.env.FIRESTORE_EMULATOR_PORT || 8080);

let pass = 0, fail = 0;
const results = [];
async function check(name, promise) {
  try { await promise; pass++; results.push("  ✅ " + name); }
  catch (e) { fail++; results.push("  ❌ " + name + " — " + (e && e.message ? e.message.split("\n")[0] : e)); }
}
function head(t) { results.push("\n=== " + t + " ==="); }

const env = await initializeTestEnvironment({
  projectId: "hail-rules-check",
  firestore: { host: HOST, port: PORT, rules: fs.readFileSync("firestore.rules", "utf8") }
});

/* كلُّ دورٍ سياقٌ مستقلٌّ بادّعاءِ `role` — نفسُ ما يحمله Custom Token في الإنتاج */
const as = (r) => env.authenticatedContext("u_" + r, { role: r }).firestore();
const PM = as("project_manager"), PROC = as("procurement_officer");
const FIN = as("finance"), CEO = as("ceo"), ADMIN = as("admin");
const WH = as("warehouse_manager"), VIEWER = as("viewer");
const ANON = env.unauthenticatedContext().firestore();

/** يزرع وثيقةً متجاوزاً القواعد — تهيئةُ الحالة ليست جزءاً مما نختبره */
async function seed(path, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}
const V = "global_vendors", R = "global_contract_requests";
const C = "global_contracts", E = "global_contract_extracts";

/* ═════════ ٠) الفرضيةُ الأمّ: الاستثناءُ من القاعدة العامة يعمل ═════════ */
head("٠) الاستثناءُ من القاعدة العامة");
await seed(`${C}/CTR-0`, { status: "ctr_active", value: 1000, vendorId: "V1" });
await check("★ دورٌ لا يملك العقود لا يكتب فيها (القاعدةُ العامة لم تعد تغطّيها)",
  assertFails(setDoc(doc(WH, `${C}/CTR-9`), { status: "ctr_active" })));
await check("★ والقاعدةُ العامة ما زالت تعمل خارج التعاقدات (لم نكسر بقيةَ النظام)",
  assertSucceeds(setDoc(doc(WH, "global_purchases/PO-1"), { status: "pending_pm" })));
await check("والزائرُ لا يكتب في أيّ مكان", assertFails(setDoc(doc(VIEWER, "global_purchases/PO-2"), { x: 1 })));
await check("والمجهولُ بلا دورٍ لا يقرأ التعاقدات", assertFails(getDoc(doc(ANON, `${C}/CTR-0`))));
await check("وكلُّ ذي دورٍ يقرأ التعاقدات (القراءةُ لم تتغيّر عمداً)",
  assertSucceeds(getDoc(doc(WH, `${C}/CTR-0`))));

/* ═════════ ١) سجلُّ الأطراف — الآيبان ═════════ */
head("١) سجلُّ الأطراف — الآيبانُ ناقلُ الاحتيال الأوّل");
await seed(`${V}/V1`, { name: "مؤسسة", bank: { iban: "SA1111", name: "أ" } });
await check("المشترياتُ تُنشئ طرفاً بلا آيبان",
  assertSucceeds(setDoc(doc(PROC, `${V}/V2`), { name: "جديد", bank: {} })));
await check("★ ولا تُنشئه بآيبانٍ مكتوب",
  assertFails(setDoc(doc(PROC, `${V}/V3`), { name: "جديد", bank: { iban: "SA999" } })));
await check("★ ولا تُبدّل آيبانَ طرفٍ قائم (تحويلُ المستحقّ لحسابٍ آخر)",
  assertFails(updateDoc(doc(PROC, `${V}/V1`), { bank: { iban: "SA2222", name: "أ" } })));
await check("وتعدّل بياناتِه الأخرى بلا مساسٍ بالآيبان",
  assertSucceeds(updateDoc(doc(PROC, `${V}/V1`), { name: "مؤسسة معدَّلة" })));
await check("★ والماليةُ وحدَها (والأدمن) تُبدّل الآيبان",
  assertSucceeds(updateDoc(doc(FIN, `${V}/V1`), { bank: { iban: "SA3333", name: "أ" } })));
await check("ودورٌ أجنبيٌّ لا يمسّ سجلَّ الأطراف أصلاً",
  assertFails(updateDoc(doc(WH, `${V}/V1`), { name: "x" })));
await check("والحذفُ للأدمن وحدَه", assertFails(deleteDoc(doc(PROC, `${V}/V1`))));

/* ═════════ ٢) طلبُ التعاقد — البوّابات ═════════ */
head("٢) طلبُ التعاقد — لا اعتمادَ بغير صاحب البوّابة");
const REQ = { status: "crq_pending_proc", value: 50000, vendorId: "V1", engagement: "contract",
              projectId: "hail", lines: [{ q: 1 }], createdAt: "2026-01-01", createdByUser: "pm" };
await seed(`${R}/R1`, REQ);
await check("مديرُ المشاريع يُنشئ طلباً بحالةِ انتظار",
  assertSucceeds(setDoc(doc(PM, `${R}/RN`), Object.assign({}, REQ, { status: "crq_pending_pm" }))));
await check("★ ولا يُنشئه معتمَداً سلفاً (قفزُ الدورة كلِّها)",
  assertFails(setDoc(doc(PM, `${R}/RX`), Object.assign({}, REQ, { status: "crq_approved" }))));
await check("★ ودورٌ غيرُ مدير المشاريع لا يُنشئ طلبَ تعاقد",
  assertFails(setDoc(doc(FIN, `${R}/RY`), Object.assign({}, REQ, { status: "crq_pending_pm" }))));
await check("★ والمالية لا تعتمد ما هو على بوّابة المشتريات",
  assertFails(updateDoc(doc(FIN, `${R}/R1`), { status: "crq_pending_finance" })));
await check("★ ومديرُ المشاريع لا يقفز بطلبه إلى «معتمَد»",
  assertFails(updateDoc(doc(PM, `${R}/R1`), { status: "crq_approved" })));
await check("والمشترياتُ — صاحبةُ البوّابة — تعتمد",
  assertSucceeds(updateDoc(doc(PROC, `${R}/R1`), { status: "crq_pending_finance" })));
await check("★ والقيمةُ لا تتغيّر بعد الإرسال (وقّع المعتمِدُ على رقمٍ فسُدِّد غيرُه)",
  assertFails(updateDoc(doc(PROC, `${R}/R1`), { value: 999999 })));
await check("★ ولا يتبدّل الطرفُ المتعاقَد معه بعد الاعتماد",
  assertFails(updateDoc(doc(PROC, `${R}/R1`), { vendorId: "V-OTHER" })));
/* ★★ بابٌ ضيّقٌ للأدمن (طلبُ المالك): البنودُ والقيمةُ وحدَهما — والطرفُ والشكلُ
   يبقيان مجمَّدين له كما لغيره. والوحدةُ تُسقط بصمةَ المالية عند تغيّر القيمة
   فيعود الطلبُ إلى بوّابتها، فلا يمرّ رقمٌ جديدٌ على توقيعٍ قديم. */
await check("★★ والأدمن يعدّل البنودَ والقيمةَ (البابُ المطلوب)",
  assertSucceeds(updateDoc(doc(ADMIN, `${R}/R1`), { value: 60000, lines: [{ q: 2 }] })));
await check("★★ ولا يعدّلهما غيرُ الأدمن ولو كان صاحبَ البوّابة",
  assertFails(updateDoc(doc(PROC, `${R}/R1`), { value: 70000, lines: [{ q: 3 }] })));
await check("★★ والأدمن نفسُه لا يبدّل الطرفَ ولا شكلَ الارتباط (البابُ لم يتّسع)",
  assertFails(updateDoc(doc(ADMIN, `${R}/R1`), { vendorId: "V-OTHER" })));
await check("★ ولا مشروعَ الطلب", assertFails(updateDoc(doc(ADMIN, `${R}/R1`), { projectId: "other" })));
await seed(`${R}/R2`, Object.assign({}, REQ, { status: "crq_pending_pay" }));
await check("★ والسدادُ للمالية وحدَها", assertFails(updateDoc(doc(PROC, `${R}/R2`), { status: "crq_paid" })));
await check("والماليةُ تُسدّد", assertSucceeds(updateDoc(doc(FIN, `${R}/R2`), { status: "crq_paid" })));
await check("★ والمسدَّدُ لا يُفتح ثانيةً", assertFails(updateDoc(doc(ADMIN, `${R}/R2`), { status: "crq_pending_pay" })));
/* ★★ الحذفُ: بابٌ ضيّقٌ فُتح للأدمن على **الملغى وحدَه** (طلبُ المالك).
   الملغى ورقةٌ ماتت قبل أن تُنتج أثراً — لا عقدَ ولا سداد. وما عداه أثرٌ ماليٌّ
   يُقرأ ولا يُمحى، ولو كان الطالبُ أدمن. والفحصُ يكتب فعلاً ويقرأ الرفض. */
await check("★★ ولا يُحذف طلبٌ حيٌّ ولو من الأدمن (بوّابةٌ مفتوحة)",
  assertFails(deleteDoc(doc(ADMIN, `${R}/R1`))));
await seed(`${R}/RDEL`, Object.assign({}, REQ, { status: "crq_cancelled" }));
await check("★★ والأدمن يحذف الملغى (البابُ المطلوب)",
  assertSucceeds(deleteDoc(doc(ADMIN, `${R}/RDEL`))));
await seed(`${R}/RDEL2`, Object.assign({}, REQ, { status: "crq_cancelled" }));
await check("★★ ولا يحذفه غيرُ الأدمن ولو كان صاحبَ بوّابةٍ",
  assertFails(deleteDoc(doc(PROC, `${R}/RDEL2`))));
await check("★ ولا مديرُ المشاريع مُنشئُ الطلب",
  assertFails(deleteDoc(doc(PM, `${R}/RDEL2`))));
await seed(`${R}/RPAID`, Object.assign({}, REQ, { status: "crq_paid" }));
await check("★★ ولا يُحذف المسدَّدُ ولو من الأدمن (أثرٌ ماليٌّ لا يُمحى)",
  assertFails(deleteDoc(doc(ADMIN, `${R}/RPAID`))));
await seed(`${R}/RCONV`, Object.assign({}, REQ, { status: "crq_converted", contractId: "CT-1" }));
await check("★ ولا المحوَّلُ إلى عقد (وإلا صار عقدٌ بلا طلبٍ يفسّره)",
  assertFails(deleteDoc(doc(ADMIN, `${R}/RCONV`))));

/* ═════════ ٣) العقد — الانتقالات ═════════ */
head("٣) العقد — جدولُ الانتقالات على الخادم");
const CTR = { status: "ctr_pending_signature", value: 100000, vendorId: "V1",
              requestId: "R1", lines: [], createdAt: "2026-01-01" };
await seed(`${C}/C1`, CTR);
await check("★ العقدُ لا يولد سارياً — بانتظار التوقيع",
  assertFails(setDoc(doc(PROC, `${C}/CN`), Object.assign({}, CTR, { status: "ctr_active" }))));
await check("والمشترياتُ تُنشئه بانتظار التوقيع",
  assertSucceeds(setDoc(doc(PROC, `${C}/CN`), CTR)));
await check("★ ودورٌ غيرُ المشتريات لا يُنشئ عقداً",
  assertFails(setDoc(doc(PM, `${C}/CZ`), CTR)));
await check("★ والماليةُ لا تُسري عقداً بلا توقيع",
  assertFails(updateDoc(doc(FIN, `${C}/C1`), { status: "ctr_active" })));
await check("والمشترياتُ تُسجّل التوقيع فيسري",
  assertSucceeds(updateDoc(doc(PROC, `${C}/C1`), { status: "ctr_active" })));
await check("★ وقيمةُ العقد لا تتغيّر بتعديلٍ مباشر (بابُ أوامر التغيير لاحقاً)",
  assertFails(updateDoc(doc(PROC, `${C}/C1`), { value: 500000 })));
await check("★ ومديرُ المشاريع لا يُقفل عقداً (الإقفالُ يُفرج عن المحتجز)",
  assertFails(updateDoc(doc(PM, `${C}/C1`), { status: "ctr_closed" })));
await check("والفسخُ للأدمن وحدَه", assertFails(updateDoc(doc(PM, `${C}/C1`), { status: "ctr_terminated" })));
await check("والأدمن يفسخ", assertSucceeds(updateDoc(doc(ADMIN, `${C}/C1`), { status: "ctr_terminated" })));
await check("★ والمفسوخُ لا يُحيا", assertFails(updateDoc(doc(ADMIN, `${C}/C1`), { status: "ctr_active" })));
await seed(`${C}/C2`, Object.assign({}, CTR, { status: "ctr_active" }));
await check("★★ والماليةُ تُنهي العقد فنّياً — لأنّ المستخلصَ الختاميَّ يفعلها في معاملته",
  assertSucceeds(updateDoc(doc(FIN, `${C}/C2`), { status: "ctr_completed", advance: { recovered: 10 } })));
await check("ثمّ تُقفله", assertSucceeds(updateDoc(doc(FIN, `${C}/C2`), { status: "ctr_closed" })));

/* ═════════ ٤) المستخلص — البوّابةُ والإيصال ═════════ */
head("٤) المستخلص — لا سدادَ بلا إيصال");
const EXT = { status: "ext_pending_pm", contractId: "C2", createdAt: "2026-02-01" };
await seed(`${E}/E1`, EXT);
await check("مديرُ المشاريع يُنشئ مستخلصاً",
  assertSucceeds(setDoc(doc(PM, `${E}/EN`), EXT)));
await check("★ ولا يُنشئه جاهزاً للسداد (قفزُ اعتمادَين)",
  assertFails(setDoc(doc(PM, `${E}/EX`), Object.assign({}, EXT, { status: "ext_pending_finance" }))));
await check("★ ومستخلصٌ بلا عقدٍ مرفوض",
  assertFails(setDoc(doc(PM, `${E}/EY`), Object.assign({}, EXT, { contractId: "" }))));
await check("★ والماليةُ لا تعتمد ما هو على بوّابة مدير المشاريع",
  assertFails(updateDoc(doc(FIN, `${E}/E1`), { status: "ext_pending_finance" })));
await check("ومديرُ المشاريع يعتمد فينتقل",
  assertSucceeds(updateDoc(doc(PM, `${E}/E1`), { status: "ext_pending_finance" })));
await check("★★ والسدادُ يُرفض بلا إيصال — على الخادم لا في الشاشة وحدَها",
  assertFails(updateDoc(doc(FIN, `${E}/E1`), { status: "ext_paid", payment: { amount: 100 } })));
await check("ويُقبل بإيصال",
  assertSucceeds(updateDoc(doc(FIN, `${E}/E1`), { status: "ext_paid", payment: { amount: 100, receiptUrl: "po/r.jpg" } })));
await check("★ والمسدَّدُ لا يُعدَّل بعدها", assertFails(updateDoc(doc(ADMIN, `${E}/E1`), { status: "ext_pending_pm" })));
await seed(`${E}/E2`, EXT);
await check("★ ولا يُنقل مستخلصٌ إلى عقدٍ آخر",
  assertFails(updateDoc(doc(PM, `${E}/E2`), { contractId: "C-OTHER" })));
await check("ولا يُحذف مستخلصٌ من العميل", assertFails(deleteDoc(doc(ADMIN, `${E}/E2`))));

/* ═════════ ٥) المساراتُ الحقيقيةُ للتطبيق — الوجهُ الآخرُ للفحص ═════════
   قاعدةٌ تمنع المهاجمَ وتمنع المستخدمَ الشرعيَّ معاً ليست حراسةً بل تعطيل. وكلُّ
   كتاباتِ الوحدة `set(..., {merge:true})` بالوثيقة **كاملةً** لا بالحقل المتغيّر
   وحدَه — فهذه المقاطعُ تحاكي شكلَ الحمولة كما ترسله `contracts.js` بالضبط. */
head("٥) المساراتُ الحقيقيةُ كما ترسلها الوحدة");
const full = (o) => Object.assign({
  value: 50000, vendorId: "V1", engagement: "contract", projectId: "hail",
  lines: [{ q: 1, p: 50000 }], createdAt: "2026-01-01", createdByUser: "pm",
  timeline: [{ t: "إنشاء الطلب" }], updatedAt: "2026-01-02", updatedBy: "x"
}, o);

await seed(`${R}/RP`, full({ status: "crq_pending_proc" }));
await check("★ اعتمادُ المشتريات كما ترسله الوحدة: الوثيقةُ كاملةً بـmerge",
  assertSucceeds(setDoc(doc(PROC, `${R}/RP`), full({
    status: "crq_pending_finance", procApprovedAt: "2026-01-02", procApprovedBy: "م",
    procApprovedKey: "k", timeline: [{ t: "إنشاء الطلب" }, { t: "اعتماد" }]
  }), { merge: true })));
await check("والإلغاءُ من مدير المشاريع يمرّ",
  assertSucceeds(setDoc(doc(PM, `${R}/RP`), full({ status: "crq_cancelled" }), { merge: true })));

await seed(`${R}/RC`, full({ status: "crq_approved" }));
await check("★ والتحويلُ إلى عقدٍ: إنشاءُ العقد وختمُ الطلب «محوَّلاً» — كلاهما للمشتريات",
  assertSucceeds((async () => {
    await setDoc(doc(PROC, `${C}/CT-NEW`), Object.assign({}, CTR, { requestId: "RC" }));
    await setDoc(doc(PROC, `${R}/RC`), full({ status: "crq_converted", contractId: "CT-NEW" }), { merge: true });
  })()));

await seed(`${C}/CS`, Object.assign({}, CTR, { status: "ctr_pending_signature" }));
await check("★ وتسجيلُ التوقيع يكتب صورةَ العقد والحالةَ معاً",
  assertSucceeds(setDoc(doc(PROC, `${C}/CS`), Object.assign({}, CTR, {
    status: "ctr_active", signedDocs: [{ url: "po/sig.jpg" }], signedAt: "2026-03-01", signedBy: "م"
  }), { merge: true })));
await check("وتحريرُ شروطِ العقد بلا مساسٍ بالحالة يمرّ",
  assertSucceeds(updateDoc(doc(PROC, `${C}/CS`), { clauses: [{ key: "scope", body: "نصّ" }] })));
await check("★ ومديرُ المشاريع يوقف العقد ويستأنفه",
  assertSucceeds(updateDoc(doc(PM, `${C}/CS`), { status: "ctr_suspended" })));
await check("والاستئنافُ يمرّ", assertSucceeds(updateDoc(doc(PM, `${C}/CS`), { status: "ctr_active" })));
await check("★ والأدمن يُنشئ طرفاً بآيبانٍ مباشرةً (لا يُعطَّل المسؤولُ عن النظام)",
  assertSucceeds(setDoc(doc(ADMIN, `${V}/VA`), { name: "ط", bank: { iban: "SA7777" } })));

/* ═════════ ٦) أوامرُ التغيير ═════════ */
head("٦) أوامرُ التغيير — البابُ الوحيدُ لتغيير قيمة العقد");
const G = "global_contract_changes";
const CHG = { status: "chg_pending_pm", contractId: "C2", amount: 15000, reason: "توسعةُ النطاق",
              lines: [{ id: "L1", qty: 5, unitPrice: 3000 }], durationDaysDelta: 10, createdAt: "2026-04-01" };
await seed(`${G}/G1`, CHG);
await check("مديرُ المشاريع يُنشئ أمرَ تغيير",
  assertSucceeds(setDoc(doc(PM, `${G}/GN`), CHG)));
await check("★ ولا يُنشئه بلا سبب (أمرٌ بلا سببٍ لا يُعتمَد)",
  assertFails(setDoc(doc(PM, `${G}/GX`), Object.assign({}, CHG, { reason: "" }))));
await check("★ ولا يُنشئه معتمَداً سلفاً",
  assertFails(setDoc(doc(PM, `${G}/GY`), Object.assign({}, CHG, { status: "chg_approved" }))));
await check("★ والمالية لا تعتمد ما هو على بوّابة مدير المشاريع",
  assertFails(updateDoc(doc(FIN, `${G}/G1`), { status: "chg_pending_proc" })));
await check("ومديرُ المشاريع يعتمد فينتقل",
  assertSucceeds(updateDoc(doc(PM, `${G}/G1`), { status: "chg_pending_proc" })));
await check("★★ وقيمةُ الأمر لا تتغيّر بعد الإرسال (وإلا اعتُمد رقمٌ وطُبِّق غيرُه)",
  assertFails(updateDoc(doc(PROC, `${G}/G1`), { amount: 400000 })));
await check("★ ولا تتبدّل بنودُه", assertFails(updateDoc(doc(PROC, `${G}/G1`), { lines: [{ id: "L1", qty: 99 }] })));
await check("★ ولا يُنقل الأمرُ إلى عقدٍ آخر",
  assertFails(updateDoc(doc(PROC, `${G}/G1`), { contractId: "C-OTHER" })));

// التطبيقُ على العقد: `value` مجمَّد، والإضافةُ في `changeOrders` وللمشتريات وحدَها
await seed(`${C}/CG`, Object.assign({}, CTR, { status: "ctr_active", changeOrders: [] }));
await check("★★ وقيمةُ العقد الأصليةُ تبقى مجمَّدةً حتى مع أمرِ تغييرٍ معتمَد",
  assertFails(updateDoc(doc(PROC, `${C}/CG`), { value: 115000 })));
await check("★★ والمشترياتُ تُطبّق الأمرَ بالإضافة إلى changeOrders (التاريخُ يبقى)",
  assertSucceeds(updateDoc(doc(PROC, `${C}/CG`), {
    changeOrders: [{ id: "G1", amount: 15000, status: "approved" }], durationDays: 70
  })));
await check("★ ودورٌ غيرُ المشتريات لا يمسّ أوامرَ تغيير العقد",
  assertFails(updateDoc(doc(FIN, `${C}/CG`), { changeOrders: [{ id: "GX", amount: 999999, status: "approved" }] })));
await check("★ والماليةُ ما زالت تُنهي العقد فنّياً (لم نكسر مسارَ المستخلص الختاميّ)",
  assertSucceeds(updateDoc(doc(FIN, `${C}/CG`), { status: "ctr_completed" })));
await check("ولا يُحذف أمرُ تغييرٍ من العميل", assertFails(deleteDoc(doc(ADMIN, `${G}/G1`))));

await env.cleanup();
console.log(results.join("\n"));
console.log("\n" + "═".repeat(58));
console.log(fail ? `❌ ${fail} فشلت من ${pass + fail}` : `✅ ${pass}/${pass} — قواعد Firestore محروسةٌ على محاكٍ حقيقيّ`);
console.log("═".repeat(58) + "\n");
process.exit(fail ? 1 : 0);
