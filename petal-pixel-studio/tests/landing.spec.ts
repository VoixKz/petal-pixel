import { test, expect } from "@playwright/test";
import { ANNA, finishSignIn } from "./helpers";

test("a guest grows a flower on the home page without signing in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Every name");
  await expect(page.getByText("Dana grows a dahlia.")).toBeVisible();

  await page.getByLabel("A name to grow").fill("Zara");
  await page.getByRole("button", { name: "Grow it" }).click();

  await expect(page.getByText("Zara grows a lotus.")).toBeVisible();
  await expect(page).toHaveURL("/");
});

test("the same name grows the same flower on a second visit", async ({ page }) => {
  for (let visit = 0; visit < 2; visit += 1) {
    await page.goto("/");
    await page.getByLabel("A name to grow").fill("Omar");
    await page.getByRole("button", { name: "Grow it" }).click();
    await expect(page.getByText("Omar grows a star flower.")).toBeVisible();
  }
});

test("a flower from the gallery grows in the studio", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Grow Ben's rose" }).click();
  await expect(page.getByText("Ben grows a rose.")).toBeVisible();
});

test("keeping a flower leads through sign-in to that flower in the console", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("A name to grow").fill("Sofia");
  await page.getByRole("button", { name: "Grow it" }).click();
  await expect(page.getByText("Sofia grows a sunflower.")).toBeVisible();

  await page.getByRole("button", { name: "Open it in the console" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await finishSignIn(page, ANNA);

  await expect(page).toHaveURL(/\/create\?name=Sofia&grow=1/);
  await expect(page.getByPlaceholder("Enter a name or phrase...")).toHaveValue("Sofia");
  await expect(page.getByPlaceholder("Flower title...")).not.toHaveValue(/^(Untitled Flower)?$/);
});
