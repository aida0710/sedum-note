// CSS のファイルを import() で読み込めるようにする型と、Vite が差し込む値の型の宣言（vite/client の全部は取り込まない）。
declare module "*.css";

// 末尾に ?url を付けて import すると、そのファイルを配る URL が返る（Vite の機能）。
declare module "*?url" {
  const url: string;
  export default url;
}

// Vite が差し込む、アプリを配る場所の頭（Web 版は /sedum-note/、アプリと開発サーバーは /）。public の下のファイルを指すのに使う。
interface ImportMetaEnv {
  readonly BASE_URL: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
