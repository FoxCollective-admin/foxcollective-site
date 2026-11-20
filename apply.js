/* The Fox Collective careers form.
 *
 * With FOX_APPLY_ENDPOINT empty (config.js) this file does nothing and every Apply
 * button keeps opening the Google Form.
 *
 * With it set:
 *   1. "start": the answers go to the Apps Script web app. It checks them and opens a
 *      Google Drive upload session for the video, then hands back that session address.
 *   2. The browser sends the video straight to Google Drive in pieces (so a 200 MB phone
 *      video never has to pass through Apps Script), showing progress.
 *   3. "finish": the web app checks the video landed and writes the row in the Sheet.
 */
(function () {
  "use strict";
  var ENDPOINT = (typeof FOX_APPLY_ENDPOINT === "string" ? FOX_APPLY_ENDPOINT : "").trim();
  var MAX_BYTES = 300 * 1024 * 1024;
  var UNIT = 256 * 1024;                                   /* Drive wants pieces in multiples of 256 KB */
  var CHUNK = (window.FOX_APPLY_CHUNK > 0 ? Math.max(1, Math.round(window.FOX_APPLY_CHUNK / UNIT)) : 32) * UNIT;   /* 8 MB */
  var VIDEO_EXT = /\.(mp4|mov|m4v|webm|3gp|3g2|avi|mkv|mpg|mpeg|wmv|hevc)$/i;
  var $ = function (id) { return document.getElementById(id); };
  if (!ENDPOINT || !/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)/.test(ENDPOINT)) return;

  var section = $("apply"), form = $("apply-form");
  if (!section || !form) return;
  section.hidden = false;
  document.querySelectorAll("a.js-apply").forEach(function (a) { a.setAttribute("href", "#apply"); });
  var sticky = $("sticky");
  if (sticky && "IntersectionObserver" in window) {
    new IntersectionObserver(function (e) { sticky.style.visibility = e[0].isIntersecting ? "hidden" : ""; }, { threshold: 0.05 }).observe(section);
  }

  var fileInput = $("a-video"), ref = $("a-ref"), noref = $("a-noref");
  var busy = false, file = null, session = null;

  /* ---------- small helpers ---------- */
  function fld(name) { return form.querySelector('[data-f="' + name + '"]'); }
  function setErr(name, msg) {
    var box = fld(name), old = box.querySelector(".err");
    if (old) old.remove();
    box.classList.toggle("bad", !!msg);
    if (msg) { var p = document.createElement("p"); p.className = "err"; p.textContent = msg; box.appendChild(p); }
  }
  function setStop(name, msg) {
    var box = fld(name), old = box.querySelector(".stop");
    if (old) old.remove();
    if (msg) { var p = document.createElement("p"); p.className = "stop"; p.setAttribute("role", "alert"); p.textContent = msg; box.appendChild(p); }
  }
  function radio(name) { var r = form.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : ""; }
  function size(n) { return n >= 1048576 ? (n / 1048576).toFixed(n >= 10485760 ? 0 : 1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function isVideo(f) { return /^video\//i.test(f.type || "") || (!f.type && VIDEO_EXT.test(f.name)) || VIDEO_EXT.test(f.name); }

  function read() {
    return {
      referrer: noref.checked ? "No one" : ref.value.trim().replace(/\s+/g, " "),
      availability: Array.prototype.map.call(form.querySelectorAll('input[name="availability"]:checked'), function (c) { return c.value; }),
      commute: radio("commute"),
      adult: radio("adult"),
      name: $("a-name").value.trim().replace(/\s+/g, " "),
      phone: $("a-phone").value.trim(),
      email: $("a-email").value.trim(),
      website: $("a-website").value
    };
  }
  /* The same rules run again on the server (Code.gs). */
  function validate(d) {
    var e = {};
    if (!noref.checked && d.referrer.split(" ").filter(Boolean).length < 2) e.referrer = "Enter their first and last name, or tick No one referred me.";
    if (!d.availability.length) e.availability = "Pick at least one time slot.";
    if (!d.commute) e.commute = "Choose Yes or No.";
    if (!d.adult) e.adult = "Choose Yes or No.";
    if (d.name.split(" ").filter(Boolean).length < 2) e.name = "Enter your first and last name.";
    if (d.phone.replace(/\D/g, "").length < 10) e.phone = "Enter a phone number with area code.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) e.email = "Enter a valid email address.";
    if (!file) e.video = "Add your 60-second video.";
    else if (!isVideo(file)) e.video = "That file is not a video. Choose an MP4 or MOV.";
    else if (file.size > MAX_BYTES) e.video = "That video is " + size(file.size) + ". The limit is 300 MB. Try a shorter take or a lower camera quality.";
    else if (file.size < 1) e.video = "That file is empty. Choose your video again.";
    return e;
  }
  var NAMES = ["referrer", "availability", "commute", "adult", "name", "phone", "email", "video"];
  function show(errors) {
    NAMES.forEach(function (n) { setErr(n, errors[n] || ""); });
    var first = NAMES.filter(function (n) { return errors[n]; })[0];
    var sum = $("a-summary");
    sum.hidden = !first;
    if (first) {
      sum.textContent = "A few things need fixing before this can send.";
      var target = fld(first).querySelector("input");
      fld(first).scrollIntoView({ block: "center" });
      if (target) target.focus({ preventScroll: true });
    }
    return !first;
  }
  /* The must-pass questions: a No stops the application with a clear reason. */
  function gate() {
    var c = radio("commute") === "No", a = radio("adult") === "No";
    setStop("commute", c ? "This job is in person at our studio in Jefferson Park, so we can't move forward without a way to get there." : "");
    setStop("adult", a ? "You need to be 18 or older for this job." : "");
    $("a-submit").disabled = c || a || busy;
    return !(c || a);
  }

  /* ---------- wiring ---------- */
  noref.addEventListener("change", function () {
    ref.disabled = noref.checked;
    if (noref.checked) { ref.value = ""; setErr("referrer", ""); }
  });
  form.addEventListener("input", function (ev) {
    var box = ev.target.closest ? ev.target.closest("[data-f]") : null;
    if (box && box.classList.contains("bad") && ev.target.type !== "file") setErr(box.getAttribute("data-f"), "");
    if (!form.querySelector(".fld.bad")) $("a-summary").hidden = true;
  });
  form.addEventListener("change", function (ev) {
    if (ev.target.name === "commute" || ev.target.name === "adult") { setErr(ev.target.name, ""); gate(); }
    if (ev.target.name === "availability") setErr("availability", "");
    if (!form.querySelector(".fld.bad")) $("a-summary").hidden = true;
  });
  function pick(f) {
    file = f || null; session = null;
    $("a-picked").hidden = !file;
    $("a-drop").hidden = !!file;
    if (file) {
      $("a-fname").textContent = file.name;
      $("a-fsize").textContent = size(file.size);
      var e = validate(read());
      setErr("video", e.video || "");
    }
  }
  fileInput.addEventListener("change", function () { pick(fileInput.files[0]); });
  $("a-clear").addEventListener("click", function () { if (busy) return; fileInput.value = ""; pick(null); fileInput.click(); });
  var drop = $("a-drop");
  ["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
  ["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
  drop.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]); });

  /* ---------- talking to the web app ---------- */
  /* text/plain keeps the browser from sending a preflight request, which Apps Script cannot answer. */
  function call(payload) {
    return fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload), redirect: "follow" })
      .then(function (r) { if (!r.ok) throw new Error("server " + r.status); return r.json(); });
  }
  function wait(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

  function put(url, body, range, onProgress) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open("PUT", url, true);
      x.setRequestHeader("Content-Range", range);
      if (onProgress) x.upload.onprogress = function (e) { if (e.lengthComputable) onProgress(e.loaded); };
      x.onload = function () {
        var got = null;
        try { got = x.getResponseHeader("Range"); } catch (err) { got = null; }
        resolve({ status: x.status, text: x.responseText, range: got });
      };
      x.onerror = function () { reject(new Error("network")); };
      x.ontimeout = function () { reject(new Error("timeout")); };
      x.timeout = 10 * 60 * 1000;
      x.send(body);
    });
  }
  function fileId(text) { try { return JSON.parse(text).id || ""; } catch (e) { return ""; } }

  /* Sends the file in pieces. Resolves with the Drive file id ("" if Drive did not say). */
  function upload(url, f, onProgress) {
    var total = f.size, offset = 0, tries = 0;
    function ask() {            /* where did Drive get to? */
      return put(url, null, "bytes */" + total).then(function (r) {
        if (r.status === 200 || r.status === 201) return { done: true, id: fileId(r.text) };
        if (r.status === 308) {
          var m = /bytes=0-(\d+)/.exec(r.range || "");
          if (m) offset = Number(m[1]) + 1;
          else if (r.range === null || r.range === "") { /* header hidden or nothing stored: keep our own count */ }
          return { done: false };
        }
        var gone = new Error("session " + r.status); gone.fatal = true; throw gone;
      });
    }
    function step() {
      if (offset >= total) return ask().then(function (s) { if (s.done) return s.id; throw new Error("not finished"); });
      var end = Math.min(offset + CHUNK, total);
      var base = offset;
      return put(url, f.slice(offset, end), "bytes " + offset + "-" + (end - 1) + "/" + total, function (sent) { onProgress(base + sent, total); })
        .then(function (r) {
          if (r.status === 200 || r.status === 201) { onProgress(total, total); return fileId(r.text); }
          if (r.status === 308) {
            var m = /bytes=0-(\d+)/.exec(r.range || "");
            offset = m ? Number(m[1]) + 1 : end;
            tries = 0; onProgress(offset, total);
            return step();
          }
          if (r.status >= 500 || r.status === 429 || r.status === 403) throw new Error("busy " + r.status);
          var bad = new Error("refused " + r.status); bad.fatal = true; throw bad;
        })
        .catch(function (err) {
          if (err.fatal || ++tries > 5) throw err;
          return wait(Math.min(1000 * Math.pow(2, tries - 1), 15000)).then(ask).then(function (s) { return s.done ? s.id : step(); },
            function (e2) { if (e2.fatal) throw e2; return step(); });
        });
    }
    return step();
  }

  function progress(stage, done, total) {
    var pct = total ? Math.floor(done / total * 100) : 0;
    $("a-fill").style.width = pct + "%";
    $("a-bar").setAttribute("aria-valuenow", String(pct));
    $("a-pct").textContent = pct + "%";
    $("a-stage").textContent = stage + (total ? " (" + size(done) + " of " + size(total) + ")" : "");
  }
  function fail(msg) {
    busy = false;
    $("a-prog").hidden = true;
    $("a-submit").hidden = true;
    $("a-fail").hidden = false;
    if (msg) $("a-fail-text").textContent = msg;
    $("a-retry").focus();
  }
  function lock(on) {
    Array.prototype.forEach.call(form.querySelectorAll("input, button[type=submit]"), function (i) { if (i.id !== "a-website") i.disabled = on; });
    if (!on) { ref.disabled = noref.checked; gate(); }
  }

  function send() {
    var d = read();
    if (!show(validate(d)) || !gate()) return;
    busy = true; lock(true);
    $("a-fail").hidden = true; $("a-submit").hidden = true; $("a-prog").hidden = false;
    progress("Getting ready", 0, 0);
    var meta = { name: file.name, type: file.type || "video/mp4", size: file.size };
    var started = session ? Promise.resolve(session) : call({ action: "start", fields: d, file: meta, origin: location.origin, page: location.href.split("#")[0].split("?")[0] });
    started.then(function (s) {
      if (!s || !s.ok || !s.uploadUrl) {
        var e = new Error((s && s.error) || "start"); e.user = s && s.error; e.fields = s && s.fields; throw e;
      }
      session = s;
      return upload(s.uploadUrl, file, function (done, total) { progress("Uploading your video", done, total); });
    }).then(function (id) {
      progress("Finishing up", file.size, file.size);
      return call({ action: "finish", token: session.token, fileId: id });
    }).then(function (r) {
      if (!r || !r.ok) { var e = new Error((r && r.error) || "finish"); e.user = r && r.error; throw e; }
      $("apply-form-wrap").hidden = true;
      $("apply-done").hidden = false;
      $("done-name").textContent = d.name.split(" ")[0];
      section.scrollIntoView({ block: "start" });
      $("done-title").focus({ preventScroll: true });
      if (sticky) sticky.hidden = true;
    }).catch(function (err) {
      busy = false; lock(false);
      if (err && err.fatal) session = null;                 /* the upload session is gone: start a new one next time */
      if (err && err.fields) {                              /* the server found a problem with an answer */
        $("a-prog").hidden = true; $("a-submit").hidden = false; session = null;
        show(err.fields); gate();
        return;
      }
      fail(err && err.user ? err.user : "Your answers are still here. Check your connection and try again.");
    });
  }
  form.addEventListener("submit", function (e) { e.preventDefault(); if (!busy) send(); });
  $("a-retry").addEventListener("click", function () { $("a-fail").hidden = true; $("a-submit").hidden = false; if (!busy) send(); });
  window.addEventListener("beforeunload", function (e) { if (busy) { e.preventDefault(); e.returnValue = ""; } });
  gate();
})();
