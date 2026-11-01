import { test, expect } from "@playwright/test";
import { ANNA, finishSignIn } from "./helpers";

test("a guest grows a flower on the home page without signing in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Every name");
  await expect(page.getByText("Dana grows a dahlia.")).toBeVisible();

  await page.getByLabel("A name to grow").fill("Zara");
  await page.getByRole("button", { name: "Grow it" }).click();

  await expect(page.getByText("Zara grows a tulip.")).toBeVisible();
  await expect(page).toHaveURL("/");
});

test("a name typed on the home page stays in the browser", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Dana grows a dahlia.")).toBeVisible();
  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") sent.push(request.url());
  });

  await page.getByLabel("A name to grow").fill("Zara");
  await page.getByRole("button", { name: "Grow it" }).click();
  await expect(page.getByText("Zara grows a tulip.")).toBeVisible();

  expect(sent).toEqual([]);
});

test("the same name grows the same flower on a second visit", async ({ page }) => {
  for (let visit = 0; visit < 2; visit += 1) {
    await page.goto("/");
    await page.getByLabel("A name to grow").fill("Omar");
    await page.getByRole("button", { name: "Grow it" }).click();
    await expect(page.getByText("Omar grows a tulip.")).toBeVisible();
  }
});

test("a visitor watches a plant grow, picks a flower and turns the lights off", async ({ page }) => {
  await page.goto("/");
  const section = page.locator("#grow");
  await section.scrollIntoViewIfNeeded();

  // A trial click fails if anything is drawn over the heading.
  await page.getByRole("heading", { name: "Watch one grow." }).click({ trial: true, timeout: 5000 });

  const age = page.getByLabel("Age of the plant");
  await expect.poll(async () => Number(await age.inputValue())).toBeGreaterThan(5);

  const rose = page.getByRole("button", { name: "Rose", exact: true });
  await rose.click();
  await expect(rose).toHaveAttribute("aria-pressed", "true");

  await section.getByRole("button", { name: "Turn the lights off" }).click();
  await expect(section).toHaveAttribute("data-night", "true");
  await section.getByRole("button", { name: "Turn the lights on" }).click();
  await expect(section).toHaveAttribute("data-night", "false");

  await page.getByRole("button", { name: "Orchid", exact: true }).click();
  await expect(page.getByText("scanned in 3D by the Smithsonian")).toBeVisible();
  await expect(page.getByRole("button", { name: "Another colour" })).toHaveCount(0);
});

test("picking the flower already chosen does not leave it loading", async ({ page }) => {
  await page.goto("/");
  await page.locator("#grow").scrollIntoViewIfNeeded();
  const orchid = page.getByRole("button", { name: "Orchid", exact: true });
  await orchid.click();
  await expect(page.getByText("scanned in 3D by the Smithsonian")).toBeVisible({ timeout: 15_000 });
  await orchid.click();
  await expect(page.getByText("scanned in 3D by the Smithsonian")).toBeVisible();
  await expect(page.getByText("Loading the scan.")).toHaveCount(0);
});

for (const [width, height] of [[390, 664], [768, 1024]]) {
  test(`the plant never covers the control in focus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.locator("#grow").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Lotus", exact: true }).focus();

    for (const key of [...Array(12).fill("Tab"), ...Array(12).fill("Shift+Tab")]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(60);
      const seen = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement;
        const box = element.getBoundingClientRect();
        const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return { name: element.textContent || element.getAttribute("aria-label"), seen: Boolean(top && element.contains(top)) };
      });
      expect(seen, JSON.stringify(seen)).toMatchObject({ seen: true });
    }
  });
}

test("a flower from the gallery grows in the studio", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Grow Oleg's rose" }).click();
  await expect(page.getByText("Oleg grows a rose.")).toBeVisible();
});

test("a flower picked from the gallery clears what was typed in the field", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("A name to grow").fill("Maya");
  await page.getByRole("button", { name: "Grow Oleg's rose" }).click();
  await expect(page.getByText("Oleg grows a rose.")).toBeVisible();
  await expect(page.getByLabel("A name to grow")).toHaveValue("");
});

test("a sent link opens on that flower, and the name never reaches a server", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (request) => asked.push(request.url()));
  await page.goto("/#name=Zara");
  await expect(page.getByText("Zara grows a tulip.")).toBeVisible();
  expect(asked.filter((url) => url.includes("Zara") && !url.includes("#"))).toEqual([]);
});

test("the visitor's own flower is waiting at the end of the page", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("A name to grow").fill("Zara");
  await page.getByRole("button", { name: "Grow it" }).click();
  await page.getByRole("link", { name: "Keep it" }).click();
  await expect(page.getByRole("button", { name: "Keep Zara's flower" })).toBeInViewport();
  await expect(page.getByRole("img", { name: "Zara's tulip, fully open" })).toBeVisible();
});

test("the name is named on the way into the garden", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("A name to grow").fill("Zara");
  await page.getByRole("button", { name: "Grow it" }).click();
  await expect(page.getByText("Zara grows a tulip.")).toBeVisible();
  await page.getByRole("button", { name: "Keep Zara's flower" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("the gallery can be seen with the lights off", async ({ page }) => {
  await page.goto("/");
  const gallery = page.locator("#flowers");
  await gallery.getByRole("button", { name: "Turn the lights off" }).click();
  await expect(gallery).toHaveAttribute("data-night", "true");
  await expect(gallery.locator(".tile__night").first()).toHaveCSS("opacity", "1");
  await gallery.getByRole("button", { name: "Turn the lights on" }).click();
  await expect(gallery).toHaveAttribute("data-night", "false");
});

test("keeping a flower leads through sign-in to that flower in the console", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("A name to grow").fill("Sofia");
  await page.getByRole("button", { name: "Grow it" }).click();
  await expect(page.getByText("Sofia grows a dahlia.")).toBeVisible();

  await page.getByRole("button", { name: "Keep Sofia's flower" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await finishSignIn(page, ANNA);

  await expect(page).toHaveURL(/\/create\?name=Sofia&grow=1/);
  await expect(page.getByPlaceholder("Enter a name or phrase...")).toHaveValue("Sofia");
  await expect(page.getByPlaceholder("Flower title...")).not.toHaveValue(/^(Untitled Flower)?$/);
});
