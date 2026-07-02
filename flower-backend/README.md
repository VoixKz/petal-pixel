# Flower Backend

Go gRPC backend for procedural flower generation and NFT mint preparation.

## What this service does

- Generates deterministic flower parameters from a person name.
- Stores flowers and mint lifecycle states in PostgreSQL.
- Builds ERC-721 metadata JSON for each flower.
- Uploads metadata to S3-compatible storage (Supabase Storage S3 API by default; any S3-compatible endpoint works).
- Exposes gRPC and gRPC-web endpoints for frontend integration.

## Tech stack

- Go 1.25 (run via the `golang:1.25-alpine` Docker image; no host install required)
- gRPC + Protobuf
- PostgreSQL (pgx)
- Goose migrations
- AWS SDK v2 (S3-compatible uploads)
- Buf for proto code generation (run via the pinned `bufbuild/buf:1.47.2` Docker image)

## Repository structure

- cmd/server: service entrypoint
- internal/api/grpc: gRPC handlers and storage adapters
- internal/flower: flower generation domain logic
- internal/assets: S3 uploader
- db/migrations: SQL migrations
- proto/flower/v1: gRPC contracts
- gen/go: generated protobuf/gRPC code

## Quick start

### 1. Prerequisites

- Docker (Compose v2+) — the only required host tool.

No Go, Buf, or protoc toolchain is needed on the host: code generation and
the Go test suite both run inside pinned Docker images (`bufbuild/buf:1.47.2`
and `golang:1.25-alpine`). Installing Go locally is optional and only speeds
up an editor/IDE loop.

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

Run the Go test suite via Docker (no host Go needed). Run from the **repo
root** so `$PWD/flower-backend` resolves; the repo path may contain a space,
so keep the quotes:

```bash
docker run --rm -v "$PWD/flower-backend":/src -w /src \
  golang:1.25-alpine go test ./...
```

Scope to the generator package while iterating, and add a cached module
volume to speed up repeat runs:

```bash
docker run --rm -v "$PWD/flower-backend":/src -w /src -v petal-gocache:/go/pkg/mod \
  golang:1.25-alpine go test ./internal/flower/...
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

Regenerate the protobuf stubs (Go + frontend TS) with the pinned Buf image —
no host Buf CLI required. From the repo root:

```bash
./tools/docker/buf.sh
```

`buf.sh` runs both generators (Go stubs → `gen/go`, frontend TS →
`../petal-pixel-studio/src/gen`). To run a single generator by hand:

```bash
# Go stubs -> flower-backend/gen/go
docker run --rm -v "$PWD":/workspace -w /workspace/flower-backend \
  bufbuild/buf:1.47.2 generate
# Frontend TS stubs -> petal-pixel-studio/src/gen
docker run --rm -v "$PWD":/workspace -w /workspace/flower-backend \
  bufbuild/buf:1.47.2 generate --template buf.gen.frontend.yaml
```

The Buf image tag is pinned to `1.47.2` so an unchanged `.proto` regenerates
with a zero diff (floating `latest` drifts plugin versions and produces
spurious changes). The generated stubs
(`gen/go/flower/v1/*.pb.go` and `petal-pixel-studio/src/gen/flower/v1/*.ts`)
are committed to git — the backend Docker build copies `gen/go`, and Vite
imports `src/gen` directly, so both must be regenerated and committed whenever
`proto/flower/v1/service.proto` changes.

## Security notes

- Never commit .env with real credentials.
- Use least-privilege credentials for DB and S3.
- Rotate credentials after accidental exposure.
- Keep dependency updates active (Dependabot is configured).

## License

Add your preferred license before publishing.
