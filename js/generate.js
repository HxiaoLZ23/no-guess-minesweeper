/* global NG */
var NG = window.NG || {};

var UNK = 0;
var SAFE = 1;
var MINE = 2;

/**
 * 逆向构造，而不是“随机埋雷再丢弃”。
 *
 * 1. 先把首击连成一片 0 区，并把它周围一圈标成安全。首击和周围八格因此必无雷。
 * 2. 玩家能看见的每个数字，只允许用“全是雷”或“全是安全”这种唯一推法补全，
 *    再用基础定式、子集和剩余雷数把推论传播开。
 * 3. 传播停住时才回溯上一个唯一推法的选择。整条搜索树就是推理链本身。
 * 4. 构造完成后，再用独立求解器走一遍。走不通就换一个开口重造，不会采用有歧义的雷图。
 */
NG.generate = function (opts) {
  var rows = opts.rows;
  var cols = opts.cols;
  var mineTarget = opts.mines;
  var startR = opts.startR;
  var startC = opts.startC;
  var rng = opts.rng || Math.random;
  var n = rows * cols;
  var neigh = NG.buildNeighbors(rows, cols);
  var start = startR * cols + startC;
  var minSafe = 1 + neigh[start].length;
  if (mineTarget < 1 || mineTarget > n - minSafe) {
    return { ok: false, reason: "雷数超出无猜可构造范围（需为首击留出空白）" };
  }

  var started = now();
  var best = null;
  var attempts = 0;
  var zeroBias = 0;
  while (attempts < 8 && now() - started < (opts.budget || 280)) {
    attempts++;
    var built = construct(rows, cols, neigh, start, mineTarget, rng, zeroBias);
    zeroBias += 2;
    if (!built) continue;
    var numbers = built.numbers;
    if (!NG.proveSolvable(rows, cols, numbers, start)) {
      NG.lastFail = "proof";
      continue;
    }
    best = built;
    break;
  }
  if (!best) {
    return { ok: false, reason: "这个雷密度构造不出无猜局面，请减少雷数或换一个起点", attempts: attempts };
  }
  var opening = floodCount(neigh, best.numbers, start);
  return {
    ok: true,
    numbers: best.numbers,
    mines: best.mines,
    ms: Math.round(now() - started),
    nodes: best.nodes,
    opening: opening,
    attempts: attempts,
    bbbv: NG.compute3BV(rows, cols, best.numbers),
  };
};

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function floodCount(neigh, numbers, start) {
  var seen = new Uint8Array(numbers.length);
  var stack = [start];
  var count = 0;
  seen[start] = 1;
  while (stack.length) {
    var cur = stack.pop();
    if (numbers[cur] < 0) continue;
    count++;
    if (numbers[cur] !== 0) continue;
    var nb = neigh[cur];
    for (var i = 0; i < nb.length; i++) {
      if (!seen[nb[i]]) {
        seen[nb[i]] = 1;
        stack.push(nb[i]);
      }
    }
  }
  return count;
}

