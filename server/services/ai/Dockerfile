# Use Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY src/ ./src/

# Create directory for generated protobuf files
RUN mkdir -p /app/proto

# Set environment variables
ENV PYTHONPATH=/app:/app/src
ENV AI_SERVICE_PORT=50051

# Expose the gRPC port
EXPOSE 50051

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import grpc; grpc.insecure_channel('localhost:50051').get_state()" || exit 1

# Run the AI service
CMD ["python", "src/rpc_server.py"]