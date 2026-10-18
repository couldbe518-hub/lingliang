/* 晨光 — 单页应用。所有个人数据保存在本机 IndexedDB，不上传。 */
"use strict";
const APP_VER="1.0.0";
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
const pad2=n=>String(n).padStart(2,"0");
function dstr(d=new Date()){return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate())}
function today(){return dstr()}
function addDays(s,n){const [y,m,d]=s.split("-").map(Number);return dstr(new Date(y,m-1,d+n))}
function daysBetween(a,b){const [y1,m1,d1]=a.split("-").map(Number),[y2,m2,d2]=b.split("-").map(Number);return Math.round((Date.UTC(y2,m2-1,d2)-Date.UTC(y1,m1-1,d1))/864e5)}
function wday(s){const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d).getDay()}
const WD="日一二三四五六";
function fmtDate(s,withW){if(!s)return"";const [y,m,d]=s.split("-").map(Number);const cur=new Date().getFullYear();return (y!==cur?y+"年":"")+m+"月"+d+"日"+(withW?" 周"+WD[wday(s)]:"")}
function fmtTs(ts){const d=new Date(ts);return dstr(d)+" "+pad2(d.getHours())+":"+pad2(d.getMinutes())}
function uid(p){return p+":"+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function toast(t){const el=document.createElement("div");el.className="toast";el.textContent=t;document.body.appendChild(el);setTimeout(()=>el.remove(),2200)}
function download(name,text,mime){const b=new Blob([text],{type:mime||"application/octet-stream"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500)}
async function shareText(text,title){if(navigator.share){try{await navigator.share({title:title||"晨光",text});return}catch(e){if(e&&e.name==="AbortError")return}}copyText(text)}
function copyText(t){try{navigator.clipboard.writeText(t).then(()=>toast("已复制"),()=>fallbackCopy(t))}catch(e){fallbackCopy(t)}}
function fallbackCopy(t){openSheet(`<h3>长按选择并复制</h3><textarea id="cpy" readonly style="min-height:9rem">${esc(t)}</textarea>`);setTimeout(()=>{const a=$("#cpy");if(a){a.focus();a.select()}},50)}
const isCJK=s=>/[㐀-鿿]/.test(s);
const cleanZh=t=>String(t||"").replace(/〔[^〕]*〕/g,"").replace(/\s+/g,"");
const fmtZh=t=>esc(t).replace(/〔([^〕]*)〕/g,'<span class="fn">〔$1〕</span>');
const isMerged=t=>/^并于上节/.test(t||"");
const key=(b,c,v)=>(b+1)+":"+c+(v?":"+v:"");
const refZh=(b,c,v)=>BOOKS[b][1]+c+(v?":"+v:"");
const refEn=(b,c,v)=>BOOKS[b][2]+" "+c+(v?":"+v:"");
function parseKey(k){const p=k.split(":").map(Number);return {b:p[0]-1,c:p[1],v:p[2]||null}}
function parseRef(s){s=String(s||"").trim().replace(/：/g,":").replace(/章\s*/,":").replace(/节$/,"").replace(/:$/,"").replace(/\s+/g," ");const m=s.match(/^(.+?)\s*(\d+)(?::(\d+))?$/);if(!m)return null;const name=m[1].replace(/\s/g,"").toLowerCase();const b=BOOKS.findIndex(B=>[B[0],B[1],B[2],B[3]].some(n=>n.replace(/\s/g,"").toLowerCase()===name));if(b<0)return null;const c=+m[2];if(c<1||c>BOOKS[b][4])return null;return {b,c,v:m[3]?+m[3]:null}}

/* ---------- 图标 ---------- */
const I={
 today:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20c0-7 4-13 12-15-1 8-5 13-12 15z"/><path d="M4 20c3-5 6-8 9-10"/></svg>',
 bible:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h6a2 2 0 0 1 2 2v14a1.5 1.5 0 0 0-2-1H4z"/><path d="M20 4h-6a2 2 0 0 0-2 2v14a1.5 1.5 0 0 1 2-1h6z"/></svg>',
 plan:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M8.5 15.5l2.5 2.5 4.5-5"/></svg>',
 devo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20l1-4L16 5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M14 7l3 3M4 20h16"/></svg>',
 study:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M8 13h8M8 16h5"/></svg>',
 gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
 back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg>',
 fwd:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>',
 search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
 play:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>',
 pause:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
 stop:'<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
 next:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 4l10 8-10 8zM17 4h2v16h-2z"/></svg>',
 tick:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5 9-10"/></svg>',
 star:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>',
 starO:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>',
 note:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4M8 9h8M8 13h5"/></svg>',
 copy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
 share:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
 speaker:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
 trans:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 5h10M8 3v2M5 9c1.5 4 4 6.5 7 8M11 9c-1 3.5-4 6.5-7 8"/><path d="M13 21l3.5-9 3.5 9M14.3 18h4.4"/></svg>',
 hl:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h7"/><path d="M9 17l-3-3L15 5l3 3z"/><path d="M6 14l-1.5 3.5L8 16"/></svg>',
 plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>',
 x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>',
 pray:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3c-3 4-3 8 0 11 3-3 3-7 0-11z"/><path d="M12 14v7M7 21h10M7 11c1 3 3 4 5 4s4-1 5-4"/></svg>',
 heart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
 book:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2z"/><path d="M5 19a2 2 0 0 1 2-2h12"/></svg>',
 people:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5a5 5 0 0 1 6 5"/></svg>',
 trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>',
 edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20l1-4L16 5a2.1 2.1 0 0 1 3 3L8 19z"/></svg>',
 lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
 down:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12M8 11l4 4 4-4"/><path d="M5 19h14"/></svg>',
 aa:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 19l5-14 5 14M5 14h6M15 19l3.5-9 3.5 9M16.2 16h4.6"/></svg>',
 list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
 cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
 back2:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 14l-4-4 4-4"/><path d="M5 10h9a5 5 0 0 1 0 10h-3"/></svg>'
};

/* ---------- 本机数据库 ---------- */
const DB={_db:null,
 open(){return new Promise((res,rej)=>{const r=indexedDB.open("chenguang",1);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains("kv"))db.createObjectStore("kv",{keyPath:"k"});if(!db.objectStoreNames.contains("docs")){const d=db.createObjectStore("docs",{keyPath:"id"});d.createIndex("type","type")}};r.onsuccess=()=>{DB._db=r.result;res()};r.onerror=()=>rej(r.error)})},
 st(store,mode){return DB._db.transaction(store,mode||"readonly").objectStore(store)},
 req(r){return new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})},
 get(store,k){return DB.req(DB.st(store).get(k))},
 put(store,v){return DB.req(DB.st(store,"readwrite").put(v))},
 del(store,k){return DB.req(DB.st(store,"readwrite").delete(k))},
 all(store){return DB.req(DB.st(store).getAll())},
 byType(t){return DB.req(DB.st("docs").index("type").getAll(t))},
 clear(store){return DB.req(DB.st(store,"readwrite").clear())}
};
async function kvGet(k,def){const r=await DB.get("kv",k);return r?r.v:def}
async function kvSet(k,v){return DB.put("kv",{k,v})}
async function saveDoc(d){d.updated=Date.now();if(!d.created)d.created=d.updated;await DB.put("docs",d);return d}

/* ---------- 状态 ---------- */
const DEF={name:"",mode:"both",en:"bsb",fs:1.3,theme:"auto",rate:1,voiceZh:"",voiceEn:"",ttsLang:"follow",autoNext:true,remindOn:false,remindTime:"07:00",lockMin:5,last:{b:42,c:1},tab:"today",lineH:1.9};
let S={...DEF}, P=null, READ={}, MARKS={}, PIN=null;
const V={tab:"today",bview:"read",pickB:null,sub:{devo:"journal",study:"all",plan:"today"},q:"",calM:null,filters:{}};
const R={b:42,c:1,target:null};
async function saveS(){await kvSet("settings",S)}
async function savePlan(){await kvSet("plan",P)}
async function saveRead(){await kvSet("read",READ)}
function applyPrefs(){document.documentElement.style.setProperty("--fs",S.fs+"rem");if(S.theme==="auto")document.documentElement.removeAttribute("data-theme");else document.documentElement.setAttribute("data-theme",S.theme)}

/* ---------- 经文数据 ---------- */
const BK={};
async function book(b){if(BK[b])return BK[b];const r=await fetch("../data/"+pad2(b+1)+".json");if(!r.ok)throw new Error("经文文件读取失败（离线时需先下载全本）");BK[b]=await r.json();return BK[b]}
async function loadAll(prog){const out=[];for(let i=0;i<66;i++){out.push(await book(i));if(prog)prog(i+1)}return out}
async function verseText(b,c,v,lang){const d=await book(b);const arr=lang==="zh"?d.zh:d[S.en];return (arr[c-1]||[])[v-1]||""}

/* ---------- 面板与事件 ---------- */
function openSheet(html,cls){closePop();const o=$("#overlay");o.innerHTML=`<div class="scrim" data-act="scrim"><div class="sheet ${cls||""}" role="dialog"><div class="handle"></div>${html}</div></div>`;document.body.style.overflow="hidden"}
function closeSheet(){$("#overlay").innerHTML="";document.body.style.overflow=""}
function confirmBox(msg,okLabel){return new Promise(res=>{openSheet(`<h3>${esc(msg)}</h3><div class="row" style="margin-top:14px"><button class="btn grow" data-act="cfNo">取消</button><button class="btn clay grow" data-act="cfYes">${esc(okLabel||"确定")}</button></div>`);ACT.cfNo=()=>{closeSheet();res(false)};ACT.cfYes=()=>{closeSheet();res(true)}})}
function promptBox(title,def,type){return new Promise(res=>{openSheet(`<h3>${esc(title)}</h3><input id="pb" type="${type||"text"}" value="${esc(def||"")}"><div class="row" style="margin-top:14px"><button class="btn grow" data-act="pbNo">取消</button><button class="btn primary grow" data-act="pbYes">确定</button></div>`);setTimeout(()=>$("#pb")&&$("#pb").focus(),60);ACT.pbNo=()=>{closeSheet();res(null)};ACT.pbYes=()=>{const v=$("#pb").value;closeSheet();res(v)}})}
const ACT={scrim(el,e){if(e.target===el)closeSheet()},close(){closeSheet()}};
document.addEventListener("click",e=>{const el=e.target.closest("[data-act]");if(!el)return;const f=ACT[el.dataset.act];if(f){f(el,e)}});
document.addEventListener("change",e=>{const el=e.target.closest("[data-chg]");if(!el)return;const f=ACT[el.dataset.chg];if(f)f(el,e)});
document.addEventListener("keydown",e=>{if(e.key==="Enter"){const el=e.target.closest("[data-enter]");if(el){e.preventDefault();const f=ACT[el.dataset.enter];if(f)f(el,e)}}});

/* ---------- 外壳 ---------- */
const TABS=[["today","今日",I.today],["bible","圣经",I.bible],["plan","计划",I.plan],["devo","灵修",I.devo],["study","资料",I.study]];
function renderTabs(){$("#tabs").innerHTML=TABS.map(t=>`<button data-act="tab" data-tab="${t[0]}" ${V.tab===t[0]?'aria-current="page"':""}>${t[2]}<span>${t[1]}</span></button>`).join("")}
ACT.tab=el=>{V.tab=el.dataset.tab;S.tab=V.tab;saveS();window.scrollTo(0,0);render()};
function topbar(title,sub,extra){return `<div class="topbar"><div class="t">${esc(title)}${sub?`<div class="sub">${esc(sub)}</div>`:""}</div>${extra||""}<button class="iconbtn" data-act="settings" aria-label="设置">${I.gear}</button></div>`}
function render(){renderTabs();const app=$("#app");const fn={today:renderToday,bible:renderBible,plan:renderPlan,devo:renderDevo,study:renderStudy}[V.tab];Promise.resolve(fn()).then(h=>{if(typeof h==="string")app.innerHTML=h;afterRender()}).catch(e=>{app.innerHTML=topbar("晨光")+`<div class="card clay">出错了：${esc(e.message||e)}</div>`})}
function afterRender(){if(R.target&&V.tab==="bible"&&V.bview==="read"){const el=document.getElementById("v-"+R.target);if(el){el.classList.add("target");setTimeout(()=>el.scrollIntoView({block:"center"}),80)}R.target=null}}

/* ======================================================
   读经计划
   P = {name, kind, start, dpw, days:[[[b,c],...],...], done:{"B:C":date}, paused, pauses:[[from,to]], created}
   ====================================================== */
function planSeq(kind,rg){const out=[];let bs=0,be=65,cs=1,ce=null;if(kind==="ot")be=38;else if(kind==="nt")bs=39;else if(kind==="custom"&&rg){bs=rg.b1;be=rg.b2;cs=rg.c1;ce=rg.c2}for(let b=bs;b<=be;b++){const from=b===bs?cs:1,to=b===be&&ce?ce:BOOKS[b][4];for(let c=from;c<=to;c++)out.push([b,c])}return out}
function splitDays(seq,opt){const n=seq.length,days=[];if(opt.perDay){for(let i=0;i<n;i+=opt.perDay)days.push(seq.slice(i,i+opt.perDay))}else{const D=Math.min(opt.days,n);for(let i=0;i<D;i++){const s=Math.round(i*n/D),e=Math.round((i+1)*n/D);if(e>s)days.push(seq.slice(s,e))}}return days}
function isReadingWeekday(date,dpw){const w=wday(date);if(dpw===5)return w>=1&&w<=5;if(dpw===6)return w!==0;return true}
function isPausedOn(date){if(!P)return false;return (P.pauses||[]).some(([f,t])=>date>=f&&(t===null||date<t))}
/* 从开始日起，返回 [{date,idx}] 直到 untilDate（含）；idx 为读经日序号 */
function schedule(untilDate){const out=[];if(!P)return out;let d=P.start,idx=0,guard=0;while(d<=untilDate&&guard++<4000){if(!isPausedOn(d)&&isReadingWeekday(d,P.dpw)){out.push({date:d,idx});idx++;if(idx>=P.days.length)break}d=addDays(d,1)}return out}
function dateOfIdx(target){let d=P.start,idx=0,guard=0;while(guard++<4000){if(!isPausedOn(d)&&isReadingWeekday(d,P.dpw)){if(idx===target)return d;idx++}d=addDays(d,1)}return null}
function planTotal(){return P?P.days.reduce((a,x)=>a+x.length,0):0}
function planDone(){return P?Object.keys(P.done).length:0}
function dayDone(chs){return chs.every(([b,c])=>P.done[key(b,c)])}
function todayState(){if(!P)return null;const t=today();const sch=schedule(t);const cur=sch.find(x=>x.date===t);const missed=sch.filter(x=>x.date<t&&!dayDone(P.days[x.idx]));const lastIdx=sch.length?sch[sch.length-1].idx:-1;const finished=planDone()>=planTotal();return {cur,missed,finished,sch,lastIdx,isRest:!cur&&!finished&&!P.paused&&t>=P.start}}
async function markChapter(b,c,on){const k=key(b,c);if(on){READ[k]=today();if(P&&P.days.some(d=>d.some(([x,y])=>x===b&&y===c)))P.done[k]=today()}else{if(P)delete P.done[k]}await saveRead();if(P)await savePlan()}
function chapterInPlan(b,c){return !!(P&&P.days.some(d=>d.some(([x,y])=>x===b&&y===c)))}
function streak(){if(!P)return 0;const sch=schedule(today());let n=0;for(let i=sch.length-1;i>=0;i--){const x=sch[i];if(dayDone(P.days[x.idx]))n++;else if(x.date===today())continue;else break}return n}
const PRESETS={all:{name:"一年读完整本圣经",kind:"all",dpw:7,days:365},nt:{name:"一年读完新约",kind:"nt",dpw:5,days:260},ot:{name:"一年读完旧约",kind:"ot",dpw:7,days:365}};


