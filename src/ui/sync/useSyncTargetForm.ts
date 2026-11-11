// 同期先の入力と「接続を確認」の結果、そこで使う暗号化キーの入力をまとめて持つ hook。
// 最初の画面と、設定の同期の欄で使う。sshc と同じく、確かめた結果に合わせて次に入れるものが決まる
// （既存のメモがあれば暗号化キーを入れる。空なら暗号化キーを生成するか、自分で入力する）。

import { useState } from "react";
import type { RemoteConfig } from "../../core/remote/remoteConfig";
import type { SyncTargetCheck } from "../../core/vault/syncTarget";
import type { SyncTargetChoice } from "../../core/vault/vaultSession";
import { translate } from "../i18n/translate";
import type { VaultSession } from "../session/useVaultSession";
import { EMPTY_REMOTE_CONFIG } from "../shared/RemoteConfigFields";
import { checkRemoteConfigInput } from "../shared/remoteConfigProblemMessage";
import { type AsyncAction, useAsyncAction } from "../shared/useAsyncAction";
import { chosenSyncKey, findNewSyncKeyProblem, GENERATED_SYNC_KEY, type NewSyncKey } from "./NewSyncKeyChoice";

export type SyncTargetForm = {
  remoteConfig: RemoteConfig;
  // 同期先の入力を変える。確かめた結果は、変える前の同期先のものなので捨てる。
  changeRemoteConfig: (remoteConfig: RemoteConfig) => void;
  // 「接続を確認」。フォルダを渡したら、そのフォルダに入れ替えて確かめる（見つかった候補を選んだとき）。
  check: AsyncAction<{ folder?: string }>;
  // ほかのデバイスが書き出した同期の設定を入れて、そのまま確かめる。暗号化キーは、参加にもそのまま使う。
  applySyncSetup: (setup: { remoteConfig: RemoteConfig; syncKey: string }) => Promise<void>;
  checked: SyncTargetCheck | null;
  inputProblem: string | null;
  // 既存のメモに参加するときに入れる、そのメモの暗号化キー。
  existingSyncKey: string;
  setExistingSyncKey: (syncKey: string) => void;
  // 空の同期先に作るときの、新しい暗号化キーの決め方（生成するか、自分で入力するか）。
  newSyncKey: NewSyncKey;
  setNewSyncKey: (newSyncKey: NewSyncKey) => void;
  // 保存に渡す同期先。まだ確かめていない、またはキーが足りなければ、その文。
  resolveChoice: () => { syncTarget: SyncTargetChoice } | { problem: string };
};

export function useSyncTargetForm(session: VaultSession, initialRemoteConfig: RemoteConfig | null): SyncTargetForm {
  const [remoteConfig, setRemoteConfig] = useState(initialRemoteConfig ?? EMPTY_REMOTE_CONFIG);
  const [checked, setChecked] = useState<SyncTargetCheck | null>(null);
  const [inputProblem, setInputProblem] = useState<string | null>(null);
  const [existingSyncKey, setExistingSyncKey] = useState("");
  const [newSyncKey, setNewSyncKey] = useState(GENERATED_SYNC_KEY);
  const check = useAsyncAction(async ({ folder, replacement }: { folder?: string; replacement?: RemoteConfig }) => {
    setChecked(null);
    const entered = replacement ?? remoteConfig;
    const input = checkRemoteConfigInput(folder === undefined ? entered : { ...entered, prefix: folder });
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
    applySyncSetup: async (setup) => {
      setRemoteConfig(setup.remoteConfig);
      setExistingSyncKey(setup.syncKey);
      await check.run({ replacement: setup.remoteConfig });
    },
    checked,
    inputProblem,
    existingSyncKey,
    setExistingSyncKey,
    newSyncKey,
    setNewSyncKey,
    resolveChoice: () => {
      if (checked === null) {
        return { problem: translate("syncTarget.checkFirst") };
      }
      const { inspected } = checked;
      if (inspected.state === "incomplete") {
        return { problem: translate("syncTarget.incomplete") };
      }
      if (inspected.state === "existing") {
        return existingSyncKey === ""
          ? { problem: translate("syncTarget.syncKeyMissing") }
          : { syncTarget: { remoteConfig: checked.remoteConfig, inspected, syncKey: existingSyncKey } };
      }
      const newSyncKeyProblem = findNewSyncKeyProblem(newSyncKey);
      return newSyncKeyProblem === null
        ? { syncTarget: { remoteConfig: checked.remoteConfig, inspected, syncKey: chosenSyncKey(newSyncKey) } }
        : { problem: newSyncKeyProblem };
    },
  };
}
