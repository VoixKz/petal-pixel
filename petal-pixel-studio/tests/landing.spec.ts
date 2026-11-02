import { test, expect } from "@playwright/test";
import { ANNA, finishSignIn } from "./helpers";

test("a guest grows a flower on the home page without signing in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Every name");
  await expect(page.getByText("Dana grows a rose.")).toBeVisible();

  await page.getByLabel("A name to grow").fill("Zara");
  await page.getByRole("button", { name: "Grow it" }).click();

  await expect(page.getByText("Zara grows a tiger lily.")).toBeVisible();
  await expect(page).toHaveURL("/");
});

test("a name typed on the home page stays in the browser", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Dana grows a rose.")).toBeVisible();
  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") sent.push(request.url());
  });

  await page.getByLabel("A name to grow").fill("Zara");
  await page.getByRole("button", { name: "Grow it" }).click();
  await expect(page.getByText("Zara grows a tiger lily.")).toBeVisible();

  expect(sent).toEqual([]);
});

test("the same name grows the same flower on a second visit", async ({ page }) => {
  for (let visit = 0; visit < 2; visit += 1) {
    await page.goto("/");
    await page.getByLabel("A name to grow").fill("Omar");
    await page.getByRole("button", { name: "Grow it" }).click();
    await expect(page.getByText("Omar grows a tiger lily.")).toBeVisible();
  }
});

test("a visitor watches a plant grow, picks a flower and turns the lights off", async ({ page }) => {
  await page.goto("/");
  const section = page.locator("#grow");
  await section.scrollIntoViewIfNeeded();

  // A trial click fails if anything is drawn over the heading.
  await page.getByRole("heading", { name: "Watch one grow." }).click({ trial: true, timeout: 20_000 });

  const age = page.getByLabel("Age of the plant");
  await expect.poll(async () => Number(await age.inputValue()), { timeout: 20_000 }).toBeGreaterThan(5);

  const rose = page.getByRole("button", { name: "Rose", exact: true });
  await rose.click();
  await expect(rose).toHaveAttribute("aria-pressed", "true");

  await section.getByRole("button", { name: "Turn the lights off" }).click();
  await expect(section).toHaveAttribute("data-night", "true");
  await section.getByRole("button", { name: "Turn the lights on" }).click();
  await expect(section).toHaveAttribute("data-night", "false");

  await page.getByRole("button", { name: "Hibiscus", exact: true }).click();
  await expect(page.getByText("Drag the flower to turn it.")).toBeVisible({ timeout: 40_000 });
  await expect(page.getByRole("button", { name: "Another colour" })).toBeVisible();
});

test("picking the flower already chosen does not leave it loading", async ({ page }) => {
  await page.goto("/");
  await page.locator("#grow").scrollIntoViewIfNeeded();
  const peony = page.getByRole("button", { name: "Peony", exact: true });
  await peony.click();
  await expect(page.getByText("Drag the flower to turn it.")).toBeVisible({ timeout: 40_000 });
  await peony.click();
  await expect(page.getByText("Drag the flower to turn it.")).toBeVisible();
  await expect(page.getByText("Loading the flower.")).toHaveCount(0);
});

test("every flower names who made it, as its licence asks", async ({ page }) => {
  await page.goto("/");
  const credits = page.locator(".foot__credits");
  await expect(credits).toContainText("0BNDT");
  await expect(credits).toContainText("thesidekick");
  await expect(credits.getByRole("link")).toHaveCount(6);
});

