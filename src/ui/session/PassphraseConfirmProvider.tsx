// スペースを消すような、取り返しのつかない操作の前に、パスフレーズを確かめるダイアログ。確かめられたら true、やめたら false を返す。
// 決めるボタンには、押すと何が起きるかを書く（「確認」ではなく「削除」）。

import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import { ModalDialog } from "../shared/ModalDialog";
import { PassphraseCheckForm } from "./PassphraseCheckForm";

// submitLabel は、決めるボタンの名前。danger は、戻せない操作か（決めるボタンを赤くする）。
type PassphraseConfirmation = { message: string; submitLabel: string; danger: boolean };
type ConfirmPassphrase = (confirmation: PassphraseConfirmation) => Promise<boolean>;

const PassphraseConfirmContext = createContext<ConfirmPassphrase | null>(null);

export function useConfirmPassphrase(): ConfirmPassphrase {
  const confirmPassphrase = useContext(PassphraseConfirmContext);
  if (!confirmPassphrase) {
    throw new Error("useConfirmPassphrase needs a PassphraseConfirmProvider");
  }
  return confirmPassphrase;
}

type PassphraseConfirmProviderProps = { verifyPassphrase: (passphrase: string) => Promise<void>; children: ReactNode };

export function PassphraseConfirmProvider({ verifyPassphrase, children }: PassphraseConfirmProviderProps) {
  const [request, setRequest] = useState<PassphraseConfirmation & { resolve: (verified: boolean) => void } | null>(null);
  const confirmPassphrase = useCallback<ConfirmPassphrase>((confirmation) => new Promise((resolve) => setRequest({ ...confirmation, resolve })), []);
  const finish = (verified: boolean) => {
    request?.resolve(verified);
    setRequest(null);
  };
  return (
    <PassphraseConfirmContext.Provider value={confirmPassphrase}>
      {children}
      {request && (
        <ModalDialog label={request.message} description={request.message} onClose={() => finish(false)}>
          <PassphraseCheckForm verifyPassphrase={verifyPassphrase} submitLabel={request.submitLabel} danger={request.danger} onVerified={() => finish(true)} onCancel={() => finish(false)} />
        </ModalDialog>
      )}
    </PassphraseConfirmContext.Provider>
  );
}
