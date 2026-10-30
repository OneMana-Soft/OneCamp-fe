"use client"

import * as React from "react"
import type { SlotProps } from "@/components/docEditor/registry/types"
import { useClientConfig } from "@/hooks/useClientConfig"
import { pasteMenuOf } from "../smart-paste/smartPaste"
import { setUploadLimit } from "../file-block/uploadLimit"
import { lazyPiece } from "@/lib/lazy/lazyPiece"

const PasteMenu = lazyPiece(() => import("./PasteMenu"))

/**
 * Over a doc's editor, once per editor (A1's editorOverlay slot): the menu a
 * pasted link opens (drawn the first time one does), and the workspace's
 * upload limit, which a dropped file is checked against before it is sent
 * (N27).
 */
export default function LinksMediaOverlay({ editor }: SlotProps) {
  const { upload_limit_bytes: bytes, upload_limit_mb: mb } = useClientConfig()
  React.useEffect(() => setUploadLimit({ bytes, mb }), [bytes, mb])

  const open = React.useSyncExternalStore(
    React.useCallback(
      (onChange: () => void) => {
        if (!editor) return () => {}
        editor.on("transaction", onChange)
        return () => void editor.off("transaction", onChange)
      },
      [editor],
    ),
    () => !!editor && !editor.isDestroyed && pasteMenuOf(editor.state) !== null,
    () => false,
  )

  if (!editor || !open) return null
  return (
    <React.Suspense fallback={null}>
      <PasteMenu editor={editor} />
    </React.Suspense>
  )
}
