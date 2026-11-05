"use client"

import * as React from "react"
import { useHandoff } from "@/hooks/useHandoff"
import BoardPicker from "@/components/board/boardPicker"
import { peekPick, releasePick, PICK_BOARD } from "./pick"

/**
 * Which whiteboard, for "/whiteboard" (miro-34): the boards' own picker
 * (components/board/boardPicker), offering every board the person can open,
 * since the doc shows it read-only to whoever else can open it too. Closed
 * without a choice, whoever asked hears none.
 */
export default function BoardPickerDialog({ onClose }: { docId: string; onClose(): void }) {
  const question = useHandoff(() => peekPick(PICK_BOARD), releasePick)
  const answered = React.useRef(false)

  React.useEffect(() => () => void (!answered.current && question?.answer(null)), [question])
  React.useEffect(() => {
    if (!question) onClose()
  }, [question, onClose])

  if (!question) return null
  return (
    <BoardPicker
      purpose="show"
      onClose={onClose}
      onPick={(id, name) => {
        answered.current = true
        question.answer({ id, name })
      }}
    />
  )
}
