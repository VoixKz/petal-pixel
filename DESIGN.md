---
name: Petal Pixel
description: A name becomes a flower. A calm pale gallery with very large type, black pills, and one colour borrowed from the flower last grown.
colors:
  petal-accent: "#ffec2e"
  on-accent: "#141412"
  ink: "#141412"
  ink-hover: "#33332f"
  muted-ink: "#5a5a5e"
  paper-white: "#ffffff"
  gallery-ground: "#f0f0f1"
  plinth: "#e5e5e7"
  plinth-deep: "#d6d6d9"
  night: "#141412"
  error-red: "#a3222a"
  console-amber: "hsl(43 96% 53%)"
  console-destructive: "hsl(0 72% 51%)"
  console-dark-ground: "hsl(60 5% 7%)"
  console-dark-card: "hsl(60 4% 10%)"
  console-dark-ink: "hsl(0 0% 96%)"
typography:
  display:
    fontFamily: "Hanken Grotesk Variable, system-ui, sans-serif"
    fontSize: "clamp(3.25rem, 8.2vw, 10.5rem)"
    fontWeight: 500
    lineHeight: 0.9
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Hanken Grotesk Variable, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 1.1rem + 5vw, 6rem)"
    fontWeight: 500
    lineHeight: 0.95
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Hanken Grotesk Variable, system-ui, sans-serif"
    fontSize: "clamp(1.25rem, 1.1rem + 0.7vw, 1.625rem)"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Hanken Grotesk Variable, system-ui, sans-serif"
    fontSize: "clamp(1.0625rem, 1rem + 0.25vw, 1.1875rem)"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "-0.005em"
  label:
    fontFamily: "Hanken Grotesk Variable, system-ui, sans-serif"
    fontSize: "clamp(0.8125rem, 0.79rem + 0.1vw, 0.875rem)"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "-0.005em"
  console-page-title:
    fontFamily: "Hanken Grotesk Variable, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  console-body:
    fontFamily: "Hanken Grotesk Variable, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  console-meta:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  inset: "8px"
  row: "10px"
  card: "14px"
  console: "16px"
  panel: "18px"
  dialog: "22px"
  stage: "24px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  page-margin: "clamp(16px, 2.3vw, 32px)"
  section: "clamp(96px, 12vw, 200px)"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper-white}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
  button-primary-disabled:
    backgroundColor: "{colors.plinth-deep}"
    textColor: "{colors.muted-ink}"
  button-quiet:
    backgroundColor: "{colors.plinth}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  button-quiet-hover:
    backgroundColor: "{colors.plinth-deep}"
  button-light:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  button-light-hover:
    backgroundColor: "{colors.plinth}"
  input-pill:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 18px"
    height: "48px"
  nav-bar:
    backgroundColor: "{colors.gallery-ground}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    padding: "0 clamp(16px, 2.3vw, 32px)"
    height: "64px"
  studio:
    backgroundColor: "{colors.plinth}"
    textColor: "{colors.ink}"
    rounded: "{rounded.stage}"
  specimen-tile:
    backgroundColor: "{colors.plinth}"
    textColor: "{colors.ink}"
    rounded: "{rounded.stage}"
  specimen-tile-strip:
    backgroundColor: "{colors.plinth-deep}"
    typography: "{typography.label}"
    padding: "14px 18px"
  accordion-closed:
    backgroundColor: "{colors.plinth}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.stage}"
    padding: "16px 24px"
  accordion-open:
    backgroundColor: "{colors.petal-accent}"
    textColor: "{colors.on-accent}"
  product-card:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.md}"
  product-panel:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "{spacing.md}"
  floating-form:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.dialog}"
    padding: "{spacing.lg}"
  console-button:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.card}"
    padding: "8px 16px"
    height: "40px"
---

# Design System: Petal Pixel

## Overview

**Creative North Star: "The Quiet Exhibit"**

Petal Pixel is a pale, almost silent room with one living thing in it. The ground, the plinths and the ink stay neutral so that the flower is the only object with a colour of its own. Type is very large and very plain, set in one family, and speaks in a few short sentences at the scale of a wall label read from across the room. Controls are black pills and soft-cornered white cards, so the working product reads as an object on display rather than a screenshot of one.

The world is tonal. Depth comes from stepping between the grey plinths, a white working surface and full-bleed Night, not from shadows or outlines. The one colour on the page is not a brand colour. It is borrowed from the flower most recently grown, so the page changes with each name and belongs to that name.

The world has two rooms sharing one material. The public face (home page and sign-in pages) is the full expression. The console keeps the same neutrals, family and ink through its own compact token set; it is denser and carries a dark theme and a fixed amber.

**Key Characteristics:**
- Pale neutral ground with near-black ink and pure white working surfaces.
- One accent, taken at runtime from the last grown flower.
- Hanken Grotesk only on the public face, weights 400 and 500.
- Black pills for every action; large soft corners on every container.
- Flat tonal steps, with a single shadow in the whole public face.
- Real generator renders, never stock, illustration or model-made imagery.

## Colors

Cool, barely violet greys and warm near-black, with one colour on loan from a flower.

