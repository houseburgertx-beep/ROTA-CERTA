const CACHE="rota-certa-v1";
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(["/"]))));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener("fetch",event=>{if(event.request.method!=="GET"||!event.request.url.startsWith(self.location.origin))return;event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then(r=>r||caches.match("/"))))});
