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

export default function PracticeShelf({
  cards,
  openableId,
  onOpen,
}: {
  cards: PracticeCard[]
  /** The one card that opens. Everything else is shown and does nothing. */
  openableId: string
  onOpen: () => void
}) {
  return (
    <main>
      <p className="tasktitle">Pick a reading.</p>
      <p className="tasksub">
        This is the Library as a student meets it: every reading on the course, each
        card a door into your work on that text. In the practice loom only one of them
        opens — the rest are here so the shelf looks like the shelf.
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
                <p className="shelftally">
                  {openable ? (
                    <>a worked cloth is waiting on this one</>
                  ) : (
                    <span className="shelfquiet">not in the practice loom</span>
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
                  data-tip="open this reading in the practice loom"
                >
                  {body}
                </button>
              ) : (
                <span className="shelfmain" aria-disabled="true">
                  {body}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}
