# API Gateway Dockerfile
FROM golang:1.24-alpine AS builder

# Set working directory
WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN go build -o bin/api-gateway ./cmd/gateway

# Final stage
FROM alpine:latest

# Install ca-certificates for HTTPS
RUN apk --no-cache add ca-certificates

# Create non-root user
RUN adduser -D -s /bin/sh appuser

WORKDIR /app

# Copy the binary from builder stage
COPY --from=builder /app/bin/api-gateway .

# Own the binary and provide a writable uploads dir (avatars and other user
# uploads land here, served back via /uploads). Mounted as a named volume in
# compose so files survive container redeploys. /root was unwritable by the
# non-root appuser, which broke uploads.
RUN chown appuser:appuser api-gateway \
    && mkdir -p /app/uploads \
    && chown -R appuser:appuser /app/uploads
USER appuser

# Expose port
EXPOSE 8080

# Run the binary
CMD ["./api-gateway"]