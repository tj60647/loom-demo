import type { NextConfig } from "next";
import { execSync } from "node:child_process";

/**
 * THE BUILD STAMP — see src/lib/buildStamp.ts for what it is for.
 *
 * Vercel sets VERCEL_* at build time and they are server-side only, so they are
 * mapped to NEXT_PUBLIC_ here to survive into the browser bundle. Inlined at
 * build time, which is what makes them a fact about the artefact rather than
 * about the request.
 *
 * Off Vercel none of them exist, so the SHA falls back to git. That call is
 * wrapped because it has three ordinary ways to fail — no git on PATH, not a
 * repository (a tarball build), or a shallow clone — and none of them is worth
 * failing a build over. An unknown SHA prints nothing; it never prints a guess.
 */
function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ENV: process.env.VERCEL_ENV || "",
    NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA || gitSha(),
    NEXT_PUBLIC_BUILD_REF: process.env.VERCEL_GIT_COMMIT_REF || "",
  },
  allowedDevOrigins: ["192.168.0.66"],
  // No serverActions.bodySizeLimit override: reading PDFs now go browser →
  // Blob (see src/lib/readingUploadClient.ts), so nothing large travels
  // through a Server Action and the 1MB default is the right, tighter setting.
  // pdfjs-dist is required from node_modules at runtime (see src/lib/pdfText.ts),
  // never bundled, so it has to stay external.
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
  // That runtime import is marked webpackIgnore, which also hides it from
  // output file tracing — so on Vercel the legacy build was left out of the
  // Lambda and extraction died with "Cannot find module .../pdf.worker.mjs".
  // pdf.js loads the worker module even in Node (as a "fake worker"), so both
  // files must ship. Keyed to /** because the upload action is reachable from
  // more than one route.
  // The wasm/ directory is passed to getDocument by src/lib/pdfCover.ts and is
  // equally invisible to the tracer — cover rendering fails in production for
  // the same reason, silently, since the caller only warns. ~4MB total.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/wasm/**",
    ],
  },
};

export default nextConfig;
