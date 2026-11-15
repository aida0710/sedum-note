import { withBase } from "vitepress";

// サイトの中のパス（/ で始まる）に base を付ける。外の URL と ./ から書いたパスはそのまま返す。
export function siteLink(path: string): string {
  return path.startsWith("/") ? withBase(path) : path;
}
