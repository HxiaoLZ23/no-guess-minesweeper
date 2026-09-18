/* global NG */
var NG = window.NG || {};

/**
 * B 档在线增强客户端：版本提示、云备份、每日榜。
 * 无 apiBase / 请求失败时全部静默降级，不影响本地游玩。
 */
NG.CLOUD_CFG_URL = "cloud.json";
NG.VERSION_URL = "version.json";
NG.APP_BUILD = 14;

NG.defaultCloudSettings = function () {
  return {
    apiBase: "",
    syncKey: "",
    displayName: "",
    autoBackup: false,
    skipVersion: "",
  };
};

NG.mergeCloudSettings = function (settings) {
  var c = NG.defaultCloudSettings();
  if (!settings.cloud) settings.cloud = {};
  for (var k in c) if (settings.cloud[k] === undefined) settings.cloud[k] = c[k];
  return settings;
};

NG.loadCloudConfig = function () {
  return fetch(NG.CLOUD_CFG_URL + "?t=" + Date.now(), { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (cfg) {
      NG.cloudFile = cfg || {};
      return NG.cloudFile;
    })
    .catch(function () {
      NG.cloudFile = {};
      return NG.cloudFile;
    });
};

NG.apiBase = function (settings) {
  var fromSet = settings && settings.cloud && settings.cloud.apiBase;
  if (fromSet) return String(fromSet).replace(/\/$/, "");
  if (NG.cloudFile && NG.cloudFile.apiBase) return String(NG.cloudFile.apiBase).replace(/\/$/, "");
  return "";
};

NG.cloudAvailable = function (settings) {
  return !!NG.apiBase(settings);
};

function cloudHeaders(settings, json) {
  var h = {};
  if (json) h["Content-Type"] = "application/json";
  var key = settings && settings.cloud && settings.cloud.syncKey;
  if (key) h["X-Sync-Key"] = key;
  return h;
}

function cloudFetch(settings, path, opts) {
  var base = NG.apiBase(settings);
  if (!base) return Promise.reject(new Error("no-api"));
  opts = opts || {};
  return fetch(base + path, {
    method: opts.method || "GET",
    headers: cloudHeaders(settings, !!opts.body),
    body: opts.body || undefined,
    cache: "no-store",
  }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (data) {
      if (!r.ok) {
        var err = new Error((data && data.error) || ("http-" + r.status));
        err.status = r.status;
        err.data = data;
        throw err;
      }
      return data;
    });
  });
}

