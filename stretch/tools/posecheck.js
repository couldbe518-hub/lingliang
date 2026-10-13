// 姿势体检：逐帧算出哪些部位着地、关键关节角度，用来核对示范是否符合标准动作。
// 用法：node stretch/tools/posecheck.js [id,id2,...]
global.window = {}; global.performance = { now: () => 0 };
require("../figure.js"); require("../data.js");
var F = window.Figure, D = window.STRETCH, only = (process.argv[2] || "").split(",").filter(Boolean);
var GROUND = 214;
function ang(a, b, c) { var v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]]; var d = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]) || 1); return Math.round(Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI); }
function report(ex, lv) {
  var v = F.variant(ex, lv);
  v.kf.forEach(function (p, i) {
    var j = F.joints(p, v.view);
    // 与 figure.js 相同的落地规则
    var pts = { 骨盆: [j.P, 8], 肩: [j.S, 8], 头: [j.Hd, 10], 肘1: [j.A1.E, 3], 手1: [j.A1.W, 4], 肘2: [j.A2.E, 3], 手2: [j.A2.W, 4],
      膝1: [j.L1.K, 5], 踝1: [j.L1.A, 4], 趾1: [j.L1.T, 3], 跟1: [j.L1.Hl, 4], 膝2: [j.L2.K, 5], 踝2: [j.L2.A, 4], 趾2: [j.L2.T, 3], 跟2: [j.L2.Hl, 4] };
    var low = -1e9; for (var k in pts) low = Math.max(low, pts[k][0][1] + pts[k][1]);
    var touch = [], h = {};
    for (k in pts) { var gap = low - (pts[k][0][1] + pts[k][1]); h[k] = Math.round(gap); if (gap < 3) touch.push(k); }
    var out = "  " + lv + i + " 着地[" + touch.join(" ") + "]";
    out += " 高度 骨盆" + h["骨盆"] + " 肩" + h["肩"] + " 头" + h["头"];
    out += " | 膝角 " + ang(j.L1.H, j.L1.K, j.L1.A) + "/" + ang(j.L2.H, j.L2.K, j.L2.A);
    out += " 髋角 " + ang(j.S, j.P, j.L1.K) + "/" + ang(j.S, j.P, j.L2.K);
    out += " 肘角 " + ang(j.A1.S, j.A1.E, j.A1.W) + "/" + ang(j.A2.S, j.A2.E, j.A2.W);
    out += " 肩角 " + ang(j.P, j.S, j.A1.E) + "/" + ang(j.P, j.S, j.A2.E);
    out += " 躯干" + Math.round(p.t) + (p.ts != null ? " ts" + p.ts : "");
    console.log(out);
  });
}
D.EX.filter(function (e) { return !only.length || only.indexOf(e.id) >= 0; }).forEach(function (ex) {
  console.log(ex.id + " " + ex.name + " (" + (ex.view || "side") + ")");
  report(ex, "basic");
  if (F.variant(ex, "adv") !== F.variant(ex, "basic")) report(ex, "adv");
});
