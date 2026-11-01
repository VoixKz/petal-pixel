package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	flowerv1 "flower-backend/gen/go/flower/v1"
	"flower-backend/internal/auth"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestIsValidFlowerID(t *testing.T) {
	cases := []struct {
		name string
		id   string
		want bool
	}{
		{"valid canonical", "flw_0123456789abcdef", true},
		{"valid all hex letters", "flw_abcdefabcdefabcd", true},
		{"valid all digits", "flw_0000000000000000", true},
		{"empty", "", false},
		{"wrong prefix", "xxx_0123456789abcdef", false},
		{"no prefix", "0123456789abcdef", false},
		{"too short", "flw_0123456789abcde", false},
		{"too long", "flw_0123456789abcdef0", false},
		{"uppercase hex", "flw_0123456789ABCDEF", false},
		{"non-hex char", "flw_0123456789abcdeg", false},
		{"dot dot traversal", "flw_..", false},
		{"embedded traversal", "flw_0123456789ab/../", false},
		{"embedded slash", "images/flw_0123456789abcdef", false},
		{"trailing slash", "flw_0123456789abcdef/", false},
		{"percent junk", "flw_%2e%2e%2fabcdef", false},
		{"leading space", " flw_0123456789abcdef", false},
		{"trailing newline", "flw_0123456789abcdef\n", false},
		{"prefix only", "flw_", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isValidFlowerID(tc.id); got != tc.want {
				t.Errorf("isValidFlowerID(%q) = %v, want %v", tc.id, got, tc.want)
			}
		})
	}
}

func TestIsPNG(t *testing.T) {
	validPrefix := []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}
	cases := []struct {
		name string
		b    []byte
		want bool
	}{
		{"exact 8-byte magic", validPrefix, true},
		{"magic plus payload", append(append([]byte{}, validPrefix...), []byte("IHDR....")...), true},
		{"nil", nil, false},
		{"empty", []byte{}, false},
		{"too short", validPrefix[:7], false},
		{"jpeg magic", []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46}, false},
		{"arbitrary text", []byte("not a png at all, just bytes"), false},
		{"missing trailing lf", []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x00}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isPNG(tc.b); got != tc.want {
				t.Errorf("isPNG(%v) = %v, want %v", tc.b, got, tc.want)
			}
		})
	}
}

func TestRecoveryUnaryInterceptorConvertsPanic(t *testing.T) {
	h := func(ctx context.Context, req interface{}) (interface{}, error) { panic("boom") }
	_, err := recoveryUnaryInterceptor(context.Background(), nil, &grpc.UnaryServerInfo{FullMethod: "/svc/M"}, h)
	if status.Code(err) != codes.Internal {
		t.Fatalf("code = %v, want Internal", status.Code(err))
	}
}

func TestRecoveryUnaryInterceptorPassesSuccessThrough(t *testing.T) {
	want := "ok"
	h := func(ctx context.Context, req interface{}) (interface{}, error) { return want, nil }
	got, err := recoveryUnaryInterceptor(context.Background(), nil, &grpc.UnaryServerInfo{}, h)
	if err != nil || got != want {
		t.Fatalf("got (%v,%v), want (ok,nil)", got, err)
	}
}

func TestGrpcWebOriginAllowed(t *testing.T) {
	cases := []struct {
		name    string
		origin  string
		allowed []string
		want    bool
	}{
		{"unset blocks remote", "https://evil.example.com", nil, false},
		{"unset permits localhost", "http://localhost:8080", nil, true},
		{"unset permits 127.0.0.1 any port", "http://127.0.0.1:5173", nil, true},
		{"unset permits https localhost", "https://localhost", nil, true},
		{"unset permits ipv6 loopback", "http://[::1]:8080", nil, true},
		{"unset rejects localhost-suffix trick", "http://localhost.evil.com", nil, false},
		{"unset rejects empty origin", "", nil, false},
		{"list exact match", "http://localhost:8080", []string{"http://localhost:8080"}, true},
		{"list case-insensitive", "HTTP://LOCALHOST:8080", []string{"http://localhost:8080"}, true},
		{"list non-member blocked", "http://localhost:9999", []string{"http://localhost:8080"}, false},
		{"list is authoritative over loopback", "http://127.0.0.1:8080", []string{"http://localhost:8080"}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := grpcWebOriginAllowed(tc.origin, tc.allowed); got != tc.want {
				t.Errorf("grpcWebOriginAllowed(%q, %v) = %v, want %v", tc.origin, tc.allowed, got, tc.want)
			}
		})
	}
}

