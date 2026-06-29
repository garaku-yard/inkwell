package realtime

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"

	"inkwell/server/internal/gateway/contextx"
	"inkwell/server/internal/gateway/grpcclient"
	"inkwell/server/internal/gateway/handlers"
	"inkwell/server/pkg/grpc/identity"
)

const (
	// sendBuffer is how many outbound frames a connection can queue before the
	// hub starts dropping (slow client). Modest — clients re-sync on reconnect.
	sendBuffer = 32
	// heartbeat keeps the connection (and any intermediary) alive and surfaces
	// dead peers quickly.
	heartbeat = 30 * time.Second
	writeWait = 10 * time.Second
	// identityTimeout bounds the profile lookup so a slow identity service can't
	// stall the handshake — we fall back to a generic name on timeout.
	identityTimeout = 3 * time.Second
)

// Handler upgrades project editing sessions to WebSockets and joins them to the
// per-project room. Access is authorized with the same ResolveProjectAccess the
// REST handlers use, so owners, org members, and active collaborators are
// admitted and everyone else is rejected before the upgrade.
type Handler struct {
	hub            *Hub
	clients        *grpcclient.Registry
	originPatterns []string // host patterns for the WS Origin check (empty ⇒ skip)
}

// NewHandler builds a realtime Handler. allowedOrigins are the gateway's
// configured origins; their hosts become the WebSocket Origin allowlist.
func NewHandler(clients *grpcclient.Registry, allowedOrigins []string) *Handler {
	return &Handler{
		hub:            NewHub(),
		clients:        clients,
		originPatterns: toOriginPatterns(allowedOrigins),
	}
}

// toOriginPatterns strips the scheme from configured origins to the host:port
// form coder/websocket matches the Origin header against. A "*" or empty config
// yields no patterns, which the handler treats as "skip the library's check"
// (the gateway's OriginCheck middleware already guards the handshake).
func toOriginPatterns(allowed []string) []string {
	var out []string
	for _, o := range allowed {
		o = strings.TrimSpace(o)
		if o == "" || o == "*" {
			return nil
		}
		host := strings.TrimPrefix(strings.TrimPrefix(o, "https://"), "http://")
		host = strings.TrimSuffix(host, "/")
		if host != "" {
			out = append(out, host)
		}
	}
	return out
}

// HandleWS authorizes the caller, upgrades to a WebSocket, joins the project
// room, and exchanges presence with the rest of the room: the joiner receives
// the current roster, everyone else receives a peer_join; focus changes are
// relayed both ways. Unrecognised frames (Stage 3 element edits) are relayed
// verbatim.
func (h *Handler) HandleWS(w http.ResponseWriter, r *http.Request) {
	userID, ok := contextx.UserIDFrom(r.Context())
	if !ok || userID == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	projectID := chi.URLParam(r, "projectId")
	if projectID == "" {
		http.Error(w, "project id is required", http.StatusBadRequest)
		return
	}

	// Reuse the REST access check: owner / org member / active collaborator.
	if _, err := handlers.ResolveProjectAccess(
		r.Context(), userID, projectID,
		h.clients.Scripts, h.clients.Collab, h.clients.Workspace,
	); err != nil {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	name, avatarURL := h.lookupIdentity(r.Context(), userID)

	acceptOpts := &websocket.AcceptOptions{}
	if len(h.originPatterns) > 0 {
		acceptOpts.OriginPatterns = h.originPatterns
	} else {
		// No configured patterns (dev / wildcard) — the gateway's OriginCheck
		// middleware already validated the Origin on this handshake.
		acceptOpts.InsecureSkipVerify = true
	}

	ws, err := websocket.Accept(w, r, acceptOpts)
	if err != nil {
		return // Accept has already written the failure
	}

	c := &conn{
		id:        h.hub.nextConnID(),
		userID:    userID,
		name:      name,
		avatarURL: avatarURL,
		send:      make(chan []byte, sendBuffer),
	}

	// Join under one lock, capturing who is already here; tell the joiner about
	// them and tell them about the joiner.
	roster := h.hub.join(projectID, c)
	defer h.hub.leave(projectID, c)
	c.send <- encodeRoster(roster)
	h.hub.broadcast(projectID, c, encodePeer(TypePeerJoin, c.peer()))
	defer h.hub.broadcast(projectID, c, encodeLeave(c.id))

	// The request context is tied to the handshake; use a fresh one for the
	// connection lifetime, cancelled when either pump exits.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	defer ws.Close(websocket.StatusNormalClosure, "")

	go h.writePump(ctx, cancel, ws, c)
	h.readPump(ctx, ws, c, projectID)
}

// lookupIdentity resolves a display name and avatar for the connecting user.
// Failures (or a slow identity service) degrade to a generic name rather than
// blocking the handshake.
func (h *Handler) lookupIdentity(ctx context.Context, userID string) (name, avatarURL string) {
	fallback := "Someone"
	if len(userID) >= 8 {
		fallback = "User " + userID[:8]
	}
	lookupCtx, cancel := context.WithTimeout(ctx, identityTimeout)
	defer cancel()
	resp, err := h.clients.Identity.GetUser(lookupCtx, &identity.GetUserRequest{UserId: userID})
	if err != nil || resp.GetUser() == nil {
		return fallback, ""
	}
	u := resp.GetUser()
	name = strings.TrimSpace(fmt.Sprintf("%s %s", u.GetFirstName(), u.GetLastName()))
	if name == "" {
		name = u.GetUsername()
	}
	if name == "" {
		name = fallback
	}
	return name, u.GetAvatarUrl()
}

// readPump processes inbound frames until the peer disconnects or errors. Focus
// frames update presence and are relayed (with server-stamped identity);
// server-authoritative presence types from a client are ignored; everything
// else is relayed to the room verbatim for forward compatibility.
func (h *Handler) readPump(ctx context.Context, ws *websocket.Conn, c *conn, projectID string) {
	for {
		_, data, err := ws.Read(ctx)
		if err != nil {
			return
		}
		in, ok := parseInbound(data)
		if !ok {
			continue
		}
		switch in.Type {
		case TypeFocus:
			peer := h.hub.setFocus(c, in.ElementID, in.Label)
			h.hub.broadcast(projectID, c, encodePeer(TypeFocus, peer))
		case TypeRoster, TypePeerJoin, TypePeerLeave:
			// Presence is server-authoritative — never relay a client's claim.
			continue
		default:
			// Unknown to this stage (e.g. Stage 3 edits) — relay as-is.
			h.hub.broadcast(projectID, c, data)
		}
	}
}

// writePump flushes queued frames and sends periodic pings. Any write failure
// cancels the connection so readPump unwinds too.
func (h *Handler) writePump(ctx context.Context, cancel context.CancelFunc, ws *websocket.Conn, c *conn) {
	ticker := time.NewTicker(heartbeat)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case msg := <-c.send:
			wctx, wcancel := context.WithTimeout(ctx, writeWait)
			err := ws.Write(wctx, websocket.MessageText, msg)
			wcancel()
			if err != nil {
				cancel()
				return
			}
		case <-ticker.C:
			pctx, pcancel := context.WithTimeout(ctx, writeWait)
			err := ws.Ping(pctx)
			pcancel()
			if err != nil {
				cancel()
				return
			}
		}
	}
}
