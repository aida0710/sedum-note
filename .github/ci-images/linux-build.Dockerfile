# CI で Linux のアプリを組み立てて動かすための環境。WebKitGTK の開発用パッケージなどを先に入れておき、
# CI の実行のたびに apt で取ってこなくて済むようにする（取得が遅い・固まることがある）。
# .github/workflows/ci-image.yml が、このファイルを変えたときに作り直して GHCR に置く。
#
# 古い glibc で組み立てるほど、AppImage が動く Linux の範囲が広がるので、22.04 にする。
# Node と Rust は入れない。CI のランナーに入っているものを、コンテナに見せて使う（scripts/ci/in-linux-image.sh）。
FROM ubuntu:22.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    build-essential pkg-config curl wget file git ca-certificates jq python3 rpm xdg-utils desktop-file-utils procps \
    libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libdbus-1-dev libayatana-appindicator3-dev librsvg2-dev \
    xvfb ffmpeg fonts-noto-cjk libegl1 \
    && rm -rf /var/lib/apt/lists/*
