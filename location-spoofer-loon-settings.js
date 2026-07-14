// Loon 即时同步入口。
// 选点页请求 NAS 的 /loon-sync 时，由 Loon 在请求发出前拦截，
// 将最新配置直接写入 location-spoofer.js 使用的持久化缓存。

(function () {
  "use strict";

  var STORE_KEY = "location_spoofer_remote_cfg";

  function decode(value) {
    try {
      return decodeURIComponent(String(value || "").replace(/\+/g, " "));
    } catch (err) {
      return String(value || "");
    }
  }

  function parsePairs(value) {
    var out = {};
    var text = String(value || "").replace(/^\?/, "");
    if (!text) return out;
    var parts = text.split("&");
    for (var i = 0; i < parts.length; i += 1) {
      if (!parts[i]) continue;
      var eq = parts[i].indexOf("=");
      var key = eq >= 0 ? parts[i].slice(0, eq) : parts[i];
      var item = eq >= 0 ? parts[i].slice(eq + 1) : "";
      out[decode(key)] = decode(item);
    }
    return out;
  }

  function readArgs() {
    if (typeof $argument === "object" && $argument != null) {
      return $argument;
    }
    return parsePairs(typeof $argument === "undefined" ? "" : $argument);
  }

  function resolveConfigUrl(args) {
    var direct = String(args.configUrl || "").trim();
    if (direct) return direct;
    var host = String(args.configHost || "").trim().replace(/\/+$/, "");
    var token = String(args.configToken || "").trim();
    if (!host || !token) return "";
    return host + "/loc.json?token=" + encodeURIComponent(token);
  }

  function parseBoolean(value, fallback) {
    if (value == null || value === "") return fallback;
    return !/^(?:false|0|off|no)$/i.test(String(value));
  }

  function numberInRange(value, min, max) {
    var number = Number(value);
    return isFinite(number) && number >= min && number <= max ? number : null;
  }

  function optionalInteger(value) {
    if (value == null || value === "") return null;
    var number = Number(value);
    return isFinite(number) ? Math.round(number) : null;
  }

  function readExistingData(configUrl) {
    try {
      var raw = $persistentStore.read(STORE_KEY);
      if (!raw) return {};
      var entry = JSON.parse(raw);
      if (!entry || entry.url !== configUrl || !entry.data) return {};
      return entry.data;
    } catch (err) {
      return {};
    }
  }

  function respond(status, payload) {
    $done({
      response: {
        status: status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Cache-Control": "no-store"
        },
        body: JSON.stringify(payload)
      }
    });
  }

  try {
    if (typeof $request === "undefined" || !$request.url) {
      respond(400, { success: false, error: "missing request" });
      return;
    }

    var args = readArgs();
    var configUrl = resolveConfigUrl(args);
    if (!configUrl) {
      respond(400, { success: false, error: "configure configHost + configToken first" });
      return;
    }

    var query = parsePairs(String($request.url).split("?")[1] || "");
    var data = readExistingData(configUrl);

    var enabledProvided = Object.prototype.hasOwnProperty.call(query, "enabled");

    if (Object.prototype.hasOwnProperty.call(query, "lat") || Object.prototype.hasOwnProperty.call(query, "latitude")) {
      var latitude = numberInRange(query.lat || query.latitude, -90, 90);
      var longitude = numberInRange(query.lng || query.longitude, -180, 180);
      if (latitude == null || longitude == null) {
        respond(400, { success: false, error: "invalid coordinates" });
        return;
      }
      data.enabled = true;
      data.latitude = latitude;
      data.longitude = longitude;
    }

    if (enabledProvided) {
      data.enabled = parseBoolean(query.enabled, true);
    }

    var altitude = optionalInteger(query.altitude);
    var horizontalAccuracy = optionalInteger(query.horizontalAccuracy);
    var verticalAccuracy = optionalInteger(query.verticalAccuracy);
    if (altitude != null) data.altitude = altitude;
    if (horizontalAccuracy != null) data.horizontalAccuracy = horizontalAccuracy;
    if (verticalAccuracy != null) data.verticalAccuracy = verticalAccuracy;

    if (!isFinite(Number(data.latitude)) || !isFinite(Number(data.longitude))) {
      respond(400, { success: false, error: "coordinates are missing" });
      return;
    }

    var entry = { url: configUrl, data: data, ts: Date.now() };
    var written = $persistentStore.write(JSON.stringify(entry), STORE_KEY);
    if (!written) {
      respond(500, { success: false, error: "persistent store write failed" });
      return;
    }

    if (parseBoolean(args.debug, false)) {
      console.log(
        "Location spoofer instant sync -> enabled=" + data.enabled +
        ", lat=" + data.latitude + ", lng=" + data.longitude
      );
    }

    respond(200, {
      success: true,
      target: "Loon",
      enabled: data.enabled !== false,
      latitude: data.latitude,
      longitude: data.longitude
    });
  } catch (err) {
    respond(500, { success: false, error: String(err && err.message ? err.message : err) });
  }
})();
