"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { toast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { placesKey, type Envelope } from "@/services/docGraphService"
import { GetEndpointUrl } from "@/services/endPoints"
import type { SlotProps } from "@/components/docEditor/registry/types"
import type { Place } from "@/types/docGraph"
import type { UserProfileInterface } from "@/types/user"
import "./contributions"
import { leaveDoc, provideNavigate, setFacts, softLocked, usePageFacts } from "./pageFacts"
import { useDoc } from "./useDoc"

const QUIET = { suppressErrorToast: true } as never

/**
 * The open doc's page facts and its soft lock (B6), over its editor
 * (editorOverlay): its chunk registers More's page actions and the dialogs
 * (contributions.ts); what they read as More opens (starred, locked, owned)
 * is kept current from the doc's own answer; and a soft lock holds the editor
 * through the plugin it was made with (softLock.ts), which reads these facts
 * (D-12: a client-side guard; a hard lock is the server's). Draws nothing.
 */
export default function PageGuard({ docId, editor }: SlotProps) {
  const router = useRouter()
  React.useEffect(() => {
    provideNavigate((href) => router.push(href))
    return () => provideNavigate(null)
  }, [router])

  const me = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const stars = useFetch<Envelope<{ places: Place[] }>>(docId ? placesKey("star", "doc") : "", undefined, undefined, QUIET)
  const doc = useDoc(docId)
  const myId = me.data?.data?.user_uuid
  React.useEffect(() => {
    if (!doc) return
    const owner = doc.doc_owner?.user_uuid || doc.doc_created_by?.user_uuid
    setFacts(docId, { lock: doc.doc_lock_level || "", owner: !!myId && owner === myId, full: doc.doc_full_access === 1 })
  }, [docId, doc, myId])
  const places = stars.data?.data?.places
  React.useEffect(() => {
    if (places) setFacts(docId, { starred: places.some((p) => p.resource_uuid === docId) })
  }, [docId, places])
  React.useEffect(() => () => leaveDoc(docId), [docId])

  const locked = softLocked(usePageFacts(docId))

  // Clicking into a soft-locked page says why nothing happens, and how to go on.
  const canEdit = (doc?.doc_edit_access ?? 0) > 0
  React.useEffect(() => {
    if (!editor || !locked || !canEdit) return
    const dom = editor.view.dom as HTMLElement
    let said = 0
    const tell = () => {
      if (Date.now() - said < 4000) return
      said = Date.now()
      toast({
        title: "This page is locked",
        description: "It's locked against accidental edits.",
        action: (
          <ToastAction altText="Unlock this page for you" onClick={() => setFacts(docId, { unlockedForMe: true })}>
            Unlock for me
          </ToastAction>
        ),
      })
    }
    dom.addEventListener("mousedown", tell)
    return () => dom.removeEventListener("mousedown", tell)
  }, [editor, locked, canEdit, docId])
  return null
}
