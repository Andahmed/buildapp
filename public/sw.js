// Service Worker — PWA كود ذكي
// الاستراتيجية: static assets cache-first، الصفحات network-first، الـ API دايماً شبكة (البث المباشر ميتخزنش)
const CACHE = "cod-dhaki-v1";
const STATIC_ASSETS = ["/", "/logo.svg", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(STATIC_ASSETS).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  // API: شبكة دايماً — بما فيها SSE (streaming) اللي مينفعش يتخزن
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.method !== "GET") return;

  // static assets: cache-first
  if (url.pathname.startsWith("/_next/static") || /\.(png|svg|ico|webp|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((hit) => hit || fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return res;
      }))
    );
    return;
  }

  // الصفحات: network-first مع احتياطي الكاش لو المستخدم أوفلاين
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match("/")))
  );
});
