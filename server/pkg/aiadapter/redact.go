package aiadapter

import "regexp"

// keyPattern matches the public-prefix forms of API keys shipped by the
// providers we integrate with: OpenAI (`sk-…`, project keys `sk-proj-…`),
// Anthropic (`sk-ant-…`), Google AI Studio (`AIza…`). A provider's error
// response occasionally echoes the offending key back in plain text; we
// never want that text to reach our logs or our HTTP responses.
//
// The pattern deliberately matches broadly (the longest reasonable
// continuation) so near-variants stay redacted. It is not a perfect
// guard — a provider is free to invent new key formats — so new hosted
// providers should extend this list before going live.
var keyPattern = regexp.MustCompile(
	`(?:sk-(?:ant-)?(?:proj-)?[A-Za-z0-9_\-]{8,}|AIza[A-Za-z0-9_\-]{20,})`,
)

// redact replaces anything matching keyPattern with "<redacted>". Safe to
// call on arbitrary provider response bodies before embedding them in
// ErrProvider.Message.
func redact(s string) string {
	return keyPattern.ReplaceAllString(s, "<redacted>")
}
