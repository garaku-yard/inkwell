#!/bin/bash

# Test script for AI Chat Service

echo "Testing AI Chat Service..."

# Test health endpoint
echo "1. Testing health endpoint:"
curl -s http://localhost:50054/health | python3 -c "import sys, json; print(json.dumps(json.load(sys.stdin), indent=2))" 2>/dev/null || echo "Failed to parse JSON"
echo

# Test providers endpoint
echo "2. Testing providers endpoint:"
curl -s http://localhost:50054/providers | python3 -c "import sys, json; print(json.dumps(json.load(sys.stdin), indent=2))" 2>/dev/null || echo "Failed to parse JSON"
echo

# Test streaming chat endpoint
echo "3. Testing streaming chat endpoint:"
echo "Sending test message (will show first 10 lines of response)..."
curl -s -X POST http://localhost:50054/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Say hello and count to 5"}],
    "provider": "openai",
    "model": "gpt-4o-mini",
    "stream": true
  }' | head -n 10

echo
echo "4. Testing via Gateway (if running on 8080):"
curl -s -X POST http://localhost:8080/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello from gateway test"}],
    "provider": "openai",
    "stream": true
  }' | head -n 5

echo
echo "Test completed!"
echo "Note: Chat endpoint will only work if you have configured API keys in .env file"
echo "      Make sure OPENAI_API_KEY is set for OpenAI provider tests"