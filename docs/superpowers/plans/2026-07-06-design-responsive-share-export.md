# Plan: Responsive redesign + profile/settings + full share + bright export

Branch `feat/richer-flower-generation` (continues the studio+ work). Design direction &
binding contracts: see memory `petal-pixel-design-direction.md`. Approved forks: FULL share
(Go `/share/:id` HTML OG + public landing), GENERATIVE avatar (from name, no storage),
bright PNG + spinning GIF export.

## Execution order (dependency-sequenced; from the consistency pass)

1. **tokens** — pure foundation; freezes design-token/class names every UI task imports.
2. **shell** — restructures `AppSidebar` → new `SidebarContent.tsx` (`SidebarBody`) + `navItems.ts`; mobile top bar + drawer + theme toggle. MUST precede `profile`.
3. **capture** — owns `snapshot.ts` (renames registry, adds `renderToBlob`), installs **gifenc**. MUST precede `gif` + `share-frontend`.
4. **share-backend** — `main.go` routes only (no frontend contention). Precedes `share-frontend`.
5. **create-responsive** — establishes CreateFlower Row 2 flex-wrap container + `FlowerControls` `className` prop + Controls drawer. Precedes `gif` + `share-frontend` on `CreateFlower.tsx`.
6. **gif** — consumes capture's public `renderToBlob`; replaces the PNG button with a Download PNG/GIF dropdown.
7. **galleries-responsive** — MyFlowers/NftCollection grid reflow + touch actions. Precedes `share-frontend` (card Share buttons).
8. **pages-polish** — Index/Activity/auth/NotFound; independent leaf (anytime after tokens).
9. **profile** — depends on `shell`; targets `SidebarContent.tsx` for the avatar.
10. **settings** — depends on `shell`'s theme mechanism; adds `userPrefs` + sections.
11. **share-frontend** — LAST. Depends on capture + share-backend + create-responsive + gif + galleries-responsive.

## BINDING cross-task fixes (override any draft that says otherwise)

