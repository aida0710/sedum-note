#!/bin/sh
# 試験用の SeaweedFS を 127.0.0.1 にだけ開いて起動する。
set -eu
cd "$(dirname "$0")"
# sshc の統合試験と同じ版（条件付き PUT の振る舞いを確かめた版）に固定する。
image=chrislusf/seaweedfs@sha256:43b768cd62b00d132439cda881b93fd1adebf1b315e996e794087743821d771d
docker rm -f sedum-note-test-s3 >/dev/null 2>&1 || true
docker run -d --name sedum-note-test-s3 -p 127.0.0.1:18333:8333 \
  -v "$PWD/s3-identities.json:/etc/seaweedfs/s3.json:ro" "$image" \
  server -s3 -s3.port=8333 -s3.config=/etc/seaweedfs/s3.json -dir=/data >/dev/null
for _ in $(seq 1 60); do
  if curl -s -o /dev/null http://127.0.0.1:18333/; then
    echo "SeaweedFS is ready on http://127.0.0.1:18333"
    exit 0
  fi
  sleep 1
done
echo "SeaweedFS did not start within 60s" >&2
exit 1
