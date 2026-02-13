const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

function resolvePath(urlPath) {
  const cleaned = decodeURIComponent(urlPath.split("?")[0]).replace(/^\/+/, "");
  const requested = cleaned || "index.html";
  const absolute = path.normalize(path.join(ROOT, requested));
  if (!absolute.startsWith(ROOT)) return null;
  return absolute;
}

function sendFile(filePath, res) {
  fs.stat(filePath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.statusCode = 200;
    res.setHeader("Content-Type", MIME_TYPES[ext] || "application/octet-stream");
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const target = resolvePath(req.url || "/");
  if (!target) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Bad request");
    return;
  }

  fs.stat(target, (err, stats) => {
    if (!err && stats.isDirectory()) {
      sendFile(path.join(target, "index.html"), res);
      return;
    }
    if (!err && stats.isFile()) {
      sendFile(target, res);
      return;
    }
    sendFile(path.join(ROOT, "index.html"), res);
  });
});

server.listen(PORT, () => {
  console.log(`Pomodoro+ server running at http://localhost:${PORT}`);
});
