import { test, expect } from "@playwright/test"
import { enterReadingFromCard } from "./helpers"

/**
 * A session that expires mid-reading must leave a way back in.
 *
 * The failure this guards (TJ, 2026-08-20, seen on the dev alias): the
 * workbench's signed-out state was "Please sign in to continue" with no
 * control on the page, and the reading-focus attribute had stood the header
 * down — so the one other surface carrying a sign-in button was hidden too.
 * A student whose session timed out inside a reading got a sentence and no
 * door.
 *
 * Simulated exactly as it happens: sign in (the suite's storageState), open
 * a reading, clear the cookies, reload the reading URL. The welcome must
 * offer sign-in (SignedOutWelcome — the same doors the Library shows), and
 * the header must be back, because `data-reading-focus` is session-gated
 * now. This spec writes nothing: the only cloth INSERT in the app is
 * saveCloth, reached from a deliberate title/description keystroke this
 * spec never makes, and the teardown reports zero debris after a run
 * (verified over repeated runs, 2026-08-20 — an earlier version of this
 * comment claimed entry mints a cloth, which is not a thing entry does).
 *
 * One seed dependency, named so a drift fails readably: the reload is
 * SIGNED OUT, so the server resolves the OLDEST unarchived course's visible
 * readings. Today that is the same course the test user's shelf shows; if a
 * seed ever puts an older course first, the reload lands on "That reading
 * isn't among your readings" instead of the welcome — which is why the
 * welcome heading is asserted before any button.
 */
test("an expired session inside a reading still offers a door back in", async ({ page, context }) => {
  await page.goto("/")
  const card = page.locator(".shelfcard").first()
  await expect(card, "seed missing — run `npm run seed:demo` first").toBeVisible({ timeout: 15_000 })
  await enterReadingFromCard(page, card)
  await expect(page).toHaveURL(/\/reading\//)

  // The timeout, compressed: the cookie is gone, the URL is not.
  await context.clearCookies()
  await page.reload()

  // The welcome first, so a seed drift (see the header note) fails saying
  // "no welcome" rather than timing out on a button.
  await expect(page.getByRole("main").getByRole("heading", { name: "Welcome to Loom." })).toBeVisible({
    timeout: 15_000,
  })

  // The door — the same primary action the Library's signed-out state offers,
  // scoped to main because the fix produces TWO buttons by design: this one,
  // and the header's own. (Local and CI are never branch previews, so the
  // GitHub button is the one to expect; on a preview the welcome offers the
  // preview door instead.)
  await expect(
    page.getByRole("main").getByRole("button", { name: "Sign in with GitHub" })
  ).toBeVisible({ timeout: 15_000 })

  // The chrome is back: signed out, the reading-focus attribute must not
  // stand the header down — it hides the header's own sign-in button and the
  // menu beside it. Assert the attribute, the header, and the header's own
  // door, each on its own so a failure names the half that regressed.
  expect(await page.locator("body").getAttribute("data-reading-focus")).toBeNull()
  await expect(page.locator("header")).toBeVisible()
  await expect(
    page.getByRole("banner").getByRole("button", { name: "Sign in with GitHub" })
  ).toBeVisible()
})
