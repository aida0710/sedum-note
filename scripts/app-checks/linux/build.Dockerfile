# Linux のアプリを手元で組み立てて動かすための環境（r540 には WebKitGTK の開発用パッケージが無いため）。
# アプリの Rust 側を変えたときに、CI を待たずに確かめるのに使う。使い方は build-app.sh。
FROM ubuntu:24.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    build-essential curl ca-certificates file pkg-config libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libdbus-1-dev \
    libayatana-appindicator3-dev librsvg2-dev xvfb xauth fonts-noto-cjk libegl1 webkit2gtk-driver \
    && rm -rf /var/lib/apt/lists/*
# Rust は、ホストの利用者の権限でも使えるよう、誰でも読める場所に入れる。
ENV RUSTUP_HOME=/opt/rustup CARGO_HOME=/opt/cargo PATH=/opt/cargo/bin:$PATH
RUN curl -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable && chmod -R a+rX /opt/rustup /opt/cargo
