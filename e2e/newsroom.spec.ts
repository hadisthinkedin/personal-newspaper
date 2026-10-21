import { expect, test } from "@playwright/test";

test("renders every selected story as its own substantial sourced article", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "The Daily Bread" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "One Page. The Whole Day." })).toBeVisible();
  const refresh = page.getByRole("button", { name: "Refresh Edition" });
  const [newsResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/news?t=")),
    refresh.click(),
  ]);
  expect(newsResponse.ok()).toBe(true);

  const sections = page.locator("section.edition-section");
  await expect(sections).toHaveCount(12, { timeout: 30_000 });
  await expect(page.locator("article.brief-card")).toHaveCount(0);

  const stories = page.locator("article.story-article");
  expect(await stories.count()).toBeGreaterThan(0);
  for (let index = 0; index < await stories.count(); index += 1) {
    const story = stories.nth(index);
    await expect(story.getByRole("heading")).toBeVisible();
    const paragraphs = story.locator(":scope > p");
    const paragraphCount = await paragraphs.count();
    expect(paragraphCount).toBeGreaterThanOrEqual(3);
    expect(paragraphCount).toBeLessThanOrEqual(9);
    const sentenceCounts = await paragraphs.evaluateAll((nodes) => {
      const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
      return nodes.map((node) => {
        const copy = node.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('[role="tooltip"], .source-citation').forEach((decoration) => decoration.remove());
        return [...segmenter.segment(copy.textContent ?? "")]
          .filter(({ segment }) => /[A-Za-z]/.test(segment) && /[.!?][”"')\]]*\s*$/.test(segment.trim())).length;
      });
    });
    for (const sentenceCount of sentenceCounts) {
      expect(sentenceCount).toBeGreaterThanOrEqual(4);
      expect(sentenceCount).toBeLessThanOrEqual(6);
    }
    await expect(story.locator("a.source-citation").first()).toBeVisible();
    await expect(story).not.toContainText(/published headline|the report states|readers should consult|this edition reports/i);
  }
  await expect(page.locator("article.section-essay:not(.section-essay--quiet)")).toHaveCount(0);

  await expect(page.locator("#global a.source-citation").first()).toBeVisible();
  await expect(page.locator("#national a.source-citation").first()).toBeVisible();
  const aiStories = page.locator("#ai article.story-article");
  expect(await aiStories.count()).toBeGreaterThan(0);
  expect(await aiStories.count()).toBeLessThanOrEqual(6);

  const entity = page.locator("article.story-article [data-entity-term]").first();
  await expect(entity).toBeVisible();
  const tooltip = entity.getByRole("tooltip");
  await expect(tooltip).toBeHidden();
  expect(await entity.evaluate((node) => (node as HTMLElement).onclick)).toBeNull();
  await entity.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).not.toHaveText(/loading|named person, place, organization, or subject/i);
  const definitionText = (await tooltip.textContent())?.trim() ?? "";
  expect(definitionText.length).toBeGreaterThan(100);
  expect(definitionText.split(/(?<=[.!?])\s+/).length).toBeGreaterThanOrEqual(2);

  await expect(page.getByRole("heading", { name: "Perspective Check", exact: true })).toHaveCount(0);
  for (const heading of ["Global Headlines", "National Headlines", "Michigan", "Technology", "Top AI News", "Screen & Cinema", "Meaningful Good News"]) {
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeAttached();
  }

  await page.getByRole("link", { name: "Screen & Cinema", exact: true }).click();
  await expect(page).toHaveURL(/#screen-cinema$/);
  await expect(page.getByRole("heading", { name: "Screen & Cinema", exact: true })).toBeInViewport();
});

test("today and yesterday are separate Detroit-calendar editions", async ({ page, request }) => {
  const dayInDetroit = (value: string) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Detroit",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(value));
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  };

  const todayResponse = await request.get("/api/news");
  expect(todayResponse.ok()).toBe(true);
  const today = await todayResponse.json();
  expect(today.editionKind).toBe("today");
  expect(today.articles.length).toBeGreaterThan(0);
  expect(today.articles.every((article: { publishedAt: string | null }) => article.publishedAt && dayInDetroit(article.publishedAt) === today.editionDate)).toBe(true);

  const yesterdayResponse = await request.get("/api/news?edition=yesterday");
  expect(yesterdayResponse.ok()).toBe(true);
  const yesterday = await yesterdayResponse.json();
  expect(yesterday.editionKind).toBe("yesterday");
  expect(yesterday.editionDate).not.toBe(today.editionDate);
  expect(yesterday.articles.length).toBeGreaterThan(0);
  expect(yesterday.articles.every((article: { publishedAt: string | null }) => article.publishedAt && dayInDetroit(article.publishedAt) === yesterday.editionDate)).toBe(true);

  await page.goto("/?edition=yesterday");
  await expect(page.getByRole("link", { name: "Yesterday’s Edition" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Today’s Edition", exact: true })).toHaveAttribute("href", "/");
  await expect(page.locator(".edition-picker a")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Refresh Edition" })).toHaveCount(0);
});

test("mobile long-form edition fits the viewport and remains readable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "The Daily Bread" })).toBeVisible();
  await expect(page.locator("article.story-article").first()).toBeVisible({ timeout: 30_000 });
  const metrics = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(metrics.page).toBeLessThanOrEqual(metrics.viewport);

  const mobileEntity = page.locator("article.story-article [data-entity-term]").first();
  await mobileEntity.focus();
  const mobileTooltip = mobileEntity.getByRole("tooltip");
  await expect(mobileTooltip).toBeVisible();
  await expect(mobileTooltip).toHaveCSS("opacity", "1");
  const tooltipRect = await mobileTooltip.boundingBox();
  expect(tooltipRect).not.toBeNull();
  expect(tooltipRect!.x).toBeGreaterThanOrEqual(0);
  expect(tooltipRect!.x + tooltipRect!.width).toBeLessThanOrEqual(390);
  expect(tooltipRect!.y).toBeGreaterThanOrEqual(0);
  expect(tooltipRect!.y + tooltipRect!.height).toBeLessThanOrEqual(844);
  const focusedMetrics = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(focusedMetrics.page).toBeLessThanOrEqual(focusedMetrics.viewport);

  await page.getByRole("link", { name: "Meaningful Good News", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Meaningful Good News", exact: true })).toBeInViewport();
});
