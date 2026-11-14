// ノートブックのプロパティ（このノートブックのメモに付けられる項目）を決めるダイアログ。
// 種類の選択・選択肢を消す（「元に戻す」つき）・選択肢の名前の変更はその場で保存し、名前と足す選択肢（文字を打つ欄）は
// Enter か「保存」で保存する。「プロパティを追加」で足した行も打ちかけで、Enter か「保存」で決めたときに初めて記録へ書く。
// 削除は、メモに入れた値も見えなくなるので、確かめてから行う。

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { newRandomId } from "../../core/crypto/randomId";
import { PROPERTY_TYPES, type PropertyDefinition, type PropertyType } from "../../core/notes/noteProperties";
import type { LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { useDialogs } from "../shared/DialogProvider";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { ModalDialog } from "../shared/ModalDialog";
import { useToast } from "../shared/ToastProvider";
import { PropertyOptionsEditor } from "./PropertyOptionsEditor";
import { ICON_SIZE } from "../shared/iconSizes";

type NotebookPropertiesDialogProps = {
  notebook: LiveNotebook;
  repository: NoteRepository;
  // 開いたときに「プロパティを追加」へフォーカスを置く（データベース表示の表の「＋」から開いたとき）。
  autoFocusAddButton?: boolean;
  onClose: () => void;
};

// 保存したプロパティの、打ったがまだ保存していない文字（名前と、足す選択肢）。プロパティの ID ごとに持つ。
type TextDraft = { name?: string; newOptionText?: string };

// 「プロパティを追加」で足した、まだ記録に書いていないプロパティ。ID は足したときに決め、書くときにその ID で書く
//（書いたあとの行が同じ ID の行として残り、打っていた欄のフォーカスが外れない）。
type NewPropertyDraft = { id: string; name: string; type: PropertyType; options: string[]; newOptionText: string };

// 足す選択肢の欄に打った文字を、選択肢の並びの末尾に足す。空の文字と、もうある選択肢は足さない。
function withNewOption(options: string[], newOptionText: string | undefined): string[] {
  const option = newOptionText?.trim() ?? "";
  return option === "" || options.includes(option) ? options : [...options, option];
}

function hasText(draft: TextDraft | undefined): boolean {
  return draft !== undefined && (draft.name !== undefined || (draft.newOptionText ?? "").trim() !== "");
}

// 足したプロパティの名前の欄へフォーカスを移し、仮の名前を選んでおく。そのまま打つと名前が入れ替わるように。
function focusAndSelectName(input: HTMLInputElement | null) {
  input?.focus();
  input?.select();
}

export function NotebookPropertiesDialog({ notebook, repository, autoFocusAddButton = false, onClose }: NotebookPropertiesDialogProps) {
  const { properties } = notebook.content;
  const dialogs = useDialogs();
  const showToast = useToast();
  const [drafts, setDrafts] = useState<Record<string, TextDraft>>({});
  const [addedProperty, setAddedProperty] = useState<NewPropertyDraft | null>(null);
  // 足した行は、書いたものが一覧に届くまで（届いたら、その行に入れ替わる）、まだ書いていない行として出す。
  const isAddedPropertySaved = addedProperty !== null && properties.some((property) => property.id === addedProperty.id);
  const newProperty = isAddedPropertySaved ? null : addedProperty;
  // 届いたら、足した行は捨てる（残すと、あとでそのプロパティを消したときに、まだ書いていない行としてまた出る）。
  useEffect(() => {
    if (isAddedPropertySaved) {
      setAddedProperty(null);
    }
  }, [isAddedPropertySaved]);
  // 消したプロパティ（ほかのデバイスで消された分も）の、打ちかけの文字は数えない。
  const hasDrafts = newProperty !== null || properties.some((property) => hasText(drafts[property.id]));
  const save = (definition: PropertyDefinition, changes: Partial<PropertyDefinition>) =>
    repository.saveNotebookProperty(notebook.id, { ...definition, ...changes });
  const changeDraft = (propertyId: string, changes: TextDraft) => setDrafts((current) => ({ ...current, [propertyId]: { ...current[propertyId], ...changes } }));
  const changeNewProperty = (changes: Partial<NewPropertyDraft>) => setAddedProperty((current) => current && { ...current, ...changes });
  const createNewProperty = async (draft: NewPropertyDraft) => {
    await repository.saveNotebookProperty(notebook.id, {
      id: draft.id, name: draft.name.trim() || translate("property.newName"), type: draft.type, options: withNewOption(draft.options, draft.newOptionText),
      order: Math.max(0, ...properties.map((property) => property.order)) + 1,
    });
  };
  // 打った名前と選択肢を保存する。target を渡せば、そのプロパティの分だけ（その欄で Enter を押したとき）。
  const saveDrafts = (target?: string) => {
    if (newProperty && (target === undefined || target === newProperty.id)) {
      void createNewProperty(newProperty);
    }
    const remaining = { ...drafts };
    for (const property of properties) {
      const draft = drafts[property.id];
      if (!draft || (target !== undefined && property.id !== target)) {
        continue;
      }
      void save(property, { ...(draft.name === undefined ? {} : { name: draft.name }), options: withNewOption(property.options, draft.newOptionText) });
      delete remaining[property.id];
    }
    setDrafts(remaining);
  };
  const saveDraftsOnEnter = (target: string) => (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !isImeKeyEvent(event.nativeEvent)) {
      // 既定の動作を止めて、この Enter の続きを、保存のあとにフォーカスが移った先のボタンへ送らせない。
      event.preventDefault();
      saveDrafts(target);
    }
  };
  // 足した行の名前の欄。出したときに名前を選び、まだ決めていない行があるうちに「プロパティを追加」を押したら、その欄へ戻る。
  const newPropertyNameInput = useRef<HTMLInputElement | null>(null);
  const attachNewPropertyNameInput = useCallback((input: HTMLInputElement | null) => {
    newPropertyNameInput.current = input;
    focusAndSelectName(input);
  }, []);
  // 決めていない行は、Enter か「保存」を押すまで記録に書かないので、もう 1 行は足さずに、その行へ戻る。
  const add = () => {
    if (newProperty) {
      newPropertyNameInput.current?.focus();
      return;
    }
    setAddedProperty({ id: newRandomId(), name: translate("property.newName"), type: "text", options: [], newOptionText: "" });
  };
  const remove = async (property: PropertyDefinition) => {
    const accepted = await dialogs.confirm({
      message: translate("property.removeConfirm", { name: property.name }), confirmLabel: translate("common.delete"), danger: true,
    });
    if (accepted) {
      await repository.removeNotebookProperty(notebook.id, property.id);
    }
  };
  // 選択肢を消しても、その値を入れたメモの値は残る（ボードの列に出なくなるだけ）。すぐ戻せるよう、元の位置へ戻す「元に戻す」を出す。
  const removeOption = async (property: PropertyDefinition, option: string) => {
    const index = property.options.indexOf(option);
    await save(property, { options: property.options.filter((candidate) => candidate !== option) });
    showToast({
      message: translate("property.optionRemoved", { option }),
      action: {
        label: translate("toast.undo"),
        run: () => {
          const current = repository.notebooks().find((candidate) => candidate.id === notebook.id)?.content.properties.find((candidate) => candidate.id === property.id);
          if (current && !current.options.includes(option)) {
            void save(current, { options: [...current.options.slice(0, index), option, ...current.options.slice(index)] });
          }
        },
      },
    });
  };
  // 選択肢の名前を変えたら、その値を入れたメモも新しい名前に書き換える（書き換えないと、ボードのどの列にも出なくなる）。
  const renameOption = async (property: PropertyDefinition, option: string, newName: string) => {
    await save(property, { options: property.options.map((candidate) => (candidate === option ? newName : candidate)) });
    for (const note of repository.notes()) {
      if (note.content.notebookIds.includes(notebook.id) && note.content.propertyValues[property.id] === option) {
        await repository.setNotePropertyValue(note.id, property.id, newName);
      }
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
        {properties.length === 0 && !newProperty && <div className="tree-empty">{translate("property.none")}</div>}
        {properties.map((property) => (
          <div key={property.id} className="property-definition">
            <div className="property-definition-row">
              <input value={drafts[property.id]?.name ?? property.name} aria-label={translate("property.name")}
                onChange={(event) => changeDraft(property.id, { name: event.target.value })} onKeyDown={saveDraftsOnEnter(property.id)} />
              <select value={property.type} aria-label={translate("property.type")} onChange={(event) => void save(property, { type: event.target.value as PropertyType })}>
                {PROPERTY_TYPES.map((type) => <option key={type} value={type}>{translate(`property.type.${type}`)}</option>)}
              </select>
              <button type="button" className="icon-button" aria-label={translate("property.remove", { name: property.name })}
                onClick={() => void remove(property)}><Trash2 size={ICON_SIZE.button} /></button>
            </div>
            {property.type === "select" && (
              <PropertyOptionsEditor propertyName={property.name} options={property.options} newOptionText={drafts[property.id]?.newOptionText ?? ""}
                onNewOptionTextChange={(newOptionText) => changeDraft(property.id, { newOptionText })}
                onAdd={() => saveDrafts(property.id)}
                onRemove={(option) => void removeOption(property, option)}
                onRename={(option, newName) => void renameOption(property, option, newName)} />
            )}
          </div>
        )).concat(newProperty ? [
          // 足した行。決めるまで記録に書かないので、行を消すボタンは確かめずに行を捨てる。
          <div key={newProperty.id} className="property-definition">
            <div className="property-definition-row">
              <input ref={attachNewPropertyNameInput} value={newProperty.name} aria-label={translate("property.name")}
                onChange={(event) => changeNewProperty({ name: event.target.value })} onKeyDown={saveDraftsOnEnter(newProperty.id)} />
              <select value={newProperty.type} aria-label={translate("property.type")} onChange={(event) => changeNewProperty({ type: event.target.value as PropertyType })}>
                {PROPERTY_TYPES.map((type) => <option key={type} value={type}>{translate(`property.type.${type}`)}</option>)}
              </select>
              <button type="button" className="icon-button" aria-label={translate("property.remove", { name: translate("property.newName") })}
                onClick={() => setAddedProperty(null)}><Trash2 size={ICON_SIZE.button} /></button>
            </div>
            {newProperty.type === "select" && (
              <PropertyOptionsEditor propertyName={newProperty.name} options={newProperty.options} newOptionText={newProperty.newOptionText}
                onNewOptionTextChange={(newOptionText) => changeNewProperty({ newOptionText })}
                onAdd={() => changeNewProperty({ options: withNewOption(newProperty.options, newProperty.newOptionText), newOptionText: "" })}
                onRemove={(option) => changeNewProperty({ options: newProperty.options.filter((candidate) => candidate !== option) })}
                onRename={(option, newName) => changeNewProperty({ options: newProperty.options.map((candidate) => (candidate === option ? newName : candidate)) })} />
            )}
          </div>,
        ] : [])}
      </div>
      <p className="hint">{translate("property.textSaveHint")}</p>
      <div className="form-actions">
        <button type="button" className="secondary-button" autoFocus={autoFocusAddButton} onClick={add}><Plus size={ICON_SIZE.row} />{translate("property.add")}</button>
        {/* 保存していない文字があるときは「保存」を、無いときは「閉じる」を、目立つボタンにする。 */}
        <button type="button" className={hasDrafts ? "primary-button" : "secondary-button"} disabled={!hasDrafts} onClick={() => saveDrafts()}>{translate("common.save")}</button>
        <button type="button" className={hasDrafts ? "secondary-button" : "primary-button"} onClick={() => void close()}>{translate("common.close")}</button>
      </div>
    </ModalDialog>
  );
}
