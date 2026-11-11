// 新しい暗号化キーを、自動で生成するか、自分で入力するかを選ぶ欄。同期先を新しく作るときと、
// 暗号化キーを作り直すときに使う。

import { MIN_SYNC_KEY_LENGTH } from "../../core/vault/vaultDocument";
import { translate } from "../i18n/translate";

// 新しい暗号化キーの決め方。
export type NewSyncKeySource = "generate" | "enter";

export type NewSyncKey = { source: NewSyncKeySource; entered: string };

export const GENERATED_SYNC_KEY: NewSyncKey = { source: "generate", entered: "" };

type NewSyncKeyChoiceProps = {
  // 入力欄の id（1 つの画面に 2 つ並ぶことがあるので、呼び出し側が決める）。
  inputId: string;
  value: NewSyncKey;
  onChange: (value: NewSyncKey) => void;
};

export function NewSyncKeyChoice({ inputId, value, onChange }: NewSyncKeyChoiceProps) {
  const choose = (source: NewSyncKeySource) => () => onChange({ ...value, source });
  return (
    <div className="field">
      <span className="field-label" id={`${inputId}-source`}>{translate("syncKey.source")}</span>
      <div className="segmented" role="radiogroup" aria-labelledby={`${inputId}-source`}>
        <button type="button" role="radio" aria-checked={value.source === "generate"} className={value.source === "generate" ? "on" : ""} onClick={choose("generate")}>
          {translate("syncKey.source.generate")}
        </button>
        <button type="button" role="radio" aria-checked={value.source === "enter"} className={value.source === "enter" ? "on" : ""} onClick={choose("enter")}>
          {translate("syncKey.source.enter")}
        </button>
      </div>
      {value.source === "generate" ? <span className="hint">{translate("syncKey.source.generateHint")}</span> : (
        <>
          <label htmlFor={inputId}>{translate("syncTarget.syncKey")}</label>
          {/* 自分で決めたキーは、ほかのデバイスでも同じものを打つ。打ち間違いに気づけるよう、伏せ字にしない。 */}
          <input id={inputId} type="text" value={value.entered} onChange={(event) => onChange({ ...value, entered: event.target.value })}
            autoComplete="off" autoCapitalize="off" spellCheck={false} />
          <span className="hint">{translate("syncKey.source.enterHint", { minimum: MIN_SYNC_KEY_LENGTH })}</span>
        </>
      )}
    </div>
  );
}

// 入力が足りなければ、その文を返す。足りていれば null。
export function findNewSyncKeyProblem(value: NewSyncKey): string | null {
  return value.source === "enter" && [...value.entered].length < MIN_SYNC_KEY_LENGTH
    ? translate("error.weakSyncKey", { minimum: MIN_SYNC_KEY_LENGTH })
    : null;
}

// core に渡す形（生成に任せるなら null）。
export function chosenSyncKey(value: NewSyncKey): string | null {
  return value.source === "enter" ? value.entered : null;
}
