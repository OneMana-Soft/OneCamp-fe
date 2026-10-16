import type { JSONContent } from "@tiptap/core"
import { fromMarkdown } from "@/lib/codec/markdownParse"
import { newUploadId } from "../image/uploads"

/**
 * Pasted Markdown as the doc's blocks (A7's codec, for the doc's schema),
 * fetched when a paste first needs it. A picture written as a web address
 * comes back with no address and an upload's id, for the paste to keep it with
 * the doc (image/remoteImage.ts), when there is a doc to keep it in.
 */
export function blocksFromMarkdown(markdown: string, docId?: string): { blocks: JSONContent[]; pictures: Array<{ id: string; url: string }> } {
  const pictures: Array<{ id: string; url: string }> = []
  const keep = (n: JSONContent): JSONContent => {
    const src = n.attrs?.src
    if (n.type === "image" && docId && typeof src === "string" && /^https?:\/\//i.test(src)) {
      const id = newUploadId()
      pictures.push({ id, url: src })
      return { ...n, attrs: { ...n.attrs, src: null, id, fileName: src.split(/[?#]/)[0].split("/").pop() || null } }
    }
    return n.content ? { ...n, content: n.content.map(keep) } : n
  }
  const blocks = ((fromMarkdown(markdown).content || []) as JSONContent[]).map(keep)
  return { blocks, pictures }
}
