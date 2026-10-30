"use client"

import type { ComponentProps } from "react"
import { useParams } from "next/navigation"
import { DocPageSkeleton } from "@/components/doc/DocPageSkeleton"
import type DocNodeView from "@/components/docFiles/DocNodeView"
import { ErrorState } from "@/components/ui/error-state"
import { DocView, useDocInfo } from "@/components/views/DocView"
import { lazyPart } from "@/lib/lazy/lazyPart"

// A folder, a file or a link opens from a chunk of its own, so a page's first
// load doesn't carry it. While it comes the doc's skeleton holds the page, as
// the route's loading does; when it can't come the page says so, with Try
// again, and the app around it carries on.
const nodeView = lazyPart<ComponentProps<typeof DocNodeView>>(() => import("@/components/docFiles/DocNodeView").then((m) => m.default), {
  placeholder: DocPageSkeleton,
  failed: ({ doc, retry }) => <ErrorState className="h-full" subject={`this ${doc.doc_node_kind}`} onRetry={retry} />,
})

export default function Page() {
  const id = useParams()?.["doc-id"] as string
  const info = useDocInfo(id).data?.data
  return info?.doc_node_kind ? <nodeView.Part doc={info} /> : <DocView docId={id} />
}
