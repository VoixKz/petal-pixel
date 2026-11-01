package flower

import (
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"math"
)

// ColorStop is a single point in a gradient: Position in [0,1], Hex in "#rrggbb",
// R/G/B in sRGB [0,1]. Hex must always be consistent with round(R/G/B*255).
type ColorStop struct {
	Position float32 `json:"position"`
	Hex      string  `json:"hex"`
	R        float32 `json:"r"`
	G        float32 `json:"g"`
	B        float32 `json:"b"`
}

// PaletteSpec is the proto-ready palette representation: ID identifies the base
// catalog entry, Stops are post-shift (baked), and HueShift/SatShift/BriShift
// record provenance. Mapped to proto flowerv1.PaletteSpec by Task 4.
type PaletteSpec struct {
	ID       string      `json:"id"`
	Stops    []ColorStop `json:"stops"`
	HueShift float32     `json:"hue_shift"`
	SatShift float32     `json:"sat_shift"`
	BriShift float32     `json:"bri_shift"`
}

// paletteDef is a curated base gradient. Stops are sRGB in [0,1], ascending
// Position from 0 to 1. buildPalette bakes name-derived HSB shifts into a copy.
type paletteDef struct {
	id    string
	stops []ColorStop
}

// stop is a small constructor: fills Hex/R/G/B from r,g,b; Position set by caller.
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

// warmPaletteIDs are the warm/pink/gold catalog entries. Families whose real-world
// counterpart is never teal/blue (rose, camellia, dahlia, sunflower) are restricted
// to this subset so a "rose" name can never bake into an ocean-teal rose.
var warmPaletteIDs = map[string]bool{
	"sunset_coral": true, "blush_rose": true, "golden_hour": true, "crimson_velvet": true,
	"tangerine_pop": true, "peach_cream": true, "magenta_dream": true, "honey_amber": true,
	"cherry_snow": true, "plum_wine": true, "saffron_gold": true, "rose_quartz": true,
	"coral_reef": true, "violet_ember": true,
}

// warmFamily reports whether family must be restricted to the warm/pink/gold
// palette allow-list. Abstract/exotic families (rhodonea/superformula/zinnia/
// classic/lotus) are unrestricted and may draw any catalog entry, including cool
// teal/blue/green ones.
func warmFamily(family string) bool {
	switch family {
	case "rose", "camellia", "dahlia", "sunflower":
		return true
	}
	return false
}

// paletteIndicesFor returns the catalog indices allowed for family: the warm
// subset for warm families, or the full catalog otherwise. Never empty (14 warm
// ids exist in the 20-entry catalog).
func paletteIndicesFor(family string) []int {
	idx := make([]int, 0, len(paletteCatalog))
	warm := warmFamily(family)
	for i, d := range paletteCatalog {
		if !warm || warmPaletteIDs[d.id] {
			idx = append(idx, i)
		}
	}
	return idx
}

// buildPalette picks a catalog entry deterministically from seed (restricted to
// family's allowed subset), draws name-derived hue/sat/bri shifts, BAKES them
// into every stop (both Hex and R/G/B post-shift), applies a brightness
// guardrail so no palette ever bakes down to a muddy near-black blob, and
// echoes the shift values on PaletteSpec for provenance (contract lines 342-357).
//
// NOTE: uses paletteStream (palette-local helper) rather than the package-level stream/
// deriveSeed/FloatRange/IntRange that Task 3 will add to generator.go.  When Task 3
// lands, no rename is needed — paletteStream is intentionally distinct to avoid collision.
func buildPalette(seed uint64, family string) *PaletteSpec {
	allowed := paletteIndicesFor(family)
	pick := paletteStream(seed, "palette.pick")
	base := paletteCatalog[allowed[pick.paletteIntRange(0, len(allowed)-1)]]

	hueShift := float32(paletteStream(seed, "palette.hue_shift").paletteFloatRange(-30, 30))
	satShift := float32(paletteStream(seed, "palette.sat_shift").paletteFloatRange(-0.12, 0.18)) // multiplicative, +biased; additive -0.20 nuked pastels to gray
	briShift := float32(paletteStream(seed, "palette.bri_shift").paletteFloatRange(-0.15, 0.15))

	type hsbTmp struct{ h, s, v float32 }
	tmp := make([]hsbTmp, len(base.stops))
	maxV := float32(0)
	for i, s := range base.stops {
		h, sat, val := srgbToHSB(s.R, s.G, s.B)
		h = float32(math.Mod(float64(h+hueShift)+360, 360)) // wrap hue into [0,360)
		sat = clamp01(sat * (1 + satShift))
		val = clamp01(val + briShift)
		tmp[i] = hsbTmp{h, sat, val}
		if val > maxV {
			maxV = val
		}
	}
	// Brightness guardrail: if the brightest stop is muddy, scale ALL values up so
	// the brightest reaches ~0.9 (preserves the gradient shape); then floor every stop.
	if maxV > 0 && maxV < 0.65 {
		k := 0.9 / maxV
		for i := range tmp {
			tmp[i].v = clamp01(tmp[i].v * k)
		}
	}
	baked := make([]ColorStop, len(base.stops))
	for i, c := range tmp {
		v := c.v
		if v < 0.30 {
			v = 0.30
		}
		r, g, b := hsbToSRGB(c.h, c.s, v)
		baked[i] = ColorStop{Position: base.stops[i].Position, Hex: hexOf(r, g, b), R: r, G: g, B: b}
	}

	return &PaletteSpec{
		ID:       base.id,
		Stops:    baked,
		HueShift: hueShift,
		SatShift: satShift,
		BriShift: briShift,
	}
}

// ---- palette-local PRNG helpers ----
// These use the same splitmix64 type (defined in generator.go) but derive an
// independent sub-stream per (seed, salt) pair.  They are named palette* to
// avoid collision with the stream/deriveSeed/FloatRange/IntRange names that
// Task 3 will introduce in generator.go (same package).

// paletteSalt derives a deterministic sub-seed from a base seed and a string salt.
func paletteSalt(base uint64, salt string) uint64 {
	sum := sha256.Sum256(append(binary.LittleEndian.AppendUint64(nil, base), []byte(salt)...))
	return binary.LittleEndian.Uint64(sum[0:8])
}

// paletteStream returns a fresh splitmix64 seeded from (seed, salt).
func paletteStream(seed uint64, salt string) *splitmix64 {
	return newSplitMix64(paletteSalt(seed, salt))
}

// paletteFloatRange draws a float64 in [min, max] from the PRNG.
func (r *splitmix64) paletteFloatRange(min, max float64) float64 {
	return min + r.Float64()*(max-min)
}

// paletteIntRange draws an int in [min, max] inclusive from the PRNG.
func (r *splitmix64) paletteIntRange(min, max int) int {
	if max <= min {
		return min
	}
	n := uint64(max-min) + 1
	return min + int(r.next()%n)
}

// ---- sRGB <-> HSB helpers ----

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
// round(r*255), round(g*255), round(b*255) (contract ColorStop consistency rule).
func hexOf(r, g, b float32) string {
	return fmt.Sprintf("#%02x%02x%02x", to255(r), to255(g), to255(b))
}

// ---- internal numeric helpers ----

func clamp01(v float32) float32 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

func to255(v float32) int {
	n := int(math.Round(float64(clamp01(v)) * 255))
	if n < 0 {
		return 0
	}
	if n > 255 {
		return 255
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
