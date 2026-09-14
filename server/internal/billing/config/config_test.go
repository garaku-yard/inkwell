package config

import "testing"

func TestLoadPaddleConfiguration(t *testing.T) {
	for _, key := range []string{"PADDLE_API_KEY", "PADDLE_WEBHOOK_SECRET", "PADDLE_PRICE_MAP", "PADDLE_ENVIRONMENT"} {
		t.Setenv(key, "")
	}
	if cfg, err := Load(); err != nil || cfg.PaddleConfig.Configured() {
		t.Fatalf("empty Paddle config = configured %v, err %v", cfg != nil && cfg.PaddleConfig.Configured(), err)
	}

	t.Setenv("PADDLE_API_KEY", "pdl_test_key")
	if _, err := Load(); err == nil {
		t.Fatal("partial Paddle config should fail")
	}

	t.Setenv("PADDLE_WEBHOOK_SECRET", "pdl_ntfset_secret")
	t.Setenv("PADDLE_PRICE_MAP", "not-json")
	if _, err := Load(); err == nil {
		t.Fatal("malformed price map should fail")
	}

	t.Setenv("PADDLE_PRICE_MAP", `{"pro:monthly":"pri_month","pro:yearly":"pri_year"}`)
	t.Setenv("PADDLE_ENVIRONMENT", "sandbox")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("complete Paddle config: %v", err)
	}
	if !cfg.PaddleConfig.Configured() || cfg.PaddleConfig.PriceMap["pro:yearly"] != "pri_year" {
		t.Fatalf("Paddle config not loaded: %+v", cfg.PaddleConfig)
	}
}
