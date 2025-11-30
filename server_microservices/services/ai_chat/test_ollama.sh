#!/bin/bash

echo "🦙 Ollama Connection Test"
echo "========================"

# Test if Ollama is running
echo "1️⃣ Testing Ollama service..."
if curl -s http://localhost:11434/api/version >/dev/null 2>&1; then
    echo "✅ Ollama is running"
    echo "📋 Ollama version info:"
    curl -s http://localhost:11434/api/version | python3 -c "import sys, json; print(json.dumps(json.load(sys.stdin), indent=2))" 2>/dev/null
else
    echo "❌ Ollama is not running on localhost:11434"
    echo "💡 Start Ollama with: ollama serve"
    exit 1
fi

echo
echo "2️⃣ Testing available models..."
curl -s http://localhost:11434/api/tags | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    models = data.get('models', [])
    if models:
        print('📦 Available models:')
        for model in models:
            print(f'  - {model[\"name\"]} ({model[\"size\"]} bytes)')
    else:
        print('❌ No models found')
        print('💡 Pull a model with: ollama pull llama3.2:3b')
except:
    print('❌ Failed to parse models response')
" 2>/dev/null

echo
echo "3️⃣ Testing chat with llama3.2:3b..."
response=$(curl -s -X POST http://localhost:11434/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.2:3b",
    "messages": [{"role": "user", "content": "Say hello in one word"}],
    "stream": false
  }')

if echo "$response" | grep -q "message"; then
    echo "✅ Ollama chat test successful"
    echo "📝 Response: $response"
else
    echo "❌ Ollama chat test failed"
    echo "📝 Response: $response"
fi

echo
echo "4️⃣ Testing streaming chat..."
echo "📡 Streaming response (first 3 lines):"
curl -s -X POST http://localhost:11434/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.2:3b",
    "messages": [{"role": "user", "content": "Count to 3"}],
    "stream": true
  }' | head -n 3

echo
echo "✅ Ollama test completed!"