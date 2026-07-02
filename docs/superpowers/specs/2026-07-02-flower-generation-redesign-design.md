# Flower Generation Redesign + Defect Fixes — Design

Date: 2026-07-02
Branch: `feat/richer-flower-generation`
Status: Approved (design), pending implementation plan

## Goal

Typing a person's name should produce a **beautiful and diverse** 3D flower. Today the
name barely drives the visuals, only 6 flower types exist, and color is a single hue.
This redesign makes the **Go backend the source of truth** for a rich, render-ready
parameter set (chosen approach: "Method 2 — backend emits everything"), adds new 3D
mathematical flower families, drives color from a hybrid palette system, accepts full
names (spaces + Unicode), and fixes 25 confirmed defects.

## Sequencing (hard requirement)

Execute in three phases, in order:

1. **Phase 1 — Defect fixes + UI polish.** Fix the 25 confirmed defects (9 important, 16
   minor) with no generation changes. Ship a stable base.
2. **Phase 2 — Richer generation (Method 2) + new 3D families + palettes + Unicode names.**
3. **Phase 3 — Full re-review.** Re-audit the whole branch (bugs, security, config,
   spec-compliance) after Phases 1–2 land.

Everything happens on the `feat/richer-flower-generation` branch so the work is fully
revertable (a single `git checkout main` / branch delete discards all of it).

## Constraints / decisions

- **3D only.** All flower families, including new ones, are 3D Three.js parametric
  surfaces. No 2D SVG/canvas flower art.
- **Determinism preserved.** Same name → same flower, forever. Anchor is the existing
  `seed` (SHA-256 of the normalized name).
- **No DB migration.** The `flowers.params` column is already `jsonb`; the Supabase
  `user_flowers.params` is JSON too. Only the JSON shape changes.
- **Backward compatibility.** Bump `algo_version` to `v2`. Already-saved flowers render
  from their stored params via the existing v1 path; new flowers use the v2 path.
- **Toolchain.** Codegen (`buf`) runs via the official `bufbuild/buf` Docker image, since
  the host has no Go/Foundry/buf. Generated stubs stay committed so normal builds need no
  `buf`.

---

## Phase 1 — Defect fixes + UI polish

Source: adversarially-verified defect audit (25 confirmed of 27 raised). Fix all.

### Important (9)

1. **Silent Supabase dual-write failure + false success toast** (`flowerStore.ts:159`,
   `CreateFlower.tsx:394`). `supabaseUpsertFlower`/`supabaseUpdateFlower` only
   `console.error`; `saveFlower` resolves; `handleSave` always toasts success. On next
   `loadFromBackend` the flower vanishes. **Fix:** helpers throw/return error; `saveFlower`
   rejects on failure; `handleSave` gets a `catch` that shows `toast.error` and suppresses
   the success toast.
2. **`handleSave` try/finally has no catch** (`CreateFlower.tsx:392`). Thrown errors →
   no user feedback. **Fix:** add `catch` that toasts and rethrows.
3. **"Save & Leave" proceeds even when save failed** (`CreateFlower.tsx:477`). **Fix:**
   `handleSave` returns success; only `blocker.proceed()` on confirmed success; else keep
   dialog open + `toast.error`.
4. **Regenerated-but-unsaved flower can't be marked minted** (`CreateFlower.tsx:451`).
   `params.flowerId` diverges from saved `backendFlowerId`; mint recorded nowhere; gas
   spent. **Fix:** block mint when there are unsaved regeneration changes, or auto-save
   before mint so the row exists with the correct id.
5. **`handleMint` reads stale `walletAddress` from closure** (`CreateFlower.tsx:412`).
   Rejected connection still proceeds to `getSigner()`. **Fix:** `handleConnectWallet`
   returns the address (or null); branch on the return value, not state.
6. **`markMintedByBackendFlowerId` Supabase failure swallowed after on-chain mint**
   (`flowerStore.ts:438`). UI reverts to un-minted on reload despite on-chain success.
   **Fix:** surface the persistence failure (warn: "Minted on-chain but failed to sync").
7. **Top-level sliders do nothing** (`FlowerControls.tsx:121`). Petal Count/Length/
   Sharpness/Noise/Frequency/Symmetry never reach geometry. **Fix:** wire each to the
   technique param it should control (map into the active `*Params`), or remove it. No
   silent no-op controls remain.
