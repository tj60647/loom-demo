"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"

/**
 * Loom's own confirm/alert, replacing the browser's.
 *
 * Promise-based on purpose: `if (!(await confirm({...}))) return` reads the way
 * `if (!window.confirm(...)) return` did, so call sites stay legible and no
 * handler has to be rebuilt around callbacks or local dialog state.
 */

type ConfirmRequest = {
  /** Short question, e.g. 'Delete "boundary objects"?' */
  title: string
  /** What actually happens. Keep it specific; this is where the stakes live. */
  body?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Destructive actions colour the confirm button red and focus Cancel. */
  danger?: boolean
  /**
   * The eyebrow above the question. Defaults to "this cannot be undone" when
   * `danger`, which was true of every caller until 2026-08-17 — archiving a
   * reading of your own is red-button serious and IS undoable, and a dialog
   * that overstates once is a dialog nobody reads twice.
   */
  eyebrow?: string
}

type NotifyRequest = { title: string; body?: ReactNode; confirmLabel?: string }

type Pending =
  | { kind: "confirm"; req: ConfirmRequest; resolve: (ok: boolean) => void }
  | { kind: "notify"; req: NotifyRequest; resolve: (ok: boolean) => void }

type DialogApi = {
  confirm: (req: ConfirmRequest) => Promise<boolean>
  notify: (req: NotifyRequest) => Promise<boolean>
}

const DialogContext = createContext<DialogApi | null>(null)

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const confirm = useCallback(
    (req: ConfirmRequest) => new Promise<boolean>((resolve) => setPending({ kind: "confirm", req, resolve })),
    []
  )
  const notify = useCallback(
    (req: NotifyRequest) => new Promise<boolean>((resolve) => setPending({ kind: "notify", req, resolve })),
    []
  )

  const settle = useCallback((ok: boolean) => {
    setPending((current) => {
      current?.resolve(ok)
      return null
    })
  }, [])

  // A destructive dialog opens with Cancel focused, so a stray Enter does not
  // confirm the delete.
  useEffect(() => {
    if (!pending) return
    const danger = pending.kind === "confirm" && pending.req.danger
    ;(danger ? cancelRef.current : primaryRef.current)?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        settle(false)
        return
      }
      // Keep focus inside the dialog while it is open.
      if (event.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>("button")
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [pending, settle])

  const isConfirm = pending?.kind === "confirm"
  const danger = isConfirm && pending.req.danger

  return (
    <DialogContext.Provider value={{ confirm, notify }}>
      {children}
      {pending && (
        <div
          className="info-scrim"
          // Clicking away is a cancel, never a confirm.
          onClick={(event) => { if (event.target === event.currentTarget) settle(false) }}
        >
          <section
            ref={panelRef}
            className="info-dialog askbox"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="loomDialogTitle"
          >
            <div className="info-k">
              {("eyebrow" in pending.req && pending.req.eyebrow) ||
                (danger ? "this cannot be undone" : isConfirm ? "confirm" : "heads up")}
            </div>
            <h2 id="loomDialogTitle">{pending.req.title}</h2>
            {pending.req.body && <p>{pending.req.body}</p>}
            <div className="asknav">
              {isConfirm && (
                <button ref={cancelRef} type="button" className="btn ghost mini" onClick={() => settle(false)}>
                  {pending.req.cancelLabel ?? "Cancel"}
                </button>
              )}
              <button
                ref={primaryRef}
                type="button"
                className={`btn mini${danger ? " danger" : ""}`}
                onClick={() => settle(true)}
              >
                {pending.req.confirmLabel ?? (isConfirm ? "Continue" : "OK")}
              </button>
            </div>
          </section>
        </div>
      )}
    </DialogContext.Provider>
  )
}

export function useDialog() {
  const context = useContext(DialogContext)
  if (!context) throw new Error("useDialog must be used within a DialogProvider")
  return context
}
