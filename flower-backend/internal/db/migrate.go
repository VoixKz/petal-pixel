package db

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/pressly/goose/v3"
)

func MigrateUp(ctx context.Context, sqlDB *sql.DB, migrationsDir string) error {
	goose.SetBaseFS(nil)
	goose.SetDialect("postgres")
	goose.SetLogger(goose.NopLogger())

	if err := goose.UpContext(ctx, sqlDB, migrationsDir); err != nil {
		return fmt.Errorf("goose up: %w", err)
	}
	return nil
}