/* ---------- 问候与每日经文 ---------- */
const DAILY=[[18,23,1],[24,3,22],[24,3,23],[22,41,10],[49,4,6],[39,11,28],[18,46,1],[19,3,5],[44,8,28],[42,14,27],[18,118,24],[3,6,24],[18,121,1],[22,40,31],[59,5,7],[18,37,5],[5,1,9],[18,27,1],[39,6,34],[49,4,13],[57,13,8],[18,34,8],[18,90,14],[18,143,8],[18,5,3],[44,15,13],[18,103,2],[22,26,3],[42,16,33],[18,119,105],[39,5,16],[46,12,9],[18,16,11],[47,5,22],[48,2,8],[18,100,4],[39,28,20],[18,62,1],[22,43,2],[42,3,16],[18,91,1],[18,139,23],[22,30,15],[18,73,26],[49,4,7],[59,5,10],[18,42,11],[22,55,8],[39,7,7],[18,4,8]];
function greeting(){const h=new Date().getHours();const n=S.name?"，"+S.name:"";if(h<5)return ["夜深了"+n,"愿你安睡，明早再来。"];if(h<11)return ["早安"+n,"新的一天，先亲近神。"];if(h<14)return ["午安"+n,"忙碌中也有片刻安息。"];if(h<18)return ["下午好"+n,"愿你今天的脚步有主同行。"];if(h<22)return ["晚上好"+n,"回顾今天，数算恩典。"];return ["夜安"+n,"把今天交托，安心休息。"]}
async function dailyVerse(){const t=today();const [y,m,d]=t.split("-").map(Number);const doy=Math.round((Date.UTC(y,m-1,d)-Date.UTC(y,0,0))/864e5);const [b,c,v]=DAILY[(doy+y)%DAILY.length];try{let zh=cleanZh(await verseText(b,c,v,"zh")),en=await verseText(b,c,v,"en");if(zh.includes("」")&&!zh.includes("「"))zh=zh.replace(/」/g,"");if(zh.includes("「")&&!zh.includes("」"))zh=zh.replace(/「/g,"");if(/^[“]/.test(en)&&!/[”]/.test(en))en=en.replace(/^[“]/,"");if(/[”]$/.test(en)&&!/[“]/.test(en))en=en.replace(/[”]$/,"");return {b,c,v,zh,en}}catch(e){return null}}
/* ---------- 今日 ---------- */
function todoList(chs,withBox){return chs.map(([b,c])=>{const on=P&&P.done[key(b,c)];return `<div class="todo ${on?"done":""}">${withBox?`<button class="box ${on?"on":""}" data-act="toggleCh" data-b="${b}" data-c="${c}" aria-label="完成">${on?I.tick:""}</button>`:""}<button class="n" style="text-align:left" data-act="goCh" data-b="${b}" data-c="${c}">${esc(BOOKS[b][0])} ${c} 章</button><span class="muted small">${esc(BOOKS[b][2])} ${c}</span></div>`}).join("")}
async function renderToday(){const t=today();const st=todayState();const [gt,gs]=greeting();const dv=await dailyVerse();const greet=`<div class="card greet"><h2>${esc(gt)}</h2><div class="muted" style="margin-top:2px">${esc(gs)}</div>${dv?`<button class="dv" data-act="goCh" data-b="${dv.b}" data-c="${dv.c}" data-v="${dv.v}"><div class="eyebrow">今日经文</div>${S.mode!=="en"?`<div class="zh">${esc(dv.zh)}</div>`:""}${S.mode!=="zh"?`<div class="en">${esc(dv.en)}</div>`:""}<div class="ref" style="margin-top:6px">${esc(refZh(dv.b,dv.c,dv.v))} · ${esc(refEn(dv.b,dv.c,dv.v))}</div></button>`:""}</div>`;const jn=(await DB.byType("journal")).filter(x=>x.date===t);const cares=(await DB.byType("care")).filter(x=>x.status!=="answered");let hero="";
 if(!P){hero=`<div class="hero"><div class="eyebrow">${fmtDate(t,true)}</div><h2 style="margin-top:6px">还没有读经计划</h2><p class="small" style="opacity:.9">选一个一年计划，或自己设定进度，每天打开就能看到当天该读的经文。</p><button class="btn" data-act="tab" data-tab="plan">设定读经计划</button></div>`}
 else{const total=planTotal(),done=planDone(),pct=total?Math.round(done/total*100):0;let body="";
  if(P.paused)body=`<p class="small">计划已暂停。<button class="btn sm" data-act="resumePlan">继续计划</button></p>`;
  else if(st.finished)body=`<p>🎉 计划已全部读完，感谢神的带领！</p><button class="btn" data-act="tab" data-tab="plan">开始新的计划</button>`;
  else if(st.cur){const chs=P.days[st.cur.idx];body=`<div class="small" style="opacity:.9;margin-bottom:6px">第 ${st.cur.idx+1} 天 · 今日 ${chs.length} 章</div><div class="card" style="padding:4px 12px;color:var(--ink)">${todoList(chs,true)}</div>`}
  else if(t<P.start)body=`<p class="small">计划将于 ${fmtDate(P.start,true)} 开始。</p>`;
  else body=`<p class="small">今天是休息日，可以补读或自由阅读。</p>`;
  hero=`<div class="hero"><div class="row between"><div class="eyebrow">${fmtDate(t,true)}</div><span class="small" style="opacity:.9">连续 ${streak()} 天</span></div><h2 style="margin-top:4px">${esc(P.name)}</h2><div class="row between small" style="margin:8px 0 4px;opacity:.95"><span>已完成 ${done} / ${total} 章</span><b>${pct}%</b></div><div class="progress"><i style="width:${pct}%"></i></div><div style="margin-top:12px">${body}</div></div>`}
 const missed=st&&st.missed.length?`<div class="card sun"><div class="row between"><div><b>有 ${st.missed.length} 天未读完</b><div class="small muted">可以补读，进度照常计算</div></div><button class="btn sm" data-act="planSub" data-sub="catchup">去补读</button></div></div>`:"";
 const remind=S.remindOn&&!window.__remindShown&&st&&st.cur&&!dayDone(P.days[st.cur.idx])&&nowHM()>=S.remindTime?`<div class="card clay"><b>读经提醒</b><div class="small muted">今天的经文还没读完，花几分钟亲近神。</div></div>`:"";
 const last=S.last||{b:42,c:1};
 return topbar("晨光",fmtDate(t,true))+`<div class="stack">${greet}${hero}${missed}${remind}
 <div class="quick"><button data-act="newJournal">${I.devo}<span>写灵修</span></button><button data-act="newPrayer">${I.pray}<span>写祷告</span></button><button data-act="goCh" data-b="${last.b}" data-c="${last.c}">${I.book}<span>继续阅读<br><span class="tiny muted">${esc(refZh(last.b,last.c))}</span></span></button></div>
 ${jn.length?`<div class="card accent"><div class="eyebrow">今日灵修</div>${jn.map(j=>`<div style="margin-top:6px"><span class="ref">${esc(j.ref||"")}</span> ${esc((j.insight||j.light||j.apply||"").slice(0,80))}</div>`).join("")}<button class="btn sm ghost" data-act="devoSub" data-sub="journal" style="margin-top:6px">查看</button></div>`:""}
 ${cares.length?`<div class="card"><div class="row between"><div><b>代祷名单</b><div class="small muted">${cares.length} 项正在祷告或等候</div></div><button class="btn sm" data-act="devoSub" data-sub="care">打开</button></div></div>`:""}
 </div>`}
function nowHM(){const d=new Date();return pad2(d.getHours())+":"+pad2(d.getMinutes())}
ACT.goCh=el=>{R.b=+el.dataset.b;R.c=+el.dataset.c;R.target=el.dataset.v?+el.dataset.v:null;V.tab="bible";V.bview="read";S.last={b:R.b,c:R.c};saveS();closeSheet();window.scrollTo(0,0);render()};
ACT.toggleCh=async el=>{const b=+el.dataset.b,c=+el.dataset.c;const on=!(P&&P.done[key(b,c)]);await markChapter(b,c,on);if(on)toast("已记录：" +refZh(b,c));render()};
ACT.planSub=el=>{V.tab="plan";V.sub.plan=el.dataset.sub;render()};
ACT.devoSub=el=>{V.tab="devo";V.sub.devo=el.dataset.sub;render()};
ACT.resumePlan=async()=>{if(!P)return;P.paused=false;const last=P.pauses[P.pauses.length-1];if(last&&last[1]===null)last[1]=today();await savePlan();toast("计划已继续");render()};
ACT.pausePlan=async()=>{if(!P)return;P.paused=true;P.pauses=P.pauses||[];P.pauses.push([today(),null]);await savePlan();toast("计划已暂停，暂停期间不计天数");render()};

/* ---------- 计划页 ---------- */
async function renderPlan(){const sub=V.sub.plan||"today";const tabs=[["today","当前计划"],["catchup","补读"],["calendar","日历"],["history","读过的内容"]];const head=topbar("读经计划")+`<div class="subtabs">${tabs.map(t=>`<button data-act="planSub" data-sub="${t[0]}" aria-pressed="${sub===t[0]}">${t[1]}</button>`).join("")}</div>`;
 if(!P&&sub==="today")return head+planSetup();
 if(sub==="today")return head+planOverview();
 if(sub==="catchup")return head+planCatchup();
 if(sub==="calendar")return head+planCalendar();
 if(sub==="history")return head+planHistory();
 if(sub==="setup")return head+planSetup();
 return head}
function planSetup(){const t=today();return `<div class="stack">
 <div class="card accent"><h3>选择计划</h3><div class="stack" style="margin-top:10px">
  ${Object.entries(PRESETS).map(([k,p])=>`<label class="row" style="gap:10px"><input type="radio" name="pk" value="${k}" ${k==="all"?"checked":""} data-chg="pkChange"><div class="grow"><b>${p.name}</b><div class="small muted">${k==="all"?"1189 章，每天约 3 章":k==="nt"?"260 章，周一到周五每天 1 章，周末补读":"929 章，每天约 2–3 章"}</div></div></label>`).join("")}
  <label class="row" style="gap:10px"><input type="radio" name="pk" value="custom" data-chg="pkChange"><div class="grow"><b>自己设定</b><div class="small muted">选择范围、开始日期与每天章数</div></div></label>
 </div></div>
 <div class="card"><label class="f">开始日期</label><input type="date" id="pStart" value="${t}">
  <label class="f">每周读经天数</label><div class="seg" id="pDpw"><button data-act="segDpw" data-v="7" aria-pressed="true">每天</button><button data-act="segDpw" data-v="6">周一到周六</button><button data-act="segDpw" data-v="5">周一到周五</button></div>
  <div id="customBox" style="display:none">
   <label class="f">范围</label><select id="pScope" data-chg="scopeChange"><option value="all">整本圣经</option><option value="ot">旧约</option><option value="nt">新约</option><option value="range">指定书卷范围</option></select>
   <div id="rangeBox" style="display:none"><div class="row"><select id="pB1" class="grow">${BOOKS.map((b,i)=>`<option value="${i}">${b[0]}</option>`).join("")}</select><input id="pC1" type="number" min="1" value="1" style="width:80px" placeholder="章"></div><div class="row" style="margin-top:6px"><select id="pB2" class="grow">${BOOKS.map((b,i)=>`<option value="${i}" ${i===65?"selected":""}>${b[0]}</option>`).join("")}</select><input id="pC2" type="number" min="1" value="" style="width:80px" placeholder="章(末)"></div></div>
   <label class="f">进度</label><div class="row"><select id="pPace" class="grow"><option value="perDay">每天读几章</option><option value="days">共用多少天读完</option></select><input id="pN" type="number" min="1" value="1" style="width:90px"></div>
   <label class="f">计划名称</label><input id="pName" placeholder="例如：福音书三个月">
  </div>
  <div id="pPreview" class="small muted" style="margin-top:12px"></div>
  <button class="btn primary block" data-act="createPlan" style="margin-top:12px">开始这个计划</button>
 </div>
 ${P?`<button class="btn block" data-act="planSub" data-sub="today">返回当前计划</button>`:""}
 </div>`}
let setupDpw=7;
ACT.pkChange=el=>{const v=document.querySelector('input[name=pk]:checked').value;$("#customBox").style.display=v==="custom"?"block":"none";if(v!=="custom"){setupDpw=PRESETS[v].dpw;document.querySelectorAll("#pDpw button").forEach(b=>b.setAttribute("aria-pressed",String(+b.dataset.v===setupDpw)))}planPreview()};
ACT.scopeChange=()=>{$("#rangeBox").style.display=$("#pScope").value==="range"?"block":"none";planPreview()};
ACT.segDpw=el=>{setupDpw=+el.dataset.v;document.querySelectorAll("#pDpw button").forEach(b=>b.setAttribute("aria-pressed",String(b===el)));planPreview()};
document.addEventListener("input",e=>{if(e.target.closest("#pStart,#pN,#pPace,#pB1,#pB2,#pC1,#pC2"))planPreview()});
function buildFromForm(){const k=document.querySelector('input[name=pk]:checked').value;const start=$("#pStart").value||today();let p;
 if(k!=="custom"){const pr=PRESETS[k];const seq=planSeq(pr.kind);p={name:pr.name,kind:pr.kind,start,dpw:setupDpw,days:splitDays(seq,{days:pr.days})}}
 else{const sc=$("#pScope").value;let seq;if(sc==="range"){const b1=+$("#pB1").value,b2=+$("#pB2").value;if(b2<b1)throw new Error("结束书卷不能在开始书卷之前");const c1=Math.max(1,+$("#pC1").value||1),c2=+$("#pC2").value||BOOKS[b2][4];seq=planSeq("custom",{b1,b2,c1:Math.min(c1,BOOKS[b1][4]),c2:Math.min(c2,BOOKS[b2][4])})}else seq=planSeq(sc);if(!seq.length)throw new Error("范围无效");const n=Math.max(1,+$("#pN").value||1);const pace=$("#pPace").value;const days=pace==="perDay"?splitDays(seq,{perDay:n}):splitDays(seq,{days:n});const name=$("#pName").value.trim()||(sc==="range"?`${refZh(seq[0][0],seq[0][1])}–${refZh(seq[seq.length-1][0],seq[seq.length-1][1])}`:{all:"整本圣经",ot:"旧约",nt:"新约"}[sc]+"自定计划");p={name,kind:"custom",start,dpw:setupDpw,days}}
 p.done={};p.paused=false;p.pauses=[];p.created=Date.now();p.id=uid("plan");return p}
