# API Endpoints (gRPC)

This backend currently exposes a **gRPC-only API** (no HTTP/REST routes).

It also accepts **gRPC-web** requests on the same port, so browser clients can call unary RPC methods directly.

## Server

- **Address**: `GRPC_ADDR` (default `:50051`)
- **Reflection**: enabled (usable with `grpcurl` without local protos)
- **Health**: `grpc.health.v1.Health`
- **gRPC-web**: enabled on the same address

## Proto

- **Package**: `flower.v1`
- **Service**: `flower.v1.FlowerService`
- **Proto file**: `proto/flower/v1/service.proto`

## Endpoints (RPC)

All RPCs are **unary**.

### `CreateFlower`

- **Full method**: `/flower.v1.FlowerService/CreateFlower`
- **Request**: `CreateFlowerRequest`
  - `person_name` (string, required)
- **Response**: `CreateFlowerResponse`
  - `flower_id` (string)
  - `params` (`FlowerParams`)
- **Notes**:
  - `flower_id` is derived deterministically from `person_name`.
  - If `DB_DSN` is configured, the flower is also persisted/updated.
- **Errors**:
  - `INVALID_ARGUMENT`: `person_name` is empty/blank.

### `GetFlower`

- **Full method**: `/flower.v1.FlowerService/GetFlower`
- **Request**: `GetFlowerRequest`
  - `flower_id` (string, required)
- **Response**: `GetFlowerResponse`
  - `flower_id` (string)
  - `params` (`FlowerParams`)
- **Prerequisites**:
  - Database must be configured (`DB_DSN`), otherwise the server returns an error.
- **Errors**:
  - `FAILED_PRECONDITION`: database is not configured.
  - `INVALID_ARGUMENT`: `flower_id` is empty/blank.

### `PrepareMint`

- **Full method**: `/flower.v1.FlowerService/PrepareMint`
- **Request**: `PrepareMintRequest`
  - `flower_id` (string, required)
  - `wallet_address` (string, required)
- **Response**: `PrepareMintResponse`
  - `flower_id` (string)
  - `chain_id` (uint64)
  - `contract_address` (string)
  - `token_uri` (string)
  - `mint_to` (string)
  - `mint_token_uri` (string)
  - `mint_calldata` (bytes, currently empty)
- **Prerequisites**:
  - Database must be configured (`DB_DSN`)
  - Asset storage must be configured:
    - `S3_ENDPOINT`
    - `S3_PUBLIC_BASE_URL`
    - and credentials/bucket env vars (see below)
- **Behavior**:
  - Loads flower params from DB by `flower_id`
  - Builds ERC-721 style metadata JSON
  - Uploads it to the configured S3-compatible storage under `metadata/<flower_id>.json`
  - Returns a `token_uri` pointing to that uploaded metadata
- **Errors**:
  - `FAILED_PRECONDITION`: database and/or asset storage is not configured.
  - `INVALID_ARGUMENT`: `flower_id` or `wallet_address` is empty/blank.
  - `INTERNAL`: metadata build/upload fails.

### `ConfirmMint`

- **Full method**: `/flower.v1.FlowerService/ConfirmMint`
- **Request**: `ConfirmMintRequest`
  - `flower_id` (string, required)
  - `tx_hash` (string, required)
- **Response**: `ConfirmMintResponse`
  - `flower_id` (string)
  - `tx_hash` (string)
- **Prerequisites**:
  - Database must be configured (`DB_DSN`)
- **Errors**:
  - `FAILED_PRECONDITION`: database is not configured.
  - `INVALID_ARGUMENT`: `flower_id` or `tx_hash` is empty/blank.

## Types

### `FlowerParams`

- `algo_version` (string)
- `schema_version` (string)
- `seed` (uint64)
- `petal_count` (uint32)
- `petal_length` (float)
- `petal_width` (float)
- `curvature` (float)
- `stem_height` (float)
- `hue` (float)

## Healthcheck

The server registers the standard gRPC health service:

- **Service**: `grpc.health.v1.Health`
- **Method**: `Check`

Additionally, for simple browser checks, the server exposes:

- **HTTP** `GET /healthz` → `{"status":"ok"}`

## Examples (grpcurl)

Assuming the server is running on `localhost:50051`.

List services (via reflection):

```bash
grpcurl -plaintext localhost:50051 list
```

Create a flower:

```bash
grpcurl -plaintext \
  -d '{"person_name":"Alice"}' \
  localhost:50051 flower.v1.FlowerService/CreateFlower
```

Get a flower (requires DB):

```bash
grpcurl -plaintext \
  -d '{"flower_id":"<FLOWER_ID>"}' \
  localhost:50051 flower.v1.FlowerService/GetFlower
```

Prepare mint (requires DB + S3-compatible storage):

```bash
grpcurl -plaintext \
  -d '{"flower_id":"<FLOWER_ID>","wallet_address":"0xabc..."}' \
  localhost:50051 flower.v1.FlowerService/PrepareMint
```

Confirm mint (requires DB):

```bash
grpcurl -plaintext \
  -d '{"flower_id":"<FLOWER_ID>","tx_hash":"0xdeadbeef..."}' \
  localhost:50051 flower.v1.FlowerService/ConfirmMint
```

## Configuration (env vars)

- **gRPC**
  - `GRPC_ADDR` (default `:50051`)
  - `GRPC_WEB_ALLOWED_ORIGINS` (optional CSV list of allowed browser origins; if unset all origins are allowed)
- **Database**
  - `DB_DSN` (Postgres DSN)
  - `DB_AUTO_MIGRATE` (`true`/`false`)
- **S3 / MinIO**
  - `S3_ENDPOINT`
  - `S3_REGION` (default `us-east-1`)
  - `S3_ACCESS_KEY`
  - `S3_SECRET_KEY`
  - `S3_BUCKET` (default `flower`)
  - `S3_PUBLIC_BASE_URL`
  - `S3_FORCE_PATH_STYLE` (default `true`, set to `false` to disable)
- **Chain**
  - `CHAIN_ID` (default `11155111` / Sepolia)
  - `NFT_CONTRACT_ADDRESS`

