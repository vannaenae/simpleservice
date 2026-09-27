import { describe, it, expect } from "vitest";
import { importSongs, matchSongs, mergeSongs, textSlides } from "./library";
const song = {
  id: "one",
  title: "Amazing Grace",
  author: "John Newton",
  source: "Public domain",
  ccli: "",
  copyright: "Public domain",
  slides: [
    {
      label: "Verse 1",
      text: "Amazing grace how sweet the sound\nThat saved a wretch like me",
    },
  ],
};
describe("song imports", () => {
  it("splits text into a title and slides", () => {
    const [s] = importSongs(
      "Grace\n\nVerse 1\nAmazing grace\nHow sweet the sound\n\nChorus\nI once was lost",
      "grace.txt",
    );
    expect(s.title).toBe("Grace");
    expect(s.slides).toHaveLength(2);
    expect(s.slides[0].text).toBe("Amazing grace\nHow sweet the sound");
  });
  it("rejects databases instead of pretending to import them", () =>
    expect(() => importSongs("binary", "songs.ewsx")).toThrow(/export/i));
  it("rejects malformed and empty JSON songs", () => {
    expect(() =>
      importSongs('[{"title":"Empty","slides":[]}]', "songs.json"),
    ).toThrow();
    expect(() => importSongs("[]", "songs.json")).toThrow();
  });
  it("round trips library backup songs with new identifiers", () => {
    const [s] = importSongs(JSON.stringify({ songs: [song] }), "backup.json");
    expect(s.title).toBe(song.title);
    expect(s.slides).toEqual(song.slides);
    expect(s.id).not.toBe(song.id);
  });
  it("preserves OpenLyrics line breaks and verse order", () => {
    const [s] = importSongs(
      '<song xmlns="http://openlyrics.info/namespace/2009/song"><properties><titles><title>Grace</title></titles><verseOrder>v1 c v1</verseOrder><ccliNo>123</ccliNo></properties><lyrics><verse name="v1"><lines>Amazing grace<br/>How sweet</lines></verse><verse name="c"><lines>Sing along</lines></verse></lyrics></song>',
      "grace.xml",
    );
    expect(s.slides.map((x) => x.label)).toEqual(["v1", "c", "v1"]);
    expect(s.slides[0].text).toBe("Amazing grace\nHow sweet");
    expect(s.ccli).toBe("123");
  });
  it("supports OpenSong verse headings and ignores chords", () => {
    const [s] = importSongs(
      "<song><title>Grace</title><author>Newton</author><lyrics>[V1]\n.C G\n Amazing grace\n How sweet\n[C]\n Sing</lyrics></song>",
      "grace.xml",
    );
    expect(s.slides).toHaveLength(2);
    expect(s.slides[0].text).toBe("Amazing grace\nHow sweet");
  });
  it("rejects malformed XML and unknown XML", () => {
    expect(() => importSongs("<song>", "s.xml")).toThrow();
    expect(() => importSongs("<thing/>", "s.xml")).toThrow();
  });
  it("does not duplicate the same song on repeat import", () =>
    expect(mergeSongs([song], [{ ...song, id: "two" }]).songs).toHaveLength(1));
});
describe("lyric matching", () => {
  it("finds a lyric excerpt without punctuation sensitivity", () =>
    expect(matchSongs("HOW sweet, the sound", [song])[0]?.song.id).toBe("one"));
  it("returns no suggestion for unrelated speech or too little input", () => {
    expect(matchSongs("please switch on the projector", [song])).toEqual([]);
    expect(matchSongs("grace", [song])).toEqual([]);
  });
});

describe("editable slide labels", () => {
  it("round-trips abbreviated and custom labels without adding them to lyrics", () => {
    expect(
      textSlides("[v1]\nAmazing grace\n\n[Ending refrain]\nSing together"),
    ).toEqual([
      { label: "v1", text: "Amazing grace" },
      { label: "Ending refrain", text: "Sing together" },
    ]);
  });
  it("does not strip a lyric beginning with a word such as chorus", () => {
    expect(textSlides("Chorus of angels sings\nAbove the skies")[0].text).toBe(
      "Chorus of angels sings\nAbove the skies",
    );
  });
});
