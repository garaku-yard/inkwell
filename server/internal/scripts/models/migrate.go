package models

import (
	"fmt"

	"gorm.io/gorm"
)

// AutoMigrate runs GORM's AutoMigrate for all models
// This is similar to EF Core's database.Migrate()
func AutoMigrate(db *gorm.DB) error {
	// AutoMigrate will create tables, add missing columns, add missing indexes
	// It will NOT modify existing columns or delete unused columns (safe to run)
	err := db.AutoMigrate(
		&Project{},
		&ScriptElement{},
		&Scene{},
		&Character{},
		&Location{},
		&OutlineUnit{},
		&Beat{},
		&BeatConnection{},
		&Lane{},
		&OutlineItem{},
	)

	if err != nil {
		return fmt.Errorf("failed to auto-migrate: %w", err)
	}

	return nil
}
