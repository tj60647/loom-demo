/**
 * Deterministic, dependency-free content hash used to anchor PDF highlights.
 *
 * We use this (rather than e.g. Web Crypto's async SHA-256) because it needs
 * to run synchronously in a hot path on both the server (extracting page
 * text) and the client (re-checking a live pdf.js text layer before trusting
 * stored highlight offsets). It doesn't need to be cryptographically strong —
 * just stable and cheap — since it's only used to detect accidental drift
 * between the canonical server-extracted text and what the browser renders,
 * not for any security purpose.
 *
 * Implementation: FNV-1a 32-bit, returned as a hex string.
 */
export function hashText(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}
