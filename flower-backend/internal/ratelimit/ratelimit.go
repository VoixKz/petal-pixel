// Package ratelimit caps how fast one client can call the open endpoints.
package ratelimit

import (
	"context"
	"net"
	"net/http"
	"strings"
	"sync"

	"golang.org/x/time/rate"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/peer"
	"google.golang.org/grpc/status"
)

// maxClients bounds memory. Clearing the table only gives clients a fresh
// allowance, which is an acceptable price for a simple in-process limiter.
const maxClients = 10000

type Limiter struct {
	mu      sync.Mutex
	clients map[string]*rate.Limiter
	limit   rate.Limit
	burst   int
}

func New(perMinute, burst int) *Limiter {
	return &Limiter{clients: map[string]*rate.Limiter{}, limit: rate.Limit(float64(perMinute) / 60), burst: burst}
}

func (l *Limiter) Allow(client string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	c, ok := l.clients[client]
	if !ok {
		if len(l.clients) >= maxClients {
			clear(l.clients)
		}
		c = rate.NewLimiter(l.limit, l.burst)
		l.clients[client] = c
	}
	return c.Allow()
}

// ClientIP drops the port, which changes on every connection.
func ClientIP(addr string) string {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return addr
	}
	return host
}

// RequestIP returns the client address of an HTTP request. ipHeader names a
// header set by a trusted proxy; leave it empty when clients connect directly,
// because a client can otherwise pick its own identity.
func RequestIP(r *http.Request, ipHeader string) string {
	if ipHeader != "" {
		if ip := strings.TrimSpace(r.Header.Get(ipHeader)); ip != "" {
			return ip
		}
	}
	return ClientIP(r.RemoteAddr)
}

// UnaryInterceptor applies the limiter to one gRPC method. ipHeader works as in
// RequestIP.
func UnaryInterceptor(l *Limiter, method, ipHeader string) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		if info.FullMethod != method {
			return handler(ctx, req)
		}
		if !l.Allow(callerIP(ctx, ipHeader)) {
			return nil, status.Error(codes.ResourceExhausted, "too many requests")
		}
		return handler(ctx, req)
	}
}

func callerIP(ctx context.Context, ipHeader string) string {
	if ipHeader != "" {
		if md, ok := metadata.FromIncomingContext(ctx); ok {
			if values := md.Get(ipHeader); len(values) > 0 && strings.TrimSpace(values[0]) != "" {
				return strings.TrimSpace(values[0])
			}
		}
	}
	if p, ok := peer.FromContext(ctx); ok && p.Addr != nil {
		return ClientIP(p.Addr.String())
	}
	return "unknown"
}