NG.checkVersion = function (settings) {
  if (location.protocol === "file:") {
    return Promise.resolve({ skipped: true, reason: "file" });
  }
  return fetch(NG.VERSION_URL + "?t=" + Date.now(), { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (remote) {
      if (!remote || remote.build == null) return { skipped: true };
      var local = NG.APP_BUILD;
      var newer = Number(remote.build) > Number(local);
      var skipped = settings && settings.cloud && settings.cloud.skipVersion === String(remote.version);
      return {
        newer: newer && !skipped,
        localBuild: local,
        remote: remote,
      };
    })
    .catch(function () { return { skipped: true, reason: "offline" }; });
};

NG.pushBackup = function (settings, stats) {
  var payload = {
    settings: settings,
    stats: stats,
    at: Date.now(),
  };
  return cloudFetch(settings, "/v1/backup", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
};

NG.pullBackup = function (settings) {
  return cloudFetch(settings, "/v1/backup");
};

NG.submitDaily = function (settings, entry) {
  return cloudFetch(settings, "/v1/daily", {
    method: "POST",
    body: JSON.stringify(entry),
  });
};

NG.fetchDailyBoard = function (settings, day, diff) {
  var q = "?day=" + encodeURIComponent(day) + "&diff=" + encodeURIComponent(diff || "medium");
  return cloudFetch(settings, "/v1/daily" + q);
};

NG.mergeBackupConflict = function (localPayload, remotePayload, choice) {
  if (choice === "local") return localPayload;
  if (choice === "remote") return remotePayload;
  var la = (localPayload && localPayload.at) || 0;
  var ra = (remotePayload && remotePayload.at) || 0;
  return ra >= la ? remotePayload : localPayload;
};

/** 无 Worker 时用 localStorage 模拟云 API，便于自测。 */
NG.installMockCloud = function () {
  if (NG._mockCloud) return;
  NG._mockCloud = true;
  NG.cloudFile = NG.cloudFile || {};
  NG.cloudFile.apiBase = "mock://local";
  var store = {
    backup: function (key) { return "ng-mock-backup:" + key; },
    daily: function (day, diff) { return "ng-mock-daily:" + day + ":" + diff; },
  };
  NG.apiBase = function () { return "mock://local"; };
  NG.cloudAvailable = function () { return true; };

  function mockFetch(settings, path, opts) {
    opts = opts || {};
    var key = (settings && settings.cloud && settings.cloud.syncKey) || "";
    return Promise.resolve().then(function () {
      if (path === "/v1/backup" && (opts.method || "GET") === "PUT") {
        if (key.length < 8) throw Object.assign(new Error("sync-key-too-short"), { status: 400 });
        var body = JSON.parse(opts.body);
        body.at = body.at || Date.now();
        localStorage.setItem(store.backup(key), JSON.stringify(body));
        return { ok: true, at: body.at };
      }
      if (path === "/v1/backup") {
        if (key.length < 8) throw Object.assign(new Error("sync-key-too-short"), { status: 400 });
        var raw = localStorage.getItem(store.backup(key));
        if (!raw) throw Object.assign(new Error("not-found"), { status: 404 });
        return JSON.parse(raw);
      }
      if (path.indexOf("/v1/daily") === 0 && opts.method === "POST") {
        var entry = JSON.parse(opts.body);
        var listKey = store.daily(entry.day, entry.diff);
        var list = [];
        try { list = JSON.parse(localStorage.getItem(listKey) || "[]"); } catch (e) { list = []; }
        list.push({
          name: entry.name || "匿名",
          ms: entry.ms,
          mode: entry.mode || "practice",
          seed: entry.seed,
          bbbv: entry.bbbv || 0,
          at: Date.now(),
        });
        list.sort(function (a, b) { return a.ms - b.ms; });
        list = list.slice(0, 30);
        localStorage.setItem(listKey, JSON.stringify(list));
        return { ok: true, rank: list.findIndex(function (e) { return e.ms === entry.ms; }) + 1, total: list.length };
      }
      if (path.indexOf("/v1/daily") === 0) {
        var q = path.split("?")[1] || "";
        var params = {};
        q.split("&").forEach(function (p) {
          var kv = p.split("=");
          params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || "");
        });
        var rows = [];
        try { rows = JSON.parse(localStorage.getItem(store.daily(params.day, params.diff)) || "[]"); } catch (e) { rows = []; }
        return { day: params.day, diff: params.diff, entries: rows };
      }
      throw Object.assign(new Error("not-found"), { status: 404 });
    });
  }

  // 覆盖内部 fetch：通过重写 push/pull/submit/fetch 包装
  NG.pushBackup = function (settings, stats) {
    return mockFetch(settings, "/v1/backup", {
      method: "PUT",
      body: JSON.stringify({ settings: settings, stats: stats, at: Date.now() }),
    });
  };
  NG.pullBackup = function (settings) {
    return mockFetch(settings, "/v1/backup");
  };
  NG.submitDaily = function (settings, entry) {
    return mockFetch(settings, "/v1/daily", { method: "POST", body: JSON.stringify(entry) });
  };
  NG.fetchDailyBoard = function (settings, day, diff) {
    return mockFetch(settings, "/v1/daily?day=" + encodeURIComponent(day) + "&diff=" + encodeURIComponent(diff || "medium"));
  };
};
