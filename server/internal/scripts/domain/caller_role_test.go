package domain

import "testing"

func TestCallerRoleAllows(t *testing.T) {
	tests := []struct {
		name     string
		role     CallerRole
		required CallerRole
		want     bool
	}{
		{"viewer reads", CallerRoleViewer, CallerRoleViewer, true},
		{"viewer cannot edit", CallerRoleViewer, CallerRoleEditor, false},
		{"editor reads", CallerRoleEditor, CallerRoleViewer, true},
		{"editor edits", CallerRoleEditor, CallerRoleEditor, true},
		{"org admin edits", CallerRoleOrgAdmin, CallerRoleEditor, true},
		{"owner edits", CallerRoleOwner, CallerRoleEditor, true},
		{"unspecified denied", CallerRoleUnspecified, CallerRoleViewer, false},
		{"unknown role denied", CallerRole(99), CallerRoleViewer, false},
		{"unknown requirement denied", CallerRoleOwner, CallerRole(99), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.role.Allows(tt.required); got != tt.want {
				t.Fatalf("CallerRole(%d).Allows(%d) = %v, want %v", tt.role, tt.required, got, tt.want)
			}
		})
	}
}
