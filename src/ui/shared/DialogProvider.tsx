// 確認と 1 行の入力のダイアログ。window.confirm・prompt は WebView ごとに出方が違い
// （Android の WebView では出ないことがある）、試験からも見えないので、画面の中に出す。

import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import { translate } from "../i18n/translate";
import { ModalDialog } from "./ModalDialog";
import { preventSubmitByImeKey } from "./imeKeyEvent";

type ConfirmRequest = { kind: "confirm"; message: string; confirmLabel: string; cancelLabel: string; danger: boolean; resolve: (accepted: boolean) => void };
type PromptRequest = { kind: "prompt"; message: string; initialValue: string; resolve: (value: string | null) => void };
type DialogRequest = ConfirmRequest | PromptRequest;

export type Dialogs = {
  // cancelLabel を渡すと、2 つの選択肢から選ぶ問いにできる（既定は「キャンセル」）。
  confirm: (input: { message: string; confirmLabel: string; cancelLabel?: string; danger?: boolean }) => Promise<boolean>;
  prompt: (input: { message: string; initialValue?: string }) => Promise<string | null>;
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
    ({ message, confirmLabel, cancelLabel = translate("common.cancel"), danger = false }) =>
      new Promise((resolve) => setRequest({ kind: "confirm", message, confirmLabel, cancelLabel, danger, resolve })),
    [],
  );
  const prompt = useCallback<Dialogs["prompt"]>(
    ({ message, initialValue = "" }) => new Promise((resolve) => setRequest({ kind: "prompt", message, initialValue, resolve })),
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
  const finish = (accepted: boolean) => {
    if (request.kind === "confirm") {
      request.resolve(accepted);
    } else {
      request.resolve(accepted ? value : null);
    }
    onDone();
  };
  return (
    <ModalDialog label={request.message} onClose={() => finish(false)}>
      {/* Enter で決められるよう、中身をフォームにする。並べ方は枠（.dialog）のまま。 */}
      <form className="dialog-form" onKeyDown={preventSubmitByImeKey} onSubmit={(event) => { event.preventDefault(); finish(true); }}>
        <p>{request.message}</p>
        {request.kind === "prompt" && (
          <input className="dialog-input" autoFocus value={value} onChange={(event) => setValue(event.target.value)} spellCheck={false} />
        )}
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={() => finish(false)}>
            {request.kind === "confirm" ? request.cancelLabel : translate("common.cancel")}
          </button>
          <button type="submit" autoFocus={request.kind === "confirm"}
            className={request.kind === "confirm" && request.danger ? "danger-button filled" : "primary-button"}>
            {request.kind === "confirm" ? request.confirmLabel : translate("common.save")}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
