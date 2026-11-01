# Phase 2 — Richer 3D Generation (Method 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make a typed name produce a beautiful, diverse 3D flower by having the Go backend emit a full render-ready parameter set (family + palette + per-family geometry params) that the frontend renders directly — adding three new 3D families (sunflower/phyllotaxis, rhodonea, superformula), hybrid palettes, and full-name/Unicode input, without breaking any already-saved flower.

**Architecture:** Backend is source of truth (Method 2). `GenerateFromName` derives the seed (SHA-256, unchanged), draws each parameter from an INDEPENDENT sub-stream (decorrelated), picks a family by weighted table, picks + bakes a curated palette, and fills a proto `oneof shape`. The six v1 scalar fields stay populated so old `algoVersion:"v1"` flowers render unchanged via the existing `toTechniqueParams` path; v2 flowers render via a new `buildV2Geometry` dispatch. Codegen (buf) and Go tests run via Docker (host has no Go/buf).

**Tech Stack:** Go 1.25 + ConnectRPC/protobuf (buf remote plugins), React 18 + Vite + TS + Three.js + Zustand. Design spec: `docs/superpowers/specs/2026-07-02-flower-generation-redesign-design.md`.

## Global Constraints

- **Branch:** `feat/richer-flower-generation` (continues Phase 1). Commit per task. End messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Backward compatibility is mandatory.** `algo_version` bumps to `"v2"`. The 6 v1 scalars (`petal_count,petal_length,petal_width,curvature,stem_height,hue`) MUST stay populated. `toTechniqueParams` + `pickFlowerTypeFromSeed` + `FLOWER_TYPES` (6-entry order) MUST NOT change — v1 saved flowers must render pixel-identically. v2 is an ADDITIVE branch.
- **Determinism:** same name → same flower. Seed derivation, `splitmix64`, `seedFromString`, `normalizeName` unchanged.
- **No DB migration** — `flowers.params` is jsonb; new struct fields round-trip automatically.
- **3D only.** New families are Three.js parametric surfaces built like `bloom.ts` (radial×theta grid → BufferGeometry → computeVertexNormals), vertex count capped ~130k.
- **Codegen/tests via Docker (verified):** `docker run --rm -v "$PWD":/workspace -w /workspace/flower-backend bufbuild/buf generate` (Go) and `... generate --template buf.gen.frontend.yaml` (TS); Go tests `docker run --rm -v "$PWD/flower-backend":/src -w /src golang:1.25-alpine go test ./...`. Regenerated stubs stay committed. Frontend tests as in Phase 1 (`cd petal-pixel-studio && npx vitest run`; no `@testing-library/user-event`).
- **HSB-unit shifts:** existing `BloomParams.satShift/briShift` are HSB units (0-100) and must stay so for v1 identity; the new `PaletteSpec.hue_shift/sat_shift/bri_shift` are separate render-time palette shifts. Do not conflate.

## Reconciled design decisions (from the design synthesis — these are binding)

