// AI のチャットの答えの文を、Markdown として表示する（見出し・太字・箇条書き・チェックリスト・表・コード・引用・リンク）。
//
// 答えの文は、AI が読んだメモに書かれた文に左右されるので、信用しない。HTML に変えて差し込まず、marked で字句に分けたものから
// React の要素を作る（HTML の字句は、そのままの文字として出す）。リンクは Web のページとメールだけを、外のブラウザで開く。
// 画像は読み込まない（URL に本文を載せて外へ送れてしまうのと、「データの扱い」に書いた通信の外になるため）。代わりに、
// 画像の説明の文をリンクとして出す。受け取っている途中の、閉じていないコードや表も、そのときまでの形で出す。

import { Lexer, type Token, type Tokens } from "marked";
import { type ReactNode, useMemo } from "react";
import { openableWebLinkUrl } from "../shared/openableWebLinkUrl";
import { openExternalUrl } from "../platform/openExternalUrl";

// 改行 1 つでも、行を分けて出す（AI の答えは、段落の中の改行も見た目の改行のつもりで書かれることが多い）。
const LEXER_OPTIONS = { gfm: true, breaks: true };

function WebLink({ href, children }: { href: string; children: ReactNode }) {
  const url = openableWebLinkUrl(href);
  if (url === null) {
    return <>{children}</>;
  }
  return (
    <a href={url} onClick={(event) => {
      event.preventDefault();
      void openExternalUrl(url);
    }}>{children}</a>
  );
}

function inlineNodes(tokens: Token[] | undefined): ReactNode[] {
  return (tokens ?? []).map((token, index) => <InlineToken key={index} token={token} />);
}

function InlineToken({ token }: { token: Token }): ReactNode {
  switch (token.type) {
    case "strong":
      return <strong>{inlineNodes(token.tokens)}</strong>;
    case "em":
      return <em>{inlineNodes(token.tokens)}</em>;
    case "del":
      return <del>{inlineNodes(token.tokens)}</del>;
    case "codespan":
      return <code>{token.text}</code>;
    case "br":
      return <br />;
    case "link":
      return <WebLink href={token.href}>{inlineNodes(token.tokens)}</WebLink>;
    case "image":
      return <WebLink href={token.href}>{token.text || token.href}</WebLink>;
    case "text":
      return token.tokens ? <>{inlineNodes(token.tokens)}</> : token.text;
    case "escape":
    case "html":
      return token.text;
    default:
      return "raw" in token ? String(token.raw) : null;
  }
}

function ListItem({ item }: { item: Tokens.ListItem }) {
  // チェックリストの印は、項目の checked から出す（字句の checkbox は飛ばす）。
  const contents = item.tokens.filter((token) => token.type !== "checkbox");
  return (
    <li className={item.task ? "ai-markdown-task" : undefined}>
      {item.task && <input type="checkbox" checked={item.checked ?? false} disabled readOnly />}
      {item.loose ? blockNodes(contents) : contents.map((token, index) => (token.type === "text" ? <InlineToken key={index} token={token} /> : <BlockToken key={index} token={token} />))}
    </li>
  );
}

function blockNodes(tokens: Token[]): ReactNode[] {
  return tokens.map((token, index) => <BlockToken key={index} token={token} />);
}

function BlockToken({ token }: { token: Token }): ReactNode {
  switch (token.type) {
    case "space":
    case "def":
      return null;
    case "heading": {
      const Heading = `h${Math.min(Math.max(token.depth, 1), 6)}` as "h1";
      return <Heading>{inlineNodes(token.tokens)}</Heading>;
    }
    case "paragraph":
      return <p>{inlineNodes(token.tokens)}</p>;
    case "text":
      return <p>{token.tokens ? inlineNodes(token.tokens) : token.text}</p>;
    case "code":
      return <pre><code>{token.text}</code></pre>;
    case "blockquote":
      return <blockquote>{blockNodes(token.tokens ?? [])}</blockquote>;
    case "hr":
      return <hr />;
    case "list": {
      const items = (token as Tokens.List).items.map((item, index) => <ListItem key={index} item={item} />);
      return token.ordered ? <ol start={typeof token.start === "number" ? token.start : undefined}>{items}</ol> : <ul>{items}</ul>;
    }
    case "table": {
      const table = token as Tokens.Table;
      const align = (index: number) => table.align[index] ?? undefined;
      return (
        <div className="ai-markdown-table">
          <table>
            <thead>
              <tr>{table.header.map((cell, index) => <th key={index} style={{ textAlign: align(index) }}>{inlineNodes(cell.tokens)}</th>)}</tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>{row.map((cell, index) => <td key={index} style={{ textAlign: align(index) }}>{inlineNodes(cell.tokens)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "html":
      return <p>{token.text}</p>;
    default:
      return "raw" in token ? <p>{String(token.raw)}</p> : null;
  }
}

export function AiMarkdown({ text }: { text: string }) {
  // 受け取っている間は文が届くたびに描き直すので、この文が変わったときだけ字句に分け直す（ほかの発言の文は分け直さない）。
  const tokens = useMemo(() => new Lexer(LEXER_OPTIONS).lex(text), [text]);
  return <div className="ai-message-text ai-markdown">{blockNodes(tokens)}</div>;
}
