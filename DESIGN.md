---
name: Petal Pixel
description: A name becomes a flower. A calm pale gallery with very large type, black pills, and one colour borrowed from the flower last grown.
colors:
  petal-accent: "#e0005e"
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
  specimen-tile:
    backgroundColor: "{colors.plinth}"
    textColor: "{colors.ink}"
    rounded: "{rounded.stage}"
  accordion-closed:
    backgroundColor: "{colors.plinth}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.stage}"
    padding: "16px 24px"
  accordion-open:
    backgroundColor: "{colors.petal-accent}"
    textColor: "{colors.on-accent}"
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
- Real flowers only: the plant's own 3D models of real flowers, never stock photos, illustration or image-model pictures. The specimen tiles, the Night Shelf, the Grow thumbnails and the cover are captured from the live plant, so a picture always matches what the page grows.

## Colors

Cool, barely violet greys and warm near-black, with one colour on loan from a flower.

### Primary
- **Petal Accent** (default in frontmatter): the middle stop of the last grown flower's palette, written onto the page root at runtime; the default is the middle stop of Dana's rose. It works as a ground for the open question and for text selection. The third How field keeps Dana's own colour, because that section is a worked example of Dana.
- **On Accent** (default in frontmatter): the text colour paired with the accent, recomputed as black or white, whichever reads better, whenever the accent changes.

### Neutral
- **Ink**: all text, the primary pill, the slider thumb, the focus ring.
- **Ink Hover**: the primary pill's hover state, one step lifted from Ink.
- **Muted Ink**: placeholders, secondary metadata, disabled labels. It holds 4.73:1 on Plinth Deep, its darkest ground.
- **Paper White**: working surfaces only: field fills, light pills, and text on Ink and Night.
- **Gallery Ground**: the page and the top bar.
- **Plinth**: what objects stand on: tiles, closed questions, the closing section.
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

Grids are 4 columns for specimens, process fields and the things a flower can do, a 7fr / 5fr split for the close, and a 4fr / 8fr split for questions. Tile gaps are tight (12px) so tiles read as one group; section padding is large, so the contrast between the two is the rhythm. Paragraph spacing, control gaps and card padding step through 8, 12, 16, 24 and 40.

The fixed top bar is 64px and solid Gallery Ground, 56px on small screens. The one breakpoint is 900px: grids collapse to 1 or 2 columns, nav links hide and the console button stays, the held scroll stage is released so a phone scrolls normally, and the flower opens by itself instead. Viewport-tall sections use `svh`.

## Elevation & Depth

Flat by default. Separation comes from tonal steps (Gallery Ground, Plinth, Plinth Deep, Paper White) and from full-bleed Night.

The flower is the exception to flatness, by being actually three-dimensional. It casts a soft radial pool of shade drawn in its own canvas, lit without tone mapping so petals keep their colour on a light page. It has no background of its own.

### Shadow Vocabulary

### Named Rules
**The One Shadow Rule.** On the public face a soft shadow means an object that has lifted off the page. Cards, tiles and pills stay flat.

## Shapes

Everything is soft and nothing is sharp, except where a surface deliberately meets the edge of the screen. Radius tracks size: pills and fields are fully round, tiles and questions take 24px, and flower pickers 14px, so nested corners stay concentric in feel. Full-bleed bands stay square.

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
- **Specimen tile:** a picture of one name's flower on Plinth with its name over the foot of the tile. Hovering or focusing it, or the section's light switch, swaps in the same flower lit from inside on Night.
- **Process field:** one thing at full size on its own full-bleed ground: the name at display scale, the hash at large tabular figures, the facts at headline scale, the flower lit from inside.
- **Shadow Strategy:** flat, see Elevation & Depth.

### Navigation
A solid, borderless bar: wordmark left at Title setting, label-sized links right, then a primary pill. Links fade to 0.6 opacity on hover. Below 900px the links hide and the pill remains. There is no menu.

### Accordion
Each question is a Plinth block with 24px corners and a Title-sized summary. The open item takes the accent ground and On Accent text, and its plus folds to a minus (200ms).

### Hero
The signature component: a live plant fills the held first screen, with the sentence split to either side of it. Under it sit a name field, a Grow pill, a plain result sentence, and two text actions: Send it, which copies a link that opens on this flower with the name after the #, and Keep it, which goes to the close. A name grows from soil to a half-open flower by itself, and scrolling the held stage opens the rest. A poster still sits under the canvas and fades out (500ms) when the plant is ready. It works with no account and sends nothing anywhere.

### Close
The flower the visitor grew, live and fully open, stands on the foot of the band with its stem running off the edge, beside the name already filled in. The sign-in page carries the same flower and names it in the heading. Nothing further down the page shows another person's flower where the visitor's own belongs.

### Night Shelf
A full-bleed Night band of whole flowers lit from inside, standing in a row. Each picture fades into the night, and pictures overlap with a lighten blend so neighbouring glows join. Below 900px the row scrolls sideways.

### Bloom View
The plant on its own stage, used in the console studio and on a shared flower's page: a live plant, an age slider and pills for growing again and the lights. It keeps the public ground in both console themes, and starts with the lights off when the console is dark. On a shared page the words stand left of it, and below 900px they follow it.

### Flower Thumbnail
Each card in the console shows the flower drawn on the visitor's own device from its name, kept in local storage, on the console's secondary ground. Nothing is fetched and nothing needs a picture store.

### Growth Stage
A full-bleed band with the plant standing right of the words: the visitor's own flower growing from soil to bloom under one slider, and pills for growing again and for the lights. Below 900px the words come first, then the plant holds at the top of the screen at 46svh while the controls pass under it, with the flowers in one scrolling row. Turning the lights off is the one place the public face goes dark on request: the band moves to Night over 900ms and the flower glows from its heart. Only the band changes; the bar and the rest of the page stay on Gallery Ground. Bloom needs an opaque canvas, so this canvas paints the band's exact colour as its background.

### Reveal Motion
Blocks rise once on entering view (24px, 620ms, `cubic-bezier(0.2, 0.7, 0.2, 1)`), staggered 70ms across a row. Content is only hidden after the script has marked the page, so it survives with no script. Reduced motion removes the rise and jumps growth to its end state.

## Do's and Don'ts

### Do:
- **Do** route every accent through the accent and on-accent variables so the next name repaints them together.
- **Do** use only real generator output for flowers, with a provenance sidecar beside every shipped raster in `public/flowers/`.
- **Do** step between Gallery Ground, Plinth, Plinth Deep and Paper White to separate surfaces before reaching for anything else.
- **Do** keep each heading to one short sentence at Headline scale.
- **Do** label anything unreleased as coming, in the words beside it, as the Mint line does.

### Don't:
- **Don't** use weights above 500 on the public face.
- **Don't** colour text with the accent on the public face.
- **Don't** fix an accent hue in a public component, or fix text colour on an accent ground.
- **Don't** add a second CSS shadow to the public face, or shadow a card, tile or pill.
- **Don't** use a square, rectangular or outlined action on the public face; every action is a pill.
- **Don't** add a dark theme to the public face beyond the night views of the Growth Stage and the gallery, or a monospace face to it, including for hashes, which stay in Hanken Grotesk with tabular figures.
- **Don't** invent customers, numbers or testimonials as decoration; the flower is the proof.
- **Don't** give a flower a canvas background other than its band's own colour, or tone mapping; it stands on the page's own ground. Night pictures fade into Night with a mask, so no picture shows an edge.
