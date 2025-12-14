# Scripts Service Dockerfile
FROM golang:1.24-alpine AS builder

# Set working directory
WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN go build -o bin/scripts-service ./cmd/scripts

# Final stage
FROM alpine:latest

# Install ca-certificates for HTTPS
RUN apk --no-cache add ca-certificates

# Create non-root user
RUN adduser -D -s /bin/sh appuser

WORKDIR /root/

# Copy the binary from builder stage
COPY --from=builder /app/bin/scripts-service .

# Change ownership to appuser
RUN chown appuser:appuser scripts-service
USER appuser

# Expose port
EXPOSE 50052

# Run the binary
CMD ["./scripts-service"]
