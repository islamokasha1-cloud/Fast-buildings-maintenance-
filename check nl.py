import io, re, os, subprocess, sys

NEW, OLD = "18.9nl", "18.9nk"
P = "../index.html"
s = io.open(P, encoding="utf-8").read()
fail = []

# ══ 1) node --check على كل كتل script الداخلية ══
blocks = []
for m in re.finditer(r'<script(?P<attrs>[^>]*)>(?P<body>.*?)</script>', s, re.S):
    if 'src=' in m.group("attrs"):
        continue
    blocks.append((s[:m.start()].count("\n") + 1, m.group("body")))
print("inline script blocks:", len(blocks))
os.makedirs("./_chk", exist_ok=True)
for i, (line, body) in enumerate(blocks):
    fp = "./_chk/b%02d.js" % i
    io.open(fp, "w", encoding="utf-8").write(body)
    r = subprocess.run(["node", "--check", fp], capture_output=True, text=True)
    print("  [%s] block %d @ line %d (%d chars)" % ("OK " if r.returncode == 0 else "FAIL", i, line, len(body)))
    if r.returncode:
        fail.append("block %d @ %d\n%s" % (i, line, r.stderr[:800]))

# ══ 2) توازن <div> ══
o, c = len(re.findall(r'<div\b', s, re.I)), len(re.findall(r'</div\s*>', s, re.I))
print("\n<div> open=%d close=%d balance=%d" % (o, c, o - c))
if o != c: fail.append("div imbalance %d" % (o - c))

# ══ 3) موضعا الإصدار ══
sites = [
    ('id="login-version-footer">نظام صيانة المباني — v%s<' % NEW, "login-version-footer"),
    ('const APP_VERSION = "v%s"' % NEW, "APP_VERSION"),
]
print()
n_ok = 0
for pat, name in sites:
    k = s.count(pat)
    print("  [%s] %-22s = %d" % ("OK " if k == 1 else "FAIL", name, k))
    if k == 1: n_ok += 1
    else: fail.append("%s count=%d" % (name, k))
print("  active version sites = %d (must be 2)" % n_ok)

# ══ 4) صفر مرجع إصدار قديم نشط ══
stale = re.findall(r'(?:APP_VERSION = "v%s"|footer">نظام صيانة المباني — v%s|\?v=%s)'
                   % (re.escape(OLD), re.escape(OLD), re.escape(OLD)), s)
print("  stale ACTIVE %s refs = %d (must be 0)" % (OLD, len(stale)))
if stale: fail.append("stale active: %r" % stale)

# ══ 5) cache-busters ══
print("\ncache-busters:")
cb = re.findall(r'<script src="([^"]+\.js)\?v=([^"]+)"></script>', s)
for f, v in cb:
    ok = v == NEW
    print("   [%s] %-20s ?v=%s" % ("OK " if ok else "FAIL", f, v))
    if not ok: fail.append("cache-buster %s=%s" % (f, v))
if len(cb) != 3: fail.append("expected 3 external scripts, got %d" % len(cb))

# ══ 6) الملف الخارجي ══
r = subprocess.run(["node", "--check", "/home/claude/work/purchase-kpi.js"], capture_output=True, text=True)
print("\n   [%s] purchase-kpi.js" % ("OK " if r.returncode == 0 else "FAIL"))
if r.returncode: fail.append("purchase-kpi.js:\n" + r.stderr[:400])

# ══ 7) فحوص خاصة بهذه الجولة ══
print("\nفحوص v18.9nh:")
checks = [
    ("زال زر الحفظ بلا حارس", "const ok=await onOk();\n    if(ok!==false) modal.style.display=\"none\";" not in s),
    ("حارس النقر المزدوج موجود", "if(_okBusy) return;" in s and "_okBtn.disabled = true;" in s),
    ("الزر يُستعاد في finally", "}finally{" in s and "if(_okBtn.isConnected){ _okBtn.disabled = false;" in s),
    ("رمية onOk لا تُجمّد الزر", "console.warn(\"showCustomModal onOk error:\", e);" in s),
    ("زال الرقم المجمّد من حساب الرصيد",
     "if(type===\"set\"){ newQty=qty; delta=qty-currentQty; }" not in s
     and "else if(type===\"add\"){ newQty=currentQty+qty; delta=qty; }" not in s),
    ("الرصيد يُقرأ طازجاً داخل Transaction",
     "const liveQty = snap.exists ? (parseFloat(snap.data().currentQty)||0) : 0;" in s),
    ("الحساب على liveQty لا currentQty",
     "nq = _r3(liveQty + qty);" in s and "dl = _r3(qty - liveQty);" in s),
    ("الرصيد والسجل في Transaction واحدة",
     "tx.set(invRef, { currentQty:nq, lastUpdated:now }, {merge:true});" in s
     and "tx.set(adjLogRef, {" in s),
    ("زال ترتيب: السجل أولاً ثم الرصيد",
     "const adjLogRef = await db.collection(INVENTORY_LOG_COLLECTION()).add({" not in s),
    ("مرجع السجل خارج الـ Transaction",
     "const adjLogRef = db.collection(INVENTORY_LOG_COLLECTION()).doc();" in s),
    ("يُخبر المستخدم إن تغيّر الرصيد تحت يده", "الرصيد تغيّر منذ فتح الصفحة" in s),
    ("لم تُمسّ إصلاحات الجولات السابقة",
     "e.delta = _r3(e.delta - q);" in s and "const _qtyShown = _hasAdjD ? Math.abs(_adjD)" in s
     and "stockQty = _r3(rcvQty - directQty);" in s),
]
for name, ok in checks:
    print("   [%s] %s" % ("OK " if ok else "FAIL", name))
    if not ok: fail.append(name)

print("\n" + "=" * 52)
if fail:
    print("❌ FAILURES:"); [print(" -", x) for x in fail]; sys.exit(1)
print("✅ ALL CHECKS PASSED")
