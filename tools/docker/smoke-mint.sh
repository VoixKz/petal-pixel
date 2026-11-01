#!/bin/bash
# Local smoke test: real backend, real Anvil, real transactions.
# Needs the stack running: docker compose up -d --build backend
set -u
NET=petal-pixel_default
COMPOSE="$(cd "$(dirname "$0")/../.." && pwd)/docker-compose.yml"
RPC=http://anvil:8545
ALICE=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC   # Anvil account 2
BOB=0x90F79bf6EB2c4f870365E785982E1f101E93b906     # Anvil account 3
SIG4='mint((bytes32,address,string,uint256,uint256),bytes)'

token() {
  docker run --rm --network "$NET" curlimages/curl:8.11.1 -s -d "grant_type=password&client_id=petal-pixel-local-tests&username=$1&password=local-test-password&scope=openid email" \
    http://keycloak:8080/realms/petal-pixel/protocol/openid-connect/token | field access_token
}
grpc_as() { docker run --rm --network "$NET" fullstorydev/grpcurl:latest -plaintext -H "authorization: Bearer $1" -d "$3" backend:50051 "flower.v1.FlowerService/$2" 2>&1; }
grpc() { grpc_as "$TOKEN" "$1" "$2"; }
cast_() { docker run --rm --network "$NET" --entrypoint cast ghcr.io/foundry-rs/foundry:stable "$@" 2>&1; }
field() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j['$1']??'')})"; }
FAILED=0
check() { if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1: got [$2], want [$3]"; FAILED=1; fi; }
has() { if printf '%s' "$2" | grep -qi "$3"; then echo "PASS  $1"; else echo "FAIL  $1: wanted [$3] in [$(printf '%s' "$2" | head -c 200)]"; FAILED=1; fi; }

TOKEN=$(token anna@example.test)
BEN_TOKEN=$(token ben@example.test)
[ -n "$TOKEN" ] && echo "PASS  signed in through Keycloak" || { echo "FAIL  no token"; exit 1; }

NAME="Smoke $(date +%s)"
echo "== name: $NAME"
FLOWER=$(grpc CreateFlower "{\"person_name\":\"$NAME\"}" | field flowerId)
echo "flower: $FLOWER"

ANON=$(docker run --rm --network "$NET" fullstorydev/grpcurl:latest -plaintext -d "{\"flower_id\":\"$FLOWER\",\"wallet_address\":\"$ALICE\"}" backend:50051 flower.v1.FlowerService/PrepareMint 2>&1)
has "minting needs a login" "$ANON" "Unauthenticated"
FAKE=$(grpc_as "not.a.token" PrepareMint "{\"flower_id\":\"$FLOWER\",\"wallet_address\":\"$ALICE\"}")
has "a forged token is rejected" "$FAKE" "Unauthenticated"

grpc UpsertGardenFlower "{\"flower_id\":\"$FLOWER\",\"saved_name\":\"Smoke\",\"generation_word\":\"$NAME\",\"params_json\":\"{}\"}" >/dev/null
has "a flower shows in its owner's garden" "$(grpc ListGarden '{}')" "$FLOWER"
if grpc_as "$BEN_TOKEN" ListGarden '{}' | grep -q "$FLOWER"; then echo "FAIL  another user sees the flower"; FAILED=1; else echo "PASS  another user does not see the flower"; fi

check "the public list of names is gone" "$(curl -s -m 5 -o /dev/null -w '%{http_code}' http://localhost:50051/api/flowers)" "405"
PNG=/tmp/smoke-preview.png; printf '\x89PNG\r\n\x1a\n' > "$PNG"
preview() { curl -s -m 5 -o /dev/null -w '%{http_code}' -X POST --data-binary "@$PNG" -H "Content-Type: image/png" ${1:+-H "Authorization: Bearer $1"} "http://localhost:50051/api/flowers/$FLOWER/preview"; }
check "an anonymous preview upload is refused" "$(preview '')" "401"
check "someone else's preview upload is refused" "$(preview "$BEN_TOKEN")" "403"
check "the owner may upload a preview" "$(preview "$TOKEN")" "200"

P=$(grpc PrepareMint "{\"flower_id\":\"$FLOWER\",\"wallet_address\":\"$ALICE\"}")
CONTRACT=$(printf '%s' "$P" | field contractAddress)
URI=$(printf '%s' "$P" | field mintTokenUri)
FID=$(printf '%s' "$P" | field voucherFlowerId)
PRICE=$(printf '%s' "$P" | field voucherPriceWei)
DEADLINE=$(printf '%s' "$P" | field voucherDeadline)
SIG=$(printf '%s' "$P" | field voucherSignature)
[ -n "$SIG" ] && echo "PASS  backend returned a signed voucher" || { echo "FAIL  no voucher: $P"; exit 1; }
VOUCHER="($FID,$ALICE,$URI,$PRICE,$DEADLINE)"

has "metadata is served from storage" "$(curl -s -m 5 "$URI")" "$NAME"
has "the token URI is named by content" "$URI" "/nft/[0-9a-f]\{64\}\.json"

FORGED=$(cast_ send "$CONTRACT" "$SIG4" "($FID,$BOB,$URI,$PRICE,$DEADLINE)" "$SIG" --unlocked --from "$BOB" --rpc-url "$RPC")
has "voucher rewritten for another wallet is rejected" "$FORGED" "0x8baa579f\|InvalidSignature\|revert"

GARBAGE=$(grpc ConfirmMint "{\"flower_id\":\"$FLOWER\",\"tx_hash\":\"0xdead\"}")
has "garbage hash cannot confirm a mint" "$GARBAGE" "InvalidArgument"
UNKNOWN=$(grpc ConfirmMint "{\"flower_id\":\"$FLOWER\",\"tx_hash\":\"0x$(printf 'ab%.0s' {1..32})\"}")
has "unknown hash cannot confirm a mint" "$UNKNOWN" "InvalidArgument"
PLAIN=$(cast_ send "$BOB" --value 1 --unlocked --from "$ALICE" --rpc-url "$RPC" --json | field transactionHash)
UNRELATED=$(grpc ConfirmMint "{\"flower_id\":\"$FLOWER\",\"tx_hash\":\"$PLAIN\"}")
has "real but unrelated tx cannot confirm a mint" "$UNRELATED" "InvalidArgument"

TOKEN_ID=$(cast_ call "$CONTRACT" 'nextTokenId()(uint256)' --rpc-url "$RPC")
TX=$(cast_ send "$CONTRACT" "$SIG4" "$VOUCHER" "$SIG" --unlocked --from "$ALICE" --rpc-url "$RPC" --json | field transactionHash)
if [ -n "$TX" ]; then echo "PASS  real mint transaction: $TX"; else echo "FAIL  mint did not send"; FAILED=1; fi

OWNER=$(cast_ call "$CONTRACT" 'ownerOf(uint256)(address)' "$TOKEN_ID" --rpc-url "$RPC")
check "chain says Alice owns token $TOKEN_ID" "$OWNER" "$ALICE"
URI_ON_CHAIN=$(cast_ call "$CONTRACT" 'tokenURI(uint256)(string)' "$TOKEN_ID" --rpc-url "$RPC" | tr -d '"')
check "token URI on chain matches" "$URI_ON_CHAIN" "$URI"

REPLAY=$(cast_ send "$CONTRACT" "$SIG4" "$VOUCHER" "$SIG" --unlocked --from "$ALICE" --rpc-url "$RPC")
has "replaying the voucher is rejected" "$REPLAY" "revert\|0xddefae28\|AlreadyMinted"

C=$(grpc ConfirmMint "{\"flower_id\":\"$FLOWER\",\"tx_hash\":\"$TX\"}")
has "backend confirms the mint" "$C" "$TX"

BEFORE=$(curl -s -m 5 "$URI")
SECOND=$(grpc PrepareMint "{\"flower_id\":\"$FLOWER\",\"wallet_address\":\"$BOB\"}")
has "second buyer is refused" "$SECOND" "AlreadyExists"
check "minted metadata did not change" "$(curl -s -m 5 "$URI")" "$BEFORE"
preview "$TOKEN" >/dev/null
check "a new preview does not touch the minted metadata" "$(curl -s -m 5 "$URI")" "$BEFORE"

HIJACK=$(grpc ConfirmMint "{\"flower_id\":\"$FLOWER\",\"tx_hash\":\"0xdead\"}")
has "another tx hash is refused after confirming" "$HIJACK" "InvalidArgument"
STORED=$(docker compose -f "$COMPOSE" exec -T postgres psql -U flower -d flower -Atc "select tx_hash from mints where flower_id = '$FLOWER'")
check "the first tx hash stays in the database" "$STORED" "$TX"

ROW=$(docker compose -f "$COMPOSE" exec -T postgres psql -U flower -d flower -Atc "select status, owner_address, token_id from mints where flower_id = '$FLOWER'")
check "database row comes from the chain" "$ROW" "confirmed|$ALICE|$TOKEN_ID"

sleep 6
docker compose -f "$COMPOSE" restart anvil >/dev/null 2>&1
sleep 4
AFTER=$(cast_ call "$CONTRACT" 'ownerOf(uint256)(address)' "$TOKEN_ID" --rpc-url "$RPC")
check "token survives an Anvil restart" "$AFTER" "$ALICE"

exit "$FAILED"
