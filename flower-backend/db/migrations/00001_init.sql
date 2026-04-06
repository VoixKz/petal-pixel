-- +goose Up
create table if not exists flowers (
  flower_id text primary key,
  person_name text not null,
  seed bigint not null,
  algo_version text not null,
  schema_version text not null,
  params jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists mints (
  flower_id text primary key references flowers(flower_id) on delete cascade,
  wallet_address text not null,
  status text not null,
  tx_hash text,
  token_uri text,
  chain_id bigint,
  contract_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mints_wallet on mints(wallet_address);

-- +goose Down
drop table if exists mints;
drop table if exists flowers;

