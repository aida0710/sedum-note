// ノートブックのプロパティ（このノートブックのメモに付けられる項目）を決めるダイアログ。変えるとすぐ保存する。

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { PROPERTY_TYPES, type PropertyDefinition, type PropertyType } from "../../core/notes/noteProperties";
import type { LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { ModalDialog } from "../shared/ModalDialog";

type NotebookPropertiesDialogProps = {
  notebook: LiveNotebook;
  repository: NoteRepository;
  // 開いたときに「プロパティを追加」へフォーカスを置く（データベース表示の表の「＋」から開いたとき）。
  autoFocusAddButton?: boolean;
  onClose: () => void;
};

// 選択肢は、1 つの欄に「、」か「,」で区切って書く。
const OPTION_SEPARATOR = /[、,]/;

// 足したプロパティの名前の欄へフォーカスを移し、仮の名前を選んでおく。そのまま打つと名前が入れ替わるように。
function focusAndSelectName(input: HTMLInputElement | null) {
  input?.focus();
  input?.select();
}

export function NotebookPropertiesDialog({ notebook, repository, autoFocusAddButton = false, onClose }: NotebookPropertiesDialogProps) {
  const { properties } = notebook.content;
  const [addedPropertyId, setAddedPropertyId] = useState<string | null>(null);
  const save = (definition: PropertyDefinition, changes: Partial<PropertyDefinition>) =>
    void repository.saveNotebookProperty(notebook.id, { ...definition, ...changes });
  const add = async () => {
    const added = await repository.saveNotebookProperty(notebook.id, {
      name: translate("property.newName"), type: "text", options: [], order: Math.max(0, ...properties.map((property) => property.order)) + 1,
    });
    setAddedPropertyId(added.id);
  };
  return (
    <ModalDialog label={translate("property.dialogTitle")} title={translate("property.dialogTitle")}
      description={translate("property.dialogDescription", { name: notebook.content.name })} className="notebook-properties" onClose={onClose}>
      <div className="property-definitions">
        {properties.length === 0 && <div className="tree-empty">{translate("property.none")}</div>}
        {properties.map((property) => (
          <div key={property.id} className="property-definition">
            <input ref={property.id === addedPropertyId ? focusAndSelectName : undefined} value={property.name} aria-label={translate("property.name")}
              onChange={(event) => save(property, { name: event.target.value })} />
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
        <button type="button" className="secondary-button" autoFocus={autoFocusAddButton} onClick={() => void add()}><Plus size={14} />{translate("property.add")}</button>
        <button type="button" className="primary-button" onClick={onClose}>{translate("common.close")}</button>
      </div>
    </ModalDialog>
  );
}
