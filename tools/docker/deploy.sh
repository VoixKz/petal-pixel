#!/bin/sh
# Deploys FlowerNFT to the anvil service and hands the address to the backend
# via /shared/contract.env. Runs inside ghcr.io/foundry-rs/foundry:stable with:
#   /work/flower-backend  -> ./flower-backend (rw: writes out/, cache/, broadcast/)
#   /work/lib             -> ./lib (OpenZeppelin submodule)
#   /shared               -> named volume shared with the backend container
set -eu

RPC_URL="${RPC_URL:-http://anvil:8545}"
# Anvil dev account 0 — well-known local-only key.
PRIVATE_KEY="${DEPLOY_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
CHAIN_ID="${CHAIN_ID:-1337}"

cd /work/flower-backend

if [ ! -f ../lib/openzeppelin-contracts/foundry.toml ]; then
  echo "deploy: lib/openzeppelin-contracts is empty — run 'git submodule update --init --recursive' on the host first" >&2
  exit 1
fi

forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --private-key "$PRIVATE_KEY"

ARTIFACT="broadcast/Deploy.s.sol/${CHAIN_ID}/run-latest.json"
if [ ! -f "$ARTIFACT" ]; then
  echo "deploy: broadcast artifact $ARTIFACT not found" >&2
  exit 1
fi

# No jq in the foundry image: pull the first contractAddress out of the
# artifact (a single-contract deploy has exactly one CREATE transaction).
ADDR=$(tr -d ' \n' < "$ARTIFACT" \
  | grep -o '"contractAddress":"0x[0-9a-fA-F]\{40\}"' \
  | head -n 1 \
  | grep -o '0x[0-9a-fA-F]\{40\}')

if [ -z "$ADDR" ]; then
  echo "deploy: could not extract contract address from $ARTIFACT" >&2
  exit 1
fi

printf 'NFT_CONTRACT_ADDRESS=%s\n' "$ADDR" > /shared/contract.env
echo "deploy: NFT_CONTRACT_ADDRESS=$ADDR written to /shared/contract.env"
