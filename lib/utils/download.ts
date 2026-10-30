import type { AxiosResponse } from "axios"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"

/**
 * Saving a response body as a file.
 *
 * One copy, because several surfaces hand somebody a document to keep: the
 * workspace evidence pack, the audit log export, a member's own record of
 * what the AI did as them, a project's time report and its task list. The
 * object URL has to be revoked in every one of them, and a copy that forgets
 * leaks the whole file for the life of the tab.
 */

/**
 * How long a saved file's object URL outlives the click. The browser starts
 * reading the blob after click() returns, so revoking it at once can leave a
 * big file (a long task list's CSV) cut short or missing.
 */
const REVOKE_AFTER_MS = 60_000

export function downloadBlob(data: BlobPart, type: string, filename: string): void {
    const url = URL.createObjectURL(new Blob([data], { type }))
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    // Attached first: Firefox ignores a programmatic click on a detached anchor.
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
}

/**
 * The file name a download's Content-Disposition gives: its UTF-8 name
 * (filename*, RFC 5987) when it has one, else its plain one, else fallback.
 * The server sends both (helpers/uploadsafe.BuildDisposition), the plain one
 * cut to ASCII, so "Zoë's launch" comes back whole only from the first.
 */
function fileNameFromDisposition(disposition: unknown, fallback: string): string {
    const header = typeof disposition === "string" ? disposition : ""
    const plain = /filename\s*=\s*"((?:[^"\\]|\\.)*)"/i.exec(header)?.[1]?.replace(/\\(.)/g, "$1") || fallback
    const encoded = /filename\*\s*=\s*UTF-8''([^;\s]+)/i.exec(header)?.[1]
    if (!encoded) return plain
    try {
        return decodeURIComponent(encoded) || plain
    } catch {
        // A broken escape names nothing: the plain name stands.
        return plain
    }
}

/**
 * Fetches a file the server makes (a time report, a task list's CSV, a
 * table's view as a workbook) and saves it under the name its
 * Content-Disposition gives, else fallback: a GET, or a POST of body when the
 * request says what to make. The caller says a failure itself, so the
 * read-failure toast stays quiet, and reads whatever else the answer carries.
 */
export async function downloadFrom(url: string, fallback: string, body?: object): Promise<AxiosResponse<Blob>> {
    const asked = { responseType: "blob" as const, ...OWN_ERRORS }
    const res = body ? await axiosInstance.post<Blob>(url, body, asked) : await axiosInstance.get<Blob>(url, asked)
    downloadBlob(res.data, res.data.type || "application/octet-stream", fileNameFromDisposition(res.headers["content-disposition"], fallback))
    return res
}
