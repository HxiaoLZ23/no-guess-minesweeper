var CACHE = "ng-minesweeper-v3";
var FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.json",
  "./icon.svg",
  "./version.json",
  "./cloud.json",
  "./js/util.js",
  "./js/solver.js",
  "./js/generate.js",
  "./js/persist.js",
  "./js/cloud.js",
  "./js/game.js",
];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(FILES); }));
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);
  // 版本与云配置始终走网络，避免被旧缓存挡住更新提示
  if (url.pathname.endsWith("/version.json") || url.pathname.endsWith("/cloud.json")) {
    event.respondWith(fetch(event.request).catch(function () { return caches.match(event.request); }));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(function (hit) {
      return hit || fetch(event.request);
    })
  );
});
