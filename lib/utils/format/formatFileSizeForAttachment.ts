/**
 * A file's size, the one way the app writes it: whole bytes under a KB
 * ("645 bytes", "1 byte"), then one decimal that a whole number drops
 * ("23.5 KB", "2.1 MB", "860 KB"). 1 KB is 1,024 bytes. Pure.
 */
export function formatFileSizeForAttachment(bytes: number): string {
    const n = Number.isFinite(bytes) && bytes > 0 ? Math.round(bytes) : 0
    if (n < 1024) return `${n} ${n === 1 ? "byte" : "bytes"}`
    const units = ["KB", "MB", "GB", "TB"]
    let v = n / 1024
    let i = 0
    // Rounded to one decimal, 1,048,500 bytes is 1 MB, not "1024 KB".
    while (Number(v.toFixed(1)) >= 1024 && i < units.length - 1) {
        v /= 1024
        i++
    }
    return `${v.toFixed(1).replace(/\.0$/, "")} ${units[i]}`
}

/**
 * A file's size as above, or nothing for one without a size (none given, or
 * none in it): "2.4 MB", "". Lines that join their facts with a middle dot
 * leave it out, so a recording that captured nothing doesn't say "0 bytes".
 * Pure.
 */
export function fileSize(bytes: number | undefined): string {
    return bytes !== undefined && Number.isFinite(bytes) && bytes > 0 ? formatFileSizeForAttachment(bytes) : ""
}
