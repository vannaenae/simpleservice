export type Slide = { label: string; text: string };
export type Song = {
  id: string;
  title: string;
  author: string;
  source: string;
  ccli: string;
  copyright: string;
  slides: Slide[];
};
export const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const clean = (x: unknown) => (typeof x === "string" ? x.trim() : "");
export function validateSong(value: unknown): Song {
  if (!value || typeof value !== "object")
    throw new Error("Each song needs a title and lyric slides.");
  const s = value as Record<string, unknown>;
  if (
    !clean(s.title) ||
    !Array.isArray(s.slides) ||
    !s.slides.length ||
    s.slides.length > 300
  )
    throw new Error("Each song needs a title and 1–300 slides.");
  const slides = s.slides.map((slide: unknown, i: number) => {
    if (!slide || typeof slide !== "object") throw new Error("Invalid slide.");
    const v = slide as Record<string, unknown>;
    const text = clean(v.text);
    if (!text || text.length > 3000)
      throw new Error("Slides must contain 1–3,000 characters.");
    return { label: clean(v.label) || `Verse ${i + 1}`, text };
  });
  return {
    id: crypto.randomUUID(),
    title: clean(s.title).slice(0, 200),
    author: clean(s.author).slice(0, 200),
    source: clean(s.source) || "Imported",
    ccli: clean(s.ccli),
    copyright: clean(s.copyright),
    slides,
  };
}
export function textSlides(text: string): Slide[] {
  return text
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((part, i) => {
      const lines = part.split("\n");
      const bracketed = /^\[(.*)\]$/.exec(lines[0]);
      const heading =
        /^(verse|chorus|bridge|intro|outro|tag|refrain|pre.?chorus)(\s+\d+)?$/i.test(
          lines[0],
        );
      const label = bracketed
        ? bracketed[1]
        : heading
          ? lines[0]
          : `Verse ${i + 1}`;
      if (bracketed || heading) lines.shift();
      return { label, text: lines.join("\n").trim() };
    })
    .filter((x) => x.text);
}
export function importSongs(content: string, filename: string): Song[] {
  if (content.length > 5_000_000)
    throw new Error("Please import files smaller than 5 MB.");
  const ext = filename.split(".").pop()?.toLowerCase();
  let values: unknown[] = [];
  if (ext === "json") {
    const data: unknown = JSON.parse(content);
    values = Array.isArray(data)
      ? data
      : data && typeof data === "object" && "songs" in data
        ? (data as { songs: unknown[] }).songs
        : [data];
  } else if (ext === "txt") {
    const lines = content.replace(/\r/g, "").trim().split("\n");
    const title = lines.shift();
    values = [
      { title, slides: textSlides(lines.join("\n")), source: "Text import" },
    ];
  } else if (ext === "xml") {
    if (/<!DOCTYPE|<!ENTITY/i.test(content))
      throw new Error("XML document types and entities are not supported.");
    const xml = new DOMParser().parseFromString(content, "application/xml");
    if (xml.querySelector("parsererror"))
      throw new Error("The XML file is malformed.");
    values = Array.from(xml.getElementsByTagName("song")).map((node) => {
      const get = (tag: string) =>
        node.getElementsByTagName(tag)[0]?.textContent?.trim() || "";
      const verses = Array.from(node.getElementsByTagName("verse"));
      let slides: Slide[];
      if (verses.length) {
        slides = verses.flatMap((verse, i) => {
          const groups = Array.from(verse.getElementsByTagName("lines"));
          return groups.map((group) => {
            const copy = group.cloneNode(true) as Element;
            Array.from(copy.getElementsByTagName("br")).forEach((br) =>
              br.replaceWith("\n"),
            );
            return {
              label: verse.getAttribute("name") || `Verse ${i + 1}`,
              text: copy.textContent?.trim() || "",
            };
          });
        });
        const order = get("verseOrder").split(/\s+/).filter(Boolean);
        if (order.length) {
          const ordered = order.flatMap((name) =>
            slides.filter((s) => s.label === name),
          );
          if (ordered.length) slides = ordered;
        }
      } else {
        const raw = get("lyrics")
          .split("\n")
          .filter((line) => !line.startsWith("."))
          .map((line) => line.trimStart())
          .join("\n");
        slides = raw
          .split(/\[([^\]]+)\]/)
          .slice(1)
          .reduce<Slide[]>((out, x, i, arr) => {
            if (i % 2 === 0 && arr[i + 1]?.trim())
              out.push({ label: x, text: arr[i + 1].trim() });
            return out;
          }, []);
        if (!slides.length) slides = textSlides(raw);
      }
      return {
        title: get("title"),
        author: Array.from(node.getElementsByTagName("author"))
          .map((x) => x.textContent)
          .join(", "),
        ccli: get("ccliNo") || get("ccli"),
        copyright: get("copyright"),
        source: verses.length ? "OpenLyrics" : "OpenSong",
        slides,
      };
    });
  } else
    throw new Error(
      "This format is not supported. Export songs as text, OpenLyrics / OpenSong XML, or Simple Service JSON. Proprietary databases and schedules cannot be read directly.",
    );
  if (!Array.isArray(values) || !values.length)
    throw new Error("No songs were found in this file.");
  if (values.length > 2000)
    throw new Error("Import up to 2,000 songs at a time.");
  return values.map(validateSong);
}
export function mergeSongs(existing: Song[], incoming: Song[]) {
  const signatures = new Set(
    existing.map(
      (s) =>
        normalize(s.title) +
        "|" +
        normalize(s.slides.map((x) => x.text).join(" ")),
    ),
  );
  let duplicates = 0;
  const added = incoming.filter((s) => {
    const key =
      normalize(s.title) +
      "|" +
      normalize(s.slides.map((x) => x.text).join(" "));
    if (signatures.has(key)) {
      duplicates++;
      return false;
    }
    signatures.add(key);
    return true;
  });
  return { songs: [...existing, ...added], duplicates, added: added.length };
}
export function matchSongs(transcript: string, songs: Song[]) {
  const query = normalize(transcript);
  const words = [...new Set(query.split(" ").filter((x) => x.length > 2))];
  if (words.length < 3) return [];
  return songs
    .map((song) => {
      const text = normalize(song.slides.map((s) => s.text).join(" "));
      const all = new Set(text.split(" "));
      const score = text.includes(query)
        ? 1
        : words.filter((x) => all.has(x)).length / words.length;
      return { song, score };
    })
    .filter((x) => x.score >= 0.65)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
