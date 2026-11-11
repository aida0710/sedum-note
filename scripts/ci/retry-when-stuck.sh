#!/bin/sh
# 固まることのある導入（apt、ブラウザのダウンロード）を、時間を切って流し、切れたらやり直す。
# GitHub のランナーでは、パッケージの取得がまれに止まったままになる。待ち続けるより、やり直す方が早い。
# 使い方: scripts/ci/retry-when-stuck.sh <1 回の上限の秒数> <コマンド> [引数...]
set -eu
limit_seconds=$1
shift
# 3 回やって駄目なら、取得元の側の障害と見て失敗にする。
for attempt in 1 2 3; do
  if timeout "$limit_seconds" "$@"; then
    exit 0
  fi
  echo "attempt $attempt did not finish within ${limit_seconds}s or failed; trying again" >&2
done
exit 1
