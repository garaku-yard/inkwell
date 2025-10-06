package handler

import (
	"bufio"
	"bytes"
	"encoding/json"
	"log"
	"net/http"
)

type AIHandler struct{}

func NewAIHandler() *AIHandler {
	return &AIHandler{}
}

type OllamaRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
	Stream bool   `json:"stream"`
}

type OllamaTagsResponse struct {
	Models []struct {
		Name string `json:"name"`
	} `json:"models"`
}

func (h *AIHandler) Chat(w http.ResponseWriter, r *http.Request) {
	var requestData struct {
		Prompt string `json:"prompt"`
		Model  string `json:"model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&requestData); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	systemPrompt := `You are a professional scriptwriting assistant. 
		Your purpose is to help writers develop and refine scripts, whether for film, television, theater, or other media.

		Behavior guidelines:
		- Always begin by asking clarifying questions to fully understand the user’s goals, genre, audience, and constraints before giving suggestions.
		- Maintain a professional, respectful, and collaborative tone at all times.
		- Provide structured, actionable advice tailored to the user’s needs.
		- Offer examples, formatting tips, and creative alternatives where relevant.
		- If the request is ambiguous, ask for more detail rather than making assumptions.
		- Stay focused on scriptwriting craft (plot, characters, dialogue, structure, pacing, themes).
		- Avoid unnecessary filler; be clear, concise, and practical.`

	ollamaReqPayload := OllamaRequest{
		Model:  requestData.Model,
		Prompt: systemPrompt + "\n User Input: \n" + requestData.Prompt,
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
