(function () {
  var node = document.getElementById("larder-plan");
  if (!node) return;
  var plan = JSON.parse(node.textContent);
  var storeKey = "larder-tweaks-" + plan.week;
  var state = { by: "", dinners: {}, missing: "", order: null };
  try {
    var saved = JSON.parse(localStorage.getItem(storeKey) || "null");
    if (saved) state = saved;
  } catch (e) { /* keep the blank state */ }
  state.dinners = state.dinners || {};

  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function addDays(iso, n) {
    var p = iso.split("-");
    var dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
  }
  function earliest(delivery, today) {
    var start = delivery.window.date;
    if (delivery.arrived_at) {
      var parts = String(delivery.arrived_at).replace(" ", "T").split("T");
      start = parts[0];
      var hour = parseInt((parts[1] || "12:00").slice(0, 2), 10);
      if (hour >= 19) start = addDays(start, 1);
    }
    if (start < today) start = today;
    return start;
  }

  function pretty(iso) {
    var parts = iso.split("-");
    var dt = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
    var days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return days[dt.getUTCDay()] + " " + dt.getUTCDate() + " " + months[dt.getUTCMonth()];
  }

  var today = todayISO();
  var start = earliest(plan.delivery, today);
  var banner = document.getElementById("cook-from");
  if (banner) {
    banner.textContent = "Cook dates start " + pretty(start) + ". Days before that stay put, including anything already past.";
  }

  var list = document.getElementById("dinners");
  function slots() { return Array.prototype.slice.call(list.querySelectorAll(".slot")); }
  function card(slot) { return slot.querySelector(".dinner"); }
  function movableSlots() {
    return slots().filter(function (slot) {
      return card(slot) && card(slot).getAttribute("data-movable") === "true" && slot.getAttribute("data-locked") !== "true";
    });
  }

  function lockSlots() {
    slots().forEach(function (slot) {
      var locked = slot.getAttribute("data-date") < start;
      slot.setAttribute("data-locked", locked ? "true" : "false");
      slot.classList.toggle("locked", locked);
    });
  }

  function applyOrder(order) {
    if (!order || !order.length) return;
    var pool = {};
    movableSlots().forEach(function (slot) {
      var item = card(slot);
      pool[item.getAttribute("data-key")] = item;
    });
    var keys = order.filter(function (key) { return pool[key]; });
    movableSlots().forEach(function (slot, index) {
      if (keys[index] && pool[keys[index]]) slot.appendChild(pool[keys[index]]);
    });
  }

  function currentOrder() {
    return movableSlots().map(function (slot) { return card(slot).getAttribute("data-key"); });
  }

  function save() {
    state.order = currentOrder();
    localStorage.setItem(storeKey, JSON.stringify(state));
    var note = document.getElementById("saved-note");
    if (note) note.textContent = "Saved on this phone.";
  }

  function swap(slot, direction) {
    var open = movableSlots();
    var index = open.indexOf(slot);
    var next = open[index + direction];
    if (!next) return;
    var a = card(slot);
    var b = card(next);
    slot.appendChild(b);
    next.appendChild(a);
    save();
  }

  lockSlots();
  applyOrder(state.order);

  slots().forEach(function (slot) {
    var item = card(slot);
    if (!item) return;
    var key = item.getAttribute("data-key");
    var record = state.dinners[key] || {};
    item.querySelectorAll("[data-status]").forEach(function (button) {
      button.setAttribute("aria-pressed", record.status === button.getAttribute("data-status") ? "true" : "false");
      button.addEventListener("click", function () {
        record.status = button.getAttribute("data-status");
        state.dinners[key] = record;
        item.querySelectorAll("[data-status]").forEach(function (other) {
          other.setAttribute("aria-pressed", other === button ? "true" : "false");
        });
        save();
      });
    });
    item.querySelectorAll("[data-verdict]").forEach(function (button) {
      button.setAttribute("aria-pressed", record.verdict === button.getAttribute("data-verdict") ? "true" : "false");
      button.addEventListener("click", function () {
        record.verdict = button.getAttribute("data-verdict");
        record.status = record.status || "cooked";
        state.dinners[key] = record;
        item.querySelectorAll("[data-verdict]").forEach(function (other) {
          other.setAttribute("aria-pressed", other === button ? "true" : "false");
        });
        item.querySelectorAll("[data-status]").forEach(function (other) {
          other.setAttribute("aria-pressed", other.getAttribute("data-status") === "cooked" ? "true" : "false");
        });
        save();
      });
    });
    var note = item.querySelector("[data-note]");
    if (note) {
      note.value = record.note || "";
      note.addEventListener("change", function () {
        record.note = note.value;
        state.dinners[key] = record;
        save();
      });
    }
    var up = item.querySelector("[data-move='up']");
    var down = item.querySelector("[data-move='down']");
    if (up) up.addEventListener("click", function () { swap(slot, -1); });
    if (down) down.addEventListener("click", function () { swap(slot, 1); });
  });

  var missing = document.getElementById("missing");
  if (missing) {
    missing.value = state.missing || "";
    missing.addEventListener("change", function () { state.missing = missing.value; save(); });
  }

  document.querySelectorAll("[data-by]").forEach(function (button) {
    button.setAttribute("aria-pressed", state.by === button.getAttribute("data-by") ? "true" : "false");
    button.addEventListener("click", function () {
      state.by = button.getAttribute("data-by");
      document.querySelectorAll("[data-by]").forEach(function (other) {
        other.setAttribute("aria-pressed", other === button ? "true" : "false");
      });
      save();
    });
  });

  function formatTweaks() {
    var lines = ["LARDER-TWEAKS 1", "week: " + plan.week];
    if (state.by) lines.push("by: " + state.by);
    lines.push("reorder: " + currentOrder().join(", "));
    var cooked = [];
    var skipped = [];
    Object.keys(state.dinners).forEach(function (key) {
      var row = state.dinners[key];
      if (row.status === "cooked") cooked.push(key);
      if (row.status === "skipped") skipped.push(key);
      if (row.verdict) {
        var extra = row.note ? " | " + String(row.note).replace(/\s+/g, " ") : "";
        lines.push("rating: " + key + " " + row.verdict + extra);
      }
    });
    if (cooked.length) lines.push("cooked: " + cooked.join(", "));
    if (skipped.length) lines.push("skipped: " + skipped.join(", "));
    if (state.missing) lines.push("missing: " + String(state.missing).replace(/\s+/g, " "));
    return lines.join("\n");
  }

  var draft = document.getElementById("tweak-draft");
  function refreshDraft() { if (draft) draft.value = formatTweaks(); }
  refreshDraft();
  list.addEventListener("click", function () { window.setTimeout(refreshDraft, 0); });
  list.addEventListener("change", refreshDraft);
  if (missing) missing.addEventListener("input", refreshDraft);

  var send = document.getElementById("send-changes");
  if (send) {
    send.addEventListener("click", function () {
      var body = encodeURIComponent(formatTweaks());
      var subject = encodeURIComponent("Larder changes " + plan.week);
      window.location.href = "mailto:larder@mail.grokbot.com?subject=" + subject + "&body=" + body;
    });
  }
  var copy = document.getElementById("copy-changes");
  if (copy) {
    copy.addEventListener("click", function () {
      var text = formatTweaks();
      if (draft) draft.value = text;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      } else if (draft) {
        draft.focus();
        draft.select();
      }
      copy.textContent = "Copied";
    });
  }

  var suggest = document.getElementById("suggest-order");
  if (suggest) {
    suggest.addEventListener("click", function () {
      var open = movableSlots();
      var items = open.map(card).sort(function (a, b) {
        return (+a.getAttribute("data-use-by") || 99) - (+b.getAttribute("data-use-by") || 99);
      });
      open.forEach(function (slot, index) { if (items[index]) slot.appendChild(items[index]); });
      save();
      refreshDraft();
    });
  }

  slots().forEach(function (slot) {
    if (slot.getAttribute("data-date") === today) {
      var title = slot.querySelector("h3");
      if (title && title.textContent.indexOf("Tonight") !== 0) {
        title.textContent = "Tonight. " + title.textContent;
      }
    }
  });

  var still = document.getElementById("still-ahead");
  if (still) {
    var count = slots().filter(function (slot) { return slot.getAttribute("data-date") >= today; }).length;
    still.textContent = count + " still to come from today.";
  }
})();
