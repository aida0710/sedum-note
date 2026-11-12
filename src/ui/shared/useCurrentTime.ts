// 今の時刻を、決めた間隔で読み直す hook。「期限切れ」のように、時間がたつと表示が変わる所で使う。

import { useEffect, useState } from "react";

export function useCurrentTime(refreshIntervalMilliseconds: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), refreshIntervalMilliseconds);
    return () => clearInterval(timer);
  }, [refreshIntervalMilliseconds]);
  return now;
}
