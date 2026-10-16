import { describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"
import * as React from "react"

import { readArrival, useNewDocArrival } from "./newDocArrival"

function Probe({ editor, synced, value = "" }: { editor: unknown; synced: boolean; value?: string }) {
  const ref = React.useRef<HTMLTextAreaElement>(null)
  useNewDocArrival({ editor: editor as never, synced, titleRef: ref, canEditTitle: true })
  return <textarea ref={ref} defaultValue={value} placeholder="Untitled" aria-label="Title" />
}

describe("a doc made a moment ago (content.md D27)", () => {
  it("reads ?new from the address", () => {
    expect(readArrival("?new=1")).toEqual({ isNew: true })
    expect(readArrival("")).toEqual({ isNew: false })
  })

  it("focuses and selects the title, then drops the parameter", () => {
    window.history.replaceState(null, "", "/app/doc/x?new=1")
    const { getByLabelText } = render(<Probe editor={null} synced={false} value="Meeting notes" />)
    const t = getByLabelText("Title") as HTMLTextAreaElement
    expect(document.activeElement).toBe(t)
    expect(t.selectionStart).toBe(0)
    expect(t.selectionEnd).toBe("Meeting notes".length)
    expect(window.location.search).toBe("")
  })

  // N37: a template's body is the server's to write, as it makes the doc. Two
  // tabs opening the new doc together each laid it in when the client did.
  it("never lays a template into the doc, and drops an old link's ?template", () => {
    const setContent = vi.fn()
    const empty = { isEditable: true, isEmpty: true, commands: { setContent } }
    window.history.replaceState(null, "", "/app/doc/x?new=1&template=decision-record")
    const { rerender } = render(<Probe editor={empty} synced={false} />)
    rerender(<Probe editor={empty} synced />)
    rerender(<Probe editor={{ ...empty }} synced />)
    expect(setContent).not.toHaveBeenCalled()
    expect(window.location.search).toBe("")
  })
})
