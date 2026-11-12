import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePluginManifest, type PluginManifest, PluginManifestError } from "./pluginManifest";
import { executePluginModule, inspectPluginModule, MAX_PLUGIN_MODULE_BYTES, PluginModuleError } from "./pluginModule";
import { parsePluginResult, pluginInput, PluginResultError } from "./pluginRun";
import { describePluginSource, fetchPluginPackage, parsePluginSource, PluginFetchError, type PluginRequestSender } from "./pluginSource";
import { moduleReturning, moduleReturningText, moduleWithImport, moduleWithoutFunctions } from "./wasmFixtures";

// リポジトリに置いてある、見本のプラグイン（plugins/text-tools）。
const EXAMPLE_DIRECTORY = "plugins/text-tools";
const exampleManifestText = readFileSync(`${EXAMPLE_DIRECTORY}/sedum-note-plugin.json`, "utf8");
const exampleModule = new Uint8Array(readFileSync(`${EXAMPLE_DIRECTORY}/text-tools.wasm`));
const exampleManifest = parsePluginManifest(exampleManifestText);
const note = { title: "買い物", markdown: "牛乳\n\n卵 と パン", selection: "みかん\nりんご\nみかん" };

const manifestWith = (changes: Record<string, unknown>) => JSON.stringify({ ...JSON.parse(exampleManifestText), ...changes });
const problemOf = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return (error as PluginManifestError).problem;
  }
  return null;
};

describe("プラグインの宣言", () => {
  it("見本のプラグインの宣言を読める", () => {
    expect(exampleManifest).toMatchObject({ id: "text-tools", module: "text-tools.wasm", reads: ["note.selection", "note.body"], writes: ["note.selection", "note.body", "message"] });
    expect(exampleManifest.commands.map((command) => command.id)).toEqual(["sort-lines", "remove-duplicate-lines", "count-characters", "trim-trailing-spaces"]);
  });

  it("決まりに合わない宣言は、理由を付けて断る", () => {
    expect(problemOf(() => parsePluginManifest("{"))).toBe("not_json");
    expect(problemOf(() => parsePluginManifest(manifestWith({ formatVersion: 2 })))).toBe("unsupported_format_version");
    expect(problemOf(() => parsePluginManifest(manifestWith({ id: "Text Tools" })))).toBe("id_invalid");
    expect(problemOf(() => parsePluginManifest(manifestWith({ name: "" })))).toBe("text_missing");
    expect(problemOf(() => parsePluginManifest(manifestWith({ module: "../other.wasm" })))).toBe("module_path_invalid");
    expect(problemOf(() => parsePluginManifest(manifestWith({ module: "https://example.com/a.wasm" })))).toBe("module_path_invalid");
    expect(problemOf(() => parsePluginManifest(manifestWith({ reads: ["note.everything"] })))).toBe("permission_unknown");
    expect(problemOf(() => parsePluginManifest(manifestWith({ commands: [] })))).toBe("commands_invalid");
    expect(problemOf(() => parsePluginManifest(manifestWith({ commands: [{ id: "a-1", title: "A" }, { id: "a-1", title: "B" }] })))).toBe("commands_invalid");
  });
});

