import { describe, expect, it } from "vitest";
import type { UpdateCheckResult } from "./availableUpdate";
import { type UpdateCheckState, UpdateChecks } from "./updateChecks";

const CHECKED_AT = new Date("2026-11-13T12:50:00Z");

// 問い合わせの答えを、試験の側で好きな順に返せるようにする。
function updateChecksWithPendingAnswers() {
  const answers: Array<(result: UpdateCheckResult) => void> = [];
  const shown: UpdateCheckState[] = [];
  const checks = new UpdateChecks({
    query: () => new Promise((resolve) => answers.push(resolve)),
    now: () => CHECKED_AT,
    show: (state) => shown.push(state),
  });
  return { checks, answers, latest: () => shown.at(-1) };
}

describe("新しいバージョンを確かめた状態", () => {
  it("確かめている間は確かめている最中と出し、答えが返ったら、結果と確かめた時刻を出す", async () => {
    const { checks, answers, latest } = updateChecksWithPendingAnswers();

    const checking = checks.check();
    expect(latest()).toEqual({ checking: true, last: null });
    answers[0]!({ kind: "upToDate" });
    await checking;

    expect(latest()).toEqual({ checking: false, last: { result: { kind: "upToDate" }, checkedAt: CHECKED_AT } });
  });

  it("もう一度確かめている間も、前の結果は残し、新しい答えが返ったら置き換える", async () => {
    const { checks, answers, latest } = updateChecksWithPendingAnswers();
    const first = checks.check();
    answers[0]!({ kind: "failed" });
    await first;

    const second = checks.check();
    expect(latest()).toEqual({ checking: true, last: { result: { kind: "failed" }, checkedAt: CHECKED_AT } });
    answers[1]!({ kind: "upToDate" });
    await second;

    expect(latest()?.last?.result).toEqual({ kind: "upToDate" });
  });

  it("確かめている間にもう一度確かめたら、先の確認の答えがあとから返っても、あとの確認の結果を残す", async () => {
    const { checks, answers, latest } = updateChecksWithPendingAnswers();

    const first = checks.check();
    const second = checks.check();
    answers[1]!({ kind: "upToDate" });
    await second;
    answers[0]!({ kind: "failed" });
    await first;

    expect(latest()).toEqual({ checking: false, last: { result: { kind: "upToDate" }, checkedAt: CHECKED_AT } });
  });

  it("消したあとに、確かめている最中だった確認の答えが返っても、出さない", async () => {
    const { checks, answers, latest } = updateChecksWithPendingAnswers();

    const checking = checks.check();
    checks.clear();
    answers[0]!({ kind: "upToDate" });
    await checking;

    expect(latest()).toEqual({ checking: false, last: null });
  });
});
