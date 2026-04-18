/**
 * Core HTTP client used by all service modules. Handles authentication,
 * JSON serialisation, and session-expiry notifications. Non-OK responses are
 * surfaced as `ApiError` instances so callers can branch on the structured
 * `code` and per-field validation `fields` instead of pattern-matching on text.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/** Extends the standard `RequestInit` with a typed `body` field that is
 *  automatically serialised to JSON before the request is sent. Accepts any
 *  JSON-serialisable value, including typed interfaces and arrays. */
type ApiClientOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

/**
 * Stable machine-readable error codes emitted by the gateway's error envelope.
 * Extend this union if the server adds new codes; missing values fall back to
 * `"UNKNOWN"` so callers can still render a generic error.
 */
export type ApiErrorCode =
  | "UNKNOWN"
  | "INVALID_ARGUMENT"
  | "UNAUTHENTICATED"
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "FAILED_PRECONDITION"
  | "INTERNAL"
  | "UNAVAILABLE"
  | "DEADLINE_EXCEEDED";

/**
 * Structured error thrown by `apiClient` and `apiStreamClient` for every
 * non-OK response. Preserves the server-provided `code` and any `fields`
 * (per-field validation details) so UI code can branch on failure type.
 *
 * @example
 * ```ts
 * try {
 *   await createProject(data);
 * } catch (err) {
 *   if (err instanceof ApiError && err.code === "ALREADY_EXISTS") {
 *     toast.error("A project with that title already exists.");
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 */
export class ApiError extends Error {
  /** HTTP status code of the response (e.g. 404, 409). */
  public readonly status: number;
  /** Stable, machine-readable identifier of the error kind. */
  public readonly code: ApiErrorCode;
  /** Optional per-field validation details keyed by field name. */
  public readonly fields?: Record<string, string>;

  constructor(status: number, code: ApiErrorCode, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

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
 * Parses a non-OK response body into an `ApiError`. Supports the structured
 * envelope shape (`{code, message, fields}`) and falls back to the legacy
 * `{error}` shape or plain status-text when the body cannot be parsed.
 */
async function parseApiError(response: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Body wasn't JSON — fall through to status-text fallback below.
  }

  if (body && typeof body === "object") {
    const obj = body as { code?: string; message?: string; error?: string; fields?: Record<string, string> };
    if (typeof obj.code === "string" && typeof obj.message === "string") {
      return new ApiError(response.status, obj.code as ApiErrorCode, obj.message, obj.fields);
    }
    if (typeof obj.error === "string") {
      return new ApiError(response.status, "UNKNOWN", obj.error);
    }
  }

  return new ApiError(response.status, "UNKNOWN", response.statusText || "Request failed");
}

/**
 * Generic JSON API client for the Inkwell gateway. Attaches the stored JWT as
 * a `Bearer` token, serialises the request body to JSON, and parses the
 * response. Treats HTTP 204 No Content as an empty object.
 *
 * @param endpoint - Path relative to `NEXT_PUBLIC_API_URL` (e.g. `"projects"`).
 * @param options - Optional fetch options including a typed `body` object.
 * @returns A promise that resolves to the parsed JSON response cast to `T`.
 * @throws {ApiError} For any non-OK response, with the gateway's structured
 *   `code`, `message`, and optional `fields`. On HTTP 401 the
 *   `"session-expired"` window event is also dispatched.
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
    throw new ApiError(401, "UNAUTHENTICATED", "Session expired. Please login again.");
  }

  if (response.status === 204) {
    return {} as T;
  }

  if (!response.ok) {
    throw await parseApiError(response);
  }

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    return {} as T;
  }

  return (await response.json()) as T;
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
 * @throws {ApiError} On HTTP 401 (also dispatches `"session-expired"`) or any
 *   other non-OK response, with the gateway's structured envelope.
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
    throw new ApiError(401, "UNAUTHENTICATED", "Session expired. Please login again.");
  }

  if (!response.ok) {
    throw await parseApiError(response);
  }

  if (!response.body) {
    throw new Error("Response body is empty or null.");
  }

  return response.body;
}
