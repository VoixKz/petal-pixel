package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"regexp"
	"strings"
	"syscall"
	"time"

	"flower-backend/internal/assets"
	"flower-backend/internal/db"
	"flower-backend/internal/share"

	grpcapi "flower-backend/internal/api/grpc"

	flowerv1 "flower-backend/gen/go/flower/v1"
	"github.com/improbable-eng/grpc-web/go/grpcweb"
	"github.com/joho/godotenv"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"
	"google.golang.org/grpc/status"
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
	// Default true. Supabase Storage S3 also needs path style (virtual-hosted breaks TLS: bucket as subdomain).
	s3ForcePathStyle := os.Getenv("S3_FORCE_PATH_STYLE") != "false"

	// SPA origin the /share/<id> page forwards humans to, and the base for the
	// branded OG fallback image (FRONTEND_URL + share.FallbackImagePath).
	frontendURL := strings.TrimRight(env("FRONTEND_URL", "http://localhost:8080"), "/")

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

	s := grpc.NewServer(grpc.UnaryInterceptor(recoveryUnaryInterceptor))

	flowerv1.RegisterFlowerServiceServer(s, grpcapi.NewFlowerServer(store, upl, chainID, contractAddress))

	hs := health.NewServer()
	hs.SetServingStatus("", healthpb.HealthCheckResponse_SERVING)
	healthpb.RegisterHealthServer(s, hs)

	reflection.Register(s)

	allowedOrigins := parseCSVEnv("GRPC_WEB_ALLOWED_ORIGINS")
	wrapped := grpcweb.WrapServer(
		s,
		grpcweb.WithOriginFunc(func(origin string) bool {
			return grpcWebOriginAllowed(origin, allowedOrigins)
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

		// Per-flower share HTML for social scrapers (Open Graph / Twitter).
		if strings.HasPrefix(r.URL.Path, "/share/") {
			handleShare(w, r, store, upl, s3PublicBaseURL, frontendURL)
			return
		}

		// Singular per-flower routes: public read-only JSON (GET) and preview
		// image upload (POST .../preview). Placed AFTER the exact "/api/flowers"
		// list check so the plural list route is never shadowed.
		if strings.HasPrefix(r.URL.Path, "/api/flowers/") {
			id := flowerIDFromPath(r.URL.Path, "/api/flowers/")
			if strings.HasSuffix(r.URL.Path, "/preview") {
				handleUploadPreview(w, r, store, upl, id)
				return
			}
			handlePublicFlower(w, r, store, id)
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
	w.Header().Set("Vary", "Origin")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Content-Type", "application/json")
}

// setPreviewCORSHeaders mirrors setAPICORSHeaders but advertises POST for the
// preview upload, keeping the GET-only helpers (healthz + list + public read)
// unchanged. Both reflect the request Origin, falling back to "*".
func setPreviewCORSHeaders(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin == "" {
		origin = "*"
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Set("Vary", "Origin")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Content-Type", "application/json")
}

// flowerIDFromPath trims prefix and any trailing "/preview" segment, returning
// the flower id ("" if empty).
func flowerIDFromPath(path, prefix string) string {
	id := strings.TrimPrefix(path, prefix)
	id = strings.TrimSuffix(id, "/preview")
	return strings.Trim(id, "/")
}

// flowerIDPattern matches a canonical flower id: "flw_" followed by exactly 16
// lowercase hex chars (the server derives ids as "flw_"+hex(sha256(...)[0:8])).
var flowerIDPattern = regexp.MustCompile(`^flw_[0-9a-f]{16}$`)

// pngMagic is the 8-byte signature every PNG file begins with (see the PNG spec,
// §5.2): a high bit, "PNG", a CRLF, a DOS EOF, and a trailing LF.
var pngMagic = []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}

// isPNG reports whether b begins with the PNG magic signature. The preview
// upload key is served with a forced image/png content-type, so bytes that are
// not actually a PNG are rejected before the write.
func isPNG(b []byte) bool {
	return bytes.HasPrefix(b, pngMagic)
}

// isValidFlowerID reports whether id has the exact canonical flower-id format.
// This is the interim mitigation against path-traversal / arbitrary-S3-key
// injection: Go percent-decodes r.URL.Path, so an unvalidated id can smuggle
// "/" and "." into the "images/<id>.png" key. Rejecting anything that is not
// ^flw_[0-9a-f]{16}$ removes that surface before any key is constructed.
func isValidFlowerID(id string) bool {
	return flowerIDPattern.MatchString(id)
}

// handleShare renders the per-flower Open Graph / Twitter HTML document that
// social scrapers fetch. Humans are forwarded to the SPA landing. An unknown id
// (or a backend with no store) still returns a valid branded doc pointing at the
// frontend so stale links degrade gracefully.
func handleShare(w http.ResponseWriter, r *http.Request, store *grpcapi.Store, upl *assets.S3Uploader, s3PublicBaseURL, frontendURL string) {
	id := flowerIDFromPath(r.URL.Path, "/share/")
	// Reject malformed ids (path traversal / arbitrary-key input) before touching
	// the store or building any S3 key.
	if !isValidFlowerID(id) {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	appURL := frontendURL + "/share/" + id
	shareURL := shareCanonicalURL(r)

	writeHTML := func(status int, d share.HTMLData) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(status)
		_, _ = io.WriteString(w, share.RenderShareHTML(d))
	}

	fallbackImage := frontendURL + share.FallbackImagePath

	if id == "" || store == nil {
		writeHTML(http.StatusNotFound, share.HTMLData{
			FlowerID:   id,
			PersonName: "Petal Pixel",
			ImageURL:   fallbackImage,
			ShareURL:   shareURL,
			AppURL:     frontendURL,
		})
		return
	}

	f, err := store.GetFlower(r.Context(), id)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			writeHTML(http.StatusNotFound, share.HTMLData{
				FlowerID:   id,
				PersonName: "Petal Pixel",
				ImageURL:   fallbackImage,
				ShareURL:   shareURL,
				AppURL:     frontendURL,
			})
			return
		}
		slog.Error("share get flower failed", "err", err, "flower_id", id)
		writeHTML(http.StatusInternalServerError, share.HTMLData{
			FlowerID:   id,
			PersonName: "Petal Pixel",
			ImageURL:   fallbackImage,
			ShareURL:   shareURL,
			AppURL:     frontendURL,
		})
		return
	}

	imageURL := fallbackImage
	imageExists := false
	if upl != nil {
		imageKey := "images/" + id + ".png"
		if ok, exErr := upl.Exists(r.Context(), imageKey); exErr == nil && ok {
			imageExists = true
			imageURL = strings.TrimRight(s3PublicBaseURL, "/") + "/images/" + id + ".png"
		} else if exErr != nil {
			slog.Warn("share image exists check failed", "err", exErr, "flower_id", id)
		}
	}

	writeHTML(http.StatusOK, share.HTMLData{
		FlowerID:    id,
		PersonName:  f.PersonName,
		ImageURL:    imageURL,
		ImageExists: imageExists,
		ShareURL:    shareURL,
		AppURL:      appURL,
	})
}

// shareCanonicalURL reconstructs the absolute og:url for this request. TLS
// termination is external for local dev, so scheme defaults to http unless the
// request or a forwarding proxy indicates https.
func shareCanonicalURL(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	return scheme + "://" + r.Host + r.URL.Path
}

// handlePublicFlower serves the read-only, no-auth JSON the SPA landing consumes:
// {"flower_id","person_name","params"} with params passed through as raw jsonb.
func handlePublicFlower(w http.ResponseWriter, r *http.Request, store *grpcapi.Store, id string) {
	setAPICORSHeaders(w, r)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	if store == nil {
		http.Error(w, `{"error":"db not configured"}`, http.StatusServiceUnavailable)
		return
	}
	// Reject malformed ids (path traversal / arbitrary-key input) before the store
	// is queried.
	if !isValidFlowerID(id) {
		http.Error(w, `{"error":"invalid flower id"}`, http.StatusBadRequest)
		return
	}
	f, err := store.GetFlower(r.Context(), id)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		slog.Error("public flower read failed", "err", err, "flower_id", id)
		http.Error(w, `{"error":"internal"}`, http.StatusInternalServerError)
		return
	}
	paramsJSON, err := json.Marshal(f.Params)
	if err != nil {
		slog.Error("public flower params encode failed", "err", err, "flower_id", id)
		http.Error(w, `{"error":"internal"}`, http.StatusInternalServerError)
		return
	}
	body, err := share.PublicFlowerJSON(share.FlowerData{
		FlowerID:   f.FlowerID,
		PersonName: f.PersonName,
		ParamsJSON: paramsJSON,
	})
	if err != nil {
		http.Error(w, `{"error":"encode failed"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

// handleUploadPreview accepts an image/png body (bounded to 2 MiB, mirroring the
// mint path) and uploads it to images/<id>.png, returning {"image_url":…}.
//
// SECURITY (remaining gap): this endpoint is still unauthenticated by the
// backend's existing design, so any caller who knows a valid flower id can
// overwrite that flower's public OG image. Validating the id format and
// requiring the flower to exist is the interim mitigation (it blocks
// path-traversal / arbitrary-key writes and bounds the blast radius to real
// ids); a proper ownership gate — or a server-issued signed upload token — must
// be added when auth is introduced.
func handleUploadPreview(w http.ResponseWriter, r *http.Request, store *grpcapi.Store, upl *assets.S3Uploader, id string) {
	setPreviewCORSHeaders(w, r)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	if upl == nil {
		http.Error(w, `{"error":"storage not configured"}`, http.StatusServiceUnavailable)
		return
	}
	// Reject malformed ids (path traversal / arbitrary-key input) before any S3
	// key is constructed.
	if !isValidFlowerID(id) {
		http.Error(w, `{"error":"invalid flower id"}`, http.StatusBadRequest)
		return
	}
	// Require the flower to exist so previews can only be written for real
	// flowers, limiting the overwrite blast radius.
	if store == nil {
		http.Error(w, `{"error":"db not configured"}`, http.StatusServiceUnavailable)
		return
	}
	if _, err := store.GetFlower(r.Context(), id); err != nil {
		if status.Code(err) == codes.NotFound {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		slog.Error("preview flower lookup failed", "err", err, "flower_id", id)
		http.Error(w, `{"error":"internal"}`, http.StatusInternalServerError)
		return
	}
	const maxPreviewBytes = 2 << 20 // 2 MiB, mirroring the mint snapshot bound.
	if r.ContentLength > maxPreviewBytes {
		http.Error(w, `{"error":"image too large"}`, http.StatusRequestEntityTooLarge)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxPreviewBytes)
	data, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error":"image too large"}`, http.StatusRequestEntityTooLarge)
		return
	}
	if len(data) == 0 {
		http.Error(w, `{"error":"empty body"}`, http.StatusBadRequest)
		return
	}
	// Reject non-PNG bytes: the key is written with a forced image/png
	// content-type, so anything that is not actually a PNG would be served under a
	// lie. Verify the 8-byte PNG magic signature before the write.
	if !isPNG(data) {
		http.Error(w, `{"error":"not a png"}`, http.StatusBadRequest)
		return
	}
	imageKey := "images/" + id + ".png"
	imageURL, err := upl.PutBytes(r.Context(), imageKey, "image/png", bytes.NewReader(data))
	if err != nil {
		slog.Error("preview upload failed", "err", err, "flower_id", id)
		http.Error(w, `{"error":"upload failed"}`, http.StatusInternalServerError)
		return
	}
	b, err := json.Marshal(struct {
		ImageURL string `json:"image_url"`
	}{imageURL})
	if err != nil {
		http.Error(w, `{"error":"encode failed"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(b)
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

// recoveryUnaryInterceptor converts a panic in any unary handler into a
// codes.Internal error, so a single malformed row can never crash the process
// or tear down the grpc-web connection.
func recoveryUnaryInterceptor(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (resp interface{}, err error) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("panic recovered in unary handler", "method", info.FullMethod, "panic", r)
			err = status.Error(codes.Internal, "internal error")
		}
	}()
	return handler(ctx, req)
}

// isLocalDevOrigin reports whether origin is a loopback http(s) origin. These
// are the only origins allowed when GRPC_WEB_ALLOWED_ORIGINS is unset, so an
// unconfigured server fails closed to remote origins instead of reflecting all.
func isLocalDevOrigin(origin string) bool {
	u, err := url.Parse(origin)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return false
	}
	host := u.Hostname() // strips :port and [] brackets
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

// grpcWebOriginAllowed is the grpc-web CORS decision. An explicit allowlist is
// authoritative (case-insensitive exact match). With NO allowlist configured it
// fails closed: only loopback dev origins pass, never every origin.
func grpcWebOriginAllowed(origin string, allowed []string) bool {
	if len(allowed) == 0 {
		return isLocalDevOrigin(origin)
	}
	for _, a := range allowed {
		if strings.EqualFold(origin, a) {
			return true
		}
	}
	return false
}