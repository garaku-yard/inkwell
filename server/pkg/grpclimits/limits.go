// Package grpclimits centralises the gRPC message-size ceiling shared by every
// service and by the gateway's clients.
//
// It exists because the default is wrong for this platform. grpc-go caps
// *received* messages at 4 MiB unless told otherwise, and nothing here ever told
// it otherwise — while vault sync legitimately builds much larger messages:
// a push batch is budgeted at 12 MiB, a pull page at 16 MiB, and a single file
// may reach 20 MiB (batching always includes at least one file, so one large
// file has to fit on its own).
//
// The result was that any vault with more than 4 MiB of changed files could
// never sync. It failed with `received message larger than max`, and because the
// client rebuilds the same batch every attempt, every retry failed identically —
// a permanent stall that no amount of waiting could clear (Orbit #151).
//
// Both directions matter: a push is rejected by the receiving service, and a
// pull page is rejected by the gateway's client on the way back.
package grpclimits

import "google.golang.org/grpc"

// MaxMessageBytes is the largest gRPC message accepted in either direction.
//
// 32 MiB clears the largest legitimate message (a lone 20 MiB file, plus proto
// framing and metadata) with room to spare. It is deliberately the number the
// vault client already documented as the server-side cap, which until now was
// simply untrue.
const MaxMessageBytes = 32 << 20

// ServerOptions returns the size options every gRPC server is built with. Kept
// uniform across services on purpose: the ceiling is a property of the
// transport, not of one endpoint, and a service-by-service opt-in is how the
// 4 MiB default went unnoticed in the first place.
func ServerOptions() []grpc.ServerOption {
	return []grpc.ServerOption{
		grpc.MaxRecvMsgSize(MaxMessageBytes),
		grpc.MaxSendMsgSize(MaxMessageBytes),
	}
}

// DialOption returns the matching call options for a client connection, so a
// large response is not rejected on receipt.
func DialOption() grpc.DialOption {
	return grpc.WithDefaultCallOptions(
		grpc.MaxCallRecvMsgSize(MaxMessageBytes),
		grpc.MaxCallSendMsgSize(MaxMessageBytes),
	)
}
