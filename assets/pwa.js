(function () {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol.indexOf("http") !== 0) return;
  var link = document.querySelector('link[rel="manifest"]');
  if (!link) return;
  var root = new URL(".", link.href);
  navigator.serviceWorker.register(new URL("sw.js", root)).catch(function () {});
})();
