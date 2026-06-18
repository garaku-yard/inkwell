package events

import "testing"

// Topic must route every event family to the right Kafka topic. The notifications
// consumer subscribes to collab-events for collaboration, comment, and invitation
// events, so those three must all land there.
func TestTopic(t *testing.T) {
	cases := map[string]string{
		EventTypeUserCreated:    "user-events",
		EventTypeProjectCreated: "project-events",
		EventTypeProjectDeleted: "project-events",
		EventTypeCollabAdded:    "collab-events",
		EventTypeCollabInvited:  "collab-events",
		EventTypeCommentAdded:   "collab-events",
		EventTypeBillingUpdated: "billing-events",
		"something.unknown":     "misc-events",
	}
	for eventType, want := range cases {
		if got := Topic(eventType); got != want {
			t.Errorf("Topic(%q) = %q, want %q", eventType, got, want)
		}
	}
}
