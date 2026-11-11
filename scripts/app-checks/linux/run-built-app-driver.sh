#!/bin/sh
# build-app.sh で組み立てたアプリを、コンテナの中の Xvfb の上で tauri-driver から操作できるようにする
# （tauri-driver は 127.0.0.1:14444）。アプリが開く口（MCP の窓口など）へ手元からつなげるよう、
# コンテナはホストのネットワークで動かす。アプリのデータはコンテナの中だけに置く（止めると消える）。
# 使い方: scripts/app-checks/linux/run-built-app-driver.sh   終わったら docker rm -f sedum-note-linux-drive
set -eu
repository=$(cd "$(dirname "$0")/../../.." && pwd)
docker rm -f sedum-note-linux-drive >/dev/null 2>&1 || true
docker run -d --name sedum-note-linux-drive --network host \
  -v "$repository/src-tauri/target-linux/release:/app:ro" -v "$HOME/.cargo/bin/tauri-driver:/usr/local/bin/tauri-driver:ro" \
  sedum-note-linux-build:local \
  sh -c 'Xvfb :99 -screen 0 1280x820x24 & export DISPLAY=:99; sleep 2; exec tauri-driver --port 14444 --native-port 14445' >/dev/null
echo "tauri-driver is starting on 127.0.0.1:14444 (container sedum-note-linux-drive); the app is /app/sedum-note"
