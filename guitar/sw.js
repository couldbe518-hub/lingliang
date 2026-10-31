/* Natalie 吉他 Service Worker：联网时取最新内容，断网时用缓存，保证离线也能打开练习 */
const VER = "natalie-guitar-v1";
const SHELL = ["./", "./index.html", "./guitar.js", "./data.js", "./app.js", "./manifest.webmanifest", "./icon.png", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VER).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER && k.startsWith("natalie-guitar")).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(VER).then(c => c.put(e.request, cp)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(h => h || caches.match("./index.html"))));
});
