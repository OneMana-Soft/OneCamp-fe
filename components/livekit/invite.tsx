"use client"

// Invite among a call's status pills: the pill, its panel, and the link with
// its Copy. An instant meeting's and a room's (InstantMeetingView), and a
// conversation's call's invite (ConversationInvite).

import { createContext, forwardRef, useContext, useState, type ComponentProps, type ReactNode } from "react"
import dynamic from "next/dynamic"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { MiddleName } from "@/components/ui/middleName"
import { useSheetMode } from "@/components/ui/overlayMode"
import { Check, Copy, Link as LinkIcon } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { CALL_SURFACE, callToast } from "./callSurface"

// On a phone, the shared sheet: loaded with the first one opened there.
const ResponsiveSheet = dynamic(() => import("@/components/ui/responsive-sheet"), { ssr: false })

/**
 * Invite's panel: under the pill on a computer, the shared sheet on a phone,
 * its actions pinned at the foot (the phone rule). body is the link, actions
 * its buttons.
 */
export function InvitePanel({ label, title, description, body, actions }: { label: string; title: string; description: string; body?: ReactNode; actions?: ReactNode }) {
  const sheet = useSheetMode()
  const [open, setOpen] = useState(false)
  if (sheet) {
    return (
      <>
        <InvitePill label={label} onClick={() => setOpen(true)} />
        {open ? (
          <ResponsiveSheet title={title} description={description} footer={actions} onClose={() => setOpen(false)} className={CALL_SURFACE}>
            {body}
          </ResponsiveSheet>
        ) : null}
      </>
    )
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <InvitePill label={label} />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="center" className={cn(CALL_SURFACE, "w-80 max-w-[calc(100vw-24px)] text-ui-sm")} data-invite-details="">
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-meta text-ink-3">{description}</p>
        {body}
        {actions ? <div className="mt-3 flex flex-wrap justify-end gap-2">{actions}</div> : null}
      </PopoverContent>
    </Popover>
  )
}

/** Invite says its word wherever it stands, not only where the call has room: at the head of People. */
export const InviteWordShown = createContext(false)

/** The pill: the link glyph, and "Invite" where the call has room (or InviteWordShown says). */
export const InvitePill = forwardRef<HTMLButtonElement, ComponentProps<"button"> & { label: string }>(function InvitePill({ label, ...props }, ref) {
  const worded = useContext(InviteWordShown)
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className="pointer-events-auto flex h-7 items-center gap-2 rounded-[14px] bg-[#1F2024] px-2.5 text-meta font-medium text-[#EEEEF0] ring-1 ring-white/[0.09] transition-colors hover:bg-[#2A2B30] focus-visible:outline-2 focus-visible:outline-brand"
      data-invite=""
      {...props}
    >
      <LinkIcon className="size-3.5 shrink-0" aria-hidden />
      <span className={worded ? undefined : "hidden @3xl:inline"}>Invite</span>
    </button>
  )
})

/**
 * A link to share, read only, with its Copy: the address as text, cut in the
 * middle so its own end (the token) stays in sight. Nothing to type in, and
 * Copy takes it whole; a long press still selects all of it.
 */
export function InviteLinkRow({ link, label }: { link: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      callToast({ title: "Couldn't copy the link", description: "Select it and copy it yourself.", variant: "destructive" })
    }
  }
  return (
    <div className="mt-2.5 flex items-center gap-1.5">
      <div role="group" aria-label={label} data-invite-link="" className="flex h-8 min-w-0 flex-1 select-all items-center rounded-[8px] bg-sunken px-2 text-meta text-ink-2 ring-1 ring-inset ring-line">
        <MiddleName name={link} className="flex-1" />
      </div>
      <Button size="sm" variant="secondary" onClick={() => void copy()}>
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  )
}
