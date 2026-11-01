package grpcapi

import (
	"context"
	"encoding/json"
	"testing"

	flowerv1 "flower-backend/gen/go/flower/v1"
	"flower-backend/internal/auth"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	gardenParams = `{"petalCount":19,"isFavorite":true}`
	otherParams  = `{"petalCount":3}`
)

func signedIn(subject, email string) context.Context {
	return auth.WithClaims(context.Background(), auth.Claims{Subject: subject, Email: email})
}

func gardenServer(t *testing.T) (*FlowerServer, *Store) {
	t.Helper()
	s := newTestStore(t)
	seedFlower(t, s)
	return &FlowerServer{store: s}, s
}

func saveRequest() *flowerv1.UpsertGardenFlowerRequest {
	return &flowerv1.UpsertGardenFlowerRequest{
		FlowerId:       testFlowerID,
		SavedName:      "For Anna",
		GenerationWord: "Anna",
		ParamsJson:     gardenParams,
	}
}

func TestGetMeCreatesAccountOnFirstCall(t *testing.T) {
	srv, _ := gardenServer(t)
	ctx := signedIn("sub-anna", "anna@example.test")

	first, err := srv.GetMe(ctx, &flowerv1.GetMeRequest{})
	if err != nil {
		t.Fatalf("GetMe: %v", err)
	}
	second, err := srv.GetMe(ctx, &flowerv1.GetMeRequest{})
	if err != nil {
		t.Fatalf("second GetMe: %v", err)
	}

	if first.GetUserId() == "" || first.GetUserId() != second.GetUserId() {
		t.Errorf("user ids = %q, %q, want one stable id", first.GetUserId(), second.GetUserId())
	}
	if first.GetEmail() != "anna@example.test" {
		t.Errorf("email = %q", first.GetEmail())
	}
	if first.GetCreatedAt() == "" || first.GetCreatedAt() != second.GetCreatedAt() {
		t.Errorf("created_at = %q, %q, want one stable time", first.GetCreatedAt(), second.GetCreatedAt())
	}
}

func TestUpdateMeChangesOnlyTheCaller(t *testing.T) {
	srv, _ := gardenServer(t)
	anna := signedIn("sub-anna", "anna@example.test")
	ben := signedIn("sub-ben", "ben@example.test")
	name, avatar := "Anna K", "http://files/avatar.png"

	if _, err := srv.UpdateMe(anna, &flowerv1.UpdateMeRequest{DisplayName: &name, AvatarUrl: &avatar}); err != nil {
		t.Fatalf("UpdateMe: %v", err)
	}

	got, err := srv.GetMe(anna, &flowerv1.GetMeRequest{})
	if err != nil {
		t.Fatalf("GetMe: %v", err)
	}
	if got.GetDisplayName() != name || got.GetAvatarUrl() != avatar {
		t.Errorf("profile = %+v", got)
	}
	other, err := srv.GetMe(ben, &flowerv1.GetMeRequest{})
	if err != nil {
		t.Fatalf("GetMe ben: %v", err)
	}
	if other.GetDisplayName() != "" {
		t.Errorf("another user's name changed to %q", other.GetDisplayName())
	}
}

func TestUpdateMeKeepsFieldsItDoesNotSend(t *testing.T) {
	srv, _ := gardenServer(t)
	anna := signedIn("sub-anna", "anna@example.test")
	name, avatar := "Anna K", "http://files/avatar.png"
	if _, err := srv.UpdateMe(anna, &flowerv1.UpdateMeRequest{DisplayName: &name, AvatarUrl: &avatar}); err != nil {
		t.Fatalf("UpdateMe: %v", err)
	}

	renamed := "Anna"
	if _, err := srv.UpdateMe(anna, &flowerv1.UpdateMeRequest{DisplayName: &renamed}); err != nil {
		t.Fatalf("rename: %v", err)
	}

	got, err := srv.GetMe(anna, &flowerv1.GetMeRequest{})
	if err != nil {
		t.Fatalf("GetMe: %v", err)
	}
	if got.GetDisplayName() != renamed || got.GetAvatarUrl() != avatar {
		t.Errorf("profile = %+v", got)
	}
}

