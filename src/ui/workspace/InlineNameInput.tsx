// 左の列の中で、名前（ノートブックの名前、メモのタイトル）をその場で打つ欄。Enter か欄を離れると決まり、Escape でやめる。

import { useState } from "react";

type InlineNameInputProps = {
  initialName?: string;
  placeholder: string;
  // 決めた名前（前後の空白を除いたもの）。やめたら null。
  onDone: (name: string | null) => void;
};

export function InlineNameInput({ initialName = "", placeholder, onDone }: InlineNameInputProps) {
  const [name, setName] = useState(initialName);
  return (
    <input className="inline-input" autoFocus value={name} placeholder={placeholder}
      onChange={(event) => setName(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={() => onDone(name.trim())}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          onDone(name.trim());
        } else if (event.key === "Escape") {
          onDone(null);
        }
      }} />
  );
}
