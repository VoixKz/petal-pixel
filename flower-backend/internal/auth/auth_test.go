package auth

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

const (
	testIssuer   = "http://localhost:8180/realms/petal-pixel"
	testAudience = "petal-pixel"
)

type tokenClaims struct {
	jwt.Claims
	Email string `json:"email,omitempty"`
}

type idp struct {
	key    *rsa.PrivateKey
	verify *OIDCVerifier
}

// newIDP serves a real JWKS, so tokens go through the full signature check.
func newIDP(t *testing.T) *idp {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	jwks := jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: key.Public(), KeyID: "k1", Algorithm: "RS256", Use: "sig"}}}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(jwks)
	}))
	t.Cleanup(srv.Close)
	return &idp{key: key, verify: NewOIDCVerifier(context.Background(), testIssuer, srv.URL, testAudience)}
}

func sign(t *testing.T, key *rsa.PrivateKey, c tokenClaims) string {
	t.Helper()
	signer, err := jose.NewSigner(
		jose.SigningKey{Algorithm: jose.RS256, Key: key},
		(&jose.SignerOptions{}).WithHeader("kid", "k1").WithType("JWT"),
	)
	if err != nil {
		t.Fatalf("new signer: %v", err)
	}
	token, err := jwt.Signed(signer).Claims(c).Serialize()
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	return token
}

func validClaims() tokenClaims {
	return tokenClaims{
		Claims: jwt.Claims{
			Issuer:   testIssuer,
			Subject:  "user-1",
			Audience: jwt.Audience{testAudience},
			Expiry:   jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
		Email: "anna@example.test",
	}
}

// Managed Better Auth signs with Ed25519, and go-oidc accepts only RS256 unless
// told otherwise.
func TestVerifyAcceptsAnEdDSAToken(t *testing.T) {
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	jwks := jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: public, KeyID: "k1", Algorithm: "EdDSA", Use: "sig"}}}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(jwks)
	}))
	t.Cleanup(srv.Close)
	signer, err := jose.NewSigner(
		jose.SigningKey{Algorithm: jose.EdDSA, Key: private},
		(&jose.SignerOptions{}).WithHeader("kid", "k1").WithType("JWT"),
	)
	if err != nil {
		t.Fatalf("new signer: %v", err)
	}
	token, err := jwt.Signed(signer).Claims(validClaims()).Serialize()
	if err != nil {
		t.Fatalf("sign: %v", err)
	}

	got, err := NewOIDCVerifier(context.Background(), testIssuer, srv.URL, testAudience).Verify(context.Background(), token)

	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if got.Subject != "user-1" {
		t.Errorf("claims = %+v", got)
	}
}

func TestVerifyAcceptsValidToken(t *testing.T) {
	p := newIDP(t)

	got, err := p.verify.Verify(context.Background(), sign(t, p.key, validClaims()))

	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if got.Subject != "user-1" || got.Email != "anna@example.test" {
		t.Errorf("claims = %+v", got)
	}
}

func TestVerifyRejects(t *testing.T) {
	p := newIDP(t)
	stranger, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}

	expired := validClaims()
	expired.Expiry = jwt.NewNumericDate(time.Now().Add(-time.Hour))
	wrongIssuer := validClaims()
	wrongIssuer.Issuer = "http://evil.test/realms/petal-pixel"
	wrongAudience := validClaims()
	wrongAudience.Audience = jwt.Audience{"another-app"}

	cases := map[string]string{
		"expired":         sign(t, p.key, expired),
		"wrong issuer":    sign(t, p.key, wrongIssuer),
		"wrong audience":  sign(t, p.key, wrongAudience),
		"wrong signature": sign(t, stranger, validClaims()),
		"not a token":     "abc.def.ghi",
		"empty":           "",
	}

	for name, token := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := p.verify.Verify(context.Background(), token); !errors.Is(err, ErrInvalidToken) {
				t.Errorf("err = %v, want ErrInvalidToken", err)
			}
		})
	}
}