8. **Geometry `useMemo` keyed on entire `params`** (`Flower3D.tsx:34`). Color/rotation
   changes rebuild a ~122k-point mesh. **Fix:** key on
   `[params.flowerType, params.classicParams, params.roseParams, params.bloomParams,
   …new family params]`; exclude rotation/color/material. Also narrow the material memo
   (`Flower3D.tsx:66`).
9. **Sign-out leaves previous user's flowers in state + localStorage** (`AuthContext.tsx:114`).
   Cross-user data leak on shared browser. **Fix:** on sign-out reset the flower store and
   clear the persisted key; on `loadFromBackend` error/catch paths set `savedFlowers: []`
   instead of keeping another user's cache (or key persistence by user id).

### Minor (16)

10. `handleConnectWallet` never verifies/switches chain (`CreateFlower.tsx:318`) → call
    `ensureCorrectNetwork` at connect time.
11. Regenerate warning bypassed when only params changed, not the word
    (`CreateFlower.tsx:363`) → gate on `paramsDirty || wordChanged`.
12. Enter key can trigger generate while one is in flight (`CreateFlower.tsx:493`) → guard
    on `isGenerating`.
13. Backend health-check button not disabled while checking (`CreateFlower.tsx:521`) →
    disable + early-return re-entry guard.
14. Name→params entropy collapse (`flowerGeometry.ts:30`). **Resolved by Phase 2** (v2
    path replaces `toTechniqueParams`); for v1 flowers this stays as-is. No separate fix.
15. Classic first row is coincident zero-area triangles (`classic.ts:13`) → start theta
    past 0 or skip degenerate row.
