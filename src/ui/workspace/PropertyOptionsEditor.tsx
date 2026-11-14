// 選択肢のプロパティの、選べる値を並べて直す欄。値は 1 つずつのチップにし、欄に打って Enter で足し、「×」で消し、
// 名前を押して打ち直して Enter で名前を変える（Esc か欄を離れると、変えずにやめる）。
// 足す欄に打った文字は、ダイアログの打ちかけとして持つ（「保存」でも足せ、保存せずに閉じるときは聞く）。
// 区切りの文字で 1 つの欄に並べる形にしないのは、並べ替えや 1 つずつの名前の変更ができず、英語の画面でも「、」でつながるため。

import { X } from "lucide-react";
import { useState } from "react";
import { translate } from "../i18n/translate";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { ICON_SIZE } from "../shared/iconSizes";

type PropertyOptionsEditorProps = {
  propertyName: string;
  options: string[];
  // 足す欄に打っている文字。
  newOptionText: string;
  onNewOptionTextChange: (text: string) => void;
  // 足す欄で Enter を押したとき。
  onAdd: () => void;
  onRemove: (option: string) => void;
  onRename: (option: string, newName: string) => void;
};

export function PropertyOptionsEditor({ propertyName, options, newOptionText, onNewOptionTextChange, onAdd, onRemove, onRename }: PropertyOptionsEditorProps) {
  // 名前を打ち直している選択肢と、打っている名前。
  const [renaming, setRenaming] = useState<{ option: string; name: string } | null>(null);
  const finishRenaming = () => {
    const name = renaming?.name.trim() ?? "";
    // 空の名前と、ほかの選択肢と同じ名前には変えない（同じ値の列が 2 つできる）。
    if (renaming && name !== "" && name !== renaming.option && !options.includes(name)) {
      onRename(renaming.option, name);
    }
    setRenaming(null);
  };
  return (
    <div className="property-options" role="group" aria-label={translate("property.optionsOf", { name: propertyName })}>
      {options.map((option) => (renaming?.option === option ? (
        <input key={option} className="property-option-rename" autoFocus value={renaming.name} aria-label={translate("property.renameOption", { option })}
          onChange={(event) => setRenaming({ option, name: event.target.value })}
          onBlur={() => setRenaming(null)}
          onKeyDown={(event) => {
            if (isImeKeyEvent(event.nativeEvent)) {
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              finishRenaming();
            } else if (event.key === "Escape") {
              // ダイアログまで閉じないよう、ここで止める。
              event.stopPropagation();
              setRenaming(null);
            }
          }} />
      ) : (
        <span key={option} className="chip property-option">
          <button type="button" className="property-option-name" title={translate("property.renameOption", { option })} onClick={() => setRenaming({ option, name: option })}>{option}</button>
          <button type="button" className="property-option-remove" aria-label={translate("property.removeOption", { option })} onClick={() => onRemove(option)}>
            <X size={ICON_SIZE.chip} />
          </button>
        </span>
      )))}
      <input className="property-option-new" value={newOptionText} placeholder={translate("property.addOption")} aria-label={translate("property.addOption")}
        onChange={(event) => onNewOptionTextChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !isImeKeyEvent(event.nativeEvent)) {
            // 既定の動作を止めて、この Enter をダイアログのボタンへ送らせない。
            event.preventDefault();
            onAdd();
          }
        }} />
    </div>
  );
}
