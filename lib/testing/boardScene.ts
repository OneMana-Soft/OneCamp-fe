/**
 * A board's scene for a test, without a canvas: the parts of Excalidraw's
 * imperative API the board's tools call, over a plain list of elements.
 * updateScene keeps every write (its elements and how it is to be undone),
 * so a test reads what a tool did, and listeners hear each change the way
 * Excalidraw tells them (a new array when the elements change).
 *
 * Also a stand-in for Excalidraw's convertToExcalidrawElements, for tests
 * that mock "@excalidraw/excalidraw": a note skeleton becomes its rectangle
 * and its bound text, as the real converter makes them.
 */

import { act } from "@testing-library/react"

export interface TestElement {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  version: number
  versionNonce?: number
  isDeleted?: boolean
  [key: string]: unknown
}

type Listener = (elements: readonly unknown[], appState: Record<string, unknown>) => void

export function boardScene(elements: TestElement[] = [], appState: Record<string, unknown> = {}) {
  let els: TestElement[] = elements
  let state: Record<string, unknown> = {
    scrollX: 0,
    scrollY: 0,
    zoom: { value: 1 },
    width: 1000,
    height: 800,
    offsetLeft: 0,
    offsetTop: 0,
    selectedElementIds: {},
    editingTextElement: null,
    isLoading: false,
    ...appState,
  }
  const listeners = new Set<Listener>()
  const writes: { elements?: TestElement[]; appState?: Record<string, unknown>; captureUpdate?: string }[] = []
  // The array listeners last heard (the scene's own, until a write replaces it): a move in place hands them this
  // same array again, as Excalidraw does.
  let heard: readonly TestElement[] = els.filter((e) => !e.isDeleted)
  const emit = () => {
    heard = els.filter((e) => !e.isDeleted)
    listeners.forEach((l) => l(heard, state))
  }
  const api = {
    getSceneElements: () => els.filter((e) => !e.isDeleted),
    getSceneElementsIncludingDeleted: () => els,
    getAppState: () => state,
    updateScene: (scene: { elements?: TestElement[]; appState?: Record<string, unknown>; captureUpdate?: string }) => {
      writes.push(scene)
      if (scene.elements) els = [...scene.elements]
      if (scene.appState) state = { ...state, ...scene.appState }
      emit()
    },
    onChange: (cb: Listener) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    onScrollChange: () => () => {},
    scrollToContent: () => {},
    setActiveTool: (tool: { type: string }) => {
      state = { ...state, activeTool: tool }
    },
    addFiles: () => {},
    getFiles: () => ({}),
  }
  return {
    api: api as never,
    writes,
    elements: () => els,
    byId: (id: string) => els.find((e) => e.id === id),
    /** Tells listeners, as a pan does: the same elements, a new camera. */
    pan: () => emit(),
    select: (ids: string[]) => {
      state = { ...state, selectedElementIds: Object.fromEntries(ids.map((id) => [id, true])) }
      emit()
    },
    /** Tells listeners someone is typing an element's words (Excalidraw's editingTextElement), or no longer: null. */
    typing: (el: TestElement | null) => {
      state = { ...state, editingTextElement: el }
      emit()
    },
    /**
     * Moves elements as Excalidraw does on a frame of a drag or an arrow key's nudge: IN PLACE (x and y, and the
     * version up), and listeners hear the SAME array as before, which Excalidraw keeps until a move ends. `how` is
     * the move's appState while it lasts ({ selectedElementsAreBeingDragged: true }, isResizing or isRotating), none
     * for a nudge; drop() ends a move.
     */
    move: (ids: string[], dx: number, dy: number, how: Record<string, unknown> = {}) => {
      for (const e of els)
        if (ids.includes(e.id)) {
          e.x += dx
          e.y += dy
          e.version += 1
        }
      state = { ...state, ...how }
      // Inside act, as a test's own change: what the listeners set is drawn before the test reads it.
      act(() => listeners.forEach((l) => l(heard, state)))
    },
    /** A move by hand ends, as at Excalidraw's pointer-up: the move's appState clears, and the array is a new one. */
    drop: () => {
      state = { ...state, selectedElementsAreBeingDragged: false, isResizing: false, isRotating: false }
      els = [...els]
      act(emit)
    },
  }
}

let seq = 0

/**
 * convertToExcalidrawElements, as far as the board's tools use it: notes (with their labels), text, frames. A label
 * wraps at its shape's width less 10 px, 0.6 em a letter and 1.25 em a line, and a shape too short for its words
 * grows to hold them (5 px above and below), as Excalidraw's converter grows it.
 */
export function convertForTest(skeletons: Record<string, unknown>[]): TestElement[] {
  return layInFace(skeletons, 0.6)
}

/** convertForTest in a face whose letters are `letter` em wide: the face the words are measured in, as one that lands late. */
export function convertInFace(letter: number): (skeletons: Record<string, unknown>[]) => TestElement[] {
  return (skeletons) => layInFace(skeletons, letter)
}

function layInFace(skeletons: Record<string, unknown>[], letter: number): TestElement[] {
  const out: TestElement[] = []
  for (const sk of skeletons) {
    const base = { version: 1, versionNonce: ++seq, isDeleted: false, frameId: null, groupIds: [], index: null }
    if (sk.type === "rectangle" && sk.label) {
      const label = sk.label as { text: string; fontSize: number; strokeColor: string; fontFamily?: number }
      const textId = `${sk.id}-text`
      const { label: _label, ...rect } = sk
      void _label
      const perLine = Math.max(1, Math.floor(((sk.width as number) - 10) / (label.fontSize * letter)))
      const wordsHeight = Math.max(1, Math.ceil(label.text.length / perLine)) * label.fontSize * 1.25
      const height = Math.max(sk.height as number, wordsHeight + 10)
      out.push({ ...base, ...(rect as object), height, boundElements: [{ type: "text", id: textId }] } as unknown as TestElement)
      out.push({
        ...base,
        id: textId,
        type: "text",
        x: (sk.x as number) + 10,
        y: (sk.y as number) + 10,
        width: (sk.width as number) - 20,
        height: wordsHeight,
        text: label.text,
        originalText: label.text,
        fontSize: label.fontSize,
        fontFamily: label.fontFamily ?? 5,
        strokeColor: label.strokeColor,
        containerId: sk.id,
      })
    } else {
      out.push({ ...base, x: 0, y: 0, width: 100, height: 100, ...(sk as object) } as unknown as TestElement)
    }
  }
  return out
}
