"use client"

import * as React from "react"
import { KeyRound, Lock } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import { useRelativeTime } from "@/hooks/useRelativeTime"
import { displayNameOf } from "@/lib/personName"
import { appMutate, patchCached } from "@/lib/swrMutate"
import { docInfoKey } from "@/lib/docCache"
import { cn } from "@/lib/utils/helpers/cn"
import { lockDoc } from "@/services/docAccessService"
import { useDocBus } from "@/components/docEditor/registry/commandBus"
import type { SlotProps } from "@/components/docEditor/registry/types"
import type { DocInfoResponse } from "@/types/doc"
import type { DocLock } from "@/types/docAccess"
import { ChromeSheet } from "./chrome/Sheet"
import { ChoiceCards, InlineError } from "./chrome/parts"
import { setFacts, usePageFacts } from "./chrome/pageFacts"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { useDoc } from "./chrome/useDoc"



/** Sets or lifts the lock, and tells every view of the doc at once. */
async function changeLock(docId: string, lock: DocLock) {
  const res = await lockDoc(docId, lock)
  const level = res?.lock ?? lock
  setFacts(docId, { lock: level, unlockedForMe: false })
  patchCached<DocInfoResponse>(docInfoKey(docId), (a) => (a?.data && a.data.doc_lock_level !== level ? { ...a, data: { ...a.data, doc_lock_level: level } } : a))
  // A hard lock moves who may edit: the doc's answer says so again.
  void appMutate(docInfoKey(docId))
}

/**
 * Locking a page (D-12, P1-D). A soft lock is a guard against accidental
 * edits that anyone who can edit lifts, for themselves ("Unlock for me", this
 * tab, until they leave the page) or for everyone; a hard lock, for the owner
 * and full access, holds everyone else at comment, on the server, until
 * someone with full access lifts it.
 */
export default function LockDialog({ docId, onClose }: { docId: string; onClose(): void }) {
  const doc = useDoc(docId)
  const facts = usePageFacts(docId)
  const lock = (doc?.doc_lock_level || facts.lock || "") as DocLock
  const full = doc?.doc_full_access === 1 || !!facts.full
  const canEdit = (doc?.doc_edit_access ?? 0) > 0
  const by = doc?.doc_locked_by ? displayNameOf(doc.doc_locked_by) : ""
  const when = useRelativeTime(doc?.doc_locked_at || null)
  const [choice, setChoice] = React.useState<"soft" | "hard">("soft")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")

  const go = async (next: DocLock, said: string) => {
    setBusy(true)
    setError("")
    try {
      await changeLock(docId, next)
      toast({ title: said })
      onClose()
    } catch (e) {
      setError(apiErrorMessage(e, "The lock didn't change. Try again."))
    } finally {
      setBusy(false)
    }
  }
  const unlockForMe = () => {
    setFacts(docId, { unlockedForMe: true })
    toast({ title: "Unlocked for you", description: "Until you leave this page." })
    onClose()
  }
  const lockAgainForMe = () => {
    setFacts(docId, { unlockedForMe: false })
    onClose()
  }
  const who = by ? `${by} locked it${when ? ` · ${when}` : ""}.` : undefined

  if (!lock)
    return (
      <ChromeSheet
        onClose={onClose}
        title="Lock this page"
        data-doc-lock-dialog=""
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" disabled={busy || (choice === "hard" && !full)} onClick={() => void go(choice, "Page locked")}>
              Lock page
            </Button>
          </>
        }
      >
        <ChoiceCards
          label="How to lock it"
          value={choice}
          onChange={setChoice}
          choices={[
            { value: "soft", label: "Lock edits", description: "A guard against accidental changes. Anyone who can edit can unlock it." },
            {
              value: "hard",
              label: "Lock for everyone",
              description: "Only people with full access can edit it or unlock it. Everyone else can still read and comment.",
              disabled: !full,
              note: full ? undefined : "Needs full access.",
            },
          ]}
        />
        <InlineError>{error}</InlineError>
      </ChromeSheet>
    )

  if (lock === "soft")
    return (
      <ChromeSheet
        onClose={onClose}
        title="This page is locked"
        description={who}
        data-doc-lock-dialog="soft"
        footer={
          canEdit ? (
            <>
              {facts.unlockedForMe ? (
                <Button variant="ghost" size="sm" onClick={lockAgainForMe}>
                  Lock it again for me
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={unlockForMe}>
                  Unlock for me
                </Button>
              )}
              <Button size="sm" disabled={busy} onClick={() => void go("", "Page unlocked")}>
                Unlock for everyone
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          )
        }
      >
        <p className="text-ui-sm text-ink-2">
          {facts.unlockedForMe
            ? "It's unlocked for you until you leave this page. Everyone else still sees it locked."
            : "It's locked against accidental edits. Anyone who can edit can unlock it for themselves or for everyone."}
        </p>
        {full ? (
          <p className="text-ui-sm text-ink-3">
            Need it held for everyone?{" "}
            <Button variant="link" size="sm" className="h-auto p-0 align-baseline" disabled={busy} onClick={() => void go("hard", "Locked for everyone")}>
              Lock it for everyone
            </Button>
          </p>
        ) : null}
        <InlineError>{error}</InlineError>
      </ChromeSheet>
    )

  return (
    <ChromeSheet
      onClose={onClose}
      title="Locked for everyone"
      description={who}
      data-doc-lock-dialog="hard"
      footer={
        full ? (
          <>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void go("soft", "It's an edit lock now")}>
              Make it an edit lock
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void go("", "Page unlocked")}>
              Unlock for everyone
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <p className="text-ui-sm text-ink-2">
        {full
          ? "Only people with full access can edit it while it's locked. Everyone else can read it and comment."
          : "Only people with full access can edit it or unlock it. You can still read it and comment. Ask its owner if it needs a change."}
      </p>
      <InlineError>{error}</InlineError>
    </ChromeSheet>
  )
}

/**
 * The lock beside the title in the header (titleChips): "Locked", or
 * "Unlocked for you". It opens the lock dialog.
 */
export function LockChip({ docId }: SlotProps) {
  const doc = useDoc(docId)
  const facts = usePageFacts(docId)
  const bus = useDocBus()
  const lock = doc?.doc_lock_level || facts.lock || ""
  if (!lock) return null
  const mine = lock === "soft" && !!facts.unlockedForMe
  const Icon = mine ? KeyRound : Lock
  return (
    <button
      type="button"
      data-doc-lock-chip={mine ? "unlocked-for-me" : lock}
      onClick={() => bus.emit("openDialog", { id: "doc.lock" })}
      className={cn(
        "tag ml-1 inline-flex items-center gap-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand",
        lock === "hard" ? "bg-[var(--camp-sun-tint)] text-[var(--camp-sun-ink)]" : "bg-hover text-ink-2 hover:bg-press",
      )}
    >
      <Icon aria-hidden="true" className="size-3" />
      {mine ? "Unlocked for you" : "Locked"}
    </button>
  )
}
