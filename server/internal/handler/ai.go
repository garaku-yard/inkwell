package handler

import (
	"bufio"
	"bytes"
	"encoding/json"
	"log"
	"net/http"
)

// AIHandler will hold methods for AI-related requests
type AIHandler struct{}

// NewAIHandler creates a new AIHandler
func NewAIHandler() *AIHandler {
	return &AIHandler{}
}

// OllamaRequest represents the request body we'll send to Ollama
type OllamaRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
	Stream bool   `json:"stream"`
}

// OllamaTagsResponse represents Ollama's response for the list of models
type OllamaTagsResponse struct {
	Models []struct {
		Name string `json:"name"`
	} `json:"models"`
}

// Chat handles the streaming chat request
func (h *AIHandler) Chat(w http.ResponseWriter, r *http.Request) {
	var requestData struct {
		Prompt string `json:"prompt"`
		Model  string `json:"model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&requestData); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	ollamaReqPayload := OllamaRequest{
		Model:  requestData.Model,
		Prompt: requestData.Prompt,
		Stream: true,
	}

	payloadBytes, err := json.Marshal(ollamaReqPayload)
	if err != nil {
		http.Error(w, "Failed to marshal Ollama request", http.StatusInternalServerError)
		return
	}

	ollamaURL := "http://localhost:11434/api/generate"
	req, err := http.NewRequest("POST", ollamaURL, bytes.NewReader(payloadBytes))
	if err != nil {
		http.Error(w, "Failed to create Ollama request", http.StatusInternalServerError)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "Failed to communicate with Ollama", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported!", http.StatusInternalServerError)
		return
	}

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		w.Write(line)
		w.Write([]byte("\n"))
		flusher.Flush()
	}

	if err := scanner.Err(); err != nil {
		log.Printf("Error reading from Ollama stream: %v", err)
	}
}

// GetModels fetches and returns the list of available Ollama models
func (h *AIHandler) GetModels(w http.ResponseWriter, r *http.Request) {
	ollamaURL := "http://localhost:11434/api/tags"
	resp, err := http.Get(ollamaURL)
	if err != nil {
		http.Error(w, "Failed to communicate with Ollama", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	var tagsResponse OllamaTagsResponse
	if err := json.NewDecoder(resp.Body).Decode(&tagsResponse); err != nil {
		http.Error(w, "Failed to parse Ollama response", http.StatusInternalServerError)
		return
	}

	var modelNames []struct {
		Name string `json:"name"`
	}
	for _, model := range tagsResponse.Models {
		modelNames = append(modelNames, struct {
			Name string `json:"name"`
		}{Name: model.Name})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(modelNames)
}
