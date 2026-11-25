/* Larder offline copy. Build 6ea3bb562f75. Pages: network first, so a deploy shows at once. */
const CACHE = 'larder-6ea3bb562f75';
const FILES = ["./", "./index.html", "./offline.html", "./manifest.webmanifest", "./assets/larder.css", "./assets/larder.js", "./assets/pwa.js", "./assets/fonts.css", "./assets/fonts/archivo.woff2", "./assets/fonts/source-sans-3.woff2", "./img/stockpot.jpg", "./assets/sync.js", "./w/2026-11-23-k7q2/R12/", "./w/2026-11-23-k7q2/R13/", "./w/2026-11-23-k7q2/R14/", "./w/2026-11-23-k7q2/R15/", "./w/2026-11-23-k7q2/R16/", "./w/2026-11-23-k7q2/cookbook/", "./w/2026-11-23-k7q2/", "./w/2026-11-23-k7q2/menu/", "./w/2026-11-23-k7q2/shop/", "./w/2026-11-23-k7q2/sunday/", "./img/R12_corn-fed-roast-chicken.jpg", "./img/shepherds-pie.jpg", "./img/R13_chicken-shawarma-bowls.jpg", "./img/R14_harissa-salmon.jpg", "./img/R15_lamb-carrot-meatballs-tagliatelle.jpg", "./img/R16_gochujang-pork-shoulder-stew.jpg"];
const SYNC_ORIGIN = "https://larder-sync.andersonjosephwilliam.workers.dev";
self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return Promise.all(FILES.map(function (url) { return cache.add(url).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) { return key.indexOf('larder-') === 0 && key !== CACHE; })
      .map(function (key) { return caches.delete(key); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  if (SYNC_ORIGIN && request.url.indexOf(SYNC_ORIGIN) === 0) return;
  if (new URL(request.url).origin !== self.location.origin) return;
  var page = request.mode === 'navigate' || (request.headers.get('accept') || '').indexOf('text/html') !== -1;
  if (page) {
    event.respondWith(fetch(request).then(function (response) {
      var copy = response.clone();
      caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
      return response;
    }).catch(function () {
      return caches.match(request, { ignoreSearch: true }).then(function (hit) {
        return hit || caches.match('./offline.html');
      });
    }));
    return;
  }
  event.respondWith(caches.match(request).then(function (hit) {
    var network = fetch(request).then(function (response) {
      var copy = response.clone();
      caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
      return response;
    });
    return hit || network;
  }));
});
