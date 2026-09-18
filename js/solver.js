/* global NG */
var NG = window.NG || {};

/**
 * 只根据已翻开数字、旗和总雷数做推理。
 * 不读取未翻开格子的真实雷位，因此提示不会“偷看答案”。
 * 规则：基础定式、子集、全局雷数、前沿唯一解（小前沿枚举）。
 */
NG.analyze = function (opts) {
  var rows = opts.rows;
  var cols = opts.cols;
  var n = rows * cols;
  var neigh = opts.neigh || NG.buildNeighbors(rows, cols);
  var open = opts.open;
  var flags = opts.flags;
  var visible = opts.visible; // 已翻开格的数字，未翻开为 -1
  var mineTotal = opts.mineTotal;
  var wantProb = !!opts.wantProb;

  var forcedSafe = [];
  var forcedMine = [];
  var knownMine = new Uint8Array(n);
  var knownSafe = new Uint8Array(n);
  for (var i = 0; i < n; i++) {
    if (flags[i]) knownMine[i] = 1;
    if (open[i]) knownSafe[i] = 1;
  }

  var guard = 0;
  var progress = true;
  while (progress && guard++ < n * 3) {
    progress = false;
    for (var c = 0; c < n; c++) {
      if (!open[c] || visible[c] < 0) continue;
      var nb = neigh[c];
      var mineN = 0;
      var hidden = [];
      for (var k = 0; k < nb.length; k++) {
        var j = nb[k];
        if (knownMine[j]) mineN++;
        else if (!knownSafe[j] && !open[j]) hidden.push(j);
      }
      var need = visible[c] - mineN;
      if (need < 0 || need > hidden.length) {
        return { contradiction: true, safe: forcedSafe, mines: forcedMine, guess: [], probs: null };
      }
      if (!hidden.length) continue;
      if (need === 0) {
        for (var a = 0; a < hidden.length; a++) {
          if (!knownSafe[hidden[a]]) {
            knownSafe[hidden[a]] = 1;
            forcedSafe.push(hidden[a]);
            progress = true;
          }
        }
      } else if (need === hidden.length) {
        for (var b = 0; b < hidden.length; b++) {
          if (!knownMine[hidden[b]]) {
            knownMine[hidden[b]] = 1;
            forcedMine.push(hidden[b]);
            progress = true;
          }
        }
      }
    }
    if (progress) continue;

    var cons = [];
    for (var p = 0; p < n; p++) {
      if (!open[p] || visible[p] < 0) continue;
      var nb2 = neigh[p];
      var mines2 = 0;
      var cells = [];
      for (var q = 0; q < nb2.length; q++) {
        var j2 = nb2[q];
        if (knownMine[j2]) mines2++;
        else if (!knownSafe[j2] && !open[j2]) cells.push(j2);
      }
      var need2 = visible[p] - mines2;
      if (cells.length && need2 >= 0) cons.push({ cells: cells, need: need2 });
    }
    for (var a1 = 0; a1 < cons.length && !progress; a1++) {
      for (var b1 = 0; b1 < cons.length && !progress; b1++) {
        if (a1 === b1) continue;
        if (!subset(cons[a1].cells, cons[b1].cells)) continue;
        var diff = [];
        var setA = {};
        for (var s = 0; s < cons[a1].cells.length; s++) setA[cons[a1].cells[s]] = 1;
        for (var d = 0; d < cons[b1].cells.length; d++) {
          if (!setA[cons[b1].cells[d]]) diff.push(cons[b1].cells[d]);
        }
        var needDiff = cons[b1].need - cons[a1].need;
        if (!diff.length || needDiff < 0 || needDiff > diff.length) continue;
        if (needDiff === 0) {
          for (var u = 0; u < diff.length; u++) {
            if (!knownSafe[diff[u]]) {
              knownSafe[diff[u]] = 1;
              forcedSafe.push(diff[u]);
              progress = true;
            }
          }
        } else if (needDiff === diff.length) {
          for (var v = 0; v < diff.length; v++) {
            if (!knownMine[diff[v]]) {
              knownMine[diff[v]] = 1;
              forcedMine.push(diff[v]);
              progress = true;
            }
          }
        }
      }
    }
    if (progress) continue;

    var unk = [];
    var flagged = 0;
    for (var t = 0; t < n; t++) {
      if (knownMine[t]) flagged++;
      else if (!knownSafe[t] && !open[t]) unk.push(t);
    }
    var remain = mineTotal - flagged;
    if (remain === 0) {
      for (var r0 = 0; r0 < unk.length; r0++) {
        knownSafe[unk[r0]] = 1;
        forcedSafe.push(unk[r0]);
        progress = true;
      }
    } else if (unk.length && remain === unk.length) {
      for (var r1 = 0; r1 < unk.length; r1++) {
        knownMine[unk[r1]] = 1;
        forcedMine.push(unk[r1]);
        progress = true;
      }
    }
  }

  var frontier = [];
  var seen = {};
  for (var f = 0; f < n; f++) {
    if (!open[f]) continue;
    var nb3 = neigh[f];
    for (var g = 0; g < nb3.length; g++) {
      var j3 = nb3[g];
      if (!open[j3] && !knownMine[j3] && !knownSafe[j3] && !seen[j3]) {
        seen[j3] = 1;
        frontier.push(j3);
      }
    }
  }
  var outside = [];
  for (var o = 0; o < n; o++) {
    if (!open[o] && !knownMine[o] && !knownSafe[o] && !seen[o]) outside.push(o);
  }

  var probs = null;
  if (frontier.length && frontier.length <= 16) {
    var flagged2 = 0;
    for (var m = 0; m < n; m++) if (knownMine[m]) flagged2++;
    var csp = enumerate(neigh, open, visible, knownMine, knownSafe, frontier, mineTotal - flagged2, outside.length);
    if (csp && csp.solutions) {
      for (var si = 0; si < frontier.length; si++) {
        if (csp.hits[si] === 0 && !knownSafe[frontier[si]]) {
          knownSafe[frontier[si]] = 1;
          forcedSafe.push(frontier[si]);
        } else if (csp.hits[si] === csp.solutions && !knownMine[frontier[si]]) {
          knownMine[frontier[si]] = 1;
          forcedMine.push(frontier[si]);
        }
      }
      if (outside.length && csp.maxOut === 0) {
        for (var so = 0; so < outside.length; so++) {
          if (!knownSafe[outside[so]]) {
            knownSafe[outside[so]] = 1;
            forcedSafe.push(outside[so]);
          }
        }
      }
      if (outside.length && csp.minOut === outside.length) {
        for (var sm = 0; sm < outside.length; sm++) {
          if (!knownMine[outside[sm]]) {
            knownMine[outside[sm]] = 1;
            forcedMine.push(outside[sm]);
          }
        }
      }
      if (wantProb) {
        probs = {};
        for (var pi = 0; pi < frontier.length; pi++) {
          probs[frontier[pi]] = csp.hits[pi] / csp.solutions;
        }
        if (outside.length && csp.solutions) {
          var outP = 0;
          // approximate: not stored per solution; leave outside unmarked unless forced
        }
        void outP;
      }
    }
  }

  var guess = [];
  for (var gi = 0; gi < frontier.length; gi++) {
    var cell = frontier[gi];
    if (!knownMine[cell] && !knownSafe[cell]) guess.push(cell);
  }
  for (var go = 0; go < outside.length; go++) {
    var cell2 = outside[go];
    if (!knownMine[cell2] && !knownSafe[cell2]) guess.push(cell2);
  }

  return {
    contradiction: false,
    safe: forcedSafe,
    mines: forcedMine,
    guess: guess,
    probs: probs,
  };
};

