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
  state.picks = state.picks || {};
  state.freezer = state.freezer || {};
  var syncClient = null;

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

  function showSaved(problem) {
    var note = document.getElementById("saved-note");
    if (!note) return;
    if (problem) {
      note.textContent = problem;
      note.setAttribute("data-sync", "waiting");
      return;
    }
    if (syncClient) {
      note.textContent = syncClient.statusText();
      note.setAttribute("data-sync", syncClient.status());
    } else {
      note.textContent = "Saved on this phone.";
      note.removeAttribute("data-sync");
    }
  }

  function save() {
    state.order = currentOrder();
    localStorage.setItem(storeKey, JSON.stringify(state));
    var problem = syncClient ? syncClient.setFields(fieldsFromState()) : null;
    showSaved(problem);
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
        item.classList.toggle("is-cooked", record.status === "cooked");
        var skipWhere = item.querySelector(".skip-where");
        if (skipWhere) skipWhere.hidden = record.status !== "skipped";
        save();
        refreshDraft();
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
    item.querySelectorAll("[data-jude]").forEach(function (button) {
      button.addEventListener("click", function () {
        record.judeLeft = true;
        state.dinners[key] = record;
        button.textContent = "Chosen: he left this";
        save();
        refreshDraft();
      });
    });
    item.querySelectorAll("[data-short]").forEach(function (button) {
      button.addEventListener("click", function () {
        record.short = true;
        state.dinners[key] = record;
        button.textContent = "Chosen: not enough left";
        save();
        refreshDraft();
      });
    });
    item.querySelectorAll("[data-skip-to]").forEach(function (button) {
      button.addEventListener("click", function () {
        record.skipTo = button.getAttribute("data-skip-to");
        record.status = "skipped";
        state.dinners[key] = record;
        save();
        refreshDraft();
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
    var jude = [];
    var shorts = [];
    Object.keys(state.dinners).forEach(function (key) {
      var row = state.dinners[key];
      if (row.judeLeft) jude.push(key);
      if (row.short) shorts.push(key);
      if (row.skipTo) lines.push("skip_to: " + key + " " + row.skipTo);
    });
    if (jude.length) lines.push("jude_left: " + jude.join(", "));
    shorts.forEach(function (key) { lines.push("short: " + key); });
    if (state.late) lines.push("late: after 7pm");
    var shopMissing = localStorage.getItem("larder-missing-lines");
    if (shopMissing) lines.push("missing: " + shopMissing);
    Object.keys(state.picks || {}).forEach(function (id) {
      if (state.picks[id]) lines.push("pick: " + id + " " + state.picks[id]);
    });
    Object.keys(state.freezer || {}).forEach(function (id) {
      var row = state.freezer[id] || {};
      if (row.move) lines.push("freezer: " + id + " move " + row.move);
    });
    if (window.LarderSync && syncClient) {
      var stored = window.LarderSync.readStored(localStorage, plan.week);
      Object.keys(stored).forEach(function (key) {
        var value = stored[key] && stored[key].value;
        if (key.indexOf("tick.") === 0 && value === true) lines.push("tick: " + key.slice(5));
        if (key.indexOf("cookbook.") === 0 && key.slice(-5) === ".note" && value) {
          lines.push("cookbook: " + key.split(".")[1] + " | " + String(value).replace(/\s+/g, " "));
        }
      });
    }
    return lines.join("\n");
  }

  function plainNote(text) {
    var box = document.getElementById("plain-note");
    if (!box) return;
    var lines = [
      syncClient
        ? "Saved on this phone. The other phone catches up when it can. You can still email the note."
        : "Saved on this phone only, until you email it."
    ];
    if (state.late) lines.push("The shop arrived after 7pm, so cooking starts tomorrow.");
    Object.keys(state.dinners).forEach(function (key) {
      var row = state.dinners[key];
      var name = key;
      var card = document.querySelector('[data-key="' + key + '"] h3');
      if (card) name = card.textContent;
      if (row.status) lines.push(name + ": " + row.status + (row.skipTo ? ", " + row.skipTo : ""));
      if (row.verdict) lines.push(name + ": " + row.verdict.replace("make_again", "make again").replace("dont_offer", "don't offer again"));
      if (row.judeLeft) lines.push(name + ": he left this. The dinner stays in the list.");
      if (row.short) lines.push(name + ": not enough left. Use the spare pie. It is not bought again.");
    });
    box.textContent = lines.join(" ");
  }

  var draft = document.getElementById("tweak-draft");
  function refreshDraft() {
    var text = formatTweaks();
    if (draft) draft.value = text;
    plainNote(text);
  }
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

  var upcoming = slots().filter(function (slot) { return slot.getAttribute("data-date") >= today; })[0];
  var tonight = document.getElementById("tonight-body");
  if (upcoming && tonight) {
    var title = upcoming.querySelector("h3");
    var jude = upcoming.querySelector(".jude-line");
    tonight.textContent = "";
    var heading = document.createElement("h3");
    heading.textContent = title ? title.textContent : "Dinner";
    tonight.appendChild(heading);
    if (jude) tonight.appendChild(jude.cloneNode(true));
    var jump = document.createElement("a");
    jump.href = "#" + upcoming.querySelector(".dinner").id;
    jump.textContent = "Open this dinner";
    tonight.appendChild(jump);
  }
  var finished = document.getElementById("week-finished");
  if (finished && slots().length && slots().every(function (slot) { return slot.getAttribute("data-date") < today; })) {
    finished.hidden = false;
  }
  try { localStorage.setItem("larder-last-week", location.pathname); } catch (e) {}

  var late = document.getElementById("arrived-late");
  if (late) {
    late.addEventListener("click", function () {
      state.late = true;
      var bumped = addDays(plan.delivery.window.date, 1);
      if (bumped > start) start = bumped;
      lockSlots();
      late.textContent = "Chosen: arrived after 7pm";
      save();
      refreshDraft();
      if (banner) banner.textContent = "The shop arrived after 7pm. Cook dates start " + pretty(start) + ".";
    });
  }

  function fieldsFromState() {
    var out = {};
    if (state.order && state.order.length) out.order = state.order.slice();
    if (state.by === "joe" || state.by === "lotte") out.by = state.by;
    if (state.missing) out.missing = String(state.missing).replace(/\s+/g, " ").trim();
    if (state.late) out.late = "after 7pm";
    Object.keys(state.dinners || {}).forEach(function (key) {
      var row = state.dinners[key] || {};
      if (row.status === "cooked" || row.status === "skipped") out["dinner." + key + ".status"] = row.status;
      if (row.verdict) out["dinner." + key + ".verdict"] = row.verdict;
      if (row.note) out["dinner." + key + ".note"] = String(row.note).replace(/\s+/g, " ").trim();
      if (row.judeLeft) out["dinner." + key + ".jude_left"] = true;
      if (row.short) out["dinner." + key + ".short"] = true;
      if (row.skipTo === "freezer" || row.skipTo === "tomorrow" || row.skipTo === "leave") {
        out["dinner." + key + ".skip_to"] = row.skipTo;
      }
    });
    Object.keys(state.picks || {}).forEach(function (id) {
      if (state.picks[id]) out["pick." + id] = state.picks[id];
    });
    Object.keys(state.freezer || {}).forEach(function (id) {
      var row = state.freezer[id] || {};
      if (row.move) out["freezer." + id + ".move"] = row.move;
    });
    return out;
  }

  function applyRemote(fields) {
    if (!fields) return;
    if (fields.order && Array.isArray(fields.order.value)) state.order = fields.order.value.slice();
    if (fields.by && (fields.by.value === "joe" || fields.by.value === "lotte")) state.by = fields.by.value;
    if (fields.missing) state.missing = fields.missing.value || "";
    if (fields.late && fields.late.value === "after 7pm") state.late = true;
    Object.keys(fields).forEach(function (key) {
      var value = fields[key].value;
      var parts = key.split(".");
      if (parts[0] === "dinner" && parts.length === 3) {
        var row = state.dinners[parts[1]] || {};
        if (parts[2] === "status") row.status = value;
        if (parts[2] === "verdict") row.verdict = value;
        if (parts[2] === "note") row.note = value;
        if (parts[2] === "jude_left") row.judeLeft = !!value;
        if (parts[2] === "short") row.short = !!value;
        if (parts[2] === "skip_to") row.skipTo = value;
        state.dinners[parts[1]] = row;
      }
      if (parts[0] === "pick" && parts.length === 2) state.picks[parts[1]] = value;
      if (parts[0] === "freezer" && parts.length === 3 && parts[2] === "move") {
        state.freezer[parts[1]] = state.freezer[parts[1]] || {};
        state.freezer[parts[1]].move = value;
      }
    });
    localStorage.setItem(storeKey, JSON.stringify(state));
  }

  function paintRemote() {
    if (state.order) applyOrder(state.order);
    slots().forEach(function (slot) {
      var item = card(slot);
      if (!item) return;
      var record = state.dinners[item.getAttribute("data-key")] || {};
      item.classList.toggle("is-cooked", record.status === "cooked");
      var skipWhere = item.querySelector(".skip-where");
      if (skipWhere) skipWhere.hidden = record.status !== "skipped";
      item.querySelectorAll("[data-status]").forEach(function (button) {
        button.setAttribute("aria-pressed", record.status === button.getAttribute("data-status") ? "true" : "false");
      });
      item.querySelectorAll("[data-verdict]").forEach(function (button) {
        button.setAttribute("aria-pressed", record.verdict === button.getAttribute("data-verdict") ? "true" : "false");
      });
      var note = item.querySelector("[data-note]");
      if (note && document.activeElement !== note) note.value = record.note || "";
      if (record.judeLeft) {
        item.querySelectorAll("[data-jude]").forEach(function (button) { button.textContent = "Chosen: he left this"; });
      }
      if (record.short) {
        item.querySelectorAll("[data-short]").forEach(function (button) { button.textContent = "Chosen: not enough left"; });
      }
    });
    if (missing && document.activeElement !== missing) missing.value = state.missing || "";
    document.querySelectorAll("[data-by]").forEach(function (button) {
      button.setAttribute("aria-pressed", state.by === button.getAttribute("data-by") ? "true" : "false");
    });
    document.querySelectorAll("[data-choice]").forEach(function (article) {
      var picked = state.picks[article.getAttribute("data-choice")];
      article.querySelectorAll("[data-pick]").forEach(function (button) {
        button.setAttribute("aria-pressed", button.getAttribute("data-pick") === picked ? "true" : "false");
      });
    });
    document.querySelectorAll("[data-freezer]").forEach(function (row) {
      var move = (state.freezer[row.getAttribute("data-freezer")] || {}).move;
      row.querySelectorAll("[data-freeze]").forEach(function (button) {
        button.setAttribute("aria-pressed", button.getAttribute("data-freeze") === move ? "true" : "false");
      });
    });
    if (state.late && late) late.textContent = "Chosen: arrived after 7pm";
  }

  function choose(article, value) {
    state.picks[article.getAttribute("data-choice")] = value;
    article.querySelectorAll("[data-pick]").forEach(function (button) {
      button.setAttribute("aria-pressed", button.getAttribute("data-pick") === value ? "true" : "false");
    });
    save();
    refreshDraft();
  }

  document.querySelectorAll("[data-choice]").forEach(function (article) {
    article.querySelectorAll("[data-pick]").forEach(function (button) {
      button.addEventListener("click", function () { choose(article, button.getAttribute("data-pick")); });
    });
    var startX = null;
    article.addEventListener("touchstart", function (event) {
      startX = event.changedTouches[0].clientX;
    }, { passive: true });
    article.addEventListener("touchend", function (event) {
      if (startX === null) return;
      var dx = event.changedTouches[0].clientX - startX;
      startX = null;
      if (dx > 72) choose(article, "chosen");
      else if (dx < -72) choose(article, "passed");
    });
  });

  document.querySelectorAll("[data-freezer]").forEach(function (row) {
    row.querySelectorAll("[data-freeze]").forEach(function (button) {
      button.addEventListener("click", function () {
        var id = row.getAttribute("data-freezer");
        state.freezer[id] = state.freezer[id] || {};
        state.freezer[id].move = button.getAttribute("data-freeze");
        row.querySelectorAll("[data-freeze]").forEach(function (other) {
          other.setAttribute("aria-pressed", other === button ? "true" : "false");
        });
        save();
        refreshDraft();
      });
    });
  });

  var syncNode = document.getElementById("larder-sync");
  if (syncNode && window.LarderSync) {
    var syncConfig = JSON.parse(syncNode.textContent);
    syncClient = window.LarderSync.createClient({
      baseUrl: syncConfig.base_url,
      householdKey: syncConfig.household_key,
      week: syncConfig.week,
      storage: localStorage,
      onUpdate: function () {
        applyRemote(syncClient.fields());
        paintRemote();
        refreshDraft();
        showSaved();
      }
    });
    syncClient.start(fieldsFromState());
  }
})();
