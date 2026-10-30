"use client"

import * as React from "react"
import { RefreshCw, Sparkles, Trash2 } from "@/lib/icons"
import { SearchInput } from "@/components/ui/search-input"
import { DesktopReactionPicker } from "@/components/reactionPicker/DesktopReactionPicker"
import { isStandardReaction } from "@/lib/utils/reaction/checker"
import { cn } from "@/lib/utils/helpers/cn"
import { docIconOf } from "@/lib/docLook"
import DocGlyph, { GLYPHS, HUES, hueInk } from "./chrome/glyphs"
import { randomIcon, suggestIcons } from "./chrome/iconSuggest"

type Tab = "emoji" | "icons"

/**
 * The page icon picker (D-2, small-details V22): an emoji from the app's own
 * picker (search, recents, every category), or one of OneCamp's glyphs in a
 * camp colour; with what the title suggests, Random and Remove. It picks; the
 * caller saves.
 */
export function DocIconPicker({ value, title, onPick, onRemove }: { value?: string; title: string; onPick: (icon: string) => void; onRemove?: () => void }) {
  const current = docIconOf(value)
  const [tab, setTab] = React.useState<Tab>(current && "glyph" in current ? "icons" : "emoji")
  const [query, setQuery] = React.useState("")
  const [hue, setHue] = React.useState(current && "glyph" in current ? current.hue || "gray" : "gray")
  const suggested = suggestIcons(title)
  const q = query.trim().toLowerCase()
  const glyphs = q ? GLYPHS.filter((g) => g.name.includes(q) || g.words.includes(q)) : GLYPHS
  const glyphValue = (name: string) => `glyph:${name}${hue !== "gray" ? `:${hue}` : ""}`
  const tabs: { id: Tab; label: string }[] = [
    { id: "emoji", label: "Emoji" },
    { id: "icons", label: "Icons" },
  ]

  return (
    <div className="flex w-[352px] max-w-full flex-col" data-doc-icon-picker="">
      <div className="flex items-center gap-1 border-b border-line px-2 pb-1.5">
        <div role="tablist" aria-label="Kind of icon" className="flex items-center gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "h-7 rounded-md px-2 text-ui-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand",
                tab === t.id ? "bg-press font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => onPick(randomIcon(value))}
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-ui-sm text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand [&>svg]:size-3.5"
        >
          <RefreshCw aria-hidden="true" />
          Random
        </button>
        {onRemove && value ? (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-ui-sm text-ink-2 outline-none hover:bg-hover hover:text-danger-ink focus-visible:ring-2 focus-visible:ring-brand [&>svg]:size-3.5"
          >
            <Trash2 aria-hidden="true" />
            Remove
          </button>
        ) : null}
      </div>

      {suggested.length > 0 ? (
        <div className="flex items-center gap-1 px-3 pt-2" data-doc-icon-suggested="">
          <Sparkles aria-hidden="true" className="size-3.5 text-ink-3" />
          <span className="mr-1 text-meta text-ink-3">From the title</span>
          {suggested.map((s) => (
            <button
              key={s}
              type="button"
              aria-label={`Use ${s}`}
              onClick={() => onPick(s)}
              className="inline-flex size-8 items-center justify-center rounded-md text-xl outline-none transition-transform duration-[140ms] hover:scale-110 hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand motion-reduce:hover:scale-100"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      {tab === "emoji" ? (
        <div role="tabpanel" aria-label="Emoji" className="h-[320px] p-1 max-sm:h-[min(56dvh,440px)]">
          <DesktopReactionPicker onReactionSelect={(r) => isStandardReaction(r) && onPick(r.native)} />
        </div>
      ) : (
        <div role="tabpanel" aria-label="Icons" className="flex flex-col gap-2 p-3">
          <SearchInput size="sm" value={query} onValueChange={setQuery} placeholder="Search icons" aria-label="Search icons" />
          <div role="radiogroup" aria-label="Colour" className="flex items-center gap-1.5">
            {HUES.map((h) => (
              <button
                key={h.name}
                type="button"
                role="radio"
                aria-checked={hue === h.name}
                aria-label={h.label}
                title={h.label}
                onClick={() => setHue(h.name)}
                className={cn(
                  "size-5 rounded-sm outline-none ring-offset-2 ring-offset-[var(--pop)] transition-shadow focus-visible:ring-2 focus-visible:ring-brand",
                  hue === h.name && "ring-2 ring-[var(--ink-3)]",
                )}
                style={{ background: hueInk(h.name) }}
              />
            ))}
          </div>
          <div className="grid max-h-[220px] grid-cols-8 gap-1 overflow-y-auto" data-doc-glyphs="">
            {glyphs.map((g) => (
              <button
                key={g.name}
                type="button"
                aria-label={g.name.replace(/-/g, " ")}
                title={g.name.replace(/-/g, " ")}
                onClick={() => onPick(glyphValue(g.name))}
                className="inline-flex size-9 items-center justify-center rounded-md outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
              >
                <DocGlyph name={g.name} hue={hue} size={18} />
              </button>
            ))}
            {glyphs.length === 0 ? <p className="col-span-8 py-6 text-center text-ui-sm text-ink-3">No icon is called that. Try another word.</p> : null}
          </div>
        </div>
      )}
    </div>
  )
}
