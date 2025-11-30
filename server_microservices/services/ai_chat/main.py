from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, AsyncGenerator
import httpx
import json
import os
from dotenv import load_dotenv
from fastapi.responses import StreamingResponse
import asyncio

# Load environment variables
load_dotenv()

app = FastAPI(title="ScriptLith AI Chat Service", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this properly in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    provider: str = "openai"  # openai, ollama, gemini
    model: Optional[str] = None
    stream: bool = True

class ChatResponse(BaseModel):
    response: str
    provider: str
    model: str

# AI Provider configurations
PROVIDER_CONFIG = {
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "default_model": "gpt-4o-mini",
        "api_key_env": "OPENAI_API_KEY"
    },
    "ollama": {
        "base_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        "default_model": "llama3.2:3b",
        "api_key_env": None
    },
    "gemini": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta",
        "default_model": "gemini-1.5-flash",
        "api_key_env": "GEMINI_API_KEY"
    }
}

class AIService:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=60.0)
    
    async def chat_openai(self, messages: List[Dict], model: str) -> AsyncGenerator[str, None]:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OpenAI API key not configured")
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": model,
            "messages": messages,
            "stream": True
        }
        
        async with self.client.stream(
            "POST", 
            f"{PROVIDER_CONFIG['openai']['base_url']}/chat/completions",
            headers=headers,
            json=payload
        ) as response:
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="OpenAI API error")
            
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    if data.strip() == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        if "choices" in chunk and len(chunk["choices"]) > 0:
                            delta = chunk["choices"][0].get("delta", {})
                            if "content" in delta:
                                yield delta["content"]
                    except json.JSONDecodeError:
                        continue
    
    async def chat_ollama(self, messages: List[Dict], model: str) -> AsyncGenerator[str, None]:
        payload = {
            "model": model,
            "messages": messages,
            "stream": True
        }
        
        print(f"🦙 Ollama request: {payload}")  # Debug log
        
        try:
            async with self.client.stream(
                "POST", 
                f"{PROVIDER_CONFIG['ollama']['base_url']}/api/chat",
                json=payload
            ) as response:
                print(f"🦙 Ollama response status: {response.status_code}")  # Debug log
                
                if response.status_code != 200:
                    print(f"🦙 Ollama error status: {response.status_code}")  # Debug log
                    raise HTTPException(status_code=response.status_code, detail=f"Ollama API error: HTTP {response.status_code}")
                
                async for line in response.aiter_lines():
                    print(f"🦙 Ollama line: {line}")  # Debug log
                    try:
                        chunk = json.loads(line)
                        if "message" in chunk and "content" in chunk["message"]:
                            content = chunk["message"]["content"]
                            if content:  # Only yield non-empty content
                                yield content
                        elif "error" in chunk:
                            print(f"🦙 Ollama chunk error: {chunk['error']}")
                            raise HTTPException(status_code=500, detail=f"Ollama error: {chunk['error']}")
                    except json.JSONDecodeError as e:
                        print(f"🦙 JSON decode error: {e}, line: {line}")
                        continue
        except httpx.ConnectError as e:
            print(f"🦙 Connection error: {e}")
            raise HTTPException(status_code=503, detail=f"Ollama service not available: {str(e)}")
        except HTTPException as e:
            # Re-raise HTTPException as-is
            raise e
        except Exception as e:
            print(f"🦙 Unexpected error: {e}")
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")
    
    async def chat_gemini(self, messages: List[Dict], model: str) -> AsyncGenerator[str, None]:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="Gemini API key not configured")
        
        # Convert messages to Gemini format
        contents = []
        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            contents.append({"role": role, "parts": [{"text": msg["content"]}]})
        
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 2048
            }
        }
        
        url = f"{PROVIDER_CONFIG['gemini']['base_url']}/models/{model}:streamGenerateContent?key={api_key}"
        
        async with self.client.stream("POST", url, json=payload) as response:
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Gemini API error")
            
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    try:
                        chunk = json.loads(data)
                        if "candidates" in chunk and len(chunk["candidates"]) > 0:
                            candidate = chunk["candidates"][0]
                            if "content" in candidate and "parts" in candidate["content"]:
                                for part in candidate["content"]["parts"]:
                                    if "text" in part:
                                        yield part["text"]
                    except json.JSONDecodeError:
                        continue
    
    async def chat_stream(self, request: ChatRequest) -> AsyncGenerator[str, None]:
        try:
            provider = request.provider.lower()
            print(f"🚀 Starting chat_stream with provider: {provider}")
            
            if provider not in PROVIDER_CONFIG:
                raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")
            
            model = request.model or PROVIDER_CONFIG[provider]["default_model"]
            messages = [msg.dict() for msg in request.messages]
            
            print(f"🚀 Using model: {model}")
            print(f"🚀 Messages: {messages}")
            
            if provider == "openai":
                print("🤖 Using OpenAI provider")
                async for chunk in self.chat_openai(messages, model):
                    yield chunk
            elif provider == "ollama":
                print("🦙 Using Ollama provider")
                async for chunk in self.chat_ollama(messages, model):
                    yield chunk
            elif provider == "gemini":
                print("🔷 Using Gemini provider")
                async for chunk in self.chat_gemini(messages, model):
                    yield chunk
        except HTTPException as e:
            print(f"❌ HTTPException in chat_stream: {e.status_code} - {e.detail}")
            raise e
        except Exception as e:
            print(f"❌ Unexpected exception in chat_stream: {type(e).__name__}: {str(e)}")
            import traceback
            traceback.print_exc()
            raise e

ai_service = AIService()

@app.get("/")
async def root():
    return {"message": "ScriptLith AI Chat Service", "version": "1.0.0"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    async def generate():
        try:
            print(f"🚀 Chat request: provider={request.provider}, model={request.model}")  # Debug log
            async for chunk in ai_service.chat_stream(request):
                # Format as JSON lines for streaming
                yield f'{json.dumps({"response": chunk})}\n'
        except HTTPException as e:
            print(f"❌ HTTP Error: {e.status_code} - {e.detail}")
            yield f'{json.dumps({"error": e.detail})}\n'
        except Exception as e:
            print(f"❌ Unexpected error: {e}")
            yield f'{json.dumps({"error": str(e)})}\n'
    
    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache"}
    )

@app.get("/providers")
async def get_providers():
    return {
        "providers": list(PROVIDER_CONFIG.keys()),
        "config": {k: {"default_model": v["default_model"]} for k, v in PROVIDER_CONFIG.items()}
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=50054)