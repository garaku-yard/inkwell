package notify

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/coder/websocket"

	"inkwell/server/internal/gateway/contextx"
)

const (
	heartbeat = 30 * time.Second
	writeWait = 10 * time.Second
)

// Handler upgrades a user's session to a notification WebSocket and joins it to
// that user's room. There is no project access check — the room is the caller's
// own user id — and no inbound protocol: the channel is server→client only, so
// the read pump exists solely to observe the close.
type Handler struct {
	hub            *Hub
	originPatterns []string
}

// NewHandler builds a notification Handler. allowedOrigins seed the WebSocket
// Origin allowlist (empty ⇒ rely on the gateway's OriginCheck middleware).
func NewHandler(hub *Hub, allowedOrigins []string) *Handler {
	return &Handler{hub: hub, originPatterns: toOriginPatterns(allowedOrigins)}
}

func toOriginPatterns(allowed []string) []string {
	var out []string
	for _, o := range allowed {
		o = strings.TrimSpace(o)
		if o == "" || o == "*" {
			return nil
		}
		host := strings.TrimSuffix(strings.TrimPrefix(strings.TrimPrefix(o, "https://"), "http://"), "/")
		if host != "" {
			out = append(out, host)
		}
	}
	return out
}

// HandleWS authorizes the caller (auth middleware has already populated the
// user id), upgrades to a WebSocket, and joins the user's notification room
// until the socket closes.
func (h *Handler) HandleWS(w http.ResponseWriter, r *http.Request) {
	userID, ok := contextx.UserIDFrom(r.Context())
	if !ok || userID == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	acceptOpts := &websocket.AcceptOptions{}
	if len(h.originPatterns) > 0 {
		acceptOpts.OriginPatterns = h.originPatterns
	} else {
		acceptOpts.InsecureSkipVerify = true
	}
	ws, err := websocket.Accept(w, r, acceptOpts)
	if err != nil {
		return
	}

	c := &conn{userID: userID, send: make(chan []byte, sendBuffer)}
	h.hub.join(c)
	defer h.hub.leave(c)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	defer ws.Close(websocket.StatusNormalClosure, "")

	go h.writePump(ctx, cancel, ws, c)
	h.readPump(ctx, ws)
}

// readPump blocks reading so a disconnect is observed promptly. Inbound frames
// are ignored — the notification channel is one-way.
func (h *Handler) readPump(ctx context.Context, ws *websocket.Conn) {
	for {
		if _, _, err := ws.Read(ctx); err != nil {
			return
		}
	}
}

// writePump flushes queued frames and sends periodic pings to keep the
// connection (and intermediaries) alive.
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
