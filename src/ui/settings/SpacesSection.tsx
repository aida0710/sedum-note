// 設定: スペース（メモの保管先を分けて、切り替えて使う）の一覧。足す・切り替える・名前を変える・消す。

import { translate } from "../i18n/translate";
import { useConfirmPassphrase } from "../session/PassphraseConfirmProvider";
import { spaceDisplayName } from "../session/spaceDisplayName";
import { addSpace, removeSpaceFromRegistry, renameSpace, selectSpace, type Space, useSpaceRegistry } from "../session/spaceRegistry";
import { destroySpaceData } from "../session/spaceVaults";
import { useDialogs } from "../shared/DialogProvider";
import { useAsyncAction } from "../shared/useAsyncAction";

export function SpacesSection() {
  const { spaces, activeSpaceId } = useSpaceRegistry();
  const dialogs = useDialogs();
  const confirmPassphrase = useConfirmPassphrase();
  const add = async () => {
    const name = (await dialogs.prompt({ message: translate("space.namePrompt"), confirmLabel: translate("common.add") }))?.trim();
    if (name) {
      // 足したスペースに切り替わり、そのスペースの最初の設定（パスフレーズの確認と、同期するか）の画面になる。
      addSpace(name);
    }
  };
  const rename = async (space: Space) => {
    const name = (await dialogs.prompt({ message: translate("space.namePrompt"), confirmLabel: translate("notebook.rename"), initialValue: space.name }))?.trim();
    if (name) {
      renameSpace(space.id, name);
    }
  };
  // 消すのは、このデバイスにある分だけ（同期先は残る）。送っていないメモは失われるので、パスフレーズを確かめてから消す。
  const remove = useAsyncAction(async (space: Space) => {
    const name = spaceDisplayName(space);
    if (!(await confirmPassphrase({ message: translate("space.removeConfirm", { name }), submitLabel: translate("common.delete"), danger: true }))) {
      return;
    }
    await destroySpaceData(space.id);
    removeSpaceFromRegistry(space.id);
  });
  return (
    <section className="settings-section">
      <h2>{translate("settings.spaces")}</h2>
      <p>{translate("space.description")}</p>
      {remove.errorMessage && <div className="form-error" role="alert">{remove.errorMessage}</div>}
      <ul className="space-list">
        {spaces.map((space) => (
          <li key={space.id} aria-current={space.id === activeSpaceId ? "true" : undefined}>
            <span className="space-name">{spaceDisplayName(space)}{space.id === activeSpaceId && <span className="hint">{translate("space.current")}</span>}</span>
            {space.id !== activeSpaceId && (
              <button type="button" className="secondary-button" onClick={() => selectSpace(space.id)}>{translate("space.switch")}</button>
            )}
            <button type="button" className="secondary-button" onClick={() => void rename(space)}>{translate("notebook.rename")}</button>
            {/* 開いているスペースは消せない（先にほかのスペースへ切り替える）。 */}
            {space.id !== activeSpaceId && (
              <button type="button" className="danger-button" disabled={remove.busy} onClick={() => void remove.run(space)}>{translate("common.delete")}</button>
            )}
          </li>
        ))}
      </ul>
      <div className="form-actions"><button type="button" className="secondary-button" onClick={() => void add()}>{translate("space.add")}</button></div>
    </section>
  );
}
