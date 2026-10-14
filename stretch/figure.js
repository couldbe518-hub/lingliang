/* 动作示范小人：用关节角度描述姿势，SVG 绘制，关键帧之间平滑插值。
 *
 * 角度约定（单位：度，全部是"绝对角度"，与上一节无关）：
 *   0 = 指向正下方，90 = 指向正前方（画面右侧），180 = 正上方，-90 / 270 = 身后（画面左侧）。
 *   侧视图里小人面朝右；前视图里小人面朝观众。
 * 姿势对象：
 *   t  躯干（骨盆→颈）角度，直立 = 180，仰卧头在左 = 270，俯卧头在右 = 90
 *   h  头部方向（发髻朝向），默认与躯干相同；n 颈部方向（头的位置），默认同 h
 *   pt 骨盆朝向（前视图），默认随躯干；侧弯时写 180 让骨盆保持水平
 *   ts 躯干长度缩放（< 1 表示身体朝向或背向观众，用于正面看四点跪等）
 *   a1 / a2  手臂 [上臂, 前臂, 上臂缩放, 前臂缩放]   侧视：1 = 近侧，2 = 远侧；前视：1 = 小人右手（画面左），2 = 左手
 *   l1 / l2  腿   [大腿, 小腿, 脚, 大腿缩放, 小腿缩放]  脚默认 = 小腿角度 + 90（侧视）
 * 缩放 < 1 用来表现肢体朝向/背向观众（透视缩短）。
 * 每帧自动"落地"：最低点贴地，所以写姿势时不用算高度。
 */
