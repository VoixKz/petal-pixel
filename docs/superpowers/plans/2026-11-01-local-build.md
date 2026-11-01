# Petal Pixel Local Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the demo into a trustworthy app that runs fully in Docker: nobody can corrupt a mint, private calls need a login, and the contract only accepts mints the backend signed.

**Architecture:** Keep the current Go monolith, Postgres, Anvil and React app, move storage to a local S3 server, and add Keycloak for sign-in. Three seams let AWS replace parts later without touching callers: `auth.Verifier`, `voucher.Signer`, and the `nftFiles` storage interface.

**Tech Stack:** Go 1.25 with grpc-go, pgx, goose and go-oidc; Solidity 0.8.28 with Foundry and OpenZeppelin v5; React 18 with ethers v6 and oidc-client-ts; Keycloak 26; Docker Compose.

**Spec:** `docs/PRODUCTION_PLAN.md`, sections 4.3 to 4.6 and 6. Stages 0 and 2, AWS and card payments are out of scope here.

## Global Constraints

- Everything runs through Docker. Go tests: `docker compose run --rm backend-test`. Go and Foundry are not on the host.
- One `flower_id` is one NFT. This is a working assumption, not a confirmed product decision.
- Chain is Anvil, chain id 1337. No card payments, no cloud services, no monthly cost.
- Anvil account 0 deploys and owns the contract. Anvil account 1 signs vouchers. Both keys are public and may only ever sign on the local chain.
- UI work follows the root `CLAUDE.md`.
- No commit, push or merge until the user asks. Work stays on `feat/local-data-integrity`.

## Review Focus

- A chain reset while Postgres keeps its rows: `anvil` has no `--state`, so a restart makes flowers read as minted on an empty chain. Task 6 persists chain state.
- Two wallets prepare the same flower before either confirms: only one mint can land, and the loser sees a clear error. Tasks 4 and 6.
- A voucher expires while the wallet popup is open: the transaction reverts and the UI says to try again. Tasks 4 and 5.
- The wallet is on the wrong network: the UI asks to switch instead of sending the transaction. Task 5.
- A forged or failed `tx_hash` reaches `ConfirmMint`: the row stays unconfirmed. Task 6.

---

### Task 1: Stop overwrites in the store (done)

**Files:** `flower-backend/internal/api/grpc/store.go`, `flower-backend/internal/api/grpc/store_integration_test.go`, `docker-compose.yml`

- [x] Real Postgres harness: `newTestStore(t)` with a private schema per test
- [x] `UpsertMintPrepared` returns `AlreadyExists` for a confirmed mint
- [x] `ConfirmMint` keeps the first hash and repeats safely with the same hash
- [x] `UpsertFlower` keeps the first row
- [x] `backend-test` Compose service

### Task 2: Refuse minted flowers before touching storage

`PrepareMint` uploads to the stable keys `images/<id>.png` and `metadata/<id>.json` before the database guard runs, so a second buyer still replaces the files of a minted flower.

**Files:**
- Modify: `flower-backend/internal/api/grpc/flower_server.go`, `flower-backend/internal/api/grpc/store.go`
- Create: `flower-backend/internal/api/grpc/prepare_mint_integration_test.go`
- Modify: `petal-pixel-studio/src/pages/CreateFlower.tsx`

**Interfaces:**
- Produces: `func (s *Store) IsMinted(ctx context.Context, flowerID string) (bool, error)`
- Produces: `type nftFiles interface` with `PutBytes`, `PutJSON`, `Exists`, `PublicURL`, matching `*assets.S3Uploader`. `FlowerServer.upl` becomes this type.

- [x] Write `TestPrepareMintRefusesMintedFlowerBeforeUpload`: confirmed mint, fake `nftFiles`, expect `AlreadyExists` and zero uploads
- [x] Run it: failed with 2 uploads
- [x] Add `IsMinted` and call it right after `GetFlower`; the store guard stays as the race backstop
- [x] Run `docker compose run --rm backend-test`: passed
- [x] Show "This flower is already minted" when the mint call fails with `AlreadyExists`, then run the frontend tests

### Task 3: Own accounts and require a login (done)

The Supabase project no longer resolved, so the user chose to move accounts into this stack: Keycloak in Docker for OIDC with PKCE, `users` and `saved_flowers` in Postgres.

**Files:** `flower-backend/internal/auth/`, `flower-backend/internal/ratelimit/`, `flower-backend/internal/api/grpc/garden_*.go`, `flower-backend/db/migrations/00003_accounts.sql`, `tools/keycloak/petal-pixel-realm.json`, `petal-pixel-studio/src/integrations/auth/`, `petal-pixel-studio/src/integrations/garden/`, `petal-pixel-studio/src/contexts/AuthContext.tsx`

