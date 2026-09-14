package quota

import "testing"

func TestLimitFromTierUsesApprovedLimitKeys(t *testing.T) {
	limits := map[string]interface{}{
		"max_projects":                  int64(3),
		"max_collaborators_per_project": float64(2),
		"max_ai_tokens_per_month":       50_000,
	}

	tests := []struct {
		metric Metric
		want   int64
	}{
		{MetricProjects, 3},
		{MetricCollaborators, 2},
		{MetricAITokens, 50_000},
		{MetricExports, -1},
	}
	for _, tc := range tests {
		if got := LimitFromTier(limits, tc.metric); got != tc.want {
			t.Errorf("LimitFromTier(%q) = %d, want %d", tc.metric, got, tc.want)
		}
	}
}
