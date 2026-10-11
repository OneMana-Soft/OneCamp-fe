"use client"

import { useCallback } from "react"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import type { ConfirmIcon } from "@/components/dialog/confirmAlertDialog"

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
  /**
   * The safe button's words, when "Cancel" would be ambiguous: a confirm whose
   * action is itself a cancel ("Cancel import") names what the other button
   * keeps ("Keep importing").
   */
  cancelText?: string
  /** The action loses something (deletes, removes, revokes): its button is drawn in the danger colour. */
  destructive?: boolean
  /**
   * The glyph on the confirm's tile (design v3, admin §8 H3). Left out, it is
   * picked from the words: power to stop, user-minus to take a person out, a
   * bin to delete, a question mark for a safe question.
   */
  icon?: ConfirmIcon
  /**
   * Type-to-confirm (H4), for an action that destroys data or access for many
   * people: the action stays disabled until this phrase (a workspace's name,
   * a provider's) is typed exactly.
   */
  requireText?: string
  /**
   * Runs on confirm. Return the request's promise to keep the dialog open,
   * with a spinner in the action, until the server answers; a rejection's
   * reason then shows inside the dialog. Return nothing and it closes at once.
   */
  onConfirm: () => unknown
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
            cancelText: opts.cancelText,
            destructive: opts.destructive === true,
            icon: opts.icon,
            requireText: opts.requireText,
            onConfirm: opts.onConfirm,
          },
        }),
      )
    },
    [dispatch],
  )
}
