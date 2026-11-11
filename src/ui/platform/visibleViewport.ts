// 画面のうち、実際に見えている範囲（キーボードに隠れていない所）の高さと位置を、CSS の変数に入れる。
//
// スマホのブラウザは、キーボードを開いてもページの高さを変えないことがある（iOS の Safari、
// 設定によっては Android の Chrome や WebView）。そのままだと、画面の下に置いた書式のツールバーが
// キーボードの裏に隠れる。app.css は、この変数でアプリの枠を見えている範囲に合わせる。

export function trackVisibleViewport(): void {
  const viewport = window.visualViewport;
  if (!viewport) {
    return;
  }
  const apply = () => {
    const root = document.documentElement;
    root.style.setProperty("--visible-height", `${viewport.height}px`);
    // キーボードを開いたときに、ブラウザがページを上へ送った分。
    root.style.setProperty("--visible-top", `${viewport.offsetTop}px`);
  };
  viewport.addEventListener("resize", apply);
  viewport.addEventListener("scroll", apply);
  apply();
}
