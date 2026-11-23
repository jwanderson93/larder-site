/* Larder on the phone. One script for every page.
   State lives in three places, and the page always says which:
   1. this phone (localStorage), straight away;
   2. the other phone, through the household sync store, when this phone has the door key;
   3. the repo, only when Larder applies a sync pull or an emailed note.
   The door key is never in a page. It arrives once in the link from Larder's email
   (#k=…), is kept on this phone, and is removed from the address bar at once.
   Storage keys and sync field names are the same as before the redesign, so nothing
   saved on a phone is lost. Gestures are shortcuts; every action has a button. */
(function () {
  "use strict";

  var doc = document;
  var page = doc.body.getAttribute("data-page");
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var VERDICT_WORDS = { make_again: "Loved it", fine: "Fine", dont_offer: "Not again" };

  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  function readJSON(id) {
    var node = doc.getElementById(id);
    if (!node) return null;
    try { return JSON.parse(node.textContent); } catch (e) { return null; }
  }
  function load(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key) || "null"); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } }
  function sload(key) { try { return JSON.parse(sessionStorage.getItem(key) || "null"); } catch (e) { return null; } }
  function ssave(key, value) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ } }
  var TIMER_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M10 3h4"/></svg>';
  // The 600px copy of a photo: thumbnails and phone widths.
  function small(name) { return String(name || "").replace(/(\.[a-z]+)$/i, "@600$1"); }
  // A number that changes gives a small nudge, so the tap is felt.
  function bump(node, value) {
    if (!node) return;
    var v = String(value);
    if (node.textContent === v) return;
    node.textContent = v;
    node.classList.remove("bump"); void node.offsetWidth; node.classList.add("bump");
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------- Dates. ?asof=YYYY-MM-DD pins "today" for a preview or a test, and sticks for the tab. ---------- */
  function todayISO() {
    var forced = new URLSearchParams(location.search).get("asof");
    if (forced && /^\d{4}-\d{2}-\d{2}$/.test(forced)) { ssave("larder-asof", forced); return forced; }
    var kept = sload("larder-asof");
    if (kept) return kept;
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function parseISO(iso) { var p = iso.split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function addDays(iso, n) { var d = parseISO(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function longDate(iso) { var d = parseISO(iso); return DAYS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()]; }
  function shortDate(iso) { var d = parseISO(iso); return DAYS[d.getUTCDay()].slice(0, 3) + " " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()].slice(0, 3); }
  function hourNow() { return new Date().getHours(); }
  var TODAY = todayISO();

  /* ---------- Toast with undo ---------- */
  var toastTimer = null;
  function toast(text, undo) {
    var box = $("#toast");
    if (!box) return;
    box.querySelector("span").textContent = text;
    var button = box.querySelector("button");
    button.hidden = !undo;
    button.onclick = function () { box.hidden = true; if (undo) undo(); };
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.hidden = true; }, undo ? 7000 : 3500);
  }

  /* ---------- The door key: from the email link once, then kept on this phone ---------- */
  function householdKey() {
    var m = /(?:^#|&)k=([A-Za-z0-9_-]{22,128})/.exec(location.hash);
    if (m) {
      store("larder-household-key", m[1]);
      var rest = location.hash.replace(/(?:^#|&)k=[A-Za-z0-9_-]+/, "").replace(/^&/, "#");
      history.replaceState(null, "", location.pathname + location.search + (rest && rest !== "#" ? rest : ""));
    }
    return load("larder-household-key", "");
  }

  /* ---------- The week's state on this phone, and the sync client ---------- */
  var week = readJSON("larder-week");
  var syncCfg = readJSON("larder-sync");
  var W = null;
  if (week) W = makeWeekStore(week);

  function makeWeekStore(data) {
    var key = "larder-tweaks-" + data.week;
    var state = load(key, null) || { by: "", dinners: {}, missing: "", order: null };
    state.dinners = state.dinners || {};
    state.picks = state.picks || {};
    state.freezer = state.freezer || {};
    state.portions = state.portions || {};
    state.replace = state.replace || {};
    state.asks = state.asks || [];
    if (!state.by) state.by = load("larder-who", "") || "";
    var client = null;
    var listeners = [];
    var problem = null;
    var door = syncCfg ? householdKey() : "";

    function fields() {
      var out = {};
      if (state.order && state.order.length) out.order = state.order.slice();
      if (state.by === "joe" || state.by === "lotte") out.by = state.by;
      if (state.missing) out.missing = String(state.missing).replace(/\s+/g, " ").trim();
      if (state.late) out.late = "after 7pm";
      Object.keys(state.dinners).forEach(function (k) {
        var row = state.dinners[k] || {};
        if (row.status === "cooked" || row.status === "skipped") out["dinner." + k + ".status"] = row.status;
        if (row.verdict) out["dinner." + k + ".verdict"] = row.verdict;
        if (row.note) out["dinner." + k + ".note"] = String(row.note).replace(/\s+/g, " ").trim();
        if (row.judeLeft) out["dinner." + k + ".jude_left"] = true;
        if (row.short) out["dinner." + k + ".short"] = true;
        if (row.skipTo === "freezer" || row.skipTo === "tomorrow" || row.skipTo === "leave") out["dinner." + k + ".skip_to"] = row.skipTo;
      });
      Object.keys(state.picks).forEach(function (id) { if (state.picks[id]) out["pick." + id] = state.picks[id]; });
      Object.keys(state.freezer).forEach(function (id) { var r = state.freezer[id] || {}; if (r.move) out["freezer." + id + ".move"] = r.move; });
      return out;
    }

    function applyRemote(remote) {
      if (!remote) return;
      if (remote.order && Array.isArray(remote.order.value)) state.order = remote.order.value.slice();
      if (remote.by && (remote.by.value === "joe" || remote.by.value === "lotte") && !state.by) state.by = remote.by.value;
      if (remote.missing) state.missing = remote.missing.value || "";
      if (remote.late && remote.late.value === "after 7pm") state.late = true;
      Object.keys(remote).forEach(function (k) {
        var value = remote[k] && remote[k].value;
        var parts = k.split(".");
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
      store(key, state);
    }

    function status() {
      if (problem) return { state: "waiting", text: problem };
      if (syncCfg && !door) return { state: "local", text: "Saved on this phone. To share with the other phone, open this week once from Larder's email." };
      if (!client) return { state: "local", text: "Saved on this phone only. Use Send to Larder to share it." };
      if (client.status() === "synced") return { state: "synced", text: "Saved, and shared with the other phone." };
      return { state: "waiting", text: navigator.onLine === false ? "Saved on this phone. No signal: it shares when the connection is back." : "Saved on this phone. Sharing with the other phone…" };
    }
    function paintStatus() {
      var s = status();
      $$("[data-sync-status]").forEach(function (node) { node.textContent = s.text; node.setAttribute("data-state", s.state); });
    }
    function notify() { paintStatus(); listeners.forEach(function (fn) { fn(); }); }

    if (syncCfg && door && window.LarderSync && syncCfg.week === data.week) {
      // A new door key opens a new, empty store. Mark everything this phone holds as unsent, so it goes across.
      var mark = door.slice(0, 6) + door.length;
      if (load("larder-sync-key-" + data.week, "") !== mark) {
        var held = window.LarderSync.readStored(localStorage, data.week);
        var unsent = {};
        Object.keys(held).forEach(function (k) { if (held[k] && held[k].at) unsent[k] = held[k].at; });
        store("larder-sync-dirty-" + data.week, unsent);
        store("larder-sync-key-" + data.week, mark);
      }
      client = window.LarderSync.createClient({
        baseUrl: syncCfg.base_url,
        householdKey: door,
        week: data.week,
        storage: localStorage,
        onUpdate: function () { applyRemote(client.fields()); notify(); }
      });
      applyRemote(client.fields());
      client.start();
    }

    return {
      data: data,
      state: state,
      client: client,
      save: function () {
        store(key, state);
        problem = client ? client.setFields(fields()) : null;
        notify();
        return problem;
      },
      setField: function (name, value) {
        problem = client ? client.setField(name, value) : null;
        paintStatus();
        return problem;
      },
      remote: function (name) { return client ? (client.fields()[name] || {}).value : undefined; },
      onChange: function (fn) { listeners.push(fn); },
      paintStatus: paintStatus,
      dinner: function (k) { state.dinners[k] = state.dinners[k] || {}; return state.dinners[k]; },
      byRecipe: function (id) { return data.dinners.filter(function (d) { return d.recipe === id; })[0] || null; },
      byKey: function (k) { return data.dinners.filter(function (d) { return d.key === k; })[0] || null; }
    };
  }

  /* ---------- The note Larder reads. Plain words first, the machine lines after. ---------- */
  function dishName(k) {
    if (!W) return k;
    var d = W.byKey(k);
    if (d) return d.short || d.title || k;
    var opt = (W.data.options || []).concat(W.data.alternatives || []).filter(function (o) { return o.id === k; })[0];
    return opt ? opt.short : k;
  }
  function buildNote() {
    var s = W.state;
    var human = [];
    var lines = ["LARDER-TWEAKS 1", "week: " + W.data.week];
    if (s.by) lines.push("by: " + s.by);
    var chosen = Object.keys(s.picks).filter(function (id) { return s.picks[id] === "chosen"; });
    var passed = Object.keys(s.picks).filter(function (id) { return s.picks[id] === "passed"; });
    var keptIdeas = chosen.filter(function (id) { return id.indexOf("idea-") === 0; });
    var keptRecipes = chosen.filter(function (id) { return id.indexOf("idea-") !== 0; });
    if (keptRecipes.length) human.push("Keep: " + keptRecipes.map(dishName).join(", ") + ".");
    if (keptIdeas.length) human.push("New ideas we'd like written up: " + keptIdeas.map(dishName).join(", ") + ".");
    if (passed.length) human.push("Skip: " + passed.map(dishName).join(", ") + ".");
    Object.keys(s.picks).forEach(function (id) { if (s.picks[id]) lines.push("pick: " + id + " " + s.picks[id]); });
    Object.keys(s.portions).forEach(function (id) {
      var p = s.portions[id] || {};
      if (s.picks[id] !== "chosen") return;
      var total = (p.adults || 2) + (p.batch || 0);
      if ((p.adults && p.adults !== 2) || p.batch) {
        human.push(dishName(id) + ": " + (p.adults || 2) + " adults" + (p.batch ? " and " + p.batch + " extra for the freezer" : "") + ".");
        lines.push("portions: " + id + " " + total);
      }
    });
    if (s.order && s.order.length && s.orderChanged) {
      lines.push("reorder: " + s.order.join(", "));
      human.push("New order of the movable nights: " + s.order.map(dishName).join(", ") + ".");
    }
    Object.keys(s.replace).forEach(function (k) {
      if (!s.replace[k]) return;
      lines.push("replace: " + k + " " + s.replace[k]);
      human.push("Swap " + dishName(k) + " for " + dishName(s.replace[k]) + ". The order stays as it is.");
    });
    var cooked = [], skipped = [], jude = [];
    Object.keys(s.dinners).forEach(function (k) {
      var row = s.dinners[k] || {};
      if (row.status === "cooked") cooked.push(k);
      if (row.status === "skipped") skipped.push(k);
      if (row.judeLeft) jude.push(k);
      if (row.verdict) {
        lines.push("rating: " + k + " " + row.verdict + (row.note ? " | " + String(row.note).replace(/\s+/g, " ") : ""));
        human.push(dishName(k) + ": " + VERDICT_WORDS[row.verdict] + (row.note ? " (" + row.note + ")" : "") + ".");
      }
      if (row.short) lines.push("short: " + k);
      if (row.skipTo) lines.push("skip_to: " + k + " " + row.skipTo);
    });
    if (cooked.length) lines.push("cooked: " + cooked.join(", "));
    if (skipped.length) lines.push("skipped: " + skipped.join(", "));
    if (jude.length) { lines.push("jude_left: " + jude.join(", ")); human.push("Jude left: " + jude.map(dishName).join(", ") + "."); }
    var missing = [s.missing, (function () { try { return localStorage.getItem("larder-missing-lines") || ""; } catch (e) { return ""; } })()].filter(Boolean).join(", ");
    if (missing) { lines.push("missing: " + missing.replace(/\s+/g, " ")); human.push("Missing from the shop: " + missing + "."); }
    if (s.late) { lines.push("late: after 7pm"); human.push("The shop came after 7pm."); }
    var library = load("larder-library", {});
    Object.keys(library).forEach(function (id) {
      var row = library[id] || {};
      if (row.pinned) { lines.push("pin: " + id); human.push("Pin " + dishName(id) + " for next week."); }
      if (row.note) lines.push("recipe_note: " + id + " | " + String(row.note).replace(/\s+/g, " "));
      if (row.verdict && !W.byRecipe(id)) { lines.push("rating: " + id + " " + row.verdict); human.push(dishName(id) + " in the cookbook: " + VERDICT_WORDS[row.verdict] + "."); }
    });
    return { human: human, machine: lines.join("\n"), empty: lines.length <= 3 && !human.length };
  }
  function noteBody(note) {
    var intro = "Hello Larder,\n\n" + (note.human.length ? note.human.join("\n") : "No changes.") + "\n\n";
    return intro + "(For Larder to read:)\n" + note.machine + "\n";
  }
  function sendMail(subject, body) {
    location.href = "mailto:larder@mail.grokbot.com?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }
  function copyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { toast("Couldn't copy on this phone. Use the email button."); });
    else toast("Couldn't copy on this phone. Use the email button.");
  }

  /* ---------- Shared bits ---------- */
  function rememberReturn(hash) {
    ssave("larder-return", { path: location.pathname, hash: hash || "", week: week ? week.week : "" });
  }
  function bindDisclosure(button, onToggle) {
    var panel = doc.getElementById(button.getAttribute("aria-controls"));
    button.addEventListener("click", function () {
      var open = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", open ? "true" : "false");
      if (panel) panel.hidden = !open;
      if (onToggle) onToggle(open);
    });
  }
  function setPressed(group, attr, value) {
    $$("[" + attr + "]", group).forEach(function (b) { if (b.tagName === "BUTTON") b.setAttribute("aria-pressed", b.getAttribute(attr) === value ? "true" : "false"); });
  }
  function bindVerdicts(scope, dinnerKey, after) {
    function row() { return W.state.dinners[dinnerKey] || {}; }
    function paint() {
      setPressed(scope, "data-verdict", row().verdict);
      var j = $("[data-jude-left]", scope);
      if (j) j.setAttribute("aria-pressed", row().judeLeft ? "true" : "false");
      var sh = $("[data-short]", scope);
      if (sh) sh.setAttribute("aria-pressed", row().short ? "true" : "false");
    }
    $$("[data-verdict]", scope).forEach(function (b) {
      b.addEventListener("click", function () {
        var r = W.dinner(dinnerKey);
        var before = r.verdict;
        var v = b.getAttribute("data-verdict");
        r.verdict = before === v ? "" : v;
        if (r.verdict && !r.status) r.status = "cooked";
        W.save(); paint();
        toast(r.verdict ? VERDICT_WORDS[v] + " saved." : "Rating cleared.", function () { W.dinner(dinnerKey).verdict = before; W.save(); paint(); });
        if (after) after();
      });
    });
    var j = $("[data-jude-left]", scope);
    if (j) j.addEventListener("click", function () { var r = W.dinner(dinnerKey); r.judeLeft = !r.judeLeft; W.save(); paint(); });
    var sh = $("[data-short]", scope);
    if (sh) sh.addEventListener("click", function () { var r = W.dinner(dinnerKey); r.short = !r.short; W.save(); paint(); });
    paint();
    W.onChange(paint);
  }

  /* ---------- Filters, shared by Menu and Cookbook ---------- */
  function makeFilters(box, onChange) {
    var f = { search: "", practical: {}, protein: {}, cuisine: "", type: "" };
    var LABELS = {};
    $$("[data-facet]", box).forEach(function (b) { LABELS[b.getAttribute("data-facet") + ":" + b.getAttribute("data-value")] = b.textContent.trim(); });
    function active() {
      var out = [];
      Object.keys(f.practical).forEach(function (v) { if (f.practical[v]) out.push(LABELS["practical:" + v] || v); });
      Object.keys(f.protein).forEach(function (v) { if (f.protein[v]) out.push(LABELS["protein:" + v] || v); });
      if (f.cuisine) out.push($("[data-facet-select=cuisine] option:checked", box).textContent);
      if (f.type) out.push($("[data-facet-select=type] option:checked", box).textContent);
      if (f.search) out.push("“" + f.search + "”");
      return out;
    }
    function paint() {
      var a = active();
      var line = $("[data-active-filters]", box);
      line.hidden = !a.length;
      $("[data-active-text]", box).textContent = a.length + (a.length === 1 ? " filter: " : " filters: ") + a.join(", ");
      onChange();
    }
    $$("[data-facet]", box).forEach(function (b) {
      b.addEventListener("click", function () {
        var group = f[b.getAttribute("data-facet")], v = b.getAttribute("data-value");
        group[v] = !group[v];
        b.setAttribute("aria-pressed", group[v] ? "true" : "false");
        paint();
      });
    });
    $$("[data-facet-select]", box).forEach(function (s) { s.addEventListener("change", function () { f[s.getAttribute("data-facet-select")] = s.value; paint(); }); });
    var search = $("[data-filter-search]", box);
    search.addEventListener("input", function () { f.search = search.value.trim().toLowerCase(); paint(); });
    function clear() {
      f = { search: "", practical: {}, protein: {}, cuisine: "", type: "" };
      $$("[data-facet]", box).forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
      $$("[data-facet-select]", box).forEach(function (s) { s.value = ""; });
      search.value = "";
      paint();
    }
    doc.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-clear-filters]")) clear(); });
    return {
      matches: function (el) {
        var practical = (el.getAttribute("data-practical") || "").split(" ");
        for (var p in f.practical) if (f.practical[p] && practical.indexOf(p) < 0) return false;
        var prots = Object.keys(f.protein).filter(function (k) { return f.protein[k]; });
        if (prots.length && prots.indexOf(el.getAttribute("data-protein")) < 0) return false;
        if (f.cuisine && el.getAttribute("data-cuisine") !== f.cuisine) return false;
        if (f.type && el.getAttribute("data-type") !== f.type) return false;
        if (f.search && (el.getAttribute("data-search") || "").indexOf(f.search) < 0) return false;
        return true;
      },
      describe: function () { return active(); },
      clear: clear
    };
  }

  /* ---------- Pages ---------- */
  var pages = {};

  pages.home = function () {
    var data = readJSON("larder-weeks");
    if (!data || !data.weeks.length) return;
    var weeks = data.weeks.filter(function (w) { return !w.sample; });
    if (!weeks.length) weeks = data.weeks;
    var now = weeks.filter(function (w) { return w.first <= TODAY && TODAY <= w.last; })[0];
    var next = weeks.filter(function (w) { return w.first > TODAY; })[0];
    var pick = now || next || weeks[weeks.length - 1];
    $$(".week-card").forEach(function (card) { card.hidden = card.getAttribute("data-week") !== pick.week; });
    var card = $('.week-card[data-week="' + pick.week + '"]');
    if (!card) return;
    var label = $("[data-label]", card), headline = $("[data-headline]", card), cook = $("[data-cook]", card);
    var tonight = pick.dinners.filter(function (d) { return d.date === TODAY; })[0];
    var upcoming = pick.dinners.filter(function (d) { return d.date > TODAY; })[0];
    var focus = null;
    if (now && tonight) { label.textContent = "Tonight, " + longDate(TODAY); headline.textContent = tonight.short; focus = tonight; }
    else if (now && upcoming) { label.textContent = (upcoming.date === addDays(TODAY, 1) ? "Tomorrow, " : "Next, ") + longDate(upcoming.date); headline.textContent = upcoming.short; focus = upcoming; }
    else if (!now && next) { label.textContent = "Starts " + longDate(next.first); headline.textContent = next.heading; }
    else { label.textContent = "Finished " + longDate(pick.last); $("#no-week").hidden = false; }
    if (focus && focus.recipe) { cook.hidden = false; cook.href = card.getAttribute("data-path") + focus.recipe + "/?cook=1"; cook.textContent = "Cook " + focus.short.toLowerCase() + " step by step"; }
    // One obvious next step: when there is nothing to cook, opening the week is the main button.
    var openWeek = $("[data-open-week]", card);
    if (openWeek) openWeek.classList.toggle("btn-primary", cook.hidden);
    $$("li[data-date]", card).forEach(function (li) {
      var d = li.getAttribute("data-date");
      li.classList.toggle("is-past", d < TODAY);
      li.classList.toggle("is-tonight", !!focus && d === focus.date);
    });
    var photo = $("[data-photo]", card);
    if (photo && focus && focus.image) { photo.srcset = "img/" + small(focus.image) + " 600w, img/" + focus.image + " 1200w"; photo.src = "img/" + focus.image; }
  };

  pages.today = function () {
    var q = new URLSearchParams(location.search);
    var view = q.get("view");
    if (view === "week" || view === "choose") { location.replace("menu/" + location.hash); return; }
    var dinners = W.data.dinners.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var first = dinners[0], last = dinners[dinners.length - 1];
    var tonight = dinners.filter(function (d) { return d.date === TODAY; })[0];
    var next = dinners.filter(function (d) { return d.date > TODAY; })[0];
    var lead = tonight || (TODAY < first.date ? first : next);
    $$(".hero").forEach(function (h) { h.hidden = true; });
    if (lead) {
      var hero = doc.getElementById("hero-" + lead.key);
      hero.hidden = false;
      var label = $("[data-when]", hero);
      if (lead === tonight) label.textContent = "Tonight, " + longDate(lead.date);
      else if (TODAY < first.date) label.textContent = "First dinner, " + longDate(lead.date);
      else label.textContent = (lead.date === addDays(TODAY, 1) ? "Tomorrow, " : "Next, ") + longDate(lead.date);
    } else {
      doc.getElementById("hero-done").hidden = false;
    }
    function paintDays() {
      $$(".day").forEach(function (li) {
        var k = li.getAttribute("data-key"), date = li.getAttribute("data-date");
        var row = W.state.dinners[k] || {};
        var st = row.status === "cooked" ? "cooked" : row.status === "skipped" ? "skipped" : date === TODAY ? "tonight" : date < TODAY ? "past" : "";
        li.setAttribute("data-state", st);
      });
    }
    paintDays();
    W.onChange(paintDays);
    // What is happening now: one line each, most urgent first.
    var m = W.data.milestones || {};
    var lines = [];
    var dateOfKey = {};
    dinners.forEach(function (d) { dateOfKey[d.key] = d.date; });
    var impacts = (W.data.order && W.data.order.impacts || []).filter(function (i) {
      return (i.touches || []).some(function (k) { return (dateOfKey[k] || "") >= TODAY; });
    });
    var tomorrow = dinners.filter(function (d) { return d.date === addDays(TODAY, 1); })[0];
    if (m.choice_state !== "agreed" && m.choice_state !== "confirmed" && m.choose_by && TODAY <= m.choose_by) {
      lines.push('Choose this week’s dinners by ' + longDate(m.choose_by) + '. <a href="menu/">Open the menu</a>.');
    } else if (!W.data.order && m.delivery && TODAY < m.delivery.date) {
      lines.push('Menu confirmed. Joe checks out and books the slot. <a href="shop/">See the shop</a>.');
    }
    if (m.delivery && TODAY === m.delivery.date) lines.push("Delivery today, " + m.delivery.from + " to " + m.delivery.to + ".");
    if (TODAY === m.prep_day) lines.push('Prep day. <a href="sunday/">Sunday prep, step by step</a>.');
    if (impacts.length && W.data.order.headline) lines.push(esc(W.data.order.headline) + ' <a href="shop/#delivery">What to do</a>.');
    if (tomorrow && (tomorrow.kind === "freezer" || tomorrow.frozen_ahead) && TODAY >= first.date) {
      lines.push("Tonight, take the " + esc(tomorrow.short.toLowerCase()) + " out of the freezer for tomorrow.");
    }
    if (TODAY > last.date) lines.push('This week is finished. <a href="#review">How was it?</a>');
    if (TODAY < first.date && !lines.length) lines.push("The week starts " + longDate(first.date) + ".");
    if (lines.length) $("#now-list").innerHTML = lines.map(function (t) { return "<li>" + t + "</li>"; }).join("");
    $$(".alert-item").forEach(function (a, i) {
      var item = (W.data.order && W.data.order.impacts || [])[i];
      if (item && impacts.indexOf(item) < 0) a.hidden = true;
    });
    var alerts = $("#delivery-alerts");
    if (alerts && !$$(".alert-item:not([hidden])", alerts).length) alerts.hidden = true;
    // Expanders, remembered for the tab.
    var openKey = "larder-open-" + W.data.week;
    var opened = sload(openKey) || {};
    $$(".expand").forEach(function (b) {
      var k = b.closest(".day").getAttribute("data-key");
      bindDisclosure(b, function (open) { opened[k] = open; ssave(openKey, opened); });
      if (opened[k]) b.click();
    });
    $$("[data-open]").forEach(function (a) {
      a.addEventListener("click", function () {
        var b = $("#day-" + a.getAttribute("data-open") + " .expand");
        if (b && b.getAttribute("aria-expanded") !== "true") b.click();
      });
    });
    if (location.hash.indexOf("#day-") === 0) {
      var target = $(location.hash);
      var b = target && $(".expand", target);
      if (b && b.getAttribute("aria-expanded") !== "true") b.click();
      if (target) target.scrollIntoView();
    }
    $$("a[href]").forEach(function (a) {
      a.addEventListener("click", function () {
        var day = a.closest(".day");
        rememberReturn(day ? "#" + day.id : "");
      });
    });
    var review = $("#review");
    var shown = 0;
    $$("#review-list > li").forEach(function (li) {
      var k = li.getAttribute("data-key"), date = li.getAttribute("data-date");
      var row = W.state.dinners[k] || {};
      var due = date < TODAY || (date === TODAY && hourNow() >= 19) || row.status === "cooked";
      li.hidden = !due;
      if (due) { shown += 1; bindVerdicts(li, k); }
    });
    review.hidden = shown === 0;
    try { localStorage.setItem("larder-last-week", location.pathname); } catch (e) { /* fine */ }
  };

  pages.menu = function () {
    var stateBox = $("[data-menu-state]");
    var confirmed = stateBox.getAttribute("data-confirmed") === "true";
    var cutoff = stateBox.getAttribute("data-cutoff");
    var s = W.state;
    var all = (W.data.options || []).concat(W.data.alternatives || []);
    function option(id) { return all.filter(function (o) { return o.id === id; })[0]; }
    function norm(t) { return String(t || "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\b(the|best|kg|g|ml)\b/g, "").replace(/\s+/g, " ").trim(); }
    function money(v) { return "£" + v.toFixed(2); }

    function badge() {
      var html = "";
      if (confirmed) {
        html = '<span class="badge badge-done">Confirmed by Joe</span>';
        var changed = s.orderChanged || Object.keys(s.replace).some(function (k) { return s.replace[k]; });
        if (changed) html += s.sentAt ? '<span class="badge badge-shared">Changes sent ' + esc(s.sentAt) + "</span>" : '<span class="badge badge-draft">Changes not sent yet</span>';
      } else {
        var any = Object.keys(s.picks).some(function (id) { return s.picks[id]; });
        html = '<span class="badge badge-draft">Open for picks' + (cutoff ? " until " + esc(cutoff) : "") + "</span>";
        if (any && s.sentAt) html += '<span class="badge badge-shared">Sent to Larder ' + esc(s.sentAt) + "</span>";
        else if (any) html += '<span class="badge">Draft on this phone</span>' + (W.client && W.client.status() === "synced" ? '<span class="badge badge-shared">Shared with the other phone</span>' : "");
      }
      stateBox.innerHTML = html;
    }

    function packsFor(ids) {
      var seen = {};
      var rows = [];
      ids.forEach(function (id) {
        var o = option(id);
        if (!o || o.kind !== "recipe") return;
        o.packs.forEach(function (p) {
          var k = norm(p.item);
          if (seen[k]) { seen[k].dishes.push(o.short); return; }
          seen[k] = { item: p.item, price: p.price_gbp, dishes: [o.short] };
          rows.push(seen[k]);
        });
      });
      return rows;
    }

    if (!confirmed) {
      var list = $("#options");
      var cards = $$(".option", list);
      var filters = makeFilters($("[data-filters]"), paint);
      var shownKey = "larder-shown-" + W.data.week;
      var shown = sload(shownKey);
      if (shown) cards.forEach(function (c) { if (shown.indexOf(c.getAttribute("data-id")) >= 0) c.removeAttribute("data-pool"); else c.setAttribute("data-pool", ""); });
      function saveShown() { ssave(shownKey, cards.filter(function (c) { return !c.hasAttribute("data-pool"); }).map(function (c) { return c.getAttribute("data-id"); })); }
      function paint() {
        var visible = 0;
        cards.forEach(function (card) {
          var id = card.getAttribute("data-id");
          var pick = s.picks[id] || "";
          card.setAttribute("data-pick", pick);
          setPressed(card, "data-pick", pick);
          var labelNode = $("[data-pick-label]", card);
          var word = pick === "chosen" ? "Kept" : pick === "passed" ? "Skipped" : "";
          // The tape goes on again whenever the pick changes, so the change is seen.
          if (labelNode.textContent !== word) { labelNode.hidden = true; void labelNode.offsetWidth; }
          labelNode.hidden = !pick;
          labelNode.textContent = word;
          var portions = $(".portions", card);
          if (portions) portions.hidden = pick !== "chosen";
          var o = option(id);
          if (o && o.kind === "recipe") {
            var p = s.portions[id] || {};
            bump($("[data-out=adults]", card), p.adults || o.base_serves || 2);
            bump($("[data-out=batch]", card), p.batch || 0);
            $("[data-step=adults][data-by='-1']", card).disabled = (p.adults || 2) <= 1;
            $("[data-step=batch][data-by='-1']", card).disabled = (p.batch || 0) <= 0;
          }
          var match = !card.hasAttribute("data-pool") && filters.matches(card);
          var show = pick === "chosen" || match;
          card.hidden = !show;
          if (match && pick !== "chosen") visible += 1;
        });
        $("#options-empty").hidden = visible > 0 || !filters.describe().length && cards.some(function (c) { return !c.hidden; });
        var kept = Object.keys(s.picks).filter(function (id) { return s.picks[id] === "chosen"; });
        var keptRecipes = kept.filter(function (id) { var o = option(id); return o && o.kind === "recipe"; });
        var keptIdeas = kept.filter(function (id) { var o = option(id); return o && o.kind === "idea"; });
        var rows = packsFor(keptRecipes);
        var known = rows.filter(function (r) { return r.price != null; });
        var total = known.reduce(function (a, r) { return a + r.price; }, 0);
        var unknown = rows.length - known.length;
        var bar = $("#review-bar");
        bar.hidden = !kept.length;
        doc.body.classList.toggle("has-bar", !!kept.length);
        $("[data-review-summary]").textContent = kept.length + " kept" + (rows.length ? ", packs " + (unknown ? "at least " : "about ") + money(total) : "");
        var body = $("#review-body");
        if (!kept.length) { body.innerHTML = '<p class="muted">Nothing kept yet. Tap Keep on the dinners you fancy, and they appear here with what they add to the shop.</p>'; }
        else {
          var h = "";
          if (keptRecipes.length) {
            h += '<ol class="list">' + keptRecipes.map(function (id) {
              var o = option(id), p = s.portions[id] || {};
              return "<li><strong>" + esc(o.short) + "</strong><br><span class=\"small muted\">" + (p.adults || o.base_serves || 2) + " adults and Jude" + (p.batch ? ", " + p.batch + " for the freezer" : "") + (o.kcal ? ". About " + o.kcal + " kcal per adult (estimate)" : "") + "</span></li>";
            }).join("") + "</ol>";
            h += '<h3 style="margin-top:18px">What it would add to the shop</h3><ul class="impact-list">' + rows.map(function (r) {
              return "<li><span>" + esc(r.item) + (r.dishes.length > 1 ? ' <span class="badge badge-done">Shared by ' + esc(r.dishes.join(" and ")) + "</span>" : "") + "</span><span>" + (r.price != null ? money(r.price) : '<span class="unknown">not priced</span>') + "</span></li>";
            }).join("") + "</ul>";
            h += '<p class="small muted">' + (unknown ? unknown + " pack" + (unknown === 1 ? " has" : "s have") + " no price yet, so the total is a floor, not a quote. " : "") + "Prices are from the last shop. Nothing is added to the basket until Joe confirms the menu. More portions can need bigger packs; Larder checks that when it prices.</p>";
          }
          if (keptIdeas.length) {
            h += '<h3 style="margin-top:18px">New ideas you kept</h3><ul class="list">' + keptIdeas.map(function (id) { return "<li><strong>" + esc(option(id).short) + "</strong><br><span class=\"small muted\">Not a recipe yet. Larder writes it up and checks it before it can go in the shop.</span></li>"; }).join("") + "</ul>";
          }
          var passed = Object.keys(s.picks).filter(function (id) { return s.picks[id] === "passed"; });
          if (passed.length) h += '<p class="small">Skipped: ' + passed.map(function (id) { return esc(option(id) ? option(id).short : id); }).join(", ") + ".</p>";
          h += '<p><a class="btn btn-primary" href="#send">Send our picks</a></p>';
          body.innerHTML = h;
        }
        badge();
        summary();
      }
      function choose(card, value) {
        var id = card.getAttribute("data-id");
        var before = s.picks[id] || "";
        s.picks[id] = before === value ? "" : value;
        if (s.picks[id] === "") delete s.picks[id];
        s.sentAt = "";
        W.save(); paint();
        var o = option(id);
        toast((s.picks[id] === "chosen" ? "Kept " : s.picks[id] === "passed" ? "Skipped " : "Cleared ") + (o ? o.short : id) + ".", function () {
          if (before) s.picks[id] = before; else delete s.picks[id];
          W.save(); paint();
        });
      }
      cards.forEach(function (card) {
        $$("button[data-pick]", card).forEach(function (b) { b.addEventListener("click", function () { choose(card, b.getAttribute("data-pick")); }); });
        $$("[data-step]", card).forEach(function (b) {
          b.addEventListener("click", function () {
            var id = card.getAttribute("data-id");
            var p = s.portions[id] = s.portions[id] || { adults: (option(id) || {}).base_serves || 2, batch: 0 };
            var field = b.getAttribute("data-step"), by = +b.getAttribute("data-by");
            p[field] = Math.max(field === "adults" ? 1 : 0, Math.min(6, (p[field] || 0) + by));
            s.sentAt = "";
            W.save(); paint();
          });
        });
        // Swipe the photo: a shortcut. A mostly vertical move is a scroll, and is left alone.
        // The photo follows the finger and says what letting go will do.
        var photo = $("[data-swipe]", card), cue = $(".swipe-cue", card), x0 = null, y0 = 0;
        function release() { x0 = null; photo.style.transform = ""; card.removeAttribute("data-drag"); }
        photo.addEventListener("pointerdown", function (e) { if (e.pointerType === "mouse") return; x0 = e.clientX; y0 = e.clientY; });
        photo.addEventListener("pointermove", function (e) {
          if (x0 == null) return;
          var dx = e.clientX - x0, dy = e.clientY - y0;
          if (Math.abs(dy) > Math.abs(dx)) { release(); return; }
          photo.style.transform = "translateX(" + dx / 2.5 + "px) rotate(" + dx / 60 + "deg)";
          var armed = Math.abs(dx) > 90;
          card.setAttribute("data-drag", dx > 0 ? (armed ? "keep-armed" : "keep") : (armed ? "skip-armed" : "skip"));
          if (cue) cue.textContent = dx > 0 ? "Keep" : "Skip";
        });
        photo.addEventListener("pointerup", function (e) {
          if (x0 == null) return;
          var dx = e.clientX - x0, dy = e.clientY - y0;
          release();
          if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 1.5) choose(card, dx > 0 ? "chosen" : "passed");
        });
        photo.addEventListener("pointercancel", release);
      });
      // Other suggestions: replace only what you haven't kept, from the ones that fit the filters.
      $("#more-ideas").addEventListener("click", function () {
        var pool = cards.filter(function (c) { return c.hasAttribute("data-pool") && filters.matches(c); });
        var replaceable = cards.filter(function (c) { return !c.hasAttribute("data-pool") && s.picks[c.getAttribute("data-id")] !== "chosen" && filters.matches(c); });
        var swapped = 0;
        replaceable.forEach(function (c) {
          var incoming = pool.shift();
          if (!incoming) return;
          c.setAttribute("data-pool", "");
          incoming.removeAttribute("data-pool");
          list.insertBefore(incoming, c);
          swapped += 1;
        });
        // Put the ones moved out at the back of the pool, so they can come round again.
        cards.forEach(function (c) { if (c.hasAttribute("data-pool")) list.appendChild(c); });
        saveShown();
        paint();
        $("#more-note").textContent = swapped ? swapped + " new suggestion" + (swapped === 1 ? "" : "s") + ". Kept dinners stay where they are." : "No other suggestions fit these filters. Ask Larder for new ideas below.";
      });
      // Ask Larder for new ideas: a plain request; nothing here pretends to answer it.
      function askText() {
        var wants = $("#ask-text").value.trim();
        var f = filters.describe();
        var kept = Object.keys(s.picks).filter(function (id) { return s.picks[id] === "chosen"; }).map(dishName);
        return "Hello Larder,\n\nPlease suggest some new dinners for the week of " + longDate(W.data.week) + ".\n" +
          (wants ? "\nWhat we'd like: " + wants + "\n" : "") + (f.length ? "Filters: " + f.join(", ") + "\n" : "") +
          (kept.length ? "Already kept: " + kept.join(", ") + ". Please don't change these.\n" : "") +
          "\nHouse rules as always: no mayonnaise, one mince a week, no turkey meatballs, and a Jude version.\n";
      }
      function logAsk() {
        var d = new Date();
        s.asks.push({ at: DAYS[d.getDay()].slice(0, 3) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()), text: $("#ask-text").value.trim() });
        W.save();
        paintAsks();
      }
      function paintAsks() {
        var lastAsk = s.asks[s.asks.length - 1];
        if (lastAsk) $("#ask-state").textContent = "Asked Larder " + lastAsk.at + (lastAsk.text ? ": “" + lastAsk.text + "”" : "") + ". New ideas appear here once Larder adds them, marked as new. Your kept picks stay as they are.";
      }
      $("#ask-send").addEventListener("click", function () { logAsk(); sendMail("Larder: more dinner ideas, week of " + longDate(W.data.week), askText()); });
      $("#ask-copy").addEventListener("click", function () { copyText(askText(), function () { logAsk(); toast("Copied. Paste it into the Larder chat."); }); });
      paintAsks();
      paint();
      W.onChange(paint);
    } else {
      var rows = $$(".plan-row");
      var movable = W.data.dinners.filter(function (d) { return d.movable; });
      var movableSlots = rows.filter(function (r) { return movable.some(function (d) { return d.key === r.getAttribute("data-key"); }); }).map(function (r) { return r.getAttribute("data-date"); });
      var base = movable.map(function (d) { return d.key; });
      function currentOrder() { return s.order && s.order.length === base.length ? s.order.slice() : base.slice(); }
      function dateMap(order) { var m = {}; order.forEach(function (k, i) { m[k] = movableSlots[i]; }); return m; }
      function dateOf(k) { var m = dateMap(currentOrder()); return m[k] || (W.byKey(k) || {}).date; }
      function consequences(before, after) {
        var out = [], a = dateMap(before), b = dateMap(after);
        Object.keys(b).forEach(function (k) {
          if (a[k] === b[k]) return;
          var d = W.byKey(k);
          var line = esc(d.short) + " is now " + longDate(b[k]) + ".";
          if (d.frozen_ahead || d.kind === "freezer") line += " Take it out of the freezer on " + longDate(addDays(b[k], -1)) + " night.";
          out.push(line);
        });
        W.data.dinners.forEach(function (other) {
          if (other.uses_leftover_of && other.leftover_days) {
            var parent = W.byRecipe(other.uses_leftover_of);
            if (parent) {
              var gap = (parseISO(dateOf(other.key)) - parseISO(dateOf(parent.key))) / 86400000;
              if (gap > other.leftover_days) out.push("Careful: " + esc(other.short) + " uses leftovers that keep " + other.leftover_days + " days, and it is now " + gap + " days after.");
            }
          }
        });
        var fresh = after.map(function (key) { return W.byKey(key); }).filter(function (x) { return x && x.use_by_order && !x.frozen_ahead && x.kind !== "freezer"; });
        for (var i = 1; i < fresh.length; i++) {
          if (fresh[i].use_by_order < fresh[i - 1].use_by_order) out.push(esc(fresh[i].short) + " has the shorter use-by date, so it now comes after " + esc(fresh[i - 1].short) + ". Check the labels.");
        }
        out.push("Nothing to buy, and the order is not changed.");
        return out;
      }
      function paintPlan(focusKey, messages) {
        var order = currentOrder();
        var map = {};
        movableSlots.forEach(function (date, i) { map[date] = order[i]; });
        rows.forEach(function (r) {
          var date = r.getAttribute("data-date");
          var k = map[date] || r.getAttribute("data-key");
          var d = W.byKey(k);
          var replaced = s.replace[k];
          var alt = replaced ? option(replaced) : null;
          var past = date < TODAY;
          r.classList.toggle("is-past", past);
          var change = $(".change [data-change]", r), done = $("[data-done]", r);
          if (change) { change.hidden = past; if (past && change.getAttribute("aria-expanded") === "true") change.click(); }
          if (done) done.hidden = !past;
          $("[data-dish]", r).textContent = alt ? alt.short : d.short;
          $("[data-sub]", r).textContent = alt ? "Swap planned, instead of " + d.short.toLowerCase() : d.kind === "leftover" ? "Leftovers" : d.kind === "freezer" ? "From the freezer" : (d.time || "");
          var thumb = $("[data-thumb]", r);
          if (thumb) { var img = alt ? alt.image : d.image; if (img) thumb.src = thumb.src.replace(/img\/[^/]+$/, "img/" + small(img)); }
          var up = $("[data-move='-1']", r), down = $("[data-move='1']", r);
          var idx = order.indexOf(k);
          if (up) { up.disabled = idx <= 0 || movableSlots[idx - 1] < TODAY; up.setAttribute("data-key", k); }
          if (down) { down.disabled = idx < 0 || idx >= order.length - 1 || date < TODAY; down.setAttribute("data-key", k); }
          var c = $(".consequence", r);
          c.innerHTML = focusKey === k && messages ? '<div class="callout">' + messages.map(function (t) { return "<p>" + t + "</p>"; }).join("") + "</div>" : (replaced ? swapSummary(k, replaced) : "");
          var rep = $("[data-replace]", r);
          if (rep) rep.setAttribute("data-key", k);
        });
        $("#undo-all").hidden = !(s.orderChanged || Object.keys(s.replace).some(function (k) { return s.replace[k]; }));
        badge(); summary();
      }
      function swapSummary(k, id) {
        var imp = swapImpact(k, id);
        return '<div class="callout callout-warn"><p><strong>Swap planned.</strong> ' + imp.text + '</p><p><button type="button" class="btn btn-small" data-unswap="' + k + '">Keep ' + esc(W.byKey(k).short.toLowerCase()) + " instead</button></p></div>";
      }
      function swapImpact(k, id) {
        var d = W.byKey(k), alt = option(id);
        var basket = (W.data.basket || []).filter(function (b) { return b.source === "delivery"; });
        var have = basket.map(function (b) { return norm(b.item); });
        var needs = alt.packs.filter(function (p) { return !have.some(function (h) { return h && (h.indexOf(norm(p.item)) >= 0 || norm(p.item).indexOf(h) >= 0); }); });
        var others = W.data.dinners.filter(function (x) { return x.key !== k && x.recipe; }).map(function (x) { return x.recipe; });
        var spare = basket.filter(function (b) { return b.recipes.indexOf(d.recipe) >= 0 && !b.recipes.some(function (r) { return r !== d.recipe && others.indexOf(r) >= 0; }); });
        var ordered = !!W.data.order;
        var cost = needs.reduce(function (a, p) { return a + (p.price_gbp || 0); }, 0);
        var text;
        if (ordered) {
          text = (needs.length ? "Not in the order: " + esc(needs.map(function (p) { return p.item; }).join(", ")) + ". Pick " + (needs.length === 1 ? "it" : "them") + " up locally (about " + money(cost) + "). " : "Everything it needs is already coming. ") +
            (spare.length ? "Spare from the order: " + esc(spare.map(function (b) { return b.item; }).join(", ")) + ". Freeze it or use it another night. " : "") + "The order is not changed.";
        } else {
          text = (needs.length ? "Would add to the shop: " + esc(needs.map(function (p) { return p.item + (p.price_gbp != null ? " (" + money(p.price_gbp) + ")" : ""); }).join(", ")) + ". " : "Adds nothing to the shop. ") +
            (spare.length ? "No longer needed: " + esc(spare.map(function (b) { return b.item; }).join(", ")) + "." : "") + " Nothing changes in the basket until Joe confirms.";
        }
        return { text: text, needs: needs, spare: spare };
      }
      rows.forEach(function (r) {
        var ch = $("[data-change]", r);
        if (ch) bindDisclosure(ch);
        $$("[data-move]", r).forEach(function (b) {
          b.addEventListener("click", function () {
            var k = b.getAttribute("data-key");
            var before = currentOrder();
            var beforeChanged = !!s.orderChanged;
            var order = before.slice();
            var i = order.indexOf(k), j = i + (+b.getAttribute("data-move"));
            if (i < 0 || j < 0 || j >= order.length) return;
            order.splice(j, 0, order.splice(i, 1)[0]);
            // Always write the order, even when it is back to the original, so the other phone hears about it.
            s.order = order;
            s.orderChanged = order.join() !== base.join();
            s.sentAt = "";
            W.save();
            var target = rows.filter(function (row) { return row.getAttribute("data-date") === dateOf(k); })[0];
            var msgs = consequences(before, order);
            paintPlan(target ? target.getAttribute("data-key") === k ? k : k : k, msgs);
            if (target) { var cons = $(".consequence", target); if (!cons.innerHTML) cons.innerHTML = '<div class="callout">' + msgs.map(function (t) { return "<p>" + t + "</p>"; }).join("") + "</div>"; }
            toast("Moved " + W.byKey(k).short + ".", function () { s.order = before; s.orderChanged = beforeChanged; W.save(); paintPlan(); });
          });
        });
        var rep = $("[data-replace]", r);
        if (rep) rep.addEventListener("click", function () {
          var k = rep.getAttribute("data-key");
          var sheet = $("[data-sheet]", r);
          var open = sheet.hidden;
          $$("[data-sheet]").forEach(function (x) { x.hidden = true; });
          $$("[data-replace]").forEach(function (x) { x.setAttribute("aria-expanded", "false"); });
          if (!open) return;
          rep.setAttribute("aria-expanded", "true");
          var used = W.data.dinners.map(function (d) { return d.recipe; });
          var alts = (W.data.alternatives || []).filter(function (o) { return used.indexOf(o.id) < 0; });
          var root = doc.querySelector("link[rel=manifest]").href.replace(/manifest\.webmanifest$/, "");
          sheet.innerHTML = "<h3>Swap " + esc(W.byKey(k).short.toLowerCase()) + " for</h3>" + '<ul class="alt-list">' + alts.map(function (o) {
            var imp = swapImpact(k, o.id);
            return '<li class="alt"><img src="' + root + "img/" + small(o.image) + '" alt="" width="88" height="66"><div><p class="alt-name">' + esc(o.short) + '</p><p class="small muted">' + imp.text + '</p><button type="button" class="btn btn-small" data-swap="' + o.id + '">Swap to ' + esc(o.short.toLowerCase()) + "</button></div></li>";
          }).join("") + '</ul><p><button type="button" class="btn btn-small btn-quiet" data-close>Close</button></p>';
          sheet.hidden = false;
          $$("[data-swap]", sheet).forEach(function (b) {
            b.addEventListener("click", function () {
              var before = s.replace[k];
              s.replace[k] = b.getAttribute("data-swap");
              s.sentAt = "";
              W.save(); sheet.hidden = true; rep.setAttribute("aria-expanded", "false");
              paintPlan(); rep.focus();
              toast("Swap planned on this phone.", function () { s.replace[k] = before; W.save(); paintPlan(); });
            });
          });
          $("[data-close]", sheet).addEventListener("click", function () { sheet.hidden = true; rep.setAttribute("aria-expanded", "false"); rep.focus(); });
        });
      });
      doc.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest("[data-unswap]");
        if (!b) return;
        var k = b.getAttribute("data-unswap");
        var before = s.replace[k];
        delete s.replace[k]; W.save(); paintPlan();
        toast("Swap removed.", function () { s.replace[k] = before; W.save(); paintPlan(); });
      });
      $("#undo-all").addEventListener("click", function () {
        var before = { order: s.order, changed: s.orderChanged, replace: JSON.parse(JSON.stringify(s.replace)) };
        s.order = base.slice(); s.orderChanged = false; s.replace = {}; W.save(); paintPlan();
        toast("Back to the confirmed menu.", function () { s.order = before.order; s.orderChanged = before.changed; s.replace = before.replace; W.save(); paintPlan(); });
      });
      var SKIP_WORDS = { tomorrow: "Having it the next day instead.", freezer: "Going into the freezer.", leave: "Left out this week." };
      rows.forEach(function (r) {
        var k = r.getAttribute("data-key");
        var open = $("[data-skip]", r), sheet = $("[data-skip-sheet]", r);
        if (!open) return;
        function paintSkip() {
          var row = W.state.dinners[k] || {};
          setPressed(sheet, "data-skip-to", row.status === "skipped" ? row.skipTo || "" : "__none");
          open.firstChild.textContent = row.status === "skipped" ? (SKIP_WORDS[row.skipTo] || "Not having it").replace(/\.$/, "") : "Not having it";
        }
        open.addEventListener("click", function () {
          var show = sheet.hidden;
          sheet.hidden = !show;
          open.setAttribute("aria-expanded", show ? "true" : "false");
        });
        $$("[data-skip-to]", sheet).forEach(function (b) {
          b.addEventListener("click", function () {
            var row = W.dinner(k), before = { status: row.status, skipTo: row.skipTo };
            var to = b.getAttribute("data-skip-to");
            if (to) { row.status = "skipped"; row.skipTo = to; } else { if (row.status === "skipped") row.status = ""; row.skipTo = ""; }
            W.save(); paintSkip(); sheet.hidden = true; open.setAttribute("aria-expanded", "false"); open.focus();
            toast(to ? SKIP_WORDS[to] : "Back on the menu.", function () { var r2 = W.dinner(k); r2.status = before.status; r2.skipTo = before.skipTo; W.save(); paintSkip(); });
          });
        });
        paintSkip();
        W.onChange(paintSkip);
      });
      paintPlan();
      W.onChange(function () { paintPlan(); });
    }

    // Send.
    var who = $("#who"), whoError = $("#who-error");
    who.value = s.by || "";
    who.addEventListener("change", function () { s.by = who.value; store("larder-who", who.value); whoError.hidden = true; W.save(); summary(); });
    function summary() {
      var note = buildNote();
      var box = $("#send-summary");
      box.innerHTML = note.human.length ? "<p><strong>What Larder will get:</strong></p><ul style=\"padding-left:1.2em\">" + note.human.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" +
        (W.client ? '<p class="small muted">Picks, moves, ratings and ticks are already shared with the other phone. Portions and swaps only travel in this email for now.</p>' : "") : '<p class="muted">Nothing to send yet.</p>';
    }
    function stamp() { var d = new Date(); s.sentAt = DAYS[d.getDay()].slice(0, 3) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); W.save(); badge(); $("#sent-at").textContent = "Email opened " + s.sentAt + ". It counts as sent once you press send in your mail app."; }
    $("#send-email").addEventListener("click", function () {
      if (!s.by) { whoError.hidden = false; who.scrollIntoView({ block: "center" }); who.focus(); return; }
      stamp();
      sendMail("Larder: " + (confirmed ? "changes" : "our picks") + " for the week of " + longDate(W.data.week), noteBody(buildNote()));
    });
    $("#copy-note").addEventListener("click", function () { copyText(noteBody(buildNote()), function () { toast("Copied. Paste it into a message to Larder."); }); });
    if (s.sentAt) $("#sent-at").textContent = "Email opened " + s.sentAt + ".";
    summary();
  };

  pages.shop = function () {
    var saved = load("larder-shop-ticks", {});
    function paint() {
      $$("[data-shop]").forEach(function (box) {
        var name = box.getAttribute("data-shop"), tick = box.getAttribute("data-tick");
        var remote = W.remote("tick.shop." + tick);
        box.checked = remote === true || remote === false ? remote : !!saved[name];
      });
      var missing = (function () { try { return localStorage.getItem("larder-missing-lines") || ""; } catch (e) { return ""; } })();
      $$("[data-missing]").forEach(function (b) {
        var on = missing.split(", ").indexOf(b.getAttribute("data-missing")) >= 0;
        b.setAttribute("aria-pressed", on ? "true" : "false");
        b.firstChild.textContent = on ? "Noted missing" : "Missing";
      });
    }
    $$("[data-shop]").forEach(function (box) {
      box.addEventListener("change", function () {
        saved[box.getAttribute("data-shop")] = box.checked;
        store("larder-shop-ticks", saved);
        W.setField("tick.shop." + box.getAttribute("data-tick"), box.checked);
      });
    });
    $$("[data-missing]").forEach(function (b) {
      b.addEventListener("click", function () {
        var name = b.getAttribute("data-missing");
        var list = (localStorage.getItem("larder-missing-lines") || "").split(", ").filter(Boolean);
        var i = list.indexOf(name);
        if (i >= 0) list.splice(i, 1); else list.push(name);
        var text = list.join(", ");
        try { localStorage.setItem("larder-missing-lines", text); } catch (e) { /* fine */ }
        W.setField("missing", text);
        paint();
        toast(i >= 0 ? name + " is not missing." : name + " noted as missing. It goes to Larder with the next note.");
      });
    });
    var late = $("#late");
    if (late) {
      late.checked = !!W.state.late;
      late.addEventListener("change", function () { W.state.late = late.checked; W.save(); });
      W.onChange(function () { late.checked = !!W.state.late; });
    }
    paint();
    W.onChange(paint);
    W.paintStatus();
  };

  pages.recipe = function () {
    var art = $(".recipe");
    var id = art.getAttribute("data-recipe");
    var steps = readJSON("larder-steps") || [];
    var timers = readJSON("larder-timers") || [];
    var split = +art.getAttribute("data-split");
    var tickKey = "larder-ticks-" + id;
    var ticks = load(tickKey, {});
    var q = new URLSearchParams(location.search);
    // Back to where you came from.
    var back = $("[data-back]"), backLabel = $("[data-back-label]");
    var ret = sload("larder-return");
    if (q.get("from") === "sunday") { back.href = "../sunday/" + (ret && ret.hash ? ret.hash : ""); backLabel.textContent = "Sunday prep"; }
    else if (ret && W && ret.week === W.data.week && ret.path) {
      back.href = ret.path + (ret.hash || "");
      backLabel.textContent = /\/menu\/$/.test(ret.path) ? "Menu" : /\/cookbook\/$/.test(ret.path) ? "Cookbook" : /\/shop\/$/.test(ret.path) ? "Shop" : "The week";
    }
    // Ticks.
    $$("input[data-tick]", art).forEach(function (box) {
      var t = box.getAttribute("data-tick");
      var remote = W ? W.remote("tick.card." + id + "." + t) : undefined;
      box.checked = remote === true || remote === false ? remote : !!ticks[t];
      box.addEventListener("change", function () {
        ticks[t] = box.checked; store(tickKey, ticks);
        if (W) W.setField("tick.card." + id + "." + t, box.checked);
      });
    });
    // Timers: survive a reload. One can run per step.
    var live = $("#timer-live");
    var running = sload("larder-timers-" + id) || {};
    function fmt(ms) { var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + pad(s % 60); }
    function beep() {
      try { var a = new (window.AudioContext || window.webkitAudioContext)(); var o = a.createOscillator(); o.connect(a.destination); o.frequency.value = 880; o.start(); o.stop(a.currentTime + 0.6); } catch (e) { /* no sound */ }
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
    function tickTimers() {
      var now = Date.now();
      $$("[data-timer]").forEach(function (b) {
        var step = b.closest("li") ? b.closest("li").id : b.getAttribute("data-step-id");
        var end = running[step];
        var mins = +b.getAttribute("data-timer");
        if (end) {
          var left = end - now;
          if (left <= 0) {
            delete running[step]; ssave("larder-timers-" + id, running);
            b.setAttribute("data-running", "false"); b.textContent = "Timer done. Start again";
            live.textContent = "Timer finished for " + step.replace("step-", "step ") + ".";
            beep();
          } else { b.setAttribute("data-running", "true"); b.textContent = fmt(left) + " left. Tap to stop"; }
        } else if (b.getAttribute("data-running") === "true") {
          b.setAttribute("data-running", "false"); b.textContent = "Start a " + mins + " min timer";
        }
      });
    }
    doc.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-timer]");
      if (!b) return;
      var step = b.closest("li") ? b.closest("li").id : b.getAttribute("data-step-id");
      if (running[step]) delete running[step]; else running[step] = Date.now() + (+b.getAttribute("data-timer")) * 60000;
      ssave("larder-timers-" + id, running);
      tickTimers();
    });
    setInterval(tickTimers, 1000);
    tickTimers();
    // Cook mode: one step, kept in the address so a reload comes back to it. Focus stays inside it.
    var cook = $("#cook"), text = $("#cook-text"), count = $("#cook-count"), bar = $("#cook-bar");
    var cursor = 0, wake = null, opener = null;
    var main = $("#cook-main");
    function showStep(i) {
      var was = cursor;
      cursor = Math.max(0, Math.min(i, steps.length - 1));
      // The step slides in from the side it came from, so the move is visible.
      if (main) {
        main.classList.remove("step-in");
        main.setAttribute("data-dir", cursor < was ? "back" : "on");
        void main.offsetWidth;
        main.classList.add("step-in");
      }
      text.textContent = steps[cursor];
      // What comes after this step, quietly, so nothing at the hob is a surprise.
      var upBox = $("#cook-upnext-box");
      if (upBox) { upBox.hidden = cursor >= steps.length - 1; $("#cook-upnext").textContent = steps[cursor + 1] || ""; }
      count.textContent = "Step " + (cursor + 1) + " of " + steps.length;
      bar.style.width = ((cursor + 1) / steps.length * 100) + "%";
      $("#cook-jude").hidden = cursor + 1 !== split;
      var slot = $("#cook-timer-slot");
      slot.innerHTML = timers[cursor] ? '<button type="button" class="btn timer" data-timer="' + timers[cursor] + '" data-step-id="step-' + (cursor + 1) + '">' + TIMER_ICON + "Start a " + timers[cursor] + " min timer</button>" : "";
      tickTimers();
      $("#cook-prev").disabled = cursor === 0;
      $("#cook-next").textContent = cursor === steps.length - 1 ? "Finish" : "Next step";
      $("#cook-done").hidden = true;
      history.replaceState(null, "", "?cook=1#step-" + (cursor + 1));
      ssave("larder-cook-" + id, cursor);
    }
    function isOpen() { return !cook.hidden; }
    function openCook(at) {
      opener = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : $("#start-cook");
      cook.hidden = false; doc.body.classList.add("cooking");
      // On a wide screen there is room for the ingredients beside the step, so they start open.
      var ing = $("#cook-ing");
      if (ing && ing.getAttribute("aria-expanded") !== "true" && window.matchMedia && window.matchMedia("(min-width: 900px)").matches) ing.click();
      showStep(at);
      function focusNext() { if (isOpen()) $("#cook-next").focus(); }
      requestAnimationFrame(focusNext);
      // Chromium can drop focus at the load event on a deep link, so focus again once the page has loaded.
      if (doc.readyState !== "complete") window.addEventListener("load", function () { setTimeout(focusNext, 0); }, { once: true });
      try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then(function (l) { wake = l; }).catch(function () {}); } catch (e) { /* fine */ }
    }
    function closeCook(toFeedback) {
      cook.hidden = true; doc.body.classList.remove("cooking");
      history.replaceState(null, "", location.pathname + (toFeedback ? "#feedback" : "#step-" + (cursor + 1)));
      if (wake) { wake.release(); wake = null; }
      if (toFeedback && $("#feedback")) { $("#feedback").scrollIntoView(); $("#feedback [data-verdict]").focus(); }
      else { var st = $("#step-" + (cursor + 1)); if (st) st.scrollIntoView({ block: "center" }); if (opener && opener.focus) opener.focus(); }
    }
    $("#start-cook").addEventListener("click", function () { openCook(sload("larder-cook-" + id) || 0); });
    $("#cook-exit").addEventListener("click", function () { closeCook(false); });
    $("#cook-prev").addEventListener("click", function () { showStep(cursor - 1); });
    $("#cook-next").addEventListener("click", function () {
      if (cursor === steps.length - 1) {
        if ($("#feedback")) { $("#cook-done").hidden = false; $("#cook-rate").focus(); } else closeCook(false);
      } else showStep(cursor + 1);
    });
    $("#cook-rate").addEventListener("click", function (e) { e.preventDefault(); closeCook(true); });
    bindDisclosure($("#cook-ing"));
    doc.addEventListener("keydown", function (e) {
      if (!isOpen()) return;
      if (e.key === "Escape") { e.preventDefault(); closeCook(false); return; }
      var typing = e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
      if (e.key === "ArrowRight" && !typing) { e.preventDefault(); $("#cook-next").click(); }
      if (e.key === "ArrowLeft" && !typing) { e.preventDefault(); if (!$("#cook-prev").disabled) $("#cook-prev").click(); }
      if (e.key === "Tab") {
        var focusables = $$("button:not([disabled]), a[href], input, [tabindex]:not([tabindex='-1'])", cook).filter(function (el) { return el.offsetParent !== null; });
        if (!focusables.length) return;
        var firstEl = focusables[0], lastEl = focusables[focusables.length - 1];
        if (e.shiftKey && (doc.activeElement === firstEl || !cook.contains(doc.activeElement))) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && (doc.activeElement === lastEl || !cook.contains(doc.activeElement))) { e.preventDefault(); firstEl.focus(); }
      }
    });
    // Swipe is a shortcut: the step follows the finger, and a long enough move turns the page.
    var sx = null, sy = 0;
    cook.addEventListener("pointerdown", function (e) { if (e.pointerType !== "mouse") { sx = e.clientX; sy = e.clientY; } });
    cook.addEventListener("pointermove", function (e) {
      if (sx == null || !main) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dy) > Math.abs(dx)) { main.style.transform = ""; return; }
      main.style.transform = "translateX(" + dx / 3 + "px)";
    });
    function endSwipe() { sx = null; if (main) main.style.transform = ""; }
    cook.addEventListener("pointercancel", endSwipe);
    cook.addEventListener("pointerup", function (e) {
      if (sx == null) return;
      var dx = e.clientX - sx, dy = e.clientY - sy; endSwipe();
      if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? $("#cook-next") : $("#cook-prev")).click();
    });
    var m = /^#step-(\d+)$/.exec(location.hash);
    if (q.get("cook") === "1") openCook(m ? +m[1] - 1 : (sload("larder-cook-" + id) || 0));
    else if (m) { var target = $(location.hash); if (target) target.scrollIntoView({ block: "center" }); }
    // Feedback, about this night and about the recipe.
    var fb = $("#feedback");
    if (fb && W) {
      var dinner = W.byRecipe(id);
      if (dinner) {
        bindVerdicts(fb, dinner.key);
        var nightNote = $("#night-note");
        nightNote.value = (W.state.dinners[dinner.key] || {}).note || "";
        nightNote.addEventListener("change", function () { W.dinner(dinner.key).note = nightNote.value.trim(); var p = W.save(); if (p) toast(p); });
      }
      var bookNote = $("#cookbook-note");
      var lib = load("larder-library", {});
      bookNote.value = (W.remote("cookbook." + id + ".note")) || (lib[id] || {}).note || (function () { try { return localStorage.getItem("larder-cookbook-" + id) || ""; } catch (e) { return ""; } })();
      bookNote.addEventListener("change", function () {
        var v = bookNote.value.trim();
        lib = load("larder-library", {}); lib[id] = lib[id] || {}; lib[id].note = v; store("larder-library", lib);
        try { localStorage.setItem("larder-cookbook-" + id, v); } catch (e) { /* fine */ }
        var p = W.setField("cookbook." + id + ".note", v);
        if (p) toast(p);
      });
    }
    if (W) W.paintStatus();
  };

  pages.sunday = function () {
    var key = "larder-ticks-sunday";
    var ticks = load(key, {});
    var items = $$("#timeline > li");
    var delivered = ($("#timeline").getAttribute("data-delivery") || "") < TODAY;
    function paint() {
      var done = 0, now = null;
      items.forEach(function (li) {
        var box = $("input[data-tick]", li), t = box.getAttribute("data-tick");
        var remote = W.remote("tick.card.sunday." + t);
        var auto = delivered && /^on arrival/i.test(li.getAttribute("data-when") || "") && ticks[t] !== false;
        box.checked = remote === true || remote === false ? remote : (t in ticks ? !!ticks[t] : auto);
        if (box.checked) done += 1;
        else if (!now) now = li;
        li.setAttribute("data-state", box.checked ? "done" : "");
        $(".now-pill", li).hidden = true;
      });
      if (now) { now.setAttribute("data-state", "now"); $(".now-pill", now).hidden = false; }
      $("#sun-progress").textContent = done === items.length ? "All " + items.length + " steps done." : done + " of " + items.length + " done." + (now ? " Next: " + $(".time", now).firstChild.textContent.trim() + "." : "");
    }
    items.forEach(function (li) {
      var box = $("input[data-tick]", li);
      box.addEventListener("change", function () {
        ticks[box.getAttribute("data-tick")] = box.checked; store(key, ticks);
        W.setField("tick.card.sunday." + box.getAttribute("data-tick"), box.checked);
        paint();
      });
      $$("a[data-return]", li).forEach(function (a) { a.addEventListener("click", function () { rememberReturn("#" + a.getAttribute("data-return")); }); });
    });
    paint();
    W.onChange(paint);
    W.paintStatus();
    if (location.hash) { var t = $(location.hash); if (t) t.scrollIntoView(); }
  };

  pages.cookbook = function () {
    var lib = load("larder-library", {});
    var list = $("#book");
    var rows = $$("#book > li");
    var rank = { make_again: 0, fine: 1, "": 2, dont_offer: 3 };
    var filters = makeFilters($("[data-filters]"), paint);
    function weekVerdict(id) { var d = W.byRecipe(id); return d ? (W.state.dinners[d.key] || {}).verdict || "" : ""; }
    function mine(id) { return (lib[id] || {}).verdict || weekVerdict(id); }
    function verdictOf(li) { var id = li.getAttribute("data-id"); return mine(id) || li.getAttribute("data-verdict") || ""; }
    function paint() {
      var shown = 0;
      rows.forEach(function (li) {
        var id = li.getAttribute("data-id");
        var row = lib[id] || {};
        var loved = verdictOf(li) === "make_again";
        var practical = (li.getAttribute("data-practical") || "").split(" ").filter(function (p) { return p && p !== "loved"; });
        if (loved) practical.push("loved");
        li.setAttribute("data-practical", practical.join(" "));
        var ok = filters.matches(li);
        li.hidden = !ok;
        if (ok) shown += 1;
        setPressed(li, "data-verdict", row.verdict || weekVerdict(id) || "");
        $("[data-pin]", li).setAttribute("aria-pressed", row.pinned ? "true" : "false");
        $("[data-pin]", li).textContent = row.pinned ? "Pinned for next week" : "Pin for next week";
        var note = $("[data-note]", li);
        if (doc.activeElement !== note) note.value = W.remote("cookbook." + id + ".note") || row.note || "";
        var bits = [];
        var v = mine(id);
        if (v) bits.push("Your rating: " + VERDICT_WORDS[v] + ".");
        if (row.pinned) bits.push("Pinned for next week.");
        $("[data-local-state]", li).textContent = bits.length ? bits.join(" ") + " Larder adds it to the cookbook after the Sunday review." : "";
      });
      $("#book-empty").hidden = shown > 0;
      $("#book-count").textContent = shown + " of " + rows.length + " recipes";
      var sort = $("#book-sort").value;
      rows.slice().sort(function (a, b) {
        if (sort === "name") return a.getAttribute("data-name") < b.getAttribute("data-name") ? -1 : 1;
        if (sort === "recent") return (b.getAttribute("data-last") || "") < (a.getAttribute("data-last") || "") ? -1 : 1;
        var ra = rank[verdictOf(a)], rb = rank[verdictOf(b)];
        return ra - rb || (a.getAttribute("data-name") < b.getAttribute("data-name") ? -1 : 1);
      }).forEach(function (li) { list.appendChild(li); });
      $("#favourites-wrap").hidden = $$("#favourites .fav").length === 0;
    }
    list.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b || b.classList.contains("rate-toggle")) return;
      var li = b.closest("li[data-id]");
      var id = li.getAttribute("data-id");
      var row = lib[id] = lib[id] || {};
      var before = JSON.parse(JSON.stringify(row));
      if (b.hasAttribute("data-verdict")) {
        var v = b.getAttribute("data-verdict");
        row.verdict = mine(id) === v ? "" : v;
        row.history = (row.history || []).concat([{ week: W.data.week, date: TODAY, verdict: row.verdict }]);
        var dinner = W.byRecipe(id);
        if (dinner) { W.dinner(dinner.key).verdict = row.verdict; W.save(); }
      }
      if (b.hasAttribute("data-pin")) row.pinned = !row.pinned;
      store("larder-library", lib);
      paint();
      toast("Saved on this phone.", function () { lib[id] = before; store("larder-library", lib); paint(); });
    });
    list.addEventListener("change", function (e) {
      if (!e.target.matches("[data-note]")) return;
      var id = e.target.closest("li[data-id]").getAttribute("data-id");
      var v = e.target.value.trim();
      lib[id] = lib[id] || {}; lib[id].note = v; store("larder-library", lib);
      var p = W.setField("cookbook." + id + ".note", v);
      toast(p || "Note saved.");
    });
    $$(".rate-toggle", list).forEach(function (b) { bindDisclosure(b); });
    $("#book-sort").addEventListener("change", paint);
    $$("#book a").forEach(function (a) { a.addEventListener("click", function () { rememberReturn(""); }); });
    paint();
    W.onChange(paint);
    W.paintStatus();
  };

  if (W) W.paintStatus();
  if (pages[page]) pages[page]();
})();
