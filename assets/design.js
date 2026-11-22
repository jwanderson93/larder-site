(function () {
  var q = new URLSearchParams(location.search);
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function asof() {
    var forced = q.get("asof");
    if (forced && /^\d{4}-\d{2}-\d{2}$/.test(forced)) return forced;
    var d = new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }

  var view = document.documentElement.getAttribute("data-view");
  var path = location.pathname;
  document.querySelectorAll(".tabbar a").forEach(function (link) {
    var href = link.getAttribute("href") || "";
    var on = false;
    if (path.indexOf("/cookbook/") !== -1) on = href.indexOf("cookbook") !== -1 || href === "./";
    else if (path.indexOf("/shop/") !== -1) on = href.indexOf("shop") !== -1;
    else if (view === "choose") on = href.indexOf("view=choose") !== -1;
    else if (view === "week") on = href.indexOf("view=week") !== -1;
    if (on) link.setAttribute("aria-current", "page");
  });

  var homeName = document.getElementById("home-name");
  if (homeName) {
    var today = asof();
    var slots = Array.prototype.slice.call(document.querySelectorAll(".slot"));
    var slot = slots.filter(function (item) { return item.getAttribute("data-date") >= today; })[0] || slots[0];
    var dinner = slot && slot.querySelector(".dinner");
    if (dinner) {
      homeName.textContent = dinner.getAttribute("data-short") || homeName.textContent;
      var time = document.getElementById("home-time");
      if (time) time.textContent = (dinner.getAttribute("data-time") || "") + ".";
      var jude = document.getElementById("home-jude");
      var line = dinner.getAttribute("data-jude") || "";
      if (jude) jude.innerHTML = line ? '<span class="jude">Jude:</span> ' + line : "";
      var photo = document.getElementById("home-photo");
      var image = dinner.getAttribute("data-image");
      if (photo) {
        if (image) { photo.hidden = false; photo.src = "../../img/" + image; photo.alt = dinner.getAttribute("data-short") || ""; }
        else photo.hidden = true;
      }
      var go = document.getElementById("home-go");
      var recipe = dinner.getAttribute("data-recipe");
      if (go && recipe) go.setAttribute("href", recipe + "/");
      var when = document.getElementById("home-when");
      if (when) when.textContent = slot.getAttribute("data-date") === today ? "Tonight" : "Next";
    }
  }

  var inline = document.getElementById("nav-inline");
  if (inline) {
    var shown = null;
    document.querySelectorAll(".large-title").forEach(function (node) {
      if (node.getClientRects().length) shown = node;
    });
    if (shown) inline.textContent = shown.textContent;
  }
  function compactTitle() {
    document.documentElement.classList.toggle("is-compact", window.scrollY > 28);
  }
  window.addEventListener("scroll", compactTitle, { passive: true });
  compactTitle();

  var stack = document.getElementById("choose-stack");
  if (stack) {
    var live = document.querySelector(".decide");
    function cards() { return stack.querySelectorAll(".choice-card:not(.is-gone)"); }
    function paint() {
      var all = cards();
      var weekView = false;
      all.forEach(function (card, index) {
        card.hidden = index > 1;
        card.classList.toggle("is-back", index === 1 && !reduce);
        card.style.zIndex = String(8 - index);
        if (index === 0) card.focus({ preventScroll: true });
      });
      if (!all.length && live) live.textContent = "That's the list.";
    }
    function decide(action) {
      var card = cards()[0];
      if (!card) return;
      var name = card.querySelector("h2");
      if (live) live.textContent = (name ? name.textContent : "Dinner") + ". " + (action === "keep" ? "Kept." : "Skipped.");
      card.classList.add("is-gone");
      card.hidden = true;
      paint();
    }
    document.querySelectorAll("[data-choice]").forEach(function (button) {
      button.addEventListener("click", function () { decide(button.getAttribute("data-choice")); });
    });
    var startX = 0;
    stack.addEventListener("pointerdown", function (event) { startX = event.clientX; });
    stack.addEventListener("pointerup", function (event) {
      var dx = event.clientX - startX;
      if (Math.abs(dx) < 40) return;
      decide(dx > 0 ? "keep" : "skip");
    });
    stack.addEventListener("keydown", function (event) {
      if (event.key === "ArrowRight") decide("keep");
      if (event.key === "ArrowLeft") decide("skip");
    });
    paint();
    var frames = parseInt(q.get("frame") || "0", 10);
    if (q.get("demo") === "1") frames = Math.max(frames, 1);
    for (var i = 0; i < frames; i += 1) decide(i % 2 ? "skip" : "keep");
  }

  var list = document.getElementById("dinners");
  if (list) {
    var dragging = null;
    var originY = 0;
    list.querySelectorAll(".dinner").forEach(function (row) {
      if (row.getAttribute("data-movable") !== "true") return;
      row.addEventListener("pointerdown", function (event) {
        if (event.target.closest("button, a, input, summary")) return;
        dragging = row;
        originY = event.clientY;
      });
    });
    document.addEventListener("pointerup", function (event) {
      if (!dragging) return;
      var row = dragging;
      dragging = null;
      var dy = event.clientY - originY;
      if (Math.abs(dy) < 28) return;
      var button = row.querySelector(dy < 0 ? "[data-move='up']" : "[data-move='down']");
      if (button) button.click();
    });
    if (q.get("focus") === "open") {
      list.querySelectorAll(".slot").forEach(function (slot) {
        var row = slot.querySelector(".dinner");
        if (!row || row.getAttribute("data-movable") !== "true") slot.hidden = true;
      });
    }
    var moves = parseInt(q.get("frame") || "0", 10);
    var down = list.querySelector("[data-movable='true'] [data-move='down']");
    for (var step = 0; step < moves && down; step += 1) down.click();
  }

  var turn = document.getElementById("turn-card");
  var back = document.getElementById("back");
  var front = document.getElementById("front");
  function setFlip(on) {
    if (!turn || !back || !front) return;
    turn.setAttribute("aria-pressed", on ? "true" : "false");
    turn.textContent = on ? "Show the photograph" : "Turn the card over";
    back.hidden = !on;
    front.hidden = on;
  }
  if (turn) turn.addEventListener("click", function () { setFlip(turn.getAttribute("aria-pressed") !== "true"); });
  if (document.documentElement.getAttribute("data-flip") === "1") setFlip(true);

  var library = document.getElementById("library");
  if (library) {
    var planNode = document.getElementById("larder-plan");
    var plan = planNode ? JSON.parse(planNode.textContent) : { week: "" };
    var storeKey = "larder-library";
    function loadLib() {
      try { return JSON.parse(localStorage.getItem(storeKey) || "{}"); } catch (e) { return {}; }
    }
    function saveLib(data) { try { localStorage.setItem(storeKey, JSON.stringify(data)); } catch (e) { /* this phone may block storage */ } }
    function tweakKey() { return "larder-tweaks-" + plan.week; }
    function loadTweaks() {
      try { return JSON.parse(localStorage.getItem(tweakKey()) || "null") || { dinners: {} }; }
      catch (e) { return { dinners: {} }; }
    }
    function saveTweaks(state) {
      state.dinners = state.dinners || {};
      localStorage.setItem(tweakKey(), JSON.stringify(state));
    }
    var data = loadLib();
    if (q.get("sample") === "1") {
      var sample = data;
      sample.R12 = { verdict: "make_again", note: "Do the chicken again", pinned: true, times_cooked: 1, last_cooked: "2026-11-22", history: [{ week: plan.week, date: "2026-11-22", verdict: "make_again" }] };
      sample.R14 = { verdict: "fine", note: "", pinned: false, times_cooked: 1, last_cooked: "2026-11-25", history: [{ week: plan.week, date: "2026-11-25", verdict: "fine" }] };
      sample.R16 = { verdict: "dont_offer", note: "", pinned: false, times_cooked: 1, last_cooked: "2026-11-27", history: [{ week: plan.week, date: "2026-11-27", verdict: "dont_offer" }] };
      data = sample;
      saveLib(data);
    }
    var rows = Array.prototype.slice.call(library.querySelectorAll(".recipe-row"));
    var cuisines = {};
    var proteins = {};
    rows.forEach(function (row) {
      cuisines[row.getAttribute("data-cuisine")] = true;
      proteins[row.getAttribute("data-protein")] = true;
    });
    function fill(select, values) {
      if (!select) return;
      Object.keys(values).sort().forEach(function (value) {
        if (!value) return;
        var option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      });
    }
    fill(document.getElementById("filter-cuisine"), cuisines);
    fill(document.getElementById("filter-protein"), proteins);

    function record(id) { return data[id] || { verdict: "", note: "", pinned: false, times_cooked: 0, last_cooked: "", history: [] }; }
    function paintRow(row) {
      var id = row.getAttribute("data-id");
      var item = record(id);
      row.querySelectorAll("[data-rate]").forEach(function (button) {
        button.setAttribute("aria-pressed", item.verdict === button.getAttribute("data-rate") ? "true" : "false");
      });
      var pin = row.querySelector("[data-pin]");
      if (pin) {
        pin.setAttribute("aria-pressed", item.pinned ? "true" : "false");
        pin.textContent = item.pinned ? "Pinned for next week" : "Pin for next week";
      }
      var note = row.querySelector("[data-recipe-note]");
      if (note && document.activeElement !== note) note.value = item.note || "";
      var counts = row.querySelector(".counts");
      if (counts) {
        var bits = [];
        if (item.times_cooked) bits.push("Cooked " + item.times_cooked + (item.times_cooked === 1 ? " time" : " times"));
        if (item.last_cooked) bits.push("last " + item.last_cooked);
        counts.textContent = bits.join(". ");
      }
    }
    function place() {
      var term = (document.getElementById("recipe-search").value || "").toLowerCase();
      var cuisine = document.getElementById("filter-cuisine").value;
      var protein = document.getElementById("filter-protein").value;
      var effort = document.getElementById("filter-effort").value;
      var cost = document.getElementById("filter-cost").value;
      var flags = {};
      document.querySelectorAll("[data-filter][aria-pressed='true']").forEach(function (button) {
        flags[button.getAttribute("data-filter")] = true;
      });
      var sort = document.getElementById("sort-by").value;
      var visible = rows.filter(function (row) {
        if (term && row.getAttribute("data-search").toLowerCase().indexOf(term) === -1) return false;
        if (cuisine && row.getAttribute("data-cuisine") !== cuisine) return false;
        if (protein && row.getAttribute("data-protein") !== protein) return false;
        if (effort && row.getAttribute("data-effort") !== effort) return false;
        if (cost && row.getAttribute("data-cost") !== cost) return false;
        if (flags.quick && row.getAttribute("data-quick") !== "true") return false;
        if (flags.batch && row.getAttribute("data-batch") !== "true") return false;
        if (flags.freezer && row.getAttribute("data-freezer") !== "true") return false;
        if (flags.jude && row.getAttribute("data-jude") !== "true") return false;
        return true;
      });
      var rank = { make_again: 0, fine: 1, dont_offer: 2, "": 3 };
      visible.sort(function (a, b) {
        var left = record(a.getAttribute("data-id"));
        var right = record(b.getAttribute("data-id"));
        if (sort === "times") return (right.times_cooked || 0) - (left.times_cooked || 0);
        if (sort === "last") return (right.last_cooked || "").localeCompare(left.last_cooked || "");
        return (rank[left.verdict || ""] || 3) - (rank[right.verdict || ""] || 3);
      });
      document.querySelectorAll(".group").forEach(function (group) { group.innerHTML = ""; });
      visible.forEach(function (row) {
        var verdict = record(row.getAttribute("data-id")).verdict || "";
        var group = document.querySelector('.group[data-group="' + verdict + '"]');
        if (group) group.appendChild(row);
        paintRow(row);
      });
      rows.forEach(function (row) { if (visible.indexOf(row) === -1) row.hidden = true; else row.hidden = false; });
      var pinned = document.getElementById("pinned-list");
      pinned.innerHTML = "";
      rows.forEach(function (row) {
        var item = record(row.getAttribute("data-id"));
        if (!item.pinned) return;
        var li = document.createElement("li");
        li.textContent = row.getAttribute("data-title");
        pinned.appendChild(li);
      });
      if (!pinned.children.length) pinned.innerHTML = "<li>Nothing pinned.</li>";
    }
    library.addEventListener("click", function (event) {
      var rate = event.target.closest("[data-rate]");
      var pin = event.target.closest("[data-pin]");
      var row = event.target.closest(".recipe-row");
      if (!row) return;
      var id = row.getAttribute("data-id");
      var item = record(id);
      if (rate) {
        item.verdict = rate.getAttribute("data-rate");
        item.history = item.history || [];
        item.history.push({ week: plan.week, date: asof(), verdict: item.verdict });
        if (!item.times_cooked) { item.times_cooked = 1; item.last_cooked = asof(); }
        data[id] = item;
        saveLib(data);
        var tweaks = loadTweaks();
        tweaks.dinners[id] = tweaks.dinners[id] || {};
        tweaks.dinners[id].verdict = item.verdict;
        tweaks.dinners[id].status = "cooked";
        if (item.note) tweaks.dinners[id].note = item.note;
        saveTweaks(tweaks);
      }
      if (pin) {
        item.pinned = !item.pinned;
        data[id] = item;
        saveLib(data);
      }
      place();
    });
    library.addEventListener("change", function (event) {
      var note = event.target.closest("[data-recipe-note]");
      if (!note) return;
      var row = note.closest(".recipe-row");
      var id = row.getAttribute("data-id");
      var item = record(id);
      item.note = note.value;
      data[id] = item;
      saveLib(data);
    });
    document.getElementById("recipe-search").addEventListener("input", place);
    ["filter-cuisine", "filter-protein", "filter-effort", "filter-cost", "sort-by"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", place);
    });
    document.querySelectorAll("[data-filter]").forEach(function (button) {
      button.addEventListener("click", function () {
        var on = button.getAttribute("aria-pressed") === "true";
        button.setAttribute("aria-pressed", on ? "false" : "true");
        place();
      });
    });
    var send = document.getElementById("send-library");
    if (send) {
      send.addEventListener("click", function () {
        var lines = ["LARDER-TWEAKS 1", "week: " + plan.week, "by: lotte"];
        Object.keys(data).forEach(function (id) {
          var item = data[id];
          if (item.verdict) lines.push("rating: " + id + " " + item.verdict + (item.note ? " | " + item.note : ""));
          if (item.pinned) lines.push("pin: " + id);
          if (item.note) lines.push("recipe_note: " + id + " | " + item.note);
        });
        var body = encodeURIComponent(lines.join("\n"));
        window.location.href = "mailto:larder@mail.grokbot.com?subject=" + encodeURIComponent("Larder changes " + plan.week) + "&body=" + body;
      });
    }
    place();
  }

  var ticks = parseInt(q.get("frame") || "0", 10);
  if (ticks && document.querySelector("[data-shop]")) {
    document.querySelectorAll("[data-shop]").forEach(function (box, index) {
      if (index < ticks) {
        box.checked = true;
        box.dispatchEvent(new Event("change"));
        if (box.closest("li")) box.closest("li").classList.add("is-ticked");
      }
    });
  }
})();
