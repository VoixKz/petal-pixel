package grpcapi

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"math/big"
	"regexp"
	"strings"
	"testing"
	"time"

	flowerv1 "flower-backend/gen/go/flower/v1"
	"flower-backend/internal/chain"
	"flower-backend/internal/nft"
	"flower-backend/internal/voucher"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// fakeFiles behaves like the bucket, including write-once keys, and counts
// writes so a test can prove nothing reached storage.
type fakeFiles struct {
	uploads int
	objects map[string][]byte
}

func newFakeFiles() *fakeFiles { return &fakeFiles{objects: map[string][]byte{}} }

func (f *fakeFiles) PutBytes(_ context.Context, key, _ string, r io.Reader) (string, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return "", err
	}
	f.uploads++
	f.objects[key] = data
	return "http://files/" + key, nil
}

func (f *fakeFiles) PutOnce(_ context.Context, key, _ string, data []byte) (string, error) {
	f.uploads++
	if _, taken := f.objects[key]; !taken {
		f.objects[key] = data
	}
	return "http://files/" + key, nil
}

func (f *fakeFiles) Get(_ context.Context, key string) ([]byte, bool, error) {
	data, ok := f.objects[key]
	return data, ok, nil
}

const (
	testContract  = "0x5FbDB2315678afecb367f032d93F642f64180aa3"
	testSignerKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
	testSigner    = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
)

var testDomain = voucher.Domain{ChainID: 1337, Contract: common.HexToAddress(testContract)}

func newMintServer(t *testing.T, s *Store, files nftFiles) *FlowerServer {
	t.Helper()
	signer, err := voucher.NewLocalSigner(testSignerKey, testDomain)
	if err != nil {
		t.Fatalf("new signer: %v", err)
	}
	return &FlowerServer{
		store:     s,
		upl:       files,
		chain:     chainConfig{chainID: 1337, contractAddress: testContract},
		signer:    signer,
		mintPrice: big.NewInt(1000),
	}
}

type fakeChain struct {
	mint chain.Mint
	err  error
}

func (f fakeChain) MintFromTx(context.Context, string) (chain.Mint, error) { return f.mint, f.err }

func prepareRequest(wallet string) *flowerv1.PrepareMintRequest {
	return &flowerv1.PrepareMintRequest{
		FlowerId:      testFlowerID,
		WalletAddress: wallet,
		ImagePng:      []byte("png"),
	}
}

func TestPrepareMintRefusesMintedFlowerBeforeUpload(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	seedFlower(t, s)
	if err := s.UpsertMintPrepared(ctx, testFlowerID, walletAlex, "uri-alex", 1337, "0xc"); err != nil {
		t.Fatalf("prepare: %v", err)
	}
	if err := s.ConfirmMint(ctx, testFlowerID, txFirst, walletAlex, "7"); err != nil {
		t.Fatalf("confirm: %v", err)
	}
	files := newFakeFiles()
	srv := newMintServer(t, s, files)

	_, err := srv.PrepareMint(ctx, prepareRequest(walletBen))

	if status.Code(err) != codes.AlreadyExists {
		t.Fatalf("got code %v (err=%v), want AlreadyExists", status.Code(err), err)
	}
	if files.uploads != 0 {
		t.Errorf("minted flower's files were written %d times, want 0", files.uploads)
	}
}

func TestPrepareMintUploadsForUnmintedFlower(t *testing.T) {
	s := newTestStore(t)
	seedFlower(t, s)
	files := newFakeFiles()
	srv := newMintServer(t, s, files)

	resp, err := srv.PrepareMint(context.Background(), prepareRequest(walletAlex))

	if err != nil {
		t.Fatalf("prepare: %v", err)
	}
	if files.uploads != 3 {
		t.Errorf("got %d uploads, want the preview, the image and the metadata", files.uploads)
	}
	if resp.GetTokenUri() == "" {
		t.Error("empty token uri")
	}
}

