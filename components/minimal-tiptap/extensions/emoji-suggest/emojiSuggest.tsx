import { Extension } from "@tiptap/core"
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion"
import { PluginKey } from "@tiptap/pm/state"
import { forwardRef, useEffect, useId, useImperativeHandle, useState } from "react"
import type { EmojiMartData } from "@emoji-mart/data"
import { cn } from "@/lib/utils/helpers/cn"
import { useAnnounceList } from "@/components/ui/CommandList"
import { inCode, suggestionPopup, type SuggestionListExtras } from "../suggestion-popup"

export interface EmojiHit {
    id: string
    native: string
}

let catalogue: EmojiMartData | null = null
async function load(): Promise<EmojiMartData> {
    if (!catalogue) catalogue = ((await import("@emoji-mart/data")) as { default: EmojiMartData }).default
    return catalogue
}

/**
 * Emoji whose short name starts with the query (shorter names first), then
 * those whose keywords, name or id contain it: up to eight, the way Slack's ":ro" offers 🚀. Pure over
 * the catalogue, for tests.
 */
export function searchEmoji(data: EmojiMartData, query: string, limit = 8): EmojiHit[] {
    const q = query.toLowerCase()
    if (q.length < 2) return []
    const starts: EmojiHit[] = []
    const contains: EmojiHit[] = []
    for (const e of Object.values(data.emojis)) {
        const hit = { id: e.id, native: e.skins[0]?.native ?? "" }
        if (!hit.native) continue
        if (e.id.startsWith(q)) starts.push(hit)
        else if (e.keywords?.some((k) => k.startsWith(q)) || e.id.includes(q) || e.name.toLowerCase().includes(q)) contains.push(hit)
    }
    // Shorter names first: ":ro" means rocket and rose before roller_coaster.
    const byLength = (a: EmojiHit, b: EmojiHit) => a.id.length - b.id.length
    return [...starts.sort(byLength), ...contains.sort(byLength)].slice(0, limit)
}

type Ref = { onKeyDown: (p: SuggestionKeyDownProps) => boolean }

/**
 * ":" and two letters (design v3 chat, C43): a row of up to eight emoji on the
 * floating material above the caret, the chosen one's :short_name: under it.
 * ← and → choose, Enter or Tab puts it in.
 */
const EmojiRow = forwardRef<Ref, SuggestionProps<EmojiHit> & SuggestionListExtras>(function EmojiRow(props, ref) {
    const [index, setIndex] = useState(0)
    useEffect(() => setIndex(0), [props.items])
    // Announced from the editor, which keeps focus while the row is up.
    const rowId = useId()
    const optionId = (i: number) => `${rowId}-${i}`
    useAnnounceList(props.items.length ? props.comboboxFor : null, `${rowId}-list`, props.items.length ? optionId(index) : undefined)
    const pick = (i: number) => {
        const hit = props.items[i]
        if (hit) props.command(hit)
    }
    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }) => {
            if (!props.items.length) return false
            if (event.key === "ArrowRight") {
                setIndex((i) => (i + 1) % props.items.length)
                return true
            }
            if (event.key === "ArrowLeft") {
                setIndex((i) => (i + props.items.length - 1) % props.items.length)
                return true
            }
            if (event.key === "Enter" || event.key === "Tab") {
                pick(index)
                return true
            }
            return false
        },
    }))
    if (!props.items.length) return null
    return (
        <div data-emoji-suggest="" id={`${rowId}-list`} role="listbox" aria-label="Emoji" aria-orientation="horizontal" className="pop-surface animate-pop-in p-1">
            <div className="flex gap-0.5">
                {props.items.map((hit, i) => (
                    <button
                        key={hit.id}
                        id={optionId(i)}
                        type="button"
                        role="option"
                        aria-selected={i === index}
                        aria-label={`:${hit.id}:`}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setIndex(i)}
                        onClick={() => pick(i)}
                        className={cn("flex size-8 items-center justify-center rounded-md text-[1.25rem] leading-none", i === index ? "bg-press" : "hover:bg-hover")}
                    >
                        {hit.native}
                    </button>
                ))}
            </div>
            <p className="px-1.5 pb-0.5 pt-1 text-meta text-ink-2">:{props.items[index]?.id}:</p>
        </div>
    )
})

export const EmojiSuggestPluginKey = new PluginKey("emojiSuggest")

export const EmojiSuggest = Extension.create({
    name: "emojiSuggest",
    addProseMirrorPlugins() {
        return [
            Suggestion<EmojiHit>({
                editor: this.editor,
                char: ":",
                pluginKey: EmojiSuggestPluginKey,
                allowSpaces: false,
                items: async ({ query }) => (query.length < 2 ? [] : searchEmoji(await load(), query)),
                command: ({ editor, range, props }) => {
                    editor.chain().focus().deleteRange(range).insertContent(props.native).run()
                },
                // ":" in code is code (a key: value, a selector), not emoji.
                allow: ({ state, range }) => !inCode(state, range.from),
                render: suggestionPopup({
                    component: EmojiRow,
                    tippy: { placement: "top-start", offset: [0, 4], popperOptions: undefined },
                    // ":" and one letter, or no emoji by that name: nothing to show.
                    isEmpty: (props) => props.items.length === 0,
                }),
            }),
        ]
    },
})
