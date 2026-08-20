/**
 * Measures the shelf bounce — FIXED 2026-08-07; every mode should now report
 * 0/N bounced. Kept as the direct measurement of the fix (the specs assert the
 * same thing indirectly), and it now exits 1 on any bounce so it can gate a
 * hand-run check.
 *
 * The fault, while it was live: enter a reading by clicking its card (a
 * client-side `<Link>` navigation), then call any Server Function from the
 * workbench — about half the time it POSTed to `/` instead of `/reading/<id>`,
 * the server answered with the library's tree, and the App Router replaced the
 * workbench with the library, mid-work. Instrumented traces pinned the queue
 * mechanism: three load-time read actions queued on `/`; the click navigation
 * discarded only the PENDING one; that one's late response advanced the queue
 * and started the next read EARLY with the pre-navigation state, whose no-op
 * "bail-out" result was then committed over the navigation's — leaving the
 * queue's canonicalUrl on `/` while the rendered URL looked right (upstream:
 * vercel/next.js#90467, unfixed in Next 16.2.x; measured 2/4 bounced in prod,
 * 5/6 in dev).
 *
 * The fix: client components no longer invoke Server Functions for READS at
 * all — src/lib/reads.ts GETs thin route handlers instead, which do not touch
 * the router. With no read action ever queued, there is nothing to race.
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
  // Vestigial: the first-run walkthrough (whose scrim ate every click on a
  // fresh origin) was retired 2026-08-11; nothing reads this key any more.
  await ctx.addInitScript(() => localStorage.setItem("loom_has_seen_walkthrough", "true"))
  const page = await ctx.newPage()
  const posts = []
  page.on("response", (r) => {
    const url = new URL(r.url())
    // Action POSTs are the fault's transport; /api GETs are the fixed reads.
    if (r.request().method() === "POST") posts.push(url.pathname)
    else if (url.pathname.startsWith("/api/")) posts.push(`GET ${url.pathname}`)
  })

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

console.log(`\n[repro-action-bounce] ${bounced}/${RUNS} bounced${process.env.DIRECT ? " (direct load)" : ""} — expect 0`)
await browser.close()
process.exit(bounced > 0 ? 1 : 0)
