export function encodeWav(samples: Float32Array, rate: number): ArrayBuffer {
  const ratio = rate / 16000;
  const count = Math.floor(samples.length / ratio);
  const buffer = new ArrayBuffer(44 + count * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + count * 2, true);
  write(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * ratio),
      end = Math.min(
        samples.length,
        Math.max(start + 1, Math.floor((i + 1) * ratio)),
      );
    let value = 0;
    for (let j = start; j < end; j++) value += samples[j];
    value = Math.max(-1, Math.min(1, value / (end - start)));
    view.setInt16(
      44 + i * 2,
      Math.round(value * (value < 0 ? 32768 : 32767)),
      true,
    );
  }
  return buffer;
}
export type AudioSession = { stop: () => void };
export async function captureLocalAudio(
  deviceId: string,
  onAudio: (wav: ArrayBuffer, startMs: number, endMs: number) => void,
  onLevel: (level: number) => void,
  onEnd: () => void,
): Promise<AudioSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  let context: AudioContext | undefined;
  let node: AudioWorkletNode | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let mute: GainNode | undefined;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const track of stream.getTracks()) {
      track.onended = null;
      track.stop();
    }
    node?.disconnect();
    source?.disconnect();
    mute?.disconnect();
    if (context && context.state !== "closed") void context.close();
    onLevel(0);
  };
  try {
    context = new AudioContext();
    await context.resume();
    await context.audioWorklet.addModule(
      `${import.meta.env.BASE_URL}audio-capture.js`,
    );
    node = new AudioWorkletNode(context, "simple-service-capture");
    source = context.createMediaStreamSource(stream);
    mute = context.createGain();
    mute.gain.value = 0;
    node.port.onmessage = (e) => {
      if (stopped) return;
      if (e.data.type === "level") onLevel(e.data.level);
      if (e.data.type === "audio")
        onAudio(
          encodeWav(e.data.samples, context!.sampleRate),
          e.data.startMs,
          e.data.endMs,
        );
    };
    source.connect(node);
    node.connect(mute);
    mute.connect(context.destination);
    stream.getAudioTracks()[0].onended = () => {
      stop();
      onEnd();
    };
    return { stop };
  } catch (e) {
    stop();
    throw e;
  }
}
