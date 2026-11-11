#!/bin/sh
# Linux のアプリ（束ねる前の実行ファイル）を、コンテナの中で組み立てる。
# 成果物は src-tauri/target-linux/release/sedum-note（ホストの target とは分ける）。
# 使い方: scripts/app-checks/linux/build-app.sh [tauri build に足す引数...]
set -eu
repository=$(cd "$(dirname "$0")/../../.." && pwd)
node_directory=$(dirname "$(dirname "$(command -v node)")")
docker build -q -t sedum-note-linux-build:local -f "$repository/scripts/app-checks/linux/build.Dockerfile" "$repository/scripts/app-checks/linux" >/dev/null
mkdir -p "$repository/.cache/linux-build/cargo-home"
# ホストの利用者の権限で動かし、作ったファイルの持ち主を揃える。依存のダウンロードは .cache に残して使い回す。
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$repository:$repository" -v "$node_directory:$node_directory:ro" -w "$repository" \
  -e HOME="$repository/.cache/linux-build" -e CARGO_HOME="$repository/.cache/linux-build/cargo-home" \
  -e CARGO_TARGET_DIR="$repository/src-tauri/target-linux" -e PATH="$node_directory/bin:/opt/cargo/bin:/usr/bin:/bin" \
  sedum-note-linux-build:local npx tauri build --no-bundle "$@"
