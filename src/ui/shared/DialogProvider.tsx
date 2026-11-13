// 確認と 1 行の入力のダイアログ。window.confirm・prompt は WebView ごとに出方が違い
// （Android の WebView では出ないことがある）、試験からも見えないので、画面の中に出す。

import { createContext, type KeyboardEvent, type ReactNode, useCallback, useContext, useId, useState } from "react";
import { translate } from "../i18n/translate";
import { ModalDialog } from "./ModalDialog";
import { preventSubmitByImeKey } from "./imeKeyEvent";

type ConfirmRequest = {
  kind: "confirm"; title: string | undefined; message: string; confirmLabel: string; cancelLabel: string; danger: boolean; resolve: (accepted: boolean) => void;
};
type PromptRequest = { kind: "prompt"; title: string; message: string; initialValue: string; confirmLabel: string; resolve: (value: string | null) => void };
type DialogRequest = ConfirmRequest | PromptRequest;

export type Dialogs = {
  // title は、問いの上に出す見出し（「ゴミ箱を空にする」など）。cancelLabel を渡すと、2 つの選択肢から選ぶ問いにできる（既定は「キャンセル」）。
  confirm: (input: { title?: string; message: string; confirmLabel: string; cancelLabel?: string; danger?: boolean }) => Promise<boolean>;
  // title は、何のための入力かの見出し（「ノートブックを追加」など）。message は、入力欄のラベル（「ノートブックの名前」など）。
  // confirmLabel は、決めるボタンの名前（「追加」「設定」など、何を行うかを言う言葉）。
  prompt: (input: { title: string; message: string; confirmLabel: string; initialValue?: string }) => Promise<string | null>;
};

const DialogContext = createContext<Dialogs | null>(null);

export function useDialogs(): Dialogs {
  const dialogs = useContext(DialogContext);
  if (!dialogs) {
    throw new Error("useDialogs needs a DialogProvider");
  }
  return dialogs;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const confirm = useCallback<Dialogs["confirm"]>(
    ({ title, message, confirmLabel, cancelLabel = translate("common.cancel"), danger = false }) =>
      new Promise((resolve) => setRequest({ kind: "confirm", title, message, confirmLabel, cancelLabel, danger, resolve })),
    [],
  );
  const prompt = useCallback<Dialogs["prompt"]>(
    ({ title, message, confirmLabel, initialValue = "" }) => new Promise((resolve) => setRequest({ kind: "prompt", title, message, initialValue, confirmLabel, resolve })),
    [],
  );
  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      {request && <DialogView request={request} onDone={() => setRequest(null)} />}
    </DialogContext.Provider>
  );
}

function DialogView({ request, onDone }: { request: DialogRequest; onDone: () => void }) {
  const [value, setValue] = useState(request.kind === "prompt" ? request.initialValue : "");
  const inputId = useId();
  const finish = (accepted: boolean) => {
    if (request.kind === "confirm") {
      request.resolve(accepted);
    } else {
      request.resolve(accepted ? value : null);
    }
    onDone();
  };
  // 戻せない操作の確認は「キャンセル」にフォーカスを置く。決めるボタンに置くと、開くときの Enter の続きでそのまま決まる。
  const isDangerConfirm = request.kind === "confirm" && request.danger;
  const ignoreHeldEnter = (event: KeyboardEvent<HTMLFormElement>) => {
    // 押したままの Enter（キーの繰り返し）では決めない。ダイアログを開いた Enter を押し続けると、読む前に決まってしまう。
    if (event.key === "Enter" && event.repeat) {
      event.preventDefault();
      return;
    }
    preventSubmitByImeKey(event);
  };
  return (
    <ModalDialog label={request.title ?? request.message} title={request.title} onClose={() => finish(false)}>
      {/* Enter で決められるよう、中身をフォームにする。並べ方は枠（.dialog）のまま。 */}
      <form className="dialog-form" onKeyDown={ignoreHeldEnter} onSubmit={(event) => { event.preventDefault(); finish(true); }}>
        {request.kind === "prompt" ? (
          <div className="field">
            <label htmlFor={inputId}>{request.message}</label>
            <input id={inputId} className="dialog-input" autoFocus value={value} onChange={(event) => setValue(event.target.value)} spellCheck={false} />
          </div>
        ) : <p>{request.message}</p>}
        <div className="form-actions">
          <button type="button" className="secondary-button" autoFocus={isDangerConfirm} onClick={() => finish(false)}>
            {request.kind === "confirm" ? request.cancelLabel : translate("common.cancel")}
          </button>
          <button type="submit" autoFocus={request.kind === "confirm" && !isDangerConfirm}
            className={isDangerConfirm ? "danger-button filled" : "primary-button"}>
            {request.confirmLabel}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
