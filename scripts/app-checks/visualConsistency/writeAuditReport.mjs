// 見た目の測定の結果を、人が読む Markdown にまとめる。
// ずれは種類ごとに、部品の値は役割ごとに「どの値が何か所で使われているか」を並べる。
// 同じ役割で値が割れている所（いちばん多い値と違う部品）も指摘に数える。意図した違いは auditExceptions.mjs で除く。

import { FIT_EXCEPTIONS, ROLE_VALUE_EXCEPTIONS } from "./auditExceptions.mjs";

const FINDING_TITLES = {
  "icon-off-center": "アイコンだけのボタンで、アイコンが枠の中央に無い（dx・dy は px）",
  "text-off-center": "ボタンの文字が、枠の縦の中央に無い（dy は px）",
  "icon-beside-text-off": "アイコンと、同じ行の文字の縦の中心がずれている（dy は px）",
  "checkbox-off": "チェックボックス・ラジオと、隣の文字の縦の中心がずれている（dy は px）",
  "text-overflows": "文字が枠からはみ出している（省略の「…」も出ない）",
  "text-wraps": "1 行のはずの部品の文字が折り返している",
  "controls-in-row-differ": "横に並んだボタン・入力欄の高さがそろっていない（heights は px）",
  "page-overflows": "画面が横幅からはみ出している",
  "field-leaves-space": "入力欄・選択欄の行が、入れ物の右の端まで届かない（leftover は残った幅の px）",
  "close-not-rightmost": "閉じる「×」の右に、ほかの部品や文字がある（beyond は px）",
  "close-leaves-space": "閉じる「×」の右に、入れ物の幅の空きが残っている（leftover は px）",
  "overlay-outside-window": "メニュー・ダイアログ・候補が、窓の外へはみ出している（上下左右の px）",
  "overlay-content-cut": "メニュー・ダイアログの中身が枠で切れていて、送ることもできない（hidden は px）",
  "japanese-in-english": "英語の画面に、日本語の文字が残っている",
};

// 役割ごとに、値の割れを指摘に数える値。高さが場面ごとに違ってよい役割（アイコンのボタンの大きさ、メニュー・ダイアログ・面の
// 高さは中身で決まる）と、いろいろな部品をまとめた役割（そのほかの文字のボタン、枠や影のある面）は、表に並べるだけにする。
const SPLIT_MEASURES_BY_ROLE = {
  "button-primary": ["radius", "height"],
  "button-secondary": ["radius", "height"],
  "button-icon": ["radius"],
  "text-field": ["radius", "height"],
  select: ["radius", "height"],
  checkbox: ["radius", "height"],
  radio: ["radius", "height"],
  menu: ["radius"],
  "menu-item": ["radius", "height"],
  dialog: ["radius"],
  tab: ["radius", "height"],
};

const ROLE_TITLES = {
  "button-primary": "主のボタン（.primary-button）",
  "button-secondary": "副のボタン（.secondary-button）",
  "button-icon": "アイコンだけのボタン",
  "button-text": "そのほかの文字のボタン",
  "text-field": "入力欄",
  select: "選択欄（select）",
  checkbox: "チェックボックス",
  radio: "ラジオ",
  menu: "メニュー・候補の一覧",
  "menu-item": "メニューの項目",
  dialog: "ダイアログ",
  tab: "タブ",
  surface: "枠や影のある面（カード、ブロック、パネル）",
};

const MEASURES = [["radius", "角丸"], ["height", "高さ"], ["fontSize", "文字の大きさ"], ["fontWeight", "文字の太さ"], ["paddingInline", "左右の余白"]];
const MEASURE_TITLES = Object.fromEntries(MEASURES);
const EXAMPLES_PER_VALUE = 3;

// 部品の説明の後ろの「ラベル」（同じ部品の項目ごとに違う文字）を除いた形。同じ部品の項目を 1 件に数えるのに使う。
const withoutLabel = (element) => element.replace(/ 「.*」$/, "");

