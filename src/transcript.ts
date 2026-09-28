import { normalizeNumbers } from "./scripture";

/** Remove only shared suffix/prefix text when capture windows overlap. */
export class TranscriptWindow {
  private previous: string[] = [];
  private endMs = 0;
  accept(text: string, startMs: number, endMs: number): string {
    const raw = text.trim().split(/\s+/).filter(Boolean);
    const words = raw.map((word) => normalizeNumbers(word));
    let overlap = 0;
    if (startMs < this.endMs) {
      for (
        let n = Math.min(words.length, this.previous.length, 8);
        n > 0;
        n--
      ) {
        if (words.slice(0, n).join(" ") === this.previous.slice(-n).join(" ")) {
          overlap = n;
          break;
        }
      }
    }
    this.previous = words;
    this.endMs = endMs;
    return raw.slice(overlap).join(" ");
  }
}
