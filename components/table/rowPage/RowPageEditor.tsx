"use client"

/**
 * The editor of a row's page (RowPage): a doc's own editor, the same blocks a
 * doc's page has, bound to the doc's live session. The session asks the
 * server how far this person may go, and the server decides by the row: an
 * editor writes, live with whoever else has it open; a reader reads, and sees
 * the edits as they land. The saved body shows until the live copy syncs.
 *
 * A chunk of its own: it loads only for a row that has a page.
 */

import * as React from "react"
import type { Editor } from "@tiptap/react"
import "@/components/docEditor/registry"
import MinimalTiptapDocInput from "@/components/docEditor/docInput"
import { useDocSession, type DocAccessLevel } from "@/hooks/useDocSession"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { docAbilities } from "@/lib/docs/abilities"
import { displayNameOf } from "@/lib/personName"
import { generateColorFromUUID } from "@/lib/utils/generateColorFromUUID"
import { identityHue } from "@/lib/identityHue"
import { warmCollabToken } from "@/lib/collabToken"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"
import { Loader2 } from "@/lib/icons"

export interface RowPageEditorProps {
  docId: string
  /** The saved body, shown until the live copy syncs. */
  body: string
  /** The level the record's read gave; the session's answer replaces it. */
  level: "view" | "edit"
  /** A page made a moment ago: the cursor goes in it. */
  autoFocus?: boolean
}

export default function RowPageEditor({ docId, body, level, autoFocus }: RowPageEditorProps) {
  const profile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const me = profile.data?.data
  const editorRef = React.useRef<Editor | null>(null)
  const handleEditor = React.useCallback((ed: Editor | null) => {
    editorRef.current = ed
  }, [])
  // What the editor holds, kept aside if this tab's copy is replaced (ONE COPY).
  const keepEdits = React.useCallback(() => {
    const ed = editorRef.current
    if (!ed || ed.isDestroyed) return null
    return { html: ed.getHTML(), text: ed.getText() }
  }, [])
  const user = React.useMemo(
    () => (me ? { id: me.user_uuid, name: displayNameOf(me) || "Anonymous", color: generateColorFromUUID(me.user_uuid || "default"), profileKey: me.user_profile_object_key } : undefined),
    [me],
  )
  const session = useDocSession({ docId, user, level: level as DocAccessLevel, keepEdits })
  React.useEffect(() => {
    warmCollabToken()
  }, [])

  const collaboration = React.useMemo(() => {
    if (!me) return undefined
    const name = displayNameOf(me) || "Anonymous"
    return {
      enabled: true,
      documentId: docId,
      username: name,
      userId: me.user_uuid,
      color: generateColorFromUUID(me.user_uuid || "default"),
      hue: identityHue({ name, id: me.user_uuid }),
      profileKey: me.user_profile_object_key,
      keepEdits,
      activeUsers: session.activeUsers,
    }
  }, [me, docId, keepEdits, session.activeUsers])

  // What the person may do, as the server decided: write or read. Never
  // share it or comment on it here (the row has its own comments), and no
  // Ask AI on it yet: the doc's AI paths refuse a row's page.
  const abilities = React.useMemo(() => {
    const decided = session.access.level === "none" ? "view" : session.access.level
    const a = docAbilities(decided === "full" ? "edit" : decided)
    return { ...a, comment: false, share: false, askRead: false, askWrite: false, canAsk: () => false }
  }, [session.access.level])

  if (session.refused === "gone" || session.refused === "not-found" || session.refused === "forbidden") {
    return (
      <p role="status" className="text-meta text-ink-3" data-row-page-refused={session.refused}>
        {session.refused === "gone" ? "This row's page went to the trash with the row." : "This row's page can't be opened."}
      </p>
    )
  }

  // An editor binds to the live copy from the start (no rebuild when it
  // connects); a reader's saved body shows while it does.
  const ready = level !== "edit" || !!session.provider
  if (!ready || !me) return <Loader2 className="size-3.5 animate-spin text-ink-3" aria-label="Opening the row's page" />

  return (
    // Its text lines up with the fields above it (table.css .row-page).
    <div className="row-page -mx-6" data-row-page-editor="">
      <MinimalTiptapDocInput
        throttleDelay={3000}
        className="w-full"
        editorContentClassName="pb-4"
        output="html"
        value={body}
        editable={session.access.canEdit}
        editorClassName="focus:outline-none"
        collaboration={collaboration}
        provider={session.provider || undefined}
        providerSynced={session.synced}
        docId={docId}
        editableTitle={false}
        onEditor={handleEditor}
        abilities={abilities}
        hosted
        autofocus={autoFocus ? "end" : false}
        placeholder="Write, or press / for blocks"
      />
    </div>
  )
}
