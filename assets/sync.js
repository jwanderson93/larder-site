/* Household sync for the week page, the shop list and the cards.
   The same rules live in sync/src/schema.ts and src/larder/sync_schema.py.
   Loaded only when sync.base_url is set. */
(function (root) {
  var MAX_NOTE = 160;
  var ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$/;
  var AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  var VERDICTS = { make_again: 1, fine: 1, dont_offer: 1 };
  var MOVES = { in: 1, out: 1, used: 1 };
  var SKIP_TO = { freezer: 1, tomorrow: 1, leave: 1 };
  var PICKS = { chosen: 1, passed: 1 };
  var EMAIL = /\b[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]*[A-Za-z][A-Za-z0-9-]*\.)+[A-Za-z]{2,}\b/;
  var POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}\b/;
  var PHONE = /(?:\+44\s?|0)(?:\d[\s()-]?){9,12}\d/;
  var FLAT = /\bflat\s+\d+[a-zA-Z]?\b/i;
  var ORDER_NO = /\border\s*(?:number|no\.?|id|#)\s*[:#-]?\s*[A-Z0-9][A-Z0-9-]{4,}/i;
  var LOYALTY = /\bloyalty\s*(?:id|number|card)\s*[:#-]?\s*[A-Z0-9-]*\d[A-Z0-9-]*/i;
  function banned(value) {
    var phrases = [
      ["not yet", " ", "introduced"],
      ["not", " ", "introduced"],
      ["yet to be", " ", "introduced"],
      ["have not been", " ", "introduced"],
      ["has not been", " ", "introduced"],
      ["haven't been", " ", "introduced"],
      ["hasn't been", " ", "introduced"],
      ["all", "", "ergen"],
      ["always", " ", "off"],
      ["off his plate as", " ", "always"],
      ["not yet", "", ":"]
    ];
    var lower = value.toLowerCase();
    for (var i = 0; i < phrases.length; i += 1) {
      if (lower.indexOf(phrases[i].join("")) !== -1) return true;
    }
    return false;
  }

  function idOk(value) { return ID.test(value); }

  function noteOk(value) {
    if (typeof value !== "string" || value.length > MAX_NOTE) return "That note can't be saved.";
    if (/[\r\n]/.test(value) || value.indexOf("://") !== -1) return "That note can't be saved.";
    if (EMAIL.test(value) || POSTCODE.test(value) || PHONE.test(value) || FLAT.test(value)) return "That note can't be saved.";
    if (ORDER_NO.test(value) || LOYALTY.test(value)) return "That note can't be saved.";
    if (banned(value)) return "That note can't be saved.";
    return null;
  }

  function validateValue(key, value) {
    if (key === "order") {
      if (!Array.isArray(value) || value.length < 1 || value.length > 21) return "The order can't be saved.";
      var seen = {};
      for (var i = 0; i < value.length; i += 1) {
        if (typeof value[i] !== "string" || !idOk(value[i]) || seen[value[i]]) return "The order can't be saved.";
        seen[value[i]] = 1;
      }
      return null;
    }
    if (key === "by") return value === "joe" || value === "lotte" ? null : "Say who with the Joe or Lotte button.";
    if (key === "missing") return noteOk(value);
    if (key === "late") return value === "after 7pm" ? null : "That note can't be saved.";
    var parts = key.split(".");
    if (parts[0] === "dinner" && parts.length === 3 && idOk(parts[1])) {
      if (parts[2] === "status") return value === "cooked" || value === "skipped" ? null : "That can't be saved.";
      if (parts[2] === "verdict") return VERDICTS[value] ? null : "That can't be saved.";
      if (parts[2] === "note") return noteOk(value);
      if (parts[2] === "jude_left" || parts[2] === "short") return typeof value === "boolean" ? null : "That can't be saved.";
      if (parts[2] === "skip_to") return SKIP_TO[value] ? null : "That can't be saved.";
    }
    if (parts[0] === "pick" && parts.length === 2 && idOk(parts[1])) return PICKS[value] ? null : "That can't be saved.";
    if (parts[0] === "tick" && parts[1] === "shop" && parts.length === 3 && idOk(parts[2])) {
      return typeof value === "boolean" ? null : "That can't be saved.";
    }
    if (parts[0] === "tick" && parts[1] === "card" && parts.length === 4 && idOk(parts[2]) && idOk(parts[3])) {
      return typeof value === "boolean" ? null : "That can't be saved.";
    }
    if (parts[0] === "cookbook" && parts.length === 3 && parts[2] === "note" && idOk(parts[1])) return noteOk(value);
    if (parts[0] === "freezer" && parts.length === 3 && idOk(parts[1])) {
      if (parts[2] === "move") return MOVES[value] ? null : "That can't be saved.";
      if (parts[2] === "note") return noteOk(value);
      if (parts[2] === "portions") return value === (value | 0) && value >= 0 && value <= 40 ? null : "That can't be saved.";
    }
    return "That can't be saved.";
  }

  function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function stamp(ms) {
    return new Date(ms).toISOString();
  }

  function storageKey(week) { return "larder-sync-fields-" + week; }
  function dirtyKey(week) { return "larder-sync-dirty-" + week; }

  function readStored(storage, week) {
    try { return JSON.parse(storage.getItem(storageKey(week)) || "{}"); } catch (e) { return {}; }
  }

  function statusText(mode, saved) {
    if (mode === "synced") return saved ? "Saved on this phone. Synced." : "Synced.";
    return saved ? "Saved on this phone. Waiting to sync." : "Waiting to sync.";
  }

  function createClient(options) {
    var week = options.week;
    var storage = options.storage;
    var fetchImpl = options.fetch || root.fetch.bind(root);
    var now = options.now || function () { return Date.now(); };
    var online = options.online || function () { return root.navigator ? root.navigator.onLine !== false : true; };
    var onUpdate = options.onUpdate || function () {};
    var delay = options.delay == null ? 1200 : options.delay;
    var fields = readStored(storage, week);
    var dirty = {};
    try { dirty = JSON.parse(storage.getItem(dirtyKey(week)) || "{}"); } catch (e) { dirty = {}; }
    var mode = "waiting";
    var saved = false;
    var timer = null;
    var inflight = null;
    var retries = 0;

    function persist() {
      storage.setItem(storageKey(week), JSON.stringify(fields));
      storage.setItem(dirtyKey(week), JSON.stringify(dirty));
    }

    function mergeRemote(remote) {
      if (!remote) return;
      Object.keys(remote).forEach(function (key) {
        var incoming = remote[key];
        if (!incoming || typeof incoming.at !== "string") return;
        var local = fields[key];
        if (!local || incoming.at > local.at) {
          fields[key] = { value: incoming.value, at: incoming.at };
          delete dirty[key];
        } else if (local.at > incoming.at) {
          dirty[key] = local.at;
        }
      });
      persist();
    }

    function send(method, patch) {
      var headers = { Accept: "application/json", Authorization: "Bearer " + options.householdKey };
      var init = { method: method, headers: headers, cache: "no-store" };
      if (patch) {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify({ fields: patch });
      }
      return fetchImpl(options.baseUrl.replace(/\/$/, "") + "/v1/weeks/" + week, init).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          return { ok: response.ok, status: response.status, body: body || {} };
        });
      });
    }

    function flush() {
      if (inflight) return inflight;
      if (!online()) {
        mode = "waiting";
        onUpdate();
        return Promise.resolve();
      }
      var patch = {};
      Object.keys(dirty).forEach(function (key) {
        if (fields[key] && fields[key].at === dirty[key]) patch[key] = fields[key];
      });
      var names = Object.keys(patch);
      if (!names.length) {
        mode = "synced";
        onUpdate();
        return Promise.resolve();
      }
      mode = "waiting";
      var sent = JSON.parse(JSON.stringify(patch));
      inflight = send("PATCH", patch).then(function (result) {
        if (result.body && result.body.fields) mergeRemote(result.body.fields);
        if (result.status === 429 && retries < 4) {
          retries += 1;
          var wait = Math.max(1, result.body.retry_after || 1) * 1000;
          return new Promise(function (resolve) { setTimeout(resolve, wait); }).then(function () {
            inflight = null;
            return flush();
          });
        }
        retries = 0;
        if (!result.ok) throw new Error("wait");
        names.forEach(function (key) {
          if (dirty[key] === sent[key].at && fields[key] && fields[key].at === sent[key].at) delete dirty[key];
        });
        mode = Object.keys(dirty).length ? "waiting" : "synced";
        persist();
        onUpdate();
      }).catch(function () {
        mode = "waiting";
        onUpdate();
      }).then(function () {
        inflight = null;
      });
      return inflight;
    }

    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { timer = null; flush(); }, delay);
    }

    function setField(key, value) {
      var problem = validateValue(key, value);
      if (problem) return problem;
      var current = fields[key];
      if (current && same(current.value, value)) return null;
      var at = stamp(now());
      if (!AT.test(at)) return "That can't be saved.";
      fields[key] = { value: value, at: at };
      dirty[key] = at;
      saved = true;
      mode = "waiting";
      persist();
      schedule();
      onUpdate();
      return null;
    }

    function setFields(map) {
      var problem = null;
      Object.keys(map).forEach(function (key) {
        var result = setField(key, map[key]);
        if (result) problem = result;
      });
      return problem;
    }

    function pull() {
      if (!online()) {
        mode = Object.keys(dirty).length ? "waiting" : mode;
        onUpdate();
        return Promise.resolve();
      }
      return send("GET").then(function (result) {
        if (!result.ok) throw new Error("wait");
        mergeRemote(result.body.fields || {});
        mode = Object.keys(dirty).length ? "waiting" : "synced";
        onUpdate();
        if (Object.keys(dirty).length) return flush();
      }).catch(function () {
        mode = "waiting";
        onUpdate();
      });
    }

    function start(seed) {
      if (seed) {
        Object.keys(seed).forEach(function (key) {
          if (!fields[key]) setField(key, seed[key]);
        });
      }
      if (options.bindEvents !== false && root.addEventListener) {
        root.addEventListener("online", function () { flush(); });
        if (root.document) {
          root.document.addEventListener("visibilitychange", function () {
            if (root.document.visibilityState === "hidden") flush();
            if (root.document.visibilityState === "visible") pull();
          });
        }
      }
      var poll = options.poll == null ? 15000 : options.poll;
      if (poll > 0 && options.bindEvents !== false) {
        setInterval(function () {
          if (root.document && root.document.visibilityState === "hidden") return;
          pull();
        }, poll);
      }
      return pull();
    }

    return {
      setField: setField,
      setFields: setFields,
      flush: flush,
      pull: pull,
      start: start,
      fields: function () { return fields; },
      status: function () { return mode; },
      statusText: function () { return statusText(mode, saved); },
      problem: null
    };
  }

  root.LarderSync = {
    createClient: createClient,
    validateValue: validateValue,
    statusText: statusText,
    readStored: readStored,
    same: same
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