// sha256("png"), worked out outside the code under test.
const pngImageKey = "nft/8f8cbb7dcf46e0bc7d53265749a6c17d116093a6ba95e442764060c76fd4a86c.png"

func metadataOf(t *testing.T, files *fakeFiles, tokenURI string) nft.Metadata {
	t.Helper()
	raw, ok := files.objects[strings.TrimPrefix(tokenURI, "http://files/")]
	if !ok {
		t.Fatalf("no object behind token uri %q", tokenURI)
	}
	var m nft.Metadata
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("decode metadata: %v", err)
	}
	return m
}

func TestPrepareMintNamesNftFilesByContent(t *testing.T) {
	s := newTestStore(t)
	seedFlower(t, s)
	files := newFakeFiles()
	srv := newMintServer(t, s, files)

	resp, err := srv.PrepareMint(context.Background(), prepareRequest(walletAlex))
	if err != nil {
		t.Fatalf("prepare: %v", err)
	}

	if string(files.objects[pngImageKey]) != "png" {
		t.Errorf("image not stored at %s", pngImageKey)
	}
	if !regexp.MustCompile(`^http://files/nft/[0-9a-f]{64}\.json$`).MatchString(resp.GetTokenUri()) {
		t.Errorf("token uri = %q", resp.GetTokenUri())
	}
	if got := metadataOf(t, files, resp.GetTokenUri()).Image; got != "http://files/"+pngImageKey {
		t.Errorf("metadata image = %q", got)
	}
}

// Two buyers racing before a mint lands must not change the file behind the
// first buyer's voucher.
func TestPrepareMintWithNewImageLeavesEarlierVoucherFilesAlone(t *testing.T) {
	s := newTestStore(t)
	seedFlower(t, s)
	files := newFakeFiles()
	srv := newMintServer(t, s, files)
	ctx := context.Background()

	first, err := srv.PrepareMint(ctx, prepareRequest(walletAlex))
	if err != nil {
		t.Fatalf("first prepare: %v", err)
	}
	second := prepareRequest(walletBen)
	second.ImagePng = []byte("other-png")
	resp, err := srv.PrepareMint(ctx, second)
	if err != nil {
		t.Fatalf("second prepare: %v", err)
	}

	if resp.GetTokenUri() == first.GetTokenUri() {
		t.Error("different images share a token uri")
	}
	if got := metadataOf(t, files, first.GetTokenUri()).Image; got != "http://files/"+pngImageKey {
		t.Errorf("first voucher's image changed to %q", got)
	}
}

func TestPrepareMintWithoutImageReusesSavedPreview(t *testing.T) {
	s := newTestStore(t)
	seedFlower(t, s)
	files := newFakeFiles()
	files.objects["previews/"+testFlowerID+".png"] = []byte("png")
	srv := newMintServer(t, s, files)
	req := prepareRequest(walletAlex)
	req.ImagePng = nil

	resp, err := srv.PrepareMint(context.Background(), req)
	if err != nil {
		t.Fatalf("prepare: %v", err)
	}

	if got := metadataOf(t, files, resp.GetTokenUri()).Image; got != "http://files/"+pngImageKey {
		t.Errorf("metadata image = %q", got)
	}
}

func TestPrepareMintWithoutAnyImageStillMints(t *testing.T) {
	s := newTestStore(t)
	seedFlower(t, s)
	files := newFakeFiles()
	srv := newMintServer(t, s, files)
	req := prepareRequest(walletAlex)
	req.ImagePng = nil

	resp, err := srv.PrepareMint(context.Background(), req)
	if err != nil {
		t.Fatalf("prepare: %v", err)
	}

	if got := metadataOf(t, files, resp.GetTokenUri()).Image; got != "" {
		t.Errorf("metadata image = %q, want none", got)
	}
}

