# Studio+ Improvements Implementation Plan (NFT image, section packs, Activity)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** NFT minted flowers show a real picture in the wallet (snapshot → MinIO → metadata image + real person name + Token ID UX), plus approved section packs: Studio (Surprise me, family/palette badges, Download PNG), My Flowers (search/filter/sort/inline rename/palette previews), Dashboard widgets, NFT Collection details + MetaMask import helper, and Payments → Activity.

**Tech Stack:** as Phase 2 (React18+Vite+TS+Zustand+R3F+ethers v6; Go/ConnectRPC; Dockerized buf codegen `bufbuild/buf:1.47.2`; Go tests via `golang:1.25-alpine`; vitest, no user-event).

## Global Constraints

- Branch `feat/richer-flower-generation`; commit per task; end messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Line numbers are approximate anchors — match quoted code text; RE-READ files between tasks (a lifecycle-fix batch landed in CreateFlower.tsx/flowerStore.ts after these drafts were written; in particular `saveFlower` now returns `'created' | 'updated' | 'aborted'` and CreateFlower imports `hasUnsavedWork` from createFlowerGuards).
- No DB migration; mint fields live INSIDE params jsonb. Determinism and v1 back-compat preserved.
- Frontend tests: `cd petal-pixel-studio && npx vitest run <file>`; full suite + `npx tsc --noEmit` before each commit. Go via Docker.

## Binding consistency resolutions (govern over the task texts below)

