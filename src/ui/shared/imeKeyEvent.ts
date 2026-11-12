// 日本語などの変換（IME）の操作として押されたキーかを見分ける。変換を確定する Enter や、変換をやめる Escape を、
// 入力欄の確定や取り消しとして扱わないために使う。

import type { KeyboardEvent as ReactKeyboardEvent } from "react";

// 変換の操作として処理されたキーに、ブラウザが付ける keyCode。
const IME_PROCESSED_KEY_CODE = 229;

// 変換中のキーは isComposing で分かる。WebKit（macOS と Linux のアプリ、Safari）は、変換を確定する Enter を
// 変換の終了のあとに届けるので isComposing が false になる。そのキーも keyCode は 229 で届くので、両方を見る。
export function isImeKeyEvent(event: Pick<KeyboardEvent, "isComposing" | "keyCode">): boolean {
  return event.isComposing || event.keyCode === IME_PROCESSED_KEY_CODE;
}

// form の onKeyDown に付ける。変換を確定する Enter で、フォームが送信されないようにする。
export function preventSubmitByImeKey(event: ReactKeyboardEvent<HTMLFormElement>): void {
  if (event.key === "Enter" && isImeKeyEvent(event.nativeEvent)) {
    event.preventDefault();
  }
}
