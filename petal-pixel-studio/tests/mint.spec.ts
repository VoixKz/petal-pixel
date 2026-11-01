import { test, expect } from "@playwright/test";
import {
  ALICE_WALLET,
  ANNA,
  BEN,
  BOB_WALLET,
  generateFlower,
  nextTokenId,
  ownerOf,
  signIn,
  uniqueName,
  useWallet,
} from "./helpers";

test("name to flower to NFT in the wallet, and a second buyer is refused", async ({ browser }) => {
  // CI renders WebGL on the CPU, and minting captures the flower more than once.
  test.setTimeout(240_000);
  const name = uniqueName("Minted");

  const annaContext = await browser.newContext();
  const anna = await annaContext.newPage();
  await useWallet(anna, ALICE_WALLET);
  await signIn(anna, ANNA);
  await generateFlower(anna, name);
  const tokenId = await nextTokenId();

  await anna.getByRole("button", { name: "Mint NFT" }).click();

  await expect(anna.getByText("NFT minted and confirmed in backend")).toBeVisible({ timeout: 120_000 });
  expect(await ownerOf(tokenId)).toBe(ALICE_WALLET);

  await anna.goto("/nfts");
  await expect(anna.getByText(name).first()).toBeVisible();
  await annaContext.close();

  const benContext = await browser.newContext();
  const ben = await benContext.newPage();
  await useWallet(ben, BOB_WALLET);
  await signIn(ben, BEN);
  await generateFlower(ben, name);

  await ben.getByRole("button", { name: "Mint NFT" }).click();

  await expect(ben.getByText("This flower is already minted. Try a different name.")).toBeVisible();
  expect(await ownerOf(tokenId)).toBe(ALICE_WALLET);
  expect(await nextTokenId()).toBe(tokenId + 1n);
  await benContext.close();
});
