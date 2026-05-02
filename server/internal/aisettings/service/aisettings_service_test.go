package service

import (
	"context"
	"crypto/rand"
	"errors"
	"sync"
	"testing"

	"github.com/google/uuid"

	"inkwell/server/internal/aisettings/domain"
	"inkwell/server/pkg/crypto"
)

// fakeRepo is an in-memory SettingRepository used by the service tests.
// Entries are keyed by (userID, id) so tenant-scoped queries work without
// involving a real database.
type fakeRepo struct {
	mu   sync.Mutex
	rows map[string]domain.ProviderSetting
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{rows: map[string]domain.ProviderSetting{}}
}

func (r *fakeRepo) key(userID, id uuid.UUID) string { return userID.String() + ":" + id.String() }

func (r *fakeRepo) List(_ context.Context, userID uuid.UUID) ([]domain.ProviderSetting, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []domain.ProviderSetting
	for _, s := range r.rows {
		if s.UserID == userID {
			out = append(out, s)
		}
	}
	return out, nil
}

func (r *fakeRepo) Get(_ context.Context, userID, id uuid.UUID) (*domain.ProviderSetting, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	s, ok := r.rows[r.key(userID, id)]
	if !ok {
		return nil, domain.ErrNotFound
	}
	clone := s
	return &clone, nil
}

func (r *fakeRepo) Create(_ context.Context, s *domain.ProviderSetting) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.rows[r.key(s.UserID, s.ID)] = *s
	return nil
}

func (r *fakeRepo) UpdateMetadata(_ context.Context, s *domain.ProviderSetting) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	k := r.key(s.UserID, s.ID)
	existing, ok := r.rows[k]
	if !ok {
		return domain.ErrNotFound
	}
	existing.Kind = s.Kind
	existing.Label = s.Label
	existing.Enabled = s.Enabled
	existing.BaseURL = s.BaseURL
	existing.DefaultModel = s.DefaultModel
	existing.UpdatedAt = s.UpdatedAt
	r.rows[k] = existing
	return nil
}

func (r *fakeRepo) UpdateKey(_ context.Context, userID, id uuid.UUID, encrypted, nonce []byte, keyVersion int32) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	k := r.key(userID, id)
	s, ok := r.rows[k]
	if !ok {
		return domain.ErrNotFound
	}
	s.EncryptedAPIKey = encrypted
	s.KeyNonce = nonce
	s.KeyVersion = keyVersion
	r.rows[k] = s
	return nil
}

func (r *fakeRepo) Delete(_ context.Context, userID, id uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	k := r.key(userID, id)
	if _, ok := r.rows[k]; !ok {
		return domain.ErrNotFound
	}
	delete(r.rows, k)
	return nil
}

func (r *fakeRepo) ListAllWithKeys(_ context.Context) ([]domain.ProviderSetting, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []domain.ProviderSetting
	for _, s := range r.rows {
		if len(s.EncryptedAPIKey) > 0 {
			out = append(out, s)
		}
	}
	return out, nil
}

func freshKey(t *testing.T) []byte {
	t.Helper()
	k := make([]byte, crypto.KeySize)
	if _, err := rand.Read(k); err != nil {
		t.Fatalf("rand: %v", err)
	}
	return k
}

func newSvc(t *testing.T) (Service, *fakeRepo) {
	t.Helper()
	repo := newFakeRepo()
	svc, err := New(repo, freshKey(t))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return svc, repo
}

