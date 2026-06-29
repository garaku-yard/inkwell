package realtime

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"

	"inkwell/server/internal/gateway/contextx"
	"inkwell/server/internal/gateway/grpcclient"
	"inkwell/server/internal/gateway/handlers"
)

const (
	// sendBuffer is how many outbound frames a connection can queue before the
	// hub starts dropping (slow client). Modest — clients re-sync on reconnect.
	sendBuffer = 32
	// heartbeat keeps the connection (and any intermediary) alive and surfaces
	// dead peers quickly.
	heartbeat = 30 * time.Second
	writeWait = 10 * time.Second
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
// room, and relays inbound frames to the rest of the room. The message protocol
// and presence arrive in Stage 2 — for now inbound frames are relayed verbatim.
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

	c := &conn{userID: userID, send: make(chan []byte, sendBuffer)}
	h.hub.join(projectID, c)
	defer h.hub.leave(projectID, c)

	// The request context is tied to the handshake; use a fresh one for the
	// connection lifetime, cancelled when either pump exits.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	defer ws.Close(websocket.StatusNormalClosure, "")

	go h.writePump(ctx, cancel, ws, c)
	h.readPump(ctx, ws, c, projectID)
}

// readPump relays every inbound frame to the rest of the project room until the
// peer disconnects or errors.
func (h *Handler) readPump(ctx context.Context, ws *websocket.Conn, c *conn, projectID string) {
	for {
		_, data, err := ws.Read(ctx)
		if err != nil {
			return
		}
		h.hub.broadcast(projectID, c, data)
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
