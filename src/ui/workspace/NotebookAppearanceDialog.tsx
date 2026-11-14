// ノートブックの色とアイコンを選ぶダイアログ。選ぶとすぐ変わる。

import { Check } from "lucide-react";
import type { LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { ICON_SIZE } from "../shared/iconSizes";
import { ModalDialog } from "../shared/ModalDialog";
import { NOTEBOOK_COLOR_CHOICES, NOTEBOOK_ICON_CHOICES } from "../shared/notebookAppearance";
import { RadioGroup } from "../shared/RadioGroup";
import { readableTextColorOn } from "../theme/colorContrast";

type NotebookAppearanceDialogProps = { notebook: LiveNotebook; repository: NoteRepository; onClose: () => void };

export function NotebookAppearanceDialog({ notebook, repository, onClose }: NotebookAppearanceDialogProps) {
  const { colorName, iconName } = notebook.content;
  const change = (changes: { colorName?: string | null; iconName?: string | null }) => void repository.updateNotebook(notebook.id, changes);
  return (
    <ModalDialog label={translate("notebook.appearance")} title={translate("notebook.appearanceOf", { name: notebook.content.name })} onClose={onClose}>
        <RadioGroup className="choice-grid" label={translate("notebook.color")}>
          <button type="button" role="radio" aria-checked={colorName === null} className={`choice${colorName === null ? " on" : ""}`} onClick={() => change({ colorName: null })}>
            {translate("notebook.automaticColor")}
          </button>
          {Object.entries(NOTEBOOK_COLOR_CHOICES).map(([name, color]) => (
            <button key={name} type="button" role="radio" aria-checked={colorName === name} aria-label={translate(`notebook.color.${name as keyof typeof NOTEBOOK_COLOR_CHOICES}`)}
              className={`choice swatch${colorName === name ? " on" : ""}`} style={{ background: color, color: readableTextColorOn(color) }} onClick={() => change({ colorName: name })}>
              {colorName === name && <Check size={ICON_SIZE.row} />}
            </button>
          ))}
        </RadioGroup>
        <RadioGroup className="choice-grid" label={translate("notebook.icon")}>
          <button type="button" role="radio" aria-checked={iconName === null} className={`choice${iconName === null ? " on" : ""}`} onClick={() => change({ iconName: null })}>
            {translate("notebook.noIcon")}
          </button>
          {Object.entries(NOTEBOOK_ICON_CHOICES).map(([name, Icon]) => (
            <button key={name} type="button" role="radio" aria-checked={iconName === name} aria-label={name}
              className={`choice${iconName === name ? " on" : ""}`} onClick={() => change({ iconName: name })}>
              <Icon size={ICON_SIZE.button} />
            </button>
          ))}
        </RadioGroup>
        <div className="form-actions">
          <button type="button" className="primary-button" onClick={onClose}>{translate("common.close")}</button>
        </div>
    </ModalDialog>
  );
}
