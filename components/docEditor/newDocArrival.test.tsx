import { describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"
import * as React from "react"

import { readArrival, useNewDocArrival } from "./newDocArrival"

function Probe({ editor, synced }: { editor: any; synced: boolean }) {
  const ref = React.useRef<HTMLTextAreaElement>(null)
  useNewDocArrival({ editor, synced, titleRef: ref, canEditTitle: true })
  return <textarea ref={ref} defaultValue="Untitled" aria-label="Title" />
}

describe("a doc made a moment ago (content.md D27)", () => {
  it("reads ?new and ?template from the address", () => {
    expect(readArrival("?new=1&template=meeting-notes")).toEqual({ isNew: true, templateId: "meeting-notes" })
    expect(readArrival("")).toEqual({ isNew: false, templateId: null })
  })

  it("focuses and selects the title, then drops the parameter", () => {
    window.history.replaceState(null, "", "/app/doc/x?new=1")
    const { getByLabelText } = render(<Probe editor={null} synced={false} />)
    const t = getByLabelText("Title") as HTMLTextAreaElement
    expect(document.activeElement).toBe(t)
    expect(t.selectionStart).toBe(0)
    expect(t.selectionEnd).toBe("Untitled".length)
    expect(window.location.search).toBe("")
  })

  it("lays a template into the synced, empty doc once, and never into one with text", () => {
    const setContent = vi.fn()
    const empty = { isEditable: true, isEmpty: true, commands: { setContent } }
    window.history.replaceState(null, "", "/app/doc/x?new=1&template=decision-record")
    const { rerender } = render(<Probe editor={empty} synced={false} />)
    expect(setContent).not.toHaveBeenCalled()
    rerender(<Probe editor={empty} synced />)
    expect(setContent).toHaveBeenCalledTimes(1)
    expect(setContent.mock.calls[0][0]).toContain("Decision")
    rerender(<Probe editor={{ ...empty }} synced />)
    expect(setContent).toHaveBeenCalledTimes(1)

    const other = vi.fn()
    window.history.replaceState(null, "", "/app/doc/y?template=meeting-notes")
    render(<Probe editor={{ isEditable: true, isEmpty: false, commands: { setContent: other } }} synced />)
    expect(other).not.toHaveBeenCalled()
  })
})
