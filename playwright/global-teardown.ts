/**
 * Sweep the suite's debris off the test account, after every run.
 *
 * Specs that write tear down at the end, and a spec that FAILS never reaches
 * its teardown. The rows then accumulate run after run until they change what
 * the next run sees — which is not a theory: on 2026-08-19 the sweep found 89
 * orphaned `A book carded by the journey suite …` readings, and three orphaned
 * `addcard seed …` passages had already broken a passing assertion in
 * `add-concept-card.spec.ts` by crowding a rail (railScale shrinks a crowded
 * side, so opening the editor rescaled the card and moved it 56px against a
 * 12px tolerance — the spec was right, the code was right, the fixture was
 * wrong).
 *
 * A teardown is the right home rather than per-spec cleanup, precisely because
 * the failing case is the one that skips its own cleanup. This runs whatever
 * happened.
 *
 * IT NEVER FAILS THE RUN. A sweep that turns a green suite red because the
 * database was briefly unreachable would be worse than the debris. Errors are
 * reported and swallowed; the script itself refuses rather than guessing when
 * it meets anything it does not recognise (see scripts/clean-fixtures.ts).
 */

import { execSync } from "node:child_process"

export default function globalTeardown() {
  try {
    // execSync, not execFileSync: on Windows the runner is npx.CMD, which
    // spawnSync refuses to exec directly (EINVAL). A shell is the portable way
    // to reach it, and the command is a fixed literal — nothing here is
    // interpolated from anywhere.
    const out = execSync("npx tsx scripts/clean-fixtures.ts --apply", {
      encoding: "utf8",
      stdio: "pipe",
    })
    const lines = out.trim().split("\n").filter((l) => !/^\s+·/.test(l))
    for (const l of lines) console.log(l)
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    console.warn("[global-teardown] the fixture sweep did not complete — debris may remain")
    const detail = (err.stdout || "") + (err.stderr || "") || err.message || ""
    for (const l of detail.trim().split("\n").slice(-6)) console.warn("  " + l)
  }
}
