-- +goose Up
alter table mints add column owner_address text;
alter table mints add column token_id text;

-- +goose Down
alter table mints drop column token_id;
alter table mints drop column owner_address;
