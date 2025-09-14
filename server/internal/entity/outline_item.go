package entity

type OutlineItem struct {
	ID               string  `json:"id"`
	ProjectID        string  `json:"projectId"`
	BeatID           string  `json:"beatId"`
	LaneID           string  `json:"laneId"`
	Order            int     `json:"order"`
	TimelinePosition float64 `json:"timelinePosition"`
	Width            float64 `json:"width"`
}
