#!/bin/sh
# 統合試験用の WebDAV サーバーを止めて消す。
set -eu
docker rm -f sedum-note-test-webdav >/dev/null 2>&1 || true
