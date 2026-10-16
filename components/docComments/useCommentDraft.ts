"use client"

/**
 * One composer's files, from picking to sending (docs programme B7).
 *
 * N41: a file still uploading when the comment was sent finished into the
 * next, empty draft, and went out with someone's next comment. Here each
 * upload belongs to the draft it was started in: Send waits while any is on
 * its way, sending starts a new draft, and an upload that finishes for a draft
 * already sent or cleared changes nothing. Leaving the composer stops what is
 * still uploading.
 *
 * N45: a file over the workspace's upload limit is refused before a byte is
 * sent, with the limit named (lib/utils/uploadLimit, as the doc and the board
 * refuse it), and at most 20 files go on one comment, as the server allows.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { useClientConfig } from "@/hooks/useClientConfig"
import { exceedsUploadLimit, uploadLimitMessage } from "@/lib/utils/uploadLimit"
import { getAttachmentType } from "@/lib/utils/file/getAttachmentType"
import { getMediaDimensions } from "@/lib/utils/file/getMediaDimensions"
import { messageOf } from "@/components/threads/useThreads"
import type { AttachmentMediaReq, AttachmentType } from "@/types/attachment"
import { uploadCommentFile } from "./docCommentApi"

/** The most files one comment takes (the threads API refuses more). */
export const MAX_FILES = 20

export interface DraftFile {
    key: string
    name: string
    type: AttachmentType
    /** 0 to 100. */
    progress: number
    /** Its id once stored. */
    uuid?: string
    /** Why it couldn't be stored. */
    error?: string
    /** What the comment carries of it, once stored. */
    attachment?: AttachmentMediaReq
}

let seq = 0

/** The files of one composer, and what may be sent. upload is injectable for tests. */
export function useCommentDraft(docId: string, upload = uploadCommentFile) {
    const config = useClientConfig()
    const [files, setFiles] = useState<DraftFile[]>([])
    // What was refused, in words, until the next change.
    const [refused, setRefused] = useState<string | null>(null)
    // The draft's identity: an upload belongs to the one it was started in.
    const generation = useRef(0)
    const aborts = useRef(new Map<string, AbortController>())
    // How many files the draft holds, counted as they are picked: two quick
    // picks before a render would both have seen the same files and gone past
    // the limit.
    const held = useRef(new Set<string>())

    const update = useCallback((gen: number, key: string, patch: Partial<DraftFile>) => {
        if (gen !== generation.current) return
        setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)))
    }, [])

    const add = useCallback(
        (picked: File[] | FileList) => {
            const list = Array.from(picked as ArrayLike<File>)
            if (list.length === 0) return
            const gen = generation.current
            const tooBig = list.filter((f) => exceedsUploadLimit(f.size, config.upload_limit_bytes))
            let room = MAX_FILES - held.current.size
            const taken = list.filter((f) => !tooBig.includes(f)).filter(() => room-- > 0)
            const words = tooBig.map((f) => uploadLimitMessage(f.size, config.upload_limit_mb, f.name))
            if (taken.length + tooBig.length < list.length) words.push(`A comment takes at most ${MAX_FILES} files.`)
            setRefused(words.length ? words.join(" ") : null)

            for (const file of taken) {
                const key = `f${++seq}`
                held.current.add(key)
                const type = getAttachmentType(file.name)
                const abort = new AbortController()
                aborts.current.set(key, abort)
                setFiles((prev) => [...prev, { key, name: file.name, type, progress: 0 }])
                const createdAt = new Date().toISOString()
                void (async () => {
                    try {
                        const dims = await getMediaDimensions(file).catch(() => ({ width: 0, height: 0, duration: undefined }))
                        const uuid = await upload(docId, file, (progress) => update(gen, key, { progress }), abort.signal)
                        update(gen, key, {
                            uuid,
                            progress: 100,
                            attachment: {
                                attachment_uuid: uuid,
                                attachment_file_name: file.name,
                                // The server keeps only files that name a key (business/Thread).
                                attachment_obj_key: key,
                                attachment_type: type,
                                attachment_size: file.size,
                                attachment_created_at: createdAt,
                                attachment_width: dims.width || undefined,
                                attachment_height: dims.height || undefined,
                                attachment_duration: dims.duration,
                                attachment_raw_type: file.type,
                            },
                        })
                    } catch (e) {
                        if (abort.signal.aborted) return
                        update(gen, key, { error: messageOf(e) })
                    } finally {
                        aborts.current.delete(key)
                    }
                })()
            }
        },
        [config.upload_limit_bytes, config.upload_limit_mb, docId, update, upload],
    )

    const remove = useCallback((key: string) => {
        aborts.current.get(key)?.abort()
        aborts.current.delete(key)
        held.current.delete(key)
        setFiles((prev) => prev.filter((f) => f.key !== key))
    }, [])

    /** A new, empty draft: after sending, or when it is thrown away. Uploads still on their way stop. */
    const clear = useCallback(() => {
        generation.current += 1
        for (const a of aborts.current.values()) a.abort()
        aborts.current.clear()
        held.current.clear()
        setFiles([])
        setRefused(null)
    }, [])

    // Leaving the composer stops what it was uploading.
    useEffect(() => {
        const live = aborts.current
        return () => {
            for (const a of live.values()) a.abort()
        }
    }, [])

    const uploading = files.some((f) => !f.uuid && !f.error)
    const attachments = files.flatMap((f) => (f.attachment ? [f.attachment] : []))
    return { files, refused, uploading, attachments, add, remove, clear }
}

export type CommentDraft = ReturnType<typeof useCommentDraft>
