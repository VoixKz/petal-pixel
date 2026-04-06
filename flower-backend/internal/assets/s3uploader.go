package assets

import (
	"bytes"
	"context"
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
)

type S3Uploader struct {
	bucket string
	publicBaseURL string
	uploader *manager.Uploader
	client   *s3.Client
}

type S3Config struct {
	Endpoint        string // e.g. http://localhost:9000 for MinIO
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

func (u *S3Uploader) PutJSON(ctx context.Context, key string, data []byte) (string, error) {
	key = strings.TrimLeft(key, "/")
	_, err := u.uploader.Upload(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(u.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String("application/json"),
	})
	if err != nil {
		return "", err
	}
	return u.publicURL(key)
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

