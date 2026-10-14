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
      if (props.mat) { // 俯视的瑜伽垫 + 枕头
        var hd = T(j.Hd), ptsM = [j.Hd, j.S, j.P, j.A1.W, j.A2.W, j.A1.E, j.A2.E, j.L1.K, j.L2.K, j.L1.T, j.L2.T, j.L1.A, j.L2.A].map(T);
        var mlo = Math.min.apply(null, ptsM.map(function (q) { return q[0]; })) - 16, mhi = Math.max.apply(null, ptsM.map(function (q) { return q[0]; })) + 16;
        var mtop = Math.min.apply(null, ptsM.map(function (q) { return q[1]; })) - 22, mbot = Math.max.apply(null, ptsM.map(function (q) { return q[1]; })) + 18;
        out += '<rect class="prop-mat" x="' + mlo.toFixed(1) + '" y="' + mtop.toFixed(1) + '" width="' + (mhi - mlo).toFixed(1) + '" height="' + (mbot - mtop).toFixed(1) + '" rx="8"/>';
        if (props.pillow) out += '<rect class="prop-pillow" x="' + (hd[0] - 16).toFixed(1) + '" y="' + (hd[1] - 12).toFixed(1) + '" width="32" height="24" rx="8"/>';
      }
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
    var view = ex.view || "side", front = view === "front", back = front && !!ex.back; // back：俯视看到背面
    var j = joints(pose, view);
    var tg = {}; (ex.mus || []).forEach(function (k) { tg[k] = 1; });
    function isT(name, n) { return tg[name] || (n != null && tg[name + n]); }
    function cls(name, n, far) { return "m" + (far ? " far" : "") + (isT(name, n) ? " tgt" : ""); }
    function unit(v) { var l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }
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
      var s1 = '<path class="' + c + '" d="' + smooth(poly) + '"/>';
      if (lines !== 0) {
        var L = lines || 3;
        for (var k = 1; k <= L; k++) {
          var fr = k / (L + 1), fl = [];
          for (var m = 1; m < N; m++) {
            var tt = t0 + (t1 - t0) * m / N, ss = Math.sin(Math.PI * m / N), bb = base0 + (base1 - base0) * Math.max(0, Math.min(1, tt));
            var pp = along(a, b, tt), ins = (inner == null ? bb * .15 : inner), oo = ins + ((bb * .85 + thick) * ss) * fr;
            fl.push(T([pp[0] + nrm[0] * side * oo, pp[1] + nrm[1] * side * oo]));
          }
          fib.push('<path class="fib' + (c.indexOf("tgt") >= 0 ? " tgtl" : "") + '" d="' + ptsPath(fl) + '"/>');
        }
      }
      return s1 + fib.join("");
    }
    function tendon(a, b, nrm, side, t0, t1, off, w) {
      var p0 = along(a, b, t0), p1 = along(a, b, t1), q0 = T([p0[0] + nrm[0] * side * off, p0[1] + nrm[1] * side * off]), q1 = T([p1[0] + nrm[0] * side * off, p1[1] + nrm[1] * side * off]);
      return '<line class="tend" x1="' + f1(q0[0]) + '" y1="' + f1(q0[1]) + '" x2="' + f1(q1[0]) + '" y2="' + f1(q1[1]) + '" stroke-width="' + w + '"/>';
    }
    function antOfLimb(a, b) { return vec(deg(sub(b, a)) + 90, 1); }
    // 皮肤轮廓：沿骨段 a→b 的剖面，rows = [t, 前侧半宽, 后侧半宽]，两端圆滑收口
    function prof(a, b, rows, nrm) {
      var u = unit(sub(b, a)), A = [], B = [];
      function w(r) { return front ? [(r[1] + r[2]) / 2, (r[1] + r[2]) / 2] : [r[1], r[2]]; }
      rows.forEach(function (r) { var p = along(a, b, r[0]), ww = w(r); A.push([p[0] + nrm[0] * ww[0], p[1] + nrm[1] * ww[0]]); B.push([p[0] - nrm[0] * ww[1], p[1] - nrm[1] * ww[1]]); });
      function cap(r, dir) { var p = along(a, b, r[0]), ww = w(r), k = (ww[0] + ww[1]) / 2 * .8; return [p[0] + nrm[0] * (ww[0] - ww[1]) / 2 + u[0] * k * dir, p[1] + nrm[1] * (ww[0] - ww[1]) / 2 + u[1] * k * dir]; }
      return smooth(A.concat([cap(rows[rows.length - 1], 1)], B.reverse(), [cap(rows[0], -1)]).map(T));
    }
    // 同一组皮肤先画一圈描边再填色，关节处自然连成一体
    function skin(ds, far) {
      var c = far ? " far" : "";
      return ds.map(function (d) { return '<path class="sko' + c + '" d="' + d + '"/>'; }).join("") + ds.map(function (d) { return '<path class="sk' + c + '" d="' + d + '"/>'; }).join("");
    }
    // 梭形（三角肌等）：沿 a→b，两侧对称
    function lens(a, b, t0, t1, wd, nrm, c) {
      var N = 10, L = [], R = [];
      for (var i = 0; i <= N; i++) { var s = Math.pow(Math.sin(Math.PI * i / N), .7), p = along(a, b, t0 + (t1 - t0) * i / N); L.push([p[0] + nrm[0] * wd * s, p[1] + nrm[1] * wd * s]); R.push([p[0] - nrm[0] * wd * s, p[1] - nrm[1] * wd * s]); }
      var out = '<path class="' + c + '" d="' + smooth(L.concat(R.reverse().slice(1, -1)).map(T)) + '"/>';
      [-.45, 0, .45].forEach(function (k) { var q0 = along(a, b, t0 + (t1 - t0) * .15), q1 = along(a, b, t0 + (t1 - t0) * .85); out += '<path class="fib' + (c.indexOf("tgt") >= 0 ? " tgtl" : "") + '" d="' + ptsPath([T([q0[0] + nrm[0] * wd * k * .7, q0[1] + nrm[1] * wd * k * .7]), T([q1[0] + nrm[0] * wd * k * .4, q1[1] + nrm[1] * wd * k * .4])]) + '"/>'; });
      return out;
    }

    // ── 腿 ──
    function leg(L, n, far) {
      var H = L.H, K = L.K, A = L.A, ant = antOfLimb(H, K), antS = antOfLimb(K, A), ds = [], m = "";
      if (!front) {
        ds.push(prof(H, K, [[-.1, 8.5, 10], [.12, 10, 11], [.45, 9.2, 9], [.8, 7, 6.6], [1.04, 5.8, 5.6]], ant));
        ds.push(prof(K, A, [[-.05, 5.8, 5.8], [.25, 5.3, 7.4], [.5, 4.6, 6.6], [.8, 3.3, 3.8], [1.04, 3, 3.2]], antS));
      } else {
        ds.push(prof(H, K, [[-.1, 7.4, 7.4], [.12, 8, 8], [.45, 7, 7], [.8, 5.6, 5.6], [1.04, 4.8, 4.8]], ant));
        ds.push(prof(K, A, [[-.05, 4.8, 4.8], [.25, 5.2, 5.2], [.5, 4.6, 4.6], [.8, 3.2, 3.2], [1.04, 2.8, 2.8]], antS));
      }
      if (!front) {
        m += belly(H, K, ant, -1, .12, .9, 8, 5.4, 1.6, cls("ham", n, far));
        m += belly(H, K, ant, 1, .06, .92, 8, 5.4, 2.4, cls("quad", n, far), null, 4);
        m += belly(H, K, ant, 1, -.02, .3, 8, 6.5, .8, cls("hipflex", n, far), 1.5, 2);
        m += belly(H, K, ant, -1, -.02, .48, 4, 3, 1, cls("adductor", n, far), 0, 2);
        m += belly(H, K, ant, 1, .0, .34, 4.2, 4, 1.1, cls("tfl", n, far), 3, 0);
        m += tendon(K, A, antS, 1, -.04, .14, 4.2, 2);
        m += belly(K, A, antS, -1, .3, .8, 4.6, 3.4, 1.4, cls("soleus", n, far), null, 2);
        m += belly(K, A, antS, -1, .04, .6, 5, 3.8, 2.6, cls("calf", n, far));
        m += belly(K, A, antS, 1, .1, .72, 4.6, 3.4, .9, cls("tib", n, far), null, 2);
        m += tendon(K, A, antS, -1, .72, 1, 2.6, 1.6);
      } else {
        var med = (j.P[0] - H[0]) >= 0 ? 1 : -1;
        var axisN = unit([-sub(K, H)[1], sub(K, H)[0]]);
        var sideMed = (axisN[0] * med) >= 0 ? 1 : -1;
        m += belly(H, K, axisN, sideMed, .02, .62, 5.4, 4, 1, cls("adductor", n, far), 0, 2);
        m += belly(H, K, axisN, -sideMed, .02, .4, 5.6, 5, .9, cls("tfl", n, far), 1, 2);
        m += belly(H, K, axisN, sideMed, .12, .94, 4, 3, 1.2, cls("quad", n, far), -3, 3);
        m += belly(H, K, axisN, -sideMed, .12, .94, 4, 3, 1.2, cls("quad", n, far), -3, 2);
        var axS = unit([-sub(A, K)[1], sub(A, K)[0]]);
        m += belly(K, A, axS, sideMed, .06, .6, 4.4, 3.4, 1.2, cls("calf", n, far), null, 2);
        m += belly(K, A, axS, -sideMed, .06, .7, 4.2, 3.2, .8, cls("tib", n, far), null, 2);
      }
      // 脚
      var Tt = L.T, Hl = L.Hl, fv = sub(Tt, Hl), fl = Math.hypot(fv[0], fv[1]) || 1, fn = [-fv[1] / fl, fv[0] / fl];
      var up = (fn[0] * antS[0] + fn[1] * antS[1]) < 0 ? 1 : -1;
      if (front) up = 1;
      var footPts = [along(Hl, Tt, -.12), [Hl[0] - fn[0] * up * 3.6, Hl[1] - fn[1] * up * 3.6], [A[0] - fn[0] * up * 4.2 + fv[0] / fl * 2, A[1] - fn[1] * up * 4.2 + fv[1] / fl * 2], [Tt[0] - fn[0] * up * 1.8, Tt[1] - fn[1] * up * 1.8], [Tt[0] + fn[0] * up * .9, Tt[1] + fn[1] * up * .9], along(Hl, Tt, .5)];
      var fd = smooth(footPts.map(T));
      m += '<path class="crease" d="' + ptsPath([T(along(Hl, Tt, .78)), T([along(Hl, Tt, .8)[0] - fn[0] * up * 2.2, along(Hl, Tt, .8)[1] - fn[1] * up * 2.2])]) + '"/>';
      ds.push(fd);
      if (isT("sole", n)) m += '<path class="m tgt" d="' + smooth([along(Hl, Tt, -.05), along(Hl, Tt, .5), along(Tt, Hl, .02), [Tt[0] - fn[0] * up * 1.4, Tt[1] - fn[1] * up * 1.4], [along(Hl, Tt, .5)[0] - fn[0] * up * 2.2, along(Hl, Tt, .5)[1] - fn[1] * up * 2.2], [Hl[0] - fn[0] * up * 2.4, Hl[1] - fn[1] * up * 2.4]].map(T)) + '"/>';
      return { skin: ds, mus: m };
    }
    // ── 手臂 ──
    function arm(Ar, n, far) {
      var S0 = Ar.S, E = Ar.E, Wr = Ar.W, ant = antOfLimb(S0, E), antF = antOfLimb(E, Wr), ds = [], m = "";
      var hv = sub(Wr, E), hl = Math.hypot(hv[0], hv[1]) || 1, hd = Ar.F ? Ar.F : [Wr[0] + hv[0] / hl * 7.5, Wr[1] + hv[1] / hl * 7.5];
      ds.push(prof(S0, E, [[-.14, 5.6, 5.6], [.15, 5.4, 5.4], [.55, 4.5, 4.4], [.9, 3.7, 3.5], [1.05, 3.3, 3.3]], ant));
      ds.push(prof(E, Wr, [[-.05, 3.4, 3.4], [.25, 3.9, 3.6], [.7, 2.8, 2.5], [1.04, 2.2, 2.1]], antF));
      ds.push(prof(Wr, hd, [[-.05, 2.2, 2.1], [.45, 3, 2.7], [.95, 2.1, 1.9]], antOfLimb(Wr, hd)));
      // 拇指 + 指缝
      var ha = antOfLimb(Wr, hd), hu = unit(sub(hd, Wr)), tb = along(Wr, hd, .18), tside = front ? (n === 1 ? -1 : 1) : 1;
      var tt = [tb[0] + ha[0] * tside * 3.6 + hu[0] * 3.2, tb[1] + ha[1] * tside * 3.6 + hu[1] * 3.2];
      ds.push(prof(tb, tt, [[0, 1.3, 1.3], [1, .9, .9]], antOfLimb(tb, tt)));
      var fc = "";
      [-.35, .35].forEach(function (k) { var q0 = along(Wr, hd, .55), q1 = along(Wr, hd, .98); fc += '<path class="crease" d="' + ptsPath([T([q0[0] + ha[0] * k * 2.4, q0[1] + ha[1] * k * 2.4]), T([q1[0] + ha[0] * k * 2, q1[1] + ha[1] * k * 2])]) + '"/>'; });
      m += fc;
      if (!front) {
        m += belly(S0, E, ant, -1, .16, .9, 4.2, 3.4, 1.3, cls("triceps", n, far));
        m += belly(S0, E, ant, 1, .26, .88, 4.2, 3.4, 1.2, cls("biceps", n, far));
        m += belly(E, Wr, antF, 1, .03, .62, 3.4, 2.3, .9, cls("forearmF", n, far), null, 2);
        m += belly(E, Wr, antF, -1, .03, .6, 3.4, 2.3, .8, cls("forearmE", n, far), null, 2);
      } else {
        var axN = unit([-sub(E, S0)[1], sub(E, S0)[0]]);
        m += belly(S0, E, axN, 1, .22, .9, 3.6, 3, 1, cls("biceps", n, far), -1, 2);
        m += belly(S0, E, axN, -1, .17, .9, 3.6, 3, 1, cls("triceps", n, far), -1, 2);
        var axF = unit([-sub(Wr, E)[1], sub(Wr, E)[0]]);
        m += belly(E, Wr, axF, 1, .03, .62, 3, 2.2, .8, cls("forearmF", n, far), null, 2);
        m += belly(E, Wr, axF, -1, .03, .6, 3, 2.2, .8, cls("forearmE", n, far), null, 2);
      }
      // 三角肌：从肩头包到上臂外侧三分之一
      m += lens(S0, E, -.16, .46, 5.4, ant, cls("delt", n, far));
      if (front && isT("rotator", n)) { var dv = unit(sub(E, S0)), rb = [S0[0] - dv[0] * 2, S0[1] - dv[1] * 2]; m += '<path class="m tgt" d="' + smooth([[rb[0] - 5, rb[1] - 2], [rb[0], rb[1] - 4], [rb[0] + 5, rb[1] - 2], [rb[0], rb[1] + 2]].map(T)) + '"/>'; }
      return { skin: ds, mus: m };
    }
    // ── 躯干 ──
    var P = j.P, Sh = j.S, tu = sub(Sh, P), tud = unit(tu);
    var tant = front ? [-tud[1], tud[0]] : vec(deg(tu) - 90, 1);
    var cv = j.c ? vec(j.t + 90, j.c * 2) : [0, 0];
    function bend(t) { var w = Math.sin(Math.PI * Math.max(0, Math.min(1, t))); return [cv[0] * w, cv[1] * w]; }
    function bl(side, t0, t1, b0, b1, th, c, inner, lines) {
      var o0 = bend(t0), o1 = bend(t1), mo = [(o0[0] + o1[0]) / 2, (o0[1] + o1[1]) / 2], a = along(P, Sh, t0), b = along(P, Sh, t1);
      return belly([a[0] + mo[0], a[1] + mo[1]], [b[0] + mo[0], b[1] + mo[1]], tant, side, 0, 1, b0, b1, th, c, inner, lines);
    }
    function trunkSkin() {
      // 侧面：臀部后凸、腰收、胸廓；正面：肩宽、腰细、髋宽
      var pr = front ? [[-.16, 8, 8], [-.02, 11.8, 11.8], [.25, 10, 10], [.45, 9.6, 9.6], [.7, 11.5, 11.5], [.92, 13.5, 13.5], [1.06, 9, 9]]
        : [[-.16, 8, 9], [0, 9.5, 12.5], [.22, 8.5, 9.5], [.45, 8, 7.4], [.64, 9.6, 8.2], [.76, 12.4, 8.8], [.88, 11, 9], [1.06, 5.6, 5.6]];
      var A = [], B = [];
      pr.forEach(function (r) { var p = along(P, Sh, r[0]), o = bend(r[0]); A.push([p[0] + o[0] + tant[0] * r[1], p[1] + o[1] + tant[1] * r[1]]); B.push([p[0] + o[0] - tant[0] * r[2], p[1] + o[1] - tant[1] * r[2]]); });
      return smooth(A.concat(B.reverse()).map(T));
    }
    function trunkMus() {
      var s = "";
      if (!front) {
        s += bl(-1, .05, .74, 4.6, 4.6, .8, cls("erector"), 3.4, 2);
        s += bl(-1, .42, .86, 6.4, 7.2, 1.2, cls("lat"));
        s += bl(-1, .8, 1.1, 6.4, 4.6, 1.2, cls("trap"), null, 2);
        s += bl(1, .08, .6, 5.6, 6, .8, cls("abs"), 3.2, 0);
        s += bl(1, .12, .56, 3.8, 3.8, 1, cls("oblique"), 0, 3);
        s += bl(1, .58, .96, 7.8, 7.4, 1.6, cls("pec"));
        if (isT("pecmin")) s += bl(1, .7, .92, 6, 6, 1.4, "m tgt", 2.5, 2);
        if (isT("hipflex1") || isT("hipflex2") || isT("hipflex")) s += bl(1, -.08, .18, 7.6, 7.6, 1, "m tgt", 3, 2);
        for (var i = 1; i <= 3; i++) {
          var p = along(P, Sh, .12 + i * .12), mo = bend(.12 + i * .12);
          s += '<path class="fib' + (isT("abs") ? " tgtl" : "") + '" d="' + ptsPath([T([p[0] + mo[0] + tant[0] * 4, p[1] + mo[1] + tant[1] * 4]), T([p[0] + mo[0] + tant[0] * 6.6, p[1] + mo[1] + tant[1] * 6.6])]) + '"/>';
        }
      } else if (back) {
        [1, -1].forEach(function (sd) {
          s += bl(sd, .08, .78, 3.2, 3.2, .9, cls("erector"), 0, 2);
          s += bl(sd, .3, .8, 8.6, 9.4, 1.2, cls("lat"), 4, 3);
          s += bl(sd, .62, 1.08, 10.5, 2.5, 1.6, cls("trap"), 1, 3);
          s += bl(sd, -.14, .2, 8.5, 8.5, 2.4, cls("glute"), 1.5, 3);
          s += belly(along(P, Sh, .86), along(P, Sh, .98), tant, sd, 0, 1, 11, 12, 2.2, "m" + (isT("rotator", sd === 1 ? 1 : 2) ? " tgt" : ""), 7, 2);
        });
      } else {
        [1, -1].forEach(function (sd) {
          s += bl(sd, .62, .96, 6, 6, 2.6, cls("pec"), .5, 3);
          s += bl(sd, .1, .6, 3.4, 3.4, .9, cls("abs"), 0, 0);
          s += bl(sd, .1, .6, 7, 7, .9, cls("oblique"), 4.8, 2);
          s += bl(sd, .45, .84, 8.6, 9.4, .9, cls("lat"), 8.2, 2);
          s += bl(sd, .88, 1.1, 8.6, 4, 1.2, cls("trap"), 3, 2);
        });
        for (var k2 = 1; k2 <= 3; k2++) { var pk = along(P, Sh, .12 + k2 * .12); s += '<path class="fib' + (isT("abs") ? " tgtl" : "") + '" d="' + ptsPath([T([pk[0] - tant[0] * 4, pk[1] - tant[1] * 4]), T([pk[0] + tant[0] * 4, pk[1] + tant[1] * 4])]) + '"/>'; }
      }
      return s;
    }
    // 侧视臀部（画在近侧大腿之上）
    function hips() {
      return bl(-1, -.04, .2, 6.2, 6.2, 1.2, cls("gmed"), 5, 2) + bl(-1, -.2, .3, 7.6, 8, 3, cls("glute"), 2, 4);
    }
    function hipsFront() {
      if (!(isT("gmed") || isT("glute"))) return "";
      var r = "";
      [1, -1].forEach(function (sd) { r += belly(along(P, Sh, -.14), along(P, Sh, .16), tant, sd, 0, 1, 9, 9, 2, "m tgt", 6.5, 2); });
      return r;
    }
    function rotator() {
      if (front) return "";
      return belly(along(P, Sh, .66), along(P, Sh, .98), tant, -1, 0, 1, 6, 6, 2, "m" + (isT("rotator", 1) || isT("rotator", 2) ? " tgt" : ""), 2.5, 3);
    }
    // ── 头颈 ──
    var Hd = j.Hd, hu = vec(j.h, 1), hf = vec(j.h - 90, 1);
    function hp(x, y) { return [Hd[0] + hf[0] * x + hu[0] * y, Hd[1] + hf[1] * x + hu[1] * y]; }
    function neckSkin() {
      var nb = along(Sh, Hd, -.05), nt = hp(front ? 0 : -1.5, -6), nn = unit([-(nt[1] - nb[1]), nt[0] - nb[0]]);
      return prof(nb, nt, [[0, 5.2, 5.2], [.55, 3.9, 3.9], [1, 3.8, 3.8]], nn);
    }
    function neckMus() {
      if (front) return belly(along(Sh, Hd, 0), hp(0, -7), unit([-(hp(0, -7)[1] - Sh[1]), hp(0, -7)[0] - Sh[0]]), 1, .05, .95, 2.6, 2, .6, cls("neck"), -1, 2) + belly(along(Sh, Hd, 0), hp(0, -7), unit([-(hp(0, -7)[1] - Sh[1]), hp(0, -7)[0] - Sh[0]]), -1, .05, .95, 2.6, 2, .6, cls("neck"), -1, 2);
      // 胸锁乳突肌：从耳后斜向锁骨
      var a = hp(-2, -3), b = along(Sh, Hd, .02), nn = unit([-(b[1] - a[1]), b[0] - a[0]]);
      return belly(a, b, nn, 1, .02, .98, 2.2, 2.2, .9, cls("neck"), -1.6, 2);
    }
    function headSkin() {
      if (front) {
        var o = [];
        for (var i = 0; i < 16; i++) { var a = Math.PI * 2 * i / 16, x = Math.sin(a) * 8.3, y = Math.cos(a) * 10; if (y < 0) x *= 1 - .25 * Math.pow(-y / 10, 2); o.push(hp(x, y)); }
        return smooth(o.map(T));
      }
      // 侧脸轮廓：后脑 → 头顶 → 额头 → 鼻 → 唇 → 下巴 → 下颌角
      var pts = [[-9.6, .5], [-8.4, 6.6], [-3.4, 10.4], [2.8, 10.2], [7.2, 6.6], [8.6, 2.4], [8.5, .2], [10.6, -2.4], [8.8, -3.8], [9.2, -5.4], [8.5, -6.6], [8.2, -8.6], [5.8, -10], [2.2, -8.6], [-1.6, -6.4], [-5.4, -6.6], [-8.4, -4]];
      return smooth(pts.map(function (q) { return T(hp(q[0], q[1])); }));
    }
    function headDetail() {
      var s = "";
      function P2(x, y) { return T(hp(x, y)); }
      function dot(x, y, r, c) { var q = P2(x, y); return '<circle class="' + c + '" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="' + r + '"/>'; }
      if (back) {
        s += '<path class="ahair" d="' + smooth([[-8.6, 1], [-8.2, 6.4], [-4.4, 10.2], [0, 10.9], [4.4, 10.2], [8.2, 6.4], [8.6, 1], [7.4, -5], [3, -9.4], [-3, -9.4], [-7.4, -5]].map(function (q) { return P2(q[0], q[1]); })) + '"/>';
        var bb = P2(0, 1.5);
        s += '<circle class="ahair" cx="' + f1(bb[0]) + '" cy="' + f1(bb[1]) + '" r="4.6" style="stroke:#2E2019;stroke-width:.6"/>';
        return s;
      }
      if (front) {
        var bun = P2(0, 12.2);
        s += '<circle class="ahair" cx="' + f1(bun[0]) + '" cy="' + f1(bun[1]) + '" r="4.4"/>';
        s += '<path class="ahair" d="' + smooth([[-8.6, 1], [-8.2, 6.4], [-4.4, 10.2], [0, 10.9], [4.4, 10.2], [8.2, 6.4], [8.6, 1], [6.4, 5.6], [2, 7], [-2, 7.2], [-6.4, 5.6]].map(function (q) { return P2(q[0], q[1]); })) + '"/>';
        s += dot(-3.1, .2, .95, "eye") + dot(3.1, .2, .95, "eye");
        s += '<path class="brow" d="' + ptsPath([P2(-4.6, 2.4), P2(-1.8, 2.8)]) + " " + ptsPath([P2(1.8, 2.8), P2(4.6, 2.4)]) + '"/>';
        s += '<path class="lip" d="' + ptsPath([P2(-1.8, -5.2), P2(0, -5.6), P2(1.8, -5.2)]) + '"/>';
        return s;
      }
      // 耳、眼、眉、唇、头发与发髻
      var ear = P2(-1.6, -.8);
      s += '<ellipse class="ear" cx="' + f1(ear[0]) + '" cy="' + f1(ear[1]) + '" rx="1.9" ry="2.7" transform="rotate(' + f1(-j.h + 180) + " " + f1(ear[0]) + " " + f1(ear[1]) + ')"/>';
      s += '<path class="eye" d="' + smooth([P2(5.4, 1.1), P2(7, .6), P2(5.6, -.2)]) + '"/>';
      s += '<path class="brow" d="' + ptsPath([P2(4.6, 2.9), P2(7.8, 2.6)]) + '"/>';
      s += '<path class="lip" d="' + ptsPath([P2(8.6, -6), P2(7.4, -6.1)]) + '"/>';
      s += '<path class="ahair" d="' + smooth([[8.2, 4.4], [6.8, 8.8], [1.4, 11.2], [-5.2, 10.2], [-9.9, 4.2], [-10.1, -1.6], [-7.6, -5], [-4.6, -3.4], [-3.4, 1.6], [.4, 4.8], [4.6, 5.2]].map(function (q) { return P2(q[0], q[1]); })) + '"/>';
      var bn = P2(-9.4, 7.4);
      s += '<circle class="ahair" cx="' + f1(bn[0]) + '" cy="' + f1(bn[1]) + '" r="4.4"/>';
      return s;
    }

    var b = "";
    if (!front) {
      var fa = arm(j.A2, 2, true), fl2 = leg(j.L2, 2, true), nl = leg(j.L1, 1, false), na = arm(j.A1, 1, false);
      b += skin(fa.skin.concat(fl2.skin), true) + fl2.mus + fa.mus;
      b += skin([trunkSkin(), neckSkin(), headSkin()].concat(nl.skin)) + trunkMus() + rotator() + neckMus() + headDetail();
      b += nl.mus + hips();
      b += skin(na.skin) + na.mus;
    } else {
      var l1 = leg(j.L1, 1, false), l2 = leg(j.L2, 2, false), a1 = arm(j.A1, 1, false), a2 = arm(j.A2, 2, false);
      if (back) {
        b += skin(a1.skin) + a1.mus + skin(a2.skin) + a2.mus;
        b += skin(l1.skin.concat(l2.skin, [trunkSkin(), neckSkin(), headSkin()])) + l1.mus + l2.mus;
        b += trunkMus() + neckMus() + headDetail();
      } else {
        b += skin(l1.skin.concat(l2.skin, [trunkSkin(), neckSkin(), headSkin()])) + l1.mus + l2.mus;
        b += trunkMus() + hipsFront() + neckMus() + headDetail();
        b += skin(a1.skin) + a1.mus + skin(a2.skin) + a2.mus;
      }
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
    if (STYLE === "anatomy" && !ex.free) { var bx = bbox(j); s += '<ellipse class="shadow" cx="' + ((bx[0] + bx[1]) / 2 + dx).toFixed(1) + '" cy="' + (GROUND + 2) + '" rx="' + ((bx[1] - bx[0]) / 2 + 6).toFixed(1) + '" ry="3.2"/>'; }
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
      note: src.note || (src !== ex && src.view ? null : ex.note), mus: src.mus || ex.mus, hl: src.hl || ex.hl, beat: src.beat || ex.beat, hold: src.hold != null ? src.hold : ex.hold, seq: src.seq || ex.seq, free: src.free != null ? src.free : ex.free, back: src.back != null ? src.back : ex.back };
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
    var defs = '<defs><linearGradient id="skG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FDEBDF"/><stop offset=".55" stop-color="#F6D5C3"/><stop offset="1" stop-color="#E7B9A3"/></linearGradient>' +
      '<linearGradient id="skGf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F1D2C1"/><stop offset="1" stop-color="#DBAE98"/></linearGradient>' +
      '<linearGradient id="muG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7CDBB"/><stop offset="1" stop-color="#E7AF9A"/></linearGradient>' +
      '<linearGradient id="tgG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F26A5A"/><stop offset="1" stop-color="#D4281C"/></linearGradient></defs>';
    return '<svg class="fig" viewBox="0 0 ' + W + " " + H + '"' + (label ? ' role="img" aria-label="' + label + '"' : ' aria-hidden="true"') + '>' + defs +
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
