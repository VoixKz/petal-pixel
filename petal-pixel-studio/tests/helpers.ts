import { expect, type Page } from "@playwright/test";
import { Contract, JsonRpcProvider } from "ethers";

export const ANNA = "anna@example.test";
export const BEN = "ben@example.test";
export const ALICE_WALLET = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"; // Anvil account 2
export const BOB_WALLET = "0x90F79bf6EB2c4f870365E785982E1f101E93b906"; // Anvil account 3

const RPC_URL = "http://127.0.0.1:8545";
const CONTRACT = "0x5fbdb2315678afecb367f032d93f642f64180aa3"; // first Anvil deployment
const PASSWORD = "local-test-password";

export function uniqueName(prefix: string) {
  return `${prefix} ${Date.now()}`;
}

/** Signs in through the real provider page, the way a person would. */
export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await finishSignIn(page, email);
}

/** Clicks through the app's sign-in page and fills in the provider's form. */
export async function finishSignIn(page: Page, email: string) {
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(/\/realms\/petal-pixel\//);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL((url) => url.origin === "http://localhost:8080" && !url.pathname.startsWith("/auth"));
}

/** A stand-in for MetaMask: same request API, answered by Anvil's unlocked accounts. */
export async function useWallet(page: Page, address: string) {
  await page.addInitScript(
    ({ address, rpcUrl }) => {
      const rpc = async (method: string, params: unknown[] = []) => {
        const res = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
        const body = await res.json();
        if (body.error) throw Object.assign(new Error(body.error.message), body.error);
        return body.result;
      };
      (window as unknown as { ethereum: unknown }).ethereum = {
        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          if (method === "eth_requestAccounts" || method === "eth_accounts") return [address];
          if (method === "wallet_switchEthereumChain") return null;
          return rpc(method, params);
        },
        on: () => undefined,
        removeListener: () => undefined,
      };
    },
    { address, rpcUrl: RPC_URL },
  );
}

export async function generateFlower(page: Page, name: string) {
  await page.goto("/create");
  await page.getByPlaceholder("Enter a name or phrase...").fill(name);
  await page.getByRole("button", { name: "Generate" }).click();
  // Save stays clickable during generation, so wait for the flower itself:
  // the title leaves its placeholder once the server has answered.
  await expect(page.getByPlaceholder("Flower title...")).not.toHaveValue(/^(Untitled Flower)?$/);
}

function nft() {
  const provider = new JsonRpcProvider(RPC_URL);
  return new Contract(
    CONTRACT,
    ["function nextTokenId() view returns (uint256)", "function ownerOf(uint256) view returns (address)"],
    provider,
  );
}

export async function nextTokenId(): Promise<bigint> {
  return nft().nextTokenId();
}

export async function ownerOf(tokenId: bigint): Promise<string> {
  return nft().ownerOf(tokenId);
}
