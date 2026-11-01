package grpcapi

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"testing"
	"time"

	"flower-backend/internal/db"
	"flower-backend/internal/flower"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	testFlowerID = "flw_test"
	walletAlex   = "0xaaaa000000000000000000000000000000000001"
	walletBen    = "0xbbbb000000000000000000000000000000000002"
	txFirst      = "0x1111"
	txSecond     = "0x2222"
)

// newTestStore gives each test a private schema on a real Postgres, so the SQL
// under test (conflict rules, constraints) actually runs. Set TEST_DB_DSN to
// enable it; without one these tests skip and `go test ./...` still works.
func newTestStore(t *testing.T) *Store {
	t.Helper()
	dsn := os.Getenv("TEST_DB_DSN")
	if dsn == "" {
		t.Skip("TEST_DB_DSN not set")
	}
	ctx := context.Background()
	schema := fmt.Sprintf("test_%d", time.Now().UnixNano())

	admin, err := db.Open(ctx, dsn)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if _, err := admin.SQL().ExecContext(ctx, "create schema "+schema); err != nil {
		t.Fatalf("create schema: %v", err)
	}
	t.Cleanup(func() {
		if _, err := admin.SQL().ExecContext(ctx, "drop schema "+schema+" cascade"); err != nil {
			t.Errorf("drop schema: %v", err)
		}
		_ = admin.Close()
	})

	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatalf("parse dsn: %v", err)
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()

	scoped, err := db.Open(ctx, u.String())
	if err != nil {
		t.Fatalf("open scoped db: %v", err)
	}
	t.Cleanup(func() { _ = scoped.Close() })

	if err := db.MigrateUp(ctx, scoped.SQL(), "../../../db/migrations"); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return NewStore(scoped.SQL())
}

// seedFlower inserts the flower row the mints table references.
func seedFlower(t *testing.T, s *Store) flower.Params {
	t.Helper()
	p := flower.GenerateFromName("Anna")
	if err := s.UpsertFlower(context.Background(), testFlowerID, "Anna", p); err != nil {
		t.Fatalf("seed flower: %v", err)
	}
	return p
}

type mintRow struct {
	wallet, status, tokenURI string
	txHash, owner, tokenID   sql.NullString
}

func readMint(t *testing.T, s *Store) mintRow {
	t.Helper()
	var r mintRow
	err := s.db.QueryRowContext(context.Background(),
		`select wallet_address, status, token_uri, tx_hash, owner_address, token_id from mints where flower_id = $1`, testFlowerID,
	).Scan(&r.wallet, &r.status, &r.tokenURI, &r.txHash, &r.owner, &r.tokenID)
	if err != nil {
		t.Fatalf("read mint: %v", err)
	}
	return r
}

func TestUpsertMintPreparedRefusesConfirmedMint(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	seedFlower(t, s)

	if err := s.UpsertMintPrepared(ctx, testFlowerID, walletAlex, "uri-alex", 1337, "0xc"); err != nil {
		t.Fatalf("first prepare: %v", err)
	}
	if err := s.ConfirmMint(ctx, testFlowerID, txFirst, walletAlex, "7"); err != nil {
		t.Fatalf("confirm: %v", err)
	}

	err := s.UpsertMintPrepared(ctx, testFlowerID, walletBen, "uri-ben", 1337, "0xc")
	if status.Code(err) != codes.AlreadyExists {
		t.Fatalf("second prepare: got code %v (err=%v), want AlreadyExists", status.Code(err), err)
	}

	got := readMint(t, s)
	if got.wallet != walletAlex || got.status != "confirmed" || got.tokenURI != "uri-alex" || got.txHash.String != txFirst {
		t.Errorf("confirmed mint changed: %+v", got)
	}
}

// A retry before the transaction confirms is the normal path (wallet popup
// closed, image capture failed), so the guard must not block it.
func TestUpsertMintPreparedAllowsRetryBeforeConfirm(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	seedFlower(t, s)

	if err := s.UpsertMintPrepared(ctx, testFlowerID, walletAlex, "uri-1", 1337, "0xc"); err != nil {
		t.Fatalf("first prepare: %v", err)
	}
	if err := s.UpsertMintPrepared(ctx, testFlowerID, walletAlex, "uri-2", 1337, "0xc"); err != nil {
		t.Fatalf("retry prepare: %v", err)
	}

	if got := readMint(t, s); got.tokenURI != "uri-2" || got.status != "prepared" {
		t.Errorf("retry not applied: %+v", got)
	}
}

func TestConfirmMintKeepsFirstTxHash(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	seedFlower(t, s)

	if err := s.UpsertMintPrepared(ctx, testFlowerID, walletAlex, "uri", 1337, "0xc"); err != nil {
		t.Fatalf("prepare: %v", err)
	}
	if err := s.ConfirmMint(ctx, testFlowerID, txFirst, walletAlex, "7"); err != nil {
		t.Fatalf("first confirm: %v", err)
	}

	err := s.ConfirmMint(ctx, testFlowerID, txSecond, walletBen, "8")
	if status.Code(err) != codes.AlreadyExists {
		t.Fatalf("second confirm: got code %v (err=%v), want AlreadyExists", status.Code(err), err)
	}
	if got := readMint(t, s); got.txHash.String != txFirst {
		t.Errorf("tx hash changed: %+v", got)
	}
}

// The frontend retries ConfirmMint after a dropped response, so repeating the
// same hash has to succeed.
func TestConfirmMintIsIdempotentForSameTxHash(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	seedFlower(t, s)

	if err := s.UpsertMintPrepared(ctx, testFlowerID, walletAlex, "uri", 1337, "0xc"); err != nil {
		t.Fatalf("prepare: %v", err)
	}
	if err := s.ConfirmMint(ctx, testFlowerID, txFirst, walletAlex, "7"); err != nil {
		t.Fatalf("first confirm: %v", err)
	}
	if err := s.ConfirmMint(ctx, testFlowerID, txFirst, walletAlex, "7"); err != nil {
		t.Errorf("repeat confirm: %v", err)
	}
}

func TestConfirmMintWithoutPrepareIsNotFound(t *testing.T) {
	s := newTestStore(t)
	seedFlower(t, s)

	err := s.ConfirmMint(context.Background(), testFlowerID, txFirst, walletAlex, "7")
	if status.Code(err) != codes.NotFound {
		t.Errorf("got code %v (err=%v), want NotFound", status.Code(err), err)
	}
}

func TestUpsertFlowerKeepsFirstParams(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	first := seedFlower(t, s)

	changed := first
	changed.PetalCount = first.PetalCount + 1
	if err := s.UpsertFlower(ctx, testFlowerID, "Anna again", changed); err != nil {
		t.Fatalf("second upsert: %v", err)
	}

	got, err := s.GetFlower(ctx, testFlowerID)
	if err != nil {
		t.Fatalf("get flower: %v", err)
	}
	if got.Params.PetalCount != first.PetalCount {
		t.Errorf("params changed: got %d petals, want %d", got.Params.PetalCount, first.PetalCount)
	}
	if got.PersonName != "Anna" {
		t.Errorf("person name changed: got %q, want %q", got.PersonName, "Anna")
	}
}
