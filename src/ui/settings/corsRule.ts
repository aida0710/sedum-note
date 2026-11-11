// Web 版のために、バケットに入れてもらう CORS の設定。この画面の origin から、条件付き PUT と ETag の読み取りが
// できるようにする。DELETE は、つなぐときに条件付き書き込みを確かめた試しのオブジェクトを消すのに使う。
// アプリは、アプリの側から送るので、この設定は要らない。

export function corsRuleJson(currentOrigin: string): string {
  return JSON.stringify([{
    AllowedOrigins: [currentOrigin],
    AllowedMethods: ["GET", "PUT", "HEAD", "DELETE"],
    AllowedHeaders: ["*"],
    ExposeHeaders: ["ETag"],
    MaxAgeSeconds: 3600,
  }], null, 2);
}
