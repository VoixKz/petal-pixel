package ratelimit

import (
	"context"
	"fmt"
	"net"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/peer"
	"google.golang.org/grpc/status"
)

func TestAllowStopsAfterTheBurst(t *testing.T) {
	l := New(60, 3)

	for i := range 3 {
		if !l.Allow("1.2.3.4") {
			t.Fatalf("request %d refused inside the burst", i)
		}
	}
	if l.Allow("1.2.3.4") {
		t.Error("fourth request allowed past a burst of 3")
	}
}

func TestAllowCountsEachClientSeparately(t *testing.T) {
	l := New(60, 1)

	if !l.Allow("1.2.3.4") {
		t.Fatal("first client refused")
	}
	if !l.Allow("5.6.7.8") {
		t.Error("second client refused because of the first")
	}
}

// Without a cap, an attacker with many addresses could grow the map forever.
func TestAllowKeepsTheClientTableBounded(t *testing.T) {
	l := New(60, 1)

	for i := range maxClients + 50 {
		l.Allow(fmt.Sprintf("client-%d", i))
	}

	if len(l.clients) > maxClients {
		t.Errorf("tracking %d clients, want at most %d", len(l.clients), maxClients)
	}
}

func callFrom(t *testing.T, l *Limiter, method, ip string) (bool, error) {
	t.Helper()
	ctx := peer.NewContext(context.Background(), &peer.Peer{Addr: &net.TCPAddr{IP: net.ParseIP(ip), Port: 4000}})
	reached := false
	_, err := UnaryInterceptor(l, "/svc/Limited")(ctx, nil, &grpc.UnaryServerInfo{FullMethod: method}, func(context.Context, any) (any, error) {
		reached = true
		return nil, nil
	})
	return reached, err
}

func TestInterceptorLimitsTheNamedMethod(t *testing.T) {
	l := New(60, 1)

	if reached, err := callFrom(t, l, "/svc/Limited", "1.2.3.4"); !reached || err != nil {
		t.Fatalf("first call: reached = %v, err = %v", reached, err)
	}
	reached, err := callFrom(t, l, "/svc/Limited", "1.2.3.4")

	if status.Code(err) != codes.ResourceExhausted || reached {
		t.Errorf("code = %v, reached = %v", status.Code(err), reached)
	}
}

// The port differs on every connection, so it must not be part of the key.
func TestInterceptorIgnoresTheClientPort(t *testing.T) {
	l := New(60, 1)
	call := func(port int) error {
		ctx := peer.NewContext(context.Background(), &peer.Peer{Addr: &net.TCPAddr{IP: net.ParseIP("1.2.3.4"), Port: port}})
		_, err := UnaryInterceptor(l, "/svc/Limited")(ctx, nil, &grpc.UnaryServerInfo{FullMethod: "/svc/Limited"}, func(context.Context, any) (any, error) {
			return nil, nil
		})
		return err
	}

	if err := call(1000); err != nil {
		t.Fatalf("first call: %v", err)
	}
	if err := call(2000); status.Code(err) != codes.ResourceExhausted {
		t.Errorf("code = %v, want ResourceExhausted", status.Code(err))
	}
}

func TestInterceptorLeavesOtherMethodsAlone(t *testing.T) {
	l := New(60, 1)

	for range 3 {
		if reached, err := callFrom(t, l, "/svc/Other", "1.2.3.4"); !reached || err != nil {
			t.Fatalf("reached = %v, err = %v", reached, err)
		}
	}
}

func TestClientIP(t *testing.T) {
	cases := map[string]string{"1.2.3.4:5000": "1.2.3.4", "[::1]:5000": "::1", "no-port": "no-port"}
	for addr, want := range cases {
		if got := ClientIP(addr); got != want {
			t.Errorf("ClientIP(%q) = %q, want %q", addr, got, want)
		}
	}
}
