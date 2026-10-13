// 列出播放器和教练会念的全部句子（语音包要覆盖的内容），输出 JSON 数组。
// 用法：node stretch/tools/voice_lines.js > lines.json   （make_voice.py 会自动调用）
global.window = {}; global.performance = { now: () => 0 };
require("../figure.js"); require("../data.js");
var D = window.STRETCH, sp = D.spoken, out = [];
function key(t) { return String(t).trim().replace(/[，。、；：！？,.!?;:\s]+$/, ""); }
function add(t) { t = key(sp(t)); if (t && out.indexOf(t) < 0) out.push(t); }
var CN = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
function cnum(n) { if (n <= 10) return CN[n]; if (n < 20) return "十" + CN[n - 10]; var t = Math.floor(n / 10), o = n % 10; return CN[t] + "十" + (o ? CN[o] : ""); }
Object.keys(D.LINES).forEach(function (k) { [].concat(D.LINES[k]).forEach(add); });
Object.keys(D.PRAISE).forEach(function (k) { add(D.PRAISE[k]); });
D.EX.forEach(function (e) { add(e.name); add(e.basic.how); add(e.adv.how); add(e.adv.name); e.cues.forEach(add); (e.adv.cues || []).forEach(add); });
function qnum(n) { return n === 2 ? "两" : cnum(n); }
// 与 sound.js 的 NUM 保持一致
for (var n = 1; n <= 60; n++) { add("第" + cnum(n) + "次"); add("坚持了" + qnum(n) + "秒"); if (n > 1) add("已经连续" + qnum(n) + "天"); }
console.log(JSON.stringify(out, null, 0));
