// CSS のファイルを import() で読み込めるようにする型の宣言（中身は Vite がスタイルとして差し込む）。
declare module "*.css";

// 末尾に ?url を付けて import すると、そのファイルを配る URL が返る（Vite の機能）。
declare module "*?url" {
  const url: string;
  export default url;
}
