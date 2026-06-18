/**
 * Core HTTP client used by all service modules. Handles authentication,
 * JSON serialisation, and session-expiry notifications. Non-OK responses are
 * surfaced as `ApiError` instances so callers can branch on the structured
 * `code` and per-field validation `fields` instead of pattern-matching on text.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/**
 * API version prefix. Every gateway request is served under `/api/v1`; call
 * sites pass bare resource paths (e.g. `"projects/123"`) and the prefix is
 * added here so the version lives in exactly one place — bump it (or branch
 * on the path) to introduce `/api/v2` without touching call sites.
 */
const API_VERSION_PREFIX = "api/v1";

/**
 * Builds the absolute request URL from a bare endpoint path: strips any
 * leading slash, prepends the version prefix (idempotently — a path already
 * under the prefix is left as-is), then joins it to the base URL.
 */
function buildUrl(endpoint: string): string {
  const path = endpoint.replace(/^\/+/, "");
  const versioned =
    path === API_VERSION_PREFIX || path.startsWith(`${API_VERSION_PREFIX}/`)
      ? path
      : `${API_VERSION_PREFIX}/${path}`;
  return `${API_BASE_URL}/${versioned}`;
}

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
  | "DEADLINE_EXCEEDED"
  | "RESOURCE_EXHAUSTED";

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
 * Fires a `"session-expired"` custom event on `window`. Components listen to
 * this event to show a re-login modal without coupling to the HTTP layer.
 * The session token lives in an httpOnly cookie managed by the gateway, so
 * this function no longer touches client-side storage.
 */
const notifySessionExpired = () => {
  if (typeof window !== "undefined") {
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
 * Generic JSON API client for the Inkwell gateway. Authentication is carried
 * by the httpOnly `inkwell_token` cookie set at login; the browser attaches
 * it automatically when `credentials: "include"` is set, so no Authorization
 * header is needed. Treats HTTP 204 No Content as an empty object.
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

  const config: RequestInit = {
    credentials: "include",
    ...customOptions,
    headers,
  };

  if (!config.method) {
    config.method = body ? "POST" : "GET";
  }

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(buildUrl(endpoint), config);

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
 * Streaming variant of `apiClient`. Uses the same cookie-based authentication
 * as `apiClient` (the browser attaches the httpOnly session cookie
 * automatically via `credentials: "include"`) and returns the raw
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
 * const stream = await apiStreamClient("ai/chat", { method: "POST", body: payload });
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

  const config: RequestInit = {
    credentials: "include",
    ...customOptions,
    headers,
  };

  if (!config.method) {
    config.method = body ? "POST" : "GET";
  }

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(buildUrl(endpoint), config);

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
