// 英語の画面に残った日本語（文字、aria-label・title・placeholder）を探す。ブラウザの中で動かす（page.evaluate に関数ごと渡す）。
// 利用者が書いた文字（本文、メモとノートブックの名前、タグ）は日本語のままでよいので、取り除いてから探す。
export function measureLeftoverJapanese() {
  const JAPANESE = /[぀-ヿ㐀-鿿]/;
  // 利用者が書いた文字だけが出る所。
  const USER_TEXT = ".ProseMirror, .title-input, .tree-note, .nav-label, [role=tab], .note-item, .chip, .space-name, .note-property > label";
  // 文言の中で、利用者の文字を囲むかっこ（"…"・“…”・「…」）。
  const QUOTED = /"[^"]*"|“[^”]*”|「[^」]*」|‘[^’]*’/g;
  const findings = [];
  const seen = new Set();
  const isShown = (element) => {
    const rect = element.getBoundingClientRect();
    return rect.width >= 1 && rect.height >= 1 && element.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  };
  const userTexts = [...document.querySelectorAll(USER_TEXT)].map((element) => (element.value ?? element.textContent ?? "").trim())
    .filter((text) => text.length > 0).sort((left, right) => right.length - left.length);
  const withoutUserText = (text) => userTexts.reduce((rest, userText) => rest.split(userText).join(""), text.replace(QUOTED, ""));
  const describe = (element) => {
    const classes = typeof element.className === "string" ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
    const parent = element.parentElement;
    const parentClass = parent && typeof parent.className === "string" ? parent.className.trim().split(/\s+/)[0] ?? "" : "";
    return `${parentClass ? `.${parentClass} > ` : ""}${element.tagName.toLowerCase()}${classes.map((name) => `.${name}`).join("")}`;
  };
  const report = (element, text) => {
    const key = `${describe(element)}|${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ kind: "japanese-in-english", element: describe(element), text: text.slice(0, 40) });
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.trim();
    const parent = node.parentElement;
    if (!parent || parent.closest(USER_TEXT) || !JAPANESE.test(withoutUserText(text)) || !isShown(parent)) continue;
    report(parent, text);
  }
  for (const element of document.querySelectorAll("[aria-label], [title], [placeholder]")) {
    if (element.closest(".ProseMirror") || !isShown(element)) continue;
    for (const attribute of ["aria-label", "title", "placeholder"]) {
      const value = element.getAttribute(attribute);
      if (value && JAPANESE.test(withoutUserText(value))) report(element, `${attribute}=${value}`);
    }
  }
  return findings;
}
