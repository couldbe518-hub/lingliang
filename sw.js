/* 灵粮读经 Service Worker：缓存应用外壳与内容文件；经文首次读取后保存，供离线使用。子目录应用（piano、stretch、chenguang、yue）不经过此处。 */
const VER="lingliang-v1";
const SHELL=["./","./index.html","./content.json","./hymns.json","./refs.json","./manifest.webmanifest","./icon.png","./icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(VER).then(c=>Promise.all(SHELL.map(u=>c.add(u).catch(()=>null)))).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("lingliang-")&&k!==VER&&k!=="lingliang-data").map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(e.request.method!=="GET"||u.origin!==location.origin)return;
 const base=new URL("./",location.href).pathname;const rel=u.pathname.startsWith(base)?u.pathname.slice(base.length):null;if(rel===null||/^(piano|stretch|chenguang|meadow|huoshui|yue)\//.test(rel))return;
 if(/^data\/\d\d\.json$/.test(rel)){e.respondWith(caches.open("lingliang-data").then(async c=>{const hit=await c.match(e.request);if(hit)return hit;const r=await fetch(e.request);if(r.ok)c.put(e.request,r.clone());return r}));return}
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const cp=r.clone();caches.open(VER).then(c=>c.put(e.request,cp))}return r}).catch(()=>caches.match(e.request).then(h=>h||(e.request.mode==="navigate"?caches.match("./index.html"):undefined))))});
