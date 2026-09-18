/**
 * 无猜扫雷 · B 档最小云 API（Cloudflare Worker 示例）
 *
 * 绑定：
 *   KV namespace: NG_KV
 *
 * 路由（建议挂在 https://your-worker.example/ 或反代 /api）：
 *   PUT  /v1/backup     Header X-Sync-Key  Body { settings, stats, at }
 *   GET  /v1/backup     Header X-Sync-Key
 *   POST /v1/daily      Body { day, diff, mode, ms, seed, name?, bbbv?, startR?, startC? }
 *   GET  /v1/daily?day=&diff=
 *
 * 部署后把站点 cloud.json 的 apiBase 设为 Worker 根地址（无尾斜杠）。
 * 不做实时对战；密钥由用户自管，服务端只存哈希后的键。
 */

var MAX_BACKUP_BYTES = 200000;
var MAX_DAILY_MS = 24 * 60 * 60 * 1000;
var TOP_N = 30;

function cors(req) {
  var origin = req.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Sync-Key",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data, status, req) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, cors(req)),
  });
}

async function sha256Hex(text) {
  var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(function (b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
}

function validDay(day) {
  return typeof day === "string" && /^\d{4}-\d{1,2}-\d{1,2}/.test(day);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(request) });
    }

    var url = new URL(request.url);
    var path = url.pathname.replace(/\/$/, "") || "/";

    try {
      if (path === "/v1/backup" && request.method === "PUT") {
        return await putBackup(request, env);
      }
      if (path === "/v1/backup" && request.method === "GET") {
        return await getBackup(request, env);
      }
      if (path === "/v1/daily" && request.method === "POST") {
        return await postDaily(request, env);
      }
      if (path === "/v1/daily" && request.method === "GET") {
        return await getDaily(request, env, url);
      }
      return json({ error: "not-found" }, 404, request);
    } catch (e) {
      return json({ error: "server", message: String(e && e.message || e) }, 500, request);
    }
  },
};

async function putBackup(request, env) {
  var key = request.headers.get("X-Sync-Key") || "";
  if (key.length < 8) return json({ error: "sync-key-too-short" }, 400, request);
  var text = await request.text();
  if (text.length > MAX_BACKUP_BYTES) return json({ error: "too-large" }, 413, request);
  var body;
  try { body = JSON.parse(text); } catch (e) { return json({ error: "bad-json" }, 400, request); }
  if (!body || typeof body !== "object") return json({ error: "bad-body" }, 400, request);
  body.at = Number(body.at) || Date.now();
  var id = await sha256Hex("backup:" + key);
  await env.NG_KV.put("backup:" + id, JSON.stringify(body));
  return json({ ok: true, at: body.at }, 200, request);
}

async function getBackup(request, env) {
  var key = request.headers.get("X-Sync-Key") || "";
  if (key.length < 8) return json({ error: "sync-key-too-short" }, 400, request);
  var id = await sha256Hex("backup:" + key);
  var raw = await env.NG_KV.get("backup:" + id);
  if (!raw) return json({ error: "not-found" }, 404, request);
  return json(JSON.parse(raw), 200, request);
}

async function postDaily(request, env) {
  var body = await request.json().catch(function () { return null; });
  if (!body || !validDay(body.day)) return json({ error: "bad-day" }, 400, request);
  var ms = Number(body.ms);
  if (!isFinite(ms) || ms < 200 || ms > MAX_DAILY_MS) return json({ error: "bad-ms" }, 400, request);
  var diff = String(body.diff || "medium").slice(0, 32);
  var mode = String(body.mode || "practice").slice(0, 16);
  var name = String(body.name || "匿名").slice(0, 24);
  var seed = body.seed == null ? "" : String(body.seed).slice(0, 64);
  var entry = {
    name: name,
    ms: Math.round(ms),
    mode: mode,
    seed: seed,
    bbbv: Number(body.bbbv) || 0,
    startR: body.startR,
    startC: body.startC,
    at: Date.now(),
  };
  var listKey = "daily:" + body.day.split("-").slice(0, 3).join("-") + ":" + diff;
  var list = [];
  var raw = await env.NG_KV.get(listKey);
  if (raw) {
    try { list = JSON.parse(raw); } catch (e) { list = []; }
  }
  if (!Array.isArray(list)) list = [];
  // 弱去重：同名+相近用时只留更好
  list = list.filter(function (e) {
    return !(e.name === entry.name && Math.abs(e.ms - entry.ms) < 50);
  });
  list.push(entry);
  list.sort(function (a, b) { return a.ms - b.ms; });
  list = list.slice(0, TOP_N);
  await env.NG_KV.put(listKey, JSON.stringify(list));
  var rank = list.findIndex(function (e) {
    return e.name === entry.name && e.ms === entry.ms && e.at === entry.at;
  }) + 1;
  return json({ ok: true, rank: rank || null, total: list.length }, 200, request);
}

async function getDaily(request, env, url) {
  var day = url.searchParams.get("day") || "";
  var diff = url.searchParams.get("diff") || "medium";
  if (!validDay(day)) return json({ error: "bad-day" }, 400, request);
  var listKey = "daily:" + day.split("-").slice(0, 3).join("-") + ":" + String(diff).slice(0, 32);
  var raw = await env.NG_KV.get(listKey);
  var list = [];
  if (raw) {
    try { list = JSON.parse(raw); } catch (e) { list = []; }
  }
  return json({ day: day, diff: diff, entries: Array.isArray(list) ? list : [] }, 200, request);
}
