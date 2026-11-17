import { useEffect } from "react";

// 入力欄のすぐ下に出す、その欄の入力の誤り（パスフレーズの不一致、範囲の外の数など）。
// 誤りの文を欄に結ぶ（aria-invalid と aria-describedby）ので、読み上げでも、どの欄の誤りかが分かる。
// 欄に結び付かない誤り（通信の失敗など）は、今までどおりフォームの下の .form-error に出す。

export function fieldErrorId(fieldId: string): string {
  return `${fieldId}-error`;
}

// 欄の aria-describedby に並べる id。説明（hint）と誤りの両方があれば両方を、無いものは除く。
export function describedByIds(...ids: (string | null | undefined)[]): string | undefined {
  const present = ids.filter((id): id is string => typeof id === "string" && id !== "");
  return present.length > 0 ? present.join(" ") : undefined;
}

// 欄に付ける属性。誤りが無ければ aria-invalid を付けず、説明だけを結ぶ。
export function fieldErrorAttributes(fieldId: string, message: string | null, hintId?: string) {
  return {
    "aria-invalid": message !== null ? true : undefined,
    "aria-describedby": describedByIds(hintId, message !== null ? fieldErrorId(fieldId) : null),
  };
}

export function FieldError({ fieldId, message }: { fieldId: string; message: string | null }) {
  if (message === null) {
    return null;
  }
  return <div id={fieldErrorId(fieldId)} className="form-error field-error" role="alert">{message}</div>;
}

// 送って誤りが分かったときに、その欄へフォーカスを移し、打ち直せるように中の文字を選ぶ。
export function focusFieldWithError(fieldId: string): void {
  const field = document.getElementById(fieldId);
  if (!(field instanceof HTMLElement)) {
    return;
  }
  field.focus();
  if (field instanceof HTMLInputElement && field.type !== "file") {
    field.select();
  }
}

// 処理の失敗（useAsyncAction の error）が、ある欄の誤りだと分かったときに、その欄へフォーカスを移す。
// 失敗のたびにエラーは別のものになるので、同じ誤りを続けて出したときも移す。
export function useFocusOnFieldError(fieldId: string | null, error: unknown): void {
  useEffect(() => {
    if (fieldId !== null && error !== null) {
      focusFieldWithError(fieldId);
    }
  }, [fieldId, error]);
}
