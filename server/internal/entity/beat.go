package entity

type Beat struct {
	ID           string `json:"id"`
	ProjectID    string `json:"-"` // Ignored by JSON response, used internally
	Title        string `json:"title"`
	Description  string `json:"description"`
	SceneNumbers string `json:"sceneNumbers"`
	Color        string `json:"color"`
	PositionX    int    `json:"-"`
	PositionY    int    `json:"-"`
	Position     struct {
		X int `json:"x"`
		Y int `json:"y"`
	} `json:"position"`
	Width  int `json:"width"`
	Height int `json:"height"`
	Act    int `json:"act"`
	Order  int `json:"order"`
}

type Connection struct {
	ID        string `json:"id"`
	ProjectID string `json:"-"`
	FromId    string `json:"fromId"`
	ToId      string `json:"toId"`
	FromSide  string `json:"fromSide"`
	ToSide    string `json:"toSide"`
}

type BeatBoardData struct {
	Beats       []*Beat       `json:"beats"`
	Connections []*Connection `json:"connections"`
}
