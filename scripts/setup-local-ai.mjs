import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cache = join(root, ".local-ai");
const source = join(cache, "whisper.cpp");
const version = "v1.8.2";
const commit = "4979e04f5dcaccb36057e059bbaed8a2f5288315";
const modelName = "ggml-small.en-q5_1.bin";
const sha = "bfdff4894dcb76bbf647d56263ea2a96645423f1669176f4844a1bf8e478ad30";
const modelUrl = `https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/${modelName}`;
function run(command, args, options = {}) {
  return new Promise((res, rej) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      ...options,
    });
    child.on("error", rej);
    child.on("exit", (code) =>
      code === 0 ? res() : rej(new Error(`${command} exited ${code}`)),
    );
  });
}
async function digest(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
await mkdir(cache, { recursive: true });
try {
  let cmake = process.env.CMAKE || "cmake";
  try {
    await run(cmake, ["--version"], { stdio: "ignore" });
  } catch {
    console.log(
      "Installing a private CMake build tool in .local-ai (Python required)…",
    );
    const venv = join(cache, "build-tools");
    const python = process.platform === "win32" ? "python" : "python3";
    await run(python, ["-m", "venv", venv]);
    const bin = join(venv, process.platform === "win32" ? "Scripts" : "bin");
    await run(
      join(bin, process.platform === "win32" ? "python.exe" : "python"),
      ["-m", "pip", "install", "cmake==3.31.6"],
    );
    cmake = join(bin, process.platform === "win32" ? "cmake.exe" : "cmake");
  }
  if (!existsSync(join(source, ".git"))) {
    await run("git", [
      "clone",
      "--depth",
      "1",
      "--branch",
      version,
      "https://github.com/ggml-org/whisper.cpp.git",
      source,
    ]);
  }
  // A pinned detached checkout keeps the compiled engine reproducible.
  await run("git", ["-C", source, "checkout", "--detach", commit]);
  const model = join(cache, modelName);
  if (!existsSync(model) || (await digest(model)) !== sha) {
    console.log(
      "Downloading Whisper small.en Q5_1 (190 MB). Internet is needed only for setup.",
    );
    const response = await fetch(modelUrl);
    if (!response.ok || !response.body)
      throw new Error(`Model download failed (${response.status}).`);
    const temp = model + ".download";
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temp));
    if ((await digest(temp)) !== sha) {
      await rm(temp, { force: true });
      throw new Error("Model checksum did not match. Run setup again.");
    }
    await rename(temp, model);
  }
  console.log("Building whisper.cpp; this may take a few minutes…");
  await run(cmake, [
    "-S",
    source,
    "-B",
    join(source, "build"),
    "-DCMAKE_BUILD_TYPE=Release",
    "-DWHISPER_BUILD_TESTS=OFF",
    "-DWHISPER_CURL=OFF",
  ]);
  await run(cmake, [
    "--build",
    join(source, "build"),
    "--config",
    "Release",
    "--target",
    "whisper-server",
    "-j",
    "4",
  ]);
  console.log(
    "\nLocal AI is installed. Run npm run local-ai alongside npm run dev, or npm run build && npm run start:local.",
  );
} catch (e) {
  console.error("\nLocal AI setup failed:", e.message);
  console.error(
    "Requires Git, a C++ compiler (Xcode Command Line Tools on macOS; MSVC on Windows; GCC/Clang on Linux), and CMake or Python 3.",
  );
  process.exitCode = 1;
}
