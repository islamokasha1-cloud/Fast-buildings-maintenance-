# النشر الآليّ إلى خادم الإنتاج

> الملفّات: `.github/workflows/deploy-server.yml` · `scripts/server-pull.sh`

## ١) ما الذي يفعله

عند كل دفعٍ إلى `main` (وعند التشغيل اليدويّ من تبويب **Actions**) يفتح GitHub
اتصالَ SSH بالخادم، وينفّذ `scripts/server-pull.sh` في `/var/www/maintenance`:
يتحقّق أن الشجرة نظيفة، ثم `git fetch` و`git merge --ff-only origin/main`، ثم
يطبع الـ commit قبلَ السحب وبعدَه في سجلّ التشغيل.

**لا نشرَ من فرعٍ آخر.** الدفعُ إلى فرع عملٍ لا يمسّ الإنتاج — فقط ما دُخل `main`.

## ٢) الأسرار المطلوبة

في المستودع: **Settings ← Secrets and variables ← Actions ← New repository secret**

| السرّ | إلزاميّ | القيمة |
|---|---|---|
| `DEPLOY_HOST` | نعم | عنوان الخادم (IP أو اسم مضيف) |
| `DEPLOY_USER` | نعم | اسم مستخدم SSH |
| `DEPLOY_SSH_KEY` | أحدهما | المفتاح الخاصّ كاملاً (`-----BEGIN …`) — **المسار المفضَّل** |
| `DEPLOY_SSH_PASSWORD` | أحدهما | كلمة المرور — بديلٌ أضعف، يُستعمل إن غاب المفتاح |
| `DEPLOY_KNOWN_HOSTS` | لا | سطر `known_hosts` للخادم — يُثبّت هويّته |
| `DEPLOY_PORT` | لا | منفذ SSH (افتراضاً `22`) |
| `DEPLOY_PATH` | لا | مسار العمل (افتراضاً `/var/www/maintenance`) |

بغياب `DEPLOY_HOST` أو `DEPLOY_USER` أو كليَ المفتاح وكلمة المرور، **لا يسقط
الدفع**: وظيفة `preflight` تُطفئ النشر وتكتب سبب التخطّي في ملخّص التشغيل.

## ٣) المفتاح بدل كلمة المرور — ولماذا يستحقّ الدقائق العشر

كلمةُ المرور تفتح **جلسةً تفاعليةً كاملة** لمن حصل عليها، ولا يُبطلها إلا تغييرُها
على كل مستخدمٍ يعرفها. والمفتاحُ يُلغى وحدَه بحذف سطرٍ من `authorized_keys` بلا
مساسٍ بأحد. توليدُه ورفعُه:

```bash
# على جهازك (لا على الخادم): مفتاحٌ مخصَّصٌ للنشر وحدَه، بلا عبارة مرور
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/maintenance_deploy -N ""

# ارفع العامّ إلى الخادم
ssh-copy-id -i ~/.ssh/maintenance_deploy.pub <user>@<host>

# ثم انسخ **الخاصّ** كاملاً إلى سرّ DEPLOY_SSH_KEY
cat ~/.ssh/maintenance_deploy
```

وبصمةُ المضيف لسرّ `DEPLOY_KNOWN_HOSTS`:

```bash
ssh-keyscan -H <host>            # انسخ الناتج كاملاً
```

بغيرها يلجأ سيرُ العمل إلى `ssh-keyscan` وقتَ التشغيل — يعمل، لكنّه يثق بأوّل
مضيفٍ يردّ، فلا يمنع انتحالاً. ولذلك يكتب تحذيراً في كل تشغيل.

## ٤) تجهيزُ الخادم مرّةً واحدة

يجب أن يكون `/var/www/maintenance` **مستودعَ git** له `origin` يشير إلى المستودع،
وأن يكون مستخدمُ SSH مالكَ الملفّات (لا `sudo` في السكربت):

```bash
cd /var/www/maintenance
git remote -v            # يجب أن يظهر origin
git status               # يجب أن تكون الشجرة نظيفة
git rev-parse --abbrev-ref HEAD   # يُفضَّل main
```

إن كان المستودع خاصّاً، يحتاج الخادمُ صلاحيةَ قراءةٍ خاصّةً به — **مفتاح نشرٍ
(Deploy key) للقراءة فقط** هو الأنظف:

```bash
ssh-keygen -t ed25519 -C "server-readonly" -f ~/.ssh/repo_readonly -N ""
cat ~/.ssh/repo_readonly.pub    # أضِفه في: Settings ← Deploy keys ← Add (بلا write)
git remote set-url origin git@github.com:<owner>/<repo>.git
```

## ٥) أخطاءٌ شائعة وقراءتُها

| ما يظهر في السجلّ | السبب | العلاج |
|---|---|---|
| `✗ شجرةُ العمل على الخادم غير نظيفة` | أحدهم حرّر ملفاً على الإنتاج | راجِع `git status` هناك: التزم التعديل أو `git checkout --` عن قصد |
| `✗ … ليس مستودع git` | `DEPLOY_PATH` خاطئ | صحّح السرّ |
| `Not possible to fast-forward` | نسخةُ الخادم تشعّبت عن `main` | عالِجها بيدٍ على الخادم — لا يُنشئ السكربت commit دمجٍ على الإنتاج |
| `Permission denied (publickey,password)` | مفتاحٌ أو كلمةُ مرورٍ خاطئة | راجِع السرّ، وجرّب الاتصالَ يدوياً بنفس المستخدم |
| `Host key verification failed` | تغيّرت بصمةُ الخادم (أو `DEPLOY_KNOWN_HOSTS` قديم) | حدّث السرّ بـ `ssh-keyscan -H <host>` |

**السكربتُ لا يمحو شيئاً أبداً** — لا `reset --hard` ولا `checkout -f`. التعديلُ
المحليُّ على الإنتاج يوقف النشرَ بصوتٍ عالٍ بدل أن يُطمس صامتاً.

## ٦) تشغيلٌ يدويّ وتجربةٌ محلية

- من GitHub: **Actions ← Deploy to server ← Run workflow**.
- محلياً بلا GitHub (للتجربة): `ssh <user>@<host> "bash -s -- /var/www/maintenance main" < scripts/server-pull.sh`
