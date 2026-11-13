// AI チャットの、その会話だけの切り替え（使うモデルと、メモを作る・直すときに承認を待つか）。設定は書き換えない。
// 新しい会話を始めたときと、残した会話を開いたときは、設定のとおりに戻す。

import { type AiProvider, type AiSettings, withSelectedModel } from "../../core/vault/aiSettings";

export type ConversationOverrides = {
  // その会話で使うモデルと、それを選んだときのつなぎ先。設定のつなぎ先が変わったら効かせない（別のつなぎ先のモデルなので）。
  // null なら設定のモデル。
  model: { provider: AiProvider; id: string } | null;
  // メモを作る・直すときに、承認を待たずに行うか。null なら設定のとおり。設定で許可していなければ効かせない。
  editsWithoutAsking: boolean | null;
};

export const NO_CONVERSATION_OVERRIDES: ConversationOverrides = { model: null, editsWithoutAsking: null };

// 設定に、その会話だけの切り替えを重ねた、その会話で使う設定。
export function settingsForConversation(settings: AiSettings, overrides: ConversationOverrides): AiSettings {
  const { model, editsWithoutAsking } = overrides;
  const withModel = model !== null && model.provider === settings.provider ? withSelectedModel(settings, model.id) : settings;
  if (editsWithoutAsking === null || settings.permissions.edit === "deny") {
    return withModel;
  }
  return { ...withModel, permissions: { ...withModel.permissions, edit: editsWithoutAsking ? "allow" : "ask" } };
}
