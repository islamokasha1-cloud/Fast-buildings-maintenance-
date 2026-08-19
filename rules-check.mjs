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
  doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, collection, getDocs, addDoc
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
/* دورُ المشرف بصيغتيه: «مشرف» هو المسجَّلُ في `meta/users` من نافذة الإدارة،
   و`supervisor` ما يحمله توكِنُ تطبيق الفنيين. قاعدةٌ تعرف واحدةً تردّ نصفَهم. */
const SUP = as("supervisor"), SUP_AR = as("مشرف");
/* سياقان يحملان الادّعاءَ `u` (اسمُ الدخول) كما يصدره الـWorker — به تُقاس مِلكيّةُ
   المستند في `vendorOwnUpdateOk`. وسياقُ `SUP_AR` أعلاه **بلا `u` عمداً** فيثبت أنّ
   توكِناً قديماً لا ادّعاءَ فيه لا يفتح باباً. */
const supAs = (u) => env.authenticatedContext("uid_" + u, { role: "مشرف", u }).firestore();
const SUP_RGD = supAs("رغده"), SUP_OTHER = supAs("خالد");
const OBS = as("observer"), HR = as("hr_officer");
const ANON = env.unauthenticatedContext().firestore();
/* تطبيقُ الفنيين يدخل **مُصادَقاً مجهولاً** (بلا ادّعاء `role`) — لا كزائرٍ بلا مصادقة.
   فالفرقُ بين السياقين هو الفرقُ بين «يعمل» و«تعطّل الميدانُ كلُّه». */
const TECH = env.authenticatedContext("tech_anon", {}).firestore();

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

/* ── المشرفُ يضيف ولا يعدّل (v18.9.2737) ──
   الإضافةُ دائرةٌ أوسعُ من التعديل عمداً؛ والفصلُ بينهما هو ما يجعل التوسيعَ آمناً.
   وشرطُ الآيبان يسري عليه كما يسري على المشتريات — بلا استثناءٍ لدورٍ أحدث. */
await check("★ المشرفُ يُنشئ طرفاً جديداً (وهو أوّلُ من يلقى المقاولَ في الموقع)",
  assertSucceeds(setDoc(doc(SUP, `${V}/V4`), { name: "مقاول موقع", bank: {} })));
await check("★★ وبالصيغة العربية «مشرف» كذلك (وهي المسجَّلةُ فعلاً في الإنتاج)",
  assertSucceeds(setDoc(doc(SUP_AR, `${V}/V4B`), { name: "مقاول موقع ٢", bank: {} })));
await check("★★ والعربيّةُ لا تعدّل طرفاً قائماً أيضاً (الصيغتان بحكمٍ واحد)",
  assertFails(updateDoc(doc(SUP_AR, `${V}/V1`), { name: "x" })));
/* ── الآيبانُ عند الإنشاء وحدَه (v18.9.2745) ──
   الخطرُ في **التبديل** لا في الكتابة الأولى: طرفٌ عمل شهوراً ثم يتغيّر آيبانُه قبل
   الصرف. فالمشرفُ يكتبه مع بقيةِ بيانات الطرف الجديد، ولا يبدّله بعدها أبداً. */
await check("★★ المشرفُ يُنشئ طرفاً **بآيبان** (يلقى المقاولَ ومعه بياناتُه)",
  assertSucceeds(setDoc(doc(SUP, `${V}/V5`), { name: "جديد", bank: { iban: "SA777" } })));
await check("★★ وبالصيغة العربية كذلك",
  assertSucceeds(setDoc(doc(SUP_AR, `${V}/V5B`), { name: "جديد ٢", bank: { iban: "SA778" } })));
await check("★★★ ومسؤولُ المشتريات ما زال ممنوعاً (لم يُطلَب توسيعُه)",
  assertFails(setDoc(doc(PROC, `${V}/V5C`), { name: "جديد ٣", bank: { iban: "SA779" } })));
await check("★★ ولا يعدّل بياناتِ طرفٍ قائم (الإضافةُ ليست التعديل)",
  assertFails(updateDoc(doc(SUP, `${V}/V1`), { name: "مؤسسة بيد المشرف" })));
await check("★ ولا يحذف", assertFails(deleteDoc(doc(SUP, `${V}/V4`))));
await check("★ ولا يفتح له ذلك بابَ العقود ولا طلباتِ التعاقد",
  assertFails(setDoc(doc(SUP, `${C}/CTR-SUP`), { status: "ctr_active", value: 1 })));

