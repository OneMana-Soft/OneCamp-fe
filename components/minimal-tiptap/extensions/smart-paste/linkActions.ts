"use client"

import type { Editor } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { busFor } from "@/components/docEditor/registry/commandBus"
import { docFileUrl } from "@/lib/docFiles"
import { storeFromLink, unfurlLink, type LinkCard } from "@/services/unfurlService"
import { pasteMenuOf, setPasteMenu, trackPos } from "./smartPaste"

/** What can become of a pasted link. */
export type LinkChoice = "link" | "mention" | "bookmark" | "embed"

/** Makes a pasted link what the menu's choice says: a mention, a bookmark or an embed; Link leaves it. */
export function chooseLink(editor: Editor, choice: LinkChoice | undefined) {
  const menu = pasteMenuOf(editor.state)
  if (!menu) return
  setPasteMenu(editor.view, null)
  if (!choice || choice === "link") return
  convertLink(editor, menu.from, menu.to, menu.href, choice)
}

/** Turns the link text at from..to into a mention, a bookmark or an embed of href. */
function convertLink(editor: Editor, from: number, to: number, href: string, choice: Exclude<LinkChoice, "link">) {
  const { state } = editor
  const { schema } = state
  const tr = state.tr
  if (choice === "mention") {
    tr.replaceWith(from, to, schema.nodes.linkMention.create({ href }))
    editor.view.dispatch(tr)
    void fillPreview(editor, trackPos(editor, from, -1), href)
    return
  }
  const block = choice === "bookmark" ? schema.nodes.bookmark.create({ href }) : schema.nodes.webEmbed.create({ src: href })
  // The link alone on its line becomes the block; in a sentence, the block
  // goes below it and the address leaves the text.
  tr.delete(from, to)
  const $p = tr.doc.resolve(tr.mapping.map(from))
  const para = $p.parent
  let at: number
  if (para.isTextblock && para.content.size === 0 && $p.depth > 0) {
    at = $p.before()
    tr.replaceWith(at, $p.after(), block)
  } else {
    at = $p.after()
    tr.insert(at, block)
  }
  editor.view.dispatch(tr.scrollIntoView())
  if (choice === "bookmark") void fillPreview(editor, trackPos(editor, at, -1), href)
}

/**
 * Fills a bookmark's or a mention's preview, as this workspace's server reads
 * the page, in the tab that made it: the words first, then the icon (and a
 * bookmark's picture), each kept with the doc so readers never load them from
 * the site. A preview that can't be read leaves a plain link, quietly.
 */
export async function fillPreview(editor: Editor, at: { pos(): number | null; stop(): void }, href: string): Promise<LinkCard | null> {
  const docId = busFor(editor)?.docId
  const nodeAt = (): { pos: number; node: PMNode } | null => {
    const pos = at.pos()
    const node = pos === null || editor.isDestroyed ? null : editor.state.doc.nodeAt(pos)
    return node && (node.type.name === "bookmark" || node.type.name === "linkMention") && node.attrs.href === href ? { pos: pos!, node } : null
  }
  const set = (attrs: Record<string, unknown>) => {
    const found = nodeAt()
    if (!found) return false
    editor.view.dispatch(editor.state.tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, ...attrs }).setMeta("addToHistory", false))
    return true
  }
  try {
    const card = await unfurlLink(href)
    const target = nodeAt()
    if (!target || !card.fetched) return card
    const bookmark = target.node.type.name === "bookmark"
    set(bookmark ? { title: card.title || null, description: card.description || null, siteName: card.site_name || null } : { title: card.title || null, siteName: card.site_name || null })
    if (!docId) return card
    const keep = async (url: string | undefined, kind: "icon" | "image", attr: string) => {
      if (!url) return
      try {
        const stored = await storeFromLink(docId, url, kind)
        set({ [attr]: docFileUrl(docId, stored.object_uuid) })
      } catch {
        // No icon or picture is a plain card, never an error.
      }
    }
    await keep(card.icon_url, "icon", "icon")
    if (bookmark) await keep(card.image_url, "image", "image")
    return card
  } finally {
    at.stop()
  }
}
