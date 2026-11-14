// 最悪のデータ（多い・長い・空・絵文字）を、作ったばかりの vault に repository から直に入れる。
// 画面の操作で 500 件を作ると時間がかかるので、アプリの部品の props から repository を取り出して書く（appInternals.mjs）。
// 総点検（2026-11-13、visual-mobile-worstcase）の s3-seed-worst.mjs を、見た目の道具に移したもの。

import { exposeApp, exposeParagraphWriter, navigate } from "./appInternals.mjs";
import { pasteMarkdown, placeCursorAtEnd } from "./appOperations.mjs";

export const WORST_CASE_TEXT = {
  longTitleJa: "とても長い題のメモです。左の列やタブや一覧やコマンドパレットや検索結果でどう切れるかを確かめるために、わざと百文字くらいの題を付けてみました。まだ続きます。これでおよそ百文字。",
  longTitleAscii: "Averyveryverylongtitlewithoutanyspaces_0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789xyz",
  emojiTitle: "🍣🍜🍙👨‍👩‍👧‍👦🏳️‍🌈🇯🇵 絵文字だらけの題 🎉🎉🎉🔥🔥🔥✨✨✨🙇‍♂️🧑🏽‍💻",
  longNotebookJa: "とても長いノートブックの名前を付けてみたらどこまで表示されるのかを確かめるための名前です",
  longNotebookAscii: "VeryLongNotebookNameWithoutAnySpacesToCheckOverflowBehavior_1234567890",
  longTagJa: "とても長いタグの名前がここに入るとどうなるかを確かめるためのタグ",
  longTagAscii: "averyveryverylongtagwithoutanyspaces_1234567890abcdefghijklmnop",
  longChatTitle: "とても長い会話の題がどう切れるかを見るための、長い長い会話の題です。まだ続きます",
};

// 数は、利用者のメモ帳で起こりうる多さの上の方（2026-11-13 の点検で崩れが見つかった量）。
const COUNTS = { notebooks: 80, nestingDepth: 6, notes: 488, searchHits: 300, tags: 100, properties: 12, trashed: 200, headings: 80, tableColumns: 15, savedChats: 12, chatTurns: 20 };

async function seedRecords(page) {
  await exposeParagraphWriter(page);
  return page.evaluate(async ({ text, counts }) => {
    const repository = window.__visualAudit.repository;
    const addParagraphs = window.__visualAuditSeed.addParagraphs;
    const ids = { notebooks: [], notes: {} };
    let parent = null;
    for (let depth = 1; depth <= counts.nestingDepth; depth += 1) {
      const notebook = await repository.createNotebook(`入れ子 ${depth} 段目のノートブック`, parent);
      ids.notebooks.push(notebook.id);
      parent = notebook.id;
    }
    ids.deepestNotebook = parent;
    ids.longNotebookJa = (await repository.createNotebook(text.longNotebookJa)).id;
    ids.notebooks.push(ids.longNotebookJa, (await repository.createNotebook(text.longNotebookAscii)).id);
    for (let index = 1; ids.notebooks.length < counts.notebooks; index += 1) {
      ids.notebooks.push((await repository.createNotebook(`ノートブック ${String(index).padStart(2, "0")}`)).id);
    }
    ids.propertyNotebook = ids.notebooks[8];
    const propertyTypes = ["text", "number", "date", "select", "checkbox"];
    const definitions = [];
    for (let index = 0; index < counts.properties; index += 1) {
      const type = propertyTypes[index % propertyTypes.length];
      definitions.push(await repository.saveNotebookProperty(ids.propertyNotebook, {
        name: index === 0 ? "とても長いプロパティの名前を付けたときの表示" : `プロパティ ${index + 1}`,
        type, options: type === "select" ? ["未着手", "進行中", "完了", "とても長い選択肢の名前を付けた場合"] : [], order: index,
      }));
    }
    for (let index = 0; index < counts.notes; index += 1) {
      const title = index < counts.searchHits ? `検索テスト ${index + 1} 件目のメモ` : `メモ ${index + 1}`;
      const note = await repository.createNote({ title, notebookIds: [ids.notebooks[index % ids.notebooks.length]], pinned: index % 97 === 0 });
      addParagraphs(note.id, [`${index + 1} 件目の本文。一覧の要約に出る文です。`]);
    }
    const special = async (key, changes, paragraphs = []) => {
      const note = await repository.createNote(changes);
      if (paragraphs.length) addParagraphs(note.id, paragraphs);
      ids.notes[key] = note.id;
    };
    await special("longTitleJa", { title: text.longTitleJa, notebookIds: [ids.longNotebookJa] }, ["長い題のメモの本文。"]);
    await special("longTitleAscii", { title: text.longTitleAscii, notebookIds: [ids.deepestNotebook] }, ["ASCII の長い題のメモ。"]);
    await special("emojiTitle", { title: text.emojiTitle, notebookIds: [ids.deepestNotebook] }, ["絵文字の題。🍣"]);
    await special("emptyTitle", { title: "", notebookIds: [ids.deepestNotebook] }, ["題が空のメモの本文です。"]);
    const tags = [`#${text.longTagJa}`, `#${text.longTagAscii}`];
    for (let index = 1; tags.length < counts.tags; index += 1) tags.push(`#タグ${String(index).padStart(3, "0")}`);
    await special("manyTags", { title: `タグ ${counts.tags} 個のメモ`, notebookIds: [ids.deepestNotebook] }, [tags.join(" ")]);
    await special("headings", { title: `見出し ${counts.headings} 個（目次）`, notebookIds: [ids.deepestNotebook] });
    await special("wideTable", { title: `列が ${counts.tableColumns} の表`, notebookIds: [ids.deepestNotebook] });
    await special("longLines", { title: "長い URL・改行の無い行・長いコード", notebookIds: [ids.deepestNotebook] });
    await special("properties", { title: "プロパティの多いメモ", notebookIds: [ids.propertyNotebook] }, [`プロパティを ${counts.properties} 個持つメモ。`]);
    for (const [index, definition] of definitions.entries()) {
      const value = { number: 1234567890, checkbox: true, date: "2026-11-13", select: "とても長い選択肢の名前を付けた場合" }[definition.type]
        ?? `とても長いプロパティの値を入れたときにどう折り返すかを見るための文 ${index}`;
      await repository.setNotePropertyValue(ids.notes.properties, definition.id, value);
    }
    for (let index = 0; index < counts.trashed; index += 1) {
      await repository.createNote({ title: `ゴミ箱のメモ ${index + 1}`, trashedAt: new Date(Date.now() - index * 60_000).toISOString() });
    }
    await repository.flush();
    return ids;
  }, { text: WORST_CASE_TEXT, counts: COUNTS });
}

