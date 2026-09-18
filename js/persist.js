/* global NG */
var NG = window.NG || {};

var SETTINGS_KEY = "ng-settings-v1";
var STATS_KEY = "ng-stats-v1";

NG.defaultSettings = function () {
  return {
    theme: "soft",
    palette: "classic",
    sound: false,
    motion: true,
    confirm: false,
    errors: false,
    assist: "hint",
    noFlag: false,
    mineClick: "lose",
    cell: 32,
    largeText: false,
    mode: "practice",
    diff: "easy",
  };
};

NG.loadSettings = function () {
  var base = NG.defaultSettings();
  try {
    var raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    for (var k in base) if (raw[k] !== undefined) base[k] = raw[k];
  } catch (e) { /* ignore */ }
  return base;
};

NG.saveSettings = function (s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
};

NG.loadStats = function () {
  try {
    var raw = JSON.parse(localStorage.getItem(STATS_KEY) || "null");
    if (raw && raw.games) {
      if (!raw.daily) raw.daily = {};
      if (raw.lossStreak == null) raw.lossStreak = 0;
      return raw;
    }
  } catch (e) { /* ignore */ }
  return { games: [], best: {}, daily: {}, streak: 0, lossStreak: 0 };
};

NG.saveStats = function (stats) {
  var copy = {
    best: stats.best,
    daily: stats.daily || {},
    streak: stats.streak,
    lossStreak: stats.lossStreak || 0,
    games: stats.games.slice(-40).map(function (g) {
      var slim = {};
      for (var k in g) if (k !== "actions") slim[k] = g[k];
      return slim;
    }),
  };
  var full = stats.games.slice(-8);
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify({
      best: copy.best,
      daily: copy.daily,
      streak: copy.streak,
      lossStreak: copy.lossStreak,
      games: full,
    }));
  } catch (e) {
    localStorage.setItem(STATS_KEY, JSON.stringify(copy));
  }
};

NG.exportPayload = function (settings, stats) {
  return JSON.stringify({ settings: settings, stats: stats, at: Date.now() });
};
