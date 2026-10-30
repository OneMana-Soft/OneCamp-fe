"use client"

// Docs & Files' dialogs (docs F1b), one chunk, loaded the first time one
// opens: a new folder, a link, a colour on a phone, a file's new version, and
// Move to…. Each is a dialog on a computer and the shared sheet on a phone
// (components/docEditor/chrome/Sheet), its buttons in the footer. A file's
// preview is a chunk of its own, with the lightbox's stage (useNodeDialogs).

import type { PreviewFile } from "./FilePreview"
import { AddLinkDialog } from "./AddLinkDialog"
import { ColourSheet } from "./ColourSheet"
import { NewFolderDialog } from "./NewFolderDialog"
import { ReplaceVersionDialog } from "./ReplaceVersionDialog"
import MoveToDialog from "@/components/docEditor/MoveToDialog"
import type { MoveItem, MoveStop } from "@/lib/docMove"
import type { CampHue } from "@/lib/campHue"
import type { NodePlace } from "@/services/docFilesService"
import type { DocSpace } from "@/types/docGraph"

/** A file as its dialogs need it. */
export interface FileRef {
  id: string
  title: string
}

export type NodeDialog =
  | { kind: "folder"; place: NodePlace }
  | { kind: "link"; place: NodePlace }
  | { kind: "colour"; ids: string[]; current?: CampHue | null; title?: string }
  | { kind: "replace"; file: FileRef }
  | { kind: "move"; items: MoveItem[]; space?: DocSpace; start: MoveStop[] }
  | { kind: "preview"; file: PreviewFile; versions?: boolean }

/**
 * One dialog of the stack a surface keeps (useNodeDialogs): a dialog opened
 * from another (Replace with a new version, from a preview) sits over it, and
 * closing it shows the one under it again.
 */
export default function NodeDialogs({ dialog, onClose }: { dialog: Exclude<NodeDialog, { kind: "preview" }>; onClose: () => void }) {
  switch (dialog.kind) {
    case "folder":
      return <NewFolderDialog place={dialog.place} onClose={onClose} />
    case "link":
      return <AddLinkDialog place={dialog.place} onClose={onClose} />
    case "colour":
      return <ColourSheet ids={dialog.ids} current={dialog.current} title={dialog.title} onClose={onClose} />
    case "replace":
      return <ReplaceVersionDialog file={dialog.file} onClose={onClose} />
    case "move":
      return <MoveToDialog items={dialog.items} space={dialog.space} start={dialog.start} onClose={onClose} />
  }
}
