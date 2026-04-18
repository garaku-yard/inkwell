/**
 * Core HTTP client used by all service modules. Handles authentication,
 * JSON serialisation, and session expiry notifications.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/** Extends the standard `RequestInit` with a typed `body` field that is
 *  automatically serialised to JSON before the request is sent. Accepts any
 *  JSON-serialisable value, including typed interfaces and arrays. */
type ApiClientOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

/**
 * Fires a `"session-expired"` custom event on `window` and removes the stored
 * auth token from `localStorage`. Components can listen to this event to show
 * a re-login modal without coupling to the HTTP layer.
 */
const notifySessionExpired = () => {
  if (typeof window !== "undefined") {
    localStorage.removeItem("authToken");
    window.dispatchEvent(new CustomEvent("session-expired"));
  }
};

/**
 * Generic JSON API client for the Inkwell gateway. Attaches the stored JWT as
 * a `Bearer` token, serialises the request body to JSON, and parses the
 * response. Treats HTTP 204 No Content as an empty object.
 *
 * @param endpoint - Path relative to `NEXT_PUBLIC_API_URL` (e.g. `"projects"`).
 * @param options - Optional fetch options including a typed `body` object.
 * @returns A promise that resolves to the parsed JSON response cast to `T`.
 * @throws {Error} `"Session expired. Please login again."` when the server
 *   returns HTTP 401. The `"session-expired"` window event is also dispatched.
 * @throws {Error} The `error` field from the response body, or a generic
 *   status-text message, for any other non-OK response.
 *
 * @example
 * ```ts
 * const project = await apiClient<Project>(`projects/${id}`, { method: "GET" });
 * ```
 */
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

  if (response.status === 401) {
    notifySessionExpired();
    throw new Error("Session expired. Please login again.");
  }

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
 * Streaming variant of `apiClient`. Sends the request with the same
 * authentication and serialisation logic but returns the raw
 * `ReadableStream<Uint8Array>` instead of parsing JSON. Used for
 * Server-Sent Events and NDJSON AI chat responses.
 *
 * @param endpoint - Path relative to `NEXT_PUBLIC_API_URL`.
 * @param options - Optional fetch options including a typed `body` object.
 * @returns A promise that resolves to the response `ReadableStream`.
 * @throws {Error} `"Session expired. Please login again."` on HTTP 401.
 * @throws {Error} The `error` field from the response body for non-OK responses.
 * @throws {Error} `"Response body is empty or null."` when the server sends no body.
 *
 * @example
 * ```ts
 * const stream = await apiStreamClient("api/ai/chat", { method: "POST", body: payload });
 * const reader = stream.getReader();
 * ```
 */
export async function apiStreamClient(
  endpoint: string,
  options: ApiClientOptions = {}
): Promise<ReadableStream<Uint8Array>> {
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

  if (response.status === 401) {
    notifySessionExpired();
    throw new Error("Session expired. Please login again.");
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const errorMessage = errorData?.error || `An error occurred: ${response.statusText}`;
    throw new Error(errorMessage);
  }

  if (!response.body) {
    throw new Error("Response body is empty or null.");
  }

  return response.body;
}