/* ── المضيفُ يصحّح ما أضافه وحدَه (v18.9.2739) ──
   الإضافةُ بلا تصحيحٍ تُنتج سجلاً خاطئاً لا يملك صاحبُه إصلاحَه. والمِلكيّةُ
   **باسم الدخول** لا بالاسم المعروض — وهذه فحوصُها على المحاكي لا بقراءة السطر. */
await seed(`${V}/V-RGD`, { name: "مقاول رغده", createdBy: "رغده", createdByUser: "رغده",
                           createdAt: "2026-08-01", status: "active" });
await seed(`${V}/V-OLD`, { name: "طرف قديم", createdBy: "المشتريات", status: "active" });
await check("★★ المشرفُ يعدّل الطرفَ الذي أضافه هو",
  assertSucceeds(updateDoc(doc(SUP_RGD, `${V}/V-RGD`), { name: "مقاول رغده — مصحَّح" })));
await check("★★ ولا يعدّل طرفاً أضافه مشرفٌ آخر",
  assertFails(updateDoc(doc(SUP_OTHER, `${V}/V-RGD`), { name: "انتحال" })));
await check("★★ ولا طرفاً قديماً بلا `createdByUser` (الشرطُ لا يجد ما يطابقه)",
  assertFails(updateDoc(doc(SUP_RGD, `${V}/V-OLD`), { name: "x" })));
await check("★★★ ولا ينتحل المِلكيّة (كتابةُ اسمه على مستندِ غيره ثم تعديلُه)",
  assertFails(updateDoc(doc(SUP_OTHER, `${V}/V-RGD`), { createdByUser: "خالد", name: "x" })));
await check("★★★ ولا يبدّل آيبانَ مستنده هو بعد الحفظ (الخطرُ في التبديل)",
  assertFails(updateDoc(doc(SUP_RGD, `${V}/V-RGD`), { bank: { iban: "SA555" } })));
await check("★★★ ولا يكتب آيباناً على طرفٍ قائمٍ لم يكن له آيبان",
  assertFails(updateDoc(doc(SUP_RGD, `${V}/V-OLD`), { bank: { iban: "SA556" } })));
await check("★★ ولا يفكّ إيقافاً وضعه الأدمن (status في unchanged)",
  assertFails(updateDoc(doc(SUP_RGD, `${V}/V-RGD`), { status: "stopped" })));
await check("★★ ولا يحذف مستنده هو", assertFails(deleteDoc(doc(SUP_RGD, `${V}/V-RGD`))));
await check("★★ وتوكِنٌ بلا ادّعاءِ اسمِ الدخول لا يفتح باباً",
  assertFails(updateDoc(doc(SUP_AR, `${V}/V-RGD`), { name: "y" })));
await check("★ والمشترياتُ تعدّل ما أضافه المشرفُ كما تعدّل غيرَه (لم تُقيَّد)",
  assertSucceeds(updateDoc(doc(PROC, `${V}/V-RGD`), { name: "مراجَعٌ من المشتريات" })));

/* ★★★ الحمولةُ الحقيقيةُ التي يرسلها `saveVendor` — لا حمولةٌ مصغَّرةٌ للفحص.
   الدالّةُ تكتب `set(merge:true)` بـ`Object.assign({}, cur, data)`: فتُعيد كتابةَ
   `createdByUser`/`createdAt`/`createdBy` **بقيمها نفسِها**، وتضيف `bank:{}` حين لا
   يكون للمستند بنكٌ أصلاً (`next.bank = cur.bank || {}` لمن لا يملك `canBank`).
   ولو حسِبت القاعدةُ إعادةَ كتابةِ القيمة نفسِها «تغييراً»، أو حسِبت `bank:{}`
   آيباناً، لَرُدّ كلُّ حفظٍ من الشاشة بينما تمرّ فحوصُ `updateDoc` المصغَّرة كلُّها.
   فالفحصُ يُرسل ما تُرسله الشاشةُ بالضبط. */
const savePayload = (over) => Object.assign({
  name: "مقاول رغده", createdBy: "رغده", createdByUser: "رغده",
  createdAt: "2026-08-01", status: "active", bank: {},
  updatedAt: "2026-08-20T10:00:00.000Z", updatedBy: "رغده"
}, over || {});
await check("★★★ وحفظُ الشاشة بحمولته الكاملة يمرّ (إعادةُ كتابةِ القيمة نفسِها ليست تغييراً)",
  assertSucceeds(setDoc(doc(SUP_RGD, `${V}/V-RGD`), savePayload({ name: "اسمٌ مصحَّح" }), { merge: true })));
