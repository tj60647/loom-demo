import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
