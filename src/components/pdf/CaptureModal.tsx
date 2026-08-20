"use client"

import CaptureFields from "./CaptureFields"

interface CaptureModalProps {
  passage: string;
  source: string;
  sourceId?: string;
  location: string;
  pageNumber?: number;
  startOffset?: number;
  endOffset?: number;
  pageContentHash?: string;
  onClose: () => void;
  /**
   * A capture landed. Fired before onClose so the viewer can say so where the
   * reader is looking — until 2026-08-09 a capture taken from the page went
   * through in silence, the modal simply vanishing, and the only sign it had
   * worked was 1500ms of "· saved ·" in the far corner of the header.
   */
  onCaptured?: (passageId: string, conceptLabel: string, reuse?: CaptureReuse) => void;
}

/**
 * The concept this capture joined had already been evidenced in OTHER readings.
 *
 * Reported up rather than shown here, because the modal closes on save: the
 * acknowledgement belongs in the toast the viewer draws, where it can be read
 * against the page. Undefined whenever the concept is new, or was only ever
 * met in this reading — neither is ambiguous. See `ReuseOffer`.
 */
export type CaptureReuse = {
  conceptId: string
  label: string
  /** Titles of the other readings, resolved by the viewer via `titleOf`. */
  whereIds: string[]
  filledDescription: string
}

export default function CaptureModal(props: CaptureModalProps) {
  /**
   * THE SHELL, and only the shell. The form itself is CaptureFields, shared
   * with the rail's DraftCard since 2026-08-19 so the two paths ask the same
   * questions — see that file's header for what must not move and why.
   *
   * This path is now the FALLBACK: capture goes to the rail wherever there is
   * a rail to draw it on, and the modal serves the surfaces with none (the
   * strip, and page mode below the width where rails are hidden). It is kept
   * rather than retired because a capture path that disappears with the window
   * is worse than two that agree.
   */
  return (
    <div className="info-scrim">
      {/* Opaque, not `.card`'s rgba(255,255,255,.5): this sits directly over
          the page you are reading, and a half-transparent form leaves the PDF's
          own text running through the passage you are about to keep.
          Scrolls past the viewport: a full-passage capture grows tall (the
          word chips alone can fill a screen) and Save must stay reachable. */}
      <div className="card capturecard" style={{ width: "100%", maxWidth: "450px", maxHeight: "85vh", overflowY: "auto", background: "var(--paper)", boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }}>
        <h2>Capture Passage</h2>
        <CaptureFields {...props} />
      </div>
    </div>
  )
}
