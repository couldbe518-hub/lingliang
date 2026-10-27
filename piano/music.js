/* 记谱解析与 ABC 生成（浏览器和 node 校验脚本共用） */
(function (root) {
  "use strict";
  var LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
  var LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var KEYS = {
    C: { acc: {}, tonic: 0 }, Am: { acc: {}, tonic: 0 },
    G: { acc: { F: "#" }, tonic: 7 }, Em: { acc: { F: "#" }, tonic: 7 },
    D: { acc: { F: "#", C: "#" }, tonic: 2 }, Bm: { acc: { F: "#", C: "#" }, tonic: 2 },
    A: { acc: { F: "#", C: "#", G: "#" }, tonic: 9 },
    F: { acc: { B: "b" }, tonic: 5 }, Dm: { acc: { B: "b" }, tonic: 5 },
    Bb: { acc: { B: "b", E: "b" }, tonic: 10 }, Gm: { acc: { B: "b", E: "b" }, tonic: 10 },
    Eb: { acc: { B: "b", E: "b", A: "b" }, tonic: 3 }, Cm: { acc: { B: "b", E: "b", A: "b" }, tonic: 3 },
    "F#m": { acc: { F: "#", C: "#", G: "#" }, tonic: 9 },
    E: { acc: { F: "#", C: "#", G: "#", D: "#" }, tonic: 4 }, "C#m": { acc: { F: "#", C: "#", G: "#", D: "#" }, tonic: 4 }
  };
  var VALID_UNITS = { 1: 1, 2: 1, 3: 1, 4: 1, 6: 1, 8: 1, 12: 1, 16: 1, 24: 1, 32: 1 }; // L:1/32 下可单符表示的长度
  var JIANPU = ["1", "#1", "2", "b3", "3", "4", "#4", "5", "#5", "6", "b7", "7"];
  var NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var SOLFEGE = { C: "do", D: "re", E: "mi", F: "fa", G: "sol", A: "la", B: "si" };

  function parsePitch(s) {
    var m = /^([A-G])(#|b)?(-?\d)$/.exec(s);
    if (!m) return null;
    var acc = m[2] || "";
    var oct = parseInt(m[3], 10);
    var midi = 12 * (oct + 1) + LETTER_PC[m[1]] + (acc === "#" ? 1 : acc === "b" ? -1 : 0);
    return { letter: m[1], acc: acc, oct: oct, midi: midi, name: m[1] + acc + oct };
  }

  function meterBeats(meter) {
    var p = meter.split("/");
    return (parseInt(p[0], 10) * 4) / parseInt(p[1], 10);
  }

  /* 解析一只手：返回 { events, bars, errors } ；event = {start, dur, pitches[], rest, tie, tiedFrom, finger, bar} */
  function parseHand(str, meter) {
    var res = { events: [], bars: [], errors: [] };
    if (!str || !str.trim()) return res;
    var full = meterBeats(meter);
    var bars = str.split("|").map(function (b) { return b.trim(); });
    if (bars.length && bars[bars.length - 1] === "") bars.pop();
    var t = 0;
    bars.forEach(function (barStr, bi) {
      var barStart = t;
      var toks = barStr.split(/\s+/).filter(Boolean);
      toks.forEach(function (tok) {
        var m = /^([^:@~]+)(?::([\d.]+))?(~)?(?:@(\d))?$/.exec(tok);
        if (!m) { res.errors.push("第" + (bi + 1) + "小节无法识别：" + tok); return; }
        var dur = m[2] ? parseFloat(m[2]) : 1;
        var units = Math.round(dur * 8);
        if (Math.abs(units - dur * 8) > 1e-6 || !VALID_UNITS[units]) res.errors.push("第" + (bi + 1) + "小节时值不能单独表示：" + tok);
        var ev = { start: t, dur: dur, units: units, pitches: [], rest: false, tie: !!m[3], finger: m[4] ? +m[4] : null, bar: bi };
        if (m[1] === "r") ev.rest = true;
        else if (m[1] === "x") { ev.rest = true; ev.invisible = true; }
        else {
          m[1].split("+").forEach(function (ps) {
            var p = parsePitch(ps);
            if (!p) res.errors.push("第" + (bi + 1) + "小节音名错误：" + ps);
            else ev.pitches.push(p);
          });
        }
        var prev = res.events[res.events.length - 1];
        if (prev && prev.tie && !ev.rest && prev.pitches.length && sameMidis(prev, ev)) ev.tiedFrom = true;
        res.events.push(ev);
        t += dur;
      });
      var len = t - barStart;
      res.bars.push({ start: barStart, len: len });
      var isFirst = bi === 0, isLast = bi === bars.length - 1;
      if (Math.abs(len - full) > 1e-6 && !((isFirst || isLast) && len < full)) {
        res.errors.push("第" + (bi + 1) + "小节拍数为 " + len + "，应为 " + full);
      }
    });
    res.total = t;
    return res;
  }

  function sameMidis(a, b) {
    if (a.pitches.length !== b.pitches.length) return false;
    for (var i = 0; i < a.pitches.length; i++) if (a.pitches[i].midi !== b.pitches[i].midi) return false;
    return true;
  }

  function abcPitch(p) {
    var s = p.oct >= 5 ? p.letter.toLowerCase() : p.letter;
    if (p.oct >= 6) s += new Array(p.oct - 4).join("'");
    if (p.oct <= 3) s += new Array(5 - p.oct).join(",");
    return s;
  }

  function label(p, mode, keyName, isLH) {
    if (mode === "name") return p.letter + (p.acc === "#" ? "♯" : p.acc === "b" ? "♭" : "");
    if (mode === "solfege") return SOLFEGE[p.letter] + (p.acc === "#" ? "♯" : p.acc === "b" ? "♭" : "");
    if (mode === "jianpu") {
      var k = KEYS[keyName] || KEYS.C;
      var base = 60 + k.tonic - (isLH ? 12 : 0);
      var rel = p.midi - base;
      var deg = JIANPU[((rel % 12) + 12) % 12];
      var o = Math.floor(rel / 12);
      if (o > 0) deg += new Array(o + 1).join("̇");
      if (o < 0) deg += new Array(-o + 1).join("̣");
      return deg;
    }
    return "";
  }

  /* 生成某只手的 ABC 音符串 */
  function handToAbc(parsed, song, opts, isLH) {
    var keyAcc = (KEYS[song.key] || KEYS.C).acc;
    var group = /\/8$/.test(song.meter) ? 1.5 : 1;
    var out = [];
    var barIdx = -1, state = {};
    var prevShort = false, prevGroup = -1;
    parsed.events.forEach(function (ev, i) {
      if (ev.bar !== barIdx) {
        if (barIdx >= 0) { out.push(" | "); }
        barIdx = ev.bar; state = {}; prevShort = false;
      }
      var tok = "";
      if (opts.labels && opts.labels !== "none" && !ev.rest && !ev.tiedFrom) {
        var low = ev.pitches[0];
        tok += '"_' + label(low, opts.labels, song.key, isLH) + '"';
      }
      var showF = opts.fingers !== false && !ev.rest && !ev.tiedFrom;
      var fs = ev.fingers || (ev.finger ? [ev.finger] : null);
      if (showF && fs && ev.pitches.length === 1) tok += "!" + fs[0] + "!";
      var notes;
      if (ev.rest) notes = ev.invisible ? "x" : "z";
      else {
        notes = ev.pitches.map(function (p, pi) {
          var want = p.acc, k = p.letter + p.oct;
          var cur = state.hasOwnProperty(k) ? state[k] : (keyAcc[p.letter] || "");
          var pre = "";
          if (want !== cur) { pre = want === "#" ? "^" : want === "b" ? "_" : "="; state[k] = want; }
          var fdec = showF && fs && ev.pitches.length > 1 && fs[pi] ? "!" + fs[pi] + "!" : "";
          return fdec + pre + abcPitch(p);
        });
        notes = notes.length > 1 ? "[" + notes.join("") + "]" : notes[0];
      }
      tok += notes + (ev.units === 1 ? "" : String(ev.units)) + (ev.tie ? "-" : "");
      var barStart = parsed.bars[ev.bar].start;
      var pos = ev.start - barStart;
      var g = Math.floor(pos / group + 1e-9);
      var short = ev.dur < 1 && !ev.rest;
      var join = short && prevShort && g === prevGroup && out.length && out[out.length - 1] !== " | ";
      if (out.length && !join && out[out.length - 1] !== " | ") out.push(" ");
      out.push(tok);
      prevShort = short; prevGroup = g;
    });
    out.push(" |]");
    return out.join("");
  }

  /* ───── 自动指法（动态规划）─────
     把左手镜像成右手处理：p' = -midi，这样两只手都是"音越高、指头号越大"。
     每个音（或和弦）枚举可行的指法，代价 = 手位移动 + 伸张/拥挤 + 穿指/跨指 + 同指换音 + 拇指/小指按黑键，取总代价最小的一条。*/
  var OFF = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7 }; // C 位置五指的自然间距（半音）
  var MAXSPAN = { "12": 10, "13": 12, "14": 13, "15": 15, "23": 5, "24": 8, "25": 10, "34": 5, "35": 8, "45": 5 };
  function isBlackMidi(m) { return [1, 3, 6, 8, 10].indexOf(((m % 12) + 12) % 12) >= 0; }
  function spanCost(f, g, d) { // f<g，d = 两音相隔半音数（>0）
    var mx = MAXSPAN[String(f) + g], nat = OFF[g] - OFF[f], c = 0;
    if (d > mx) return 20 + (d - mx) * 2;
    if (d > nat + 2) c += (d - nat - 2) * 1.2;
    if (d < g - f) c += (g - f - d) * 1.5;
    return c;
  }
  function chordOptions(ps) { // ps 升序 p'；返回可行指法数组
    var n = ps.length, out = [];
    if (n > 5) return out;
    (function rec(i, minF, acc) {
      if (i === n) { out.push(acc.slice()); return; }
      for (var f = minF; f <= 5 - (n - 1 - i); f++) {
        if (i > 0 && spanCost(acc[i - 1], f, ps[i] - ps[i - 1]) >= 20) continue;
        acc.push(f); rec(i + 1, f + 1, acc); acc.pop();
      }
    })(0, 1, []);
    return out;
  }
  function handPos(ps, fs) { var s = 0; for (var i = 0; i < ps.length; i++) s += ps[i] - OFF[fs[i]]; return s / ps.length; }
  function selfCost(ps, fs, isLH) {
    var c = 0;
    for (var i = 1; i < ps.length; i++) c += spanCost(fs[i - 1], fs[i], ps[i] - ps[i - 1]);
    for (i = 0; i < ps.length; i++) { var black = isBlackMidi(isLH ? -ps[i] : ps[i]); if (black && fs[i] === 1) c += 1.5; if (black && fs[i] === 5) c += 1; }
    if (ps.length === 1) c += fs[0] === 5 ? 0.35 : fs[0] === 4 ? 0.2 : 0; // 单音略偏向 1-2-3 指（4、5 指弱）
    return c;
  }
  function transCost(pp, pf, qp, qf) {
    var c = Math.abs(handPos(qp, qf) - handPos(pp, pf)) * 0.5;
    if (pp.length === 1 && qp.length === 1) {
      var p = pp[0], f = pf[0], q = qp[0], g = qf[0], d = q - p;
      if (d === 0) return c + (f === g ? 0 : 1);
      if (f === g) return c + 3 + (Math.abs(d) <= 4 ? 3 : 0);
      var CROSS = { 2: 2, 3: 1.8, 4: 2.5 }; // 穿指/跨指的代价：3 指最顺手
      if (d > 0 && g < f) return c + ((g === 1 && f <= 4) ? CROSS[f] : 12); // 上行用更小的指：拇指从下面穿过才行
      if (d < 0 && g > f) return c + ((f === 1 && g <= 4) ? CROSS[g] : 12); // 下行用更大的指：2/3/4 跨过拇指才行
      return c + spanCost(Math.min(f, g), Math.max(f, g), Math.abs(d));
    }
    var extra = 0;
    for (var i = 0; i < pp.length; i++) for (var j = 0; j < qp.length; j++) {
      if (pf[i] === qf[j]) extra += pp[i] === qp[j] ? -0.5 : 1;
      else if ((qp[j] > pp[i] && qf[j] < pf[i] && qf[j] !== 1) || (qp[j] < pp[i] && qf[j] > pf[i] && pf[i] !== 1)) extra += 1.5;
    }
    return c + Math.min(6, Math.max(-1.5, extra));
  }
  function autoFinger(parsed, isLH) {
    var evs = parsed.events.filter(function (e) { return !e.rest && !e.tiedFrom && e.pitches.length; });
    if (!evs.length) return;
    if (evs.some(function (e) { return e.finger; })) return; // 手写过指法
    var items = evs.map(function (e) {
      var ps = e.pitches.map(function (p) { return isLH ? -p.midi : p.midi; }).sort(function (a, b) { return a - b; });
      return { ev: e, ps: ps, opts: chordOptions(ps) };
    });
    var best = null, prevLayer = null;
    items.forEach(function (it, i) {
      var layer = it.opts.map(function (fs) {
        var self = selfCost(it.ps, fs, isLH), node = { fs: fs, cost: self, back: null };
        if (prevLayer && prevLayer.length) {
          var bc = Infinity, bb = null;
          prevLayer.forEach(function (pn) { var c = pn.cost + transCost(items[i - 1].ps, pn.fs, it.ps, fs); if (c < bc) { bc = c; bb = pn; } });
          node.cost += bc; node.back = bb;
        }
        return node;
      });
      if (!layer.length) { // 这个和弦没有可行指法：留空，链条从这里重新开始
        it.skip = true; prevLayer = null; return;
      }
      it.layer = layer; prevLayer = layer;
    });
    for (var i = items.length - 1; i >= 0; i--) {
      if (items[i].skip) { best = null; continue; }
      var layer = items[i].layer;
      if (!best) best = layer.reduce(function (a, b) { return b.cost < a.cost ? b : a; });
      var it = items[i], ev = it.ev;
      // 把升序 p' 的指法映射回 ev.pitches 的原顺序
      var order = ev.pitches.map(function (p, k) { return { k: k, v: isLH ? -p.midi : p.midi }; }).sort(function (a, b) { return a.v - b.v; });
      ev.fingers = new Array(ev.pitches.length);
      order.forEach(function (o, k) { ev.fingers[o.k] = best.fs[k]; });
      best = best.back;
    }
  }

  /* hands: "both" | "rh" | "lh"；每只手可有第二声部 rh2 / lh2（同一行谱上符干朝下）。
     返回 { abc, voices: ["rh","rh2","lh",...]（与 abcjs 的 abcjs-vN 编号一致）, rh, rh2, lh, lh2 } */
  function buildAbc(song, hands, opts) {
    opts = opts || {};
    var P = {};
    ["rh", "rh2", "lh", "lh2"].forEach(function (k) { P[k] = parseHand(song[k] || "", song.meter); });
    if (opts.fingers !== false && song.fing !== false) {
      // 有第二声部的那只手不自动标（两个声部要一起算才准）；手写过 @指法 的也不动
      if (!P.rh2.events.length) autoFinger(P.rh, false);
      if (!P.lh2.events.length) autoFinger(P.lh, true);
    }
    var useRh = P.rh.events.length && hands !== "lh";
    var useLh = P.lh.events.length && hands !== "rh";
    if (!useRh && !useLh) { useRh = !!P.rh.events.length; useLh = !useRh; }
    var staves = [];
    if (useRh) staves.push({ clef: "treble", parts: P.rh2.events.length ? ["rh", "rh2"] : ["rh"] });
    if (useLh) staves.push({ clef: "bass", parts: P.lh2.events.length ? ["lh", "lh2"] : ["lh"] });
    var head = ["X:1", "M:" + song.meter, "L:1/32"];
    var voices = [], lines = [], score = [];
    staves.forEach(function (st) {
      var ids = st.parts.map(function (k) { return k.toUpperCase(); });
      score.push(ids.length > 1 ? "(" + ids.join(" ") + ")" : ids[0]);
      st.parts.forEach(function (k, i) {
        head.push("V:" + k.toUpperCase() + " clef=" + st.clef + (st.parts.length > 1 ? (i ? " stem=down" : " stem=up") : ""));
        lines.push("[V:" + k.toUpperCase() + "] " + handToAbc(P[k], song, opts, k.charAt(0) === "l"));
        if (k === "rh" && song.lyrics && opts.lyrics !== false) lines.push("w: " + song.lyrics);
        voices.push(k);
      });
    });
    head.splice(3, 0, "%%score " + (staves.length > 1 ? "{" + score.join(" | ") + "}" : score[0]));
    head.push("K:" + song.key);
    var out = { abc: head.join("\n") + "\n" + lines.join("\n") + "\n", voices: voices };
    Object.keys(P).forEach(function (k) { out[k] = P[k]; });
    return out;
  }

  function midiToName(m) { return NAMES_SHARP[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }
  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  var api = {
    parseHand: parseHand, buildAbc: buildAbc, parsePitch: parsePitch, meterBeats: meterBeats,
    midiToName: midiToName, midiToFreq: midiToFreq, label: label, autoFinger: autoFinger, KEYS: KEYS, LETTERS: LETTERS, SOLFEGE: SOLFEGE
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PianoMusic = api;
})(typeof window !== "undefined" ? window : this);
