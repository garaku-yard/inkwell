package handler

import (
	"testing"

	"github.com/google/uuid"

	"inkwell/server/internal/scripts/domain"
	scriptspb "inkwell/server/pkg/grpc/scripts"
)

func TestSyncProjectOrgIDRoundTrip(t *testing.T) {
	projectID := uuid.New()
	orgID := uuid.New()

	domainProject := syncProtoToProject(&scriptspb.Project{
		Id: projectID.String(), OrgId: orgID.String(), Title: "Team script",
	})
	if domainProject == nil || domainProject.OrgID == nil || *domainProject.OrgID != orgID {
		t.Fatalf("proto org_id did not reach domain project: %#v", domainProject)
	}

	wireProject := syncProjectToProto(&domain.Project{ID: projectID, OrgID: &orgID})
	if wireProject.OrgId != orgID.String() {
		t.Fatalf("domain org_id did not reach proto response: got %q", wireProject.OrgId)
	}
}
