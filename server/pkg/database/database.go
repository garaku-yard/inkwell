package database

import (
	"database/sql"
	"fmt"
	"os"

	// This is the PostgreSQL driver.
	// The blank identifier _ is used because we only need the driver to register
	// itself with the database/sql package. We don't use any functions from it directly.
	_ "github.com/lib/pq"
)

// DB holds the active database connection pool. It is populated by the
// ConnectDB function upon a successful connection and can be used by other
// packages to interact with the database.
var DB *sql.DB

/*
ConnectDB initializes the connection to the PostgreSQL database.

It reads connection details (host, port, user, password, dbname, sslmode) from
environment variables for security and flexibility. It then constructs the Data
Source Name (DSN), opens a connection pool, and pings the database to verify
that the connection is alive and configured correctly.

On a successful connection, it populates the global DB variable for package-level
access and returns the connection pool (*sql.DB) and a nil error. If any step
fails, it returns a nil pointer and a descriptive error.
*/
func ConnectDB() (*sql.DB, error) {
	// Retrieve database connection details from environment variables.
	host := os.Getenv("DB_HOST")
	port := os.Getenv("DB_PORT")
	user := os.Getenv("DB_USER")
	password := os.Getenv("DB_PASSWORD")
	dbname := os.Getenv("DB_NAME")
	sslmode := os.Getenv("DB_SSLMODE") // e.g., "disable", "require"

	// Default to "disable" for local development if DB_SSLMODE is not set.
	if sslmode == "" {
		sslmode = "disable"
	}

	// Construct the Data Source Name (DSN) string.
	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		host, port, user, password, dbname, sslmode)

	// Open a connection to the database. sql.Open doesn't immediately connect,
	// but rather prepares a connection pool.
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open database connection: %w", err)
	}

	// Ping the database to verify a connection can be established.
	err = db.Ping()
	if err != nil {
		db.Close() // Clean up resources if ping fails.
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	fmt.Println("Successfully connected to the database!")
	DB = db
	return DB, nil
}
