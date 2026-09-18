/* global NG */
var NG = window.NG || {};

/**
 * 背景动态层：暗蓝漂浮光点 + 轻视差。
 * 尊重 settings.motion / prefers-reduced-motion；无 canvas 时静默跳过。
 */
NG.startAmbiance = function (opts) {
  opts = opts || {};
  if (NG._ambiance) {
    NG._ambiance.setEnabled(opts.enabled !== false);
    return NG._ambiance;
  }

  var canvas = document.createElement("canvas");
  canvas.className = "bg-ambiance";
  canvas.setAttribute("aria-hidden", "true");
  document.body.insertBefore(canvas, document.body.firstChild);
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;

  var particles = [];
  var running = false;
  var enabled = opts.enabled !== false;
  var raf = 0;
  var mx = 0.5;
  var my = 0.5;
  var tx = 0.5;
  var ty = 0.5;
  var last = 0;

  function reduced() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed(Math.max(18, Math.floor((window.innerWidth * window.innerHeight) / 52000)));
  }

  function seed(n) {
    particles = [];
    for (var i = 0; i < n; i++) {
      particles.push({
        x: Math.random(),
        y: Math.random(),
        r: 1.2 + Math.random() * 2.8,
        a: 0.08 + Math.random() * 0.18,
        vx: (Math.random() - 0.5) * 0.00012,
        vy: -0.00004 - Math.random() * 0.0001,
        pulse: Math.random() * Math.PI * 2,
        warm: Math.random() > 0.72,
      });
    }
  }

  function frame(t) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (!enabled || reduced()) {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      return;
    }
    var dt = Math.min(40, t - (last || t));
    last = t;
    mx += (tx - mx) * 0.04;
    my += (ty - my) * 0.04;
    var w = window.innerWidth;
    var h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    var ox = (mx - 0.5) * 28;
    var oy = (my - 0.5) * 18;
    var g = ctx.createRadialGradient(w * 0.2 + ox, h * 0.15 + oy, 0, w * 0.25, h * 0.2, w * 0.55);
    g.addColorStop(0, "rgba(70, 120, 170, 0.16)");
    g.addColorStop(1, "rgba(70, 120, 170, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    var g2 = ctx.createRadialGradient(w * 0.85 + ox * 0.5, h * 0.8 + oy * 0.5, 0, w * 0.8, h * 0.85, w * 0.45);
    g2.addColorStop(0, "rgba(40, 90, 130, 0.14)");
    g2.addColorStop(1, "rgba(40, 90, 130, 0)");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w, h);

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.pulse += dt * 0.0018;
      if (p.y < -0.05) p.y = 1.05;
      if (p.x < -0.05) p.x = 1.05;
      if (p.x > 1.05) p.x = -0.05;
      var alpha = p.a * (0.65 + 0.35 * Math.sin(p.pulse));
      ctx.beginPath();
      ctx.fillStyle = p.warm
        ? "rgba(180, 210, 170," + alpha + ")"
        : "rgba(140, 180, 220," + alpha + ")";
      ctx.arc(p.x * w + ox * 0.35, p.y * h + oy * 0.35, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function onMove(e) {
    tx = e.clientX / window.innerWidth;
    ty = e.clientY / window.innerHeight;
  }

  function start() {
    if (running) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", onMove, { passive: true });
  resize();
  start();

  NG._ambiance = {
    setEnabled: function (on) {
      enabled = !!on;
      if (!enabled) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    },
    pulseBrand: function () {
      var brand = document.querySelector(".brand");
      if (!brand || !enabled || reduced()) return;
      brand.classList.remove("brand-pulse");
      void brand.offsetWidth;
      brand.classList.add("brand-pulse");
    },
    dispose: function () {
      stop();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      NG._ambiance = null;
    },
  };
  return NG._ambiance;
};

NG.tickHudGlow = function (el) {
  if (!el || !NG._ambiance) return;
  el.classList.remove("hud-flash");
  void el.offsetWidth;
  el.classList.add("hud-flash");
};
