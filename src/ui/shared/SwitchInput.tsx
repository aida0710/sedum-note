// 設定のオンとオフのスイッチ（チェックボックスを、スイッチの形と読み上げにしたもの）。押した時点で効く設定に使う。
// 切り替えたら、Android のアプリでは短く振動する（platform/hapticFeedback.ts）。onChange のあとに振動させるので、
// 振動の設定そのものは、入れたときだけ振動する。

import type { InputHTMLAttributes } from "react";
import { giveHapticFeedback } from "../platform/hapticFeedback";

type SwitchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role" | "className" | "checked" | "onChange"> & {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function SwitchInput({ checked, onChange, ...attributes }: SwitchInputProps) {
  return (
    <input {...attributes} type="checkbox" role="switch" className="switch" checked={checked}
      onChange={(event) => {
        onChange(event.target.checked);
        giveHapticFeedback();
      }} />
  );
}
