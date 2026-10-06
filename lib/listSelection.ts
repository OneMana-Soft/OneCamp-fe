/**
 * Which task a list has highlighted (the keyboard's place) and which are
 * selected, kept outside React so a key press re-renders only the rows whose
 * state changed, not the whole list (lists of hundreds stay instant). Pure,
 * for its test; hooks/useListSelection binds it to components.
 */

export interface SelectionState {
  highlighted: string | null
  selected: ReadonlySet<string>
  /** Where a Shift run starts: the last task picked on its own. */
  anchor: string | null
}

export type SelectionStore = ReturnType<typeof createSelectionStore>

export function createSelectionStore() {
  let state: SelectionState = { highlighted: null, selected: new Set(), anchor: null }
  const listeners = new Set<() => void>()
  const set = (next: Partial<SelectionState>) => {
    state = { ...state, ...next }
    listeners.forEach((l) => l())
  }
  return {
    get: () => state,
    subscribe: (l: () => void) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    highlight: (id: string | null) => {
      if (id !== state.highlighted) set({ highlighted: id })
    },
    /** Picks or unpicks one task, which becomes where a Shift run starts. */
    toggle: (id: string) => {
      const selected = new Set(state.selected)
      if (selected.has(id)) selected.delete(id)
      else selected.add(id)
      set({ selected, anchor: id })
    },
    /** Adds a run (Shift), keeping what was already picked; `from` starts later runs if none has started. */
    addRun: (ids: string[], from?: string) => {
      const anchor = state.anchor ?? from ?? null
      if (ids.every((id) => state.selected.has(id)) && anchor === state.anchor) return
      set({ selected: new Set([...state.selected, ...ids]), anchor })
    },
    clear: () => {
      if (state.selected.size > 0 || state.anchor !== null) set({ selected: new Set(), anchor: null })
    },
    /** Drops what is no longer listed (another page, a filter): nothing is changed out of sight. */
    keepOnly: (ids: ReadonlySet<string>) => {
      const selected = new Set([...state.selected].filter((id) => ids.has(id)))
      const highlighted = state.highlighted && ids.has(state.highlighted) ? state.highlighted : null
      if (selected.size !== state.selected.size || highlighted !== state.highlighted) set({ selected, highlighted })
    },
  }
}
