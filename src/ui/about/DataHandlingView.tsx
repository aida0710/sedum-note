// このアプリについて > データの扱い。メモがどこに保存され、何がどこへ送られるか。書いてあることは、コードの動きと
// 合わせる（同期・AI・更新の確認・プラグイン・埋め込み・MCP の通信先を変えたら、ここも直す）。

import { translate, type MessageKey } from "../i18n/translate";

// 見出しと、その下の段落。
const DATA_HANDLING_TOPICS: Array<{ title: MessageKey; paragraphs: MessageKey[] }> = [
  { title: "dataHandling.noTrackingTitle", paragraphs: ["dataHandling.noTracking"] },
  { title: "dataHandling.storageTitle", paragraphs: ["dataHandling.storage", "dataHandling.encryption"] },
  { title: "dataHandling.syncTitle", paragraphs: ["dataHandling.sync"] },
  { title: "dataHandling.aiTitle", paragraphs: ["dataHandling.ai", "dataHandling.aiKey"] },
  { title: "dataHandling.networkTitle", paragraphs: ["dataHandling.updates", "dataHandling.plugins", "dataHandling.embeds", "dataHandling.web", "dataHandling.mcp"] },
  { title: "dataHandling.warrantyTitle", paragraphs: ["dataHandling.warranty"] },
];

export function DataHandlingView() {
  return (
    <section className="settings-section data-handling">
      <h2>{translate("about.dataHandling")}</h2>
      {DATA_HANDLING_TOPICS.map(({ title, paragraphs }) => (
        <div key={title}>
          <h3>{translate(title)}</h3>
          {paragraphs.map((paragraph) => <p key={paragraph}>{translate(paragraph)}</p>)}
        </div>
      ))}
    </section>
  );
}
