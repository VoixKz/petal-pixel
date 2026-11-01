package chain

import (
	"context"
	"errors"
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
)

var (
	contract  = common.HexToAddress("0x5FbDB2315678afecb367f032d93F642f64180aa3")
	buyer     = common.HexToAddress("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC")
	flowerKey = crypto.Keccak256Hash([]byte("flw_test"))
	txHash    = "0xddf75aaa8662301c16e1283b704375061fe234be41f887ce2b483bbb3f1ac6ab"
)

// mintedTopic is written out so a renamed event fails here.
var mintedTopic = crypto.Keccak256Hash([]byte("Minted(bytes32,address,uint256)"))

func mintLog() *types.Log {
	return &types.Log{
		Address: contract,
		Topics: []common.Hash{
			mintedTopic,
			flowerKey,
			common.BytesToHash(buyer.Bytes()),
			common.BigToHash(big.NewInt(7)),
		},
	}
}

type fakeReceipts struct {
	receipt *types.Receipt
	err     error
}

func (f fakeReceipts) TransactionReceipt(context.Context, common.Hash) (*types.Receipt, error) {
	return f.receipt, f.err
}

func TestMintFromTxReadsTheMintedEvent(t *testing.T) {
	r := Reader{client: fakeReceipts{receipt: &types.Receipt{Status: types.ReceiptStatusSuccessful, Logs: []*types.Log{mintLog()}}}, contract: contract}

	got, err := r.MintFromTx(context.Background(), txHash)

	if err != nil {
		t.Fatalf("MintFromTx: %v", err)
	}
	if got.FlowerID != [32]byte(flowerKey) {
		t.Errorf("flower = %x", got.FlowerID)
	}
	if got.Owner != buyer {
		t.Errorf("owner = %s", got.Owner)
	}
	if got.TokenID.Int64() != 7 {
		t.Errorf("token id = %s", got.TokenID)
	}
}

func TestMintFromTxRejects(t *testing.T) {
	otherContract := mintLog()
	otherContract.Address = common.HexToAddress("0x1")
	otherEvent := mintLog()
	otherEvent.Topics[0] = crypto.Keccak256Hash([]byte("Transfer(address,address,uint256)"))
	shortTopics := mintLog()
	shortTopics.Topics = shortTopics.Topics[:2]

	cases := map[string]struct {
		hash    string
		reader  fakeReceipts
		wantErr error
	}{
		"malformed hash":  {hash: "0xdead", wantErr: ErrBadHash},
		"unknown tx":      {hash: txHash, reader: fakeReceipts{err: ethereum.NotFound}, wantErr: ErrNoMint},
		"reverted tx":     {hash: txHash, reader: fakeReceipts{receipt: &types.Receipt{Status: types.ReceiptStatusFailed, Logs: []*types.Log{mintLog()}}}, wantErr: ErrNoMint},
		"no logs":         {hash: txHash, reader: fakeReceipts{receipt: &types.Receipt{Status: types.ReceiptStatusSuccessful}}, wantErr: ErrNoMint},
		"other contract":  {hash: txHash, reader: fakeReceipts{receipt: &types.Receipt{Status: types.ReceiptStatusSuccessful, Logs: []*types.Log{otherContract}}}, wantErr: ErrNoMint},
		"other event":     {hash: txHash, reader: fakeReceipts{receipt: &types.Receipt{Status: types.ReceiptStatusSuccessful, Logs: []*types.Log{otherEvent}}}, wantErr: ErrNoMint},
		"malformed event": {hash: txHash, reader: fakeReceipts{receipt: &types.Receipt{Status: types.ReceiptStatusSuccessful, Logs: []*types.Log{shortTopics}}}, wantErr: ErrNoMint},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			r := Reader{client: tc.reader, contract: contract}

			_, err := r.MintFromTx(context.Background(), tc.hash)

			if !errors.Is(err, tc.wantErr) {
				t.Errorf("err = %v, want %v", err, tc.wantErr)
			}
		})
	}
}

// An RPC outage is not proof that the mint is fake, so it must stay retryable.
func TestMintFromTxReportsRpcFailureSeparately(t *testing.T) {
	r := Reader{client: fakeReceipts{err: errors.New("connection refused")}, contract: contract}

	_, err := r.MintFromTx(context.Background(), txHash)

	if err == nil || errors.Is(err, ErrNoMint) {
		t.Errorf("err = %v, want an RPC error that is not ErrNoMint", err)
	}
}
