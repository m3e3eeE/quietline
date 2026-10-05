#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOST = process.env.QUIETLINE_BRIDGE_HOST || "127.0.0.1";
const PORT = Number(process.env.QUIETLINE_BRIDGE_PORT || 8787);
const TOKEN = process.env.QUIETLINE_BRIDGE_TOKEN;
const DRY_RUN_DEFAULT = process.env.QUIETLINE_BRIDGE_DRY_RUN_DEFAULT !== "0";
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATIC_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"]
]);
const ALLOWED_ORIGINS = new Set([
  "https://m3e3eee.github.io",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  ...(process.env.QUIETLINE_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
]);

if (!TOKEN || TOKEN.length < 16) {
  console.error("Set QUIETLINE_BRIDGE_TOKEN to a private value with at least 16 characters.");
  process.exit(1);
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return sendJson(response, 403, { ok: false, error: "Origin is not allowed." }, origin);
  }

  if (request.method === "OPTIONS") {
    return sendJson(response, 204, null, origin);
  }

  const url = new URL(request.url || "/", `http://${request.headers.host}`);

  if (url.pathname === "/health" && request.method === "GET") {
    return sendJson(response, 200, {
      ok: true,
      service: "quietline-whatsapp-bridge",
      dryRunDefault: DRY_RUN_DEFAULT
    }, origin);
  }

  if (url.pathname === "/api/whatsapp/send" && request.method === "POST") {
    if (!isAuthorized(request)) {
      return sendJson(response, 401, { ok: false, error: "Bridge token is missing or invalid." }, origin);
    }

    const body = await readJsonBody(request);
    const target = String(body.target || "").trim();
    const message = String(body.message || "").trim();
    const dryRun = typeof body.dryRun === "boolean" ? body.dryRun : DRY_RUN_DEFAULT;

    if (!/^\+[1-9]\d{7,14}$/.test(target)) {
      return sendJson(response, 400, { ok: false, error: "Use an E.164 phone number, for example +31612345678." }, origin);
    }
    if (!message || message.length > 1600) {
      return sendJson(response, 400, { ok: false, error: "Message must be 1-1600 characters." }, origin);
    }

    try {
      const result = await runOpenClaw([
        "message",
        "send",
        "--channel",
        "whatsapp",
        "--target",
        target,
        "--message",
        message,
        "--json",
        ...(dryRun ? ["--dry-run"] : [])
      ]);
      return sendJson(response, 200, { ok: true, dryRun, result }, origin);
    } catch (error) {
      return sendJson(response, 502, { ok: false, error: error.message }, origin);
    }
  }

  if (request.method === "GET") {
    return sendStatic(response, url.pathname, origin);
  }

  sendJson(response, 404, { ok: false, error: "Not found." }, origin);
});

server.listen(PORT, HOST, () => {
  console.log(`Relay bridge listening on http://${HOST}:${PORT}`);
  console.log(`Dry-run default: ${DRY_RUN_DEFAULT ? "on" : "off"}`);
});

function isAuthorized(request) {
  const header = request.headers.authorization || "";
  return header === `Bearer ${TOKEN}`;
}

function sendJson(response, status, payload, origin) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
    ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {})
  });
  response.end(payload === null ? "" : JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 20000) {
        request.destroy(new Error("Request body is too large."));
      }
    });
    request.on("error", reject);
    request.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
  });
}

function runOpenClaw(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("openclaw", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `openclaw exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve({ stdout: stdout.trim() });
      }
    });
  });
}

async function sendStatic(response, pathname, origin) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(ROOT_DIR, `.${decodeURIComponent(requestedPath)}`);
  if (!filePath.startsWith(ROOT_DIR) || filePath.includes(`${path.sep}bridge${path.sep}`)) {
    return sendJson(response, 404, { ok: false, error: "Not found." }, origin);
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "content-type": STATIC_TYPES.get(path.extname(filePath)) || "application/octet-stream",
      ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {})
    });
    response.end(content);
  } catch {
    sendJson(response, 404, { ok: false, error: "Not found." }, origin);
  }
}