function planPreview(){const el=$("#pPreview");if(!el)return;try{const p=buildFromForm();const total=p.days.reduce((a,x)=>a+x.length,0);const save=P;P=p;const end=dateOfIdx(p.days.length-1);P=save;el.textContent=`共 ${total} 章，分 ${p.days.length} 个读经日，每天 ${Math.min(...p.days.map(d=>d.length))}–${Math.max(...p.days.map(d=>d.length))} 章，预计 ${fmtDate(end)} 读完。`}catch(e){el.textContent=e.message}}
ACT.createPlan=async()=>{try{const p=buildFromForm();if(P){const ok=await confirmBox("开始新计划会把当前计划移入历史记录（已读章节仍保留）。确定吗？","开始新计划");if(!ok)return;await archivePlan()}P=p;await savePlan();V.sub.plan="today";toast("计划已建立");render()}catch(e){toast(e.message)}};
async function archivePlan(){if(!P)return;const h=await kvGet("planHistory",[]);h.unshift({...P,archived:today()});await kvSet("planHistory",h.slice(0,20));P=null;await savePlan()}
ACT.resetPlan=async()=>{const ok=await confirmBox("重新设置会结束当前计划（移入历史，已读章节保留）。","结束并重设");if(!ok)return;await archivePlan();V.sub.plan="setup";render()};
function planOverview(){const st=todayState();const total=planTotal(),done=planDone(),pct=total?Math.round(done/total*100):0;const end=dateOfIdx(P.days.length-1);let todayBox="";
 if(P.paused)todayBox=`<div class="card sun"><b>计划已暂停</b><div class="small muted">自 ${fmtDate(P.pauses[P.pauses.length-1][0])} 起暂停，暂停的日子不计入进度。</div><button class="btn primary" style="margin-top:8px" data-act="resumePlan">继续计划</button></div>`;
 else if(st.finished)todayBox=`<div class="card accent"><b>🎉 这个计划已经全部读完</b></div>`;
 else if(st.cur)todayBox=`<div class="card accent"><div class="row between"><h3>今日 · 第 ${st.cur.idx+1} 天</h3><span class="small muted">${fmtDate(today(),true)}</span></div>${todoList(P.days[st.cur.idx],true)}</div>`;
 else todayBox=`<div class="card"><b>${today()<P.start?"计划尚未开始":"今天是休息日"}</b><div class="small muted">${today()<P.start?"开始日期 "+fmtDate(P.start,true):"可以补读或自由阅读"}</div></div>`;
 const nextIdx=st.cur?st.cur.idx+1:st.lastIdx+1;const upcoming=P.days.slice(nextIdx,nextIdx+3).map((chs,i)=>{const d=dateOfIdx(nextIdx+i);return `<div class="todo"><span class="n small">${d?fmtDate(d,true):""}</span><span class="small muted">${chs.map(([b,c])=>refZh(b,c)).join("、")}</span></div>`}).join("");
 return `<div class="stack"><div class="card"><div class="eyebrow">当前计划</div><h2 style="margin-top:4px">${esc(P.name)}</h2><div class="small muted">${fmtDate(P.start)} 开始 · ${P.dpw===7?"每天":P.dpw===6?"周一到周六":"周一到周五"} · 预计 ${fmtDate(end)} 完成</div><div class="row between small" style="margin:10px 0 4px"><span>已完成 ${done} / ${total} 章</span><b>${pct}%</b></div><div class="progress"><i style="width:${pct}%"></i></div><div class="row" style="margin-top:12px">${P.paused?"":`<button class="btn sm" data-act="pausePlan">暂停计划</button>`}<button class="btn sm" data-act="resetPlan">重新设置</button><button class="btn sm" data-act="planSub" data-sub="setup">换一个计划</button></div></div>
 ${todayBox}
 ${st.missed.length?`<div class="card sun"><div class="row between"><b>未读完 ${st.missed.length} 天</b><button class="btn sm" data-act="planSub" data-sub="catchup">补读</button></div></div>`:""}
 ${upcoming?`<div class="card"><h3>接下来</h3>${upcoming}</div>`:""}
 <div class="card"><div class="row between"><h3>读经提醒</h3><button class="switch" role="switch" aria-checked="${S.remindOn}" data-act="toggleRemind"></button></div><div class="row" style="margin-top:8px"><input type="time" id="remindTime" value="${esc(S.remindTime)}" data-chg="remindTime" style="width:auto"><button class="btn sm" data-act="icsDownload">加到手机日历</button></div><div class="small muted" style="margin-top:6px">网页应用在关闭时无法自己响铃；最可靠的方法是把提醒加进手机日历（每天重复、带提醒）。打开应用时若过了提醒时间且今天未读完，首页会显示提醒。</div></div>
 </div>`}
function planCatchup(){if(!P)return `<div class="empty">还没有计划</div>`;const st=todayState();if(!st.missed.length)return `<div class="card accent"><b>没有需要补读的日子 👏</b></div>`;return `<div class="stack">${st.missed.map(x=>`<div class="card sun"><div class="row between"><b>第 ${x.idx+1} 天</b><span class="small muted">${fmtDate(x.date,true)}</span></div>${todoList(P.days[x.idx],true)}</div>`).join("")}</div>`}
function planCalendar(){const m=V.calM||today().slice(0,7);const [y,mo]=m.split("-").map(Number);const first=new Date(y,mo-1,1);const nDays=new Date(y,mo,0).getDate();const sch=P?schedule(addDays(m+"-"+pad2(nDays),0)):[];const map={};sch.forEach(x=>map[x.date]=x.idx);const t=today();let cells="";for(let i=0;i<first.getDay();i++)cells+="<div></div>";for(let d=1;d<=nDays;d++){const ds=m+"-"+pad2(d);let cls="d";if(P&&ds in map){const done=dayDone(P.days[map[ds]]);cls+=done?" done":ds<t?" miss":ds>t?" future":""}else if(P&&ds>=P.start&&!(ds in map))cls+=" rest";else cls+=" rest";if(ds===t)cls+=" today";cells+=`<div class="${cls}" title="${ds}">${d}</div>`}
 const prev=mo===1?(y-1)+"-12":y+"-"+pad2(mo-1),next=mo===12?(y+1)+"-01":y+"-"+pad2(mo+1);const monthReads=Object.entries(READ).filter(([k,v])=>v&&v.startsWith(m)).length;
 return `<div class="stack"><div class="card"><div class="row between"><button class="iconbtn" data-act="calM" data-m="${prev}">${I.back}</button><h3>${y} 年 ${mo} 月</h3><button class="iconbtn" data-act="calM" data-m="${next}">${I.fwd}</button></div><div class="cal" style="margin-top:10px">${"日一二三四五六".split("").map(w=>`<div class="h">${w}</div>`).join("")}${cells}</div><div class="row small muted" style="margin-top:10px;gap:12px"><span><i class="st answered">■</i> 已完成</span><span><i class="st" style="background:var(--clay-soft);color:var(--clay)">■</i> 未读完</span><span>本月读了 ${monthReads} 章</span></div></div></div>`}
ACT.calM=el=>{V.calM=el.dataset.m;render()};
ACT.toggleRemind=async()=>{S.remindOn=!S.remindOn;if(S.remindOn&&"Notification"in window&&Notification.permission==="default"){try{await Notification.requestPermission()}catch(e){}}await saveS();render()};
ACT.remindTime=async el=>{S.remindTime=el.value||"07:00";await saveS()};
ACT.icsDownload=()=>{const [h,m]=(S.remindTime||"07:00").split(":");const t=today().replace(/-/g,"");const dt=t+"T"+h+m+"00";const ics=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//chenguang//reading//CN","BEGIN:VEVENT","UID:chenguang-remind-"+Date.now()+"@local","DTSTAMP:"+new Date().toISOString().replace(/[-:]/g,"").slice(0,15)+"Z","DTSTART:"+dt,"DURATION:PT15M","RRULE:FREQ=DAILY","SUMMARY:读经时间","DESCRIPTION:打开晨光，读今天的经文。","BEGIN:VALARM","TRIGGER:PT0S","ACTION:DISPLAY","DESCRIPTION:读经时间","END:VALARM","END:VEVENT","END:VCALENDAR"].join("\r\n");download("chenguang-reminder.ics",ics,"text/calendar");toast("已生成日历文件，打开后选择添加到日历")};
function planHistory(){const entries=Object.entries(READ).filter(([k,v])=>v).sort((a,b)=>b[1]<a[1]?-1:b[1]>a[1]?1:0);const byDate={};entries.forEach(([k,d])=>{(byDate[d]=byDate[d]||[]).push(k)});const dates=Object.keys(byDate).sort().reverse().slice(0,60);const grid=BOOKS.map((B,b)=>{let n=0;for(let c=1;c<=B[4];c++)if(READ[key(b,c)])n++;return `<button data-act="histBook" data-b="${b}" class="${n===B[4]?"cur":n?"read":""}" title="${n}/${B[4]}">${esc(B[1])}</button>`}).join("");const total=entries.length;
 return `<div class="stack"><div class="card"><div class="row between"><h3>已读章节</h3><span class="small muted">${total} / 1189 章</span></div><div class="progress" style="margin:8px 0 12px"><i style="width:${Math.round(total/1189*100)}%"></i></div><div class="grid-books">${grid}</div><div class="small muted" style="margin-top:8px">绿色＝部分读过，深绿＝整卷读完；点书卷看各章。</div></div>
 ${V.histB!=null?`<div class="card accent"><h3>${esc(BOOKS[V.histB][0])}</h3><div class="grid-ch" style="margin-top:8px">${Array.from({length:BOOKS[V.histB][4]},(_,i)=>i+1).map(c=>`<button data-act="goCh" data-b="${V.histB}" data-c="${c}" class="${READ[key(V.histB,c)]?"read":""}" title="${READ[key(V.histB,c)]||""}">${c}</button>`).join("")}</div></div>`:""}
 <div class="card"><h3>按日期</h3>${dates.length?dates.map(d=>`<div class="todo"><span class="n small">${fmtDate(d,true)}</span><span class="small muted" style="text-align:right">${byDate[d].map(k=>{const r=parseKey(k);return `<button data-act="goCh" data-b="${r.b}" data-c="${r.c}">${refZh(r.b,r.c)}</button>`}).join("、")}</span></div>`).join(""):`<div class="empty">还没有读过的记录。读完一章后点「本章读完」。</div>`}</div></div>`}
ACT.histBook=el=>{V.histB=+el.dataset.b;render()};

/* ======================================================
   圣经阅读
   ====================================================== */
async function renderBible(){if(V.bview==="pick")return renderPicker();if(V.bview==="search")return renderSearch();return renderReader()}
function modeSeg(full){return `<div class="seg ${full?"full":""}">${[["zh","只看中文"],["en","只看英文"],["both","中英对照"]].map(m=>`<button data-act="setMode" data-v="${m[0]}" aria-pressed="${S.mode===m[0]}">${m[1]}</button>`).join("")}</div>`}
ACT.setMode=async el=>{S.mode=el.dataset.v;await saveS();render()};
ACT.fontUp=async()=>{S.fs=Math.min(2.2,+(S.fs+0.1).toFixed(2));await saveS();applyPrefs()};
ACT.fontDown=async()=>{S.fs=Math.max(1,+(S.fs-0.1).toFixed(2));await saveS();applyPrefs()};
ACT.openPick=()=>{V.bview="pick";V.pickB=R.b;render()};
ACT.openSearch=()=>{V.bview="search";render()};
ACT.backRead=()=>{V.bview="read";render()};
async function renderReader(){const b=R.b,c=R.c;const d=await book(b);const zh=d.zh[c-1]||[],en=(d[S.en]||d.bsb)[c-1]||[],hd=(d.h&&d.h[c-1])||{};const B=BOOKS[b];S.last={b,c};saveS();
 const verses=zh.map((z,i)=>{const v=i+1,e=en[i]||"";const mk=MARKS["mark:"+key(b,c,v)];const cls=["v",S.mode==="both"?"both":"",mk&&mk.hl?"hl-"+mk.hl:""].join(" ");const head=hd[String(v)]&&S.mode!=="zh"?`<div class="heading">${esc(hd[String(v)])}</div>`:"";const merged=isMerged(z);
  const zhHtml=S.mode!=="en"?`<p class="zh" data-act="verseTap" data-v="${v}"><span class="vn">${v}</span>${merged?`<span class="fn">${fmtZh(z)}</span>`:fmtZh(z)}</p>`:"";
  const enHtml=S.mode!=="zh"&&e?`<p class="en" data-v="${v}">${S.mode==="en"?`<span class="vn">${v}</span>`:""}${esc(e)}</p>`:"";
  const flags=mk?`<div class="fl">${mk.fav?`<span class="star">${I.star}</span>`:""}${mk.note?`<span class="note">${I.note}</span>`:""}</div>`:"";
  const note=mk&&mk.note?`<div class="mynote" data-act="verseTap" data-v="${v}">${esc(mk.note)}</div>`:"";
  return head+`<div class="${cls}" id="v-${v}" data-v="${v}">${flags}${zhHtml}${enHtml}${note}</div>`}).join("");
 const read=!!READ[key(b,c)];const inPlan=chapterInPlan(b,c);
 const tools=`<div class="reader-tools"><button class="btn pick" data-act="openPick"><span>${esc(B[0])} 第 ${c} 章</span>${I.fwd}</button><button class="iconbtn" data-act="fontDown" aria-label="缩小字体">A-</button><button class="iconbtn" data-act="fontUp" aria-label="放大字体">A+</button><button class="iconbtn" data-act="ttsChapter" aria-label="朗读本章">${I.speaker}</button>${modeSeg(true)}</div>`;
 return topbar("圣经","和合本 · "+(S.en==="kjv"?"KJV":"BSB"),`<button class="iconbtn" data-act="openSearch" aria-label="搜索">${I.search}</button>`)+tools+`<div class="chapter-title">${esc(B[0])} 第 ${c} 章<span class="en">${esc(B[2])} ${c}${d.tz&&d.tz[c-1]?" · "+esc(d.tz[c-1]):""}</span></div><div class="reader" id="reader">${verses}</div>
 <div class="chapnav"><button class="btn" data-act="prevCh" ${b===0&&c===1?"disabled":""}>${I.back} 上一章</button><button class="btn ${read?"":"primary"}" data-act="toggleCh" data-b="${b}" data-c="${c}">${read?I.tick+" 已读过":"本章读完 ✓"}</button><button class="btn" data-act="nextCh" ${b===65&&c===22?"disabled":""}>下一章 ${I.fwd}</button></div>
 ${inPlan&&!read?`<div class="small muted center">这一章在你的读经计划里，点「本章读完」会同步计划进度。</div>`:""}`}
function stepCh(n){let b=R.b,c=R.c+n;if(c<1){if(b===0)return;b--;c=BOOKS[b][4]}else if(c>BOOKS[b][4]){if(b===65)return;b++;c=1}R.b=b;R.c=c;window.scrollTo(0,0);render()}
ACT.prevCh=()=>stepCh(-1);ACT.nextCh=()=>stepCh(1);
function renderPicker(){const b=V.pickB??R.b;const ot=BOOKS.slice(0,39),nt=BOOKS.slice(39);const bk=(arr,off)=>arr.map((B,i)=>`<button data-act="pickB" data-b="${i+off}" class="${i+off===b?"cur":""}">${esc(B[1])}</button>`).join("");const chs=Array.from({length:BOOKS[b][4]},(_,i)=>i+1).map(c=>`<button data-act="pickC" data-c="${c}" class="${b===R.b&&c===R.c?"cur":READ[key(b,c)]?"read":""}">${c}</button>`).join("");
 return topbar("选择经卷","",`<button class="iconbtn" data-act="backRead" aria-label="返回">${I.x}</button>`)+`<div class="stack"><div class="card"><div class="search-in"><input id="refJump" placeholder="直接跳转：约3:16 / John 3:16 / 诗 23" data-enter="refJump"><button class="btn primary sm" data-act="refJump">跳转</button></div></div><div class="card accent"><h3>${esc(BOOKS[b][0])} · 选章</h3><div class="grid-ch" style="margin-top:8px">${chs}</div></div><div class="card"><div class="eyebrow">旧约</div><div class="grid-books" style="margin-top:6px">${bk(ot,0)}</div><div class="eyebrow" style="margin-top:14px">新约</div><div class="grid-books" style="margin-top:6px">${bk(nt,39)}</div></div></div>`}
ACT.pickB=el=>{V.pickB=+el.dataset.b;render();window.scrollTo(0,0)};
ACT.pickC=el=>{R.b=V.pickB??R.b;R.c=+el.dataset.c;V.bview="read";window.scrollTo(0,0);render()};
ACT.refJump=()=>{const r=parseRef($("#refJump").value);if(!r){toast("没认出这个经文位置，试试「约3:16」");return}R.b=r.b;R.c=r.c;R.target=r.v;V.bview="read";window.scrollTo(0,0);render()};

/* ---------- 搜索 ---------- */
let SEARCH={q:"",scope:"all",res:null,busy:false};
function renderSearch(){const r=SEARCH.res;return topbar("搜索经文","",`<button class="iconbtn" data-act="backRead" aria-label="返回">${I.x}</button>`)+`<div class="stack"><div class="card"><div class="search-in"><input id="sq" value="${esc(SEARCH.q)}" placeholder="输入词语，中英文都可以" data-enter="doSearch"><button class="btn primary sm" data-act="doSearch">搜索</button></div><div class="seg" style="margin-top:8px">${[["all","全部"],["ot","旧约"],["nt","新约"]].map(s=>`<button data-act="searchScope" data-v="${s[0]}" aria-pressed="${SEARCH.scope===s[0]}">${s[1]}</button>`).join("")}</div><div class="small muted" style="margin-top:6px">也可以直接输入经文位置，如「罗8:28」。第一次搜索要载入全部经文，稍等几秒。</div></div>
 ${SEARCH.busy?`<div class="empty">正在搜索… <span id="sprog"></span></div>`:r?`<div class="card"><div class="small muted">找到 ${r.total} 节${r.total>r.list.length?"，显示前 "+r.list.length+" 节":""}</div>${r.list.map(x=>`<div class="sr"><button style="text-align:left;width:100%" data-act="goCh" data-b="${x.b}" data-c="${x.c}" data-v="${x.v}"><div class="ref">${esc(refZh(x.b,x.c,x.v))} · ${esc(refEn(x.b,x.c,x.v))}</div><div class="${x.lang==="zh"?"zh":"en"}" style="font-family:${x.lang==="zh"?"var(--f-zh)":"var(--f-en)"}">${x.html}</div></button></div>`).join("")||`<div class="empty">没有找到</div>`}</div>`:""}</div>`}
ACT.searchScope=el=>{SEARCH.scope=el.dataset.v;if(SEARCH.q)ACT.doSearch();else render()};
ACT.doSearch=async()=>{const inp=$("#sq");const q=(inp?inp.value:SEARCH.q).trim();if(!q)return;SEARCH.q=q;const ref=parseRef(q);if(ref){R.b=ref.b;R.c=ref.c;R.target=ref.v;V.bview="read";render();return}SEARCH.busy=true;render();try{await loadAll(n=>{const p=$("#sprog");if(p)p.textContent=n+"/66"});const zh=isCJK(q);const list=[];let total=0;const bs=SEARCH.scope==="nt"?39:0,be=SEARCH.scope==="ot"?38:65;const ql=q.toLowerCase();const re=zh?null:new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"ig");
  for(let b=bs;b<=be;b++){const d=BK[b];const arr=zh?d.zh:(d[S.en]||d.bsb);for(let c=0;c<arr.length;c++){for(let v=0;v<arr[c].length;v++){const t=arr[c][v];if(!t)continue;const hit=zh?cleanZh(t).includes(q)||t.includes(q):t.toLowerCase().includes(ql);if(!hit)continue;total++;if(list.length<300){const html=zh?esc(cleanZh(t)).split(q).join(`<mark>${esc(q)}</mark>`):esc(t).replace(re,m=>`<mark>${m}</mark>`);list.push({b,c:c+1,v:v+1,lang:zh?"zh":"en",html})}}}}
  SEARCH.res={total,list}}catch(e){toast(e.message)}SEARCH.busy=false;render()};

