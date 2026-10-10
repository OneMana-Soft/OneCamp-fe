"use client"

import { useCallback } from "react"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"

// useConfirm returns an async-friendly confirm() that opens the app's themed
// confirmation dialog (rendered by UnifiedUIManager via the `confirmAlert` UI
// slice) instead of the browser's blocking window.confirm. Pass the destructive
// action as onConfirm; it runs only when the user confirms.
//
// Why: window.confirm is synchronous, unstyled, blocks the main thread, is
// suppressed in some embedded/PWA contexts, and breaks the Notion-like feel.
// This routes every confirmation through one accessible, on-brand dialog.
interface ConfirmOptions {
  title: string
  description: string
  confirmText?: string
  /** The action loses something (deletes, removes, revokes): its button is drawn in the danger colour. */
  destructive?: boolean
  onConfirm: () => void
}

export function useConfirm() {
  const dispatch = useDispatch()
  return useCallback(
    (opts: ConfirmOptions) => {
      dispatch(
        openUI({
          key: "confirmAlert",
          data: {
            title: opts.title,
            description: opts.description,
            confirmText: opts.confirmText || "Confirm",
            destructive: opts.destructive === true,
            onConfirm: opts.onConfirm,
          },
        }),
      )
    },
    [dispatch],
  )
}
