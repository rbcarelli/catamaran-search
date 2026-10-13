import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBoard, photoMap, recordFeedback } from "../lib/board.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8787);
const PUBLIC = path.join(ROOT, "public");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value), "application/json; charset=utf-8");
}

function inside(root, filePath) {
  const full = path.resolve(filePath);
  const base = path.resolve(root);
  const prefix = base.endsWith(path.sep) ? base : base + path.sep;
  return full === base || full.toLowerCase().startsWith(prefix.toLowerCase());
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/listings") {
    try {
      sendJson(res, 200, await loadBoard());
    } catch (error) {
      sendJson(res, 500, { error: String(error.message || error), boats: [] });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/photos") {
    sendJson(res, 200, photoMap());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/feedback") {
    try {
      const payload = JSON.parse((await readBody(req)) || "{}");
      sendJson(res, 200, await recordFeedback(payload));
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "method not allowed");
    return;
  }

  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  if (rel === "/rejected" || rel === "/rejected/") rel = "/rejected.html";
  const candidates = [
    path.resolve(PUBLIC, "." + rel.replace(/\\/g, "/")),
    path.resolve(ROOT, "." + rel.replace(/\\/g, "/")),
  ];
  const filePath = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!filePath || (!inside(PUBLIC, filePath) && !inside(ROOT, filePath)) || filePath.includes("github-sync")) {
    send(res, 404, "not found");
    return;
  }
  const type = TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  send(res, 200, fs.readFileSync(filePath), type);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("catamaran-search on http://127.0.0.1:" + PORT);
});
