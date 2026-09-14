package service

import (
	"errors"
	"testing"

	"inkwell/server/internal/workspace/domain"
)

func value[T any](v T) *T { return &v }

func TestWorkspacePatchClearsNullableFieldsAndPreservesOmitted(t *testing.T) {
	description, avatar := "description", "avatar.png"
	w := &domain.Workspace{Name: "Keep", Description: &description, AvatarURL: &avatar}
	if err := applyWorkspacePatch(w, MetadataPatch{Description: value(""), AvatarURL: value("")}); err != nil {
		t.Fatal(err)
	}
	if w.Name != "Keep" || w.Description != nil || w.AvatarURL != nil {
		t.Fatalf("patch result: %+v", w)
	}
	if err := applyWorkspacePatch(w, MetadataPatch{Name: value("")}); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("empty name error = %v", err)
	}
}

func TestOrganizationPatchSetsAndClearsFields(t *testing.T) {
	description := "old"
	o := &domain.Organization{Name: "Old", Description: &description}
	if err := applyOrganizationPatch(o, MetadataPatch{Name: value("New"), Description: value("")}); err != nil {
		t.Fatal(err)
	}
	if o.Name != "New" || o.Description != nil {
		t.Fatalf("patch result: %+v", o)
	}
}
