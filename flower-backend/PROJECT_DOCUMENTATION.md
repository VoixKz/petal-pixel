# Flower Backend: Project Documentation

## 1) Project Purpose

This repository is a gRPC backend for procedural flower generation and NFT mint preparation.

Main responsibilities:
- Generate deterministic flower parameters from a person name.
- Persist flower and mint lifecycle data in PostgreSQL.
- Build NFT metadata JSON.
- Upload metadata to S3-compatible storage (Supabase Storage S3 API in the default setup).
- Return mint preparation data for an ERC-721 contract.

This project exposes gRPC only (no REST/HTTP API endpoints).

## 2) High-Level Architecture

Execution flow:
1. Client calls FlowerService.CreateFlower with person_name.
2. Backend deterministically generates flower params and flower_id.
3. If DB is configured, backend upserts flower data.
4. Client calls FlowerService.PrepareMint with flower_id and wallet address.
5. Backend reads flower params, builds metadata JSON, uploads it to S3.
6. Backend stores mint status as prepared and returns chain + token URI data.
7. Client submits blockchain transaction externally.
8. Client calls FlowerService.ConfirmMint with tx hash.
9. Backend marks mint as confirmed in DB.

## 3) Root Files

### .env
Purpose:
- Local environment variable configuration.
- Defines DB connection, migration toggle, S3 settings, chain ID, and NFT contract address.

Notes:
- Intended for local development.
- Contains sensitive values and should not be committed with real credentials.

### API.md
Purpose:
- Human-readable API contract documentation for gRPC endpoints.
- Lists methods, request/response fields, prerequisites, errors, env variables, and grpcurl examples.

### go.mod
Purpose:
- Go module declaration and direct/indirect dependency list.

Notable dependencies:
- gRPC and Protobuf runtime.
- PostgreSQL driver pgx.
- Goose migrations.
- AWS SDK v2 for S3 operations.
- godotenv for local .env loading.

### go.sum
Purpose:
- Cryptographic checksums for module dependency integrity and reproducible builds.

### docker-compose.yml
Purpose:
- Local infrastructure for dependent services.

Services:
- postgres: local PostgreSQL 16 with healthcheck.
- Supabase Storage (S3 protocol): public object URLs for NFT metadata JSON.

### buf.yaml
Purpose:
- Buf module and lint/breaking-change policy configuration for proto sources.

### buf.gen.yaml
Purpose:
- Buf code generation configuration.
- Generates Go protobuf and gRPC stubs into gen/go.

## 4) Folder-by-Folder Reference

## cmd/
Purpose:
- Application entrypoints (executables).

### cmd/server/main.go
Purpose:
- Main backend bootstrap and runtime lifecycle.

Responsibilities:
- Loads .env (for local convenience).
- Reads runtime config from environment variables.
- Initializes structured logging.
- Opens PostgreSQL (optional if DB_DSN provided).
- Applies migrations when DB_AUTO_MIGRATE=true.
- Initializes S3 uploader (optional if S3 is configured).
- Creates and starts gRPC server.
- Registers FlowerService implementation.
- Registers gRPC health service and reflection.
- Handles graceful shutdown on SIGINT/SIGTERM.

## contracts/
Purpose:
- Smart contract artifacts used by the mint flow.

### contracts/FlowerNFT.sol
Purpose:
- Minimal ERC-721 contract for minting Flower NFTs.

Key behavior:
- Inherits ERC721URIStorage and Ownable.
- Owner-only mint(to, tokenURI).
- Auto-increments nextTokenId.

## db/
Purpose:
- SQL migrations and database schema evolution.

### db/migrations/00001_init.sql
Purpose:
- Initial schema migration.

Creates:
- flowers table: stores deterministic flower identity and params JSON.
- mints table: stores mint lifecycle state and chain data.
- index on mints.wallet_address.

Includes:
- Up migration (create objects).
- Down migration (drop objects).

## proto/
Purpose:
- Source-of-truth gRPC/Protobuf contracts.

### proto/flower/v1/service.proto
Purpose:
- Defines flower.v1 package, FlowerService RPCs, and all request/response messages.

RPC methods:
- CreateFlower
- GetFlower
- PrepareMint
- ConfirmMint

Important:
- This file is the canonical API contract.
- Generated code under gen/go is derived from this proto.

