// パスフレーズを入れて確かめるフォーム。取り返しのつかない操作の前の確認（PassphraseConfirmProvider.tsx）に出す。

import { useId, useState } from "react";
import { translate } from "../i18n/translate";
import { preventSubmitByImeKey } from "../shared/imeKeyEvent";
import { useAsyncAction } from "../shared/useAsyncAction";

type PassphraseCheckFormProps = {
  // 入れた文字を確かめる。違えば失敗する（VaultSession の verifyPassphrase）。
  verifyPassphrase: (passphrase: string) => Promise<void>;
  submitLabel: string;
  // 戻せない操作の前の確認か。決めるボタンを赤くする。
  danger?: boolean;
  onVerified: () => void;
  onCancel?: () => void;
};

export function PassphraseCheckForm({ verifyPassphrase, submitLabel, danger = false, onVerified, onCancel }: PassphraseCheckFormProps) {
  const [passphrase, setPassphrase] = useState("");
  const check = useAsyncAction(verifyPassphrase);
  const inputId = useId();
  const submit = async () => {
    if (await check.run(passphrase)) {
      onVerified();
    }
  };
  return (
    <form className="dialog-form" onKeyDown={preventSubmitByImeKey} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <div className="field">
        <label htmlFor={inputId}>{translate("setup.passphrase")}</label>
        <input id={inputId} type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="current-password" autoFocus required />
      </div>
      {check.errorMessage && <div className="form-error" role="alert">{check.errorMessage}</div>}
      <div className="form-actions">
        {check.busy && <span className="hint">{translate("lock.checking")}</span>}
        {onCancel && <button type="button" className="secondary-button" onClick={onCancel}>{translate("common.cancel")}</button>}
        <button type="submit" className={danger ? "danger-button filled" : "primary-button"} disabled={check.busy}>{submitLabel}</button>
      </div>
    </form>
  );
}
