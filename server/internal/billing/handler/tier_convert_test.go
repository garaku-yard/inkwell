package handler

import (
	"testing"

	"github.com/google/uuid"

	"inkwell/server/internal/billing/domain"
)

// tierToPlan must map the enforced limit keys onto the typed Plan caps, and
// treat 0/-1 (unlimited) as the proto zero value (which the quota adapter reads
// as unlimited). This guards the prior bug where it read "max_collaborators"
// (wrong key) instead of "max_collaborators_per_project".
func TestTierToPlan_LimitMapping(t *testing.T) {
	cases := []struct {
		name        string
		limits      map[string]int64
		wantProj    int32
		wantCollabs int32
	}{
		{"free caps", map[string]int64{"max_projects": 3, "max_collaborators_per_project": 2}, 3, 2},
		{"unlimited (-1) reads as 0", map[string]int64{"max_projects": -1, "max_collaborators_per_project": -1}, 0, 0},
		{"missing keys read as 0", map[string]int64{}, 0, 0},
	}
	for _, c := range cases {
		p := tierToPlan(&domain.SubscriptionTier{ID: uuid.New(), Name: "T", Limits: c.limits})
		if p.MaxProjects != c.wantProj {
			t.Errorf("%s: MaxProjects = %d, want %d", c.name, p.MaxProjects, c.wantProj)
		}
		if p.MaxCollaboratorsPerProject != c.wantCollabs {
			t.Errorf("%s: MaxCollaboratorsPerProject = %d, want %d", c.name, p.MaxCollaboratorsPerProject, c.wantCollabs)
		}
	}
}

// protoToTier ∘ tierToProto must round-trip the admin-editable fields, with
// cents↔dollars conversion intact.
func TestTierProtoRoundTrip(t *testing.T) {
	orig := &domain.SubscriptionTier{
		ID:           uuid.New(),
		Name:         "Pro",
		Slug:         "pro",
		Description:  "desc",
		MonthlyPrice: 15.00,
		YearlyPrice:  150.00,
		DisplayOrder: 2,
		IsActive:     true,
		IsPublic:     true,
		PerSeat:      true,
		Limits:       map[string]int64{"max_projects": -1, "max_collaborators_per_project": 10, "business_workspaces": 1},
		Features:     []string{"Unlimited projects", "10 collaborators"},
	}
	got := protoToTier(tierToProto(orig))

	if got.ID != orig.ID || got.Name != orig.Name || got.Slug != orig.Slug {
		t.Errorf("identity fields drifted: %+v", got)
	}
	if got.MonthlyPrice != orig.MonthlyPrice || got.YearlyPrice != orig.YearlyPrice {
		t.Errorf("price round-trip wrong: monthly %v yearly %v", got.MonthlyPrice, got.YearlyPrice)
	}
	if got.PerSeat != orig.PerSeat || got.DisplayOrder != orig.DisplayOrder {
		t.Errorf("flags drifted: perSeat %v order %d", got.PerSeat, got.DisplayOrder)
	}
	if got.Limits["max_collaborators_per_project"] != 10 || got.Limits["business_workspaces"] != 1 {
		t.Errorf("limits drifted: %+v", got.Limits)
	}
	if len(got.Features) != 2 {
		t.Errorf("feature bullets drifted: %+v", got.Features)
	}
}
