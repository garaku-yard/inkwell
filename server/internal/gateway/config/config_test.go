package config

import "testing"

func clearManagedAIEnv(t *testing.T) {
	t.Helper()
	for _, kind := range []string{"OPENAI", "ANTHROPIC", "GEMINI"} {
		t.Setenv("AI_MANAGED_"+kind+"_KEY", "")
		t.Setenv("AI_MANAGED_"+kind+"_MODEL", "")
	}
}

func TestManagedAIStaysDisabledWithoutKeys(t *testing.T) {
	clearManagedAIEnv(t)

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(cfg.ManagedAIProviders) != 0 {
		t.Fatalf("managed providers = %#v, want none", cfg.ManagedAIProviders)
	}
}

func TestManagedAIEnablesOnlyKeyedProvider(t *testing.T) {
	clearManagedAIEnv(t)
	t.Setenv("AI_MANAGED_GEMINI_KEY", "test-key")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(cfg.ManagedAIProviders) != 1 {
		t.Fatalf("managed provider count = %d, want 1", len(cfg.ManagedAIProviders))
	}
	provider, ok := cfg.ManagedAIProviders["gemini"]
	if !ok {
		t.Fatal("Gemini provider was not enabled")
	}
	if provider.APIKey != "test-key" {
		t.Fatalf("API key = %q, want test key", provider.APIKey)
	}
	if provider.DefaultModel != "gemini-3.5-flash-lite" {
		t.Fatalf("default model = %q", provider.DefaultModel)
	}
}

func TestManagedAIUsesOperatorModelOverride(t *testing.T) {
	clearManagedAIEnv(t)
	t.Setenv("AI_MANAGED_OPENAI_KEY", "test-key")
	t.Setenv("AI_MANAGED_OPENAI_MODEL", "operator-selected-model")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got := cfg.ManagedAIProviders["openai"].DefaultModel; got != "operator-selected-model" {
		t.Fatalf("default model = %q, want operator override", got)
	}
}
