package grpcapi

import (
	"testing"

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
