"""从根目录的灵粮读经（Grace 版）生成给别人的副本，只改称呼。

用法：python3 tools/make_variant.py yue Yue
生成 <目录>/index.html、<目录>/sw.js、<目录>/manifest.webmanifest。
经文、内容、语音包继续用根目录的文件（../），不复制。
Grace 版以后更新，重跑本脚本即可同步。
"""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
folder, name = sys.argv[1], sys.argv[2]
out = ROOT / folder
out.mkdir(exist_ok=True)

html = (ROOT / "index.html").read_text(encoding="utf-8")

def sub(pattern, repl, count_expected):
    global html
    html, n = re.subn(pattern, repl, html)
    if n != count_expected:
        sys.exit(f"替换 {pattern!r} 期望 {count_expected} 处，实际 {n} 处；Grace 版结构变了，先核对再生成")

sub(r"\}，Grace</h1>", "}，" + name + "</h1>", 1)                     # 首页问候
sub(r'const KEY="lingliang\.v1"', f'const KEY="lingliang.{folder}.v1"', 1)  # 本机存储键，与 Grace 版分开
sub(r'fetch\("content\.json"\)', 'fetch("../content.json")', 1)
sub(r'fetch\("hymns\.json"\)', 'fetch("../hymns.json")', 1)
sub(r'fetch\("refs\.json"\)', 'fetch("../refs.json")', 1)
sub(r'fetch\("voice/manifest\.json"\)', 'fetch("../voice/manifest.json")', 1)
sub(r'a\.src="voice/"', 'a.src="../voice/"', 1)
sub(r'fetch\("data/"', 'fetch("../data/"', 1)
sub(r'new URL\("data/"', 'new URL("../data/"', 1)
sub(r'href="icon\.png"', 'href="../icon.png"', 1)
(out / "index.html").write_text(html, encoding="utf-8")

man = json.loads((ROOT / "manifest.webmanifest").read_text(encoding="utf-8"))
for ic in man.get("icons", []):
    ic["src"] = "../" + ic["src"]
(out / "manifest.webmanifest").write_text(json.dumps(man, ensure_ascii=False), encoding="utf-8")

sw = f'''/* 灵粮读经（{name} 版）Service Worker：由 tools/make_variant.py 生成。外壳缓存与 Grace 版分开；经文数据共用 lingliang-data 缓存。 */
const VER="{folder}-lingliang-v1";
const SHELL=["./","./index.html","./manifest.webmanifest","../content.json","../hymns.json","../refs.json","../icon.png","../icon-512.png"];
self.addEventListener("install",e=>{{e.waitUntil(caches.open(VER).then(c=>Promise.all(SHELL.map(u=>c.add(u).catch(()=>null)))).then(()=>self.skipWaiting()))}});
self.addEventListener("activate",e=>{{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("{folder}-lingliang-")&&k!==VER).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))}});
self.addEventListener("fetch",e=>{{const u=new URL(e.request.url);if(e.request.method!=="GET"||u.origin!==location.origin)return;
 const base=new URL("../",location.href).pathname;const rel=u.pathname.startsWith(base)?u.pathname.slice(base.length):null;if(rel===null||/^(piano|stretch|chenguang|meadow|huoshui)\\//.test(rel))return;
 if(/^data\\/\\d\\d\\.json$/.test(rel)){{e.respondWith(caches.open("lingliang-data").then(async c=>{{const hit=await c.match(e.request);if(hit)return hit;const r=await fetch(e.request);if(r.ok)c.put(e.request,r.clone());return r}}));return}}
 e.respondWith(fetch(e.request).then(r=>{{if(r.ok){{const cp=r.clone();caches.open(VER).then(c=>c.put(e.request,cp))}}return r}}).catch(()=>caches.match(e.request).then(h=>h||(e.request.mode==="navigate"?caches.match("./index.html"):undefined))))}});
'''
(out / "sw.js").write_text(sw, encoding="utf-8")
print("生成完成：", out)
