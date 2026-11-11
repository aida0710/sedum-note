#!/bin/sh
# CI の Linux のビルド用のイメージ（.github/ci-images/linux-build.Dockerfile）の中でコマンドを流す。
# WebKitGTK などの依存はイメージに入っているので、ランナーの上で apt を使わずに済む。
# Node と Rust はランナーに入っているものを使う（ホームと、道具の置き場所をコンテナに見せる）。
# ランナーの利用者の権限で動かすので、作ったファイルを後の手順（キャッシュ、成果物の保存）が扱える。
# 使い方: scripts/ci/in-linux-image.sh <コマンド> [引数...]   イメージは環境変数 LINUX_BUILD_IMAGE で渡す。
set -eu
node_bin=$(dirname "$(command -v node)")
exec docker run --rm --user "$(id -u):$(id -g)" --network host \
  -v "$HOME:$HOME" -v /opt/hostedtoolcache:/opt/hostedtoolcache:ro -w "$PWD" \
  -e HOME -e PATH="$node_bin:$HOME/.cargo/bin:/usr/local/bin:/usr/bin:/bin" \
  -e CI -e GITHUB_REF -e GITHUB_EVENT_NAME \
  -e TAURI_SIGNING_PRIVATE_KEY -e TAURI_SIGNING_PRIVATE_KEY_PASSWORD \
  -e APPIMAGE_EXTRACT_AND_RUN=1 \
  "$LINUX_BUILD_IMAGE" "$@"
