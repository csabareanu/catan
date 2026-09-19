package main

import (
	"log"
	"net/http"
	"time"

	"catan.local/game-engine/internal/httpapi"
)

func main() {
	const listenAddress = "127.0.0.1:8080"

	server := &http.Server{
		Addr:              listenAddress,
		Handler:           httpapi.NewHandler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("game engine API listening on %s", listenAddress)
	if err := server.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