type fakeVerifier struct{ err error }

func (f fakeVerifier) Verify(context.Context, string) (Claims, error) {
	return Claims{Subject: "user-1"}, f.err
}

func isOpen(method string) bool { return method == "/flower.v1.FlowerService/CreateFlower" }

// call runs the interceptor and reports what the handler saw.
func call(t *testing.T, v Verifier, method, authorization string) (reached bool, claims Claims, hasClaims bool, err error) {
	t.Helper()
	ctx := context.Background()
	if authorization != "" {
		ctx = metadata.NewIncomingContext(ctx, metadata.Pairs("authorization", authorization))
	}
	_, err = UnaryInterceptor(v, isOpen)(ctx, nil, &grpc.UnaryServerInfo{FullMethod: method}, func(ctx context.Context, _ any) (any, error) {
		reached = true
		claims, hasClaims = FromContext(ctx)
		return nil, nil
	})
	return reached, claims, hasClaims, err
}

const privateMethod = "/flower.v1.FlowerService/PrepareMint"

func TestInterceptorRejectsPrivateCallWithoutToken(t *testing.T) {
	reached, _, _, err := call(t, fakeVerifier{}, privateMethod, "")

	if status.Code(err) != codes.Unauthenticated || reached {
		t.Errorf("code = %v, reached = %v", status.Code(err), reached)
	}
}

func TestInterceptorRejectsBadToken(t *testing.T) {
	reached, _, _, err := call(t, fakeVerifier{err: ErrInvalidToken}, privateMethod, "Bearer abc")

	if status.Code(err) != codes.Unauthenticated || reached {
		t.Errorf("code = %v, reached = %v", status.Code(err), reached)
	}
}

func TestInterceptorRejectsWrongScheme(t *testing.T) {
	reached, _, _, err := call(t, fakeVerifier{}, privateMethod, "Basic abc")

	if status.Code(err) != codes.Unauthenticated || reached {
		t.Errorf("code = %v, reached = %v", status.Code(err), reached)
	}
}

func TestInterceptorPassesClaimsToHandler(t *testing.T) {
	reached, claims, hasClaims, err := call(t, fakeVerifier{}, privateMethod, "Bearer abc")

	if err != nil || !reached || !hasClaims || claims.Subject != "user-1" {
		t.Errorf("err = %v, reached = %v, claims = %+v (%v)", err, reached, claims, hasClaims)
	}
}

func TestInterceptorLeavesOpenMethodsOpen(t *testing.T) {
	reached, _, hasClaims, err := call(t, fakeVerifier{}, "/flower.v1.FlowerService/CreateFlower", "")

	if err != nil || !reached || hasClaims {
		t.Errorf("err = %v, reached = %v, hasClaims = %v", err, reached, hasClaims)
	}
}

// A new RPC must start private: forgetting to list it cannot expose it.
func TestInterceptorTreatsUnlistedMethodsAsPrivate(t *testing.T) {
	reached, _, _, err := call(t, fakeVerifier{}, "/flower.v1.FlowerService/SomethingNew", "")

	if status.Code(err) != codes.Unauthenticated || reached {
		t.Errorf("code = %v, reached = %v", status.Code(err), reached)
	}
}

func TestInterceptorFailsClosedWithoutVerifier(t *testing.T) {
	reached, _, _, err := call(t, nil, privateMethod, "Bearer abc")

	if status.Code(err) != codes.Unavailable || reached {
		t.Errorf("code = %v, reached = %v", status.Code(err), reached)
	}
}

func TestBearerToken(t *testing.T) {
	cases := map[string]string{
		"Bearer abc": "abc",
		"bearer abc": "abc",
		"Basic abc":  "",
		"Bearer":     "",
		"":           "",
	}
	for header, want := range cases {
		if got := BearerToken(header); got != want {
			t.Errorf("BearerToken(%q) = %q, want %q", header, got, want)
		}
	}
}