await check("★★★ وبنفس الحمولة لا يمرّ تغييرُ اسمِ الدخول المالك",
  assertFails(setDoc(doc(SUP_OTHER, `${V}/V-RGD`), savePayload({ createdByUser: "خالد" }), { merge: true })));
await check("★★★ ولا تمرّ الحمولةُ نفسُها بآيبانٍ مدسوس",
  assertFails(setDoc(doc(SUP_RGD, `${V}/V-RGD`), savePayload({ bank: { iban: "SA9" } }), { merge: true })));

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

/* ★★ حذفُ العقد: نافذةٌ واحدةٌ — ما لم يُوقَّع بعد، وللأدمن وحدَه (طلبُ المالك).
   وحالةُ «بانتظار التوقيع» ضمانةٌ كافيةٌ أنّ لا مستخلصَ ولا أمرَ تغييرٍ له: الاثنان
   لا يُنشآن إلا على عقدٍ سارٍ. وما بعدها يُفسَخ ولا يُمحى. */
await seed(`${C}/CDEL`, Object.assign({}, CTR, { status: "ctr_pending_signature" }));
await check("★★ والأدمن يحذف عقداً لم يُوقَّع بعد (البابُ المطلوب)",
  assertSucceeds(deleteDoc(doc(ADMIN, `${C}/CDEL`))));
await seed(`${C}/CDEL2`, Object.assign({}, CTR, { status: "ctr_pending_signature" }));
await check("★★ ولا يحذفه غيرُ الأدمن ولو كان مَن يملك تسجيلَ التوقيع",
  assertFails(deleteDoc(doc(PROC, `${C}/CDEL2`))));
await seed(`${C}/CACT`, Object.assign({}, CTR, { status: "ctr_active" }));
await check("★★ ولا يُحذف عقدٌ سارٍ ولو من الأدمن (يُفسَخ ولا يُمحى)",
  assertFails(deleteDoc(doc(ADMIN, `${C}/CACT`))));
await check("★ ولا المفسوخ", assertFails(deleteDoc(doc(ADMIN, `${C}/C1`))));
await check("★ ولا المقفل", assertFails(deleteDoc(doc(ADMIN, `${C}/C2`))));

/* ★★★ **العمليةُ كما ينفّذها التطبيقُ لا القاعدةُ وحدَها** (درسُ v18.9.2589).
   حذفُ العقد في الوحدة **معاملةٌ بكتابتين**: حذفُ العقد **وإعادةُ طلبه** من
   `crq_converted` إلى `crq_approved`. وفحصي الأوّلُ جرّب `deleteDoc` وحدَه فمرّ —
   بينما ردّ الإنتاجُ العمليةَ كلَّها بـ`permission-denied`، لأنّ «المحوَّلُ لا يُفتح»
   كان يمنع الكتابةَ الثانية. فالفحصُ الآن **دفعةٌ واحدةٌ** كالمعاملة تماماً. */
await seed(`${C}/CPAIR`, Object.assign({}, CTR, { status: "ctr_pending_signature", requestId: "RPAIR" }));
await seed(`${R}/RPAIR`, Object.assign({}, REQ, { status: "crq_converted", contractId: "CPAIR" }));
await check("★★★ والأدمن يحذف العقدَ ويُحرِّر طلبَه في **دفعةٍ واحدة** (كما تفعل الوحدة)",
  assertSucceeds((function () {
    const b = writeBatch(ADMIN);
    b.delete(doc(ADMIN, `${C}/CPAIR`));
    b.set(doc(ADMIN, `${R}/RPAIR`), { status: "crq_approved", contractId: "" }, { merge: true });
    return b.commit();
  })()));
/* وحدودُ الاستثناء: لا يُفتح به غيرُ المحوَّل، ولا لغير الأدمن، ولا إلى حالةٍ أخرى،
   ولا مع إبقاء الرابط — وإلا صار «إلغاءُ التحويل» باباً خلفياً لفتح المغلق. */
await seed(`${R}/RUN1`, Object.assign({}, REQ, { status: "crq_converted", contractId: "CX" }));
await check("★★ ولا يُلغي التحويلَ غيرُ الأدمن",
  assertFails(updateDoc(doc(PROC, `${R}/RUN1`), { status: "crq_approved", contractId: "" })));
await check("★★ ولا يُنقل المحوَّلُ إلى حالةٍ أخرى (بوّابةٍ مثلاً)",
  assertFails(updateDoc(doc(ADMIN, `${R}/RUN1`), { status: "crq_pending_pm", contractId: "" })));
await check("★★ ولا يُلغى التحويلُ مع إبقاء الرابط (طلبٌ معتمَدٌ يشير إلى عقد)",
  assertFails(updateDoc(doc(ADMIN, `${R}/RUN1`), { status: "crq_approved" })));
