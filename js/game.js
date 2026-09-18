/* global NG */
(function () {
  var settings = NG.loadSettings();
  NG.mergeCloudSettings(settings);
  var stats = NG.loadStats();
  var diffEl = document.getElementById("diff");
  var lessonEl = document.getElementById("lesson");
  var lessonField = document.getElementById("lesson-field");
  var customEl = document.getElementById("custom");
  var boardEl = document.getElementById("board");
  var boardWrap = document.getElementById("board-wrap");
  var statusEl = document.getElementById("status");
  var mineEl = document.getElementById("mine-count");
  var timerEl = document.getElementById("timer");
  var progressEl = document.getElementById("progress");
  var overlay = document.getElementById("overlay");
  var pauseLayer = document.getElementById("pause-layer");
  var modal = document.getElementById("modal");
  var modalTitle = document.getElementById("modal-title");
  var modalBody = document.getElementById("modal-body");

  var rows = 9, cols = 9, mineTotal = 10, cellSize = settings.cell || 32;
  var numbers = null, mines = null, neigh = null;
  var open, flags, started = false, ended = false, generating = false;
  var openCount = 0, flagCount = 0, clickCount = 0;
  var seed = 0, startR = -1, startC = -1, fixedStart = false;
  var elapsed = 0, tickId = null, paused = false, runningSince = 0;
  var undoStack = [], redoStack = [], actions = [];
  var cursor = 0, pending = -1, flagMode = false, suppress = false;
  var pressTimer = null, bbbv = 0, lessonText = "";
  var pointers = new Map();
  var pan = { active: false, x: 0, y: 0, sx: 0, sy: 0 };
  var replay = { on: false, index: 0, actions: [], timer: null };
  var lastRecord = null;

  function $(id) { return document.getElementById(id); }

  function applyChrome() {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.palette = settings.palette;
    document.documentElement.dataset.large = settings.largeText ? "1" : "0";
    document.documentElement.style.setProperty("--cell-size", cellSize + "px");
    document.querySelectorAll(".mode-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.mode === settings.mode);
    });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", settings.theme === "classic" || settings.theme === "pixel" ? "#7aa8a0" : "#152a45");
    }
    if (NG._ambiance) {
      NG._ambiance.setEnabled(settings.motion !== false && (settings.theme === "soft" || settings.theme === "dark"));
    }
  }

  function fillDiffs() {
    diffEl.innerHTML = "";
    var groups = {};
    Object.keys(NG.DIFFS).forEach(function (id) {
      var d = NG.DIFFS[id];
      groups[d.group] = groups[d.group] || [];
      groups[d.group].push(d);
    });
    Object.keys(groups).forEach(function (name) {
      var og = document.createElement("optgroup");
      og.label = name;
      groups[name].forEach(function (d) {
        var o = document.createElement("option");
        o.value = d.id;
        o.textContent = d.label + " · " + d.cols + "×" + d.rows + "/" + d.mines;
        og.appendChild(o);
      });
      diffEl.appendChild(og);
    });
    ["daily", "custom", "lesson"].forEach(function (id) {
      var o = document.createElement("option");
      o.value = id;
      o.textContent = { daily: "每日挑战", custom: "自定义", lesson: "教学关卡" }[id];
      diffEl.appendChild(o);
    });
    diffEl.value = settings.diff || "easy";
    lessonEl.innerHTML = "";
    NG.LESSONS.forEach(function (ls, i) {
      var o = document.createElement("option");
      o.value = String(i);
      o.textContent = ls.title;
      lessonEl.appendChild(o);
    });
  }

  function currentSpec() {
    var id = diffEl.value;
    if (NG.DIFFS[id]) return Object.assign({ kind: "preset" }, NG.DIFFS[id]);
    if (id === "custom") {
      var cols = clampNum($("cw").value, 5, 50);
      var rows = clampNum($("ch").value, 5, 40);
      if (rows * cols > 1400) {
        rows = Math.min(rows, Math.floor(1400 / cols));
        if (rows < 5) { rows = 5; cols = Math.min(cols, 50); }
      }
      var area = rows * cols;
      var mines = clampNum($("cm").value, 1, Math.max(1, area - 10));
      var hi = Math.floor(area * 0.18);
      var lo = Math.max(1, Math.floor(area * 0.05));
      if (mines > hi) mines = hi;
      if (mines < lo && Number($("cm").value) >= lo) mines = lo;
      return {
        kind: "custom", id: "custom", label: "自定义",
        cols: cols, rows: rows, mines: mines, cell: area > 400 ? 22 : 28,
      };
    }
    if (id === "lesson") {
      var ls = NG.LESSONS[Number(lessonEl.value) || 0];
      return { kind: "lesson", id: "lesson", label: ls.title, rows: ls.rows, cols: ls.cols, mines: ls.mines.length, cell: 40, lesson: ls };
    }
    var base = NG.DIFFS.medium;
    return Object.assign({ kind: "daily", id: "daily", label: "每日" }, base);
  }

  function clampNum(v, a, b) {
    var n = Number(v);
    if (!isFinite(n)) n = a;
    return NG.clamp(n | 0, a, b);
  }

  function resetBoard() {
    stopTick();
    var spec = currentSpec();
    rows = spec.rows; cols = spec.cols; mineTotal = spec.mines;
    if (spec.cell) cellSize = spec.cell;
    neigh = NG.buildNeighbors(rows, cols);
    numbers = null; mines = null;
    open = new Uint8Array(rows * cols);
    flags = new Uint8Array(rows * cols);
    started = false; ended = false; generating = false;
    openCount = 0; flagCount = 0; clickCount = 0;
    elapsed = 0; paused = false; bbbv = 0;
    undoStack = []; redoStack = []; actions = [];
    pending = -1; cursor = ((rows / 2) | 0) * cols + ((cols / 2) | 0);
    fixedStart = false; startR = -1; startC = -1;
    lessonText = "";
    replay.on = false;
    hide(overlay); hide(pauseLayer);
    clearFx();
    $("face-btn").textContent = "◎";
    paintHud();
    renderGrid();
    lessonField.classList.toggle("hidden", spec.kind !== "lesson");
    customEl.classList.toggle("hidden", spec.kind !== "custom");
    if (spec.kind === "lesson") setupLesson(spec.lesson);
    else if (spec.kind === "daily") setupSeeded(dailyKey(), spec);
    else if (location.hash.indexOf("s=") >= 0 && !resetBoard.ignoreHash) setupFromHash();
    else say("左键翻开，右键插旗。点任意格开始。");
  }

  function dailyKey() {
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate() + "-" + diffEl.value;
  }

  function setupFromHash() {
    var q = new URLSearchParams(location.hash.slice(1));
    if (!q.get("s")) return;
    var spec = {
      rows: Number(q.get("h")) || rows,
      cols: Number(q.get("w")) || cols,
      mines: Number(q.get("m")) || mineTotal,
    };
    rows = spec.rows; cols = spec.cols; mineTotal = spec.mines;
    neigh = NG.buildNeighbors(rows, cols);
    open = new Uint8Array(rows * cols);
    flags = new Uint8Array(rows * cols);
    renderGrid();
    setupSeeded(q.get("s"), spec, Number(q.get("r")), Number(q.get("c")));
    if (q.get("mode")) settings.mode = q.get("mode");
    applyChrome();
  }

  function setupSeeded(key, spec, r, c) {
    seed = typeof key === "number" ? key : NG.hashSeed(key);
    var rng = NG.mulberry32(seed);
    startR = isFinite(r) && r >= 0 ? r : 1 + ((rng() * (rows - 2)) | 0);
    startC = isFinite(c) && c >= 0 ? c : 1 + ((rng() * (cols - 2)) | 0);
    if (startR < 0 || startR >= rows) startR = (rows / 2) | 0;
    if (startC < 0 || startC >= cols) startC = (cols / 2) | 0;
    fixedStart = true;
    numbers = null;
    mines = null;
    say("正在生成今日局面…");
    cellBtn(startR, startC).classList.add("start");
    generating = true;
    $("face-btn").textContent = "…";
    setTimeout(function () {
      var res = NG.generate({
        rows: rows, cols: cols, mines: mineTotal,
        startR: startR, startC: startC,
        rng: NG.mulberry32(seed),
        budget: mineTotal > 80 ? 1600 : 900,
      });
      generating = false;
      $("face-btn").textContent = "◎";
      if (!res.ok) {
        say(res.reason || "生成失败，请换难度或稍后再试。");
        return;
      }
      numbers = res.numbers;
      mines = res.mines;
      bbbv = res.bbbv;
      say("请从发光格子开始 · 开口 " + res.opening);
      paintAll();
      paintHud();
    }, 20);
  }

  function setupLesson(ls) {
    lessonText = ls.title + "：" + ls.text;
    var built = minesToBoard(ls.rows, ls.cols, ls.mines);
    numbers = built.numbers;
    mines = built.mines;
    neigh = built.neigh;
    startR = ls.startR; startC = ls.startC;
    fixedStart = true;
    seed = NG.hashSeed(ls.id);
    if (!ls.forceOpen && !NG.proveSolvable(rows, cols, numbers, NG.idx(startR, startC, cols))) {
      say("这一关布局有问题。");
      return;
    }
    bbbv = NG.compute3BV(rows, cols, numbers);
    started = true;
    if (ls.forceOpen) {
      ls.forceOpen.forEach(function (i) {
        if (numbers[i] >= 0) {
          open[i] = 1;
          openCount++;
        }
      });
    } else {
      flood(NG.idx(startR, startC, cols));
    }
    say(lessonText);
    paintAll();
    paintHud();
  }

  function minesToBoard(r, c, list) {
    var n = r * c;
    var m = new Uint8Array(n);
    list.forEach(function (i) { m[i] = 1; });
    var nb = NG.buildNeighbors(r, c);
    var num = new Int8Array(n);
    for (var i = 0; i < n; i++) {
      if (m[i]) { num[i] = -1; continue; }
      var k = 0;
      nb[i].forEach(function (j) { if (m[j]) k++; });
      num[i] = k;
    }
    return { mines: m, numbers: num, neigh: nb };
  }

  function renderGrid() {
    boardEl.style.gridTemplateColumns = "repeat(" + cols + ", var(--cell-size))";
    boardEl.innerHTML = "";
    var frag = document.createDocumentFragment();
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "cell";
        b.dataset.i = String(r * cols + c);
        b.setAttribute("role", "gridcell");
        b.setAttribute("aria-label", "第 " + (r + 1) + " 行第 " + (c + 1) + " 列");
        frag.appendChild(b);
      }
    }
    boardEl.appendChild(frag);
    if (fixedStart && startR >= 0 && !started) cellBtn(startR, startC).classList.add("start");
    paintCursor();
  }

  function cellBtn(r, c) { return boardEl.children[r * cols + c]; }
  function btnAt(i) { return boardEl.children[i]; }

  function paintHud() {
    mineEl.textContent = String(Math.max(0, mineTotal - flagCount));
    var safe = rows * cols - mineTotal;
    progressEl.textContent = safe ? Math.min(100, Math.round(openCount / safe * 100)) + "%" : "0%";
    timerEl.textContent = settings.mode === "zen" ? "禅" : formatTime(nowElapsed());
  }

  function formatTime(ms) {
    var s = Math.floor(ms / 1000);
    var cs = Math.floor((ms % 1000) / 10);
    var m = Math.floor(s / 60);
    var ss = String(s % 60).padStart(2, "0");
    return (m ? m + ":" : "") + ss + "." + String(cs).padStart(2, "0");
  }

  function nowElapsed() {
    if (!started || settings.mode === "zen") return elapsed;
    if (paused || !runningSince) return elapsed;
    return elapsed + (performance.now() - runningSince);
  }

  function startTick() {
    if (tickId || settings.mode === "zen") return;
    runningSince = performance.now();
    tickId = setInterval(paintHud, 50);
  }
  function stopTick() {
    if (tickId) clearInterval(tickId);
    tickId = null;
    if (runningSince) {
      elapsed += performance.now() - runningSince;
      runningSince = 0;
    }
  }

  function say(text) { statusEl.textContent = text; }
  function hide(el) { el.classList.add("hidden"); }
  function show(el) {
    el.classList.remove("hidden");
    if (el === overlay || el === pauseLayer) {
      el.style.animation = "none";
      void el.offsetWidth;
      el.style.animation = "";
      var card = el.querySelector(".overlay-card");
      if (card) {
        card.style.animation = "none";
        void card.offsetWidth;
        card.style.animation = "";
      }
    }
  }

  function paintCursor() {
    for (var i = 0; i < boardEl.children.length; i++) boardEl.children[i].classList.remove("cursor");
    if (btnAt(cursor)) btnAt(cursor).classList.add("cursor");
  }

  function paintAll() {
    for (var i = 0; i < rows * cols; i++) paintCell(i);
    paintCursor();
  }

  function motionOn() {
    if (settings.motion === false) return false;
    return !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function paintCell(i, opts) {
    opts = opts || {};
    var el = btnAt(i);
    if (!el) return;
    var r = (i / cols) | 0, c = i % cols;
    var keepHit = el.classList.contains("hit");
    el.className = "cell";
    el.textContent = "";
    el.style.removeProperty("--reveal-delay");
    el.disabled = false;
    if (i === cursor) el.classList.add("cursor");
    if (!started && fixedStart && r === startR && c === startC) el.classList.add("start");
    if (flags[i] && !open[i]) {
      el.classList.add("flagged");
      if (opts.flagPop && motionOn()) el.classList.add("flag-pop");
      if (showErr() && mines && !mines[i]) el.classList.add("bad-flag");
      return;
    }
    if (!open[i]) return;
    el.classList.add("open");
    if (opts.reveal && motionOn()) {
      el.classList.add("reveal");
      el.style.setProperty("--reveal-delay", (opts.delay || 0) + "ms");
    }
    if (numbers && numbers[i] < 0) {
      el.classList.add("mine");
      if (opts.minePop && motionOn()) {
        el.classList.add("mine-pop");
        el.style.setProperty("--reveal-delay", (opts.delay || 0) + "ms");
      }
      if (keepHit || opts.hit) el.classList.add("hit");
      return;
    }
    var n = numbers ? numbers[i] : 0;
    if (n > 0) {
      el.classList.add("n" + n);
      el.textContent = String(n);
    }
  }

  function showErr() {
    return settings.errors && settings.mode !== "speed" && started;
  }

  function assistOn() {
    return settings.mode !== "speed";
  }

  function pushUndo() {
    undoStack.push({
      open: open.slice(), flags: flags.slice(),
      openCount: openCount, flagCount: flagCount, ended: ended,
    });
    if (undoStack.length > 80) undoStack.shift();
    redoStack = [];
  }

  function restore(s) {
    open = s.open; flags = s.flags;
    openCount = s.openCount; flagCount = s.flagCount; ended = s.ended;
    hide(overlay);
    paintAll(); paintHud();
  }

  function undo() {
    if (settings.mode === "speed" || !undoStack.length || generating) return;
    redoStack.push({
      open: open.slice(), flags: flags.slice(),
      openCount: openCount, flagCount: flagCount, ended: ended,
    });
    restore(undoStack.pop());
  }
  function redo() {
    if (settings.mode === "speed" || !redoStack.length) return;
    undoStack.push({
      open: open.slice(), flags: flags.slice(),
      openCount: openCount, flagCount: flagCount, ended: ended,
    });
    restore(redoStack.pop());
  }

  function beginAt(r, c) {
    if (fixedStart && (r !== startR || c !== startC)) {
      say("请从发光的格子开始。");
      return;
    }
    if (numbers) {
      started = true;
      startTick();
      flood(NG.idx(r, c, cols));
      afterMove();
      return;
    }
    generating = true;
    say("正在生成局面…");
    $("face-btn").textContent = "…";
    setTimeout(function () {
      var base = seed || ((Date.now() ^ (r * 131 + c)) >>> 0);
      if (!fixedStart) seed = base;
      var deg = neigh[NG.idx(r, c, cols)].length;
      var t0 = performance.now();
      var cells = rows * cols;
      var budget = cells > 900 ? 2800 : cells > 400 ? 1800 : mineTotal > 80 ? 1200 : deg <= 3 ? 900 : 650;
      var tries = fixedStart ? 1 : cells > 400 ? 4 : deg <= 3 ? 8 : 5;
      var best = null;
      var bestSeed = seed;
      for (var t = 0; t < tries; t++) {
        if (performance.now() - t0 > budget) break;
        var useSeed = fixedStart ? seed : ((base + t * 104729) >>> 0);
        var res = NG.generate({
          rows: rows, cols: cols, mines: mineTotal,
          startR: r, startC: c,
          rng: NG.mulberry32(useSeed),
          budget: Math.max(80, budget - (performance.now() - t0)),
        });
        if (!res || !res.ok) continue;
        if (!best || res.opening > best.opening || (res.opening === best.opening && res.bbbv > best.bbbv)) {
          best = res;
          bestSeed = useSeed;
        }
        if (best.opening >= (deg <= 3 ? 8 : 12)) break;
        if (fixedStart) break;
      }
      generating = false;
      $("face-btn").textContent = "◎";
      if (!best) {
        say("这个雷密度生成不了，请减少雷数或换一个起点。");
        return;
      }
      if (!fixedStart) seed = bestSeed;
      numbers = best.numbers;
      mines = best.mines;
      bbbv = best.bbbv;
      startR = r; startC = c;
      started = true;
      startTick();
      flood(NG.idx(r, c, cols));
      writeHash();
      say("已开局 · 开口 " + best.opening);
      afterMove();
    }, 20);
  }

  function writeHash() {
    var q = new URLSearchParams();
    q.set("d", diffEl.value);
    q.set("s", String(seed));
    q.set("r", String(startR));
    q.set("c", String(startC));
    q.set("w", String(cols));
    q.set("h", String(rows));
    q.set("m", String(mineTotal));
    q.set("mode", settings.mode);
    history.replaceState(null, "", "#" + q.toString());
  }

  function flood(i) {
    var stack = [i];
    var originR = (i / cols) | 0;
    var originC = i % cols;
    var animate = motionOn();
    while (stack.length) {
      var cur = stack.pop();
      if (open[cur] || flags[cur] || !numbers || numbers[cur] < 0) continue;
      open[cur] = 1;
      openCount++;
      var cr = (cur / cols) | 0;
      var cc = cur % cols;
      var dist = Math.abs(cr - originR) + Math.abs(cc - originC);
      paintCell(cur, animate ? { reveal: true, delay: Math.min(280, dist * 22) } : null);
      if (numbers[cur] === 0) neigh[cur].forEach(function (j) { stack.push(j); });
    }
  }

  function openCell(r, c) {
    if (ended || paused || generating || (replay.on && !replay.stepping)) return;
    var i = r * cols + c;
    if (flags[i]) return;
    if (!started) {
      clickCount++;
      actions.push({ t: 0, op: "open", r: r, c: c });
      beginAt(r, c);
      return;
    }
    if (open[i]) return;
    if (settings.confirm && pending !== i) {
      pending = i;
      say("再点一次确认翻开。");
      return;
    }
    pending = -1;
    pushUndo();
    clickCount++;
    actions.push({ t: Math.round(nowElapsed()), op: "open", r: r, c: c });
    blip(520, 0.03);
    if (mines[i]) {
      if (settings.mode === "zen" || settings.mineClick === "block") {
        btnAt(i).classList.add("shake");
        say("这一格是雷。禅模式不会因此结束。");
        undoStack.pop();
        return;
      }
      lose(i);
      return;
    }
    flood(i);
    afterMove();
  }

  function toggleFlag(r, c) {
    if (ended || paused || generating || (replay.on && !replay.stepping) || settings.noFlag) return;
    var i = r * cols + c;
    if (open[i]) return;
    if (settings.mode !== "speed") pushUndo();
    var placing = !flags[i];
    if (flags[i]) { flags[i] = 0; flagCount--; }
    else { flags[i] = 1; flagCount++; blip(340, 0.03); }
    actions.push({ t: Math.round(nowElapsed()), op: "flag", r: r, c: c });
    paintCell(i, placing ? { flagPop: true } : null);
    paintHud();
    refreshAssist();
  }

  function chord(r, c) {
    if (!started || ended || settings.noFlag) return;
    var i = r * cols + c;
    if (!open[i] || !numbers || numbers[i] <= 0) return;
    var nflags = 0, hidden = [];
    neigh[i].forEach(function (j) {
      if (flags[j]) nflags++;
      else if (!open[j]) hidden.push(j);
    });
    if (nflags !== numbers[i]) return;
    hidden.forEach(function (j) { openCell((j / cols) | 0, j % cols); });
  }

  function afterMove() {
    paintHud();
    refreshAssist();
    if (openCount + mineTotal >= rows * cols) win();
  }

  function clearFx() {
    var layer = $("fx-layer");
    if (layer) layer.innerHTML = "";
    boardWrap.classList.remove("win-glow", "lose-dim");
    overlay.classList.remove("lose-fx");
  }

  function ensureFxLayer() {
    var layer = $("fx-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "fx-layer";
      layer.className = "fx-layer";
      layer.setAttribute("aria-hidden", "true");
      boardWrap.appendChild(layer);
    }
    return layer;
  }

  function spawnSparks(count) {
    if (!motionOn()) return;
    var layer = ensureFxLayer();
    layer.innerHTML = "";
    var rect = boardEl.getBoundingClientRect();
    var wrap = boardWrap.getBoundingClientRect();
    for (var n = 0; n < count; n++) {
      var el = document.createElement("span");
      el.className = "fx-spark";
      var x = (rect.left - wrap.left) + Math.random() * rect.width;
      var y = (rect.top - wrap.top) + Math.random() * rect.height * 0.7;
      el.style.left = x + "px";
      el.style.top = y + "px";
      el.style.setProperty("--dx", ((Math.random() - 0.5) * 80) + "px");
      el.style.setProperty("--dy", (-30 - Math.random() * 50) + "px");
      el.style.animationDelay = (Math.random() * 180) + "ms";
      layer.appendChild(el);
    }
    setTimeout(function () { if (layer) layer.innerHTML = ""; }, 1200);
  }

  function spawnBoomAt(i) {
    if (!motionOn()) return;
    var cell = btnAt(i);
    if (!cell) return;
    var layer = ensureFxLayer();
    var cr = cell.getBoundingClientRect();
    var wrap = boardWrap.getBoundingClientRect();
    var el = document.createElement("span");
    el.className = "fx-boom";
    el.style.left = (cr.left - wrap.left + cr.width / 2 - 22) + "px";
    el.style.top = (cr.top - wrap.top + cr.height / 2 - 22) + "px";
    layer.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 800);
  }

  function win() {
    ended = true;
    stopTick();
    if (mines) {
      for (var i = 0; i < mines.length; i++) {
        if (mines[i] && !flags[i]) { flags[i] = 1; flagCount++; paintCell(i, { flagPop: true }); }
      }
    }
    $("face-btn").textContent = "✿";
    var ms = Math.round(nowElapsed());
    var bbvs = ms > 0 ? (bbbv / (ms / 1000)).toFixed(2) : "0";
    var cps = ms > 0 ? (clickCount / (ms / 1000)).toFixed(2) : "0";
    say("通关。");
    $("overlay-title").textContent = "胜利";
    $("overlay-msg").textContent = "用时 " + formatTime(ms) + " · 3BV " + bbbv + " · 3BV/s " + bbvs;
    overlay.classList.remove("lose-fx");
    if (motionOn()) {
      boardWrap.classList.add("win-glow");
      spawnSparks(Math.min(18, 8 + ((rows * cols) / 40) | 0));
    }
    show(overlay);
    blip(660, 0.04);
    if (settings.sound) setTimeout(function () { blip(880, 0.03); }, 90);
    if (NG._ambiance) NG._ambiance.pulseBrand();
    NG.tickHudGlow($("face-btn"));
    record(true, ms, bbvs, cps);
    maybeSubmitDaily(ms);
    maybeAutoBackup();
    if (settings.mode !== "zen") {
      stats.streak = (stats.streak || 0) + 1;
      stats.lossStreak = 0;
      NG.saveStats(stats);
      var next = NG.nextDiff(diffEl.value, 1);
      if (stats.streak >= 3 && next) {
        say("连胜 " + stats.streak + " 局，下一局升到「" + NG.DIFFS[next].label + "」。");
        overlay.dataset.nextDiff = next;
      } else {
        delete overlay.dataset.nextDiff;
      }
    }
  }

  function lose(i) {
    ended = true;
    stopTick();
    open[i] = 1;
    paintCell(i, { hit: true, minePop: true });
    spawnBoomAt(i);
    if (motionOn()) boardWrap.classList.add("lose-dim");
    if (mines) {
      var hitR = (i / cols) | 0;
      var hitC = i % cols;
      var list = [];
      for (var k = 0; k < mines.length; k++) {
        if (!mines[k] || k === i) continue;
        list.push(k);
      }
      list.sort(function (a, b) {
        var ar = (a / cols) | 0, ac = a % cols;
        var br = (b / cols) | 0, bc = b % cols;
        return (Math.abs(ar - hitR) + Math.abs(ac - hitC)) - (Math.abs(br - hitR) + Math.abs(bc - hitC));
      });
      list.forEach(function (k, idx) {
        open[k] = 1;
        paintCell(k, motionOn() ? { minePop: true, delay: Math.min(420, 40 + idx * 28) } : { minePop: false });
      });
    }
    $("face-btn").textContent = "✧";
    say("踩雷了。");
    $("overlay-title").textContent = "再试一次";
    $("overlay-msg").textContent = "可以重新开局。";
    overlay.classList.add("lose-fx");
    show(overlay);
    record(false, Math.round(nowElapsed()), "0", "0");
    stats.streak = 0;
    stats.lossStreak = (stats.lossStreak || 0) + 1;
    var easier = NG.nextDiff(diffEl.value, -1);
    if (stats.lossStreak >= 3 && easier) {
      say("连续未过，下一局降到「" + NG.DIFFS[easier].label + "」。");
      overlay.dataset.nextDiff = easier;
    } else {
      delete overlay.dataset.nextDiff;
    }
    NG.saveStats(stats);
  }

  function maybeSubmitDaily(ms) {
    if (diffEl.value !== "daily") return;
    if (!NG.cloudAvailable(settings)) return;
    var entry = {
      day: dailyKey().split("-").slice(0, 3).join("-"),
      diff: "daily",
      mode: settings.mode,
      ms: ms,
      seed: seed,
      startR: startR,
      startC: startC,
      bbbv: bbbv,
      name: (settings.cloud && settings.cloud.displayName) || "匿名",
    };
    NG.submitDaily(settings, entry).then(function (res) {
      say("已提交今日成绩" + (res.rank ? " · 第 " + res.rank + " 名" : "") + "。");
    }).catch(function () {
      /* 榜挂了不影响通关 */
    });
  }

  function maybeAutoBackup() {
    if (!settings.cloud || !settings.cloud.autoBackup) return;
    if (!NG.cloudAvailable(settings) || !(settings.cloud.syncKey || "").length) return;
    NG.pushBackup(settings, stats).catch(function () {});
  }

  function applyCloudPayload(data) {
    if (data.settings) {
      settings = Object.assign(NG.defaultSettings(), data.settings);
      NG.mergeCloudSettings(settings);
    }
    if (data.stats) stats = data.stats;
    NG.saveSettings(settings);
    NG.saveStats(stats);
    cellSize = settings.cell || cellSize;
    applyChrome();
  }

  function record(won, ms, bbvs, cps) {
    var entry = {
      won: won, ms: ms, diff: diffEl.value, mode: settings.mode,
      rows: rows, cols: cols, mines: mineTotal, bbbv: bbbv,
      bbvs: Number(bbvs), cps: Number(cps), clicks: clickCount,
      seed: seed, startR: startR, startC: startC, at: Date.now(),
      actions: actions.slice(),
    };
    lastRecord = entry;
    stats.games.push(entry);
    var key = entry.diff + ":" + entry.mode;
    if (won) {
      var prev = stats.best[key];
      if (!prev || ms < prev.ms) stats.best[key] = { ms: ms, bbbv: bbbv, bbvs: Number(bbvs), at: Date.now() };
      if (entry.diff === "daily" || (typeof seed === "number" && fixedStart)) {
        var day = dailyKey();
        if (!stats.daily) stats.daily = {};
        var dprev = stats.daily[day];
        if (!dprev || ms < dprev.ms) {
          stats.daily[day] = { ms: ms, bbvs: Number(bbvs), mode: entry.mode, at: Date.now() };
        }
      }
    }
    NG.saveStats(stats);
  }

  function visibleArr() {
    var v = new Int8Array(rows * cols);
    v.fill(-1);
    if (!numbers) return v;
    for (var i = 0; i < v.length; i++) if (open[i]) v[i] = numbers[i];
    return v;
  }

  function analyze() {
    if (!started || !numbers) return null;
    return NG.analyze({
      rows: rows, cols: cols, neigh: neigh,
      open: open, flags: flags, visible: visibleArr(),
      mineTotal: mineTotal,
      wantProb: settings.assist === "prob" && assistOn(),
    });
  }

  function refreshAssist() {
    for (var i = 0; i < boardEl.children.length; i++) {
      boardEl.children[i].classList.remove("hint-safe", "hint-mine", "prob");
    }
    if (!assistOn() || settings.assist === "off" || settings.assist === "hint") return;
    var info = analyze();
    if (!info) return;
    info.safe.forEach(function (i) { if (!open[i] && !flags[i]) btnAt(i).classList.add("hint-safe"); });
    if (settings.assist === "prob" && info.probs) {
      Object.keys(info.probs).forEach(function (k) {
        var el = btnAt(Number(k));
        if (!el || open[k] || flags[k]) return;
        el.classList.add("prob");
        el.textContent = Math.round(info.probs[k] * 100);
      });
    }
  }

  function hint() {
    if (!assistOn()) { say("竞速模式不能用提示。"); return; }
    var info = analyze();
    if (!info) { say("先翻开第一格。"); return; }
    if (info.contradiction) { say("旗和数字矛盾，可能插错了。"); return; }
    var chain = buildChain(info, 3);
    if (!chain.length) {
      say(info.guess.length ? "还有 " + info.guess.length + " 格暂时推不出来。" : "没有未知格了。");
      return;
    }
    chain.forEach(function (pick) {
      btnAt(pick.i).classList.add(pick.mine ? "hint-mine" : "hint-safe");
    });
    var first = chain[0];
    var head = "第 " + (((first.i / cols) | 0) + 1) + " 行第 " + ((first.i % cols) + 1) + " 列" + (first.mine ? "是雷。" : "安全。") + first.why;
    if (chain.length > 1) {
      head += " 还可再推 " + (chain.length - 1) + " 步。";
    }
    say(head);
  }

  function buildChain(info, limit) {
    var picks = [];
    var used = {};
    var simOpen = open.slice();
    var simFlags = flags.slice();
    void info;
    for (var step = 0; step < limit; step++) {
      var cur = NG.analyze({
        rows: rows, cols: cols, neigh: neigh,
        open: simOpen, flags: simFlags,
        visible: visibleFrom(simOpen),
        mineTotal: mineTotal,
        wantProb: false,
      });
      if (!cur || cur.contradiction) break;
      var pick = clearest(cur, simOpen, simFlags);
      if (!pick || used[pick.i]) break;
      used[pick.i] = 1;
      picks.push(pick);
      if (pick.mine) simFlags[pick.i] = 1;
      else simOpen[pick.i] = 1;
    }
    return picks;
  }

  function visibleFrom(openArr) {
    var v = new Int8Array(rows * cols);
    v.fill(-1);
    if (!numbers) return v;
    for (var i = 0; i < v.length; i++) if (openArr[i]) v[i] = numbers[i];
    return v;
  }

  function clearest(info, openArr, flagsArr) {
    var explained = explainLocal(openArr || open, flagsArr || flags);
    var best = null;
    function consider(i, mine, score, why) {
      if (!best || score > best.score) best = { i: i, mine: mine, score: score, why: why };
    }
    info.mines.forEach(function (i) {
      var e = explained[i];
      if (e && e.mine) consider(i, true, e.score, e.why);
      else consider(i, true, 15, "把它换成安全格会和某个数字矛盾。");
    });
    info.safe.forEach(function (i) {
      var e = explained[i];
      if (e && !e.mine) consider(i, false, e.score, e.why);
      else consider(i, false, 15, "现有数字把这一格排除出了雷的位置。");
    });
    return best;
  }

  function explainLocal(openArr, flagsArr) {
    var found = {};
    function add(i, mine, score, why) {
      var prev = found[i];
      if (!prev || score > prev.score) found[i] = { mine: mine, score: score, why: why };
    }
    var cons = [];
    var n = rows * cols;
    for (var i = 0; i < n; i++) {
      if (!openArr[i] || !numbers || numbers[i] < 0) continue;
      var nb = neigh[i];
      var mineN = 0;
      var cells = [];
      for (var k = 0; k < nb.length; k++) {
        var j = nb[k];
        if (flagsArr[j]) mineN++;
        else if (!openArr[j]) cells.push(j);
      }
      var need = numbers[i] - mineN;
      if (!cells.length || need < 0 || need > cells.length) continue;
      cons.push({ i: i, cells: cells, need: need, num: numbers[i] });
      if (need === 0) {
        for (var a = 0; a < cells.length; a++) add(cells[a], false, 100, "旁边的 " + numbers[i] + " 已经标满，其余都安全。");
      } else if (need === cells.length) {
        for (var b = 0; b < cells.length; b++) add(cells[b], true, 100, "旁边的 " + numbers[i] + " 还差 " + need + " 颗雷，未开格正好这么多。");
      }
    }
    for (var a1 = 0; a1 < cons.length; a1++) {
      for (var b1 = 0; b1 < cons.length; b1++) {
        if (a1 === b1 || cons[a1].cells.length >= cons[b1].cells.length) continue;
        var setA = {};
        var sub = true;
        for (var s = 0; s < cons[a1].cells.length; s++) {
          setA[cons[a1].cells[s]] = 1;
          var ok = false;
          for (var s2 = 0; s2 < cons[b1].cells.length; s2++) if (cons[b1].cells[s2] === cons[a1].cells[s]) ok = true;
          if (!ok) sub = false;
        }
        if (!sub) continue;
        var diff = [];
        for (var d = 0; d < cons[b1].cells.length; d++) if (!setA[cons[b1].cells[d]]) diff.push(cons[b1].cells[d]);
        var needDiff = cons[b1].need - cons[a1].need;
        if (!diff.length || needDiff < 0 || needDiff > diff.length) continue;
        var isMine = needDiff === diff.length;
        var isSafe = needDiff === 0;
        if (!isMine && !isSafe) continue;
        for (var u = 0; u < diff.length; u++) {
          var phrase = patternWhy(cons[a1].i, cons[b1].i, diff[u], isMine, openArr);
          var why = phrase || subsetWhy(cons[a1], cons[b1], diff.length, isMine);
          add(diff[u], isMine, phrase ? 90 : 70, why);
        }
      }
    }
    return found;
  }

  function subsetWhy(small, big, extraCount, isMine) {
    var one = extraCount === 1 ? "这一格" : "这几格";
    if (isMine) return "数字 " + big.num + " 比数字 " + small.num + " 多看见" + one + "，多出来的正好是雷。";
    return "数字 " + big.num + " 比数字 " + small.num + " 多看见" + one + "，雷数却没有增加，所以安全。";
  }

  function patternWhy(a, b, target, isMine, openArr) {
    var ar = (a / cols) | 0;
    var ac = a % cols;
    var br = (b / cols) | 0;
    var bc = b % cols;
    if (ar !== br && ac !== bc) return "";
    var horizontal = ar === br;
    var cells = [];
    if (horizontal) {
      var c0 = ac;
      while (c0 > 0 && openArr[ar * cols + c0 - 1] && numbers[ar * cols + c0 - 1] >= 0) c0--;
      for (var c = c0; c < cols; c++) {
        var id = ar * cols + c;
        if (!openArr[id] || numbers[id] < 0) break;
        cells.push(id);
      }
    } else {
      var r0 = ar;
      while (r0 > 0 && openArr[(r0 - 1) * cols + ac] && numbers[(r0 - 1) * cols + ac] >= 0) r0--;
      for (var r = r0; r < rows; r++) {
        var id2 = r * cols + ac;
        if (!openArr[id2] || numbers[id2] < 0) break;
        cells.push(id2);
      }
    }
    var nums = [];
    for (var n = 0; n < cells.length; n++) nums.push(numbers[cells[n]]);
    var axis = horizontal ? "排" : "列";
    var w4 = windowAt(nums, [1, 2, 2, 1]);
    if (w4 >= 0 && patternSide(cells[w4], 4, target, horizontal, isMine, "1221")) {
      return "这一" + axis + "是 1-2-2-1。" + (isMine ? "两个 2 正对的格子是雷。" : "两端正对的格子安全。");
    }
    var w3 = windowAt(nums, [1, 2, 1]);
    if (w3 >= 0 && patternSide(cells[w3], 3, target, horizontal, isMine, "121")) {
      return "这一" + axis + "是 1-2-1。" + (isMine ? "两侧是雷。" : "正中间安全。");
    }
    return "";
  }

  function windowAt(nums, pat) {
    for (var i = 0; i + pat.length <= nums.length; i++) {
      var ok = true;
      for (var k = 0; k < pat.length; k++) if (nums[i + k] !== pat[k]) ok = false;
      if (ok) return i;
    }
    return -1;
  }

  function patternSide(base, len, target, horizontal, isMine, kind) {
    var br = (base / cols) | 0;
    var bc = base % cols;
    var tr = (target / cols) | 0;
    var tc = target % cols;
    var rel = horizontal ? tc - bc : tr - br;
    var side = horizontal ? tr - br : tc - bc;
    if (Math.abs(side) !== 1 || rel < 0 || rel >= len) return false;
    if (kind === "1221") return isMine ? rel === 1 || rel === 2 : rel === 0 || rel === 3;
    return isMine ? rel === 0 || rel === 2 : rel === 1;
  }

  function doAnalyze() {
    var info = analyze();
    if (!info) { say("先翻开第一格。"); return; }
    if (!info.safe.length && !info.mines.length && openCount + mineTotal < rows * cols) {
      say("还不能唯一确定的格子：" + info.guess.length + "。");
    } else {
      say("可开 " + info.safe.length + " · 可标雷 " + info.mines.length + " · 未定 " + info.guess.length + "。");
    }
  }

  function togglePause() {
    if (!started || ended || settings.mode === "zen") return;
    paused = !paused;
    if (paused) {
      stopTick();
      show(pauseLayer);
    } else {
      hide(pauseLayer);
      startTick();
    }
    paintHud();
  }

  function blip(freq, gain) {
    if (!settings.sound) return;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!blip.ctx) blip.ctx = new Ctx();
    var ctx = blip.ctx;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.frequency.value = freq;
    o.type = "sine";
    g.gain.value = gain;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    o.stop(ctx.currentTime + 0.13);
  }

  function openModal(title, html) {
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    show(modal);
  }

  function settingsHtml() {
    var cloud = settings.cloud || NG.defaultCloudSettings();
    return '<div class="settings-grid">' +
      row("主题", '<select id="set-theme"><option value="soft">静蓝护眼</option><option value="classic">经典</option><option value="dark">深空</option><option value="pixel">像素</option></select>') +
      row("配色", '<select id="set-palette"><option value="classic">经典数字色</option><option value="cb">色盲友好</option></select>') +
      row("音效", check("set-sound", settings.sound)) +
      row("动画", check("set-motion", settings.motion !== false)) +
      row("确认翻开", check("set-confirm", settings.confirm)) +
      row("标出错旗", check("set-errors", settings.errors)) +
      row("无旗模式", check("set-noflag", settings.noFlag)) +
      row("大字号", check("set-large", settings.largeText)) +
      row("辅助", '<select id="set-assist"><option value="off">关闭</option><option value="hint">仅提示按钮</option><option value="safe">标出安全格</option><option value="prob">雷概率</option></select>') +
      row("踩雷", '<select id="set-mine"><option value="lose">直接结束</option><option value="block">拦住，不结束</option></select>') +
      row("格子", '<input id="set-cell" type="range" min="18" max="48" value="' + cellSize + '">') +
      '<hr class="soft-hr" />' +
      '<p class="hint">可选：填端点后可云备份、上每日榜。不填也能玩。</p>' +
      row("同步端点", '<input id="set-api" type="url" placeholder="https://api.example.com" value="' + escAttr(cloud.apiBase) + '">') +
      row("同步密钥", '<input id="set-key" type="password" autocomplete="off" placeholder="至少 8 位" value="' + escAttr(cloud.syncKey) + '">') +
      row("榜上昵称", '<input id="set-name" type="text" maxlength="24" value="' + escAttr(cloud.displayName) + '">') +
      row("通关后备份", check("set-autobackup", cloud.autoBackup)) +
      '<div class="tools">' +
        '<button type="button" class="text-btn" id="cloud-push">上传备份</button>' +
        '<button type="button" class="text-btn" id="cloud-pull">拉取备份</button>' +
        '<button type="button" class="text-btn" id="export-btn">导出进度</button>' +
        '<button type="button" class="text-btn" id="import-btn">导入进度</button>' +
      '</div>' +
      '<p class="hint" id="cloud-status"></p>' +
      '</div>';
  }
  function escAttr(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }
  function row(name, control) { return "<label><span>" + name + "</span>" + control + "</label>"; }
  function check(id, on) { return '<input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + ">"; }

  function bindSettings() {
    $("set-theme").value = settings.theme;
    $("set-palette").value = settings.palette;
    $("set-assist").value = settings.assist;
    $("set-mine").value = settings.mineClick;
    $("set-theme").onchange = function () { settings.theme = this.value; saveSet(); if (NG._ambiance) NG._ambiance.pulseBrand(); };
    $("set-palette").onchange = function () { settings.palette = this.value; saveSet(); paintAll(); };
    $("set-assist").onchange = function () { settings.assist = this.value; saveSet(); refreshAssist(); };
    $("set-mine").onchange = function () { settings.mineClick = this.value; saveSet(); };
    $("set-sound").onchange = function () { settings.sound = this.checked; saveSet(); };
    $("set-motion").onchange = function () {
      settings.motion = this.checked;
      saveSet();
      if (NG._ambiance) NG._ambiance.setEnabled(settings.motion && (settings.theme === "soft" || settings.theme === "dark"));
    };
    $("set-confirm").onchange = function () { settings.confirm = this.checked; saveSet(); };
    $("set-errors").onchange = function () { settings.errors = this.checked; saveSet(); paintAll(); };
    $("set-noflag").onchange = function () { settings.noFlag = this.checked; saveSet(); };
    $("set-large").onchange = function () { settings.largeText = this.checked; saveSet(); };
    $("set-cell").oninput = function () { cellSize = Number(this.value); settings.cell = cellSize; applyChrome(); };
    function saveCloudFields() {
      settings.cloud = settings.cloud || NG.defaultCloudSettings();
      settings.cloud.apiBase = ($("set-api").value || "").trim().replace(/\/$/, "");
      settings.cloud.syncKey = ($("set-key").value || "").trim();
      settings.cloud.displayName = ($("set-name").value || "").trim();
      settings.cloud.autoBackup = $("set-autobackup").checked;
      saveSet();
    }
    ["set-api", "set-key", "set-name"].forEach(function (id) {
      $(id).onchange = saveCloudFields;
      $(id).onblur = saveCloudFields;
    });
    $("set-autobackup").onchange = saveCloudFields;
    $("cloud-push").onclick = function () {
      saveCloudFields();
      if (!(settings.cloud.syncKey || "").length || settings.cloud.syncKey.length < 8) {
        $("cloud-status").textContent = "请先填写至少 8 位同步密钥。";
        return;
      }
      if (!NG.cloudAvailable(settings)) {
        $("cloud-status").textContent = "未配置同步端点。";
        return;
      }
      $("cloud-status").textContent = "正在上传…";
      NG.pushBackup(settings, stats).then(function (res) {
        $("cloud-status").textContent = "已上传 · " + new Date(res.at || Date.now()).toLocaleString();
      }).catch(function (e) {
        $("cloud-status").textContent = "上传失败：" + (e.message || e);
      });
    };
    $("cloud-pull").onclick = function () {
      saveCloudFields();
      if (!(settings.cloud.syncKey || "").length || settings.cloud.syncKey.length < 8) {
        $("cloud-status").textContent = "请先填写同步密钥。";
        return;
      }
      if (!NG.cloudAvailable(settings)) {
        $("cloud-status").textContent = "未配置同步端点。";
        return;
      }
      $("cloud-status").textContent = "正在拉取…";
      NG.pullBackup(settings).then(function (remote) {
        var local = { settings: settings, stats: stats, at: Date.now() };
        var choice = "newer";
        if (remote.at && Math.abs((remote.at || 0) - local.at) > 1000) {
          var msg = "云端 " + new Date(remote.at).toLocaleString() + "\n确定=用较新的，取消=保留本地。";
          if (!window.confirm(msg)) choice = "local";
          else {
            var useRemote = window.confirm("确定=强制用云端；取消=用较新的一方。");
            choice = useRemote ? "remote" : "newer";
          }
        }
        var merged = NG.mergeBackupConflict(local, remote, choice);
        applyCloudPayload(merged);
        $("cloud-status").textContent = "已同步。";
        say("已同步云备份。");
      }).catch(function (e) {
        $("cloud-status").textContent = "拉取失败：" + (e.message || e);
      });
    };
    $("export-btn").onclick = function () {
      var blob = new Blob([NG.exportPayload(settings, stats)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "no-guess-minesweeper-save.json";
      a.click();
    };
    $("import-btn").onclick = function () {
      var input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json";
      input.onchange = function () {
        var file = input.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          var data = JSON.parse(String(reader.result));
          applyCloudPayload(data);
          say("进度已导入。");
          hide(modal);
        };
        reader.readAsText(file);
      };
      input.click();
    };
  }
  function saveSet() { NG.saveSettings(settings); applyChrome(); }

  function statsHtml() {
    var wins = stats.games.filter(function (g) { return g.won; });
    var rate = stats.games.length ? Math.round(wins.length / stats.games.length * 100) : 0;
    var avg = wins.length ? Math.round(wins.reduce(function (s, g) { return s + g.ms; }, 0) / wins.length) : 0;
    var byDiff = {};
    stats.games.forEach(function (g) {
      if (!byDiff[g.diff]) byDiff[g.diff] = { n: 0, w: 0, ms: 0 };
      byDiff[g.diff].n++;
      if (g.won) { byDiff[g.diff].w++; byDiff[g.diff].ms += g.ms; }
    });
    var diffRows = Object.keys(byDiff).map(function (k) {
      var d = byDiff[k];
      var label = (NG.DIFFS[k] && NG.DIFFS[k].label) || k;
      var wr = d.n ? Math.round(d.w / d.n * 100) : 0;
      var am = d.w ? formatTime(Math.round(d.ms / d.w)) : "-";
      return "<li>" + label + " 胜率 " + wr + "% · 平均 " + am + "</li>";
    }).join("") || "<li>还没有对局</li>";
    var bestRows = Object.keys(stats.best).map(function (k) {
      var b = stats.best[k];
      return "<li>" + k + " 最佳 " + formatTime(b.ms) + " · 3BV/s " + b.bbvs + "</li>";
    }).join("") || "<li>还没有最佳成绩</li>";
    var day = dailyKey();
    var dayShort = day.split("-").slice(0, 3).join("-");
    var dailyBest = stats.daily && stats.daily[day];
    var dailyLine = dailyBest
      ? "<p>今日本地最佳 " + formatTime(dailyBest.ms) + " · 3BV/s " + dailyBest.bbvs + "</p>"
      : "<p>今日挑战还没有本地成绩。</p>";
    var recent = stats.games.slice(-16);
    var max = 1;
    recent.forEach(function (g) { if (g.won && g.ms > max) max = g.ms; });
    var bars = recent.map(function (g) {
      var h = g.won ? Math.max(8, Math.round(g.ms / max * 100)) : 8;
      return '<i style="height:' + h + '%;opacity:' + (g.won ? 1 : 0.35) + '" title="' + (g.won ? formatTime(g.ms) : "失败") + '"></i>';
    }).join("");
    return '<div class="stats-list">' +
      '<p>对局 ' + stats.games.length + ' · 胜率 ' + rate + '% · 胜场平均 ' + (avg ? formatTime(avg) : "-") + ' · 连胜 ' + (stats.streak || 0) + '</p>' +
      dailyLine +
      '<div class="tools"><button type="button" class="text-btn" id="load-daily-board">刷新今日榜</button></div>' +
      '<ol id="daily-board" class="daily-board"><li class="hint">打开云端后可看公开榜。</li></ol>' +
      '<ul>' + diffRows + '</ul><ul>' + bestRows + '</ul><div class="bars">' + bars + '</div>' +
      '<p class="hint">柱高是最近用时，浅色为失败。</p></div>';
  }

  function bindStats() {
    var btn = $("load-daily-board");
    if (!btn) return;
    var dayShort = dailyKey().split("-").slice(0, 3).join("-");
    function renderBoard(entries, note) {
      var el = $("daily-board");
      if (!el) return;
      if (note) { el.innerHTML = "<li class=\"hint\">" + note + "</li>"; return; }
      if (!entries || !entries.length) {
        el.innerHTML = "<li class=\"hint\">今日榜还是空的。</li>";
        return;
      }
      el.innerHTML = entries.map(function (e, i) {
        return "<li>" + (i + 1) + ". " + (e.name || "匿名") + " · " + formatTime(e.ms) +
          (e.mode ? " · " + e.mode : "") + "</li>";
      }).join("");
    }
    function load() {
      renderBoard(null, "加载中…");
      if (!NG.cloudAvailable(settings)) {
        var local = stats.daily && stats.daily[dailyKey()];
        if (local) renderBoard([{ name: "我", ms: local.ms, mode: local.mode }]);
        else renderBoard(null, "未开云端，只显示本地成绩。");
        return;
      }
      NG.fetchDailyBoard(settings, dayShort, "daily").then(function (data) {
        renderBoard(data.entries || []);
      }).catch(function () {
        renderBoard(null, "榜暂时不可用。");
      });
    }
    btn.onclick = load;
    load();
  }

  function shareHtml() {
    var link = location.href;
    return '<div class="stats-list"><p>把链接发给朋友，就是同一局。</p><input id="share-link" readonly value="' + link.replace(/"/g, "&quot;") + '" style="width:100%"><div class="tools"><button type="button" class="text-btn" id="copy-link">复制链接</button><button type="button" class="text-btn" id="save-png">下载棋盘图</button></div></div>';
  }

  function drawPng() {
    var s = cellSize;
    var canvas = document.createElement("canvas");
    canvas.width = cols * s + 16;
    canvas.height = rows * s + 16;
    var g = canvas.getContext("2d");
    g.fillStyle = "#f4efe8";
    g.fillRect(0, 0, canvas.width, canvas.height);
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var i = r * cols + c;
        var x = 8 + c * s, y = 8 + r * s;
        g.fillStyle = open[i] ? "#fbf8f4" : "#eadfce";
        g.fillRect(x + 1, y + 1, s - 2, s - 2);
        g.fillStyle = "#2c3a40";
        g.font = "700 " + Math.floor(s * 0.42) + "px sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        var text = "";
        if (flags[i] && !open[i]) text = "F";
        else if (open[i] && numbers) text = numbers[i] < 0 ? "*" : (numbers[i] || "");
        if (text) g.fillText(String(text), x + s / 2, y + s / 2 + 1);
      }
    }
    var a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "minesweeper.png";
    a.click();
  }

  function replayHtml() {
    if (!lastRecord) return "<p>先完成或结束一局，才能复盘。</p>";
    return '<div class="stats-list"><p>' + lastRecord.actions.length + ' 步 · ' + (lastRecord.won ? "胜利" : "失败") + '</p><div class="tools"><button type="button" class="text-btn" id="rp-play">播放</button><button type="button" class="text-btn" id="rp-step">下一步</button></div></div>';
  }

  function startReplay() {
    if (!lastRecord) return;
    replay.on = true;
    replay.actions = lastRecord.actions;
    replay.index = 0;
    numbers = null;
    hide(modal);
    say("复盘中。");
    stepReplay();
  }
  function stepReplay() {
    if (!replay.on) return;
    if (generating) {
      setTimeout(stepReplay, 40);
      return;
    }
    var act = replay.actions[replay.index++];
    if (!act) { replay.on = false; say("复盘结束。"); return; }
    replay.stepping = true;
    if (act.op === "open") openCell(act.r, act.c);
    else toggleFlag(act.r, act.c);
    replay.stepping = false;
  }

  boardEl.addEventListener("click", function (e) {
    if (suppress) { suppress = false; return; }
    var btn = e.target.closest(".cell");
    if (!btn) return;
    var i = Number(btn.dataset.i);
    if (flagMode) toggleFlag((i / cols) | 0, i % cols);
    else openCell((i / cols) | 0, i % cols);
  });
  boardEl.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    var btn = e.target.closest(".cell");
    if (!btn) return;
    var i = Number(btn.dataset.i);
    toggleFlag((i / cols) | 0, i % cols);
  });
  boardEl.addEventListener("dblclick", function (e) {
    var btn = e.target.closest(".cell");
    if (!btn) return;
    var i = Number(btn.dataset.i);
    chord((i / cols) | 0, i % cols);
  });
  boardEl.addEventListener("auxclick", function (e) {
    if (e.button !== 1) return;
    e.preventDefault();
    var btn = e.target.closest(".cell");
    if (!btn) return;
    var i = Number(btn.dataset.i);
    chord((i / cols) | 0, i % cols);
  });
  boardEl.addEventListener("pointerdown", function (e) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      pan.active = false;
      pan.x = e.clientX;
      pan.y = e.clientY;
      pan.sx = boardWrap.scrollLeft;
      pan.sy = boardWrap.scrollTop;
    }
    var btn = e.target.closest(".cell");
    if (!btn || e.button === 2) return;
    var i = Number(btn.dataset.i);
    pressTimer = setTimeout(function () {
      pressTimer = null;
      if (pan.active) return;
      toggleFlag((i / cols) | 0, i % cols);
      suppress = true;
    }, 460);
  });
  boardEl.addEventListener("pointerup", function (e) {
    pointers.delete(e.pointerId);
    if (!pointers.size) {
      pinchDist = 0;
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = null;
      pan.active = false;
    }
  });
  boardEl.addEventListener("pointercancel", function (e) {
    pointers.delete(e.pointerId);
    if (!pointers.size) {
      pinchDist = 0;
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = null;
      pan.active = false;
    }
  });
  boardEl.addEventListener("pointermove", function (e) {
    if (!pointers.has(e.pointerId)) return;
    var p = pointers.get(e.pointerId);
    var dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
    if (dist > 8) {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      pan.active = false;
      pinch();
      return;
    }
    if (pointers.size === 1 && (rows * cols > 120 || boardWrap.scrollWidth > boardWrap.clientWidth + 8)) {
      var dx = e.clientX - pan.x;
      var dy = e.clientY - pan.y;
      if (Math.hypot(dx, dy) > 10) {
        pan.active = true;
        suppress = true;
        boardWrap.scrollLeft = pan.sx - dx;
        boardWrap.scrollTop = pan.sy - dy;
      }
    }
  });
  function clearPress() {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  }
  var pinchDist = 0;
  function pinch() {
    var pts = Array.from(pointers.values());
    if (pts.length < 2) return;
    var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (pinchDist) {
      var next = NG.clamp(cellSize + (d - pinchDist) * 0.15, 18, 48);
      cellSize = next;
      applyChrome();
    }
    pinchDist = d;
  }
  boardEl.addEventListener("pointerover", function (e) {
    var btn = e.target.closest(".cell");
    document.querySelectorAll(".cell.hot").forEach(function (el) { el.classList.remove("hot"); });
    if (!btn || !started) return;
    var i = Number(btn.dataset.i);
    if (!open[i]) return;
    neigh[i].forEach(function (j) { if (!open[j]) btnAt(j).classList.add("hot"); });
  });

  document.addEventListener("keydown", function (e) {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    var r = (cursor / cols) | 0, c = cursor % cols;
    if (e.key === "ArrowLeft") { c = Math.max(0, c - 1); e.preventDefault(); }
    else if (e.key === "ArrowRight") { c = Math.min(cols - 1, c + 1); e.preventDefault(); }
    else if (e.key === "ArrowUp") { r = Math.max(0, r - 1); e.preventDefault(); }
    else if (e.key === "ArrowDown") { r = Math.min(rows - 1, r + 1); e.preventDefault(); }
    else if (e.key === " " || e.key === "Enter") { openCell(r, c); e.preventDefault(); }
    else if (e.key === "f" || e.key === "F") toggleFlag(r, c);
    else if (e.key === "z" || e.key === "Z") undo();
    else if (e.key === "y" || e.key === "Y") redo();
    else if (e.key === "p" || e.key === "P") togglePause();
    else if (e.key === "n" || e.key === "N") newGame();
    else if (e.key === "h" || e.key === "H") hint();
    else return;
    cursor = r * cols + c;
    paintCursor();
  });

  function newGame() {
    if (overlay.dataset.nextDiff && NG.DIFFS[overlay.dataset.nextDiff]) {
      diffEl.value = overlay.dataset.nextDiff;
      settings.diff = diffEl.value;
      NG.saveSettings(settings);
      delete overlay.dataset.nextDiff;
    }
    resetBoard.ignoreHash = true;
    location.hash = "";
    resetBoard.ignoreHash = false;
    resetBoard();
  }

  diffEl.onchange = function () {
    settings.diff = diffEl.value;
    NG.saveSettings(settings);
    newGame();
  };
  lessonEl.onchange = newGame;
  document.querySelectorAll(".mode-btn").forEach(function (b) {
    b.onclick = function () {
      settings.mode = b.dataset.mode;
      if (settings.mode === "zen") settings.mineClick = "block";
      NG.saveSettings(settings);
      applyChrome();
      newGame();
    };
  });
  $("face-btn").onclick = newGame;
  $("again-btn").onclick = newGame;
  $("hint-btn").onclick = hint;
  $("undo-btn").onclick = undo;
  $("redo-btn").onclick = redo;
  $("analyze-btn").onclick = doAnalyze;
  $("flag-mode").onclick = function () {
    flagMode = !flagMode;
    this.textContent = flagMode ? "插旗" : "翻开";
    this.classList.toggle("active", flagMode);
  };
  timerEl.onclick = togglePause;
  $("resume-btn").onclick = togglePause;
  $("apply-custom").onclick = function () {
    var spec = currentSpec();
    $("cw").value = String(spec.cols);
    $("ch").value = String(spec.rows);
    $("cm").value = String(spec.mines);
    var minSafe = 1 + 8;
    if (spec.mines > spec.rows * spec.cols - minSafe) {
      say("雷太多了，请少留几颗。");
      return;
    }
    if (spec.rows * spec.cols > 1200) {
      say("已调整为 " + spec.cols + "×" + spec.rows + " / " + spec.mines + " 雷。");
    }
    newGame();
  };
  $("open-settings").onclick = function () { openModal("设置", settingsHtml()); bindSettings(); };
  $("open-stats").onclick = function () { openModal("统计", statsHtml()); bindStats(); };
  $("open-share").onclick = function () {
    if (started) writeHash();
    openModal("分享", shareHtml());
    $("copy-link").onclick = function () {
      navigator.clipboard.writeText($("share-link").value).then(function () { say("链接已复制。"); });
    };
    $("save-png").onclick = drawPng;
  };
  $("open-replay").onclick = function () {
    openModal("复盘", replayHtml());
    var play = $("rp-play");
    var step = $("rp-step");
    if (play) play.onclick = function () {
      startReplay();
      replay.timer = setInterval(function () {
        if (!replay.on) { clearInterval(replay.timer); return; }
        stepReplay();
      }, 280);
    };
    if (step) step.onclick = function () { if (!replay.on) startReplay(); else stepReplay(); };
  };
  $("modal-close").onclick = function () { hide(modal); };
  modal.addEventListener("click", function (e) { if (e.target === modal) hide(modal); });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }

  fillDiffs();
  applyChrome();
  NG.startAmbiance({
    enabled: settings.motion !== false && (settings.theme === "soft" || settings.theme === "dark"),
  });
  if (location.hash.indexOf("d=") >= 0) {
    var preset = new URLSearchParams(location.hash.slice(1)).get("d");
    if (preset && diffEl.querySelector('option[value="' + preset + '"]')) diffEl.value = preset;
  }
  if (/[#&?]mockCloud=1/.test(location.href)) {
    NG.installMockCloud();
  }
  resetBoard();
  if (NG._mockCloud) say("已开启本地云端模拟。");
  bootstrapOnline();

  function bootstrapOnline() {
    NG.loadCloudConfig().then(function () {
      return NG.checkVersion(settings);
    }).then(function (info) {
      if (!info || !info.newer || !info.remote) return;
      showVersionBanner(info.remote);
    });
  }

  function showVersionBanner(remote) {
    var bar = document.createElement("div");
    bar.className = "version-banner";
    bar.setAttribute("role", "status");
    bar.innerHTML = "<span>有新版本 " + (remote.version || "") + "：" + (remote.notes || "可更新") +
      "</span><span class=\"tools\">" +
      "<button type=\"button\" class=\"text-btn\" id=\"ver-dismiss\">稍后</button>" +
      "<button type=\"button\" class=\"text-btn\" id=\"ver-skip\">跳过此版</button>" +
      "<button type=\"button\" class=\"text-btn\" id=\"ver-reload\">刷新</button></span>";
    document.body.appendChild(bar);
    $("ver-dismiss").onclick = function () { bar.remove(); };
    $("ver-skip").onclick = function () {
      settings.cloud = settings.cloud || NG.defaultCloudSettings();
      settings.cloud.skipVersion = String(remote.version || "");
      NG.saveSettings(settings);
      bar.remove();
    };
    $("ver-reload").onclick = function () { location.reload(); };
  }
})();
