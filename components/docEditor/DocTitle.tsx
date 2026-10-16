"use client"

import * as React from 'react'
import type { Editor } from '@tiptap/react'
import { cn } from '@/lib/utils/helpers/cn'
import { useTitle, type TitleStore } from '@/components/docEditor/docTitleStore'
import { docKeymapOf } from '@/components/minimal-tiptap/extensions/doc-keymap/storage'
import { titleKey } from '@/components/docEditor/docTitleKeys'
import { DocMetaLine } from '@/components/docEditor/DocMetaLine'
import { DocIcon } from '@/components/docEditor/DocIcon'
import { LinkedFromSection } from '@/components/entityLink/LinkedFromSection'
import { useDocBus, useDocCommand } from '@/components/docEditor/registry/commandBus'
import useSWR from 'swr'
import { docInfoKey } from '@/lib/docCache'
import type { DocInfoResponse } from '@/types/doc'
import { docCoverOf } from '@/lib/docLook'
import '@/components/docEditor/chrome/look.css'

// The band's controls (add or change the icon and cover, the title's
// suggestion, a phone's path and lock) load beside the editor (B6).
const TitleBand = React.lazy(() => import('@/components/docEditor/chrome/TitleBand'))
// A cover's art loads with the cover: the room for it is drawn at once.
const CoverArt = React.lazy(() => import('@/components/docEditor/chrome/CoverArt'))

/** The title: an h1 holding its field, subscribed on its own (docTitleStore.ts). */
const DocTitleField = React.memo(function DocTitleField({ store, titleRef, id, editable, onChange, onBlur, onKeyDown, padded }: {
    store: TitleStore
    titleRef: React.RefObject<HTMLTextAreaElement | null>
    id: string
    editable: boolean
    onChange?: (title: string) => void
    onBlur?: () => void
    onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
    padded: string
}) {
    const title = useTitle(store)
    // As tall as its lines.
    React.useLayoutEffect(() => {
        const el = titleRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = el.scrollHeight + 'px'
    }, [title, titleRef])
    return (
        <h1 className="m-0" data-doc-title-heading="">
            <textarea
                ref={titleRef}
                value={title}
                onChange={(e) => onChange?.(e.target.value)}
                onBlur={onBlur}
                onKeyDown={onKeyDown}
                disabled={!editable}
                placeholder="Untitled"
                aria-label="Title"
                id={id}
                rows={1}
                data-doc-title=""
                className={cn(
                    "doc-title block w-full resize-none overflow-hidden border-none bg-transparent focus:outline-none focus:ring-0 disabled:opacity-100",
                    editable ? "cursor-text" : "cursor-default",
                    padded,
                )}
            />
        </h1>
    )
})

export interface DocTitleProps {
    store: TitleStore
    /** The title's field, for what else puts the caret in it (a new doc's arrival). */
    titleRef: React.RefObject<HTMLTextAreaElement | null>
    /** The field's id: the body is labelled by it. */
    id: string
    /** Null until the doc's editor exists: the meta line and the keys wait for it. */
    editor: Editor | null
    editable: boolean
    onChange?: (title: string) => void
    onBlur?: () => void
    authorName?: string
    lastEditedRelative?: string
    focusMode?: boolean
    fullWidth?: boolean
}

/**
 * The title region (content.md D06), inside the doc's scroller: the cover and
 * the icon (D-2), drawn with the doc so nothing moves when they arrive, the
 * title, the meta line and what links here. Its block names the page's font and text size,
 * which the body follows (chrome/look.css). Enter or ↓ goes on into the body
 * (docTitleKeys.ts); ↑ from the body's first line, ⌫ in its empty first
 * line, or the bus's focusTitle come back to the title's end (T6, T7).
 */
export const DocTitle = React.memo(function DocTitle({ store, titleRef, id, editor, editable, onChange, onBlur, authorName, lastEditedRelative, focusMode, fullWidth }: DocTitleProps) {
    const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const el = e.currentTarget
        const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 48
        const handled = titleKey(
            { key: e.key, isComposing: e.nativeEvent.isComposing, keyCode: e.keyCode, shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, preventDefault: () => e.preventDefault() },
            { value: el.value, selectionStart: el.selectionStart, selectionEnd: el.selectionEnd, singleLine: el.scrollHeight < lineHeight * 1.5 },
            editor,
            (title) => onChange?.(title),
        )
        if (handled && e.key === 'Enter') onBlur?.()
    }, [editor, onBlur, onChange])

    const focusTitle = React.useCallback(() => {
        const el = titleRef.current
        if (!el || !editable) return false
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
        return true
    }, [titleRef, editable])

    // The doc keymap asks from the body (↑, ⌫).
    React.useEffect(() => {
        const keys = docKeymapOf(editor)
        if (!keys || !editable) return
        keys.focusTitle = focusTitle
        return () => {
            if (keys.focusTitle === focusTitle) keys.focusTitle = null
        }
    }, [editor, editable, focusTitle])

    // And anything else on this doc, through its bus.
    const bus = useDocBus()
    useDocCommand(bus, 'focusTitle', () => {
        focusTitle()
    })

    // The doc's answer as its page fetched it: read, never fetched again here.
    const doc = useSWR<DocInfoResponse>(bus.docId ? docInfoKey(bus.docId) : null, null).data?.data
    const cover = docCoverOf(doc?.doc_cover_key)
    const icon = doc?.doc_icon
    const padded = fullWidth ? "px-5 md:px-12" : "px-5 md:px-8"
    // The band's row (its controls; a phone's path and lock) is kept free
    // from the start: 28 px of the space above the title, so nothing moves.
    const top = cover ? "" : editable ? (focusMode ? "md:pt-[52px]" : "md:pt-7") : focusMode ? "md:pt-20" : "md:pt-14"
    return (
        <div
            className={cn("pb-6", top)}
            data-doc-title-block=""
            data-doc-font={doc?.doc_font || undefined}
            data-doc-small={doc?.doc_small_text ? "" : undefined}
            data-has-cover={cover ? "" : undefined}
            data-has-icon={icon ? "" : undefined}
        >
            {cover && (
                <div className="doc-cover" data-doc-cover="">
                    <React.Suspense fallback={null}>
                        <CoverArt cover={cover} offset={doc?.doc_cover_offset} />
                    </React.Suspense>
                </div>
            )}
            <div className={cn("relative", cover && !icon && "pt-4", padded)} data-doc-title-head="">
                {icon && (
                    <span className="doc-page-icon" data-doc-page-icon="">
                        <DocIcon icon={icon} size={64} />
                    </span>
                )}
                <div aria-hidden="true" className={editable ? "h-7" : "max-sm:h-7"} />
                {bus.docId && (
                    <React.Suspense fallback={null}>
                        <TitleBand docId={bus.docId} doc={doc} editable={editable} editor={editor} store={store} titleRef={titleRef} onTitle={onChange} padded={padded} />
                    </React.Suspense>
                )}
            </div>
            <DocTitleField
                store={store}
                titleRef={titleRef}
                id={id}
                editable={editable}
                onChange={onChange}
                onBlur={onBlur}
                onKeyDown={handleKeyDown}
                padded={padded}
            />
            {editor && (
                <DocMetaLine
                    editor={editor}
                    authorName={authorName}
                    lastEditedRelative={lastEditedRelative}
                    padded={padded}
                />
            )}
            {/* What links here, under the title as in Notion (B6, P1.3). */}
            {bus.docId && !focusMode && <LinkedFromSection refType="doc" refUUID={bus.docId} reserve={(doc?.doc_backlink_count ?? 0) > 0} className={cn("pt-3", padded)} />}
        </div>
    )
})
