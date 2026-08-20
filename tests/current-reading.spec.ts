import { expect, test } from "@playwright/test"

test("the current reading persists until another reading is selected", async ({ page }) => {
  await page.goto("/library")

  await page.locator(".shelfcard", { hasText: "Communities of Practice" }).click()
  await expect(page.locator(".primarynav")).toContainText("Communities of Practice")

  await page.getByRole("link", { name: "‹ library" }).click()
  await expect(page.locator(".primarynav")).toContainText("Communities of Practice")

  await page.locator(".shelfcard", { hasText: "This Is Not a Boundary Object" }).click()
  await page.getByRole("link", { name: "‹ library" }).click()
  await expect(page.locator(".primarynav")).toContainText("This Is Not a Boundary Object")
  await expect(page.locator(".primarynav")).not.toContainText("Communities of Practice")
})
