# Flower Backend

Go gRPC backend for procedural flower generation and NFT mint preparation.

## What this service does

- Generates deterministic flower parameters from a person name.
- Stores flowers and mint lifecycle states in PostgreSQL.
- Builds ERC-721 metadata JSON for each flower.
- Uploads metadata to S3-compatible storage (Supabase Storage S3 API by default; any S3-compatible endpoint works).
- Exposes gRPC and gRPC-web endpoints for frontend integration.

## Tech stack

- Go 1.25+
- gRPC + Protobuf
- PostgreSQL (pgx)
- Goose migrations
- AWS SDK v2 (S3-compatible uploads)
- Buf for proto code generation

## Repository structure

- cmd/server: service entrypoint
- internal/api/grpc: gRPC handlers and storage adapters
- internal/flower: flower generation domain logic
- internal/assets: S3 uploader
- db/migrations: SQL migrations
- proto/flower/v1: gRPC contracts
- gen/go: generated protobuf/gRPC code

## Quick start

### 1. Install dependencies

- Go 1.25+
- Docker (optional, for local infra)
- Buf CLI (for protobuf generation)

### 2. Configure environment

Copy env template:

```bash
cp .env.example .env
```

Fill required values in .env.

Minimum for full mint flow:

- DB_DSN
- S3_ENDPOINT
- S3_PUBLIC_BASE_URL
- S3_ACCESS_KEY
- S3_SECRET_KEY
- S3_BUCKET
- CHAIN_ID
- NFT_CONTRACT_ADDRESS

### 3. Object storage (Supabase)

Create a Storage bucket in the Supabase dashboard, enable **S3 protocol** access, issue S3 access keys, and set `S3_*` in `.env` (see `.env.example`). Keep **`S3_FORCE_PATH_STYLE=true`**: with `false`, the AWS SDK uses a `flower.*.storage.supabase.co` host and TLS handshakes fail.

Use a **public** bucket (or public path policy) so NFT `token_uri` URLs resolve without signed cookies.

The `docker-compose.yml` file is intentionally empty of services; add MinIO locally only if you want offline S3.

### 4. Run server

```bash
go run ./cmd/server
```

Default gRPC address: :50051

### 5. Run tests

```bash
go test ./...
```

## API overview

Service: flower.v1.FlowerService

Methods:

- CreateFlower
- GetFlower
- PrepareMint
- ConfirmMint

Full API details and grpcurl examples: API.md

## Development commands

Regenerate Go protobuf code:

```bash
buf generate
```

Generate frontend stubs:

```bash
buf generate --template buf.gen.frontend.yaml
```

## Security notes

- Never commit .env with real credentials.
- Use least-privilege credentials for DB and S3.
- Rotate credentials after accidental exposure.
- Keep dependency updates active (Dependabot is configured).

## License

Add your preferred license before publishing.
