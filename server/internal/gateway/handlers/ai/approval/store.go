package approval

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"inkwell/server/pkg/aiadapter"
)

var ErrNotFound = errors.New("approval checkpoint not found, expired, or already consumed")

type Checkpoint struct {
	ID            string              `json:"id"`
	UserID        string              `json:"user_id"`
	ProjectID     string              `json:"project_id"`
	Category      string              `json:"category,omitempty"`
	Tool          aiadapter.ToolCall  `json:"tool"`
	Messages      []aiadapter.Message `json:"messages"`
	Model         string              `json:"model"`
	ProviderID    string              `json:"provider_id"`
	CorrelationID string              `json:"correlation_id"`
	CreatedAt     time.Time           `json:"created_at"`
	ExpiresAt     time.Time           `json:"expires_at"`
}

type Store interface {
	Create(context.Context, Checkpoint, time.Duration) (Checkpoint, error)
	Consume(context.Context, string, string, string) (Checkpoint, error)
	Deny(context.Context, string, string, string) (Checkpoint, error)
	Audit(context.Context, AuditRecord) error
}
type AuditRecord struct {
	CheckpointID  string          `json:"checkpoint_id"`
	UserID        string          `json:"user_id"`
	ProjectID     string          `json:"project_id"`
	Tool          string          `json:"tool"`
	Decision      string          `json:"decision"`
	CorrelationID string          `json:"correlation_id"`
	Arguments     json.RawMessage `json:"arguments"`
	Before        json.RawMessage `json:"before,omitempty"`
	Result        json.RawMessage `json:"result,omitempty"`
	At            time.Time       `json:"at"`
}

type RedisStore struct{ rdb *redis.Client }

func NewRedisStore(rdb *redis.Client) *RedisStore {
	if rdb == nil {
		return nil
	}
	return &RedisStore{rdb: rdb}
}
func key(id string) string { return "ai:approval:" + id }
func (s *RedisStore) Create(ctx context.Context, c Checkpoint, ttl time.Duration) (Checkpoint, error) {
	c.ID = uuid.NewString()
	c.CreatedAt = time.Now().UTC()
	c.ExpiresAt = c.CreatedAt.Add(ttl)
	b, err := json.Marshal(c)
	if err != nil {
		return c, err
	}
	err = s.rdb.Set(ctx, key(c.ID), b, ttl).Err()
	return c, err
}

var consumeScript = redis.NewScript(`local v=redis.call('GET',KEYS[1]); if not v then return nil end; local c=cjson.decode(v); if c.user_id~=ARGV[1] or c.project_id~=ARGV[2] then return nil end; redis.call('DEL',KEYS[1]); return v`)

func (s *RedisStore) consume(ctx context.Context, id, user, project string) (Checkpoint, error) {
	raw, err := consumeScript.Run(ctx, s.rdb, []string{key(id)}, user, project).Text()
	if err == redis.Nil {
		return Checkpoint{}, ErrNotFound
	}
	if err != nil {
		return Checkpoint{}, err
	}
	var c Checkpoint
	if json.Unmarshal([]byte(raw), &c) != nil {
		return Checkpoint{}, ErrNotFound
	}
	return c, nil
}
func (s *RedisStore) Consume(ctx context.Context, id, user, project string) (Checkpoint, error) {
	return s.consume(ctx, id, user, project)
}
func (s *RedisStore) Deny(ctx context.Context, id, user, project string) (Checkpoint, error) {
	return s.consume(ctx, id, user, project)
}
func (s *RedisStore) Audit(ctx context.Context, a AuditRecord) error {
	a.At = time.Now().UTC()
	b, err := json.Marshal(a)
	if err != nil {
		return err
	}
	p := s.rdb.TxPipeline()
	p.LPush(ctx, "ai:approval:audit", b)
	p.LTrim(ctx, "ai:approval:audit", 0, 9999)
	if a.Decision == "approved" && len(a.Before) > 0 {
		p.Set(ctx, "ai:approval:undo:"+a.CheckpointID, b, 24*time.Hour)
	}
	_, err = p.Exec(ctx)
	return err
}
