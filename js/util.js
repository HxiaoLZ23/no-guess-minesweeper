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

/**
 * 闯关关卡：由浅入深。
 * forceOpen：开局已翻开的安全格（展示定式）。
 * mines：雷的下标（row-major）。
 */
NG.LESSONS = [
  {
    id: "single",
    chapter: "入门",
    title: "单格定雷",
    text: "数字周围只剩一格，且还差一颗雷，那一格就是雷。",
    rows: 5, cols: 5, mines: [0], startR: 2, startC: 2, cell: 40,
  },
  {
    id: "clear",
    chapter: "入门",
    title: "数字已满足",
    text: "周围旗数已经够了，剩下的都可以放心翻开。",
    rows: 5, cols: 5, mines: [0, 1], startR: 3, startC: 3, cell: 40,
  },
  {
    id: "pattern121",
    chapter: "定式",
    title: "1-2-1",
    text: "边上出现 1-2-1：两侧下方是雷，正中间安全。",
    rows: 4, cols: 6, mines: [6, 8], startR: 3, startC: 3, cell: 38,
  },
  {
    id: "pattern1221",
    chapter: "定式",
    title: "1-2-2-1",
    text: "上面是 1-2-2-1：两个 2 正下方是雷，两端正下方安全。",
    rows: 2, cols: 4, mines: [5, 6], startR: 0, startC: 0,
    forceOpen: [0, 1, 2, 3], cell: 44,
  },
  {
    id: "pattern12121",
    chapter: "定式",
    title: "1-2-1-2-1",
    text: "一长串 1-2-1-2-1：三个 1 的正下方是雷，两个 2 的正下方安全。",
    rows: 2, cols: 5, mines: [5, 7, 9], startR: 0, startC: 0,
    forceOpen: [0, 1, 2, 3, 4], cell: 40,
  },
  {
    id: "corner12",
    chapter: "定式",
    title: "角落 1-2",
    text: "角落的 1 旁边是 2。先用 1 定住一颗雷，再处理 2。",
    rows: 3, cols: 3, mines: [3, 5], startR: 0, startC: 0,
    forceOpen: [0, 1, 7], cell: 44,
  },
  {
    id: "pattern232",
    chapter: "进阶",
    title: "2-3-2",
    text: "上面是 2-3-2：下面三个格子全是雷。",
    rows: 2, cols: 3, mines: [3, 4, 5], startR: 0, startC: 1,
    forceOpen: [0, 1, 2], cell: 48,
  },
  {
    id: "subset",
    chapter: "进阶",
    title: "差集推理",
    text: "1 看见的格子是 2 看见的一部分。2 多出来的那一格一定是雷。",
    rows: 2, cols: 3, mines: [2, 3], startR: 0, startC: 0,
    forceOpen: [0, 1, 5], cell: 48,
  },
  {
    id: "remainCount",
    chapter: "进阶",
    title: "剩余雷数",
    text: "剩下几格未知，就还剩几颗雷：这些未知格全是雷。",
    rows: 3, cols: 4, mines: [3, 7, 8], startR: 0, startC: 0,
    forceOpen: [0, 1, 2, 4, 5, 6, 9, 10, 11], cell: 40,
  },
  {
    id: "doubleWall",
    chapter: "进阶",
    title: "双侧夹击",
    text: "上下两排数字夹住中间。结合两端，能定出中间整排。",
    rows: 3, cols: 5,
    mines: [5, 7, 9],
    startR: 0, startC: 2,
    forceOpen: [0, 1, 2, 3, 4, 10, 11, 12, 13, 14],
    cell: 36,
  },
  {
    id: "halfOpen",
    chapter: "进阶",
    title: "先左后右",
    text: "左边已经摆好 1-2-2。先清完左边，右边那一格会跟着解开。",
    rows: 2, cols: 4, mines: [5, 6], startR: 0, startC: 0,
    forceOpen: [0, 1, 2], cell: 44,
  },
  {
    id: "echo121",
    chapter: "挑战",
    title: "上下呼应",
    text: "上排是 1-2-1，下排两角也是数字。两边信息合在一起，中间就能定。",
    rows: 3, cols: 3, mines: [3, 5, 7], startR: 0, startC: 1,
    forceOpen: [0, 1, 2, 6, 8], cell: 44,
  },
  {
    id: "island",
    chapter: "挑战",
    title: "开口里的小岛",
    text: "大片已打开，中间留着小岛。先清岸边数字，再处理岛上定式。",
    rows: 4, cols: 5,
    mines: [6, 8, 16],
    startR: 3, startC: 0,
    forceOpen: [10, 11, 12, 13, 14, 15, 17, 18, 19],
    cell: 36,
  },
  {
    id: "combo",
    chapter: "挑战",
    title: "定式连招",
    text: "先用 1-2-1 清左边，再靠右边数字把最后一颗雷定住。",
    rows: 3, cols: 6,
    mines: [6, 8, 11],
    startR: 2, startC: 2,
    forceOpen: [12, 13, 14, 15, 16, 17],
    cell: 36,
  },
  {
    id: "denseCorner",
    chapter: "挑战",
    title: "角落连环",
    text: "角落几个数字套在一起。从最紧的 1 开始抠，不要跳步。",
    rows: 3, cols: 4,
    mines: [3, 5, 9],
    startR: 0, startC: 0,
    forceOpen: [0, 1, 2, 4, 8],
    cell: 40,
  },
];

NG.lessonLabel = function (ls, i) {
  return (i + 1) + ". [" + (ls.chapter || "关卡") + "] " + ls.title;
};
