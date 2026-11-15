// ドキュメントの画像に写す見本のノートブックとメモ。公開するサイトに載るので、架空のありふれた内容だけにする。
// 本文は Markdown で書き、エディタに貼り付けて書式にする（貼り付けた Markdown は書式になる）。

// 期限は、画像を撮った日から見て「今後」に並ぶよう、撮る日の数日後にする。
function daysFromToday(days, time) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const ymd = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part) => String(part).padStart(2, "0")).join("-");
  return `${ymd} ${time}`;
}

export const NOTEBOOKS = [
  { name: "仕事", colorName: "blue", iconName: null },
  { name: "議事録", parent: "仕事", colorName: null, iconName: null },
  { name: "旅行", colorName: "orange", iconName: null },
  { name: "勉強", colorName: "purple", iconName: null },
  { name: "料理", colorName: "green", iconName: null },
  { name: "個人", colorName: null, iconName: null },
];

export const DESIGN_NOTE_TITLE = "検索の改善の設計メモ";
export const MEETING_NOTE_TITLE = "週次ミーティング 11/10";
export const PACKING_NOTE_TITLE = "沖縄旅行の持ち物";
export const TRIP_NOTE_TITLE = "沖縄旅行の予定";
export const STUDY_NOTE_TITLE = "統計の勉強ノート";

// 上から順に作る。一覧は更新の新しい順に並ぶので、最後に作ったものが上に来る。
export const NOTES = [
  {
    title: "読みたい本",
    notebook: "個人",
    markdown: ["- 数学ガール", "- プログラミング作法", "- 失敗の本質", "- 理科系の作文技術"].join("\n"),
  },
  {
    title: "引っ越しのやること",
    notebook: "個人",
    markdown: [
      "- [x] 不動産屋に退去の連絡",
      "- [ ] 電気・ガス・水道の連絡",
      "- [ ] インターネットの工事の予約（2週間前まで）",
      "- [ ] 住所変更の届け出",
    ].join("\n"),
  },
  {
    title: "カレーのレシピ（スパイス）",
    notebook: "料理",
    markdown: [
      "## 材料（4人分）",
      "| 材料 | 分量 |",
      "|---|--:|",
      "| 鶏もも肉 | 400g |",
      "| 玉ねぎ | 2個 |",
      "| トマト缶 | 1缶 |",
      "| クミン | 小さじ1 |",
      "| コリアンダー | 大さじ1 |",
      "",
      "## 作り方",
      "1. 玉ねぎを飴色になるまで20分炒める",
      "2. スパイスを入れて香りを出す",
      "3. 鶏肉とトマト缶を入れて30分煮込む",
    ].join("\n"),
  },
  {
    title: STUDY_NOTE_TITLE,
    notebook: "勉強",
    markdown: [
      "## 平均と分散",
      "平均 $\\mu$ は、値の合計を個数で割ったもの。分散は、平均からのずれの2乗の平均。",
      "",
      "$$",
      "\\sigma^2 = \\frac{1}{n} \\sum_{i=1}^{n} (x_i - \\mu)^2",
      "$$",
      "",
      "> [!tip]",
      "> 分散の正の平方根が標準偏差。元のデータと同じ単位になる。",
      "",
      "> [!warning]",
      "> 標本から母分散を推定するときは、n ではなく n − 1 で割る[^1]。",
      "",
      "## 正規分布",
      "平均 $\\mu$、標準偏差 $\\sigma$ の正規分布では、値の約68%が $\\mu \\pm \\sigma$ に入る。",
      "",
      "[^1]: 不偏分散と呼ぶ。",
    ].join("\n"),
  },
  {
    title: "問い合わせの返信",
    notebook: "仕事",
    markdown: "同期の設定の手順について問い合わせがあった。2台目の追加は、QRコードで設定をインポートできることを案内する。",
  },
  {
    title: "リリース前の確認",
    notebook: "仕事",
    markdown: [
      "- [ ] Windows・macOS・Linuxのアプリで起動を確かめる",
      "- [ ] Androidのアプリで同期を確かめる",
      "- [ ] リリースノートを書く",
    ].join("\n"),
  },
  {
    title: TRIP_NOTE_TITLE,
    notebook: "旅行",
    markdown: [
      "| 日 | 予定 | 宿 |",
      "|---|---|---|",
      "| 1日目 | 那覇に到着、国際通り | 那覇 |",
      "| 2日目 | シュノーケル（9:30集合） | 恩納村 |",
      "| 3日目 | 美ら海水族館 | 本部 |",
      "",
      "飛行機は行きが朝の便、帰りが夕方の便。#沖縄",
    ].join("\n"),
  },
  {
    title: PACKING_NOTE_TITLE,
    notebook: "旅行",
    markdown: [
      "- [x] 航空券の控え",
      "- [ ] 日焼け止め",
      `- [ ] シュノーケルの予約の確認 📅 ${daysFromToday(4, "09:00")}`,
      "- [ ] モバイルバッテリー",
      "",
      "2日目のシュノーケルは9:30集合。#todo #沖縄",
    ].join("\n"),
  },
  {
    title: MEETING_NOTE_TITLE,
    notebook: "議事録",
    markdown: [
      "## 決まったこと",
      "- リリースは来週の水曜",
      "- デザインの案は木曜までに2つ出す",
      "",
      "## 次までにやること",
      `- [ ] 設計メモを共有する 📅 ${daysFromToday(2, "10:00")}`,
      "- [ ] 問い合わせの返信の文面を見直す",
      "",
      "#todo",
    ].join("\n"),
  },
  {
    title: DESIGN_NOTE_TITLE,
    notebook: "仕事",
    markdown: [
      "## 背景",
      "メモが1,000件を超えると、検索の結果が出るまでに1秒ほどかかる。打つたびに結果を出したいので、0.1秒以内を目標にする。",
      "",
      "## 方針",
      "- 本文の索引を、メモを保存したときに更新する",
      "- ひらがなとカタカナを同じ文字として扱う",
      "  - 全角と半角の英数字も同じにする",
      "- 結果は更新が新しい順に50件まで出す",
      "",
      "| 作業 | 担当 | 状態 |",
      "|---|---|---|",
      "| 索引の更新 | 佐藤 | 進行中 |",
      "| かなの正規化 | 田中 | 完了 |",
      "| 結果の並び順 | 佐藤 | 未着手 |",
      "",
      "```mermaid",
      "flowchart LR",
      "  A[メモを保存] --> B[索引を更新]",
      "  B --> C[検索]",
      "```",
      "",
      "## やること",
      "- [x] 今の検索の時間を測る",
      `- [ ] 索引の形を決める 📅 ${daysFromToday(5, "18:00")}`,
      "- [ ] 試作を作って測り直す",
      "",
      "```ts",
      "function normalizeKana(text: string): string {",
      "  return text.replace(/[\\u30a1-\\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));",
      "}",
      "```",
    ].join("\n"),
  },
];

