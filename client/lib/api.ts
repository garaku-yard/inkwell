const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type ApiClientOptions = Omit<RequestInit, 'body'> & {
  body?: Record<string, any> | any[];
};

export async function apiClient<T>(
  endpoint: string,
  options: ApiClientOptions = {}
): Promise<T> {
  const { headers: customHeaders, body, ...customOptions } = options;

  const headers = new Headers(customHeaders);
  headers.set("Content-Type", "application/json");

  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const config: RequestInit = {
    ...customOptions,
    headers,
  };

  if (!config.method) {
    config.method = body ? "POST" : "GET";
  }

  if (body) {
    config.body = JSON.stringify(body);
  }


  const response = await fetch(`${API_BASE_URL}/${endpoint}`, config);

  if (response.status === 204) {
    return {} as T;
  }

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    if (!response.ok) {
      throw new Error(`An error occurred: ${response.statusText}`);
    }
    return {} as T;
  }

  const data = await response.json();

  if (!response.ok) {
    const errorMessage = data.error || `An error occurred: ${response.statusText}`;
    throw new Error(errorMessage);
  }

  return data as T;
}

/**
 * A generic API client for handling streaming responses.
 * It reuses the authentication and configuration logic from apiClient
 * but returns the raw ReadableStream instead of parsing JSON.
 *
 * @param endpoint The API endpoint to call.
 * @param options The request options.
 * @returns A Promise that resolves to a ReadableStream.
 */
export async function apiStreamClient(
  endpoint: string,
  options: ApiClientOptions = {}
): Promise<ReadableStream<Uint8Array>> {
  const { headers: customHeaders, body, ...customOptions } = options;

  const headers = new Headers(customHeaders);
  headers.set("Content-Type", "application/json");

  // Re-use the same token logic
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const config: RequestInit = {
    ...customOptions,
    headers,
  };

  // Default to POST if a body is present
  if (!config.method) {
    config.method = body ? "POST" : "GET";
  }

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}/${endpoint}`, config);

  // Handle errors, but don't consume the body on success
  if (!response.ok) {
    // Try to parse the error message as JSON, as the server likely sends it this way
    const errorData = await response.json().catch(() => null);
    const errorMessage = errorData?.error || `An error occurred: ${response.statusText}`;
    throw new Error(errorMessage);
  }

  if (!response.body) {
    throw new Error("Response body is empty or null.");
  }

  // On success, return the stream directly
  return response.body;
}