function construct(rows, cols, neigh, start, mineTarget, rng, zeroBias) {
  var n = rows * cols;
  var label = new Uint8Array(n);
  var opened = new Uint8Array(n);
  var revealed = new Int8Array(n);
  revealed.fill(-2);
  var mineCount = 0;
  var nodes = 0;
  var limit = n > 300 ? 20000 : 12000;

  var maxSafe = n - mineTarget;
  var openCap = Math.min(maxSafe, n <= 81 ? 26 : n <= 256 ? 46 : 64);
  var zTarget = (n <= 81 ? 5 : n <= 256 ? 8 : 11) - zeroBias;
  if (zTarget < 1) zTarget = 1;

  label[start] = SAFE;
  var safeCount = 1;
  var zeros = [start];
  var inZero = {};
  inZero[start] = 1;
  var growGuard = 0;
  while (zeros.length < zTarget && growGuard++ < n * 3) {
    var base = zeros[(rng() * zeros.length) | 0];
    var nb = neigh[base];
    var cand = [];
    for (var i = 0; i < nb.length; i++) if (!inZero[nb[i]]) cand.push(nb[i]);
    if (!cand.length) continue;
    var pick = cand[(rng() * cand.length) | 0];
    var extra = 0;
    if (label[pick] !== SAFE) extra++;
    var pnb = neigh[pick];
    for (var j = 0; j < pnb.length; j++) if (label[pnb[j]] !== SAFE) extra++;
    if (safeCount + extra > openCap) continue;
    inZero[pick] = 1;
    zeros.push(pick);
    if (label[pick] !== SAFE) {
      label[pick] = SAFE;
      safeCount++;
    }
    for (var t = 0; t < pnb.length; t++) {
      if (label[pnb[t]] !== SAFE) {
        label[pnb[t]] = SAFE;
        safeCount++;
      }
    }
  }
  // 首击周围现有格子全部安全（含不足 8 格的边缘）
  var halo = neigh[start];
  for (var h = 0; h < halo.length; h++) {
    if (label[halo[h]] === MINE) return null;
    if (label[halo[h]] !== SAFE) {
      if (safeCount + 1 > maxSafe) return null;
      label[halo[h]] = SAFE;
      safeCount++;
    }
  }

  var wall = new Uint8Array(n);
  for (var zi = 0; zi < zeros.length; zi++) {
    var znb = neigh[zeros[zi]];
    for (var zk = 0; zk < znb.length; zk++) if (!inZero[znb[zk]]) wall[znb[zk]] = 1;
  }

  if (!openSafe(start)) return null;

  function countUnknown() {
    var c = 0;
    for (var i = 0; i < n; i++) if (label[i] === UNK) c++;
    return c;
  }

  function unknownNeighbors(i, buf) {
    var nb2 = neigh[i];
    var w = 0;
    for (var k = 0; k < nb2.length; k++) if (label[nb2[k]] === UNK) buf[w++] = nb2[k];
    return w;
  }

  function mineNeighbors(i) {
    var nb2 = neigh[i];
    var c = 0;
    for (var k = 0; k < nb2.length; k++) if (label[nb2[k]] === MINE) c++;
    return c;
  }

  function openSafe(i) {
    if (label[i] === MINE) return false;
    label[i] = SAFE;
    if (opened[i]) return true;
    opened[i] = 1;
    var buf = [0, 0, 0, 0, 0, 0, 0, 0];
    var uc = unknownNeighbors(i, buf);
    if (uc === 0) {
      var num = mineNeighbors(i);
      revealed[i] = num;
        if (num === 0) {
        if (wall[i]) return false;
        var nb2 = neigh[i];
        for (var k = 0; k < nb2.length; k++) {
          if (!opened[nb2[k]] && !openSafe(nb2[k])) return false;
        }
      }
    } else {
      revealed[i] = -1;
    }
    return true;
  }

  function optionsFor(i) {
    var buf = [0, 0, 0, 0, 0, 0, 0, 0];
    var uc = unknownNeighbors(i, buf);
    var cells = buf.slice(0, uc);
    if (!uc) return { cells: cells, opts: [] };
    var totalUnk = countUnknown();
    var need = mineTarget - mineCount;
    var rest = totalUnk - uc;
    var opts = [];
    if (need >= uc && need <= uc + rest) opts.push("mines");
    if (need >= 0 && need <= rest) opts.push("safe");
    if (wall[i] && mineNeighbors(i) === 0 && need >= 1) {
      return { i: i, cells: cells, opts: ["cover"] };
    }
    return { i: i, cells: cells, opts: opts };
  }

  function commit(i, kind) {
    var spec = optionsFor(i);
    if (!spec.cells.length) return true;
    if (kind === "mines") {
      if (mineCount + spec.cells.length > mineTarget) return false;
      for (var a = 0; a < spec.cells.length; a++) {
        var cell = spec.cells[a];
        if (label[cell] === SAFE) return false;
        if (label[cell] !== MINE) {
          label[cell] = MINE;
          mineCount++;
        }
      }
    } else {
      for (var b = 0; b < spec.cells.length; b++) {
        if (label[spec.cells[b]] === MINE) return false;
      }
      for (var c = 0; c < spec.cells.length; c++) {
        if (!openSafe(spec.cells[c])) return false;
      }
    }
    var buf = [0, 0, 0, 0, 0, 0, 0, 0];
    if (unknownNeighbors(i, buf) === 0) {
      var num = mineNeighbors(i);
      if (revealed[i] >= 0 && revealed[i] !== num) return false;
      if (wall[i] && num === 0) return false;
      revealed[i] = num;
    }
    return mineCount <= mineTarget;
  }

  function propagate() {
    var spins = 0;
    while (spins++ < n * 5) {
      var changed = false;
      for (var i = 0; i < n; i++) {
        if (!opened[i] || revealed[i] !== -1) continue;
        var buf = [0, 0, 0, 0, 0, 0, 0, 0];
        if (unknownNeighbors(i, buf) === 0) {
          revealed[i] = mineNeighbors(i);
          changed = true;
          if (revealed[i] === 0) {
            if (wall[i]) return false;
            var nb0 = neigh[i];
            for (var z = 0; z < nb0.length; z++) {
              if (!opened[nb0[z]] && !openSafe(nb0[z])) return false;
            }
          }
        }
      }
      for (var c = 0; c < n; c++) {
        if (!opened[c] || revealed[c] < 0) continue;
        var nb = neigh[c];
        var mines = 0;
        var hidden = [];
        for (var k = 0; k < nb.length; k++) {
          var j = nb[k];
          if (label[j] === MINE) mines++;
          else if (label[j] === UNK) hidden.push(j);
          else if (label[j] !== SAFE) return false;
        }
        var need = revealed[c] - mines;
        if (need < 0 || need > hidden.length) return false;
        if (!hidden.length) continue;
        if (need === 0) {
          for (var a = 0; a < hidden.length; a++) {
            if (!openSafe(hidden[a])) return false;
          }
          changed = true;
        } else if (need === hidden.length) {
          for (var b = 0; b < hidden.length; b++) {
            if (label[hidden[b]] === SAFE) return false;
            if (label[hidden[b]] !== MINE) {
              label[hidden[b]] = MINE;
              mineCount++;
              if (mineCount > mineTarget) return false;
              changed = true;
            }
          }
        }
      }
      if (changed) continue;

      var cons = [];
      for (var p = 0; p < n; p++) {
        if (!opened[p] || revealed[p] < 0) continue;
        var nb2 = neigh[p];
        var mines2 = 0;
        var cells = [];
        for (var q = 0; q < nb2.length; q++) {
          var j2 = nb2[q];
          if (label[j2] === MINE) mines2++;
          else if (label[j2] === UNK) cells.push(j2);
        }
        var need2 = revealed[p] - mines2;
        if (cells.length && need2 >= 0 && need2 <= cells.length) cons.push({ cells: cells, need: need2 });
      }
      for (var a1 = 0; a1 < cons.length && !changed; a1++) {
        for (var b1 = 0; b1 < cons.length && !changed; b1++) {
          if (a1 === b1) continue;
          if (cons[a1].cells.length > cons[b1].cells.length) continue;
          var setA = {};
          var sub = true;
          for (var s = 0; s < cons[a1].cells.length; s++) setA[cons[a1].cells[s]] = 1;
          for (var s2 = 0; s2 < cons[a1].cells.length; s2++) {
            var found = false;
            for (var s3 = 0; s3 < cons[b1].cells.length; s3++) {
              if (cons[b1].cells[s3] === cons[a1].cells[s2]) found = true;
            }
            if (!found) sub = false;
          }
          if (!sub) continue;
          var diff = [];
          for (var d = 0; d < cons[b1].cells.length; d++) {
            if (!setA[cons[b1].cells[d]]) diff.push(cons[b1].cells[d]);
          }
          var needDiff = cons[b1].need - cons[a1].need;
          if (!diff.length || needDiff < 0 || needDiff > diff.length) continue;
          if (needDiff === 0) {
            for (var u = 0; u < diff.length; u++) {
              if (!openSafe(diff[u])) return false;
            }
            changed = true;
          } else if (needDiff === diff.length) {
            for (var v = 0; v < diff.length; v++) {
              if (label[diff[v]] === SAFE) return false;
              if (label[diff[v]] !== MINE) {
                label[diff[v]] = MINE;
                mineCount++;
                if (mineCount > mineTarget) return false;
                changed = true;
              }
            }
          }
        }
      }
      if (changed) continue;

      var forced = false;
      for (var f = 0; f < n; f++) {
        if (!opened[f] || revealed[f] !== -1) continue;
        var spec = optionsFor(f);
        if (!spec.cells.length) continue;
        if (!spec.opts.length) return false;
        if (spec.opts.length === 1 && spec.opts[0] !== "cover") {
          if (!commit(f, spec.opts[0])) return false;
          forced = true;
          changed = true;
          break;
        }
      }
      if (!forced) break;
    }

    if (mineCount > mineTarget) return false;
    if (mineCount + countUnknown() < mineTarget) return false;

    var pending = false;
    for (var pi = 0; pi < n; pi++) {
      if (opened[pi] && revealed[pi] === -1) {
        var buf2 = [0, 0, 0, 0, 0, 0, 0, 0];
        if (unknownNeighbors(pi, buf2) > 0) pending = true;
      }
    }
    if (!pending) {
      var unk = [];
      for (var ui = 0; ui < n; ui++) if (label[ui] === UNK) unk.push(ui);
      var needLeft = mineTarget - mineCount;
      if (!unk.length) return needLeft === 0;
      if (needLeft === 0) {
        for (var us = 0; us < unk.length; us++) if (!openSafe(unk[us])) return false;
        return propagate();
      }
      if (needLeft === unk.length) {
        for (var um = 0; um < unk.length; um++) {
          label[unk[um]] = MINE;
          mineCount++;
        }
        return true;
      }
    }
    return true;
  }

  function pickChoice() {
    var best = null;
    var cover = null;
    for (var i = 0; i < n; i++) {
      if (!opened[i] || revealed[i] !== -1) continue;
      var spec = optionsFor(i);
      if (!spec.cells.length) continue;
      if (spec.opts.indexOf("cover") >= 0) {
        if (!cover || spec.cells.length < cover.cells.length) cover = spec;
        continue;
      }
      if (spec.opts.length < 2) continue;
      if (!best || spec.cells.length < best.cells.length || (spec.cells.length === best.cells.length && rng() < 0.5)) {
        best = spec;
      }
    }
    return cover || best;
  }

  function search() {
    if (++nodes > limit) return false;
    if (!propagate()) return false;
    if (countUnknown() === 0) return mineCount === mineTarget;
    var choice = pickChoice();
    if (!choice) return false;
    var decided = n - countUnknown();
    var expect = (mineTarget / n) * Math.max(decided, 1);
    var prefer = mineCount + 0.35 < expect ? "mines" : "safe";
    var opts = choice.opts.slice();
    opts.sort(function (a, b) {
      if (a === prefer) return -1;
      if (b === prefer) return 1;
      return 0;
    });
    var snapL = label.slice();
    var snapO = opened.slice();
    var snapR = revealed.slice();
    var snapM = mineCount;
    if (opts.length === 1 && opts[0] === "cover") {
      for (var ci = 0; ci < choice.cells.length; ci++) {
        var cell = choice.cells[ci];
        if (label[cell] !== UNK || mineCount >= mineTarget) continue;
        label[cell] = MINE;
        mineCount++;
        if (search()) return true;
        label.set(snapL);
        opened.set(snapO);
        revealed.set(snapR);
        mineCount = snapM;
      }
      return false;
    }
    for (var oi = 0; oi < opts.length; oi++) {
      if (commit(choice.i, opts[oi]) && search()) return true;
      label.set(snapL);
      opened.set(snapO);
      revealed.set(snapR);
      mineCount = snapM;
    }
    return false;
  }

  if (!search()) {
    NG.lastFail = "search";
    return null;
  }
  if (mineCount !== mineTarget) {
    NG.lastFail = "count " + mineCount;
    return null;
  }

  var numbers = new Int8Array(n);
  var mines = new Uint8Array(n);
  for (var i = 0; i < n; i++) {
    if (label[i] === MINE) {
      mines[i] = 1;
      numbers[i] = -1;
    }
  }
  for (var r = 0; r < n; r++) {
    if (mines[r]) continue;
    var nb = neigh[r];
    var c = 0;
    for (var k = 0; k < nb.length; k++) if (mines[nb[k]]) c++;
    numbers[r] = c;
  }
  // 首击必须是 0，周围无雷
  if (numbers[start] !== 0) return null;
  var around = neigh[start];
  for (var ai = 0; ai < around.length; ai++) if (mines[around[ai]]) return null;
  for (var wi = 0; wi < n; wi++) if (wall[wi] && numbers[wi] <= 0) return null;

  return { numbers: numbers, mines: mines, nodes: nodes };
}

NG.selfTest = function () {
  var cases = [
    { name: "初级", rows: 9, cols: 9, mines: 10, n: 4 },
    { name: "中级", rows: 16, cols: 16, mines: 40, n: 2 },
    { name: "高级", rows: 16, cols: 30, mines: 99, n: 1 },
  ];
  var report = [];
  for (var ci = 0; ci < cases.length; ci++) {
    var cs = cases[ci];
    for (var k = 0; k < cs.n; k++) {
      var rng = NG.mulberry32(1000 + ci * 50 + k * 17);
      var sr = 1 + ((rng() * (cs.rows - 2)) | 0);
      var sc = 1 + ((rng() * (cs.cols - 2)) | 0);
      var res = NG.generate({
        rows: cs.rows,
        cols: cs.cols,
        mines: cs.mines,
        startR: sr,
        startC: sc,
        rng: rng,
        budget: cs.mines > 80 ? 700 : 350,
      });
      report.push({
        name: cs.name,
        ok: !!res.ok,
        ms: res.ms || null,
        opening: res.opening || 0,
        nodes: res.nodes || 0,
        reason: res.reason || "",
        bbbv: res.bbbv || 0,
      });
    }
  }
  return report;
};
