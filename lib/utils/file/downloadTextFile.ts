/**
 * Saves a string the browser already has as a file.
 *
 * The other helpers in this folder all FETCH something and save the response. This one is for content
 * generated client-side — an export built in the browser, or recovery codes that exist in exactly one
 * response and must not depend on a second request to be saveable.
 *
 * Two details here are the difference between working and silently doing nothing, and both were already
 * settled elsewhere in this folder before being missed in the markdown export:
 *
 *   THE ANCHOR IS ATTACHED TO THE DOCUMENT. Firefox ignores a programmatic click on a detached anchor,
 *   so a download built without this works in Chrome and quietly fails for a third of users.
 *
 *   THE OBJECT URL IS REVOKED ON A DELAY. Revoking straight after click() races the browser starting to
 *   read the blob; downloadFile() in this folder already waits 1000ms for exactly this reason. The cost
 *   of waiting is a few kilobytes held briefly. The cost of not waiting is a truncated or missing file.
 *
 * @param filename name offered to the user, extension included
 * @param text file contents
 * @param mimeType defaults to plain text
 * @returns false if the browser refused, so a caller can offer another route
 */
export function downloadTextFile(filename: string, text: string, mimeType = "text/plain"): boolean {
    try {
        const blob = new Blob([text], { type: mimeType })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = filename
        link.style.display = "none"

        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        return true
    } catch (error) {
        console.error("Text file download failed:", error)
        return false
    }
}
