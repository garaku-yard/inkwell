# AI Chat Integration Testing Guide

## Quick Start

### 1. Start AI Chat Service

```bash
cd server_microservices/services/ai_chat

# Setup environment
cp .env.example .env
# Edit .env with your OpenAI API key:
# OPENAI_API_KEY=sk-your-key-here

# Start service
./start.sh
```

### 2. Start Gateway Service

```bash
cd server_microservices

# Update .env to include AI chat service config
cp .env.example .env
# The .env should include:
# AI_CHAT_SERVICE_HOST=localhost
# AI_CHAT_SERVICE_PORT=50054

# Build and start gateway
make build-gateway
./bin/gateway
```

### 3. Start Frontend

```bash
cd client
npm run dev
```

### 4. Test the Integration

1. Open browser to `http://localhost:3000`
2. Login to the application
3. Open a project and click the "Writing Buddy" button
4. The chat panel should open attached to the right side
5. Type a message and press Enter
6. You should see streaming AI responses

## Architecture Flow

```
Frontend (React)
    ↓ HTTP POST /api/ai/chat
Gateway (Go) :8080
    ↓ HTTP POST /chat  
AI Chat Service (Python FastAPI) :50054
    ↓ API calls
External AI Providers (OpenAI/Ollama/Gemini)
```

## Troubleshooting

### AI Service Not Starting
- Check if Python 3.11+ is installed
- Verify requirements.txt dependencies are installed
- Check .env file has correct API keys

### Gateway Not Connecting to AI Service
- Verify AI service is running on port 50054
- Check .env file has `AI_CHAT_SERVICE_HOST=localhost` and `AI_CHAT_SERVICE_PORT=50054`
- Test AI service directly: `curl http://localhost:50054/health`

### Frontend Not Getting Responses
- Open browser dev tools, check Network tab for errors
- Verify `/api/ai/chat` requests are reaching the gateway
- Check CORS settings in both gateway and AI service

### No AI Responses
- Verify API keys are set in `/services/ai_chat/.env`
- Check AI service logs for errors
- Test with simple curl request:
```bash
curl -X POST http://localhost:50054/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello!"}], "provider": "openai"}'
```

## Available Endpoints

- `GET /api/ai/health` - Check AI service health
- `GET /api/ai/providers` - Get available AI providers
- `POST /api/ai/chat` - Stream chat completion

## AI Providers

### OpenAI (Default)
- Requires: `OPENAI_API_KEY` environment variable
- Models: gpt-4o-mini, gpt-4, gpt-3.5-turbo

### Ollama (Local)
- Requires: Ollama running on localhost:11434
- Models: Any locally installed model (llama3.2 default)

### Google Gemini
- Requires: `GEMINI_API_KEY` environment variable  
- Models: gemini-1.5-flash, gemini-pro