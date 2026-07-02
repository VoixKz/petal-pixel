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
