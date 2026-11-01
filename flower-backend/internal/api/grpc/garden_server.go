package grpcapi

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	flowerv1 "flower-backend/gen/go/flower/v1"
	"flower-backend/internal/auth"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// currentAccount is the only way these handlers learn who is calling. Every
// query below is scoped to its result, never to an id from the request.
func (s *FlowerServer) currentAccount(ctx context.Context) (Account, error) {
	if s.store == nil {
		return Account{}, status.Error(codes.FailedPrecondition, "database not configured")
	}
	claims, ok := auth.FromContext(ctx)
	if !ok {
		return Account{}, status.Error(codes.Unauthenticated, "sign in required")
	}
	return s.store.EnsureUser(ctx, claims.Subject, claims.Email)
}

func (s *FlowerServer) GetMe(ctx context.Context, _ *flowerv1.GetMeRequest) (*flowerv1.GetMeResponse, error) {
	a, err := s.currentAccount(ctx)
	if err != nil {
		return nil, err
	}
	return &flowerv1.GetMeResponse{
		UserId:      a.ID,
		Email:       a.Email,
		DisplayName: a.DisplayName,
		AvatarUrl:   a.AvatarURL,
		CreatedAt:   a.CreatedAt.UTC().Format(time.RFC3339),
	}, nil
}

func (s *FlowerServer) UpdateMe(ctx context.Context, req *flowerv1.UpdateMeRequest) (*flowerv1.UpdateMeResponse, error) {
	a, err := s.currentAccount(ctx)
	if err != nil {
		return nil, err
	}
	if err := s.store.UpdateUser(ctx, a.ID, req.DisplayName, req.AvatarUrl); err != nil {
		return nil, err
	}
	return &flowerv1.UpdateMeResponse{}, nil
}

func (s *FlowerServer) ListGarden(ctx context.Context, _ *flowerv1.ListGardenRequest) (*flowerv1.ListGardenResponse, error) {
	a, err := s.currentAccount(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := s.store.ListGarden(ctx, a.ID)
	if err != nil {
		return nil, err
	}
	out := &flowerv1.ListGardenResponse{Flowers: make([]*flowerv1.SavedFlower, 0, len(rows))}
	for _, r := range rows {
		out.Flowers = append(out.Flowers, &flowerv1.SavedFlower{
			FlowerId:       r.FlowerID,
			SavedName:      r.SavedName,
			GenerationWord: r.GenerationWord,
			ParamsJson:     r.ParamsJSON,
			CreatedAt:      r.CreatedAt.UTC().Format(time.RFC3339),
			IsMinted:       r.IsMinted,
			TxHash:         r.TxHash,
			TokenUri:       r.TokenURI,
		})
	}
	return out, nil
}

func (s *FlowerServer) UpsertGardenFlower(ctx context.Context, req *flowerv1.UpsertGardenFlowerRequest) (*flowerv1.UpsertGardenFlowerResponse, error) {
	a, err := s.currentAccount(ctx)
	if err != nil {
		return nil, err
	}
	flowerID := strings.TrimSpace(req.GetFlowerId())
	if flowerID == "" {
		return nil, status.Error(codes.InvalidArgument, "flower_id is required")
	}
	if !json.Valid([]byte(req.GetParamsJson())) {
		return nil, status.Error(codes.InvalidArgument, "params_json is not valid JSON")
	}
	if err := s.store.UpsertGardenFlower(ctx, a.ID, flowerID, req.GetSavedName(), req.GetGenerationWord(), req.GetParamsJson()); err != nil {
		return nil, err
	}
	return &flowerv1.UpsertGardenFlowerResponse{}, nil
}

func (s *FlowerServer) UpdateGardenFlower(ctx context.Context, req *flowerv1.UpdateGardenFlowerRequest) (*flowerv1.UpdateGardenFlowerResponse, error) {
	a, err := s.currentAccount(ctx)
	if err != nil {
		return nil, err
	}
	if req.ParamsJson != nil && !json.Valid([]byte(*req.ParamsJson)) {
		return nil, status.Error(codes.InvalidArgument, "params_json is not valid JSON")
	}
	if err := s.store.UpdateGardenFlower(ctx, a.ID, strings.TrimSpace(req.GetFlowerId()), req.SavedName, req.GenerationWord, req.ParamsJson); err != nil {
		return nil, err
	}
	return &flowerv1.UpdateGardenFlowerResponse{}, nil
}

func (s *FlowerServer) DeleteGardenFlower(ctx context.Context, req *flowerv1.DeleteGardenFlowerRequest) (*flowerv1.DeleteGardenFlowerResponse, error) {
	a, err := s.currentAccount(ctx)
	if err != nil {
		return nil, err
	}
	if err := s.store.DeleteGardenFlower(ctx, a.ID, strings.TrimSpace(req.GetFlowerId())); err != nil {
		return nil, err
	}
	return &flowerv1.DeleteGardenFlowerResponse{}, nil
}
