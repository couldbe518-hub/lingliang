/* Grace 拉伸 · 主程序：页面、播放器、打卡与进度
 * 纯前端运行；所有记录只存在 Grace 自己手机的浏览器里（localStorage）。
 */
(function () {
  "use strict";
  var D = window.STRETCH, EXM = {}, RM = {};
  D.EX.forEach(function (e) { EXM[e.id] = e; });
  D.ROUTINES.forEach(function (r) { RM[r.id] = r; });
  var main = document.getElementById("main");
  var KEY = "grace-stretch-v1";

  // ───────── 数据 ─────────
  var DEFAULTS = {
    level: "basic", voiceOn: true, musicOn: true, musicVol: .55, voiceVol: 1, rate: 1, voice: "",
    count: true, explain: "auto", asym: true, musicTheme: "auto", prepSecs: 7,
    wakeTime: "07:00", dayTime: "12:30", nightTime: "21:45", theme: "auto", figStyle: "anatomy"
  };
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { s = null; }
    s = s || {};
    s.sessions = s.sessions || []; s.checkins = s.checkins || {}; s.tests = s.tests || [];
    s.levels = s.levels || {}; s.exCount = s.exCount || {}; s.pick = s.pick || {};
    s.settings = s.settings || {};
    for (var k in DEFAULTS) if (s.settings[k] == null) s.settings[k] = DEFAULTS[k];
    return s;
  }
  var state = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 隐私模式下可能失败 */ } }
  function S() { return state.settings; }
  function applySound() { Sound.configure({ voiceOn: S().voiceOn, musicOn: S().musicOn, musicVol: S().musicVol, voiceVol: S().voiceVol, rate: S().rate, voice: S().voice }); }
  applySound();
  function applyTheme() { if (S().theme === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", S().theme); }
  applyTheme();
  if (window.Figure && Figure.setStyle) Figure.setStyle(S().figStyle || "anatomy");

  // ───────── 工具 ─────────
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function dkey(d) { d = d || new Date(); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function parseKey(k) { var a = k.split("-"); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function mins(sec) { return Math.max(1, Math.round(sec / 60)); }
  function toast(msg) { var t = document.getElementById("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("show"); }, 2400); }
  var cnum = Sound.cnum, L = D.LINES, sp = D.spoken;
  function q(sel, el) { return (el || document).querySelector(sel); }
  function qa(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }

  var IC = {
    gear: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    play: '<path d="M8 5.5v13l11-6.5z"/>',
    pause: '<rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/>',
    prev: '<path d="M18 6L9 12l9 6zM6 6v12"/>',
    next: '<path d="M6 6l9 6-9 6zM18 6v12"/>',
    voice: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    level: '<path d="M4 20h4v-6H4zM10 20h4V9h-4zM16 20h4V4h-4z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    shuttle: '<path d="M6 18l4-4"/><circle cx="5" cy="19" r="2"/><path d="M10 14l2-9 3 3 3 3-9 2z"/><path d="M12 5l4 10M15 8l-4 7"/>',
    racket: '<ellipse cx="14" cy="9" rx="6" ry="6.5" transform="rotate(35 14 9)"/><path d="M9.5 13.5L4 20M9.5 9.5l7 0M14 4l0 10"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    seed: '<path d="M12 21v-8"/><path d="M12 13c0-4 3-7 7-7 0 4-3 7-7 7zM12 13c0-3-2.5-5.5-6-5.5 0 3 2.5 5.5 6 5.5z"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
    flame: '<path d="M12 22c4 0 7-3 7-7 0-3-2-5.5-3.5-7-.4 2-1.5 3-2.5 3 0-3-1-6-4-8 0 4-4 6-4 12 0 4 3 7 7 7z"/>',
    leaf: '<path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15"/><path d="M5 19L13 11"/>',
    orbit: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    mountain: '<path d="M3 20l6-10 4 6 2-3 6 7z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    camera: '<path d="M3.5 8.5A2 2 0 0 1 5.5 6.5h2l1.5-2h6l1.5 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>',
    mirror: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M10 8l4-2M10 12l4-2"/>',
    swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'
  };
  function icon(n, cls) { return '<svg class="' + (cls || "ic") + '" viewBox="0 0 24 24" aria-hidden="true">' + (IC[n] || "") + "</svg>"; }

  // ───────── 计划与时间 ─────────
  function levelOf(id) { return state.levels[id] || S().level; }
  // 进阶版姿势不同时有自己的动作要领
  function cuesOf(ex, lv) { return lv === "adv" && ex.adv.cues ? ex.adv.cues : ex.cues; }
  function segsFor(item) {
    var ex = EXM[item[0]], o = item[1] || {};
    var sides = ex.side === "each" ? ["L", "R"] : [null];
    return sides.map(function (sd) {
      var mult = 1;
      if (S().asym) { if (sd === "R" && ex.rx) mult = ex.rx; if (sd === "L" && ex.lx) mult = ex.lx; }
      if (ex.r != null) {
        var reps = Math.max(1, Math.round((o.r || ex.r) * mult));
        return { ex: ex, side: sd, reps: reps, tempo: ex.tempo, secs: Math.round(reps * ex.tempo) };
      }
      return { ex: ex, side: sd, secs: Math.round((o.d || ex.d) * mult) };
    });
  }
  function routineSecs(r) {
    var t = 0;
    r.items.forEach(function (it, i) { segsFor(it).forEach(function (s, k) { t += s.secs + (k ? 5 : (i ? S().prepSecs : 5)); }); });
    return t;
  }
  function adHoc(id) {
    var ex = EXM[id]; if (!ex) return null;
    return { id: "ex:" + id, slot: "single", name: ex.name, sub: "单独练习", items: [[id]], music: ex.kind === "dynamic" || ex.kind === "strength" ? "stream" : "daylight", color: "sage" };
  }
  function getRoutine(id) { return RM[id] || (id && id.indexOf("ex:") === 0 ? adHoc(id.slice(3)) : null); }

  // 每天轮换：白天 A→B→C、睡前 A→B→C，按上一次完成的那一套往后排
  function setsOf(slot) { return D.ROUTINES.filter(function (r) { return r.slot === slot; }); }
  function nextSet(slot) {
    var sets = setsOf(slot), today = dkey();
    var pk = state.pick[slot];
    if (pk && pk.date === today && RM[pk.id]) return RM[pk.id];
    var doneToday = state.sessions.filter(function (s) { return s.date === today && RM[s.rid] && RM[s.rid].slot === slot; }).pop();
    if (doneToday) return RM[doneToday.rid];
    var last = state.sessions.filter(function (s) { return RM[s.rid] && RM[s.rid].slot === slot; }).pop();
    if (!last) return sets[0];
    var i = sets.map(function (r) { return r.id; }).indexOf(last.rid);
    return sets[(i + 1) % sets.length];
  }
  function cycleSet(slot) {
    var sets = setsOf(slot), cur = nextSet(slot), i = sets.indexOf(cur);
    state.pick[slot] = { date: dkey(), id: sets[(i + 1) % sets.length].id }; save();
  }

  // ───────── 打卡统计 ─────────
  function kindOf(rid) { var r = getRoutine(rid); if (!r) return "day"; return r.slot === "night" ? "night" : (r.slot === "pre" || r.slot === "post") ? "sport" : "day"; }
  function dayMap() {
    var m = {};
    state.sessions.forEach(function (s) { var d = m[s.date] = m[s.date] || { day: 0, night: 0, sport: 0, secs: 0 }; d[kindOf(s.rid)]++; d.secs += s.secs || 0; });
    return m;
  }
  function streak() {
    var m = dayMap(), d = new Date(), n = 0;
    if (!m[dkey(d)]) d = addDays(d, -1);
    while (m[dkey(d)]) { n++; d = addDays(d, -1); }
    return n;
  }
  function bestStreak() {
    var keys = Object.keys(dayMap()).sort(), best = 0, run = 0, prev = null;
    keys.forEach(function (k) { var d = parseKey(k); run = prev && dkey(addDays(prev, 1)) === k ? run + 1 : 1; best = Math.max(best, run); prev = d; });
    return best;
  }
  function doneToday(rid) { var t = dkey(); return state.sessions.some(function (s) { return s.date === t && s.rid === rid; }); }
  function earned() {
    var ss = state.sessions, m = dayMap(), out = {};
    if (ss.length) out.first = 1;
    var b = bestStreak();
    if (b >= 3) out.streak3 = 1; if (b >= 7) out.streak7 = 1; if (b >= 21) out.streak21 = 1;
    if (ss.filter(function (s) { return kindOf(s.rid) === "night"; }).length >= 10) out.night10 = 1;
    if (ss.filter(function (s) { return s.rid === "wake"; }).length >= 10) out.wake10 = 1;
    if (ss.filter(function (s) { var r = RM[s.rid]; return r && r.slot === "pre"; }).length >= 5) out.sport5 = 1;
    if (Object.keys(m).filter(function (k) { return m[k].day && m[k].night; }).length >= 7) out.both7 = 1;
    if (ss.reduce(function (a, s) { return a + (s.secs || 0); }, 0) >= 300 * 60) out.min300 = 1;
    if (ss.filter(function (s) { return s.level === "adv"; }).length >= 5) out.adv5 = 1;
    return out;
  }

  // ───────── 路由 ─────────
  var cleanup = [];
  function onLeave(fn) { cleanup.push(fn); }
  function route() {
    while (cleanup.length) { try { cleanup.pop()(); } catch (e) { /* 忽略 */ } }
    var h = location.hash.replace(/^#\/?/, "") || "today";
    var parts = h.split("?")[0].split("/"), page = parts[0], arg = decodeURIComponent(parts[1] || "");
    var qs = {}; (h.split("?")[1] || "").split("&").forEach(function (kv) { if (kv) { var a = kv.split("="); qs[a[0]] = decodeURIComponent(a[1] || ""); } });
    var tab = { today: "today", plans: "plans", r: "plans", library: "library", ex: "library", coach: "coach", progress: "progress", settings: "today", go: "plans" }[page] || "today";
    qa(".tabbar a").forEach(function (a) { a.classList.toggle("on", a.getAttribute("data-tab") === tab); });
    window.scrollTo(0, 0);
    if (page === "go") { var rr = resolveGo(arg); location.replace("#/r/" + (rr ? rr.id : "") + "?go=1"); return; }
    var fn = { today: pageToday, plans: pagePlans, r: pageRoutine, library: pageLibrary, ex: pageEx, coach: pageCoach, progress: pageProgress, settings: pageSettings }[page] || pageToday;
    fn(arg, qs);
  }
  function resolveGo(a) {
    if (a === "day") return nextSet("day");
    if (a === "night") return nextSet("night");
    if (a === "wake" || a === "morning") return RM.wake;
    if (a === "badminton") return RM.preBad;
    if (a === "tennis") return RM.preTen;
    return getRoutine(a);
  }
  window.addEventListener("hashchange", route);

  // ───────── 今天 ─────────
  function greet() {
    var h = new Date().getHours();
    return h < 5 ? "夜深了" : h < 11 ? "早上好" : h < 14 ? "中午好" : h < 18 ? "下午好" : "晚上好";
  }
  function planCard(r, eyebrow, extra) {
    var first = EXM[r.items[Math.min(1, r.items.length - 1)][0]];
    var done = doneToday(r.id);
    return '<a class="plan g-' + r.color + '" href="#/r/' + r.id + '">' + (done ? '<span class="done">✓ 今天已完成</span>' : "") +
      '<div class="txt"><p class="eyebrow">' + esc(eyebrow) + "</p><h3>" + esc(r.name) + '</h3><p class="meta">' + esc(r.sub) + " · " + mins(routineSecs(r)) + " 分钟 · " + r.items.length + " 个动作</p>" +
      (extra || "") + '<span class="go">' + icon("play") + (done ? "再练一次" : "开始") + "</span></div>" +
      '<div class="figbox">' + Figure.thumb(first, "basic") + "</div></a>";
  }
  function weekStrip() {
    var m = dayMap(), now = new Date(), wd = (now.getDay() + 6) % 7, mon = addDays(now, -wd), names = "一二三四五六日", h = "";
    for (var i = 0; i < 7; i++) {
      var d = addDays(mon, i), k = dkey(d), v = m[k] || {};
      h += '<div class="' + (k === dkey() ? "today" : "") + '"><div class="d">' + names[i] + '</div><span class="n">' + d.getDate() + '</span><div class="dots">' +
        '<i class="' + (v.day ? "day" : "") + '"></i><i class="' + (v.night ? "night" : "") + '"></i>' + (v.sport ? '<i class="sport"></i>' : "") + "</div></div>";
    }
    return '<div class="week">' + h + "</div>";
  }
  function pageToday() {
    var hr = new Date().getHours(), st = streak(), today = dkey();
    var day = nextSet("day"), night = nextSet("night");
    var wakeCard = planCard(RM.wake, "起床前 · 足底筋膜炎专用");
    var dayCard = planCard(day, "白天 · 第 " + day.set + " 套（三套轮换）", "");
    var nightCard = planCard(night, "睡前 · 第 " + night.set + " 套", "");
    var cards = hr < 10 ? [wakeCard, dayCard, nightCard] : hr >= 19 ? [nightCard, dayCard, wakeCard] : [dayCard, nightCard, wakeCard];
    var ci = state.checkins[today] || {};
    var tip = D.TIPS[Math.floor(parseKey(today) / 864e5) % D.TIPS.length];
    var msg = st === 0 ? "今天开始，第一天最重要。" : st < 3 ? "已经连续 " + st + " 天，保持住！" : st < 7 ? "连续 " + st + " 天，身体正在记住这个习惯。" : st < 21 ? "连续 " + st + " 天，了不起！" : "连续 " + st + " 天，这已经是你的生活方式了。";
    main.innerHTML =
      '<div class="top"><img class="brand" src="logo-96.png" alt="Grace 拉伸" width="48" height="48"><div class="hero grow"><p class="eyebrow">' + (new Date().getMonth() + 1) + " 月 " + new Date().getDate() + " 日 · 星期" + "日一二三四五六"[new Date().getDay()] + "</p><h1>" + greet() + "，Grace</h1></div>" +
      '<a class="iconbtn" href="#/settings" aria-label="设置">' + icon("gear") + "</a></div>" +
      '<div class="card"><div class="streak"><div class="big num">' + st + '</div><div class="grow"><b>天连续练习</b><div class="lbl">' + esc(msg) + "</div></div>" + icon("flame", "ic") + "</div>" + weekStrip() +
      '<div class="row small muted" style="margin-top:10px;gap:14px"><span><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--gold)"></i> 白天</span><span><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#5468A8"></i> 睡前</span><span><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent)"></i> 球场</span></div></div>' +
      cards[0] + cards[1] +
      '<div class="row" style="justify-content:flex-end;gap:8px;margin-top:-4px"><button class="btn small ghost" data-cycle="day">' + icon("swap") + "换一套白天</button>" +
      '<button class="btn small ghost" data-cycle="night">' + icon("swap") + "换一套睡前</button></div>" +
      '<h2 class="sec">今天打球吗？</h2>' +
      '<div class="sports"><a class="sport" href="#/r/preBad">' + icon("shuttle", "ico") + "<b>羽毛球 · 热身</b><span>上场前 " + mins(routineSecs(RM.preBad)) + " 分钟</span></a>" +
      '<a class="sport" href="#/r/postBad">' + icon("shuttle", "ico") + "<b>羽毛球 · 拉伸</b><span>打完 " + mins(routineSecs(RM.postBad)) + " 分钟</span></a>" +
      '<a class="sport" href="#/r/preTen">' + icon("racket", "ico") + "<b>网球 · 热身</b><span>上场前 " + mins(routineSecs(RM.preTen)) + " 分钟</span></a>" +
      '<a class="sport" href="#/r/postTen">' + icon("racket", "ico") + "<b>网球 · 拉伸</b><span>打完 " + mins(routineSecs(RM.postTen)) + " 分钟</span></a></div>" +
      '<a class="card row" href="#/coach" style="text-decoration:none;color:inherit;margin-top:10px"><span class="iconbtn" style="background:var(--accent-soft);color:var(--accent);border:0">' + icon("camera") + '</span><div class="grow"><b>拍一段挥拍或步法</b><div class="small muted">AI 姿态识别在手机上本地分析，不上传、不耗流量</div></div></a>' +
      cards[2] +
      '<h2 class="sec">今日身体记录</h2><div class="card checkin">' +
      '<label>早上下床第一步，右脚跟疼几分？</label><div class="scale" data-ci="foot">' + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { return '<button aria-pressed="' + (ci.foot === n) + '" data-v="' + n + '">' + n + "</button>"; }).join("") + "</div>" +
      '<p class="small muted" style="margin:4px 0 0">0 = 不疼，10 = 最疼。每天记一下，进度页能看到变化趋势。</p>' +
      '<label>今天右胳膊有没有发麻？</label><div class="opts3" data-ci="numb">' + ["没有", "偶尔一下", "比较明显"].map(function (t, i) { return '<button aria-pressed="' + (ci.numb === i) + '" data-v="' + i + '">' + t + "</button>"; }).join("") + "</div></div>" +
      '<h2 class="sec">我的重点</h2><div class="focus">' + D.PROFILE.issues.map(function (it) { return '<a href="#/library?f=' + it.area + '"><b>' + esc(it.label) + "</b><span>" + esc(it.tip) + "</span></a>"; }).join("") + "</div>" +
      '<div class="card tip" style="margin-top:16px"><span class="ico">' + icon("bulb") + '</span><div><b>今日小知识</b><p class="small" style="margin:.2rem 0 0">' + esc(tip) + "</p></div></div>";
    qa("[data-cycle]").forEach(function (b) { b.onclick = function () { cycleSet(b.getAttribute("data-cycle")); pageToday(); toast("已换成另一套，明天会继续轮换"); }; });
    qa("[data-ci]").forEach(function (g) {
      qa("button", g).forEach(function (b) {
        b.onclick = function () {
          var k = g.getAttribute("data-ci"), v = +b.getAttribute("data-v");
          var c = state.checkins[today] = state.checkins[today] || {}; c[k] = v; save();
          qa("button", g).forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
          if (k === "numb" && v === 2) toast("记下了。麻感明显的日子，神经滑动只做一半，避免手臂持续受压的姿势。");
          else if (k === "foot" && v >= 7) toast("记下了。今天多做足底滚球和小腿拉伸，避免赤脚走硬地。");
          else toast("已记录");
        };
      });
    });
  }

  // ───────── 计划列表 ─────────
  function pagePlans() {
    var groups = [["morning", "起床", "下床前在床上完成"], ["day", "白天 · 三套轮换", "每天自动换下一套，也可以自己挑"], ["night", "睡前 · 三套轮换", "全程舒缓，可以在床上或垫子上做"],
      ["pre", "运动前热身", "动态激活，降低受伤风险"], ["post", "运动后拉伸", "静态放松，帮助恢复"], ["quick", "随时", "碎片时间"]];
    main.innerHTML = '<div class="top"><h1>计划</h1></div>' + groups.map(function (g) {
      var rs = D.ROUTINES.filter(function (r) { return r.slot === g[0]; });
      return '<h2 class="sec">' + g[1] + '<span class="small muted" style="font-weight:400">' + g[2] + "</span></h2>" + rs.map(function (r) { return planCard(r, r.set ? "第 " + r.set + " 套" : (r.sport === "badminton" ? "羽毛球" : r.sport === "tennis" ? "网球" : "")); }).join("");
    }).join("");
  }

  // ───────── 计划详情 ─────────
  function pageRoutine(id, qs) {
    var r = getRoutine(id);
    if (!r) { main.innerHTML = '<p class="loading">没有找到这个计划。<a href="#/plans">回到计划</a></p>'; return; }
    function draw() {
      var total = routineSecs(r), lv = S().level;
      main.innerHTML = '<div class="rhead g-' + r.color + '"><a class="back" href="#/plans">' + icon("back") + "计划</a>" +
        "<h1>" + esc(r.name) + "</h1><p>" + esc(r.sub) + '</p><div class="stats"><div><b>' + mins(total) + "</b><span>分钟</span></div><div><b>" + r.items.length + "</b><span>个动作</span></div><div><b>" + esc((Sound.THEMES[musicFor(r)] || {}).name || "") + "</b><span>背景音乐</span></div></div></div>" +
        '<div class="card" style="margin-top:16px"><div class="row"><div class="grow"><b>难度</b><div class="small muted">进阶版会换成更难的变式；单个动作也可以在练习中切换</div></div></div>' +
        '<div class="seg" style="margin-top:10px"><button data-lv="basic" aria-pressed="' + (lv === "basic") + '">基础版</button><button data-lv="adv" aria-pressed="' + (lv === "adv") + '">进阶版</button></div></div>' +
        (qs.go ? '<div class="note acc">从快捷指令打开：点下面的「开始」就会开始语音指导。</div>' : "") +
        '<div class="list">' + r.items.map(function (it, i) {
          var ex = EXM[it[0]], segs = segsFor(it), l = levelOf(ex.id);
          var t = segs.map(function (s) { return s.reps ? s.reps + " 次" : s.secs + " 秒"; });
          var desc = ex.side === "each" ? "左 " + t[0] + " · 右 " + t[1] : t[0];
          var asym = S().asym && ((ex.rx && segs[1] && segs[1].secs > segs[0].secs) || (ex.lx && segs[0] && segs[1] && segs[0].secs > segs[1].secs));
          return '<a class="item" href="#/ex/' + ex.id + '"><span class="idx">' + (i + 1) + '</span><div class="th">' + Figure.thumb(ex, l) + '</div><div class="grow"><h3>' + esc(ex.name) + "</h3>" +
            '<div class="meta">' + esc(desc) + (l === "adv" && ex.adv ? " · 进阶：" + esc(ex.adv.name) : "") + "</div>" +
            (asym ? '<div class="chips" style="margin-top:4px"><span class="chip hl">' + (ex.rx ? "右侧加量" : "左侧加量") + "</span></div>" : "") + "</div></a>";
        }).join("") + "</div>" +
        '<div class="sticky"><a class="btn primary block" href="#/r/' + r.id + '?play=1" id="start">' + icon("play") + "开始 · " + mins(total) + " 分钟</a></div>";
      qa("[data-lv]").forEach(function (b) { b.onclick = function () { S().level = b.getAttribute("data-lv"); state.levels = {}; save(); draw(); }; });
      q("#start").onclick = function (e) { e.preventDefault(); Player.open(r); };
    }
    draw();
    if (qs.play) Player.open(r);
  }
  function musicFor(r) {
    var t = S().musicTheme;
    if (t && t !== "auto") return t;
    return r.music || "daylight";
  }

  // ───────── 动作库 ─────────
  function exMeta(ex) {
    var k = { static: "静态保持", dynamic: "动态", strength: "力量耐力", breath: "呼吸", nerve: "神经滑动" }[ex.kind];
    var amt = ex.r != null ? ex.r + " 次" : ex.d + " 秒";
    return k + " · " + amt + (ex.side === "each" ? " / 侧" : "");
  }
  function pageLibrary(_, qs) {
    var f = qs.f || "all", term = "";
    var areas = [["all", "全部"]].concat(D.PROFILE.issues.map(function (i) { return [i.area, i.label.replace(/，.*/, "")]; }));
    Object.keys(D.AREAS).forEach(function (a) { if (!areas.some(function (x) { return x[0] === a; })) areas.push([a, D.AREAS[a]]); });
    main.innerHTML = '<div class="top"><h1>动作库</h1><span class="muted small">' + D.EX.length + ' 个动作</span></div>' +
      '<input class="search" type="search" placeholder="搜索动作，例如：小腿、开肩、下犬" id="term">' +
      '<div class="filter" id="flt">' + areas.map(function (a) { return '<button data-f="' + a[0] + '" aria-pressed="' + (a[0] === f) + '">' + esc(a[1]) + "</button>"; }).join("") + "</div>" +
      '<div class="grid2" id="grid"></div>';
    function draw() {
      var list = D.EX.filter(function (e) {
        if (f !== "all" && e.area.indexOf(f) < 0) return false;
        if (term) { var hay = e.name + e.en + e.area.map(function (a) { return D.AREAS[a]; }).join("") + e.why + (e.basic && e.basic.how); return hay.toLowerCase().indexOf(term.toLowerCase()) >= 0; }
        return true;
      });
      q("#grid").innerHTML = list.map(function (e) {
        return '<a class="tile" href="#/ex/' + e.id + '"><div class="th">' + Figure.thumb(e, "basic") + "</div><h3>" + esc(e.name) + '</h3><div class="meta">' + esc(exMeta(e)) + "</div></a>";
      }).join("") || '<p class="muted">没有找到相关动作</p>';
    }
    qa("#flt button").forEach(function (b) { b.onclick = function () { f = b.getAttribute("data-f"); qa("#flt button").forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); draw(); }; });
    q("#term").oninput = function () { term = this.value.trim(); draw(); };
    var on = q('#flt [aria-pressed="true"]'); if (on) on.scrollIntoView({ inline: "center", block: "nearest" });
    draw();
  }

  function pageEx(id) {
    var ex = EXM[id];
    if (!ex) { main.innerHTML = '<p class="loading">没有找到这个动作。</p>'; return; }
    var lv = levelOf(id), mirror = false;
    var issues = D.PROFILE.issues.filter(function (i) { return ex.area.indexOf(i.area) >= 0; });
    main.innerHTML = '<a class="back" href="javascript:history.back()">' + icon("back") + "返回</a>" +
      '<p class="eyebrow">' + esc(ex.en) + "</p><h1 style=\"font-size:1.6rem\">" + esc(ex.name) + "</h1>" +
      '<div class="chips" style="margin-top:8px">' + ex.area.map(function (a) { return '<span class="chip">' + esc(D.AREAS[a]) + "</span>"; }).join("") + '<span class="chip acc">' + esc(exMeta(ex)) + "</span>" +
      issues.map(function (i) { return '<span class="chip hl">' + esc(i.label) + "</span>"; }).join("") + "</div>" +
      '<div class="stage"><div id="fig"></div><div class="legend"><i></i>主要拉伸 / 发力部位</div></div>' +
      '<div class="row"><div class="seg grow"><button data-lv="basic" aria-pressed="' + (lv === "basic") + '">基础：' + esc(ex.basic.name) + '</button><button data-lv="adv" aria-pressed="' + (lv === "adv") + '">进阶：' + esc(ex.adv.name) + "</button></div>" +
      (ex.side === "each" ? '<button class="iconbtn" id="mir" aria-label="看另一侧">' + icon("swap") + "</button>" : "") + "</div>" +
      '<div class="kv card"><h3>怎么做</h3><p id="how"></p><h3>动作要领</h3><ol class="cues" id="cues"></ol>' +
      "<h3>普拉提要领</h3><p>" + esc(ex.pi) + "</p></div>" +
      '<div class="note acc"><b>为什么给你选这个：</b>' + esc(ex.why) + "</div>" +
      '<div class="note warn"><b>注意：</b>' + esc(ex.care) + "</div>" +
      '<div class="grid2" style="grid-template-columns:1fr 1fr;margin-top:12px"><a class="btn primary" href="#/r/ex:' + ex.id + '?play=1">' + icon("play") + '单独练这个</a><a class="btn" href="#/coach?mode=mirror&ex=' + ex.id + '">' + icon("mirror", "ic") + "镜子对照</a></div>";
    var fig = Figure.mount(q("#fig"), ex, { level: lv });
    onLeave(function () { fig.stop(); });
    function how() {
      q("#how").textContent = (lv === "adv" ? ex.adv.how : ex.basic.how);
      q("#cues").innerHTML = cuesOf(ex, lv).map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("");
    }
    how();
    qa("[data-lv]").forEach(function (b) {
      b.onclick = function () {
        lv = b.getAttribute("data-lv"); state.levels[id] = lv; save();
        qa("[data-lv]").forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
        fig.setLevel(lv); how();
      };
    });
    var m = q("#mir"); if (m) m.onclick = function () { mirror = !mirror; fig.setMirror(mirror); toast(mirror ? "现在显示：左侧" : "现在显示：右侧"); };
  }

  // ───────── 教练（相机，按需加载）─────────
  function pageCoach(arg, qs) {
    main.innerHTML = '<p class="loading">正在打开教练……</p>';
    function go() { window.Coach.render(main, { arg: arg, qs: qs, ex: EXM, onLeave: onLeave, icon: icon, toast: toast, esc: esc, state: state, save: save }); }
    if (window.Coach) return go();
    var s = document.createElement("script"); s.src = "coach.js?v=" + encodeURIComponent(window.STRETCH_VERSION || "dev");
    s.onload = go; s.onerror = function () { main.innerHTML = '<p class="loading">教练模块加载失败，请检查网络。</p>'; };
    document.body.appendChild(s);
  }

  // ───────── 进度 ─────────
  var TESTS = [
    { id: "toe", name: "站立体前屈", unit: "cm", how: "双脚并拢、膝盖伸直，慢慢向下够。量指尖到地面的距离：碰到地面记 0，够不到记正数（比如 12）。数字越小越好。", lower: true },
    { id: "scrR", name: "背后摸手 · 右手在上", unit: "cm", how: "右手从肩上往下、左手从腰后往上，量两手中指之间的距离；能搭上记 0。数字越小越好。", lower: true },
    { id: "scrL", name: "背后摸手 · 左手在上", unit: "cm", how: "换左手在上，同样量距离。和右手在上对比，就是两侧肩的差距。", lower: true },
    { id: "kwL", name: "膝触墙 · 左脚", unit: "cm", how: "做膝触墙：脚跟不离地、膝盖还能碰到墙时，量脚尖到墙的最大距离。数字越大越好。" },
    { id: "kwR", name: "膝触墙 · 右脚", unit: "cm", how: "同上，换右脚。正常两侧差距应小于 2 厘米。" },
    { id: "balL", name: "闭眼单腿站 · 左", unit: "秒", how: "双手叉腰、闭眼，左脚单脚站立，记录能保持的秒数（最多 60 秒）。数字越大越好。" },
    { id: "balR", name: "闭眼单腿站 · 右", unit: "秒", how: "同上，换右脚。" }
  ];
  function lineChart(points, max, cls) {
    var W = 320, H = 120, L = 22, B = 18, n = points.length;
    if (!n) return '<p class="small muted">还没有记录。</p>';
    var xs = function (i) { return L + (n === 1 ? (W - L - 8) / 2 : i * (W - L - 8) / (n - 1)); };
    var ys = function (v) { return 8 + (1 - v / max) * (H - B - 8); };
    var path = points.map(function (p, i) { return (i ? "L" : "M") + xs(i).toFixed(1) + " " + ys(p.v).toFixed(1); }).join(" ");
    var grid = [0, max / 2, max].map(function (v) { return '<line class="ax" x1="' + L + '" x2="' + (W - 4) + '" y1="' + ys(v) + '" y2="' + ys(v) + '"/><text x="2" y="' + (ys(v) + 3) + '">' + v + "</text>"; }).join("");
    var labels = points.map(function (p, i) { return i === 0 || i === n - 1 || n < 8 ? '<text x="' + (xs(i) - 12) + '" y="' + (H - 4) + '">' + p.d.slice(5) + "</text>" : ""; }).join("");
    return '<svg class="chart" viewBox="0 0 ' + W + " " + H + '">' + grid + '<path class="ln ' + (cls || "") + '" d="' + path + '"/>' + points.map(function (p, i) { return '<circle class="pt ' + (cls || "") + '" cx="' + xs(i) + '" cy="' + ys(p.v) + '" r="3"/>'; }).join("") + labels + "</svg>";
  }
  function pageProgress() {
    var m = dayMap(), today = new Date(), wd = (today.getDay() + 6) % 7, start = addDays(today, -wd - 7 * 15), cells = "";
    for (var i = 0; i < 16 * 7; i++) {
      var d = addDays(start, i), k = dkey(d), v = m[k], lvl = 0;
      if (v) { var c = v.day + v.night + v.sport; lvl = c >= 3 ? 3 : c; }
      cells += '<i class="' + (lvl ? "l" + lvl : "") + (k === dkey() ? " t" : "") + '" title="' + k + '"></i>';
      if (d >= today) break;
    }
    var totalMin = Math.round(state.sessions.reduce(function (a, s) { return a + (s.secs || 0); }, 0) / 60);
    var ck = Object.keys(state.checkins).sort().slice(-30);
    var foot = ck.filter(function (k) { return state.checkins[k].foot != null; }).map(function (k) { return { d: k, v: state.checkins[k].foot }; });
    var numb = ck.filter(function (k) { return state.checkins[k].numb != null; });
    var numbDays = numb.filter(function (k) { return state.checkins[k].numb > 0; }).length;
    var ach = earned();
    var tests = state.tests.slice(-6);
    main.innerHTML = '<div class="top"><h1>进度</h1></div>' +
      '<div class="kpis"><div><b>' + streak() + '</b><span>当前连续天数</span></div><div><b>' + bestStreak() + '</b><span>最长连续</span></div><div><b>' + totalMin + "</b><span>累计分钟</span></div></div>" +
      '<div class="card"><h2>最近 16 周</h2><p class="small muted">颜色越深，那天练得越多（白天、睡前、球场各算一次）</p><div class="heat">' + cells + "</div></div>" +
      '<div class="card"><h2>右脚跟晨起疼痛</h2><p class="small muted">最近 30 天，0–10 分。目标是一路向下。</p>' + lineChart(foot, 10) + "</div>" +
      '<div class="card"><h2>右胳膊发麻</h2><p>最近 ' + numb.length + " 天的记录里，有 <b>" + numbDays + "</b> 天发麻。</p>" +
      (numbDays >= 5 ? '<div class="note warn">两周内发麻天数较多，建议请医生或物理治疗师检查颈椎和胸廓出口。</div>' : '<p class="small muted">若出现持续麻木、手无力、夜里麻醒，请尽快就医。</p>') + "</div>" +
      '<div class="card"><div class="row"><h2 class="grow">柔韧与平衡测试</h2><button class="btn small primary" id="addTest">记录一次</button></div><p class="small muted">建议每两周测一次，同一时间、同样热身后测。</p>' +
      (tests.length ? '<div style="overflow-x:auto"><table class="t"><tr><th>项目</th>' + tests.map(function (t) { return "<th>" + t.date.slice(5) + "</th>"; }).join("") + "</tr>" +
        TESTS.map(function (T) { return "<tr><td>" + esc(T.name) + "</td>" + tests.map(function (t) { return "<td class=\"num\">" + (t[T.id] != null && t[T.id] !== "" ? t[T.id] : "–") + "</td>"; }).join("") + "</tr>"; }).join("") + "</table></div>" : '<p class="muted">还没有测试记录。第一次测量就是你的起点。</p>') + "</div>" +
      '<div class="card"><h2>成就</h2><div class="badges" style="margin-top:10px">' + D.ACHIEVEMENTS.map(function (a) { return '<div class="' + (ach[a.id] ? "on" : "") + '" title="' + esc(a.desc) + '"><div class="bi">' + icon(a.icon) + "</div>" + esc(a.name) + "</div>"; }).join("") + "</div></div>" +
      '<div class="card"><h2>最近练习</h2>' + (state.sessions.slice(-8).reverse().map(function (s) { var r = getRoutine(s.rid); return '<div class="field"><div><b>' + esc(r ? r.name : s.rid) + "</b><small>" + s.date + " · " + mins(s.secs || 0) + " 分钟" + (s.level === "adv" ? " · 进阶" : "") + (s.partial ? " · 部分完成" : "") + "</small></div><span>" + (["", "😣", "😕", "🙂", "😊", "🤩"][s.feel || 0] || "") + "</span></div>"; }).join("") || '<p class="muted">还没有记录。</p>') + "</div>";
    q("#addTest").onclick = testModal;
  }
  function testModal() {
    var last = state.tests[state.tests.length - 1] || {};
    var box = document.createElement("div"); box.className = "modal";
    box.innerHTML = '<div class="box"><h2>记录测试 · ' + dkey() + '</h2><p class="small muted">不想测的项目留空即可。</p>' +
      TESTS.map(function (T) { return '<div class="field"><div><label for="t_' + T.id + '">' + esc(T.name) + "</label><small>" + esc(T.how) + '</small></div><input type="number" inputmode="decimal" id="t_' + T.id + '" placeholder="' + (last[T.id] != null ? "上次 " + last[T.id] : T.unit) + '"></div>'; }).join("") +
      '<div class="row" style="margin-top:14px"><button class="btn grow" id="tc">取消</button><button class="btn primary grow" id="ts">保存</button></div></div>';
    document.body.appendChild(box);
    q("#tc", box).onclick = function () { box.remove(); };
    box.onclick = function (e) { if (e.target === box) box.remove(); };
    q("#ts", box).onclick = function () {
      var rec = { date: dkey() }, any = false;
      TESTS.forEach(function (T) { var v = q("#t_" + T.id, box).value; if (v !== "") { rec[T.id] = +v; any = true; } });
      if (any) { state.tests = state.tests.filter(function (t) { return t.date !== rec.date; }); state.tests.push(rec); save(); toast("已保存"); }
      box.remove(); pageProgress();
    };
  }

  // ───────── 设置 ─────────
  function pageSettings() {
    var s = S(), base = location.href.split("#")[0];
    var voices = Sound.voices();
    var links = [["day", "今天的白天拉伸"], ["night", "今天的睡前拉伸"], ["wake", "起床足底唤醒"], ["badminton", "羽毛球热身"], ["tennis", "网球热身"]];
    main.innerHTML = '<a class="back" href="#/today">' + icon("back") + "今天</a><h1>设置</h1>" +
      '<h2 class="sec">声音</h2><div class="card">' +
      sw("voiceOn", "语音指导", "动作讲解、要领提示、报数") +
      '<div class="field"><div><label for="vsel">指导声音</label><small>「自然人声」是预先合成好的轻柔女声，最舒缓；「手机系统声音」不用下载，但比较机械</small></div><select id="vsel"><option value="">自动（自然人声优先）</option><optgroup label="自然人声" id="vpack"></optgroup><optgroup label="手机系统声音">' +
      voices.map(function (v) { return '<option value="' + esc(v.voiceURI) + '"' + (s.voice === v.voiceURI ? " selected" : "") + ">" + esc(v.name) + " (" + esc(v.lang) + ")</option>"; }).join("") + "</optgroup></select></div>" +
      '<div class="field"><label for="rate">语速<small>只对系统声音有效</small></label><input type="range" id="rate" min="0.75" max="1.25" step="0.05" value="' + s.rate + '"></div>' +
      '<div class="field"><label for="vv">语音音量</label><input type="range" id="vv" min="0.2" max="1" step="0.05" value="' + s.voiceVol + '"></div>' +
      '<div class="field"><label>试听</label><button class="btn small" id="vtest">' + icon("voice") + "听一下</button></div>" +
      sw("count", "力量动作报数", "臀桥、提踵等动作数「一、二、三……」") +
      '<div class="field"><div><label for="exp">详细讲解</label><small>自动：同一个动作前 3 次详细讲，之后只说要点</small></div><select id="exp"><option value="auto">自动</option><option value="always">每次都讲</option><option value="brief">只说动作名</option></select></div>' +
      sw("musicOn", "背景音乐", "手机本地实时生成，不耗流量") +
      '<div class="field"><div><label for="mt">音乐风格</label><small>自动：白天晨光/溪流，睡前夜空/海浪，热身律动</small></div><select id="mt"><option value="auto">自动匹配</option>' + Object.keys(Sound.THEMES).map(function (k) { return '<option value="' + k + '"' + (s.musicTheme === k ? " selected" : "") + ">" + Sound.THEMES[k].name + " · " + Sound.THEMES[k].desc + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="mv">音乐音量</label><input type="range" id="mv" min="0.1" max="1" step="0.05" value="' + s.musicVol + '"></div>' +
      '<div class="field"><label>试听音乐</label><button class="btn small" id="mtest">' + icon("music") + "<span>播放</span></button></div></div>" +
      '<h2 class="sec">练习</h2><div class="card">' +
      sw("asym", "左右不对称加量", "右肩、右前臂神经滑动、右足底多做；左脚踝平衡多做") +
      '<div class="field"><div><label for="prep">动作之间准备时间</label><small>秒</small></div><input type="number" id="prep" min="4" max="20" value="' + s.prepSecs + '"></div>' +
      '<div class="field"><label for="thm">外观</label><select id="thm"><option value="auto">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></div>' +
      '<div class="field"><div><label for="fst">示范画风</label><small>肌肉：显示肌肉纹理，正在拉伸的肌肉标红；简笔：简洁线条小人</small></div><select id="fst"><option value="anatomy">肌肉</option><option value="line">简笔</option></select></div></div>' +
      '<h2 class="sec">提醒</h2><div class="card">' +
      '<div class="field"><label for="wt">起床足底唤醒</label><input type="time" id="wt" value="' + s.wakeTime + '"></div>' +
      '<div class="field"><label for="dt">白天拉伸</label><input type="time" id="dt" value="' + s.dayTime + '"></div>' +
      '<div class="field"><label for="nt">睡前拉伸</label><input type="time" id="nt" value="' + s.nightTime + '"></div>' +
      '<button class="btn block primary" id="ics" style="margin-top:10px">' + icon("clock") + "加入手机日历（每天提醒）</button>" +
      '<p class="small muted">会生成三个每天重复的日历事件，点开事件里的链接就能直接开始。</p></div>' +
      '<h2 class="sec">做成手机 App</h2><div class="card"><ol class="steps"><li>用 <b>Safari</b> 打开本页。</li><li>点底部的「分享」按钮 → 「添加到主屏幕」。</li><li>主屏幕上会出现「Grace 拉伸」图标，打开后全屏运行，和 App 一样。</li></ol>' +
      '<h3 style="font-size:1rem;margin-top:14px">用「快捷指令」定时自动打开</h3><ol class="steps"><li>打开「快捷指令」App → 底部「自动化」→ 右上角「+」→「特定时间」。</li><li>设定时间（比如 21:45），选择「立即运行」。</li><li>添加操作「打开 URL」，粘贴下面对应的链接。</li></ol>' +
      links.map(function (l) { return '<div class="field"><div><b>' + l[1] + '</b><small class="code">' + esc(base + "#/go/" + l[0]) + '</small></div><button class="btn small" data-copy="' + esc(base + "#/go/" + l[0]) + '">复制</button></div>'; }).join("") + "</div>" +
      '<h2 class="sec">数据</h2><div class="card"><p class="small muted">所有记录只保存在这台手机的浏览器里，不上传任何地方。换手机前先导出。</p>' +
      '<div class="row"><button class="btn grow" id="exp1">导出备份</button><label class="btn grow">导入备份<input type="file" accept="application/json" id="imp" hidden></label></div></div>' +
      '<h2 class="sec">安全须知</h2><div class="card small"><p>本应用参考物理治疗和普拉提的常用方法设计，不能代替医生或物理治疗师的面诊。</p>' +
      "<p>出现以下情况请停止并就医：拉伸时刺痛或电击感；麻木持续不退或范围扩大；手或脚无力；足跟疼痛伴肿胀、夜间痛；旧伤处突然疼痛加剧。</p>" +
      '<p class="muted">版本 ' + esc(window.STRETCH_VERSION) + "</p></div>";
    function sw(key, label, sub) { return '<div class="field"><div><label for="s_' + key + '">' + label + "</label><small>" + sub + '</small></div><label class="switch"><input type="checkbox" id="s_' + key + '"' + (s[key] ? " checked" : "") + "><span></span></label></div>"; }
    ["voiceOn", "count", "musicOn", "asym"].forEach(function (k) { q("#s_" + k).onchange = function () { s[k] = this.checked; save(); applySound(); }; });
    q("#exp").value = s.explain; q("#exp").onchange = function () { s.explain = this.value; save(); };
    q("#fst").value = s.figStyle || "anatomy"; q("#fst").onchange = function () { s.figStyle = this.value; save(); Figure.setStyle(s.figStyle); toast(s.figStyle === "line" ? "已切换为简笔小人" : "已切换为肌肉人"); };
    q("#thm").value = s.theme; q("#thm").onchange = function () { s.theme = this.value; save(); applyTheme(); };
    q("#vsel").onchange = function () { s.voice = this.value; save(); applySound(); Sound.unlock(); Sound.say(L.test); };
    Sound.packVoices().then(function (vs) {
      var g = q("#vpack"); if (!g) return;
      if (!vs.length) { g.remove(); return; }
      g.innerHTML = vs.map(function (v) { return '<option value="pack:' + esc(v.id) + '"' + (s.voice === "pack:" + v.id ? " selected" : "") + ">" + esc(v.name) + " · " + esc(v.desc) + "</option>"; }).join("");
    });
    q("#rate").oninput = function () { s.rate = +this.value; save(); applySound(); };
    q("#vv").oninput = function () { s.voiceVol = +this.value; save(); applySound(); };
    q("#mv").oninput = function () { s.musicVol = +this.value; save(); applySound(); };
    q("#mt").onchange = function () { s.musicTheme = this.value; save(); if (Sound.current()) { Sound.stopMusic(.3); Sound.startMusic(s.musicTheme === "auto" ? "daylight" : s.musicTheme); } };
    q("#prep").onchange = function () { s.prepSecs = Math.max(4, Math.min(20, +this.value || 7)); save(); };
    q("#vtest").onclick = function () { Sound.unlock(); Sound.say(L.test); };
    q("#mtest").onclick = function () {
      Sound.unlock();
      if (Sound.current()) { Sound.stopMusic(); this.querySelector("span").textContent = "播放"; }
      else { Sound.startMusic(s.musicTheme === "auto" ? "daylight" : s.musicTheme); this.querySelector("span").textContent = "停止"; }
    };
    onLeave(function () { Sound.stopMusic(.5); });
    ["wt", "dt", "nt"].forEach(function (id, i) { q("#" + id).onchange = function () { s[["wakeTime", "dayTime", "nightTime"][i]] = this.value; save(); }; });
    q("#ics").onclick = function () { downloadICS(base); };
    qa("[data-copy]").forEach(function (b) {
      b.onclick = function () {
        var t = b.getAttribute("data-copy");
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast("已复制"); }).catch(function () { prompt("复制这个链接：", t); });
      };
    });
    q("#exp1").onclick = function () {
      var blob = new Blob([JSON.stringify(state, null, 1)], { type: "application/json" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "grace-stretch-" + dkey() + ".json"; document.body.appendChild(a); a.click(); a.remove();
    };
    q("#imp").onchange = function () {
      var f = this.files[0]; if (!f) return;
      f.text().then(function (t) {
        var o = JSON.parse(t); if (!o || !o.sessions) throw new Error("bad");
        localStorage.setItem(KEY, JSON.stringify(o)); state = load(); applySound(); toast("已导入"); pageSettings();
      }).catch(function () { toast("文件不对，导入失败"); });
    };
  }
  function downloadICS(base) {
    var s = S(), now = new Date(), stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    function ev(uid, time, title, path, desc) {
      var hm = time.split(":"), d = dkey(now).replace(/-/g, "");
      return ["BEGIN:VEVENT", "UID:grace-stretch-" + uid + "@lingliang", "DTSTAMP:" + stamp, "DTSTART:" + d + "T" + hm[0] + hm[1] + "00", "DURATION:PT15M",
        "RRULE:FREQ=DAILY", "SUMMARY:" + title, "DESCRIPTION:" + desc + "\\n" + base + "#/go/" + path, "URL:" + base + "#/go/" + path,
        "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + title, "TRIGGER:PT0M", "END:VALARM", "END:VEVENT"].join("\r\n");
    }
    var ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Grace Stretch//CN", "CALSCALE:GREGORIAN",
      ev("wake", s.wakeTime, "起床前 · 足底唤醒", "wake", "下床前在床上做 3 分钟"),
      ev("day", s.dayTime, "白天拉伸", "day", "今天的白天拉伸"),
      ev("night", s.nightTime, "睡前拉伸", "night", "放下手机前的最后一件事"), "END:VCALENDAR"].join("\r\n");
    var blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href = url; a.download = "grace-stretch.ics"; document.body.appendChild(a); a.click(); a.remove();
    toast("已生成日历文件，按提示「添加」即可");
  }

  // ───────── 播放器 ─────────
  var Player = (function () {
    var el = null, r = null, steps = [], i = 0, t = 0, running = false, last = 0, raf = 0, fired = {}, fig = null, figKey = "", lock = null;
    var workDone = 0, totalWork = 0, cueText = "", sheetOpen = false, startedAt = 0, usedAdv = false;

    function build(routine) {
      var out = [], explain = S().explain;
      routine.items.forEach(function (it, idx) {
        var segs = segsFor(it), ex = EXM[it[0]];
        segs.forEach(function (sg, k) {
          var lv = levelOf(ex.id);
          var how = lv === "adv" ? ex.adv.how : ex.basic.how;
          var detailed = explain === "always" || (explain === "auto" && (state.exCount[ex.id] || 0) < 3);
          var intro;
          if (k === 0) {
            intro = [idx === 0 ? L.first : idx === routine.items.length - 1 ? L.last : L.next, ex.name];
            if (sg.side === "L") intro.push(L.leftFirst);
            if (detailed) intro.push(sp(how));
            else { if (lv === "adv") intro.push(L.advPrefix, ex.adv.name); intro.push(cuesOf(ex, lv)[0]); }
          } else intro = [L.switchR, cuesOf(ex, lv)[0]];
          var prep = k === 0 ? Math.max(idx === 0 ? 5 : S().prepSecs, Math.ceil(Sound.speechSecs(intro)) + 2) : Math.max(5, Math.ceil(Sound.speechSecs(intro)) + 1.5);
          out.push({ type: "prep", ex: ex, side: sg.side, secs: prep, idx: idx, k: k, intro: intro, how: how });
          out.push({ type: "work", ex: ex, side: sg.side, secs: sg.secs, reps: sg.reps, tempo: sg.tempo, idx: idx, k: k, last: k === segs.length - 1 });
        });
      });
      return out;
    }

    function open(routine) {
      if (el) close(true);
      Sound.unlock();
      r = routine; steps = build(r); i = 0; t = 0; fired = {}; workDone = 0; usedAdv = false; startedAt = Date.now();
      totalWork = steps.reduce(function (a, s) { return a + (s.type === "work" ? s.secs : 0); }, 0);
      el = document.createElement("div");
      el.className = "player g-" + (r.color || "sage");
      el.innerHTML = '<div class="pbar">' + r.items.map(function () { return "<i><b></b></i>"; }).join("") + "</div>" +
        '<div class="ptop"><button class="pbtn" data-a="close" aria-label="结束">' + icon("close") + '</button><div class="ttl" id="pttl"></div><button class="pbtn" data-a="info" aria-label="动作说明">' + icon("info") + "</button></div>" +
        '<div class="pstage"><div class="pfig" id="pfig"></div><div class="pname"><p class="peyebrow" id="peb"></p><h2 id="pname"></h2><span class="pside" id="pside"></span><span class="plevel" id="plevel"></span></div>' +
        '<div class="pclock"><div class="ring"><div class="breathe" id="pbr"></div><svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="52"/><circle class="fg" id="pring" cx="60" cy="60" r="52" stroke-dasharray="326.7" stroke-dashoffset="0"/></svg><div class="val" id="pval"></div></div></div>' +
        '<p class="pcue" id="pcue"></p></div>' +
        '<div class="pctl"><button class="pbtn" data-a="prev" aria-label="上一个">' + icon("prev") + '</button><button class="pbtn main" data-a="toggle" aria-label="暂停"><svg viewBox="0 0 24 24" id="ptg">' + IC.pause + '</svg></button><button class="pbtn" data-a="next" aria-label="下一个">' + icon("next") + "</button></div>" +
        '<div class="pdock"><button data-a="voice" class="' + (S().voiceOn ? "" : "off") + '">' + icon("voice") + '语音</button><button data-a="music" class="' + (S().musicOn ? "" : "off") + '">' + icon("music") + '<span id="pmus"></span></button><button data-a="level">' + icon("level") + '<span id="plv"></span></button></div>' +
        '<div class="sheet" id="psheet"></div>';
      document.body.appendChild(el);
      document.body.style.overflow = "hidden";
      qa("[data-a]", el).forEach(function (b) { b.onclick = function () { act(b.getAttribute("data-a")); }; });
      Sound.startMusic(musicFor(r));
      q("#pmus", el).textContent = (Sound.THEMES[musicFor(r)] || {}).name || "音乐";
      requestLock();
      document.addEventListener("visibilitychange", onVis);
      running = true; last = performance.now();
      enter();
      raf = requestAnimationFrame(loop);
    }
    function onVis() { if (document.visibilityState === "visible" && el) requestLock(); }
    function requestLock() { try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then(function (l) { lock = l; }).catch(function () { }); } catch (e) { /* 不支持 */ } }

    function close(silent) {
      if (!el) return;
      cancelAnimationFrame(raf); if (fig) fig.stop(); fig = null; figKey = "";
      Sound.quiet(); Sound.stopMusic(1.2);
      if (lock) { try { lock.release(); } catch (e) { /* 忽略 */ } lock = null; }
      document.removeEventListener("visibilitychange", onVis);
      el.remove(); el = null; document.body.style.overflow = "";
      if (!silent && workDone >= 60 && workDone < totalWork * .98) {
        var rec = record(true);
        toast("已记录 " + mins(rec.secs) + " 分钟（部分完成）");
      }
      if (location.hash.indexOf("play=1") >= 0) history.replaceState(null, "", location.hash.replace(/[?&]play=1/, ""));
      if (!silent) route();
    }
    function record(partial) {
      var lv = usedAdv || S().level === "adv" ? "adv" : "basic";
      var rec = { date: dkey(), ts: Date.now(), rid: r.id, secs: Math.round(workDone), level: lv };
      if (partial) rec.partial = true;
      state.sessions.push(rec);
      r.items.forEach(function (it) { state.exCount[it[0]] = (state.exCount[it[0]] || 0) + 1; });
      save();
      return rec;
    }

    function cur() { return steps[i]; }
    function enter() {
      var s = cur(); fired = {};
      if (!s) return finish();
      var ex = s.ex, lv = levelOf(ex.id);
      if (lv === "adv") usedAdv = true;
      s.cues = cuesOf(ex, lv);
      var key = ex.id + "|" + s.side + "|" + lv;
      if (key !== figKey) {
        if (fig) fig.stop();
        fig = Figure.mount(q("#pfig", el), ex, { level: lv, mirror: s.side === "L" });
        figKey = key;
      }
      q("#pname", el).textContent = ex.name;
      var sd = q("#pside", el); sd.textContent = s.side === "L" ? "左侧" : s.side === "R" ? "右侧" : (ex.side === "both" ? "双侧" : ""); sd.style.display = sd.textContent ? "" : "none";
      q("#plevel", el).textContent = lv === "adv" ? "进阶 · " + ex.adv.name : "基础 · " + ex.basic.name;
      q("#plv", el).textContent = lv === "adv" ? "进阶" : "基础";
      q("#pttl", el).textContent = r.name + " · " + (s.idx + 1) + "/" + r.items.length;
      var nx = steps[i + 1];
      el.classList.toggle("prepping", s.type === "prep");
      if (s.type === "prep") {
        q("#peb", el).textContent = (s.k ? "换边 · 准备" : s.idx === 0 ? "准备开始" : "下一个 · 准备") + (nx ? " · " + (nx.reps ? nx.reps + " 次" : nx.secs + " 秒") : "");
        Sound.say(s.intro);
        Sound.prefetch(s.cues.concat(nx && nx.reps ? [] : [L.ten]));
        setCue(s.k ? s.cues[0] : s.how);
      } else {
        q("#peb", el).textContent = s.reps ? "共 " + s.reps + " 次" : "保持 " + s.secs + " 秒";
        setCue(ex.kind === "breath" ? "跟着圆圈呼吸" : s.cues[0]);
      }
      for (var n = i + 1; n < steps.length; n++) if (steps[n].type === "prep") { Sound.prefetch(steps[n].intro); break; }
      if (sheetOpen) fillSheet();
      paintBar();
    }
    function setCue(txt) { cueText = txt; var c = q("#pcue", el); if (c) c.textContent = txt; }
    function once(k) { if (fired[k]) return false; fired[k] = 1; return true; }

    function loop(now) {
      if (!el) return;
      var dt = Math.min(.5, (now - last) / 1000); last = now;
      if (running) {
        t += dt;
        var s = cur();
        if (s && s.type === "work") workDone += dt;
        events(s);
        if (s && t >= s.secs) { advance(); }
      }
      paint();
      raf = requestAnimationFrame(loop);
    }
    function advance() {
      var s = cur();
      if (s && s.type === "work") Sound.chime(s.last ? "go" : "side");
      i++; t = 0;
      enter();
    }
    function events(s) {
      if (!s) return;
      var rem = s.secs - t, ex = s.ex;
      if (s.type === "prep") {
        if (rem <= 3 && rem > 0 && once("tick" + Math.ceil(rem))) Sound.chime("tick");
        return;
      }
      if (t < .05 && once("go")) Sound.chime("go");
      if (ex.kind === "breath") return breathEvents(s);
      if (s.reps) {
        var rep = Math.floor(t / s.tempo);
        var canCount = S().count && s.tempo >= 2.4 && s.reps > 1 && (ex.kind === "strength" || ex.kind === "nerve" || ex.kind === "dynamic");
        if (canCount && rep >= 1 && rep <= s.reps && once("rep" + rep)) {
          Sound.say(rep === s.reps - 1 && s.reps >= 4 ? L.lastRep : rep <= 60 ? Sound.NUM.rep(rep) : null, { interrupt: false });
        }
        if (!canCount) cuesAt(s, [.3, .65]);
        else if (rep === Math.floor(s.reps / 2) && once("midcue")) setCue(s.cues[1 % s.cues.length]);
        if (s.reps > 1 && rep === s.reps - 1 && once("lastcue")) setCue("最后一次");
      } else {
        cuesAt(s, s.secs >= 40 ? [.15, .4, .65] : s.secs >= 20 ? [.25, .6] : [.4]);
        if (s.secs >= 30 && rem <= 10 && once("ten")) Sound.say(L.ten, { interrupt: false });
      }
      if (rem <= 3 && rem > 0 && once("tick" + Math.ceil(rem))) Sound.chime("tick");
    }
    function cuesAt(s, fr) {
      fr.forEach(function (f, n) {
        if (t >= s.secs * f && once("cue" + n)) {
          var cs = s.cues, c = cs[(n + 1 + (s.k || 0)) % cs.length];
          setCue(c); Sound.say(c, { interrupt: false });
        }
      });
    }
    function breathEvents(s) {
      var cyc = 10, ph = t % cyc, n = Math.floor(t / cyc), br = q("#pbr", el);
      br.classList.add("on");
      var inhale = ph < 4;
      br.classList.toggle("in", inhale);
      if (once("b" + n + (inhale ? "i" : "o"))) {
        var txt = inhale ? L.inhale : L.exhale;
        var extra = !inhale && n % 2 === 1 ? s.cues[(Math.floor(n / 2) + 2) % s.cues.length] : "";
        setCue(inhale ? "吸气 · 4 秒" : "呼气 · 6 秒" + (extra ? " · " + extra : ""));
        if (n < 3 || extra) Sound.say(extra && !inhale ? extra : txt, { interrupt: false, slow: true });
      }
    }

    function paint() {
      var s = cur(); if (!s) return;
      var rem = Math.max(0, s.secs - t), frac = Math.min(1, t / s.secs);
      var ring = q("#pring", el), val = q("#pval", el), br = q("#pbr", el);
      if (s.type === "prep") {
        ring.style.strokeDashoffset = 326.7 * frac; val.innerHTML = '<div><span class="num">' + Math.ceil(rem) + "</span><small>准备</small></div>";
        br.classList.remove("on");
      } else if (s.reps) {
        var rep = Math.min(s.reps, Math.floor(t / s.tempo) + 1);
        ring.style.strokeDashoffset = 326.7 * frac;
        val.innerHTML = '<div><span class="num">' + rep + '</span><small>/ ' + s.reps + " 次</small></div>";
        if (s.ex.kind !== "breath") br.classList.remove("on");
      } else {
        ring.style.strokeDashoffset = 326.7 * frac;
        val.innerHTML = '<div><span class="num">' + Math.ceil(rem) + "</span><small>秒</small></div>";
        if (s.ex.kind !== "breath") { br.classList.toggle("on", s.ex.kind === "static" && s.secs >= 25); br.classList.toggle("in", (t % 10) < 4); }
      }
    }
    function paintBar() {
      var s = cur(); if (!s) return;
      qa(".pbar i b", el).forEach(function (b, n) { b.style.width = n < s.idx ? "100%" : n === s.idx ? "50%" : "0"; });
    }

    function jump(dir) {
      var s = cur(); if (!s) return;
      var target = s.idx + dir;
      if (dir < 0 && (t > 3 || s.type === "work") && s.k === 0 && s.type === "prep") target = s.idx - 1;
      if (target < 0) target = 0;
      if (target >= r.items.length) { finish(); return; }
      for (var n = 0; n < steps.length; n++) if (steps[n].idx === target && steps[n].type === "prep" && steps[n].k === 0) { i = n; t = 0; Sound.quiet(); enter(); return; }
    }
    function act(a) {
      if (a === "close") { if (workDone > 20 && !confirm("结束这次练习吗？")) return; close(); }
      else if (a === "toggle") {
        running = !running;
        q("#ptg", el).innerHTML = running ? IC.pause : IC.play;
        if (running) { Sound.resume(); if (fig) fig.resume(); last = performance.now(); } else { Sound.quiet(); Sound.pause(); if (fig) fig.pause(); }
      }
      else if (a === "next") jump(1);
      else if (a === "prev") jump(-1);
      else if (a === "voice") { S().voiceOn = !S().voiceOn; save(); applySound(); if (!S().voiceOn) Sound.quiet(); q('[data-a="voice"]', el).classList.toggle("off", !S().voiceOn); toast(S().voiceOn ? "语音已开" : "语音已关"); }
      else if (a === "music") {
        var keys = Object.keys(Sound.THEMES), curM = Sound.current();
        if (!S().musicOn) { S().musicOn = true; save(); applySound(); Sound.startMusic(curM || musicFor(r)); }
        else {
          var nx = keys.indexOf(curM) + 1;
          if (nx >= keys.length) { S().musicOn = false; save(); applySound(); toast("音乐已关"); }
          else { Sound.startMusic(keys[nx]); toast("音乐：" + Sound.THEMES[keys[nx]].name); }
        }
        q('[data-a="music"]', el).classList.toggle("off", !S().musicOn);
        q("#pmus", el).textContent = S().musicOn ? Sound.THEMES[Sound.current() || musicFor(r)].name : "音乐关";
      }
      else if (a === "level") {
        var ex = cur().ex, lv = levelOf(ex.id) === "adv" ? "basic" : "adv";
        state.levels[ex.id] = lv; save(); figKey = ""; enter();
        toast(lv === "adv" ? "这个动作切到进阶：" + ex.adv.name : "这个动作切回基础：" + ex.basic.name);
      }
      else if (a === "info") { sheetOpen = !sheetOpen; if (sheetOpen) fillSheet(); q("#psheet", el).classList.toggle("open", sheetOpen); }
    }
    function fillSheet() {
      var ex = cur().ex, lv = levelOf(ex.id);
      q("#psheet", el).innerHTML = '<div class="grab"></div><h2>' + esc(ex.name) + '</h2><div class="kv"><h3>怎么做（' + (lv === "adv" ? "进阶" : "基础") + "）</h3><p>" + esc(lv === "adv" ? ex.adv.how : ex.basic.how) + "</p><h3>动作要领</h3><ol class=\"cues\">" +
        cuesOf(ex, lv).map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ol><h3>普拉提要领</h3><p>" + esc(ex.pi) + '</p></div><div class="note acc">' + esc(ex.why) + '</div><div class="note warn">' + esc(ex.care) + '</div><button class="btn block" id="shc">收起</button>';
      q("#shc", el).onclick = function () { act("info"); };
    }

    function finish() {
      cancelAnimationFrame(raf); running = false;
      if (fig) fig.stop();
      Sound.quiet(); Sound.chime("done");
      var before = earned();
      var rec = record(workDone < totalWork * .5);
      var after = earned(), fresh = D.ACHIEVEMENTS.filter(function (a) { return after[a.id] && !before[a.id]; });
      var st = streak();
      var praise = D.PRAISE[{ night: "night", pre: "pre", post: "post", morning: "morning" }[r.slot] || "other"];
      setTimeout(function () { Sound.say([L.done, praise].concat(st > 1 && st <= 60 ? [Sound.NUM.days(st)] : [])); }, 900);
      var f = document.createElement("div"); f.className = "finish";
      f.innerHTML = '<div class="confetti">' + Array.apply(null, Array(36)).map(function (_, n) { return '<i style="left:' + (Math.random() * 100).toFixed(1) + "%;background:" + ["#FFD27A", "#FFFFFF", "#FFB59C", "#9FE0D2"][n % 4] + ";animation-delay:" + (Math.random() * .8).toFixed(2) + 's"></i>'; }).join("") + "</div>" +
        '<p class="eyebrow" style="color:rgba(255,255,255,.8)">' + esc(r.name) + "</p><h2>完成了！</h2><p>" + praise + "。</p>" +
        '<div class="stats"><div><b>' + mins(rec.secs) + "</b><span>分钟</span></div><div><b>" + r.items.length + "</b><span>个动作</span></div><div><b>" + st + "</b><span>天连续</span></div></div>" +
        (fresh.length ? "<div>" + fresh.map(function (a) { return '<span class="badge">' + icon(a.icon) + " 新成就：" + esc(a.name) + "</span>"; }).join("") + "</div>" : "") +
        '<p style="margin-top:16px">现在身体感觉怎么样？</p><div class="feel">' + ["😣", "😕", "🙂", "😊", "🤩"].map(function (e, n) { return '<button data-f="' + (n + 1) + '">' + e + "</button>"; }).join("") + "</div>" +
        '<button class="btn" style="background:#fff;color:#1C2627;border:0;min-width:200px" id="fdone">完成</button>';
      el.appendChild(f);
      qa("[data-f]", f).forEach(function (b) { b.onclick = function () { rec.feel = +b.getAttribute("data-f"); save(); qa("[data-f]", f).forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); }; });
      q("#fdone", f).onclick = function () { close(true); route(); };
    }

    return { open: open, close: close };
  })();

  // ───────── 版本检查：Kevin 推送新版本后自动提示刷新 ─────────
  function checkVersion() {
    fetch("version.json?t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.v && window.STRETCH_VERSION !== "dev" && j.v !== window.STRETCH_VERSION) {
        var b = document.getElementById("update"); b.hidden = false; b.onclick = function () { location.reload(); };
      }
    }).catch(function () { });
  }
  setInterval(checkVersion, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") checkVersion(); });

  window.StretchApp = { state: function () { return state; }, save: save, Player: Player, EXM: EXM };
  route();
})();
