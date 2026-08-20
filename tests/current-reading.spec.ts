import { expect, test } from "@playwright/test"

test("readings can be added, switched, and closed from the desk", async ({ page }) => {
  await page.goto("/library")

  await page.getByRole("button", { name: "Add Communities of Practice to open readings" }).click()
  await expect(page).toHaveURL(/\/library$/)
  await expect(page.locator(".primarynav")).toContainText("Communities of Practice")

  await page.getByRole("button", { name: "Add This Is Not a Boundary Object to open readings" }).click()
  await expect(page).toHaveURL(/\/library$/)
  await expect(page.locator(".primarynav")).toContainText("This Is Not a Boundary Object")
  await expect(page.locator(".primarynav")).toContainText("Communities of Practice")

  await page.locator(".primarynav").getByRole("link", { name: "Communities of Practice" }).click()
  await expect(page.locator(".workspacehead")).toContainText("Communities of Practice")
  await expect(page.locator(".navreadings .navitem")).toHaveText([
    "This Is Not a Boundary Object",
    "Communities of Practice",
  ])

  await page.getByRole("button", { name: "Close Communities of Practice" }).click()
  await expect(page).toHaveURL(/\/library$/)
  await expect(page.locator(".primarynav")).not.toContainText("Communities of Practice")
  await expect(page.locator(".primarynav")).toContainText("This Is Not a Boundary Object")
})

test("the selected reading tool survives a reload", async ({ page }) => {
  await page.goto("/studio/reading/star")
  await page.getByRole("button", { name: "Reflection", exact: true }).click()
  await expect(page).toHaveURL(/\?tool=reflect$/)

  await page.reload()
  await expect(page.getByRole("button", { name: "Reflection", exact: true })).toHaveClass(/active/)
  await expect(page.getByText("This reference has no source file attached; capture passages by hand.")).toHaveCount(0)
})
