/* 吉他核心：调弦、和弦库、六线谱解析、六线谱 / 和弦图 / 指板绘制（浏览器与 node 校验脚本共用） */
(function (root) {
  "use strict";
  // 标准调弦：1 弦最细（E4），6 弦最粗（E2）
  var OPEN = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
  var STRING_NAME = { 1: "E", 2: "B", 3: "G", 4: "D", 5: "A", 6: "E" };
  var NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var SOLF = { C: "do", D: "re", E: "mi", F: "fa", G: "sol", A: "la", B: "si" };

  /* 和弦库：frets 从 6 弦写到 1 弦，-1 = 不弹（×），0 = 空弦；fingers 同顺序，0 = 不用按 */
  var CHORDS = {
    "C":  { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], name: "C 大三和弦" },
    "G":  { frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3], name: "G 大三和弦" },
    "D":  { frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], name: "D 大三和弦" },
    "A":  { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0], name: "A 大三和弦" },
    "E":  { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], name: "E 大三和弦" },
    "Em": { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], name: "E 小三和弦" },
    "Am": { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], name: "A 小三和弦" },
    "Dm": { frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], name: "D 小三和弦" },
    "G7": { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1], name: "G 属七和弦" },
    "D7": { frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3], name: "D 属七和弦" },
    "A7": { frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0], name: "A 属七和弦" },
    "E7": { frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0], name: "E 属七和弦" },
    "F":  { frets: [-1, -1, 3, 2, 1, 1], fingers: [0, 0, 3, 2, 1, 1], name: "F 大三和弦（简易小横按）", barre: 1 }
  };
  function chordMidis(name) {
    var c = CHORDS[name]; if (!c) return [];
    var out = [];
    for (var i = 0; i < 6; i++) { var s = 6 - i, f = c.frets[i]; if (f >= 0) out.push(OPEN[s] + f); }
    return out;
  }

  function midiName(m) { return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }
  function midiFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function meterBeats(meter) { var p = meter.split("/"); return (+p[0] * 4) / +p[1]; }

  var VALID = { 1: 1, 2: 1, 3: 1, 4: 1, 6: 1, 8: 1, 12: 1, 16: 1, 24: 1, 32: 1 };

  /* 单音旋律："3.0:2 2.1 r:0.5 ..."（弦.品:拍数，~ = 连到下一个同音）。返回 { events, bars, errors, total } */
  function parseTab(str, meter) {
    var res = { events: [], bars: [], errors: [] };
    if (!str || !str.trim()) { res.total = 0; return res; }
    var full = meterBeats(meter), t = 0;
    var bars = str.split("|").map(function (b) { return b.trim(); });
    if (bars.length && bars[bars.length - 1] === "") bars.pop();
    bars.forEach(function (bs, bi) {
      var b0 = t;
      bs.split(/\s+/).filter(Boolean).forEach(function (tok) {
        var m = /^(r|[1-6]\.\d{1,2})(?::([\d.]+))?(~)?$/.exec(tok);
        if (!m) { res.errors.push("第" + (bi + 1) + "小节无法识别：" + tok); return; }
        var dur = m[2] ? parseFloat(m[2]) : 1, u = Math.round(dur * 8);
        if (Math.abs(u - dur * 8) > 1e-6 || !VALID[u]) res.errors.push("第" + (bi + 1) + "小节时值不能单独表示：" + tok);
        var ev = { start: t, dur: dur, units: u, bar: bi, tie: !!m[3], rest: m[1] === "r" };
        if (!ev.rest) {
          var sf = m[1].split("."); ev.string = +sf[0]; ev.fret = +sf[1]; ev.midi = OPEN[ev.string] + ev.fret;
        }
        var prev = res.events[res.events.length - 1];
        if (prev && prev.tie && !ev.rest && prev.midi === ev.midi) ev.tiedFrom = true;
        res.events.push(ev); t += dur;
      });
      var len = t - b0; res.bars.push({ start: b0, len: len });
      if (Math.abs(len - full) > 1e-6 && !((bi === 0 || bi === bars.length - 1) && len < full)) res.errors.push("第" + (bi + 1) + "小节拍数为 " + len + "，应为 " + full);
    });
    res.total = t;
    return res;
  }

  /* 和弦进行："G:4 | C:2 G:2 | r:3 ..."；返回 { segs:[{chord,start,dur,bar}], bars, errors } */
  function parseChords(str, meter) {
    var res = { segs: [], bars: [], errors: [] };
    if (!str || !str.trim()) return res;
    var full = meterBeats(meter), t = 0;
    var bars = str.split("|").map(function (b) { return b.trim(); });
    if (bars.length && bars[bars.length - 1] === "") bars.pop();
    bars.forEach(function (bs, bi) {
      var b0 = t;
      bs.split(/\s+/).filter(Boolean).forEach(function (tok) {
        var m = /^([A-G][#b]?m?7?|r)(?::([\d.]+))?$/.exec(tok);
        if (!m) { res.errors.push("和弦第" + (bi + 1) + "小节无法识别：" + tok); return; }
        if (m[1] !== "r" && !CHORDS[m[1]]) res.errors.push("和弦库里没有：" + m[1]);
        var dur = m[2] ? parseFloat(m[2]) : full;
        res.segs.push({ chord: m[1] === "r" ? null : m[1], start: t, dur: dur, bar: bi });
        t += dur;
      });
      var len = t - b0; res.bars.push({ start: b0, len: len });
      if (Math.abs(len - full) > 1e-6 && !((bi === 0 || bi === bars.length - 1) && len < full)) res.errors.push("和弦第" + (bi + 1) + "小节拍数为 " + len + "，应为 " + full);
    });
    res.total = t;
    return res;
  }

  /* 扫弦节奏：每拍的扫法，如 "D D D D" 或 "D DU DU DU"（D=向下 U=向上，一拍内两个 = 八分） */
  function strumTimes(pattern, meter, barStart, barLen) {
    var beats = (pattern || "").trim().split(/\s+/).filter(Boolean), out = [];
    var beatLen = /\/8$/.test(meter) ? 0.5 : 1;
    if (!beats.length) { for (var b = 0; b < barLen; b += beatLen) out.push({ t: barStart + b, dir: "D" }); return out; }
    var per = barLen / beats.length;
    beats.forEach(function (bt, i) {
      var n = bt.length;
      for (var k = 0; k < n; k++) { var c = bt.charAt(k); if (c === "D" || c === "U") out.push({ t: barStart + i * per + k * per / n, dir: c }); }
    });
    return out;
  }

  /* ───── 绘制 ───── */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* 和弦图（竖线 = 弦，左粗右细；横线 = 品丝；圆点 = 按的位置，数字 = 手指） */
  function chordSVG(name, size, opts) {
    opts = opts || {};
    var c = CHORDS[name]; if (!c) return "";
    var W = size || 90, sx = W / 7, H = W * 1.25, top = W * 0.42, fy = (H - top - W * 0.08) / 4.2;
    var s = '<svg class="cd" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(name) + ' 和弦图">';
    s += '<text x="' + W / 2 + '" y="' + (W * 0.2) + '" class="cd-n" font-size="' + (W * 0.2) + '">' + esc(name) + "</text>";
    var x0 = sx, y0 = top;
    s += '<rect x="' + x0 + '" y="' + (y0 - W * 0.035) + '" width="' + sx * 5 + '" height="' + W * 0.045 + '" class="cd-nut"/>';
    for (var i = 0; i < 6; i++) s += '<line x1="' + (x0 + i * sx) + '" y1="' + y0 + '" x2="' + (x0 + i * sx) + '" y2="' + (y0 + fy * 4) + '" class="cd-s"/>';
    for (var f = 1; f <= 4; f++) s += '<line x1="' + x0 + '" y1="' + (y0 + f * fy) + '" x2="' + (x0 + 5 * sx) + '" y2="' + (y0 + f * fy) + '" class="cd-f"/>';
    if (c.barre) {
      var bs = c.frets.map(function (v, k) { return v === c.barre ? k : -1; }).filter(function (k) { return k >= 0; });
      if (bs.length > 1) s += '<rect x="' + (x0 + bs[0] * sx - sx * 0.3) + '" y="' + (y0 + (c.barre - 0.5) * fy - sx * 0.3) + '" width="' + ((bs[bs.length - 1] - bs[0]) * sx + sx * 0.6) + '" height="' + sx * 0.6 + '" rx="' + sx * 0.3 + '" class="cd-dot"/>';
    }
    c.frets.forEach(function (fr, k) {
      var x = x0 + k * sx;
      if (fr < 0) s += '<text x="' + x + '" y="' + (y0 - W * 0.06) + '" class="cd-o" font-size="' + (W * 0.13) + '">×</text>';
      else if (fr === 0) s += '<circle cx="' + x + '" cy="' + (y0 - W * 0.1) + '" r="' + W * 0.045 + '" class="cd-open"/>';
      else {
        var y = y0 + (fr - 0.5) * fy;
        s += '<circle cx="' + x + '" cy="' + y + '" r="' + sx * 0.36 + '" class="cd-dot"/>';
        if (opts.fingers !== false && c.fingers[k]) s += '<text x="' + x + '" y="' + (y + sx * 0.14) + '" class="cd-fn" font-size="' + (sx * 0.5) + '">' + c.fingers[k] + "</text>";
      }
    });
    return s + "</svg>";
  }

  /* 六线谱。song: {meter}; mode: "melody" | "chords"。返回 { svg, lines } —— svg 里每个音 <g class="ev" data-i>，每个和弦段 <g class="cs" data-c> */
  function tabSVG(song, P, mode, width, opts) {
    opts = opts || {};
    var meter = song.meter, full = meterBeats(meter);
    var bars = (mode === "melody" ? P.tab.bars : P.chords.bars);
    if (!bars.length) bars = P.chords.bars.length ? P.chords.bars : P.tab.bars;
    var big = opts.big ? 1.15 : 1;
    var S = 19 * big, NUM = 18 * big, LEFT = 30, padR = 8;
    var per = width < 520 ? 2 : width < 820 ? 3 : 4;
    var barW = (width - LEFT - padR) / per;
    var chordH = opts.diagrams === false ? 26 : 80, tabTop = chordH + 6, tabH = S * 5, rhyH = 30, lyrH = P.lyr ? 28 * big : 0;
    var lineH = tabTop + tabH + rhyH + lyrH + 28;
    var nLines = Math.ceil(bars.length / per), H = nLines * lineH + 6;
    var s = '<svg class="tab" viewBox="0 0 ' + width + " " + H + '" width="' + width + '" height="' + H + '">';
    var xOf = function (bi, t) { // 拍位置 → x
      var line = Math.floor(bi / per), col = bi % per, bar = bars[bi];
      var bx = LEFT + col * barW, inner = barW - 26;
      var frac = bar.len ? (t - bar.start) / Math.max(bar.len, full * 0.5) : 0;
      return { x: bx + 16 + frac * inner, y: line * lineH };
    };
    for (var L = 0; L < nLines; L++) {
      var y0 = L * lineH + tabTop, nb = Math.min(per, bars.length - L * per), x1 = LEFT + nb * barW;
      for (var k = 0; k < 6; k++) s += '<line x1="' + LEFT + '" y1="' + (y0 + k * S) + '" x2="' + x1 + '" y2="' + (y0 + k * S) + '" class="tl"/>';
      s += '<text x="' + (LEFT - 18) + '" y="' + (y0 + S * 1.2) + '" class="tclef">T</text><text x="' + (LEFT - 18) + '" y="' + (y0 + S * 2.6) + '" class="tclef">A</text><text x="' + (LEFT - 18) + '" y="' + (y0 + S * 4) + '" class="tclef">B</text>';
      for (var b = 0; b <= nb; b++) { var bx = LEFT + b * barW; s += '<line x1="' + bx + '" y1="' + y0 + '" x2="' + bx + '" y2="' + (y0 + 5 * S) + '" class="' + (L * per + b === bars.length ? "tbe" : "tb") + '"/>'; }
      if (L === 0) s += '<text x="' + (LEFT + 3) + '" y="' + (y0 - 4) + '" class="tmeter">' + esc(meter) + "</text>";
    }
    // 和弦（名字 + 小和弦图），每次换和弦时画
    var last = null;
    P.chords.segs.forEach(function (sg, ci) {
      if (!sg.chord) { last = null; return; }
      var p = xOf(sg.bar, sg.start), y = p.y;
      var show = sg.chord !== last || mode === "chords";
      last = sg.chord;
      s += '<g class="cs" data-c="' + ci + '">';
      if (show) {
        if (opts.diagrams === false) s += '<text x="' + p.x + '" y="' + (y + 20) + '" class="cname">' + esc(sg.chord) + "</text>";
        else s += '<g transform="translate(' + (p.x - 30) + "," + (y + 4) + ')">' + chordSVG(sg.chord, 60).replace('<svg class="cd"', '<svg class="cd mini"') + "</g>";
      }
      s += "</g>";
    });
    if (mode === "melody") {
      P.tab.events.forEach(function (ev, i) {
        var p = xOf(ev.bar, ev.start), y0 = p.y + tabTop;
        s += '<g class="ev" data-i="' + i + '">';
        if (!ev.rest) {
          var yy = y0 + (ev.string - 1) * S, txt = ev.tiedFrom ? "(" + ev.fret + ")" : String(ev.fret);
          var w = txt.length * NUM * 0.62 + 6;
          s += '<rect x="' + (p.x - w / 2) + '" y="' + (yy - NUM * 0.62) + '" width="' + w + '" height="' + NUM * 1.24 + '" rx="4" class="nb"/>';
          s += '<text x="' + p.x + '" y="' + (yy + NUM * 0.36) + '" class="nf" font-size="' + NUM + '">' + txt + "</text>";
        }
        s += rhythm(ev, p.x, y0 + 5 * S + 4, ev.rest);
        if (P.lyr && P.lyr[i]) s += '<text x="' + p.x + '" y="' + (y0 + 5 * S + rhyH + lyrH * 0.75) + '" class="lyr" font-size="' + (15 * big) + '">' + esc(P.lyr[i]) + "</text>";
        s += "</g>";
      });
    } else {
      P.chords.segs.forEach(function (sg, ci) {
        var times = strumTimes(song.strum, meter, sg.start, sg.dur);
        times.forEach(function (st) {
          var p = xOf(sg.bar, st.t), y0 = p.y + tabTop;
          s += '<g class="st" data-c="' + ci + '">';
          if (sg.chord) {
            var a = st.dir === "D" ? y0 + 1 : y0 + 5 * S - 1, b2 = st.dir === "D" ? y0 + 5 * S - 1 : y0 + 1;
            s += '<line x1="' + p.x + '" y1="' + a + '" x2="' + p.x + '" y2="' + b2 + '" class="arrow"/>';
            var hy = b2, d = st.dir === "D" ? -1 : 1;
            s += '<path d="M' + (p.x - 6) + " " + (hy + d * 9) + " L" + p.x + " " + hy + " L" + (p.x + 6) + " " + (hy + d * 9) + '" class="arrowh"/>';
            s += '<text x="' + p.x + '" y="' + (y0 + 5 * S + 20) + '" class="sdir">' + (st.dir === "D" ? "↓" : "↑") + "</text>";
          }
          s += "</g>";
        });
        if (P.barLyr && sg === firstSegOfBar(P.chords.segs, sg.bar)) {
          var p0 = xOf(sg.bar, P.chords.bars[sg.bar].start);
          s += '<text x="' + (p0.x - 8) + '" y="' + (p0.y + tabTop + 5 * S + rhyH + lyrH * 0.75) + '" class="lyr bl" font-size="' + (15 * big) + '">' + esc(P.barLyr[sg.bar] || "") + "</text>";
        }
      });
    }
    return { svg: s + "</svg>", per: per };
  }
  function firstSegOfBar(segs, bar) { for (var i = 0; i < segs.length; i++) if (segs[i].bar === bar) return segs[i]; return null; }

  /* 节奏符干：画在六线谱下面 */
  function rhythm(ev, x, y, rest) {
    var d = ev.dur, s = "";
    if (rest) {
      return '<text x="' + x + '" y="' + (y + 18) + '" class="rest">' + (d >= 4 ? "▬" : d >= 2 ? "▬" : d >= 1 ? "𝄽" : "𝄾") + "</text>";
    }
    if (ev.tiedFrom) return "";
    var base = d >= 4 ? 4 : d >= 2 ? 2 : d >= 1 ? 1 : d >= 0.5 ? 0.5 : 0.25;
    var dotted = Math.abs(d - base * 1.5) < 1e-6;
    if (base >= 4) return '<text x="' + x + '" y="' + (y + 16) + '" class="rest">4拍</text>';
    var len = base >= 2 ? 12 : 20;
    s += '<line x1="' + x + '" y1="' + y + '" x2="' + x + '" y2="' + (y + len) + '" class="stem"/>';
    if (base <= 0.5) s += '<path d="M' + x + " " + (y + len) + " l7 -5" + '" class="flag"/>';
    if (base <= 0.25) s += '<path d="M' + x + " " + (y + len - 5) + " l7 -5" + '" class="flag"/>';
    if (dotted) s += '<circle cx="' + (x + 5) + '" cy="' + (y + len - 2) + '" r="1.8" class="dot"/>';
    return s;
  }

  /* 指板（横放：上面 1 弦，下面 6 弦；0–5 品） */
  function fretboardSVG(width) {
    var frets = 6, W = Math.max(300, width), H = 150, L = 34, R = 10, top = 16, gap = (H - top - 24) / 5;
    var fw = (W - L - R) / frets;
    var s = '<svg class="fb" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '">';
    s += '<rect x="' + L + '" y="' + (top - 6) + '" width="' + (W - L - R) + '" height="' + (gap * 5 + 12) + '" class="fb-wood" rx="4"/>';
    for (var f = 0; f <= frets; f++) { var x = L + f * fw; s += '<line x1="' + x + '" y1="' + (top - 6) + '" x2="' + x + '" y2="' + (top + gap * 5 + 6) + '" class="' + (f === 0 ? "fb-nut" : "fb-fret") + '"/>'; if (f > 0) s += '<text x="' + (L + (f - 0.5) * fw) + '" y="' + (H - 4) + '" class="fb-num">' + f + "</text>"; }
    [3, 5].forEach(function (f) { s += '<circle cx="' + (L + (f - 0.5) * fw) + '" cy="' + (top + gap * 2.5) + '" r="5" class="fb-inlay"/>'; });
    for (var st = 1; st <= 6; st++) {
      var y = top + (st - 1) * gap;
      s += '<line x1="' + L + '" y1="' + y + '" x2="' + (W - R) + '" y2="' + y + '" class="fb-str" stroke-width="' + (0.8 + st * 0.35) + '"/>';
      s += '<text x="' + (L - 16) + '" y="' + (y + 5) + '" class="fb-sn">' + st + "</text>";
      for (f = 0; f <= frets - 1; f++) {
        var cx = f === 0 ? L - 4 : L + (f - 0.5) * fw;
        s += '<circle data-sf="' + st + "." + f + '" cx="' + cx + '" cy="' + y + '" r="' + Math.min(11, gap * 0.42) + '" class="fb-dot"/>';
      }
    }
    return s + '<text x="' + (L - 4) + '" y="' + (H - 4) + '" class="fb-num">0</text></svg>';
  }
  /* 某个 MIDI 音在 0–5 品里的位置（优先低品、细弦） */
  function positionsOf(m) {
    var out = [];
    for (var st = 1; st <= 6; st++) { var f = m - OPEN[st]; if (f >= 0 && f <= 5) out.push(st + "." + f); }
    return out;
  }

  var api = {
    OPEN: OPEN, STRING_NAME: STRING_NAME, CHORDS: CHORDS, NAMES: NAMES, SOLF: SOLF,
    chordMidis: chordMidis, midiName: midiName, midiFreq: midiFreq, meterBeats: meterBeats,
    parseTab: parseTab, parseChords: parseChords, strumTimes: strumTimes,
    chordSVG: chordSVG, tabSVG: tabSVG, fretboardSVG: fretboardSVG, positionsOf: positionsOf
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Guitar = api;
})(typeof window !== "undefined" ? window : this);