function isExceptedFit(finding) {
  return FIT_EXCEPTIONS.some((exception) => exception.kind === finding.kind && exception.element.test(finding.element));
}

function uniqueFindings(screens) {
  // 同じ部品が複数の画面に出るので、種類と要素と値が同じものは 1 つにまとめ、出た画面を並べる。
  const merged = new Map();
  for (const screen of screens) {
    for (const finding of screen.findings.filter((candidate) => !isExceptedFit(candidate))) {
      const { kind, element, ...values } = finding;
      const key = `${kind}|${element}|${JSON.stringify(values)}`;
      const entry = merged.get(key) ?? { kind, element, values, screens: [] };
      entry.screens.push(screen.name);
      merged.set(key, entry);
    }
  }
  return [...merged.values()];
}

function valueSpread(parts, measure) {
  const spread = new Map();
  for (const part of parts) {
    const value = String(part[measure]);
    const entry = spread.get(value) ?? { value, count: 0, examples: new Set() };
    entry.count += 1;
    if (entry.examples.size < EXAMPLES_PER_VALUE) entry.examples.add(part.element);
    spread.set(value, entry);
  }
  return [...spread.values()].sort((left, right) => right.count - left.count);
}

function matchesException(split, exception) {
  return exception.role === split.role && exception.measure === split.measure
    && (exception.value === undefined || exception.value === split.value)
    && (exception.element === undefined || exception.element.test(split.element));
}

// 役割の決まった値。測った値の多さではなく、この値を基準にする（どの画面を撮ったかで、いちばん多い値が入れ替わらないように）。
// 入力欄と選択欄は --control-height、メニューの項目は「…」などのふつうのメニュー（PopupMenu）の行の高さ。
const USUAL_VALUES = { "text-field": { height: "32" }, select: { height: "32" }, "menu-item": { height: "33" } };

// 役割と値ごとに、基準の値（決まった値か、いちばん多い値）と違う部品を 1 件ずつ挙げる（同じ部品が何画面に出ても、項目がいくつあっても 1 件）。
export function roleValueSplits(parts) {
  const splits = new Map();
  for (const [role, measures] of Object.entries(SPLIT_MEASURES_BY_ROLE)) {
    const ofRole = parts.filter((part) => part.role === role);
    for (const measure of measures) {
      const spread = valueSpread(ofRole, measure);
      if (spread.length === 0) continue;
      const usual = USUAL_VALUES[role]?.[measure] ?? spread[0].value;
      const otherValues = new Set(spread.map((entry) => entry.value).filter((value) => value !== usual));
      for (const part of ofRole) {
        const value = String(part[measure]);
        if (!otherValues.has(value)) continue;
        const key = `${role}|${measure}|${value}|${withoutLabel(part.element)}`;
        if (!splits.has(key)) splits.set(key, { role, measure, value, usual, element: part.element });
      }
    }
  }
  const all = [...splits.values()];
  const excepted = all.filter((split) => ROLE_VALUE_EXCEPTIONS.some((exception) => matchesException(split, exception)));
  return { counted: all.filter((split) => !excepted.includes(split)), excepted };
}

export function countAuditFindings({ screens }) {
  return uniqueFindings(screens).length + roleValueSplits(screens.flatMap((screen) => screen.parts)).counted.length;
}

