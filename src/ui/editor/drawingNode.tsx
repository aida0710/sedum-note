// 手書き・図形のブロック。枠の中に、ペンの線と図形（直線・四角・円）を描ける。あとから描き足せて、消しゴムで 1 本ずつ消せる。
// 文書には、線を 1 本ずつ子のノード（drawingStroke）として持つ。画像ではなく線のデータなので、2 台が同時に描いても
// 両方の線が残る。Markdown では、言語が sedum-drawing のコードの囲みと往復する。

import { type JSONContent, mergeAttributes, Node, NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { Circle, Eraser, type LucideIcon, Minus, Pencil, Square } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, useRef, useState } from "react";
import { type MessageKey, translate } from "../i18n/translate";
import { ColorChoices } from "./ColorChoices";
import { type EditorColorName, editorColorValue, isEditorColorName } from "./editorColors";

export const DRAWING_NODE = "drawing";
const DRAWING_STROKE_NODE = "drawingStroke";
// Markdown で線のデータを書くコードの囲みの言語。
const DRAWING_CODE_LANGUAGE = "sedum-drawing";

// 枠の中の座標の広さ。線の点はこの単位で持ち、画面の幅に合わせて拡大・縮小して出す。
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
// 線の太さ（座標の単位）。
const STROKE_WIDTH = 3;
// 消しゴムで線に当てやすくするための、見えない当たりの太さ（座標の単位）。
const ERASER_HIT_WIDTH = 18;
// ペンの線で、前の点からこれ以上動いたら次の点を足す（座標の単位）。細かすぎる点でデータが膨らまないようにする。
const MIN_POINT_DISTANCE = 2;
const TOOL_ICON_SIZE = 15;

const DRAWING_SHAPES = ["pen", "line", "rectangle", "ellipse"] as const;
type DrawingShape = (typeof DRAWING_SHAPES)[number];
type DrawingTool = DrawingShape | "eraser";

const TOOLS: Array<{ tool: DrawingTool; icon: LucideIcon; label: MessageKey }> = [
  { tool: "pen", icon: Pencil, label: "editor.drawing.pen" },
  { tool: "line", icon: Minus, label: "editor.drawing.line" },
  { tool: "rectangle", icon: Square, label: "editor.drawing.rectangle" },
  { tool: "ellipse", icon: Circle, label: "editor.drawing.ellipse" },
  { tool: "eraser", icon: Eraser, label: "editor.drawing.eraser" },
];

// 1 本の線。points は x と y を順に並べた数（ペンは通った点の全部、図形は始点と終点）。color が null なら文字の色。
type DrawingStroke = { shape: DrawingShape; points: number[]; color: EditorColorName | null };

// 点の並びを、属性に入れる文字にする（例: "10,20 30,40"）。
function pointsText(points: number[]): string {
  const pairs: string[] = [];
  for (let index = 0; index + 1 < points.length; index += 2) {
    pairs.push(`${points[index]},${points[index + 1]}`);
  }
  return pairs.join(" ");
}

function pointsFromText(text: unknown): number[] {
  return typeof text === "string" ? text.split(/[ ,]+/).filter((part) => part !== "").map(Number).filter(Number.isFinite) : [];
}

// ノードの属性（か、Markdown から読んだ値）から線を読む。形が合わなければ null。
function strokeFrom(attributes: { shape?: unknown; points?: unknown; color?: unknown }): DrawingStroke | null {
  const shape = DRAWING_SHAPES.find((candidate) => candidate === attributes.shape);
  const points = pointsFromText(attributes.points);
  if (!shape || points.length < 4 || points.length % 2 !== 0) {
    return null;
  }
  return { shape, points, color: isEditorColorName(attributes.color) ? attributes.color : null };
}

function strokeAttributes(stroke: DrawingStroke): { shape: DrawingShape; points: string; color: EditorColorName | null } {
  return { shape: stroke.shape, points: pointsText(stroke.points), color: stroke.color };
}

