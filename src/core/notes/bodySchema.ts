// 本文の形の版。エディタが扱うノードや書式（src/ui/editor/editorExtensions.ts）を足したら 1 つ上げる。
//
// 古いアプリのエディタは、知らないノードを本文から消し、その削除が同期でほかのデバイスへ広がる。
// それを防ぐため、vault.json にこの版を持たせる。自分より新しい版の vault は開かず、同期もしない。
// 自分の方が新しければ、vault.json の版を引き上げる（以後、古いアプリは更新するまで止まる）。

// 2: 見出しを 6 段までにした。
// 3: ハイライト、文字色、表のセルの背景色を足した。
export const BODY_SCHEMA_VERSION = 3;

export class AppUpdateRequiredError extends Error {
  constructor() {
    super("the notes were written by a newer version of the app");
    this.name = "AppUpdateRequiredError";
  }
}

export function ensureBodySchemaSupported(vaultBodySchema: number, supportedBodySchema: number): void {
  if (vaultBodySchema > supportedBodySchema) {
    throw new AppUpdateRequiredError();
  }
}
