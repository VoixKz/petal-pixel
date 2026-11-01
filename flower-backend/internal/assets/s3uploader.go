package assets

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"path"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
	smithyhttp "github.com/aws/smithy-go/transport/http"
)

type S3Uploader struct {
	bucket string
	publicBaseURL string
	uploader *manager.Uploader
	client   *s3.Client
}

type S3Config struct {
	Endpoint        string // e.g. https://<ref>.storage.supabase.co/storage/v1/s3 or local S3 URL
	Region          string
	AccessKeyID     string
	SecretAccessKey string
	Bucket          string
	PublicBaseURL   string // e.g. http://localhost:9000/<bucket>
	ForcePathStyle  bool
}

func NewS3Uploader(ctx context.Context, c S3Config) (*S3Uploader, error) {
	region := c.Region
	if region == "" {
		region = "us-east-1"
	}

	loadOpts := []func(*config.LoadOptions) error{
		config.WithRegion(region),
	}
	if c.AccessKeyID != "" || c.SecretAccessKey != "" {
		loadOpts = append(loadOpts, config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(c.AccessKeyID, c.SecretAccessKey, "")))
	}

	awsCfg, err := config.LoadDefaultConfig(ctx, loadOpts...)
	if err != nil {
		return nil, err
	}

	var o []func(*s3.Options)
	if c.Endpoint != "" {
		o = append(o, func(opt *s3.Options) {
			opt.BaseEndpoint = aws.String(c.Endpoint)
			opt.UsePathStyle = c.ForcePathStyle
		})
	}

	client := s3.NewFromConfig(awsCfg, o...)
	return &S3Uploader{
		bucket:        c.Bucket,
		publicBaseURL: strings.TrimRight(c.PublicBaseURL, "/"),
		uploader:      manager.NewUploader(client),
		client:        client,
	}, nil
}

func (u *S3Uploader) EnsureBucket(ctx context.Context) error {
	_, err := u.client.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(u.bucket)})
	if err == nil {
		return nil
	}
	_, err = u.client.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: aws.String(u.bucket)})
	return err
}

// AllowPublicRead lets anyone fetch an object by its exact key. Wallets load NFT
// files with no credentials, while writing and listing stay private.
func (u *S3Uploader) AllowPublicRead(ctx context.Context) error {
	policy := fmt.Sprintf(`{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":"*","Action":["s3:GetObject"],"Resource":["arn:aws:s3:::%s/*"]}]}`, u.bucket)
	_, err := u.client.PutBucketPolicy(ctx, &s3.PutBucketPolicyInput{
		Bucket: aws.String(u.bucket),
		Policy: aws.String(policy),
	})
	return err
}

func (u *S3Uploader) PutBytes(ctx context.Context, key, contentType string, r io.Reader) (string, error) {
	key = strings.TrimLeft(key, "/")
	_, err := u.uploader.Upload(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(u.bucket),
		Key:         aws.String(key),
		Body:        r,
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return "", err
	}
	return u.publicURL(key)
}

// PutOnce stores an object that must never change. Its key comes from its
// content, so a taken key means the same bytes are already there.
func (u *S3Uploader) PutOnce(ctx context.Context, key, contentType string, data []byte) (string, error) {
	key = strings.TrimLeft(key, "/")
	_, err := u.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(u.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(contentType),
		IfNoneMatch: aws.String("*"),
	})
	if err != nil && !isPreconditionFailed(err) {
		return "", err
	}
	return u.publicURL(key)
}

// Get reads an object. A missing object is reported through found, not err.
func (u *S3Uploader) Get(ctx context.Context, key string) (data []byte, found bool, err error) {
	out, err := u.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(u.bucket),
		Key:    aws.String(strings.TrimLeft(key, "/")),
	})
	if err != nil {
		if isNotFound(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	defer out.Body.Close()
	data, err = io.ReadAll(out.Body)
	if err != nil {
		return nil, false, err
	}
	return data, true, nil
}

func (u *S3Uploader) publicURL(key string) (string, error) {
	if u.publicBaseURL == "" {
		return "", fmt.Errorf("public base url not set")
	}
	base, err := url.Parse(u.publicBaseURL)
	if err != nil {
		return "", err
	}
	base.Path = path.Join(base.Path, key)
	return base.String(), nil
}

// Exists reports whether key is already present in the bucket via a
// HeadObject request. Finding 2: PrepareMint needs this to decide whether to
// reuse a previously-uploaded image when re-preparing without a fresh
// image_png, instead of silently dropping the image reference from the
// metadata. A 404/NotFound response is treated as "does not exist" (nil
// error, false); any other error is propagated so callers don't mistake a
// transient failure for a genuinely missing object.
func (u *S3Uploader) Exists(ctx context.Context, key string) (bool, error) {
	key = strings.TrimLeft(key, "/")
	_, err := u.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(u.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		if isNotFound(err) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// isNotFound reports whether err represents a "does not exist" response from
// S3. HeadObject responses carry no body, so the SDK cannot unmarshal a typed
// s3.NotFound error the way GetObject does — it surfaces as a smithy-go HTTP
// response error instead, so we match on the raw HTTP status code.
func isNotFound(err error) bool {
	var notFound *s3types.NotFound
	if errors.As(err, &notFound) {
		return true
	}
	var respErr *smithyhttp.ResponseError
	if errors.As(err, &respErr) {
		return respErr.HTTPStatusCode() == 404
	}
	return false
}

func isPreconditionFailed(err error) bool {
	var respErr *smithyhttp.ResponseError
	return errors.As(err, &respErr) && respErr.HTTPStatusCode() == 412
}

// PreviewKey is where a flower's replaceable share picture lives. It is kept
// apart from the nft/ keys, which never change once written.
func PreviewKey(flowerID string) string {
	return "previews/" + flowerID + ".png"
}
