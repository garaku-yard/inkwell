package main

import (
	"fmt"
	"net/http"
)

func main() {
	mux := http.NewServeMux()

	// Test route precedence
	mux.HandleFunc("/collaborators/username-tag", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "✅ Matched /collaborators/username-tag")
	})

	mux.HandleFunc("/collaborators", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "❌ Matched /collaborators (should not happen for username-tag)")
	})

	fmt.Println("Testing route precedence...")
	fmt.Println("Starting server on :9999")
	fmt.Println("Test: curl http://localhost:9999/collaborators/username-tag")

	http.ListenAndServe(":9999", mux)
}
