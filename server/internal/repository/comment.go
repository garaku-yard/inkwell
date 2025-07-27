// internal/repository/comment.go

package repository

import (
	"database/sql"
	"time"

	"github.com/l1roii/screenwriter/server/internal/entity"
)

type CommentRepository interface {
	Create(comment *entity.Comment) (*entity.Comment, error)
	Update(commentID string, content string) error
	Delete(commentID string) error
	GetUserIDForComment(commentID string) (string, error)
}

type postgresCommentRepository struct {
	db *sql.DB
}

func NewCommentRepository(db *sql.DB) CommentRepository {
	return &postgresCommentRepository{db: db}
}

func (r *postgresCommentRepository) GetUserIDForComment(commentID string) (string, error) {
	var userID string
	err := r.db.QueryRow(`SELECT user_id FROM comments WHERE comment_id = $1`, commentID).Scan(&userID)
	return userID, err
}

func (r *postgresCommentRepository) Create(comment *entity.Comment) (*entity.Comment, error) {
	query := `
		INSERT INTO comments (element_id, scene_id, user_id, content)
		VALUES ($1, $2, $3, $4)
		RETURNING comment_id, is_resolved, created_at`

	err := r.db.QueryRow(query, comment.ElementID, comment.SceneID, comment.UserID, comment.Content).Scan(&comment.ID, &comment.IsResolved, &comment.Timestamp)
	if err != nil {
		return nil, err
	}
	return comment, nil
}

func (r *postgresCommentRepository) Update(commentID string, content string) error {
	query := `UPDATE comments SET content = $1, updated_at = $2 WHERE comment_id = $3`
	_, err := r.db.Exec(query, content, time.Now(), commentID)
	return err
}

func (r *postgresCommentRepository) Delete(commentID string) error {
	query := `DELETE FROM comments WHERE comment_id = $1`
	_, err := r.db.Exec(query, commentID)
	return err
}

func (r *postgresCommentRepository) GetUnresolvedCountsByProject(projectID string) (map[string]int, error) {
	counts := make(map[string]int)

	query := `
		SELECT
			COALESCE(c.scene_id::text, c.element_id::text) AS parent_id,
			COUNT(c.comment_id) AS unresolved_count
		FROM comments c
		-- Join through scenes/elements to get to the project
		LEFT JOIN scenes s ON c.scene_id = s.scene_id
		LEFT JOIN script_elements se ON c.element_id = se.element_id
		LEFT JOIN scenes s_for_el ON se.scene_id = s_for_el.scene_id
		LEFT JOIN acts a ON s.act_id = a.act_id OR s_for_el.act_id = a.act_id
		WHERE
			a.project_id = $1 AND c.is_resolved = false
		GROUP BY parent_id;
	`
	rows, err := r.db.Query(query, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var parentID string
		var count int
		if err := rows.Scan(&parentID, &count); err != nil {
			return nil, err
		}
		counts[parentID] = count
	}

	return counts, nil
}
