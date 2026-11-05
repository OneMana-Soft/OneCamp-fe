"use client"

// A doc's sensitivity label beside its title (miro-44 L): the titleChips slot,
// in the header on a computer and the title band elsewhere. A doc's slots load
// on demand from its registry, so this is the chip's holder: it reads the label
// through ./labelData's useItemLabel (the doc's page already loads SWR) and the
// chip only presents. For someone who can edit the doc it opens the "doc.label"
// dialog (./docLabel), which More, the phone's sheet and the palette open too
// (components/docEditor/chrome).

import { useDocBus } from "@/components/docEditor/registry/docBusContext"
import type { SlotProps } from "@/components/docEditor/registry/types"
import { useDoc } from "@/components/docEditor/chrome/useDoc"
import { useItemLabel } from "./labelData"
import { SensitivityChip } from "./labelMarks"

export default function DocLabelChip({ docId }: SlotProps) {
  const doc = useDoc(docId)
  const bus = useDocBus()
  const label = useItemLabel("doc", docId)
  const canEdit = (doc?.doc_edit_access ?? 0) > 0
  return label ? <SensitivityChip label={label} className="ml-1" onOpen={canEdit ? () => bus.emit("openDialog", { id: "doc.label" }) : undefined} /> : null
}
