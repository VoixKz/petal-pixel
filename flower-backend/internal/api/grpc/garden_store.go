package grpcapi

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// foreignKeyViolation is Postgres' error code for a reference to a missing row.
const foreignKeyViolation = "23503"

type Account struct {
	ID          string
	Email       string
	DisplayName string
	AvatarURL   string
	CreatedAt   time.Time
}

type GardenRow struct {
	FlowerID       string
	SavedName      string
	GenerationWord string
	ParamsJSON     string
	CreatedAt      time.Time
	IsMinted       bool
	TxHash         string
	TokenURI       string
}

// EnsureUser returns the account for an identity, creating it on first sign-in.
func (s *Store) EnsureUser(ctx context.Context, subject, email string) (Account, error) {
	var a Account
	err := s.db.QueryRowContext(ctx, `
insert into users (auth_sub, email)
values ($1, nullif($2, ''))
on conflict (auth_sub) do update set email = coalesce(excluded.email, users.email)
returning id, coalesce(email, ''), coalesce(display_name, ''), coalesce(avatar_url, ''), created_at
`, subject, email).Scan(&a.ID, &a.Email, &a.DisplayName, &a.AvatarURL, &a.CreatedAt)
	if err != nil {
		return Account{}, status.Error(codes.Internal, "db write failed")
	}
	return a, nil
}

// UpdateUser changes the fields that are not nil.
func (s *Store) UpdateUser(ctx context.Context, userID string, displayName, avatarURL *string) error {
	_, err := s.db.ExecContext(ctx, `
update users
set display_name = coalesce($2, display_name), avatar_url = coalesce($3, avatar_url), updated_at = now()
where id = $1
`, userID, displayName, avatarURL)
	if err != nil {
		return status.Error(codes.Internal, "db write failed")
	}
	return nil
}

func (s *Store) ListGarden(ctx context.Context, userID string) ([]GardenRow, error) {
	rows, err := s.db.QueryContext(ctx, `
select f.flower_id, f.saved_name, f.generation_word, f.params::text, f.created_at,
       coalesce(m.status = 'confirmed', false),
       case when m.status = 'confirmed' then coalesce(m.tx_hash, '') else '' end,
       case when m.status = 'confirmed' then coalesce(m.token_uri, '') else '' end
from saved_flowers f
left join mints m on m.flower_id = f.flower_id
where f.user_id = $1
order by f.created_at desc
`, userID)
	if err != nil {
		return nil, status.Error(codes.Internal, "db read failed")
	}
	defer rows.Close()

	var out []GardenRow
	for rows.Next() {
		var r GardenRow
		if err := rows.Scan(&r.FlowerID, &r.SavedName, &r.GenerationWord, &r.ParamsJSON, &r.CreatedAt, &r.IsMinted, &r.TxHash, &r.TokenURI); err != nil {
			return nil, status.Error(codes.Internal, "db read failed")
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, status.Error(codes.Internal, "db read failed")
	}
	return out, nil
}

func (s *Store) UpsertGardenFlower(ctx context.Context, userID, flowerID, savedName, generationWord, paramsJSON string) error {
	_, err := s.db.ExecContext(ctx, `
insert into saved_flowers (user_id, flower_id, saved_name, generation_word, params)
values ($1, $2, $3, $4, $5)
on conflict (user_id, flower_id) do update set
  saved_name = excluded.saved_name,
  generation_word = excluded.generation_word,
  params = excluded.params,
  updated_at = now()
`, userID, flowerID, savedName, generationWord, paramsJSON)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == foreignKeyViolation {
		return status.Error(codes.NotFound, "flower not found")
	}
	if err != nil {
		return status.Error(codes.Internal, "db write failed")
	}
	return nil
}

// UpdateGardenFlower changes the fields that are not nil.
func (s *Store) UpdateGardenFlower(ctx context.Context, userID, flowerID string, savedName, generationWord, paramsJSON *string) error {
	res, err := s.db.ExecContext(ctx, `
update saved_flowers
set saved_name = coalesce($3, saved_name),
    generation_word = coalesce($4, generation_word),
    params = coalesce($5::jsonb, params),
    updated_at = now()
where user_id = $1 and flower_id = $2
`, userID, flowerID, savedName, generationWord, paramsJSON)
	if err != nil {
		return status.Error(codes.Internal, "db write failed")
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return status.Error(codes.NotFound, "flower not in garden")
	}
	return nil
}

func (s *Store) DeleteGardenFlower(ctx context.Context, userID, flowerID string) error {
	_, err := s.db.ExecContext(ctx, `delete from saved_flowers where user_id = $1 and flower_id = $2`, userID, flowerID)
	if err != nil {
		return status.Error(codes.Internal, "db write failed")
	}
	return nil
}

// HasSavedFlower reports whether the identity keeps this flower in its garden.
func (s *Store) HasSavedFlower(ctx context.Context, subject, flowerID string) (bool, error) {
	var found bool
	err := s.db.QueryRowContext(ctx, `
select exists (
  select 1 from saved_flowers f join users u on u.id = f.user_id
  where u.auth_sub = $1 and f.flower_id = $2
)`, subject, flowerID).Scan(&found)
	if err != nil {
		return false, status.Error(codes.Internal, "db read failed")
	}
	return found, nil
}
