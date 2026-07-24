# طبقة إشعارات واتساب — دليل النشر (عربي)

هذه الطبقة الخلفية تُرسل إشعار واتساب **للفني عند إسناد بلاغ إليه**. مبنية على
**Firebase Cloud Functions (2nd gen)** ومحايدة تجاه المزوّد (WhatsApp Cloud API من Meta).

المسار: `<projectId>_tickets` (تحديث/إنشاء) → `notifyRouter` → `wa_outbox` → `waSender` → واتساب.

---

## 0) المتطلّبات لمرة واحدة
- خطة **Blaze** مفعّلة على مشروع Firebase `fast-buildings` (Cloud Functions تتطلبها).
- بيئة فيها **Node.js 20** و**Firebase CLI**. خياران:
  - **كمبيوتر:** `npm i -g firebase-tools` ثم `firebase login`.
  - **بلا كمبيوتر (من الآيباد/الجوال):** استخدم **Google Cloud Shell** — طرفية في المتصفح
    فيها Node و`firebase`/`gcloud` جاهزة. انظر §A بالأسفل.
- من لوحة WhatsApp (Meta for Developers) بعد نجاح رقم الاختبار، جهّز:
  - **Phone Number ID** (مثال حالي: `1215289975003425`)
  - **Access Token** (مؤقت للتجربة، دائم للإنتاج — انظر §6)

---

## §A) النشر من الآيباد/الجوال عبر Google Cloud Shell (بلا كمبيوتر)
1. **فعّل Blaze أولاً:** افتح `https://console.firebase.google.com` ← مشروع **fast-buildings**
   ← Upgrade ← خطة **Blaze** (تتطلب بطاقة؛ الاستخدام الصغير ضمن الطبقة المجانية غالباً).
2. افتح **`https://shell.cloud.google.com`** بحساب Google المالك لمشروع `fast-buildings`
   ← اقبل التفعيل ← تظهر طرفية في المتصفح.
3. في الطرفية:
   ```bash
   gcloud config set project fast-buildings
   git clone <رابط-هذا-المستودع> && cd <اسم-المجلد>/functions
   npm install
   # اربط أدوات firebase (إن لزم تسجيل دخول): firebase login --no-localhost  ثم اتبع الرابط
   ```
4. اضبط القيم والسرّ ثم انشر (تكملة الخطوات §2–§4 أدناه، كلها تعمل داخل Cloud Shell).

> ملاحظة: كل الأوامر في الأقسام التالية تعمل حرفياً داخل Cloud Shell كما على الكمبيوتر.

---

## 1) تثبيت الاعتماديات
```bash
cd functions
npm install
```

## 2) ضبط القيم غير السرّية (متغيّرات بيئة)
عرِّفها في ملف `functions/.env` (لا تضع فيه التوكن السرّي):
```
WHATSAPP_PHONE_NUMBER_ID=1215289975003425
WHATSAPP_GRAPH_VERSION=v21.0
# مجموعات البلاغات لكل مشروع (مفصولة بفواصل). أضف مشاريعك هنا:
WA_TICKET_COLLECTIONS=hail_tickets
# للاختبار السريع قبل اعتماد القوالب استخدم قالب Meta الجاهز:
WA_TEMPLATE=hello_world
WA_TEMPLATE_LANG=en_US
# للإنتاج بعد اعتماد قالبك العربي:
# WA_TEMPLATE=ticket_assigned
# WA_TEMPLATE_LANG=ar
```
> `functions/.env` مُتجاهَل في git (لا يُرفع). القيم هنا ليست سرّية لكنها تخصّ بيئتك.

## 3) ضبط التوكن السرّي (Secret Manager)
لا يوضع التوكن في أي ملف. خزّنه سرّاً:
```bash
firebase functions:secrets:set WHATSAPP_TOKEN
# سيطلب لصق التوكن — الصقه واضغط Enter
```

## 4) النشر
```bash
firebase deploy --only functions
```
سيُنشَر: مشغّلات البلاغات (`ticketAssignUpdate_*`, `ticketAssignCreate_*`) + `waSender` + `waRetry`.

---

## 5) التجربة السريعة (رقم الاختبار)
1. تأكّد أن **رقم واتساب الفني** مُسجّل ضمن أرقام المستقبِلين في لوحة الاختبار (Meta تسمح بـ5 أرقام).
2. أضف مستند فني في مجموعة `technicians` معرّفه = **اسم الفني تماماً كما في حقل `tech`**:
   ```
   technicians/أحمد  →  { phone: "9665XXXXXXXX", waOptIn: true }
   ```
   (الرقم بصيغة دولية بلا +؛ يجب أن يطابق رقماً مُسجّلاً في لوحة الاختبار.)
3. من التطبيق، أسنِد بلاغاً للفني «أحمد» → يُكتب في `hail_tickets` → يُطلق المشغّل → تصل الرسالة.
4. راقب: `firebase functions:log` ، وتحقّق من مجموعتَي `wa_outbox` (الحالة `sent`) و`wa_log`.

> **قبل اعتماد القوالب** استخدم `WA_TEMPLATE=hello_world` (بلا متغيّرات) للتأكد من المسار،
> ثم بدّل إلى `ticket_assigned` بعد اعتماده.

---

## 6) للإنتاج (لاحقاً)
- **توكن دائم**: أنشئ **System User** في Business Settings ووّلد توكناً دائماً، وأعد `functions:secrets:set WHATSAPP_TOKEN`.
- **اعتماد القوالب**: قدّم القوالب الخمسة (انظر خطة §5) بفئة **Utility** لغة عربية. ابدأ بـ `ticket_assigned`:
  `مرحباً {{1}}، تم إسناد بلاغ صيانة إليك.\nرقم: {{2}}\nالنوع: {{3}} — المبنى: {{4}}\nالأولوية: {{5}}`
- **رقم مخصّص دائم** + **توثيق الأعمال** لرفع حدود الإرسال.
- **تعدّد المشاريع**: أضف كل `<projectId>_tickets` إلى `WA_TICKET_COLLECTIONS` وأعد النشر.

---

## 7) التحكّم والتشغيل
- **مفتاح القتل**: أنشئ `meta/wa_settings` بالحقل `{ enabled: false }` لإيقاف كل الإرسال فوراً.
- **منع التكرار**: مضمون عبر معرّف مستند حتمي في `wa_outbox` (لن تتكرر رسالة لنفس الإسناد).
- **إعادة المحاولة**: `waRetry` كل دقيقتين يعيد إرسال العالق حتى `WA_MAX_ATTEMPTS` (افتراضي 3).

## 8) ⚠️ تشديد أمني مطلوب قبل الإنتاج
قواعد Firestore الحالية فيها قاعدة عامة `match /{document=**}` تسمح بالكتابة لأي مستخدم
بدور. قواعد Firestore تُجمع بمنطق **OR** فلا يمكن «منع» مسار عبر قاعدة أضيق. لمنع العميل من
حقن رسائل في `wa_outbox`، يجب **تضييق القاعدة العامة** لتستثني `wa_outbox`/`wa_log`
(تغيير أمني يُراجَع على حدة). المُرسِل نفسه لا يرسل إلا ما في المستند، لكن الحقن ممكن نظرياً
بالوضع الحالي. `waSender`/`waRetry` يعملان عبر Admin SDK ويتجاوزان القواعد للكتابة.
