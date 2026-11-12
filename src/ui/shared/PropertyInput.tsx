// プロパティの値を入れる欄。種類（文字・数・日付・選択肢・チェック）に合わせた入力にする。メモの上の欄と、データベース表示のセルで使う。

import { type PropertyDefinition, type PropertyValue, propertyValueFromText } from "../../core/notes/noteProperties";

const NO_OPTION = "";

type PropertyInputProps = {
  // label の htmlFor と対にする id。label を置かない所では、名前を aria-label で付ける。
  inputId?: string;
  property: PropertyDefinition;
  value: PropertyValue;
  readOnly: boolean;
  onChange: (value: PropertyValue) => void;
};

export function PropertyInput({ inputId, property, value, readOnly, onChange }: PropertyInputProps) {
  const ariaLabel = inputId === undefined ? property.name : undefined;
  if (property.type === "checkbox") {
    return <input id={inputId} aria-label={ariaLabel} type="checkbox" checked={value === true} disabled={readOnly} onChange={(event) => onChange(event.target.checked)} />;
  }
  if (property.type === "select") {
    return (
      <select id={inputId} aria-label={ariaLabel} value={typeof value === "string" ? value : NO_OPTION} disabled={readOnly} onChange={(event) => onChange(propertyValueFromText("select", event.target.value))}>
        <option value={NO_OPTION} />
        {property.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }
  const inputType = property.type === "number" ? "number" : property.type === "date" ? "date" : "text";
  return (
    <input id={inputId} aria-label={ariaLabel} type={inputType} value={value === null || typeof value === "boolean" ? "" : String(value)} readOnly={readOnly}
      onChange={(event) => onChange(propertyValueFromText(property.type, event.target.value))} />
  );
}
