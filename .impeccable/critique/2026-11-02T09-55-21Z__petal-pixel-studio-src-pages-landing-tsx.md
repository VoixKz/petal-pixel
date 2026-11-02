---
target: landing page
total_score: 20
max_score: 32
na_heuristics: 7,10
p0_count: 2
p1_count: 2
target_identity: "file:/Users/BexKex_1/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/pages/Landing.tsx"
target_fingerprint: "sha256:35cfd4e60de41113edab197cf8ff551bc7eab1222c5e11115ed9fc8f348702d5"
target_path: /Users/BexKex_1/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/pages/Landing.tsx
timestamp: 2026-11-02T09-55-21Z
slug: petal-pixel-studio-src-pages-landing-tsx
---
Method: dual-agent (A: independent design review, B: detector and browser measurements)

Scored before fixes, not rescored afterwards. First run after the switch to real flower models.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | The hero had no loading state for the flower |
| 2 | Match System / Real World | 3 | "Mint" and "NFT" leak into plain language |
| 3 | User Control and Freedom | 2 | Reloading loses the grown flower |
| 4 | Consistency and Standards | 3 | Orange How panel, "Water Lily" vs "Water lily" |
| 5 | Error Prevention | 2 | Nothing guarded model loading |
| 6 | Recognition Rather Than Recall | 3 | The scroll hint is easy to miss |
| 7 | Flexibility and Efficiency | n/a | Persuade surface |
| 8 | Aesthetic and Minimalist Design | 3 | 10 controls in #grow |
| 9 | Error Recovery | 1 | A raw stack trace replaced the page |
| 10 | Help and Documentation | n/a | Persuade surface |
| Total | | 20/32 | Acceptable |

## Design Specificity Verdict

Authored for this product in the front half: the sentence around a living plant, the soil-to-bloom slider, the night band and the hash panel. Category-interchangeable in the back half: feature list, FAQ, wordmark footer. The detector found 0 issues in source and 1 true positive on the page (line length in the credits, resolved). `buried-raster` on the hero poster and `edge-flush-cards` on the scroll strip are false positives.

## What's Working

- The hero composition, with the headline reading across the flower.
- The sameness promise holds: tiles match the live plant.
- Short, honest copy. The strongest moment is turning the lights off.

## Priority Issues

- [P0] FIXED: any model failure crashed the whole page. The stem now stays with a message, and a retry goes back to the network.
- [P0] FIXED: without WebGL the page crashed near the close.
- [P1] OPEN: the payoff is the quietest thing on screen. The result sentence is 14px, and Send it and Keep it are the weakest controls. Hero.tsx, .hero__says, .hero__next.
- [P1] OPEN: the page forgets the visitor between hero and close. #grow shows another flower with a picker that argues with "the name decides". How and Keep are about other names. Grow.tsx, Sections.tsx.
- [P2] MOSTLY FIXED: flower states. Hibiscus is clean and tiger lily stamens draw in. Still weak: tiger lily forms no tight bud, camellia sits on a swollen base and opens abruptly, the slider has dead zones at both ends.

## Persona Red Flags

- First-timer: "Dana grows a rose." before anything happens; Send it offers a stranger's flower; NFT appears for an audience promised no crypto.
- Phone: good thumb-zone form; 4 tap targets under 44px; shelf items easy to miss.
- Keyboard: Tab reaches Send it before the name field; turning has no keyboard route.

## Minor Observations

Label overlaps artwork on the Maya tile on phones; Questions heading lacks the full stop the others have; GIF export with the new heads not exercised live.

## Questions to Consider

- After typing Timur, why does the headline still say "Every name is a flower."?
- If the name decides everything, why can visitors choose a flower and a colour?