## gen/
Purpose:
- Generated code artifacts from proto definitions.

### gen/go/flower/v1/service.pb.go
Purpose:
- Generated protobuf message types and descriptors for Go.

### gen/go/flower/v1/service_grpc.pb.go
Purpose:
- Generated gRPC client/server interfaces, method constants, and registration helpers for Go.

Notes:
- Do not edit generated files manually.
- Regenerate through Buf/protoc pipeline when proto changes.

## internal/
Purpose:
- Private application code that should not be imported by external modules.

### internal/api/
Purpose:
- API-layer adapters and handlers.

### internal/api/grpc/errors.go
Purpose:
- Shared helper functions for gRPC errors and deterministic flower_id generation.

### internal/api/grpc/store.go
Purpose:
- Persistence adapter for flowers and mints.

Responsibilities:
- Upsert flower records.
- Fetch flower params by flower_id.
- Upsert mint prepared state.
- Confirm mint with tx hash.
- Map DB errors to gRPC status codes.

### internal/api/grpc/flower_server.go
Purpose:
- FlowerService gRPC handler implementation.

Responsibilities:
- Input validation for all RPCs.
- Flower param generation orchestration.
- DB and S3 workflow coordination.
- Metadata creation and upload integration.
- Mint state transitions.
- gRPC response construction and error mapping.

### internal/db/
Purpose:
- Database connectivity and migration utilities.

### internal/db/db.go
Purpose:
- PostgreSQL connection setup and pool tuning.
- Exposes SQL handle and close lifecycle.

### internal/db/migrate.go
Purpose:
- Migration runner wrapper around Goose.

### internal/flower/
Purpose:
- Domain logic for procedural flower generation.

### internal/flower/generator.go
Purpose:
- Deterministically generates flower parameters from person_name.

Algorithm details:
- Normalizes input name.
- Derives seed from SHA-256.
- Uses SplitMix64 PRNG.
- Produces bounded parameter ranges (petals, dimensions, hue, etc.).

### internal/nft/
Purpose:
- NFT metadata construction.

### internal/nft/metadata.go
Purpose:
- Builds ERC-721 style metadata JSON payload.
- Includes core attributes such as flower_id, seed, algorithm version.

### internal/assets/
Purpose:
- Asset storage abstractions and upload implementation.

### internal/assets/s3uploader.go
Purpose:
- S3-compatible uploader using AWS SDK v2.

Responsibilities:
- Create configured S3 client/uploader.
- Ensure target bucket exists.
- Upload JSON or raw bytes.
- Build public URL from uploaded object key.

## 5) Data Model Summary

flowers table:
- flower_id: deterministic ID used across service and mint flow.
- person_name: original user input.
- seed/algo_version/schema_version: generator identity and reproducibility.
- params (jsonb): full procedural parameter set.

mints table:
- flower_id: one-to-one with flowers.
- wallet_address: intended recipient wallet.
- status: lifecycle state (prepared, confirmed).
- tx_hash: blockchain tx reference after confirmation.
- token_uri/chain_id/contract_address: mint execution context.

## 6) Runtime Configuration Summary

Main environment variables:
- GRPC_ADDR
- DB_DSN
- DB_AUTO_MIGRATE
- S3_ENDPOINT
- S3_REGION
- S3_ACCESS_KEY
- S3_SECRET_KEY
- S3_BUCKET
- S3_PUBLIC_BASE_URL
- S3_FORCE_PATH_STYLE
- CHAIN_ID
- NFT_CONTRACT_ADDRESS

Behavior notes:
- DB-dependent RPCs fail with FailedPrecondition when DB is not configured.
- Asset upload flow fails with FailedPrecondition when S3 is not configured.

## 7) Development Notes

How code is split by concern:
- Contract-first API in proto.
- Generated transport bindings in gen.
- gRPC handlers in internal/api/grpc.
- Pure domain generation in internal/flower.
- Persistence in internal/db and internal/api/grpc/store.
- External storage integration in internal/assets.
- Server composition in cmd/server.

Recommended update workflow:
1. Update proto contract if API shape changes.
2. Regenerate stubs via Buf.
3. Implement/adjust gRPC handler logic.
4. Update migration files if schema changes.
5. Update API.md examples and environment docs.
