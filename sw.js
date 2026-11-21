const CACHE = 'larder-2026-11-23';
const FILES = ["./", "./index.html", "./w/2026-11-23-k7q2/", "./w/2026-11-23-k7q2/index.html", "./w/2026-11-23-k7q2/sunday/", "./w/2026-11-23-k7q2/sunday/index.html", "./w/2026-11-23-k7q2/shop/", "./w/2026-11-23-k7q2/shop/index.html", "./assets/site.css", "./assets/week.js", "./assets/card.js", "./assets/pwa.js", "./assets/tokens.css", "./manifest.webmanifest", "./img/stockpot.jpg", "./w/2026-11-23-k7q2/R12/", "./w/2026-11-23-k7q2/R12/index.html", "./img/R12_corn-fed-roast-chicken.jpg", "./w/2026-11-23-k7q2/R13/", "./w/2026-11-23-k7q2/R13/index.html", "./img/R13_chicken-shawarma-bowls.jpg", "./w/2026-11-23-k7q2/R14/", "./w/2026-11-23-k7q2/R14/index.html", "./img/R14_harissa-salmon.jpg", "./w/2026-11-23-k7q2/R15/", "./w/2026-11-23-k7q2/R15/index.html", "./img/R15_lamb-carrot-meatballs-tagliatelle.jpg", "./w/2026-11-23-k7q2/R16/", "./w/2026-11-23-k7q2/R16/index.html", "./img/R16_gochujang-pork-shoulder-stew.jpg", "./img/shepherds-pie.jpg", "./img/lasagne-placeholder.jpg"];
self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(FILES).catch(function () { return Promise.resolve(); });
  }));
  self.skipWaiting();
});
self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(function (hit) {
    return hit || fetch(event.request).then(function (response) {
      var copy = response.clone();
      caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
      return response;
    }).catch(function () { return caches.match(event.request); });
  }));
});
