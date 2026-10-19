"use client"

import React, { useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { lazyPart } from "@/lib/lazy/lazyPart"

// MemberInviteDialog, fetched the first time it opens. The invite form brings
// the people picker and its menus, and every screen of the signed-in app
// carried them because the phone's profile sheet and the command host hold
// the dialog (17 Oct 2026, app/firstLoad.test.ts SHELL_LAZY). Once it has
// opened it stays mounted, so it can close with its own animation.
//
// It is a lazy part (lib/lazy/lazyPart): when its code can't come (offline, a
// dropped connection), opening it says so in a toast and closes, and the next
// open tries again. With next/dynamic it threw, and the page with it.

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const NotYet = () => null

/** The form's code didn't come while someone was opening it. */
function InviteUnavailable({ open, onOpenChange }: Props & { retry: () => void }) {
  const { toast } = useToast()
  useEffect(() => {
    if (!open) return
    toast({ title: "Couldn't open the invite form", description: "Check your connection, then try again.", variant: "destructive" })
    onOpenChange(false)
  }, [open, onOpenChange, toast])
  return null
}

const inviteDialog = lazyPart<Props>(() => import("@/components/invite/MemberInviteDialog").then((m) => m.MemberInviteDialog), {
  placeholder: NotYet,
  failed: InviteUnavailable,
})

export const LazyMemberInviteDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  const [asked, setAsked] = useState(open)
  // Kept from the first open on (React's "information from earlier renders").
  if (open && !asked) setAsked(true)
  // Opening it again after its code couldn't come tries again (warm is safe
  // while rendering, and does nothing once the code is in).
  if (open) void inviteDialog.warm()
  return asked ? <inviteDialog.Part open={open} onOpenChange={onOpenChange} /> : null
}