func mustCreate(t *testing.T, svc Service, userID uuid.UUID, kind string) *domain.ProviderSetting {
	t.Helper()
	row, err := svc.Create(context.Background(), CreateInput{
		UserID:  userID,
		Kind:    kind,
		Label:   "Test",
		Enabled: true,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	return row
}

func TestNew_RejectsWrongKeySize(t *testing.T) {
	if _, err := New(newFakeRepo(), make([]byte, crypto.KeySize-1)); err == nil {
		t.Fatal("expected error for short key")
	}
	if _, err := New(newFakeRepo(), make([]byte, crypto.KeySize+1)); err == nil {
		t.Fatal("expected error for long key")
	}
}

func TestCreate_ValidatesKind(t *testing.T) {
	svc, _ := newSvc(t)
	_, err := svc.Create(context.Background(), CreateInput{
		UserID: uuid.New(),
		Kind:   "bogus",
		Label:  "Test",
	})
	if !errors.Is(err, domain.ErrInvalidKind) {
		t.Fatalf("got %v, want ErrInvalidKind", err)
	}
}

func TestCreate_RequiresLabel(t *testing.T) {
	svc, _ := newSvc(t)
	_, err := svc.Create(context.Background(), CreateInput{
		UserID: uuid.New(),
		Kind:   "openai",
		Label:  "",
	})
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("got %v, want ErrInvalidInput", err)
	}
}

func TestCreate_AllSupportedKinds(t *testing.T) {
	svc, _ := newSvc(t)
	uid := uuid.New()
	for _, k := range []string{"openai", "anthropic", "gemini", "openai_compatible"} {
		if _, err := svc.Create(context.Background(), CreateInput{
			UserID: uid, Kind: k, Label: "Test", Enabled: true,
		}); err != nil {
			t.Fatalf("kind %q: %v", k, err)
		}
	}
}

func TestUpdate_ValidatesKind(t *testing.T) {
	svc, _ := newSvc(t)
	uid := uuid.New()
	row := mustCreate(t, svc, uid, "openai")
	_, err := svc.Update(context.Background(), UpdateInput{
		UserID: uid, ID: row.ID, Kind: "bogus", Label: "Test",
	})
	if !errors.Is(err, domain.ErrInvalidKind) {
		t.Fatalf("got %v, want ErrInvalidKind", err)
	}
}

func TestUpdate_PreservesKeyMaterial(t *testing.T) {
	// A metadata update should not clobber the encrypted key columns,
	// otherwise re-saving the form would silently log a user out of
	// their provider.
	svc, repo := newSvc(t)
	uid := uuid.New()
	row := mustCreate(t, svc, uid, "openai")
	if err := svc.SetKey(context.Background(), uid, row.ID, "sk-ABC"); err != nil {
		t.Fatalf("SetKey: %v", err)
	}
	beforeKey := repo.rows[repo.key(uid, row.ID)].EncryptedAPIKey
	beforeNonce := repo.rows[repo.key(uid, row.ID)].KeyNonce

	if _, err := svc.Update(context.Background(), UpdateInput{
		UserID: uid, ID: row.ID, Kind: "openai", Label: "Renamed", Enabled: true,
	}); err != nil {
		t.Fatalf("Update: %v", err)
	}
	afterKey := repo.rows[repo.key(uid, row.ID)].EncryptedAPIKey
	afterNonce := repo.rows[repo.key(uid, row.ID)].KeyNonce
	if string(beforeKey) != string(afterKey) || string(beforeNonce) != string(afterNonce) {
		t.Fatal("metadata Update overwrote the encrypted key fields")
	}
}

func TestSetKey_RequiresOwnership(t *testing.T) {
	svc, _ := newSvc(t)
	owner := uuid.New()
	row := mustCreate(t, svc, owner, "openai")

	stranger := uuid.New()
	err := svc.SetKey(context.Background(), stranger, row.ID, "sk-evil")
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("got %v, want ErrNotFound (cross-tenant access leaked)", err)
	}
}

func TestSetKey_RequiresNonEmptyKey(t *testing.T) {
	svc, _ := newSvc(t)
	uid := uuid.New()
	row := mustCreate(t, svc, uid, "openai")
	err := svc.SetKey(context.Background(), uid, row.ID, "")
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("got %v, want ErrInvalidInput", err)
	}
}

func TestSetKey_RoundTripsThroughGetForDispatch(t *testing.T) {
	svc, _ := newSvc(t)
	uid := uuid.New()
	row := mustCreate(t, svc, uid, "openai")
	const plaintext = "sk-test-secret-VALUE-789"
	if err := svc.SetKey(context.Background(), uid, row.ID, plaintext); err != nil {
		t.Fatalf("SetKey: %v", err)
	}
	_, got, err := svc.GetForDispatch(context.Background(), uid, row.ID)
	if err != nil {
		t.Fatalf("GetForDispatch: %v", err)
	}
	if got != plaintext {
		t.Fatalf("plaintext mismatch: got %q want %q", got, plaintext)
	}
}

func TestGetForDispatch_RejectsRowSwap(t *testing.T) {
	// AAD = (userID || rowID) — moving a ciphertext from one row to
	// another should fail to decrypt, even when the same user owns both.
	// This is the security claim worth pinning down: an attacker with DB
	// write access can't relabel a high-privilege key onto a low-privilege
	// row by copying the ciphertext.
	svc, repo := newSvc(t)
	uid := uuid.New()
	rowA := mustCreate(t, svc, uid, "openai")
	rowB := mustCreate(t, svc, uid, "anthropic")
	if err := svc.SetKey(context.Background(), uid, rowA.ID, "sk-A"); err != nil {
		t.Fatalf("SetKey A: %v", err)
	}

	// Splice rowA's ciphertext + nonce onto rowB.
	stored := repo.rows[repo.key(uid, rowA.ID)]
	rowBStored := repo.rows[repo.key(uid, rowB.ID)]
	rowBStored.EncryptedAPIKey = stored.EncryptedAPIKey
	rowBStored.KeyNonce = stored.KeyNonce
	repo.rows[repo.key(uid, rowB.ID)] = rowBStored

	if _, _, err := svc.GetForDispatch(context.Background(), uid, rowB.ID); err == nil {
		t.Fatal("expected AAD mismatch to fail decrypt on row B; ciphertext was movable")
	}
}

func TestGetForDispatch_RejectsCrossTenant(t *testing.T) {
	svc, _ := newSvc(t)
	owner := uuid.New()
	row := mustCreate(t, svc, owner, "openai")
	if err := svc.SetKey(context.Background(), owner, row.ID, "sk-private"); err != nil {
		t.Fatalf("SetKey: %v", err)
	}
	stranger := uuid.New()
	if _, _, err := svc.GetForDispatch(context.Background(), stranger, row.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("got %v, want ErrNotFound", err)
	}
}

