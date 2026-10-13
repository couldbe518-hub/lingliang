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
      note: src.note || (src !== ex && src.view ? null : ex.note), hl: src.hl || ex.hl, beat: src.beat || ex.beat, hold: src.hold != null ? src.hold : ex.hold, seq: src.seq || ex.seq, free: src.free != null ? src.free : ex.free };
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

  window.Figure = { mount: mount, thumb: thumb, joints: joints, variant: variant, W: W, H: H };
})();
