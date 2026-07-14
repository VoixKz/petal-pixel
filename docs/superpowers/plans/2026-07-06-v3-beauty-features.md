# Plan v3: generation beauty + render overhaul + bug fixes + perf + features

Branch `feat/richer-flower-generation` (NOT merged). Source: full-project audit (workflow wglukn304,
62 findings). Headline goal: **typing any name yields a very beautiful flower almost instantly with
minimal tweaking.**

## BINDING DECISIONS (user-approved — override any contradicting draft)
- **D1 — Generation improved IN PLACE on v2** (no algo_version bump). The branch is unmerged and saved
  flowers render from their STORED params jsonb, so tuning `generator.go`/`palette.go` only changes what
  NEW names produce — saved flowers are unaffected. Determinism MUST hold: name→SHA-256→seed stays
  stable; every per-name draw stays deterministic/reproducible. The **v1 path is UNTOUCHED**
  (`toTechniqueParams`/`FLOWER_TYPES` and v1 saved flowers render pixel-identically).
- **D2 — Render/material/lighting/bloom/petal-thickness upgrade is GLOBAL.** "Pixel-identity" binds
  PARAMS, not final pixels — so ALL flowers (old v1/v2 + new) get the premium look at once. Already-minted
  NFT PNGs in MinIO are static and won't change; only the live render + future captures do.
- **D3 — Drop `onlyOwner` from `contracts/FlowerNFT.sol`** (local demo contract) + redeploy on anvil so
  any connected wallet can mint. Update `docs/MINTING.md` accordingly.
- **D4 — Generous feature set**: real gallery thumbnails, variations/"more like this", onboarding +
  recent names, brand consistency, viral share loop + per-network share, favorites, undo-delete,
  forgot-password, NFT filter parity, remove dead controls.

## Per-task gates
Frontend (from `petal-pixel-studio`): `npx tsc --noEmit` + `npx vitest run` (currently ~306 tests; the
zinnia heavy-geometry test may time out only under concurrent CPU load — passes isolated, not a bug).
Go via Docker `golang:1.25-alpine`; contract via the compose `deploy` (forge) service. Commit with
`git commit --only <paths>` (parallel agents share one git index; pathspec-less commit sweeps others'
staged files). New files: `git add` them first, then `--only`. No `text-[10px]`. Reduced-motion + focus
rings respected. Reuse shared helpers (paletteUi, designTokens, snapshot).

## TASKS (primary file ownership in brackets — the consistency pass sequences waves from this)
1. **gen-be** [Go `flower/generator.go`, `flower/palette.go` +tests] — superformula integer m1 + n-floors;
   rhodonea k∈{4,5,6,8} + height floor; sunflower rayLength/discRatio/dome; bloom-family diversity;
   family reweighting; saturation multiplicative operator; brightness guardrail (floor/scale-up);
   family-aware palette allow-list. Determinism preserved.
2. **math-fe** [TS `src/math/flowers/*.ts`, `src/math/palette.ts`, `src/math/flowerGeometry.ts` +tests] —
   fix palette SAMPLING direction (bright stop → petal tips/edges) + edge-brightness floor; `palette.ts`
   per-vertex perf (precompute stop RGB, numeric lerp, no THREE.Color/hex parse per vertex); petal
   thickness (normal-offset backing shell) for all families; bloom-family vertex cap; center/stamen
   geometry + close classic center hole. Affects ALL flowers (old+new).
3. **ren-scene** [TS `src/components/flower/FlowerCanvas.tsx`, `package.json`] — bloom+vignette via
   `@react-three/postprocessing`; unify live+capture lighting (one bright config, toneMappingExposure);
   brighter env (self-host the HDR as a bundled asset or an explicit light rig — no runtime CDN fetch);
   rim/back light; `frameloop="demand"` + invalidate on idle/orbit.
4. **ren-material** [TS `src/components/flower/Flower3D.tsx`] — MeshPhysicalMaterial sheen(+clearcoat)
   tinted to palette highlight; keep emissive very low (glow lives in the bloom pass); material for the
   new center/stamen geometry; layer subtle seed-deterministic idle life onto the Y-spin.
5. **bug-be** [Go `contracts/FlowerNFT.sol`, `internal/api/grpc/flower_server.go`, `cmd/server/main.go`
   +tests] — drop `onlyOwner` + redeploy; PrepareMint must not swallow the mint-record write error (or
   ConfirmMint upserts if absent); `setProtoShape` → `FailedPrecondition` + a panic-recovery unary
   interceptor; CORS fail-closed when `GRPC_WEB_ALLOWED_ORIGINS` unset + `Vary: Origin`.
6. **bug-fe** [TS `src/stores/flowerStore.ts`, `src/components/flower/snapshot.ts`, `src/pages/mintReceipt.ts`,
   `src/pages/createFlowerGuards.ts`, `src/pages/shareParams.ts` +tests] — v2 branch sets colorA/colorB
   deterministically from a SHARED constant reused by shareParams (so studio == /share); default material
   → 'matte'; add favorites state (`isFavorite`/`toggleFavorite`, persisted); captureFlowerPng passes a
   fixed frameYaw=0 (deterministic still); extractMintedTokenId requires `topics[1]==zero-address` +
   returns bigint/string; regenerate confirm also in create mode when an unsaved flowerId exists.
7. **perf-split** [TS `src/App.tsx`, `vite.config.ts`, `src/pages/CreateFlower.tsx` (ONLY the ethers import),
   `src/math/flowerGeometry.v2.test.ts` + heavy geometry tests] — React.lazy per route + Suspense;
   `manualChunks` vendor split; dynamic-import ethers inside the mint handler; fix the per-vertex `expect()`
   test slowness (aggregate to one boolean assert).
8. **feat-galleries** [TS `src/pages/MyFlowers.tsx`, `src/pages/NftCollection.tsx`] — real preview-PNG
   thumbnails (fallback previewGradient); favorite toggle + filter (consumes store from bug-fe); undo-delete
   toast; NftCollection search/filter/sort parity + empty-state CTA; keyboard-reachable card edit.
9. **feat-index** [TS `src/pages/Index.tsx`] — real thumbnails on recent flowers; remove the dev-facing
   "Backend Online/Offline" stat card (or make it non-primary).
10. **feat-create** [TS `src/pages/CreateFlower.tsx` — AFTER perf-split] — variations / "more like this"
    (deterministic sibling seeds from name+salt, 3–4 candidate thumbnails by Generate); onboarding (prefill
    display name + autofocus on first visit via userPrefs); recent-name chips from savedFlowers.
11. **feat-share-social** [TS `src/pages/ShareFlower.tsx` + new `src/lib/shareCard.ts`] — viral "Make one for
    YOUR name" input → `/create?name=`; per-network share (X/Telegram intent URLs) + downloadable branded
    share card (reuse captureFlowerPng).
12. **feat-brand-auth** [TS new `src/lib/brand.ts`, `src/components/layout/SidebarContent.tsx`,
    `src/pages/Login.tsx`, `src/pages/Signup.tsx`, `src/pages/SettingsPage.tsx`,
    `src/components/flower/FlowerControls.tsx`] — single brand name/tagline constant used everywhere
    (kills "FlowerNFT/GENERATOR" vs "Petal Pixel"); "Forgot password?" on Login (reuse resetPasswordForEmail);
    remove/disable dead controls (stem "coming soon" toggle, placeholder Settings switches/Delete, if not wired).

<!-- Task briefs assembled by the drafting workflow are appended below. -->
