import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronRight,
  Loader2,
  Mic,
  Search,
  Square,
  WifiOff,
} from "lucide-react";
import {
  BibleIndex,
  loadBible,
  type BibleVerse,
  type Detection,
  type ReadingContext,
} from "./scripture";
import { captureLocalAudio, type AudioSession } from "./local-audio";
import { TranscriptWindow } from "./transcript";
type EngineStatus = { ready: boolean; model?: string; error?: string };
export default function ScripturePanel({
  onPreview,
  onBibleReady,
}: {
  onPreview: (verse: BibleVerse, bible: BibleIndex) => void;
  onBibleReady: (bible: BibleIndex) => void;
}) {
  const [bible, setBible] = useState<BibleIndex>();
  const [status, setStatus] = useState<EngineStatus>({ ready: false });
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [level, setLevel] = useState(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState("");
  const [transcript, setTranscript] = useState<
    { text: string; time: string }[]
  >([]);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Detection[]>([]);
  const [automatic, setAutomatic] = useState(true);
  const [latency, setLatency] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const session = useRef<AudioSession | undefined>(undefined);
  const generation = useRef(0);
  const alive = useRef(true);
  const busy = useRef(false);
  const request = useRef<AbortController | undefined>(undefined);
  const context = useRef<ReadingContext | undefined>(undefined);
  const transcriptWindow = useRef(new TranscriptWindow());
  const seen = useRef(new Map<string, number>());
  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;
  const onReadyRef = useRef(onBibleReady);
  onReadyRef.current = onBibleReady;
  const automaticRef = useRef(automatic);
  automaticRef.current = automatic;
  const refreshDevices = () =>
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((list) => {
        if (alive.current)
          setDevices(list.filter((d) => d.kind === "audioinput"));
      })
      .catch(() => {});
  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/local-ai/status", {
        signal: AbortSignal.timeout(3000),
      });
      if (!r.ok) throw new Error();
      const data = await r.json();
      if (alive.current) setStatus(data);
    } catch {
      if (alive.current)
        setStatus({
          ready: false,
          error:
            "Local AI is not running. Start the local companion, then check again.",
        });
    }
  }, []);
  const stop = useCallback(() => {
    generation.current++;
    request.current?.abort();
    request.current = undefined;
    session.current?.stop();
    session.current = undefined;
    busy.current = false;
    setListening(false);
    setStarting(false);
    setProcessing(false);
    setLevel(0);
  }, []);
  useEffect(() => {
    alive.current = true;
    loadBible()
      .then((b) => {
        if (alive.current) {
          setBible(b);
          onReadyRef.current(b);
        }
      })
      .catch((e) => {
        if (alive.current) setError(e.message);
      });
    void refreshStatus();
    void refreshDevices();
    const timer = setInterval(() => void refreshStatus(), 5000);
    return () => {
      alive.current = false;
      clearInterval(timer);
      generation.current++;
      request.current?.abort();
      session.current?.stop();
    };
  }, [refreshStatus]);
  useEffect(() => {
    if (!bible || !query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      const direct = bible.detect(query);
      setResults(direct.results.length ? direct.results : bible.search(query));
    }, 150);
    return () => clearTimeout(timer);
  }, [query, bible]);
  const show = (verse: BibleVerse) => {
    if (!bible) return;
    context.current = {
      book: verse.book,
      chapter: verse.chapter,
      verse: verse.verse,
      at: Date.now(),
    };
    onPreviewRef.current(verse, bible);
  };
  async function start() {
    if (!bible || !status.ready) return;
    const ticket = ++generation.current;
    setError("");
    setStarting(true);
    setSkipped(0);
    context.current = undefined;
    seen.current.clear();
    transcriptWindow.current = new TranscriptWindow();
    try {
      const next = await captureLocalAudio(
        device,
        async (wav, startMs, endMs) => {
          if (ticket !== generation.current) return;
          if (busy.current) {
            setSkipped((n) => n + 1);
            return;
          }
          busy.current = true;
          setProcessing(true);
          const abort = new AbortController();
          request.current = abort;
          try {
            const response = await fetch("/api/local-ai/transcribe", {
              method: "POST",
              headers: { "Content-Type": "audio/wav" },
              body: wav,
              signal: AbortSignal.any([
                abort.signal,
                AbortSignal.timeout(50000),
              ]),
            });
            const data = await response.json();
            if (!response.ok)
              throw new Error(data.error || "Transcription failed.");
            if (ticket !== generation.current) return;
            setLatency(data.elapsedMs);
            const text = transcriptWindow.current.accept(
              String(data.text || "").trim(),
              startMs,
              endMs,
            );
            if (!text) return;
            setTranscript((items) => [
              ...items.slice(-7),
              {
                text,
                time: new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                }),
              },
            ]);
            const found = bible.detect(text, context.current);
            context.current = found.context;
            const fresh = found.results.filter(
              (v) => Date.now() - (seen.current.get(v.reference) || 0) > 20000,
            );
            fresh.forEach((v) => seen.current.set(v.reference, Date.now()));
            if (fresh.length) {
              setDetections((old) =>
                [
                  ...fresh,
                  ...old.filter(
                    (x) => !fresh.some((v) => v.reference === x.reference),
                  ),
                ].slice(0, 12),
              );
            }
            const direct = found.results.find(
              (v) =>
                v.kind === "Reference" &&
                v.book === found.context?.book &&
                v.chapter === found.context.chapter &&
                v.verse === found.context.verse,
            );
            if (direct && automaticRef.current)
              onPreviewRef.current(direct, bible);
          } catch (e) {
            if (ticket !== generation.current || abort.signal.aborted) return;
            setError((e as Error).message);
            stop();
            void refreshStatus();
          } finally {
            if (ticket === generation.current) {
              busy.current = false;
              setProcessing(false);
              request.current = undefined;
            }
          }
        },
        setLevel,
        () => {
          setError(
            "The microphone disconnected. Choose an input and start again.",
          );
          stop();
        },
      );
      if (ticket !== generation.current) {
        next.stop();
        return;
      }
      session.current = next;
      setListening(true);
      setStarting(false);
      void refreshDevices();
    } catch (e) {
      if (ticket !== generation.current) return;
      setStarting(false);
      setError(
        (e as Error).name === "NotAllowedError"
          ? "Microphone permission was denied. Allow it for this app in your browser settings."
          : (e as Error).message,
      );
    }
  }
  return (
    <section className="panel scripture-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow muted">SCRIPTURE ASSISTANT</div>
          <h2>
            <BookOpen size={18} /> Listen. Find. Present.
          </h2>
          <p>
            Local Whisper ·{" "}
            {bible ? "31,098 verses on this device" : "Loading local Bible…"}
          </p>
        </div>
        <span
          className={`engine-dot ${status.ready ? "ready" : ""}`}
          title={
            status.ready ? "Local Whisper ready" : "Local engine unavailable"
          }
        />
      </div>
      <div className="scripture-body">
        <div className="local-badge">
          <WifiOff size={13} />
          <span>Audio stays on this computer</span>
        </div>
        <label className="field">
          Microphone / sound desk
          <select
            value={device}
            disabled={listening || starting}
            onChange={(e) => setDevice(e.target.value)}
          >
            <option value="">System default input</option>
            {devices
              .filter((d) => d.deviceId !== "default")
              .map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Audio input ${i + 1}`}
                </option>
              ))}
          </select>
        </label>
        <button
          className={`primary full ${listening ? "listening-button" : ""}`}
          disabled={!bible || (!status.ready && !listening && !starting)}
          onClick={() => (listening || starting ? stop() : void start())}
        >
          {starting ? (
            <Loader2 className="spin" size={16} />
          ) : listening ? (
            <Square size={14} />
          ) : (
            <Mic size={16} />
          )}{" "}
          {starting
            ? "Cancel microphone setup"
            : listening
              ? "Stop listening"
              : "Start local listening"}
        </button>
        <div
          className="audio-meter"
          role="meter"
          aria-label="Microphone level"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.min(1, level * 5) * 100)}
        >
          <i style={{ width: `${Math.min(1, level * 5) * 100}%` }} />
        </div>
        <div className="listening-meta">
          <span>
            {processing
              ? "Transcribing locally…"
              : listening
                ? "Listening · new audio every 2 seconds"
                : status.ready
                  ? "Whisper ready"
                  : "Local engine not ready"}
          </span>
          {latency > 0 && (
            <span>{(latency / 1000).toFixed(1)}s processing</span>
          )}
        </div>
        {!status.ready && (
          <div className="local-setup">
            <p>{status.error || "Loading the local engine…"}</p>
            <details>
              <summary>Set up local listening</summary>
              <p>In the project folder, run once:</p>
              <code>npm run setup:local-ai</code>
              <p>Then keep this running:</p>
              <code>npm run local-ai</code>
              <p>
                The first setup downloads a model. Listening then works offline.
              </p>
            </details>
            <button
              className="text-button"
              onClick={() => void refreshStatus()}
            >
              Check connection again
            </button>
          </div>
        )}
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        {skipped > 0 && (
          <p className="form-note">
            The model is falling behind: {skipped} audio windows skipped to
            avoid a delayed queue. Try a smaller model or a faster computer.
          </p>
        )}
        <label className="switch-field">
          <span>Auto-preview spoken references</span>
          <input
            role="switch"
            type="checkbox"
            checked={automatic}
            onChange={(e) => setAutomatic(e.target.checked)}
          />
        </label>
        <p className="form-note">
          Detected references open in preview. Only Send live changes the
          audience screen.
        </p>
        <div className="scripture-section-heading">
          <h3>Live transcript</h3>
          {listening && <span className="recording-label">● LISTENING</span>}
        </div>
        <div className="transcript-feed" aria-live="polite">
          {transcript.length ? (
            transcript.map((item, i) => (
              <p key={i}>
                <time>{item.time}</time>
                {item.text}
              </p>
            ))
          ) : (
            <p className="transcript-placeholder">
              “Turn with me to John chapter three, verse sixteen…”
              <small>
                Words appear here after the first three seconds. Nothing is
                recorded to disk.
              </small>
            </p>
          )}
        </div>
        <div className="scripture-section-heading">
          <h3>Detected passages</h3>
          <span>{detections.length}</span>
        </div>
        <div className="detection-list">
          {detections.length ? (
            detections.map((v) => (
              <button key={v.reference} onClick={() => show(v)}>
                <span className="detection-ref">
                  <strong>{v.reference}</strong>
                  <small>
                    {v.kind === "Reference" ? (
                      <>
                        <Check size={10} /> Reference
                      </>
                    ) : (
                      "Quotation match"
                    )}
                  </small>
                </span>
                <p>{v.text}</p>
                <span className="detection-action">
                  Preview passage <ChevronRight size={12} />
                </span>
              </button>
            ))
          ) : (
            <p className="form-note">
              Spoken references and matching quotations will appear here. Try
              “Romans eight twenty-eight” or “next verse.”
            </p>
          )}
        </div>
        <div className="scripture-section-heading">
          <h3>Search your Bible</h3>
          <span>WEB</span>
        </div>
        <div className="search-field scripture-search">
          <Search size={16} />
          <input
            aria-label="Search Bible references or text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="John 3:16 or a quoted phrase"
          />
        </div>
        <div className="detection-list search-results">
          {results.map((v) => (
            <button key={v.reference} onClick={() => show(v)}>
              <strong>{v.reference}</strong>
              <p>{v.text}</p>
            </button>
          ))}
        </div>
        {query.trim() && !results.length && (
          <p className="form-note">
            No matching passage. Check the reference or try more words.
          </p>
        )}
        <p className="form-note">
          World English Bible · Public domain
          <br />
          Reference and quotation matching. Semantic paraphrase detection is not
          enabled.
        </p>
      </div>
    </section>
  );
}
