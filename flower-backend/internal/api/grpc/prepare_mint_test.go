package grpcapi

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"flower-backend/internal/flower"
	"flower-backend/internal/nft"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestValidateImagePng(t *testing.T) {
	if err := validateImagePng(nil); err != nil {
		t.Errorf("nil image: got %v, want nil", err)
	}
	if err := validateImagePng(make([]byte, maxImagePngBytes)); err != nil {
		t.Errorf("exactly 2MiB: got %v, want nil", err)
	}
	err := validateImagePng(make([]byte, maxImagePngBytes+1))
	if status.Code(err) != codes.InvalidArgument {
		t.Errorf("2MiB+1: got code %v (err=%v), want InvalidArgument", status.Code(err), err)
	}
}

// buildMintMetadata is the wiring PrepareMint depends on: it must thread the
// flower row's real PersonName (not a hardcoded value) and the uploaded
// imageURL into the metadata JSON. This guards against a regression that
// hardcodes the name or drops the image URL, without needing a live
// Store/Uploader.
func TestBuildMintMetadataUsesRealPersonName(t *testing.T) {
	p := flower.GenerateFromName("Ada Lovelace")
	f := &FlowerRow{
		FlowerID:   "flower-123",
		PersonName: "Ada Lovelace",
		Params:     p,
	}

	raw, err := buildMintMetadata(f, "https://cdn.example.com/images/flower-123.png")
	if err != nil {
		t.Fatalf("buildMintMetadata returned error: %v", err)
	}

	var m nft.Metadata
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("failed to unmarshal metadata: %v", err)
	}

	// This is the crux of the regression this test guards against: if
	// PrepareMint (or this helper) ever hardcodes the name instead of
	// pulling f.PersonName, this assertion fails because m.Name would be
	// "Flower for unknown" instead of containing the real name.
	if !strings.Contains(m.Name, "Ada Lovelace") {
		t.Errorf("metadata Name = %q, want it to contain real PersonName %q", m.Name, f.PersonName)
	}
	if m.Image != "https://cdn.example.com/images/flower-123.png" {
		t.Errorf("metadata Image = %q, want the uploaded image URL threaded through", m.Image)
	}
}

func TestBuildMintMetadataFallsBackToUnknownForEmptyPersonName(t *testing.T) {
	p := flower.GenerateFromName("placeholder")
	f := &FlowerRow{
		FlowerID:   "flower-456",
		PersonName: "", // legacy row written before person_name was loaded
		Params:     p,
	}

	raw, err := buildMintMetadata(f, "")
	if err != nil {
		t.Fatalf("buildMintMetadata returned error: %v", err)
	}

	var m nft.Metadata
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("failed to unmarshal metadata: %v", err)
	}

	if !strings.Contains(m.Name, "unknown") {
		t.Errorf("metadata Name = %q, want fallback to contain %q", m.Name, "unknown")
	}
}

func TestBuildMintMetadataOmitsImageWhenURLEmpty(t *testing.T) {
	p := flower.GenerateFromName("Grace Hopper")
	f := &FlowerRow{
		FlowerID:   "flower-789",
		PersonName: "Grace Hopper",
		Params:     p,
	}

	raw, err := buildMintMetadata(f, "")
	if err != nil {
		t.Fatalf("buildMintMetadata returned error: %v", err)
	}

	var m nft.Metadata
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("failed to unmarshal metadata: %v", err)
	}

	if m.Image != "" {
		t.Errorf("metadata Image = %q, want empty when no image was uploaded", m.Image)
	}
	// omitempty on Image means the key itself should be absent from the JSON.
	if strings.Contains(string(raw), `"image"`) {
		t.Errorf("raw metadata JSON contains an image field despite empty imageURL: %s", raw)
	}
}

