const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const AxeBuilder = require("@axe-core/playwright").default;
const { test, expect } = require("@playwright/test");

const root = path.resolve(__dirname, "..", "..");
const skillDir = path.join(root, "skills", "generate-interactive-business-report");
const artifact = path.join(root, "tests", ".artifacts", "streaming-audience-report.html");
const reportUrl = pathToFileURL(artifact).href;
const galleryArtifact = path.join(root, "tests", ".artifacts", "chart-gallery.html");
const galleryUrl = pathToFileURL(galleryArtifact).href;
const flexibilityArtifact = path.join(root, "tests", ".artifacts", "flexibility-report.html");
const flexibilityUrl = pathToFileURL(flexibilityArtifact).href;
const themedArtifact = path.join(root, "tests", ".artifacts", "custom-theme-report.html");
const themedUrl = pathToFileURL(themedArtifact).href;
const minimalArtifact = path.join(root, "tests", ".artifacts", "minimal-reference-report.html");
const minimalUrl = pathToFileURL(minimalArtifact).href;

test.beforeAll(() => {
  execFileSync("python", [
    "-B",
    path.join(skillDir, "scripts", "render_html_report.py"),
    path.join(skillDir, "examples", "streaming-audience-fixture.json"),
    artifact
  ], { stdio: "inherit" });
  execFileSync("python", [
    "-B",
    path.join(skillDir, "scripts", "render_html_report.py"),
    path.join(skillDir, "examples", "chart-gallery.json"),
    galleryArtifact
  ], { stdio: "inherit" });
  execFileSync("python", [
    "-B",
    path.join(skillDir, "scripts", "render_html_report.py"),
    path.join(skillDir, "examples", "flexibility-fixture.json"),
    flexibilityArtifact
  ], { stdio: "inherit" });
  const customTheme = JSON.parse(fs.readFileSync(path.join(skillDir, "theme.json"), "utf8"));
  customTheme.name = "Synthetic purple theme";
  customTheme.colors.primary = "#6D28D9";
  const customThemePath = path.join(root, "tests", ".artifacts", "custom-theme.json");
  fs.writeFileSync(customThemePath, JSON.stringify(customTheme), "utf8");
  execFileSync("python", [
    "-B",
    path.join(skillDir, "scripts", "render_html_report.py"),
    path.join(skillDir, "examples", "chart-gallery.json"),
    themedArtifact,
    "--theme",
    customThemePath
  ], { stdio: "inherit" });
  execFileSync("python", [
    "-B",
    path.join(skillDir, "scripts", "render_html_report.py"),
    path.join(skillDir, "examples", "minimal-reference-fixture.json"),
    minimalArtifact
  ], { stdio: "inherit" });
});

async function openReport(page, width, height = 900) {
  const externalRequests = [];
  const consoleErrors = [];
  page.on("request", request => {
    if (!request.url().startsWith("file:")) externalRequests.push(request.url());
  });
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => consoleErrors.push(error.message));
  await page.setViewportSize({ width, height });
  await page.goto(reportUrl, { waitUntil: "load" });
  await expect(page.locator("[data-chart-ready='true']")).toHaveCount(5);
  return { externalRequests, consoleErrors };
}

