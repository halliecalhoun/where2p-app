(function () {
  "use strict";

  // No-ops on GitHub Pages. Inside the iOS app, Capacitor injects window.Capacitor
  // before this file runs. Plugin calls go through that bridge, so this page does
  // not need a bundler or a copy of @capacitor/core.
  var cap = window.Capacitor;
  var isNative = !!(
    cap &&
    typeof cap.isNativePlatform === "function" &&
    cap.isNativePlatform() &&
    typeof cap.nativePromise === "function"
  );

  var api = {
    isNative: isNative,
    isOnline: typeof navigator === "undefined" ? true : navigator.onLine !== false,
    ready: Promise.resolve(),
    getCurrentPosition: null
  };

  function publish(status) {
    var connected = !status || status.connected !== false;
    api.isOnline = connected;
    window.dispatchEvent(new CustomEvent("where2p-network", {
      detail: { connected: connected }
    }));
  }

  function call(plugin, method, options) {
    return cap.nativePromise(plugin, method, options || {});
  }

  if (!isNative) {
    window.addEventListener("online", function () {
      publish({ connected: true });
    });
    window.addEventListener("offline", function () {
      publish({ connected: false });
    });
    window.Where2PNative = api;
    return;
  }

  api.getCurrentPosition = function (options) {
    return call("Geolocation", "getCurrentPosition", options);
  };

  // "DARK" is Capacitor's name for light (white) status-bar icons.
  call("StatusBar", "setOverlaysWebView", { overlay: true }).catch(function () {});
  call("StatusBar", "setStyle", { style: "DARK" }).catch(function () {});
  call("StatusBar", "setBackgroundColor", { color: "#007c91" }).catch(function () {});

  window.setTimeout(function () {
    call("SplashScreen", "hide", {}).catch(function () {});
  }, 400);

  if (typeof cap.addListener === "function") {
    cap.addListener("Network", "networkStatusChange", publish);
  }

  api.ready = new Promise(function (resolve) {
    var settled = false;
    function finish() {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    }
    window.setTimeout(finish, 1500);
    call("Network", "getStatus").then(function (status) {
      publish(status);
      finish();
    }).catch(finish);
  });

  document.addEventListener("click", function (event) {
    var link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    if (!link) {
      return;
    }
    var raw = link.getAttribute("href");
    if (!raw || raw.charAt(0) === "#") {
      return;
    }
    var url;
    try {
      url = new URL(link.href, window.location.href);
    } catch (error) {
      return;
    }
    if (url.origin === window.location.origin) {
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    call("Browser", "open", {
      url: url.href,
      presentationStyle: "fullscreen",
      toolbarColor: "#007c91"
    }).catch(function () {
      window.open(url.href, "_blank", "noopener,noreferrer");
    });
  }, true);

  window.Where2PNative = api;
})();
