import io, re, json

P = "/home/claude/work/hail-v18_9nk.html"
lines = io.open(P, encoding="utf-8").read().split("\n")

# ── الدالة الحاضنة لكل سطر ──
fn_at = {}
cur = "(نطاق عام)"
for i, ln in enumerate(lines, 1):
    m = re.match(r'^\s{0,2}(?:async\s+)?function\s+([A-Za-z_$][\w$]*)', ln)
    if m: cur = m.group(1)
    fn_at[i] = cur

def enclosing(n):
    return fn_at.get(n, "?")

# ── هل السطر داخل runTransaction؟ (تقريب: أقرب runTransaction قبله ضمن 60 سطراً) ──
def in_tx(n):
    for k in range(max(1, n-60), n):
        if "runTransaction" in lines[k-1]:
            return True
    return False

FIELDS = {
    "currentQty": r'currentQty\s*[:=]\s*(?!\=)',
    "receivedQty": r'\.receivedQty\s*=(?!=)',
    "poCounter":  r'\bpoCounter\s*=(?!=)',
}

def classify(txt):
    if "FieldValue.increment" in txt: return ("increment()", "نسبي — ذرّي في Firestore")
    if re.search(r'currentQty\s*:\s*(prevQty|newQty|correctedQty|_?r3\(|Math\.max)', txt): return ("قراءة ثم كتابة", "مطلق محسوب")
    if re.search(r'currentQty\s*:\s*0\b', txt): return ("تصفير", "مطلق")
    if re.search(r'currentQty\s*:\s*(tq|qty|rqty)\b', txt): return ("كتابة مطلقة", "⚠ يحتاج تحقق")
    if "_inventoryItems" in txt: return ("نسخة محلية", "ذاكرة فقط")
    return ("?", "?")

print("═" * 84)
print("  خريطة الكُتّاب — رصيد المخزون  currentQty")
print("═" * 84)

rows = []
for i, ln in enumerate(lines, 1):
    if not re.search(FIELDS["currentQty"], ln): continue
    if re.search(r'parseFloat\(.*currentQty|snap\.data\(\)|\.currentQty\s*\|\|\s*0|currentQty\s*==', ln): continue
    kind, note = classify(ln)
    if kind == "?": continue
    rows.append({
        "line": i, "fn": enclosing(i), "kind": kind, "note": note,
        "tx": in_tx(i), "local": kind == "نسخة محلية",
    })

# اجمع حسب الدالة
by_fn = {}
for r in rows:
    by_fn.setdefault(r["fn"], []).append(r)

remote = [r for r in rows if not r["local"]]
print("\n  كُتّاب Firestore (لا النسخة المحلية): %d موضعاً في %d دالة\n"
      % (len(remote), len(set(r["fn"] for r in remote))))
print("  %-6s %-30s %-16s %-6s %s" % ("سطر", "الدالة", "النمط", "TX", "ملاحظة"))
print("  " + "─" * 80)
for r in sorted(remote, key=lambda x: x["line"]):
    print("  %-6d %-30s %-16s %-6s %s"
          % (r["line"], r["fn"][:29], r["kind"], "✓" if r["tx"] else "—", r["note"]))

# ── التجميع حسب النمط ──
print("\n" + "═" * 84)
print("  التوزيع حسب النمط")
print("═" * 84)
kinds = {}
for r in remote: kinds.setdefault(r["kind"], []).append(r)
for k, v in sorted(kinds.items(), key=lambda x: -len(x[1])):
    tx_n = sum(1 for r in v if r["tx"])
    print("  %-18s %2d موضعاً   (داخل Transaction: %d)" % (k, len(v), tx_n))
    print("       الدوال: " + "، ".join(sorted(set(r["fn"] for r in v))))

io.open("./_map.json", "w", encoding="utf-8").write(
    json.dumps(rows, ensure_ascii=False, indent=1))
print("\n  (حُفظت الخريطة في _map.json)")
