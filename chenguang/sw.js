/* 晨光 Service Worker：缓存应用外壳；经文文件首次读取后保存，供离线使用 */
const VER="chenguang-v3";
const SHELL=["./","./index.html","./app.js","./books.js","./manifest.webmanifest","./icon.png","./icon-192.png","./icon-512.png","./icon-maskable.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(VER).then(c=>Promise.all(SHELL.map(u=>c.add(u).catch(()=>null)))).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VER&&k!=="chenguang-data"&&k.startsWith("chenguang")).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(e.request.method!=="GET")return;
 if(/\/data\/\d\d\.json$/.test(u.pathname)){e.respondWith(caches.open("chenguang-data").then(async c=>{const hit=await c.match(e.request);if(hit)return hit;const r=await fetch(e.request);if(r.ok)c.put(e.request,r.clone());return r}));return}
 if(u.origin===location.origin){e.respondWith(fetch(e.request).then(r=>{if(r.ok){const cp=r.clone();caches.open(VER).then(c=>c.put(e.request,cp))}return r}).catch(()=>caches.match(e.request).then(h=>h||caches.match("./index.html"))));return}
 if(/fonts\.(googleapis|gstatic)\.com/.test(u.host)){e.respondWith(caches.open("chenguang-fonts").then(async c=>{const hit=await c.match(e.request);if(hit)return hit;try{const r=await fetch(e.request);if(r.ok)c.put(e.request,r.clone());return r}catch(err){return new Response("",{status:504})}}))}});
self.addEventListener("notificationclick",e=>{e.notification.close();e.waitUntil(self.clients.matchAll({type:"window"}).then(cs=>{if(cs.length)return cs[0].focus();return self.clients.openWindow("./")}))});