// TestBuildMintMetadataPersonNameNotHardcoded is a focused RED-catcher: it
// uses two different rows with different PersonNames and asserts the
// resulting metadata names differ. If someone "simplifies" buildMintMetadata
// by hardcoding a literal name (e.g. always "unknown" or a fixed string),
// this test fails because both outputs would be identical / wrong.
func TestBuildMintMetadataPersonNameNotHardcoded(t *testing.T) {
	pA := flower.GenerateFromName("Alice")
	pB := flower.GenerateFromName("Bob")

	rawA, err := buildMintMetadata(&FlowerRow{FlowerID: "f-a", PersonName: "Alice", Params: pA}, "")
	if err != nil {
		t.Fatalf("buildMintMetadata(Alice) error: %v", err)
	}
	rawB, err := buildMintMetadata(&FlowerRow{FlowerID: "f-b", PersonName: "Bob", Params: pB}, "")
	if err != nil {
		t.Fatalf("buildMintMetadata(Bob) error: %v", err)
	}

	var mA, mB nft.Metadata
	if err := json.Unmarshal(rawA, &mA); err != nil {
		t.Fatalf("unmarshal A: %v", err)
	}
	if err := json.Unmarshal(rawB, &mB); err != nil {
		t.Fatalf("unmarshal B: %v", err)
	}

	if !strings.Contains(mA.Name, "Alice") {
		t.Errorf("metadata for row A: Name = %q, want it to contain %q", mA.Name, "Alice")
	}
	if !strings.Contains(mB.Name, "Bob") {
		t.Errorf("metadata for row B: Name = %q, want it to contain %q", mB.Name, "Bob")
	}
	if mA.Name == mB.Name {
		t.Errorf("expected different PersonNames to produce different metadata Name fields, both got %q", mA.Name)
	}
}

// fakeImageExister is a test double for imageExister, letting resolveImageURL's
// decision logic (Finding 2) be exercised without a live/mock S3 endpoint —
// mirrors the "no S3 seam for this" fallback: unit-test the extracted helper.
type fakeImageExister struct {
	exists    bool
	existsErr error
	url       string
	urlErr    error
}

func (f *fakeImageExister) Exists(ctx context.Context, key string) (bool, error) {
	return f.exists, f.existsErr
}

func (f *fakeImageExister) PublicURL(key string) (string, error) {
	return f.url, f.urlErr
}

// TestResolveImageURLReusesExistingImage is the crux of Finding 2: a
// re-prepare with no fresh image_png (req.ImagePng empty, so PrepareMint
// takes the "no upload" branch) must not leave the metadata imageless if a
// prior PrepareMint call already uploaded an image for this flower. Without
// this fix, re-preparing to retry a failed mint (e.g. captureFlowerPng
// returned null) would silently strip the picture from the already-minted
// token's metadata.
func TestResolveImageURLReusesExistingImage(t *testing.T) {
	f := &fakeImageExister{exists: true, url: "https://cdn.example.com/images/flower-123.png"}

	got, err := resolveImageURL(context.Background(), f, "images/flower-123.png")
	if err != nil {
		t.Fatalf("resolveImageURL returned error: %v", err)
	}
	if got != "https://cdn.example.com/images/flower-123.png" {
		t.Errorf("resolveImageURL = %q, want the existing image's public URL", got)
	}
}

func TestResolveImageURLReturnsEmptyWhenNoImageEverUploaded(t *testing.T) {
	f := &fakeImageExister{exists: false}

	got, err := resolveImageURL(context.Background(), f, "images/never-uploaded.png")
	if err != nil {
		t.Fatalf("resolveImageURL returned error: %v", err)
	}
	if got != "" {
		t.Errorf("resolveImageURL = %q, want empty when no image was ever uploaded for this flower", got)
	}
}

func TestResolveImageURLPropagatesExistsError(t *testing.T) {
	wantErr := errors.New("s3 unavailable")
	f := &fakeImageExister{existsErr: wantErr}

	_, err := resolveImageURL(context.Background(), f, "images/flower-123.png")
	if !errors.Is(err, wantErr) {
		t.Errorf("resolveImageURL error = %v, want it to propagate the Exists error instead of masking it as \"no image\"", err)
	}
}
