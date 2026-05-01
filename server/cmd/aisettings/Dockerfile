FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o bin/aisettings-service ./cmd/aisettings

FROM alpine:latest
RUN apk --no-cache add ca-certificates
RUN adduser -D -s /bin/sh appuser
WORKDIR /app
COPY --from=builder /app/bin/aisettings-service .
COPY --from=builder /app/internal/aisettings/migrations ./internal/aisettings/migrations
RUN chown -R appuser:appuser /app
USER appuser
EXPOSE 50057
CMD ["./aisettings-service"]
