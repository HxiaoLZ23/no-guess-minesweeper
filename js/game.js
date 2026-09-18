/* global DIFFICULTIES — defined below, used by UI */

const DIFFICULTIES = {
  easy: { rows: 9, cols: 9, mines: 10, cellSize: 38, label: "简单" },
  medium: { rows: 16, cols: 16, mines: 40, cellSize: 30, label: "中等" },
  hard: { rows: 16, cols: 30, mines: 99, cellSize: 26, label: "困难" },
};

function idx(r, c, cols) {
  return r * cols + c;
}

function neighbors(r, c, rows, cols) {
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push([nr, nc]);
    }
  }
  return out;
}

function countAdjacentMines(mineSet, r, c, rows, cols) {
  let n = 0;
  for (const [nr, nc] of neighbors(r, c, rows, cols)) {
    if (mineSet.has(idx(nr, nc, cols))) n++;
  }
  return n;
}

function placeMines(rows, cols, mineCount, protectedSet, rng = Math.random) {
  const total = rows * cols;
  const candidates = [];
  for (let i = 0; i < total; i++) {
    if (!protectedSet.has(i)) candidates.push(i);
  }
  if (candidates.length < mineCount) throw new Error("Not enough cells for mines");
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const mineSet = new Set(candidates.slice(0, mineCount));
  const numbers = new Int8Array(total);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = idx(r, c, cols);
      numbers[i] = mineSet.has(i) ? -1 : countAdjacentMines(mineSet, r, c, rows, cols);
    }
  }
  return { mineSet, numbers };
}

function isSubset(a, b) {
  if (a.length > b.length) return false;
  const set = new Set(b);
  return a.every((x) => set.has(x));
}

function collectFrontier(rows, cols, opened, flagged) {
  const set = new Set();
  const total = rows * cols;
  for (let i = 0; i < total; i++) {
    if (!opened[i]) continue;
    const r = Math.floor(i / cols);
    const c = i % cols;
    for (const [nr, nc] of neighbors(r, c, rows, cols)) {
      const ni = idx(nr, nc, cols);
      if (!opened[ni] && !flagged[ni]) set.add(ni);
    }
  }
  return [...set];
}

function solveFrontierCSP(frontier, constraints, remainingMines, outsideCount) {
  const n = frontier.length;
  if (n === 0) return { safe: [], mine: [], outsideSafe: false, outsideMine: false };

  const indexOf = new Map(frontier.map((v, i) => [v, i]));
  const coded = constraints.map((ct) => ({
    bits: ct.cells.map((c) => indexOf.get(c)),
    need: ct.need,
  }));

  let solutionCount = 0;
  const mineHits = new Uint32Array(n);
  let minOutsideMines = Infinity;
  let maxOutsideMines = -1;
  const assign = new Uint8Array(n);

  function okPartial(filled) {
    for (const ct of coded) {
      let mines = 0;
      let unknown = 0;
      for (const bi of ct.bits) {
        if (bi >= filled) unknown++;
        else if (assign[bi]) mines++;
      }
      if (mines > ct.need) return false;
      if (mines + unknown < ct.need) return false;
    }
    return true;
  }

  function dfs(pos, minesUsed) {
    if (minesUsed > remainingMines) return;
    if (!okPartial(pos)) return;
    if (pos === n) {
      const outsideMines = remainingMines - minesUsed;
      if (outsideMines < 0 || outsideMines > outsideCount) return;
      for (const ct of coded) {
        let mines = 0;
        for (const bi of ct.bits) if (assign[bi]) mines++;
        if (mines !== ct.need) return;
      }
      solutionCount++;
      for (let i = 0; i < n; i++) if (assign[i]) mineHits[i]++;
      minOutsideMines = Math.min(minOutsideMines, outsideMines);
      maxOutsideMines = Math.max(maxOutsideMines, outsideMines);
      return;
    }
    assign[pos] = 0;
    dfs(pos + 1, minesUsed);
    assign[pos] = 1;
    dfs(pos + 1, minesUsed + 1);
  }

  dfs(0, 0);
  if (solutionCount === 0) return null;

  const safe = [];
  const mine = [];
  for (let i = 0; i < n; i++) {
    if (mineHits[i] === 0) safe.push(frontier[i]);
    else if (mineHits[i] === solutionCount) mine.push(frontier[i]);
  }

  return {
    safe,
    mine,
    outsideSafe: outsideCount > 0 && maxOutsideMines === 0,
    outsideMine: outsideCount > 0 && minOutsideMines === outsideCount,
  };
}

