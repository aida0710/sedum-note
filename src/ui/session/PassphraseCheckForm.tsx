// パスフレーズを入れて確かめるフォーム。ロックしたメモを開くときと、ロックを外すような操作の前に出す。

import { useId, useState } from "react";
import { translate } from "../i18n/translate";
import { preventSubmitByImeKey } from "../shared/imeKeyEvent";
import { useAsyncAction } from "../shared/useAsyncAction";

type PassphraseCheckFormProps = {
  // 入れた文字を確かめる。違えば失敗する（VaultSession の verifyPassphrase）。
  verifyPassphrase: (passphrase: string) => Promise<void>;
  submitLabel: string;
  onVerified: () => void;
  onCancel?: () => void;
};

export function PassphraseCheckForm({ verifyPassphrase, submitLabel, onVerified, onCancel }: PassphraseCheckFormProps) {
  const [passphrase, setPassphrase] = useState("");
  const check = useAsyncAction(verifyPassphrase);
  // ロックしたメモの画面の上に、確認のダイアログが重なることがある。欄の ID を、フォームごとに別にする。
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
        <button type="submit" className="primary-button" disabled={check.busy}>{submitLabel}</button>
      </div>
    </form>
  );
}
