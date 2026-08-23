import { test, expect } from "@playwright/test"
import { openReading } from "./helpers"

test.use({ storageState: "playwright/.auth/testa.json" })

/**
 * The cloth and the board, taken away as pictures (TJ, 2026-08-23: "the cloth
 * and the board need a download as svg button").
 *
 * WHAT IS WORTH ASSERTING IS NOT THAT A FILE ARRIVES. A live <svg> handed
 * straight to XMLSerializer downloads perfectly and opens WRONG: both drawings
 * paint with `fill="var(--red)"` against tokens that only exist on `:root` in
 * the app's stylesheet, neither carries a viewBox or an xmlns, and neither
 * paints its own background. Every check below is one of those failures — a
 * file that opens black, or unscaled, or as a bare XML tree, would still pass
 * a test that only checked a file had arrived and had some size to it.
 *
 * `:visible` on the locators for the same reason object-download.spec.ts gives:
 * the workbench keeps every panel mounted, so an unscoped match can find a
 * hidden tab's copy of a button.
 */
test.describe("Download the drawing", () => {
  test("the cloth and the board come out as standalone SVG", async ({ page }) => {
    test.setTimeout(150_000)
    await openReading(page, "Object Worlds")

    // Both drawings live on 03 · Knowledge Graph: ClothReflection is rendered
    // inside MapTab, so one station carries the cloth and the board together.
    await page.locator("nav button.station", { hasText: "Knowledge Graph" }).first().click()
    await expect(page.locator("#cardTable")).toBeVisible({ timeout: 30_000 })

    const take = async (label: string) => {
      const button = page.locator(`button:visible`, { hasText: new RegExp(`^download ${label} \\.svg$`) })
      await expect(button.first()).toBeVisible({ timeout: 20_000 })
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 25_000 }),
        button.first().click(),
      ])
      const stream = await download.createReadStream()
      let text = ""
      for await (const chunk of stream) text += chunk
      return { name: download.suggestedFilename(), text }
    }

    for (const [label, kind] of [["the cloth", "cloth"], ["the board", "board"]] as const) {
      const file = await take(label)

      // Same naming as every other object leaving Loom: whose, what, stamped
      // last so a folder sorts like files together (object-download.spec.ts).
      expect(file.name, label).toMatch(new RegExp(`\\.${kind}\\.\\d{10}\\.svg$`))

      // A standalone file, not a fragment of a page.
      expect(file.text.startsWith("<?xml"), `${label}: xml declaration`).toBe(true)
      expect(file.text, label).toContain('xmlns="http://www.w3.org/2000/svg"')
      expect(file.text, `${label}: a coordinate system to scale by`).toMatch(/viewBox="0 0 \d+ \d+"/)

      /**
       * THE ONE THAT MATTERS MOST. Every colour in both drawings is written
       * `var(--token)`, and a file opened from disk has no `:root` to resolve
       * against — so an export that carries the var() through renders every
       * stroke black while still being a perfectly valid SVG.
       */
      expect(file.text, `${label}: no unresolved custom properties`).not.toContain("var(--")
      expect(file.text, `${label}: colours resolved to literals`).toMatch(/rgb\(\d+, ?\d+, ?\d+\)/)

      // Its own ground, so a dark viewer does not put dark ink on black.
      expect(file.text, `${label}: an opaque background`).toMatch(/<rect[^>]*fill="#f4f2ec"/)

      /**
       * The invisible hit twins are gone. Both drawings lay a transparent
       * shape over every clickable mark so the target is bigger than the ink;
       * in a file they are geometry a reader cannot see and an editor can.
       */
      expect(file.text, `${label}: no transparent hit targets`).not.toMatch(/rgba\(0, ?0, ?0, ?0\)/)
    }
  })

  test("the board leaves its card menus behind", async ({ page }) => {
    test.setTimeout(150_000)
    await openReading(page, "Object Worlds")
    await page.locator("nav button.station", { hasText: "Knowledge Graph" }).first().click()
    await expect(page.locator("#cardTable")).toBeVisible({ timeout: 30_000 })

    // The per-card ⋮ is a control: three dots inviting a click that a file
    // cannot answer. It is on screen…
    await expect(page.locator("#cardTable [data-cardmenu]").first()).toBeAttached({ timeout: 20_000 })

    const button = page.locator("button:visible", { hasText: /^download the board \.svg$/ })
    await expect(button.first()).toBeVisible({ timeout: 20_000 })
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 25_000 }),
      button.first().click(),
    ])
    const stream = await download.createReadStream()
    let text = ""
    for await (const chunk of stream) text += chunk

    // …and not in the file.
    expect(text).not.toContain("data-cardmenu")

    /**
     * And the drawing survived the removal. `drop` used to run BEFORE the
     * walk that pairs the clone with the live tree element by element, which
     * broke the pairing the first time a selector matched anything: the length
     * guard threw and the button silently did nothing. A file with cards in it
     * is what proves the removal happened at the right moment.
     */
    expect(text).toMatch(/<rect/)
    expect((text.match(/<text/g) ?? []).length).toBeGreaterThan(1)
  })
})
