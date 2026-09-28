import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { join, resolve, extname, sep, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { validateWav, allowedRequest } from "./audio.mjs";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cache = join(root, ".local-ai");
const dist = join(root, "dist");
const port = 8787;
const enginePort = 8788;
const secret = "/" + randomUUID();
const engineUrl = `http://127.0.0.1:${enginePort}${secret}`;
const binaries = [
  join(cache, "whisper.cpp/build/bin/whisper-server"),
  join(cache, "whisper.cpp/build/bin/Release/whisper-server.exe"),
];
const binary =
  process.env.SIMPLE_SERVICE_WHISPER_SERVER || binaries.find(existsSync);
const model =
  process.env.SIMPLE_SERVICE_WHISPER_MODEL ||
  join(cache, "ggml-small.en-q5_1.bin");
let engine,
  ready = false,
  busy = false,
  error = "",
  closing = false;
const emptyPublic = join(cache, "empty-public");
await mkdir(emptyPublic, { recursive: true });
if (!binary || !existsSync(model)) {
  error =
    "Local AI is not installed. Run npm run setup:local-ai, then restart npm run local-ai.";
} else {
  engine = spawn(
    binary,
    [
      "-m",
      model,
      "--host",
      "127.0.0.1",
      "--port",
      String(enginePort),
      "--request-path",
      secret,
      "--public",
      emptyPublic,
      "-t",
      "4",
      "-l",
      "en",
      "-nt",
      "-nc",
      "-sns",
    ],
    { cwd: cache, stdio: ["ignore", "ignore", "pipe"] },
  );
  engine.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    if (/error|failed/i.test(text)) console.error(text.trim());
  });
  engine.on("error", (e) => {
    ready = false;
    error = e.message;
  });
  engine.on("exit", (code) => {
    ready = false;
    if (!closing)
      error = `Whisper stopped (${code}). Restart npm run local-ai.`;
  });
  console.log("Loading local Whisper model…");
}
const poll = setInterval(async () => {
  if (!engine || closing) return;
  try {
    const r = await fetch(engineUrl + "/health", {
      signal: AbortSignal.timeout(1500),
    });
    if (r.ok) {
      if (!ready)
        console.log(
          "Whisper is ready. Audio inference stays on this computer.",
        );
      ready = true;
      error = "";
    }
  } catch {
    ready = false;
  }
}, 2000);
function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
const server = createServer(async (req, res) => {
  if (!allowedRequest(req.headers.host, req.headers.origin)) {
    json(res, 403, { error: "Local requests only." });
    return;
  }
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  if (req.method === "GET" && path === "/api/local-ai/status") {
    json(res, 200, {
      ready,
      busy,
      engine: "whisper.cpp",
      model: basename(model),
      error,
      local: true,
    });
    return;
  }
  if (req.method === "POST" && path === "/api/local-ai/transcribe") {
    if (!ready) {
      json(res, 503, {
        error: error || "Whisper is loading. Try again shortly.",
      });
      return;
    }
    if (busy) {
      json(res, 429, {
        error: "Whisper is processing the previous audio segment.",
      });
      return;
    }
    if (req.headers["content-type"] !== "audio/wav") {
      json(res, 415, { error: "audio/wav required." });
      return;
    }
    busy = true;
    const abort = new AbortController();
    const disconnect = () => {
      if (!res.writableEnded) abort.abort();
    };
    res.on("close", disconnect);
    try {
      const chunks = [];
      let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 480044) throw new Error("Audio segment is too large.");
        chunks.push(chunk);
      }
      const wav = Buffer.concat(chunks);
      const { silent } = validateWav(wav);
      if (silent) {
        json(res, 200, { text: "", elapsedMs: 0 });
        return;
      }
      const form = new FormData();
      form.set("file", new Blob([wav], { type: "audio/wav" }), "segment.wav");
      form.set("response_format", "json");
      form.set("temperature", "0");
      form.set("temperature_inc", "0");
      form.set("no_context", "true");
      const start = Date.now();
      const response = await fetch(engineUrl + "/inference", {
        method: "POST",
        body: form,
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(45000)]),
      });
      if (!response.ok) throw new Error(`Whisper returned ${response.status}.`);
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      json(res, 200, {
        text: typeof result.text === "string" ? result.text.trim() : "",
        elapsedMs: Date.now() - start,
      });
    } catch (e) {
      if (!res.destroyed)
        json(res, 400, { error: e.message || "Transcription failed." });
    } finally {
      busy = false;
      res.off("close", disconnect);
    }
    return;
  }
  if (path.startsWith("/api/")) {
    json(res, 404, { error: "Unknown API route." });
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }
  try {
    const file = resolve(
      dist,
      "." + decodeURIComponent(path === "/" ? "/index.html" : path),
    );
    if (!file.startsWith(dist + sep)) {
      json(res, 403, { error: "Invalid path." });
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Not a file");
    const mime = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".woff2": "font/woff2",
      ".woff": "font/woff",
    };
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
      "Content-Length": info.size,
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") res.end();
    else createReadStream(file).pipe(res);
  } catch {
    json(res, 404, {
      error:
        "Run npm run build to serve Simple Service here, or open the Vite app on port 5173.",
    });
  }
});
server.requestTimeout = 60000;
server.headersTimeout = 10000;
server.on("error", (e) => {
  console.error(e.message);
  shutdown();
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Local AI companion: http://127.0.0.1:${port} — keep this terminal open.`,
  ),
);
function shutdown() {
  if (closing) return;
  closing = true;
  clearInterval(poll);
  server.close();
  server.closeAllConnections();
  engine?.kill("SIGTERM");
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
