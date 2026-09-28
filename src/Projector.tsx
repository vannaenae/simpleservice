import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Slide } from "./library";
export type Theme = "forest" | "dawn" | "ocean" | "ink";
export type DisplaySettings = {
  theme: Theme;
  ratio: string;
  fontSize: number;
  align: "center" | "left";
  showCopyright: boolean;
  license: string;
};
export type Output = {
  title: string;
  slide: Slide;
  next?: Slide;
  index: number;
  total: number;
  copyright: string;
  ccli: string;
  blank: boolean;
  settings: DisplaySettings;
};
export const defaults: DisplaySettings = {
  theme: "forest",
  ratio: "16 / 9",
  fontSize: 48,
  align: "center",
  showCopyright: true,
  license: "",
};
export const emptyOutput: Output = {
  title: "",
  slide: { label: "", text: "" },
  index: 0,
  total: 0,
  copyright: "",
  ccli: "",
  blank: true,
  settings: defaults,
};
export function Surface({
  output,
  preview = false,
}: {
  output: Output;
  preview?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const fit = () => {
      if (!box.current || !text.current) return;
      let size = (box.current.clientWidth * output.settings.fontSize) / 1000;
      text.current.style.fontSize = `${size}px`;
      for (
        let i = 0;
        i < 60 &&
        (text.current.scrollHeight > text.current.clientHeight + 1 ||
          text.current.scrollWidth > text.current.clientWidth + 1);
        i++
      ) {
        size *= 0.94;
        text.current.style.fontSize = `${size}px`;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    if (box.current) observer.observe(box.current);
    return () => observer.disconnect();
  }, [output]);
  return (
    <div
      ref={box}
      className={`surface ${output.settings.theme} ${!preview && output.blank ? "blacked" : ""}`}
      style={{ aspectRatio: output.settings.ratio }}
    >
      <div className="landscape">
        <i />
        <i />
        <i />
      </div>
      <div
        ref={text}
        className="projected-lyrics"
        style={{ textAlign: output.settings.align }}
      >
        {(preview || !output.blank) && output.slide.text}
      </div>
      {(preview || !output.blank) && output.settings.showCopyright && (
        <div className="copyright">
          {output.title}
          {output.copyright && ` · ${output.copyright}`}
          {output.ccli && ` · CCLI Song #${output.ccli}`}
          {output.settings.license && ` · Licence #${output.settings.license}`}
        </div>
      )}
    </div>
  );
}
export default function Projector({ stage }: { stage: boolean }) {
  const [output, setOutput] = useState<Output>(emptyOutput);
  const [connected, setConnected] = useState(false);
  const [showTools, setShowTools] = useState(true);
  const last = useRef(0);
  useEffect(() => {
    const channel = new BroadcastChannel("simple-service-output");
    channel.onmessage = (e) => {
      if (e.data?.type === "output") {
        last.current = Date.now();
        setConnected(true);
        setOutput(e.data.output);
      }
    };
    channel.postMessage({ type: "hello" });
    channel.postMessage({ type: "presence", stage });
    const timer = setInterval(() => {
      channel.postMessage({ type: "presence", stage });
      if (Date.now() - last.current > 5000) setConnected(false);
    }, 1000);
    return () => {
      clearInterval(timer);
      channel.close();
    };
  }, [stage]);
  useEffect(() => {
    const id = setTimeout(() => setShowTools(false), 3500);
    return () => clearTimeout(id);
  }, [showTools]);
  const safe = { ...output, blank: output.blank || !connected };
  return (
    <main
      className={`projector-window ${stage ? "stage-window" : ""}`}
      onMouseMove={() => setShowTools(true)}
    >
      {stage ? (
        <>
          <header>
            <span>SIMPLE SERVICE / STAGE</span>
            <span>
              {connected ? "Controller connected" : "Waiting for controller"}
            </span>
          </header>
          <h1>{output.title || "Ready for worship"}</h1>
          <div className="stage-columns">
            <section>
              <p>
                NOW · {output.slide.label}
                {safe.blank ? " · AUDIENCE BLACKED OUT" : ""}
              </p>
              <pre>
                {output.slide.text || "Choose a song in your workspace."}
              </pre>
            </section>
            <section>
              <p>UP NEXT</p>
              <pre>{output.next?.text || "End of song"}</pre>
            </section>
          </div>
        </>
      ) : (
        <div
          className="projector-frame"
          style={{
            aspectRatio: output.settings.ratio,
            maxWidth: `calc(100vh * ${output.settings.ratio})`,
          }}
        >
          <Surface output={safe} />
        </div>
      )}
      {showTools && (
        <div className="projector-tools">
          <button
            onClick={() => {
              document.documentElement.requestFullscreen?.().catch(() => {});
              setShowTools(false);
            }}
          >
            Enter fullscreen
          </button>
          <span>
            Move this window to your display. Double-click to show controls.
          </span>
        </div>
      )}
    </main>
  );
}
