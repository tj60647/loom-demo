import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.66"],
  // pdfjs-dist is required from node_modules at runtime (see src/lib/pdfText.ts),
  // never bundled, so it has to stay external.
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
  // That runtime import is marked webpackIgnore, which also hides it from
  // output file tracing — so on Vercel the legacy build was left out of the
  // Lambda and extraction died with "Cannot find module .../pdf.worker.mjs".
  // pdf.js loads the worker module even in Node (as a "fake worker"), so both
  // files must ship. Keyed to /** because the upload action is reachable from
  // more than one route.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/pdfjs-dist/legacy/build/pdf.mjs", "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};

export default nextConfig;
