"use client"

import { useEffect, useRef } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useDispatch } from "react-redux"
import { useMedia } from "@/context/MediaQueryContext"
import { app_doc_path } from "@/types/paths"
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { revealThread } from "@/components/docComments/commentsUi"

/**
 * /app/doc/[doc-id]/comment, its threads (/comment/[thread-id]) and a new
 * thread (/comment/new): a doc's comments, where a notice or a link opens them.
 *
 * A phone shows the pages here. A wider screen opens the doc with its comments
 * panel, at the thread named (by its id, or by a comment in it: ?comment=),
 * and `replace`s the address, so Back doesn't bounce through this one.
 */
export default function DocCommentLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    const params = useParams()
    const search = useSearchParams()
    const { isMobile, isDesktop } = useMedia()
    const router = useRouter()
    const dispatch = useDispatch()
    const handled = useRef(false)

    const docId = params?.["doc-id"] as string
    const threadId = params?.["thread-id"] as string | undefined
    const commentId = search?.get("comment") ?? undefined

    useEffect(() => {
        if (!isDesktop || handled.current || !docId) return
        handled.current = true
        const thread = threadId && threadId !== "new" ? decodeURIComponent(threadId) : undefined
        if (thread || commentId) revealThread(docId, { thread, comment: commentId })
        dispatch(openRightPanel({ docUUID: docId }))
        router.replace(`${app_doc_path}/${docId}`)
    }, [isDesktop, docId, threadId, commentId, router, dispatch])

    return <>{isMobile && children}</>
}
