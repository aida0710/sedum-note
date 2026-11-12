// ロックしたメモを開いたときに、本文の代わりに出す画面。パスフレーズを確かめるまで、題だけを出す。

import { ArrowLeft, LockKeyhole } from "lucide-react";
import { translate } from "../i18n/translate";
import { PassphraseCheckForm } from "../session/PassphraseCheckForm";

type LockedNoteGateProps = {
  title: string;
  verifyPassphrase: (passphrase: string) => Promise<void>;
  onRevealed: () => void;
  // スマホの画面で、一覧へ戻る。PC では渡さない（タブで移る）。
  onBack?: () => void;
};

export function LockedNoteGate({ title, verifyPassphrase, onRevealed, onBack }: LockedNoteGateProps) {
  return (
    <section className="locked-note" aria-label={translate("lock.noteLockedTitle")}>
      {onBack && <button type="button" className="icon-button locked-note-back" aria-label={translate("editor.back")} onClick={onBack}><ArrowLeft size={18} /></button>}
      <div className="locked-note-card">
        <h2><LockKeyhole size={18} />{title || translate("sidebar.untitled")}</h2>
        <p className="description">{translate("lock.noteLockedDescription")}</p>
        <PassphraseCheckForm verifyPassphrase={verifyPassphrase} submitLabel={translate("lock.open")} onVerified={onRevealed} />
      </div>
    </section>
  );
}
