"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { reviewGuestDoc } from "@/services/guestReview"
import { sendFailedText } from "@/services/publicApi"

/**
 * A client's verdict on the doc (docs C5-2), under the comments: "Approve doc",
 * or "Request changes" with what should change. The team is told, and sees it
 * beside the doc. Said here, under the card: no toaster runs under /guest.
 */
export function GuestDocVerdict({ token, name, onNoName }: { token: string; name: string; onNoName(): void }) {
  const [asking, setAsking] = React.useState(false)
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const [done, setDone] = React.useState<"approved" | "changes" | null>(null)
  const noteId = React.useId()
  const errorRef = React.useRef<HTMLParagraphElement>(null)
  // Said above the buttons that failed, and scrolled to: under a long note it fell below the fold.
  React.useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "nearest" })
  }, [error])

  const give = async (decision: "approved" | "changes") => {
    if (busy) return
    if (!name.trim()) {
      onNoName()
      return
    }
    setBusy(true)
    setError("")
    const res = await reviewGuestDoc(token, name, decision, decision === "changes" ? note : "")
    setBusy(false)
    if (res.ok) {
      setDone(decision)
      return
    }
    setError(sendFailedText(res))
  }

  if (done) {
    return (
      <p role="status" className="mt-5 rounded-xl bg-sunken px-3 py-2.5 text-ui-sm text-ink-2" data-guest-verdict={done}>
        {done === "approved" ? "Thanks. The team sees that you approved this doc." : "Thanks. The team sees the changes you asked for."}
      </p>
    )
  }
  const said = error ? (
    <p ref={errorRef} role="alert" className={`${asking ? "" : "mt-2 "}text-meta font-medium text-danger-ink`}>
      {error}
    </p>
  ) : null
  return (
    <div className="mt-5 rounded-xl bg-sunken p-3" data-guest-verdict="">
      <p className="text-ui-sm font-medium text-ink">Ready to sign off?</p>
      {asking ? (
        <div className="mt-2 flex flex-col gap-2">
          <label htmlFor={noteId} className="text-ui-sm text-ink-2">
            What should change?
          </label>
          <Textarea
            id={noteId}
            value={note}
            onChange={(e) => {
              setNote(e.target.value)
              setError("")
            }}
            rows={3}
            maxLength={2000}
            className="max-h-60"
          />
          {said}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" className="max-md:h-11" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" className="max-md:h-11" busy={busy} disabled={!note.trim()} onClick={() => void give("changes")}>
              Send the changes
            </Button>
          </div>
        </div>
      ) : (
        <>
          {said}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" size="sm" className="max-md:h-11" busy={busy} onClick={() => void give("approved")}>
              Approve doc
            </Button>
            <Button type="button" variant="secondary" size="sm" className="max-md:h-11" disabled={busy} onClick={() => setAsking(true)}>
              Request changes
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
