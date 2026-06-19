package domain

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// ErrDataDeletionRequestNotFound is returned when a user has no active
// data-deletion request.
var ErrDataDeletionRequestNotFound = errors.New("data deletion request not found")

// Data-deletion request statuses.
const (
	DataDeletionPending    = "pending"
	DataDeletionProcessing = "processing"
	DataDeletionCompleted  = "completed"
)

// DataDeletionRequest is a GDPR "delete my personal data" request. It is
// distinct from account deletion: the account and the user's projects survive;
// the request tracks an operator-fulfilled scrub of personal data. Fulfilment
// is manual today (the request is recorded and surfaced); auto-processing is a
// follow-up.
type DataDeletionRequest struct {
	ID                     uuid.UUID  `db:"id"`
	UserID                 uuid.UUID  `db:"user_id"`
	Status                 string     `db:"status"`
	CreatedAt              time.Time  `db:"created_at"`
	CompletedAt            *time.Time `db:"completed_at"`
	ExpectedCompletionDate time.Time  `db:"expected_completion_date"`
}
