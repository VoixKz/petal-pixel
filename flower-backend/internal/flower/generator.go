package flower

import (
	"crypto/sha256"
	"encoding/binary"
	"math"
	"strings"
	"unicode"
)

const (
	AlgoVersion   = "v2"
	SchemaVersion = "v2"
)

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

func normalizeName(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	var b strings.Builder
	b.Grow(len(s))
	space := false
	for _, r := range s {
		if unicode.IsSpace(r) {
			space = true
			continue
		}
		if space && b.Len() > 0 {
			b.WriteByte(' ')
		}
		space = false
		b.WriteRune(unicode.ToLower(r))
	}
	return b.String()
}

func seedFromString(s string) uint64 {
	sum := sha256.Sum256([]byte(s))
	return binary.LittleEndian.Uint64(sum[0:8])
}

// splitmix64 is a small deterministic PRNG (not crypto).
type splitmix64 struct{ x uint64 }

func newSplitMix64(seed uint64) *splitmix64 { return &splitmix64{x: seed} }

func (r *splitmix64) next() uint64 {
	r.x += 0x9e3779b97f4a7c15
	z := r.x
	z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9
	z = (z ^ (z >> 27)) * 0x94d049bb133111eb
	return z ^ (z >> 31)
}

func (r *splitmix64) Uint32n(n uint32) uint32 {
	if n == 0 {
		return 0
	}
	return uint32(r.next() % uint64(n))
}

func (r *splitmix64) Float64() float64 {
	// 53-bit precision float in [0,1)
	return float64(r.next()>>11) * (1.0 / (1 << 53))
}

// FloatRange returns a float64 in [min, max).
func (r *splitmix64) FloatRange(min, max float64) float64 { return min + r.Float64()*(max-min) }

// IntRange returns an int in [min, max] (inclusive).
func (r *splitmix64) IntRange(min, max int) int {
	return min + int(r.Uint32n(uint32(max-min+1)))
}

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

// familyTable holds the weighted family entries (weights sum to 100).
var familyTable = []struct {
	name string
	w    int
}{
	{"classic", 22}, {"rose", 18}, {"zinnia", 11}, {"camellia", 10},
	{"lotus", 9}, {"dahlia", 9}, {"sunflower", 8}, {"rhodonea", 7}, {"superformula", 6},
}

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
		K:             uint32(stream(seed, "rhodonea.k").IntRange(2, 9)),
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
		Scale:    float32(stream(seed, "superformula.scale").FloatRange(200, 360)),
		M1:       float32(stream(seed, "superformula.m1").FloatRange(4, 12)),   // >=4 for lobes
		N1a:      float32(stream(seed, "superformula.n1a").FloatRange(0.30, 1.20)), // >0
		N2a:      float32(stream(seed, "superformula.n2a").FloatRange(0.40, 1.80)),
		N3a:      float32(stream(seed, "superformula.n3a").FloatRange(0.40, 1.80)),
		A1:       float32(stream(seed, "superformula.a1").FloatRange(0.85, 1.15)),
		B1:       float32(stream(seed, "superformula.b1").FloatRange(0.85, 1.15)),
		M2:       float32(stream(seed, "superformula.m2").FloatRange(1, 6)),
		N1b:      float32(stream(seed, "superformula.n1b").FloatRange(0.60, 1.60)), // >0
		N2b:      float32(stream(seed, "superformula.n2b").FloatRange(0.60, 1.60)),
		N3b:      float32(stream(seed, "superformula.n3b").FloatRange(0.60, 1.60)),
		A2:       float32(stream(seed, "superformula.a2").FloatRange(0.85, 1.15)),
		B2:       float32(stream(seed, "superformula.b2").FloatRange(0.85, 1.15)),
		USeg:     uint32(stream(seed, "superformula.u_seg").IntRange(120, 340)),
		VSeg:     uint32(stream(seed, "superformula.v_seg").IntRange(80, 200)),
		SatShift: float32(stream(seed, "superformula.sat_shift").FloatRange(-0.15, 0.15)),
		BriShift: float32(stream(seed, "superformula.bri_shift").FloatRange(-0.12, 0.12)),
	}
}

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
