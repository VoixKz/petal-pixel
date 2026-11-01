# Phase 1 — Defect Fixes + UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 25 adversarially-verified defects (9 important, 16 minor) and apply targeted UI polish to the petal-pixel frontend, with no changes to the flower generation model (that is Phase 2).

**Architecture:** All fixes are localized to the React/TS frontend (`petal-pixel-studio`). A shared error-handling contract makes Supabase writes throw, `saveFlower` reject, and the save/mint handlers surface failures and return success booleans, so silent data loss and false success toasts are eliminated. Render perf, auth/session hygiene, control wiring, geometry correctness, and page polish are independent fix groups.

**Tech Stack:** React 18, Vite, TypeScript, Zustand (store + persist), Three.js, Supabase JS, ConnectRPC (gRPC-web), Vitest + jsdom + @testing-library/react. Design spec: `docs/superpowers/specs/2026-07-02-flower-generation-redesign-design.md`.

## Global Constraints

- **Branch:** `feat/richer-flower-generation`. All work stays on this branch and is fully revertable. Commit after every task.
- **Phase 1 scope only:** do NOT change the generation param model or add flower families/palettes here — that is Phase 2. Defect #14 (name→params entropy collapse) is intentionally deferred to Phase 2 and has no task here.
- **Determinism preserved; no DB migration.**
- **Tests:** run a single file with `cd petal-pixel-studio && npx vitest run <path>`. `@testing-library/user-event` is NOT installed — use `fireEvent` + `.focus()` in component tests. For component-handler behavior that is contrived to unit-test, a labeled MANUAL VERIFICATION step (exact click sequence + expected on-screen result) is acceptable in place of a brittle test.
- **Line numbers are approximate anchors** — match on the quoted code text, not the line number, and re-read files between tasks that touch the same file (CreateFlower.tsx, flowerStore.ts).
- **Conventional commits**, one per task; end messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

### Shared error-handling contract (binding for all save/mint tasks)

- `supabaseUpsertFlower(...)` / `supabaseUpdateFlower(...)` in `flowerStore.ts` **throw** on the Supabase `{ error }` (`throw new Error(error.message)`); signatures stay `Promise<void>`.
- The Supabase UPDATE inside `markMintedByBackendFlowerId` also throws on `{ error }`.
- `saveFlower(): Promise<void>` keeps the optimistic local `set()` but re-throws if a Supabase write throws.
- `handleSave(): Promise<boolean>` — `true` on success (shows success toast); on failure shows `toast.error` and returns `false` (no success toast). Button: `onClick={() => void handleSave()}`. Save & Leave: `if (await handleSave()) blocker.proceed()`.
- `handleConnectWallet(): Promise<string | null>` — returns the connected address or `null`; callers branch on the return value, never on the `walletAddress` state read in the same closure.
- `markMintedByBackendFlowerId(...): Promise<boolean>` — keeps optimistic local `set()`; returns `false` (does NOT throw) on Supabase sync failure so `handleMint` can toast a warning; plain success toast only when it returns `true`.
- Add a `resetFlowerStore()` action used by `signOut` to clear `savedFlowers` + edit state and remove the persisted `'petal-pixel-flowers'` key.

### Dependencies & sequencing

Two hard dependency chains and one soft grouping.

CHAIN A (store errors -> save UX -> mint): T1 (store helpers throw) MUST precede T2 (handleSave -> Promise<boolean>, surfaces the throw via runSaveFlow + gates Save & Leave). T2 MUST precede T3's regen-guard sub-task (which does `if (!(await handleSave())) return;`) and T3's final handleMint sub-task. So: T1 -> T2 -> T3.

Within T3 (4 sub-tasks, single group): (1) handleConnectWallet -> Promise<string|null> and (2) markMintedByBackendFlowerId -> Promise<boolean> are mutually independent and can go in either order; (3) regen-guard insert at top of handleMint depends on T2's handleSave boolean; (4) the final handleMint rewrite (use returned address + toast.warning on sync failure) depends on BOTH (1) and (2), and its regen guard must already be inserted, so it is LAST. Order inside T3: connect + markMinted (either order) -> regen-guard -> handleMint rewrite.

CHAIN B (reset -> signOut -> logout redirect), all in T5: T5's resetFlowerStore store task MUST precede T5's signOut task (which calls useFlowerStore.getState().resetFlowerStore()) which MUST precede/pair-with the AppSidebar logout-redirect task (its two-user manual verification relies on both). Order inside T5: resetFlowerStore+loadFromBackend-clear -> signOut -> AppSidebar redirect. T5's verifyOtp and signInWithOAuth tasks are independent of chain B and of each other; land them anywhere in T5.

SHARED FILE HOTSPOTS (no semantic conflict, but re-read between edits and match by code text not line number):
- CreateFlower.tsx: edited by T2, T3, T4. Suggested sub-order T2 -> T4 -> T3 (or interleave, they touch disjoint regions). Cited line numbers WILL drift; all quoted snippets were verified current so text-match is safe.
- flowerStore.ts: edited by T1 (helpers 149-175), T3 (interface :81 + impl 416-443), T5 (interface :83 + loadFromBackend 458-486 + resetParams area). Land T1 -> T3-store -> T5-store; both interface edits (T3 :81, T5 after :83) target different declarations — apply by matching declaration text.

INDEPENDENT GROUPS (any order relative to the chains): T4 (generate/health guards, new createFlowerGuards module), T6 (Flower3D memo deps — pure, touches no shared contract file), T7 (FlowerControls slider rewiring — independent of T4 despite both touching the CreateFlower/params dirty mental-model; the whole-object JSON dirty check is robust), T8 (classic.ts + bloom.ts geometry — pure math, no shared files), T9 (NotFound/MyFlowers/SettingsPage/Payments — four independent page files, none shared with other tasks).

Recommended overall sequence: T1 -> T2 -> T4 -> T3 -> T5(reset->signOut->sidebar; verifyOtp/oauth anytime) -> T6 -> T7 -> T8 -> T9.

**Consistency notes from the cross-task review (apply during execution):**

- **T3 (regen-guard task) depends on T2** — T3's third sub-task ('Guard minting a regenerated-but-unsaved flower') calls `const saved = await handleSave(); if (!saved) return;` — it consumes `handleSave(): Promise<boolean>`. But on `main`, `handleSave` returns `Promise<void>` (verified CreateFlower.tsx:381-404: it has no return statements and its type is inferred `void`). That boolean contract is introduced ONLY by T2. T3's own Interfaces note even says 'treat as Promise<boolean> per the shared contract' — i.e. it assumes T2 already landed. If T3 lands before T2, `await handleSave()` is `undefined`, `!saved` is always true, and mint always aborts. **Fix:** Make the ordering explicit and enforced: T2 (handleSave -> Promise<boolean>) MUST precede T3's regen-guard sub-task and T3's final handleMint sub-task. Add this as a hard dependency line in T3's 'sequencing' notes (it currently only says the dependency exists 'in another group' without pinning it to T2 by name).
- **T1 vs T2 (shared saveFlower/handleSave chain)** — T2's failure-path unit tests (`runSaveFlow` returns false and toasts when saveFlower rejects) and manual step 5/6 only pass if `saveFlower()` actually rejects on a Supabase write error. On `main`, `supabaseUpsertFlower`/`supabaseUpdateFlower` swallow the error (console.error, verified flowerStore.ts:159,174), so `saveFlower()` resolves even on failure. T2's own note acknowledges 'This task depends on T1'. Without T1 first, T2's rejects-path test would need saveFlower to throw, which it does not. **Fix:** Pin T1 before T2 explicitly. T1 (store throws) is the foundation for T2 (handleSave surfaces the throw). Sequence: T1 -> T2 -> T3 regen-guard -> T3 handleMint.
- **T2, T3, T4 all edit CreateFlower.tsx — overlapping/adjacent line regions** — Three separate task groups mutate the same file with cited absolute line numbers that will drift as each lands: T2 edits :288 (beforeunload), :381-404 (handleSave), :477 (onSaveAndLeave); T3 edits :318-334 (handleConnectWallet), :406-420 + :451-452 (handleMint), :531 (wallet button onClick); T4 edits :306-316 (handleCheckBackend), :352-369 (handleGenerate), :493 (Enter keydown), :521-528 (Backend button), and removes the local `type HealthStatus` at :45. None of these regions textually collide line-for-line, but every task after the first is quoting stale line numbers. **Fix:** Have the assembler treat all CreateFlower.tsx cited line numbers as approximate anchors and match on the quoted code text, not the line number. Recommend landing the CreateFlower.tsx edits in a fixed order (T2, then T4, then T3) and re-reading the file between tasks. Note the tasks match code text exactly (I verified the quoted snippets are current), so text-based matching is safe.
- **T2 vs T3 — handleMint wallet-guard block is edited by T3 but its `handleSave()` call inside the same closure changed by T2** — T3's regen-guard inserts code at the top of `handleMint` immediately after the `if (!params.flowerId)` block (CreateFlower.tsx:407-410). T3's final handleMint sub-task then rewrites the wallet-guard block (:412-420). Both T3 sub-tasks edit `handleMint`, and both sit right after T2's `handleSave` boolean change. If T3's two handleMint edits are applied out of order (wallet-guard rewrite before the regen-guard insert), the insertion anchor ('immediately after if (!params.flowerId), before the wallet check') still exists, so it is fine — but only if the regen guard is inserted ABOVE the rewritten wallet block. The plan text does specify this order; the risk is the assembler applying the wallet-guard rewrite first and then not finding a clean 'before the wallet check' anchor. **Fix:** Within T3, enforce: (1) connect-task, (2) markMinted store-task, (3) regen-guard insert at top of handleMint, (4) wallet-guard + sync-toast rewrite of handleMint — in that exact order. The regen guard must be inserted before the `if (!window.ethereum)` / `let address = walletAddress` block so the final structure is: flowerId guard -> regen/auto-save guard -> ethereum/address guard -> mint.
- **T3 (markMinted) vs T5 (resetFlowerStore) — both edit the FlowerStore interface block (flowerStore.ts:57-84)** — T3 changes the interface line at flowerStore.ts:81 (`markMintedByBackendFlowerId ... => Promise<void>` becomes `Promise<boolean>`). T5 adds `resetFlowerStore: () => void;` after line 83 (right after `resetParams`). Both mutate the same 57-84 interface region. Verified: line 81 is `markMintedByBackendFlowerId: (...) => Promise<void>;` and line 83 is `resetParams: () => void;`. They target different lines so a clean apply works, but a naive patch tool keyed on line numbers could conflict once the first edit shifts subsequent line numbers. **Fix:** Assembler should apply both interface edits by matching the exact declaration text (not line number). No semantic conflict — just flag that flowerStore.ts is touched by T1 (helpers 149-175), T3 (interface :81 + impl :416-443), and T5 (interface :83 + loadFromBackend :458-486 + resetParams area :489-500). Recommend order T1 -> T3-store -> T5-store, re-reading between edits.
- **T2 vs T3 — onSaveAndLeave signature drift** — The shared contract specifies `onSaveAndLeave={async () => { if (await handleSave()) blocker.proceed(); }}`. T2 correctly rewrites the current `onSaveAndLeave={async () => { await handleSave(); blocker.proceed(); }}` (verified CreateFlower.tsx:477) to gate on the boolean. This is only correct once handleSave returns boolean (T2 itself). No drift between tasks, but note the current :477 already calls blocker.proceed() unconditionally, so if T2's onSaveAndLeave edit is skipped, Save & Leave proceeds even on failed save. This is internal to T2 — just confirm T2 does both the handleSave rewrite AND the :477 edit (it does). **Fix:** No cross-task change needed; confirm T2's Step 3 includes the :477 gating edit (it does). Flagging only so the assembler does not drop the :477 edit while taking the handleSave rewrite.
- **T4 — HealthStatus type relocation is isolated but referenced by useState at :233** — T4 deletes the local `type HealthStatus = 'idle' | 'checking' | 'ok' | 'error'` at CreateFlower.tsx:45 and imports it from a new `./createFlowerGuards` module. The `useState<HealthStatus>('idle')` at :233 (verified) must resolve to the imported type. No other task references `HealthStatus`, so no cross-task conflict — but T4 both creates `createFlowerGuards.ts` AND removes the local type, so if only part of T4 lands the file will not compile. **Fix:** No cross-task issue. Keep T4 atomic (module creation + type removal + guard wiring in one commit) as the plan already does. Flagging only to confirm no other task assumes the local `HealthStatus` at :45 still exists (none do).
- **T7 vs T4 — both reference paramsDirty / FlowerControls sliders that T7 removes** — T4's regenerate-warning fix keys on `paramsDirty` (component state set by the slider-change effect at CreateFlower.tsx:272-276, which compares JSON.stringify(params)). T7 rewrites the FlowerControls sliders so the top-level Petal Count/Length/Sharpness sliders write `classicParams`/`bloomParams` instead of `params.petalCount` etc., and deletes the Symmetry/Noise/Frequency sliders. Since `paramsDirty` compares the WHOLE params object, T7's change of WHICH sub-fields the sliders write does not break T4's dirty detection (any nested change still flips the JSON string). No conflict, but the two tasks share the mental model of 'what makes params dirty'. **Fix:** No change required — the whole-object JSON comparison in the dirty effect (:274) is robust to T7's rewiring. Flag for the assembler that T4 and T7 are independent and can land in either order; T4 does not need T7 and vice versa.
- **T5 — signInWithOAuth callers in Login.tsx/Signup.tsx must all be updated together** — T5 changes `signInWithOAuth` return type from `Promise<void>` to `Promise<{ error: Error | null }>` (verified AuthContext.tsx:33,105-112). Login.tsx:112,137 and Signup.tsx:92,96 currently call `onClick={() => signInWithOAuth('google')}` (verified — 2 call sites each, 4 total). T5's plan updates all four via a `handleOAuth` helper. If any call site is missed, TypeScript still compiles (the promise is just discarded) but the swallowed-error defect persists silently. The plan cites Login.tsx:6,112,137 and 'Signup.tsx OAuth buttons' — Signup line numbers are not pinned. **Fix:** Pin Signup.tsx call sites explicitly for the assembler: Signup.tsx:92 (google) and :96 (apple). Ensure all 4 onClicks (Login :112/:137, Signup :92/:96) are converted to the `handleOAuth` wrapper so the returned `{ error }` is consumed. `toast` is already imported in both files (Login.tsx:6, Signup.tsx:6, verified).
- **T5 — verifyOtp changes type but resendOtp keeps type:'signup' (intentional, but flag)** — T5 changes `verifyOtp` to `type: 'email'` (from `'signup'`, verified AuthContext.tsx:125). The sibling `resendOtp` at AuthContext.tsx:132 still uses `type: 'signup'`. This looks like drift but is actually correct: supabase `auth.resend` accepts `'signup' | 'email_change' | 'sms' | 'phone_change'` and does NOT accept `'email'`, whereas `auth.verifyOtp` accepts `'email'`. So resendOtp must stay `'signup'`. **Fix:** No change needed — but add a one-line note in T5 so a reviewer does not 'consistency-fix' resendOtp to 'email' (which would be a type error). The two APIs use different type unions.
- **T3 (markMinted) — test file name collides conceptually with T5 store test but not on disk** — T3 creates src/stores/markMintedByBackendFlowerId.test.ts and T5 creates src/stores/flowerStore.reset.test.ts; T1 creates src/stores/flowerStore.test.ts. All three mock `@/integrations/supabase/client` and `@/integrations/flowerBackend/client` with slightly different chained-builder shapes. No filename collision, but three separate hand-rolled supabase mocks for the same module across three test files is duplication that can drift (e.g. T1's mock returns `{ data: { user: { id } } }` unconditionally; T3/T5 use `getUserMock`). **Fix:** Not a blocker. Optionally have the assembler extract a shared supabase-mock helper under src/test/, but since each test needs different per-test control this is acceptable duplication. Flag only so the assembler does not assume one global mock covers all three.

---

### Task 1: Propagate Supabase write errors from the store helpers into `saveFlower`

**Files:**
- Modify: `src/stores/flowerStore.ts:149-160` (`supabaseUpsertFlower` — replace `console.error` with `throw`)
- Modify: `src/stores/flowerStore.ts:162-175` (`supabaseUpdateFlower` — replace `console.error` with `throw`)
- Test: `src/stores/flowerStore.test.ts` (new file)

**Interfaces:**
- Consumes: `useFlowerStore` (default export `create<FlowerStore>()(persist(...))` at `flowerStore.ts:179`); the store method `saveFlower(): Promise<void>` at `flowerStore.ts:277`; module-private helpers `supabaseUpsertFlower(userId, flowerId, title, generationWord, params): Promise<void>` and `supabaseUpdateFlower(userId, flowerId, fields): Promise<void>`.
- Produces:
  - `supabaseUpsertFlower(userId: string, flowerId: string, title: string, generationWord: string, params: FlowerParams): Promise<void>` — now **throws** `new Error(error.message)` on the Supabase `{ error }` (was `console.error`, still `Promise<void>`).
  - `supabaseUpdateFlower(userId: string, flowerId: string, fields: { saved_name?: string; generation_word?: string; params?: FlowerParams }): Promise<void>` — now **throws** `new Error(error.message)` on the Supabase `{ error }`.
  - `saveFlower(): Promise<void>` — still performs the optimistic local `set()`, but now **rejects** (re-throws) when the underlying upsert/update throws. Later tasks (`handleSave` in `CreateFlower.tsx`) rely on `saveFlower()` rejecting on write failure.

> NOTE for the assembler: this is the FOUNDATION task. `saveFlower` already `await`s the two helpers with no `try/catch` wrapping them (see `flowerStore.ts:304`, `318`, `353`), so once the helpers throw, `saveFlower` re-throws automatically — no extra `try/catch` code is needed in `saveFlower`. Do NOT add a swallowing `try/catch`. The optimistic `set({ savedFlowers: ... })` at lines 298 / 346 already runs *before* the awaited Supabase call, so the local optimistic set is preserved on failure exactly as the contract requires.

---

- [ ] **Step 1: Write the failing test**

Create `src/stores/flowerStore.test.ts`. The test mocks `@/integrations/supabase/client` (a chained query builder plus `auth.getUser`) and `@/integrations/flowerBackend/client` (so the module import doesn't pull the real gRPC client). It drives the **create path** of `saveFlower` (requires `params.flowerId` to be truthy and `editingFlowerId` to be `null`, per `flowerStore.ts:330-331`).

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock the Supabase client BEFORE importing the store ──────────────────────
// upsertResult is mutated per-test to simulate success vs. error.
const upsertResult: { error: { message: string } | null } = { error: null };
const upsertMock = vi.fn(async () => upsertResult);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-123" } } })),
    },
    from: vi.fn(() => ({
      // create path -> supabaseUpsertFlower -> .from('user_flowers').upsert(...)
      upsert: upsertMock,
      // edit path helpers (unused here, present so chaining never throws)
      update: vi.fn(() => ({
        eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
      })),
    })),
  },
}));

