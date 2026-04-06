package grpcapi

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func unimplemented(method string) error {
	return status.Error(codes.Unimplemented, fmt.Sprintf("%s not implemented yet", method))
}

func flowerIDFromSeed(seed uint64, algoVersion string) string {
	h := sha256.Sum256([]byte(fmt.Sprintf("%s:%d", algoVersion, seed)))
	// Shorten for ergonomics; keep enough bits to avoid collisions for a hobby project.
	return "flw_" + hex.EncodeToString(h[:8])
}