// 線の、SVG のパスの書き方。
function strokePath({ shape, points }: DrawingStroke): string {
  const [startX = 0, startY = 0] = points;
  const endX = points[points.length - 2] ?? startX;
  const endY = points[points.length - 1] ?? startY;
  switch (shape) {
    case "pen":
      return `M ${pointsText(points).split(" ").join(" L ")}`;
    case "line":
      return `M ${startX},${startY} L ${endX},${endY}`;
    case "rectangle":
      return `M ${startX},${startY} H ${endX} V ${endY} H ${startX} Z`;
    case "ellipse": {
      const radiusX = Math.abs(endX - startX) / 2;
      const radiusY = Math.abs(endY - startY) / 2;
      const left = Math.min(startX, endX);
      const middleY = (startY + endY) / 2;
      return `M ${left},${middleY} a ${radiusX},${radiusY} 0 1 0 ${radiusX * 2},0 a ${radiusX},${radiusY} 0 1 0 ${-radiusX * 2},0 Z`;
    }
  }
}

function strokeColor(stroke: DrawingStroke): string {
  return stroke.color === null ? "currentColor" : editorColorValue(stroke.color);
}

function DrawingView({ node, editor, getPos }: ReactNodeViewProps) {
  const [tool, setTool] = useState<DrawingTool>("pen");
  const [color, setColor] = useState<EditorColorName | null>(null);
  // 描いている途中の線の点。描いていなければ null。
  const [draftPoints, setDraftPoints] = useState<number[] | null>(null);
  const canvas = useRef<SVGSVGElement>(null);
  const editable = editor.isEditable;

  const strokes: Array<{ stroke: DrawingStroke; offset: number }> = [];
  node.forEach((child, offset) => {
    const stroke = strokeFrom(child.attrs);
    if (stroke) {
      strokes.push({ stroke, offset });
    }
  });

  const pointAt = (event: ReactPointerEvent): [number, number] => {
    const box = canvas.current!.getBoundingClientRect();
    return [Math.round(((event.clientX - box.left) / box.width) * CANVAS_WIDTH), Math.round(((event.clientY - box.top) / box.height) * CANVAS_HEIGHT)];
  };
  const startStroke = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!editable || tool === "eraser") {
      return;
    }
    // 枠の外へ出ても、離すまで線を続けられるようにする。
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraftPoints(pointAt(event));
  };
  const extendStroke = (event: ReactPointerEvent) => {
    if (draftPoints === null) {
      return;
    }
    const [x, y] = pointAt(event);
    if (tool !== "pen") {
      setDraftPoints([draftPoints[0]!, draftPoints[1]!, x, y]);
      return;
    }
    const lastX = draftPoints[draftPoints.length - 2]!;
    const lastY = draftPoints[draftPoints.length - 1]!;
    if (Math.hypot(x - lastX, y - lastY) >= MIN_POINT_DISTANCE) {
      setDraftPoints([...draftPoints, x, y]);
    }
  };
  const finishStroke = () => {
    const position = getPos();
    const strokeType = editor.schema.nodes[DRAWING_STROKE_NODE];
    // 押しただけで動かさなかったとき（点が 1 つ）は、線にしない。
    if (draftPoints !== null && draftPoints.length >= 4 && tool !== "eraser" && position !== undefined && strokeType) {
      const endOfDrawing = position + node.nodeSize - 1;
      editor.view.dispatch(editor.state.tr.insert(endOfDrawing, strokeType.create(strokeAttributes({ shape: tool, points: draftPoints, color }))));
    }
    setDraftPoints(null);
  };
  const eraseStroke = (offset: number) => {
    const position = getPos();
    if (editable && tool === "eraser" && position !== undefined) {
      const strokePosition = position + 1 + offset;
      editor.view.dispatch(editor.state.tr.delete(strokePosition, strokePosition + 1));
    }
  };

  return (
    <NodeViewWrapper className="drawing" contentEditable={false}>
      {editable && (
        <div className="drawing-tools" role="toolbar" aria-label={translate("editor.drawing.tools")}>
          {TOOLS.map(({ tool: choice, icon: Icon, label }) => (
            <button key={choice} type="button" className="icon-button" aria-pressed={tool === choice} aria-label={translate(label)} title={translate(label)}
              onClick={() => setTool(choice)}>
              <Icon size={TOOL_ICON_SIZE} />
            </button>
          ))}
          <ColorChoices appearance="text" selected={color} onChoose={setColor} />
        </div>
      )}
      <svg ref={canvas} className={`drawing-canvas${tool === "eraser" ? " erasing" : ""}`} viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} role="img" aria-label={translate("editor.drawing.canvas", { count: strokes.length })}
        onPointerDown={startStroke} onPointerMove={extendStroke} onPointerUp={finishStroke} onPointerCancel={() => setDraftPoints(null)}>
        {strokes.map(({ stroke, offset }) => (
          <g key={offset} className="drawing-stroke" onPointerDown={() => eraseStroke(offset)}>
            <path d={strokePath(stroke)} stroke={strokeColor(stroke)} strokeWidth={STROKE_WIDTH} />
            <path d={strokePath(stroke)} stroke="transparent" strokeWidth={ERASER_HIT_WIDTH} />
          </g>
        ))}
        {draftPoints !== null && draftPoints.length >= 4 && tool !== "eraser" && (
          <path className="drawing-stroke" d={strokePath({ shape: tool, points: draftPoints, color })} stroke={strokeColor({ shape: tool, points: draftPoints, color })} strokeWidth={STROKE_WIDTH} />
        )}
      </svg>
    </NodeViewWrapper>
  );
}

