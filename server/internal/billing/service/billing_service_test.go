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
// the checkout/sync paths need GetTierByID and GetSubscriptionByUserID.
type fakeRepo struct {
	repository.BillingRepository
	tier      *domain.SubscriptionTier
	tierErr   error
	sub       *domain.UserSubscription
	subErr    error
	totals    map[uuid.UUID]map[string]int64
	totalsErr error
	monthly   map[uuid.UUID]map[string]int64
}

func (f *fakeRepo) GetTierByID(_ context.Context, _ uuid.UUID) (*domain.SubscriptionTier, error) {
	return f.tier, f.tierErr
}

func (f *fakeRepo) ListUsageTotalsBatch(_ context.Context, _ []uuid.UUID) (map[uuid.UUID]map[string]int64, error) {
	return f.totals, f.totalsErr
}

func (f *fakeRepo) GetMonthlyUsageBatch(_ context.Context, _ []uuid.UUID, _ []string) (map[uuid.UUID]map[string]int64, error) {
	return f.monthly, nil
}

func (f *fakeRepo) GetSubscriptionByUserID(_ context.Context, _ uuid.UUID) (*domain.UserSubscription, error) {
	if f.subErr != nil {
		return nil, f.subErr
	}
	return f.sub, nil
}

// fakeUpdater records the gateway seat-update call.
type fakeUpdater struct {
	gotSub   string
	gotPrice string
	gotQty   int
	err      error
}

func (f *fakeUpdater) UpdateSubscriptionQuantity(_ context.Context, subID, priceID string, qty int) error {
	f.gotSub, f.gotPrice, f.gotQty = subID, priceID, qty
	return f.err
}

// fakeCheckout records what CreateCheckout was called with.
type fakeCheckout struct {
	gotPrice string
	gotQty   int
	gotData  map[string]string
	url      string
	err      error
}

func (f *fakeCheckout) CreateCheckout(_ context.Context, priceID string, quantity int, customData map[string]string) (string, error) {
	f.gotPrice, f.gotQty, f.gotData = priceID, quantity, customData
	return f.url, f.err
}

func newSvc(repo repository.BillingRepository, payment PaymentConfig) *billingService {
	return &billingService{repo: repo, payment: payment}
}

