// トップのページ（index.md）の frontmatter の docsHome に書く中身。DocsHome.vue がこの形で読む。
// リンクと画像のパスは、サイトの中なら / から書く（base は DocsHome.vue が付ける）。外の URL はそのまま書く。
// 「HTML」とした文字は、そのまま HTML として出す（<code> や <a href="./guide/install"> を書ける。リンクは ./ から書く）。

export type DocsHomeAction = {
  text: string;
  link: string;
  // いちばん勧める操作。1 つだけにする。
  primary?: boolean;
};

export type DocsHomeImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

export type DocsHomeFeature = {
  title: string;
  link?: string;
  image: string;
  alt: string;
  // HTML
  body: string;
  // 広いカード（1 行に 2 枚）。並びの先頭の 2 枚に使う。
  wide?: boolean;
};

export type DocsHomeSection = {
  heading: string;
  // HTML
  lead?: string;
  // 番号と画像の付いた機能のカード。
  features?: DocsHomeFeature[];
  // 2 列の短い項目の一覧。項目は HTML。
  links?: string[];
  // インストールなどのコマンド 1 行と、その横の小さな注記。
  command?: { code: string; label?: string };
  actions?: DocsHomeAction[];
};

export type DocsHome = {
  name: string;
  // HTML
  lead: string;
  platforms?: { label: string; text: string };
  actions: DocsHomeAction[];
  preview?: DocsHomeImage;
  sections: DocsHomeSection[];
};