await seed(`${R}/RUN2`, Object.assign({}, REQ, { status: "crq_paid" }));
await check("★★ والمسدَّدُ لا يُفتح بهذا الباب",
  assertFails(updateDoc(doc(ADMIN, `${R}/RUN2`), { status: "crq_approved", contractId: "" })));
await seed(`${R}/RUN3`, Object.assign({}, REQ, { status: "crq_cancelled" }));
await check("★ ولا الملغى",
  assertFails(updateDoc(doc(ADMIN, `${R}/RUN3`), { status: "crq_approved", contractId: "" })));

/* ═════════ ٤) المستخلص — البوّابةُ والإيصال ═════════ */
head("٤) المستخلص — لا سدادَ بلا إيصال ولا بلا نسخةٍ موقّعةٍ من المقاول");
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
await check("★★ ويُرفض بإيصالٍ بلا نسخةٍ موقّعةٍ من المقاول — لا مالَ بلا إقراره",
  assertFails(updateDoc(doc(FIN, `${E}/E1`), { status: "ext_paid", payment: { amount: 100, receiptUrl: "po/r.jpg" } })));
await check("★ والنسخةُ الموقّعةُ لا يكتبها التنفيذيّ — يكتبها من يستلمها من المقاول",
  assertFails(updateDoc(doc(CEO, `${E}/E1`), { signature: { url: "po/s.jpg", net: 100 } })));
await check("ومديرُ المشاريع يرفعها",
  assertSucceeds(updateDoc(doc(PM, `${E}/E1`), { signature: { url: "po/s.jpg", net: 100 } })));
