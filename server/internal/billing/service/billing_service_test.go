package service

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"inkwell/server/internal/billing/domain"
	"inkwell/server/internal/billing/repository"
	"inkwell/server/pkg/paddle"
)

// fakeRepo embeds the repository interface so unused methods panic if reached;
// the checkout path only needs GetTierByID.
type fakeRepo struct {
	repository.BillingRepository
	tier    *domain.SubscriptionTier
	tierErr error
}

func (f *fakeRepo) GetTierByID(_ context.Context, _ uuid.UUID) (*domain.SubscriptionTier, error) {
	return f.tier, f.tierErr
}

// fakeCheckout records what CreateCheckout was called with.
type fakeCheckout struct {
	gotPrice string
	gotData  map[string]string
	url      string
	err      error
}

func (f *fakeCheckout) CreateCheckout(_ context.Context, priceID string, customData map[string]string) (string, error) {
	f.gotPrice, f.gotData = priceID, customData
	return f.url, f.err
}

func newSvc(repo repository.BillingRepository, payment PaymentConfig) *billingService {
	return &billingService{repo: repo, payment: payment}
}

func TestCreateCheckout(t *testing.T) {
	userID, tierID := uuid.New(), uuid.New()
	proTier := &domain.SubscriptionTier{ID: tierID, Slug: "pro"}

	t.Run("not configured", func(t *testing.T) {
		s := newSvc(&fakeRepo{tier: proTier}, PaymentConfig{}) // Checkout nil
		if _, err := s.CreateCheckout(context.Background(), userID, tierID); !errors.Is(err, domain.ErrGatewayNotConfigured) {
			t.Fatalf("err = %v, want ErrGatewayNotConfigured", err)
		}
	})

	t.Run("price not mapped", func(t *testing.T) {
		s := newSvc(&fakeRepo{tier: proTier}, PaymentConfig{
			Checkout: &fakeCheckout{},
			PriceMap: map[string]string{"business": "pri_biz"}, // no "pro"
		})
		if _, err := s.CreateCheckout(context.Background(), userID, tierID); !errors.Is(err, domain.ErrPriceNotConfigured) {
			t.Fatalf("err = %v, want ErrPriceNotConfigured", err)
		}
	})

	t.Run("happy path", func(t *testing.T) {
		fc := &fakeCheckout{url: "https://pay.paddle.com/abc"}
		s := newSvc(&fakeRepo{tier: proTier}, PaymentConfig{
			Checkout: fc,
			PriceMap: map[string]string{"pro": "pri_pro"},
		})
		url, err := s.CreateCheckout(context.Background(), userID, tierID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if url != "https://pay.paddle.com/abc" {
			t.Errorf("url = %q", url)
		}
		if fc.gotPrice != "pri_pro" {
			t.Errorf("price = %q, want pri_pro", fc.gotPrice)
		}
		if fc.gotData["user_id"] != userID.String() || fc.gotData["tier_id"] != tierID.String() {
			t.Errorf("custom data not stamped: %+v", fc.gotData)
		}
	})
}

func TestProcessWebhookGuards(t *testing.T) {
	t.Run("not configured", func(t *testing.T) {
		s := newSvc(&fakeRepo{}, PaymentConfig{}) // empty WebhookSecret
		if err := s.ProcessWebhook(context.Background(), "ts=1;h1=x", []byte("{}")); !errors.Is(err, domain.ErrGatewayNotConfigured) {
			t.Fatalf("err = %v, want ErrGatewayNotConfigured", err)
		}
	})

	t.Run("bad signature rejected", func(t *testing.T) {
		s := newSvc(&fakeRepo{}, PaymentConfig{WebhookSecret: "secret"})
		err := s.ProcessWebhook(context.Background(), "garbage", []byte("{}"))
		if !errors.Is(err, paddle.ErrInvalidSignature) {
			t.Fatalf("err = %v, want ErrInvalidSignature", err)
		}
	})
}

func TestMapPaddleStatus(t *testing.T) {
	cases := map[string]string{
		"active":   "active",
		"trialing": "trialing",
		"past_due": "past_due",
		"canceled": "canceled",
		"paused":   "past_due", // no direct equivalent — suspend access, keep row
		"weird":    "past_due", // unknown fails safe
	}
	for in, want := range cases {
		if got := mapPaddleStatus(in); got != want {
			t.Errorf("mapPaddleStatus(%q) = %q, want %q", in, got, want)
		}
	}
}
