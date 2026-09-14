package service

import (
	"errors"
	"testing"

	"inkwell/server/internal/scripts/domain"
)

func ptr[T any](v T) *T { return &v }

func TestBeatPatchDistinguishesOmittedZeroAndEmpty(t *testing.T) {
	image := "old.png"
	beat := &domain.Beat{Title: "keep", Description: "clear me", PositionX: 42, Order: 7, ImageURL: &image}
	if err := applyBeatPatch(beat, &domain.BeatPatch{Description: ptr(""), PositionX: ptr(int32(0)), Order: ptr(int32(0)), ImageURL: ptr("")}); err != nil {
		t.Fatal(err)
	}
	if beat.Title != "keep" {
		t.Fatalf("omitted title changed to %q", beat.Title)
	}
	if beat.Description != "" || beat.PositionX != 0 || beat.Order != 0 || beat.ImageURL != nil {
		t.Fatalf("zero/clear patch not applied: %+v", beat)
	}
}

func TestLanePatchRejectsInvalidClearAndAcceptsZeroOrder(t *testing.T) {
	lane := &domain.Lane{Name: "Plot", Color: "red", Order: 3}
	if err := applyLanePatch(lane, &domain.LanePatch{Order: ptr(int32(0)), Color: ptr("")}); err != nil {
		t.Fatal(err)
	}
	if lane.Order != 0 || lane.Color != "" || lane.Name != "Plot" {
		t.Fatalf("patch result: %+v", lane)
	}
	if err := applyLanePatch(lane, &domain.LanePatch{Name: ptr("")}); !errors.Is(err, domain.ErrInvalidProjectData) {
		t.Fatalf("empty name error = %v", err)
	}
}

func TestOutlineItemPatchAcceptsTimelineOrigin(t *testing.T) {
	item := &domain.OutlineItem{Order: 4, TimelinePosition: 8.5, Width: 120}
	applyOutlineItemPatch(item, &domain.OutlineItemPatch{Order: ptr(int32(0)), TimelinePosition: ptr(0.0), Width: ptr(0.0)})
	if item.Order != 0 || item.TimelinePosition != 0 || item.Width != 0 {
		t.Fatalf("patch result: %+v", item)
	}
}
