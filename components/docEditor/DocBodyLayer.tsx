"use client"

import * as React from 'react'
import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import type { Node as PMNode } from '@tiptap/pm/model'
import { slotFor, type EditionGate } from '@/components/docEditor/registry/registry'
import { SlotOutlet, useRegistryVersion } from '@/components/docEditor/registry/slots'
import { cn } from '@/lib/utils/helpers/cn'

/** A doc with nothing written in it: one empty paragraph (its block id aside). */
export function isBlankDoc(doc: PMNode): boolean {
    if (doc.childCount !== 1) return false
    const only = doc.firstChild!
    return only.type.name === 'paragraph' && only.content.size === 0
}

/** The empty starter while the doc is blank; it follows the editor itself. */
function EmptyStarter({ gate, docId, editor, padded }: { gate: EditionGate; docId: string; editor: Editor; padded: string }) {
    const blank = useEditorState({ editor, selector: ({ editor: e }) => !!e && isBlankDoc(e.state.doc) })
    if (!blank) return null
    return (
        <div data-doc-empty-starter="" className={cn("pointer-events-auto absolute inset-x-0 top-12", padded)}>
            <SlotOutlet slot="emptyStarter" gate={gate} docId={docId} editor={editor} />
        </div>
    )
}

/**
 * The layer over the top of the doc's body, inside its scroller, where two
 * slots draw (PROGRAM.md §4 #3). It has no height, so it moves nothing:
 *
 * - 'gutter': marks beside the text (comment threads, an agent's edits). A
 *   contribution's own box starts at the body's top left and spans the
 *   measure; it places a mark by the editor's coordinates less that box's
 *   (editor.view.coordsAtPos(pos).top - box.getBoundingClientRect().top), and
 *   may draw into the margins.
 * - 'emptyStarter': under the first line of a blank doc the reader can edit
 *   (a template, an import, Ask AI to draft), gone at the first keystroke,
 *   padded as the text is.
 *
 * Nothing draws, and nothing follows the editor, when no package registered.
 */
export function DocBodyLayer({ gate, docId, editor, canEdit, padded }: { gate: EditionGate; docId: string; editor: Editor; canEdit: boolean; padded: string }) {
    useRegistryVersion()
    const gutter = slotFor('gutter', gate).length > 0
    const starter = canEdit && slotFor('emptyStarter', gate).length > 0
    if (!gutter && !starter) return null
    return (
        <div data-doc-body-layer="" className="pointer-events-none relative z-10 h-0 w-full">
            {gutter && (
                <div data-doc-gutter="" className="pointer-events-auto absolute inset-x-0 top-0">
                    <SlotOutlet slot="gutter" gate={gate} docId={docId} editor={editor} />
                </div>
            )}
            {starter && <EmptyStarter gate={gate} docId={docId} editor={editor} padded={padded} />}
        </div>
    )
}