await check("ويُقبل السدادُ بإيصالٍ ونسخةٍ موقّعة",
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

/* ═════════ ٧) حساباتُ المستخدمين — البند C1 ═════════
   مستنداتُ الحسابات ليست بياناتٍ بل **إصدارُ صلاحية**: فيها `hash` و`role`، ومنها
   يُصادِق الـWorker ويُصدر التوكِن. فمن يكتب فيها يكتب لنفسه دورَ `admin`.
   والفحصُ هنا **على شكل العملية كما ينفّذها التطبيق** لا على القاعدة مجرّدةً:
   الوحدةُ تكتب المستندَ **كاملاً** بـ`set({users:[...]},{merge:false})` — لا حقلاً
   واحداً — لأنها تقرأ المصفوفةَ وتعدّلها وتُعيدها. فبهذا الشكل يجري الفحص. */
head("٧) حساباتُ المستخدمين — الكتابةُ للأدمن وحدَه (C1)");
const U_C = "meta/users", U_P = "meta/hail_users";
const U_CD = "meta/users_dev", U_PD = "meta/hail_users_dev";
const BASE_USERS = [{ user: "boss", hash: "h1", role: "admin", name: "المالك" },
                    { user: "obs",  hash: "h2", role: "observer", name: "مراقب" }];
/** الحمولةُ بشكلها الحقيقيّ: الوثيقةُ كاملةً بمصفوفةِ المستخدمين */
const uDoc = (extra) => ({ users: extra ? BASE_USERS.concat([extra]) : BASE_USERS.slice() });
for (const p of [U_C, U_P, U_CD, U_PD]) await seed(p, uDoc());

/* ★★★ الاستغلالُ الموصوفُ في C1 حرفياً: موظّفٌ بأيّ دورٍ يفتح الـConsole ويضيف
   لنفسه سجلّاً بدور `admin`، ثمّ يدخل به فيُصدر له الـWorker توكِنَ أدمن. */
const EVIL = { user: "evil", hash: "sha256(x)", role: "admin", name: "مُتسلّق" };
await check("★★★ مراقبٌ لا يزرع حسابَ أدمن في المستند المركزي (استغلالُ C1 نفسُه)",
  assertFails(setDoc(doc(OBS, U_C), uDoc(EVIL))));
await check("★★★ ولا في مستند المشروع (البابُ الثاني إلى الدخول نفسِه)",
  assertFails(setDoc(doc(OBS, U_P), uDoc(EVIL))));
await check("★★ ولا في النسختَين التجريبيّتَين (`_dev` بابٌ خلفيٌّ لو نُسي)",
  assertFails(setDoc(doc(OBS, U_CD), uDoc(EVIL))));
await check("★★ ولا في مستند مشروعٍ تجريبيّ",
  assertFails(setDoc(doc(OBS, U_PD), uDoc(EVIL))));

/* والأدوارُ التي كانت تصل إلى شاشة «إدارة مستخدمي المشتريات» — هي بالضبط أخطرُ
   ما في البند: مسؤولُ مستودعٍ يُنشئ أدمن. */
await check("★★ ومسؤولُ المستودعات لا يكتب في مستند الحسابات",
  assertFails(setDoc(doc(WH, U_C), uDoc(EVIL))));
await check("★★ ولا مسؤولُ المشتريات",
  assertFails(setDoc(doc(PROC, U_P), uDoc(EVIL))));
await check("★ ولا مديرُ المشاريع ولا الماليةُ ولا المديرُ التنفيذيّ",
  assertFails(setDoc(doc(PM, U_C), uDoc(EVIL))));
await check("★ ولا المالية", assertFails(setDoc(doc(FIN, U_C), uDoc(EVIL))));
await check("★ ولا المديرُ التنفيذيّ", assertFails(setDoc(doc(CEO, U_C), uDoc(EVIL))));
await check("★ ولا مسؤولُ الموارد البشرية", assertFails(setDoc(doc(HR, U_C), uDoc(EVIL))));
await check("★ ولا الزائر", assertFails(setDoc(doc(VIEWER, U_C), uDoc(EVIL))));
await check("★★ ولا تطبيقُ الفنيين (مُصادَقٌ مجهولاً — أوسعُ بابٍ في القواعد)",
  assertFails(setDoc(doc(TECH, U_C), uDoc(EVIL))));
await check("★ ولا غيرُ المُصادَق أصلاً", assertFails(setDoc(doc(ANON, U_C), uDoc(EVIL))));

/* والتعديلُ الجزئيُّ والحذفُ بابان آخران للشيء نفسِه — لا يكفي منعُ `set` */
await check("★★ ولا يُعدَّل حقلٌ واحدٌ فيه بـupdate (نفسُ الباب بشكلٍ آخر)",
  assertFails(updateDoc(doc(WH, U_C), { users: uDoc(EVIL).users })));
await check("★★ ولا يُمحى مستندُ الحسابات فيُعاد بناؤه من الصفر",
  assertFails(deleteDoc(doc(PROC, U_P))));

/* ── والوجهُ الآخر: قاعدةٌ تمنع المهاجمَ وتمنع المسؤولَ معاً تعطيلٌ لا حراسة ── */
await check("والأدمن يكتب المستندَ المركزي (شكلُ `_upsertUserCentral` بالضبط)",
  assertSucceeds(setDoc(doc(ADMIN, U_C), uDoc({ user: "new", hash: "h3", role: "finance" }))));
await check("ويكتب مستندَ المشروع (شكلُ `saveUsers`)",
  assertSucceeds(setDoc(doc(ADMIN, U_P), uDoc({ user: "new", hash: "h3", role: "finance" }))));
await check("وفي النسختَين التجريبيّتَين",
  assertSucceeds(setDoc(doc(ADMIN, U_CD), uDoc())) );
await check("★★★ و«إضافةُ مستخدم» كعمليةٍ كاملةٍ: مستندُ المشروع ثمّ المركزيّ (كتابتان متتاليتان كما في الوحدة)",
  assertSucceeds((async () => {
    const added = { user: "adm2", hash: "h9", role: "admin", name: "مسؤولٌ ثانٍ" };
    await setDoc(doc(ADMIN, U_P), uDoc(added), { merge: false });   // saveUsers()
    await setDoc(doc(ADMIN, U_C), uDoc(added), { merge: false });   // _upsertUserCentral()
  })()));
await check("★★ و«حذفُ المشروع» يمحو مستندَ حساباته مع بقيةِ مستنداته (deleteProjectData)",
  assertSucceeds((async () => {
    await setDoc(doc(ADMIN, "meta/tmpproj_settings"), { buildings: [] });
    await setDoc(doc(ADMIN, "meta/tmpproj_users"), uDoc());
    await setDoc(doc(ADMIN, "meta/tmpproj_counter"), { n: 5 });
    await deleteDoc(doc(ADMIN, "meta/tmpproj_settings"));
    await deleteDoc(doc(ADMIN, "meta/tmpproj_users"));
    await deleteDoc(doc(ADMIN, "meta/tmpproj_counter"));
  })()));

/* ── والقراءةُ **لم تُمَسّ** (شرطُ المالك): الشاشةُ تعرض القائمةَ لمن يراها ── */
await check("★★ والقراءةُ كما كانت: كلُّ ذي دورٍ يقرأ مستندَ الحسابات",
  assertSucceeds(getDoc(doc(WH, U_C))));
await check("★ ويقرؤها المراقبُ والزائرُ أيضاً (لم نُضيّق القراءة)",
  assertSucceeds(getDoc(doc(VIEWER, U_P))));

/* ── ولم نُفرِط في القفل: بقيةُ `meta` تبقى تحت القاعدة العامة كما كانت ── */
await check("★★ ومستندُ العدّاد ما زال يُكتب بغير الأدمن (وإلا تعطّل ترقيمُ البلاغات)",
  assertSucceeds(setDoc(doc(PROC, "meta/hail_counter"), { n: 12 })));
await check("★ ومستندُ الإعدادات وقائمةُ المشاريع كذلك",
  assertSucceeds((async () => {
    await setDoc(doc(PM, "meta/hail_settings"), { buildings: ["أ"] });
    await setDoc(doc(PM, "meta/projects"), { projects: [{ id: "hail" }] });
  })()));
await check("★ ومستندُ الإشعارات (اسمُه لا يشبه `_users` — والتفريقُ يجب أن يكون دقيقاً)",
  assertSucceeds(setDoc(doc(WH, "meta/hail_notifications"), { last: 1 })));

/* ── وتطبيقُ الفنيين (يدخل مجهولاً) لم يُمَسّ بشيء ── */
await check("★★ وتطبيقُ الفنيين يقرأ إعداداتِ مشروعه ويكتب قوائمَ الصيانة كما كان",
  assertSucceeds((async () => {
    await getDoc(doc(TECH, "meta/hail_settings"));
    await getDoc(doc(TECH, "meta/projects"));
    await setDoc(doc(TECH, "meta/ppm_checklists"), { list: [] });
  })()));
await seed("hail_tickets/TK1", { status: "new" });   // البلاغُ يُنشَأ من النظام، والفنّيُّ **يحدّثه**
await check("★ ويكتب الحضورَ والفنيين ويحدّث البلاغات",
  assertSucceeds((async () => {
    await setDoc(doc(TECH, "attendance/A1"), { in: "08:00" });
    await setDoc(doc(TECH, "technicians/T1"), { pin: "1234" });
    await setDoc(doc(TECH, "hail_tickets/TK1"), { status: "open" }, { merge: true });
  })()));

/* ═════════ ٨) طابورُ واتساب — للخادم وحدَه (البند M16) ═════════
   `wa_outbox` قناةُ إرسالٍ لا مجموعةُ بيانات: ما يُكتب فيه يُرسَل رسالةً رسميةً من
   رقم الشركة. والكاتبُ الشرعيُّ دوالُّ السحابة بـAdmin SDK — وهو يتجاوز القواعد،
   فالقفلُ التامُّ لا يعطّل شيئاً. */
head("٨) طابورُ واتساب — قناةُ إرسالٍ لا مجموعةُ بيانات (M16)");
const WA_MSG = { to: "966500000000", template: "ticket_assigned",
                 params: ["عاجل: حوّل المبلغ إلى الحساب المرفق"], status: "queued" };
await seed("wa_outbox/W1", Object.assign({}, WA_MSG, { status: "sent" }));
await check("★★★ لا يحقن مسؤولُ مستودعٍ رسالةً باسم الشركة (استغلالُ M16 نفسُه)",
  assertFails(setDoc(doc(WH, "wa_outbox/W-EVIL"), WA_MSG)));
await check("★★ ولا المشترياتُ ولا الماليةُ ولا مديرُ المشاريع",
  assertFails(setDoc(doc(PROC, "wa_outbox/W-P"), WA_MSG)));
await check("★★ ولا الأدمن نفسُه — لا بابَ للعميل إطلاقاً (الإرسالُ فعلُ خادمٍ لا مستخدم)",
  assertFails(setDoc(doc(ADMIN, "wa_outbox/W-A"), WA_MSG)));
await check("★ ولا تطبيقُ الفنيين (المجهول)",
  assertFails(setDoc(doc(TECH, "wa_outbox/W-T"), WA_MSG)));
await check("★★ ولا تُعدَّل رسالةٌ في الطابور قبل إرسالها (تبديلُ الرقم أو النصّ)",
  assertFails(updateDoc(doc(ADMIN, "wa_outbox/W1"), { to: "966599999999" })));
/* ⚠ **والقراءةُ تبقى مفتوحةً — بعد ارتدادٍ مكلف.** قفلتُها أوّلَ مرّةٍ بشرطٍ على
   المسار في القاعدة العامة، فأسقطتُ استعلامَ كلّ مجموعةٍ في النظام (القسم ١٠).
   فالمقفولُ هنا **الكتابةُ** — وهي جوهرُ M16: الحقنُ لا التلصّص. وقفلُ القراءة
   يحتاج بلوكاً مستقلّاً يفصل `get` عن `list`، وهو بندٌ مستقلٌّ لاحق. */
await check("والقراءةُ ما زالت مفتوحةً لذوي الأدوار (قفلُها أسقط النظامَ — تُراجَع لاحقاً)",
  assertSucceeds(getDoc(doc(WH, "wa_outbox/W1"))));
await seed("wa_log/L1", { to: "966500000000", body: "نصّ", at: "2026-08-01" });
await check("★★ والأرشيفُ مثلُه: الكتابةُ مقفولةٌ والقراءةُ مفتوحة",
  assertFails(setDoc(doc(ADMIN, "wa_log/L2"), { to: "9" })));
await check("★ ولا حذفَ لأثرِ الإرسال",
  assertFails(deleteDoc(doc(ADMIN, "wa_log/L1"))));
/* ولم نُفرِط: `meta/wa_settings` (مفتاحُ التشغيل والساعاتُ الهادئة) يبقى للأدمن
   من القاعدة العامة — قفلُ الطابور لا يقفل إعداداتِه. */
await check("★ وإعداداتُ واتساب ما زالت تُكتب (لم نقفل مفتاحَ التشغيل بلا قصد)",
  assertSucceeds(setDoc(doc(ADMIN, "meta/wa_settings"), { enabled: true })));

/* ═════════ ٩) سجلُّ التدقيق — يُضاف ولا يُعدَّل ولا يُمحى (البند M11) ═════════
   ★ الوثيقةُ كانت تقول «لا يمكن المحو — إنشاء فقط». **وهذا لم يكن صحيحاً**:
   `allow read, write: if hasRole()` تشمل التعديلَ والحذف، والقاعدةُ العامة تمنح
   المثلَ. فالسجلُّ الذي يشهد على الفعل كان يمحوه فاعلُه. */
head("٩) سجلُّ التدقيق — يُضاف ولا يُعدَّل ولا يُمحى (M11)");
const AUD = (r) => ({ id: "AUD-1", action: "حذف مورد", details: "…",
                      by: "فلان", role: r, at: "2026-08-14T10:00:00Z" });
await seed("audit_log/A1", AUD("admin"));
await check("★★★ لا يُعدَّل قيدٌ في السجلّ بعد كتابته (طمسُ الأثر)",
  assertFails(updateDoc(doc(ADMIN, "audit_log/A1"), { details: "لا شيء" })));
await check("★★★ ولا يُمحى — ولو من الأدمن (السجلُّ يشهد على الجميع)",
  assertFails(deleteDoc(doc(ADMIN, "audit_log/A1"))));
await check("★★ ولا يُستبدَل بالكتابة فوقه بمعرّفه نفسِه (الحذفُ بابٌ آخر)",
  assertFails(setDoc(doc(WH, "audit_log/A1"), AUD("warehouse_manager"))));
await check("★★ ولا في النسخة التجريبية",
  assertFails((async () => { await seed("audit_log_dev/A2", AUD("admin"));
                             await deleteDoc(doc(ADMIN, "audit_log_dev/A2")); })()));
/* والإضافةُ تبقى مفتوحةً — وإلا سقط التدقيقُ كلُّه، وهو الغرضُ من وجوده */
await check("والإضافةُ تعمل لكلّ ذي دورٍ بدوره الحقيقيّ",
  assertSucceeds(setDoc(doc(WH, "audit_log/A-NEW"), AUD("warehouse_manager"))));
await check("★★ ولا يوقّع أحدٌ قيداً بدورٍ ليس دورَه (توقيعٌ باسم غيرِه)",
  assertFails(setDoc(doc(WH, "audit_log/A-FAKE"), AUD("admin"))));
await check("★ ويُقبل قيدُ النظام بـ`-` (قبل أن يوجد مستخدم)",
  assertSucceeds(setDoc(doc(PROC, "audit_log/A-SYS"), AUD("-"))));
await check("★★ وتطبيقُ الفنيين ما زال **يكتب** في السجلّ (بلا دورٍ — يُغلق مع C2)",
  assertSucceeds(setDoc(doc(TECH, "audit_log/A-TECH"), AUD("فني"))));
await check("★★ وما زال **يقرؤه** (لوحةُ أدمن التطبيق تعرض آخر ٣٠ قيداً)",
  assertSucceeds(getDoc(doc(TECH, "audit_log/A1"))));
await check("★ ولوحةُ الأدمن ما زالت تقرأ السجلّ",
  assertSucceeds(getDoc(doc(ADMIN, "audit_log/A1"))));

/* ═════════ ١٠) الاستعلامُ (`list`) — الصنفُ الذي أسقط الإنتاج ═════════
   ★★★ **انقطاعُ إنتاجٍ حقيقيّ (v18.9.2635).** أضفتُ شرطاً على المسار في قاعدة
   القراءة (`hasRole() && !srvOnly(document[0])`) فسقط **استعلامُ كلّ مجموعةٍ في
   النظام**: كلُّ الشاشات «Missing or insufficient permissions» والأدمن داخلٌ بدوره.

   والسببُ أنّ `read` **عمليتان لا واحدة**: `get` لمستندٍ بعينه، و`list` لاستعلام
   مجموعة. وفي الـ`list` لا مستندَ بعدُ فمقاطعُ المسار غيرُ محسومة، وأيُّ شرطٍ
   عليها يُسقط الطلب. **والكتابةُ لا تُصاب** (لا `list` فيها) — ولذلك عملت
   `ctrLocked(document[0])` سنواتٍ فظننتُ النمطَ آمناً في القراءة أيضاً.

   **ولم يمسكه أيُّ فحصٍ من ١٣٣**: كلُّها `getDoc`/`setDoc` على مستندٍ واحد — أي
   `get` لا `list`. فالصنفُ كلُّه كان أعمى. هذا القسمُ يفتح عينَه:
   **كلُّ مجموعةٍ يستعلمها التطبيق فعلاً، بكلّ دورٍ يستعلمها به.** */
head("١٠) الاستعلامُ (`list`) — لا يكفي `get` (الصنفُ الذي أسقط الإنتاج)");
const APP_COLLS = [
  "global_purchases", "global_rfqs", "global_inventory", "global_inventory_log",
  "global_issue_orders", "global_item_catalog", "global_labor_catalog",
  "global_hr_payments", "global_warehouses", "global_stocktakes", "global_custody",
  "global_assets", "global_price_analysis", "global_substitute_budget",
  "meta", "hail_tickets", "audit_log",
  "global_vendors", "global_contract_requests", "global_contracts",
  "global_contract_extracts", "global_contract_changes"
];
for (const c of APP_COLLS) {
  await check("★ يستعلم الأدمن مجموعةَ " + c,
    assertSucceeds(getDocs(collection(ADMIN, c))));
}
/* ولا الأدمن وحدَه — الشاشاتُ تُفتح بكلّ دور، والانقطاعُ أصاب الجميع */
for (const [nm, ctx] of [["مسؤول المستودعات", WH], ["المشتريات", PROC],
                         ["المالية", FIN], ["مدير المشاريع", PM],
                         ["المديرِ التنفيذيّ", CEO], ["الزائر", VIEWER]]) {
  await check("★★ ويستعلم " + nm + " المجموعاتِ الأساسية (القراءةُ لكلّ ذي دور)",
    assertSucceeds((async () => {
      for (const c of ["global_purchases", "global_inventory", "global_item_catalog",
                       "meta", "global_contracts"]) await getDocs(collection(ctx, c));
    })()));
}
await check("★★ وتطبيقُ الفنيين يستعلم ما يخصّه (بلاغاتٌ · فنيّون · حضورٌ · سجلّ)",
  assertSucceeds((async () => {
    for (const c of ["hail_tickets", "technicians", "attendance", "audit_log"])
      await getDocs(collection(TECH, c));
  })()));
/* ولم يفتح هذا القسمُ ما كان مقفولاً: الكتابةُ ما زالت محروسةً بعد إعادة القراءة */
await check("★★★ والحقنُ في طابور واتساب ما زال مردوداً بعد إعادةِ القراءة",
  assertFails(addDoc(collection(WH, "wa_outbox"), { to: "966500000000", status: "queued" })));
await check("★★★ ولا يحقن الأدمن أيضاً", assertFails(addDoc(collection(ADMIN, "wa_outbox"), { to: "9" })));
await check("★★ وحسابُ الأدمن ما زال مقفولاً على غيره",
  assertFails(setDoc(doc(WH, "meta/users"), { users: [] })));
await check("★★ وسجلُّ التدقيق ما زال لا يُمحى",
  assertFails(deleteDoc(doc(ADMIN, "audit_log/A1"))));

await env.cleanup();
console.log(results.join("\n"));
console.log("\n" + "═".repeat(58));
console.log(fail ? `❌ ${fail} فشلت من ${pass + fail}` : `✅ ${pass}/${pass} — قواعد Firestore محروسةٌ على محاكٍ حقيقيّ`);
console.log("═".repeat(58) + "\n");
process.exit(fail ? 1 : 0);
