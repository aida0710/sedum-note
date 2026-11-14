// 開いている画面の見た目を測る。ブラウザの中で動かす（page.evaluate に関数ごと渡す）ので、外の変数を使わない。
//
// 返すもの:
// - findings: ずれ・はみ出し。アイコンだけのボタンのアイコンの中心と枠の中心、ボタンの文字の縦の中心と枠、
//   アイコンと同じ行の文字の縦の中心、チェックボックスと隣の文字、枠からはみ出した文字。
// - parts: 部品の役割（ボタン・入力欄・メニュー・ダイアログ…）ごとの角丸・高さ・文字の大きさ・フォント。
//   同じ役割で値が割れていないかを、画面をまたいで比べるために使う。
// - fontSamples: 描画に使われたフォントを CDP で調べる要素に付けた印（data-visual-audit-font）の一覧。
export function measureScreen() {
  // 1px 未満の差は、フォントの字形の上下の余白（アセント・ディセント）の違いでも出るので、ずれとして数えない。
  const TOLERANCE_PX = 1;
  // これより高い部品は 1 行の操作の部品ではない（カードやパネル）ので、文字の縦の中心を比べない。
  const SINGLE_LINE_CONTROL_MAX_HEIGHT = 48;
  // フォントを CDP で調べる要素は、フォントの指定ごとにこの数まで。
  const FONT_SAMPLES_PER_FAMILY = 3;

  const findings = [];
  const parts = [];

  const isShown = (element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) return false;
    if (typeof element.checkVisibility === "function") {
      return element.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    }
    const style = getComputedStyle(element);
    return style.visibility !== "hidden" && style.display !== "none";
  };

  // 読み上げ用だけの文字（画面には出ない）。
  const isScreenReaderOnly = (element) => {
    const style = getComputedStyle(element);
    return (style.position === "absolute" && (style.clip === "rect(0px, 0px, 0px, 0px)" || style.clipPath === "inset(50%)"))
      || (parseFloat(style.width) <= 1 && parseFloat(style.height) <= 1 && style.overflow === "hidden");
  };

  const describe = (element) => {
    const parts = [];
    let current = element;
    for (let depth = 0; current && current !== document.body && depth < 3; depth += 1) {
      const classes = typeof current.className === "string" ? current.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
      parts.unshift(current.tagName.toLowerCase() + classes.map((name) => `.${name}`).join(""));
      current = current.parentElement;
    }
    const label = element.getAttribute("aria-label") ?? element.getAttribute("title") ?? element.getAttribute("placeholder") ?? (element.textContent ?? "").trim();
    return `${parts.join(" > ")}${label ? ` 「${label.slice(0, 24)}」` : ""}`;
  };

  // 要素の中の、見えている文字の行の箱。svg の中の文字と、読み上げ用だけの文字と、isExcluded に当たる要素の中の文字は除く。
  const textLineRects = (element, isExcluded = () => false) => {
    const rects = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent || !node.textContent.trim()) continue;
      const parent = node.parentElement;
      // 数式（KaTeX）は、上付きなどで文字の箱が上下に散るので、行の文字として扱わない。
      if (!parent || parent.closest("svg, .katex") || isScreenReaderOnly(parent) || isExcluded(parent) || !isShown(parent)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width >= 1 && rect.height >= 1) rects.push(rect);
      }
    }
    return rects;
  };

  // 文字の箱を行ごとにまとめる。大きさの違う文字（名前と件数など）は上端がずれるので、縦に重なるものを同じ行とみなす。
  const groupIntoLines = (rects) => {
    const lines = [];
    for (const rect of [...rects].sort((left, right) => left.top - right.top)) {
      const line = lines.find((candidate) => Math.min(candidate.bottom, rect.bottom) - Math.max(candidate.top, rect.top) > Math.min(candidate.bottom - candidate.top, rect.height) / 2);
      if (line) {
        line.top = Math.min(line.top, rect.top);
        line.bottom = Math.max(line.bottom, rect.bottom);
      } else {
        lines.push({ top: rect.top, bottom: rect.bottom });
      }
    }
    return lines;
  };

  const verticalCenter = (rect) => rect.top + rect.height / 2;
  const horizontalCenter = (rect) => rect.left + rect.width / 2;
  const round = (value) => Math.round(value * 10) / 10;

  // 枠線の内側の箱（中身を真ん中に置くときの基準）。
  const innerBox = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const top = rect.top + parseFloat(style.borderTopWidth);
    const bottom = rect.bottom - parseFloat(style.borderBottomWidth);
    const left = rect.left + parseFloat(style.borderLeftWidth);
    const right = rect.right - parseFloat(style.borderRightWidth);
    return { top, bottom, left, right, width: right - left, height: bottom - top };
  };

  const shownSvgs = (element) => [...element.querySelectorAll("svg")].filter((svg) => isShown(svg) && !svg.parentElement.closest("svg"));

  const report = (kind, element, detail) => findings.push({ kind, element: describe(element), ...detail });

  const controls = [...document.querySelectorAll("button, [role=button], [role=tab], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=option], a[href], summary")]
    .filter(isShown);

  // 1. アイコンだけのボタン: アイコンの中心と、枠の中心。
  for (const control of controls) {
    if (textLineRects(control).length > 0) continue;
    const svgs = shownSvgs(control);
    if (svgs.length !== 1) continue;
    const box = innerBox(control);
    const icon = svgs[0].getBoundingClientRect();
    const dx = horizontalCenter(icon) - horizontalCenter(box);
    const dy = verticalCenter(icon) - verticalCenter(box);
    if (Math.abs(dx) >= TOLERANCE_PX || Math.abs(dy) >= TOLERANCE_PX) {
      report("icon-off-center", control, { dx: round(dx), dy: round(dy) });
    }
  }

  // 2. 1 行の文字のボタン: 中身（文字と、アイコン）のまとまりの縦の中心と、枠の縦の中心。
  //    アイコンを文字の上に置くボタン（スマホの下のタブ）も、まとまりで比べる。
  for (const control of controls) {
    const box = innerBox(control);
    if (box.height > SINGLE_LINE_CONTROL_MAX_HEIGHT) continue;
    // 枠の無い文字だけのリンクは、行の中の文字なので比べない。
    if (control.matches("a") && getComputedStyle(control).display === "inline") continue;
    if (control.closest(".katex, .ProseMirror")) continue;
    // 2 行が正しい形の部品: 題と本文の一部を出す検索の結果の行、名前と説明を出す「/」の候補、題とメモの名前を出す期限の一覧の行。
    if (control.matches(".tree-note.with-snippet, .menu-item:has(.slash-menu-description), .reminder-text")) continue;
    const textRects = textLineRects(control);
    if (textRects.length === 0) continue;
    const lines = groupIntoLines(textRects);
    const iconRects = shownSvgs(control).map((svg) => svg.getBoundingClientRect()).filter((rect) => rect.width <= 32);
    const iconsStacked = iconRects.some((icon) => lines.every((line) => icon.bottom <= line.top + 1 || icon.top >= line.bottom - 1));
    if (lines.length > 1) {
      // 文字が 2 行に折り返した 1 行用の部品。
      report("text-wraps", control, { lines: lines.length });
      continue;
    }
    const contentTop = Math.min(lines[0].top, ...(iconsStacked ? iconRects.map((rect) => rect.top) : []));
    const contentBottom = Math.max(lines[0].bottom, ...(iconsStacked ? iconRects.map((rect) => rect.bottom) : []));
    const dy = (contentTop + contentBottom) / 2 - verticalCenter(box);
    if (Math.abs(dy) >= TOLERANCE_PX) {
      report("text-off-center", control, { dy: round(dy), height: round(box.height) });
    }
  }

  // 2b. 横に並んだ操作の部品（ボタン・入力欄・選択欄）の高さ。同じ行で高さが違うと、上下の端がそろわない。
  const rowControls = "button, input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=range]), select, [role=button]";
  for (const row of [...document.querySelectorAll("body *")].filter((element) => {
    const style = getComputedStyle(element);
    return (style.display === "flex" || style.display === "inline-flex") && !style.flexDirection.startsWith("column") && isShown(element);
  })) {
    const children = [...row.children].filter((child) => child.matches(rowControls) && isShown(child) && !child.matches(".icon-button, .tool, .tab-close, .chip"));
    if (children.length < 2) continue;
    const heights = children.map((child) => round(child.getBoundingClientRect().height));
    if (Math.max(...heights) - Math.min(...heights) >= 2) {
      report("controls-in-row-differ", row, { heights });
    }
  }

  // 3. アイコンと同じ行の文字: アイコンの縦の中心と、隣の文字の行の縦の中心。
  for (const svg of [...document.querySelectorAll("svg")].filter(isShown)) {
    if (svg.parentElement.closest("svg")) continue;
    const icon = svg.getBoundingClientRect();
    // 図（Mermaid）やグラフのような大きい svg は、アイコンではない。
    if (icon.width > 32 || icon.height > 32) continue;
    let container = svg.parentElement;
    // アイコンを包むだけの要素（span など）を飛ばして、文字と並ぶ要素まで上がる。
    while (container && textLineRects(container).length === 0 && container.childElementCount <= 1 && container !== document.body) {
      container = container.parentElement;
    }
    if (!container || container === document.body) continue;
    if (container.getBoundingClientRect().height > SINGLE_LINE_CONTROL_MAX_HEIGHT * 2) continue;
    // 名前と説明の 2 行を出す「/」の候補は、アイコンを 2 行のまとまりの真ん中に置く（利用者が選んだ試作の形）。
    if (container.matches(".menu-item:has(.slash-menu-description)")) continue;
    // 入れ物の中に開いたメニュー（ツールバーから開いた表のメニューなど）の文字は、同じ行の文字ではない。
    const overlays = [...container.querySelectorAll(".menu, [role=menu], [role=dialog]")].filter((overlay) => !overlay.contains(svg));
    const insideOverlay = (element) => overlays.some((overlay) => overlay.contains(element));
    const sameLine = textLineRects(container, insideOverlay).filter((rect) => rect.bottom > icon.top && rect.top < icon.bottom);
    if (sameLine.length === 0) continue;
    // アイコンにいちばん近い文字の行（文字の大きさが違う文字が並ぶときは、近い方の文字に合わせる）。
    const nearest = sameLine.reduce((best, rect) => Math.abs(horizontalCenter(rect) - horizontalCenter(icon)) < Math.abs(horizontalCenter(best) - horizontalCenter(icon)) ? rect : best);
    const dy = verticalCenter(icon) - verticalCenter(nearest);
    if (Math.abs(dy) >= TOLERANCE_PX) {
      report("icon-beside-text-off", container, { dy: round(dy) });
    }
  }

  // 4. チェックボックスとラジオ: 印の縦の中心と、隣の文字の 1 行目の縦の中心。
  for (const input of [...document.querySelectorAll("input[type=checkbox], input[type=radio]")].filter(isShown)) {
    const box = input.getBoundingClientRect();
    const label = input.closest("label, li") ?? (input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null) ?? input.parentElement;
    const lines = textLineRects(label).filter((rect) => rect.left >= box.right - 1 || rect.right <= box.left + 1);
    if (lines.length === 0) continue;
    const firstLineTop = Math.min(...lines.map((rect) => rect.top));
    const firstLine = lines.filter((rect) => Math.abs(rect.top - firstLineTop) < 2);
    const dy = verticalCenter(box) - (Math.min(...firstLine.map((rect) => rect.top)) + Math.max(...firstLine.map((rect) => rect.bottom))) / 2;
    if (Math.abs(dy) >= TOLERANCE_PX) {
      report("checkbox-off", label, { dy: round(dy) });
    }
  }

  // 5. 枠からはみ出した文字（省略の「…」を出さずに切れている、または枠の外へ出ている）。
  for (const element of [...document.querySelectorAll("button, [role=tab], [role=menuitem], label, h1, h2, h3, th, .chip, .tag, legend")].filter(isShown)) {
    const style = getComputedStyle(element);
    if (style.textOverflow === "ellipsis" || style.overflowX === "auto" || style.overflowX === "scroll") continue;
    if (element.scrollWidth > element.clientWidth + 1 && element.clientWidth > 0) {
      report("text-overflows", element, { overflow: element.scrollWidth - element.clientWidth });
    }
  }

  // 6. 画面の横幅からはみ出したもの（スマホで横にスクロールしてしまう）。
  if (document.documentElement.scrollWidth > innerWidth + 1) {
    findings.push({ kind: "page-overflows", element: "document", overflow: document.documentElement.scrollWidth - innerWidth });
  }

  // 部品の役割。値をそろえるべき単位。
  const roleOf = (element) => {
    const tag = element.tagName.toLowerCase();
    const role = element.getAttribute("role");
    if (role === "dialog" || role === "alertdialog" || tag === "dialog") return "dialog";
    if (role === "menu" || role === "listbox") return "menu";
    if (role === "menuitem" || role === "menuitemradio" || role === "menuitemcheckbox" || role === "option") return "menu-item";
    if (role === "tab") return "tab";
    if (tag === "input" && (element.type === "checkbox" || element.type === "radio")) return element.type;
    if (tag === "input" && (element.type === "range" || element.type === "color" || element.type === "file")) return null;
    if (tag === "input" || tag === "textarea") return "text-field";
    if (tag === "select") return "select";
    if (tag === "button" || role === "button") {
      if (element.classList.contains("primary-button")) return "button-primary";
      if (element.classList.contains("secondary-button")) return "button-secondary";
      return textLineRects(element).length === 0 ? "button-icon" : "button-text";
    }
    const style = getComputedStyle(element);
    const hasBorder = ["Top", "Right", "Bottom", "Left"].some((side) => parseFloat(style[`border${side}Width`]) > 0 && style[`border${side}Style`] !== "none");
    const hasShadow = style.boxShadow !== "none";
    if ((hasBorder || hasShadow) && parseFloat(style.borderTopLeftRadius) > 0) return "surface";
    return null;
  };

  for (const element of [...document.querySelectorAll("body *")]) {
    if (element.closest("svg, .katex, .mermaid-diagram")) continue;
    if (!isShown(element)) continue;
    const role = roleOf(element);
    if (!role) continue;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    parts.push({
      role,
      element: describe(element),
      radius: style.borderTopLeftRadius,
      height: Math.round(rect.height * 10) / 10,
      fontSize: style.fontSize,
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      paddingInline: `${style.paddingLeft} ${style.paddingRight}`,
    });
  }

  // フォント: 文字を直に持つ要素の、指定されたフォント（computed）。描画に使われたフォントは、印を付けて CDP で調べる。
  const fontSamples = [];
  const samplesPerFamily = new Map();
  const fontUses = new Map();
  for (const element of [...document.querySelectorAll("body *")]) {
    // KaTeX の MathML は読み上げ用で、画面には出ない。
    if (element.closest("svg, .katex-mathml")) continue;
    const ownText = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (!ownText || !isShown(element) || isScreenReaderOnly(element)) continue;
    const style = getComputedStyle(element);
    const key = `${style.fontFamily} | ${style.fontSize} | ${style.fontWeight}`;
    const use = fontUses.get(key) ?? { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, count: 0, examples: [] };
    use.count += 1;
    if (use.examples.length < 3) use.examples.push(describe(element));
    fontUses.set(key, use);
    const sampled = samplesPerFamily.get(style.fontFamily) ?? 0;
    if (sampled < FONT_SAMPLES_PER_FAMILY) {
      samplesPerFamily.set(style.fontFamily, sampled + 1);
      const id = `font-${fontSamples.length}`;
      element.setAttribute("data-visual-audit-font", id);
      fontSamples.push({ id, fontFamily: style.fontFamily, element: describe(element) });
    }
  }

  return { findings, parts, fonts: [...fontUses.values()], fontSamples };
}
