"use client"

// A board's sensitivity label (miro-44 L), off the board's first load: its chip
// (beside the name on a computer, leading the board's cluster on a phone) and
// the picker, which the chip and the board's More open for an editor. It only
// presents: the board's page reads and writes through useLabelling (./labelData).

import type * as React from "react"
import type { Labelling } from "@/lib/labels/labelTypes"
import { SensitivityChip } from "./labelMarks"
import LabelPicker from "./LabelPicker"

// Under 390 px its name would fall to a letter, a broken word: the shield and the dot alone (V-933 F1).
const PHONE = "pointer-events-auto h-8 max-w-[7.5rem] bg-pop shadow-e3 max-[390px]:[&_.truncate]:hidden"

export default function BoardLabel({ labelling, edit, open, onOpen, empty, phone }: { labelling: Labelling; edit: boolean; open: boolean; onOpen: (open: boolean) => void; empty: React.ReactNode; phone?: boolean }) {
  const { label } = labelling
  return (
    <>
      {label ? <SensitivityChip label={label} className={phone ? PHONE : "mx-1"} onOpen={edit ? () => onOpen(true) : undefined} /> : null}
      {open && <LabelPicker labelling={labelling} empty={empty} onClose={() => onOpen(false)} />}
    </>
  )
}
