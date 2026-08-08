/**
 * REPRODUCTION of an open bug, not a check — this script is expected to FAIL
 * (report bounces) until the fault below is fixed. It exits 0 either way.
 *
 * The fault: enter a reading by clicking its card on the shelf (a client-side
 * `<Link>` navigation), then call any Server Function from the workbench. About
 * half the time the function POSTs to `/` instead of `/reading/<id>`, the
 * server answers with the library's tree, and the App Router replaces the
 * workbench with the library — `history.replaceState -> /` from the router's
 * own mount effect. The student is standing in a reading one moment and on the
 * shelf the next, mid-work.
 *
 * It is NOT specific to the Overlays. Measured 2026-08-07 against a production
 * build (`next build && next start`), Test User A, "Object Worlds":
 *
 *   shelf click → reading search   (searchReading)      2/4 bounced
 *   shelf click → passages overlay (getPassagesOverlay) 2/4 bounced
 *   DIRECT LOAD → passages overlay                      0/4 bounced
 *
 * So it is the client-side entry, not the action. Same family as audit finding
 * U-3 (navigation racing in-flight action POSTs); the likely culprit is the
 * shelf's own `getUserLoomData` POST still in flight when the Link navigation
 * commits, leaving the router's canonical URL behind on `/`.
 *
 * Usage — needs a server and a signed-in storage state:
 *   npm run dev -- -p 3100
 *   node scripts/repro-action-bounce.mjs [runs] [search|overlay]
 *   PORT_UT=3200 DIRECT=1 node scripts/repro-action-bounce.mjs 4   # the control
 */
import { chromium } from "@playwright/test"

const RUNS = Number(process.argv[2] || 4)
const MODE = process.argv[3] || "overlay"
const PORT = process.env.PORT_UT || 3100
const READING = "Object Worlds"

const browser = await chromium.launch()
let bounced = 0

for (let run = 1; run <= RUNS; run += 1) {
  const ctx = await browser.newContext({
    storageState: "playwright/.auth/testa.json",
    viewport: { width: 1280, height: 720 },
  })
  // The first-run walkthrough's scrim eats every click on a fresh origin.
  await ctx.addInitScript(() => localStorage.setItem("loom_has_seen_walkthrough", "true"))
  const page = await ctx.newPage()
  const posts = []
  page.on("response", (r) => { if (r.request().method() === "POST") posts.push(new URL(r.url()).pathname) })

  await page.goto(`http://localhost:${PORT}/`)
  const card = page.locator(".shelfcard", { hasText: READING }).first()
  await card.waitFor({ timeout: 20_000 })
  const href = await card.locator(".shelfmain").getAttribute("href")

  if (process.env.DIRECT) {
    await page.goto(`http://localhost:${PORT}${href}`)   // the control: no client-side nav
  } else {
    await card.locator(".shelfmain").click()
    await page.waitForURL(/\/reading\//)
  }
  await page.getByText("Loading your loom...").waitFor({ state: "detached", timeout: 20_000 }).catch(() => {})
  await page.locator("nav button", { hasText: "Reading" }).click()
  await page.getByText("Loading PDF...").waitFor({ state: "hidden", timeout: 20_000 }).catch(() => {})
  await page.waitForTimeout(1500)

  posts.length = 0
  if (MODE === "search") {
    await page.getByRole("button", { name: "Search this reading" }).click()
    await page.getByRole("searchbox").fill("design")
  } else {
    await page.getByRole("group", { name: "Compare your marks with others" })
      .getByRole("button", { name: "Section" }).click()
  }
  await page.waitForTimeout(3000)

  const bad = !page.url().includes("/reading/")
  if (bad) bounced += 1
  console.log(
    `run ${run}: ${MODE}${process.env.DIRECT ? " (direct load)" : ""} — ` +
      `${bad ? "BOUNCED to the library" : "stayed in the reading"}` +
      `  · action POSTed to ${posts.join(" ") || "(nothing)"}`
  )
  await ctx.close()
}

console.log(`\n[repro-action-bounce] ${bounced}/${RUNS} bounced${process.env.DIRECT ? " (direct load — expect 0)" : ""}`)
await browser.close()
