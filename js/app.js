(function () {
  "use strict";

  var REFUGE_ENDPOINT = "https://www.refugerestrooms.org/api/v1/restrooms/by_location";
  var GEOCODE_ENDPOINT = "https://photon.komoot.io/api/";
  var STORAGE_KEY = "where2p:last-query";
  var HIDDEN_REVIEWS_KEY = "where2p:hidden-reviews";
  var BLOCKED_NAMES_KEY = "where2p:blocked-names";

  var map = null;
  var restroomLayer = null;
  var originMarker = null;
  var originIcon = null;
  var restroomIcon = null;
  var markerById = {};
  var database = null;
  var requestId = 0;
  var busyId = 0;
  var activeReview = null;
  var loadedReviews = { restroomId: "", entries: [] };
  var hiddenReviewIds = readJsonList(HIDDEN_REVIEWS_KEY);
  var blockedNames = readJsonList(BLOCKED_NAMES_KEY);
  var lastFocus = null;
  var online = navigator.onLine !== false;

  function init() {
    bindSkipLink();
    initMap();
    initFirebase();
    bindUi();
    bindNetwork();
    setListMessage("Restrooms will show up here after you share your location or search.");
    var ready = window.Where2PNative && window.Where2PNative.ready;
    if (ready && typeof ready.then === "function") {
      ready.then(restoreOrLocate);
    } else {
      restoreOrLocate();
    }
    window.addEventListener("resize", function () {
      if (map) {
        map.invalidateSize();
      }
    });
  }

  // Nothing in this file focuses the skip link. WKWebView can still focus the
  // first link on launch, and some engines treat that as :focus-visible, so
  // the pill stays clipped unless Tab moved focus here. Drop that launch focus.
  function bindSkipLink() {
    var skip = document.querySelector(".skip-link");
    if (!skip) {
      return;
    }
    var fromTab = false;
    var blockAutofocus = true;
    window.setTimeout(function () {
      blockAutofocus = false;
    }, 1000);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Tab") {
        fromTab = true;
        blockAutofocus = false;
      }
    }, true);
    function dropLaunchFocus() {
      skip.classList.remove("is-keyboard-focus");
      // blur() alone leaves the skip link as the next Tab start, so the
      // first real Tab would skip past it. Park focus on the body instead.
      if (!document.body.hasAttribute("tabindex")) {
        document.body.setAttribute("tabindex", "-1");
        document.body.focus();
        document.body.removeAttribute("tabindex");
      } else {
        skip.blur();
      }
    }
    document.addEventListener("focusin", function (event) {
      if (event.target === skip && fromTab) {
        skip.classList.add("is-keyboard-focus");
      } else if (event.target === skip && blockAutofocus) {
        dropLaunchFocus();
      } else if (event.target !== skip) {
        skip.classList.remove("is-keyboard-focus");
      }
      fromTab = false;
    }, true);
    skip.addEventListener("blur", function () {
      skip.classList.remove("is-keyboard-focus");
    });
    if (document.activeElement === skip) {
      dropLaunchFocus();
    }
  }

  function initMap() {
    if (!window.L) {
      return;
    }

    map = L.map("map", { scrollWheelZoom: true }).setView([39.5, -98.35], 4);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    restroomLayer = L.layerGroup().addTo(map);
    originIcon = L.divIcon({
      className: "pin pin-origin",
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      popupAnchor: [0, -12]
    });
    restroomIcon = L.divIcon({
      className: "pin pin-restroom",
      iconSize: [18, 18],
      iconAnchor: [9, 9],
      popupAnchor: [0, -10]
    });
  }

  function initFirebase() {
    var config = window.WHERE2P_CONFIG && window.WHERE2P_CONFIG.firebase;
    if (!config || !window.firebase || !config.databaseURL) {
      return;
    }
    if (!config.apiKey || config.apiKey.indexOf("YOUR_") === 0) {
      return;
    }

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }
      database = firebase.database();
    } catch (error) {
      database = null;
    }
  }

  function bindUi() {
    document.getElementById("search-form").addEventListener("submit", function (event) {
      event.preventDefault();
      var query = document.getElementById("place-query").value.trim();
      if (!query) {
        setStatus("Enter a city or address to search.");
        return;
      }
      searchPlace(query);
    });

    document.getElementById("locate").addEventListener("click", locate);

    document.querySelector(".suggestions").addEventListener("click", function (event) {
      var chip = event.target.closest(".chip");
      if (!chip) {
        return;
      }
      document.getElementById("place-query").value = chip.getAttribute("data-query");
      searchPlace(chip.getAttribute("data-query"));
    });

    document.getElementById("results-list").addEventListener("click", function (event) {
      var card = event.target.closest(".restroom-card");
      if (!card) {
        return;
      }
      if (event.target.closest("[data-action='reviews']")) {
        openReviews(card.getAttribute("data-id"), card.getAttribute("data-name"));
        return;
      }
      if (event.target.closest("[data-action='add']")) {
        openAddReview(card.getAttribute("data-id"), card.getAttribute("data-name"));
        return;
      }
      focusPlace(card.getAttribute("data-id"));
    });

    document.getElementById("review-form").addEventListener("submit", submitReview);
    document.getElementById("reviews-list").addEventListener("click", onReviewClick);
    document.getElementById("reviews-list").addEventListener("submit", onReportSubmit);
    document.getElementById("reset-hidden").addEventListener("click", resetHiddenReviews);

    document.querySelectorAll("[data-close]").forEach(function (button) {
      button.addEventListener("click", function () {
        closeModal(button.getAttribute("data-close"));
      });
    });

    document.querySelectorAll(".modal").forEach(function (modal) {
      modal.addEventListener("click", function (event) {
        if (event.target === modal) {
          closeModal(modal.id);
        }
      });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeModal("review-modal");
        closeModal("reviews-modal");
      }
    });
  }

  function restoreOrLocate() {
    var saved = "";
    try {
      saved = sessionStorage.getItem(STORAGE_KEY) || "";
    } catch (error) {
      saved = "";
    }

    if (saved) {
      document.getElementById("place-query").value = saved;
      searchPlace(saved);
      return;
    }

    locate();
  }

  function locate() {
    var id = ++requestId;
    if (!canLocate()) {
      setStatus("This browser can't share location. Search for a city or address instead.");
      return;
    }
    if (!isOnline()) {
      setStatus("You're offline. Reconnect, then try location again.");
      return;
    }

    setStatus("Finding your location…");
    setOriginLegend("You");

    requestPosition().then(function (position) {
      if (id !== requestId) {
        return;
      }
      var coords = position && position.coords;
      if (!coords || !isFinite(coords.latitude) || !isFinite(coords.longitude)) {
        setStatus(locationErrorMessage({ code: 2 }));
        return;
      }
      setBusy(true, id);
      loadRestrooms(coords.latitude, coords.longitude, "you", id);
    }).catch(function (error) {
      if (id !== requestId) {
        return;
      }
      setStatus(locationErrorMessage(error));
      if (!document.querySelector(".restroom-card")) {
        setListMessage("Search for a city or address and restrooms will be listed here.");
      }
    });
  }

  function canLocate() {
    var native = window.Where2PNative;
    if (native && native.isNative && typeof native.getCurrentPosition === "function") {
      return true;
    }
    return !!navigator.geolocation;
  }

  function requestPosition() {
    var native = window.Where2PNative;
    var options = {
      enableHighAccuracy: false,
      timeout: 20000,
      maximumAge: 60000
    };
    if (native && native.isNative && typeof native.getCurrentPosition === "function") {
      return native.getCurrentPosition(options);
    }
    return new Promise(function (resolve, reject) {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  }

  function locationErrorMessage(error) {
    var native = window.Where2PNative && window.Where2PNative.isNative;
    var code = error && error.code;
    var message = error && error.message ? String(error.message) : "";
    var blob = String(code == null ? "" : code) + " " + message;
    var lower = blob.toLowerCase();
    if (code === "unsupported" || lower.indexOf("not implemented") !== -1) {
      return "This device can't share location. Search for a city or address instead.";
    }
    if (lower.indexOf("not enabled") !== -1 || lower.indexOf("disabled") !== -1 || lower.indexOf("0007") !== -1) {
      return "Location services are turned off. Search for a city or address instead.";
    }
    if (code === 1 || lower.indexOf("denied") !== -1 || lower.indexOf("restricted") !== -1 || lower.indexOf("0003") !== -1 || lower.indexOf("0008") !== -1) {
      return native
        ? "Location is blocked. Allow location for Where2P in Settings, or search for a city or address."
        : "Location is blocked or unavailable. Search for a city or address instead.";
    }
    if (code === 3 || lower.indexOf("timeout") !== -1 || lower.indexOf("0010") !== -1) {
      return "Couldn't get a location in time. Search for a city or address instead.";
    }
    return "Location is unavailable. Search for a city or address instead.";
  }

  function searchPlace(query) {
    var id = ++requestId;
    if (!isOnline()) {
      setStatus("You're offline. Reconnect, then try that search again.");
      return;
    }
    setBusy(true, id);
    setStatus("Looking up " + query + "…");
    setOriginLegend("Searched spot");

    fetchJson(GEOCODE_ENDPOINT + "?q=" + encodeURIComponent(query) + "&limit=1&lang=en")
      .then(function (data) {
        if (id !== requestId) {
          setBusy(false, id);
          return null;
        }
        var feature = data.features && data.features[0];
        if (!feature || !feature.geometry) {
          setBusy(false, id);
          setStatus("No place matched \"" + query + "\". Try a city or a street address.");
          return null;
        }
        try {
          sessionStorage.setItem(STORAGE_KEY, query);
        } catch (error) {
          // Ignore storage failures. Search still works.
        }
        var coordinates = feature.geometry.coordinates || [];
        var lat = Number(coordinates[1]);
        var lng = Number(coordinates[0]);
        if (!isFinite(lat) || !isFinite(lng)) {
          setBusy(false, id);
          setStatus("No place matched \"" + query + "\". Try a city or a street address.");
          return null;
        }
        return loadRestrooms(lat, lng, placeLabel(feature.properties, query), id);
      })
      .catch(function () {
        if (id !== requestId) {
          setBusy(false, id);
          return;
        }
        setBusy(false, id);
        setStatus(isOnline()
          ? "That search didn't go through. Check your connection and try again."
          : "You're offline. Reconnect, then try that search again.");
      });
  }

  function loadRestrooms(lat, lng, label, id) {
    var where = label === "you" ? "you" : label;
    setStatus("Finding restrooms near " + where + "…");
    showOrigin(lat, lng, label === "you" ? "You are here" : label);

    var url = REFUGE_ENDPOINT + "?lat=" + encodeURIComponent(lat) + "&lng=" + encodeURIComponent(lng) + "&per_page=20";
    return fetchJson(url).then(function (places) {
      if (id !== requestId) {
        setBusy(false, id);
        return;
      }
      if (!Array.isArray(places)) {
        throw new Error("directory");
      }

      var cleaned = places.filter(function (place) {
        return isFinite(place.latitude) && isFinite(place.longitude);
      }).map(function (place) {
        return Object.assign({}, place, {
          distanceMiles: milesBetween(lat, lng, Number(place.latitude), Number(place.longitude))
        });
      }).sort(function (a, b) {
        return a.distanceMiles - b.distanceMiles;
      });

      renderRestrooms(dedupe(cleaned), label);
      setBusy(false, id);
    }).catch(function () {
      if (id !== requestId) {
        setBusy(false, id);
        return;
      }
      setBusy(false, id);
      showDirectoryError();
    });
  }

  function renderRestrooms(places, label) {
    var list = document.getElementById("results-list");
    var count = document.getElementById("results-count");
    var where = label === "you" ? "you" : label;
    list.replaceChildren();
    markerById = {};
    if (restroomLayer) {
      restroomLayer.clearLayers();
    }

    if (!places.length) {
      count.textContent = "0 restrooms near " + where;
      setListMessage("No restrooms found near " + where + ".");
      fitMap();
      setStatus("");
      return;
    }

    var noun = places.length === 1 ? "restroom" : "restrooms";
    count.textContent = places.length + " " + noun + " near " + where;

    places.forEach(function (place) {
      var id = String(place.id);
      var name = place.name && String(place.name).trim() ? String(place.name).trim() : "Public restroom";
      var address = formatAddress(place);
      var distance = formatMiles(place.distanceMiles);
      var card = document.createElement("article");
      card.className = "restroom-card";
      card.setAttribute("data-id", id);
      card.setAttribute("data-name", name);

      var title = document.createElement("button");
      title.type = "button";
      title.className = "card-title";
      title.textContent = name;
      card.appendChild(title);

      if (address) {
        card.appendChild(paragraph("address", address));
      }
      if (distance) {
        card.appendChild(paragraph("distance", distance + " away"));
      }

      var badges = badgesFor(place);
      if (badges) {
        card.appendChild(badges);
      }

      var note = noteFor(place);
      if (note) {
        card.appendChild(note);
      }

      var actions = document.createElement("div");
      actions.className = "card-actions";
      actions.appendChild(actionButton("reviews", "See reviews"));
      actions.appendChild(actionButton("add", "Add review"));
      card.appendChild(actions);
      list.appendChild(card);

      if (map && restroomLayer) {
        var marker = L.marker([Number(place.latitude), Number(place.longitude)], {
          icon: restroomIcon,
          title: name,
          keyboard: true
        });
        marker.bindPopup(popupHtml(name, address, distance));
        marker.on("click", function () {
          highlight(id);
        });
        marker.addTo(restroomLayer);
        markerById[id] = marker;
      }
    });

    fitMap();
    setStatus("");
  }

  function showOrigin(lat, lng, title) {
    if (!map) {
      return;
    }
    if (originMarker) {
      map.removeLayer(originMarker);
    }
    originMarker = L.marker([lat, lng], {
      icon: originIcon,
      title: title,
      zIndexOffset: 1000,
      keyboard: true
    }).addTo(map);
    originMarker.bindPopup(escapeHtml(title));
  }

  function fitMap() {
    if (!map) {
      return;
    }
    var bounds = L.latLngBounds([]);
    if (originMarker) {
      bounds.extend(originMarker.getLatLng());
    }
    Object.keys(markerById).forEach(function (id) {
      bounds.extend(markerById[id].getLatLng());
    });
    if (!bounds.isValid()) {
      return;
    }
    map.invalidateSize();
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
  }

  function focusPlace(id) {
    highlight(id);
    var marker = markerById[id];
    if (!map || !marker) {
      return;
    }
    var nextZoom = Math.max(map.getZoom(), 16);
    map.setView(marker.getLatLng(), nextZoom);
    marker.openPopup();
    if (window.matchMedia("(max-width: 959px)").matches) {
      document.getElementById("map").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function highlight(id) {
    document.querySelectorAll(".restroom-card").forEach(function (card) {
      card.classList.toggle("is-active", card.getAttribute("data-id") === String(id));
    });
    var active = document.querySelector(".restroom-card.is-active");
    if (active) {
      active.scrollIntoView({ block: "nearest" });
    }
  }

  function openReviews(id, name) {
    activeReview = { id: id, name: name };
    loadedReviews = { restroomId: "", entries: [] };
    document.getElementById("reviews-title").textContent = "Reviews for " + name;
    setReviewsStatus("");
    var list = document.getElementById("reviews-list");
    list.replaceChildren();
    list.appendChild(paragraph("empty", "Loading reviews…"));
    openModal("reviews-modal");

    if (!database) {
      list.replaceChildren();
      list.appendChild(paragraph("empty", isOnline()
        ? "Reviews are unavailable right now."
        : "You're offline, so reviews can't load."));
      return;
    }

    database.ref(reviewPath(id)).once("value").then(function (snapshot) {
      if (!activeReview || activeReview.id !== id) {
        return;
      }
      var entries = [];
      if (snapshot.exists()) {
        snapshot.forEach(function (child) {
          var data = child.val();
          if (!data || typeof data !== "object" || !child.key) {
            return;
          }
          entries.push({ id: child.key, data: data });
        });
      }
      loadedReviews = { restroomId: id, entries: entries };
      renderLoadedReviews(false);
    }).catch(function () {
      if (!activeReview || activeReview.id !== id) {
        return;
      }
      loadedReviews = { restroomId: "", entries: [] };
      list.replaceChildren();
      list.appendChild(paragraph("empty", isOnline()
        ? "Reviews are unavailable right now."
        : "You're offline, so reviews can't load."));
    });
  }

  function openAddReview(id, name) {
    activeReview = { id: id, name: name };
    document.getElementById("review-title").textContent = "Review " + name;
    document.getElementById("review-error").textContent = "";
    openModal("review-modal");
  }

  function submitReview(event) {
    event.preventDefault();
    var error = document.getElementById("review-error");
    var name = document.getElementById("user-name").value.trim();
    var rating = document.getElementById("user-rating").value;
    var review = document.getElementById("user-review").value.trim();

    if (!name || !review) {
      error.textContent = "Add your name and a short review.";
      return;
    }
    if (!isOnline()) {
      error.textContent = "You're offline. Reconnect, then try saving that review again.";
      return;
    }
    if (!activeReview || !database) {
      error.textContent = "Reviews can't be saved right now.";
      return;
    }

    var button = event.target.querySelector("button[type='submit']");
    button.disabled = true;
    database.ref(reviewPath(activeReview.id)).push({
      name: name.slice(0, 80),
      rating: rating,
      review: review.slice(0, 1000)
    }).then(function () {
      var placeName = activeReview.name;
      document.getElementById("review-form").reset();
      document.getElementById("user-rating").value = "5";
      closeModal("review-modal");
      setStatus("Review saved for " + placeName + ".");
    }).catch(function () {
      error.textContent = "Couldn't save that review. Try again.";
    }).then(function () {
      button.disabled = false;
    });
  }

  function reviewPath(id) {
    return "refuge-" + String(id).replace(/[.#$\[\]]/g, "_");
  }

  function openModal(id) {
    var modal = document.getElementById(id);
    if (!modal.hidden) {
      return;
    }
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    var focusTarget = modal.querySelector("input, textarea, select, button");
    if (focusTarget) {
      focusTarget.focus();
    }
  }

  function closeModal(id) {
    var modal = document.getElementById(id);
    if (!modal || modal.hidden) {
      return;
    }
    modal.hidden = true;
    if (document.querySelector(".modal:not([hidden])")) {
      return;
    }
    document.body.classList.remove("modal-open");
    if (lastFocus && typeof lastFocus.focus === "function") {
      lastFocus.focus();
    }
  }

  function showDirectoryError() {
    var message = isOnline()
      ? "The restroom directory didn't respond. Try again in a moment."
      : "You're offline. Reconnect, then try that search again.";
    setStatus(message);
    document.getElementById("results-count").textContent = "";
    setListMessage(message);
  }

  function bindNetwork() {
    var native = window.Where2PNative;
    if (native && typeof native.isOnline === "boolean") {
      online = native.isOnline;
    }
    applyOnline();
    window.addEventListener("where2p-network", function (event) {
      online = !!(event.detail && event.detail.connected);
      applyOnline();
    });
  }

  function applyOnline() {
    var banner = document.getElementById("offline-banner");
    if (banner) {
      banner.hidden = online;
    }
  }

  function isOnline() {
    return online;
  }

  function setListMessage(message) {
    var list = document.getElementById("results-list");
    list.replaceChildren();
    list.appendChild(paragraph("empty", message));
  }

  function setStatus(message) {
    document.getElementById("status").textContent = message;
  }

  function setOriginLegend(label) {
    document.getElementById("origin-legend").textContent = label;
  }

  function setBusy(isBusy, id) {
    if (isBusy) {
      busyId = id;
    } else if (id !== busyId) {
      return;
    } else {
      busyId = 0;
    }
    document.querySelectorAll("#search-form button, .chip").forEach(function (button) {
      button.disabled = isBusy;
    });
  }

  function fetchJson(url) {
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, 12000);

    return fetch(url, { signal: controller.signal }).then(function (response) {
      if (!response.ok) {
        throw new Error("Request failed");
      }
      return response.json();
    }).then(function (data) {
      clearTimeout(timer);
      return data;
    }, function (error) {
      clearTimeout(timer);
      throw error;
    });
  }

  function placeLabel(properties, fallback) {
    properties = properties || {};
    var parts = [];
    if (properties.name) {
      parts.push(properties.name);
    }
    if (properties.city && properties.city !== properties.name) {
      parts.push(properties.city);
    }
    if (properties.state) {
      parts.push(properties.state);
    }
    return parts.join(", ") || fallback;
  }

  function formatAddress(place) {
    var street = clean(place.street);
    var city = clean(place.city);
    var state = clean(place.state);
    var cityLine = [city, state].filter(Boolean).join(", ");
    if (street && cityLine) {
      return street + ", " + cityLine;
    }
    return street || cityLine;
  }

  function formatMiles(miles) {
    if (!isFinite(miles)) {
      return "";
    }
    if (miles < 0.1) {
      return Math.max(1, Math.round(miles * 5280)) + " ft";
    }
    return (miles < 10 ? miles.toFixed(1) : Math.round(miles).toString()) + " mi";
  }

  function milesBetween(lat1, lng1, lat2, lng2) {
    var radius = 3958.8;
    var dLat = toRadians(lat2 - lat1);
    var dLng = toRadians(lng2 - lng1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * radius * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function toRadians(degrees) {
    return degrees * Math.PI / 180;
  }

  function dedupe(places) {
    var seen = {};
    return places.filter(function (place) {
      var name = clean(place.name).toLowerCase();
      var key = name + "|" + Number(place.latitude).toFixed(3) + "|" + Number(place.longitude).toFixed(3);
      if (seen[key]) {
        return false;
      }
      seen[key] = true;
      return true;
    });
  }

  function badgesFor(place) {
    var labels = [];
    if (place.accessible) {
      labels.push("Accessible");
    }
    if (place.unisex) {
      labels.push("All-gender");
    }
    if (place.changing_table) {
      labels.push("Changing table");
    }
    if (!labels.length) {
      return null;
    }
    var wrap = document.createElement("div");
    wrap.className = "badges";
    labels.forEach(function (label) {
      var badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = label;
      wrap.appendChild(badge);
    });
    return wrap;
  }

  function noteFor(place) {
    var comment = clean(place.comment);
    var directions = clean(place.directions);
    if (!comment && !directions) {
      return null;
    }

    var note = document.createElement("p");
    note.className = "note";
    if (directions && /^https?:\/\//i.test(directions)) {
      if (comment) {
        note.appendChild(document.createTextNode(comment + " "));
      }
      var link = document.createElement("a");
      link.href = directions;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Directions";
      note.appendChild(link);
      return note;
    }

    note.textContent = [comment, directions].filter(Boolean).join(" ");
    return note;
  }

  function actionButton(action, label) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "text-button";
    button.setAttribute("data-action", action);
    button.textContent = label;
    return button;
  }

  function paragraph(className, text) {
    var node = document.createElement("p");
    node.className = className;
    node.textContent = text;
    return node;
  }

  function onReviewClick(event) {
    var button = event.target.closest("[data-action]");
    if (!button) {
      return;
    }
    var item = button.closest(".review-item");
    if (!item) {
      return;
    }
    var action = button.getAttribute("data-action");
    if (action === "report") {
      showReportConfirm(item);
    } else if (action === "block") {
      showBlockConfirm(item);
    } else if (action === "cancel-report" || action === "cancel-block") {
      restoreReviewItem(item);
    } else if (action === "confirm-block") {
      blockReviewer(item.getAttribute("data-reviewer"));
    }
  }

  function onReportSubmit(event) {
    var form = event.target;
    if (!form || form.getAttribute("data-action") !== "confirm-report") {
      return;
    }
    event.preventDefault();
    var item = form.closest(".review-item");
    if (!item || !loadedReviews.restroomId) {
      return;
    }
    var reviewId = item.getAttribute("data-review-id");
    var input = form.querySelector("input[name='reason']");
    var reason = input ? input.value.trim().slice(0, 200) : "";
    var submitButton = form.querySelector("button[type='submit']");
    if (submitButton) {
      submitButton.disabled = true;
    }
    rememberHidden(loadedReviews.restroomId, reviewId);
    renderLoadedReviews(true);
    setReviewsStatus("Review hidden on this device.");
    writeReport(loadedReviews.restroomId, reviewId, reason);
  }

  function showReportConfirm(item) {
    var actions = item.querySelector(".review-actions");
    actions.replaceChildren();
    var form = document.createElement("form");
    form.className = "report-confirm";
    form.setAttribute("data-action", "confirm-report");
    var lead = document.createElement("p");
    lead.textContent = "Report this review? It will be hidden on this device.";
    var label = document.createElement("label");
    label.textContent = "Reason (optional)";
    var input = document.createElement("input");
    input.type = "text";
    input.name = "reason";
    input.maxLength = 200;
    input.autocomplete = "off";
    label.appendChild(input);
    var row = document.createElement("div");
    row.className = "review-actions";
    var submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "text-button";
    submit.textContent = "Report";
    row.appendChild(submit);
    row.appendChild(actionButton("cancel-report", "Cancel"));
    form.appendChild(lead);
    form.appendChild(label);
    form.appendChild(row);
    actions.appendChild(form);
    input.focus();
  }

  function showBlockConfirm(item) {
    var actions = item.querySelector(".review-actions");
    var name = item.getAttribute("data-reviewer") || "this reviewer";
    actions.replaceChildren();
    var box = document.createElement("div");
    box.className = "report-confirm";
    var lead = document.createElement("p");
    lead.textContent = "Block " + name + "? Reviews with that name will be hidden on this device.";
    var row = document.createElement("div");
    row.className = "review-actions";
    row.appendChild(actionButton("confirm-block", "Block reviewer"));
    row.appendChild(actionButton("cancel-block", "Cancel"));
    box.appendChild(lead);
    box.appendChild(row);
    actions.appendChild(box);
    row.querySelector("button").focus();
  }

  function restoreReviewItem(item) {
    var entry = findLoadedReview(item.getAttribute("data-review-id"));
    if (!entry) {
      return;
    }
    item.replaceWith(reviewItem(entry.id, entry.data));
  }

  function blockReviewer(name) {
    if (!loadedReviews.restroomId) {
      return;
    }
    rememberBlocked(name);
    renderLoadedReviews(true);
    var message = "Reviews from " + (clean(name) || "that reviewer") + " are hidden on this device.";
    setReviewsStatus(message);
    setStatus(message);
  }

  function renderLoadedReviews(moveFocus) {
    var list = document.getElementById("reviews-list");
    list.replaceChildren();
    var shown = 0;
    loadedReviews.entries.forEach(function (entry) {
      var data = entry.data || {};
      if (isHiddenReview(loadedReviews.restroomId, entry.id, data.name)) {
        return;
      }
      list.appendChild(reviewItem(entry.id, data));
      shown += 1;
    });
    if (!shown) {
      list.appendChild(paragraph("empty", loadedReviews.entries.length
        ? "No reviews to show. Reset hidden reviews in the footer to see them again."
        : "No reviews yet. Be the first to add one."));
    }
    if (moveFocus) {
      var title = document.getElementById("reviews-title");
      title.setAttribute("tabindex", "-1");
      title.focus();
    }
  }

  function findLoadedReview(id) {
    for (var i = 0; i < loadedReviews.entries.length; i += 1) {
      if (loadedReviews.entries[i].id === id) {
        return loadedReviews.entries[i];
      }
    }
    return null;
  }

  function writeReport(restroomId, reviewId, reason) {
    var record = {
      restroomId: reviewPath(restroomId),
      reviewId: String(reviewId),
      createdAt: Date.now()
    };
    if (reason) {
      record.reason = reason;
    }
    var hidden = "Review hidden on this device. The report could not be sent.";
    if (!database || !isOnline()) {
      setReviewsStatus(hidden);
      setStatus(hidden);
      return;
    }
    database.ref("reports").push(record).then(function () {
      var sent = "Review reported and hidden on this device.";
      setReviewsStatus(sent);
      setStatus(sent);
    }).catch(function () {
      setReviewsStatus(hidden);
      setStatus(hidden);
    });
  }

  function rememberHidden(restroomId, reviewId) {
    var key = hiddenReviewKey(restroomId, reviewId);
    if (hiddenReviewIds.indexOf(key) !== -1) {
      return;
    }
    hiddenReviewIds.push(key);
    writeJsonList(HIDDEN_REVIEWS_KEY, hiddenReviewIds);
  }

  function rememberBlocked(name) {
    var normalized = normalizeName(name);
    if (!normalized || blockedNames.indexOf(normalized) !== -1) {
      return;
    }
    blockedNames.push(normalized);
    writeJsonList(BLOCKED_NAMES_KEY, blockedNames);
  }

  function hiddenReviewKey(restroomId, reviewId) {
    return reviewPath(restroomId) + "/" + String(reviewId);
  }

  function isHiddenReview(restroomId, reviewId, name) {
    if (hiddenReviewIds.indexOf(hiddenReviewKey(restroomId, reviewId)) !== -1) {
      return true;
    }
    var normalized = normalizeName(name);
    return !!normalized && blockedNames.indexOf(normalized) !== -1;
  }

  function normalizeName(name) {
    return clean(name).toLowerCase();
  }

  function resetHiddenReviews() {
    hiddenReviewIds = [];
    blockedNames = [];
    try {
      localStorage.removeItem(HIDDEN_REVIEWS_KEY);
      localStorage.removeItem(BLOCKED_NAMES_KEY);
    } catch (error) {
      // The in-memory lists are already clear for this page view.
    }
    setStatus("Hidden reviews are visible again.");
    setReviewsStatus("");
    var modal = document.getElementById("reviews-modal");
    if (modal && !modal.hidden && loadedReviews.restroomId) {
      renderLoadedReviews(false);
    }
  }

  function readJsonList(key) {
    try {
      var parsed = JSON.parse(localStorage.getItem(key) || "[]");
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter(function (value) {
        return typeof value === "string";
      });
    } catch (error) {
      return [];
    }
  }

  function writeJsonList(key, values) {
    try {
      localStorage.setItem(key, JSON.stringify(values));
    } catch (error) {
      // The in-memory list still hides reviews for this page view.
    }
  }

  function setReviewsStatus(message) {
    var node = document.getElementById("reviews-status");
    if (node) {
      node.textContent = message;
    }
  }

  function reviewItem(reviewId, data) {
    var item = document.createElement("article");
    item.className = "review-item";
    item.setAttribute("data-review-id", reviewId);
    var name = clean(data.name);
    item.setAttribute("data-reviewer", name);
    var heading = document.createElement("h3");
    heading.textContent = name || "Anonymous";
    var rating = document.createElement("p");
    rating.textContent = "Rating: " + (clean(data.rating) || "—");
    var body = document.createElement("p");
    body.textContent = clean(data.review);
    var actions = document.createElement("div");
    actions.className = "review-actions";
    var report = actionButton("report", "Report");
    report.setAttribute("aria-label", "Report review by " + (name || "Anonymous"));
    actions.appendChild(report);
    if (name) {
      var block = actionButton("block", "Block reviewer");
      block.setAttribute("aria-label", "Block reviewer " + name);
      actions.appendChild(block);
    }
    item.appendChild(heading);
    item.appendChild(rating);
    item.appendChild(body);
    item.appendChild(actions);
    return item;
  }

  function popupHtml(name, address, distance) {
    var html = "<strong>" + escapeHtml(name) + "</strong>";
    if (address) {
      html += "<br>" + escapeHtml(address);
    }
    if (distance) {
      html += "<br>" + escapeHtml(distance + " away");
    }
    return html;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function clean(value) {
    return value == null ? "" : String(value).trim();
  }

  init();
})();