function subset(a, b) {
  if (a.length > b.length) return false;
  var set = {};
  for (var i = 0; i < b.length; i++) set[b[i]] = 1;
  for (var j = 0; j < a.length; j++) if (!set[a[j]]) return false;
  return true;
}

function enumerate(neigh, open, visible, knownMine, knownSafe, frontier, remainMines, outsideCount) {
  var fn = frontier.length;
  var index = {};
  for (var i = 0; i < fn; i++) index[frontier[i]] = i;
  var cons = [];
  var n = open.length;
  for (var c = 0; c < n; c++) {
    if (!open[c] || visible[c] < 0) continue;
    var nb = neigh[c];
    var bits = [];
    var mines = 0;
    var outsideHidden = false;
    for (var k = 0; k < nb.length; k++) {
      var j = nb[k];
      if (knownMine[j]) mines++;
      else if (!knownSafe[j] && !open[j]) {
        if (index[j] === undefined) outsideHidden = true;
        else bits.push(index[j]);
      }
    }
    if (outsideHidden) continue;
    if (!bits.length) continue;
    cons.push({ bits: bits, need: visible[c] - mines });
  }
  var assign = new Uint8Array(fn);
  var hits = new Uint32Array(fn);
  var solutions = 0;
  var minOut = 99;
  var maxOut = -1;

  function ok(filled) {
    for (var ci = 0; ci < cons.length; ci++) {
      var ct = cons[ci];
      var got = 0;
      var unk = 0;
      for (var bi = 0; bi < ct.bits.length; bi++) {
        var bit = ct.bits[bi];
        if (bit >= filled) unk++;
        else if (assign[bit]) got++;
      }
      if (got > ct.need || got + unk < ct.need) return false;
    }
    return true;
  }

  function dfs(pos, used) {
    if (used > remainMines) return;
    if (!ok(pos)) return;
    if (pos === fn) {
      var out = remainMines - used;
      if (out < 0 || out > outsideCount) return;
      for (var ci = 0; ci < cons.length; ci++) {
        var got = 0;
        var ct = cons[ci];
        for (var bi = 0; bi < ct.bits.length; bi++) if (assign[ct.bits[bi]]) got++;
        if (got !== ct.need) return;
      }
      solutions++;
      for (var h = 0; h < fn; h++) if (assign[h]) hits[h]++;
      if (out < minOut) minOut = out;
      if (out > maxOut) maxOut = out;
      return;
    }
    assign[pos] = 0;
    dfs(pos + 1, used);
    assign[pos] = 1;
    dfs(pos + 1, used + 1);
  }
  dfs(0, 0);
  if (!solutions) return null;
  return { solutions: solutions, hits: hits, minOut: minOut, maxOut: maxOut };
}

