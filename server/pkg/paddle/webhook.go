package paddle

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// ErrInvalidSignature is returned when a webhook body fails HMAC verification or
// its timestamp is outside the tolerance window (replay protection).
var ErrInvalidSignature = errors.New("paddle: invalid webhook signature")

// DefaultTolerance is the timestamp skew Paddle's own SDKs allow before treating
// a webhook as a replay.
const DefaultTolerance = 5 * time.Second

// VerifySignature checks a Paddle Billing webhook against the endpoint secret.
// The Paddle-Signature header has the form "ts=<unix>;h1=<hex>"; the signed
// payload is "<ts>:<rawBody>" hashed with HMAC-SHA256 under the secret. The
// comparison is constant-time and the timestamp must be within tolerance of now.
//
// rawBody MUST be the exact bytes Paddle sent — any re-encoding changes the hash.
func VerifySignature(secret, header string, rawBody []byte, now time.Time, tolerance time.Duration) error {
	var ts, h1 string
	for _, part := range strings.Split(header, ";") {
		k, v, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			continue
		}
		switch k {
		case "ts":
			ts = v
		case "h1":
			h1 = v
		}
	}
	if ts == "" || h1 == "" {
		return ErrInvalidSignature
	}

	tsUnix, err := strconv.ParseInt(ts, 10, 64)
	if err != nil {
		return ErrInvalidSignature
	}
	if diff := now.Unix() - tsUnix; diff > int64(tolerance.Seconds()) || diff < -int64(tolerance.Seconds()) {
		return fmt.Errorf("%w: timestamp outside tolerance", ErrInvalidSignature)
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts))
	mac.Write([]byte(":"))
	mac.Write(rawBody)
	expected := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(expected), []byte(h1)) {
		return ErrInvalidSignature
	}
	return nil
}

// Event is the parsed shape of a Paddle webhook. Subscription is populated only
// for subscription.* events; other event types parse with a nil Subscription so
// the caller can ignore them.
type Event struct {
	EventID      string
	EventType    string
	Subscription *Subscription
}

// Subscription is the subset of a Paddle subscription object the billing service
// needs to mirror into user_subscriptions.
type Subscription struct {
	ID                 string     // Paddle subscription id (sub_...)
	Status             string     // active | trialing | past_due | paused | canceled
	CustomerID         string     // Paddle customer id (ctm_...)
	PriceID            string     // first item's price id (pri_...)
	Quantity           int        // first item's quantity (seats); 1 when absent
	UserID             string     // from custom_data.user_id
	TierID             string     // from custom_data.tier_id
	BillingCycle       string     // from custom_data.billing_cycle
	CurrentPeriodStart time.Time  // current_billing_period.starts_at
	CurrentPeriodEnd   time.Time  // current_billing_period.ends_at
	CanceledAt         *time.Time // canceled_at, when set
}

// ParseEvent decodes a webhook body. It never fails on unknown event types; it
// returns an Event with a nil Subscription so callers switch on EventType.
func ParseEvent(rawBody []byte) (*Event, error) {
	var env struct {
		EventID   string          `json:"event_id"`
		EventType string          `json:"event_type"`
		Data      json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(rawBody, &env); err != nil {
		return nil, fmt.Errorf("paddle: decode webhook envelope: %w", err)
	}

	evt := &Event{EventID: env.EventID, EventType: env.EventType}
	if !strings.HasPrefix(env.EventType, "subscription.") {
		return evt, nil
	}

	var d struct {
		ID         string `json:"id"`
		Status     string `json:"status"`
		CustomerID string `json:"customer_id"`
		Items      []struct {
			Quantity int `json:"quantity"`
			Price    struct {
				ID string `json:"id"`
			} `json:"price"`
		} `json:"items"`
		CurrentBillingPeriod struct {
			StartsAt time.Time `json:"starts_at"`
			EndsAt   time.Time `json:"ends_at"`
		} `json:"current_billing_period"`
		CustomData struct {
			UserID       string `json:"user_id"`
			TierID       string `json:"tier_id"`
			BillingCycle string `json:"billing_cycle"`
		} `json:"custom_data"`
		CanceledAt *time.Time `json:"canceled_at"`
	}
	if err := json.Unmarshal(env.Data, &d); err != nil {
		return nil, fmt.Errorf("paddle: decode subscription data: %w", err)
	}

	sub := &Subscription{
		ID:                 d.ID,
		Status:             d.Status,
		CustomerID:         d.CustomerID,
		UserID:             d.CustomData.UserID,
		TierID:             d.CustomData.TierID,
		BillingCycle:       d.CustomData.BillingCycle,
		CurrentPeriodStart: d.CurrentBillingPeriod.StartsAt,
		CurrentPeriodEnd:   d.CurrentBillingPeriod.EndsAt,
		CanceledAt:         d.CanceledAt,
	}
	sub.Quantity = 1
	if len(d.Items) > 0 {
		sub.PriceID = d.Items[0].Price.ID
		if d.Items[0].Quantity > 0 {
			sub.Quantity = d.Items[0].Quantity
		}
	}
	evt.Subscription = sub
	return evt, nil
}