/* ---------- 经节操作 ---------- */
async function getMark(b,c,v){return MARKS["mark:"+key(b,c,v)]||null}
async function setMark(b,c,v,patch){const id="mark:"+key(b,c,v);let m=MARKS[id]||{id,type:"mark",b:b+1,c,v,hl:"",fav:false,note:""};Object.assign(m,patch);if(!m.hl&&!m.fav&&!m.note){delete MARKS[id];await DB.del("docs",id)}else{MARKS[id]=m;await saveDoc(m)}}
ACT.verseTap=el=>{const v=+el.dataset.v;verseSheet(R.b,R.c,v)};
async function verseSheet(b,c,v){const mk=await getMark(b,c,v);const zh=await verseText(b,c,v,"zh"),en=await verseText(b,c,v,"en");openSheet(`<div class="ref">${esc(refZh(b,c,v))} · ${esc(refEn(b,c,v))}</div><p class="zh" style="font-family:var(--f-zh);line-height:1.8;margin:6px 0">${fmtZh(zh)}</p><p class="en" style="font-family:var(--f-en);color:var(--muted);margin:0 0 12px">${esc(en)}</p>
 <div class="hls" style="margin-bottom:12px"><span class="small muted">标记</span><button data-act="hl" data-v="${v}" data-hl="y" style="background:var(--hl-y)" aria-label="黄色"></button><button data-act="hl" data-v="${v}" data-hl="g" style="background:var(--hl-g)" aria-label="绿色"></button><button data-act="hl" data-v="${v}" data-hl="p" style="background:var(--hl-p)" aria-label="紫色"></button><button data-act="hl" data-v="${v}" data-hl="" aria-label="清除">${I.x}</button></div>
 <div class="acts"><button data-act="fav" data-v="${v}">${mk&&mk.fav?I.star:I.starO}<span>${mk&&mk.fav?"取消收藏":"收藏"}</span></button><button data-act="noteV" data-v="${v}">${I.note}<span>${mk&&mk.note?"改注释":"注释"}</span></button><button data-act="copyV" data-v="${v}">${I.copy}<span>复制</span></button><button data-act="shareV" data-v="${v}">${I.share}<span>分享</span></button><button data-act="ttsFrom" data-v="${v}">${I.speaker}<span>从此节朗读</span></button><button data-act="journalV" data-v="${v}">${I.devo}<span>写灵修</span></button><button data-act="studyV" data-v="${v}">${I.study}<span>查经笔记</span></button><button data-act="transV" data-v="${v}">${I.trans}<span>英文解释</span></button></div>
 ${mk&&mk.note?`<div class="mynote" style="margin-top:12px">${esc(mk.note)}</div>`:""}`)}
ACT.hl=async el=>{const v=+el.dataset.v;await setMark(R.b,R.c,v,{hl:el.dataset.hl});closeSheet();render()};
ACT.fav=async el=>{const v=+el.dataset.v;const mk=await getMark(R.b,R.c,v);await setMark(R.b,R.c,v,{fav:!(mk&&mk.fav)});toast(mk&&mk.fav?"已取消收藏":"已收藏");closeSheet();render()};
ACT.noteV=async el=>{const v=+el.dataset.v;const mk=await getMark(R.b,R.c,v);const b=R.b,c=R.c;openSheet(`<h3>注释 · ${esc(refZh(b,c,v))}</h3><textarea id="noteTxt" placeholder="写下你的领受…">${esc(mk&&mk.note||"")}</textarea><div class="row" style="margin-top:10px"><button class="btn danger" data-act="noteDel" data-v="${v}">删除</button><span class="grow"></span><button class="btn" data-act="close">取消</button><button class="btn primary" data-act="noteSave" data-v="${v}">保存</button></div>`);setTimeout(()=>$("#noteTxt").focus(),80)};
ACT.noteSave=async el=>{await setMark(R.b,R.c,+el.dataset.v,{note:$("#noteTxt").value.trim()});closeSheet();render()};
ACT.noteDel=async el=>{await setMark(R.b,R.c,+el.dataset.v,{note:""});closeSheet();render()};
async function verseShareText(b,c,v){const zh=cleanZh(await verseText(b,c,v,"zh")),en=await verseText(b,c,v,"en");const parts=[];if(S.mode!=="en")parts.push(zh);if(S.mode!=="zh")parts.push(en);return `${parts.join("\n")}\n—— ${refZh(b,c,v)} ${refEn(b,c,v)}`}
ACT.copyV=async el=>{copyText(await verseShareText(R.b,R.c,+el.dataset.v));closeSheet()};
ACT.shareV=async el=>{const t=await verseShareText(R.b,R.c,+el.dataset.v);closeSheet();shareText(t)};
ACT.journalV=el=>{const v=+el.dataset.v;closeSheet();journalForm({ref:refZh(R.b,R.c,v)})};
ACT.studyV=el=>{const v=+el.dataset.v;closeSheet();studyForm({book:R.b+1,ref:refZh(R.b,R.c,v)})};
ACT.transV=async el=>{const v=+el.dataset.v;closeSheet();const en=await verseText(R.b,R.c,v,"en");showPop({word:refEn(R.b,R.c,v),q:en,v})};

