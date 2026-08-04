/**
 * Core HTTP client used by all service modules. Handles authentication,
 * JSON serialisation, and session-expiry notifications. Non-OK responses are
 * surfaced as `ApiError` instances so callers can branch on the structured
 * `code` and per-field validation `fields` instead of pattern-matching on text.
 */

/**
 * Default gateway origin. A build-time `NEXT_PUBLIC_API_URL` wins (set for web
 * and local dev); otherwise we fall back to the official hosted gateway, which
 * is the right default for the desktop build. The desktop app can override this
 * at runtime via {@link setApiBaseUrl} (e.g. a self-hoster pointing at their
 * own stack), so the baked value is only a starting point.
 */
const DEFAULT_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://inkwell.garakuyard.com";

/**
 * Header a native client sets to identify itself to the gateway. Its presence
 * opts the request into token-in-body auth at login and the CSRF/CORS
 * token-client exemptions (see gateway middleware). Mirrors the server const.
 */
const CLIENT_HEADER = "X-Inkwell-Client";
const CLIENT_DESKTOP = "desktop";

/** Current gateway origin; mutable so the desktop build can repoint at runtime. */
let apiBaseUrl = DEFAULT_API_BASE_URL;
/** Bearer token for native (cookie-less) auth; null on web and when signed out. */
let authToken: string | null = null;
/** Long-lived refresh token (native only); used to mint a new access token on a
 *  401 so the desktop session doesn't expire after the 24h access-token life. */
let refreshToken: string | null = null;
/** Whether this is the native desktop client (token auth, no cookies). */
let nativeClient = false;
/** Called with the rotated tokens after a successful refresh, so the desktop
 *  layer can persist them to the OS keychain. */
let onTokensRefreshed: ((accessToken: string, refreshToken: string) => void) | null = null;

/**
 * Repoints the gateway origin at runtime. Pass a falsy/blank value to reset to
 * the default. A trailing slash is trimmed so `buildUrl` joins cleanly. Used by
 * the desktop build to honour a user-configured gateway URL.
 */
export function setApiBaseUrl(url: string | null | undefined): void {
  const trimmed = url?.trim().replace(/\/+$/, "");
  apiBaseUrl = trimmed || DEFAULT_API_BASE_URL;
}

/** Returns the gateway origin currently in effect. */
export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

/**
 * Sets (or clears, with `null`) the bearer token used for native auth. When
 * present it is sent as `Authorization: Bearer <token>` on every request. The
 * desktop auth layer calls this after login and clears it on logout / 401.
 */
export function setAuthToken(token: string | null): void {
  authToken = token;
}

/** Returns the bearer token currently in effect, or null. */
export function getAuthToken(): string | null {
  return authToken;
}

/** Sets (or clears) the refresh token used to renew an expired access token. */
export function setRefreshToken(token: string | null): void {
  refreshToken = token;
}

/** Returns the refresh token currently in effect, or null. */
export function getRefreshToken(): string | null {
  return refreshToken;
}

/** Registers a callback invoked with the rotated (access, refresh) tokens after
 *  a successful auto-refresh, so they can be persisted to the keychain. */
export function setTokensRefreshedHandler(
  fn: ((accessToken: string, refreshToken: string) => void) | null,
): void {
  onTokensRefreshed = fn;
}

/**
 * Marks this runtime as the native desktop client. Native requests always carry
 * the desktop header (so login returns the token in the body) and never send
 * cookies — they authenticate purely by bearer token. Call once at desktop boot.
 */
export function setNativeClient(on: boolean): void {
  nativeClient = on;
}

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
 * under the prefix is left as-is), then joins it to the base URL currently in
 * effect (see {@link setApiBaseUrl}).
 */
function buildUrl(endpoint: string): string {
  const path = endpoint.replace(/^\/+/, "");
  const versioned =
    path === API_VERSION_PREFIX || path.startsWith(`${API_VERSION_PREFIX}/`)
      ? path
      : `${API_VERSION_PREFIX}/${path}`;
  return `${apiBaseUrl}/${versioned}`;
}

/**
 * Applies the auth transport to a request's headers + fetch config. Native
 * clients send the desktop identifier (and a bearer token once signed in) and
 * omit cookies entirely; browser clients keep the httpOnly-cookie flow via
 * `credentials: "include"`. Mutates `headers` and returns the credentials mode.
 */
function applyAuthTransport(headers: Headers): RequestCredentials {
  if (nativeClient) {
    headers.set(CLIENT_HEADER, CLIENT_DESKTOP);
    if (authToken) {
      headers.set("Authorization", `Bearer ${authToken}`);
    }
    return "omit";
  }
  return "include";
}

