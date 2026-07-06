package nft

import (
	"encoding/json"
	"testing"
)

func TestBuildMetadataUsesPersonNameAndImageURL(t *testing.T) {
	url := "http://localhost:9000/assets/images/f_abc123.png"
	b, err := BuildMetadata("Ada Lovelace", "f_abc123", 42, "v2", url, nil)
	if err != nil {
		t.Fatalf("BuildMetadata: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got, want := m["name"], "Flower for Ada Lovelace"; got != want {
		t.Errorf("name = %v, want %v", got, want)
	}
	if got := m["image"]; got != url {
		t.Errorf("image = %v, want %v", got, url)
	}
}

func TestBuildMetadataOmitsImageWhenEmpty(t *testing.T) {
	b, err := BuildMetadata("Ada Lovelace", "f_abc123", 42, "v2", "", nil)
	if err != nil {
		t.Fatalf("BuildMetadata: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if _, ok := m["image"]; ok {
		t.Errorf("image key present for empty imageURL, want omitted (omitempty)")
	}
}
