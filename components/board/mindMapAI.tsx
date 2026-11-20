"use client"

// Expand with AI on a mind map node (miro-15): the AI edition's add-on to the shared bar's More (lib/addOns/mindMap.ts).
// AI-only (lib/editionBoundary.test.ts AI_ONLY): the AI-free line leaves this file out, and its bar offers no AI.
// Who: the bar shows only to board editors; this shows where Ask AI shows, and the server answers under the same rights.
import * as React from "react"
import axiosInstance from "@/lib/axiosInstance"
import { useToast } from "@/hooks/use-toast"
import { provideAddOns, type AddOnAction, type MindMapNodeOffer } from "@/lib/addOns/core"
import { AI_NO_RESULT } from "@/lib/board/boardAI"
import { Spark } from "@/components/ui/graphics/motifs"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { BoardsPost } from "@/services/endpoints/boards"

const TITLE = "Expand with AI"

/** Asks once for the node's subtopics and adds the answer's ideas under it, as one change. */
function useExpandWithAI(offer: MindMapNodeOffer): AddOnAction[] {
  const { toast } = useToast()
  const [busy, setBusy] = React.useState(false)
  const run = async () => {
    if (offer.held || !offer.ready(TITLE)) return
    setBusy(true)
    offer.working(true)
    try {
      const { node, root } = await offer.words()
      const prompt = root ? `Subtopics of "${node}" in a mind map of "${root}"` : `Subtopics of "${node}"`
      const res = await axiosInstance.post(BoardsPost.GenerateBoardDiagram, { board_uuid: offer.boardId, prompt, type: "mindmap" })
      const made = await offer.grow(res.data?.data, node)
      if (made === null) return offer.refuse(TITLE, AI_NO_RESULT)
      toast({ title: `Added ${made} ideas`, description: `Under "${node}".` })
    } catch (e) {
      offer.refuse(TITLE, apiErrorMessage(e, AI_NO_RESULT))
    } finally {
      setBusy(false)
      offer.working(false)
    }
  }
  return [{ key: "expand", label: busy ? "Expanding…" : TITLE, icon: Spark, busy, run: () => void run() }]
}

provideAddOns({ useMindMapNode: useExpandWithAI })
