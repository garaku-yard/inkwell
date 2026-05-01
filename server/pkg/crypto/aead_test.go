package crypto

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"os"
	"testing"
)

func randomKey(t *testing.T) []byte {
	t.Helper()
	k := make([]byte, KeySize)
	if _, err := rand.Read(k); err != nil {
		t.Fatalf("random key: %v", err)
	}
	return k
}

func TestEncryptDecryptRoundTrip(t *testing.T) {
	key := randomKey(t)
	plaintext := []byte("sk-secret-provider-key-12345")
	aad := []byte("user-uuid|row-uuid")

	ct, nonce, err := Encrypt(key, plaintext, aad)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}
	if bytes.Contains(ct, plaintext) {
		t.Fatalf("ciphertext contains plaintext bytes — GCM not applied correctly")
	}
	if len(nonce) != NonceSize {
		t.Fatalf("nonce length = %d, want %d", len(nonce), NonceSize)
	}

	got, err := Decrypt(key, ct, nonce, aad)
	if err != nil {
		t.Fatalf("Decrypt: %v", err)
	}
	if !bytes.Equal(got, plaintext) {
		t.Fatalf("round-trip mismatch: got %q want %q", got, plaintext)
	}
}

func TestDecryptFailsOnTamperedCiphertext(t *testing.T) {
	key := randomKey(t)
	ct, nonce, err := Encrypt(key, []byte("payload"), []byte("aad"))
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}
	ct[0] ^= 0x01 // flip one bit

	if _, err := Decrypt(key, ct, nonce, []byte("aad")); err == nil {
		t.Fatal("expected Decrypt to fail on tampered ciphertext")
	}
}

func TestDecryptFailsOnWrongAssociatedData(t *testing.T) {
	// This is the row-binding guarantee: a ciphertext encrypted against
	// (user-A, row-1) must not decrypt under (user-A, row-2). Failing
	// this test would mean an attacker with write access to the DB could
	// swap ciphertext columns between rows without detection.
	key := randomKey(t)
	ct, nonce, err := Encrypt(key, []byte("payload"), []byte("row-1"))
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	if _, err := Decrypt(key, ct, nonce, []byte("row-2")); err == nil {
		t.Fatal("expected Decrypt to fail with different associated data")
	}
}

func TestDecryptFailsOnWrongKey(t *testing.T) {
	ct, nonce, err := Encrypt(randomKey(t), []byte("payload"), nil)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}
	if _, err := Decrypt(randomKey(t), ct, nonce, nil); err == nil {
		t.Fatal("expected Decrypt to fail with the wrong key")
	}
}

func TestEncryptUsesFreshNonce(t *testing.T) {
	// AES-GCM catastrophically fails under nonce reuse; each encrypt
	// must pull a new random nonce. Verify by encrypting the same input
	// many times and checking nonces are unique.
	key := randomKey(t)
	seen := make(map[string]struct{})
	for i := 0; i < 128; i++ {
		_, nonce, err := Encrypt(key, []byte("x"), nil)
		if err != nil {
			t.Fatalf("Encrypt: %v", err)
		}
		s := string(nonce)
		if _, dup := seen[s]; dup {
			t.Fatal("duplicate nonce across encrypt calls")
		}
		seen[s] = struct{}{}
	}
}

func TestEncryptRejectsShortKey(t *testing.T) {
	short := make([]byte, KeySize-1)
	if _, _, err := Encrypt(short, []byte("x"), nil); err == nil {
		t.Fatal("expected Encrypt to reject under-length key")
	}
}

func TestKeyFromEnvBase64(t *testing.T) {
	raw := make([]byte, KeySize)
	if _, err := rand.Read(raw); err != nil {
		t.Fatalf("rand: %v", err)
	}
	encoded := base64.StdEncoding.EncodeToString(raw)

	const envName = "TEST_AEAD_KEY"
	t.Setenv(envName, encoded)
	got, err := KeyFromEnvBase64(envName)
	if err != nil {
		t.Fatalf("KeyFromEnvBase64: %v", err)
	}
	if !bytes.Equal(got, raw) {
		t.Fatal("decoded key does not match source bytes")
	}

	// Wrong length rejected.
	t.Setenv(envName, base64.StdEncoding.EncodeToString(raw[:16]))
	if _, err := KeyFromEnvBase64(envName); err == nil {
		t.Fatal("expected KeyFromEnvBase64 to reject short key")
	}

	// Empty rejected.
	_ = os.Unsetenv(envName)
	if _, err := KeyFromEnvBase64(envName); err == nil {
		t.Fatal("expected KeyFromEnvBase64 to reject empty env")
	}
}
