# Docker-Only Dev Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Windows-only Taskfile/PowerShell dev workflow with a single root `docker-compose.yml` that starts the entire Petal Pixel stack (Anvil chain → contract deploy → Go backend → Vite frontend, plus local Postgres and MinIO) with one command: `docker compose up`.

**Architecture:** A root Compose file orchestrates 7 services. A one-shot `deploy` service (Foundry image) deploys `FlowerNFT.sol` to the `anvil` service and writes the contract address to a shared volume file `/shared/contract.env`; the Go backend's entrypoint sources that file before starting. Postgres replaces the cloud Supabase DB for the backend-owned tables (`flowers`/`mints`, goose auto-migrated), and MinIO provides S3-compatible metadata storage so the full mint flow works offline. The frontend keeps using cloud Supabase for auth/user-data (URLs injected via env; publishable key supplied by the user after restoring the paused project).

**Tech Stack:** Docker Compose, `ghcr.io/foundry-rs/foundry:stable` (anvil/forge/cast), `golang:1.25-alpine` → `alpine:3.21` multi-stage build, `postgres:16-alpine`, `minio/minio` + `minio/mc`, `node:22-alpine` (Vite 7 requires node ^20.19.0 || >=22.12.0).

## Global Constraints

- Chain id is **1337** everywhere (anvil flag, backend `CHAIN_ID`, frontend `VITE_CHAIN_ID`, broadcast artifact path `broadcast/Deploy.s.sol/1337/run-latest.json`).
- Ports: anvil **8545**, backend **50051**, frontend **8080** (Vite's real port per `vite.config.ts` — NOT the 5173 the old docs claim), MinIO **9000** (API) / **9001** (console).
- URLs resolved by the **browser** must use `localhost` + published ports (`http://localhost:50051`, `http://127.0.0.1:8545`, `http://localhost:9000/flower`); URLs resolved **container-to-container** must use compose service names (`http://anvil:8545`, `http://minio:9000`, `postgres:5432`).
- Deploy private key: Anvil dev account 0 `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` (well-known public dev key — safe to commit, local-only).
- MinIO dev credentials: user `flower`, password `flowersecret` (dev-only, local-only, referenced identically in `minio`, `minio-init`, and `backend` services).
- The backend binary must run with a working directory that contains `db/migrations` (goose reads the relative path `db/migrations`) — the Dockerfile sets `WORKDIR /app` and copies migrations there.
- The Go backend never talks to the chain; it only needs `CHAIN_ID` and `NFT_CONTRACT_ADDRESS` env vars.
- `GRPC_WEB_ALLOWED_ORIGINS` must include `http://localhost:8080` and `http://127.0.0.1:8080`.
- Foundry project root is `flower-backend/` but its libs live at repo-root `lib/` (`libs = ["../lib"]`), so the deploy container must mount BOTH `./flower-backend` and `./lib` preserving the sibling layout.
- Do NOT run `forge install` anywhere (foundry.lock uses a Windows backslash key; the git submodule pin is authoritative).
- The repo path on this machine contains a space (`…/UNREAL ACTIVITY/…`): quote every absolute host path in shell commands. Compose files use only relative paths, which are safe.
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- No real secrets in committed files. `.env` files are gitignored (`**/.env`); only `.env.example` files are committed.

## File Structure

```
docker-compose.yml                      (NEW, repo root — the whole stack)
.env.example                            (NEW, repo root — compose-level vars: Supabase URL + key)
.env                                    (NEW, generated locally, gitignored)
flower-backend/Dockerfile               (NEW — multi-stage Go build)
flower-backend/docker-entrypoint.sh     (NEW — sources /shared/contract.env, execs server)
flower-backend/foundry.toml             (MODIFY — pin solc, add forge-std remapping)
petal-pixel-studio/Dockerfile           (NEW — node 22, npm ci, vite dev server)
petal-pixel-studio/.dockerignore        (NEW)
petal-pixel-studio/vitest.config.ts     (MODIFY — fix broken plugin import)
tools/docker/deploy.sh                  (NEW — forge deploy + address extraction)
README.md                               (MODIFY — Docker quickstart, port fixes)
Taskfile.yml                            (DELETE)
tools/dev/deploy.ps1                    (DELETE)
tools/dev/run-backend.ps1               (DELETE)
tools/dev/stop.ps1                      (DELETE)
flower-backend/docker-compose.yml       (DELETE — empty `services: {}` stub, superseded)
```

---

### Task 1: Backend Dockerfile + entrypoint

**Files:**
- Create: `flower-backend/Dockerfile`
- Create: `flower-backend/docker-entrypoint.sh`

**Interfaces:**
- Consumes: nothing from other tasks. The Go module builds with plain `go build` (generated protobuf code is committed in `gen/`; no buf/protoc needed; pure-Go deps so `CGO_ENABLED=0` static binary works).
- Produces: an image whose entrypoint reads `/shared/contract.env` (single line `NFT_CONTRACT_ADDRESS=0x<40 hex>`, possibly with BOM/CRLF) if present, exports the var, logs it, and `exec`s `/app/server`. Task 3's compose file builds this context and mounts a volume at `/shared`.

**Background you need:** `cmd/server/main.go` listens on `GRPC_ADDR` (default `:50051`), serving native gRPC + gRPC-web + `GET /healthz` + `GET /api/flowers` on that one port. With `DB_AUTO_MIGRATE=true` it runs goose migrations from the **relative path** `db/migrations` — the image must contain that directory inside the WORKDIR. It calls HTTPS S3 endpoints in production, so CA certificates are required in the final image. If `DB_DSN` is empty the server still starts (DB features disabled) — that makes an isolated smoke test possible.

- [ ] **Step 1: Write `flower-backend/docker-entrypoint.sh`**

```sh
#!/bin/sh
set -e

# The deploy service writes NFT_CONTRACT_ADDRESS=0x... to /shared/contract.env.
# Tolerate BOM/CRLF and ignore anything that isn't a well-formed address line.
if [ -f /shared/contract.env ]; then
  addr=$(tr -d '\r' < /shared/contract.env \
    | sed -n 's/.*NFT_CONTRACT_ADDRESS=\(0x[0-9a-fA-F]\{40\}\).*/\1/p' \
    | head -n 1)
  if [ -n "$addr" ]; then
    export NFT_CONTRACT_ADDRESS="$addr"
    echo "docker-entrypoint: using NFT_CONTRACT_ADDRESS=$addr"
  else
    echo "docker-entrypoint: /shared/contract.env present but no valid address found" >&2
  fi
fi

exec /app/server
```

- [ ] **Step 2: Write `flower-backend/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/server ./cmd/server

FROM alpine:3.21
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=build /out/server /app/server
# goose reads the relative path db/migrations at startup (DB_AUTO_MIGRATE=true)
COPY db/migrations /app/db/migrations
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
EXPOSE 50051
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD wget -qO- http://127.0.0.1:50051/healthz || exit 1
ENTRYPOINT ["/app/docker-entrypoint.sh"]
```

- [ ] **Step 3: Build the image**

Run (from repo root):
```bash
docker build -t petal-pixel-backend:smoke "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/flower-backend"
```
Expected: build succeeds, final line `naming to docker.io/library/petal-pixel-backend:smoke`.

- [ ] **Step 4: Smoke-test the container without DB/S3 (both are optional at boot)**

```bash
docker run -d --rm --name ppb-smoke -p 50052:50051 petal-pixel-backend:smoke
sleep 2
curl -sf http://localhost:50052/healthz
docker logs ppb-smoke
docker stop ppb-smoke
```
Expected: `curl` prints `{"status":"ok"}`; logs show a JSON slog line about listening on `:50051`; no crash.

- [ ] **Step 5: Smoke-test the contract.env sourcing path**

```bash
mkdir -p /tmp/ppb-shared
printf 'NFT_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3\r\n' > /tmp/ppb-shared/contract.env
docker run -d --rm --name ppb-smoke2 -v /tmp/ppb-shared:/shared:ro petal-pixel-backend:smoke
sleep 2
docker logs ppb-smoke2 2>&1 | grep "using NFT_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3"
docker stop ppb-smoke2
rm -rf /tmp/ppb-shared
```
Expected: grep matches the entrypoint log line (exit code 0), proving CRLF-tolerant parsing works.

- [ ] **Step 6: Commit**

```bash
git add flower-backend/Dockerfile flower-backend/docker-entrypoint.sh
git commit -m "feat: containerize Go backend (multi-stage Dockerfile + contract.env entrypoint)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Foundry config hardening + containerized deploy script

**Files:**
- Modify: `flower-backend/foundry.toml`
- Create: `tools/docker/deploy.sh`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `tools/docker/deploy.sh` — a POSIX-sh script that Task 3 mounts at `/work/deploy.sh` in a `ghcr.io/foundry-rs/foundry:stable` container (with `./flower-backend` at `/work/flower-backend`, `./lib` at `/work/lib`, and a writable volume at `/shared`). On success it writes exactly one line `NFT_CONTRACT_ADDRESS=0x<40 hex>\n` to `/shared/contract.env` and exits 0.

**Background you need:** `flower-backend/foundry.toml` currently has `src = "contracts"`, `script = "script"`, `out = "out"`, `libs = ["../lib"]`, and one remapping `"@openzeppelin/=../lib/openzeppelin-contracts/"`. `script/Deploy.s.sol` imports `forge-std/Script.sol`, which only exists as a **nested** submodule at `lib/openzeppelin-contracts/lib/forge-std` — an explicit remapping makes resolution deterministic. OZ v5.6.1's ERC721 files are `pragma ^0.8.24`, so solc must be ≥ 0.8.24; pinning avoids a surprise download of a different version on every fresh container. The foundry image's `jq` is NOT installed — extract the address with grep/sed. Forge prints benign warnings to stderr; judge success only by exit code.

- [ ] **Step 1: Edit `flower-backend/foundry.toml`**

Replace the `[profile.default]` section's `remappings` line and add a `solc` pin so the profile reads:

```toml
[profile.default]
src = "contracts"
script = "script"
out = "out"
# OZ v5.6.1 ERC721 requires solc >= 0.8.24; pin for reproducible container builds.
solc = "0.8.28"
# Dependencies are git submodules at the repo root (one level up), because
# `forge install` requires the Git repo root. See root .gitmodules.
libs = ["../lib"]
remappings = [
    "@openzeppelin/=../lib/openzeppelin-contracts/",
    "forge-std/=../lib/openzeppelin-contracts/lib/forge-std/src/",
]
```

Keep any other existing keys/comments in the file that don't conflict.

- [ ] **Step 2: Verify the contracts compile in the foundry container**

Run (from repo root; quote the path — it contains a space):
```bash
docker run --rm \
  -v "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/flower-backend:/work/flower-backend" \
  -v "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/lib:/work/lib" \
  -w /work/flower-backend \
  ghcr.io/foundry-rs/foundry:stable \
  "forge build"
```
Expected: exit 0, output contains `Compiler run successful` (warnings to stderr are fine). First run downloads solc 0.8.28.

- [ ] **Step 3: Write `tools/docker/deploy.sh`**

```sh
#!/bin/sh
# Deploys FlowerNFT to the anvil service and hands the address to the backend
# via /shared/contract.env. Runs inside ghcr.io/foundry-rs/foundry:stable with:
#   /work/flower-backend  -> ./flower-backend (rw: writes out/, cache/, broadcast/)
#   /work/lib             -> ./lib (OpenZeppelin submodule)
#   /shared               -> named volume shared with the backend container
set -eu

RPC_URL="${RPC_URL:-http://anvil:8545}"
# Anvil dev account 0 — well-known local-only key.
PRIVATE_KEY="${DEPLOY_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
CHAIN_ID="${CHAIN_ID:-1337}"

cd /work/flower-backend

if [ ! -f ../lib/openzeppelin-contracts/foundry.toml ]; then
  echo "deploy: lib/openzeppelin-contracts is empty — run 'git submodule update --init --recursive' on the host first" >&2
  exit 1
fi

forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --private-key "$PRIVATE_KEY"

ARTIFACT="broadcast/Deploy.s.sol/${CHAIN_ID}/run-latest.json"
if [ ! -f "$ARTIFACT" ]; then
  echo "deploy: broadcast artifact $ARTIFACT not found" >&2
  exit 1
fi

# No jq in the foundry image: pull the first contractAddress out of the
# artifact (a single-contract deploy has exactly one CREATE transaction).
ADDR=$(tr -d ' \n' < "$ARTIFACT" \
  | grep -o '"contractAddress":"0x[0-9a-fA-F]\{40\}"' \
  | head -n 1 \
  | grep -o '0x[0-9a-fA-F]\{40\}')

if [ -z "$ADDR" ]; then
  echo "deploy: could not extract contract address from $ARTIFACT" >&2
  exit 1
fi

printf 'NFT_CONTRACT_ADDRESS=%s\n' "$ADDR" > /shared/contract.env
echo "deploy: NFT_CONTRACT_ADDRESS=$ADDR written to /shared/contract.env"
```

- [ ] **Step 4: Make it executable and sanity-check the extraction logic locally**

```bash
chmod +x "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/tools/docker/deploy.sh"
printf '{"transactions":[{"transactionType":"CREATE","contractName":"FlowerNFT","contractAddress":"0x5fbdb2315678afecb367f032d93f642f64180aa3"}]}' > /tmp/run-latest-test.json
tr -d ' \n' < /tmp/run-latest-test.json | grep -o '"contractAddress":"0x[0-9a-fA-F]\{40\}"' | head -n 1 | grep -o '0x[0-9a-fA-F]\{40\}'
rm /tmp/run-latest-test.json
```
Expected: prints `0x5fbdb2315678afecb367f032d93f642f64180aa3`.

(Full end-to-end deploy against a live anvil is exercised in Task 3's compose verification — do not build a bespoke docker network here.)

- [ ] **Step 5: Commit**

```bash
git add flower-backend/foundry.toml tools/docker/deploy.sh
git commit -m "feat: pin solc + forge-std remapping; add containerized deploy script

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Root docker-compose.yml + frontend image + env wiring

**Files:**
- Create: `docker-compose.yml` (repo root)
- Create: `.env.example` (repo root)
- Create: `.env` (repo root — NOT committed; gitignored by `**/.env`)
- Create: `petal-pixel-studio/Dockerfile`
- Create: `petal-pixel-studio/.dockerignore`

**Interfaces:**
- Consumes: `flower-backend/Dockerfile` + entrypoint (Task 1, reads `/shared/contract.env`); `tools/docker/deploy.sh` (Task 2, writes `/shared/contract.env`, expects mounts at `/work/flower-backend`, `/work/lib`, `/shared`).
- Produces: the complete dev stack. `docker compose up` → frontend on http://localhost:8080, backend on :50051, anvil on :8545, MinIO on :9000/:9001.

**Background you need:** The browser (not the frontend container) talks to the backend, MetaMask, and MinIO — so those env vars must point at `localhost` published ports. Vite exposes any `VITE_`-prefixed process env var to `import.meta.env`, and process env beats `.env` files, so compose `environment:` entries work. The Supabase project (`dozlnqogfzlufpkmkwxn`) is currently PAUSED; its URL is known but the publishable key must be filled in by the user after restoring it — a placeholder keeps the SPA from white-screening (the supabase client throws at module load only if the vars are missing/empty). The backend fail-fasts if DB or S3 are configured but unreachable, hence the healthcheck/one-shot gating below. MinIO's bucket must exist and allow anonymous download before the backend boots (backend HeadBuckets at startup; browsers fetch the public token_uri).

- [ ] **Step 1: Write `petal-pixel-studio/.dockerignore`**

```
node_modules
dist
dist-ssr
coverage
playwright-report
test-results
.env
.env.*
!.env.example
.git
```

- [ ] **Step 2: Write `petal-pixel-studio/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
# Dev-server image: vite 7 needs node ^20.19.0 || >=22.12.0
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
EXPOSE 8080
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "8080", "--strictPort"]
```

- [ ] **Step 3: Write root `docker-compose.yml`**

```yaml
name: petal-pixel

volumes:
  pgdata:
  minio-data:
  contract-data:

services:
  anvil:
    image: ghcr.io/foundry-rs/foundry:stable
    entrypoint: ["/bin/sh", "-c"]
    command: ["anvil --chain-id 1337 --host 0.0.0.0"]
    ports:
      - "8545:8545"
    healthcheck:
      test: ["CMD", "cast", "block-number", "--rpc-url", "http://127.0.0.1:8545"]
      interval: 2s
      timeout: 5s
      retries: 30

  deploy:
    image: ghcr.io/foundry-rs/foundry:stable
    entrypoint: ["/bin/sh", "/work/deploy.sh"]
    working_dir: /work/flower-backend
    environment:
      RPC_URL: http://anvil:8545
      CHAIN_ID: "1337"
    volumes:
      - ./flower-backend:/work/flower-backend
      - ./lib:/work/lib
      - ./tools/docker/deploy.sh:/work/deploy.sh:ro
      - contract-data:/shared
    depends_on:
      anvil:
        condition: service_healthy
    restart: "no"

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: flower
      POSTGRES_PASSWORD: flower
      POSTGRES_DB: flower
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U flower -d flower"]
      interval: 2s
      timeout: 5s
      retries: 30

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: flower
      MINIO_ROOT_PASSWORD: flowersecret
    ports:
      - "9000:9000"   # S3 API — must be host-published: browsers fetch token URIs from it
      - "9001:9001"   # web console (user: flower / flowersecret)
    volumes:
      - minio-data:/data

  minio-init:
    image: minio/mc:latest
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
        until mc alias set local http://minio:9000 flower flowersecret 2>/dev/null; do
          echo "minio-init: waiting for minio..."; sleep 1;
        done
        mc mb -p local/flower
        mc anonymous set download local/flower
        echo "minio-init: bucket 'flower' ready (anonymous download enabled)"
    depends_on:
      minio:
        condition: service_started
    restart: "no"

  backend:
    build: ./flower-backend
    ports:
      - "50051:50051"
    environment:
      GRPC_ADDR: ":50051"
      DB_DSN: postgresql://flower:flower@postgres:5432/flower?sslmode=disable
      DB_AUTO_MIGRATE: "true"
      CHAIN_ID: "1337"
      GRPC_WEB_ALLOWED_ORIGINS: http://localhost:8080,http://127.0.0.1:8080
      S3_ENDPOINT: http://minio:9000
      S3_REGION: us-east-1
      S3_ACCESS_KEY: flower
      S3_SECRET_KEY: flowersecret
      S3_BUCKET: flower
      # Browser-facing URL for token URIs — must be the host-published MinIO port.
      S3_PUBLIC_BASE_URL: http://localhost:9000/flower
      S3_FORCE_PATH_STYLE: "true"
    volumes:
      - contract-data:/shared:ro
    depends_on:
      postgres:
        condition: service_healthy
      minio-init:
        condition: service_completed_successfully
      deploy:
        condition: service_completed_successfully
    restart: unless-stopped

  frontend:
    build: ./petal-pixel-studio
    ports:
      - "8080:8080"
    environment:
      # Browser-resolved URLs -> localhost + published ports.
      VITE_FLOWER_BACKEND_URL: http://localhost:50051
      VITE_CHAIN_ID: "1337"
      VITE_RPC_URL: http://127.0.0.1:8545
      VITE_SUPABASE_URL: ${VITE_SUPABASE_URL:-https://dozlnqogfzlufpkmkwxn.supabase.co}
      VITE_SUPABASE_PUBLISHABLE_KEY: ${VITE_SUPABASE_PUBLISHABLE_KEY:-sb_publishable_placeholder_restore_supabase_project_first}
    volumes:
      - ./petal-pixel-studio:/app
      - /app/node_modules
    depends_on:
      backend:
        condition: service_started
    restart: unless-stopped
```

- [ ] **Step 4: Write root `.env.example`**

```
# Compose-level variables (docker compose reads this file's sibling `.env`).
# Frontend auth/user-data still lives in cloud Supabase project dozlnqogfzlufpkmkwxn.
# That project is currently PAUSED — restore it in the Supabase dashboard, then paste
# the publishable (anon) key from Project Settings -> API Keys.
VITE_SUPABASE_URL=https://dozlnqogfzlufpkmkwxn.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_or_legacy_anon_key_here
```

- [ ] **Step 5: Create local `.env` (gitignored) with the same content as `.env.example`**

```bash
cp "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/.env.example" "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/.env"
git status --short
```
Expected: `.env` does NOT appear in git status (gitignored).

- [ ] **Step 6: Bring the stack up and verify every service**

```bash
cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel"
docker compose up -d --build
docker compose ps -a
```
Expected states: `anvil` running (healthy), `postgres` running (healthy), `minio` running, `minio-init` Exited (0), `deploy` Exited (0), `backend` running (healthy after ~15s), `frontend` running.

```bash
docker compose logs deploy | grep 'NFT_CONTRACT_ADDRESS='
```
Expected: `deploy: NFT_CONTRACT_ADDRESS=0x... written to /shared/contract.env`.

```bash
docker compose logs backend | grep 'using NFT_CONTRACT_ADDRESS='
curl -sf http://localhost:50051/healthz
curl -sf http://localhost:50051/api/flowers
curl -sf -o /dev/null -w '%{http_code}\n' http://localhost:8080
```
Expected: entrypoint log line with the same address the deploy logged; `{"status":"ok"}`; `[]` or `{"flowers":[]}` (HTTP 200 — proves Postgres migrated); `200` from the frontend.

- [ ] **Step 7: Verify a restart keeps working (idempotence)**

```bash
docker compose down
docker compose up -d
sleep 20
curl -sf http://localhost:50051/healthz && curl -sf -o /dev/null -w '%{http_code}\n' http://localhost:8080
```
Expected: `{"status":"ok"}` and `200` again (deploy re-runs against the fresh anvil; same deterministic address).

- [ ] **Step 8: Commit (leave the stack running)**

```bash
git add docker-compose.yml .env.example petal-pixel-studio/Dockerfile petal-pixel-studio/.dockerignore
git commit -m "feat: one-command Docker Compose dev stack (anvil, deploy, postgres, minio, backend, frontend)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Fix broken vitest config

**Files:**
- Modify: `petal-pixel-studio/vitest.config.ts`

**Interfaces:**
- Consumes / Produces: nothing shared — standalone fix.

**Background you need:** `npm run test` currently fails at config load with `ERR_MODULE_NOT_FOUND`: `vitest.config.ts` imports `@vitejs/plugin-react-swc`, but only `@vitejs/plugin-react` is in `package.json`/lockfile (vite.config.ts already uses the right one). Dependencies are already installed on the host (`npm ci` was run).

- [ ] **Step 1: Reproduce the failure**

```bash
cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio"
npm run test
```
Expected: FAILS with `Cannot find package '@vitejs/plugin-react-swc'` (ERR_MODULE_NOT_FOUND).

- [ ] **Step 2: Fix the import in `vitest.config.ts`**

Change:
```ts
import react from "@vitejs/plugin-react-swc";
```
to:
```ts
import react from "@vitejs/plugin-react";
```
(Only the import line changes; the `react()` plugin call stays as-is.)

- [ ] **Step 3: Verify tests pass**

```bash
npm run test
```
Expected: PASS — 1 test file (`src/test/example.test.ts`), 0 failures, exit 0.

- [ ] **Step 4: Commit**

```bash
git add petal-pixel-studio/vitest.config.ts
git commit -m "fix: vitest config imported @vitejs/plugin-react-swc which is not installed

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Remove Windows tooling + rewrite run docs

**Files:**
- Delete: `Taskfile.yml`, `tools/dev/deploy.ps1`, `tools/dev/run-backend.ps1`, `tools/dev/stop.ps1`, `flower-backend/docker-compose.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: the compose stack from Task 3 (documented commands must match its service names and ports exactly).
- Produces: nothing downstream — final cleanup task.

**Background you need:** The old workflow (`task dev` → PowerShell windows) is Windows-only and now fully replaced. The README has several confirmed inaccuracies to fix while rewriting: (a) it claims the frontend runs on **5173** but `vite.config.ts` sets **8080**; (b) it documents `task stop`, which never existed in the Taskfile; (c) it claims the Go backend sends the mint transaction over JSON-RPC — in reality the backend never talks to the chain; the **browser** (MetaMask + ethers) sends the mint tx, and the backend only prepares metadata (S3 upload) and records confirmations; (d) it says CHAIN_ID 1337 "matches the Anvil default" — Anvil's default is 31337; 1337 is set explicitly. Do not rewrite unrelated sections (What is Petal Pixel, Screenshots, project structure, Supabase schema docs) beyond what these fixes require.

- [ ] **Step 1: Delete the Windows tooling**

```bash
cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel"
git rm Taskfile.yml tools/dev/deploy.ps1 tools/dev/run-backend.ps1 tools/dev/stop.ps1 flower-backend/docker-compose.yml
```
Expected: 5 files staged for deletion; `tools/` now contains only `tools/docker/`.

- [ ] **Step 2: Rewrite the README quickstart/run sections**

Replace the Windows quickstart / prerequisites / run-instructions sections with the following (adapt surrounding headings to the existing document structure; keep the intro, screenshots, architecture-diagram section, and Supabase schema sections in place):

```markdown
## Quickstart (Docker — any OS)

Prerequisites: [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Compose v2+) and git.

```bash
git clone <repo-url>
cd petal-pixel
git submodule update --init --recursive   # OpenZeppelin contracts (required by the deploy step)
cp .env.example .env                      # then paste your Supabase publishable key (see below)
docker compose up -d --build
```

That single command starts everything:

| Service    | URL                          | What it is                                        |
|------------|------------------------------|---------------------------------------------------|
| frontend   | http://localhost:8080        | Vite dev server (hot reload via bind mount)       |
| backend    | http://localhost:50051       | Go gRPC / gRPC-web API (`/healthz`, `/api/flowers`) |
| anvil      | http://127.0.0.1:8545        | Local Ethereum node, chain id **1337**            |
| deploy     | (one-shot)                   | Deploys `FlowerNFT.sol`, hands the address to the backend |
| postgres   | (internal)                   | Backend DB (`flowers`, `mints`) — goose migrations run automatically |
| minio      | http://localhost:9000 (console :9001) | S3-compatible storage for NFT metadata (bucket `flower`) |

Stop everything with `docker compose down` (add `-v` to also wipe DB/MinIO data and force a fresh chain + redeploy).

### Supabase (auth + cross-device sync)

Login/signup and the "My Flowers" cloud sync use the hosted Supabase project.
Set it up once:

1. Restore the Supabase project (free-tier projects pause when idle) in the [dashboard](https://supabase.com/dashboard).
2. Copy the publishable (anon) key from **Project Settings → API Keys** into `.env` (`VITE_SUPABASE_PUBLISHABLE_KEY`).
3. `docker compose up -d frontend` to restart the frontend with the new key.

Without a live Supabase project the app still runs, but login is unavailable, so flowers only persist in the browser's localStorage.

### Minting

Minting happens **in your browser**: MetaMask signs the transaction and sends it
to Anvil directly. Add the local network to MetaMask when prompted (chain id 1337,
RPC http://127.0.0.1:8545) and import an Anvil dev account to have funds. The Go
backend only prepares the NFT metadata (uploaded to MinIO) and records mint
confirmations — it never talks to the chain itself.
```

Also apply these targeted fixes anywhere else they appear in `README.md`:
- Every mention of port `5173` for the frontend → `8080` (including the architecture mermaid diagram label `React / Vite\n(port 5173)` → `React / Vite\n(port 8080)`).
- Remove or replace mentions of `task dev` / `task stop` / `Taskfile` / PowerShell scripts with the compose equivalents (`docker compose up -d --build`, `docker compose down`).
- The data-flow description that says the Go server calls `mint()` via JSON-RPC → correct it to: the browser (ethers + MetaMask) sends `mint()`; the backend's `PrepareMint` uploads metadata and returns `contract_address`/`token_uri`; `ConfirmMint` records the tx hash.
- `1337 (matches Anvil default...)` → `1337 (set explicitly via anvil --chain-id 1337; Anvil's own default would be 31337)`.
- The claim that `flower-backend/docker-compose.yml` is intentionally empty → remove (file is deleted; the root `docker-compose.yml` is the single compose file now).

- [ ] **Step 3: Verify no stale references remain**

```bash
cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel"
grep -rn "task dev\|task stop\|Taskfile\|deploy.ps1\|run-backend.ps1\|stop.ps1\|5173" README.md || echo "CLEAN"
```
Expected: `CLEAN` (or only intentional historical mentions — there should be none).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: replace Windows Taskfile workflow with Docker Compose; fix stale run docs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
