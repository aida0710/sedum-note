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

// 図の色と文字を、いまのテーマから作る（Mermaid の既定の色はアプリのテーマと合わない）。Mermaid は色から影の色などを
// 計算するので、CSS の変数そのものではなく、テーマが入れた色の値（#rrggbb）を渡す。
function diagramThemeVariables(): Record<string, string> {
  const root = getComputedStyle(document.documentElement);
  const color = (name: string) => root.getPropertyValue(name).trim();
  return {
    darkMode: String(document.documentElement.style.colorScheme === "dark"),
    background: color("--panel"),
    primaryColor: color("--accent-soft"),
    primaryTextColor: color("--text"),
    primaryBorderColor: color("--accent"),
    secondaryColor: color("--tag"),
    tertiaryColor: color("--panel"),
    lineColor: color("--muted"),
    textColor: color("--text"),
    fontFamily: root.fontFamily,
    fontSize: root.getPropertyValue("--font-size-ui").trim(),
  };
}

function loadDiagramRenderer(): Promise<RenderDiagram> {
  loading ??= import("mermaid").then(({ default: mermaid }) => async (source) => {
    // 描くたびにいまのテーマの色を入れる（読み込んだあとにテーマを変えても、次に描く図から合う）。
    // strict: 図の中のスクリプトとリンクを効かせない。
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", themeVariables: diagramThemeVariables() });
    renderedDiagramCount += 1;
    return (await mermaid.render(`mermaid-diagram-${renderedDiagramCount}`, source)).svg;
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

// 図の色の組み合わせを表す文字。テーマが変わると変わる。
function diagramThemeSignature(): string {
  return JSON.stringify(diagramThemeVariables());
}

function diagramDecorations(state: EditorState, themeSignature: string): DecorationSet {
  const decorations: Decoration[] = [];
  const { from, to } = state.selection;
  state.doc.descendants((node, position) => {
    if (!isMermaidBlock(node)) {
      return true;
    }
    const end = position + node.nodeSize;
    const source = node.textContent;
    if (source.trim() !== "") {
      // 中身とテーマが同じ間は図を作り直さないよう、両方を key にする（テーマを切り替えたら、新しい色で描き直す）。
      decorations.push(Decoration.widget(end, (view, getPosition) => diagramElement(view, source, () => {
        const widgetPosition = getPosition();
        return widgetPosition === undefined ? undefined : widgetPosition - node.nodeSize;
      }), { side: 1, key: `mermaid:${themeSignature}:${source}` }));
      const cursorInside = from >= position && to <= end;
      if (!cursorInside) {
        decorations.push(Decoration.node(position, end, { class: "mermaid-source-hidden" }));
      }
    }
    return false;
  });
  return DecorationSet.create(state.doc, decorations);
}

type MermaidDiagramsState = { decorations: DecorationSet; themeSignature: string };

const mermaidDiagramsKey = new PluginKey<MermaidDiagramsState>("mermaidDiagrams");

export const MermaidDiagrams = Extension.create({
  name: "mermaidDiagrams",
  addProseMirrorPlugins() {
    return [
      new Plugin<MermaidDiagramsState>({
        key: mermaidDiagramsKey,
        state: {
          init: (_config, state) => {
            const themeSignature = diagramThemeSignature();
            return { decorations: diagramDecorations(state, themeSignature), themeSignature };
          },
          apply: (transaction, previous, _oldState, newState) => {
            const themeSignature = (transaction.getMeta(mermaidDiagramsKey) as string | undefined) ?? previous.themeSignature;
            const changed = transaction.docChanged || transaction.selectionSet || themeSignature !== previous.themeSignature;
            return changed ? { decorations: diagramDecorations(newState, themeSignature), themeSignature } : previous;
          },
        },
        props: {
          decorations: (state) => mermaidDiagramsKey.getState(state)?.decorations,
        },
        // テーマの色は、画面の根の要素の style に入る（theme/applyAppearance.ts）。変わったら、図を描き直させる。
        view: (view) => {
          const themeObserver = new MutationObserver(() => {
            const themeSignature = diagramThemeSignature();
            if (themeSignature !== mermaidDiagramsKey.getState(view.state)?.themeSignature) {
              view.dispatch(view.state.tr.setMeta(mermaidDiagramsKey, themeSignature));
            }
          });
          themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
          return { destroy: () => themeObserver.disconnect() };
        },
      }),
    ];
  },
});
