// 用法：node piano/tools/validate.js —— 检查 data.js 里每首曲子的小节拍数、时值、两手长度
const path = require("path");
const M = require(path.join(__dirname, "..", "music.js"));
global.window = {};
require(path.join(__dirname, "..", "data.js"));
const songs = window.PIANO_DATA.songs;
let bad = 0;
const ids = new Set();
for (const s of songs) {
  const errs = [];
  if (ids.has(s.id)) errs.push("id 重复"); ids.add(s.id);
  if (!M.KEYS[s.key]) errs.push("不支持的调：" + s.key);
  const NAME = { rh: "右手", rh2: "右手第二声部", lh: "左手", lh2: "左手第二声部" };
  const P = {};
  for (const k of Object.keys(NAME)) { P[k] = M.parseHand(s[k] || "", s.meter); P[k].errors.forEach(e => errs.push(NAME[k] + " " + e)); }
  const used = Object.keys(P).filter(k => P[k].events.length);
  const ref = P[used[0]];
  for (const k of used.slice(1)) {
    const o = P[k];
    if (o.bars.length !== ref.bars.length) errs.push(`${NAME[k]}小节数 ${o.bars.length}，与${NAME[used[0]]} ${ref.bars.length} 不同`);
    else ref.bars.forEach((b, i) => { if (Math.abs(b.len - o.bars[i].len) > 1e-6) errs.push(`第${i + 1}小节拍数不同：${NAME[used[0]]} ${b.len} / ${NAME[k]} ${o.bars[i].len}`); });
  }
  const rh = P.rh, lh = P.lh;
  const all = used.flatMap(k => P[k].events).flatMap(e => e.pitches.map(p => p.midi));
  const lo = Math.min(...all), hi = Math.max(...all);
  console.log(`${errs.length ? "✗" : "✓"} ${s.id.padEnd(18)} ${s.title}  音域 ${M.midiToName(lo)}–${M.midiToName(hi)}  小节 ${Math.max(rh.bars.length, lh.bars.length)}`);
  errs.forEach(e => console.log("    " + e));
  bad += errs.length;
}
console.log(bad ? `\n共 ${bad} 个问题` : `\n全部 ${songs.length} 首通过`);
process.exit(bad ? 1 : 0);
