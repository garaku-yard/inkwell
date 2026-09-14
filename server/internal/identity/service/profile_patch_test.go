package service

import (
	"testing"

	"inkwell/server/internal/identity/domain"
)

func stringPtr(v string) *string { return &v }

func TestProfilePatchPreservesOmittedAndClearsOptionalFields(t *testing.T) {
	first, last, avatar := "Ada", "Lovelace", "avatar.png"
	user := &domain.User{Email: "ada@example.com", Username: "ada", FirstName: &first, LastName: &last, AvatarURL: &avatar}
	changed, err := applyProfilePatch(user, &UpdateProfileRequest{FirstName: stringPtr(""), AvatarURL: stringPtr("")})
	if err != nil {
		t.Fatal(err)
	}
	if changed || user.Email != "ada@example.com" || user.Username != "ada" || user.FirstName != nil || user.AvatarURL != nil || user.LastName == nil {
		t.Fatalf("patch result: %+v", user)
	}
}

func TestProfilePatchRejectsRequiredFieldClear(t *testing.T) {
	user := &domain.User{Email: "ada@example.com", Username: "ada"}
	if _, err := applyProfilePatch(user, &UpdateProfileRequest{Email: stringPtr("")}); err == nil {
		t.Fatal("empty email accepted")
	}
	if _, err := applyProfilePatch(user, &UpdateProfileRequest{Username: stringPtr("")}); err == nil {
		t.Fatal("empty username accepted")
	}
}
