package repository

import (
	"database/sql"

	"github.com/l1roii/screenwriter/server/internal/entity"
)

type postgresUserRepository struct {
	db *sql.DB
}

// NewUserRepository creates a new instance of the user repository.
func NewUserRepository(db *sql.DB) UserRepository {
	return &postgresUserRepository{db: db}
}

// Create inserts a new user record into the database.
func (r *postgresUserRepository) Create(user *entity.User) error {
	query := `
        INSERT INTO users (name, last_name, email, password)
        VALUES ($1, $2, $3, $4)
        RETURNING user_id, created_at, updated_at`

	// Scan the newly generated values back into the user struct.
	err := r.db.QueryRow(query, user.Name, user.LastName, user.Email, user.Password).Scan(&user.ID, &user.CreatedAt, &user.UpdatedAt)
	return err
}

// GetByEmail retrieves a user by their email address.
func (r *postgresUserRepository) GetByEmail(email string) (*entity.User, error) {
	query := `SELECT user_id, name, last_name, email, password, created_at, updated_at FROM users WHERE email = $1`

	var u entity.User
	err := r.db.QueryRow(query, email).Scan(&u.ID, &u.Name, &u.LastName, &u.Email, &u.Password, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // Return nil, nil for not found.
		}
		return nil, err
	}
	return &u, nil
}
