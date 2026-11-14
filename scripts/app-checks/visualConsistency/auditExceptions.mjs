// 同じ役割の部品で値が違っても、意図した違いなので「割れ」に数えないもの。1 件ずつ理由を書く。
// 新しく足すときは、なぜその値なのか（どの :root の変数か、どの決まりか）を reason に書く。理由が書けないなら、足さずに直す。
//
// 形: { role, measure, value?, element?, reason }
// - role・measure: writeAuditReport.mjs の役割（text-field など）と、測る値（radius・height）。
// - value: その値のときだけ除く（"28" など。px は付けない。角丸は "8px" の形）。省けば値を問わない。
// - element: 部品の説明（measureScreen.mjs の describe の文字）に当たる正規表現。省けば部品を問わない。

export const ROLE_VALUE_EXCEPTIONS = [
  {
    role: "text-field", measure: "height", value: "28",
    reason: "--control-height-compact。クエリの条件、脚注、表の中のプロパティなど、本文の中に置く詰めた欄",
  },
  {
    role: "select", measure: "height", value: "28",
    reason: "--control-height-compact。クエリの条件、表の中のプロパティなど、本文の中に置く詰めた欄",
  },
  {
    role: "text-field", measure: "height", element: /textarea\.title-input/,
    reason: "メモの題。本文より大きい字（--font-size-title）で、長い題は折り返して高さが伸びる",
  },
  {
    role: "text-field", measure: "height", element: /textarea\.code-input/,
    reason: "自作のテーマのカスタム CSS。複数行を打つ欄",
  },
  {
    role: "text-field", measure: "height", element: /label\.(sidebar|phone)-search > input/,
    reason: "枠は外側の label（左の列・スマホの一覧・パレットの検索）が持ち（高さは --control-height）、中の input は文字の行だけの高さ",
  },
  {
    role: "text-field", measure: "height", element: /ai-chat-composer .*textarea/,
    reason: "AI への発言の欄。複数行を打ち、打った分だけ高さが伸びる",
  },
  {
    role: "menu", measure: "radius", element: /div\.dialog[^>]* > div\.(note-picker-list|note-history-body)|div\.note-history-list/,
    reason: "ダイアログの中に置いた一覧（浮かせたメニューではない）。角丸はダイアログが持つ",
  },
  {
    role: "menu-item", measure: "height", element: /note-history-list > button\.menu-item/,
    reason: "履歴の版の行。日時と変わった所の 2 行を出す",
  },
  {
    role: "button-icon", measure: "radius", element: /button\.choice/,
    reason: "色・配置・アイコンを選ぶタイル（.choice）。押すボタンではなく選ぶ面で、角丸は --radius-control",
  },
  {
    role: "button-icon", measure: "radius", element: /button\.image-resize-handle/,
    reason: "写真の右下の大きさを変えるつまみ。ボタンの部品ではなく、つかむ印（--radius-inline）",
  },
  {
    role: "button-icon", measure: "radius", element: /button\.ai-send-button/,
    reason: "AI チャットの送るボタン（答えている間は止めるボタンに入れ替わる）。Claude・ChatGPT の入力欄と同じ丸いボタン",
  },
  {
    role: "tab", measure: "radius", element: /div\.segmented > button/,
    reason: "最初の画面の「始める・バックアップから戻す」の切り替え（セグメント）。タブの帯ではなく、枠の中の選択肢（--radius-row）",
  },
  {
    role: "tab", measure: "height", element: /div\.segmented > button/,
    reason: "最初の画面の「始める・バックアップから戻す」の切り替え（セグメント）。タブの帯とは別の部品",
  },
  {
    role: "button-icon", measure: "radius", element: /button\.note-item/,
    reason: "スマホの一覧のメモの行。幅いっぱいの行で、区切り線で分ける（角丸は付けない）",
  },
  {
    role: "button-icon", measure: "radius", element: /button\.fab/,
    reason: "スマホの「新しいメモ」の丸いボタン（Material の FAB と同じ形）",
  },
  {
    role: "button-icon", measure: "radius", element: /button\.tab-close/,
    reason: "タブの ×。:root の --radius-inline の役割（文の中の印とタブの ×）のとおり",
  },
  {
    role: "checkbox", measure: "radius", element: /input\.switch/,
    reason: "設定のオンとオフのトグルスイッチ（利用者が選んだ C-05 の案）。丸い形で、高さ 20px",
  },
  {
    role: "checkbox", measure: "height", element: /input\.switch/,
    reason: "設定のオンとオフのトグルスイッチ（利用者が選んだ C-05 の案）。34×20px",
  },
  {
    role: "menu-item", measure: "height", element: /div\.(slash-menu|table-menu)|slash-menu-group/,
    reason: "「/」の候補と表のメニューは、項目が多いので行を詰める（上下 5px）。説明のある「/」の候補は名前と説明の 2 行（利用者が選んだ C-06 の案）",
  },
  {
    role: "menu-item", measure: "height", value: "34",
    reason: "スマホの組み方では部品の文字が 14px（利用者が選んだ C-39 の案 B）なので、メニューの項目も 1px 高い。PC でキーの表示のある項目が 34px になる崩れは、.menu-item > kbd の line-height で直した",
  },
  {
    role: "tab", measure: "height", element: /div\.tab\.on/,
    reason: "開いているタブは、下の線に 1px 重ねて本文の面とつなげる（margin-bottom: -1px）",
  },
  {
    role: "button-icon", measure: "radius", element: /math-rendered/,
    reason: "表示した数式（role=button でキーボードから編集に入れる）。ボタンの部品ではなく、本文の中の飾り（--radius-inline）",
  },
];

// 入れ物に合っているかの指摘（measureContainerFit.mjs）のうち、意図した形なので数えないもの。形: { kind, element, reason }。
export const FIT_EXCEPTIONS = [
  {
    kind: "field-leaves-space", element: /div\.database-view > div\.field\.database-group > select/,
    reason: "データベース表示の上の「グループ分け」の選択欄。帯の中の操作で、中身の長さの幅でよい",
  },
];
