package flower

import (
	"crypto/sha256"
	"encoding/binary"
	"math"
	"strings"
	"unicode"
)

const (
	AlgoVersion   = "v1"
	SchemaVersion = "v1"
)

type Params struct {
	AlgoVersion   string
	SchemaVersion string
	Seed          uint64

	PetalCount uint32
	PetalLength float32
	PetalWidth  float32
	Curvature   float32
	StemHeight  float32
	Hue         float32
}

func GenerateFromName(name string) Params {
	norm := normalizeName(name)
	seed := seedFromString(norm)
	r := newSplitMix64(seed)

	// Keep ranges conservative; frontend can remap if needed.
	petalCount := uint32(5 + r.Uint32n(16)) // 5..20

	petalLength := float32(0.4 + r.Float64()*1.2) // 0.4..1.6
	petalWidth := float32(0.15 + r.Float64()*0.6)  // 0.15..0.75
	curvature := float32(-0.8 + r.Float64()*1.6)   // -0.8..0.8
	stemHeight := float32(0.5 + r.Float64()*2.0)   // 0.5..2.5
	hue := float32(math.Mod(r.Float64()*360.0, 360.0))

	return Params{
		AlgoVersion:   AlgoVersion,
		SchemaVersion: SchemaVersion,
		Seed:          seed,
		PetalCount:    petalCount,
		PetalLength:   petalLength,
		PetalWidth:    petalWidth,
		Curvature:     curvature,
		StemHeight:    stemHeight,
		Hue:           hue,
	}
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