// A nil *assets.S3Uploader stored in the nftFiles interface would not compare
// equal to nil, so the "not configured" guard would pass and PrepareMint would
// crash on the first upload.
func TestPrepareMintWithoutStorageReportsNotConfigured(t *testing.T) {
	s := newTestStore(t)
	seedFlower(t, s)
	srv := NewFlowerServer(s, nil, 1337, testContract, nil, big.NewInt(0), nil)

	_, err := srv.PrepareMint(context.Background(), prepareRequest(walletAlex))

	if status.Code(err) != codes.FailedPrecondition {
		t.Errorf("got code %v (err=%v), want FailedPrecondition", status.Code(err), err)
	}
}

// Recovers the signer the way the contract does, so the test fails if any
// returned field differs from what was signed.
func TestPrepareMintReturnsVoucherTheContractAccepts(t *testing.T) {
	s := newTestStore(t)
	seedFlower(t, s)
	srv := newMintServer(t, s, newFakeFiles())
	before := time.Now()

	resp, err := srv.PrepareMint(context.Background(), prepareRequest(walletAlex))
	if err != nil {
		t.Fatalf("prepare: %v", err)
	}

	if resp.GetVoucherPriceWei() != "1000" {
		t.Errorf("price = %q, want 1000", resp.GetVoucherPriceWei())
	}
	if !strings.EqualFold(resp.GetMintTo(), walletAlex) {
		t.Errorf("mint_to = %q, want %q", resp.GetMintTo(), walletAlex)
	}
	key := voucher.FlowerKey(testFlowerID)
	if resp.GetVoucherFlowerId() != "0x"+hex.EncodeToString(key[:]) {
		t.Errorf("flower id = %q", resp.GetVoucherFlowerId())
	}
	deadline := time.Unix(int64(resp.GetVoucherDeadline()), 0)
	if deadline.Before(before.Add(voucherLifetime-time.Minute)) || deadline.After(before.Add(voucherLifetime+time.Minute)) {
		t.Errorf("deadline = %v, want about %v from now", deadline, voucherLifetime)
	}

	digest := voucher.Digest(testDomain, voucher.Voucher{
		FlowerID: key,
		To:       common.HexToAddress(resp.GetMintTo()),
		TokenURI: resp.GetMintTokenUri(),
		Price:    big.NewInt(1000),
		Deadline: resp.GetVoucherDeadline(),
	})
	sig, err := hex.DecodeString(strings.TrimPrefix(resp.GetVoucherSignature(), "0x"))
	if err != nil || len(sig) != 65 {
		t.Fatalf("signature = %q (err=%v), want 65 bytes", resp.GetVoucherSignature(), err)
	}
	sig[64] -= 27
	pub, err := crypto.SigToPub(digest[:], sig)
	if err != nil {
		t.Fatalf("recover: %v", err)
	}
	if got := crypto.PubkeyToAddress(*pub).Hex(); got != testSigner {
		t.Errorf("recovered signer = %s, want %s", got, testSigner)
	}
}

func TestPrepareMintRejectsInvalidWallet(t *testing.T) {
	s := newTestStore(t)
	seedFlower(t, s)
	files := newFakeFiles()
	srv := newMintServer(t, s, files)

	_, err := srv.PrepareMint(context.Background(), prepareRequest("not-a-wallet"))

	if status.Code(err) != codes.InvalidArgument {
		t.Errorf("got code %v (err=%v), want InvalidArgument", status.Code(err), err)
	}
	if files.uploads != 0 {
		t.Errorf("got %d uploads, want 0", files.uploads)
	}
}

func TestPrepareMintWithoutSignerReportsNotConfigured(t *testing.T) {
	s := newTestStore(t)
	seedFlower(t, s)
	files := newFakeFiles()
	srv := newMintServer(t, s, files)
	srv.signer = nil

	_, err := srv.PrepareMint(context.Background(), prepareRequest(walletAlex))

	if status.Code(err) != codes.FailedPrecondition {
		t.Errorf("got code %v (err=%v), want FailedPrecondition", status.Code(err), err)
	}
	if files.uploads != 0 {
		t.Errorf("got %d uploads, want 0", files.uploads)
	}
}