/** 用完整局面模拟玩家：只靠可见信息能否清空。 */
NG.proveSolvable = function (rows, cols, numbers, start) {
  var n = rows * cols;
  var neigh = NG.buildNeighbors(rows, cols);
  var open = new Uint8Array(n);
  var flags = new Uint8Array(n);
  var visible = new Int8Array(n);
  visible.fill(-1);
  var mineTotal = 0;
  for (var i = 0; i < n; i++) if (numbers[i] < 0) mineTotal++;

  function flood(cell) {
    var stack = [cell];
    while (stack.length) {
      var cur = stack.pop();
      if (open[cur] || flags[cur] || numbers[cur] < 0) continue;
      open[cur] = 1;
      visible[cur] = numbers[cur];
      if (numbers[cur] === 0) {
        var nb = neigh[cur];
        for (var k = 0; k < nb.length; k++) stack.push(nb[k]);
      }
    }
  }
  if (numbers[start] < 0) return false;
  flood(start);

  var guard = 0;
  while (guard++ < n * 4) {
    var opened = 0;
    for (var c = 0; c < n; c++) if (open[c]) opened++;
    if (opened + mineTotal === n) return true;
    var info = NG.analyze({
      rows: rows,
      cols: cols,
      neigh: neigh,
      open: open,
      flags: flags,
      visible: visible,
      mineTotal: mineTotal,
    });
    if (info.contradiction) return false;
    var moved = false;
    for (var s = 0; s < info.safe.length; s++) {
      var cell = info.safe[s];
      if (!open[cell] && !flags[cell]) {
        if (numbers[cell] < 0) return false;
        flood(cell);
        moved = true;
      }
    }
    for (var m = 0; m < info.mines.length; m++) {
      var mc = info.mines[m];
      if (!flags[mc]) {
        if (numbers[mc] >= 0) return false;
        flags[mc] = 1;
        moved = true;
      }
    }
    if (!moved) return false;
  }
  var opened2 = 0;
  for (var e = 0; e < n; e++) if (open[e]) opened2++;
  return opened2 + mineTotal === n;
};

NG.compute3BV = function (rows, cols, numbers) {
  var n = rows * cols;
  var neigh = NG.buildNeighbors(rows, cols);
  var seen = new Uint8Array(n);
  var openings = 0;
  for (var i = 0; i < n; i++) {
    if (numbers[i] !== 0 || seen[i]) continue;
    openings++;
    var stack = [i];
    seen[i] = 1;
    while (stack.length) {
      var cur = stack.pop();
      var nb = neigh[cur];
      for (var k = 0; k < nb.length; k++) {
        var j = nb[k];
        if (seen[j] || numbers[j] < 0) continue;
        seen[j] = 1;
        if (numbers[j] === 0) stack.push(j);
      }
    }
  }
  var rest = 0;
  for (var c = 0; c < n; c++) {
    if (numbers[c] > 0 && !seen[c]) rest++;
  }
  return openings + rest;
};
