import type { Attribute } from "@tiptap/core"
import { mediaLinkOf } from "@/lib/codec/mediaLink"

/**
 * An attribute kept in HTML as data-<key>: a string, or with int a whole
 * number. The codec (lib/codec/media.ts) writes and reads the same.
 */
export function dataAttr(name: string, key: string, int = false): Partial<Attribute> {
  return {
    default: null,
    parseHTML: (el) => {
      const v = el.getAttribute(key)
      if (!v) return null
      return int ? (/^\d+$/.test(v) ? parseInt(v, 10) : null) : v
    },
    renderHTML: (attrs) => (attrs[name] === null || attrs[name] === undefined || attrs[name] === "" ? {} : { [key]: String(attrs[name]) }),
  }
}

/** A plain link inside a block, as a DOM spec's children (none without an address): for a reader that doesn't know the block. */
export const linked = (href: string, words: string): Array<[string, Record<string, string>, string]> => (href ? [["a", { href }, words]] : [])

/** The plain link a block's HTML holds (mediaLink.ts), as a DOM spec's children. */
export function linkChildren(type: string, attrs: Record<string, unknown>): Array<[string, Record<string, string>, string]> {
  const link = mediaLinkOf(type, attrs)
  return link ? linked(link.href, link.text) : []
}