### Primary
- **Petal Accent** (default in frontmatter): the middle stop of the last grown flower's palette, written onto the page root at runtime; the default is the middle stop of Dana's dahlia. It works as a ground: the third How field, the open question, the closing footer tile and text selection.
- **On Accent** (default in frontmatter): the text colour paired with the accent, recomputed as black or white, whichever reads better, whenever the accent changes.

### Neutral
- **Ink**: all text, the primary pill, the slider thumb, the focus ring.
- **Ink Hover**: the primary pill's hover state, one step lifted from Ink.
- **Muted Ink**: placeholders, secondary metadata, disabled labels. It holds 4.73:1 on Plinth Deep, its darkest ground.
- **Paper White**: working surfaces only: studio controls, cards, panels, the form, field fills, and text on Ink and Night.
- **Gallery Ground**: the page and the top bar.
- **Plinth**: what objects stand on: the studio view, tiles, closed questions, footer tiles, the closing section.
- **Plinth Deep**: one step down: tile name strips, the second How field, the slider track, disabled pills.
- **Night**: the full-bleed dark band. It has the same value as Ink but a different job, a place rather than a mark.

### Semantic
- **Error Red**: inline errors on the public face (7.45:1 on Paper White).

### Console
- **Console Amber**: the console's fixed accent, in both themes. It takes no colour from flowers.
- **Console Destructive**: destructive actions in the console.
- **Console Dark Ground, Card, Ink**: the console's dark theme, reached through the theme toggle; light is the default. The public face has no dark theme.

The console's light neutrals are the same world as the public neutrals in HSL form: `--background` matches Gallery Ground, `--secondary` matches Plinth, `--foreground` and `--primary` match Ink. Treat `index.css` as the console's source and do not hand-tune one side.

### Named Rules
**The Last Flower Rule.** The public accent is never chosen. It comes from the palette of the flower last grown, and every use goes through the variable so a new name repaints all of them at once.

**The Paired Ink Rule.** Anything set on the accent uses On Accent. Never fix black or white text on an accent ground, because the accent may be plum on the next name.

**The Ground Not Ink Rule.** On the public face the accent is only ever a background. No flower palette guarantees legible text on Gallery Ground, so accent never colours words.

## Typography

**Display Font:** Hanken Grotesk Variable (with system-ui, sans-serif)
**Body Font:** Hanken Grotesk Variable
**Label/Mono Font:** none on the public face; JetBrains Mono for console metadata only

**Character:** One grotesque doing all the work. Warmth comes from the drawing of the letters and from tight setting at scale, not from a pairing.

### Hierarchy
- **Display** (500, fluid to 8.2vw, 0.9): the single largest sentence on a page. It drops to 13.5vw at 900px and below.
- **Headline** (500, fluid to 6rem, 0.95): every section heading, always one short sentence. Sign-in headings use a smaller run of the same setting (clamp(2.25rem, 1.6rem + 2vw, 3.25rem)).
- **Title** (500, fluid to 1.625rem, 1.1 to 1.15): question summaries, process clauses, the wordmark, panel leads, at -0.03em (the wordmark at -0.04em).
- **Body** (400, fluid to 1.1875rem, 1.45): paragraphs, capped between 26em and 38em.
- **Label** (400, fluid to 0.875rem, 1.45): bar links, pills at weight 500, slider ends, footnotes.
- **Console** (page title, body and meta in frontmatter): a compact fixed scale for dense working screens, with monospace meta for data.

Inside the small product cards and panels, type runs at fixed sizes (13px to 22px), because these mimic pieces of interface rather than page text.

### Named Rules
**The Medium Ceiling Rule.** The public face uses 400 and 500 and nothing heavier. Scale carries the hierarchy, not weight.

**The Tighter When Larger Rule.** Tracking closes as size grows: -0.005em at body, -0.03em at title, -0.04em at headline and display.

## Layout

The page runs edge to edge with a fluid page margin and no centred container. Sections alternate between open ground with generous vertical padding (the section token) and full-bleed colour bands that sit flush against each other with no gap between them.

Grids are 4 columns for specimens and process fields, 2 for split heads, a 4fr / 8fr split for questions, and 12 for the footer's tile mosaic. Tile gaps are tight (12px, footer 8px) so tiles read as one group; section padding is large, so the contrast between the two is the rhythm. Paragraph spacing, control gaps and card padding step through 8, 12, 16, 24 and 40.

The fixed top bar is 64px and solid Gallery Ground, 56px on small screens. The one breakpoint is 900px: grids collapse to 1 or 2 columns, nav links hide and the console button stays, the held scroll stage is released so a phone scrolls normally, and the flower opens by itself instead. Viewport-tall sections use `svh`.

## Elevation & Depth

Flat by default. Separation comes from tonal steps (Gallery Ground, Plinth, Plinth Deep, Paper White) and from full-bleed Night, with the white card as the top layer. Inactive panels in the sideways row recede by opacity (0.32), not by shadow.