- **gifenc install is owned by `capture` ONLY.** `gif` Step 1 becomes verify-only (`test -d node_modules/gifenc` + confirm it's in `package.json`); do NOT re-run `npm install` and do NOT `git add package.json`/`package-lock.json` in the gif task.
- **`gif` uses the PUBLIC `renderToBlob(opts)` wrapper**, never the private module slot. Per-frame: `await renderToBlob({ frameYaw, size, background })` with a null-check on each blob (renderToBlob returns null when unregistered, never throws). Capture's internal slot is `let current: Renderer | null` — gif must not reference it.
- **CreateFlower.tsx Row 2 is edited by three tasks in this order:** create-responsive (adds responsive flex-wrap container + `Controls` button) → gif (replaces PNG button with Download PNG/GIF dropdown) → share-frontend (adds `Share` button beside the dropdown). Each task after the first RE-LOCATES the toolbar **by content**, not by stale line numbers. New labels use `text-xs` (never `text-[10px]`).
- **`profile` targets `src/components/layout/SidebarContent.tsx`** (created by shell), NOT `AppSidebar.tsx`, for the footer avatar fallback. `shell` already raises the sidebar's two `text-[10px]` to `text-xs`; profile's sidebar text-floor fix is a no-op/verification.
- **share-frontend widens the params type in `client.ts` FIRST.** Add `FlowerParamsJson` (optional v2 fields: `family?`, `palette?: { id; stops: {position;hex;r?;g?;b?}[] }`, optional snake_case shape objects `classic?/rose?/bloom?/sunflower?/rhodonea?/superformula?`) and type `mapBackendJsonToFlowerParams`'s 2nd arg as that, BEFORE writing the mapper. Backend already persists full v2 jsonb; only the FE type is too narrow.
- **share-frontend capture-at-save uses the real id:** after a successful save, `const savedId = useFlowerStore.getState().params.flowerId; if (savedId) await postFlowerPreview(savedId, png);` — there is no bare `id` binding in `handleSave`.
- **OG fallback asset is a single filename: `public/og-cover.png` (raster 1200×630).** share-frontend creates it (a real PNG — rasterize via Docker imagemagick/resvg or a committed asset; scrapers/Telegram render raster reliably, not SVG) and points the static `index.html` `og:image`/`twitter:image` at it. share-backend's `FallbackImagePath` constant = `/og-cover.png` served from `FRONTEND_URL`. Both tasks use the SAME name.
- **shell nav test** asserts the 7 nav paths in order; harden the icon assertion to `expect(item.icon).toBeDefined()` (not `toBe('object')`).
- **Final gate (after ALL tasks):** re-run the tokens baseline grep — `rg "text-\[10px\]" src` must return ZERO. Every one of the 11 current occurrences is claimed by exactly one task.

## Per-task gates

Frontend commands run from `petal-pixel-studio`: `npx tsc --noEmit` + `npx vitest run` (FULL suite, currently 232 green) must stay green each task. `@testing-library/user-event` is NOT installed — use `fireEvent`. Go via Docker `golang:1.25-alpine`; codegen via `bufbuild/buf:1.47.2` (share-backend needs no new proto). Responsive/visual tasks include MANUAL VERIFICATION at 375 / 768 / 1280. Each task ends with a conventional commit.

---

<!-- Task sections assembled from the parallel drafting workflow (wew7kmkpj), ordered + renumbered. The BINDING fixes above override any contradicting draft text. -->

<!-- key=tokens order=1 -->
### Task 1: Design tokens + typography scale + a11y base (foundation)

**Files:**
- Modify: `src/index.css` (add typography/spacing/mono tokens to both `:root` and `.dark`; add global `focus-visible` + `prefers-reduced-motion` base rules; add `@layer components` utilities: `.mono-meta`, `.chip`, `.chip-primary`, `.chip-accent`, `.chip-muted`, `.type-page-title`, `.type-section-title`, `.type-body`, `.type-meta`)
- Modify: `tailwind.config.ts` (register `fontSize` scale keys `meta`/`body`/`title`/`page` bound to the new CSS vars; add `ring`/`ringOffset` nothing-new — reuse `--ring`; keep additive)
- Create: `src/lib/designTokens.ts` (pure, testable token registry other tasks + tests import — single source of truth for the class/token names)
- Create: `src/lib/designTokens.test.ts` (vitest, pure-logic TDD)

**Interfaces:**
- Produces (consumed by all later UI tasks — exact signatures):
  ```ts
  // src/lib/designTokens.ts
  // Typography helper classes (map to @layer components rules in index.css).
  export const typeScale = {
    pageTitle: "type-page-title",   // text-xl sm:text-2xl, font-semibold, tracking-tight
    sectionTitle: "type-section-title", // text-base sm:text-lg, font-medium
    body: "type-body",              // text-sm leading-relaxed
    meta: "type-meta",              // text-xs text-muted-foreground
  } as const;

  // JetBrains-Mono metadata (seed / token id / hex / wallet / contract address).
  export const monoMeta = "mono-meta"; // font-mono text-xs tracking-tight tabular-nums

  // Chip/badge base + tone variants (>=12px text, adequate padding, capitalize-safe).
  export const chip = {
    base: "chip",
    primary: "chip-primary",
    accent: "chip-accent",
    muted: "chip-muted",
  } as const;

  // Focus ring class for elements that don't inherit the global focus-visible rule
  // (e.g. custom non-<button> interactive divs). Global rule covers native controls.
  export const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  export type TypeScaleKey = keyof typeof typeScale;
  export type ChipTone = keyof typeof chip;
  ```
- Consumes: nothing (pure foundation). Later tasks import `{ typeScale, monoMeta, chip, focusRing }` from `@/lib/designTokens` and/or apply the CSS class names directly.

**New token/class names introduced (later tasks MUST use these — do not re-derive):**
- CSS custom properties (added to both `:root` and `.dark`): `--font-size-meta: 0.75rem`, `--font-size-body: 0.875rem`, `--font-size-title: 1.125rem`, `--font-size-page: 1.5rem`, `--leading-body: 1.6`, `--tracking-tight: -0.01em`, `--space-gutter: 1rem`, `--space-section: 1.5rem`, `--radius-chip: 9999px`, `--surface-1`, `--surface-2` (refined near-black step surfaces for dark).
- Utility/component classes: `.mono-meta`, `.chip` / `.chip-primary` / `.chip-accent` / `.chip-muted`, `.type-page-title` / `.type-section-title` / `.type-body` / `.type-meta`.
- Tailwind `fontSize` keys: `text-meta`, `text-body`, `text-title`, `text-page` (all >= 12px; `text-meta` = 0.75rem = 12px, the type FLOOR).

---

- [ ] **Step 1 (RED — pure token registry):** Create `src/lib/designTokens.test.ts` first. Assert the exact contract so later tasks can rely on stable names:
  ```ts
  import { describe, it, expect } from "vitest";
  import { typeScale, monoMeta, chip, focusRing } from "@/lib/designTokens";

  describe("designTokens", () => {
    it("exposes the four type-scale classes with stable names", () => {
      expect(typeScale).toEqual({
        pageTitle: "type-page-title",
        sectionTitle: "type-section-title",
        body: "type-body",
        meta: "type-meta",
      });
    });
    it("exposes the mono-meta class for generative metadata", () => {
      expect(monoMeta).toBe("mono-meta");
    });
    it("exposes chip base + three tone variants", () => {
      expect(chip).toEqual({
        base: "chip",
        primary: "chip-primary",
        accent: "chip-accent",
        muted: "chip-muted",
      });
    });
    it("focusRing uses ring-2 ring-primary with an offset (binding a11y contract)", () => {
      expect(focusRing).toContain("focus-visible:ring-2");
      expect(focusRing).toContain("focus-visible:ring-primary");
      expect(focusRing).toContain("focus-visible:ring-offset-2");
    });
    it("never floors interactive text below 12px (no text-[10px])", () => {
      const all = [...Object.values(typeScale), monoMeta, ...Object.values(chip), focusRing];
      expect(all.join(" ")).not.toMatch(/text-\[10px\]/);
    });
  });
  ```
  Run `npx vitest run src/lib/designTokens.test.ts` — MUST fail (module missing).

- [ ] **Step 2 (GREEN — implement registry):** Create `src/lib/designTokens.ts` with exactly the interface above. Re-run `npx vitest run src/lib/designTokens.test.ts` — MUST pass. This freezes the names every downstream task imports.

- [ ] **Step 3 (Tokens in `:root` + `.dark`):** In `src/index.css`, inside the existing first `@layer base { :root { … } }` and `.dark { … }` blocks, append the new typography/spacing/surface vars listed above. Keep every existing var untouched (additive). For `.dark`, define refined near-black stepped surfaces: `--surface-1: 240 8% 8%` (matches current `--card`), `--surface-2: 240 8% 11%` (one step up for raised panels), keeping emerald `--primary: 160 84% 39%` and violet `--accent: 270 60% 55%` as-is so the palette stays cohesive. Do NOT change `--background`/`--card`/`--primary`/`--accent` values (other tasks depend on them). Gate: `npx tsc --noEmit` (CSS-only change, must stay green).

- [ ] **Step 4 (Global a11y base rules):** In the second `@layer base { … }` block of `src/index.css` (the one with `* { @apply border-border }`), add a global focus-visible ring so native controls get it for free, and a reduced-motion guard:
  ```css
  :where(a, button, input, select, textarea, [tabindex]):focus-visible {
    @apply outline-none ring-2 ring-primary ring-offset-2 ring-offset-background;
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
  ```
  (Uses `:where()` so specificity stays 0 and per-component overrides still win.)

- [ ] **Step 5 (Component utilities):** Add a new `@layer components { … }` block to `src/index.css` (distinct from the existing `@layer utilities`) defining:
  ```css
  .mono-meta { @apply font-mono text-xs tracking-tight tabular-nums; }
  .type-page-title    { @apply text-xl sm:text-2xl font-semibold tracking-tight; }
  .type-section-title { @apply text-base sm:text-lg font-medium; }
  .type-body          { @apply text-sm leading-relaxed; }
  .type-meta          { @apply text-xs text-muted-foreground; }
  .chip { @apply inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium leading-none; }
  .chip-primary { @apply chip bg-primary/10 text-primary; }
  .chip-accent  { @apply chip bg-accent/15 text-accent; }
  .chip-muted   { @apply chip bg-muted text-muted-foreground; }
  ```
  Note the chip padding `px-2.5 py-1` on `text-xs` yields a comfortably tappable pill; the `.chip` floor is `text-xs` (12px) — never `text-[10px]`.

- [ ] **Step 6 (Tailwind fontSize keys):** In `tailwind.config.ts`, under `theme.extend`, add (additive — do not remove existing keys):
  ```ts
  fontSize: {
    meta:  ["var(--font-size-meta)",  { lineHeight: "1.4" }],
    body:  ["var(--font-size-body)",  { lineHeight: "var(--leading-body)" }],
    title: ["var(--font-size-title)", { lineHeight: "1.3" }],
    page:  ["var(--font-size-page)",  { lineHeight: "1.2", letterSpacing: "var(--tracking-tight)" }],
  },
  ```
  Gate: `npx tsc --noEmit` (config is `.ts`, must stay green).

- [ ] **Step 7 (MANUAL VERIFICATION — dark theme + a11y, 3 viewports):** From `petal-pixel-studio` run the Docker dev server (per user's Docker-only toolchain) or `npm run dev` on `:8080`. Create a throwaway probe (a temporary route or a Storybook-less scratch page under `/tmp` scratchpad rendering `<h1 class="type-page-title">`, `<p class="type-body">`, `<span class="mono-meta">seed 0x9f3a…</span>`, and `<span class="chip-primary">rhodonea</span>`), then observe at:
  - **375px (mobile):** page title renders at `text-xl` (20px), body at 14px, meta/chip at 12px — NO text smaller than 12px anywhere; chips are full-height tappable pills.
  - **768px (tablet):** page title steps up to `sm:2xl` (24px); section title to `lg` (18px); layout unchanged otherwise.
  - **1280px (desktop):** same as 768 (no further breakpoint); mono metadata uses JetBrains Mono with tabular figures aligned.
  - **Keyboard a11y (all widths):** Tab through native buttons/links/inputs — each shows a 2px emerald (`ring-primary`) focus ring with a background-colored offset. Toggle OS "Reduce motion" — the `.animate-float`/`.animate-pulse-glow` elements stop animating.
  Expected: emerald primary + violet accent read cohesively on the near-black `--surface-1`/`--surface-2`; delete the throwaway probe after verifying.

- [ ] **Step 8 (Full gates + regression grep):** From `petal-pixel-studio`:
  - `npx tsc --noEmit` — green.
  - `npx vitest run` — full suite green (confirms no existing test broke; setup already stubs `matchMedia`).
  - `grep -rn 'text-\[10px\]' src --include='*.tsx' --include='*.ts'` — record the count; assert this task introduced ZERO new occurrences (pre-existing count is the baseline the page-restyle tasks will drive down; foundation must not add any).

- [ ] **Step 9 (Commit):** `git add src/index.css tailwind.config.ts src/lib/designTokens.ts src/lib/designTokens.test.ts` then commit:
  `feat(design): add type scale, spacing tokens, mono-meta/chip utilities + global focus-visible & reduced-motion base`

**Notes for downstream tasks:** import `{ typeScale, monoMeta, chip, focusRing }` from `@/lib/designTokens`; use `.mono-meta` (or `monoMeta`) for every seed / token id / hex / wallet / contract address; use `.chip-*` for palette-family/status pills (display raw `familyLabel()` output with the CSS `capitalize` class); the global focus-visible rule covers native controls, so only add `focusRing` to custom non-native interactive elements. All new text tokens are >= 12px — replace legacy `text-[10px]` with `text-xs` / `.type-meta` when restyling.

---

<!-- key=shell order=2 -->
### Task 2: Responsive app shell — mobile top bar + drawer sidebar + theme toggle

**Files:**
- Modify: `src/components/layout/DashboardLayout.tsx`
- Modify: `src/components/layout/AppSidebar.tsx`
- Create: `src/components/layout/SidebarContent.tsx` (shared inner sidebar body, reused by desktop rail + mobile drawer)
- Create: `src/components/layout/ThemeToggle.tsx` (shared light/dark toggle button)
- Create: `src/components/layout/navItems.ts` (single source of the 7 nav items, consumed by the shared body)
- Create test: `src/components/layout/navItems.test.ts` (pure-logic guard on the nav set)
- Reuse (no change): `src/components/ui/sheet.tsx`, `src/hooks/use-mobile.tsx` (left intact; not used to drive this layout — Tailwind `lg:` classes drive it instead), `next-themes` `ThemeProvider` already mounted in `src/App.tsx`

**Interfaces:**
- Consumes: `useTheme`/`setTheme` from `next-themes` (provider already mounted in `App.tsx` as `<ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>`); `useAuth()` from `@/contexts/AuthContext` (`profile`, `user`, `signOut`); `Sheet`, `SheetContent` from `@/components/ui/sheet`; `NavLink`/`useLocation`/`useNavigate` from `react-router-dom`.
- Produces:
  - `navItems.ts` → `export interface NavItem { label: string; icon: LucideIcon; path: string }` and `export const NAV_ITEMS: readonly NavItem[]` (exactly 7 items: `/`, `/my-flowers`, `/create`, `/nfts`, `/activity`, `/profile`, `/settings`).
  - `SidebarContent.tsx` → `export function SidebarBody({ onNavigate }: { onNavigate?: () => void }): JSX.Element` (renders logo + nav + footer/user block; calls `onNavigate` on any nav-link click so the mobile drawer can close).
  - `ThemeToggle.tsx` → `export function ThemeToggle({ className }?: { className?: string }): JSX.Element` (icon button toggling `dark`⇄`light`).
  - `AppSidebar.tsx` → still `export function AppSidebar()` (desktop static rail, `hidden lg:flex`), now consuming `SidebarBody`.
  - `DashboardLayout.tsx` → unchanged default export `export function DashboardLayout()`; the responsive shell (sticky mobile top bar `< lg` + `Sheet` drawer + static rail `>= lg`) that every routed page renders inside via `<Outlet />`.

- [ ] **Step 1 — Failing test for the nav-item source (PURE logic).**
  Create `src/components/layout/navItems.test.ts` first (RED — module does not exist yet). Real code:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { NAV_ITEMS } from './navItems';

  describe('NAV_ITEMS', () => {
    it('keeps all 7 nav destinations in order', () => {
      expect(NAV_ITEMS.map((i) => i.path)).toEqual([
        '/', '/my-flowers', '/create', '/nfts', '/activity', '/profile', '/settings',
      ]);
    });
    it('has a non-empty label and an icon component for every item', () => {
      for (const item of NAV_ITEMS) {
        expect(item.label.length).toBeGreaterThan(0);
        expect(typeof item.icon).toBe('object'); // lucide icons are forwardRef objects
      }
    });
    it('has no duplicate paths', () => {
      const paths = NAV_ITEMS.map((i) => i.path);
      expect(new Set(paths).size).toBe(paths.length);
    });
  });
  ```
  Run `npx vitest run src/components/layout/navItems.test.ts` and confirm it FAILS (cannot resolve `./navItems`).

- [ ] **Step 2 — Implement `navItems.ts` (GREEN).**
  Extract the array from `AppSidebar.tsx` verbatim into the new module so it is shared:
  ```ts
  import type { LucideIcon } from 'lucide-react';
  import { LayoutDashboard, Flower2, PlusCircle, Gem, Activity, User, Settings } from 'lucide-react';

  export interface NavItem {
    label: string;
    icon: LucideIcon;
    path: string;
  }

  export const NAV_ITEMS: readonly NavItem[] = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { label: 'My Flowers', icon: Flower2, path: '/my-flowers' },
    { label: 'Create Flower', icon: PlusCircle, path: '/create' },
    { label: 'NFT Collection', icon: Gem, path: '/nfts' },
    { label: 'Activity', icon: Activity, path: '/activity' },
    { label: 'Profile', icon: User, path: '/profile' },
    { label: 'Settings', icon: Settings, path: '/settings' },
  ];
  ```
  Run `npx vitest run src/components/layout/navItems.test.ts` → PASS (GREEN).

- [ ] **Step 3 — Create `ThemeToggle.tsx` (shared control, meets type/tap-target floor).**
  Icon button, `h-10 w-10` (>= 40px), `focus-visible:ring-2 ring-primary`, `aria-label`, JetBrains not required here (not generative metadata). Uses the existing provider. Guard against SSR/hydration mismatch via a mounted flag (next-themes best practice):
  ```tsx
  import { useEffect, useState } from 'react';
  import { useTheme } from 'next-themes';
  import { Moon, Sun } from 'lucide-react';

  export function ThemeToggle({ className = '' }: { className?: string }) {
    const { resolvedTheme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const isDark = mounted ? resolvedTheme === 'dark' : true;
    return (
      <button
        type="button"
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        className={`inline-flex h-10 w-10 items-center justify-center rounded-lg text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
      >
        {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>
    );
  }
  ```

- [ ] **Step 4 — Create `SidebarContent.tsx` (`SidebarBody`) reusing the shared nav + fixing the type floor.**
  Move the logo/nav/user-footer markup out of `AppSidebar.tsx` into `SidebarBody`. Each nav `NavLink` must be `>= 40px` tall (`min-h-10`, keep `py-2.5`) and call `onNavigate` on click (so the mobile drawer closes on nav). Replace both `text-[10px]` instances with `text-xs` (type floor). Put the `ThemeToggle` in the footer for desktop; on mobile it lives in the top bar (Step 6), so accept a prop to avoid duplication:
  ```tsx
  import { NavLink, useLocation, useNavigate } from 'react-router-dom';
  import { motion } from 'framer-motion';
  import { LogOut, User, Sparkles } from 'lucide-react';
  import { useAuth } from '@/contexts/AuthContext';
  import { NAV_ITEMS } from './navItems';
  import { ThemeToggle } from './ThemeToggle';

  export function SidebarBody({
    onNavigate,
    showFooterThemeToggle = true,
  }: {
    onNavigate?: () => void;
    showFooterThemeToggle?: boolean;
  }) {
    const location = useLocation();
    const navigate = useNavigate();
    const { profile, user, signOut } = useAuth();

    const handleLogout = async () => {
      onNavigate?.();
      await signOut();
      navigate('/login');
    };

    return (
      <div className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
        <div className="p-5 flex items-center gap-3 border-b border-sidebar-border">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center glow-primary">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-sidebar-accent-foreground tracking-tight">FlowerNFT</h1>
            <p className="text-xs text-sidebar-foreground font-mono">GENERATOR</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink key={item.path} to={item.path} onClick={() => onNavigate?.()}>
                <motion.div
                  whileHover={{ x: 2 }}
                  className={`flex min-h-10 items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/50'
                  }`}
                >
                  <item.icon className={`w-4 h-4 ${isActive ? 'text-primary' : ''}`} />
                  <span>{item.label}</span>
                  {isActive && (
                    <motion.div layoutId="nav-indicator" className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </motion.div>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border space-y-1">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center overflow-hidden">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <User className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-accent-foreground truncate">
                {profile?.display_name || user?.email || 'User'}
              </p>
              <p className="text-xs text-sidebar-foreground">Free Plan</p>
            </div>
            {showFooterThemeToggle && <ThemeToggle />}
          </div>
          <button
            onClick={() => void handleLogout()}
            className="flex min-h-10 items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-sidebar-foreground hover:text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    );
  }
  ```
  Note the `layoutId="nav-indicator"` is reused in both rail and drawer; framer-motion shares the layout group only within a mounted tree, so the drawer (portaled) animates independently — acceptable, no duplicate-id runtime error.

- [ ] **Step 5 — Rewrite `AppSidebar.tsx` as the desktop-only static rail.**
  It becomes a thin wrapper hidden below `lg` (the task keeps the static rail only `>= lg`):
  ```tsx
  import { SidebarBody } from './SidebarContent';

  export function AppSidebar() {
    return (
      <aside className="hidden lg:flex w-64 h-screen flex-col border-r border-sidebar-border shrink-0">
        <SidebarBody />
      </aside>
    );
  }
  ```

- [ ] **Step 6 — Rewrite `DashboardLayout.tsx`: mobile top bar + `Sheet` drawer + static rail.**
  Lift `drawerOpen` state here; render the sticky top bar and the page outlet as a flex column inside `<main>` so each page's own `h-full overflow-y-auto` scroll container sits *below* the bar (the bar stays put, page scrolls). The bar and drawer are `lg:hidden`; the rail is `hidden lg:flex` (Step 5). Close the drawer on nav via `onNavigate`:
  ```tsx
  import { useEffect, useState } from 'react';
  import { Outlet } from 'react-router-dom';
  import { Menu, Sparkles } from 'lucide-react';
  import { AppSidebar } from './AppSidebar';
  import { SidebarBody } from './SidebarContent';
  import { ThemeToggle } from './ThemeToggle';
  import { Sheet, SheetContent } from '@/components/ui/sheet';
  import { useFlowerStore } from '@/stores/flowerStore';

  export function DashboardLayout() {
    const loadFromBackend = useFlowerStore((s) => s.loadFromBackend);
    const [drawerOpen, setDrawerOpen] = useState(false);

    useEffect(() => {
      void loadFromBackend();
    }, [loadFromBackend]);

    return (
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <AppSidebar />

        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent side="left" className="w-64 p-0 border-sidebar-border [&>button]:hidden">
            <SidebarBody onNavigate={() => setDrawerOpen(false)} showFooterThemeToggle={false} />
          </SheetContent>
        </Sheet>

        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="lg:hidden sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-sidebar-border bg-sidebar/95 px-3 backdrop-blur">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Open navigation menu"
                onClick={() => setDrawerOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center glow-primary">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm font-semibold text-sidebar-accent-foreground tracking-tight">FlowerNFT</span>
              </div>
            </div>
            <ThemeToggle />
          </header>

          <main className="flex-1 overflow-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    );
  }
  ```
  Rationale for the `<main class="flex-1 overflow-hidden">` staying: pages already own `h-full overflow-y-auto p-6`; the bar sits as a sibling above `<main>` inside the new flex column, so page scroll is preserved and the bar never overlaps page content. `[&>button]:hidden` hides `SheetContent`'s built-in close X (the drawer closes on nav / overlay tap / hamburger reopen). Theme toggle appears in the top bar on mobile and in the sidebar footer on desktop (`showFooterThemeToggle={false}` for the drawer instance to avoid a second toggle inside the drawer).

- [ ] **Step 7 — Gate: types + full test suite.**
  From `petal-pixel-studio`:
  ```
  npx tsc --noEmit
  npx vitest run
  ```
  Both MUST pass (tsc clean; all existing tests + the new `navItems.test.ts` green). Note `SettingsPage.test.tsx` already exercises `next-themes`; confirm it still passes.

- [ ] **Step 8 — MANUAL VERIFICATION (VISUAL/responsive).** Start the dev server (Docker Vite dev on `:8080`, or `npm run dev`), log in, and resize the browser to each width. Expected at each viewport:
  - **375px (mobile):** Static rail is HIDDEN. Sticky top bar visible at top (hamburger + FlowerNFT logo left, theme toggle right), stays fixed while the page body scrolls under it. Tap hamburger → drawer slides in from the left with all **7** nav items + user block + logout; tap a nav item → route changes AND drawer closes; tap the dimmed overlay → drawer closes. Tap the theme toggle → page flips dark⇄light (background/foreground CSS vars swap), icon switches Sun⇄Moon. Every nav link is >= 40px tall (verify hit area). No text smaller than `text-xs` (12px) anywhere in the shell.
  - **768px (tablet):** Same as 375 — still `< lg`, so top bar + drawer, no static rail. Drawer width comfortable (`w-64`), overlay covers the page.
  - **1280px (desktop):** Top bar + drawer trigger are GONE (`lg:hidden`); the static 16rem rail is visible on the left with the 7 nav items, active-route indicator dot, user footer, and the theme toggle in the footer. Toggling theme in the footer flips the whole app. Page content scrolls within its own area to the right of the rail.
  - Confirm `prefers-reduced-motion` is respected (framer-motion `whileHover` is a micro-nudge; the Sheet uses CSS animations already in `sheet.tsx` — no new motion added that ignores the preference).

- [ ] **Step 9 — Commit (conventional).**
  ```
  git add src/components/layout/ src/App.tsx
  git commit -m "feat(shell): responsive app chrome — mobile top bar + drawer sidebar + theme toggle"
  ```
  (Only `src/components/layout/*` actually changes; drop `src/App.tsx` from the add if the provider needed no edit — it does not, since `ThemeProvider` is already mounted.)

---

<!-- key=capture order=3 -->
### Task 3: Bright / centered / HD capture pass (fix pale export) + shared `renderToBlob`

**Files:**
- Modify: `src/components/flower/snapshot.ts`
- Modify: `src/components/flower/FlowerCanvas.tsx`
- Modify: `src/components/flower/Flower3D.tsx` (name the group so the bridge can find + rotate it)
- Modify: `src/components/flower/snapshot.test.ts` (extend with new pure-helper tests)
- Create: `package.json` change — add `gifenc` dependency (used by the GIF task, imported by `renderToBlob`'s sibling; install here so the shared module resolves)

**Interfaces:**
- **Produces** (consumed by the GIF task + share/mint tasks):
  - `renderToBlob(opts?: { size?: number; background?: 'transparent' | 'dark' | 'studio' | string; frameYaw?: number }): Promise<Blob | null>` — dedicated bright/centered/HD pass; `frameYaw` (radians) temporarily sets the flower group's world yaw for that one frame then restores it. `background`: `'studio'` = branded neutral gradient, `'dark'` = `#08080f`, `'transparent'` = alpha PNG, any other string = solid CSS color.
  - `captureFlowerPng(): Promise<Blob | null>` (UNCHANGED signature) — now `=> renderToBlob({ size: 1024, background: 'studio' })`. Never throws; resolves `null` when unregistered or on any error.
  - `registerRenderer(fn: Renderer): () => void` where `type Renderer = (opts?: RenderOpts) => Promise<Blob | null>` — replaces `registerSnapshotter`; keeps the stale-unregister guard.
  - `fitWithin(width, height, max)` (UNCHANGED) and new pure helper `frameCameraForBounds(...)` (see Step 3).
- **Consumes:** `computeFlowerBounds` from `@/math/flowerBounds`; `useThree()` `{ gl, scene, camera }`; three `MeshPhysicalMaterial.envMapIntensity`, `scene.background`, `scene.fog`, `scene.environment`, `WebGLRenderer.setSize/render/getPixelRatio`.

Steps:

- [ ] **Step 1 — Rename registry to a renderer that takes opts (pure, TDD).** In `snapshot.test.ts` add a failing block first:
  ```ts
  import { registerRenderer, captureFlowerPng, renderToBlob, fitWithin, frameCameraForBounds } from './snapshot';

  describe('renderer registry', () => {
    it('resolves null when no renderer is registered', async () => {
      await expect(renderToBlob()).resolves.toBeNull();
    });
    it('passes opts through to the registered renderer', async () => {
      const seen: unknown[] = [];
      const blob = new Blob(['x'], { type: 'image/png' });
      const off = registerRenderer(async (opts) => { seen.push(opts); return blob; });
      await expect(renderToBlob({ size: 1024, background: 'studio' })).resolves.toBe(blob);
      expect(seen[0]).toEqual({ size: 1024, background: 'studio' });
      off();
    });
    it('captureFlowerPng requests the studio 1024 preset', async () => {
      const seen: unknown[] = [];
      const off = registerRenderer(async (opts) => { seen.push(opts); return new Blob(); });
      await captureFlowerPng();
      expect(seen[0]).toEqual({ size: 1024, background: 'studio' });
      off();
    });
    it('a stale unregister does not clobber a newer registration', async () => {
      const stale = registerRenderer(async () => null);
      const blob = new Blob(['newer']);
      const newer = registerRenderer(async () => blob);
      stale();
      await expect(renderToBlob()).resolves.toBe(blob);
      newer();
    });
    it('resolves null instead of rejecting when the renderer throws', async () => {
      const off = registerRenderer(async () => { throw new Error('WebGL context lost'); });
      await expect(renderToBlob()).resolves.toBeNull();
      await expect(captureFlowerPng()).resolves.toBeNull();
      off();
    });
  });
  ```
  Then implement in `snapshot.ts`: define `export type RenderOpts = { size?: number; background?: 'transparent' | 'dark' | 'studio' | string; frameYaw?: number }`; `export type Renderer = (opts?: RenderOpts) => Promise<Blob | null>`; keep `let current: Renderer | null`; `registerRenderer` keeps the identical `if (current === fn) current = null` stale guard; `renderToBlob(opts)` = `if (!current) return null; try { return await current(opts); } catch { return null; }`; `captureFlowerPng = () => renderToBlob({ size: 1024, background: 'studio' })`. Delete the old `registerSnapshotter`/`Snapshotter` exports (replaced). Keep `fitWithin`, `downscaleToPng`, `SNAPSHOT_MAX_EDGE` (still used as the on-screen quick-read fallback and by `downscaleToPng`).

- [ ] **Step 2 — Delete the stale `snapshot.test.ts` blocks that referenced `registerSnapshotter`.** Remove the old `describe('snapshot registry', …)` (its `registerSnapshotter` import is gone); the new `describe('renderer registry', …)` from Step 1 supersedes it. Keep the whole `describe('fitWithin', …)` block untouched. Run `npx vitest run src/components/flower/snapshot.test.ts` — green gate for Steps 1–2.

- [ ] **Step 3 — Pure camera-framing helper (TDD).** The bright pass must center/frame from `computeFlowerBounds` at the offscreen aspect (square), independent of the live OrbitControls camera. Add a failing test to `snapshot.test.ts`:
  ```ts
  describe('frameCameraForBounds', () => {
    const b = { center: { x: 0, y: -0.4, z: 0 }, radius: 1 } as const;
    it('places the camera so the bounding sphere fits the vertical FOV with margin', () => {
      const r = frameCameraForBounds(b.center, b.radius, 45, 1 /*aspect*/, 1.35);
      // distance = radius / sin(fov/2) * margin for a sphere; y offset keeps a 3/4 view
      const expected = (1 / Math.sin((45 * Math.PI) / 180 / 2)) * 1.35;
      expect(r.distance).toBeCloseTo(expected, 5);
      expect(r.position.x).toBeCloseTo(b.center.x + expected * 0.5, 5);
      expect(r.target).toEqual(b.center);
    });
    it('widens distance when aspect < 1 so nothing is cropped horizontally', () => {
      const wide = frameCameraForBounds(b.center, b.radius, 45, 1, 1.35).distance;
      const narrow = frameCameraForBounds(b.center, b.radius, 45, 0.5, 1.35).distance;
      expect(narrow).toBeGreaterThan(wide);
    });
    it('never returns a non-finite or zero distance for a degenerate radius', () => {
      const r = frameCameraForBounds(b.center, 0, 45, 1, 1.35);
      expect(Number.isFinite(r.distance)).toBe(true);
      expect(r.distance).toBeGreaterThan(0);
    });
  });
  ```
  Implement `frameCameraForBounds(center:{x,y,z}, radius:number, fovDeg:number, aspect:number, margin:number)` as PURE math (plain objects, no three import needed in the helper — return `{ position:{x,y,z}, target:{x,y,z}, distance }`): guard `const r = Math.max(radius, 0.001)`; vertical half-fov `vh = (fovDeg*π/180)/2`; horizontal half-fov `hh = atan(tan(vh)*aspect)`; `distance = r / sin(min(vh, hh)) * margin` (use the tighter axis so a square/portrait offscreen never crops); position on a fixed 3/4 vector `center + distance*{0.5, 0.35, 0.8}` (mirrors the on-screen `AutoFrameCamera` feel but framed for the square export). This is the load-bearing centering math.

- [ ] **Step 4 — Name the flower group so the bridge can rotate/center it.** In `Flower3D.tsx`, add `name="flower-group"` to the outer `<group ref={groupRef} …>`. (No behavior change; `computeFlowerBounds` centers on geometry, but the GIF `frameYaw` needs a stable handle — `scene.getObjectByName('flower-group')`.) Run `npx tsc --noEmit`.

- [ ] **Step 5 — Implement the dedicated bright/HD/centered pass in `SnapshotBridge` (VISUAL; wired via `registerRenderer`).** Rewrite `SnapshotBridge` in `FlowerCanvas.tsx` to register a `Renderer`. Import `registerRenderer, fitWithin` (drop `registerSnapshotter, downscaleToPng`), plus `computeFlowerBounds` inputs already flow through `bounds`. The renderer must, inside one synchronous `gl.render` task, **save → mutate → render → readback → restore**:
  1. **Save on-screen state:** `prevSize = gl.getSize(new Vector2())`, `prevPixelRatio = gl.getPixelRatio()`, `prevBg = scene.background`, `prevFog = scene.fog`, `prevEnv = scene.environment`, `prevToneExp = gl.toneMappingExposure`, and the flower material's `prevEnvMapIntensity`/`prevEmissiveIntensity` (find mesh via `scene.getObjectByName('flower-group')`, first child mesh; guard null).
  2. **Mutate for the bright pass:** `scene.fog = null`; set `scene.background` per `opts.background` — `'transparent'` → `scene.background = null` + render target/`gl` cleared with alpha (use a **temporary offscreen `WebGLRenderTarget`** so we don't fight the `alpha:false` on-screen context; see step 5.iii); `'dark'` → keep `#08080f` Color; `'studio'` → a neutral branded `Color` (`#14141c`, near-black but lifted so the flower reads bright) — a full gradient background is deferred to the composite step below; any other string → `new Color(str)`. Bump light: `gl.toneMappingExposure = prevToneExp * 1.5`, and on the flower material set `envMapIntensity = 1.6` and leave emissive as-is (do NOT raise emissive — it already blooms). Optionally swap `scene.environment` to a brighter preset is out of scope here (keep `night` IBL but the exposure bump + envMapIntensity is what fixes the pale look).
  3. **Render at HD offscreen, DPR-aware:** compute `size = opts.size ?? 1024`; create `const rt = new WebGLRenderTarget(size, size, { … })`; frame the camera with a **cloned** camera (don't mutate the live OrbitControls camera): `const cam = camera.clone(); cam.aspect = 1; ` then apply `frameCameraForBounds(bounds.center, bounds.radius, cam.fov, 1, 1.35)` → set `cam.position`, `cam.lookAt(target)`, `cam.near = 0.01`, `cam.far = distance*12`, `cam.updateProjectionMatrix()`. If `opts.frameYaw != null`, set `flowerGroup.rotation.y = opts.frameYaw` (save/restore in the finally). `gl.setRenderTarget(rt); gl.render(scene, cam); ` then read pixels via `gl.readRenderTargetPixels(rt, 0,0,size,size, buffer)` into a `Uint8Array`, blit into a 2D canvas (`putImageData`, flipping Y since GL origin is bottom-left), and `canvas.toBlob(resolve,'image/png')`.
  4. **Restore EVERYTHING in a `finally`:** `gl.setRenderTarget(null)`, restore bg/fog/environment/toneMappingExposure/material envMapIntensity, `flowerGroup.rotation.y` (if frameYaw was set), dispose `rt`, and `gl.render(scene, camera)` once with the ORIGINAL camera so the on-screen frame is unchanged. `renderToBlob`'s outer try/catch already guarantees never-throw, but wrap the bridge body defensively too and `return null` if `bounds` is null or WebGL readback fails.

  **MANUAL VERIFICATION (download must be bright/crisp/centered):** run the app from `petal-pixel-studio` (`docker compose up` per the Docker toolchain, frontend on `:8080`). At each viewport click "Download PNG" and open the file:
  - **375px (mobile):** flower centered, fully inside frame (not cropped), background a clean lifted-neutral (not the murky `#08080f`+fog), petals visibly brighter than the on-screen canvas. File is 1024×1024.
  - **768px (tablet):** same; confirm the on-screen 3D view is UNCHANGED after download (no zoom/rotation/darkening left behind — proves restore works).
  - **1280px (desktop):** downloaded PNG edges are crisp (no 512-blur), flower centered regardless of current orbit angle.
  Expected vs current: current download is pale/dark/soft (live framebuffer downscaled to 512); new download is bright, 1024px sharp, centered.

- [ ] **Step 6 — Wire `captureFlowerPng` callers stay working (no caller change).** Confirm `CreateFlower.tsx:500` (download) and `:679` (mint png) still compile against the unchanged `captureFlowerPng(): Promise<Blob|null>` — no edits expected. Grep to prove no lingering `registerSnapshotter`/`downscaleToPng` import in `FlowerCanvas.tsx`. Run `npx tsc --noEmit`.

- [ ] **Step 7 — Add `gifenc` dependency (for the sibling GIF task that imports from this module family).** From `petal-pixel-studio`: `npm install gifenc@^1.0.3`. (Pure-JS, no native build.) Confirm `node_modules/gifenc` resolves and `package-lock.json` updated. This module does not import it yet, but installing here unblocks the GIF task's `captureFlowerGif` which reuses `renderToBlob({ frameYaw })`.

- [ ] **Step 8 — Full gate + commit.** From `petal-pixel-studio`: `npx tsc --noEmit` then `npx vitest run` (full suite — `frameCameraForBounds`, `fitWithin`, renderer-registry, and all existing tests must pass; note the offscreen WebGL path is not unit-tested under jsdom by design — it is covered by the Step 5 manual verification). Then commit: `git commit -am "feat(capture): dedicated bright/HD/centered renderToBlob pass; fix pale PNG export"`.

---

Relevant absolute paths for the implementer:
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/components/flower/snapshot.ts`
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/components/flower/snapshot.test.ts`
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/components/flower/FlowerCanvas.tsx`
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/components/flower/Flower3D.tsx`
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/math/flowerBounds.ts`
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/pages/CreateFlower.tsx` (callers at lines 500, 679 — unchanged)

Load-bearing facts baked into the plan: current `SnapshotBridge` reads the live `#08080f`+fog+`night`-IBL `alpha:false` framebuffer at DPR and `downscaleToPng`s it to 512 (the pale/soft cause); the fix is an offscreen `WebGLRenderTarget` pass with `scene.fog=null`, lifted `scene.background`, `toneMappingExposure*1.5`, material `envMapIntensity=1.6`, square 1024 render framed by `frameCameraForBounds`, then full save/restore. `captureFlowerPng()`'s signature is frozen because `CreateFlower.tsx` calls it with no args in two places. `gifenc` is not yet installed (latest 1.0.3, pure JS). Three r0.160 `MeshPhysicalMaterial` supports `envMapIntensity`.

---

<!-- key=share-backend order=4 -->
### Task 4: Backend share — Go `/share/:id` OG HTML + public flower JSON + preview upload

**Files:**
- Modify: `flower-backend/cmd/server/main.go` (wire 3 new routes onto the existing mux + `FRONTEND_URL` env + pass `frontendURL` into handlers; extend CORS methods for the preview POST)
- Create: `flower-backend/internal/share/share.go` (pure, dependency-free: `RenderShareHTML`, `PublicFlowerJSON`, and their input structs — no DB, no S3, no `net/http`)
- Create: `flower-backend/internal/share/share_test.go` (Docker Go unit tests for the pure bits)

**Interfaces:**
- Consumes:
  - `grpcapi.Store.GetFlower(ctx, flowerID) (*grpcapi.FlowerRow, error)` — returns `FlowerRow{FlowerID, PersonName string; Params flower.Params}`; maps `sql.ErrNoRows` → `status.Error(codes.NotFound, …)`. Handler must translate NotFound → HTTP 404.
  - `assets.S3Uploader.Exists(ctx, key) (bool, error)`, `.PublicURL(key) (string, error)`, `.PutBytes(ctx, key, contentType string, r io.Reader) (string, error)`.
  - `flower.Params{ Seed uint64 (json:"seed"); AlgoVersion string; Family string (json:"family,omitempty"); … }`.
  - Env `S3_PUBLIC_BASE_URL` (public MinIO base, e.g. `http://localhost:9000/flower`); new env `FRONTEND_URL` (default `http://localhost:8080`).
  - Image object key convention already used by `PrepareMint`: `images/<flowerId>.png`.
- Produces (relied on by the frontend SPA landing task):
  - `GET /share/{flowerId}` → `text/html; charset=utf-8`, 200 with per-flower OG/Twitter tags, or 404 (branded HTML) if unknown.
  - `GET /api/flowers/{flowerId}` → `application/json`: `{"flower_id":string,"person_name":string,"params":<raw params jsonb>}`, 404 `{"error":"not found"}` if unknown. (Note: singular-id path is DISTINCT from the existing plural list `GET /api/flowers`.)
  - `POST /api/flowers/{flowerId}/preview` → accepts an `image/png` body (bound to 2 MiB), uploads to `images/<flowerId>.png`, returns `{"image_url":string}`.
  - Pure fns: `share.RenderShareHTML(share.HTMLData) string` and `share.PublicFlowerJSON(share.FlowerData) ([]byte, error)`.

- [ ] **Step 1 — Failing test: OG/Twitter tags in HTML (pure).** In `internal/share/share_test.go`, write `TestRenderShareHTMLContainsOGTags` first (RED). Define the intended pure API and assert on its output for a fake flower:
  ```go
  package share

  import (
      "encoding/json"
      "strings"
      "testing"
  )

  func TestRenderShareHTMLContainsOGTags(t *testing.T) {
      html := RenderShareHTML(HTMLData{
          FlowerID:    "abc123",
          PersonName:  "Ada Lovelace",
          ImageURL:    "http://localhost:9000/flower/images/abc123.png",
          ImageExists: true,
          ShareURL:    "http://localhost:50051/share/abc123",
          AppURL:      "http://localhost:8080/share/abc123",
      })
      wants := []string{
          `<meta property="og:title" content="Flower for Ada Lovelace"`,
          `<meta property="og:image" content="http://localhost:9000/flower/images/abc123.png"`,
          `<meta property="og:url" content="http://localhost:50051/share/abc123"`,
          `<meta name="twitter:card" content="summary_large_image"`,
          `http://localhost:8080/share/abc123`, // human continues to SPA
      }
      for _, w := range wants {
          if !strings.Contains(html, w) {
              t.Errorf("HTML missing %q\n---\n%s", w, html)
          }
      }
  }
  ```
  Run (expect compile failure / RED): `docker run --rm -v "$PWD":/src -w /src golang:1.25-alpine go test ./internal/share/...` (run from `flower-backend`; quote `"$PWD"` — the repo path contains a space).

- [ ] **Step 2 — Implement `RenderShareHTML` (pure) to pass Step 1.** Create `internal/share/share.go`. Use `html/template` (or `html.EscapeString`) so `PersonName` and URLs are HTML-escaped (prevents attribute-injection from arbitrary names). When `ImageExists` is false, substitute a branded fallback image URL (constant `FallbackImagePath`, e.g. `AppURL`-relative `/og-fallback.png` or a static S3 asset). Body carries a `<meta http-equiv="refresh" content="0; url=<AppURL>">` plus a visible `<a href="<AppURL>">` link so humans continue to the SPA.
  ```go
  package share

  import (
      "bytes"
      "html/template"
  )

  // HTMLData is the fully-resolved, escape-ready input for the share page.
  // All fields are plain data so this stays unit-testable with no DB/S3.
  type HTMLData struct {
      FlowerID    string
      PersonName  string
      ImageURL    string // resolved OG image (already fallback-substituted by caller if needed)
      ImageExists bool   // caller sets from S3 Exists(); false → ImageURL is the branded fallback
      ShareURL    string // canonical og:url (this backend /share/<id>)
      AppURL      string // SPA landing the human is forwarded to
  }

  var shareTmpl = template.Must(template.New("share").Parse(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Flower for {{.PersonName}}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="Flower for {{.PersonName}}">
<meta property="og:description" content="A generative flower grown from the name {{.PersonName}} on Petal Pixel.">
<meta property="og:image" content="{{.ImageURL}}">
<meta property="og:url" content="{{.ShareURL}}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Flower for {{.PersonName}}">
<meta name="twitter:description" content="A generative flower grown from the name {{.PersonName}} on Petal Pixel.">
<meta name="twitter:image" content="{{.ImageURL}}">
<meta http-equiv="refresh" content="0; url={{.AppURL}}">
</head>
<body>
<p>Redirecting to <a href="{{.AppURL}}">Petal Pixel</a>&hellip;</p>
</body>
</html>
`))

  // RenderShareHTML returns the minimal OG/Twitter share document. template.HTMLEscape
  // (applied by html/template on every {{.}}) neutralises attribute injection from
  // arbitrary person names.
  func RenderShareHTML(d HTMLData) string {
      var b bytes.Buffer
      _ = shareTmpl.Execute(&b, d) // template is fixed & valid; Execute can't fail on these fields
      return b.String()
  }

  // FallbackImagePath is the branded OG image used when no per-flower PNG exists yet.
  const FallbackImagePath = "/og-fallback.png"
  ```
  Re-run the Step-1 command → GREEN.

- [ ] **Step 3 — Failing test: public flower JSON shape (pure).** Add `TestPublicFlowerJSONShape` (RED) asserting the exact keys/values the SPA landing consumes, and that `params` is passed through as raw jsonb (not double-encoded):
  ```go
  func TestPublicFlowerJSONShape(t *testing.T) {
      raw := json.RawMessage(`{"seed":42,"family":"rose","algo_version":"v2"}`)
      b, err := PublicFlowerJSON(FlowerData{
          FlowerID:   "abc123",
          PersonName: "Ada Lovelace",
          ParamsJSON: raw,
      })
      if err != nil {
          t.Fatalf("PublicFlowerJSON: %v", err)
      }
      var got map[string]json.RawMessage
      if err := json.Unmarshal(b, &got); err != nil {
          t.Fatalf("result not valid JSON: %v", err)
      }
      for _, k := range []string{"flower_id", "person_name", "params"} {
          if _, ok := got[k]; !ok {
              t.Errorf("missing key %q in %s", k, b)
          }
      }
      // params must be the raw object, not a re-stringified blob.
      if string(got["params"]) != string(raw) {
          t.Errorf("params = %s, want passthrough %s", got["params"], raw)
      }
      var fid string
      _ = json.Unmarshal(got["flower_id"], &fid)
      if fid != "abc123" {
          t.Errorf("flower_id = %q, want abc123", fid)
      }
  }
  ```
  Run the Step-1 command → RED.

- [ ] **Step 4 — Implement `PublicFlowerJSON` (pure) to pass Step 3.** Append to `internal/share/share.go`. Marshal `ParamsJSON` (a `flower.Params` already serialized to jsonb by the store) through `json.RawMessage` so it is embedded verbatim:
  ```go
  import "encoding/json" // add to the existing import block

  // FlowerData is the store row reduced to what the public (no-auth) endpoint exposes.
  type FlowerData struct {
      FlowerID   string
      PersonName string
      ParamsJSON json.RawMessage // the flowers.params jsonb, verbatim
  }

  // PublicFlowerJSON produces the read-only body the SPA landing renders without login.
  func PublicFlowerJSON(d FlowerData) ([]byte, error) {
      params := d.ParamsJSON
      if len(params) == 0 {
          params = json.RawMessage("null")
      }
      return json.Marshal(struct {
          FlowerID   string          `json:"flower_id"`
          PersonName string          `json:"person_name"`
          Params     json.RawMessage `json:"params"`
      }{d.FlowerID, d.PersonName, params})
  }
  ```
  Re-run the Step-1 command → both share tests GREEN.

- [ ] **Step 5 — Wire the routes onto the existing mux (`main.go`).** No new mux, no proto. In the `http.HandlerFunc`, add branches BEFORE the grpc-web fallthrough and AFTER the existing exact `"/api/flowers"` branch (order matters — the plural list route must keep matching its exact path). Read `frontendURL := env("FRONTEND_URL", "http://localhost:8080")` and `s3PublicBaseURL` (already loaded) in `main`, and capture them in the closure. Branches:
  1. `strings.HasPrefix(r.URL.Path, "/share/")` → `handleShare(w, r, store, upl, s3PublicBaseURL, frontendURL)`.
  2. `strings.HasPrefix(r.URL.Path, "/api/flowers/")` → split the trailing segment; if it ends in `/preview` and method is `POST` → `handleUploadPreview(...)`; else `GET` → `handlePublicFlower(...)`.
  Add helper `func flowerIDFromPath(path, prefix string) string` that trims the prefix and any trailing `/preview`, returning "" if empty. Implement handlers in `main.go` (they may stay unexported functions in `package main`):
  - `handleShare`: `id := flowerIDFromPath(r.URL.Path, "/share/")`; 404-render if `store == nil` or `GetFlower` returns NotFound (map via `status.Code(err) == codes.NotFound`). Compute `imageKey := "images/"+id+".png"`; `imageExists := upl != nil && Exists(...) == true`; `imageURL` = `S3_PUBLIC_BASE_URL + "/images/" + id + ".png"` when exists else `frontendURL + share.FallbackImagePath`; `shareURL` from `r.Host` (scheme `http` for local) + path; `appURL := frontendURL + "/share/" + id`. Write `share.RenderShareHTML(...)` with `Content-Type: text/html; charset=utf-8`. **On NotFound**, still return a valid branded HTML doc (200 or 404) pointing at `frontendURL` so a stale link degrades gracefully.
  - `handlePublicFlower`: reuse `setAPICORSHeaders`; `OPTIONS` → 204; require `store`; `GetFlower`; on NotFound → 404 `{"error":"not found"}`; else marshal params to raw via the store row (`json.Marshal(f.Params)`) and `share.PublicFlowerJSON`, write 200.
  - `handleUploadPreview`: CORS with `POST` allowed (see Step 6); `OPTIONS` → 204; require `upl`; enforce `r.ContentLength <= 2<<20` and wrap body in `http.MaxBytesReader(w, r.Body, 2<<20)`; `io.ReadAll`; `upl.PutBytes(ctx, "images/"+id+".png", "image/png", bytes.NewReader(b))`; return `{"image_url":url}`. Add imports `io`, `bytes` to `main.go`.
  Sanity gate (still from `flower-backend`): `docker run --rm -v "$PWD":/src -w /src golang:1.25-alpine go build ./...`.

- [ ] **Step 6 — CORS for the singular JSON GET + preview POST.** The existing `setAPICORSHeaders` advertises only `GET, OPTIONS`. The preview endpoint needs `POST`. Rather than widen the shared helper (which would loosen `/healthz` + list), add a sibling `setPreviewCORSHeaders(w, r)` that mirrors it but sets `Access-Control-Allow-Methods: POST, OPTIONS`; use `setAPICORSHeaders` (GET) for `handlePublicFlower` and `setPreviewCORSHeaders` for `handleUploadPreview`. Both mirror the existing grpc-web origin behavior (reflect `Origin`, fall back to `*`). Verify no regression: `docker run --rm -v "$PWD":/src -w /src golang:1.25-alpine go vet ./...`.

- [ ] **Step 7 — Full Go test gate (Docker).** From `flower-backend`, run the whole suite to confirm the pure share tests pass and nothing else broke:
  `docker run --rm -v "$PWD":/src -w /src golang:1.25-alpine go test ./...`
  Expect `internal/share` PASS and existing `internal/api/grpc`, `internal/assets`, `internal/flower` suites still PASS.

- [ ] **Step 8 — MANUAL VERIFICATION (running stack, curl — no browser viewports; this is a backend endpoint).** Bring up the compose stack, then (labels = exact expected):
  1. **OG HTML, image present** — seed a flower + preview image, then `curl -s http://localhost:50051/share/<id>`. Expect: body contains `og:title` = `Flower for <person_name>`, `og:image` = `http://localhost:9000/flower/images/<id>.png`, `twitter:card` = `summary_large_image`, and a `<meta http-equiv="refresh" … url=http://localhost:8080/share/<id>>`.
  2. **OG HTML, image absent** — `curl -s http://localhost:50051/share/<id-with-no-image>`. Expect: `og:image` = the branded fallback (`http://localhost:8080/og-fallback.png`), page still forwards to the SPA.
  3. **Public JSON** — `curl -s http://localhost:50051/api/flowers/<id>`. Expect `{"flower_id":"<id>","person_name":"…","params":{…}}` with `params` a real object (not a quoted string); no auth header required.
  4. **Unknown id** — `curl -s -o /dev/null -w '%{http_code}' http://localhost:50051/api/flowers/does-not-exist` → `404`.
  5. **List route untouched** — `curl -s http://localhost:50051/api/flowers` still returns `{"flowers":[…]}` (plural route not shadowed by the new singular prefix).
  6. **Preview upload** — `curl -s -X POST --data-binary @snapshot.png -H 'Content-Type: image/png' http://localhost:50051/api/flowers/<id>/preview` → `{"image_url":"http://localhost:9000/flower/images/<id>.png"}`; then re-run check (1) and confirm `og:image` now resolves via `Exists`. Oversize guard: posting a >2 MiB body → non-200.
  7. **CORS preflight** — `curl -s -i -X OPTIONS -H 'Origin: http://localhost:8080' http://localhost:50051/api/flowers/<id>/preview` → `204` with `Access-Control-Allow-Methods: POST, OPTIONS` and the origin reflected.

- [ ] **Step 9 — Commit (conventional).**
  `git add flower-backend/internal/share flower-backend/cmd/server/main.go && git commit -m "feat(backend): share OG HTML + public flower JSON + preview upload on the plain-HTTP mux"`

Relevant absolute paths:
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/flower-backend/cmd/server/main.go`
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/flower-backend/internal/share/share.go` (new)
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/flower-backend/internal/share/share_test.go` (new)
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/flower-backend/internal/api/grpc/store.go` (consumed: `GetFlower`, `FlowerRow`)
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/flower-backend/internal/assets/s3uploader.go` (consumed: `Exists`, `PublicURL`, `PutBytes`)

---

<!-- key=create-responsive order=5 -->
### Task 5: Create page responsive (canvas/controls stack + controls drawer + overlay declutter)

**Files:**
- Modify: `src/pages/CreateFlower.tsx`
- Modify: `src/components/flower/FlowerControls.tsx`
- Modify: `src/components/flower/FlowerInfo.tsx`
- Modify: `src/components/flower/FlowerBadges.tsx`
- Test: `src/components/flower/FlowerControls.responsive.test.tsx` (create)

**Interfaces:**
- Consumes: `useIsMobile()` from `@/hooks/use-mobile` (returns `boolean`, breakpoint `<768px`); `Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription, SheetHeader` from `@/components/ui/sheet`; `Button` from `@/components/ui/button` (variants `outline`/`ghost`, size `default`=`h-10 px-4 py-2`, `icon`); `paletteGradient`, `familyLabel` from `@/components/flower/paletteUi` (unchanged usage); existing store selectors/handlers in `CreateFlower.tsx` (generation/mint/save handlers untouched).
- Produces:
  - `FlowerControls` gains an OPTIONAL prop: `export function FlowerControls({ className }: { className?: string } = {})`. Default (no prop) keeps the current desktop `<aside className="w-72 h-full …">`. When `className` is passed, it is merged onto the root via `cn(...)` so the sheet host can override width/border (drawer body reuses the identical control list). This is the only signature other code relies on; `CreateFlower.tsx` renders `<FlowerControls />` on `lg+` and `<FlowerControls className="w-full h-full border-l-0" />` inside the sheet.
  - No changes to any store action, `handleGenerate`, `handleSave`, `handleMint`, `handleDownloadPng`, capture, or guard logic.

Layout target (from BINDING DESIGN CONTRACT): mobile-first; controls are a bottom `Sheet` toggled by a `Controls` button on `< lg`, and the fixed `w-72` desktop aside on `lg+`. Canvas is full-width on top at all widths. Toolbar rows keep `flex-wrap`. All `text-[10px]` on this page/these components are raised to `text-xs` (type floor). Download/Mint/Surprise/Save stay in the always-visible toolbar (NOT moved into the drawer).

- [ ] **Step 1 — Failing test: FlowerControls accepts a className override without breaking its content.** This is the one pure/structural seam worth a unit test (the drawer reuses the same component, so the prop contract must hold). Create `src/components/flower/FlowerControls.responsive.test.tsx`. Follow the existing `FlowerBadges.test.tsx` pattern (`render` from `@testing-library/react`, `useFlowerStore.setState` to seed a known technique). Write it RED first (prop not yet supported):
  ```tsx
  import { render, screen } from '@testing-library/react';
  import { describe, it, expect, beforeEach } from 'vitest';
  import { useFlowerStore } from '@/stores/flowerStore';
  import { FlowerControls } from './FlowerControls';

  describe('FlowerControls responsive host', () => {
    beforeEach(() => {
      useFlowerStore.setState((s) => ({ params: { ...s.params, flowerType: 'classic' } }));
    });

    it('renders the same control sections with no props (desktop aside)', () => {
      const { container } = render(<FlowerControls />);
      expect(screen.getByText('Flower Controls')).toBeInTheDocument();
      expect(screen.getByText('Geometry')).toBeInTheDocument();
      // default host is the fixed-width desktop aside
      expect(container.querySelector('aside')?.className).toContain('w-72');
    });

    it('merges a className override onto the root (drawer host) while keeping all sections', () => {
      const { container } = render(<FlowerControls className="w-full h-full border-l-0" />);
      const root = container.querySelector('aside');
      expect(root?.className).toContain('w-full');
      expect(root?.className).toContain('border-l-0');
      // content is identical — sections still render
      expect(screen.getByText('Flower Controls')).toBeInTheDocument();
      expect(screen.getByText('Colors')).toBeInTheDocument();
    });
  });
  ```
  Run `npx vitest run src/components/flower/FlowerControls.responsive.test.tsx` from `petal-pixel-studio` and confirm the second case FAILS (prop ignored, `w-72` still present, no `w-full`).

- [ ] **Step 2 — Implement the `className` prop in `FlowerControls.tsx`.** Add `import { cn } from '@/lib/utils';`. Change the signature to `export function FlowerControls({ className }: { className?: string } = {}) {`. Change the root element from `<aside className="w-72 h-full bg-card border-l border-border flex flex-col shrink-0">` to `<aside className={cn('w-72 h-full bg-card border-l border-border flex flex-col shrink-0', className)}>`. (When the drawer passes `w-full h-full border-l-0`, Tailwind's later-class-wins resolves width/border; content list is untouched.) Also fix the type-floor violation on this file's subtitle: change `<p className="text-[10px] text-muted-foreground mt-0.5">` (line 114) to `className="text-xs text-muted-foreground mt-0.5"`, and raise the two `text-[10px]` technique/material chip buttons (lines ~126 and ~224, `className={... text-[10px] py-1.5 ...}`) to `text-xs`. Re-run `npx vitest run src/components/flower/FlowerControls.responsive.test.tsx` — both cases now GREEN.

- [ ] **Step 3 — Fix overlay type-floor + narrow-width crowding in `FlowerInfo.tsx` and `FlowerBadges.tsx` (no test; visual, verified in Step 7).**
  - `FlowerBadges.tsx`: raise both chips from `text-[10px]` to `text-xs` (lines 17 and 21). Keep `top-3 left-3` and `pointer-events-none`. To avoid the family + palette chips overflowing off a 375px canvas, allow wrap and cap: change the wrapper `className="absolute top-3 left-3 z-10 flex items-center gap-1.5 pointer-events-none"` to `"absolute top-3 left-3 z-10 flex flex-wrap items-center gap-1.5 pointer-events-none max-w-[calc(100%-1.5rem)]"`.
  - `FlowerInfo.tsx`: raise every `text-[10px]` to `text-xs` (the Word line at ~46, and the `Stat` label/value spans at ~63–64). Keep the panel `bottom-4 left-4`. To stop it colliding with the bottom-right math toggle on narrow widths, cap its width responsively: change `max-w-[220px]` (line 39) to `max-w-[180px] sm:max-w-[220px]`. Keep `grid-cols-2` in `FlowerInfo` (two short stat columns fit within 180px; verify at 375 in Step 7 and drop to a single column only if it wraps).

- [ ] **Step 4 — `CreateFlower.tsx`: raise the page's own `text-[10px]` overlays/banners to the type floor (no test; visual).** In `MathPanel`, the two `<p className="text-[10px] …">` graph-equation captions (lines ~111 and ~124) → `text-xs`; the recharts `Tooltip contentStyle` `fontSize: 10` (lines ~118 and ~131) → `fontSize: 12`. In the edit-mode banner, `<span className="text-[10px] text-amber-300 truncate">` (line ~869) → `text-xs`. In the mint-status strip, the four `text-[10px]` spans/anchors (lines ~881, ~882, ~894, ~899) → `text-xs`. In `MintSuccessDialog`/`CopyRow`, the `text-[10px]` label span (line ~233) and `text-[11px]` helper block (line ~280) → `text-xs`. (These are labels/metadata, not interactive; contract still requires ≥12px.)

- [ ] **Step 5 — `CreateFlower.tsx`: make `MathPanel` stack on `< sm`.** The two-graph grid `<div className="grid grid-cols-2 gap-4 h-[calc(100%-2rem)]">` (line 109) → `"grid grid-cols-1 sm:grid-cols-2 gap-4 sm:h-[calc(100%-2rem)] overflow-y-auto"`. Because the panel is a fixed `h-56` sheet, at `grid-cols-1` two stacked charts won't fit `h-56`; raise the panel height responsively: change the `MathPanel` root `className="absolute bottom-0 left-0 right-0 h-56 glass-panel rounded-t-lg z-20 p-4"` (line 99) to `"absolute bottom-0 left-0 right-0 h-[70vh] sm:h-56 glass-panel rounded-t-lg z-20 p-4 overflow-hidden"`. Keep the `AnimatePresence`-free direct `{showMath && <MathPanel/>}` mount as-is (no logic change).

- [ ] **Step 6 — `CreateFlower.tsx`: stack canvas over controls and add the `Controls` drawer on `< lg`.** This is the core layout change.
  - Add imports: `import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';`, `import { Button } from '@/components/ui/button';`, and add `SlidersHorizontal` to the existing `lucide-react` import.
  - Add one UI-only state near the other `useState`s: `const [controlsOpen, setControlsOpen] = useState(false);` (drawer visibility only — does NOT touch generation/mint state).
  - Change the outer container `<div className="flex h-full">` (line 747) to `<div className="flex flex-col lg:flex-row h-full min-h-0">` so children stack on mobile and sit side-by-side on `lg+`. Keep the dialogs (`RegenerateWarningDialog`, blocker `UnsavedChangesDialog`, `MintSuccessDialog`) exactly where they are (they're `fixed`, unaffected by flow direction).
  - Keep the canvas column `<div className="flex-1 flex flex-col relative">` but add `min-h-0` so it can shrink inside the flex-col on mobile: `<div className="flex-1 flex flex-col relative min-h-0">`.
  - In the **Row 2 actions** toolbar, add a `Controls` trigger that only shows below `lg` (desktop already shows the persistent aside), placed alongside Save/PNG/Mint so it stays reachable. Insert this as the first child of the Row 2 `flex … flex-wrap` container:
    ```tsx
    <button
      onClick={() => setControlsOpen(true)}
      title="Open controls"
      className="lg:hidden flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-muted transition-colors focus-visible:ring-2 focus-visible:ring-primary"
    >
      <SlidersHorizontal className="w-3 h-3" />
      <span>Controls</span>
    </button>
    ```
  - Replace the trailing `<FlowerControls />` (line 927, the last child before `</div>`) with a breakpoint split — persistent aside on `lg+`, `Sheet` drawer below `lg`:
    ```tsx
    {/* Desktop: persistent side panel */}
    <div className="hidden lg:block">
      <FlowerControls />
    </div>

    {/* Mobile/tablet: bottom-sheet drawer */}
    <Sheet open={controlsOpen} onOpenChange={setControlsOpen}>
      <SheetContent
        side="bottom"
        className="lg:hidden h-[80vh] p-0 flex flex-col bg-card"
      >
        <SheetHeader className="px-4 pt-4 pb-2 text-left">
          <SheetTitle className="text-sm">Flower Controls</SheetTitle>
          <SheetDescription className="text-xs">Adjust parameters in real-time</SheetDescription>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-hidden">
          <FlowerControls className="w-full h-full border-l-0" />
        </div>
      </SheetContent>
    </Sheet>
    ```
    Notes: `SheetContent side="bottom"` already animates from the bottom and renders its own close (X) button and overlay; `h-[80vh]` + inner `overflow-hidden` lets `FlowerControls`' internal `overflow-y-auto` scroll the parameter list. The duplicated header inside the sheet is cosmetic; `FlowerControls` still renders its own header — acceptable, or optionally hide the inner one, but do NOT restructure `FlowerControls` beyond the `className` prop. The `lg:hidden` on `SheetContent` is belt-and-suspenders (the trigger is `lg:hidden`, but this guarantees a stray open state never shows the sheet on desktop).

- [ ] **Step 7 — MANUAL VERIFICATION (responsive, exact widths).** Run the dev server from `petal-pixel-studio` via the project's Docker Vite dev server on `:8080` (per env; e.g. `docker compose up` for the studio service). Open `/create`, generate a flower (type a word → Generate) so overlays populate. Use browser devtools responsive mode at each width and confirm:
  - **375px (mobile):**
    - Layout is STACKED: canvas fills the top, no `w-72` panel is visible beside it; the page body does NOT scroll horizontally.
    - Row 1 (word/title inputs) and Row 2 (Backend/Wallet/Save/PNG/Mint) wrap onto multiple lines; a `Controls` button is visible in Row 2. Save, PNG, and Mint remain tappable (≥ ~40px targets via `py-1.5` padding; primary Generate button unaffected).
    - Tapping `Controls` opens a bottom sheet at ~80vh with the full Geometry/Math/Colors/Animation sections; the list scrolls; the X (or overlay tap) closes it.
    - Overlays don't collide: `FlowerBadges` (top-left, wraps if long, no off-screen cutoff), `FlowerInfo` (bottom-left, capped `max-w-[180px]`), math toggle (bottom-right) — all readable and not overlapping. Open the math (`BarChart3`) panel: the two charts STACK (`grid-cols-1`), panel is ~70vh, captions/labels legible.
    - No text smaller than 12px anywhere (spot-check FlowerInfo stats, badges, edit banner, mint strip — all `text-xs`).
  - **768px (tablet):** Still STACKED (controls remain a drawer since split is at `lg`=1024). Verify the `Controls` button + bottom sheet still work; MathPanel is back to `grid-cols-2` (≥sm) at `h-56`; `FlowerInfo` uses `max-w-[220px]`. Toolbar labels that are `hidden md:inline` (Backend/Wallet) now show.
  - **1280px (desktop):** SIDE-BY-SIDE: persistent `w-72` `FlowerControls` aside on the right; NO `Controls` button in the toolbar (`lg:hidden`); no bottom sheet. Overlays sit comfortably; MathPanel `grid-cols-2` `h-56`. Canvas + panel + the app's own `w-64` sidebar all fit without horizontal scroll.
  - Confirm `prefers-reduced-motion`: the sheet/framer overlays still open (no motion-blocking regression) — no code needed beyond existing behavior, just eyeball that nothing is broken.

- [ ] **Step 8 — Gate: typecheck + full test suite.** From `petal-pixel-studio`: run `npx tsc --noEmit` (must be clean — verifies the new `className` prop, imports, and JSX) and `npx vitest run` (full suite must pass, including the new `FlowerControls.responsive.test.tsx` and the existing `FlowerBadges`/`FlowerInfo`-adjacent tests unaffected by the `text-xs` swaps). No Go changes in this task, so the `docker golang:1.25-alpine` gate is not required here.

- [ ] **Step 9 — Commit (conventional).** Stage the five files and commit:
  `git commit -m "feat(create): responsive Create page — stack canvas over a controls drawer + declutter canvas overlays"` (body: canvas full-width with a bottom-sheet `Controls` drawer < lg and the persistent w-72 aside on lg+; raise all text-[10px] overlays/banners to the text-xs type floor; wrap/cap FlowerBadges + FlowerInfo and stack MathPanel < sm; no generation/mint logic changed). End the commit message with the required `Co-Authored-By` trailer.

---

Key files inspected (all absolute):
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/pages/CreateFlower.tsx` — outer `flex h-full`, `flex-1` canvas column, trailing `<FlowerControls />`, `MathPanel` (`grid-cols-2`, `h-56`, `text-[10px]`, tooltip `fontSize:10`), edit banner + mint strip `text-[10px]`, `CopyRow` `text-[10px]`/`text-[11px]`.
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/components/flower/FlowerControls.tsx` — fixed `w-72` aside, no props; subtitle + technique/material chips at `text-[10px]`.
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/components/flower/FlowerInfo.tsx` — `bottom-4 left-4 max-w-[220px]`, `grid-cols-2`, `text-[10px]` stats.
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/components/flower/FlowerBadges.tsx` — `top-3 left-3` chips, `text-[10px]`, `pointer-events-none`.
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/components/ui/sheet.tsx` — `side="bottom"` variant exists with built-in overlay + close button.
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/components/ui/collapsible.tsx` — bare Radix re-export (Sheet chosen over Collapsible for the mobile drawer, per contract "reuse ui/sheet").
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/hooks/use-mobile.tsx` — `useIsMobile()` @768 (available but the plan uses pure Tailwind `lg:` breakpoints for the layout split; hook not required).
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/components/layout/DashboardLayout.tsx` + `AppSidebar.tsx` — app sidebar is a fixed `w-64` that never collapses (noted as OUT OF SCOPE for this task; the Create page must fit alongside it).
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/vite.config.ts` — vitest jsdom + globals + Testing Library setup (`src/test/setup.ts`), 20s timeout; matches the RTL test pattern used in `FlowerBadges.test.tsx`.

---

<!-- key=gif order=6 -->
### Task 6: Spinning GIF export via gifenc + Download menu

**Files:**
- Modify: `petal-pixel-studio/package.json` (add `gifenc` to `dependencies`)
- Modify: `petal-pixel-studio/src/components/flower/snapshot.ts` (add `frameYaws` pure helper + `captureFlowerGif`)
- Modify: `petal-pixel-studio/src/components/flower/snapshot.test.ts` (unit-test `frameYaws`)
- Modify: `petal-pixel-studio/src/pages/CreateFlower.tsx` (replace the standalone PNG button at lines 847–854 with a Download dropdown: PNG + GIF)

**Interfaces:**
- Consumes (from the capture task — do NOT re-implement): `renderToBlob(opts: { size?: number; background?: 'transparent' | 'dark' | 'studio' | string; frameYaw?: number }): Promise<Blob | null>`, exported from `snapshot.ts` and registered by `SnapshotBridge` in `FlowerCanvas.tsx`. `frameYaw` rotates the flower group about +Y for that single dedicated-pass render, then restores on-screen yaw.
- Produces (new exports from `snapshot.ts`, relied on by `CreateFlower.tsx` and the test):
  - `frameYaws(frames: number): number[]` — evenly-spaced yaws over `[0, 2π)`, i.e. `i * 2π / frames`, length === `frames`, excludes the duplicate `2π` endpoint so the loop is seamless. Returns `[]` for `frames <= 0`.
  - `captureFlowerGif(opts?: { frames?: number; size?: number; background?: string }): Promise<Blob | null>` — default `frames = 36`, `size = 512`. Rotates through `frameYaws(frames)`, calls the registered `renderToBlob({ frameYaw, size, background })` per frame, quantizes + encodes an animated GIF via `gifenc`. Resolves `null` if no renderer is registered or any frame fails.

- [ ] Step 1 — Add the `gifenc` dependency. From `petal-pixel-studio`, run `npm install gifenc@^1.0.3 --save-exact=false` (pins into `dependencies`, not `devDependencies`). Confirm `package.json` now lists `"gifenc"` under `dependencies` and `node_modules/gifenc` resolves. gifenc is pure-JS (`quantize`, `applyPalette`, `GIFEncoder`), so no native build. Do not add `@types` — gifenc ships its own types.

- [ ] Step 2 — RED: unit-test the pure `frameYaws` math. In `snapshot.test.ts` add a `describe('frameYaws', …)` block (import `frameYaws` from `./snapshot`) asserting the exact contract:
  ```ts
  import { frameYaws } from './snapshot';

  describe('frameYaws', () => {
    it('returns `frames` evenly spaced yaws starting at 0', () => {
      const ys = frameYaws(4);
      expect(ys).toHaveLength(4);
      expect(ys[0]).toBe(0);
      expect(ys[1]).toBeCloseTo(Math.PI / 2, 10);
      expect(ys[2]).toBeCloseTo(Math.PI, 10);
      expect(ys[3]).toBeCloseTo((3 * Math.PI) / 2, 10);
    });

    it('excludes the 2π endpoint so the loop is seamless', () => {
      expect(frameYaws(36).some((y) => y >= 2 * Math.PI)).toBe(false);
    });

    it('is strictly increasing', () => {
      const ys = frameYaws(12);
      for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1]);
    });

    it('returns an empty array for non-positive frame counts', () => {
      expect(frameYaws(0)).toEqual([]);
      expect(frameYaws(-5)).toEqual([]);
    });
  });
  ```
  Run `npx vitest run src/components/flower/snapshot.test.ts` from `petal-pixel-studio` and confirm it FAILS (`frameYaws` is not exported yet).

- [ ] Step 3 — GREEN: implement `frameYaws` in `snapshot.ts` (pure, no three.js import):
  ```ts
  /** Evenly-spaced yaws over [0, 2π); excludes the 2π endpoint for a seamless loop. */
  export function frameYaws(frames: number): number[] {
    if (frames <= 0) return [];
    const step = (Math.PI * 2) / frames;
    return Array.from({ length: frames }, (_, i) => i * step);
  }
  ```
  Re-run `npx vitest run src/components/flower/snapshot.test.ts` and confirm the `frameYaws` block PASSES. The existing `fitWithin`/registry suites must remain green.

- [ ] Step 4 — Implement `captureFlowerGif` in `snapshot.ts`, reusing the shared `renderToBlob` (never a second capture pass). It must register/consume the renderer the same way `captureFlowerPng` does — add a `renderToBlob` registry slot alongside the existing `Snapshotter` (the capture task adds `registerRenderer`/the module-level renderer; consume that exact export — do not duplicate the registry). Decode each frame blob to `ImageData` via `createImageBitmap` + an offscreen 2D canvas, quantize a shared palette, and encode:
  ```ts
  import { quantize, applyPalette, GIFEncoder } from 'gifenc';

  const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));

  async function blobToImageData(blob: Blob, size: number): Promise<ImageData | null> {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, size, size);
    bitmap.close?.();
    return ctx.getImageData(0, 0, size, size);
  }

  export async function captureFlowerGif(
    opts: { frames?: number; size?: number; background?: string } = {},
  ): Promise<Blob | null> {
    const frames = opts.frames ?? 36;
    const size = opts.size ?? 512;
    const background = opts.background ?? 'dark';
    if (!currentRenderer) return null; // renderToBlob registry set by SnapshotBridge
    try {
      const gif = GIFEncoder();
      for (const frameYaw of frameYaws(frames)) {
        const blob = await currentRenderer({ frameYaw, size, background });
        if (!blob) return null;
        const data = await blobToImageData(blob, size);
        if (!data) return null;
        const palette = quantize(data.data, 256);
        const index = applyPalette(data.data, palette);
        gif.writeFrame(index, size, size, { palette, delay: 1000 / frames });
        await yieldToMain(); // keep the main thread responsive between frames
      }
      gif.finish();
      return new Blob([gif.bytesView()], { type: 'image/gif' });
    } catch {
      return null;
    }
  }
  ```
  NOTE for the implementer: `currentRenderer` is the module-level `renderToBlob` slot the capture task introduces (mirror of `current` for `Snapshotter`). If the capture task exposes only a public `renderToBlob(opts)` wrapper (returning `null` when unregistered), call that instead and drop the `!currentRenderer` early-return in favor of a per-frame `null` check. Do not add a fallback that reads the live framebuffer — a missing renderer means `captureFlowerGif` resolves `null` and the UI toasts a failure. Run `npx tsc --noEmit` from `petal-pixel-studio` and confirm no type errors from the gifenc import or the new function.

- [ ] Step 5 — Wire the Download dropdown into `CreateFlower.tsx`. Add imports at the top: `import { captureFlowerGif } from '@/components/flower/snapshot';` (extend the existing line 20 import), `import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';`, `import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';`, and add `Image, Film, Loader2, ChevronDown` to the existing `lucide-react` import (line 10). Add state near the other `useState` calls (around line 349): `const [isEncodingGif, setIsEncodingGif] = useState(false);`. Factor the existing `handleDownloadPng` blob-to-anchor logic into a shared helper so GIF reuses it:
  ```ts
  const triggerDownload = (blob: Blob, ext: 'png' | 'gif') => {
    const safeTitle = (titleInput.trim() || generationWord || 'flower').replace(/[\\/:*?"<>|]/g, '_');
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeTitle}.${ext}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadGif = async () => {
    if (isEncodingGif) return; // re-entry guard, matches other handlers
    setIsEncodingGif(true);
    const toastId = toast.loading('Rendering spinning GIF…');
    try {
      const blob = await captureFlowerGif({ frames: 36, size: 512, background: 'dark' });
      if (!blob) {
        toast.error('Could not render the GIF. Is the 3D view visible?', { id: toastId });
        return;
      }
      triggerDownload(blob, 'gif');
      toast.success('GIF downloaded', { id: toastId });
    } catch {
      toast.error('GIF export failed.', { id: toastId });
    } finally {
      setIsEncodingGif(false);
    }
  };
  ```
  Rewrite `handleDownloadPng` to call `triggerDownload(blob, 'png')` instead of inlining the anchor. Replace the single PNG `<button>` (current lines 847–854) with the dropdown, respecting the DESIGN CONTRACT (type floor `text-xs`, `h`-padding matching sibling toolbar buttons `px-2.5 py-1.5`, `focus-visible:ring-2 ring-primary`, touch-reachable — dropdown items are full-width rows so they satisfy the tap-target rule; the spinner obeys `prefers-reduced-motion` via `motion-reduce:animate-none`):
  ```tsx
  <TooltipProvider>
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            disabled={isEncodingGif}
          >
            {isEncodingGif
              ? <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none" />
              : <Download className="w-3 h-3" />}
            <span className="hidden sm:inline">{isEncodingGif ? 'Encoding…' : 'Download'}</span>
            <ChevronDown className="w-3 h-3 opacity-70" />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs max-w-[220px]">
          PNG is a still frame. GIF spins 36 frames — larger file, a few seconds to encode.
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        <DropdownMenuItem onSelect={() => void handleDownloadPng()} className="text-xs gap-2">
          <Image className="w-3.5 h-3.5" /> PNG · still frame
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => { e.preventDefault(); void handleDownloadGif(); }}
          disabled={isEncodingGif}
          className="text-xs gap-2"
        >
          <Film className="w-3.5 h-3.5" /> GIF · spinning (512²)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </TooltipProvider>
  ```
  (`e.preventDefault()` on the GIF item keeps the menu from stealing focus mid-encode; PNG resolves fast so it can close normally.)

- [ ] Step 6 — Type + full-suite gate. From `petal-pixel-studio` run `npx tsc --noEmit` (expect zero errors) then `npx vitest run` (full suite — `frameYaws` block plus all pre-existing snapshot/store/palette suites green). Fix any fallout before proceeding. No Go changes in this task, so no `docker golang:1.25-alpine` step.

- [ ] Step 7 — MANUAL VERIFICATION (visual/responsive; the GIF pipeline touches WebGL readback + a real download, which vitest/jsdom cannot exercise). Start the Docker dev server, open `/create`, generate a flower, then at each viewport width confirm:
  - **375px (mobile):** Download control shows the icon + chevron (label hidden by `hidden sm:inline`) and stays ≥ ~40px tap height in the wrapped Row-2 toolbar; opening the menu shows two full-width rows (PNG, GIF) both easily tappable; no horizontal page scroll.
  - **768px (tablet):** "Download" label visible; hovering the trigger shows the size/time tooltip; clicking GIF shows the spinner + "Encoding…" and a `toast.loading`, then a `<title>.gif` file downloads.
  - **1280px (desktop):** Open the downloaded GIF in a browser/Finder preview and confirm it is a **seamless spinning loop** (36 frames, no jump at wrap, dark studio background — NOT the pale live framebuffer), and the filename matches the sanitized title. Trigger PNG from the same menu and confirm the still PNG still downloads unchanged. Encode a GIF while dragging the OrbitControls — the UI must stay responsive (yield-between-frames), and the on-screen flower yaw must be RESTORED to its pre-capture orientation after the GIF finishes (renderToBlob's contract).

- [ ] Step 8 — Commit (conventional): `git add petal-pixel-studio/package.json petal-pixel-studio/package-lock.json petal-pixel-studio/src/components/flower/snapshot.ts petal-pixel-studio/src/components/flower/snapshot.test.ts petal-pixel-studio/src/pages/CreateFlower.tsx` then `git commit -m "feat(export): add spinning GIF export via gifenc + Download menu"` (message ends with the required `Co-Authored-By` trailer).

---

Relevant absolute paths for the implementer:
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/components/flower/snapshot.ts`
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/components/flower/snapshot.test.ts`
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/components/flower/FlowerCanvas.tsx` (SnapshotBridge — the capture task registers `renderToBlob` here; this task consumes it)
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/pages/CreateFlower.tsx` (PNG button to replace: lines 847–854; `handleDownloadPng`: lines 499–514)
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/components/ui/dropdown-menu.tsx` and `.../ui/tooltip.tsx` (existing, exact export names verified)
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/package.json` (add `gifenc` to `dependencies`)

Key dependency note: this task strictly depends on the capture task landing `renderToBlob(opts)` first (both the `snapshot.ts` export and its `SnapshotBridge` registration in `FlowerCanvas.tsx`). If sequenced before it, `captureFlowerGif` cannot compile/run.

---

<!-- key=galleries-responsive order=7 -->
### Task 7: Galleries responsive + touch-reachable card actions (MyFlowers, NftCollection)

**Files:**
- Modify: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/pages/MyFlowers.tsx`
- Modify: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/pages/NftCollection.tsx`
- Test (existing, must stay green — do NOT edit): `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/pages/myFlowersUtils.test.ts`

**Interfaces:**
- Consumes: `previewGradient(p)`, `familyLabel(p)` from `@/components/flower/paletteUi` (already imported in both files — keep the palette preview band `<div style={{ background: previewGradient(...) }}>` and the family chip `<div className="… capitalize">{familyLabel(...)}</div>` intact; `familyLabel` returns RAW lowercase, so the `capitalize` class MUST remain on the chip). Consumes `collectFamilies`/`filterFlowers`/`sortFlowers`/`MintFilter`/`SortOrder` from `./myFlowersUtils` — unchanged.
- Produces: no exported symbols. This task is pure JSX/className changes to two page components; no other task consumes new signatures from here. Layout owner (page shell `h-full overflow-y-auto p-6`) is untouched.

Notes on invariants to preserve while editing:
- `MyFlowers.tsx` card actions are three separate hover-gated controls: the delete button (line ~270, `absolute top-3 left-3 … opacity-0 group-hover:opacity-100`), the Edit pill (line ~280, always-visible today but sub-11px), and the inline rename pencil (line ~305, `opacity-0 group-hover:opacity-100`). The double-click-to-edit handler on the card root (`onDoubleClick={() => handleEdit(flower)}`) is desktop-only affordance — the visible controls are the touch path, so they MUST be reachable without hover.
- Type FLOOR violations to fix in this task: every `text-[10px]` in both files (MyFlowers: NFT badge, family chip, Edit pill, `Word:` line, date/status meta; NftCollection: `DetailRow` tag+value, both badges, `Word:` line, Metadata link, MetaMask token-id note) → `text-xs`.

- [ ] **Step 1 — Guard the pure layer first (no new logic, just confirm the gate is real).** Before touching JSX, run `npx vitest run src/pages/myFlowersUtils.test.ts` from `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio`. Confirm it passes green. This is the regression fence: the filter/sort/family logic backing the MyFlowers filter bar must remain untouched and passing after every JSX edit below. (No test is added — this task has no new pure logic; the grid/touch/type changes are CSS-class-only and are covered by the MANUAL VERIFICATION steps + the `tsc`/`vitest` gate.)

- [ ] **Step 2 — MyFlowers: reflow the card grid.** In `src/pages/MyFlowers.tsx`, change the cards container (currently `<div className="grid grid-cols-3 gap-4">`, ~line 234) to:
  ```tsx
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
  ```
  Leave the trailing "Create New Flower" `<Link>` tile inside this grid unchanged (it inherits the reflow).

- [ ] **Step 3 — MyFlowers: make the filter bar wrap cleanly + search full-width < sm.** The wrapper already has `flex flex-wrap items-center gap-3` (~line 158) — keep it. Make the search wrapper stretch on mobile and the input fill it: change the search `<div className="relative">` (~line 159) to `<div className="relative w-full sm:w-auto">`, and change the input's `w-56` (~line 166) to `w-full sm:w-56`. Also raise the input text from `text-xs` — leave at `text-xs` (already at floor; do not shrink). The mint-filter pill group, family `<select>`, and sort `<select>` keep their classes; because the parent is `flex-wrap`, they now wrap to a second row on narrow viewports instead of overflowing.

- [ ] **Step 4 — MyFlowers: touch-reachable card actions (the CRITICAL fix).** Three edits inside the card, all removing hover-gating on touch and enlarging tap targets:
  - **Delete button** (~line 265): replace `opacity-0 group-hover:opacity-100` with `opacity-100 sm:opacity-0 sm:group-hover:opacity-100`, and enlarge the tap target from `w-7 h-7` to `w-9 h-9` (36px, adequate for a corner icon button with 12px glyph). Bump the icon `Trash2` from `w-3 h-3` to `w-4 h-4`. Add `focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none` to the button. Result:
    ```tsx
    className="absolute top-3 left-3 w-9 h-9 rounded-full bg-rose-500/10 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-rose-500/30 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
    ```
  - **Edit pill** (~line 280): it is already always-visible, but at `text-[10px]` and short height. Change `text-[10px] px-2.5 py-1` to `text-xs px-3 py-1.5`, bump `Pencil` from `w-3 h-3` to `w-3.5 h-3.5`, and add `focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none`.
  - **Rename pencil** (~line 300, inside the title row): replace `opacity-0 group-hover:opacity-100` with `opacity-100 sm:opacity-0 sm:group-hover:opacity-100`, enlarge the hit area by adding `p-1.5 -m-1.5` (keeps visual size, grows the touch target to ~28px+), bump `Pencil` from `w-3 h-3` to `w-4 h-4`, and add `focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded`. Result:
    ```tsx
    className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0 p-1.5 -m-1.5 rounded focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
    ```
  Because these are always-visible < sm, all three actions are now tappable on touch without the (touch-impossible) hover.

- [ ] **Step 5 — MyFlowers: raise sub-11px meta to the type floor.** In the same file, change every remaining `text-[10px]` to `text-xs`: the NFT badge (~line 258), the family chip (~line 262 — keep its `capitalize` class and `familyLabel(flower.params)` call), the `Word:` line (~line 313), and the date + Draft/Minted status spans (~lines 317, 321). Do NOT change the `RenameInput`/`DeleteConfirmDialog` text (already `text-sm`/`text-xs`).

- [ ] **Step 6 — MANUAL VERIFICATION: MyFlowers responsive + touch.** From `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio` start the Vite dev server (Docker stack per environment; app is served on `:8080`). Seed at least ~5 saved flowers (mix of minted + draft, and include one v1 flower with no `palette` to exercise the `previewGradient` colorA/colorB fallback). Navigate to `/my-flowers` and check at three widths:
  - **375 (mobile):** cards are a SINGLE column (`grid-cols-1`); the search input spans the full row width and the mint pills + family/sort selects wrap onto following rows with no horizontal page scroll; the delete button (top-left), Edit pill (bottom-right), and rename pencil (next to title) are ALL visible without any hover; every meta label reads at ≥12px (no 10px text); the palette preview band and lowercase-source family chip (displayed capitalized) render on every card.
  - **768 (tablet):** cards are TWO columns (`sm:grid-cols-2`); card actions transition to hover-reveal (`sm:opacity-0`) — confirm they appear on hover and the Edit pill stays visible; filter bar sits on one row (or wraps gracefully).
  - **1280 (desktop):** cards are THREE columns (`xl:grid-cols-3`); the "Create New Flower" tile sits in-grid; hover reveals delete/rename; no layout overflow.
  Expected: no horizontal scrollbar at any width; focus ring visible when tabbing to any card action.

- [ ] **Step 7 — NftCollection: reflow the card grid.** In `src/pages/NftCollection.tsx`, change the cards container (`<div className="grid grid-cols-3 gap-4">`, ~line 191) to:
  ```tsx
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
  ```

- [ ] **Step 8 — NftCollection: usable copy buttons + type floor on cards.** In the `DetailRow` component (~lines 27-44): the copy `<button>` (~line 32) is icon-only with no padding — enlarge its hit area with `p-1.5 -m-1.5` and add `focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded`, and bump `Copy` from `w-3 h-3` to `w-4 h-4`. Raise both `text-[10px]` spans (tag ~line 29, value ~line 30) to `text-xs` — keep `font-mono` on the value span (generative metadata: token id / contract / tx hash). Add `min-w-0` to the row wrapper (`flex items-center gap-1.5` → `flex items-center gap-1.5 min-w-0`) so the `truncate` on the value actually engages and the copy button never gets pushed off-card on narrow widths. In `NftCard`, raise the two badges (~lines 105, 108 — keep the family badge's `capitalize` + `familyLabel(params)`), the `Word:` line (~line 122), and the Metadata link / "No metadata URI" fallback (~lines 160, 165) from `text-[10px]` to `text-xs`. Keep the preview band `<div className="h-2" style={{ background: previewGradient(params) }}>` unchanged.

- [ ] **Step 9 — NftCollection: MetaMask help block usable on mobile.** The `MetaMaskHelp` `Collapsible` (~line 53) has `max-w-xl` — on a 375px viewport that's fine (it shrinks), but confirm the trigger is a full-width tap target: the `CollapsibleTrigger` already has `flex w-full items-center justify-between p-4` (~44px tall) — keep it, and add `focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded-xl` to it so keyboard focus is visible. Raise the closing token-id note `text-[10px]` (~line 78) to `text-xs`; keep the inline `font-mono` spans (`0`, `docs/MINTING.md`). The `<ol>` steps are already `text-xs` — leave them.

- [ ] **Step 10 — MANUAL VERIFICATION: NftCollection responsive + mobile usability.** With ≥3 minted flowers seeded (ensure at least one has `mintContractAddress` + `txHash` + `tokenUri` so all `DetailRow`s and the Metadata link render), navigate to `/nft-collection` and check:
  - **375:** cards are a SINGLE column; each `DetailRow` value truncates in the middle (via `truncateMiddle`) without pushing the copy button off-screen, and tapping a copy button fires the "… copied" toast (verify with one copy tap); no `text-[10px]` remains; MetaMask block fits within the viewport with no horizontal page scroll, and its trigger toggles open/closed on tap.
  - **768:** cards are TWO columns; copy buttons and Metadata external-link icon all tappable.
  - **1280:** cards are THREE columns; MetaMask block capped at `max-w-xl` and left-aligned below the grid.
  Expected: no horizontal page scroll at any width; every copy/link/toggle is reachable by tap; family chip shows capitalized display of the lowercase `familyLabel`.

- [ ] **Step 11 — Full gate.** From `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio` run both and require clean output:
  ```bash
  npx tsc --noEmit
  npx vitest run
  ```
  `tsc` must report zero errors; `vitest run` must pass the full suite (including `src/pages/myFlowersUtils.test.ts` from Step 1, unchanged). If the Docker-only toolchain is in use, run these inside the frontend container (e.g. `docker compose run --rm <frontend-service> npx tsc --noEmit && … npx vitest run`) rather than on the host.

- [ ] **Step 12 — Commit.** Conventional commit, e.g.:
  ```
  fix(studio): responsive gallery grids + touch-reachable card actions

  - MyFlowers/NftCollection: grid-cols-1 sm:2 xl:3 (was fixed grid-cols-3)
  - MyFlowers filter bar wraps; search full-width < sm
  - MyFlowers delete/rename actions always-visible < sm (touch-reachable)
  - enlarge tap targets to >=36px, add focus-visible rings
  - raise all sub-11px meta text-[10px] -> text-xs (type floor)
  - NftCollection copy buttons/MetaMask trigger usable on mobile
  ```

**Notes for the parent:** Both files already import and correctly use the shared `previewGradient`/`familyLabel` helpers — this task must NOT reimplement palette logic, and must NOT edit `paletteUi.ts` or `myFlowersUtils.ts`. All changes are className/JSX-only in the two page components. Files touched: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/pages/MyFlowers.tsx` and `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/pages/NftCollection.tsx`.

---

<!-- key=pages-polish order=8 -->
### Task 8: Dashboard + Activity + Auth + NotFound responsive polish

**Files:**
- Modify: `src/pages/Index.tsx`
- Modify: `src/pages/Activity.tsx`
- Modify: `src/pages/Login.tsx`
- Modify: `src/pages/Signup.tsx`
- Modify: `src/pages/VerifyOtp.tsx`
- Modify: `src/pages/NotFound.tsx`
- (No new test files — these are presentational-only pages; all pure logic already lives in `src/pages/dashboardStats.ts` + `src/pages/activityUtils.ts`, which have existing passing tests `dashboardStats.test.ts` / `activityUtils.test.ts`. Those tests are the regression gate — do not modify them.)

**Interfaces:**
- Consumes (unchanged, do NOT re-import or fork): `paletteGradient(stops: PaletteStop[]) => string`, `previewGradient(p) => string`, `familyLabel(p) => string` from `@/components/flower/paletteUi`; `familyDistribution(savedFlowers) => FamilyCount[]`, `recentFlowers(savedFlowers, n?) => SavedFlower[]` from `./dashboardStats`; `buildActivityTimeline(savedFlowers) => ActivityDay[]` from `./activityUtils`; `truncateMiddle` from `@/lib/truncate`.
- Produces: **nothing** other tasks consume. This task is a leaf — pure markup/className edits, zero exported-signature or logic changes. Rendered inside the existing shell `DashboardLayout` (`<main className="flex-1 overflow-hidden">`), so each page keeps its own `h-full overflow-y-auto` scroll container (Index/Activity) or `min-h-screen` (auth/NotFound, which render outside the dashboard shell).

---

- [ ] **Step 1 — Index.tsx: header + primary CTA to token scale, page title responsive.** The header is `flex items-center justify-between`; on 375px the "Create Flower" button crowds the title. Change the header wrapper (line 62) to `className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"`. Change the `<h1>` (line 65) from `text-2xl` to `text-xl sm:text-2xl` (page-title contract). The top-right `Link` CTA (lines 68–73) duplicates the Quick-actions "Create new" button; keep it but bump its tap target from `py-2` to `h-10` for the primary contract: change `px-4 py-2 rounded-lg` → `px-4 h-10 rounded-lg` and add `justify-center` so the flex row stays centered — final `className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 h-10 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"`.

- [ ] **Step 2 — Index.tsx: stat grid already reflows (`grid-cols-2 md:grid-cols-4`) — verify + tighten.** Keep `grid-cols-2 md:grid-cols-4 gap-4` (line 76) — it satisfies "NEVER fixed grid-cols-3" and reflows to 2-up on mobile. Change stat-card padding `p-5` → `p-4 sm:p-5` (line 83) so two cards fit without horizontal squeeze at 375px. Add the standard focus/hover already present; no logic change. The stat value `text-2xl` (line 88) and label `text-xs` (line 89) already meet the type floor — leave them.

- [ ] **Step 3 — Index.tsx: fix the two type-floor violations in Quick actions + recent strip.** Line 112 draft-count badge uses `text-[10px]` → change to `text-xs` (keep `px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-mono` — this badge carries a generative-metadata count so `font-mono` stays per the Signature contract). Line 156 recent-card meta uses `text-[10px]` → change to `text-xs`. The recent-card thumbnail "Minted" pill (line 149) `text-[10px]` is a decorative overlay badge, but the contract says no interactive/label text < 12px with no carve-out → change it to `text-xs` as well (keep the rest of the class). The two Quick-action buttons (lines 101–115) already use `py-2.5` (~40px) — leave tap targets, but add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary` to each for the focus contract.

- [ ] **Step 4 — Index.tsx: recent-flowers grid reflow + View-all reachability.** The recent grid (line 135) is `grid-cols-2 md:grid-cols-4 gap-4` — keep (reflows 2-up on mobile, satisfies no-fixed-3). The "View all" `Link` (line 128) is `text-xs` and always visible (not hover-gated) — fine, leave. No hover-only actions exist on these cards (the whole card is a button), so the touch-reachability rule is already satisfied. Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary` to the recent-card `<button>` (line 140) className, since it's a primary interactive target.

- [ ] **Step 5 — Index.tsx: family-distribution bars — mobile label width.** In the distribution row (line 181), the family label is `w-24 shrink-0` — at 375px, after the sidebar is gone this fits, but tighten to `w-20 sm:w-24` so the bar itself has room on the narrowest width. Keep the label `text-xs capitalize truncate` (type floor OK, RAW-lowercase family displayed via CSS `capitalize` per Signature contract) and the count `text-xs font-mono` (line 192 — generative count, `font-mono` correct). Card padding `p-6` (line 171) → `p-4 sm:p-6`. No change to bar `background`/`width` math.

- [ ] **Step 6 — Activity.tsx: fix three type-floor violations + timeline mobile fit.** Lines 63, 76, 77 use `text-[10px]` → change all three to `text-xs`. Line 63 is the family chip (keep `capitalize` — RAW family shown via CSS capitalize; the swatch `paletteGradient` dot stays). Lines 76–77 are the `TX` label + `truncateMiddle(txHash)` mono hash (keep `font-mono truncate` on the hash — generative address per Signature contract). Change the page `<h1>` (line 24) `text-2xl` → `text-xl sm:text-2xl`. The timeline column is `max-w-2xl` (line 34) which is correct inside the shell; the `border-l pl-4` rail (line 45) is fine at 375px. Bump the outer padding: the page wrapper `p-6` (line 22) → `p-4 sm:p-6` to match the tighter mobile shell gutter. Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded` to the copy-tx `<button>` (line 85) className.

- [ ] **Step 7 — Login.tsx / Signup.tsx: reconcile indentation + apply identical token scale.** Login.tsx is authored with **4-space** indentation, Signup.tsx with **2-space** — the contract calls out this cosmetic inconsistency. Reformat `src/pages/Login.tsx` to **2-space** indentation to match Signup.tsx (and the repo's other `.tsx` — verify via `git diff` that the only structural changes are whitespace + the class edits below; do not change JSX structure). Both pages already use the correct token scale (`h1 text-xl`, `p text-sm`, labels `text-xs`, submit `py-2.5`) — no size changes needed there. Confirm the card container stays `max-w-sm` (self-contained auth card, correct). Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary` to: the submit button, both OAuth buttons, and the show/hide-password toggle button on **both** files (Login lines 82–92 toggle, 95–101 submit, 115/140 OAuth; Signup lines 74 toggle, 87 submit, 97/101 OAuth). The email/password `<input>`s already have `focus:border-primary` — add `focus:ring-1 focus:ring-primary` to each input on both files for a visible focus ring consistent with the contract.

- [ ] **Step 8 — Login.tsx / Signup.tsx: OAuth `grid-cols-2` wrap safety.** The OAuth row is `grid grid-cols-2 gap-3` inside a `max-w-sm` card — at 375px the card is ~343px wide (minus `p-4` page + `p-6` card padding ≈ 279px inner), so two buttons at `gap-3` fit but are tight. Keep `grid-cols-2` (the contract says "ensure OAuth grid-cols-2 wraps" = must not overflow, not literally reflow to 1-col) and add `min-w-0` to each OAuth `<button>` so the "Google"/"Apple" label truncates instead of forcing horizontal overflow. Verify no horizontal scroll appears at 375px in Step 11.

- [ ] **Step 9 — VerifyOtp.tsx: OTP grid fit at 375px + focus ring.** The 8-slot `InputOTP` (lines 68–79) at default slot width can overflow a `max-w-sm` card on 375px. Wrap the `InputOTPGroup` row so it can't force horizontal page scroll: change the flex wrapper (line 67) `className="flex justify-center"` → `className="flex justify-center overflow-x-auto"` (per the responsive contract: wide content scrolls inside its own container, page body never scrolls horizontally). Change `<h1>` (line 55) — it is already `text-xl`, leave. Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary` to the Verify button (line 81) and the Resend button (line 90). Reindent VerifyOtp.tsx to 2-space to match the reconciled Login/Signup (same whitespace-only cleanup as Step 7; verify via `git diff --stat`).

- [ ] **Step 10 — NotFound.tsx: align to app shell aesthetic.** Replace the raw `bg-muted` shell (line 12) with the app's near-black background + grid signature: `className="flex min-h-screen items-center justify-center bg-background grid-bg p-6"`. Wrap the inner content in a card that matches the auth cards so it reads as the same product: change the inner `<div className="text-center">` (line 13) to `className="glass-panel rounded-xl px-8 py-10 text-center max-w-sm w-full"`. Apply the type scale: `404` heading (line 14) `text-4xl` is a display number, keep `text-4xl font-bold text-foreground` (add `font-mono` so the code reads as a status token per Signature, and add `text-foreground`); the "Oops! Page not found" line (line 15) `text-xl` → `text-lg sm:text-xl text-muted-foreground` and keep `mb-4`. The "Return to Home" `Link` (line 16) — bump to a real tap target and focus ring: `className="inline-flex items-center justify-center h-10 px-4 rounded-lg text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"`. Keep the `useEffect` console.error logging exactly (no logic change).

- [ ] **Step 11 — MANUAL VERIFICATION (375 / 768 / 1280).** From `petal-pixel-studio`, run `npm run dev` (Vite dev on `:8080` per the Docker setup; if running host-side use the same) and open each route in browser devtools responsive mode at the three widths. Expected per width:
  - **375px:** (a) `/` Dashboard — header stacks (title above the CTA), stat cards are 2-up with no horizontal scroll, Quick-action + draft-count badge text is ≥12px, recent thumbnails are 2-up, family-distribution label + bar + count sit on one line with the bar visible (not clipped), no `text-[10px]` remains (spot-check the "Minted" pill + card meta render at `text-xs`). (b) `/activity` — timeline card + `border-l` rail fit, family chip + TX/hash row are ≥12px and the hash truncates (no page-level horizontal scroll). (c) `/login`, `/signup` — card is `max-w-sm` centered, both OAuth buttons sit side-by-side without overflowing (labels truncate if needed), password toggle + submit reachable. (d) `/verify` — OTP row either fits or scrolls **inside its own container** (page body does NOT scroll horizontally). (e) `/notfound-test` (any unknown path) — near-black `bg-background` + grid, glass card, mono `404`, "Return to Home" is an h-10 tap target.
  - **768px:** Dashboard header is a single row again (`sm:` flex-row), stats still 2-up (`md:` kicks in at ≥768 to 4-up — confirm 4-up at exactly 768), auth cards unchanged.
  - **1280px:** Dashboard stats + recent are 4-up, distribution bars full-width, Activity timeline capped at `max-w-2xl` (does not stretch full width), auth/NotFound cards stay centered `max-w-sm`. Tab through each interactive control and confirm a visible `ring-2 ring-primary` focus ring appears (Step 3/4/6/7/9/10 additions). Confirm `prefers-reduced-motion` is respected — the existing `framer-motion` initial/animate entrances are one-shot mount transitions; no new motion added, so no regression.

- [ ] **Step 12 — GATE: typecheck + full test suite.** From `petal-pixel-studio` run `npx tsc --noEmit` (must pass — these are className/whitespace-only edits, so no type errors expected) and `npx vitest run` (full suite; the `dashboardStats.test.ts` + `activityUtils.test.ts` regression tests must stay green, proving no logic drift). If the user's Docker-only toolchain is in play and host `npx` is unavailable, run both via the frontend container image the repo already uses for Vite (`docker run --rm -v "$PWD":/app -w /app node:20-alpine sh -c "npx tsc --noEmit && npx vitest run"`) — no Go/`golang:1.25-alpine` step is needed for this frontend-only task. Both commands must exit 0 before committing.

- [ ] **Step 13 — Commit.** `git add src/pages/Index.tsx src/pages/Activity.tsx src/pages/Login.tsx src/pages/Signup.tsx src/pages/VerifyOtp.tsx src/pages/NotFound.tsx` then commit:
  `git commit -m "style(pages): responsive polish for dashboard, activity, auth, 404" -m "- raise sub-12px labels to text-xs across Index/Activity (type floor)" -m "- stack dashboard header + tighten card padding on mobile; add focus rings" -m "- reconcile Login 4-space to 2-space; add input/button focus rings; min-w-0 OAuth" -m "- scroll-contain OTP row; align NotFound to app shell (bg-background/grid-bg/glass card)"`
  Branch is `feat/richer-flower-generation` (already a feature branch, not `main`) — commit directly; do not push unless the user asks.

**Notes for the implementer (no action, context only):** The dashboard sidebar (`AppSidebar`, fixed `w-64` aside with no mobile collapse) is the app **shell** and is explicitly out of scope for this task — do not add a mobile drawer here (an unused `sidebar.tsx`/`sheet.tsx`/`use-mobile` mobile-Sheet path exists in `src/components/ui` but wiring it is a separate shell task). All edits here are inside the page content area only. Do NOT re-implement any `paletteUi`/`dashboardStats`/`activityUtils` helper — consume them as-is.

---

<!-- key=profile order=9 -->
### Task 9: Editable profile + deterministic generative avatar

**Files:**
- Create: `src/lib/generativeAvatar.ts`
- Create (Test): `src/lib/generativeAvatar.test.ts`
- Modify: `src/contexts/AuthContext.tsx` (expose `refreshProfile`)
- Modify: `src/pages/Profile.tsx` (make editable; real Owned NFTs; generative avatar; fix `text-[10px]`)
- Modify: `src/components/layout/AppSidebar.tsx` (generative avatar fallback; fix `text-[10px]`)

**Interfaces:**
- **Produces** (consumed by Profile, AppSidebar, and any future share surface):
  - `generativeAvatarSvg(seed: string, size?: number): string` — returns a self-contained `<svg …>…</svg>` string (deterministic per `seed`).
  - `generativeAvatarDataUri(seed: string, size?: number): string` — returns `data:image/svg+xml,<url-encoded svg>` for use as an `<img src>`.
- **Produces** (AuthContext value gains one method; existing fields unchanged):
  - `refreshProfile: () => Promise<void>` — re-fetches the current user's `profiles` row into context state.
- **Consumes:** `useFlowerStore((s) => s.savedFlowers)` and the established minted-count expression `savedFlowers.filter((f) => f.isMinted).length` (mirrors `src/pages/Index.tsx:17`); `supabase.from('profiles').update(...)`; `toast` from `sonner`; existing `@/components/ui/{input,button,label}`.

> Constraint honored: the paused-Supabase `profiles` table has columns `avatar_url, created_at, display_name, email, id, updated_at, user_id` only — **no `bio` column exists, so the bio field is SKIPPED** (adding it would require a migration to the paused project, which is forbidden). Editable fields are limited to `display_name` and a pasted `avatar_url`.

- [ ] **Step 1 — RED: deterministic avatar helper test.** Create `src/lib/generativeAvatar.test.ts` with real assertions (no implementation yet):
  ```ts
  import { describe, it, expect } from "vitest";
  import { generativeAvatarSvg, generativeAvatarDataUri } from "./generativeAvatar";

  describe("generativeAvatarSvg", () => {
    it("is deterministic: same seed → identical svg", () => {
      expect(generativeAvatarSvg("Ada Lovelace")).toBe(generativeAvatarSvg("Ada Lovelace"));
    });
    it("differs across seeds", () => {
      expect(generativeAvatarSvg("Ada Lovelace")).not.toBe(generativeAvatarSvg("Grace Hopper"));
    });
    it("returns a well-formed standalone svg with an explicit viewBox", () => {
      const svg = generativeAvatarSvg("seed@example.com");
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
      expect(svg).toContain('viewBox="0 0 64 64"');
    });
    it("honors an explicit size on the outer width/height", () => {
      const svg = generativeAvatarSvg("x", 128);
      expect(svg).toContain('width="128"');
      expect(svg).toContain('height="128"');
    });
    it("handles empty seed without throwing and stays deterministic", () => {
      expect(() => generativeAvatarSvg("")).not.toThrow();
      expect(generativeAvatarSvg("")).toBe(generativeAvatarSvg(""));
    });
    it("trims/normalizes so equivalent seeds match (whitespace-insensitive)", () => {
      expect(generativeAvatarSvg("  Rose  ")).toBe(generativeAvatarSvg("Rose"));
    });
  });

  describe("generativeAvatarDataUri", () => {
    it("wraps the svg as a url-encoded data uri and is deterministic", () => {
      expect(generativeAvatarDataUri("Rose")).toBe(generativeAvatarDataUri("Rose"));
      expect(generativeAvatarDataUri("Rose").startsWith("data:image/svg+xml,")).toBe(true);
    });
    it("does not contain raw unencoded angle brackets after the prefix", () => {
      const body = generativeAvatarDataUri("Rose").slice("data:image/svg+xml,".length);
      expect(body).not.toContain("<");
      expect(body).not.toContain(">");
    });
  });
  ```
  Run `npx vitest run src/lib/generativeAvatar.test.ts` from `petal-pixel-studio` and confirm it FAILS (module not found).

- [ ] **Step 2 — GREEN: implement the pure helper.** Create `src/lib/generativeAvatar.ts`. Pure (no imports, no storage, no `Math.random`). Use a small FNV-1a string hash for determinism; derive two petal-family hues + a background hue from the hash; render a fixed `0 0 64 64` viewBox flower/petal glyph (a ring of `symmetry` rotated petals over a radial-ish background) so it visually rhymes with the app's generative theme. Encode the data URI with `encodeURIComponent`. Real code:
  ```ts
  /**
   * Deterministic generative avatar. Renders a small flower/petal SVG purely
   * from a seed string (typically display_name || email). No storage, no
   * randomness — same seed always yields byte-identical output. Used as the
   * default avatar everywhere `profile.avatar_url` is empty.
   */
  function fnv1a(str: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function hsl(hue: number, sat: number, light: number): string {
    return `hsl(${Math.round(((hue % 360) + 360) % 360)}, ${sat}%, ${light}%)`;
  }

  export function generativeAvatarSvg(seed: string, size = 64): string {
    const key = (seed ?? "").trim();
    const h = fnv1a(key || "petal");
    const baseHue = h % 360;
    const accentHue = baseHue + 40 + ((h >> 8) % 80); // 40–120° off base
    const bgHue = baseHue + 180;                      // complementary backdrop
    const symmetry = 5 + (h % 4);                     // 5–8 petals
    const petalLen = 15 + ((h >> 3) % 7);             // 15–21 (within 64 box)

    const cx = 32;
    const cy = 32;
    const petals = Array.from({ length: symmetry }, (_, i) => {
      const angle = (360 / symmetry) * i;
      // Teardrop petal centered on +Y, rotated around the flower center.
      return (
        `<path d="M0 0 C 6 -${petalLen * 0.5}, 6 -${petalLen}, 0 -${petalLen} ` +
        `C -6 -${petalLen}, -6 -${petalLen * 0.5}, 0 0 Z" ` +
        `transform="translate(${cx} ${cy}) rotate(${angle})" ` +
        `fill="${i % 2 === 0 ? hsl(baseHue, 70, 60) : hsl(accentHue, 68, 55)}" ` +
        `fill-opacity="0.92"/>`
      );
    }).join("");

    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" ` +
      `width="${size}" height="${size}" role="img" aria-label="avatar">` +
      `<rect width="64" height="64" rx="12" fill="${hsl(bgHue, 30, 14)}"/>` +
      petals +
      `<circle cx="${cx}" cy="${cy}" r="5.5" fill="${hsl(accentHue, 75, 68)}"/>` +
      `</svg>`
    );
  }

  export function generativeAvatarDataUri(seed: string, size = 64): string {
    return `data:image/svg+xml,${encodeURIComponent(generativeAvatarSvg(seed, size))}`;
  }
  ```
  Run `npx vitest run src/lib/generativeAvatar.test.ts` and confirm all pass.

- [ ] **Step 3 — Expose `refreshProfile` from AuthContext (no migration, no schema change).** In `src/contexts/AuthContext.tsx`: add `refreshProfile: () => Promise<void>` to the `AuthContextType` interface (after `resendOtp`), implement it inside `AuthProvider` reusing the existing private `fetchProfile`:
  ```ts
  const refreshProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await fetchProfile(user.id);
  };
  ```
  and add `refreshProfile` to the `<AuthContext.Provider value={{ … }}>` object. Do not change `fetchProfile`, the `profiles` query, or any table. Gate: `npx tsc --noEmit` (verifies the interface + provider stay in sync).

- [ ] **Step 4 — Make Profile.tsx editable (display_name + pasted avatar_url), wire real Owned NFTs + generative avatar.** Rewrite `src/pages/Profile.tsx`:
  - Import `useState`, `useAuth` (now with `refreshProfile`), `useFlowerStore`, `toast` from `sonner`, `supabase` from `@/integrations/supabase/client`, `generativeAvatarDataUri` from `@/lib/generativeAvatar`, and `@/components/ui/{input,button,label}`.
  - Local edit state seeded from `profile`: `const [name, setName] = useState(profile?.display_name ?? '')`, `const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '')`, `const [saving, setSaving] = useState(false)`; re-sync via `useEffect(() => { setName(profile?.display_name ?? ''); setAvatarUrl(profile?.avatar_url ?? ''); }, [profile])`.
  - Real Owned NFTs: `const savedFlowers = useFlowerStore((s) => s.savedFlowers); const ownedNfts = useMemo(() => savedFlowers.filter((f) => f.isMinted).length, [savedFlowers]);` — render `{ownedNfts}` (keep `font-mono` per the signature contract) instead of the hardcoded `0` at the old line 50.
  - Avatar source: `const avatarSeed = profile?.display_name || user?.email || 'petal'; const avatarSrc = avatarUrl.trim() || generativeAvatarDataUri(avatarSeed, 128);` — always render `<img src={avatarSrc} …>` (never the bare `User` icon fallback), so the generative avatar shows wherever `avatar_url` is empty.
  - Save handler (tolerates paused Supabase with a toast; persists both fields; refreshes context):
    ```ts
    const handleSave = async () => {
      if (!user) return;
      setSaving(true);
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: name.trim() || null, avatar_url: avatarUrl.trim() || null })
        .eq('user_id', user.id);
      setSaving(false);
      if (error) {
        toast.error('Could not save profile', { description: error.message });
        return;
      }
      await refreshProfile();
      toast.success('Profile updated');
    };
    ```
  - Add a labeled edit form (Display name `Input`, Avatar URL `Input` with `placeholder="Paste an image URL, or leave blank for a generated avatar"`, a primary Save `Button`). Disable Save while `saving` or when nothing changed (`name.trim() === (profile?.display_name ?? '') && avatarUrl.trim() === (profile?.avatar_url ?? '')`).
  - **Design contract:** page title `text-xl sm:text-2xl`; labels via `<Label>` (>=`text-xs`); replace the old `text-[10px]` Verified pill (old line 37) with `text-xs`; Save `Button` primary height >= `h-10`; container `max-w-lg` stays but wrap in mobile-first padding `p-4 sm:p-6`; add `focus-visible:ring-2 focus-visible:ring-primary` on inputs if not already inherited from the ui `Input`. Wallet/contract/seed stays `font-mono` (Owned NFTs count uses `font-mono`).

- [ ] **Step 5 — AppSidebar generative avatar fallback + type-floor fix.** In `src/components/layout/AppSidebar.tsx`: import `generativeAvatarDataUri`. Replace the footer avatar block (old lines 66–72) so it renders `<img>` with `src={profile?.avatar_url?.trim() || generativeAvatarDataUri(profile?.display_name || user?.email || 'petal', 64)}` (remove the bare `User`-icon branch). Replace both `text-[10px]` occurrences (`GENERATOR` tag old line 36, `Free Plan` old line 77) with `text-xs` per the type floor. Keep `alt` non-empty for the avatar (e.g. `alt="Your avatar"`).

- [ ] **Step 6 — Gate: full typecheck + full test suite.** From `petal-pixel-studio` run `npx tsc --noEmit` (0 errors) then `npx vitest run` (full suite green, including the new `generativeAvatar.test.ts` and existing store/save tests unaffected).

- [ ] **Step 7 — MANUAL VERIFICATION (edit flow + responsive + generative avatar).** From `petal-pixel-studio`, the app runs as a Vite dev server on `:8080` (Docker per repo setup). Load `/profile` signed-in. Check at three widths:
  - **375px (mobile):** Profile card is single-column, not clipped; Display-name and Avatar-URL inputs are full-width; Save button tap target >= 40px tall; no text smaller than 12px (Verified pill, meta). Sidebar footer avatar shows a colored flower glyph when no `avatar_url` is set.
  - **768px (tablet):** layout unchanged/legible; `max-w-lg` card centered within `p-4 sm:p-6`.
  - **1280px (desktop):** same, comfortable.
  - **Edit persistence:** change Display name → Save → expect a `Profile updated` toast, the sidebar footer name updates live (via `refreshProfile`), and the generated avatar changes (seed = new display_name) when Avatar URL is left blank. Paste a valid image URL → Save → expect that image replaces the generative avatar in both Profile and sidebar.
  - **Paused-Supabase tolerance:** with the Supabase project paused/unreachable, Save shows a `Could not save profile` error toast (with the error message) and does NOT crash the page.
  - **Owned NFTs:** mint at least one flower elsewhere, return to `/profile`, confirm the Owned NFTs count (font-mono) equals the minted count (not `0`).

- [ ] **Step 8 — Commit (conventional).**
  `git add src/lib/generativeAvatar.ts src/lib/generativeAvatar.test.ts src/contexts/AuthContext.tsx src/pages/Profile.tsx src/components/layout/AppSidebar.tsx`
  then commit:
  `feat(profile): editable display_name + avatar URL, deterministic generative avatar, real owned-NFT count`
  (Body: note bio intentionally skipped — no `bio` column on the paused `profiles` table, no migration added; adds `refreshProfile` to AuthContext; fixes `text-[10px]` type-floor violations in Profile + AppSidebar.)

---

<!-- key=settings order=10 -->
### Task 10: Settings expansion — Appearance, Notifications, Account, Danger zone

**Files:**
- Create: `src/lib/userPrefs.ts` (pure persisted-prefs module)
- Create: `src/lib/userPrefs.test.ts` (vitest unit tests)
- Modify: `src/pages/SettingsPage.tsx` (full rebuild into four labeled sections)
- Modify (only if assertions need updating): `src/pages/SettingsPage.test.tsx` (existing a11y test — must keep green; extend, don't gut)

**Interfaces:**
- Produces (`src/lib/userPrefs.ts`), consumed by `SettingsPage.tsx` and available to any future prefs consumer:
  ```ts
  export type UserPrefKey = 'emailNotifications' | 'mintActivityAlerts' | 'reducedMotionPref';
  export type UserPrefs = Record<UserPrefKey, boolean>;
  export const PREFS_STORAGE_KEY = 'petal-user-prefs';
  export const DEFAULT_PREFS: UserPrefs; // { emailNotifications:false, mintActivityAlerts:false, reducedMotionPref:false }
  export function getPrefs(): UserPrefs;               // safe read: merges stored over defaults, tolerates missing/corrupt JSON
  export function getPref(key: UserPrefKey): boolean;
  export function setPref(key: UserPrefKey, value: boolean): UserPrefs; // writes merged object, returns new snapshot
  ```
  Notes: every function is try/catch-guarded so a throwing/absent `localStorage` (SSR, private mode) falls back to `DEFAULT_PREFS` and never throws. Booleans default to **false** (honest: nothing is wired to a backend yet — see labels below).
- Consumes: `useAuth()` from `@/contexts/AuthContext` (`signOut`, `user.email`, `user.email_confirmed_at`); `supabase` from `@/integrations/supabase/client` (`supabase.auth.resetPasswordForEmail`); `useTheme()` from `next-themes`; `toast` from `sonner`; `useNavigate` from `react-router-dom`; `Switch`/`Label`/`Button`/`Separator` from `@/components/ui/*`. Does NOT change any exported signature other tasks depend on.

**Steps:**

- [ ] **Step 1 — RED: pure prefs module tests.** Create `src/lib/userPrefs.test.ts` following the `src/lib/truncate.test.ts` convention (`import { describe, it, expect, beforeEach } from "vitest"`; `beforeEach(() => localStorage.clear())`). Write failing tests (import from `./userPrefs`, which does not exist yet):
  - `getPrefs()` on empty storage deep-equals `DEFAULT_PREFS`.
  - `setPref('emailNotifications', true)` then `getPref('emailNotifications')` is `true`, and the return value of `setPref` is the full merged snapshot (`{ emailNotifications:true, mintActivityAlerts:false, reducedMotionPref:false }`).
  - `setPref` persists JSON under `PREFS_STORAGE_KEY` (`JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY)!).emailNotifications === true`).
  - Corrupt stored value: `localStorage.setItem(PREFS_STORAGE_KEY, '{ not json')` → `getPrefs()` returns `DEFAULT_PREFS` (no throw).
  - Partial stored value: `localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({ mintActivityAlerts: true }))` → `getPrefs()` merges over defaults (`emailNotifications:false, mintActivityAlerts:true, reducedMotionPref:false`) so a newly-added key never reads `undefined`.
  - `getPref` for an unknown-shaped store returns the default for that key (guards against `undefined` being coerced to a checkbox).
  Run `npx vitest run src/lib/userPrefs.test.ts` and confirm it fails (module not found). Frontend cmds run from `petal-pixel-studio`.

- [ ] **Step 2 — GREEN: implement `src/lib/userPrefs.ts`.** Write the real module (no placeholders): `DEFAULT_PREFS` as above; `getPrefs()` reads `localStorage.getItem(PREFS_STORAGE_KEY)`, `JSON.parse` inside try/catch, returns `{ ...DEFAULT_PREFS, ...(parsed && typeof parsed === 'object' ? parsed : {}) }` filtered to known keys; `getPref(key)` returns `getPrefs()[key]`; `setPref(key, value)` reads current, writes `{ ...current, [key]: value }` via `JSON.stringify`, swallows write errors in try/catch, returns the merged object. Re-run `npx vitest run src/lib/userPrefs.test.ts` until green.

- [ ] **Step 3 — Build the Settings page shell + Appearance section.** Rewrite `src/pages/SettingsPage.tsx`. Page title `className="text-xl sm:text-2xl font-bold text-foreground"` (per Type FLOOR). Wrap content `max-w-2xl space-y-6`; each section is a `<section aria-labelledby>` in a `bg-card rounded-xl border border-border p-5` block with a `text-sm font-semibold` header and `text-xs text-muted-foreground` subtext. **Appearance:** reuse the shell's theme mechanism via `next-themes` — `const { theme, setTheme } = useTheme()`, `isDark = theme === 'dark'`, `Switch` `id="dark-mode-switch"` with a real `<Label htmlFor="dark-mode-switch">`, `onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')}`. next-themes persists to its own localStorage key, so this survives reload with no extra code. **Delete every `text-[10px]`** from the old file — replace helper/meta copy with `text-xs` (Type FLOOR). Keep the existing `framer-motion` intro but gate it: `import { useReducedMotion } from 'framer-motion'` and pass `initial`/`animate` conditionally (respect `prefers-reduced-motion`).

- [ ] **Step 4 — Notifications section (persisted, honestly labeled).** Local state seeded from `getPrefs()` (`const [prefs, setPrefs] = useState(getPrefs)`); each toggle calls `setPrefs(setPref(key, v))` so UI and storage stay in lockstep. Two switches, each `Switch` + real `Label htmlFor`, min tap target via the surrounding `flex items-center justify-between py-2` row (Switch itself is Radix native `<button>`, keyboard-operable):
  - `emailNotifications` — Label "Email notifications", subtext (text-xs) **honest**: "Remembers your preference on this device. Email delivery is not wired up yet."
  - `mintActivityAlerts` — Label "Mint activity alerts", subtext: "Saved locally. In-app only until the backend sends events."
  Do not imply server delivery that does not exist.

- [ ] **Step 5 — Account section.** Read `const { user, signOut } = useAuth()`, `const navigate = useNavigate()`. Show email in `font-mono text-sm` (generative/identity metadata per Signature contract): `{user?.email ?? '—'}`. Verified badge reusing the exact `Profile.tsx` convention `const isVerified = user?.email_confirmed_at != null` — render a `text-xs` pill (`text-emerald-400` "Verified" when true, `text-muted-foreground` "Unverified" when false) with matching `aria-label`. **Change password** `Button variant="outline"` (min-height `h-10`): on click, if `user?.email`, call `await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: `${window.location.origin}/login` })`; on success `toast.success('Password reset link sent — check your email.')`, on error `toast.error(error.message)`; if no email, `toast.error('No email on file for this account.')`. **Sign out** `Button variant="outline"` `h-10`: `await signOut(); navigate('/login')` (the established AppSidebar pattern) — reuse `signOut`, do not reimplement session teardown.

- [ ] **Step 6 — Danger zone.** Own `<section>` with a `border-destructive/40` accent and a `text-destructive` header "Danger zone". A "Delete account" `Button variant="destructive"` `h-10`, clearly labeled, with `text-xs` subtext explaining permanence. On click: guard behind a `window.confirm('Delete your account permanently? This cannot be undone.')`; since Supabase user self-deletion is not exposed on the anon client, do **not** fake it — `toast.error('Account deletion needs the backend. This is not available yet.')` (honest per task). Wire the confirm so a keyboard user can reach and trigger the button (native `<button>`, `focus-visible:ring-2 ring-primary` inherited from the ui/button base).

- [ ] **Step 7 — Keep the existing a11y test green + extend.** `src/pages/SettingsPage.test.tsx` renders bare `<SettingsPage/>` inside only `ThemeProvider`; the rebuilt page now also calls `useAuth`, `useNavigate`, and `supabase`. To keep it renderable, wrap with `MemoryRouter` and a minimal `AuthProvider` (or mock `@/contexts/AuthContext`'s `useAuth` via `vi.mock` returning `{ user: { email:'a@b.co', email_confirmed_at:null }, signOut: vi.fn() }`) and mock `@/integrations/supabase/client`. Preserve the two existing assertions (every `role="switch"` has an accessible name; a switch is focusable + toggles) — they must still pass. Add one assertion: toggling the "Email notifications" switch writes `getPref('emailNotifications') === true` (imports from `@/lib/userPrefs`), proving the persist wiring. Run `npx vitest run src/pages/SettingsPage.test.tsx`.

- [ ] **Step 8 — GATE: typecheck + full suite.** From `petal-pixel-studio` run `npx tsc --noEmit` (zero errors) and `npx vitest run` (entire suite green, including `userPrefs.test.ts`, `SettingsPage.test.tsx`, and all pre-existing tests). Do not proceed until both are clean.

- [ ] **Step 9 — MANUAL VERIFICATION (responsive + keyboard + persistence).** Start the dev server (Docker Vite on `:8080`), log in, open `/settings`.
  - **375px (mobile):** All four section cards stack in one column, no horizontal scroll; page title reads at `text-xl`; every Switch, the Change-password / Sign-out / Delete buttons are full-width-reachable with ≥40px tap height; no text smaller than `text-xs` anywhere. Expected: all rows legible, buttons comfortably tappable.
  - **768px (tablet):** Cards constrained by `max-w-2xl`, centered/left per layout, label + switch on one row with the switch right-aligned. Expected: no overlap, subtext wraps cleanly.
  - **1280px (desktop):** Same `max-w-2xl` column (does not stretch full width); focus a Switch and Tab through — every control shows the `focus-visible ring-2 ring-primary`, Space toggles switches, Enter activates buttons. Expected: full keyboard operability, visible focus ring on each control.
  - **Persistence:** toggle both notification switches ON, hard-reload → both remain ON (from `petal-user-prefs`); toggle theme → reload keeps theme (next-themes key). Trigger "Change password" → success/error toast appears; "Delete account" → confirm dialog, then the honest "needs the backend" toast; "Sign out" → redirect to `/login`. Record actual observations against each expectation.

- [ ] **Step 10 — Commit (conventional).** `git add` the changed/created files and commit:
  `feat(settings): real account/prefs/danger settings page + persisted userPrefs`
  Body: note new tested pure module `src/lib/userPrefs.ts`, honest notification labels, reused `signOut`/verified-badge conventions, Type-FLOOR fix (removed `text-[10px]`).

---

Relevant absolute paths grounding this task:
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/pages/SettingsPage.tsx` (current placeholder; uses `text-[10px]` on lines 34/50/66 — must be replaced)
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/pages/SettingsPage.test.tsx` (existing a11y test to keep green)
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/contexts/AuthContext.tsx` (`useAuth` → `signOut`, `user`)
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/integrations/supabase/client.ts` (`supabase.auth.resetPasswordForEmail`)
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/pages/Profile.tsx` line 7 (`isVerified = user?.email_confirmed_at != null` convention to reuse)
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/components/layout/AppSidebar.tsx` lines 23–26 (`signOut()` + `navigate('/login')` pattern)
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/lib/truncate.test.ts` (vitest test-style convention)
- `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/App.tsx` lines 26/29 (`ThemeProvider attribute="class" defaultTheme="dark"`; `<Sonner/>` mounted — `toast` from `sonner` is available)

---

<!-- key=share-frontend order=11 -->
### Task 11: Frontend share — public `/share/:id` landing + Share button + capture-at-save + branded OG + mint-view reuse

**Files:**
- Create `petal-pixel-studio/src/pages/shareParams.ts` — pure mapper `mapBackendJsonToFlowerParams` + share-URL builder `buildShareUrl`.
- Create `petal-pixel-studio/src/pages/shareParams.test.ts` — vitest for both pure functions.
- Create `petal-pixel-studio/src/pages/ShareFlower.tsx` — public gallery landing (fetch + loading/not-found + render).
- Create `petal-pixel-studio/src/components/flower/SharePreview.tsx` — extracted "big centered canvas + name + palette strip + CTAs" block, reused by ShareFlower **and** the mint-success view.
- Create `petal-pixel-studio/public/og-cover.svg` — branded 1200×630 static OG asset.
- Modify `petal-pixel-studio/src/App.tsx` — add public `/share/:flowerId` route OUTSIDE `ProtectedRoute`/`DashboardLayout` but INSIDE `AppProviders`.
- Modify `petal-pixel-studio/src/components/flower/FlowerCanvas.tsx` — accept optional `params?: FlowerParams` prop (defaults to store) so a fetched flower renders without mutating the logged-in store.
- Modify `petal-pixel-studio/src/integrations/flowerBackend/client.ts` — add `fetchFlowerById(id)` (GET `/api/flowers/:id`) + `postFlowerPreview(id, blob)` (POST `/api/flowers/:id/preview`).
- Modify `petal-pixel-studio/src/pages/CreateFlower.tsx` — capture-at-save (fire-and-forget preview POST) + a "Share" button.
- Modify `petal-pixel-studio/src/pages/MyFlowers.tsx` and `petal-pixel-studio/src/pages/NftCollection.tsx` — Share button on each card (touch-reachable, not hover-only).
- Modify `petal-pixel-studio/index.html` — real branded OG/twitter tags → `/og-cover.svg`.

**Interfaces:**
- **Consumes** (from capture task): `captureFlowerPng(): Promise<Blob|null>` from `@/components/flower/snapshot`.
- **Consumes** (from share-backend task): `GET <backend>/api/flowers/:id` → `{ flower_id, person_name, params, mint_status, tx_hash, token_uri }` where `params` is the persisted Go `flower.Params` JSON (snake_case: `algo_version`, `seed`, `petal_count`, `hue`, and — for v2 — `family`, `palette:{id,stops:[{position,hex,r,g,b}]}` and exactly one nested shape object `classic|rose|bloom|sunflower|rhodonea|superformula` with snake_case fields e.g. `p_num`,`f_d`,`p_len`,`p_sharp`,`f_height`,`floret_rings`,`ray_petals`,`width_profile`,`u_seg`…). Same shape as `FlowerListItem` in client.ts. `POST /api/flowers/:id/preview` accepts an `image/png` body and stores the OG image.
- **Consumes**: `flowerBackendBaseUrl` from `@/integrations/flowerBackend/client`; `previewGradient`/`familyLabel` from `@/components/flower/paletteUi`; `FlowerParams`/`SavedFlower` from `@/stores/flowerStore`; `Palette`/`PaletteStop` from `@/math/palette`; family/param types + `DEFAULT_CLASSIC_PARAMS`/`DEFAULT_ROSE_PARAMS`/`DEFAULT_BLOOM_PARAMS` from `@/math/flowerTypes`.
- **Produces** (other tasks may rely on these exact signatures):
  - `mapBackendJsonToFlowerParams(flowerId: string, json: FlowerListItem['params']): FlowerParams` — pure; snake_case backend JSON → frontend `FlowerParams`. v2 (algo_version==='v2' && family) fills `family`/`palette`/one of `classicParams|roseParams|bloomParams|sunflowerParams|rhodoneaParams|superformulaParams`; v1 fills only the flat fields. Never throws on missing/partial input (falls back to defaults), so `isV2()` and `buildV2Geometry()` route it correctly.
  - `buildShareUrl(flowerId: string, opts?: { baseUrl?: string }): string` — pure; returns `<origin>/share/<encodeURIComponent(flowerId)>`, `origin` = `opts.baseUrl` ?? `window.location.origin`, no trailing double slash, exactly one `/share/` segment.
  - `<SharePreview params={FlowerParams} personName={string} paletteStops={PaletteStop[]} onOpenStudio?={()=>void} onMint?={()=>void} />` — presentational; used by ShareFlower and MintSuccess.

**Design contract (all UI steps obey):** dark theme; page title `text-xl sm:text-2xl`; body `text-sm`; meta `text-xs` (NO `text-[10px]`); primary CTAs `h-10`; `focus-visible:ring-2 ring-primary`; `motion-reduce:*` / respect `prefers-reduced-motion`; grids reflow `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3` (never fixed `grid-cols-3`); card Share action always-visible `< sm` (not `opacity-0 group-hover` only); seed/token-id/hex/wallet/contract in `font-mono`; palette strip via `previewGradient`, family via `familyLabel` (raw lowercase + CSS `capitalize`).

---

- [ ] **Step 1 — Pure share-URL builder (RED→GREEN).** In `shareParams.test.ts` write failing tests for `buildShareUrl`: (a) `buildShareUrl('abc123', { baseUrl: 'https://petal.app' })` === `'https://petal.app/share/abc123'`; (b) trailing slash in baseUrl is collapsed: `buildShareUrl('abc', { baseUrl: 'https://petal.app/' })` === `'https://petal.app/share/abc'`; (c) an id with special chars is `encodeURIComponent`-encoded (`'a/b?c'` → `.../share/a%2Fb%3Fc`); (d) with no `baseUrl` it reads a stubbed `window.location.origin`. Implement `buildShareUrl` in `shareParams.ts` to pass.

- [ ] **Step 2 — Pure v1 mapper (RED→GREEN).** Add failing tests: `mapBackendJsonToFlowerParams('id1', { algo_version:'v1', schema_version:'v1', seed:42, petal_count:7, petal_length:1.5, petal_width:0.6, curvature:0.2, stem_height:1.0, hue:120 })` returns a `FlowerParams` with `flowerId:'id1'`, `algoVersion:'v1'`, `seed:'42'` (string), `petalCount:7`, `family` undefined, `palette` undefined, `stemEnabled:true` (stem_height>0.95), and colorA/colorB derived (assert they are hsl strings). Assert `isV2(result)` is `false`. Implement the v1 branch — reuse the exact v1 mapping already in `flowerStore.generateFromWord`'s v1 path (`hueToHex`, `clamp`, `frequency = 1 + seed%6`, `rotation = seed%360`, `stemEnabled = stem_height>0.95`) but sourced from snake_case JSON; fall back to `defaultParams`-equivalent values for any missing field. Do NOT call the backend or `toTechniqueParams` (that needs proto seed as bigint) — map the flat fields directly.

- [ ] **Step 3 — Pure v2 mapper: palette + snake→camel shapes (RED→GREEN).** Add failing tests for each family: e.g. `{ algo_version:'v2', family:'rhodonea', palette:{ id:'pal-1', stops:[{position:0,hex:'#ff0000'},{position:1,hex:'#0000ff'}] }, rhodonea:{ radius:1, k:5, petal_span:2, width_profile:0.5, height_profile:0.3, thickness:0.1, curl:0.2, length_seg:40, width_seg:16, sat_shift:0, bri_shift:0 } }` → `family:'rhodonea'`, `palette.stops` mapped `{pos:0,hex:'#ff0000'}` (position→pos, drop r/g/b), and `rhodoneaParams.widthProfile===0.5`, `rhodoneaParams.lengthSeg===40`, `rhodoneaParams.widthSeg===16`; assert `isV2(result)===true`. Add one test per shape (`classic` with `p_num`/`f_d`/`p_len`/`p_sharp`/`f_height`/`b_num`; `rose`; `bloom` with `petal_freq`/`theta_step`/`r_step`; `sunflower` with `floret_rings`/`ray_petals`/`ray_width`; `superformula` with `u_seg`/`v_seg`/`n1a`…). Add a degenerate test: `family:'classic'` with the `classic` object MISSING must not throw and must fall back to `DEFAULT_CLASSIC_PARAMS` (mirrors `buildV2Geometry`'s classic tolerance). Implement the v2 branch with a small `snakeToCamel`-per-field mapping (explicit, not generic) so `buildV2Geometry(this)` and `Flower3D` render it. `run npx vitest run src/pages/shareParams.test.ts` — all green.

- [ ] **Step 4 — Backend client helpers (RED→GREEN where pure, else typed impl).** Add to `client.ts`: `fetchFlowerById(flowerId: string): Promise<FlowerListItem>` (GET `${flowerBackendBaseUrl}/api/flowers/${encodeURIComponent(flowerId)}`; throw `Error('not_found')` on 404, generic on other non-ok, parse the single-flower JSON — accept both `{flower:{…}}` and a bare flower object) and `postFlowerPreview(flowerId: string, png: Blob): Promise<boolean>` (POST the blob with `Content-Type: image/png`; return `res.ok`, swallow network errors → `false`). Add a vitest that stubs `fetch` (`vi.stubGlobal`) and asserts: 404 → rejects with message including `not_found`; ok → returns parsed item; `postFlowerPreview` returns `false` on a rejected fetch (never throws). `run npx vitest run src/integrations/flowerBackend`.

- [ ] **Step 5 — FlowerCanvas optional params prop (typecheck gate).** Change `export function FlowerCanvas({ params: paramsProp }: { params?: FlowerParams } = {})` and `const params = paramsProp ?? useFlowerStore((s) => s.params)` (call the hook unconditionally, then prefer the prop — do not conditionally call the hook). Confirm existing `<FlowerCanvas />` in CreateFlower still compiles (prop optional). **run `npx tsc --noEmit`** — must pass. (No behavior change for the studio; this only lets SharePreview pass a fetched flower.)

- [ ] **Step 6 — SharePreview presentational component (build).** In `SharePreview.tsx` render: a big centered `<FlowerCanvas params={params} />` in an `aspect-square sm:aspect-video` rounded container (`max-w-3xl mx-auto`), the `personName` as an `<h1 className="text-xl sm:text-2xl font-bold capitalize">`, a palette strip `<div className="h-2 rounded" style={{ background: previewGradient(params) }} />`, a `familyLabel(params)` chip (`text-xs capitalize`), the seed in `font-mono text-xs text-muted-foreground`, and two `h-10` CTAs: "Open the studio" (calls `onOpenStudio`) and "Mint" (calls `onMint`) — both `focus-visible:ring-2 ring-primary`, `motion-reduce:transition-none`. This is pure presentation; no data fetching.

- [ ] **Step 7 — ShareFlower page + public route (build).** In `ShareFlower.tsx`: read `useParams().flowerId`; on mount `fetchFlowerById(flowerId)` into state with `'loading' | 'ready' | 'notfound' | 'error'`. On ready, `const params = mapBackendJsonToFlowerParams(item.flower_id, item.params)` and `const paletteStops = params.palette?.stops ?? []`; render `<SharePreview params={params} personName={item.person_name} paletteStops={paletteStops} onOpenStudio={() => navigate('/create')} onMint={() => navigate('/create')} />` inside a public dark shell (`min-h-screen bg-background grid-bg` container, NOT `DashboardLayout`). Loading = the same spinner pattern as `ProtectedRoute`. Not-found/error = a centered `text-sm text-muted-foreground` message + a "Back to studio" link. In `App.tsx` add `{ path: "/share/:flowerId", element: <PageErrorBoundary><ShareFlower /></PageErrorBoundary> }` as a **sibling** of the `ProtectedRoute` child block (direct child of `AppProviders`'s `children`), so it is reachable logged-out. **run `npx tsc --noEmit`.**

- [ ] **Step 8 — Capture-at-SAVE (build).** In `CreateFlower.handleSave`, after `if (ok) { … }` succeeds, add a fire-and-forget block using the freshly-saved backend id (`useFlowerStore.getState().params.flowerId` — the create/collision paths set `editingFlowerId`/`flowerId`): `void (async () => { try { const png = await captureFlowerPng(); if (png) await postFlowerPreview(id, png); } catch {} })();` — must not block or fail the save, must not toast on preview failure (the share OG image is best-effort). Do not await it inside `handleSave`'s return path.

- [ ] **Step 9 — Share button: studio (build).** Add a `handleShare` in `CreateFlower`: guard on `params.flowerId` (toast "Save or generate a flower first" if empty); `const url = buildShareUrl(params.flowerId)`; if `navigator.share` exists call `navigator.share({ title, url }).catch(() => {})`, else `await navigator.clipboard.writeText(url); toast.success('Share link copied')`. Add a Share button in Row 2 actions next to PNG (`lucide-react` `Share2`, same `h`/padding as siblings, label `hidden sm:inline`).

- [ ] **Step 10 — Share button: cards (build).** In `MyFlowers` and `NftCollection` cards add a Share button that calls `buildShareUrl(flower.backendFlowerId ?? flower.id)` with the same navigator.share/clipboard logic (extract a tiny `shareFlowerLink(id, title)` helper in `shareParams.ts` to avoid duplication; unit-covered indirectly via `buildShareUrl`). The card Share button must be **touch-reachable**: always-visible below `sm` (`opacity-100 sm:opacity-0 sm:group-hover:opacity-100`) and `stopPropagation()` so it doesn't trigger the card's edit/open. Keep `text-xs`, icon ≥ `w-3.5`.

- [ ] **Step 11 — Branded OG asset + index.html tags (build).** Create `public/og-cover.svg` — a 1200×630 SVG on the near-black bg (`#08080f`) with an emerald→violet gradient bloom motif, "Petal Pixel Studio" in a system sans (SVG can't load Space Grotesk offline — use `font-family` fallback and note in a comment that a rasterized 1200×630 `og-cover.png` is preferred for scrapers that don't render SVG OG images). In `index.html` set `og:title`="Petal Pixel Studio — generative flower NFTs", a real `og:description`, `og:image`/`twitter:image`=`/og-cover.svg` (replace both `/favicon.ico`), keep `twitter:card`="summary_large_image", add `og:url` left generic. (Per-flower dynamic OG is served by share-backend's `/preview` image; this is the site-wide default.)

- [ ] **Step 12 — Reuse SharePreview in mint success (build).** In `CreateFlower.MintSuccessDialog`, render `<SharePreview>` (or its core name+palette+CTA block) above the existing Token ID / Contract / Tx rows, wiring `onOpenStudio`/`onMint` to sensible no-ops/close and passing the live `params` + `title`. Keep the MetaMask import instructions. Verify the dialog still fits `max-w-md` (SharePreview canvas may need a smaller `size`/aspect inside the dialog — cap its height).

- [ ] **Step 13 — Full typecheck + test gate.** From `petal-pixel-studio`: **run `npx tsc --noEmit`** (must pass) and **run `npx vitest run`** (full suite, must pass — confirms the new pure tests plus no regression in `flowerStore`/`snapshot`/`paletteUi` suites).

- [ ] **Step 14 — MANUAL VERIFICATION: logged-out share landing.** Start the frontend dev server (Docker Vite on `:8080`) and backend. Open an incognito window (no Supabase session) at `/share/<a-real-saved-flower-id>`. **@375 (mobile):** the flower renders full-width in a square canvas, name is `text-xl` and not clipped, palette strip visible, both CTAs are full-width-friendly `h-10` and tappable, page body does NOT scroll horizontally. **@768 (tablet):** canvas switches toward `aspect-video`, CTAs sit inline, layout centered `max-w-3xl`. **@1280 (desktop):** large centered preview, generous whitespace, no `DashboardLayout` sidebar present. Expected: a real 3D flower for the fetched id renders with NO login redirect (proves the route is outside `ProtectedRoute`). Also open `/share/does-not-exist` → the not-found message + "Back to studio" link (no crash, no infinite spinner).

- [ ] **Step 15 — MANUAL VERIFICATION: capture-at-save + Share button.** Logged in, generate + Save a flower. Expected: save toast fires immediately; a `POST /api/flowers/:id/preview` appears in the network panel shortly after and a failing/absent preview endpoint does NOT surface an error toast (fire-and-forget). Click the studio **Share** button: on a browser with `navigator.share` a share sheet opens; otherwise a "Share link copied" toast fires and the clipboard holds `<origin>/share/:id`. **@375** confirm the Share button label collapses to icon-only (`hidden sm:inline` on the text) and the button is still ≥ tap size. In **My Flowers** and **NFT Collection** **@375**, confirm each card's Share button is visible without hover (touch-reachable) and copying works; **@1280** confirm it may reveal on hover but never overlaps Edit/Delete.

- [ ] **Step 16 — MANUAL VERIFICATION: OG tags + mint reuse.** View-source the served `index.html` (Vite dev at `:8080`): `og:image` and `twitter:image` both point at `/og-cover.svg` (not `/favicon.ico`) and `/og-cover.svg` loads (200) showing the branded 1200×630 art. Trigger a mint success (or temporarily render `MintSuccessDialog` with a stub result): confirm the SharePreview block appears above the Token ID/Contract rows, the canvas is height-capped inside `max-w-md`, and MetaMask instructions remain. Note in the PR description that a rasterized `public/og-cover.png` is recommended for OG scrapers that don't render SVG.

- [ ] **Step 17 — Commit.** `git add -A && git commit` with:
  `feat(share): public /share/:id landing, Share buttons, capture-at-save preview, branded OG`
  Body: note the new pure `mapBackendJsonToFlowerParams`/`buildShareUrl` (unit-tested), the public route added outside `ProtectedRoute`, `FlowerCanvas` optional `params` prop, capture-at-save fire-and-forget `POST /preview`, `SharePreview` reused in the mint-success view, and the `og-cover.svg` swap (flag that a PNG is still preferred).
  End with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

---

**Key file references for the implementer (absolute paths):**
- Public route insertion point: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/App.tsx` (add sibling of the `ProtectedRoute` child block, inside `AppProviders.children`).
- v1/v2 store mapping to mirror: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/stores/flowerStore.ts` lines 278–360 (`generateFromWord`) and `hueToHex`/`clamp` (123–129); `FlowerParams` interface 24–62.
- Proto→render mapper to peer with (do NOT reuse directly — it consumes proto camelCase, not HTTP JSON): `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/math/flowerGeometry.ts` `toV2Params` (110–140), `buildV2Geometry` (155–176).
- Backend persisted `params` JSON shape (source of truth for the snake_case mapper): `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/flower-backend/internal/flower/generator.go` `type Params` (16–39) + shape structs (42–124) and `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/flower-backend/internal/flower/palette.go` `ColorStop.position`/`PaletteSpec` (12–28). `GET /api/flowers` writer that `/api/flowers/:id` will mirror: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/flower-backend/cmd/server/main.go` (`writeFlowersJSON`, `setAPICORSHeaders`).
- Canvas to extend: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/components/flower/FlowerCanvas.tsx` (60); `Flower3D` already takes `params` (23).
- Capture + save flow: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/pages/CreateFlower.tsx` `handleSave` (585–622), `MintSuccessDialog` (253–288), Row 2 actions (816–864); `captureFlowerPng` in `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/components/flower/snapshot.ts`.
- Cards to add Share to: `MyFlowers.tsx` card (234–332), `NftCollection.tsx` `NftCard` (88–172). Shared UI helpers: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/components/flower/paletteUi.ts` (`previewGradient`, `familyLabel`).
- `isV2` guard the mapper output must satisfy: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/math/flowerVersion.ts`.
- OG tags to fix: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/index.html` (10–18); `public/` currently holds only `favicon.ico`/`placeholder.svg`/`robots.txt`.
- Backend base URL env: `VITE_FLOWER_BACKEND_URL` (`.env.local`, default `http://localhost:50051`), exported as `flowerBackendBaseUrl` from client.ts.

**Notes for the plan author / dependency callouts:**
- `gifenc` is NOT yet in `petal-pixel-studio/package.json` — that install belongs to the **capture task** (owns `captureFlowerGif`); this task only consumes `captureFlowerPng`.
- The HTTP `/api/flowers/:id` **GET** and `/api/flowers/:id/preview` **POST** routes (plus their CORS/method handling and preview storage via `S3Uploader.PutBytes`/`PublicURL`) are owned by the **share-backend task**; this task's client + tests assume that contract. `main.go` currently only path-matches exact `/api/flowers` (no `:id`) — the share-backend task must add prefix routing.
- The mapper is deliberately independent of the proto/gRPC path so ShareFlower works logged-out with only a plain `fetch` (no Connect transport, no Supabase session).