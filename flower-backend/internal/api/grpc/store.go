package grpcapi

import (
	"context"
	"database/sql"
	"encoding/json"

	"flower-backend/internal/flower"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// FlowerListRow holds a flower row joined with its optional mint record.
type FlowerListRow struct {
	FlowerID   string
	PersonName string
	ParamsJSON []byte
	MintStatus string // "" | "prepared" | "confirmed"
	TxHash     string
	TokenURI   string
}

func (s *Store) ListFlowers(ctx context.Context) ([]FlowerListRow, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT f.flower_id, f.person_name, f.params,
		       COALESCE(m.status, '')    AS mint_status,
		       COALESCE(m.tx_hash, '')   AS tx_hash,
		       COALESCE(m.token_uri, '') AS token_uri
		FROM flowers f
		LEFT JOIN mints m ON f.flower_id = m.flower_id
		ORDER BY f.created_at DESC
	`)
	if err != nil {
		return nil, status.Error(codes.Internal, "db list failed")
	}
	defer rows.Close()

	var result []FlowerListRow
	for rows.Next() {
		var r FlowerListRow
		if err := rows.Scan(&r.FlowerID, &r.PersonName, &r.ParamsJSON, &r.MintStatus, &r.TxHash, &r.TokenURI); err != nil {
			return nil, status.Error(codes.Internal, "db scan failed")
		}
		result = append(result, r)
	}
	if err := rows.Err(); err != nil {
		return nil, status.Error(codes.Internal, "db rows error")
	}
	return result, nil
}

type Store struct {
	db *sql.DB
}

type FlowerRow struct {
	FlowerID   string
	PersonName string
	Params     flower.Params
}

func NewStore(db *sql.DB) *Store {
	if db == nil {
		return nil
	}
	return &Store{db: db}
}

func (s *Store) UpsertFlower(ctx context.Context, flowerID, personName string, p flower.Params) error {
	b, err := json.Marshal(p)
	if err != nil {
		return status.Error(codes.Internal, "failed to encode params")
	}

	_, err = s.db.ExecContext(ctx, `
insert into flowers (flower_id, person_name, seed, algo_version, schema_version, params)
values ($1, $2, $3, $4, $5, $6)
on conflict (flower_id) do update set
  person_name = excluded.person_name,
  seed = excluded.seed,
  algo_version = excluded.algo_version,
  schema_version = excluded.schema_version,
  params = excluded.params
`, flowerID, personName, int64(p.Seed), p.AlgoVersion, p.SchemaVersion, string(b))
	if err != nil {
		return status.Errorf(codes.Internal, "db write failed: %v", err)
	}
	return nil
}

func (s *Store) GetFlower(ctx context.Context, flowerID string) (*FlowerRow, error) {
	var paramsJSON []byte
	var row FlowerRow
	row.FlowerID = flowerID
	err := s.db.QueryRowContext(ctx, `select person_name, params from flowers where flower_id = $1`, flowerID).Scan(&row.PersonName, &paramsJSON)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, status.Error(codes.NotFound, "flower not found")
		}
		return nil, status.Error(codes.Internal, "db read failed")
	}
	if err := json.Unmarshal(paramsJSON, &row.Params); err != nil {
		return nil, status.Error(codes.Internal, "failed to decode params")
	}
	return &row, nil
}

func (s *Store) UpsertMintPrepared(ctx context.Context, flowerID, walletAddress, tokenURI string, chainID uint64, contractAddress string) error {
	_, err := s.db.ExecContext(ctx, `
insert into mints (flower_id, wallet_address, status, token_uri, chain_id, contract_address, updated_at)
values ($1, $2, 'prepared', $3, $4, $5, now())
on conflict (flower_id) do update set
  wallet_address = excluded.wallet_address,
  status = excluded.status,
  token_uri = excluded.token_uri,
  chain_id = excluded.chain_id,
  contract_address = excluded.contract_address,
  updated_at = now()
`, flowerID, walletAddress, tokenURI, int64(chainID), contractAddress)
	if err != nil {
		return status.Error(codes.Internal, "db write failed")
	}
	return nil
}

func (s *Store) ConfirmMint(ctx context.Context, flowerID, txHash string) error {
	res, err := s.db.ExecContext(ctx, `
update mints
set status = 'confirmed', tx_hash = $2, updated_at = now()
where flower_id = $1
`, flowerID, txHash)
	if err != nil {
		return status.Error(codes.Internal, "db write failed")
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return status.Error(codes.NotFound, "mint not found for flower")
	}
	return nil
}

