package assets

import (
	"bytes"
	"context"
	"io"
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

// newStrictFakeS3 honours If-None-Match and serves GET, so a test can prove an
// existing object keeps its first bytes.
func newStrictFakeS3(t *testing.T) (*S3Uploader, map[string][]byte) {
	t.Helper()
	var mu sync.Mutex
	objects := map[string][]byte{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		switch r.Method {
		case http.MethodGet:
			body, ok := objects[r.URL.Path]
			if !ok {
				w.Header().Set("Content-Type", "application/xml")
				w.WriteHeader(http.StatusNotFound)
				_, _ = w.Write([]byte(`<Error><Code>NoSuchKey</Code><Message>missing</Message></Error>`))
				return
			}
			_, _ = w.Write(body)
		case http.MethodPut:
			if _, exists := objects[r.URL.Path]; exists && r.Header.Get("If-None-Match") == "*" {
				w.Header().Set("Content-Type", "application/xml")
				w.WriteHeader(http.StatusPreconditionFailed)
				_, _ = w.Write([]byte(`<Error><Code>PreconditionFailed</Code><Message>exists</Message></Error>`))
				return
			}
			body, _ := io.ReadAll(r.Body)
			objects[r.URL.Path] = body
			w.Header().Set("ETag", `"test-etag"`)
		}
	}))
	t.Cleanup(srv.Close)

	u, err := NewS3Uploader(context.Background(), S3Config{
		Endpoint:        srv.URL,
		AccessKeyID:     "test",
		SecretAccessKey: "test",
		Bucket:          "assets",
		PublicBaseURL:   "http://files/assets",
		ForcePathStyle:  true,
	})
	if err != nil {
		t.Fatalf("new uploader: %v", err)
	}
	return u, objects
}

func TestPutOnceWritesNewObject(t *testing.T) {
	u, objects := newStrictFakeS3(t)

	got, err := u.PutOnce(context.Background(), "nft/abc.png", "image/png", []byte("first"))

	if err != nil {
		t.Fatalf("PutOnce: %v", err)
	}
	if got != "http://files/assets/nft/abc.png" {
		t.Errorf("url = %q", got)
	}
	if string(objects["/assets/nft/abc.png"]) != "first" {
		t.Errorf("stored = %q", objects["/assets/nft/abc.png"])
	}
}

// A second write of a content-addressed key is not an error: the bytes match by
// construction, and the caller still needs the URL.
func TestPutOnceKeepsExistingObject(t *testing.T) {
	u, objects := newStrictFakeS3(t)
	ctx := context.Background()
	if _, err := u.PutOnce(ctx, "nft/abc.png", "image/png", []byte("first")); err != nil {
		t.Fatalf("first PutOnce: %v", err)
	}

	got, err := u.PutOnce(ctx, "nft/abc.png", "image/png", []byte("second"))

	if err != nil {
		t.Fatalf("second PutOnce: %v", err)
	}
	if got != "http://files/assets/nft/abc.png" {
		t.Errorf("url = %q", got)
	}
	if string(objects["/assets/nft/abc.png"]) != "first" {
		t.Errorf("existing object changed to %q", objects["/assets/nft/abc.png"])
	}
}

func TestGetReturnsStoredBytes(t *testing.T) {
	u, _ := newStrictFakeS3(t)
	ctx := context.Background()
	if _, err := u.PutOnce(ctx, "previews/a.png", "image/png", []byte("pixels")); err != nil {
		t.Fatalf("PutOnce: %v", err)
	}

	got, found, err := u.Get(ctx, "previews/a.png")

	if err != nil || !found || string(got) != "pixels" {
		t.Errorf("Get = %q, %v, %v", got, found, err)
	}
}

func TestGetReportsMissingObject(t *testing.T) {
	u, _ := newStrictFakeS3(t)

	got, found, err := u.Get(context.Background(), "previews/none.png")

	if err != nil || found || got != nil {
		t.Errorf("Get = %q, %v, %v, want nothing and no error", got, found, err)
	}
}
