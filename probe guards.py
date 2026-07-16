import io, re

lines = io.open("/home/claude/work/hail-v18_9nk.html", encoding="utf-8").read().split("\n")

# ── حدود كل دالة ──
def fn_range(name):
    start = None
    for i, ln in enumerate(lines, 1):
        if re.match(r'^\s{0,2}(?:async\s+)?function\s+%s\b' % re.escape(name), ln):
            start = i; break
    if not start: return None
    depth = 0; seen = False
    for i in range(start, min(len(lines), start + 900)):
        depth += lines[i-1].count("{") - lines[i-1].count("}")
        if "{" in lines[i-1]: seen = True
        if seen and depth <= 0: return (start, i)
    return (start, min(len(lines), start + 900))

TARGETS = [
    ("openTransferInventoryModal", "مناقلة بين المستودعات"),
    ("submitManualInventory",      "إضافة مخزون يدوي"),
    ("openEditInventoryQtyModal",  "تعديل رصيد صنف"),
    ("resetInventoryItemToZero",   "تصفير رصيد صنف"),
    ("openInventoryOutModal",      "صرف من المخزون"),
    ("issueOrderSubmit",           "تنفيذ أمر صرف"),
    ("rejectIssueOrder",           "رفض أمر صرف"),
    ("custodySubmit",              "تسليم عهدة"),
    ("openCustodyReturnModal",     "إرجاع عهدة"),
    ("deleteCustodyRecord",        "حذف سجل عهدة"),
    ("doInventoryReview",          "مراجعة المخزون"),
    ("doWarehouseAudit",           "تدقيق الاستلام"),
    ("deletePurchase",             "حذف طلب شراء"),
]

GUARD_PAT = re.compile(r'_\w*(?:unning|ubmitting|usy|ocked|Lock)\b|\.disabled\s*=\s*true|_inFlight|_processing')

print("═" * 92)
print("  فحص حماية النقر المزدوج والتسابق — لكل دالة تكتب في رصيد المخزون")
print("═" * 92)
print("\n  %-28s %-9s %-7s %-8s %-7s %s" % ("الدالة", "النمط", "حارس", "Tx", "await", "الخطر"))
print("  " + "─" * 88)

risky = []
for fn, label in TARGETS:
    r = fn_range(fn)
    if not r:
        print("  %-28s  ← لم تُعثر" % fn); continue
    a, b = r
    body = "\n".join(lines[a-1:b])

    inc   = "FieldValue.increment" in body
    rtw   = bool(re.search(r'currentQty\s*:\s*(prevQty|newQty|correctedQty)', body))
    zero  = bool(re.search(r'currentQty\s*:\s*0\b', body))
    tx    = "runTransaction" in body
    guard = bool(GUARD_PAT.search(body))
    awaited = bool(re.search(r'await\s+db\.(collection|doc|runTransaction)', body))

    kind = "increment" if inc else ("قراءة+كتابة" if rtw else ("تصفير" if zero else "?"))

    # تقدير الخطر
    danger = []
    if not guard:
        danger.append("نقر مزدوج")
    if rtw and not tx:
        danger.append("⚠ تسابق (قراءة ثم كتابة بلا Transaction)")
    if not awaited and not tx:
        danger.append("كتابة بلا انتظار")

    d = "، ".join(danger) if danger else "—"
    if danger: risky.append((fn, label, kind, d, a))
    print("  %-28s %-9s %-7s %-8s %-7s %s"
          % (fn[:27], kind, "✓" if guard else "✗", "✓" if tx else "—",
             "✓" if awaited else "—", d))

print("\n" + "═" * 92)
print("  المشتبه بهم — مرتّبون")
print("═" * 92)
for fn, label, kind, d, a in risky:
    print("\n  ● %s  (%s)  @ سطر %d" % (label, fn, a))
    print("      النمط: %s" % kind)
    print("      الخطر: %s" % d)
print("\n  الإجمالي: %d من %d دالة عليها ملاحظة" % (len(risky), len(TARGETS)))
