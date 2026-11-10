// 初めて開いたときの画面。新しく始めるか、ほかのデバイスで作ったメモに参加する。

import { LockKeyhole } from "lucide-react";
import { useState } from "react";
import { MIN_PASSPHRASE_LENGTH } from "../../core/crypto/passphraseKey";
import type { RemoteConfig } from "../../core/remote/remoteConfig";
import { translate } from "../i18n/translate";
import type { VaultSession } from "../session/useVaultSession";
import { EMPTY_REMOTE_CONFIG, RemoteConfigFields } from "../shared/RemoteConfigFields";
import { checkRemoteConfigInput } from "../shared/remoteConfigProblemMessage";
import { useAsyncAction } from "../shared/useAsyncAction";

type SetupMode = "new" | "join";

type SetupInput = { mode: SetupMode; passphrase: string; remoteConfig: RemoteConfig | null };

export function SetupScreen({ session }: { session: VaultSession }) {
  const [mode, setMode] = useState<SetupMode>("new");
  const [passphrase, setPassphrase] = useState("");
  const [passphraseConfirm, setPassphraseConfirm] = useState("");
  const [syncLater, setSyncLater] = useState(false);
  const [remoteConfig, setRemoteConfig] = useState(EMPTY_REMOTE_CONFIG);
  const [inputProblem, setInputProblem] = useState<string | null>(null);
  const action = useAsyncAction(async (input: SetupInput) => {
    if (input.mode === "join" && input.remoteConfig) {
      await session.joinVault({ passphrase: input.passphrase, remoteConfig: input.remoteConfig });
    } else {
      await session.createVault({ passphrase: input.passphrase, remoteConfig: input.remoteConfig });
    }
  });
  const usesRemote = mode === "join" || !syncLater;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setInputProblem(null);
    if (mode === "new" && passphrase !== passphraseConfirm) {
      setInputProblem(translate("setup.passphraseMismatch"));
      return;
    }
    if (!usesRemote) {
      void action.run({ mode, passphrase, remoteConfig: null });
      return;
    }
    const checked = checkRemoteConfigInput(remoteConfig);
    if ("problem" in checked) {
      setInputProblem(checked.problem);
      return;
    }
    void action.run({ mode, passphrase, remoteConfig: checked.config });
  };

  const message = inputProblem ?? action.errorMessage;
  return (
    <div className="entry">
      <form className="entry-card" onSubmit={submit}>
        <h1><LockKeyhole size={20} />{translate("setup.title")}</h1>
        <p className="description">{translate("setup.description")}</p>
        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "new"} className={mode === "new" ? "on" : ""} onClick={() => setMode("new")}>{translate("setup.mode.new")}</button>
          <button type="button" role="tab" aria-selected={mode === "join"} className={mode === "join" ? "on" : ""} onClick={() => setMode("join")}>{translate("setup.mode.join")}</button>
        </div>
        <div className="field">
          <label htmlFor="setup-passphrase">{translate("setup.passphrase")}</label>
          <input id="setup-passphrase" type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="new-password" required />
          {mode === "new" && <span className="hint">{translate("setup.passphraseHint", { minimum: MIN_PASSPHRASE_LENGTH })}</span>}
        </div>
        {mode === "new" && (
          <div className="field">
            <label htmlFor="setup-passphrase-confirm">{translate("setup.passphraseConfirm")}</label>
            <input id="setup-passphrase-confirm" type="password" value={passphraseConfirm} onChange={(event) => setPassphraseConfirm(event.target.value)} autoComplete="new-password" required />
          </div>
        )}
        {mode === "new" && (
          <label className="checkbox-line">
            <input type="checkbox" checked={syncLater} onChange={(event) => setSyncLater(event.target.checked)} />
            {translate("setup.syncLater")}
          </label>
        )}
        {usesRemote && <RemoteConfigFields value={remoteConfig} onChange={setRemoteConfig} />}
        {message && <div className="form-error" role="alert">{message}</div>}
        <div className="form-actions">
          {action.busy && <span className="hint">{translate("setup.working")}</span>}
          <button className="primary-button" type="submit" disabled={action.busy}>
            {translate(mode === "new" ? "setup.submitNew" : "setup.submitJoin")}
          </button>
        </div>
      </form>
    </div>
  );
}
