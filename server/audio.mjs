export function validateWav(b) {
  if (
    b.length < 32044 ||
    b.length > 480044 ||
    b.toString("ascii", 0, 4) !== "RIFF" ||
    b.toString("ascii", 8, 16) !== "WAVEfmt " ||
    b.readUInt32LE(16) !== 16 ||
    b.readUInt16LE(20) !== 1 ||
    b.readUInt16LE(22) !== 1 ||
    b.readUInt32LE(24) !== 16000 ||
    b.readUInt32LE(28) !== 32000 ||
    b.readUInt16LE(32) !== 2 ||
    b.readUInt16LE(34) !== 16 ||
    b.toString("ascii", 36, 40) !== "data" ||
    b.readUInt32LE(40) !== b.length - 44 ||
    (b.length - 44) % 2
  )
    throw new Error("Send 1–15 seconds of 16 kHz mono 16-bit PCM WAV.");
  let sum = 0;
  for (let i = 44; i < b.length; i += 2) sum += (b.readInt16LE(i) / 32768) ** 2;
  return { silent: Math.sqrt(sum / ((b.length - 44) / 2)) < 0.003 };
}
export function allowedRequest(host, origin) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host || "")) return false;
  if (!origin) return true;
  try {
    const u = new URL(origin);
    return (
      u.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(u.hostname) &&
      ["5173", "8787"].includes(u.port)
    );
  } catch {
    return false;
  }
}
