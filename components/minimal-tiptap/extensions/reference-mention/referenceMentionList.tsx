"use client"

import { MentionOptions } from "@tiptap/extension-mention"
import { PluginKey } from "@tiptap/pm/state"
import { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion"
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react"
import axiosInstance from "@/lib/axiosInstance"
import { PostEndpointUrl } from "@/services/endPoints"
import { CommandList, CommandTile, type CommandListHandle, type CommandListItem } from "@/components/ui/CommandList"
import { chipAllowed, suggestionPopup, type SuggestionListExtras } from "../suggestion-popup"
import {
  encodeReferenceId,
  isDocEditor,
  keptLabel,
  referenceIcon,
  referenceTypeLabel,
  type ReferenceItem,
  type ReferenceType,
} from "./referenceTypes"

// Maps a raw unified-search hit to a compact ReferenceItem for the chosen
// trigger. Returns null for hits that don't apply (so one search call can back
// both the # and + pickers by filtering to the requested types).
function mapSearchResult(result: any, types: ReferenceType[]): ReferenceItem | null {
  const type = result?.type as string
  if (!types.includes(type as ReferenceType)) return null

  switch (type) {
    case "channel":
      if (!result.channel?.ch_id || !result.channel?.ch_name) return null
      return { routeId: result.channel.ch_id, label: result.channel.ch_name, refType: "channel" }
    case "doc":
      if (!result.doc?.doc_uuid) return null
      return {
        routeId: result.doc.doc_uuid,
        label: result.doc.doc_title || "Untitled doc",
        refType: "doc",
        subtitle: result.doc.doc_created_by_user_full_name ? `Doc · ${result.doc.doc_created_by_user_full_name}` : "Doc",
      }
    case "board":
      if (!result.board?.board_uuid) return null
      return {
        routeId: result.board.board_uuid,
        label: result.board.board_title || "Untitled board",
        refType: "board",
        subtitle: result.board.board_created_by_user_full_name ? `Board · ${result.board.board_created_by_user_full_name}` : "Board",
      }
    case "task":
      if (!result.task?.task_id) return null
      return {
        routeId: result.task.task_id,
        label: result.task.task_name || "Untitled task",
        refType: "task",
        subtitle: result.task.task_assignee_user_full_name ? `Task · ${result.task.task_assignee_user_full_name}` : "Task",
      }
    case "project":
      if (!result.project?.project_id) return null
      return {
        routeId: result.project.project_id,
        label: result.project.project_name || "Untitled project",
        refType: "project",
        subtitle: "Project",
      }
    default:
      return null
  }
}

/** The workspace's docs, boards, tasks, projects or channels called something, as the reader may see them (global search). */
export async function searchReferences(query: string, types: ReferenceType[]): Promise<ReferenceItem[]> {
  const q = query.trim()
  if (!q) return []
  try {
    const res = await axiosInstance.post(PostEndpointUrl.GlobalSearch, { global_search_text: q })
    const page: any[] = res?.data?.data?.page ?? res?.data?.page ?? []
    const items: ReferenceItem[] = []
    for (const hit of page) {
      const mapped = mapSearchResult(hit, types)
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
  emptyHint: string
  /** The chip's node ("channelMention", "entityMention"): the menu opens only where it can go. */
  nodeName: string
}

// Builds a Tiptap mention suggestion config for a non-user trigger. The popup
// (tippy + ReactRenderer) mirrors the existing @user mention so behaviour and
// styling stay consistent across triggers, including on mobile.
export function makeReferenceSuggestion({
  char,
  types,
  pluginKey,
  emptyHint,
  nodeName,
}: MakeReferenceSuggestionArgs): MentionOptions["suggestion"] {
  const debouncedFetch = createDebouncedFetcher(types)
  return {
    char,
    pluginKey,
    items: async ({ query }: { query: string }) => debouncedFetch(query),
    // "#" or "+" in code is code (a heading anchor, an addition), not a chip.
    allow: chipAllowed(nodeName),
    render: suggestionPopup({
      component: forwardRef<ReferenceListRef, ReferenceListProps>(function ReferenceMenu(props, ref) {
        return <ReferenceList {...props} ref={ref} />
      }),
      extraProps: () => ({
        emptyHint,
        listLabel: types.includes("channel") ? "Link a channel" : "Link a doc, board, task or project",
      }),
    }),
  }
}
