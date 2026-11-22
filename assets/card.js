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
      if (syncClient) {
        var problem = syncClient.setField("tick.card." + recipe + "." + id, box.checked);
        showCookbook(problem);
      }
    });
  });

  var steps = Array.prototype.slice.call(document.querySelectorAll("#method > li"));
  steps.forEach(function (step) { step.classList.add("step"); });
  var cursor = 0;
  var count = document.getElementById("step-count");
  var live = document.getElementById("timer-live");
  function show(index) {
    cursor = Math.max(0, Math.min(index, steps.length - 1));
    var cooking = document.body.classList.contains("cooking");
    steps.forEach(function (step, i) {
      step.classList.toggle("current", i === cursor);
      if (cooking) step.hidden = i !== cursor;
      else step.hidden = false;
    });
    if (count) count.textContent = steps.length ? "Step " + (cursor + 1) + " of " + steps.length : "";
  }
  var cook = document.getElementById("cook-mode");
  var wake = null;
  if (cook && steps.length) {
    cook.addEventListener("click", function () {
      var on = document.body.classList.toggle("cooking");
      cook.textContent = on ? "Show every step" : "Show one step at a time";
      show(cursor);
      if (on && navigator.wakeLock) {
        navigator.wakeLock.request("screen").then(function (lock) { wake = lock; }).catch(function () {});
      } else if (wake) {
        wake.release();
        wake = null;
      }
    });
    var bar = document.createElement("p");
    bar.className = "cookbar no-print";
    var prev = document.createElement("button");
    prev.type = "button";
    prev.textContent = "Previous step";
    var next = document.createElement("button");
    next.type = "button";
    next.textContent = "Next step";
    prev.addEventListener("click", function () { show(cursor - 1); });
    next.addEventListener("click", function () { show(cursor + 1); });
    bar.appendChild(prev);
    bar.appendChild(next);
    document.body.appendChild(bar);
  }
  window.addEventListener("beforeprint", function () {
    steps.forEach(function (step) { step.hidden = false; });
  });

  var one = document.getElementById("one-adult");
  var oneNote = document.getElementById("one-adult-note");
  if (one) {
    one.addEventListener("click", function () {
      var on = document.body.classList.toggle("one-adult");
      one.setAttribute("aria-pressed", on ? "true" : "false");
      one.textContent = on ? "Chosen: just one of us" : "Just one of us tonight";
      if (oneNote) oneNote.hidden = !on;
    });
  }

  function beep() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = ctx.createOscillator();
      osc.frequency.value = 880;
      osc.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch (e) { /* a silent phone still shows the words */ }
  }

  document.querySelectorAll("[data-timer]").forEach(function (button) {
    button.addEventListener("click", function () {
      var seconds = parseInt(button.getAttribute("data-timer"), 10) * 60;
      var stepText = (button.parentElement && button.parentElement.innerText || "").split("\n")[0].slice(0, 80);
      if (button._timer) window.clearInterval(button._timer);
      function paint() {
        var m = Math.floor(seconds / 60);
        var s = seconds % 60;
        button.textContent = (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
      }
      paint();
      button._timer = window.setInterval(function () {
        seconds -= 1;
        if (seconds <= 0) {
          window.clearInterval(button._timer);
          button._timer = null;
          button.textContent = "Timer finished";
          if (live) live.textContent = "Timer finished. " + stepText;
          beep();
          return;
        }
        paint();
      }, 1000);
    });
  });

  var syncClient = null;
  var cookbook = document.getElementById("cookbook-note");
  var savedNote = document.getElementById("saved-note");
  function showCookbook(problem) {
    if (!savedNote) return;
    if (problem) {
      savedNote.textContent = problem;
      savedNote.setAttribute("data-sync", "waiting");
      return;
    }
    if (!syncClient) return;
    savedNote.textContent = syncClient.statusText();
    savedNote.setAttribute("data-sync", syncClient.status());
  }
  var syncNode = document.getElementById("larder-sync");
  if (syncNode && window.LarderSync) {
    var cfg = JSON.parse(syncNode.textContent);
    syncClient = window.LarderSync.createClient({
      baseUrl: cfg.base_url,
      householdKey: cfg.household_key,
      week: cfg.week,
      storage: localStorage,
      onUpdate: function () {
        var field = syncClient.fields()["cookbook." + recipe + ".note"];
        if (cookbook && document.activeElement !== cookbook && field) cookbook.value = field.value || "";
        document.querySelectorAll("input[type=checkbox][data-tick]").forEach(function (box) {
          var remote = (syncClient.fields()["tick.card." + recipe + "." + box.getAttribute("data-tick")] || {}).value;
          if (remote === true || remote === false) box.checked = remote;
        });
        showCookbook();
      }
    });
    var seed = {};
    try {
      var remembered = localStorage.getItem("larder-cookbook-" + recipe);
      if (remembered) seed["cookbook." + recipe + ".note"] = remembered;
    } catch (e) { /* the phone can still cook */ }
    syncClient.start(seed);
  }
  if (cookbook) {
    try {
      var storedNote = localStorage.getItem("larder-cookbook-" + recipe);
      if (storedNote) cookbook.value = storedNote;
    } catch (e) { /* leave the box blank */ }
    cookbook.addEventListener("change", function () {
      var text = cookbook.value.replace(/\s+/g, " ").trim();
      try { localStorage.setItem("larder-cookbook-" + recipe, text); } catch (e) { /* still shown on screen */ }
      if (syncClient) showCookbook(syncClient.setField("cookbook." + recipe + ".note", text));
    });
  }
})();