func TestCreateCheckout(t *testing.T) {
	userID, tierID := uuid.New(), uuid.New()
	proTier := &domain.SubscriptionTier{ID: tierID, Slug: "pro"}
	bizTier := &domain.SubscriptionTier{ID: tierID, Slug: "business", PerSeat: true}

	t.Run("not configured", func(t *testing.T) {
		s := newSvc(&fakeRepo{tier: proTier}, PaymentConfig{}) // Checkout nil
		if _, err := s.CreateCheckout(context.Background(), userID, tierID, 1); !errors.Is(err, domain.ErrGatewayNotConfigured) {
			t.Fatalf("err = %v, want ErrGatewayNotConfigured", err)
		}
	})

	t.Run("price not mapped", func(t *testing.T) {
		s := newSvc(&fakeRepo{tier: proTier}, PaymentConfig{
			Checkout: &fakeCheckout{},
			PriceMap: map[string]string{"business": "pri_biz"}, // no "pro"
		})
		if _, err := s.CreateCheckout(context.Background(), userID, tierID, 1); !errors.Is(err, domain.ErrPriceNotConfigured) {
			t.Fatalf("err = %v, want ErrPriceNotConfigured", err)
		}
	})

	t.Run("flat tier ignores seat quantity", func(t *testing.T) {
		fc := &fakeCheckout{url: "https://pay.paddle.com/abc"}
		s := newSvc(&fakeRepo{tier: proTier}, PaymentConfig{
			Checkout: fc,
			PriceMap: map[string]string{"pro": "pri_pro"},
		})
		if _, err := s.CreateCheckout(context.Background(), userID, tierID, 5); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if fc.gotPrice != "pri_pro" {
			t.Errorf("price = %q, want pri_pro", fc.gotPrice)
		}
		if fc.gotQty != 1 {
			t.Errorf("flat tier quantity = %d, want 1", fc.gotQty)
		}
		if fc.gotData["user_id"] != userID.String() || fc.gotData["tier_id"] != tierID.String() {
			t.Errorf("custom data not stamped: %+v", fc.gotData)
		}
	})

	t.Run("per-seat tier honours seat quantity", func(t *testing.T) {
		fc := &fakeCheckout{url: "https://pay.paddle.com/biz"}
		s := newSvc(&fakeRepo{tier: bizTier}, PaymentConfig{
			Checkout: fc,
			PriceMap: map[string]string{"business": "pri_biz"},
		})
		if _, err := s.CreateCheckout(context.Background(), userID, tierID, 5); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if fc.gotQty != 5 {
			t.Errorf("per-seat quantity = %d, want 5", fc.gotQty)
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

func TestSyncSeats(t *testing.T) {
	userID := uuid.New()

	t.Run("no subscription is a no-op", func(t *testing.T) {
		s := newSvc(&fakeRepo{subErr: domain.ErrSubscriptionNotFound}, PaymentConfig{Updater: &fakeUpdater{}})
		if err := s.SyncSeats(context.Background(), userID, 5); err != nil {
			t.Fatalf("err = %v, want nil", err)
		}
	})

	t.Run("inactive subscription is a no-op", func(t *testing.T) {
		up := &fakeUpdater{}
		s := newSvc(&fakeRepo{sub: &domain.UserSubscription{Status: "canceled", Quantity: 2}}, PaymentConfig{Updater: up})
		if err := s.SyncSeats(context.Background(), userID, 5); err != nil {
			t.Fatalf("err = %v", err)
		}
		if up.gotSub != "" {
			t.Error("gateway should not be called for an inactive subscription")
		}
	})

	t.Run("unchanged quantity is a no-op", func(t *testing.T) {
		up := &fakeUpdater{}
		s := newSvc(&fakeRepo{sub: &domain.UserSubscription{Status: "active", Quantity: 5}}, PaymentConfig{Updater: up})
		if err := s.SyncSeats(context.Background(), userID, 5); err != nil {
			t.Fatalf("err = %v", err)
		}
		if up.gotSub != "" {
			t.Error("gateway should not be called when the seat count is unchanged")
		}
	})

	t.Run("change pushes new quantity to the gateway", func(t *testing.T) {
		up := &fakeUpdater{err: errors.New("gateway down")} // error stops before the DB write
		s := newSvc(&fakeRepo{
			sub:  &domain.UserSubscription{Status: "active", Quantity: 2, ExternalSubscriptionID: "sub_x", TierID: uuid.New()},
			tier: &domain.SubscriptionTier{Slug: "business"},
		}, PaymentConfig{Updater: up, PriceMap: map[string]string{"business": "pri_biz"}})

		err := s.SyncSeats(context.Background(), userID, 7)
		if err == nil {
			t.Fatal("expected the gateway error to surface")
		}
		if up.gotSub != "sub_x" || up.gotPrice != "pri_biz" || up.gotQty != 7 {
			t.Errorf("gateway called with (%q,%q,%d), want (sub_x,pri_biz,7)", up.gotSub, up.gotPrice, up.gotQty)
		}
	})
}

func TestGetBatchUsage(t *testing.T) {
	u1, u2 := uuid.New(), uuid.New()
	repo := &fakeRepo{
		totals: map[uuid.UUID]map[string]int64{
			u1: {"projects": 3, "collaborators": 2},
		},
		monthly: map[uuid.UUID]map[string]int64{
			u1: {"ai_tokens": 1500},
		},
	}
	// redis is nil on newSvc, so this exercises the DB-baseline path.
	s := newSvc(repo, PaymentConfig{})

	got, err := s.GetBatchUsage(context.Background(), []uuid.UUID{u1, u2}, []string{"ai_tokens", "projects"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// u1: totals and monthly assembled from the batch maps.
	if got[u1].Totals["projects"] != 3 || got[u1].Totals["collaborators"] != 2 {
		t.Errorf("u1 totals = %+v, want projects=3 collaborators=2", got[u1].Totals)
	}
	if got[u1].Monthly["ai_tokens"] != 1500 {
		t.Errorf("u1 ai_tokens = %d, want 1500", got[u1].Monthly["ai_tokens"])
	}
	// "projects" is not a monthly metric — it must be filtered out of the
	// monthly query and absent from the monthly map.
	if _, ok := got[u1].Monthly["projects"]; ok {
		t.Errorf("non-monthly metric leaked into Monthly: %+v", got[u1].Monthly)
	}

	// u2 has no rows in either map but must still appear with non-nil maps and
	// zero-filled monthly metrics, so the admin row renders instead of panicking.
	snap, ok := got[u2]
	if !ok {
		t.Fatal("u2 missing from result; every requested user must be present")
	}
	if snap.Totals == nil || snap.Monthly == nil {
		t.Errorf("u2 maps must be non-nil, got %+v", snap)
	}
	if snap.Monthly["ai_tokens"] != 0 {
		t.Errorf("u2 ai_tokens = %d, want 0", snap.Monthly["ai_tokens"])
	}
}

func TestGetBatchUsageEmptyInput(t *testing.T) {
	s := newSvc(&fakeRepo{}, PaymentConfig{})
	got, err := s.GetBatchUsage(context.Background(), nil, []string{"ai_tokens"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("empty input should yield empty map, got %+v", got)
	}
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
