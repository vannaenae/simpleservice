// Three-second rolling PCM windows with one-second overlap. No recording is saved.
class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(sampleRate * 3);
    this.position = 0;
    this.written = 0;
    this.sinceChunk = 0;
    this.sinceLevel = 0;
  }
  process(inputs) {
    const samples = inputs[0]?.[0];
    if (!samples) return true;
    let energy = 0;
    for (const value of samples) {
      this.ring[this.position] = value;
      this.position = (this.position + 1) % this.ring.length;
      energy += value * value;
    }
    this.written += samples.length;
    this.sinceChunk += samples.length;
    this.sinceLevel += samples.length;
    if (this.sinceLevel >= sampleRate / 10) {
      this.port.postMessage({
        type: "level",
        level: Math.sqrt(energy / samples.length),
      });
      this.sinceLevel = 0;
    }
    if (this.written >= this.ring.length && this.sinceChunk >= sampleRate * 2) {
      const chunk = new Float32Array(this.ring.length);
      chunk.set(this.ring.subarray(this.position));
      chunk.set(
        this.ring.subarray(0, this.position),
        this.ring.length - this.position,
      );
      this.port.postMessage(
        {
          type: "audio",
          samples: chunk,
          startMs: ((this.written - this.ring.length) / sampleRate) * 1000,
          endMs: (this.written / sampleRate) * 1000,
        },
        [chunk.buffer],
      );
      this.sinceChunk = 0;
    }
    return true;
  }
}
registerProcessor("simple-service-capture", Capture);
