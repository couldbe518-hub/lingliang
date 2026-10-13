/* 声音：真人感语音指导（系统语音合成）+ 实时生成的背景音乐 + 提示音
 * 全部在手机本地生成，不下载音频、不调用任何服务。
 *
 * 想换成真人录音：把录好的 mp3 放进 stretch/voice/，在 voice/manifest.json 里写 { "要念的原文": "文件名.mp3" }，
 * 播放时遇到同样的句子就会用录音代替合成语音。
 */
(function () {
  var ctx = null, master, musicBus, fxBus, reverb, musicGain, duckGain;
  var settings = { voice: "", rate: 1, voiceOn: true, musicOn: true, musicVol: .55, voiceVol: 1 };
  var pack = {}, packLoaded = false;

  function ensure() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return ctx; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) { /* 旧版 iOS 没有 */ }
    ctx = new AC();
    master = ctx.createDynamicsCompressor();
    master.threshold.value = -16; master.ratio.value = 3; master.attack.value = .02; master.release.value = .4;
    master.connect(ctx.destination);
    duckGain = ctx.createGain(); duckGain.gain.value = 1; duckGain.connect(master);
    musicGain = ctx.createGain(); musicGain.gain.value = settings.musicOn ? settings.musicVol : 0; musicGain.connect(duckGain);
    musicBus = ctx.createGain(); musicBus.gain.value = .9; musicBus.connect(musicGain);
    reverb = ctx.createConvolver(); reverb.buffer = impulse(3.6, 2.6);
    var wet = ctx.createGain(); wet.gain.value = .55; reverb.connect(wet); wet.connect(musicGain);
    fxBus = ctx.createGain(); fxBus.gain.value = .5; fxBus.connect(master);
    return ctx;
  }

  function impulse(sec, decay) {
    var rate = ctx.sampleRate, len = Math.floor(rate * sec), buf = ctx.createBuffer(2, len, rate);
    for (var c = 0; c < 2; c++) {
      var d = buf.getChannelData(c);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  function noiseBuffer(type) {
    var rate = ctx.sampleRate, len = rate * 4, buf = ctx.createBuffer(1, len, rate), d = buf.getChannelData(0), last = 0, b = [0, 0, 0, 0, 0, 0, 0];
    for (var i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      if (type === "brown") { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; }
      else if (type === "pink") {
        b[0] = .99886 * b[0] + w * .0555179; b[1] = .99332 * b[1] + w * .0750759; b[2] = .969 * b[2] + w * .153852;
        b[3] = .8665 * b[3] + w * .3104856; b[4] = .55 * b[4] + w * .5329522; b[5] = -.7616 * b[5] - w * .016898;
        d[i] = (b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + w * .5362) * .11; b[6] = w * .115926;
      } else d[i] = w;
    }
    return buf;
  }
  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  // ───────── 音乐主题 ─────────
  // chords：MIDI 音高；bells：铃声可用的音；len：每个和弦秒数
  var THEMES = {
    daylight: { name: "晨光", desc: "温暖明亮，适合白天", len: 8, cutoff: 1500, bellRate: .35, noise: null,
      chords: [[50, 57, 62, 66, 69, 76], [47, 54, 59, 62, 66, 73], [43, 50, 55, 59, 62, 69], [45, 52, 57, 62, 64, 71]],
      bells: [74, 76, 78, 81, 83, 86, 88, 90] },
    stream: { name: "林间溪流", desc: "清新流动，适合午后", len: 9, cutoff: 1300, bellRate: .28, noise: "stream",
      chords: [[48, 55, 64, 67, 71], [45, 52, 60, 64, 67], [41, 53, 57, 60, 64], [43, 50, 59, 62, 67]],
      bells: [72, 74, 76, 79, 81, 84, 86] },
    night: { name: "夜空", desc: "低沉缓慢，帮助入睡", len: 12, cutoff: 800, bellRate: .12, noise: "night",
      chords: [[41, 48, 57, 64, 67], [40, 47, 55, 62, 67], [38, 45, 53, 60, 64], [36, 43, 52, 59, 62]],
      bells: [64, 67, 69, 72, 76, 79] },
    ocean: { name: "海浪", desc: "潮汐呼吸，深度放松", len: 11, cutoff: 900, bellRate: .1, noise: "ocean",
      chords: [[40, 47, 56, 63, 66], [37, 44, 52, 59, 64], [45, 52, 56, 61, 64], [47, 54, 59, 63, 66]],
      bells: [68, 71, 73, 75, 78, 80] },
    pulse: { name: "律动", desc: "轻快节拍，适合热身", len: 4.8, cutoff: 2200, bellRate: 0, noise: null, bpm: 100,
      chords: [[45, 57, 60, 64, 67], [41, 53, 57, 60, 65], [36, 48, 55, 60, 64], [43, 55, 59, 62, 67]],
      bells: [69, 72, 74, 76, 79, 81] }
  };

  var cur = null; // 当前播放状态

  function pad(chord, t, len, th, bus) {
    var dur = len + 4;
    chord.forEach(function (n, i) {
      [-6, 6].forEach(function (det, k) {
        var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = k ? "sawtooth" : "triangle";
        o.frequency.value = midi(n); o.detune.value = det + (Math.random() * 4 - 2);
        f.type = "lowpass"; f.frequency.value = th.cutoff * (i < 2 ? .7 : 1); f.Q.value = .4;
        var peak = (k ? .016 : .05) * (i < 2 ? 1.15 : .8);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + Math.min(3.2, len * .45));
        g.gain.setValueAtTime(peak, t + len);
        g.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(f); f.connect(g); g.connect(bus); g.connect(reverb);
        o.start(t); o.stop(t + dur + .1);
      });
    });
  }
  function bell(n, t, vol, bus) {
    var o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain();
    o.type = "sine"; o.frequency.value = midi(n);
    o2.type = "sine"; o2.frequency.value = midi(n) * 2.01;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + 3.2);
    g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(vol * .25, t + .005); g2.gain.exponentialRampToValueAtTime(.0001, t + 1.2);
    o.connect(g); o2.connect(g2); g.connect(bus); g2.connect(bus); g.connect(reverb); g2.connect(reverb);
    o.start(t); o2.start(t); o.stop(t + 3.3); o2.stop(t + 1.3);
  }
  function pluck(n, t, vol, bus) {
    var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = "triangle"; o.frequency.value = midi(n);
    f.type = "lowpass"; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(500, t + .4);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .005); g.gain.exponentialRampToValueAtTime(.0001, t + .6);
    o.connect(f); f.connect(g); g.connect(bus); g.connect(reverb); o.start(t); o.stop(t + .7);
  }
  function kick(t, bus) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + .18);
    g.gain.setValueAtTime(.32, t); g.gain.exponentialRampToValueAtTime(.0001, t + .32);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + .35);
  }
  function hat(t, bus, vol) {
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = cur.white; f.type = "highpass"; f.frequency.value = 7000;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + .06);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random() * 3); s.stop(t + .08);
  }
  function bassNote(n, t, len, bus) {
    var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = "sine"; o.frequency.value = midi(n);
    f.type = "lowpass"; f.frequency.value = 300;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.12, t + .02); g.gain.exponentialRampToValueAtTime(.001, t + len);
    o.connect(f); f.connect(g); g.connect(bus); o.start(t); o.stop(t + len + .05);
  }

  function ambience(type, bus) {
    var nodes = [];
    if (type === "ocean") {
      var src = ctx.createBufferSource(); src.buffer = noiseBuffer("brown"); src.loop = true;
      var f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 700;
      var g = ctx.createGain(); g.gain.value = .08;
      var lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 1 / 9; lg.gain.value = .07;
      lfo.connect(lg); lg.connect(g.gain);
      var lfo2 = ctx.createOscillator(), lg2 = ctx.createGain(); lfo2.frequency.value = 1 / 9; lg2.gain.value = 400;
      lfo2.connect(lg2); lg2.connect(f.frequency);
      src.connect(f); f.connect(g); g.connect(bus);
      src.start(); lfo.start(); lfo2.start(); nodes.push(src, lfo, lfo2);
    } else if (type === "stream") {
      var s2 = ctx.createBufferSource(); s2.buffer = noiseBuffer("pink"); s2.loop = true;
      var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = .8;
      var g2 = ctx.createGain(); g2.gain.value = .05;
      var l3 = ctx.createOscillator(), lg3 = ctx.createGain(); l3.type = "triangle"; l3.frequency.value = 3.3; lg3.gain.value = 500;
      l3.connect(lg3); lg3.connect(bp.frequency);
      s2.connect(bp); bp.connect(g2); g2.connect(bus); s2.start(); l3.start(); nodes.push(s2, l3);
    } else if (type === "night") {
      var s3 = ctx.createBufferSource(); s3.buffer = noiseBuffer("brown"); s3.loop = true;
      var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 380;
      var g3 = ctx.createGain(); g3.gain.value = .05;
      s3.connect(lp); lp.connect(g3); g3.connect(bus); s3.start(); nodes.push(s3);
    }
    return nodes;
  }

  function startMusic(name) {
    if (!ensure()) return;
    var th = THEMES[name] || THEMES.daylight;
    if (cur && cur.name === name) return;
    stopMusic(.8);
    var bus = ctx.createGain(); bus.gain.value = 0; bus.connect(musicBus);
    bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.5);
    cur = { name: name, th: th, bus: bus, next: ctx.currentTime + .1, idx: 0, beat: 0, nextBeat: ctx.currentTime + .1, timer: 0, nodes: [], white: noiseBuffer("white") };
    cur.nodes = ambience(th.noise, bus);
    var me = cur;
    function tick() {
      if (cur !== me) return;
      var ahead = ctx.currentTime + 1.2;
      while (me.next < ahead) {
        var chord = th.chords[me.idx % th.chords.length];
        pad(chord, me.next, th.len, th, me.bus);
        if (th.bellRate) {
          var n = Math.max(1, Math.round(th.len * th.bellRate * (0.6 + Math.random() * .8)));
          for (var i = 0; i < n; i++) bell(th.bells[Math.floor(Math.random() * th.bells.length)], me.next + Math.random() * th.len, .035 + Math.random() * .03, me.bus);
        }
        me.chord = chord; me.next += th.len; me.idx++;
      }
      if (th.bpm) {
        var spb = 60 / th.bpm;
        while (me.nextBeat < ahead) {
          var b = me.beat % 16, ch = th.chords[Math.floor(me.beat / 8) % th.chords.length];
          if (b % 4 === 0) kick(me.nextBeat, me.bus);
          hat(me.nextBeat + spb / 2, me.bus, b % 4 === 2 ? .05 : .03);
          if (b % 2 === 0) bassNote(ch[0], me.nextBeat, spb * 1.6, me.bus);
          var arp = [ch[2], ch[3], ch[4], ch[3]];
          pluck(arp[b % 4] + 12, me.nextBeat + spb / 2, .045, me.bus);
          me.nextBeat += spb; me.beat++;
        }
      }
    }
    tick();
    cur.timer = setInterval(tick, 300);
  }
  function stopMusic(fade) {
    if (!cur) return;
    var c = cur; cur = null;
    clearInterval(c.timer);
    var f = fade == null ? 1.5 : fade, t = ctx.currentTime;
    c.bus.gain.cancelScheduledValues(t); c.bus.gain.setValueAtTime(c.bus.gain.value, t); c.bus.gain.linearRampToValueAtTime(0, t + f);
    setTimeout(function () { c.nodes.forEach(function (n) { try { n.stop(); } catch (e) { /* 已停 */ } }); c.bus.disconnect(); }, f * 1000 + 6000);
  }

  // ───────── 提示音 ─────────
  function chime(kind) {
    if (!ensure()) return;
    var t = ctx.currentTime + .02;
    if (kind === "tick") { bell(84, t, .07, fxBus); return; }
    if (kind === "go") { bell(76, t, .1, fxBus); bell(83, t + .12, .09, fxBus); return; }
    if (kind === "done") { [72, 76, 79, 84].forEach(function (n, i) { bell(n, t + i * .16, .1, fxBus); }); return; }
    if (kind === "side") { bell(79, t, .09, fxBus); bell(79, t + .22, .07, fxBus); return; }
    bell(81, t, .09, fxBus);
  }

  // ───────── 语音 ─────────
  var synth = window.speechSynthesis, voices = [], speaking = 0, queueEnd = null;
  function loadVoices() {
    if (!synth) return [];
    voices = synth.getVoices().filter(function (v) { return /^zh|cmn/i.test(v.lang); });
    return voices;
  }
  if (synth) { loadVoices(); synth.onvoiceschanged = loadVoices; }
  // 优先选音质好的普通话声音
  function rank(v) {
    var n = v.name + " " + v.voiceURI, s = 0;
    if (/zh[-_]CN|cmn/i.test(v.lang)) s += 50;
    if (/zh[-_]TW/i.test(v.lang)) s += 20;
    if (/premium|enhanced|高音质|增强|neural|natural|online/i.test(n)) s += 40;
    if (/Tingting|婷婷|Yu-?shu|语舒|Lili|莉莉|Lilian|Xiaoxiao|晓晓|Xiaoyi|Yunxi|Meijia|美佳/i.test(n)) s += 15;
    if (/Google/.test(n)) s += 10;
    if (/Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Bells|Trinoids|Zarvox|Bad News/i.test(n)) s -= 60;
    if (v.localService) s += 3;
    return s;
  }
  function pickVoice() {
    loadVoices();
    if (settings.voice) { var m = voices.filter(function (v) { return v.voiceURI === settings.voice || v.name === settings.voice; })[0]; if (m) return m; }
    return voices.slice().sort(function (a, b) { return rank(b) - rank(a); })[0] || null;
  }
  function duck(on) {
    if (!ctx) return;
    var t = ctx.currentTime;
    duckGain.gain.cancelScheduledValues(t);
    duckGain.gain.setValueAtTime(duckGain.gain.value, t);
    duckGain.gain.linearRampToValueAtTime(on ? .45 : 1, t + (on ? .25 : 1.2));
  }
  var packAudio = null;
  function say(text, opts) {
    opts = opts || {};
    if (!settings.voiceOn || !text) { if (opts.onend) setTimeout(opts.onend, 10); return; }
    if (pack[text]) {
      if (packAudio) packAudio.pause();
      packAudio = new Audio("voice/" + pack[text]); packAudio.volume = settings.voiceVol;
      duck(true); speaking++;
      packAudio.onended = packAudio.onerror = function () { speaking = Math.max(0, speaking - 1); if (!speaking) duck(false); if (opts.onend) opts.onend(); };
      packAudio.play().catch(function () { speaking = 0; duck(false); });
      return;
    }
    if (!synth) { if (opts.onend) opts.onend(); return; }
    if (opts.interrupt !== false) { synth.cancel(); speaking = 0; }
    var u = new SpeechSynthesisUtterance(text);
    var v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "zh-CN";
    u.rate = settings.rate * (opts.slow ? .9 : 1); u.pitch = 1; u.volume = settings.voiceVol;
    speaking++; duck(true);
    u.onend = u.onerror = function () { speaking = Math.max(0, speaking - 1); if (!speaking) duck(false); if (opts.onend) opts.onend(); };
    synth.speak(u);
  }
  function quiet() { if (synth) synth.cancel(); if (packAudio) packAudio.pause(); speaking = 0; duck(false); }
  // iOS 要求在用户点击时先"解锁"一次语音和音频
  function unlock() {
    ensure();
    if (synth && !unlock.done) { var u = new SpeechSynthesisUtterance(" "); u.volume = 0; synth.speak(u); unlock.done = true; }
    if (!packLoaded) {
      packLoaded = true;
      fetch("voice/manifest.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : {}; }).then(function (j) { pack = j || {}; }).catch(function () { });
    }
  }
  // 估算一句话要念多久（秒），用于安排节奏
  function speechSecs(text) { return text ? text.replace(/[\s，。、；：！？,.]/g, "").length / (4.3 * settings.rate) + .6 : 0; }

  function configure(s) {
    for (var k in s) settings[k] = s[k];
    if (ctx && musicGain) {
      var t = ctx.currentTime;
      musicGain.gain.cancelScheduledValues(t); musicGain.gain.setValueAtTime(musicGain.gain.value, t);
      musicGain.gain.linearRampToValueAtTime(settings.musicOn ? settings.musicVol : 0, t + .4);
    }
  }

  window.Sound = {
    THEMES: THEMES, configure: configure, settings: settings, unlock: unlock,
    startMusic: startMusic, stopMusic: stopMusic, current: function () { return cur && cur.name; },
    chime: chime, say: say, quiet: quiet, speechSecs: speechSecs,
    voices: function () { return loadVoices().slice().sort(function (a, b) { return rank(b) - rank(a); }); },
    pause: function () { if (ctx) ctx.suspend(); if (synth) synth.pause(); },
    resume: function () { if (ctx) ctx.resume(); if (synth) synth.resume(); }
  };
})();