// Store imports this at module load; stub so the real gRPC client isn't pulled in.
vi.mock("@/integrations/flowerBackend/client", () => ({
  createFlowerViaGrpc: vi.fn(),
}));

import { useFlowerStore } from "./flowerStore";

describe("saveFlower Supabase error propagation (create path)", () => {
  beforeEach(() => {
    upsertResult.error = null;
    upsertMock.mockClear();
    // Reset store to a clean create-path state: a backend flowerId, no edit mode.
    useFlowerStore.setState({
      editingFlowerId: null,
      savedFlowers: [],
      title: "Test Flower",
      generationWord: "sunrise",
      params: { ...useFlowerStore.getState().params, flowerId: "flower-abc" },
    });
  });

  it("rejects when the Supabase upsert returns an error", async () => {
    upsertResult.error = { message: "duplicate key value" };

    await expect(useFlowerStore.getState().saveFlower()).rejects.toThrow(
      "duplicate key value",
    );

    // Optimistic local set must still have happened despite the failed write.
    expect(useFlowerStore.getState().savedFlowers).toHaveLength(1);
    expect(useFlowerStore.getState().savedFlowers[0].id).toBe("flower-abc");
  });

  it("resolves when the Supabase upsert succeeds", async () => {
    upsertResult.error = null;

    await expect(useFlowerStore.getState().saveFlower()).resolves.toBeUndefined();

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(useFlowerStore.getState().savedFlowers).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Command:
```
cd petal-pixel-studio && npx vitest run src/stores/flowerStore.test.ts
```
Expected: the **"rejects when the Supabase upsert returns an error"** test FAILS. Because `supabaseUpsertFlower` currently only `console.error`s (never throws), `saveFlower()` resolves instead of rejecting. Vitest reports something like:
```
AssertionError: promise resolved "undefined" instead of rejecting
 ❯ src/stores/flowerStore.test.ts  (2 tests | 1 failed)
   × saveFlower Supabase error propagation (create path) > rejects when the Supabase upsert returns an error
```
(The "resolves when the upsert succeeds" test passes even before the change — that is the regression guard.)

- [ ] **Step 3: Implement**

In `src/stores/flowerStore.ts`, change the two helper tails from `console.error`-and-swallow to `throw`.

`supabaseUpsertFlower` — replace line 159:
```ts
  if (error) console.error('supabaseUpsertFlower error:', error);
```
with:
```ts
  if (error) throw new Error(error.message);
```

`supabaseUpdateFlower` — replace line 174:
```ts
  if (error) console.error('supabaseUpdateFlower error:', error);
```
with:
```ts
  if (error) throw new Error(error.message);
```

Leave `saveFlower` (lines 277-355) otherwise unchanged: the optimistic `set(...)` at line 298 (edit path) and lines 346/348 (create path) already run before the awaited helper calls, and the helper calls at lines 304, 318, and 353 are `await`ed with no wrapping `try/catch`, so the thrown error now propagates out of `saveFlower` as a rejection while the local state is already updated. Do not add a `try/catch` around the helper calls.

- [ ] **Step 4: Run it, expect PASS**

Command:
```
cd petal-pixel-studio && npx vitest run src/stores/flowerStore.test.ts
```
Expected: both tests pass —
```
 ✓ src/stores/flowerStore.test.ts  (2 tests) 
   ✓ rejects when the Supabase upsert returns an error
   ✓ resolves when the Supabase upsert succeeds
```

- [ ] **Step 5: Commit**

```
git add petal-pixel-studio/src/stores/flowerStore.ts petal-pixel-studio/src/stores/flowerStore.test.ts
git commit -m "fix(store): throw on Supabase write errors so saveFlower rejects on failure

supabaseUpsertFlower and supabaseUpdateFlower previously console.error'd and
swallowed the { error }, so saveFlower resolved even when the user_flowers
write failed and the flower vanished on the next loadFromBackend. Both helpers
now throw new Error(error.message); saveFlower keeps its optimistic local set()
but re-throws so callers can surface the failure.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

Key facts verified against the source (`/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/stores/flowerStore.ts`):
- Line 159 `if (error) console.error('supabaseUpsertFlower error:', error);` and line 174 `if (error) console.error('supabaseUpdateFlower error:', error);` are the exact swallow sites.
- Create path in `saveFlower`: guard `if (!newId) return;` (line 331), optimistic `set({ savedFlowers: [...savedFlowers, newFlower], editingFlowerId: newId })` (line 346), then `await supabaseUpsertFlower(user.id, newId, title, generationWord || "unknown", params)` (line 353) — all un-wrapped, so the throw propagates.
- Supabase create-path chain is `supabase.from('user_flowers').upsert(obj, { onConflict })` (lines 149-158); auth is `supabase.auth.getUser()` (line 351) returning `{ data: { user } }`.
- Store module also imports `createFlowerViaGrpc` from `@/integrations/flowerBackend/client` (line 15) and `supabase` from `@/integrations/supabase/client` (line 16) — both mocked in the test.
- Persist key is `'petal-pixel-flowers'` (line 503); `partialize` persists only `savedFlowers` (line 506) — relevant to the later `resetFlowerStore()` task, not this one.
- Test config confirmed: `globals: true`, `setupFiles ./src/test/setup.ts`, `include src/**/*.{test,spec}.{ts,tsx}`, alias `@ -> ./src` (`vitest.config.ts`).

---

### Task 2: handleSave failure feedback, Save & Leave gating, and beforeunload returnValue

**Files:**
- Modify: `petal-pixel-studio/src/pages/CreateFlower.tsx:288` (beforeunload handler), `:381-404` (handleSave), `:477` (onSaveAndLeave)
- Test: `petal-pixel-studio/src/pages/CreateFlower.save.test.tsx`

**Interfaces:**
- Consumes: `saveFlower(): Promise<void>` — now re-throws on Supabase write failure (from Task T1); `toast.success`/`toast.error` from `sonner`; `blocker.proceed()` / `blocker.state` from `useBlocker` (react-router-dom).
- Produces: `handleSave(): Promise<boolean>` — returns `true` on success (shows `toast.success`), `false` on failure (shows `toast.error(message)`, no success toast). `onSaveAndLeave` only calls `blocker.proceed()` when `await handleSave()` is `true`. `beforeunload` handler sets `e.returnValue = ''`.

- [ ] **Step 1: Write the failing test**

  Rendering the full `CreateFlower` page (Three.js canvas, recharts, ethers, gRPC health check) is contrived to drive to a save. Instead unit-test the exact `handleSave` control-flow by extracting it into a pure, testable helper and asserting the branch behavior. Create the test file `petal-pixel-studio/src/pages/CreateFlower.save.test.tsx`:

  ```tsx
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { toast } from 'sonner';
  import { runSaveFlow } from './CreateFlower';

  vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  }));

  describe('runSaveFlow', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns true and toasts success when saveFlower resolves', async () => {
      const saveFlower = vi.fn().mockResolvedValue(undefined);
      const result = await runSaveFlow(saveFlower, 'Flower saved to your collection!');
      expect(result).toBe(true);
      expect(saveFlower).toHaveBeenCalledOnce();
      expect(toast.success).toHaveBeenCalledWith('Flower saved to your collection!');
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('returns false and toasts the error when saveFlower rejects', async () => {
      const saveFlower = vi.fn().mockRejectedValue(new Error('new row violates row-level security policy'));
      const result = await runSaveFlow(saveFlower, 'Flower updated!');
      expect(result).toBe(false);
      expect(toast.error).toHaveBeenCalledWith('new row violates row-level security policy');
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('toasts a generic message when the rejection is not an Error', async () => {
      const saveFlower = vi.fn().mockRejectedValue('boom');
      const result = await runSaveFlow(saveFlower, 'Flower updated!');
      expect(result).toBe(false);
      expect(toast.error).toHaveBeenCalledWith('Failed to save flower');
      expect(toast.success).not.toHaveBeenCalled();
    });
  });
  ```

- [ ] **Step 2: Run it, expect FAIL**

  ```
  cd petal-pixel-studio && npx vitest run src/pages/CreateFlower.save.test.tsx
  ```
  Expected: import/type error — `"runSaveFlow" is not exported by "src/pages/CreateFlower.tsx"` (module has no such export yet), so all three tests fail to load/run.

- [ ] **Step 3: Implement**

  In `petal-pixel-studio/src/pages/CreateFlower.tsx`, add an exported pure helper above `export default function CreateFlower()` (e.g. right after the `UnsavedChangesDialog` component, before line 208). It encapsulates the try/catch + toast decision so it is unit-testable and reused by `handleSave`:

  ```tsx
  // Runs the Supabase-backed save and reports the outcome via toast.
  // Returns true only on success; on failure surfaces the error and returns false.
  export async function runSaveFlow(
    saveFlower: () => Promise<void>,
    successMessage: string,
  ): Promise<boolean> {
    try {
      await saveFlower();
      toast.success(successMessage);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save flower';
      toast.error(message);
      return false;
    }
  }
  ```

  Rewrite `handleSave` (current lines 381-404) to return `Promise<boolean>` and delegate the write outcome to `runSaveFlow`. The success-only bookkeeping (dirty-tracking reset) must run only when the save succeeded:

  ```tsx
  const handleSave = async (): Promise<boolean> => {
    if (isSaving) return false;
    if (!params.flowerId) {
      toast.error('Generate a flower first before saving.');
      return false;
    }
    if (!titleInput.trim()) {
      toast.error('Give your flower a title before saving.');
      return false;
    }
    setIsSaving(true);
    try {
      setTitle(titleInput.trim());
      const ok = await runSaveFlow(
        saveFlower,
        isEditMode ? 'Flower updated!' : 'Flower saved to your collection!',
      );
      if (ok) {
        // Reset dirty tracking after a successful save
        originalParamsRef.current = JSON.stringify(useFlowerStore.getState().params);
        originalWordRef.current = wordInput;
        originalTitleRef.current = titleInput.trim();
        setParamsDirty(false);
      }
      return ok;
    } finally {
      setIsSaving(false);
    }
  };
  ```

  The Save button at line 542 already uses `onClick={() => void handleSave()}` and needs no change (the returned promise is intentionally discarded there).

  Gate Save & Leave (current line 477) so navigation proceeds only on a successful save:

  ```tsx
          onSaveAndLeave={async () => { if (await handleSave()) blocker.proceed(); }}
  ```

  Fix the `beforeunload` handler (current line 288) to set `returnValue` so browsers actually show the native leave prompt:

  ```tsx
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
  ```

- [ ] **Step 4: Run it, expect PASS**

  ```
  cd petal-pixel-studio && npx vitest run src/pages/CreateFlower.save.test.tsx
  ```
  Expected: `3 passed`. Also confirm no type regression: `cd petal-pixel-studio && npx tsc --noEmit`.

- [ ] **Step 5: Commit**

  ```
  git add petal-pixel-studio/src/pages/CreateFlower.tsx petal-pixel-studio/src/pages/CreateFlower.save.test.tsx
  git commit -m "fix(create-flower): surface save failures, gate Save & Leave, set beforeunload returnValue"
  ```

- [ ] **Step 6: MANUAL VERIFICATION (failed save -> feedback + navigation blocked)**

  The `handleSave`/`onSaveAndLeave`/`beforeunload` wiring inside the component closure is contrived to drive in a component test, so verify end-to-end in the running app:
  1. Start the stack (`docker compose up`) and open the app; sign in.
  2. Open an existing flower and enter edit mode (navigate from My Flowers with edit state), or generate + save one so a flower exists.
  3. Make a change (edit the title or move a slider) so `hasUnsavedChanges` is true.
  4. Force the Supabase write to fail: in DevTools go offline (Network tab -> Offline), OR temporarily revoke the RLS insert/update policy on the flowers table so the write returns an `{ error }`.
  5. Click **Save** (top bar). Expected: a red `toast.error` appears with the Supabase error message (e.g. offline/RLS message); NO green "Flower updated!"/"saved" toast appears; the title/slider stays dirty (the unsaved-changes state is preserved).
  6. Attempt to navigate away (click a sidebar link). Expected: the **Unsaved changes** dialog appears. Click **Save & Leave** while still offline/RLS-blocked. Expected: `toast.error` again, navigation does NOT proceed (you remain on the Create page, dialog closes only if the store resets `isSaving`; you stay on the page).
  7. Restore connectivity (Network -> Online / re-enable RLS), click **Save**. Expected: green success toast; dirty state clears.
  8. With unsaved changes present, press browser refresh (Cmd+R). Expected: the browser's native "Leave site? Changes you made may not be saved" confirmation prompt appears (this confirms `e.returnValue = ''` took effect).

---

Notes for the assembler: the prompt's cited line numbers were slightly off — `handleSave` actually spans **381-404** (not ~391-403). The Save button (`CreateFlower.tsx:542`) already uses `onClick={() => void handleSave()}`, matching the contract, so no button change is required. This task depends on **T1** (`saveFlower` now re-throws on Supabase write failure); without T1 the failure-path tests and manual step 5/6 cannot be exercised.

---

### Task 3: Guard generate re-entry, regenerate warning on dirty params, and health-check re-entry in CreateFlower

**Files:**
- Modify: `petal-pixel-studio/src/pages/CreateFlower.tsx:352-369` (`handleGenerate` re-entry guard + regenerate gate)
- Modify: `petal-pixel-studio/src/pages/CreateFlower.tsx:493` (Enter `onKeyDown` guard)
- Modify: `petal-pixel-studio/src/pages/CreateFlower.tsx:306-316` (`handleCheckBackend` re-entry guard)
- Modify: `petal-pixel-studio/src/pages/CreateFlower.tsx:521-528` (Backend button `disabled`)
- Test: `petal-pixel-studio/src/pages/createFlowerGuards.test.ts` (new — pure guard-predicate unit tests)

**Interfaces:**
- Consumes (store, unchanged): `useFlowerStore((s) => s.isGenerating): boolean`, `useFlowerStore((s) => s.generationWord): string`, `generateFromWord(word: string): Promise<void>` (sets `isGenerating` true→false, throws on failure).
- Consumes (component state, unchanged): `paramsDirty: boolean` (state, `CreateFlower.tsx:240`), `healthStatus: HealthStatus` where `HealthStatus = 'idle' | 'checking' | 'ok' | 'error'` (`CreateFlower.tsx:45`).
- Produces (new exported pure helpers in a new module `petal-pixel-studio/src/pages/createFlowerGuards.ts`, imported by `CreateFlower.tsx`):
  - `shouldWarnRegenerate(isEditMode: boolean, word: string, generationWord: string, paramsDirty: boolean): boolean` — the corrected gate `isEditMode && (paramsDirty || word !== generationWord)`.
  - `isCheckingBackend(status: HealthStatus): boolean` — `status === 'checking'`.
  - These are what later tasks / tests rely on; the re-entry guards themselves (`isGenerating` early-return, `healthStatus === 'checking'` early-return) stay inline in the handlers.

---

- [ ] **Step 1: Write the failing test**

Create `petal-pixel-studio/src/pages/createFlowerGuards.test.ts`. These are pure predicate tests — the actual click/keyboard re-entry behavior is covered by the MANUAL VERIFICATION steps at the end of this task (the handlers read live component state/closures that are contrived to drive in jsdom).

```ts
import { describe, it, expect } from "vitest";
import { shouldWarnRegenerate, isCheckingBackend } from "./createFlowerGuards";
import type { HealthStatus } from "./createFlowerGuards";

describe("shouldWarnRegenerate", () => {
  it("does not warn when not in edit mode (fresh create)", () => {
    // Defect #11 baseline: create mode never warns, even with a changed word.
    expect(shouldWarnRegenerate(false, "rose", "tulip", true)).toBe(false);
  });

  it("warns when the word changed (existing behavior preserved)", () => {
    expect(shouldWarnRegenerate(true, "tulip", "rose", false)).toBe(true);
  });

  it("warns when params are dirty even if the word is unchanged (defect #11 fix)", () => {
    // This is the regression the fix targets: same word, manual slider tweaks
    // must still trigger the warning so they are not silently discarded.
    expect(shouldWarnRegenerate(true, "rose", "rose", true)).toBe(true);
  });

  it("does not warn when word unchanged and params clean", () => {
    expect(shouldWarnRegenerate(true, "rose", "rose", false)).toBe(false);
  });

  it("warns when both word changed and params dirty", () => {
    expect(shouldWarnRegenerate(true, "tulip", "rose", true)).toBe(true);
  });
});

describe("isCheckingBackend", () => {
  const cases: Array<[HealthStatus, boolean]> = [
    ["idle", false],
    ["checking", true],
    ["ok", false],
    ["error", false],
  ];
  it.each(cases)("status %s -> %s", (status, expected) => {
    expect(isCheckingBackend(status)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

```
cd petal-pixel-studio && npx vitest run src/pages/createFlowerGuards.test.ts
```

Expected: FAIL — `Error: Failed to resolve import "./createFlowerGuards"` (the module does not exist yet), so all tests error/fail to collect.

- [ ] **Step 3: Implement**

3a. Create the new module `petal-pixel-studio/src/pages/createFlowerGuards.ts`:

```ts
export type HealthStatus = 'idle' | 'checking' | 'ok' | 'error';

/**
 * Defect #11: the regenerate warning must fire not only when the generation
 * word changed, but also when the user made manual parameter (slider) tweaks
 * while the word stayed the same — otherwise Generate silently discards them.
 */
export function shouldWarnRegenerate(
  isEditMode: boolean,
  word: string,
  generationWord: string,
  paramsDirty: boolean,
): boolean {
  return isEditMode && (paramsDirty || word !== generationWord);
}

/** Defect #13: used to disable the Backend button and short-circuit re-entry. */
export function isCheckingBackend(status: HealthStatus): boolean {
  return status === 'checking';
}
```

3b. In `petal-pixel-studio/src/pages/CreateFlower.tsx`, remove the local `HealthStatus` type declaration at line 45 and import from the new module instead. Change line 45:

```ts
type HealthStatus = 'idle' | 'checking' | 'ok' | 'error';
```
to a re-use of the shared type by adding to the existing import block near the top (after line 17):

```ts
import {
  shouldWarnRegenerate,
  isCheckingBackend,
  type HealthStatus,
} from './createFlowerGuards';
```
and delete the now-duplicate `type HealthStatus = ...;` line so the type has a single source of truth. (Leave `const [healthStatus, setHealthStatus] = useState<HealthStatus>('idle');` at line 233 as-is — it now uses the imported type.)

3c. Defect #13 — add a re-entry guard to `handleCheckBackend` (lines 306-316). Change:

```ts
  const handleCheckBackend = async () => {
    setHealthStatus('checking');
    try {
```
to:

```ts
  const handleCheckBackend = async () => {
    if (isCheckingBackend(healthStatus)) return;
    setHealthStatus('checking');
    try {
```

3d. Defect #13 — disable the Backend button while checking (lines 521-528). Change the opening `<button>` tag:

```tsx
            <button
              onClick={handleCheckBackend}
              title={healthStatus === 'ok' ? 'Backend online' : healthStatus === 'error' ? 'Backend offline' : 'Check backend'}
              className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
            >
```
to:

```tsx
            <button
              onClick={handleCheckBackend}
              disabled={isCheckingBackend(healthStatus)}
              title={healthStatus === 'ok' ? 'Backend online' : healthStatus === 'error' ? 'Backend offline' : 'Check backend'}
              className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
```

3e. Defect #12 + #11 — add the `isGenerating` re-entry guard and switch the regenerate gate to the shared predicate in `handleGenerate` (lines 352-369). Change:

```ts
  const handleGenerate = async () => {
    const word = wordInput.trim();
    if (!word) {
      toast.error('Enter a generation word first.');
      return;
    }
    if (word.includes(' ')) {
      toast.error('Generation word must be a single word (no spaces).');
      return;
    }

    if (isEditMode && word !== generationWord) {
      setShowRegenerateWarning(true);
      return;
    }

    await doGenerate(word);
  };
```
to:

```ts
  const handleGenerate = async () => {
    if (isGenerating) return;
    const word = wordInput.trim();
    if (!word) {
      toast.error('Enter a generation word first.');
      return;
    }
    if (word.includes(' ')) {
      toast.error('Generation word must be a single word (no spaces).');
      return;
    }

    if (shouldWarnRegenerate(isEditMode, word, generationWord, paramsDirty)) {
      setShowRegenerateWarning(true);
      return;
    }

    await doGenerate(word);
  };
```

3f. Defect #12 — harden the Enter `onKeyDown` on the word input (line 493). The `isGenerating` guard now inside `handleGenerate` covers held-Enter repeats, but also short-circuit at the event level so a held key never even queues extra calls. Change:

```tsx
                onKeyDown={(e) => e.key === 'Enter' && void handleGenerate()}
```
to:

```tsx
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isGenerating) void handleGenerate();
                }}
```

(Note: the Generate button at line 499 already has `disabled={isGenerating}`; the input has no such native guard, which is why holding Enter is the specific defect #12 vector.)

- [ ] **Step 4: Run it, expect PASS**

```
cd petal-pixel-studio && npx vitest run src/pages/createFlowerGuards.test.ts
```

Expected: PASS — 2 describe blocks, 9 tests passing (5 `shouldWarnRegenerate` + 4 `isCheckingBackend`).

Also confirm no type/compile regression from the `HealthStatus` move and the new import:

```
cd petal-pixel-studio && npx tsc --noEmit
```

Expected: exits 0 (no errors).

**MANUAL VERIFICATION** (dev server: `cd petal-pixel-studio && npm run dev`, then open `/create`):

1. Defect #12 — hold Enter: Focus the "Enter a word..." input, type `rose`, then press and HOLD the Enter key for ~2 seconds. Expected: exactly ONE "Flower generated from backend" success toast (or one error toast if backend offline), the Generate button shows "Generating..." for the duration, and the network tab shows a single gRPC `createFlower` call — NOT one per key-repeat.

2. Defect #11 — edit slider then Generate same word: From `MyFlowers`, click a saved flower to enter edit mode (top bar shows "Editing: … word: <word>"). Do NOT change the word input. Drag any slider in `FlowerControls` (e.g. Petal Count) to make `paramsDirty` true. Click **Generate**. Expected: the **"Regenerate flower?"** warning dialog appears (previously it was silently skipped because the word was unchanged). Clicking **Cancel** keeps your manual tweaks; clicking **Regenerate** replaces them with a fresh backend generation.

3. Defect #13 — double-click Backend: Click the **Backend** button (status dot). While the label reads "Checking..." (dot pulsing amber), immediately click it again. Expected: the button is visibly disabled (dimmed, not clickable) during the check, the second click is a no-op, and exactly ONE `/healthz` request is issued (verify in the network tab) with a single "Backend is reachable" / "Backend is offline…" toast.

- [ ] **Step 5: Commit**

```
git add petal-pixel-studio/src/pages/createFlowerGuards.ts \
        petal-pixel-studio/src/pages/createFlowerGuards.test.ts \
        petal-pixel-studio/src/pages/CreateFlower.tsx
git commit -m "fix(create): guard generate re-entry, warn on dirty params, guard health-check

- Add isGenerating re-entry guard to handleGenerate and the word-input Enter
  keydown so holding Enter no longer fires overlapping gRPC calls / duplicate
  toasts (#12).
- Gate the regenerate warning on (paramsDirty || word changed) so manual param
  tweaks on an unchanged word are no longer silently discarded (#11).
- Add re-entry guard to handleCheckBackend and disable the Backend button while
  checking (#13).
- Extract shouldWarnRegenerate / isCheckingBackend as pure, unit-tested helpers.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

Relevant files (absolute paths):
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/pages/CreateFlower.tsx`
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/pages/createFlowerGuards.ts` (new)
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/pages/createFlowerGuards.test.ts` (new)
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/stores/flowerStore.ts` (read-only; `isGenerating`/`generateFromWord`/`generationWord` semantics)
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/integrations/flowerBackend/client.ts` (read-only; `checkFlowerBackendHealth`)

---

### Task 4: Fix `handleConnectWallet` — return the address and enforce the target network

**Files:**
- Modify: `src/pages/CreateFlower.tsx:318-334` (the `handleConnectWallet` body) and the wallet button `onClick` at `src/pages/CreateFlower.tsx:531`
- Test: manual verification only (wallet flow depends on `window.ethereum` + `BrowserProvider`, which is contrived to unit-test; see MANUAL VERIFICATION step)

**Interfaces:**
- Consumes: `ensureCorrectNetwork(provider: BrowserProvider): Promise<void>` (already defined at `src/pages/CreateFlower.tsx:22`); `new BrowserProvider(window.ethereum)` from `ethers`
- Produces: `handleConnectWallet(): Promise<string | null>` — returns the connected checksum address on success, or `null` on rejection / no wallet (still toasts). Consumed by `handleMint` in a later task.

- [ ] **Step 1: Write the failing test** — PURE-UI / integration-shaped; use MANUAL VERIFICATION instead of an automated test.

  MANUAL VERIFICATION (record in PR description, run after Step 3):
  1. Start the dev stack; open `/create` in a browser with MetaMask installed but set to a chain other than `VITE_CHAIN_ID` (default 1337).
  2. Click the **Wallet** button (top action row).
  3. Approve the MetaMask connect prompt.
  4. EXPECT: MetaMask shows a follow-up "Switch network" (or "Add network — Anvil Local") prompt automatically. Approve it.
  5. EXPECT: toast `Wallet connected: 0x1234...abcd`, and the button label changes to the truncated address.
  6. Repeat but REJECT the connect prompt. EXPECT: an error toast, the button label stays `Wallet`, and no unhandled promise rejection appears in the console.

- [ ] **Step 2: Run it, expect FAIL** — no automated test; the pre-change behavior to confirm is that connecting on the wrong network does NOT trigger a switch/add-network prompt (defect #10). Confirm by observing MetaMask stays on the wrong chain after connecting on the current `main` code.

- [ ] **Step 3: Implement** — replace `handleConnectWallet` (lines 318-334) with:

  ```tsx
  const handleConnectWallet = async (): Promise<string | null> => {
    if (!window.ethereum) {
      toast.error('MetaMask not found. Install MetaMask and connect to Ganache RPC.');
      return null;
    }
    try {
      const provider = new BrowserProvider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      await ensureCorrectNetwork(provider);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setWalletAddress(address);
      toast.success(`Wallet connected: ${address.slice(0, 6)}...${address.slice(-4)}`);
      return address;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wallet connection failed';
      toast.error(message);
      return null;
    }
  };
  ```

  Update the wallet button `onClick` at line 531 from `onClick={handleConnectWallet}` to `onClick={() => void handleConnectWallet()}` (the handler now returns a promise; discard the result at the button).

- [ ] **Step 4: Run it, expect PASS** — run `cd petal-pixel-studio && npx tsc --noEmit` (expect no type errors) and `cd petal-pixel-studio && npx eslint src/pages/CreateFlower.tsx` (expect clean). Then re-run the MANUAL VERIFICATION from Step 1 and confirm the network prompt now appears.

- [ ] **Step 5: Commit** — `git add src/pages/CreateFlower.tsx && git commit -m "fix(mint): connect wallet returns address and enforces target network"`

---

### Task 5: Make `markMintedByBackendFlowerId` report Supabase sync failure

**Files:**
- Modify: `src/stores/flowerStore.ts:81` (interface signature) and `src/stores/flowerStore.ts:416-443` (implementation)
- Test: `src/stores/markMintedByBackendFlowerId.test.ts`

**Interfaces:**
- Consumes: `supabase.auth.getUser()` and `supabase.from('user_flowers').update(...).eq(...).eq(...)` from `@/integrations/supabase/client` (mocked)
- Produces: `markMintedByBackendFlowerId(backendFlowerId: string, txHash?: string, tokenUri?: string): Promise<boolean>` — keeps the optimistic local `set()`; returns `true` when the Supabase update succeeds (or there is no signed-in user); returns `false` (and does NOT throw) when the Supabase `{ error }` is truthy. Consumed by `handleMint` in the next task.

- [ ] **Step 1: Write the failing test** — create `src/stores/markMintedByBackendFlowerId.test.ts`:

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

  function seedFlower(overrides: Partial<SavedFlower> = {}): SavedFlower {
    return {
      id: "flower-1",
      backendFlowerId: "flower-1",
      title: "Test",
      generationWord: "test",
      params: { ...baseParams, flowerId: "flower-1" },
      createdAt: "2026-07-02",
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

  describe("markMintedByBackendFlowerId", () => {
    beforeEach(() => {
      getUserMock.mockReset();
      updateMock.mockReset();
      useFlowerStore.setState({ savedFlowers: [seedFlower()] });
    });

    it("returns false when the Supabase update errors, but still applies the optimistic local update", async () => {
      getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
      updateMock.mockReturnValue(chainResolving({ message: "network down" }));

      const ok = await useFlowerStore
        .getState()
        .markMintedByBackendFlowerId("flower-1", "0xdead", "ipfs://uri");

      expect(ok).toBe(false);
      const flower = useFlowerStore.getState().savedFlowers[0];
      expect(flower.isMinted).toBe(true);
      expect(flower.txHash).toBe("0xdead");
    });

    it("returns true when the Supabase update succeeds", async () => {
      getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
      updateMock.mockReturnValue(chainResolving(null));

      const ok = await useFlowerStore
        .getState()
        .markMintedByBackendFlowerId("flower-1", "0xbeef", undefined);

      expect(ok).toBe(true);
    });

    it("returns true (no-op sync) when there is no signed-in user", async () => {
      getUserMock.mockResolvedValue({ data: { user: null } });

      const ok = await useFlowerStore
        .getState()
        .markMintedByBackendFlowerId("flower-1");

      expect(ok).toBe(true);
      expect(updateMock).not.toHaveBeenCalled();
    });
  });
  ```

- [ ] **Step 2: Run it, expect FAIL** — `cd petal-pixel-studio && npx vitest run src/stores/markMintedByBackendFlowerId.test.ts`. Expected: a TypeScript/assertion failure because the current implementation resolves to `Promise<void>` (returns `undefined`), so `expect(ok).toBe(false)` and `expect(ok).toBe(true)` fail (`undefined` is received).

- [ ] **Step 3: Implement** — update the interface line at `src/stores/flowerStore.ts:81`:

  ```ts
  markMintedByBackendFlowerId: (backendFlowerId: string, txHash?: string, tokenUri?: string) => Promise<boolean>;
  ```

  Replace the implementation body (lines 416-443) with:

  ```ts
  markMintedByBackendFlowerId: async (backendFlowerId, txHash, tokenUri) => {
    // Optimistic local update
    set((s) => ({
      savedFlowers: s.savedFlowers.map((f) =>
        f.backendFlowerId === backendFlowerId
          ? { ...f, isMinted: true, txHash: txHash ?? f.txHash, tokenUri: tokenUri ?? f.tokenUri }
          : f,
      ),
    }));

    // Persist to Supabase; report failure to the caller instead of swallowing it.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return true; // nothing to sync (not signed in)

      const { error } = await supabase.from('user_flowers')
        .update({
          is_minted: true,
          tx_hash: txHash ?? null,
          token_uri: tokenUri ?? null,
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

- [ ] **Step 4: Run it, expect PASS** — `cd petal-pixel-studio && npx vitest run src/stores/markMintedByBackendFlowerId.test.ts` (all 3 pass). Also `cd petal-pixel-studio && npx tsc --noEmit` (expect clean).

- [ ] **Step 5: Commit** — `git add src/stores/flowerStore.ts src/stores/markMintedByBackendFlowerId.test.ts && git commit -m "fix(mint): markMintedByBackendFlowerId returns false on Supabase sync failure"`

---

### Task 6: Guard minting a regenerated-but-unsaved flower (auto-save before mint)

**Files:**
- Modify: `src/pages/CreateFlower.tsx:406-420` (top of `handleMint`, before the minting `try`)
- Test: manual verification only (the guard reads component state `isEditMode` + refs + `saveFlower`; it is contrived to unit-test as a component, so use MANUAL VERIFICATION; the underlying save behavior is already covered by store tests)

**Interfaces:**
- Consumes: `params.flowerId` (from `useFlowerStore((s) => s.params)`); `editingFlowerId` / `isEditMode` (`src/pages/CreateFlower.tsx:242`); `hasUnsavedChanges` (`src/pages/CreateFlower.tsx:278-282`); `handleSave(): Promise<boolean>` (from the CreateFlower save-flow task in another group — treat as `Promise<boolean>` per the shared contract); `savedFlowers` for the mismatch check
- Produces: no new exported symbol; establishes that `handleMint` never proceeds to on-chain mint while there is an unsynced regeneration, so the on-chain mint always maps to a persisted `backendFlowerId`.

- [ ] **Step 1: Write the failing test** — PURE-UI; use MANUAL VERIFICATION.

  MANUAL VERIFICATION (record in PR description, run after Step 3):
  1. Sign in, open a previously saved flower from **My Flowers** (enters edit mode; `params.flowerId === savedFlower.backendFlowerId`).
  2. Change the generation word and click **Generate** → confirm the Regenerate dialog. A brand-new backend flower is generated, so `params.flowerId` now differs from the saved `backendFlowerId`, and `hasUnsavedChanges` is `true`.
  3. WITHOUT clicking Save, click **Mint NFT**.
  4. EXPECT (pre-change / defect #4): on `main`, the mint proceeds, gas is spent, and the mint is recorded against a `backendFlowerId` that no `savedFlowers` row has — after a reload the flower shows unminted. This is the bug to fix.
  5. EXPECT (post-change): the flower is auto-saved first (a `Flower updated!` / `saved` toast appears), and only then does minting begin — so the newly-saved `backendFlowerId` matches `params.flowerId`. After reload the minted flower stays minted.
  6. Negative: with no unsaved changes, clicking **Mint NFT** goes straight to minting with no extra save toast.

- [ ] **Step 2: Run it, expect FAIL** — no automated test. Confirm defect #4 manually on `main` per Step 1 item 4 (mint recorded nowhere; unminted after reload).

- [ ] **Step 3: Implement** — insert an unsaved-regeneration guard at the top of `handleMint`, immediately after the `if (!params.flowerId)` block (currently lines 407-410) and before the wallet check. This runs before any wallet connection or gas spend:

  ```tsx
  // Defect #4: never mint a regenerated-but-unsaved flower. If the on-chain
  // flowerId isn't yet persisted (edit mode with unsaved changes, or the
  // params.flowerId doesn't match any saved backendFlowerId), save first so the
  // mint is recorded against a real savedFlowers row.
  const savedFlowers = useFlowerStore.getState().savedFlowers;
  const isPersisted = savedFlowers.some((f) => f.backendFlowerId === params.flowerId);
  if (hasUnsavedChanges || !isPersisted) {
    const saved = await handleSave();
    if (!saved) {
      // handleSave already toasted the reason (e.g. missing title). Abort mint.
      return;
    }
  }
  ```

  Note: `handleSave` (per the shared contract, `Promise<boolean>`) sets `editingFlowerId` to the backend id on the create path and upserts to Supabase, so after it resolves `true`, `params.flowerId` is guaranteed to be a persisted `backendFlowerId`. Add `handleSave` to the closure's usage — it is already defined above `handleMint` in the same component, so no import change is needed.

- [ ] **Step 4: Run it, expect PASS** — `cd petal-pixel-studio && npx tsc --noEmit` (clean) and `cd petal-pixel-studio && npx eslint src/pages/CreateFlower.tsx` (clean). Then re-run the MANUAL VERIFICATION from Step 1 and confirm items 5 and 6.

- [ ] **Step 5: Commit** — `git add src/pages/CreateFlower.tsx && git commit -m "fix(mint): auto-save regenerated flower before minting so the mint is recorded"`

---

### Task 7: Fix `handleMint` — use the connected address (not stale state) and warn on sync failure

**Files:**
- Modify: `src/pages/CreateFlower.tsx:406-463` (the `handleMint` wallet-guard block at 412-420 and the `markMintedByBackendFlowerId` call at 451-452)
- Test: manual verification only (`handleMint` orchestrates `BrowserProvider`, ethers `Contract`, and gRPC calls that are contrived to unit-test as a component; the `false`-return sync-warning path is unit-covered by the store test in the earlier task)

**Interfaces:**
- Consumes: `handleConnectWallet(): Promise<string | null>` (from the earlier connect task); `markMintedByBackendFlowerId(...): Promise<boolean>` (from the store task); `ensureCorrectNetwork` (`:22`); `prepareMintViaGrpc` / `confirmMintViaGrpc` (`@/integrations/flowerBackend/client`); `new BrowserProvider(window.ethereum)`, `Contract` (`ethers`)
- Produces: no new exported symbol; `handleMint` now aborts cleanly when no wallet address is obtained, uses the returned address for the whole flow, and shows a sync-warning toast when the local/Supabase sync fails after a successful on-chain mint. Only shows the plain success toast when the sync returns `true`.

- [ ] **Step 1: Write the failing test** — PURE-UI; use MANUAL VERIFICATION.

  MANUAL VERIFICATION (record in PR description, run after Step 3):
  1. Fresh page load (`walletAddress` state is empty), backend up, a generated + saved flower.
  2. Click **Mint NFT** WITHOUT first clicking Wallet.
  3. EXPECT (pre-change / defect #5): on `main`, `handleMint` calls `handleConnectWallet()` then re-reads the `walletAddress` state variable in the same closure — which is still `''` because React state hasn't updated — so the guard is flaky; it either bails or proceeds on an empty address. Confirm the buggy behavior first.
  4. EXPECT (post-change): the connect prompt appears; after approval, minting proceeds immediately in the same click using the just-returned address (no second click needed). If you REJECT the connect prompt, EXPECT an error toast and NO mint attempt.
  5. Sync-warning path: with a signed-in user, temporarily force the Supabase update to fail (e.g. the paused Supabase project, or block the request in devtools). Complete an on-chain mint. EXPECT: the `Mint tx sent` info toast and the tx/NFT banner still appear, but the final toast is a WARNING `Minted on-chain but failed to sync to your collection` — NOT the plain success toast.
  6. Happy path with sync OK: EXPECT the plain `NFT minted and confirmed in backend` success toast.

- [ ] **Step 2: Run it, expect FAIL** — no automated test. Confirm defect #5 manually per Step 1 item 3 on `main` (stale `walletAddress` read).

- [ ] **Step 3: Implement** — two edits inside `handleMint`.

  (a) Replace the wallet-guard block (current lines 412-420) so it uses the returned address instead of the `walletAddress` state variable:

  ```tsx
    if (!window.ethereum) {
      toast.error('Ethereum provider not found.');
      return;
    }

    // Defect #5: do NOT read the walletAddress state var here — it is stale in
    // this closure right after handleConnectWallet(). Use the returned address.
    let address = walletAddress;
    if (!address) {
      const connected = await handleConnectWallet();
      if (!connected) return; // rejected / no wallet — handleConnectWallet already toasted
      address = connected;
    }
  ```

  Keep the existing `setIsMinting(true)` / `setMintTxHash('')` / `setMintTokenUri('')` lines that follow.

  (b) Replace the sync + success-toast tail (current lines 451-452):

  ```tsx
      const synced = await markMintedByBackendFlowerId(params.flowerId, confirmedHash, tokenUri || undefined);
      if (synced) {
        toast.success('NFT minted and confirmed in backend');
      } else {
        toast.warning('Minted on-chain but failed to sync to your collection');
      }
  ```

  (`toast.warning` is provided by `sonner`, already imported at `src/pages/CreateFlower.tsx:10`. The `signerAddress` local computed at line 430 remains used for `prepareMintViaGrpc`; `address` is the connected-wallet gate value. Both derive from the same signer, so they agree.)

- [ ] **Step 4: Run it, expect PASS** — `cd petal-pixel-studio && npx tsc --noEmit` (clean) and `cd petal-pixel-studio && npx eslint src/pages/CreateFlower.tsx` (clean). Then re-run the MANUAL VERIFICATION from Step 1 and confirm items 4, 5, 6. Also re-run the store test to prove the `false`-return contract still holds: `cd petal-pixel-studio && npx vitest run src/stores/markMintedByBackendFlowerId.test.ts`.

- [ ] **Step 5: Commit** — `git add src/pages/CreateFlower.tsx && git commit -m "fix(mint): use connected address (not stale state) and warn when post-mint sync fails"`

---

Notes for the assembler / sequencing:
- These four tasks are ordered: the connect task and the store task have no cross-dependency and can run in either order; the unsaved-regen guard task depends on `handleSave(): Promise<boolean>` from the CreateFlower save-flow group; the final `handleMint` task depends on both `handleConnectWallet(): Promise<string | null>` and `markMintedByBackendFlowerId(...): Promise<boolean>` from the two tasks above it, so it must come last in this group.
- The `resetFlowerStore()`/clear-on-signOut contract item belongs to a different group (sign-out / persistence) — `signOut` lives in `src/contexts/AuthContext.tsx:114` and the persisted key is `'petal-pixel-flowers'` (`src/stores/flowerStore.ts:503`). Not implemented here; flagged only so the assembler doesn't duplicate it.
- Real anchors used: `ensureCorrectNetwork` at `CreateFlower.tsx:22`; `handleConnectWallet` at `:318`; `handleMint` at `:406`; stale `walletAddress` read at `:412`; `markMintedByBackendFlowerId` interface at `flowerStore.ts:81` and impl at `:416-443` (Supabase `{ error }` swallowed at `:438`). Test harness: Vitest + jsdom, alias `@ -> ./src`, single-file run `cd petal-pixel-studio && npx vitest run <file>`; the store imports are mocked with `vi.mock("@/integrations/supabase/client")` and `vi.mock("@/integrations/flowerBackend/client")`.

---

### Task 8: Add `resetFlowerStore()` action + `loadFromBackend` clears stale cache on error (defect #9)

**Files:**
- Modify: `petal-pixel-studio/src/stores/flowerStore.ts:57-84` (add `resetFlowerStore: () => void;` to the `FlowerStore` interface), `petal-pixel-studio/src/stores/flowerStore.ts:458-461` and `:483-486` (error/catch paths set `savedFlowers: []`), `petal-pixel-studio/src/stores/flowerStore.ts:489-501` (add the `resetFlowerStore` implementation next to `resetParams`)
- Test: `petal-pixel-studio/src/stores/flowerStore.reset.test.ts`

**Interfaces:**
- Consumes: `useFlowerStore` (zustand store) from `@/stores/flowerStore`; `supabase` from `@/integrations/supabase/client`; `createFlowerViaGrpc` from `@/integrations/flowerBackend/client`.
- Produces: `resetFlowerStore(): void` on the store — clears `savedFlowers` to `[]`, resets `editingFlowerId` to `null`, `title` to `"Untitled Flower"`, `generationWord` to `""`, `params` to `defaultParams`, `lastError` to `""`, and removes the persisted `'petal-pixel-flowers'` key via `useFlowerStore.persist.clearStorage()`. `loadFromBackend(): Promise<void>` now sets `savedFlowers: []` on both the Supabase `{ error }` branch and the `catch` branch (no longer keeps the previous cache). Consumed by the AuthContext `signOut` task.

- [ ] **Step 1: Write the failing test** — real test code. The store mocks `@/integrations/supabase/client` and `@/integrations/flowerBackend/client` per the test-setup contract.

```ts
// petal-pixel-studio/src/stores/flowerStore.reset.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/integrations/flowerBackend/client", () => ({
  createFlowerViaGrpc: vi.fn(),
}));

const authGetUser = vi.fn();
const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => authGetUser(...a) },
    from: (...a: unknown[]) => fromMock(...a),
  },
}));

import { useFlowerStore, type SavedFlower } from "@/stores/flowerStore";

const sampleFlower = (id: string): SavedFlower => ({
  id,
  backendFlowerId: id,
  title: "Test Bloom",
  generationWord: "test",
  params: useFlowerStore.getState().params,
  createdAt: "2026-07-02",
  isMinted: false,
});

describe("flowerStore reset + cache hygiene", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useFlowerStore.setState({
      savedFlowers: [sampleFlower("aaa")],
      editingFlowerId: "aaa",
      title: "Someones Flower",
      generationWord: "leftover",
      lastError: "boom",
    });
  });

  it("resetFlowerStore clears savedFlowers and edit state", () => {
    useFlowerStore.getState().resetFlowerStore();
    const s = useFlowerStore.getState();
    expect(s.savedFlowers).toEqual([]);
    expect(s.editingFlowerId).toBeNull();
    expect(s.title).toBe("Untitled Flower");
    expect(s.generationWord).toBe("");
    expect(s.lastError).toBe("");
  });

  it("resetFlowerStore removes the persisted 'petal-pixel-flowers' key", () => {
    localStorage.setItem(
      "petal-pixel-flowers",
      JSON.stringify({ state: { savedFlowers: [sampleFlower("aaa")] }, version: 0 }),
    );
    useFlowerStore.getState().resetFlowerStore();
    expect(localStorage.getItem("petal-pixel-flowers")).toBeNull();
  });

  it("loadFromBackend clears stale savedFlowers when Supabase returns an error", async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: null, error: { message: "db down" } }),
        }),
      }),
    });
    await useFlowerStore.getState().loadFromBackend();
    expect(useFlowerStore.getState().savedFlowers).toEqual([]);
  });

  it("loadFromBackend clears stale savedFlowers when the query throws", async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    fromMock.mockImplementation(() => {
      throw new Error("network");
    });
    await useFlowerStore.getState().loadFromBackend();
    expect(useFlowerStore.getState().savedFlowers).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `cd petal-pixel-studio && npx vitest run src/stores/flowerStore.reset.test.ts`. Expected: `resetFlowerStore is not a function` (TypeError) on the first two tests; the two `loadFromBackend` tests FAIL with `expected [ {id:'aaa',...} ] to deeply equal []` because the current `return` (line 460) and `catch` (lines 483-486) keep the previous cache.

- [ ] **Step 3: Implement**

  1. Add to the `FlowerStore` interface after `resetParams: () => void;` (line 83):
  ```ts
    resetParams: () => void;
    resetFlowerStore: () => void;
  ```
  2. Change the `loadFromBackend` error branch (lines 458-461) from:
  ```ts
      if (error) {
        console.error('loadFromBackend error:', error);
        return;
      }
  ```
  to:
  ```ts
      if (error) {
        console.error('loadFromBackend error:', error);
        set({ savedFlowers: [] });
        return;
      }
  ```
  3. Change the `catch` block (lines 483-486) from:
  ```ts
      } catch (err) {
        console.error('loadFromBackend failed:', err);
        // Keep localStorage cache as fallback
      }
  ```
  to:
  ```ts
      } catch (err) {
        console.error('loadFromBackend failed:', err);
        set({ savedFlowers: [] });
      }
  ```
  4. Add the `resetFlowerStore` implementation immediately after the `resetParams` action (after line 500, before the closing `}),` at line 501):
  ```ts
    resetFlowerStore: () => {
      set({
        savedFlowers: [],
        params: defaultParams,
        editingFlowerId: null,
        title: "Untitled Flower",
        generationWord: "",
        lastError: "",
      });
      useFlowerStore.persist.clearStorage();
    },
  ```

- [ ] **Step 4: Run it, expect PASS** — `cd petal-pixel-studio && npx vitest run src/stores/flowerStore.reset.test.ts`. Expected: 4 passed.

- [ ] **Step 5: Commit** — `git add petal-pixel-studio/src/stores/flowerStore.ts petal-pixel-studio/src/stores/flowerStore.reset.test.ts && git commit -m "fix(store): add resetFlowerStore + clear stale savedFlowers cache on loadFromBackend error"`

---

### Task 9: `signOut` resets the flower store to prevent cross-user cache leak (defect #9)

**Files:**
- Modify: `petal-pixel-studio/src/contexts/AuthContext.tsx:9` (import `useFlowerStore`), `petal-pixel-studio/src/contexts/AuthContext.tsx:114-119` (`signOut` calls `resetFlowerStore()`)
- Test: (manual verification — the redirect + two-user scenario is covered together in the AppSidebar task; the store-clearing logic itself is unit-tested in the previous task)

**Interfaces:**
- Consumes: `resetFlowerStore(): void` (from the store task); `useFlowerStore` from `@/stores/flowerStore`; existing `signOut: () => Promise<void>` (interface line 34).
- Produces: `signOut(): Promise<void>` — after `supabase.auth.signOut()` and clearing `session/user/profile`, also calls `useFlowerStore.getState().resetFlowerStore()`. No signature change.

- [ ] **Step 1: Manual-verification step** (labeled MANUAL — a full AuthProvider component test requires mocking the whole Supabase auth surface and is brittle per the test-setup contract; the store-clear logic is already unit-tested). Deferred to the AppSidebar task's combined MANUAL VERIFICATION (two-user cache scenario).

- [ ] **Step 2: Run it, expect FAIL** — no automated test in this task. Confirm the defect statically: reading `signOut` at `AuthContext.tsx:114-119` shows it never touches the flower store, so `savedFlowers` and the persisted `'petal-pixel-flowers'` key survive logout.

- [ ] **Step 3: Implement**

  1. Add the store import after line 9 (`import { supabase } from "@/integrations/supabase/client";`):
  ```ts
  import { supabase } from "@/integrations/supabase/client";
  import { useFlowerStore } from "@/stores/flowerStore";
  ```
  2. Replace `signOut` (lines 114-119):
  ```ts
    const signOut = async () => {
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
    };
  ```
  with:
  ```ts
    const signOut = async () => {
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
        useFlowerStore.getState().resetFlowerStore();
    };
  ```

- [ ] **Step 4: Run it, expect PASS** — `cd petal-pixel-studio && npx tsc --noEmit` (verify no type errors from the new import/call) and `npx vitest run src/stores/flowerStore.reset.test.ts` (still 4 passed — no regression). Full behavioral confirmation is in the AppSidebar MANUAL VERIFICATION.

- [ ] **Step 5: Commit** — `git add petal-pixel-studio/src/contexts/AuthContext.tsx && git commit -m "fix(auth): reset flower store on signOut to prevent cross-user cache leak"`

---

### Task 10: Logout redirects to `/login` from `AppSidebar` (defect #20)

**Files:**
- Modify: `petal-pixel-studio/src/components/layout/AppSidebar.tsx:1` (add `useNavigate` to the `react-router-dom` import), `:18-21` (grab `navigate`), `:74-80` (button `onClick` awaits `signOut()` then navigates)
- Test: (MANUAL VERIFICATION — combined logout-redirect + two-user cache scenario; a full sidebar render test would need router + AuthProvider + Supabase mocks and is brittle per the contract)

**Interfaces:**
- Consumes: `signOut(): Promise<void>` (now also resets the flower store, from the prior tasks); `useNavigate` from `react-router-dom`; the `/login` route (confirmed at `src/App.tsx:43`).
- Produces: `handleLogout: () => Promise<void>` (local) — awaits `signOut()` then `navigate("/login")`. Button uses `onClick={() => void handleLogout()}`.

- [ ] **Step 1: MANUAL VERIFICATION** (explicit, labeled). Start the dev stack, then:
  1. Sign in as **User A**. Go to `/create`, generate + save a flower (it appears in `/my-flowers` and in the sidebar cache).
  2. Click **Logout** in the sidebar footer.
     - **Expected:** the app navigates to `/login` (URL is `…/login`, the login form is shown) — NOT stuck on a protected page.
     - **Expected:** browser devtools → Application → Local Storage: the `'petal-pixel-flowers'` key is **gone** (removed by `resetFlowerStore`).
  3. Sign in as a **different User B** on the same browser. Go to `/my-flowers`.
     - **Expected:** User A's flowers are **NOT** visible; only User B's own flowers (or an empty state) show. This confirms the cross-user leak (#9) is closed end-to-end.
  4. Log User B out, log User A back in.
     - **Expected:** `/my-flowers` shows User A's flowers again (reloaded fresh from Supabase by `loadFromBackend`).

- [ ] **Step 2: Run it, expect FAIL** — perform Step 1 against the current `main` build FIRST. Expected current (broken) behavior: after clicking Logout the URL stays on the protected page (no redirect, defect #20), and User B sees User A's flowers because `'petal-pixel-flowers'` was never cleared (defect #9).

- [ ] **Step 3: Implement**

  1. Update the router import (line 1):
  ```ts
  import { NavLink, useLocation, useNavigate } from 'react-router-dom';
  ```
  2. Add `navigate` inside `AppSidebar` (after line 19, `const location = useLocation();`) and a `handleLogout` helper before the `return`:
  ```ts
    const location = useLocation();
    const navigate = useNavigate();
    const { profile, user, signOut } = useAuth();

    const handleLogout = async () => {
      await signOut();
      navigate('/login');
    };
  ```
  3. Update the Logout button (lines 74-80) `onClick`:
  ```ts
        <button
          onClick={() => void handleLogout()}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-sidebar-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
  ```

- [ ] **Step 4: Run it, expect PASS** — repeat the Step 1 sequence; all four expectations now hold (redirect to `/login`, key removed, User B does not see User A's flowers, User A's flowers reload on re-login). Also run `cd petal-pixel-studio && npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `git add petal-pixel-studio/src/components/layout/AppSidebar.tsx && git commit -m "fix(sidebar): redirect to /login after logout"`

---

### Task 11: `verifyOtp` uses the correct email OTP type (defect #18)

**Files:**
- Modify: `petal-pixel-studio/src/contexts/AuthContext.tsx:121-128` (`verifyOtp` uses `type: "email"` instead of the hardcoded `"signup"`)
- Test: `petal-pixel-studio/src/contexts/verifyOtp.test.ts`

**Interfaces:**
- Consumes: `supabase.auth.verifyOtp({ email, token, type })` where `type: EmailOtpType` (`'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email'`, confirmed in `@supabase/auth-js` types).
- Produces: unchanged public signature `verifyOtp(email: string, token: string) => Promise<{ error: Error | null }>`. The 8-digit code emailed by `supabase.auth.signUp` is verified with `type: "email"` (the token/OTP confirmation type), not the link-oriented `"signup"`.

- [ ] **Step 1: Write the failing test** — extract nothing; test `verifyOtp` by mocking the Supabase client. Because `AuthContext` couples `verifyOtp` to React state via `useAuth`, unit-test the exact Supabase call shape by rendering the provider is brittle; instead assert on the argument passed to the mocked `supabase.auth.verifyOtp`. Since `verifyOtp` is defined inside `AuthProvider`, test through `renderHook` with the provider wrapper (jsdom is available per the contract).

```ts
// petal-pixel-studio/src/contexts/verifyOtp.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const verifyOtpSpy = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      verifyOtp: (...a: unknown[]) => verifyOtpSpy(...a),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null }) }) }) }),
  },
}));
vi.mock("@/stores/flowerStore", () => ({
  useFlowerStore: { getState: () => ({ resetFlowerStore: vi.fn() }) },
}));

import { AuthProvider, useAuth } from "@/contexts/AuthContext";

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter><AuthProvider>{children}</AuthProvider></MemoryRouter>
);

describe("verifyOtp", () => {
  beforeEach(() => verifyOtpSpy.mockClear());

  it("verifies the emailed signup code with type 'email'", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.verifyOtp("a@b.com", "12345678");
    });
    expect(verifyOtpSpy).toHaveBeenCalledWith({
      email: "a@b.com",
      token: "12345678",
      type: "email",
    });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `cd petal-pixel-studio && npx vitest run src/contexts/verifyOtp.test.ts`. Expected: assertion FAIL — received `type: "signup"`, expected `type: "email"`.

- [ ] **Step 3: Implement** — change `verifyOtp` (lines 121-128):
  ```ts
    const verifyOtp = async (email: string, token: string) => {
        const { error } = await supabase.auth.verifyOtp({
            email,
            token,
            type: "email",
        });
        return { error: error ? new Error(error.message) : null };
    };
  ```
  (The 8-digit numeric code that `supabase.auth.signUp` emails is a token OTP verified with `type: "email"`; `"signup"` is the confirmation-link flow and rejects the token, which is the defect.)

- [ ] **Step 4: Run it, expect PASS** — `cd petal-pixel-studio && npx vitest run src/contexts/verifyOtp.test.ts`. Expected: 1 passed.

- [ ] **Step 5: Commit** — `git add petal-pixel-studio/src/contexts/AuthContext.tsx petal-pixel-studio/src/contexts/verifyOtp.test.ts && git commit -m "fix(auth): verifyOtp uses correct 'email' OTP type instead of hardcoded 'signup'"`

---

### Task 12: `signInWithOAuth` surfaces errors instead of swallowing them (defect #19)

**Files:**
- Modify: `petal-pixel-studio/src/contexts/AuthContext.tsx:33` (interface return type), `:105-112` (implementation returns/throws the error), and `petal-pixel-studio/src/pages/Login.tsx:6,112,137` + `petal-pixel-studio/src/pages/Signup.tsx` OAuth buttons (callers toast on failure)
- Test: `petal-pixel-studio/src/contexts/signInWithOAuth.test.ts`

**Interfaces:**
- Consumes: `supabase.auth.signInWithOAuth({ provider, options })` returning `{ error }`; `toast` from `sonner` (already a dependency, used in `Login.tsx:6`).
- Produces: `signInWithOAuth(provider: "google" | "apple") => Promise<{ error: Error | null }>` — changes the interface return type from `Promise<void>` so the swallowed error is surfaced to callers. Login/Signup OAuth `onClick` handlers await it and `toast.error(error.message)` on failure.

- [ ] **Step 1: Write the failing test**

```ts
// petal-pixel-studio/src/contexts/signInWithOAuth.test.ts
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const oauthSpy = vi.fn().mockResolvedValue({ error: { message: "provider blocked" } });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...a: unknown[]) => oauthSpy(...a),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null }) }) }) }),
  },
}));
vi.mock("@/stores/flowerStore", () => ({
  useFlowerStore: { getState: () => ({ resetFlowerStore: vi.fn() }) },
}));

