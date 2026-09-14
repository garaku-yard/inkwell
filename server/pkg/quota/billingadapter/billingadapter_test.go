package billingadapter

import (
	"testing"

	billingpb "inkwell/server/pkg/grpc/billing"
	"inkwell/server/pkg/quota"
)

func TestPlanLimitMapsEnforcedMetrics(t *testing.T) {
	plan := &billingpb.Plan{
		MaxProjects:                3,
		MaxCollaboratorsPerProject: 2,
		AiTokensPerMonth:           50_000,
	}

	tests := []struct {
		metric quota.Metric
		want   int64
	}{
		{quota.MetricProjects, 3},
		{quota.MetricCollaborators, 2},
		{quota.MetricAITokens, 50_000},
		{quota.MetricExports, -1},
	}
	for _, tc := range tests {
		if got := planLimit(plan, tc.metric); got != tc.want {
			t.Errorf("planLimit(%q) = %d, want %d", tc.metric, got, tc.want)
		}
	}
}

func TestPlanLimitTreatsZeroAsUnlimited(t *testing.T) {
	plan := &billingpb.Plan{}
	for _, metric := range []quota.Metric{quota.MetricProjects, quota.MetricCollaborators, quota.MetricAITokens} {
		if got := planLimit(plan, metric); got != -1 {
			t.Errorf("planLimit(%q) = %d, want unlimited", metric, got)
		}
	}
}
