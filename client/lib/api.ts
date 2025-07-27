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
    method: body ? "POST" : "GET",
    ...customOptions,
    headers,
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}/${endpoint}`, config);

  // ✅ Handle empty response (like 204 No Content)
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
