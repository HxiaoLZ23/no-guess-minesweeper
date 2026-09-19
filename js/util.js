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

NG.cellFor = function (rows, cols) {
  var side = Math.max(rows | 0, cols | 0);
  if (side <= 8) return 46;
  if (side <= 10) return 40;
  if (side <= 12) return 34;
  if (side <= 14) return 30;
  if (side <= 16) return 26;
  if (side <= 22) return 22;
  return 20;
};

NG.DIFFS = {
  easy: { id: "easy", group: "经典", label: "初级", rows: 9, cols: 9, mines: 10, cell: 40 },
  medium: { id: "medium", group: "经典", label: "中级", rows: 16, cols: 16, mines: 40, cell: 26 },
  hard: { id: "hard", group: "经典", label: "高级", rows: 16, cols: 30, mines: 99, cell: 20 },
  ngEasy: { id: "ngEasy", group: "无猜密度", label: "疏雷", rows: 9, cols: 9, mines: 8, cell: 40 },
  ngMedium: { id: "ngMedium", group: "无猜密度", label: "匀雷", rows: 16, cols: 16, mines: 30, cell: 26 },
  ngHard: { id: "ngHard", group: "无猜密度", label: "密雷", rows: 16, cols: 30, mines: 75, cell: 20 },
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
 * 教学关卡：只练一手定式。
 * forceOpen：开局已翻开的安全格。
 * mines：雷的下标（row-major）。
 */
NG.LESSONS = [
  {
    id: "single",
    chapter: "入门",
    title: "单格定雷",
    text: "数字周围只剩一格，且仍缺一颗雷时，该格为雷。",
    detail: "从中心翻开。空白区域会连通展开。左上角仅余一格未翻开，相邻数字为 1，且其周围已无其他未知格。该数字仍缺一颗雷，故此格为雷。",
    rows: 5, cols: 5, mines: [0], startR: 2, startC: 2, cell: 40,
  },
  {
    id: "clear",
    chapter: "入门",
    title: "数字已满足",
    text: "周围旗数已等于数字时，其余格子均可翻开。",
    detail: "先标出应当标旗的格子。当某数字周围的旗数等于该数字时，其看见的其余格子必为安全。可逐格翻开，也可双击或中键该数字，一次翻开周围剩余格子。",
    rows: 5, cols: 5, mines: [0, 1], startR: 3, startC: 3, cell: 40,
  },
  {
    id: "pattern121",
    chapter: "定式",
    title: "1-2-1",
    text: "边缘出现 1-2-1 时，两侧正下方为雷，正中为安全。",
    detail: "观察贴边的 1-2-1。两侧的 1 各自只能再对应一颗雷，中间的 2 比两侧各多看见正下方一格。两颗雷只能位于两个 1 的正下方，中间 2 的正下方为安全。先标两侧，再翻开正中。",
    rows: 4, cols: 6, mines: [6, 8], startR: 3, startC: 3, cell: 38,
  },
  {
    id: "pattern1221",
    chapter: "定式",
    title: "1-2-2-1",
    text: "1-2-2-1 中，两个 2 的正下方为雷，两端正下方为安全。",
    detail: "上方已翻开，数字为 1-2-2-1。两个 2 各自仍缺两颗雷，且共用正下方相邻的两格，因此这两格均为雷。两端 1 的正下方则为安全。标出中间两颗后，再翻开两端。",
    rows: 2, cols: 4, mines: [5, 6], startR: 0, startC: 0,
    forceOpen: [0, 1, 2, 3], cell: 44,
  },
  {
    id: "pattern12121",
    chapter: "定式",
    title: "1-2-1-2-1",
    text: "1-2-1-2-1 中，三个 1 的正下方为雷，两个 2 的正下方为安全。",
    detail: "上方为 1-2-1-2-1。从最左侧的 1 开始：它只能对应正下方一格，先标为雷。相邻的 2 在扣除这一颗后，正下方即为安全。每确定一格，下一数字的未知格便减少一格，可依次推至最右侧。",
    rows: 2, cols: 5, mines: [5, 7, 9], startR: 0, startC: 0,
    forceOpen: [0, 1, 2, 3, 4], cell: 40,
  },
  {
    id: "corner12",
    chapter: "定式",
    title: "角落 1-2",
    text: "贴边的 1 只看见下方两格，相邻的 2 多看见右侧一格，故该格为雷。下方两格中仍有一颗雷，需再由右侧的 2 确定，不可两格都标旗。",
    detail: "上方三格为 1、2、2。贴边的 1 只看见下方两格，相邻的 2 比它多看见最右侧一格，故该格为雷，应先标旗。此后右侧的 2 亦只剩一颗未确定，位于它与中间的 2、以及 1 共同看见的格子。1 下方两格中只有一颗雷，另一格为安全。",
    rows: 2, cols: 3, mines: [4, 5], startR: 0, startC: 0,
    forceOpen: [0, 1, 2], cell: 48,
  },
  {
    id: "pattern232",
    chapter: "进阶",
    title: "2-3-2",
    text: "2-3-2 的下方三格均为雷。",
    detail: "上方为 2-3-2。中间的 3 只看见下方三格，且数字恰为 3，故这三格均为雷。左右两个 2 看见的格子都包含在这三格之中，三面标旗后，两个 2 亦已满足。",
    rows: 2, cols: 3, mines: [3, 4, 5], startR: 0, startC: 1,
    forceOpen: [0, 1, 2], cell: 48,
  },
  {
    id: "subset",
    chapter: "进阶",
    title: "差集推理",
    text: "1 看见的格子是 2 看见的子集，2 多出的那一格必为雷。",
    detail: "先看数字较小的格子。它看见的未知格全部也被旁边的 2 看见，而 2 还多看见一格。多出的这一格即多出的那颗雷，应先标旗。标出之后，1 所缺的雷会落在剩余格子中，再借助另一数字排除安全格。",
    rows: 2, cols: 3, mines: [2, 3], startR: 0, startC: 0,
    forceOpen: [0, 1, 5], cell: 48,
  },
  {
    id: "remainCount",
    chapter: "进阶",
    title: "剩余雷数",
    text: "剩余未知格数等于剩余雷数时，这些未知格均为雷。",
    detail: "大部分格子已经翻开。此时比较剩余雷数：未翻开的格数若与剩余雷数相同，则这些未知格全部为雷。逐格标旗即可，不必再在其中寻找安全格。",
    rows: 3, cols: 4, mines: [3, 7, 8], startR: 0, startC: 0,
    forceOpen: [0, 1, 2, 4, 5, 6, 9, 10, 11], cell: 40,
  },
  {
    id: "doubleWall",
    chapter: "进阶",
    title: "双侧夹击",
    text: "上下两排数字夹住中间一排。结合两端，可确定整排。",
    detail: "上下两排均已翻开，夹住中间一排未知格。上下数字描述的是同一排格子。从两端约束最紧的数字开始对照：上下都能解释的位置为雷，不能同时满足的位置为安全。一侧确定一格后，另一侧的未知格也会减少。",
    rows: 3, cols: 5,
    mines: [5, 7, 9],
    startR: 0, startC: 2,
    forceOpen: [0, 1, 2, 3, 4, 10, 11, 12, 13, 14],
    cell: 36,
  },
  {
    id: "halfOpen",
    chapter: "进阶",
    title: "由左至右",
    text: "左侧已形成 1-2-2。先完成左侧，右侧格子会随之确定。",
    detail: "左侧先呈现 1-2-2。利用 1 与 2 的差集，先确定左侧的雷，并翻开可以翻开的安全格。左侧完成后，右侧数字看见的未知格减少，最后一颗雷才会显现。应按从左到右的顺序推进。",
    rows: 2, cols: 4, mines: [5, 6], startR: 0, startC: 0,
    forceOpen: [0, 1, 2], cell: 44,
  },
  {
    id: "echo121",
    chapter: "挑战",
    title: "上下呼应",
    text: "上排为 1-2-1，下排两角亦为数字。两侧信息结合后，中间即可确定。",
    detail: "上排为 1-2-1，先按此定式将两侧正下方标为雷。再以下排两角的数字核对中间：该位置必须同时满足上排与下排。两侧一致的格子为雷，不一致的格子应翻开。",
    rows: 3, cols: 3, mines: [3, 5, 7], startR: 0, startC: 1,
    forceOpen: [0, 1, 2, 6, 8], cell: 44,
  },
  {
    id: "island",
    chapter: "挑战",
    title: "边缘优先",
    text: "大片区域已翻开，中间留有未翻开的局部。先处理边缘数字，再处理内部定式。",
    detail: "大片区域已经翻开，中间留下若干未翻开的格子。应先看边缘数字，它们看见的未知格较少，可以先定雷、先翻安全格。边缘处理完一层后，内部定式才会显现。应从外向内推进。",
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
    text: "先用 1-2-1 完成左侧，再由右侧数字确定最后一颗雷。",
    detail: "先看已经翻开的底边。左侧可构成 1-2-1，据此标出左侧的雷并翻开安全格。左侧完成后，右侧数字看见的未知格减少，最后一颗雷即可确定。应先完成左侧，再处理右侧。",
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
    text: "角落中多个数字相互重叠。从约束最紧的 1 开始，逐步推导。",
    detail: "角落里几个数字相互重叠。从看见格子最少的 1 开始，它能先确定一颗雷。标出之后，相邻数字的未知格减少，再推导下一颗。每次只处理当前唯一能够确定的一步。",
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
