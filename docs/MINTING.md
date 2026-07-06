# Minting a Flower NFT locally (Anvil + MetaMask)

The mint happens **in the browser via MetaMask** — the backend only prepares the
metadata (uploads a `tokenURI` JSON to MinIO) and records the confirmed tx.
The local chain is Anvil (chain id **1337**), reset on every `docker compose up`.

## 0. One-time MetaMask setup

1. **Add the local network** — MetaMask → network picker → *Add network manually*:
   - Network name: `Anvil (Petal Pixel)`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `1337`
   - Currency symbol: `ETH`
2. **Import Anvil dev account #0** — MetaMask → account menu → *Import account* →
   private key:
   ```
   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   ```
   ⚠️ This is the **public, well-known Anvil test key**. Local chain only — never
   put real funds on it.
   ⚠️ **Minting only works from this account**: `FlowerNFT.mint` is `onlyOwner`,
   and the contract owner is the deployer = Anvil account #0. A mint sent from
   any other account reverts.

## 1. Mint

1. Stack up: `docker compose up -d` (from the repo root). App: http://localhost:8080
2. In the app: **Create** → enter a name → *Generate* → *Save*.
3. Click **Mint** → MetaMask prompts: connect (pick the imported Anvil account),
   approve the network switch if asked, then **confirm the transaction**.
4. On success the app shows the tx hash; the flower appears as minted in
   **NFT Collection**.

## 2. Verify the mint on-chain

- Contract address (deterministic on a fresh Anvil):
  `0x5FbDB2315678afecb367f032d93F642f64180aa3` — or read it from
  `docker compose logs deploy` (`NFT_CONTRACT_ADDRESS=…`).
- Metadata JSON (the tokenURI) is browsable:
  `http://localhost:9000/flower/metadata/<flowerId>.json`
- Optional CLI check (token 0 owner):
  ```bash
  docker run --rm --network petal-pixel_default ghcr.io/foundry-rs/foundry:stable \
    "cast call 0x5FbDB2315678afecb367f032d93F642f64180aa3 'ownerOf(uint256)(address)' 0 --rpc-url http://anvil:8545"
  ```

## 3. View the NFT in MetaMask

MetaMask does **not** auto-detect NFTs on local networks — import it manually:

1. MetaMask → **NFTs** tab → **Import NFT**.
2. Address: the contract address above.
3. **Token ID**: ids start at `0` and increment in mint order — your first mint
   is `0`, second is `1`, etc.
4. The NFT appears with its name and metadata.
   > Note: the current metadata has no `image` field yet, so wallets show a
   > placeholder picture. (Planned improvement: snapshot of the 3D flower
   > uploaded at mint time and referenced as `image`.)

## Gotchas

- **After `docker compose down && up` the chain is wiped** (fresh Anvil, contract
  redeployed at the same address, token ids restart at 0), but MetaMask caches
  the old nonce → transactions get stuck as "pending". Fix: MetaMask →
  Settings → Advanced → **Clear activity tab data** (for the Anvil network),
  then retry.
- Minted state shown in the app lives in Supabase/localStorage; the chain resets
  on restart, so an old "minted" flower won't exist on the new chain until you
  mint again.
- If MetaMask can't reach the RPC, make sure nothing else occupies port 8545 and
  the `anvil` service is healthy (`docker compose ps`).
