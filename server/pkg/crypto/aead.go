// Package crypto provides small authenticated-encryption primitives used by
// services that store user-supplied secrets at rest — BYO AI provider keys
// today, any future opaque secret tomorrow. The chosen scheme is
// AES-256-GCM: a random 12-byte nonce per encrypt, a 16-byte tag appended,
// and an optional associated-data stream (used for tying a ciphertext to
// the row it lives in, so a cut-and-paste swap between rows fails to
// decrypt).
//
// The package does not manage key distribution — callers pass the 32-byte
// master key in explicitly, typically loaded once at startup via
// KeyFromEnvBase64. Rotating the master key is a two-step migration:
// bump `key_version` for newly-written rows, re-encrypt existing rows on
// next read. The helper does not enforce a rotation policy.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
)

// KeySize is the master-key length in bytes. AES-256 needs exactly 32.
const KeySize = 32

// NonceSize is the AES-GCM standard nonce length in bytes.
const NonceSize = 12

// ErrInvalidKeyLength is returned when a caller supplies a key that isn't
// exactly KeySize bytes.
var ErrInvalidKeyLength = errors.New("crypto: key must be 32 bytes (AES-256)")

// ErrInvalidNonce is returned when Decrypt receives a nonce that isn't
// NonceSize bytes.
var ErrInvalidNonce = errors.New("crypto: nonce must be 12 bytes (AES-GCM)")

// KeyFromEnvBase64 reads a base64-encoded 32-byte master key from the
// named environment variable and returns its raw bytes. The decoding is
// strict — padding is required, any whitespace is rejected. Callers are
// expected to invoke this once at startup and pass the resulting slice
// to Encrypt/Decrypt for the life of the process.
func KeyFromEnvBase64(name string) ([]byte, error) {
	raw := os.Getenv(name)
	if raw == "" {
		return nil, fmt.Errorf("crypto: env %s is empty; set it to a base64-encoded 32-byte key", name)
	}
	key, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return nil, fmt.Errorf("crypto: env %s is not valid base64: %w", name, err)
	}
	if len(key) != KeySize {
		return nil, fmt.Errorf("crypto: env %s decoded to %d bytes (need %d)", name, len(key), KeySize)
	}
	return key, nil
}

// Encrypt encrypts `plaintext` with AES-256-GCM using `key`. `associatedData`
// is authenticated but not encrypted — pass e.g. the row id so the tag
// binds the ciphertext to its storage location. Returns the ciphertext
// (including appended auth tag) and a freshly generated nonce. Callers
// store both; neither is secret, but both are required to decrypt.
func Encrypt(key, plaintext, associatedData []byte) (ciphertext, nonce []byte, err error) {
	if len(key) != KeySize {
		return nil, nil, ErrInvalidKeyLength
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, nil, fmt.Errorf("crypto: new cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, nil, fmt.Errorf("crypto: new gcm: %w", err)
	}
	nonce = make([]byte, NonceSize)
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, nil, fmt.Errorf("crypto: read nonce: %w", err)
	}
	ciphertext = aead.Seal(nil, nonce, plaintext, associatedData)
	return ciphertext, nonce, nil
}

// Decrypt reverses Encrypt. `associatedData` must match the value passed
// at encryption time; a mismatch fails the authentication check and
// returns an error rather than garbled plaintext.
func Decrypt(key, ciphertext, nonce, associatedData []byte) ([]byte, error) {
	if len(key) != KeySize {
		return nil, ErrInvalidKeyLength
	}
	if len(nonce) != NonceSize {
		return nil, ErrInvalidNonce
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("crypto: new cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("crypto: new gcm: %w", err)
	}
	out, err := aead.Open(nil, nonce, ciphertext, associatedData)
	if err != nil {
		return nil, fmt.Errorf("crypto: authenticated decrypt failed: %w", err)
	}
	return out, nil
}
