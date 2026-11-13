// 左の列で、名前を打っている間の行（名前の変更、ノートブックの追加）。行の高さと字下げは元の行のままにして、
// ラベルのあった位置に入力欄を出す。leading に、行の左に残すもの（開閉の印とアイコン）を渡す。

import type { CSSProperties, ReactNode } from "react";
import { InlineNameInput, type InlineNameInputProps } from "./InlineNameInput";

type SidebarNameRowProps = InlineNameInputProps & {
  // 一覧の行（ノートブック）の名前か、メモの行の題か。
  rowKind: "view" | "note";
  // 段の深さ（app.css の --depth）。null は、木の外の行（検索の結果）。
  depth: number | null;
  leading?: ReactNode;
};

// 段の深さを、CSS の字下げの計算に渡す。
export function treeDepthStyle(depth: number | null): CSSProperties | undefined {
  return depth === null ? undefined : { "--depth": depth } as CSSProperties;
}

export function SidebarNameRow({ rowKind, depth, leading, ...inputProps }: SidebarNameRowProps) {
  return (
    <div className="nav-row">
      <div className={`${rowKind === "view" ? "nav" : "tree-note"} naming${depth === null ? " unindented" : ""}`} style={treeDepthStyle(depth)}>
        {leading}
        <InlineNameInput {...inputProps} />
      </div>
    </div>
  );
}

type NewNotebookNameRowProps = { depth: number; placeholder: string; onDone: (name: string | null) => void };

// これから作るノートブックの名前を打つ行。色はまだ決まっていないので、印は地味な色にする。
export function NewNotebookNameRow({ depth, placeholder, onDone }: NewNotebookNameRowProps) {
  return (
    <SidebarNameRow rowKind="view" depth={depth} placeholder={placeholder} onDone={onDone}
      leading={<><span className="disclosure" /><span className="dot pending" /></>} />
  );
}
