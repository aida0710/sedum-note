// 数式（LaTeX）を HTML にする。表示の部品（KaTeX）は大きいので、最初に数式を出すときにだけ読み込む。

type RenderMath = (latex: string, displayMode: boolean) => string;

let loading: Promise<RenderMath> | null = null;

export function loadMathRenderer(): Promise<RenderMath> {
  loading ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(([katex]) =>
    // 書き方の誤りは、例外にせず、誤りの所を赤くした数式として出す。
    (latex, displayMode) => katex.default.renderToString(latex, { displayMode, throwOnError: false }));
  return loading;
}
