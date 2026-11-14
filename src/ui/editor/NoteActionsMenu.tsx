// メモの「…」メニュー。項目を意味のまとまりに分け、まとまりの間に区切り線を引く。
//   整理: ピン留め、ノートブックを選ぶダイアログ、メモの期限、カーソルのある項目の期限
//   複製・結合: テンプレートにする、複製、結合
//   表示: メモの中の検索、箇条書き・見出しへのズーム、すべて折りたたむ・開く、本文の配置（PC だけ）
//   開き方: 画面分割、別のウィンドウで開く、最前面に固定
//   AI・履歴: AI チャット、履歴
//   プラグイン: 有効なプラグインのコマンド
//   書き出し・印刷: 書き出し（形式はダイアログで選ぶ）、印刷
//   ゴミ箱
// ショートカットのある項目は、キーを右に出す。

import { AlarmClock, AppWindow, ArrowUpToLine, Check, ChevronsDownUp, ChevronsUpDown, Columns2, Copy, FileDown, FolderInput, History, LayoutTemplate, type LucideIcon, Merge, Pin, PinOff, Printer, Puzzle, Search, Sparkles, Trash2, ZoomIn } from "lucide-react";
import type { ReactNode } from "react";
import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import type { ZoomTarget } from "./zoom";
import type { NoteMenuShortcutKeys } from "./noteMenuShortcutKeys";
import { isPrintAvailable } from "../platform/printPage";
import { canKeepWindowOnTop } from "../platform/noteWindows";
import { PopupMenu } from "../shared/PopupMenu";
import { useWindowOnTop } from "../shared/useWindowOnTop";
import { useTrashWithUndo } from "../workspace/useTrashWithUndo";
import { PageAlignmentChoices } from "./PageAlignmentChoices";
import { ICON_SIZE } from "../shared/iconSizes";

type NoteActionsMenuProps = {
  anchor: HTMLElement;
  note: LiveNote;
  repository: NoteRepository;
  // 入れるノートブックを選ぶダイアログを開く。ノートブックが 1 つも無ければ undefined。
  onChooseNotebooks: (() => void) | undefined;
  onFind: () => void;
  onPrint: () => void;
  onDuplicate: () => Promise<unknown>;
  onMergeNote: () => void;
  onOpenAiAssistant: () => void;
  // カーソルのある箇条書きの項目か見出しのセクションにズームする。どちらの中にも無ければ zoomTarget は null。
  zoomTarget: ZoomTarget | null;
  onZoomIn: () => void;
  // 箇条書きと見出しを、全部たたむ・全部開く。
  onFoldAll: () => void;
  onUnfoldAll: () => void;
  // メモの期限を選ぶ画面を開く。
  onSetNoteDue: () => void;
  // カーソルのあるチェックリストの項目の期限を選ぶ画面を開く。カーソルが項目の中に無ければ undefined。
  onSetTaskDue: (() => void) | undefined;
  // 有効なプラグインのコマンド。押すと、このメモに対して実行する。
  pluginCommands: Array<{ key: string; title: string; run: () => void }>;
  // メモを、画面分割の右側に開く。分割できない画面（スマホ、分割の右側のメモ）では undefined。
  onOpenInSplit: (() => void) | undefined;
  // メモを別のウィンドウで開く。開けない画面（スマホ）では undefined。
  onOpenInNewWindow: (() => void) | undefined;
  onShowHistory: () => void;
  // 形式を選んで書き出すダイアログを開く。
  onExport: () => void;
  // 本文の列の置き場所を選べるか。スマホの幅では列が画面いっぱいなので出さない。
  canChoosePageAlignment: boolean;
  // 項目の右に出すショートカットのキー。
  shortcutKeys: NoteMenuShortcutKeys;
  onClose: () => void;
};

type MenuActionProps = {
  icon: LucideIcon;
  label: string;
  // 項目の右に出すショートカットのキー（例: Ctrl + F）。
  shortcutKeys?: string | null;
  danger?: boolean;
  onSelect: () => void;
};

function MenuAction({ icon: Icon, label, shortcutKeys = null, danger = false, onSelect }: MenuActionProps) {
  return (
    <button type="button" className={`menu-item${danger ? " danger" : ""}`} role="menuitem" onClick={onSelect}>
      <Icon size={ICON_SIZE.row} />{label}
      {shortcutKeys && <kbd>{shortcutKeys}</kbd>}
    </button>
  );
}

// 意味のまとまり。条件で項目が 1 つも出ないまとまりは、区切り線ごと消える（app.css の .menu-group）。
function MenuGroup({ children }: { children: ReactNode }) {
  return <div className="menu-group" role="group">{children}</div>;
}