1. **mint-flow** — Duplicate ownership of prepareMintViaGrpc: proto-image Step 3g and mint-flow Step 3b both rewrite the same function in petal-pixel-studio/src/integrations/flowerBackend/client.ts with identical code, and both list it under Produces and stage client.ts in their commits. Executed in order, mint-flow's instruction to 'replace the existing prepareMintViaGrpc' targets the 2-arg version that no longer exists after proto-image lands, so an exact-match edit fails (or the executor commits a no-op file). **Fix:** Make proto-image the sole owner (it also regenerates the stub that provides the imagePng field the function needs). In mint-flow: delete Step 3b, move prepareMintViaGrpc(flowerId, walletAddress, imagePng?) from Produces to Consumes, remove client.ts from its Files list and from the Step 5 git add.
2. **nft-pack** — Dual/conditional ownership of FlowerParams.mintTokenId/mintContractAddress: mint-flow adds them unconditionally after superformulaParams (flowerStore.ts:56 — verified insertion point exists), while nft-pack Step 3b adds the same fields 'only if the mint task hasn't landed yet'. Field names, types, and location match, but if nft-pack ran first, mint-flow (which has no such guard) would insert duplicate fields and fail to compile. **Fix:** Make mint-flow the sole owner of the FlowerParams fields. In nft-pack: delete Step 3b entirely, remove flowerStore.ts from Files and from the Step 5 git add, and add an explicit 'Depends on: mint-flow' header. Enforce mint-flow before nft-pack in the execution order.
3. **studio-pack** — The palette-stops-to-CSS-gradient helper is implemented FIVE times with semantic drift: studio-pack stopsToGradient (90deg, #808080/flat-hex degenerate fallbacks, no colorA/colorB fallback), myflowers previewGradient (90deg, fallback 'colorA 0%, colorB 100%'), dashboard flowerGradient (135deg, fallback 'colorA, colorB' with no percents), nft-pack inline paletteGradient (90deg, 'colorA, colorB'), activity-page inline (see separate issue). Same data, four different output formats. **Fix:** Name studio-pack the owner of ONE shared helper. Move it from src/components/flower/badgeGradient.ts to a neutral src/lib/paletteGradient.ts (with the tests) exporting stopsToGradient(stops: PaletteStop[], angle = 90) and paramsGradient(params: FlowerParams, angle = 90) that falls back to colorA→colorB; pick one fallback string format (recommend explicit '0%'/'100%'). myflowers-pack, dashboard-pack (pass angle 135), nft-pack, and activity-page then import from it instead of defining their own, and their test files (myFlowersUtils.test.ts previewGradient cases, dashboardStats.test.ts flowerGradient cases) must be updated to import/assert the shared helper's unified output strings.
4. **activity-page** — The inline palette dot gradient in Activity.tsx drops stop positions entirely: `linear-gradient(90deg, ${event.palette.stops.map((s) => s.hex).join(', ')})` renders evenly-spaced colors, while every other task renders `${s.hex} ${Math.round(s.pos * 100)}%`. The same palette will look different on the Activity page than on My Flowers/Dashboard/NFT cards. **Fix:** Replace the inline expression with the shared stopsToGradient(event.palette.stops) from the studio-pack-owned helper (src/lib/paletteGradient.ts), which preserves stop positions. Order activity-page after studio-pack.
5. **studio-pack** — CreateFlower.tsx lucide import collision: snapshot Step 3c and studio-pack Edit 1 both quote the identical pristine line 8 (`import { Sparkles, Save, Gem, ... Wallet } from 'lucide-react';` — verified current) as their exact before/after text. Snapshot adds Download; studio-pack adds Dices. Whichever task runs second finds a line that no longer matches its quoted before-text and the exact-match edit fails. (mint-flow also edits CreateFlower.tsx, making it a 3-task file.) **Fix:** Rephrase both tasks' import edits as anchor-free instructions ('append `Download` / `Dices` to the existing lucide-react import in CreateFlower.tsx') instead of full-line before/after quotes; alternatively, given the recommended order (snapshot before studio-pack), update studio-pack's quoted before-line to include Download. Also add a note that snapshot → mint-flow → studio-pack edits to CreateFlower.tsx must be applied sequentially, never in parallel worktrees.
6. **proto-image** — Wrong cross-task reference in Interfaces: 'Proto: PrepareMintRequest{... bytes image_png = 3; } (consumed by the FlowerCanvas snapshot task)'. The snapshot task never touches the proto or client — the consumer of image_png/the regenerated stub is the mint-flow task. **Fix:** Change the parenthetical to '(consumed by the mint-flow task via prepareMintViaGrpc)' so an executor doesn't hunt for a nonexistent dependency in the snapshot task.
7. **dashboard-pack** — family/flowerType fallback duplicated with drift alongside the gradient helper: myflowers familyLabel(flower) and nft-pack/studio-pack/activity-page inline `family ?? flowerType`, but dashboard familyKey(params) adds a third fallback `?? "unknown"` the others lack — the same malformed row would badge as 'unknown' on the dashboard but render undefined/blank elsewhere. **Fix:** Co-locate one shared familyLabel(params: FlowerParams): string with the studio-pack-owned gradient helper (decide once whether the 'unknown' guard is wanted and apply it everywhere); dashboard-pack, myflowers-pack, nft-pack, activity-page, and FlowerBadges consume it. Lower priority than the gradient unification but same mechanism.

**Locked ownership:**
- `prepareMintViaGrpc` in `src/integrations/flowerBackend/client.ts` is edited ONLY by Task 3 (mint-flow). Task 1 (proto-image) regenerates stubs + Go only — skip any client.ts step its draft contains.
- `FlowerParams.mintTokenId?/mintContractAddress?` are added ONLY by Task 3; Task 5 (nft-pack) consumes them read-only.
- Shared UI helper — NEW `src/components/flower/paletteUi.ts`, owned by Task 4 (studio-pack): `paletteGradient(stops)` (position-aware `linear-gradient(90deg, <hex> <pos*100>%...)`; 0 stops → `#808080`, 1 stop → flat color) and `familyLabel(p)` (family ?? flowerType fallback). Tasks 5-8 IMPORT it — never reimplement, never drop stop positions.
- CreateFlower.tsx is edited by Tasks 2→4 in that order (import-line collisions: match by text, re-read between tasks).

## Dependencies & sequencing

Recommended order: (1) proto-image and (2) snapshot first — fully independent, no shared files, can run in parallel; (3) mint-flow (hard-depends on both: regenerated imagePng stub + captureFlowerPng, and is the sole owner of client.ts changes per issue 1 and FlowerParams mint fields per issue 2); (4) studio-pack (owner of the shared paletteGradient/familyLabel helper — must precede every gradient consumer; also the last of the three sequential CreateFlower.tsx editors); (5) nft-pack (needs mint-flow's FlowerParams fields AND studio-pack's helper); (6–8) myflowers-pack, dashboard-pack, activity-page in any order after studio-pack (each depends only on the shared helper; activity-page's App.tsx/AppSidebar edits were verified against the real files — /payments route line 57, sidebar item line 13, multiline lucide import all match the diffs — and no other task references /payments, so it conflicts with nothing). Two constraint chains to respect if parallelizing: CreateFlower.tsx is edited by snapshot → mint-flow → studio-pack strictly sequentially, and the snapshot/prepareMintViaGrpc/FlowerParams shared contracts all checked out signature-identical across tasks once the ownership duplications above are resolved.

---

# Tasks

### Task 1: Proto `image_png` + Go: upload mint image to MinIO, real person name in metadata

**Files:**
- Modify: `flower-backend/proto/flower/v1/service.proto` (add `bytes image_png = 3;` to `PrepareMintRequest`)
- Modify (regenerated, committed): `flower-backend/gen/go/flower/v1/service.pb.go`, `flower-backend/gen/go/flower/v1/service_grpc.pb.go`, `petal-pixel-studio/src/gen/flower/v1/service_pb.ts`, `petal-pixel-studio/src/gen/flower/v1/service_connect.ts`
- Modify: `flower-backend/internal/nft/metadata.go` (add `imageURL` param to `BuildMetadata`)
- Modify: `flower-backend/internal/assets/s3uploader.go` — NOTE: `PutBytes(ctx context.Context, key, contentType string, r io.Reader) (string, error)` **already exists** (line ~94); only refactor `PutJSON` to delegate to it
- Modify: `flower-backend/internal/api/grpc/store.go` — `GetFlower` currently does `select params from flowers where flower_id = $1` and `FlowerRow` has **no** `PersonName` field; add it (the shared contract assumes the row carries `person_name`)
- Modify: `flower-backend/internal/api/grpc/flower_server.go` — `PrepareMint` (replace `nft.BuildMetadata("unknown", ...)` at line ~100; add image upload + size guard)
- Modify: `petal-pixel-studio/src/integrations/flowerBackend/client.ts` — `prepareMintViaGrpc(flowerId: string, walletAddress: string)` gains optional `imagePng?: Uint8Array`
- Test (create): `flower-backend/internal/nft/metadata_test.go`, `flower-backend/internal/assets/s3uploader_test.go`, `flower-backend/internal/api/grpc/prepare_mint_test.go`, `petal-pixel-studio/src/integrations/flowerBackend/prepareMintRequest.test.ts`

**Interfaces:**
- Consumes: existing `func (u *S3Uploader) PutBytes(ctx context.Context, key, contentType string, r io.Reader) (string, error)`; `s.store.GetFlower(ctx, flowerID) (*FlowerRow, error)`; regenerated `req.GetImagePng() []byte` (Go) and `imagePng: Uint8Array` on `PrepareMintRequest` (TS).
- Produces:
  - Proto: `PrepareMintRequest{ string flower_id = 1; string wallet_address = 2; bytes image_png = 3; }` (consumed by the FlowerCanvas snapshot task).
  - `func BuildMetadata(personName, flowerID string, seed uint64, algoVersion, imageURL string, attrs []Attribute) ([]byte, error)` (sets `Metadata.Image` when `imageURL != ""`).
  - `const maxImagePngBytes = 2 << 20` and `func validateImagePng(png []byte) error` in package `grpcapi` (returns `codes.InvalidArgument` when `len > 2 MiB`).
  - `FlowerRow.PersonName string`.
  - `export async function prepareMintViaGrpc(flowerId: string, walletAddress: string, imagePng?: Uint8Array)`.
  - Uploaded object key: `images/<flowerId>.png`, content-type `image/png`, public URL `<S3_PUBLIC_BASE_URL>/images/<flowerId>.png`.

- [ ] **Step 1: Write the failing tests**

Create `flower-backend/internal/nft/metadata_test.go` (written against the NEW 6-arg signature — fails to compile until Step 3):

```go
package nft

import (
	"encoding/json"
	"testing"
)

func TestBuildMetadataUsesPersonNameAndImageURL(t *testing.T) {
	url := "http://localhost:9000/assets/images/f_abc123.png"
	b, err := BuildMetadata("Ada Lovelace", "f_abc123", 42, "v2", url, nil)
	if err != nil {
		t.Fatalf("BuildMetadata: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got, want := m["name"], "Flower for Ada Lovelace"; got != want {
		t.Errorf("name = %v, want %v", got, want)
	}
	if got := m["image"]; got != url {
		t.Errorf("image = %v, want %v", got, url)
	}
}

func TestBuildMetadataOmitsImageWhenEmpty(t *testing.T) {
	b, err := BuildMetadata("Ada Lovelace", "f_abc123", 42, "v2", "", nil)
	if err != nil {
		t.Fatalf("BuildMetadata: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if _, ok := m["image"]; ok {
		t.Errorf("image key present for empty imageURL, want omitted (omitempty)")
	}
}
```

Create `flower-backend/internal/api/grpc/prepare_mint_test.go` (references `validateImagePng` / `maxImagePngBytes` — fails to compile until Step 3):

```go
package grpcapi

import (
	"testing"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestValidateImagePng(t *testing.T) {
	if err := validateImagePng(nil); err != nil {
		t.Errorf("nil image: got %v, want nil", err)
	}
	if err := validateImagePng(make([]byte, maxImagePngBytes)); err != nil {
		t.Errorf("exactly 2MiB: got %v, want nil", err)
	}
	err := validateImagePng(make([]byte, maxImagePngBytes+1))
	if status.Code(err) != codes.InvalidArgument {
		t.Errorf("2MiB+1: got code %v (err=%v), want InvalidArgument", status.Code(err), err)
	}
}
```

Create `flower-backend/internal/assets/s3uploader_test.go` (fake S3 via `httptest`; the `PutBytes` case is a regression lock for the pre-existing method, the `PutJSON` case locks behavior across the delegation refactor):

```go
package assets

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func newFakeS3(t *testing.T) (*S3Uploader, func(path string) string) {
	t.Helper()
	var mu sync.Mutex
	contentTypes := map[string]string{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		contentTypes[r.URL.Path] = r.Header.Get("Content-Type")
		mu.Unlock()
		w.Header().Set("ETag", `"test-etag"`)
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)

	u, err := NewS3Uploader(context.Background(), S3Config{
		Endpoint:        srv.URL,
		AccessKeyID:     "test",
		SecretAccessKey: "test",
		Bucket:          "assets",
		PublicBaseURL:   srv.URL + "/assets",
		ForcePathStyle:  true,
	})
	if err != nil {
		t.Fatalf("NewS3Uploader: %v", err)
	}
	return u, func(path string) string {
		mu.Lock()
		defer mu.Unlock()
		return contentTypes[path]
	}
}

func TestPutBytesSetsContentType(t *testing.T) {
	u, ctOf := newFakeS3(t)
	url, err := u.PutBytes(context.Background(), "images/f_abc123.png", "image/png",
		bytes.NewReader([]byte{0x89, 'P', 'N', 'G'}))
	if err != nil {
		t.Fatalf("PutBytes: %v", err)
	}
	if got := ctOf("/assets/images/f_abc123.png"); got != "image/png" {
		t.Errorf("Content-Type = %q, want image/png", got)
	}
	if !strings.HasSuffix(url, "/assets/images/f_abc123.png") {
		t.Errorf("public URL = %q, want suffix /assets/images/f_abc123.png", url)
	}
}

func TestPutJSONDelegatesWithJSONContentType(t *testing.T) {
	u, ctOf := newFakeS3(t)
	if _, err := u.PutJSON(context.Background(), "metadata/f_abc123.json", []byte(`{"a":1}`)); err != nil {
		t.Fatalf("PutJSON: %v", err)
	}
	if got := ctOf("/assets/metadata/f_abc123.json"); got != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", got)
	}
}
```

Create `petal-pixel-studio/src/integrations/flowerBackend/prepareMintRequest.test.ts` (fails until stubs are regenerated with field 3; imports the schema directly to avoid `client.ts` transport side effects):

```ts
import { describe, expect, it } from "vitest";
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { PrepareMintRequestSchema } from "@/gen/flower/v1/service_pb";

describe("PrepareMintRequest image_png", () => {
  it("carries imagePng bytes through the binary wire format", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const msg = create(PrepareMintRequestSchema, {
      flowerId: "f_abc123",
      walletAddress: "0x0000000000000000000000000000000000000001",
      imagePng: png,
    });
    const decoded = fromBinary(PrepareMintRequestSchema, toBinary(PrepareMintRequestSchema, msg));
    expect(Array.from(decoded.imagePng)).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(decoded.flowerId).toBe("f_abc123");
  });
});
```

- [ ] **Step 2: Run them, expect FAIL**

```bash
docker run --rm -v "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/flower-backend":/src -w /src golang:1.25-alpine go test ./...
```
Expected: build failures — `internal/nft` fails with `too many arguments in call to BuildMetadata`, `internal/api/grpc` fails with `undefined: validateImagePng` and `undefined: maxImagePngBytes`. (`internal/assets` tests alone would pass — `PutBytes` already exists — but the overall run FAILs.)

```bash
cd petal-pixel-studio && npx vitest run src/integrations/flowerBackend/prepareMintRequest.test.ts
```
Expected: FAIL — `decoded.imagePng` is `undefined` (field 3 not in generated schema yet), so `Array.from(decoded.imagePng)` throws.

- [ ] **Step 3: Implement**

3a. `flower-backend/proto/flower/v1/service.proto` — extend `PrepareMintRequest` (currently fields 1–2):

```proto
message PrepareMintRequest {
  string flower_id = 1;
  string wallet_address = 2;
  // Optional PNG snapshot of the rendered flower (<= 2 MiB). When non-empty the
  // backend stores it at images/<flower_id>.png and references it as the
  // metadata image. Empty means "no image" (back-compat).
  bytes image_png = 3;
}
```

3b. Regenerate BOTH stub sets (Dockerized buf, path quoted because of the space):

```bash
docker run --rm -v "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel":/workspace -w /workspace/flower-backend bufbuild/buf:1.47.2 generate
docker run --rm -v "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel":/workspace -w /workspace/flower-backend bufbuild/buf:1.47.2 generate --template buf.gen.frontend.yaml
```

Verify: `grep -n "ImagePng" flower-backend/gen/go/flower/v1/service.pb.go` and `grep -n "imagePng" petal-pixel-studio/src/gen/flower/v1/service_pb.ts` both hit.

3c. `flower-backend/internal/nft/metadata.go` — add `imageURL` param and set the existing `Image` field (struct already has `Image string \`json:"image,omitempty"\``):

```go
func BuildMetadata(personName, flowerID string, seed uint64, algoVersion, imageURL string, attrs []Attribute) ([]byte, error) {
	m := Metadata{
		Name:        fmt.Sprintf("Flower for %s", personName),
		Description: "A personalized procedural 3D flower.",
		Image:       imageURL,
		Attributes: append([]Attribute{
			{TraitType: "flower_id", Value: flowerID},
			{TraitType: "seed", Value: seed},
			{TraitType: "algo_version", Value: algoVersion},
		}, attrs...),
	}
	return json.Marshal(m)
}
```

3d. `flower-backend/internal/assets/s3uploader.go` — `PutBytes` already exists; replace the body of `PutJSON` with delegation (keep signature):

```go
func (u *S3Uploader) PutJSON(ctx context.Context, key string, data []byte) (string, error) {
	return u.PutBytes(ctx, key, "application/json", bytes.NewReader(data))
}
```

3e. `flower-backend/internal/api/grpc/store.go` — add `PersonName` to `FlowerRow` and load it in `GetFlower` (it is NOT currently selected — the query is `select params from flowers where flower_id = $1`):

```go
type FlowerRow struct {
	FlowerID   string
	PersonName string
	Params     flower.Params
}
```

and in `GetFlower` replace the query line with:

```go
	err := s.db.QueryRowContext(ctx, `select person_name, params from flowers where flower_id = $1`, flowerID).Scan(&row.PersonName, &paramsJSON)
```

3f. `flower-backend/internal/api/grpc/flower_server.go` — add `"bytes"` to imports, add the guard, upload the image, and use the real person name. Add near the top of the file:

```go
// maxImagePngBytes bounds the optional mint snapshot (2 MiB).
const maxImagePngBytes = 2 << 20

func validateImagePng(png []byte) error {
	if len(png) > maxImagePngBytes {
		return status.Errorf(codes.InvalidArgument, "image_png exceeds %d bytes", maxImagePngBytes)
	}
	return nil
}
```

In `PrepareMint`, after the `wallet == ""` check add:

```go
	if err := validateImagePng(req.GetImagePng()); err != nil {
		return nil, err
	}
```

Then replace the block

```go
	metadataJSON, err := nft.BuildMetadata("unknown", flowerID, f.Params.Seed, f.Params.AlgoVersion, nil)
```

with:

```go
	imageURL := ""
	if png := req.GetImagePng(); len(png) > 0 {
		imageURL, err = s.upl.PutBytes(ctx, "images/"+flowerID+".png", "image/png", bytes.NewReader(png))
		if err != nil {
			return nil, status.Error(codes.Internal, "failed to upload image")
		}
	}

	personName := strings.TrimSpace(f.PersonName)
	if personName == "" {
		personName = "unknown" // pre-existing rows written before person_name was loaded
	}
	metadataJSON, err := nft.BuildMetadata(personName, flowerID, f.Params.Seed, f.Params.AlgoVersion, imageURL, nil)
```

3g. `petal-pixel-studio/src/integrations/flowerBackend/client.ts` — extend the existing two-arg function (backward compatible; existing caller `CreateFlower.tsx:489` and the `vi.fn()` mock in `CreateFlower.save.test.tsx` are unaffected):

```ts
export async function prepareMintViaGrpc(flowerId: string, walletAddress: string, imagePng?: Uint8Array) {
  return client.prepareMint(
    create(PrepareMintRequestSchema, {
      flowerId,
      walletAddress,
      ...(imagePng && imagePng.length > 0 ? { imagePng } : {}),
    }),
  );
}
```

- [ ] **Step 4: Run them, expect PASS**

```bash
docker run --rm -v "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/flower-backend":/src -w /src golang:1.25-alpine go test ./...
cd petal-pixel-studio && npx vitest run src/integrations/flowerBackend/prepareMintRequest.test.ts
```
Expected: all Go packages `ok` (nft metadata name+image tests, assets content-type tests, grpc `TestValidateImagePng`, plus pre-existing generator/palette/server tests) and the vitest file green.

- [ ] **Step 5: Commit**

```bash
git add "flower-backend/proto/flower/v1/service.proto" \
  "flower-backend/gen/go/flower/v1" \
  "flower-backend/internal/nft/metadata.go" "flower-backend/internal/nft/metadata_test.go" \
  "flower-backend/internal/assets/s3uploader.go" "flower-backend/internal/assets/s3uploader_test.go" \
  "flower-backend/internal/api/grpc/store.go" "flower-backend/internal/api/grpc/flower_server.go" \
  "flower-backend/internal/api/grpc/prepare_mint_test.go" \
  "petal-pixel-studio/src/gen/flower/v1" \
  "petal-pixel-studio/src/integrations/flowerBackend/client.ts" \
  "petal-pixel-studio/src/integrations/flowerBackend/prepareMintRequest.test.ts"
git commit -m "feat(mint): image_png in PrepareMint — upload snapshot to MinIO, real person name in metadata

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Flower snapshot capability + Download PNG button

**Files:**
- Create: `petal-pixel-studio/src/components/flower/snapshot.ts`
- Create: `petal-pixel-studio/src/components/flower/snapshot.test.ts`
- Modify: `petal-pixel-studio/src/components/flower/FlowerCanvas.tsx`
- Modify: `petal-pixel-studio/src/pages/CreateFlower.tsx`

**Interfaces:**
- Consumes: `useThree()` from `@react-three/fiber` (gl/scene/camera inside `<Canvas>` in `FlowerCanvas.tsx`); `toast` from `sonner`; existing `titleInput` / `generationWord` state in `CreateFlower.tsx`.
- Produces (shared contract — later mint task depends on these exact signatures):
  - `registerSnapshotter(fn: () => Promise<Blob | null>): () => void`
  - `captureFlowerPng(): Promise<Blob | null>` (resolves `null` when no canvas is mounted or capture throws)
  - Helpers: `fitWithin(width: number, height: number, max: number): { width: number; height: number }`, `downscaleToPng(source: HTMLCanvasElement, maxEdge?: number): Promise<Blob | null>`, `SNAPSHOT_MAX_EDGE = 512`

- [ ] **Step 1: Write the failing test**

  Create `petal-pixel-studio/src/components/flower/snapshot.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest';
  import { registerSnapshotter, captureFlowerPng, fitWithin } from './snapshot';

  describe('fitWithin', () => {
    it('leaves dimensions already within max untouched', () => {
      expect(fitWithin(400, 300, 512)).toEqual({ width: 400, height: 300 });
    });

    it('downscales the long edge to max, preserving aspect ratio', () => {
      expect(fitWithin(2048, 1024, 512)).toEqual({ width: 512, height: 256 });
    });

    it('downscales portrait canvases by height', () => {
      expect(fitWithin(600, 1200, 512)).toEqual({ width: 256, height: 512 });
    });

    it('never rounds a non-zero edge down to zero', () => {
      expect(fitWithin(1, 10000, 512)).toEqual({ width: 1, height: 512 });
    });

    it('returns zero size for degenerate input', () => {
      expect(fitWithin(0, 300, 512)).toEqual({ width: 0, height: 0 });
    });
  });

  describe('snapshot registry', () => {
    it('resolves null when no snapshotter is registered', async () => {
      await expect(captureFlowerPng()).resolves.toBeNull();
    });

    it('delegates to the registered snapshotter', async () => {
      const blob = new Blob(['png-bytes'], { type: 'image/png' });
      const unregister = registerSnapshotter(async () => blob);
      await expect(captureFlowerPng()).resolves.toBe(blob);
      unregister();
    });

    it('resolves null again after unregister', async () => {
      const unregister = registerSnapshotter(async () => new Blob());
      unregister();
      await expect(captureFlowerPng()).resolves.toBeNull();
    });

    it('a stale unregister does not clobber a newer registration', async () => {
      const staleUnregister = registerSnapshotter(async () => null);
      const blob = new Blob(['newer'], { type: 'image/png' });
      const newerUnregister = registerSnapshotter(async () => blob);
      staleUnregister(); // must be a no-op: it is not the current snapshotter
      await expect(captureFlowerPng()).resolves.toBe(blob);
      newerUnregister();
    });

    it('resolves null instead of rejecting when the snapshotter throws', async () => {
      const unregister = registerSnapshotter(async () => {
        throw new Error('WebGL context lost');
      });
      await expect(captureFlowerPng()).resolves.toBeNull();
      unregister();
    });
  });
  ```

- [ ] **Step 2: Run it, expect FAIL**

  ```bash
  cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio" && npx vitest run src/components/flower/snapshot.test.ts
  ```

  Expected: the suite fails to load with `Failed to resolve import "./snapshot" from "src/components/flower/snapshot.test.ts"` (the module does not exist yet).

- [ ] **Step 3: Implement**

  **3a.** Create `petal-pixel-studio/src/components/flower/snapshot.ts`:

  ```ts
  // On-demand snapshot registry for the flower canvas.
  //
  // FlowerCanvas registers a capture function while mounted; consumers
  // (Download PNG button, mint flow) call captureFlowerPng() without needing
  // a ref to the WebGL canvas. preserveDrawingBuffer stays OFF globally: the
  // registered snapshotter re-renders the scene and reads the canvas pixels
  // in the same synchronous task, so the framebuffer is still valid.

  export type Snapshotter = () => Promise<Blob | null>;

  let current: Snapshotter | null = null;

  export function registerSnapshotter(fn: Snapshotter): () => void {
    current = fn;
    return () => {
      // Only clear if we are still the active snapshotter; a stale unmount
      // must not clobber a newer canvas's registration (StrictMode remounts).
      if (current === fn) current = null;
    };
  }

  export async function captureFlowerPng(): Promise<Blob | null> {
    if (!current) return null;
    try {
      return await current();
    } catch {
      return null;
    }
  }

  export const SNAPSHOT_MAX_EDGE = 512;

  /** Fit width x height inside a max-by-max box, preserving aspect ratio. Never upscales. */
  export function fitWithin(
    width: number,
    height: number,
    max: number,
  ): { width: number; height: number } {
    if (width <= 0 || height <= 0) return { width: 0, height: 0 };
    const scale = Math.min(1, max / Math.max(width, height));
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  }

  /**
   * Draw `source` into a 2D canvas capped at maxEdge px on the long edge and
   * encode as PNG. drawImage runs synchronously before the returned promise
   * is created, so callers that gl.render() immediately before calling this
   * read a valid WebGL framebuffer even without preserveDrawingBuffer.
   */
  export function downscaleToPng(
    source: HTMLCanvasElement,
    maxEdge: number = SNAPSHOT_MAX_EDGE,
  ): Promise<Blob | null> {
    const { width, height } = fitWithin(source.width, source.height, maxEdge);
    if (width === 0 || height === 0) return Promise.resolve(null);
    const target = document.createElement('canvas');
    target.width = width;
    target.height = height;
    const ctx = target.getContext('2d');
    if (!ctx) return Promise.resolve(null);
    ctx.drawImage(source, 0, 0, width, height);
    return new Promise((resolve) => target.toBlob(resolve, 'image/png'));
  }
  ```

  **3b.** Wire registration in `petal-pixel-studio/src/components/flower/FlowerCanvas.tsx`. Add the import (the file already imports `useThree` at line 2: `import { Canvas, useThree } from '@react-three/fiber';`):

  ```ts
  import { registerSnapshotter, downscaleToPng } from './snapshot';
  ```

  Add a bridge component after `AutoFrameCamera` (before `export function FlowerCanvas()`):

  ```tsx
  function SnapshotBridge() {
    const { gl, scene, camera } = useThree();

    useEffect(
      () =>
        registerSnapshotter(() => {
          // Re-render on demand so the framebuffer is fresh, then read it in
          // the same task. This avoids enabling preserveDrawingBuffer.
          gl.render(scene, camera);
          return downscaleToPng(gl.domElement);
        }),
      [gl, scene, camera],
    );

    return null;
  }
  ```

  Mount it inside the `<Canvas>` JSX, directly under the existing line `<AutoFrameCamera bounds={bounds} controlsRef={controlsRef} />`:

  ```tsx
        <Flower3D params={params} onBoundsChange={setBounds} />
        <AutoFrameCamera bounds={bounds} controlsRef={controlsRef} />
        <SnapshotBridge />
  ```

  **3c.** Add the Download PNG button to `petal-pixel-studio/src/pages/CreateFlower.tsx`.

  Extend the lucide import (line 8) — add `Download`:

  ```ts
  import { Sparkles, Save, Gem, BarChart3, X, Copy, ExternalLink, AlertTriangle, Pencil, Wallet, Download } from 'lucide-react';
  ```

  Add the snapshot import next to the other `@/components/flower/...` imports:

  ```ts
  import { captureFlowerPng } from '@/components/flower/snapshot';
  ```

  Add the handler inside `CreateFlower()` next to the other handlers (e.g. after `handleCheckBackend`):

  ```ts
  const handleDownloadPng = async () => {
    const blob = await captureFlowerPng();
    if (!blob) {
      toast.error('Could not capture the flower image. Is the 3D view visible?');
      return;
    }
    const safeTitle = (titleInput.trim() || generationWord || 'flower').replace(/[\\/:*?"<>|]/g, '_');
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeTitle}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };
  ```

  Add the button in the "Row 2: actions" toolbar, between the Save button (ends with `{isSaving ? 'Saving...' : isEditMode ? 'Update' : 'Save'}`) and the Mint NFT button:

  ```tsx
            <button
              onClick={() => void handleDownloadPng()}
              title="Download PNG snapshot"
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
            >
              <Download className="w-3 h-3" />
              <span className="hidden sm:inline">PNG</span>
            </button>
  ```

- [ ] **Step 4: Run it, expect PASS**

  ```bash
  cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio" && npx vitest run src/components/flower/snapshot.test.ts
  ```

  Expected: all 10 tests pass. Then run the full suite to confirm no regressions:

  ```bash
  cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio" && npx vitest run
  ```

  **MANUAL VERIFICATION (button — jsdom has no WebGL):**
  1. `cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio" && npm run dev` and open `http://localhost:8080`, log in, go to the Create page.
  2. Type a word (e.g. `rosalind`) and click Generate; set the title field to `My Test Flower`.
  3. Click the **PNG** button in the actions row (between Save and Mint NFT).
     Expected: browser downloads `My Test Flower.png`; opening it shows the current 3D flower view (dark background, flower centered), and the image's long edge is at most 512 px (check via Finder Get Info).
  4. Clear the title field and click PNG again. Expected: downloads `rosalind.png` (falls back to the generation word).
  5. Rotate the camera with the mouse, click PNG again. Expected: the new PNG reflects the rotated view (proves on-demand re-render, not a stale buffer).

- [ ] **Step 5: Commit**

  ```bash
  cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel" && git add petal-pixel-studio/src/components/flower/snapshot.ts petal-pixel-studio/src/components/flower/snapshot.test.ts petal-pixel-studio/src/components/flower/FlowerCanvas.tsx petal-pixel-studio/src/pages/CreateFlower.tsx && git commit -m "feat(snapshot): on-demand flower PNG capture + Download PNG button

  Adds a snapshotter registry (registerSnapshotter/captureFlowerPng) with
  512px-max downscale, a SnapshotBridge inside FlowerCanvas that re-renders
  the scene on demand (no preserveDrawingBuffer), and a toolbar button on
  the Create page that downloads <title>.png.

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 3: Mint flow: snapshot upload, Token ID capture, and post-mint success dialog

**Depends on:** the snapshot task (`src/components/flower/snapshot.ts` exporting `captureFlowerPng`) and the proto/backend task (regenerated `petal-pixel-studio/src/gen/flower/v1/service_pb.ts` where `PrepareMintRequest` has `imagePng: Uint8Array`, field 3). Do not start until both are merged.

**Files:**
- Create: `petal-pixel-studio/src/pages/mintReceipt.ts`
- Create (test): `petal-pixel-studio/src/pages/mintReceipt.test.ts`
- Create (test): `petal-pixel-studio/src/stores/markMintedParams.test.ts`
- Modify: `petal-pixel-studio/src/integrations/flowerBackend/client.ts` (`prepareMintViaGrpc` gains optional image bytes)
- Modify: `petal-pixel-studio/src/stores/flowerStore.ts` (`FlowerParams` mint fields; `markMintedByBackendFlowerId` 4th arg)
- Modify: `petal-pixel-studio/src/pages/CreateFlower.tsx` (`handleMint` capture + tokenId + dialog; new `MintSuccessDialog`)

**Interfaces:**
- Consumes: `captureFlowerPng(): Promise<Blob | null>` from `@/components/flower/snapshot`; `PrepareMintRequest.imagePng: Uint8Array` from the regenerated stub; `id(text: string): string` from `ethers` (v6); `Dialog/DialogContent/DialogHeader/DialogTitle/DialogDescription` from `@/components/ui/dialog`; existing `PrepareMintResponse` fields `contractAddress`, `mintTo`, `mintTokenUri`, `tokenUri`.
- Produces:
  - `prepareMintViaGrpc(flowerId: string, walletAddress: string, imagePng?: Uint8Array)` (client.ts)
  - `TRANSFER_TOPIC: string` and `extractMintedTokenId(logs: readonly { address: string; topics: readonly string[] }[], contractAddress: string): number | null` (mintReceipt.ts)
  - `FlowerParams.mintTokenId?: number` and `FlowerParams.mintContractAddress?: string` (flowerStore.ts)
  - `markMintedByBackendFlowerId(backendFlowerId: string, txHash?: string, tokenUri?: string, mint?: { tokenId?: number; contractAddress?: string }): Promise<boolean>` (flowerStore.ts)

- [ ] **Step 1: Write the failing tests**

Create `petal-pixel-studio/src/pages/mintReceipt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractMintedTokenId, TRANSFER_TOPIC } from './mintReceipt';

const CONTRACT = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const ZERO_WORD = '0x' + '0'.repeat(64);
const RECIPIENT_WORD = '0x' + 'f39fd6e51aad88f6f4ce6ab8827279cfffb92266'.padStart(64, '0');

function transferLog(tokenId: number, address = CONTRACT) {
  return {
    address,
    topics: [
      TRANSFER_TOPIC,
      ZERO_WORD, // from = 0x0 on a mint
      RECIPIENT_WORD,
      '0x' + tokenId.toString(16).padStart(64, '0'),
    ],
  };
}

describe('extractMintedTokenId', () => {
  it('uses the canonical ERC-721 Transfer topic hash', () => {
    // keccak256("Transfer(address,address,uint256)")
    expect(TRANSFER_TOPIC).toBe(
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
    );
  });

  it('extracts tokenId from the third indexed topic of a matching Transfer log', () => {
    expect(extractMintedTokenId([transferLog(7)], CONTRACT)).toBe(7);
  });

  it('matches the contract address case-insensitively', () => {
    expect(extractMintedTokenId([transferLog(3)], CONTRACT.toLowerCase())).toBe(3);
  });

  it('ignores Transfer logs emitted by other contracts', () => {
    const other = transferLog(9, '0x0000000000000000000000000000000000000001');
    expect(extractMintedTokenId([other], CONTRACT)).toBeNull();
  });

  it('ignores ERC-20-shaped Transfer logs (only 3 topics — tokenId not indexed)', () => {
    const erc20 = { address: CONTRACT, topics: [TRANSFER_TOPIC, ZERO_WORD, RECIPIENT_WORD] };
    expect(extractMintedTokenId([erc20], CONTRACT)).toBeNull();
  });

  it('returns null for an empty log list', () => {
    expect(extractMintedTokenId([], CONTRACT)).toBeNull();
  });
});
```

Create `petal-pixel-studio/src/stores/markMintedParams.test.ts` (mock shape copied from `src/stores/markMintedByBackendFlowerId.test.ts`):

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const getUserMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: () => getUserMock() },
    from: () => ({
      update: (...args: unknown[]) => updateMock(...args),
    }),
  },
}));

vi.mock("@/integrations/flowerBackend/client", () => ({
  createFlowerViaGrpc: vi.fn(),
}));

import { useFlowerStore, type SavedFlower } from "@/stores/flowerStore";

const baseParams = { ...useFlowerStore.getState().params };
const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

function seedFlower(overrides: Partial<SavedFlower> = {}): SavedFlower {
  return {
    id: "flower-1",
    backendFlowerId: "flower-1",
    title: "Test",
    generationWord: "test",
    params: { ...baseParams, flowerId: "flower-1" },
    createdAt: "2026-07-06",
    isMinted: false,
    ...overrides,
  };
}

// .eq().eq() chain resolving to a Supabase-style { error } object
function chainResolving(error: unknown) {
  const eq2 = vi.fn().mockResolvedValue({ error });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  return { eq: eq1 };
}

describe("markMintedByBackendFlowerId mint-result params", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    updateMock.mockReset();
    useFlowerStore.setState({ savedFlowers: [seedFlower()] });
  });

  it("writes mintTokenId + mintContractAddress into the saved flower's params", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    updateMock.mockReturnValue(chainResolving(null));

    const ok = await useFlowerStore.getState().markMintedByBackendFlowerId(
      "flower-1",
      "0xhash",
      "http://uri/metadata.json",
      { tokenId: 7, contractAddress: CONTRACT },
    );

    expect(ok).toBe(true);
    const flower = useFlowerStore.getState().savedFlowers[0];
    expect(flower.isMinted).toBe(true);
    expect(flower.params.mintTokenId).toBe(7);
    expect(flower.params.mintContractAddress).toBe(CONTRACT);
  });

  it("persists the updated params through the Supabase update payload", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    updateMock.mockReturnValue(chainResolving(null));

    await useFlowerStore.getState().markMintedByBackendFlowerId(
      "flower-1", "0xhash", undefined, { tokenId: 7, contractAddress: CONTRACT },
    );

    const payload = updateMock.mock.calls[0][0] as {
      params?: { mintTokenId?: number; mintContractAddress?: string };
    };
    expect(payload.params?.mintTokenId).toBe(7);
    expect(payload.params?.mintContractAddress).toBe(CONTRACT);
  });

  it("tolerates a missing tokenId (contract address alone still persisted)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    updateMock.mockReturnValue(chainResolving(null));

    await useFlowerStore.getState().markMintedByBackendFlowerId(
      "flower-1", "0xhash", undefined, { contractAddress: CONTRACT },
    );

    const flower = useFlowerStore.getState().savedFlowers[0];
    expect(flower.params.mintTokenId).toBeUndefined();
    expect(flower.params.mintContractAddress).toBe(CONTRACT);
  });

  it("omits the params column and leaves params untouched when no mint info is passed", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    updateMock.mockReturnValue(chainResolving(null));

    await useFlowerStore.getState().markMintedByBackendFlowerId("flower-1", "0xhash");

    const payload = updateMock.mock.calls[0][0] as Record<string, unknown>;
    expect("params" in payload).toBe(false);
    expect(useFlowerStore.getState().savedFlowers[0].params.mintTokenId).toBeUndefined();
  });
});
```

MANUAL VERIFICATION (dialog — executed in Step 4): see the checklist in Step 4.

- [ ] **Step 2: Run it, expect FAIL**

```
cd petal-pixel-studio && npx vitest run src/pages/mintReceipt.test.ts src/stores/markMintedParams.test.ts
```

Expected: `mintReceipt.test.ts` fails with `Failed to resolve import "./mintReceipt"` (module does not exist yet); `markMintedParams.test.ts` fails on `expected undefined to be 7` (the 4th argument is ignored by the current 3-arg implementation) and `expected undefined to be '0x5FbD…'`.

- [ ] **Step 3: Implement**

**3a. Create `petal-pixel-studio/src/pages/mintReceipt.ts`:**

```ts
import { id } from 'ethers';

/** keccak256("Transfer(address,address,uint256)") — shared by ERC-20 and ERC-721. */
export const TRANSFER_TOPIC = id('Transfer(address,address,uint256)');

/** Minimal structural view of an ethers v6 receipt Log — keeps tests ethers-free. */
export interface ReceiptLog {
  address: string;
  topics: readonly string[];
}

/**
 * Parses the ERC-721 Transfer event out of a mint tx receipt and returns the
 * minted tokenId, or null when no matching event is found. ERC-721 Transfer has
 * all 3 args indexed (4 topics total); tokenId is topics[3]. ERC-20 Transfer
 * only has 3 topics, so requiring length 4 filters those out.
 */
export function extractMintedTokenId(
  logs: readonly ReceiptLog[],
  contractAddress: string,
): number | null {
  const wanted = contractAddress.toLowerCase();
  for (const log of logs) {
    if (log.address.toLowerCase() !== wanted) continue;
    if (log.topics.length !== 4) continue;
    if (log.topics[0] !== TRANSFER_TOPIC) continue;
    return Number(BigInt(log.topics[3]));
  }
  return null;
}
```

**3b. `petal-pixel-studio/src/integrations/flowerBackend/client.ts` — thread image bytes into PrepareMint** (replace the existing `prepareMintViaGrpc`):

```ts
export async function prepareMintViaGrpc(
  flowerId: string,
  walletAddress: string,
  imagePng?: Uint8Array,
) {
  return client.prepareMint(
    create(PrepareMintRequestSchema, {
      flowerId,
      walletAddress,
      ...(imagePng && imagePng.length > 0 ? { imagePng } : {}),
    }),
  );
}
```

**3c. `petal-pixel-studio/src/stores/flowerStore.ts`:**

Add to `FlowerParams` (after `superformulaParams?: SuperformulaParams;`):

```ts
  // Mint results: stored inside params so they round-trip through the existing
  // params jsonb column with zero DB migration. Set at mint time only.
  mintTokenId?: number;
  mintContractAddress?: string;
```

Update the interface signature (line ~97):

```ts
  markMintedByBackendFlowerId: (
    backendFlowerId: string,
    txHash?: string,
    tokenUri?: string,
    mint?: { tokenId?: number; contractAddress?: string },
  ) => Promise<boolean>;
```

Replace the implementation (`markMintedByBackendFlowerId: async (backendFlowerId, txHash, tokenUri) => { ... }`):

```ts
  markMintedByBackendFlowerId: async (backendFlowerId, txHash, tokenUri, mint) => {
    // Optimistic local update. Mint results are stamped into params so they
    // persist through the params jsonb round-trip (no DB migration).
    set((s) => ({
      savedFlowers: s.savedFlowers.map((f) =>
        f.backendFlowerId === backendFlowerId
          ? {
              ...f,
              isMinted: true,
              txHash: txHash ?? f.txHash,
              tokenUri: tokenUri ?? f.tokenUri,
              params: mint
                ? {
                    ...f.params,
                    ...(mint.tokenId != null ? { mintTokenId: mint.tokenId } : {}),
                    ...(mint.contractAddress ? { mintContractAddress: mint.contractAddress } : {}),
                  }
                : f.params,
            }
          : f,
      ),
    }));

    // Persist to Supabase; report failure to the caller instead of swallowing it.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return true; // nothing to sync (not signed in)

      const updatedParams = get().savedFlowers.find(
        (f) => f.backendFlowerId === backendFlowerId,
      )?.params;

      const { error } = await supabase.from('user_flowers')
        .update({
          is_minted: true,
          tx_hash: txHash ?? null,
          token_uri: tokenUri ?? null,
          ...(mint && updatedParams
            ? { params: updatedParams as unknown as import('@/integrations/supabase/types').Json }
            : {}),
        })
        .eq('user_id', user.id)
        .eq('flower_id', backendFlowerId);
      if (error) {
        console.error('markMintedByBackendFlowerId sync error:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('markMintedByBackendFlowerId failed:', err);
      return false;
    }
  },
```

**3d. `petal-pixel-studio/src/pages/CreateFlower.tsx`:**

Imports — after the `from '@/integrations/flowerBackend/client';` block add:

```ts
import { captureFlowerPng } from '@/components/flower/snapshot';
import { extractMintedTokenId } from './mintReceipt';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
```

New components — insert after `UnsavedChangesDialog` (style matches the existing tx-bar copy buttons: `text-[10px]`, `font-mono`, `Copy className="w-3 h-3"`):

```tsx
function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[10px] text-muted-foreground font-semibold w-20 shrink-0 uppercase">{label}</span>
      <span className="text-xs text-foreground font-mono truncate flex-1">{value}</span>
      <button
        onClick={() => { void navigator.clipboard.writeText(value); toast.success(`${label} copied`); }}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        title={`Copy ${label}`}
      >
        <Copy className="w-3 h-3" />
      </button>
    </div>
  );
}

export interface MintResult {
  tokenId: number | null;
  contractAddress: string;
  txHash: string;
  tokenUri: string;
}

function MintSuccessDialog({ result, onClose }: { result: MintResult; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Gem className="w-4 h-4 text-primary" /> NFT minted
          </DialogTitle>
          <DialogDescription className="text-xs">
            Your flower is on-chain. Use the details below to import it into MetaMask.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2.5">
          <CopyRow label="Token ID" value={result.tokenId != null ? String(result.tokenId) : 'not detected'} />
          <CopyRow label="Contract" value={result.contractAddress} />
          <CopyRow label="Tx hash" value={result.txHash} />
          {result.tokenUri && (
            <a
              href={result.tokenUri}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline font-mono flex items-center gap-1"
            >
              metadata.json <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          )}
        </div>
        <div className="rounded-lg bg-secondary/60 border border-border p-3 text-[11px] text-muted-foreground leading-relaxed">
          <p>1. In MetaMask, open the NFTs tab and choose "Import NFT".</p>
          <p>2. Paste the contract address and Token ID shown above.</p>
          <p>3. Confirm — your flower appears in your wallet.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

State — after `const [mintTokenUri, setMintTokenUri] = useState('');`:

```ts
  const [mintResult, setMintResult] = useState<MintResult | null>(null);
```

`handleMint` edit 1 — replace:

```ts
      const prepared = await prepareMintViaGrpc(params.flowerId, signerAddress);
```

with:

```ts
      // Snapshot the rendered flower for the NFT image. Capture failure must
      // never block the mint — degrade to metadata without an image.
      let imageBytes: Uint8Array | undefined;
      try {
        const png = await captureFlowerPng();
        if (png) {
          imageBytes = new Uint8Array(await png.arrayBuffer());
        } else {
          toast.info('Could not capture flower image — minting without a preview.');
        }
      } catch {
        toast.info('Could not capture flower image — minting without a preview.');
      }

      const prepared = await prepareMintViaGrpc(params.flowerId, signerAddress, imageBytes);
```

`handleMint` edit 2 — replace:

```ts
      const tokenUri = prepared.mintTokenUri || prepared.tokenUri;
      if (tokenUri) setMintTokenUri(tokenUri);

      const synced = await markMintedByBackendFlowerId(params.flowerId, confirmedHash, tokenUri || undefined);
      if (synced) {
        toast.success('NFT minted and confirmed in backend');
      } else {
        toast.warning('Minted on-chain but failed to sync to your collection');
      }
```

with:

```ts
      // ERC-721 Transfer(from=0x0, to, tokenId): tokenId is the third indexed topic.
      const tokenId = receipt ? extractMintedTokenId(receipt.logs, prepared.contractAddress) : null;

      const tokenUri = prepared.mintTokenUri || prepared.tokenUri;
      if (tokenUri) setMintTokenUri(tokenUri);

      const synced = await markMintedByBackendFlowerId(params.flowerId, confirmedHash, tokenUri || undefined, {
        ...(tokenId != null ? { tokenId } : {}),
        contractAddress: prepared.contractAddress,
      });
      if (synced) {
        toast.success('NFT minted and confirmed in backend');
      } else {
        toast.warning('Minted on-chain but failed to sync to your collection');
      }

      setMintResult({
        tokenId,
        contractAddress: prepared.contractAddress,
        txHash: confirmedHash,
        tokenUri: tokenUri || '',
      });
```

Render — after the `blocker.state === 'blocked'` block in the returned JSX:

```tsx
      {mintResult && (
        <MintSuccessDialog result={mintResult} onClose={() => setMintResult(null)} />
      )}
```

- [ ] **Step 4: Run it, expect PASS**

```
cd petal-pixel-studio && npx vitest run src/pages/mintReceipt.test.ts src/stores/markMintedParams.test.ts
```

Expected: both files green (10 tests). Then run the pre-existing suites touched by the signature change to confirm no regression:

```
cd petal-pixel-studio && npx vitest run src/stores/markMintedByBackendFlowerId.test.ts src/pages/CreateFlower.save.test.tsx
```

MANUAL VERIFICATION (dialog):
1. Start the full stack (compose backend + MinIO, Anvil, `npm run dev` in petal-pixel-studio); MetaMask connected to Anvil Local (chain 1337).
2. On /create: generate a flower from a word, give it a title, click Save, then click Mint NFT and approve the tx in MetaMask.
3. Expected: after confirmation, the "NFT minted" dialog opens showing Token ID (an integer, matching the contract's next id), Contract (equals backend `NFT_CONTRACT_ADDRESS`), Tx hash (matches the "Mint tx sent" toast), and a metadata.json link that opens the tokenUri in a new tab (image field populated when snapshot upload succeeded).
4. Each Copy button writes its value to the clipboard and shows a "… copied" toast.
5. The MetaMask hint block shows exactly 3 numbered lines; the X button and overlay click both close the dialog.
6. In devtools console: `JSON.parse(localStorage.getItem('petal-pixel-flowers')).state.savedFlowers.at(-1).params.mintTokenId` returns the Token ID shown in the dialog; My Flowers shows the flower as minted after reload.

- [ ] **Step 5: Commit**

```
git add petal-pixel-studio/src/pages/mintReceipt.ts petal-pixel-studio/src/pages/mintReceipt.test.ts petal-pixel-studio/src/stores/markMintedParams.test.ts petal-pixel-studio/src/stores/flowerStore.ts petal-pixel-studio/src/integrations/flowerBackend/client.ts petal-pixel-studio/src/pages/CreateFlower.tsx
git commit -m "feat(mint): snapshot upload, tokenId capture from Transfer event, post-mint dialog"
```

---

### Task 4: Studio pack — "Surprise me" dice button + family/palette badges over the canvas

**Files:**
- Create: `petal-pixel-studio/src/pages/surpriseNames.ts`
- Create: `petal-pixel-studio/src/pages/surpriseNames.test.ts`
- Create: `petal-pixel-studio/src/components/flower/badgeGradient.ts`
- Create: `petal-pixel-studio/src/components/flower/badgeGradient.test.ts`
- Create: `petal-pixel-studio/src/components/flower/FlowerBadges.tsx`
- Modify: `petal-pixel-studio/src/pages/CreateFlower.tsx` (input row ~line 548-568, `handleGenerate` ~line 383, imports ~line 8, canvas area ~line 667)

**Interfaces:**
- Consumes: `useFlowerStore` state `params.family?: FlowerFamily`, `params.palette?: Palette`, `params.flowerType: FlowerType` (from `src/stores/flowerStore.ts` lines 30, 52-53); `PaletteStop { pos: number; hex: string }` from `@/math/palette`; existing guard chain in CreateFlower.tsx (`isGenerating` early-return, `shouldWarnRegenerate(...)` → `RegenerateWarningDialog` → `handleConfirmRegenerate`); word sanitizer contract from `handleWordInputChange` (`value.replace(/\s+/g, ' ').slice(0, 64)`).
- Produces: `SURPRISE_NAMES: readonly string[]` (~40 entries) and `pickSurpriseName(random?: () => number): string` from `surpriseNames.ts`; `stopsToGradient(stops: PaletteStop[]): string` from `badgeGradient.ts`; `FlowerBadges(): JSX.Element` component; `handleGenerate` signature widened to `(overrideWord?: string) => Promise<void>` (existing zero-arg callers unaffected).

- [ ] **Step 1: Write the failing test**

`petal-pixel-studio/src/pages/surpriseNames.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { SURPRISE_NAMES, pickSurpriseName } from "@/pages/surpriseNames";

describe("SURPRISE_NAMES", () => {
  it("has at least 40 curated entries", () => {
    expect(SURPRISE_NAMES.length).toBeGreaterThanOrEqual(40);
  });

  it("every entry already conforms to the word-input sanitizer (trimmed, single spaces, <= 64 chars)", () => {
    // handleWordInputChange applies value.replace(/\s+/g, ' ').slice(0, 64);
    // the dice path bypasses that handler via setWordInput, so entries must be pre-sanitized.
    for (const name of SURPRISE_NAMES) {
      expect(name).toBe(name.trim());
      expect(name.length).toBeGreaterThan(0);
      expect(name.length).toBeLessThanOrEqual(64);
      expect(/\s{2,}/.test(name)).toBe(false);
      expect(name.includes("\n")).toBe(false);
    }
  });

  it("includes at least one Cyrillic human name", () => {
    expect(SURPRISE_NAMES.some((n) => /[\u0400-\u04FF]/.test(n))).toBe(true);
  });

  it("has no duplicate entries", () => {
    expect(new Set(SURPRISE_NAMES).size).toBe(SURPRISE_NAMES.length);
  });
});

describe("pickSurpriseName", () => {
  it("returns the first entry when rng yields 0", () => {
    expect(pickSurpriseName(() => 0)).toBe(SURPRISE_NAMES[0]);
  });

  it("returns the last entry when rng approaches 1", () => {
    expect(pickSurpriseName(() => 0.999999)).toBe(SURPRISE_NAMES[SURPRISE_NAMES.length - 1]);
  });

  it("always returns a member of the list with the default rng", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(SURPRISE_NAMES).toContain(pickSurpriseName());
    }
  });
});
```

`petal-pixel-studio/src/components/flower/badgeGradient.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { stopsToGradient } from "@/components/flower/badgeGradient";
import type { PaletteStop } from "@/math/palette";

