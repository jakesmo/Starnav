/**
 * Mock CGI server for StarNav local development.
 * Replays captured real aircraft data on loop.
 *
 * Usage: node mock-server.js
 * Then run: npm run dev (Vite proxies /cgi-bin to this server)
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "dev-data");

// Load captured data
const statusData = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, "status.json"), "utf8"),
);

const attitudeRaw = fs.readFileSync(
  path.join(DATA_DIR, "attitude-stream.txt"),
  "utf8",
);
const attitudeLines = attitudeRaw
  .split("\n")
  .filter((l) => l.startsWith("data: "));

let tleData = "[]";
try {
  tleData = fs.readFileSync(path.join(DATA_DIR, "tle.json"), "utf8");
} catch {
  console.warn("No TLE data found, satellites will not render");
}

console.log(
  `Loaded: ${attitudeLines.length} attitude samples, ${JSON.parse(tleData).length} satellites`,
);

const server = http.createServer((req, res) => {
  const url = req.url || "";

  // CORS headers for all responses
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  if (url.startsWith("/cgi-bin/status-stream.cgi")) {
    // SSE: replay status at 2Hz
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("retry: 3000\n\n");

    const iv = setInterval(() => {
      // Update timestamp to current time
      const data = { ...statusData };
      data.data_age_seconds = 0;
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }, 500);

    req.on("close", () => clearInterval(iv));
    return;
  }

  if (url.startsWith("/cgi-bin/status.cgi")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(statusData));
    return;
  }

  if (url.startsWith("/cgi-bin/attitude-stream.cgi")) {
    // SSE: replay attitude data on loop at 10Hz
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("retry: 1000\n\n");

    let i = 0;
    const iv = setInterval(() => {
      if (attitudeLines.length === 0) return;
      if (i >= attitudeLines.length) i = 0;

      // Parse, update timestamp to current, re-serialize
      try {
        const line = attitudeLines[i];
        const json = JSON.parse(line.replace("data: ", ""));
        json.t = Date.now();
        res.write(`data: ${JSON.stringify(json)}\n\n`);
      } catch {
        res.write(attitudeLines[i] + "\n\n");
      }
      i++;
    }, 100);

    req.on("close", () => clearInterval(iv));
    return;
  }

  if (url.startsWith("/cgi-bin/tle.cgi")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(tleData);
    return;
  }

  if (url.startsWith("/cgi-bin/weather.cgi")) {
    // Mock weather response
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        wind_speed_ms: 5.2,
        wind_dir_deg: 270,
        temperature_c: 22.0,
        altitude_m: 100,
        source: "mock",
      }),
    );
    return;
  }

  if (url.startsWith("/cgi-bin/wind-inject.cgi")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        wind_x: -5.2,
        wind_y: 0,
        wind_z: 0,
        var_horiz: 2.0,
        var_vert: 1.0,
        wind_alt: 100,
        temperature: 295.15,
      }),
    );
    return;
  }

  if (url.startsWith("/cgi-bin/api.cgi")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, command: "mock", output: "", exit_code: 0 }));
    return;
  }

  if (url.startsWith("/cgi-bin/config.cgi")) {
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          starlink: { dish_address: "192.168.100.1:9200", gps_mode: "auto" },
          mavlink: {
            connection: "udpin:0.0.0.0:14552",
            target_system: 7,
            target_component: 1,
            source_system: 242,
            source_component: 192,
          },
          thresholds: {
            uncertainty_limit: 200,
            min_stable_time: 3,
            accuracy_jump_threshold: 1.5,
            staleness_timeout: 3,
          },
          rates: {
            send_rate_active: 0.5,
            send_rate_passive: 1,
            send_rate_degraded: 2,
          },
          logging: { csv_enabled: true, max_log_size_mb: 100 },
          hud: { update_rate_hz: 2, altitude_source: "relative", altitude_unit: "m" },
        }),
      );
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    }
    return;
  }

  if (url.startsWith("/cgi-bin/version.cgi")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        commit: "mock-dev",
        branch: "main",
        update_available: false,
      }),
    );
    return;
  }

  // Default 404
  res.writeHead(404);
  res.end("Not found: " + url);
});

const PORT = 8082;
server.listen(PORT, () => {
  console.log(`\nStarNav mock server running on http://localhost:${PORT}`);
  console.log("Replaying captured aircraft data on loop");
  console.log("Start Vite dev server: npm run dev\n");
});
