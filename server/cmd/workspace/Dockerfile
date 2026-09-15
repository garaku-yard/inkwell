FROM golang:1.25-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN go build -o bin/workspace-service ./cmd/workspace

FROM alpine:latest

RUN apk --no-cache add ca-certificates
RUN adduser -D -s /bin/sh appuser

WORKDIR /app

COPY --from=builder /app/bin/workspace-service .
COPY --from=builder /app/internal/workspace/migrations ./internal/workspace/migrations

RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 50056

CMD ["./workspace-service"]
