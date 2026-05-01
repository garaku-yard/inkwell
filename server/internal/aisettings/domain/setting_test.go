package domain

import "testing"

func TestValidKind(t *testing.T) {
	for _, k := range []string{"openai", "anthropic", "gemini", "openai_compatible"} {
		if !ValidKind(k) {
			t.Errorf("ValidKind(%q) = false, want true", k)
		}
	}
	for _, k := range []string{"", "OPENAI", "claude", "ollama", "openai-compatible"} {
		if ValidKind(k) {
			t.Errorf("ValidKind(%q) = true, want false", k)
		}
	}
}

func TestProviderSetting_HasKey(t *testing.T) {
	cases := []struct {
		name string
		ct   []byte
		nce  []byte
		want bool
	}{
		{"both set", []byte{1, 2}, []byte{3, 4}, true},
		{"only ciphertext", []byte{1, 2}, nil, false},
		{"only nonce", nil, []byte{3, 4}, false},
		{"neither", nil, nil, false},
		{"both empty (zero-length)", []byte{}, []byte{}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := ProviderSetting{EncryptedAPIKey: tc.ct, KeyNonce: tc.nce}
			if got := s.HasKey(); got != tc.want {
				t.Errorf("HasKey = %v, want %v", got, tc.want)
			}
		})
	}
}
