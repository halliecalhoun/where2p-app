(function () {
  "use strict";

  var REFUGE_ENDPOINT = "https://www.refugerestrooms.org/api/v1/restrooms/by_location";
  var GEOCODE_ENDPOINT = "https://photon.komoot.io/api/";
  var STORAGE_KEY = "where2p:last-query";

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
  var lastFocus = null;
  var online = navigator.onLine !== false;

  function init() {
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
    document.getElementById("reviews-title").textContent = "Reviews for " + name;
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
      list.replaceChildren();
      if (!snapshot.exists()) {
        list.appendChild(paragraph("empty", "No reviews yet. Be the first to add one."));
        return;
      }
      snapshot.forEach(function (child) {
        var data = child.val();
        if (!data || typeof data !== "object") {
          return;
        }
        list.appendChild(reviewItem(data));
      });
      if (!list.childElementCount) {
        list.appendChild(paragraph("empty", "No reviews yet. Be the first to add one."));
      }
    }).catch(function () {
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

  function reviewItem(data) {
    var item = document.createElement("article");
    item.className = "review-item";
    var heading = document.createElement("h3");
    heading.textContent = clean(data.name) || "Anonymous";
    var rating = document.createElement("p");
    rating.textContent = "Rating: " + (clean(data.rating) || "—");
    var body = document.createElement("p");
    body.textContent = clean(data.review);
    item.appendChild(heading);
    item.appendChild(rating);
    item.appendChild(body);
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