// 「仕事」のノートブックのプロパティと、メモごとの値（データベース表示で見せる）。
export const WORK_PROPERTIES = [
  { name: "状態", type: "select", options: ["未着手", "進行中", "完了"] },
  { name: "期日", type: "date", options: [] },
];

export const WORK_PROPERTY_VALUES = {
  [DESIGN_NOTE_TITLE]: { 状態: "進行中", 期日: daysFromToday(5, "").trim() },
  "リリース前の確認": { 状態: "未着手", 期日: daysFromToday(11, "").trim() },
  "問い合わせの返信": { 状態: "完了", 期日: daysFromToday(-3, "").trim() },
};

// メモ同士のリンク（グラフ表示とバックリンクで見せる）。from の本文の末尾に「text リンク」の段落を足す。
export const NOTE_LINKS = [
  { from: MEETING_NOTE_TITLE, text: "詳しくは", to: DESIGN_NOTE_TITLE },
  { from: "リリース前の確認", text: "日程は", to: MEETING_NOTE_TITLE },
  { from: "問い合わせの返信", text: "返信の文面は", to: MEETING_NOTE_TITLE },
  { from: PACKING_NOTE_TITLE, text: "日程は", to: TRIP_NOTE_TITLE },
  { from: TRIP_NOTE_TITLE, text: "持ち物は", to: PACKING_NOTE_TITLE },
  { from: "読みたい本", text: "読んだら", to: STUDY_NOTE_TITLE },
];
