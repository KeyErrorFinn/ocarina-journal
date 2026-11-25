// The pairing page: the only thing a screen is sent before it has paired. Step one asks for the pairing code, step two
// for the 4-digit code. Nothing from the app itself is on this page.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var code = "";
  var wait = 0;
  var busy = false;
  var PAUSE = 2; // seconds between tries, so the buttons can't be hammered (the app limits tries too)

  function clean(v) { return v.replace(/[^a-z0-9]/gi, "").toUpperCase(); }
  function inStepTwo() { return !$("s2").hidden; }
  function label(button, idle) { return busy ? "Checking…" : wait > 0 ? "Wait " + wait + " s" : idle; }
  function refresh() {
    var free = !busy && wait <= 0;
    $("next").disabled = !(free && clean($("code").value).length === 8);
    $("go").disabled = !(free && $("pin").value.length === 4);
    $("next").textContent = label($("next"), "Next");
    $("go").textContent = label($("go"), "Connect");
  }
  function fail(message, retryAfter) {
    $("err").textContent = message;
    wait = retryAfter || PAUSE;
    refresh();
    var t = setInterval(function () {
      wait -= 1;
      if (wait <= 0) { wait = 0; clearInterval(t); }
      refresh();
    }, 1000);
  }
  function send(body, wrong, done) {
    busy = true;
    $("err").textContent = "";
    refresh();
    fetch("/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin"
    }).then(function (res) {
      busy = false;
      if (res.ok) { refresh(); done(); return; }
      if (res.status === 429) {
        var n = Number(res.headers.get("Retry-After")) || 60;
        fail("Too many tries. Wait " + n + " seconds.", n);
      } else {
        fail(wrong);
      }
    }).catch(function () {
      busy = false;
      fail("Couldn't reach the app. Is it still running?");
    });
  }
  function stepTwo() {
    $("s1").hidden = true;
    $("s2").hidden = false;
    $("pin").value = "";
    $("pin").focus();
    refresh();
  }
  function submitCode() {
    if ($("next").disabled) return;
    code = clean($("code").value);
    send({ code: code }, "That pairing code isn't right.", stepTwo);
  }
  function submitPin() {
    if ($("go").disabled) return;
    send({ code: code, pin: $("pin").value }, "That 4-digit code isn't right. It changes every minute, so check the app for the new one.", function () {
      location.reload();
    });
    $("pin").value = "";
  }

  $("code").addEventListener("input", function () { $("code").value = $("code").value.toUpperCase(); refresh(); });
  $("code").addEventListener("keydown", function (e) { if (e.key === "Enter") submitCode(); });
  $("pin").addEventListener("input", function () { $("pin").value = $("pin").value.replace(/\D/g, "").slice(0, 4); refresh(); });
  $("pin").addEventListener("keydown", function (e) { if (e.key === "Enter") submitPin(); });
  $("next").addEventListener("click", submitCode);
  $("go").addEventListener("click", submitPin);
  $("again").addEventListener("click", function () {
    $("s2").hidden = true;
    $("s1").hidden = false;
    $("err").textContent = "";
    $("code").focus();
    refresh();
  });

  // The address the QR code opens carries the pairing code. Use it once and take it out of the address bar, which
  // skips the first step.
  var given = new URLSearchParams(location.search).get("code");
  if (given) {
    history.replaceState(null, "", location.pathname + location.hash);
    $("code").value = given.toUpperCase();
    refresh();
    submitCode();
  }
  refresh();
})();
