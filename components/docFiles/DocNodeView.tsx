"use client"

// A folder, a file or a link at its own address (docs F1b): the doc route
// loads this, a chunk of its own, when the doc's info says it isn't a page,
// so a doc's first load doesn't grow and nothing that isn't a page ever
// opens in the editor (F1 point 1). A folder opens in place; a file shows its
// card and opens its preview at once; a link shows its card, whose Open link
// opens the document in a new tab (a browser opens no tab unasked).

import * as React from "react"

import { FolderView, NodeCrumbs, useAncestors, type NodeInfo } from "@/components/docFiles/FolderView"
import { NodeMark } from "@/components/docFiles/NodeMark"
import { copyLinkAddress, downloadVersion, openLink } from "@/components/docFiles/fileActions"
import { useNodeDialogs } from "@/components/docFiles/useNodeDialogs"
import { Button } from "@/components/ui/button"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { atLeast, docLevelOf } from "@/lib/docs/abilities"
import { linkProvider, linkSite } from "@/lib/docs/docNode"
import { Download, ExternalLink, Eye, History, Link2 } from "@/lib/icons"
import { formatFileSizeForAttachment } from "@/lib/utils/format/formatFileSizeForAttachment"
import { versionsKey, versionsOf } from "@/services/docFilesService"
import type { Envelope } from "@/services/docGraphService"
import type { DocFileVersions } from "@/types/docGraph"

/** A file or a link as a card in the middle of its page, under where it is. */
function NodePage({ doc, children }: { doc: NodeInfo; children: React.ReactNode }) {
  const ancestors = useAncestors(doc.doc_uuid)
  return (
    <div data-node-page={doc.doc_node_kind} className="flex h-full min-h-0 flex-col overflow-y-auto bg-sheet">
      <div className="mx-auto w-full max-w-[720px] px-4 pb-20 pt-5 sm:px-8 sm:pt-8">
        <NodeCrumbs ancestors={ancestors} current={doc.doc_title?.trim() || "Untitled"} />
        <section className="content-rise mt-8 flex flex-col items-center gap-3 rounded-2xl bg-raised px-6 py-10 text-center shadow-e1">{children}</section>
      </div>
    </div>
  )
}

function FileNodePage({ doc }: { doc: NodeInfo }) {
  const id = doc.doc_uuid
  const title = doc.doc_title?.trim() || "Untitled"
  const canEdit = atLeast(docLevelOf(doc), "edit")
  const current = versionsOf(useFetch<Envelope<DocFileVersions>>(versionsKey(id), undefined, undefined, OWN_ERRORS).data)[0]
  const dialogs = useNodeDialogs()
  const { open } = dialogs
  const preview = React.useCallback((versions = false) => open({ kind: "preview", file: { id, title, canEdit }, versions }), [open, id, title, canEdit])
  // Opened at its address, a file is opened to be looked at: its preview comes up at once.
  const shown = React.useRef(false)
  React.useEffect(() => {
    if (shown.current) return
    shown.current = true
    preview()
  }, [preview])
  return (
    <NodePage doc={doc}>
      <NodeMark node={{ id, kind: "file", color: doc.doc_color, file: current ? { name: current.name, mime: current.mime } : { name: title } }} size={40} />
      <h1 className="max-w-full truncate text-title-3 font-semibold text-ink">{title}</h1>
      <p className="text-meta tabular-nums text-ink-3">{current ? `Version ${current.n} · ${formatFileSizeForAttachment(current.size_bytes)}` : " "}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button size="sm" className="gap-1.5" onClick={() => preview()}>
          <Eye className="size-3.5" aria-hidden="true" />
          Preview
        </Button>
        <Button size="sm" variant="secondary" className="gap-1.5" disabled={!current} onClick={() => current && void downloadVersion(id, current)}>
          <Download className="size-3.5" aria-hidden="true" />
          Download
        </Button>
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => preview(true)}>
          <History className="size-3.5" aria-hidden="true" />
          See all versions
        </Button>
      </div>
      {dialogs.element}
    </NodePage>
  )
}

function LinkNodePage({ doc }: { doc: NodeInfo }) {
  const url = doc.doc_link_url ?? ""
  const provider = linkProvider(url)
  const title = doc.doc_title?.trim() || linkSite(url) || "Link"
  return (
    <NodePage doc={doc}>
      <NodeMark node={{ id: doc.doc_uuid, kind: "link", color: doc.doc_color, linkUrl: url }} size={40} />
      <h1 className="max-w-full truncate text-title-3 font-semibold text-ink">{title}</h1>
      <p className="flex items-center gap-1.5 text-meta text-ink-3">
        {provider.id !== "site" ? <span>{provider.name} ·</span> : null}
        <span>{linkSite(url)}</span>
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button size="sm" className="gap-1.5" onClick={() => openLink(url)} disabled={!url}>
          <ExternalLink className="size-3.5" aria-hidden="true" />
          Open link
        </Button>
        <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => void copyLinkAddress(url)} disabled={!url}>
          <Link2 className="size-3.5" aria-hidden="true" />
          Copy address
        </Button>
      </div>
    </NodePage>
  )
}

export default function DocNodeView({ doc }: { doc: NodeInfo }) {
  switch (doc.doc_node_kind) {
    case "folder":
      return <FolderView folder={doc} />
    case "file":
      return <FileNodePage doc={doc} />
    case "link":
      return <LinkNodePage doc={doc} />
    default:
      return null
  }
}
