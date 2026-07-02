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
