// ノートブックのプロパティ（このノートブックのメモに付けられる項目）を決めるダイアログ。
// 種類の選択・追加・削除はその場で保存し、名前と選択肢（文字を打つ欄）は Enter か「保存」で保存する。
// 削除は、メモに入れた値も見えなくなるので、確かめてから行う。

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { PROPERTY_TYPES, type PropertyDefinition, type PropertyType } from "../../core/notes/noteProperties";
import type { LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { useDialogs } from "../shared/DialogProvider";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
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
const OPTION_JOINER = "、";

// 名前と選択肢の、打ったがまだ保存していない文字。プロパティの ID ごとに持つ。
type TextDraft = { name?: string; optionsText?: string };

function optionsFromText(optionsText: string): string[] {
  return optionsText.split(OPTION_SEPARATOR).map((option) => option.trim()).filter((option) => option !== "");
}

// 足したプロパティの名前の欄へフォーカスを移し、仮の名前を選んでおく。そのまま打つと名前が入れ替わるように。
function focusAndSelectName(input: HTMLInputElement | null) {
  input?.focus();
  input?.select();
}

export function NotebookPropertiesDialog({ notebook, repository, autoFocusAddButton = false, onClose }: NotebookPropertiesDialogProps) {
  const { properties } = notebook.content;
  const dialogs = useDialogs();
  const [addedPropertyId, setAddedPropertyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, TextDraft>>({});
  // 消したプロパティ（ほかのデバイスで消された分も）の、打ちかけの文字は数えない。
  const hasDrafts = properties.some((property) => drafts[property.id] !== undefined);
  const save = (definition: PropertyDefinition, changes: Partial<PropertyDefinition>) =>
    void repository.saveNotebookProperty(notebook.id, { ...definition, ...changes });
  const changeDraft = (propertyId: string, changes: TextDraft) => setDrafts({ ...drafts, [propertyId]: { ...drafts[propertyId], ...changes } });
  // 打った名前と選択肢を保存する。propertyId を渡せば、そのプロパティの分だけ（その欄で Enter を押したとき）。
  const saveDrafts = (propertyId?: string) => {
    const remaining = { ...drafts };
    for (const property of properties) {
      const draft = drafts[property.id];
      if (!draft || (propertyId !== undefined && property.id !== propertyId)) {
        continue;
      }
      save(property, {
        ...(draft.name === undefined ? {} : { name: draft.name }),
        ...(draft.optionsText === undefined ? {} : { options: optionsFromText(draft.optionsText) }),
      });
      delete remaining[property.id];
    }
    setDrafts(remaining);
  };
  const saveDraftsOnEnter = (propertyId: string) => (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !isImeKeyEvent(event.nativeEvent)) {
      // 既定の動作を止めて、この Enter の続きを、保存のあとにフォーカスが移った先のボタンへ送らせない。
      event.preventDefault();
      saveDrafts(propertyId);
    }
  };
  const add = async () => {
    const added = await repository.saveNotebookProperty(notebook.id, {
      name: translate("property.newName"), type: "text", options: [], order: Math.max(0, ...properties.map((property) => property.order)) + 1,
    });
    setAddedPropertyId(added.id);
  };
  const remove = async (property: PropertyDefinition) => {
    const accepted = await dialogs.confirm({
      message: translate("property.removeConfirm", { name: property.name }), confirmLabel: translate("common.delete"), danger: true,
    });
    if (accepted) {
      await repository.removeNotebookProperty(notebook.id, property.id);
    }
  };
  // 保存していない名前や選択肢があれば、捨ててよいかを聞いてから閉じる。
  const close = async () => {
    if (!hasDrafts || await dialogs.confirm({ message: translate("property.discardConfirm"), confirmLabel: translate("property.discard"), danger: true })) {
      onClose();
    }
  };
  return (
    <ModalDialog label={translate("property.dialogTitle")} title={translate("property.dialogTitle")}
      description={translate("property.dialogDescription", { name: notebook.content.name })} className="notebook-properties" onClose={() => void close()}>
      <div className="property-definitions">
        {properties.length === 0 && <div className="tree-empty">{translate("property.none")}</div>}
        {properties.map((property) => (
          <div key={property.id} className="property-definition">
            <input ref={property.id === addedPropertyId ? focusAndSelectName : undefined} value={drafts[property.id]?.name ?? property.name} aria-label={translate("property.name")}
              onChange={(event) => changeDraft(property.id, { name: event.target.value })} onKeyDown={saveDraftsOnEnter(property.id)} />
            <select value={property.type} aria-label={translate("property.type")} onChange={(event) => save(property, { type: event.target.value as PropertyType })}>
              {PROPERTY_TYPES.map((type) => <option key={type} value={type}>{translate(`property.type.${type}`)}</option>)}
            </select>
            {property.type === "select" && (
              <input value={drafts[property.id]?.optionsText ?? property.options.join(OPTION_JOINER)} placeholder={translate("property.optionsPlaceholder")}
                aria-label={translate("property.options")}
                onChange={(event) => changeDraft(property.id, { optionsText: event.target.value })} onKeyDown={saveDraftsOnEnter(property.id)} />
            )}
            <button type="button" className="icon-button" aria-label={translate("property.remove", { name: property.name })}
              onClick={() => void remove(property)}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <p className="hint">{translate("property.textSaveHint")}</p>
      <div className="form-actions">
        <button type="button" className="secondary-button" autoFocus={autoFocusAddButton} onClick={() => void add()}><Plus size={14} />{translate("property.add")}</button>
        {/* 保存していない文字があるときは「保存」を、無いときは「閉じる」を、目立つボタンにする。 */}
        <button type="button" className={hasDrafts ? "primary-button" : "secondary-button"} disabled={!hasDrafts} onClick={() => saveDrafts()}>{translate("common.save")}</button>
        <button type="button" className={hasDrafts ? "secondary-button" : "primary-button"} onClick={() => void close()}>{translate("common.close")}</button>
      </div>
    </ModalDialog>
  );
}
