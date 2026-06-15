package handlers

import (
	"errors"
	"net/url"
	"slices"
)

// ValidateOpenAICompatibleURL checks that rawURL is a well-formed http(s)
// URL whose host matches an entry in the operator-supplied allowlist. The
// allowlist is exact-match against the URL's Host field, which is
// "host:port" when the URL specifies an explicit port and just "host"
// when the port is implicit (80/443). Operators should configure entries
// in the same form their users will save (e.g. `ollama.internal:11434`).
//
// Returns ErrOpenAICompatibleDisabled when the allowlist is empty (the
// kind is opted out at the deployment) and ErrOpenAICompatibleHostDenied
// when the URL parses but is not on the list. Callers map these to
// user-facing 400s with distinct copy.
func ValidateOpenAICompatibleURL(rawURL string, allowlist []string) error {
	if len(allowlist) == 0 {
		return ErrOpenAICompatibleDisabled
	}
	if rawURL == "" {
		return ErrOpenAICompatibleHostDenied
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return ErrOpenAICompatibleHostDenied
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return ErrOpenAICompatibleHostDenied
	}
	if u.Host == "" {
		return ErrOpenAICompatibleHostDenied
	}
	if !slices.Contains(allowlist, u.Host) {
		return ErrOpenAICompatibleHostDenied
	}
	return nil
}

var (
	ErrOpenAICompatibleDisabled   = errors.New("openai_compatible providers are not enabled on this server")
	ErrOpenAICompatibleHostDenied = errors.New("openai_compatible baseUrl host is not allowlisted on this server")
)
