package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"flower-backend/internal/assets"
	"flower-backend/internal/db"

	grpcapi "flower-backend/internal/api/grpc"

	flowerv1 "flower-backend/gen/go/flower/v1"
	"github.com/improbable-eng/grpc-web/go/grpcweb"
	"github.com/joho/godotenv"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"
)

func main() {
	// Load .env for local dev convenience. Real env vars still override.
	_ = godotenv.Load()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	addr := env("GRPC_ADDR", ":50051")
	dbDSN := os.Getenv("DB_DSN")
	autoMigrate := os.Getenv("DB_AUTO_MIGRATE") == "true"

	chainID := envUint64("CHAIN_ID", 11155111) // Sepolia default
	contractAddress := os.Getenv("NFT_CONTRACT_ADDRESS")

	s3Endpoint := os.Getenv("S3_ENDPOINT")
	s3Region := env("S3_REGION", "us-east-1")
	s3AccessKey := os.Getenv("S3_ACCESS_KEY")
	s3SecretKey := os.Getenv("S3_SECRET_KEY")
	s3Bucket := env("S3_BUCKET", "flower")
	s3PublicBaseURL := os.Getenv("S3_PUBLIC_BASE_URL")
	s3ForcePathStyle := os.Getenv("S3_FORCE_PATH_STYLE") != "false"

	var database *db.DB
	var store *grpcapi.Store
	if dbDSN != "" {
		var err error
		database, err = db.Open(context.Background(), dbDSN)
		if err != nil {
			slog.Error("db open failed", "err", err)
			os.Exit(1)
		}
		defer func() { _ = database.Close() }()

		if autoMigrate {
			if err := db.MigrateUp(context.Background(), database.SQL(), "db/migrations"); err != nil {
				slog.Error("db migrate failed", "err", err)
				os.Exit(1)
			}
			slog.Info("db migrations applied")
		}

		store = grpcapi.NewStore(database.SQL())
	}

	var upl *assets.S3Uploader
	if s3Endpoint != "" && s3PublicBaseURL != "" {
		var err error
		upl, err = assets.NewS3Uploader(context.Background(), assets.S3Config{
			Endpoint:        s3Endpoint,
			Region:          s3Region,
			AccessKeyID:     s3AccessKey,
			SecretAccessKey: s3SecretKey,
			Bucket:          s3Bucket,
			PublicBaseURL:   s3PublicBaseURL,
			ForcePathStyle:  s3ForcePathStyle,
		})
		if err != nil {
			slog.Error("s3 init failed", "err", err)
			os.Exit(1)
		}
		if err := upl.EnsureBucket(context.Background()); err != nil {
			slog.Error("s3 ensure bucket failed", "err", err, "bucket", s3Bucket)
			os.Exit(1)
		}
		slog.Info("s3 configured", "bucket", s3Bucket)
	}

	lis, err := net.Listen("tcp", addr)
	if err != nil {
		slog.Error("listen failed", "addr", addr, "err", err)
		os.Exit(1)
	}

	s := grpc.NewServer()

	flowerv1.RegisterFlowerServiceServer(s, grpcapi.NewFlowerServer(store, upl, chainID, contractAddress))

	hs := health.NewServer()
	hs.SetServingStatus("", healthpb.HealthCheckResponse_SERVING)
	healthpb.RegisterHealthServer(s, hs)

	reflection.Register(s)

	allowedOrigins := parseCSVEnv("GRPC_WEB_ALLOWED_ORIGINS")
	wrapped := grpcweb.WrapServer(
		s,
		grpcweb.WithOriginFunc(func(origin string) bool {
			if len(allowedOrigins) == 0 {
				return true
			}
			for _, allowed := range allowedOrigins {
				if strings.EqualFold(origin, allowed) {
					return true
				}
			}
			return false
		}),
	)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" {
			setAPICORSHeaders(w, r)
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"status":"ok"}`))
			return
		}

		if r.URL.Path == "/api/flowers" {
			setAPICORSHeaders(w, r)
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			if r.Method != http.MethodGet {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				return
			}
			if store == nil {
				http.Error(w, `{"error":"db not configured"}`, http.StatusServiceUnavailable)
				return
			}
			list, err := store.ListFlowers(r.Context())
			if err != nil {
				slog.Error("list flowers failed", "err", err)
				http.Error(w, `{"error":"internal"}`, http.StatusInternalServerError)
				return
			}
			writeFlowersJSON(w, list)
			return
		}

		if wrapped.IsAcceptableGrpcCorsRequest(r) {
			wrapped.ServeHTTP(w, r)
			return
		}
		if wrapped.IsGrpcWebRequest(r) || wrapped.IsGrpcWebSocketRequest(r) {
			wrapped.ServeHTTP(w, r)
			return
		}
		s.ServeHTTP(w, r)
	})

	httpServer := &http.Server{Handler: h2c.NewHandler(handler, &http2.Server{})}

	errCh := make(chan error, 1)
	go func() {
		slog.Info("grpc server started", "addr", addr, "grpc_web_enabled", true)
		errCh <- httpServer.Serve(lis)
	}()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	select {
	case <-ctx.Done():
		slog.Info("shutdown signal received")
	case err := <-errCh:
		if err != nil {
			slog.Error("grpc server stopped", "err", err)
		}
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		slog.Warn("http server shutdown error", "err", err)
	}

	gracefulStop(s, 10*time.Second)
}

func gracefulStop(s *grpc.Server, timeout time.Duration) {
	done := make(chan struct{})
	go func() {
		s.GracefulStop()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(timeout):
		slog.Warn("graceful stop timed out; forcing stop")
		s.Stop()
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envUint64(key string, def uint64) uint64 {
	if v := os.Getenv(key); v != "" {
		var parsed uint64
		_, err := fmt.Sscanf(v, "%d", &parsed)
		if err == nil {
			return parsed
		}
	}
	return def
}

func setAPICORSHeaders(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin == "" {
		origin = "*"
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Content-Type", "application/json")
}

func writeFlowersJSON(w http.ResponseWriter, list []grpcapi.FlowerListRow) {
	type flowerJSON struct {
		FlowerID   string          `json:"flower_id"`
		PersonName string          `json:"person_name"`
		Params     json.RawMessage `json:"params"`
		MintStatus string          `json:"mint_status"`
		TxHash     string          `json:"tx_hash"`
		TokenURI   string          `json:"token_uri"`
	}
	items := make([]flowerJSON, 0, len(list))
	for _, r := range list {
		items = append(items, flowerJSON{
			FlowerID:   r.FlowerID,
			PersonName: r.PersonName,
			Params:     json.RawMessage(r.ParamsJSON),
			MintStatus: r.MintStatus,
			TxHash:     r.TxHash,
			TokenURI:   r.TokenURI,
		})
	}
	type response struct {
		Flowers []flowerJSON `json:"flowers"`
	}
	b, err := json.Marshal(response{Flowers: items})
	if err != nil {
		http.Error(w, `{"error":"encode failed"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(b)
}

func parseCSVEnv(key string) []string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		trimmed := strings.TrimSpace(p)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}