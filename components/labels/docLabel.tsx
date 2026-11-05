"use client"

// The "doc.label" dialog (miro-44 L): the label picker over a doc, opened from
// its chip (./docLabelChip), More, the phone's sheet or the palette. A doc's
// dialogs load on demand from its registry, so this is the doc's holder: it
// reads and writes through useLabelling (./labelData, with the SWR, axios and
// toast the doc's page already loads) and the picker only presents.

import LabelPicker from "./LabelPicker"
import { useLabelling } from "./labelData"
import { NoLabelsYet } from "./noLabels"

export default function DocLabelDialog({ docId, onClose }: { docId: string; onClose(): void }) {
  const labelling = useLabelling("doc", docId, true)
  return <LabelPicker labelling={labelling} empty={<NoLabelsYet />} onClose={onClose} />
}
