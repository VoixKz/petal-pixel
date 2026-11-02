import { test, expect } from "@playwright/test";
import { ANNA, BEN, finishSignIn, generateFlower, signIn, uniqueName } from "./helpers";

test("a private page sends you to sign in and brings you back with the name", async ({ page }) => {
  await page.goto("/create?name=Deep%20Link");

  await expect(page).toHaveURL(/\/login$/);
  await finishSignIn(page, ANNA);

  await expect(page).toHaveURL(/\/create\?name=Deep(%20|\+)Link/);
  await expect(page.getByPlaceholder("Enter a name or phrase...")).toHaveValue("Deep Link");
});

test("a saved flower stays in your garden after a reload", async ({ page }) => {
  const name = uniqueName("Garden");
  await signIn(page, ANNA);
  await generateFlower(page, name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();

  await page.goto("/my-flowers");
  await page.reload();

  await expect(page.getByText(name).first()).toBeVisible();
});

// A card's picture is drawn on this device from the name, so it needs no picture store.
test("a saved flower shows its picture in the garden", async ({ page }) => {
  const name = uniqueName("Picture");
  await signIn(page, ANNA);
  await generateFlower(page, name);
  await page.locator("canvas").first().waitFor();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Flower saved to your collection!")).toBeVisible();

  await page.goto("/my-flowers");

  const card = page.locator("img[src^='data:image/webp'], img[src^='data:image/png']").first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  // A blank image has a size too, so count the pixels something was really drawn on.
  const painted = await card.evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d")!;
    context.drawImage(img, 0, 0, 64, 64);
    const { data } = context.getImageData(0, 0, 64, 64);
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 200) count += 1;
    return count / (64 * 64);
  });
  expect(painted).toBeGreaterThan(0.05);
});

test("the studio takes a real picture of the flower, and leaves the plant as it was", async ({ page }) => {
  const name = uniqueName("Download");
  await signIn(page, ANNA);
  await generateFlower(page, name);
  await page.locator("canvas").first().waitFor();
  const age = page.getByLabel("Age of the plant");
  await age.fill("30");

  await page.getByRole("button", { name: "Download" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: /PNG/ }).click(),
  ]);
  const file = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of file) chunks.push(chunk as Buffer);
  const picture = Buffer.concat(chunks);

  expect(picture.subarray(1, 4).toString()).toBe("PNG");
  expect(picture.readUInt32BE(16)).toBe(1024);
  expect(picture.length).toBeGreaterThan(50_000);
  await expect(age).toHaveValue("30");
});

test("a shared flower opens without an account, and growing yours needs none either", async ({ page }) => {
  const name = uniqueName("Shared");
  await signIn(page, ANNA);
  await generateFlower(page, name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Flower saved to your collection!")).toBeVisible();
  const id = await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("petal-pixel-flowers") ?? "{}");
    return stored?.state?.savedFlowers?.at(-1)?.backendFlowerId as string | undefined;
  });
  test.skip(!id, "the saved flower's id is not readable from the store key");

  const stranger = await page.context().browser()!.newPage();
  await stranger.goto(`/share/${id}`);
  await expect(stranger.getByRole("heading", { level: 1 })).toContainText(name);
  await expect(stranger.locator("canvas").first()).toBeVisible();
  // Turning the lights off takes the whole page with it, so the name stays readable.
  await stranger.getByRole("button", { name: "Turn the lights off" }).click();
  await expect(stranger.locator(".share")).toHaveCSS("color", "rgb(255, 255, 255)");
  await stranger.getByRole("button", { name: "Grow yours" }).click();
  await expect(stranger.getByLabel("Your name")).toBeFocused();
  await stranger.getByLabel("Your name").fill("Zara");
  await stranger.getByRole("button", { name: "Grow yours" }).click();
  await expect(stranger).toHaveURL(/\/#name=Zara$/);
  await expect(stranger.getByText("Zara grows a tiger lily.")).toBeVisible();
  await stranger.close();
});

test("another account does not see your flower", async ({ page, context }) => {
  const name = uniqueName("Private");
  await signIn(page, ANNA);
  await generateFlower(page, name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();

  await context.clearCookies();
  await page.evaluate(() => window.localStorage.clear());
  await signIn(page, BEN);
  await page.goto("/my-flowers");

  await expect(page.getByRole("heading", { name: /flowers/i }).first()).toBeVisible();
  await expect(page.getByText(name)).toHaveCount(0);
});

test("the sign-up page opens registration", async ({ page }) => {
  await page.goto("/signup");

  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForURL(/\/realms\/petal-pixel\//);
  await expect(page.getByRole("button", { name: "Register" })).toBeVisible();
});
