// Package paddle is a thin client for the Paddle Billing API plus webhook
// signature verification and event parsing. It is the server-side counterpart to
// the BYO AI adapters in pkg/aiadapter: a focused integration that the billing
// service drives, holding no state of its own.
//
// Paddle is a Merchant of Record — it hosts checkout, collects payment, and
// remits tax — so this client stays deliberately small: create a transaction to
// obtain a hosted checkout link, and verify + parse the subscription webhooks
// Paddle sends back. Everything else (subscription persistence, tier mapping)
// lives in the billing service.
package paddle

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	prodBaseURL    = "https://api.paddle.com"
	sandboxBaseURL = "https://sandbox-api.paddle.com"
)

// Client talks to the Paddle Billing REST API with an account API key.
type Client struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client
}

// New returns a Client for the given API key and environment. Any environment
// other than "production" uses Paddle's sandbox host, so a misconfigured value
// fails safe (sandbox) rather than charging real cards.
func New(apiKey, environment string) *Client {
	base := sandboxBaseURL
	if environment == "production" {
		base = prodBaseURL
	}
	return &Client{
		apiKey:     apiKey,
		baseURL:    base,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

// WithHTTPClient overrides the HTTP client (used by tests to point at a stub).
func (c *Client) WithHTTPClient(h *http.Client) *Client {
	c.httpClient = h
	return c
}

// WithBaseURL overrides the API host (used by tests).
func (c *Client) WithBaseURL(u string) *Client {
	c.baseURL = u
	return c
}

// CreateCheckout creates an automatically-collected transaction for a price and
// seat quantity and returns its hosted checkout URL. The customData map (user_id,
// tier_id) is stored on the transaction and copied onto the subscription Paddle
// creates, so the subscription webhooks carry it back to us. A quantity below 1
// is treated as a single seat.
func (c *Client) CreateCheckout(ctx context.Context, priceID string, quantity int, customData map[string]string) (string, error) {
	if quantity < 1 {
		quantity = 1
	}
	reqBody, err := json.Marshal(map[string]any{
		"items":       []map[string]any{{"price_id": priceID, "quantity": quantity}},
		"custom_data": customData,
	})
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/transactions", bytes.NewReader(reqBody))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Paddle-Version", "1")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("paddle: create transaction: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("paddle: create transaction returned %d: %s", resp.StatusCode, string(body))
	}

	var parsed struct {
		Data struct {
			ID       string `json:"id"`
			Checkout struct {
				URL string `json:"url"`
			} `json:"checkout"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", fmt.Errorf("paddle: decode transaction response: %w", err)
	}
	if parsed.Data.Checkout.URL == "" {
		return "", fmt.Errorf("paddle: transaction %s has no checkout URL (is a default payment link configured?)", parsed.Data.ID)
	}
	return parsed.Data.Checkout.URL, nil
}
