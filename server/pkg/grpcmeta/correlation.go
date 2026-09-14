// Package grpcmeta carries request identity across gRPC boundaries and emits
// the shared structured RPC log contract.
package grpcmeta

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

const MetadataCorrelationID = "x-correlation-id"
const MetadataActorID = "x-actor-id"
const HeaderCorrelationID = "X-Correlation-ID"

type correlationKey struct{}
type actorKey struct{}

func WithCorrelationID(ctx context.Context, id string) context.Context {
	if id == "" {
		id = uuid.NewString()
	}
	return context.WithValue(ctx, correlationKey{}, id)
}

func CorrelationID(ctx context.Context) string {
	id, _ := ctx.Value(correlationKey{}).(string)
	return id
}

func WithActorID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, actorKey{}, id)
}
func ActorID(ctx context.Context) string { id, _ := ctx.Value(actorKey{}).(string); return id }

func EnsureCorrelationID(ctx context.Context) (context.Context, string) {
	if id := CorrelationID(ctx); id != "" {
		return ctx, id
	}
	if md, ok := metadata.FromIncomingContext(ctx); ok {
		if values := md.Get(MetadataCorrelationID); len(values) > 0 && values[0] != "" {
			return WithCorrelationID(ctx, values[0]), values[0]
		}
	}
	id := uuid.NewString()
	return WithCorrelationID(ctx, id), id
}

func ClientInterceptor(service string) grpc.UnaryClientInterceptor {
	return func(ctx context.Context, method string, req, reply any, cc *grpc.ClientConn, invoker grpc.UnaryInvoker, opts ...grpc.CallOption) error {
		ctx, id := EnsureCorrelationID(ctx)
		ctx = metadata.AppendToOutgoingContext(ctx, MetadataCorrelationID, id)
		actorID := ActorID(ctx)
		if actorID != "" {
			ctx = metadata.AppendToOutgoingContext(ctx, MetadataActorID, actorID)
		}
		start := time.Now()
		err := invoker(ctx, method, req, reply, cc, opts...)
		code := status.Code(err)
		outcome := "success"
		if err != nil {
			outcome = "error"
		}
		slog.Info("grpc downstream call", "correlation_id", id, "service", service, "rpc", method, "actor_id", actorID, "duration_ms", time.Since(start).Milliseconds(), "outcome", outcome, "code", code.String())
		return err
	}
}

func ServerInterceptor(service string) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		ctx, id := EnsureCorrelationID(ctx)
		if md, ok := metadata.FromIncomingContext(ctx); ok {
			if values := md.Get(MetadataActorID); len(values) > 0 {
				ctx = WithActorID(ctx, values[0])
			}
		}
		start := time.Now()
		resp, err := handler(ctx, req)
		code := status.Code(err)
		outcome := "success"
		if err != nil {
			outcome = "error"
		}
		slog.Info("grpc request", "correlation_id", id, "service", service, "rpc", info.FullMethod, "actor_id", ActorID(ctx), "duration_ms", time.Since(start).Milliseconds(), "outcome", outcome, "code", code.String())
		return resp, err
	}
}
