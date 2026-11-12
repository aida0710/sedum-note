// ノートブックのプロパティ（このノートブックのメモに付けられる項目）を決めるダイアログ。変えるとすぐ保存する。

import { Plus, Trash2 } from "lucide-react";
import { PROPERTY_TYPES, type PropertyDefinition, type PropertyType } from "../../core/notes/noteProperties";
import type { LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { ModalDialog } from "../shared/ModalDialog";

type NotebookPropertiesDialogProps = { notebook: LiveNotebook; repository: NoteRepository; onClose: () => void };

// 選択肢は、1 つの欄に「、」か「,」で区切って書く。
const OPTION_SEPARATOR = /[、,]/;

export function NotebookPropertiesDialog({ notebook, repository, onClose }: NotebookPropertiesDialogProps) {
  const { properties } = notebook.content;
  const save = (definition: PropertyDefinition, changes: Partial<PropertyDefinition>) =>
    void repository.saveNotebookProperty(notebook.id, { ...definition, ...changes });
  const add = () => void repository.saveNotebookProperty(notebook.id, {
    name: translate("property.newName"), type: "text", options: [], order: Math.max(0, ...properties.map((property) => property.order)) + 1,
  });
  return (
    <ModalDialog label={translate("property.dialogTitle")} className="notebook-properties" onClose={onClose}>
      <p>{translate("property.dialogDescription", { name: notebook.content.name })}</p>
      <div className="property-definitions">
        {properties.length === 0 && <div className="tree-empty">{translate("property.none")}</div>}
        {properties.map((property) => (
          <div key={property.id} className="property-definition">
            <input value={property.name} aria-label={translate("property.name")} onChange={(event) => save(property, { name: event.target.value })} />
            <select value={property.type} aria-label={translate("property.type")} onChange={(event) => save(property, { type: event.target.value as PropertyType })}>
              {PROPERTY_TYPES.map((type) => <option key={type} value={type}>{translate(`property.type.${type}`)}</option>)}
            </select>
            {property.type === "select" && (
              <input defaultValue={property.options.join("、")} placeholder={translate("property.optionsPlaceholder")} aria-label={translate("property.options")}
                onBlur={(event) => save(property, { options: event.target.value.split(OPTION_SEPARATOR).map((option) => option.trim()).filter((option) => option !== "") })} />
            )}
            <button type="button" className="icon-button" aria-label={translate("property.remove", { name: property.name })}
              onClick={() => void repository.removeNotebookProperty(notebook.id, property.id)}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={add}><Plus size={14} />{translate("property.add")}</button>
        <button type="button" className="primary-button" onClick={onClose}>{translate("common.close")}</button>
      </div>
    </ModalDialog>
  );
}
