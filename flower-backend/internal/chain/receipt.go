// Package chain reads mint results from the blockchain, which decides who owns a flower.
package chain

import (
	"context"
	"errors"
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

var (
	ErrBadHash = errors.New("malformed transaction hash")
	ErrNoMint  = errors.New("transaction did not mint")
)

var mintedEvent = crypto.Keccak256Hash([]byte("Minted(bytes32,address,uint256)"))

// Mint is the contract's Minted event.
type Mint struct {
	FlowerID [32]byte
	Owner    common.Address
	TokenID  *big.Int
}

type receiptClient interface {
	TransactionReceipt(ctx context.Context, hash common.Hash) (*types.Receipt, error)
}

type Reader struct {
	client   receiptClient
	contract common.Address
}

func NewReader(ctx context.Context, rpcURL string, contract common.Address) (*Reader, error) {
	client, err := ethclient.DialContext(ctx, rpcURL)
	if err != nil {
		return nil, fmt.Errorf("dial rpc: %w", err)
	}
	return &Reader{client: client, contract: contract}, nil
}

// MintFromTx returns the mint a transaction made on this contract. ErrNoMint
// means the chain has no such mint; any other error means it could not be
// checked and the caller may retry.
func (r *Reader) MintFromTx(ctx context.Context, txHash string) (Mint, error) {
	hash, err := hexutil.Decode(txHash)
	if err != nil || len(hash) != common.HashLength {
		return Mint{}, ErrBadHash
	}

	receipt, err := r.client.TransactionReceipt(ctx, common.BytesToHash(hash))
	if errors.Is(err, ethereum.NotFound) {
		return Mint{}, ErrNoMint
	}
	if err != nil {
		return Mint{}, fmt.Errorf("read receipt: %w", err)
	}
	if receipt.Status != types.ReceiptStatusSuccessful {
		return Mint{}, ErrNoMint
	}

	for _, l := range receipt.Logs {
		if l.Address != r.contract || len(l.Topics) != 4 || l.Topics[0] != mintedEvent {
			continue
		}
		return Mint{
			FlowerID: l.Topics[1],
			Owner:    common.BytesToAddress(l.Topics[2].Bytes()),
			TokenID:  l.Topics[3].Big(),
		}, nil
	}
	return Mint{}, ErrNoMint
}
