// ロックを外す・ロックしたものを消す・ロックしたメモを書き出す、のように、ロックを素通りできる操作の前に、
// パスフレーズを確かめるダイアログ。確かめられたら true、やめたら false を返す。

import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import { translate } from "../i18n/translate";
import { ModalDialog } from "../shared/ModalDialog";
import { PassphraseCheckForm } from "./PassphraseCheckForm";

type ConfirmPassphrase = (message: string) => Promise<boolean>;

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
  const [request, setRequest] = useState<{ message: string; resolve: (verified: boolean) => void } | null>(null);
  const confirmPassphrase = useCallback<ConfirmPassphrase>((message) => new Promise((resolve) => setRequest({ message, resolve })), []);
  const finish = (verified: boolean) => {
    request?.resolve(verified);
    setRequest(null);
  };
  return (
    <PassphraseConfirmContext.Provider value={confirmPassphrase}>
      {children}
      {request && (
        <ModalDialog label={request.message} description={request.message} onClose={() => finish(false)}>
          <PassphraseCheckForm verifyPassphrase={verifyPassphrase} submitLabel={translate("lock.confirm")} onVerified={() => finish(true)} onCancel={() => finish(false)} />
        </ModalDialog>
      )}
    </PassphraseConfirmContext.Provider>
  );
}
