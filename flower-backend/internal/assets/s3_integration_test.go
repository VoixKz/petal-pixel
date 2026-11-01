package assets

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

// newRealS3 runs against a real S3 server, because the promises these tests pin
// (write-once uploads, public reads) belong to the server, not to our code. Set
// TEST_S3_ENDPOINT to enable them.
func newRealS3(t *testing.T) (*S3Uploader, string) {
	t.Helper()
	endpoint := os.Getenv("TEST_S3_ENDPOINT")
	if endpoint == "" {
		t.Skip("TEST_S3_ENDPOINT not set")
	}
	bucket := fmt.Sprintf("test-%d", time.Now().UnixNano())
	publicBase := endpoint + "/" + bucket
	u, err := NewS3Uploader(context.Background(), S3Config{
		Endpoint:        endpoint,
		AccessKeyID:     os.Getenv("TEST_S3_ACCESS_KEY"),
		SecretAccessKey: os.Getenv("TEST_S3_SECRET_KEY"),
		Bucket:          bucket,
		PublicBaseURL:   publicBase,
		ForcePathStyle:  true,
	})
	if err != nil {
		t.Fatalf("new uploader: %v", err)
	}
	ctx := context.Background()
	if err := u.EnsureBucket(ctx); err != nil {
		t.Fatalf("ensure bucket: %v", err)
	}
	if err := u.AllowPublicRead(ctx); err != nil {
		t.Fatalf("allow public read: %v", err)
	}
	return u, publicBase
}

func TestRealS3PutOnceKeepsTheFirstBytes(t *testing.T) {
	u, _ := newRealS3(t)
	ctx := context.Background()
	if _, err := u.PutOnce(ctx, "nft/a.json", "application/json", []byte("first")); err != nil {
		t.Fatalf("first PutOnce: %v", err)
	}

	if _, err := u.PutOnce(ctx, "nft/a.json", "application/json", []byte("second")); err != nil {
		t.Fatalf("second PutOnce: %v", err)
	}

	got, found, err := u.Get(ctx, "nft/a.json")
	if err != nil || !found {
		t.Fatalf("Get: found = %v, err = %v", found, err)
	}
	if string(got) != "first" {
		t.Errorf("object changed to %q", got)
	}
}

func TestRealS3PutBytesReplaces(t *testing.T) {
	u, _ := newRealS3(t)
	ctx := context.Background()
	for _, body := range []string{"first", "second"} {
		if _, err := u.PutBytes(ctx, "previews/a.png", "image/png", strings.NewReader(body)); err != nil {
			t.Fatalf("PutBytes: %v", err)
		}
	}

	got, _, err := u.Get(ctx, "previews/a.png")
	if err != nil || string(got) != "second" {
		t.Errorf("Get = %q, %v", got, err)
	}
}

func TestRealS3ReportsMissingObjects(t *testing.T) {
	u, _ := newRealS3(t)
	ctx := context.Background()

	_, found, err := u.Get(ctx, "nft/none.png")
	if err != nil || found {
		t.Errorf("Get: found = %v, err = %v", found, err)
	}
	exists, err := u.Exists(ctx, "nft/none.png")
	if err != nil || exists {
		t.Errorf("Exists = %v, %v", exists, err)
	}
}

func TestRealS3EnsureBucketIsRepeatable(t *testing.T) {
	u, _ := newRealS3(t)

	if err := u.EnsureBucket(context.Background()); err != nil {
		t.Errorf("second EnsureBucket: %v", err)
	}
	if err := u.AllowPublicRead(context.Background()); err != nil {
		t.Errorf("second AllowPublicRead: %v", err)
	}
}

// A wallet fetches the token URI with no credentials at all.
func TestRealS3AnyoneCanReadAnObject(t *testing.T) {
	u, publicBase := newRealS3(t)
	url, err := u.PutOnce(context.Background(), "nft/a.json", "application/json", []byte(`{"name":"Anna"}`))
	if err != nil {
		t.Fatalf("PutOnce: %v", err)
	}
	if url != publicBase+"/nft/a.json" {
		t.Fatalf("url = %q", url)
	}

	res, err := http.Get(url)
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)

	if res.StatusCode != http.StatusOK || string(body) != `{"name":"Anna"}` {
		t.Errorf("status = %d, body = %q", res.StatusCode, body)
	}
	if got := res.Header.Get("Content-Type"); got != "application/json" {
		t.Errorf("content type = %q", got)
	}
}

func TestRealS3StrangersCannotWrite(t *testing.T) {
	u, publicBase := newRealS3(t)
	ctx := context.Background()
	if _, err := u.PutOnce(ctx, "nft/a.json", "application/json", []byte("first")); err != nil {
		t.Fatalf("PutOnce: %v", err)
	}

	req, err := http.NewRequest(http.MethodPut, publicBase+"/nft/a.json", strings.NewReader("forged"))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("PUT: %v", err)
	}
	res.Body.Close()

	if res.StatusCode != http.StatusForbidden {
		t.Errorf("anonymous PUT status = %d, want 403", res.StatusCode)
	}
	if got, _, err := u.Get(ctx, "nft/a.json"); err != nil || string(got) != "first" {
		t.Errorf("object = %q, %v", got, err)
	}
}

func TestRealS3StrangersCannotListTheBucket(t *testing.T) {
	u, publicBase := newRealS3(t)
	if _, err := u.PutOnce(context.Background(), "nft/a.json", "application/json", []byte("x")); err != nil {
		t.Fatalf("PutOnce: %v", err)
	}

	res, err := http.Get(publicBase + "/")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)

	if res.StatusCode == http.StatusOK || strings.Contains(string(body), "nft/a.json") {
		t.Errorf("anonymous listing: status = %d, body = %.120s", res.StatusCode, body)
	}
}
