package service

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"inkwell/server/internal/collab/domain"
	"inkwell/server/internal/collab/repository"
)

// roleStubRepo is a minimal CollaborationRepository test double. The interface
// is embedded so unimplemented methods are present (and would panic if called);
// only GetUserProjectRole is overridden, which is all CheckPermission touches.
type roleStubRepo struct {
	repository.CollaborationRepository
	role string
	err  error
}

func (r roleStubRepo) GetUserProjectRole(ctx context.Context, userID, projectID uuid.UUID) (string, error) {
	return r.role, r.err
}

func TestCheckPermission(t *testing.T) {
	tests := []struct {
		name         string
		role         string
		repoErr      error
		requiredRole string
		callerRole   string
		wantErr      error // exact sentinel to match with errors.Is, or nil
		wantAllowed  bool  // when wantErr is nil-or-unspecified, whether access is granted
	}{
		{
			name:         "owner satisfies viewer requirement",
			role:         "owner",
			requiredRole: "viewer",
			wantAllowed:  true,
		},
		{
			name:         "editor satisfies editor requirement",
			role:         "editor",
			requiredRole: "editor",
			wantAllowed:  true,
		},
		{
			name:         "viewer denied editor requirement",
			role:         "viewer",
			requiredRole: "editor",
			wantErr:      domain.ErrUnauthorized,
		},
		{
			name:         "not a collaborator is denied without an assertion",
			repoErr:      domain.ErrUnauthorized,
			requiredRole: "viewer",
			wantErr:      domain.ErrUnauthorized,
		},
		{
			name:         "gateway owner assertion permits missing local row",
			repoErr:      domain.ErrUnauthorized,
			callerRole:   "owner",
			requiredRole: "owner",
			wantAllowed:  true,
		},
		{
			name:         "gateway viewer assertion cannot moderate",
			callerRole:   "viewer",
			requiredRole: "editor",
			wantErr:      domain.ErrUnauthorized,
		},
		{
			name:         "real lookup error fails closed",
			repoErr:      errors.New("connection refused"),
			requiredRole: "viewer",
			wantErr:      nil, // not a specific sentinel, but must be non-nil — checked below
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := NewCollaborationService(nil, roleStubRepo{role: tt.role, err: tt.repoErr}, nil, nil)
			err := svc.CheckPermission(context.Background(), uuid.New(), uuid.New(), tt.callerRole, tt.requiredRole)

			switch {
			case tt.name == "real lookup error fails closed":
				if err == nil {
					t.Fatal("expected non-nil error on real lookup failure, got nil (auth would fail open)")
				}
				if errors.Is(err, domain.ErrUnauthorized) {
					t.Fatalf("real DB error should not surface as ErrUnauthorized: %v", err)
				}
			case tt.wantErr != nil:
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("got err %v, want %v", err, tt.wantErr)
				}
			case tt.wantAllowed:
				if err != nil {
					t.Fatalf("expected access granted, got err %v", err)
				}
			}
		})
	}
}

func TestValidateRoleRejectsProjectOwnerProjection(t *testing.T) {
	svc := NewCollaborationService(nil, roleStubRepo{}, nil, nil)
	if err := svc.ValidateRole("owner"); !errors.Is(err, domain.ErrInvalidRole) {
		t.Fatalf("ValidateRole(owner) = %v, want ErrInvalidRole", err)
	}
}
