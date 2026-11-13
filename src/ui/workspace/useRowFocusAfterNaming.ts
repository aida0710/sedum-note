// 左の列の行で名前を打ち終えたら（決めた・やめた）、その行へフォーカスを戻す。
// 名前を打っている間は行のボタンが入力欄に置き換わり、打ち終えると欄が消えてフォーカスが body に落ちる。そのままだと、
// 続けて ↑↓ や F2 を押せない。欄を離れて別の所を押したとき（フォーカスがもう別の要素にある）は、戻さない。

import { type RefObject, useEffect, useRef } from "react";

export function useRowFocusAfterNaming(naming: boolean): RefObject<HTMLButtonElement | null> {
  const rowButton = useRef<HTMLButtonElement>(null);
  const wasNaming = useRef(false);
  useEffect(() => {
    if (wasNaming.current && !naming && document.activeElement === document.body) {
      rowButton.current?.focus();
    }
    wasNaming.current = naming;
  }, [naming]);
  return rowButton;
}