func TestSavedFlowerComesBackInTheGarden(t *testing.T) {
	srv, _ := gardenServer(t)
	anna := signedIn("sub-anna", "anna@example.test")

	if _, err := srv.UpsertGardenFlower(anna, saveRequest()); err != nil {
		t.Fatalf("save: %v", err)
	}

	got, err := srv.ListGarden(anna, &flowerv1.ListGardenRequest{})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got.GetFlowers()) != 1 {
		t.Fatalf("got %d flowers, want 1", len(got.GetFlowers()))
	}
	f := got.GetFlowers()[0]
	if f.GetFlowerId() != testFlowerID || f.GetSavedName() != "For Anna" || f.GetGenerationWord() != "Anna" {
		t.Errorf("flower = %+v", f)
	}
	var params map[string]any
	if err := json.Unmarshal([]byte(f.GetParamsJson()), &params); err != nil {
		t.Fatalf("params: %v", err)
	}
	if params["petalCount"] != float64(19) || params["isFavorite"] != true {
		t.Errorf("params = %v", params)
	}
	if f.GetCreatedAt() == "" || f.GetIsMinted() {
		t.Errorf("created_at = %q, is_minted = %v", f.GetCreatedAt(), f.GetIsMinted())
	}
}

func TestOneUserCannotSeeAnothersGarden(t *testing.T) {
	srv, _ := gardenServer(t)
	if _, err := srv.UpsertGardenFlower(signedIn("sub-anna", ""), saveRequest()); err != nil {
		t.Fatalf("save: %v", err)
	}

	got, err := srv.ListGarden(signedIn("sub-ben", ""), &flowerv1.ListGardenRequest{})

	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got.GetFlowers()) != 0 {
		t.Errorf("Ben sees %d of Anna's flowers", len(got.GetFlowers()))
	}
}

func TestOneUserCannotChangeAnothersFlower(t *testing.T) {
	srv, _ := gardenServer(t)
	anna, ben := signedIn("sub-anna", ""), signedIn("sub-ben", "")
	if _, err := srv.UpsertGardenFlower(anna, saveRequest()); err != nil {
		t.Fatalf("save: %v", err)
	}
	renamed := "Stolen"

	_, updateErr := srv.UpdateGardenFlower(ben, &flowerv1.UpdateGardenFlowerRequest{FlowerId: testFlowerID, SavedName: &renamed})
	_, deleteErr := srv.DeleteGardenFlower(ben, &flowerv1.DeleteGardenFlowerRequest{FlowerId: testFlowerID})

	if status.Code(updateErr) != codes.NotFound {
		t.Errorf("update: code = %v, want NotFound", status.Code(updateErr))
	}
	if deleteErr != nil {
		t.Errorf("delete: %v", deleteErr)
	}
	got, err := srv.ListGarden(anna, &flowerv1.ListGardenRequest{})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got.GetFlowers()) != 1 || got.GetFlowers()[0].GetSavedName() != "For Anna" {
		t.Errorf("Anna's garden changed: %+v", got.GetFlowers())
	}
}

// Two users may save the same name: the flower is shared, the garden row is not.
func TestSavedParamsArePersonal(t *testing.T) {
	srv, _ := gardenServer(t)
	anna, ben := signedIn("sub-anna", ""), signedIn("sub-ben", "")
	if _, err := srv.UpsertGardenFlower(anna, saveRequest()); err != nil {
		t.Fatalf("save: %v", err)
	}
	theirs := saveRequest()
	theirs.ParamsJson = otherParams
	if _, err := srv.UpsertGardenFlower(ben, theirs); err != nil {
		t.Fatalf("save ben: %v", err)
	}

	got, err := srv.ListGarden(anna, &flowerv1.ListGardenRequest{})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if params := got.GetFlowers()[0].GetParamsJson(); params == otherParams {
		t.Errorf("Anna's params were replaced: %s", params)
	}
}

func TestUpsertReplacesTheCallersRow(t *testing.T) {
	srv, _ := gardenServer(t)
	anna := signedIn("sub-anna", "")
	if _, err := srv.UpsertGardenFlower(anna, saveRequest()); err != nil {
		t.Fatalf("save: %v", err)
	}
	again := saveRequest()
	again.SavedName = "Renamed"
	if _, err := srv.UpsertGardenFlower(anna, again); err != nil {
		t.Fatalf("second save: %v", err)
	}

	got, err := srv.ListGarden(anna, &flowerv1.ListGardenRequest{})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got.GetFlowers()) != 1 || got.GetFlowers()[0].GetSavedName() != "Renamed" {
		t.Errorf("garden = %+v", got.GetFlowers())
	}
}