function isSolvable(rows, cols, numbers, mineSet, startCell) {
  const total = rows * cols;
  const opened = new Uint8Array(total);
  const flagged = new Uint8Array(total);
  let openCount = 0;
  let flagCount = 0;
  const mineCount = mineSet.size;

  const openSafe = (i) => {
    if (opened[i] || flagged[i] || mineSet.has(i)) return;
    const stack = [i];
    while (stack.length) {
      const cur = stack.pop();
      if (opened[cur] || flagged[cur] || mineSet.has(cur)) continue;
      opened[cur] = 1;
      openCount++;
      if (numbers[cur] === 0) {
        const r = Math.floor(cur / cols);
        const c = cur % cols;
        for (const [nr, nc] of neighbors(r, c, rows, cols)) {
          const ni = idx(nr, nc, cols);
          if (!opened[ni] && !flagged[ni] && !mineSet.has(ni)) stack.push(ni);
        }
      }
    }
  };

  openSafe(startCell);
  if (mineSet.has(startCell)) return false;

  const maxIter = total * 4;
  for (let iter = 0; iter < maxIter; iter++) {
    if (openCount + mineCount === total) return true;
    let progress = false;

    for (let i = 0; i < total; i++) {
      if (!opened[i] || numbers[i] <= 0) continue;
      const r = Math.floor(i / cols);
      const c = i % cols;
      const neigh = neighbors(r, c, rows, cols);
      const hidden = [];
      let flags = 0;
      for (const [nr, nc] of neigh) {
        const ni = idx(nr, nc, cols);
        if (flagged[ni]) flags++;
        else if (!opened[ni]) hidden.push(ni);
      }
      const need = numbers[i] - flags;
      if (need < 0 || need > hidden.length) return false;
      if (hidden.length === 0) continue;
      if (need === 0) {
        for (const h of hidden) {
          openSafe(h);
          progress = true;
        }
      } else if (need === hidden.length) {
        for (const h of hidden) {
          if (!flagged[h]) {
            flagged[h] = 1;
            flagCount++;
            progress = true;
          }
        }
      }
    }

    if (progress) continue;

    const constraints = [];
    for (let i = 0; i < total; i++) {
      if (!opened[i] || numbers[i] <= 0) continue;
      const r = Math.floor(i / cols);
      const c = i % cols;
      const cells = [];
      let flags = 0;
      for (const [nr, nc] of neighbors(r, c, rows, cols)) {
        const ni = idx(nr, nc, cols);
        if (flagged[ni]) flags++;
        else if (!opened[ni]) cells.push(ni);
      }
      const need = numbers[i] - flags;
      if (cells.length > 0 && need >= 0) constraints.push({ cells, need });
    }

    for (let a = 0; a < constraints.length && !progress; a++) {
      for (let b = 0; b < constraints.length && !progress; b++) {
        if (a === b) continue;
        const A = constraints[a];
        const B = constraints[b];
        if (!isSubset(A.cells, B.cells)) continue;
        const diff = B.cells.filter((x) => !A.cells.includes(x));
        const needDiff = B.need - A.need;
        if (diff.length === 0) continue;
        if (needDiff === 0) {
          for (const h of diff) {
            openSafe(h);
            progress = true;
          }
        } else if (needDiff === diff.length) {
          for (const h of diff) {
            if (!flagged[h]) {
              flagged[h] = 1;
              flagCount++;
              progress = true;
            }
          }
        }
      }
    }

    if (progress) continue;

    const frontier = collectFrontier(rows, cols, opened, flagged);
    if (frontier.length === 0) {
      const closed = [];
      for (let i = 0; i < total; i++) {
        if (!opened[i] && !flagged[i]) closed.push(i);
      }
      const remainingMines = mineCount - flagCount;
      if (remainingMines === 0) {
        for (const h of closed) openSafe(h);
        progress = true;
      } else if (remainingMines === closed.length) {
        for (const h of closed) {
          if (!flagged[h]) {
            flagged[h] = 1;
            flagCount++;
            progress = true;
          }
        }
      }
      if (!progress) return false;
      continue;
    }

    if (frontier.length > 16) return false;

    const frontierConstraints = [];
    for (let i = 0; i < total; i++) {
      if (!opened[i] || numbers[i] <= 0) continue;
      const r = Math.floor(i / cols);
      const c = i % cols;
      let allOnFrontier = true;
      const hidden = [];
      let flags = 0;
      for (const [nr, nc] of neighbors(r, c, rows, cols)) {
        const ni = idx(nr, nc, cols);
        if (flagged[ni]) flags++;
        else if (!opened[ni]) {
          if (!frontier.includes(ni)) allOnFrontier = false;
          hidden.push(ni);
        }
      }
      if (!allOnFrontier || hidden.length === 0) continue;
      frontierConstraints.push({ cells: hidden, need: numbers[i] - flags });
    }

    const remainingMines = mineCount - flagCount;
    const outside = [];
    for (let i = 0; i < total; i++) {
      if (!opened[i] && !flagged[i] && !frontier.includes(i)) outside.push(i);
    }

    const forced = solveFrontierCSP(frontier, frontierConstraints, remainingMines, outside.length);
    if (!forced) return false;

    let applied = false;
    for (const i of forced.safe) {
      openSafe(i);
      applied = true;
    }
    for (const i of forced.mine) {
      if (!flagged[i]) {
        flagged[i] = 1;
        flagCount++;
        applied = true;
      }
    }
    if (forced.outsideSafe) {
      for (const i of outside) {
        openSafe(i);
        applied = true;
      }
    }
    if (forced.outsideMine) {
      for (const i of outside) {
        if (!flagged[i]) {
          flagged[i] = 1;
          flagCount++;
          applied = true;
        }
      }
    }
    if (!applied) return false;
  }

  return openCount + mineCount === total;
}