const FOUR_STOPS: PaletteStop[] = [
  { pos: 0, hex: "#ff0000" },
  { pos: 0.33, hex: "#00ff00" },
  { pos: 0.66, hex: "#0000ff" },
  { pos: 1, hex: "#ffffff" },
];

describe("stopsToGradient", () => {
  it("builds a left-to-right linear-gradient with whole-percent positions", () => {
    expect(stopsToGradient(FOUR_STOPS)).toBe(
      "linear-gradient(90deg, #ff0000 0%, #00ff00 33%, #0000ff 66%, #ffffff 100%)",
    );
  });

  it("rounds fractional positions to the nearest whole percent", () => {
    const stops: PaletteStop[] = [
      { pos: 0, hex: "#111111" },
      { pos: 0.666, hex: "#222222" },
      { pos: 1, hex: "#333333" },
    ];
    expect(stopsToGradient(stops)).toBe(
      "linear-gradient(90deg, #111111 0%, #222222 67%, #333333 100%)",
    );
  });

  it("degrades an empty stop list to a flat neutral color (mirrors samplePalette guard)", () => {
    expect(stopsToGradient([])).toBe("#808080");
  });

  it("degrades a single-stop palette to that flat color", () => {
    expect(stopsToGradient([{ pos: 0, hex: "#abcdef" }])).toBe("#abcdef");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**
```bash
cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio" && npx vitest run src/pages/surpriseNames.test.ts src/components/flower/badgeGradient.test.ts
```
Expected: both suites fail at import time with `Error: Failed to resolve import "@/pages/surpriseNames"` and `Failed to resolve import "@/components/flower/badgeGradient"` (modules do not exist yet).

- [ ] **Step 3: Implement**

`petal-pixel-studio/src/pages/surpriseNames.ts` (new):
```ts
/**
 * Curated seed names for the "Surprise me" dice on CreateFlower.
 * Contract: every entry is pre-sanitized for the word input — trimmed,
 * single internal spaces, <= 64 chars — because the dice path calls
 * setWordInput() directly, bypassing handleWordInputChange's sanitizer.
 */
export const SURPRISE_NAMES: readonly string[] = [
  // Human names — Latin
  "Amelie",
  "Sofia",
  "Marcus",
  "Yuki",
  "Leilani",
  "Ravi",
  "Ingrid",
  "Mateo",
  "Zara",
  "Kenji",
  // Human names — Cyrillic
  "Аружан",
  "Айгерім",
  "Данияр",
  "Светлана",
  "Тимур",
  "Алия",
  "Мирослава",
  "Ержан",
  "Катя",
  "Богдан",
  // Evocative phrases
  "midnight aurora",
  "ember and frost",
  "quiet supernova",
  "salt of the cosmos",
  "velvet thunder",
  "paper lantern moon",
  "glass garden",
  "the last summer rain",
  "neon chrysalis",
  "wandering comet",
  "honey and iron",
  "tidal bloom",
  "borealis whisper",
  "saffron dusk",
  "electric marigold",
  "fossil light",
  "cinder song",
  "opaline drift",
  "gravity's lullaby",
  "winter peony",
] as const;

/** Pick a random entry. `random` is injectable for deterministic tests. */
export function pickSurpriseName(random: () => number = Math.random): string {
  const index = Math.min(
    SURPRISE_NAMES.length - 1,
    Math.floor(random() * SURPRISE_NAMES.length),
  );
  return SURPRISE_NAMES[index];
}
```

`petal-pixel-studio/src/components/flower/badgeGradient.ts` (new):
```ts
import type { PaletteStop } from "@/math/palette";

/**
 * Convert palette stops into a CSS background value for the badge swatch strip.
 * Degenerate guards mirror samplePaletteInto (src/math/palette.ts): an empty
 * list yields flat neutral gray, a single stop yields that flat color, so a
 * malformed persisted palette can never produce an invalid CSS gradient.
 */
export function stopsToGradient(stops: PaletteStop[]): string {
  if (!stops || stops.length === 0) return "#808080";
  if (stops.length === 1) return stops[0].hex;
  const parts = stops.map((s) => `${s.hex} ${Math.round(s.pos * 100)}%`);
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}
```

`petal-pixel-studio/src/components/flower/FlowerBadges.tsx` (new):
```tsx
import { useFlowerStore } from "@/stores/flowerStore";
import { stopsToGradient } from "./badgeGradient";

/**
 * Small overlay chips over the 3D canvas: the flower family (v2) or
 * flowerType (v1 fallback — v1 records have neither family nor palette),
 * and, when a v2 palette exists, its id with a CSS-gradient swatch strip.
 * pointer-events-none so OrbitControls drag/zoom is never blocked.
 */
export function FlowerBadges() {
  const family = useFlowerStore((s) => s.params.family);
  const flowerType = useFlowerStore((s) => s.params.flowerType);
  const palette = useFlowerStore((s) => s.params.palette);

  const familyLabel = family ?? flowerType;

  return (
    <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 pointer-events-none">
      <span className="glass-panel rounded-full px-2.5 py-1 text-[10px] font-mono text-foreground capitalize">
        {familyLabel}
      </span>
      {palette && palette.stops.length > 0 && (
        <span className="glass-panel rounded-full pl-2.5 pr-1.5 py-1 text-[10px] font-mono text-muted-foreground flex items-center gap-1.5">
          {palette.id}
          <span
            aria-hidden
            className="inline-block w-12 h-2 rounded-full border border-border/60"
            style={{ background: stopsToGradient(palette.stops) }}
          />
        </span>
      )}
    </div>
  );
}
```

`petal-pixel-studio/src/pages/CreateFlower.tsx` — four edits:

Edit 1 — imports (line 8 lucide import, and add the two new imports after line 6):
```tsx
// before:
import { Sparkles, Save, Gem, BarChart3, X, Copy, ExternalLink, AlertTriangle, Pencil, Wallet } from 'lucide-react';
// after:
import { Sparkles, Save, Gem, BarChart3, X, Copy, ExternalLink, AlertTriangle, Pencil, Wallet, Dices } from 'lucide-react';
```
and below `import { FlowerInfo } from '@/components/flower/FlowerInfo';`:
```tsx
import { FlowerBadges } from '@/components/flower/FlowerBadges';
import { pickSurpriseName } from './surpriseNames';
```

Edit 2 — widen `handleGenerate` (line ~383) so the dice can pass the freshly picked name without racing React state (setWordInput is async; reading `wordInput` immediately after would be stale). The regen-dialog confirm path stays on `wordInput.trim()`, which is correct because state has settled by the time the dialog renders:
```tsx
// before:
  const handleGenerate = async () => {
    if (isGenerating) return;
    const word = wordInput.trim();
// after:
  const handleGenerate = async (overrideWord?: string) => {
    if (isGenerating) return;
    const word = (overrideWord ?? wordInput).trim();
```
(the rest of the function body — the empty-word toast, `shouldWarnRegenerate(isEditMode, word, generationWord, paramsDirty)` gate, and `await doGenerate(word)` — is unchanged; existing `void handleGenerate()` call sites at the input's onKeyDown and the Generate button need no edits.)

Then add the dice handler directly below `handleConfirmRegenerate` (line ~401):
```tsx
  const handleSurpriseMe = () => {
    if (isGenerating) return;
    const name = pickSurpriseName();
    setWordInput(name); // entries are pre-sanitized to the input's contract
    void handleGenerate(name); // same guarded path: isGenerating + regen dialog
  };
```

Edit 3 — dice button in the name-input row, between the `<input>` and the Generate button (inside the `flex items-center gap-1.5 bg-secondary rounded-lg ... max-w-[260px]` group, line ~549-567):
```tsx
              <button
                onClick={handleSurpriseMe}
                disabled={isGenerating}
                title="Surprise me"
                aria-label="Surprise me"
                className="shrink-0 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Dices className="w-3.5 h-3.5" />
              </button>
```

Edit 4 — mount the badges over the canvas (line ~667-669):
```tsx
// before:
        <div className="flex-1 relative">
          <FlowerCanvas />
          <FlowerInfo />
// after:
        <div className="flex-1 relative">
          <FlowerCanvas />
          <FlowerBadges />
          <FlowerInfo />
```
(FlowerInfo sits bottom-left, the math button bottom-right; badges take top-left — no overlap.)

- [ ] **Step 4: Run it, expect PASS**
```bash
cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio" && npx vitest run src/pages/surpriseNames.test.ts src/components/flower/badgeGradient.test.ts
```
Expected: 2 test files, all tests pass. Then confirm no regressions in the page's existing suites:
```bash
cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio" && npx vitest run src/pages/CreateFlower.save.test.tsx src/pages/createFlowerGuards.test.ts
```
Expected: all pass (no behavior change for zero-arg `handleGenerate` callers).

MANUAL VERIFICATION (overlay + dice, requires running backend):
1. Start the stack (Docker compose backend + `cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio" && npm run dev`, open http://localhost:8080/create).
2. Click the dice icon inside the name-input group. Expected: a curated name (occasionally Cyrillic, e.g. "Аружан") appears in the input, the Generate button flips to "Generating...", then toast "Flower generated from backend".
3. After generation, top-left of the canvas shows two chips: the family (e.g. "Sunflower"/"Rhodonea", capitalized) and the palette id next to a horizontal gradient strip whose colors match the rendered petals.
4. Double-click the dice rapidly. Expected: only one generation fires (isGenerating guard); the dice is visually disabled while generating.
5. Edit-mode guard: My Flowers → Edit a saved flower → move any slider → click the dice. Expected: "Regenerate flower?" dialog appears (no immediate generation). Cancel keeps the current flower with the dice-picked name left in the input; clicking the dice again and confirming Regenerate generates from that name.
6. v1 fallback: Edit a flower saved before the v2 rollout (no `params.family`). Expected: the family chip shows its `flowerType` (e.g. "Rose") and NO palette chip is rendered; canvas interaction (orbit drag over the chips' area) still works.

- [ ] **Step 5: Commit**
```bash
cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel" && git add petal-pixel-studio/src/pages/surpriseNames.ts petal-pixel-studio/src/pages/surpriseNames.test.ts petal-pixel-studio/src/components/flower/badgeGradient.ts petal-pixel-studio/src/components/flower/badgeGradient.test.ts petal-pixel-studio/src/components/flower/FlowerBadges.tsx petal-pixel-studio/src/pages/CreateFlower.tsx && git commit -m "feat(studio): surprise-me name dice + family/palette badges over canvas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: NFT Collection — tokenId/contract/tx details + MetaMask import helper

**Files:**
- Create: `petal-pixel-studio/src/lib/truncate.ts`
- Create: `petal-pixel-studio/src/lib/truncate.test.ts`
- Modify: `petal-pixel-studio/src/pages/NftCollection.tsx` (full rewrite of card body + help block)
- Modify (only if the mint task hasn't landed yet): `petal-pixel-studio/src/stores/flowerStore.ts` — additive optional fields on `FlowerParams`

**Interfaces:**
- Produces: `truncateMiddle(str: string, keep?: number): string` — keeps `keep` (default 6) chars on each side, joins with a single `…`; returns `str` unchanged when `keep <= 0` or `str.length <= keep * 2 + 1`.
- Consumes: `useFlowerStore((s) => s.savedFlowers): SavedFlower[]` and `SavedFlower { title, generationWord, params, isMinted, txHash?, tokenUri? }` from `@/stores/flowerStore`; shared-contract mint fields `FlowerParams.mintTokenId?: number` / `FlowerParams.mintContractAddress?: string` (written at mint time by the CreateFlower mint task); `params.family?: FlowerFamily` + `params.palette?: Palette` (`{ id, stops: [{ pos, hex }] }` from `@/math/palette`) with v1 fallback to `params.flowerType` / `colorA→colorB`; `Collapsible`/`CollapsibleTrigger`/`CollapsibleContent` from `@/components/ui/collapsible`; `toast` from `sonner`; icons from `lucide-react`.

- [ ] **Step 1: Write the failing test**

Create `petal-pixel-studio/src/lib/truncate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { truncateMiddle } from "./truncate";

describe("truncateMiddle", () => {
  it("truncates a 66-char tx hash keeping 6 chars each side", () => {
    const hash =
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    expect(truncateMiddle(hash, 6)).toBe("0x1234…abcdef");
  });

  it("truncates a 42-char contract address", () => {
    expect(
      truncateMiddle("0x5FbDB2315678afecb367f032d93F642f64180aa3", 6),
    ).toBe("0x5FbD…180aa3");
  });

  it("defaults keep to 6", () => {
    expect(
      truncateMiddle("0x5FbDB2315678afecb367f032d93F642f64180aa3"),
    ).toBe("0x5FbD…180aa3");
  });

  it("respects a custom keep", () => {
    expect(
      truncateMiddle("0x5FbDB2315678afecb367f032d93F642f64180aa3", 4),
    ).toBe("0x5F…0aa3");
  });

  it("returns short strings unchanged", () => {
    expect(truncateMiddle("0xabc", 6)).toBe("0xabc");
  });

  it("returns a string of exactly keep*2+1 chars unchanged (no pointless ellipsis)", () => {
    expect(truncateMiddle("abcdefghijklm", 6)).toBe("abcdefghijklm"); // 13 chars
  });

  it("truncates once length exceeds keep*2+1", () => {
    expect(truncateMiddle("abcdefghijklmn", 6)).toBe("abcdef…ijklmn"); // 14 chars
  });

  it("returns empty string unchanged", () => {
    expect(truncateMiddle("", 6)).toBe("");
  });

  it("returns the input unchanged for non-positive keep", () => {
    expect(truncateMiddle("0xdeadbeef", 0)).toBe("0xdeadbeef");
    expect(truncateMiddle("0xdeadbeef", -2)).toBe("0xdeadbeef");
  });

  it("uses the single-char ellipsis U+2026, not three dots", () => {
    const out = truncateMiddle("abcdefghijklmnop", 4);
    expect(out).toContain("\u2026");
    expect(out).not.toContain("...");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

```bash
cd petal-pixel-studio && npx vitest run src/lib/truncate.test.ts
```

Expected: the run fails to load the test module — `Error: Failed to resolve import "./truncate" from "src/lib/truncate.test.ts"` (module does not exist yet). 0 tests pass.

- [ ] **Step 3: Implement**

3a. Create `petal-pixel-studio/src/lib/truncate.ts`:

```ts
/**
 * Truncate the middle of a long identifier (tx hash, address) keeping
 * `keep` characters on each side, joined by a single "…" (U+2026).
 * Strings already short enough (or non-positive `keep`) pass through unchanged.
 */
export function truncateMiddle(str: string, keep = 6): string {
  if (keep <= 0 || str.length <= keep * 2 + 1) return str;
  return `${str.slice(0, keep)}…${str.slice(-keep)}`;
}
```

3b. **Only if the mint task hasn't already added them** (check first — shared contract), extend `FlowerParams` in `petal-pixel-studio/src/stores/flowerStore.ts` right after the v2 additive fields block (after `superformulaParams?: SuperformulaParams;`, ~line 56):

```ts
  // mint results (set at mint time; persisted inside the params JSON round-trip — no DB migration)
  mintTokenId?: number;
  mintContractAddress?: string;
```

3c. Rewrite `petal-pixel-studio/src/pages/NftCollection.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useFlowerStore, type SavedFlower } from '@/stores/flowerStore';
import { truncateMiddle } from '@/lib/truncate';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Gem, ExternalLink, Copy, ChevronDown, Wallet } from 'lucide-react';
import { toast } from 'sonner';

/** v2: real palette band; v1: colorA→colorB fallback so the band never renders empty. */
function paletteGradient(flower: SavedFlower): string {
  const stops = flower.params.palette?.stops;
  if (stops && stops.length >= 2) {
    return `linear-gradient(90deg, ${stops
      .map((s) => `${s.hex} ${Math.round(s.pos * 100)}%`)
      .join(', ')})`;
  }
  return `linear-gradient(90deg, ${flower.params.colorA}, ${flower.params.colorB})`;
}

function DetailRow({
  tag,
  tagClass,
  display,
  copyValue,
  copyLabel,
}: {
  tag: string;
  tagClass: string;
  display: string;
  copyValue?: string;
  copyLabel?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-[10px] font-semibold shrink-0 ${tagClass}`}>{tag}</span>
      <span className="text-[10px] text-muted-foreground font-mono truncate">{display}</span>
      {copyValue !== undefined && copyLabel && (
        <button
          onClick={() => {
            void navigator.clipboard.writeText(copyValue);
            toast.success(`${copyLabel} copied`);
          }}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          title={`Copy ${copyLabel.toLowerCase()}`}
        >
          <Copy className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function MetaMaskHelp() {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="bg-card rounded-xl border border-border max-w-xl"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between p-4 text-sm font-semibold text-foreground">
        <span className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary" /> How to see it in MetaMask
        </span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">
        <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground">
          <li>
            Open MetaMask and switch to the{' '}
            <span className="text-foreground font-medium">NFTs</span> tab.
          </li>
          <li>
            Click <span className="text-foreground font-medium">Import NFT</span>.
          </li>
          <li>
            Paste the <span className="text-foreground font-medium">contract address</span> and{' '}
            <span className="text-foreground font-medium">Token ID</span> from the card above
            (use the copy buttons).
          </li>
        </ol>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Token ids start at <span className="font-mono text-foreground">0</span> and increment
          in mint order. Full local-chain walkthrough (Anvil network, dev account, gotchas):{' '}
          <span className="font-mono text-foreground">docs/MINTING.md</span>.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function NftCollection() {
  const savedFlowers = useFlowerStore((s) => s.savedFlowers);
  const mintedFlowers = useMemo(() => savedFlowers.filter((f) => f.isMinted), [savedFlowers]);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">NFT Collection</h1>
        <p className="text-sm text-muted-foreground mt-1">Your minted flower NFTs on the blockchain</p>
      </div>

      {mintedFlowers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Gem className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">No minted NFTs yet. Create and mint your first flower!</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {mintedFlowers.map((flower, i) => (
            <motion.div
              key={flower.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className="bg-card rounded-xl border border-border overflow-hidden group"
            >
              <div
                className="h-40 relative"
                style={{
                  background: `radial-gradient(ellipse at center, ${flower.params.colorA}33 0%, transparent 70%), linear-gradient(135deg, hsl(240 10% 6%), hsl(240 10% 3%))`,
                }}
              >
                <div className="absolute inset-0 grid-bg opacity-20" />
                <div className="absolute top-3 left-3 flex items-center gap-1 bg-primary/20 text-primary text-[10px] px-2 py-1 rounded-full backdrop-blur-sm">
                  <Gem className="w-3 h-3" /> Verified NFT
                </div>
                <div className="absolute top-3 right-3 bg-secondary/60 text-secondary-foreground text-[10px] px-2 py-1 rounded-full backdrop-blur-sm capitalize">
                  {flower.params.family ?? flower.params.flowerType}
                </div>
              </div>

              {/* palette gradient preview band */}
              <div
                className="h-2"
                style={{ background: paletteGradient(flower) }}
                title={flower.params.palette?.id}
              />

              <div className="p-4 space-y-2">
                <h3 className="text-sm font-semibold text-foreground">{flower.title}</h3>
                <p className="text-[10px] text-muted-foreground">
                  Word:{' '}
                  <span className="font-medium text-foreground font-mono">{flower.generationWord}</span>
                </p>

                <DetailRow
                  tag="ID"
                  tagClass="text-primary"
                  display={
                    flower.params.mintTokenId !== undefined
                      ? `#${flower.params.mintTokenId}`
                      : '—'
                  }
                  copyValue={
                    flower.params.mintTokenId !== undefined
                      ? String(flower.params.mintTokenId)
                      : undefined
                  }
                  copyLabel="Token ID"
                />

                {flower.params.mintContractAddress && (
                  <DetailRow
                    tag="CA"
                    tagClass="text-sky-400"
                    display={truncateMiddle(flower.params.mintContractAddress, 6)}
                    copyValue={flower.params.mintContractAddress}
                    copyLabel="Contract address"
                  />
                )}

                {flower.txHash && (
                  <DetailRow
                    tag="TX"
                    tagClass="text-emerald-400"
                    display={truncateMiddle(flower.txHash, 6)}
                    copyValue={flower.txHash}
                    copyLabel="Tx hash"
                  />
                )}

                {flower.tokenUri ? (
                  <a
                    href={flower.tokenUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[10px] text-primary hover:underline mt-1"
                  >
                    Metadata <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-1">
                    <ExternalLink className="w-3 h-3" /> No metadata URI
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <MetaMaskHelp />
    </div>
  );
}
```

- [ ] **Step 4: Run it, expect PASS**

```bash
cd petal-pixel-studio && npx vitest run src/lib/truncate.test.ts
```

Expected: 10 tests pass, 0 fail.

**MANUAL VERIFICATION (page — route `/nfts`):**
1. `docker compose up -d` from the repo root; open http://localhost:8080, log in.
2. If no minted flower exists, mint one per `docs/MINTING.md` (Create → Generate → Save → Mint, confirm in MetaMask on Anvil account #0).
3. Open **NFT Collection** (`/nfts`). Expected per card:
   - family chip top-right (v2 family name, e.g. `sunflower`; a v1-era flower shows its `flowerType`, e.g. `classic`);
   - a thin horizontal gradient band under the preview (v2: palette stops left→right; v1: colorA→colorB);
   - `ID #0` (or `—` for flowers minted before the mint-details task) with a copy button when known;
   - `CA 0x5FbD…180aa3` row with copy button — row entirely absent when `mintContractAddress` is unset (old mints);
   - `TX 0x…` truncated to 6+6 chars with copy button;
   - `Metadata` link opening `http://localhost:9000/flower/metadata/<flowerId>.json` in a new tab.
4. Click each copy button → sonner toast (`Token ID copied` / `Contract address copied` / `Tx hash copied`) and the FULL untruncated value lands in the clipboard (paste to verify).
5. Click **How to see it in MetaMask** → panel expands showing the 3 numbered steps, the "ids start at 0" note, and the `docs/MINTING.md` reference; chevron rotates; clicking again collapses it.
6. Sanity: with a fresh account (no mints), the empty state (Gem icon + "No minted NFTs yet…") still renders, with the help block below it.

- [ ] **Step 5: Commit**

```bash
git add petal-pixel-studio/src/lib/truncate.ts petal-pixel-studio/src/lib/truncate.test.ts petal-pixel-studio/src/pages/NftCollection.tsx petal-pixel-studio/src/stores/flowerStore.ts
git commit -m "feat(nft): richer collection cards (tokenId/contract/tx + palette band) and MetaMask import helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: My Flowers — search/filter/sort, inline rename, palette preview bands

**Files:**
- Create: `petal-pixel-studio/src/pages/myFlowersUtils.ts`
- Create: `petal-pixel-studio/src/pages/myFlowersUtils.test.ts`
- Modify: `petal-pixel-studio/src/pages/MyFlowers.tsx`
- Test: `petal-pixel-studio/src/pages/myFlowersUtils.test.ts` + manual verification of the page

**Interfaces:**
- Consumes: `useFlowerStore` → `savedFlowers: SavedFlower[]`, `updateFlowerTitle(id: string, newTitle: string): Promise<void>` (exists at `src/stores/flowerStore.ts:92`, already syncs to Supabase when `backendFlowerId` present), `loadFlowerForEdit`, `deleteFlower`; types `SavedFlower`, `FlowerParams` (`src/stores/flowerStore.ts:24-69` — `params.family?: FlowerFamily`, `params.palette?: Palette` are v2-only, absent on v1); `Palette`/`PaletteStop` shape from `src/math/palette.ts` (`stops: [{pos: 0..1, hex: "#rrggbb"}]`, backend guarantees ≥2 stops ascending); `DEFAULT_CLASSIC_PARAMS`, `DEFAULT_ROSE_PARAMS`, `DEFAULT_BLOOM_PARAMS` from `@/math/flowerTypes` (test factory only). `createdAt` is a `"YYYY-MM-DD"` string (`flowerStore.ts:399`), so lexicographic compare is chronologically correct.
- Produces (all exported from `src/pages/myFlowersUtils.ts`):
  - `type MintFilter = "all" | "minted" | "drafts"`
  - `type SortOrder = "newest" | "oldest" | "name"`
  - `interface FlowerFilters { search: string; mint: MintFilter; family: string }` (`family` is `"all"` or a family label)
  - `familyLabel(flower: SavedFlower): string` — `params.family ?? params.flowerType` (v1 fallback per shared contract)
  - `collectFamilies(flowers: SavedFlower[]): string[]` — unique labels present, alphabetical
  - `filterFlowers(flowers: SavedFlower[], filters: FlowerFilters): SavedFlower[]`
  - `sortFlowers(flowers: SavedFlower[], order: SortOrder): SavedFlower[]` — non-mutating
  - `previewGradient(params: FlowerParams): string` — CSS `linear-gradient(...)` from palette stops, fallback `colorA→colorB`

- [ ] **Step 1: Write the failing test**

Create `petal-pixel-studio/src/pages/myFlowersUtils.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  familyLabel,
  collectFamilies,
  filterFlowers,
  sortFlowers,
  previewGradient,
} from "./myFlowersUtils";
import type { SavedFlower, FlowerParams } from "@/stores/flowerStore";
import {
  DEFAULT_BLOOM_PARAMS,
  DEFAULT_CLASSIC_PARAMS,
  DEFAULT_ROSE_PARAMS,
} from "@/math/flowerTypes";

function makeParams(overrides: Partial<FlowerParams> = {}): FlowerParams {
  return {
    flowerId: "f-1",
    algoVersion: "v1",
    schemaVersion: "v1",
    seed: "0",
    flowerType: "classic",
    classicParams: { ...DEFAULT_CLASSIC_PARAMS },
    roseParams: { ...DEFAULT_ROSE_PARAMS },
    bloomParams: { ...DEFAULT_BLOOM_PARAMS },
    petalCount: 8,
    petalLength: 1,
    petalSharpness: 0.5,
    noiseIntensity: 0,
    frequency: 1,
    rotation: 0,
    symmetry: 1,
    colorA: "#ff0000",
    colorB: "#0000ff",
    glowIntensity: 0.5,
    material: "matte",
    idleMotion: false,
    rotationSpeed: 0,
    stemEnabled: false,
    ...overrides,
  };
}

let counter = 0;
function makeFlower(
  overrides: Partial<SavedFlower> = {},
  paramOverrides: Partial<FlowerParams> = {},
): SavedFlower {
  counter += 1;
  return {
    id: `id-${counter}`,
    title: "Celestial Bloom",
    generationWord: "rose",
    params: makeParams(paramOverrides),
    createdAt: "2026-07-01",
    isMinted: false,
    ...overrides,
  };
}

describe("familyLabel (v1/v2 badge fallback)", () => {
  it("returns params.family for v2 flowers", () => {
    const f = makeFlower({}, { family: "sunflower" });
    expect(familyLabel(f)).toBe("sunflower");
  });

  it("falls back to flowerType for v1 flowers (no family field)", () => {
    const f = makeFlower({}, { flowerType: "camellia", family: undefined });
    expect(familyLabel(f)).toBe("camellia");
  });
});

describe("collectFamilies", () => {
  it("dedupes and sorts labels, mixing v1 flowerTypes and v2 families", () => {
    const flowers = [
      makeFlower({}, { family: "sunflower" }),
      makeFlower({}, { flowerType: "camellia" }), // v1
      makeFlower({}, { family: "sunflower" }),
      makeFlower({}, { family: "rhodonea" }),
    ];
    expect(collectFamilies(flowers)).toEqual(["camellia", "rhodonea", "sunflower"]);
  });

  it("returns empty array for empty collection", () => {
    expect(collectFamilies([])).toEqual([]);
  });
});

describe("filterFlowers", () => {
  const base = { search: "", mint: "all" as const, family: "all" };

  it("matches title case-insensitively", () => {
    const a = makeFlower({ title: "Celestial Rose" });
    const b = makeFlower({ title: "Phantom Dahlia" });
    expect(filterFlowers([a, b], { ...base, search: "celest" })).toEqual([a]);
    expect(filterFlowers([a, b], { ...base, search: "PHANTOM" })).toEqual([b]);
  });

  it("matches generationWord too", () => {
    const a = makeFlower({ title: "Untitled", generationWord: "serenity" });
    const b = makeFlower({ title: "Untitled", generationWord: "chaos" });
    expect(filterFlowers([a, b], { ...base, search: "seren" })).toEqual([a]);
  });

  it("whitespace-only search matches everything", () => {
    const flowers = [makeFlower(), makeFlower()];
    expect(filterFlowers(flowers, { ...base, search: "   " })).toEqual(flowers);
  });

  it("returns empty for a non-matching query", () => {
    expect(filterFlowers([makeFlower()], { ...base, search: "zzz-no-match" })).toEqual([]);
  });

  it("mint filter: minted keeps only minted, drafts keeps only unminted", () => {
    const minted = makeFlower({ isMinted: true });
    const draft = makeFlower({ isMinted: false });
    expect(filterFlowers([minted, draft], { ...base, mint: "minted" })).toEqual([minted]);
    expect(filterFlowers([minted, draft], { ...base, mint: "drafts" })).toEqual([draft]);
    expect(filterFlowers([minted, draft], { ...base, mint: "all" })).toEqual([minted, draft]);
  });

  it("family filter matches v2 family and v1 flowerType fallback", () => {
    const v2 = makeFlower({}, { family: "superformula" });
    const v1 = makeFlower({}, { flowerType: "lotus" });
    expect(filterFlowers([v2, v1], { ...base, family: "superformula" })).toEqual([v2]);
    expect(filterFlowers([v2, v1], { ...base, family: "lotus" })).toEqual([v1]);
  });

  it("combines search + mint + family", () => {
    const hit = makeFlower({ title: "Aurora Sunflower", isMinted: true }, { family: "sunflower" });
    const wrongMint = makeFlower({ title: "Aurora Sunflower", isMinted: false }, { family: "sunflower" });
    const wrongFamily = makeFlower({ title: "Aurora Rose", isMinted: true }, { family: "rose" });
    expect(
      filterFlowers([hit, wrongMint, wrongFamily], { search: "aurora", mint: "minted", family: "sunflower" }),
    ).toEqual([hit]);
  });
});

describe("sortFlowers", () => {
  const older = makeFlower({ title: "Beta", createdAt: "2026-06-01" });
  const newer = makeFlower({ title: "alpha", createdAt: "2026-07-05" });
  const middle = makeFlower({ title: "Gamma", createdAt: "2026-06-20" });

  it("newest: descending by createdAt", () => {
    expect(sortFlowers([older, newer, middle], "newest")).toEqual([newer, middle, older]);
  });

  it("oldest: ascending by createdAt", () => {
    expect(sortFlowers([newer, older, middle], "oldest")).toEqual([older, middle, newer]);
  });

  it("name: A-Z case-insensitive", () => {
    expect(sortFlowers([middle, older, newer], "name")).toEqual([newer, older, middle]);
  });

  it("does not mutate the input array", () => {
    const input = [newer, older];
    sortFlowers(input, "oldest");
    expect(input).toEqual([newer, older]);
  });
});

describe("previewGradient", () => {
  it("builds a multi-stop gradient from v2 palette stops", () => {
    const params = makeParams({
      palette: {
        id: "ember",
        stops: [
          { pos: 0, hex: "#ff0066" },
          { pos: 0.5, hex: "#ffaa00" },
          { pos: 1, hex: "#ffffff" },
        ],
      },
    });
    expect(previewGradient(params)).toBe(
      "linear-gradient(90deg, #ff0066 0%, #ffaa00 50%, #ffffff 100%)",
    );
  });

  it("falls back to colorA->colorB for v1 flowers (no palette)", () => {
    const params = makeParams({ palette: undefined, colorA: "#ff0000", colorB: "#0000ff" });
    expect(previewGradient(params)).toBe(
      "linear-gradient(90deg, #ff0000 0%, #0000ff 100%)",
    );
  });

  it("falls back for a degenerate palette with fewer than 2 stops", () => {
    const params = makeParams({
      palette: { id: "broken", stops: [{ pos: 0, hex: "#123456" }] },
      colorA: "#ff0000",
      colorB: "#0000ff",
    });
    expect(previewGradient(params)).toBe(
      "linear-gradient(90deg, #ff0000 0%, #0000ff 100%)",
    );
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

```bash
cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio" && npx vitest run src/pages/myFlowersUtils.test.ts
```

Expected: the suite fails to load with `Failed to resolve import "./myFlowersUtils" from "src/pages/myFlowersUtils.test.ts"` (the module does not exist yet).

- [ ] **Step 3: Implement**

**3a.** Create `petal-pixel-studio/src/pages/myFlowersUtils.ts`:

```ts
import type { SavedFlower, FlowerParams } from "@/stores/flowerStore";

export type MintFilter = "all" | "minted" | "drafts";
export type SortOrder = "newest" | "oldest" | "name";

export interface FlowerFilters {
  search: string;
  /** "all" | "minted" | "drafts" */
  mint: MintFilter;
  /** "all" or a family label as returned by familyLabel() */
  family: string;
}

/**
 * v2 flowers carry params.family (FlowerFamily); v1 flowers predate it and are
 * grouped under their flowerType (shared-contract badge fallback).
 */
export function familyLabel(flower: SavedFlower): string {
  return flower.params.family ?? flower.params.flowerType;
}

/** Unique family labels present in the collection, alphabetical. */
export function collectFamilies(flowers: SavedFlower[]): string[] {
  return [...new Set(flowers.map(familyLabel))].sort((a, b) => a.localeCompare(b));
}

export function filterFlowers(flowers: SavedFlower[], filters: FlowerFilters): SavedFlower[] {
  const query = filters.search.trim().toLowerCase();
  return flowers.filter((f) => {
    if (
      query &&
      !f.title.toLowerCase().includes(query) &&
      !f.generationWord.toLowerCase().includes(query)
    ) {
      return false;
    }
    if (filters.mint === "minted" && !f.isMinted) return false;
    if (filters.mint === "drafts" && f.isMinted) return false;
    if (filters.family !== "all" && familyLabel(f) !== filters.family) return false;
    return true;
  });
}

/**
 * Non-mutating sort. createdAt is a "YYYY-MM-DD" string (flowerStore saveFlower),
 * so lexicographic compare is chronologically correct; ties keep insertion order
 * (Array.prototype.sort is stable).
 */
export function sortFlowers(flowers: SavedFlower[], order: SortOrder): SavedFlower[] {
  const copy = [...flowers];
  switch (order) {
    case "newest":
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case "oldest":
      return copy.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "name":
      return copy.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  }
}

/**
 * CSS background for the card preview band.
 * v2: linear gradient over palette stops (pos 0..1 -> percent).
 * v1 / degenerate palette (<2 stops): colorA -> colorB.
 */
export function previewGradient(params: FlowerParams): string {
  const stops = params.palette?.stops;
  if (stops && stops.length >= 2) {
    const parts = stops.map((s) => `${s.hex} ${Math.round(s.pos * 100)}%`).join(", ");
    return `linear-gradient(90deg, ${parts})`;
  }
  return `linear-gradient(90deg, ${params.colorA} 0%, ${params.colorB} 100%)`;
}
```

**3b.** Replace `petal-pixel-studio/src/pages/MyFlowers.tsx` with (DeleteConfirmDialog body is unchanged from current file; everything else is new/reworked):

```tsx
import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useFlowerStore, type SavedFlower } from '@/stores/flowerStore';
import { Gem, Calendar, Flower2, Trash2, AlertTriangle, Pencil, Search, SearchX } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  collectFamilies,
  familyLabel,
  filterFlowers,
  previewGradient,
  sortFlowers,
  type MintFilter,
  type SortOrder,
} from './myFlowersUtils';

function DeleteConfirmDialog({ flowerTitle, onConfirm, onCancel }: { flowerTitle: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Delete flower?</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          Are you sure you want to delete <span className="font-semibold text-foreground">{flowerTitle}</span>? This action cannot be undone.
        </p>
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={onCancel}
            className="text-xs px-4 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="text-xs px-4 py-2 rounded-lg bg-rose-500 text-white hover:bg-rose-600 transition-colors"
          >
            Delete
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  // Guards double-commit: Enter/Escape unmount the input, which also fires blur.
  const doneRef = useRef(false);
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          doneRef.current = true;
          onCommit(value);
        } else if (e.key === 'Escape') {
          doneRef.current = true;
          onCancel();
        }
      }}
      onBlur={() => {
        if (!doneRef.current) onCommit(value);
      }}
      aria-label="Rename flower"
      className="w-full bg-secondary text-sm font-semibold text-foreground rounded px-2 py-1 outline-none ring-1 ring-primary/40"
    />
  );
}

const selectClass =
  'bg-secondary text-xs text-foreground rounded-lg px-3 py-2 outline-none border border-border focus:ring-1 focus:ring-primary/40 cursor-pointer';

export default function MyFlowers() {
  const savedFlowers = useFlowerStore((s) => s.savedFlowers);
  const loadFlowerForEdit = useFlowerStore((s) => s.loadFlowerForEdit);
  const deleteFlower = useFlowerStore((s) => s.deleteFlower);
  const updateFlowerTitle = useFlowerStore((s) => s.updateFlowerTitle);
  const navigate = useNavigate();

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [mintFilter, setMintFilter] = useState<MintFilter>('all');
  const [familyFilter, setFamilyFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  const families = useMemo(() => collectFamilies(savedFlowers), [savedFlowers]);
  const visible = useMemo(
    () =>
      sortFlowers(
        filterFlowers(savedFlowers, { search, mint: mintFilter, family: familyFilter }),
        sortOrder,
      ),
    [savedFlowers, search, mintFilter, familyFilter, sortOrder],
  );

  const clearFilters = () => {
    setSearch('');
    setMintFilter('all');
    setFamilyFilter('all');
  };

  const handleEdit = (flower: SavedFlower) => {
    loadFlowerForEdit(flower);
    navigate('/create', { state: { isEditing: true } });
  };

  const handleDelete = async (id: string) => {
    await deleteFlower(id);
    setDeleteTarget(null);
    toast.success('Flower deleted');
  };

  const handleRenameCommit = async (id: string, raw: string) => {
    setRenamingId(null);
    const next = raw.trim();
    const current = savedFlowers.find((f) => f.id === id);
    if (!current || !next || next === current.title) return;
    await updateFlowerTitle(id, next);
    toast.success('Flower renamed');
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {deleteTarget && (
        <DeleteConfirmDialog
          flowerTitle={deleteTarget.title}
          onConfirm={() => void handleDelete(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div>
        <h1 className="text-2xl font-bold text-foreground">My Flowers</h1>
        <p className="text-sm text-muted-foreground mt-1">Your personal garden of generated flowers</p>
      </div>

      {savedFlowers.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or word…"
              aria-label="Search flowers"
              className="w-56 bg-secondary text-xs text-foreground rounded-lg pl-9 pr-3 py-2 outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary/40"
            />
          </div>

          <div className="flex items-center gap-1" role="group" aria-label="Mint status filter">
            {(['all', 'minted', 'drafts'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMintFilter(m)}
                className={`text-xs px-3 py-1.5 rounded-full transition-colors capitalize ${
                  mintFilter === m
                    ? 'bg-primary/15 text-primary'
                    : 'bg-secondary text-secondary-foreground hover:bg-muted'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <select
            value={familyFilter}
            onChange={(e) => setFamilyFilter(e.target.value)}
            aria-label="Filter by family"
            className={selectClass}
          >
            <option value="all">All families</option>
            {families.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            aria-label="Sort flowers"
            className={selectClass}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
      )}

      {savedFlowers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Flower2 className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground mb-1">No flowers yet.</p>
          <p className="text-xs text-muted-foreground/70">Create your first bloom to start your garden.</p>
        </div>
      )}

      {savedFlowers.length > 0 && visible.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <SearchX className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground mb-3">No flowers match your filters.</p>
          <button
            onClick={clearFilters}
            className="text-xs px-4 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
          >
            Clear filters
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {visible.map((flower, i) => (
          <motion.div
            key={flower.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 8) * 0.06 }}
            className="bg-card rounded-xl border border-border overflow-hidden hover:border-primary/30 transition-all group cursor-default relative"
            onDoubleClick={() => handleEdit(flower)}
          >
            <div
              className="h-48 relative overflow-hidden"
              style={{
                background: `radial-gradient(ellipse at center, ${flower.params.colorA}33 0%, transparent 70%), linear-gradient(135deg, hsl(240 10% 6%), hsl(240 10% 3%))`,
              }}
            >
              <div className="absolute inset-0 grid-bg opacity-30" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Flower2
                  className="w-16 h-16 opacity-40 group-hover:opacity-60 transition-opacity"
                  style={{ color: flower.params.colorA }}
                />
              </div>
              {flower.isMinted && (
                <div className="absolute top-3 right-3 flex items-center gap-1 bg-accent/20 text-accent-foreground text-[10px] px-2 py-1 rounded-full backdrop-blur-sm">
                  <Gem className="w-3 h-3" /> NFT
                </div>
              )}
              <div className="absolute bottom-3 left-3 text-[10px] px-2 py-0.5 rounded-full bg-black/40 text-white/80 backdrop-blur-sm capitalize">
                {familyLabel(flower)}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget({ id: flower.id, title: flower.title });
                }}
                className="absolute top-3 left-3 w-7 h-7 rounded-full bg-rose-500/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500/30"
                title="Delete flower"
              >
                <Trash2 className="w-3 h-3 text-rose-400" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit(flower);
                }}
                className="absolute bottom-3 right-3 flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                title="Edit flower"
              >
                <Pencil className="w-3 h-3" /> Edit
              </button>
            </div>

            <div className="h-1.5 w-full" style={{ background: previewGradient(flower.params) }} />

            <div className="p-4 space-y-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {renamingId === flower.id ? (
                  <RenameInput
                    initial={flower.title}
                    onCommit={(v) => void handleRenameCommit(flower.id, v)}
                    onCancel={() => setRenamingId(null)}
                  />
                ) : (
                  <>
                    <h3 className="text-sm font-semibold text-foreground truncate">{flower.title}</h3>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(flower.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
                      title="Rename flower"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Word: <span className="text-primary font-mono">{flower.generationWord}</span>
              </p>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Calendar className="w-3 h-3" /> {flower.createdAt}
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                    flower.isMinted
                      ? 'bg-primary/10 text-primary'
                      : 'bg-secondary text-secondary-foreground'
                  }`}
                >
                  {flower.isMinted ? 'Minted' : 'Draft'}
                </span>
              </div>
            </div>
          </motion.div>
        ))}

        <Link to="/create">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(visible.length, 8) * 0.06 }}
            className="bg-card rounded-xl border border-dashed border-border h-full min-h-[280px] flex flex-col items-center justify-center gap-3 hover:border-primary/30 transition-colors cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <Flower2 className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">Create New Flower</span>
          </motion.div>
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run it, expect PASS**

```bash
cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio" && npx vitest run src/pages/myFlowersUtils.test.ts
```

Expected: all tests pass (17 tests). Then run the full frontend suite to catch regressions:

```bash
cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio" && npx vitest run
```

**MANUAL VERIFICATION** (start the stack: `docker compose up -d --build` from the repo root, open http://localhost:8080, sign in, go to My Flowers; need ≥3 saved flowers including at least one v1 flower, one v2 flower, and one minted flower):
1. **Search**: type part of a flower's title — grid narrows to matching cards; type a generation word (e.g. "rose") — cards whose word matches appear; case does not matter. Type gibberish — "No flowers match your filters." appears with a Clear filters button; clicking it restores the full grid and resets chips/family select.
2. **Chips**: Minted shows only cards with the NFT badge; Drafts shows only unminted; All shows everything. Active chip renders with the primary tint.
3. **Family select**: lists only families present in the collection ("All families" first). A v1 flower appears under its flowerType (e.g. "camellia"). Selecting a family narrows the grid.
4. **Sort**: Newest first shows the most recent createdAt at top-left; Oldest first reverses; Name A–Z alphabetizes ignoring case.
5. **Inline rename**: hover a card — a small pencil appears next to the title; click it — an input appears prefilled and focused; type a new name + Enter — input closes, title updates, toast "Flower renamed" shows; reload the page — new title persists (zustand persist). Repeat with Escape — title unchanged, no toast. Repeat and click elsewhere (blur) — commits. Clearing the input to whitespace and pressing Enter leaves the title unchanged.
6. **Preview band + badge**: each card shows a thin gradient strip between the image and the info block — a v2 flower's strip shows its multi-stop palette colors; a v1 flower's strip is a two-color colorA→colorB gradient. The family chip sits bottom-left of the image area (family for v2, flowerType for v1).
7. **No regressions**: double-click card still opens the editor; clicks inside the rename input do NOT trigger edit; delete button + confirm dialog still work; the Create New Flower card is still present.

- [ ] **Step 5: Commit**

```bash
cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel" && git add petal-pixel-studio/src/pages/myFlowersUtils.ts petal-pixel-studio/src/pages/myFlowersUtils.test.ts petal-pixel-studio/src/pages/MyFlowers.tsx && git commit -m "feat(my-flowers): search/filter/sort, inline rename, palette preview bands

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Dashboard: family distribution bars, recent flowers strip, quick actions

**Files:**
- Create: `petal-pixel-studio/src/pages/dashboardStats.ts` (pure helpers)
- Create: `petal-pixel-studio/src/pages/dashboardStats.test.ts` (unit tests)
- Modify: `petal-pixel-studio/src/pages/Index.tsx` (dashboard UI — stat cards already exist at the top; the two static "Create a New Flower"/"Your Collection" cards at the bottom are replaced by the new sections)

**Interfaces:**
- Consumes: `SavedFlower`, `FlowerParams` (type-only imports from `@/stores/flowerStore` — erased at compile time, so the helper module stays free of supabase/grpc runtime deps); `params.family?: FlowerFamily` / `params.palette?: Palette` (v2-only, per shared contract — v1 flowers have neither and must degrade to `flowerType` + `colorA`/`colorB`); `useFlowerStore((s) => s.savedFlowers)` and `loadFlowerForEdit` (exact edit pattern from `MyFlowers.tsx` `handleEdit`: `loadFlowerForEdit(flower); navigate('/create', { state: { isEditing: true } })`).
- Produces:
  - `familyKey(params: FlowerParams): string` — `params.family ?? params.flowerType ?? "unknown"`
  - `familyDistribution(savedFlowers: SavedFlower[]): { key: string; count: number }[]` — sorted count desc, then key asc
  - `recentFlowers(savedFlowers: SavedFlower[], n?: number): SavedFlower[]` — newest first by `createdAt` (YYYY-MM-DD string), non-mutating, default n=4
  - `flowerGradient(params: FlowerParams): string` — CSS `linear-gradient(...)` from `palette.stops` (v2) or `colorA`→`colorB` (v1/degenerate palette)

- [ ] **Step 1: Write the failing test**

Create `petal-pixel-studio/src/pages/dashboardStats.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_BLOOM_PARAMS,
  DEFAULT_CLASSIC_PARAMS,
  DEFAULT_ROSE_PARAMS,
} from "@/math/flowerTypes";
import type { FlowerParams, SavedFlower } from "@/stores/flowerStore";
import { familyDistribution, familyKey, flowerGradient, recentFlowers } from "./dashboardStats";

function makeParams(overrides: Partial<FlowerParams> = {}): FlowerParams {
  return {
    flowerId: "f-1",
    algoVersion: "v1",
    schemaVersion: "v1",
    seed: "0",
    flowerType: "classic",
    classicParams: { ...DEFAULT_CLASSIC_PARAMS },
    roseParams: { ...DEFAULT_ROSE_PARAMS },
    bloomParams: { ...DEFAULT_BLOOM_PARAMS },
    petalCount: 6,
    petalLength: 1.2,
    petalSharpness: 0.5,
    noiseIntensity: 0.3,
    frequency: 2,
    rotation: 0,
    symmetry: 6,
    colorA: "#10b981",
    colorB: "#2563eb",
    glowIntensity: 0.5,
    material: "metallic",
    idleMotion: true,
    rotationSpeed: 0.5,
    stemEnabled: false,
    ...overrides,
  };
}

let nextId = 0;
function makeFlower(
  overrides: Partial<SavedFlower> = {},
  paramOverrides: Partial<FlowerParams> = {},
): SavedFlower {
  nextId += 1;
  return {
    id: `flower-${nextId}`,
    title: `Flower ${nextId}`,
    generationWord: "word",
    params: makeParams(paramOverrides),
    createdAt: "2026-07-01",
    isMinted: false,
    ...overrides,
  };
}

describe("familyKey", () => {
  it("prefers v2 family over v1 flowerType", () => {
    expect(familyKey(makeParams({ family: "sunflower", flowerType: "rose" }))).toBe("sunflower");
  });

  it("falls back to flowerType for v1 params (no family)", () => {
    expect(familyKey(makeParams({ flowerType: "dahlia" }))).toBe("dahlia");
  });
});

describe("familyDistribution", () => {
  it("counts a v1/v2 mix: v2 by params.family, v1 by params.flowerType, sorted count desc then key asc", () => {
    const flowers = [
      makeFlower({}, { algoVersion: "v2", family: "sunflower" }),
      makeFlower({}, { algoVersion: "v2", family: "sunflower" }),
      makeFlower({}, { algoVersion: "v2", family: "rhodonea" }),
      makeFlower({}, { flowerType: "rose" }), // v1 — no family
      makeFlower({}, { flowerType: "classic" }), // v1 — no family
    ];
    expect(familyDistribution(flowers)).toEqual([
      { key: "sunflower", count: 2 },
      { key: "classic", count: 1 },
      { key: "rhodonea", count: 1 },
      { key: "rose", count: 1 },
    ]);
  });

  it("returns [] for an empty garden", () => {
    expect(familyDistribution([])).toEqual([]);
  });
});

describe("recentFlowers", () => {
  it("returns the last 4 by createdAt, newest first", () => {
    const flowers = [
      makeFlower({ id: "a", createdAt: "2026-06-28" }),
      makeFlower({ id: "b", createdAt: "2026-07-03" }),
      makeFlower({ id: "c", createdAt: "2026-07-01" }),
      makeFlower({ id: "d", createdAt: "2026-06-30" }),
      makeFlower({ id: "e", createdAt: "2026-07-02" }),
    ];
    expect(recentFlowers(flowers, 4).map((f) => f.id)).toEqual(["b", "e", "c", "d"]);
  });

  it("defaults to 4 and does not mutate the input array", () => {
    const flowers = [
      makeFlower({ id: "a", createdAt: "2026-06-28" }),
      makeFlower({ id: "b", createdAt: "2026-07-03" }),
    ];
    expect(recentFlowers(flowers).map((f) => f.id)).toEqual(["b", "a"]);
    expect(flowers.map((f) => f.id)).toEqual(["a", "b"]);
  });
});

describe("flowerGradient", () => {
  it("builds a palette-stop gradient for v2 flowers", () => {
    const params = makeParams({
      palette: {
        id: "sunset_coral",
        stops: [
          { pos: 0, hex: "#ffb07c" },
          { pos: 0.5, hex: "#e0526b" },
          { pos: 1, hex: "#c2185b" },
        ],
      },
    });
    expect(flowerGradient(params)).toBe(
      "linear-gradient(135deg, #ffb07c 0%, #e0526b 50%, #c2185b 100%)",
    );
  });

  it("falls back to colorA→colorB for v1 flowers (no palette)", () => {
    expect(flowerGradient(makeParams())).toBe("linear-gradient(135deg, #10b981, #2563eb)");
  });

  it("falls back to colorA→colorB for a degenerate persisted palette (fewer than 2 stops)", () => {
    const params = makeParams({
      palette: { id: "broken", stops: [{ pos: 0, hex: "#ffffff" }] },
    });
    expect(flowerGradient(params)).toBe("linear-gradient(135deg, #10b981, #2563eb)");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

```bash
cd petal-pixel-studio && npx vitest run src/pages/dashboardStats.test.ts
```

Expected: FAIL — `Error: Failed to load ... Cannot find module './dashboardStats'` (module does not exist yet).

- [ ] **Step 3: Implement**

Create `petal-pixel-studio/src/pages/dashboardStats.ts`:

```ts
import type { FlowerParams, SavedFlower } from "@/stores/flowerStore";

export interface FamilyCount {
  /** `params.family` for v2 flowers, `params.flowerType` for v1 (per shared badge contract). */
  key: string;
  count: number;
}

/** Grouping key: v2 family when present, else v1 flowerType. Guards malformed persisted rows. */
export function familyKey(params: FlowerParams): string {
  return params.family ?? params.flowerType ?? "unknown";
}

/** Count flowers per family/flowerType, sorted by count desc then key asc (stable bar order). */
export function familyDistribution(savedFlowers: SavedFlower[]): FamilyCount[] {
  const counts = new Map<string, number>();
  for (const flower of savedFlowers) {
    const key = familyKey(flower.params);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/**
 * Newest `n` flowers by createdAt ("YYYY-MM-DD" — lexicographic == chronological).
 * Non-mutating; Array.prototype.sort is stable, so same-day flowers keep store order.
 */
export function recentFlowers(savedFlowers: SavedFlower[], n = 4): SavedFlower[] {
  return [...savedFlowers]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, n);
}

/**
 * CSS background for a flower thumbnail / bar tint.
 * v2: palette stops (pos 0..1 → percentage stops). v1 or degenerate palette
 * (< 2 stops on a legacy/malformed row): colorA→colorB fallback.
 */
export function flowerGradient(params: FlowerParams): string {
  const stops = params.palette?.stops;
  if (stops && stops.length >= 2) {
    const css = stops.map((s) => `${s.hex} ${Math.round(s.pos * 100)}%`).join(", ");
    return `linear-gradient(135deg, ${css})`;
  }
  return `linear-gradient(135deg, ${params.colorA}, ${params.colorB})`;
}
```

Replace `petal-pixel-studio/src/pages/Index.tsx` in full (header + 4 stat cards preserved verbatim; the bottom two static cards are replaced by quick actions, recent-flowers strip, and family-distribution bars):

```tsx
import { useMemo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Flower2, Gem, FileEdit, Activity, PlusCircle, ArrowRight, BarChart3, Clock } from 'lucide-react';
import { useFlowerStore } from '@/stores/flowerStore';
import { checkFlowerBackendHealth } from '@/integrations/flowerBackend/client';
import { familyDistribution, familyKey, flowerGradient, recentFlowers } from './dashboardStats';

export default function Index() {
  const savedFlowers = useFlowerStore((s) => s.savedFlowers);
  const loadFlowerForEdit = useFlowerStore((s) => s.loadFlowerForEdit);
  const navigate = useNavigate();
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  const totalFlowers = savedFlowers.length;
  const mintedCount = useMemo(() => savedFlowers.filter((f) => f.isMinted).length, [savedFlowers]);
  const draftCount = useMemo(() => savedFlowers.filter((f) => !f.isMinted).length, [savedFlowers]);

  const distribution = useMemo(() => familyDistribution(savedFlowers).slice(0, 6), [savedFlowers]);
  const maxCount = distribution[0]?.count ?? 1;
  const familyGradients = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of savedFlowers) {
      const key = familyKey(f.params);
      if (!map.has(key)) map.set(key, flowerGradient(f.params));
    }
    return map;
  }, [savedFlowers]);
  const recent = useMemo(() => recentFlowers(savedFlowers, 4), [savedFlowers]);

  // Same edit pattern as MyFlowers.handleEdit
  const handleEdit = (flower: typeof savedFlowers[number]) => {
    loadFlowerForEdit(flower);
    navigate('/create', { state: { isEditing: true } });
  };

  useEffect(() => {
    checkFlowerBackendHealth()
      .then((ok) => setBackendOnline(ok))
      .catch(() => setBackendOnline(false));
  }, []);

  const stats = [
    { label: 'Total Flowers', value: String(totalFlowers), icon: Flower2, color: 'text-primary' },
    { label: 'Minted NFTs', value: String(mintedCount), icon: Gem, color: 'text-accent' },
    { label: 'Drafts', value: String(draftCount), icon: FileEdit, color: 'text-primary' },
    {
      label: 'Backend',
      value: backendOnline === null ? '...' : backendOnline ? 'Online' : 'Offline',
      icon: Activity,
      color: backendOnline ? 'text-emerald-400' : backendOnline === false ? 'text-rose-400' : 'text-muted-foreground',
    },
  ];

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Welcome back! Here's your garden overview.</p>
        </div>
        <Link
          to="/create"
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <PlusCircle className="w-4 h-4" /> Create Flower
        </Link>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-card rounded-xl p-5 border border-border hover:border-primary/20 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="flex flex-wrap items-center gap-3"
      >
        <button
          onClick={() => navigate('/create')}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <PlusCircle className="w-4 h-4" /> Create new
        </button>
        <button
          onClick={() => navigate('/my-flowers')}
          className="flex items-center gap-2 bg-secondary text-secondary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
        >
          <FileEdit className="w-4 h-4" /> Continue drafts
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-mono">
            {draftCount}
          </span>
        </button>
      </motion.div>

      {/* Recent flowers */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" /> Recent flowers
          </h2>
          <Link to="/my-flowers" className="flex items-center gap-1 text-xs text-primary hover:underline">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No flowers yet — create your first bloom to start your garden.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {recent.map((flower) => (
              <button
                key={flower.id}
                onClick={() => handleEdit(flower)}
                className="bg-card rounded-xl border border-border overflow-hidden text-left hover:border-primary/30 transition-colors group"
                title={`Edit ${flower.title}`}
              >
                <div className="h-20 relative" style={{ background: flowerGradient(flower.params) }}>
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                  {flower.isMinted && (
                    <span className="absolute top-2 right-2 flex items-center gap-1 bg-black/40 text-white text-[10px] px-2 py-0.5 rounded-full backdrop-blur-sm">
                      <Gem className="w-3 h-3" /> Minted
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm font-semibold text-foreground truncate">{flower.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{flower.createdAt}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </motion.div>

      {/* Family distribution */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        className="bg-card rounded-xl p-6 border border-border"
      >
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-muted-foreground" /> Family distribution
        </h2>
        {distribution.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to chart yet — generate a flower to see your garden's families.</p>
        ) : (
          <div className="space-y-3">
            {distribution.map(({ key, count }) => (
              <div key={key} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs text-muted-foreground capitalize truncate">{key}</span>
                <div className="flex-1 h-3 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.round((count / maxCount) * 100)}%`,
                      background: familyGradients.get(key) ?? 'linear-gradient(135deg, #10b981, #2563eb)',
                    }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right text-xs font-mono text-foreground">{count}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
```

Notes: `familyDistribution` returns all families; the component slices top 6. Bar tint = `flowerGradient` of the first flower carrying that key (v2 palette gradient, v1 colorA→colorB). All new UI derives exclusively from `savedFlowers` — no backend calls added.

- [ ] **Step 4: Run it, expect PASS**

```bash
cd petal-pixel-studio && npx vitest run src/pages/dashboardStats.test.ts
```

Expected: all 9 tests pass. Then run the neighboring suites to confirm nothing regressed:

```bash
cd petal-pixel-studio && npx vitest run src/stores/flowerStore.test.ts src/stores/flowerStore.v2.test.ts
```

**MANUAL VERIFICATION (UI):**
1. `cd petal-pixel-studio && npm run dev`, open `http://localhost:8080/` and log in (Index is behind `ProtectedRoute`).
2. Dashboard shows, top to bottom: header, 4 stat cards (unchanged), quick actions row, "Recent flowers", "Family distribution".
3. Quick actions: "Create new" navigates to `/create`; "Continue drafts" shows the unminted count in a badge and navigates to `/my-flowers`. Badge count matches the "Drafts" stat card.
4. Recent flowers: at most 4 cards, newest first. v2 flowers show a multi-stop palette gradient thumbnail; v1 flowers show a two-color colorA→colorB gradient. Minted flowers show a "Minted" chip with a gem icon.
5. Click a recent flower card → lands on `/create` with that flower loaded in edit mode (same behavior as the Edit button on `/my-flowers`).
6. Family distribution: max 6 bars, longest bar first, each labeled with family (v2) or flowerType (v1) and its count; bar fill uses that family's gradient. Sum of all bar counts ≤ Total Flowers (equal when ≤ 6 distinct families).
7. Empty state: log in as a user with no flowers (or temporarily clear `localStorage` key `petal-pixel-flowers` and stay offline) → both sections render their friendly empty-state text, no crash.

- [ ] **Step 5: Commit**

```bash
git add petal-pixel-studio/src/pages/dashboardStats.ts petal-pixel-studio/src/pages/dashboardStats.test.ts petal-pixel-studio/src/pages/Index.tsx
git commit -m "feat(dashboard): family distribution bars, recent flowers strip, quick actions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Activity page replacing Payments

**Files:**
- Create: `petal-pixel-studio/src/pages/activityTimeline.ts` (pure helper, mirrors the `createFlowerGuards.ts` pattern of testable page logic living next to pages)
- Create: `petal-pixel-studio/src/pages/activityTimeline.test.ts`
- Create: `petal-pixel-studio/src/pages/Activity.tsx`
- Modify: `petal-pixel-studio/src/App.tsx` (route `/activity`, redirect `/payments` → `/activity`)
- Modify: `petal-pixel-studio/src/components/layout/AppSidebar.tsx` (nav item Payments → Activity)
- Delete: `petal-pixel-studio/src/pages/Payments.tsx`

**Interfaces:**
- Consumes: `SavedFlower` from `@/stores/flowerStore` (fields used: `id`, `title`, `createdAt` — a `YYYY-MM-DD` string, `isMinted`, `txHash`, `params.family?`, `params.flowerType`, `params.palette?`); `FlowerFamily`/`FlowerType` from `@/math/flowerTypes`; `Palette` from `@/math/palette`; `useFlowerStore((s) => s.savedFlowers)`. No backend changes.
- Produces:
  ```ts
  export interface CreatedEvent { kind: "created"; flowerId: string; title: string; date: string; family?: FlowerFamily; flowerType: FlowerType; palette?: Palette }
  export interface MintedEvent { kind: "minted"; flowerId: string; title: string; date: string; txHash?: string }
  export type ActivityEvent = CreatedEvent | MintedEvent;
  export interface ActivityDay { date: string; events: ActivityEvent[] }
  export function buildActivityTimeline(savedFlowers: SavedFlower[]): ActivityDay[]
  ```
  Semantics: days sorted reverse-chronologically (ISO date string compare). `SavedFlower` has no mint timestamp, so a minted flower's `minted` event is grouped under its `createdAt` day and ordered immediately BEFORE its `created` event (mint necessarily happened later). Within a day, the most recently saved flower (highest index in `savedFlowers`) comes first. Flowers with a missing/empty `createdAt` are skipped.

- [ ] **Step 1: Write the failing test**

  Create `petal-pixel-studio/src/pages/activityTimeline.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import { buildActivityTimeline } from "./activityTimeline";
  import type { SavedFlower } from "@/stores/flowerStore";

  function makeFlower(overrides: {
    id: string;
    createdAt: string;
    title?: string;
    isMinted?: boolean;
    txHash?: string;
    family?: string;
    flowerType?: string;
  }): SavedFlower {
    const { id, createdAt, title, isMinted, txHash, family, flowerType } = overrides;
    return {
      id,
      backendFlowerId: id,
      title: title ?? `Flower ${id}`,
      generationWord: "word",
      createdAt,
      isMinted: isMinted ?? false,
      txHash,
      params: {
        flowerType: flowerType ?? "classic",
        ...(family ? { family } : {}),
      } as unknown as SavedFlower["params"],
    };
  }

  describe("buildActivityTimeline", () => {
    it("returns an empty array for no flowers", () => {
      expect(buildActivityTimeline([])).toEqual([]);
    });

    it("orders days reverse-chronologically", () => {
      const days = buildActivityTimeline([
        makeFlower({ id: "a", createdAt: "2026-07-01" }),
        makeFlower({ id: "b", createdAt: "2026-07-03" }),
        makeFlower({ id: "c", createdAt: "2026-07-02" }),
      ]);
      expect(days.map((d) => d.date)).toEqual(["2026-07-03", "2026-07-02", "2026-07-01"]);
    });

    it("groups flowers with the same createdAt into one day, newest-saved first", () => {
      const days = buildActivityTimeline([
        makeFlower({ id: "first-saved", createdAt: "2026-07-04" }),
        makeFlower({ id: "second-saved", createdAt: "2026-07-04" }),
      ]);
      expect(days).toHaveLength(1);
      expect(days[0].events.map((e) => e.flowerId)).toEqual(["second-saved", "first-saved"]);
      expect(days[0].events.every((e) => e.kind === "created")).toBe(true);
    });

    it("emits a minted event before the created event for minted flowers, carrying txHash", () => {
      const days = buildActivityTimeline([
        makeFlower({ id: "m1", createdAt: "2026-07-05", isMinted: true, txHash: "0xabc123def4567890" }),
      ]);
      expect(days).toHaveLength(1);
      expect(days[0].events.map((e) => e.kind)).toEqual(["minted", "created"]);
      const minted = days[0].events[0];
      expect(minted.kind).toBe("minted");
      if (minted.kind === "minted") {
        expect(minted.txHash).toBe("0xabc123def4567890");
        expect(minted.title).toBe("Flower m1");
      }
    });

    it("carries family + flowerType on created events (v2) and degrades to flowerType-only for v1", () => {
      const days = buildActivityTimeline([
        makeFlower({ id: "v1", createdAt: "2026-07-01", flowerType: "rose" }),
        makeFlower({ id: "v2", createdAt: "2026-07-02", family: "sunflower", flowerType: "classic" }),
      ]);
      const v2Created = days[0].events[0];
      const v1Created = days[1].events[0];
      expect(v2Created.kind).toBe("created");
      if (v2Created.kind === "created") {
        expect(v2Created.family).toBe("sunflower");
      }
      if (v1Created.kind === "created") {
        expect(v1Created.family).toBeUndefined();
        expect(v1Created.flowerType).toBe("rose");
      }
    });

    it("skips flowers with an empty createdAt", () => {
      const days = buildActivityTimeline([makeFlower({ id: "x", createdAt: "" })]);
      expect(days).toEqual([]);
    });
  });
  ```

- [ ] **Step 2: Run it, expect FAIL**

  ```bash
  cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio" && npx vitest run src/pages/activityTimeline.test.ts
  ```

  Expected: the suite fails to load with `Error: Failed to resolve import "./activityTimeline"` (module does not exist yet).

- [ ] **Step 3: Implement**

  **3a.** Create `petal-pixel-studio/src/pages/activityTimeline.ts`:

  ```ts
  import type { SavedFlower } from "@/stores/flowerStore";
  import type { FlowerFamily, FlowerType } from "@/math/flowerTypes";
  import type { Palette } from "@/math/palette";

  export interface CreatedEvent {
    kind: "created";
    flowerId: string;
    title: string;
    /** YYYY-MM-DD (SavedFlower.createdAt) */
    date: string;
    /** v2 flowers only; undefined on v1 records — UI falls back to flowerType. */
    family?: FlowerFamily;
    flowerType: FlowerType;
    palette?: Palette;
  }

  export interface MintedEvent {
    kind: "minted";
    flowerId: string;
    title: string;
    /** Grouped under the flower's createdAt day — no separate mint timestamp exists. */
    date: string;
    txHash?: string;
  }

  export type ActivityEvent = CreatedEvent | MintedEvent;

  export interface ActivityDay {
    date: string;
    events: ActivityEvent[];
  }

  /**
   * Builds a reverse-chronological timeline from savedFlowers only (no backend).
   * Days sort descending by ISO date string. Within a day, the most recently
   * saved flower appears first; a minted flower's "minted" event precedes its
   * "created" event because minting always happens after creation.
   */
  export function buildActivityTimeline(savedFlowers: SavedFlower[]): ActivityDay[] {
    const byDate = new Map<string, ActivityEvent[]>();

    for (let i = savedFlowers.length - 1; i >= 0; i--) {
      const f = savedFlowers[i];
      if (!f.createdAt) continue;

      let bucket = byDate.get(f.createdAt);
      if (!bucket) {
        bucket = [];
        byDate.set(f.createdAt, bucket);
      }

      if (f.isMinted) {
        bucket.push({
          kind: "minted",
          flowerId: f.id,
          title: f.title,
          date: f.createdAt,
          txHash: f.txHash,
        });
      }

      bucket.push({
        kind: "created",
        flowerId: f.id,
        title: f.title,
        date: f.createdAt,
        family: f.params?.family,
        flowerType: f.params?.flowerType ?? "classic",
        palette: f.params?.palette,
      });
    }

    return Array.from(byDate.entries())
      .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
      .map(([date, events]) => ({ date, events }));
  }
  ```

  **3b.** Create `petal-pixel-studio/src/pages/Activity.tsx` (empty state mirrors NftCollection's `py-20` icon-plus-message pattern; tx truncation/copy mirrors NftCollection's `slice(0, 10)…slice(-6)` + `toast.success('Tx hash copied')`):

  ```tsx
  import { useMemo } from 'react';
  import { motion } from 'framer-motion';
  import { Activity as ActivityIcon, PlusCircle, Gem, Copy } from 'lucide-react';
  import { toast } from 'sonner';
  import { useFlowerStore } from '@/stores/flowerStore';
  import { buildActivityTimeline } from './activityTimeline';

  function formatDay(date: string): string {
    const parsed = new Date(`${date}T00:00:00`);
    return Number.isNaN(parsed.getTime())
      ? date
      : parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  export default function Activity() {
    const savedFlowers = useFlowerStore((s) => s.savedFlowers);
    const days = useMemo(() => buildActivityTimeline(savedFlowers), [savedFlowers]);

    return (
      <div className="h-full overflow-y-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Activity</h1>
          <p className="text-sm text-muted-foreground mt-1">A timeline of your flower creations and mints</p>
        </div>

        {days.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ActivityIcon className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">No activity yet. Create your first flower!</p>
          </div>
        ) : (
          <div className="space-y-8 max-w-2xl">
            {days.map((day, di) => (
              <motion.section
                key={day.date}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: di * 0.05 }}
              >
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  {formatDay(day.date)}
                </h2>
                <div className="space-y-2 border-l border-border pl-4">
                  {day.events.map((event) => (
                    <div
                      key={`${event.kind}-${event.flowerId}`}
                      className="bg-card rounded-xl border border-border p-4 flex items-start gap-3"
                    >
                      {event.kind === 'minted' ? (
                        <Gem className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      ) : (
                        <PlusCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <p className="text-sm text-foreground">
                          <span className="font-semibold">{event.title}</span>{' '}
                          {event.kind === 'minted' ? 'was minted as an NFT' : 'was created'}
                        </p>

                        {event.kind === 'created' && (
                          <span className="inline-flex items-center gap-1.5 bg-secondary text-secondary-foreground text-[10px] px-2 py-0.5 rounded-full capitalize">
                            {event.palette && event.palette.stops.length >= 2 && (
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{
                                  background: `linear-gradient(90deg, ${event.palette.stops.map((s) => s.hex).join(', ')})`,
                                }}
                              />
                            )}
                            {event.family ?? event.flowerType}
                          </span>
                        )}

                        {event.kind === 'minted' && event.txHash && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-emerald-400 font-semibold shrink-0">TX</span>
                            <span className="text-[10px] text-muted-foreground font-mono truncate">
                              {event.txHash.slice(0, 10)}…{event.txHash.slice(-6)}
                            </span>
                            <button
                              onClick={() => { void navigator.clipboard.writeText(event.txHash!); toast.success('Tx hash copied'); }}
                              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                              title="Copy tx hash"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.section>
            ))}
          </div>
        )}
      </div>
    );
  }
  ```

  **3c.** Modify `petal-pixel-studio/src/App.tsx`:

  ```diff
  -import { createBrowserRouter, RouterProvider, Outlet } from "react-router-dom";
  +import { createBrowserRouter, RouterProvider, Outlet, Navigate } from "react-router-dom";
  ```
  ```diff
  -import Payments from "./pages/Payments";
  +import Activity from "./pages/Activity";
  ```
  ```diff
  -          { path: "/payments", element: <PageErrorBoundary><Payments /></PageErrorBoundary> },
  +          { path: "/activity", element: <PageErrorBoundary><Activity /></PageErrorBoundary> },
  +          { path: "/payments", element: <Navigate to="/activity" replace /> },
  ```

  **3d.** Modify `petal-pixel-studio/src/components/layout/AppSidebar.tsx`:

  ```diff
   import {
  -  LayoutDashboard, Flower2, PlusCircle, Gem, CreditCard, User, Settings, LogOut, Sparkles,
  +  LayoutDashboard, Flower2, PlusCircle, Gem, Activity, User, Settings, LogOut, Sparkles,
   } from 'lucide-react';
  ```
  ```diff
  -  { label: 'Payments', icon: CreditCard, path: '/payments' },
  +  { label: 'Activity', icon: Activity, path: '/activity' },
  ```

  **3e.** Delete the old page:

  ```bash
  cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel" && git rm petal-pixel-studio/src/pages/Payments.tsx
  ```

- [ ] **Step 4: Run it, expect PASS**

  ```bash
  cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio" && npx vitest run src/pages/activityTimeline.test.ts
  ```

  Expected: 6 tests pass, 0 fail.

  **MANUAL VERIFICATION (UI):**
  1. `cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio" && npm run dev`, open `http://localhost:8080` and log in.
  2. Sidebar shows "Activity" (activity-pulse icon) where "Payments" was; no "Payments" entry remains. Expected: clicking it navigates to `/activity` and the active-item highlight/nav-indicator dot renders on it.
  3. Navigate directly to `http://localhost:8080/payments`. Expected: URL is replaced with `/activity` (browser Back does not return to `/payments`).
  4. With no saved flowers: page shows the centered empty state ("No activity yet. Create your first flower!") with the icon, matching NftCollection's empty-state look.
  5. With saved flowers: events appear grouped under date headings (e.g. "July 6, 2026"), newest day first. Each flower shows a "was created" row with a family badge — v2 flowers show the family name (e.g. "sunflower") with a small palette gradient dot; v1 flowers show their flowerType (e.g. "rose") with no dot.
  6. For a minted flower: a "was minted as an NFT" row with a gem icon appears above its created row, showing the truncated tx hash (`0x12345678…abcdef`); clicking the copy icon fires the "Tx hash copied" toast and puts the full hash on the clipboard.

- [ ] **Step 5: Commit**

  ```bash
  cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel" && git add petal-pixel-studio/src/pages/activityTimeline.ts petal-pixel-studio/src/pages/activityTimeline.test.ts petal-pixel-studio/src/pages/Activity.tsx petal-pixel-studio/src/App.tsx petal-pixel-studio/src/components/layout/AppSidebar.tsx && git commit -m "feat(studio): replace Payments with Activity timeline page

  Reverse-chronological created/minted timeline derived purely from
  savedFlowers (no backend changes); /payments now redirects to /activity.

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

  (The `git rm` from step 3e is already staged; `git add` picks up the rest.)
