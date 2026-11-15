// 自作アプリのドキュメントのサイトの設定。製品の .vitepress/config.ts は、名前・リンク・目次だけを渡して
// defineDocsConfig の結果を返す。日本語を既定（root）にし、英語版があれば /en/ に置く。
import { defineConfig, type DefaultTheme, type HeadConfig, type UserConfig } from "vitepress";

type MarkdownIt = Parameters<NonNullable<NonNullable<UserConfig["markdown"]>["config"]>>[0];

export type DocsLocaleContent = {
  description: string;
  nav: DefaultTheme.NavItem[];
  sidebar: DefaultTheme.Sidebar;
};

export type DocsSiteOptions = DocsLocaleContent & {
  // サイトと上部のバーに出す名前。
  name: string;
  // https://github.com/<持ち主>/<リポジトリ>
  repository: string;
  // サイトを置くパス（/<リポジトリ>/ など）。
  base: string;
  // 公開したサイトの URL（末尾の / まで）。sitemap と og:image に使う。
  siteUrl: string;
  // public の中の画像。SNS で共有したときの画像と、上部のバーの印とファビコン。
  ogImage: string;
  logo: string;
  favicon: { path: string; type: string };
  // ブラウザの上の帯の色。製品の色に合わせる。
  themeColor: string;
  footer: DefaultTheme.Footer;
  english?: DocsLocaleContent;
  // 製品だけが使う Markdown の書き方（図など）。
  markdown?: (md: MarkdownIt) => void;
};

const JAPANESE_LABELS = {
  outlineTitle: "このページの内容",
  lastUpdatedText: "最終更新",
  docFooter: { prev: "前のページ", next: "次のページ" },
  darkModeSwitchLabel: "表示",
  lightModeSwitchTitle: "ライトに切り替える",
  darkModeSwitchTitle: "ダークに切り替える",
  sidebarMenuLabel: "メニュー",
  returnToTopLabel: "ページの先頭へ",
  langMenuLabel: "言語",
  notFound: { title: "ページが見つかりません", quote: "URL が変わったか、ページが無くなりました。", linkText: "トップへ戻る" },
} satisfies DefaultTheme.Config;

const JAPANESE_SEARCH_TRANSLATIONS = {
  button: { buttonText: "検索", buttonAriaLabel: "検索" },
  modal: {
    displayDetails: "詳しく表示",
    resetButtonTitle: "検索をクリア",
    backButtonTitle: "検索を閉じる",
    noResultsText: "見つかりませんでした",
    footer: { selectText: "選ぶ", navigateText: "移動", closeText: "閉じる" },
  },
};

// 表を div.docs-table で包む。角と枠は包みに付け、はみ出す表は包みの中で横に動かす（template.css）。
function wrapTables(md: MarkdownIt): void {
  md.renderer.rules.table_open = (tokens, index, options, _env, self) => `<div class="docs-table">${self.renderToken(tokens, index, options)}`;
  md.renderer.rules.table_close = (tokens, index, options, _env, self) => `${self.renderToken(tokens, index, options)}</div>`;
}

export function defineDocsConfig(site: DocsSiteOptions): UserConfig<DefaultTheme.Config> {
  const editLink = (text: string) => ({ pattern: `${site.repository}/edit/main/pages/:path`, text });
  const sharingHead = (description: string): HeadConfig[] => [
    ["meta", { property: "og:title", content: site.name }],
    ["meta", { property: "og:description", content: description }],
  ];
  return defineConfig({
    title: site.name,
    description: site.description,
    lang: "ja",
    base: site.base,
    cleanUrls: true,
    lastUpdated: true,
    sitemap: { hostname: site.siteUrl },
    markdown: {
      config: (md) => {
        wrapTables(md);
        site.markdown?.(md);
      },
    },
    head: [
      ["meta", { name: "theme-color", content: site.themeColor }],
      ["meta", { property: "og:type", content: "website" }],
      ...sharingHead(site.description),
      ["meta", { property: "og:image", content: new URL(site.ogImage.replace(/^\//, ""), site.siteUrl).href }],
      ["meta", { name: "twitter:card", content: "summary_large_image" }],
      ["link", { rel: "icon", href: `${site.base}${site.favicon.path.replace(/^\//, "")}`, type: site.favicon.type }],
    ],
    locales: {
      root: {
        label: "日本語",
        lang: "ja",
        themeConfig: { ...JAPANESE_LABELS, nav: site.nav, sidebar: site.sidebar, editLink: editLink("このページを編集") },
      },
      ...(site.english && {
        en: {
          label: "English",
          lang: "en",
          link: "/en/",
          description: site.english.description,
          head: sharingHead(site.english.description),
          themeConfig: {
            nav: site.english.nav,
            sidebar: site.english.sidebar,
            editLink: editLink("Edit this page"),
            outlineTitle: "On this page",
            lastUpdatedText: "Last updated",
            docFooter: { prev: "Previous page", next: "Next page" },
          },
        },
      }),
    },
    themeConfig: {
      logo: site.logo,
      siteTitle: site.name,
      search: { provider: "local", options: { locales: { root: { translations: JAPANESE_SEARCH_TRANSLATIONS } } } },
      socialLinks: [{ icon: "github", link: site.repository }],
      footer: site.footer,
    },
  });
}
