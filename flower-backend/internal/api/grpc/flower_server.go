package grpcapi

import (
	"bytes"
	"context"
	"strings"

	flowerv1 "flower-backend/gen/go/flower/v1"
	"flower-backend/internal/assets"
	"flower-backend/internal/flower"
	"flower-backend/internal/nft"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// maxImagePngBytes bounds the optional mint snapshot (2 MiB).
const maxImagePngBytes = 2 << 20

func validateImagePng(png []byte) error {
	if len(png) > maxImagePngBytes {
		return status.Errorf(codes.InvalidArgument, "image_png exceeds %d bytes", maxImagePngBytes)
	}
	return nil
}

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

	params, err := toProtoParams(p)
	if err != nil {
		return nil, err
	}
	return &flowerv1.CreateFlowerResponse{
		FlowerId: flowerID,
		Params:   params,
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
	params, err := toProtoParams(f.Params)
	if err != nil {
		return nil, err
	}
	return &flowerv1.GetFlowerResponse{
		FlowerId: f.FlowerID,
		Params:   params,
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
	if err := validateImagePng(req.GetImagePng()); err != nil {
		return nil, err
	}

	f, err := s.store.GetFlower(ctx, flowerID)
	if err != nil {
		return nil, err
	}

	imageKey := "images/" + flowerID + ".png"
	imageURL := ""
	if png := req.GetImagePng(); len(png) > 0 {
		imageURL, err = s.upl.PutBytes(ctx, imageKey, "image/png", bytes.NewReader(png))
		if err != nil {
			return nil, status.Error(codes.Internal, "failed to upload image")
		}
	} else {
		// Finding 2: a re-prepare with no image (the normal retry path when
		// captureFlowerPng returns null client-side) must not silently strip
		// the picture from an already-minted token's metadata. If an image
		// was uploaded on a previous PrepareMint call, reuse its public URL
		// instead of leaving imageURL empty.
		imageURL, err = resolveImageURL(ctx, s.upl, imageKey)
		if err != nil {
			return nil, status.Error(codes.Internal, "failed to check for existing image")
		}
	}

	metadataJSON, err := buildMintMetadata(f, imageURL)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to build metadata")
	}

	// Store at a stable key so re-preparing returns same URL (unless you version it).
	key := "metadata/" + flowerID + ".json"
	tokenURI, err := s.upl.PutJSON(ctx, key, metadataJSON)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to upload metadata")
	}

	// Persist mint-prep (status machine fleshed out later). PrepareMint is the
	// gate the frontend awaits BEFORE it sends the on-chain tx, so a write
	// failure here must abort the flow: swallowing it would let a confirmed
	// on-chain mint map to a permanently-NotFound row (ConfirmMint only carries
	// flowerID+txHash and cannot reconstruct the wallet/token_uri/chain the
	// mints row requires NOT NULL).
	if err := s.store.UpsertMintPrepared(ctx, flowerID, wallet, tokenURI, s.chain.chainID, s.chain.contractAddress); err != nil {
		return nil, err
	}

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

// imageExister is the narrow seam PrepareMint needs from *assets.S3Uploader
// to decide whether to reuse a previously-uploaded image. Extracted as an
// interface so resolveImageURL's decision logic (Finding 2) can be
// unit-tested with a fake, without needing a live/mock S3 endpoint.
type imageExister interface {
	Exists(ctx context.Context, key string) (bool, error)
	PublicURL(key string) (string, error)
}

// resolveImageURL decides what image URL (if any) a re-prepared mint's
// metadata should reference when the caller did not supply a fresh
// image_png. Finding 2: PrepareMint writes metadata to a stable key
// (metadata/<flowerID>.json), so a re-prepare with no image — the normal
// retry path when the frontend's captureFlowerPng() returns null — used to
// silently overwrite the good metadata with the image field omitted,
// stripping the picture from an already-minted token's tokenURI. If the
// image from a previous PrepareMint call still exists at imageKey, its
// public URL is reused instead of leaving the metadata imageless.
func resolveImageURL(ctx context.Context, upl imageExister, imageKey string) (string, error) {
	exists, err := upl.Exists(ctx, imageKey)
	if err != nil {
		return "", err
	}
	if !exists {
		return "", nil
	}
	return upl.PublicURL(imageKey)
}

// buildMintMetadata resolves f's PersonName (falling back to "unknown" for
// empty/legacy rows written before person_name was loaded) and assembles the
// NFT metadata JSON, threading imageURL into the metadata Image field when
// non-empty. Pulled out of PrepareMint so the wiring — real name in, image
// URL in — can be unit-tested without a live Store/Uploader.
func buildMintMetadata(f *FlowerRow, imageURL string) ([]byte, error) {
	personName := strings.TrimSpace(f.PersonName)
	if personName == "" {
		personName = "unknown" // pre-existing rows written before person_name was loaded
	}
	return nft.BuildMetadata(personName, f.FlowerID, f.Params.Seed, f.Params.AlgoVersion, imageURL, nil)
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

// toProtoParams maps the generator's flower.Params onto the wire FlowerParams:
// the 6 v1 scalars (fields 1-9, always populated for back-compat), family (10),
// the baked palette (11), and the single oneof shape case matching p.Family (12-17).
func toProtoParams(p flower.Params) (*flowerv1.FlowerParams, error) {
	out := &flowerv1.FlowerParams{
		AlgoVersion:   p.AlgoVersion,
		SchemaVersion: p.SchemaVersion,
		Seed:          p.Seed,
		PetalCount:    p.PetalCount,
		PetalLength:   p.PetalLength,
		PetalWidth:    p.PetalWidth,
		Curvature:     p.Curvature,
		StemHeight:    p.StemHeight,
		Hue:           p.Hue,
		Family:        p.Family,
		Palette:       toProtoPalette(p.Palette),
	}
	if err := setProtoShape(out, p); err != nil {
		return nil, err
	}
	return out, nil
}

func toProtoPalette(pal *flower.PaletteSpec) *flowerv1.PaletteSpec {
	if pal == nil {
		return nil
	}
	stops := make([]*flowerv1.ColorStop, 0, len(pal.Stops))
	for _, s := range pal.Stops {
		stops = append(stops, &flowerv1.ColorStop{
			Position: s.Position,
			Hex:      s.Hex,
			R:        s.R,
			G:        s.G,
			B:        s.B,
		})
	}
	return &flowerv1.PaletteSpec{
		Id:       pal.ID,
		Stops:    stops,
		HueShift: pal.HueShift,
		SatShift: pal.SatShift,
		BriShift: pal.BriShift,
	}
}

// setProtoShape sets exactly one oneof case on out, driven by p's populated
// per-family pointer (which the generator sets consistently with p.Family).
// It returns a FailedPrecondition error (rather than panicking) when no shape
// pointer is set, so a legacy DB row written before per-family shapes existed
// can be surfaced to the caller instead of crashing the handler.
func setProtoShape(out *flowerv1.FlowerParams, p flower.Params) error {
	switch {
	case p.Classic != nil:
		out.Shape = &flowerv1.FlowerParams_Classic{Classic: &flowerv1.ClassicParams{
			Rows:    p.Classic.Rows,
			Cols:    p.Classic.Cols,
			PNum:    p.Classic.PNum,
			FD:      p.Classic.FD,
			PLen:    p.Classic.PLen,
			PSharp:  p.Classic.PSharp,
			FHeight: p.Classic.FHeight,
			Curve1:  p.Classic.Curve1,
			Curve2:  p.Classic.Curve2,
			B:       p.Classic.B,
			BNum:    p.Classic.BNum,
		}}
	case p.Rose != nil:
		out.Shape = &flowerv1.FlowerParams_Rose{Rose: &flowerv1.RoseParams{
			Opening:  p.Rose.Opening,
			VDensity: p.Rose.VDensity,
			PAlign:   p.Rose.PAlign,
			Curve1:   p.Rose.Curve1,
			Curve2:   p.Rose.Curve2,
		}}
	case p.Bloom != nil:
		out.Shape = &flowerv1.FlowerParams_Bloom{Bloom: &flowerv1.BloomParams{
			Scale:     p.Bloom.Scale,
			Opening:   p.Bloom.Opening,
			Density:   p.Bloom.Density,
			PetalFreq: p.Bloom.PetalFreq,
			PetalAmp:  p.Bloom.PetalAmp,
			HangDown:  p.Bloom.HangDown,
			Fade:      p.Bloom.Fade,
			ThetaStep: p.Bloom.ThetaStep,
			RStep:     p.Bloom.RStep,
			SatShift:  p.Bloom.SatShift,
			BriShift:  p.Bloom.BriShift,
		}}
	case p.Sunflower != nil:
		out.Shape = &flowerv1.FlowerParams_Sunflower{Sunflower: &flowerv1.SunflowerParams{
			Scale:        p.Sunflower.Scale,
			FloretRings:  p.Sunflower.FloretRings,
			FloretSpokes: p.Sunflower.FloretSpokes,
			DomeHeight:   p.Sunflower.DomeHeight,
			DiscRatio:    p.Sunflower.DiscRatio,
			RayPetals:    p.Sunflower.RayPetals,
			RayLength:    p.Sunflower.RayLength,
			RayWidth:     p.Sunflower.RayWidth,
			SeedPacking:  p.Sunflower.SeedPacking,
			SatShift:     p.Sunflower.SatShift,
			BriShift:     p.Sunflower.BriShift,
		}}
	case p.Rhodonea != nil:
		out.Shape = &flowerv1.FlowerParams_Rhodonea{Rhodonea: &flowerv1.RhodoneaParams{
			Radius:        p.Rhodonea.Radius,
			K:             p.Rhodonea.K,
			PetalSpan:     p.Rhodonea.PetalSpan,
			WidthProfile:  p.Rhodonea.WidthProfile,
			HeightProfile: p.Rhodonea.HeightProfile,
			Thickness:     p.Rhodonea.Thickness,
			Curl:          p.Rhodonea.Curl,
			LengthSeg:     p.Rhodonea.LengthSeg,
			WidthSeg:      p.Rhodonea.WidthSeg,
			SatShift:      p.Rhodonea.SatShift,
			BriShift:      p.Rhodonea.BriShift,
		}}
	case p.Superformula != nil:
		// Proto Go field names use uppercase initialism: N1A, N2A, N3A, N1B, N2B, N3B.
		// flower.SuperformulaParams uses mixed case: N1a, N2a, N3a, N1b, N2b, N3b.
		out.Shape = &flowerv1.FlowerParams_Superformula{Superformula: &flowerv1.SuperformulaParams{
			Scale:    p.Superformula.Scale,
			M1:       p.Superformula.M1,
			N1A:      p.Superformula.N1a,
			N2A:      p.Superformula.N2a,
			N3A:      p.Superformula.N3a,
			A1:       p.Superformula.A1,
			B1:       p.Superformula.B1,
			M2:       p.Superformula.M2,
			N1B:      p.Superformula.N1b,
			N2B:      p.Superformula.N2b,
			N3B:      p.Superformula.N3b,
			A2:       p.Superformula.A2,
			B2:       p.Superformula.B2,
			USeg:     p.Superformula.USeg,
			VSeg:     p.Superformula.VSeg,
			SatShift: p.Superformula.SatShift,
			BriShift: p.Superformula.BriShift,
		}}
	default:
		// A flower.Params built outside the generator (or a legacy row) with no
		// shape pointer: fail loudly but recoverably instead of panicking.
		return status.Errorf(codes.FailedPrecondition, "flower has no shape pointer set (family=%q)", p.Family)
	}
	return nil
}