/* ---------- 点按翻译 ---------- */
function wordAt(x,y){let range=null;try{if(document.caretRangeFromPoint)range=document.caretRangeFromPoint(x,y);else if(document.caretPositionFromPoint){const p=document.caretPositionFromPoint(x,y);if(p){range=document.createRange();range.setStart(p.offsetNode,p.offset)}}}catch(e){}if(!range)return null;const node=range.startContainer;if(node.nodeType!==3)return null;const t=node.textContent,o=range.startOffset;const re=/[A-Za-z'’\-]/;let s=o,e=o;while(s>0&&re.test(t[s-1]))s--;while(e<t.length&&re.test(t[e]))e++;const w=t.slice(s,e).replace(/^[’'\-]+|[’'\-]+$/g,"");return w||null}
document.addEventListener("click",e=>{const en=e.target.closest(".v .en");if(!en||V.tab!=="bible")return;const sel=window.getSelection();if(sel&&sel.toString().trim())return;const w=wordAt(e.clientX,e.clientY);const v=+en.dataset.v;if(w)showPop({word:w,q:w,v});else verseSheet(R.b,R.c,v)});
async function translate(q){const single=!/\s/.test(q)&&q.length<40;const k="dict:"+q.toLowerCase();if(single){const c=await DB.get("docs",k);if(c)return c}let tr="",dict=[];try{const u="https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&dt=bd&q="+encodeURIComponent(q);const r=await fetch(u);if(!r.ok)throw 0;const j=await r.json();tr=(j[0]||[]).map(x=>x[0]).join("");dict=(j[1]||[]).map(d=>d[0]+"：" +(d[1]||[]).slice(0,6).join("、"))}catch(e){const u2="https://api.mymemory.translated.net/get?q="+encodeURIComponent(q)+"&langpair=en|zh-CN";const r2=await fetch(u2);if(!r2.ok)throw new Error("翻译服务暂时不可用");const j2=await r2.json();tr=(j2.responseData&&j2.responseData.translatedText)||"";if(!tr||/QUERY LENGTH LIMIT|INVALID/i.test(tr))throw new Error("翻译服务暂时不可用")}const doc={id:k,type:"dict",q,tr,dict,created:Date.now()};if(single)await DB.put("docs",doc);return doc}
function closePop(){const p=$("#pop");if(p)p.remove()}
async function showPop(o){closePop();const el=document.createElement("div");el.id="pop";el.className="pop";el.innerHTML=`<button class="iconbtn x" data-act="closePop">${I.x}</button><div class="w">${esc(o.word)}</div><div class="tr muted">查询中…</div><div class="row" style="margin-top:10px"><button class="btn sm" data-act="popSpeak">${I.speaker} 朗读</button>${o.v?`<button class="btn sm" data-act="popZh" data-v="${o.v}">本节中文</button><button class="btn sm" data-act="verseTap" data-v="${o.v}">本节操作</button>`:""}</div>`;document.body.appendChild(el);el._q=o.q;try{const d=await translate(o.q);if(!document.getElementById("pop"))return;el.querySelector(".tr").className="tr";el.querySelector(".tr").textContent=d.tr||"（无结果）";if(d.dict&&d.dict.length){const dv=document.createElement("div");dv.className="dict";dv.innerHTML=d.dict.map(esc).join("<br>");el.querySelector(".tr").after(dv)}}catch(e){if(!document.getElementById("pop"))return;el.querySelector(".tr").textContent="需要联网才能查词；离线时可看「本节中文」。"}}
ACT.closePop=()=>closePop();
ACT.popSpeak=()=>{const p=$("#pop");if(!p)return;speakOnce(p._q,"en")};
ACT.popZh=async el=>{const v=+el.dataset.v;const zh=cleanZh(await verseText(R.b,R.c,v,"zh"));const p=$("#pop");if(p){let z=p.querySelector(".zhv");if(!z){z=document.createElement("div");z.className="zhv";z.style.cssText="margin-top:8px;font-family:var(--f-zh);line-height:1.7";p.querySelector(".row").before(z)}z.textContent=zh}};
/* 选中英文后出现翻译条 */
let selTimer=null;document.addEventListener("selectionchange",()=>{clearTimeout(selTimer);selTimer=setTimeout(()=>{const sel=window.getSelection();const t=sel?sel.toString().trim():"";const bar=$("#selbar");const inReader=sel&&sel.rangeCount&&sel.anchorNode&&document.getElementById("reader")&&document.getElementById("reader").contains(sel.anchorNode);if(t.length>1&&inReader){if(!bar){const b=document.createElement("div");b.id="selbar";b.className="selbar";b.innerHTML=`<button data-act="selTrans">翻译</button><button data-act="selCopy">复制</button><button data-act="selSpeak">朗读</button>`;document.body.appendChild(b)}window.__selText=t}else if(bar)bar.remove()},250)});
ACT.selTrans=()=>{const t=window.__selText||"";if(!t)return;showPop({word:t.length>60?t.slice(0,60)+"…":t,q:t})};
ACT.selCopy=()=>{copyText(window.__selText||"")};
ACT.selSpeak=()=>{const t=window.__selText||"";speakOnce(t,isCJK(t)?"zh":"en")};

/* ---------- 朗读 ---------- */
const TTS={q:[],i:0,on:false,paused:false,sid:0,lock:null};
function voices(){try{return speechSynthesis.getVoices()}catch(e){return []}}
function pickVoice(lang){const vs=voices();const want=lang==="zh"?S.voiceZh:S.voiceEn;if(want){const v=vs.find(x=>x.name===want);if(v)return v}const pref=lang==="zh"?/^zh[-_]?(CN|Hans)?/i:/^en[-_]?(US|GB|AU|NZ)?/i;const cands=vs.filter(x=>pref.test(x.lang));return cands.find(x=>/google|xiaoxiao|yunxi|natural|premium|enhanced/i.test(x.name))||cands[0]||null}
function ttsLangs(){const l=S.ttsLang==="follow"?S.mode:S.ttsLang;return l==="both"?["zh","en"]:[l]}
async function buildQueue(b,c,fromV){const d=await book(b);const zh=d.zh[c-1]||[],en=(d[S.en]||d.bsb)[c-1]||[];const langs=ttsLangs();const q=[];for(let i=(fromV||1)-1;i<zh.length;i++){const v=i+1;for(const l of langs){const t=l==="zh"?cleanZh(zh[i]):en[i];if(!t||(l==="zh"&&isMerged(zh[i])))continue;q.push({b,c,v,lang:l,text:t})}}return q}
function speakOnce(text,lang){if(!("speechSynthesis"in window)){toast("这台手机不支持朗读");return}try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=lang==="zh"?"zh-CN":"en-US";const v=pickVoice(lang);if(v)u.voice=v;u.rate=S.rate;speechSynthesis.speak(u)}catch(e){}}
ACT.ttsChapter=()=>startTTS(R.b,R.c,1);
ACT.ttsFrom=el=>{closeSheet();startTTS(R.b,R.c,+el.dataset.v)};
async function startTTS(b,c,v){if(!("speechSynthesis"in window)){toast("这台手机不支持朗读");return}try{speechSynthesis.cancel()}catch(e){}TTS.q=await buildQueue(b,c,v);TTS.i=0;TTS.on=true;TTS.paused=false;TTS.sid++;if(!TTS.q.length){toast("没有可朗读的内容");TTS.on=false;return}renderPlayer();await wakeLock(true);speakNext()}
function speakNext(){if(!TTS.on||TTS.paused)return;document.querySelectorAll(".v.speaking").forEach(e=>e.classList.remove("speaking"));if(TTS.i>=TTS.q.length){ttsFinished();return}const it=TTS.q[TTS.i];const el=document.getElementById("v-"+it.v);if(el&&R.b===it.b&&R.c===it.c&&V.tab==="bible"){el.classList.add("speaking");el.scrollIntoView({block:"center",behavior:"smooth"})}const u=new SpeechSynthesisUtterance(it.text);u.lang=it.lang==="zh"?"zh-CN":"en-US";const v=pickVoice(it.lang);if(v)u.voice=v;u.rate=S.rate;const sid=TTS.sid;u.onend=()=>{if(sid!==TTS.sid)return;TTS.i++;speakNext()};u.onerror=e=>{if(sid!==TTS.sid)return;if(e.error==="interrupted"||e.error==="canceled")return;TTS.i++;speakNext()};try{speechSynthesis.speak(u)}catch(e){stopTTS()}renderPlayer()}
async function ttsFinished(){const it=TTS.q[TTS.q.length-1];if(S.autoNext&&it&&!(it.b===65&&it.c===22)){let b=it.b,c=it.c+1;if(c>BOOKS[b][4]){b++;c=1}R.b=b;R.c=c;if(V.tab==="bible"&&V.bview==="read"){window.scrollTo(0,0);render()}TTS.q=await buildQueue(b,c,1);TTS.i=0;speakNext();return}stopTTS()}
function stopTTS(){TTS.on=false;TTS.paused=false;TTS.sid++;try{speechSynthesis.cancel()}catch(e){}document.querySelectorAll(".v.speaking").forEach(e=>e.classList.remove("speaking"));wakeLock(false);renderPlayer()}
ACT.ttsToggle=()=>{if(!TTS.on)return;if(TTS.paused){TTS.paused=false;speakNext()}else{TTS.paused=true;TTS.sid++;try{speechSynthesis.cancel()}catch(e){}renderPlayer()}};
ACT.ttsStop=()=>stopTTS();
ACT.ttsNext=()=>{if(!TTS.on)return;TTS.sid++;try{speechSynthesis.cancel()}catch(e){}const cur=TTS.q[TTS.i];let i=TTS.i+1;while(i<TTS.q.length&&cur&&TTS.q[i].v===cur.v)i++;TTS.i=i;TTS.paused=false;speakNext()};
ACT.ttsRate=async el=>{S.rate=+el.value;await saveS();if(TTS.on&&!TTS.paused){TTS.sid++;try{speechSynthesis.cancel()}catch(e){}speakNext()}};
function renderPlayer(){let p=$("#player");if(!TTS.on){if(p)p.remove();return}if(!p){p=document.createElement("div");p.id="player";p.className="player";document.body.appendChild(p)}const it=TTS.q[TTS.i]||TTS.q[TTS.q.length-1];const rates=[0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.5,1.8];p.innerHTML=`<button class="iconbtn main" data-act="ttsToggle" aria-label="${TTS.paused?"继续":"暂停"}">${TTS.paused?I.play:I.pause}</button><div class="t"><b>${it?esc(refZh(it.b,it.c,it.v)):""}</b> <span class="muted">${TTS.paused?"已暂停":"朗读中"} · ${TTS.i+1}/${TTS.q.length}</span></div><select data-chg="ttsRate" aria-label="语速">${rates.map(r=>`<option value="${r}" ${Math.abs(r-S.rate)<0.01?"selected":""}>${r}×</option>`).join("")}</select><button class="iconbtn" data-act="ttsNext" aria-label="下一节">${I.next}</button><button class="iconbtn" data-act="ttsStop" aria-label="停止">${I.stop}</button>`}
async function wakeLock(on){try{if(on){if(!TTS.lock&&navigator.wakeLock)TTS.lock=await navigator.wakeLock.request("screen")}else if(TTS.lock){await TTS.lock.release();TTS.lock=null}}catch(e){}}
try{speechSynthesis.onvoiceschanged=()=>{}}catch(e){}

/* ======================================================
   灵修：日记、每日祷告、代祷名单、回顾
   ====================================================== */
function matchQ(doc,q){if(!q)return true;const s=JSON.stringify(doc).toLowerCase();return q.toLowerCase().split(/\s+/).every(w=>s.includes(w))}
function refLink(ref){if(!ref)return"";return ref.split(/[;；,，]/).map(r=>{r=r.trim();const p=parseRef(r);return p?`<button class="chip" data-act="goCh" data-b="${p.b}" data-c="${p.c}" ${p.v?`data-v="${p.v}"`:""}>${esc(r)}</button>`:`<span class="chip off">${esc(r)}</span>`}).join(" ")}
function tagChips(tags,cls){return (tags||[]).map(t=>`<span class="chip ${cls||"sun"}">${esc(t)}</span>`).join("")}
function topicPicker(sel,extra){const all=[...new Set([...TOPICS,...(extra||[])])];return `<div class="tags" id="topicPick">${all.map(t=>`<button class="chip ${sel.includes(t)?"on":"off"}" data-act="tpToggle" data-t="${esc(t)}">${esc(t)}</button>`).join("")}<button class="chip off" data-act="tpAdd">${I.plus.replace("stroke-width=\"2.2\"","stroke-width=\"2.2\" width=\"12\" height=\"12\"")} 新主题</button></div>`}
ACT.tpToggle=el=>{el.classList.toggle("on");el.classList.toggle("off")};
ACT.tpAdd=async el=>{const t=await promptBox("新主题名称");if(!t||!t.trim())return;const box=$("#topicPick");if(!box)return;const b=document.createElement("button");b.className="chip on";b.dataset.act="tpToggle";b.dataset.t=t.trim();b.textContent=t.trim();box.insertBefore(b,el)};
function pickedTopics(){return [...document.querySelectorAll("#topicPick .chip.on")].map(b=>b.dataset.t)}
async function renderDevo(){const sub=V.sub.devo||"journal";const tabs=[["journal","灵修日记"],["prayer","每日祷告"],["care","代祷名单"],["review","回顾"]];const head=topbar("灵修与祷告")+`<div class="subtabs">${tabs.map(t=>`<button data-act="devoSub" data-sub="${t[0]}" aria-pressed="${sub===t[0]}">${t[1]}</button>`).join("")}</div>`;
 const q=V.filters[sub]||"";const filter=`<div class="card" style="padding:10px 12px"><div class="search-in"><input id="fq" value="${esc(q)}" placeholder="${sub==="care"?"按姓名、事项搜索":"按日期、经文或关键词搜索，如 2026-03 / 诗23 / 平安"}" data-enter="filterGo" data-chg="filterGo"><button class="btn sm" data-act="filterGo">${I.search}</button></div></div>`;
 if(sub==="journal")return head+filter+await journalList(q)+fab("newJournal");
 if(sub==="prayer")return head+filter+await prayerList(q)+fab("newPrayer");
 if(sub==="care")return head+filter+await careList(q)+fab("newCare");
 return head+await reviewView()}
function fab(act){return `<button class="fab" data-act="${act}" aria-label="新建">${I.plus}</button>`}
ACT.filterGo=()=>{const sub=V.tab==="devo"?V.sub.devo:V.sub.study;V.filters[sub]=$("#fq")?$("#fq").value.trim():"";render()};
/* 日记 */
async function journalList(q){const all=(await DB.byType("journal")).filter(d=>matchQ(d,q)).sort((a,b)=>b.date<a.date?-1:b.date>a.date?1:b.created-a.created);if(!all.length)return `<div class="empty">${q?"没有匹配的记录":"还没有灵修日记。点右下角 + 写第一篇。"}</div>`;const months={};all.forEach(d=>{(months[d.date.slice(0,7)]=months[d.date.slice(0,7)]||[]).push(d)});return `<div class="stack" style="margin-top:12px">${Object.keys(months).sort().reverse().map(m=>`<div class="eyebrow">${m.replace("-","年")}月</div>${months[m].map(d=>`<button class="item" style="text-align:left;width:100%" data-act="openJournal" data-id="${d.id}"><div class="row between"><span class="t">${fmtDate(d.date,true)}</span><span class="ref">${esc(d.ref||"")}</span></div><div class="body clamp">${esc(d.insight||d.light||d.apply||d.prompt||d.thanks||"")}</div>${d.tags&&d.tags.length?`<div class="tags">${tagChips(d.tags)}</div>`:""}</button>`).join("")}`).join("")}</div>`}
function journalForm(d){d=Object.assign({id:null,date:today(),ref:"",insight:"",light:"",prompt:"",apply:"",thanks:"",tags:[]},d||{});const cur=S.last||{b:42,c:1};openSheet(`<h3>${d.id?"修改":"写"}灵修日记</h3>
 <div class="row"><input type="date" id="jDate" value="${esc(d.date)}" style="width:auto"><input id="jRef" class="grow" value="${esc(d.ref)}" placeholder="关联经文，如 诗23:1"><button class="btn sm" data-act="jUseCur">${esc(refZh(cur.b,cur.c))}</button></div>
 <label class="f">读经心得</label><textarea id="jInsight">${esc(d.insight)}</textarea>
 <label class="f">经文亮光</label><textarea id="jLight" style="min-height:3.6rem">${esc(d.light)}</textarea>
 <label class="f">圣灵的提醒</label><textarea id="jPrompt" style="min-height:3.6rem">${esc(d.prompt)}</textarea>
 <label class="f">个人应用</label><textarea id="jApply" style="min-height:3.6rem">${esc(d.apply)}</textarea>
 <label class="f">今日感恩（一行一项）</label><textarea id="jThanks" style="min-height:3.6rem">${esc(d.thanks)}</textarea>
 <label class="f">主题</label>${topicPicker(d.tags,d.tags)}
 <div class="row" style="margin-top:14px">${d.id?`<button class="btn danger" data-act="delDoc" data-id="${d.id}">删除</button>`:""}<span class="grow"></span><button class="btn" data-act="close">取消</button><button class="btn primary" data-act="saveJournal" data-id="${d.id||""}">保存</button></div>`);setTimeout(()=>$("#jInsight").focus(),80)}
ACT.newJournal=()=>journalForm();
ACT.jUseCur=()=>{const cur=S.last||{b:42,c:1};const r=$("#jRef");r.value=(r.value?r.value+"；":"")+refZh(cur.b,cur.c)};
ACT.saveJournal=async el=>{const id=el.dataset.id;const d=id?await DB.get("docs",id):{id:uid("j"),type:"journal"};Object.assign(d,{date:$("#jDate").value||today(),ref:$("#jRef").value.trim(),insight:$("#jInsight").value.trim(),light:$("#jLight").value.trim(),prompt:$("#jPrompt").value.trim(),apply:$("#jApply").value.trim(),thanks:$("#jThanks").value.trim(),tags:pickedTopics()});if(!d.insight&&!d.light&&!d.prompt&&!d.apply&&!d.thanks){toast("还没写内容");return}await saveDoc(d);closeSheet();toast("已保存");if(V.tab!=="devo"){V.tab="devo";V.sub.devo="journal"}render()};
ACT.openJournal=async el=>{const d=await DB.get("docs",el.dataset.id);if(!d)return;const sec=(t,v)=>v?`<div style="margin-top:10px"><div class="eyebrow">${t}</div><div class="body" style="white-space:pre-wrap">${esc(v)}</div></div>`:"";openSheet(`<div class="row between"><h3>${fmtDate(d.date,true)}</h3><span class="muted tiny">${fmtTs(d.updated)}</span></div>${d.ref?`<div class="tags" style="margin-top:4px">${refLink(d.ref)}</div>`:""}${sec("读经心得",d.insight)}${sec("经文亮光",d.light)}${sec("圣灵的提醒",d.prompt)}${sec("个人应用",d.apply)}${d.thanks?`<div style="margin-top:10px"><div class="eyebrow">感恩</div><ul class="thanks" style="margin:4px 0;padding-left:20px">${d.thanks.split("\n").filter(Boolean).map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`:""}${d.tags&&d.tags.length?`<div class="tags">${tagChips(d.tags)}</div>`:""}
 <div class="row" style="margin-top:16px"><button class="btn sm" data-act="editJournal" data-id="${d.id}">${I.edit} 修改</button><button class="btn sm" data-act="copyDoc" data-id="${d.id}">${I.copy} 复制</button><button class="btn sm" data-act="shareDoc" data-id="${d.id}">${I.share} 分享</button><span class="grow"></span><button class="btn sm danger" data-act="delDoc" data-id="${d.id}">${I.trash}</button></div>`)};
ACT.editJournal=async el=>{const d=await DB.get("docs",el.dataset.id);journalForm(d)};
function docText(d){if(d.type==="journal")return [`${fmtDate(d.date,true)} 灵修日记`,d.ref?"经文："+d.ref:"",d.insight?"读经心得：\n"+d.insight:"",d.light?"经文亮光：\n"+d.light:"",d.prompt?"圣灵的提醒：\n"+d.prompt:"",d.apply?"个人应用：\n"+d.apply:"",d.thanks?"感恩：\n"+d.thanks:"",d.tags&&d.tags.length?"主题："+d.tags.join("、"):""].filter(Boolean).join("\n\n");if(d.type==="prayer")return `${fmtDate(d.date,true)} 祷告\n${d.text}`;if(d.type==="care")return [`代祷：${d.person} · ${d.item}`,`开始：${d.start}  状态：${STATUS[d.status]}`,...(d.followups||[]).map(f=>`${f.date} ${f.text}`),d.testimony?"见证：\n"+d.testimony:""].filter(Boolean).join("\n");if(d.type==="study")return [`${d.title}`,`${d.kind}${d.book?" · "+BOOKS[d.book-1][0]:""}${d.ref?" · "+d.ref:""}`,d.body,d.link?"链接："+d.link:"",d.topics&&d.topics.length?"主题："+d.topics.join("、"):""].filter(Boolean).join("\n\n");return JSON.stringify(d)}
ACT.copyDoc=async el=>{const d=await DB.get("docs",el.dataset.id);copyText(docText(d))};
ACT.shareDoc=async el=>{const d=await DB.get("docs",el.dataset.id);shareText(docText(d))};
ACT.delDoc=async el=>{const ok=await confirmBox("删除这条记录？删除后无法恢复。","删除");if(!ok)return;await DB.del("docs",el.dataset.id);closeSheet();toast("已删除");render()};
/* 每日祷告 */
async function prayerList(q){const all=(await DB.byType("prayer")).filter(d=>matchQ(d,q)).sort((a,b)=>b.date<a.date?-1:b.date>a.date?1:b.created-a.created);if(!all.length)return `<div class="empty">${q?"没有匹配的记录":"还没有祷告记录。点右下角 + 写下今天的祷告。"}</div>`;return `<div class="list" style="margin-top:12px">${all.map(d=>`<button class="item" style="text-align:left;width:100%" data-act="openPrayer" data-id="${d.id}"><div class="row between"><span class="t">${fmtDate(d.date,true)}</span>${d.tags&&d.tags.length?`<span class="tiny muted">${esc(d.tags.join("、"))}</span>`:""}</div><div class="body clamp">${esc(d.text)}</div></button>`).join("")}</div>`}
function prayerForm(d){d=Object.assign({id:null,date:today(),text:"",tags:[]},d||{});openSheet(`<h3>${d.id?"修改":"写"}祷告</h3><input type="date" id="prDate" value="${esc(d.date)}" style="width:auto"><label class="f">祷告内容</label><textarea id="prText" style="min-height:9rem" placeholder="主啊……">${esc(d.text)}</textarea><label class="f">主题</label>${topicPicker(d.tags,d.tags)}<div class="row" style="margin-top:14px">${d.id?`<button class="btn danger" data-act="delDoc" data-id="${d.id}">删除</button>`:""}<span class="grow"></span><button class="btn" data-act="close">取消</button><button class="btn primary" data-act="savePrayer" data-id="${d.id||""}">保存</button></div>`);setTimeout(()=>$("#prText").focus(),80)}
ACT.newPrayer=()=>prayerForm();
ACT.savePrayer=async el=>{const id=el.dataset.id;const d=id?await DB.get("docs",id):{id:uid("p"),type:"prayer"};Object.assign(d,{date:$("#prDate").value||today(),text:$("#prText").value.trim(),tags:pickedTopics()});if(!d.text){toast("还没写内容");return}await saveDoc(d);closeSheet();toast("已保存");if(V.tab!=="devo"){V.tab="devo";V.sub.devo="prayer"}render()};
ACT.openPrayer=async el=>{const d=await DB.get("docs",el.dataset.id);if(!d)return;openSheet(`<h3>${fmtDate(d.date,true)}</h3><div class="body" style="white-space:pre-wrap;margin-top:8px">${esc(d.text)}</div>${d.tags&&d.tags.length?`<div class="tags">${tagChips(d.tags)}</div>`:""}<div class="row" style="margin-top:16px"><button class="btn sm" data-act="editPrayer" data-id="${d.id}">${I.edit} 修改</button><button class="btn sm" data-act="copyDoc" data-id="${d.id}">${I.copy} 复制</button><span class="grow"></span><button class="btn sm danger" data-act="delDoc" data-id="${d.id}">${I.trash}</button></div>`)};
ACT.editPrayer=async el=>{const d=await DB.get("docs",el.dataset.id);prayerForm(d)};
/* 代祷名单 */
const STATUS={praying:"正在祷告",waiting:"仍在等候",answered:"已蒙应允"};
async function careList(q){const f=V.filters.careStatus||"all";let all=(await DB.byType("care")).filter(d=>matchQ(d,q));if(f!=="all")all=all.filter(d=>d.status===f);all.sort((a,b)=>(a.status==="answered")-(b.status==="answered")||b.updated-a.updated);const bar=`<div class="subtabs" style="margin-top:10px">${[["all","全部"],["praying","正在祷告"],["waiting","仍在等候"],["answered","已蒙应允"]].map(s=>`<button data-act="careStatus" data-v="${s[0]}" aria-pressed="${f===s[0]}">${s[1]}</button>`).join("")}</div>`;if(!all.length)return bar+`<div class="empty">${q||f!=="all"?"没有匹配的事项":"还没有代祷事项。点右下角 + 为家人、朋友和弟兄姊妹记下祷告事项。"}</div>`;
 const persons={};all.forEach(d=>{(persons[d.person]=persons[d.person]||[]).push(d)});return bar+`<div class="stack">${Object.keys(persons).map(p=>`<div class="card"><div class="row between"><h3>${esc(p)}</h3><span class="tiny muted">${persons[p].length} 项</span></div><div class="list" style="margin-top:8px">${persons[p].map(d=>`<button class="item" style="text-align:left;width:100%;padding:10px 12px" data-act="openCare" data-id="${d.id}"><div class="row between"><span style="font-weight:500">${esc(d.item)}</span><span class="st ${d.status}">${STATUS[d.status]}</span></div><div class="meta">自 ${fmtDate(d.start)} 起${d.followups&&d.followups.length?" · "+d.followups.length+" 条进展":""}${d.answeredDate?" · "+fmtDate(d.answeredDate)+" 蒙应允":""}</div>${d.followups&&d.followups.length?`<div class="small muted" style="margin-top:4px">${esc(d.followups[d.followups.length-1].text.slice(0,60))}</div>`:""}</button>`).join("")}</div></div>`).join("")}</div>`}
ACT.careStatus=el=>{V.filters.careStatus=el.dataset.v;render()};
async function careForm(d){d=Object.assign({id:null,person:"",item:"",status:"praying",start:today()},d||{});const people=[...new Set((await DB.byType("care")).map(x=>x.person))];openSheet(`<h3>${d.id?"修改":"新增"}代祷事项</h3><label class="f">为谁祷告</label><input id="cPerson" list="pl" value="${esc(d.person)}" placeholder="姓名或群体，如 妈妈 / 小组"><datalist id="pl">${people.map(p=>`<option value="${esc(p)}">`).join("")}</datalist><label class="f">祷告事项</label><textarea id="cItem" style="min-height:4rem">${esc(d.item)}</textarea><div class="row"><div class="grow"><label class="f">开始日期</label><input type="date" id="cStart" value="${esc(d.start)}"></div><div class="grow"><label class="f">状态</label><select id="cStatus">${Object.entries(STATUS).map(([k,v])=>`<option value="${k}" ${d.status===k?"selected":""}>${v}</option>`).join("")}</select></div></div><div class="row" style="margin-top:14px"><span class="grow"></span><button class="btn" data-act="close">取消</button><button class="btn primary" data-act="saveCare" data-id="${d.id||""}">保存</button></div>`);setTimeout(()=>$("#cPerson").focus(),80)}
ACT.newCare=()=>careForm();
ACT.saveCare=async el=>{const id=el.dataset.id;const d=id?await DB.get("docs",id):{id:uid("c"),type:"care",followups:[]};const st=$("#cStatus").value;Object.assign(d,{person:$("#cPerson").value.trim()||"未命名",item:$("#cItem").value.trim(),start:$("#cStart").value||today(),status:st});if(st==="answered"&&!d.answeredDate)d.answeredDate=today();if(st!=="answered")d.answeredDate=null;if(!d.item){toast("请写下祷告事项");return}await saveDoc(d);closeSheet();toast("已保存");if(V.tab!=="devo"){V.tab="devo";V.sub.devo="care"}render()};
ACT.openCare=async el=>{const d=await DB.get("docs",el.dataset.id);if(!d)return;openSheet(`<div class="row between"><h3>${esc(d.person)}</h3><span class="st ${d.status}">${STATUS[d.status]}</span></div><div style="margin-top:6px;font-size:1.02rem">${esc(d.item)}</div><div class="meta muted small">自 ${fmtDate(d.start,true)} 开始祷告${d.answeredDate?" · "+fmtDate(d.answeredDate)+" 蒙应允":""}</div>
 <label class="f">更改状态</label><div class="seg">${Object.entries(STATUS).map(([k,v])=>`<button data-act="careSet" data-id="${d.id}" data-v="${k}" aria-pressed="${d.status===k}">${v}</button>`).join("")}</div>
 <label class="f">后续情况</label>${(d.followups||[]).length?`<div class="timeline">${d.followups.map((f,i)=>`<div class="item" style="padding:8px 10px;margin-bottom:6px"><div class="tiny muted">${fmtDate(f.date,true)}</div><div style="white-space:pre-wrap">${esc(f.text)}</div></div>`).join("")}</div>`:`<div class="small muted">还没有记录进展</div>`}
 <div class="row" style="margin-top:8px"><input id="fuText" class="grow" placeholder="记一条进展…" data-enter="careFollow"><button class="btn sm primary" data-act="careFollow" data-id="${d.id}">添加</button></div>
 ${d.status==="answered"?`<label class="f">见证与感恩</label><textarea id="cTest" placeholder="神怎样应允了这个祷告？">${esc(d.testimony||"")}</textarea><button class="btn sm" data-act="careTest" data-id="${d.id}" style="margin-top:6px">保存见证</button>`:""}
 <div class="row" style="margin-top:16px"><button class="btn sm" data-act="editCare" data-id="${d.id}">${I.edit} 修改</button><button class="btn sm" data-act="copyDoc" data-id="${d.id}">${I.copy} 复制</button><span class="grow"></span><button class="btn sm danger" data-act="delDoc" data-id="${d.id}">${I.trash}</button></div>`)};
ACT.careSet=async el=>{const d=await DB.get("docs",el.dataset.id);d.status=el.dataset.v;if(d.status==="answered"){if(!d.answeredDate)d.answeredDate=today()}else d.answeredDate=null;await saveDoc(d);ACT.openCare(el);if(d.status==="answered")toast("感谢主！可以写下见证");};
ACT.careFollow=async el=>{const id=el.dataset.id||($("#fuText").closest(".sheet").querySelector("[data-act=careFollow]").dataset.id);const t=$("#fuText").value.trim();if(!t)return;const d=await DB.get("docs",id);d.followups=d.followups||[];d.followups.push({date:today(),text:t});await saveDoc(d);ACT.openCare({dataset:{id}})};
ACT.careTest=async el=>{const d=await DB.get("docs",el.dataset.id);d.testimony=$("#cTest").value.trim();await saveDoc(d);toast("已保存见证")};
ACT.editCare=async el=>{const d=await DB.get("docs",el.dataset.id);careForm(d)};
/* 回顾 */
async function reviewView(){const cares=await DB.byType("care"),prayers=await DB.byType("prayer"),journals=await DB.byType("journal");const ans=cares.filter(c=>c.status==="answered").sort((a,b)=>(b.answeredDate||"")<(a.answeredDate||"")?-1:1);const thanks=journals.filter(j=>j.thanks).sort((a,b)=>b.date<a.date?-1:1).slice(0,30);
 return `<div class="stack"><div class="card accent"><h3>回顾神的带领</h3><div class="row" style="margin-top:10px;gap:14px"><div><div class="eyebrow">代祷事项</div><b style="font-size:1.4rem">${cares.length}</b></div><div><div class="eyebrow">已蒙应允</div><b style="font-size:1.4rem;color:var(--green)">${ans.length}</b></div><div><div class="eyebrow">祷告记录</div><b style="font-size:1.4rem">${prayers.length}</b></div><div><div class="eyebrow">灵修日记</div><b style="font-size:1.4rem">${journals.length}</b></div></div></div>
 <div class="card"><h3>蒙应允的祷告</h3>${ans.length?`<div class="timeline" style="margin-top:10px">${ans.map(d=>`<button class="item" style="text-align:left;width:100%;margin-bottom:8px" data-act="openCare" data-id="${d.id}"><div class="tiny muted">${fmtDate(d.answeredDate||d.start,true)} · ${esc(d.person)}</div><div style="font-weight:500">${esc(d.item)}</div>${d.testimony?`<div class="small" style="margin-top:4px;white-space:pre-wrap">${esc(d.testimony)}</div>`:""}</button>`).join("")}</div>`:`<div class="empty">还没有标记为蒙应允的祷告</div>`}</div>
 <div class="card"><h3>近期感恩</h3>${thanks.length?`<ul class="thanks" style="padding-left:20px;margin:8px 0">${thanks.flatMap(j=>j.thanks.split("\n").filter(Boolean).slice(0,3).map(t=>`<li><span class="tiny muted">${fmtDate(j.date)}</span> ${esc(t)}</li>`)).join("")}</ul>`:`<div class="empty">灵修日记里的感恩事项会汇总在这里</div>`}</div></div>`}

/* ======================================================
   资料：查经笔记、主题、收藏经文
   ====================================================== */
const KINDS=["个人查经","小组查经","讲道笔记","属灵资料"];
async function renderStudy(){const sub=V.sub.study||"all";const tabs=[["all","全部笔记"],["book","按书卷"],["topic","按主题"],["fav","收藏经文"]];const head=topbar("查经与资料")+`<div class="subtabs">${tabs.map(t=>`<button data-act="studySub" data-sub="${t[0]}" aria-pressed="${sub===t[0]}">${t[1]}</button>`).join("")}</div>`;const q=V.filters[sub]||"";const filter=`<div class="card" style="padding:10px 12px"><div class="search-in"><input id="fq" value="${esc(q)}" placeholder="按主题、书卷或关键词搜索" data-enter="filterGo" data-chg="filterGo"><button class="btn sm" data-act="filterGo">${I.search}</button></div></div>`;
 if(sub==="fav")return head+filter+await favList(q);
 const all=(await DB.byType("study")).filter(d=>matchQ(d,q)).sort((a,b)=>b.updated-a.updated);
 if(sub==="book"){const by={};all.forEach(d=>{(by[d.book||0]=by[d.book||0]||[]).push(d)});const grid=BOOKS.map((B,i)=>`<button data-act="studyBook" data-b="${i+1}" class="${by[i+1]?"read":""} ${V.studyB===i+1?"cur":""}">${esc(B[1])}${by[i+1]?`<span class="tiny"> ${by[i+1].length}</span>`:""}</button>`).join("");const sel=V.studyB?all.filter(d=>d.book===V.studyB):[];return head+filter+`<div class="card" style="margin-top:12px"><div class="grid-books">${grid}</div></div>${V.studyB?`<h3 style="margin:14px 0 8px">${esc(BOOKS[V.studyB-1][0])}</h3>`+studyItems(sel):""}${by[0]?`<h3 style="margin:14px 0 8px">未指定书卷</h3>`+studyItems(by[0]):""}`+fab("newStudy")}
 if(sub==="topic"){const cnt={};all.forEach(d=>(d.topics||[]).forEach(t=>cnt[t]=(cnt[t]||0)+1));const topics=[...new Set([...TOPICS,...Object.keys(cnt)])];const chips=topics.map(t=>`<button class="chip ${V.studyT===t?"on":cnt[t]?"":"off"}" data-act="studyTopic" data-t="${esc(t)}">${esc(t)}${cnt[t]?" "+cnt[t]:""}</button>`).join("");const sel=V.studyT?all.filter(d=>(d.topics||[]).includes(V.studyT)):[];return head+filter+`<div class="card" style="margin-top:12px"><div class="tags" style="margin:0">${chips}</div></div>${V.studyT?`<h3 style="margin:14px 0 8px">${esc(V.studyT)}</h3>`+studyItems(sel):""}`+fab("newStudy")}
 return head+filter+`<div style="margin-top:12px">${studyItems(all)}</div>`+fab("newStudy")}
function studyItems(list){if(!list.length)return `<div class="empty">还没有笔记。点右下角 + 新建查经笔记、讲道笔记或保存属灵资料。</div>`;return `<div class="list">${list.map(d=>`<button class="item" style="text-align:left;width:100%" data-act="openStudy" data-id="${d.id}"><div class="row between"><span class="t">${esc(d.title)}</span><span class="chip sky" style="font-size:.72rem">${esc(d.kind)}</span></div><div class="meta">${d.book?esc(BOOKS[d.book-1][0])+" · ":""}${d.ref?esc(d.ref)+" · ":""}${fmtTs(d.updated).slice(0,10)}</div><div class="body clamp">${esc(d.body)}</div>${d.topics&&d.topics.length?`<div class="tags">${tagChips(d.topics)}</div>`:""}</button>`).join("")}</div>`}
ACT.studySub=el=>{V.tab="study";V.sub.study=el.dataset.sub;render()};
ACT.studyBook=el=>{V.studyB=V.studyB===+el.dataset.b?null:+el.dataset.b;render()};
ACT.studyTopic=el=>{V.studyT=V.studyT===el.dataset.t?null:el.dataset.t;render()};
function studyForm(d){d=Object.assign({id:null,kind:"个人查经",book:0,title:"",body:"",topics:[],ref:"",link:""},d||{});openSheet(`<h3>${d.id?"修改":"新建"}笔记</h3><div class="seg" id="kindSeg">${KINDS.map(k=>`<button data-act="segKind" data-v="${k}" aria-pressed="${d.kind===k}">${k}</button>`).join("")}</div>
 <label class="f">标题</label><input id="sTitle" value="${esc(d.title)}" placeholder="例如：罗马书 8 章 查经">
 <div class="row"><div class="grow"><label class="f">书卷</label><select id="sBook"><option value="0">不指定</option>${BOOKS.map((B,i)=>`<option value="${i+1}" ${d.book===i+1?"selected":""}>${B[0]}</option>`).join("")}</select></div><div class="grow"><label class="f">经文</label><input id="sRef" value="${esc(d.ref)}" placeholder="罗8:28-30"></div></div>
 <label class="f">内容</label><textarea id="sBody" style="min-height:9rem" placeholder="查经内容、讲道要点、个人领受…">${esc(d.body)}</textarea>
 <label class="f">链接（可选）</label><input id="sLink" value="${esc(d.link)}" placeholder="https://">
 <label class="f">主题</label>${topicPicker(d.topics,d.topics)}
 <div class="row" style="margin-top:14px">${d.id?`<button class="btn danger" data-act="delDoc" data-id="${d.id}">删除</button>`:""}<span class="grow"></span><button class="btn" data-act="close">取消</button><button class="btn primary" data-act="saveStudy" data-id="${d.id||""}">保存</button></div>`);setTimeout(()=>$("#sTitle").focus(),80)}
ACT.segKind=el=>{document.querySelectorAll("#kindSeg button").forEach(b=>b.setAttribute("aria-pressed",String(b===el)))};
ACT.newStudy=()=>studyForm();
ACT.saveStudy=async el=>{const id=el.dataset.id;const d=id?await DB.get("docs",id):{id:uid("s"),type:"study"};const kind=(document.querySelector('#kindSeg button[aria-pressed="true"]')||{}).dataset?.v||"个人查经";Object.assign(d,{kind,title:$("#sTitle").value.trim(),book:+$("#sBook").value,ref:$("#sRef").value.trim(),body:$("#sBody").value.trim(),link:$("#sLink").value.trim(),topics:pickedTopics()});if(!d.title&&!d.body){toast("还没写内容");return}if(!d.title)d.title=d.body.slice(0,20);await saveDoc(d);closeSheet();toast("已保存");if(V.tab!=="study")V.tab="study";render()};
ACT.openStudy=async el=>{const d=await DB.get("docs",el.dataset.id);if(!d)return;openSheet(`<div class="row between"><h3>${esc(d.title)}</h3><span class="chip sky" style="font-size:.72rem">${esc(d.kind)}</span></div><div class="meta muted small">${d.book?esc(BOOKS[d.book-1][0])+" · ":""}${fmtTs(d.updated)}</div>${d.ref?`<div class="tags" style="margin-top:6px">${refLink(d.ref)}</div>`:""}<div class="body" style="white-space:pre-wrap;margin-top:10px">${esc(d.body)}</div>${d.link?`<div style="margin-top:8px"><a href="${esc(d.link)}" target="_blank" rel="noopener">${esc(d.link)}</a></div>`:""}${d.topics&&d.topics.length?`<div class="tags">${tagChips(d.topics)}</div>`:""}<div class="row" style="margin-top:16px"><button class="btn sm" data-act="editStudy" data-id="${d.id}">${I.edit} 修改</button><button class="btn sm" data-act="copyDoc" data-id="${d.id}">${I.copy} 复制</button><button class="btn sm" data-act="shareDoc" data-id="${d.id}">${I.share} 分享</button><span class="grow"></span><button class="btn sm danger" data-act="delDoc" data-id="${d.id}">${I.trash}</button></div>`)};
ACT.editStudy=async el=>{const d=await DB.get("docs",el.dataset.id);studyForm(d)};
async function favList(q){let favs=Object.values(MARKS).filter(m=>m.fav||m.note||m.hl);favs.sort((a,b)=>a.b-b.b||a.c-b.c||a.v-b.v);const items=[];for(const m of favs){const zh=cleanZh(await verseText(m.b-1,m.c,m.v,"zh"));const en=await verseText(m.b-1,m.c,m.v,"en");const txt=zh+" "+en+" "+(m.note||"")+" "+refZh(m.b-1,m.c,m.v);if(q&&!q.toLowerCase().split(/\s+/).every(w=>txt.toLowerCase().includes(w)))continue;items.push({m,zh,en})}
 const f=V.filters.favKind||"fav";const shown=items.filter(x=>f==="fav"?x.m.fav:f==="note"?x.m.note:x.m.hl);const bar=`<div class="subtabs" style="margin-top:10px">${[["fav","收藏"],["note","有注释"],["hl","有标记"]].map(s=>`<button data-act="favKind" data-v="${s[0]}" aria-pressed="${f===s[0]}">${s[1]}</button>`).join("")}</div>`;if(!shown.length)return bar+`<div class="empty">在阅读页点经文可以收藏、标记或写注释，它们会汇总在这里。</div>`;return bar+`<div class="list">${shown.map(({m,zh,en})=>`<div class="item ${m.hl?"hl-"+m.hl:""}"><div class="row between"><button class="ref" data-act="goCh" data-b="${m.b-1}" data-c="${m.c}" data-v="${m.v}">${esc(refZh(m.b-1,m.c,m.v))} · ${esc(refEn(m.b-1,m.c,m.v))}</button><span>${m.fav?`<span class="star" style="color:var(--sun)">${I.star.replace("<svg",'<svg width="14" height="14"')}</span>`:""}</span></div><div style="font-family:var(--f-zh);line-height:1.7;margin-top:4px">${esc(zh)}</div><div class="small muted" style="font-family:var(--f-en)">${esc(en)}</div>${m.note?`<div class="mynote">${esc(m.note)}</div>`:""}<div class="row" style="margin-top:8px"><button class="btn sm" data-act="copyFav" data-b="${m.b-1}" data-c="${m.c}" data-v="${m.v}">${I.copy} 复制</button><button class="btn sm" data-act="unfav" data-b="${m.b-1}" data-c="${m.c}" data-v="${m.v}">移除</button></div></div>`).join("")}</div>`}
ACT.favKind=el=>{V.filters.favKind=el.dataset.v;render()};
ACT.copyFav=async el=>{copyText(await verseShareText(+el.dataset.b,+el.dataset.c,+el.dataset.v))};
ACT.unfav=async el=>{const ok=await confirmBox("移除这节经文的收藏、标记和注释？","移除");if(!ok)return;const id="mark:"+key(+el.dataset.b,+el.dataset.c,+el.dataset.v);delete MARKS[id];await DB.del("docs",id);render()};

/* ======================================================
   设置、备份、隐私锁、离线、启动
   ====================================================== */
function setRow(l,d,ctl){return `<div class="set-row"><div class="l"><div>${l}</div>${d?`<div class="d">${d}</div>`:""}</div>${ctl}</div>`}
function sw(act,on){return `<button class="switch" role="switch" aria-checked="${!!on}" data-act="${act}"></button>`}
ACT.settings=async()=>{const vz=voices().filter(v=>/^zh/i.test(v.lang)),ve=voices().filter(v=>/^en/i.test(v.lang));const persisted=navigator.storage&&navigator.storage.persisted?await navigator.storage.persisted():false;const cached=await cachedChapters();const est=navigator.storage&&navigator.storage.estimate?await navigator.storage.estimate():null;
 openSheet(`<h3>设置</h3>
 <div class="eyebrow">阅读</div>
 ${setRow("怎么称呼你","首页问候会用这个名字",`<input id="setName" value="${esc(S.name||"")}" placeholder="例如 Natalie" data-chg="setName" style="width:46%">`)}
 ${setRow("显示","",modeSeg())}
 ${setRow("英文译本","BSB 现代英语；KJV 钦定本",`<select data-chg="setEn"><option value="bsb" ${S.en==="bsb"?"selected":""}>BSB</option><option value="kjv" ${S.en==="kjv"?"selected":""}>KJV</option></select>`)}
 ${setRow("经文字体大小","也可在阅读页用 A- / A+ 调整",`<div class="row"><button class="btn sm" data-act="fontDown">A-</button><span class="small">${Math.round(S.fs*100)}%</span><button class="btn sm" data-act="fontUp">A+</button></div>`)}
 ${setRow("外观","",`<select data-chg="setTheme"><option value="auto" ${S.theme==="auto"?"selected":""}>跟随系统</option><option value="light" ${S.theme==="light"?"selected":""}>浅色</option><option value="dark" ${S.theme==="dark"?"selected":""}>深色</option></select>`)}
 <div class="eyebrow" style="margin-top:16px">朗读</div>
 ${setRow("朗读语言","对照模式下可选中英都读",`<select data-chg="setTtsLang">${[["follow","跟随显示"],["zh","只读中文"],["en","只读英文"],["both","中英都读"]].map(o=>`<option value="${o[0]}" ${S.ttsLang===o[0]?"selected":""}>${o[1]}</option>`).join("")}</select>`)}
 ${setRow("中文声音",vz.length?"":"系统未提供中文声音，可在手机「文字转语音」设置里安装",`<select data-chg="setVoiceZh"><option value="">自动</option>${vz.map(v=>`<option value="${esc(v.name)}" ${S.voiceZh===v.name?"selected":""}>${esc(v.name)}</option>`).join("")}</select>`)}
 ${setRow("英文声音","",`<select data-chg="setVoiceEn"><option value="">自动</option>${ve.map(v=>`<option value="${esc(v.name)}" ${S.voiceEn===v.name?"selected":""}>${esc(v.name)}</option>`).join("")}</select>`)}
 ${setRow("读完自动下一章","",sw("toggleAutoNext",S.autoNext))}
 <div class="eyebrow" style="margin-top:16px">备份与迁移</div>
 <div class="small muted" style="margin:6px 0">所有记录只存在这台手机上。换手机前请先导出备份文件，再在新手机导入。建议每月备份一次。</div>
 <div class="btn-grid"><button class="btn sm" data-act="exportJson">${I.down} 导出备份</button><button class="btn sm" data-act="exportEnc">${I.lock} 加密导出</button><button class="btn sm" data-act="exportMd">${I.copy} 导出笔记文本</button><button class="btn sm" data-act="importPick">${I.share} 导入备份</button></div><input type="file" id="impFile" accept=".json,application/json" style="display:none" data-chg="importFile">
 <div class="eyebrow" style="margin-top:16px">隐私</div>
 ${setRow("打开时需要密码","4–8 位数字；忘记后无法找回",`<button class="btn sm" data-act="${PIN?"pinRemove":"pinSet"}">${PIN?"关闭密码":"设置密码"}</button>`)}
 ${PIN?setRow("离开多久后重新锁定","",`<select data-chg="setLockMin">${[0,1,5,15,60].map(m=>`<option value="${m}" ${S.lockMin===m?"selected":""}>${m===0?"立即":m+" 分钟"}</option>`).join("")}</select>`):""}
 <div class="eyebrow" style="margin-top:16px">离线与存储</div>
 ${setRow("离线经文","已下载 "+cached+" / 66 卷",`<button class="btn sm" data-act="downloadAll">${cached>=66?"重新下载":"下载全本"}</button>`)}
 ${setRow("持久存储",persisted?"已获准，浏览器不会自动清理":"未获准；请把应用添加到主屏幕并常用，浏览器会更稳妥地保留数据",`<button class="btn sm" data-act="askPersist">申请</button>`)}
 ${est?`<div class="small muted">已用约 ${(est.usage/1048576).toFixed(1)} MB</div>`:""}
 <div class="eyebrow" style="margin-top:16px">关于</div>
 <div class="small muted">晨光 v${APP_VER}。经文：和合本（1919）、Berean Standard Bible、King James Version，均为公有领域。个人记录只保存在本机浏览器，不上传任何服务器；点按查词需要联网。</div>
 <div class="row" style="margin-top:12px"><span class="grow"></span><button class="btn danger sm" data-act="wipeAll">清除全部数据</button></div>`)};
ACT.setEn=async el=>{S.en=el.value;await saveS();render()};
ACT.setName=async el=>{S.name=el.value.trim().slice(0,20);await saveS();if(V.tab==="today")render()};
ACT.setTheme=async el=>{S.theme=el.value;await saveS();applyPrefs()};
ACT.setTtsLang=async el=>{S.ttsLang=el.value;await saveS()};
ACT.setVoiceZh=async el=>{S.voiceZh=el.value;await saveS()};
ACT.setVoiceEn=async el=>{S.voiceEn=el.value;await saveS()};
ACT.setLockMin=async el=>{S.lockMin=+el.value;await saveS()};
ACT.toggleAutoNext=async el=>{S.autoNext=!S.autoNext;el.setAttribute("aria-checked",String(S.autoNext));await saveS()};
ACT.askPersist=async()=>{try{const ok=await navigator.storage.persist();toast(ok?"已获准持久存储":"浏览器暂未批准，添加到主屏幕后再试")}catch(e){toast("此浏览器不支持")}ACT.settings()};
/* 备份 */
async function exportData(){const kv=(await DB.all("kv")).filter(x=>x.k!=="pin");const docs=(await DB.all("docs")).filter(d=>d.type!=="dict");return {app:"chenguang",ver:1,exported:new Date().toISOString(),kv,docs}}
function fname(ext){return "chenguang-backup-"+today()+ext}
ACT.exportJson=async()=>{const d=await exportData();const txt=JSON.stringify(d);await deliverFile(fname(".json"),txt,"application/json")};
async function deliverFile(name,txt,mime){const file=new File([txt],name,{type:mime});if(navigator.canShare&&navigator.canShare({files:[file]})){const how=await choose("备份文件怎么保存？",[["share","发送到微信 / 云盘 / 邮件"],["down","下载到手机"]]);if(how==="share"){try{await navigator.share({files:[file],title:name});return}catch(e){if(e.name==="AbortError")return}}}download(name,txt,mime);toast("已下载："+name)}
function choose(title,opts){return new Promise(res=>{openSheet(`<h3>${esc(title)}</h3><div class="stack" style="margin-top:10px">${opts.map(o=>`<button class="btn block" data-act="chooseOpt" data-v="${o[0]}">${o[1]}</button>`).join("")}<button class="btn ghost block" data-act="chooseOpt" data-v="">取消</button></div>`);ACT.chooseOpt=el=>{closeSheet();res(el.dataset.v||null)}})}
const te=new TextEncoder(),td=new TextDecoder();
const b64=u8=>btoa(String.fromCharCode(...u8)),unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function deriveKey(pw,salt){const km=await crypto.subtle.importKey("raw",te.encode(pw),"PBKDF2",false,["deriveKey"]);return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:200000,hash:"SHA-256"},km,{name:"AES-GCM",length:256},false,["encrypt","decrypt"])}
async function encryptText(txt,pw){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const k=await deriveKey(pw,salt);const ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},k,te.encode(txt)));let s="";for(let i=0;i<ct.length;i+=8192)s+=String.fromCharCode(...ct.subarray(i,i+8192));return JSON.stringify({app:"chenguang",enc:true,salt:b64(salt),iv:b64(iv),data:btoa(s)})}
async function decryptText(obj,pw){const k=await deriveKey(pw,unb64(obj.salt));const pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(obj.iv)},k,unb64(obj.data));return td.decode(pt)}
ACT.exportEnc=async()=>{if(!crypto.subtle){toast("此环境不支持加密");return}const pw=await promptBox("设置备份密码（导入时需要）","","password");if(!pw)return;if(pw.length<6){toast("密码至少 6 位");return}const d=await exportData();const txt=await encryptText(JSON.stringify(d),pw);await deliverFile(fname(".enc.json"),txt,"application/json");ACT.settings()};
ACT.exportMd=async()=>{const docs=(await DB.all("docs")).filter(d=>["journal","prayer","care","study"].includes(d.type)).sort((a,b)=>(a.date||"")<(b.date||"")?-1:1);const marks=Object.values(MARKS);let out="# 晨光 笔记导出 "+today()+"\n\n";const grp=(t,title)=>{const l=docs.filter(d=>d.type===t);if(!l.length)return;out+="## "+title+"\n\n";l.forEach(d=>{out+=docText(d)+"\n\n---\n\n"})};grp("journal","灵修日记");grp("prayer","每日祷告");grp("care","代祷名单");grp("study","查经与资料");if(marks.length){out+="## 经文标记与注释\n\n";for(const m of marks){out+=`- ${refZh(m.b-1,m.c,m.v)}${m.fav?" ★":""}${m.note?"：" +m.note:""}\n`}}await deliverFile("chenguang-notes-"+today()+".md",out,"text/markdown")};
ACT.importPick=()=>$("#impFile").click();
ACT.importFile=async el=>{const f=el.files[0];if(!f)return;el.value="";let txt=await f.text();let obj;try{obj=JSON.parse(txt)}catch(e){toast("不是有效的备份文件");return}if(obj.enc){const pw=await promptBox("输入备份密码","","password");if(!pw)return;try{txt=await decryptText(obj,pw);obj=JSON.parse(txt)}catch(e){toast("密码不对或文件损坏");return}}if(obj.app!=="chenguang"||!Array.isArray(obj.docs)){toast("不是晨光的备份文件");return}
 const how=await choose(`备份含 ${obj.docs.length} 条记录（${obj.exported?obj.exported.slice(0,10):"未知日期"}）。怎样导入？`,[["merge","合并（保留两边，较新的为准）"],["replace","覆盖（清除本机数据后导入）"]]);if(!how)return;
 if(how==="replace"){await DB.clear("docs");await DB.clear("kv")}
 for(const d of obj.docs){if(how==="merge"){const old=await DB.get("docs",d.id);if(old&&(old.updated||0)>=(d.updated||0))continue}await DB.put("docs",d)}
 for(const x of obj.kv){if(x.k==="pin")continue;if(how==="merge"&&x.k==="read"){const cur=await kvGet("read",{});await kvSet("read",Object.assign({},x.v,cur));continue}if(how==="merge"&&x.k==="plan"&&P)continue;await DB.put("kv",x)}
 toast("导入完成，正在重新载入");setTimeout(()=>location.reload(),800)};
