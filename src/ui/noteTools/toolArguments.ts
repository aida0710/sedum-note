// ツールの引数（AI が JSON で渡すもの）を確かめる部品と、引数の JSON Schema の部品。
// 決まりどおりでなければ NoteToolError を投げる（AI はその文を読んで呼び方を直せる）。

import { NoteToolError, type ToolArguments } from "./noteTool";

export const ID_SCHEMA = { type: "string", description: "32 hexadecimal characters" };
export const NOTE_ID_PROPERTY = { noteId: { ...ID_SCHEMA, description: "The id of the note (32 hexadecimal characters)" } };

export function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: false };
}

export function requiredString(toolArguments: ToolArguments, name: string): string {
  const value = toolArguments[name];
  if (typeof value !== "string") {
    throw new NoteToolError(`${name} must be a string`);
  }
  return value;
}

export function optionalString(toolArguments: ToolArguments, name: string): string | undefined {
  return toolArguments[name] === undefined ? undefined : requiredString(toolArguments, name);
}

export function optionalBoolean(toolArguments: ToolArguments, name: string): boolean | undefined {
  const value = toolArguments[name];
  if (value !== undefined && typeof value !== "boolean") {
    throw new NoteToolError(`${name} must be true or false`);
  }
  return value;
}

export function optionalStringList(toolArguments: ToolArguments, name: string): string[] | undefined {
  const value = toolArguments[name];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new NoteToolError(`${name} must be a list of strings`);
  }
  return value as string[];
}

// 整数の引数を、範囲の中に収めて読む。無ければ既定の値。
export function boundedInteger(toolArguments: ToolArguments, name: string, range: { minimum: number; maximum: number; fallback: number }): number {
  const value = toolArguments[name];
  if (value === undefined) {
    return range.fallback;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new NoteToolError(`${name} must be a number`);
  }
  return Math.min(range.maximum, Math.max(range.minimum, Math.round(value)));
}
