#!/bin/bash

echo "🔍 Ollama Direct Test"
echo "===================="

echo "1. Testing Ollama health:"
curl -s http://localhost:11434/api/version || echo "❌ Ollama not responding"

echo
echo "2. Available models:"
curl -s http://localhost:11434/api/tags | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for model in data.get('models', []):
        print(f'✅ {model[\"name\"]}')
except:
    print('❌ No models found or JSON error')
"

echo
echo "3. Testing non-streaming chat:"
response=$(curl -s -X POST http://localhost:11434/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.2:3b",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }')
echo "Response: $response"

echo
echo "4. Testing streaming chat (first few lines):"
curl -X POST http://localhost:11434/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.2:3b",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }' | head -n 5

echo
echo "5. Check if model is loaded:"
curl -s http://localhost:11434/api/ps | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    models = data.get('models', [])
    if models:
        print('🔄 Currently loaded models:')
        for model in models:
            print(f'  - {model.get(\"name\", \"unknown\")}')
    else:
        print('💤 No models currently loaded')
        print('💡 Try: ollama run llama3.2:3b')
except Exception as e:
    print(f'❌ Error checking loaded models: {e}')
"