// 図（Mermaid）。言語が mermaid のコードのブロックの下に、その中身を描いた図を出す。
// カーソルがブロックの外にある間は元の文字を隠して図だけにし、図を押すと元の文字が出て書き直せる。
// 図は表示のための飾り（decoration）で、本文はコードのブロックのまま。描く部品（Mermaid）は大きいので、最初に図を出すときにだけ読み込む。

import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { translate } from "../i18n/translate";

export const MERMAID_LANGUAGE = "mermaid";

type RenderDiagram = (source: string) => Promise<string>;

let loading: Promise<RenderDiagram> | null = null;
let renderedDiagramCount = 0;

function loadDiagramRenderer(): Promise<RenderDiagram> {
  loading ??= import("mermaid").then(({ default: mermaid }) => {
    // strict: 図の中のスクリプトとリンクを効かせない。
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: document.documentElement.style.colorScheme === "dark" ? "dark" : "default" });
    return async (source) => {
      renderedDiagramCount += 1;
      return (await mermaid.render(`mermaid-diagram-${renderedDiagramCount}`, source)).svg;
    };
  });
  return loading;
}

function diagramElement(view: EditorView, source: string, codeBlockPosition: () => number | undefined): HTMLElement {
  const diagram = document.createElement("div");
  diagram.className = "mermaid-diagram";
  diagram.contentEditable = "false";
  diagram.setAttribute("role", "img");
  diagram.setAttribute("aria-label", translate("editor.diagram"));
  diagram.textContent = translate("editor.diagramRendering");
  void loadDiagramRenderer().then((render) => render(source)).then(
    (svg) => { diagram.innerHTML = svg; },
    (error: unknown) => {
      diagram.classList.add("failed");
      diagram.textContent = translate("editor.diagramFailed", { reason: error instanceof Error ? error.message : String(error) });
    },
  );
  // 図を押すと、元の文字（コードのブロック）にカーソルを置いて、書き直せるようにする。
  diagram.addEventListener("mousedown", (event) => {
    const position = codeBlockPosition();
    if (position !== undefined && view.editable) {
      event.preventDefault();
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, position + 1)));
      view.focus();
    }
  });
  return diagram;
}

function isMermaidBlock(node: ProseMirrorNode): boolean {
  return node.type.name === "codeBlock" && node.attrs.language === MERMAID_LANGUAGE;
}

function diagramDecorations(state: EditorState): DecorationSet {
  const decorations: Decoration[] = [];
  const { from, to } = state.selection;
  state.doc.descendants((node, position) => {
    if (!isMermaidBlock(node)) {
      return true;
    }
    const end = position + node.nodeSize;
    const source = node.textContent;
    if (source.trim() !== "") {
      // 中身が同じ間は図を作り直さないよう、中身を key にする。
      decorations.push(Decoration.widget(end, (view, getPosition) => diagramElement(view, source, () => {
        const widgetPosition = getPosition();
        return widgetPosition === undefined ? undefined : widgetPosition - node.nodeSize;
      }), { side: 1, key: `mermaid:${source}` }));
      const cursorInside = from >= position && to <= end;
      if (!cursorInside) {
        decorations.push(Decoration.node(position, end, { class: "mermaid-source-hidden" }));
      }
    }
    return false;
  });
  return DecorationSet.create(state.doc, decorations);
}

const mermaidDiagramsKey = new PluginKey<DecorationSet>("mermaidDiagrams");

export const MermaidDiagrams = Extension.create({
  name: "mermaidDiagrams",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: mermaidDiagramsKey,
        state: {
          init: (_config, state) => diagramDecorations(state),
          apply: (transaction, decorations, _oldState, newState) =>
            (transaction.docChanged || transaction.selectionSet ? diagramDecorations(newState) : decorations),
        },
        props: {
          decorations: (state) => mermaidDiagramsKey.getState(state),
        },
      }),
    ];
  },
});
