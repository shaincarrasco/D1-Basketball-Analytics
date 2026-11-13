# D1 Hoops on Railway: one container serves the static site, /auth proxy, /api and the live relay.
# 1) static site (no basePath; live scores stream from this same origin)
FROM node:22-bookworm-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV NEXT_PUBLIC_LIVE_URL=same-origin
ARG NEXT_PUBLIC_PRICE_MONTHLY_LABEL
ARG NEXT_PUBLIC_PRICE_YEARLY_LABEL
RUN npm run build

# 2) app server
FROM rust:1-bookworm AS server
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /live
COPY live/Cargo.toml live/Cargo.lock ./
COPY live/src ./src
RUN cargo build --release --bin d1hoops-live

# 3) runtime
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY --from=server /live/target/release/d1hoops-live /usr/local/bin/d1hoops-live
COPY --from=web /app/out ./out
ENV STATIC_DIR=/srv/out PORT=8080
EXPOSE 8080
CMD ["d1hoops-live"]
