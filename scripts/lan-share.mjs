// Ephemeral LAN share: serves a fresh build of the frontend and proxies /api and
// /auth to the local Flask server, so other devices on the same Wi-Fi / hotspot
// can try the app.
//
//   node scripts/lan-share.mjs [--minutes 120] [--ip 192.168.1.5] [--flask http://127.0.0.1:5000]
//                              [--telemetry-port 8444]
//
// Telemetry: a live request log/dashboard at http://127.0.0.1:8444 (this machine
// only). It records time, device, method, path and status; never query strings,
// cookies, headers or bodies.
//
// Safety: binds only to one private LAN address (never 0.0.0.0), rejects
// non-private clients, needs a random per-run token (first visit sets a cookie),
// blocks /api/internal, and exits on its own, deleting the temp build.
// No dependencies beyond Node and the frontend's own node_modules.

import { spawnSync } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import http from "node:http";
import { networkInterfaces, tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};

const MINUTES = Number(opt("minutes", "120"));
const PORT = Number(opt("port", "8443"));
const TELEMETRY_PORT = Number(opt("telemetry-port", "8444"));
const FLASK = new URL(opt("flask", "http://127.0.0.1:5000"));
const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const FRONTEND = join(ROOT, "frontend");

const isPrivate = (ip) =>
  /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);

function lanAddress() {
  const wanted = opt("ip");
  if (wanted) return wanted;
  const skip = /vethernet|wsl|virtual|vmware|vbox|docker|loopback/i;
  for (const [name, list] of Object.entries(networkInterfaces())) {
    if (skip.test(name)) continue;
    for (const entry of list ?? []) {
      if (entry.family === "IPv4" && !entry.internal && isPrivate(entry.address)) {
        return entry.address;
      }
    }
  }
  return null;
}

const host = lanAddress();
if (!host || !isPrivate(host)) {
  console.error("No private Wi-Fi/hotspot address found. Connect first, or pass --ip <address>.");
  process.exit(1);
}

// --- build into a throwaway directory ---------------------------------------
const buildDir = mkdtempSync(join(tmpdir(), "refurbish-share-"));
console.log("Building frontend...");
const build = spawnSync(
  process.execPath,
  [join(FRONTEND, "node_modules", "vite", "bin", "vite.js"), "build", "--outDir", buildDir, "--emptyOutDir"],
  // Empty API URL makes the app call /api on whichever origin served it.
  { cwd: FRONTEND, stdio: "inherit", env: { ...process.env, VITE_API_URL: "" } },
);
if (build.status !== 0) {
  rmSync(buildDir, { recursive: true, force: true });
  process.exit(build.status ?? 1);
}

// --- server -------------------------------------------------------------------
const token = randomBytes(24).toString("base64url");
const COOKIE = "share_token";
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2", ".map": "application/json",
};

