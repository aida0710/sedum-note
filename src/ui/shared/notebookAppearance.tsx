// ノートブックの色とアイコン。利用者が選んでいなければ、作った順に色を割り当てる（7 つまでは重ならず、
// どのデバイスでも同じ色になる。作った時刻は同期する）。選べる色とアイコンは、ここの一覧にあるものだけ。

import {
  Book, Briefcase, Calendar, Camera, Code, Folder, GraduationCap, Heart, Home, Lightbulb, type LucideIcon, Music, Plane, ShoppingCart, Star, Users, Utensils,
} from "lucide-react";
import type { LiveNotebook } from "../../core/notes/noteRecords";
import { PALETTE_COLORS, type PaletteColorName } from "../theme/paletteColors";

export const NOTEBOOK_COLOR_CHOICES = PALETTE_COLORS;
export type NotebookColorName = PaletteColorName;

export const NOTEBOOK_ICON_CHOICES = {
  folder: Folder, book: Book, briefcase: Briefcase, home: Home, heart: Heart, star: Star, plane: Plane, utensils: Utensils,
  code: Code, music: Music, camera: Camera, graduationCap: GraduationCap, shoppingCart: ShoppingCart, lightbulb: Lightbulb, calendar: Calendar, users: Users,
} as const satisfies Record<string, LucideIcon>;
export type NotebookIconName = keyof typeof NOTEBOOK_ICON_CHOICES;

// 自動で割り当てる色の順。
const AUTOMATIC_COLOR_NAMES: NotebookColorName[] = ["blue", "orange", "green", "purple", "yellow", "pink", "cyan"];
const NOTEBOOK_ICON_SIZE = 14;

export type NotebookColors = { colorOf: (notebookId: string) => string };

export function assignNotebookColors(notebooks: LiveNotebook[]): NotebookColors {
  const ordered = [...notebooks].sort((left, right) =>
    left.content.createdAt.localeCompare(right.content.createdAt) || left.id.localeCompare(right.id));
  const colors = new Map(ordered.map((notebook, index) => {
    const chosen = NOTEBOOK_COLOR_CHOICES[notebook.content.colorName as NotebookColorName];
    return [notebook.id, chosen ?? NOTEBOOK_COLOR_CHOICES[AUTOMATIC_COLOR_NAMES[index % AUTOMATIC_COLOR_NAMES.length] ?? "blue"]];
  }));
  return { colorOf: (notebookId) => colors.get(notebookId) ?? NOTEBOOK_COLOR_CHOICES.blue };
}

// ノートブックの印。アイコンを選んでいればその色のアイコン、選んでいなければ色の点。
export function NotebookMark({ notebook, colors }: { notebook: LiveNotebook; colors: NotebookColors }) {
  const color = colors.colorOf(notebook.id);
  const Icon = NOTEBOOK_ICON_CHOICES[notebook.content.iconName as NotebookIconName];
  return Icon ? <Icon size={NOTEBOOK_ICON_SIZE} color={color} className="notebook-icon" /> : <span className="dot" style={{ background: color }} />;
}
