/* 灵粮读经（Yue 版）Service Worker：由 tools/make_variant.py 生成。外壳缓存与 Grace 版分开；经文数据共用 lingliang-data 缓存。 */
const VER="yue-lingliang-v1";
const SHELL=["./","./index.html","./manifest.webmanifest","../content.json","../hymns.json","../refs.json","../icon.png","../icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(VER).then(c=>Promise.all(SHELL.map(u=>c.add(u).catch(()=>null)))).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("yue-lingliang-")&&k!==VER).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(e.request.method!=="GET"||u.origin!==location.origin)return;
 const base=new URL("../",location.href).pathname;const rel=u.pathname.startsWith(base)?u.pathname.slice(base.length):null;if(rel===null||/^(piano|stretch|chenguang|meadow|huoshui)\//.test(rel))return;
 if(/^data\/\d\d\.json$/.test(rel)){e.respondWith(caches.open("lingliang-data").then(async c=>{const hit=await c.match(e.request);if(hit)return hit;const r=await fetch(e.request);if(r.ok)c.put(e.request,r.clone());return r}));return}
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const cp=r.clone();caches.open(VER).then(c=>c.put(e.request,cp))}return r}).catch(()=>caches.match(e.request).then(h=>h||(e.request.mode==="navigate"?caches.match("./index.html"):undefined))))});
