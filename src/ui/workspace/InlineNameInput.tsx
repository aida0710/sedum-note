// 左の列やデータベース表示の中で、名前（ノートブックの名前、メモのタイトル）をその場で打つ欄。Enter か欄を離れると決まり、Escape でやめる。

import { useState } from "react";
import { isImeKeyEvent } from "../shared/imeKeyEvent";

export type InlineNameInputProps = {
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
        // 変換を確定する Enter と、変換をやめる Escape では、名前を決めない。
        if (isImeKeyEvent(event.nativeEvent)) {
          return;
        }
        if (event.key === "Enter") {
          // 決めたあとにフォーカスがボタンへ移ると（データベース表示の「新しいメモ」）、ブラウザはこの Enter の続きの
          // keypress をそのボタンへ送り、ボタンを押したことになる。既定の動作を止めて、続きを送らせない。
          event.preventDefault();
          onDone(name.trim());
        } else if (event.key === "Escape") {
          onDone(null);
        }
      }} />
  );
}
