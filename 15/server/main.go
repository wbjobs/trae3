package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"floating-server/server"
)

func main() {
	addr := flag.String("addr", ":9090", "server listen address")
	flag.Parse()

	srv := server.NewServer(*addr)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		sig := <-sigCh
		fmt.Printf("\n[Main] Received signal: %v, shutting down...\n", sig)
		srv.Stop()
	}()

	log.Println("[Main] Floating Facility Server starting...")
	if err := srv.Start(); err != nil {
		log.Fatalf("[Main] Server error: %v", err)
	}
}
