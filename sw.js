// ══ Hail Service Worker — v18.9bn ══
// استراتيجية: Cache-First للملف الرئيسي، Network-First للـ Firebase
// يُحسّن وقت التحميل على الشبكات البطيئة داخل المباني

const CACHE_NAME = 'hail-v18-9bn';

// الموارد الثابتة التي تُخزَّن عند التثبيت
const STATIC_ASSETS = [
  './',
  './index.html',
  './logo.png',
];

// مصادر لا تُخزَّن أبداً (Firebase + CDN تتكفل بها)
const NO_CACHE_PATTERNS = [
  /firestore\.googleapis\.com/,
  /firebase\.googleapis\.com/,
  /identitytoolkit\.googleapis\.com/,
  /googleapis\.com/,
  /gstatic\.com\/firebasejs/,
  /cdnjs\.cloudflare\.com/,
  /cdn\.jsdelivr\.net/,
];

// ── التثبيت: تخزين الموارد الثابتة ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {/* تجاهل أخطاء التثبيت */});
    })
  );
  self.skipWaiting();
});

// ── التفعيل: حذف الكاشات القديمة ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── الاعتراض: Cache-First للموارد الثابتة ──
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // تجاوز Firebase وكل API خارجي
  if (NO_CACHE_PATTERNS.some(p => p.test(url))) return;
  // تجاوز POST وغير GET
  if (event.request.method !== 'GET') return;
  // تجاوز chrome-extension وغيرها
  if (!url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // أعد النسخة المخزنة فوراً + حدّث في الخلفية
        fetch(event.request).then(fresh => {
          if (fresh && fresh.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, fresh));
          }
        }).catch(() => {});
        return cached;
      }
      // لا يوجد في الكاش — اجلب من الشبكة وخزّن
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
        return response;
      }).catch(() => cached || new Response('Offline', { status: 503 }));
    })
  );
});
