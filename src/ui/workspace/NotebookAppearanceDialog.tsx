// ノートブックの色とアイコンを選ぶダイアログ。選ぶとすぐ変わる。

import type { LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { ModalDialog } from "../shared/ModalDialog";
import { NOTEBOOK_COLOR_CHOICES, NOTEBOOK_ICON_CHOICES } from "../shared/notebookAppearance";

const ICON_CHOICE_SIZE = 16;

type NotebookAppearanceDialogProps = { notebook: LiveNotebook; repository: NoteRepository; onClose: () => void };

export function NotebookAppearanceDialog({ notebook, repository, onClose }: NotebookAppearanceDialogProps) {
  const { colorName, iconName } = notebook.content;
  const change = (changes: { colorName?: string | null; iconName?: string | null }) => void repository.updateNotebook(notebook.id, changes);
  return (
    <ModalDialog label={translate("notebook.appearance")} onClose={onClose}>
        <p>{translate("notebook.appearanceOf", { name: notebook.content.name })}</p>
        <div className="choice-grid" role="radiogroup" aria-label={translate("notebook.color")}>
          <button type="button" role="radio" aria-checked={colorName === null} className={`choice${colorName === null ? " on" : ""}`} onClick={() => change({ colorName: null })}>
            {translate("notebook.automaticColor")}
          </button>
          {Object.entries(NOTEBOOK_COLOR_CHOICES).map(([name, color]) => (
            <button key={name} type="button" role="radio" aria-checked={colorName === name} aria-label={translate(`notebook.color.${name as keyof typeof NOTEBOOK_COLOR_CHOICES}`)}
              className={`choice swatch${colorName === name ? " on" : ""}`} style={{ background: color }} onClick={() => change({ colorName: name })} />
          ))}
        </div>
        <div className="choice-grid" role="radiogroup" aria-label={translate("notebook.icon")}>
          <button type="button" role="radio" aria-checked={iconName === null} className={`choice${iconName === null ? " on" : ""}`} onClick={() => change({ iconName: null })}>
            {translate("notebook.noIcon")}
          </button>
          {Object.entries(NOTEBOOK_ICON_CHOICES).map(([name, Icon]) => (
            <button key={name} type="button" role="radio" aria-checked={iconName === name} aria-label={name}
              className={`choice${iconName === name ? " on" : ""}`} onClick={() => change({ iconName: name })}>
              <Icon size={ICON_CHOICE_SIZE} />
            </button>
          ))}
        </div>
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={onClose}>{translate("common.close")}</button>
        </div>
    </ModalDialog>
  );
}
