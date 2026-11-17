// 指で押す端末（pointer: coarse）の画面で、押せる部品のタップ領域を測る。ブラウザの中で動かす（page.evaluate に関数ごと渡す）ので、
// 外の変数を使わない。マウスの端末の画面では何も返さない（タップ領域を広げる規則は @media (pointer: coarse) の中にある）。
//
// タップ領域は、部品の枠に、透明に重ねた ::before・::after（app.css の --touch-area-inset）を足し、スクロールする入れ物
// （overflow が visible でない祖先）の内側で切った範囲。
//
// 返す findings:
// - touch-target-overlap: 見た目が離れている 2 つの部品のタップ領域が重なり、片方の見た目の中まで入り込んでいる。
//   入り込んだ所を押すと、見えている部品ではなく、上に重なった隣の部品が反応する（2026-11-17 の調査で、スマホの
//   書式のツールバーの右端 4px が右隣のボタンになっていた）。
// - touch-target-small: タップ領域の幅か高さが 44px（iOS と Android の指針の大きさ）に届かない。
export function measureTouchTargets() {
  if (!matchMedia("(pointer: coarse)").matches) return [];
  // iOS の Human Interface Guidelines の 44pt と、app.css の「押せる範囲を 44px まで広げる」の値。
  const MINIMUM_TARGET_PX = 44;
  // 1px 未満の差は、小数の配置の丸めで出るので数えない。
  const TOLERANCE_PX = 1;
  const TARGET_SELECTOR = [
    "button", "a[href]", "summary", "select", "label", "input[type=checkbox]", "input[type=radio]", "input[type=range]",
    "[role=button]", "[role=tab]", "[role=menuitem]", "[role=menuitemcheckbox]", "[role=menuitemradio]", "[role=option]",
    "[role=radio]", "[role=checkbox]", "[role=switch]",
  ].join(", ");

  const findings = [];
  const round = (value) => Math.round(value * 10) / 10;

  const describe = (element) => {
    const names = [];
    let current = element;
    for (let depth = 0; current && current !== document.body && depth < 3; depth += 1) {
      const classes = typeof current.className === "string" ? current.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
      names.unshift(current.tagName.toLowerCase() + classes.map((name) => `.${name}`).join(""));
      current = current.parentElement;
    }
    const label = element.getAttribute("aria-label") ?? element.getAttribute("title") ?? element.textContent.trim().slice(0, 16);
    return `${names.join(" > ")}${label ? ` 「${label.slice(0, 24)}」` : ""}`;
  };

  const intersect = (a, b) => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) });
  const hasArea = (rect) => rect.right - rect.left > TOLERANCE_PX && rect.bottom - rect.top > TOLERANCE_PX;
  const viewport = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };

  // 文の中の部品（本文のリンクや数式、AI の答えのリンク）は、文字の大きさで決まるので測らない（WCAG 2.5.8 の「文の中」の例外）。
  const isInlineInText = (element) => getComputedStyle(element).display === "inline";
  // チェックボックスを包んだ label が押せる範囲なので、中の input は label の方で数える。チェックボックスを持たない label は押せる部品ではない。
  const isTarget = (element) => {
    if (isInlineInText(element)) return false;
    if (element.matches("label")) return element.querySelector("input[type=checkbox], input[type=radio]") !== null;
    if (element.matches("input[type=checkbox], input[type=radio]") && element.closest("label")) return false;
    return true;
  };

  // overflow で切る祖先の内側（枠の内側）を、順に重ねる。
  const clipOf = (element) => {
    let clip = viewport;
    for (let current = element.parentElement; current && current !== document.documentElement; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.overflowX === "visible" && style.overflowY === "visible") continue;
      const rect = current.getBoundingClientRect();
      const inner = { left: rect.left + current.clientLeft, top: rect.top + current.clientTop, right: rect.left + current.clientLeft + current.clientWidth, bottom: rect.top + current.clientTop + current.clientHeight };
      clip = intersect(clip, inner);
    }
    return clip;
  };

  // 部品の枠に、透明に重ねた ::before・::after を足した範囲。疑似要素は、部品自身を基準に position: absolute で置いたものだけを見る。
  const hitRectOf = (element) => {
    const rect = element.getBoundingClientRect();
    const hit = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    const style = getComputedStyle(element);
    if (style.position === "static") return hit;
    for (const pseudo of ["::before", "::after"]) {
      const pseudoStyle = getComputedStyle(element, pseudo);
      if (pseudoStyle.content === "none" || pseudoStyle.content === "normal") continue;
      if (pseudoStyle.position !== "absolute" || pseudoStyle.pointerEvents === "none" || pseudoStyle.display === "none") continue;
      const insets = ["top", "right", "bottom", "left"].map((side) => parseFloat(pseudoStyle[side]));
      if (insets.some(Number.isNaN)) continue;
      const [top, right, bottom, left] = insets;
      hit.left = Math.min(hit.left, rect.left + parseFloat(style.borderLeftWidth) + left);
      hit.top = Math.min(hit.top, rect.top + parseFloat(style.borderTopWidth) + top);
      hit.right = Math.max(hit.right, rect.right - parseFloat(style.borderRightWidth) - right);
      hit.bottom = Math.max(hit.bottom, rect.bottom - parseFloat(style.borderBottomWidth) - bottom);
    }
    return hit;
  };

  // 画面に見えていて、中央を押すとその部品に届くもの（ほかの面の下に隠れたもの、送る枠の外へ出たものは除く）。
  const reachableTargets = [];
  for (const element of document.querySelectorAll(TARGET_SELECTOR)) {
    if (!isTarget(element)) continue;
    if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const clip = clipOf(element);
    const own = element.getBoundingClientRect();
    const visible = intersect(own, clip);
    // スクロールの端で一部だけ見えている部品は、送れば全部が見えるので測らない。
    const isCut = visible.right - visible.left < own.width - TOLERANCE_PX || visible.bottom - visible.top < own.height - TOLERANCE_PX;
    if (!hasArea(visible) || isCut) continue;
    const centreX = (visible.left + visible.right) / 2;
    const centreY = (visible.top + visible.bottom) / 2;
    const topmost = document.elementFromPoint(centreX, centreY);
    if (!topmost || !(topmost === element || element.contains(topmost))) continue;
    reachableTargets.push({ element, visible, hit: intersect(hitRectOf(element), clip) });
  }

  for (const target of reachableTargets) {
    const width = target.hit.right - target.hit.left;
    const height = target.hit.bottom - target.hit.top;
    if (Math.min(width, height) < MINIMUM_TARGET_PX - TOLERANCE_PX) {
      findings.push({ kind: "touch-target-small", element: describe(target.element), width: round(width), height: round(height) });
    }
  }

  for (let first = 0; first < reachableTargets.length; first += 1) {
    for (let second = first + 1; second < reachableTargets.length; second += 1) {
      const a = reachableTargets[first];
      const b = reachableTargets[second];
      if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
      // 見た目が重なる部品（カードの上に置いたボタンなど）は、わざと重ねたもの。
      if (hasArea(intersect(a.visible, b.visible))) continue;
      const shared = intersect(a.hit, b.hit);
      if (!hasArea(shared)) continue;
      for (const [owner, intruder] of [[a, b], [b, a]]) {
        const stolen = intersect(shared, owner.visible);
        if (!hasArea(stolen)) continue;
        const topmost = document.elementFromPoint((stolen.left + stolen.right) / 2, (stolen.top + stolen.bottom) / 2);
        if (!topmost || !(topmost === intruder.element || intruder.element.contains(topmost))) continue;
        findings.push({
          kind: "touch-target-overlap", element: describe(owner.element), other: describe(intruder.element),
          width: round(stolen.right - stolen.left), height: round(stolen.bottom - stolen.top),
        });
      }
    }
  }
  return findings;
}
