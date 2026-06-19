package paddle

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"
)

// sign produces a valid Paddle-Signature header for body at ts under secret.
func sign(secret string, ts int64, body []byte) string {
	tsStr := strconv.FormatInt(ts, 10)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(tsStr))
	mac.Write([]byte(":"))
	mac.Write(body)
	return "ts=" + tsStr + ";h1=" + hex.EncodeToString(mac.Sum(nil))
}

func TestVerifySignature(t *testing.T) {
	const secret = "pdl_ntfset_testsecret"
	now := time.Unix(1_700_000_000, 0)
	body := []byte(`{"event_id":"evt_1","event_type":"subscription.updated"}`)
	good := sign(secret, now.Unix(), body)

	tests := []struct {
		name    string
		header  string
		body    []byte
		now     time.Time
		wantErr bool
	}{
		{"valid", good, body, now, false},
		{"wrong secret produces mismatch", sign("other", now.Unix(), body), body, now, true},
		{"tampered body", good, []byte(`{"event_id":"evt_evil"}`), now, true},
		{"stale timestamp", sign(secret, now.Unix()-3600, body), body, now, true},
		{"future timestamp", sign(secret, now.Unix()+3600, body), body, now, true},
		{"missing h1", "ts=1700000000", body, now, true},
		{"garbage header", "nonsense", body, now, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := VerifySignature(secret, tc.header, tc.body, tc.now, DefaultTolerance)
			if tc.wantErr && err == nil {
				t.Fatal("expected error, got nil")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("expected ok, got %v", err)
			}
		})
	}
}

func TestParseEventSubscription(t *testing.T) {
	body := []byte(`{
		"event_id": "evt_123",
		"event_type": "subscription.created",
		"data": {
			"id": "sub_abc",
			"status": "active",
			"customer_id": "ctm_xyz",
			"items": [{"price": {"id": "pri_pro"}}],
			"current_billing_period": {"starts_at": "2026-01-01T00:00:00Z", "ends_at": "2026-02-01T00:00:00Z"},
			"custom_data": {"user_id": "user-1", "tier_id": "tier-pro"}
		}
	}`)
	evt, err := ParseEvent(body)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if evt.EventType != "subscription.created" || evt.Subscription == nil {
		t.Fatalf("unexpected event: %+v", evt)
	}
	s := evt.Subscription
	if s.ID != "sub_abc" || s.Status != "active" || s.CustomerID != "ctm_xyz" {
		t.Errorf("core fields wrong: %+v", s)
	}
	if s.PriceID != "pri_pro" {
		t.Errorf("price id = %q, want pri_pro", s.PriceID)
	}
	if s.UserID != "user-1" || s.TierID != "tier-pro" {
		t.Errorf("custom_data not mapped: user=%q tier=%q", s.UserID, s.TierID)
	}
	if s.CurrentPeriodEnd.IsZero() {
		t.Error("period end not parsed")
	}
}

func TestParseEventNonSubscriptionIgnored(t *testing.T) {
	body := []byte(`{"event_id":"evt_1","event_type":"transaction.completed","data":{"id":"txn_1"}}`)
	evt, err := ParseEvent(body)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if evt.Subscription != nil {
		t.Errorf("transaction event should not parse a subscription, got %+v", evt.Subscription)
	}
}

func TestCreateCheckout(t *testing.T) {
	var gotAuth, gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"id":"txn_1","checkout":{"url":"https://pay.paddle.com/abc?_ptxn=txn_1"}}}`))
	}))
	defer srv.Close()

	c := New("pdl_test_key", "sandbox").WithBaseURL(srv.URL)
	url, err := c.CreateCheckout(context.Background(), "pri_pro", 3, map[string]string{"user_id": "u1", "tier_id": "t1"})
	if err != nil {
		t.Fatalf("checkout: %v", err)
	}
	if url != "https://pay.paddle.com/abc?_ptxn=txn_1" {
		t.Errorf("url = %q", url)
	}
	if gotAuth != "Bearer pdl_test_key" {
		t.Errorf("auth header = %q", gotAuth)
	}
	if !contains(gotBody, "pri_pro") || !contains(gotBody, "user_id") {
		t.Errorf("request body missing price/custom data: %s", gotBody)
	}
	if !contains(gotBody, `"quantity":3`) {
		t.Errorf("request body missing seat quantity: %s", gotBody)
	}
}

func TestCreateCheckoutNoURL(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"id":"txn_1","checkout":{"url":""}}}`))
	}))
	defer srv.Close()
	c := New("k", "sandbox").WithBaseURL(srv.URL)
	if _, err := c.CreateCheckout(context.Background(), "pri_x", 1, nil); err == nil {
		t.Fatal("expected error when checkout URL is empty")
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