The flower is the exception to flatness, by being actually three-dimensional. It casts a soft radial pool of shade drawn in its own canvas, lit without tone mapping so petals keep their colour on a light page. It has no background of its own.

### Shadow Vocabulary
- **Floating form** (`box-shadow: 0 24px 60px rgba(20, 20, 18, 0.22)`): the white form in the closing section, which stands for an already-open dialog. It is the only CSS shadow on the public face.

### Named Rules
**The One Shadow Rule.** On the public face a soft shadow means an object that has lifted off the page. Cards, tiles and pills stay flat.

## Shapes

Everything is soft and nothing is sharp, except where a surface deliberately meets the edge of the screen. Radius tracks size: pills and fields are fully round, the largest containers take 24px, footer tiles and product panels 18px, small cards 14px, rows inside them 10px and thumbnails 8px, so nested corners stay concentric in feel. Full-bleed bands stay square. Studio slivers round only the edge facing the studio, since their far edge is cut by the bar or the viewport.

Colour chips and the slider thumb are circles. The accordion sign is two drawn CSS bars that rotate, not a glyph. Lines are rare: the only strokes on the public face are the 1px borders on fields.

## Components

### Buttons
Confident and single-minded: one shape everywhere.
- **Shape:** fully round pill, 48px tall (40px in the mobile bar, 52px in the form).
- **Primary:** Ink ground, white label at weight 500.
- **Hover / Focus:** ground lifts to Ink Hover over 160ms, press scales to 0.97. Focus is a 3px Ink outline offset 3px.
- **Quiet:** Plinth ground on light areas, used for secondary sign-in actions.
- **Light:** Paper White ground, for pills on Night.
- **Disabled:** Plinth Deep ground, Muted Ink label, no press movement, in every variant.
- **Console:** the console button uses the rounded rectangle in frontmatter, not a pill. Black pills belong to the public face.

### Inputs / Fields
- **Style:** full pill, Paper White fill, 1px Plinth Deep stroke, 48px tall (52px on sign-in pages), inheriting the body type.
- **Hover:** stroke darkens to Muted Ink over 160ms.
- **Focus:** the shared 3px Ink outline.
- **Error:** an inline sentence in Error Red below the control, announced as an alert. The field itself does not change.
- **Slider:** 6px Plinth Deep track, 22px Ink thumb that scales to 1.15 while held.

The resting stroke measures 1.45:1 on white. It is recorded as shipped and is a known weakness, not a target for new fields.

### Cards / Containers
- **Tiles:** Plinth picture area with a contained flower, on a Plinth Deep name strip, 24px corners, clipped. Hover turns the flower slightly (scale 1.05, rotate -2deg, 500ms), never the tile.
- **Product cards and panels:** Paper White with 14px or 18px corners and 16px padding; these are small pieces of real interface shown on the page. Selected rows inside them use Gallery Ground.
- **Footer tiles:** Plinth, 18px corners, 20px padding, with Night and accent tiles as the mosaic's two loud pieces.
- **Shadow Strategy:** flat, see Elevation & Depth. The floating form is the single exception.

### Navigation
A solid, borderless bar: wordmark left at Title setting, label-sized links right, then a primary pill. Links fade to 0.6 opacity on hover. Below 900px the links hide and the pill remains. There is no menu.

### Accordion
Each question is a Plinth block with 24px corners and a Title-sized summary. The open item takes the accent ground and On Accent text, and its plus folds to a minus (200ms).

### Studio
The signature component: a live flower in a Plinth frame with white controls docked below, containing a name field, a Grow pill, a Bud to Bloom slider, and a plain result sentence in the frame's corner. A poster still sits under the canvas and fades out (500ms) when the flower is ready. The flower works on a page with no account behind it.

### Reveal Motion
Blocks rise once on entering view (24px, 620ms, `cubic-bezier(0.2, 0.7, 0.2, 1)`), staggered 70ms across a row. Content is only hidden after the script has marked the page, so it survives with no script. Reduced motion removes the rise and jumps growth to its end state.

## Do's and Don'ts

### Do:
- **Do** route every accent through the accent and on-accent variables so the next name repaints them together.
- **Do** use only real generator output for flowers, with a provenance sidecar beside every shipped raster in `public/flowers/`.
- **Do** step between Gallery Ground, Plinth, Plinth Deep and Paper White to separate surfaces before reaching for anything else.
- **Do** keep each heading to one short sentence at Headline scale.
- **Do** label anything unreleased as coming, with a disabled treatment, as the Mint panel does.

### Don't:
- **Don't** use weights above 500 on the public face.
- **Don't** colour text with the accent on the public face.
- **Don't** fix an accent hue in a public component, or fix text colour on an accent ground.
- **Don't** add a second CSS shadow to the public face, or shadow a card, tile or pill.
- **Don't** use a square, rectangular or outlined action on the public face; every action is a pill.
- **Don't** add a dark theme to the public face, or a monospace face to it, including for hashes, which stay in Hanken Grotesk with tabular figures.
- **Don't** invent customers, numbers or testimonials as decoration; the flower is the proof.
- **Don't** give a flower a canvas background or tone mapping; it stands on the page's own ground.