function generateNoGuessBoard(rows, cols, mineCount, startR, startC, maxAttempts = 400) {
  const protectedSet = new Set();
  for (const [nr, nc] of neighbors(startR, startC, rows, cols)) {
    protectedSet.add(idx(nr, nc, cols));
  }
  protectedSet.add(idx(startR, startC, cols));
  const start = idx(startR, startC, cols);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { mineSet, numbers } = placeMines(rows, cols, mineCount, protectedSet);
      if (mineSet.has(start)) continue;
      if (isSolvable(rows, cols, numbers, mineSet, start)) {
        return { mineSet, numbers, attempts: attempt + 1 };
      }
    } catch (_) {
      /* retry */
    }
  }

  const onlyStart = new Set([start]);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { mineSet, numbers } = placeMines(rows, cols, mineCount, onlyStart);
    if (isSolvable(rows, cols, numbers, mineSet, start)) {
      return { mineSet, numbers, attempts: attempt + 1 };
    }
  }

  throw new Error("未能在限定次数内生成无猜局面，请再试一次");
}

/* ——— UI ——— */

(() => {
  const boardEl = document.getElementById("board");
  const mineCountEl = document.getElementById("mine-count");
  const timerEl = document.getElementById("timer");
  const faceBtn = document.getElementById("face-btn");
  const statusText = document.getElementById("status-text");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayMsg = document.getElementById("overlay-msg");
  const againBtn = document.getElementById("again-btn");
  const diffButtons = [...document.querySelectorAll(".diff-btn")];

  let difficulty = "easy";
  let rows = 9;
  let cols = 9;
  let mineTotal = 10;
  let numbers = null;
  let mineSet = null;
  let opened;
  let flagged;
  let started = false;
  let ended = false;
  let openCount = 0;
  let flagCount = 0;
  let seconds = 0;
  let timerId = null;
  let generating = false;
  let pressTimer = null;
  let suppressClick = false;

  function applyDifficulty(key) {
    difficulty = key;
    const cfg = DIFFICULTIES[key];
    rows = cfg.rows;
    cols = cfg.cols;
    mineTotal = cfg.mines;
    document.documentElement.style.setProperty("--cell-size", `${cfg.cellSize}px`);
    diffButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.diff === key);
    });
    resetGame();
  }

  function resetGame() {
    stopTimer();
    seconds = 0;
    timerEl.textContent = "0";
    started = false;
    ended = false;
    generating = false;
    numbers = null;
    mineSet = null;
    openCount = 0;
    flagCount = 0;
    opened = new Uint8Array(rows * cols);
    flagged = new Uint8Array(rows * cols);
    mineCountEl.textContent = String(mineTotal);
    faceBtn.textContent = "◎";
    statusText.textContent = "左键翻开，右键插旗。开局保证可纯逻辑通关。";
    hideOverlay();
    renderEmptyBoard();
  }

  function renderEmptyBoard() {
    boardEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
    boardEl.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cell";
        btn.dataset.r = String(r);
        btn.dataset.c = String(c);
        btn.setAttribute("role", "gridcell");
        btn.setAttribute("aria-label", `第 ${r + 1} 行第 ${c + 1} 列`);
        frag.appendChild(btn);
      }
    }
    boardEl.appendChild(frag);
  }

  function cellButton(r, c) {
    return boardEl.children[idx(r, c, cols)];
  }

  function updateMineHud() {
    mineCountEl.textContent = String(Math.max(0, mineTotal - flagCount));
  }

  function startTimer() {
    if (timerId != null) return;
    timerId = window.setInterval(() => {
      seconds += 1;
      timerEl.textContent = String(seconds);
    }, 1000);
  }

  function stopTimer() {
    if (timerId != null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function paintCell(r, c) {
    const i = idx(r, c, cols);
    const el = cellButton(r, c);
    el.className = "cell";
    el.textContent = "";
    el.disabled = false;

    if (flagged[i]) {
      el.classList.add("flagged");
      el.textContent = "⚑";
      return;
    }
    if (!opened[i]) return;

    el.classList.add("open");
    el.disabled = true;
    if (numbers && numbers[i] === -1) {
      el.classList.add("mine", "revealed");
      el.textContent = "●";
      return;
    }
    const n = numbers ? numbers[i] : 0;
    if (n > 0) {
      el.classList.add(`n${n}`);
      el.textContent = String(n);
    }
  }

  function revealAllMines() {
    if (!mineSet) return;
    for (const i of mineSet) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      opened[i] = 1;
      paintCell(r, c);
    }
  }

  function floodOpen(startI) {
    const stack = [startI];
    while (stack.length) {
      const cur = stack.pop();
      if (opened[cur] || flagged[cur]) continue;
      if (mineSet.has(cur)) continue;
      opened[cur] = 1;
      openCount++;
      const r = Math.floor(cur / cols);
      const c = cur % cols;
      paintCell(r, c);
      if (numbers[cur] === 0) {
        for (const [nr, nc] of neighbors(r, c, rows, cols)) {
          const ni = idx(nr, nc, cols);
          if (!opened[ni] && !flagged[ni]) stack.push(ni);
        }
      }
    }
  }

  function checkWin() {
    if (openCount + mineTotal === rows * cols) endGame(true);
  }

  function endGame(won) {
    ended = true;
    stopTimer();
    if (won) {
      faceBtn.textContent = "✿";
      statusText.textContent = "通关！整盘无需猜测。";
      if (mineSet) {
        for (const i of mineSet) {
          if (!flagged[i]) {
            flagged[i] = 1;
            flagCount++;
            paintCell(Math.floor(i / cols), i % cols);
          }
        }
        updateMineHud();
      }
      showOverlay("胜利", `用时 ${seconds} 秒 · 纯逻辑通关`);
    } else {
      faceBtn.textContent = "✧";
      statusText.textContent = "踩雷了。无猜局面下通常不必冒险——再来一局吧。";
      revealAllMines();
      showOverlay("再试一次", "这盘其实可以推理完成，换一张新图。");
    }
  }

  function showOverlay(title, msg) {
    overlayTitle.textContent = title;
    overlayMsg.textContent = msg;
    overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  async function ensureBoard(r, c) {
    if (started) return true;
    generating = true;
    statusText.textContent = "正在生成无猜局面…";
    faceBtn.textContent = "…";
    await new Promise((resolve) => setTimeout(resolve, 20));
    try {
      const result = generateNoGuessBoard(rows, cols, mineTotal, r, c);
      numbers = result.numbers;
      mineSet = result.mineSet;
      started = true;
      startTimer();
      faceBtn.textContent = "◎";
      statusText.textContent = `已就绪（尝试 ${result.attempts} 次生成）· 继续推理即可`;
      return true;
    } catch (err) {
      statusText.textContent = err.message || "生成失败，请换难度或重试";
      faceBtn.textContent = "◎";
      return false;
    } finally {
      generating = false;
    }
  }

  async function openCell(r, c) {
    if (ended || generating) return;
    const i = idx(r, c, cols);
    if (opened[i] || flagged[i]) return;
    const ok = await ensureBoard(r, c);
    if (!ok) return;
    if (mineSet.has(i)) {
      opened[i] = 1;
      paintCell(r, c);
      endGame(false);
      return;
    }
    floodOpen(i);
    checkWin();
  }

  function toggleFlag(r, c) {
    if (ended || generating) return;
    const i = idx(r, c, cols);
    if (opened[i]) return;
    if (flagged[i]) {
      flagged[i] = 0;
      flagCount--;
    } else {
      flagged[i] = 1;
      flagCount++;
    }
    paintCell(r, c);
    updateMineHud();
  }

  function chord(r, c) {
    if (!started || ended || generating) return;
    const i = idx(r, c, cols);
    if (!opened[i] || !numbers || numbers[i] <= 0) return;
    let flags = 0;
    const hidden = [];
    for (const [nr, nc] of neighbors(r, c, rows, cols)) {
      const ni = idx(nr, nc, cols);
      if (flagged[ni]) flags++;
      else if (!opened[ni]) hidden.push([nr, nc]);
    }
    if (flags !== numbers[i]) return;
    for (const [nr, nc] of hidden) openCell(nr, nc);
  }

  boardEl.addEventListener("click", (e) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const btn = e.target.closest(".cell");
    if (!btn) return;
    openCell(Number(btn.dataset.r), Number(btn.dataset.c));
  });

  boardEl.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const btn = e.target.closest(".cell");
    if (!btn) return;
    toggleFlag(Number(btn.dataset.r), Number(btn.dataset.c));
  });

  boardEl.addEventListener("dblclick", (e) => {
    const btn = e.target.closest(".cell");
    if (!btn) return;
    chord(Number(btn.dataset.r), Number(btn.dataset.c));
  });

  boardEl.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest(".cell");
    if (!btn || e.button === 2) return;
    const r = Number(btn.dataset.r);
    const c = Number(btn.dataset.c);
    pressTimer = window.setTimeout(() => {
      pressTimer = null;
      toggleFlag(r, c);
      suppressClick = true;
    }, 480);
  });

  const clearPress = () => {
    if (pressTimer != null) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  };
  boardEl.addEventListener("pointerup", clearPress);
  boardEl.addEventListener("pointercancel", clearPress);

  diffButtons.forEach((btn) => {
    btn.addEventListener("click", () => applyDifficulty(btn.dataset.diff));
  });
  faceBtn.addEventListener("click", () => resetGame());
  againBtn.addEventListener("click", () => resetGame());

  applyDifficulty("easy");
})();
