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
      if (ev.finger && opts.fingers !== false) tok += "!" + ev.finger + "!";
      var notes;
      if (ev.rest) notes = ev.invisible ? "x" : "z";
      else {
        notes = ev.pitches.map(function (p) {
          var want = p.acc, k = p.letter + p.oct;
          var cur = state.hasOwnProperty(k) ? state[k] : (keyAcc[p.letter] || "");
          var pre = "";
          if (want !== cur) { pre = want === "#" ? "^" : want === "b" ? "_" : "="; state[k] = want; }
          return pre + abcPitch(p);
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

  /* hands: "both" | "rh" | "lh"；每只手可有第二声部 rh2 / lh2（同一行谱上符干朝下）。
     返回 { abc, voices: ["rh","rh2","lh",...]（与 abcjs 的 abcjs-vN 编号一致）, rh, rh2, lh, lh2 } */
  function buildAbc(song, hands, opts) {
    opts = opts || {};
    var P = {};
    ["rh", "rh2", "lh", "lh2"].forEach(function (k) { P[k] = parseHand(song[k] || "", song.meter); });
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
    midiToName: midiToName, midiToFreq: midiToFreq, label: label, KEYS: KEYS, LETTERS: LETTERS, SOLFEGE: SOLFEGE
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PianoMusic = api;
})(typeof window !== "undefined" ? window : this);
