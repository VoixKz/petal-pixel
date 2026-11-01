package grpcapi

import (
	"testing"

	flowerv1 "flower-backend/gen/go/flower/v1"
	"flower-backend/internal/flower"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// toProtoParams must map v1 scalars, family, a non-nil palette with >=2 stops,
// and EXACTLY the oneof case matching Params.Family.
func TestToProtoParamsScalarsFamilyPalette(t *testing.T) {
	p := flower.GenerateFromName("Ada Lovelace")
	got, err := toProtoParams(p)
	if err != nil {
		t.Fatalf("toProtoParams: %v", err)
	}

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
		got, err := toProtoParams(p)
		if err != nil {
			t.Fatalf("toProtoParams(%q): %v", name, err)
		}
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

// TestToProtoParamsShapelessReturnsFailedPrecondition verifies that a
// flower.Params carrying a family but NO shape pointer (modelling a legacy DB
// row written before per-family shapes existed) does not panic — which would
// crash the handler and kill the grpc-web connection — but instead surfaces a
// FailedPrecondition the caller can return.
func TestToProtoParamsShapelessReturnsFailedPrecondition(t *testing.T) {
	p := flower.Params{Family: "classic"} // no Classic/Rose/Bloom/Sunflower/Rhodonea/Superformula set
	got, err := toProtoParams(p)
	if got != nil {
		t.Errorf("params = %v, want nil on shapeless input", got)
	}
	if status.Code(err) != codes.FailedPrecondition {
		t.Fatalf("code = %v (err=%v), want FailedPrecondition", status.Code(err), err)
	}
}