// 1 本の線。HTML では SVG のパスにするので、書き出した HTML でもそのまま見える。
export const DrawingStrokeNode = Node.create({
  name: DRAWING_STROKE_NODE,
  atom: true,
  selectable: false,
  addAttributes() {
    return { shape: { default: "pen" }, points: { default: "" }, color: { default: null } };
  },
  parseHTML() {
    return [{
      tag: "path[data-drawing-shape]",
      getAttrs: (element) => ({ shape: element.getAttribute("data-drawing-shape"), points: element.getAttribute("data-drawing-points"), color: element.getAttribute("data-drawing-color") }),
    }];
  },
  renderHTML({ node }) {
    const stroke = strokeFrom(node.attrs);
    const drawn = stroke ? { d: strokePath(stroke), stroke: strokeColor(stroke), "stroke-width": String(STROKE_WIDTH), fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" } : {};
    return ["path", mergeAttributes(drawn, { "data-drawing-shape": node.attrs.shape, "data-drawing-points": node.attrs.points, "data-drawing-color": node.attrs.color })];
  },
});

export const Drawing = Node.create({
  name: DRAWING_NODE,
  group: "block",
  content: `${DRAWING_STROKE_NODE}*`,
  isolating: true,
  parseHTML() {
    return [{ tag: "svg[data-drawing]" }];
  },
  renderHTML() {
    return ["svg", { "data-drawing": "", viewBox: `0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`, xmlns: "http://www.w3.org/2000/svg" }, 0];
  },
  addNodeView() {
    // 枠の中のペンやボタンの操作を、エディタに渡さない。
    return ReactNodeViewRenderer(DrawingView, { stopEvent: () => true });
  },
  renderMarkdown: (node) => {
    const strokes = (node.content ?? []).map((child) => strokeFrom(child.attrs ?? {})).filter((stroke) => stroke !== null).map(strokeAttributes);
    return `\`\`\`${DRAWING_CODE_LANGUAGE}\n${JSON.stringify({ strokes })}\n\`\`\``;
  },
});

// Markdown から読んだコードの囲みが、線のデータを書いたもの（言語が sedum-drawing）なら、手書きのブロックにする。
export function drawingFromCodeBlock(codeBlock: JSONContent): JSONContent {
  if (codeBlock.attrs?.language !== DRAWING_CODE_LANGUAGE) {
    return codeBlock;
  }
  try {
    const written = JSON.parse(codeBlock.content?.map((inline) => inline.text ?? "").join("") ?? "") as { strokes?: unknown };
    const strokes = (Array.isArray(written.strokes) ? written.strokes : [])
      .map((candidate) => strokeFrom((candidate ?? {}) as Record<string, unknown>))
      .filter((stroke) => stroke !== null);
    return { type: DRAWING_NODE, content: strokes.map((stroke) => ({ type: DRAWING_STROKE_NODE, attrs: strokeAttributes(stroke) })) };
  } catch {
    return codeBlock;
  }
}
