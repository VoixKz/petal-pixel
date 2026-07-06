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
	var mu sync.Mutex
	contentTypes := map[string]string{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		contentTypes[r.URL.Path] = r.Header.Get("Content-Type")
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
	return u, func(path string) string {
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
