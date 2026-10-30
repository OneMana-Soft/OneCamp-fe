import { downloadBlob } from "@/lib/utils/download"

/**
 * Fetches a file and saves it under name. The body is saved as
 * application/octet-stream, so the browser saves it rather than opening it.
 * Returns false when the fetch or the save failed, so a caller can say so.
 */
export async function downloadFile(href: string, name: string) {
    try {
        const res = await fetch(href)
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`)
        }
        downloadBlob(await res.blob(), "application/octet-stream", name)
        return true
    } catch (error) {
        console.error("Download failed:", error)
        return false
    }
}
