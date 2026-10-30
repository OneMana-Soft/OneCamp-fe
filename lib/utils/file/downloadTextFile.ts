import { downloadBlob } from "@/lib/utils/download"

/**
 * Saves a string the browser already has as a file.
 *
 * The other helpers in this folder all FETCH something and save the response. This one is for content
 * generated client-side — an export built in the browser, or recovery codes that exist in exactly one
 * response and must not depend on a second request to be saveable. Saving is downloadBlob's, which
 * attaches the anchor (Firefox ignores a click on a detached one) and revokes the address on a delay.
 *
 * @param filename name offered to the user, extension included
 * @param text file contents
 * @param mimeType defaults to plain text
 * @returns false if the browser refused, so a caller can offer another route
 */
export function downloadTextFile(filename: string, text: string, mimeType = "text/plain"): boolean {
    try {
        downloadBlob(text, mimeType, filename)
        return true
    } catch (error) {
        console.error("Text file download failed:", error)
        return false
    }
}
