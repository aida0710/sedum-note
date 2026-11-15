// 自作アプリのドキュメントのサイトのテーマ。製品の .vitepress/theme/index.ts は、これを読み込んでから
// 製品の色（colors.css）を読み込む。
import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import "@fontsource-variable/noto-sans-jp";
import DocsHome from "./DocsHome.vue";
import "./template.css";

const docsTheme: Theme = {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("DocsHome", DocsHome);
  },
};

export default docsTheme;
