(function () {
  var recipe = document.body.getAttribute("data-recipe");
  if (!recipe) return;
  var store = "larder-ticks-" + recipe;
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(store) || "{}"); } catch (e) { saved = {}; }

  document.querySelectorAll("input[type=checkbox][data-tick]").forEach(function (box) {
    var id = box.getAttribute("data-tick");
    box.checked = !!saved[id];
    box.addEventListener("change", function () {
      saved[id] = box.checked;
      localStorage.setItem(store, JSON.stringify(saved));
    });
  });

  var steps = Array.prototype.slice.call(document.querySelectorAll("#method > li"));
  steps.forEach(function (step) { step.classList.add("step"); });
  var cursor = 0;
  function show(index) {
    cursor = index;
    steps.forEach(function (step, i) { step.classList.toggle("current", i === index); });
  }
  var cook = document.getElementById("cook-mode");
  if (cook && steps.length) {
    cook.addEventListener("click", function () {
      var on = document.body.classList.toggle("cooking");
      cook.textContent = on ? "Show every step" : "Cook";
      show(cursor);
    });
    var bar = document.createElement("p");
    bar.className = "actions no-print";
    var prev = document.createElement("button");
    prev.type = "button";
    prev.textContent = "Previous step";
    var next = document.createElement("button");
    next.type = "button";
    next.textContent = "Next step";
    prev.addEventListener("click", function () { if (cursor > 0) show(cursor - 1); });
    next.addEventListener("click", function () { if (cursor < steps.length - 1) show(cursor + 1); });
    bar.appendChild(prev);
    bar.appendChild(next);
    document.getElementById("method").insertAdjacentElement("beforebegin", bar);
  }

  var running = null;
  document.querySelectorAll("[data-timer]").forEach(function (button) {
    button.addEventListener("click", function () {
      var seconds = parseInt(button.getAttribute("data-timer"), 10) * 60;
      if (running) window.clearInterval(running);
      var label = button.getAttribute("data-label");
      function paint() {
        var m = Math.floor(seconds / 60);
        var s = seconds % 60;
        button.textContent = (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
      }
      paint();
      running = window.setInterval(function () {
        seconds -= 1;
        if (seconds <= 0) {
          window.clearInterval(running);
          running = null;
          button.textContent = "Done";
          return;
        }
        paint();
      }, 1000);
      button.setAttribute("data-label", label);
    });
  });
})();
