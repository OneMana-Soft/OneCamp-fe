"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import type { Editor } from "@tiptap/core"
import { AtSign, Bookmark, Globe, Link2 } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { embedFor } from "@/lib/embeds/providers"
import { pasteMenuOf, setPasteMenu } from "../smart-paste/smartPaste"
import { chooseLink, type LinkChoice } from "../smart-paste/linkActions"
import { adminHostsNow } from "./hosts"
import { ensureAdminHosts } from "./adminHosts"

const ITEMS: Record<LinkChoice, { label: string; hint: string; icon: typeof Link2 }> = {
  link: { label: "Link", hint: "Keep it as a link", icon: Link2 },
  mention: { label: "Mention", hint: "The page's icon and title, in the line", icon: AtSign },
  bookmark: { label: "Bookmark", hint: "A card with the page's title and picture", icon: Bookmark },
  embed: { label: "Embed", hint: "", icon: Globe },
}

/** Where the menu stands: under the link's end, or above it near the bottom of what's visible. */
function placeAt(editor: Editor, pos: number) {
  const c = editor.view.coordsAtPos(Math.min(pos, editor.state.doc.content.size))
  const vv = typeof window !== "undefined" ? window.visualViewport : null
  const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight
  const left = Math.max(8, Math.min(c.left, (vv ? vv.offsetLeft + vv.width : window.innerWidth) - 288))
  return c.bottom + 220 > bottom ? { left, bottom: window.innerHeight - c.top + 6 } : { left, top: c.bottom + 6 }
}

/**
 * What a pasted link becomes (small-details L3; editor.md P0-5): the menu that
 * opens over it. Link is chosen at first, so Enter or Esc keep the link, and
 * typing on carries on; ↑ ↓ choose. Embed shows only for a site the doc can
 * frame (lib/embeds/providers.ts), named. The editor keeps the focus
 * throughout (smartPaste.ts reads the keys); a pointer or a tap picks too.
 */
export default function PasteMenu({ editor }: { editor: Editor }) {
  // The keys move the highlight and take a choice (smartPaste.ts): follow every change.
  const menu = React.useSyncExternalStore(
    React.useCallback(
      (onChange: () => void) => {
        editor.on("transaction", onChange)
        return () => void editor.off("transaction", onChange)
      },
      [editor],
    ),
    () => pasteMenuOf(editor.state),
    () => null,
  )
  const [hosts, setHosts] = React.useState(adminHostsNow)
  React.useEffect(() => {
    let live = true
    void ensureAdminHosts().then((h) => live && setHosts(h))
    return () => {
      live = false
    }
  }, [])

  const embed = menu ? embedFor(menu.href, hosts) : null
  const choices: LinkChoice[] = embed ? ["link", "mention", "bookmark", "embed"] : ["link", "mention", "bookmark"]
  const index = menu ? ((menu.index % choices.length) + choices.length) % choices.length : 0

  React.useEffect(() => {
    if (menu?.accepted) chooseLink(editor, choices[index])
  })

  // Leaving the text (a click elsewhere, another field) leaves the link as it is.
  React.useEffect(() => {
    const close = () => pasteMenuOf(editor.state) && setPasteMenu(editor.view, null)
    editor.on("blur", close)
    return () => void editor.off("blur", close)
  }, [editor])

  if (!menu || menu.accepted) return null
  const at = placeAt(editor, menu.to)
  const id = (c: LinkChoice) => `paste-menu-${c}`

  return createPortal(
    <div
      role="listbox"
      aria-label="Paste as"
      aria-activedescendant={id(choices[index])}
      data-paste-menu=""
      style={{ position: "fixed", ...at }}
      className="content-float z-[var(--z-popover)] w-[280px] rounded-[10px] bg-pop p-1 text-ink shadow-e3"
      onMouseDown={(e) => e.preventDefault()}
    >
      <p className="px-2 pb-1 pt-1.5 text-micro font-medium text-ink-3">Paste as</p>
      {choices.map((c, i) => {
        const item = ITEMS[c]
        const Icon = item.icon
        return (
          <div
            key={c}
            id={id(c)}
            role="option"
            aria-selected={i === index}
            onClick={() => chooseLink(editor, c)}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-[90ms] max-sm:min-h-11",
              i === index ? "bg-hover" : "hover:bg-hover",
            )}
          >
            <Icon className="size-4 shrink-0 text-ink-2" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-ui-sm font-medium">{item.label}</span>
              <span className="block truncate text-meta text-ink-3">{c === "embed" && embed ? `Show the ${embed.name} ${embed.aspect ? "player" : "view"} here` : item.hint}</span>
            </span>
          </div>
        )
      })}
      <p className="sr-only" aria-live="polite">
        Paste as {choices.map((c) => ITEMS[c].label).join(", ")}. Up and down to choose, Enter to pick, Escape to keep the link.
      </p>
    </div>,
    document.body,
  )
}
