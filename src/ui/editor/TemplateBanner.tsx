// テンプレートのメモの上に出す帯。テンプレートであることと、使える変数（@date など）を知らせ、
// このテンプレートから新しいメモを作るボタンを置く。

import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { currentTemplateTimeValues } from "./templateTimeValues";

type TemplateBannerProps = {
  templateId: string;
  repository: NoteRepository;
  onOpenNote: (noteId: string) => void;
};

export function TemplateBanner({ templateId, repository, onOpenNote }: TemplateBannerProps) {
  const createNoteFromTemplate = async () => {
    const created = await repository.createNoteFromTemplate({ templateId, timeValues: currentTemplateTimeValues(), changes: { isTemplate: false } });
    onOpenNote(created.id);
  };
  return (
    <div className="trash-banner template-banner">
      <div className="template-banner-text">
        {translate("editor.isTemplate")}
        <span className="hint">{translate("editor.templateVariablesHint")}</span>
      </div>
      <span className="actions">
        <button className="secondary-button" onClick={() => void createNoteFromTemplate()}>{translate("editor.newFromTemplate")}</button>
      </span>
    </div>
  );
}
