// uploadLimit.ts — one place that decides whether a payload is too big to upload,
// and how to say so.
//
// The same three-line size check had grown three copies (the upload hook's
// validateFiles, the board canvas's inline data-URL arithmetic, and nothing at all
// in the doc editor), which is how they drifted apart. The board pre-checked its
// images; the doc editor did not, and when the backend correctly refused an
// oversized upload with a 413, the doc editor's error path embedded the whole image
// into the document as a base64 data URI instead. That inverted the control that
// had just refused it: the bytes ended up inside doc_body, were stored, and were
// then sent to OpenSearch as analysed text, where parsing one such document
// exhausted the search node's heap and killed it.
//
// So these are pure functions with no React and no config coupling: every caller
// asks the same question and gets the same answer, and the answer is unit-tested.

/** BYTES_PER_KB / KB_PER_MB keep the unit maths readable and in one place. */
const BYTES_PER_KB = 1024
const KB_PER_MB = 1024

/**
 * exceedsUploadLimit reports whether a payload is over the workspace cap.
 *
 * A non-positive limit means "no limit configured", which is treated as allowed —
 * the backend still enforces its own cap, so an unconfigured client must not block
 * legitimate uploads. Non-finite or negative sizes are treated as not exceeding,
 * because a bogus measurement is not evidence of a violation and the server is the
 * real gate.
 */
export function exceedsUploadLimit(bytes: number, limitBytes: number): boolean {
  if (!Number.isFinite(bytes) || bytes < 0) return false
  if (!Number.isFinite(limitBytes) || limitBytes <= 0) return false
  return bytes > limitBytes
}

/**
 * approxDataUrlBytes estimates the DECODED size of a `data:` URL.
 *
 * base64 encodes 3 bytes as 4 characters, so the payload is about 3/4 of the
 * encoded length; trailing `=` padding is subtracted because it carries no data.
 * Used to size an image the editor holds as a data URL before deciding whether it
 * is worth sending. Returns 0 for anything that is not a data URL, so a caller
 * cannot accidentally treat a remote `src` as an oversized payload.
 */
export function approxDataUrlBytes(dataUrl: string): number {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return 0
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return 0
  const encoded = dataUrl.slice(comma + 1)
  if (encoded.length === 0) return 0
  let padding = 0
  if (encoded.endsWith('==')) padding = 2
  else if (encoded.endsWith('=')) padding = 1
  return Math.max(0, Math.floor((encoded.length - padding) * 0.75))
}

/**
 * formatUploadBytes renders a human-friendly size ("12.4 MB"). Kept here so a
 * message built by these helpers never depends on a React hook.
 */
export function formatUploadBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < BYTES_PER_KB) return `${Math.round(bytes)} B`
  const kb = bytes / BYTES_PER_KB
  if (kb < KB_PER_MB) return `${kb.toFixed(1)} KB`
  return `${(kb / KB_PER_MB).toFixed(1)} MB`
}

/**
 * uploadLimitMessage is the one wording used wherever something is refused for
 * being too large. It always states the actual size and the actual cap, because
 * "file too large" without either leaves the person guessing what to change.
 * `label` is an optional file name or description.
 */
export function uploadLimitMessage(bytes: number, limitMb: number, label?: string): string {
  const subject = label && label.trim() !== '' ? `${label.trim()} is` : 'That file is'
  return `${subject} ${formatUploadBytes(bytes)}, over the ${limitMb} MB upload limit for this workspace.`
}

// --- Embedded payload handling -------------------------------------------------
//
// An image can enter a document without ever touching the upload path: pasting
// HTML from another application (a word processor, a webmail client, another wiki)
// carries <img src="data:image/png;base64,…"> straight into the content. The editor
// accepts base64 images, so nothing intercepts it. These helpers let a caller
// recognise such a payload and turn it back into a real file it can upload, so the
// document ends up referencing object storage like any other image.
//
// Pure and DOM-free apart from the standard atob/File globals, so they are unit
// testable and reusable by an editor extension, an importer, or a migration.

/** ParsedDataURL is the decoded content of a `data:` URL. */
export interface ParsedDataURL {
  mimeType: string
  bytes: Uint8Array
}

/**
 * isDataURL reports whether a src is an inline `data:` payload rather than a
 * reference to something already hosted. Cheap enough to call on every node.
 */
export function isDataURL(src: unknown): boolean {
  return typeof src === 'string' && src.startsWith('data:')
}

/**
 * parseDataURL decodes a base64 `data:` URL into its mime type and bytes, or
 * returns null when the input is not a decodable base64 data URL.
 *
 * Returns null rather than throwing because callers run this over document
 * content they do not control: one malformed src must not break processing of the
 * rest, and "cannot decode" is a normal outcome to skip over.
 */
export function parseDataURL(src: string): ParsedDataURL | null {
  if (!isDataURL(src)) return null
  const comma = src.indexOf(',')
  if (comma < 0) return null
  const header = src.slice(5, comma) // after "data:"
  if (!header.includes('base64')) return null // only base64 payloads carry bulk
  const mimeType = header.split(';')[0] || 'application/octet-stream'
  const encoded = src.slice(comma + 1)
  if (encoded.length === 0) return null
  try {
    const binary = atob(encoded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return { mimeType, bytes }
  } catch {
    return null
  }
}

/**
 * extensionForMimeType maps an image mime type to a file extension, so an uploaded
 * file gets a sensible name instead of a bare id. Falls back to `bin` for anything
 * unrecognised rather than guessing.
 */
export function extensionForMimeType(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    case 'image/svg+xml':
      return 'svg'
    case 'image/avif':
      return 'avif'
    case 'image/bmp':
      return 'bmp'
    default:
      return 'bin'
  }
}

/**
 * dataURLToFile converts an inline payload into a File ready to upload, named from
 * its mime type. Returns null when the payload cannot be decoded, so the caller
 * simply leaves that node alone.
 *
 * `nameHint` lets a caller make the uploaded name recognisable ("pasted-image");
 * it is not trusted for anything beyond the file name.
 */
export function dataURLToFile(src: string, nameHint = 'pasted-image'): File | null {
  const parsed = parseDataURL(src)
  if (!parsed) return null
  const safeHint = nameHint.replace(/[^a-zA-Z0-9._-]/g, '') || 'pasted-image'
  const name = `${safeHint}.${extensionForMimeType(parsed.mimeType)}`
  // Copy into a fresh ArrayBuffer so the File owns its bytes independently of the
  // typed-array view we just built.
  const buffer = parsed.bytes.slice().buffer as ArrayBuffer
  return new File([buffer], name, { type: parsed.mimeType })
}
