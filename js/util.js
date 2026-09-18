/* global NG */
var NG = window.NG || {};

NG.idx = function (r, c, cols) {
  return r * cols + c;
};

NG.clamp = function (v, a, b) {
  return Math.max(a, Math.min(b, v));
};

NG.hashSeed = function (text) {
  var h = 2166136261;
  var s = String(text);
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

NG.mulberry32 = function (seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

NG.buildNeighbors = function (rows, cols) {
  var n = rows * cols;
  var lists = new Array(n);
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var i = r * cols + c;
      var arr = [];
      for (var dr = -1; dr <= 1; dr++) {
        for (var dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          var rr = r + dr;
          var cc = c + dc;
          if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) arr.push(rr * cols + cc);
        }
      }
      lists[i] = arr;
    }
  }
  return lists;
};

NG.DIFFS = {
  easy: { id: "easy", group: "经典", label: "初级", rows: 9, cols: 9, mines: 10, cell: 36 },
  medium: { id: "medium", group: "经典", label: "中级", rows: 16, cols: 16, mines: 40, cell: 28 },
  hard: { id: "hard", group: "经典", label: "高级", rows: 16, cols: 30, mines: 99, cell: 24 },
  ngEasy: { id: "ngEasy", group: "无猜密度", label: "疏雷", rows: 9, cols: 9, mines: 8, cell: 36 },
  ngMedium: { id: "ngMedium", group: "无猜密度", label: "匀雷", rows: 16, cols: 16, mines: 30, cell: 28 },
  ngHard: { id: "ngHard", group: "无猜密度", label: "密雷", rows: 16, cols: 30, mines: 75, cell: 24 },
};

NG.DIFF_LADDER = ["ngEasy", "easy", "ngMedium", "medium", "ngHard", "hard"];

NG.nextDiff = function (id, dir) {
  var i = NG.DIFF_LADDER.indexOf(id);
  if (i < 0) return null;
  var j = i + (dir > 0 ? 1 : -1);
  if (j < 0 || j >= NG.DIFF_LADDER.length) return null;
  return NG.DIFF_LADDER[j];
};

NG.LESSONS = [
  {
    id: "single",
    title: "单格定雷",
    text: "某个数字周围只剩一个未开格，且还差一颗雷，那一格一定是雷。先看左上角的 1。",
    rows: 5,
    cols: 5,
    mines: [0],
    startR: 2,
    startC: 2,
  },
  {
    id: "clear",
    title: "数字已满足",
    text: "旗数已经等于数字时，周围其余格子都安全，可以一次性翻开。",
    rows: 5,
    cols: 5,
    mines: [0, 1],
    startR: 3,
    startC: 3,
  },
  {
    id: "pattern121",
    title: "1-2-1",
    text: "边上连续出现 1-2-1 时，两侧是雷，正中间安全。这是不用枚举也能直接用的经典式。",
    rows: 4,
    cols: 6,
    mines: [6, 8],
    startR: 3,
    startC: 3,
  },
  {
    id: "pattern1221",
    title: "1-2-2-1",
    text: "上面一排是 1-2-2-1。两个 2 的正下方是雷，两端正下方安全。",
    rows: 2,
    cols: 4,
    mines: [5, 6],
    startR: 0,
    startC: 0,
    forceOpen: [0, 1, 2, 3],
  },
];
