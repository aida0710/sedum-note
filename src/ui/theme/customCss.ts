// 利用者が書いた CSS（カスタム CSS）を画面に当てる。ロックを解除している間だけ当て、ロック解除の画面には当てない。
// CSS で画面が使えなくなっても、開き直せばロック解除の画面からオフにできるようにするため。

const CUSTOM_CSS_ELEMENT_ID = "sedum-note-custom-css";

// 当てる CSS を入れ替える。空の文字なら、当てているものを外す。
export function applyCustomCss(css: string): void {
  const existing = document.getElementById(CUSTOM_CSS_ELEMENT_ID);
  if (css.trim() === "") {
    existing?.remove();
    return;
  }
  const styleElement = existing ?? document.head.appendChild(Object.assign(document.createElement("style"), { id: CUSTOM_CSS_ELEMENT_ID }));
  styleElement.textContent = css;
}
