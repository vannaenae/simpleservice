import { it, expect } from "vitest";
import { TranscriptWindow } from "./transcript";
it("removes duplicated relative commands from overlapping audio", () => {
  const t = new TranscriptWindow();
  expect(t.accept("next verse", 0, 3000)).toBe("next verse");
  expect(t.accept("next verse", 2000, 5000)).toBe("");
});
it("keeps repeated commands from non-overlapping speech", () => {
  const t = new TranscriptWindow();
  t.accept("next verse", 0, 3000);
  expect(t.accept("next verse", 4000, 7000)).toBe("next verse");
});
it("keeps a new verse after an overlapping chapter prefix", () => {
  const t = new TranscriptWindow();
  t.accept("John chapter three", 0, 3000);
  expect(t.accept("chapter three and verse sixteen", 2000, 5000)).toBe(
    "and verse sixteen",
  );
});