async function pasteIntoNote(page, noteId, markdown) {
  await navigate(page, "openNote", noteId);
  await page.locator(".ProseMirror").first().waitFor();
  await placeCursorAtEnd(page);
  await pasteMarkdown(page, markdown);
}

function headingsMarkdown() {
  const lines = [];
  for (let index = 1; index <= COUNTS.headings; index += 1) {
    const longSuffix = index % 10 === 0 ? "：とても長い見出しの文字を入れて目次の幅で切れるかを見る" : "";
    lines.push(`${index % 3 === 1 ? "##" : "###"} 見出し ${index}${longSuffix}`, `見出し ${index} の本文。`);
  }
  return lines.join("\n\n");
}

function wideTableMarkdown() {
  const columns = Array.from({ length: COUNTS.tableColumns }, (_, index) => `列${index + 1}の見出し`);
  const rows = Array.from({ length: 6 }, (_, row) => `| ${columns.map((_, column) => (column === 3 ? "とても長いセルの文字を入れてみる" : `値 ${row + 1}-${column + 1}`)).join(" | ")} |`);
  return [`| ${columns.join(" | ")} |`, `|${columns.map(() => "---").join("|")}|`, ...rows].join("\n");
}

function longLinesMarkdown() {
  const longUrl = `https://example.com/${"very-long-path-segment/".repeat(12)}?query=${"x".repeat(80)}&utm_source=newsletter`;
  return [
    `長い URL: ${longUrl}`, "",
    `改行の無い行: ${"あいうえおかきくけこ".repeat(30)}`, "",
    `英数字だけの行: ${"abcdefghij0123456789".repeat(20)}`, "",
    "```js",
    `const veryLongVariableNameForTesting = someFunctionCall(argumentNumberOne, argumentNumberTwo, "${"a".repeat(120)}");`,
    "```",
  ].join("\n");
}

// AI を有効にし（モデルの一覧は取ってきた形で入れる。外へはつながない）、長い会話と多くの会話を残す。
async function seedAiChats(page) {
  await exposeApp(page);
  await page.evaluate(async ({ text, counts }) => {
    const settingsModule = await import(`${location.origin}/src/core/vault/aiSettings.ts`);
    const historyModule = await import(`${location.origin}/src/core/vault/aiChatHistory.ts`);
    const { vault } = window.__visualAudit;
    const models = [{ id: "claude-opus-5-5", name: "Claude Opus 5.5", maxOutputTokens: 128000 }, { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", maxOutputTokens: 32000 }];
    await settingsModule.writeAiSettings(vault.localStore, vault.masterKey, { ...settingsModule.DEFAULT_AI_SETTINGS, enabled: true, claude: { apiKey: "visual-audit-not-a-key", model: models[0].id, models } });
    const messages = [];
    for (let index = 0; index < counts.chatTurns; index += 1) {
      const longQuestion = index % 4 === 0 ? "とても長い質問の文を入れて、吹き出しがどこで折り返すかを見ます。".repeat(4) : "";
      messages.push({ role: "user", text: `${index + 1} 回目の質問。${longQuestion}`, attachments: [] });
      const answer = index % 5 === 0
        ? `## 要約\n\n- 1 つ目のやること\n- 2 つ目のやること\n\n\`\`\`ts\nconst veryLongLineInsideAnAnswer = "${"x".repeat(150)}";\n\`\`\`\n\nhttps://example.com/${"long-path/".repeat(15)}`
        : `${index + 1} 回目の答え。${"答えの本文が長く続く場合の折り返しを確かめます。".repeat(index % 3 + 1)}`;
      messages.push({ role: "assistant", parts: [{ kind: "text", text: answer }] });
    }
    const now = new Date().toISOString();
    await historyModule.writeSavedAiChats(vault.localStore, vault.masterKey, [
      { id: "a".repeat(32), title: text.longChatTitle, createdAt: now, updatedAt: now, messages },
      ...Array.from({ length: counts.savedChats }, (_, index) => ({ id: String(index).padStart(32, "b"), title: `残した会話 ${index + 1}`, createdAt: now, updatedAt: now, messages: messages.slice(0, 2) })),
    ]);
  }, { text: WORST_CASE_TEXT, counts: COUNTS });
}

// 最悪のデータを入れ、あとの画面が使う ID を返す。AI の設定と会話は、ロックし直して読み込ませる（呼んだ側で行う）。
export async function fillWorstCaseWorkspace(page) {
  const ids = await seedRecords(page);
  await pasteIntoNote(page, ids.notes.headings, headingsMarkdown());
  await pasteIntoNote(page, ids.notes.wideTable, wideTableMarkdown());
  await pasteIntoNote(page, ids.notes.longLines, longLinesMarkdown());
  await seedAiChats(page);
  return ids;
}
