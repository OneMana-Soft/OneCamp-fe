"use client"

import { MentionOptions } from "@tiptap/extension-mention"
import { PluginKey } from "@tiptap/pm/state"
import { ReactRenderer } from "@tiptap/react"
import { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion"
import { forwardRef, useEffect, useImperativeHandle, useState } from "react"
import tippy, { Instance as TippyInstance } from "tippy.js"
import axiosInstance from "@/lib/axiosInstance"
import { PostEndpointUrl } from "@/services/endPoints"
import { cn } from "@/lib/utils/helpers/cn"
import {
  encodeReferenceId,
  referenceIcon,
  referenceTypeLabel,
  type ReferenceItem,
  type ReferenceType,
} from "./referenceTypes"

const DOM_RECT_FALLBACK: DOMRect = {
  bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0,
  toJSON() {
    return {}
  },
}

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

async function searchReferences(query: string, types: ReferenceType[]): Promise<ReferenceItem[]> {
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
function createDebouncedFetcher(types: ReferenceType[], delayMs = 180) {
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

interface ReferenceListProps extends SuggestionProps {
  items: ReferenceItem[]
  emptyHint: string
}

type ReferenceListRef = {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean
}

const ReferenceList = forwardRef<ReferenceListRef, ReferenceListProps>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const selectItem = (index: number) => {
    const item = props.items[index]
    if (!item) return
    props.command({ id: encodeReferenceId(item.refType, item.routeId), label: item.label } as any)
  }

  useEffect(() => {
    setSelectedIndex(0)
  }, [props.items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length)
        return true
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((selectedIndex + 1) % props.items.length)
        return true
      }
      if (event.key === "Enter") {
        selectItem(selectedIndex)
        return true
      }
      return false
    },
  }))

  if (props.items.length === 0) {
    return (
      <div className="rounded-lg border bg-popover text-popover-foreground shadow-md min-w-[14rem] max-w-[20rem] p-3 text-xs text-muted-foreground">
        {props.emptyHint}
      </div>
    )
  }

  return (
    <div className="flex flex-col overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-md min-w-[15rem] max-w-[22rem] max-h-[18rem] p-1 gap-0.5">
      {props.items.map((item, index) => {
        const Icon = referenceIcon(item.refType)
        return (
          <button
            type="button"
            key={`${item.refType}-${item.routeId}`}
            onClick={() => selectItem(index)}
            onMouseEnter={() => setSelectedIndex(index)}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-2 text-sm outline-none cursor-pointer transition-colors text-left w-full",
              index === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted",
            )}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium leading-tight">{item.label}</span>
              <span className="truncate text-[11px] text-muted-foreground leading-tight">
                {item.subtitle || referenceTypeLabel(item.refType)}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
})
ReferenceList.displayName = "ReferenceList"

export interface MakeReferenceSuggestionArgs {
  char: string
  types: ReferenceType[]
  pluginKey: PluginKey
  emptyHint: string
}

// Builds a Tiptap mention suggestion config for a non-user trigger. The popup
// (tippy + ReactRenderer) mirrors the existing @user mention so behaviour and
// styling stay consistent across triggers, including on mobile.
export function makeReferenceSuggestion({
  char,
  types,
  pluginKey,
  emptyHint,
}: MakeReferenceSuggestionArgs): MentionOptions["suggestion"] {
  const debouncedFetch = createDebouncedFetcher(types)
  return {
    char,
    pluginKey,
    items: async ({ query }: { query: string }) => debouncedFetch(query),
    render: () => {
      let component: ReactRenderer<ReferenceListRef> | undefined
      let popup: TippyInstance | undefined

      return {
        onStart: (props) => {
          component = new ReactRenderer(ReferenceList, {
            props: { ...props, emptyHint },
            editor: props.editor,
          })
          popup = tippy("body", {
            getReferenceClientRect: () => props.clientRect?.() ?? DOM_RECT_FALLBACK,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
            maxWidth: "none",
          })[0]
        },
        onUpdate(props) {
          component?.updateProps({ ...props, emptyHint })
          popup?.setProps({
            getReferenceClientRect: () => props.clientRect?.() || DOM_RECT_FALLBACK,
          })
        },
        onKeyDown(props) {
          if (props.event.key === "Escape") {
            popup?.hide()
            return true
          }
          if (!component?.ref) return false
          return component.ref.onKeyDown(props)
        },
        onExit() {
          popup?.destroy()
          component?.destroy()
          popup = undefined
          component = undefined
        },
      }
    },
  }
}
