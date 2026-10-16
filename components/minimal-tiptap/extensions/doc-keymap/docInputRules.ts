"use client"

import { InputRule, markInputRule, textblockTypeInputRule, wrappingInputRule, type Editor } from "@tiptap/core"

import { isSafeHref } from "@/lib/utils/safeHref"

/**
 * THE DOC'S MARKDOWN RULES, beyond the shared editor's (the doc keymap adds
 * them; doc editors only). As Notion's (notion.com/help/keyboard-shortcuts):
 *
 *   " + space      a quote (as "> " is)
 *   ~text~         strikethrough (~~text~~ is the shared editor's)
 *   ```            a code block at once, on the third backtick
 *   [text](url)    a link, when the address is one the editor may hold
 *
 * Each is undone by Backspace or ⌘Z straight after (the doc keymap asks
 * undoInputRule first), and none runs in code (Tiptap's input rules never do).
 */

/** `"` then a space at the start of a line. The smart-quote rule has made the `"` a `“` by then. */
export const QUOTE_RULE = /^\s*["“”]\s$/

/** `~text~`: one tilde each side, text that starts and ends with a letter, not a space. */
export const STRIKE_RULE = /(?:^|\s)(~([^~\s](?:[^~]*[^~\s])?)~)$/

/** Three backticks at the start of a line. */
export const CODE_BLOCK_RULE = /^```$/

/** `[text](address)`, not an image's `![alt](src)`. */
export const LINK_RULE = /(?<!!)\[([^\]\n]+)\]\(([^()\s]+)\)$/

/** The href a typed address stands for: as written when it has a scheme or is a path, else https. Pure. */
export function typedHref(raw: string): string | null {
  const address = raw.trim()
  if (!address) return null
  const href = /^[a-z][a-z\d+.-]*:/i.test(address) || address.startsWith("/") || address.startsWith("#") ? address : `https://${address}`
  return isSafeHref(href) ? href : null
}

export function docInputRules(editor: Editor): InputRule[] {
  const { nodes, marks } = editor.schema
  const rules: InputRule[] = []
  if (nodes.blockquote) rules.push(wrappingInputRule({ find: QUOTE_RULE, type: nodes.blockquote }))
  if (marks.strike) rules.push(markInputRule({ find: STRIKE_RULE, type: marks.strike }))
  if (nodes.codeBlock) rules.push(textblockTypeInputRule({ find: CODE_BLOCK_RULE, type: nodes.codeBlock }))
  const link = marks.link
  if (link) {
    rules.push(
      new InputRule({
        find: LINK_RULE,
        handler: ({ state, range, match }) => {
          const [, text, raw] = match
          const href = typedHref(raw)
          if (!href) return null
          const kept = state.doc.resolve(range.from).marks().filter((m) => m.type !== link)
          state.tr.replaceWith(range.from, range.to, state.schema.text(text, [...kept, link.create({ href })]))
          // What's typed next isn't part of the link.
          state.tr.removeStoredMark(link)
        },
      }),
    )
  }
  return rules
}