for (const width of [370, 576, 768, 992, 1440]) {
  test(`responsive report at ${width}px`, async ({ page }) => {
    const { externalRequests, consoleErrors } = await openReport(page, width);
    const layout = await page.evaluate(() => ({
      viewport: window.innerWidth,
      scroll: document.documentElement.scrollWidth,
      firstSectionTop: document.querySelector(".report-section").getBoundingClientRect().top,
      headingSizes: (() => {
        const probe = document.createElement("h4");
        probe.textContent = "Hierarchy probe";
        document.body.append(probe);
        const sizes = ["h1", "h2", "h3"].map(selector =>
          parseFloat(getComputedStyle(document.querySelector(selector)).fontSize));
        sizes.push(parseFloat(getComputedStyle(probe).fontSize));
        sizes.push(parseFloat(getComputedStyle(document.body).fontSize));
        probe.remove();
        return sizes;
      })(),
      heroWidth: Math.round(document.querySelector(".hero").getBoundingClientRect().width),
      summaryWidth: Math.round(document.querySelector(".hero-deck").getBoundingClientRect().width),
      summaryColumns: getComputedStyle(document.querySelector(".hero-deck")).columnCount,
      gutter: getComputedStyle(document.documentElement).getPropertyValue("--gutter").trim(),
      navigationLabels: [...document.querySelectorAll(".section-nav a")]
        .map(link => link.textContent.trim()),
      duplicateCharts: document.querySelectorAll(".chart-wide, .chart-narrow").length,
      visibleSvgs: [...document.querySelectorAll("[data-chart-host] svg")]
        .filter(svg => svg.getBoundingClientRect().width > 0).length
    }));
    expect(layout.scroll).toBeLessThanOrEqual(layout.viewport);
    expect(layout.duplicateCharts).toBe(0);
    expect(layout.visibleSvgs).toBeGreaterThanOrEqual(4);
    expect(layout.headingSizes.every((size, index, values) => index === 0 || values[index - 1] > size)).toBe(true);
    expect(layout.navigationLabels.every(label => !/^(section|finding|chapter)\s+\d+$/i.test(label))).toBe(true);
    if (width >= 992) {
      expect(layout.summaryColumns).toBe("2");
      expect(layout.gutter).toBe("32px");
      expect(layout.summaryWidth).toBe(layout.heroWidth);
    } else {
      expect(layout.summaryColumns).not.toBe("2");
      expect(layout.gutter).toBe(width <= 575 ? "16px" : "24px");
    }
    if (width >= 992) expect(layout.firstSectionTop).toBeLessThan(900);
    expect(externalRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await expect(page).toHaveScreenshot(`quality-${width}.png`, { fullPage: true });
  });
}

test("minimal report remains complete without optional scaffolding", async ({ page }) => {
  await page.setViewportSize({ width: 370, height: 900 });
  await page.goto(minimalUrl, { waitUntil: "load" });
  await expect(page.locator("h1")).toHaveText("Service coverage reference");
  await expect(page.locator(".report-section")).toHaveCount(1);
  await expect(page.locator(".section-nav, .metric-strip, .closing, .supporting, [data-chart-root]")).toHaveCount(0);
  await expect(page.locator(".report-section > .eyebrow")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(370);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(violation => ["serious", "critical"].includes(violation.impact))).toEqual([]);
});

test("dense ranking and local views stay compact", async ({ page }) => {
  await openReport(page, 1440);
  const firstChart = page.locator("#chart-release-hours [data-chart-host]");
  expect(await firstChart.evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(760);
  const completionRate = page.getByRole("button", { name: "Completion rate" });
  await completionRate.focus();
  await page.keyboard.press("Enter");
  await expect(completionRate).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#chart-release-completion [data-chart-host] svg")).toBeVisible();
  await page.getByRole("button", { name: "Reset", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Viewing hours" })).toHaveAttribute("aria-pressed", "true");
});

test("sections use the desktop canvas and linearize on mobile", async ({ page }) => {
  await openReport(page, 1440);
  const desktop = await page.evaluate(() => {
    const box = selector => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width) };
    };
    return {
      title: box("#section-releases h2"),
      intro: box("#section-releases .section-intro"),
      prose: [...document.querySelectorAll("#section-retention .prose-grid > p")].map(node => {
        const rect = node.getBoundingClientRect();
        return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width) };
      })
    };
  });
  expect(desktop.intro.x).toBeGreaterThan(desktop.title.x + desktop.title.width);
  expect(desktop.prose).toHaveLength(2);
  expect(desktop.prose[1].x).toBeGreaterThan(desktop.prose[0].x);
  expect(Math.abs(desktop.prose[1].y - desktop.prose[0].y)).toBeLessThan(3);

  await page.setViewportSize({ width: 370, height: 900 });
  const mobile = await page.evaluate(() => [...document.querySelectorAll("#section-retention .prose-grid > p")]
    .map(node => { const rect = node.getBoundingClientRect(); return { x: Math.round(rect.x), y: Math.round(rect.y) }; }));
  expect(mobile[1].x).toBe(mobile[0].x);
  expect(mobile[1].y).toBeGreaterThan(mobile[0].y);
});

