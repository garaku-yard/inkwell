package handlers

import (
	"time"
	
	scriptspb "scriptlith/server_microservices/pkg/grpc/scripts"
	"scriptlith/server_microservices/pkg/grpc/common"
)

// BeatResponse transforms a protobuf Beat to frontend-friendly JSON structure
type BeatResponse struct {
	ID           string             `json:"id"`
	ProjectID    string             `json:"projectId"`
	Title        string             `json:"title"`
	Description  string             `json:"description"`
	SceneNumbers string             `json:"sceneNumbers"`
	Color        string             `json:"color"`
	Position     PositionResponse   `json:"position"`
	Width        float64            `json:"width"`
	Height       float64            `json:"height"`
	Act          int32              `json:"act"`
	Order        int32              `json:"order"`
	CreatedAt    string             `json:"createdAt,omitempty"`
	UpdatedAt    string             `json:"updatedAt,omitempty"`
}

type PositionResponse struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// ConnectionResponse transforms a protobuf Connection to frontend-friendly JSON
type ConnectionResponse struct {
	ID       string `json:"id"`
	FromID   string `json:"fromId"`
	ToID     string `json:"toId"`
	FromSide string `json:"fromSide"`
	ToSide   string `json:"toSide"`
}

// LaneResponse transforms a protobuf Lane to frontend-friendly JSON
type LaneResponse struct {
	ID        string `json:"id"`
	ProjectID string `json:"projectId"`
	Name      string `json:"name"`
	Color     string `json:"color"`
	Order     int32  `json:"order"`
}

// OutlineItemResponse transforms a protobuf OutlineItem to frontend-friendly JSON
type OutlineItemResponse struct {
	ID          string  `json:"id"`
	ProjectID   string  `json:"projectId"`
	BeatID      string  `json:"beatId"`
	LaneID      string  `json:"laneId"`
	TimelinePos float64 `json:"timelinePos"`
	Width       float64 `json:"width"`
	Order       int32   `json:"order"`
}

// BeatBoardDataResponse transforms a protobuf BeatBoardData to frontend-friendly JSON
type BeatBoardDataResponse struct {
	Beats        []BeatResponse        `json:"beats"`
	Connections  []ConnectionResponse  `json:"connections"`
	Lanes        []LaneResponse        `json:"lanes"`
	OutlineItems []OutlineItemResponse `json:"outlineItems"`
}

// Helper function to convert common.Timestamp to time.Time
func timestampToTime(ts *common.Timestamp) time.Time {
	if ts == nil {
		return time.Time{}
	}
	return time.Unix(ts.Seconds, int64(ts.Nanos))
}

// transformBeat converts protobuf Beat to BeatResponse
func transformBeat(beat *scriptspb.Beat) *BeatResponse {
	if beat == nil {
		return nil
	}
	
	resp := &BeatResponse{
		ID:           beat.Id,
		ProjectID:    beat.ProjectId,
		Title:        beat.Title,
		Description:  beat.Description,
		SceneNumbers: beat.SceneNumbers,
		Color:        beat.Color,
		Position: PositionResponse{
			X: beat.PositionX,
			Y: beat.PositionY,
		},
		Width:  beat.Width,
		Height: beat.Height,
		Act:    beat.ActNumber,
		Order:  beat.Order,
	}
	
	if beat.CreatedAt != nil {
		resp.CreatedAt = timestampToTime(beat.CreatedAt).Format(time.RFC3339)
	}
	if beat.UpdatedAt != nil {
		resp.UpdatedAt = timestampToTime(beat.UpdatedAt).Format(time.RFC3339)
	}
	
	return resp
}

// transformConnection converts protobuf Connection to ConnectionResponse
func transformConnection(conn *scriptspb.Connection) *ConnectionResponse {
	if conn == nil {
		return nil
	}
	
	return &ConnectionResponse{
		ID:       conn.Id,
		FromID:   conn.FromBeatId,
		ToID:     conn.ToBeatId,
		FromSide: conn.FromSide,
		ToSide:   conn.ToSide,
	}
}

// transformLane converts protobuf Lane to LaneResponse
func transformLane(lane *scriptspb.Lane) *LaneResponse {
	if lane == nil {
		return nil
	}
	
	return &LaneResponse{
		ID:        lane.Id,
		ProjectID: lane.ProjectId,
		Name:      lane.Name,
		Color:     lane.Color,
		Order:     lane.Order,
	}
}

// transformOutlineItem converts protobuf OutlineItem to OutlineItemResponse
func transformOutlineItem(item *scriptspb.OutlineItem) *OutlineItemResponse {
	if item == nil {
		return nil
	}
	
	return &OutlineItemResponse{
		ID:          item.Id,
		ProjectID:   item.ProjectId,
		BeatID:      item.BeatId,
		LaneID:      item.LaneId,
		TimelinePos: item.TimelinePosition,
		Width:       item.Width,
		Order:       item.Order,
	}
}

// transformBeatBoardData converts protobuf BeatBoardData to BeatBoardDataResponse
func transformBeatBoardData(data *scriptspb.BeatBoardData) *BeatBoardDataResponse {
	if data == nil {
		return nil
	}
	
	resp := &BeatBoardDataResponse{
		Beats:        make([]BeatResponse, 0, len(data.Beats)),
		Connections:  make([]ConnectionResponse, 0, len(data.Connections)),
		Lanes:        make([]LaneResponse, 0, len(data.Lanes)),
		OutlineItems: make([]OutlineItemResponse, 0, len(data.OutlineItems)),
	}
	
	for _, beat := range data.Beats {
		if transformed := transformBeat(beat); transformed != nil {
			resp.Beats = append(resp.Beats, *transformed)
		}
	}
	
	for _, conn := range data.Connections {
		if transformed := transformConnection(conn); transformed != nil {
			resp.Connections = append(resp.Connections, *transformed)
		}
	}
	
	for _, lane := range data.Lanes {
		if transformed := transformLane(lane); transformed != nil {
			resp.Lanes = append(resp.Lanes, *transformed)
		}
	}
	
	for _, item := range data.OutlineItems {
		if transformed := transformOutlineItem(item); transformed != nil {
			resp.OutlineItems = append(resp.OutlineItems, *transformed)
		}
	}
	
	return resp
}
