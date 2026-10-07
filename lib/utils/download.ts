/**
 * Saving a response body as a file.
 *
 * One copy, because three surfaces now hand somebody a document to keep: the
 * workspace evidence pack, the audit log export, and a member's own record of
 * what the AI did as them. The object URL has to be revoked in every one of
 * them, and a copy that forgets leaks the whole file for the life of the tab.
 */
export function downloadBlob(data: BlobPart, type: string, filename: string): void {
    const url = URL.createObjectURL(new Blob([data], { type }))
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}
