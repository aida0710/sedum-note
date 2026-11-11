#!/bin/bash
# デスクトップのアプリを組み立てる（CI の Windows・macOS・Linux で共通）。
# 更新用のファイル（各インストーラーの署名 .sig と、macOS の .app.tar.gz）も作る。署名のキーは
# Actions のシークレットにあり、フォークからの PR には渡らないので、そのときは更新用のファイルを作らない。
# 使い方: scripts/ci/build-app.sh [tauri build に足す引数...]
set -eu
if [ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  npx tauri build "$@"
else
  npx tauri build "$@" --config '{"bundle":{"createUpdaterArtifacts":false}}'
fi
find src-tauri/target -path '*/release/bundle/*' -name '*.sig'