test("sticky navigation leaves linked headings visible", async ({ page }) => {
  await openReport(page, 1440);
  await page.locator('.section-nav a[href="#section-retention"]').click();
  await expect(page.locator('.section-nav a[href="#section-retention"]')).toHaveAttribute("aria-current", "location");
  const top = await page.locator("#section-retention").evaluate(element => element.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(68);
});

test("mobile ranking expands and table stays compact", async ({ page }) => {
  await openReport(page, 370);
  const chart = page.locator("#chart-release-hours [data-chart-host]");
  const collapsedHeight = await chart.evaluate(element => element.getBoundingClientRect().height);
  const showAll = page.locator("[data-chart-toggle]").first();
  await expect(showAll).toHaveText("Show all 20 rows");
  await expect(showAll).toBeVisible();
  await showAll.click();
  await expect(showAll).toHaveAttribute("aria-expanded", "true");
  expect(await chart.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(collapsedHeight);

  await page.getByText("Explore all 20 releases").click();
  const detail = page.locator("details").filter({ hasText: "Explore all 20 releases" });
  const tableWrap = detail.locator(".table-wrap");
  const tableLayout = await tableWrap.evaluate(element => ({
    overflow: getComputedStyle(element).overflow,
    height: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
    width: element.clientWidth
  }));
  expect(tableLayout.overflow).toBe("auto");
  expect(tableLayout.height).toBeLessThanOrEqual(480);
  expect(tableLayout.scrollHeight).toBeGreaterThan(tableLayout.height);
  expect(tableLayout.scrollWidth).toBeGreaterThan(tableLayout.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(370);
});

test("table search, empty state, reset, and sort work", async ({ page }) => {
  await openReport(page, 992);
  await page.getByText("Explore all 20 releases").click();
  const detail = page.locator("details").filter({ hasText: "Explore all 20 releases" });
  const search = detail.getByRole("searchbox", { name: "Find a record" });
  await search.fill("Midnight Atlas");
  await expect(detail.locator("[data-table-status]")).toHaveText("1 of 20 rows shown");
  await search.fill("No matching account");
  await expect(detail.locator("[data-table-status]")).toContainText("No matching rows");
  await detail.getByRole("button", { name: "Reset table", exact: true }).click();
  await expect(detail.locator("[data-table-status]")).toHaveText("20 of 20 rows shown");
  await detail.getByRole("button", { name: "Viewing hours" }).focus();
  await page.keyboard.press("Enter");
  await expect(detail.locator("th").filter({ hasText: "Viewing hours" })).toHaveAttribute("aria-sort", "ascending");
});

test("all thirteen chart runtime families render", async ({ page }) => {
  const consoleErrors = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", error => consoleErrors.push(error.message));
  await page.setViewportSize({ width: 992, height: 900 });
  await page.goto(galleryUrl, { waitUntil: "load" });
  await expect(page.locator("[data-chart-ready='true']")).toHaveCount(13);
  await expect(page.locator("[data-chart-host] svg")).toHaveCount(13);
  expect(consoleErrors).toEqual([]);
});

test("custom theme reaches CSS and chart rendering", async ({ page }) => {
  await page.setViewportSize({ width: 992, height: 900 });
  await page.goto(themedUrl, { waitUntil: "load" });
  await expect(page.locator("[data-chart-ready='true']")).toHaveCount(13);
  const theme = await page.evaluate(() => ({
    primary: getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
    chartColors: [...document.querySelectorAll("#chart-line svg [fill], #chart-line svg [stroke]")]
      .flatMap(node => [node.getAttribute("fill"), node.getAttribute("stroke")])
      .filter(Boolean)
  }));
  expect(theme.primary).toBe("#6d28d9");
  expect(theme.chartColors).toContain("#6d28d9");
});

test("section filters link charts and tables, and drill-down opens exact detail", async ({ page }) => {
  await openReport(page, 992);
  const section = page.locator("#section-releases");
  const filter = section.getByLabel("Release format");
  await filter.selectOption({ label: "Series" });
  await expect(section.locator("[data-filter-status]")).toHaveText("Filters applied: 1.");
  await expect(section.locator("#chart-release-hours")).toHaveAttribute("data-visible-rows", "6");

  const detail = section.locator("details").filter({ hasText: "Explore all 20 releases" });
  await detail.getByText("Explore all 20 releases").click();
  await expect(detail.locator("[data-table-status]")).toHaveText("6 of 20 rows shown");

  await section.evaluate(element => element.dispatchEvent(new CustomEvent("report:drilldown", {
    detail: { chart: "release-hours", category: "Midnight Atlas" }
  })));
  await expect(detail).toHaveAttribute("open", "");
  await expect(detail.locator("[data-drilldown-status]")).toHaveText("Showing details for Midnight Atlas.");
  await expect(detail.locator("[data-table-status]")).toHaveText("1 of 20 rows shown");

  await detail.getByRole("button", { name: "Clear drill-down" }).click();
  await section.getByRole("button", { name: "Reset filters" }).click();
  await expect(section.locator("#chart-release-hours")).toHaveAttribute("data-visible-rows", "20");
  await expect(detail.locator("[data-table-status]")).toHaveText("20 of 20 rows shown");
});

test("rich content, subsections, and a controlled image remain responsive", async ({ page }) => {
  const externalRequests = [];
  const consoleErrors = [];
  page.on("request", request => {
    if (!request.url().startsWith("file:") && !request.url().startsWith("data:")) {
      externalRequests.push(request.url());
    }
  });
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => consoleErrors.push(error.message));
  await page.setViewportSize({ width: 370, height: 900 });
  await page.goto(flexibilityUrl, { waitUntil: "load" });
  await expect(page.locator(".report-subsection > h3")).toHaveCount(2);
  await expect(page.locator(".report-image > h4")).toHaveText("Three synthetic workflow stages increase in sequence");
  await expect(page.locator(".report-list > li")).toHaveCount(3);
  await expect(page.locator(".citation a")).toHaveAttribute("href", "https://example.com/source");
  const image = page.locator(".report-image img");
  await expect(image).toHaveAttribute("alt", "Three vertical bars increase from left to right above a horizontal baseline.");
  const layout = await image.evaluate(element => ({
    naturalWidth: element.naturalWidth,
    naturalHeight: element.naturalHeight,
    renderedWidth: element.getBoundingClientRect().width,
    viewport: window.innerWidth,
    scroll: document.documentElement.scrollWidth
  }));
  expect(layout.naturalWidth).toBe(640);
  expect(layout.naturalHeight).toBe(240);
  expect(layout.renderedWidth).toBeLessThan(layout.viewport);
  expect(layout.scroll).toBeLessThanOrEqual(layout.viewport);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(violation => ["serious", "critical"].includes(violation.impact))).toEqual([]);
  expect(externalRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("mobile waterfall uses horizontal rows", async ({ page }) => {
  await page.setViewportSize({ width: 370, height: 844 });
  await page.goto(galleryUrl, { waitUntil: "load" });
  const waterfall = page.locator("#chart-waterfall");
  await expect(waterfall).toHaveAttribute("data-chart-ready", "true");
  const positions = await waterfall.locator("svg text").evaluateAll(nodes => {
    const locate = label => {
      const node = nodes.find(candidate => candidate.textContent === label);
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y };
    };
    return { opening: locate("Opening"), growth: locate("Growth") };
  });
  expect(Math.abs(positions.opening.x - positions.growth.x)).toBeLessThan(12);
  expect(positions.growth.y).toBeGreaterThan(positions.opening.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(370);
});

test("report has no serious automated accessibility violations", async ({ page }) => {
  await openReport(page, 1440);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(violation => ["serious", "critical"].includes(violation.impact));
  expect(serious).toEqual([]);
});

test("reduced motion preference still renders charts", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openReport(page, 768);
  await expect(page.locator("[data-chart-host] svg").first()).toBeVisible();
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
});
