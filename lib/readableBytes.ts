/**
 * A size the way the server writes its limits (helpers.ReadableBytes): 1 GB is
 * 1024 MB, and a decimal only when it isn't whole. "5 GB", "7.2 GB",
 * "640 MB". Pure.
 */
export function readableBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"]
  let v = Math.max(0, bytes || 0)
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1).replace(/\.0$/, "")} ${units[i]}`
}
