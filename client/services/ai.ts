import { apiClient, apiStreamClient } from "@/lib/api";

/**
 * Represents a single AI model available from the backend.
 */
export interface AIModel {
  name: string;
}

/**
 * Defines the data required to start a chat stream.
 */
export interface AIChatRequest {
  prompt: string;
  model: string;
}

// --- Service Functions ---

/**
 * Fetches the list of all available AI models from the Ollama service.
 */
export const getAvailableAIModels = (): Promise<AIModel[]> => {
  return apiClient<AIModel[]>("api/ai/models", {
    method: "GET",
  });
};

/**
 * Initiates a streaming chat completion request using the generic stream client.
 * @param data The request data including the prompt and selected model.
 * @returns A Promise that resolves to a ReadableStream of the AI's response.
 */
export const streamChatCompletion = (data: AIChatRequest): Promise<ReadableStream<Uint8Array>> => {
  return apiStreamClient("api/ai/chat", {
    method: "POST",
    body: data,
  });
};
