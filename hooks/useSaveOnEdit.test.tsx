import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { useEffect } from "react"
import { useSaveOnEdit } from "@/hooks/useSaveOnEdit"

// A field's save comes from the person's edit, never from the component's own
// state (PROJ-BUG-1: the task panel saved its empty first state over a task's
// tags on mount).

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

type Edit = (value: string) => void

function Field({ save, id, onEdit }: { save: (value: string) => void; id: string; onEdit: (edit: Edit) => void }) {
  const edit = useSaveOnEdit(save, { delay: 500, key: id })
  useEffect(() => onEdit(edit), [edit, onEdit])
  return null
}

function field(save: (value: string) => void, id = "a") {
  let edit: Edit = () => {}
  const onEdit = (e: Edit) => (edit = e)
  const view = render(<Field save={save} id={id} onEdit={onEdit} />)
  return { view, edit: (v: string) => edit(v), rerender: (s: typeof save, next = id) => view.rerender(<Field save={s} id={next} onEdit={onEdit} />) }
}

describe("useSaveOnEdit", () => {
  it("saves nothing on mount or on a render", () => {
    vi.useFakeTimers()
    const save = vi.fn()
    const f = field(save)
    f.rerender(save)
    act(() => void vi.advanceTimersByTime(2000))
    expect(save).not.toHaveBeenCalled()
  })

  it("saves the last edit once, half a second after it", () => {
    vi.useFakeTimers()
    const save = vi.fn()
    const f = field(save)
    act(() => {
      f.edit("fro")
      f.edit("frontend")
    })
    act(() => void vi.advanceTimersByTime(499))
    expect(save).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(1))
    expect(save.mock.calls).toEqual([["frontend"]])
  })

  it("saves an edit still waiting when it goes, or moves to another key, with the save it was made with", () => {
    vi.useFakeTimers()
    const saveA = vi.fn()
    const saveB = vi.fn()
    const f = field(saveA, "a")
    act(() => f.edit("frontend"))
    f.rerender(saveB, "b")
    expect(saveA.mock.calls).toEqual([["frontend"]])
    expect(saveB).not.toHaveBeenCalled()
    act(() => f.edit("design"))
    f.view.unmount()
    expect(saveB.mock.calls).toEqual([["design"]])
  })
})
