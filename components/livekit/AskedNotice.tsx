"use client"

import { useRef, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"

// A call notice that asks first (zoom-09, owner O1): a guest answers it before
// anything of theirs is sent. Loaded only on a guest's call page
// (LazyAskedNotice), and only when one asks, so a member's call never carries
// the dialog.

export interface AskedNoticeProps {
  mark: ReactNode
  title: string
  body: ReactNode
  failed?: boolean
  /** Their OK is out: the notice holds until it's kept, and OK can't send it twice. */
  busy?: boolean
  onOk: () => void
  onLeave: () => void
  data: Record<`data-${string}`, string>
}

/**
 * The app's alert dialog, a sheet on a phone with OK and Leave call pinned at
 * its foot: Esc, a press outside and a swipe do nothing, so only OK or Leave
 * call answers it. OK takes the first focus, never Leave call, and is busy
 * while its answer is out. A quiet line says so when an OK wasn't kept, and
 * OK tries again.
 */
export default function AskedNotice({
  mark,
  title,
  body,
  failed,
  busy,
  onOk,
  onLeave,
  data,
}: AskedNoticeProps) {
  const ok = useRef<HTMLButtonElement>(null)
  return (
    <AlertDialog open>
      <AlertDialogContent
        {...data}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ok.current?.focus({ preventScroll: true })
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {mark}
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-pretty">{body}</AlertDialogDescription>
        </AlertDialogHeader>
        {failed && (
          <p data-notice-retry="" role="status" className="text-ui-sm text-ink-2">
            Your OK didn&apos;t reach the server. Try again.
          </p>
        )}
        <AlertDialogFooter>
          <Button variant="ghost" onClick={onLeave} className="text-danger-ink hover:text-danger-ink">
            Leave call
          </Button>
          <Button ref={ok} busy={busy} onClick={onOk}>
            OK
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
