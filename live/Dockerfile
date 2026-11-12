FROM rust:1-slim AS build
WORKDIR /app
COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release

FROM gcr.io/distroless/cc-debian12
COPY --from=build /app/target/release/d1hoops-live /d1hoops-live
ENV PORT=8080
EXPOSE 8080
CMD ["/d1hoops-live"]
