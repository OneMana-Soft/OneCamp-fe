"use client"

// Inspired by react-hot-toast library
import * as React from "react"

import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast"

/**
 * Three on screen (design v3, shell T1). With one, a second toast silently
 * replaced the first, Undo and all: a person about to press Undo watched it
 * vanish because something else had happened.
 */
export const TOAST_LIMIT = 3
/**
 * How long a closed toast stays in the list: long enough for its 200ms exit
 * to finish. It was 1,000 seconds, which only worked while one toast fit.
 */
const TOAST_REMOVE_DELAY = 400

/**
 * What the leading tile says. Errors (the destructive variant) are "error"
 * without asking; anything else is "success" unless it says otherwise.
 * "agent" draws the agent's square, "person" the icon a caller passes (an
 * avatar), and "loading" a spinner with no timer, until an update morphs it
 * into success or error in place.
 */
export type ToastTone = "success" | "error" | "info" | "agent" | "person" | "loading"

type ToasterToast = Omit<ToastProps, "title"> & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
  duration?: number
  tone?: ToastTone
  /** The leading tile's contents, for "person" (an avatar) or anything custom. */
  icon?: React.ReactNode
}

/**
 * How long a toast stays when nobody said (shell T1): 4s, 6s with an action
 * to press, 8s for an error with an action (Retry), and no end while loading.
 * An error without an action stays 6s, not 4s: it has to be read, and it is
 * the toast people most often miss (coordinator's decision, 11 Oct).
 */
export function toastDuration(t: Pick<ToasterToast, "duration" | "action" | "variant" | "tone">): number {
  if (t.duration !== undefined) return t.duration
  if (t.tone === "loading") return Infinity
  const error = t.variant === "destructive" || t.tone === "error"
  if (t.action) return error ? 8000 : 6000
  return error ? 6000 : 4000
}

/**
 * Adds a toast, keeping at most TOAST_LIMIT open. Over the limit, the oldest
 * toast WITHOUT an action goes first, so a new toast never takes away an Undo
 * (or a Retry) the person may be reaching for. Closed toasts on their way out
 * don't count. Pure, for its test.
 */
export function addWithLimit(toasts: ToasterToast[], next: ToasterToast, limit = TOAST_LIMIT): ToasterToast[] {
  // The one that goes is closed, not cut, so it leaves with its exit.
  const list = [next, ...toasts]
  let open = list.filter((t) => t.open !== false)
  while (open.length > limit) {
    const victim = [...open].reverse().find((t) => !t.action) ?? open[open.length - 1]
    list[list.indexOf(victim)] = { ...victim, open: false }
    open = list.filter((t) => t.open !== false)
  }
  return list
}

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes

type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: ToasterToast["id"]
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: ToasterToast["id"]
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: (() => {
          const next = addWithLimit(state.toasts, action.toast)
          // ! Side effect, as DISMISS_TOAST has: whatever the limit closed is
          // removed once its exit has played.
          for (const t of next) if (t.open === false) addToRemoveQueue(t.id)
          return next
        })(),
      }

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const listeners: Array<(state: State) => void> = []

let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

export type Toast = Omit<ToasterToast, "id">

function toast(props: Toast) {
  const id = genId()

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    })
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  dispatch({
    type: "ADD_TOAST",
    toast: {
      // `duration` stays on the toast: the Toaster hands it to the Radix toast,
      // which keeps the time (and pauses it while the toast is hovered or
      // focused). It used to be taken off here and given to a setTimeout,
      // while the Radix toast closed itself at the provider's 5 seconds, so a
      // toast asked for 20 seconds was gone at 5.
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  return {
    id: id,
    dismiss,
    update,
  }
}

const dismissToast = (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId })

function subscribe(listener: (state: State) => void) {
  listeners.push(listener)
  return () => {
    const index = listeners.indexOf(listener)
    if (index > -1) listeners.splice(index, 1)
  }
}

const getSnapshot = () => memoryState
const SERVER_STATE: State = { toasts: [] }
const getServerSnapshot = () => SERVER_STATE

/**
 * The toasts on screen, for the one component that draws them (Toaster).
 */
function useToastState(): State {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * toast() and dismiss() for any component that shows toasts.
 *
 * DOES NOT SUBSCRIBE. It used to hold the toast list in state and listen to
 * every change (re-subscribing on each one), so the 142 components that call
 * it re-rendered, with their children, whenever any toast appeared or closed.
 * `toasts` is still returned for compatibility, as it is at render time;
 * the Toaster reads the live list through useToastState.
 */
function useToast() {
  return {
    toasts: memoryState.toasts,
    toast,
    dismiss: dismissToast,
  }
}

export { useToast, useToastState, toast }
