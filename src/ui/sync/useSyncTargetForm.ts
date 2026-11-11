// 同期先の入力と「接続を確認」の結果、そこで使う暗号化キーの入力をまとめて持つ hook。
// 最初の画面と、設定の同期の欄で使う。sshc と同じく、確かめた結果に合わせて次に入れるものが決まる
// （既存のメモがあれば暗号化キーを入れる。空なら暗号化キーを生成するか、自分で決める）。

import { useState } from "react";
import type { RemoteConfig } from "../../core/remote/remoteConfig";
import type { SyncTargetCheck } from "../../core/vault/syncTarget";
import { MIN_SYNC_KEY_LENGTH } from "../../core/vault/vaultDocument";
import type { SyncTargetChoice } from "../../core/vault/vaultSession";
import { translate } from "../i18n/translate";
import type { VaultSession } from "../session/useVaultSession";
import { EMPTY_REMOTE_CONFIG } from "../shared/RemoteConfigFields";
import { checkRemoteConfigInput } from "../shared/remoteConfigProblemMessage";
import { type AsyncAction, useAsyncAction } from "../shared/useAsyncAction";

export type SyncTargetForm = {
  remoteConfig: RemoteConfig;
  // 同期先の入力を変える。確かめた結果は、変える前の同期先のものなので捨てる。
  changeRemoteConfig: (remoteConfig: RemoteConfig) => void;
  // 「接続を確認」。フォルダを渡したら、そのフォルダに入れ替えて確かめる（見つかった候補を選んだとき）。
  check: AsyncAction<{ folder?: string }>;
  checked: SyncTargetCheck | null;
  inputProblem: string | null;
  // 入力した暗号化キー（既存のメモに参加するとき、自分で決めるとき）。
  syncKey: string;
  setSyncKey: (syncKey: string) => void;
  // 空の同期先で、暗号化キーを生成せずに自分で決めるか。
  choosesOwnSyncKey: boolean;
  setChoosesOwnSyncKey: (chooses: boolean) => void;
  // 保存に渡す同期先。まだ確かめていない、またはキーが足りなければ、その文。
  resolveChoice: () => { syncTarget: SyncTargetChoice } | { problem: string };
};

export function useSyncTargetForm(session: VaultSession, initialRemoteConfig: RemoteConfig | null): SyncTargetForm {
  const [remoteConfig, setRemoteConfig] = useState(initialRemoteConfig ?? EMPTY_REMOTE_CONFIG);
  const [checked, setChecked] = useState<SyncTargetCheck | null>(null);
  const [inputProblem, setInputProblem] = useState<string | null>(null);
  const [syncKey, setSyncKey] = useState("");
  const [choosesOwnSyncKey, setChoosesOwnSyncKey] = useState(false);
  const check = useAsyncAction(async ({ folder }: { folder?: string }) => {
    setChecked(null);
    const input = checkRemoteConfigInput(folder === undefined ? remoteConfig : { ...remoteConfig, prefix: folder });
    if ("problem" in input) {
      setInputProblem(input.problem);
      return;
    }
    setInputProblem(null);
    const result = await session.checkSyncTarget(input.config);
    // フォルダを見つけて入れ替えたときは、入力欄にも出す。
    setRemoteConfig(result.remoteConfig);
    setChecked(result);
  });
  return {
    remoteConfig,
    changeRemoteConfig: (changed) => {
      setRemoteConfig(changed);
      setChecked(null);
    },
    check,
    checked,
    inputProblem,
    syncKey,
    setSyncKey,
    choosesOwnSyncKey,
    setChoosesOwnSyncKey,
    resolveChoice: () => {
      if (checked === null) {
        return { problem: translate("syncTarget.checkFirst") };
      }
      const { inspected } = checked;
      if (inspected.state === "incomplete") {
        return { problem: translate("syncTarget.incomplete") };
      }
      if (inspected.state === "existing") {
        return syncKey === ""
          ? { problem: translate(inspected.keyWrapping === "syncKey" ? "syncTarget.syncKeyMissing" : "syncTarget.legacyPassphraseMissing") }
          : { syncTarget: { remoteConfig: checked.remoteConfig, inspected, syncKey } };
      }
      if (choosesOwnSyncKey && [...syncKey].length < MIN_SYNC_KEY_LENGTH) {
        return { problem: translate("error.weakSyncKey", { minimum: MIN_SYNC_KEY_LENGTH }) };
      }
      return { syncTarget: { remoteConfig: checked.remoteConfig, inspected, syncKey: choosesOwnSyncKey ? syncKey : null } };
    },
  };
}
