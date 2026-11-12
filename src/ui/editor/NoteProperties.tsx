// メモのプロパティの欄。メモが入っているノートブックのプロパティを並べ、値を入れられる。変えるとすぐ保存する。

import type { PropertyDefinition } from "../../core/notes/noteProperties";
import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { PropertyInput } from "../shared/PropertyInput";

type NotePropertiesProps = { note: LiveNote; properties: PropertyDefinition[]; repository: NoteRepository; readOnly: boolean };

export function NoteProperties({ note, properties, repository, readOnly }: NotePropertiesProps) {
  if (properties.length === 0) {
    return null;
  }
  return (
    <div className="note-properties">
      {properties.map((property) => (
        <div key={property.id} className="note-property">
          <label htmlFor={`note-property-${property.id}`}>{property.name}</label>
          <PropertyInput inputId={`note-property-${property.id}`} property={property} value={note.content.propertyValues[property.id] ?? null} readOnly={readOnly}
            onChange={(value) => void repository.setNotePropertyValue(note.id, property.id, value)} />
        </div>
      ))}
    </div>
  );
}
