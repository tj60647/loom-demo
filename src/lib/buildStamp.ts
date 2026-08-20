/**
 * WHICH BUILD AM I LOOKING AT?
 *
 * TJ, 2026-08-19: "does the about card include a version of what is deployed?
 * this would help me keep track." It did not, and nothing else in the app did
 * either — the only "version" in the codebase is a reading's file revision,
 * which is a different object entirely.
 *
 * The values come from Vercel's build-time environment, mapped to NEXT_PUBLIC_
 * in next.config.ts so they survive into the browser bundle. They are inlined
 * at BUILD time, which is exactly right for a build stamp: the string is a fact
 * about the artefact you are running, not about the machine serving it.
 *
 * LOCAL IS THE INTERESTING CASE and the reason for the git fallback. None of
 * VERCEL_* exists off Vercel, so without it the one place work moves fastest
 * would be the one place the stamp said nothing. next.config.ts reads the git
 * SHA instead — captured when the dev server starts, so after a few commits it
 * is the commit you started from rather than the commit you are on. That is
 * still worth having and is worth knowing: `local` is a weaker claim than
 * `production`, which is why the label says which one it is.
 */

/** The environment this build was made for. */
export type BuildEnv = "production" | "preview" | "development" | "local"

const RAW_ENV = process.env.NEXT_PUBLIC_BUILD_ENV || ""
const RAW_SHA = process.env.NEXT_PUBLIC_BUILD_SHA || ""
const RAW_REF = process.env.NEXT_PUBLIC_BUILD_REF || ""

export const buildEnv: BuildEnv =
  RAW_ENV === "production" || RAW_ENV === "preview" || RAW_ENV === "development"
    ? RAW_ENV
    : "local"

/** Seven characters, the length git itself abbreviates to. Empty when unknown. */
export const buildSha = RAW_SHA.slice(0, 7)

export const buildRef = RAW_REF

/**
 * The stamp, as one line.
 *
 * The branch is named only on a preview, where it is the thing that identifies
 * WHICH preview — on production it is always master and says nothing, and
 * locally it changes under you. An unknown SHA is omitted rather than printed
 * as "unknown": a stamp that names a build it cannot identify is worse than a
 * stamp that admits it only knows the environment.
 */
export function buildStamp(): string {
  const parts: string[] = [buildEnv]
  if (buildEnv === "preview" && buildRef) parts.push(buildRef)
  if (buildSha) parts.push(buildSha)
  return parts.join(" · ")
}
