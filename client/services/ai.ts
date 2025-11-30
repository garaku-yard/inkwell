import { apiClient, apiStreamClient } from "@/lib/api";

/**
 * Represents a chat message in the conversation.
 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Defines the data required to start a chat stream.
 */
export interface AIChatRequest {
  messages: ChatMessage[];
  provider?: string; // openai, ollama, gemini
  model?: string;
  stream?: boolean;
}

/**
 * Legacy interface for backward compatibility
 */
export interface LegacyAIChatRequest {
  prompt: string;
  model: string;
}

/**
 * Available AI providers and their configurations
 */
export interface AIProvidersResponse {
  providers: string[];
  config: Record<string, { default_model: string }>;
}

// --- Service Functions ---

/**
 * Fetches available AI providers and their configurations.
 */
export const getAvailableAIProviders = (): Promise<AIProvidersResponse> => {
  return apiClient<AIProvidersResponse>("api/ai/providers", {
    method: "GET",
  });
};

/**
 * Initiates a streaming chat completion request using the new microservice.
 * @param data The request data including messages and provider configuration.
 * @returns A Promise that resolves to a ReadableStream of the AI's response.
 */
export const streamChatCompletion = (data: AIChatRequest | LegacyAIChatRequest): Promise<ReadableStream<Uint8Array>> => {
  // Handle legacy format for backward compatibility
  let requestData: AIChatRequest;
  
  if ('prompt' in data) {
    // Convert legacy format to new format
    requestData = {
      messages: [{ role: "user", content: data.prompt }],
      provider: "openai",
      model: data.model,
      stream: true
    };
  } else {
    requestData = {
      provider: "ollama",
      stream: true,
      ...data
    };
  }

  return apiStreamClient("api/ai/chat", {
    method: "POST",
    body: requestData,
  });
};

/**
 * Legacy function for backward compatibility
 */
export const getAvailableAIModels = async () => {
  const providers = await getAvailableAIProviders();
  // Convert to legacy format
  return Object.entries(providers.config).map(([provider, config]) => ({
    name: `${provider}:${config.default_model}`
  }));
};
