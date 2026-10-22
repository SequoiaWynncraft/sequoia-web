FROM rust:1.96.1-bookworm@sha256:a339861ae23e9abb272cea45dfafde21760d2ce6577a70f8a926153677902663 AS build
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && dpkg --compare-versions "$(dpkg-query -W -f='${Version}' ca-certificates)" ge 20250419~deb12u2 \
    && rm -rf /var/lib/apt/lists/*
ENV RUSTUP_USE_CURL=1
RUN rustup self update && rustup --version | grep -E '^rustup 1\.29\.2 '
WORKDIR /app

COPY rust-toolchain.toml rustfmt.toml ./
COPY backend/Cargo.toml backend/Cargo.lock backend/
COPY backend/crates/sequoia-web-backend/Cargo.toml backend/crates/sequoia-web-backend/Cargo.toml
RUN mkdir -p backend/crates/sequoia-web-backend/src \
    && touch backend/crates/sequoia-web-backend/src/main.rs
RUN cargo fetch --locked --manifest-path backend/Cargo.toml

COPY backend backend
RUN cargo build --locked --manifest-path backend/Cargo.toml --release --bin sequoia-web-backend

FROM debian:bookworm-slim@sha256:7ff6ba31527b9e336162fa061746c366c4b2032f4d2cff2078bea43f78efe3f8 AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && dpkg --compare-versions "$(dpkg-query -W -f='${Version}' ca-certificates)" ge 20250419~deb12u2 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/backend/target/release/sequoia-web-backend /usr/local/bin/sequoia-web-backend

EXPOSE 8080
CMD ["sequoia-web-backend"]
