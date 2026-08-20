"use client";

/**
 * A capture in progress, on the rail.
 *
 * TJ, 2026-08-19: "the capture passage is currently a modal, i want it to go
 * on the rail." This is the shell that replaces the modal wherever there is a
 * rail to draw it on — page mode's margins and the canvas's spread rails, both
 * of which anchor it on the selection's own highlight and run a leader line
 * back to the words (see PdfViewer's DRAFT_ID: the draft is painted as a real
 * `.loom-passage-highlight`, so neither host had to learn what a draft is).
 *
 * IT ASKS EXACTLY WHAT THE MODAL ASKED. The form is `CaptureFields`, shared
 * with `CaptureModal` — quotation, citation, the passage's note, the concept
 * with its naming assist, the concept's description, and the same Save. TJ,
 * 2026-08-19: "i want to keep the content of the existing capture passage
 * card." Sharing the component rather than porting it is what makes that true
 * a month from now; `RailCardBody` is the precedent, and the reason it exists.
 *
 * So this file is chrome and nothing else: a heading, and Escape.
 */

import CaptureFields from "./CaptureFields";
import type { CaptureReuse } from "./CaptureModal";

export default function DraftCard({
  text,
  source,
  sourceId,
  location,
  pageNumber,
  startOffset,
  endOffset,
  pageContentHash,
  onCaptured,
  onCancel,
}: {
  text: string;
  source: string;
  sourceId?: string;
  location: string;
  pageNumber?: number;
  startOffset?: number;
  endOffset?: number;
  pageContentHash?: string;
  onCaptured?: (passageId: string, conceptLabel: string, reuse?: CaptureReuse) => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="pdf-draftcard"
      role="group"
      aria-label="Capture this passage"
      onKeyDown={(e) => {
        // Escape abandons the draft, and stops here: the viewer listens for it
        // to leave fullscreen and to shut Your work, and neither should happen
        // because somebody abandoned a capture.
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
      // A drag that starts inside a card must not pan the canvas under it.
      // Both hosts' pointer filters already exclude `.pdf-railcard-stack`,
      // which this mounts inside; the wheel still pans, which is right — the
      // reader is allowed to move the page while writing about it.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="pdf-draftcard-head">Capture Passage</div>
      <CaptureFields
        passage={text}
        source={source}
        sourceId={sourceId}
        location={location}
        pageNumber={pageNumber}
        startOffset={startOffset}
        endOffset={endOffset}
        pageContentHash={pageContentHash}
        onCaptured={onCaptured}
        onClose={onCancel}
        variant="rail"
      />
    </div>
  );
}
