"use client"

/**
 * A doc's comments, in its editor (docs programme B7): an 'editorOverlay'
 * slot contribution, one per doc editor, drawing nothing of its own but a
 * reader's Comment button.
 *
 * - Comment (the selection bar, the phone's bar, the block menu, ⌘⇧M) is
 *   claimed here, for anyone who may comment: the thread starts on what was
 *   chosen (anchorOf) and is written beside the doc, or on a phone on its own
 *   page. Someone who may only read leaves it to the page.
 * - The open threads are drawn on their words (A8's decorations, never
 *   marks), the one being written and the one looked at drawn strong.
 * - Where each thread's words are goes to the panel (publishPlaces), only
 *   when what it shows would change.
 * - Choosing highlighted words opens their thread.
 * - ⌘⇧M is the Comment action's page key (registry): with only a caret the
 *   comment is on its block; the selection bar answers it first over an
 *   editor's selection.
 * - A reader who may comment (the doc is theirs to comment on, not to edit)
 *   gets a Comment button over what they select: the selection bar is an
 *   editor's.
 */
import * as React from "react"
import { useEditorState } from "@tiptap/react"
import { BubbleMenu } from "@/components/minimal-tiptap/components/bubble-menu/bubble-menu"
import type { Editor } from "@tiptap/core"
import { MessageSquarePlus } from "@/lib/icons"
import { FloatingBar, FloatingBarButton } from "@/components/ui/FloatingBar"
import { useDocBus } from "@/components/docEditor/registry/commandBus"
import type { SlotProps } from "@/components/docEditor/registry/types"
import { anchorDecorationsKey, type ThreadAnchor } from "@/components/minimal-tiptap/extensions/anchor-decorations/anchorDecorations"
import { collabSession } from "@/lib/collabSession"
import { findReattachCandidates } from "@/lib/anchors/anchors"
import { useToast } from "@/hooks/use-toast"
import { useMedia } from "@/context/MediaQueryContext"
import { forgetPlaces, publishPlaces, useUi } from "./commentsUi"
import { useOpenComments } from "./useOpenComments"
import { anchorOf, anchorOfBlocks } from "./anchorOf"
import { onPage, quotesWords } from "./threadView"
import { useDocThreads } from "./useDocThreads"

/** The id the thread being written is drawn under, until it has one. */
const PENDING_ID = "pending"

/** How long typing pauses before a lost thread's words are looked for again. */
const COUNT_AFTER_MS = 400

/** Whether the doc's live copy has synced: until then no anchor can be found, and none is called lost. */
function useSynced(docId: string): boolean {
    const session = React.useMemo(() => collabSession(docId), [docId])
    return React.useSyncExternalStore(session.subscribe, () => session.getSnapshot().synced, () => false)
}

export default function CommentsOverlay({ docId, editor }: SlotProps) {
    if (!editor || !docId) return null
    return <Overlay docId={docId} editor={editor} />
}

