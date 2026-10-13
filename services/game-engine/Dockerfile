FROM golang:1.26-alpine AS build

WORKDIR /src

COPY go.mod ./
COPY . ./

RUN CGO_ENABLED=0 GOOS=linux go build \
	-trimpath \
	-ldflags="-s -w" \
	-o /out/game-engine \
	./cmd/game-engine

FROM alpine:3.22

RUN addgroup -S app && adduser -S -G app app

COPY --from=build /out/game-engine /usr/local/bin/game-engine

USER app
EXPOSE 8080

HEALTHCHECK --interval=5s --timeout=3s --start-period=2s --retries=5 \
	CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1

ENTRYPOINT ["/usr/local/bin/game-engine"]
