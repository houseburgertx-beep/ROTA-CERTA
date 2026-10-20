const CACHE = "rota-certa-v7";
const CORE_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/logo.svg",
  "/logo.png",
  "/icon-192.png",
  "/icon-512.png",
  "/notification.wav"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE_ASSETS).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  const isNavigation = event.request.mode === "navigate" ||
    event.request.headers.get("accept")?.includes("text/html") ||
    event.request.url.endsWith("/index.html") ||
    event.request.url === self.location.origin + "/";

  // Para navegação/HTML: SEMPRE REDE PRIMEIRO para evitar servir hashes desatualizados de JS
  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(async () => {
          // Se estiver offline, recupera o index.html salvo em cache
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const fallback = await caches.match("/index.html");
          if (fallback) return fallback;
          return caches.match("/");
        })
    );
    return;
  }

  // Para assets estáticos imutáveis (com hash em /assets/): Cache primeiro com fallback para rede
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      });
    })
  );
});