func preparedFlower(t *testing.T, s *Store) {
	t.Helper()
	seedFlower(t, s)
	if err := s.UpsertMintPrepared(context.Background(), testFlowerID, walletAlex, "uri", 1337, testContract); err != nil {
		t.Fatalf("prepare: %v", err)
	}
}

func confirmRequest() *flowerv1.ConfirmMintRequest {
	return &flowerv1.ConfirmMintRequest{FlowerId: testFlowerID, TxHash: txFirst}
}

// The owner comes from the chain, not from whoever prepared the mint.
func TestConfirmMintStoresOwnerFromChain(t *testing.T) {
	s := newTestStore(t)
	preparedFlower(t, s)
	srv := newMintServer(t, s, newFakeFiles())
	srv.chainReader = fakeChain{mint: chain.Mint{
		FlowerID: voucher.FlowerKey(testFlowerID),
		Owner:    common.HexToAddress(walletBen),
		TokenID:  big.NewInt(7),
	}}

	if _, err := srv.ConfirmMint(context.Background(), confirmRequest()); err != nil {
		t.Fatalf("confirm: %v", err)
	}

	got := readMint(t, s)
	if got.status != "confirmed" || got.tokenID.String != "7" || !strings.EqualFold(got.owner.String, walletBen) {
		t.Errorf("mint = %+v", got)
	}
}

func TestConfirmMintRejectsMintOfAnotherFlower(t *testing.T) {
	s := newTestStore(t)
	preparedFlower(t, s)
	srv := newMintServer(t, s, newFakeFiles())
	srv.chainReader = fakeChain{mint: chain.Mint{
		FlowerID: voucher.FlowerKey("flw_other"),
		Owner:    common.HexToAddress(walletAlex),
		TokenID:  big.NewInt(7),
	}}

	_, err := srv.ConfirmMint(context.Background(), confirmRequest())

	if status.Code(err) != codes.InvalidArgument {
		t.Errorf("got code %v (err=%v), want InvalidArgument", status.Code(err), err)
	}
	if got := readMint(t, s); got.status != "prepared" {
		t.Errorf("status = %q, want prepared", got.status)
	}
}

func TestConfirmMintRejectsTxWithoutMint(t *testing.T) {
	for name, chainErr := range map[string]error{"no mint": chain.ErrNoMint, "bad hash": chain.ErrBadHash} {
		t.Run(name, func(t *testing.T) {
			s := newTestStore(t)
			preparedFlower(t, s)
			srv := newMintServer(t, s, newFakeFiles())
			srv.chainReader = fakeChain{err: chainErr}

			_, err := srv.ConfirmMint(context.Background(), confirmRequest())

			if status.Code(err) != codes.InvalidArgument {
				t.Errorf("got code %v (err=%v), want InvalidArgument", status.Code(err), err)
			}
			if got := readMint(t, s); got.status != "prepared" {
				t.Errorf("status = %q, want prepared", got.status)
			}
		})
	}
}

// An RPC outage says nothing about the mint, so the frontend may retry.
func TestConfirmMintReportsRpcOutageAsUnavailable(t *testing.T) {
	s := newTestStore(t)
	preparedFlower(t, s)
	srv := newMintServer(t, s, newFakeFiles())
	srv.chainReader = fakeChain{err: errors.New("connection refused")}

	_, err := srv.ConfirmMint(context.Background(), confirmRequest())

	if status.Code(err) != codes.Unavailable {
		t.Errorf("got code %v (err=%v), want Unavailable", status.Code(err), err)
	}
}

func TestConfirmMintWithoutChainReportsNotConfigured(t *testing.T) {
	s := newTestStore(t)
	preparedFlower(t, s)
	srv := newMintServer(t, s, newFakeFiles())
	srv.chainReader = nil

	_, err := srv.ConfirmMint(context.Background(), confirmRequest())

	if status.Code(err) != codes.FailedPrecondition {
		t.Errorf("got code %v (err=%v), want FailedPrecondition", status.Code(err), err)
	}
	if got := readMint(t, s); got.status != "prepared" {
		t.Errorf("status = %q, want prepared", got.status)
	}
}