function sameToken(candidate) {
  const a = Buffer.from(candidate ?? "");
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookieToken(req) {
  const match = /(?:^|;\s*)share_token=([^;]+)/.exec(req.headers.cookie ?? "");
  return match?.[1];
}

function deny(res, code = 403) {
  res.writeHead(code, { "Content-Type": "text/plain" });
  res.end("Forbidden");
}

// --- telemetry ------------------------------------------------------------------
const LOG_LIMIT = 500;
const log = [];
const watchers = new Set();
const startedAt = Date.now();

function device(userAgent = "") {
  const os = /iPhone|iPad/.test(userAgent) ? "iOS"
    : /Android/.test(userAgent) ? "Android"
    : /Windows/.test(userAgent) ? "Windows"
    : /Mac OS X/.test(userAgent) ? "macOS"
    : /Linux/.test(userAgent) ? "Linux" : "other";
  const browser = /Edg\//.test(userAgent) ? "Edge"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /Safari\//.test(userAgent) ? "Safari" : "";
  return `${os}${browser ? ` ${browser}` : ""}`;
}

function record(entry) {
  log.push(entry);
  if (log.length > LOG_LIMIT) log.shift();
  for (const watcher of watchers) watcher.write(`data: ${JSON.stringify(entry)}

`);
}

const server = http.createServer((req, res) => {
  const client = (req.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
  const began = process.hrtime.bigint();
  res.on("finish", () => {
    const path = new URL(req.url, "http://x").pathname;
    record({
      t: new Date().toISOString(),
      ip: client,
      device: device(req.headers["user-agent"]),
      method: req.method,
      path,
      kind: path.startsWith("/api") || path.startsWith("/auth") ? "api" : "page",
      status: res.statusCode,
      ms: Number((process.hrtime.bigint() - began) / 1_000_000n),
    });
  });
  if (!isPrivate(client)) return deny(res);

  const url = new URL(req.url, `http://${host}`);

  // First visit: ?k=<token> sets the cookie and redirects to a clean URL.
  if (url.searchParams.has("k")) {
    if (!sameToken(url.searchParams.get("k"))) return deny(res);
    res.writeHead(302, {
      "Set-Cookie": `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`,
      Location: url.pathname,
    });
    return res.end();
  }
  if (!sameToken(cookieToken(req))) return deny(res);

  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/auth")) {
    if (url.pathname.startsWith("/api/internal")) return deny(res);
    const proxied = http.request(
      {
        host: FLASK.hostname, port: FLASK.port, method: req.method, path: req.url,
        headers: { ...req.headers, host: FLASK.host, cookie: "" },
      },
      (upstream) => {
        res.writeHead(upstream.statusCode ?? 502, upstream.headers);
        upstream.pipe(res);
      },
    );
    proxied.on("error", () => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Flask is not reachable at ${FLASK.origin}` }));
    });
    return req.pipe(proxied);
  }

  // Static files, with SPA fallback to index.html.
  let file = normalize(join(buildDir, decodeURIComponent(url.pathname)));
  if (!file.startsWith(buildDir)) return deny(res);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(buildDir, "index.html");
  res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});

const DASHBOARD = `<!doctype html><meta charset="utf-8"><title>Share telemetry</title>
<style>
body{font:14px system-ui;margin:0;padding:16px;background:#fafaf7;color:#222}
h1{font-size:18px;margin:0 0 4px}.sub{color:#666;margin-bottom:12px}
.cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.card{background:#fff;border:1px solid #ddd;border-radius:8px;padding:8px 12px;min-width:110px}
.card b{display:block;font-size:20px}
table{border-collapse:collapse;width:100%;background:#fff}
td,th{padding:4px 8px;border-bottom:1px solid #eee;text-align:left;white-space:nowrap}
.s4,.s5{color:#b00020}.s2{color:#1b7f3b}.s3{color:#8a6d00}
</style>
<h1>Share telemetry</h1><div class="sub" id="sub"></div>
<div class="cards" id="cards"></div>
<table><thead><tr><th>Time</th><th>Device</th><th>IP</th><th>Request</th><th>Status</th><th>ms</th></tr></thead>
<tbody id="rows"></tbody></table>
<script>
const rows = document.getElementById("rows"), all = [];
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
function cards() {
  const ips = new Set(all.map((e) => e.ip)), api = all.filter((e) => e.kind === "api");
  const errors = all.filter((e) => e.status >= 400).length;
  const avg = api.length ? Math.round(api.reduce((sum, e) => sum + e.ms, 0) / api.length) : 0;
  document.getElementById("cards").innerHTML = [
    ["Requests", all.length], ["Devices", ips.size], ["API calls", api.length],
    ["Errors (4xx/5xx)", errors], ["Avg API ms", avg],
  ].map(([k, v]) => '<div class="card">' + k + "<b>" + v + "</b></div>").join("");
}
function add(e) {
  all.push(e);
  const tr = document.createElement("tr");
  tr.innerHTML = "<td>" + e.t.slice(11, 19) + "</td><td>" + esc(e.device) + "</td><td>" + esc(e.ip) +
    "</td><td>" + e.method + " " + esc(e.path) + '</td><td class="s' + String(e.status)[0] + '">' +
    e.status + "</td><td>" + e.ms + "</td>";
  rows.prepend(tr);
}
fetch("/events").then((r) => r.json()).then((d) => {
  d.log.forEach(add);
  document.getElementById("sub").textContent = "Started " + d.startedAt + " - this machine only";
  cards();
  new EventSource("/stream").onmessage = (m) => { add(JSON.parse(m.data)); cards(); };
});
</script>`;

const telemetry = http.createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  if (path === "/events") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ startedAt: new Date(startedAt).toISOString(), log }));
  }
  if (path === "/stream") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    res.write(": ok\n\n");
    watchers.add(res);
    return req.on("close", () => watchers.delete(res));
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(DASHBOARD);
});

function shutdown(reason) {
  console.log(`\n${reason}; shutting down.`);
  server.close();
  telemetry.close();
  for (const watcher of watchers) watcher.end();
  rmSync(buildDir, { recursive: true, force: true });
  process.exit(0);
}

server.listen(PORT, host, () => {
  console.log(`\nShare this with devices on the same network (valid ${MINUTES} min):`);
  console.log(`  http://${host}:${PORT}/?k=${token}\n`);
  console.log(`Proxying /api and /auth to ${FLASK.origin}. Ctrl+C to stop early.`);
});
// Loopback only: other devices on the network can't see the log.
telemetry.listen(TELEMETRY_PORT, "127.0.0.1", () => {
  console.log(`Telemetry (this machine only): http://127.0.0.1:${TELEMETRY_PORT}`);
});
setTimeout(() => shutdown("Time limit reached"), MINUTES * 60_000).unref?.();
process.on("SIGINT", () => shutdown("Stopped"));
process.on("SIGTERM", () => shutdown("Stopped"));