ACT.wipeAll=async()=>{const t=await promptBox("这会删除本机全部记录且无法恢复。请输入「删除」确认");if(t!=="删除")return;await DB.clear("docs");await DB.clear("kv");location.reload()};
/* 密码锁 */
async function sha(s){const h=await crypto.subtle.digest("SHA-256",te.encode(s));return b64(new Uint8Array(h))}
ACT.pinSet=async()=>{if(!crypto.subtle){toast("需要 https 环境");return}const a=await promptBox("设置 4–8 位数字密码","","password");if(!a)return;if(!/^\d{4,8}$/.test(a)){toast("请输入 4–8 位数字");return}const b=await promptBox("再输入一次","","password");if(a!==b){toast("两次输入不一致");return}const salt=b64(crypto.getRandomValues(new Uint8Array(12)));PIN={salt,hash:await sha(salt+a)};await kvSet("pin",PIN);toast("密码已设置");ACT.settings()};
ACT.pinRemove=async()=>{const a=await promptBox("输入当前密码以关闭","","password");if(a===null)return;if(await sha(PIN.salt+a)!==PIN.hash){toast("密码不对");return}PIN=null;await DB.del("kv","pin");toast("已关闭密码");ACT.settings()};
let pinBuf="";
function showLock(){if($("#lock"))return;pinBuf="";const el=document.createElement("div");el.id="lock";el.className="lock";el.innerHTML=`<div style="color:var(--green)">${I.lock.replace("<svg",'<svg width="40" height="40"')}</div><h2>晨光</h2><div class="muted small">输入密码</div><div class="pinbox" id="pinbox">${"<i></i>".repeat(8)}</div><div class="pad">${[1,2,3,4,5,6,7,8,9].map(n=>`<button data-act="pinKey" data-k="${n}">${n}</button>`).join("")}<button data-act="pinKey" data-k="del">⌫</button><button data-act="pinKey" data-k="0">0</button><button data-act="pinKey" data-k="ok">✓</button></div>`;document.body.appendChild(el);renderPinDots()}
function renderPinDots(){const box=$("#pinbox");if(!box)return;box.innerHTML=Array.from({length:Math.max(4,Math.min(8,Math.max(pinBuf.length,4)))},(_,i)=>`<i class="${i<pinBuf.length?"on":""}"></i>`).join("")}
ACT.pinKey=async el=>{const k=el.dataset.k;if(k==="del")pinBuf=pinBuf.slice(0,-1);else if(k==="ok"){if(await sha(PIN.salt+pinBuf)===PIN.hash){$("#lock").remove();pinBuf=""}else{toast("密码不对");pinBuf="";}}else if(pinBuf.length<8)pinBuf+=k;renderPinDots();if(pinBuf.length>=4&&k!=="ok"&&k!=="del"&&await sha(PIN.salt+pinBuf)===PIN.hash){$("#lock")&&$("#lock").remove();pinBuf=""}};
let hiddenAt=null;document.addEventListener("visibilitychange",()=>{if(document.hidden){hiddenAt=Date.now();if(TTS.on&&!TTS.paused){/* 后台继续朗读 */}}else if(PIN&&hiddenAt&&Date.now()-hiddenAt>=S.lockMin*60000)showLock()});
/* 离线 */
async function cachedChapters(){try{const c=await caches.open("chenguang-data");const ks=await c.keys();return ks.filter(r=>/\/data\/\d\d\.json$/.test(r.url)).length}catch(e){return 0}}
ACT.downloadAll=async()=>{toast("开始下载全本经文…");try{const c=await caches.open("chenguang-data");for(let i=1;i<=66;i++){const u=new URL("../data/"+pad2(i)+".json",location.href).href;const r=await fetch(u,{cache:"reload"});if(!r.ok)throw new Error("下载失败："+i);await c.put(u,r.clone())}toast("全本经文已保存，可离线阅读");ACT.settings()}catch(e){toast(e.message)}};
/* 提醒 */
async function checkReminder(){if(!S.remindOn||!P)return;const t=today();const last=await kvGet("lastRemind","");if(last===t)return;if(nowHM()<S.remindTime)return;const st=todayState();if(!st||!st.cur||dayDone(P.days[st.cur.idx]))return;await kvSet("lastRemind",t);if("Notification"in window&&Notification.permission==="granted"){try{const reg=await navigator.serviceWorker?.getRegistration();if(reg)reg.showNotification("读经时间",{body:P.days[st.cur.idx].map(([b,c])=>refZh(b,c)).join("、"),icon:"icon.png",tag:"chenguang-remind"});else new Notification("读经时间",{body:"今天的经文还没读"})}catch(e){}}if(V.tab==="today")render()}
/* 启动 */
async function boot(){await DB.open();S=Object.assign({},DEF,await kvGet("settings",{}));P=await kvGet("plan",null);READ=await kvGet("read",{});PIN=await kvGet("pin",null);(await DB.byType("mark")).forEach(m=>MARKS[m.id]=m);applyPrefs();V.tab=S.tab||"today";if(S.last){R.b=S.last.b;R.c=S.last.c}if(PIN)showLock();render();checkReminder();setInterval(checkReminder,60000);
 if("serviceWorker"in navigator){try{await navigator.serviceWorker.register("sw.js")}catch(e){}}
 document.addEventListener("click",async function once(){document.removeEventListener("click",once);try{if(navigator.storage&&navigator.storage.persist&&!(await navigator.storage.persisted()))await navigator.storage.persist()}catch(e){}},{once:true})}
boot().catch(e=>{$("#app").innerHTML=`<div class="card clay" style="margin-top:20px"><b>无法启动</b><div class="small">${esc(e.message||e)}</div><div class="small muted" style="margin-top:6px">请用 Chrome 打开，并确认浏览器允许网站保存数据（非无痕模式）。</div></div>`});