(function () {
  var LEN = { trunk: 50, neck: 7, head: 10, upper: 29, fore: 27, thigh: 43, shin: 41, foot: 15 };
  var W = 300, H = 230, GROUND = 214;

  function vec(a, len) { var r = a * Math.PI / 180; return [Math.sin(r) * len, Math.cos(r) * len]; }
  function add(p, v) { return [p[0] + v[0], p[1] + v[1]]; }
  function sc(arr, i) { return arr && arr[i] != null ? arr[i] : 1; }

  var STAND = { t: 180, a1: [0, 0], a2: [0, 0], l1: [0, 0], l2: [0, 0] };

  function norm(p) {
    var o = {};
    for (var k in STAND) o[k] = STAND[k];
    for (var j in p) o[j] = p[j];
    if (o.h == null) o.h = o.t;
    return o;
  }

  // 计算各关节坐标（骨盆在原点）
  function joints(p, view) {
    p = norm(p);
    var P = [0, 0];
    var tv = vec(p.t, 1), perp = [-tv[1], tv[0]];
    var ts = p.ts == null ? 1 : p.ts; // 躯干透视缩短（朝向/背向观众）
    var N = add(P, vec(p.t, LEN.trunk * ts));
    var S = add(P, vec(p.t, (LEN.trunk - 4) * ts));
    var Hd = add(N, vec(p.n == null ? p.h : p.n, (LEN.neck + LEN.head) * ts));
    var front = view === "front";
    var sw = front ? 13 : 0, hw = front ? 8 : 0;
    var S1 = add(S, [perp[0] * -sw, perp[1] * -sw]), S2 = add(S, [perp[0] * sw, perp[1] * sw]);
    var pv = vec(p.pt == null ? p.t : p.pt, 1), pp = [-pv[1], pv[0]]; // 骨盆朝向，默认随躯干；侧弯时骨盆保持水平
    var H1 = add(P, [pp[0] * -hw, pp[1] * -hw]), H2 = add(P, [pp[0] * hw, pp[1] * hw]);
    function arm(S0, a) {
      var E = add(S0, vec(a[0], LEN.upper * sc(a, 2)));
      var Wr = add(E, vec(a[1], LEN.fore * sc(a, 3)));
      return { S: S0, E: E, W: Wr, F: a[4] != null ? add(Wr, vec(a[4], 9)) : null };
    }
    function leg(H0, l, side) {
      var K = add(H0, vec(l[0], LEN.thigh * sc(l, 3)));
      var A = add(K, vec(l[1], LEN.shin * sc(l, 4)));
      var fa = l[2] != null ? l[2] : (front ? (side === 1 ? -100 : 100) : l[1] + 90);
      var fl = (front ? 7 : LEN.foot) * sc(l, 5);
      var T = add(A, vec(fa, fl));
      var Hl = front ? A : add(A, vec(fa, -4));
      return { H: H0, K: K, A: A, T: T, Hl: Hl };
    }
    return { P: P, N: N, S: S, Hd: Hd, t: p.t, h: p.h, c: p.c || 0, y: p.y || 0,
      A1: arm(S1, p.a1), A2: arm(S2, p.a2), L1: leg(H1, p.l1, 1), L2: leg(H2, p.l2, 2) };
  }

  function lowest(j) {
    var pts = [[j.P, 8], [j.S, 8], [j.Hd, LEN.head], [j.A1.E, 3], [j.A1.W, 4], [j.A2.E, 3], [j.A2.W, 4],
      [j.L1.K, 5], [j.L1.A, 4], [j.L1.T, 3], [j.L1.Hl, 4], [j.L2.K, 5], [j.L2.A, 4], [j.L2.T, 3], [j.L2.Hl, 4]];
    var m = -1e9;
    pts.forEach(function (q) { m = Math.max(m, q[0][1] + q[1]); });
    return m;
  }
  function bbox(j) {
    var xs = [j.P[0], j.S[0], j.Hd[0] - 10, j.Hd[0] + 10, j.A1.W[0], j.A2.W[0], j.A1.E[0], j.A2.E[0], j.L1.T[0], j.L2.T[0], j.L1.K[0], j.L2.K[0], j.L1.Hl[0], j.L2.Hl[0]];
    return [Math.min.apply(null, xs), Math.max.apply(null, xs)];
  }

  function lerp(a, b, k) { return a + (b - a) * k; }
  function fill(p, view) {
    p = norm(p);
    var o = { t: p.t, h: p.h };
    o.c = p.c || 0; o.y = p.y || 0; o.ts = p.ts == null ? 1 : p.ts; o.n = p.n == null ? p.h : p.n; o.pt = p.pt == null ? p.t : p.pt;
    ["a1", "a2"].forEach(function (k) { var a = p[k]; o[k] = [a[0], a[1], sc(a, 2), sc(a, 3), a[4] != null ? a[4] : null]; });
    ["l1", "l2"].forEach(function (k) {
      var l = p[k], foot = l[2];
      if (foot == null && view !== "front") foot = l[1] + 90;
      o[k] = [l[0], l[1], foot, sc(l, 3), sc(l, 4), sc(l, 5)];
    });
    return o;
  }
  function blend(p, q, k, view) {
    p = fill(p, view); q = fill(q, view);
    var o = { t: lerp(p.t, q.t, k), h: lerp(p.h, q.h, k), c: lerp(p.c, q.c, k), y: lerp(p.y, q.y, k), ts: lerp(p.ts, q.ts, k), n: lerp(p.n, q.n, k), pt: lerp(p.pt, q.pt, k) };
    ["a1", "a2", "l1", "l2"].forEach(function (s) {
      o[s] = p[s].map(function (x, i) { var y = q[s][i]; return x == null || y == null ? (x == null ? y : x) : lerp(x, y, k); });
    });
    return o;
  }
  function ease(k) { return k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }

  function line(a, b, cls, w) {
    return '<line class="' + cls + '" x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '"' + (w ? ' stroke-width="' + w + '"' : "") + "/>";
  }
  function poly(pts, cls, w) {
    return '<polyline class="' + cls + '" points="' + pts.map(function (q) { return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(" ") + '"' + (w ? ' stroke-width="' + w + '"' : "") + "/>";
  }

  // 道具：wall 墙、chair 椅子、strap 弹力带、ball 小球、bed 床、step 台阶、racket 球拍
  function drawProps(ex, j, dx, dy, stage) {
    var out = "", props = ex.props || {};
    function T(p) { return [p[0] + dx, p[1] + dy]; }
    if (stage === "back") {
      if (props.wall != null) {
        var wx = ex._wallX;
        out += '<rect class="prop-wall" x="' + wx.toFixed(1) + '" y="16" width="8" height="' + (GROUND - 15) + '" rx="2"/>';
      }
      if (props.chair) {
        var c = ex._chair;
        var bt = c.backTop != null ? c.backTop : c.seat - 40;
        out += '<path class="prop-chair" d="M' + c.x1.toFixed(1) + ' ' + c.seat.toFixed(1) + ' H' + c.x2.toFixed(1) + ' M' + c.x1.toFixed(1) + ' ' + c.seat.toFixed(1) + ' V' + GROUND + ' M' + c.x2.toFixed(1) + ' ' + c.seat.toFixed(1) + ' V' + GROUND + ' M' + c.bx.toFixed(1) + ' ' + c.seat.toFixed(1) + ' V' + bt.toFixed(1) + '"/>';
      }
      if (props.step) out += '<rect class="prop-step" x="' + ex._step.x + '" y="' + (GROUND - 12) + '" width="' + ex._step.w + '" height="12" rx="2"/>';
    } else {
      if (props.strap) {
        var hs = props.strap === 2 ? j.A2.W : j.A1.W, ft = props.strapLeg === 2 ? j.L2 : j.L1;
        var mid = [(ft.T[0] + ft.A[0]) / 2, (ft.T[1] + ft.A[1]) / 2];
        out += line(T(hs), T(mid), "prop-strap");
      }
      if (props.ball) { var fb = props.ball === 2 ? j.L2 : j.L1; var bm = [(fb.T[0] + fb.Hl[0]) / 2, GROUND - 5]; out += '<circle class="prop-ball" cx="' + (bm[0] + dx).toFixed(1) + '" cy="' + bm[1] + '" r="5"/>'; }
      if (props.racket) {
        var hand = props.racket === 2 ? j.A2 : j.A1;
        var d = [hand.W[0] - hand.E[0], hand.W[1] - hand.E[1]], L = Math.hypot(d[0], d[1]) || 1;
        var u = [d[0] / L, d[1] / L], tip = add(hand.W, [u[0] * 34, u[1] * 34]), neck = add(hand.W, [u[0] * 14, u[1] * 14]);
        var hc = add(hand.W, [u[0] * 25, u[1] * 25]);
        out += line(T(hand.W), T(neck), "prop-racket", 2.5);
        var ang = Math.atan2(u[1], u[0]) * 180 / Math.PI;
        out += '<ellipse class="prop-racket-head" cx="' + (hc[0] + dx).toFixed(1) + '" cy="' + (hc[1] + dy).toFixed(1) + '" rx="' + (props.racketBig ? 13 : 11) + '" ry="' + (props.racketBig ? 9 : 7) + '" transform="rotate(' + ang.toFixed(1) + " " + (hc[0] + dx).toFixed(1) + " " + (hc[1] + dy).toFixed(1) + ')"/>';
        void tip;
      }
    }
    return out;
  }

  // ───────── 解剖肌肉人（默认画风）─────────
  // 每段骨骼上按真实位置画出肌肉块（肌腹 + 肌纤维纹理 + 肌腱），目标肌肉用亮红色并轻微脉动。
  // 肌肉编号（肢体后缀 1/2 = 近侧/远侧，前视图 = 右/左）：
  //   腿 quad 股四头肌 · ham 腘绳肌 · adductor 内收肌 · hipflex 髂腰肌 · tfl 阔筋膜张肌 · calf 腓肠肌 · soleus 比目鱼肌 · tib 胫骨前肌 · sole 足底
  //   臂 delt 三角肌 · biceps 肱二头肌 · triceps 肱三头肌 · forearmF 前臂屈肌 · forearmE 前臂伸肌 · rotator 肩袖（后肩）
  //   躯干 pec 胸大肌 · pecmin 胸小肌 · abs 腹直肌 · oblique 腹斜肌 · lat 背阔肌 · erector 竖脊肌 · trap 斜方肌 · glute 臀大肌 · gmed 臀中肌 · neck 颈部
  var STYLE = "anatomy";
  function deg(u) { return Math.atan2(u[0], u[1]) * 180 / Math.PI; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function f1(x) { return x.toFixed(1); }
  function ptsPath(pts, close) { return "M" + pts.map(function (q) { return f1(q[0]) + " " + f1(q[1]); }).join(" L") + (close ? " Z" : ""); }
  // 平滑闭合路径（Catmull-Rom → 贝塞尔）
  function smooth(pts) {
    var n = pts.length, d = "M" + f1(pts[0][0]) + " " + f1(pts[0][1]);
    for (var i = 0; i < n; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      var c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += " C" + f1(c1[0]) + " " + f1(c1[1]) + " " + f1(c2[0]) + " " + f1(c2[1]) + " " + f1(p2[0]) + " " + f1(p2[1]);
    }
    return d + " Z";
  }
  function along(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

  function anatomySvg(ex, pose, T) {
    var view = ex.view || "side", front = view === "front";
    var j = joints(pose, view);
    var tg = {}; (ex.mus || []).forEach(function (k) { tg[k] = 1; });
    var out = { back: "", body: "", front: "" };
    function isT(name, n) { return tg[name] || (n != null && tg[name + n]); }
    function cls(name, n, far) { return "m" + (far ? " far" : "") + (isT(name, n) ? " tgt" : ""); }
    // 肌腹：沿骨段 a→b，在 side 侧（±1，相对 nrm）鼓起
    function belly(a, b, nrm, side, t0, t1, base0, base1, thick, c, inner, lines) {
      var N = 10, outer = [], inn = [], fib = [];
      for (var i = 0; i <= N; i++) {
        var t = t0 + (t1 - t0) * i / N, s = Math.sin(Math.PI * i / N);
        var base = base0 + (base1 - base0) * Math.max(0, Math.min(1, t));
        var p = along(a, b, t), o = (inner == null ? base * .15 : inner) + (base * .85 + thick) * s;
        var ii = (inner == null ? base * .15 : inner) * (0.6 + 0.4 * s);
        outer.push([p[0] + nrm[0] * side * o, p[1] + nrm[1] * side * o]);
        inn.push([p[0] + nrm[0] * side * ii, p[1] + nrm[1] * side * ii]);
      }
      var poly = outer.concat(inn.reverse()).map(T);
      var s1 = '<path class="' + c + '" d="' + ptsPath(poly, true) + '"/>';
      // 肌纤维纹理
      if (lines !== 0) {
        var L = lines || 3;
        for (var k = 1; k <= L; k++) {
          var fr = k / (L + 1), fl = [];
          for (var m = 1; m < N; m++) {
            var tt = t0 + (t1 - t0) * m / N, ss = Math.sin(Math.PI * m / N), bb = base0 + (base1 - base0) * Math.max(0, Math.min(1, tt));
            var pp = along(a, b, tt), ins = (inner == null ? bb * .15 : inner), oo = ins + ((bb * .85 + thick) * ss) * fr;
            fl.push(T([pp[0] + nrm[0] * side * oo, pp[1] + nrm[1] * side * oo]));
          }
          fib.push('<path class="fib" d="' + ptsPath(fl) + '"/>');
        }
      }
      return s1 + fib.join("");
    }
    // 肢体基底（深色"肌外膜"轮廓）
    function capsule(a, b, w0, w1, c) {
      var u = sub(b, a), L = Math.hypot(u[0], u[1]) || 1, n = [-u[1] / L, u[0] / L], pts = [];
      var ends = 6;
      for (var i = 0; i <= ends; i++) { var ang = Math.PI * i / ends; pts.push([b[0] + n[0] * w1 * Math.cos(ang) + u[0] / L * w1 * Math.sin(ang), b[1] + n[1] * w1 * Math.cos(ang) + u[1] / L * w1 * Math.sin(ang)]); }
      for (i = 0; i <= ends; i++) { ang = Math.PI * i / ends; pts.push([a[0] - n[0] * w0 * Math.cos(ang) - u[0] / L * w0 * Math.sin(ang), a[1] - n[1] * w0 * Math.cos(ang) - u[1] / L * w0 * Math.sin(ang)]); }
      return '<path class="' + c + '" d="' + smooth(pts.map(T)) + '"/>';
    }
    function tendon(a, b, nrm, side, t0, t1, off, w) {
      var p0 = along(a, b, t0), p1 = along(a, b, t1);
      return '<line class="tend" x1="' + f1(T([p0[0] + nrm[0] * side * off, 0])[0]) + '" y1="' + f1(T([0, p0[1] + nrm[1] * side * off])[1]) + '" x2="' + f1(T([p1[0] + nrm[0] * side * off, 0])[0]) + '" y2="' + f1(T([0, p1[1] + nrm[1] * side * off])[1]) + '" stroke-width="' + w + '"/>';
    }
    function antOfLimb(a, b) { return vec(deg(sub(b, a)) + 90, 1); }

    // ── 腿 ──
    function leg(L, n, far) {
      var s = "", H = L.H, K = L.K, A = L.A, ant = antOfLimb(H, K), antS = antOfLimb(K, A), f = far ? " far" : "";
      s += capsule(H, K, 8.5, 5.6, "base" + f) + capsule(K, A, 5.4, 3.2, "base" + f);
      if (!front) {
        s += belly(H, K, ant, -1, .1, .9, 8.5, 5.6, 2.6, cls("ham", n, far));
        s += belly(H, K, ant, 1, .04, .93, 8.5, 5.6, 3.4, cls("quad", n, far), null, 4);
        s += belly(H, K, ant, 1, -.02, .32, 8.5, 6.5, 1.2, cls("hipflex", n, far), 1.5, 2);
        s += belly(H, K, ant, -1, -.02, .5, 4, 3, 1.4, cls("adductor", n, far), 0, 2);
        s += belly(H, K, ant, 1, .0, .36, 4.5, 4, 1.5, cls("tfl", n, far), 3.2, 0);
        s += tendon(K, A, antS, 1, -.06, .14, 4.6, 2.4);
        s += belly(K, A, antS, -1, .3, .82, 4.8, 3.4, 2.2, cls("soleus", n, far), null, 2);
        s += belly(K, A, antS, -1, .02, .62, 5.2, 3.8, 4.2, cls("calf", n, far));
        s += belly(K, A, antS, 1, .08, .74, 5, 3.6, 1.4, cls("tib", n, far), null, 2);
        s += tendon(K, A, antS, -1, .72, 1, 2.6, 2);
      } else {
        // 正面：股四头肌在中间，内收肌在内侧，阔筋膜张肌在外上
        var med = (j.P[0] - H[0]) >= 0 ? 1 : -1, mn = [med, 0];
        var axisN = [-sub(K, H)[1], sub(K, H)[0]], al = Math.hypot(axisN[0], axisN[1]) || 1; axisN = [axisN[0] / al, axisN[1] / al];
        var sideMed = (axisN[0] * med) >= 0 ? 1 : -1;
        s += belly(H, K, axisN, sideMed, .0, .62, 7, 5, 1.6, cls("adductor", n, far), 0, 2);
        s += belly(H, K, axisN, -sideMed, .02, .4, 7.5, 6, 1.4, cls("tfl", n, far), 1, 2);
        s += belly(H, K, axisN, sideMed, .1, .95, 4, 3, 1.6, cls("quad", n, far), -3, 3);
        s += belly(H, K, axisN, -sideMed, .1, .95, 4, 3, 1.6, cls("quad", n, far), -3, 2);
        var axS = [-sub(A, K)[1], sub(A, K)[0]], aS = Math.hypot(axS[0], axS[1]) || 1; axS = [axS[0] / aS, axS[1] / aS];
        s += belly(K, A, axS, sideMed, .05, .6, 4.6, 3.4, 1.8, cls("calf", n, far), null, 2);
        s += belly(K, A, axS, -sideMed, .05, .7, 4.4, 3.2, 1.2, cls("tib", n, far), null, 2);
        void mn;
      }
      // 脚
      var Tt = L.T, Hl = L.Hl, fv = sub(Tt, Hl), fl = Math.hypot(fv[0], fv[1]) || 1, fn = [-fv[1] / fl, fv[0] / fl];
      // 脚背在小腿前侧方向
      var up = (fn[0] * antS[0] + fn[1] * antS[1]) < 0 ? 1 : -1;
      if (front) up = 1;
      var footPts = [along(Hl, Tt, -.1), [Hl[0] - fn[0] * up * 3.5, Hl[1] - fn[1] * up * 3.5], [A[0] - fn[0] * up * 4.5 + fv[0] / fl * 2, A[1] - fn[1] * up * 4.5 + fv[1] / fl * 2], [Tt[0] - fn[0] * up * 1.6, Tt[1] - fn[1] * up * 1.6], [Tt[0] + fn[0] * up * .8, Tt[1] + fn[1] * up * .8], along(Hl, Tt, .5)];
      s += '<path class="' + (isT("sole", n) ? "m tgt" : "base" + f) + '" d="' + smooth(footPts.map(T)) + '"/>';
      return s;
    }
    // ── 手臂 ──
    function arm(Ar, n, far) {
      var s = "", S0 = Ar.S, E = Ar.E, Wr = Ar.W, ant = antOfLimb(S0, E), antF = antOfLimb(E, Wr), f = far ? " far" : "";
      s += capsule(S0, E, 4.6, 3.6, "base" + f) + capsule(E, Wr, 3.6, 2.3, "base" + f);
      if (!front) {
        s += belly(S0, E, ant, -1, .14, .9, 4.6, 3.6, 2.4, cls("triceps", n, far));
        s += belly(S0, E, ant, 1, .24, .88, 4.6, 3.6, 2.2, cls("biceps", n, far));
        s += belly(E, Wr, antF, 1, .02, .62, 3.6, 2.4, 1.6, cls("forearmF", n, far), null, 2);
        s += belly(E, Wr, antF, -1, .02, .6, 3.6, 2.4, 1.5, cls("forearmE", n, far), null, 2);
      } else {
        var axN = [-sub(E, S0)[1], sub(E, S0)[0]], al = Math.hypot(axN[0], axN[1]) || 1; axN = [axN[0] / al, axN[1] / al];
        s += belly(S0, E, axN, 1, .2, .9, 3.8, 3, 1.8, cls("biceps", n, far), -1, 2);
        s += belly(S0, E, axN, -1, .15, .9, 3.8, 3, 1.8, cls("triceps", n, far), -1, 2);
        var axF = [-sub(Wr, E)[1], sub(Wr, E)[0]], af = Math.hypot(axF[0], axF[1]) || 1; axF = [axF[0] / af, axF[1] / af];
        s += belly(E, Wr, axF, 1, .02, .62, 3.2, 2.2, 1.2, cls("forearmF", n, far), null, 2);
        s += belly(E, Wr, axF, -1, .02, .6, 3.2, 2.2, 1.2, cls("forearmE", n, far), null, 2);
      }
      // 三角肌：肩头的帽子
      var dv = sub(E, S0), dl = Math.hypot(dv[0], dv[1]) || 1, dn = [-dv[1] / dl, dv[0] / dl];
      var cap = [];
      for (var i = 0; i < 10; i++) {
        var a = Math.PI * 2 * i / 10, r = 6.6, sx = Math.cos(a) * r, sy = Math.sin(a) * r * 1.25;
        var p = [S0[0] + dv[0] / dl * (sy * .9 + 6) + dn[0] * sx, S0[1] + dv[1] / dl * (sy * .9 + 6) + dn[1] * sx];
        cap.push(p);
      }
      s += '<path class="' + cls("delt", n, far) + '" d="' + smooth(cap.map(T)) + '"/>';
      for (var k = -1; k <= 1; k++) {
        var q0 = [S0[0] + dn[0] * k * 3.2 - dv[0] / dl * 1, S0[1] + dn[1] * k * 3.2 - dv[1] / dl * 1], q1 = [S0[0] + dn[0] * k * 2 + dv[0] / dl * 12, S0[1] + dn[1] * k * 2 + dv[1] / dl * 12];
        s += '<path class="fib" d="' + ptsPath([T(q0), T(q1)]) + '"/>';
      }
      if (front && isT("rotator", n)) { var rb = [S0[0] - dv[0] / dl * 2, S0[1] - dv[1] / dl * 2]; s += '<path class="m tgt" d="' + smooth([[rb[0] - 5, rb[1] - 2], [rb[0], rb[1] - 4], [rb[0] + 5, rb[1] - 2], [rb[0], rb[1] + 2]].map(T)) + '"/>'; }
      // 手
      var hv = sub(Wr, E), hl = Math.hypot(hv[0], hv[1]) || 1, hd = Ar.F ? Ar.F : [Wr[0] + hv[0] / hl * 7, Wr[1] + hv[1] / hl * 7];
      s += capsule(Wr, hd, 2.6, 2.2, "base" + f);
      return s;
    }
    // ── 躯干 ──
    function trunk() {
      var s = "", P = j.P, Sh = j.S, u = sub(Sh, P), L = Math.hypot(u[0], u[1]) || 1, ud = [u[0] / L, u[1] / L];
      var ant = front ? [-ud[1], ud[0]] : vec(deg(u) - 90, 1);
      var prof = front ? [[0, 11, 11], [.3, 10, 10], [.55, 10.5, 10.5], [.85, 13, 13], [1.05, 11, 11]]
        : [[-.12, 8, 9], [0, 10, 12], [.25, 8, 9], [.5, 8.5, 8.5], [.78, 11.5, 9.5], [1.0, 9, 9], [1.08, 5.5, 5.5]];
      var A = [], B = [];
      prof.forEach(function (r) {
        var p = along(P, Sh, r[0]); A.push([p[0] + ant[0] * r[1], p[1] + ant[1] * r[1]]); B.push([p[0] - ant[0] * r[2], p[1] - ant[1] * r[2]]);
      });
      // 侧视脊柱弯曲（猫牛式等）
      if (j.c) { var bk = vec(j.t + 90, j.c * 2); [A, B].forEach(function (arr) { arr.forEach(function (q, i) { var w = Math.sin(Math.PI * i / (arr.length - 1)); q[0] += bk[0] * w; q[1] += bk[1] * w; }); }); }
      s += '<path class="base" d="' + smooth(A.concat(B.reverse()).map(T)) + '"/>';
      var cv = j.c ? vec(j.t + 90, j.c * 2) : [0, 0];
      function bend(t) { var w = Math.sin(Math.PI * Math.max(0, Math.min(1, t))); return [cv[0] * w, cv[1] * w]; }
      function bl(side, t0, t1, b0, b1, th, c, inner, lines) {
        var off0 = bend(t0), off1 = bend(t1), a = along(P, Sh, t0), b = along(P, Sh, t1);
        var ta = (t0), tb = (t1);
        var aa = [P[0] + cv[0] * 0, P[1]], bb = [Sh[0], Sh[1]];
        void aa; void bb; void ta; void tb;
        // 把弯曲的平均偏移加到整个肌腹上（足够逼真）
        var mo = [(off0[0] + off1[0]) / 2, (off0[1] + off1[1]) / 2];
        var a2 = [a[0] + mo[0], a[1] + mo[1]], b2 = [b[0] + mo[0], b[1] + mo[1]];
        var tt = function (t) { return t; };
        void tt;
        return belly(a2, b2, ant, side, 0, 1, b0, b1, th, c, inner, lines);
      }
      if (!front) {
        s += bl(-1, .05, .75, 5, 5, 1.2, cls("erector"), 3.5, 2);
        s += bl(-1, .42, .86, 7, 8, 2.2, cls("lat"));
        s += bl(-1, .8, 1.12, 7, 5, 2, cls("trap"), null, 2);
        s += bl(1, .08, .62, 6, 6.5, 1.2, cls("abs"), 3.5, 0);
        s += bl(1, .12, .58, 4, 4, 1.4, cls("oblique"), 0, 3);
        s += bl(1, .58, .98, 8.5, 8, 2.8, cls("pec"));
        if (isT("pecmin")) s += bl(1, .7, .92, 6, 6, 1.6, "m tgt", 2.5, 2);
        if (isT("hipflex1") || isT("hipflex2") || isT("hipflex")) s += bl(1, -.08, .18, 8, 8, 1.4, "m tgt", 3, 2);
        // 腹直肌分节线
        for (var i = 1; i <= 3; i++) {
          var p = along(P, Sh, .12 + i * .12), mo = bend(.12 + i * .12);
          var a1 = [p[0] + mo[0] + ant[0] * 4.2, p[1] + mo[1] + ant[1] * 4.2], a2 = [p[0] + mo[0] + ant[0] * 7, p[1] + mo[1] + ant[1] * 7];
          s += '<path class="fib' + (isT("abs") ? " tgtl" : "") + '" d="' + ptsPath([T(a1), T(a2)]) + '"/>';
        }
      } else {
        var midN = ant;
        s += bl(1, .62, .98, 6, 6, 3.2, cls("pec"), 0.5, 3);
        s += bl(-1, .62, .98, 6, 6, 3.2, cls("pec"), 0.5, 3);
        s += bl(1, .1, .6, 3.5, 3.5, 1.2, cls("abs"), 0, 0);
        s += bl(-1, .1, .6, 3.5, 3.5, 1.2, cls("abs"), 0, 0);
        s += bl(1, .1, .62, 7.5, 7.5, 1.2, cls("oblique"), 5, 2);
        s += bl(-1, .1, .62, 7.5, 7.5, 1.2, cls("oblique"), 5, 2);
        s += bl(1, .45, .85, 9, 10, 1.2, cls("lat"), 8.5, 2);
        s += bl(-1, .45, .85, 9, 10, 1.2, cls("lat"), 8.5, 2);
        s += bl(1, .86, 1.1, 9, 4, 1.6, cls("trap"), 3, 2);
        s += bl(-1, .86, 1.1, 9, 4, 1.6, cls("trap"), 3, 2);
        for (var k2 = 1; k2 <= 3; k2++) { var pk = along(P, Sh, .12 + k2 * .12); s += '<path class="fib" d="' + ptsPath([T([pk[0] - midN[0] * 4, pk[1] - midN[1] * 4]), T([pk[0] + midN[0] * 4, pk[1] + midN[1] * 4])]) + '"/>'; }
      }
      return s;
    }
    // 侧视臀部（画在近侧大腿之上，臀桥等动作才看得见）
    function hips() {
      var P = j.P, Sh = j.S, u = sub(Sh, P), ant = vec(deg(u) - 90, 1);
      var cv = j.c ? vec(j.t + 90, j.c * 2) : [0, 0];
      function bl2(side, t0, t1, b0, b1, th, c, inner, lines) {
        var a = along(P, Sh, t0), b = along(P, Sh, t1), w = Math.sin(Math.PI * Math.max(0, Math.min(1, (t0 + t1) / 2)));
        return belly([a[0] + cv[0] * w, a[1] + cv[1] * w], [b[0] + cv[0] * w, b[1] + cv[1] * w], ant, side, 0, 1, b0, b1, th, c, inner, lines);
      }
      return bl2(-1, -.04, .2, 6.5, 6.5, 1.8, cls("gmed"), 5, 2) + bl2(-1, -.2, .3, 8, 8.5, 4, cls("glute"), 2, 4);
    }
    // 正面臀外侧（臀中肌/臀大肌），画在双腿之上
    function hipsFront() {
      if (!(isT("gmed") || isT("glute"))) return "";
      var P = j.P, Sh = j.S, u = sub(Sh, P), L = Math.hypot(u[0], u[1]) || 1, ant = [-u[1] / L, u[0] / L], r = "";
      [1, -1].forEach(function (sd) { r += belly(along(P, Sh, -.14), along(P, Sh, .16), ant, sd, 0, 1, 9, 9, 2.4, "m tgt", 6.5, 2); });
      return r;
    }
    // 后肩肩袖（冈下肌/小圆肌）：肩胛骨外缘的一条梭形
    function rotator(n) {
      var P = j.P, Sh = j.S, u = sub(Sh, P), ant = vec(deg(u) - 90, 1);
      if (front) return "";
      return belly(along(P, Sh, .66), along(P, Sh, .98), ant, -1, 0, 1, 6, 6, 2.6, "m" + (isT("rotator", 1) || isT("rotator", 2) ? " tgt" : ""), 2.5, 3);
    }
    // ── 头颈 ──
    function headNeck() {
      var s = "", Sh = j.S, Nk = j.N, Hd = j.Hd;
      var nv = sub(Hd, Sh), nl = Math.hypot(nv[0], nv[1]) || 1, nn = [-nv[1] / nl, nv[0] / nl];
      var neckPts = [[Sh[0] + nn[0] * 4.2, Sh[1] + nn[1] * 4.2], [Sh[0] - nn[0] * 4.2, Sh[1] - nn[1] * 4.2], [Hd[0] - nn[0] * 3.4, Hd[1] - nn[1] * 3.4], [Hd[0] + nn[0] * 3.4, Hd[1] + nn[1] * 3.4]];
      s += '<path class="' + cls("neck") + '" d="' + ptsPath(neckPts.map(T), true) + '"/>';
      s += '<path class="fib' + (isT("neck") ? " tgtl" : "") + '" d="' + ptsPath([T(along(Sh, Hd, .1)), T(along(Sh, Hd, .7))]) + '"/>';
      void Nk;
      var hd = T(Hd), hb = vec(j.h + 90 + 25, LEN.head + 2.5), up = vec(j.h, LEN.head + 3);
      var bun = front ? [hd[0] + up[0], hd[1] + up[1]] : [hd[0] + hb[0], hd[1] + hb[1]];
      s += '<circle class="ahair" cx="' + f1(bun[0]) + '" cy="' + f1(bun[1]) + '" r="5.6"/>';
      s += '<circle class="skull" cx="' + f1(hd[0]) + '" cy="' + f1(hd[1]) + '" r="' + LEN.head + '"/>';
      if (!front) {
        // 侧脸：小鼻尖 + 耳朵，显示朝向
        var fwd = vec(j.h - 90, 1), dn = vec(j.h, 1), R = LEN.head;
        var nb = [[hd[0] + fwd[0] * (R - 1) + dn[0] * 1.5, hd[1] + fwd[1] * (R - 1) + dn[1] * 1.5], [hd[0] + fwd[0] * (R + 2.6) - dn[0] * 1.2, hd[1] + fwd[1] * (R + 2.6) - dn[1] * 1.2], [hd[0] + fwd[0] * (R - 1) - dn[0] * 3, hd[1] + fwd[1] * (R - 1) - dn[1] * 3]];
        s += '<path class="skull" d="' + ptsPath(nb, true) + '"/>';
        s += '<ellipse class="base" cx="' + f1(hd[0] - fwd[0] * 1.5 - dn[0] * 0.5) + '" cy="' + f1(hd[1] - fwd[1] * 1.5 - dn[1] * 0.5) + '" rx="1.9" ry="2.6"/>';
        s += '<path class="hairl" d="' + ptsPath([[hd[0] + fwd[0] * 4 + dn[0] * 9, hd[1] + fwd[1] * 4 + dn[1] * 9], [hd[0] - fwd[0] * 6 + dn[0] * 7, hd[1] - fwd[1] * 6 + dn[1] * 7], [hd[0] - fwd[0] * 9, hd[1] - fwd[1] * 9]].map(function (q) { return q; })) + '"/>';
      }
      return s;
    }
    var sv = !front;
    var b = "";
    if (sv) {
      b += arm(j.A2, 2, true) + leg(j.L2, 2, true);
      b += trunk() + rotator() + headNeck();
      b += leg(j.L1, 1, false) + hips();
      b += arm(j.A1, 1, false);
    } else {
      b += trunk();
      b += leg(j.L1, 1, false) + leg(j.L2, 2, false) + hipsFront();
      b += headNeck();
      b += arm(j.A1, 1, false) + arm(j.A2, 2, false);
    }
    return b;
  }

  // 高亮部位：trunk / neck / upper1 / fore1 / thigh1 / shin1 / foot1 ...（2 = 另一侧）
  function svgFor(ex, pose, opts) {
    opts = opts || {};
    var view = ex.view || "side";
    var j = joints(pose, view);
    var dy = ex.free ? ex._dy : GROUND - lowest(j);
    dy -= j.y;
    var dx = ex._dx;
    var hl = {}; (ex.hl || []).forEach(function (k) { hl[k] = 1; });
    function T(p) { return [p[0] + dx, p[1] + dy]; }
    function seg(a, b, name, w, base) { return line(T(a), T(b), base + (hl[name] ? " hl" : ""), w); }
    var s = "";
    s += drawProps(ex, j, dx, dy, "back");
    if (STYLE === "anatomy") return s + anatomySvg(ex, pose, T) + drawProps(ex, j, dx, dy, "front");
    // 远侧肢体先画（侧视颜色更浅）
    var farCls = view === "side" ? "limb far" : "limb";
    function legSvg(L, n, cls) {
      return seg(L.H, L.K, "thigh" + n, 12, cls) + seg(L.K, L.A, "shin" + n, 10, cls) +
        seg(L.Hl, L.T, "foot" + n, 7, cls);
    }
    function trunkSvg(w) {
      if (!j.c) return seg(j.P, j.S, "trunk", w, "limb body");
      var m = [(j.P[0] + j.S[0]) / 2, (j.P[1] + j.S[1]) / 2], bk = vec(j.t + 90, j.c * 2);
      var a = T(j.P), b = T(j.S), cpt = T(add(m, bk));
      return '<path class="limb body' + (hl.trunk ? " hl" : "") + '" stroke-width="' + w + '" fill="none" d="M' + a[0].toFixed(1) + " " + a[1].toFixed(1) + " Q" + cpt[0].toFixed(1) + " " + cpt[1].toFixed(1) + " " + b[0].toFixed(1) + " " + b[1].toFixed(1) + '"/>';
    }
    function armSvg(A, n, cls) { return (A.F ? seg(A.W, A.F, "hand" + n, 6, cls) : "") + seg(A.S, A.E, "upper" + n, 9, cls) + seg(A.E, A.W, "fore" + n, 8, cls) + '<circle class="' + cls + ' hand" cx="' + T(A.W)[0].toFixed(1) + '" cy="' + T(A.W)[1].toFixed(1) + '" r="4.2"/>'; }
    if (view === "side") {
      s += armSvg(j.A2, 2, farCls) + legSvg(j.L2, 2, farCls);
      s += trunkSvg(19);
      s += seg(j.S, j.N, "neck", 8, "limb body");
      s += legSvg(j.L1, 1, "limb");
    } else {
      s += trunkSvg(24);
      s += seg(j.S, j.N, "neck", 8, "limb body");
      s += legSvg(j.L1, 1, "limb") + legSvg(j.L2, 2, "limb");
      s += line(T(j.A1.S), T(j.A2.S), "limb body", 10);
    }
    // 头：圆 + 发髻（侧视在后脑，显示朝向）
    var hd = T(j.Hd);
    if (view === "side") {
      var back = vec(j.h + 90 + 25, LEN.head + 2);
      s += '<circle class="hair" cx="' + (hd[0] + back[0]).toFixed(1) + '" cy="' + (hd[1] + back[1]).toFixed(1) + '" r="5.2"/>';
    } else {
      var up = vec(j.h, LEN.head + 3);
      s += '<circle class="hair" cx="' + (hd[0] + up[0]).toFixed(1) + '" cy="' + (hd[1] + up[1]).toFixed(1) + '" r="5.2"/>';
    }
    s += '<circle class="head' + (hl.head ? " hl" : "") + '" cx="' + hd[0].toFixed(1) + '" cy="' + hd[1].toFixed(1) + '" r="' + LEN.head + '"/>';
    if (view === "side") {
      s += armSvg(j.A1, 1, "limb");
    } else {
      s += armSvg(j.A1, 1, "limb") + armSvg(j.A2, 2, "limb");
    }
    s += drawProps(ex, j, dx, dy, "front");
    return s;
  }

  function jointX(j, key) {
    var m = { P: j.P, S: j.S, N: j.N, Hd: j.Hd, E1: j.A1.E, W1: j.A1.W, E2: j.A2.E, W2: j.A2.W, K1: j.L1.K, A1: j.L1.A, T1: j.L1.T, H1: j.L1.Hl, K2: j.L2.K, A2: j.L2.A, T2: j.L2.T, H2: j.L2.Hl };
    return (m[key] || j.P);
  }

  // 每个动作的基础版/进阶版各自是一个"画面"：姿势、视角、道具、高亮
  function variant(ex, level) {
    var key = level === "adv" && ex.adv && ex.adv.kf ? "_va" : "_vb";
    if (ex[key]) return ex[key];
    var src = key === "_va" ? ex.adv : ex;
    var v = { name: ex.name, kind: ex.kind, view: src.view || ex.view || "side", kf: src.kf, props: src.props || (key === "_va" && !src.view ? ex.props : null) || {},
      note: src.note || (src !== ex && src.view ? null : ex.note), mus: src.mus || ex.mus, hl: src.hl || ex.hl, beat: src.beat || ex.beat, hold: src.hold != null ? src.hold : ex.hold, seq: src.seq || ex.seq, free: src.free != null ? src.free : ex.free };
    prepare(v);
    ex[key] = v;
    return v;
  }

  // 预计算水平居中、墙和椅子位置（用全部关键帧的范围，保证动画中不跳）
  function prepare(ex) {
    var view = ex.view;
    var lo = 1e9, hi = -1e9, top = 1e9, bot = -1e9;
    var js = ex.kf.map(function (p) { return joints(p, view); });
    js.forEach(function (j) { var b = bbox(j); lo = Math.min(lo, b[0]); hi = Math.max(hi, b[1]); top = Math.min(top, j.Hd[1] - 12, j.A1.W[1], j.A2.W[1]); bot = Math.max(bot, lowest(j)); });
    var props = ex.props;
    var j0 = js[0];
    if (props.wall) {
      var ref, xs = js.map(function (j) { return jointX(j, props.wallAt || (props.wall === "back" ? "P" : "W1"))[0]; });
      if (props.wall === "back") ref = (props.wallAt ? Math.min.apply(null, xs) : lo) - 10;
      else ref = (props.wallAt ? Math.max.apply(null, xs) : hi) + 2 + (props.wallGap || 0);
      lo = Math.min(lo, ref); hi = Math.max(hi, ref + 8);
      ex._wallRaw = ref;
    }
    ex._dx = W / 2 - (lo + hi) / 2;
    ex._dy = H / 2 - (top + bot) / 2;
    if (ex._wallRaw != null) ex._wallX = ex._wallRaw + ex._dx;
    if (props.chair) {
      var dy0 = GROUND - lowest(j0), c = props.chair;
      if (c === "sit") {
        var seat = j0.P[1] + dy0 + 9, px = j0.P[0] + ex._dx;
        ex._chair = { x1: px - 16, x2: px + 22, seat: seat, back: true, bx: px - 16 };
      } else { // 手扶椅背
        var hx = jointX(j0, "W1")[0] + ex._dx, hy = jointX(j0, "W1")[1] + dy0 + 5;
        ex._chair = { x1: hx + 30, x2: hx - 2, seat: Math.min(GROUND - 30, hy + 45), back: true, bx: hx };
        ex._chair.backTop = hy;
      }
    }
    if (props.step) { var a = j0.L1.Hl[0] + ex._dx; ex._step = { x: a - 8, w: 34 }; }
  }

  function frame(ex, t) {
    var poses = ex.kf, n = poses.length;
    if (n === 1) return poses[0];
    var beat = ex.beat || 1.6, hold = ex.hold != null ? ex.hold : (ex.kind === "static" || ex.kind === "breath" ? 1.2 : .25);
    var cyc, tt, i, r, k, a, b;
    if (ex.seq === "cycle") { // 0→1→…→n-1，然后回到 0（首尾姿势相同）
      cyc = (n - 1) * (beat + hold); tt = t % cyc; i = Math.floor(tt / (beat + hold)); r = tt - i * (beat + hold);
      k = r < hold ? 0 : ease((r - hold) / beat);
      return blend(poses[i], poses[i + 1], k, ex.view);
    }
    var segs = (n - 1) * 2; cyc = segs * (beat + hold); tt = t % cyc; i = Math.floor(tt / (beat + hold)); r = tt - i * (beat + hold);
    k = r < hold ? 0 : ease((r - hold) / beat);
    a = i < n - 1 ? i : segs - i; b = i < n - 1 ? i + 1 : segs - i - 1;
    return blend(poses[a], poses[b], k, ex.view);
  }

  function shell(label, inner, free, note) {
    return '<svg class="fig" viewBox="0 0 ' + W + " " + H + '"' + (label ? ' role="img" aria-label="' + label + '"' : ' aria-hidden="true"') + '>' +
      (free ? "" : '<g class="mat"><line x1="14" y1="' + (GROUND + 1) + '" x2="' + (W - 14) + '" y2="' + (GROUND + 1) + '"/></g>') +
      (note ? '<text class="vnote" x="14" y="20">' + note + "</text>" : "") + inner + "</svg>";
  }

  // 生成一个会动的示范：返回控制器
  function mount(host, ex, opts) {
    opts = opts || {};
    var level = opts.level || "basic", mirror = !!opts.mirror, raf = 0, t0 = performance.now(), paused = false, pausedAt = 0;
    var still = opts.still || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    var v, g;
    function build() {
      v = variant(ex, level);
      host.innerHTML = shell(ex.name + " 动作示范", '<g class="fig-g"></g>', v.free, v.note);
      g = host.querySelector(".fig-g");
    }
    function draw(now) {
      var t = paused ? pausedAt : (now - t0) / 1000;
      g.innerHTML = svgFor(v, frame(v, t));
      g.setAttribute("transform", mirror ? "translate(" + W + ",0) scale(-1,1)" : "");
    }
    function loop(now) { draw(now); raf = requestAnimationFrame(loop); }
    build();
    if (still) { pausedAt = (v.beat || 1.6) + 1.3; paused = true; draw(0); }
    else raf = requestAnimationFrame(loop);
    return {
      setLevel: function (l) { level = l; build(); draw(performance.now()); },
      setMirror: function (m) { mirror = m; draw(performance.now()); },
      pause: function () { if (!paused) { pausedAt = (performance.now() - t0) / 1000; paused = true; } },
      resume: function () { if (paused && !still) { t0 = performance.now() - pausedAt * 1000; paused = false; } },
      stop: function () { cancelAnimationFrame(raf); }
    };
  }

  // 静态缩略图（列表用）：取最后一个关键帧（通常是到位姿势）
  function thumb(ex, level, at) {
    var v = variant(ex, level);
    var p = at != null ? v.kf[at] : v.seq === "cycle" ? v.kf[Math.floor(v.kf.length / 2)] : v.kf[v.kf.length - 1];
    return shell("", "<g>" + svgFor(v, p) + "</g>", v.free, v.note);
  }

  window.Figure = { mount: mount, thumb: thumb, joints: joints, variant: variant, W: W, H: H,
    setStyle: function (st) { STYLE = st === "line" ? "line" : "anatomy"; }, style: function () { return STYLE; } };
})();
