FROM rust:1-bookworm AS build
WORKDIR /app

COPY rust-toolchain.toml rustfmt.toml ./
COPY backend/Cargo.toml backend/Cargo.lock backend/
COPY backend/crates/sequoia-web-backend/Cargo.toml backend/crates/sequoia-web-backend/Cargo.toml
RUN mkdir -p backend/crates/sequoia-web-backend/src \
    && touch backend/crates/sequoia-web-backend/src/main.rs
RUN cargo fetch --manifest-path backend/Cargo.toml

COPY backend backend
RUN cargo build --manifest-path backend/Cargo.toml --release --bin sequoia-web-backend

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/backend/target/release/sequoia-web-backend /usr/local/bin/sequoia-web-backend

EXPOSE 8080
CMD ["sequoia-web-backend"]
