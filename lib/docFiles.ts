/**
 * Where a doc's own files are: a picture, a file block, a bookmark's icon. A
 * member's browser loads them from GET /doc/getDocAttachment/{doc}/{obj}; a
 * guest has no session, so the same file comes through their link instead,
 * GET /guest/doc-attachment/{token}/{obj}, which the server lets through only
 * for the doc that link opens (how-docs-work-backend B13).
 */

const backend = () => (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "")

const DOC_FILE = /\/doc\/getDocAttachment\/([0-9a-f-]{36})\/([0-9a-f-]{36})(?:[?#].*)?$/i

/** A file kept with a doc, as the doc stores its address. */
export const docFileUrl = (docId: string, objectUuid: string) => `${backend()}/doc/getDocAttachment/${docId}/${objectUuid}`

/** The doc and the object a doc file's address names, or null for any other address. */
export function docFileOf(src: string | null | undefined): { docId: string; objectUuid: string } | null {
  const m = typeof src === "string" ? DOC_FILE.exec(src) : null
  return m ? { docId: m[1], objectUuid: m[2] } : null
}

/** The share link's token on the guest's page (/guest/d/{token}), or null on any other page. */
export function guestShareToken(path = typeof window !== "undefined" ? window.location.pathname : ""): string | null {
  const m = /^\/guest\/d\/([^/?#]+)/.exec(path)
  return m ? decodeURIComponent(m[1]) : null
}

/**
 * The address to load a doc's file from: a guest's goes through their link,
 * everyone else's is the stored one. Anything that isn't a doc file is left
 * as it is.
 */
export function viewableFileUrl(src: string, guest: boolean, token = guest ? guestShareToken() : null): string {
  const file = guest && token ? docFileOf(src) : null
  return file ? `${backend()}/guest/doc-attachment/${encodeURIComponent(token!)}/${file.objectUuid}` : src
}
