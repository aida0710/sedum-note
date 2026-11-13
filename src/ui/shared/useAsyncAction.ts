// 押したら時間のかかる処理を流すボタンの、実行中・進み具合・失敗の状態。
// 件数の分かる処理は、action の 2 つ目の引数の reportProgress で進み具合を渡す。画面は ProgressStatus で出す。

import { useState } from "react";
import type { ReportProgress, TaskProgress } from "../../core/progress/taskProgress";
import { describeError } from "../i18n/describeError";

export type AsyncActionContext = { reportProgress: ReportProgress };

export type AsyncAction<Input> = {
  run: (input: Input) => Promise<boolean>;
  busy: boolean;
  // 実行中に action が渡した、最後の進み具合。渡していなければ null。
  progress: TaskProgress | null;
  errorMessage: string | null;
  clearError: () => void;
};

export function useAsyncAction<Input>(action: (input: Input, context: AsyncActionContext) => Promise<void>): AsyncAction<Input> {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<TaskProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  return {
    busy,
    progress,
    errorMessage,
    clearError: () => setErrorMessage(null),
    run: async (input) => {
      setBusy(true);
      setProgress(null);
      setErrorMessage(null);
      try {
        await action(input, { reportProgress: setProgress });
        return true;
      } catch (error) {
        setErrorMessage(describeError(error));
        return false;
      } finally {
        setBusy(false);
        setProgress(null);
      }
    },
  };
}
