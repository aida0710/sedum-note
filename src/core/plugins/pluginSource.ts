// プラグインを GitHub のリポジトリから取ってくる。仕様は docs/plugins.md の「置き方と取り込み」。
//
// 取り込むときは、ブランチやタグの名前を、その時点のコミット（40 桁の SHA）に直してから、そのコミットのファイルを読む。
// 取り込んだあとは、利用者が「更新を確かめる」を押すまで、GitHub へつながない。GitHub には、どのリポジトリの
// どのファイルを読むかのほかは、何も送らない（認証情報も、アプリや利用者を見分ける値も付けない）。

import { type PluginManifest, PLUGIN_MANIFEST_FILE_NAME, parsePluginManifest } from "./pluginManifest";
import { inspectPluginModule } from "./pluginModule";

export type PluginSource = {
  owner: string;
  repository: string;
  // リポジトリの中の、プラグインのフォルダ（宣言のファイルがある場所）。リポジトリの直下なら空。
  directory: string;
  // ブランチ・タグ・コミットの名前。指定が無ければ null（既定のブランチ）。
  ref: string | null;
};

export type PluginPackage = { manifest: PluginManifest; moduleBytes: Uint8Array; commitSha: string };

export type PluginFetchProblem = "source_invalid" | "not_found" | "rate_limited" | "unreachable" | "unexpected_response";

export class PluginFetchError extends Error {
  readonly problem: PluginFetchProblem;

  constructor(problem: PluginFetchProblem, detail = "") {
    super(`the plugin could not be fetched: ${problem}${detail === "" ? "" : ` (${detail})`}`);
    this.name = "PluginFetchError";
    this.problem = problem;
  }
}

// GitHub への要求を送って、応答を返す。試験では、決まった応答を返すものに差し替える。
export type PluginRequestSender = (url: string, headers: Record<string, string>) => Promise<Response>;

const NAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const GITHUB_URL_PATTERN = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+?))?)?\/?$/;

function sourceOf(parts: { owner: string; repository: string; directory: string; ref: string | null }): PluginSource {
  const directorySegments = parts.directory === "" ? [] : parts.directory.split("/");
  const isValid = NAME_PATTERN.test(parts.owner) && NAME_PATTERN.test(parts.repository) &&
    directorySegments.every((segment) => NAME_PATTERN.test(segment) && segment !== "." && segment !== "..") &&
    (parts.ref === null || /^[A-Za-z0-9._/-]+$/.test(parts.ref));
  if (!isValid) {
    throw new PluginFetchError("source_invalid");
  }
  return parts;
}

// 利用者が入れた取り込み元を読む。書き方は 2 つ。
//   owner/repository[/フォルダ][@ブランチ・タグ・コミット]
//   https://github.com/owner/repository[/tree/ブランチ・タグ/フォルダ]
export function parsePluginSource(text: string): PluginSource {
  const trimmed = text.trim();
  const url = GITHUB_URL_PATTERN.exec(trimmed);
  if (url) {
    return sourceOf({ owner: url[1]!, repository: url[2]!, ref: url[3] ?? null, directory: url[4] ?? "" });
  }
  const [path = "", ref, ...extra] = trimmed.split("@");
  const [owner = "", repository = "", ...directory] = path.split("/");
  if (extra.length > 0 || ref === "") {
    throw new PluginFetchError("source_invalid");
  }
  return sourceOf({ owner, repository, directory: directory.join("/"), ref: ref ?? null });
}

// 取り込み元を、利用者が入れた形（owner/repository/フォルダ@ref）の文字にする。
export function describePluginSource({ owner, repository, directory, ref }: PluginSource): string {
  return `${[owner, repository, ...(directory === "" ? [] : [directory])].join("/")}${ref === null ? "" : `@${ref}`}`;
}

async function send(sendRequest: PluginRequestSender, url: string, headers: Record<string, string> = {}): Promise<Response> {
  let response: Response;
  try {
    response = await sendRequest(url, headers);
  } catch (error) {
    throw new PluginFetchError("unreachable", String(error));
  }
  if (response.status === 404) {
    throw new PluginFetchError("not_found", url);
  }
  // 認証なしの GitHub の API は、同じ IP アドレスから 1 時間に 60 回まで。超えると 403 か 429 が返る。
  if (response.status === 403 || response.status === 429) {
    throw new PluginFetchError("rate_limited");
  }
  if (!response.ok) {
    throw new PluginFetchError("unexpected_response", `${response.status} for ${url}`);
  }
  return response;
}

// ブランチやタグの名前を、いまのコミットの SHA に直す。もう SHA なら、GitHub に聞かない。
async function resolveCommitSha(source: PluginSource, sendRequest: PluginRequestSender): Promise<string> {
  if (source.ref !== null && COMMIT_SHA_PATTERN.test(source.ref)) {
    return source.ref;
  }
  const url = `https://api.github.com/repos/${source.owner}/${source.repository}/commits/${encodeURIComponent(source.ref ?? "HEAD")}`;
  // この Accept を付けると、応答の本文が SHA だけになる。
  const sha = (await (await send(sendRequest, url, { Accept: "application/vnd.github.sha" })).text()).trim();
  if (!COMMIT_SHA_PATTERN.test(sha)) {
    throw new PluginFetchError("unexpected_response", "the commit SHA");
  }
  return sha;
}

function rawFileUrl(source: PluginSource, commitSha: string, path: string): string {
  const fullPath = [...(source.directory === "" ? [] : source.directory.split("/")), ...path.split("/")].map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${source.owner}/${source.repository}/${commitSha}/${fullPath}`;
}

// プラグインの宣言とモジュールを取ってきて、決まりに合うかを確かめる。合わなければ、PluginManifestError か PluginModuleError。
export async function fetchPluginPackage(source: PluginSource, sendRequest: PluginRequestSender): Promise<PluginPackage> {
  const commitSha = await resolveCommitSha(source, sendRequest);
  const manifest = parsePluginManifest(await (await send(sendRequest, rawFileUrl(source, commitSha, PLUGIN_MANIFEST_FILE_NAME))).text());
  const moduleBytes = new Uint8Array(await (await send(sendRequest, rawFileUrl(source, commitSha, manifest.module))).arrayBuffer());
  await inspectPluginModule(moduleBytes);
  return { manifest, moduleBytes, commitSha };
}
