package assets

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func newFakeS3(t *testing.T) (*S3Uploader, func(path string) string) {
	t.Helper()
	u, _, ctOf := newFakeS3WithObjects(t, nil)
	return u, ctOf
}

// newFakeS3WithObjects is like newFakeS3 but also serves HeadObject requests:
// paths in existingObjects respond 200 (object present), everything else
// responds 404 (matches real S3's HeadObject-on-missing-key behavior). The
// returned putObject func lets a test mark a path as "uploaded" after the
// fact, mirroring what PutBytes does against a real bucket.
func newFakeS3WithObjects(t *testing.T, existingObjects map[string]bool) (*S3Uploader, func(path string), func(path string) string) {
	t.Helper()
	var mu sync.Mutex
	contentTypes := map[string]string{}
	objects := map[string]bool{}
	for k, v := range existingObjects {
		objects[k] = v
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodHead {
			mu.Lock()
			exists := objects[r.URL.Path]
			mu.Unlock()
			if !exists {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			w.Header().Set("ETag", `"test-etag"`)
			w.WriteHeader(http.StatusOK)
			return
		}
		mu.Lock()
		contentTypes[r.URL.Path] = r.Header.Get("Content-Type")
		objects[r.URL.Path] = true
		mu.Unlock()
		w.Header().Set("ETag", `"test-etag"`)
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)

	u, err := NewS3Uploader(context.Background(), S3Config{
		Endpoint:        srv.URL,
		AccessKeyID:     "test",
		SecretAccessKey: "test",
		Bucket:          "assets",
		PublicBaseURL:   srv.URL + "/assets",
		ForcePathStyle:  true,
	})
	if err != nil {
		t.Fatalf("NewS3Uploader: %v", err)
	}
	putObject := func(path string) {
		mu.Lock()
		objects[path] = true
		mu.Unlock()
	}
	return u, putObject, func(path string) string {
		mu.Lock()
		defer mu.Unlock()
		return contentTypes[path]
	}
}

func TestPutBytesSetsContentType(t *testing.T) {
	u, ctOf := newFakeS3(t)
	url, err := u.PutBytes(context.Background(), "images/f_abc123.png", "image/png",
		bytes.NewReader([]byte{0x89, 'P', 'N', 'G'}))
	if err != nil {
		t.Fatalf("PutBytes: %v", err)
	}
	if got := ctOf("/assets/images/f_abc123.png"); got != "image/png" {
		t.Errorf("Content-Type = %q, want image/png", got)
	}
	if !strings.HasSuffix(url, "/assets/images/f_abc123.png") {
		t.Errorf("public URL = %q, want suffix /assets/images/f_abc123.png", url)
	}
}

func TestPutJSONDelegatesWithJSONContentType(t *testing.T) {
	u, ctOf := newFakeS3(t)
	if _, err := u.PutJSON(context.Background(), "metadata/f_abc123.json", []byte(`{"a":1}`)); err != nil {
		t.Fatalf("PutJSON: %v", err)
	}
	if got := ctOf("/assets/metadata/f_abc123.json"); got != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", got)
	}
}

// Finding 2: PrepareMint needs Exists to decide whether a re-prepare without
// a fresh image_png can reuse a previously-uploaded image instead of
// silently stripping it from the metadata. These tests guard the two halves
// of that contract: true after a real upload, false for a key that was
// never written.
func TestExistsReturnsTrueAfterPutBytes(t *testing.T) {
	u, _, _ := newFakeS3WithObjects(t, nil)
	ctx := context.Background()
	if _, err := u.PutBytes(ctx, "images/flower-1.png", "image/png", bytes.NewReader([]byte{0x89, 'P', 'N', 'G'})); err != nil {
		t.Fatalf("PutBytes: %v", err)
	}

	exists, err := u.Exists(ctx, "images/flower-1.png")
	if err != nil {
		t.Fatalf("Exists: %v", err)
	}
	if !exists {
		t.Errorf("Exists = false, want true after PutBytes wrote the key")
	}
}

func TestExistsReturnsFalseForMissingKey(t *testing.T) {
	u, _, _ := newFakeS3WithObjects(t, nil)
	exists, err := u.Exists(context.Background(), "images/never-uploaded.png")
	if err != nil {
		t.Fatalf("Exists: %v", err)
	}
	if exists {
		t.Errorf("Exists = true, want false for a key that was never uploaded")
	}
}

func TestPublicURLMatchesPutBytesURL(t *testing.T) {
	u, _, _ := newFakeS3WithObjects(t, nil)
	ctx := context.Background()
	uploaded, err := u.PutBytes(ctx, "images/flower-2.png", "image/png", bytes.NewReader([]byte{0x89, 'P', 'N', 'G'}))
	if err != nil {
		t.Fatalf("PutBytes: %v", err)
	}
	got, err := u.PublicURL("images/flower-2.png")
	if err != nil {
		t.Fatalf("PublicURL: %v", err)
	}
	if got != uploaded {
		t.Errorf("PublicURL = %q, want it to match the URL PutBytes returned (%q)", got, uploaded)
	}
}