func TestClearKey_RemovesKey(t *testing.T) {
	svc, _ := newSvc(t)
	uid := uuid.New()
	row := mustCreate(t, svc, uid, "openai")
	if err := svc.SetKey(context.Background(), uid, row.ID, "sk-val"); err != nil {
		t.Fatalf("SetKey: %v", err)
	}
	if err := svc.ClearKey(context.Background(), uid, row.ID); err != nil {
		t.Fatalf("ClearKey: %v", err)
	}
	got, plaintext, err := svc.GetForDispatch(context.Background(), uid, row.ID)
	if err != nil {
		t.Fatalf("GetForDispatch: %v", err)
	}
	if plaintext != "" {
		t.Fatalf("plaintext after ClearKey: %q", plaintext)
	}
	if got.HasKey() {
		t.Fatal("HasKey() = true after ClearKey")
	}
}

func TestReencryptAll_RotatesAcrossKeyVersions(t *testing.T) {
	repo := newFakeRepo()

	// Phase 1: write rows with the original key (version 1).
	v1Key := freshKey(t)
	v1Svc, err := NewWithRotation(repo, 1, v1Key, nil)
	if err != nil {
		t.Fatalf("v1 New: %v", err)
	}
	uid := uuid.New()
	rowA, err := v1Svc.Create(context.Background(), CreateInput{UserID: uid, Kind: "openai", Label: "A", Enabled: true})
	if err != nil {
		t.Fatalf("Create A: %v", err)
	}
	rowB, err := v1Svc.Create(context.Background(), CreateInput{UserID: uid, Kind: "anthropic", Label: "B", Enabled: true})
	if err != nil {
		t.Fatalf("Create B: %v", err)
	}
	if err := v1Svc.SetKey(context.Background(), uid, rowA.ID, "secret-A"); err != nil {
		t.Fatalf("SetKey A: %v", err)
	}
	if err := v1Svc.SetKey(context.Background(), uid, rowB.ID, "secret-B"); err != nil {
		t.Fatalf("SetKey B: %v", err)
	}

	// Phase 2: spin up a service with a NEW current key (v2) and the
	// old key registered as legacy. Re-run ReencryptAll.
	v2Key := freshKey(t)
	rotatingSvc, err := NewWithRotation(repo, 2, v2Key, []VersionedKey{{Version: 1, Key: v1Key}})
	if err != nil {
		t.Fatalf("v2 New: %v", err)
	}
	count, err := rotatingSvc.ReencryptAll(context.Background())
	if err != nil {
		t.Fatalf("ReencryptAll: %v", err)
	}
	if count != 2 {
		t.Fatalf("ReencryptAll count = %d, want 2", count)
	}

	// Phase 3: verify decrypts work with the v2 service AND a clean
	// v2-only service (no legacy key) — proving the rows have been
	// fully migrated and the old key can be retired.
	v2OnlySvc, err := NewWithRotation(repo, 2, v2Key, nil)
	if err != nil {
		t.Fatalf("v2-only New: %v", err)
	}
	_, plainA, err := v2OnlySvc.GetForDispatch(context.Background(), uid, rowA.ID)
	if err != nil || plainA != "secret-A" {
		t.Fatalf("GetForDispatch A: plaintext=%q err=%v", plainA, err)
	}
	_, plainB, err := v2OnlySvc.GetForDispatch(context.Background(), uid, rowB.ID)
	if err != nil || plainB != "secret-B" {
		t.Fatalf("GetForDispatch B: plaintext=%q err=%v", plainB, err)
	}

	// Phase 4: a second ReencryptAll is a no-op (idempotent retries).
	count, err = rotatingSvc.ReencryptAll(context.Background())
	if err != nil {
		t.Fatalf("ReencryptAll second pass: %v", err)
	}
	if count != 0 {
		t.Fatalf("ReencryptAll second pass count = %d, want 0", count)
	}
}

func TestNewWithRotation_RejectsCollidingVersions(t *testing.T) {
	repo := newFakeRepo()
	k := freshKey(t)
	if _, err := NewWithRotation(repo, 1, k, []VersionedKey{{Version: 1, Key: freshKey(t)}}); err == nil {
		t.Fatal("expected error when legacy key collides with current version")
	}
}

func TestList_TenantScoped(t *testing.T) {
	svc, _ := newSvc(t)
	a, b := uuid.New(), uuid.New()
	mustCreate(t, svc, a, "openai")
	mustCreate(t, svc, a, "anthropic")
	mustCreate(t, svc, b, "openai")

	rowsA, err := svc.List(context.Background(), a)
	if err != nil {
		t.Fatalf("List(a): %v", err)
	}
	if len(rowsA) != 2 {
		t.Fatalf("List(a) len = %d, want 2", len(rowsA))
	}

	rowsB, err := svc.List(context.Background(), b)
	if err != nil {
		t.Fatalf("List(b): %v", err)
	}
	if len(rowsB) != 1 {
		t.Fatalf("List(b) len = %d, want 1", len(rowsB))
	}
}
