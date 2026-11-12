// メモのプロパティの欄。メモが入っているノートブックのプロパティを並べ、値を入れられる。変えるとすぐ保存する。

import { type PropertyDefinition, type PropertyValue, propertyValueFromText } from "../../core/notes/noteProperties";
import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";

type NotePropertiesProps = { note: LiveNote; properties: PropertyDefinition[]; repository: NoteRepository; readOnly: boolean };

const NO_OPTION = "";

function PropertyInput({ property, value, readOnly, onChange }: { property: PropertyDefinition; value: PropertyValue; readOnly: boolean; onChange: (value: PropertyValue) => void }) {
  const inputId = `note-property-${property.id}`;
  if (property.type === "checkbox") {
    return <input id={inputId} type="checkbox" checked={value === true} disabled={readOnly} onChange={(event) => onChange(event.target.checked)} />;
  }
  if (property.type === "select") {
    return (
      <select id={inputId} value={typeof value === "string" ? value : NO_OPTION} disabled={readOnly} onChange={(event) => onChange(propertyValueFromText("select", event.target.value))}>
        <option value={NO_OPTION} />
        {property.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }
  const inputType = property.type === "number" ? "number" : property.type === "date" ? "date" : "text";
  return (
    <input id={inputId} type={inputType} value={value === null || typeof value === "boolean" ? "" : String(value)} readOnly={readOnly}
      onChange={(event) => onChange(propertyValueFromText(property.type, event.target.value))} />
  );
}

export function NoteProperties({ note, properties, repository, readOnly }: NotePropertiesProps) {
  if (properties.length === 0) {
    return null;
  }
  return (
    <div className="note-properties">
      {properties.map((property) => (
        <div key={property.id} className="note-property">
          <label htmlFor={`note-property-${property.id}`}>{property.name}</label>
          <PropertyInput property={property} value={note.content.propertyValues[property.id] ?? null} readOnly={readOnly}
            onChange={(value) => void repository.setNotePropertyValue(note.id, property.id, value)} />
        </div>
      ))}
    </div>
  );
}
