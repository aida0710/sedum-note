// 押したら時間のかかる処理を流すボタンの、実行中と失敗の状態。

import { useState } from "react";
import { describeError } from "../i18n/describeError";

export type AsyncAction<Input> = {
  run: (input: Input) => Promise<boolean>;
  busy: boolean;
  errorMessage: string | null;
  clearError: () => void;
};

export function useAsyncAction<Input>(action: (input: Input) => Promise<void>): AsyncAction<Input> {
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  return {
    busy,
    errorMessage,
    clearError: () => setErrorMessage(null),
    run: async (input) => {
      setBusy(true);
      setErrorMessage(null);
      try {
        await action(input);
        return true;
      } catch (error) {
        setErrorMessage(describeError(error));
        return false;
      } finally {
        setBusy(false);
      }
    },
  };
}
