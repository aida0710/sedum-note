// 設定の 1 項目を「名前（とその下の説明）を左、欄を右」の 1 行に並べる部品。
// 行の形にするのは、欄が短い項目だけ（選択欄、設定のオンとオフのチェック、数の入力欄）。文字を自由に打つ欄（URL、
// API キー、パスフレーズ、名前、CSS）と、広い部品（切り替えのボタンの並び、テーマの見本）は、幅が要るので、
// 今までどおり .field の縦の形（名前の下に欄）で置く。
// 設定の本文が狭いとき（スマホ、PC で窓が狭いときや AI のチャットを開いているとき）は、CSS が今までの縦の並びに戻す。

import type { ReactNode } from "react";

// 欄に付ける属性。名前（label の for）と説明（aria-describedby）を、欄に結び付ける。
type SettingControlProps = { id: string; "aria-describedby": string | undefined };

type SettingRowProps = {
  // 欄の id。名前の label の for が指す。
  controlId: string;
  label: string;
  // 名前の下に小さく出す説明。
  hint?: ReactNode;
  // 欄（select か、数の input）を返す。受け取った属性を、そのまま欄に付ける。
  children: (control: SettingControlProps) => ReactNode;
};

export function SettingRow(props: SettingRowProps) {
  return <SettingRowLayout {...props} className="setting-row" />;
}

type SettingCheckboxRowProps = Omit<SettingRowProps, "children"> & {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
};

// 設定のオンとオフ。操作の前の確かめのチェック（「〜を確かめました」）は、設定ではないので、これを使わない。
export function SettingCheckboxRow({ checked, disabled, onChange, ...row }: SettingCheckboxRowProps) {
  return (
    <SettingRowLayout {...row} className="setting-row setting-checkbox-row">
      {(control) => <input type="checkbox" {...control} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />}
    </SettingRowLayout>
  );
}

function SettingRowLayout({ className, controlId, label, hint, children }: SettingRowProps & { className: string }) {
  const hintId = `${controlId}-hint`;
  const hasHint = hint !== undefined;
  return (
    // 幅を測るのは外の枠（.setting-row）で、並べ方を変えるのは中の .setting-row-layout
    // （コンテナクエリは、測る要素そのものの並べ方には効かないため）。
    <div className={className}>
      <div className="setting-row-layout">
        {/* label には名前だけを入れる。説明まで入れると、読み上げの名前と、コマンドパレットで項目を探す文字（revealSetting.ts）が変わる。 */}
        <label className="setting-row-label" htmlFor={controlId}>{label}</label>
        {hasHint && <span className="setting-row-hint" id={hintId}>{hint}</span>}
        <div className="setting-row-control">{children({ id: controlId, "aria-describedby": hasHint ? hintId : undefined })}</div>
      </div>
    </div>
  );
}
