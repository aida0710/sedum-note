#!/bin/sh
# 統合試験用の WebDAV サーバー（Apache の mod_dav）を、127.0.0.1 にだけ開いて起動する。
# Apache は、PUT の応答に ETag を返さず、書いた直後の ETag を弱い ETag（W/"…"）にする。条件付きの書き込みは守る。
# 認証は、試験用の固定のもの（integration/webDavStorage.ts と同じ）。止めるときは webdav-down.sh。
set -eu
# 条件付きの書き込みの振る舞いを確かめた版に固定する。
image=bytemark/webdav@sha256:21eed0df1238d17766080425f9ef46da2c1130e3e3aa9eaf36794d2a72e7c616
docker rm -f sedum-note-test-webdav >/dev/null 2>&1 || true
docker run -d --name sedum-note-test-webdav -p 127.0.0.1:18480:80 \
  -e AUTH_TYPE=Basic -e USERNAME=sedum-note-test -e PASSWORD=sedum-note-test-password \
  "$image" >/dev/null
for _ in $(seq 1 60); do
  if curl -s -o /dev/null -u sedum-note-test:sedum-note-test-password http://127.0.0.1:18480/; then
    echo "the WebDAV test server is ready on http://127.0.0.1:18480"
    exit 0
  fi
  sleep 1
done
echo "the WebDAV test server did not start within 60s" >&2
exit 1
