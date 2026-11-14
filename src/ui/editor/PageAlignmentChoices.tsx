// メモの「…」に出す、本文の列の置き場所（左寄せ・中央・右寄せ）の選択肢。先頭の「既定」は、表示の設定に従う。

import { AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignHorizontalJustifyStart, type LucideIcon } from "lucide-react";
import { PAGE_ALIGNMENTS, type PageAlignment } from "../../core/notes/noteRecords";
import { translate } from "../i18n/translate";
import { ICON_SIZE } from "../shared/iconSizes";

const PAGE_ALIGNMENT_ICONS: Record<PageAlignment, LucideIcon> = {
  left: AlignHorizontalJustifyStart,
  center: AlignHorizontalJustifyCenter,
  right: AlignHorizontalJustifyEnd,
};

type PageAlignmentChoicesProps = {
  // このメモで選んでいる置き場所。null は既定（表示の設定）に従う。
  selected: PageAlignment | null;
  onChoose: (alignment: PageAlignment | null) => void;
};

export function PageAlignmentChoices({ selected, onChoose }: PageAlignmentChoicesProps) {
  return (
    <>
      <div className="menu-heading">{translate("pageAlignment.title")}</div>
      <div className="choice-grid page-alignment-choices" role="group" aria-label={translate("pageAlignment.title")}>
        <button type="button" className={`choice${selected === null ? " on" : ""}`} aria-pressed={selected === null} onClick={() => onChoose(null)}>
          {translate("pageAlignment.default")}
        </button>
        {PAGE_ALIGNMENTS.map((alignment) => {
          const Icon = PAGE_ALIGNMENT_ICONS[alignment];
          return (
            <button key={alignment} type="button" className={`choice${selected === alignment ? " on" : ""}`}
              aria-label={translate(`pageAlignment.${alignment}`)} title={translate(`pageAlignment.${alignment}`)} aria-pressed={selected === alignment}
              onClick={() => onChoose(alignment)}>
              <Icon size={ICON_SIZE.button} />
            </button>
          );
        })}
      </div>
    </>
  );
}