func TestIsOpenMethod(t *testing.T) {
	cases := map[string]bool{
		flowerv1.FlowerService_CreateFlower_FullMethodName:       true,
		flowerv1.FlowerService_GetFlower_FullMethodName:          true,
		"/grpc.health.v1.Health/Check":                           true,
		"/grpc.reflection.v1.ServerReflection/Info":              true,
		flowerv1.FlowerService_PrepareMint_FullMethodName:        false,
		flowerv1.FlowerService_ConfirmMint_FullMethodName:        false,
		flowerv1.FlowerService_GetMe_FullMethodName:              false,
		flowerv1.FlowerService_ListGarden_FullMethodName:         false,
		flowerv1.FlowerService_UpsertGardenFlower_FullMethodName: false,
		"/flower.v1.FlowerService/AnythingNew":                   false,
	}
	for method, want := range cases {
		if got := isOpenMethod(method); got != want {
			t.Errorf("isOpenMethod(%s) = %v, want %v", method, got, want)
		}
	}
}

type fakeTokens struct{ err error }

func (f fakeTokens) Verify(context.Context, string) (auth.Claims, error) {
	return auth.Claims{Subject: "sub-anna"}, f.err
}

type fakeOwners struct {
	owned bool
	err   error
}

func (f fakeOwners) HasSavedFlower(_ context.Context, subject, _ string) (bool, error) {
	return f.owned && subject == "sub-anna", f.err
}

func TestPreviewAccess(t *testing.T) {
	cases := map[string]struct {
		header   string
		verifier auth.Verifier
		owners   previewOwners
		want     int
	}{
		"owner":          {"Bearer t", fakeTokens{}, fakeOwners{owned: true}, http.StatusOK},
		"no token":       {"", fakeTokens{}, fakeOwners{owned: true}, http.StatusUnauthorized},
		"bad token":      {"Bearer t", fakeTokens{err: auth.ErrInvalidToken}, fakeOwners{owned: true}, http.StatusUnauthorized},
		"no verifier":    {"Bearer t", nil, fakeOwners{owned: true}, http.StatusServiceUnavailable},
		"someone else":   {"Bearer t", fakeTokens{}, fakeOwners{owned: false}, http.StatusForbidden},
		"lookup failure": {"Bearer t", fakeTokens{}, fakeOwners{err: errors.New("db down")}, http.StatusInternalServerError},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			if got := previewAccess(context.Background(), tc.header, tc.verifier, tc.owners, "flw_0123456789abcdef"); got != tc.want {
				t.Errorf("status = %d, want %d", got, tc.want)
			}
		})
	}
}

// The wrapper only answers CORS for methods the server really has.
func registeredServer() *grpc.Server {
	s := grpc.NewServer()
	flowerv1.RegisterFlowerServiceServer(s, &flowerv1.UnimplementedFlowerServiceServer{})
	return s
}

// Every signed-in call goes through this preflight, so a browser request that
// fails it never reaches the server at all.
func TestGrpcWebPreflightAllowsTheBrowserClient(t *testing.T) {
	wrapped := newGrpcWebServer(registeredServer(), []string{"http://localhost:8080"})
	r := httptest.NewRequest(http.MethodOptions, flowerv1.FlowerService_GetMe_FullMethodName, nil)
	r.Header.Set("Origin", "http://localhost:8080")
	r.Header.Set("Access-Control-Request-Method", http.MethodPost)
	r.Header.Set("Access-Control-Request-Headers", "authorization,content-type,x-grpc-web,x-user-agent")
	w := httptest.NewRecorder()

	wrapped.ServeHTTP(w, r)

	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:8080" {
		t.Fatalf("Access-Control-Allow-Origin = %q", got)
	}
	allowed := strings.ToLower(w.Header().Get("Access-Control-Allow-Headers"))
	for _, header := range []string{"authorization", "content-type", "x-grpc-web", "x-user-agent"} {
		if !strings.Contains(allowed, header) {
			t.Errorf("Access-Control-Allow-Headers = %q, missing %s", allowed, header)
		}
	}
}

func TestGrpcWebPreflightRefusesOtherOrigins(t *testing.T) {
	wrapped := newGrpcWebServer(registeredServer(), []string{"http://localhost:8080"})
	r := httptest.NewRequest(http.MethodOptions, flowerv1.FlowerService_GetMe_FullMethodName, nil)
	r.Header.Set("Origin", "http://evil.test")
	r.Header.Set("Access-Control-Request-Method", http.MethodPost)
	w := httptest.NewRecorder()

	wrapped.ServeHTTP(w, r)

	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("Access-Control-Allow-Origin = %q, want none", got)
	}
}
