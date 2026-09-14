package billing

import (
	"testing"

	billingpb "inkwell/server/pkg/grpc/billing"
)

func TestTierDTORoundTripPreservesManagedAITokenLimit(t *testing.T) {
	for _, limit := range []int64{50_000, -1} {
		original := &billingpb.SubscriptionTier{
			Id: "tier-id",
			Limits: map[string]int64{
				"max_projects":                  3,
				"max_collaborators_per_project": 2,
				"max_ai_tokens_per_month":       limit,
				"business_workspaces":           0,
			},
		}

		dto := protoTierToDTO(original)
		if dto.Limits.MaxAITokensPerMonth != limit {
			t.Fatalf("DTO AI token limit = %d, want %d", dto.Limits.MaxAITokensPerMonth, limit)
		}

		roundTripped := dtoToProtoTier(&dto)
		if got := roundTripped.Limits["max_ai_tokens_per_month"]; got != limit {
			t.Fatalf("round-trip AI token limit = %d, want %d", got, limit)
		}
	}
}
