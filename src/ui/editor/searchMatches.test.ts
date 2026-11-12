import { Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import { DEFAULT_SEARCH_OPTIONS, findSearchMatches, type SearchOptions } from "./searchMatches";

// 段落と、文字でない部品（メモへのリンクの代わり）だけの本文。
const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "inline*", group: "block" },
    text: { group: "inline" },
    noteLink: { group: "inline", inline: true, atom: true },
  },
});

function documentOf(...paragraphs: Array<string | Array<string | "link">>) {
  return schema.node("doc", null, paragraphs.map((paragraph) => {
    const parts = typeof paragraph === "string" ? [paragraph] : paragraph;
    return schema.node("paragraph", null, parts.filter((part) => part !== "").map((part) => (part === "link" ? schema.node("noteLink") : schema.text(part))));
  }));
}

// 当たりの文字と、置き換えたときに入る文字を並べる。
function describeMatches(doc: ReturnType<typeof documentOf>, query: string, replacement = "") {
  return findSearchMatches(doc, query, { ...DEFAULT_SEARCH_OPTIONS, regex: true }).matches.map((match) => ({
    text: doc.textBetween(match.from, match.to),
    replacedBy: match.replacementFor(replacement),
  }));
}

describe("メモの中の検索", () => {
  it("言葉で探すと、空白で区切った言葉のどれかに、大文字と小文字を区別せずに当たる", () => {
    const doc = documentOf("Apple と banana と APPLE");
    const matches = findSearchMatches(doc, "apple banana", DEFAULT_SEARCH_OPTIONS).matches.map((match) => doc.textBetween(match.from, match.to));
    expect(matches).toEqual(["Apple", "banana", "APPLE"]);
  });

  it("大文字と小文字を区別すると、形の同じ言葉だけに当たる", () => {
    const doc = documentOf("Apple と apple");
    const texts = (options: SearchOptions) => findSearchMatches(doc, "apple", options).matches.map((match) => doc.textBetween(match.from, match.to));
    expect(texts(DEFAULT_SEARCH_OPTIONS)).toEqual(["Apple", "apple"]);
    expect(texts({ ...DEFAULT_SEARCH_OPTIONS, caseSensitive: true })).toEqual(["apple"]);
  });

  it("単語単位では、前後が文字や数字でない所だけに当たる（かなや漢字も文字として見る）", () => {
    const doc = documentOf("cat と catalog と 猫 と 猫舌");
    const texts = (query: string) => findSearchMatches(doc, query, { ...DEFAULT_SEARCH_OPTIONS, wholeWord: true }).matches.map((match) => doc.textBetween(match.from, match.to));
    expect(texts("cat")).toEqual(["cat"]);
    expect(texts("猫")).toEqual(["猫"]);
  });

  it("言葉で探すときは、正規表現の記号もそのままの文字として探し、置換の $1 も展開しない", () => {
    const doc = documentOf("a.b と axb");
    const [match, ...rest] = findSearchMatches(doc, "a.b", DEFAULT_SEARCH_OPTIONS).matches;
    expect(rest).toEqual([]);
    expect(doc.textBetween(match!.from, match!.to)).toBe("a.b");
    expect(match!.replacementFor("$1")).toBe("$1");
  });

  it("正規表現で探せ、大文字と小文字を区別しない", () => {
    expect(describeMatches(documentOf("v1.2 と V10.3"), "v\\d+\\.\\d").map((match) => match.text)).toEqual(["v1.2", "V10.3"]);
  });

  it("正規表現として読めない式は、当たりなしで、読めないことを知らせる", () => {
    expect(findSearchMatches(documentOf("abc"), "a(", { ...DEFAULT_SEARCH_OPTIONS, regex: true })).toEqual({ matches: [], invalidPattern: true });
  });

  it("空の当たり（^ や a*）は数えない", () => {
    expect(describeMatches(documentOf("bbb"), "^")).toEqual([]);
    expect(describeMatches(documentOf("baab"), "a*").map((match) => match.text)).toEqual(["aa"]);
  });

  it("置換の文字の $1 と $& は、当たりごとの中身で展開する", () => {
    expect(describeMatches(documentOf("2026-11-12"), "(\\d+)-(\\d+)-(\\d+)", "$3/$2/$1")).toEqual([{ text: "2026-11-12", replacedBy: "12/11/2026" }]);
    expect(describeMatches(documentOf("ab"), "b", "[$&]")).toEqual([{ text: "b", replacedBy: "[b]" }]);
  });

  it("置換の文字の $$・$`・$'・$<名前>・2 桁の番号も、ブラウザの replace と同じに展開する", () => {
    const doc = documentOf("前ab後");
    expect(describeMatches(doc, "(?<first>a)(b)", "$<first>|$2|$$|$`|$'|$10")).toEqual([{ text: "ab", replacedBy: "a|b|$|前|後|a0" }]);
    expect(describeMatches(doc, "(a)(b)", "$3")).toEqual([{ text: "ab", replacedBy: "$3" }]);
  });

  it("置換の結果が、ブラウザ（String.prototype.replace）で置き換えた結果と同じになる", () => {
    const text = "前ab後";
    const pattern = "(?<first>a)(b)";
    for (const replacement of ["$<first>-$1-$2", "$0", "$3", "$<none>", "$", "$$$1", "x$'y$`z", "$11", "$01"]) {
      const [match] = findSearchMatches(documentOf(text), pattern, { ...DEFAULT_SEARCH_OPTIONS, regex: true }).matches;
      expect(`前${match!.replacementFor(replacement)}後`, replacement).toBe(text.replace(new RegExp(pattern, "iu"), replacement));
    }
  });

  it("後読みや ^ のように前後を見る式も、探したときと同じ所で置き換わる", () => {
    expect(describeMatches(documentOf("円100 と 100"), "(?<=円)\\d+", "X")).toEqual([{ text: "100", replacedBy: "X" }]);
    expect(describeMatches(documentOf("aXa"), "^a", "b")).toEqual([{ text: "a", replacedBy: "b" }]);
  });

  it("展開した結果が空なら、置き換える文字は空（当たりを消す）", () => {
    expect(describeMatches(documentOf("a1b"), "(\\d)", "")).toEqual([{ text: "1", replacedBy: "" }]);
  });

  it("メモへのリンクのような文字でない部品をまたぐ当たりは数えない（置き換えると部品が消えるため）", () => {
    const doc = documentOf(["前", "link", "後"]);
    expect(describeMatches(doc, "前.後")).toEqual([]);
    expect(describeMatches(doc, "後").map((match) => match.text)).toEqual(["後"]);
  });
});
