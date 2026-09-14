package grpcmeta

import (
	"context"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
)

func TestClientPropagatesExistingCorrelationID(t *testing.T) {
	ctx := WithActorID(WithCorrelationID(context.Background(), "request-123"), "actor-1")
	err := ClientInterceptor("downstream")(ctx, "/test.Service/Call", nil, nil, nil, func(ctx context.Context, _ string, _, _ any, _ *grpc.ClientConn, _ ...grpc.CallOption) error {
		md, ok := metadata.FromOutgoingContext(ctx)
		if !ok || len(md.Get(MetadataCorrelationID)) != 1 || md.Get(MetadataCorrelationID)[0] != "request-123" {
			t.Fatalf("outgoing metadata = %v", md)
		}
		if got := md.Get(MetadataActorID); len(got) != 1 || got[0] != "actor-1" {
			t.Fatalf("actor metadata = %v", got)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestServerContextForwardsIncomingIDToNestedCall(t *testing.T) {
	incoming := metadata.NewIncomingContext(context.Background(), metadata.Pairs(MetadataCorrelationID, "nested-456", MetadataActorID, "actor-2"))
	_, err := ServerInterceptor("service")(incoming, nil, &grpc.UnaryServerInfo{FullMethod: "/test.Service/Outer"}, func(ctx context.Context, _ any) (any, error) {
		if CorrelationID(ctx) != "nested-456" {
			t.Fatalf("context id = %q", CorrelationID(ctx))
		}
		if ActorID(ctx) != "actor-2" {
			t.Fatalf("context actor = %q", ActorID(ctx))
		}
		return nil, ClientInterceptor("nested")(ctx, "/test.Service/Inner", nil, nil, nil, func(ctx context.Context, _ string, _, _ any, _ *grpc.ClientConn, _ ...grpc.CallOption) error {
			md, _ := metadata.FromOutgoingContext(ctx)
			if got := md.Get(MetadataCorrelationID); len(got) != 1 || got[0] != "nested-456" {
				t.Fatalf("nested metadata = %v", got)
			}
			if got := md.Get(MetadataActorID); len(got) != 1 || got[0] != "actor-2" {
				t.Fatalf("nested actor metadata = %v", got)
			}
			return nil
		})
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestServerGeneratesMissingID(t *testing.T) {
	_, err := ServerInterceptor("service")(context.Background(), nil, &grpc.UnaryServerInfo{FullMethod: "/test.Service/Call"}, func(ctx context.Context, _ any) (any, error) {
		if CorrelationID(ctx) == "" {
			t.Fatal("missing generated correlation ID")
		}
		return nil, nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
