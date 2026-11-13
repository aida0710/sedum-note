// メモの「…」の「書き出す」で開くダイアログ。ファイルの形式（Markdown・HTML・テキスト）を選んで書き出す。
// 書き出したファイルは暗号化されないことも、ここに書いて確かめてもらう（形式を選んだあとに、確認のダイアログを重ねないため）。

import { useState } from "react";
import { type MessageKey, translate } from "../i18n/translate";
import type { NoteFileFormat } from "../markdown/noteFileExport";
import { ModalDialog } from "../shared/ModalDialog";

const FORMAT_CHOICES: Array<{ format: NoteFileFormat; label: MessageKey; hint: MessageKey }> = [
  { format: "markdown", label: "noteExport.format.markdown", hint: "noteExport.formatHint.markdown" },
  { format: "html", label: "noteExport.format.html", hint: "noteExport.formatHint.html" },
  { format: "text", label: "noteExport.format.text", hint: "noteExport.formatHint.text" },
];

type NoteExportDialogProps = {
  onExport: (format: NoteFileFormat) => void;
  onClose: () => void;
};

export function NoteExportDialog({ onExport, onClose }: NoteExportDialogProps) {
  const [format, setFormat] = useState<NoteFileFormat>("markdown");
  const title = translate("noteExport.title");
  const chosen = FORMAT_CHOICES.find((choice) => choice.format === format)!;
  return (
    <ModalDialog label={title} title={title} onClose={onClose}>
      <form className="dialog-form" onSubmit={(event) => { event.preventDefault(); onExport(format); }}>
        <div className="field">
          <span className="field-label" id="note-export-format">{translate("noteExport.format")}</span>
          <div className="segmented" role="radiogroup" aria-labelledby="note-export-format">
            {FORMAT_CHOICES.map((choice) => (
              <button key={choice.format} type="button" role="radio" aria-checked={choice.format === format}
                className={choice.format === format ? "on" : ""} onClick={() => setFormat(choice.format)}>
                {translate(choice.label)}
              </button>
            ))}
          </div>
          <span className="hint">{translate(chosen.hint)}</span>
        </div>
        <p>{translate("markdown.exportConfirm")}</p>
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={onClose}>{translate("common.cancel")}</button>
          {/* 開いてすぐ Enter で書き出せるよう、書き出すボタンにフォーカスを置く（ほかの確認のダイアログと同じ）。 */}
          <button type="submit" className="primary-button" autoFocus>{translate("markdown.exportConfirmLabel")}</button>
        </div>
      </form>
    </ModalDialog>
  );
}
