/**
 * Shared constants for the reading upload path.
 *
 * Kept in their own module because the browser, the token route, and the
 * registration action all have to agree on them, and a limit enforced in only
 * one of those places is not a limit.
 */

/**
 * Ceiling for a single uploaded reading.
 *
 * Uploads go browser → Blob, so this is not bounded by the 4.5MB request-body
 * cap that applies to Server Actions. It is a deliberate policy limit: the
 * bytes still have to be pulled back into a function to extract text and render
 * a cover, and a scanned chapter far past this is usually a whole book that
 * wants splitting rather than a reading.
 *
 * Enforced in three places, none of which trusts the others: the browser (to
 * fail fast with a clear message), the token route (server-side, so a crafted
 * client cannot exceed it), and the registration action (which re-checks the
 * stored blob's actual size).
 */
export const MAX_READING_BYTES = 20 * 1024 * 1024

export const MAX_READING_LABEL = "20MB"

/** Every client-uploaded reading lands under this prefix. */
export const READING_UPLOAD_PREFIX = "readings"

export function formatBytes(passages: number): string {
  return `${(passages / 1048576).toFixed(1)}MB`
}
