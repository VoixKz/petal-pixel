// Package voucher signs the EIP-712 mint permissions FlowerNFT checks on chain.
// Signer is the seam for moving the key into KMS later.
package voucher

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

var (
	domainTypeHash  = crypto.Keccak256([]byte("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"))
	voucherTypeHash = crypto.Keccak256([]byte("Voucher(bytes32 flowerId,address to,string tokenURI,uint256 price,uint256 deadline)"))
	domainName      = crypto.Keccak256([]byte("Petal Pixel"))
	domainVersion   = crypto.Keccak256([]byte("2"))
)

// Voucher mirrors the FlowerNFT.Voucher struct.
type Voucher struct {
	FlowerID [32]byte
	To       common.Address
	TokenURI string
	Price    *big.Int
	Deadline uint64
}

// Domain binds a voucher to one contract on one chain.
type Domain struct {
	ChainID  uint64
	Contract common.Address
}

type Signer interface {
	Sign(ctx context.Context, v Voucher) ([]byte, error)
}

// FlowerKey maps a backend flower id onto the contract's bytes32 key.
func FlowerKey(flowerID string) [32]byte {
	return crypto.Keccak256Hash([]byte(flowerID))
}

// word pads a value to one 32-byte ABI slot.
func word(b []byte) []byte { return common.LeftPadBytes(b, 32) }

// Digest is the hash the contract recovers the signer from.
func Digest(d Domain, v Voucher) [32]byte {
	domain := crypto.Keccak256(
		domainTypeHash,
		domainName,
		domainVersion,
		word(new(big.Int).SetUint64(d.ChainID).Bytes()),
		word(d.Contract.Bytes()),
	)
	structHash := crypto.Keccak256(
		voucherTypeHash,
		v.FlowerID[:],
		word(v.To.Bytes()),
		crypto.Keccak256([]byte(v.TokenURI)),
		word(v.Price.Bytes()),
		word(new(big.Int).SetUint64(v.Deadline).Bytes()),
	)
	return crypto.Keccak256Hash([]byte{0x19, 0x01}, domain, structHash)
}

// LocalSigner holds the key in memory. It is for the local chain only.
type LocalSigner struct {
	key    *ecdsa.PrivateKey
	domain Domain
}

func NewLocalSigner(hexKey string, d Domain) (*LocalSigner, error) {
	key, err := crypto.HexToECDSA(strings.TrimPrefix(hexKey, "0x"))
	if err != nil {
		return nil, fmt.Errorf("voucher signer key: %w", err)
	}
	return &LocalSigner{key: key, domain: d}, nil
}

func (s *LocalSigner) Address() common.Address {
	return crypto.PubkeyToAddress(s.key.PublicKey)
}

// Sign returns r || s || v, with v as 27 or 28 like the contract expects.
func (s *LocalSigner) Sign(_ context.Context, v Voucher) ([]byte, error) {
	digest := Digest(s.domain, v)
	sig, err := crypto.Sign(digest[:], s.key)
	if err != nil {
		return nil, fmt.Errorf("sign voucher: %w", err)
	}
	sig[64] += 27
	return sig, nil
}
