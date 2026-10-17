"use client"

import * as React from 'react'
import type { Editor } from '@tiptap/react'
import { cn } from '@/lib/utils/helpers/cn'
import { useDocCounts } from '@/components/docEditor/docCounts'
import { useRelativeTime } from '@/hooks/useRelativeTime'
import { useDocBus } from '@/components/docEditor/registry/commandBus'
import { usePresence } from '@/components/docEditor/presence/store'

/** How often "Edited just now" is worked out again while someone keeps typing. */
const LOCAL_EDIT_REFRESH_MS = 15_000

/**
 * When this tab last changed the doc: set on an edit typed here (not one a
 * collaborator's sync brought in, nor the first load), and at most once per
 * LOCAL_EDIT_REFRESH_MS, so typing doesn't render the line on every key.
 */
export function useLocalEditTime(editor: Editor): Date | null {
    const [at, setAt] = React.useState<Date | null>(null)
    React.useEffect(() => {
        let last = 0
        const onUpdate = ({ transaction }: { transaction: { docChanged: boolean; getMeta: (key: string) => unknown } }) => {
            if (!transaction.docChanged) return
            // y-prosemirror marks what it applies from the shared doc.
            if ((transaction.getMeta('y-sync$') as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin) return
            const now = Date.now()
            if (now - last < LOCAL_EDIT_REFRESH_MS) return
            last = now
            setAt(new Date(now))
        }
        editor.on('update', onUpdate)
        return () => {
            editor.off('update', onUpdate)
        }
    }, [editor])
    return at
}

/**
 * The line under the title (content.md D06): who wrote it, when it was last
 * edited and how long it takes to read: "Sam Rivera · Edited 2h ago · 4 min
 * read". It replaces the footer's reading line. It follows the editor's counts
 * itself (useDocCounts waits for a pause), so the frame doesn't render for it.
 */
export const DocMetaLine = React.memo(function DocMetaLine({ editor, authorName, lastEditedRelative, padded }: {
    editor: Editor
    authorName?: string
    lastEditedRelative?: string
    padded: string
}) {
    const { minutes } = useDocCounts(editor)
    // While you type it says "Edited just now" (P3): the time the doc
    // opened with said "6 hours ago" under a doc being written. Someone
    // else's edit, seen live (B8), names them: "Edited just now by Maya".
    const local = useLocalEditTime(editor)
    const presence = usePresence(useDocBus().docId)
    const theirs = presence?.edit && (!local || presence.edit.at > local.getTime()) ? presence.edit : null
    const at = theirs?.at
    const editedHere = useRelativeTime(React.useMemo(() => (at ? new Date(at) : local), [at, local]))
    const edited = editedHere || lastEditedRelative
    const first = theirs?.name.split(/\s+/)[0] ?? ""
    // A first name two people here share is said in full.
    const by = theirs && (Object.values(presence!.people).filter((p) => p.name.split(/\s+/)[0] === first).length > 1 ? theirs.name : first)
    const parts = [
        authorName ? <span key="a" className="hover:text-ink-2">{authorName}</span> : null,
        // Mid-sentence: "Edited yesterday", not "Edited Yesterday".
        edited ? <span key="e">Edited {edited.replace(/^(Just|Yesterday)/, (w) => w.toLowerCase())}{by ? ` by ${by}` : ""}</span> : null,
        minutes > 0 ? <span key="m">{minutes} min read</span> : null,
    ].filter(Boolean)
    if (!parts.length) return null
    return (
        <p data-doc-meta="" className={cn("mt-1 flex flex-wrap items-center gap-x-1.5 text-ui-sm text-ink-3 tabular-nums", padded)}>
            {parts.map((p, i) => (
                <React.Fragment key={i}>
                    {i > 0 && <span aria-hidden="true">·</span>}
                    {p}
                </React.Fragment>
            ))}
        </p>
    )
})
