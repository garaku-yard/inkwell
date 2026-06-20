import { ApiError } from "@/lib/api"

/** Translates a chat-flow error into copy a writer can act on. The
 *  default message from the gateway ("Provider rejected the request")
 *  is technically correct but uninformative; mapping common cases gives
 *  the user a next step instead of a shrug. */
export function friendlyChatError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 401:
        return "Your saved API key was rejected. Open Settings → AI Providers and re-enter it."
      case 403:
        return "The provider blocked this request — usually a quota, region, or billing limit. Check the provider dashboard."
      case 404:
        return "Model not found. Pick a different one in Settings → AI Providers."
      case 429:
        // A managed-AI allowance hit carries a specific, actionable message;
        // a provider rate-limit doesn't. Distinguish by the error code.
        if (err.code === "RESOURCE_EXHAUSTED") return err.message
        return "Rate-limited by the provider. Wait a moment and try again."
      case 502:
      case 503:
      case 504:
        return "Couldn't reach the provider. Check your network or the provider's status page."
      case 400:
        // 400s are usually our own validation; pass them through verbatim.
        return err.message
    }
  }
  if (err instanceof Error && /network|fetch failed|failed to fetch/i.test(err.message)) {
    return "Network error — can't reach Inkwell's gateway. Check your connection."
  }
  return err instanceof Error ? err.message : "Something went wrong."
}
