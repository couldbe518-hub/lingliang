// 用法：node guitar/tools/validate.js —— 检查每首曲子的拍数、和弦、歌词字数
const path = require("path");
const G = require(path.join(__dirname, "..", "guitar.js"));
global.window = {}; require(path.join(__dirname, "..", "data.js"));
let bad = 0;
for (const s of window.GUITAR_DATA.songs) {
  const errs = [];
  const t = G.parseTab(s.melody, s.meter), c = G.parseChords(s.chords, s.meter);
  t.errors.forEach(e => errs.push("旋律 " + e)); c.errors.forEach(e => errs.push(e));
  if (t.events.length && c.segs.length && t.bars.length !== c.bars.length) errs.push(`旋律 ${t.bars.length} 小节，和弦 ${c.bars.length} 小节`);
  const maxF = Math.max(0, ...t.events.filter(e => !e.rest).map(e => e.fret));
  if (s.lyrics) {
    const n = t.events.filter(e => !e.rest && !e.tiedFrom).length, k = s.lyrics.split(/\s+/).length;
    if (n !== k) errs.push(`歌词 ${k} 个，音 ${n} 个`);
  }
  console.log(`${errs.length ? "✗" : "✓"} ${s.id.padEnd(16)} ${s.title}  最高 ${maxF} 品  ${t.bars.length || c.bars.length} 小节${s.lyrics ? "  有歌词" : ""}`);
  errs.forEach(e => console.log("    " + e)); bad += errs.length;
}
console.log(bad ? `\n共 ${bad} 个问题` : `\n全部 ${window.GUITAR_DATA.songs.length} 首通过`);
process.exit(bad ? 1 : 0);
