#!/usr/bin/env bash
# ══ مُشغّل فحوص نظام هيل ══
# الاستخدام:  ضع index.html و purchase-kpi.js في المجلد الأب، ثم:  bash run.sh
set -uo pipefail
cd "$(dirname "$0")"
[ -f ../index.html ] || { echo "❌ ../index.html غير موجود"; exit 1; }
[ -d node_modules ] || { echo "📦 تثبيت jsdom..."; npm init -y >/dev/null 2>&1; npm install jsdom --silent; }

fail=0
run(){ echo; echo "══════ $1 ══════"; if $2; then :; else fail=$((fail+1)); fi; }

run "توزيع كميات الاستلام (waUpdateRow)"        "node verify-wa.js"
run "عكس المخزون عند حذف الطلب"                  "node verify-del.js"
run "إشارة سجل الحركات"                          "node verify-log.js"
run "حارس النقر المزدوج + تعديل الرصيد"          "node verify-nl.js"
[ -f ../purchase-kpi.js ] && run "وحدة مؤشرات الأداء" "node verify-kpi.js"
run "خريطة الكُتّاب"                              "python3 map_writers.py"
run "فحص الحمايات والتسابق"                      "python3 probe_guards.py"

echo; echo "════════════════════════════════════════"
[ $fail -eq 0 ] && echo "✅ كل الفحوص نجحت" || { echo "❌ $fail فحصاً فشل"; exit 1; }