16. Material `useMemo` keyed on whole params (`Flower3D.tsx:66`) → narrow deps (folded into
    fix #8).
17. Bloom "Spiral Fade" slider min (0.4) clips much of the bloom (`bloom.ts:43`) → adjust
    min/mapping.
18. `verifyOtp` hardcodes `type:'signup'` (`AuthContext.tsx:121`) → pass the correct type.
19. OAuth sign-in swallows errors (`AuthContext.tsx:105`) → surface failures.
20. Logout does not redirect (`AppSidebar.tsx:74`) → navigate to `/login` after sign-out.
21. `NotFound` uses raw `<a href>` (`NotFound.tsx:16`) → use client-side `Link`.
22. `MyFlowers` has no empty state; edit hidden behind double-click (`MyFlowers.tsx:77`) →
    add empty state + a visible edit affordance.
23. Settings toggle not keyboard-operable / missing label (`SettingsPage.tsx:6`) → use an
    accessible switch with label.
24. Payments page shows hardcoded fake transactions (`Payments.tsx:4`) → replace the fake
    transactions with an explicit "Demo — coming soon" empty state (no misleading data).
25. `beforeunload` calls `preventDefault` without `returnValue` (`CreateFlower.tsx:288`) →
    set `returnValue`.

### UI polish (Phase 1, targeted — no redesign)

- Ensure every control has correct loading/disabled/empty/error states.
- Make the control panel edit params that actually render (ties into #7).
- Name input accepts spaces + Unicode (see Phase 2 §D; the input-side change can land in
  Phase 1 since the backend already normalizes).

---

## Phase 2 — Richer generation (Method 2)

### A. Proto contract (`proto/flower/v1/service.proto`)

Extend `FlowerParams` (keep existing fields 1–9 for back-compat):

```proto
message ColorStop { float position = 1; float r = 2; float g = 3; float b = 4; }

message PaletteSpec {
  string id = 1;                 // curated palette id
  repeated ColorStop stops = 2;  // resolved gradient (backend owns the catalog)
  float hue_shift = 3;           // hybrid: small name-derived shifts
  float sat_shift = 4;
  float bri_shift = 5;
}

message ClassicParams { /* rows, cols, pNum, fD, pLen, pSharp, fHeight, curve1, curve2, b, bNum */ }
message RoseParams { /* opening, vDensity, pAlign, curve1, curve2 */ }
message BloomParams { /* scale, opening, density, petalFreq, petalAmp, hangDown, fade, thetaStep, rStep, satShift, briShift */ }
message SunflowerParams { /* floretCount, goldenAngleDeg (~137.5), diskRadius, domeHeight, rayPetalCount, rayLength */ }
message RhodoneaParams { /* k (petal frequency), amplitude, heightProfile, thickness, layers */ }
message SuperformulaParams { /* m, n1, n2, n3, a, b for two superformulas (lat/long), scale, height */ }

message FlowerParams {
  // ... existing fields 1..9 ...
  string family = 10;            // classic|rose|zinnia|camellia|lotus|dahlia|sunflower|rhodonea|superformula
  PaletteSpec palette = 11;
  oneof shape {
    ClassicParams classic = 12;
    RoseParams rose = 13;
    BloomParams bloom = 14;
    SunflowerParams sunflower = 15;
    RhodoneaParams rhodonea = 16;
    SuperformulaParams superformula = 17;
  }
}
```

Exact field numbers/types finalized during planning. `algo_version = "v2"`.

### B. Go generator (`internal/flower/generator.go`)

- Normalize name (existing logic already lowercases + collapses whitespace; verify Unicode).
- `seed = SHA-256(normalized)[0:8]`. Seed a `splitmix64`.
- **Decorrelate:** each parameter uses an independent PRNG draw (already the Go pattern);
  the correlated `seedN % n` lived only in the removed frontend mapping.
- **Family selection:** weighted pick from an independent draw (curated weights), not
  `seed % N`.
- **Palette:** independent pick from a curated Go catalog (~16–24 palettes with gradient
  stops) + small name-derived hue/sat/bri shifts (hybrid). Emit resolved `stops`.
- **Knob ranges:** wide but guard-railed per family so every point looks good.
- Fill the `oneof` matching the chosen family. Bump `algo_version` to `v2`.
- Map the Go struct → proto in `flower_server.go`.

### C. Frontend rendering (`petal-pixel-studio/src`)

- **v2 path:** consume `family` + `oneof` + `palette.stops` directly. Remove the
  `toTechniqueParams` seed-hack from the v2 flow (keep it only for rendering saved v1
  flowers).
- **Palette-driven color:** add `samplePalette(stops, t)`; replace hardcoded per-profile
  `color(r)` ramps in `bloomProfiles.ts` (and classic/rose color) with palette sampling.
- **New 3D families** (each its own module under `src/math/flowers/`, mirroring `bloom.ts`):
  - **sunflower** — phyllotaxis disk: florets placed by the golden angle (~137.5°) on a
    (optionally domed) disk, plus a ring of ray petals. 3D surface/instanced florets.
  - **rhodonea** — rose curve `r = cos(k·θ)` lofted into a 3D petal surface via a height
    profile and thickness.
  - **superformula** — 3D Gielis superformula (spherical product of two superformulas)
    producing organic flower bodies.
- `Flower3D.tsx` dispatches on `family` to the right geometry builder; memo deps updated
  to include the new family params (ties into fix #8).

### D. Name input (spaces + Unicode)

- Remove the space-stripping/rejection in the create-page input handler + validation.
- `trim` + collapse internal whitespace on submit; allow Unicode (Cyrillic, emoji).
- Backend already normalizes identically, so determinism holds.

### Codegen / infra

- Add a Dockerized codegen path (e.g. `docker compose run --rm codegen` or
  `tools/docker/buf.sh`) using `bufbuild/buf`, running both `buf.gen.yaml` and
  `buf.gen.frontend.yaml`. Remote plugins → no local protoc needed.
- Commit regenerated Go (`gen/go`) and TS (`petal-pixel-studio/src/gen`) stubs.
- Document the codegen command in `README.md` and `flower-backend/README.md`.

---

## Phase 3 — Full re-review

After Phases 1–2 land on the branch:

- Re-run a whole-branch review (correctness, security, config-consistency,
  spec-compliance) against the design.
- Confirm: determinism per name; v1 flowers unchanged; no new dead controls; codegen
  reproducible; docker stack still builds + runs; tests green.
- Fix any findings, then finalize the branch (merge/PR decision is the user's).

## Testing

- **Go:** determinism (same name → same params), range guardrails, family + palette
  distribution across many names, Unicode/space normalization, `oneof` correctness.
- **Frontend (Vitest):** `samplePalette` correctness; each new family produces
  non-degenerate geometry (no NaN, positive triangle area, bounded vertex count);
  regression tests for the important defect fixes where feasible.
- **Manual:** docker stack up; generate several names (incl. Cyrillic + spaces); verify
  diversity, save/mint flows show correct success/error states.

## Non-goals

- No 2D flower rendering.
- No full app-wide visual redesign (targeted polish only).
- No DB schema migration.
- No change to the mint transaction model (still browser + MetaMask).
