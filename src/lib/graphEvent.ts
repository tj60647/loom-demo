import { db } from "@/db"
import { graphEvents } from "@/db/schema"
import { logWarn } from "@/lib/log"

/** What an event can be about. Stored as text; this union is the vocabulary. */
export type EventEntity =
  | "concept"
  | "passage"
  | "edge"
  | "link"
  | "graph"
  | "map"
  | "cloth"
  /**
   * A READING, added on 2026-08-17 so that removing one of your own is
   * recorded like every other act. The other seven are the loom's graph; this
   * one is the shelf. It earns its place for the same reason they do — the act
   * is the student's, it changes what they see, and a history that skipped it
   * would show a Capture Log for a reading whose disappearance it never
   * mentioned.
   */
  | "reading"

/**
 * Append one student act to the graph's development history.
 *
 * Best-effort by design: neon-http has no cross-call transactions, so the
 * graph tables stay the source of truth and a lost event never fails the
 * mutation it describes. History is an exploratory record (rendered as counts
 * and replay, never judgment) and deliberately survives reset and import.
 *
 * Lifted out of `actions/loom.ts` on 2026-08-17, unchanged, so that
 * `actions/sources.ts` can record too. It cannot simply be exported from
 * there: that file is `"use server"`, where every export becomes an endpoint
 * the browser may call, and a free-form event writer is not something to hand
 * out. This module is plain server code and is importable by both.
 *
 * Any new `kind` needs a `case` in HistoryPanel's foldEvents — that is what
 * `check-vocabulary` fails the build on. A sentence in `logPhrase.ts` is
 * wanted too, but unguarded: a kind without one falls back to the default line.
 */
export async function recordEvent(
  userId: string,
  courseId: string | null,
  kind: string,
  entityType: EventEntity,
  entityId: string | null,
  payload?: Record<string, unknown>
) {
  try {
    await db.insert(graphEvents).values({ userId, courseId, kind, entityType, entityId, payload })
  } catch (e) {
    logWarn("event.record-failed", { kind, cause: e })
  }
}
