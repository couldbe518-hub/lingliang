/* Grace 练琴 · 主程序。所有功能都在浏览器里运行，不调用任何 AI 或后端。 */
(function () {
  "use strict";
  var M = window.PianoMusic;
  var DATA = window.PIANO_DATA;
  var SONGS = DATA.songs;
  var SONG = {};
  SONGS.forEach(function (s) { SONG[s.id] = s; });
  var VERSION = window.PIANO_VERSION || "dev";
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };
  var CAT_NAME = { hymn: "赞美诗", classic: "世界名曲", warm: "手指热身" };
  var LEVEL_NAME = { 1: "入门", 2: "初级", 3: "中级", 4: "进阶" };
  var HAND_NAME = { rh: "右手", lh: "左手", both: "双手" };
  var MODE_NAME = { wait: "跟谱练", tempo: "跟拍练" };

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function toast(msg, ms) {
    var t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("show"); }, ms || 2200);
  }

  /* ───────── 本机存储 ───────── */
  var KEY = "gracePiano.v1";
  var state = load();
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { s = null; }
    s = s || {};
    s.days = s.days || {};
    s.songs = s.songs || {};
    s.quiz = s.quiz || { stats: {}, rounds: 0 };
    s.settings = s.settings || {};
    if (!s.settings.current || !SONG[s.settings.current]) s.settings.current = "jesus-loves-me";
    if (!s.settings.labels) s.settings.labels = "none";
    if (!s.settings.speed) s.settings.speed = 0.8;
    if (s.settings.metro === undefined) s.settings.metro = true;
    return s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 隐私模式下可能失败 */ } }
  function today() { var k = dayKey(); state.days[k] = state.days[k] || { sec: 0 }; return state.days[k]; }
  function markDone(step) { var d = today(); if (!d[step]) { d[step] = true; save(); } }
  function songState(id) { state.songs[id] = state.songs[id] || { best: {} }; return state.songs[id]; }
  function dayActive(d) { return d && (d.warm || d.quiz || d.song || d.rec || (d.sec || 0) >= 120); }
  function streak() {
    var n = 0, d = new Date();
    if (!dayActive(state.days[dayKey(d)])) d = addDays(d, -1);
    while (dayActive(state.days[dayKey(d)])) { n++; d = addDays(d, -1); }
    return n;
  }

  /* 练习时长：在练习页面且最近 2 分钟内有操作，或麦克风/播放进行中 */
  var lastAct = Date.now();
  ["pointerdown", "keydown", "touchstart"].forEach(function (ev) { document.addEventListener(ev, function () { lastAct = Date.now(); }, { passive: true }); });
  setInterval(function () {
    if (document.hidden) return;
    var r = route();
    var practicing = r.name === "song" || r.name === "quiz" || r.name === "lesson";
    if (!practicing) return;
    if (Date.now() - lastAct < 120000 || Mic.active || Player.playing) { today().sec += 5; if (Math.random() < 0.2) save(); }
  }, 5000);
  window.addEventListener("pagehide", save);

  /* ───────── 录音存储（IndexedDB，只在本机） ───────── */
  var RecDB = {
    db: null,
    open: function () {
      var self = this;
      if (self.db) return Promise.resolve(self.db);
      return new Promise(function (res, rej) {
        if (!window.indexedDB) return rej(new Error("no idb"));
        var r = indexedDB.open("grace-piano", 1);
        r.onupgradeneeded = function () { r.result.createObjectStore("recs", { keyPath: "id", autoIncrement: true }); };
        r.onsuccess = function () { self.db = r.result; res(self.db); };
        r.onerror = function () { rej(r.error); };
      });
    },
    tx: function (mode, fn) {
      return this.open().then(function (db) {
        return new Promise(function (res, rej) {
          var t = db.transaction("recs", mode), st = t.objectStore("recs"), out;
          var q = fn(st); if (q) q.onsuccess = function () { out = q.result; };
          t.oncomplete = function () { res(out); }; t.onerror = function () { rej(t.error); };
        });
      });
    },
    add: function (rec) { return this.tx("readwrite", function (st) { return st.add(rec); }); },
    all: function () { return this.tx("readonly", function (st) { return st.getAll(); }).then(function (a) { return (a || []).sort(function (x, y) { return y.id - x.id; }); }); },
    del: function (id) { return this.tx("readwrite", function (st) { return st.delete(id); }); }
  };

  /* ───────── 声音：钢琴音色、节拍器 ───────── */
  try { if (navigator.audioSession) navigator.audioSession.type = "play-and-record"; } catch (e) { }
  var Audio = {
    ctx: null, master: null,
    get: function () {
      if (!this.ctx) {
        var C = window.AudioContext || window.webkitAudioContext;
        this.ctx = new C();
        var comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 4;
        this.master = this.ctx.createGain(); this.master.gain.value = 0.9;
        this.master.connect(comp); comp.connect(this.ctx.destination);
      }
      if (this.ctx.state !== "running" && this.ctx.state !== "closed") { try { this.ctx.resume(); } catch (e) { } }
      return this.ctx;
    },
    session: function (type) {
      // iOS：页面一开始就固定为可录音模式，之后不再切换，否则 Safari 会拒绝麦克风
      type = "play-and-record"; try { if (navigator.audioSession && navigator.audioSession.type !== type) navigator.audioSession.type = type; } catch (e) { } },
    note: function (midi, t, dur, vel, dest) {
      var ctx = this.get(), f = M.midiToFreq(midi);
      var out = ctx.createGain(), filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.setValueAtTime(Math.min(9000, f * 9), t);
      filt.frequency.setTargetAtTime(Math.min(4000, f * 3), t + 0.01, 0.35);
      var decay = midi < 48 ? 1.1 : midi < 60 ? 0.8 : midi < 72 ? 0.6 : 0.45;
      out.gain.setValueAtTime(0.0001, t);
      out.gain.linearRampToValueAtTime(vel, t + 0.006);
      out.gain.setTargetAtTime(vel * 0.25, t + 0.01, decay);
      var end = t + Math.max(0.12, dur);
      out.gain.setTargetAtTime(0.0001, end, 0.09);
      out.connect(filt); filt.connect(dest || this.master);
      [[1, "triangle", 1], [2, "sine", 0.32], [3, "sine", 0.1], [1.003, "sine", 0.35]].forEach(function (h) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = h[1]; o.frequency.value = f * h[0]; g.gain.value = h[2];
        o.connect(g); g.connect(out); o.start(t); o.stop(end + 0.6);
      });
    },
    click: function (t, accent, dest) {
      var ctx = this.get(), o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = accent ? 1900 : 1300;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(accent ? 0.35 : 0.22, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + 0.06);
    }
  };

  /* 时间线：把解析后的一只手转成可发声的音（合并延音线） */
  function soundNotes(parsed) {
    var out = [];
    parsed.events.forEach(function (ev, i) {
      if (ev.rest || ev.tiedFrom) return;
      var dur = ev.dur, j = i;
      while (parsed.events[j].tie && parsed.events[j + 1] && parsed.events[j + 1].tiedFrom) { j++; dur += parsed.events[j].dur; }
      ev.pitches.forEach(function (p) { out.push({ start: ev.start, dur: dur, midi: p.midi }); });
    });
    return out;
  }

  function now() { return performance.now() / 1000; }
  var Player = {
    playing: false, bus: null, raf: 0,
    /* opts: { song, parsed:{rh,lh}, hands:["rh","lh"], bpm, from, metro, countIn, onBeat(beat), onEnd() } */
    play: function (o) {
      this.stop();
      var ctx = Audio.get(); 
      var bus = ctx.createGain(); bus.gain.value = 1; bus.connect(Audio.master); this.bus = bus;
      var spb = 60 / o.bpm, from = o.from || 0;
      var barBeats = M.meterBeats(o.song.meter);
      var clickEvery = /\/8$/.test(o.song.meter) ? 1.5 : 1;
      var countBeats = o.countIn ? barBeats : 0;
      var t0 = ctx.currentTime + 0.15 + countBeats * spb;
      var keys = Object.keys(o.parsed);
      var total = Math.max.apply(null, keys.map(function (k) { return o.parsed[k].total || 0; }));
      var firstBar = keys.map(function (k) { return o.parsed[k].bars[0]; }).filter(Boolean)[0];
      var pickup = (firstBar || { len: barBeats }).len;
      var offset = pickup < barBeats - 1e-6 ? barBeats - pickup : 0; // 弱起：让小节线对齐
      o.hands.forEach(function (h) {
        var vel = h.charAt(0) === "l" ? 0.2 : h === "rh2" ? 0.17 : 0.26;
        if (o.quietHand === h) vel *= 0.55;
        soundNotes(o.parsed[h]).forEach(function (n) {
          if (n.start + 1e-6 < from) return;
          Audio.note(n.midi, t0 + (n.start - from) * spb, n.dur * spb * 0.95, vel, bus);
        });
      });
      if (o.metro || o.countIn) {
        for (var b = -countBeats; b < total - from; b += clickEvery) {
          var abs = b + from;
          if (b >= 0 && !o.metro) break;
          var accent = Math.abs(((abs + offset) % barBeats + barBeats) % barBeats) < 1e-6;
          Audio.click(t0 + b * spb, accent, bus);
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
      if (this.bus) {
        var b = this.bus, ctx = Audio.ctx;
        b.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
        setTimeout(function () { try { b.disconnect(); } catch (e) { } }, 400);
        this.bus = null;
      }
    }
  };

  /* ───────── 麦克风：音高识别 ───────── */
  var Mic = {
    active: false, stream: null, analyser: null, buf: null, timer: 0, listeners: [],
    noise: 0.004, hist: [], cand: null, stable: 0, lastDecided: null, pendingOnset: false, silent: 0,
    level: 0, current: null,
    start: function () {
      var self = this;
      if (self.active) return Promise.resolve();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error("此浏览器不支持麦克风"));
      
      // 必须在点击的同一时刻、用最简单的参数请求，iPad Safari 才会弹出授权框；关掉回声消除等放到拿到麦克风之后再做
      var t0 = Date.now();
      return navigator.mediaDevices.getUserMedia({ audio: true })
        .catch(function (e) { e.ms = Date.now() - t0; throw e; })
        .then(function (stream) {
          try { stream.getAudioTracks()[0].applyConstraints({ echoCancellation: false, noiseSuppression: false, autoGainControl: false }).catch(function () { }); } catch (x) { }
          var ctx = Audio.get();
          self.stream = stream;
          self.src = ctx.createMediaStreamSource(stream);
          self.analyser = ctx.createAnalyser(); self.analyser.fftSize = 8192;
          self.src.connect(self.analyser);
          self.buf = new Float32Array(self.analyser.fftSize);
          self.active = true; self.hist = []; self.cand = null; self.stable = 0; self.lastDecided = null;
          self.timer = setInterval(function () { self.frame(); }, 30);
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
      var buf = full.subarray(full.length - 2048);
      var rms = 0; for (var i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
      rms = Math.sqrt(rms / buf.length); this.level = rms;
      if (rms < this.noise) this.noise = this.noise * 0.9 + rms * 0.1; else this.noise += (rms - this.noise) * 0.003;
      var thr = Math.max(0.006, this.noise * 3);
      var minHist = this.hist.length ? Math.min.apply(null, this.hist) : 1;
      this.hist.push(rms); if (this.hist.length > 5) this.hist.shift();
      if (rms < thr) {
        if (++this.silent > 3) { this.lastDecided = null; this.cand = null; this.stable = 0; this.current = null; }
        this.emit("level", { rms: rms }); return;
      }
      this.silent = 0;
      if (rms > minHist * 1.45 && rms > thr * 1.3) { this.pendingOnset = true; this.stable = 0; this.cand = null; this.armed = true; this.hitStreak = {}; this.onsetId = (this.onsetId || 0) + 1; this.sinceOnset = 0; }
      this.sinceOnset = (this.sinceOnset || 0) + 1;
      if (this.needOnset && this.sinceOnset > 12) this.armed = false; // 同一个音重复时，只在刚按下琴键的 0.36 秒内判断
      // 已知"该弹哪个音"时，直接量这个音（及其八度）的能量是否明显盖过相邻半音：比单纯猜音高稳得多
      if (this.expect && this.expect.length && this.armed) {
        var sr = Audio.ctx.sampleRate, self = this;
        this.expect.forEach(function (m) {
          if (targetScore(full, sr, m) >= 1.6) self.hitStreak[m] = (self.hitStreak[m] || 0) + 1; else self.hitStreak[m] = 0;
          if (self.armed && self.hitStreak[m] >= 2) { self.armed = false; self.hitStreak = {}; self.emit("hit", { midi: m, time: now() - 0.08, onset: self.onsetId }); }
        });
      }
      var p = detectPitch(buf, Audio.ctx.sampleRate);
      if (!p) { this.emit("level", { rms: rms }); return; }
      var mf = 69 + 12 * Math.log2(p.freq / 440), m = Math.round(mf);
      if (m < 33 || m > 96) return;
      if (m === this.cand) this.stable++; else { this.cand = m; this.stable = 1; }
      this.current = { midi: m, cents: Math.round((mf - m) * 100), clarity: p.clarity };
      this.emit("pitch", this.current);
      if (this.stable >= 2 && (this.pendingOnset || m !== this.lastDecided)) {
        this.lastDecided = m; this.pendingOnset = false;
        this.emit("note", { midi: m, time: now() - 0.06, clarity: p.clarity, onset: this.onsetId });
      }
    }
  };

  /* needOnset：下一个音和上一个音相同时为 true，必须重新按键才算 */
  Mic.setExpect = function (midis, needOnset) {
    var key = (midis || []).join();
    if (key === this.expectKey && !needOnset) return;
    this.expectKey = key; this.expect = midis || null; this.hitStreak = {}; this.needOnset = !!needOnset; this.armed = !needOnset;
  };
  var HANN = null;
  function goertzel(x, sr, f) {
    if (!HANN || HANN.length !== x.length) { HANN = new Float32Array(x.length); for (var i = 0; i < x.length; i++) HANN[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (x.length - 1)); }
    var w = 2 * Math.PI * f / sr, c = 2 * Math.cos(w), s1 = 0, s2 = 0;
    for (var j = 0; j < x.length; j++) { var s0 = x[j] * HANN[j] + c * s1 - s2; s2 = s1; s1 = s0; }
    return s1 * s1 + s2 * s2 - c * s1 * s2;
  }
  function noteEnergy(x, sr, m) {
    var f = M.midiToFreq(m), e = 0;
    for (var h = 1; h <= 4; h++) { if (f * h < sr / 2 - 200) e += goertzel(x, sr, f * h) / h; }
    return e;
  }
  /* 目标音得分：在目标音上下各半个八度的 12 个半音里，目标音（基音 + 泛音）的能量必须最大，且比第二名高出一截 */
  function targetScore(x, sr, m) {
    var e = {}, best = -1, second = 0;
    for (var k = m - 5; k <= m + 6; k++) e[k] = noteEnergy(x, sr, k);
    for (k = m - 5; k <= m + 6; k++) if (k !== m) second = Math.max(second, e[k]);
    for (k = m - 5; k <= m + 6; k++) best = Math.max(best, e[k]);
    if (e[m] < best) return 0;
    return e[m] / (second + 1e-9);
  }

  /* McLeod 音高法（NSDF），对钢琴的倍频比普通自相关稳 */
  function detectPitch(buf, sr) {
    var N = buf.length, minLag = Math.floor(sr / 1400), maxLag = Math.min(Math.floor(sr / 60), N >> 1);
    var nsdf = new Float32Array(maxLag + 1);
    for (var tau = minLag; tau <= maxLag; tau++) {
      var acf = 0, m = 0;
      for (var j = 0, L = N - tau; j < L; j++) { var a = buf[j], b = buf[j + tau]; acf += a * b; m += a * a + b * b; }
      nsdf[tau] = m > 0 ? 2 * acf / m : 0;
    }
    var peaks = [], t = minLag;
    while (t < maxLag && nsdf[t] > 0) t++;
    var best = -1, bestV = 0;
    for (; t < maxLag; t++) {
      if (nsdf[t] > 0) {
        if (nsdf[t] > bestV) { bestV = nsdf[t]; best = t; }
      } else if (best > 0) { peaks.push([best, bestV]); best = -1; bestV = 0; }
    }
    if (best > 0) peaks.push([best, bestV]);
    if (!peaks.length) return null;
    var hi = Math.max.apply(null, peaks.map(function (p) { return p[1]; }));
    if (hi < 0.55) return null;
    var pick = peaks.filter(function (p) { return p[1] >= hi * 0.88; })[0];
    var x = pick[0], y0 = nsdf[x - 1] || 0, y1 = nsdf[x], y2 = nsdf[x + 1] || 0;
    var d = (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1);
    return { freq: sr / (x + (isFinite(d) ? d : 0)), clarity: y1 };
  }

  /* ───────── 录音 ───────── */
  var Recorder = {
    rec: null, chunks: [], startAt: 0, meta: null,
    mime: function () {
      if (!window.MediaRecorder) return null;
      var c = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
      for (var i = 0; i < c.length; i++) if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c[i])) return c[i];
      return "";
    },
    start: function (meta) {
      var self = this, mime = self.mime();
      if (mime === null) return Promise.reject(new Error("此浏览器不支持录音"));
      return Mic.start().then(function () {
        self.chunks = []; self.meta = meta; self.startAt = Date.now();
        self.rec = mime ? new MediaRecorder(Mic.stream, { mimeType: mime }) : new MediaRecorder(Mic.stream);
        self.rec.ondataavailable = function (e) { if (e.data && e.data.size) self.chunks.push(e.data); };
        self.rec.onstop = function () {
          var type = self.rec && self.rec.mimeType || mime || "audio/webm";
          var blob = new Blob(self.chunks, { type: type });
          var rec = { songId: self.meta.songId, title: self.meta.title, hand: self.meta.hand, date: new Date().toISOString(), dur: Math.round((Date.now() - self.startAt) / 1000), mime: type, blob: blob };
          self.rec = null;
          if (rec.dur < 1 || !blob.size) { toast("录音太短，没有保存"); Recorder.emit(); return; }
          RecDB.add(rec).then(function () { markDone("rec"); toast("录音已保存，可在\"录音\"页回放"); Recorder.emit(); })
            .catch(function () { toast("保存录音失败（可能是无痕浏览模式）"); Recorder.emit(); });
        };
        self.rec.start(1000);
        Recorder.emit();
      });
    },
    stop: function () { if (this.rec && this.rec.state !== "inactive") this.rec.stop(); },
    subs: [], emit: function () { this.subs.forEach(function (f) { f(); }); }
  };

  /* ───────── 键盘图 ───────── */
  var KB_LO = 36, KB_HI = 84; // C2 – C6
  function isBlack(m) { return [1, 3, 6, 8, 10].indexOf(m % 12) >= 0; }
  function keyboardSVG(opts) {
    opts = opts || {};
    var lo = opts.lo || KB_LO, hi = opts.hi || KB_HI, W = opts.w || 26, H = opts.h || 96;
    var whites = [], blacks = [], x = 0, pos = {};
    for (var m = lo; m <= hi; m++) {
      if (!isBlack(m)) { pos[m] = x; whites.push(m); x += W; }
      else { pos[m] = x - W * 0.32; blacks.push(m); }
    }
    var s = '<svg class="kb" viewBox="0 0 ' + x + " " + H + '" width="' + x + '" height="' + H + '" role="img" aria-label="钢琴键盘">';
    whites.forEach(function (m) {
      s += '<rect data-m="' + m + '" x="' + pos[m] + '" y="0" width="' + (W - 1) + '" height="' + H + '" rx="3" class="kw"/>';
      if (m % 12 === 0) s += '<text x="' + (pos[m] + W / 2 - 0.5) + '" y="' + (H - 8) + '" class="kl">' + (m === 60 ? "中央C" : "C" + (m / 12 - 1)) + "</text>";
      if (opts.names && m % 12 !== 0) s += '<text x="' + (pos[m] + W / 2 - 0.5) + '" y="' + (H - 8) + '" class="kl kl2">' + M.midiToName(m).replace(/\d/, "") + "</text>";
    });
    blacks.forEach(function (m) { s += '<rect data-m="' + m + '" x="' + pos[m] + '" y="0" width="' + (W * 0.64) + '" height="' + (H * 0.6) + '" rx="2" class="kb-b"/>'; });
    return s + "</svg>";
  }
  function kbMark(root, midis, cls, scroll) {
    $$("rect." + cls, root).forEach(function (r) { r.classList.remove(cls); });
    (midis || []).forEach(function (m) { var r = $('rect[data-m="' + m + '"]', root); if (r) r.classList.add(cls); });
    if (scroll && midis && midis.length) {
      var r = $('rect[data-m="' + midis[0] + '"]', root), wrap = root.closest(".kbwrap") || root.parentNode;
      if (r && wrap) {
        var x = parseFloat(r.getAttribute("x"));
        var target = x - wrap.clientWidth / 2;
        if (Math.abs(wrap.scrollLeft - target) > wrap.clientWidth * 0.3) wrap.scrollTo({ left: target, behavior: "smooth" });
      }
    }
  }

  /* ───────── 乐谱渲染 ───────── */
  function renderScore(el, abc, opts) {
    opts = opts || {};
    var w = Math.max(280, el.clientWidth || 320);
    var scale = opts.scale || (w < 520 ? 1 : w < 900 ? 1.15 : 1.25);
    var per = opts.perLine || (w < 420 ? 2 : w < 700 ? 3 : 4);
    var o = { add_classes: true, staffwidth: Math.floor(w / scale) - 12, paddingleft: 4, paddingright: 4, paddingtop: 14, paddingbottom: 10 };
    if (!opts.noWrap) o.wrap = { minSpacing: 1.6, maxSpacing: 2.8, preferredMeasuresPerLine: per };
    var tune = window.ABCJS.renderAbc(el, abc, o)[0];
    // 自己做缩放：用 viewBox 放大，避免 abcjs 的 CSS transform 把谱子裁掉
    var svg = el.querySelector("svg");
    if (svg && scale !== 1) {
      var sw = parseFloat(svg.getAttribute("width")), sh = parseFloat(svg.getAttribute("height"));
      svg.setAttribute("viewBox", "0 0 " + sw + " " + sh);
      svg.setAttribute("width", Math.round(sw * scale)); svg.setAttribute("height", Math.round(sh * scale));
      svg.style.transform = ""; el.style.height = "";
    }
    return tune;
  }
  function voiceElements(el, vi) {
    return $$(".abcjs-note, .abcjs-rest", el).filter(function (e) { return e.classList.contains("abcjs-v" + vi); });
  }

  /* ───────── 路由 ───────── */
  function route() {
    var h = (location.hash || "#/today").replace(/^#\/?/, "").split("/");
    return { name: h[0] || "today", arg: h[1] ? decodeURIComponent(h[1]) : null };
  }
  var cleanup = [];
  function onLeave(fn) { cleanup.push(fn); }
  function render() {
    cleanup.forEach(function (f) { try { f(); } catch (e) { } }); cleanup = [];
    Player.stop();
    if (Mic.active) Mic.stop();
    var r = route(), main = $("#main");
    $$(".tabbar a").forEach(function (a) {
      var n = a.getAttribute("data-tab");
      var on = n === r.name || (n === "library" && r.name === "song") || (n === "read" && (r.name === "quiz" || r.name === "lesson"));
      a.classList.toggle("on", on); a.setAttribute("aria-current", on ? "page" : "false");
    });
    var views = { today: viewToday, library: viewLibrary, song: viewSong, read: viewRead, quiz: viewQuiz, lesson: viewLesson, recs: viewRecs, settings: viewSettings };
    (views[r.name] || viewToday)(main, r.arg);
    window.scrollTo(0, 0);
    save();
  }
  window.addEventListener("hashchange", render);

  function stars(score) { return score >= 95 ? 3 : score >= 80 ? 2 : score >= 60 ? 1 : 0; }
  function starHTML(n, max) { var s = ""; for (var i = 0; i < (max || 3); i++) s += '<span class="st' + (i < n ? " on" : "") + '">★</span>'; return s; }
  function bestOf(id) {
    var b = (state.songs[id] || {}).best || {}, out = {};
    Object.keys(b).forEach(function (k) { var h = k.split(":")[0]; out[h] = Math.max(out[h] || 0, b[k]); });
    return out;
  }
  function hasHand(s, h) { return h === "rh" ? !!s.rh.trim() : h === "lh" ? !!s.lh.trim() : !!(s.rh.trim() && s.lh.trim()); }

  /* ───────── 今天 ───────── */
  function warmOfDay() {
    var warms = SONGS.filter(function (s) { return s.cat === "warm"; });
    var n = Math.floor(new Date(dayKey() + "T00:00:00").getTime() / 864e5);
    return warms[n % warms.length];
  }
  function nextStep(id) {
    var s = SONG[id], b = bestOf(id);
    if (hasHand(s, "rh") && (b.rh || 0) < 80) return { hand: "rh", text: "右手跟谱练，目标 80 分" };
    if (hasHand(s, "lh") && (b.lh || 0) < 80) return { hand: "lh", text: "左手跟谱练，目标 80 分" };
    if (hasHand(s, "both") && (b.both || 0) < 80) return { hand: "both", text: "双手合起来，先慢速" };
    return { hand: hasHand(s, "both") ? "both" : hasHand(s, "rh") ? "rh" : "lh", text: "已经很熟了：试试跟拍练，或换一首新曲子" };
  }
  function viewToday(main) {
    var d = today(), cur = SONG[state.settings.current], warm = warmOfDay(), step = nextStep(cur.id);
    var days = [], now = new Date();
    for (var i = 27; i >= 0; i--) { var dd = addDays(now, -i), k = dayKey(dd), x = state.days[k]; days.push({ k: k, on: dayActive(x), today: i === 0, n: x ? ["warm", "quiz", "song", "rec"].filter(function (s) { return x[s]; }).length : 0 }); }
    var weekSec = 0; for (var j = 0; j < 7; j++) { var q = state.days[dayKey(addDays(now, -j))]; if (q) weekSec += q.sec || 0; }
    var learned = SONGS.filter(function (s) { var b = bestOf(s.id); return s.cat !== "warm" && Math.max(b.both || 0, hasHand(s, "both") ? 0 : Math.max(b.rh || 0, b.lh || 0)) >= 80; }).length;
    var stepsDone = ["warm", "quiz", "song"].filter(function (s) { return d[s]; }).length;
    var hello = now.getHours() < 11 ? "早上好" : now.getHours() < 18 ? "下午好" : "晚上好";
    main.innerHTML =
      '<header class="hero"><p class="eyebrow">' + esc(dayKey()) + " · " + hello + '</p><h1>Grace 练琴</h1>' +
      '<p class="sub">' + (stepsDone === 3 ? "今天的练习完成了，真棒。" : "今天练 15 分钟就好：热身、识谱、练曲。") + "</p></header>" +
      '<section class="stats"><div><b>' + streak() + '</b><span>连续天数</span></div><div><b>' + Math.round(weekSec / 60) + '</b><span>本周分钟</span></div><div><b>' + learned + '</b><span>学会曲目</span></div></section>' +
      '<ol class="steps">' +
      stepCard(1, "warm", "手指热身 · 3 分钟", warm.title, warm.tip.split("。")[0] + "。", "#/song/" + warm.id + "?h=" + (hasHand(warm, "rh") ? "rh" : "lh") + "&m=wait", "开始热身") +
      stepCard(2, "quiz", "识谱练习 · 3 分钟", "低音谱认音（左手）", "你说低音谱难，就每天先认 10 个低音谱的音。", "#/quiz/bass-1", "开始识谱") +
      stepCard(3, "song", "练曲 · 10 分钟", cur.title, "下一步：" + step.text + "。", "#/song/" + cur.id + "?h=" + step.hand + "&m=wait", "去练这首") +
      stepCard(4, "rec", "录一遍（可选）", "把今天弹的录下来", "过几周回头听，能听到自己的进步。", "#/song/" + cur.id + "?h=" + step.hand + "&m=demo&rec=1", "去录音") +
      "</ol>" +
      '<section class="card"><h2 class="h2">最近四周</h2><div class="cal">' + days.map(function (x) { return '<i class="c' + x.n + (x.today ? " t" : "") + '" title="' + x.k + '"></i>'; }).join("") + '</div><p class="muted small">每个格子是一天，颜色越深完成的步骤越多。</p></section>' +
      '<p class="foot"><a href="#/settings">设置 · 麦克风测试 · 备份</a></p>';
  }
  function stepCard(n, key, label, title, desc, href, btn) {
    var done = today()[key];
    return '<li class="step' + (done ? " done" : "") + '"><div class="num">' + (done ? "✓" : n) + '</div><div class="body"><p class="eyebrow">' + esc(label) + '</p><h3>' + esc(title) + '</h3><p class="muted">' + esc(desc) + '</p><a class="btn ' + (done ? "ghost" : "primary") + '" href="' + href + '">' + (done ? "再练一次" : btn) + "</a></div></li>";
  }

  /* ───────── 曲库 ───────── */
  function viewLibrary(main) {
    var tab = state.settings.libTab || "hymn";
    function list() {
      var items = SONGS.filter(function (s) { return s.cat === tab; });
      return items.map(function (s) {
        var b = bestOf(s.id), cur = state.settings.current === s.id;
        var badges = ["rh", "lh", "both"].filter(function (h) { return hasHand(s, h); }).map(function (h) {
          return '<span class="hb" title="' + HAND_NAME[h] + '最高分">' + HAND_NAME[h] + " " + starHTML(stars(b[h] || 0)) + "</span>";
        }).join("");
        return '<a class="song" href="#/song/' + s.id + '"><div class="meta"><span class="lv lv' + s.level + '">' + LEVEL_NAME[s.level] + '</span><span class="muted small">' + esc(keyLabel(s.key)) + " · " + s.meter + "</span>" + (cur ? '<span class="tag">在练</span>' : "") + '</div><h3>' + esc(s.title) + '</h3><p class="en">' + esc(s.en) + '</p><div class="hbs">' + badges + "</div></a>";
      }).join("");
    }
    main.innerHTML = '<header class="pagehead"><h1>曲库</h1><p class="muted">都是旋律优美、大家熟悉的曲子，按难度排好了。点开就能听示范、分手练、打分。</p></header>' +
      '<div class="seg" role="tablist">' + ["hymn", "classic", "warm"].map(function (c) { return '<button role="tab" data-c="' + c + '" aria-selected="' + (c === tab) + '">' + CAT_NAME[c] + "</button>"; }).join("") + "</div>" +
      '<div class="songs" id="songs">' + list() + "</div>";
    $$(".seg button", main).forEach(function (b) {
      b.onclick = function () { tab = state.settings.libTab = b.getAttribute("data-c"); save(); $$(".seg button", main).forEach(function (x) { x.setAttribute("aria-selected", x === b); }); $("#songs").innerHTML = list(); };
    });
  }
  function keyLabel(k) { return /m$/.test(k) ? k.replace("m", "") + " 小调" : k + " 大调"; }

  /* ───────── 曲子页：示范 / 跟谱练 / 跟拍练 / 录音 ───────── */
  function viewSong(main, arg) {
    var parts = (arg || "").split("?"), s = SONG[parts[0]];
    if (!s) { location.hash = "#/library"; return; }
    var q = {}; (parts[1] || "").split("&").forEach(function (kv) { var p = kv.split("="); if (p[0]) q[p[0]] = p[1]; });
    var hand = q.h && hasHand(s, q.h) ? q.h : hasHand(s, "rh") ? "rh" : "lh";
    var mode = q.m || "demo";
    var PARTS = ["rh", "rh2", "lh", "lh2"];
    var parsed = {};
    PARTS.forEach(function (k) { parsed[k] = M.parseHand(s[k] || "", s.meter); });
    var els = { rh: [], rh2: [], lh: [], lh2: [] };
    var from = 0; // 从第几拍开始
    var practice = null;

    main.innerHTML =
      '<header class="pagehead songhead"><a class="back" href="#/library">‹ 曲库</a><h1>' + esc(s.title) + '</h1><p class="en">' + esc(s.en) + '</p>' +
      '<p class="chips"><span class="lv lv' + s.level + '">' + LEVEL_NAME[s.level] + "</span><span>" + CAT_NAME[s.cat] + "</span><span>" + esc(keyLabel(s.key)) + "</span><span>" + s.meter + "</span><span>♩=" + s.tempo + "</span></p></header>" +
      '<p class="tip">' + esc(s.tip) + (s.source ? '<span class="src">' + esc(s.source) + "</span>" : "") + "</p>" +
      '<div class="ctl">' +
      '<div class="seg small" id="hands">' + ["rh", "lh", "both"].map(function (h) { return '<button data-h="' + h + '" aria-selected="' + (h === hand) + '"' + (hasHand(s, h) ? "" : " disabled") + ">" + HAND_NAME[h] + "</button>"; }).join("") + "</div>" +
      '<div class="seg small" id="modes">' + [["demo", "听示范"], ["wait", "跟谱练"], ["tempo", "跟拍练"]].map(function (m) { return '<button data-m="' + m[0] + '" aria-selected="' + (m[0] === mode) + '">' + m[1] + "</button>"; }).join("") + "</div>" +
      "</div>" +
      '<div class="bar" id="bar"></div>' +
      '<div class="live" id="live" hidden></div>' +
      '<div class="score" id="score" aria-label="乐谱"></div>' +
      '<div class="kbwrap" id="kbwrap">' + keyboardSVG() + "</div>" +
      '<p class="legend"><span><i class="lg-t"></i>橙色 = 现在该弹的键</span><span><i class="lg-ok"></i>绿色 = 弹对了</span><span><i class="lg-bad"></i>红色 = 弹错的键</span></p>' +
      '<div id="result"></div>' +
      '<div class="opts"><label>谱上标注 <select id="labels"><option value="none">不标</option><option value="name">音名 C D E</option><option value="jianpu">简谱 1 2 3</option><option value="solfege">唱名 do re mi</option></select></label>' +
      '<button class="btn ghost small" id="setcur">' + (state.settings.current === s.id ? "✓ 正在练这首" : "设为\"在练\"") + "</button></div>" +
      '<section class="card"><h2 class="h2">我的录音</h2><div id="myrecs" class="recs"></div></section>';
    $("#labels").value = state.settings.labels;
    var kb = $("#kbwrap svg");
    function flashKeys(midis, cls) { kbMark(kb, midis, cls); clearTimeout(flashKeys["t" + cls]); flashKeys["t" + cls] = setTimeout(function () { kbMark(kb, [], cls); }, 700); }

    function drawScore() {
      var b = M.buildAbc(s, hand, { labels: state.settings.labels });
      renderScore($("#score"), b.abc);
      els = { rh: [], rh2: [], lh: [], lh2: [] };
      b.voices.forEach(function (v, i) {
        var found = voiceElements($("#score"), i), evs = parsed[v].events;
        var vis = []; evs.forEach(function (ev, j) { if (!ev.invisible) vis.push(j); });
        if (found.length !== vis.length) { console.warn("音符对应失败", s.id, v, found.length, vis.length); return; }
        var arr = new Array(evs.length); vis.forEach(function (j, n) { arr[j] = found[n]; }); els[v] = arr;
      });
      kbMark(kb, [], "tgt"); markFrom();
    }
    function partsOf(h) { return (h === "both" ? PARTS : [h, h + "2"]).filter(function (k) { return parsed[k].events.length; }); }
    function shownHands() { return partsOf(hand); }
    function clearCls(c) { $$("#score ." + c).forEach(function (e) { e.classList.remove(c); }); }
    function markFrom() {
      clearCls("from");
      if (from > 0) shownHands().forEach(function (h) { var i = eventAt(h, from); if (i >= 0 && els[h][i]) els[h][i].classList.add("from"); });
    }
    function eventAt(h, beat) {
      var ev = parsed[h].events;
      for (var i = 0; i < ev.length; i++) if (ev[i].start <= beat + 1e-6 && beat < ev[i].start + ev[i].dur - 1e-6) return i;
      return -1;
    }
    var lastLine = null;
    function cursor(beat) {
      shownHands().forEach(function (h) {
        var i = eventAt(h, beat), prev = cursor["p" + h];
        if (i === prev) return;
        if (prev !== undefined && els[h][prev]) els[h][prev].classList.remove("cur");
        cursor["p" + h] = i;
        if (i >= 0 && els[h][i]) { els[h][i].classList.add("cur"); if (h === shownHands()[0]) follow(els[h][i]); }
      });
      var mids = [];
      shownHands().forEach(function (h) { var i = cursor["p" + h]; if (i >= 0) parsed[h].events[i].pitches.forEach(function (p) { mids.push(p.midi); }); });
      kbMark(kb, mids, "tgt", true);
    }
    function resetCursor() { clearCls("cur"); cursor.prh = cursor.plh = undefined; kbMark(kb, [], "tgt"); }
    function follow(el) {
      var line = (el.getAttribute("class").match(/abcjs-l(\d+)/) || [])[1];
      if (line === lastLine) return; lastLine = line;
      var r = el.getBoundingClientRect(), vh = window.innerHeight;
      if (r.top < 70 || r.bottom > vh - 150) window.scrollBy({ top: r.top - vh * 0.3, behavior: "smooth" });
    }

    // 点谱上的音符 → 从那里开始
    $("#score").addEventListener("click", function (e) {
      var n = e.target.closest && e.target.closest(".abcjs-note, .abcjs-rest");
      if (!n || Player.playing || (practice && practice.running)) return;
      var hit = null;
      PARTS.forEach(function (h) { var i = els[h].indexOf(n); if (i >= 0) hit = parsed[h].events[i].start; });
      if (hit === null) return;
      from = from === hit ? 0 : hit; markFrom();
      toast(from ? "从这里开始（再点一次取消）" : "已改回从头开始");
    });

    function setBar(html) { $("#bar").innerHTML = html; }
    function bpm() { return Math.round(s.tempo * state.settings.speed); }
    function speedCtl() {
      return '<label class="speed">速度 <input type="range" id="speed" min="0.4" max="1.2" step="0.05" value="' + state.settings.speed + '"><output id="spv">' + Math.round(state.settings.speed * 100) + "%</output></label>";
    }
    function bindSpeed() {
      var r = $("#speed"); if (!r) return;
      r.oninput = function () { state.settings.speed = +r.value; $("#spv").textContent = Math.round(r.value * 100) + "%"; };
      r.onchange = save;
    }
    function recBtn() { return '<button class="btn rec' + (Recorder.rec ? " on" : "") + '" id="recbtn">' + (Recorder.rec ? "■ 停止录音" : "● 录音") + "</button>"; }
    function bindRec() {
      var b = $("#recbtn"); if (!b) return;
      b.onclick = function () {
        if (Recorder.rec) { Recorder.stop(); return; }
        Recorder.start({ songId: s.id, title: s.title, hand: hand }).catch(function (e) { micHelp(e); });
      };
    }
    var unsubRec = function () { Recorder.subs = Recorder.subs.filter(function (f) { return f !== onRecChange; }); };
    function onRecChange() {
      var b = $("#recbtn"); if (b) { b.outerHTML = recBtn(); bindRec(); }
      if (!Recorder.rec && !(practice && practice.running) && Mic.active) Mic.stop();
      loadRecs();
    }
    Recorder.subs.push(onRecChange);
    onLeave(function () { unsubRec(); if (Recorder.rec) Recorder.stop(); });

    function setupMode() {
      Player.stop(); if (practice) practice.stop(); practice = null; resetCursor(); clearCls("ok"); clearCls("bad"); clearCls("miss"); clearCls("target");
      $("#result").innerHTML = ""; $("#live").hidden = true;
      if (mode === "demo") {
        setBar('<button class="btn primary" id="play">▶ 播放示范</button>' + speedCtl() + '<label class="chk"><input type="checkbox" id="metro"' + (state.settings.metro ? " checked" : "") + "> 节拍器</label>" + recBtn() +
          '<p class="hint">点谱上任意一个音符，可以从那里开始。弹左手或右手时，选上面的\"右手/左手\"就只听那一只手。</p>');
        $("#metro").onchange = function () { state.settings.metro = this.checked; save(); };
        $("#play").onclick = function () {
          if (Player.playing) { Player.stop(); resetCursor(); this.textContent = "▶ 播放示范"; return; }
          var btn = this; btn.textContent = "■ 停止";
          Player.play({ song: s, parsed: parsed, hands: shownHands(), bpm: bpm(), from: from, metro: state.settings.metro, countIn: false, onBeat: cursor, onEnd: function () { resetCursor(); btn.textContent = "▶ 播放示范"; } });
        };
      } else if (mode === "wait") {
        setBar('<button class="btn primary" id="go">🎤 开始跟谱练</button><button class="btn ghost" id="skip" disabled>跳过这个音</button>' + recBtn() +
          '<p class="hint">谱上亮起的音就是该弹的音，弹对了自动跳到下一个，不用管快慢。手机或 iPad 放在琴上，第一次会请求麦克风权限。</p>');
        $("#go").onclick = function () { if (practice && practice.running) { practice.stop(); } else startWait(); };
        $("#skip").onclick = function () { if (practice && practice.skip) practice.skip(); };
      } else {
        var other = hand === "both" ? "" : '<label class="chk"><input type="checkbox" id="acc"> 电脑弹另一只手（建议戴耳机）</label>';
        setBar('<button class="btn primary" id="go">🎤 开始跟拍练</button>' + speedCtl() + '<label class="chk"><input type="checkbox" id="metro"' + (state.settings.metro ? " checked" : "") + "> 节拍器</label>" + other + recBtn() +
          '<p class="hint">先响一小节节拍器，然后光标按速度往前走，在亮起时弹对就得分。先用跟谱练弹熟，再来这里练节奏。</p>');
        $("#metro").onchange = function () { state.settings.metro = this.checked; save(); };
        $("#go").onclick = function () { if (practice && practice.running) practice.stop(); else startTempo(); };
      }
      bindSpeed(); bindRec();
    }

    function targetsFor() {
      var hs = shownHands(), slots = {};
      hs.forEach(function (h) {
        parsed[h].events.forEach(function (ev, i) {
          if (ev.rest || ev.tiedFrom || ev.start + 1e-6 < from) return;
          var k = ev.start.toFixed(3);
          var t = slots[k] = slots[k] || { start: ev.start, dur: ev.dur, midis: [], pcs: {}, els: [], bar: ev.bar };
          ev.pitches.forEach(function (p) { t.midis.push(p.midi); t.pcs[p.midi % 12] = true; });
          if (els[h][i]) t.els.push(els[h][i]);
          t.dur = Math.min(t.dur, ev.dur);
        });
      });
      return Object.keys(slots).map(function (k) { return slots[k]; }).sort(function (a, b) { return a.start - b.start; });
    }
    function live(html) { var l = $("#live"); l.hidden = false; l.innerHTML = html; }
    function nm(m) { return M.midiToName(m).replace("#", "♯"); }

    function startWait() {
      var targets = targetsFor(); if (!targets.length) return;
      Mic.start().then(function () {
        var idx = 0, mistakes = 0, wrongAt = {}, pending = null, t0 = Date.now(), running = true, lastHit = 0;
        clearCls("ok"); clearCls("bad"); $("#result").innerHTML = "";
        $("#go").textContent = "■ 停止"; $("#skip").disabled = false;
        function show() {
          clearCls("target");
          var t = targets[idx]; if (!t) return;
          t.els.forEach(function (e) { e.classList.add("target"); });
          if (t.els[0]) follow(t.els[0]);
          kbMark(kb, t.midis, "tgt", true);
          var prev = targets[idx - 1];
          Mic.setExpect(t.midis, !!prev && prev.midis.join() === t.midis.join());
          live('<span class="muted">第 ' + (idx + 1) + " / " + targets.length + ' 个音　该弹：</span><b>' + t.midis.map(nm).join(" + ") + '</b><span class="muted">　错 ' + mistakes + "</span>");
        }
        function advance(ok) {
          var t = targets[idx];
          if (ok) flashKeys(t.midis, "okk");
          t.els.forEach(function (e) { e.classList.remove("target"); e.classList.add(ok ? "ok" : "bad"); });
          idx++;
          if (idx >= targets.length) finish(); else show();
        }
        var off = Mic.on(function (type, d) {
          if (!running) return;
          var t = targets[idx]; if (!t) return;
          if (type === "note" && now() - lastHit < 0.4) return; // 刚判对的那一下，余音不再判
          if (type === "hit") { if (t.pcs[d.midi % 12]) { if (pending) { clearTimeout(pending); pending = null; } lastHit = now(); advance(true); } return; }
          if (type !== "note") return;
          if (t.pcs[d.midi % 12]) { if (pending) { clearTimeout(pending); pending = null; } lastHit = now(); advance(true); return; }
          // 只有听得很清楚、而且离该弹的音不远（9 个半音以内）时才算弹错；远处的杂音、琴弦共鸣不算
          var near = t.midis.some(function (x) { return Math.abs(x - d.midi) <= 9; });
          if (pending || !near || d.clarity < 0.8) return;
          var myIdx = idx, m = d.midi, myOnset = d.onset;
          pending = setTimeout(function () {
            pending = null;
            if (!running || idx !== myIdx || now() - lastHit < 0.4) return;
            var k = idx + ":" + m; if (wrongAt[k]) return; wrongAt[k] = true;
            mistakes++;
            t.els.forEach(function (e) { e.classList.add("bad"); setTimeout(function () { e.classList.remove("bad"); }, 600); });
            flashKeys([m], "wrong");
            live('<span class="bad-t">听到 ' + nm(m) + "，应该是 " + t.midis.map(nm).join(" + ") + '</span><span class="muted">　错 ' + mistakes + "</span>");
          }, 380);
        });
        function stop() {
          running = false; off(); if (pending) clearTimeout(pending); Mic.setExpect(null);
          clearCls("target"); kbMark(kb, [], "tgt");
          if (!Recorder.rec) Mic.stop();
          var g = $("#go"); if (g) { g.textContent = "🎤 开始跟谱练"; $("#skip").disabled = true; }
          practice.running = false;
        }
        function finish() {
          stop();
          var score = Math.round(100 * targets.length / (targets.length + mistakes));
          var badBars = {}; Object.keys(wrongAt).forEach(function (k) { var b = targets[+k.split(":")[0]].bar + 1; badBars[b] = (badBars[b] || 0) + 1; });
          showResult(score, "wait", "共 " + targets.length + " 个音，弹错 " + mistakes + " 次，用时 " + fmtDur((Date.now() - t0) / 1000) + "。", badBars);
        }
        practice = { running: true, stop: stop, skip: function () { if (running && targets[idx]) { mistakes++; advance(false); } } };
        show();
      }).catch(function (e) { micHelp(e); });
    }

    function startTempo() {
      var targets = targetsFor(); if (!targets.length) return;
      Audio.get(); // 在点击的同一时刻唤醒声音
      Mic.start().then(function () {
        // 打开麦克风后 iPad 会把声音"打断"，再唤醒一次，等它恢复后再开始
        var c = Audio.get();
        return c.resume ? Promise.race([c.resume().catch(function () { }), new Promise(function (r) { setTimeout(r, 400); })]) : null;
      }).then(function () {
        var running = true, hits = 0, offsets = [];
        targets.forEach(function (t) { t.hit = false; t.missed = false; });
        clearCls("ok"); clearCls("miss"); $("#result").innerHTML = "";
        $("#go").textContent = "■ 停止";
        var spb = 60 / bpm(), tolBeat = Math.max(0.5, 0.3 / spb);
        var acc = $("#acc") && $("#acc").checked;
        var off = Mic.on(function (type, d) {
          if (!running) return;
          if ((type !== "note" && type !== "hit") || !Player.playing) return;
          var b = Player.beatAt(d.time - 0.04), best = null;
          targets.forEach(function (t) {
            if (t.hit || !t.pcs[d.midi % 12]) return;
            var dt = b - t.start;
            if (dt > -tolBeat && dt < Math.max(tolBeat, t.dur * 0.6) && (!best || Math.abs(dt) < Math.abs(best.dt))) best = { t: t, dt: dt };
          });
          if (best) { best.t.hit = true; hits++; offsets.push(best.dt * spb); best.t.els.forEach(function (e) { e.classList.add("ok"); }); flashKeys(best.t.midis, "okk"); }
        });
        function stop() {
          running = false; off(); Player.stop(); Mic.setExpect(null); resetCursor();
          if (!Recorder.rec) Mic.stop();
          var g = $("#go"); if (g) g.textContent = "🎤 开始跟拍练";
          practice.running = false;
        }
        practice = { running: true, stop: stop };
        live('<span class="muted">准备……听一小节节拍器，然后开始</span>');
        Player.play({
          song: s, parsed: parsed, hands: acc ? partsOf(hand === "rh" ? "lh" : "rh") : [], bpm: bpm(), from: from, metro: state.settings.metro, countIn: true,
          onBeat: function (beat) {
            if (beat < from) { live('<span class="muted">预备：' + Math.ceil(from - beat) + "</span>"); return; }
            cursor(beat);
            Mic.setExpect(targets.filter(function (t) { return !t.hit && Math.abs(t.start - beat) < tolBeat * 1.5; }).reduce(function (a, t) { return a.concat(t.midis); }, []));
            targets.forEach(function (t) {
              if (!t.hit && !t.missed && beat > t.start + Math.max(tolBeat, t.dur * 0.6)) { t.missed = true; t.els.forEach(function (e) { e.classList.add("miss"); }); }
            });
            live('<span class="muted">弹中 </span><b>' + hits + '</b><span class="muted"> / ' + targets.length + "</span>");
          },
          onEnd: function () {
            stop();
            var score = Math.round(100 * hits / targets.length);
            var avg = offsets.length ? offsets.reduce(function (a, b) { return a + b; }, 0) / offsets.length : 0;
            var feel = !offsets.length ? "" : avg > 0.08 ? "整体稍微有点慢（拖拍）。" : avg < -0.08 ? "整体稍微有点抢拍。" : "节奏很稳。";
            var badBars = {}; targets.forEach(function (t) { if (!t.hit) badBars[t.bar + 1] = (badBars[t.bar + 1] || 0) + 1; });
            showResult(score, "tempo", "速度 ♩=" + bpm() + "，" + targets.length + " 个音弹中 " + hits + " 个。" + feel, badBars);
          }
        });
      }).catch(function (e) { micHelp(e); });
    }

    function showResult(score, kind, detail, badBars) {
      var key = hand + ":" + kind, st = songState(s.id), prev = st.best[key] || 0;
      if (score > prev) st.best[key] = score;
      st.last = dayKey();
      if (s.cat === "warm") markDone("warm");
      if (s.id === state.settings.current) markDone("song");
      save();
      var worst = Object.keys(badBars).sort(function (a, b) { return badBars[b] - badBars[a]; }).slice(0, 3);
      var n = stars(score);
      $("#result").innerHTML = '<section class="result"><div class="big">' + score + '<small>分</small></div><div class="stars">' + starHTML(n) + "</div>" +
        "<p>" + esc(HAND_NAME[hand] + " · " + MODE_NAME[kind]) + "　" + (score > prev ? (prev ? "新纪录！之前最好 " + prev + " 分" : "第一次的成绩") : "最好成绩 " + prev + " 分") + "</p>" +
        '<p class="muted">' + esc(detail) + "</p>" +
        (worst.length ? '<p class="muted">要多练的地方：第 ' + worst.join("、") + " 小节（谱上标红的音）。</p>" : "") +
        '<p class="praise">' + (n === 3 ? "太好了！可以换下一只手，或者把速度调快一点。" : n === 2 ? "很不错，再来一两遍就更稳了。" : n === 1 ? "已经有样子了。慢一点，一个音一个音弹准。" : "没关系，先听几遍示范，再用跟谱练慢慢弹。") + "</p>" +
        '<button class="btn primary" id="again">再来一次</button></section>';
      $("#again").onclick = function () { $("#result").innerHTML = ""; clearCls("ok"); clearCls("bad"); clearCls("miss"); (kind === "wait" ? startWait : startTempo)(); };
      $("#result").scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function loadRecs() {
      var box = $("#myrecs"); if (!box) return;
      RecDB.all().then(function (all) {
        var mine = all.filter(function (r) { return r.songId === s.id; });
        box.innerHTML = mine.length ? mine.map(recRow).join("") : '<p class="muted small">还没有录音。点\"● 录音\"，弹完再点停止。</p>';
        bindRecRows(box, loadRecs);
      }).catch(function () { box.innerHTML = '<p class="muted small">这个浏览器不能保存录音（可能是无痕模式）。</p>'; });
    }

    $$("#hands button").forEach(function (b) {
      b.onclick = function () { if (b.disabled) return; hand = b.getAttribute("data-h"); $$("#hands button").forEach(function (x) { x.setAttribute("aria-selected", x === b); }); drawScore(); setupMode(); };
    });
    $$("#modes button").forEach(function (b) {
      b.onclick = function () { mode = b.getAttribute("data-m"); $$("#modes button").forEach(function (x) { x.setAttribute("aria-selected", x === b); }); setupMode(); };
    });
    $("#labels").onchange = function () { state.settings.labels = this.value; save(); drawScore(); };
    $("#setcur").onclick = function () { state.settings.current = s.id; save(); this.textContent = "✓ 正在练这首"; toast("已设为\"在练\"，会出现在今天的练习里"); };
    var rz; var onRz = function () { clearTimeout(rz); rz = setTimeout(function () { if (!Player.playing && !(practice && practice.running)) drawScore(); }, 250); };
    window.addEventListener("resize", onRz); onLeave(function () { window.removeEventListener("resize", onRz); if (practice) practice.stop(); });

    drawScore(); setupMode(); loadRecs();
    if (q.rec === "1") toast("准备好了就点\"● 录音\"", 3000);
  }

  function fmtDur(sec) { sec = Math.round(sec); return sec < 60 ? sec + " 秒" : Math.floor(sec / 60) + " 分 " + (sec % 60) + " 秒"; }
  var UA = navigator.userAgent || "";
  var IN_APP = /MicroMessenger|WeChat|QQ\/|MQQBrowser|Weibo|DingTalk|Lark|Feishu|FBAN|FBAV|Instagram|Line\//i.test(UA);
  var STANDALONE = (window.navigator.standalone === true) || (window.matchMedia && matchMedia("(display-mode: standalone)").matches);
  var IOS = /iPad|iPhone|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  function micError(e) {
    var n = e && e.name;
    if (IN_APP) return "现在是在微信（或其他 App）里打开的，这里不能用麦克风。";
    if (n === "NotAllowedError" || n === "SecurityError") return "麦克风打不开。";
    if (n === "NotFoundError") return "没有找到麦克风。";
    return (e && e.message) || "麦克风打不开";
  }
  /* 麦克风打不开时弹出的帮助：按打开方式给出具体步骤，并可一键重试 */
  function micHelp(e, retry) {
    var steps;
    if (IN_APP) {
      steps = ["点右上角的「···」", "选「在 Safari 中打开」（iPad 上可能叫「在默认浏览器中打开」）", "在 Safari 里点「分享」→「添加到主屏幕」，以后从主屏幕图标打开"];
    } else if (IOS) {
      steps = [
        "一定要在 Safari 里打开：用「快捷指令」、微信或其他 App 打开的页面不能用麦克风。请打开 Safari，在地址栏粘贴网址，再点「分享」→「添加到主屏幕」，以后从主屏幕图标打开",
        "在 Safari 地址栏左边点「aA」（或「大小」图标）→「网站设置」→「麦克风」→ 选「允许」或「询问」",
        "如果上面找不到：打开 iPad/iPhone 的「设置」→「Safari 浏览器」→ 往下找「麦克风」→ 选「询问」或「允许」",
        "再检查「设置」→「屏幕使用时间」→「内容和隐私访问限制」→「麦克风」是否被关掉",
        STANDALONE ? "改完后把主屏幕上的「Grace 练琴」完全关掉（从底部上滑划掉），再重新打开" : "改完后回到这里，点下面的「再试一次」"
      ];
    } else {
      steps = ["点地址栏左边的锁形图标 → 麦克风 → 允许", "然后点下面的「再试一次」"];
    }
    var box = $("#michelp");
    if (!box) { box = document.createElement("div"); box.id = "michelp"; document.body.appendChild(box); }
    box.innerHTML = '<div class="mh-card" role="dialog" aria-modal="true" aria-labelledby="mh-t"><h2 id="mh-t">' + esc(micError(e)) + '</h2><p class="muted">跟谱练、跟拍练、录音和用钢琴答题都需要麦克风。按下面的步骤打开：</p><ol>' +
      steps.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + '</ol><p class="muted small">声音只在这台设备上处理，不会上传。</p><p class="muted small" id="mh-diag">诊断：' + esc(((e && e.name) || "?") + " · " + ((e && e.message) || "") + (e && e.ms !== undefined ? " · " + e.ms + "ms" : "") + " · " + (STANDALONE ? "主屏幕App" : IN_APP ? "App内浏览器" : "浏览器") + " · " + ((navigator.audioSession && navigator.audioSession.type) || "-") + " · " + VERSION) + '</p><div class="mh-btns">' +
      (IN_APP ? "" : '<button class="btn primary" id="mh-retry">再试一次</button>') + '<button class="btn ghost" id="mh-close">关闭</button></div></div>';
    box.hidden = false;
    try { navigator.permissions.query({ name: "microphone" }).then(function (st) { var d = $("#mh-diag"); if (d) d.textContent += " · 权限:" + st.state; }); } catch (x) { }
    $("#mh-close").onclick = function () { box.hidden = true; };
    var r = $("#mh-retry");
    if (r) r.onclick = function () { box.hidden = true; if (retry) retry(); else Mic.start().then(function () { Mic.stop(); toast("麦克风可以用了，再点一次开始"); }).catch(function (e2) { micHelp(e2); }); };
  }
  if (IN_APP) {
    setTimeout(function () {
      var b = document.createElement("div"); b.className = "inapp";
      b.innerHTML = "你现在是在微信里打开的，<b>麦克风和录音用不了</b>。请点右上角「···」→「在 Safari 中打开」。";
      document.body.insertBefore(b, document.body.firstChild);
    }, 0);
  }

  /* ───────── 录音列表 ───────── */
  function recRow(r) {
    var d = new Date(r.date);
    return '<div class="rec" data-id="' + r.id + '"><div class="rt"><b>' + esc(r.title) + '</b><span class="muted small">' + dayKey(d) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + " · " + (HAND_NAME[r.hand] || "") + " · " + fmtDur(r.dur) + '</span></div><div class="ra"><button class="btn small" data-act="play">▶ 播放</button><button class="btn ghost small" data-act="dl">下载</button><button class="btn ghost small danger" data-act="del">删除</button></div><audio hidden></audio></div>';
  }
  var recCache = {};
  function bindRecRows(box, reload) {
    RecDB.all().then(function (all) { all.forEach(function (r) { recCache[r.id] = r; }); });
    $$(".rec", box).forEach(function (row) {
      var id = +row.getAttribute("data-id"), audio = $("audio", row);
      $$("button", row).forEach(function (b) {
        b.onclick = function () {
          var r = recCache[id]; if (!r) return;
          var act = b.getAttribute("data-act");
          if (act === "play") {
            if (!audio.src) audio.src = URL.createObjectURL(r.blob);
            if (audio.paused) { $$("audio").forEach(function (a) { if (a !== audio) a.pause(); }); audio.play(); b.textContent = "❚❚ 暂停"; audio.onended = function () { b.textContent = "▶ 播放"; }; }
            else { audio.pause(); b.textContent = "▶ 播放"; }
          } else if (act === "dl") {
            var a = document.createElement("a"), ext = /mp4/.test(r.mime) ? "m4a" : /ogg/.test(r.mime) ? "ogg" : "webm";
            a.href = URL.createObjectURL(r.blob); a.download = "Grace练琴-" + r.title + "-" + dayKey(new Date(r.date)) + "." + ext; document.body.appendChild(a); a.click(); a.remove();
          } else if (act === "del") {
            if (confirm("删除这段录音？删除后不能恢复。")) RecDB.del(id).then(reload);
          }
        };
      });
    });
  }
  function viewRecs(main) {
    main.innerHTML = '<header class="pagehead"><h1>录音</h1><p class="muted">录音只保存在这台设备上。想留着或发给别人，点\"下载\"。</p></header><div id="allrecs" class="recs"><p class="muted">读取中……</p></div>';
    function load() {
      RecDB.all().then(function (all) {
        $("#allrecs").innerHTML = all.length ? all.map(recRow).join("") : '<p class="muted">还没有录音。在任何一首曲子的页面点\"● 录音\"就可以录。</p>';
        bindRecRows($("#allrecs"), load);
      }).catch(function () { $("#allrecs").innerHTML = '<p class="muted">这个浏览器不能保存录音（可能是无痕模式）。</p>'; });
    }
    load();
  }

  /* ───────── 识谱：课程 + 练习 ───────── */
  var QUIZ = {
    "bass-1": { clef: "bass", name: "低音谱 · 第 1 级", desc: "C3–G3，左手 C 位置的五个音", lo: 48, hi: 55 },
    "bass-2": { clef: "bass", name: "低音谱 · 第 2 级", desc: "G2–C4，整个低音谱表", lo: 43, hi: 60 },
    "bass-3": { clef: "bass", name: "低音谱 · 第 3 级", desc: "C2–E4，包括加线", lo: 36, hi: 64 },
    "treble-1": { clef: "treble", name: "高音谱 · 第 1 级", desc: "C4–G4，右手 C 位置", lo: 60, hi: 67 },
    "treble-2": { clef: "treble", name: "高音谱 · 第 2 级", desc: "C4–G5，整个高音谱表", lo: 60, hi: 79 },
    "treble-3": { clef: "treble", name: "高音谱 · 第 3 级", desc: "A3–C6，包括加线", lo: 57, hi: 84 },
    "grand-1": { clef: "grand", name: "大谱表 · 混合", desc: "两个谱表随机出题", lo: 43, hi: 79 }
  };
  function viewRead(main) {
    var qs = state.quiz.best || {};
    main.innerHTML = '<header class="pagehead"><h1>识谱</h1><p class="muted">先看小课，再做练习。每次 10 题，可以点按钮作答，也可以直接在钢琴上弹出来。</p></header>' +
      '<section class="card"><h2 class="h2">识谱练习</h2><div class="quizlist">' + Object.keys(QUIZ).map(function (k) {
        var z = QUIZ[k];
        return '<a class="qz' + (k === "bass-1" ? " rec" : "") + '" href="#/quiz/' + k + '"><b>' + esc(z.name) + (k === "bass-1" ? ' <span class="tag">推荐</span>' : "") + '</b><span class="muted small">' + esc(z.desc) + "</span>" + (qs[k] ? '<span class="small">最好 ' + qs[k] + " 分</span>" : "") + "</a>";
      }).join("") + "</div>" + weakNotes() + "</section>" +
      '<section class="card"><h2 class="h2">识谱小课</h2><ol class="lessons">' + DATA.lessons.map(function (l) { return '<li><a href="#/lesson/' + l.id + '">' + esc(l.title) + "</a></li>"; }).join("") + "</ol></section>";
  }
  function weakNotes() {
    var st = state.quiz.stats, arr = Object.keys(st).filter(function (k) { return st[k].bad > 0; }).sort(function (a, b) { return (st[b].bad / (st[b].ok + st[b].bad)) - (st[a].bad / (st[a].ok + st[a].bad)); }).slice(0, 5);
    if (!arr.length) return "";
    return '<p class="muted small">最容易认错的音：' + arr.map(function (k) { var p = k.split("|"); return (p[0] === "bass" ? "低音谱 " : "高音谱 ") + M.midiToName(+p[1]); }).join("、") + "（练习时会多出这些音）</p>";
  }
  function viewLesson(main, id) {
    var idx = DATA.lessons.findIndex(function (l) { return l.id === id; }), l = DATA.lessons[idx];
    if (!l) { location.hash = "#/read"; return; }
    var prev = DATA.lessons[idx - 1], next = DATA.lessons[idx + 1];
    main.innerHTML = '<header class="pagehead"><a class="back" href="#/read">‹ 识谱</a><h1>' + esc(l.title) + "</h1></header>" +
      '<section class="card lesson">' + l.body.map(function (p) { return "<p>" + p + "</p>"; }).join("") +
      (l.abc ? '<div class="score small" id="lscore"></div><button class="btn ghost small" id="lplay">▶ 听一听</button>' : "") +
      (l.keyboard ? '<div class="kbwrap">' + keyboardSVG({ lo: 48, hi: 72, w: 30, h: 110, names: true }) + "</div>" : "") + "</section>" +
      '<nav class="pager">' + (prev ? '<a class="btn ghost" href="#/lesson/' + prev.id + '">‹ 上一课</a>' : "<span></span>") + (next ? '<a class="btn primary" href="#/lesson/' + next.id + '">下一课 ›</a>' : '<a class="btn primary" href="#/quiz/bass-1">去做识谱练习 ›</a>') + "</nav>";
    if (l.keyboard) { kbMark($(".lesson .kb"), [60], "tgt"); setTimeout(function () { var w = $(".lesson .kbwrap"); w.scrollLeft = (w.scrollWidth - w.clientWidth) / 2; }, 0); }
    if (l.abc) {
      var abc = "X:1\n" + l.abc; renderScore($("#lscore"), abc, { noWrap: true, scale: 1.1 });
      $("#lplay").onclick = function () {
        var ctx = Audio.get(), t = ctx.currentTime + 0.1;
        // 依次播放谱例里的音（按出现顺序，每个半秒）
        var notes = lessonPitches(l.abc);
        notes.forEach(function (m, i) { Audio.note(m, t + i * 0.5, 0.45, 0.25); });
      };
    }
  }
  function lessonPitches(abc) {
    var body = abc.split("\n").filter(function (x) { return !/^[A-Z]:|^%%/.test(x); }).join(" ").replace(/\[V:[^\]]+\]/g, "").replace(/"[^"]*"/g, "");
    var bass = /clef=bass/.test(abc), out = [], re = /(\^|_|=)?([A-Ga-g])([,']*)/g, m;
    while ((m = re.exec(body))) {
      var L = m[2].toUpperCase(), oct = m[2] === L ? 4 : 5;
      oct -= (m[3].match(/,/g) || []).length; oct += (m[3].match(/'/g) || []).length;
      var p = M.parsePitch(L + (m[1] === "^" ? "#" : m[1] === "_" ? "b" : "") + oct); if (p) out.push(p.midi);
    }
    return out;
  }

  function viewQuiz(main, id) {
    var z = QUIZ[id]; if (!z) { location.hash = "#/read"; return; }
    var N = 10, n = 0, ok = 0, t0 = Date.now(), cur = null, answered = false, useMic = state.settings.quizMic || false, offMic = null, timer = 0;
    var pool = [];
    for (var m = z.lo; m <= z.hi; m++) if (!isBlack(m)) pool.push(m);
    main.innerHTML = '<header class="pagehead"><a class="back" href="#/read">‹ 识谱</a><h1>' + esc(z.name) + '</h1><p class="muted">' + esc(z.desc) + "</p></header>" +
      '<div class="qbar"><span id="qprog">1 / ' + N + '</span><label class="chk"><input type="checkbox" id="qmic"' + (useMic ? " checked" : "") + '> 用钢琴弹出答案（麦克风）</label></div>' +
      '<div class="score quiz" id="qscore"></div>' +
      '<p class="qfb" id="qfb" aria-live="polite">这个音是什么？</p>' +
      '<div class="answers" id="answers">' + M.LETTERS.map(function (L) { return '<button data-l="' + L + '"><b>' + L + "</b><span>" + M.SOLFEGE[L] + "</span></button>"; }).join("") + "</div>" +
      '<div class="kbwrap" id="qkb">' + keyboardSVG() + "</div>" +
      '<p class="legend"><span><i class="lg-t"></i>橙色 = 正确答案的键</span><span><i class="lg-bad"></i>红色 = 你弹的键（弹错时）</span></p>' +
      '<div id="qres"></div>';
    var kb = $("#qkb svg");
    function clefOf(m) { return z.clef === "grand" ? (m >= 60 ? "treble" : "bass") : z.clef; }
    function pick() {
      // 认错过的音出现得更多
      var w = pool.map(function (m) { var st = state.quiz.stats[clefOf(m) + "|" + m]; return 1 + (st ? Math.min(4, st.bad * 1.5 - st.ok * 0.3) : 0.5); });
      var sum = w.reduce(function (a, b) { return a + Math.max(0.3, b); }, 0), r = Math.random() * sum;
      for (var i = 0; i < pool.length; i++) { r -= Math.max(0.3, w[i]); if (r <= 0) return pool[i] === cur && pool.length > 1 ? pool[(i + 1) % pool.length] : pool[i]; }
      return pool[0];
    }
    function abcFor(m) {
      var clef = clefOf(m), p = M.parsePitch(M.midiToName(m)), s = p.oct >= 5 ? p.letter.toLowerCase() : p.letter;
      if (p.oct >= 6) s += new Array(p.oct - 4).join("'"); if (p.oct <= 3) s += new Array(5 - p.oct).join(",");
      if (z.clef === "grand") return "X:1\nL:1/4\n%%score {RH | LH}\nV:RH clef=treble\nV:LH clef=bass\nK:C\n[V:RH] " + (clef === "treble" ? s + "4" : "x4") + " |]\n[V:LH] " + (clef === "bass" ? s + "4" : "x4") + " |]\n";
      return "X:1\nL:1/4\nK:C clef=" + clef + "\n" + s + "4 |]\n";
    }
    function ask() {
      answered = false; cur = pick();
      if (useMic) Mic.setExpect([cur - 12, cur, cur + 12]);
      $("#qprog").textContent = (n + 1) + " / " + N;
      renderScore($("#qscore"), abcFor(cur), { noWrap: true, scale: 1.6 });
      $("#qfb").className = "qfb"; $("#qfb").textContent = useMic ? "在钢琴上弹出这个音（哪个八度都算对）" : "这个音是什么？";
      $$("#answers button").forEach(function (b) { b.className = ""; b.disabled = false; });
      kbMark(kb, [], "tgt"); kbMark(kb, [], "wrong");
    }
    function answer(letter, playedMidi) {
      if (answered) return; answered = true;
      var right = M.midiToName(cur).charAt(0), good = letter === right, key = clefOf(cur) + "|" + cur;
      var st = state.quiz.stats[key] = state.quiz.stats[key] || { ok: 0, bad: 0 };
      if (good) { ok++; st.ok++; } else st.bad++;
      save();
      $$("#answers button").forEach(function (b) { var l = b.getAttribute("data-l"); b.disabled = true; if (l === right) b.className = "right"; else if (l === letter) b.className = "wrongb"; });
      kbMark(kb, [cur], "tgt", true); if (!good && playedMidi) kbMark(kb, [playedMidi], "wrong");
      var where = clefOf(cur) === "bass" ? "低音谱" : "高音谱";
      $("#qfb").className = "qfb " + (good ? "good" : "badq");
      $("#qfb").innerHTML = (good ? "对！" : "是 <b>" + right + "</b>（" + M.SOLFEGE[right] + "）。") + "这是" + where + "上的 " + M.midiToName(cur) + (cur === 60 ? "（中央C）" : "") + "，键盘上亮起的那个键。";
      Audio.note(cur, Audio.get().currentTime + 0.05, 0.6, 0.25);
      n++;
      timer = setTimeout(function () { if (n >= N) finish(); else ask(); }, good ? 1100 : 2400);
    }
    function finish() {
      if (offMic) { offMic(); offMic = null; } Mic.stop();
      var score = ok * 10, sec = (Date.now() - t0) / 1000;
      state.quiz.rounds++; state.quiz.best = state.quiz.best || {}; var prev = state.quiz.best[id] || 0;
      if (score > prev) state.quiz.best[id] = score;
      markDone("quiz"); save();
      $("#qres").innerHTML = '<section class="result"><div class="big">' + score + '<small>分</small></div><div class="stars">' + starHTML(stars(score)) + "</div><p>10 题对 " + ok + " 题，用时 " + fmtDur(sec) + "。" + (score > prev && prev ? "新纪录！" : "") + "</p>" +
        '<p class="praise">' + (score >= 90 ? (id.slice(-1) < "3" ? "很熟了，可以试试下一级。" : "厉害！") : "认错的音会在下次多出几次，多练就记住了。") + "</p>" +
        '<button class="btn primary" id="qagain">再来 10 题</button> <a class="btn ghost" href="#/read">返回</a></section>';
      $("#qagain").onclick = function () { n = 0; ok = 0; t0 = Date.now(); $("#qres").innerHTML = ""; if (useMic) startMic(); ask(); };
      $("#qres").scrollIntoView({ behavior: "smooth" });
    }
    function startMic() {
      Mic.start().then(function () {
        if (offMic) offMic();
        offMic = Mic.on(function (type, d) {
          if (answered) return;
          if (type === "hit") { answer(M.midiToName(cur).charAt(0), cur); return; }
          // 弹错：要听得很清楚，并且稍等一下，给"目标音检测"留出时间
          if (type === "note" && d.clarity >= 0.8 && M.midiToName(d.midi).charAt(0) !== M.midiToName(cur).charAt(0)) {
            var q = cur; setTimeout(function () { if (!answered && cur === q) answer(M.midiToName(d.midi).charAt(0) + (M.midiToName(d.midi).charAt(1) === "#" ? "#" : ""), d.midi); }, 350);
            return;
          }
          if (type === "note") answer(M.midiToName(d.midi).charAt(0) + (M.midiToName(d.midi).charAt(1) === "#" ? "#" : ""), d.midi);
        });
      }).catch(function (e) { micHelp(e); $("#qmic").checked = false; useMic = false; });
    }
    $$("#answers button").forEach(function (b) { b.onclick = function () { answer(b.getAttribute("data-l")); }; });
    $("#qmic").onchange = function () {
      useMic = state.settings.quizMic = this.checked; save();
      if (useMic) { startMic(); Mic.setExpect([cur - 12, cur, cur + 12]); } else { if (offMic) offMic(); offMic = null; Mic.setExpect(null); Mic.stop(); }
      if (!answered) $("#qfb").textContent = useMic ? "在钢琴上弹出这个音（哪个八度都算对）" : "这个音是什么？";
    };
    onLeave(function () { clearTimeout(timer); if (offMic) offMic(); });
    if (useMic) startMic();
    ask();
  }

  /* ───────── 设置 ───────── */
  function viewSettings(main) {
    main.innerHTML = '<header class="pagehead"><a class="back" href="#/today">‹ 今天</a><h1>设置</h1></header>' +
      '<section class="card"><h2 class="h2">麦克风测试</h2><p class="muted">把手机或 iPad 放在谱架上，弹一个音，看看能不能认出来。</p><button class="btn primary" id="mt">🎤 开始测试</button><div class="tuner" id="tuner"><b id="tn">—</b><span id="tc" class="muted"></span><div class="meter"><i id="tl"></i></div></div>' +
      '<p class="muted small">认不准的话：离琴近一点、关掉风扇或电视；iPhone 请关掉\"静音模式\"才能听到示范声音。</p></section>' +
      '<section class="card"><h2 class="h2">备份与换设备</h2><p class="muted">练习记录保存在这台设备的浏览器里。换设备（比如从手机换到 iPad）时，先在旧设备\"导出\"，再在新设备\"导入\"。录音不在备份里，请单独下载。</p><button class="btn" id="exp">导出备份</button> <label class="btn ghost">导入备份<input type="file" id="imp" accept="application/json,.json" hidden></label></section>' +
      '<section class="card"><h2 class="h2">关于</h2><p class="muted small">版本 ' + esc(VERSION) + "。看板内容更新后会自动刷新。所有功能都在本机运行，不上传任何声音或记录。曲目均为公有领域旋律的简易改编。</p></section>";
    var off = null;
    $("#mt").onclick = function () {
      var b = this;
      if (Mic.active) { Mic.stop(); if (off) off(); b.textContent = "🎤 开始测试"; return; }
      Mic.start().then(function () {
        b.textContent = "■ 停止";
        off = Mic.on(function (type, d) {
          if (type === "pitch") { $("#tn").textContent = M.midiToName(d.midi).replace("#", "♯"); $("#tc").textContent = (d.cents > 0 ? "+" : "") + d.cents + " 音分"; }
          $("#tl").style.width = Math.min(100, Math.round(Mic.level * 600)) + "%";
        });
      }).catch(function (e) { micHelp(e); });
    };
    onLeave(function () { if (off) off(); });
    $("#exp").onclick = function () {
      var blob = new Blob([JSON.stringify(state, null, 1)], { type: "application/json" }), a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "Grace练琴备份-" + dayKey() + ".json"; document.body.appendChild(a); a.click(); a.remove();
    };
    $("#imp").onchange = function () {
      var f = this.files[0]; if (!f) return;
      f.text().then(function (txt) {
        var o = JSON.parse(txt); if (!o || !o.days) throw new Error("bad");
        if (!confirm("用备份覆盖这台设备上的练习记录？")) return;
        localStorage.setItem(KEY, JSON.stringify(o)); state = load(); toast("已导入"); render();
      }).catch(function () { toast("文件不对，导入失败"); });
    };
  }

  /* ───────── 自动更新：Kevin 修改仓库后，这边几分钟内自动刷新 ───────── */
  function checkUpdate() {
    if (VERSION === "dev") return;
    fetch("version.json?t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.v || j.v === VERSION) return;
      var busy = Player.playing || Mic.active || Recorder.rec;
      var go = function () { location.replace(location.pathname + "?v=" + encodeURIComponent(j.v) + location.hash); };
      if (!busy && route().name !== "quiz") go();
      else { var b = $("#update"); b.hidden = false; b.onclick = go; }
    }).catch(function () { });
  }
  setInterval(checkUpdate, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) checkUpdate(); });

  // iOS 需要在用户第一次点击时解锁声音
  document.addEventListener("pointerdown", function unlock() {
    try { var ctx = Audio.get(), b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch (e) { }
    document.removeEventListener("pointerdown", unlock);
  });

  render();
  // 测试钩子（不影响使用）
  window.__piano = { M: M, Mic: Mic, Player: Player, state: function () { return state; }, detectPitch: detectPitch };
})();