1. PALETTE REPRESENTATION (proto-go/family-math vs frontend): proto-go+family-math defined ColorStop as {position,r,g,b in [0,1]} with hue/sat/bri shifts applied AT RENDER TIME on the client; the frontend section defined PaletteStop as {pos, hex string} with shifts ALREADY BAKED into the stops and a samplePalette(stops,t) that reads hex. RESOLUTION: canonical ColorStop carries BOTH hex AND r,g,b (all backend-filled, mutually consistent); the Go backend BAKES the hue/sat/bri shifts into the stops (so both hex and r,g,b are post-shift) and echoes hue_shift/sat_shift/bri_shift on PaletteSpec only for provenance. TS samplePalette consumes .hex (mapping proto position->pos). This satisfies the frontend contract (baked hex) without discarding the proto-go catalog/shift machinery.
2. PALETTE FIELD NAMES: proto-go PaletteSpec.id vs frontend Palette had no id; frontend PaletteStop.pos vs proto ColorStop.position. RESOLUTION: proto is canonical wire (id, ColorStop.position, ColorStop.hex); TS Palette gains id and PaletteStop uses pos (mapped from position by toV2Params). Proto PaletteSpec.stops is the single source.
3. ONEOF NUMBERING (family-math vs proto-go/frontend): family-math proposed family=10, sunflower=11, rhodonea=12, superformula=13 with NO palette message and NO oneof (and it collided: 11/12/13 reused for both a palette-less scheme and the existing families). proto-go and frontend both proposed family=10, palette=11, oneof shape {classic=12,rose=13,bloom=14,sunflower=15,rhodonea=16,superformula=17}. RESOLUTION: adopt proto-go/frontend numbering (family=10, palette=11, oneof 12-17). family-math's numbering is discarded; its geometry content is kept.
4. SUNFLOWER PARAMS (three different designs): proto-go used floret_count/golden_angle/packing/disc_radius/ray_petals/ray_length/ray_width/dome/floret_size; frontend used seedCount/goldenAngleDeg/cScale/discRadius/seedSize/domeCurve (individual-floret point cloud); family-math used scale/floretRings/floretSpokes/domeHeight/discRatio/rayPetals/rayLength/rayWidth/seedPacking (continuous domed SURFACE + ray rim). RESOLUTION: the family-math SURFACE design is authoritative (it is the only one that produces a proper meshed BufferGeometry matching the bloom construction style and respects the vertex cap; point-cloud florets do not fit the position+color+index+computeVertexNormals convention). Canonical sunflower params = family-math's 9 + sat_shift/bri_shift. golden angle is a FIXED constant (137.50776405003785 deg), NOT a param, resolving proto-go's golden_angle and frontend's goldenAngleDeg (both dropped).
5. RHODONEA PARAMS: proto-go used n/d/amplitude/samples/thickness/z_lift/z_curve/layer_count (whole-curve sweep, rational k=n/d); frontend used k/n/d/amplitude/thetaTurns/z; family-math used radius/k(integer)/petalSpan/widthProfile/heightProfile/thickness/curl/lengthSeg/widthSeg (PER-PETAL lofted patches, integer k). RESOLUTION: family-math per-petal design is authoritative (verified petal-count rule, avoids even-k self-overlap, matches grid construction). Canonical uses integer k in [2,9] (drops rational n/d entirely) and radius as master scale (drops proto-go's amplitude name -> radius). z_lift/z_curve/layer_count and thetaTurns dropped in favor of height_profile/curl/thickness.
6. SUPERFORMULA PARAMS (single vs dual superformula): proto-go and frontend both specified a SINGLE 2D superformula (m,n1,n2,n3,a,b + scale/height); family-math specified the 3D SPHERICAL PRODUCT of TWO superformulas (m1..b1 longitude, m2..b2 latitude, uSeg/vSeg). RESOLUTION: family-math dual-superformula is authoritative (it is the only one that yields a true 3D surface; a single 2D superformula is just an outline needing an unspecified loft). Canonical superformula params = 15 fields (scale, m1,n1a,n2a,n3a,a1,b1, m2,n1b,n2b,n3b,a2,b2, uSeg,vSeg) + sat_shift/bri_shift. proto-go's flat m/n1/n2/n3/a/b/samples/radius/height/z_twist/layers and frontend's m/n1/n2/n3/a/b/radial/height are discarded.
7. SHIFT UNITS MISMATCH (bloom vs new families): existing BloomParams.satShift/briShift are HSB UNITS (added directly into hsbToThreeColor's 0-100 s/b, e.g. seed-derived -20..20 / -15..15 in toTechniqueParams) and MUST stay that way for v1 pixel-identity. proto-go's PaletteSpec.sat_shift/bri_shift are FRACTIONS ([-0.20,0.20]/[-0.15,0.15]). The new families (sunflower/rhodonea/superformula) also carry sat_shift/bri_shift. RESOLUTION: (a) BloomParams.sat_shift/bri_shift stay HSB units, range FR(-20,20)/FR(-15,15) — unchanged semantics. (b) PaletteSpec.sat_shift/bri_shift are FRACTIONS (provenance only, baked into stops). (c) New-family per-shape sat_shift/bri_shift are FRACTIONS FR(-0.15,0.15)/FR(-0.12,0.12); the math multiplies them by 100 before adding into hsbToThreeColor's 0-100 scale (documented in the formulas). This keeps three distinct-but-consistent usages explicit.
8. V2 COLOR SOURCE (per-shape shifts vs palette): family-math wrote hardcoded HSB ramps (hue=45-20*(1-t) etc.) for the new families AND carried sat_shift/bri_shift, while the frontend section says every v2 family bakes the PALETTE via samplePalette. RESOLUTION: for v2 the PALETTE is the authoritative color source — new-family builders SHOULD call samplePalette(palette.stops, t) for base color; the per-shape sat_shift/bri_shift apply a small additional HSB nudge on top (converted fraction->HSB units). family-math's literal hue numbers become the FALLBACK ramp used only if palette is absent. This unifies frontend's palette-first rule with family-math's shift-carrying params.
9. CLASSIC IN V2 (color attribute): v1 classic has NO vertex colors (uses material.color); frontend v2 requires all v2 families use vertexColors:true. RESOLUTION: add createClassicFlowerGeometryV2(classicParams, palette) that reruns v1 position math + adds a color attribute (samplePalette at radial t). v1 createClassicFlowerGeometry untouched. Flower3D usesVertexColors = isV2(params) ? true : (rose||bloom).
10. CLASSIC BLOSSOM ROTATION in v2: v1 classic uses [-PI/2,0,0]; blooms/rose/new use [PI,0,0]. RESOLUTION: in Flower3D, when isV2 && family==='classic' use [-PI/2,0,0]; all other v2 families use [PI,0,0] (matches family-math's instruction to treat the three new families like the bloom branch).
11. FLOWER_TYPES vs V2_FAMILIES: family-math said append the 3 new families to FLOWER_TYPES; frontend said keep FLOWER_TYPES as-is (v1, feeds pickFlowerTypeFromSeed) and add a separate V2_FAMILIES. RESOLUTION: adopt frontend's approach — FLOWER_TYPES stays the 6-entry v1 list (DO NOT reorder/append; reordering would remap saved v1 seeds), and V2_FAMILIES is the new 9-entry list used only on the v2 path. family selection for v2 happens in the Go backend (weighted table), NOT via pickFlowerTypeFromSeed.
12. SUNFLOWER/SUPERFORMULA MASTER SCALE vs RHODONEA: sunflower & superformula use params.scale (default 300); rhodonea uses params.radius (default 260) — intentional per family-math and preserved. Documented so implementers don't add a redundant scale to rhodonea.
13. SEED-DRAW DECORRELATION vs family-math's 'seed % totalFamilies': family-math suggested family = seed % totalFamilies and reusing the single splitmix64 stream; proto-go specified per-field deriveSeed sub-streams + a weighted family table. RESOLUTION: proto-go's deriveSeed/stream(salt) + weighted familyTable is authoritative (decorrelated, future-proof against draw-order shifts). family-math's modulo selection is discarded.

## Canonical proto contract

```proto
CANONICAL PROTO ADDITIONS to flower-backend/proto/flower/v1/service.proto
(package flower.v1; go_package "flower-backend/gen/go/flower/v1;flowerv1")

FlowerParams fields 1-9 are UNCHANGED (algo_version=1, schema_version=2, seed=3, petal_count=4, petal_length=5, petal_width=6, curvature=7, stem_height=8, hue=9). Append fields 10, 11, and the oneof (12-17). All additive, wire-compatible.

--- Append inside message FlowerParams, after field 9 (hue) ---

  // v2 render contract. Populated only when algo_version == "v2".
  // v1 clients ignore these; v2 clients render directly from them.
  // Family selector. One of: "classic" | "rose" | "zinnia" | "camellia"
  //   | "lotus" | "dahlia" | "sunflower" | "rhodonea" | "superformula".
  string family = 10;

  // Render-ready palette. hue_shift/sat_shift/bri_shift are ALREADY BAKED
  // into `stops` by the Go backend; they are echoed here only for provenance/
  // client re-derivation. v2 clients sample `stops` directly (see samplePalette).
  PaletteSpec palette = 11;

  // Per-family geometry parameters. Exactly one is set, matching `family`.
  oneof shape {
    ClassicParams      classic      = 12;
    RoseParams         rose         = 13;
    BloomParams        bloom        = 14;  // zinnia | camellia | lotus | dahlia
    SunflowerParams    sunflower    = 15;
    RhodoneaParams     rhodonea     = 16;
    SuperformulaParams superformula = 17;
  }
}

--- New top-level messages (package flower.v1) ---

// A single gradient control point. RESOLUTION of proto-go vs frontend conflict:
// canonical wire form carries BOTH an sRGB hex string (what the TS samplePalette
// consumes directly) AND normalized r,g,b floats in [0,1] (what any linear-space
// consumer can use). position in [0,1]. Backend fills all four; they are
// consistent (hex == #RRGGBB of round(r*255),round(g*255),round(b*255)).
message ColorStop {
  float  position = 1;   // TS field: pos
  string hex      = 2;   // "#rrggbb", lowercase; TS samplePalette uses this
  float  r        = 3;   // [0,1]
  float  g        = 4;   // [0,1]
  float  b        = 5;   // [0,1]
}

// A named gradient. `stops` already have name-derived HSB shifts BAKED IN.
message PaletteSpec {
  string             id        = 1;   // catalog id, e.g. "sunset_coral"
  repeated ColorStop stops     = 2;   // >= 2, ascending position, first=0 last=1
  float              hue_shift = 3;   // degrees, [-30,30]  (provenance)
  float              sat_shift = 4;   // fraction, [-0.20,0.20] (provenance)
  float              bri_shift = 5;   // fraction, [-0.15,0.15] (provenance)
}

// Mirrors frontend ClassicParams (flowerTypes.ts). rows/cols fixed 84/144.
message ClassicParams {
  uint32 rows     = 1;
  uint32 cols     = 2;
  uint32 p_num    = 3;
  float  f_d      = 4;
  float  p_len    = 5;
  float  p_sharp  = 6;
  float  f_height = 7;
  float  curve1   = 8;
  float  curve2   = 9;
  float  b        = 10;
  uint32 b_num    = 11;
}

// Mirrors frontend RoseParams.
message RoseParams {
  float opening   = 1;
  float v_density = 2;
  float p_align   = 3;
  float curve1    = 4;
  float curve2    = 5;
}

// Mirrors frontend BloomParams (zinnia/camellia/lotus/dahlia).
message BloomParams {
  float scale      = 1;
  float opening    = 2;
  float density    = 3;
  float petal_freq = 4;
  float petal_amp  = 5;
  float hang_down  = 6;
  float fade       = 7;
  float theta_step = 8;
  float r_step     = 9;
  float sat_shift  = 10;
  float bri_shift  = 11;
}

// NEW. Phyllotaxis domed seed-head + ray-petal rim (family-math (a)).
// golden angle is a fixed math constant, NOT a param.
message SunflowerParams {
  float  scale         = 1;   // master size (200..380)
  uint32 floret_rings  = 2;   // radial resolution of seed head (40..150)
  uint32 floret_spokes = 3;   // angular resolution of seed head (120..320)
  float  dome_height   = 4;   // z-dome amplitude (0..90)
  float  disc_ratio    = 5;   // seed-head radius / total (0.40..0.78)
  uint32 ray_petals    = 6;   // visible ray-petal count (13..55)
  float  ray_length    = 7;   // petal length as fraction of scale (0.25..0.75)
  float  ray_width     = 8;   // angular half-width factor (0.40..1.20)
  float  seed_packing  = 9;   // spiral tightness multiplier (0.70..1.40)
  float  sat_shift     = 10;  // fraction, baked into vertex color
  float  bri_shift     = 11;  // fraction, baked into vertex color
}

// NEW. Rose (rhodonea) r=cos(k*theta), per-petal lofted surface (family-math (b)).
message RhodoneaParams {
  float  radius         = 1;   // petal length scale (180..340)
  uint32 k              = 2;   // integer rose frequency (2..9); odd->k petals, even->2k
  float  petal_span     = 3;   // fraction of natural half-window (0.60..1.00)
  float  width_profile  = 4;   // max half-width / length (0.20..0.70)
  float  height_profile = 5;   // vertical arch amplitude (0..120)
  float  thickness      = 6;   // central bulge shell offset (0..18)
  float  curl           = 7;   // tip curl-down (0..1)
  uint32 length_seg     = 8;   // radial resolution per petal (12..48)
  uint32 width_seg      = 9;   // cross resolution per petal (8..32)
  float  sat_shift      = 10;
  float  bri_shift      = 11;
}

// NEW. Gielis 3D via spherical product of two superformulas (family-math (c)).
// r(a; m,n1,n2,n3,A,B) = (|cos(m*a/4)/A|^n2 + |sin(m*a/4)/B|^n3)^(-1/n1)
message SuperformulaParams {
  float  scale  = 1;   // master size (200..360)
  // longitude superformula (theta) -> petal/lobe count around equator
  float  m1     = 2;   // (2..16)
  float  n1a    = 3;   // n1 of longitude (>0, 0.30..3)
  float  n2a    = 4;   // (0.30..6)
  float  n3a    = 5;   // (0.30..6)
  float  a1     = 6;   // (>0, 0.60..1.60)
  float  b1     = 7;   // (>0, 0.60..1.60)
  // latitude superformula (phi) -> vertical bell/dome/pinch
  float  m2     = 8;   // (0..16; 0 -> smooth revolution)
  float  n1b    = 9;   // (>0, 0.30..3)
  float  n2b    = 10;  // (0.30..6)
  float  n3b    = 11;  // (0.30..6)
  float  a2     = 12;  // (0.60..1.60)
  float  b2     = 13;  // (0.60..1.60)
  uint32 u_seg  = 14;  // longitude resolution (120..340)
  uint32 v_seg  = 15;  // latitude resolution (80..200)
  float  sat_shift = 16;
  float  bri_shift = 17;
}

NOTE: protoc-gen-go names the oneof wrapper struct field `Shape` and the case
types FlowerParams_Classic ... FlowerParams_Superformula. protoc-gen-es emits
`shape` as a discriminated-union `case`/`value` (connect-es v2). Confirm exact
generated names after running buf; the mapper in flower_server.go uses them.
```

## Go generator + palette (canonical)

CANONICAL flower.Params v2 struct + palette catalog + per-family range table
(flower-backend/internal/flower/generator.go and a new palette.go)

--- Version constants ---
const (
    AlgoVersion   = "v2"   // bumped from "v1"
    SchemaVersion = "v2"
)

--- Determinism (UNCHANGED core + new decorrelated sub-streams) ---
// seedFromString (SHA-256, first 8 bytes LE) UNCHANGED.
// splitmix64 (newSplitMix64, next, Uint32n, Float64) UNCHANGED.
// normalizeName UNCHANGED.
func deriveSeed(base uint64, salt string) uint64 {
    h := sha256.New()
    var buf [8]byte
    binary.LittleEndian.PutUint64(buf[:], base)
    h.Write(buf[:]); h.Write([]byte("|")); h.Write([]byte(salt))
    return binary.LittleEndian.Uint64(h.Sum(nil)[0:8])
}
func stream(base uint64, salt string) *splitmix64 { return newSplitMix64(deriveSeed(base, salt)) }
// helpers on *splitmix64:
func (r *splitmix64) FloatRange(min, max float64) float64 { return min + r.Float64()*(max-min) }
func (r *splitmix64) IntRange(min, max int) int           { return min + int(r.Uint32n(uint32(max-min+1))) } // inclusive

--- Structs (JSON tags snake_case to match proto field names, for jsonb round-trip via store.go; no migration) ---
type ColorStop struct {
    Position float32 `json:"position"`
    Hex      string  `json:"hex"`
    R        float32 `json:"r"`
    G        float32 `json:"g"`
    B        float32 `json:"b"`
}
type PaletteSpec struct {
    ID       string      `json:"id"`
    Stops    []ColorStop `json:"stops"`
    HueShift float32     `json:"hue_shift"`
    SatShift float32     `json:"sat_shift"`
    BriShift float32     `json:"bri_shift"`
}
type ClassicParams struct {
    Rows    uint32  `json:"rows"`
    Cols    uint32  `json:"cols"`
    PNum    uint32  `json:"p_num"`
    FD      float32 `json:"f_d"`
    PLen    float32 `json:"p_len"`
    PSharp  float32 `json:"p_sharp"`
    FHeight float32 `json:"f_height"`
    Curve1  float32 `json:"curve1"`
    Curve2  float32 `json:"curve2"`
    B       float32 `json:"b"`
    BNum    uint32  `json:"b_num"`
}
type RoseParams struct {
    Opening  float32 `json:"opening"`
    VDensity float32 `json:"v_density"`
    PAlign   float32 `json:"p_align"`
    Curve1   float32 `json:"curve1"`
    Curve2   float32 `json:"curve2"`
}
type BloomParams struct {
    Scale     float32 `json:"scale"`
    Opening   float32 `json:"opening"`
    Density   float32 `json:"density"`
    PetalFreq float32 `json:"petal_freq"`
    PetalAmp  float32 `json:"petal_amp"`
    HangDown  float32 `json:"hang_down"`
    Fade      float32 `json:"fade"`
    ThetaStep float32 `json:"theta_step"`
    RStep     float32 `json:"r_step"`
    SatShift  float32 `json:"sat_shift"`
    BriShift  float32 `json:"bri_shift"`
}
type SunflowerParams struct {
    Scale        float32 `json:"scale"`
    FloretRings  uint32  `json:"floret_rings"`
    FloretSpokes uint32  `json:"floret_spokes"`
    DomeHeight   float32 `json:"dome_height"`
    DiscRatio    float32 `json:"disc_ratio"`
    RayPetals    uint32  `json:"ray_petals"`
    RayLength    float32 `json:"ray_length"`
    RayWidth     float32 `json:"ray_width"`
    SeedPacking  float32 `json:"seed_packing"`
    SatShift     float32 `json:"sat_shift"`
    BriShift     float32 `json:"bri_shift"`
}
type RhodoneaParams struct {
    Radius        float32 `json:"radius"`
    K             uint32  `json:"k"`
    PetalSpan     float32 `json:"petal_span"`
    WidthProfile  float32 `json:"width_profile"`
    HeightProfile float32 `json:"height_profile"`
    Thickness     float32 `json:"thickness"`
    Curl          float32 `json:"curl"`
    LengthSeg     uint32  `json:"length_seg"`
    WidthSeg      uint32  `json:"width_seg"`
    SatShift      float32 `json:"sat_shift"`
    BriShift      float32 `json:"bri_shift"`
}
type SuperformulaParams struct {
    Scale    float32 `json:"scale"`
    M1       float32 `json:"m1"`
    N1a      float32 `json:"n1a"`
    N2a      float32 `json:"n2a"`
    N3a      float32 `json:"n3a"`
    A1       float32 `json:"a1"`
    B1       float32 `json:"b1"`
    M2       float32 `json:"m2"`
    N1b      float32 `json:"n1b"`
    N2b      float32 `json:"n2b"`
    N3b      float32 `json:"n3b"`
    A2       float32 `json:"a2"`
    B2       float32 `json:"b2"`
    USeg     uint32  `json:"u_seg"`
    VSeg     uint32  `json:"v_seg"`
    SatShift float32 `json:"sat_shift"`
    BriShift float32 `json:"bri_shift"`
}
type Params struct {
    AlgoVersion   string `json:"algo_version"`
    SchemaVersion string `json:"schema_version"`
    Seed          uint64 `json:"seed"`
    // v1 scalars (ALWAYS populated for v1 fallback path toTechniqueParams)
    PetalCount  uint32  `json:"petal_count"`
    PetalLength float32 `json:"petal_length"`
    PetalWidth  float32 `json:"petal_width"`
    Curvature   float32 `json:"curvature"`
    StemHeight  float32 `json:"stem_height"`
    Hue         float32 `json:"hue"`
    // v2 additions
    Family  string       `json:"family,omitempty"`
    Palette *PaletteSpec `json:"palette,omitempty"`
    // exactly one non-nil, selected by Family
    Classic      *ClassicParams      `json:"classic,omitempty"`
    Rose         *RoseParams         `json:"rose,omitempty"`
    Bloom        *BloomParams        `json:"bloom,omitempty"`
    Sunflower    *SunflowerParams    `json:"sunflower,omitempty"`
    Rhodonea     *RhodoneaParams     `json:"rhodonea,omitempty"`
    Superformula *SuperformulaParams `json:"superformula,omitempty"`
}

--- Weighted family selection (stream(seed,"family")) ---
var familyTable = []struct{ name string; w int }{
    {"classic",22},{"rose",18},{"zinnia",11},{"camellia",10},
    {"lotus",9},{"dahlia",9},{"sunflower",8},{"rhodonea",7},{"superformula",6},
} // sum=100; roll := IntRange(1,100); cumulative pick; default "classic".

--- Palette catalog approach (hybrid) ---
// 20-entry curated catalog: each entry = {id string, stops []ColorStop} with
// 3-4 stops, ascending position covering 0..1, stored as r,g,b in [0,1] (sRGB).
// buildPalette(seed):
//   1. base := paletteCatalog[stream(seed,"palette.pick").IntRange(0,len-1)]
//   2. hueShift := stream(seed,"palette.hue_shift").FloatRange(-30,30)
//      satShift := stream(seed,"palette.sat_shift").FloatRange(-0.20,0.20)
//      briShift := stream(seed,"palette.bri_shift").FloatRange(-0.15,0.15)
//   3. For each base stop: convert sRGB->HSB, apply (hueShift deg, satShift frac,
//      briShift frac) with clamping, convert back to sRGB -> BAKED stop.
//      Fill Hex = "#rrggbb" of the baked r,g,b AND the r,g,b floats.
//   4. Return PaletteSpec{ID:base.id, Stops:bakedStops, HueShift, SatShift, BriShift}.
// Catalog ids (curated, high-value): sunset_coral, blush_rose, golden_hour,
//   lavender_mist, crimson_velvet, tangerine_pop, ocean_teal, deep_iris,
//   peach_cream, magenta_dream, honey_amber, mint_frost, cherry_snow, plum_wine,
//   saffron_gold, sky_periwinkle, rose_quartz, emerald_leaf, coral_reef, violet_ember.

--- v1-compat scalars (ALWAYS populated; independent streams) ---
// PetalCount  = legacyPetalCount(seed, family)  // derived to roughly match shape, >=3
// PetalLength = stream(seed,"legacy.plen").FloatRange(0.4,1.6)
// PetalWidth  = stream(seed,"legacy.pwidth").FloatRange(0.15,0.75)
// Curvature   = stream(seed,"legacy.curv").FloatRange(-0.8,0.8)
// StemHeight  = stream(seed,"legacy.stem").FloatRange(0.5,2.5)
// Hue         = math.Mod(stream(seed,"hue").Float64()*360,360)

--- PER-FAMILY RANGE TABLE (draw each field from stream(seed,"<family>.<field>")) ---
CLASSIC:  rows=84(fixed) cols=144(fixed) p_num=IntRange(5,12) f_d=FR(150,230)
  p_len=FR(40,80) p_sharp=FR(0.20,0.55) f_height=FR(260,380) curve1=FR(0.85,1.35)
  curve2=FR(0.15,0.40) b=FR(0.8,1.6) b_num=IntRange(5,9)
ROSE:     opening=FR(2.0,3.2) v_density=FR(7.5,11.0) p_align=FR(2.7,3.6)
  curve1=FR(1.4,2.0) curve2=FR(0.9,1.35)
BLOOM:    scale=FR(240,360) opening=FR(0.75,1.30) density=FR(0.80,1.25)
  petal_freq=FR(0.85,1.20) petal_amp=FR(0.80,1.25) hang_down=FR(0.75,1.35)
  fade=FR(0.85,1.20) theta_step=FR(0.90,1.15) r_step=FR(0.90,1.15)
  sat_shift=FR(-20,20) bri_shift=FR(-15,15)   // bloom shifts are HSB units (see reconciliation #7)
SUNFLOWER: scale=FR(200,380) floret_rings=IntRange(40,150) floret_spokes=IntRange(120,320)
  dome_height=FR(0,90) disc_ratio=FR(0.40,0.78) ray_petals=IntRange(13,55)
  ray_length=FR(0.25,0.75) ray_width=FR(0.40,1.20) seed_packing=FR(0.70,1.40)
  sat_shift=FR(-0.15,0.15) bri_shift=FR(-0.12,0.12)  // fractions, baked into vertex HSB
RHODONEA:  radius=FR(180,340) k=IntRange(2,9) petal_span=FR(0.60,1.00)
  width_profile=FR(0.20,0.70) height_profile=FR(0,120) thickness=FR(0,18)
  curl=FR(0,1) length_seg=IntRange(12,48) width_seg=IntRange(8,32)
  sat_shift=FR(-0.15,0.15) bri_shift=FR(-0.12,0.12)
SUPERFORMULA: scale=FR(200,360) m1=FR(4,12)(kept>=4 for lobes) n1a=FR(0.30,1.20)(>0)
  n2a=FR(0.40,1.80) n3a=FR(0.40,1.80) a1=FR(0.85,1.15) b1=FR(0.85,1.15)
  m2=FR(1,6) n1b=FR(0.60,1.60) n2b=FR(0.60,1.60) n3b=FR(0.60,1.60)
  a2=FR(0.85,1.15) b2=FR(0.85,1.15) u_seg=IntRange(120,340) v_seg=IntRange(80,200)
  sat_shift=FR(-0.15,0.15) bri_shift=FR(-0.12,0.12)

--- GenerateFromName(name) shape ---
// norm := normalizeName(name); seed := seedFromString(norm)
// family := pickFamily(seed); palette := buildPalette(seed)
// p := Params{AlgoVersion, SchemaVersion, Seed, Family, Palette, + v1 scalars}
// switch family { classic->p.Classic=buildClassic(seed); rose->p.Rose=...;
//   zinnia|camellia|lotus|dahlia->p.Bloom=buildBloom(seed);
//   sunflower->p.Sunflower=...; rhodonea->p.Rhodonea=...; superformula->p.Superformula=... }
// return p

## Frontend types + v1/v2 branch (canonical)

CANONICAL TS additions (petal-pixel-studio/src)

--- src/math/palette.ts (NEW) ---
import * as THREE from "three";
export interface PaletteStop {
  pos: number;   // 0..1 (proto ColorStop.position); backend guarantees ascending, first=0 last=1
  hex: string;   // "#rrggbb" (proto ColorStop.hex); already HSB-shift-baked by backend
}
export interface Palette {
  id: string;                 // proto PaletteSpec.id
  stops: PaletteStop[];       // proto PaletteSpec.stops (>=2)
}
/** Sample gradient at t in [0,1]. Clamps t. Linear sRGB lerp via THREE.Color. Returns NEW color. */
export function samplePalette(stops: PaletteStop[], t: number): THREE.Color;
/** Hot-loop variant: writes into target, returns it (avoids per-vertex alloc). */
export function samplePaletteInto(stops: PaletteStop[], t: number, target: THREE.Color): THREE.Color;
// Behavior: clamp t; scan for segment [lo.pos, hi.pos]; if hi.pos===lo.pos return new Color(hi.hex);
//   local=(t-lo.pos)/(hi.pos-lo.pos); return new Color(lo.hex).lerp(new Color(hi.hex), local).

--- src/math/flowerVersion.ts (NEW) ---
import type { FlowerParams } from "@/stores/flowerStore";
export function isV2(p: Pick<FlowerParams,"algoVersion"|"family">): boolean {
  return p.algoVersion === "v2" && p.family != null;   // conjunctive guard
}

--- src/math/flowerTypes.ts additions ---
// FLOWER_TYPES stays ["classic","rose","zinnia","camellia","lotus","dahlia"] (v1, DO NOT reorder).
export const V2_FAMILIES = ["classic","rose","zinnia","camellia","lotus","dahlia",
  "sunflower","rhodonea","superformula"] as const;
export type FlowerFamily = (typeof V2_FAMILIES)[number];

// Per-family v2 param interfaces (names IDENTICAL to proto/Go/math, camelCase of proto snake_case):
export interface SunflowerParams {
  scale: number; floretRings: number; floretSpokes: number; domeHeight: number;
  discRatio: number; rayPetals: number; rayLength: number; rayWidth: number;
  seedPacking: number; satShift: number; briShift: number;
}
export interface RhodoneaParams {
  radius: number; k: number; petalSpan: number; widthProfile: number;
  heightProfile: number; thickness: number; curl: number;
  lengthSeg: number; widthSeg: number; satShift: number; briShift: number;
}
export interface SuperformulaParams {
  scale: number; m1: number; n1a: number; n2a: number; n3a: number; a1: number; b1: number;
  m2: number; n1b: number; n2b: number; n3b: number; a2: number; b2: number;
  uSeg: number; vSeg: number; satShift: number; briShift: number;
}
// Optional palette added to existing shapes (additive, v1 leaves undefined):
export interface BloomParams { /* existing 11 fields unchanged */ palette?: Palette; }
export interface RoseParams  { /* existing 5 fields unchanged  */ palette?: Palette; }
export interface ClassicParams { /* existing 11 fields unchanged */ palette?: Palette; }

--- src/stores/flowerStore.ts FlowerParams additions (all optional; v1 records omit them) ---
export interface FlowerParams {
  // ...all existing fields UNCHANGED...
  family?: FlowerFamily;
  palette?: Palette;
  sunflowerParams?: SunflowerParams;
  rhodoneaParams?: RhodoneaParams;
  superformulaParams?: SuperformulaParams;
  // classicParams/roseParams/bloomParams already exist; reused for the 6 existing v2 families,
  //   with palette threaded onto bloomParams.palette / roseParams.palette / classicParams.palette.
}

--- samplePalette signature (canonical) ---
samplePalette(stops: PaletteStop[], t: number): THREE.Color
samplePaletteInto(stops: PaletteStop[], t: number, target: THREE.Color): THREE.Color

--- V1/V2 BRANCH POINT (single, in Flower3D.tsx geometry useMemo) ---
const geometry = useMemo(() => {
  if (isV2(params)) return buildV2Geometry(params);   // dispatch on params.family
  // v1 arms UNCHANGED:
  if (params.flowerType === "rose")   return createRoseFlowerGeometry(params.roseParams);
  if (isBloomType(params.flowerType)) return createParametricBloomGeometry(params.flowerType, params.bloomParams);
  return createClassicFlowerGeometry(params.classicParams);
}, [params]);
// toV2Params(backend) (peer of toTechniqueParams in flowerGeometry.ts) reads the proto oneof + palette
//   (mapping ColorStop.position->pos, ColorStop.hex->hex) and returns {family, palette, familyParamsSpread}.
//   toTechniqueParams is UNTOUCHED (v1 fallback).
// generateFromWord branches: if backend.algoVersion==="v2" && backend.family -> v2 store path; else EXACTLY today's v1 path.

## Codegen + build/test (Docker)

DOCKERIZED CODEGEN + GO TEST (host has NO Go/buf; Docker 29.4.3 verified). PIN image tags for reproducible zero-diff regen.

=== Codegen (run from repo root; repo path contains a space so all paths quoted) ===
# Go stubs -> flower-backend/gen/go
docker run --rm -v "$PWD":/workspace -w /workspace/flower-backend \
  bufbuild/buf:1.47.2 generate
# TS stubs -> petal-pixel-studio/src/gen
docker run --rm -v "$PWD":/workspace -w /workspace/flower-backend \
  bufbuild/buf:1.47.2 generate --template buf.gen.frontend.yaml
# Working dir MUST be /workspace/flower-backend (buf.yaml, buf.gen.yaml, buf.gen.frontend.yaml live there;
# frontend template out:../petal-pixel-studio/src/gen resolves relative to it -> repo root must be the mount).

=== Deliverable A: tools/docker/buf.sh (NEW, mirrors tools/docker/deploy.sh) ===
#!/usr/bin/env sh
# Regenerate proto stubs (Go + frontend TS) via pinned buf Docker image. Host needs only Docker.
set -eu
BUF_IMAGE="bufbuild/buf:1.47.2"
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
echo "buf.sh: generating Go stubs -> flower-backend/gen/go"
docker run --rm -v "$REPO_ROOT":/workspace -w /workspace/flower-backend "$BUF_IMAGE" generate
echo "buf.sh: generating frontend TS stubs -> petal-pixel-studio/src/gen"
docker run --rm -v "$REPO_ROOT":/workspace -w /workspace/flower-backend "$BUF_IMAGE" generate --template buf.gen.frontend.yaml
echo "buf.sh: done. Review 'git diff' before committing."
# chmod +x tools/docker/buf.sh (LF line endings per repo .gitattributes hardening).

=== Deliverable B: optional compose codegen service (docker-compose.yml, behind profiles:["tools"]) ===
  codegen:
    image: bufbuild/buf:1.47.2
    profiles: ["tools"]
    working_dir: /workspace/flower-backend
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
        set -e
        buf generate
        buf generate --template buf.gen.frontend.yaml
        echo "codegen: Go -> gen/go and TS -> ../petal-pixel-studio/src/gen regenerated"
    volumes:
      - .:/workspace
    restart: "no"
# Invoke: docker compose run --rm codegen   (tools profile keeps it out of default `up`).

=== Go unit tests (mount flower-backend as /src so go.mod is at workdir) ===
docker run --rm -v "$PWD/flower-backend":/src -w /src \
  golang:1.25-alpine go test ./internal/flower/...
# Faster repeat loop with module cache volume:
docker run --rm -v "$PWD/flower-backend":/src -w /src -v petal-gocache:/go/pkg/mod \
  golang:1.25-alpine go test ./internal/flower/...
# Whole suite: ./...   Fresh (defeat test cache): add -count=1.

=== ORDERING (mandatory for implementer subagents) ===
1. Edit proto/flower/v1/service.proto (add fields 10-17, new messages).
2. tools/docker/buf.sh  (regenerate BOTH Go + TS; stale gen/go = compile failure).
3. Implement generator.go v2 + palette.go; docker golang:1.25-alpine go test ./internal/flower/...
4. docker compose up -d --build backend   (backend NOT bind-mounted; needs rebuild to absorb new gen/go + generator).
5. Frontend TS stubs picked up by Vite HMR automatically (bind mount); docker compose up -d --build -V frontend ONLY if package.json changed.

=== Committed stubs stay committed ===
gen/go/flower/v1/{service.pb.go,service_grpc.pb.go} and src/gen/flower/v1/{service_pb.ts,service_connect.ts}
remain git-tracked (backend Dockerfile COPY . . needs gen/go; Vite imports src/gen directly; .dockerignore does NOT exclude gen/). Phase 2 produces a REAL stubs diff (fields 10-17) committed alongside the proto change.

CAVEAT: floating bufbuild/buf latest drifts plugin versions (real, non-comment diff: protoc-gen-go-grpc 1.6.1->1.6.2, protoc-gen-es 2.11.0->2.12.1 with params?:FlowerParams -> |undefined). PIN 1.47.2 so unchanged proto => zero-diff regen.

## File structure

- `flower-backend/proto/flower/v1/service.proto` — add family=10, palette=11, oneof shape{12-17}, and messages ColorStop, PaletteSpec, ClassicParams, RoseParams, BloomParams, SunflowerParams, RhodoneaParams, SuperformulaParams (canonical field sets above)
- `flower-backend/internal/flower/generator.go` — bump AlgoVersion/SchemaVersion to v2; add deriveSeed/stream/FloatRange/IntRange helpers; add v2 structs (or move to params_v2.go); weighted pickFamily; per-family build*(seed) fns; keep splitmix64/seedFromString/normalizeName unchanged; GenerateFromName emits family+palette+oneof+v1 scalars
- `flower-backend/internal/flower/palette.go (NEW)` — 20-entry paletteCatalog ([]paletteDef with r,g,b stops), buildPalette(seed) applying+baking HSB shifts, sRGB<->HSB helpers, hex formatting
- `flower-backend/internal/flower/generator_test.go (NEW)` — determinism (same name -> same family/palette/params), family-weight sanity, per-family range bounds, guard-rails (superformula m1>=4/n1a>0, rhodonea k in [2,9])
- `flower-backend/internal/api/grpc/flower_server.go` — add shared toProtoParams(flower.Params) *flowerv1.FlowerParams mapper (scalars 1-9 + family + palette + oneof); use in CreateFlower and GetFlower
- `flower-backend/internal/api/grpc/store.go` — NO change (jsonb json.Marshal/Unmarshal round-trips new struct fields automatically; no DB migration)
- `petal-pixel-studio/src/math/palette.ts (NEW)` — Palette/PaletteStop types, samplePalette, samplePaletteInto
- `petal-pixel-studio/src/math/flowerVersion.ts (NEW)` — isV2(params) conjunctive guard
- `petal-pixel-studio/src/math/flowerTypes.ts` — add V2_FAMILIES/FlowerFamily; SunflowerParams/RhodoneaParams/SuperformulaParams interfaces; optional palette? on BloomParams/RoseParams/ClassicParams
- `petal-pixel-studio/src/math/flowerGeometry.ts` — add toV2Params(backend) (reads proto oneof+palette, position->pos/hex), buildV2Geometry(params) family dispatch, createClassicFlowerGeometryV2; keep toTechniqueParams/pickFlowerTypeFromSeed UNTOUCHED
- `petal-pixel-studio/src/math/flowers/stitch.ts (NEW)` — shared stitchQuads(grid, positions, indices) with -1 skip + zero-area (|cross|<1e-6) skip
- `petal-pixel-studio/src/math/flowers/sunflower.ts (NEW)` — createSunflowerGeometry(p, palette)
- `petal-pixel-studio/src/math/flowers/rhodonea.ts (NEW)` — createRhodoneaGeometry(p, palette)
- `petal-pixel-studio/src/math/flowers/superformula.ts (NEW)` — createSuperformulaGeometry(p, palette)
- `petal-pixel-studio/src/math/flowers/bloomProfiles.ts` — two-branch color ramps (legacy hsbToThreeColor vs samplePalette when params.palette present)
- `petal-pixel-studio/src/math/flowers/rose.ts` — optional palette branch in rowColor (samplePalette vs legacy hsbToThreeColor(340,100,...))
- `petal-pixel-studio/src/math/supplement.ts` — add superShape(angle,m,n1,n2,n3,a,b) with guards
- `petal-pixel-studio/src/components/flower/Flower3D.tsx` — v1/v2 gate in geometry useMemo (isV2->buildV2Geometry); usesVertexColors=isV2?true:(rose||bloom); family-aware blossomRotation (v2 classic [-PI/2,0,0] else [PI,0,0])
- `petal-pixel-studio/src/stores/flowerStore.ts` — add optional v2 fields to FlowerParams; branch generateFromWord on backend.algoVersion==='v2'&&family (v2 store path via toV2Params, else unchanged v1 path); extend generateAutoTitle typeNames with sunflower/rhodonea/superformula
- `petal-pixel-studio/src/pages/CreateFlower.tsx` — relax handleWordInputChange (stop \s->'' stripping; collapse runs, cap 64); remove single-word rejection; update placeholder to 'Enter a name or phrase...'
- `tools/docker/buf.sh (NEW)` — pinned bufbuild/buf:1.47.2 codegen wrapper (Go + frontend TS), LF, chmod +x
- `docker-compose.yml` — optional codegen service under profiles:['tools'] (bufbuild/buf:1.47.2)
- `flower-backend/gen/go/flower/v1/*.pb.go + petal-pixel-studio/src/gen/flower/v1/service_pb.ts` — REGENERATED via buf, committed with the proto change
- `README.md + flower-backend/README.md` — document Dockerized buf.sh + golang:1.25-alpine go test; note no host Go/buf toolchain; pinned tags => zero-diff regen
- `petal-pixel-studio/src/gen` — NOTE service_connect.ts unchanged (no RPC signature change; only FlowerParams message grows)

## Appendix — New-family 3D math (canonical)

### classic (v2 wrapper)

**Formulas:**
Reuse existing createClassicFlowerGeometry position/index math verbatim; add a color attribute sampled at t = theta/rows (radial 0..1) via samplePalette(palette.stops, t). v1 createClassicFlowerGeometry stays untouched (material.color path).

**Params:** rows, cols, pNum, fD, pLen, pSharp, fHeight, curve1, curve2, b, bNum (+ optional palette). Identical to existing ClassicParams.

**Construction:**
createClassicFlowerGeometryV2(classicParams, palette): run v1 grid loop, but push a color per vertex from samplePalette at radial t. setIndex + computeVertexNormals. Returns BufferGeometry with position+color.

**Degeneracy guards:** rows/cols FIXED 84/144 for mesh grid stability. No degeneracy beyond what v1 classic already handles.


### rose (v2)

**Formulas:**
Reuse existing createRoseFlowerGeometry math verbatim (r=cos-based petalCut, 250*petalCut*radialCore). When roseParams.palette present, rowColor = samplePalette(palette.stops, rowT); else legacy hsbToThreeColor(340,100,-20+rowT*120).

**Params:** opening, vDensity, pAlign, curve1, curve2 (+ optional palette).

**Construction:**
Two-branch color inside the existing rowColor computation. Grid ROSE_COLS=600 x ROSE_ROWS=30 unchanged.

**Degeneracy guards:** petalCut clamped [0.14,1.15]; radialCore max(0,...). Existing behavior preserved.


### bloom / zinnia|camellia|lotus|dahlia (v2)

**Formulas:**
Reuse existing createParametricBloomGeometry + per-type BloomProfile verbatim. Each profile.color(r,params) becomes two-branch: if params.palette present -> samplePalette(palette.stops, r).getRGB(scratch); else legacy hsbToThreeColor(...) ramp. r is the existing radial 0..1.

**Params:** scale, opening, density, petalFreq, petalAmp, hangDown, fade, thetaStep, rStep, satShift, briShift (+ optional palette). NOTE petalFreq stays narrow [0.85,1.20]: profiles multiply theta by large constants (dahlia 4.75) so wide jitter breaks petal closure; thetaStep/rStep near 1.0 preserve tessellation.

**Construction:**
No structural change. profile.color gains the palette branch. satShift/briShift remain the v1 HSB knobs (ignored on the palette arm since v2 bakes shifts into the palette).

**Degeneracy guards:** radialCore<=0 skip and scale<=0 skip already present. thetaStep clamped >=0.1, rStep >=0.005.


### sunflower (NEW)

**Formulas:**
GOLDEN_ANGLE_DEG=137.50776405003785 (=180*(3-sqrt(5)), FIXED constant, not a param). Seed head as polar surface grid u(radial 0..floretRings) x v(spoke 0..floretSpokes): discR=discRatio*scale; t=i/floretRings; radius=discR*sqrt(t); c=seedPacking*discR/sqrt(Nf) with Nf=floretRings*floretSpokes; phGA=deg2rad(GOLDEN_ANGLE); k1=round(sqrt(Nf)); bumpA=0.5*(1+cos(k1*(alpha - t/phGA))); bumpB=0.5*(1+cos((k1+1)*(alpha + t/phGA))); seedBump=0.04*discR*bumpA*bumpB; radius+=0.5*seedBump; zDome=domeHeight*(1-t*t); x=radius*cos(alpha); z=radius*sin(alpha); y=-(zDome+seedBump). Disk color: hue=45-20*(1-t); sat=70+25*t+satShift*100; bri=25+45*t+briShift*100 (satShift/briShift are FRACTIONS -> *100 into HSB units) OR sample palette (see reconciliation #6). Ray petals: rayPetals patches (petalRadialSeg=10 x petalCrossSeg=6), center angle alphaC=2pi*p/rayPetals; half=min((pi/rayPetals)*rayWidth, 0.9*pi/rayPetals); taper=sin(pi*s)^0.6; widthAng=half*taper*w; alpha=alphaC+widthAng; rBase=discRatio*scale; rTip=rBase+rayLength*scale; rad=rBase+(rTip-rBase)*s; lift=0.18*rayLength*scale*sin(pi*s); x=rad*cos(alpha); z=rad*sin(alpha); y=-(domeHeight*0.15+lift). Ray color: hue=48-6*s; sat=90; bri=70+20*s (or palette sample at s).

**Params:** scale, floretRings, floretSpokes, domeHeight, discRatio, rayPetals, rayLength, rayWidth, seedPacking, satShift, briShift. satShift/briShift are FRACTIONS baked into vertex color.

**Construction:**
createSunflowerGeometry(p: SunflowerParams, palette: Palette): build seed-head grid then rayPetals patches into one BufferGeometry (positions+colors+indices), shared stitchQuads with zero-area skip. Seam closure: grid[i][spokes]=grid[i][0]. setIndex + computeVertexNormals.

**Degeneracy guards:** Vertex cap MAX=130000: est=(rings+1)*(spokes+1)+rayPetals*11*7; if est>MAX shrink=sqrt(MAX/est), rings=max(40,round(rings*shrink)), spokes=max(120,round(spokes*shrink)). rayPetals>=3. Nf>0 (counts floored >0). half<=0.9*pi/rayPetals prevents overlap. Number.isFinite on x/y/z -> grid=-1 skip. Shared zero-area triangle skip (|cross(e1,e2)|<1e-6) handles ray-tip collapse.


### rhodonea (NEW)

**Formulas:**
P=(k%2===1)?k:2*k. Petal p rotated by betaP=2pi*p/P. u in [0,1] length base->tip, v in [-1,1] cross. phiMax=(pi/(2*k))*petalSpan; rC=radius*u; angHalf=phiMax*sin(pi*u)^0.5; localAng=angHalf*v*widthProfile/0.42; phi=betaP+localAng; rEdge=rC; x0=rEdge*cos(phi); z0=rEdge*sin(phi); arch=heightProfile*sin(pi*u); curlDown=curl*heightProfile*u^3; y0=-(arch-curlDown); yShell=thickness*(1-v*v)*(1-u); x=x0; z=z0; y=y0-yShell. Color: hue=340-6*p; sat=85-15*u+satShift*100; bri=30+55*u+briShift*100 (fractions->HSB units) OR palette sample at u (or |rEdge|/radius).

**Params:** radius, k(integer), petalSpan, widthProfile, heightProfile, thickness, curl, lengthSeg, widthSeg, satShift, briShift.

**Construction:**
createRhodoneaGeometry(rp: RhodoneaParams, palette: Palette): loop p in 0..P-1, per-petal grid (lengthSeg+1)x(widthSeg+1), push positions+colors, shared stitchQuads with zero-area skip. computeVertexNormals.

**Degeneracy guards:** k coerced integer [2,9] -> pi/(2k) finite/nonzero. Vertex cap: est=P*(lengthSeg+1)*(widthSeg+1); if>130000 shrink both seg counts (min 12/8). angHalf uses sin(pi*u)^0.5 (base row collapses -> zero-area skip catches it). petalSpan<1 keeps center gap. All exponents on u in [0,1] -> real. Number.isFinite guard on x/y/z.


### superformula (NEW)

**Formulas:**
superShape(angle,m,n1,n2,n3,a,b): n1=max(1e-3,n1); a=max(1e-3,|a|); b=max(1e-3,|b|); t=m*angle/4; t1=|cos(t)/a|; t2=|sin(t)/b|; inner=t1^n2+t2^n3; if inner<=1e-9 or !isFinite(inner) return 0; r=inner^(-1/n1); if !isFinite(r) return 0; return r. Surface grid i in 0..uSeg, j in 0..vSeg: theta=-pi+2pi*i/uSeg; phi=-pi/2+pi*j/vSeg; r1=superShape(theta,m1,n1a,n2a,n3a,a1,b1); r2=superShape(phi,m2,n1b,n2b,n3b,a2,b2); X=r1*cos(theta)*r2*cos(phi); Y=r1*sin(theta)*r2*cos(phi); Z=r2*sin(phi); scene remap: x=scale*X; z=scale*Y; y=-scale*Z. Color: tLat=(phi+pi/2)/pi; lobe=0.5*(1+cos(m1*theta)); hue from palette base (or 300+40*tLat placeholder); sat=70+25*lobe+satShift*100; bri=35+50*tLat+briShift*100 OR palette sample at tLat.

**Params:** scale, m1, n1a, n2a, n3a, a1, b1, m2, n1b, n2b, n3b, a2, b2, uSeg, vSeg, satShift, briShift.

**Construction:**
createSuperformulaGeometry(sp: SuperformulaParams, palette: Palette): single grid (uSeg+1)x(vSeg+1); longitude seam weld grid[uSeg][j]=grid[0][j]; shared stitchQuads with zero-area skip (poles j=0/vSeg collapse -> skipped). computeVertexNormals. Add superShape to supplement.ts.

**Degeneracy guards:** 0^(negative)->Infinity guarded by inner<=1e-9 -> return 0 (collapses vertex to origin, quads skipped). n1,a,b clamped >=1e-3. Math.abs inside superShape keeps fractional powers real. Poles collapse via zero-area skip. Vertex cap: est=(uSeg+1)*(vSeg+1); if>130000 shrink (min 120/80). Number.isFinite final catch.


---

# Tasks

_(Task sections follow — each is bite-sized TDD; interfaces reference the canonical contract above.)_

## Dependencies & sequencing

Recommended task order (dependency-correct). Layer 1 (foundation): proto-codegen FIRST — it edits service.proto and regenerates+commits both Go and TS stubs; every task that imports generated flowerv1.* v2 types or the grown TS BackendFlowerParams depends on it. Layer 2 (Go core, pure-Go, no generated imports): go-generator then go-palette — but note these two are MUTUALLY DEPENDENT (generator.GenerateFromName calls palette.buildPalette; palette consumes generator's deriveSeed/stream/FloatRange/IntRange + ColorStop/PaletteSpec). Land them as a pair, or split the shared struct/helper layer first; ColorStop/PaletteSpec and clamp01/max3/min3/to255/hexOf/stop are declared ONLY in palette.go. Layer 3 (Go mapper): go-mapper AFTER both proto-codegen (needs flowerv1.FlowerParams_* + new messages) and go-generator+go-palette (needs flower.Params v2 fields); correct its superformula Go field literals to N1a/N2a/N3a/N1b/N2b/N3b (not N1A/N1B) and verify all names against the committed stub. Layer 4 (frontend foundation): fe-palette-types (palette.ts + flowerVersion.ts + flowerTypes additions) — must either (a) widen the store's FlowerParams with the 5 optional v2 fields itself, or (b) use the inline-arg fallback for isV2 so tsc passes before the store widening lands. Layer 5 (frontend family builders, all depend on fe-palette-types for palette.ts + interfaces, and on stitch.ts): unify stitchQuads FIRST — assign stitch.ts to a SINGLE owner (recommend fe-v2-wiring) with canonical signature stitchQuads(grid, positions, indices); then fe-sunflower, fe-rhodonea, fe-superformula (each fixed to call that exact arg order and to sample palette WITHOUT re-applying per-shape shifts on the palette arm, matching fe-rhodonea and reconciliation #8). fe-superformula also appends superShape to supplement.ts. Layer 6: fe-palette-color (bloomProfiles + rose palette branches) depends on fe-palette-types (palette.ts + palette? on Bloom/RoseParams). Layer 7 (frontend wiring): fe-v2-wiring (creates stitch.ts + toV2Params/buildV2Geometry/createClassicFlowerGeometryV2) depends on fe-palette-types + the 3 family builders (its dispatch test exercises all 6 families) — so its final verification must run AFTER sunflower/rhodonea/superformula land even though it may be authored earlier; and it must import bumpiness/vShape from supplement (both verified present). Layer 8 (leaf integration): fe-integrate depends on fe-v2-wiring (toV2Params/buildV2Geometry), fe-palette-types (isV2/V2_FAMILIES/FlowerFamily/Palette), and owns/finishes the store FlowerParams widening + generateFromWord branch + Flower3D gate + CreateFlower input relax; must add the FLOWER_TYPES import explicitly. Layer 9: docs LAST (documents buf.sh/codegen service/go-test commands; only smoke-checkable once proto-codegen created tools/docker/buf.sh + the compose codegen service). Single most important pre-implementation fix: resolve the stitchQuads (grid, positions, indices) vs (grid, indices, positions) split and its double file-ownership — because both mis-ordered args are number[], the swap is invisible to TypeScript and will silently produce broken geometry.

## Binding consistency resolutions (apply during execution)

These are cross-task conflicts the plan review found; the resolutions below govern:

1. **fe-sunflower / fe-superformula / fe-v2-wiring / fe-rhodonea** — CRITICAL signature drift on the shared stitchQuads. The tasks disagree on the argument ORDER, and there are TWO different creators of src/math/flowers/stitch.ts. fe-v2-wiring creates stitch.ts with signature stitchQuads(indexGrid: number[][], positions: number[], indices: number[]) — order (grid, positions, indices) — and its own test asserts indices output. fe-rhodonea consumes it as stitchQuads(grid, positions, indices) — MATCHES fe-v2-wiring. BUT fe-sunflower ALSO ships a full stitch.ts snippet with signature stitchQuads(grid: number[][], indices: number[], positions: number[]) — order (grid, indices, positions) — and calls it that way; fe-superformula also calls stitchQuads(grid, indices, positions). So the 2nd and 3rd positional args (positions vs indices, both number[]) are swapped between the two camps. Because both are number[], TypeScript will NOT catch the swap at compile time — it will silently produce wrong geometry (indices array treated as positions when computing the |cross|<1e-6 zero-area test, and quad indices pushed into the positions buffer). Two tasks (fe-v2-wiring and fe-sunflower) also both create the same file, so whichever lands second either overwrites or conflicts. **Fix:** Pick ONE canonical signature and make every task match. The plan's own File-structure line 561 says 'stitchQuads(grid, positions, indices)', so adopt stitchQuads(grid: number[][], positions: number[], indices: number[]) as canonical (matches fe-v2-wiring + fe-rhodonea + the contract). Actions: (1) Assign stitch.ts creation to exactly ONE task — fe-v2-wiring (it also has the dedicated stitch.test.ts). (2) fe-sunflower and fe-superformula: DELETE their inline stitch.ts snippets and change every call from stitchQuads(grid, indices, positions) to stitchQuads(grid, positions, indices); drop stitch.ts from their git add. (3) fe-sunflower's fallback 'if stitch.ts not landed create it' snippet must be removed or rewritten to the canonical (grid, positions, indices) order to avoid clobbering the real file.
2. **fe-v2-wiring** — stitchQuads test fixture and creator disagree with the sunflower/superformula grid layout convention, which will make the shared stitcher produce zero triangles for those families even after the arg-order fix is applied. fe-v2-wiring's stitchQuads iterates rows then columns and, for cell (i,j), reads a=row[j], b=next[j], c=next[j+1], d=row[j+1] and emits triangles (a,b,c),(a,c,d). fe-sunflower/fe-superformula build grid[i][j] with the SAME (a=grid[ri][ti], b=grid[ri+1][ti], c=grid[ri+1][ti+1], d=grid[ri][ti+1]) convention and rely on the -1 skip. This part is consistent. The real risk is only the arg order (issue above); the winding/skip logic matches. Verify after unifying that the fe-v2-wiring dispatch test's 6 family cases (which call the REAL sunflower/rhodonea/superformula builders) still pass, since those builders will import the unified stitch.ts. **Fix:** After unifying the stitchQuads signature, re-run fe-v2-wiring's flowerGeometry.v2.test.ts (its buildV2Geometry dispatch block builds all 6 v2 families via the real family builders) as an integration gate. If any family yields an empty index buffer, the arg order or grid winding is still mismatched. No code change beyond issue #1 expected, but this test must be run AFTER sunflower/rhodonea/superformula land, so sequence fe-v2-wiring's Step 4 verification (or a re-run) after the three family tasks.
3. **fe-palette-types / fe-integrate** — Ownership drift for the store's FlowerParams.family? field. fe-palette-types' isV2 is typed as Pick<FlowerParams,'algoVersion'|'family'> and imports FlowerParams from @/stores/flowerStore, but the store's FlowerParams does NOT yet have family (verified: flowerStore.ts lines 18-43 have no family/palette/sunflowerParams). fe-palette-types explicitly notes this and says the field is added by 'the flowerStore task'. fe-integrate is that task and DOES add family?/palette?/sunflowerParams?/rhodoneaParams?/superformulaParams?. So if fe-palette-types lands before fe-integrate, its 'tsc --noEmit' clean-pass step will FAIL because Pick<FlowerParams,'family'> references a non-existent key. **Fix:** Sequence fe-integrate (store FlowerParams widening) BEFORE fe-palette-types, OR have fe-palette-types use its documented fallback: type isV2's arg inline as { algoVersion: string; family?: string | null } instead of Pick<FlowerParams,...> until the store lands. Recommended: since fe-palette-types is a foundational types task that many others depend on, keep it early but ship it with the inline-arg fallback, then let fe-integrate widen FlowerParams; OR add the 5 optional v2 fields to the store's FlowerParams as part of fe-palette-types (smallest, safest) and have fe-integrate only add the generateFromWord branch + Flower3D gate. Pick one owner for the store-interface widening and state it explicitly.
4. **fe-integrate** — Missing import will break compile: the v2 branch of generateFromWord references FLOWER_TYPES (in the guard '(FLOWER_TYPES as readonly string[]).includes(v2.family)') but flowerStore.ts currently imports only BLOOM_TYPES, DEFAULT_* and types from @/math/flowerTypes — FLOWER_TYPES is NOT imported (verified lines 4-13). The task body mentions 'Add the FLOWER_TYPES import' in prose (3c) but it is easy to miss and not shown in the edited import block (3a only adds FlowerFamily/Sunflower/Rhodonea/Superformula/Palette/toV2Params). **Fix:** In fe-integrate step 3a, add FLOWER_TYPES to the @/math/flowerTypes import list explicitly (alongside BLOOM_TYPES). Show it in the concrete import diff, not just prose, so the implementer does not omit it.
5. **go-mapper** — Unverified generated Go field-name assumptions for superformula could break the build. The mapper hardcodes flowerv1.SuperformulaParams field names N1A/N2A/N3A/N1B/N2B/N3B (proto n1a/n2a/n3a/n1b/n2b/n3b). protoc-gen-go's initialism/segment handling for names like 'n1a' is NOT guaranteed to be N1A — it may emit N1A, N1A, or N1a depending on how the underscore-free 'n1a' token is cased (proto field n1a has no underscores, so Go camelCase is 'N1a', NOT 'N1A'). The Go generator task (go-generator) itself declares the pure-Go struct fields as N1a/N2a/N3a/N1b/N2b/N3b (lowercase a/b), which strongly implies the generated proto Go names are ALSO N1a/N2a/etc. — meaning the mapper's N1A/N1B literals are likely WRONG. **Fix:** go-mapper already includes a NOTE to verify names against the committed gen/go/flower/v1/service.pb.go after codegen — good — but the default literals should be corrected to the most-likely-correct N1a/N2a/N3a/N1b/N2b/N3b (matching the pure-Go struct field casing in go-generator) rather than N1A/N1B, so the first compile is more likely to pass. Keep the 'source of truth is the generated stub' reconciliation note. Same caution applies to FD/PNum/PLen/PSharp/FHeight/BNum/Id/RStep/VDensity/PAlign but those follow standard underscore->camel rules and are lower risk.
6. **fe-sunflower** — Sunflower color logic diverges from the canonical contract's reconciliation #6/#8 and from the sibling families, creating cross-task inconsistency in how per-shape sat_shift/bri_shift are applied. Contract reconciliation #7/#8 and the sunflower Appendix (line 621) say new-family shifts are FRACTIONS multiplied by 100 into hsbToThreeColor's 0-100 scale, applied ON TOP of the palette base. fe-sunflower instead samples the palette then does scratch.getHSL() and adds satShift/briShift as RAW fractions directly into HSL s/l (clamp(hsl.s + satShift)) — i.e. it treats the fraction as a 0..1 delta, NOT as *100 HSB units. fe-superformula does the SAME (adds satShift/briShift as raw fractions to getHSL s/l on the palette arm, but uses satShift*100 only on the fallback arm). fe-rhodonea, by contrast, converts satShift*100 to HSB units and only applies shifts on the FALLBACK (HSB ramp) arm, sampling the palette WITHOUT any shift when a palette is present. So the three new families apply the per-shape shift THREE different ways. **Fix:** Unify the palette-arm shift convention across sunflower/rhodonea/superformula. Simplest and most contract-faithful (reconciliation #8: 'per-shape sat_shift/bri_shift apply a small additional HSB nudge on top'): on the palette arm, either (a) apply NO per-shape shift because the backend already baked hue/sat/bri into the palette (matches fe-rhodonea's behavior and fe-palette-color's bloom/rose decision at reconciliation #8 to IGNORE shifts on the palette arm), or (b) apply shift consistently as getHSL + (satShift) [raw fraction] in all three. Pick ONE. Given fe-palette-color explicitly ignores satShift/briShift on the palette arm for bloom/rose, the consistent choice is (a): new-family builders sample the palette for base color and do NOT re-apply per-shape shifts on the palette arm; keep satShift*100 only on the palette-absent fallback ramp. Update fe-sunflower and fe-superformula to match fe-rhodonea.
7. **go-generator / go-palette** — Duplicate-declaration risk for shared helpers between the two Go tasks in the same package. go-palette introduces package-level helpers clamp01, max3, min3, to255, stop, hexOf in palette.go. go-generator does not declare these, but both tasks note the risk and go-palette explicitly warns 'if generator.go v2 also introduces clamp01/max3/min3, de-duplicate at integration'. Additionally, both tasks reference ColorStop/PaletteSpec: go-palette's Interfaces list declares them as consumed-from-generator, while go-generator's Interfaces list says ColorStop/PaletteSpec 'belong to the palette task's palette.go; this task references but does not declare them.' This is consistent (palette.go owns them) but the two tasks state the ownership in mirror-image language that could confuse an implementer into declaring them twice. **Fix:** State unambiguously in both tasks: ColorStop and PaletteSpec structs are DECLARED ONLY in palette.go (go-palette owns them); generator.go references them without redeclaring. clamp01/max3/min3/to255/hexOf/stop are DECLARED ONLY in palette.go. generator.go must not introduce its own clamp01/max3/min3. Since go-generator is a stated dependency of go-palette (palette.go consumes deriveSeed/stream/FloatRange/IntRange), land go-generator FIRST, then go-palette adds palette.go with the shared helpers — no dedup needed as long as generator.go avoids declaring them.
8. **go-generator** — Circular/ordering tension between go-generator and go-palette. go-generator's GenerateFromName calls buildPalette(seed) (defined in palette.go) and references PaletteSpec/ColorStop (defined in palette.go), so go-generator cannot compile without palette.go. But go-palette's buildPalette consumes deriveSeed/stream/FloatRange/IntRange/(the v1 splitmix helpers) which are defined in go-generator. Each task's Step 2 'expect FAIL' and Step 4 'expect PASS' assume the OTHER task's symbols exist. Neither can independently reach a green package. **Fix:** These two tasks are mutually dependent and must be treated as a landing PAIR, or split so the shared type/helper layer lands first. Cleanest: land go-generator's helper+struct additions (deriveSeed/stream/FloatRange/IntRange + the v2 Params/per-family structs, but NOT the buildPalette call) first with a temporary buildPalette stub OR, better, reorder so go-palette's sRGB/HSB/catalog + the ColorStop/PaletteSpec structs land as their own commit, then go-generator (helpers + GenerateFromName wiring). go-generator already documents a buildPalette stub fallback in Step 2 — make that explicit in the recommended order, or land both in a single combined verification so 'go test ./internal/flower/...' is only expected green once both files exist.
9. **proto-codegen** — Downstream Go/TS tasks import generated symbols that only exist AFTER proto-codegen runs, but several tasks' 'expect FAIL' steps assume the generated types already exist (or will surface as import errors). This is an ordering constraint, not a naming bug: go-mapper imports flowerv1.FlowerParams_Classic..._Superformula and flowerv1.{ColorStop,PaletteSpec,ClassicParams,...}; fe-v2-wiring/fe-integrate import the grown FlowerParams (family, palette, shape oneof) from @/gen/flower/v1/service_pb. None of these generated symbols exist until proto-codegen edits the proto AND regenerates+commits both stub sets. **Fix:** Enforce proto-codegen as the FIRST task (it is the FOUNDATION, matches plan ORDERING line 537-538). Every Go task that imports flowerv1.* v2 types (go-mapper) and every frontend task that imports the grown BackendFlowerParams oneof/palette (fe-v2-wiring, fe-integrate) must be sequenced strictly after proto-codegen. go-palette and go-generator do NOT import generated proto types (they use pure-Go structs), so they can land right after proto-codegen without needing the regen — but proto-codegen must still precede go-mapper which maps pure-Go -> flowerv1.*.
10. **fe-palette-color** — Return-type shape assumption is fine but the two-branch color for bloom must return the SAME shape on both arms. Legacy arm returns hsbToThreeColor(...) which is a THREE.Color; palette arm returns samplePalette(...) which is also a THREE.Color. BloomProfile.color is typed as returning { r: number; g: number; b: number } (verified bloomProfiles.ts line 15). THREE.Color satisfies that structurally, so this is consistent. No fix needed — flagged only to confirm cross-task type compatibility between fe-palette-types (samplePalette: THREE.Color) and the existing BloomProfile.color contract holds. **Fix:** No change required; consistent. (Included for completeness: samplePalette's THREE.Color return is assignable to the {r,g,b} return type of BloomProfile.color, and rose.ts reads rowColor.r/g/b which THREE.Color provides.)
11. **fe-integrate / fe-v2-wiring** — toV2Params return-shape naming must match between producer (fe-v2-wiring) and consumer (fe-integrate). fe-v2-wiring's toV2Params returns { family, palette, classicParams?, roseParams?, bloomParams?, sunflowerParams?, rhodoneaParams?, superformulaParams? } (V2Params interface). fe-integrate reads exactly v2.family, v2.palette, v2.classicParams, v2.roseParams, v2.bloomParams, v2.sunflowerParams, v2.rhodoneaParams, v2.superformulaParams. These MATCH. Also both agree the proto oneof discriminant cases are classic/rose/bloom/sunflower/rhodonea/superformula and palette maps position->pos. Consistent. The only caveat both tasks correctly flag: the exact connect-es discriminated-union case labels must be confirmed against the regenerated service_pb.ts. **Fix:** No naming change required — producer/consumer field names align. Keep both tasks' shared caveat: after proto-codegen regenerates service_pb.ts, confirm the oneof 'shape' union case strings are literally 'classic'|'rose'|'bloom'|'sunflower'|'rhodonea'|'superformula' and adjust the switch labels in toV2Params if buf emits different discriminants. Sequence fe-v2-wiring before fe-integrate (fe-integrate imports toV2Params/buildV2Geometry from it).

**Additional locked resolutions:**
- **stitch.ts single owner:** `src/math/flowers/stitch.ts` is created in Task 5 (with `palette.ts`), NOT in the v2-wiring task. Canonical signature: `stitchQuads(indexGrid: number[][], indices: number[]): void` (row-major grid, skip cells `< 0`, skip zero-area triangles `|cross| < 1e-6`). Tasks 6-9 import it; the wiring task does not redefine it.
- **Shared Go PRNG helpers single owner:** `deriveSeed/stream/FloatRange/IntRange` live in `generator.go`; `ColorStop/PaletteSpec` Go structs + `clamp01/max3/min3/to255/hexOf` live in `palette.go`. `palette.go` imports the PRNG helpers; `generator.go` calls `buildPalette`. No duplicate declarations, no import cycle (same package).
- **Generated field names:** the Go mapper task MUST read the actual regenerated `flowerv1.*Params` field names (from Task 1's committed stubs) before writing `toProtoParams` — do not assume `N1A/N2A/...`; use whatever protoc-gen-go produced from the canonical proto field names.

---

# Tasks

### Task 1: Proto v2 contract + Dockerized codegen (FOUNDATION)

**Files:**
- Modify: `flower-backend/proto/flower/v1/service.proto` (append fields 10, 11, oneof shape 12-17 inside `message FlowerParams` after field 9 `hue` at line 33; add 8 new top-level messages after `FlowerParams` closes at line 34)
- Create: `tools/docker/buf.sh` (mirrors existing `tools/docker/deploy.sh`)
- Modify: `docker-compose.yml` (add `codegen` service under `profiles: ["tools"]`; volumes block ends at line 6, services block ends at line 130)
- Regenerate (committed): `flower-backend/gen/go/flower/v1/service.pb.go`, `petal-pixel-studio/src/gen/flower/v1/service_pb.ts` (note: `service_grpc.pb.go` and `service_connect.ts` will NOT change — no RPC signature change, only the `FlowerParams` message grows)
- Test: MANUAL VERIFICATION (infra/codegen task — verified via `buf lint`, `go build ./...`, `npx tsc --noEmit`; no unit test file)

**Interfaces:**
- Consumes (from canonical contract "Canonical proto contract" + "Codegen + build/test (Docker)"):
  - Existing `message FlowerParams` fields 1-9 UNCHANGED: `algo_version=1, schema_version=2, seed=3, petal_count=4, petal_length=5, petal_width=6, curvature=7, stem_height=8, hue=9`
  - `package flower.v1`; `option go_package = "flower-backend/gen/go/flower/v1;flowerv1"`
  - buf configs (unchanged): `buf.gen.yaml` (`out: gen/go`, remote go + grpc/go), `buf.gen.frontend.yaml` (`out: ../petal-pixel-studio/src/gen`, remote bufbuild/es + connectrpc/es)
  - Pinned image `bufbuild/buf:1.47.2` (currently committed stubs were made with protoc-gen-go v1.36.11 / protoc-gen-es v2.11.0; pin prevents `latest` plugin drift)
- Produces (relied on by ALL later Go + frontend v2 tasks):
  - Proto: `FlowerParams.family` (10), `FlowerParams.palette` (11), `oneof shape { ClassicParams classic=12; RoseParams rose=13; BloomParams bloom=14; SunflowerParams sunflower=15; RhodoneaParams rhodonea=16; SuperformulaParams superformula=17; }`; messages `ColorStop, PaletteSpec, ClassicParams, RoseParams, BloomParams, SunflowerParams, RhodoneaParams, SuperformulaParams`
  - Go stubs: `flowerv1.FlowerParams{ Family string; Palette *PaletteSpec; Shape isFlowerParams_Shape }`, oneof wrapper case types `FlowerParams_Classic`..`FlowerParams_Superformula`, message structs `flowerv1.{ColorStop,PaletteSpec,ClassicParams,RoseParams,BloomParams,SunflowerParams,RhodoneaParams,SuperformulaParams}` — consumed by `flower_server.go` `toProtoParams` (later task)
  - TS stubs: `service_pb.ts` `FlowerParams` gains `family: string`, `palette?: PaletteSpec`, `shape: { case: "classic"|"rose"|"bloom"|"sunflower"|"rhodonea"|"superformula"; value: ... } | { case: undefined }` — consumed by `toV2Params` (later task)
  - `tools/docker/buf.sh` — reusable regen wrapper for later tasks that touch the proto
  - `docker compose run --rm codegen` — reusable one-shot regen

- [ ] **Step 1: MANUAL VERIFICATION baseline — capture pre-change lint pass + record that stubs are byte-stable under the pinned image**

  Confirm the proto currently lints and that regen with the pinned `bufbuild/buf:1.47.2` produces a ZERO diff on the *unchanged* proto (proves the pin matches committed stubs before we intentionally change them). Run from repo root (path contains a space → quote `"$PWD"`):

  ```sh
  # (a) lint current proto
  docker run --rm -v "$PWD":/workspace -w /workspace/flower-backend \
    bufbuild/buf:1.47.2 lint
  # EXPECT: no output, exit 0

  # (b) regen unchanged proto, expect zero git diff (pin verification)
  docker run --rm -v "$PWD":/workspace -w /workspace/flower-backend \
    bufbuild/buf:1.47.2 generate
  docker run --rm -v "$PWD":/workspace -w /workspace/flower-backend \
    bufbuild/buf:1.47.2 generate --template buf.gen.frontend.yaml
  git status --porcelain flower-backend/gen petal-pixel-studio/src/gen
  ```

  EXPECT (b): `git status --porcelain` prints NOTHING (clean). If it prints changes, the committed stubs were made with a different plugin version — STOP and reconcile the pin before proceeding (the caveat in the canonical contract: floating `latest` drifts protoc-gen-go-grpc 1.6.1→1.6.2, protoc-gen-es 2.11.0→2.12.1). Restore any spurious diff with `git checkout -- flower-backend/gen petal-pixel-studio/src/gen`.

- [ ] **Step 2: Run baseline, expect PASS (lint clean, zero stub diff)**

  Run the Step 1 commands. EXPECTED: `lint` exits 0 with no output; `git status --porcelain flower-backend/gen petal-pixel-studio/src/gen` is empty. This is the "FAIL-then-PASS" pivot for an infra task: the "failing" state we are about to create is the intentional non-zero stub diff in Step 4 (fields 10-17), which does NOT exist yet.

- [ ] **Step 3: Implement — (a) proto edit, (b) buf.sh, (c) compose service, (d) regenerate**

  **(a)** Edit `flower-backend/proto/flower/v1/service.proto`. Change the closing of `message FlowerParams` — replace lines 33-34:

  ```proto
  float hue = 9;
  }
  ```

  with the appended v2 block (fields 10, 11, oneof 12-17):

  ```proto
  float hue = 9;

    // v2 render contract. Populated only when algo_version == "v2".
    // v1 clients ignore these; v2 clients render directly from them.
    // Family selector. One of: "classic" | "rose" | "zinnia" | "camellia"
    //   | "lotus" | "dahlia" | "sunflower" | "rhodonea" | "superformula".
    string family = 10;

    // Render-ready palette. hue_shift/sat_shift/bri_shift are ALREADY BAKED
    // into `stops` by the Go backend; echoed here only for provenance.
    PaletteSpec palette = 11;

    // Per-family geometry parameters. Exactly one is set, matching `family`.
    oneof shape {
      ClassicParams      classic      = 12;
      RoseParams         rose         = 13;
      BloomParams        bloom        = 14;  // zinnia | camellia | lotus | dahlia
      SunflowerParams    sunflower    = 15;
      RhodoneaParams     rhodonea     = 16;
      SuperformulaParams superformula = 17;
    }
  }

  // A single gradient control point. Canonical wire form carries BOTH an sRGB
  // hex string (what TS samplePalette consumes) AND normalized r,g,b in [0,1].
  // position in [0,1]. Backend fills all four; consistent (hex == #RRGGBB of
  // round(r*255),round(g*255),round(b*255)).
  message ColorStop {
    float  position = 1;   // TS field: pos
    string hex      = 2;   // "#rrggbb", lowercase; TS samplePalette uses this
    float  r        = 3;   // [0,1]
    float  g        = 4;   // [0,1]
    float  b        = 5;   // [0,1]
  }

  // A named gradient. `stops` already have name-derived HSB shifts BAKED IN.
  message PaletteSpec {
    string             id        = 1;   // catalog id, e.g. "sunset_coral"
    repeated ColorStop stops     = 2;   // >= 2, ascending position, first=0 last=1
    float              hue_shift = 3;   // degrees, [-30,30]  (provenance)
    float              sat_shift = 4;   // fraction, [-0.20,0.20] (provenance)
    float              bri_shift = 5;   // fraction, [-0.15,0.15] (provenance)
  }

  // Mirrors frontend ClassicParams (flowerTypes.ts). rows/cols fixed 84/144.
  message ClassicParams {
    uint32 rows     = 1;
    uint32 cols     = 2;
    uint32 p_num    = 3;
    float  f_d      = 4;
    float  p_len    = 5;
    float  p_sharp  = 6;
    float  f_height = 7;
    float  curve1   = 8;
    float  curve2   = 9;
    float  b        = 10;
    uint32 b_num    = 11;
  }

  // Mirrors frontend RoseParams.
  message RoseParams {
    float opening   = 1;
    float v_density = 2;
    float p_align   = 3;
    float curve1    = 4;
    float curve2    = 5;
  }

  // Mirrors frontend BloomParams (zinnia/camellia/lotus/dahlia).
  message BloomParams {
    float scale      = 1;
    float opening    = 2;
    float density    = 3;
    float petal_freq = 4;
    float petal_amp  = 5;
    float hang_down  = 6;
    float fade       = 7;
    float theta_step = 8;
    float r_step     = 9;
    float sat_shift  = 10;
    float bri_shift  = 11;
  }

  // NEW. Phyllotaxis domed seed-head + ray-petal rim.
  // golden angle is a fixed math constant, NOT a param.
  message SunflowerParams {
    float  scale         = 1;   // master size (200..380)
    uint32 floret_rings  = 2;   // radial resolution of seed head (40..150)
    uint32 floret_spokes = 3;   // angular resolution of seed head (120..320)
    float  dome_height   = 4;   // z-dome amplitude (0..90)
    float  disc_ratio    = 5;   // seed-head radius / total (0.40..0.78)
    uint32 ray_petals    = 6;   // visible ray-petal count (13..55)
    float  ray_length    = 7;   // petal length as fraction of scale (0.25..0.75)
    float  ray_width     = 8;   // angular half-width factor (0.40..1.20)
    float  seed_packing  = 9;   // spiral tightness multiplier (0.70..1.40)
    float  sat_shift     = 10;  // fraction, baked into vertex color
    float  bri_shift     = 11;  // fraction, baked into vertex color
  }

  // NEW. Rose (rhodonea) r=cos(k*theta), per-petal lofted surface.
  message RhodoneaParams {
    float  radius         = 1;   // petal length scale (180..340)
    uint32 k              = 2;   // integer rose frequency (2..9); odd->k petals, even->2k
    float  petal_span     = 3;   // fraction of natural half-window (0.60..1.00)
    float  width_profile  = 4;   // max half-width / length (0.20..0.70)
    float  height_profile = 5;   // vertical arch amplitude (0..120)
    float  thickness      = 6;   // central bulge shell offset (0..18)
    float  curl           = 7;   // tip curl-down (0..1)
    uint32 length_seg     = 8;   // radial resolution per petal (12..48)
    uint32 width_seg      = 9;   // cross resolution per petal (8..32)
    float  sat_shift      = 10;
    float  bri_shift      = 11;
  }

  // NEW. Gielis 3D via spherical product of two superformulas.
  message SuperformulaParams {
    float  scale  = 1;   // master size (200..360)
    // longitude superformula (theta) -> petal/lobe count around equator
    float  m1     = 2;   // (2..16)
    float  n1a    = 3;   // n1 of longitude (>0, 0.30..3)
    float  n2a    = 4;   // (0.30..6)
    float  n3a    = 5;   // (0.30..6)
    float  a1     = 6;   // (>0, 0.60..1.60)
    float  b1     = 7;   // (>0, 0.60..1.60)
    // latitude superformula (phi) -> vertical bell/dome/pinch
    float  m2     = 8;   // (0..16; 0 -> smooth revolution)
    float  n1b    = 9;   // (>0, 0.30..3)
    float  n2b    = 10;  // (0.30..6)
    float  n3b    = 11;  // (0.30..6)
    float  a2     = 12;  // (0.60..1.60)
    float  b2     = 13;  // (0.60..1.60)
    uint32 u_seg  = 14;  // longitude resolution (120..340)
    uint32 v_seg  = 15;  // latitude resolution (80..200)
    float  sat_shift = 16;
    float  bri_shift = 17;
  }
  ```

  **(b)** Create `tools/docker/buf.sh` (mirrors `tools/docker/deploy.sh` structure; `sh`, `set -eu`, resolves repo root from script dir so it works from any cwd):

  ```sh
  #!/usr/bin/env sh
  # Regenerate proto stubs (Go + frontend TS) via pinned buf Docker image.
  # Host needs only Docker. Run from anywhere.
  set -eu
  BUF_IMAGE="bufbuild/buf:1.47.2"
  SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
  REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
  echo "buf.sh: generating Go stubs -> flower-backend/gen/go"
  docker run --rm -v "$REPO_ROOT":/workspace -w /workspace/flower-backend "$BUF_IMAGE" generate
  echo "buf.sh: generating frontend TS stubs -> petal-pixel-studio/src/gen"
  docker run --rm -v "$REPO_ROOT":/workspace -w /workspace/flower-backend "$BUF_IMAGE" generate --template buf.gen.frontend.yaml
  echo "buf.sh: done. Review 'git diff' before committing."
  ```

  Then make it executable with LF endings (repo `.gitattributes` already forces `*.sh text eol=lf`):

  ```sh
  chmod +x "tools/docker/buf.sh"
  ```

  **(c)** Edit `docker-compose.yml`. After the `frontend` service block (currently ends at line 130), append the optional `codegen` service (kept out of default `up` by `profiles: ["tools"]`; `working_dir` is `/workspace/flower-backend` so the frontend template's `out: ../petal-pixel-studio/src/gen` resolves to `/workspace/petal-pixel-studio/src/gen`):

  ```yaml
    codegen:
      image: bufbuild/buf:1.47.2
      profiles: ["tools"]
      working_dir: /workspace/flower-backend
      entrypoint: ["/bin/sh", "-c"]
      command:
        - |
          set -e
          buf generate
          buf generate --template buf.gen.frontend.yaml
          echo "codegen: Go -> gen/go and TS -> ../petal-pixel-studio/src/gen regenerated"
      volumes:
        - .:/workspace
      restart: "no"
  ```

  **(d)** Regenerate both stub sets via the new `buf.sh` (from repo root):

  ```sh
  "tools/docker/buf.sh"
  ```

- [ ] **Step 4: MANUAL VERIFICATION — lint passes, stubs contain the new symbols, Go compiles, TS type-checks**

  ```sh
  # (a) proto lint (STANDARD rules) — must pass
  docker run --rm -v "$PWD":/workspace -w /workspace/flower-backend \
    bufbuild/buf:1.47.2 lint
  # EXPECT: no output, exit 0

  # (b) the regen produced a REAL, expected diff (fields 10-17)
  git status --porcelain flower-backend/gen petal-pixel-studio/src/gen
  # EXPECT: M flower-backend/gen/go/flower/v1/service.pb.go
  #         M petal-pixel-studio/src/gen/flower/v1/service_pb.ts
  #   (service_grpc.pb.go / service_connect.ts UNCHANGED — no RPC signature change)

  # (c) new Go symbols present
  grep -E 'type (ColorStop|PaletteSpec|ClassicParams|RoseParams|BloomParams|SunflowerParams|RhodoneaParams|SuperformulaParams) struct' \
    flower-backend/gen/go/flower/v1/service.pb.go
  grep -E 'FlowerParams_(Classic|Rose|Bloom|Sunflower|Rhodonea|Superformula)' \
    flower-backend/gen/go/flower/v1/service.pb.go | head
  # EXPECT: 8 struct lines + the 6 oneof wrapper case types

  # (d) regenerated Go compiles
  docker run --rm -v "$PWD/flower-backend":/src -w /src \
    golang:1.25-alpine go build ./...
  # EXPECT: no output, exit 0

  # (e) new TS symbols present + frontend type-checks
  grep -E '(family:|palette\?|shape:|SunflowerParams|RhodoneaParams|SuperformulaParams)' \
    petal-pixel-studio/src/gen/flower/v1/service_pb.ts | head
  cd petal-pixel-studio && npx tsc --noEmit; cd ..
  # EXPECT: grep shows the new fields; tsc exits 0 (existing code still ignores the additive fields)
  ```

  ALL of (a) exit 0, (b) exactly the two `M` lines, (c) 8 structs + 6 case types, (d) exit 0, (e) new fields present + `tsc` exit 0. If `buf lint` complains about oneof/field naming, it is a real STANDARD-rule violation in the proto — fix the proto, do NOT disable the rule.

- [ ] **Step 5: Commit**

  ```sh
  git add flower-backend/proto/flower/v1/service.proto \
          flower-backend/gen/go/flower/v1/service.pb.go \
          petal-pixel-studio/src/gen/flower/v1/service_pb.ts \
          tools/docker/buf.sh \
          docker-compose.yml
  git commit -m "$(cat <<'EOF'
  feat(proto): add v2 FlowerParams render contract + Dockerized buf codegen

  Append family=10, palette=11, oneof shape{classic=12..superformula=17} and
  messages ColorStop/PaletteSpec/ClassicParams/RoseParams/BloomParams/
  SunflowerParams/RhodoneaParams/SuperformulaParams (all additive, wire-compatible;
  fields 1-9 unchanged). Regenerate Go (gen/go) + TS (src/gen) stubs via pinned
  bufbuild/buf:1.47.2. Add tools/docker/buf.sh wrapper and an optional compose
  `codegen` service (profiles:[tools]) so codegen runs with Docker-only toolchain.
  Unblocks all Go + frontend v2 tasks.

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  EOF
  )"
  ```

---

Reference notes for the assembler and implementer (verified against the real repo, not the plan alone):

- Repo root is `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel` (the plan's `"undefined"` placeholder = this path; it contains a space, so every `docker run -v` path is quoted).
- Current proto (`flower-backend/proto/flower/v1/service.proto`) has `message FlowerParams` closing at line 34 (`float hue = 9;` at line 33) — the append point.
- buf configs live in `flower-backend/` (`buf.yaml`, `buf.gen.yaml` → `gen/go`, `buf.gen.frontend.yaml` → `../petal-pixel-studio/src/gen`), so the docker `-w` must be `/workspace/flower-backend` with repo root mounted at `/workspace`.
- Currently committed stubs were generated with protoc-gen-go v1.36.11 and protoc-gen-es v2.11.0 (verified in stub headers). Pinning `bufbuild/buf:1.47.2` is load-bearing; Step 1(b) is the guard that the pin matches before intentional changes.
- `flower-backend/.dockerignore` does NOT exclude `gen/` (verified), so committed Go stubs reach the backend image via `COPY . .` — regenerated stubs must stay committed.
- Docker 29.4.3 is present on host; no Go/buf on host (matches memory). `tools/docker/deploy.sh` exists and is the mirror template for `buf.sh` (both `sh`, `set -eu`, resolve paths internally).

---

### Task 2: Go palette catalog + buildPalette (baked HSB shifts)

**Files:**
- Create: `flower-backend/internal/flower/palette.go` (NEW)
- Test: `flower-backend/internal/flower/palette_test.go` (NEW)

**Interfaces:**
- Consumes (from the generator.go v2 task — must already exist in package `flower`):
  - `func deriveSeed(base uint64, salt string) uint64`
  - `func stream(base uint64, salt string) *splitmix64`
  - `func (r *splitmix64) FloatRange(min, max float64) float64`
  - `func (r *splitmix64) IntRange(min, max int) int` (inclusive)
  - `type ColorStop struct { Position float32 \`json:"position"\`; Hex string \`json:"hex"\`; R float32 \`json:"r"\`; G float32 \`json:"g"\`; B float32 \`json:"b"\` }`
  - `type PaletteSpec struct { ID string \`json:"id"\`; Stops []ColorStop \`json:"stops"\`; HueShift float32 \`json:"hue_shift"\`; SatShift float32 \`json:"sat_shift"\`; BriShift float32 \`json:"bri_shift"\` }`
  - (These pure-Go structs are the mapped-later source; palette.go does NOT import generated proto types.)
- Produces (later tasks / `GenerateFromName` rely on these exact names):
  - `func buildPalette(seed uint64) *PaletteSpec` — picks a catalog entry via `stream(seed,"palette.pick")`, draws hue/sat/bri shifts, bakes them into every stop, returns proto-ready `*PaletteSpec` (ID, baked Stops with consistent Hex+R/G/B, and echoed HueShift/SatShift/BriShift for provenance).
  - `var paletteCatalog []paletteDef` — 20 curated entries (ids per contract line 354-357), each `>=2` stops (this task uses 3-4), ascending `Position` from 0 to 1, R/G/B in `[0,1]` sRGB.
  - `type paletteDef struct { id string; stops []ColorStop }`
  - sRGB<->HSB helpers: `func srgbToHSB(r, g, b float32) (h, s, v float32)` (h in 0..360, s/v in 0..1) and `func hsbToSRGB(h, s, v float32) (r, g, b float32)`; `func hexOf(r, g, b float32) string` ("#rrggbb", lowercase).

- [ ] **Step 1: Write the failing test** — create `flower-backend/internal/flower/palette_test.go`:

```go
package flower

import (
	"math"
	"testing"
)

// buildPalette must be deterministic: same seed -> identical id + provenance shifts.
func TestBuildPaletteDeterministic(t *testing.T) {
	const seed uint64 = 0x0123456789abcdef
	a := buildPalette(seed)
	b := buildPalette(seed)
	if a.ID != b.ID {
		t.Fatalf("id not deterministic: %q vs %q", a.ID, b.ID)
	}
	if a.HueShift != b.HueShift || a.SatShift != b.SatShift || a.BriShift != b.BriShift {
		t.Fatalf("shifts not deterministic: %+v vs %+v", a, b)
	}
	if len(a.Stops) != len(b.Stops) {
		t.Fatalf("stop count differs: %d vs %d", len(a.Stops), len(b.Stops))
	}
	for i := range a.Stops {
		if a.Stops[i] != b.Stops[i] {
			t.Fatalf("stop %d differs: %+v vs %+v", i, a.Stops[i], b.Stops[i])
		}
	}
}

// Different seeds should be able to select different catalog entries (the id is a
// pure function of stream(seed,"palette.pick")). Assert we can observe >1 distinct id.
func TestBuildPaletteVariesAcrossSeeds(t *testing.T) {
	seen := map[string]bool{}
	for s := uint64(0); s < 200; s++ {
		seen[buildPalette(s).ID] = true
	}
	if len(seen) < 2 {
		t.Fatalf("expected multiple palette ids across seeds, saw %d", len(seen))
	}
}

// Provenance shifts stay in the canonical ranges (contract lines 348-349, 88-90).
func TestBuildPaletteShiftRanges(t *testing.T) {
	for s := uint64(0); s < 500; s++ {
		p := buildPalette(s)
		if p.HueShift < -30 || p.HueShift > 30 {
			t.Fatalf("seed %d hue_shift out of [-30,30]: %v", s, p.HueShift)
		}
		if p.SatShift < -0.20 || p.SatShift > 0.20 {
			t.Fatalf("seed %d sat_shift out of [-0.20,0.20]: %v", s, p.SatShift)
		}
		if p.BriShift < -0.15 || p.BriShift > 0.15 {
			t.Fatalf("seed %d bri_shift out of [-0.15,0.15]: %v", s, p.BriShift)
		}
	}
}

// Every returned palette is a valid gradient: >=2 stops, ascending 0..1, first=0 last=1,
// rgb in [0,1], and Hex consistent with round(r*255),round(g*255),round(b*255).
func TestBuildPaletteStopValidity(t *testing.T) {
	for s := uint64(0); s < 500; s++ {
		p := buildPalette(s)
		if len(p.Stops) < 2 {
			t.Fatalf("seed %d: want >=2 stops, got %d", s, len(p.Stops))
		}
		if p.Stops[0].Position != 0 {
			t.Fatalf("seed %d: first stop pos=%v, want 0", s, p.Stops[0].Position)
		}
		if p.Stops[len(p.Stops)-1].Position != 1 {
			t.Fatalf("seed %d: last stop pos=%v, want 1", s, p.Stops[len(p.Stops)-1].Position)
		}
		prev := float32(-1)
		for i, st := range p.Stops {
			if st.Position <= prev && i > 0 {
				t.Fatalf("seed %d stop %d: pos %v not strictly ascending after %v", s, i, st.Position, prev)
			}
			prev = st.Position
			for _, c := range []float32{st.R, st.G, st.B} {
				if c < 0 || c > 1 {
					t.Fatalf("seed %d stop %d: channel %v out of [0,1]", s, i, c)
				}
			}
			want := hexOf(st.R, st.G, st.B)
			if st.Hex != want {
				t.Fatalf("seed %d stop %d: hex %q inconsistent with rgb (want %q)", s, i, st.Hex, want)
			}
		}
	}
}

// The raw catalog is well-formed independent of shifts: exactly 20 entries,
// unique ids, each >=2 stops ascending 0..1 with rgb in range.
func TestPaletteCatalogWellFormed(t *testing.T) {
	if len(paletteCatalog) != 20 {
		t.Fatalf("want 20 catalog entries, got %d", len(paletteCatalog))
	}
	ids := map[string]bool{}
	for _, d := range paletteCatalog {
		if d.id == "" {
			t.Fatalf("catalog entry with empty id")
		}
		if ids[d.id] {
			t.Fatalf("duplicate catalog id %q", d.id)
		}
		ids[d.id] = true
		if len(d.stops) < 2 {
			t.Fatalf("catalog %q: want >=2 stops, got %d", d.id, len(d.stops))
		}
		if d.stops[0].Position != 0 || d.stops[len(d.stops)-1].Position != 1 {
			t.Fatalf("catalog %q: stops must span 0..1, got %v..%v", d.id, d.stops[0].Position, d.stops[len(d.stops)-1].Position)
		}
		prev := float32(-1)
		for i, st := range d.stops {
			if i > 0 && st.Position <= prev {
				t.Fatalf("catalog %q stop %d: pos %v not ascending", d.id, i, st.Position)
			}
			prev = st.Position
			for _, c := range []float32{st.R, st.G, st.B} {
				if c < 0 || c > 1 {
					t.Fatalf("catalog %q stop %d: channel %v out of [0,1]", d.id, i, c)
				}
			}
		}
	}
}

// sRGB<->HSB helpers must round-trip within float32 tolerance for the catalog colors.
func TestSRGBHSBRoundTrip(t *testing.T) {
	for _, d := range paletteCatalog {
		for _, st := range d.stops {
			h, s, v := srgbToHSB(st.R, st.G, st.B)
			r2, g2, b2 := hsbToSRGB(h, s, v)
			if math.Abs(float64(r2-st.R)) > 1e-3 ||
				math.Abs(float64(g2-st.G)) > 1e-3 ||
				math.Abs(float64(b2-st.B)) > 1e-3 {
				t.Fatalf("%q roundtrip drift: (%v,%v,%v)->(%v,%v,%v)", d.id, st.R, st.G, st.B, r2, g2, b2)
			}
		}
	}
}
```

- [ ] **Step 2: Run it, expect FAIL** — the package fails to compile because `palette.go` does not yet exist (`buildPalette`, `paletteCatalog`, `paletteDef`, `srgbToHSB`, `hsbToSRGB`, `hexOf` are undefined):

```
docker run --rm -v "$PWD/flower-backend":/src -w /src \
  golang:1.25-alpine go test ./internal/flower/... -run 'TestBuildPalette|TestPaletteCatalog|TestSRGBHSB' -count=1
```
Expected output (compile failure): `./palette_test.go:...: undefined: buildPalette` (and `undefined: paletteCatalog`, `paletteDef`, `srgbToHSB`, `hsbToSRGB`, `hexOf`), ending in `FAIL flower-backend/internal/flower [build failed]`. (Run from repo root; the path contains a space so `$PWD` must stay quoted.)

- [ ] **Step 3: Implement** — create `flower-backend/internal/flower/palette.go`:

```go
package flower

import (
	"fmt"
	"math"
)

// paletteDef is a curated base gradient. Stops are sRGB in [0,1], ascending
// Position from 0 to 1. buildPalette bakes name-derived HSB shifts into a copy.
type paletteDef struct {
	id    string
	stops []ColorStop
}

// stop is a small constructor: Hex/R/G/B are filled from r,g,b; Position set by caller.
func stop(pos, r, g, b float32) ColorStop {
	return ColorStop{Position: pos, Hex: hexOf(r, g, b), R: r, G: g, B: b}
}

// paletteCatalog: 20 curated, high-value gradients (ids per the canonical contract).
// Each has 3-4 stops, ascending 0..1, rgb in [0,1] sRGB.
var paletteCatalog = []paletteDef{
	{"sunset_coral", []ColorStop{stop(0, 0.99, 0.85, 0.55), stop(0.5, 0.98, 0.55, 0.36), stop(1, 0.85, 0.24, 0.34)}},
	{"blush_rose", []ColorStop{stop(0, 1.00, 0.93, 0.94), stop(0.55, 0.97, 0.68, 0.74), stop(1, 0.85, 0.36, 0.53)}},
	{"golden_hour", []ColorStop{stop(0, 1.00, 0.95, 0.72), stop(0.5, 0.99, 0.78, 0.34), stop(1, 0.90, 0.53, 0.16)}},
	{"lavender_mist", []ColorStop{stop(0, 0.95, 0.93, 0.99), stop(0.5, 0.78, 0.72, 0.93), stop(1, 0.55, 0.46, 0.80)}},
	{"crimson_velvet", []ColorStop{stop(0, 0.86, 0.30, 0.36), stop(0.5, 0.66, 0.12, 0.22), stop(1, 0.38, 0.05, 0.12)}},
	{"tangerine_pop", []ColorStop{stop(0, 1.00, 0.88, 0.55), stop(0.45, 1.00, 0.60, 0.22), stop(1, 0.95, 0.36, 0.12)}},
	{"ocean_teal", []ColorStop{stop(0, 0.78, 0.96, 0.94), stop(0.5, 0.30, 0.74, 0.74), stop(1, 0.05, 0.38, 0.50)}},
	{"deep_iris", []ColorStop{stop(0, 0.72, 0.66, 0.95), stop(0.5, 0.42, 0.32, 0.80), stop(1, 0.20, 0.12, 0.48)}},
	{"peach_cream", []ColorStop{stop(0, 1.00, 0.96, 0.90), stop(0.5, 0.99, 0.82, 0.68), stop(1, 0.96, 0.64, 0.48)}},
	{"magenta_dream", []ColorStop{stop(0, 0.99, 0.80, 0.94), stop(0.5, 0.92, 0.38, 0.72), stop(1, 0.66, 0.10, 0.48)}},
	{"honey_amber", []ColorStop{stop(0, 1.00, 0.92, 0.66), stop(0.5, 0.93, 0.71, 0.30), stop(1, 0.72, 0.46, 0.10)}},
	{"mint_frost", []ColorStop{stop(0, 0.93, 0.99, 0.95), stop(0.5, 0.62, 0.90, 0.76), stop(1, 0.28, 0.68, 0.56)}},
	{"cherry_snow", []ColorStop{stop(0, 1.00, 0.95, 0.96), stop(0.5, 0.98, 0.60, 0.66), stop(1, 0.82, 0.14, 0.30)}},
	{"plum_wine", []ColorStop{stop(0, 0.80, 0.58, 0.72), stop(0.5, 0.55, 0.26, 0.46), stop(1, 0.30, 0.10, 0.26)}},
	{"saffron_gold", []ColorStop{stop(0, 1.00, 0.90, 0.52), stop(0.5, 0.98, 0.70, 0.18), stop(1, 0.84, 0.48, 0.06)}},
	{"sky_periwinkle", []ColorStop{stop(0, 0.90, 0.95, 1.00), stop(0.5, 0.62, 0.72, 0.96), stop(1, 0.36, 0.46, 0.84)}},
	{"rose_quartz", []ColorStop{stop(0, 1.00, 0.94, 0.95), stop(0.5, 0.96, 0.76, 0.80), stop(1, 0.87, 0.55, 0.62)}},
	{"emerald_leaf", []ColorStop{stop(0, 0.84, 0.96, 0.78), stop(0.5, 0.42, 0.78, 0.44), stop(1, 0.10, 0.46, 0.24)}},
	{"coral_reef", []ColorStop{stop(0, 1.00, 0.86, 0.74), stop(0.45, 0.99, 0.56, 0.48), stop(1, 0.92, 0.30, 0.40)}},
	{"violet_ember", []ColorStop{stop(0, 0.92, 0.72, 0.86), stop(0.5, 0.64, 0.30, 0.66), stop(1, 0.34, 0.10, 0.40)}},
}

// buildPalette picks a catalog entry deterministically from seed, draws name-derived
// hue/sat/bri shifts, BAKES them into every stop (both Hex and R/G/B post-shift), and
// echoes the shift values on PaletteSpec for provenance (contract lines 342-357).
func buildPalette(seed uint64) *PaletteSpec {
	base := paletteCatalog[stream(seed, "palette.pick").IntRange(0, len(paletteCatalog)-1)]

	hueShift := float32(stream(seed, "palette.hue_shift").FloatRange(-30, 30))  // degrees
	satShift := float32(stream(seed, "palette.sat_shift").FloatRange(-0.20, 0.20)) // fraction
	briShift := float32(stream(seed, "palette.bri_shift").FloatRange(-0.15, 0.15)) // fraction

	baked := make([]ColorStop, len(base.stops))
	for i, s := range base.stops {
		h, sat, val := srgbToHSB(s.R, s.G, s.B)
		h = float32(math.Mod(float64(h+hueShift)+360, 360)) // wrap hue into [0,360)
		sat = clamp01(sat + satShift)                        // fractions add directly to 0..1 sat
		val = clamp01(val + briShift)                        // ... and 0..1 brightness
		r, g, b := hsbToSRGB(h, sat, val)
		baked[i] = ColorStop{Position: s.Position, Hex: hexOf(r, g, b), R: r, G: g, B: b}
	}

	return &PaletteSpec{
		ID:       base.id,
		Stops:    baked,
		HueShift: hueShift,
		SatShift: satShift,
		BriShift: briShift,
	}
}

func clamp01(v float32) float32 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

// srgbToHSB converts sRGB in [0,1] to HSB/HSV: h in [0,360), s,v in [0,1].
func srgbToHSB(r, g, b float32) (h, s, v float32) {
	maxc := max3(r, g, b)
	minc := min3(r, g, b)
	v = maxc
	d := maxc - minc
	if maxc > 0 {
		s = d / maxc
	}
	if d == 0 {
		return 0, s, v // achromatic; hue undefined -> 0
	}
	switch maxc {
	case r:
		h = float32(math.Mod(float64((g-b)/d), 6))
	case g:
		h = (b-r)/d + 2
	default: // b
		h = (r-g)/d + 4
	}
	h *= 60
	if h < 0 {
		h += 360
	}
	return h, s, v
}

// hsbToSRGB converts HSB/HSV (h in degrees, s,v in [0,1]) to sRGB in [0,1].
func hsbToSRGB(h, s, v float32) (r, g, b float32) {
	h = float32(math.Mod(float64(h)+360, 360))
	c := v * s
	x := c * float32(1-math.Abs(math.Mod(float64(h)/60, 2)-1))
	m := v - c
	var r1, g1, b1 float32
	switch {
	case h < 60:
		r1, g1, b1 = c, x, 0
	case h < 120:
		r1, g1, b1 = x, c, 0
	case h < 180:
		r1, g1, b1 = 0, c, x
	case h < 240:
		r1, g1, b1 = 0, x, c
	case h < 300:
		r1, g1, b1 = x, 0, c
	default:
		r1, g1, b1 = c, 0, x
	}
	return clamp01(r1 + m), clamp01(g1 + m), clamp01(b1 + m)
}

// hexOf formats sRGB [0,1] channels as a lowercase "#rrggbb" string, matching
// round(r*255),round(g*255),round(b*255) (contract ColorStop consistency rule).
func hexOf(r, g, b float32) string {
	return fmt.Sprintf("#%02x%02x%02x", to255(r), to255(g), to255(b))
}

func to255(v float32) int {
	n := int(math.Round(float64(clamp01(v)) * 255))
	if n < 0 {
		n = 0
	}
	if n > 255 {
		n = 255
	}
	return n
}

func max3(a, b, c float32) float32 {
	m := a
	if b > m {
		m = b
	}
	if c > m {
		m = c
	}
	return m
}

func min3(a, b, c float32) float32 {
	m := a
	if b < m {
		m = b
	}
	if c < m {
		m = c
	}
	return m
}
```

- [ ] **Step 4: Run it, expect PASS**:

```
docker run --rm -v "$PWD/flower-backend":/src -w /src \
  golang:1.25-alpine go test ./internal/flower/... -run 'TestBuildPalette|TestPaletteCatalog|TestSRGBHSB' -count=1
```
Expected: `ok  flower-backend/internal/flower`. Then run the whole package to confirm no regression: `docker run --rm -v "$PWD/flower-backend":/src -w /src golang:1.25-alpine go test ./internal/flower/... -count=1`.

- [ ] **Step 5: Commit**:

```
git add flower-backend/internal/flower/palette.go flower-backend/internal/flower/palette_test.go
git commit -m "feat(flower): curated palette catalog + buildPalette with baked HSB shifts

20-entry paletteCatalog (sRGB stops), deterministic buildPalette(seed) that
picks a palette, bakes name-derived hue/sat/bri shifts into every stop, and
returns a proto-ready PaletteSpec (consistent Hex+R/G/B, provenance shifts).
Adds sRGB<->HSB helpers and hexOf. Tests cover determinism, shift ranges,
stop validity, catalog well-formedness, and HSB round-trip. Go tests via
golang:1.25-alpine Docker.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

**Notes for the assembler / sequencing (not part of the task body):**
- This task **depends on** the generator.go v2 task landing first: `deriveSeed`, `stream`, `(*splitmix64).FloatRange`, `(*splitmix64).IntRange`, and the pure-Go `ColorStop`/`PaletteSpec` structs are consumed here and must already be declared in package `flower`. Per the prompt's fallback, palette stays in pure Go structs (no generated proto import); `flower_server.go`'s `toProtoParams` maps `*PaletteSpec` -> `*flowerv1.PaletteSpec` in a later task.
- `hexOf`/`clamp01`/`max3`/`min3`/`to255`/`stop` are new package-level helpers introduced here; if the generator.go v2 task also introduces a `clamp01`/`max3`/`min3`, de-duplicate at integration time (keep one definition in the package). File to touch on conflict: whichever task lands second drops its copy.
- Real paths: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/flower-backend/internal/flower/palette.go` and `.../palette_test.go`. Module `flower-backend`, package `flower`, Go 1.25.3 (`go.mod`), package currently contains only `generator.go` (no pre-existing `_test.go`).

---

### Task 3: Go generator v2 — decorrelated draws, weighted family, per-family builders

**Files:**
- Modify: `flower-backend/internal/flower/generator.go` — bump version consts (currently lines 11-14); add `deriveSeed`/`stream`/`FloatRange`/`IntRange` (after `splitmix64` methods, current lines 96-106); add v2 structs (after `Params`, current lines 16-27); add `familyTable`, `pickFamily`, `legacyPetalCount`, per-family `build*`; rewrite `GenerateFromName` (current lines 29-54). Keep `normalizeName` (56-76), `seedFromString` (78-81), `splitmix64`+`newSplitMix64`/`next`/`Uint32n`/`Float64` (83-106) UNCHANGED.
- Test: `flower-backend/internal/flower/generator_test.go` (NEW)

**Interfaces:**
- Consumes (from `palette.go`, Task on palette): `func buildPalette(seed uint64) *PaletteSpec`; types `PaletteSpec`, `ColorStop`. This task defines the v2 `Params` struct + all per-family param structs (contract lines 221-334) that `palette.go` and `flower_server.go` also reference — if the palette task lands first it defines `ColorStop`/`PaletteSpec` and this task must NOT redeclare them; keep those two types in `palette.go`. All other v2 structs (`ClassicParams`…`SuperformulaParams`, `Params` v2 fields) live here.
- Consumes (unchanged, current file): `seedFromString(string) uint64`, `newSplitMix64(uint64) *splitmix64`, `(*splitmix64).Uint32n(uint32) uint32`, `(*splitmix64).Float64() float64`, `normalizeName(string) string`.
- Produces (relied on by `flower_server.go` mapper + frontend codegen alignment): `AlgoVersion=="v2"`, `SchemaVersion=="v2"`; `Params.Family string`, `Params.Palette *PaletteSpec`, one non-nil of `Params.{Classic,Rose,Bloom,Sunflower,Rhodonea,Superformula}`; the 6 v1 scalars always populated; helpers `deriveSeed(uint64,string) uint64`, `stream(uint64,string) *splitmix64`, `(*splitmix64).FloatRange(float64,float64) float64`, `(*splitmix64).IntRange(int,int) int`, `pickFamily(uint64) string`.

- [ ] **Step 1: Write the failing test** — create `flower-backend/internal/flower/generator_test.go`:
```go
package flower

import (
	"math"
	"testing"
)

func TestGenerateFromNameDeterministic(t *testing.T) {
	a := GenerateFromName("Lily of the Valley")
	b := GenerateFromName("Lily of the Valley")
	if a.Family != b.Family {
		t.Fatalf("family not deterministic: %q vs %q", a.Family, b.Family)
	}
	if a.Seed != b.Seed {
		t.Fatalf("seed not deterministic: %d vs %d", a.Seed, b.Seed)
	}
	if a.Palette == nil || b.Palette == nil {
		t.Fatalf("palette must be non-nil")
	}
	if a.Palette.ID != b.Palette.ID {
		t.Fatalf("palette id not deterministic: %q vs %q", a.Palette.ID, b.Palette.ID)
	}
	if a.Hue != b.Hue || a.PetalCount != b.PetalCount || a.Curvature != b.Curvature {
		t.Fatalf("v1 scalars not deterministic")
	}
}

func TestVersionsAreV2(t *testing.T) {
	if AlgoVersion != "v2" || SchemaVersion != "v2" {
		t.Fatalf("want v2/v2, got %q/%q", AlgoVersion, SchemaVersion)
	}
	p := GenerateFromName("rose")
	if p.AlgoVersion != "v2" || p.SchemaVersion != "v2" {
		t.Fatalf("emitted versions not v2: %q/%q", p.AlgoVersion, p.SchemaVersion)
	}
}

func TestV1ScalarsAlwaysPopulated(t *testing.T) {
	// Sample many names; the 6 v1 scalars must be in-range regardless of family.
	for _, name := range []string{"a", "sunflower dream", "rhodonea", "gielis", "camellia", "iris garden", "42", "??"} {
		p := GenerateFromName(name)
		if p.PetalCount < 3 {
			t.Fatalf("%q: petal_count %d < 3", name, p.PetalCount)
		}
		if p.PetalLength < 0.4 || p.PetalLength > 1.6 {
			t.Fatalf("%q: petal_length %f out of [0.4,1.6]", name, p.PetalLength)
		}
		if p.PetalWidth < 0.15 || p.PetalWidth > 0.75 {
			t.Fatalf("%q: petal_width %f out of [0.15,0.75]", name, p.PetalWidth)
		}
		if p.Curvature < -0.8 || p.Curvature > 0.8 {
			t.Fatalf("%q: curvature %f out of [-0.8,0.8]", name, p.Curvature)
		}
		if p.StemHeight < 0.5 || p.StemHeight > 2.5 {
			t.Fatalf("%q: stem_height %f out of [0.5,2.5]", name, p.StemHeight)
		}
		if p.Hue < 0 || p.Hue >= 360 {
			t.Fatalf("%q: hue %f out of [0,360)", name, p.Hue)
		}
	}
}

func TestExactlyOneShapeSet(t *testing.T) {
	names := []string{"", " ", "aaa", "sun flower", "gielis curve", "rosette", "petunia", "zzz camellia", "north star", "42x"}
	for _, name := range names {
		p := GenerateFromName(name)
		set := 0
		if p.Classic != nil {
			set++
		}
		if p.Rose != nil {
			set++
		}
		if p.Bloom != nil {
			set++
		}
		if p.Sunflower != nil {
			set++
		}
		if p.Rhodonea != nil {
			set++
		}
		if p.Superformula != nil {
			set++
		}
		if set != 1 {
			t.Fatalf("%q family=%q: exactly one shape must be set, got %d", name, p.Family, set)
		}
		// The set shape must match Family.
		switch p.Family {
		case "classic":
			if p.Classic == nil {
				t.Fatalf("%q: family classic but Classic nil", name)
			}
		case "rose":
			if p.Rose == nil {
				t.Fatalf("%q: family rose but Rose nil", name)
			}
		case "zinnia", "camellia", "lotus", "dahlia":
			if p.Bloom == nil {
				t.Fatalf("%q: bloom family %q but Bloom nil", name, p.Family)
			}
		case "sunflower":
			if p.Sunflower == nil {
				t.Fatalf("%q: family sunflower but Sunflower nil", name)
			}
		case "rhodonea":
			if p.Rhodonea == nil {
				t.Fatalf("%q: family rhodonea but Rhodonea nil", name)
			}
		case "superformula":
			if p.Superformula == nil {
				t.Fatalf("%q: family superformula but Superformula nil", name)
			}
		default:
			t.Fatalf("%q: unexpected family %q", name, p.Family)
		}
	}
}

func TestPickFamilyWeightsAndCoverage(t *testing.T) {
	counts := map[string]int{}
	// Deterministic distinct seeds; enough to hit all 9 buckets.
	for i := 0; i < 20000; i++ {
		fam := pickFamily(uint64(i)*0x9e3779b97f4a7c15 + 1)
		counts[fam]++
	}
	for _, f := range familyTable {
		if counts[f.name] == 0 {
			t.Fatalf("family %q never selected across 20000 seeds", f.name)
		}
	}
	// Weight ordering sanity: classic (w=22) should out-appear superformula (w=6).
	if counts["classic"] <= counts["superformula"] {
		t.Fatalf("weight skew wrong: classic=%d superformula=%d", counts["classic"], counts["superformula"])
	}
	// No stray families.
	if len(counts) != len(familyTable) {
		t.Fatalf("got %d distinct families, want %d", len(counts), len(familyTable))
	}
}

func TestFamilyTableSumsTo100(t *testing.T) {
	sum := 0
	for _, f := range familyTable {
		sum += f.w
	}
	if sum != 100 {
		t.Fatalf("familyTable weights sum to %d, want 100", sum)
	}
}

func TestDecorrelationSanity(t *testing.T) {
	// Two salts on the same base must not produce identical sub-streams.
	base := seedFromString("decorrelation-probe")
	sHue := stream(base, "palette.hue_shift")
	sSat := stream(base, "palette.sat_shift")
	same := 0
	for i := 0; i < 64; i++ {
		if sHue.next() == sSat.next() {
			same++
		}
	}
	if same > 2 {
		t.Fatalf("sub-streams too correlated: %d/64 collisions", same)
	}
	// Same salt is reproducible.
	if deriveSeed(base, "family") != deriveSeed(base, "family") {
		t.Fatalf("deriveSeed not deterministic for a fixed salt")
	}
	if deriveSeed(base, "a") == deriveSeed(base, "b") {
		t.Fatalf("deriveSeed collides across salts a/b")
	}
}

func TestFloatRangeIntRangeBounds(t *testing.T) {
	r := newSplitMix64(12345)
	for i := 0; i < 5000; i++ {
		f := r.FloatRange(0.40, 0.78)
		if f < 0.40 || f > 0.78 {
			t.Fatalf("FloatRange out of bounds: %f", f)
		}
		n := r.IntRange(2, 9)
		if n < 2 || n > 9 {
			t.Fatalf("IntRange out of bounds: %d", n)
		}
	}
	// Inclusive endpoints reachable for IntRange(2,9).
	seen := map[int]bool{}
	for i := 0; i < 100000; i++ {
		seen[r.IntRange(2, 9)] = true
	}
	if !seen[2] || !seen[9] {
		t.Fatalf("IntRange endpoints not inclusive: saw2=%v saw9=%v", seen[2], seen[9])
	}
}

func TestSuperformulaGuardRails(t *testing.T) {
	// Find a name that lands on superformula, then check bounds + guards.
	var sp *SuperformulaParams
	for i := 0; i < 5000 && sp == nil; i++ {
		p := GenerateFromName("sf-" + itoa(i))
		if p.Superformula != nil {
			sp = p.Superformula
		}
	}
	if sp == nil {
		t.Fatal("never produced a superformula in 5000 names")
	}
	if sp.M1 < 4 {
		t.Fatalf("m1 %f < 4 (lobe guard)", sp.M1)
	}
	if sp.N1a <= 0 || sp.N1b <= 0 {
		t.Fatalf("n1a/n1b must be > 0: %f / %f", sp.N1a, sp.N1b)
	}
	if sp.Scale < 200 || sp.Scale > 360 {
		t.Fatalf("scale %f out of [200,360]", sp.Scale)
	}
	if sp.USeg < 120 || sp.USeg > 340 || sp.VSeg < 80 || sp.VSeg > 200 {
		t.Fatalf("seg counts out of range: u=%d v=%d", sp.USeg, sp.VSeg)
	}
}

func TestRhodoneaGuardRails(t *testing.T) {
	var rp *RhodoneaParams
	for i := 0; i < 5000 && rp == nil; i++ {
		p := GenerateFromName("rh-" + itoa(i))
		if p.Rhodonea != nil {
			rp = p.Rhodonea
		}
	}
	if rp == nil {
		t.Fatal("never produced a rhodonea in 5000 names")
	}
	if rp.K < 2 || rp.K > 9 {
		t.Fatalf("k %d out of canonical [2,9]", rp.K)
	}
	if rp.Radius < 180 || rp.Radius > 340 {
		t.Fatalf("radius %f out of [180,340]", rp.Radius)
	}
	if rp.PetalSpan < 0.60 || rp.PetalSpan > 1.00 {
		t.Fatalf("petal_span %f out of [0.60,1.00]", rp.PetalSpan)
	}
	if rp.LengthSeg < 12 || rp.LengthSeg > 48 || rp.WidthSeg < 8 || rp.WidthSeg > 32 {
		t.Fatalf("seg counts out of range: len=%d width=%d", rp.LengthSeg, rp.WidthSeg)
	}
}

func TestSunflowerRangeBounds(t *testing.T) {
	var sf *SunflowerParams
	for i := 0; i < 5000 && sf == nil; i++ {
		p := GenerateFromName("sun-" + itoa(i))
		if p.Sunflower != nil {
			sf = p.Sunflower
		}
	}
	if sf == nil {
		t.Fatal("never produced a sunflower in 5000 names")
	}
	if sf.Scale < 200 || sf.Scale > 380 {
		t.Fatalf("scale %f out of [200,380]", sf.Scale)
	}
	if sf.FloretRings < 40 || sf.FloretRings > 150 {
		t.Fatalf("floret_rings %d out of [40,150]", sf.FloretRings)
	}
	if sf.FloretSpokes < 120 || sf.FloretSpokes > 320 {
		t.Fatalf("floret_spokes %d out of [120,320]", sf.FloretSpokes)
	}
	if sf.RayPetals < 13 || sf.RayPetals > 55 {
		t.Fatalf("ray_petals %d out of [13,55]", sf.RayPetals)
	}
	if sf.DiscRatio < 0.40 || sf.DiscRatio > 0.78 {
		t.Fatalf("disc_ratio %f out of [0.40,0.78]", sf.DiscRatio)
	}
	if sf.SatShift < -0.15 || sf.SatShift > 0.15 || sf.BriShift < -0.12 || sf.BriShift > 0.12 {
		t.Fatalf("shift fractions out of range: sat=%f bri=%f", sf.SatShift, sf.BriShift)
	}
}

func TestBloomShiftsAreHSBUnits(t *testing.T) {
	// Bloom sat/bri shifts are HSB units FR(-20,20)/FR(-15,15), NOT fractions.
	var bp *BloomParams
	for i := 0; i < 5000 && bp == nil; i++ {
		p := GenerateFromName("bl-" + itoa(i))
		if p.Bloom != nil {
			bp = p.Bloom
		}
	}
	if bp == nil {
		t.Fatal("never produced a bloom in 5000 names")
	}
	if bp.SatShift < -20 || bp.SatShift > 20 {
		t.Fatalf("bloom sat_shift %f out of HSB-unit [-20,20]", bp.SatShift)
	}
	if bp.BriShift < -15 || bp.BriShift > 15 {
		t.Fatalf("bloom bri_shift %f out of HSB-unit [-15,15]", bp.BriShift)
	}
	if bp.Scale < 240 || bp.Scale > 360 {
		t.Fatalf("bloom scale %f out of [240,360]", bp.Scale)
	}
}

func TestClassicFixedGridAndRanges(t *testing.T) {
	var cp *ClassicParams
	for i := 0; i < 5000 && cp == nil; i++ {
		p := GenerateFromName("cl-" + itoa(i))
		if p.Classic != nil {
			cp = p.Classic
		}
	}
	if cp == nil {
		t.Fatal("never produced a classic in 5000 names")
	}
	if cp.Rows != 84 || cp.Cols != 144 {
		t.Fatalf("classic grid not fixed 84/144: rows=%d cols=%d", cp.Rows, cp.Cols)
	}
	if cp.PNum < 5 || cp.PNum > 12 {
		t.Fatalf("p_num %d out of [5,12]", cp.PNum)
	}
	if cp.BNum < 5 || cp.BNum > 9 {
		t.Fatalf("b_num %d out of [5,9]", cp.BNum)
	}
	if math.IsNaN(float64(cp.FD)) || cp.FD < 150 || cp.FD > 230 {
		t.Fatalf("f_d %f out of [150,230]", cp.FD)
	}
}

// itoa avoids strconv import churn in probe loops.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}
```

- [ ] **Step 2: Run it, expect FAIL** — run:
```
docker run --rm -v "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/flower-backend":/src -w /src golang:1.25-alpine go test ./internal/flower/... -run 'TestGenerateFromName|TestVersionsAreV2|TestExactlyOneShapeSet|TestPickFamily|TestFamilyTable|TestDecorrelation|TestFloatRange|TestSuperformulaGuardRails|TestRhodoneaGuardRails|TestSunflower|TestBloomShifts|TestClassicFixed|TestV1Scalars' -count=1
```
Expected: compile failure — `undefined: pickFamily`, `undefined: familyTable`, `undefined: deriveSeed`, `undefined: stream`, `p.Palette.ID undefined` (`Params` has no `Palette`/`Family`/shape fields), `FloatRange`/`IntRange` undefined. Test binary does not build, so all listed tests report FAIL. (If `palette.go` is not yet present, `buildPalette`/`PaletteSpec`/`ColorStop` are also undefined — that task is a stated dependency; land it first or stub `buildPalette` returning `&PaletteSpec{ID:"placeholder",Stops:[]ColorStop{{Position:0,Hex:"#000000"},{Position:1,Hex:"#ffffff"}}}` and remove the stub once real palette lands.)

- [ ] **Step 3: Implement** — edit `flower-backend/internal/flower/generator.go`.

3a. Bump version consts (replace lines 11-14):
```go
const (
	AlgoVersion   = "v2"
	SchemaVersion = "v2"
)
```

3b. Replace the v1 `Params` struct (lines 16-27) with the v2 struct and the per-family param structs. `ColorStop`/`PaletteSpec` are declared in `palette.go`; do NOT redeclare them here.
```go
type Params struct {
	AlgoVersion   string `json:"algo_version"`
	SchemaVersion string `json:"schema_version"`
	Seed          uint64 `json:"seed"`

	// v1 scalars (ALWAYS populated for the v1 fallback path toTechniqueParams).
	PetalCount  uint32  `json:"petal_count"`
	PetalLength float32 `json:"petal_length"`
	PetalWidth  float32 `json:"petal_width"`
	Curvature   float32 `json:"curvature"`
	StemHeight  float32 `json:"stem_height"`
	Hue         float32 `json:"hue"`

	// v2 additions.
	Family  string       `json:"family,omitempty"`
	Palette *PaletteSpec `json:"palette,omitempty"`

	// Exactly one non-nil, selected by Family.
	Classic      *ClassicParams      `json:"classic,omitempty"`
	Rose         *RoseParams         `json:"rose,omitempty"`
	Bloom        *BloomParams        `json:"bloom,omitempty"`
	Sunflower    *SunflowerParams    `json:"sunflower,omitempty"`
	Rhodonea     *RhodoneaParams     `json:"rhodonea,omitempty"`
	Superformula *SuperformulaParams `json:"superformula,omitempty"`
}

type ClassicParams struct {
	Rows    uint32  `json:"rows"`
	Cols    uint32  `json:"cols"`
	PNum    uint32  `json:"p_num"`
	FD      float32 `json:"f_d"`
	PLen    float32 `json:"p_len"`
	PSharp  float32 `json:"p_sharp"`
	FHeight float32 `json:"f_height"`
	Curve1  float32 `json:"curve1"`
	Curve2  float32 `json:"curve2"`
	B       float32 `json:"b"`
	BNum    uint32  `json:"b_num"`
}

type RoseParams struct {
	Opening  float32 `json:"opening"`
	VDensity float32 `json:"v_density"`
	PAlign   float32 `json:"p_align"`
	Curve1   float32 `json:"curve1"`
	Curve2   float32 `json:"curve2"`
}

type BloomParams struct {
	Scale     float32 `json:"scale"`
	Opening   float32 `json:"opening"`
	Density   float32 `json:"density"`
	PetalFreq float32 `json:"petal_freq"`
	PetalAmp  float32 `json:"petal_amp"`
	HangDown  float32 `json:"hang_down"`
	Fade      float32 `json:"fade"`
	ThetaStep float32 `json:"theta_step"`
	RStep     float32 `json:"r_step"`
	SatShift  float32 `json:"sat_shift"` // HSB units (reconciliation #7)
	BriShift  float32 `json:"bri_shift"` // HSB units
}

type SunflowerParams struct {
	Scale        float32 `json:"scale"`
	FloretRings  uint32  `json:"floret_rings"`
	FloretSpokes uint32  `json:"floret_spokes"`
	DomeHeight   float32 `json:"dome_height"`
	DiscRatio    float32 `json:"disc_ratio"`
	RayPetals    uint32  `json:"ray_petals"`
	RayLength    float32 `json:"ray_length"`
	RayWidth     float32 `json:"ray_width"`
	SeedPacking  float32 `json:"seed_packing"`
	SatShift     float32 `json:"sat_shift"` // fraction
	BriShift     float32 `json:"bri_shift"` // fraction
}

type RhodoneaParams struct {
	Radius        float32 `json:"radius"`
	K             uint32  `json:"k"`
	PetalSpan     float32 `json:"petal_span"`
	WidthProfile  float32 `json:"width_profile"`
	HeightProfile float32 `json:"height_profile"`
	Thickness     float32 `json:"thickness"`
	Curl          float32 `json:"curl"`
	LengthSeg     uint32  `json:"length_seg"`
	WidthSeg      uint32  `json:"width_seg"`
	SatShift      float32 `json:"sat_shift"`
	BriShift      float32 `json:"bri_shift"`
}

type SuperformulaParams struct {
	Scale    float32 `json:"scale"`
	M1       float32 `json:"m1"`
	N1a      float32 `json:"n1a"`
	N2a      float32 `json:"n2a"`
	N3a      float32 `json:"n3a"`
	A1       float32 `json:"a1"`
	B1       float32 `json:"b1"`
	M2       float32 `json:"m2"`
	N1b      float32 `json:"n1b"`
	N2b      float32 `json:"n2b"`
	N3b      float32 `json:"n3b"`
	A2       float32 `json:"a2"`
	B2       float32 `json:"b2"`
	USeg     uint32  `json:"u_seg"`
	VSeg     uint32  `json:"v_seg"`
	SatShift float32 `json:"sat_shift"`
	BriShift float32 `json:"bri_shift"`
}
```

3c. Add the decorrelation helpers. Place `deriveSeed`/`stream` after `seedFromString` (currently ends line 81) and the two `*splitmix64` range methods after `Float64` (currently ends line 106):
```go
// deriveSeed produces an independent 64-bit sub-seed from base+salt.
func deriveSeed(base uint64, salt string) uint64 {
	h := sha256.New()
	var buf [8]byte
	binary.LittleEndian.PutUint64(buf[:], base)
	h.Write(buf[:])
	h.Write([]byte("|"))
	h.Write([]byte(salt))
	return binary.LittleEndian.Uint64(h.Sum(nil)[0:8])
}

// stream returns a fresh splitmix64 seeded by an independent sub-stream for salt.
func stream(base uint64, salt string) *splitmix64 { return newSplitMix64(deriveSeed(base, salt)) }
```
```go
// FloatRange returns a float64 in [min, max).
func (r *splitmix64) FloatRange(min, max float64) float64 { return min + r.Float64()*(max-min) }

// IntRange returns an int in [min, max] (inclusive).
func (r *splitmix64) IntRange(min, max int) int {
	return min + int(r.Uint32n(uint32(max-min+1)))
}
```

3d. Add the weighted table and `pickFamily` (before `GenerateFromName`):
```go
var familyTable = []struct {
	name string
	w    int
}{
	{"classic", 22}, {"rose", 18}, {"zinnia", 11}, {"camellia", 10},
	{"lotus", 9}, {"dahlia", 9}, {"sunflower", 8}, {"rhodonea", 7}, {"superformula", 6},
} // sum = 100

func pickFamily(seed uint64) string {
	roll := stream(seed, "family").IntRange(1, 100)
	cum := 0
	for _, f := range familyTable {
		cum += f.w
		if roll <= cum {
			return f.name
		}
	}
	return "classic" // defensive default
}
```

3e. Add per-family builders (each draws every field from its own sub-stream `stream(seed,"<family>.<field>")`; ranges match the contract's PER-FAMILY RANGE TABLE, lines 368-389). Superformula clamps enforce the reconciled guard-rails (m1>=4, n1a/n1b>0):
```go
func buildClassic(seed uint64) *ClassicParams {
	return &ClassicParams{
		Rows:    84,  // fixed
		Cols:    144, // fixed
		PNum:    uint32(stream(seed, "classic.p_num").IntRange(5, 12)),
		FD:      float32(stream(seed, "classic.f_d").FloatRange(150, 230)),
		PLen:    float32(stream(seed, "classic.p_len").FloatRange(40, 80)),
		PSharp:  float32(stream(seed, "classic.p_sharp").FloatRange(0.20, 0.55)),
		FHeight: float32(stream(seed, "classic.f_height").FloatRange(260, 380)),
		Curve1:  float32(stream(seed, "classic.curve1").FloatRange(0.85, 1.35)),
		Curve2:  float32(stream(seed, "classic.curve2").FloatRange(0.15, 0.40)),
		B:       float32(stream(seed, "classic.b").FloatRange(0.8, 1.6)),
		BNum:    uint32(stream(seed, "classic.b_num").IntRange(5, 9)),
	}
}

func buildRose(seed uint64) *RoseParams {
	return &RoseParams{
		Opening:  float32(stream(seed, "rose.opening").FloatRange(2.0, 3.2)),
		VDensity: float32(stream(seed, "rose.v_density").FloatRange(7.5, 11.0)),
		PAlign:   float32(stream(seed, "rose.p_align").FloatRange(2.7, 3.6)),
		Curve1:   float32(stream(seed, "rose.curve1").FloatRange(1.4, 2.0)),
		Curve2:   float32(stream(seed, "rose.curve2").FloatRange(0.9, 1.35)),
	}
}

func buildBloom(seed uint64) *BloomParams {
	return &BloomParams{
		Scale:     float32(stream(seed, "bloom.scale").FloatRange(240, 360)),
		Opening:   float32(stream(seed, "bloom.opening").FloatRange(0.75, 1.30)),
		Density:   float32(stream(seed, "bloom.density").FloatRange(0.80, 1.25)),
		PetalFreq: float32(stream(seed, "bloom.petal_freq").FloatRange(0.85, 1.20)),
		PetalAmp:  float32(stream(seed, "bloom.petal_amp").FloatRange(0.80, 1.25)),
		HangDown:  float32(stream(seed, "bloom.hang_down").FloatRange(0.75, 1.35)),
		Fade:      float32(stream(seed, "bloom.fade").FloatRange(0.85, 1.20)),
		ThetaStep: float32(stream(seed, "bloom.theta_step").FloatRange(0.90, 1.15)),
		RStep:     float32(stream(seed, "bloom.r_step").FloatRange(0.90, 1.15)),
		SatShift:  float32(stream(seed, "bloom.sat_shift").FloatRange(-20, 20)), // HSB units
		BriShift:  float32(stream(seed, "bloom.bri_shift").FloatRange(-15, 15)), // HSB units
	}
}

func buildSunflower(seed uint64) *SunflowerParams {
	return &SunflowerParams{
		Scale:        float32(stream(seed, "sunflower.scale").FloatRange(200, 380)),
		FloretRings:  uint32(stream(seed, "sunflower.floret_rings").IntRange(40, 150)),
		FloretSpokes: uint32(stream(seed, "sunflower.floret_spokes").IntRange(120, 320)),
		DomeHeight:   float32(stream(seed, "sunflower.dome_height").FloatRange(0, 90)),
		DiscRatio:    float32(stream(seed, "sunflower.disc_ratio").FloatRange(0.40, 0.78)),
		RayPetals:    uint32(stream(seed, "sunflower.ray_petals").IntRange(13, 55)),
		RayLength:    float32(stream(seed, "sunflower.ray_length").FloatRange(0.25, 0.75)),
		RayWidth:     float32(stream(seed, "sunflower.ray_width").FloatRange(0.40, 1.20)),
		SeedPacking:  float32(stream(seed, "sunflower.seed_packing").FloatRange(0.70, 1.40)),
		SatShift:     float32(stream(seed, "sunflower.sat_shift").FloatRange(-0.15, 0.15)),
		BriShift:     float32(stream(seed, "sunflower.bri_shift").FloatRange(-0.12, 0.12)),
	}
}

func buildRhodonea(seed uint64) *RhodoneaParams {
	return &RhodoneaParams{
		Radius:        float32(stream(seed, "rhodonea.radius").FloatRange(180, 340)),
		K:             uint32(stream(seed, "rhodonea.k").IntRange(2, 9)), // canonical integer range
		PetalSpan:     float32(stream(seed, "rhodonea.petal_span").FloatRange(0.60, 1.00)),
		WidthProfile:  float32(stream(seed, "rhodonea.width_profile").FloatRange(0.20, 0.70)),
		HeightProfile: float32(stream(seed, "rhodonea.height_profile").FloatRange(0, 120)),
		Thickness:     float32(stream(seed, "rhodonea.thickness").FloatRange(0, 18)),
		Curl:          float32(stream(seed, "rhodonea.curl").FloatRange(0, 1)),
		LengthSeg:     uint32(stream(seed, "rhodonea.length_seg").IntRange(12, 48)),
		WidthSeg:      uint32(stream(seed, "rhodonea.width_seg").IntRange(8, 32)),
		SatShift:      float32(stream(seed, "rhodonea.sat_shift").FloatRange(-0.15, 0.15)),
		BriShift:      float32(stream(seed, "rhodonea.bri_shift").FloatRange(-0.12, 0.12)),
	}
}

func buildSuperformula(seed uint64) *SuperformulaParams {
	return &SuperformulaParams{
		Scale: float32(stream(seed, "superformula.scale").FloatRange(200, 360)),
		M1:    float32(stream(seed, "superformula.m1").FloatRange(4, 12)), // >=4 for lobes
		N1a:   float32(stream(seed, "superformula.n1a").FloatRange(0.30, 1.20)), // >0
		N2a:   float32(stream(seed, "superformula.n2a").FloatRange(0.40, 1.80)),
		N3a:   float32(stream(seed, "superformula.n3a").FloatRange(0.40, 1.80)),
		A1:    float32(stream(seed, "superformula.a1").FloatRange(0.85, 1.15)),
		B1:    float32(stream(seed, "superformula.b1").FloatRange(0.85, 1.15)),
		M2:    float32(stream(seed, "superformula.m2").FloatRange(1, 6)),
		N1b:   float32(stream(seed, "superformula.n1b").FloatRange(0.60, 1.60)), // >0
		N2b:   float32(stream(seed, "superformula.n2b").FloatRange(0.60, 1.60)),
		N3b:   float32(stream(seed, "superformula.n3b").FloatRange(0.60, 1.60)),
		A2:    float32(stream(seed, "superformula.a2").FloatRange(0.85, 1.15)),
		B2:    float32(stream(seed, "superformula.b2").FloatRange(0.85, 1.15)),
		USeg:  uint32(stream(seed, "superformula.u_seg").IntRange(120, 340)),
		VSeg:  uint32(stream(seed, "superformula.v_seg").IntRange(80, 200)),
		SatShift: float32(stream(seed, "superformula.sat_shift").FloatRange(-0.15, 0.15)),
		BriShift: float32(stream(seed, "superformula.bri_shift").FloatRange(-0.12, 0.12)),
	}
}
```

3f. Add `legacyPetalCount` and rewrite `GenerateFromName` (replace current lines 29-54). All v1 scalars use independent salted sub-streams so a draw-order change in the shape builders never perturbs them:
```go
// legacyPetalCount derives a v1-compatible petal count roughly matching the
// chosen family, always >= 3, for the toTechniqueParams fallback path.
func legacyPetalCount(seed uint64, family string) uint32 {
	r := stream(seed, "legacy.petal_count")
	switch family {
	case "rose", "camellia", "dahlia":
		return uint32(r.IntRange(12, 20))
	case "sunflower":
		return uint32(r.IntRange(13, 34))
	case "rhodonea", "superformula":
		return uint32(r.IntRange(4, 12))
	default: // classic, zinnia, lotus
		return uint32(r.IntRange(5, 12))
	}
}

func GenerateFromName(name string) Params {
	norm := normalizeName(name)
	seed := seedFromString(norm)

	family := pickFamily(seed)
	palette := buildPalette(seed)

	p := Params{
		AlgoVersion:   AlgoVersion,
		SchemaVersion: SchemaVersion,
		Seed:          seed,
		// v1 scalars — decorrelated sub-streams, always populated.
		PetalCount:  legacyPetalCount(seed, family),
		PetalLength: float32(stream(seed, "legacy.plen").FloatRange(0.4, 1.6)),
		PetalWidth:  float32(stream(seed, "legacy.pwidth").FloatRange(0.15, 0.75)),
		Curvature:   float32(stream(seed, "legacy.curv").FloatRange(-0.8, 0.8)),
		StemHeight:  float32(stream(seed, "legacy.stem").FloatRange(0.5, 2.5)),
		Hue:         float32(math.Mod(stream(seed, "hue").Float64()*360.0, 360.0)),
		// v2
		Family:  family,
		Palette: palette,
	}

	switch family {
	case "classic":
		p.Classic = buildClassic(seed)
	case "rose":
		p.Rose = buildRose(seed)
	case "zinnia", "camellia", "lotus", "dahlia":
		p.Bloom = buildBloom(seed)
	case "sunflower":
		p.Sunflower = buildSunflower(seed)
	case "rhodonea":
		p.Rhodonea = buildRhodonea(seed)
	case "superformula":
		p.Superformula = buildSuperformula(seed)
	default:
		p.Family = "classic"
		p.Classic = buildClassic(seed)
	}

	return p
}
```
Leave `normalizeName`, `seedFromString`, `splitmix64`, `newSplitMix64`, `next`, `Uint32n`, `Float64` exactly as they are. Confirm the imports block still uses `crypto/sha256`, `encoding/binary`, `math`, `strings`, `unicode` — all remain in use (`sha256.New`/`binary.LittleEndian` in `deriveSeed`; `math.Mod` in `GenerateFromName`).

- [ ] **Step 4: Run it, expect PASS** — run:
```
docker run --rm -v "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/flower-backend":/src -w /src golang:1.25-alpine go test ./internal/flower/... -count=1 -v
```
Expected: `ok  flower-backend/internal/flower` with every `Test...` above `--- PASS`. If `buildPalette` is not yet implemented in `palette.go`, this fails to compile with `undefined: buildPalette` — that is the declared dependency; complete the palette task first.

- [ ] **Step 5: Commit** — run:
```
git -C "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel" add flower-backend/internal/flower/generator.go flower-backend/internal/flower/generator_test.go
git -C "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel" commit -m "feat(generator): v2 decorrelated draws, weighted family, per-family builders

Bump AlgoVersion/SchemaVersion to v2. Add deriveSeed/stream sub-stream
helpers and FloatRange/IntRange on splitmix64. Add weighted pickFamily,
per-family build* functions with canonical range tables, and v2 Params
struct. GenerateFromName emits family + palette + oneof shape while still
populating the 6 v1 scalars (toTechniqueParams fallback). splitmix64,
seedFromString, normalizeName unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Notes for the assembler / implementer:**
- `ColorStop` and `PaletteSpec` (contract lines 221-234) belong to the palette task's `palette.go`; this task references but does not declare them. If task ordering puts this before palette, either land palette first (recommended — it is a stated dependency) or add a temporary `buildPalette` stub as noted in Step 2 and remove it when palette lands.
- Range tables are transcribed verbatim from contract lines 368-389; the two reconciliations that shape the guard-rail tests are #7 (bloom `sat_shift`/`bri_shift` are HSB units `FR(-20,20)`/`FR(-15,15)`, all other families' shifts are fractions) and #13 (decorrelated `deriveSeed`/`stream` + weighted `familyTable`, not `seed % N`).
- `store.go` needs no change: `flowers.params` is jsonb and the added struct fields carry snake_case JSON tags matching the proto field names, so marshal/unmarshal round-trips without a migration (contract line 556).

Relevant absolute paths:
- Plan/contract: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/docs/superpowers/plans/2026-07-02-phase2-richer-generation.md`
- Modify: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/flower-backend/internal/flower/generator.go`
- New test: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/flower-backend/internal/flower/generator_test.go`

---

### Task 4: Go struct→proto mapper — `toProtoParams` shared by CreateFlower + GetFlower

**Files:**
- Modify: `flower-backend/internal/api/grpc/flower_server.go` — replace the inline `&flowerv1.FlowerParams{...}` literal in `CreateFlower` (currently lines 56-66) and in `GetFlower` (currently lines 84-94) with calls to a new shared `toProtoParams`; add the `toProtoParams` function and per-family oneof helpers.
- Test: `flower-backend/internal/api/grpc/flower_server_test.go` (NEW)

**Interfaces:**
- Consumes (from the generator v2 task): `flower.GenerateFromName(name string) flower.Params` and the v2 `flower.Params` fields — `Family string`, `Palette *flower.PaletteSpec`, `Classic *flower.ClassicParams`, `Rose *flower.RoseParams`, `Bloom *flower.BloomParams`, `Sunflower *flower.SunflowerParams`, `Rhodonea *flower.RhodoneaParams`, `Superformula *flower.SuperformulaParams`; plus the 6 v1 scalars `PetalCount uint32, PetalLength/PetalWidth/Curvature/StemHeight/Hue float32`, `AlgoVersion/SchemaVersion string`, `Seed uint64`. `flower.ColorStop{Position,R,G,B float32; Hex string}`.
- Consumes (from the codegen task): regenerated `flowerv1` types — `flowerv1.FlowerParams` with fields `Family string`, `Palette *flowerv1.PaletteSpec`, oneof wrapper field `Shape` set to one of `*flowerv1.FlowerParams_Classic{Classic: *flowerv1.ClassicParams}`, `_Rose{Rose:*RoseParams}`, `_Bloom{Bloom:*BloomParams}`, `_Sunflower{Sunflower:*SunflowerParams}`, `_Rhodonea{Rhodonea:*RhodoneaParams}`, `_Superformula{Superformula:*SuperformulaParams}`; and `flowerv1.ColorStop`, `flowerv1.PaletteSpec`. (protoc-gen-go names: `FlowerParams_Classic`…`FlowerParams_Superformula` — confirm against the committed `gen/go/flower/v1/service.pb.go` after codegen; the mapper uses these exact names.)
- Produces: `func toProtoParams(p flower.Params) *flowerv1.FlowerParams` in package `grpcapi`, called by both `CreateFlower` and `GetFlower`. Store consumes `FlowerRow.Params flower.Params` (jsonb) unchanged.

- [ ] **Step 1: Write the failing test** — create `flower-backend/internal/api/grpc/flower_server_test.go`:

```go
package grpcapi

import (
	"testing"

	flowerv1 "flower-backend/gen/go/flower/v1"
	"flower-backend/internal/flower"
)

// toProtoParams must map v1 scalars, family, a non-nil palette with >=2 stops,
// and EXACTLY the oneof case matching Params.Family.
func TestToProtoParamsScalarsFamilyPalette(t *testing.T) {
	p := flower.GenerateFromName("Ada Lovelace")
	got := toProtoParams(p)

	if got == nil {
		t.Fatal("toProtoParams returned nil")
	}
	// v1 scalars 1-9 must always be populated (back-compat).
	if got.GetAlgoVersion() != p.AlgoVersion {
		t.Errorf("AlgoVersion = %q, want %q", got.GetAlgoVersion(), p.AlgoVersion)
	}
	if got.GetSchemaVersion() != p.SchemaVersion {
		t.Errorf("SchemaVersion = %q, want %q", got.GetSchemaVersion(), p.SchemaVersion)
	}
	if got.GetSeed() != p.Seed {
		t.Errorf("Seed = %d, want %d", got.GetSeed(), p.Seed)
	}
	if got.GetPetalCount() != p.PetalCount {
		t.Errorf("PetalCount = %d, want %d", got.GetPetalCount(), p.PetalCount)
	}
	if got.GetPetalLength() != p.PetalLength || got.GetPetalWidth() != p.PetalWidth ||
		got.GetCurvature() != p.Curvature || got.GetStemHeight() != p.StemHeight ||
		got.GetHue() != p.Hue {
		t.Errorf("v1 scalar mismatch: got L=%v W=%v C=%v S=%v H=%v",
			got.GetPetalLength(), got.GetPetalWidth(), got.GetCurvature(),
			got.GetStemHeight(), got.GetHue())
	}
	// family echoes Params.Family.
	if got.GetFamily() != p.Family {
		t.Errorf("Family = %q, want %q", got.GetFamily(), p.Family)
	}
	// palette non-nil with >=2 stops.
	pal := got.GetPalette()
	if pal == nil {
		t.Fatal("Palette is nil, want non-nil")
	}
	if len(pal.GetStops()) < 2 {
		t.Errorf("Palette has %d stops, want >=2", len(pal.GetStops()))
	}
	if pal.GetId() != p.Palette.ID {
		t.Errorf("Palette.Id = %q, want %q", pal.GetId(), p.Palette.ID)
	}
}

// For several representative names, exactly the oneof case matching Family is set.
func TestToProtoParamsOneofMatchesFamily(t *testing.T) {
	// These names are illustrative; the test asserts the invariant regardless of
	// which family each name happens to hash to.
	for _, name := range []string{"Ada Lovelace", "Grace Hopper", "こんにちは", "Zoë", "a"} {
		p := flower.GenerateFromName(name)
		got := toProtoParams(p)
		assertOneofMatchesFamily(t, name, p.Family, got)
	}
}

func assertOneofMatchesFamily(t *testing.T, name, family string, got *flowerv1.FlowerParams) {
	t.Helper()
	set := 0
	check := func(cond bool) {
		if cond {
			set++
		}
	}
	check(got.GetClassic() != nil)
	check(got.GetRose() != nil)
	check(got.GetBloom() != nil)
	check(got.GetSunflower() != nil)
	check(got.GetRhodonea() != nil)
	check(got.GetSuperformula() != nil)
	if set != 1 {
		t.Fatalf("name %q family %q: %d oneof cases set, want exactly 1", name, family, set)
	}

	switch family {
	case "classic":
		if got.GetClassic() == nil {
			t.Errorf("name %q family %q: Classic case not set", name, family)
		}
	case "rose":
		if got.GetRose() == nil {
			t.Errorf("name %q family %q: Rose case not set", name, family)
		}
	case "zinnia", "camellia", "lotus", "dahlia":
		if got.GetBloom() == nil {
			t.Errorf("name %q family %q: Bloom case not set", name, family)
		}
	case "sunflower":
		if got.GetSunflower() == nil {
			t.Errorf("name %q family %q: Sunflower case not set", name, family)
		}
	case "rhodonea":
		if got.GetRhodonea() == nil {
			t.Errorf("name %q family %q: Rhodonea case not set", name, family)
		}
	case "superformula":
		if got.GetSuperformula() == nil {
			t.Errorf("name %q family %q: Superformula case not set", name, family)
		}
	default:
		t.Fatalf("name %q: unexpected family %q", name, family)
	}
}
```

- [ ] **Step 2: Run it, expect FAIL** — `toProtoParams` does not exist yet, so the package fails to compile:
```
docker run --rm -v "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/flower-backend":/src -w /src golang:1.25-alpine go test ./internal/api/grpc/... -run ToProtoParams -count=1
```
Expected output contains (compile error):
```
./flower_server_test.go:XX:XX: undefined: toProtoParams
FAIL	flower-backend/internal/api/grpc [build failed]
```

- [ ] **Step 3: Implement** — add `toProtoParams` plus the family→oneof helper to `flower_server.go`, and rewrite both call sites to use it.

Add the imports/helpers at the end of `flower_server.go` (package `grpcapi`, `flowerv1` is already imported at line 7, `flower` at line 9):

```go
// toProtoParams maps the generator's flower.Params onto the wire FlowerParams:
// the 6 v1 scalars (fields 1-9, always populated for back-compat), family (10),
// the baked palette (11), and the single oneof shape case matching p.Family (12-17).
func toProtoParams(p flower.Params) *flowerv1.FlowerParams {
	out := &flowerv1.FlowerParams{
		AlgoVersion:   p.AlgoVersion,
		SchemaVersion: p.SchemaVersion,
		Seed:          p.Seed,
		PetalCount:    p.PetalCount,
		PetalLength:   p.PetalLength,
		PetalWidth:    p.PetalWidth,
		Curvature:     p.Curvature,
		StemHeight:    p.StemHeight,
		Hue:           p.Hue,
		Family:        p.Family,
		Palette:       toProtoPalette(p.Palette),
	}
	setProtoShape(out, p)
	return out
}

func toProtoPalette(pal *flower.PaletteSpec) *flowerv1.PaletteSpec {
	if pal == nil {
		return nil
	}
	stops := make([]*flowerv1.ColorStop, 0, len(pal.Stops))
	for _, s := range pal.Stops {
		stops = append(stops, &flowerv1.ColorStop{
			Position: s.Position,
			Hex:      s.Hex,
			R:        s.R,
			G:        s.G,
			B:        s.B,
		})
	}
	return &flowerv1.PaletteSpec{
		Id:       pal.ID,
		Stops:    stops,
		HueShift: pal.HueShift,
		SatShift: pal.SatShift,
		BriShift: pal.BriShift,
	}
}

// setProtoShape sets exactly one oneof case on out, driven by p's populated
// per-family pointer (which the generator sets consistently with p.Family).
func setProtoShape(out *flowerv1.FlowerParams, p flower.Params) {
	switch {
	case p.Classic != nil:
		out.Shape = &flowerv1.FlowerParams_Classic{Classic: &flowerv1.ClassicParams{
			Rows:    p.Classic.Rows,
			Cols:    p.Classic.Cols,
			PNum:    p.Classic.PNum,
			FD:      p.Classic.FD,
			PLen:    p.Classic.PLen,
			PSharp:  p.Classic.PSharp,
			FHeight: p.Classic.FHeight,
			Curve1:  p.Classic.Curve1,
			Curve2:  p.Classic.Curve2,
			B:       p.Classic.B,
			BNum:    p.Classic.BNum,
		}}
	case p.Rose != nil:
		out.Shape = &flowerv1.FlowerParams_Rose{Rose: &flowerv1.RoseParams{
			Opening:  p.Rose.Opening,
			VDensity: p.Rose.VDensity,
			PAlign:   p.Rose.PAlign,
			Curve1:   p.Rose.Curve1,
			Curve2:   p.Rose.Curve2,
		}}
	case p.Bloom != nil:
		out.Shape = &flowerv1.FlowerParams_Bloom{Bloom: &flowerv1.BloomParams{
			Scale:     p.Bloom.Scale,
			Opening:   p.Bloom.Opening,
			Density:   p.Bloom.Density,
			PetalFreq: p.Bloom.PetalFreq,
			PetalAmp:  p.Bloom.PetalAmp,
			HangDown:  p.Bloom.HangDown,
			Fade:      p.Bloom.Fade,
			ThetaStep: p.Bloom.ThetaStep,
			RStep:     p.Bloom.RStep,
			SatShift:  p.Bloom.SatShift,
			BriShift:  p.Bloom.BriShift,
		}}
	case p.Sunflower != nil:
		out.Shape = &flowerv1.FlowerParams_Sunflower{Sunflower: &flowerv1.SunflowerParams{
			Scale:        p.Sunflower.Scale,
			FloretRings:  p.Sunflower.FloretRings,
			FloretSpokes: p.Sunflower.FloretSpokes,
			DomeHeight:   p.Sunflower.DomeHeight,
			DiscRatio:    p.Sunflower.DiscRatio,
			RayPetals:    p.Sunflower.RayPetals,
			RayLength:    p.Sunflower.RayLength,
			RayWidth:     p.Sunflower.RayWidth,
			SeedPacking:  p.Sunflower.SeedPacking,
			SatShift:     p.Sunflower.SatShift,
			BriShift:     p.Sunflower.BriShift,
		}}
	case p.Rhodonea != nil:
		out.Shape = &flowerv1.FlowerParams_Rhodonea{Rhodonea: &flowerv1.RhodoneaParams{
			Radius:        p.Rhodonea.Radius,
			K:             p.Rhodonea.K,
			PetalSpan:     p.Rhodonea.PetalSpan,
			WidthProfile:  p.Rhodonea.WidthProfile,
			HeightProfile: p.Rhodonea.HeightProfile,
			Thickness:     p.Rhodonea.Thickness,
			Curl:          p.Rhodonea.Curl,
			LengthSeg:     p.Rhodonea.LengthSeg,
			WidthSeg:      p.Rhodonea.WidthSeg,
			SatShift:      p.Rhodonea.SatShift,
			BriShift:      p.Rhodonea.BriShift,
		}}
	case p.Superformula != nil:
		out.Shape = &flowerv1.FlowerParams_Superformula{Superformula: &flowerv1.SuperformulaParams{
			Scale: p.Superformula.Scale,
			M1:    p.Superformula.M1,
			N1A:   p.Superformula.N1a,
			N2A:   p.Superformula.N2a,
			N3A:   p.Superformula.N3a,
			A1:    p.Superformula.A1,
			B1:    p.Superformula.B1,
			M2:    p.Superformula.M2,
			N1B:   p.Superformula.N1b,
			N2B:   p.Superformula.N2b,
			N3B:   p.Superformula.N3b,
			A2:    p.Superformula.A2,
			B2:    p.Superformula.B2,
			USeg:  p.Superformula.USeg,
			VSeg:  p.Superformula.VSeg,
			SatShift: p.Superformula.SatShift,
			BriShift: p.Superformula.BriShift,
		}}
	}
}
```

> NOTE — verify generated Go field names against the committed `gen/go/flower/v1/service.pb.go` right after the codegen task: protoc-gen-go upper-cases initialisms, so proto `n1a`→Go `N1A`, `n1b`→`N1B`, `f_d`→`FD`, `p_num`→`PNum`, `p_len`→`PLen`, `p_sharp`→`PSharp`, `f_height`→`FHeight`, `b_num`→`BNum`, `id`→`Id`, `r_step`→`RStep`, `v_density`→`VDensity`, `p_align`→`PAlign`. If any generated name differs, match the generated stub exactly (it is the source of truth) and adjust these literals.

Then replace the `CreateFlower` return literal (current lines 54-67):

```go
	return &flowerv1.CreateFlowerResponse{
		FlowerId: flowerID,
		Params:   toProtoParams(p),
	}, nil
```

And replace the `GetFlower` return literal (current lines 82-95):

```go
	return &flowerv1.GetFlowerResponse{
		FlowerId: f.FlowerID,
		Params:   toProtoParams(f.Params),
	}, nil
```

`store.go` is unchanged — jsonb `json.Marshal`/`json.Unmarshal` round-trips the new `flower.Params` v2 fields automatically (no DB migration).

- [ ] **Step 4: Run it, expect PASS**:
```
docker run --rm -v "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/flower-backend":/src -w /src golang:1.25-alpine go test ./internal/api/grpc/... -run ToProtoParams -count=1
```
Expected: `ok  	flower-backend/internal/api/grpc`. Then run the whole package to confirm no regression in the existing gRPC tests:
```
docker run --rm -v "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/flower-backend":/src -w /src golang:1.25-alpine go test ./... -count=1
```
Expected: all packages `ok`.

- [ ] **Step 5: Commit**:
```
git add flower-backend/internal/api/grpc/flower_server.go flower-backend/internal/api/grpc/flower_server_test.go
git commit -m "$(cat <<'EOF'
feat(grpc): map v2 flower.Params to proto via shared toProtoParams

Add toProtoParams(flower.Params) *flowerv1.FlowerParams mapping the 6 v1
scalars, family, baked palette, and the matching oneof shape case; use it
in both CreateFlower and GetFlower (replacing inline literals). store.go
unchanged (jsonb round-trips new fields).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

Key file paths for the caller:
- Mapper + call sites: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/flower-backend/internal/api/grpc/flower_server.go` (CreateFlower literal at lines 54-67, GetFlower literal at lines 82-95)
- New test: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/flower-backend/internal/api/grpc/flower_server_test.go`
- Unchanged: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/flower-backend/internal/api/grpc/store.go` (`FlowerRow.Params flower.Params`, jsonb)

Dependencies: this task requires the generator-v2 task (populates `flower.Params.Family/Palette/Classic/.../Superformula`) and the proto+codegen task (emits `flowerv1.FlowerParams_*` oneof wrappers and the new messages) to land first. The generated Go field-name caveat in the Step 3 NOTE must be reconciled against the committed `gen/go/flower/v1/service.pb.go`.

---

### Task 5: Frontend palette sampling, v2 guard, and v2 type additions

**Files:**
- Create: `petal-pixel-studio/src/math/palette.ts` (NEW — `PaletteStop`, `Palette`, `samplePalette`, `samplePaletteInto`)
- Create: `petal-pixel-studio/src/math/flowerVersion.ts` (NEW — `isV2`)
- Modify: `petal-pixel-studio/src/math/flowerTypes.ts` (add `V2_FAMILIES`/`FlowerFamily`; `SunflowerParams`/`RhodoneaParams`/`SuperformulaParams` interfaces; add optional `palette?` to existing `ClassicParams` @ lines 6-18, `RoseParams` @ lines 20-26, `BloomParams` @ lines 28-40; add `import type { Palette } from "@/math/palette"` at top)
- Test: `petal-pixel-studio/src/math/palette.test.ts` (NEW)
- Test: `petal-pixel-studio/src/math/flowerVersion.test.ts` (NEW)

**Interfaces:**
- Consumes: `three` (`THREE.Color`, `.lerp`, `.getHexString`); the canonical proto `ColorStop{position,hex,r,g,b}` mapping (only `position`→`pos` and `hex` are read by TS); `FlowerParams` from `@/stores/flowerStore` (has `algoVersion: string`; the optional `family?: FlowerFamily` field is added by the flowerStore task — `isV2` only reads `algoVersion` and `family`, so it is typed against `Pick<FlowerParams,"algoVersion"|"family">` and the test constructs that shape inline, decoupling it from store landing order).
- Produces (later tasks in `flowerGeometry.ts`, `flowers/*.ts`, `Flower3D.tsx`, `flowerStore.ts` rely on these EXACT names):
  - `interface PaletteStop { pos: number; hex: string }`
  - `interface Palette { id: string; stops: PaletteStop[] }`
  - `function samplePalette(stops: PaletteStop[], t: number): THREE.Color`
  - `function samplePaletteInto(stops: PaletteStop[], t: number, target: THREE.Color): THREE.Color`
  - `function isV2(p: Pick<FlowerParams,"algoVersion"|"family">): boolean`
  - `const V2_FAMILIES` (9-entry) and `type FlowerFamily = (typeof V2_FAMILIES)[number]`
  - `interface SunflowerParams`, `interface RhodoneaParams`, `interface SuperformulaParams`
  - `ClassicParams.palette?`, `RoseParams.palette?`, `BloomParams.palette?`

Note: `THREE.Color` in `three@0.160` stores r/g/b in **linear** space (`new THREE.Color("#ff0000").r === 1`; `#ff0000`.lerp(`#0000ff`, 0.5) → `r=0.5, g=0, b=0.5`, `getHexString()==="bc00bc"`). Assertions below are written against that verified behavior.

- [ ] **Step 1: Write the failing test** — create `petal-pixel-studio/src/math/palette.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { samplePalette, samplePaletteInto, type PaletteStop } from "@/math/palette";

const STOPS: PaletteStop[] = [
  { pos: 0, hex: "#ff0000" },
  { pos: 0.5, hex: "#00ff00" },
  { pos: 1, hex: "#0000ff" },
];

describe("samplePalette", () => {
  it("returns the first stop color at t=0", () => {
    const c = samplePalette(STOPS, 0);
    expect(c.getHexString()).toBe("ff0000");
  });

  it("returns the last stop color at t=1", () => {
    const c = samplePalette(STOPS, 1);
    expect(c.getHexString()).toBe("0000ff");
  });

  it("returns an exact interior stop color when t lands on it", () => {
    const c = samplePalette(STOPS, 0.5);
    expect(c.getHexString()).toBe("00ff00");
  });

  it("linearly interpolates within a segment (midpoint of stop 0 and 1)", () => {
    // t=0.25 is the midpoint of segment [0, 0.5]; local = 0.5.
    // #ff0000 -> #00ff00 lerp at 0.5 in THREE linear space => r=0.5,g=0.5,b=0.
    const c = samplePalette(STOPS, 0.25);
    expect(c.r).toBeCloseTo(0.5, 5);
    expect(c.g).toBeCloseTo(0.5, 5);
    expect(c.b).toBeCloseTo(0, 5);
  });

  it("clamps t below 0 to the first stop", () => {
    const c = samplePalette(STOPS, -3);
    expect(c.getHexString()).toBe("ff0000");
  });

  it("clamps t above 1 to the last stop", () => {
    const c = samplePalette(STOPS, 2.5);
    expect(c.getHexString()).toBe("0000ff");
  });

  it("returns a NEW color instance each call (no shared mutation)", () => {
    const a = samplePalette(STOPS, 0.2);
    const b = samplePalette(STOPS, 0.8);
    expect(a).not.toBe(b);
    expect(a.getHexString()).not.toBe(b.getHexString());
  });

  it("handles a two-stop palette across the full range", () => {
    const two: PaletteStop[] = [
      { pos: 0, hex: "#000000" },
      { pos: 1, hex: "#ffffff" },
    ];
    expect(samplePalette(two, 0).getHexString()).toBe("000000");
    expect(samplePalette(two, 1).getHexString()).toBe("ffffff");
    const mid = samplePalette(two, 0.5);
    expect(mid.r).toBeCloseTo(0.5, 5);
  });

  it("returns the high-stop color for a zero-width segment (duplicate pos)", () => {
    const dup: PaletteStop[] = [
      { pos: 0, hex: "#ff0000" },
      { pos: 0.5, hex: "#111111" },
      { pos: 0.5, hex: "#00ff00" },
      { pos: 1, hex: "#0000ff" },
    ];
    // At exactly the duplicate boundary the segment [0.5,0.5] has zero width;
    // implementation returns the high stop's color.
    expect(samplePalette(dup, 0.5).getHexString()).toBe("00ff00");
  });
});

describe("samplePaletteInto", () => {
  it("writes into the provided target and returns it (no allocation)", () => {
    const target = new THREE.Color();
    const ret = samplePaletteInto(STOPS, 1, target);
    expect(ret).toBe(target);
    expect(target.getHexString()).toBe("0000ff");
  });

  it("produces the same result as samplePalette for an interior t", () => {
    const target = new THREE.Color();
    samplePaletteInto(STOPS, 0.25, target);
    const expected = samplePalette(STOPS, 0.25);
    expect(target.r).toBeCloseTo(expected.r, 6);
    expect(target.g).toBeCloseTo(expected.g, 6);
    expect(target.b).toBeCloseTo(expected.b, 6);
  });
});
```

Also create `petal-pixel-studio/src/math/flowerVersion.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isV2 } from "@/math/flowerVersion";

describe("isV2", () => {
  it("is true only when algoVersion is 'v2' AND family is set", () => {
    expect(isV2({ algoVersion: "v2", family: "sunflower" })).toBe(true);
    expect(isV2({ algoVersion: "v2", family: "classic" })).toBe(true);
  });

  it("is false for a v1 record (no family)", () => {
    expect(isV2({ algoVersion: "v1", family: undefined })).toBe(false);
  });

  it("is false when algoVersion is v2 but family is missing (conjunctive guard)", () => {
    expect(isV2({ algoVersion: "v2", family: undefined })).toBe(false);
  });

  it("is false when family is set but algoVersion is not v2", () => {
    expect(isV2({ algoVersion: "v1", family: "rose" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** —
```
cd petal-pixel-studio && npx vitest run src/math/palette.test.ts src/math/flowerVersion.test.ts
```
Expected: both files fail to resolve — `Failed to resolve import "@/math/palette"` and `"@/math/flowerVersion"` (modules do not exist yet), reported as failed test files.

- [ ] **Step 3: Implement** — create `petal-pixel-studio/src/math/palette.ts`:

```ts
import * as THREE from "three";

export interface PaletteStop {
  /** 0..1 (proto ColorStop.position); backend guarantees ascending, first=0 last=1. */
  pos: number;
  /** "#rrggbb" (proto ColorStop.hex); already HSB-shift-baked by the backend. */
  hex: string;
}

export interface Palette {
  /** proto PaletteSpec.id */
  id: string;
  /** proto PaletteSpec.stops (>= 2) */
  stops: PaletteStop[];
}

/**
 * Sample the gradient at t in [0,1]. Clamps t. Linear lerp via THREE.Color.
 * Returns a NEW THREE.Color.
 */
export function samplePalette(stops: PaletteStop[], t: number): THREE.Color {
  return samplePaletteInto(stops, t, new THREE.Color());
}

/**
 * Hot-loop variant: writes the sampled color into `target` and returns it,
 * avoiding a per-vertex allocation.
 */
export function samplePaletteInto(
  stops: PaletteStop[],
  t: number,
  target: THREE.Color,
): THREE.Color {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  // Find the segment [lo, hi] with lo.pos <= clamped <= hi.pos.
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (clamped >= stops[i].pos && clamped <= stops[i + 1].pos) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const span = hi.pos - lo.pos;
  if (span <= 0) {
    return target.set(hi.hex);
  }
  const local = (clamped - lo.pos) / span;
  target.set(lo.hex);
  return target.lerp(new THREE.Color(hi.hex), local);
}
```

Create `petal-pixel-studio/src/math/flowerVersion.ts`:

```ts
import type { FlowerParams } from "@/stores/flowerStore";

/**
 * Conjunctive v2 guard: a record renders via the v2 path only when the backend
 * bumped algoVersion to "v2" AND supplied a family selector. v1 records (and any
 * partial/legacy record missing family) fall through to the untouched v1 path.
 */
export function isV2(p: Pick<FlowerParams, "algoVersion" | "family">): boolean {
  return p.algoVersion === "v2" && p.family != null;
}
```

Modify `petal-pixel-studio/src/math/flowerTypes.ts` — add the import at the very top (before line 1):

```ts
import type { Palette } from "@/math/palette";
```

Then add `V2_FAMILIES`/`FlowerFamily` and the three new interfaces (place after the existing `BLOOM_TYPES` line 4, or anywhere top-level — canonical field order below):

```ts
export const V2_FAMILIES = [
  "classic",
  "rose",
  "zinnia",
  "camellia",
  "lotus",
  "dahlia",
  "sunflower",
  "rhodonea",
  "superformula",
] as const;
export type FlowerFamily = (typeof V2_FAMILIES)[number];

export interface SunflowerParams {
  scale: number;
  floretRings: number;
  floretSpokes: number;
  domeHeight: number;
  discRatio: number;
  rayPetals: number;
  rayLength: number;
  rayWidth: number;
  seedPacking: number;
  satShift: number;
  briShift: number;
}

export interface RhodoneaParams {
  radius: number;
  k: number;
  petalSpan: number;
  widthProfile: number;
  heightProfile: number;
  thickness: number;
  curl: number;
  lengthSeg: number;
  widthSeg: number;
  satShift: number;
  briShift: number;
}

export interface SuperformulaParams {
  scale: number;
  m1: number;
  n1a: number;
  n2a: number;
  n3a: number;
  a1: number;
  b1: number;
  m2: number;
  n1b: number;
  n2b: number;
  n3b: number;
  a2: number;
  b2: number;
  uSeg: number;
  vSeg: number;
  satShift: number;
  briShift: number;
}
```

Add the optional `palette?` field to each existing interface (additive; v1 leaves it undefined). In `ClassicParams` (after line 17 `bNum: number;`), in `RoseParams` (after line 25 `curve2: number;`), and in `BloomParams` (after line 39 `briShift: number;`), insert:

```ts
  palette?: Palette;
```

- [ ] **Step 4: Run it, expect PASS** —
```
cd petal-pixel-studio && npx vitest run src/math/palette.test.ts src/math/flowerVersion.test.ts
```
Expected: both files pass (13 tests: 11 in palette.test.ts, 4 in flowerVersion.test.ts). Also confirm no type regression on the touched module:
```
cd petal-pixel-studio && npx tsc -p tsconfig.app.json --noEmit
```
Expected: exit 0 (the `Pick<FlowerParams,"algoVersion"|"family">` typing tolerates `family` being absent from the store interface — `Pick` of a non-existent key would error, so if the flowerStore `family?` field has not yet landed, temporarily type the arg as `{ algoVersion: string; family?: string | null }` and note it; the store task later widens `FlowerParams` and the `Pick` form becomes valid).

- [ ] **Step 5: Commit** —
```
git add petal-pixel-studio/src/math/palette.ts \
        petal-pixel-studio/src/math/palette.test.ts \
        petal-pixel-studio/src/math/flowerVersion.ts \
        petal-pixel-studio/src/math/flowerVersion.test.ts \
        petal-pixel-studio/src/math/flowerTypes.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add palette sampling, v2 guard, and v2 param types

Add samplePalette/samplePaletteInto over PaletteStop{pos,hex}, isV2
conjunctive guard, V2_FAMILIES/FlowerFamily, and Sunflower/Rhodonea/
Superformula param interfaces matching the canonical proto; thread
optional palette? onto Classic/Rose/Bloom params. Additive only;
toTechniqueParams and FLOWER_TYPES untouched.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

Notes for the assembler / downstream tasks (not part of the task body):
- Files touched/created (absolute): `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/math/palette.ts`, `.../src/math/palette.test.ts`, `.../src/math/flowerVersion.ts`, `.../src/math/flowerVersion.test.ts`, `.../src/math/flowerTypes.ts`.
- `isV2` imports `FlowerParams` from `@/stores/flowerStore`; that interface currently (`flowerStore.ts:18-43`) lacks `family`, so this task's `tsc` clean pass depends on the flowerStore task adding `family?: FlowerFamily` OR the fallback inline arg type noted in Step 4. The unit test itself is decoupled (constructs the `Pick` shape inline).
- `THREE.Color` linear-space r/g/b was empirically verified in `three@0.160`; all numeric assertions use `getHexString()` or `toBeCloseTo` against that behavior, so they are not brittle to sRGB-vs-linear surprises.
- `toTechniqueParams`, `pickFlowerTypeFromSeed`, `FLOWER_TYPES`, and the 6 v1 scalars are untouched by this task — back-compat preserved.

---

### Task 6: sunflower.ts — phyllotaxis domed disc + ray-petal rim (v2, 3D)

**Files:**
- Create: `petal-pixel-studio/src/math/flowers/sunflower.ts` (NEW; sibling of `bloom.ts`)
- Test: `petal-pixel-studio/src/math/flowers/sunflower.test.ts` (NEW; mirrors `classic.test.ts` min-triangle-area helper + `bloom.test.ts` vertex-count helper)

**Interfaces:**
- Consumes (from earlier tasks / canonical contract — must already exist before this task; if a peer task has not landed them, add the exact snippets below to the named file as part of Step 3):
  - `SunflowerParams` from `@/math/flowerTypes` (canonical, plan lines 434-438): `{ scale: number; floretRings: number; floretSpokes: number; domeHeight: number; discRatio: number; rayPetals: number; rayLength: number; rayWidth: number; seedPacking: number; satShift: number; briShift: number }`
  - `Palette` / `PaletteStop` + `samplePaletteInto(stops: PaletteStop[], t: number, target: THREE.Color): THREE.Color` from `@/math/palette` (canonical, plan lines 404-419). Palette is `{ id: string; stops: PaletteStop[] }`; `PaletteStop` is `{ pos: number; hex: string }`.
  - `stitchQuads(grid: number[][], indices: number[], positions: number[]): void` from `@/math/flowers/stitch` (canonical, plan line 561): iterates each `(ri,ti)` quad `a=grid[ri][ti] b=grid[ri+1][ti] c=grid[ri+1][ti+1] d=grid[ri][ti+1]`, skips any corner `< 0`, and skips a triangle whose edge cross-product magnitude `< 1e-6` (zero-area). Emits two triangles `(a,b,c)`,`(a,c,d)` per quad.
  - `degToRad` from `@/math/supplement`.
- Produces (relied on by later `buildV2Geometry` dispatch task in `flowerGeometry.ts`, plan line 626):
  - `export function createSunflowerGeometry(params: SunflowerParams, palette: Palette): THREE.BufferGeometry` — a single indexed BufferGeometry with `position` + `color` attributes and computed vertex normals; no NaN; vertex count ≤ 130000.

---

- [ ] **Step 1: Write the failing test**

Create `petal-pixel-studio/src/math/flowers/sunflower.test.ts` verbatim:

```ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createSunflowerGeometry } from "@/math/flowers/sunflower";
import type { SunflowerParams } from "@/math/flowerTypes";
import type { Palette } from "@/math/palette";

const PALETTE: Palette = {
  id: "golden_hour",
  stops: [
    { pos: 0, hex: "#5a3a12" },
    { pos: 0.55, hex: "#e8a838" },
    { pos: 1, hex: "#fff2b0" },
  ],
};

// Mid-range params inside the canonical SUNFLOWER range table (plan lines 377-380).
const PARAMS: SunflowerParams = {
  scale: 300,
  floretRings: 90,
  floretSpokes: 220,
  domeHeight: 45,
  discRatio: 0.58,
  rayPetals: 34,
  rayLength: 0.5,
  rayWidth: 0.8,
  seedPacking: 1.0,
  satShift: 0,
  briShift: 0,
};

const VERTEX_CAP = 130000;

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

describe("createSunflowerGeometry", () => {
  it("returns a BufferGeometry with position + color attributes", () => {
    const geometry = createSunflowerGeometry(PARAMS, PALETTE);
    const pos = geometry.getAttribute("position");
    const color = geometry.getAttribute("color");
    expect(pos).toBeTruthy();
    expect(color).toBeTruthy();
    expect(pos.count).toBeGreaterThan(0);
    // one RGB triple per vertex
    expect(color.count).toBe(pos.count);
    expect(color.itemSize).toBe(3);
  });

  it("contains no NaN in positions or colors", () => {
    const geometry = createSunflowerGeometry(PARAMS, PALETTE);
    const pos = geometry.getAttribute("position").array as Float32Array;
    const color = geometry.getAttribute("color").array as Float32Array;
    for (let i = 0; i < pos.length; i += 1) expect(Number.isNaN(pos[i])).toBe(false);
    for (let i = 0; i < color.length; i += 1) expect(Number.isNaN(color[i])).toBe(false);
  });

  it("emits only strictly positive-area triangles", () => {
    const geometry = createSunflowerGeometry(PARAMS, PALETTE);
    expect(geometry.getIndex()).toBeTruthy();
    expect(minTriangleArea(geometry)).toBeGreaterThan(1e-6);
  });

  it("stays within the 130k vertex cap even at maximum resolution", () => {
    const dense: SunflowerParams = {
      ...PARAMS,
      floretRings: 150,
      floretSpokes: 320,
      rayPetals: 55,
    };
    const geometry = createSunflowerGeometry(dense, PALETTE);
    expect(geometry.getAttribute("position").count).toBeLessThanOrEqual(VERTEX_CAP);
    expect(geometry.getAttribute("position").count).toBeGreaterThan(0);
  });

  it("degrades gracefully at degenerate params (ray_petals below floor, tiny grid)", () => {
    const degenerate: SunflowerParams = {
      ...PARAMS,
      floretRings: 40,
      floretSpokes: 120,
      rayPetals: 1, // below the >=3 floor -> clamped, must not throw / NaN
      domeHeight: 0,
      seedPacking: 0.7,
    };
    const geometry = createSunflowerGeometry(degenerate, PALETTE);
    const pos = geometry.getAttribute("position").array as Float32Array;
    for (let i = 0; i < pos.length; i += 1) expect(Number.isNaN(pos[i])).toBe(false);
    expect(minTriangleArea(geometry)).toBeGreaterThan(1e-6);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** (module does not exist yet)

```
cd petal-pixel-studio && npx vitest run src/math/flowers/sunflower.test.ts
```

Expected: FAIL — Vitest reports `Failed to resolve import "@/math/flowers/sunflower"` (the file has not been created), so all 5 tests error out. (If `@/math/palette` or `@/math/flowers/stitch` are also missing, the same resolve error appears for those — create the exact snippets in Step 3.)

- [ ] **Step 3: Implement**

Create `petal-pixel-studio/src/math/flowers/sunflower.ts` verbatim. Formulas match the canonical Appendix (plan lines 620-621) and degeneracy guards / vertex cap (plan line 628) exactly.

```ts
import * as THREE from "three";
import type { SunflowerParams } from "@/math/flowerTypes";
import type { Palette } from "@/math/palette";
import { samplePaletteInto } from "@/math/palette";
import { degToRad } from "@/math/supplement";

// Fixed math constant (NOT a param): 180 * (3 - sqrt(5)).
const GOLDEN_ANGLE_DEG = 137.50776405003785;
const MAX_VERTICES = 130000;
const RAY_RADIAL_SEG = 10; // petalRadialSeg
const RAY_CROSS_SEG = 6; // petalCrossSeg

/**
 * Phyllotaxis sunflower: domed seed-head disc (polar surface grid) plus a rim of
 * ray-petal patches, built as one indexed BufferGeometry with per-vertex colors.
 */
export function createSunflowerGeometry(
  params: SunflowerParams,
  palette: Palette,
): THREE.BufferGeometry {
  const scale = params.scale;
  const domeHeight = params.domeHeight;
  const discRatio = params.discRatio;
  const rayLength = params.rayLength;
  const rayWidth = params.rayWidth;
  const seedPacking = params.seedPacking;
  const satShift = params.satShift; // fraction
  const briShift = params.briShift; // fraction

  // --- Vertex-cap guard (plan line 628): shrink grid resolution to fit MAX. ---
  let rings = Math.max(40, Math.round(params.floretRings));
  let spokes = Math.max(120, Math.round(params.floretSpokes));
  const rayPetals = Math.max(3, Math.round(params.rayPetals));

  const est = (rings + 1) * (spokes + 1) + rayPetals * (RAY_RADIAL_SEG + 1) * (RAY_CROSS_SEG + 1);
  if (est > MAX_VERTICES) {
    const shrink = Math.sqrt(MAX_VERTICES / est);
    rings = Math.max(40, Math.round(rings * shrink));
    spokes = Math.max(120, Math.round(spokes * shrink));
  }

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const scratch = new THREE.Color();

  const pushVertex = (x: number, y: number, z: number, t: number): number => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return -1; // grid=-1 skip (plan line 628)
    }
    const index = positions.length / 3;
    positions.push(x, y, z);
    // Palette-first base color (reconciliation #6, plan line 621); satShift/briShift
    // are fractions nudging HSB on top (fraction -> HSB unit via *100 scaled into 0..1).
    samplePaletteInto(palette.stops, THREE.MathUtils.clamp(t, 0, 1), scratch);
    const hsl = scratch.getHSL({ h: 0, s: 0, l: 0 });
    scratch.setHSL(
      hsl.h,
      THREE.MathUtils.clamp(hsl.s + satShift, 0, 1),
      THREE.MathUtils.clamp(hsl.l + briShift, 0, 1),
    );
    colors.push(scratch.r, scratch.g, scratch.b);
    return index;
  };

  // ---------- Seed head: domed polar surface grid u(radial) x v(spoke) ----------
  const discR = discRatio * scale;
  const Nf = Math.max(1, rings * spokes); // Nf>0 guard (plan line 628)
  const c = (seedPacking * discR) / Math.sqrt(Nf); // spiral packing constant
  const phGA = degToRad(GOLDEN_ANGLE_DEG);
  const k1 = Math.round(Math.sqrt(Nf));

  // grid[ri][ti] -> vertex index (or -1). Extra spoke column welds the seam.
  const grid: number[][] = Array.from({ length: rings + 1 }, () =>
    new Array<number>(spokes + 1).fill(-1),
  );

  for (let i = 0; i <= rings; i += 1) {
    const t = i / rings; // 0..1 radial
    for (let j = 0; j <= spokes; j += 1) {
      // Seam closure: last column reuses column 0.
      if (j === spokes) {
        grid[i][j] = grid[i][0];
        continue;
      }
      const alpha = (2 * Math.PI * j) / spokes;
      let radius = discR * Math.sqrt(t);
      const bumpA = 0.5 * (1 + Math.cos(k1 * (alpha - t / phGA)));
      const bumpB = 0.5 * (1 + Math.cos((k1 + 1) * (alpha + t / phGA)));
      const seedBump = 0.04 * discR * bumpA * bumpB;
      radius += 0.5 * seedBump;
      const zDome = domeHeight * (1 - t * t);
      const x = radius * Math.cos(alpha);
      const z = radius * Math.sin(alpha);
      const y = -(zDome + seedBump);
      // Disk color t: radial 0..1 -> darker center, lighter rim.
      grid[i][j] = pushVertex(x, y, z, t);
    }
  }
  // c referenced to keep packing intent explicit even though radius uses sqrt(t)*discR.
  void c;

  stitchQuads(grid, indices, positions);

  // ---------- Ray petals: rayPetals lofted patches around the rim ----------
  const rBase = discRatio * scale;
  const rTip = rBase + rayLength * scale;
  for (let p = 0; p < rayPetals; p += 1) {
    const alphaC = (2 * Math.PI * p) / rayPetals;
    const half = Math.min((Math.PI / rayPetals) * rayWidth, 0.9 * (Math.PI / rayPetals));
    const petalGrid: number[][] = Array.from({ length: RAY_RADIAL_SEG + 1 }, () =>
      new Array<number>(RAY_CROSS_SEG + 1).fill(-1),
    );
    for (let si = 0; si <= RAY_RADIAL_SEG; si += 1) {
      const s = si / RAY_RADIAL_SEG; // 0..1 along petal length
      const taper = Math.pow(Math.sin(Math.PI * s), 0.6);
      const rad = rBase + (rTip - rBase) * s;
      const lift = 0.18 * rayLength * scale * Math.sin(Math.PI * s);
      for (let wi = 0; wi <= RAY_CROSS_SEG; wi += 1) {
        const w = (wi / RAY_CROSS_SEG) * 2 - 1; // -1..1 cross
        const widthAng = half * taper * w;
        const alpha = alphaC + widthAng;
        const x = rad * Math.cos(alpha);
        const z = rad * Math.sin(alpha);
        const y = -(domeHeight * 0.15 + lift);
        petalGrid[si][wi] = pushVertex(x, y, z, s); // ray color sampled at s
      }
    }
    stitchQuads(petalGrid, indices, positions);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
```

If the peer task that creates `@/math/flowers/stitch` has NOT landed yet, create `petal-pixel-studio/src/math/flowers/stitch.ts` with the canonical contract (plan line 561) so this compiles; otherwise import it. Add the import `import { stitchQuads } from "@/math/flowers/stitch";` to the top of `sunflower.ts`. Canonical `stitch.ts`:

```ts
import * as THREE from "three";

const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _cc = new THREE.Vector3();

/**
 * Emit two triangles per grid quad into `indices`. Skips any quad corner that is
 * -1 (unset / skipped vertex) and skips any triangle whose area is ~zero
 * (|cross(e1,e2)| < 1e-6), which collapses at grid poles / ray tips.
 */
export function stitchQuads(grid: number[][], indices: number[], positions: number[]): void {
  const readTri = (ia: number, ib: number, ic: number): boolean => {
    _a.set(positions[ia * 3], positions[ia * 3 + 1], positions[ia * 3 + 2]);
    _b.set(positions[ib * 3], positions[ib * 3 + 1], positions[ib * 3 + 2]);
    _cc.set(positions[ic * 3], positions[ic * 3 + 1], positions[ic * 3 + 2]);
    _e1.subVectors(_b, _a);
    _e2.subVectors(_cc, _a);
    return _e1.cross(_e2).length() >= 1e-6;
  };
  for (let ri = 0; ri < grid.length - 1; ri += 1) {
    for (let ti = 0; ti < grid[ri].length - 1; ti += 1) {
      const a = grid[ri][ti];
      const b = grid[ri + 1][ti];
      const c = grid[ri + 1][ti + 1];
      const d = grid[ri][ti + 1];
      if (a >= 0 && b >= 0 && c >= 0 && readTri(a, b, c)) indices.push(a, b, c);
      if (a >= 0 && c >= 0 && d >= 0 && readTri(a, c, d)) indices.push(a, c, d);
    }
  }
}
```

- [ ] **Step 4: Run it, expect PASS**

```
cd petal-pixel-studio && npx vitest run src/math/flowers/sunflower.test.ts
```

Expected: PASS — `Test Files 1 passed`, `Tests 5 passed`. Position+color attributes present with equal counts, no NaN, `minTriangleArea > 1e-6`, and dense-param vertex count ≤ 130000.

- [ ] **Step 5: Commit**

```
git add petal-pixel-studio/src/math/flowers/sunflower.ts \
        petal-pixel-studio/src/math/flowers/sunflower.test.ts \
        petal-pixel-studio/src/math/flowers/stitch.ts
git commit -m "feat: add sunflower (phyllotaxis) v2 geometry with vertex colors

createSunflowerGeometry builds a domed phyllotaxis seed-head grid plus a
ray-petal rim into one indexed BufferGeometry, sampling the baked palette
per vertex. Includes degeneracy guards, seam weld, and 130k vertex cap.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

(Omit `stitch.ts` from `git add` if it was already committed by the peer task.)

---

Relevant absolute paths I read/reference:
- Contract: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/docs/superpowers/plans/2026-07-02-phase2-richer-generation.md` (sunflower math lines 618-628; `SunflowerParams` TS lines 434-438; palette lines 404-419; `stitch` line 561; range table lines 377-380)
- Sibling conventions: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/math/flowers/bloom.ts`, `bloom.test.ts`, `classic.ts`, `classic.test.ts`
- Helpers reused: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/math/supplement.ts` (`degToRad`)

Note for the assembler: this task consumes `@/math/palette` (`samplePaletteInto`, `Palette`, `PaletteStop`), `@/math/flowers/stitch` (`stitchQuads`), and the `SunflowerParams` interface in `@/math/flowerTypes`. Sequence those peer tasks before this one; if unsequenced, Step 3 includes the exact `stitch.ts` snippet to unblock compilation.

---

### Task 7: Rhodonea (rose-curve) 3D family geometry

**Files:**
- Create: `petal-pixel-studio/src/math/flowers/rhodonea.ts` (NEW; `createRhodoneaGeometry(rp: RhodoneaParams, palette: Palette): THREE.BufferGeometry`)
- Test: `petal-pixel-studio/src/math/flowers/rhodonea.test.ts` (NEW)

**Interfaces:**
- Consumes:
  - `RhodoneaParams` from `@/math/flowerTypes` — `{ radius: number; k: number; petalSpan: number; widthProfile: number; heightProfile: number; thickness: number; curl: number; lengthSeg: number; widthSeg: number; satShift: number; briShift: number }` (canonical contract, flowerTypes.ts additions task).
  - `Palette` + `samplePaletteInto(stops: PaletteStop[], t: number, target: THREE.Color): THREE.Color` from `@/math/palette` (palette.ts task). `Palette = { id: string; stops: PaletteStop[] }`, `PaletteStop = { pos: number; hex: string }`.
  - `stitchQuads(grid: number[][], positions: number[], indices: number[]): void` from `@/math/flowers/stitch` (stitch.ts task) — walks the `grid` of vertex indices, emits two triangles per quad, skips any quad touching a `-1` cell and any triangle whose `|cross(e1,e2)| < 1e-6` (zero-area).
  - `hsbToThreeColor(h: number, s: number, b: number): THREE.Color` from `@/math/supplement` (existing, supplement.ts:11) for the palette-absent fallback ramp.
- Produces:
  - `createRhodoneaGeometry(rp: RhodoneaParams, palette: Palette): THREE.BufferGeometry` — a `THREE.BufferGeometry` with `position` (Float32, itemSize 3) + `color` (Float32, itemSize 3) attributes, an index, and computed vertex normals. Consumed by `buildV2Geometry` dispatch in `flowerGeometry.ts` (later task).
  - Exported constant `RHODONEA_VERTEX_CAP = 130000`.

- [ ] **Step 1: Write the failing test** (real test code)

Create `petal-pixel-studio/src/math/flowers/rhodonea.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createRhodoneaGeometry, RHODONEA_VERTEX_CAP } from "@/math/flowers/rhodonea";
import type { RhodoneaParams } from "@/math/flowerTypes";
import type { Palette } from "@/math/palette";

const PALETTE: Palette = {
  id: "crimson_velvet",
  stops: [
    { pos: 0, hex: "#3a0d1e" },
    { pos: 0.5, hex: "#a11d3f" },
    { pos: 1, hex: "#f2708c" },
  ],
};

// Mid-range params drawn from the canonical RHODONEA range table.
const BASE: RhodoneaParams = {
  radius: 260,
  k: 5,
  petalSpan: 0.85,
  widthProfile: 0.45,
  heightProfile: 60,
  thickness: 9,
  curl: 0.4,
  lengthSeg: 30,
  widthSeg: 20,
  satShift: 0,
  briShift: 0,
};

// Smallest triangle area across the whole index buffer (mirrors classic.test.ts).
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
    min = Math.min(min, ab.cross(ac).length() * 0.5);
  }
  return min;
}

describe("createRhodoneaGeometry", () => {
  it("returns a BufferGeometry with position + color attributes and an index", () => {
    const g = createRhodoneaGeometry(BASE, PALETTE);
    expect(g).toBeInstanceOf(THREE.BufferGeometry);
    const pos = g.getAttribute("position");
    const col = g.getAttribute("color");
    expect(pos).toBeDefined();
    expect(col).toBeDefined();
    expect(pos.itemSize).toBe(3);
    expect(col.itemSize).toBe(3);
    // one color per position vertex
    expect(col.count).toBe(pos.count);
    expect(pos.count).toBeGreaterThan(0);
    expect(g.getIndex()).not.toBeNull();
    expect(g.getIndex()!.count % 3).toBe(0);
    // normals were computed
    expect(g.getAttribute("normal")).toBeDefined();
  });

  it("emits P = k petals for odd k and 2k for even k", () => {
    // Petal count is observable as the number of distinct clusters, but the
    // simplest deterministic proxy is that even k roughly doubles the vertex
    // count vs the same-seg odd case. Assert the surface is non-empty for both.
    const odd = createRhodoneaGeometry({ ...BASE, k: 5 }, PALETTE);
    const even = createRhodoneaGeometry({ ...BASE, k: 4 }, PALETTE);
    // odd -> P=5 petals, even -> P=8 petals; both use (lengthSeg+1)*(widthSeg+1)
    // verts per petal, so even has ~8/5 the vertices of odd here.
    expect(even.getAttribute("position").count).toBeGreaterThan(
      odd.getAttribute("position").count
    );
  });

  it("contains no NaN or non-finite vertex coordinates", () => {
    const g = createRhodoneaGeometry(BASE, PALETTE);
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count * 3; i += 1) {
      expect(Number.isFinite(pos.array[i])).toBe(true);
    }
  });

  it("contains no NaN color channels and all channels are in [0,1]", () => {
    const g = createRhodoneaGeometry(BASE, PALETTE);
    const col = g.getAttribute("color");
    for (let i = 0; i < col.count * 3; i += 1) {
      const v = col.array[i];
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("produces only strictly positive-area triangles (degenerate quads skipped)", () => {
    const g = createRhodoneaGeometry(BASE, PALETTE);
    expect(minTriangleArea(g)).toBeGreaterThan(1e-6);
  });

  it("keeps all vertices within a bounded box around the origin", () => {
    const g = createRhodoneaGeometry(BASE, PALETTE);
    g.computeBoundingBox();
    const box = g.getBoundingBox ? g.boundingBox! : g.boundingBox!;
    // radius=260, heightProfile=60, thickness=9 -> nothing should exceed a
    // generous |coord| bound of radius*2.
    const bound = BASE.radius * 2;
    expect(box.min.x).toBeGreaterThan(-bound);
    expect(box.max.x).toBeLessThan(bound);
    expect(box.min.y).toBeGreaterThan(-bound);
    expect(box.max.y).toBeLessThan(bound);
    expect(box.min.z).toBeGreaterThan(-bound);
    expect(box.max.z).toBeLessThan(bound);
  });

  it("respects the 130k vertex cap when seg counts are pushed to the max", () => {
    const g = createRhodoneaGeometry(
      { ...BASE, k: 9, lengthSeg: 48, widthSeg: 32 },
      PALETTE
    );
    // P=9 * 49 * 33 = 14553 -> under cap; assert the exported cap and that we
    // never exceed it even at the max range.
    expect(RHODONEA_VERTEX_CAP).toBe(130000);
    expect(g.getAttribute("position").count).toBeLessThanOrEqual(RHODONEA_VERTEX_CAP);
  });

  it("coerces k into [2,9] as an integer (guards pi/(2k))", () => {
    // Out-of-range / non-integer k must not throw or produce NaN.
    const g = createRhodoneaGeometry({ ...BASE, k: 0 }, PALETTE);
    const pos = g.getAttribute("position");
    expect(pos.count).toBeGreaterThan(0);
    for (let i = 0; i < pos.count * 3; i += 1) {
      expect(Number.isFinite(pos.array[i])).toBe(true);
    }
  });

  it("falls back to the HSB ramp when palette has no stops", () => {
    const g = createRhodoneaGeometry(BASE, { id: "empty", stops: [] });
    const col = g.getAttribute("color");
    expect(col.count).toBeGreaterThan(0);
    for (let i = 0; i < col.count * 3; i += 1) {
      expect(Number.isFinite(col.array[i])).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** (exact command + expected output)

```
cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio" && npx vitest run src/math/flowers/rhodonea.test.ts
```

Expected: the run fails at import/collection time with an error like `Failed to resolve import "@/math/flowers/rhodonea"` (module does not exist yet), so all cases in the `createRhodoneaGeometry` describe block are reported failing. (`@/math/palette` and `@/math/flowers/stitch` already exist from prior tasks.)

- [ ] **Step 3: Implement** (the real code)

Create `petal-pixel-studio/src/math/flowers/rhodonea.ts` implementing the canonical Appendix "rhodonea (NEW)" formulas exactly:

```ts
import * as THREE from "three";
import type { RhodoneaParams } from "@/math/flowerTypes";
import type { Palette } from "@/math/palette";
import { samplePaletteInto } from "@/math/palette";
import { stitchQuads } from "@/math/flowers/stitch";
import { hsbToThreeColor } from "@/math/supplement";

export const RHODONEA_VERTEX_CAP = 130000;

/**
 * Rhodonea (rose-curve) 3D family. r = radius * cos(k*theta) turned into P
 * per-petal lofted surface patches. Odd k -> k petals, even k -> 2k petals.
 * Color comes from the palette (sampled at length param u); if the palette has
 * no stops we fall back to the canonical HSB ramp.
 *
 * Formulas match docs/superpowers/plans/2026-07-02-phase2-richer-generation.md
 * Appendix "rhodonea (NEW)".
 */
export function createRhodoneaGeometry(
  rp: RhodoneaParams,
  palette: Palette,
): THREE.BufferGeometry {
  // --- Guards: k coerced to an integer in [2,9] so pi/(2k) is finite/nonzero.
  const k = THREE.MathUtils.clamp(Math.round(rp.k), 2, 9);
  const P = k % 2 === 1 ? k : 2 * k;

  // --- Vertex-cap-aware segment resolution.
  let lengthSeg = Math.max(12, Math.round(rp.lengthSeg));
  let widthSeg = Math.max(8, Math.round(rp.widthSeg));
  const estimate = P * (lengthSeg + 1) * (widthSeg + 1);
  if (estimate > RHODONEA_VERTEX_CAP) {
    const shrink = Math.sqrt(RHODONEA_VERTEX_CAP / estimate);
    lengthSeg = Math.max(12, Math.round(lengthSeg * shrink));
    widthSeg = Math.max(8, Math.round(widthSeg * shrink));
  }

  const radius = rp.radius;
  const petalSpan = rp.petalSpan;
  const widthProfile = rp.widthProfile;
  const heightProfile = rp.heightProfile;
  const thickness = rp.thickness;
  const curl = rp.curl;
  const satShiftHsb = rp.satShift * 100; // fraction -> HSB units (reconciliation #7)
  const briShiftHsb = rp.briShift * 100;

  const hasPalette = palette.stops.length > 0;
  const scratch = new THREE.Color();

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let p = 0; p < P; p += 1) {
    const betaP = (2 * Math.PI * p) / P;

    // Per-petal grid of vertex indices: (lengthSeg+1) rows x (widthSeg+1) cols.
    const grid: number[][] = Array.from({ length: lengthSeg + 1 }, () =>
      Array(widthSeg + 1).fill(-1),
    );

    for (let iu = 0; iu <= lengthSeg; iu += 1) {
      const u = iu / lengthSeg; // 0 base -> 1 tip
      const phiMax = (Math.PI / (2 * k)) * petalSpan;
      const rC = radius * u;
      const angHalf = phiMax * Math.pow(Math.sin(Math.PI * u), 0.5);

      // Palette / HSB color for this length row.
      if (hasPalette) {
        samplePaletteInto(palette.stops, u, scratch);
      } else {
        const hue = 340 - 6 * p;
        const sat = 85 - 15 * u + satShiftHsb;
        const bri = 30 + 55 * u + briShiftHsb;
        scratch.copy(hsbToThreeColor(hue, sat, bri));
      }

      for (let iv = 0; iv <= widthSeg; iv += 1) {
        const v = (iv / widthSeg) * 2 - 1; // -1 .. 1 cross
        const localAng = (angHalf * v * widthProfile) / 0.42;
        const phi = betaP + localAng;
        const rEdge = rC;
        const x0 = rEdge * Math.cos(phi);
        const z0 = rEdge * Math.sin(phi);
        const arch = heightProfile * Math.sin(Math.PI * u);
        const curlDown = curl * heightProfile * Math.pow(u, 3);
        const y0 = -(arch - curlDown);
        const yShell = thickness * (1 - v * v) * (1 - u);
        const x = x0;
        const z = z0;
        const y = y0 - yShell;

        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
          continue; // grid cell stays -1 -> quad skipped by stitchQuads
        }

        const index = positions.length / 3;
        grid[iu][iv] = index;
        positions.push(x, y, z);
        colors.push(scratch.r, scratch.g, scratch.b);
      }
    }

    stitchQuads(grid, positions, indices);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
```

Notes tying to the contract: `P=(k%2===1)?k:2*k`; `betaP=2pi*p/P`; `u in [0,1]`, `v in [-1,1]`; `phiMax=(pi/(2k))*petalSpan`; `rC=radius*u`; `angHalf=phiMax*sin(pi*u)^0.5`; `localAng=angHalf*v*widthProfile/0.42`; `phi=betaP+localAng`; `x0=rEdge*cos(phi)`, `z0=rEdge*sin(phi)`; `arch=heightProfile*sin(pi*u)`; `curlDown=curl*heightProfile*u^3`; `y0=-(arch-curlDown)`; `yShell=thickness*(1-v*v)*(1-u)`; `y=y0-yShell`. Color: palette sample at `u`, else `hue=340-6*p; sat=85-15*u+satShift*100; bri=30+55*u+briShift*100`. Guards: integer `k` in `[2,9]`, `130000` cap with `sqrt`-shrink (min 12/8), `sin(pi*u)^0.5` base-row collapse caught by `stitchQuads` zero-area skip, and a `Number.isFinite` guard leaving the grid cell `-1`.

- [ ] **Step 4: Run it, expect PASS** (exact command)

```
cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio" && npx vitest run src/math/flowers/rhodonea.test.ts
```

Expected: all cases in the `createRhodoneaGeometry` describe block pass (attributes present with matching color/position counts, no NaN in positions or colors, colors in `[0,1]`, `minTriangleArea > 1e-6`, vertices bounded within `±radius*2`, cap respected, out-of-range `k` coerced, empty-palette fallback finite).

- [ ] **Step 5: Commit** (git add + conventional message)

```
cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel" && \
git add petal-pixel-studio/src/math/flowers/rhodonea.ts petal-pixel-studio/src/math/flowers/rhodonea.test.ts && \
git commit -m "$(cat <<'EOF'
feat(studio): add rhodonea rose-curve 3D flower family

Per-petal lofted surface (r=radius*cos(k*theta), integer k in [2,9]; odd->k
petals, even->2k) with width/height profile, thickness shell and tip curl.
Vertex colors via samplePalette (HSB ramp fallback), shared stitchQuads with
zero-area skip, 130k vertex cap. Matches Phase 2 canonical rhodonea formulas.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

**Relevant files I read to ground this task (all absolute):**
- Canonical contract: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/docs/superpowers/plans/2026-07-02-phase2-richer-generation.md` (Appendix "rhodonea (NEW)" lines 631-641; RhodoneaParams proto lines 149-161 and Go/TS structs lines 281-293, 439-443; reconciliation #5 line 27, #6 line 30, #7 line 29; file structure line 563 for stitch/palette dependencies)
- Construction convention: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/math/flowers/bloom.ts` (positions/colors/indices → Float32BufferAttribute → setIndex → computeVertexNormals)
- Test conventions: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/math/flowers/classic.test.ts` (`minTriangleArea` helper) and `.../bloom.test.ts` (`countVertices`)
- Fallback color helper: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/math/supplement.ts:11` (`hsbToThreeColor`)
- `RhodoneaParams` TS interface target: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/math/flowerTypes.ts` (added by the flowerTypes task)

Note: `@/math/palette` (samplePalette/samplePaletteInto, Palette/PaletteStop), `@/math/flowers/stitch` (stitchQuads), and the `RhodoneaParams` interface in `flowerTypes.ts` are produced by earlier tasks in this plan and do not exist yet — verified absent on disk — so this task correctly depends on them.

---

### Task 8: Superformula (Gielis 3D dual-superformula) family — `superShape` + `createSuperformulaGeometry`

**Files:**
- Modify: `petal-pixel-studio/src/math/supplement.ts` — append `superShape(angle, m, n1, n2, n3, a, b)` after `asinDeg` (current last export, line 32-34)
- Create: `petal-pixel-studio/src/math/flowers/superformula.ts` — `createSuperformulaGeometry(params, palette)`
- Test: `petal-pixel-studio/src/math/flowers/superformula.test.ts`

**Interfaces:**
- Consumes (from earlier tasks / canonical contract):
  - `SuperformulaParams` from `@/math/flowerTypes`: `{ scale, m1, n1a, n2a, n3a, a1, b1, m2, n1b, n2b, n3b, a2, b2, uSeg, vSeg, satShift, briShift }` (all `number`)
  - `Palette` from `@/math/palette`: `{ id: string; stops: PaletteStop[] }` where `PaletteStop = { pos: number; hex: string }`
  - `samplePaletteInto(stops: PaletteStop[], t: number, target: THREE.Color): THREE.Color` from `@/math/palette` (hot-loop, no per-vertex alloc)
  - `stitchQuads(grid: number[][], indices: number[], positions: number[]): void` from `@/math/flowers/stitch` — reads `grid[i][j]` vertex indices (`-1` = skip), pushes two triangles per quad into `indices`, skipping any triangle with a missing corner or `|cross(e1,e2)| < 1e-6` (zero-area). Uses `positions` to compute the cross product.
  - `hsbToThreeColor(h, s, b)` from `@/math/supplement` (fallback ramp / shift application; s,b in 0..100)
- Produces (later tasks rely on):
  - `superShape(angle: number, m: number, n1: number, n2: number, n3: number, a: number, b: number): number` (canonical Gielis radius, guarded)
  - `createSuperformulaGeometry(params: SuperformulaParams, palette: Palette): THREE.BufferGeometry` — consumed by `buildV2Geometry` dispatch in `flowerGeometry.ts` for `family === "superformula"`

> Note: this task assumes the earlier "types" task already added `SuperformulaParams` to `flowerTypes.ts`, the "palette" task added `palette.ts` (`Palette`, `PaletteStop`, `samplePaletteInto`), and the "stitch" task added `stitch.ts` (`stitchQuads` with `-1` skip + `|cross|<1e-6` zero-area skip). If a `DEFAULT_SUPERFORMULA_PARAMS` const does not yet exist, this task defines the test fixture inline (below) rather than importing one.

---

- [ ] **Step 1: Write the failing test** (real test code)

Create `petal-pixel-studio/src/math/flowers/superformula.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { superShape } from "@/math/supplement";
import { createSuperformulaGeometry } from "@/math/flowers/superformula";
import type { SuperformulaParams } from "@/math/flowerTypes";
import type { Palette } from "@/math/palette";

// Representative mid-range params (within the canonical generator ranges).
const PARAMS: SuperformulaParams = {
  scale: 300,
  m1: 8, n1a: 0.6, n2a: 1.0, n3a: 1.0, a1: 1.0, b1: 1.0,
  m2: 4, n1b: 1.0, n2b: 1.0, n3b: 1.0, a2: 1.0, b2: 1.0,
  uSeg: 160, vSeg: 100,
  satShift: 0, briShift: 0,
};

const PALETTE: Palette = {
  id: "test_grad",
  stops: [
    { pos: 0, hex: "#ff0000" },
    { pos: 1, hex: "#0000ff" },
  ],
};

// Smallest triangle area across the whole index buffer.
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

describe("superShape", () => {
  it("returns a finite positive radius for representative inputs", () => {
    // circle-ish (m=0 -> t=0 -> |cos0|^n2 + |sin0|^n3 with sin0=0)
    expect(Number.isFinite(superShape(0, 0, 1, 1, 1, 1, 1))).toBe(true);
    const samples = [
      superShape(0, 8, 0.6, 1, 1, 1, 1),
      superShape(Math.PI / 3, 8, 0.6, 1, 1, 1, 1),
      superShape(-Math.PI / 2, 4, 1, 1, 1, 1, 1),
      superShape(Math.PI, 6, 0.5, 1.5, 1.5, 1.1, 0.9),
    ];
    for (const r of samples) {
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThan(0);
    }
  });

  it("returns 0 (not NaN/Infinity) for degenerate exponents", () => {
    // n1,a,b clamped >=1e-3; inner<=1e-9 collapses to 0 rather than Infinity.
    const r = superShape(Math.PI / 4, 8, 0, 6, 6, 0, 0);
    expect(Number.isFinite(r)).toBe(true);
    expect(r).toBeGreaterThanOrEqual(0);
  });
});

describe("createSuperformulaGeometry", () => {
  it("produces a BufferGeometry with position, color and index attributes", () => {
    const geom = createSuperformulaGeometry(PARAMS, PALETTE);
    expect(geom).toBeInstanceOf(THREE.BufferGeometry);
    expect(geom.getAttribute("position")).toBeTruthy();
    expect(geom.getAttribute("color")).toBeTruthy();
    expect(geom.getAttribute("normal")).toBeTruthy(); // computeVertexNormals ran
    expect(geom.getIndex()).toBeTruthy();
    const pos = geom.getAttribute("position");
    const col = geom.getAttribute("color");
    expect(pos.count).toBeGreaterThan(0);
    expect(col.count).toBe(pos.count); // one color per vertex
  });

  it("has no NaN in any vertex position or color", () => {
    const geom = createSuperformulaGeometry(PARAMS, PALETTE);
    const pos = geom.getAttribute("position").array;
    const col = geom.getAttribute("color").array;
    for (let i = 0; i < pos.length; i += 1) expect(Number.isFinite(pos[i])).toBe(true);
    for (let i = 0; i < col.length; i += 1) expect(Number.isFinite(col[i])).toBe(true);
  });

  it("emits only strictly positive-area triangles (poles/degenerates skipped)", () => {
    const geom = createSuperformulaGeometry(PARAMS, PALETTE);
    expect(geom.getIndex()!.count).toBeGreaterThan(0);
    expect(minTriangleArea(geom)).toBeGreaterThan(1e-6);
  });

  it("keeps every vertex within a bound of ~2*scale", () => {
    const geom = createSuperformulaGeometry(PARAMS, PALETTE);
    const pos = geom.getAttribute("position");
    const bound = 2 * PARAMS.scale;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i);
      expect(v.length()).toBeLessThanOrEqual(bound);
    }
  });

  it("honors the vertex cap (shrinks uSeg/vSeg when the grid would exceed MAX)", () => {
    const huge = createSuperformulaGeometry({ ...PARAMS, uSeg: 340, vSeg: 200 }, PALETTE);
    expect(huge.getAttribute("position").count).toBeLessThanOrEqual(130000);
  });

  it("colors vertices from the palette (not all identical)", () => {
    const geom = createSuperformulaGeometry(PARAMS, PALETTE);
    const col = geom.getAttribute("color");
    const first = new THREE.Color().fromBufferAttribute(col, 0);
    let differs = false;
    for (let i = 1; i < col.count; i += 1) {
      const c = new THREE.Color().fromBufferAttribute(col, i);
      if (Math.abs(c.r - first.r) > 1e-4 || Math.abs(c.b - first.b) > 1e-4) { differs = true; break; }
    }
    expect(differs).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** (exact command + expected output)

```
cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio" && npx vitest run src/math/flowers/superformula.test.ts
```

Expected: the run fails to collect / all tests fail because neither symbol exists yet. Expected error is a module/import failure such as:
```
Error: Failed to resolve import "@/math/flowers/superformula"
```
and/or
```
SyntaxError: The requested module '@/math/supplement' does not provide an export named 'superShape'
```

- [ ] **Step 3: Implement** (real code, matching the canonical Appendix formulas + names exactly)

3a. Append `superShape` to `petal-pixel-studio/src/math/supplement.ts` (after `asinDeg`, current line 32-34). Guards match Appendix "superformula" formula exactly:

```ts
export function superShape(
  angle: number,
  m: number,
  n1: number,
  n2: number,
  n3: number,
  a: number,
  b: number,
): number {
  const n1c = Math.max(1e-3, n1);
  const ac = Math.max(1e-3, Math.abs(a));
  const bc = Math.max(1e-3, Math.abs(b));
  const t = (m * angle) / 4;
  const t1 = Math.abs(Math.cos(t) / ac);
  const t2 = Math.abs(Math.sin(t) / bc);
  const inner = Math.pow(t1, n2) + Math.pow(t2, n3);
  if (inner <= 1e-9 || !Number.isFinite(inner)) return 0;
  const r = Math.pow(inner, -1 / n1c);
  if (!Number.isFinite(r)) return 0;
  return r;
}
```

3b. Create `petal-pixel-studio/src/math/flowers/superformula.ts`. Implements the canonical dual-superformula spherical product (Appendix "superformula" → Formulas/Construction/Degeneracy guards), a `(uSeg+1)×(vSeg+1)` grid, longitude seam weld `grid[uSeg][j] = grid[0][j]`, vertex colors via `samplePaletteInto` at `tLat`, shared `stitchQuads`, vertex cap `MAX = 130000`:

```ts
import * as THREE from "three";
import type { SuperformulaParams } from "@/math/flowerTypes";
import type { Palette } from "@/math/palette";
import { samplePaletteInto } from "@/math/palette";
import { superShape, hsbToThreeColor } from "@/math/supplement";
import { stitchQuads } from "@/math/flowers/stitch";

const MAX_VERTICES = 130000;

export function createSuperformulaGeometry(
  params: SuperformulaParams,
  palette: Palette,
): THREE.BufferGeometry {
  const {
    scale,
    m1, n1a, n2a, n3a, a1, b1,
    m2, n1b, n2b, n3b, a2, b2,
    satShift, briShift,
  } = params;

  // --- Vertex cap: est=(uSeg+1)*(vSeg+1); shrink to floor 120/80 ---
  let uSeg = Math.max(1, Math.round(params.uSeg));
  let vSeg = Math.max(1, Math.round(params.vSeg));
  const est = (uSeg + 1) * (vSeg + 1);
  if (est > MAX_VERTICES) {
    const shrink = Math.sqrt(MAX_VERTICES / est);
    uSeg = Math.max(120, Math.round(uSeg * shrink));
    vSeg = Math.max(80, Math.round(vSeg * shrink));
  }

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const hasPalette = palette != null && palette.stops != null && palette.stops.length >= 2;
  const scratch = new THREE.Color();

  // grid[i][j] holds the vertex index (-1 if skipped)
  const grid: number[][] = Array.from({ length: uSeg + 1 }, () =>
    new Array<number>(vSeg + 1).fill(-1),
  );

  for (let i = 0; i <= uSeg; i += 1) {
    const theta = -Math.PI + (2 * Math.PI * i) / uSeg;
    const r1 = superShape(theta, m1, n1a, n2a, n3a, a1, b1);

    for (let j = 0; j <= vSeg; j += 1) {
      // Longitude seam weld: reuse column 0 for the wrap-around column.
      if (i === uSeg) {
        grid[i][j] = grid[0][j];
        continue;
      }

      const phi = -Math.PI / 2 + (Math.PI * j) / vSeg;
      const r2 = superShape(phi, m2, n1b, n2b, n3b, a2, b2);

      const X = r1 * Math.cos(theta) * r2 * Math.cos(phi);
      const Y = r1 * Math.sin(theta) * r2 * Math.cos(phi);
      const Z = r2 * Math.sin(phi);

      // scene remap (canonical): x=scale*X; z=scale*Y; y=-scale*Z
      const x = scale * X;
      const z = scale * Y;
      const y = -scale * Z;

      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        continue; // grid stays -1 -> quads skipped
      }

      // Color: tLat=(phi+pi/2)/pi; lobe=0.5*(1+cos(m1*theta))
      const tLat = (phi + Math.PI / 2) / Math.PI;
      if (hasPalette) {
        samplePaletteInto(palette.stops, tLat, scratch);
        // per-shape shifts are FRACTIONS -> *100 into HSB units on top of palette base
        if (satShift !== 0 || briShift !== 0) {
          const hsl = { h: 0, s: 0, l: 0 };
          scratch.getHSL(hsl);
          scratch.setHSL(
            hsl.h,
            THREE.MathUtils.clamp(hsl.s + satShift, 0, 1),
            THREE.MathUtils.clamp(hsl.l + briShift, 0, 1),
          );
        }
      } else {
        // fallback ramp (only used if palette absent): 300+40*tLat placeholder
        const lobe = 0.5 * (1 + Math.cos(m1 * theta));
        const hue = 300 + 40 * tLat;
        const sat = 70 + 25 * lobe + satShift * 100;
        const bri = 35 + 50 * tLat + briShift * 100;
        scratch.copy(hsbToThreeColor(hue, sat, bri));
      }

      const index = positions.length / 3;
      grid[i][j] = index;
      positions.push(x, y, z);
      colors.push(scratch.r, scratch.g, scratch.b);
    }
  }

  // Poles (j=0 / j=vSeg) collapse toward a point -> caught by stitchQuads zero-area skip.
  stitchQuads(grid, indices, positions);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
```

> Contract checks against the Appendix: `superShape` guards (`n1=max(1e-3,n1)`, `a=max(1e-3,|a|)`, `b=max(1e-3,|b|)`, `t=m*angle/4`, `inner=t1^n2+t2^n3`, `inner<=1e-9||!isFinite -> 0`, `r=inner^(-1/n1)`, final `isFinite` catch) match verbatim. Grid loop uses `theta=-pi+2pi*i/uSeg`, `phi=-pi/2+pi*j/vSeg`, `X=r1·cosθ·r2·cosφ`, `Y=r1·sinθ·r2·cosφ`, `Z=r2·sinφ`, scene remap `x=scale*X; z=scale*Y; y=-scale*Z`. Color uses `tLat=(phi+pi/2)/pi`, `lobe=0.5*(1+cos(m1·theta))`, palette-first per reconciliation #6/#8 with the fraction shifts nudging on top; fallback `hue=300+40*tLat`, `sat=70+25*lobe+satShift*100`, `bri=35+50*tLat+briShift*100`. Longitude seam weld `grid[uSeg][j]=grid[0][j]`, cap `130000` shrinking to floors `120/80`, `Number.isFinite` guard, poles handled by `stitchQuads` zero-area skip — all as specified.

- [ ] **Step 4: Run it, expect PASS** (exact command)

```
cd "/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio" && npx vitest run src/math/flowers/superformula.test.ts
```

Expected: all tests in the two `describe` blocks pass (`superShape` finite/positive + degenerate→0; geometry has position/color/normal/index; no NaN; `minTriangleArea > 1e-6`; every `|v| <= 2*scale`; capped `<= 130000`; palette colors differ).

- [ ] **Step 5: Commit** (git add + conventional message)

```
git add "petal-pixel-studio/src/math/supplement.ts" \
        "petal-pixel-studio/src/math/flowers/superformula.ts" \
        "petal-pixel-studio/src/math/flowers/superformula.test.ts"
git commit -m "$(cat <<'EOF'
feat(studio): add superformula (Gielis 3D) family geometry + superShape

Add guarded superShape(angle,m,n1,n2,n3,a,b) to supplement.ts and
createSuperformulaGeometry(params, palette) implementing the canonical
dual-superformula spherical product: (uSeg+1)x(vSeg+1) grid, longitude
seam weld, per-vertex palette color via samplePaletteInto, shared
stitchQuads with zero-area/pole skip, and the 130k vertex cap.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

Key file paths (all absolute):
- Contract read: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/docs/superpowers/plans/2026-07-02-phase2-richer-generation.md` (Appendix "superformula" lines 644-654; proto `SuperformulaParams` lines 165-185; TS `SuperformulaParams` lines 444-448; reconciliations #6/#8 lines 28/30)
- Modify: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/math/supplement.ts` (append after line 34)
- Create: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/math/flowers/superformula.ts`
- Test: `/Users/BexKex/Documents/UNREAL ACTIVITY/Projects/petal-pixel/petal-pixel-studio/src/math/flowers/superformula.test.ts`

Cross-task dependencies this task assumes are already delivered by earlier plan tasks: `stitchQuads` in `src/math/flowers/stitch.ts` (signature `(grid, indices, positions) => void`, `-1` skip + `|cross|<1e-6` skip), `Palette`/`PaletteStop`/`samplePaletteInto` in `src/math/palette.ts`, and `SuperformulaParams` in `src/math/flowerTypes.ts`. If the assembler orders this task before those, its Step 2 "expect FAIL" still holds and Step 4 will surface any missing dependency as an import error to be reconciled by task ordering.

---

### Task 9: Frontend v2 consume + dispatch (flowerGeometry.ts toV2Params/buildV2Geometry/createClassicFlowerGeometryV2 + flowers/stitch.ts)

**Files:**
- Create: `petal-pixel-studio/src/math/flowers/stitch.ts` (shared `stitchQuads`)
- Modify: `petal-pixel-studio/src/math/flowerGeometry.ts` (append `toV2Params`, `buildV2Geometry`, `createClassicFlowerGeometryV2`; add imports near lines 13-16; **do NOT touch** `pickFlowerTypeFromSeed` lines 19-22, `toTechniqueParams` lines 24-65, `isBloomType` lines 67-69)
- Test: `petal-pixel-studio/src/math/flowers/stitch.test.ts`
- Test: `petal-pixel-studio/src/math/flowerGeometry.v2.test.ts`

**Interfaces:**
- Consumes (from earlier tasks / canonical contract):
  - `@/math/palette`: `interface PaletteStop { pos: number; hex: string }`, `interface Palette { id: string; stops: PaletteStop[] }`, `samplePalette(stops: PaletteStop[], t: number): THREE.Color`, `samplePaletteInto(stops, t, target): THREE.Color`
  - `@/math/flowerTypes`: `V2_FAMILIES` (9-entry), `type FlowerFamily`, `interface SunflowerParams`, `interface RhodoneaParams`, `interface SuperformulaParams`, `interface ClassicParams` (+ optional `palette?`), `interface RoseParams`, `interface BloomParams`, `DEFAULT_CLASSIC_PARAMS`
  - `@/math/flowers/sunflower`: `createSunflowerGeometry(p: SunflowerParams, palette: Palette): THREE.BufferGeometry`
  - `@/math/flowers/rhodonea`: `createRhodoneaGeometry(p: RhodoneaParams, palette: Palette): THREE.BufferGeometry`
  - `@/math/flowers/superformula`: `createSuperformulaGeometry(p: SuperformulaParams, palette: Palette): THREE.BufferGeometry`
  - existing `createRoseFlowerGeometry(roseParams)`, `createParametricBloomGeometry(type, bloomParams)`, `createClassicFlowerGeometry(classicParams)`
  - Backend proto (connect-es v2): `FlowerParams` with camelCase fields `family: string`, `palette?: PaletteSpec`, and oneof `shape: { case: "classic"|"rose"|"bloom"|"sunflower"|"rhodonea"|"superformula"; value: ... } | { case: undefined; value?: undefined }`. `PaletteSpec` = `{ id: string; stops: ColorStop[]; hueShift; satShift; briShift }`. `ColorStop` = `{ position: number; hex: string; r: number; g: number; b: number }`.
  - store shape: `FlowerParams` with optional v2 fields `family?`, `palette?: Palette`, `sunflowerParams?`, `rhodoneaParams?`, `superformulaParams?`, plus existing `classicParams`/`roseParams`/`bloomParams` (each with optional `.palette`).
- Produces (later tasks rely on):
  - `stitchQuads(indexGrid: number[][], positions: number[], indices: number[]): void` — the shared quad-stitcher the 3 family builders import.
  - `toV2Params(backend: BackendFlowerParams): { family: FlowerFamily; palette: Palette; classicParams?; roseParams?; bloomParams?; sunflowerParams?; rhodoneaParams?; superformulaParams? }` — used by `flowerStore.generateFromWord` v2 branch.
  - `buildV2Geometry(params: Pick<StoreFlowerParams, "family"|"palette"|"classicParams"|"roseParams"|"bloomParams"|"sunflowerParams"|"rhodoneaParams"|"superformulaParams">): THREE.BufferGeometry` — used by `Flower3D.tsx` geometry `useMemo`.
  - `createClassicFlowerGeometryV2(classicParams: ClassicParams, palette: Palette): THREE.BufferGeometry`.

---

- [ ] **Step 1: Write the failing test**

Create `petal-pixel-studio/src/math/flowers/stitch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { stitchQuads } from "@/math/flowers/stitch";

describe("stitchQuads", () => {
  it("emits two triangles per full non-degenerate quad", () => {
    // 2x2 grid of a unit square in the XY plane, all indices present.
    // positions laid out as grid[i][j] -> vertex index i*2 + j
    const positions = [
      0, 0, 0, // 0 grid[0][0]
      1, 0, 0, // 1 grid[0][1]
      0, 1, 0, // 2 grid[1][0]
      1, 1, 0, // 3 grid[1][1]
    ];
    const grid = [
      [0, 1],
      [2, 3],
    ];
    const indices: number[] = [];
    stitchQuads(grid, positions, indices);
    // one quad -> two triangles -> 6 indices
    expect(indices).toEqual([0, 2, 3, 0, 3, 1]);
  });

  it("skips triangles touching a -1 (missing) grid cell", () => {
    const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0];
    const grid = [
      [0, 1],
      [2, -1], // grid[1][1] missing
    ];
    const indices: number[] = [];
    stitchQuads(grid, positions, indices);
    // tri1 (a=0,b=2,c=-1) skipped; tri2 (a=0,c=-1,d=1) skipped -> nothing
    expect(indices).toEqual([]);
  });

  it("skips zero-area triangles (|cross(e1,e2)| < 1e-6)", () => {
    // grid[0][0], grid[1][0], grid[1][1] all coincide at origin -> collapsed tip.
    const positions = [
      0, 0, 0, // 0 grid[0][0]
      5, 0, 0, // 1 grid[0][1]
      0, 0, 0, // 2 grid[1][0] (coincident with 0)
      0, 0, 0, // 3 grid[1][1] (coincident with 0)
    ];
    const grid = [
      [0, 1],
      [2, 3],
    ];
    const indices: number[] = [];
    stitchQuads(grid, positions, indices);
    // tri1 (0,2,3) all coincident -> zero area -> skipped.
    // tri2 (0,3,1): a=(0,0,0) c=(0,0,0) d=(5,0,0) -> e1=c-a=0 -> cross=0 -> skipped.
    expect(indices).toEqual([]);
  });
});
```

Create `petal-pixel-studio/src/math/flowerGeometry.v2.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import type { FlowerParams as BackendFlowerParams } from "@/gen/flower/v1/service_pb";
import { toV2Params, buildV2Geometry, createClassicFlowerGeometryV2 } from "@/math/flowerGeometry";
import { DEFAULT_CLASSIC_PARAMS } from "@/math/flowerTypes";
import type { Palette } from "@/math/palette";

const PALETTE: Palette = {
  id: "sunset_coral",
  stops: [
    { pos: 0, hex: "#ff8a5c" },
    { pos: 1, hex: "#c81d54" },
  ],
};

// Minimal builder for the generated connect-es v2 message with a oneof `shape`.
function backendSunflower(): BackendFlowerParams {
  return {
    // scalars 1-9 present but irrelevant to v2 dispatch
    algoVersion: "v2",
    family: "sunflower",
    palette: {
      id: "sunset_coral",
      stops: [
        { position: 0, hex: "#ff8a5c", r: 1, g: 0.541, b: 0.361 },
        { position: 1, hex: "#c81d54", r: 0.784, g: 0.114, b: 0.329 },
      ],
      hueShift: 0,
      satShift: 0,
      briShift: 0,
    },
    shape: {
      case: "sunflower",
      value: {
        scale: 300,
        floretRings: 60,
        floretSpokes: 160,
        domeHeight: 40,
        discRatio: 0.6,
        rayPetals: 34,
        rayLength: 0.5,
        rayWidth: 0.8,
        seedPacking: 1,
        satShift: 0,
        briShift: 0,
      },
    },
  } as unknown as BackendFlowerParams;
}

describe("toV2Params", () => {
  it("maps proto family + palette (position->pos, hex) + the oneof value", () => {
    const out = toV2Params(backendSunflower());
    expect(out.family).toBe("sunflower");
    expect(out.palette.id).toBe("sunset_coral");
    // ColorStop.position -> PaletteStop.pos; hex passthrough
    expect(out.palette.stops).toEqual([
      { pos: 0, hex: "#ff8a5c" },
      { pos: 1, hex: "#c81d54" },
    ]);
    expect(out.sunflowerParams?.floretRings).toBe(60);
    expect(out.sunflowerParams?.rayPetals).toBe(34);
    // wrong-family fields stay undefined
    expect(out.rhodoneaParams).toBeUndefined();
    expect(out.classicParams).toBeUndefined();
  });
});

function nonDegenerate(geometry: THREE.BufferGeometry) {
  const pos = geometry.getAttribute("position");
  const color = geometry.getAttribute("color");
  const index = geometry.getIndex();
  expect(pos.count).toBeGreaterThan(0);
  expect(color).toBeTruthy();
  expect(color.count).toBe(pos.count);
  expect(index).toBeTruthy();
  expect(index!.count).toBeGreaterThan(0);
  // finite vertices
  for (let i = 0; i < pos.count; i += 1) {
    expect(Number.isFinite(pos.getX(i))).toBe(true);
    expect(Number.isFinite(pos.getY(i))).toBe(true);
    expect(Number.isFinite(pos.getZ(i))).toBe(true);
  }
  // at least one triangle with positive area
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  let maxArea = 0;
  for (let i = 0; i < index!.count; i += 3) {
    a.fromBufferAttribute(pos, index!.getX(i));
    b.fromBufferAttribute(pos, index!.getX(i + 1));
    c.fromBufferAttribute(pos, index!.getX(i + 2));
    ab.subVectors(b, a); ac.subVectors(c, a);
    maxArea = Math.max(maxArea, ab.cross(ac).length() * 0.5);
  }
  expect(maxArea).toBeGreaterThan(0);
}

describe("createClassicFlowerGeometryV2", () => {
  it("adds a per-vertex color attribute and keeps v1 position count", () => {
    const geometry = createClassicFlowerGeometryV2(DEFAULT_CLASSIC_PARAMS, PALETTE);
    nonDegenerate(geometry);
  });
});

describe("buildV2Geometry dispatch", () => {
  const base = { palette: PALETTE };
  const cases: Array<{ family: string; params: Record<string, unknown> }> = [
    { family: "classic", params: { classicParams: { ...DEFAULT_CLASSIC_PARAMS, palette: PALETTE } } },
    {
      family: "rose",
      params: { roseParams: { opening: 2.6, vDensity: 9.2, pAlign: 3.15, curve1: 1.7, curve2: 1.12, palette: PALETTE } },
    },
    {
      family: "zinnia",
      params: {
        bloomParams: {
          scale: 300, opening: 1, density: 1, petalFreq: 1, petalAmp: 1, hangDown: 1,
          fade: 1, thetaStep: 1, rStep: 1, satShift: 0, briShift: 0, palette: PALETTE,
        },
      },
    },
    {
      family: "sunflower",
      params: {
        sunflowerParams: {
          scale: 300, floretRings: 60, floretSpokes: 160, domeHeight: 40, discRatio: 0.6,
          rayPetals: 34, rayLength: 0.5, rayWidth: 0.8, seedPacking: 1, satShift: 0, briShift: 0,
        },
      },
    },
    {
      family: "rhodonea",
      params: {
        rhodoneaParams: {
          radius: 260, k: 5, petalSpan: 0.85, widthProfile: 0.42, heightProfile: 60,
          thickness: 8, curl: 0.3, lengthSeg: 24, widthSeg: 16, satShift: 0, briShift: 0,
        },
      },
    },
    {
      family: "superformula",
      params: {
        superformulaParams: {
          scale: 280, m1: 8, n1a: 0.6, n2a: 1, n3a: 1, a1: 1, b1: 1,
          m2: 3, n1b: 1, n2b: 1, n3b: 1, a2: 1, b2: 1, uSeg: 200, vSeg: 120, satShift: 0, briShift: 0,
        },
      },
    },
  ];
  for (const { family, params } of cases) {
    it(`returns non-degenerate geometry for family "${family}"`, () => {
      const geometry = buildV2Geometry({ family, ...base, ...params } as never);
      nonDegenerate(geometry);
    });
  }
});
```

- [ ] **Step 2: Run it, expect FAIL**

```
cd petal-pixel-studio && npx vitest run src/math/flowers/stitch.test.ts src/math/flowerGeometry.v2.test.ts
```

Expected: FAIL — resolution errors, e.g. `Failed to resolve import "@/math/flowers/stitch"` and `"stitchQuads"`/`"toV2Params"`/`"buildV2Geometry"`/`"createClassicFlowerGeometryV2" is not exported`. (Depends on `@/math/palette` and the 3 family builders existing from earlier tasks; if those are missing this task is blocked.)

- [ ] **Step 3: Implement**

Create `petal-pixel-studio/src/math/flowers/stitch.ts`:

```ts
import * as THREE from "three";

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();

/**
 * Emit two triangles per grid quad into `indices`, sharing the -1-skip and
 * zero-area-skip conventions used by the parametric bloom builder.
 *
 * `indexGrid[i][j]` holds the vertex index for grid cell (i, j), or -1 if that
 * vertex was dropped (non-finite / degenerate). `positions` is the flat
 * [x,y,z,...] buffer the indices refer to. Any triangle that touches a -1 cell
 * or whose |edge1 x edge2| < 1e-6 (zero area — collapsed tip/pole/seam) is skipped.
 */
export function stitchQuads(indexGrid: number[][], positions: number[], indices: number[]): void {
  const pushTri = (ia: number, ib: number, ic: number) => {
    if (ia < 0 || ib < 0 || ic < 0) return;
    _a.set(positions[ia * 3], positions[ia * 3 + 1], positions[ia * 3 + 2]);
    _b.set(positions[ib * 3], positions[ib * 3 + 1], positions[ib * 3 + 2]);
    _c.set(positions[ic * 3], positions[ic * 3 + 1], positions[ic * 3 + 2]);
    _e1.subVectors(_b, _a);
    _e2.subVectors(_c, _a);
    if (_e1.cross(_e2).length() < 1e-6) return; // zero-area skip
    indices.push(ia, ib, ic);
  };

  for (let i = 0; i < indexGrid.length - 1; i += 1) {
    const row = indexGrid[i];
    const next = indexGrid[i + 1];
    for (let j = 0; j < row.length - 1; j += 1) {
      const a = row[j];
      const b = next[j];
      const c = next[j + 1];
      const d = row[j + 1];
      pushTri(a, b, c);
      pushTri(a, c, d);
    }
  }
}
```

Append to `petal-pixel-studio/src/math/flowerGeometry.ts`. First extend imports (after existing line 15 block) — add:

```ts
import type { Palette, PaletteStop } from "@/math/palette";
import { samplePalette } from "@/math/palette";
import { bumpiness, vShape } from "@/math/supplement";
import { createSunflowerGeometry } from "@/math/flowers/sunflower";
import { createRhodoneaGeometry } from "@/math/flowers/rhodonea";
import { createSuperformulaGeometry } from "@/math/flowers/superformula";
import type {
  FlowerFamily,
  SunflowerParams,
  RhodoneaParams,
  SuperformulaParams,
} from "@/math/flowerTypes";
```

(`ClassicParams`, `RoseParams`, `BloomParams`, `FlowerType`, `DEFAULT_*` are already imported at lines 4-12; `BackendFlowerParams` at line 1; `createClassicFlowerGeometry`/`createParametricBloomGeometry`/`createRoseFlowerGeometry` at 13-15.)

Then append at end of file (after `isBloomType`, line 69) — **leave `pickFlowerTypeFromSeed`, `toTechniqueParams`, `isBloomType` untouched**:

```ts
/** Shape of the v2 param bundle both toV2Params returns and buildV2Geometry consumes. */
export interface V2Params {
  family: FlowerFamily;
  palette: Palette;
  classicParams?: ClassicParams;
  roseParams?: RoseParams;
  bloomParams?: BloomParams;
  sunflowerParams?: SunflowerParams;
  rhodoneaParams?: RhodoneaParams;
  superformulaParams?: SuperformulaParams;
}

/** Map a backend PaletteSpec (proto ColorStop.position/hex) to the render-side Palette. */
function toPalette(backendPalette: BackendFlowerParams["palette"]): Palette {
  const stops: PaletteStop[] = (backendPalette?.stops ?? []).map((s) => ({
    pos: s.position,
    hex: s.hex,
  }));
  return { id: backendPalette?.id ?? "", stops };
}

/**
 * Read the backend v2 render contract (proto oneof `shape` + `palette`) into the
 * render-side param bundle. Peer of toTechniqueParams (the v1 fallback), which is
 * left UNTOUCHED. Maps ColorStop.position -> PaletteStop.pos and passes hex through.
 */
export function toV2Params(backend: BackendFlowerParams): V2Params {
  const palette = toPalette(backend.palette);
  const out: V2Params = { family: backend.family as FlowerFamily, palette };
  const shape = backend.shape;
  switch (shape.case) {
    case "classic":
      out.classicParams = { ...shape.value, palette };
      break;
    case "rose":
      out.roseParams = { ...shape.value, palette };
      break;
    case "bloom":
      out.bloomParams = { ...shape.value, palette };
      break;
    case "sunflower":
      out.sunflowerParams = { ...shape.value };
      break;
    case "rhodonea":
      out.rhodoneaParams = { ...shape.value };
      break;
    case "superformula":
      out.superformulaParams = { ...shape.value };
      break;
    default:
      break;
  }
  return out;
}

/**
 * v2 dispatch: build the right BufferGeometry for params.family. The 6 existing
 * families reuse the v1 builders (classic gains a palette color attribute via the
 * V2 wrapper); the 3 new families use the family-math builders. All v2 geometry
 * carries a vertex "color" attribute (Flower3D sets vertexColors:true for v2).
 */
export function buildV2Geometry(params: V2Params): THREE.BufferGeometry {
  const palette = params.palette;
  switch (params.family) {
    case "rose":
      return createRoseFlowerGeometry({ ...params.roseParams!, palette });
    case "zinnia":
    case "camellia":
    case "lotus":
    case "dahlia":
      return createParametricBloomGeometry(params.family, { ...params.bloomParams!, palette });
    case "sunflower":
      return createSunflowerGeometry(params.sunflowerParams!, palette);
    case "rhodonea":
      return createRhodoneaGeometry(params.rhodoneaParams!, palette);
    case "superformula":
      return createSuperformulaGeometry(params.superformulaParams!, palette);
    case "classic":
    default:
      return createClassicFlowerGeometryV2(params.classicParams ?? DEFAULT_CLASSIC_PARAMS, palette);
  }
}

/**
 * v2 classic: reruns the v1 createClassicFlowerGeometry position/index math
 * verbatim and adds a per-vertex color attribute sampled from the palette at the
 * radial parameter t = theta/rows. v1 createClassicFlowerGeometry stays untouched.
 */
export function createClassicFlowerGeometryV2(params: ClassicParams, palette: Palette): THREE.BufferGeometry {
  const { rows, cols, pNum, fD, pLen, pSharp, fHeight, curve1, curve2, b, bNum } = params;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let theta = 1; theta < rows; theta += 1) {
    const t = theta / rows; // radial 0..1
    const color = samplePalette(palette.stops, t);
    for (let phi = 0; phi < cols; phi += 1) {
      const angle = (phi * Math.PI * 2) / cols;
      const r = ((pLen * Math.pow(Math.abs(Math.sin((pNum / 2) * angle)), pSharp) + fD) * theta) / rows;
      const x = r * Math.cos(angle);
      const y = r * Math.sin(angle);
      const z = vShape(fHeight, r / 100, curve1, curve2, 1.5) - 200 + bumpiness(b, r / 100, bNum, angle);
      positions.push(x, y, z);
      colors.push(color.r, color.g, color.b);
    }
  }

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

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
```

Notes for the implementer:
- `createClassicFlowerGeometryV2` keeps v1's `theta` loop starting at 1 (not 0) and the `rows-2` index bound verbatim, so vertex/index counts and positions are pixel-identical to v1 — only a `color` attribute is added.
- `buildV2Geometry` threads `palette` onto `classic`/`rose`/`bloom` params so their two-branch color code (added in the sibling `rose.ts`/`bloomProfiles.ts` tasks) samples the palette; the 3 new builders take `palette` as an explicit second arg.
- The connect-es v2 oneof is accessed via `backend.shape.case` / `backend.shape.value`. Confirm the exact generated union case names (`classic`/`rose`/`bloom`/`sunflower`/`rhodonea`/`superformula`) against `src/gen/flower/v1/service_pb.ts` after buf regen; adjust the switch labels if buf emits different discriminants.

- [ ] **Step 4: Run it, expect PASS**

```
cd petal-pixel-studio && npx vitest run src/math/flowers/stitch.test.ts src/math/flowerGeometry.v2.test.ts
```

Expected: PASS — all tests in both files green (stitchQuads: 3 passing; toV2Params: 1; createClassicFlowerGeometryV2: 1; buildV2Geometry dispatch: 6 family cases).

- [ ] **Step 5: Commit**

```
git add petal-pixel-studio/src/math/flowers/stitch.ts \
        petal-pixel-studio/src/math/flowers/stitch.test.ts \
        petal-pixel-studio/src/math/flowerGeometry.ts \
        petal-pixel-studio/src/math/flowerGeometry.v2.test.ts
git commit -m "$(cat <<'EOF'
feat(frontend): v2 geometry dispatch + shared quad stitcher

Add toV2Params (proto oneof + palette -> render bundle, position->pos),
buildV2Geometry family dispatch, createClassicFlowerGeometryV2 (v1 math +
vertex-color attribute), and shared stitchQuads (-1 skip + zero-area skip).
toTechniqueParams/pickFlowerTypeFromSeed left untouched (v1 fallback intact).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Palette-driven color in bloomProfiles.ts + rose.ts (v1 identity preserved)

**Files:**
- Modify: `petal-pixel-studio/src/math/flowers/bloomProfiles.ts` — each `profile.color(r, params)` (zinnia line 34, camellia line 53, lotus line 72, dahlia/default line 90) gains a palette branch; add `samplePalette` import (line 1 area)
- Modify: `petal-pixel-studio/src/math/flowers/rose.ts` — `rowColor` computation inside `createRoseFlowerGeometry` (line 69); add `samplePalette` import
- Test: `petal-pixel-studio/src/math/flowers/bloomProfiles.palette.test.ts` (NEW)
- Test: `petal-pixel-studio/src/math/flowers/rose.palette.test.ts` (NEW)

**Interfaces:**
- Consumes:
  - `samplePalette(stops: PaletteStop[], t: number): THREE.Color` from `@/math/palette` (canonical, plan lines 415/467; earlier palette.ts task). `PaletteStop = { pos: number; hex: string }`; `Palette = { id: string; stops: PaletteStop[] }`.
  - `hsbToThreeColor(h, s, b): THREE.Color` from `@/math/supplement` (existing, UNCHANGED legacy ramp).
  - `BloomParams` / `RoseParams` from `@/math/flowerTypes`, each gaining optional `palette?: Palette` (canonical plan lines 450-451; earlier flowerTypes task).
- Produces:
  - `getBloomProfile(type).color(r, params)` now two-branch: `params.palette` present → `samplePalette(palette.stops, r)` (r is the radial 0..1); else the EXISTING legacy `hsbToThreeColor(...)` ramp (pixel-identical). Return type unchanged: `{ r, g, b }`.
  - `createRoseFlowerGeometry(params)` `rowColor` two-branch: `params.palette` present → `samplePalette(palette.stops, rowT)`; else legacy `hsbToThreeColor(340, 100, -20 + rowT * 120)`. Consumed by `buildV2Geometry` / v2 rose+bloom arms (later Flower3D task).

---

- [ ] **Step 1: Write the failing tests** (real test code)

Create `petal-pixel-studio/src/math/flowers/bloomProfiles.palette.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getBloomProfile } from "./bloomProfiles";
import { hsbToThreeColor } from "@/math/supplement";
import { samplePalette } from "@/math/palette";
import type { BloomParams } from "@/math/flowerTypes";
import type { Palette } from "@/math/palette";

const baseParams: BloomParams = {
  scale: 300,
  opening: 1,
  density: 1,
  petalFreq: 1,
  petalAmp: 1,
  hangDown: 1,
  fade: 1,
  thetaStep: 1,
  rStep: 1,
  satShift: 0,
  briShift: 0,
};

const R = 0.37; // arbitrary interior radial sample

describe("bloomProfiles color: v1 identity (no palette)", () => {
  it("zinnia matches the legacy hsbToThreeColor ramp for a sample r", () => {
    const c = getBloomProfile("zinnia").color(R, baseParams);
    const legacy = hsbToThreeColor(335, -R * 40 + 100 + 0, R * 50 + 50 + 0);
    expect(c.r).toBeCloseTo(legacy.r, 12);
    expect(c.g).toBeCloseTo(legacy.g, 12);
    expect(c.b).toBeCloseTo(legacy.b, 12);
  });

  it("dahlia (default) matches the legacy ramp for a sample r", () => {
    const c = getBloomProfile("dahlia").color(R, baseParams);
    const legacy = hsbToThreeColor(20 - R * 20, 80 - R * 40 + 0, 60 + R * 40 + 0);
    expect(c.r).toBeCloseTo(legacy.r, 12);
    expect(c.g).toBeCloseTo(legacy.g, 12);
    expect(c.b).toBeCloseTo(legacy.b, 12);
  });
});

describe("bloomProfiles color: v2 palette branch", () => {
  const palette: Palette = {
    id: "test_grad",
    stops: [
      { pos: 0, hex: "#000000" },
      { pos: 1, hex: "#ffffff" },
    ],
  };

  it("zinnia samples the palette at r when palette is present", () => {
    const params: BloomParams = { ...baseParams, palette };
    const c = getBloomProfile("zinnia").color(R, params);
    const expected = samplePalette(palette.stops, R);
    expect(c.r).toBeCloseTo(expected.r, 12);
    expect(c.g).toBeCloseTo(expected.g, 12);
    expect(c.b).toBeCloseTo(expected.b, 12);
  });

  it("all four families route through the palette when present", () => {
    const params: BloomParams = { ...baseParams, palette };
    const expected = samplePalette(palette.stops, R);
    for (const type of ["zinnia", "camellia", "lotus", "dahlia"] as const) {
      const c = getBloomProfile(type).color(R, params);
      expect(c.r).toBeCloseTo(expected.r, 12);
      expect(c.g).toBeCloseTo(expected.g, 12);
      expect(c.b).toBeCloseTo(expected.b, 12);
    }
  });
});
```

Create `petal-pixel-studio/src/math/flowers/rose.palette.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createRoseFlowerGeometry } from "./rose";
import { hsbToThreeColor } from "@/math/supplement";
import { samplePalette } from "@/math/palette";
import type { RoseParams } from "@/math/flowerTypes";
import type { Palette } from "@/math/palette";

const ROSE_ROWS = 30; // must match rose.ts constant

const baseParams: RoseParams = {
  opening: 2.6,
  vDensity: 9,
  pAlign: 3,
  curve1: 1.7,
  curve2: 1.1,
};

// rose.ts writes the SAME color across a full row; verticesPerRow = cols + 1 = 601.
const VERTS_PER_ROW = 601;

function rowColorFromGeometry(geo: THREE.BufferGeometry, row: number) {
  const color = geo.getAttribute("color");
  const i = row * VERTS_PER_ROW; // first vertex of that row
  return { r: color.getX(i), g: color.getY(i), b: color.getZ(i) };
}

describe("rose color: v1 identity (no palette)", () => {
  it("row color matches the legacy hsbToThreeColor(340,100,-20+rowT*120) ramp", () => {
    const geo = createRoseFlowerGeometry(baseParams);
    const row = 12;
    const rowT = row * (1 / ROSE_ROWS);
    const legacy = hsbToThreeColor(340, 100, -20 + rowT * 120);
    const got = rowColorFromGeometry(geo, row);
    expect(got.r).toBeCloseTo(legacy.r, 6);
    expect(got.g).toBeCloseTo(legacy.g, 6);
    expect(got.b).toBeCloseTo(legacy.b, 6);
  });
});

describe("rose color: v2 palette branch", () => {
  it("row color comes from samplePalette at rowT when palette is present", () => {
    const palette: Palette = {
      id: "test_grad",
      stops: [
        { pos: 0, hex: "#102030" },
        { pos: 1, hex: "#e0d0c0" },
      ],
    };
    const geo = createRoseFlowerGeometry({ ...baseParams, palette });
    const row = 12;
    const rowT = row * (1 / ROSE_ROWS);
    const expected = samplePalette(palette.stops, rowT);
    const got = rowColorFromGeometry(geo, row);
    expect(got.r).toBeCloseTo(expected.r, 6);
    expect(got.g).toBeCloseTo(expected.g, 6);
    expect(got.b).toBeCloseTo(expected.b, 6);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** (exact command + expected output)

```
cd petal-pixel-studio && npx vitest run src/math/flowers/bloomProfiles.palette.test.ts src/math/flowers/rose.palette.test.ts
```

Expected: the two v1-identity tests PASS (legacy ramps already in place), and the v2 palette-branch tests FAIL. Failure is either an assertion mismatch (color still equals the legacy HSB ramp instead of `samplePalette` output — e.g. `expected 0.06 to be close to 0.44`) or, if `palette?` is not yet on `RoseParams`/`BloomParams`, a TypeScript error `Object literal may only specify known properties, and 'palette' does not exist in type 'RoseParams'`. Either way vitest exits non-zero. (Note: `RoseParams`/`BloomParams` gaining `palette?` and `@/math/palette` come from the earlier flowerTypes + palette.ts tasks; this task assumes they exist.)

- [ ] **Step 3: Implement** (real diffs)

In `bloomProfiles.ts`, add the `samplePalette` import (line 1):

```ts
import { asinDeg, hsbToThreeColor, sinDeg } from "@/math/supplement";
import { samplePalette } from "@/math/palette";
import type { BloomParams, FlowerType } from "@/math/flowerTypes";
```

Replace each of the four `color:` arms so it checks `params.palette` first, then falls back to the exact existing legacy ramp. Zinnia (was line 34):

```ts
      color: (r, params) =>
        params.palette
          ? samplePalette(params.palette.stops, r)
          : hsbToThreeColor(335, -r * 40 + 100 + params.satShift, r * 50 + 50 + params.briShift),
```

Camellia (was line 53):

```ts
      color: (r, params) =>
        params.palette
          ? samplePalette(params.palette.stops, r)
          : hsbToThreeColor(335, -r * 5 + 10 + params.satShift, r * 50 + 50 + params.briShift),
```

Lotus (was line 72):

```ts
      color: (r, params) =>
        params.palette
          ? samplePalette(params.palette.stops, r)
          : hsbToThreeColor(310, (r * 50 - 30) * 3 + 5 + params.satShift, 100 + params.briShift),
```

Dahlia/default (was line 90):

```ts
    color: (r, params) =>
      params.palette
        ? samplePalette(params.palette.stops, r)
        : hsbToThreeColor(20 - r * 20, 80 - r * 40 + params.satShift, 60 + r * 40 + params.briShift),
```

`samplePalette` returns a `THREE.Color`, whose `{ r, g, b }` shape satisfies the `BloomProfile.color` return type `{ r: number; g: number; b: number }` (line 15) — no cast needed. `satShift`/`briShift` are intentionally ignored on the palette arm per canonical reconciliation #8 (v2 bakes shifts into the palette; plan line 613).

In `rose.ts`, add the import (after line 3):

```ts
import * as THREE from "three";
import type { RoseParams } from "@/math/flowerTypes";
import { degToRad, hsbToThreeColor } from "@/math/supplement";
import { samplePalette } from "@/math/palette";
```

Replace the `rowColor` line (line 69) inside the `r` loop of `createRoseFlowerGeometry`:

```ts
    const rowT = r * rD;
    const rowColor = params.palette
      ? samplePalette(params.palette.stops, rowT)
      : hsbToThreeColor(340, 100, -20 + rowT * 120);
```

Everything else in `createRoseFlowerGeometry` (positions, `centerBud`, index buffer, `computeVertexNormals`) is untouched — `rowColor.r/g/b` are read identically at lines 96-98.

- [ ] **Step 4: Run it, expect PASS** (exact command)

```
cd petal-pixel-studio && npx vitest run src/math/flowers/bloomProfiles.palette.test.ts src/math/flowers/rose.palette.test.ts
```

Expected: all tests pass (v1-identity regression guards + v2 palette-branch). Then confirm no v1 regression elsewhere:

```
cd petal-pixel-studio && npx vitest run src/math/flowers/
```

Expected: existing bloom/rose suites still green (v1 arms unchanged).

- [ ] **Step 5: Commit** (git add + conventional message)

```
git add petal-pixel-studio/src/math/flowers/bloomProfiles.ts \
        petal-pixel-studio/src/math/flowers/rose.ts \
        petal-pixel-studio/src/math/flowers/bloomProfiles.palette.test.ts \
        petal-pixel-studio/src/math/flowers/rose.palette.test.ts
git commit -m "$(cat <<'EOF'
feat(frontend): palette-driven color branch in bloomProfiles + rose (v1 identity preserved)

Two-branch color: when params.palette is present (v2) use samplePalette(stops, t);
otherwise the existing hsbToThreeColor ramp (v1, pixel-identical). Regression tests
guard v1 identity for a sample r and assert v2 routes through samplePalette.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

Notes for the assembler / implementer:
- Real anchors verified against current code: `bloomProfiles.ts` `color:` arms at lines 34/53/72/90; `BloomProfile.color` return type `{ r; g; b }` at line 15; `rose.ts` legacy `rowColor` at line 69 with `rD = 1/30` (line 8), `ROSE_COLS = 600` (line 5) → `verticesPerRow = 601` (line 61), and `rowColor.r/g/b` written at lines 96-98.
- This task DEPENDS ON the earlier `src/math/palette.ts` task (`samplePalette`/`PaletteStop`/`Palette`) and the `flowerTypes.ts` task (optional `palette?: Palette` on `BloomParams`/`RoseParams`) — sequence it after both.
- v1 behavior is not changed: `toTechniqueParams`, `pickFlowerTypeFromSeed`, `FLOWER_TYPES`, and both legacy ramps are untouched; the palette arm is purely additive and only taken when `params.palette` is set.

---

### Task 11: Flower3D v1/v2 gate + store v2 branch + relaxed name input

**Files:**
- Modify: `petal-pixel-studio/src/components/flower/Flower3D.tsx` (geometry `useMemo` L26-34; `material` `useMemo` L42-66; `blossomRotation` `useMemo` L74-79; imports L5-10)
- Modify: `petal-pixel-studio/src/stores/flowerStore.ts` (`FlowerParams` interface L18-43; imports L1-16; `generateAutoTitle` L101-114; `generateFromWord` L227-279)
- Modify: `petal-pixel-studio/src/pages/CreateFlower.tsx` (`handleWordInputChange` L367-370; `handleGenerate` single-word rejection L390-393; placeholder L562)
- Test: `petal-pixel-studio/src/stores/flowerStore.v2.test.ts` (NEW)

**Interfaces:**
- Consumes (from earlier tasks / canonical contract):
  - `isV2(p: Pick<FlowerParams,"algoVersion"|"family">): boolean` from `@/math/flowerVersion` — true iff `p.algoVersion === "v2" && p.family != null`.
  - `buildV2Geometry(params: FlowerParams): THREE.BufferGeometry` from `@/math/flowerGeometry` — dispatches on `params.family`, returns position+color geometry.
  - `toV2Params(backend: BackendFlowerParams): { family: FlowerFamily; palette: Palette; classicParams?; roseParams?; bloomParams?; sunflowerParams?; rhodoneaParams?; superformulaParams? }` from `@/math/flowerGeometry` — reads proto oneof + palette (position→pos, hex→hex).
  - `V2_FAMILIES` / `FlowerFamily` and `SunflowerParams`, `RhodoneaParams`, `SuperformulaParams` from `@/math/flowerTypes`; `Palette` from `@/math/palette`.
  - `toTechniqueParams(seed, backend)` from `@/math/flowerGeometry` — UNCHANGED, used on the v1 arm.
- Produces (relied on by no later task; this is a leaf wiring task):
  - `FlowerParams` gains optional fields `family?: FlowerFamily; palette?: Palette; sunflowerParams?: SunflowerParams; rhodoneaParams?: RhodoneaParams; superformulaParams?: SuperformulaParams`.
  - `Flower3D` renders v2 families with `vertexColors:true` and family-aware `blossomRotation`.

- [ ] **Step 1: Write the failing test** — create `petal-pixel-studio/src/stores/flowerStore.v2.test.ts`. Mirror the existing `flowerStore.test.ts` mock setup (Supabase + gRPC), but drive `generateFromWord` with a v2 backend payload and assert the store lands `family` + `palette` + the family param bundle. Also assert a v1 payload still routes through the untouched v1 path.

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock Supabase BEFORE importing the store (matches flowerStore.test.ts) ──
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-123" } } })) },
    from: vi.fn(() => ({
      upsert: vi.fn(async () => ({ error: null })),
      update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })),
      delete: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })),
    })),
  },
}));

// gRPC client is mocked; each test sets its return value.
const createFlowerViaGrpc = vi.fn();
vi.mock("@/integrations/flowerBackend/client", () => ({
  createFlowerViaGrpc: (name: string) => createFlowerViaGrpc(name),
}));

import { useFlowerStore } from "./flowerStore";

const V2_PALETTE = {
  id: "sunset_coral",
  stops: [
    { position: 0, hex: "#ffb07c", r: 1, g: 0.69, b: 0.49 },
    { position: 1, hex: "#c2185b", r: 0.76, g: 0.09, b: 0.36 },
  ],
  hueShift: 4, satShift: 0.1, briShift: -0.05,
};

const SUNFLOWER = {
  scale: 300, floretRings: 90, floretSpokes: 220, domeHeight: 40, discRatio: 0.6,
  rayPetals: 34, rayLength: 0.5, rayWidth: 0.8, seedPacking: 1, satShift: 0.05, briShift: -0.02,
};

function v2Response() {
  // Shape mirrors connect-es FlowerParams: scalars 1-9 + family + palette + oneof `shape`.
  return {
    flowerId: "flower-v2",
    params: {
      algoVersion: "v2", schemaVersion: "v2", seed: 42n,
      petalCount: 8, petalLength: 1.2, petalWidth: 0.5, curvature: 0.2, stemHeight: 1, hue: 40,
      family: "sunflower",
      palette: V2_PALETTE,
      shape: { case: "sunflower", value: SUNFLOWER },
    },
  };
}

function v1Response() {
  return {
    flowerId: "flower-v1",
    params: {
      algoVersion: "v1", schemaVersion: "v1", seed: 7n,
      petalCount: 6, petalLength: 1.2, petalWidth: 0.5, curvature: 0.2, stemHeight: 1, hue: 120,
      family: "", palette: undefined, shape: { case: undefined, value: undefined },
    },
  };
}

describe("generateFromWord v2 branch", () => {
  beforeEach(() => {
    createFlowerViaGrpc.mockReset();
    useFlowerStore.setState({
      editingFlowerId: null,
      params: { ...useFlowerStore.getState().params, family: undefined, palette: undefined, sunflowerParams: undefined },
    });
  });

  it("stores family + palette + family params for a v2 backend response", async () => {
    createFlowerViaGrpc.mockResolvedValue(v2Response());

    await useFlowerStore.getState().generateFromWord("golden fields");

    const p = useFlowerStore.getState().params;
    expect(p.algoVersion).toBe("v2");
    expect(p.family).toBe("sunflower");
    expect(p.palette?.id).toBe("sunset_coral");
    // toV2Params maps proto ColorStop.position -> PaletteStop.pos.
    expect(p.palette?.stops[0].pos).toBe(0);
    expect(p.palette?.stops[1].hex).toBe("#c2185b");
    expect(p.sunflowerParams?.rayPetals).toBe(34);
    expect(p.flowerId).toBe("flower-v2");
  });

  it("leaves the v1 path unchanged for a v1 backend response", async () => {
    createFlowerViaGrpc.mockResolvedValue(v1Response());

    await useFlowerStore.getState().generateFromWord("classic");

    const p = useFlowerStore.getState().params;
    expect(p.algoVersion).toBe("v1");
    expect(p.family).toBeUndefined();          // v2 fields NOT populated on v1 path
    expect(p.palette).toBeUndefined();
    expect(p.sunflowerParams).toBeUndefined();
    expect(p.flowerId).toBe("flower-v1");
    // v1 scalar-derived color still set (v1 path untouched).
    expect(p.colorA).toContain("hsl");
  });
});
```

  MANUAL VERIFICATION for the 3D gate + name input (no automated test — WebGL/DOM interaction):
  - **3D gate:** `docker compose up -d --build backend frontend`; open the app, generate a name that yields a v2 family (e.g. try several until `sunflower`/`rhodonea`/`superformula` render). EXPECT: the new-family surface renders (not the v1 classic disc), colors come from the palette gradient (vertex colors, not a flat `colorA`), and no `THREE.WebGLRenderer` NaN/attribute console errors. Generate a name that yields v2 `classic`. EXPECT: it renders upright ( `[-PI/2,0,0]` rotation) while sunflower/rhodonea/superformula render with `[PI,0,0]`.
  - **Name input:** in the generation input type `"golden hour fields"`. EXPECT: spaces are NO LONGER stripped (input keeps the phrase, whitespace runs collapse to single spaces, length capped at 64), Generate is accepted (no "must be a single word" toast), placeholder reads `Enter a name or phrase...`.

- [ ] **Step 2: Run it, expect FAIL**
  ```sh
  cd petal-pixel-studio && npx vitest run src/stores/flowerStore.v2.test.ts
  ```
  EXPECTED: FAIL. The v2 test errors because `generateFromWord` ignores `backend.family`/`backend.palette` (no v2 branch yet) and `FlowerParams` has no `family`/`palette`/`sunflowerParams` fields, so `p.family` is `undefined` and `p.palette?.id` is `undefined` — `expect(p.family).toBe("sunflower")` fails. (The v1 test passes already, confirming the v1 path is intact.)

- [ ] **Step 3: Implement**

  **3a. `flowerStore.ts` — extend `FlowerParams` (after L42 `stemEnabled: boolean;`) and imports.**
  Add to the import from `@/math/flowerTypes` (L4-13) the new types, add the `Palette` import and `toV2Params`:
```ts
import {
  BLOOM_TYPES,
  DEFAULT_BLOOM_PARAMS,
  DEFAULT_CLASSIC_PARAMS,
  DEFAULT_ROSE_PARAMS,
  type BloomParams,
  type ClassicParams,
  type FlowerType,
  type FlowerFamily,
  type RoseParams,
  type SunflowerParams,
  type RhodoneaParams,
  type SuperformulaParams,
} from "@/math/flowerTypes";
import type { Palette } from "@/math/palette";
import { toTechniqueParams, toV2Params } from "@/math/flowerGeometry";
```
  Add the optional v2 fields to `FlowerParams` (after L42):
```ts
  stemEnabled: boolean;

  // v2 additive fields (undefined on v1 records). classicParams/roseParams/bloomParams
  // are reused for the 6 existing families; palette threads onto them.
  family?: FlowerFamily;
  palette?: Palette;
  sunflowerParams?: SunflowerParams;
  rhodoneaParams?: RhodoneaParams;
  superformulaParams?: SuperformulaParams;
```

  **3b. `flowerStore.ts` — extend `generateAutoTitle` `typeNames` (L103-110).** Widen the key type so the three new families map; `flowerType` for v2 non-6 families is passed as the family string:
```ts
function generateAutoTitle(word: string, flowerType: FlowerType | FlowerFamily): string {
  const prefixes = ["Celestial", "Aurora", "Crystal", "Nebula", "Astral", "Phantom", "Luminous", "Ethereal"];
  const typeNames: Record<FlowerFamily, string> = {
    classic: "Bloom",
    rose: "Rose",
    zinnia: "Zinnia",
    camellia: "Camellia",
    lotus: "Lotus",
    dahlia: "Dahlia",
    sunflower: "Sunflower",
    rhodonea: "Rhodonea",
    superformula: "Superformula",
  };

  const hash = Array.from(word).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return `${prefixes[hash % prefixes.length]} ${typeNames[flowerType]}`;
}
```

  **3c. `flowerStore.ts` — branch `generateFromWord` (L233-271).** After fetching `backendParams`, split on `algoVersion === "v2" && family`. v1 arm is byte-for-byte today's code; v2 arm uses `toV2Params`.
```ts
      const response = await createFlowerViaGrpc(trimmed);
      const backendParams = response.params;
      if (!backendParams) {
        throw new Error("Backend returned empty params");
      }

      const seed = backendParams.seed;

      // ── v2 path: backend is source of truth (family + palette + oneof shape) ──
      if (backendParams.algoVersion === "v2" && backendParams.family) {
        const v2 = toV2Params(backendParams);
        const autoTitle = generateAutoTitle(trimmed, v2.family);
        set({
          params: {
            ...get().params,
            flowerId: response.flowerId,
            algoVersion: backendParams.algoVersion,
            schemaVersion: backendParams.schemaVersion,
            seed: seedToDisplay(seed),
            family: v2.family,
            palette: v2.palette,
            // reuse existing slots for the 6 shared families; leave others at defaults
            flowerType: (FLOWER_TYPES as readonly string[]).includes(v2.family)
              ? (v2.family as FlowerType)
              : get().params.flowerType,
            classicParams: v2.classicParams ?? get().params.classicParams,
            roseParams: v2.roseParams ?? get().params.roseParams,
            bloomParams: v2.bloomParams ?? get().params.bloomParams,
            sunflowerParams: v2.sunflowerParams,
            rhodoneaParams: v2.rhodoneaParams,
            superformulaParams: v2.superformulaParams,
            rotation: Number(seed % BigInt(360)),
          },
          generationWord: trimmed,
          title: get().editingFlowerId ? get().title : autoTitle,
          editingFlowerId: get().editingFlowerId,
        });
      } else {
        // ── v1 path: EXACTLY today's behavior (toTechniqueParams fallback) ──
        const technique = toTechniqueParams(seed, backendParams);
        const hue = backendParams.hue;
        const baseCount = Math.max(3, backendParams.petalCount || 6);
        const autoTitle = generateAutoTitle(trimmed, technique.flowerType);

        set({
          params: {
            ...get().params,
            flowerId: response.flowerId,
            algoVersion: backendParams.algoVersion,
            schemaVersion: backendParams.schemaVersion,
            seed: seedToDisplay(seed),
            flowerType: technique.flowerType,
            classicParams: technique.classicParams,
            roseParams: technique.roseParams,
            bloomParams: technique.bloomParams,
            petalCount: baseCount,
            petalLength: clamp(backendParams.petalLength || 1.2, 0.25, 3),
            petalSharpness: clamp(backendParams.petalWidth || 0.5, 0.05, 1.4),
            noiseIntensity: clamp(Math.abs(backendParams.curvature || 0.2), 0, 1),
            frequency: 1 + Number(seed % BigInt(6)),
            rotation: Number(seed % BigInt(360)),
            symmetry: clamp(baseCount, 3, 18),
            colorA: hueToHex(hue, 72, 52),
            colorB: hueToHex((hue + 48) % 360, 66, 45),
            stemEnabled: (backendParams.stemHeight || 0) > 0.95,
          },
          generationWord: trimmed,
          title: get().editingFlowerId ? get().title : autoTitle,
          editingFlowerId: get().editingFlowerId,
        });
      }
```
  Add the `FLOWER_TYPES` import used by the guard (extend L4-13 import list with `FLOWER_TYPES,`).

  **3d. `Flower3D.tsx` — v1/v2 gate.** Update imports (L5-10) and the three `useMemo`s.
```ts
import { isV2 } from "@/math/flowerVersion";
import {
  buildV2Geometry,
  createClassicFlowerGeometry,
  createParametricBloomGeometry,
  createRoseFlowerGeometry,
  isBloomType,
} from "@/math/flowerGeometry";
```
  Geometry `useMemo` (replace L26-34):
```ts
  const geometry = useMemo(() => {
    if (isV2(params)) {
      return buildV2Geometry(params);
    }
    if (params.flowerType === "rose") {
      return createRoseFlowerGeometry(params.roseParams);
    }
    if (isBloomType(params.flowerType)) {
      return createParametricBloomGeometry(params.flowerType, params.bloomParams);
    }
    return createClassicFlowerGeometry(params.classicParams);
  }, [params]);
```
  Material `useMemo` (change the vertex-color guard on L43 and its deps L66) — `usesVertexColors = isV2 ? true : (rose || bloom)`:
```ts
  const material = useMemo(() => {
    const usesVertexColors = isV2(params)
      ? true
      : params.flowerType === "rose" || isBloomType(params.flowerType);
    if (usesVertexColors) {
      return new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness: params.material === "metallic" ? 0.24 : params.material === "glass" ? 0.06 : 0.66,
        metalness: params.material === "metallic" ? 0.72 : 0.05,
        transparent: params.material === "glass",
        opacity: params.material === "glass" ? 0.7 : 1,
        emissive: new THREE.Color(params.colorA),
        emissiveIntensity: params.glowIntensity * 0.1,
      });
    }

    return new THREE.MeshPhysicalMaterial({
      color: params.colorA,
      side: THREE.DoubleSide,
      roughness: params.material === "metallic" ? 0.28 : params.material === "glass" ? 0.08 : 0.7,
      metalness: params.material === "metallic" ? 0.66 : 0.04,
      transparent: params.material === "glass",
      opacity: params.material === "glass" ? 0.76 : 1,
      emissive: new THREE.Color(params.colorB),
      emissiveIntensity: params.glowIntensity * 0.16,
    });
  }, [params.flowerType, params.family, params.algoVersion, params.material, params.colorA, params.colorB, params.glowIntensity]);
```
  `blossomRotation` `useMemo` (replace L74-79) — family-aware: v2 classic `[-PI/2,0,0]`, other v2 `[PI,0,0]`; v1 unchanged (classic upright, else `[PI,0,0]`):
```ts
  const blossomRotation: [number, number, number] = useMemo(() => {
    if (isV2(params)) {
      return params.family === "classic" ? [-Math.PI / 2, 0, 0] : [Math.PI, 0, 0];
    }
    if (params.flowerType === "classic") {
      return [-Math.PI / 2, 0, 0];
    }
    return [Math.PI, 0, 0];
  }, [params.flowerType, params.family, params.algoVersion]);
```

  **3e. `CreateFlower.tsx` — relax name input.** Replace `handleWordInputChange` (L367-370): stop `\s`→`''` stripping; collapse whitespace runs to single spaces; cap length at 64:
```ts
  const handleWordInputChange = (value: string) => {
    const sanitized = value.replace(/\s+/g, ' ').slice(0, 64);
    setWordInput(sanitized);
  };
```
  Remove the single-word rejection in `handleGenerate` (delete L390-393):
```ts
    if (word.includes(' ')) {
      toast.error('Generation word must be a single word (no spaces).');
      return;
    }
```
  Update the placeholder (L562):
```ts
                placeholder="Enter a name or phrase..."
```

- [ ] **Step 4: Run it, expect PASS**
  ```sh
  cd petal-pixel-studio && npx vitest run src/stores/flowerStore.v2.test.ts
  ```
  EXPECTED: PASS (2 passed) — v2 response populates `family`/`palette`/`sunflowerParams`; v1 response leaves them `undefined` and keeps the scalar-derived `colorA`. Then confirm no regression on the existing store + geometry tests:
  ```sh
  cd petal-pixel-studio && npx vitest run src/stores/flowerStore.test.ts src/components/flower/Flower3D.deps.test.ts
  ```
  EXPECTED: PASS. Then complete the MANUAL VERIFICATION from Step 1 and confirm the expected observations.

- [ ] **Step 5: Commit**
  ```sh
  git add petal-pixel-studio/src/components/flower/Flower3D.tsx \
          petal-pixel-studio/src/stores/flowerStore.ts \
          petal-pixel-studio/src/pages/CreateFlower.tsx \
          petal-pixel-studio/src/stores/flowerStore.v2.test.ts
  git commit -m "feat: wire v2 flower render gate, store v2 branch, and full-name input

Flower3D dispatches isV2(params)->buildV2Geometry (vertexColors always on
for v2; family-aware blossomRotation: classic [-PI/2,0,0] else [PI,0,0]).
flowerStore.generateFromWord branches on algoVersion=='v2'&&family via
toV2Params (family+palette+per-family params); v1 path unchanged. CreateFlower
accepts full names/phrases (collapse whitespace, cap 64, drop single-word gate).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

Notes on real anchors used (all verified against the current code): `Flower3D.tsx` geometry `useMemo` at L26-34, material at L42-66, `blossomRotation` at L74-79; `flowerStore.ts` `FlowerParams` L18-43, `generateAutoTitle` L101-114, `generateFromWord` L227-279; `CreateFlower.tsx` `handleWordInputChange` L367-370, single-word rejection L390-393, placeholder L562. Test scaffolding mirrors the existing `src/stores/flowerStore.test.ts` mock pattern (Supabase client + `createFlowerViaGrpc` mocks, `useFlowerStore.setState`/`getState`), and vitest runs with globals + `@`→`src` alias + jsdom per `vitest.config.ts`. The v2 branch consumes `toV2Params` / `buildV2Geometry` / `isV2` / `V2_FAMILIES` produced by earlier tasks and leaves `toTechniqueParams` + `pickFlowerTypeFromSeed` + `FLOWER_TYPES` untouched, satisfying the mandatory back-compat constraint.

---

### Task 12: Document Dockerized codegen + Go tests in READMEs

**Files:**
- Modify: `README.md` (root) — Dev Tooling table (lines 114-120), "gRPC-Web over REST" section (lines 206-207); add a new "Regenerating proto stubs (codegen)" subsection under Quickstart
- Modify: `flower-backend/README.md` — Quick start step 1 (lines 34-39), "Run tests" (lines 78-82), "Development commands" (lines 96-108)
- Test: MANUAL VERIFICATION only (docs render + accuracy — no automated test harness for Markdown in this repo)

**Interfaces:**
- Consumes (must match these exactly, from the canonical "Codegen + build/test (Docker)" and "File structure" sections):
  - Codegen wrapper: `tools/docker/buf.sh` (pinned `bufbuild/buf:1.47.2`, generates Go + frontend TS)
  - Go codegen (from repo root, quoted paths): `docker run --rm -v "$PWD":/workspace -w /workspace/flower-backend bufbuild/buf:1.47.2 generate`
  - TS codegen: `docker run --rm -v "$PWD":/workspace -w /workspace/flower-backend bufbuild/buf:1.47.2 generate --template buf.gen.frontend.yaml`
  - Optional compose codegen service (under `profiles: ["tools"]`): `docker compose run --rm codegen`
  - Go tests: `docker run --rm -v "$PWD/flower-backend":/src -w /src golang:1.25-alpine go test ./...`
  - Committed stubs: `flower-backend/gen/go/flower/v1/{service.pb.go,service_grpc.pb.go}` and `petal-pixel-studio/src/gen/flower/v1/{service_pb.ts,service_connect.ts}` stay git-tracked; pinned `1.47.2` => zero-diff regen on unchanged proto
  - v2 note: name generation bumped to `algo_version="v2"` adding families `sunflower`, `rhodonea`, `superformula` + hybrid palettes; v1 flowers render unchanged
- Produces: no code symbols (docs only). Downstream contributors rely on the documented commands being copy-pasteable and accurate.

- [ ] **Step 1: Write the failing test** — MANUAL VERIFICATION (docs only; no code test)

  Define the acceptance checklist that must be TRUE after Step 3. Before editing, confirm each item is currently FALSE (that is the "failing" baseline):

  1. Root `README.md` Dev Tooling table lists `tools/docker/buf.sh` with the exact invocation.
  2. Root `README.md` documents the optional `docker compose run --rm codegen` service.
  3. Root `README.md` states the host needs **no Go and no Buf toolchain** — only Docker.
  4. Root `README.md` states regenerated stubs stay committed and pinned `bufbuild/buf:1.47.2` yields a zero-diff regen on unchanged proto.
  5. Root `README.md` has a one-line note that v2 name generation adds `sunflower`/`rhodonea`/`superformula` families + hybrid palettes, with v1 flowers rendering unchanged.
  6. `flower-backend/README.md` step 1 no longer lists Go/Buf as required host installs (marks them Docker-provided).
  7. `flower-backend/README.md` "Run tests" shows the `golang:1.25-alpine` Docker command.
  8. `flower-backend/README.md` "Development commands" shows `buf.sh` / Dockerized `bufbuild/buf:1.47.2 generate` instead of bare `buf generate`.

  Run the baseline grep — all patterns MUST be absent (empty output) before implementing:

  ```sh
  docker --version   # sanity: Docker present, Go/buf absent on host
  cd "$(git rev-parse --show-toplevel)"
  grep -n "buf.sh"                 README.md flower-backend/README.md || echo "MISSING buf.sh (expected pre-impl)"
  grep -n "golang:1.25-alpine"     README.md flower-backend/README.md || echo "MISSING golang:1.25-alpine (expected pre-impl)"
  grep -n "bufbuild/buf:1.47.2"    README.md flower-backend/README.md || echo "MISSING pinned buf image (expected pre-impl)"
  grep -n "compose run --rm codegen" README.md                        || echo "MISSING codegen service (expected pre-impl)"
  ```

- [ ] **Step 2: Run it, expect FAIL** (exact command + expected output)

  ```sh
  cd "$(git rev-parse --show-toplevel)"
  grep -n "buf.sh" README.md flower-backend/README.md
  ```

  Expected output: **no matches** (grep exit code 1 / the `MISSING ...` echo fires). Likewise `golang:1.25-alpine` and `bufbuild/buf:1.47.2` produce no matches. This confirms the docs do not yet describe the Dockerized workflow — the "failing" state.

- [ ] **Step 3: Implement** (the real edits)

  **3a. `flower-backend/README.md` — Quick start step 1 (replace lines 34-39).** Replace the "Install dependencies" block so Go/Buf are Docker-provided, not host installs:

  ```md
  ### 1. Prerequisites

  - Docker (Compose v2+) — the only required host tool.

  No Go, Buf, or protoc toolchain is needed on the host: code generation and
  the Go test suite both run inside pinned Docker images (`bufbuild/buf:1.47.2`
  and `golang:1.25-alpine`). Installing Go locally is optional and only speeds
  up an editor/IDE loop.
  ```

  **3b. `flower-backend/README.md` — "Run tests" (replace the fenced block at lines 79-81).** Replace the bare `go test ./...` with the Dockerized command:

  ```md
  Run the Go test suite via Docker (no host Go needed). Run from the **repo
  root** so `$PWD/flower-backend` resolves; the repo path may contain a space,
  so keep the quotes:

  ```bash
  docker run --rm -v "$PWD/flower-backend":/src -w /src \
    golang:1.25-alpine go test ./...
  ```

  Scope to the generator package while iterating, and add a cached module
  volume to speed up repeat runs:

  ```bash
  docker run --rm -v "$PWD/flower-backend":/src -w /src -v petal-gocache:/go/pkg/mod \
    golang:1.25-alpine go test ./internal/flower/...
  ```
  ```

  **3c. `flower-backend/README.md` — "Development commands" (replace lines 98-108).** Replace bare `buf generate` with the wrapper + Dockerized commands:

  ```md
  Regenerate the protobuf stubs (Go + frontend TS) with the pinned Buf image —
  no host Buf CLI required. From the repo root:

  ```bash
  ./tools/docker/buf.sh
  ```

  `buf.sh` runs both generators (Go stubs → `gen/go`, frontend TS →
  `../petal-pixel-studio/src/gen`). To run a single generator by hand:

  ```bash
  # Go stubs -> flower-backend/gen/go
  docker run --rm -v "$PWD":/workspace -w /workspace/flower-backend \
    bufbuild/buf:1.47.2 generate
  # Frontend TS stubs -> petal-pixel-studio/src/gen
  docker run --rm -v "$PWD":/workspace -w /workspace/flower-backend \
    bufbuild/buf:1.47.2 generate --template buf.gen.frontend.yaml
  ```

  The Buf image tag is pinned to `1.47.2` so an unchanged `.proto` regenerates
  with a zero diff (floating `latest` drifts plugin versions and produces
  spurious changes). The generated stubs
  (`gen/go/flower/v1/*.pb.go` and `petal-pixel-studio/src/gen/flower/v1/*.ts`)
  are committed to git — the backend Docker build copies `gen/go`, and Vite
  imports `src/gen` directly, so both must be regenerated and committed whenever
  `proto/flower/v1/service.proto` changes.
  ```

  **3d. Update the backend "Tech stack" line (line 15) so Go/Buf read as Docker-run, not host installs.** Change:

  ```md
  - Go 1.25+
  ```
  to:
  ```md
  - Go 1.25 (run via the `golang:1.25-alpine` Docker image; no host install required)
  ```
  and change (line 20):
  ```md
  - Buf for proto code generation
  ```
  to:
  ```md
  - Buf for proto code generation (run via the pinned `bufbuild/buf:1.47.2` Docker image)
  ```

  **3e. Root `README.md` — Dev Tooling table (add rows after line 119).** Insert two rows into the existing table (which ends with the `tools/docker/deploy.sh` row):

  ```md
  | `tools/docker/buf.sh` | Regenerate proto stubs (Go + frontend TS) via pinned `bufbuild/buf:1.47.2` — no host Buf/Go needed |
  | `docker compose run --rm codegen` | Same codegen as `buf.sh`, as an optional Compose service (under the `tools` profile, so it stays out of `docker compose up`) |
  ```

  **3f. Root `README.md` — extend the "gRPC-Web over REST" section (append after line 207).** Add the no-toolchain + committed-stubs note:

  ```md
  Neither Buf nor Go needs to be installed on the host: `tools/docker/buf.sh`
  (or `docker compose run --rm codegen`) runs the pinned `bufbuild/buf:1.47.2`
  image, and the Go test suite runs via `golang:1.25-alpine` — Docker is the only
  required toolchain. The generated stubs (`flower-backend/gen/go` and
  `petal-pixel-studio/src/gen`) are committed to git; because the image tag is
  pinned, regenerating from an unchanged `.proto` produces a zero diff.
  ```

  **3g. Root `README.md` — add a one-line v2 generation note.** In the "What is Petal Pixel?" numbered list, extend the **Generate** item (line 23) to mention the richer families. Change:

  ```md
  1. **Generate** a unique procedural flower by entering a word (used as a seed) and tweaking visual parameters via real-time sliders.
  ```
  to:
  ```md
  1. **Generate** a unique procedural flower by entering a name or phrase (used as a seed) and tweaking visual parameters via real-time sliders. The v2 generator (`algo_version: "v2"`) emits a full render-ready parameter set with hybrid palettes and nine flower families — including the new `sunflower`, `rhodonea`, and `superformula` 3D forms — while already-saved v1 flowers keep rendering unchanged.
  ```

- [ ] **Step 4: Run it, expect PASS** (exact command)

  Re-run the acceptance greps — every pattern must now be PRESENT (grep exit 0, no `MISSING` echo). Then render both files to confirm the Markdown is well-formed:

  ```sh
  cd "$(git rev-parse --show-toplevel)"
  grep -n "buf.sh"                 README.md flower-backend/README.md
  grep -n "golang:1.25-alpine"     README.md flower-backend/README.md
  grep -n "bufbuild/buf:1.47.2"    README.md flower-backend/README.md
  grep -n "compose run --rm codegen" README.md
  grep -n "sunflower" README.md
  grep -n "no host" README.md flower-backend/README.md   # or "No Go, Buf" / "no host Buf"
  # Fenced-block balance sanity: count of ``` fences must be EVEN in each file
  awk '/^```/{n++} END{print FILENAME": "n" fences (must be even)"}' README.md
  awk '/^```/{n++} END{print FILENAME": "n" fences (must be even)"}' flower-backend/README.md
  ```

  Expected: all five content greps return matches; both fence counts are even. Optionally render via Docker (no host tooling) to eyeball the tables/code blocks:

  ```sh
  docker run --rm -v "$PWD":/w -w /w node:20-alpine sh -c \
    'npx --yes markdownlint-cli README.md flower-backend/README.md || true'
  ```

  (markdownlint is advisory — the load-bearing checks are the greps + even fence counts + a visual read of the two modified tables and code blocks.)

- [ ] **Step 5: Commit** (git add + conventional message)

  ```sh
  cd "$(git rev-parse --show-toplevel)"
  git add README.md flower-backend/README.md
  git commit -m "docs: document Dockerized buf codegen + golang:1.25-alpine go tests

Both READMEs now describe the no-host-toolchain workflow: tools/docker/buf.sh
and the optional compose 'codegen' service (pinned bufbuild/buf:1.47.2) for
proto stubs, and golang:1.25-alpine for the Go test suite. Note that generated
stubs stay committed and that the pinned tag yields a zero-diff regen, plus a
one-line note on v2 generation (sunflower/rhodonea/superformula + palettes).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

Notes for the assembler / implementer, grounded in the real files I read:

- This task is docs-only and depends on `tools/docker/buf.sh` and the compose `codegen` service existing (created in the earlier codegen tasks per the plan's "File structure" list). If this task runs before those land, the documented commands are still correct-by-contract; only the manual "run `./tools/docker/buf.sh`" smoke check would need those files present.
- Real current state confirmed: root `README.md` Dev Tooling table is at lines 114-120 and currently lists only `docker-compose.yml` + `tools/docker/deploy.sh`; the "gRPC-Web over REST" section is lines 206-207 and already references Buf/`gen/`. `flower-backend/README.md` step 1 (lines 34-39) lists "Go 1.25+" and "Buf CLI" as installs; "Run tests" (lines 78-82) uses bare `go test ./...`; "Development commands" (lines 96-108) uses bare `buf generate`. `.gitattributes` enforces `*.sh text eol=lf`. gen stubs are git-tracked (`service.pb.go`, `service_grpc.pb.go`, `service_pb.ts`, `service_connect.ts`); `.dockerignore` excludes README/API docs but not `gen/`.
