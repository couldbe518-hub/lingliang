/* Natalie 吉他 · 主程序。所有功能在手机浏览器里运行，不调用任何 AI 或后端。 */
(function () {
  "use strict";
  var G = window.Guitar, DATA = window.GUITAR_DATA, SONGS = DATA.songs, SONG = {};
  SONGS.forEach(function (s) { SONG[s.id] = s; });
  var VERSION = window.GUITAR_VERSION || "dev";
  var $ = function (q, el) { return (el || document).querySelector(q); };
  var $$ = function (q, el) { return Array.prototype.slice.call((el || document).querySelectorAll(q)); };
  var CAT_NAME = { warm: "基础练习", hymn: "赞美诗", classic: "经典歌曲" };
  var LEVEL_NAME = { 1: "入门", 2: "初级", 3: "中级" };
  var PART_NAME = { melody: "单音旋律", chords: "和弦扫弦" };
  var MODE_NAME = { wait: "跟谱练", tempo: "跟拍练" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function now() { return performance.now() / 1000; }
  function toast(msg, ms) { var t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("show"); }, ms || 2600); }
  function nm(m) { return G.midiName(m).replace("#", "♯"); }

  /* ───────── 本机存储 ───────── */
  var KEY = "natalieGuitar.v1", state = load();
  function load() {
    var s = null; try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { }
    s = s || {}; s.days = s.days || {}; s.songs = s.songs || {}; s.quiz = s.quiz || { stats: {}, best: {} }; s.settings = s.settings || {};
    if (!s.settings.current || !SONG[s.settings.current]) s.settings.current = "twinkle";
    if (!s.settings.speed) s.settings.speed = 0.8;
    if (s.settings.metro === undefined) s.settings.metro = true;
    return s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { } }
  function today() { var k = dayKey(); state.days[k] = state.days[k] || { sec: 0 }; return state.days[k]; }
  function markDone(step) { var d = today(); if (!d[step]) { d[step] = true; save(); } }
  function dayActive(d) { return d && (d.tune || d.warm || d.quiz || d.song || d.rec || (d.sec || 0) >= 120); }
  function streak() { var n = 0, d = new Date(); if (!dayActive(state.days[dayKey(d)])) d = addDays(d, -1); while (dayActive(state.days[dayKey(d)])) { n++; d = addDays(d, -1); } return n; }
  function songState(id) { state.songs[id] = state.songs[id] || { best: {} }; return state.songs[id]; }
  function bestOf(id) { var b = (state.songs[id] || {}).best || {}, o = {}; Object.keys(b).forEach(function (k) { var p = k.split(":")[0]; o[p] = Math.max(o[p] || 0, b[k]); }); return o; }
  function hasPart(s, p) { return p === "melody" ? !!(s.melody && s.melody.trim()) : !!(s.chords && s.chords.trim()); }

  var lastAct = Date.now();
  ["pointerdown", "keydown"].forEach(function (ev) { document.addEventListener(ev, function () { lastAct = Date.now(); }, { passive: true }); });
  setInterval(function () {
    if (document.hidden) return;
    var r = route().name;
    if (["song", "quiz", "lesson", "tuner"].indexOf(r) < 0) return;
    if (Date.now() - lastAct < 120000 || Mic.active || Player.playing) { today().sec += 5; if (Math.random() < 0.2) save(); }
  }, 5000);
  window.addEventListener("pagehide", save);
  document.addEventListener("click", function once() {
    document.removeEventListener("click", once);
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
  });

  /* ───────── 录音存储（IndexedDB，只在本机） ───────── */
  var RecDB = {
    db: null,
    open: function () {
      var self = this; if (self.db) return Promise.resolve(self.db);
      return new Promise(function (res, rej) {
        if (!window.indexedDB) return rej(new Error("no idb"));
        var r = indexedDB.open("natalie-guitar", 1);
        r.onupgradeneeded = function () { r.result.createObjectStore("recs", { keyPath: "id", autoIncrement: true }); };
        r.onsuccess = function () { self.db = r.result; res(self.db); }; r.onerror = function () { rej(r.error); };
      });
    },
    tx: function (mode, fn) {
      return this.open().then(function (db) { return new Promise(function (res, rej) {
        var t = db.transaction("recs", mode), st = t.objectStore("recs"), out, q = fn(st);
        if (q) q.onsuccess = function () { out = q.result; }; t.oncomplete = function () { res(out); }; t.onerror = function () { rej(t.error); };
      }); });
    },
    add: function (r) { return this.tx("readwrite", function (st) { return st.add(r); }); },
    all: function () { return this.tx("readonly", function (st) { return st.getAll(); }).then(function (a) { return (a || []).sort(function (x, y) { return y.id - x.id; }); }); },
    del: function (id) { return this.tx("readwrite", function (st) { return st.delete(id); }); }
  };

  /* ───────── 声音：拨弦音色（Karplus–Strong）、扫弦、节拍器 ───────── */
  var Audio = {
    ctx: null, master: null, cache: {},
    get: function () {
      if (!this.ctx) {
        var C = window.AudioContext || window.webkitAudioContext; this.ctx = new C();
        var comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 4;
        this.master = this.ctx.createGain(); this.master.gain.value = 1; this.master.connect(comp); comp.connect(this.ctx.destination);
      }
      if (this.ctx.state !== "running" && this.ctx.state !== "closed") { try { this.ctx.resume(); } catch (e) { } }
      return this.ctx;
    },
    /* 生成一根弦拨响的声音：延迟线 + 平均滤波 + 全通分数延迟（音准准确到 1 音分内） */
    pluckBuffer: function (midi) {
      if (this.cache[midi]) return this.cache[midi];
      var ctx = this.get(), sr = ctx.sampleRate, f = G.midiFreq(midi), len = Math.floor(sr * 2.6);
      var buf = ctx.createBuffer(1, len, sr), y = buf.getChannelData(0);
      var period = sr / f, N = Math.floor(period - 0.5), d = period - N - 0.5, C = (1 - d) / (1 + d);
      var line = new Float32Array(N + 2), prev = 0, apX = 0, apY = 0, decay = midi < 52 ? 0.9965 : midi < 64 ? 0.9955 : 0.994;
      for (var i = 0; i < N; i++) { var r = Math.random() * 2 - 1; prev = prev * 0.5 + r * 0.5; line[i] = prev; } // 稍微柔和的拨弦
      var idx = 0, last = line[N - 1];
      for (i = 0; i < len; i++) {
        var cur = line[idx], avg = 0.5 * (cur + last) * decay;
        var ap = C * avg + apX - C * apY; apX = avg; apY = ap;
        last = cur; line[idx] = ap; y[i] = cur; idx = (idx + 1) % N;
      }
      return (this.cache[midi] = buf);
    },
    pluck: function (midi, t, dur, vel, dest) {
      var ctx = this.get(), src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = this.pluckBuffer(midi);
      g.gain.setValueAtTime(vel, t); g.gain.setTargetAtTime(0, t + Math.max(0.15, dur), 0.12);
      src.connect(g); g.connect(dest || this.master); src.start(t); src.stop(t + Math.max(0.15, dur) + 0.8);
    },
    strum: function (name, t, dur, dir, vel, dest) {
      var ms = G.chordMidis(name); if (dir === "U") ms = ms.slice().reverse().slice(0, 4);
      var self = this; ms.forEach(function (m, i) { self.pluck(m, t + i * 0.014, dur, (vel || 0.2) * (dir === "U" ? 0.7 : 1), dest); });
    },
    click: function (t, accent, dest) {
      var ctx = this.get(), o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = accent ? 1900 : 1300;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(accent ? 0.3 : 0.18, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + 0.06);
    }
  };

  var Player = {
    playing: false, bus: null, raf: 0,
    /* o: { song, P, parts:["melody","chords"], bpm, from, metro, countIn, onBeat, onEnd } */
    play: function (o) {
      this.stop();
      var ctx = Audio.get(), bus = ctx.createGain(); bus.connect(Audio.master); this.bus = bus;
      var spb = 60 / o.bpm, from = o.from || 0, barBeats = G.meterBeats(o.song.meter), clickEvery = /\/8$/.test(o.song.meter) ? 1.5 : 1;
      var countBeats = o.countIn ? barBeats : 0, t0 = ctx.currentTime + 0.15 + countBeats * spb;
      var total = Math.max(o.P.tab.total || 0, o.P.chords.total || 0);
      var firstBar = (o.P.tab.bars[0] || o.P.chords.bars[0] || { len: barBeats }), offset = firstBar.len < barBeats - 1e-6 ? barBeats - firstBar.len : 0;
      if (o.parts.indexOf("melody") >= 0) {
        var evs = o.P.tab.events;
        evs.forEach(function (ev, i) {
          if (ev.rest || ev.tiedFrom || ev.start + 1e-6 < from) return;
          var dur = ev.dur, j = i; while (evs[j].tie && evs[j + 1] && evs[j + 1].tiedFrom) { j++; dur += evs[j].dur; }
          Audio.pluck(ev.midi, t0 + (ev.start - from) * spb, dur * spb, 0.5, bus);
        });
      }
      if (o.parts.indexOf("chords") >= 0) {
        var soft = o.parts.indexOf("melody") >= 0 ? 0.09 : 0.2;
        o.P.chords.segs.forEach(function (sg) {
          if (!sg.chord) return;
          G.strumTimes(o.song.strum, o.song.meter, sg.start, sg.dur).forEach(function (st, k, arr) {
            if (st.t + 1e-6 < from) return;
            var nx = k + 1 < arr.length ? arr[k + 1].t : sg.start + sg.dur;
            Audio.strum(sg.chord, t0 + (st.t - from) * spb, (nx - st.t) * spb, st.dir, soft, bus);
          });
        });
      }
      if (o.metro || o.countIn) {
        for (var b = -countBeats; b < total - from; b += clickEvery) {
          if (b >= 0 && !o.metro) break;
          var abs = b + from; Audio.click(t0 + b * spb, Math.abs(((abs + offset) % barBeats + barBeats) % barBeats) < 1e-6, bus);
        }
      }
      this.playing = true; this.t0 = now() + (t0 - ctx.currentTime); this.spb = spb; this.from = from;
      var self = this;
      (function tick() {
        if (!self.playing) return;
        var beat = (now() - self.t0) / spb + from;
        if (o.onBeat) o.onBeat(beat);
        if (beat > total + 0.3) { self.playing = false; if (o.onEnd) o.onEnd(); return; }
        self.raf = requestAnimationFrame(tick);
      })();
    },
    beatAt: function (t) { return (t - this.t0) / this.spb + this.from; },
    stop: function () {
      this.playing = false; cancelAnimationFrame(this.raf);
      if (this.bus) { var b = this.bus; b.gain.setTargetAtTime(0, Audio.ctx.currentTime, 0.03); setTimeout(function () { try { b.disconnect(); } catch (e) { } }, 400); this.bus = null; }
    }
  };

  /* ───────── 麦克风：单音识别 + 和弦识别 ───────── */
  var Mic = {
    active: false, stream: null, analyser: null, buf: null, timer: 0, listeners: [],
    noise: 0.004, hist: [], cand: null, stable: 0, lastDecided: null, pendingOnset: false, silent: 0, level: 0, current: null,
    start: function () {
      var self = this;
      if (self.active) return Promise.resolve();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error("此浏览器不支持麦克风"));
      var t0 = Date.now();
      return navigator.mediaDevices.getUserMedia({ audio: true })
        .catch(function (e) { e.ms = Date.now() - t0; throw e; })
        .then(function (stream) {
          try { stream.getAudioTracks()[0].applyConstraints({ echoCancellation: false, noiseSuppression: false, autoGainControl: false }).catch(function () { }); } catch (x) { }
          var ctx = Audio.get(); self.stream = stream; self.src = ctx.createMediaStreamSource(stream);
          self.analyser = ctx.createAnalyser(); self.analyser.fftSize = 8192; self.src.connect(self.analyser);
          self.buf = new Float32Array(self.analyser.fftSize);
          self.active = true; self.hist = []; self.cand = null; self.stable = 0; self.lastDecided = null; self.startT = now();
          self.timer = setInterval(function () { self.frame(); }, 20);
        });
    },
    stop: function () {
      if (Recorder.rec) Recorder.stop();
      clearInterval(this.timer);
      if (this.stream) this.stream.getTracks().forEach(function (t) { t.stop(); });
      try { if (this.src) this.src.disconnect(); } catch (e) { }
      this.stream = null; this.active = false; this.current = null;
    },
    on: function (fn) { this.listeners.push(fn); var l = this.listeners; return function () { var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }; },
    emit: function (type, data) { this.listeners.slice().forEach(function (fn) { fn(type, data); }); },
    frame: function () {
      if (!this.analyser) return;
      var full = this.buf; this.analyser.getFloatTimeDomainData(full);
      var buf = full.subarray(full.length - 2048), sr = Audio.ctx.sampleRate, self = this;
      var rms = 0; for (var i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
      rms = Math.sqrt(rms / buf.length); this.level = rms;
      if (rms < this.noise) this.noise = this.noise * 0.9 + rms * 0.1; else this.noise += (rms - this.noise) * 0.003;
      var thr = Math.max(0.006, Math.min(this.noise * 3, 0.02));
      var minHist = this.hist.length ? Math.min.apply(null, this.hist) : 1;
      this.hist.push(rms); if (this.hist.length > 5) this.hist.shift();
      // 和弦：扫弦后 0.17 秒判断（等所有弦都响起来）
      if (this.expectChord && this.chordAt && now() >= this.chordAt) { this.chordAt = 0; this.judgeChord(full, sr); }
      else if (this.expectChord && !this.chordAt && this.expectChord !== this.lastOkChord && rms > 0.015 && now() - (this.lastChordCheck || 0) > 0.15 && now() - (this.lastChordJudge || 0) > 0.4) {
        this.lastChordCheck = now();
        var cc = chromaOf(full, sr), se2 = cosine(cc, templateOf(this.expectChord)), bb = 0;
        Object.keys(G.CHORDS).forEach(function (nme) { bb = Math.max(bb, cosine(cc, templateOf(nme))); });
        if (se2 >= 0.85 && se2 >= bb - 0.03) { this.lastChordJudge = now(); this.chordAt = 0; this.lastOkChord = this.expectChord; this.emit("chord", { ok: true, chord: this.expectChord, sim: se2, time: now() - 0.15 }); }
      }
      if (rms < thr) {
        if (++this.silent > 3) { this.lastDecided = null; this.cand = null; this.stable = 0; this.current = null; }
        this.emit("level", { rms: rms }); return;
      }
      this.silent = 0;
      // 起音（拨弦/扫弦）：音量比前面几帧明显变大，或最近 20 毫秒比 40 毫秒前猛增；0.16 秒内不重复算
      var eNew = 0, eOld = 0, Lf = full.length;
      for (var q = Lf - 1024; q < Lf; q++) eNew += full[q] * full[q];
      for (q = Lf - 3072; q < Lf - 2048; q++) eOld += full[q] * full[q];
      var jump = eNew > eOld * 2.2 && Math.sqrt(eNew / 1024) > thr;
      if (now() - this.startT > 0.4 && (jump || (rms > minHist * 1.45 && rms > thr * 1.3)) && (this.sinceOnset >= 8 || !this.onsetId)) {
        this.pendingOnset = true; this.stable = 0; this.cand = null; this.armed = true; this.hitStreak = {};
        this.onsetId = (this.onsetId || 0) + 1; this.sinceOnset = 0;
        if (this.expectChord) this.chordAt = now() + 0.17;
      }
      this.sinceOnset = (this.sinceOnset || 0) + 1;
      if (this.needOnset && this.sinceOnset > 18) this.armed = false;
      // 单音：已知该弹哪个音时，直接量这个音的能量是否明显盖过相邻半音
      if (this.expect && this.expect.length && this.armed) {
        var win = full.subarray(full.length - 4096);
        this.expect.forEach(function (m) {
          var sc = targetScore(m < 60 ? full : win, sr, m); // 低音用 170 毫秒长窗口，相邻半音才分得清
          if (sc >= 1.6) self.hitStreak[m] = (self.hitStreak[m] || 0) + 1; else self.hitStreak[m] = 0;
          if (self.armed && (self.hitStreak[m] >= 2 || sc >= 3.5)) { self.armed = false; self.hitStreak = {}; self.emit("hit", { midi: m, time: now() - 0.08, onset: self.onsetId }); }
        });
      }
      var p = detectPitch(buf, sr);
      if (!p) { this.emit("level", { rms: rms }); return; }
      var mf = 69 + 12 * Math.log2(p.freq / 440), m = Math.round(mf);
      if (m < 36 || m > 96) return;
      if (m === this.cand) this.stable++; else { this.cand = m; this.stable = 1; }
      this.current = { midi: m, cents: Math.round((mf - m) * 100), freq: p.freq, clarity: p.clarity };
      this.emit("pitch", this.current);
      if (this.stable >= 2 && (this.pendingOnset || m !== this.lastDecided)) {
        this.lastDecided = m; this.pendingOnset = false;
        this.emit("note", { midi: m, time: now() - 0.06, clarity: p.clarity, onset: this.onsetId, fresh: this.sinceOnset <= 7 });
      }
    },
    /* 和弦识别：把 E2–B5 每个半音的能量折算成 12 个音名的"和弦色彩"，和和弦库里每个和弦的理论色彩比相似度 */
    judgeChord: function (full, sr) {
      if (this.level < 0.012) return; // 太小声（不是扫弦）不判断
      var chroma = chromaOf(full, sr), exp = this.expectChord, sims = {}, best = null;
      Object.keys(G.CHORDS).forEach(function (name) {
        var s = cosine(chroma, templateOf(name)); sims[name] = s;
        if (!best || s > best.s) best = { name: name, s: s };
      });
      var se = sims[exp] || 0;
      this.lastChordJudge = now();
      var same = exp === this.lastOkChord; // 连着扫同一个和弦：上一下还在响，色彩会被冲淡一点，放宽一些
      if ((se >= 0.76 && se >= best.s - 0.06) || (same && se >= 0.68 && se >= best.s - 0.12)) { this.lastOkChord = exp; this.emit("chord", { ok: true, chord: exp, sim: se, time: now() - 0.17 }); }
      else if (best.name !== exp && best.s >= 0.72 && best.s - se >= 0.1) this.emit("chord", { ok: false, chord: best.name, sim: best.s, time: now() - 0.17 });
      else this.emit("chord", { ok: false, unclear: true, sim: se, time: now() - 0.17 });
    }
  };
  Mic.setExpect = function (midis, needOnset) {
    var key = (midis || []).join();
    if (key === this.expectKey && !needOnset) return;
    this.expectKey = key; this.expect = midis && midis.length ? midis : null; this.hitStreak = {}; this.needOnset = !!needOnset; this.armed = !needOnset;
  };
  Mic.setChord = function (name) { if ((name || null) === this.expectChord) return; this.expectChord = name || null; this.chordAt = 0; };

  var HANN = {};
  function hann(n) { if (!HANN[n]) { var w = new Float32Array(n); for (var i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)); HANN[n] = w; } return HANN[n]; }
  function goertzel(x, sr, f) {
    var W = hann(x.length), w = 2 * Math.PI * f / sr, c = 2 * Math.cos(w), s1 = 0, s2 = 0;
    for (var j = 0; j < x.length; j++) { var s0 = x[j] * W[j] + c * s1 - s2; s2 = s1; s1 = s0; }
    return s1 * s1 + s2 * s2 - c * s1 * s2;
  }
  var HW = [0, 1, 0.7, 0.35, 0.2, 0.12];
  function noteEnergy(x, sr, m) {
    var f = G.midiFreq(m), e = 0;
    for (var h = 1; h <= 5; h++) {
      var fh = f * h; if (fh > sr / 2 - 200) break;
      var cs = fh * 0.0145 < sr / x.length * 0.5 ? [0] : [-25, 0, 25], best = 0;
      cs.forEach(function (c) { best = Math.max(best, goertzel(x, sr, fh * Math.pow(2, c / 1200))); });
      e += best * HW[h];
    }
    return e;
  }
  function targetScore(x, sr, m) {
    var e = {}, best = -1, second = 0;
    for (var k = m - 5; k <= m + 6; k++) e[k] = noteEnergy(x, sr, k);
    for (k = m - 5; k <= m + 6; k++) { if (k !== m) second = Math.max(second, e[k]); best = Math.max(best, e[k]); }
    if (e[m] < best) return 0;
    return e[m] / (second + 1e-9);
  }
  function chromaOf(x, sr) {
    var c = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (var m = 40; m <= 83; m++) {
      var f = G.midiFreq(m), e = goertzel(x, sr, f);
      if (f * 0.0175 > sr / x.length * 0.5) e = Math.max(e, goertzel(x, sr, f * 1.0175), goertzel(x, sr, f / 1.0175));
      c[m % 12] += Math.sqrt(e);
    }
    return c;
  }
  var TPL = {};
  function templateOf(name) {
    if (TPL[name]) return TPL[name];
    var t = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], H = [[0, 1], [12, 0.5], [19, 0.33], [24, 0.25], [28, 0.2]];
    G.chordMidis(name).forEach(function (n) { H.forEach(function (h) { if (n + h[0] <= 83) t[(n + h[0]) % 12] += h[1]; }); });
    return (TPL[name] = t);
  }
  function cosine(a, b) { var d = 0, na = 0, nb = 0; for (var i = 0; i < 12; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return na && nb ? d / Math.sqrt(na * nb) : 0; }
  function detectPitch(buf, sr) {
    var N = buf.length, minLag = Math.floor(sr / 1400), maxLag = Math.min(Math.floor(sr / 60), N >> 1), nsdf = new Float32Array(maxLag + 1);
    for (var tau = minLag; tau <= maxLag; tau++) { var acf = 0, m = 0; for (var j = 0, L = N - tau; j < L; j++) { var a = buf[j], b = buf[j + tau]; acf += a * b; m += a * a + b * b; } nsdf[tau] = m > 0 ? 2 * acf / m : 0; }
    var peaks = [], t = minLag; while (t < maxLag && nsdf[t] > 0) t++;
    var best = -1, bestV = 0;
    for (; t < maxLag; t++) { if (nsdf[t] > 0) { if (nsdf[t] > bestV) { bestV = nsdf[t]; best = t; } } else if (best > 0) { peaks.push([best, bestV]); best = -1; bestV = 0; } }
    if (best > 0) peaks.push([best, bestV]);
    if (!peaks.length) return null;
    var hi = Math.max.apply(null, peaks.map(function (p) { return p[1]; })); if (hi < 0.55) return null;
    var pick = peaks.filter(function (p) { return p[1] >= hi * 0.88; })[0], x = pick[0], y0 = nsdf[x - 1] || 0, y1 = nsdf[x], y2 = nsdf[x + 1] || 0;
    var d = (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1);
    return { freq: sr / (x + (isFinite(d) ? d : 0)), clarity: y1 };
  }

  /* ───────── 录音 ───────── */
  var Recorder = {
    rec: null, chunks: [], startAt: 0, meta: null, subs: [],
    mime: function () { if (!window.MediaRecorder) return null; var c = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]; for (var i = 0; i < c.length; i++) if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c[i])) return c[i]; return ""; },
    start: function (meta) {
      var self = this, mime = self.mime();
      if (mime === null) return Promise.reject(new Error("此浏览器不支持录音"));
      return Mic.start().then(function () {
        self.chunks = []; self.meta = meta; self.startAt = Date.now();
        self.rec = mime ? new MediaRecorder(Mic.stream, { mimeType: mime }) : new MediaRecorder(Mic.stream);
        self.rec.ondataavailable = function (e) { if (e.data && e.data.size) self.chunks.push(e.data); };
        self.rec.onstop = function () {
          var type = (self.rec && self.rec.mimeType) || mime || "audio/webm", blob = new Blob(self.chunks, { type: type });
          var r = { songId: self.meta.songId, title: self.meta.title, part: self.meta.part, date: new Date().toISOString(), dur: Math.round((Date.now() - self.startAt) / 1000), mime: type, blob: blob };
          self.rec = null;
          if (r.dur < 1 || !blob.size) { toast("录音太短，没有保存"); self.emit(); return; }
          RecDB.add(r).then(function () { markDone("rec"); toast("录音已保存，可在「录音」页回放"); self.emit(); }).catch(function () { toast("保存录音失败"); self.emit(); });
        };
        self.rec.start(1000); self.emit();
      });
    },
    stop: function () { if (this.rec && this.rec.state !== "inactive") this.rec.stop(); },
    emit: function () { this.subs.forEach(function (f) { f(); }); }
  };

  /* ───────── 麦克风打不开时的分步帮助（安卓 Chrome） ───────── */
  var UA = navigator.userAgent || "", IN_APP = /MicroMessenger|WeChat|QQ\/|MQQBrowser|Weibo|DingTalk|FBAN|FBAV|Instagram|Line\//i.test(UA);
  var IOS = /iPad|iPhone|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  function micHelp(e) {
    var steps;
    if (IN_APP) steps = ["点右上角的「···」", "选「在浏览器中打开」，用 Chrome 打开", "在 Chrome 里点右上角 ⋮ →「添加到主屏幕」，以后从桌面图标打开"];
    else if (IOS) steps = ["在 Safari 地址栏左边点「aA」→「网站设置」→「麦克风」→「允许」", "改完后把页面完全关掉再打开"];
    else steps = [
      "点 Chrome 地址栏左边的小图标（锁或 ⓘ）→「权限」或「网站设置」→「麦克风」→ 选「允许」",
      "如果还是不行：打开手机「设置」→「应用」→「Chrome」→「权限」→「麦克风」→ 选「使用期间允许」",
      "如果是从桌面图标打开的，改完后把它从最近任务里划掉，再重新打开",
      "改完后点下面的「再试一次」"
    ];
    var box = $("#michelp"); if (!box) { box = document.createElement("div"); box.id = "michelp"; document.body.appendChild(box); }
    box.innerHTML = '<div class="mh-card" role="dialog" aria-modal="true"><h2>' + (IN_APP ? "现在是在微信等 App 里打开的，这里不能用麦克风" : "麦克风打不开") + '</h2><p class="muted">跟谱练、跟拍练、调音器、录音都要用麦克风。按下面的步骤打开：</p><ol>' +
      steps.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + '</ol><p class="muted small">声音只在这部手机上处理，不会上传。　诊断：' + esc((e && e.name) || "") + " " + esc(VERSION) + '</p><div class="mh-btns">' +
      (IN_APP ? "" : '<button class="btn primary" id="mh-retry">再试一次</button>') + '<button class="btn" id="mh-close">关闭</button></div></div>';
    box.hidden = false;
    $("#mh-close").onclick = function () { box.hidden = true; };
    var r = $("#mh-retry"); if (r) r.onclick = function () { box.hidden = true; Mic.start().then(function () { Mic.stop(); toast("麦克风可以用了，再点一次开始"); }).catch(micHelp); };
  }

  /* ───────── 路由 ───────── */
  function route() { var h = (location.hash || "#/today").replace(/^#\/?/, "").split("/"); return { name: h[0] || "today", arg: h[1] ? decodeURIComponent(h[1]) : null }; }
  var cleanup = [];
  function onLeave(fn) { cleanup.push(fn); }
  function render() {
    cleanup.forEach(function (f) { try { f(); } catch (e) { } }); cleanup = [];
    Player.stop(); if (Mic.active) Mic.stop(); Mic.setExpect(null); Mic.setChord(null);
    var r = route(), main = $("#main");
    $$(".tabbar a").forEach(function (a) {
      var n = a.getAttribute("data-tab"), on = n === r.name || (n === "library" && r.name === "song") || (n === "read" && (r.name === "quiz" || r.name === "lesson")) || (n === "today" && r.name === "tuner");
      a.classList.toggle("on", on); a.setAttribute("aria-current", on ? "page" : "false");
    });
    var views = { today: viewToday, library: viewLibrary, song: viewSong, read: viewRead, quiz: viewQuiz, lesson: viewLesson, recs: viewRecs, settings: viewSettings, tuner: viewTuner };
    (views[r.name] || viewToday)(main, r.arg);
    window.scrollTo(0, 0); save();
  }
  window.addEventListener("hashchange", render);
  function stars(sc) { return sc >= 95 ? 3 : sc >= 80 ? 2 : sc >= 60 ? 1 : 0; }
  function starHTML(n) { var s = ""; for (var i = 0; i < 3; i++) s += '<span class="stx' + (i < n ? " on" : "") + '">★</span>'; return s; }
  function fmtDur(sec) { sec = Math.round(sec); return sec < 60 ? sec + " 秒" : Math.floor(sec / 60) + " 分 " + (sec % 60) + " 秒"; }

  /* ───────── 今天 ───────── */
  function warmOfDay() {
    var w = SONGS.filter(function (s) { return s.cat === "warm" && s.level === 1; });
    return w[Math.floor(new Date(dayKey() + "T00:00:00").getTime() / 864e5) % w.length];
  }
  function nextStep(id) {
    var s = SONG[id], b = bestOf(id);
    if (hasPart(s, "melody") && (b.melody || 0) < 80) return { part: "melody", text: "先弹单音旋律，跟谱练到 80 分" };
    if (hasPart(s, "chords") && (b.chords || 0) < 80) return { part: "chords", text: "换成和弦扫弦，跟谱练到 80 分" };
    return { part: hasPart(s, "chords") ? "chords" : "melody", text: "已经很熟了：试试跟拍练，或者换一首新歌" };
  }
  function viewToday(main) {
    var d = today(), cur = SONG[state.settings.current], warm = warmOfDay(), step = nextStep(cur.id), nowD = new Date();
    var days = []; for (var i = 27; i >= 0; i--) { var dd = addDays(nowD, -i), k = dayKey(dd), x = state.days[k]; days.push({ k: k, n: x ? ["tune", "warm", "quiz", "song", "rec"].filter(function (z) { return x[z]; }).length : 0, today: i === 0 }); }
    var weekSec = 0; for (var j = 0; j < 7; j++) { var q = state.days[dayKey(addDays(nowD, -j))]; if (q) weekSec += q.sec || 0; }
    var learned = SONGS.filter(function (s) { var b = bestOf(s.id); return s.cat !== "warm" && Math.max(b.melody || 0, b.chords || 0) >= 80; }).length;
    var done = ["tune", "warm", "quiz", "song"].filter(function (z) { return d[z]; }).length;
    var h = nowD.getHours(), hello = h < 11 ? "早上好" : h < 18 ? "下午好" : "晚上好";
    main.innerHTML =
      '<header class="hero"><p class="eyebrow">' + esc(dayKey()) + '</p><h1>' + hello + "，Natalie</h1>" +
      '<p class="sub">' + (done >= 4 ? "今天的练习完成了，真好！" : "今天练 15 分钟：调音、热身、识谱、练一首歌。") + "</p></header>" +
      '<section class="stats"><div><b>' + streak() + '</b><span>连续天数</span></div><div><b>' + Math.round(weekSec / 60) + '</b><span>本周分钟</span></div><div><b>' + learned + '</b><span>学会的歌</span></div></section>' +
      '<ol class="steps">' +
      stepCard(1, "tune", "调音 · 1 分钟", "先把六根弦调准", "弦每天都会松一点，调准了，弹出来才好听，看板也才听得准。", "#/tuner", "打开调音器") +
      stepCard(2, "warm", "手指热身 · 3 分钟", warm.title, warm.tip.split("。")[0] + "。", "#/song/" + warm.id + "?p=" + (hasPart(warm, "melody") ? "melody" : "chords") + "&m=wait", "开始热身") +
      stepCard(3, "quiz", "认识六线谱和和弦 · 3 分钟", "看谱认音、看图认和弦", "每次 10 题，看得懂谱，练歌就快。", "#/quiz/" + (state.quiz.best["tab-open"] >= 80 ? (state.quiz.best["chord"] >= 80 ? "tab-top" : "chord") : "tab-open"), "开始") +
      stepCard(4, "song", "练一首歌 · 10 分钟", cur.title, "下一步：" + step.text + "。", "#/song/" + cur.id + "?p=" + step.part + "&m=wait", "去练这首") +
      stepCard(5, "rec", "录一遍（可选）", "把今天弹的录下来", "过几周回头听，就知道自己进步了多少。", "#/song/" + cur.id + "?p=" + step.part + "&m=demo", "去录音") +
      "</ol>" +
      '<section class="card"><h2 class="h2">最近四周</h2><div class="cal">' + days.map(function (x) { return '<i class="c' + Math.min(4, x.n) + (x.today ? " t" : "") + '" title="' + x.k + '"></i>'; }).join("") + '</div><p class="muted small">每个格子是一天，颜色越深，那天完成的步骤越多。</p></section>' +
      '<p class="foot"><a class="btn" href="#/settings">设置 · 备份 · 帮助</a></p>';
  }
  function stepCard(n, key, label, title, desc, href, btn) {
    var done = today()[key];
    return '<li class="step' + (done ? " done" : "") + '"><div class="num">' + (done ? "✓" : n) + '</div><div class="body"><p class="eyebrow">' + esc(label) + "</p><h3>" + esc(title) + '</h3><p class="muted">' + esc(desc) + '</p><a class="btn ' + (done ? "" : "primary") + '" href="' + href + '">' + (done ? "再来一次" : btn) + "</a></div></li>";
  }

  /* ───────── 曲库 ───────── */
  function viewLibrary(main) {
    var tab = state.settings.libTab || "warm";
    function list() {
      return SONGS.map(function (s, i) { return { s: s, i: i }; }).filter(function (x) { return x.s.cat === tab; })
        .sort(function (a, b) { return (a.s.level - b.s.level) || (a.i - b.i); }).map(function (x) {
          var s = x.s, b = bestOf(s.id), cur = state.settings.current === s.id;
          var chordsUsed = []; G.parseChords(s.chords, s.meter).segs.forEach(function (g) { if (g.chord && chordsUsed.indexOf(g.chord) < 0) chordsUsed.push(g.chord); });
          var badges = ["melody", "chords"].filter(function (p) { return hasPart(s, p); }).map(function (p) { return '<span class="hb">' + PART_NAME[p] + " " + starHTML(stars(b[p] || 0)) + "</span>"; }).join("");
          return '<a class="song" href="#/song/' + s.id + '"><div class="meta"><span class="lv lv' + s.level + '">' + LEVEL_NAME[s.level] + "</span>" + (chordsUsed.length ? '<span class="chips2">和弦 ' + esc(chordsUsed.join(" ")) + "</span>" : "") + (cur ? '<span class="tag">在练</span>' : "") + "</div><h3>" + esc(s.title) + '</h3><p class="en">' + esc(s.en) + '</p><div class="hbs">' + badges + "</div></a>";
        }).join("");
    }
    main.innerHTML = '<header class="pagehead"><h1>曲库</h1><p class="muted">从「基础练习」开始，再弹歌曲。每首歌都有单音旋律和和弦扫弦两种弹法。</p></header>' +
      '<div class="seg" role="tablist">' + ["warm", "hymn", "classic"].map(function (c) { return '<button role="tab" data-c="' + c + '" aria-selected="' + (c === tab) + '">' + CAT_NAME[c] + "</button>"; }).join("") + "</div>" +
      '<div class="songs" id="songs">' + list() + "</div>";
    $$(".seg button", main).forEach(function (b) { b.onclick = function () { tab = state.settings.libTab = b.getAttribute("data-c"); save(); $$(".seg button", main).forEach(function (x) { x.setAttribute("aria-selected", x === b); }); $("#songs").innerHTML = list(); }; });
  }

  /* ───────── 曲子页 ───────── */
  function parseSong(s) {
    var P = { tab: G.parseTab(s.melody, s.meter), chords: G.parseChords(s.chords, s.meter) };
    if (s.lyrics) {
      var toks = s.lyrics.split(/\s+/), k = 0; P.lyr = [];
      P.tab.events.forEach(function (ev, i) { if (ev.rest || ev.tiedFrom) return; var t = toks[k++]; P.lyr[i] = t && t !== "_" ? t : ""; });
      P.barLyr = {};
      P.tab.events.forEach(function (ev, i) { if (P.lyr[i]) P.barLyr[ev.bar] = (P.barLyr[ev.bar] || "") + (/^[一-鿿]/.test(P.lyr[i]) ? "" : (P.barLyr[ev.bar] ? " " : "")) + P.lyr[i].replace(/-$/, ""); });
    }
    return P;
  }
  function viewSong(main, arg) {
    var parts = (arg || "").split("?"), s = SONG[parts[0]];
    if (!s) { location.hash = "#/library"; return; }
    var qp = {}; (parts[1] || "").split("&").forEach(function (kv) { var p = kv.split("="); if (p[0]) qp[p[0]] = p[1]; });
    var part = qp.p && hasPart(s, qp.p) ? qp.p : hasPart(s, "melody") ? "melody" : "chords";
    var mode = qp.m || "demo", P = parseSong(s), from = 0, practice = null;
    var keyLabel = /m$/.test(s.key) ? s.key.replace("m", "") + " 小调" : s.key + " 大调";
    main.innerHTML =
      '<header class="pagehead"><a class="back" href="#/library">‹ 曲库</a><h1>' + esc(s.title) + '</h1><p class="en">' + esc(s.en) + "</p>" +
      '<p class="chips"><span class="lv lv' + s.level + '">' + LEVEL_NAME[s.level] + "</span><span>" + CAT_NAME[s.cat] + "</span><span>" + esc(keyLabel) + "</span><span>" + esc(s.meter) + "</span><span>♩=" + s.tempo + "</span></p></header>" +
      '<p class="tip">' + esc(s.tip) + "</p>" +
      '<div class="seg" id="parts">' + ["melody", "chords"].map(function (p) { return '<button data-p="' + p + '" aria-selected="' + (p === part) + '"' + (hasPart(s, p) ? "" : " disabled") + ">" + PART_NAME[p] + "</button>"; }).join("") + "</div>" +
      '<div class="seg" id="modes">' + [["demo", "听示范"], ["wait", "跟谱练"], ["tempo", "跟拍练"]].map(function (m) { return '<button data-m="' + m[0] + '" aria-selected="' + (m[0] === mode) + '">' + m[1] + "</button>"; }).join("") + "</div>" +
      '<div class="bar" id="bar"></div>' +
      '<div class="live" id="live" hidden></div>' +
      '<div class="nowchord" id="nowchord" hidden></div>' +
      '<div class="score" id="score" aria-label="六线谱"></div>' +
      '<div class="fbwrap" id="fbwrap"></div>' +
      '<p class="legend"><span><i class="lg-t"></i>橙色 = 现在该弹的</span><span><i class="lg-ok"></i>绿色 = 弹对了</span><span><i class="lg-bad"></i>红色 = 弹错了</span></p>' +
      '<div id="result"></div>' +
      '<div class="opts"><label class="chk"><input type="checkbox" id="showdia"' + (state.settings.diagrams !== false ? " checked" : "") + "> 谱上显示和弦图</label>" +
      (s.lyrics ? '<label class="chk"><input type="checkbox" id="showlyr"' + (state.settings.lyrics !== false ? " checked" : "") + "> 显示歌词</label>" : "") +
      '<label class="chk"><input type="checkbox" id="big"' + (state.settings.big ? " checked" : "") + '> 谱子再大一点</label>' +
      '<button class="btn" id="setcur">' + (state.settings.current === s.id ? "✓ 正在练这首" : "设为「在练」") + "</button></div>" +
      '<section class="card"><h2 class="h2">我的录音</h2><div id="myrecs" class="recs"></div></section>';
    var els = { ev: [], cs: [], st: [] };
    function drawScore() {
      var box = $("#score"), w = Math.max(320, box.clientWidth - 8);
      var PP = { tab: P.tab, chords: P.chords, lyr: state.settings.lyrics !== false ? P.lyr : null, barLyr: state.settings.lyrics !== false ? P.barLyr : null };
      box.innerHTML = G.tabSVG(s, PP, part, w, { diagrams: state.settings.diagrams !== false, big: !!state.settings.big }).svg;
      els = { ev: [], cs: [], st: {} };
      $$(".ev", box).forEach(function (g) { els.ev[+g.getAttribute("data-i")] = g; });
      $$(".cs", box).forEach(function (g) { els.cs[+g.getAttribute("data-c")] = g; });
      $$(".st", box).forEach(function (g) { var c = +g.getAttribute("data-c"); (els.st[c] = els.st[c] || []).push(g); });
      $("#fbwrap").innerHTML = G.fretboardSVG(Math.min(640, $("#fbwrap").clientWidth || 360));
      markFrom(); showNowChord(-1);
    }
    function fbMark(sfs, cls) { $$("#fbwrap .fb-dot." + cls).forEach(function (e) { e.classList.remove(cls); }); (sfs || []).forEach(function (sf) { var e = $('#fbwrap .fb-dot[data-sf="' + sf + '"]'); if (e) e.classList.add(cls); }); }
    function fbFlash(sfs, cls) { fbMark(sfs, cls); clearTimeout(fbFlash["t" + cls]); fbFlash["t" + cls] = setTimeout(function () { fbMark([], cls); }, 700); }
    function chordSfs(name) { var c = G.CHORDS[name]; if (!c) return []; var out = []; c.frets.forEach(function (f, k) { if (f >= 0) out.push((6 - k) + "." + f); }); return out; }
    function clearCls(c) { $$("#score ." + c).forEach(function (e) { e.classList.remove(c); }); }
    function markFrom() { clearCls("from"); if (from > 0) { var i = eventAt(from); if (i >= 0 && els.ev[i]) els.ev[i].classList.add("from"); } }
    function eventAt(beat) { var ev = P.tab.events; for (var i = 0; i < ev.length; i++) if (ev[i].start <= beat + 1e-6 && beat < ev[i].start + ev[i].dur - 1e-6) return i; return -1; }
    function segAt(beat) { var sg = P.chords.segs; for (var i = 0; i < sg.length; i++) if (sg[i].start <= beat + 1e-6 && beat < sg[i].start + sg[i].dur - 1e-6) return i; return -1; }
    function nextChordAfter(ci) { for (var i = ci + 1; i < P.chords.segs.length; i++) if (P.chords.segs[i].chord && P.chords.segs[i].chord !== (P.chords.segs[ci] || {}).chord) return P.chords.segs[i].chord; return null; }
    function showNowChord(ci) {
      var box = $("#nowchord"); if (!P.chords.segs.length) { box.hidden = true; return; }
      var sg = P.chords.segs[ci] || P.chords.segs.filter(function (x) { return x.chord; })[0]; if (!sg || !sg.chord) { box.hidden = true; return; }
      var nx = nextChordAfter(ci < 0 ? 0 : ci);
      box.hidden = false;
      box.innerHTML = '<div class="nc-now' + (ci >= 0 ? " on" : "") + '"><span class="nc-l">' + (ci >= 0 ? "现在" : "第一个和弦") + "</span>" + G.chordSVG(sg.chord, 130) + '</div>' + (nx ? '<div class="nc-next"><span class="nc-l">下一个</span>' + G.chordSVG(nx, 80) + "</div>" : "");
    }
    var lastLine = null;
    function follow(el) {
      if (!el) return; var r = el.getBoundingClientRect(), vh = window.innerHeight;
      var key = Math.round(r.top / 40); if (key === lastLine) return; lastLine = key;
      if (r.top < 90 || r.bottom > vh - 170) window.scrollBy({ top: r.top - vh * 0.35, behavior: "smooth" });
    }
    var curEv = -1, curSeg = -1;
    function cursor(beat) {
      if (part === "melody") {
        var i = eventAt(beat);
        if (i !== curEv) {
          if (curEv >= 0 && els.ev[curEv]) els.ev[curEv].classList.remove("cur");
          curEv = i; if (i >= 0 && els.ev[i]) { els.ev[i].classList.add("cur"); follow(els.ev[i]); }
          var ev = P.tab.events[i]; fbMark(ev && !ev.rest ? [ev.string + "." + ev.fret] : [], "tgt");
        }
      }
      var ci = segAt(beat);
      if (ci !== curSeg) {
        if (curSeg >= 0) { if (els.cs[curSeg]) els.cs[curSeg].classList.remove("cur"); (els.st[curSeg] || []).forEach(function (g) { g.classList.remove("cur"); }); }
        curSeg = ci;
        if (ci >= 0) { if (els.cs[ci]) els.cs[ci].classList.add("cur"); (els.st[ci] || []).forEach(function (g) { g.classList.add("cur"); }); if (part === "chords") { follow((els.st[ci] || [])[0]); fbMark(P.chords.segs[ci].chord ? chordSfs(P.chords.segs[ci].chord) : [], "tgt"); } }
        showNowChord(ci);
      }
    }
    function resetCursor() { clearCls("cur"); curEv = -1; curSeg = -1; fbMark([], "tgt"); showNowChord(-1); }
    $("#score").addEventListener("click", function (e) {
      if (Player.playing || (practice && practice.running)) return;
      var g = e.target.closest && e.target.closest(".ev, .st, .cs"); if (!g) return;
      var hit = g.classList.contains("ev") ? P.tab.events[+g.getAttribute("data-i")].start : P.chords.segs[+g.getAttribute("data-c")].start;
      from = from === hit ? 0 : hit; markFrom(); toast(from ? "从这里开始（再点一次取消）" : "已改回从头开始");
    });

    function setBar(html) { $("#bar").innerHTML = html; }
    function bpm() { return Math.round(s.tempo * state.settings.speed); }
    function speedCtl() { return '<label class="speed">速度 <input type="range" id="speed" min="0.4" max="1.2" step="0.05" value="' + state.settings.speed + '"><output id="spv">' + Math.round(state.settings.speed * 100) + "%</output></label>"; }
    function bindSpeed() { var r = $("#speed"); if (!r) return; r.oninput = function () { state.settings.speed = +r.value; $("#spv").textContent = Math.round(r.value * 100) + "%"; }; r.onchange = save; }
    function recBtn() { return '<button class="btn rec' + (Recorder.rec ? " on" : "") + '" id="recbtn">' + (Recorder.rec ? "■ 停止录音" : "● 录音") + "</button>"; }
    function bindRec() { var b = $("#recbtn"); if (!b) return; b.onclick = function () { if (Recorder.rec) { Recorder.stop(); return; } Recorder.start({ songId: s.id, title: s.title, part: part }).catch(micHelp); }; }
    function onRecChange() { var b = $("#recbtn"); if (b) { b.outerHTML = recBtn(); bindRec(); } if (!Recorder.rec && !(practice && practice.running) && Mic.active) Mic.stop(); loadRecs(); }
    Recorder.subs.push(onRecChange);
    onLeave(function () { Recorder.subs = Recorder.subs.filter(function (f) { return f !== onRecChange; }); if (Recorder.rec) Recorder.stop(); if (practice) practice.stop(); });

    function setupMode() {
      Player.stop(); if (practice) practice.stop(); practice = null; resetCursor(); clearCls("ok"); clearCls("bad"); clearCls("miss"); clearCls("target");
      $("#result").innerHTML = ""; $("#live").hidden = true;
      var what = part === "melody" ? "音" : "和弦";
      if (mode === "demo") {
        setBar('<button class="btn primary" id="play">▶ 播放示范</button>' + speedCtl() + '<label class="chk"><input type="checkbox" id="metro"' + (state.settings.metro ? " checked" : "") + "> 节拍器</label>" +
          (part === "melody" && hasPart(s, "chords") ? '<label class="chk"><input type="checkbox" id="acc"' + (state.settings.acc !== false ? " checked" : "") + "> 加和弦伴奏</label>" : "") + recBtn() +
          '<p class="hint">先听几遍，跟着谱看。点谱上任意一个' + what + "，可以从那里开始。</p>");
        $("#metro").onchange = function () { state.settings.metro = this.checked; save(); };
        if ($("#acc")) $("#acc").onchange = function () { state.settings.acc = this.checked; save(); };
        $("#play").onclick = function () {
          var btn = this;
          if (Player.playing) { Player.stop(); resetCursor(); btn.textContent = "▶ 播放示范"; return; }
          btn.textContent = "■ 停止";
          var parts2 = part === "melody" ? ($("#acc") && $("#acc").checked ? ["melody", "chords"] : ["melody"]) : ["chords"];
          Player.play({ song: s, P: P, parts: parts2, bpm: bpm(), from: from, metro: state.settings.metro, onBeat: cursor, onEnd: function () { resetCursor(); btn.textContent = "▶ 播放示范"; } });
        };
      } else if (mode === "wait") {
        setBar('<button class="btn primary" id="go">🎤 开始跟谱练</button><button class="btn" id="skip" disabled>跳过这个' + what + "</button>" + recBtn() +
          '<p class="hint">谱上亮起的' + what + "就是该弹的部分。弹对后会自动跳到下一个，不用管快慢。请把手机放在谱架上，第一次使用请允许麦克风。</p>");
        $("#go").onclick = function () { if (practice && practice.running) practice.stop(); else (part === "melody" ? startWaitMelody : startWaitChords)(); };
        $("#skip").onclick = function () { if (practice && practice.skip) practice.skip(); };
      } else {
        setBar('<button class="btn primary" id="go">🎤 开始跟拍练</button>' + speedCtl() + '<label class="chk"><input type="checkbox" id="metro"' + (state.settings.metro ? " checked" : "") + "> 节拍器</label>" + recBtn() +
          '<p class="hint">先响一小节节拍器，然后谱子按速度往前走，在' + what + "亮起时弹对就得分。建议先用跟谱练弹熟，再来练节奏。</p>");
        $("#metro").onchange = function () { state.settings.metro = this.checked; save(); };
        $("#go").onclick = function () { if (practice && practice.running) practice.stop(); else startTempo(); };
      }
      bindSpeed(); bindRec();
    }
    function live(html) { var l = $("#live"); l.hidden = false; l.innerHTML = html; }

    /* 跟谱练 · 单音 */
    function startWaitMelody() {
      var idxs = []; P.tab.events.forEach(function (ev, i) { if (!ev.rest && !ev.tiedFrom && ev.start + 1e-6 >= from) idxs.push(i); });
      if (!idxs.length) return;
      Mic.start().then(function () {
        var k = 0, mistakes = 0, wrongAt = {}, pending = null, t0 = Date.now(), running = true;
        clearCls("ok"); clearCls("bad"); $("#result").innerHTML = "";
        $("#go").textContent = "■ 停止"; $("#skip").disabled = false;
        function cur() { return P.tab.events[idxs[k]]; }
        function show() {
          clearCls("target"); var ev = cur(); if (!ev) return; var g = els.ev[idxs[k]];
          if (g) { g.classList.add("target"); follow(g); }
          fbMark([ev.string + "." + ev.fret], "tgt");
          var prev = k > 0 ? P.tab.events[idxs[k - 1]] : null;
          Mic.setExpect([ev.midi], !!prev && prev.midi === ev.midi);
          var ci = segAt(ev.start); if (ci !== curSeg) { if (curSeg >= 0 && els.cs[curSeg]) els.cs[curSeg].classList.remove("cur"); curSeg = ci; if (ci >= 0 && els.cs[ci]) els.cs[ci].classList.add("cur"); showNowChord(ci); }
          live('<span class="muted">第 ' + (k + 1) + " / " + idxs.length + ' 个音　该弹：</span><b>' + ev.string + " 弦 " + (ev.fret ? ev.fret + " 品" : "空弦") + '</b><span class="muted">（' + nm(ev.midi) + "）　错 " + mistakes + "</span>");
        }
        function advance(ok) {
          var g = els.ev[idxs[k]]; if (g) { g.classList.remove("target"); g.classList.add(ok ? "ok" : "bad"); }
          if (ok) fbFlash([cur().string + "." + cur().fret], "okk");
          k++; if (k >= idxs.length) finish(); else show();
        }
        var off = Mic.on(function (type, d) {
          if (!running) return; var ev = cur(); if (!ev) return;
          if (type === "hit") { if (d.midi % 12 === ev.midi % 12) { if (pending) { clearTimeout(pending); pending = null; } advance(true); } return; }
          if (type !== "note") return;
          if (d.midi % 12 === ev.midi % 12) { if (pending) { clearTimeout(pending); pending = null; } advance(true); return; }
          var fold = d.midi + 12 * Math.round((ev.midi - d.midi) / 12), pv = k > 0 ? P.tab.events[idxs[k - 1]] : null;
          if (pending || Math.abs(fold - ev.midi) > 9 || d.clarity < 0.8 || !d.fresh || (pv && pv.midi % 12 === fold % 12)) return;
          var myK = k;
          pending = setTimeout(function () {
            pending = null; if (!running || k !== myK) return;
            var key = k + ":" + fold; if (wrongAt[key]) return; wrongAt[key] = true; mistakes++;
            var g = els.ev[idxs[k]]; if (g) { g.classList.add("bad"); setTimeout(function () { g.classList.remove("bad"); }, 600); }
            fbFlash(G.positionsOf(fold).slice(0, 1), "wrong");
            live('<span class="bad-t">听到 ' + nm(fold) + "，应该是 " + ev.string + " 弦 " + (ev.fret ? ev.fret + " 品" : "空弦") + "（" + nm(ev.midi) + '）</span><span class="muted">　错 ' + mistakes + "</span>");
          }, 380);
        });
        function stop() { running = false; off(); if (pending) clearTimeout(pending); Mic.setExpect(null); clearCls("target"); fbMark([], "tgt"); if (!Recorder.rec) Mic.stop(); var g = $("#go"); if (g) { g.textContent = "🎤 开始跟谱练"; $("#skip").disabled = true; } practice.running = false; }
        function finish() {
          stop(); var score = Math.round(100 * idxs.length / (idxs.length + mistakes)), badBars = {};
          Object.keys(wrongAt).forEach(function (key) { var b = P.tab.events[idxs[+key.split(":")[0]]].bar + 1; badBars[b] = (badBars[b] || 0) + 1; });
          showResult(score, "wait", "共 " + idxs.length + " 个音，弹错 " + mistakes + " 次，用时 " + fmtDur((Date.now() - t0) / 1000) + "。", badBars);
        }
        practice = { running: true, stop: stop, skip: function () { if (running && cur()) { mistakes++; advance(false); } } };
        show();
      }).catch(micHelp);
    }

    /* 跟谱练 · 和弦：每个和弦段扫对一次就过 */
    function startWaitChords() {
      var idxs = []; P.chords.segs.forEach(function (sg, i) { if (sg.chord && sg.start + 1e-6 >= from) idxs.push(i); });
      if (!idxs.length) return;
      Mic.start().then(function () {
        var k = 0, mistakes = 0, wrongAt = {}, t0 = Date.now(), running = true;
        clearCls("ok"); clearCls("bad"); $("#result").innerHTML = "";
        $("#go").textContent = "■ 停止"; $("#skip").disabled = false;
        function cur() { return P.chords.segs[idxs[k]]; }
        function mark(i, cls, on) { if (els.cs[i]) els.cs[i].classList[on ? "add" : "remove"](cls); (els.st[i] || []).forEach(function (g) { g.classList[on ? "add" : "remove"](cls); }); }
        function show() {
          clearCls("target"); var sg = cur(); if (!sg) return; var i = idxs[k];
          mark(i, "target", true); follow((els.st[i] || [])[0] || els.cs[i]);
          fbMark(chordSfs(sg.chord), "tgt"); showNowChord(i); Mic.setChord(sg.chord);
          live('<span class="muted">第 ' + (k + 1) + " / " + idxs.length + ' 个和弦　该扫：</span><b class="big-c">' + esc(sg.chord) + '</b><span class="muted">　错 ' + mistakes + "</span>");
        }
        function advance(ok) {
          var i = idxs[k]; mark(i, "target", false); mark(i, ok ? "ok" : "bad", true);
          k++; if (k >= idxs.length) finish(); else show();
        }
        var off = Mic.on(function (type, d) {
          if (!running || type !== "chord") return; var sg = cur(); if (!sg) return;
          if (d.ok) { fbFlash(chordSfs(sg.chord), "okk"); advance(true); return; }
          if (d.unclear) { live('<span class="muted">没听清楚，再扫一次 </span><b class="big-c">' + esc(sg.chord) + "</b>"); return; }
          var key = k + ":" + d.chord; if (wrongAt[key]) return; wrongAt[key] = true; mistakes++;
          (els.st[idxs[k]] || []).forEach(function (g) { g.classList.add("bad"); setTimeout(function () { g.classList.remove("bad"); }, 600); });
          live('<span class="bad-t">听起来像 ' + esc(d.chord) + "，应该是 " + esc(sg.chord) + '</span><span class="muted">　看看手指是不是按对了位置　错 ' + mistakes + "</span>");
        });
        function stop() { running = false; off(); Mic.setChord(null); clearCls("target"); fbMark([], "tgt"); if (!Recorder.rec) Mic.stop(); var g = $("#go"); if (g) { g.textContent = "🎤 开始跟谱练"; $("#skip").disabled = true; } practice.running = false; }
        function finish() {
          stop(); var score = Math.round(100 * idxs.length / (idxs.length + mistakes)), badBars = {};
          Object.keys(wrongAt).forEach(function (key) { var b = P.chords.segs[idxs[+key.split(":")[0]]].bar + 1; badBars[b] = (badBars[b] || 0) + 1; });
          showResult(score, "wait", "共 " + idxs.length + " 个和弦，扫错 " + mistakes + " 次，用时 " + fmtDur((Date.now() - t0) / 1000) + "。", badBars);
        }
        practice = { running: true, stop: stop, skip: function () { if (running && cur()) { mistakes++; advance(false); } } };
        show();
      }).catch(micHelp);
    }

    /* 跟拍练：谱子按速度走，在时间窗里弹对/扫对就得分 */
    function startTempo() {
      var targets = [];
      if (part === "melody") P.tab.events.forEach(function (ev, i) { if (!ev.rest && !ev.tiedFrom && ev.start + 1e-6 >= from) targets.push({ start: ev.start, dur: ev.dur, midi: ev.midi, els: [els.ev[i]], bar: ev.bar }); });
      else P.chords.segs.forEach(function (sg, i) { if (sg.chord && sg.start + 1e-6 >= from) targets.push({ start: sg.start, dur: sg.dur, chord: sg.chord, els: (els.st[i] || []).concat(els.cs[i] ? [els.cs[i]] : []), bar: sg.bar }); });
      if (!targets.length) return;
      Audio.get();
      Mic.start().then(function () { var c = Audio.get(); return c.resume ? Promise.race([c.resume().catch(function () { }), new Promise(function (r) { setTimeout(r, 400); })]) : null; }).then(function () {
        var running = true, hits = 0, offsets = [];
        clearCls("ok"); clearCls("miss"); $("#result").innerHTML = ""; $("#go").textContent = "■ 停止";
        var spb = 60 / bpm(), tolBeat = Math.max(0.5, 0.3 / spb);
        function win(t) { return part === "melody" ? Math.max(tolBeat, t.dur * 0.6) : t.dur; }
        var off = Mic.on(function (type, d) {
          if (!running || !Player.playing) return;
          if (part === "melody" && (type === "note" || type === "hit")) {
            var b = Player.beatAt(d.time - 0.04), best = null;
            targets.forEach(function (t) { if (t.hit || t.midi % 12 !== d.midi % 12) return; var dt = b - t.start; if (dt > -tolBeat && dt < win(t) && (!best || Math.abs(dt) < Math.abs(best.dt))) best = { t: t, dt: dt }; });
            if (best) { best.t.hit = true; hits++; offsets.push(best.dt * spb); best.t.els.forEach(function (e) { if (e) e.classList.add("ok"); }); }
          } else if (part === "chords" && type === "chord" && d.ok) {
            var b2 = Player.beatAt(d.time);
            targets.forEach(function (t) { if (!t.hit && t.chord === Mic.expectChord && b2 > t.start - tolBeat && b2 < t.start + t.dur) { t.hit = true; hits++; t.els.forEach(function (e) { if (e) e.classList.add("ok"); }); } });
          }
        });
        function stop() { running = false; off(); Player.stop(); Mic.setExpect(null); Mic.setChord(null); resetCursor(); if (!Recorder.rec) Mic.stop(); var g = $("#go"); if (g) g.textContent = "🎤 开始跟拍练"; practice.running = false; }
        practice = { running: true, stop: stop };
        live('<span class="muted">准备……听一小节节拍器，然后开始</span>');
        Player.play({
          song: s, P: P, parts: [], bpm: bpm(), from: from, metro: state.settings.metro, countIn: true,
          onBeat: function (beat) {
            if (beat < from) { live('<span class="muted">预备：' + Math.ceil(from - beat) + "</span>"); return; }
            cursor(beat);
            if (part === "melody") Mic.setExpect(targets.filter(function (t) { return !t.hit && Math.abs(t.start - beat) < tolBeat * 1.5; }).map(function (t) { return t.midi; }));
            else { var ci = segAt(beat); Mic.setChord(ci >= 0 ? P.chords.segs[ci].chord : null); if (!Mic.chordAt && Mic.expectChord) { /* 等下一次扫弦 */ } }
            targets.forEach(function (t) { if (!t.hit && !t.missed && beat > t.start + win(t)) { t.missed = true; t.els.forEach(function (e) { if (e) e.classList.add("miss"); }); } });
            live('<span class="muted">弹中 </span><b>' + hits + '</b><span class="muted"> / ' + targets.length + "</span>");
          },
          onEnd: function () {
            stop();
            var score = Math.round(100 * hits / targets.length), avg = offsets.length ? offsets.reduce(function (a, b) { return a + b; }, 0) / offsets.length : 0;
            var feel = part !== "melody" || !offsets.length ? "" : avg > 0.08 ? "整体稍微有点慢（拖拍）。" : avg < -0.08 ? "整体稍微有点抢拍。" : "节奏很稳。";
            var badBars = {}; targets.forEach(function (t) { if (!t.hit) badBars[t.bar + 1] = (badBars[t.bar + 1] || 0) + 1; });
            showResult(score, "tempo", "速度 ♩=" + bpm() + "，" + targets.length + " 个" + (part === "melody" ? "音" : "和弦") + "弹中 " + hits + " 个。" + feel, badBars);
          }
        });
      }).catch(micHelp);
    }

    function showResult(score, kind, detail, badBars) {
      var key = part + ":" + kind, st = songState(s.id), prev = st.best[key] || 0;
      if (score > prev) st.best[key] = score;
      if (s.cat === "warm") markDone("warm");
      if (s.id === state.settings.current) markDone("song");
      save();
      var worst = Object.keys(badBars).sort(function (a, b) { return badBars[b] - badBars[a]; }).slice(0, 3), n = stars(score);
      $("#result").innerHTML = '<section class="result"><div class="big">' + score + '<small>分</small></div><div class="stars">' + starHTML(n) + "</div>" +
        "<p>" + esc(PART_NAME[part] + " · " + MODE_NAME[kind]) + "　" + (score > prev ? (prev ? "新纪录！之前最好 " + prev + " 分" : "第一次的成绩") : "最好成绩 " + prev + " 分") + "</p>" +
        '<p class="muted">' + esc(detail) + "</p>" + (worst.length ? '<p class="muted">要多练的地方：第 ' + worst.join("、") + " 小节（谱上标红的地方）。</p>" : "") +
        '<p class="praise">' + (n === 3 ? "太棒了！可以试试另一种弹法，或者把速度调快一点。" : n === 2 ? "很不错，再来一两遍就更稳了。" : n === 1 ? "已经有样子了。慢一点，一个一个弹准。" : "没关系，先听几遍示范，再慢慢来。") + "</p>" +
        '<button class="btn primary" id="again">再来一次</button></section>';
      $("#again").onclick = function () { $("#result").innerHTML = ""; clearCls("ok"); clearCls("bad"); clearCls("miss"); (kind === "tempo" ? startTempo : part === "melody" ? startWaitMelody : startWaitChords)(); };
      $("#result").scrollIntoView({ behavior: "smooth", block: "center" });
    }
    function loadRecs() {
      var box = $("#myrecs"); if (!box) return;
      RecDB.all().then(function (all) {
        var mine = all.filter(function (r) { return r.songId === s.id; });
        box.innerHTML = mine.length ? mine.map(recRow).join("") : '<p class="muted small">还没有录音。点「● 录音」，弹完再点一次停止。</p>';
        bindRecRows(box, loadRecs);
      }).catch(function () { box.innerHTML = '<p class="muted small">这个浏览器不能保存录音（可能是无痕模式）。</p>'; });
    }
    $$("#parts button").forEach(function (b) { b.onclick = function () { if (b.disabled) return; part = b.getAttribute("data-p"); $$("#parts button").forEach(function (x) { x.setAttribute("aria-selected", x === b); }); from = 0; drawScore(); setupMode(); }; });
    $$("#modes button").forEach(function (b) { b.onclick = function () { mode = b.getAttribute("data-m"); $$("#modes button").forEach(function (x) { x.setAttribute("aria-selected", x === b); }); setupMode(); }; });
    $("#showdia").onchange = function () { state.settings.diagrams = this.checked; save(); drawScore(); };
    if ($("#showlyr")) $("#showlyr").onchange = function () { state.settings.lyrics = this.checked; save(); drawScore(); };
    $("#big").onchange = function () { state.settings.big = this.checked; save(); drawScore(); };
    $("#setcur").onclick = function () { state.settings.current = s.id; save(); this.textContent = "✓ 正在练这首"; toast("已设为「在练」，会出现在今天的练习里"); };
    var rz; var onRz = function () { clearTimeout(rz); rz = setTimeout(function () { if (!Player.playing && !(practice && practice.running)) drawScore(); }, 250); };
    window.addEventListener("resize", onRz); onLeave(function () { window.removeEventListener("resize", onRz); });
    drawScore(); setupMode(); loadRecs();
  }

  /* ───────── 录音列表 ───────── */
  var recCache = {};
  function recRow(r) {
    var d = new Date(r.date);
    return '<div class="rec" data-id="' + r.id + '"><div class="rt"><b>' + esc(r.title) + '</b><span class="muted small">' + dayKey(d) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + " · " + (PART_NAME[r.part] || "") + " · " + fmtDur(r.dur) + '</span></div><div class="ra"><button class="btn" data-act="play">▶ 播放</button><button class="btn" data-act="dl">保存</button><button class="btn danger" data-act="del">删除</button></div><audio hidden></audio></div>';
  }
  function bindRecRows(box, reload) {
    RecDB.all().then(function (all) { all.forEach(function (r) { recCache[r.id] = r; }); });
    $$(".rec", box).forEach(function (row) {
      var id = +row.getAttribute("data-id"), audio = $("audio", row);
      $$("button", row).forEach(function (b) {
        b.onclick = function () {
          var r = recCache[id]; if (!r) return; var act = b.getAttribute("data-act");
          if (act === "play") {
            if (!audio.src) audio.src = URL.createObjectURL(r.blob);
            if (audio.paused) { $$("audio").forEach(function (a) { if (a !== audio) a.pause(); }); audio.play(); b.textContent = "❚❚ 暂停"; audio.onended = function () { b.textContent = "▶ 播放"; }; }
            else { audio.pause(); b.textContent = "▶ 播放"; }
          } else if (act === "dl") {
            var a = document.createElement("a"), ext = /mp4/.test(r.mime) ? "m4a" : /ogg/.test(r.mime) ? "ogg" : "webm";
            a.href = URL.createObjectURL(r.blob); a.download = "Natalie吉他-" + r.title + "-" + dayKey(new Date(r.date)) + "." + ext; document.body.appendChild(a); a.click(); a.remove();
          } else if (act === "del") { if (confirm("删除这段录音？删除后不能恢复。")) RecDB.del(id).then(reload); }
        };
      });
    });
  }
  function viewRecs(main) {
    main.innerHTML = '<header class="pagehead"><h1>录音</h1><p class="muted">录音只保存在这部手机上。想留着或发给别人，点「保存」。</p></header><div id="allrecs" class="recs"><p class="muted">读取中……</p></div>';
    function loadAll() { RecDB.all().then(function (all) { $("#allrecs").innerHTML = all.length ? all.map(recRow).join("") : '<p class="muted">还没有录音。在任何一首歌的页面点「● 录音」就可以录。</p>'; bindRecRows($("#allrecs"), loadAll); }).catch(function () { $("#allrecs").innerHTML = '<p class="muted">这个浏览器不能保存录音。</p>'; }); }
    loadAll();
  }

  /* ───────── 调音器 ───────── */
  function viewTuner(main) {
    var targets = [6, 5, 4, 3, 2, 1].map(function (st) { return { st: st, m: G.OPEN[st] }; }), fixed = null, okCount = {}, off = null;
    main.innerHTML = '<header class="pagehead"><a class="back" href="#/today">‹ 今天</a><h1>调音器</h1><p class="muted">一次拨一根空弦（左手不要按），看屏幕提示拧弦钮。六根都显示「准了」就可以开始练。</p></header>' +
      '<div class="seg tuner-strings" id="ts">' + targets.map(function (t) { return '<button data-st="' + t.st + '">' + t.st + " 弦<br><b>" + G.STRING_NAME[t.st] + "</b></button>"; }).join("") + "</div>" +
      '<p class="muted small center">点上面的弦可以固定只调这一根；不点就自动认出你拨的是哪根弦。点两下可以听标准音。</p>' +
      '<section class="tuner-card"><div class="t-string" id="tstr">拨一根空弦</div><div class="t-note" id="tnote">—</div>' +
      '<div class="gauge"><div class="g-scale"><span>偏低</span><span>准</span><span>偏高</span></div><div class="g-bar"><i class="g-mid"></i><i class="g-needle" id="needle"></i></div></div>' +
      '<div class="t-hint" id="thint">点下面的按钮开始</div><button class="btn primary big-btn" id="tgo">🎤 开始调音</button></section>' +
      '<section class="card"><h2 class="h2">怎么拧</h2><p>音<b>偏低</b>：把这根弦的弦钮往<b>拧紧</b>的方向转一点点。音<b>偏高</b>：往<b>放松</b>的方向转一点点。不知道哪边是拧紧？轻轻转一下，边拨边看指针往哪边走。</p><p class="muted small">一次只转一点点，弦拧得太紧会断。</p></section>';
    $$("#ts button").forEach(function (b) {
      var lastTap = 0;
      b.onclick = function () {
        var st = +b.getAttribute("data-st");
        if (Date.now() - lastTap < 400) { var c = Audio.get(); Audio.pluck(G.OPEN[st], c.currentTime + 0.05, 1.8, 0.6); }
        lastTap = Date.now();
        fixed = fixed === st ? null : st; $$("#ts button").forEach(function (x) { x.classList.toggle("on", +x.getAttribute("data-st") === fixed); });
      };
    });
    function update(d) {
      var f = d.freq, best = null;
      (fixed ? targets.filter(function (t) { return t.st === fixed; }) : targets).forEach(function (t) { var c = 1200 * Math.log2(f / G.midiFreq(t.m)); if (!best || Math.abs(c) < Math.abs(best.c)) best = { t: t, c: c }; });
      if (!best || Math.abs(best.c) > 600) return;
      var c = Math.round(best.c), clamp = Math.max(-50, Math.min(50, c));
      $("#tstr").textContent = best.t.st + " 弦（" + G.STRING_NAME[best.t.st] + "）";
      $("#tnote").textContent = nm(Math.round(69 + 12 * Math.log2(f / 440)));
      $("#needle").style.left = (50 + clamp) + "%";
      var ok = Math.abs(c) <= 6, card = $(".tuner-card");
      card.classList.toggle("ok", ok);
      $("#thint").textContent = ok ? "准了 ✓" : c < 0 ? "偏低 " + (-c) + " 音分 → 拧紧一点" : "偏高 " + c + " 音分 → 放松一点";
      if (ok) { okCount[best.t.st] = (okCount[best.t.st] || 0) + 1; if (okCount[best.t.st] === 8) { var b = $('#ts button[data-st="' + best.t.st + '"]'); if (b) b.classList.add("done"); if (Object.keys(okCount).filter(function (k) { return okCount[k] >= 8; }).length >= 6) { markDone("tune"); toast("六根弦都调准了 ✓"); } else if (Object.keys(okCount).filter(function (k) { return okCount[k] >= 8; }).length >= 1) markDone("tune"); } }
    }
    $("#tgo").onclick = function () {
      var b = this;
      if (Mic.active) { Mic.stop(); if (off) off(); off = null; b.textContent = "🎤 开始调音"; $("#thint").textContent = "已暂停"; return; }
      Mic.start().then(function () { b.textContent = "■ 停止"; $("#thint").textContent = "拨一根空弦……"; off = Mic.on(function (type, d) { if (type === "pitch" && d.clarity > 0.8) update(d); }); }).catch(micHelp);
    };
    onLeave(function () { if (off) off(); });
  }

  /* ───────── 识谱：课程 + 练习 ───────── */
  var QUIZ = {
    "tab-open": { kind: "tab", name: "六根空弦", desc: "看谱认出是哪根空弦、什么音", pos: function () { return [1, 2, 3, 4, 5, 6].map(function (s) { return [s, 0]; }); } },
    "tab-top": { kind: "tab", name: "1–3 弦的音", desc: "1、2、3 弦，0–3 品", pos: function () { return natural([1, 2, 3]); } },
    "tab-all": { kind: "tab", name: "六根弦第一把位", desc: "全部六根弦，0–3 品", pos: function () { return natural([1, 2, 3, 4, 5, 6]); } },
    "chord": { kind: "chord", name: "看图认和弦", desc: "Em、Am、C、G、D 五个入门和弦", set: ["Em", "Am", "C", "G", "D"] },
    "chord-2": { kind: "chord", name: "看图认和弦（更多）", desc: "再加 E、A、Dm、G7、D7", set: ["Em", "Am", "C", "G", "D", "E", "A", "Dm", "G7", "D7"] }
  };
  function natural(strings) { var out = []; strings.forEach(function (s) { for (var f = 0; f <= 3; f++) { var n = G.NAMES[(G.OPEN[s] + f) % 12]; if (n.length === 1) out.push([s, f]); } }); return out; }
  function viewRead(main) {
    var qs = state.quiz.best || {};
    main.innerHTML = '<header class="pagehead"><h1>识谱</h1><p class="muted">先看小课，再做练习。每次 10 题，可以点按钮回答，也可以直接在吉他上弹出来。</p></header>' +
      '<a class="btn primary wide" href="#/tuner">🎵 调音器</a>' +
      '<section class="card"><h2 class="h2">识谱练习</h2><div class="quizlist">' + Object.keys(QUIZ).map(function (k) { var z = QUIZ[k]; return '<a class="qz" href="#/quiz/' + k + '"><b>' + esc(z.name) + '</b><span class="muted small">' + esc(z.desc) + "</span>" + (qs[k] ? '<span class="small">最好 ' + qs[k] + " 分</span>" : "") + "</a>"; }).join("") + "</div></section>" +
      '<section class="card"><h2 class="h2">小课</h2><ol class="lessons">' + DATA.lessons.map(function (l) { return '<li><a href="#/lesson/' + l.id + '">' + esc(l.title) + "</a></li>"; }).join("") + "</ol></section>";
  }
  function viewLesson(main, id) {
    var idx = DATA.lessons.findIndex(function (l) { return l.id === id; }), l = DATA.lessons[idx];
    if (!l) { location.hash = "#/read"; return; }
    var prev = DATA.lessons[idx - 1], next = DATA.lessons[idx + 1];
    main.innerHTML = '<header class="pagehead"><a class="back" href="#/read">‹ 识谱</a><h1>' + esc(l.title) + '</h1></header><section class="card lesson">' + l.body.map(function (p) { return "<p>" + p + "</p>"; }).join("") +
      (l.chords ? '<div class="lchords">' + l.chords.map(function (c) { return '<button class="lc" data-c="' + c + '">' + G.chordSVG(c, 110) + '<span class="muted small">点一下听</span></button>'; }).join("") + "</div>" : "") +
      (l.tab ? '<div class="score" id="ltab"></div><button class="btn" id="lplay">▶ 听一听</button>' : "") +
      (l.fretboard ? '<div class="fbwrap" id="lfb"></div><p class="muted small">点指板左边的空弦圆圈，可以听每根弦的音。</p>' : "") +
      (l.tuner ? '<a class="btn primary" href="#/tuner">打开调音器</a>' : "") + "</section>" +
      '<nav class="pager">' + (prev ? '<a class="btn" href="#/lesson/' + prev.id + '">‹ 上一课</a>' : "<span></span>") + (next ? '<a class="btn primary" href="#/lesson/' + next.id + '">下一课 ›</a>' : '<a class="btn primary" href="#/quiz/tab-open">去做识谱练习 ›</a>') + "</nav>";
    $$(".lc").forEach(function (b) { b.onclick = function () { var c = Audio.get(); Audio.strum(b.getAttribute("data-c"), c.currentTime + 0.05, 1.6, "D", 0.25); }; });
    if (l.fretboard) {
      $("#lfb").innerHTML = G.fretboardSVG(Math.min(640, $("#lfb").clientWidth || 360));
      $$("#lfb .fb-dot").forEach(function (d) { var sf = d.getAttribute("data-sf").split("."); if (sf[1] === "0") { d.classList.add("tgt"); d.style.cursor = "pointer"; d.addEventListener("click", function () { var c = Audio.get(); Audio.pluck(G.OPEN[+sf[0]], c.currentTime + 0.05, 1.5, 0.6); }); } });
    }
    if (l.tab) {
      var fake = { meter: "4/4", strum: "" }, PP = { tab: G.parseTab(l.tab, "4/4"), chords: G.parseChords("", "4/4") };
      $("#ltab").innerHTML = G.tabSVG(fake, PP, "melody", Math.max(320, $("#ltab").clientWidth - 8), { diagrams: false }).svg;
      $("#lplay").onclick = function () { var c = Audio.get(), t = c.currentTime + 0.1; PP.tab.events.forEach(function (e, i) { if (!e.rest) Audio.pluck(e.midi, t + i * 0.55, 0.5, 0.5); }); };
    }
  }
  function viewQuiz(main, id) {
    var z = QUIZ[id]; if (!z) { location.hash = "#/read"; return; }
    var N = 10, n = 0, ok = 0, t0 = Date.now(), cur = null, answered = false, useMic = state.settings.quizMic || false, offMic = null, timer = 0;
    main.innerHTML = '<header class="pagehead"><a class="back" href="#/read">‹ 识谱</a><h1>' + esc(z.name) + '</h1><p class="muted">' + esc(z.desc) + "</p></header>" +
      '<div class="qbar"><span id="qprog">1 / ' + N + '</span><label class="chk"><input type="checkbox" id="qmic"' + (useMic ? " checked" : "") + "> 用吉他弹出答案（麦克风）</label></div>" +
      '<div class="qshow" id="qshow"></div><p class="qfb" id="qfb" aria-live="polite"></p><div class="answers" id="answers"></div><div class="fbwrap" id="qfbw"></div><div id="qres"></div>';
    $("#qfbw").innerHTML = G.fretboardSVG(Math.min(640, $("#qfbw").clientWidth || 360));
    function fbMark(sfs, cls) { $$("#qfbw .fb-dot." + cls).forEach(function (e) { e.classList.remove(cls); }); (sfs || []).forEach(function (sf) { var e = $('#qfbw .fb-dot[data-sf="' + sf + '"]'); if (e) e.classList.add(cls); }); }
    function pick() {
      if (z.kind === "chord") { var c; do { c = z.set[Math.floor(Math.random() * z.set.length)]; } while (c === cur && z.set.length > 1); return c; }
      var pool = z.pos(), w = pool.map(function (p) { var st = state.quiz.stats[p.join(".")]; return 1 + (st ? Math.max(0, Math.min(4, st.bad * 1.5 - st.ok * 0.3)) : 0.5); });
      var sum = w.reduce(function (a, b) { return a + b; }, 0), r = Math.random() * sum;
      for (var i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i].join(".") === (cur || "") && pool.length > 1 ? pool[(i + 1) % pool.length].join(".") : pool[i].join("."); }
      return pool[0].join(".");
    }
    function ask() {
      answered = false; cur = pick(); $("#qprog").textContent = (n + 1) + " / " + N; fbMark([], "tgt"); fbMark([], "wrong");
      if (z.kind === "chord") {
        $("#qshow").innerHTML = G.chordSVG(cur, 170, { fingers: true }).replace(/<text[^>]*class="cd-n"[^>]*>[^<]*<\/text>/, "");
        var opts = [cur], others = z.set.filter(function (c) { return c !== cur; }).sort(function () { return Math.random() - 0.5; });
        opts = opts.concat(others.slice(0, 3)).sort(function () { return Math.random() - 0.5; });
        $("#answers").className = "answers chordans";
        $("#answers").innerHTML = opts.map(function (c) { return '<button data-a="' + c + '"><b>' + c + "</b></button>"; }).join("");
        $("#qfb").textContent = useMic ? "按这个和弦扫一下（也可以点答案）" : "这是什么和弦？";
        Mic.setChord(useMic ? cur : null);
      } else {
        var sf = cur.split(".").map(Number), m = G.OPEN[sf[0]] + sf[1];
        var PP = { tab: G.parseTab(sf[0] + "." + sf[1] + ":4", "4/4"), chords: G.parseChords("", "4/4") };
        $("#qshow").innerHTML = G.tabSVG({ meter: "4/4", strum: "" }, PP, "melody", 300, { diagrams: false, big: true }).svg.replace(/<text[^>]*class="tmeter"[^>]*>[^<]*<\/text>/, "").replace(/<text[^>]*class="rest"[^>]*>4拍<\/text>/, "");
        $("#answers").className = "answers";
        $("#answers").innerHTML = ["C", "D", "E", "F", "G", "A", "B"].map(function (L) { return '<button data-a="' + L + '"><b>' + L + "</b><span>" + G.SOLF[L] + "</span></button>"; }).join("");
        $("#qfb").textContent = useMic ? "在吉他上弹出这个音（也可以点答案）" : "这个位置是什么音？";
        Mic.setExpect(useMic ? [m] : null);
      }
      $$("#answers button").forEach(function (b) { b.onclick = function () { answer(b.getAttribute("data-a")); }; });
    }
    function rightAnswer() { if (z.kind === "chord") return cur; var sf = cur.split(".").map(Number); return G.NAMES[(G.OPEN[sf[0]] + sf[1]) % 12]; }
    function answer(a, heardMidi) {
      if (answered) return; answered = true;
      var right = rightAnswer(), good = a === right, st = state.quiz.stats[cur] = state.quiz.stats[cur] || { ok: 0, bad: 0 };
      if (good) { ok++; st.ok++; } else st.bad++;
      save();
      $$("#answers button").forEach(function (b) { var x = b.getAttribute("data-a"); b.disabled = true; if (x === right) b.className = "right"; else if (x === a) b.className = "wrongb"; });
      var c = Audio.get();
      if (z.kind === "chord") { fbMark(G.CHORDS[cur].frets.map(function (f, k) { return f >= 0 ? (6 - k) + "." + f : null; }).filter(Boolean), "tgt"); Audio.strum(cur, c.currentTime + 0.05, 1.4, "D", 0.25); }
      else { var sf = cur.split(".").map(Number); fbMark([cur], "tgt"); if (heardMidi && !good) fbMark(G.positionsOf(heardMidi).slice(0, 1), "wrong"); Audio.pluck(G.OPEN[sf[0]] + sf[1], c.currentTime + 0.05, 1, 0.6); }
      $("#qfb").className = "qfb " + (good ? "good" : "badq");
      if (z.kind === "chord") $("#qfb").innerHTML = (good ? "对！" : "是 <b>" + right + "</b>。") + esc(G.CHORDS[right].name) + "，指板上亮起的就是它的按法。";
      else { var p = cur.split("."); $("#qfb").innerHTML = (good ? "对！" : "是 <b>" + right + "</b>（" + G.SOLF[right] + "）。") + p[0] + " 弦" + (p[1] === "0" ? "空弦" : " " + p[1] + " 品") + "，指板上亮起的位置。"; }
      n++; timer = setTimeout(function () { if (n >= N) finish(); else ask(); }, good ? 1300 : 2600);
    }
    function finish() {
      if (offMic) { offMic(); offMic = null; } Mic.stop(); Mic.setExpect(null); Mic.setChord(null);
      var score = ok * 10, prev = state.quiz.best[id] || 0; if (score > prev) state.quiz.best[id] = score;
      markDone("quiz"); save();
      $("#qres").innerHTML = '<section class="result"><div class="big">' + score + '<small>分</small></div><div class="stars">' + starHTML(stars(score)) + "</div><p>10 题对 " + ok + " 题，用时 " + fmtDur((Date.now() - t0) / 1000) + "。" + (score > prev && prev ? "新纪录！" : "") + "</p>" +
        '<p class="praise">' + (score >= 90 ? "很熟了，可以试试下一组。" : "认错的会在下次多出几次，多练就记住了。") + '</p><button class="btn primary" id="qagain">再来 10 题</button> <a class="btn" href="#/read">返回</a></section>';
      $("#qagain").onclick = function () { n = 0; ok = 0; t0 = Date.now(); $("#qres").innerHTML = ""; if (useMic) startMic(); ask(); };
      $("#qres").scrollIntoView({ behavior: "smooth" });
    }
    function startMic() {
      Mic.start().then(function () {
        if (offMic) offMic();
        offMic = Mic.on(function (type, d) {
          if (answered) return;
          if (z.kind === "chord") { if (type === "chord" && !d.unclear) answer(d.ok ? cur : d.chord); return; }
          if (type === "hit") { answer(rightAnswer()); return; }
          if (type === "note" && d.clarity >= 0.8 && d.fresh) { var L = G.NAMES[d.midi % 12]; if (L !== rightAnswer()) { var q = cur; setTimeout(function () { if (!answered && cur === q) answer(L.length === 1 ? L : L, d.midi); }, 350); } }
        });
        if (!answered) { if (z.kind === "chord") Mic.setChord(cur); else { var sf = cur.split(".").map(Number); Mic.setExpect([G.OPEN[sf[0]] + sf[1]]); } }
      }).catch(function (e) { micHelp(e); $("#qmic").checked = false; useMic = false; });
    }
    $("#qmic").onchange = function () {
      useMic = state.settings.quizMic = this.checked; save();
      if (useMic) startMic(); else { if (offMic) offMic(); offMic = null; Mic.stop(); Mic.setExpect(null); Mic.setChord(null); }
      if (!answered) $("#qfb").textContent = useMic ? (z.kind === "chord" ? "按这个和弦扫一下（也可以点答案）" : "在吉他上弹出这个音（也可以点答案）") : (z.kind === "chord" ? "这是什么和弦？" : "这个位置是什么音？");
    };
    onLeave(function () { clearTimeout(timer); if (offMic) offMic(); });
    if (useMic) startMic();
    ask();
  }

  /* ───────── 设置 ───────── */
  function viewSettings(main) {
    main.innerHTML = '<header class="pagehead"><a class="back" href="#/today">‹ 今天</a><h1>设置</h1></header>' +
      '<section class="card"><h2 class="h2">字体大小</h2><div class="seg" id="fs">' + [["1", "标准"], ["1.12", "大"], ["1.25", "特大"]].map(function (x) { return '<button data-f="' + x[0] + '" aria-selected="' + (String(state.settings.fs || "1.12") === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div></section>" +
      '<section class="card"><h2 class="h2">麦克风</h2><p class="muted">看板听不准的时候：手机离吉他近一点（放在谱架上，话筒朝向音孔），关掉风扇和电视。先用调音器把弦调准，识别会准很多。</p><a class="btn" href="#/tuner">打开调音器（也能测试麦克风）</a></section>' +
      '<section class="card"><h2 class="h2">备份与换手机</h2><p class="muted">练习记录只保存在这部手机里。换手机前先「导出备份」，在新手机上「导入备份」。录音不在备份里，请在录音页单独保存。</p><button class="btn" id="exp">导出备份</button> <label class="btn">导入备份<input type="file" id="imp" accept="application/json,.json" hidden></label></section>' +
      '<section class="card"><h2 class="h2">关于</h2><p class="muted small">版本 ' + esc(VERSION) + "。内容更新后会自动刷新。所有功能都在手机上运行，不上传任何声音或记录。曲目都是公有领域的旋律。</p></section>";
    $$("#fs button").forEach(function (b) { b.onclick = function () { state.settings.fs = b.getAttribute("data-f"); save(); applyFs(); $$("#fs button").forEach(function (x) { x.setAttribute("aria-selected", x === b); }); }; });
    $("#exp").onclick = function () { var blob = new Blob([JSON.stringify(state, null, 1)], { type: "application/json" }), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "Natalie吉他备份-" + dayKey() + ".json"; document.body.appendChild(a); a.click(); a.remove(); };
    $("#imp").onchange = function () { var f = this.files[0]; if (!f) return; f.text().then(function (txt) { var o = JSON.parse(txt); if (!o || !o.days) throw new Error("bad"); if (!confirm("用备份覆盖这部手机上的练习记录？")) return; localStorage.setItem(KEY, JSON.stringify(o)); state = load(); toast("已导入"); render(); }).catch(function () { toast("文件不对，导入失败"); }); };
  }
  function applyFs() { document.documentElement.style.setProperty("--fs", state.settings.fs || "1.12"); }

  /* ───────── 自动更新 ───────── */
  function checkUpdate() {
    if (VERSION === "dev") return;
    fetch("version.json?t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.v || j.v === VERSION) return;
      var go = function () { location.replace(location.pathname + "?v=" + encodeURIComponent(j.v) + location.hash); };
      if (!Player.playing && !Mic.active && !Recorder.rec && route().name !== "quiz") go(); else { var b = $("#update"); b.hidden = false; b.onclick = go; }
    }).catch(function () { });
  }
  setInterval(checkUpdate, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) checkUpdate(); });
  document.addEventListener("pointerdown", function unlock() { try { var c = Audio.get(), b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch (e) { } document.removeEventListener("pointerdown", unlock); });
  if ("serviceWorker" in navigator) { try { navigator.serviceWorker.register("sw.js"); } catch (e) { } }

  applyFs(); render();
  window.__guitar = { Mic: Mic, Player: Player, Audio: Audio, chromaOf: chromaOf, templateOf: templateOf, cosine: cosine, state: function () { return state; } };
})();
