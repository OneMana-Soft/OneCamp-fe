/** Saving an export: its file name, and handing the file to the browser. */

/**
 * A file name from a doc's title, as the API makes one: the characters a
 * file system refuses are left out, it is never empty, and never longer than
 * 80 characters.
 */
export function exportFileName(title: string): string {
  let out = ''
  for (const ch of title.trim()) {
    const c = ch.codePointAt(0) as number
    if (c < 32 || c === 0x7f || c === 0xfffd || '/\\:*?"<>|'.includes(ch)) continue
    out += ch
  }
  out = out.trim().replace(/^\.+|\.+$/g, '')
  if (out === '') return 'untitled'
  const chars = Array.from(out)
  return chars.length > 80 ? chars.slice(0, 80).join('') : out
}

/** Downloads a file the browser made (an export never goes through a server). */
export function downloadFile(filename: string, data: Blob | string, type = 'text/plain;charset=utf-8') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Long enough for the download to start; the object goes with the page otherwise.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
