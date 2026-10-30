"use client"

// A folder, opened in place (docs F1b; Basecamp's Docs & Files): where it is
// (a breadcrumb up to Docs), its tile and name, how many things it holds,
// and its contents at full width, as the doc tree draws them (pages,
// folders, files, links, each opening its own way; rows chosen together,
// coloured or moved at once). New doc ▾ adds a page, a folder, files or a
// link to it; files dropped anywhere on it upload into it, or into a folder
// in it they're dropped on. Empty, it says so in the docs area's hue and
// takes files there too.

import * as React from "react"
import { useRouter } from "next/navigation"

import { DocTree, adapterFor } from "@/components/docTree/DocTree"
import { DocRowMenu } from "@/components/docTree/DocRowMenu"
import { FileDropZone } from "@/components/docFiles/FileDropZone"
import { NewSplitButton } from "@/components/docFiles/NewMenu"
import { NodeLink } from "@/components/docFiles/NodeLink"
import { NodeMark } from "@/components/docFiles/NodeMark"
import { IntentLink } from "@/components/navigationBar/desktop/IntentLink"
import type { MoveStop } from "@/lib/docMove"
import { seedNodeInfo } from "@/components/docFiles/fileActions"
import { useFilePicker } from "@/components/docFiles/useFilePicker"
import { useNodeDialogs } from "@/components/docFiles/useNodeDialogs"
import { useCreateDoc } from "@/components/doc/useCreateDoc"
import { readLimit, useTreeLevel } from "@/components/tree/useTree"
import { Button } from "@/components/ui/button"
import { SpotDocs } from "@/components/ui/graphics"
import { swatchName } from "@/components/ui/campSwatches"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import type { CampHue } from "@/lib/campHue"
import { atLeast, docLevelOf } from "@/lib/docs/abilities"
import { ChevronRight, Upload } from "@/lib/icons"
import { ancestorsKey, type Envelope } from "@/services/docGraphService"
import type { DocInfoInterface } from "@/types/doc"
import type { DocAncestors, DocNodeFields, TreeNodeJSON } from "@/types/docGraph"
import { app_doc_path } from "@/types/paths"

/**
 * The docs area's hue: what its empty states wear (SpaceDocs' too). Moves to
 * areaHue("docs") once lib/areas lands.
 */
export const DOCS_HUE: CampHue = "sky"

/** A level of a folder's contents, as many as the page shows before "Show more". */
const PAGE_CAP = 50

export type NodeInfo = DocInfoInterface & DocNodeFields

/** The way up to a node, from the server's ancestors: the pages and folders above it, top first. */
export function useAncestors(id: string): TreeNodeJSON[] {
  return useFetch<Envelope<DocAncestors>>(ancestorsKey(id), undefined, undefined, OWN_ERRORS).data?.data?.ancestors ?? []
}

/**
 * Where a node is: Docs, the pages and folders above it (a folder among them
 * opens in place), and the node itself, the current place. One the viewer
 * can't open is "…". On a phone, where the bar names the node, only its parent.
 * Each fetches its route when it is about to be followed, never on sight: a
 * page above through IntentLink (with its live copy), a folder through
 * NodeLink.
 */
export function NodeCrumbs({ ancestors, current }: { ancestors: TreeNodeJSON[]; current: string }) {
  const router = useRouter()
  const crumbs = ancestors.filter((a) => a.uuid || a.redacted)
  return (
    <nav aria-label="Breadcrumb" data-node-crumbs="" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-ui-sm text-ink-3">
        <li className="shrink-0 max-sm:hidden">
          <NodeLink href={app_doc_path} className="rounded-md px-1 py-0.5 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand">
            Docs
          </NodeLink>
        </li>
        {crumbs.map((a, i) => {
          const Crumb = a.node_kind ? NodeLink : IntentLink
          return (
            <li key={a.uuid ?? `hidden-${i}`} className={i < crumbs.length - 1 ? "flex min-w-0 items-center gap-1 max-sm:hidden" : "flex min-w-0 items-center gap-1"}>
              <ChevronRight className="size-3.5 shrink-0 text-ink-4 max-sm:hidden" aria-hidden="true" />
              {a.redacted || !a.uuid ? (
                <span className="px-1">…</span>
              ) : (
                <Crumb
                  href={`${app_doc_path}/${a.uuid}`}
                  onClick={(e) => {
                    // A folder above opens in place, known as one before its page asks.
                    if (a.node_kind && !e.metaKey && !e.ctrlKey) {
                      e.preventDefault()
                      seedNodeInfo(a)
                      router.push(`${app_doc_path}/${a.uuid}`)
                    }
                  }}
                  className="min-w-0 truncate rounded-md px-1 py-0.5 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {a.title?.trim() || "Untitled"}
                </Crumb>
              )}
            </li>
          )
        })}
        <li className="flex min-w-0 items-center gap-1 max-sm:hidden">
          <ChevronRight className="size-3.5 shrink-0 text-ink-4" aria-hidden="true" />
          <span aria-current="page" className="min-w-0 truncate px-1 font-medium text-ink-2">
            {current}
          </span>
        </li>
      </ol>
    </nav>
  )
}

