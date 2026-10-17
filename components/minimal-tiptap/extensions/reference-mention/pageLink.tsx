"use client"

import { forwardRef, useImperativeHandle, useMemo, useRef } from "react"
import { Extension, type Editor, type Range } from "@tiptap/core"
import { PluginKey } from "@tiptap/pm/state"
import { Suggestion, type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion"
import { CommandList, CommandTile, type CommandListHandle, type CommandListItem } from "@/components/ui/CommandList"
import { DocIcon } from "@/components/docEditor/DocIcon"
import { busFor } from "@/components/docEditor/registry/commandBus"
import { subpagePrivate } from "@/lib/docCache"
import { Plus } from "@/lib/icons"
import { chipAllowed, suggestionPopup, type SuggestionListExtras } from "../suggestion-popup"
import { trackPos } from "../smart-paste/smartPaste"
import { encodeReferenceId, keptLabel, type ReferenceItem } from "./referenceTypes"
import { createDebouncedFetcher } from "./referenceMentionList"

/** A row of the "[[" list: a page, or a new one named as typed. */
type PageRow = ReferenceItem | { routeId: ""; label: string; refType: "doc"; create: true }

const isNew = (r: PageRow): r is Extract<PageRow, { create: true }> => "create" in r

/** The chip a link to a page is: the "+" menu's, so it reads live and makes a backlink, keeping no title (keptLabel). */
function insertPage(editor: Editor, at: number, id: string) {
  editor
    .chain()
    .focus()
    .insertContentAt(at, [
      { type: "entityMention", attrs: { id: encodeReferenceId("doc", id), label: keptLabel({ refType: "doc", label: "" }, true), mentionSuggestionChar: "+" } },
      { type: "text", text: " " },
    ])
    .run()
}

/** A new page under this one, named as typed, linked where "[[" was. A page that can't be made is said by the request layer. */
async function linkNewPage(editor: Editor, at: number, title: string) {
  const docId = busFor(editor)?.docId
  if (!docId) return
  const place = trackPos(editor, at)
  try {
    const { createDoc } = await import("@/services/docGraphService")
    const page = await createDoc({ doc_title: title, parent_uuid: docId, doc_private: subpagePrivate(docId) })
    const pos = place.pos()
    if (pos !== null && !editor.isDestroyed) insertPage(editor, pos, page.doc_uuid)
  } catch {
    // Said by the request layer.
  } finally {
    place.stop()
  }
}

interface PageListProps extends SuggestionProps, SuggestionListExtras {
  items: PageRow[]
}

const PageList = forwardRef<{ onKeyDown: (p: SuggestionKeyDownProps) => boolean }, PageListProps>(function PageList(props, ref) {
  const list = useRef<CommandListHandle>(null)
  const rows: CommandListItem[] = useMemo(
    () =>
      props.items.map((r) =>
        isNew(r)
          ? { id: "new", label: `New page “${r.label}”`, meta: "Under this page", tile: <CommandTile><Plus /></CommandTile> }
          : { id: r.routeId, label: r.label, meta: r.subtitle, tile: <CommandTile><DocIcon size={16} /></CommandTile> },
      ),
    [props.items],
  )
  useImperativeHandle(ref, () => ({ onKeyDown: ({ event }) => list.current?.onKeyDown(event) ?? false }))
  return (
    <div data-page-link-list="">
      <CommandList
        ref={list}
        comboboxFor={props.comboboxFor}
        label="Link a page"
        className="w-80"
        maxHeight={8 * 44 + 8}
        items={rows}
        query={props.query}
        onSelect={(row) => props.command(props.items[rows.indexOf(row)])}
        empty={<span className="text-ink-3">Type a page&apos;s name</span>}
      />
    </div>
  )
})

/**
 * "[[" links a page (docs C1, small-details L18): the pages called what's
 * typed that the reader may open, and "New page" to make one under this one.
 * Either becomes the "+" menu's page chip, live, and the linked page lists
 * this one in its backlinks.
 */
export const PageLink = Extension.create({
  name: "pageLink",

  addProseMirrorPlugins() {
    const pages = createDebouncedFetcher(["doc"])
    return [
      Suggestion<PageRow>({
        editor: this.editor,
        pluginKey: new PluginKey("pageLink"),
        char: "[[",
        allowSpaces: true,
        allow: chipAllowed("entityMention"),
        // One search when the typing pauses (the "+" menu's); a key superseded never answers.
        items: ({ query }) => {
          const q = query.replace(/\]+$/, "").trim()
          return q ? pages(q).then((found): PageRow[] => [...found, { routeId: "", label: q, refType: "doc", create: true }]) : []
        },
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: PageRow }) => {
          editor.chain().focus().deleteRange(range).run()
          if (isNew(props)) void linkNewPage(editor, range.from, props.label)
          else insertPage(editor, range.from, props.routeId)
        },
        render: suggestionPopup({
          component: PageList,
          isEmpty: (props) => props.items.length === 0,
        }),
      }),
    ]
  },
})
