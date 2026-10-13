/* 教练：用手机相机做姿态识别（Google MediaPipe Pose，Apache-2.0，模型与程序都放在 vendor/ 本地托管）。
 * 识别完全在手机上运行，画面不上传、不调用任何 AI 服务，不耗 token。
 *
 * 实时模式：镜子对照 / 肩活动度左右对比 / 单腿平衡计时 / 深蹲弓步膝线
 * 视频模式：羽毛球高远球·杀球、上网弓步，网球正手·反手·发球 —— 自动找击球瞬间并给出要点评估
 * 评估规则都写在本文件的 ANALYZE 部分，阈值可以按需调整。
 */
(function () {
  "use strict";
  var VENDOR = "vendor/mediapipe/";
  var vision = null, fileset = null, models = {};
  var LM = { nose: 0, lEar: 7, rEar: 8, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16, lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28, lHeel: 29, rHeel: 30, lToe: 31, rToe: 32 };
  var BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32]];

  function getModel(kind) {
    if (models[kind]) return models[kind];
    models[kind] = (vision ? Promise.resolve(vision) : import("./" + VENDOR + "vision_bundle.mjs").then(function (m) { vision = m; return m; }))
      .then(function () { return fileset || vision.FilesetResolver.forVisionTasks(VENDOR + "wasm").then(function (f) { fileset = f; return f; }); })
      .then(function () {
        function make(delegate) {
          return vision.PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: VENDOR + (kind === "full" ? "pose_landmarker_full.task" : "pose_landmarker_lite.task"), delegate: delegate },
            runningMode: "VIDEO", numPoses: 1, minPoseDetectionConfidence: .5, minPosePresenceConfidence: .5, minTrackingConfidence: .5
          });
        }
        return make("GPU").catch(function () { return make("CPU"); });
      });
    models[kind].catch(function () { models[kind] = null; });
    return models[kind];
  }

  // ───────── 几何 ─────────
  function P(lm, i, W, H) { var p = lm[i]; return { x: p.x * W, y: p.y * H, v: p.visibility == null ? 1 : p.visibility }; }
  function ang(a, b, c) { // ∠abc，度
    var v1 = [a.x - b.x, a.y - b.y], v2 = [c.x - b.x, c.y - b.y];
    var d = (v1[0] * v2[0] + v1[1] * v2[1]) / ((Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1])) || 1);
    return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
  }
  function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) }; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function pts(lm, W, H) {
    var o = {}; for (var k in LM) o[k] = P(lm, LM[k], W, H);
    o.sh = mid(o.lSh, o.rSh); o.hip = mid(o.lHip, o.rHip);
    o.torso = dist(o.sh, o.hip) || 1;
    return o;
  }
  function tiltDeg(a, b) { return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; }

  function drawPose(g, lm, W, H, opts) {
    opts = opts || {};
    g.lineWidth = Math.max(3, W / 160); g.lineCap = "round";
    BONES.forEach(function (bn) {
      var a = lm[bn[0]], b = lm[bn[1]];
      if ((a.visibility || 1) < .3 || (b.visibility || 1) < .3) return;
      var hot = opts.hot && (opts.hot.indexOf(bn[0]) >= 0 && opts.hot.indexOf(bn[1]) >= 0);
      g.strokeStyle = hot ? "#FFB59C" : "rgba(124,224,208,.95)";
      g.beginPath(); g.moveTo(a.x * W, a.y * H); g.lineTo(b.x * W, b.y * H); g.stroke();
    });
    [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach(function (i) {
      var p = lm[i]; if ((p.visibility || 1) < .3) return;
      g.fillStyle = "#fff"; g.beginPath(); g.arc(p.x * W, p.y * H, Math.max(3, W / 200), 0, 7); g.fill();
    });
  }
  function label(g, text, x, y, W, mirror) {
    g.save();
    if (mirror) { g.translate(W, 0); g.scale(-1, 1); x = W - x; }
    g.font = "600 " + Math.round(W / 26) + "px -apple-system, sans-serif";
    var w = g.measureText(text).width + 12, h = W / 20;
    g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(x - w / 2, y - h / 2, w, h);
    g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, x, y + 1);
    g.restore();
  }

  // ───────── 页面 ─────────
  var C; // 来自 app.js 的上下文
  var MODES = [
    { id: "mirror", name: "镜子对照", sub: "前置镜头看自己的动作，显示关节角度和左右高低" },
    { id: "shoulder", name: "肩活动度对比", sub: "双手上举，量左右肩能举多高" },
    { id: "balance", name: "单腿平衡计时", sub: "自动计时、测晃动，左右对比" },
    { id: "squat", name: "深蹲 / 弓步检查", sub: "数次数、看深度、提醒膝盖内扣" },
    { id: "video", name: "挥拍 / 步法分析", sub: "拍一段视频，找击球瞬间，逐项评估" }
  ];

  function render(main, ctx) {
    C = ctx;
    var mode = (ctx.qs && ctx.qs.mode) || "";
    main.innerHTML = '<div class="top"><div><h1>教练</h1><p class="small muted" style="margin:2px 0 0">AI 姿态识别在手机本地运行 · 画面不上传</p></div></div>' +
      '<div class="modes" id="modes">' + MODES.map(function (m) { return '<button class="mode" data-m="' + m.id + '" aria-pressed="' + (m.id === mode) + '"><b>' + m.name + "</b><span>" + m.sub + "</span></button>"; }).join("") + "</div>" +
      '<div id="pane"></div>';
    C.qa = function (s) { return Array.prototype.slice.call(main.querySelectorAll(s)); };
    C.qa("#modes .mode").forEach(function (b) {
      b.onclick = function () {
        C.qa("#modes .mode").forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
        open(b.getAttribute("data-m"));
      };
    });
    var stopper = null;
    function open(m) {
      if (stopper) { stopper(); stopper = null; }
      var pane = main.querySelector("#pane");
      if (m === "video") stopper = videoPane(pane);
      else if (m) stopper = livePane(pane, m, ctx.qs || {});
      else pane.innerHTML = intro();
      if (m) pane.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    ctx.onLeave(function () { if (stopper) stopper(); });
    open(mode);
  }
  function intro() {
    return '<div class="card"><h2>怎么用</h2><ol class="steps">' +
      "<li>选上面的一个模式。第一次使用要下载约 6–10 MB 的识别模型，之后会缓存。</li>" +
      "<li>手机竖着放稳（靠墙、放在包上或用三脚架），离身体 2–3 米，让全身都在画面里。</li>" +
      "<li>光线充足、背景简单、穿贴身一点的衣服，识别会更准。</li></ol>" +
      '<div class="note acc">这是单摄像头的 2D 估算：角度受拍摄方向影响，适合看趋势和明显问题，不是精确测量。</div></div>';
  }

  // ───────── 实时模式 ─────────
  function livePane(pane, mode, qs) {
    var ex = qs.ex && C.ex[qs.ex];
    var stopped = false, stream = null, raf = 0, landmarker = null, lastT = -1, figCtl = null;
    var st = { maxL: 0, maxR: 0, reps: 0, phase: "up", minKnee: 180, base: null, lastWarn: 0, bal: null, balLeg: "L", results: [] };
    var guide = {
      mirror: ex ? "对照右上角的示范，看自己的动作。橙色线是左右不平的地方。" : "站在镜头前，屏幕会显示膝、髋、肘的角度和肩膀、骨盆的左右高低。",
      shoulder: "正对镜头，上半身完整入镜。双臂伸直，从身体两侧（或前方）慢慢举到最高，停 2 秒，重复 3 次。",
      balance: "正对镜头，全身入镜。选好支撑腿，抬起另一只脚就自动开始计时，脚落地自动停止。",
      squat: "正对镜头，全身入镜，双脚与肩同宽。慢慢下蹲再站起，会自动数次数，膝盖内扣时会提醒。"
    }[mode];
    pane.innerHTML = '<div class="card"><h2>' + MODES.filter(function (m) { return m.id === mode; })[0].name + (ex ? " · " + C.esc(ex.name) : "") + '</h2><p class="small">' + guide + "</p>" +
      (mode === "balance" ? '<div class="seg" style="margin-top:8px"><button data-leg="L" aria-pressed="true">左腿支撑</button><button data-leg="R" aria-pressed="false">右腿支撑</button></div>' : "") +
      '<div class="cam" id="cam"><video id="vid" class="mirror" playsinline muted></video><canvas id="cv" class="mirror"></canvas><div class="hud" id="hud"></div>' +
      (ex ? '<div id="ref" style="position:absolute;right:8px;top:8px;width:34%;background:rgba(255,255,255,.88);border-radius:12px"></div>' : "") +
      '<div class="msg" id="msg">点下面的按钮打开相机</div></div>' +
      '<div class="row"><button class="btn primary grow" id="go">' + C.icon("camera") + "打开相机</button>" + (mode === "shoulder" || mode === "balance" ? '<button class="btn" id="savebtn" disabled>保存结果</button>' : "") + "</div>" +
      '<div id="log"></div></div>';
    var vid = pane.querySelector("#vid"), cv = pane.querySelector("#cv"), g = cv.getContext("2d"), hud = pane.querySelector("#hud"), msg = pane.querySelector("#msg");
    if (ex) figCtl = window.Figure.mount(pane.querySelector("#ref"), ex, { level: C.state.levels[ex.id] || C.state.settings.level });
    Array.prototype.forEach.call(pane.querySelectorAll("[data-leg]"), function (b) {
      b.onclick = function () { st.balLeg = b.getAttribute("data-leg"); st.bal = null; Array.prototype.forEach.call(pane.querySelectorAll("[data-leg]"), function (x) { x.setAttribute("aria-pressed", x === b); }); };
    });
    pane.querySelector("#go").onclick = start;
    var sb = pane.querySelector("#savebtn"); if (sb) sb.onclick = saveResult;
    showLog();

    function start() {
      window.Sound && window.Sound.unlock();
      msg.textContent = "正在打开相机……";
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.textContent = "这个浏览器不支持相机。请用 Safari 打开（需要 https 网址）。"; return; }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } }, audio: false }).then(function (s) {
        if (stopped) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
        stream = s; vid.srcObject = s; return vid.play();
      }).then(function () {
        msg.textContent = "正在加载识别模型（第一次约需几秒）……";
        return getModel("lite");
      }).then(function (m) {
        if (stopped) return;
        landmarker = m; msg.textContent = ""; pane.querySelector("#go").style.display = "none";
        raf = requestAnimationFrame(tick);
      }).catch(function (e) {
        msg.textContent = /Permission|NotAllowed/i.test(e && e.name + e.message) ? "没有相机权限。请在 设置 › Safari › 相机 里允许，然后刷新。" : "无法启动：" + (e && e.message || e);
      });
    }
    function tick() {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      if (!vid.videoWidth || vid.currentTime === lastT) return;
      lastT = vid.currentTime;
      var W = vid.videoWidth, H = vid.videoHeight;
      if (cv.width !== W) { cv.width = W; cv.height = H; }
      var res;
      try { res = landmarker.detectForVideo(vid, performance.now()); } catch (e) { return; }
      g.clearRect(0, 0, W, H);
      var lm = res && res.landmarks && res.landmarks[0];
      if (!lm) { hud.innerHTML = '<span class="pill">没有识别到人，请退后让全身入镜</span>'; return; }
      var p = pts(lm, W, H), hot = [], pills = [];
      if (mode === "mirror") pills = mirrorMode(p, hot, W);
      else if (mode === "shoulder") pills = shoulderMode(p, hot);
      else if (mode === "balance") pills = balanceMode(p, hot);
      else if (mode === "squat") pills = squatMode(p, hot);
      drawPose(g, lm, W, H, { hot: hot });
      if (mode === "mirror") {
        [["lKn", ang(p.lHip, p.lKn, p.lAn)], ["rKn", ang(p.rHip, p.rKn, p.rAn)], ["lEl", ang(p.lSh, p.lEl, p.lWr)], ["rEl", ang(p.rSh, p.rEl, p.rWr)], ["lHip", ang(p.lSh, p.lHip, p.lKn)], ["rHip", ang(p.rSh, p.rHip, p.rKn)]].forEach(function (a) {
          var q = p[a[0]]; if (q.v > .5) label(g, Math.round(a[1]) + "°", q.x + (a[0][0] === "l" ? 1 : -1) * W * .06, q.y, W, true);
        });
      }
      hud.innerHTML = pills.map(function (x) { return '<span class="pill ' + (x[1] || "") + '">' + x[0] + "</span>"; }).join("");
    }
    function mirrorMode(p, hot) {
      var shT = tiltDeg(p.rSh, p.lSh), hipT = tiltDeg(p.rHip, p.lHip), out = [];
      // 画面里人物的右肩在左边；tilt>0 表示左肩（画面右侧）更低
      var shDiff = Math.abs(shT) > 3, hipDiff = Math.abs(hipT) > 3;
      if (shDiff) hot.push(11, 12); if (hipDiff) hot.push(23, 24);
      out.push(["肩膀 " + (shDiff ? (shT > 0 ? "左肩低 " : "右肩低 ") + Math.abs(shT).toFixed(0) + "°" : "水平 ✓"), shDiff ? "warn" : "good"]);
      out.push(["骨盆 " + (hipDiff ? (hipT > 0 ? "左侧低 " : "右侧低 ") + Math.abs(hipT).toFixed(0) + "°" : "水平 ✓"), hipDiff ? "warn" : "good"]);
      return out;
    }
    function elev(sh, el, hip) { return ang(el, sh, hip); }
    function shoulderMode(p) {
      var L = p.lSh.v > .5 && p.lEl.v > .5 ? elev(p.lSh, p.lEl, p.lHip) : 0, R = p.rSh.v > .5 && p.rEl.v > .5 ? elev(p.rSh, p.rEl, p.rHip) : 0;
      st.maxL = Math.max(st.maxL, L); st.maxR = Math.max(st.maxR, R);
      if (st.maxL > 90 && st.maxR > 90 && sb) sb.disabled = false;
      var diff = st.maxL - st.maxR;
      return [["左肩 <b>" + Math.round(L) + "°</b> · 最高 " + Math.round(st.maxL) + "°"], ["右肩 <b>" + Math.round(R) + "°</b> · 最高 " + Math.round(st.maxR) + "°"],
        st.maxL > 120 && st.maxR > 120 ? [Math.abs(diff) < 8 ? "左右接近 ✓" : (diff > 0 ? "右肩比左肩少 " : "左肩比右肩少 ") + Math.abs(diff).toFixed(0) + "°", Math.abs(diff) < 8 ? "good" : "warn"] : ["继续举高"]];
    }
    function balanceMode(p, hot) {
      var stance = st.balLeg === "L" ? p.lAn : p.rAn, other = st.balLeg === "L" ? p.rAn : p.lAn;
      var lifted = stance.y - other.y > p.torso * .12, now = performance.now();
      if (!st.bal) st.bal = { on: false, t0: 0, xs: [], down: 0, best: 0 };
      var b = st.bal;
      if (lifted) {
        b.down = 0;
        if (!b.on) { b.on = true; b.t0 = now; b.xs = []; window.Sound && window.Sound.chime("go"); }
        b.xs.push((p.hip.x - stance.x) / p.torso);
      } else if (b.on) {
        if (!b.down) b.down = now;
        if (now - b.down > 350) {
          b.on = false; var secs = (b.down - b.t0) / 1000;
          if (secs > 2) {
            var sway = sd(b.xs) * 100;
            st.results.push({ leg: st.balLeg, secs: secs, sway: sway });
            b.best = Math.max(b.best, secs); if (sb) sb.disabled = false;
            window.Sound && window.Sound.say((st.balLeg === "L" ? "左腿" : "右腿") + Math.round(secs) + "秒");
          }
        }
      }
      if (b.on) hot.push(st.balLeg === "L" ? 27 : 28, st.balLeg === "L" ? 25 : 26);
      var cur = b.on ? (now - b.t0) / 1000 : 0, sway = b.on && b.xs.length > 10 ? sd(b.xs.slice(-60)) * 100 : 0;
      var last = st.results.filter(function (r) { return r.leg === st.balLeg; }).pop();
      return [[(st.balLeg === "L" ? "左腿" : "右腿") + "支撑 · <b>" + cur.toFixed(1) + "</b> 秒", b.on ? "good" : ""],
        b.on ? ["晃动 " + sway.toFixed(1) + (sway < 3 ? " 很稳 ✓" : sway < 6 ? " 还可以" : " 晃得较多"), sway < 3 ? "good" : sway < 6 ? "" : "warn"] : ["抬起另一只脚开始"],
        last ? ["上次 " + last.secs.toFixed(1) + " 秒 · 晃动 " + last.sway.toFixed(1)] : null].filter(Boolean);
    }
    function sd(a) { if (a.length < 2) return 0; var m = a.reduce(function (x, y) { return x + y; }, 0) / a.length; return Math.sqrt(a.reduce(function (x, y) { return x + (y - m) * (y - m); }, 0) / a.length); }
    function squatMode(p, hot) {
      var kL = ang(p.lHip, p.lKn, p.lAn), kR = ang(p.rHip, p.rKn, p.rAn), k = Math.min(kL, kR), now = performance.now();
      // 膝内扣：膝盖相对"髋-踝连线"向身体中线偏移的比例
      function valgus(hip, kn, an, sign) {
        var t = (kn.y - hip.y) / ((an.y - hip.y) || 1), lineX = hip.x + (an.x - hip.x) * t;
        return sign * (kn.x - lineX) / (dist(hip, an) || 1);
      }
      var vL = valgus(p.lHip, p.lKn, p.lAn, -1), vR = valgus(p.rHip, p.rKn, p.rAn, 1); // 图像中人物左侧在画面右边
      var inward = Math.max(vL, vR) > .07 && k < 160;
      if (inward) { hot.push(vL > vR ? 25 : 26, vL > vR ? 23 : 24, vL > vR ? 27 : 28); if (now - st.lastWarn > 4000) { st.lastWarn = now; window.Sound && window.Sound.say("膝盖对准脚尖，向外推"); } }
      if (st.phase === "up" && k < 140) { st.phase = "down"; st.minKnee = k; }
      if (st.phase === "down") { st.minKnee = Math.min(st.minKnee, k); if (k > 165) { st.phase = "up"; st.reps++; st.results.push({ knee: st.minKnee }); window.Sound && window.Sound.say(String(st.reps)); } }
      var depth = st.results.length ? st.results[st.results.length - 1].knee : 0;
      return [["次数 <b>" + st.reps + "</b>"], ["膝角 " + Math.round(k) + "°" + (depth ? " · 上次最低 " + Math.round(depth) + "°" : "")], inward ? ["膝盖内扣了，向外推", "warn"] : ["膝盖方向 ✓", "good"]];
    }
    function saveResult() {
      var log = C.state.coach = C.state.coach || [];
      var d = new Date(), date = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
      if (mode === "shoulder") log.push({ date: date, type: "shoulder", L: Math.round(st.maxL), R: Math.round(st.maxR) });
      if (mode === "balance") st.results.forEach(function (r) { log.push({ date: date, type: "balance", leg: r.leg, secs: +r.secs.toFixed(1), sway: +r.sway.toFixed(1) }); });
      st.results = [];
      C.save(); C.toast("已保存"); showLog();
    }
    function showLog() {
      var el = pane.querySelector("#log"), log = (C.state.coach || []).filter(function (x) { return x.type === mode; }).slice(-6).reverse();
      if (!log.length) { el.innerHTML = ""; return; }
      el.innerHTML = '<table class="t" style="margin-top:12px">' + (mode === "shoulder" ? "<tr><th>日期</th><th>左肩</th><th>右肩</th><th>差</th></tr>" + log.map(function (r) { return "<tr><td>" + r.date + "</td><td>" + r.L + "°</td><td>" + r.R + "°</td><td>" + (r.L - r.R) + "°</td></tr>"; }).join("")
        : "<tr><th>日期</th><th>支撑腿</th><th>秒</th><th>晃动</th></tr>" + log.map(function (r) { return "<tr><td>" + r.date + "</td><td>" + (r.leg === "L" ? "左" : "右") + "</td><td>" + r.secs + "</td><td>" + r.sway + "</td></tr>"; }).join("")) + "</table>";
    }
    return function stop() {
      stopped = true; cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      if (figCtl) figCtl.stop();
    };
  }

  // ───────── 视频分析 ─────────
  var SHOTS = {
    bad_over: { sport: "羽毛球", name: "高远球 / 杀球", cam: "从侧面拍：手机放在你持拍手一侧 3 米外，镜头与球网平行。拍下从引拍到收拍的完整一拍。", type: "overhead" },
    bad_lunge: { sport: "羽毛球", name: "上网弓步（搓放网前）", cam: "从侧面拍：手机放在你上网路线的一侧，拍下跨步、到位、回位全过程。", type: "lunge" },
    ten_fh: { sport: "网球", name: "正手", cam: "从侧面拍：手机放在底线侧面、与底线垂直的方向，拍下引拍、击球、收拍。", type: "ground" },
    ten_bh: { sport: "网球", name: "反手", cam: "同正手，从侧面拍完整一拍。", type: "ground", back: true },
    ten_serve: { sport: "网球", name: "发球", cam: "从侧面拍：手机放在发球位侧面 3–4 米，拍下抛球到落地。", type: "overhead", serve: true }
  };

  function videoPane(pane) {
    var stopped = false, shot = "bad_over", hand = (C.state.settings.hand || "R"), frames = [], vid = null, url = null;
    pane.innerHTML = '<div class="card"><h2>挥拍 / 步法分析</h2>' +
      '<div class="field"><label>动作</label><select id="shot">' + Object.keys(SHOTS).map(function (k) { return '<option value="' + k + '">' + SHOTS[k].sport + " · " + SHOTS[k].name + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label>持拍手</label><div class="seg"><button data-h="R" aria-pressed="' + (hand === "R") + '">右手</button><button data-h="L" aria-pressed="' + (hand === "L") + '">左手</button></div></div>' +
      '<p class="small" id="camtip"></p>' +
      '<div class="row"><label class="btn primary grow">' + C.icon("camera") + '现在拍一段<input type="file" accept="video/*" capture="environment" id="rec" hidden></label><label class="btn grow">从相册选<input type="file" accept="video/*" id="pick" hidden></label></div>' +
      '<p class="small muted">建议 2–8 秒，只包含一次完整动作。慢动作视频（120/240 fps）效果最好。视频只在本机分析，不保存、不上传。</p>' +
      '<div id="work"></div></div><div id="report"></div>';
    var sel = pane.querySelector("#shot");
    function tip() { pane.querySelector("#camtip").innerHTML = "<b>怎么拍：</b>" + SHOTS[shot].cam; }
    sel.onchange = function () { shot = sel.value; tip(); };
    tip();
    Array.prototype.forEach.call(pane.querySelectorAll("[data-h]"), function (b) {
      b.onclick = function () { hand = b.getAttribute("data-h"); C.state.settings.hand = hand; C.save(); Array.prototype.forEach.call(pane.querySelectorAll("[data-h]"), function (x) { x.setAttribute("aria-pressed", x === b); }); };
    });
    ["#rec", "#pick"].forEach(function (id) { pane.querySelector(id).onchange = function () { if (this.files[0]) analyze(this.files[0]); this.value = ""; }; });

    function analyze(file) {
      var work = pane.querySelector("#work"), report = pane.querySelector("#report");
      report.innerHTML = "";
      work.innerHTML = '<p id="wmsg">正在加载识别模型（高精度版约 9 MB，首次需要一点时间）……</p><div class="progressbar"><i id="wbar"></i></div>';
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(file);
      vid = document.createElement("video"); vid.muted = true; vid.playsInline = true; vid.preload = "auto"; vid.src = url;
      var model;
      getModel("full").then(function (m) { model = m; return loaded(vid); }).then(function () {
        if (stopped) return;
        var dur = Math.min(vid.duration || 0, 12), step = 1 / 20, ts = [];
        if (!dur) throw new Error("读不到视频长度");
        for (var t = 0; t < dur; t += step) ts.push(t);
        frames = [];
        var bar = pane.querySelector("#wbar"), wmsg = pane.querySelector("#wmsg");
        wmsg.textContent = "正在逐帧识别……（共 " + ts.length + " 帧）";
        var base = performance.now() + 1;
        return ts.reduce(function (pr, t, n) {
          return pr.then(function () {
            if (stopped) return;
            return seek(vid, t).then(function () {
              var r = model.detectForVideo(vid, base + t * 1000);
              frames.push({ t: t, lm: r && r.landmarks && r.landmarks[0] ? r.landmarks[0] : null });
              if (n % 4 === 0) bar.style.width = (100 * n / ts.length).toFixed(0) + "%";
            });
          });
        }, Promise.resolve());
      }).then(function () {
        if (stopped) return;
        work.innerHTML = "";
        var res = ANALYZE(frames, vid.videoWidth, vid.videoHeight, SHOTS[shot], hand);
        showReport(report, res);
      }).catch(function (e) {
        work.innerHTML = '<div class="note warn">分析失败：' + C.esc(e && e.message || e) + "。可以换一段更短、光线更好的视频再试。</div>";
      });
    }
    function showReport(report, res) {
      var s = SHOTS[shot];
      if (res.error) { report.innerHTML = '<div class="card"><div class="note warn">' + C.esc(res.error) + "</div></div>"; return; }
      var good = res.metrics.filter(function (m) { return m.st === "ok"; }).length, rated = res.metrics.filter(function (m) { return m.st !== "na"; }).length;
      report.innerHTML = '<div class="card report"><p class="eyebrow">' + s.sport + " · " + s.name + "</p><h2>" + (rated ? good + " / " + rated + " 项做得好" : "分析结果") + "</h2>" +
        '<div class="shot"><canvas id="kcv"></canvas></div>' +
        '<input type="range" class="scrub" id="scrub" min="0" max="' + (frames.length - 1) + '" value="' + res.key + '"><div class="row small muted"><span class="grow" id="ftime"></span><button class="btn small" id="kbtn">回到' + C.esc(res.keyName) + '</button><button class="btn small" id="pbtn">慢放</button></div>' +
        res.metrics.map(function (m) {
          var ic = { ok: "✓", mid: "△", bad: "!", na: "–" }[m.st];
          return '<div class="metric"><span class="st ' + m.st + '">' + ic + "</span><div><b>" + C.esc(m.title) + (m.value ? ' <span class="muted" style="font-weight:500">· ' + C.esc(m.value) + "</span>" : "") + "</b><p>" + C.esc(m.advice) + "</p></div></div>";
        }).join("") +
        (res.drills.length ? '<h3 style="font-size:1rem;margin:14px 0 6px">建议加练</h3><div class="chips">' + res.drills.map(function (id) { var e = C.ex[id]; return e ? '<a class="chip acc" style="text-decoration:none" href="#/ex/' + id + '">' + C.esc(e.name) + "</a>" : ""; }).join("") + "</div>" : "") +
        '<p class="small muted" style="margin-top:12px">2D 单视角估算，仅供参考。拍摄角度偏了、球拍挡住身体时，个别项目可能不准。</p></div>';
      var kcv = report.querySelector("#kcv"), scrub = report.querySelector("#scrub"), playing = 0;
      kcv.width = vid.videoWidth; kcv.height = vid.videoHeight;
      function show(n) {
        var f = frames[n]; if (!f) return;
        return seek(vid, f.t).then(function () {
          var g = kcv.getContext("2d"); g.drawImage(vid, 0, 0, kcv.width, kcv.height);
          if (f.lm) drawPose(g, f.lm, kcv.width, kcv.height, { hot: res.hot });
          report.querySelector("#ftime").textContent = f.t.toFixed(2) + " 秒" + (n === res.key ? " · " + res.keyName : "");
        });
      }
      scrub.oninput = function () { show(+scrub.value); };
      report.querySelector("#kbtn").onclick = function () { scrub.value = res.key; show(res.key); };
      report.querySelector("#pbtn").onclick = function () {
        if (playing) { clearInterval(playing); playing = 0; return; }
        var n = 0, busy = false;
        playing = setInterval(function () {
          if (busy) return; if (n >= frames.length || stopped) { clearInterval(playing); playing = 0; return; }
          busy = true; scrub.value = n; show(n++).then(function () { busy = false; });
        }, 160);
      };
      show(res.key);
      report.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return function () { stopped = true; if (url) URL.revokeObjectURL(url); };
  }
  function loaded(v) { return new Promise(function (res, rej) { if (v.readyState >= 2) return res(); v.onloadeddata = function () { res(); }; v.onerror = function () { rej(new Error("视频格式不支持")); }; v.load(); }); }
  function seek(v, t) { return new Promise(function (res) { if (Math.abs(v.currentTime - t) < .001 && v.readyState >= 2) return res(); var done = false; v.onseeked = function () { if (!done) { done = true; res(); } }; v.currentTime = t; setTimeout(function () { if (!done) { done = true; res(); } }, 1500); }); }

  // ───────── 评估规则 ─────────
  function ANALYZE(frames, W, H, shot, hand) {
    var ok = frames.filter(function (f) { return f.lm; });
    if (ok.length < 8) return { error: "大部分画面没有识别到人。请让全身入镜、光线更亮一些再试。" };
    var R = hand === "R";
    var F = frames.map(function (f) { return f.lm ? pts(f.lm, W, H) : null; });
    var torso = median(F.filter(Boolean).map(function (p) { return p.torso; }));
    var wr = R ? "rWr" : "lWr", el = R ? "rEl" : "lEl", sh = R ? "rSh" : "lSh", ofWr = R ? "lWr" : "rWr", ofSh = R ? "lSh" : "rSh";
    var hot = R ? [12, 14, 16] : [11, 13, 15];
    // 面向：鼻子在耳朵的哪一侧
    var face = median(F.filter(Boolean).map(function (p) { return Math.sign(p.nose.x - mid(p.lEar, p.rEar).x) || 1; })) || 1;
    var metrics = [], drills = [];
    function add(st, title, value, advice, drill) { metrics.push({ st: st, title: title, value: value, advice: advice }); if (st !== "ok" && st !== "na" && drill) drill.forEach(function (d) { if (drills.indexOf(d) < 0) drills.push(d); }); }
    function minKnee(p) { return Math.min(ang(p.lHip, p.lKn, p.lAn), ang(p.rHip, p.rKn, p.rAn)); }

    if (shot.type === "lunge") {
      var best = -1, bk = 999;
      F.forEach(function (p, i) { if (p) { var k = minKnee(p); if (k < bk) { bk = k; best = i; } } });
      var p = F[best];
      var front = ang(p.lHip, p.lKn, p.lAn) < ang(p.rHip, p.rKn, p.rAn) ? "l" : "r";
      var kn = p[front + "Kn"], an = p[front + "An"], toe = p[front + "Toe"], hip = p[front + "Hip"];
      var dir = Math.sign(toe.x - an.x) || face;
      var over = (kn.x - toe.x) * dir / torso;
      var lean = Math.abs(Math.atan2(p.sh.x - p.hip.x, p.hip.y - p.sh.y) * 180 / Math.PI);
      var back = front === "l" ? "r" : "l";
      add(bk >= 80 && bk <= 125 ? "ok" : bk < 80 ? "mid" : "bad", "弓步深度（前膝角度）", Math.round(bk) + "°",
        bk > 125 ? "跨步不够深，重心偏高，够不到网前低球。多练侧弓步和箭步，加强臀腿力量。" : bk < 80 ? "蹲得很深，注意别让膝盖承受过多，回位时用臀部发力。" : "深度合适，膝盖约 90–120 度。", ["lateral_lunge", "lunge_rotate", "glute_bridge"]);
      add(over < .15 ? "ok" : over < .3 ? "mid" : "bad", "前膝位置", over < .15 ? "未明显超过脚尖" : "超过脚尖",
        over < .15 ? "膝盖在脚踝上方附近，受力合理。" : "膝盖明显超过脚尖，冲击集中在膝关节。跨步更大一点、脚跟先着地，让小腿更竖直。", ["knee_to_wall", "calf_raise"]);
      add(lean < 35 ? "ok" : "mid", "上身姿态", "前倾约 " + Math.round(lean) + "°",
        lean < 35 ? "上身保持挺直，回位更快。" : "上身前倾较多，回位慢、腰背负担大。练核心稳定和髋屈肌柔韧。", ["dead_bug", "hip_flexor"]);
      var heel = p[front + "Heel"], landHeel = heel.y > p[front + "Toe"].y - torso * .02;
      add(landHeel ? "ok" : "mid", "前脚着地", landHeel ? "脚跟先着地" : "前脚掌着地",
        landHeel ? "脚跟先着地缓冲，保护膝盖和足底。" : "到位时前脚掌受力较多，会加重足底和小腿负担。尝试脚跟先触地再过渡到全脚掌。", ["calf_wall", "plantar_wake"]);
      // 回位速度：从最低点回到膝角 >150 用时
      var tBack = null; for (var j = best; j < F.length; j++) if (F[j] && minKnee(F[j]) > 150) { tBack = frames[j].t - frames[best].t; break; }
      add(tBack == null ? "na" : tBack < .6 ? "ok" : "mid", "回位速度", tBack == null ? "视频里没有回位" : tBack.toFixed(2) + " 秒",
        tBack == null ? "视频结束时还没回位，下次多拍一点。" : tBack < .6 ? "回位迅速。" : "回位偏慢，用前脚蹬地 + 臀部发力推回中心。", ["split_step", "glute_bridge"]);
      void back;
      return { key: best, keyName: "弓步最低点", metrics: metrics, drills: drills, hot: front === "l" ? [23, 25, 27, 31] : [24, 26, 28, 32] };
    }

    // 挥拍：持拍手腕速度峰值 ≈ 击球瞬间
    var spd = F.map(function (p, i) {
      var a = F[i - 1], b = F[i + 1];
      if (!p || !a || !b) return 0;
      return dist(a[wr], b[wr]) / torso / (frames[i + 1].t - frames[i - 1].t);
    });
    var key = 0; spd.forEach(function (v, i) { if (v > spd[key]) key = i; });
    var pk = F[key];
    if (!pk) return { error: "没有找到清晰的挥拍瞬间，请换一段视频。" };
    var pre = F.slice(Math.max(0, key - 25), key).filter(Boolean), post = F.slice(key + 1, key + 20).filter(Boolean);

    if (shot.type === "overhead") {
      var elbow = ang(pk[sh], pk[el], pk[wr]);
      var height = (pk.nose.y - pk[wr].y) / torso;
      add(elbow >= 150 ? "ok" : elbow >= 130 ? "mid" : "bad", "击球时手臂伸展", Math.round(elbow) + "°",
        elbow >= 150 ? "在手臂接近伸直的最高点击球，力臂最长。" : "击球时手肘还弯着，击球点偏低偏后。引拍时手肘抬高，向上「够」球。", ["wall_angel", "er_9090", "lat_side"]);
      add(height > .6 ? "ok" : height > .3 ? "mid" : "bad", "击球点高度", height > 0 ? "高于头顶约 " + Math.round(height * 100) + "% 躯干长" : "低于头顶",
        height > .6 ? "击球点够高。" : "击球点不够高。提前移动到球的下方，让球在头顶前上方被击中。", ["split_step", "shadow_bad"]);
      var ofUp = pre.some(function (p) { return p[ofWr].y < p[ofSh].y - torso * .2; });
      add(ofUp ? "ok" : "mid", shot.serve ? "抛球手上举" : "非持拍手指向来球", ofUp ? "有" : "不明显",
        ofUp ? "非持拍手抬起，帮助瞄准和转体。" : "非持拍手没有抬起来。准备时非持拍手指向球，击球时向下拉，带动身体转动。", ["shadow_bad", "open_book"]);
      var kneePre = pre.length ? Math.min.apply(null, pre.map(minKnee)) : 180;
      add(kneePre < 155 ? "ok" : "mid", "屈膝蓄力", "最小膝角 " + Math.round(kneePre) + "°",
        kneePre < 155 ? "击球前有屈膝，下肢力量能传上来。" : "腿比较直，力量主要靠手臂。引拍时屈膝下沉，蹬地转体，减轻肩膀负担。", ["sumo_squat", "split_step"]);
      var widths = pre.concat([pk]).map(function (p) { return Math.abs(p.lSh.x - p.rSh.x) / torso; });
      var rot = widths.length ? Math.max.apply(null, widths) - Math.min.apply(null, widths) : 0;
      add(rot > .35 ? "ok" : rot > .18 ? "mid" : "bad", "转体幅度", rot > .35 ? "明显" : rot > .18 ? "一般" : "很小",
        rot > .35 ? "从侧身到正对，躯干转动充分。" : "躯干转动不够，靠手臂发力容易伤肩肘。练胸椎旋转，准备时充分侧身。", ["open_book", "lunge_rotate", "thread_needle"]);
      return { key: key, keyName: "击球瞬间", metrics: metrics, drills: drills.slice(0, 5), hot: hot };
    }

    // 网球正反手
    var front2 = face;
    var reach = (pk[wr].x - pk.hip.x) * front2 / torso;
    add(reach > .25 ? "ok" : reach > 0 ? "mid" : "bad", "击球点在身体前方", reach > 0 ? "前方约 " + Math.round(reach * 100) + "% 躯干长" : "在身体后方",
      reach > .25 ? "击球点在身体前方，能借上转体的力量。" : "击球点偏晚（离身体太近或在后面）。提前引拍、早一点向前迎球。", ["split_step", "shadow_ten"]);
    var kneePre2 = pre.length ? Math.min.apply(null, pre.map(minKnee)) : 180;
    add(kneePre2 < 155 ? "ok" : "mid", "屈膝降重心", "最小膝角 " + Math.round(kneePre2) + "°",
      kneePre2 < 155 ? "有屈膝，下盘稳定。" : "站得比较直。准备和击球时屈膝降低重心，更稳也更省肩。", ["sumo_squat", "lateral_lunge"]);
    var finish = post.length ? post[post.length - 1] : null;
    var high = finish && finish[wr].y < finish.sh.y;
    add(finish ? (high ? "ok" : "mid") : "na", "完整收拍", finish ? (high ? "收到肩上方" : "收拍偏低") : "视频结束太早",
      !finish ? "下次多拍收拍部分。" : high ? "随挥完整，减速距离长，保护手臂。" : "收拍太早停住，肘和前臂承受急停的力。让球拍自然收到对侧肩上。", ["wrist_forearm", "cross_body"]);
    var widths2 = pre.concat([pk]).map(function (p) { return Math.abs(p.lSh.x - p.rSh.x) / torso; });
    var rot2 = widths2.length ? Math.max.apply(null, widths2) - Math.min.apply(null, widths2) : 0;
    add(rot2 > .35 ? "ok" : rot2 > .18 ? "mid" : "bad", "转肩引拍", rot2 > .35 ? "充分" : rot2 > .18 ? "一般" : "很小",
      rot2 > .35 ? "引拍时肩膀转开，力量来自躯干。" : "转肩不够，主要靠手臂挥。引拍时先转肩，让后背对着球网多一点。", ["open_book", "lunge_rotate"]);
    var elbow2 = ang(pk[sh], pk[el], pk[wr]);
    add(shot.back ? (elbow2 > 140 ? "ok" : "mid") : (elbow2 > 100 ? "ok" : "mid"), "击球时手臂", Math.round(elbow2) + "°",
      shot.back ? (elbow2 > 140 ? "单反/双反击球时手臂舒展。" : "手肘弯曲较多，注意别用手腕甩，容易引起网球肘。") : (elbow2 > 100 ? "手臂舒展适中。" : "手臂夹得太紧，击球空间不足。脚步调整，让球离身体一臂距离。"), ["wrist_forearm", "er_9090"]);
    return { key: key, keyName: "击球瞬间", metrics: metrics, drills: drills.slice(0, 5), hot: hot };
  }
  function median(a) { if (!a.length) return 1; var s = a.slice().sort(function (x, y) { return x - y; }); return s[Math.floor(s.length / 2)]; }

  window.Coach = { render: render, analyze: ANALYZE, getModel: getModel };
})();
