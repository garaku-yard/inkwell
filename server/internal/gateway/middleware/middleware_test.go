package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// okHandler is a trivial next-handler that records whether it was reached.
func okHandler(reached *bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		*reached = true
		w.WriteHeader(http.StatusOK)
	})
}

func TestOriginCheckTokenClientExempt(t *testing.T) {
	allowed := []string{"https://app.example.com"}
	mw := OriginCheck(allowed, "production")

	t.Run("desktop client with off-allowlist origin passes", func(t *testing.T) {
		var reached bool
		r := httptest.NewRequest(http.MethodPost, "/api/v1/login", nil)
		r.Header.Set("Origin", "tauri://localhost")
		r.Header.Set(clientHeader, clientDesktop)
		w := httptest.NewRecorder()
		mw(okHandler(&reached)).ServeHTTP(w, r)
		if !reached || w.Code != http.StatusOK {
			t.Fatalf("desktop client blocked: reached=%v code=%d", reached, w.Code)
		}
	})

	t.Run("bearer client with off-allowlist origin passes", func(t *testing.T) {
		var reached bool
		r := httptest.NewRequest(http.MethodPost, "/api/v1/projects", nil)
		r.Header.Set("Origin", "https://evil.example.com")
		r.Header.Set("Authorization", "Bearer abc")
		w := httptest.NewRecorder()
		mw(okHandler(&reached)).ServeHTTP(w, r)
		if !reached || w.Code != http.StatusOK {
			t.Fatalf("bearer client blocked: reached=%v code=%d", reached, w.Code)
		}
	})

	t.Run("cookie client with off-allowlist origin is rejected", func(t *testing.T) {
		var reached bool
		r := httptest.NewRequest(http.MethodPost, "/api/v1/projects", nil)
		r.Header.Set("Origin", "https://evil.example.com")
		w := httptest.NewRecorder()
		mw(okHandler(&reached)).ServeHTTP(w, r)
		if reached || w.Code != http.StatusForbidden {
			t.Fatalf("cookie CSRF not blocked: reached=%v code=%d", reached, w.Code)
		}
	})

	t.Run("cookie client with allowlisted origin passes", func(t *testing.T) {
		var reached bool
		r := httptest.NewRequest(http.MethodPost, "/api/v1/projects", nil)
		r.Header.Set("Origin", "https://app.example.com")
		w := httptest.NewRecorder()
		mw(okHandler(&reached)).ServeHTTP(w, r)
		if !reached || w.Code != http.StatusOK {
			t.Fatalf("allowlisted browser blocked: reached=%v code=%d", reached, w.Code)
		}
	})
}

func TestCORSTokenClientOrigin(t *testing.T) {
	allowed := []string{"https://app.example.com"}
	mw := CORS(allowed, "production")

	t.Run("native client origin echoed without credentials", func(t *testing.T) {
		var reached bool
		r := httptest.NewRequest(http.MethodPost, "/api/v1/login", nil)
		r.Header.Set("Origin", "tauri://localhost")
		r.Header.Set(clientHeader, clientDesktop)
		w := httptest.NewRecorder()
		mw(okHandler(&reached)).ServeHTTP(w, r)

		if got := w.Header().Get("Access-Control-Allow-Origin"); got != "tauri://localhost" {
			t.Errorf("ACAO = %q, want the echoed native origin", got)
		}
		if got := w.Header().Get("Access-Control-Allow-Credentials"); got != "" {
			t.Errorf("Allow-Credentials = %q, want empty for token clients", got)
		}
	})

	t.Run("allowlisted browser gets credentialed CORS", func(t *testing.T) {
		var reached bool
		r := httptest.NewRequest(http.MethodPost, "/api/v1/projects", nil)
		r.Header.Set("Origin", "https://app.example.com")
		w := httptest.NewRecorder()
		mw(okHandler(&reached)).ServeHTTP(w, r)

		if got := w.Header().Get("Access-Control-Allow-Origin"); got != "https://app.example.com" {
			t.Errorf("ACAO = %q, want the allowlisted origin", got)
		}
		if got := w.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
			t.Errorf("Allow-Credentials = %q, want true for browsers", got)
		}
	})

	t.Run("off-allowlist non-token origin gets no ACAO", func(t *testing.T) {
		var reached bool
		r := httptest.NewRequest(http.MethodGet, "/api/v1/projects", nil)
		r.Header.Set("Origin", "https://evil.example.com")
		w := httptest.NewRecorder()
		mw(okHandler(&reached)).ServeHTTP(w, r)

		if got := w.Header().Get("Access-Control-Allow-Origin"); got != "" {
			t.Errorf("ACAO = %q, want empty for a disallowed plain origin", got)
		}
	})

	t.Run("preflight advertising Authorization is allowed", func(t *testing.T) {
		var reached bool
		r := httptest.NewRequest(http.MethodOptions, "/api/v1/login", nil)
		r.Header.Set("Origin", "tauri://localhost")
		r.Header.Set("Access-Control-Request-Method", "POST")
		r.Header.Set("Access-Control-Request-Headers", "authorization, content-type, x-inkwell-client")
		w := httptest.NewRecorder()
		mw(okHandler(&reached)).ServeHTTP(w, r)

		if w.Code != http.StatusNoContent {
			t.Errorf("preflight status = %d, want 204", w.Code)
		}
		if got := w.Header().Get("Access-Control-Allow-Origin"); got != "tauri://localhost" {
			t.Errorf("preflight ACAO = %q, want the echoed native origin", got)
		}
		if reached {
			t.Error("preflight should short-circuit, not reach the handler")
		}
	})

	t.Run("preflight from a plain off-allowlist origin is forbidden", func(t *testing.T) {
		var reached bool
		r := httptest.NewRequest(http.MethodOptions, "/api/v1/projects", nil)
		r.Header.Set("Origin", "https://evil.example.com")
		r.Header.Set("Access-Control-Request-Method", "POST")
		r.Header.Set("Access-Control-Request-Headers", "content-type")
		w := httptest.NewRecorder()
		mw(okHandler(&reached)).ServeHTTP(w, r)

		if w.Code != http.StatusForbidden {
			t.Errorf("preflight status = %d, want 403", w.Code)
		}
	})
}
