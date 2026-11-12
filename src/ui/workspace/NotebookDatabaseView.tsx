// データベース表示。ノートブックのメモを、プロパティを列にした表か、選択肢のプロパティで分けたボードで見せる。
// 並べ方と見え方はノートブックに保存する（同期される）。

import { ArrowDown, ArrowUp, Columns3, Table } from "lucide-react";
import {
  boardColumns, boardGroupProperty, DATABASE_LAYOUTS, type DatabaseLayout, type DatabaseView, sortNotesForDatabase, TITLE_COLUMN, UPDATED_COLUMN,
} from "../../core/notes/databaseView";
import type { PropertyDefinition } from "../../core/notes/noteProperties";
import type { LiveNote, LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { type MessageKey, translate } from "../i18n/translate";
import { formatDateTime } from "../shared/formatTime";
import { PropertyInput } from "../shared/PropertyInput";

type NotebookDatabaseViewProps = {
  notebook: LiveNotebook;
  // このノートブックのメモ（ゴミ箱とテンプレートを除く）。
  notes: LiveNote[];
  repository: NoteRepository;
  onOpenNote: (noteId: string) => void;
};

const LAYOUT_ICONS = { table: Table, board: Columns3 } as const;
const LAYOUT_LABELS: Record<DatabaseLayout, MessageKey> = { table: "database.layout.table", board: "database.layout.board" };
// ボードのカードをドラッグするときの、データの種類。
const CARD_DRAG_TYPE = "application/x-sedum-note-database-card";
const ICON_SIZE = 14;

export function NotebookDatabaseView({ notebook, notes, repository, onOpenNote }: NotebookDatabaseViewProps) {
  const { properties, databaseView: view } = notebook.content;
  const changeView = (changes: Partial<DatabaseView>) => void repository.updateNotebook(notebook.id, { databaseView: { ...view, ...changes } });
  const sorted = sortNotesForDatabase(notes, view);
  const titleOf = (note: LiveNote) => note.content.title || translate("sidebar.untitled");
  return (
    <div className="document-scroll">
      <div className="database-view">
        <div className="database-header">
          <h1>{notebook.content.name}</h1>
          <div className="choice-grid" role="radiogroup" aria-label={translate("database.layout")}>
            {DATABASE_LAYOUTS.map((layout) => {
              const Icon = LAYOUT_ICONS[layout];
              return (
                <button key={layout} type="button" role="radio" aria-checked={view.layout === layout} className={`choice${view.layout === layout ? " on" : ""}`}
                  onClick={() => changeView({ layout })}>
                  <Icon size={ICON_SIZE} />&nbsp;{translate(LAYOUT_LABELS[layout])}
                </button>
              );
            })}
          </div>
        </div>
        {notes.length === 0 && <div className="tree-empty">{translate("sidebar.noNotes")}</div>}
        {notes.length > 0 && view.layout === "table" && (
          <DatabaseTable notes={sorted} properties={properties} view={view} repository={repository} titleOf={titleOf} onOpenNote={onOpenNote} onSort={changeView} />
        )}
        {notes.length > 0 && view.layout === "board" && (
          <DatabaseBoard notes={sorted} properties={properties} view={view} repository={repository} titleOf={titleOf} onOpenNote={onOpenNote} onChooseGroup={(groupBy) => changeView({ groupBy })} />
        )}
      </div>
    </div>
  );
}

type DatabaseContentProps = {
  notes: LiveNote[];
  properties: PropertyDefinition[];
  view: DatabaseView;
  repository: NoteRepository;
  titleOf: (note: LiveNote) => string;
  onOpenNote: (noteId: string) => void;
};

function DatabaseTable({ notes, properties, view, repository, titleOf, onOpenNote, onSort }: DatabaseContentProps & { onSort: (changes: Partial<DatabaseView>) => void }) {
  // 列の見出しを押すと、その列で並べ替える。同じ列をもう一度押すと、向きを逆にする。
  const columnHeader = (column: string, label: string) => {
    const isSorted = view.sortBy === column;
    const nextDirection = isSorted && view.sortDirection === "ascending" ? "descending" : "ascending";
    return (
      <th key={column} aria-sort={isSorted ? view.sortDirection : undefined}>
        <button type="button" onClick={() => onSort({ sortBy: column, sortDirection: nextDirection })}>
          {label}
          {isSorted && (view.sortDirection === "ascending" ? <ArrowUp size={ICON_SIZE} /> : <ArrowDown size={ICON_SIZE} />)}
        </button>
      </th>
    );
  };
  return (
    <div className="database-table-scroll">
      <table className="database-table">
        <thead>
          <tr>
            {columnHeader(TITLE_COLUMN, translate("database.titleColumn"))}
            {properties.map((property) => columnHeader(property.id, property.name))}
            {columnHeader(UPDATED_COLUMN, translate("database.updatedColumn"))}
          </tr>
        </thead>
        <tbody>
          {notes.map((note) => (
            <tr key={note.id}>
              <td><button type="button" className="database-title" onClick={() => onOpenNote(note.id)}>{titleOf(note)}</button></td>
              {properties.map((property) => (
                <td key={property.id}>
                  <PropertyInput property={property} value={note.content.propertyValues[property.id] ?? null} readOnly={false}
                    onChange={(value) => void repository.setNotePropertyValue(note.id, property.id, value)} />
                </td>
              ))}
              <td className="database-updated">{formatDateTime(note.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const NO_GROUP_PROPERTY = "";

function DatabaseBoard({ notes, properties, view, repository, titleOf, onOpenNote, onChooseGroup }: DatabaseContentProps & { onChooseGroup: (propertyId: string) => void }) {
  const groupProperty = boardGroupProperty(properties, view.groupBy);
  if (!groupProperty) {
    return <div className="tree-empty">{translate("database.boardNeedsSelect")}</div>;
  }
  return (
    <>
      <div className="field database-group">
        <label htmlFor="database-group-property">{translate("database.groupBy")}</label>
        <select id="database-group-property" value={groupProperty.id || NO_GROUP_PROPERTY} onChange={(event) => onChooseGroup(event.target.value)}>
          {properties.filter((property) => property.type === "select").map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
        </select>
      </div>
      <div className="database-board">
        {boardColumns(notes, groupProperty).map((column) => (
          <section key={column.option ?? NO_GROUP_PROPERTY} className="database-column" aria-label={column.option ?? translate("database.unset")}
            onDragOver={(event) => event.dataTransfer.types.includes(CARD_DRAG_TYPE) && event.preventDefault()}
            onDrop={(event) => void repository.setNotePropertyValue(event.dataTransfer.getData(CARD_DRAG_TYPE), groupProperty.id, column.option)}>
            <h2>{column.option ?? translate("database.unset")}<span>{column.notes.length}</span></h2>
            {column.notes.map((note) => (
              <button key={note.id} type="button" className="database-card" draggable
                onDragStart={(event) => event.dataTransfer.setData(CARD_DRAG_TYPE, note.id)} onClick={() => onOpenNote(note.id)}>
                {titleOf(note)}
              </button>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
