#!/bin/sh
set -e

# The deploy service writes NFT_CONTRACT_ADDRESS=0x... to /shared/contract.env.
# Tolerate BOM/CRLF and ignore anything that isn't a well-formed address line.
if [ -f /shared/contract.env ]; then
  addr=$(tr -d '\r' < /shared/contract.env \
    | sed -n 's/.*NFT_CONTRACT_ADDRESS=\(0x[0-9a-fA-F]\{40\}\).*/\1/p' \
    | head -n 1)
  if [ -n "$addr" ]; then
    export NFT_CONTRACT_ADDRESS="$addr"
    echo "docker-entrypoint: using NFT_CONTRACT_ADDRESS=$addr"
  else
    echo "docker-entrypoint: /shared/contract.env present but no valid address found" >&2
  fi
fi

exec /app/server
