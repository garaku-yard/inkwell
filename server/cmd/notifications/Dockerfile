FROM golang:1.24-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN go build -o bin/notifications-service ./cmd/notifications

FROM alpine:latest

RUN apk --no-cache add ca-certificates
RUN adduser -D -s /bin/sh appuser

WORKDIR /app

COPY --from=builder /app/bin/notifications-service .
COPY --from=builder /app/internal/notifications/migrations ./internal/notifications/migrations

RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 50058

CMD ["./notifications-service"]
