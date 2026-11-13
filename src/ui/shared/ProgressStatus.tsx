// 時間のかかる処理の間に出す、何をしているかの文。件数の分かる処理は、件数（「120/2,000件」）と細い棒も出す。
// 件数の分からない処理（鍵の導出、通信 1 回）は、文だけを出す。

import type { TaskProgress } from "../../core/progress/taskProgress";
import { translate } from "../i18n/translate";
import { formatCount } from "./formatCount";

type ProgressStatusProps = {
  // していること（「Markdownを取り込んでいます」）。
  label: string;
  progress: TaskProgress | null;
};

export function ProgressStatus({ label, progress }: ProgressStatusProps) {
  if (progress === null || progress.total === 0) {
    return <span className="progress-status" role="status">{translate("progress.working", { label })}</span>;
  }
  return (
    <span className="progress-status" role="status">
      {translate("progress.counted", { label, done: formatCount(progress.done), total: formatCount(progress.total) })}
      <span className="progress-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
        <span className="progress-bar-fill" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
      </span>
    </span>
  );
}
