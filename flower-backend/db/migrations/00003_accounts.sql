-- +goose Up
create table users (
  id uuid primary key default gen_random_uuid(),
  auth_sub text not null unique,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table saved_flowers (
  user_id uuid not null references users(id) on delete cascade,
  flower_id text not null references flowers(flower_id),
  saved_name text not null,
  generation_word text not null default '',
  params jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, flower_id)
);

-- +goose Down
drop table saved_flowers;
drop table users;
