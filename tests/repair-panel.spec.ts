/**
 * The repair panel, on its free path only.
 *
 * Everything here is deliberately unpaid: mounting, detection, the settings
 * dialog, and — the assertion this file exists for — that the crop beside a
 * proposed page is an image the reviewer can actually see. A blank crop shipped
 * to production twice without anything noticing, because nothing in the suite
 * had ever rendered a pixel: the panel showed an empty box, five models were
 * then sent that empty box, and the whole feedback was "No reader returned a
 * usable transcription". `naturalWidth > 0` is the one line that catches it.
 *
 * Nothing here presses a button that spends money. Reading a page costs about
 * $0.20 a time and takes a minute; a gate that bills the project on every push
 * is a gate somebody will switch off.
 *
 * Runs as the admin (the suite's default storage state).
 */
import { test, expect, type Page } from "@playwright/test"

test.beforeEach(() => test.setTimeout(120_000))

/** Open the Repair Text disclosure on the first reading that has one. */
async function openPanel(page: Page) {
  // `domcontentloaded`, not the default `load`: this page renders a cover
  // thumbnail per reading, and waiting for every one of them to decode makes
  // navigation hostage to cover generation — which on CI's Node is currently
  // failing inside pdf.js ("buffer.transferToFixedLength is not a function"),
  // so `load` never fires and the whole test times out at two minutes. The one
  // image this file actually cares about is the crop, and it is waited for
  // explicitly below.
  await page.goto("/admin/library", { waitUntil: "domcontentloaded" })
  await expect(page.getByRole("heading", { name: "Readings", exact: true })).toBeVisible({
    timeout: 20_000,
  })

  const summary = page.locator("summary", { hasText: "Repair Text" }).first()
  await expect(summary, "no reading offers Repair Text — is RepairPanel mounted?").toBeVisible({
    timeout: 15_000,
  })
  await summary.click()

  const panel = page.locator(".repair-panel").first()
  await expect(panel).toBeVisible({ timeout: 15_000 })
  return panel
}

test("the panel names its four acts, and marks the one that spends money", async ({ page }) => {
  const panel = await openPanel(page)

  const steps = panel.locator(".repair-steps")
  await expect(steps).toBeVisible()
  // The order is the point: a reviewer who cannot see the sequence is pressing
  // buttons, which is precisely the complaint this bar answers.
  await expect(steps).toContainText("Find damaged pages")
  await expect(steps).toContainText("Read them")
  await expect(steps).toContainText("Decide")
  await expect(steps).toContainText("Write")
  await expect(steps, "the paid step must say so before it is pressed").toContainText("costs")
})

test("the settings dialog names the readers and what they are told", async ({ page }) => {
  const panel = await openPanel(page)

  // Scoped to this panel: every reading on the page renders its own dialog, so
  // a page-level selector matches one per card.
  const dialog = panel.locator("dialog.repair-settings")
  const gear = panel.getByRole("button", { name: /how this reading gets read/i })

  // Retry the open rather than clicking once. Navigation waits only for the
  // DOM (see openPanel), so the first click can land before React has hydrated
  // — on inert HTML, which swallows it silently. The disclosure above survives
  // that because <details> toggling is the browser's, not ours; this button is
  // ours. `toPass` re-clicks until the handler exists.
  await expect(async () => {
    await gear.click()
    await expect(dialog).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await expect(dialog.getByRole("heading", { name: "How this reading gets read" })).toBeVisible()

  // The reader list is read off the pipeline's own constant, so an empty list
  // means the settings action is failing rather than that there are no readers.
  const readers = dialog.locator(".repair-readers li")
  await expect(readers.first()).toBeVisible({ timeout: 15_000 })
  expect(await readers.count()).toBeGreaterThan(1)

  // The brief itself, verbatim — the reviewer should be able to read what was
  // asked of the models whose output they are about to accept.
  await expect(dialog).toContainText("Transcribe ALL text visible in this image")
  await expect(dialog, "the accept guard's threshold belongs on screen").toContainText("%")

  await dialog.getByRole("button", { name: "Close" }).click()
  await expect(dialog).toBeHidden()
})

test("a proposed page shows a crop the reviewer can actually see", async ({ page }) => {
  const panel = await openPanel(page)

  const region = panel.locator(".repair-region").first()
  test.skip(
    (await region.count()) === 0,
    "no proposed pages in this database — run detection on a damaged reading first"
  )

  // Whose turn it is, not the raw row status: `proposed` covers both "nobody
  // has read this" and "the readers are done and waiting on you".
  await expect(region.locator(".pill").first()).toHaveText(
    /not read yet|your decision|accepted|written|rejected/
  )

  const crop = region.locator("figure img").first()
  await expect(crop).toBeVisible()

  // The assertion the whole file is for. A broken or blank-serving crop route
  // leaves an <img> that is present, sized by CSS, and completely useless —
  // only naturalWidth tells you the bytes arrived and decoded.
  await expect
    .poll(() => crop.evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 20_000 })
    .toBeGreaterThan(0)

  // And it must open full size: the crop is a whole page, which cannot be
  // checked against a transcription while shrunk into a column.
  const link = region.locator("figure a").first()
  await expect(link).toHaveAttribute("href", /\/api\/repairs\/.+\/crop/)
})
