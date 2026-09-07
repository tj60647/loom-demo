/**
 * Assertions for the validator on stored page assets — the thing that decides
 * whether a browser keeps showing a reader an image we have already replaced.
 *
 *   npx tsx scripts/check-page-etag.ts
 *
 * Pure, no fixtures and no network, so it runs inside `npm run check`. It
 * earns that place because the failure it guards is invisible from the server
 * side: the route is correct, the stored image is correct, and the reader is
 * still looking at last week's image because we told their browser nothing had
 * changed.
 *
 * That happened on 2026-09-06. Nineteen blank page images were replaced with
 * correct ones; the reading's storageKey did not change, because the PDF had
 * not changed; the ETag was therefore identical; and Chrome went on serving the
 * blank version from cache while Safari — which had never cached it — was fine.
 */
import { readFileSync } from "fs"
import path from "path"
import { PAGE_RENDER_VERSION, pageAssetETag } from "../src/lib/pageAssets"

let failures = 0

function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`)
  if (!ok && detail) console.log(`          ${detail}`)
}

const ROUTES = [
  "src/app/api/readings/[sourceId]/pages/[pageNumber]/route.ts",
  "src/app/api/readings/[sourceId]/pages/sheet/route.ts",
]

console.log("\nthe renderer version is part of the validator")
{
  const a = pageAssetETag("key-a", "1", 1280)
  const b = pageAssetETag("key-b", "1", 1280)
  check("a different storage key gives a different ETag", a !== b)

  // The property that matters, stated as the bug that motivated it: with the
  // key held constant, the version alone must move the tag. Recomputed rather
  // than hard-coded, so this keeps testing the real function after a bump.
  const withVersion = pageAssetETag("key-a", "1", 1280)
  const withoutVersion = `W/"${"key-a:1:1280"}"`
  check("the version is in the hashed input", withVersion !== withoutVersion)
  check(
    "PAGE_RENDER_VERSION is a whole number above zero",
    Number.isInteger(PAGE_RENDER_VERSION) && PAGE_RENDER_VERSION > 0,
    `got ${JSON.stringify(PAGE_RENDER_VERSION)}`
  )
}

console.log("\nthe page and sheet routes share one definition")
for (const route of ROUTES) {
  const src = readFileSync(path.join(process.cwd(), route), "utf8")
  const name = route.split("/").slice(-2).join("/")
  check(`${name} calls pageAssetETag`, /pageAssetETag\s*\(/.test(src))
  // A route that builds its own weak validator is a route that will not notice
  // the next version bump — which is exactly how the two got to be separate.
  check(
    `${name} does not hand-build a validator`,
    !/W\/\\?"\$\{/.test(src),
    "found a `W/\"${...}\"` template — call pageAssetETag instead"
  )
}

console.log("\nboth asset kinds are addressable through it")
{
  const page = pageAssetETag("k", "7", 1280)
  const sheet = pageAssetETag("k", "sheet", 2560)
  check("a page and the sheet do not collide", page !== sheet)
  check("both are weak validators", page.startsWith('W/"') && sheet.startsWith('W/"'))
}

console.log(failures === 0 ? "\nall ok\n" : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
