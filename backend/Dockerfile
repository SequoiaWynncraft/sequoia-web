FROM rust:1.96.1-bookworm@sha256:a339861ae23e9abb272cea45dfafde21760d2ce6577a70f8a926153677902663 AS build
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && dpkg --compare-versions "$(dpkg-query -W -f='${Version}' ca-certificates)" ge 20250419~deb12u2 \
    && rm -rf /var/lib/apt/lists/*
ENV RUSTUP_USE_CURL=1
RUN case "$(uname -m)" in \
        x86_64) rustup_sha=5be191e8c70a5007074254cb74d78dbfdd25cd5a61c27de7b8e5410122ec24f4 ;; \
        aarch64) rustup_sha=a9c168dbea81a84671c6b7a5c1795cb0eb699020110d107ddfca427bd797e697 ;; \
        *) exit 1 ;; \
    esac \
    && curl --proto '=https' --tlsv1.2 -fsSLo /rustup-init "https://static.rust-lang.org/rustup/archive/1.29.2/$(uname -m)-unknown-linux-gnu/rustup-init" \
    && echo "$rustup_sha  /rustup-init" | sha256sum -c - \
    && chmod +x /rustup-init && /rustup-init -y --no-modify-path --default-toolchain none \
    && rm /rustup-init \
    && rustup --version | grep -E '^rustup 1\.29\.2 '
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

RUN groupadd --system --gid 10001 sequoia \
    && useradd --system --uid 10001 --gid 10001 --no-create-home --home-dir /nonexistent \
        --shell /usr/sbin/nologin sequoia

COPY --from=build /app/backend/target/release/sequoia-web-backend /usr/local/bin/sequoia-web-backend

# The tracker only needs network access; nothing in the image is writable by it.
USER 10001:10001
EXPOSE 8080
# Readiness, not liveness: /ready fails while the database is unreachable,
# polling is unconfigured or the last successful poll is stale, so routing
# stops when the tracker cannot do its job. The probe assumes the default
# BIND_ADDR port.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --start-interval=2s --retries=3 \
    CMD curl --fail --silent --max-time 4 --output /dev/null http://127.0.0.1:8080/ready || exit 1
CMD ["sequoia-web-backend"]
