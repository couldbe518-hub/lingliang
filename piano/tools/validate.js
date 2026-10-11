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
  const rh = M.parseHand(s.rh, s.meter), lh = M.parseHand(s.lh, s.meter);
  rh.errors.forEach(e => errs.push("右手 " + e));
  lh.errors.forEach(e => errs.push("左手 " + e));
  if (rh.events.length && lh.events.length) {
    if (rh.bars.length !== lh.bars.length) errs.push(`两手小节数不同：右手 ${rh.bars.length}，左手 ${lh.bars.length}`);
    else rh.bars.forEach((b, i) => { if (Math.abs(b.len - lh.bars[i].len) > 1e-6) errs.push(`第${i + 1}小节两手拍数不同：${b.len} / ${lh.bars[i].len}`); });
  }
  const all = rh.events.concat(lh.events).flatMap(e => e.pitches.map(p => p.midi));
  const lo = Math.min(...all), hi = Math.max(...all);
  console.log(`${errs.length ? "✗" : "✓"} ${s.id.padEnd(18)} ${s.title}  音域 ${M.midiToName(lo)}–${M.midiToName(hi)}  小节 ${Math.max(rh.bars.length, lh.bars.length)}`);
  errs.forEach(e => console.log("    " + e));
  bad += errs.length;
}
console.log(bad ? `\n共 ${bad} 个问题` : `\n全部 ${songs.length} 首通过`);
process.exit(bad ? 1 : 0);
