import { test } from "node:test";
import assert from "node:assert/strict";
import { validateWav, allowedRequest } from "./audio.mjs";
function wav(samples = 16000) {
  const b = Buffer.alloc(44 + samples * 2);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(samples * 2, 40);
  return b;
}
test("accepts canonical 16 kHz mono PCM and reports silence", () =>
  assert.equal(validateWav(wav()).silent, true));
test("rejects non-WAV, wrong rate and oversized audio", () => {
  assert.throws(() => validateWav(Buffer.from("nope")));
  const b = wav();
  b.writeUInt32LE(48000, 24);
  assert.throws(() => validateWav(b));
  assert.throws(() => validateWav(wav(16 * 16000)));
});
test("only allows loopback hosts and same local app origins", () => {
  assert.equal(allowedRequest("127.0.0.1:8787", "http://127.0.0.1:5173"), true);
  assert.equal(
    allowedRequest("evil.example:8787", "http://127.0.0.1:5173"),
    false,
  );
  assert.equal(allowedRequest("localhost:8787", "https://evil.example"), false);
  assert.equal(allowedRequest("localhost:8787", undefined), true);
});
