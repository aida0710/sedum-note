// 画面の言語で書いた文をそのまま利用者に見せる失敗。画面の層で起きるもの
// （添付が大きすぎる、など）に使う。コアの失敗は describeError が文に直す。

export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}
