import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  Edit3,
  ExternalLink,
  LayoutDashboard,
  ListMusic,
  Maximize2,
  Mic,
  Monitor,
  Moon,
  Music2,
  Plus,
  Radio,
  Search,
  Settings2,
  Sparkles,
  Sun,
  Upload,
  X,
} from "lucide-react";
import {
  importSongs,
  matchSongs,
  mergeSongs,
  textSlides,
  validateSong,
  type Song,
} from "./library";
import {
  defaults,
  emptyOutput,
  Surface,
  type DisplaySettings,
  type Output,
  type Theme,
} from "./Projector";
import { seeds } from "./seeds";
const LIBRARY = "simple-service-library-v1";
const SETTINGS = "simple-service-settings-v1";
const PLAN = "simple-service-plan-v1";
function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function loadSongs() {
  try {
    const data = read<unknown>(LIBRARY, seeds);
    if (!Array.isArray(data) || !data.length) return seeds;
    return data.map((s) => ({
      ...validateSong(s),
      id: typeof s.id === "string" ? s.id : crypto.randomUUID(),
    }));
  } catch {
    return seeds;
  }
}
function loadSettings(): DisplaySettings {
  const s = read<Partial<DisplaySettings>>(SETTINGS, {});
  return {
    ...defaults,
    theme: ["forest", "dawn", "ocean", "ink"].includes(s.theme || "")
      ? s.theme!
      : defaults.theme,
    ratio: ["16 / 9", "4 / 3", "16 / 10"].includes(s.ratio || "")
      ? s.ratio!
      : defaults.ratio,
    fontSize:
      typeof s.fontSize === "number"
        ? Math.min(76, Math.max(28, s.fontSize))
        : 48,
    align: s.align === "left" ? "left" : "center",
    showCopyright: s.showCopyright !== false,
    license: typeof s.license === "string" ? s.license : "",
  };
}
function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button, input, textarea, select, a[href], [tabindex="0"]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <header>
          <div>
            <h2 id="modal-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const themes: { id: Theme; name: string; description: string }[] = [
  { id: "forest", name: "Still waters", description: "Forest" },
  { id: "dawn", name: "First light", description: "Apricot" },
  { id: "ocean", name: "Deep blue", description: "Ocean" },
  { id: "ink", name: "Simply black", description: "Minimal" },
];
export default function App() {
  const [songs, setSongs] = useState<Song[]>(loadSongs);
  const [selected, setSelected] = useState(() => loadSongs()[0].id);
  const [slide, setSlide] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All songs");
  const [settings, setSettings] = useState<DisplaySettings>(loadSettings);
  const [plan, setPlan] = useState<string[]>(() => {
    const p = read<unknown>(PLAN, ["holy-holy", "amazing-grace", "doxology"]);
    return Array.isArray(p) ? p.filter((x) => typeof x === "string") : [];
  });
  const [serviceName, setServiceName] = useState(() =>
    read("simple-service-name", "Sunday service"),
  );
  const [output, setOutput] = useState<Output>(emptyOutput);
  const [displayTab, setDisplayTab] = useState<"plan" | "display">("plan");
  const [modal, setModal] = useState<
    "import" | "song" | "settings" | "detect" | "help" | null
  >(null);
  const [editing, setEditing] = useState<Song | null>(null);
  const [toast, setToast] = useState("");
  const [dark, setDark] = useState(() => read("simple-service-dark", false));
  const [displayOpen, setDisplayOpen] = useState(false);
  const audienceSeen = useRef(0);
  const [time, setTime] = useState(new Date());
  const projector = useRef<Window | null>(null);
  const stage = useRef<Window | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const latest = useRef(output);
  latest.current = { ...output, settings };
  const song = songs.find((x) => x.id === selected) || songs[0];
  const currentSlide = Math.min(slide, song.slides.length - 1);
  const preview: Output = {
    title: song.title,
    slide: song.slides[currentSlide],
    next: song.slides[currentSlide + 1],
    index: currentSlide,
    total: song.slides.length,
    copyright: song.copyright,
    ccli: song.ccli,
    blank: false,
    settings,
  };
  const notify = (message: string) => setToast(message);
  useEffect(() => {
    try {
      localStorage.setItem(LIBRARY, JSON.stringify(songs));
      localStorage.setItem(SETTINGS, JSON.stringify(settings));
      localStorage.setItem(PLAN, JSON.stringify(plan));
      localStorage.setItem("simple-service-name", JSON.stringify(serviceName));
      localStorage.setItem("simple-service-dark", JSON.stringify(dark));
    } catch {
      setToast(
        "Browser storage is full or unavailable. Export a backup to keep your changes.",
      );
    }
  }, [songs, settings, plan, serviceName, dark]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const c = new BroadcastChannel("simple-service-output");
    channel.current = c;
    const send = () =>
      c.postMessage({ type: "output", output: latest.current });
    c.onmessage = (e) => {
      if (e.data?.type === "hello") send();
      if (e.data?.type === "presence" && !e.data.stage) {
        audienceSeen.current = Date.now();
        setDisplayOpen(true);
      }
    };
    const id = setInterval(() => {
      send();
      setDisplayOpen(
        Date.now() - audienceSeen.current < 3500 ||
          Boolean(projector.current && !projector.current.closed),
      );
      setTime(new Date());
    }, 1000);
    return () => {
      clearInterval(id);
      c.close();
    };
  }, []);
  useEffect(() => {
    channel.current?.postMessage({
      type: "output",
      output: { ...output, settings },
    });
  }, [output, settings]);
  function choose(s: Song) {
    setSelected(s.id);
    setSlide(0);
  }
  function goLive(index = currentSlide) {
    const i = Math.max(0, Math.min(index, song.slides.length - 1));
    setSlide(i);
    setOutput({
      ...preview,
      slide: song.slides[i],
      next: song.slides[i + 1],
      index: i,
      blank: false,
    });
    if (!displayOpen)
      notify(
        "Live preview updated. Open the projector window to show your audience.",
      );
  }
  function step(delta: number) {
    setSlide((i) => Math.max(0, Math.min(i + delta, song.slides.length - 1)));
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        modal ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable]",
        )
      )
        return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      }
      if (e.key === "Enter") {
        if ((e.target as HTMLElement).closest("button,a,[role=button]")) return;
        e.preventDefault();
        goLive();
      }
      if (e.key.toLowerCase() === "b") {
        e.preventDefault();
        setOutput((o) => ({ ...o, blank: !o.blank }));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  function openDisplay(isStage = false) {
    const ref = isStage ? stage : projector;
    ref.current = window.open(
      `${location.pathname}?output=${isStage ? "stage" : "audience"}`,
      `simple-service-${isStage ? "stage" : "audience"}`,
      "popup,width=1280,height=720",
    );
    if (!ref.current) {
      notify(
        "Your browser blocked the window. Allow pop-ups for Simple Service and try again.",
      );
      return;
    }
    ref.current.focus();
    if (!isStage) setDisplayOpen(true);
  }
  const filtered = songs.filter(
    (s) =>
      (filter === "All songs" ||
        (filter === "Public domain"
          ? s.source === "Public domain"
          : s.source !== "Public domain")) &&
      `${s.title} ${s.author} ${s.ccli} ${s.slides.map((x) => x.text).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const planned = plan
    .map((id) => songs.find((s) => s.id === id))
    .filter((x): x is Song => !!x);
  function addToPlan() {
    if (plan.includes(song.id)) {
      notify("This song is already in your service.");
      return;
    }
    setPlan([...plan, song.id]);
    notify(`${song.title} added to the service.`);
  }
  function reorder(i: number, delta: number) {
    const next = planned.map((s) => s.id);
    const j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setPlan(next);
  }
  function saveSong(saved: Song) {
    setSongs((existing) =>
      editing
        ? existing.map((s) =>
            s.id === editing.id ? { ...saved, id: editing.id } : s,
          )
        : [...existing, saved],
    );
    setSelected(editing?.id || saved.id);
    setSlide(0);
    setModal(null);
    notify(
      editing
        ? "Song updated. Live output stays as presented."
        : "Your song is ready.",
    );
  }
  return (
    <div className={`app ${dark ? "dark" : ""}`}>
      <aside className="rail">
        <a className="brand-mark" href="./" aria-label="Simple Service home">
          <Sun size={28} />
        </a>
        <div className="rail-links">
          <button
            className="rail-button active"
            title="Workspace"
            aria-label="Workspace"
            onClick={() =>
              document
                .getElementById("workspace")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <LayoutDashboard />
          </button>
          <button
            className="rail-button"
            title="Song library"
            aria-label="Song library"
            onClick={() => document.getElementById("song-search")?.focus()}
          >
            <BookOpen />
          </button>
          <button
            className="rail-button"
            title="Service plan"
            aria-label="Service plan"
            onClick={() => setDisplayTab("plan")}
          >
            <ListMusic />
          </button>
          <button
            className="rail-button"
            title="Projector controls"
            aria-label="Projector controls"
            onClick={() => setDisplayTab("display")}
          >
            <Monitor />
          </button>
        </div>
        <div className="rail-bottom">
          <button
            className="rail-button"
            title="Help"
            aria-label="Help"
            onClick={() => setModal("help")}
          >
            <CircleHelp />
          </button>
          <button
            className="rail-button"
            title="Settings"
            aria-label="Settings"
            onClick={() => setModal("settings")}
          >
            <Settings2 />
          </button>
          <span className="avatar">SS</span>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="wordmark">
            simple<span>service</span>
            <i>YOUR WORSHIP WORKSPACE</i>
          </div>
          <div className="top-actions">
            <span className="saved">
              <span /> Saved on this device
            </span>
            <button
              className="icon-button"
              aria-label={dark ? "Use light theme" : "Use dark theme"}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              className="secondary small"
              onClick={() => setModal("help")}
            >
              <CircleHelp size={16} /> Quick guide
            </button>
          </div>
        </header>
        <main id="workspace">
          <section className="workspace-heading">
            <div>
              <div className="eyebrow">
                <span /> MAKE ROOM FOR THE MOMENT
              </div>
              <h1>
                Less setup. More worship<span>.</span>
              </h1>
              <p>Your songs, your service, one beautifully simple space.</p>
            </div>
            <button
              className="detect-button"
              onClick={() => setModal("detect")}
            >
              <span className="detect-icon">
                <Sparkles size={20} />
              </span>
              <span>
                Find a song<small>Let the lyrics lead the way</small>
              </span>
              <ArrowUpRight size={18} />
            </button>
          </section>
          <section className="service-toolbar">
            <div className="service-title">
              <span className="service-symbol">
                <Sun size={23} />
              </span>
              <div>
                <label className="sr-only" htmlFor="service-name">
                  Service name
                </label>
                <input
                  id="service-name"
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  maxLength={80}
                />
                <span>
                  {planned.length} songs in your service <b>·</b> Ready when you
                  are
                </span>
              </div>
            </div>
            <div className="service-actions">
              <span className={`connection ${displayOpen ? "connected" : ""}`}>
                <span />
                {displayOpen ? "Projector window open" : "Projector not open"}
              </span>
              <button className="primary" onClick={() => openDisplay()}>
                <Monitor size={16} />
                {displayOpen ? "Show projector" : "Open projector"}
                <ArrowUpRight size={16} />
              </button>
            </div>
          </section>
          <div className="workspace-grid">
            <section className="panel library-panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    Song library <span className="count">{songs.length}</span>
                  </h2>
                  <p>A home for every song.</p>
                </div>
                <button
                  className="icon-button bordered"
                  aria-label="Create a song"
                  onClick={() => {
                    setEditing(null);
                    setModal("song");
                  }}
                >
                  <Plus size={18} />
                </button>
              </div>
              <div className="search-field">
                <Search size={17} />
                <input
                  id="song-search"
                  placeholder="Search songs, lyrics, CCLI…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    className="icon-button"
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="filter-row">
                {["All songs", "Public domain", "Imported"].map((f) => (
                  <button
                    key={f}
                    className={filter === f ? "selected" : ""}
                    onClick={() => setFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="song-list">
                {filtered.map((s, i) => (
                  <button
                    key={s.id}
                    className={`song-row ${song.id === s.id ? "selected" : ""}`}
                    onClick={() => choose(s)}
                  >
                    <span className={`song-icon color-${i % 4}`}>
                      <Music2 size={19} />
                    </span>
                    <span className="song-info">
                      <strong>{s.title}</strong>
                      <small>{s.author || "Your song library"}</small>
                      <span className="source-label">
                        {s.source === "Public domain"
                          ? "PUBLIC DOMAIN"
                          : s.ccli
                            ? `CCLI #${s.ccli}`
                            : s.source.toUpperCase()}
                      </span>
                    </span>
                    {song.id === s.id && <span className="selected-dot" />}
                  </button>
                ))}
                {!filtered.length && (
                  <div className="empty">
                    <Search />
                    <h3>No songs found</h3>
                    <p>Try a lyric, a different title, or import a song.</p>
                    <button
                      className="text-button"
                      onClick={() => setQuery("")}
                    >
                      Clear search
                    </button>
                  </div>
                )}
              </div>
              <div className="library-footer">
                <button
                  className="secondary full"
                  onClick={() => setModal("import")}
                >
                  <Upload size={16} /> Import songs
                </button>
                <p>Bring the songs you already love.</p>
              </div>
              <div className="tip-card">
                <span>
                  <Sparkles size={18} />
                </span>
                <div>
                  <strong>A little help finding the words</strong>
                  <p>Speak or type a lyric to find a song in your library.</p>
                  <button onClick={() => setModal("detect")}>
                    Try song matching <ArrowUpRight size={14} />
                  </button>
                </div>
              </div>
            </section>
            <section className="panel editor-panel">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow muted">SONG WORKSPACE</div>
                  <h2 className="song-title">{song.title}</h2>
                  <p>
                    {song.author || "Your song"} <span>·</span>{" "}
                    {song.slides.length} slides
                  </p>
                </div>
                <button
                  className="icon-button bordered"
                  aria-label="Edit selected song"
                  onClick={() => {
                    setEditing(song);
                    setModal("song");
                  }}
                >
                  <Edit3 size={17} />
                </button>
              </div>
              <div className="preview-label">
                <span>
                  <i /> PREVIEW
                </span>
                <span>
                  {settings.ratio.replace(" / ", ":")} <b>·</b>{" "}
                  {song.slides[currentSlide].label}
                </span>
              </div>
              <Surface output={preview} preview />
              <div className="preview-controls">
                <div className="step-controls">
                  <button
                    className="icon-button bordered"
                    aria-label="Previous slide"
                    disabled={currentSlide === 0}
                    onClick={() => step(-1)}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span>
                    {currentSlide + 1} <em>/ {song.slides.length}</em>
                  </span>
                  <button
                    className="icon-button bordered"
                    aria-label="Next slide"
                    disabled={currentSlide === song.slides.length - 1}
                    onClick={() => step(1)}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
                <button
                  className="primary live-button"
                  onClick={() => goLive()}
                >
                  <Radio size={16} /> Send live <kbd>↵</kbd>
                </button>
              </div>
              <div className="slides-heading">
                <h3>Song slides</h3>
                <span>Select to preview · Enter to present</span>
              </div>
              <div className="slide-grid">
                {song.slides.map((s, i) => (
                  <button
                    key={i}
                    className={`slide-card ${i === currentSlide ? "selected" : ""}`}
                    onClick={() => setSlide(i)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        goLive(i);
                      }
                    }}
                    onDoubleClick={() => goLive(i)}
                  >
                    <div>
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      <strong>{s.label}</strong>
                      {i === currentSlide && <Check size={14} />}
                    </div>
                    <p>{s.text}</p>
                  </button>
                ))}
              </div>
              <div className="editor-bottom">
                <span>
                  <Check size={14} />{" "}
                  {song.source === "Public domain"
                    ? "Traditional public-domain lyrics"
                    : "Imported to your local library"}
                </span>
                <button className="text-button" onClick={addToPlan}>
                  <Plus size={15} /> Add to service
                </button>
              </div>
            </section>
            <aside className="right-column">
              <section className="panel plan-panel">
                <div className="tabs">
                  <button
                    className={displayTab === "plan" ? "active" : ""}
                    onClick={() => setDisplayTab("plan")}
                  >
                    <ListMusic size={16} /> Service plan
                  </button>
                  <button
                    className={displayTab === "display" ? "active" : ""}
                    onClick={() => setDisplayTab("display")}
                  >
                    <Settings2 size={16} /> Projector
                  </button>
                </div>
                {displayTab === "plan" ? (
                  <>
                    <div className="plan-heading">
                      <div>
                        <h3>A thoughtful flow.</h3>
                        <p>Make the service your own.</p>
                      </div>
                      <span className="count">{planned.length}</span>
                    </div>
                    <div className="plan-list">
                      {planned.map((s, i) => (
                        <div
                          className={`plan-item ${s.id === song.id ? "selected" : ""}`}
                          key={s.id}
                        >
                          <button
                            className="plan-select"
                            onClick={() => choose(s)}
                          >
                            <span className="plan-number">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span>
                              <strong>{s.title}</strong>
                              <small>{s.slides.length} slides · Song</small>
                            </span>
                          </button>
                          <div className="plan-item-actions">
                            <button
                              aria-label={`Move ${s.title} up`}
                              disabled={i === 0}
                              onClick={() => reorder(i, -1)}
                            >
                              <ArrowUp size={12} />
                            </button>
                            <button
                              aria-label={`Move ${s.title} down`}
                              disabled={i === planned.length - 1}
                              onClick={() => reorder(i, 1)}
                            >
                              <ArrowDown size={12} />
                            </button>
                            <button
                              aria-label={`Remove ${s.title} from service`}
                              onClick={() =>
                                setPlan(plan.filter((id) => id !== s.id))
                              }
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {!planned.length && (
                        <div className="empty">
                          <ListMusic />
                          <p>
                            Your service starts with a song. Choose one and add
                            it below.
                          </p>
                        </div>
                      )}
                    </div>
                    <button className="add-plan" onClick={addToPlan}>
                      <Plus size={15} /> Add selected song
                    </button>
                    <div className="plan-note">
                      <span /> Space for the spontaneous.
                    </div>
                  </>
                ) : (
                  <div className="display-settings">
                    <DisplayControls
                      settings={settings}
                      onChange={setSettings}
                    />
                    <button
                      className="secondary full"
                      onClick={() => openDisplay(true)}
                    >
                      <ExternalLink size={15} /> Open stage display
                    </button>
                  </div>
                )}
              </section>
              <section className="panel live-panel">
                <div className="live-heading">
                  <h3>
                    <span className={`live-dot ${output.blank ? "off" : ""}`} />
                    {output.blank ? "OUTPUT BLACKED OUT" : "LIVE OUTPUT"}
                  </h3>
                  <button
                    className="icon-button"
                    aria-label="Show audience window"
                    onClick={() => openDisplay()}
                  >
                    <Maximize2 size={15} />
                  </button>
                </div>
                <Surface output={{ ...output, settings }} />
                <div className="live-caption">
                  <span>{output.title || "Ready for your first slide"}</span>
                  <small>
                    {output.title
                      ? `${output.index + 1} / ${output.total}`
                      : "—"}
                  </small>
                </div>
                <button
                  className={`blackout-button ${output.blank ? "is-blank" : ""}`}
                  disabled={!output.title}
                  onClick={() => setOutput((o) => ({ ...o, blank: !o.blank }))}
                >
                  <Monitor size={16} />
                  {output.blank ? "Restore live output" : "Black out screen"}
                  <kbd>B</kbd>
                </button>
                <p>Preview freely. Present when you’re ready.</p>
              </section>
              <div className="quiet-note">
                <Sun size={19} />
                <span>Keep the focus on what matters.</span>
              </div>
            </aside>
          </div>
          <footer className="workspace-footer">
            <span>
              <span className="status-dot" /> Your space is ready.
            </span>
            <div>
              <span>
                <kbd>←</kbd>
                <kbd>→</kbd> Browse slides
              </span>
              <span>
                <kbd>↵</kbd> Send live
              </span>
              <span>
                <kbd>B</kbd> Blackout
              </span>
            </div>
            <span>
              {time.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal === "import" && (
        <ImportDialog
          onClose={() => setModal(null)}
          onImport={(incoming) => {
            const result = mergeSongs(songs, incoming);
            setSongs(result.songs);
            setModal(null);
            notify(
              `${result.added} songs imported${result.duplicates ? `; ${result.duplicates} duplicates skipped` : ""}.`,
            );
          }}
        />
      )}
      {modal === "song" && (
        <SongDialog
          song={editing}
          onSave={saveSong}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "detect" && (
        <DetectDialog
          songs={songs}
          onChoose={(s) => {
            choose(s);
            setModal(null);
            notify(
              "Song loaded into preview. Select a slide, then send it live.",
            );
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "settings" && (
        <Modal
          title="Make yourself at home"
          subtitle="Presentation, licensing, and your library."
          onClose={() => setModal(null)}
        >
          <DisplayControls settings={settings} onChange={setSettings} />
          <label className="field">
            Church CCLI licence number
            <input
              value={settings.license}
              onChange={(e) =>
                setSettings({ ...settings, license: e.target.value })
              }
              placeholder="Optional · shown in the lyric footer"
            />
          </label>
          <p className="form-note">
            This stores your licence details; it does not connect to or verify a
            CCLI account. Import lyrics you’re authorised to use.
          </p>
          <a
            className="external-link"
            href="https://songselect.ccli.com/"
            target="_blank"
            rel="noreferrer"
          >
            Visit SongSelect <ExternalLink size={14} />
          </a>
          <div className="settings-backup">
            <h3>Keep a copy of your songs</h3>
            <p>
              Songs and service changes are saved in this browser. Export your
              library before clearing browser data or switching devices.
            </p>
            <button
              className="secondary"
              onClick={() =>
                download("simple-service-library.json", { version: 1, songs })
              }
            >
              <Download size={16} /> Export song library
            </button>
          </div>
        </Modal>
      )}
      {modal === "help" && (
        <Modal
          title="A calmer Sunday starts here."
          subtitle="From your first song to your final amen."
          onClose={() => setModal(null)}
        >
          <ol className="guide">
            <li>
              <strong>Build your library</strong>
              <p>
                Start with the traditional hymns, create a song, or import text,
                OpenLyrics, OpenSong, or a Simple Service backup.
              </p>
            </li>
            <li>
              <strong>Make a service plan</strong>
              <p>
                Choose a song and select Add to service. Use the arrows beside
                each song to arrange the order.
              </p>
            </li>
            <li>
              <strong>Connect your screen</strong>
              <p>
                Open projector, move that window to your external display, and
                enter fullscreen. Choose aspect ratio and text size in the
                Projector tab. Stage display shows current and next lyrics.
              </p>
            </li>
            <li>
              <strong>Present with confidence</strong>
              <p>
                Click any slide to preview it. Enter sends it live. Left and
                right arrows browse slides; B blacks out or restores the
                audience screen.
              </p>
            </li>
          </ol>
          <div className="info-box">
            Song matching uses recognised or typed lyrics from your local
            library. It does not identify instrumental audio. Microphone
            recognition depends on browser support and may use your browser
            provider’s online service.
          </div>
        </Modal>
      )}
    </div>
  );
}
function DisplayControls({
  settings,
  onChange,
}: {
  settings: DisplaySettings;
  onChange: (s: DisplaySettings) => void;
}) {
  return (
    <>
      <label className="field">
        Screen format
        <select
          value={settings.ratio}
          onChange={(e) => onChange({ ...settings, ratio: e.target.value })}
        >
          <option value="16 / 9">Widescreen · 16:9</option>
          <option value="4 / 3">Standard projector · 4:3</option>
          <option value="16 / 10">Wide display · 16:10</option>
        </select>
      </label>
      <label className="field">
        Text size <span>{settings.fontSize}</span>
        <input
          type="range"
          min="28"
          max="76"
          value={settings.fontSize}
          onChange={(e) =>
            onChange({ ...settings, fontSize: Number(e.target.value) })
          }
        />
      </label>
      <label className="field">
        Alignment
        <select
          value={settings.align}
          onChange={(e) =>
            onChange({
              ...settings,
              align: e.target.value as "center" | "left",
            })
          }
        >
          <option value="center">Centred</option>
          <option value="left">Left aligned</option>
        </select>
      </label>
      <div className="field">
        Slide atmosphere
        <div className="theme-picker">
          {themes.map((t) => (
            <button
              key={t.id}
              title={t.name}
              aria-label={`${t.name} background`}
              aria-pressed={settings.theme === t.id}
              className={`theme-swatch ${t.id} ${settings.theme === t.id ? "selected" : ""}`}
              onClick={() => onChange({ ...settings, theme: t.id })}
            >
              {settings.theme === t.id && <Check size={18} />}
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      </div>
      <label className="switch-field">
        <span>Show copyright footer</span>
        <input
          role="switch"
          type="checkbox"
          checked={settings.showCopyright}
          onChange={(e) =>
            onChange({ ...settings, showCopyright: e.target.checked })
          }
        />
      </label>
    </>
  );
}
function ImportDialog({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (songs: Song[]) => void;
}) {
  const [pending, setPending] = useState<Song[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [paste, setPaste] = useState("");
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  async function files(list: FileList | null) {
    if (!list) return;
    setLoading(true);
    const added: Song[] = [];
    const problems: string[] = [];
    for (const f of Array.from(list)) {
      try {
        if (f.size > 5_000_000) throw new Error("File exceeds 5 MB.");
        added.push(...importSongs(await f.text(), f.name));
      } catch (e) {
        problems.push(`${f.name}: ${(e as Error).message}`);
      }
    }
    if (mounted.current) {
      setPending(added);
      setErrors(problems);
      setLoading(false);
    }
  }
  return (
    <Modal
      title="Bring your songs along."
      subtitle="Your familiar songs. A fresh space to lead them."
      onClose={onClose}
    >
      <label className="upload-zone">
        <Upload size={28} />
        <strong>{loading ? "Reading your songs…" : "Choose song files"}</strong>
        <span>Text, OpenLyrics, OpenSong XML, or JSON backups</span>
        <small>Multiple files welcome · up to 5 MB per file</small>
        <input
          type="file"
          multiple
          accept=".txt,.xml,.json,.ews,.ewsx,.db,.sqlite"
          disabled={loading}
          onChange={(e) => void files(e.target.files)}
        />
      </label>
      <div className="info-box">
        <strong>Coming from EasyWorship or FreeWorship?</strong>
        <p>
          Export your lyrics as a supported text or XML format, or paste them
          below. Native databases and packed service files are not supported
          yet.
        </p>
      </div>
      <label className="field">
        Or paste a song
        <textarea
          rows={5}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={
            "Song title\n\nVerse 1\nYour lyrics here\n\nChorus\nYour chorus here"
          }
        />
      </label>
      <button
        className="secondary"
        disabled={!paste.trim()}
        onClick={() => {
          try {
            setPending(importSongs(paste, "pasted.txt"));
            setErrors([]);
          } catch (e) {
            setErrors([(e as Error).message]);
          }
        }}
      >
        Preview pasted song
      </button>
      {errors.length > 0 && (
        <div className="error-box" role="alert">
          {errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}
      {pending.length > 0 && (
        <div className="import-review">
          <h3>{pending.length} songs ready to import</h3>
          {pending.map((s, i) => (
            <div key={i}>
              <Music2 size={15} />
              <span>{s.title}</span>
              <small>{s.slides.length} slides</small>
            </div>
          ))}
        </div>
      )}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={!pending.length || loading}
          onClick={() => onImport(pending)}
        >
          <Upload size={16} /> Import {pending.length || ""}{" "}
          {pending.length === 1 ? "song" : "songs"}
        </button>
      </div>
    </Modal>
  );
}
function SongDialog({
  song,
  onClose,
  onSave,
}: {
  song: Song | null;
  onClose: () => void;
  onSave: (s: Song) => void;
}) {
  const [title, setTitle] = useState(song?.title || "");
  const [author, setAuthor] = useState(song?.author || "");
  const [ccli, setCcli] = useState(song?.ccli || "");
  const [copyright, setCopyright] = useState(song?.copyright || "");
  const [lyrics, setLyrics] = useState(
    song?.slides.map((s) => `[${s.label}]\n${s.text}`).join("\n\n") || "",
  );
  const [error, setError] = useState("");
  return (
    <Modal
      title={song ? "Make the words your own." : "A new song starts here."}
      subtitle="Separate slides with a blank line. Add Verse or Chorus headings."
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onSave(
              validateSong({
                title,
                author,
                ccli,
                copyright,
                source: song?.source || "My songs",
                slides: textSlides(lyrics),
              }),
            );
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <div className="form-grid">
          <label className="field">
            Song title
            <input
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="field">
            Author
            <input value={author} onChange={(e) => setAuthor(e.target.value)} />
          </label>
        </div>
        <label className="field">
          Lyrics
          <textarea
            required
            rows={12}
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            placeholder={
              "Verse 1\nFirst line\nSecond line\n\nChorus\nYour chorus"
            }
          />
        </label>
        <div className="form-grid">
          <label className="field">
            CCLI song number
            <input value={ccli} onChange={(e) => setCcli(e.target.value)} />
          </label>
          <label className="field">
            Copyright / credit
            <input
              value={copyright}
              onChange={(e) => setCopyright(e.target.value)}
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            <Check size={16} /> Save song
          </button>
        </div>
      </form>
    </Modal>
  );
}
// Browser speech recognition is optional. No synthetic matches or microphone visualisation.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((e: {
        results: {
          length: number;
          [key: number]: { 0: { transcript: string }; isFinal: boolean };
        };
        resultIndex: number;
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
function DetectDialog({
  songs,
  onClose,
  onChoose,
}: {
  songs: Song[];
  onClose: () => void;
  onChoose: (s: Song) => void;
}) {
  const [words, setWords] = useState("");
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState("en-US");
  const rec = useRef<Recognition | null>(null);
  const Speech =
    (
      window as unknown as {
        SpeechRecognition?: new () => Recognition;
        webkitSpeechRecognition?: new () => Recognition;
      }
    ).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: new () => Recognition })
      .webkitSpeechRecognition;
  useEffect(
    () => () => {
      if (rec.current) {
        rec.current.onresult = null;
        rec.current.onerror = null;
        rec.current.onend = null;
        rec.current.abort();
      }
    },
    [],
  );
  const matches = matchSongs(words, songs);
  function listen() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    if (!Speech) return;
    setError("");
    try {
      const r = new Speech();
      rec.current = r;
      r.lang = language;
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (e) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++)
          text += e.results[i][0].transcript + " ";
        setWords(text.trim().split(/\s+/).slice(-35).join(" "));
      };
      r.onerror = (e) => {
        setError(
          e.error === "not-allowed"
            ? "Microphone access was denied. Allow it in browser settings, or type the lyrics below."
            : `Recognition stopped (${e.error}). Try again or type a lyric.`,
        );
        setListening(false);
      };
      r.onend = () => setListening(false);
      r.start();
      setListening(true);
    } catch {
      setError("Recognition could not start. Try typing the lyrics.");
    }
  }
  return (
    <Modal
      title="Let the lyrics lead the way."
      subtitle="Find a song from the words you remember."
      onClose={onClose}
    >
      <div className={`listening-orb ${listening ? "listening" : ""}`}>
        <Mic size={30} />
      </div>
      <p className="detection-description">
        Speak a few lyric lines, or type them below. We’ll look for a match in
        your {songs.length} songs.
      </p>
      <label className="field">
        Recognition language
        <select
          disabled={listening}
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="en-US">English (US)</option>
          <option value="en-GB">English (UK)</option>
          <option value="fr-FR">French</option>
          <option value="es-ES">Spanish</option>
          <option value="pt-BR">Portuguese</option>
        </select>
      </label>
      <button className="primary full" disabled={!Speech} onClick={listen}>
        <Mic size={17} />
        {listening
          ? "Stop listening"
          : Speech
            ? "Start listening"
            : "Voice recognition unavailable in this browser"}
      </button>
      <p className="form-note">
        Starting enables your microphone. Your browser’s speech provider may
        process audio online. This matches words, not melody; singing may be
        less reliable than speech.
      </p>
      <label className="field">
        Words you hear
        <textarea
          rows={3}
          value={words}
          onChange={(e) => setWords(e.target.value)}
          placeholder="e.g. how sweet the sound"
        />
      </label>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <div className="match-results" aria-live="polite">
        {matches.map(({ song, score }) => (
          <button key={song.id} onClick={() => onChoose(song)}>
            <span className="song-icon color-1">
              <Music2 size={19} />
            </span>
            <span>
              <strong>{song.title}</strong>
              <small>
                {Math.round(score * 100)}% lyric overlap · {song.source}
              </small>
            </span>
            <ArrowUpRight size={18} />
          </button>
        ))}
        {words.trim().split(/\s+/).length >= 3 && !matches.length && (
          <div className="empty">
            <p>
              No close match yet. Try a longer lyric, or import the song first.
            </p>
          </div>
        )}
      </div>
      <p className="form-note">
        Suggestions only. Selecting a match loads the preview; you decide when
        to present.
      </p>
    </Modal>
  );
}
