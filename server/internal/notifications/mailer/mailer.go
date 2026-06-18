// Package mailer sends notification emails. Inkwell runs no mail server of its
// own — the operator points SMTP_* at a relay (a self-hosted Postfix, Gmail
// SMTP, SendGrid/Mailgun SMTP, …) and this package is the SMTP *client*. When
// SMTP is unconfigured, New returns a no-op mailer that logs instead of sending,
// so dev and self-host-without-mail still run.
package mailer

import (
	"context"
	"crypto/tls"
	"fmt"
	"log/slog"
	"net"
	"net/smtp"
	"strings"
	"time"
)

// Message is a single outbound email. Body is HTML; a minimal email is sent as
// a single text/html part.
type Message struct {
	To      string
	Subject string
	Body    string
}

// Mailer delivers email messages.
type Mailer interface {
	Send(ctx context.Context, msg Message) error
}

// Config holds SMTP connection settings. Host empty selects the no-op mailer.
type Config struct {
	Host         string
	Port         string
	Username     string // empty → no AUTH (anonymous relay)
	Password     string
	From         string // envelope + header From address
	FromName     string // optional display name
	ImplicitTLS  bool   // true → dial wrapped in TLS (port 465); else opportunistic STARTTLS
	InsecureSkip bool   // skip TLS cert verification (self-signed relays only)
}

// New returns an SMTPMailer when a host is configured, otherwise a NoopMailer.
func New(cfg Config) Mailer {
	if strings.TrimSpace(cfg.Host) == "" {
		slog.Warn("SMTP not configured — emails will be logged, not sent")
		return &NoopMailer{}
	}
	slog.Info("SMTP mailer enabled", "host", cfg.Host, "port", cfg.Port, "auth", cfg.Username != "")
	return &SMTPMailer{cfg: cfg}
}

// NoopMailer logs each message instead of sending. Used when SMTP is
// unconfigured (dev / self-host without mail).
type NoopMailer struct{}

// Send logs the message and returns nil.
func (m *NoopMailer) Send(_ context.Context, msg Message) error {
	slog.Info("email (noop — SMTP not configured)", "to", msg.To, "subject", msg.Subject)
	return nil
}

// SMTPMailer sends via a configured SMTP relay. It dials plain and upgrades
// with STARTTLS when the server advertises it (or uses implicit TLS when
// configured), and authenticates only when a username is set — covering both
// anonymous port-25 relays and authenticated submission (587/465).
type SMTPMailer struct {
	cfg Config
}

// Send delivers one message. The dial honours ctx's deadline; the SMTP exchange
// itself is not context-aware (net/smtp limitation).
func (m *SMTPMailer) Send(ctx context.Context, msg Message) error {
	addr := net.JoinHostPort(m.cfg.Host, m.cfg.Port)

	d := net.Dialer{Timeout: 10 * time.Second}
	conn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("smtp dial %s: %w", addr, err)
	}

	if m.cfg.ImplicitTLS {
		conn = tls.Client(conn, m.tlsConfig())
	}

	c, err := smtp.NewClient(conn, m.cfg.Host)
	if err != nil {
		_ = conn.Close()
		return fmt.Errorf("smtp client: %w", err)
	}
	defer c.Close()

	// Opportunistic STARTTLS when not already wrapped in implicit TLS.
	if !m.cfg.ImplicitTLS {
		if ok, _ := c.Extension("STARTTLS"); ok {
			if err := c.StartTLS(m.tlsConfig()); err != nil {
				return fmt.Errorf("smtp starttls: %w", err)
			}
		}
	}

	if m.cfg.Username != "" {
		if ok, _ := c.Extension("AUTH"); ok {
			auth := smtp.PlainAuth("", m.cfg.Username, m.cfg.Password, m.cfg.Host)
			if err := c.Auth(auth); err != nil {
				return fmt.Errorf("smtp auth: %w", err)
			}
		}
	}

	if err := c.Mail(m.cfg.From); err != nil {
		return fmt.Errorf("smtp mail from: %w", err)
	}
	if err := c.Rcpt(msg.To); err != nil {
		return fmt.Errorf("smtp rcpt to: %w", err)
	}

	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	if _, err := w.Write(m.build(msg)); err != nil {
		return fmt.Errorf("smtp write: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp close data: %w", err)
	}
	return c.Quit()
}

func (m *SMTPMailer) tlsConfig() *tls.Config {
	return &tls.Config{
		ServerName:         m.cfg.Host,
		InsecureSkipVerify: m.cfg.InsecureSkip, //nolint:gosec // opt-in for self-signed relays
	}
}

// build assembles the RFC 5322 message (headers + single text/html part) with
// CRLF line endings.
func (m *SMTPMailer) build(msg Message) []byte {
	from := m.cfg.From
	if m.cfg.FromName != "" {
		from = fmt.Sprintf("%s <%s>", m.cfg.FromName, m.cfg.From)
	}
	var b strings.Builder
	b.WriteString("From: " + from + "\r\n")
	b.WriteString("To: " + msg.To + "\r\n")
	b.WriteString("Subject: " + msg.Subject + "\r\n")
	b.WriteString("Date: " + time.Now().UTC().Format(time.RFC1123Z) + "\r\n")
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
	b.WriteString("\r\n")
	b.WriteString(msg.Body)
	b.WriteString("\r\n")
	return []byte(b.String())
}
