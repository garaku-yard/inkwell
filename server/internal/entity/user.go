package entity

import "time"

type User struct {
	ID          string    `json:"id"`
	Username    string    `json:"username"`
	UsernameTag string    `json:"usernameTag"`
	Name        string    `json:"name"`
	LastName    string    `json:"lastName"`
	Email       string    `json:"email"`
	Password    string    `json:"-"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}
