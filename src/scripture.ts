export type BibleVerse = {
  book: number;
  chapter: number;
  verse: number;
  reference: string;
  text: string;
};
export type Detection = BibleVerse & {
  kind: "Reference" | "Quotation";
  score: number;
};
export type ReadingContext = {
  book: number;
  chapter: number;
  verse: number;
  at: number;
  pending?: "chapter" | "verse";
};
export type BibleData = { books: string[]; verses: (string | number)[][] };
const units: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  first: 1,
  second: 2,
  third: 3,
};
const tens: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
export function normalizeNumbers(input: string) {
  const words = input
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/([a-z])-([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9:\-\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    let value = units[words[i]] ?? tens[words[i]];
    if (value === undefined) {
      out.push(words[i]);
      continue;
    }
    if (words[i + 1] === "hundred") {
      value *= 100;
      i++;
      if (words[i + 1] === "and") i++;
      const rest = units[words[i + 1]] ?? tens[words[i + 1]];
      if (rest !== undefined) {
        value += rest;
        i++;
        if (rest >= 20 && (units[words[i + 1]] ?? 99) < 10) {
          value += units[words[++i]];
        }
      }
    } else if (value >= 20 && (units[words[i + 1]] ?? 99) < 10) {
      value += units[words[++i]];
    }
    out.push(String(value));
  }
  return out.join(" ");
}
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const stop = new Set(
  "a an the and or but for so of in on to is are was were be been it that this those these he she they we you i his her their our your with as by from at not do does did shall will who whom which have has had".split(
    " ",
  ),
);
const terms = (s: string) => [
  ...new Set(
    normalize(s)
      .split(" ")
      .filter((w) => w.length > 2 && !stop.has(w)),
  ),
];
export class BibleIndex {
  books: string[];
  verses: BibleVerse[];
  private byRef = new Map<string, BibleVerse>();
  private positions = new Map<string, number>();
  private normalized: string[];
  private postings = new Map<string, number[]>();
  private alias: Map<string, number>;
  private bookPattern: RegExp;
  constructor(data: BibleData) {
    this.books = data.books;
    this.verses = data.verses.map(([b, c, v, t]) => ({
      book: Number(b),
      chapter: Number(c),
      verse: Number(v),
      text: String(t),
      reference: `${data.books[Number(b)]} ${c}:${v}`,
    }));
    this.normalized = this.verses.map((v) => normalize(v.text));
    this.verses.forEach((v, i) => {
      this.byRef.set(`${v.book}:${v.chapter}:${v.verse}`, v);
      this.positions.set(v.reference, i);
      for (const w of terms(v.text)) {
        const p = this.postings.get(w) || [];
        p.push(i);
        this.postings.set(w, p);
      }
    });
    this.alias = new Map();
    this.books.forEach((name, i) => {
      const lower = name.toLowerCase();
      this.alias.set(lower, i);
      if (/^\d /.test(lower)) this.alias.set(lower.slice(0, 5), i);
      else this.alias.set(lower.slice(0, 3), i);
    });
    [
      ["psalm", "Psalms"],
      ["ps", "Psalms"],
      ["song of songs", "Song of Solomon"],
      ["songs of solomon", "Song of Solomon"],
      ["jn", "John"],
      ["revelations", "Revelation"],
      ["phillipians", "Philippians"],
    ].forEach(([a, b]) => this.alias.set(a, this.books.indexOf(b)));
    this.bookPattern = new RegExp(
      `\\b(${[...this.alias.keys()].sort((a, b) => b.length - a.length).join("|")})\\b`,
      "g",
    );
  }
  get(book: number, chapter: number, verse: number) {
    return this.byRef.get(`${book}:${chapter}:${verse}`);
  }
  adjacent(v: BibleVerse, delta: number) {
    const i = this.positions.get(v.reference);
    return i === undefined ? undefined : this.verses[i + delta];
  }
  detect(
    input: string,
    prior?: ReadingContext,
  ): { results: Detection[]; context?: ReadingContext } {
    const text = normalizeNumbers(input);
    let context = prior && Date.now() - prior.at < 90000 ? prior : undefined;
    const results: Detection[] = [];
    let explicit = false;
    const add = (book: number, chapter: number, verse: number, end = verse) => {
      const found = this.get(book, chapter, verse);
      if (!found) return;
      context = { book, chapter, verse, at: Date.now() };
      for (let n = verse; n <= Math.min(end, verse + 9); n++) {
        const v = this.get(book, chapter, n);
        if (v && !results.some((r) => r.reference === v.reference))
          results.push({ ...v, kind: "Reference", score: 1 });
      }
    };
    for (const m of text.matchAll(this.bookPattern)) {
      const book = this.alias.get(m[1])!;
      const tail = text.slice(m.index! + m[0].length);
      const singleChapter = [
        "Obadiah",
        "Philemon",
        "2 John",
        "3 John",
        "Jude",
      ].includes(this.books[book]);
      const single = tail.match(/^\s*verse\s+(\d{1,3})/);
      if (single && singleChapter) {
        explicit = true;
        add(book, 1, Number(single[1]));
        continue;
      }
      const ref = tail.match(
        /^\s*(?:chapter\s*)?(\d{1,3})(?:\s*(?::|(?:(?:and|from|starting at)\s+)?verses?\s*(?:number\s*)?|\s)\s*(\d{1,3})(?:\s*(?:-|to|through)\s*(\d{1,3}))?)?/,
      );
      if (!ref) {
        if (
          m[1] === this.books[book]?.toLowerCase() &&
          /^\s*(?:chapter\s*)?$/.test(tail)
        ) {
          context = {
            book,
            chapter: 0,
            verse: 0,
            at: Date.now(),
            pending: "chapter",
          };
          explicit = true;
        }
        continue;
      }
      explicit = true;
      const chapter = singleChapter && !ref[2] ? 1 : Number(ref[1]);
      const verse = ref[2]
        ? Number(ref[2])
        : singleChapter
          ? Number(ref[1])
          : 1;
      add(book, chapter, verse, ref[3] ? Number(ref[3]) : verse);
      if (
        !ref[2] &&
        !singleChapter &&
        context?.book === book &&
        context.chapter === chapter
      )
        context = { ...context, pending: "verse" };
    }
    if (!explicit && context) {
      let c = context;
      const match = text.match(
        /\b(?:chapter\s+(\d{1,3})\s+(?:(?:and|from)\s+)?)?verses?\s+(?:number\s+)?(\d{1,3})\b/,
      );
      if (match) {
        explicit = true;
        add(c.book, match[1] ? Number(match[1]) : c.chapter, Number(match[2]));
      } else if (
        c.pending &&
        Date.now() - c.at < 15000 &&
        /^(?:(?:and|from)\s+)?\d{1,3}$/.test(text)
      ) {
        explicit = true;
        const n = Number(text.match(/\d+/)![0]);
        add(
          c.book,
          c.pending === "chapter" ? n : c.chapter,
          c.pending === "chapter" ? 1 : n,
        );
        if (c.pending === "chapter" && context?.chapter === n)
          context = { ...context, pending: "verse" };
      } else if (/\bnext verse\b/.test(text)) {
        explicit = true;
        const current = this.get(c.book, c.chapter, c.verse);
        const next = current && this.adjacent(current, 1);
        if (next) add(next.book, next.chapter, next.verse);
      } else if (/\b(?:next chapter|chapter \d{1,3})\b/.test(text)) {
        explicit = true;
        const ch = text.match(/chapter (\d{1,3})/);
        add(c.book, ch ? Number(ch[1]) : c.chapter + 1, 1);
        if (context) context = { ...context, pending: "verse" };
      }
    }
    if (explicit) return { results, context };
    return { results: this.search(input, true), context };
  }
  search(input: string, automatic = false): Detection[] {
    const query = normalize(input);
    const words = terms(input);
    if (words.length < (automatic ? 4 : 2)) return [];
    const scores = new Map<number, number>();
    const overlaps = new Map<number, number>();
    let totalWeight = 0;
    for (const word of words) {
      const ids = this.postings.get(word) || [];
      const weight = Math.log(1 + this.verses.length / (ids.length + 1));
      totalWeight += weight;
      for (const id of ids) {
        scores.set(id, (scores.get(id) || 0) + weight);
        overlaps.set(id, (overlaps.get(id) || 0) + 1);
      }
    }
    return [...scores.entries()]
      .map(([id, weight]) => {
        const exact =
          query.split(" ").length >= 5 && this.normalized[id].includes(query);
        const overlap = (overlaps.get(id) || 0) / words.length;
        const score = exact
          ? 1
          : (weight / totalWeight) * 0.65 + overlap * 0.35;
        return {
          ...this.verses[id],
          kind: "Quotation" as const,
          score,
          overlap,
          exact,
        };
      })
      .filter(
        (x) =>
          x.exact ||
          (x.score >= (automatic ? 0.78 : 0.45) &&
            x.overlap >= (automatic ? 0.6 : 0.35)),
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, automatic ? 3 : 12)
      .map(({ overlap: _o, exact: _e, ...v }) => v);
  }
}
let cached: Promise<BibleIndex> | undefined;
export function loadBible() {
  if (!cached)
    cached = fetch(`${import.meta.env.BASE_URL}bible/web.json`)
      .then((r) => {
        if (!r.ok)
          throw new Error(
            "The local Bible could not load. Refresh or rebuild the app.",
          );
        return r.json();
      })
      .then((data) => new BibleIndex(data))
      .catch((e) => {
        cached = undefined;
        throw e;
      });
  return cached;
}
