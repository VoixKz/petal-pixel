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

// The backend writes the picture and the gallery reads it back from storage, so
// only a real browser proves the two agree on where it lives.
test("a saved flower shows its picture in the garden", async ({ page }) => {
  const name = uniqueName("Picture");
  await signIn(page, ANNA);
  await generateFlower(page, name);
  // The picture is captured from the 3D canvas, which loads after the page.
  await page.locator("canvas").first().waitFor();
  const preview = page.waitForResponse((r) => r.url().endsWith("/preview") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect((await preview).status()).toBe(200);

  await page.goto("/my-flowers");

  const card = page.locator("img[src*='/previews/']").first();
  await expect(card).toBeVisible();
  await expect.poll(() => card.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
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

  await page.getByRole("button", { name: "Create Account" }).click();

  await page.waitForURL(/\/realms\/petal-pixel\//);
  await expect(page.getByRole("button", { name: "Register" })).toBeVisible();
});
