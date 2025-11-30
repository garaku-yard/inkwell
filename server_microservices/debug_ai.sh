#!/bin/bash

# Debug AI Chat Integration

echo "🔍 AI Chat Integration Debug Tool"
echo "================================"
echo

# Function to test endpoint
test_endpoint() {
    local url=$1
    local method=${2:-GET}
    local data=${3:-""}
    
    echo "Testing: $method $url"
    if [ -z "$data" ]; then
        response=$(curl -s -w "\nSTATUS:%{http_code}" "$url")
    else
        response=$(curl -s -w "\nSTATUS:%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" "$url")
    fi
    
    echo "Response: $response"
    echo "---"
}

# 1. Test AI service directly
echo "1️⃣  Testing AI Chat Service (Direct)"
test_endpoint "http://localhost:50054/health"
test_endpoint "http://localhost:50054/providers"

# 2. Test Gateway
echo "2️⃣  Testing Gateway Service"
test_endpoint "http://localhost:8080/health"
test_endpoint "http://localhost:8080/api/ai/health"

# 3. Test streaming with minimal payload
echo "3️⃣  Testing Streaming (AI Service Direct)"
echo "Direct AI service streaming test:"
curl -s -X POST http://localhost:50054/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hi"}],"provider":"openai","stream":true}' \
  | head -n 3 || echo "❌ Direct AI service test failed"

echo
echo "4️⃣  Testing Streaming (Via Gateway)"
echo "Gateway streaming test:"
curl -s -X POST http://localhost:8080/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hi"}],"provider":"openai","stream":true}' \
  | head -n 3 || echo "❌ Gateway streaming test failed"

echo
echo "5️⃣  Environment Check"
echo "AI Chat Service Port 50054:"
netstat -ln | grep :50054 || echo "❌ AI Chat service not running on 50054"

echo "Gateway Port 8080:"
netstat -ln | grep :8080 || echo "❌ Gateway not running on 8080"

echo
echo "6️⃣  Process Check"
echo "AI Chat Service Process:"
ps aux | grep -i "uvicorn.*50054" | grep -v grep || echo "❌ AI Chat service process not found"

echo "Gateway Process:"
ps aux | grep -i "gateway" | grep -v grep || echo "❌ Gateway process not found"

echo
echo "✅ Debug completed!"
echo "💡 If streaming doesn't work:"
echo "   - Check if OPENAI_API_KEY is set in ai_chat/.env"
echo "   - Verify both services are running"
echo "   - Check browser developer tools for CORS errors"
echo "   - Test frontend with: console.log() in AIChatPanel.tsx"