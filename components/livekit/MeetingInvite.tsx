"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import type { useConfirm } from "@/hooks/useConfirm"
import { InviteLinkRow, InvitePanel } from "./invite"
import { callToast } from "./callSurface"

/**
 * Invite (CALL-BUG-17): the guest link again, a new one, or the old one turned
 * off, which also takes out everyone still on it. A personal room's is its
 * address, which has no end and is changed in the room's settings, never
 * here. On a phone it is the link glyph alone, beside the call's other pills.
 */
export function InviteControl({
  link,
  room,
  onNewLink,
  confirm,
}: {
  link: string
  room?: boolean
  onNewLink: (revokePrevious: boolean) => Promise<void>
  confirm: ReturnType<typeof useConfirm>
}) {
  const [busy, setBusy] = useState(false)
  const fresh = async () => {
    setBusy(true)
    try {
      await onNewLink(false)
    } catch (e) {
      callToast({ title: "Couldn't make a new link", description: (e as Error).message, variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }
  const turnOffOld = () =>
    confirm({
      title: "Turn off the old link?",
      description: "It stops working, and anyone still in the meeting from it is removed. You get a new link to share.",
      confirmText: "Turn off the old link",
      destructive: true,
      onConfirm: () => onNewLink(true),
    })
  return (
    <InvitePanel
      label="Invite a guest"
      title="Invite a guest"
      description={room ? "Anyone with your room's address can ask to come in." : "Anyone with the link can join as a guest while the meeting lasts."}
      body={
        link ? (
          <InviteLinkRow link={link} label={room ? "Your room's address" : "Guest link"} />
        ) : (
          <p className="mt-2.5 text-ink-2">The link was shown in the tab that started the meeting. Make a new one to share it from here.</p>
        )
      }
      actions={
        room ? (
          <Button size="sm" variant="ghost" asChild>
            <Link href="/app/meet/room" target="_blank" rel="noopener noreferrer">
              Room settings
            </Link>
          </Button>
        ) : (
          <>
            <Button size="sm" variant={link ? "ghost" : "default"} onClick={() => void fresh()} busy={busy}>
              Get a new link
            </Button>
            <Button size="sm" variant="ghost" className="text-danger-ink" onClick={turnOffOld}>
              Turn off the old link
            </Button>
          </>
        )
      }
    />
  )
}