export function writeAuditReport({ browser, theme, screens, failures, unvisited = [] }) {
  const lines = [`# 見た目の測定（${browser}${theme ? `、テーマ ${theme}` : ""}）`, "", `測った画面: ${screens.length}`, ""];
  const findings = uniqueFindings(screens);
  const splits = roleValueSplits(screens.flatMap((screen) => screen.parts));
  lines.push(`指摘: ${findings.length + splits.counted.length} 件（ずれ・はみ出し ${findings.length}、役割ごとの値の割れ ${splits.counted.length}。除外の一覧に当たった割れ ${splits.excepted.length} 件は数えない）`, "");
  if (failures.length > 0) {
    lines.push("## 開けなかった画面", "");
    for (const failure of failures) lines.push(`- ${failure.screen}: ${failure.message}`);
    lines.push("");
  }
  if (unvisited.length > 0) {
    lines.push("## 撮っていない状態（道具では開けない。理由つき）", "");
    for (const state of unvisited) lines.push(`- ${state.name}: ${state.reason}`);
    lines.push("");
  }

  lines.push(`## 役割ごとの値の割れ（${splits.counted.length} 件）`, "");
  for (const split of splits.counted) {
    lines.push(`- ${ROLE_TITLES[split.role]}の${MEASURE_TITLES[split.measure]}: ${split.value}（基準は ${split.usual}） — ${split.element}`);
  }
  lines.push("");
  if (splits.excepted.length > 0) {
    lines.push(`### 除外の一覧に当たった割れ（${splits.excepted.length} 件、auditExceptions.mjs）`, "");
    for (const split of splits.excepted) lines.push(`- ${ROLE_TITLES[split.role]}の${MEASURE_TITLES[split.measure]}: ${split.value} — ${split.element}`);
    lines.push("");
  }

  lines.push(`## ずれ・はみ出し（${findings.length} 件）`, "");
  for (const [kind, title] of Object.entries(FINDING_TITLES)) {
    const ofKind = findings.filter((finding) => finding.kind === kind);
    if (ofKind.length === 0) continue;
    lines.push(`### ${title}（${ofKind.length} 件）`, "");
    for (const finding of ofKind) {
      lines.push(`- ${finding.element} — ${JSON.stringify(finding.values)} — ${[...new Set(finding.screens)].slice(0, 4).join(", ")}`);
    }
    lines.push("");
  }

  lines.push("## 部品の役割ごとの値", "");
  const allParts = screens.flatMap((screen) => screen.parts);
  for (const [role, title] of Object.entries(ROLE_TITLES)) {
    const ofRole = allParts.filter((part) => part.role === role);
    if (ofRole.length === 0) continue;
    lines.push(`### ${title}（のべ ${ofRole.length}）`, "");
    for (const [measure, measureTitle] of MEASURES) {
      const spread = valueSpread(ofRole, measure);
      lines.push(`- ${measureTitle}: ${spread.map((entry) => `${entry.value}（${entry.count}）`).join("、")}`);
      if (spread.length > 1) {
        for (const entry of spread) lines.push(`  - ${entry.value}: ${[...entry.examples].join(" / ")}`);
      }
    }
    lines.push("");
  }

  lines.push("## フォント（指定）", "");
  const fontUses = new Map();
  for (const screen of screens) {
    for (const use of screen.fonts) {
      const entry = fontUses.get(use.fontFamily) ?? { count: 0, sizes: new Set(), examples: new Set() };
      entry.count += use.count;
      entry.sizes.add(use.fontSize);
      for (const example of use.examples) if (entry.examples.size < EXAMPLES_PER_VALUE) entry.examples.add(example);
      fontUses.set(use.fontFamily, entry);
    }
  }
  for (const [family, entry] of fontUses) {
    lines.push(`- ${family}（${entry.count}）: 大きさ ${[...entry.sizes].join("、")} — 例 ${[...entry.examples].join(" / ")}`);
  }
  lines.push("");

  const rendered = screens.flatMap((screen) => screen.renderedFonts);
  if (rendered.length > 0) {
    lines.push("## フォント（実際に描画に使われたもの、Chromium の CDP）", "");
    const byFamily = new Map();
    for (const sample of rendered) {
      const entry = byFamily.get(sample.fontFamily) ?? { platformFonts: new Set(), examples: new Set() };
      for (const font of sample.platformFonts) entry.platformFonts.add(font);
      if (entry.examples.size < EXAMPLES_PER_VALUE) entry.examples.add(sample.element);
      byFamily.set(sample.fontFamily, entry);
    }
    for (const [family, entry] of byFamily) {
      lines.push(`- 指定 ${family} → 描画 ${[...entry.platformFonts].join("、")} — 例 ${[...entry.examples].join(" / ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
