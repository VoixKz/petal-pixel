package grpcapi

import (
	"context"
	"strings"

	flowerv1 "flower-backend/gen/go/flower/v1"
	"flower-backend/internal/assets"
	"flower-backend/internal/flower"
	"flower-backend/internal/nft"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type FlowerServer struct {
	flowerv1.UnimplementedFlowerServiceServer

	store *Store
	upl   *assets.S3Uploader
	chain chainConfig
}

type chainConfig struct {
	chainID         uint64
	contractAddress string
}

func NewFlowerServer(store *Store, upl *assets.S3Uploader, chainID uint64, contractAddress string) *FlowerServer {
	return &FlowerServer{
		store: store,
		upl:   upl,
		chain: chainConfig{chainID: chainID, contractAddress: contractAddress},
	}
}

func (s *FlowerServer) CreateFlower(ctx context.Context, req *flowerv1.CreateFlowerRequest) (*flowerv1.CreateFlowerResponse, error) {
	name := strings.TrimSpace(req.GetPersonName())
	if name == "" {
		return nil, status.Error(codes.InvalidArgument, "person_name is required")
	}

	p := flower.GenerateFromName(name)

	// flower_id becomes stable for the same input; later we can switch to DB ids.
	flowerID := flowerIDFromSeed(p.Seed, p.AlgoVersion)

	if s.store != nil {
		if err := s.store.UpsertFlower(ctx, flowerID, name, p); err != nil {
			return nil, err
		}
	}

	return &flowerv1.CreateFlowerResponse{
		FlowerId: flowerID,
		Params: &flowerv1.FlowerParams{
			AlgoVersion:   p.AlgoVersion,
			SchemaVersion: p.SchemaVersion,
			Seed:          p.Seed,
			PetalCount:    p.PetalCount,
			PetalLength:   p.PetalLength,
			PetalWidth:    p.PetalWidth,
			Curvature:     p.Curvature,
			StemHeight:    p.StemHeight,
			Hue:           p.Hue,
		},
	}, nil
}

func (s *FlowerServer) GetFlower(ctx context.Context, req *flowerv1.GetFlowerRequest) (*flowerv1.GetFlowerResponse, error) {
	if s.store == nil {
		return nil, status.Error(codes.FailedPrecondition, "database not configured")
	}
	id := strings.TrimSpace(req.GetFlowerId())
	if id == "" {
		return nil, status.Error(codes.InvalidArgument, "flower_id is required")
	}
	f, err := s.store.GetFlower(ctx, id)
	if err != nil {
		return nil, err
	}
	return &flowerv1.GetFlowerResponse{
		FlowerId: f.FlowerID,
		Params: &flowerv1.FlowerParams{
			AlgoVersion:   f.Params.AlgoVersion,
			SchemaVersion: f.Params.SchemaVersion,
			Seed:          f.Params.Seed,
			PetalCount:    f.Params.PetalCount,
			PetalLength:   f.Params.PetalLength,
			PetalWidth:    f.Params.PetalWidth,
			Curvature:     f.Params.Curvature,
			StemHeight:    f.Params.StemHeight,
			Hue:           f.Params.Hue,
		},
	}, nil
}

func (s *FlowerServer) PrepareMint(ctx context.Context, req *flowerv1.PrepareMintRequest) (*flowerv1.PrepareMintResponse, error) {
	if s.store == nil {
		return nil, status.Error(codes.FailedPrecondition, "database not configured")
	}
	if s.upl == nil {
		return nil, status.Error(codes.FailedPrecondition, "asset storage not configured")
	}
	flowerID := strings.TrimSpace(req.GetFlowerId())
	wallet := strings.TrimSpace(req.GetWalletAddress())
	if flowerID == "" {
		return nil, status.Error(codes.InvalidArgument, "flower_id is required")
	}
	if wallet == "" {
		return nil, status.Error(codes.InvalidArgument, "wallet_address is required")
	}

	f, err := s.store.GetFlower(ctx, flowerID)
	if err != nil {
		return nil, err
	}

	metadataJSON, err := nft.BuildMetadata("unknown", flowerID, f.Params.Seed, f.Params.AlgoVersion, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to build metadata")
	}

	// Store at a stable key so re-preparing returns same URL (unless you version it).
	key := "metadata/" + flowerID + ".json"
	tokenURI, err := s.upl.PutJSON(ctx, key, metadataJSON)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to upload metadata")
	}

	// Persist mint-prep (status machine fleshed out later).
	_ = s.store.UpsertMintPrepared(ctx, flowerID, wallet, tokenURI, s.chain.chainID, s.chain.contractAddress)

	return &flowerv1.PrepareMintResponse{
		FlowerId:        flowerID,
		ChainId:         s.chain.chainID,
		ContractAddress: s.chain.contractAddress,
		TokenUri:        tokenURI,
		MintTo:          wallet,
		MintTokenUri:    tokenURI,
		// mint_calldata left empty for now (frontend can call contract with args).
	}, nil
}

func (s *FlowerServer) ConfirmMint(ctx context.Context, req *flowerv1.ConfirmMintRequest) (*flowerv1.ConfirmMintResponse, error) {
	if s.store == nil {
		return nil, status.Error(codes.FailedPrecondition, "database not configured")
	}
	flowerID := strings.TrimSpace(req.GetFlowerId())
	txHash := strings.TrimSpace(req.GetTxHash())
	if flowerID == "" {
		return nil, status.Error(codes.InvalidArgument, "flower_id is required")
	}
	if txHash == "" {
		return nil, status.Error(codes.InvalidArgument, "tx_hash is required")
	}
	if err := s.store.ConfirmMint(ctx, flowerID, txHash); err != nil {
		return nil, err
	}
	return &flowerv1.ConfirmMintResponse{FlowerId: flowerID, TxHash: txHash}, nil
}

