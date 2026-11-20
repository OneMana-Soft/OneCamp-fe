"use client"

import { MentionOptions } from "@tiptap/extension-mention"
import { PluginKey } from "@tiptap/pm/state"
import { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion"
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react"
import axiosInstance from "@/lib/axiosInstance"
import { PostEndpointUrl } from "@/services/endPoints"
import { CommandList, CommandTile, type CommandListHandle, type CommandListItem } from "@/components/ui/CommandList"
import { chipAllowed, suggestionPopup, type SuggestionListExtras } from "../suggestion-popup"
import type { HitRef, HitRefKind } from "@/lib/search/hitRef"
import type { SearchResult } from "@/services/searchService"
import {
  encodeReferenceId,
  isDocEditor,
  keptLabel,
  referenceIcon,
  referenceTypeLabel,
  type ReferenceItem,
  type ReferenceType,
} from "./referenceTypes"

/** Who a hit's second line names after its kind: who made the doc or board, who has the task. */
const madeBy: Record<Exclude<HitRefKind, "channel">, (r: SearchResult) => string | undefined> = {
  doc: (r) => r.doc?.doc_created_by_user_full_name,
  board: (r) => r.board?.board_created_by_user_full_name,
  task: (r) => r.task?.task_assignee_user_full_name,
  project: () => undefined,
}

// Maps a raw unified-search hit to a compact ReferenceItem for the chosen
// trigger. Returns null for hits that don't apply (so one search call can back
// both the # and + pickers by filtering to the requested types). A doc, board,
// task, project or channel is read as every picker that links one reads it
// (lib/search/hitRef, handed in as readHit); its second line is this picker's
// own, and a channel's row is its name alone.
function mapSearchResult(result: any, types: ReferenceType[], readHit: (r: SearchResult) => HitRef | null): ReferenceItem | null {
  const type = result?.type as string
  if (!types.includes(type as ReferenceType)) return null
  const hit = readHit(result)
  if (!hit) return null
  if (hit.kind === "channel") return { routeId: hit.id, label: hit.title, refType: "channel" }
  const word = referenceTypeLabel(hit.kind)
  const who = madeBy[hit.kind](result)
  return { routeId: hit.id, label: hit.title, refType: hit.kind, subtitle: who ? `${word} · ${who}` : word }
}

/** The workspace's docs, boards, tasks, projects or channels called something, as the reader may see them (global search). */
export async function searchReferences(query: string, types: ReferenceType[]): Promise<ReferenceItem[]> {
  const q = query.trim()
  if (!q) return []
  try {
    // hitRef comes with the search, not with the editor: the editor's own
    // chunks never carry it (the entity-link search and a table's link cell,
    // both lazy, do), so linking it here re-splits none of them.
    const [res, { hitRef }] = await Promise.all([
      axiosInstance.post(PostEndpointUrl.GlobalSearch, { global_search_text: q }),
      import("@/lib/search/hitRef"),
    ])
    const page: any[] = res?.data?.data?.page ?? res?.data?.page ?? []
    const items: ReferenceItem[] = []
    for (const hit of page) {
      const mapped = mapSearchResult(hit, types, hitRef)
      if (mapped) items.push(mapped)
      if (items.length >= 8) break
    }
    return items
  } catch (e) {
    console.error("Failed to fetch references", e)
    return []
  }
}

// One debounced fetcher per suggestion instance. Superseded keystrokes drop
// their pending timer (their promise simply never resolves, so Tiptap ignores
// them) and only the latest query hits the search endpoint after a short pause.
export function createDebouncedFetcher(types: ReferenceType[], delayMs = 180) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (query: string): Promise<ReferenceItem[]> => {
    const q = query.trim()
    if (!q) return Promise.resolve([])
    return new Promise((resolve) => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        searchReferences(q, types).then(resolve)
      }, delayMs)
    })
  }
}

interface ReferenceListProps extends SuggestionProps, SuggestionListExtras {
  items: ReferenceItem[]
  emptyHint: string
  /** The list's accessible name: "Link a channel". */
  listLabel: string
}

type ReferenceListRef = {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean
}

/**
 * The "#" and "+" pickers, as the area's CommandList (the "/" and "@" menus'
 * list): ↑ ↓ wrap, Enter or Tab picks, the highlight slides, and the list is
 * announced from the editor. They were their own button list, with no roles,
 * no Tab and the old tokens.
 */
const ReferenceList = forwardRef<ReferenceListRef, ReferenceListProps>((props, ref) => {
  const listRef = useRef<CommandListHandle>(null)
  const rows: CommandListItem[] = useMemo(
    () =>
      props.items.map((item) => {
        const Icon = referenceIcon(item.refType)
        return {
          id: `${item.refType}-${item.routeId}`,
          label: item.label,
          meta: item.subtitle || referenceTypeLabel(item.refType),
          tile: (
            <CommandTile>
              <Icon />
            </CommandTile>
          ),
        }
      }),
    [props.items],
  )

  const selectItem = (row: CommandListItem) => {
    const item = props.items.find((i) => `${i.refType}-${i.routeId}` === row.id)
    if (!item) return
    props.command({ id: encodeReferenceId(item.refType, item.routeId), label: keptLabel(item, isDocEditor(props.editor)) } as any)
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: SuggestionKeyDownProps) => listRef.current?.onKeyDown(event) ?? false,
  }))

  return (
    <div data-reference-list="">
      <CommandList
        ref={listRef}
        comboboxFor={props.comboboxFor}
        label={props.listLabel}
        className="w-80"
        maxHeight={8 * 44 + 8}
        items={rows}
        query={props.query}
        onSelect={selectItem}
        empty={<span className="text-ink-3">{props.query?.trim() ? `Nothing called “${props.query}”` : props.emptyHint}</span>}
      />
    </div>
  )
})
ReferenceList.displayName = "ReferenceList"

interface MakeReferenceSuggestionArgs {
  char: string
  types: ReferenceType[]
  pluginKey: PluginKey
  emptyHint?: string
  /** The chip's node ("channelMention", "entityMention"): the menu opens only where it can go. */
  nodeName: string
  /** Opens once a letter follows: "+1" is text. */
  letterFirst?: boolean
}

// Builds a Tiptap mention suggestion config for a non-user trigger. The popup
// (tippy + ReactRenderer) mirrors the existing @user mention so behaviour and
// styling stay consistent across triggers, including on mobile.
export function makeReferenceSuggestion({
  char,
  types,
  pluginKey,
  emptyHint = "",
  nodeName,
  letterFirst,
}: MakeReferenceSuggestionArgs): MentionOptions["suggestion"] {
  const debouncedFetch = createDebouncedFetcher(types)
  const canGo = chipAllowed(nodeName)
  return {
    char,
    pluginKey,
    items: async ({ query }: { query: string }) => debouncedFetch(query),
    // "#" or "+" in code is code (a heading anchor, an addition), not a chip.
    allow: (p) => canGo(p) && (!letterFirst || /^(\p{L}|$)/u.test(p.state.doc.textBetween(p.range.from, p.range.to).slice(char.length))),
    render: suggestionPopup({
      component: forwardRef<ReferenceListRef, ReferenceListProps>(function ReferenceMenu(props, ref) {
        return <ReferenceList {...props} ref={ref} />
      }),
      extraProps: () => ({
        emptyHint,
        listLabel: types.includes("channel") ? "Link a channel" : "Link a doc, board, task or project",
      }),
      // Started at the bare trigger (its empty search answers at once), shown at the letter.
      isEmpty: (p) => !!letterFirst && !p.query,
    }),
  }
}
