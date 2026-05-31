package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"industrial-protocol-gateway/cluster"
	"industrial-protocol-gateway/common"
	"industrial-protocol-gateway/config"
	"industrial-protocol-gateway/logger"
	"industrial-protocol-gateway/pool"
	"industrial-protocol-gateway/protocol"
	"industrial-protocol-gateway/router"
	"industrial-protocol-gateway/storage"
)

func main() {
	if err := config.Load(); err != nil {
		panic("failed to load config: " + err.Error())
	}

	if err := logger.Init(); err != nil {
		panic("failed to init logger: " + err.Error())
	}
	defer logger.Sync()

	logger.Info("starting industrial protocol gateway service...")

	common.InitSnowflake(config.Get().Server.NodeID)

	if err := pool.InitDBPool(); err != nil {
		logger.Fatalf("failed to init db pool: %v", err)
	}
	defer pool.CloseDBPool()

	if err := storage.InitInfluxDB(); err != nil {
		logger.Fatalf("failed to init influxdb: %v", err)
	}
	defer storage.CloseInfluxDB()

	protocol.InitParser()

	wpConfig := config.Get().Protocol.WorkerPool
	common.InitWorkerPools(
		wpConfig.ParseWorkers,
		wpConfig.StorageWorkers,
		wpConfig.ForwardWorkers,
		wpConfig.QueueSize,
	)
	defer common.CloseAllPools()

	storage.InitForwardManager()
	defer storage.GetForwardManager().Close()

	if err := cluster.InitCluster(); err != nil {
		logger.Fatalf("failed to init cluster: %v", err)
	}
	defer cluster.Shutdown()

	r := router.SetupRouter()

	srv := &http.Server{
		Addr:         ":" + config.Get().Server.Port,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		logger.Infof("server starting on port %s", config.Get().Server.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatalf("server failed to start: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logger.Info("server is shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		logger.Fatalf("server forced shutdown: %v", err)
	}

	logger.Info("server exited gracefully")
}
