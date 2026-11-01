// Package auth checks the OIDC access tokens the identity provider issues.
// Verifier is the seam for moving from local Keycloak to Cognito.
package auth

import (
	"context"
	"errors"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

var ErrInvalidToken = errors.New("invalid token")

// Claims identifies the signed-in user.
type Claims struct {
	Subject string
	Email   string
}

type Verifier interface {
	Verify(ctx context.Context, rawToken string) (Claims, error)
}

type OIDCVerifier struct {
	verifier *oidc.IDTokenVerifier
}

// NewOIDCVerifier takes the JWKS URL separately from the issuer: inside Docker
// the provider is reached at a different address from the one in its tokens.
func NewOIDCVerifier(ctx context.Context, issuer, jwksURL, audience string) *OIDCVerifier {
	keys := oidc.NewRemoteKeySet(ctx, jwksURL)
	return &OIDCVerifier{verifier: oidc.NewVerifier(issuer, keys, &oidc.Config{ClientID: audience})}
}

func (v *OIDCVerifier) Verify(ctx context.Context, rawToken string) (Claims, error) {
	token, err := v.verifier.Verify(ctx, rawToken)
	if err != nil {
		return Claims{}, ErrInvalidToken
	}
	var extra struct {
		Email string `json:"email"`
	}
	if err := token.Claims(&extra); err != nil {
		return Claims{}, ErrInvalidToken
	}
	return Claims{Subject: token.Subject, Email: extra.Email}, nil
}

type claimsKey struct{}

// WithClaims stores the signed-in user on ctx.
func WithClaims(ctx context.Context, c Claims) context.Context {
	return context.WithValue(ctx, claimsKey{}, c)
}

// FromContext returns the signed-in user, if the request has one.
func FromContext(ctx context.Context) (Claims, bool) {
	c, ok := ctx.Value(claimsKey{}).(Claims)
	return c, ok
}

// BearerToken extracts the token from an Authorization header value.
func BearerToken(header string) string {
	scheme, token, ok := strings.Cut(header, " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return ""
	}
	return strings.TrimSpace(token)
}

// UnaryInterceptor requires a valid token on every method isOpen does not name,
// so a newly added RPC starts private.
func UnaryInterceptor(v Verifier, isOpen func(fullMethod string) bool) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		if isOpen(info.FullMethod) {
			return handler(ctx, req)
		}
		if v == nil {
			return nil, status.Error(codes.Unavailable, "sign-in not configured")
		}
		token := ""
		if md, ok := metadata.FromIncomingContext(ctx); ok {
			if values := md.Get("authorization"); len(values) > 0 {
				token = BearerToken(values[0])
			}
		}
		if token == "" {
			return nil, status.Error(codes.Unauthenticated, "sign in required")
		}
		claims, err := v.Verify(ctx, token)
		if err != nil {
			return nil, status.Error(codes.Unauthenticated, "sign in required")
		}
		return handler(WithClaims(ctx, claims), req)
	}
}
