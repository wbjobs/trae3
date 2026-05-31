package main

import (
	"edge-platform/internal/api"
	"edge-platform/internal/config"
	"edge-platform/internal/db"
	"edge-platform/internal/discovery"
	"edge-platform/internal/logger"
	"edge-platform/internal/router"
	"edge-platform/internal/scheduler"
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
)

func main() {
	configPath := "config.json"
	if len(os.Args) > 1 {
		configPath = os.Args[1]
	}

	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	if err := os.MkdirAll("./data", 0755); err != nil {
		log.Fatalf("failed to create data directory: %v", err)
	}

	databases, err := db.Init(cfg)
	if err != nil {
		log.Fatalf("failed to initialize databases: %v", err)
	}
	defer databases.Close()

	discSvc := discovery.NewService(databases)
	schedSvc := scheduler.NewService(databases, discSvc)
	routerSvc := router.NewService(databases)
	logSvc := logger.NewService(databases)
	defer logSvc.Close()

	for _, cluster := range cfg.Clusters {
		if _, err := discSvc.SyncClusterNodes(cluster.ID, cluster.Address); err != nil {
			log.Printf("warning: failed to sync cluster %s: %v", cluster.ID, err)
		}
	}

	gin.SetMode(cfg.Server.Mode)
	engine := gin.Default()

	api.RegisterRoutes(engine, discSvc, schedSvc, routerSvc, logSvc)

	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	srv := &http.Server{
		Addr:         addr,
		Handler:      engine,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	go func() {
		log.Printf("edge platform server starting on %s", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("failed to start server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("server forced to shutdown: %v", err)
	}

	log.Println("server exited gracefully")
}