function FolderEmpty({ title, canEdit, onUpload }: { title: string; canEdit: boolean; onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center" data-folder-empty="">
      <span data-empty-illustration="" data-hue={DOCS_HUE}>
        <SpotDocs size={96} hue={DOCS_HUE} />
      </span>
      <h2 className="mt-4 text-heading text-ink">This folder is empty</h2>
      <p className="mt-1 max-w-[42ch] text-ui text-ink-2">
        {canEdit ? `Drop files here to upload them to “${title}”, or add a page, a folder or a link with New doc.` : `Nothing has been put in “${title}” yet.`}
      </p>
      {canEdit ? (
        <Button variant="secondary" size="sm" className="mt-5 gap-1.5" onClick={onUpload}>
          <Upload className="size-3.5" aria-hidden="true" />
          Upload files
        </Button>
      ) : null}
    </div>
  )
}

export function FolderView({ folder }: { folder: NodeInfo }) {
  const id = folder.doc_uuid
  const title = folder.doc_title?.trim() || "Untitled folder"
  const canEdit = atLeast(docLevelOf(folder), "edit")
  const ancestors = useAncestors(id)
  const parent = ancestors.length ? ancestors[ancestors.length - 1].uuid ?? null : null
  // Its contents' top level: the tree reads the same cached answer.
  const { level } = useTreeLevel(adapterFor("workspace"), id, readLimit(PAGE_CAP))
  const empty = !!level && level.nodes.length === 0 && level.hidden === 0
  const { create, busy } = useCreateDoc()
  const dialogs = useNodeDialogs()
  const picker = useFilePicker()
  const place = { parentId: id, parentPrivate: folder.doc_private }
  const moveStart: MoveStop[] = [...ancestors.filter((a) => a.uuid).map((a) => ({ id: a.uuid!, title: a.title ?? "" })), { id, title }]
  const count = level ? level.count + level.hidden : null

  return (
    <div data-folder-view={id} className="flex h-full min-h-0 flex-col overflow-y-auto bg-sheet">
      <FileDropZone place={{ parent: id }} label={title} className="mx-auto flex w-full max-w-[920px] flex-1 flex-col rounded-none px-4 pb-20 pt-5 sm:px-8 sm:pt-8">
        <NodeCrumbs ancestors={ancestors} current={title} />
        <header className="mt-3 flex items-center gap-3">
          <NodeMark node={{ id, kind: "folder", color: folder.doc_color }} size={40} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-title-2 font-semibold tracking-tight text-ink">{title}</h1>
            <p className="text-meta tabular-nums text-ink-3" data-folder-meta="">
              {count === null ? " " : `${count} ${count === 1 ? "item" : "items"}${folder.doc_color ? ` · ${swatchName(folder.doc_color)}` : ""}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {canEdit ? (
              <NewSplitButton
                running={busy}
                own={`folder:${id}`}
                onPage={() => void create({ parentId: id, parentPrivate: folder.doc_private, busyKey: `folder:${id}` })}
                onFolder={() => dialogs.open({ kind: "folder", place })}
                onUpload={() => picker.pick({ parent: id }, title)}
                onLink={() => dialogs.open({ kind: "link", place })}
              />
            ) : null}
            <DocRowMenu
              doc={{ id, title: folder.doc_title ?? "" }}
              canEdit={canEdit}
              node={{ kind: "folder", color: folder.doc_color }}
              act={{
                colourSheet: () => dialogs.open({ kind: "colour", ids: [id], current: folder.doc_color, title }),
                // Moved from its own page: the way up it is known only as far as its parent.
                move: parent ? () => dialogs.open({ kind: "move", items: [{ id, title, from: parent }], start: moveStart.slice(0, -1) }) : undefined,
                upload: () => picker.pick({ parent: id }, title),
                addLink: () => dialogs.open({ kind: "link", place }),
              }}
              focusable
              className="size-8 rounded-lg"
            />
          </div>
        </header>
        <div className="mt-6 min-h-[50vh]">
          {empty ? (
            <FolderEmpty title={title} canEdit={canEdit} onUpload={() => picker.pick({ parent: id }, title)} />
          ) : (
            <DocTree
              space="workspace"
              root={{ id, parent }}
              label={title}
              dense={false}
              cap={PAGE_CAP}
              selectable
              moveStart={moveStart}
            />
          )}
        </div>
      </FileDropZone>
      {picker.element}
      {dialogs.element}
    </div>
  )
}
