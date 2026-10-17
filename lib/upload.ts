/**
 * Storing a file: one request to /file/upload, with the file and what it is
 * for (jsonData). Every upload goes through postUpload: hooks/useUploadFile's
 * one upload for every kind of card, and uploadAttachment, the one upload a
 * composer needs without a store of its own (B7's doc comments).
 */
import type { AxiosRequestConfig } from "axios"
import axiosInstance from "@/lib/axiosInstance"
import { PostFileUploadURL } from "@/services/endPoints"
import type { UploadFileInterfaceRes } from "@/types/file"

/** What a file is for, as the API takes it: where it goes (src_key) and which one (src_value). */
export interface UploadTarget {
    src_key: "project" | "channel" | "public" | "chat" | "grpChat" | "doc"
    src_value?: string
    /** A group not on the server yet: its people's ids, which make its id (generateGroupChatId). */
    participants?: string[]
}

/** Stores one file for `target`; `config` carries the progress, a cancel and quiet errors. */
export function postUpload(file: File, target: UploadTarget, config: AxiosRequestConfig = {}) {
    const form = new FormData()
    form.append("file", file)
    form.append("jsonData", JSON.stringify(target))
    return axiosInstance.post<UploadFileInterfaceRes>(PostFileUploadURL.UploadFile, form, config)
}

interface AttachmentSource {
    key: UploadTarget["src_key"]
    value: string
}

/**
 * Stores one file as an attachment of something (src: the API's src_key and
 * src_value, "doc" and the doc's id for a doc comment), and answers its id.
 * progress is 0 to 100; signal stops it.
 */
export async function uploadAttachment(src: AttachmentSource, file: File, onProgress: (pct: number) => void, signal: AbortSignal): Promise<string> {
    const r = await postUpload(file, { src_key: src.key, src_value: src.value }, {
        signal,
        onUploadProgress: (e) => onProgress(Math.min(100, Math.round((e.loaded / (e.total || e.loaded || 1)) * 100))),
    })
    return r.data.object_uuid
}
