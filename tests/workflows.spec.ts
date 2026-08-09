/**
 * The Workflows tab — the three flow diagrams.
 *
 * The point of these assertions is that the diagram is GENERATED. A picture
 * drawn by hand fails loudly when it breaks; one computed from data fails
 * quietly, by rendering a slightly wrong graph. `scripts/check-workflows.ts`
 * covers the geometry without a browser; this covers the things only a browser
 * can answer — that it renders at all, that switching actor swaps the diagram,
 * and who is allowed to see it.
 */
import { test, expect } from "@playwright/test"

test.beforeEach(() => test.setTimeout(120_000))

test("all three diagrams render, and switching actor swaps them", async ({ page }) => {
  await page.goto("/workflows")
  await expect(page.getByRole("heading", { name: "Workflows" })).toBeVisible({ timeout: 15_000 })

  const nodes = page.locator("[data-flow-node]")

  // Student is the default and the longest of the three.
  await expect(page.getByRole("tab", { name: "Student" })).toHaveAttribute("aria-selected", "true")
  const studentCount = await nodes.count()
  expect(studentCount).toBeGreaterThan(10)
  await expect(page.locator("[data-flow-node='capture']")).toHaveCount(1)

  await page.getByRole("tab", { name: "Faculty" }).click()
  await expect(page.locator("[data-flow-node='roster']")).toHaveCount(1)
  // A different flow, not the same one relabelled.
  await expect(page.locator("[data-flow-node='capture']")).toHaveCount(0)

  await page.getByRole("tab", { name: "Admin" }).click()
  await expect(page.locator("[data-flow-node='writepdf']")).toHaveCount(1)
  await expect(page.locator("[data-flow-node='roster']")).toHaveCount(0)
})

test("every node carries its label, and the diagram has a text alternative", async ({ page }) => {
  await page.goto("/workflows")
  await expect(page.getByRole("heading", { name: "Workflows" })).toBeVisible({ timeout: 15_000 })

  // Labels are wrapped into <text> lines, so there are at least as many lines
  // as nodes — zero would mean the boxes rendered empty.
  const nodeCount = await page.locator("[data-flow-node]").count()
  const lineCount = await page.locator(".flownodelabel").count()
  expect(lineCount).toBeGreaterThanOrEqual(nodeCount)

  // The SVG carries no per-node <title> (React 19 hoists <title> to the head
  // and breaks hydration), so the list IS the accessible alternative.
  const list = page.locator("details.flowtext")
  await expect(list).toHaveCount(1)
  await list.locator("summary").click()
  await expect(list.locator("ol > li")).toHaveCount(nodeCount)

  // Wide diagrams scroll inside their own box; the page must not scroll sideways.
  const overflow = await page.evaluate(
    () => document.body.scrollWidth - document.body.clientWidth
  )
  expect(overflow).toBeLessThanOrEqual(1)
})

test.describe("who may read the workflows", () => {
  test.use({ storageState: "playwright/.auth/faculty.json" })

  test("faculty may — it holds no course data", async ({ page }) => {
    await page.goto("/workflows")
    await expect(page.getByRole("heading", { name: "Workflows" })).toBeVisible({ timeout: 15_000 })
    await expect(page.locator("[data-flow-node]").first()).toBeVisible()
    // Still no write surfaces in their nav.
    const nav = page.locator("nav").first()
    await expect(nav.getByRole("link", { name: "Courses" })).toHaveCount(0)
  })
})

test.describe("a student reads their own flow, and only that", () => {
  test.use({ storageState: "playwright/.auth/testa.json" })

  test("the student flow, no picker, reached from the header", async ({ page }) => {
    // Moved out of /admin (TJ, 2026-08-08): a student may read how they move
    // through Loom. The other two describe surfaces they cannot reach.
    await page.goto("/workflows")
    await expect(page.getByRole("heading", { name: "Workflows" })).toBeVisible({ timeout: 15_000 })
    await expect(page.locator("[data-flow-node='capture']")).toHaveCount(1)
    await expect(page.getByRole("tab", { name: "Faculty" })).toHaveCount(0)
    await expect(page.getByRole("tab", { name: "Admin" })).toHaveCount(0)

    // And it is reachable from every page, beside About.
    await page.goto("/")
    await expect(page.locator('header a[href="/workflows"]')).toBeVisible({ timeout: 15_000 })
  })
})
