/**
 * Assertions for `blobNamespace` in src/lib/storage.ts — the one function
 * standing between a cover regenerated on the dev alias and the cover a student
 * is looking at.
 *
 *   npx tsx scripts/check-blob-namespace.ts
 *
 * Pure, no fixtures and no network, so it runs inside `npm run check`. It earns
 * that place because the failure it guards against is silent: every case below
 * that returns "" is a case where this process may overwrite and delete
 * production's objects, and nothing at runtime would tell you it had. The
 * property to preserve is that **exactly one** input returns the bare prefix.
 */
import { blobNamespace } from "../src/lib/storage"

let failures = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures += 1
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`)
  if (!ok) console.log(`          got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
}

console.log("\nproduction, and only production, writes bare keys")
check("production", blobNamespace({ VERCEL_ENV: "production" }), "")
check("preview is not production", blobNamespace({ VERCEL_ENV: "preview" }), "env/preview/")
check("no VERCEL_ENV at all — local, scripts, CI", blobNamespace({}), "env/local/")
check("development", blobNamespace({ VERCEL_ENV: "development" }), "env/local/")
// The mistake this rules out is writing the gate as `!== "production"`, which
// treats a missing or misspelt value as permission.
check("a misspelt value fails closed", blobNamespace({ VERCEL_ENV: "Production" }), "env/local/")
check("an empty value fails closed", blobNamespace({ VERCEL_ENV: "" }), "env/local/")

console.log("\na preview is namespaced per branch, so two previews cannot collide")
check(
  "branch ref becomes part of the drawer",
  blobNamespace({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "dev" }),
  "env/preview-dev/"
)
check(
  "slashes in a ref do not become directories",
  blobNamespace({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "fix/blob-namespace" }),
  "env/preview-fix-blob-namespace/"
)
check(
  "a traversing ref cannot climb out of the drawer",
  blobNamespace({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "../../covers" }),
  "env/preview-covers/"
)
check(
  "a ref of only punctuation still names something",
  blobNamespace({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "///" }),
  "env/preview-unnamed/"
)
// The segment that survives must not be able to BE a traversal, not merely to
// contain one — `env/../` is the pathname that would reach the store's root.
check(
  "a ref of exactly .. cannot become a traversing segment",
  blobNamespace({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: ".." }),
  "env/preview-unnamed/"
)
check(
  "dots survive inside a name",
  blobNamespace({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "release.2" }),
  "env/preview-release.2/"
)
check(
  "a missing ref falls back to the shared preview drawer, never to production",
  blobNamespace({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "  " }),
  "env/preview/"
)

console.log("\nthe explicit override — for CI, and for a second local checkout")
check("override wins over everything", blobNamespace({ LOOM_BLOB_NAMESPACE: "ci" }), "env/ci/")
check(
  "override still cannot reach production's keys",
  blobNamespace({ LOOM_BLOB_NAMESPACE: "../..", VERCEL_ENV: "preview" }),
  "env/unnamed/"
)
check(
  "an override of whitespace is not an override",
  blobNamespace({ LOOM_BLOB_NAMESPACE: "   ", VERCEL_ENV: "production" }),
  ""
)
check(
  "an override of .. cannot reach the store root",
  blobNamespace({ LOOM_BLOB_NAMESPACE: ".." }),
  "env/unnamed/"
)

console.log("\nevery namespace ends in a separator, so prefix + key is a path")
for (const env of [
  {},
  { VERCEL_ENV: "preview" },
  { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "dev" },
  { LOOM_BLOB_NAMESPACE: "ci" },
]) {
  const prefix = blobNamespace(env)
  check(`${JSON.stringify(env)} → trailing slash`, prefix.endsWith("/"), true)
}

console.log(
  failures === 0
    ? "\n[check-blob-namespace] all assertions passed\n"
    : `\n[check-blob-namespace] ${failures} FAILED\n`
)
process.exit(failures === 0 ? 0 : 1)
