import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { bodyAttachments, bodyPlainText } from "../../core/notes/bodyText";
import { bodyToMarkdown, type ImportedAttachment, type MarkdownImportContext, writeMarkdownToBody } from "./markdownDocument";

const NOTE_ID = "0123456789abcdef0123456789abcdef";

function importContext(files: Record<string, ImportedAttachment>, existingNoteIds: string[] = []): MarkdownImportContext & { requested: string[] } {
  const requested: string[] = [];
  return {
    requested,
    attachFile: async (relativePath) => {
      requested.push(relativePath);
      return files[relativePath] ?? null;
    },
    noteExists: (noteId) => existingNoteIds.includes(noteId),
  };
}

const exportContext = { attachmentHref: ({ id, fileName }: { id: string; fileName: string }) => `attachments/${id}-${fileName}`, noteTitle: () => "リンク先のメモ" };

async function bodyFromMarkdown(markdown: string, context: MarkdownImportContext): Promise<Y.XmlFragment> {
  const body = new Y.Doc().getXmlFragment("body");
  await writeMarkdownToBody(markdown, body, context);
  return body;
}

describe("Markdown の取り込み", () => {
  it("本文に無い深さの見出しは、一番深い見出しにする", async () => {
    const body = await bodyFromMarkdown("#### 4 段目\n\n###### 6 段目\n", importContext({}));
    expect(bodyToMarkdown(body, exportContext)).toBe("### 4 段目\n\n### 6 段目");
  });

  it("見出し・書式・チェックリスト・表・コードを本文にする", async () => {
    const body = await bodyFromMarkdown("# 見出し\n\n本文 **太字**\n\n- [x] 済み\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nconst x = 1;\n```\n", importContext({}));
    expect(bodyPlainText(body)).toBe("見出し\n本文 太字\n済み\na\nb\n1\n2\nconst x = 1;");
    expect(body.toArray().map((node) => (node as Y.XmlElement).nodeName)).toEqual(["heading", "paragraph", "taskList", "table", "codeBlock"]);
  });

  it("一緒に渡されたファイルを指す画像とリンクは、添付にする", async () => {
    const photo = { attachmentId: "a".repeat(32), fileName: "海 (1).png", mimeType: "image/png", byteLength: 3 };
    const report = { attachmentId: "b".repeat(32), fileName: "report.pdf", mimeType: "application/pdf", byteLength: 9 };
    const context = importContext({ "images/海 (1).png": photo, "files/report.pdf": report });
    const body = await bodyFromMarkdown("前の文 ![海](images/%E6%B5%B7%20%281%29.png) 後の文\n\n[report.pdf](files/report.pdf)\n", context);
    expect(body.toArray().map((node) => (node as Y.XmlElement).nodeName)).toEqual(["paragraph", "attachmentImage", "paragraph", "attachmentFile"]);
    expect(bodyAttachments(body).map((attachment) => attachment.id)).toEqual([photo.attachmentId, report.attachmentId]);
    expect(bodyPlainText(body)).toBe("前の文\n後の文");
  });

  it("外の URL の画像は読み込まず、リンクの文字にする", async () => {
    const context = importContext({});
    const body = await bodyFromMarkdown("![追跡用の画像](https://tracker.example/pixel.png)\n", context);
    expect(bodyAttachments(body)).toEqual([]);
    expect(bodyPlainText(body)).toBe("追跡用の画像");
    expect(context.requested).toEqual([]);
    expect(bodyToMarkdown(body, exportContext).trim()).toBe("[追跡用の画像](https://tracker.example/pixel.png)");
  });

  it("このメモ帳にあるメモへのリンクはリンクのノードにし、無いメモへのリンクは文字だけを残す", async () => {
    const markdown = `[ある](sedum-note://note/${NOTE_ID}) と [無い](sedum-note://note/${"f".repeat(32)})\n`;
    const body = await bodyFromMarkdown(markdown, importContext({}, [NOTE_ID]));
    expect(bodyToMarkdown(body, exportContext).trim()).toBe(`[リンク先のメモ](sedum-note://note/${NOTE_ID}) と 無い`);
  });
});

describe("Markdown の書き出し", () => {
  it("書き出した Markdown を取り込むと、同じ Markdown に戻る", async () => {
    const photo = { attachmentId: "a".repeat(32), fileName: "beach.png", mimeType: "image/png", byteLength: 3 };
    const markdown = [
      "## 持ち物", "", "パスポートは**不要**。", "", "![beach.png](attachments/beach.png)", "", "- [ ] 日焼け止め", "- [x] 充電器", "",
      "1. 一つ目", "2. 二つ目", "", "> 引用", "", "```ts", "const answer: number = 42;", "```", "",
    ].join("\n");
    const body = await bodyFromMarkdown(markdown, importContext({ "attachments/beach.png": photo }));
    const exported = bodyToMarkdown(body, { attachmentHref: ({ fileName }: { fileName: string }) => `attachments/${fileName}`, noteTitle: () => null });
    const reimported = await bodyFromMarkdown(exported, importContext({ "attachments/beach.png": photo }));
    expect(bodyToMarkdown(reimported, { attachmentHref: ({ fileName }: { fileName: string }) => `attachments/${fileName}`, noteTitle: () => null })).toBe(exported);
    expect(exported).toContain("![beach.png](attachments/beach.png)");
    expect(exported).toContain("- [x] 充電器");
    expect(exported).toContain("const answer: number = 42;");
  });
});
