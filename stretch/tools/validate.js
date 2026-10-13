// 检查 data.js：动作字段齐全、计划引用的动作存在、示范姿势能正常计算。
// 用法：node stretch/tools/validate.js
global.window = {}; global.performance = { now: () => 0 };
require("../figure.js"); require("../data.js");
var D = window.STRETCH, F = window.Figure, errs = [], ids = {};
var KINDS = ["static", "dynamic", "strength", "breath", "nerve"];
D.EX.forEach(function (e) {
  var w = function (m) { errs.push(e.id + ": " + m); };
  if (ids[e.id]) w("id 重复"); ids[e.id] = 1;
  ["name", "en", "pi", "why", "care"].forEach(function (k) { if (!e[k]) w("缺少 " + k); });
  if (KINDS.indexOf(e.kind) < 0) w("kind 不对");
  if (["both", "each"].indexOf(e.side) < 0) w("side 不对");
  if (e.d == null && e.r == null) w("需要 d（秒）或 r（次数）");
  if (e.r != null && !e.tempo) w("有 r 时需要 tempo");
  if (!e.basic || !e.basic.how || !e.adv || !e.adv.how) w("basic / adv 说明不全");
  if (!e.cues || e.cues.length < 2) w("cues 至少 2 条");
  if (e.adv && e.adv.cues && e.adv.cues.length < 2) w("adv.cues 至少 2 条");
  (e.area || []).forEach(function (a) { if (!D.AREAS[a]) w("未知部位 " + a); });
  ["basic", "adv"].forEach(function (lv) {
    var v = F.variant(e, lv);
    if (!v.kf || !v.kf.length) return w(lv + " 没有关键帧");
    v.kf.forEach(function (p, i) { var j = F.joints(p, v.view); if (!isFinite(j.L1.T[0]) || !isFinite(j.A1.W[1])) w(lv + " 关键帧 " + i + " 有非数字"); });
    if (!isFinite(v._dx)) w(lv + " 居中计算失败");
  });
});
D.ROUTINES.forEach(function (r) {
  if (!r.items.length) errs.push(r.id + ": 空计划");
  r.items.forEach(function (it) { if (!ids[it[0]]) errs.push(r.id + ": 引用了不存在的动作 " + it[0]); });
});
if (errs.length) { console.log(errs.join("\n")); process.exit(1); }
console.log("OK：" + D.EX.length + " 个动作，" + D.ROUTINES.length + " 套计划");
