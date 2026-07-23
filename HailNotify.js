/*!
 * HailNotify.js — طبقة عرض الإشعارات ( toast + Notification API )
 * وحدة مستقلة على نمط labor-catalog.js / price-analysis.js
 * تكشف window.HailNotify فقط. لا تعرف شيئاً عن Firestore أو الأدوار —
 * الربط ( onSnapshot / docChanges / التوجيه حسب الدور ) يبقى في index.html.
 * الإصدار: v1.0.0
 */
(function (w, d) {
  "use strict";
  if (w.HailNotify) return; // idempotent

  var VERSION = "1.0.0";
  var STYLE_ID = "hn-style";
  var STACK_ID = "hn-stack";

  // ---- الإعدادات الافتراضية ( قابلة للتجاوز عبر init ) ----
  var cfg = {
    duration: 7000,          // مدة الاختفاء التلقائي بالمللي ثانية ( 0 = لا يختفي )
    maxVisible: 4,           // أقصى عدد إشعارات مرئية قبل إزاحة الأقدم
    nativeWhenHidden: true,  // إشعار متصفح فقط حين يكون التاب غير مرئي
    sound: false,            // صوت تنبيه خفيف
    position: "bottom-right",// bottom-right | bottom-left
    colors: {
      ticket: { accent: "#c2560c", tint: "#fdf1e7" },
      po:     { accent: "#0e7490", tint: "#e6f4f6" },
      urgent: { accent: "#c8102e", tint: "#fdecee" }
    }
  };

  var ICONS = {
    ticket: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    po:     '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    urgent: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'
  };
  var KICKERS = { ticket: "بلاغ صيانة", po: "طلب شراء", urgent: "عاجل" };

  function esc(s) { var el = d.createElement("div"); el.textContent = (s == null ? "" : String(s)); return el.innerHTML; }

  function injectStyle() {
    if (d.getElementById(STYLE_ID)) return;
    var pos = cfg.position === "bottom-left"
      ? "bottom:20px;left:20px;right:auto;"
      : "bottom:20px;right:20px;left:auto;";
    var css =
    '.hn-stack{position:fixed;' + pos + 'z-index:2147483000;display:flex;flex-direction:column-reverse;gap:12px;width:360px;max-width:calc(100vw - 32px);pointer-events:none;direction:rtl;font-family:"IBM Plex Sans Arabic",-apple-system,system-ui,"Segoe UI",Tahoma,sans-serif}' +
    '.hn-toast{pointer-events:auto;position:relative;overflow:hidden;background:var(--surface,#fff);color:var(--text,#111a26);border-radius:14px;box-shadow:0 12px 32px -8px rgba(9,17,28,.28),0 4px 10px -4px rgba(9,17,28,.18);border:1px solid var(--border,#e6eaf0);border-inline-start:4px solid var(--hn-accent,#ccc);display:grid;grid-template-columns:38px 1fr auto;gap:12px;padding:14px;cursor:pointer;transform:translateX(-24px);opacity:0;animation:hnIn .34s cubic-bezier(.16,.84,.44,1) forwards}' +
    '.hn-toast.hn-out{animation:hnOut .26s ease forwards}' +
    '@keyframes hnIn{to{transform:translateX(0);opacity:1}}' +
    '@keyframes hnOut{to{transform:translateX(-16px);opacity:0;height:0;margin-top:-12px;padding-top:0;padding-bottom:0}}' +
    '.hn-ic{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;background:var(--hn-tint);color:var(--hn-accent)}' +
    '.hn-ic svg{width:20px;height:20px}' +
    '.hn-b{min-width:0}' +
    '.hn-k{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--hn-accent);font-weight:500;margin-bottom:3px}' +
    '.hn-t{font-size:14.5px;font-weight:700;line-height:1.35;margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text,#111a26)}' +
    '.hn-x{font-size:13px;color:var(--muted,#647085);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
    '.hn-m{margin-top:7px;font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11px;color:var(--muted,#94a2b4);display:flex;gap:10px;align-items:center}' +
    '.hn-m .hn-dot{width:4px;height:4px;border-radius:50%;background:currentColor;opacity:.5}' +
    '.hn-c{align-self:start;background:none;border:none;color:var(--muted,#aab6c4);cursor:pointer;padding:2px;border-radius:6px;line-height:0;transition:.15s}' +
    '.hn-c:hover{background:rgba(0,0,0,.06)}' +
    '.hn-c svg{width:16px;height:16px}' +
    '.hn-p{position:absolute;bottom:0;inset-inline:0;height:2.5px;background:var(--hn-accent);transform-origin:right;animation:hnBar var(--hn-dur,7s) linear forwards}' +
    '.hn-toast:hover .hn-p{animation-play-state:paused}' +
    '@keyframes hnBar{from{transform:scaleX(1)}to{transform:scaleX(0)}}' +
    '@media (max-width:520px){.hn-stack{right:10px;left:10px;bottom:10px;width:auto}}' +
    '@media (prefers-reduced-motion:reduce){.hn-toast,.hn-toast.hn-out{animation:none;opacity:1;transform:none}.hn-p{animation:none;display:none}}';
    var st = d.createElement("style");
    st.id = STYLE_ID; st.textContent = css;
    (d.head || d.documentElement).appendChild(st);
  }

  function stackEl() {
    var s = d.getElementById(STACK_ID);
    if (!s) { s = d.createElement("div"); s.id = STACK_ID; s.className = "hn-stack";
      s.setAttribute("aria-live", "polite"); s.setAttribute("aria-atomic", "false");
      d.body.appendChild(s); }
    return s;
  }

  function beep() {
    if (!cfg.sound) return;
    try {
      var AC = w.AudioContext || w.webkitAudioContext; if (!AC) return;
      var ctx = new AC(), o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
      o.start(); o.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  }

  function dismiss(el) {
    if (!el || el.__gone) return; el.__gone = true;
    el.classList.add("hn-out");
    w.setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
  }

  function nowHM() {
    var n = new Date();
    return ("0" + n.getHours()).slice(-2) + ":" + ("0" + n.getMinutes()).slice(-2);
  }

  function fireNative(type, o) {
    if (!("Notification" in w)) return;
    if (cfg.nativeWhenHidden && d.visibilityState !== "hidden") return; // التاب مرئي → يكفي الـ toast
    if (Notification.permission !== "granted") return;
    try {
      var n = new Notification("نظام ادارة الصيانة والمشتريات — " + (KICKERS[type] || ""), {
        body: (o.title || "") + (o.body ? "\n" + o.body : ""),
        tag: o.code || undefined,
        renotify: false
      });
      if (typeof o.onClick === "function") {
        n.onclick = function () { w.focus(); try { o.onClick(); } catch (e) {} n.close(); };
      }
    } catch (e) {}
  }

  /**
   * push — إظهار إشعار
   * @param {Object} o
   *   type    : 'ticket' | 'po' | 'urgent'
   *   title   : العنوان ( سطر واحد )
   *   body    : الوصف ( سطران )
   *   code    : رمز مثل TKT-2041 / PO-0873
   *   sticky  : true = لا يختفي تلقائياً ( يُفرض تلقائياً على urgent )
   *   onClick : دالة تُنفّذ عند النقر ( مثلاً فتح البلاغ )
   */
  function push(o) {
    o = o || {};
    var type = ICONS[o.type] ? o.type : "ticket";
    var col = cfg.colors[type] || cfg.colors.ticket;
    var sticky = o.sticky || type === "urgent";
    var dur = sticky ? 0 : cfg.duration;

    injectStyle();
    var stack = stackEl();

    var el = d.createElement("div");
    el.className = "hn-toast";
    el.style.setProperty("--hn-accent", col.accent);
    el.style.setProperty("--hn-tint", col.tint);
    if (dur) el.style.setProperty("--hn-dur", (dur / 1000) + "s");
    el.setAttribute("role", "alert");

    el.innerHTML =
      '<div class="hn-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONS[type] + '</svg></div>' +
      '<div class="hn-b">' +
        '<div class="hn-k">' + esc(KICKERS[type]) + '</div>' +
        '<div class="hn-t">' + esc(o.title || "") + '</div>' +
        (o.body ? '<div class="hn-x">' + esc(o.body) + '</div>' : '') +
        '<div class="hn-m">' + (o.code ? '<span>' + esc(o.code) + '</span><span class="hn-dot"></span>' : '') + '<span>' + nowHM() + '</span></div>' +
      '</div>' +
      '<button class="hn-c" aria-label="إغلاق"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
      (dur ? '<div class="hn-p"></div>' : '');

    el.querySelector(".hn-c").addEventListener("click", function (e) { e.stopPropagation(); dismiss(el); });
    if (typeof o.onClick === "function") {
      el.addEventListener("click", function () { try { o.onClick(); } catch (err) {} dismiss(el); });
    }

    stack.appendChild(el);
    while (stack.children.length > cfg.maxVisible) dismiss(stack.children[0]);

    if (dur) {
      var remain = dur, last = Date.now();
      var timer = w.setInterval(function () {
        if (el.matches(":hover")) { last = Date.now(); return; } // إيقاف مع تعليق الـ CSS
        var t = Date.now(); remain -= (t - last); last = t;
        if (remain <= 0) { w.clearInterval(timer); dismiss(el); }
      }, 120);
    }

    beep();
    fireNative(type, o);
    return el;
  }

  function requestPermission() {
    if (!("Notification" in w)) return Promise.resolve("unsupported");
    if (Notification.permission !== "default") return Promise.resolve(Notification.permission);
    return Notification.requestPermission();
  }

  function permission() {
    return ("Notification" in w) ? Notification.permission : "unsupported";
  }

  function init(opts) {
    opts = opts || {};
    for (var k in opts) if (opts.hasOwnProperty(k)) {
      if (k === "colors" && opts.colors) {
        for (var c in opts.colors) if (opts.colors.hasOwnProperty(c)) cfg.colors[c] = opts.colors[c];
      } else { cfg[k] = opts[k]; }
    }
    injectStyle();
    return w.HailNotify;
  }

  function clearAll() {
    var s = d.getElementById(STACK_ID); if (!s) return;
    Array.prototype.slice.call(s.children).forEach(dismiss);
  }

  w.HailNotify = {
    version: VERSION,
    init: init,
    push: push,
    requestPermission: requestPermission,
    permission: permission,
    clearAll: clearAll,
    config: cfg
  };
})(window, document);