for (const [width, height] of [[390, 664], [768, 1024]]) {
  test(`the plant never covers the control in focus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.locator("#grow").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Water lily", exact: true }).focus();

    for (const key of [...Array(12).fill("Tab"), ...Array(12).fill("Shift+Tab")]) {
      await page.keyboard.press(key);
      // Moving focus scrolls the page, so judge where it comes to rest.
      await expect
        .poll(() =>
          page.evaluate(() => {
            const element = document.activeElement as HTMLElement;
            const box = element.getBoundingClientRect();
            const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            return Boolean(top && element.contains(top));
          }),
        )
        .toBe(true);
    }
  });
}

test("a flower from the gallery grows in the studio", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Grow Iris's rose" }).click();
  await expect(page.getByText("Iris grows a rose.")).toBeVisible();
});

test("a flower picked from the gallery clears what was typed in the field", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("A name to grow").fill("Maya");
  await page.getByRole("button", { name: "Grow Iris's rose" }).click();
  await expect(page.getByText("Iris grows a rose.")).toBeVisible();
  await expect(page.getByLabel("A name to grow")).toHaveValue("");
});

test("a sent link opens on that flower, and the name never reaches a server", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (request) => asked.push(request.url()));
  await page.goto("/#name=Zara");
  await expect(page.getByText("Zara grows a tiger lily.")).toBeVisible();
  expect(asked.filter((url) => url.includes("Zara") && !url.includes("#"))).toEqual([]);
});

test("the visitor's own flower is waiting at the end of the page", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("A name to grow").fill("Zara");
  await page.getByRole("button", { name: "Grow it" }).click();
  await page.getByRole("link", { name: "Keep it" }).click();
  await expect(page.getByRole("button", { name: "Keep Zara's flower" })).toBeInViewport();
  await expect(page.getByRole("img", { name: "Zara's tiger lily, fully open" })).toBeVisible();
});

test("the flower at the end of the page is always the one its field names", async ({ page }) => {
  await page.goto("/#name=Iris");
  const field = page.getByLabel("The name to keep");
  const flower = page.locator(".close__flower");
  await field.scrollIntoViewIfNeeded();
  await expect(flower).toHaveAttribute("aria-label", "Iris's rose, fully open");

  await field.fill("Maria");
  await expect(flower).toHaveAttribute("aria-label", "Maria's peony, fully open");
  await expect(page.getByRole("button", { name: "Keep Maria's flower" })).toBeVisible();

  // An empty field names nothing, so the last flower stays until there is a new name.
  await field.fill("");
  await expect(flower).toHaveAttribute("aria-label", "Maria's peony, fully open");
});

test("the name is named on the way into the garden", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("A name to grow").fill("Zara");
  await page.getByRole("button", { name: "Grow it" }).click();
  await expect(page.getByText("Zara grows a tiger lily.")).toBeVisible();
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
  await expect(page.getByText("Sofia grows a rose.")).toBeVisible();

  await page.getByRole("button", { name: "Keep Sofia's flower" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await finishSignIn(page, ANNA);

  await expect(page).toHaveURL(/\/create\?name=Sofia&grow=1/);
  await expect(page.getByPlaceholder("Enter a name or phrase...")).toHaveValue("Sofia");
  await expect(page.getByPlaceholder("Flower title...")).not.toHaveValue(/^(Untitled Flower)?$/);
});

test("a flower that cannot load leaves the page standing", async ({ page }) => {
  await page.route("**/models/heads/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByLabel("A name to grow").fill("Zara");
  await page.getByRole("button", { name: "Grow it" }).click();
  await expect(page.getByText("This flower did not load.")).toBeVisible();
  await page.locator("#flowers").scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Grow Iris's rose" })).toBeVisible();
  await expect(page.getByText("Unexpected Application Error")).toHaveCount(0);
});

test("a browser that cannot draw 3D still gets the whole page", async ({ page }) => {
  await page.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
      if (kind.startsWith("webgl")) return null;
      return (real as (...a: unknown[]) => unknown).call(this, kind, ...rest);
    } as typeof real;
  });
  await page.goto("/");
  await expect(page.getByText("This browser cannot draw the plant.")).toBeVisible();
  await page.locator(".foot").scrollIntoViewIfNeeded();
  await expect(page.locator(".foot__credits")).toContainText("0BNDT");
  await expect(page.getByText("Unexpected Application Error")).toHaveCount(0);
});
