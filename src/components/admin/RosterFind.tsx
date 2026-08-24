"use client"

/**
 * Find someone on the roster as you type.
 *
 * TJ, 2026-08-24: "can the find be done as the field is completed? … right now
 * i type in a few characters and hit find then add more characters."
 *
 * IT FILTERS ROWS THE BROWSER ALREADY HAS. The whole course roster — every
 * section, invited and enrolled — is rendered into this page anyway; searching
 * it is an array filter over about a hundred objects, so there is no request
 * to make and nothing to debounce. The first version submitted a GET form,
 * which meant a database round trip and a full navigation per search, and a
 * navigation takes the focus out of the field you are still typing in. That is
 * the friction TJ hit, and it is a property of asking the server, not of
 * searching.
 *
 * WHAT IT DOES NOT DO IS ASK PER KEYSTROKE. That would be the problematic
 * version — a query and a re-render for every character, hammering the
 * database to answer a question the page could already answer itself.
 *
 * The server content is passed through as `children` and rendered untouched
 * whenever the field is empty, so the tabs, the chips and their links stay
 * server-rendered and this component only takes over while a search is live.
 *
 * The URL keeps the query through `replaceState` rather than a navigation:
 * a find can still be reloaded or pasted to a colleague — the virtue the form
 * had — without the round trip that made typing awkward.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import RosterTable, { type RosterPerson } from "@/components/admin/RosterTable"
import RosterDownload from "@/components/admin/RosterDownload"

export default function RosterFind({
  all,
  initial,
  courseId,
  courseSections,
  isAdmin,
  courseName,
  tabsBefore,
  tabsAfter,
  children,
}: {
  /**
   * The whole course, not the section on screen: you are asking about a
   * person, not about a section. No wider a disclosure than the page already
   * makes — any faculty member can change the section picker and see these
   * same rows.
   */
  all: RosterPerson[]
  /** From `?find=` on first render, so a reloaded or pasted search stands. */
  initial: string
  courseId: string
  courseSections: { id: string; name: string }[]
  isAdmin: boolean
  courseName: string | null | undefined
  /**
   * The tabs row, in two halves, so the box can sit between the reading tabs
   * and the write one (TJ, 2026-08-24: "find goes between the 'invited' and
   * 'invite'"). They arrive server-rendered and are passed straight through.
   */
  tabsBefore: React.ReactNode
  tabsAfter: React.ReactNode
  /** The tab bodies, server-rendered. Shown when nothing is typed. */
  children: React.ReactNode
}) {
  const [query, setQuery] = useState(initial)
  const needle = query.trim().toLowerCase()
  const inputRef = useRef<HTMLInputElement | null>(null)

  /**
   * The address bar follows the field, without navigating. `replaceState`
   * rather than `push` so a search does not fill the back button with one
   * entry per character — Back should leave the roster, not retype it.
   */
  useEffect(() => {
    const url = new URL(window.location.href)
    if (needle) url.searchParams.set("find", needle)
    else url.searchParams.delete("find")
    window.history.replaceState(null, "", url.toString())
  }, [needle])

  /**
   * Substring, not exact. Pasting a whole address finds it; typing "kzhang"
   * finds it too, which matters because `kzhang4918@berkeley.edu` and
   * `kzhang.4918@berkeley.edu` are different strings to the roster
   * (emailHasAppAccess compares them character for character, after
   * lowercasing) and the near-miss is the case this exists to catch. Names
   * match as well, since the roster shows them.
   */
  const found = useMemo(() => {
    if (!needle) return []
    return all.filter(
      (row) =>
        row.email.toLowerCase().includes(needle) || (row.name ?? "").toLowerCase().includes(needle)
    )
  }, [all, needle])

  return (
    <>
      <div className="rostertabs">
        {tabsBefore}
        <div className="rosterfind">
          <input
            ref={inputRef}
            className="tinput inline"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="find by email"
            aria-label="Find someone by email address"
            data-tip="find anyone on this roster by address or name — every section, invited and enrolled"
          />
          {query && (
            <button
              className="btn mini ghost"
              onClick={() => {
                setQuery("")
                inputRef.current?.focus()
              }}
              data-tip="clear the search and go back to the tab"
            >
              clear
            </button>
          )}
        </div>
        {tabsAfter}
      </div>

      {needle ? (
        <>
          {/* The scope, said out loud: a "no" here is a no for the whole
              course, not for the tab that happened to be open. */}
          <div className="rosterfilter">
            <span className="cap" style={{ padding: "4px 0" }}>
              {found.length === 0
                ? `nothing matching "${needle}" anywhere in this course`
                : `${found.length} matching "${needle}" — every section, invited and enrolled`}
            </span>
            <span style={{ marginLeft: "auto" }}>
              <RosterDownload people={found} courseName={courseName} scope="found" />
            </span>
          </div>
          {found.length > 0 ? (
            <RosterTable
              people={found}
              courseId={courseId}
              courseSections={courseSections}
              isAdmin={isAdmin}
            />
          ) : (
            <div className="card empty">
              <span className="cap">
                Not on this roster. Check the spelling, or invite the address on the Invite
                learners tab.
              </span>
            </div>
          )}
        </>
      ) : (
        children
      )}
    </>
  )
}