function Overlay({ docId, editor }: { docId: string; editor: Editor }) {
    const t = useDocThreads(docId)
    const open = useOpenComments(docId)
    const bus = useDocBus()
    const synced = useSynced(docId)
    const { toast } = useToast()
    const active = useUi(docId, (ui) => ui.active)
    const hovered = useUi(docId, (ui) => ui.hovered)
    const pending = useUi(docId, (ui) => ui.pending)

    // The latest of what the handlers below read, without making them anew.
    const canComment = React.useRef(t.canComment)
    const openRef = React.useRef(open)
    React.useLayoutEffect(() => {
        canComment.current = t.canComment
        openRef.current = open
    })

    // The highlights: the open threads on the doc's words, and the one being written.
    const anchors = React.useMemo(() => {
        const list: ThreadAnchor[] = t.threads
            .filter((x) => x.status === "open" && !onPage(x))
            .map((x) => ({ id: x.id, anchor: x.anchor, active: x.id === active || x.id === hovered }))
        if (pending) list.push({ id: PENDING_ID, anchor: pending, active: true })
        return list
    }, [t.threads, active, hovered, pending])
    React.useEffect(() => {
        if (!editor.isDestroyed) editor.commands.setThreadAnchors(anchors, { synced })
    }, [editor, anchors, synced])

    // Where each thread's words are, for the panel: after the changes that
    // move them, once a frame. And how many exact matches the words of a
    // thread that lost them have now, for "Reattach here": a walk of the doc's
    // text, so counted once typing pauses, and only while a thread is lost.
    React.useEffect(() => {
        let frame = 0
        let timer: ReturnType<typeof setTimeout> | undefined
        const placed = () => {
            const s = anchorDecorationsKey.getState(editor.state)
            if (!s) return null
            const map = new Map(s.resolved)
            map.delete(PENDING_ID)
            return map
        }
        const publish = () => {
            frame = 0
            const map = placed()
            if (map) publishPlaces(docId, map)
        }
        const count = () => {
            timer = undefined
            const map = placed()
            if (!map || editor.isDestroyed) return
            const matches = new Map<string, number>()
            const anchors = new Map(anchorDecorationsKey.getState(editor.state)?.anchors.map((a) => [a.id, a.anchor]))
            for (const [id, r] of map) {
                const anchor = anchors.get(id)
                // Two say all the card needs: one ("Reattach here") or more. A
                // block quoted by its kind ("Image") has no words to find.
                if (r.state === "detached" && r.quote && (!anchor || quotesWords(anchor))) {
                    matches.set(id, findReattachCandidates(editor.state.doc, r.quote, 2).length)
                }
            }
            publishPlaces(docId, map, matches)
        }
        const changed = () => {
            if (!frame) frame = requestAnimationFrame(publish)
            const lost = [...(anchorDecorationsKey.getState(editor.state)?.resolved.values() ?? [])].some((r) => r.state === "detached")
            if (!lost) return
            clearTimeout(timer)
            timer = setTimeout(count, COUNT_AFTER_MS)
        }
        publish()
        count()
        editor.on("transaction", changed)
        return () => {
            editor.off("transaction", changed)
            if (frame) cancelAnimationFrame(frame)
            clearTimeout(timer)
            forgetPlaces(docId)
        }
    }, [editor, docId])

    // Comment: a thread on what was chosen, for whoever may comment.
    React.useEffect(() => {
        return bus.on("comment", (asked) => {
            if (!canComment.current || editor.isDestroyed) return
            asked.claimed = true
            // The block menu's blocks, by id, when it names them: those blocks, never what lies between.
            const anchor = (asked.blocks?.length ? anchorOfBlocks(editor, asked.blocks) : null) ?? anchorOf(editor, asked.from, asked.to)
            if (!anchor) {
                toast({ title: "There's nothing there to comment on", description: "Select some words, or a block, and try again." })
                return
            }
            openRef.current({ start: anchor })
        })
    }, [bus, editor, toast])

    // Choosing highlighted words opens their thread (selecting across them doesn't).
    React.useEffect(() => {
        const dom = editor.view.dom as HTMLElement
        const onClick = (e: MouseEvent) => {
            if (e.button !== 0 || e.defaultPrevented || !editor.state.selection.empty) return
            const el = (e.target as Element | null)?.closest?.("[data-thread-id]")
            const id = el && dom.contains(el) ? el.getAttribute("data-thread-id") : null
            if (id && id !== PENDING_ID) openRef.current({ thread: id })
        }
        dom.addEventListener("click", onClick)
        return () => dom.removeEventListener("click", onClick)
    }, [editor])

    // A reader's Comment button, only while the doc can't be edited here (an
    // editor has the selection bar). The bubble draws into an element of its
    // own (bubble-menu.tsx): React, putting another slot's piece before an
    // element the bubble had moved into its popper (A9's review bar, on a doc
    // switch), once crashed the page (NotFoundError: insertBefore).
    const readOnly = useEditorState({ editor, selector: ({ editor: e }) => !!e && !e.isEditable }) ?? false
    // On a computer the selection bar offers a reader Comment (and Ask AI),
    // by their level (docs incident, 14 Oct 2026): one bar, not two. On a
    // phone, where that bar is the keyboard's, this is the reader's way in.
    const { isMobile } = useMedia()
    if (!t.canComment || !readOnly || !isMobile) return null
    return <ReaderComment editor={editor} onComment={() => bus.emit("comment", { from: editor.state.selection.from, to: editor.state.selection.to })} />
}

/** Comment over a selection in a doc the reader may comment on but not edit. */
function ReaderComment({ editor, onComment }: { editor: Editor; onComment(): void }) {
    const shouldShow = React.useCallback(
        ({ editor: e, from, to }: { editor: Editor; from: number; to: number }) => !e.isEditable && from !== to && !e.view.composing,
        [],
    )
    return (
        <BubbleMenu
            editor={editor}
            shouldShow={shouldShow}
            updateDelay={120}
            tippyOptions={{ duration: 0, placement: "top", offset: [0, 8], zIndex: 60, maxWidth: "none" }}
        >
            <FloatingBar label="Comment on the selection" data-reader-comment="">
                <FloatingBarButton label="Comment" onMouseDown={(e) => e.preventDefault()} onClick={onComment}>
                    <MessageSquarePlus aria-hidden="true" />
                    <span>Comment</span>
                </FloatingBarButton>
            </FloatingBar>
        </BubbleMenu>
    )
}