func TestUpdateKeepsFieldsItDoesNotSend(t *testing.T) {
	srv, _ := gardenServer(t)
	anna := signedIn("sub-anna", "")
	if _, err := srv.UpsertGardenFlower(anna, saveRequest()); err != nil {
		t.Fatalf("save: %v", err)
	}
	renamed := "Renamed"

	if _, err := srv.UpdateGardenFlower(anna, &flowerv1.UpdateGardenFlowerRequest{FlowerId: testFlowerID, SavedName: &renamed}); err != nil {
		t.Fatalf("update: %v", err)
	}

	got, err := srv.ListGarden(anna, &flowerv1.ListGardenRequest{})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	f := got.GetFlowers()[0]
	if f.GetSavedName() != renamed || f.GetGenerationWord() != "Anna" {
		t.Errorf("flower = %+v", f)
	}
	var params map[string]any
	if err := json.Unmarshal([]byte(f.GetParamsJson()), &params); err != nil || params["petalCount"] != float64(19) {
		t.Errorf("params = %s (err=%v)", f.GetParamsJson(), err)
	}
}

func TestDeleteRemovesFromTheCallersGarden(t *testing.T) {
	srv, _ := gardenServer(t)
	anna := signedIn("sub-anna", "")
	if _, err := srv.UpsertGardenFlower(anna, saveRequest()); err != nil {
		t.Fatalf("save: %v", err)
	}

	if _, err := srv.DeleteGardenFlower(anna, &flowerv1.DeleteGardenFlowerRequest{FlowerId: testFlowerID}); err != nil {
		t.Fatalf("delete: %v", err)
	}

	got, err := srv.ListGarden(anna, &flowerv1.ListGardenRequest{})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got.GetFlowers()) != 0 {
		t.Errorf("garden = %+v", got.GetFlowers())
	}
}

// Mint state comes from the mints table, so no client can claim it.
func TestGardenShowsMintStateFromTheMintsTable(t *testing.T) {
	srv, s := gardenServer(t)
	anna := signedIn("sub-anna", "")
	ctx := context.Background()
	if _, err := srv.UpsertGardenFlower(anna, saveRequest()); err != nil {
		t.Fatalf("save: %v", err)
	}
	if err := s.UpsertMintPrepared(ctx, testFlowerID, walletAlex, "uri-1", 1337, testContract); err != nil {
		t.Fatalf("prepare: %v", err)
	}

	before, err := srv.ListGarden(anna, &flowerv1.ListGardenRequest{})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if before.GetFlowers()[0].GetIsMinted() {
		t.Error("a prepared mint reads as minted")
	}

	if err := s.ConfirmMint(ctx, testFlowerID, txFirst, walletAlex, "7"); err != nil {
		t.Fatalf("confirm: %v", err)
	}

	after, err := srv.ListGarden(anna, &flowerv1.ListGardenRequest{})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	f := after.GetFlowers()[0]
	if !f.GetIsMinted() || f.GetTxHash() != txFirst || f.GetTokenUri() != "uri-1" {
		t.Errorf("flower = %+v", f)
	}
}

func TestUpsertRejectsUnknownFlower(t *testing.T) {
	srv, _ := gardenServer(t)
	req := saveRequest()
	req.FlowerId = "flw_never_created"

	_, err := srv.UpsertGardenFlower(signedIn("sub-anna", ""), req)

	if status.Code(err) != codes.NotFound {
		t.Errorf("code = %v (err=%v), want NotFound", status.Code(err), err)
	}
}

func TestUpsertRejectsParamsThatAreNotJSON(t *testing.T) {
	srv, _ := gardenServer(t)
	req := saveRequest()
	req.ParamsJson = "not json"

	_, err := srv.UpsertGardenFlower(signedIn("sub-anna", ""), req)

	if status.Code(err) != codes.InvalidArgument {
		t.Errorf("code = %v (err=%v), want InvalidArgument", status.Code(err), err)
	}
}

func TestGardenCallsNeedASignedInUser(t *testing.T) {
	srv, _ := gardenServer(t)

	_, err := srv.ListGarden(context.Background(), &flowerv1.ListGardenRequest{})

	if status.Code(err) != codes.Unauthenticated {
		t.Errorf("code = %v, want Unauthenticated", status.Code(err))
	}
}