- [x] `auth.Verifier` checks issuer, audience, expiry and signature against a real JWKS
- [x] `FlowerService` methods are private unless listed open, and fail closed without a verifier
- [x] Garden and profile RPCs are scoped to the token's user, with isolation tests
- [x] Mint state in the garden comes from the `mints` table, so clients cannot claim it
- [x] `GET /api/flowers` removed; preview uploads need a token and a saved flower
- [x] Per-IP rate limits on `CreateFlower` and preview uploads
- [x] Frontend signs in with `oidc-client-ts`; Supabase code and package removed

### Task 4: Contract v2 with signed vouchers

**Files:**
- Modify: `flower-backend/contracts/FlowerNFT.sol`, `flower-backend/script/Deploy.s.sol`, `tools/docker/deploy.sh`, `docker-compose.yml`
- Create: `flower-backend/test/FlowerNFT.t.sol`

**Interfaces:**
- Produces: `struct Voucher { bytes32 flowerId; address to; string tokenURI; uint256 price; uint256 deadline; }`
- Produces: `function mint(Voucher calldata v, bytes calldata signature) external payable returns (uint256)`
- Produces: `event Minted(bytes32 indexed flowerId, address indexed to, uint256 indexed tokenId)`, `constructor(address initialOwner, address voucherSigner)`

- [x] Add a `contract-test` Compose service running `forge test`
- [x] Write tests: valid voucher mints; wrong signer, changed field, expired deadline, underpaid price, and second mint of a flower all revert; the voucher binds chain id and contract address through the EIP-712 domain; fuzz the deadline and price
- [x] Run them: failed to compile, the old contract has no `Voucher`
- [x] Implement with OpenZeppelin `EIP712` and `ECDSA`; add owner-only `withdraw` and `setVoucherSigner`
- [x] Run them: 22 passed

### Task 5: Sign vouchers in Go and mint with them

**Files:**
- Create: `flower-backend/internal/voucher/voucher.go`, `flower-backend/internal/voucher/voucher_test.go`
- Modify: `flower-backend/proto/`, `flower-backend/internal/api/grpc/flower_server.go`, `petal-pixel-studio/src/pages/CreateFlower.tsx`

**Interfaces:**
- Consumes: `Voucher` and the EIP-712 domain from Task 4
- Produces: `type Signer interface { Sign(ctx context.Context, v Voucher) ([]byte, error) }` with `NewLocalSigner(hexKey string)`

- [x] Test the digest and signature against a fixed vector produced by `forge` in Task 4, so Go and Solidity cannot drift
- [x] Implement the signer; `PrepareMint` returns the voucher fields and signature; regenerate stubs with `docker compose run --rm codegen`
- [x] Frontend calls `mint(voucher, signature)` with `value: price`, checks the wallet chain id first, and reports a revert for expired or already-minted vouchers
- [x] Run Go, Foundry and frontend tests, then mint on Anvil with `tools/docker/smoke-mint.sh`. The browser path is covered by `tests/mint.spec.ts`.

### Task 6: The chain decides who owns it

**Files:**
- Create: `flower-backend/db/migrations/00002_mint_owner.sql`, `flower-backend/internal/chain/receipt.go`, `flower-backend/internal/chain/receipt_test.go`
- Modify: `flower-backend/internal/api/grpc/store.go`, `flower-backend/internal/api/grpc/flower_server.go`, `docker-compose.yml`

**Interfaces:**
- Produces: `func VerifyMint(ctx context.Context, txHash string, want MintRef) (tokenID string, owner string, err error)`

- [x] Unit tests cover a failed transaction, wrong contract, wrong flower and an unknown hash. `tools/docker/smoke-mint.sh` repeats the hash cases on a live Anvil with a real unrelated transaction and a real mint.
- [x] `ConfirmMint` reads the receipt and `Minted` log over RPC, then stores `token_id` and `owner_address`
- [x] Run Anvil with `--state` on a named volume, and make `deploy` keep an existing contract, so a confirmed mint survives a restart

### Task 7: NFT files never change

**Files:** `flower-backend/internal/assets/s3uploader.go`, `flower-backend/internal/api/grpc/flower_server.go`, `flower-backend/cmd/server/main.go`

- [x] Test: keys are `nft/<sha256>.png` and `nft/<sha256>.json`, and a second write of an existing key does not replace it
- [x] Upload with `If-None-Match: *`, and treat "already exists" with the same hash as success
- [x] Move the replaceable share picture to `previews/<id>.png`

### Task 8: End-to-end and CI

**Files:** `petal-pixel-studio/tests/mint.spec.ts`, `.github/workflows/ci.yml`

- [x] Playwright with a test wallet on Anvil: name to flower to mint to collection, plus a second buyer being refused
- [x] Fix the 20 existing type errors. Plain `tsc --noEmit` checks nothing here because the root config only has references, so `npm run typecheck` uses `tsconfig.app.json`.
- [x] CI runs Go tests with Postgres, `forge test`, Vitest and that type check on every PR. The workflow file stays local until the user asks to push it.
- [x] Replace MinIO, whose images can no longer be pulled, with `versitygw`. `s3_integration_test.go` pins what the storage must do: write-once uploads, public reads, no anonymous writes or listing.
- [x] Run e2e and `tools/docker/smoke-mint.sh` in CI.
