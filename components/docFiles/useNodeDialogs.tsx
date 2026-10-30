"use client"

import * as React from "react"

import type NodeDialogs from "./NodeDialogs"
import type FilePreview from "./FilePreview"
import type { NodeDialog } from "./NodeDialogs"
import { lazyPart } from "@/lib/lazy/lazyPart"
import { OverlayUnavailable } from "@/lib/lazy/overlayUnavailable"

// The dialogs are a chunk of their own, and a file's preview (with the
// lightbox's stage) another, each fetched with the first one a surface opens
// or ahead of it. When a chunk can't come, opening says so and closes, and
// the next open tries again: React.lazy threw to the app's error page, and
// kept the failure for the rest of the visit.
const nodeDialogs = lazyPart<React.ComponentProps<typeof NodeDialogs>>(() => import("./NodeDialogs").then((m) => m.default), {
  placeholder: () => null,
  failed: ({ onClose }) => <OverlayUnavailable title="Couldn't open that" onClose={onClose} />,
})
const filePreview = lazyPart<React.ComponentProps<typeof FilePreview>>(() => import("./FilePreview").then((m) => m.default), {
  placeholder: () => null,
  failed: ({ onClose }) => <OverlayUnavailable title="Couldn't open the file" onClose={onClose} />,
})

/** Fetches the dialogs' code ahead of a press that may open one: a row's menu, as it opens. */
export function warmNodeDialogs(): void {
  void nodeDialogs.warm()
}

/** Fetches a file's preview ahead of the press that opens it, with the dialogs its Replace opens. */
export function warmFilePreview(): void {
  void filePreview.warm()
  void nodeDialogs.warm()
}

/**
 * A surface's Docs & Files dialogs (docs F1b), as a stack: one opened from
 * another (Replace with a new version, from a file's preview) sits over it,
 * and closing it shows the one under it again. Render element where the
 * surface is.
 */
export function useNodeDialogs() {
  const [stack, setStack] = React.useState<NodeDialog[]>([])
  const open = React.useCallback((dialog: NodeDialog) => setStack((s) => [...s, dialog]), [])
  const element = stack.length
    ? stack.map((dialog, i) => {
        const onClose = () => setStack((s) => s.slice(0, i))
        if (dialog.kind !== "preview") return <nodeDialogs.Part key={i} dialog={dialog} onClose={onClose} />
        const { file } = dialog
        const onReplace = file.canEdit ? () => open({ kind: "replace", file: { id: file.id, title: file.title } }) : undefined
        return <filePreview.Part key={i} file={file} versions={dialog.versions} onClose={onClose} onReplace={onReplace} />
      })
    : null
  return { open, element }
}
