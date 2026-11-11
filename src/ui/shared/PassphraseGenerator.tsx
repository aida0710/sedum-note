// 強いパスフレーズを作るボタンと、作ったパスフレーズの表示。作ったものは、入力欄には伏せ字で入るので、
// 書き留められるようにここに出す。

import { useState } from "react";
import { newGeneratedPassphrase } from "../../core/crypto/generatedPassphrase";
import { translate } from "../i18n/translate";

type PassphraseGeneratorProps = {
  // いま入力欄に入っているパスフレーズ。作ったものと違えば（手で直したら）、表示を消す。
  passphrase: string;
  onGenerate: (passphrase: string) => void;
};

export function PassphraseGenerator({ passphrase, onGenerate }: PassphraseGeneratorProps) {
  const [generated, setGenerated] = useState<string | null>(null);
  const shown = generated !== null && generated === passphrase;
  const generate = () => {
    const created = newGeneratedPassphrase();
    setGenerated(created);
    onGenerate(created);
  };
  return (
    <div className="passphrase-generator">
      <button type="button" className="secondary-button" onClick={generate}>{translate("passphrase.generate")}</button>
      {shown && (
        <div className="generated-passphrase" role="status">
          <code>{generated}</code>
          <button type="button" className="secondary-button" onClick={() => void navigator.clipboard.writeText(generated)}>{translate("passphrase.copy")}</button>
          <p className="hint">{translate("passphrase.generatedHint")}</p>
        </div>
      )}
    </div>
  );
}
