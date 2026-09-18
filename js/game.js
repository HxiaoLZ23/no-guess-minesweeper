/* global NG */
(function () {
  var settings = NG.loadSettings();
  var stats = NG.loadStats();
  var diffEl = document.getElementById("diff");
  var lessonEl = document.getElementById("lesson");
  var lessonField = document.getElementById("lesson-field");
  var customEl = document.getElementById("custom");
  var boardEl = document.getElementById("board");
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
      return {
        kind: "custom", id: "custom", label: "自定义",
        cols: clampNum($("cw").value, 5, 50),
        rows: clampNum($("ch").value, 5, 40),
        mines: clampNum($("cm").value, 1, 400),
        cell: 28,
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
    $("face-btn").textContent = "◎";
    paintHud();
    renderGrid();
    lessonField.classList.toggle("hidden", spec.kind !== "lesson");
    customEl.classList.toggle("hidden", spec.kind !== "custom");
    if (spec.kind === "lesson") setupLesson(spec.lesson);
    else if (spec.kind === "daily") setupSeeded(dailyKey(), spec);
    else if (location.hash.indexOf("s=") >= 0 && !resetBoard.ignoreHash) setupFromHash();
    else say("左键翻开，右键插旗。第一次点击会从这里开始构造无猜局面。");
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
    say("每日 / 种子局：请从发光格子开始，大家才是同一局。");
    cellBtn(startR, startC).classList.add("start");
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
    if (!NG.proveSolvable(rows, cols, numbers, NG.idx(startR, startC, cols))) {
      say("这一关布局有问题。");
      return;
    }
    bbbv = NG.compute3BV(rows, cols, numbers);
    started = true;
    flood(NG.idx(startR, startC, cols));
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
  function show(el) { el.classList.remove("hidden"); }

  function paintCursor() {
    for (var i = 0; i < boardEl.children.length; i++) boardEl.children[i].classList.remove("cursor");
    if (btnAt(cursor)) btnAt(cursor).classList.add("cursor");
  }

  function paintAll() {
    for (var i = 0; i < rows * cols; i++) paintCell(i);
    paintCursor();
  }

  function paintCell(i) {
    var el = btnAt(i);
    if (!el) return;
    var r = (i / cols) | 0, c = i % cols;
    el.className = "cell";
    el.textContent = "";
    el.disabled = false;
    if (i === cursor) el.classList.add("cursor");
    if (!started && fixedStart && r === startR && c === startC) el.classList.add("start");
    if (flags[i] && !open[i]) {
      el.classList.add("flagged");
      el.textContent = "⚑";
      if (showErr() && mines && !mines[i]) el.classList.add("bad-flag");
      return;
    }
    if (!open[i]) return;
    el.classList.add("open");
    if (numbers && numbers[i] < 0) {
      el.classList.add("mine");
      el.textContent = "●";
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
    say("正在用约束求解构造推理链…");
    $("face-btn").textContent = "…";
    setTimeout(function () {
      var rng = NG.mulberry32(seed || (Date.now() ^ (r * 131 + c)));
      seed = seed || (Date.now() >>> 0);
      var res = NG.generate({
        rows: rows, cols: cols, mines: mineTotal,
        startR: r, startC: c, rng: rng,
        budget: mineTotal > 80 ? 700 : 320,
      });
      generating = false;
      $("face-btn").textContent = "◎";
      if (!res.ok) {
        say(res.reason || "构造失败，请换起点或降低雷数。");
        return;
      }
      numbers = res.numbers;
      mines = res.mines;
      bbbv = res.bbbv;
      startR = r; startC = c;
      started = true;
      startTick();
      flood(NG.idx(r, c, cols));
      writeHash();
      say("已证明无猜 · 开口 " + res.opening + " · 构造 " + res.ms + "ms · 3BV " + bbbv);
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
    while (stack.length) {
      var cur = stack.pop();
      if (open[cur] || flags[cur] || !numbers || numbers[cur] < 0) continue;
      open[cur] = 1;
      openCount++;
      paintCell(cur);
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
    if (flags[i]) { flags[i] = 0; flagCount--; }
    else { flags[i] = 1; flagCount++; blip(340, 0.03); }
    actions.push({ t: Math.round(nowElapsed()), op: "flag", r: r, c: c });
    paintCell(i); paintHud();
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

  function win() {
    ended = true;
    stopTick();
    if (mines) {
      for (var i = 0; i < mines.length; i++) {
        if (mines[i] && !flags[i]) { flags[i] = 1; flagCount++; paintCell(i); }
      }
    }
    $("face-btn").textContent = "✿";
    var ms = Math.round(nowElapsed());
    var bbvs = ms > 0 ? (bbbv / (ms / 1000)).toFixed(2) : "0";
    var cps = ms > 0 ? (clickCount / (ms / 1000)).toFixed(2) : "0";
    say("通关。纯逻辑，没有歧义步。");
    $("overlay-title").textContent = "胜利";
    $("overlay-msg").textContent = "用时 " + formatTime(ms) + " · 3BV " + bbbv + " · 3BV/s " + bbvs + " · CPS " + cps;
    show(overlay);
    blip(660, 0.04);
    record(true, ms, bbvs, cps);
    if (settings.mode === "practice") {
      stats.streak = (stats.streak || 0) + 1;
      NG.saveStats(stats);
      if (stats.streak >= 3 && NG.DIFFS[diffEl.value] && diffEl.value !== "hard") {
        say("已连胜 " + stats.streak + " 局，可以试试更高难度。");
      }
    }
  }

  function lose(i) {
    ended = true;
    stopTick();
    open[i] = 1;
    btnAt(i).classList.add("hit");
    paintCell(i);
    if (mines) {
      for (var k = 0; k < mines.length; k++) if (mines[k]) { open[k] = 1; paintCell(k); }
    }
    $("face-btn").textContent = "✧";
    say("踩雷了。这盘本身可以推理完成。");
    $("overlay-title").textContent = "再试一次";
    $("overlay-msg").textContent = "无猜局面不会把你逼到 50/50。";
    show(overlay);
    record(false, Math.round(nowElapsed()), "0", "0");
    stats.streak = 0;
    NG.saveStats(stats);
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
    if (!assistOn()) { say("竞速模式关闭了提示。"); return; }
    var info = analyze();
    if (!info) { say("先翻开第一格。"); return; }
    if (info.contradiction) { say("当前旗和数字矛盾，可能插错了。"); return; }
    if (info.safe.length) {
      var i = info.safe[0];
      btnAt(i).classList.add("hint-safe");
      say("下一步可确定：第 " + (((i / cols) | 0) + 1) + " 行第 " + ((i % cols) + 1) + " 列是安全的。");
      return;
    }
    if (info.mines.length) {
      var m = info.mines[0];
      btnAt(m).classList.add("hint-mine");
      say("下一步可确定：第 " + (((m / cols) | 0) + 1) + " 行第 " + ((m % cols) + 1) + " 列是雷。");
      return;
    }
    say(info.guess.length ? "当前有 " + info.guess.length + " 个格子还不能唯一确定。" : "已经没有未知格了。");
  }

  function doAnalyze() {
    var info = analyze();
    if (!info) { say("先翻开第一格。"); return; }
    if (!info.safe.length && !info.mines.length && openCount + mineTotal < rows * cols) {
      say("求解器认为当前需要猜测的格子：" + info.guess.length + "。无猜局在旗正确时应为 0。");
    } else {
      say("可确定安全 " + info.safe.length + "，可确定雷 " + info.mines.length + "，尚未唯一的格子 " + info.guess.length + "。");
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
    return '<div class="settings-grid">' +
      row("主题", '<select id="set-theme"><option value="soft">柔和</option><option value="classic">经典</option><option value="dark">暗色</option><option value="pixel">像素</option></select>') +
      row("配色", '<select id="set-palette"><option value="classic">经典数字色</option><option value="cb">色盲友好</option></select>') +
      row("音效", check("set-sound", settings.sound)) +
      row("确认翻开", check("set-confirm", settings.confirm)) +
      row("标出错旗", check("set-errors", settings.errors)) +
      row("无旗模式", check("set-noflag", settings.noFlag)) +
      row("大字号", check("set-large", settings.largeText)) +
      row("辅助", '<select id="set-assist"><option value="off">关闭</option><option value="hint">仅提示按钮</option><option value="safe">标出安全格</option><option value="prob">雷概率</option></select>') +
      row("踩雷", '<select id="set-mine"><option value="lose">直接结束</option><option value="block">拦住，不结束</option></select>') +
      row("格子", '<input id="set-cell" type="range" min="18" max="48" value="' + cellSize + '">') +
      '<p class="hint">进度可导出，换设备时再导入。实时对战、六边形和账号云同步不在这一版里。</p>' +
      '<div class="tools"><button type="button" class="text-btn" id="export-btn">导出进度</button><button type="button" class="text-btn" id="import-btn">导入进度</button></div>' +
      '</div>';
  }
  function row(name, control) { return "<label><span>" + name + "</span>" + control + "</label>"; }
  function check(id, on) { return '<input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + ">"; }

  function bindSettings() {
    $("set-theme").value = settings.theme;
    $("set-palette").value = settings.palette;
    $("set-assist").value = settings.assist;
    $("set-mine").value = settings.mineClick;
    $("set-theme").onchange = function () { settings.theme = this.value; saveSet(); };
    $("set-palette").onchange = function () { settings.palette = this.value; saveSet(); paintAll(); };
    $("set-assist").onchange = function () { settings.assist = this.value; saveSet(); refreshAssist(); };
    $("set-mine").onchange = function () { settings.mineClick = this.value; saveSet(); };
    $("set-sound").onchange = function () { settings.sound = this.checked; saveSet(); };
    $("set-confirm").onchange = function () { settings.confirm = this.checked; saveSet(); };
    $("set-errors").onchange = function () { settings.errors = this.checked; saveSet(); paintAll(); };
    $("set-noflag").onchange = function () { settings.noFlag = this.checked; saveSet(); };
    $("set-large").onchange = function () { settings.largeText = this.checked; saveSet(); };
    $("set-cell").oninput = function () { cellSize = Number(this.value); applyChrome(); };
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
          if (data.settings) settings = Object.assign(NG.defaultSettings(), data.settings);
          if (data.stats) stats = data.stats;
          NG.saveSettings(settings); NG.saveStats(stats);
          applyChrome();
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
    var bestRows = Object.keys(stats.best).map(function (k) {
      var b = stats.best[k];
      return "<li>" + k + " 最佳 " + formatTime(b.ms) + " · 3BV/s " + b.bbvs + "</li>";
    }).join("") || "<li>还没有最佳成绩</li>";
    var recent = stats.games.slice(-16);
    var max = 1;
    recent.forEach(function (g) { if (g.won && g.ms > max) max = g.ms; });
    var bars = recent.map(function (g) {
      var h = g.won ? Math.max(8, Math.round(g.ms / max * 100)) : 8;
      return '<i style="height:' + h + '%;opacity:' + (g.won ? 1 : 0.35) + '"></i>';
    }).join("");
    return '<div class="stats-list"><p>对局 ' + stats.games.length + ' · 胜率 ' + rate + '% · 连胜 ' + (stats.streak || 0) + '</p><ul>' + bestRows + '</ul><div class="bars">' + bars + '</div><p class="hint">柱高是最近用时，浅色为失败。</p></div>';
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
    var btn = e.target.closest(".cell");
    if (!btn || e.button === 2) return;
    var i = Number(btn.dataset.i);
    pressTimer = setTimeout(function () {
      pressTimer = null;
      toggleFlag((i / cols) | 0, i % cols);
      suppress = true;
    }, 460);
  });
  boardEl.addEventListener("pointerup", clearPress);
  boardEl.addEventListener("pointercancel", clearPress);
  boardEl.addEventListener("pointermove", function (e) {
    if (!pointers.has(e.pointerId)) return;
    var p = pointers.get(e.pointerId);
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) clearPress();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) pinch();
  });
  function clearPress() {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
    pointers.clear();
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
    var minSafe = 9;
    if (spec.mines > spec.rows * spec.cols - minSafe) {
      say("雷太多了。至少要留出首击和周围 8 格。");
      return;
    }
    newGame();
  };
  $("open-settings").onclick = function () { openModal("设置", settingsHtml()); bindSettings(); };
  $("open-stats").onclick = function () { openModal("统计", statsHtml()); };
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
  if (location.hash.indexOf("d=") >= 0) {
    var preset = new URLSearchParams(location.hash.slice(1)).get("d");
    if (preset && diffEl.querySelector('option[value="' + preset + '"]')) diffEl.value = preset;
  }
  resetBoard();
})();
