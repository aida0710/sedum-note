// 開いている画面で、部品が入れ物に合っているかを測る。ブラウザの中で動かす（page.evaluate に関数ごと渡す）ので、外の変数を使わない。
//
// 返す findings:
// - field-leaves-space: 入力欄・選択欄の行の右に、入れ物の幅の空きが残っている（検索のバーが横いっぱいに広がらない、
//   プロパティの値の欄が枠の半分で止まる、のような形）。
// - close-not-rightmost: 閉じる「×」の右に、ほかの部品や文字がある。
// - close-leaves-space: 閉じる「×」の右に、入れ物の幅の空きが残っている（「×」が行の真ん中に見える）。
// - overlay-outside-window: メニュー・ダイアログ・候補・ボタンの並びが、窓の外へはみ出している。
// - overlay-content-cut: メニュー・ダイアログの中身が枠で切れていて、送ることもできない。
//
// 「入れ物」は、部品から祖先をたどって最初に当たる、幅を決めている要素: 下の CONTAINER_SELECTOR（本文の列・ダイアログ・
// メニュー・左の列など）、スクロールする要素、枠か影と角丸のある面（カード）、窓に浮かせた要素（position: fixed・absolute）。
export function measureContainerFit() {
  // 本文の列・ダイアログなど、中の行が幅いっぱいに広がるべき入れ物。
  const CONTAINER_SELECTOR = [
    "[role=dialog]", "[role=alertdialog]", "[role=menu]", "[role=listbox]", ".menu",
    ".pane", ".split-pane", ".ai-chat", ".sidebar", ".document", ".settings", ".reminders-view", ".database-view", ".phone", "td", "th",
  ].join(", ");
  // 行の右の空きが、入れ物の内側の余白の分を超えてこれ以上あれば、幅いっぱいに広がっていないとみなす。
  const LEFTOVER_SPACE_PX = 32;
  // 1px 未満の差は、小数の配置の丸めで出るので数えない。
  const TOLERANCE_PX = 1;
  // 幅いっぱいに広がるはずの入力欄の種類。数・日付・色などは中身の長さで幅が決まるので測らない。
  const STRETCHING_FIELD = "input:not([type]), input[type=text], input[type=search], input[type=url], input[type=email], input[type=password], textarea, select";
  const OVERLAY_SELECTOR = "[role=menu], [role=listbox], [role=dialog], [role=alertdialog], [role=tooltip], .menu, .slash-menu, .selection-toolbar, .web-link-popover, .toast";

  const findings = [];
  const round = (value) => Math.round(value * 10) / 10;

  const isShown = (element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) return false;
    return element.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  };

  const describe = (element) => {
    const names = [];
    let current = element;
    for (let depth = 0; current && current !== document.body && depth < 3; depth += 1) {
      const classes = typeof current.className === "string" ? current.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
      names.unshift(current.tagName.toLowerCase() + classes.map((name) => `.${name}`).join(""));
      current = current.parentElement;
    }
    const label = element.getAttribute("aria-label") ?? element.getAttribute("title") ?? element.getAttribute("placeholder") ?? "";
    return `${names.join(" > ")}${label ? ` 「${label.slice(0, 24)}」` : ""}`;
  };

  const isSurface = (element) => {
    const style = getComputedStyle(element);
    const hasBorder = ["Top", "Right", "Bottom", "Left"].some((side) => parseFloat(style[`border${side}Width`]) > 0 && style[`border${side}Style`] !== "none");
    return (hasBorder || style.boxShadow !== "none") && parseFloat(style.borderTopLeftRadius) > 0;
  };

  const isContainer = (element) => {
    if (element.matches(CONTAINER_SELECTOR)) return true;
    const style = getComputedStyle(element);
    if (style.position === "fixed" || style.position === "absolute") return true;
    if (["auto", "scroll"].includes(style.overflowX) || ["auto", "scroll"].includes(style.overflowY)) return true;
    return isSurface(element);
  };

  const containerOf = (element) => {
    for (let current = element.parentElement; current && current !== document.body; current = current.parentElement) {
      if (isContainer(current)) return current;
    }
    return document.body;
  };

  // 入れ物の中身を置ける右の端（枠・内側の余白・スクロールバーの内側）。
  const contentRightOf = (container) => {
    const rect = container.getBoundingClientRect();
    const style = getComputedStyle(container);
    return rect.left + container.clientLeft + container.clientWidth - parseFloat(style.paddingRight);
  };

  // 入れ物の中で、縦に band と重なっている部品と文字の右の端のうち、いちばん右のもの。
  // 行を包むだけの要素（幅いっぱいの div など）は、空きを隠すので数えない。
  const rightmostContentOnBand = (container, band, ignored) => {
    let rightmost = -Infinity;
    for (const element of container.querySelectorAll("button, input, select, textarea, [role=button], [role=status], svg, img, label, span, a, p, h1, h2, h3, h4")) {
      if (ignored.contains(element) || element.contains(ignored)) continue;
      if (element.tagName !== "svg" && element.closest("svg") !== null) continue;
      if (!isShown(element)) continue;
      const rect = element.getBoundingClientRect();
      const overlap = Math.min(rect.bottom, band.bottom) - Math.max(rect.top, band.top);
      if (overlap < Math.min(rect.height, band.height) / 2) continue;
      const ownText = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      if (!ownText && !element.matches("button, input, select, textarea, [role=button], svg, img")) continue;
      rightmost = Math.max(rightmost, rect.right);
    }
    return rightmost;
  };

  // 1. 入力欄・選択欄の行が、入れ物の右の端まで届いているか。
  for (const field of [...document.querySelectorAll(STRETCHING_FIELD)].filter(isShown)) {
    if (field.closest(".ProseMirror")) continue;
    const container = containerOf(field);
    const band = field.getBoundingClientRect();
    const rowRight = Math.max(band.right, rightmostContentOnBand(container, band, field));
    const leftover = contentRightOf(container) - rowRight;
    if (leftover >= LEFTOVER_SPACE_PX) {
      findings.push({ kind: "field-leaves-space", element: describe(field), container: describe(container), leftover: round(leftover), width: round(band.width) });
    }
  }

  // 2. 閉じる「×」（アイコンだけのボタン）が、行の右の端にあるか。タブ・チップ・メニューの項目の中の「×」は、その部品の中の右端なので測らない。
  const isCloseIcon = (svg) => svg.classList.contains("lucide-x") || [...svg.querySelectorAll("path")].some((path) => path.getAttribute("d") === "M18 6 6 18");
  const closeButtons = [...document.querySelectorAll("button, [role=button]")].filter((button) => {
    if (!isShown(button) || button.closest("[role=tab], .chip, .tag, [role=menuitem], .menu-item, .ProseMirror")) return false;
    const svgs = [...button.querySelectorAll("svg")];
    return svgs.length === 1 && isCloseIcon(svgs[0]) && !(button.textContent ?? "").trim();
  });
  for (const button of closeButtons) {
    const container = containerOf(button);
    const band = button.getBoundingClientRect();
    const rightOfButton = rightmostContentOnBand(container, band, button);
    if (rightOfButton > band.right + TOLERANCE_PX) {
      findings.push({ kind: "close-not-rightmost", element: describe(button), container: describe(container), beyond: round(rightOfButton - band.right) });
      continue;
    }
    const leftover = contentRightOf(container) - band.right;
    if (leftover >= LEFTOVER_SPACE_PX) {
      findings.push({ kind: "close-leaves-space", element: describe(button), container: describe(container), leftover: round(leftover) });
    }
  }

  // 3. 浮かせて出すもの（メニュー・ダイアログ・候補・ボタンの並び）が窓の中に収まり、中身が切れていないか。
  for (const overlay of [...document.querySelectorAll(OVERLAY_SELECTOR)].filter(isShown)) {
    // メニューの中のメニュー（同じ枠の入れ子）は、外側で測る。
    if (overlay.parentElement?.closest(OVERLAY_SELECTOR) && !overlay.matches("[role=dialog], [role=alertdialog]")) continue;
    const rect = overlay.getBoundingClientRect();
    const outside = {
      top: round(Math.max(0, -rect.top)), bottom: round(Math.max(0, rect.bottom - innerHeight)),
      left: round(Math.max(0, -rect.left)), right: round(Math.max(0, rect.right - innerWidth)),
    };
    if (Object.values(outside).some((amount) => amount > TOLERANCE_PX)) {
      findings.push({ kind: "overlay-outside-window", element: describe(overlay), ...outside });
    }
    const style = getComputedStyle(overlay);
    const scrolls = ["auto", "scroll"].includes(style.overflowY);
    if (!scrolls && overlay.scrollHeight > overlay.clientHeight + TOLERANCE_PX && style.overflowY !== "visible") {
      findings.push({ kind: "overlay-content-cut", element: describe(overlay), hidden: overlay.scrollHeight - overlay.clientHeight });
    }
  }

  return findings;
}
