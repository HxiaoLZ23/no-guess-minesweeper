var CACHE = "ng-minesweeper-v15";
var FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.json",
  "./icon.svg",
  "./version.json",
  "./cloud.json",
  "./assets/flag.svg",
  "./assets/mine.svg",
  "./assets/spark.svg",
  "./assets/boom.svg",
  "./js/i18n.js",
  "./js/i18n-packs.js",
  "./js/i18n-hant.js",
  "./js/i18n-cjk.js",
  "./js/i18n-west.js",
  "./js/i18n-de-pt.js",
  "./js/i18n-ru-ar.js",
  "./js/util.js",
  "./js/solver.js",
  "./js/generate.js",
  "./js/persist.js",
  "./js/campaign.js",
  "./js/cloud.js",
  "./js/ambiance.js",
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
