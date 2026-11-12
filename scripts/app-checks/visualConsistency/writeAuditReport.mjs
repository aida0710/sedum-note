// 見た目の測定の結果を、人が読む Markdown にまとめる。
// ずれは種類ごとに、部品の値は役割ごとに「どの値が何か所で使われているか」を並べ、同じ役割で値が割れている所を見つけやすくする。

const FINDING_TITLES = {
  "icon-off-center": "アイコンだけのボタンで、アイコンが枠の中央に無い（dx・dy は px）",
  "text-off-center": "ボタンの文字が、枠の縦の中央に無い（dy は px）",
  "icon-beside-text-off": "アイコンと、同じ行の文字の縦の中心がずれている（dy は px）",
  "checkbox-off": "チェックボックス・ラジオと、隣の文字の縦の中心がずれている（dy は px）",
  "text-overflows": "文字が枠からはみ出している（省略の「…」も出ない）",
  "text-wraps": "1 行のはずの部品の文字が折り返している",
  "controls-in-row-differ": "横に並んだボタン・入力欄の高さがそろっていない（heights は px）",
  "page-overflows": "画面が横幅からはみ出している",
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
const EXAMPLES_PER_VALUE = 3;

function uniqueFindings(screens) {
  // 同じ部品が複数の画面に出るので、種類と要素と値が同じものは 1 つにまとめ、出た画面を並べる。
  const merged = new Map();
  for (const screen of screens) {
    for (const finding of screen.findings) {
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

export function writeAuditReport({ browser, theme, screens, failures }) {
  const lines = [`# 見た目の測定（${browser}${theme ? `、テーマ ${theme}` : ""}）`, "", `測った画面: ${screens.length}`, ""];
  if (failures.length > 0) {
    lines.push("## 開けなかった画面", "");
    for (const failure of failures) lines.push(`- ${failure.screen}: ${failure.message}`);
    lines.push("");
  }

  const findings = uniqueFindings(screens);
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
