// The client's small web server - you don't need to change it.
// It serves the files in public/ and forwards every /api/... request to your Express server,
// so the page and the API look like one site (no CORS needed).
//
//   npm start                      -> http://localhost:5173  (API on http://localhost:3000)
//   API_URL=http://localhost:4000 npm start   -> if your server runs on another port

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.CLIENT_PORT) || 5173;
const API_URL = new URL(process.env.API_URL || "http://localhost:3000");
const PUBLIC = path.join(__dirname, "public");
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".png": "image/png" };

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    const proxy = http.request(
      { hostname: API_URL.hostname, port: API_URL.port || 80, path: req.url, method: req.method, headers: { ...req.headers, host: API_URL.host } },
      (apiRes) => {
        res.writeHead(apiRes.statusCode, apiRes.headers);
        apiRes.pipe(res);
      }
    );
    proxy.on("error", () => {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `The API server is not running on ${API_URL.origin} - start it with npm start inside server/` }));
    });
    req.pipe(proxy);
    return;
  }

  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = path.join(PUBLIC, urlPath === "/" ? "index.html" : urlPath);
  if (!file.startsWith(PUBLIC)) return res.writeHead(403).end();
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    res.writeHead(200, { "content-type": (TYPES[path.extname(file)] || "application/octet-stream") + "; charset=utf-8" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Client running on http://localhost:${PORT}  (API: ${API_URL.origin})`);
});
