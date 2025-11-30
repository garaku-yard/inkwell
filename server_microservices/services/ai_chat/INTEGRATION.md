# AI Chat Microservice Integration

## Directory Structure

```
server_microservices/
├── services/
│   ├── ai/                    # Original AI service (for advanced AI features)
│   └── ai_chat/              # New AI Chat service (chat completion)
│       ├── main.py           # FastAPI application
│       ├── requirements.txt  # Python dependencies
│       ├── Dockerfile        # Container configuration
│       ├── .env.example      # Environment variables template
│       ├── start.sh          # Development startup script
│       ├── test.sh           # API testing script
│       └── README.md         # Service documentation
```

## Service Ports

- **Gateway**: 8080
- **Identity Service**: 50051  
- **Scripts Service**: 50052
- **Collaboration Service**: 50053
- **AI Chat Service**: 50054

## Quick Start

### 1. Start AI Chat Service

```bash
cd server_microservices/services/ai_chat

# Setup environment
cp .env.example .env
# Edit .env with your API keys

# Start service
./start.sh
```

### 2. Test the Service

```bash
# Run test script
./test.sh

# Or manual test
curl http://localhost:50054/health
```

### 3. Integration with Frontend

The frontend AI service (`client/services/ai.ts`) has been updated to:
- Support the new microservice API format
- Maintain backward compatibility with existing code
- Handle multiple AI providers (OpenAI, Ollama, Gemini)

## API Providers Supported

### OpenAI
- **Models**: gpt-4o-mini (default), gpt-4, gpt-3.5-turbo
- **Required**: `OPENAI_API_KEY` environment variable

### Ollama (Local)
- **Models**: llama3.2 (default), or any locally installed model
- **Required**: Ollama running on `localhost:11434` (configurable)

### Google Gemini
- **Models**: gemini-1.5-flash (default), gemini-pro
- **Required**: `GEMINI_API_KEY` environment variable

## Next Steps

1. **Configure API Keys**: Add your API keys to the `.env` file
2. **Gateway Integration**: Update the gateway service to route `/api/ai/*` requests to port 50054
3. **Docker Compose**: Add the AI chat service to the main docker-compose.yml
4. **Production**: Configure CORS and security settings for production deployment

## Usage Example

```javascript
// Frontend usage (already compatible)
const response = await streamChatCompletion({
  messages: [
    { role: "user", content: "Help me write a scene" }
  ],
  provider: "openai",  // or "ollama", "gemini"
  model: "gpt-4o-mini"
});
```