export function NoteActionsMenu({ anchor, note, repository, onChooseNotebooks, onFind, onPrint, onDuplicate, onMergeNote, onOpenAiAssistant, onFoldAll, onUnfoldAll, zoomTarget, onZoomIn, onSetNoteDue, onSetTaskDue, pluginCommands, onOpenInSplit, onOpenInNewWindow, onShowHistory, onExport, canChoosePageAlignment, shortcutKeys, onClose }: NoteActionsMenuProps) {
  const { content } = note;
  const inTrash = content.trashedAt !== null;
  const moveToTrash = useTrashWithUndo(repository);
  const { windowIsOnTop, toggleWindowOnTop } = useWindowOnTop();
  // メニューを閉じて、選んだ操作を実行する。
  const closeAndRun = (action: () => unknown) => () => {
    onClose();
    void action();
  };
  return (
    <PopupMenu anchor={anchor} onClose={onClose}>
      <MenuGroup>
        <MenuAction icon={content.pinned ? PinOff : Pin} label={translate(content.pinned ? "editor.unpin" : "editor.pin")}
          onSelect={closeAndRun(() => repository.updateNote(note.id, { pinned: !content.pinned }))} />
        {onChooseNotebooks && <MenuAction icon={FolderInput} label={translate("editor.chooseNotebooks")} onSelect={closeAndRun(onChooseNotebooks)} />}
        {!inTrash && <MenuAction icon={AlarmClock} label={translate("due.setForNote")} onSelect={closeAndRun(onSetNoteDue)} />}
        {onSetTaskDue && <MenuAction icon={AlarmClock} label={translate("due.setForTask")} onSelect={closeAndRun(onSetTaskDue)} />}
      </MenuGroup>
      <MenuGroup>
        <MenuAction icon={LayoutTemplate} label={translate(content.isTemplate ? "editor.stopBeingTemplate" : "editor.makeTemplate")}
          onSelect={closeAndRun(() => repository.updateNote(note.id, { isTemplate: !content.isTemplate, pinned: false }))} />
        <MenuAction icon={Copy} label={translate("editor.duplicate")} onSelect={closeAndRun(onDuplicate)} />
        {!inTrash && <MenuAction icon={Merge} label={translate("editor.mergeNote")} onSelect={closeAndRun(onMergeNote)} />}
      </MenuGroup>
      <MenuGroup>
        <MenuAction icon={Search} label={translate("editor.find")} shortcutKeys={shortcutKeys.findInNote} onSelect={closeAndRun(onFind)} />
        {zoomTarget && (
          <MenuAction icon={ZoomIn} label={translate(zoomTarget === "section" ? "editor.zoomIntoSection" : "editor.zoomIntoItem")}
            shortcutKeys={shortcutKeys.zoomIntoCursor} onSelect={closeAndRun(onZoomIn)} />
        )}
        {!inTrash && <MenuAction icon={ChevronsDownUp} label={translate("editor.foldAll")} shortcutKeys={shortcutKeys.foldAll} onSelect={closeAndRun(onFoldAll)} />}
        {!inTrash && <MenuAction icon={ChevronsUpDown} label={translate("editor.unfoldAll")} shortcutKeys={shortcutKeys.unfoldAll} onSelect={closeAndRun(onUnfoldAll)} />}
        {canChoosePageAlignment && (
          <PageAlignmentChoices selected={content.pageAlignment} onChoose={(pageAlignment) => closeAndRun(() => repository.updateNote(note.id, { pageAlignment }))()} />
        )}
      </MenuGroup>
      <MenuGroup>
        {onOpenInSplit && <MenuAction icon={Columns2} label={translate("split.open")} onSelect={closeAndRun(onOpenInSplit)} />}
        {onOpenInNewWindow && <MenuAction icon={AppWindow} label={translate("window.openInNewWindow")} onSelect={closeAndRun(onOpenInNewWindow)} />}
        {canKeepWindowOnTop() && (
          <button type="button" className="menu-item" role="menuitemcheckbox" aria-checked={windowIsOnTop} onClick={closeAndRun(toggleWindowOnTop)}>
            <ArrowUpToLine size={ICON_SIZE.row} /><span className="nav-label">{translate("window.keepOnTop")}</span>
            {windowIsOnTop && <Check size={ICON_SIZE.row} className="menu-check" />}
          </button>
        )}
      </MenuGroup>
      <MenuGroup>
        <MenuAction icon={Sparkles} label={translate("ai.assistant")} shortcutKeys={shortcutKeys.aiChat} onSelect={closeAndRun(onOpenAiAssistant)} />
        <MenuAction icon={History} label={translate("editor.history")} onSelect={closeAndRun(onShowHistory)} />
      </MenuGroup>
      <MenuGroup>
        {pluginCommands.length > 0 && !inTrash && (
          <>
            <div className="menu-heading">{translate("plugin.menuHeading")}</div>
            {pluginCommands.map((command) => <MenuAction key={command.key} icon={Puzzle} label={command.title} onSelect={closeAndRun(command.run)} />)}
          </>
        )}
      </MenuGroup>
      <MenuGroup>
        <MenuAction icon={FileDown} label={translate("editor.export")} onSelect={closeAndRun(onExport)} />
        {isPrintAvailable() && <MenuAction icon={Printer} label={translate("editor.print")} onSelect={closeAndRun(onPrint)} />}
      </MenuGroup>
      <MenuGroup>
        <MenuAction icon={Trash2} label={translate("editor.moveToTrash")} danger onSelect={closeAndRun(() => moveToTrash([note.id]))} />
      </MenuGroup>
    </PopupMenu>
  );
}
