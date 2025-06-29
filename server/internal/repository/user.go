package repository

import (
	"database/sql"

	"github.com/l1roii/screenwriter/server/internal/entity"
)

type postgresUserRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) UserRepository {
	return &postgresUserRepository{db: db}
}

// Create inserts a new user record into the database.
func (r *postgresUserRepository) Create(user *entity.User) error {
	query := `
        INSERT INTO users (name, last_name, username, username_tag, email, password)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING user_id, created_at, updated_at`

	return r.db.QueryRow(
		query,
		user.Name,
		user.LastName,
		user.Username,
		user.UsernameTag,
		user.Email,
		user.Password,
	).Scan(&user.ID, &user.CreatedAt, &user.UpdatedAt)
}

// GetByEmail retrieves a user by their email address.
func (r *postgresUserRepository) GetByEmail(email string) (*entity.User, error) {
	query := `
		SELECT user_id, username, username_tag, name, last_name, email, password, created_at, updated_at 
		FROM users WHERE email = $1`

	var u entity.User
	// UPDATED: The email parameter is now correctly passed to the query.
	err := r.db.QueryRow(query, email).Scan(
		&u.ID, &u.Username, &u.UsernameTag, &u.Name, &u.LastName,
		&u.Email, &u.Password, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // Not found
		}
		return nil, err
	}
	return &u, nil
}

func (r *postgresUserRepository) GetByUsernameAndTag(username, tag string) (*entity.User, error) {
	query := `SELECT user_id, username, username_tag, name, last_name, email, created_at, updated_at FROM users WHERE username = $1 AND username_tag = $2`
	var u entity.User
	err := r.db.QueryRow(query, username, tag).Scan(&u.ID, &u.Username, &u.UsernameTag, &u.Name, &u.LastName, &u.Email, &u.CreatedAt, &u.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil // Not found is not an error here
	}
	return &u, err
}
