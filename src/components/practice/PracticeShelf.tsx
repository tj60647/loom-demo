"use client"

/**
 * The practice loom's first station — the Library, with one reading you can
 * open (TJ, 2026-08-12: "can the guide start in the library tab and only allow
 * the oh the places reading to be selected? that would make the open a reading
 * guide card (1) contextually relevant. right now it is not").
 *
 * He is right that it was not. Beat 1 said "you are inside a reading" while
 * the student was already inside one, which is a caption, not a move. Now the
 * guide opens where a student opens: on the shelf, with the practice reading
 * lit and the rest of the course visible but inert.
 *
 * The REAL shelf is not reused, deliberately. It reads the student's own
 * cloths and tallies and every card is a link into their real work — exactly
 * the two things the practice loom must not touch. This renders the same
 * `.shelfcard` markup so it is the same object to look at, and nothing behind
 * it goes anywhere.
 */

import SourceThumbnail from "@/components/library/SourceThumbnail"

export type PracticeCard = {
  id: string
  title: string
  author: string | null
  description: string | null
  isDescriptionVisible: boolean
  hasFile: boolean
}

/** The worked cloth's shape, so the practice card carries a real tally. */
export type PracticeTally = {
  passages: number
  concepts: number
  threads: number
  clothTitle: string
}

export default function PracticeShelf({
  cards,
  openableId,
  tally,
  onOpen,
}: {
  cards: PracticeCard[]
  /** The one card that opens. Everything else is shown and does nothing. */
  openableId: string
  /** What the worked cloth holds, so the openable card counts like a real one. */
  tally: PracticeTally | null
  onOpen: () => void
}) {
  return (
    <main>
      <p className="tasktitle">Pick a reading.</p>
      <p className="tasksub">
        This is the Library as a student meets it: every reading on the course, each
        card a door into your work on that text. In the guide only one of them opens —
        the rest are here so the shelf looks like the shelf.
      </p>

      <div className="shelfgrid" style={{ marginTop: 14 }}>
        {cards.map((card) => {
          const openable = card.id === openableId
          const body = (
            <>
              {card.hasFile ? (
                <SourceThumbnail sourceId={card.id} title={card.title} />
              ) : (
                <span className="shelfnofile" aria-hidden="true">
                  <span className="cap">no pdf</span>
                </span>
              )}
              <div className="shelfbody">
                <div>
                  <h3>{card.title}</h3>
                  {card.author ? <p className="shelfauthor">{card.author}</p> : null}
                  {card.isDescriptionVisible && card.description ? (
                    <p className="shelfdesc">{card.description}</p>
                  ) : null}
                </div>
                {/* The same line a real card carries, counted off the worked
                    cloth — a card that says nothing where every other card
                    says something reads as broken rather than as inert. */}
                <p className="shelftally">
                  {openable && tally ? (
                    <>
                      {tally.passages} passage{tally.passages !== 1 ? "s" : ""} ·{" "}
                      {tally.concepts} concept{tally.concepts !== 1 ? "s" : ""} ·{" "}
                      {tally.threads} thread{tally.threads !== 1 ? "s" : ""}
                    </>
                  ) : (
                    <span className="shelfquiet">nothing captured here yet</span>
                  )}
                </p>
              </div>
            </>
          )
          return (
            <div key={card.id} className={`shelfcard${openable ? "" : " off"}`}>
              {openable ? (
                <button
                  id="practiceOpen"
                  className="shelfmain"
                  onClick={onOpen}
                  data-tip="open this reading in the guide"
                >
                  {body}
                </button>
              ) : (
                <span className="shelfmain" aria-disabled="true">
                  {body}
                </span>
              )}
              {/* Every real card carries this row, and the card's proportions
                  come from it: without one, `.shelfmain` stretches to the grid
                  row's height and leaves a hole where the cloth should be. */}
              <div className="clothrow">
                <span className="clothis">
                  <span className="clothname">
                    {openable ? tally?.clothTitle || "Base cloth" : "Base cloth"}
                  </span>
                  <span className="clothmeta">
                    {openable ? "a worked cloth is waiting here" : "not in the guide"}
                  </span>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}
