#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# server-pull.sh — سحبُ آخرِ `main` في نسخة الخادم
#
# يُنفَّذ **على خادم الإنتاج** لا هنا: يُمرَّر على stdin عبر SSH (`bash -s -- <path>`)
# من `.github/workflows/deploy-server.yml`. ومرورُه على stdin مقصود — لا يظهر
# مسارٌ ولا وسيطٌ في `ps` على الخادم، ولا نسخةَ سكربتٍ تتقادم هناك.
#
# ── المبدأ: نفشل بصوتٍ عالٍ ولا نطمس شيئاً ──
# لا `reset --hard` ولا `checkout -f`. إن كانت شجرةُ الخادم متّسخةً فذلك يعني أن
# أحداً حرّر ملفاً هناك — والمحوُ الصامتُ يُضيع عملَه بلا أثر، بينما السقوطُ يُقرأ
# في سجلّ Actions ويُعالَج بيد.
#
# الاستعمال:  bash server-pull.sh [مسار العمل] [الفرع]
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

TARGET_PATH="${1:-/var/www/maintenance}"
BRANCH="${2:-main}"

cd "$TARGET_PATH"

# مجلّدٌ ليس مستودعَ git أصلاً = مسارٌ خاطئ. نقولها صراحةً بدل رسالة git الغامضة.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "✗ $TARGET_PATH ليس مستودع git — راجِع DEPLOY_PATH."
  exit 2
}

BEFORE="$(git rev-parse --short HEAD)"
echo "── قبل السحب: $BEFORE ($(git rev-parse --abbrev-ref HEAD)) ──"

if [ -n "$(git status --porcelain)" ]; then
  echo "✗ شجرةُ العمل على الخادم غير نظيفة — أُوقف النشر بدل طمسِ التعديل:"
  git status --short
  exit 3
fi

git fetch --prune origin "$BRANCH"

# `--ff-only` لا `merge`: نسخةُ الخادم يجب أن تكون **تابعاً** لـ main لا فرعاً
# يتشعّب عنه. وأيُّ تباعدٍ خطأٌ يستحقّ التوقّف لا commit دمجٍ يُنشأ على الإنتاج.
git merge --ff-only "origin/$BRANCH"

AFTER="$(git rev-parse --short HEAD)"
if [ "$BEFORE" = "$AFTER" ]; then
  echo "◦ لا جديد — الخادمُ كان على $AFTER أصلاً."
else
  echo "✓ $BEFORE ← $AFTER"
  git --no-pager log --oneline "$BEFORE..$AFTER" | head -20
fi

echo "── بعد السحب ──"
git --no-pager log -1 --format='%h %ad %s' --date=short
