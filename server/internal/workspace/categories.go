package workspace

// Category seed data, shared with the desktop build.
//
// `categories.json` here is a synced copy of `client/lib/categories.json`, which
// is authoritative. It's a copy rather than a shared import because the Docker
// build contexts are ./client and ./server, so neither side can reach the
// other's tree; `task categories:sync` copies it and a client test fails if the
// two ever differ.
//
// Seeding runs on startup as an upsert rather than living in a migration. The
// original seed *was* a migration (000001), which is why the two lists drifted:
// an applied migration can't be edited, so every copy fix would need a new one,
// and nobody wrote them. Upserting on boot means the hosted list simply follows
// the file.

import (
	"context"
	"database/sql"
	_ "embed"
	"encoding/json"
	"fmt"
)

//go:embed categories.json
var categoriesJSON []byte

// Category is one entry of the shared list.
type Category struct {
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Icon        string `json:"icon"`
	// Hosted reports whether the workspace-service exposes this category.
	// Desktop-only categories (vault: a folder of real files on disk) are false
	// and are never seeded, so they can't show up on the web build.
	Hosted bool `json:"hosted"`
}

type categoriesFile struct {
	Categories []Category `json:"categories"`
}

// LoadCategories returns the full shared list, desktop-only entries included.
func LoadCategories() ([]Category, error) {
	var f categoriesFile
	if err := json.Unmarshal(categoriesJSON, &f); err != nil {
		return nil, fmt.Errorf("parse categories.json: %w", err)
	}
	if len(f.Categories) == 0 {
		return nil, fmt.Errorf("categories.json is empty")
	}
	return f.Categories, nil
}

// SeedCategories upserts every hosted category into the categories table, so the
// hosted list matches the shared file on every boot. Idempotent.
//
// It deliberately does not delete unknown rows: projects.category is free-form
// text with no foreign key, so a stale row is harmless, while deleting one that
// existing projects still reference would strip them of their label.
func SeedCategories(ctx context.Context, db *sql.DB) error {
	cats, err := LoadCategories()
	if err != nil {
		return err
	}
	for _, c := range cats {
		if !c.Hosted {
			continue
		}
		_, err := db.ExecContext(ctx, `
			INSERT INTO categories (slug, name, description, icon)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (slug) DO UPDATE SET
				name        = EXCLUDED.name,
				description = EXCLUDED.description,
				icon        = EXCLUDED.icon`,
			c.Slug, c.Name, c.Description, c.Icon)
		if err != nil {
			return fmt.Errorf("seed category %q: %w", c.Slug, err)
		}
	}
	return nil
}
