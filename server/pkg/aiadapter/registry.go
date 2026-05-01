package aiadapter

// Get returns the adapter for a provider kind. Adapters are stateless
// structs — the zero value is the usable instance.
func Get(kind ProviderKind) (Adapter, error) {
	switch kind {
	case KindOpenAI:
		return OpenAIAdapter{}, nil
	case KindAnthropic:
		return AnthropicAdapter{}, nil
	case KindGemini:
		return GeminiAdapter{}, nil
	default:
		return nil, ErrUnsupportedKind
	}
}