import { AuthProvider, useAuth } from "@/contexts/AuthContext";

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter><AuthProvider>{children}</AuthProvider></MemoryRouter>
);

describe("signInWithOAuth", () => {
  it("returns the Supabase error instead of swallowing it", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    let ret: { error: Error | null } | undefined;
    await act(async () => {
      ret = await result.current.signInWithOAuth("google");
    });
    expect(ret?.error).toBeInstanceOf(Error);
    expect(ret?.error?.message).toBe("provider blocked");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `cd petal-pixel-studio && npx vitest run src/contexts/signInWithOAuth.test.ts`. Expected: FAIL — `signInWithOAuth` currently returns `undefined` (`Promise<void>`), so `ret?.error` is `undefined`, not an `Error`. (Also a TS error at build: the current interface types it `Promise<void>`.)

- [ ] **Step 3: Implement**

  1. Interface (line 33):
  ```ts
      signInWithOAuth: (
          provider: "google" | "apple",
      ) => Promise<{ error: Error | null }>;
  ```
  2. Implementation (lines 105-112):
  ```ts
    const signInWithOAuth = async (provider: "google" | "apple") => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: window.location.origin,
            },
        });
        return { error: error ? new Error(error.message) : null };
    };
  ```
  3. `Login.tsx` — replace both OAuth `onClick` handlers (lines 112 and 137). Add a small handler after `const navigate = useNavigate();` (line 14):
  ```ts
      const handleOAuth = async (provider: "google" | "apple") => {
          const { error } = await signInWithOAuth(provider);
          if (error) toast.error(error.message);
      };
  ```
  and change `onClick={() => signInWithOAuth("google")}` → `onClick={() => void handleOAuth("google")}` (line 112) and `onClick={() => signInWithOAuth("apple")}` → `onClick={() => void handleOAuth("apple")}` (line 137).
  4. `Signup.tsx` — apply the identical `handleOAuth` helper (it already imports `toast` from `sonner` at line 6 and destructures `signInWithOAuth` at line 14) and update its two OAuth button `onClick`s the same way.

- [ ] **Step 4: Run it, expect PASS** — `cd petal-pixel-studio && npx vitest run src/contexts/signInWithOAuth.test.ts && npx tsc --noEmit`. Expected: 1 passed, no type errors (callers now consume the `{ error }` return). MANUAL: on `/login`, click Google/Apple with OAuth misconfigured → a `toast.error` with the provider message appears (previously silent).

- [ ] **Step 5: Commit** — `git add petal-pixel-studio/src/contexts/AuthContext.tsx petal-pixel-studio/src/pages/Login.tsx petal-pixel-studio/src/pages/Signup.tsx petal-pixel-studio/src/contexts/signInWithOAuth.test.ts && git commit -m "fix(auth): surface OAuth sign-in errors via toast instead of swallowing"`

---

Notes for the assembler / dependency ordering:
- Task order is load-bearing: the `resetFlowerStore` store task MUST precede the `signOut` task (which calls it) and the `AppSidebar` task (whose MANUAL VERIFICATION relies on both the reset action and the redirect).
- The `verifyOtp` and `signInWithOAuth` tasks are independent of the reset chain and of each other; they can be ordered anywhere after the store task's mocks are unaffected.
- `useFlowerStore.persist.clearStorage()` is a first-class API of zustand's `persist` middleware (already used at `flowerStore.ts:180,502-507`) and removes the `'petal-pixel-flowers'` localStorage key — this is preferred over a manual `localStorage.removeItem` so it stays correct if the persist `name` changes.
- Correct `EmailOtpType` for the emailed 8-digit code is `"email"` (verified against `node_modules/@supabase/auth-js/dist/module/lib/types.d.ts:684`).

---

### Task 13: Narrow Flower3D geometry & material `useMemo` deps to the fields they actually read

**Files:**
- Modify: `src/components/flower/Flower3D.tsx:26-34` (geometry `useMemo`) and `src/components/flower/Flower3D.tsx:42-66` (material `useMemo`)
- Test: `src/components/flower/Flower3D.deps.test.ts` (code-inspection guard test) + inline MANUAL VERIFICATION step

**Interfaces:**
- Consumes: `FlowerParams` from `@/stores/flowerStore` (fields read by geometry: `flowerType`, `classicParams`, `roseParams`, `bloomParams`; fields read by material: `flowerType`, `material`, `colorA`, `colorB`, `glowIntensity`). Geometry helpers `createRoseFlowerGeometry`, `createParametricBloomGeometry`, `createClassicFlowerGeometry`, `isBloomType` from `@/math/flowerGeometry`.
- Produces: no new exported symbols. Behavioral contract for later tasks / Phase 2: the geometry `useMemo` dependency array lists exactly `[params.flowerType, params.classicParams, params.roseParams, params.bloomParams]` (Phase 2 appends new family-param fields here); the material `useMemo` dependency array lists exactly `[params.flowerType, params.material, params.colorA, params.colorB, params.glowIntensity]`. `params.rotation` is applied only via the `<group rotation={...}>` transform at line 109 and MUST NOT appear in either memo's deps.

**Testability note (be honest):** This is a render-performance / dependency-correctness fix. There is no pure function to assert against and React does not expose `useMemo` dependency arrays at runtime, so a true behavioral unit test (e.g. "assert geometry object identity is stable across a colorA change") would require rendering the component under `@react-three/fiber` in jsdom — which has no WebGL context and would need heavy mocking of Three.js, making it brittle and low-signal. Instead we use a **source-inspection guard test** (reads the file text and asserts the dep arrays contain the right tokens and exclude `rotation`/`colorA`/`colorB` from the geometry memo) plus an explicit **manual verification** step. The guard test is intentionally coarse: it protects the specific regression (whole-`params` deps) without pretending to prove render behavior.

- [ ] **Step 1: Write the failing test** — create `src/components/flower/Flower3D.deps.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "Flower3D.tsx"), "utf8");

/** Extract the dependency array literal that immediately follows a given memo body marker. */
function depsAfter(marker: string): string {
  const start = source.indexOf(marker);
  expect(start, `marker not found: ${marker}`).toBeGreaterThan(-1);
  // find the "}, [ ... ]);" that closes the useMemo after the marker
  const closeIdx = source.indexOf("}, [", start);
  expect(closeIdx, `no closing deps array after ${marker}`).toBeGreaterThan(-1);
  const arrStart = source.indexOf("[", closeIdx);
  const arrEnd = source.indexOf("]", arrStart);
  return source.slice(arrStart, arrEnd + 1);
}

describe("Flower3D useMemo dependency arrays", () => {
  it("geometry memo depends only on structural family params, never on the whole params or on color/rotation", () => {
    const deps = depsAfter("createClassicFlowerGeometry(params.classicParams)");
    // must key on the exact fields it reads
    expect(deps).toContain("params.flowerType");
    expect(deps).toContain("params.classicParams");
    expect(deps).toContain("params.roseParams");
    expect(deps).toContain("params.bloomParams");
    // must NOT rebuild the ~122k-point geometry on cosmetic changes
    expect(deps).not.toMatch(/\[\s*params\s*\]/); // not the whole params object
    expect(deps).not.toContain("params.colorA");
    expect(deps).not.toContain("params.colorB");
    expect(deps).not.toContain("params.rotation");
    expect(deps).not.toContain("params.material");
    expect(deps).not.toContain("params.glowIntensity");
  });

  it("material memo depends only on color/glow/material fields, never on the whole params or rotation", () => {
    const deps = depsAfter("emissiveIntensity: params.glowIntensity * 0.16");
    expect(deps).toContain("params.flowerType");
    expect(deps).toContain("params.material");
    expect(deps).toContain("params.colorA");
    expect(deps).toContain("params.colorB");
    expect(deps).toContain("params.glowIntensity");
    expect(deps).not.toMatch(/\[\s*params\s*\]/);
    expect(deps).not.toContain("params.rotation");
    expect(deps).not.toContain("params.classicParams");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `cd petal-pixel-studio && npx vitest run src/components/flower/Flower3D.deps.test.ts`. Expected: both tests fail. The geometry-memo test fails on `expect(deps).not.toMatch(/\[\s*params\s*\]/)` because the current dep array at line 34 is literally `[params]` (and `params.flowerType` etc. are absent); the material-memo test fails the same way against line 66's `[params]`.

- [ ] **Step 3: Implement** — narrow both dependency arrays. No memo bodies change; only the arrays.

  Geometry memo, change line 34 from:
  ```ts
    }, [params]);
  ```
  to:
  ```ts
    }, [params.flowerType, params.classicParams, params.roseParams, params.bloomParams]);
  ```

  Material memo, change line 66 from:
  ```ts
    }, [params]);
  ```
  to:
  ```ts
    }, [params.flowerType, params.material, params.colorA, params.colorB, params.glowIntensity]);
  ```

  Rationale to record in the diff/commit: the geometry memo body (lines 27-33) reads only `params.flowerType`, `params.roseParams`, `params.bloomParams`, `params.classicParams`; keying on the whole `params` object (defect #8) rebuilt the ~122k-point `BufferGeometry` and recomputed normals on every `colorA`/`rotation`/`material`/`glowIntensity` edit. `params.rotation` is intentionally excluded — it is applied only via the `<group rotation={[0.3, (params.rotation * Math.PI) / 180, 0]}>` transform at line 109, so a rotation change never needs a geometry or material rebuild. The material memo body (lines 43-64) reads only `params.flowerType`, `params.material`, `params.colorA`, `params.colorB`, `params.glowIntensity`; keying on the whole `params` (defect #16) recreated and disposed the material (line 70) on unrelated edits. Note the `blossomRotation` memo (line 79) and the bounds effect (line 104) already key correctly and are left untouched.

- [ ] **Step 4: Run it, expect PASS** — `cd petal-pixel-studio && npx vitest run src/components/flower/Flower3D.deps.test.ts` (both tests pass). Then confirm the file still typechecks and nothing else broke: `cd petal-pixel-studio && npx tsc --noEmit && npx vitest run`.

  **MANUAL VERIFICATION (WebGL behavior — not covered by the guard test):**
  1. Temporarily add a dev-only counter at the top of the geometry memo body (line 27, before the `if`): `if (import.meta.env.DEV) console.count("[Flower3D] geometry rebuild");` and one at the top of the material memo body (line 43): `if (import.meta.env.DEV) console.count("[Flower3D] material rebuild");`.
  2. `cd petal-pixel-studio && npm run dev`, open the Create flower page, open the browser devtools console.
  3. Drag the **rotation** slider through its full range: expect **zero** new `geometry rebuild` and **zero** `material rebuild` log lines (rotation is a group transform only) — the flower should spin with no stutter.
  4. Drag the **colorA / colorB** picker: expect the `material rebuild` count to increment but the `geometry rebuild` count to stay flat, and no visible mesh-rebuild jank.
  5. Switch **flowerType** (classic → rose → a bloom type): expect both counts to increment (structural change legitimately rebuilds geometry).
  6. **Remove the two `console.count` lines** before committing (they are verification scaffolding only, not part of the fix).

- [ ] **Step 5: Commit** — `git add petal-pixel-studio/src/components/flower/Flower3D.tsx petal-pixel-studio/src/components/flower/Flower3D.deps.test.ts` then:
  ```
  perf(flower3d): narrow geometry & material useMemo deps to fields read

  Geometry memo (#8) and material memo (#16) were keyed on the whole
  params object, rebuilding a ~122k-point BufferGeometry (and recomputing
  normals) plus recreating the material on every color/rotation/material
  edit. Key geometry on flowerType/classicParams/roseParams/bloomParams
  and material on flowerType/material/colorA/colorB/glowIntensity; rotation
  stays a group transform only. Adds a source-inspection guard test.

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

---

### Task 14: Wire or remove dead top-level FlowerControls sliders

**Files:**
- Modify: `src/components/flower/FlowerControls.tsx:121-123,162-165` (Geometry-section Petal Count/Length/Sharpness sliders + Math-section Noise/Frequency/Rotation/Symmetry sliders)
- Modify: `src/components/flower/FlowerControls.tsx:88-92` (add a per-type mapping helper + derive active-type flags)
- Test: `src/components/flower/topLevelSliderMapping.test.ts`

**Interfaces:**
- Consumes (existing store actions, unchanged signatures):
  - `setClassicParam: <K extends keyof ClassicParams>(key: K, value: ClassicParams[K]) => void`
  - `setRoseParam: <K extends keyof RoseParams>(key: K, value: RoseParams[K]) => void`
  - `setBloomParam: <K extends keyof BloomParams>(key: K, value: BloomParams[K]) => void`
  - `setParam: <K extends keyof FlowerParams>(key: K, value: FlowerParams[K]) => void`
  - Type flags: `params.flowerType === 'rose'`, `BLOOM_TYPES.includes(params.flowerType)` (imported from `@/math/flowerTypes`)
  - Render-param facts (verified by reading geometry files):
    - classic (`src/math/flowers/classic.ts:13,16`): renders from `classicParams.pNum`, `pLen`, `pSharp`, `fD`, `curve1`, `curve2`, `b`. NOT from `params.petalCount` etc.
    - rose (`src/math/flowers/rose.ts:73-89`): renders from `roseParams.opening`, `vDensity`, `pAlign`, `curve1`, `curve2`. No petal-count field (petal count emerges from `pAlign`).
    - bloom (`src/math/flowers/bloom.ts:33-51` + `src/math/flowers/bloomProfiles.ts:31-90`): renders from `bloomParams.scale`, `opening`, `density`, `petalFreq`, `petalAmp`, `hangDown`, `fade`. `petalFreq` is the petal-count analogue; `petalAmp` is the sharpness/depth analogue.
- Produces (new module-scope pure helper, used by the test and imported into the component):
  - `export function mapPetalCount(flowerType: FlowerType): { param: 'classic' | 'rose' | 'bloom'; key: string; min: number; max: number; step: number } | null` — returns the render-param a "petal-count-like" slider should drive for the active type, or `null` when no meaningful 3D mapping exists (rose → `null`, so the slider is not rendered for rose). Same shape for `mapPetalDepth(flowerType)` (sharpness analogue).

**Exact per-flowerType mapping (this is the load-bearing decision):**

| Top-level slider (old, no-op vs mesh) | classic | rose | bloom (zinnia/camellia/lotus/dahlia) |
|---|---|---|---|
| Petal Count | `classicParams.pNum` (int 1–20) | *removed for rose* (count is implicit in `pAlign`) | `bloomParams.petalFreq` (0.4–2.2) |
| Petal Length / "size" | `classicParams.pLen` (20–120) | *removed for rose* (rose has no length field) | `bloomParams.scale` (120–420) |
| Petal Sharpness / depth | `classicParams.pSharp` (0–1.4) | *removed for rose* | `bloomParams.petalAmp` (0.4–2.2) |
| Symmetry | REMOVED entirely (no geometry function reads it; classic symmetry is `pNum`, bloom is `petalFreq`, both already covered) | REMOVED | REMOVED |
| Noise Intensity | REMOVED from Geometry section (no mesh read); relocated note below | REMOVED | REMOVED |
| Frequency | REMOVED (no mesh read; the bloom analogue is `petalFreq`, already mapped) | REMOVED | REMOVED |
| Rotation | KEPT as-is — `params.rotation` IS read by `Flower3D.tsx:109` (`rotation={[0.3, (params.rotation * Math.PI)/180, 0]}`). Not a no-op. | KEPT | KEPT |

Rose intentionally shows only its own technique sliders (opening/vDensity/pAlign/curve1/curve2) for the top block, since rose geometry exposes no count/length/sharpness scalar; leaving a rose count slider would be a no-op, violating the invariant.

**Note on cross-consumers (must not break):** `params.petalCount`, `petalLength`, `petalSharpness` are still read by `FlowerInfo.tsx:26-27` (stat panel) and `params.petalCount/petalLength/noiseIntensity/frequency` by `CreateFlower.tsx:61` (MathPanel 2D curve). Do NOT delete these fields from `FlowerParams`. This task only changes what the FlowerControls **sliders** write/read; the fields remain in the store (still set by `generateFromWord`) so those two panels keep working. Removing the Symmetry/Noise/Frequency **sliders** is safe because no other component reads `params.symmetry`, and `noiseIntensity`/`frequency` retain their generated values for the MathPanel.

- [ ] **Step 1: Write the failing test** — pure mapping helper, exercised without rendering. Create `src/components/flower/topLevelSliderMapping.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mapPetalCount, mapPetalDepth } from "./sliderMapping";

describe("top-level slider mapping (Phase 1)", () => {
  it("maps petal-count slider to classicParams.pNum for classic", () => {
    expect(mapPetalCount("classic")).toEqual({
      param: "classic", key: "pNum", min: 1, max: 20, step: 1,
    });
  });

  it("maps petal-count slider to bloomParams.petalFreq for bloom types", () => {
    for (const t of ["zinnia", "camellia", "lotus", "dahlia"] as const) {
      expect(mapPetalCount(t)).toEqual({
        param: "bloom", key: "petalFreq", min: 0.4, max: 2.2, step: 0.05,
      });
    }
  });

  it("returns null for rose (no meaningful count param → slider hidden, not a no-op)", () => {
    expect(mapPetalCount("rose")).toBeNull();
    expect(mapPetalDepth("rose")).toBeNull();
  });

  it("maps petal-depth slider to pSharp (classic) and petalAmp (bloom)", () => {
    expect(mapPetalDepth("classic")).toEqual({
      param: "classic", key: "pSharp", min: 0, max: 1.4, step: 0.01,
    });
    expect(mapPetalDepth("dahlia")).toEqual({
      param: "bloom", key: "petalAmp", min: 0.4, max: 2.2, step: 0.05,
    });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — command:
  ```
  cd petal-pixel-studio && npx vitest run src/components/flower/topLevelSliderMapping.test.ts
  ```
  Expected: FAIL with `Failed to resolve import "./sliderMapping"` (module does not exist yet).

- [ ] **Step 3: Implement**
  1. Create `src/components/flower/sliderMapping.ts` (extracted pure logic so it is directly unit-testable per TEST SETUP guidance):
  ```ts
  import type { FlowerType } from "@/math/flowerTypes";
  import { BLOOM_TYPES } from "@/math/flowerTypes";

  export interface SliderMapping {
    param: "classic" | "rose" | "bloom";
    key: string;
    min: number;
    max: number;
    step: number;
  }

  export function mapPetalCount(flowerType: FlowerType): SliderMapping | null {
    if (flowerType === "rose") return null;
    if (BLOOM_TYPES.includes(flowerType)) {
      return { param: "bloom", key: "petalFreq", min: 0.4, max: 2.2, step: 0.05 };
    }
    return { param: "classic", key: "pNum", min: 1, max: 20, step: 1 };
  }

  export function mapPetalDepth(flowerType: FlowerType): SliderMapping | null {
    if (flowerType === "rose") return null;
    if (BLOOM_TYPES.includes(flowerType)) {
      return { param: "bloom", key: "petalAmp", min: 0.4, max: 2.2, step: 0.05 };
    }
    return { param: "classic", key: "pSharp", min: 0, max: 1.4, step: 0.01 };
  }

  export function mapPetalSize(flowerType: FlowerType): SliderMapping | null {
    if (flowerType === "rose") return null;
    if (BLOOM_TYPES.includes(flowerType)) {
      return { param: "bloom", key: "scale", min: 120, max: 420, step: 1 };
    }
    return { param: "classic", key: "pLen", min: 20, max: 120, step: 1 };
  }
  ```
  2. In `FlowerControls.tsx`, add a dispatch helper inside the component that writes to the correct technique setter given a `SliderMapping`, and a reader for the current value. Replace the destructure at line 89 and add the helpers:
  ```tsx
  import { mapPetalCount, mapPetalDepth, mapPetalSize, type SliderMapping } from './sliderMapping';
  // ...
  export function FlowerControls() {
    const { params, setParam, setFlowerType, setClassicParam, setRoseParam, setBloomParam } = useFlowerStore();

    const isRose = params.flowerType === 'rose';
    const isBloom = BLOOM_TYPES.includes(params.flowerType);

    const readMapped = (m: SliderMapping): number => {
      if (m.param === 'classic') return params.classicParams[m.key as keyof typeof params.classicParams] as number;
      if (m.param === 'bloom') return params.bloomParams[m.key as keyof typeof params.bloomParams] as number;
      return params.roseParams[m.key as keyof typeof params.roseParams] as number;
    };
    const writeMapped = (m: SliderMapping, v: number) => {
      if (m.param === 'classic') setClassicParam(m.key as keyof typeof params.classicParams, v as never);
      else if (m.param === 'bloom') setBloomParam(m.key as keyof typeof params.bloomParams, v as never);
      else setRoseParam(m.key as keyof typeof params.roseParams, v as never);
    };

    const countMap = mapPetalCount(params.flowerType);
    const sizeMap = mapPetalSize(params.flowerType);
    const depthMap = mapPetalDepth(params.flowerType);
  ```
  3. Replace the three Geometry-section sliders (current lines 121-123) with render-param-backed sliders that only appear when a mapping exists:
  ```tsx
  {countMap && (
    <SliderControl label="Petal Count" value={readMapped(countMap)}
      min={countMap.min} max={countMap.max} step={countMap.step}
      onChange={(v) => writeMapped(countMap, v)} />
  )}
  {sizeMap && (
    <SliderControl label="Petal Size" value={readMapped(sizeMap)}
      min={sizeMap.min} max={sizeMap.max} step={sizeMap.step}
      onChange={(v) => writeMapped(sizeMap, v)} />
  )}
  {depthMap && (
    <SliderControl label="Petal Depth" value={readMapped(depthMap)}
      min={depthMap.min} max={depthMap.max} step={depthMap.step}
      onChange={(v) => writeMapped(depthMap, v)} />
  )}
  ```
  (Leave the `Stem (coming soon)` `ToggleControl` at line 124 as-is; it is explicitly labeled non-functional, not a silent no-op.)
  4. In the Math-section footer (current lines 162-165), DELETE the `Noise Intensity`, `Frequency`, and `Symmetry` `SliderControl`s (they write mesh-dead fields). KEEP the `Rotation` slider (line 164) — `params.rotation` is read by `Flower3D.tsx:109`. Result: lines 162-165 collapse to just the Rotation slider.

- [ ] **Step 4: Run it, expect PASS**
  ```
  cd petal-pixel-studio && npx vitest run src/components/flower/topLevelSliderMapping.test.ts
  ```
  Expected: 4 passing tests. Then typecheck: `cd petal-pixel-studio && npx tsc --noEmit` (expect no errors).

  **MANUAL VERIFICATION** (component behavior is contrived to unit-test per TEST SETUP): run `cd petal-pixel-studio && npm run dev`, open the create page, then for each type:
  - Select **classic** → drag "Petal Count" (writes `pNum`): the number of mesh lobes changes. Drag "Petal Size" (`pLen`): lobes lengthen. Drag "Petal Depth" (`pSharp`): lobe tips sharpen. Drag "Rotation": blossom rotates about Y.
  - Select **rose** → confirm "Petal Count/Size/Depth" sliders are ABSENT (no no-ops); only rose technique sliders + Rotation remain, and dragging Opening/vDensity/pAlign visibly reshapes the mesh.
  - Select **zinnia** (or camellia/lotus/dahlia) → drag "Petal Count" (`petalFreq`): petal frequency changes. "Petal Size" (`scale`): bloom scales. "Petal Depth" (`petalAmp`): petal cut depth changes.
  - Confirm "Symmetry", "Noise Intensity", and "Frequency" sliders no longer appear anywhere in the panel. Every remaining slider produces a visible mesh change (invariant satisfied).

- [ ] **Step 5: Commit**
  ```
  git add petal-pixel-studio/src/components/flower/FlowerControls.tsx petal-pixel-studio/src/components/flower/sliderMapping.ts petal-pixel-studio/src/components/flower/topLevelSliderMapping.test.ts
  git commit -m "fix(controls): wire top-level sliders to active-type render params; remove no-op controls

Petal Count/Size/Depth now edit classicParams (pNum/pLen/pSharp) or
bloomParams (petalFreq/scale/petalAmp) per active flowerType, and are
hidden for rose (no scalar mapping). Remove Symmetry/Noise/Frequency
sliders that wrote store fields no geometry function reads (defect #7).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

**Relevant absolute paths:**
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/components/flower/FlowerControls.tsx`
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/components/flower/Flower3D.tsx`
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/math/flowers/classic.ts`
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/math/flowers/rose.ts`
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/math/flowers/bloom.ts`
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/math/flowers/bloomProfiles.ts`
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/math/flowerTypes.ts`
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/stores/flowerStore.ts`

**Caveat surfaced for plan-assembler (not in my task scope but affects correctness):** `params.petalCount/petalLength/petalSharpness/noiseIntensity/frequency` are still consumed by `FlowerInfo.tsx:26-27` and `CreateFlower.tsx:61` (MathPanel), so they must remain in `FlowerParams`. This task removes only the sliders, not the fields. If a later task removes these fields from the model, it must also update those two consumers.

---

### Task 15: Fix degenerate first-row fan in classic flower geometry (#15)

**Files:**
- Modify: `petal-pixel-studio/src/math/flowers/classic.ts:10-31`
- Test: `petal-pixel-studio/src/math/flowers/classic.test.ts`

**Interfaces:**
- Consumes: `createClassicFlowerGeometry(params: ClassicParams): THREE.BufferGeometry` (unchanged signature), `DEFAULT_CLASSIC_PARAMS` from `@/math/flowerTypes`.
- Produces: `createClassicFlowerGeometry` still returns a `THREE.BufferGeometry` with `position` attribute + index; no exported symbol changes. The test file introduces a local (non-exported) helper `minTriangleArea(geometry: THREE.BufferGeometry): number` used only within tests.

**Root cause (verified):** At `classic.ts:10` the loop starts `theta = 0`. At `theta = 0`, line 13 computes `r = (... * 0) / rows = 0` for every `phi`, so all `cols` vertices of row 0 collapse to the single point `(0, 0, vShape(...) - 200 + bumpiness(...))`. The first index band (`theta = 0 → 1`, lines 28-29) then stitches that coincident row to row 1, producing a fan of `2 * cols` zero-area triangles. Fix: skip the degenerate row by starting the position loop at `theta = 1` while keeping the same total vertex/row count, so `r` is never 0 across a whole row.

- [ ] **Step 1: Write the failing test** (real test code)

```ts
// petal-pixel-studio/src/math/flowers/classic.test.ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createClassicFlowerGeometry } from "@/math/flowers/classic";
import { DEFAULT_CLASSIC_PARAMS } from "@/math/flowerTypes";

// Geometry inspection helper: smallest triangle area across the whole index buffer.
function minTriangleArea(geometry: THREE.BufferGeometry): number {
  const pos = geometry.getAttribute("position");
  const index = geometry.getIndex();
  if (!index) throw new Error("geometry has no index");
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  let min = Infinity;
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(pos, index.getX(i));
    b.fromBufferAttribute(pos, index.getX(i + 1));
    c.fromBufferAttribute(pos, index.getX(i + 2));
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    const area = ab.cross(ac).length() * 0.5;
    if (area < min) min = area;
  }
  return min;
}

describe("createClassicFlowerGeometry", () => {
  it("produces no zero-area (degenerate) triangles in any row, including the first", () => {
    const geometry = createClassicFlowerGeometry(DEFAULT_CLASSIC_PARAMS);
    // Every triangle must have a strictly positive area; the old code fanned
    // the entire first row from a single coincident point at theta=0.
    expect(minTriangleArea(geometry)).toBeGreaterThan(1e-6);
  });

  it("has no whole coincident row at the geometry center (r=0 fan removed)", () => {
    const geometry = createClassicFlowerGeometry(DEFAULT_CLASSIC_PARAMS);
    const pos = geometry.getAttribute("position");
    const { cols } = DEFAULT_CLASSIC_PARAMS;
    // Count vertices sitting exactly on the x=y=0 axis; the degenerate build
    // put an entire row (cols vertices) there.
    let onAxis = 0;
    for (let i = 0; i < pos.count; i += 1) {
      if (Math.abs(pos.getX(i)) < 1e-9 && Math.abs(pos.getY(i)) < 1e-9) onAxis += 1;
    }
    expect(onAxis).toBeLessThan(cols);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**
  - Command: `cd petal-pixel-studio && npx vitest run src/math/flowers/classic.test.ts`
  - Expected: first test fails — `expected 0 to be greater than 1e-6` (received `0`, the min area of the theta=0 fan). Second test fails — `expected 144 to be less than 144` (all `cols=144` row-0 vertices lie on the axis).

- [ ] **Step 3: Implement** — in `classic.ts`, start the position loop at `theta = 1` so no full row collapses to `r = 0`. Change lines 10 and 21:

```ts
// was: for (let theta = 0; theta < rows; theta += 1) {
  for (let theta = 1; theta < rows; theta += 1) {
    for (let phi = 0; phi < cols; phi += 1) {
      const angle = (phi * Math.PI * 2) / cols;
      const r = ((pLen * Math.pow(Math.abs(Math.sin((pNum / 2) * angle)), pSharp) + fD) * theta) / rows;
      const x = r * Math.cos(angle);
      const y = r * Math.sin(angle);
      const z = vShape(fHeight, r / 100, curve1, curve2, 1.5) - 200 + bumpiness(b, r / 100, bNum, angle);
      positions.push(x, y, z);
    }
  }

  // Index loop now walks the (rows - 1) generated rows. Vertex row k in the
  // buffer corresponds to theta = k + 1; band `theta` connects buffer rows
  // theta and theta+1, for theta in [0, rows - 2).
// was: for (let theta = 0; theta < rows - 1; theta += 1) {
  for (let theta = 0; theta < rows - 2; theta += 1) {
    for (let phi = 0; phi < cols; phi += 1) {
      const nextPhi = (phi + 1) % cols;
      const a = theta * cols + phi;
      const bIndex = (theta + 1) * cols + phi;
      const c = (theta + 1) * cols + nextPhi;
      const d = theta * cols + nextPhi;
      indices.push(a, bIndex, c);
      indices.push(a, c, d);
    }
  }
```

  Rationale: position loop now emits `rows - 1` rows (theta = 1 … rows-1). Index bands must therefore run `theta` from `0` to `rows - 3` inclusive (`< rows - 2`) so `(theta + 1) * cols + …` never indexes past the last generated row. No index is built off the removed row, so the coincident fan is gone and the innermost surviving row (theta=1) has small-but-nonzero radius `r = (pLen·|sin|^pSharp + fD)/rows`, giving positive-area triangles.

- [ ] **Step 4: Run it, expect PASS**
  - Command: `cd petal-pixel-studio && npx vitest run src/math/flowers/classic.test.ts`
  - Expected: 2 passed. (Sanity: also confirm no index buffer overrun — `geometry.getIndex().array` max value `< pos.count`.)

- [ ] **Step 5: Commit**
  - `cd petal-pixel-studio && git add src/math/flowers/classic.ts src/math/flowers/classic.test.ts`
  - `git commit -m "fix(geometry): remove degenerate first-row fan in classic flower (#15)"`

---

### Task 16: Make full Spiral Fade slider range usable in bloom geometry (#17)

**Files:**
- Modify: `petal-pixel-studio/src/math/flowers/bloom.ts:43` (the `shrink` term)
- Test: `petal-pixel-studio/src/math/flowers/bloom.test.ts`
- Reference only (do NOT change min in this task): slider defined at `petal-pixel-studio/src/components/flower/FlowerControls.tsx:158` (`min={0.4} max={1.8} step={0.05}`).

**Interfaces:**
- Consumes: `createParametricBloomGeometry(type: FlowerType, params: BloomParams): THREE.BufferGeometry` (unchanged signature), `DEFAULT_BLOOM_PARAMS` and `BLOOM_TYPES` from `@/math/flowerTypes`.
- Produces: `createParametricBloomGeometry` unchanged signature/return. Test file introduces local (non-exported) helper `countVertices(geometry: THREE.BufferGeometry): number` used only within tests.

**Root cause (verified):** `bloom.ts:43` computes `shrink = 1 - theta / (profile.fade * params.fade)`. `params.fade` slider min is `0.4` (FlowerControls.tsx:158). For dahlia (`getBloomProfile` default branch, `bloomProfiles.ts:76-83`), `profile.fade = 20000` and `profile.thetaEnd = 5400`; at `params.fade = 0.4` the denominator is `8000`, so `shrink = 0` already at `theta = 8000`, staying positive across the sweep — but zinnia (`fade: 6500`, `thetaEnd: 2700`) at `0.4` gives denominator `2600`, so `shrink ≤ 0` for all `theta ≥ 2600`, and `scale = params.scale * shrink ≤ 0` triggers the `continue` at line 45-47, silently dropping every vertex past `theta = 2600` — well over half the `thetaStart=-360 … thetaEnd=2700` sweep. camellia (`6000`, `thetaEnd 3600`) at `0.4` → denominator `2400`, clips everything past `theta=2400` (a large fraction of 3600). Fix: clamp `shrink` to a positive floor so a low fade slider *tightens* the bloom without deleting geometry, keeping the full `[0.4, 1.8]` range usable.

- [ ] **Step 1: Write the failing test** (real test code)

```ts
// petal-pixel-studio/src/math/flowers/bloom.test.ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createParametricBloomGeometry } from "@/math/flowers/bloom";
import { DEFAULT_BLOOM_PARAMS, BLOOM_TYPES } from "@/math/flowerTypes";

// Geometry inspection helper: number of surviving vertices in the buffer.
function countVertices(geometry: THREE.BufferGeometry): number {
  return geometry.getAttribute("position").count;
}

const SLIDER_FADE_MIN = 0.4; // must match FlowerControls.tsx:158

describe("createParametricBloomGeometry Spiral Fade range", () => {
  it("keeps a meaningful fraction of the bloom at the fade slider minimum", () => {
    for (const type of BLOOM_TYPES) {
      const full = countVertices(
        createParametricBloomGeometry(type, { ...DEFAULT_BLOOM_PARAMS, fade: 1 })
      );
      const clipped = countVertices(
        createParametricBloomGeometry(type, { ...DEFAULT_BLOOM_PARAMS, fade: SLIDER_FADE_MIN })
      );
      // At the slider minimum the old code deleted the far half of the sweep
      // for zinnia/camellia. Require the low end retain most of the geometry.
      expect(clipped / full).toBeGreaterThan(0.8);
    }
  });

  it("does not silently drop the outer sweep for zinnia at fade minimum", () => {
    const clipped = countVertices(
      createParametricBloomGeometry("zinnia", { ...DEFAULT_BLOOM_PARAMS, fade: SLIDER_FADE_MIN })
    );
    // zinnia at the old formula lost every vertex past theta=2600 of a
    // -360..2700 sweep; require a healthy vertex count survives.
    expect(clipped).toBeGreaterThan(1000);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**
  - Command: `cd petal-pixel-studio && npx vitest run src/math/flowers/bloom.test.ts`
  - Expected: first test fails on the `zinnia` iteration — `clipped / full` is well below `0.8` (roughly the fraction of the sweep with `theta < 2600`), so `expected <ratio ≈ 0.4> to be greater than 0.8`. Second test may also fail depending on the surviving-vertex count.

- [ ] **Step 3: Implement** — in `bloom.ts:43`, floor `shrink` at a small positive value so low fade shrinks but never zeroes/negates the scale. Replace the single `shrink` line:

```ts
// was: const shrink = 1 - theta / (profile.fade * params.fade);
      const shrink = Math.max(0.05, 1 - theta / (profile.fade * params.fade));
```

  Rationale: with `shrink ≥ 0.05`, `scale = params.scale * shrink` is always `> 0` (line 44), so the `if (scale <= 0) continue;` guard at lines 45-47 no longer culls the outer sweep. A low fade slider now uniformly compresses the tail of the bloom toward the center (visually "faded/tightened") instead of deleting it, making the entire `[0.4, 1.8]` slider range produce continuous geometry. The `radialCore <= 0` center guard (line 39) is untouched, so genuine center/empty samples are still skipped. No slider min/max edit is required — the mapping is now safe across the existing range.

- [ ] **Step 4: Run it, expect PASS**
  - Command: `cd petal-pixel-studio && npx vitest run src/math/flowers/bloom.test.ts`
  - Expected: 2 passed (all four `BLOOM_TYPES` retain > 80% of vertices at fade = 0.4; zinnia keeps > 1000 vertices).

- [ ] **Step 5: Commit**
  - `cd petal-pixel-studio && git add src/math/flowers/bloom.ts src/math/flowers/bloom.test.ts`
  - `git commit -m "fix(geometry): floor Spiral Fade shrink so full slider range is usable (#17)"`

---

**Notes for the assembler / reviewer (not part of the numbered steps):**
- Both target functions are pure and import only `three`, `@/math/supplement`, `@/math/flowers/bloomProfiles`, and types from `@/math/flowerTypes` — no `vi.mock` of Supabase/gRPC is needed for these tests.
- Real symbols confirmed by reading source: `createClassicFlowerGeometry` (`classic.ts:5`), degenerate loop start `for (let theta = 0; theta < rows; ...)` (`classic.ts:10`) and index band `theta < rows - 1` (`classic.ts:21`); `createParametricBloomGeometry` (`bloom.ts:6`), `shrink = 1 - theta / (profile.fade * params.fade)` (`bloom.ts:43`) with the `scale <= 0` cull at `bloom.ts:45-47`; profile `fade`/`thetaStart`/`thetaEnd` values in `bloomProfiles.ts`; slider `min={0.4}` for "Spiral Fade" at `FlowerControls.tsx:158`; `DEFAULT_CLASSIC_PARAMS`/`DEFAULT_BLOOM_PARAMS`/`BLOOM_TYPES` in `flowerTypes.ts`.
- The 0.8 ratio and 1000-vertex thresholds are conservative given the current profile constants; if profile `fade`/`thetaEnd` values are later retuned, revisit the thresholds.

---

### Task 17: Fix NotFound full-page-reload link (#21)

**Files:**
- Modify: `src/pages/NotFound.tsx:1-24`
- Test: (none — manual verification)

**Interfaces:**
- Consumes: `Link` from `react-router-dom` (already used elsewhere, e.g. `src/pages/MyFlowers.tsx:5`)
- Produces: no exported symbols; `NotFound` default export unchanged

- [ ] **Step 1: Write the failing test** — Pure-UI change. **MANUAL VERIFICATION (do at Step 4):** run `cd petal-pixel-studio && npm run dev`, navigate the browser to a bad route like `http://localhost:5173/does-not-exist`. Confirm the 404 page renders. Open DevTools → Network tab, clear it, then click **Return to Home**. EXPECTED: the app routes to `/` with NO full document reload (Network shows no new HTML document request; only client-side navigation). Before the fix, clicking issues a full-page GET for `/`.

- [ ] **Step 2: Run it, expect FAIL** — No automated test. Baseline observation instead: with the current `<a href="/">`, clicking triggers a full page reload (whole SPA re-boots, Network shows a document request). Record this as the failing baseline.

- [ ] **Step 3: Implement** — Replace the raw anchor with a router `Link`. Edit the import line and the anchor.

  Change line 1 from:
  ```tsx
  import { useLocation } from "react-router-dom";
  ```
  to:
  ```tsx
  import { Link, useLocation } from "react-router-dom";
  ```

  Change lines 16-18 from:
  ```tsx
  <a href="/" className="text-primary underline hover:text-primary/90">
    Return to Home
  </a>
  ```
  to:
  ```tsx
  <Link to="/" className="text-primary underline hover:text-primary/90">
    Return to Home
  </Link>
  ```

- [ ] **Step 4: Run it, expect PASS** — Perform the MANUAL VERIFICATION from Step 1. EXPECTED: clicking **Return to Home** navigates to `/` client-side with no full document reload.

- [ ] **Step 5: Commit**
  ```
  git add petal-pixel-studio/src/pages/NotFound.tsx
  git commit -m "fix(notfound): use router Link instead of raw anchor to avoid full reload"
  ```

---

### Task 18: Add MyFlowers empty state + visible Edit affordance (#22)

**Files:**
- Modify: `src/pages/MyFlowers.tsx:44-159`
- Test: (none — manual verification)

**Interfaces:**
- Consumes: `useFlowerStore` selectors `savedFlowers`, `loadFlowerForEdit`, `deleteFlower` (`src/pages/MyFlowers.tsx:45-47`); existing `handleEdit(flower)` (`:51-54`); `Link`, `Flower2` (already imported `:4-5`)
- Produces: no new exports; `handleEdit` signature unchanged (`(flower: typeof savedFlowers[number]) => void`)

- [ ] **Step 1: Write the failing test** — Pure-UI change (adding an empty state + a keyboard/click-accessible Edit button). **MANUAL VERIFICATION (do at Step 4):**
  1. **Empty state:** In a fresh browser profile (no `petal-pixel-flowers` in localStorage) go to `/my-flowers`. EXPECTED: an empty-state block with a `Flower2` icon and copy like "No flowers yet. Create your first bloom!" plus the existing "Create New Flower" tile — NOT a bare heading with only the dashed create tile.
  2. **Visible Edit affordance:** Create/save at least one flower, return to `/my-flowers`. EXPECTED: each card shows a visible **Edit** button (not hidden behind double-click). Clicking **Edit** navigates to `/create` in editing mode. The old "Double-click to edit" hint text is gone.

- [ ] **Step 2: Run it, expect FAIL** — No automated test. Baseline: currently (a) with zero saved flowers the page shows only the heading and the dashed "Create New Flower" tile (no empty-state messaging), and (b) editing is only reachable via `onDoubleClick` (`:85`) with a faint "Double-click to edit" hint (`:136-138`) — not discoverable/keyboard-accessible. Record as failing baseline.

- [ ] **Step 3: Implement** — Three edits.

  (a) Add an empty-state early branch inside the grid. Wrap the `savedFlowers.map(...)` + create-tile so that when `savedFlowers.length === 0` an empty state renders. Replace the opening of the grid at lines 77-78:
  ```tsx
  <div className="grid grid-cols-3 gap-4">
    {savedFlowers.map((flower, i) => (
  ```
  with:
  ```tsx
  {savedFlowers.length === 0 && (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Flower2 className="w-12 h-12 text-muted-foreground mb-4" />
      <p className="text-sm text-muted-foreground mb-1">No flowers yet.</p>
      <p className="text-xs text-muted-foreground/70">Create your first bloom to start your garden.</p>
    </div>
  )}

  <div className="grid grid-cols-3 gap-4">
    {savedFlowers.map((flower, i) => (
  ```
  (This mirrors the existing empty-state pattern in `src/pages/NftCollection.tsx:18-22`. The "Create New Flower" `Link` tile at `:143-155` stays inside the grid and remains the always-present call to action.)

  (b) Add a visible **Edit** button to each card. Inside the card's image container, next to the delete button (after line 114, before the closing `</div>` at `:115`), add:
  ```tsx
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
  ```
  Add `Pencil` to the lucide-react import on line 4:
  ```tsx
  import { Gem, Calendar, Flower2, Trash2, AlertTriangle, Pencil } from 'lucide-react';
  ```

  (c) Remove the now-redundant double-click hint at lines 136-138:
  ```tsx
  <p className="text-[10px] text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity">
    Double-click to edit
  </p>
  ```
  Delete these three lines. Keep the `onDoubleClick={() => handleEdit(flower)}` on the card (`:85`) as a bonus shortcut, but the button is now the primary affordance. Change the card wrapper `cursor-pointer` (`:84`) to `cursor-default` since the whole card is no longer the click target.

- [ ] **Step 4: Run it, expect PASS** — Perform the MANUAL VERIFICATION from Step 1. EXPECTED: empty state visible when no flowers; a visible **Edit** button on each card that navigates to `/create` editing mode; no "Double-click to edit" text.

- [ ] **Step 5: Commit**
  ```
  git add petal-pixel-studio/src/pages/MyFlowers.tsx
  git commit -m "feat(myflowers): add empty state and visible Edit affordance"
  ```

---

### Task 19: Accessible keyboard-operable Settings switches (#23)

**Files:**
- Modify: `src/pages/SettingsPage.tsx:1-77`
- Test: `src/pages/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: `Switch` from `@/components/ui/switch` (Radix `@radix-ui/react-switch`, renders `role="switch"`, keyboard-operable via Space/Enter, focus ring built in — `src/components/ui/switch.tsx:6-27`); `Label` from `@/components/ui/label` (`src/components/ui/label.tsx`); `useTheme` from `next-themes` (`:4`)
- Produces: no new exports; `SettingsPage` default export unchanged. Switches gain `id` + associated `<Label htmlFor>` + `aria-label`.

- [ ] **Step 1: Write the failing test** — a11y unit test. `@testing-library/user-event` is NOT installed, so drive the keyboard with `fireEvent` + `.focus()`. Radix Switch toggles on `keyDown` Enter/Space, so assert `aria-checked` flips. `next-themes` `useTheme` needs a `ThemeProvider` wrapper (matching `src/App.tsx:26` — `attribute="class"`, `enableSystem={false}`). Create `src/pages/SettingsPage.test.tsx`:

  ```tsx
  import { render, screen, fireEvent } from "@testing-library/react";
  import { ThemeProvider } from "next-themes";
  import { describe, it, expect, beforeEach } from "vitest";
  import SettingsPage from "./SettingsPage";

  function renderPage() {
    return render(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <SettingsPage />
      </ThemeProvider>,
    );
  }

  describe("SettingsPage a11y", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("exposes switches with accessible names", () => {
      renderPage();
      const switches = screen.getAllByRole("switch");
      expect(switches.length).toBeGreaterThanOrEqual(2);
      // Every switch must have an accessible name (label or aria-label)
      switches.forEach((el) => {
        expect(el).toHaveAccessibleName();
      });
    });

    it("toggles the email-notifications switch via keyboard", () => {
      renderPage();
      const emailSwitch = screen.getByRole("switch", { name: /email notifications/i });
      const before = emailSwitch.getAttribute("aria-checked");
      emailSwitch.focus();
      expect(emailSwitch).toHaveFocus();
      // Radix Switch toggles on Enter / Space keydown
      fireEvent.keyDown(emailSwitch, { key: "Enter", code: "Enter" });
      expect(emailSwitch.getAttribute("aria-checked")).not.toBe(before);
    });
  });
  ```

- [ ] **Step 2: Run it, expect FAIL**
  ```
  cd petal-pixel-studio && npx vitest run src/pages/SettingsPage.test.tsx
  ```
  EXPECTED: FAIL. The custom `Toggle` (`src/pages/SettingsPage.tsx:6-19`) renders a `<button role="switch">` with NO accessible name (`toHaveAccessibleName()` fails: "expected element to have accessible name, received ''") and it is a plain `onClick` button that does not toggle on `keyDown` Enter, so `aria-checked` does not flip in the keyboard test.

- [ ] **Step 3: Implement** — Swap the local `Toggle` for the project `Switch` + associate `Label`/`aria-label` per row.

  Replace lines 1-19 (imports + local `Toggle`) with:
  ```tsx
  import { useState, useEffect } from 'react';
  import { motion } from 'framer-motion';
  import { Bell, Moon, Globe, Sun } from 'lucide-react';
  import { useTheme } from 'next-themes';
  import { Switch } from '@/components/ui/switch';
  import { Label } from '@/components/ui/label';
  ```
  (The entire `function Toggle(...) { ... }` block is deleted.)

  Replace the Dark-mode row markup. The label text block at lines 45-48 gets an `htmlFor`, and the `<Toggle>` at line 50 becomes a `<Switch>` with a matching `id` + `aria-label`. Change lines 45-50 from:
  ```tsx
  <div>
    <p className="text-sm font-medium text-foreground">Dark mode</p>
    <p className="text-[10px] text-muted-foreground">Toggle between dark and light theme</p>
  </div>
  </div>
  <Toggle checked={isDark} onChange={(v) => setTheme(v ? 'dark' : 'light')} />
  ```
  to:
  ```tsx
  <div>
    <Label htmlFor="dark-mode-switch" className="text-sm font-medium text-foreground">Dark mode</Label>
    <p className="text-[10px] text-muted-foreground">Toggle between dark and light theme</p>
  </div>
  </div>
  <Switch
    id="dark-mode-switch"
    aria-label="Dark mode"
    checked={isDark}
    onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')}
  />
  ```

  Change the Email-notifications row at lines 56-61 from:
  ```tsx
  <div>
    <p className="text-sm font-medium text-foreground">Email notifications</p>
    <p className="text-[10px] text-muted-foreground">Receive updates about your NFTs</p>
  </div>
  </div>
  <Toggle checked={emailNotif} onChange={setEmailNotif} />
  ```
  to:
  ```tsx
  <div>
    <Label htmlFor="email-notif-switch" className="text-sm font-medium text-foreground">Email notifications</Label>
    <p className="text-[10px] text-muted-foreground">Receive updates about your NFTs</p>
  </div>
  </div>
  <Switch
    id="email-notif-switch"
    aria-label="Email notifications"
    checked={emailNotif}
    onCheckedChange={setEmailNotif}
  />
  ```
  Note: Radix `Switch` uses `onCheckedChange` (not `onChange`), and provides `role="switch"`, `aria-checked`, keyboard toggling (Space/Enter), and a visible focus ring for free. The `aria-label` guarantees an accessible name even independent of the `Label` association.

- [ ] **Step 4: Run it, expect PASS**
  ```
  cd petal-pixel-studio && npx vitest run src/pages/SettingsPage.test.tsx
  ```
  EXPECTED: PASS (2 passing). Optional MANUAL VERIFICATION: on `/settings`, press Tab to focus a switch (visible ring appears), press Space — the toggle flips and (for Dark mode) the theme changes.

- [ ] **Step 5: Commit**
  ```
  git add petal-pixel-studio/src/pages/SettingsPage.tsx petal-pixel-studio/src/pages/SettingsPage.test.tsx
  git commit -m "fix(settings): use accessible Switch with labels for keyboard operability"
  ```

---

### Task 20: Replace fake Payments transactions with honest empty state (#24)

**Files:**
- Modify: `src/pages/Payments.tsx:1-43`
- Test: (none — manual verification)

**Interfaces:**
- Consumes: `CreditCard` from `lucide-react` (already imported `:2`); `motion` (`:1`)
- Produces: no new exports; `Payments` default export unchanged. Removes the hardcoded `transactions` array (`:4-7`) and its `ArrowUpRight`/`ArrowDownLeft` imports.

- [ ] **Step 1: Write the failing test** — Pure-UI change (removing misleading fake data). **MANUAL VERIFICATION (do at Step 4):** go to `/payments`. EXPECTED: NO fabricated transaction rows ("Celestial Bloom", "Nebula Orchid", "0.05 ETH"). Instead an explicit "Demo — coming soon" empty state (icon + heading + subtext making clear this is a demo with no real transactions).

- [ ] **Step 2: Run it, expect FAIL** — No automated test. Baseline: `/payments` currently renders two hardcoded fake transactions from the `transactions` array (`src/pages/Payments.tsx:4-7`) — misleading. Record as failing baseline.

- [ ] **Step 3: Implement** — Rewrite the file to drop the fake array and render an honest empty state. Replace the entire file contents:
  ```tsx
  import { motion } from 'framer-motion';
  import { CreditCard } from 'lucide-react';

  export default function Payments() {
    return (
      <div className="h-full overflow-y-auto p-6 space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Payments</h1>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl border border-border p-5 max-w-lg"
        >
          <div className="flex items-center gap-3 mb-4">
            <CreditCard className="w-5 h-5 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Transaction History</h2>
          </div>

          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CreditCard className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-sm font-medium text-foreground mb-1">Demo — coming soon</p>
            <p className="text-xs text-muted-foreground/70 max-w-xs">
              Payment history isn't available in this demo. Your real mint transactions will appear here once payments go live.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }
  ```
  (This deletes the `transactions` array at `:4-7` and the now-unused `ArrowUpRight`, `ArrowDownLeft` imports, and mirrors the centered empty-state layout from `src/pages/NftCollection.tsx:18-22`.)

- [ ] **Step 4: Run it, expect PASS** — Perform the MANUAL VERIFICATION from Step 1. EXPECTED: no fake rows; a clear "Demo — coming soon" empty state. Also confirm no unused-import lint/TS error: `cd petal-pixel-studio && npx tsc --noEmit` (EXPECTED: no new errors referencing `ArrowUpRight`/`ArrowDownLeft`/`transactions`).

- [ ] **Step 5: Commit**
  ```
  git add petal-pixel-studio/src/pages/Payments.tsx
  git commit -m "fix(payments): replace fake transactions with honest demo empty state"
  ```

---

**Key facts grounding the plan (verified against source):**
- `src/pages/NotFound.tsx:16` uses `<a href="/">` (full reload). `Link` is already available from `react-router-dom` (imported in `MyFlowers.tsx:5`).
- `src/pages/MyFlowers.tsx`: edit is only via `onDoubleClick` (`:85`) with a faint hint (`:136-138`); no empty state (grid at `:77`). `handleEdit` exists at `:51-54`.
- `src/pages/SettingsPage.tsx:6-19` defines a custom `Toggle` `<button role="switch">` with NO accessible name and plain `onClick` (not keyboard-toggling). Project already has an accessible Radix `Switch` at `src/components/ui/switch.tsx` and `Label` at `src/components/ui/label.tsx`. `ThemeProvider` is wired in `src/App.tsx:26` with `attribute="class"`, `enableSystem={false}`.
- `src/pages/Payments.tsx:4-7` hardcodes a fake `transactions` array.
- Test infra: Vitest + jsdom + `@testing-library/react ^16` + `@testing-library/jest-dom ^6`. **`@testing-library/user-event` is NOT installed** — the Settings a11y test uses `fireEvent` + `.focus()`, not `userEvent`. No component tests exist yet; `src/test/example.test.ts` is the only test. Single-file run: `cd petal-pixel-studio && npx vitest run src/pages/SettingsPage.test.tsx`.
- Reusable empty-state pattern to mirror: `src/pages/NftCollection.tsx:18-22`.
