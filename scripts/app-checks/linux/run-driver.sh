#!/bin/sh
# Linux 版の deb を入れたコンテナを作り、Xvfb の上で tauri-driver を 127.0.0.1:14444 に開く。
# アプリから手元の S3（127.0.0.1:18333）へつなぐため、コンテナはホストのネットワークで動かす。
# 使い方: scripts/app-checks/linux/run-driver.sh <memo-app の deb>
set -eu
work=$(mktemp -d)
cp "$1" "$work/memo-app.deb"
cp "$HOME/.cargo/bin/tauri-driver" "$work/"
cp "$(dirname "$0")/Dockerfile" "$work/"
docker build -q -t memo-app-linux-drive:local "$work" >/dev/null
rm -rf "$work"
docker rm -f memo-app-linux-drive >/dev/null 2>&1 || true
docker run -d --name memo-app-linux-drive --network host memo-app-linux-drive:local \
  sh -c 'Xvfb :99 -screen 0 1280x820x24 & export DISPLAY=:99; sleep 2; exec tauri-driver --port 14444 --native-port 14445' >/dev/null
echo "tauri-driver is starting on 127.0.0.1:14444 (container memo-app-linux-drive)"
