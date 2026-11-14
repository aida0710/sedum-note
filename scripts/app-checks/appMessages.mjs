// 確認の道具が画面の部品を文言で探すときに使う、アプリの文言（src/ui/i18n/messages.*.ts）。
// 文言を道具に書き写さず、アプリと同じキーで引く。画面の文言を言い換えても、道具を直さずに済む。
// .ts をそのまま読むので、型の取り除きが既定で入った Node（22.18 以降）で動かす。

import { englishMessages } from "../../src/ui/i18n/messages.en.ts";
import { japaneseMessages } from "../../src/ui/i18n/messages.ja.ts";

const catalogues = { ja: japaneseMessages, en: englishMessages };

function messageTemplate(language, key) {
  const template = catalogues[language][key];
  // 消えたキーを引いたときは、部品が見つからないまま待ち続けるより先に、どのキーかを出して止める。
  if (template === undefined) throw new Error(`文言のキーがありません: ${key}`);
  return template;
}

function fillParameters(template, parameters) {
  return template.replace(/\{(\w+)\}/g, (placeholder, name) => (name in parameters ? String(parameters[name]) : placeholder));
}

// 道具が動かす日本語の画面（UI_LOCALE は ja-JP）の文言。アプリの translate と同じく {name} を parameters で埋める。
export function translate(key, parameters = {}) {
  return fillParameters(messageTemplate("ja", key), parameters);
}

// 英語の画面の文言。
export function translateToEnglish(key, parameters = {}) {
  return fillParameters(messageTemplate("en", key), parameters);
}

// 差し込みの値が決まらない文言（「接続できました。モデルを{count}個…」など）に当たる正規表現。差し込みの所は何にでも当たる。
export function messagePattern(key) {
  const escaped = messageTemplate("ja", key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/\\\{\w+\\\}/g, ".*"));
}
