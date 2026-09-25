//go:build dbintegration

package patch_test

import (
	"context"
	"net"
	"testing"

	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/test/bufconn"

	scriptshandler "inkwell/server/internal/scripts/handler"
	"inkwell/server/internal/scripts/repository"
	"inkwell/server/internal/scripts/service"
	"inkwell/server/pkg/events"
	scriptspb "inkwell/server/pkg/grpc/scripts"
	"inkwell/server/pkg/grpcmeta"
	"inkwell/server/pkg/outbox"
)

func TestCharacterCRUDThroughGRPCPersistsAndSoftDeletes(t *testing.T) {
	db := patchDatabase(t)
	projectID, ownerID := uuid.New(), uuid.New()
	if _, err := db.Exec(`INSERT INTO projects (project_id,title,description,owner_id,category) VALUES ($1,'Characters','',$2,'interactive_fiction')`, projectID, ownerID); err != nil {
		t.Fatal(err)
	}

	repo := repository.NewRepository(db)
	scriptsSvc := service.NewScriptsService(db, repo, outbox.NewPostgresStore(db, "scripts_outbox"), nil, &events.NoopPublisher{}, nil)
	grpcHandler := scriptshandler.NewScriptsHandler(scriptsSvc, service.NewBeatBoardService(repo))
	listener := bufconn.Listen(1024 * 1024)
	server := grpc.NewServer(grpc.UnaryInterceptor(grpcmeta.ServerInterceptor("scripts")))
	scriptspb.RegisterScriptsServiceServer(server, grpcHandler)
	go server.Serve(listener)
	t.Cleanup(func() { server.Stop(); listener.Close() })
	conn, err := grpc.NewClient("passthrough:///bufnet", grpc.WithContextDialer(func(context.Context, string) (net.Conn, error) { return listener.Dial() }), grpc.WithTransportCredentials(insecure.NewCredentials()), grpc.WithUnaryInterceptor(grpcmeta.ClientInterceptor("scripts")))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	client := scriptspb.NewScriptsServiceClient(conn)
	ctx := grpcmeta.WithCorrelationID(context.Background(), "character-boundary")

	created, err := client.CreateCharacter(ctx, &scriptspb.CreateCharacterRequest{
		ProjectId: projectID.String(), UserId: ownerID.String(), CallerRole: scriptspb.CallerRole_CALLER_ROLE_OWNER,
		Name: "Mara", Description: "Pilot", Role: "protagonist", Attributes: map[string]string{"voice": "terse"},
	})
	if err != nil {
		t.Fatal(err)
	}
	characterID := created.Character.GetId()
	if characterID == "" || created.Character.Attributes["voice"] != "terse" {
		t.Fatalf("created character=%#v", created.Character)
	}

	emptyDescription := ""
	updated, err := client.UpdateCharacter(ctx, &scriptspb.UpdateCharacterRequest{
		CharacterId: characterID, UserId: ownerID.String(), CallerRole: scriptspb.CallerRole_CALLER_ROLE_OWNER,
		Description: &emptyDescription, Attributes: map[string]string{}, AttributesSet: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Character.Description != "" || len(updated.Character.Attributes) != 0 || updated.Character.Name != "Mara" {
		t.Fatalf("updated character=%#v", updated.Character)
	}

	listed, err := client.GetProjectCharacters(ctx, &scriptspb.GetProjectCharactersRequest{
		ProjectId: projectID.String(), UserId: ownerID.String(), CallerRole: scriptspb.CallerRole_CALLER_ROLE_OWNER,
	})
	if err != nil || len(listed.Characters) != 1 {
		t.Fatalf("list characters=%#v err=%v", listed.GetCharacters(), err)
	}
	if _, err := client.DeleteCharacter(ctx, &scriptspb.DeleteCharacterRequest{
		CharacterId: characterID, UserId: ownerID.String(), CallerRole: scriptspb.CallerRole_CALLER_ROLE_OWNER,
	}); err != nil {
		t.Fatal(err)
	}
	listed, err = client.GetProjectCharacters(ctx, &scriptspb.GetProjectCharactersRequest{
		ProjectId: projectID.String(), UserId: ownerID.String(), CallerRole: scriptspb.CallerRole_CALLER_ROLE_OWNER,
	})
	if err != nil || len(listed.Characters) != 0 {
		t.Fatalf("deleted character remained visible: %#v err=%v", listed.GetCharacters(), err)
	}
	var deleted bool
	if err := db.QueryRow(`SELECT deleted_at IS NOT NULL FROM characters WHERE character_id=$1`, characterID).Scan(&deleted); err != nil || !deleted {
		t.Fatalf("soft delete persisted=%v err=%v", deleted, err)
	}
}