describe("プラグインのモジュール", () => {
  it("見本のプラグインは、決まりに合う。選択した行を並べ替え、重なった行を消し、文字数を数える", async () => {
    await expect(inspectPluginModule(exampleModule)).resolves.toBeUndefined();
    const run = async (commandId: string) => parsePluginResult(exampleManifest, await executePluginModule(exampleModule, pluginInput(exampleManifest, commandId, note, "ja")));
    expect(await run("sort-lines")).toEqual({ replaceSelection: "みかん\nみかん\nりんご" });
    expect(await run("remove-duplicate-lines")).toEqual({ replaceSelection: "みかん\nりんご" });
    expect(await run("count-characters")).toEqual({ message: "6 characters, 2 lines" });
    const withSpaces = { ...note, markdown: "牛乳  \n\n- 卵 ^1a-2\t\n![写真](sedum-note://attachment/abc)　" };
    const trimmed = parsePluginResult(exampleManifest, await executePluginModule(exampleModule, pluginInput(exampleManifest, "trim-trailing-spaces", withSpaces, "ja")));
    // 行の中身は変えない。添付へのリンクと、行末のブロックの ID は残る。
    expect(trimmed).toEqual({ replaceBody: "牛乳\n\n- 卵 ^1a-2\n![写真](sedum-note://attachment/abc)" });
  });

  it("プラグインが失敗を返したら、その説明を付けて失敗にする", async () => {
    const output = await executePluginModule(exampleModule, pluginInput(exampleManifest, "no-such-command", note, "ja"));
    expect(() => parsePluginResult(exampleManifest, output)).toThrowError(PluginResultError);
    expect((() => { try { parsePluginResult(exampleManifest, output); } catch (error) { return (error as PluginResultError).detail; } return ""; })()).toBe("unknown command");
  });

  it("外の関数を取り込むモジュール、決まった名前の関数が無いモジュール、大きすぎるモジュールは断る", async () => {
    await expect(inspectPluginModule(moduleWithImport())).rejects.toMatchObject({ problem: "has_imports" });
    await expect(inspectPluginModule(moduleWithoutFunctions())).rejects.toMatchObject({ problem: "exports_missing" });
    await expect(inspectPluginModule(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({ problem: "not_webassembly" });
    await expect(inspectPluginModule(new Uint8Array(MAX_PLUGIN_MODULE_BYTES + 1))).rejects.toMatchObject({ problem: "too_large" });
    await expect(executePluginModule(moduleWithImport(), "{}")).rejects.toBeInstanceOf(PluginModuleError);
  });

  it("メモリの外を指す出力、大きすぎる出力、UTF-8 でない出力は受け取らない", async () => {
    const outsideMemory = moduleReturningText("{}", { claimedPointer: 0x7fff_0000 });
    await expect(executePluginModule(outsideMemory, "{}")).rejects.toMatchObject({ problem: "output_out_of_range" });
    const tooLong = moduleReturningText("{}", { claimedLength: 0xffff_ffff });
    await expect(executePluginModule(tooLong, "{}")).rejects.toMatchObject({ problem: "output_too_large" });
    const notText = moduleReturning({ output: new Uint8Array([0xff, 0xfe, 0xfd]) });
    await expect(executePluginModule(notText, "{}")).rejects.toMatchObject({ problem: "output_not_text" });
  });
});

describe("プラグインの入力と出力", () => {
  const manifest = (changes: Partial<PluginManifest>): PluginManifest => ({ ...exampleManifest, ...changes });

  it("宣言で「読む」としたものだけを渡す", () => {
    const input = JSON.parse(pluginInput(manifest({ reads: ["note.selection"] }), "sort-lines", note, "ja")) as { note: object; command: string; locale: string };
    expect(input).toMatchObject({ formatVersion: 1, command: "sort-lines", locale: "ja" });
    expect(input.note).toEqual({ selection: note.selection });
    expect(JSON.parse(pluginInput(manifest({ reads: [] }), "sort-lines", note, "ja"))).toMatchObject({ note: {} });
  });

  it("宣言で「書く」としていない指示は捨てる。JSON でない出力は失敗にする", async () => {
    const greedy = moduleReturningText(JSON.stringify({ replaceBody: "全部を書き換える", setTitle: "別の題", message: "済み", replaceSelection: 5 }));
    const output = await executePluginModule(greedy, "{}");
    expect(parsePluginResult(manifest({ writes: ["message"] }), output)).toEqual({ message: "済み" });
    expect(parsePluginResult(manifest({ writes: ["note.body", "note.title", "note.selection"] }), output)).toEqual({ replaceBody: "全部を書き換える", setTitle: "別の題" });
    expect(() => parsePluginResult(exampleManifest, "これは JSON ではない")).toThrowError(PluginResultError);
  });
});

describe("プラグインの取り込み元", () => {
  it("owner/repository の形と、GitHub の URL の形を読む", () => {
    expect(parsePluginSource("aida0710/sedum-note/plugins/text-tools")).toEqual({ owner: "aida0710", repository: "sedum-note", directory: "plugins/text-tools", ref: null });
    expect(parsePluginSource(" someone/plugin@v1.2.0 ")).toEqual({ owner: "someone", repository: "plugin", directory: "", ref: "v1.2.0" });
    expect(parsePluginSource("https://github.com/someone/plugin")).toEqual({ owner: "someone", repository: "plugin", directory: "", ref: null });
    expect(parsePluginSource("https://github.com/aida0710/sedum-note/tree/main/plugins/text-tools")).toEqual({ owner: "aida0710", repository: "sedum-note", directory: "plugins/text-tools", ref: "main" });
    expect(describePluginSource(parsePluginSource("someone/plugin/tools@main"))).toBe("someone/plugin/tools@main");
    for (const invalid of ["", "only-owner", "owner/repo/../secret", "owner/repo@", "https://example.com/owner/repo", "owner/re po"]) {
      expect(() => parsePluginSource(invalid), invalid).toThrowError(PluginFetchError);
    }
  });

  const COMMIT_SHA = "0123456789abcdef0123456789abcdef01234567";

  // GitHub の代わり。聞かれた URL を覚えて、決まった応答を返す。
  function fakeGitHub(files: Record<string, string | Uint8Array>): { send: PluginRequestSender; requests: Array<{ url: string; headers: Record<string, string> }> } {
    const requests: Array<{ url: string; headers: Record<string, string> }> = [];
    const send: PluginRequestSender = async (url, headers) => {
      requests.push({ url, headers });
      const body = files[url];
      return body === undefined ? new Response(null, { status: 404 }) : new Response(body as string | Uint8Array<ArrayBuffer>);
    };
    return { send, requests };
  }

  const RAW = `https://raw.githubusercontent.com/aida0710/sedum-note/${COMMIT_SHA}/plugins/text-tools`;

  it("ブランチの名前をコミットに直してから、そのコミットの宣言とモジュールを取ってくる", async () => {
    const { send, requests } = fakeGitHub({
      "https://api.github.com/repos/aida0710/sedum-note/commits/HEAD": `${COMMIT_SHA}\n`,
      [`${RAW}/sedum-note-plugin.json`]: exampleManifestText,
      [`${RAW}/text-tools.wasm`]: exampleModule,
    });
    const fetched = await fetchPluginPackage(parsePluginSource("aida0710/sedum-note/plugins/text-tools"), send);
    expect(fetched.commitSha).toBe(COMMIT_SHA);
    expect(fetched.manifest.id).toBe("text-tools");
    expect(fetched.moduleBytes).toEqual(exampleModule);
    // GitHub には、SHA だけを返させる指定のほかは、何も付けない。
    expect(requests.map((request) => request.headers)).toEqual([{ Accept: "application/vnd.github.sha" }, {}, {}]);
  });

  it("コミットの SHA を指定したら、GitHub の API には聞かない", async () => {
    const { send, requests } = fakeGitHub({ [`${RAW}/sedum-note-plugin.json`]: exampleManifestText, [`${RAW}/text-tools.wasm`]: exampleModule });
    await fetchPluginPackage(parsePluginSource(`aida0710/sedum-note/plugins/text-tools@${COMMIT_SHA}`), send);
    expect(requests.every((request) => request.url.startsWith("https://raw.githubusercontent.com/"))).toBe(true);
  });

  it("見つからない・回数の上限・決まりに合わないモジュールは、理由を付けて失敗にする", async () => {
    await expect(fetchPluginPackage(parsePluginSource("no/such"), fakeGitHub({}).send)).rejects.toMatchObject({ problem: "not_found" });
    await expect(fetchPluginPackage(parsePluginSource("any/repo"), async () => new Response(null, { status: 403 }))).rejects.toMatchObject({ problem: "rate_limited" });
    const withImport = fakeGitHub({ [`${RAW}/sedum-note-plugin.json`]: exampleManifestText, [`${RAW}/text-tools.wasm`]: moduleWithImport() });
    await expect(fetchPluginPackage(parsePluginSource(`aida0710/sedum-note/plugins/text-tools@${COMMIT_SHA}`), withImport.send)).rejects.toMatchObject({ problem: "has_imports" });
  });
});
