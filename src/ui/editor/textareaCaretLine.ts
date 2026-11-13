// 折り返して表示している textarea で、カーソルが最後の行にあるかを調べる。
// textarea は行ごとの位置を教えないので、同じ幅と文字の組みの見えない要素に同じ文字を流し、カーソルの所と末尾に置いた印の高さを比べる。

// 行の折り返しを決める、textarea の見た目の指定。
const TEXT_LAYOUT_PROPERTIES = ["boxSizing", "width", "padding", "border", "font", "letterSpacing", "lineHeight", "textIndent", "wordSpacing", "tabSize"] as const;

function createLineMarker(): HTMLSpanElement {
  const marker = document.createElement("span");
  // 幅の無い文字。行の高さだけを持たせる。
  marker.textContent = "​";
  return marker;
}

export function isCaretOnLastLine(textarea: HTMLTextAreaElement): boolean {
  const mirror = document.createElement("div");
  const textareaStyle = getComputedStyle(textarea);
  for (const property of TEXT_LAYOUT_PROPERTIES) {
    mirror.style[property] = textareaStyle[property];
  }
  Object.assign(mirror.style, { position: "absolute", visibility: "hidden", whiteSpace: "pre-wrap", overflowWrap: "break-word", top: "0", left: "0" });
  const caretMarker = createLineMarker();
  const endMarker = createLineMarker();
  mirror.append(textarea.value.slice(0, textarea.selectionEnd), caretMarker, textarea.value.slice(textarea.selectionEnd), endMarker);
  document.body.append(mirror);
  const onLastLine = caretMarker.offsetTop === endMarker.offsetTop;
  mirror.remove();
  return onLastLine;
}
