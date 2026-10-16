"use client"

/**
 * A code block's language list (docs programme B3, editor.md P1-8): a search
 * field over every language the block offers, the ones used last first. ↑ ↓
 * move, Enter picks, Escape closes. It loads the first time a block's language
 * is clicked.
 */

import * as React from "react"
import { Search } from "@/lib/icons"
import { CommandList, fuzzyMatch, highlightMatch, type CommandListHandle, type CommandListItem } from "@/components/ui/CommandList"
import { CODE_LANGUAGES, languageOf } from "@/components/minimal-tiptap/extensions/code-block-lowlight/languages"
import { openFloating } from "./floating"

const RECENT_KEY = "onecamp-doc-code-languages"

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]")
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 3) : []
  } catch {
    return []
  }
}

function pushRecent(id: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, 3)))
  } catch {
    // Private mode: the list just has no recent ones.
  }
}

/** The rows for a query: the recent languages first (with no query), then every match. Pure but for storage. */
export function languageRows(query: string, current: string | null, recent: string[] = readRecent()): CommandListItem[] {
  const q = query.trim()
  const row = (id: string, group?: string): CommandListItem | null => {
    const l = languageOf(id)
    if (!l) return null
    return {
      id: `${group ? "r-" : ""}${l.id}`,
      label: highlightMatch(l.label, q),
      text: l.label,
      group,
      trailing: current && languageOf(current)?.id === l.id ? <span className="text-meta text-ink-3">Current</span> : undefined,
    }
  }
  if (!q) {
    const recents = recent.map((id) => row(id, "Recent")).filter(Boolean) as CommandListItem[]
    const all = CODE_LANGUAGES.map((l) => row(l.id, recents.length ? "All languages" : undefined)!)
    return [...recents, ...all]
  }
  const scored = CODE_LANGUAGES.map((l) => {
    const words = [l.label, l.id, ...(l.aliases ?? [])].map((w) => w.toLowerCase())
    const lq = q.toLowerCase()
    const rank = words.some((w) => w === lq) ? 0 : words.some((w) => w.startsWith(lq)) ? 1 : words.some((w) => fuzzyMatch(w, lq)) ? 2 : -1
    return { l, rank }
  })
    .filter((s) => s.rank >= 0)
    .sort((a, b) => a.rank - b.rank)
  return scored.map((s) => row(s.l.id)!)
}

function Picker({ current, onPick, close }: { current: string | null; onPick(id: string): void; close(): void }) {
  const [query, setQuery] = React.useState("")
  const list = React.useRef<CommandListHandle>(null)
  const input = React.useRef<HTMLInputElement>(null)
  const items = React.useMemo(() => languageRows(query, current), [query, current])
  React.useEffect(() => input.current?.focus(), [])
  const pick = (item: CommandListItem) => {
    const id = item.id.replace(/^r-/, "")
    pushRecent(id)
    close()
    onPick(id)
  }
  return (
    <div className="flex w-[260px] flex-col max-sm:w-full" data-code-language-picker="">
      <label className="flex h-9 items-center gap-2 border-b border-line px-3 max-sm:h-11">
        <Search className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
        <input
          ref={input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (list.current?.onKeyDown(e)) e.preventDefault()
          }}
          placeholder="Search languages"
          aria-label="Search languages"
          className="h-full w-full bg-transparent text-ui-sm text-ink outline-none placeholder:text-ink-3 max-sm:text-base pointer-coarse:text-base"
        />
      </label>
      <CommandList
        ref={list}
        items={items}
        onSelect={pick}
        label="Languages"
        query={query}
        empty="No language by that name"
        maxHeight={280}
        className="w-full shadow-none"
        comboboxFor={input.current}
      />
    </div>
  )
}

/** Opens the list under a block's language button. */
export function openLanguagePicker(anchor: HTMLElement, current: string | null, onPick: (id: string) => void, returnFocus: () => void) {
  return openFloating((close) => <Picker current={current} onPick={onPick} close={close} />, {
    anchor: () => (anchor.isConnected ? anchor.getBoundingClientRect() : null),
    label: "Code language",
    returnFocus,
    sheetOnPhone: true,
    className: "overflow-hidden rounded-xl pop-surface",
  })
}
