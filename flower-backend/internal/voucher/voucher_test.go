package voucher

import (
	"context"
	"encoding/hex"
	"math/big"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/common"
)

// The expected values come from test_VectorSharedWithGoSigner in
// flower-backend/test/FlowerNFT.t.sol, which also mints with this signature.
const (
	anvilAccount1Key  = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
	anvilAccount1Addr = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
	wantDigest        = "de7458b8f4958d05b7e614057c4bf7a98eabd210e8a04daf77138f40703cdac0"
	wantSignature     = "0bf00566061aafd1554c621000b5bbc2fd724977fc98eeb99b7765b3ae95fe7966ee8aeeceee7eaf96456b91a5d31d54be7218f58e67bac8a06e7666f79dc8d41c"
)

var vectorDomain = Domain{
	ChainID:  1337,
	Contract: common.HexToAddress("0x5FbDB2315678afecb367f032d93F642f64180aa3"),
}

func vectorVoucher() Voucher {
	return Voucher{
		FlowerID: FlowerKey("flw_test"),
		To:       common.HexToAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
		TokenURI: "http://localhost:9000/flower/metadata/flw_test.json",
		Price:    big.NewInt(1000000000000000),
		Deadline: 1893456000,
	}
}

func TestDigestMatchesSolidity(t *testing.T) {
	got := Digest(vectorDomain, vectorVoucher())

	if hex.EncodeToString(got[:]) != wantDigest {
		t.Errorf("digest = %x, want %s", got, wantDigest)
	}
}

func TestLocalSignerMatchesSolidity(t *testing.T) {
	signer, err := NewLocalSigner(anvilAccount1Key, vectorDomain)
	if err != nil {
		t.Fatalf("new signer: %v", err)
	}

	got, err := signer.Sign(context.Background(), vectorVoucher())
	if err != nil {
		t.Fatalf("sign: %v", err)
	}

	if hex.EncodeToString(got) != wantSignature {
		t.Errorf("signature = %x, want %s", got, wantSignature)
	}
}

func TestDigestChangesWithEveryField(t *testing.T) {
	base := Digest(vectorDomain, vectorVoucher())
	changes := map[string]func(*Voucher, *Domain){
		"flower":   func(v *Voucher, _ *Domain) { v.FlowerID = FlowerKey("flw_other") },
		"to":       func(v *Voucher, _ *Domain) { v.To = common.HexToAddress("0x1") },
		"tokenURI": func(v *Voucher, _ *Domain) { v.TokenURI += "x" },
		"price":    func(v *Voucher, _ *Domain) { v.Price = big.NewInt(1) },
		"deadline": func(v *Voucher, _ *Domain) { v.Deadline++ },
		"chain":    func(_ *Voucher, d *Domain) { d.ChainID++ },
		"contract": func(_ *Voucher, d *Domain) { d.Contract = common.HexToAddress("0x2") },
	}

	for name, change := range changes {
		v, d := vectorVoucher(), vectorDomain
		change(&v, &d)
		if Digest(d, v) == base {
			t.Errorf("changing %s left the digest unchanged", name)
		}
	}
}

func TestNewLocalSignerRejectsBadKey(t *testing.T) {
	for _, key := range []string{"", "0x12", strings.Repeat("z", 64)} {
		if _, err := NewLocalSigner(key, vectorDomain); err == nil {
			t.Errorf("key %q accepted", key)
		}
	}
}

func TestLocalSignerAddress(t *testing.T) {
	signer, err := NewLocalSigner(anvilAccount1Key, vectorDomain)
	if err != nil {
		t.Fatalf("new signer: %v", err)
	}

	if got := signer.Address().Hex(); got != anvilAccount1Addr {
		t.Errorf("address = %s, want %s", got, anvilAccount1Addr)
	}
}
