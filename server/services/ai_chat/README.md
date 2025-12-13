# ScriptLith AI Chat Service

A FastAPI-based microservice that provides AI chat functionality with support for multiple providers:

- **OpenAI** (GPT models)
- **Ollama** (Local LLMs)
- **Google Gemini** (Gemini models)

## Features

- Streaming chat responses
- Multiple AI provider support
- Configurable models per provider
- RESTful API endpoints
- Health checks

## Setup

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Run the service:**
   ```bash
   ./start.sh
   ```
   
   Or manually:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 50054 --reload
   ```

## API Endpoints

### POST `/chat`
Stream chat completion from AI providers.

**Request:**
```json
{
  "messages": [
    {"role": "user", "content": "Hello!"}
  ],
  "provider": "openai",
  "model": "gpt-4o-mini",
  "stream": true
}
```

**Response:** NDJSON stream
```json
{"response": "Hello! How can I help you today?"}
```

### GET `/providers`
Get available AI providers and their default models.

**Response:**
```json
{
  "providers": ["openai", "ollama", "gemini"],
  "config": {
    "openai": {"default_model": "gpt-4o-mini"},
    "ollama": {"default_model": "llama3.2"},
    "gemini": {"default_model": "gemini-1.5-flash"}
  }
}
```

### GET `/health`
Health check endpoint.

## Integration with Gateway

This service runs on port `50054` and can be integrated with the main gateway service for routing AI chat requests from the frontend.