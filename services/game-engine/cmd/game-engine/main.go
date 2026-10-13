package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"catan.local/game-engine/internal/httpapi"
)

const defaultListenAddress = "127.0.0.1:8080"

func main() {
	server := &http.Server{
		Addr:              configuredListenAddress(),
		Handler:           httpapi.NewHandler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("game engine API listening on %s", server.Addr)
	if err := server.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func configuredListenAddress() string {
	if address := os.Getenv("GAME_ENGINE_ADDR"); address != "" {
		return address
	}

	return defaultListenAddress
}