/** In-flight refresh, so a burst of concurrent 401s triggers exactly one. */
let refreshInFlight: Promise<boolean> | null = null;

/**
 * Attempts to renew the access token from the stored refresh token (native
 * only). Updates the in-memory tokens and notifies the persistence handler on
 * success. Returns false (signed out) when there's no refresh token or the
 * refresh is rejected. Deduplicated across concurrent callers.
 */
function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function doRefresh(): Promise<boolean> {
  if (!nativeClient || !refreshToken) return false;
  try {
    const headers = new Headers({ "Content-Type": "application/json", [CLIENT_HEADER]: CLIENT_DESKTOP });
    const resp = await fetch(buildUrl("auth/refresh"), {
      method: "POST",
      credentials: "omit",
      headers,
      body: JSON.stringify({ refreshToken }),
    });
    if (!resp.ok) return false;
    const data = (await resp.json()) as { accessToken?: string; refreshToken?: string };
    if (!data.accessToken) return false;
    authToken = data.accessToken;
    refreshToken = data.refreshToken ?? refreshToken;
    onTokensRefreshed?.(authToken, refreshToken ?? "");
    return true;
  } catch {
    return false;
  }
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
/**
 * `fetch`, but a *transport* failure becomes a typed {@link ApiError} instead
 * of the platform's bare rejection. Only responses go through
 * {@link parseApiError}; when the request never reaches a server at all —
 * gateway down, wrong origin, DNS, offline, TLS — `fetch` rejects with a
 * `TypeError` whose message is whatever the engine felt like ("Load failed" on
 * WebKit, "Failed to fetch" on Chromium). UI that renders `err.message` then
 * shows the user that string verbatim, which names neither the cause nor
 * anything they can act on.
 *
 * The replacement names the origin actually being dialled, which is the one
 * fact that makes this diagnosable — a desktop build points at whatever gateway
 * URL it was built with or later overridden to.
 */
async function fetchOrUnavailable(url: string, config: RequestInit): Promise<Response> {
  try {
    return await fetch(url, config);
  } catch {
    throw new ApiError(
      0,
      "UNAVAILABLE",
      `Can't reach the Inkwell server at ${getApiBaseUrl()}. Check your connection and try again.`,
    );
  }
}

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
 * Generic JSON API client for the Inkwell gateway. Authentication adapts to the
 * runtime: browser clients carry the httpOnly `inkwell_token` cookie
 * (`credentials: "include"`), while the native desktop client sends an
 * `Authorization: Bearer` token and omits cookies (see {@link setNativeClient}
 * / {@link setAuthToken}). Treats HTTP 204 No Content as an empty object.
 *
 * @param endpoint - Path relative to the gateway base URL (e.g. `"projects"`).
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
  const credentials = applyAuthTransport(headers);

  const config: RequestInit = {
    credentials,
    ...customOptions,
    headers,
  };

  if (!config.method) {
    config.method = body ? "POST" : "GET";
  }

  if (body) {
    config.body = JSON.stringify(body);
  }

  let response = await fetchOrUnavailable(buildUrl(endpoint), config);

  // On a 401, a native client renews its access token from the refresh token
  // and retries the request once before treating the session as expired.
  if (
    response.status === 401 &&
    nativeClient &&
    refreshToken &&
    endpoint.replace(/^\/+/, "") !== "auth/refresh" &&
    (await tryRefresh())
  ) {
    const retryHeaders = new Headers(customHeaders);
    retryHeaders.set("Content-Type", "application/json");
    const retryCredentials = applyAuthTransport(retryHeaders); // picks up the new bearer
    response = await fetchOrUnavailable(buildUrl(endpoint), { ...config, credentials: retryCredentials, headers: retryHeaders });
  }

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
 * Streaming variant of `apiClient`. Uses the same adaptive authentication as
 * `apiClient` (httpOnly cookie on the web, bearer token on the native desktop
 * client) and returns the raw `ReadableStream<Uint8Array>` instead of parsing
 * JSON. Used for Server-Sent Events and NDJSON AI chat responses.
 *
 * @param endpoint - Path relative to the gateway base URL.
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
  const credentials = applyAuthTransport(headers);

  const config: RequestInit = {
    credentials,
    ...customOptions,
    headers,
  };

  if (!config.method) {
    config.method = body ? "POST" : "GET";
  }

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetchOrUnavailable(buildUrl(endpoint), config);

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
