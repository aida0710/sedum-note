// 件数の分かる、時間のかかる処理の進み具合。画面は「120/2,000件」と細い棒で出す（ui/shared/ProgressStatus.tsx）。

export type TaskProgress = {
  // 済んだ件数。
  done: number;
  // 全部の件数。
  total: number;
};

export type ReportProgress = (progress: TaskProgress) => void;
