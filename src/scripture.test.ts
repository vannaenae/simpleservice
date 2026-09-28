import { describe, it, expect } from "vitest";
import { BibleIndex, normalizeNumbers } from "./scripture";
import data from "../public/bible/web.json";
const bible = new BibleIndex(data);
describe("local scripture references", () => {
  it("normalizes spoken chapter and verse numbers without adding them together", () =>
    expect(normalizeNumbers("First John chapter three verse sixteen")).toBe(
      "1 john chapter 3 verse 16",
    ));
  it("finds spoken references and direct numbers", () => {
    expect(
      bible.detect("John chapter three verse sixteen").results[0]?.reference,
    ).toBe("John 3:16");
    expect(bible.detect("Romans 8:28").results[0]?.reference).toBe(
      "Romans 8:28",
    );
    expect(
      bible.detect("turn to Psalm twenty three verse one").results[0]
        ?.reference,
    ).toBe("Psalms 23:1");
  });
  it("keeps book numbers distinct", () =>
    expect(
      bible.detect("First Corinthians thirteen verse four").results[0]
        ?.reference,
    ).toBe("1 Corinthians 13:4"));
  it("remembers chapter context and supports next verse", () => {
    const a = bible.detect("John chapter three");
    expect(a.context?.chapter).toBe(3);
    const b = bible.detect("verse sixteen", a.context);
    expect(b.results[0]?.reference).toBe("John 3:16");
    expect(bible.detect("next verse", b.context).results[0]?.reference).toBe(
      "John 3:17",
    );
  });
  it("does not invent invalid verses or stale contextual references", () => {
    expect(bible.detect("Revelation 20:99").results).toEqual([]);
    expect(
      bible.detect("verse sixteen", { book: 42, chapter: 3, verse: 1, at: 0 })
        .results,
    ).toEqual([]);
  });
  it("supports bounded verse ranges", () =>
    expect(
      bible.detect("John 3:16-18").results.map((x) => x.reference),
    ).toEqual(["John 3:16", "John 3:17", "John 3:18"]));
  it("finds a quoted passage from the local text", () =>
    expect(
      bible.detect(
        "For God so loved the world that he gave his one and only Son",
      ).results[0]?.reference,
    ).toBe("John 3:16"));
  it("ignores unrelated speech and very short fragments", () => {
    expect(
      bible.detect("please adjust the microphone and turn the projector on")
        .results,
    ).toEqual([]);
    expect(bible.detect("the lord").results).toEqual([]);
  });
  it("retrieves verified text and preserves verse navigation", () => {
    expect(bible.get(42, 3, 16)?.text).toContain("only born Son");
    expect(bible.adjacent(bible.get(42, 3, 16)!, 1)?.reference).toBe(
      "John 3:17",
    );
  });
});

describe("spoken verse regression cases", () => {
  it.each([
    "John chapter three and verse sixteen",
    "John chapter three from verse sixteen",
    "John chapter three verse number sixteen",
    "John3:16",
  ])("keeps the verse in %s", (phrase) =>
    expect(bible.detect(phrase).results[0]?.reference).toBe("John 3:16"),
  );
  it("resolves a verse number arriving in the next audio chunk", () => {
    const a = bible.detect("John chapter three");
    expect(bible.detect("sixteen", a.context).results[0]?.reference).toBe(
      "John 3:16",
    );
  });
  it("does not treat unrelated bare numbers as verses after a complete reference", () => {
    const a = bible.detect("John 3:16");
    expect(bible.detect("twenty", a.context).results).toEqual([]);
  });
  it("retains an unfinished book name until the chapter arrives", () => {
    const a = bible.detect("the book of Romans");
    expect(
      bible.detect("chapter eight and verse twenty eight", a.context).results[0]
        ?.reference,
    ).toBe("Romans 8:28");
  });
});

it("respects an explicit chapter change while awaiting a verse", () => {
  const a = bible.detect("John chapter three");
  const b = bible.detect("chapter four", a.context);
  expect(b.results[0]?.reference).toBe("John 4:1");
  expect(bible.detect("verse seven", b.context).results[0]?.reference).toBe(
    "John 4:7",
  );
});
