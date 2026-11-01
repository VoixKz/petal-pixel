package share

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestRenderShareHTMLContainsOGTags(t *testing.T) {
	html := RenderShareHTML(HTMLData{
		FlowerID:    "abc123",
		PersonName:  "Ada Lovelace",
		ImageURL:    "http://localhost:9000/flower/images/abc123.png",
		ImageExists: true,
		ShareURL:    "http://localhost:50051/share/abc123",
		AppURL:      "http://localhost:8080/share/abc123",
	})
	wants := []string{
		`<meta property="og:title" content="Flower for Ada Lovelace"`,
		`<meta property="og:image" content="http://localhost:9000/flower/images/abc123.png"`,
		`<meta property="og:url" content="http://localhost:50051/share/abc123"`,
		`<meta name="twitter:card" content="summary_large_image"`,
		`<title>Flower for Ada Lovelace</title>`,
		`http://localhost:8080/share/abc123`, // human continues to SPA
	}
	for _, w := range wants {
		if !strings.Contains(html, w) {
			t.Errorf("HTML missing %q\n---\n%s", w, html)
		}
	}
}

// When no per-flower image exists, the caller substitutes FallbackImagePath
// (prefixed with FRONTEND_URL) into ImageURL. Assert the fallback flows through
// to both the og:image and twitter:image tags.
func TestRenderShareHTMLUsesFallbackImage(t *testing.T) {
	fallback := "http://localhost:8080" + FallbackImagePath
	html := RenderShareHTML(HTMLData{
		FlowerID:    "noimg",
		PersonName:  "Grace Hopper",
		ImageURL:    fallback,
		ImageExists: false,
		ShareURL:    "http://localhost:50051/share/noimg",
		AppURL:      "http://localhost:8080/share/noimg",
	})
	if FallbackImagePath != "/og-cover.png" {
		t.Fatalf("FallbackImagePath = %q, want /og-cover.png", FallbackImagePath)
	}
	wants := []string{
		`<meta property="og:image" content="http://localhost:8080/og-cover.png"`,
		`<meta name="twitter:image" content="http://localhost:8080/og-cover.png"`,
	}
	for _, w := range wants {
		if !strings.Contains(html, w) {
			t.Errorf("HTML missing fallback %q\n---\n%s", w, html)
		}
	}
}

// A person name carrying HTML/attribute metacharacters must be escaped so it
// cannot break out of the content="" attribute (injection guard).
func TestRenderShareHTMLEscapesPersonName(t *testing.T) {
	html := RenderShareHTML(HTMLData{
		FlowerID:   "x",
		PersonName: `"><script>alert(1)</script>`,
		ImageURL:   "http://localhost:9000/flower/images/x.png",
		ShareURL:   "http://localhost:50051/share/x",
		AppURL:     "http://localhost:8080/share/x",
	})
	if strings.Contains(html, "<script>alert(1)</script>") {
		t.Errorf("person name not escaped; raw <script> present\n---\n%s", html)
	}
}

func TestPublicFlowerJSONShape(t *testing.T) {
	raw := json.RawMessage(`{"seed":42,"family":"rose","algo_version":"v2"}`)
	b, err := PublicFlowerJSON(FlowerData{
		FlowerID:   "abc123",
		PersonName: "Ada Lovelace",
		ParamsJSON: raw,
	})
	if err != nil {
		t.Fatalf("PublicFlowerJSON: %v", err)
	}
	var got map[string]json.RawMessage
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatalf("result not valid JSON: %v", err)
	}
	for _, k := range []string{"flower_id", "person_name", "params"} {
		if _, ok := got[k]; !ok {
			t.Errorf("missing key %q in %s", k, b)
		}
	}
	// params must be the raw object, not a re-stringified blob.
	if string(got["params"]) != string(raw) {
		t.Errorf("params = %s, want passthrough %s", got["params"], raw)
	}
	var fid string
	_ = json.Unmarshal(got["flower_id"], &fid)
	if fid != "abc123" {
		t.Errorf("flower_id = %q, want abc123", fid)
	}
	var pn string
	_ = json.Unmarshal(got["person_name"], &pn)
	if pn != "Ada Lovelace" {
		t.Errorf("person_name = %q, want Ada Lovelace", pn)
	}
}

// A nil/empty ParamsJSON must serialise to JSON null (not the empty string,
// which would be invalid JSON in the params slot).
func TestPublicFlowerJSONNullParams(t *testing.T) {
	b, err := PublicFlowerJSON(FlowerData{FlowerID: "x", PersonName: "y"})
	if err != nil {
		t.Fatalf("PublicFlowerJSON: %v", err)
	}
	var got map[string]json.RawMessage
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatalf("result not valid JSON: %v", err)
	}
	if string(got["params"]) != "null" {
		t.Errorf("params = %s, want null", got["params"])
	}
}
